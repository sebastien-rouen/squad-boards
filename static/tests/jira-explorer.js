/**
 * JIRA Explorer — debug & inspection tool.
 *
 * Hash routing (state = URL = shareable):
 *   #tab=inspect&key=GCOM-1234         → tab Inspection, charge GCOM-1234
 *   #tab=inspect&key=GCOM-1234&chain=1 → idem + remonte la chaîne hiérarchique
 *   #tab=snapshot&pi=PI%2330&team=Fuego → snapshot filtré
 *   #tab=jql&jql=project%3DGCOM        → JQL pré-remplie + exécutée
 *   #preset=gcom-features              → applique un preset nommé
 *
 * Aussi compatible query params (?tab=...) — hash prioritaire si les deux présents.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

async function jiraGet(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`/jira/${path}${qs ? '?' + qs : ''}`);
    if (!r.ok) throw new Error(`JIRA ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return r.json();
}
async function apiGet(path) {
    const r = await fetch(`/api/${path}`);
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
}

// Local DB index — used to compare JQL results against synced state.
// Returns Map<id, type> where type ∈ 'ticket'|'feature'|'epic'.
let _localIndex = null;
async function getLocalIndex(force = false) {
    if (_localIndex && !force) return _localIndex;
    try {
        const [t, f, e] = await Promise.all([
            apiGet('tickets').catch(() => []),
            apiGet('features').catch(() => []),
            apiGet('epics').catch(() => []),
        ]);
        const m = new Map();
        for (const x of t) m.set(x.id, 'ticket');
        for (const x of f) m.set(x.id, 'feature');
        for (const x of e) m.set(x.id, 'epic');
        _localIndex = m;
        window._epicsCache = e;
    } catch { _localIndex = new Map(); }
    return _localIndex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field discovery
// ─────────────────────────────────────────────────────────────────────────────

let _sprintFieldId = null;
let _teamFieldId = null;
let _storyPointsFieldId = null;
let _fieldIndex = new Map();
async function discoverFieldIds() {
    if (_fieldIndex.size) return;
    try {
        const fields = await jiraGet('rest/api/3/field');
        for (const f of fields) if (f.id && f.name) _fieldIndex.set(f.id, f.name);
        const sf = fields.find(f => f.custom && /^sprint$/i.test(f.name || ''));
        if (sf) _sprintFieldId = sf.id;
        const tf = fields.find(f => f.custom && (f.schema?.type === 'team' || /team|equipe/i.test(f.name || '')));
        if (tf) _teamFieldId = tf.id;
        const spf = fields.find(f => f.custom && /story\s*points?/i.test(f.name || ''));
        if (spf) _storyPointsFieldId = spf.id;
    } catch (e) { console.warn('Field discovery failed:', e); }
}

function parseSprintName(val) {
    if (!val) return null;
    const arr = Array.isArray(val) ? val : [val];
    const order = { active: 0, future: 1, closed: 2 };
    const parsed = arr.map(item => {
        if (item && typeof item === 'object') return { name: item.name, state: (item.state || '').toLowerCase() };
        if (typeof item === 'string') {
            const m = item.match(/\bname=([^,\]]+)/);
            const s = item.match(/\bstate=([^,\]]+)/);
            return { name: m?.[1]?.trim() || null, state: (s?.[1] || '').toLowerCase() };
        }
        return { name: null, state: '' };
    }).filter(p => p.name);
    parsed.sort((a, b) => (order[a.state] ?? 99) - (order[b.state] ?? 99));
    return parsed[0] || null;
}
function extractTeamName(val) {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val[0]?.name || val[0]?.displayName || null;
    return val.name || val.displayName || val.title || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// JIRA → local payload transform (mini-version de sync.js · transformIssue)
// ─────────────────────────────────────────────────────────────────────────────

function _normalizeTeam(rawName, knownTeams) {
    if (!rawName) return rawName;
    const cleaned = String(rawName).trim();
    if (!knownTeams?.length) return cleaned;
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

function _mapStatus(name) {
    const n = (name || '').toLowerCase();
    if (/done|terminé|termine|closed|résolu|resolu|fini/.test(n)) return 'done';
    if (/progress|en cours|doing|wip/.test(n)) return 'inprog';
    if (/review|relecture/.test(n)) return 'review';
    if (/test|qa/.test(n)) return 'test';
    if (/block|bloqué|bloque/.test(n)) return 'blocked';
    return 'todo';
}

function _mapType(jiraType) {
    const n = (jiraType || '').toLowerCase();
    if (/bug|anomalie/.test(n)) return 'bug';
    if (/story|récit|recit|user/.test(n)) return 'story';
    if (/ops|operation/.test(n)) return 'ops';
    if (/spike/.test(n)) return 'spike';
    if (/task|tâche|tache|sous-tâche|subtask/.test(n)) return 'task';
    return 'task';
}

function _piFromIssue(f, sprintInfo) {
    const piS = sprintInfo?.name && (sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i))?.[1];
    if (piS) return `PI#${piS}`;
    const piL = (f.labels || []).find(l => /^PI[#_\s]?\d+$/i.test(l));
    if (piL) { const m = piL.match(/(\d+)/); return m ? `PI#${m[1]}` : null; }
    for (const v of (f.fixVersions || [])) {
        const m = (v.name || '').match(/PI[#_\s]?(\d+)/i);
        if (m) return `PI#${m[1]}`;
    }
    return null;
}

async function _syncIssues(issues) {
    const localTeams = await apiGet('teams').catch(() => []);
    const knownTeams = localTeams.map(t => t.name).filter(Boolean);

    const tickets = [], features = [], epics = [];
    for (const iss of issues) {
        const f = iss.fields || {};
        const sprintInfo = parseSprintName(_sprintFieldId ? f[_sprintFieldId] : null);
        const teamRaw = extractTeamName(_teamFieldId ? f[_teamFieldId] : null);
        const team = _normalizeTeam(teamRaw, knownTeams);
        const jiraType = (f.issuetype?.name || '').toLowerCase();
        const isEpic = jiraType === 'epic';
        const isFeature = /feature|fonctionnalit/i.test(jiraType);
        const rawSp = _storyPointsFieldId ? f[_storyPointsFieldId] : null;
        const points = rawSp != null ? Number(rawSp) : 0;

        const common = {
            id: iss.key,
            title: f.summary || '',
            status: _mapStatus(f.status?.name),
            team: team || 'Autre',
            leader: f.assignee?.displayName || null,
            labels: f.labels || [],
            piSprint: _piFromIssue(f, sprintInfo),
            sprintName: sprintInfo?.name || null,
            priority: f.priority?.name?.toLowerCase() || 'medium',
            points,
        };

        if (isEpic) {
            epics.push({ ...common, feature: f.parent?.key || null });
        } else if (isFeature) {
            features.push(common);
        } else {
            tickets.push({ ...common, type: _mapType(jiraType), epic: f.parent?.key || null });
        }
    }

    const r = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets, features, epics, mode: 'merge' }),
    });
    if (!r.ok) throw new Error(`Import ${r.status}: ${await r.text().catch(() => '')}`);
    return { result: await r.json(), counts: { tickets: tickets.length, features: features.length, epics: epics.length } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS_INSPECT = [
    { id: 'sample-gex',  label: 'GEX-17193', color: 'c1', key: 'GEX-17193', desc: 'feature Juke PI#30' },
    { id: 'sample-gdc',  label: 'GDC-13872', color: 'c2', key: 'GDC-13872', desc: 'feature Caméléon PI#29' },
];

const PRESETS_JQL = [
    { id: 'fuego-pi30',      label: 'Fuego · PI#30',          color: 'c2', jql: '"Team[Team]" = "GCOM - Fuego" AND (labels in ("PI30","PI#30") OR fixVersion ~ "PI30" OR sprint in futureSprints())' },
    { id: 'gcom-features',   label: 'Features GCOM',          color: 'c1', jql: 'project=GCOM AND issuetype IN (Feature, "Fonctionnalite")' },
    { id: 'gcom-epics',      label: 'Epics GCOM',             color: 'c5', jql: 'project=GCOM AND issuetype=Epic' },
    { id: 'gcom-pi30',       label: 'GCOM tickets PI#30',     color: 'c2', jql: 'project=GCOM AND (labels in ("PI30","PI#30") OR fixVersion ~ "PI30")' },
    { id: 'features-pi30',   label: 'Features PI#30 (tous)',  color: 'c6', jql: 'issuetype IN (Feature, "Fonctionnalite") AND labels in ("PI30","PI#30")' },
    { id: 'epics-orphans',   label: 'Epics sans parent',      color: 'c3', jql: 'issuetype=Epic AND parent is EMPTY' },
    { id: 'no-team',         label: 'Issues sans Team[Team]', color: 'c7', jql: '"Team[Team]" is EMPTY AND issuetype IN (Feature, Epic)' },
    { id: 'future-sprints',  label: 'Sprints futurs (50 dern.)', color: 'c4', jql: 'sprint in futureSprints() ORDER BY updated DESC' },
    { id: 'recent-features', label: 'Features récentes',      color: 'c8', jql: 'issuetype=Feature ORDER BY updated DESC' },
];

function renderPresets(container, presets, onClick) {
    container.innerHTML = presets.map(p => `
        <button class="chip ${p.color}" data-preset="${esc(p.id)}" title="${esc(p.desc || p.jql || '')}">
            <span class="dot"></span>${esc(p.label)}
        </button>`).join('');
    container.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = presets.find(p => p.id === btn.dataset.preset);
            if (preset) onClick(preset);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash / URL state
// ─────────────────────────────────────────────────────────────────────────────

function readParams() {
    const fromHash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const fromQuery = new URLSearchParams(location.search);
    const out = {};
    for (const [k, v] of fromQuery) out[k] = v;
    for (const [k, v] of fromHash) out[k] = v;  // hash overrides query
    return out;
}
function writeParams(state, { push = true } = {}) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) {
        if (v != null && v !== '') sp.set(k, v);
    }
    const newHash = sp.toString() ? `#${sp.toString()}` : '#';
    if (location.hash !== newHash) {
        if (push) history.pushState(null, '', newHash);
        else      history.replaceState(null, '', newHash);
    }
    updateUrlPill(state);
}
function updateUrlPill(state) {
    const parts = Object.entries(state).filter(([, v]) => v != null && v !== '');
    $('#url-pill').textContent = parts.length
        ? `#${parts.map(([k, v]) => `${k}=${v}`).join('&').slice(0, 60)}${parts.toString().length > 60 ? '…' : ''}`
        : '#';
}

function activateTab(tabName) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tabName));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Inspect
// ─────────────────────────────────────────────────────────────────────────────

async function inspectIssue(key, withChain = false) {
    await discoverFieldIds();
    const container = $('#lookup-result');
    container.innerHTML = '<div class="empty"><span class="loader"></span>Chargement…</div>';

    let jiraIssue = null, jiraErr = null;
    let localTicket = null, localFeature = null, localEpic = null;

    try { jiraIssue = await jiraGet(`rest/api/3/issue/${encodeURIComponent(key)}`); }
    catch (e) { jiraErr = e.message; }

    try { localTicket = await apiGet(`tickets/${encodeURIComponent(key)}`); } catch {}
    try { localFeature = await apiGet(`features/${encodeURIComponent(key)}`); } catch {}
    if (!localTicket && !localFeature) {
        try {
            if (!window._epicsCache) window._epicsCache = await apiGet('epics');
            localEpic = (window._epicsCache || []).find(e => e.id === key) || null;
        } catch {}
    }
    const local = localTicket || localFeature || localEpic;
    const localType = localTicket ? 'ticket' : localFeature ? 'feature' : localEpic ? 'epic' : null;

    if (jiraErr && !local) {
        container.innerHTML = `<div class="err">Issue introuvable. JIRA : ${esc(jiraErr)}. Local : aucune entrée.</div>`;
        return;
    }

    const f = jiraIssue?.fields || {};
    const sprintInfo = parseSprintName(_sprintFieldId ? f[_sprintFieldId] : null);
    const teamName = extractTeamName(_teamFieldId ? f[_teamFieldId] : null);
    const sp = _storyPointsFieldId ? f[_storyPointsFieldId] : null;
    const piL = (f.labels || []).find(l => /^PI[#_\s]?\d+$/i.test(l));
    const piF = (f.fixVersions || []).find(v => /PI[#_\s]?\d+/i.test(v.name || ''));
    const piS = sprintInfo?.name && (sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i))?.[1];

    let html = `<div class="pair">
        <div class="col">
            <h3 class="jira">JIRA · live</h3>
            ${jiraIssue ? `
            <dl class="kv">
                <dt>Clé</dt><dd>${esc(jiraIssue.key)}</dd>
                <dt>Titre</dt><dd>${esc(f.summary || '')}</dd>
                <dt>Type</dt><dd><span class="badge info">${esc(f.issuetype?.name || '?')}</span></dd>
                <dt>Statut</dt><dd>${esc(f.status?.name || '?')}</dd>
                <dt>Parent</dt><dd>${f.parent ? `<a href="javascript:void(0)" onclick="window._inspect('${esc(f.parent.key)}')"><strong>${esc(f.parent.key)}</strong></a> — ${esc(f.parent.fields?.summary || '')} <span class="badge muted">${esc(f.parent.fields?.issuetype?.name || '')}</span>` : '<span class="empty">aucun</span>'}</dd>
                <dt>Responsable</dt><dd>${esc(f.assignee?.displayName || '—')}</dd>
                <dt>Reporter</dt><dd>${esc(f.reporter?.displayName || '—')}</dd>
                <dt>Labels</dt><dd>${(f.labels || []).map(l => `<span class="badge muted">${esc(l)}</span>`).join(' ') || '—'}</dd>
                <dt>fixVersions</dt><dd>${(f.fixVersions || []).map(v => esc(v.name)).join(', ') || '—'}</dd>
                <dt>Sprint</dt><dd>${sprintInfo ? `<strong>${esc(sprintInfo.name)}</strong> <span class="badge ${sprintInfo.state === 'active' ? 'ok' : 'muted'}">${esc(sprintInfo.state || '?')}</span>` : '<span class="empty">aucun</span>'}</dd>
                <dt>Team[Team]</dt><dd>${teamName ? `<strong>${esc(teamName)}</strong>` : '<span class="empty">aucun</span>'}</dd>
                <dt>Story Points</dt><dd>${sp != null ? `<strong>${esc(String(sp))}</strong>` : '<span class="empty">—</span>'}</dd>
                <dt>PI détecté</dt><dd>${[
                    piS && `<span class="badge ok">PI#${piS} <small>(sprint)</small></span>`,
                    piL && `<span class="badge ok">${esc(piL)} <small>(label)</small></span>`,
                    piF && `<span class="badge ok">${esc(piF.name)} <small>(fixVer)</small></span>`,
                ].filter(Boolean).join(' ') || '<span class="empty">aucun</span>'}</dd>
                <dt>Créé · MAJ</dt><dd>${esc((f.created || '').slice(0, 10))} → ${esc((f.updated || '').slice(0, 10))}</dd>
            </dl>
            <details class="raw">
                <summary>Champs custom non-null</summary>
                <pre>${esc(JSON.stringify(
                    Object.fromEntries(Object.entries(f).filter(([k, v]) => k.startsWith('customfield_') && v != null)
                        .map(([k, v]) => [`${k} · ${_fieldIndex.get(k) || '?'}`, typeof v === 'object' ? v : v])),
                    null, 2))}</pre>
            </details>
            ` : `<div class="err">${esc(jiraErr || 'Erreur')}</div>`}
        </div>
        <div class="col">
            <h3 class="local">Base locale · SQLite</h3>
            ${local ? `
            <dl class="kv">
                <dt>Type local</dt><dd><span class="badge info">${esc(localType)}</span></dd>
                <dt>Clé</dt><dd>${esc(local.id)}</dd>
                <dt>Titre</dt><dd>${esc(local.title || '')}</dd>
                <dt>Statut</dt><dd>${esc(local.status || '')}</dd>
                <dt>Équipe</dt><dd>${esc(local.team || '—')}</dd>
                <dt>Leader</dt><dd>${esc(local.leader || '—')}</dd>
                ${localType === 'ticket' ? `
                <dt>Epic parent</dt><dd>${local.epic ? `<a href="javascript:void(0)" onclick="window._inspect('${esc(local.epic)}')"><strong>${esc(local.epic)}</strong></a>` : '<span class="empty">aucun</span>'}</dd>
                <dt>Points</dt><dd>${esc(local.points ?? '—')}</dd>` : ''}
                ${localType === 'epic' ? `
                <dt>Feature parent</dt><dd>${local.feature ? `<a href="javascript:void(0)" onclick="window._inspect('${esc(local.feature)}')"><strong>${esc(local.feature)}</strong></a>` : '<span class="badge warn">⚠ aucune (chaîne héritage cassée)</span>'}</dd>` : ''}
                <dt>Story Points</dt><dd>${(local.points ?? 0) > 0 ? `<strong>${esc(String(local.points))}</strong>` : '<span class="empty">0</span>'}</dd>
                <dt>piSprint</dt><dd>${local.piSprint ? `<span class="badge ok">${esc(local.piSprint)}</span>` : '<span class="empty">null</span>'}</dd>
                <dt>Labels</dt><dd>${(local.labels || []).map(l => `<span class="badge muted">${esc(l)}</span>`).join(' ') || '—'}</dd>
                <dt>Sprint snapshot</dt><dd>${esc(local.sprintName || '—')}</dd>
            </dl>
            ` : `<div class="empty">Pas trouvée en base locale (pas synchro, projet hors scope, ou type filtré).</div>`}
        </div>
    </div>`;

    if (withChain && jiraIssue) {
        html += `<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Chaîne hiérarchique JIRA</h2><span class="desc">parents (haut) → racine → enfants</span></div><div class="card-bd"><div id="chain-container" class="chain"><div class="empty"><span class="loader"></span>Chargement…</div></div></div></div>`;
        container.innerHTML = html;
        await renderChain(jiraIssue, $('#chain-container'));
    } else {
        container.innerHTML = html;
    }
}

async function renderChain(rootIssue, container) {
    const nodes = [];
    let cur = rootIssue, safety = 8;
    while (cur && safety-- > 0) {
        nodes.unshift(cur);
        const parentKey = cur.fields?.parent?.key;
        if (!parentKey) break;
        try { cur = await jiraGet(`rest/api/3/issue/${parentKey}`); } catch { break; }
    }
    let children = [];
    try {
        const resp = await jiraGet('rest/api/3/search/jql', {
            jql: `parent = ${rootIssue.key}`, maxResults: 20,
            fields: 'summary,issuetype,status',
        });
        children = resp.issues || [];
    } catch {}

    const lines = [];
    nodes.forEach((iss, idx) => {
        const isRoot = iss.key === rootIssue.key;
        lines.push(`
            <div class="chain-node ${isRoot ? 'root' : ''}" style="margin-left:${idx * 22}px">
                <span class="lvl">${esc(iss.fields?.issuetype?.name || '?')}</span>
                <a href="javascript:void(0)" onclick="window._inspect('${esc(iss.key)}')" class="id">${esc(iss.key)}</a>
                <span class="title">${esc(iss.fields?.summary || '')}</span>
                ${isRoot ? '<span class="badge info">racine</span>' : ''}
            </div>`);
    });
    children.forEach(c => {
        lines.push(`
            <div class="chain-node" style="margin-left:${nodes.length * 22}px; opacity:0.85">
                <span class="lvl">${esc(c.fields?.issuetype?.name || '?')}</span>
                <a href="javascript:void(0)" onclick="window._inspect('${esc(c.key)}')" class="id">${esc(c.key)}</a>
                <span class="title">${esc(c.fields?.summary || '')}</span>
                <span class="badge muted">enfant</span>
            </div>`);
    });
    if (children.length === 20) {
        lines.push(`<div class="empty" style="margin-left:${nodes.length * 22}px">… plus de 20 enfants, tronqué</div>`);
    }
    container.innerHTML = lines.join('') || '<div class="empty">Aucun lien hiérarchique.</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Snapshot
// ─────────────────────────────────────────────────────────────────────────────

async function loadSnapshot() {
    const container = $('#snapshot-result');
    container.innerHTML = '<div class="empty"><span class="loader"></span>Chargement…</div>';
    const piFilter = $('#filter-pi').value.trim();
    const teamFilter = $('#filter-team').value.trim().toLowerCase();

    let tickets = [], features = [], epics = [];
    try {
        [tickets, features, epics] = await Promise.all([
            apiGet('tickets').catch(() => []),
            apiGet('features').catch(() => []),
            apiGet('epics').catch(() => []),
        ]);
        window._epicsCache = epics;
        // Rebuild local index from fresh data (used by JQL comparison)
        const idx = new Map();
        for (const x of tickets) idx.set(x.id, 'ticket');
        for (const x of features) idx.set(x.id, 'feature');
        for (const x of epics) idx.set(x.id, 'epic');
        _localIndex = idx;
    } catch (e) { container.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }

    const filt = arr => arr.filter(x =>
        (!piFilter || x.piSprint === piFilter) &&
        (!teamFilter || (x.team || '').toLowerCase().includes(teamFilter)));

    const fT = filt(tickets), fF = filt(features), fE = filt(epics);
    const dist = (arr, key) => {
        const m = {};
        for (const x of arr) {
            const k = (typeof key === 'function' ? key(x) : x[key]) || '— null';
            m[k] = (m[k] || 0) + 1;
        }
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const orphanEpics = fE.filter(e => !e.feature);
    const orphanTickets = fT.filter(t => t.epic && !fE.find(e => e.id === t.epic));
    const proj = x => (x.id || '').split('-')[0] || '?';

    const stat = (label, value, kind = '') =>
        `<div class="stat ${kind}"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`;
    const distHtml = entries => entries.map(([k, n]) =>
        `<div><span class="count">${n}</span><code data-quick-filter="${esc(k)}">${esc(k)}</code></div>`).join('');

    container.innerHTML = `
    <div class="stat-grid">
        ${stat('Tickets', fT.length)}
        ${stat('Features', fF.length)}
        ${stat('Epics', fE.length)}
        ${stat('Epics sans feature parent', orphanEpics.length, orphanEpics.length ? 'warn' : 'ok')}
        ${stat('Tickets→epic absent', orphanTickets.length, orphanTickets.length ? 'warn' : 'ok')}
    </div>

    <div class="pair" style="margin-top: 18px">
        <div class="col">
            <h3>Tickets · par projet</h3>
            <div class="dist">${distHtml(dist(fT, proj))}</div>
            <h3 style="margin-top: 16px">Tickets · par PI</h3>
            <div class="dist">${distHtml(dist(fT, 'piSprint'))}</div>
            <h3 style="margin-top: 16px">Tickets · par équipe</h3>
            <div class="dist">${distHtml(dist(fT, 'team'))}</div>
            <h3 style="margin-top: 16px">Tickets · par type</h3>
            <div class="dist">${distHtml(dist(fT, 'type'))}</div>
        </div>
        <div class="col">
            <h3>Features · par projet</h3>
            <div class="dist">${distHtml(dist(fF, proj))}</div>
            <h3 style="margin-top: 16px">Features · par PI</h3>
            <div class="dist">${distHtml(dist(fF, 'piSprint'))}</div>
            <h3 style="margin-top: 16px">Features · par équipe</h3>
            <div class="dist">${distHtml(dist(fF, 'team'))}</div>
            <h3 style="margin-top: 16px">Epics · par PI</h3>
            <div class="dist">${distHtml(dist(fE, 'piSprint'))}</div>
            <h3 style="margin-top: 16px">Epics · par équipe</h3>
            <div class="dist">${distHtml(dist(fE, 'team'))}</div>
        </div>
    </div>`;

    // Code chips → quick filter
    container.querySelectorAll('code[data-quick-filter]').forEach(el => {
        el.addEventListener('click', () => {
            const v = el.dataset.quickFilter;
            if (v.startsWith('PI#')) { $('#filter-pi').value = v; }
            else { $('#filter-team').value = v; }
            updateSnapshotUrl();
            loadSnapshot();
        });
    });
}

function updateSnapshotUrl() {
    writeParams({
        tab: 'snapshot',
        pi: $('#filter-pi').value.trim(),
        team: $('#filter-team').value.trim(),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. JQL
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// JQL history (localStorage)
// ─────────────────────────────────────────────────────────────────────────────
const JQL_HIST_KEY = 'jira-explorer-jql-history';
const JQL_HIST_MAX = 15;
function _loadJqlHistory() {
    try { return JSON.parse(localStorage.getItem(JQL_HIST_KEY) || '[]'); }
    catch { return []; }
}
function _saveJqlHistory(jql) {
    const hist = _loadJqlHistory().filter(h => h.jql !== jql);
    hist.unshift({ jql, ts: Date.now() });
    localStorage.setItem(JQL_HIST_KEY, JSON.stringify(hist.slice(0, JQL_HIST_MAX)));
    _refreshHistoryDatalist();
}
function _deleteJqlHistory(jql) {
    const hist = _loadJqlHistory().filter(h => h.jql !== jql);
    localStorage.setItem(JQL_HIST_KEY, JSON.stringify(hist));
    _refreshHistoryDatalist();
    _renderHistoryPanel();
}
function _refreshHistoryDatalist() {
    const dl = $('#jql-history');
    if (!dl) return;
    dl.innerHTML = _loadJqlHistory().map(h => `<option value="${esc(h.jql)}">`).join('');
}
function _renderHistoryPanel() {
    const panel = $('#jql-history-panel');
    if (!panel) return;
    const hist = _loadJqlHistory();
    if (!hist.length) { panel.innerHTML = '<div class="jql-history-empty">Aucune requête récente</div>'; return; }
    const _fmtAgo = ts => {
        const m = Math.floor((Date.now() - ts) / 60000);
        if (m < 1) return 'à l\'instant';
        if (m < 60) return `il y a ${m} min`;
        const h = Math.floor(m / 60);
        if (h < 24) return `il y a ${h}h`;
        return `il y a ${Math.floor(h / 24)}j`;
    };
    panel.innerHTML = hist.map(h => `
        <div class="jql-history-item" data-jql="${esc(h.jql)}">
            <code title="${esc(h.jql)}">${esc(h.jql)}</code>
            <span class="jql-history-time">${esc(_fmtAgo(h.ts))}</span>
            <span class="jql-history-del" data-del="${esc(h.jql)}" title="Retirer de l'historique">×</span>
        </div>`).join('');
}

async function runJql(jqlOverride = null) {
    await discoverFieldIds();
    const container = $('#jql-result');
    if (jqlOverride != null) $('#jql-query').value = jqlOverride;
    const jql = $('#jql-query').value.trim();
    const max = parseInt($('#jql-max').value) || 50;
    if (!jql) { container.innerHTML = '<div class="empty">Saisis une JQL.</div>'; return; }
    container.innerHTML = '<div class="empty"><span class="loader"></span>Chargement (JIRA + base locale)…</div>';
    writeParams({ tab: 'jql', jql, max: max !== 50 ? max : '' });
    _saveJqlHistory(jql);

    try {
        const extra = [_sprintFieldId, _teamFieldId, _storyPointsFieldId].filter(Boolean).join(',');
        const [resp, localIdx] = await Promise.all([
            jiraGet('rest/api/3/search/jql', {
                jql,
                maxResults: Math.max(1, Math.min(200, max)),
                fields: `summary,status,issuetype,assignee,labels,fixVersions,parent${extra ? ',' + extra : ''}`,
            }),
            getLocalIndex(),
        ]);
        const issues = resp.issues || [];
        const total = resp.total ?? issues.length;
        const inLocal = issues.filter(i => localIdx.has(i.key)).length;
        const missing = issues.length - inLocal;
        const ratio = issues.length ? Math.round(inLocal * 100 / issues.length) : 0;

        // Comparison banner — JIRA vs local
        let banner = '';
        if (issues.length) {
            const tone = missing === 0 ? 'ok' : (inLocal === 0 ? 'err' : 'warn');
            const msg = missing === 0
                ? `Toutes les issues retournées sont synchronisées en local.`
                : inLocal === 0
                    ? `Aucune des issues retournées n'est en base locale. Re-sync nécessaire.`
                    : `${missing} issue(s) absente(s) en base — re-sync recommandée pour les avoir localement.`;
            banner = `<div class="compare-banner ${tone}">
                <div class="cb-stat"><strong>${issues.length}</strong> / ${total} <span>JIRA</span></div>
                <div class="cb-arrow">→</div>
                <div class="cb-stat"><strong>${inLocal}</strong> <span>en local</span></div>
                <div class="cb-stat" style="margin-left:auto"><strong>${ratio}%</strong> <span>synchro</span></div>
                <button class="btn" id="btn-sync-jql" title="Upsert dans la base locale (écrase si déjà présent)">↓ Synchro (${issues.length})</button>
                <button class="btn ghost" id="btn-refresh-local">↻ recharger</button>
                <div class="cb-msg">${esc(msg)}</div>
            </div>`;
        }

        let html = banner;
        if (!issues.length) { html += '<div class="empty">Aucun résultat.</div>'; container.innerHTML = html; return; }

        html += `<div class="tbl-wrap"><table class="tbl"><thead><tr>
            <th>Clé</th><th>Local</th><th>Type</th><th>SP</th><th>Titre</th><th>Statut</th>
            <th>Parent</th><th>Équipe</th><th>Sprint</th><th>PI</th><th>Labels</th>
        </tr></thead><tbody>`;
        for (const iss of issues) {
            const f = iss.fields || {};
            const sprintInfo = parseSprintName(_sprintFieldId ? f[_sprintFieldId] : null);
            const teamName = extractTeamName(_teamFieldId ? f[_teamFieldId] : null);
            const sp = _storyPointsFieldId ? f[_storyPointsFieldId] : null;
            const piL = (f.labels || []).find(l => /^PI[#_\s]?\d+$/i.test(l));
            const piF = (f.fixVersions || []).find(v => /PI[#_\s]?\d+/i.test(v.name || ''));
            const piS = sprintInfo?.name && (sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i))?.[1];
            const pi = piS ? `PI#${piS}` : (piL || piF?.name || '');
            const localType = localIdx.get(iss.key);
            const localCell = localType
                ? `<span class="badge ok" title="présent en base locale">✓ ${esc(localType)}</span>`
                : `<span class="badge err" title="absent de la base locale — non synchronisé">✗ absent</span>`;
            html += `<tr class="${localType ? '' : 'row-missing'}">
                <td class="mono"><a href="javascript:void(0)" onclick="window._inspect('${esc(iss.key)}')">${esc(iss.key)}</a></td>
                <td>${localCell}</td>
                <td><span class="badge muted">${esc(f.issuetype?.name || '')}</span></td>
                <td class="mono">${sp != null ? esc(String(sp)) : '<span class="empty">—</span>'}</td>
                <td>${esc((f.summary || '').slice(0, 90))}</td>
                <td>${esc(f.status?.name || '')}</td>
                <td class="mono">${f.parent ? `<a href="javascript:void(0)" onclick="window._inspect('${esc(f.parent.key)}')">${esc(f.parent.key)}</a>` : '—'}</td>
                <td>${esc(teamName || '—')}</td>
                <td>${esc(sprintInfo?.name || '—')}</td>
                <td>${pi ? `<span class="badge ok">${esc(pi)}</span>` : '<span class="empty">—</span>'}</td>
                <td>${(f.labels || []).slice(0, 3).map(l => `<span class="badge muted">${esc(l)}</span>`).join(' ')}</td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
        // (.tbl-wrap allows horizontal scroll while keeping the page as the vertical scroll container,
        //  so the sticky <thead> stays anchored to viewport — see CSS .tbl-wrap rules.)
        container.innerHTML = html;
        $('#btn-refresh-local')?.addEventListener('click', async () => {
            await getLocalIndex(true);
            runJql();  // re-render with fresh cache
        });

        $('#btn-sync-jql')?.addEventListener('click', async () => {
            const btn = $('#btn-sync-jql');
            const orig = btn.textContent;
            btn.disabled = true;
            btn.innerHTML = '<span class="loader"></span>Synchronisation…';
            try {
                const { counts } = await _syncIssues(issues);
                btn.textContent = `✓ ${counts.tickets}t · ${counts.features}f · ${counts.epics}e`;
                btn.classList.add('btn-ok');
                await getLocalIndex(true);
                setTimeout(() => runJql(), 1200);  // re-render → mises à jour des badges Local
            } catch (e) {
                btn.textContent = `✗ ${e.message.slice(0, 40)}`;
                btn.classList.add('btn-err');
                btn.disabled = false;
                setTimeout(() => { btn.textContent = orig; btn.classList.remove('btn-err'); }, 4000);
            }
        });
    } catch (e) {
        container.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiring
// ─────────────────────────────────────────────────────────────────────────────

window._inspect = key => {
    if (!key) return;
    $('#lookup-key').value = key;
    activateTab('inspect');
    writeParams({ tab: 'inspect', key });
    inspectIssue(key, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

$$('.tab').forEach(t => {
    t.addEventListener('click', () => {
        activateTab(t.dataset.tab);
        writeParams({ tab: t.dataset.tab });
    });
});

$('#btn-lookup').addEventListener('click', () => {
    const k = $('#lookup-key').value.trim();
    if (k) { writeParams({ tab: 'inspect', key: k }); inspectIssue(k, false); }
});
$('#btn-lookup-chain').addEventListener('click', () => {
    const k = $('#lookup-key').value.trim();
    if (k) { writeParams({ tab: 'inspect', key: k, chain: 1 }); inspectIssue(k, true); }
});
$('#lookup-key').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const k = $('#lookup-key').value.trim();
        if (k) { writeParams({ tab: 'inspect', key: k }); inspectIssue(k, false); }
    }
});

$('#btn-snapshot').addEventListener('click', () => { updateSnapshotUrl(); loadSnapshot(); });
$('#filter-pi').addEventListener('change', () => { updateSnapshotUrl(); loadSnapshot(); });
$('#filter-team').addEventListener('change', () => { updateSnapshotUrl(); loadSnapshot(); });

$('#btn-jql').addEventListener('click', () => runJql());
$('#jql-query').addEventListener('keydown', e => { if (e.key === 'Enter') runJql(); });

// Historique JQL : panneau toggle + clic sur item
$('#btn-jql-history')?.addEventListener('click', () => {
    const panel = $('#jql-history-panel');
    const visible = panel.style.display !== 'none';
    if (visible) { panel.style.display = 'none'; return; }
    _renderHistoryPanel();
    panel.style.display = 'block';
});
$('#jql-history-panel')?.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) { _deleteJqlHistory(del.dataset.del); return; }
    const item = e.target.closest('.jql-history-item');
    if (item) {
        $('#jql-query').value = item.dataset.jql;
        $('#jql-history-panel').style.display = 'none';
        runJql();
    }
});
_refreshHistoryDatalist();

renderPresets($('#presets-inspect'), PRESETS_INSPECT, p => window._inspect(p.key));
renderPresets($('#presets-jql'), PRESETS_JQL, p => runJql(p.jql));

// ─────────────────────────────────────────────────────────────────────────────
// Boot: apply URL state
// ─────────────────────────────────────────────────────────────────────────────

function applyState() {
    const p = readParams();
    const tab = p.tab || 'inspect';
    activateTab(tab);
    updateUrlPill(p);
    if (tab === 'inspect' && p.key) {
        $('#lookup-key').value = p.key;
        inspectIssue(p.key, p.chain === '1' || p.chain === 'true');
    } else if (tab === 'snapshot') {
        if (p.pi) $('#filter-pi').value = p.pi;
        if (p.team) $('#filter-team').value = p.team;
        loadSnapshot();
    } else if (tab === 'jql' && p.jql) {
        if (p.max) $('#jql-max').value = p.max;
        runJql(p.jql);
    }
    if (p.preset) {
        const preset = [...PRESETS_INSPECT, ...PRESETS_JQL].find(x => x.id === p.preset);
        if (preset?.key) window._inspect(preset.key);
        else if (preset?.jql) { activateTab('jql'); runJql(preset.jql); }
    }
}

window.addEventListener('hashchange', applyState);
discoverFieldIds().then(applyState);
