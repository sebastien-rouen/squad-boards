/**
 * Synchro JIRA d'UN ticket depuis sa popin (3.248.0).
 *
 * Bouton ↻ de la barre de titre → l'issue est relue dans JIRA (proxy `/jira/*`, mêmes
 * identifiants que la synchro) et transformée par `transformIssue` (sync-parse.js : UNE seule
 * lecture d'une issue dans l'app). Le panneau compare les champs métier au ticket local et
 * propose deux gestes :
 *   ⬇ « Prendre JIRA »   — le ticket local est réécrit avec la version JIRA (PUT /api/tickets/:id) ;
 *   ⬆ « Pousser vers JIRA » — les champs cochés partent vers JIRA (titre, points, priorité,
 *      étiquettes, leader, statut par TRANSITION), puis le ticket est relu pour rester aligné.
 * Sans différence visible, le ticket est rafraîchi en silence (historique, durées, liens).
 * Vaut pour les tickets, les FEATURES et les EPICS : seuls les champs que l'entité locale connaît
 * (clés de son serializer) sont comparés et réécrits — rang et dépendances d'une feature restent locaux.
 *
 * ⚠️ Chargé en import DYNAMIQUE par modal.js (il tire sync-parse.js, 25 Ko) — ne pas l'importer
 * statiquement. ⚠️ La description n'est jamais poussée : JIRA attend de l'ADF, le local tient du HTML.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, mapStatus, priorityKey, fmtRelative } from '../utils.js';
import { STATUS_LABELS, SYNC_CONFIG } from '../config.js';
import { projectStorage } from '../project-settings.js';

const PANEL_ID = 'mjs-panel';
const PI_FIELD_RE = /\bpi\b[\s_-]*(sprint|planning|increment|it[eé]ration)|program[\s_-]*increment|art[\s_-]*sprint/i;

let _parse = null;     // module sync-parse.js (chargé à la demande)
let _fields = null;    // ids des champs JIRA résolus (une fois par session)

// ── Champs JIRA ──────────────────────────────────────────────────────────────
/** Même résolution que la synchro (sync.js) : surcharge localStorage > nom JQL > auto-détection. */
async function resolveFields() {
    if (_fields) return _fields;
    const fields = await api.jiraGet('rest/api/3/field');
    const over = key => (projectStorage.getItem(key) || '').trim() || null;
    const resolve = (ov, auto) => {
        if (ov && /^customfield_\d+$/.test(ov)) return ov;
        if (ov) {
            const hit = fields.find(f => f.clauseNames?.includes(ov) || f.name?.toLowerCase() === ov.toLowerCase());
            if (hit) return hit.id;
        }
        return auto()?.id || null;
    };
    const sp = fields.find(f => f.custom && f.name?.toLowerCase().includes('story point'))?.id || 'story_points';
    const sprint = resolve(over('sb-sync-sprintField'), () => fields.find(f => f.custom && f.name?.toLowerCase() === 'sprint'))
        || SYNC_CONFIG.sprintField;
    const pi = resolve(over('sb-sync-piSprintField'), () => fields.find(f => f.custom && PI_FIELD_RE.test(f.name || '')));
    _parse.setContributorsField(_parse.detectContributorsField(fields, over('sb-sync-contributorsField')));
    _fields = { sp, sprint, pi };
    return _fields;
}

async function fetchRemote(local) {
    _parse ||= await import('../sync-parse.js');
    const F = await resolveFields();
    const fields = ['summary', 'status', 'issuetype', 'assignee', 'reporter', 'priority', 'labels', F.sp, 'parent',
        'flagged', 'updated', 'created', 'comment', 'description', 'issuelinks', 'fixVersions', F.sprint, F.pi]
        .filter(Boolean).join(',') + _parse.contributorsFieldParam();
    const issue = await api.jiraGet(`rest/api/3/issue/${encodeURIComponent(local.id)}`, { expand: 'changelog', fields });
    // Équipe locale conservée (la synchro la déduit du board, introuvable depuis une seule issue) ;
    // pas de colonnes de board non plus → le statut interne n'est recalculé que si le libellé JIRA a bougé.
    const r = _parse.transformIssue(issue, local.team, null, F.sp, null, F.sprint, F.pi, null);
    const sameLabel = (r.jiraStatus || '') === (local.jiraStatus || '');
    r.status = sameLabel ? local.status : r.status;
    r.team = local.team;
    // L'id de sprint ne vient que de l'API Agile : gardé tant que le nom n'a pas changé.
    r.sprint = (r.sprintName || null) === (local.sprintName || null) ? (local.sprint ?? null) : null;
    delete r._jiraStatus;
    delete r._watchCount;
    if (local.type !== 'epic') delete r.feature;
    // Sans champ Contributeurs dans l'instance : contributeurs = observateurs (3.251.0, même règle que la synchro)
    if (_parse.contributorsFromWatchers() && local.type !== 'feature' && local.type !== 'epic') {
        try {
            const w = await import('../sync-watchers.js');
            r.contributors = w.watchersToContributors(await w.fetchWatchers(local.id), r);
        } catch { r.contributors = local.contributors || []; }   // panne ≠ « personne »
    }
    return r;
}

