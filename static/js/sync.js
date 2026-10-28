/**
 * JIRA import plugin with progress reporting.
 * Fetches ALL boards, discovers teams, fetches reporter + links + description.
 */

import { store } from './state.js';
import * as api from './api.js';
import { extractTeam, extractSprintLabel, toast } from './utils.js';
import { SYNC_DEFAULTS, syncSetting } from './config.js';
import { getExcludedTeams, hideProgress, makeIncidents, setProgress, showProgress } from './sync-report.js';
import { contributorsFieldParam, _mapColToInternal, transformIssue, parseADF } from './sync-parse.js';
import { forceColumns } from './utils/status-override.js';
import { fillContributorsFromWatchers } from './sync-watchers.js';
import { detectSyncFields } from './sync-fields.js';
import { _buildClosedArchive, _loadEmptyClosed, _saveEmptyClosed } from './sync-archive.js';
import {
    fetchNextPiFutureTickets, fetchFeatures, fetchEpics, fetchPiNamedSprints, fetchFeatureChildren,
    fetchImprovementTickets, fetchBufferHistory,
} from './sync-passes.js';
import { projectStorage } from './project-settings.js';
import { resetUnmapped, saveUnmapped } from './utils/jira-mapping.js';
// API publique inchangée (app.js, topbar, Paramètres, tests) : ré-exports
export { makeIncidents, getExcludedTeams, addExcludedTeam, removeExcludedTeam, clearExcludedTeams, dismissSyncReport } from './sync-report.js';
export { clearEmptyClosedMemory, _buildClosedArchive } from './sync-archive.js';

/**
 * Import data from JIRA into the local database.
 *
 * @param {object} options
 *   - `sinceDays` (number|null) : si défini, sync incrémentale — filtre les JQL sur `updated >= -Nd`
 *                                  et mode 'merge' (préserve l'existant). Sinon : full sync 'replace'.
 *   - `overwrite` (boolean)     : si true, ignore la liste d'équipes retirées ET l'archive des
 *                                  sprints clos (tout est retéléchargé depuis JIRA). Sinon, les
 *                                  équipes retirées ne sont pas recréées et les sprints clos
 *                                  déjà en base ne sont pas redemandés.
 */
export async function importFromJira(options = {}) {
    const projectRaw = store.get('project');
    if (!projectRaw) throw new Error('Aucun projet JIRA configure');
    const projects = projectRaw.split(',').map(p => p.trim()).filter(Boolean);
    const sinceDays = Number.isInteger(options.sinceDays) && options.sinceDays > 0 ? options.sinceDays : null;
    // Équipes retirées à ignorer (sauf si réimport complet demandé).
    const excludedTeams = options.overwrite
        ? new Set()
        : new Set(getExcludedTeams().map(t => t.toLowerCase()));

    showProgress();
    setProgress(2, sinceDays ? `Sync rapide (${sinceDays}j)...` : 'Sync complète…', `${projects.length} ${projects.length > 1 ? 'projets' : 'projet'}`);

    let resultat = null;
    try {
        // « Tout réimporter depuis JIRA » veut dire tout : l'archive des sprints clos est
        // alors contournée, sinon le réimport intégral n'en serait pas un.
        const archiveOn = !options.overwrite && syncSetting('archiveClosed') > 0;
        resultat = await _doImport(projects, sinceDays, excludedTeams, archiveOn);
        return resultat;
    } finally {
        // Sur exception, `resultat` est null : la carte se referme normalement, l'erreur étant
        // déjà remontée à l'appelant (toast rouge). Le rapport ne sert qu'aux imports qui
        // aboutissent avec des trous — les seuls que rien ne signalait.
        hideProgress(resultat?.incidents || []);
    }
}

