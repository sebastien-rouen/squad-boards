/**
 * Synchro JIRA — conversion d'un ticket et helpers (extrait de sync.js, 3.178.0, déplacé tel quel) :
 * colonne de board → statut, `transformIssue`, historique récent, ADF → HTML, sprint / PI / équipe,
 * pagination /search/jql. Aucun état : fonctions pures ou appels API.
 */

import * as api from './api.js';
import { mapStatus, mapType, extractTeam, parseWikiMarkup } from './utils.js';
import { CYCLE_START_STATUSES, CYCLE_END_STATUS } from './config.js';
import { forcedStatus } from './utils/status-override.js';

// ── Map JIRA column name → internal status key ───────────────────────────────
export function _mapColToInternal(colName) {
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
export function transformIssue(issue, teamName, sprint, storyPointsField, boardStatusMap = null, sprintFieldId = null, piSprintFieldId = null, teamFieldId = null) {
    const f = issue.fields || {};
    const type = mapType(f.issuetype?.name);
    const jiraStatusName = f.status?.name || '';
    // Préserve le label JIRA brut pour affichage UI (ex: "En cours de développement" au lieu de "En cours")
    const jiraStatus = jiraStatusName;
    const points = f[storyPointsField] || f.story_points || 0;
    const flagged = !!(f.flagged || f.priority?.name?.toLowerCase() === 'blocker');

    // Sprint name: from explicit sprint arg OR from sprint custom field (Cloud obj / Server string)
    const _sprintName = sprint?.name || _parseSprintFieldName(sprintFieldId ? f[sprintFieldId] : null);

    // Team: explicit arg > Team[Team] custom field > extracted from sprint name
    const _teamFromField = teamFieldId ? _extractTeamName(f[teamFieldId]) : null;
    // Team mapping : Team[Team] (vérité SAFe — équipe agile responsable) > board name >
    // extractTeam(sprint name) > 'Autre'.
    // Cas typique : features planifiées sur un board cross-team (ex: "PI Board Features ERPC")
    // → Team[Team]="GCOM - Fuego" doit l'emporter sur le nom du board.
    // Filtre : skip extractTeam si sprint name est juste un tag PI ("PI#29" ≠ équipe).
    const team = _teamFromField
        || teamName
        || (/^PI\s*#?\s*\d+\s*$/i.test(_sprintName || '') ? null : extractTeam(_sprintName))
        || 'Autre';

    // Statut interne : « statuts forcés » d'abord (Paramètres → JIRA, défauts config.js → « À livrer pour
    // validation »… en Terminé pour toutes les équipes sauf Fuego), puis la colonne du board JIRA, puis
    // STATUS_MAP. L'équipe définitive est connue ici : l'exception porte sur elle, pas sur le board.
    const status = forcedStatus(team, jiraStatusName)
        || (boardStatusMap && boardStatusMap[jiraStatusName.toLowerCase().trim()]) || mapStatus(jiraStatusName);

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
                const mapped = forcedStatus(team, toStatus) || (boardStatusMap && boardStatusMap[toStatus]) || mapStatus(toStatus);
                if (!startedDate && CYCLE_START_STATUSES.includes(mapped)) {
                    startedDate = history.created;
                }
                if (!resolvedDate && mapped === CYCLE_END_STATUS) {
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

    // Durées cumulées (jours) passées dans chaque statut JIRA brut — rejoue tout le changelog
    // pour l'indicateur de flux par colonne (Dashboard/PI Planning). Un statut revisité plusieurs
    // fois voit ses durées additionnées. Clé = libellé JIRA brut normalisé (minuscules, trim).
    const stageDurations = {};
    if (issue.changelog?.histories?.length) {
        const statusChanges = [];
        for (const history of issue.changelog.histories) {
            for (const item of (history.items || [])) {
                if (item.field !== 'status') continue;
                statusChanges.push({
                    date: history.created,
                    from: (item.fromString || '').toLowerCase().trim(),
                    to: (item.toString || '').toLowerCase().trim(),
                });
            }
        }
        statusChanges.sort((a, b) => new Date(a.date) - new Date(b.date));
        const _addDuration = (name, fromMs, toMs) => {
            if (!name || !(toMs > fromMs)) return;
            stageDurations[name] = Math.round(((stageDurations[name] || 0) + (toMs - fromMs) / msPerDay) * 10) / 10;
        };
        let curStatus = statusChanges[0]?.from || jiraStatusName.toLowerCase().trim();
        let curSinceMs = new Date(f.created).getTime();
        const endMs = resolvedDate ? new Date(resolvedDate).getTime() : Date.now();
        for (const chg of statusChanges) {
            const chgMs = new Date(chg.date).getTime();
            _addDuration(curStatus, curSinceMs, chgMs);
            curStatus = chg.to;
            curSinceMs = chgMs;
        }
        _addDuration(curStatus, curSinceMs, endMs);
    }

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
        team,   // cf. plus haut : Team[Team] > board > sprint > 'Autre'
        leader: f.assignee?.displayName || null,
        reporter: f.reporter?.displayName || null,
        contributors: [],
        points,
        priority: f.priority?.name?.toLowerCase() || 'medium',
        sprint: sprint?.id || null,
        sprintName: sprint?.name || _sprintName || null,
        piSprint,
        flagged,
        labels: f.labels || [],
        // JIRA hierarchy: ticket→epic→feature. For an Epic issue, parent.key is its Feature, not another epic.
        epic:    type === 'epic' ? null : (f.parent?.key || null),
        feature: type === 'epic' ? (f.parent?.key || null) : undefined,
        description,
        links,
        comments,
        // ⚠️ `createdAt` ALIMENTE DES RÈGLES MÉTIER, pas seulement un affichage :
        // l'anomalie « ajouté en cours de sprint » (business_rules.js, infopanel.js,
        // sprint_tickets_modal.js) la compare au début du sprint. Tant qu'elle n'était pas
        // transmise, le backend y écrivait la date d'import et la règle se déclenchait sur
        // tout ticket non terminé. Toute passe JQL qui produit un ticket DOIT donc demander
        // le champ `created` — sans quoi la date repart à l'heure de la sync.
        createdAt: f.created || null,
        updatedAt: f.updated || null,
        recentChanges: _extractRecentChanges(issue),
        startedDate: startedDate || null,
        resolvedDate: resolvedDate || null,
        cycleTimeDays,
        leadTimeDays,
        stageDurations,
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

// Champs jamais évincés par le cap `max` : nécessaires à la reconstruction de la vélocité
// planifiée "au lancement" (cf. _pointsAtLaunch dans health.js) — un changement Story Points
// ancien noyé sous 8+ changements de statut/assignee plus récents serait sinon perdu, et la
// vélocité planifiée resterait fausse même après resync (footgun GDEM-1777 : 3→5 pts invisible).
const _CHANGE_FIELDS_KEEP_ALL = new Set(['story points', 'sprint']);

function _extractRecentChanges(issue, max = 8) {
    const histories = issue?.changelog?.histories || [];
    if (!histories.length) return [];
    const kept = [], other = [];
    // histories est trié du plus ancien au plus récent ; on parcourt à l'envers
    for (let h = histories.length - 1; h >= 0; h--) {
        const hist = histories[h];
        const author = hist.author?.displayName || 'Inconnu';
        const date   = hist.created;
        for (const item of (hist.items || [])) {
            const rawField = (item.field || item.fieldId || '').toString();
            const fieldKey = rawField.toLowerCase();
            if (_CHANGE_FIELDS_SKIP.has(fieldKey)) continue;
            const entry = {
                date,
                author,
                field: rawField,  // clé technique (status, assignee, sprint…)
                from:  item.fromString || item.from || '',
                to:    item.toString   || item.to   || '',
            };
            (_CHANGE_FIELDS_KEEP_ALL.has(fieldKey) ? kept : other).push(entry);
        }
    }
    // `other` complète jusqu'au quota ; `kept` (Story Points/Sprint) n'est jamais tronqué.
    const remaining = Math.max(0, max - kept.length);
    return [...kept, ...other.slice(0, remaining)]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ── ADF (Atlassian Document Format) → HTML parser ─────────────────────────────
export function parseADF(doc) {
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
        // Bloc repliable : son titre est un ATTRIBUT (pas un enfant) — sans ce cas, `default` rendait le
        // contenu seul et les titres « 🟦 Itération 31.1.2 » du ticket de suivi support disparaissaient
        case 'expand':
        case 'nestedExpand': {
            const title = node.attrs?.title ? `<p><strong>${escHtml(node.attrs.title)}</strong></p>` : '';
            return `<div class="adf-expand">${title}${children()}</div>`;
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
export function _extractTeamName(val) {
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
export async function _paginateJql({ jql, fields, expand, pageSize = 100, cap = Infinity, onPage }) {
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

export function _normalizeTeamName(rawName, knownTeams) {
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
