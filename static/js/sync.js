/**
 * JIRA import plugin with progress reporting.
 * Fetches ALL boards, discovers teams, fetches reporter + links + description.
 */

import { store } from './state.js';
import * as api from './api.js';
import { mapStatus, mapType, extractTeam, toast, parseWikiMarkup } from './utils.js';
import { SYNC_CONFIG } from './config.js';

// ── Progress UI ───────────────────────────────────────────────────────────────
let _syncTimerStart = 0;
let _syncTimerInterval = null;

function showProgress() {
    document.getElementById('sync-overlay')?.classList.remove('hidden');
    _syncTimerStart = Date.now();
    const timerEl = document.getElementById('sync-timer');
    if (timerEl) timerEl.textContent = '0s';
    clearInterval(_syncTimerInterval);
    _syncTimerInterval = setInterval(() => {
        const el = document.getElementById('sync-timer');
        if (!el) return;
        const s = Math.floor((Date.now() - _syncTimerStart) / 1000);
        el.textContent = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
    }, 1000);
}
function hideProgress() {
    clearInterval(_syncTimerInterval);
    _syncTimerInterval = null;
    document.getElementById('sync-overlay')?.classList.add('hidden');
}
function setProgress(pct, label, detail = '') {
    const fill = document.getElementById('sync-fill');
    const labelEl = document.getElementById('sync-label');
    const detailEl = document.getElementById('sync-detail');
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (labelEl) labelEl.textContent = label;
    if (detailEl) detailEl.textContent = detail;
}

/**
 * Import data from JIRA into the local database.
 *
 * @param {object} options
 *   - `sinceDays` (number|null) : si défini, sync incrémentale — filtre les JQL sur `updated >= -Nd`
 *                                  et mode 'merge' (préserve l'existant). Sinon : full sync 'replace'.
 */
export async function importFromJira(options = {}) {
    const projectRaw = store.get('project');
    if (!projectRaw) throw new Error('Aucun projet JIRA configure');
    const projects = projectRaw.split(',').map(p => p.trim()).filter(Boolean);
    const sinceDays = Number.isInteger(options.sinceDays) && options.sinceDays > 0 ? options.sinceDays : null;

    showProgress();
    setProgress(2, sinceDays ? `Sync rapide (${sinceDays}j)...` : 'Sync complète…', `${projects.length} projet(s)`);

    try {
        return await _doImport(projects, sinceDays);
    } finally {
        hideProgress();
    }
}