async function _doImport(projects, sinceDays = null, excludedTeams = new Set(), archiveOn = false) {
    const quickMode = sinceDays != null;
    resetUnmapped();   // libellés JIRA inconnus de cette synchro (utils/jira-mapping.js)
    // Une équipe est exclue si son nom (insensible à la casse) figure dans la liste des retraits.
    const isExcludedTeam = name => excludedTeams.size > 0 && excludedTeams.has(String(name || '').toLowerCase());
    if (excludedTeams.size) {
        console.log(`[Squad-Board] ${excludedTeams.size} ${excludedTeams.size > 1 ? 'équipes' : 'équipe'} ${excludedTeams.size > 1 ? 'retirées' : 'retirée'} ${excludedTeams.size > 1 ? 'ignorées' : 'ignorée'} : ${[...excludedTeams].join(', ')}`);
    }
    // Clause à appendre aux JQL pour ne récupérer que les issues modifiées récemment
    const updClause = quickMode ? ` AND updated >= -${sinceDays}d` : '';
    // Read user-configurable sync settings from localStorage. Empty = Infinity (no cap).
    const _readCap = key => {
        const raw = (projectStorage.getItem(key) || '').trim();
        if (!raw) return Infinity;
        const n = parseInt(raw);
        return isNaN(n) || n < 1 ? Infinity : n;
    };
    const maxFeaturesPerJql = _readCap('sb-sync-maxFeatures');
    const maxBoards         = _readCap('sb-sync-maxBoards');

    // 1. Champs JIRA (story points, sprint, équipe, PI, contributeurs) — sync-fields.js
    setProgress(5, 'Detection des champs JIRA...');
    const { storyPointsField, sprintFieldId, piSprintField, teamFieldId, fieldIndex: _fieldIndex } = await detectSyncFields();

    // Échecs partiels : collectés plutôt qu'avalés (voir makeIncidents).
    const incidents = makeIncidents();

    // 2. Fetch boards (paginated, capped by maxBoards setting)
    setProgress(10, 'Recuperation des boards...', 'Scan des boards');
    let allBoards = [];
    let startAt = 0;
    let hasMore = true;
    let boardsError = null;   // conservé : sans lui, un 401 se raconte en « aucun board »
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
        } catch (e) { boardsError = e; hasMore = false; }
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
    let excludedBoardCount = 0;
    for (const b of scrumBoards) {
        const teamName = extractTeam(b.name);
        // Équipe retirée → on ne scanne pas son board (économise toutes ses requêtes).
        if (isExcludedTeam(teamName)) { excludedBoardCount++; continue; }
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

    const _skipDetail = `${skippedCount} kanban ignorés` + (excludedBoardCount ? ` · ${excludedBoardCount} retirés` : '');
    setProgress(15, `${boards.length} equipes (scrum)`, _skipDetail);
    if (!boards.length) {
        // Une liste vide a deux causes très différentes, et les confondre envoie chercher un
        // problème de configuration de projets là où JIRA a simplement refusé la connexion.
        if (boardsError) throw new Error(api.jiraErrorMessage(boardsError, 'la liste des boards'));
        throw new Error(`Aucun board scrum pour ${projects.join(', ')}`);
    }

    // Sprints clos déjà en base : on ne les redemandera pas à JIRA (sync complète seulement —
    // le quick mode saute déjà toute la passe et préserve l'existant par le merge).
    const archive = _buildClosedArchive(archiveOn && !quickMode, isExcludedTeam);
    // Sprints clos déjà constatés vides : l'archive ne peut pas les retenir (aucun ticket à
    // retenir), et sans cette mémoire ils constituent la totalité des appels qu'elle laisse passer.
    const emptyClosed = _loadEmptyClosed(archiveOn && !quickMode);
    const emptyClosedBefore = emptyClosed.size;
    if (archive.sprintCount) {
        console.log(`[Squad-Board] Archive : ${archive.sprintCount} sprints clos déjà en base (${archive.ticketCount} tickets) — non retéléchargés.`);
    }

    const allTickets = [];
    const allFeatures = [];
    const allEpics = [];
    const teamsSet = new Map();
    const membersMap = new Map();
    let sprintInfo = null;
    const teamSprints = [];  // sprint actif par équipe (collecté pendant le scan des boards)
    const seenTicketIds = new Set();  // dédoublonnage tickets (actif + sprints clos)
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
                    } catch (e) { incidents.add(`sprints ${st}`, e); }
                }
                // 2. Closed récents pour la vélocité historique — pagine jusqu'au bout et garde les N derniers.
                //    ⚡ Quick mode : on saute totalement cette passe (l'historique de vélocité ne change pas
                //    sur une fenêtre récente ; il est préservé côté DB via le merge des teamSprints). Gros gain.
                if (!quickMode) try {
                    const CLOSED_KEEP = syncSetting('closedKeep') || SYNC_DEFAULTS.closedKeep;
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
                } catch (e) { incidents.add('sprints clos (historique de vélocité)', e); }
                return [...byId.values()];
            })(),
            api.jiraGet(`rest/agile/1.0/board/${board.id}/configuration`)
                .catch(e => { incidents.add('configuration de board (colonnes)', e); return null; }),
        ]);
        allBoardSprints = sprintsResult.status === 'fulfilled' ? (sprintsResult.value || []) : [];
        boardConfig     = configResult.status  === 'fulfilled' ? configResult.value : null;
        // Velocity (Greenhopper) — only if closed sprints exist. Sauté en quick mode (historique inchangé).
        const hasClosed = allBoardSprints.some(s => s.state === 'closed');
        if (!quickMode && hasClosed) {
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
            } catch (e) {
                // 404 = board sans rapport d'estimation : cas nominal, pas un incident.
                if (e?.status !== 404) incidents.add('rapport de vélocité', e);
            }
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
            // Statuts forcés (Paramètres → JIRA) : ils passent dans leur colonne cible (Done, En cours, À faire).
            if (colArray.length) boardColumns[teamName] = forceColumns(teamName, colArray);
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
            // ⚠️ Seulement si le nom porte un numéro d'itération (« NN.N ») : sinon rien n'a été
            // retiré et le nom entier deviendrait une équipe (sprint futur « Prochain PI »).
            const teamFromSprintName = extractSprintLabel(s.name) ? extractTeam(s.name) : '';
            const effectiveTeam = (teamFromSprintName && teamFromSprintName !== 'Autre'
                && teamFromSprintName !== teamName && teamFromSprintName.length > teamName.length)
                ? teamFromSprintName
                : teamName;
            // Date de fin EFFECTIVE : pour un sprint clos, JIRA distingue endDate (planifiée)
            // et completeDate (clôture réelle, souvent décalée de quelques jours). On affiche
            // la date réelle pour les sprints clos, en conservant la planifiée pour référence.
            const _effEnd = (s.state === 'closed' && s.completeDate) ? s.completeDate : s.endDate;
            teamSprints.push({
                team: effectiveTeam,
                name: s.name,
                startDate: s.startDate,
                endDate: _effEnd,                  // réelle si close (completeDate), sinon planifiée
                plannedEndDate: s.endDate,         // toujours la date planifiée JIRA
                completeDate: s.completeDate || null,
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

        // Only fetch active-sprint issues if we have an active sprint (scrum boards).
        // Skip kanban boards without sprint - they can have 10k+ issues in backlog.
        // ⚠ On NE skippe PLUS tout le board : la passe « sprints clos » ci-dessous doit
        // tourner même sans sprint actif (un board peut n'avoir que des sprints clos).
        if (activeSprint) try {
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
                        fields: `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,flagged,updated,created,comment,description,issuelinks${contributorsFieldParam()}`,
                    }
                );
                const issues = resp.issues || [];
                for (const issue of issues) {
                    const ticket = transformIssue(issue, teamName, activeSprint, storyPointsField, boardStatusMap);
                    if (ticket.leader) membersMap.set(ticket.leader, { name: ticket.leader, team: teamName });
                    if (ticket.reporter) membersMap.set(ticket.reporter, { name: ticket.reporter, team: teamName });
                    seenTicketIds.add(issue.key);
                    if (ticket.type === 'feature') allFeatures.push(ticket);
                    else if (ticket.type === 'epic') allEpics.push(ticket);
                    else allTickets.push(ticket);
                }
                issueStart += issues.length;
                issueHasMore = issues.length > 0 && issueStart < (resp.total || 0);
            }
        } catch (e) {
            console.warn(`Erreur issues board ${board.name}:`, e);
            incidents.add('tickets d’un board', e);
        }

        // 3a-bis. Tickets des sprints CLOS récents → disponibles en local pour l'historique
        // vélocité/buffer (Health). Cap configurable (Paramètres) ; 0 = désactivé.
        // Par défaut on couvre ~1 PI (6 sprints). Dédoublonnage via seenTicketIds.
        // ⚡ Quick mode : sauté (historique inchangé sur fenêtre récente, préservé en DB via merge).
        const CLOSED_TICKET_SPRINTS = quickMode ? 0 : syncSetting('closedTicketSprints');
        if (CLOSED_TICKET_SPRINTS > 0) {
            let skippedByArchive = 0;
            const closedSprints = allBoardSprints
                .filter(s => s.state === 'closed' && s.id)
                .sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))
                .slice(0, CLOSED_TICKET_SPRINTS);
            for (const cs of closedSprints) {
                const csId = String(cs.id);
                // Déjà en base et clos : son contenu est figé, on le réinjectera tel quel.
                if (archive.bySprintId.has(csId)) { skippedByArchive++; continue; }
                // Déjà constaté vide : rien à en tirer, et il ne se remplira pas tout seul.
                if (emptyClosed.has(csId)) { skippedByArchive++; continue; }
                try {
                    let recus = 0;
                    let cStart = 0;
                    while (cStart < 1000) {
                        const r = await api.jiraGet(`rest/agile/1.0/sprint/${cs.id}/issue`, {
                            maxResults: 100, startAt: cStart,
                            expand: 'changelog',
                            // description / comment / issuelinks (3.249.0) : sans eux, les tickets des sprints clos arrivaient
                            // VIDES en base (référence du Poker, fiche, Rétro) alors que JIRA en avait une.
                            fields: `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,flagged,updated,created,description,comment,issuelinks${contributorsFieldParam()}`,
                        });
                        const issues = r?.issues || [];
                        recus += issues.length;
                        for (const issue of issues) {
                            if (seenTicketIds.has(issue.key)) continue;  // déjà pris (sprint actif ou clos plus récent)
                            seenTicketIds.add(issue.key);
                            const tk = transformIssue(issue, teamName, cs, storyPointsField, boardStatusMap);
                            // Features/epics sont gérés par leurs passes JQL dédiées → on n'ajoute que les tickets
                            if (tk.type === 'feature' || tk.type === 'epic') continue;
                            allTickets.push(tk);
                        }
                        if (issues.length < 100 || (r.total && cStart + issues.length >= r.total)) break;
                        cStart += issues.length;
                    }
                    // Zéro issue sur un appel RÉUSSI : le sprint est bien vide. C'est le seul
                    // endroit où l'inscrire — dans le `catch`, « rien reçu » voudrait dire « panne ».
                    if (recus === 0 && archiveOn) emptyClosed.add(csId);
                } catch (e) { incidents.add('tickets d’un sprint clos', e); }
            }
            if (skippedByArchive) {
                setProgress(pct, `Board ${bi + 1}/${totalBoards}: ${teamName}`,
                    `${skippedByArchive} ${skippedByArchive > 1 ? 'sprints' : 'sprint'} clos déjà en base — non retéléchargés`);
            }
        }
    }

    // 3b → 6.5 : passes JQL (sprints futurs, features, epics, sprints PI nommés, enfants de features,
    // améliorations, buffer historique) — sync-passes.js, contexte partagé `ctx` (tableaux mutés en place)
    const jqlProject = projects.length > 1
        ? `project IN (${projects.join(',')})`
        : `project=${projects[0]}`;
    const ctx = {
        projects, jqlProject, updClause, quickMode, maxFeaturesPerJql, sprintInfo, knownBoardTeams,
        storyPointsField, sprintFieldId, piSprintField, teamFieldId, fieldIndex: _fieldIndex,
        allTickets, allFeatures, allEpics, incidents,
        rank: { feature: 0, epic: 0 },   // ordre JIRA (« ORDER BY Rank ASC ») des features / epics, partagé entre passes
    };
    await fetchNextPiFutureTickets(ctx);
    await fetchFeatures(ctx);
    await fetchEpics(ctx);
    await fetchPiNamedSprints(ctx);
    await fetchFeatureChildren(ctx);
    await fetchImprovementTickets(ctx);
    const bufferBySprintId = await fetchBufferHistory(ctx);

    // 6.9 Réinjection de l'archive — les sprints clos non retéléchargés.
    // ⚠️ Doit passer AVANT le filet d'exclusion (étape 7) et avant l'import (étape 8), sinon
    // les tickets d'une équipe retirée reviendraient par la bande.
    // ⚠️ `seenTicketIds` fait foi : un ticket archivé qui a ÉTÉ rapatrié par une passe fraîche
    // (typiquement un reporté, qui porte maintenant le sprint actif) est déjà là dans sa
    // version à jour — la copie figée ne doit pas la remplacer.
    if (archive.ticketCount) {
        let reinjectes = 0;
        for (const lot of archive.bySprintId.values()) {
            for (const t of lot) {
                if (seenTicketIds.has(t.id)) continue;
                seenTicketIds.add(t.id);
                allTickets.push(t);
                reinjectes++;
            }
        }
        console.log(`[Squad-Board] Archive réinjectée : ${reinjectes} tickets de sprints clos (${archive.ticketCount - reinjectes} déjà repris par une passe fraîche).`);
    }

    if (archiveOn && !quickMode && emptyClosed.size !== emptyClosedBefore) {
        _saveEmptyClosed(emptyClosed);
        console.log(`[Squad-Board] Sprints clos vides mémorisés : ${emptyClosed.size} (+${emptyClosed.size - emptyClosedBefore}) — ils ne seront plus réinterrogés.`);
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

    // 7-bis. Filet de sécurité exclusions : les équipes retirées peuvent réapparaître via les
    // passes JQL (Team[Team], features cross-board…), pas seulement via leur board. On les retire
    // ici, juste avant l'import, quelle que soit la source. Garantit qu'une équipe retirée ne
    // revient JAMAIS par défaut (sauf réimport complet, qui vide la liste d'exclusion).
    let teamSprintsOut = teamSprints;
    if (excludedTeams.size) {
        const _before = { t: allTickets.length, f: allFeatures.length, e: allEpics.length };
        const _keep = item => !isExcludedTeam(item.team);
        const filteredTickets  = allTickets.filter(_keep);
        const filteredFeatures = allFeatures.filter(_keep);
        const filteredEpics    = allEpics.filter(_keep);
        teamSprintsOut = teamSprints.filter(s => !isExcludedTeam(s.team));
        allTickets.length = 0;  allTickets.push(...filteredTickets);
        allFeatures.length = 0; allFeatures.push(...filteredFeatures);
        allEpics.length = 0;    allEpics.push(...filteredEpics);
        for (const name of [...teamsSet.keys()]) if (isExcludedTeam(name)) teamsSet.delete(name);
        console.log(`[Squad-Board] Exclusions appliquées : -${_before.t - allTickets.length} tickets, -${_before.f - allFeatures.length} features, -${_before.e - allEpics.length} epics`);
    }

    // 7.b Tickets de suivi Support (« Paillettes support - PI31 », GCOM-4785) : l'API Agile renvoie la
    // description en wiki markup, qui PERD les titres des blocs repliables (« 🟦 Itération 31.2.2 ») — la
    // frise de la page Équipe en a besoin pour ranger les tâches par semaine. Relecture ciblée en v3 (ADF,
    // titres conservés par parseADF `expand`) : 1 ticket par PI, coût négligeable.
    const trackers = allTickets.filter(t => t.type === 'support' && /paillettes|suivi.*support/i.test(t.title || ''));
    for (const t of trackers) {
        try {
            const r = await api.jiraGet(`rest/api/3/issue/${encodeURIComponent(t.id)}`, { fields: 'description' });
            const adf = r?.fields?.description;
            if (adf && typeof adf === 'object') t.description = parseADF(adf);
        } catch (e) {
            console.warn(`[Squad-Board] Description ADF de ${t.id} indisponible, wiki markup conservé :`, e?.message || e);
        }
    }

    // 7.c Contributeurs = observateurs JIRA quand l'instance n'a pas de champ Contributeurs (sync-watchers.js) :
    // relus pour les seuls tickets ouverts suivis par d'autres que porteur / rapporteur ; retire `_watchCount`.
    await fillContributorsFromWatchers({ tickets: allTickets, features: allFeatures, epics: allEpics }, {
        prevTickets: store.get('tickets') || [],
        onProgress: (n, tot) => setProgress(88, 'Contributeurs (observateurs JIRA)...', `${n}/${tot}`),
        incidents,
    });

    // 8. Import into database
    setProgress(90, 'Sauvegarde en base...', `${allTickets.length} tickets (dont amelioration), ${allFeatures.length} features, ${allEpics.length} epics`);

    const teams = [...teamsSet.entries()].map(([name, color]) => ({ name, color }));
    const jiraMembers = [...membersMap.values()];

    // ⚡ Quick mode : on ne re-scanne plus les sprints clos (cf. optimisations ci-dessus).
    // On fusionne donc les sprints fraîchement collectés (actif + futurs) avec ceux déjà en base
    // (clos, avec leur vélocité/buffer) pour ne PAS perdre l'historique. Les sprints réimportés
    // (même jiraId) écrasent l'ancienne version ; les autres sont conservés tels quels.
    if (quickMode) {
        const prev = store.get('sprintInfo')?.teamSprints || [];
        const incomingIds = new Set(teamSprintsOut.map(s => String(s.jiraId)));
        const preserved = prev.filter(s => !incomingIds.has(String(s.jiraId)) && !isExcludedTeam(s.team));
        teamSprintsOut = [...preserved, ...teamSprintsOut];
    }

    // Members are managed exclusively via CSV import in Settings - JIRA never touches them.
    // Le sprint global (sprintInfo) reste pour la rétrocompat ; teamSprints[] permet le filtrage par équipe.
    // IMPORTANT : on persiste teamSprints même sans sprintInfo (cas où aucun board n'a de sprint actif
    // mais a des closed/future — on veut quand même afficher la barre dans la modal calendrier).
    // Qui synchronise et comment (bandeau « données obsolètes », 3.197.0) : le nom saisi au poste
    // (poker / frise), sinon l'email JIRA saisi dans Paramètres — jamais celui du .env (compte partagé).
    let syncedBy = '';
    try { syncedBy = (localStorage.getItem('sb-poker-myname') || '').trim(); } catch { /* stockage indisponible */ }
    if (!syncedBy) syncedBy = (api.getJiraCreds().user || '').trim();
    const sprintPayload = (sprintInfo || teamSprintsOut.length)
        ? { ...(sprintInfo || {}), teamSprints: teamSprintsOut, syncedBy, syncKind: quickMode ? `rapide-${sinceDays}` : 'complete' }
        : null;
    const withVelocity = teamSprintsOut.filter(s => s.velocity > 0).length;
    console.log(`[Squad-Board] Sprints persistés : ${teamSprintsOut.length} entrées (${[...new Set(teamSprintsOut.map(s => s.team))].length} équipes) | ${withVelocity} avec vélocité | ${quickMode ? 'merge quick (historique préservé)' : 'full'} | sprintInfo global : ${sprintInfo ? sprintInfo.name : 'aucun'}`);

    // Quick mode = merge (préserve les items existants non touchés par cette sync)
    // Full mode  = replace (efface puis ré-importe — état propre)
    await api.importAll({
        tickets: allTickets,
        features: allFeatures,
        epics: allEpics,
        teams,
        sprint: sprintPayload ? [sprintPayload] : [],
    }, quickMode ? 'merge' : 'replace');
    // Statuts / types qu'aucune source ne range → Paramètres → JIRA → Correspondance (une rapide complète la liste)
    saveUnmapped({ merge: quickMode });

    if (sprintPayload) {
        await api.updateSprint(sprintPayload);
    }

    setProgress(100, 'Import termine !', `${allTickets.length} tickets, ${teams.length} equipes`);
    await new Promise(r => setTimeout(r, 600));

    // Échecs partiels : tracés en console ET remontés à l'appelant, pour que l'import ne se
    // conclue pas sur un toast de succès alors que des données manquent.
    if (incidents.total) {
        console.warn(`[Squad-Board] ${incidents.summary()}`);
        for (const i of incidents.list()) {
            console.warn(`[Squad-Board]   · ${i.quoi}${i.status ? ` HTTP ${i.status}` : ''} ×${i.count} — ${i.message}`);
        }
    }

    return {
        ticketCount: allTickets.length, featureCount: allFeatures.length,
        epicCount: allEpics.length, teamCount: teams.length,
        boardColumns, projectTeams,
        incidents: incidents.list(),
        incidentCount: incidents.total,
        incidentSummary: incidents.summary(),
    };
}