// ── Comparaison ──────────────────────────────────────────────────────────────
const _norm = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const _labels = v => [...(v || [])].map(x => String(x).trim()).filter(Boolean).sort().join(', ');
const _same = (a, b) => _norm(a).toLowerCase() === _norm(b).toLowerCase();
const _fmtStatus = t => `${STATUS_LABELS[t.status] || t.status || '—'}${t.jiraStatus ? ` · ${t.jiraStatus}` : ''}`;

/** Champs présentés dans le panneau. `push` = peut partir vers JIRA ; `diff(l, r)` = vrai si différents. */
const FIELDS = [
    { key: 'title',    label: 'Titre',        push: true,  show: t => t.title,              diff: (l, r) => !_same(l.title, r.title) },
    { key: 'status',   label: 'Statut',       push: true,  show: _fmtStatus,
      diff: (l, r) => l.status !== r.status || !_same(l.jiraStatus, r.jiraStatus) },
    { key: 'points',   label: 'Points',       push: true,  show: t => String(t.points ?? 0), diff: (l, r) => Number(l.points || 0) !== Number(r.points || 0) },
    { key: 'leader',   label: 'Leader',       push: true,  show: t => t.leader || t.assignee || '—',
      diff: (l, r) => !_same(l.leader || l.assignee, r.leader) },
    { key: 'priority', label: 'Priorité',     push: true,  show: t => t.priority || '—',
      diff: (l, r) => !_same(l.priority, r.priority) && priorityKey(l.priority) !== priorityKey(r.priority) },
    { key: 'labels',   label: 'Étiquettes',   push: true,  show: t => _labels(t.labels) || '—', diff: (l, r) => _labels(l.labels) !== _labels(r.labels) },
    { key: 'reporter', label: 'Rapporteur',   push: false, show: t => t.reporter || '—',   diff: (l, r) => !_same(l.reporter, r.reporter) },
    { key: 'sprintName', label: 'Sprint',     push: false, show: t => t.sprintName || '—', diff: (l, r) => !_same(l.sprintName, r.sprintName) },
    { key: 'epic',     label: 'Parent',       push: false, show: t => t.epic || '—',       diff: (l, r) => !_same(l.epic, r.epic) },
    { key: 'type',     label: 'Type',         push: false, show: t => t.type,              diff: (l, r) => l.type !== r.type },
    { key: 'flagged',  label: 'Drapeau',      push: false, show: t => (t.flagged ? '🚩 levé' : 'aucun'), diff: (l, r) => !!l.flagged !== !!r.flagged },
    { key: 'contributors', label: 'Contributeurs', push: false, show: t => _labels(t.contributors) || '—',
      diff: (l, r) => _labels(l.contributors) !== _labels(r.contributors) },
    { key: 'description', label: 'Description', push: false, show: t => (_norm(t.description) ? `${_norm(t.description).length} car.` : 'vide'),
      diff: (l, r) => _norm(l.description) !== _norm(r.description) },
    { key: 'comments', label: 'Commentaires', push: false, show: t => String((t.comments || []).length),
      diff: (l, r) => (l.comments || []).length !== (r.comments || []).length },
];

/** Lignes applicables : le champ existe sur l'entité locale (feature / epic en ont moins qu'un ticket). */
const diffRows = (local, remote) => FIELDS.filter(f => (f.key === 'status' || f.key in local) && f.diff(local, remote));

const _kind = t => (t.type === 'feature' ? 'features' : t.type === 'epic' ? 'epics' : 'tickets');
const _updater = t => (t.type === 'feature' ? api.updateFeature : t.type === 'epic' ? api.updateEpic : api.updateTicket);