async function _doImport(projects, sinceDays = null) {
    const quickMode = sinceDays != null;
    // Clause à appendre aux JQL pour ne récupérer que les issues modifiées récemment
    const updClause = quickMode ? ` AND updated >= -${sinceDays}d` : '';
    // Read user-configurable sync settings from localStorage. Empty = Infinity (no cap).
    const _readCap = key => {
        const raw = (localStorage.getItem(key) || '').trim();
        if (!raw) return Infinity;
        const n = parseInt(raw);
        return isNaN(n) || n < 1 ? Infinity : n;
    };
    const maxFeaturesPerJql = _readCap('sb-sync-maxFeatures');
    const maxBoards         = _readCap('sb-sync-maxBoards');
    const piSprintFieldOverride = (localStorage.getItem('sb-sync-piSprintField') || '').trim() || null;
    const sprintFieldOverride   = (localStorage.getItem('sb-sync-sprintField')   || '').trim() || null;
    const teamFieldOverride     = (localStorage.getItem('sb-sync-teamField')     || '').trim() || null;

    // 1. Discover story points field, sprint field, team field, and PI Sprint custom field
    setProgress(5, 'Detection des champs JIRA...');
    let storyPointsField = 'story_points';
    let sprintFieldId    = sprintFieldOverride || SYNC_CONFIG.sprintField;
    let piSprintField    = piSprintFieldOverride;
    let teamFieldId      = teamFieldOverride;  // "Team[Team]" field — direct team assignment on Features
    let _fieldIndex      = new Map(); // id → name, for diagnostic
    try {
        const fields = await api.jiraGet('rest/api/3/field');
        for (const f of fields) if (f.id && f.name) _fieldIndex.set(f.id, f.name);
        const spField = fields.find(f => f.name?.toLowerCase().includes('story point') && f.custom);
        if (spField) storyPointsField = spField.id;
        // Auto-detect sprint field by exact name "Sprint" (ID varies: 10020, 10021…)
        if (!sprintFieldOverride) {
            const sf = fields.find(f => f.custom && f.name?.toLowerCase() === 'sprint');
            if (sf) {
                sprintFieldId = sf.id;
                console.log(`[Squad-Board] Sprint field auto-detecte: "${sf.name}" (${sprintFieldId})`);
            }
        } else if (!/^customfield_\d+$/.test(sprintFieldId)) {
            // Override is a JQL clause name (e.g. "Sprint") — resolve to customfield ID
            const resolved = fields.find(f =>
                f.clauseNames?.includes(sprintFieldId) || f.name?.toLowerCase() === sprintFieldId.toLowerCase()
            );
            if (resolved) {
                console.log(`[Squad-Board] Sprint field "${sprintFieldId}" resolu → ${resolved.id} ("${resolved.name}")`);
                sprintFieldId = resolved.id;
            } else {
                console.warn(`[Squad-Board] Sprint field "${sprintFieldId}" non trouve dans la liste des champs JIRA — utilise tel quel.`);
            }
        } else {
            console.log(`[Squad-Board] Sprint field (override): ${sprintFieldId}`);
        }
        // Auto-detect "Team[Team]" field (Atlassian Teams integration)
        // Always log team-field candidates so user can find the right customfield ID
        const teamCandidates = fields.filter(f =>
            f.custom && (
                f.schema?.type === 'team' ||
                (f.schema?.custom || '').toLowerCase().includes('team') ||
                /team|equipe|squad/i.test(f.name || '')
            )
        );
        if (teamCandidates.length) {
            console.log('[Squad-Board] Champs Team candidats (copier l\'ID dans Parametres → Plugin JIRA → Champ Equipe):');
            console.table(teamCandidates.map(f => ({ id: f.id, name: f.name, type: f.schema?.type || '?' })));
        }
        // If the override looks like a JQL clause name (e.g. "Team[Team]"), resolve to customfield ID
        if (teamFieldId && !/^customfield_\d+$/.test(teamFieldId)) {
            const resolved = fields.find(f =>
                f.clauseNames?.includes(teamFieldId) || f.name === teamFieldId
            );
            if (resolved) {
                console.log(`[Squad-Board] Team field "${teamFieldId}" resolu → ${resolved.id} ("${resolved.name}")`);
                teamFieldId = resolved.id;
            } else {
                console.warn(`[Squad-Board] Team field "${teamFieldId}" non trouve dans la liste des champs JIRA — voir tableau ci-dessus.`);
            }
        }
        if (!teamFieldId) {
            const tf = teamCandidates[0] || null;
            if (tf) {
                teamFieldId = tf.id;
                console.log(`[Squad-Board] Team field auto-detecte: "${tf.name}" (${teamFieldId})`);
            } else {
                console.warn('[Squad-Board] Team field non detecte — configurez-le dans Parametres → Plugin JIRA → Champ Equipe (ex: "Team[Team]").');
            }
        } else {
            console.log(`[Squad-Board] Team field utilise: ${teamFieldId}`);
        }

        // Auto-detect dedicated PI Sprint custom field (common in SAFe JIRA setups)
        if (!piSprintField) {
            const PI_FIELD_RE = /\bpi\b[\s_-]*(sprint|planning|increment|it[eé]ration)|program[\s_-]*increment|art[\s_-]*sprint/i;
            const piField = fields.find(f => f.custom && PI_FIELD_RE.test(f.name || ''));
            if (piField) {
                piSprintField = piField.id;
                console.log(`[Squad-Board] PI Sprint field auto-detecte: "${piField.name}" (${piSprintField})`);
            }
        } else {
            console.log(`[Squad-Board] PI Sprint field (override Settings): ${piSprintField}`);
        }
    } catch { /* use defaults */ }

    // 2. Fetch boards (paginated, capped by maxBoards setting)
    setProgress(10, 'Recuperation des boards...', 'Scan des boards');
    let allBoards = [];
    let startAt = 0;
    let hasMore = true;
    const BOARDS_PAGE = 100;
    while (hasMore && allBoards.length < maxBoards) {
        try {
            const resp = await api.jiraGet('rest/agile/1.0/board', {
                maxResults: Math.min(BOARDS_PAGE, maxBoards - allBoards.length),
                startAt,
            });
            const values = resp.values || [];
            allBoards = allBoards.concat(values);
            startAt += values.length;
            hasMore = !resp.isLast && values.length > 0;
        } catch { hasMore = false; }
    }

    // Filter: only scrum boards in our projects (like JIRA-dashboard: kanban boards are ignored)
    const projectSet = new Set(projects.map(p => p.toUpperCase()));
    const scrumBoards = allBoards.filter(b => {
        const pk = (b.location?.projectKey || '').toUpperCase();
        return projectSet.has(pk) && b.type === 'scrum';
    });
    const skippedCount = allBoards.filter(b => projectSet.has((b.location?.projectKey || '').toUpperCase()) && b.type !== 'scrum').length;

    // Deduplicate boards by team name (e.g. "Sprint Fuego" and "Board Fuego" → one "Fuego")
    // Also build project → [teamNames] mapping for post-sync group suggestions
    const boardsByTeam = new Map();
    const projectTeams = {}; // { "ERPC": ["Fuego", "Gabbiano"], "GCOM": [...] }
    for (const b of scrumBoards) {
        const teamName = extractTeam(b.name);
        if (!boardsByTeam.has(teamName)) boardsByTeam.set(teamName, b);
        const pk = (b.location?.projectKey || b.location?.projectName || '').toUpperCase();
        if (pk && teamName) {
            if (!projectTeams[pk]) projectTeams[pk] = [];
            if (!projectTeams[pk].includes(teamName)) projectTeams[pk].push(teamName);
        }
    }
    const boards = [...boardsByTeam.values()];
    // Short team names from boards — used to normalize JIRA Team[Team] values like "GCOM - Fuego" → "Fuego"
    const knownBoardTeams = [...boardsByTeam.keys()].filter(Boolean);
    if (knownBoardTeams.length) {
        console.log(`[Squad-Board] Equipes detectees (boards): ${knownBoardTeams.join(', ')}`);
    }

    setProgress(15, `${boards.length} equipes (scrum)`, `${skippedCount} boards kanban ignores`);
    if (!boards.length) throw new Error(`Aucun board scrum pour ${projects.join(', ')}`);

    const allTickets = [];
    const allFeatures = [];
    const allEpics = [];
    const teamsSet = new Map();
    const membersMap = new Map();
    let sprintInfo = null;
    const teamSprints = [];  // sprint actif par équipe (collecté pendant le scan des boards)
    const teamColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
    let teamIdx = 0;
    const boardColumns = {}; // { teamName: { [internal_status]: column_label } }

    // 3. Pre-fetch all board metadata in parallel (sprints + config + velocity)
    //    then iterate sequentially over results to process issues.
    setProgress(15, 'Récupération des métadonnées des boards...', `${boards.length} boards en parallèle`);
    const _fetchBoardMeta = async (board) => {
        let allBoardSprints = [];
        let boardConfig = null;
        let velocityById = {};
        if (board.type !== 'scrum') return { allBoardSprints, boardConfig, velocityById };
        // Sprints + config en parallèle.
        // Stratégie : on fetche active+future séparément (garantit de ne pas les rater si >50 sprints closed)
        // puis on complète avec les 50 derniers closed pour l'historique de vélocité.
        const [sprintsResult, configResult] = await Promise.allSettled([
            (async () => {
                const byId = new Map();
                const _add = arr => arr.forEach(s => { if (!byId.has(s.id)) byId.set(s.id, s); });
                // 1. Active + future en priorité (peu nombreux, jamais paginés)
                for (const st of ['active', 'future']) {
                    try {
                        const r = await api.jiraGet(`rest/agile/1.0/board/${board.id}/sprint`, { state: st, maxResults: 10 });
                        if (r?.values?.length) _add(r.values.map(s => ({ ...s, state: s.state || st })));
                    } catch { /* ignore */ }
                }
                // 2. Closed récents pour la vélocité historique — pagine jusqu'au bout et garde les N derniers
                try {
                    const CLOSED_KEEP = parseInt(localStorage.getItem('sb-sync-closedKeep') || '20') || 20;
                    let startAt = 0, total = Infinity, allClosed = [];
                    while (startAt < total) {
                        const r = await api.jiraGet(`rest/agile/1.0/board/${board.id}/sprint`, { state: 'closed', maxResults: 50, startAt });
                        const vals = r?.values || [];
                        allClosed.push(...vals.map(s => ({ ...s, state: 'closed' })));
                        total = r?.total ?? allClosed.length;
                        if (vals.length < 50 || r?.isLast) break;
                        startAt += vals.length;
                    }
                    // Ne garder que les plus récents (en fin de liste, ordre JIRA croissant)
                    _add(allClosed.slice(-CLOSED_KEEP));
                } catch { /* ignore */ }
                return [...byId.values()];
            })(),
            api.jiraGet(`rest/agile/1.0/board/${board.id}/configuration`).catch(() => null),
        ]);
        allBoardSprints = sprintsResult.status === 'fulfilled' ? (sprintsResult.value || []) : [];
        boardConfig     = configResult.status  === 'fulfilled' ? configResult.value : null;
        // Velocity (Greenhopper) — only if closed sprints exist
        const hasClosed = allBoardSprints.some(s => s.state === 'closed');
        if (hasClosed) {
            try {
                const vr = await api.jiraGet(`rest/greenhopper/1.0/rapid/charts/velocity.json`, { rapidViewId: board.id });
                const entries = vr?.velocityStatEntries || {};
                for (const [sid, ent] of Object.entries(entries)) {
                    const completed = ent?.completed?.value;
                    const estimated = ent?.estimated?.value;
                    const hasC = typeof completed === 'number' && completed > 0;
                    const hasE = typeof estimated === 'number' && estimated > 0;
                    if (hasC || hasE) velocityById[sid] = { velocity: hasC ? Math.round(completed) : 0, estimated: hasE ? Math.round(estimated) : 0 };
                }
            } catch { /* board sans estimation → skip silencieux */ }
        }
        return { allBoardSprints, boardConfig, velocityById };
    };
    const boardMetas = await Promise.all(boards.map(b => _fetchBoardMeta(b)));

    // 3b. For each board: process sprints + issues (sequential — results accumulate into shared arrays)
    const totalBoards = boards.length;
    for (let bi = 0; bi < totalBoards; bi++) {
        const board = boards[bi];
        const teamName = extractTeam(board.name);
        const pct = 15 + ((bi / totalBoards) * 55);
        setProgress(pct, `Board ${bi + 1}/${totalBoards}: ${teamName}`, board.name);

        if (!teamsSet.has(teamName)) {
            teamsSet.set(teamName, teamColors[teamIdx++ % teamColors.length]);
        }

        const { allBoardSprints, boardConfig, velocityById } = boardMetas[bi];
        const activeSprint = allBoardSprints.find(s => s.state === 'active')
                          || allBoardSprints.find(s => s.state === 'future')
                          || null;

        // Extract column config: array of { key, label, jiraStatuses[] }
        // Preserves duplicate internal keys (e.g. "A faire" + "Prêt" both → todo)
        let boardStatusMap = null;
        if (boardConfig?.columnConfig?.columns) {
            boardStatusMap = {};
            const colArray = [];
            for (const col of boardConfig.columnConfig.columns) {
                const internal = _mapColToInternal(col.name);
                if (!internal) continue;
                const jiraStatuses = (col.statuses || [])
                    .map(st => (st.name || '').toLowerCase().trim())
                    .filter(Boolean);
                colArray.push({ key: internal, label: col.name, jiraStatuses });
                for (const st of jiraStatuses) {
                    if (!boardStatusMap[st]) boardStatusMap[st] = internal;
                }
            }
            // Reassign jiraStatuses whose name exactly matches another column's label.
            // Fixes boards where the config maps a status to the wrong column
            // (e.g. "En cours de développement" listed under "Spécification Fonc").
            const _norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
            const labelIdx = new Map(colArray.map(c => [_norm(c.label), c]));
            for (const col of colArray) {
                const move = col.jiraStatuses.filter(st => {
                    const target = labelIdx.get(_norm(st));
                    return target && target !== col;
                });
                for (const st of move) {
                    col.jiraStatuses.splice(col.jiraStatuses.indexOf(st), 1);
                    const target = labelIdx.get(_norm(st));
                    if (!target.jiraStatuses.includes(st)) target.jiraStatuses.push(st);
                    boardStatusMap[st] = target.key;
                }
            }
            if (colArray.length) boardColumns[teamName] = colArray;
        }

        // velocityById already populated by _fetchBoardMeta (pre-fetched in parallel above)

        // Pousse TOUS les sprints du board (closed + active + future) dans teamSprints
        // pour que la modal calendrier puisse afficher le sprint correspondant à la semaine navigée.
        for (const s of allBoardSprints) {
            if (!s.startDate || !s.endDate) continue;  // skip sprints sans dates (rare)
            const sid = String(s.id || '');
            const vd = velocityById[sid] || {};
            // Si le board name donne un nom court ("I", "G"…), tenter de récupérer
            // le vrai nom depuis le sprint ("Initiale - Ité 29.5" → "Initiale").
            // On ne remplace que si le nom extrait du sprint est PLUS LONG que celui du board
            // (heuristique : un nom plus long = plus spécifique, moins susceptible d'être un alias court).
            const teamFromSprintName = extractTeam(s.name);
            const effectiveTeam = (teamFromSprintName && teamFromSprintName !== 'Autre'
                && teamFromSprintName !== teamName && teamFromSprintName.length > teamName.length)
                ? teamFromSprintName
                : teamName;
            teamSprints.push({
                team: effectiveTeam,
                name: s.name,
                startDate: s.startDate,
                endDate: s.endDate,
                goal: s.goal || '',
                state: s.state || 'unknown',  // 'closed' | 'active' | 'future'
                jiraId: sid,
                jiraBoardId: String(s.originBoardId || board.id || ''),
                velocity: vd.velocity || 0,    // SP livrés (Greenhopper completed.value)
                estimated: vd.estimated || 0,  // SP estimés au début du sprint (buffer planifié)
            });
        }
        if (activeSprint && !sprintInfo) {
            // Rétrocompat : sprintInfo global (premier sprint actif trouvé)
            sprintInfo = {
                name: activeSprint.name,
                startDate: activeSprint.startDate,
                endDate: activeSprint.endDate,
                goal: activeSprint.goal || '',
                jiraId: String(activeSprint.id || ''),
                jiraBoardId: String(activeSprint.originBoardId || board.id || ''),
            };
        }

        // Only fetch issues if we have an active sprint (scrum boards)
        // Skip kanban boards without sprint - they can have 10k+ issues in backlog
        if (!activeSprint) {
            console.log(`Board ${board.name} (${board.type}): pas de sprint actif, skip`);
            continue;
        }

        try {
            let issueStart = 0;
            let issueHasMore = true;
            const maxIssues = maxFeaturesPerJql; // user-configurable cap (Parametres → Max tickets/features/epics)
            while (issueHasMore && issueStart < maxIssues) {
                const resp = await api.jiraGet(
                    `rest/agile/1.0/sprint/${activeSprint.id}/issue`,
                    {
                        maxResults: Math.min(200, maxIssues - issueStart),
                        startAt: issueStart,
                        expand: 'changelog',
                        fields: `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,flagged,updated,created,comment,description,issuelinks`,
                    }
                );
                const issues = resp.issues || [];
                for (const issue of issues) {
                    const ticket = transformIssue(issue, teamName, activeSprint, storyPointsField, boardStatusMap);
                    if (ticket.leader) membersMap.set(ticket.leader, { name: ticket.leader, team: teamName });
                    if (ticket.reporter) membersMap.set(ticket.reporter, { name: ticket.reporter, team: teamName });
                    if (ticket.type === 'feature') allFeatures.push(ticket);
                    else if (ticket.type === 'epic') allEpics.push(ticket);
                    else allTickets.push(ticket);
                }
                issueStart += issues.length;
                issueHasMore = issues.length > 0 && issueStart < (resp.total || 0);
            }
        } catch (e) {
            console.warn(`Erreur issues board ${board.name}:`, e);
        }
    }

    // 3b. Fetch next-PI tickets from future sprints (pour la vue Roadmap PI suivant)
    if (sprintInfo) {
        const piMatch = sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i);
        if (piMatch) {
            const nextPI = parseInt(piMatch[1]) + 1;
            const nextPiTag = `PI#${nextPI}`;
            setProgress(68, `Tickets PI${nextPI} (sprints futurs)...`, 'Sprints suivants');
            try {
                const futureJql = `project IN (${projects.join(',')}) AND sprint in futureSprints() AND issuetype NOT IN (Feature, "Fonctionnalite", Epic)${updClause} ORDER BY updated DESC`;
                const FUTURE_PAGE = 100;
                let nextPiAdded = 0;
                const futFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,${sprintFieldId}` +
                    (teamFieldId ? `,${teamFieldId}` : '');
                const seenKeys = await _paginateJql({
                    jql: futureJql,
                    fields: futFields,
                    expand: 'changelog',
                    pageSize: FUTURE_PAGE,
                    cap: maxFeaturesPerJql,
                    onPage: (issues, total) => {
                        for (const issue of issues) {
                            const ticket = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, null, teamFieldId);
                            ticket.team = _normalizeTeamName(ticket.team, knownBoardTeams);
                            if (ticket.piSprint === nextPiTag && !allTickets.find(t => t.id === issue.key)) {
                                allTickets.push(ticket);
                                nextPiAdded++;
                            }
                        }
                        setProgress(68, `Tickets PI${nextPI} (sprints futurs)...`, `${total} scannés, ${nextPiAdded} pour ${nextPiTag}`);
                    },
                });
                console.log(`[Squad-Board] Sprints futurs: ${seenKeys.size} tickets uniques scannes — ${nextPiAdded} ajoutes pour ${nextPiTag}`);
            } catch (e) {
                console.warn('Next PI future sprints fetch:', e.message);
            }
        }
    }

    const jqlProject = projects.length > 1
        ? `project IN (${projects.join(',')})`
        : `project=${projects[0]}`;

    // Compteurs de rang : assignent l'ordre JIRA (depuis "ORDER BY Rank ASC") aux features/epics
    // afin de préserver la priorité backlog dans la roadmap.
    let _featureRankCursor = 0;
    let _epicRankCursor = 0;

    // 4. Fetch features via JQL (paginated)
    setProgress(72, 'Recuperation des features...', `JQL sur ${projects.length} projet(s)`);
    let _featureDiagSample = null;    // first raw issue processed
    let _nullPiRawSample = null;       // first raw issue whose transformed result has null piSprint
    let _richRawSample = null;         // first raw issue with non-null custom fields (best for team field discovery)
    try {
        const extraFields = [sprintFieldId, 'fixVersions'];
        if (piSprintField) extraFields.push(piSprintField);
        if (teamFieldId)   extraFields.push(teamFieldId);
        const featureFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,description,${extraFields.join(',')}`;
        const featureJql = `${jqlProject} AND issuetype IN (Feature, "Fonctionnalite")${updClause} ORDER BY rank ASC`;
        const featSeen = await _paginateJql({
            jql: featureJql,
            fields: featureFields,
            pageSize: 100,
            cap: maxFeaturesPerJql,
            onPage: (issues, total) => {
                setProgress(72, `Features ${total}...`, `${projects.length} projet(s)`);
                for (const issue of issues) {
                    const existing = allFeatures.find(f => f.id === issue.key);
                    if (existing) {
                        existing.rank = _featureRankCursor++;  // rank-up une feature déjà importée (passe per-board)
                        // Re-évalue le team via Team[Team] (plus précis que le board name pour les
                        // features planifiées sur un board cross-team, ex: "PI Board Features ERPC")
                        const _fromField = teamFieldId ? _extractTeamName(issue.fields?.[teamFieldId]) : null;
                        if (_fromField) {
                            existing.team = _normalizeTeamName(_fromField, knownBoardTeams);
                        }
                    } else {
                        const transformed = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                        transformed.team = _normalizeTeamName(transformed.team, knownBoardTeams);
                        transformed.rank = _featureRankCursor++;  // ordre JIRA backlog (ORDER BY Rank ASC)
                        allFeatures.push(transformed);
                        if (!_featureDiagSample) _featureDiagSample = issue;
                        if (!_nullPiRawSample && !transformed.piSprint) _nullPiRawSample = issue;
                        if (!_richRawSample) {
                            const hasCustom = Object.keys(issue.fields || {}).some(k => k.startsWith('customfield_') && issue.fields[k] != null);
                            if (hasCustom) _richRawSample = issue;
                        }
                    }
                }
            },
        });
        const featStart = featSeen.size;
        // Diagnostic : prefer rich sample (has custom fields) to reveal Team/PI field IDs
        const diagSample = _richRawSample || _nullPiRawSample || _featureDiagSample;
        if (diagSample) {
            const f = diagSample.fields || {};
            const nullPiCount = allFeatures.filter(x => !x.piSprint).length;
            console.group('[Squad-Board] Features JQL diagnostic — ' + (nullPiCount > 0 ? `echantillon null piSprint: ${diagSample.key}` : diagSample.key));
            const nullTeamCount = allFeatures.filter(x => !x.team || x.team === 'Autre').length;
            const capLabel = maxFeaturesPerJql === Infinity ? 'illimite' : maxFeaturesPerJql;
            const featsWithPts = allFeatures.filter(x => (x.points || 0) > 0).length;
            console.log(`Features JQL scannees: ${featStart} | importees: ${allFeatures.length} (cap: ${capLabel}) | null piSprint: ${nullPiCount} | sans equipe: ${nullTeamCount} | avec Story Points: ${featsWithPts}`);
            console.log('Cle:', diagSample.key, '| Titre:', f.summary);
            console.log('Type JIRA:', f.issuetype?.name);
            console.log('Labels:', JSON.stringify(f.labels));
            console.log('Parent:', f.parent?.key, '-', f.parent?.fields?.summary);
            console.log('fixVersions:', JSON.stringify(f.fixVersions));
            console.log(`${sprintFieldId} (sprint):`, JSON.stringify(f[sprintFieldId]));
            if (teamFieldId) console.log(`${teamFieldId} (team):`, JSON.stringify(f[teamFieldId]));
            else             console.log('Team field: non configure — ajouter dans Parametres → Plugin JIRA');
            if (piSprintField) console.log(`${piSprintField} (PI custom):`, JSON.stringify(f[piSprintField]));
            // Cross-reference field IDs with names from /field API
            const nonNull = Object.entries(f)
                .filter(([k, v]) => k.startsWith('customfield_') && v !== null && v !== undefined)
                .map(([k, v]) => ({
                    id: k,
                    name: _fieldIndex.get(k) || '?',
                    value: typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : String(v).slice(0, 100),
                }));
            if (nonNull.length) { console.log('Champs custom non-null:'); console.table(nonNull); }
            else console.log('Champs custom non-null: aucun');
            console.groupEnd();

            // Coverage diagnostic — helps spot projects/teams/PIs missing features
            const byProject = allFeatures.reduce((acc, x) => {
                const p = (x.id || '').split('-')[0] || '?';
                acc[p] = (acc[p] || 0) + 1; return acc;
            }, {});
            const byPi = allFeatures.reduce((acc, x) => {
                const k = x.piSprint || '— null';
                acc[k] = (acc[k] || 0) + 1; return acc;
            }, {});
            const byTeam = allFeatures.reduce((acc, x) => {
                const k = x.team || '— null';
                acc[k] = (acc[k] || 0) + 1; return acc;
            }, {});
            console.log('[Squad-Board] Features — par projet:');
            console.table(Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ project: p, count: n })));
            console.log('[Squad-Board] Features — par PI:');
            console.table(Object.entries(byPi).sort().map(([p, n]) => ({ PI: p, count: n })));
            console.log('[Squad-Board] Features — par equipe (apres normalisation):');
            console.table(Object.entries(byTeam).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ team: t, count: n })));
        } else {
            console.warn('[Squad-Board] Features JQL: 0 features retournees. Verifier le nom du type JIRA.');
        }
    } catch (e) {
        console.warn('[Squad-Board] Features JQL error:', e.message);
    }

    // 5. Fetch epics via JQL (paginated)
    setProgress(78, 'Recuperation des epics...', `JQL sur ${projects.length} projet(s)`);
    try {
        const epicExtraFields = [sprintFieldId, 'fixVersions'];
        if (piSprintField) epicExtraFields.push(piSprintField);
        if (teamFieldId)   epicExtraFields.push(teamFieldId);
        const epicFields = `summary,status,issuetype,assignee,priority,labels,${storyPointsField},parent,updated,${epicExtraFields.join(',')}`;
        const epicJql = `${jqlProject} AND issuetype=Epic${updClause} ORDER BY rank ASC`;
        await _paginateJql({
            jql: epicJql,
            fields: epicFields,
            pageSize: 100,
            cap: maxFeaturesPerJql,
            onPage: (issues, total) => {
                setProgress(78, `Epics ${total}...`, `${projects.length} projet(s)`);
                for (const issue of issues) {
                    const existing = allEpics.find(e => e.id === issue.key);
                    if (existing) {
                        existing.rank = _epicRankCursor++;
                    } else {
                        const transformed = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                        transformed.team = _normalizeTeamName(transformed.team, knownBoardTeams);
                        transformed.rank = _epicRankCursor++;
                        allEpics.push(transformed);
                    }
                }
            },
        });
        // Diagnostic — verify epic→feature linkage (used for PI inheritance in roadmap)
        const epicsWithFeature = allEpics.filter(e => e.feature).length;
        const epicByProject = allEpics.reduce((acc, e) => {
            const p = (e.id || '').split('-')[0] || '?';
            acc[p] = (acc[p] || 0) + 1; return acc;
        }, {});
        console.log(`[Squad-Board] Epics: ${allEpics.length} importes | ${epicsWithFeature} lies a une feature (${Math.round(epicsWithFeature * 100 / Math.max(1, allEpics.length))}%)`);
        console.table(Object.entries(epicByProject).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ project: p, count: n })));
    } catch (e) { console.warn('[Squad-Board] Epics fetch:', e?.message || e); }

    // 5b. PI-named-sprint pass — runs AFTER features/epics JQL so the standard rank order wins.
    // Catches projects (e.g. GCOM) that plan via sprints literally named "PI30" / "PI#30".
    // Items already in allFeatures/allEpics are skipped (rank preserved from earlier passes).
    if (sprintInfo) {
        const _m = sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i);
        if (_m) {
            const cur = parseInt(_m[1]);
            const piNames = [];
            for (let i = cur - 1; i <= cur + 2; i++) {
                if (i > 0) piNames.push(`PI${i}`, `PI#${i}`);
            }
            const piSprintJql = `${jqlProject} AND Sprint in (${piNames.map(n => `"${n}"`).join(',')})${updClause} ORDER BY Rank ASC`;
            setProgress(81, 'Sprints PI nommes...', piNames.join(', '));
            try {
                const added = { features: 0, epics: 0, tickets: 0 };
                const piFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,fixVersions,${sprintFieldId}` +
                    (teamFieldId ? `,${teamFieldId}` : '') + (piSprintField ? `,${piSprintField}` : '');
                const seen = await _paginateJql({
                    jql: piSprintJql,
                    fields: piFields,
                    expand: 'changelog',
                    pageSize: 100,
                    cap: maxFeaturesPerJql,
                    onPage: (issues, total) => {
                        for (const issue of issues) {
                            const tr = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                            tr.team = _normalizeTeamName(tr.team, knownBoardTeams);
                            if (tr.type === 'feature') {
                                if (!allFeatures.find(f => f.id === issue.key)) {
                                    tr.rank = _featureRankCursor++;
                                    allFeatures.push(tr); added.features++;
                                }
                            } else if (tr.type === 'epic') {
                                if (!allEpics.find(e => e.id === issue.key)) {
                                    tr.rank = _epicRankCursor++;
                                    allEpics.push(tr); added.epics++;
                                }
                            } else {
                                if (!allTickets.find(t => t.id === issue.key)) { allTickets.push(tr); added.tickets++; }
                            }
                        }
                        setProgress(81, 'Sprints PI nommes...', `${total} uniques · +${added.features}f +${added.epics}e +${added.tickets}t`);
                    },
                });
                console.log(`[Squad-Board] Sprints PI nommes (${piNames.join(', ')}): ${seen.size} uniques scannes — +${added.features} features, +${added.epics} epics, +${added.tickets} tickets`);
            } catch (e) {
                console.warn('[Squad-Board] PI-named sprint fetch:', e?.message || e);
            }
        }
    }

    // 5c. Children of PI-current + PI-next features — Stories/Tasks linked via parent=
    //     pour la projection et l'estimation PI+1. Ciblé sur PI courant + PI suivant uniquement
    //     pour éviter d'importer l'historique complet de tous les PIs passés.
    if (allFeatures.length && sprintInfo) {
        const piMatch = sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i);
        if (piMatch) {
            const curPi  = parseInt(piMatch[1]);
            const nextPi = curPi + 1;
            const nextPi2 = curPi + 2;
            // Tags acceptés : "PI#30", "PI30", "30.x" (piSprint de la feature)
            const _matchesPi = (f, piNum) => {
                const ps = (f.piSprint || '').toUpperCase();
                return ps === `PI#${piNum}` || ps === `PI${piNum}` || ps.startsWith(`${piNum}.`);
            };
            const piFeatures = allFeatures.filter(f => _matchesPi(f, curPi) || _matchesPi(f, nextPi) || _matchesPi(f, nextPi2));

            if (piFeatures.length) {
                const FEAT_CHILD_BATCH = 50;
                const childFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,${sprintFieldId}` +
                    (teamFieldId ? `,${teamFieldId}` : '') + (piSprintField ? `,${piSprintField}` : '');
                let childrenAdded = 0;
                for (let i = 0; i < piFeatures.length; i += FEAT_CHILD_BATCH) {
                    const ids = piFeatures.slice(i, i + FEAT_CHILD_BATCH).map(f => f.id).join(',');
                    setProgress(82, `Enfants features PI${curPi}+PI${nextPi}+PI${nextPi2}...`,
                        `batch ${Math.floor(i / FEAT_CHILD_BATCH) + 1}/${Math.ceil(piFeatures.length / FEAT_CHILD_BATCH)}`);
                    try {
                        await _paginateJql({
                            jql: `parent IN (${ids}) AND issuetype NOT IN (Feature, "Fonctionnalite", Epic) ORDER BY updated DESC`,
                            fields: childFields,
                            pageSize: 100,
                            cap: maxFeaturesPerJql,
                            onPage: (issues) => {
                                for (const issue of issues) {
                                    if (allTickets.find(t => t.id === issue.key)) continue;
                                    const tr = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                                    tr.team = _normalizeTeamName(tr.team, knownBoardTeams);
                                    allTickets.push(tr);
                                    childrenAdded++;
                                }
                            },
                        });
                    } catch (e) {
                        console.warn('[Squad-Board] Feature children fetch batch:', e?.message || e);
                    }
                }
                console.log(`[Squad-Board] Enfants features PI${curPi}+PI${nextPi}+PI${nextPi2}: +${childrenAdded} tickets (${piFeatures.length} features ciblées)`);
            }
        }
    }

    // 6. Fetch amelioration tickets (retro, post-mortem, CoP, adapt - cross-sprint)
    setProgress(83, 'Tickets amelioration continue...', 'retro / postmortem / cop / adapt');
    const AMEL_LABELS = [
        'Retro', 'Rétro', 'retro', 'rétro', 'ActionRetro', 'actionretro',
        'RetroFonc', 'retroffonc', 'retro-tech',
        'Amelioration', 'Amélioration', 'amelioration',
        'postmortem', 'Postmortem',
        'Adapt', 'adapt',
        'COP', 'CoP', 'cop', 'cop-dev', 'CoP-methodo', 'cop-methodo', 'CoP-méthodo',
        'methodo', 'Methodo',
    ];
    try {
        const amelJql = `${jqlProject} AND labels in (${AMEL_LABELS.map(l => `"${l}"`).join(',')}) AND (statusCategory != Done OR updated >= "-30d") ORDER BY updated DESC`;
        // ⚠ JIRA Cloud /search/jql ne renvoie PAS le champ `description` même quand on le demande
        // explicitement dans `fields` (limitation API). Pour les tickets ActionRetro/Postmortem où
        // la description porte tout le contexte de l'item rétro, on utilise `*all` pour avoir tous
        // les champs incluant la description. Payload plus lourd mais volume faible (~50 tickets max).
        const amelFields = '*all';
        await _paginateJql({
            jql: amelJql,
            fields: amelFields,
            pageSize: 100,
            cap: maxFeaturesPerJql,
            onPage: (issues) => {
                for (const issue of issues) {
                    if (!allTickets.find(t => t.id === issue.key) && !allFeatures.find(f => f.id === issue.key)) {
                        const ticket = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, null, teamFieldId);
                        ticket.team = _normalizeTeamName(ticket.team, knownBoardTeams);
                        allTickets.push(ticket);
                    }
                }
            },
        });
    } catch (e) {
        console.warn('Amelioration fetch:', e.message);
    }

    // 6.5 Buffer historique : récupère tous les tickets `labels = Buffer` et
    // agrège leurs Story Points par sprint clos (dernier sprint clos de chaque ticket).
    // Évite de devoir charger TOUS les tickets des sprints clos juste pour avoir le buffer.
    const bufferBySprintId = new Map();  // sprintId → total points buffer
    try {
        setProgress(86, 'Buffer historique...', 'tickets label=Buffer');
        const bufFields = `summary,status,${storyPointsField},${sprintFieldId}`;
        const seenBuf = await _paginateJql({
            jql: `${jqlProject} AND labels = "Buffer" ORDER BY updated DESC`,
            fields: bufFields,
            pageSize: 100,
            cap: 5000,
            onPage: (issues) => {
                for (const issue of issues) {
                    const f = issue.fields || {};
                    const pts = f[storyPointsField] || 0;
                    if (!pts) continue;
                    const sprintField = f[sprintFieldId];
                    const sprints = Array.isArray(sprintField) ? sprintField : (sprintField ? [sprintField] : []);
                    // Garde le DERNIER sprint clos (par endDate) — un ticket multi-sprint
                    // est compté dans le sprint où il a finalement été livré.
                    let last = null;
                    for (const s of sprints) {
                        if (!s || s.state !== 'closed') continue;
                        if (!last || (s.endDate || '') > (last.endDate || '')) last = s;
                    }
                    if (last?.id) {
                        const sid = String(last.id);
                        bufferBySprintId.set(sid, (bufferBySprintId.get(sid) || 0) + pts);
                    }
                }
            },
        });
        console.log(`[Squad-Board] Buffer historique : ${seenBuf.size} tickets label=Buffer scannés → ${bufferBySprintId.size} sprints renseignés`);
    } catch (e) {
        console.warn('[Squad-Board] Buffer historique : échec', e.message);
    }

    // Patche les sprints clos déjà collectés avec leur bufferPoints
    for (const s of teamSprints) {
        if (s.state === 'closed' && bufferBySprintId.has(s.jiraId)) {
            s.bufferPoints = bufferBySprintId.get(s.jiraId);
        }
    }

    // 7. Final coverage diagnostic — what PI activity exists per team?
    if (sprintInfo) {
        const piMatch = sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i);
        if (piMatch) {
            const nextPiTag = `PI#${parseInt(piMatch[1]) + 1}`;
            const ticketsNext = allTickets.filter(t => t.piSprint === nextPiTag);
            const ticketsTeamCounts = ticketsNext.reduce((acc, t) => {
                const k = t.team || '— null'; acc[k] = (acc[k] || 0) + 1; return acc;
            }, {});
            const ticketsWithEpic   = ticketsNext.filter(t => t.epic).length;
            const ticketsEpicLinked = ticketsNext.filter(t => t.epic && allEpics.find(e => e.id === t.epic && e.feature)).length;
            console.group(`[Squad-Board] Couverture ${nextPiTag} (heritage de features via chaine ticket→epic→feature)`);
            console.log(`Tickets ${nextPiTag}: ${ticketsNext.length} | avec epic parent: ${ticketsWithEpic} | dont epic lie a une feature: ${ticketsEpicLinked}`);
            console.log(`Si ${nextPiTag} tickets > 0 mais epic-lie = 0 → la chaine d'heritage ne remonte rien. Causes possibles : epics absents, ou epic.parent != Feature dans JIRA.`);
            console.table(Object.entries(ticketsTeamCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ team: t, count: n })));
            console.groupEnd();
        }
    }

    // 8. Import into database
    setProgress(90, 'Sauvegarde en base...', `${allTickets.length} tickets (dont amelioration), ${allFeatures.length} features, ${allEpics.length} epics`);

    const teams = [...teamsSet.entries()].map(([name, color]) => ({ name, color }));
    const jiraMembers = [...membersMap.values()];

    // Members are managed exclusively via CSV import in Settings - JIRA never touches them.
    // Le sprint global (sprintInfo) reste pour la rétrocompat ; teamSprints[] permet le filtrage par équipe.
    // IMPORTANT : on persiste teamSprints même sans sprintInfo (cas où aucun board n'a de sprint actif
    // mais a des closed/future — on veut quand même afficher la barre dans la modal calendrier).
    const sprintPayload = (sprintInfo || teamSprints.length)
        ? { ...(sprintInfo || {}), teamSprints }
        : null;
    const withVelocity = teamSprints.filter(s => s.velocity > 0).length;
    console.log(`[Squad-Board] Sprints collectés : ${teamSprints.length} entrées (${[...new Set(teamSprints.map(s => s.team))].length} équipes) | ${withVelocity} avec vélocité JIRA | sprintInfo global : ${sprintInfo ? sprintInfo.name : 'aucun'}`);

    // Quick mode = merge (préserve les items existants non touchés par cette sync)
    // Full mode  = replace (efface puis ré-importe — état propre)
    await api.importAll({
        tickets: allTickets,
        features: allFeatures,
        epics: allEpics,
        teams,
        sprint: sprintPayload ? [sprintPayload] : [],
    }, quickMode ? 'merge' : 'replace');

    if (sprintPayload) {
        await api.updateSprint(sprintPayload);
    }

    setProgress(100, 'Import termine !', `${allTickets.length} tickets, ${teams.length} equipes`);
    await new Promise(r => setTimeout(r, 600));

    return { ticketCount: allTickets.length, featureCount: allFeatures.length, epicCount: allEpics.length, teamCount: teams.length, boardColumns, projectTeams };
}