// ── Écritures ────────────────────────────────────────────────────────────────
/** Réécrit l'entité locale avec la version JIRA (clés qu'elle connaît) et la remplace dans le store. */
async function applyRemote(local, remote) {
    const isTicket = _kind(local) === 'tickets';
    const payload = {};
    for (const key of Object.keys(local)) {
        if (key === 'id' || key === 'assignee' || !(key in remote)) continue;
        if (!isTicket && (key === 'type' || key === 'createdAt' || key === 'updatedAt')) continue;  // factory CRUD : dates non normalisées
        payload[key] = remote[key];
    }
    const saved = await _updater(local)(local.id, payload);
    const kind = _kind(local);
    store.set(kind, (store.get(kind) || []).map(t => (t.id === local.id ? saved : t)));
    return saved;
}

/** Priorité JIRA correspondant à la valeur locale (libellé exact, sinon même palier). */
async function jiraPriorityName(localValue) {
    const list = await api.jiraGet('rest/api/3/priority');
    const exact = list.find(p => _same(p.name, localValue));
    if (exact) return exact.name;
    return list.find(p => priorityKey(p.name) === priorityKey(localValue))?.name || null;
}

/** accountId d'une personne assignable sur l'issue — nom exact, sinon résultat unique. */
async function jiraAccountId(issueKey, name) {
    const users = await api.jiraGet('rest/api/3/user/assignable/search', { issueKey, query: name, maxResults: 20 });
    const exact = users.filter(u => _same(u.displayName, name));
    const pick = exact.length === 1 ? exact[0] : (users.length === 1 ? users[0] : null);
    return pick?.accountId || null;
}

/** Envoie les champs cochés vers JIRA. Retourne les avertissements (champ non poussé et pourquoi). */
async function pushLocal(local, keys, transitionId) {
    const F = await resolveFields();
    const fields = {};
    const warnings = [];
    if (keys.has('title'))  fields.summary = local.title;
    if (keys.has('points')) fields[F.sp] = Number(local.points || 0);
    if (keys.has('labels')) fields.labels = [...(local.labels || [])].map(x => String(x).trim()).filter(Boolean);
    if (keys.has('priority')) {
        const name = await jiraPriorityName(local.priority);
        if (name) fields.priority = { name };
        else warnings.push(`priorité « ${local.priority} » inconnue dans JIRA`);
    }
    if (keys.has('leader')) {
        const name = local.leader || local.assignee;
        if (!name) fields.assignee = null;
        else {
            const accountId = await jiraAccountId(local.id, name);
            if (accountId) fields.assignee = { accountId };
            else warnings.push(`« ${name} » introuvable ou ambigu parmi les assignables`);
        }
    }
    if (Object.keys(fields).length) await api.jiraSend('PUT', `rest/api/3/issue/${encodeURIComponent(local.id)}`, { fields });
    if (keys.has('status')) {
        if (transitionId) await api.jiraSend('POST', `rest/api/3/issue/${encodeURIComponent(local.id)}/transitions`, { transition: { id: transitionId } });
        else warnings.push('aucune transition JIRA ne mène à ce statut');
    }
    return warnings;
}

// ── Panneau ──────────────────────────────────────────────────────────────────
function _transitionOptions(transitions, localStatus) {
    const opts = transitions.map(t => ({ id: String(t.id), name: t.name, to: t.to?.name || '', key: mapStatus(t.to?.name || '') }));
    const pre = opts.find(o => o.key === localStatus);
    return { opts, preId: pre?.id || '' };
}

function _rowHtml(f, local, remote, trans) {
    const pushCell = !f.push ? '<td class="mjs-push"><span class="text-muted" title="Mis à jour depuis JIRA seulement">⬇</span></td>'
        : `<td class="mjs-push"><input type="checkbox" data-mjs-key="${f.key}" checked aria-label="Pousser ${esc(f.label)} vers JIRA"></td>`;
    let localCell = esc(f.show(local));
    if (f.key === 'status' && trans) {
        const sel = trans.opts.length
            ? `<select class="mjs-select" id="mjs-transition" aria-label="Transition JIRA">
                ${trans.opts.map(o => `<option value="${esc(o.id)}"${o.id === trans.preId ? ' selected' : ''}>${esc(o.name)} → ${esc(o.to)}</option>`).join('')}
               </select>`
            : '<span class="text-muted text-xs">aucune transition disponible</span>';
        localCell += `<div class="mjs-sub">${sel}</div>`;
    }
    return `<tr>
        <th scope="row">${esc(f.label)}</th>
        <td class="mjs-local">${localCell}</td>
        <td class="mjs-remote">${esc(f.show(remote))}</td>
        ${pushCell}
    </tr>`;
}