// ── Map JIRA column name → internal status key ───────────────────────────────
function _mapColToInternal(colName) {
    const c = (colName || '').toLowerCase().trim();
    if (/test|recette|qualif|preprod|préprod|uat|valid/i.test(c))             return 'test';
    if (/termin|done\b|clos|livr|deploy|d[eéè]ploy|prod|résolu|resolv/i.test(c)) return 'done';
    if (/review|revue|relecture/i.test(c))                                    return 'review';
    if (/bloqu|bloc|imped|attente|hold|wait/i.test(c))                        return 'blocked';
    if (/cours|progress|dev|wip|sp[eéè]c|analys|cadrage|développ/i.test(c))  return 'inprog';
    if (/backlog/i.test(c))                                                   return 'todo';
    if (/todo|[àa] faire|open|ready|estimer|affinage|pret|prêt/i.test(c))    return 'todo';
    return null;
}

// ── Transform JIRA issue ──────────────────────────────────────────────────────
function transformIssue(issue, teamName, sprint, storyPointsField, boardStatusMap = null, sprintFieldId = null, piSprintFieldId = null, teamFieldId = null) {
    const f = issue.fields || {};
    const type = mapType(f.issuetype?.name);
    const jiraStatusName = f.status?.name || '';
    const status = (boardStatusMap && boardStatusMap[jiraStatusName.toLowerCase().trim()])
        || mapStatus(jiraStatusName);
    // Préserve le label JIRA brut pour affichage UI (ex: "En cours de développement" au lieu de "En cours")
    const jiraStatus = jiraStatusName;
    const points = f[storyPointsField] || f.story_points || 0;
    const flagged = !!(f.flagged || f.priority?.name?.toLowerCase() === 'blocker');

    // Sprint name: from explicit sprint arg OR from sprint custom field (Cloud obj / Server string)
    const _sprintName = sprint?.name || _parseSprintFieldName(sprintFieldId ? f[sprintFieldId] : null);

    // Team: explicit arg > Team[Team] custom field > extracted from sprint name
    const _teamFromField = teamFieldId ? _extractTeamName(f[teamFieldId]) : null;

    const comments = (f.comment?.comments || []).slice(-5).map(c => ({
        id: c.id || Math.random().toString(36).slice(2, 10),
        author: c.author?.displayName || 'Inconnu',
        date: c.created,
        body: c.body ? (typeof c.body === 'object' ? parseADF(c.body) : parseWikiMarkup(String(c.body))) : '',
    }));

    // Parse issue links
    const links = (f.issuelinks || []).map(l => {
        const outward = l.outwardIssue;
        const inward = l.inwardIssue;
        const linked = outward || inward;
        if (!linked) return null;
        return {
            type: outward ? l.type?.outward : l.type?.inward,
            id: linked.key,
            title: linked.fields?.summary || '',
            status: linked.fields?.status?.name || '',
        };
    }).filter(Boolean);

    // Parse description: ADF object (JIRA Cloud) ou string brute (JIRA Server / wiki)
    const description = f.description
        ? (typeof f.description === 'object' ? parseADF(f.description) : parseWikiMarkup(String(f.description)))
        : '';

    // Compute cycle time from changelog
    let startedDate = null;
    let resolvedDate = null;
    if (issue.changelog?.histories?.length) {
        const histories = [...issue.changelog.histories].sort(
            (a, b) => new Date(a.created) - new Date(b.created)
        );
        for (const history of histories) {
            for (const item of (history.items || [])) {
                if (item.field !== 'status') continue;
                const toStatus = (item.toString || '').toLowerCase().trim();
                const mapped = (boardStatusMap && boardStatusMap[toStatus]) || mapStatus(toStatus);
                if (!startedDate && ['inprog', 'review', 'test'].includes(mapped)) {
                    startedDate = history.created;
                }
                if (!resolvedDate && mapped === 'done') {
                    resolvedDate = history.created;
                }
            }
        }
    }
    const msPerDay = 86400000;
    const cycleTimeDays = (startedDate && resolvedDate)
        ? Math.max(1, Math.round((new Date(resolvedDate) - new Date(startedDate)) / msPerDay))
        : 0;
    const leadTimeDays = (f.created && resolvedDate)
        ? Math.max(1, Math.round((new Date(resolvedDate) - new Date(f.created)) / msPerDay))
        : 0;

    // PI extraction — 4 sources in priority order:
    // 1. Team sprint name ("Fuego - Ite 29.3")
    // 2. Dedicated PI Sprint custom field (SAFe JIRA)
    // 3. Fix Versions (e.g. version named "PI30")
    // 4. Labels (e.g. "PI30", "PI#30")
    const piSprint =
        extractPI(_sprintName) ||
        (piSprintFieldId ? extractPI(_parseSprintFieldName(f[piSprintFieldId])) || _piFromText(f[piSprintFieldId]) : null) ||
        _piFromFixVersions(f.fixVersions) ||
        _piFromLabels(f.labels);

    return {
        id: issue.key,
        title: f.summary || '',
        type,
        status: flagged && status !== 'done' ? 'blocked' : status,
        jiraStatus,  // label JIRA brut, ex: "En cours de développement" (persisté en base pour affichage)
        _jiraStatus: jiraStatusName.toLowerCase().trim(),
        // Team mapping : Team[Team] (vérité SAFe — équipe agile responsable) > board name >
        // extractTeam(sprint name) > 'Autre'.
        // Cas typique : features planifiées sur un board cross-team (ex: "PI Board Features ERPC")
        // → Team[Team]="GCOM - Fuego" doit l'emporter sur le nom du board.
        // Filtre : skip extractTeam si sprint name est juste un tag PI ("PI#29" ≠ équipe).
        team: _teamFromField
            || teamName
            || (/^PI\s*#?\s*\d+\s*$/i.test(_sprintName || '') ? null : extractTeam(_sprintName))
            || 'Autre',
        leader: f.assignee?.displayName || null,
        reporter: f.reporter?.displayName || null,
        contributors: [],
        points,
        priority: f.priority?.name?.toLowerCase() || 'medium',
        sprint: sprint?.id || null,
        sprintName: sprint?.name || null,
        piSprint,
        flagged,
        labels: f.labels || [],
        // JIRA hierarchy: ticket→epic→feature. For an Epic issue, parent.key is its Feature, not another epic.
        epic:    type === 'epic' ? null : (f.parent?.key || null),
        feature: type === 'epic' ? (f.parent?.key || null) : undefined,
        description,
        links,
        comments,
        updatedAt: f.updated || null,
        recentChanges: _extractRecentChanges(issue),
        startedDate: startedDate || null,
        resolvedDate: resolvedDate || null,
        cycleTimeDays,
        leadTimeDays,
    };
}

// ── Extraction de l'historique JIRA (changelog → recentChanges) ──────────────
// JIRA fournit `issue.changelog.histories[]` quand l'API est appelée avec
// `expand=changelog`. On aplatit les items pertinents et on filtre le bruit
// (description, attachment, comment, links…). On garde les 8 derniers
// événements pour ne pas surcharger la base.
// Le `field` est gardé en clé technique (status, assignee, …) — la traduction
// française est faite côté affichage via `fieldLabelFr()` dans utils.js.
const _CHANGE_FIELDS_SKIP = new Set([
    'description', 'comment', 'attachment', 'attachments',
    'link', 'links', 'issuelinks', 'workratio', 'environment',
    'lastviewed', 'remoteissuelinks',
]);

function _extractRecentChanges(issue, max = 8) {
    const histories = issue?.changelog?.histories || [];
    if (!histories.length) return [];
    const out = [];
    // histories est trié du plus ancien au plus récent ; on parcourt à l'envers
    for (let h = histories.length - 1; h >= 0 && out.length < max; h--) {
        const hist = histories[h];
        const author = hist.author?.displayName || 'Inconnu';
        const date   = hist.created;
        for (const item of (hist.items || [])) {
            const rawField = (item.field || item.fieldId || '').toString();
            if (_CHANGE_FIELDS_SKIP.has(rawField.toLowerCase())) continue;
            out.push({
                date,
                author,
                field: rawField,  // clé technique (status, assignee, sprint…)
                from:  item.fromString || item.from || '',
                to:    item.toString   || item.to   || '',
            });
            if (out.length >= max) break;
        }
    }
    return out;
}

// ── ADF (Atlassian Document Format) → HTML parser ─────────────────────────────
function parseADF(doc) {
    if (!doc || !doc.content) return '';
    return doc.content.map(node => renderADFNode(node)).join('');
}

function renderADFNode(node) {
    if (!node) return '';
    const children = () => (node.content || []).map(n => renderADFNode(n)).join('');

    switch (node.type) {
        case 'doc':
            return children();
        case 'paragraph':
            return `<p>${children()}</p>`;
        case 'heading': {
            const level = node.attrs?.level || 3;
            return `<h${level}>${children()}</h${level}>`;
        }
        case 'text': {
            let text = escHtml(node.text || '');
            for (const mark of (node.marks || [])) {
                switch (mark.type) {
                    case 'strong': text = `<strong>${text}</strong>`; break;
                    case 'em': text = `<em>${text}</em>`; break;
                    case 'strike': text = `<s>${text}</s>`; break;
                    case 'underline': text = `<u>${text}</u>`; break;
                    case 'code': text = `<code>${text}</code>`; break;
                    case 'link':
                        text = `<a href="${escHtml(mark.attrs?.href || '#')}" target="_blank" rel="noopener">${text}</a>`;
                        break;
                    case 'textColor':
                        text = `<span style="color:${escHtml(mark.attrs?.color || '')}">${text}</span>`;
                        break;
                }
            }
            return text;
        }
        case 'hardBreak':
            return '<br>';
        case 'bulletList':
            return `<ul>${children()}</ul>`;
        case 'orderedList':
            return `<ol>${children()}</ol>`;
        case 'listItem':
            return `<li>${children()}</li>`;
        case 'blockquote':
            return `<blockquote>${children()}</blockquote>`;
        case 'codeBlock': {
            const lang = node.attrs?.language || '';
            return `<pre><code class="lang-${escHtml(lang)}">${children()}</code></pre>`;
        }
        case 'rule':
            return '<hr>';
        case 'table':
            return `<table>${children()}</table>`;
        case 'tableRow':
            return `<tr>${children()}</tr>`;
        case 'tableHeader':
            return `<th>${children()}</th>`;
        case 'tableCell':
            return `<td>${children()}</td>`;
        case 'mention': {
            const mentionText = (node.attrs?.text || node.attrs?.displayName || '').replace(/^@/, '');
            return `<strong>@${escHtml(mentionText)}</strong>`;
        }
        case 'emoji':
            return node.attrs?.text || node.attrs?.shortName || '';
        case 'inlineCard':
        case 'blockCard':
            return node.attrs?.url
                ? `<a href="${escHtml(node.attrs.url)}" target="_blank" rel="noopener">${escHtml(node.attrs.url)}</a>`
                : '';
        case 'status':
            return `<span class="chip">${escHtml(node.attrs?.text || '')}</span>`;
        case 'mediaSingle':
            return `<div class="adf-media">${children()}</div>`;
        case 'media': {
            const url = node.attrs?.url;
            const id  = node.attrs?.id;
            const w   = node.attrs?.width  ? ` width="${node.attrs.width}"`  : '';
            const h   = node.attrs?.height ? ` height="${node.attrs.height}"` : '';
            if (url) return `<img src="${escHtml(url)}" alt="${escHtml(node.attrs?.alt || '')}"${w}${h}>`;
            if (id)  return `<img src="/jira/rest/api/3/attachment/content/${escHtml(id)}"${w}${h} alt="[media]" onerror="this.outerHTML='<em>[image non disponible]</em>'">`;
            return '<em>[pièce jointe]</em>';
        }
        case 'panel': {
            const ptype = node.attrs?.panelType || 'info';
            const adfClass = `adf-panel adf-panel-${ptype === 'error' ? 'danger' : ptype === 'warning' ? 'warning' : 'info'}`;
            return `<div class="${adfClass}">${children()}</div>`;
        }
        case 'taskList':
            return `<ul class="adf-task-list">${children()}</ul>`;
        case 'taskItem': {
            const checked = node.attrs?.state === 'DONE';
            return `<li>${checked ? '&#9745;' : '&#9744;'} ${children()}</li>`;
        }
        default:
            return children();
    }
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// Parse sprint custom field value → sprint name string.
// Handles Jira Cloud (array of objects) and Jira Server (array of "com.atlassian...name=X,..." strings).
function _parseSprintFieldName(sprintVal) {
    if (!sprintVal) return null;
    const arr = Array.isArray(sprintVal) ? sprintVal : [sprintVal];
    const stateOrder = { active: 0, future: 1, closed: 2 };
    const parsed = arr.map(item => {
        if (item && typeof item === 'object') {
            return { name: item.name || null, state: (item.state || '').toLowerCase() };
        }
        if (typeof item === 'string') {
            const nameM  = item.match(/\bname=([^,\]]+)/);
            const stateM = item.match(/\bstate=([^,\]]+)/);
            return { name: nameM?.[1]?.trim() || null, state: (stateM?.[1] || '').toLowerCase() };
        }
        return { name: null, state: '' };
    }).filter(p => p.name);
    parsed.sort((a, b) => (stateOrder[a.state] ?? 99) - (stateOrder[b.state] ?? 99));
    return parsed[0]?.name || null;
}

// Try to extract a PI tag from a raw field value (string, object with value/name, or option).
function _piFromText(val) {
    if (!val) return null;
    const text = typeof val === 'string' ? val
        : val.value || val.name || val.displayName || JSON.stringify(val);
    const m = String(text).match(/PI[#_\s]?(\d+)/i) || String(text).match(/\b(\d{2})\b/);
    return m ? `PI#${m[1]}` : null;
}

function _piFromFixVersions(fixVersions) {
    for (const v of (fixVersions || [])) {
        const name = v.name || v.description || '';
        const m = name.match(/PI[#_\s]?(\d+)/i) || name.match(/^(\d{2})\b/);
        if (m) return `PI#${m[1]}`;
    }
    return null;
}

function extractPI(sprintName) {
    if (!sprintName) return null;
    const m = sprintName.match(/(\d+)\.\d+/) || sprintName.match(/PI\s*#?\s*(\d+)/i);
    return m ? `PI#${m[1]}` : null;
}

function _piFromLabels(labels) {
    for (const label of (labels || [])) {
        const m = (label || '').match(/^PI[#_\s]?(\d+)$/i);
        if (m) return `PI#${m[1]}`;
    }
    return null;
}

// Extract team name from JIRA "Team[Team]" custom field value (object, array, or string)
function _extractTeamName(val) {
    if (!val) return null;
    if (typeof val === 'string') return val.trim() || null;
    if (Array.isArray(val)) {
        const first = val.find(Boolean);
        return first?.name || first?.displayName || first?.title
            || (typeof first === 'string' ? first.trim() : null) || null;
    }
    return val.name || val.displayName || val.title || null;
}

// Normalize a JIRA team name (e.g. "GCOM - Fuego") to a known board-derived short name (e.g. "Fuego").
// Matches when the known team appears at the end, preceded by a separator (-, _, /, space, ], )).
// Falls back to the raw name if no match — preserves teams that exist only in JIRA Team[Team].
/**
 * Paginate /rest/api/3/search/jql robustly.
 *
 * JIRA Cloud's `/search/jql` is the new endpoint :
 *   - Returns `nextPageToken` when more pages remain (preferred mechanism).
 *   - Falls back to startAt for backward-compat, but some queries silently ignore it.
 *   - May return `total` capped at `maxResults` (unreliable).
 *
 * This helper tries `nextPageToken` first, then `startAt`, then bails out via:
 *   - Empty page → done
 *   - Page entirely composed of already-seen keys → broken pagination, done
 *   - Page shorter than requested → done
 *   - resp.isLast === true → done
 *   - Hard iteration cap (100) → safety net
 *
 * `onPage(issues, totalSeen)` is invoked once per page with NEW issues (already deduped via seenKeys).
 * Returns the Set of all seen keys.
 */
async function _paginateJql({ jql, fields, expand, pageSize = 100, cap = Infinity, onPage }) {
    const seenKeys = new Set();
    let startAt = 0;
    let nextPageToken = null;
    let iter = 0;
    const MAX_ITER = 100;
    while (seenKeys.size < cap && iter++ < MAX_ITER) {
        const params = {
            jql,
            maxResults: Math.min(pageSize, cap - seenKeys.size),
            fields,
        };
        if (expand) params.expand = expand;
        if (nextPageToken) params.nextPageToken = nextPageToken;
        else if (startAt > 0) params.startAt = startAt;
        const resp = await api.jiraGet('rest/api/3/search/jql', params);
        const issues = resp.issues || [];
        if (issues.length === 0) break;
        // Filter to only NEW keys
        const fresh = issues.filter(i => {
            if (seenKeys.has(i.key)) return false;
            seenKeys.add(i.key);
            return true;
        });
        if (fresh.length === 0) break;  // pagination not progressing → bail
        onPage?.(fresh, seenKeys.size);
        // Advance: prefer nextPageToken, else bump startAt
        if (resp.nextPageToken) { nextPageToken = resp.nextPageToken; }
        else { startAt += issues.length; nextPageToken = null; }
        // Explicit end signals
        if (resp.isLast === true) break;
        if (issues.length < pageSize) break;
    }
    return seenKeys;
}

function _normalizeTeamName(rawName, knownTeams) {
    if (!rawName) return rawName;
    const cleaned = String(rawName).trim();
    if (!knownTeams || !knownTeams.length) return cleaned;
    // Prefer longer matches first (e.g. "Dandelion" beats "Lion" if both are known)
    const sorted = [...knownTeams].sort((a, b) => b.length - a.length);
    for (const team of sorted) {
        if (!team || team === 'Autre') continue;
        if (cleaned.toLowerCase() === team.toLowerCase()) return team;
        const escaped = team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(^|[\\s\\-_\\/\\]\\)])${escaped}\\s*$`, 'i');
        if (re.test(cleaned)) return team;
    }
    return cleaned;
}