function _panelHtml(local, remote, rows, trans) {
    const pushable = rows.filter(f => f.push).length;
    const meta = [
        remote.updatedAt ? `JIRA modifié ${fmtRelative(remote.updatedAt)}` : '',
        local.updatedAt ? `local ${fmtRelative(local.updatedAt)}` : '',
    ].filter(Boolean).join(' · ');
    return `
        <header class="mjs-head">
            <span class="mjs-title">↻ JIRA · ${esc(local.id)}</span>
            <span class="mjs-meta">${esc(meta)}</span>
            <button type="button" class="btn-icon mjs-close" id="mjs-close" aria-label="Fermer la comparaison">×</button>
        </header>
        <table class="mjs-table">
            <thead><tr><th scope="col">Champ</th><th scope="col">Ici</th><th scope="col">Dans JIRA</th><th scope="col" title="Pousser vers JIRA">⬆</th></tr></thead>
            <tbody>${rows.map(f => _rowHtml(f, local, remote, trans)).join('')}</tbody>
        </table>
        <footer class="mjs-actions">
            <span class="mjs-note text-xs text-muted">⬇ remplace le ticket local par JIRA · ⬆ envoie les champs cochés (titre, points, priorité, étiquettes, leader, statut)</span>
            <button type="button" class="btn btn-secondary btn-sm" id="mjs-pull">⬇ Prendre JIRA</button>
            <button type="button" class="btn btn-primary btn-sm" id="mjs-push"${pushable ? '' : ' disabled'}>⬆ Pousser vers JIRA</button>
        </footer>`;
}

/** Relecture SILENCIEUSE d'une entité (lot « Relire les descriptions manquantes », Paramètres → JIRA). */
export async function refreshFromJira(local) {
    return applyRemote(local, await fetchRemote(local));
}

/**
 * Point d'entrée (bouton ↻ de la popin). `host` = corps de la modale ; `onApplied()` est appelé
 * après toute écriture locale (la popin se re-rend).
 */
export async function openJiraTicketSync(local, { host, onApplied }) {
    host.querySelector(`#${PANEL_ID}`)?.remove();
    let remote;
    try { remote = await fetchRemote(local); }
    catch (e) { toast(api.jiraErrorMessage(e, `le ticket ${local.id}`), 'error'); return; }

    const rows = diffRows(local, remote);
    if (!rows.length) {
        try {
            await applyRemote(local, remote);
            toast(`${local.id} déjà à jour avec JIRA · historique rafraîchi`, 'success');
            await onApplied?.();
        } catch (e) { toast(e.message, 'error'); }
        return;
    }

    let trans = null;
    if (rows.some(f => f.key === 'status')) {
        try {
            const r = await api.jiraGet(`rest/api/3/issue/${encodeURIComponent(local.id)}/transitions`);
            trans = _transitionOptions(r.transitions || [], local.status);
        } catch { trans = { opts: [], preId: '' }; }
    }

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'mjs';
    panel.setAttribute('aria-label', 'Comparaison avec JIRA');
    panel.innerHTML = _panelHtml(local, remote, rows, trans);
    host.prepend(panel);
    panel.querySelector('#mjs-close').focus();

    const busy = on => panel.querySelectorAll('button, input, select').forEach(el => { el.disabled = on; });
    panel.querySelector('#mjs-close').onclick = () => panel.remove();

    panel.querySelector('#mjs-pull').onclick = async () => {
        busy(true);
        try {
            await applyRemote(local, remote);
            toast(`${local.id} mis à jour depuis JIRA (${rows.length} ${rows.length > 1 ? 'champs' : 'champ'})`, 'success');
            panel.remove();
            await onApplied?.();
        } catch (e) { toast(e.message, 'error'); busy(false); }
    };

    panel.querySelector('#mjs-push').onclick = async () => {
        const keys = new Set([...panel.querySelectorAll('input[data-mjs-key]:checked')].map(i => i.dataset.mjsKey));
        if (!keys.size) { toast('Aucun champ coché à pousser', 'warning'); return; }
        const transitionId = panel.querySelector('#mjs-transition')?.value || null;
        busy(true);
        try {
            const warnings = await pushLocal(local, keys, transitionId);
            // Relecture : le ticket local repart de ce que JIRA a réellement enregistré.
            const fresh = await fetchRemote(local);
            await applyRemote(local, fresh);
            if (warnings.length) toast(`Poussé vers JIRA, sauf : ${warnings.join(' ; ')}`, 'warning');
            else toast(`${local.id} poussé vers JIRA · ticket aligné`, 'success');
            panel.remove();
            await onApplied?.();
        } catch (e) { toast(api.jiraErrorMessage(e, `la mise à jour de ${local.id}`), 'error'); busy(false); }
    };
}
