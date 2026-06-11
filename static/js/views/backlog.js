/**
 * Backlog view — filtres, regroupement sprint/PI, sélection multi-tickets,
 * déplacement en masse, drag & drop, séparateur tickets périmés.
 */
import { store }                                          from '../state.js';
import * as api                                           from '../api.js';
import { esc, fmtRelative, hashColor, initials,
         toast, filterByTeam }                           from '../utils.js';
import { STATUS_LABELS, STATUS_ORDER, TYPE_LABELS }       from '../config.js';
import { openCreateModal }                                from '../components/modal.js';
import { loadFilters, saveFilters,
         applyFilters, clearFilters, hasActiveFilters }   from '../components/backlog-filters.js';
import { BulkManager }                                    from '../components/backlog-bulk.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const LS_STALE     = 'sb-backlog-stale-months';
const LS_GROUPBY   = 'sb-backlog-groupby';
const LS_COLLAPSED = 'sb-backlog-collapsed';
const LS_DENSITY   = 'sb-backlog-density';
const LS_HIDEDONE  = 'sb-backlog-hidedone';
const LS_HIERARCHY = 'sb-backlog-hierarchy';

const HIER_LABELS = { off: 'Plat', epic: 'Épics', full: 'Complet' };

const TYPE_ICONS = {
    story: '✨', bug: '🐛', task: '✅', support: '🎯',
    ops: '⚙️', debt: '🏚️', epic: '⚡', feature: '🚀',
};
const PRIO_COLORS = {
    low:      'var(--status-todo,   #94a3b8)',
    medium:   'var(--status-inprog, #3b82f6)',
    high:     'var(--warning,       #f59e0b)',
    critical: 'var(--danger,        #ef4444)',
};
const PRIO_LABELS = { low: 'Faible', medium: 'Moyen', high: 'Élevé', critical: 'Critique' };

// ── Module-level sort state (preserved across re-renders) ─────────────────────
let _sortKey      = null;
let _sortDir      = 1;   // 1 = asc, -1 = desc
let _kbCleanup    = null;
let _openPopover  = null; // clé du popover filtre actuellement ouvert

// ── Stale helpers ──────────────────────────────────────────────────────────────
function getStaleMonths() {
    return Math.max(1, parseInt(localStorage.getItem(LS_STALE) || '3', 10) || 3);
}
function isStale(t) {
    if (!t.updatedAt) return false;
    return (Date.now() - new Date(t.updatedAt).getTime()) > getStaleMonths() * 30 * 24 * 3600e3;
}

// ── Collapse persistence ───────────────────────────────────────────────────────
function getCollapsed() {
    try { return new Set(JSON.parse(localStorage.getItem(LS_COLLAPSED) || '[]')); }
    catch { return new Set(); }
}
function saveCollapsed(s) {
    localStorage.setItem(LS_COLLAPSED, JSON.stringify([...s]));
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function _fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function _toDateInput(d) {
    if (!d) return '';
    try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
}

// ── Search highlight ───────────────────────────────────────────────────────────
function _highlight(text, term) {
    if (!term) return esc(text);
    const t   = (text  || '').toLowerCase();
    const q   = term.toLowerCase().trim();
    if (!q) return esc(text);
    const idx = t.indexOf(q);
    if (idx === -1) return esc(text);
    return esc(text.slice(0, idx))
         + `<mark class="bl-hl">${esc(text.slice(idx, idx + q.length))}</mark>`
         + esc(text.slice(idx + q.length));
}

// ── Sort icon ──────────────────────────────────────────────────────────────────
function _sortIcon(key) {
    if (_sortKey !== key) return `<span class="bl-sort-icon">↕</span>`;
    return `<span class="bl-sort-icon is-active">${_sortDir > 0 ? '↑' : '↓'}</span>`;
}

// ── Cell HTML helpers ──────────────────────────────────────────────────────────
function statusHtml(status) {
    const s = status || 'todo';
    return `<span class="bl-status" style="background:var(--status-${s}-bg,var(--bg-alt,#f0f4f8));color:var(--status-${s},var(--text-secondary))">${esc(STATUS_LABELS[s] || s)}</span>`;
}
function typeHtml(type) {
    const t = type || 'task';
    return `<span class="bl-type-dot" style="background:color-mix(in srgb,var(--type-${t},#94a3b8) 15%,transparent)" title="${esc(TYPE_LABELS[t] || t)}">${TYPE_ICONS[t] || '?'}</span>`;
}
function avatarHtml(name) {
    if (!name) return `<span style="color:var(--text-muted);font-size:11px;display:block;text-align:center">—</span>`;
    return `<span class="bl-avatar" style="background:${hashColor(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}
function prioHtml(prio) {
    const p = prio || 'medium';
    return `<span class="bl-prio"><span class="bl-prio-dot" style="background:${PRIO_COLORS[p] || 'var(--text-muted)'}"></span>${esc(PRIO_LABELS[p] || p)}</span>`;
}

// ── Sort ───────────────────────────────────────────────────────────────────────
function sortRows(tickets, key = null, dir = 1) {
    const po = { critical: 0, high: 1, medium: 2, low: 3 };
    const so = { blocked: 0, inprog: 1, review: 2, test: 3, todo: 4, done: 5 };
    if (!key) {
        return [...tickets].sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (b.status === 'done' && a.status !== 'done') return -1;
            const pa = po[a.priority] ?? 2, pb = po[b.priority] ?? 2;
            if (pa !== pb) return pa - pb;
            return 0;
        });
    }
    return [...tickets].sort((a, b) => {
        let va = a[key] ?? '', vb = b[key] ?? '';
        if      (key === 'priority') { va = po[va] ?? 99; vb = po[vb] ?? 99; }
        else if (key === 'status')   { va = so[va] ?? 99; vb = so[vb] ?? 99; }
        else if (key === 'points')   { va = Number(va) || 0; vb = Number(vb) || 0; }
        if (typeof va === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'fr') * dir;
    });
}

// ── Grouping ───────────────────────────────────────────────────────────────────
function buildGroups(tickets, groupBy, activeSprints, futureSprints = []) {
    const map = new Map();
    for (const t of tickets) {
        const key = groupBy === 'sprint' ? (t.sprintName || '')
                  : groupBy === 'pi'     ? (t.piSprint   || '')
                  : '__all__';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
    }
    // Ajouter les sprints futurs connus comme groupes vides (pas encore de tickets)
    if (groupBy === 'sprint') {
        for (const name of futureSprints) {
            if (name && !map.has(name)) map.set(name, []);
        }
    }
    return [...map.entries()]
        .sort(([a], [b]) => {
            if (groupBy === 'flat') return 0;
            if (activeSprints.includes(a) && !activeSprints.includes(b)) return -1;
            if (activeSprints.includes(b) && !activeSprints.includes(a)) return 1;
            if (!a && b) return 1; if (a && !b) return -1;
            return b.localeCompare(a, 'fr');
        })
        .map(([key, items]) => ({
            id:        key || `__none_${groupBy}__`,
            label:     key || (groupBy === 'sprint' ? 'Sans sprint' : groupBy === 'pi' ? 'Sans PI' : 'Tous les tickets'),
            isActive:  activeSprints.includes(key),
            isFuture:  futureSprints.includes(key),
            tickets:   sortRows(items, _sortKey, _sortDir),
        }));
}

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCsv(tickets) {
    const hdr = ['ID', 'Titre', 'Type', 'Statut', 'Équipe', 'Leader', 'SP', 'Priorité', 'Sprint', 'PI', 'Mise à jour'];
    const rows = tickets.map(t => [
        t.id, t.title, t.type, STATUS_LABELS[t.status] || t.status,
        t.team || '', t.leader || '', t.points || 0,
        PRIO_LABELS[t.priority] || t.priority || '',
        t.sprintName || '', t.piSprint || '',
        t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('fr-FR') : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [hdr.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `backlog-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
}

// ── Hash sync ──────────────────────────────────────────────────────────────────
// Utilise ~ comme séparateur (unreserved RFC 3986 — jamais encodé par les navigateurs)
// au lieu de ? qui peut être encodé en %3F dans certains navigateurs.
function _syncBacklogHash(filters, groupBy, hierarchyMode) {
    const parts = [];
    if ((filters.statuses   || []).length) parts.push('s=' + filters.statuses.join(','));
    if ((filters.priorities || []).length) parts.push('p=' + filters.priorities.join(','));
    if ((filters.types      || []).length) parts.push('t=' + filters.types.join(','));
    if (filters.search) parts.push('q=' + encodeURIComponent(filters.search));
    if (filters.pi)     parts.push('pi=' + filters.pi);
    if (groupBy && groupBy !== 'sprint') parts.push('g=' + groupBy);
    if (hierarchyMode && hierarchyMode !== 'off') parts.push('h=' + hierarchyMode);

    // Decode pour gérer le cas où le navigateur a encodé ~ ou ? en %7E/%3F
    let curHash;
    try { curHash = decodeURIComponent(location.hash || '#backlog'); }
    catch { curHash = location.hash || '#backlog'; }

    // Supprimer les params existants (~ ou ? pour rétrocompatibilité)
    const base = curHash.replace(/[~?].*$/, '') || '#backlog';
    const qs   = parts.join('~');
    const next = qs ? `${base}~${qs}` : base;
    if (curHash !== next) history.replaceState(null, '', next);
}

function _applyHashFilters(qs) {
    const out = {};
    // Supporte l'ancien format URLSearchParams (&/=) et le nouveau format (~)
    const chunks = qs.includes('&') ? qs.split('&') : qs.split('~');
    for (const chunk of chunks) {
        const eq = chunk.indexOf('=');
        if (eq < 0) continue;
        const k = chunk.slice(0, eq);
        const v = chunk.slice(eq + 1);
        if      (k === 's')  out.statuses   = v.split(',').filter(Boolean);
        else if (k === 'p')  out.priorities = v.split(',').filter(Boolean);
        else if (k === 't')  out.types      = v.split(',').filter(Boolean);
        else if (k === 'q')  out.search     = decodeURIComponent(v);
        else if (k === 'pi') out.pi         = v;
        else if (k === 'g')  localStorage.setItem(LS_GROUPBY,   v);
        else if (k === 'h')  localStorage.setItem(LS_HIERARCHY, v);
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// Main render
// ══════════════════════════════════════════════════════════════════════════════
export function renderBacklog(container) {
    // Consume hash filters emis par applyHash (depuis URL partagée)
    const hashQuery = store.get('backlogHashQuery');
    if (hashQuery) {
        store.set('backlogHashQuery', null);
        const overrides = _applyHashFilters(hashQuery);
        const f = loadFilters();
        Object.assign(f, overrides);
        saveFilters(f);
    }

    const allTickets   = store.get('tickets')     || [];
    const sprintInfo   = store.get('sprintInfo')  || {};
    const teamFilter   = store.get('team')        || 'all';
    const teamObjects  = store.get('teamObjects') || [];
    const teamColorMap = new Map(teamObjects.map(o => [o.name, o.color]));

    const activeSprints = [
        ...(sprintInfo.teamSprints || []).map(s => s.name).filter(Boolean),
        ...(sprintInfo.name ? [sprintInfo.name] : []),
    ];

    const base       = filterByTeam(allTickets, teamFilter);
    const allSprints = [...new Set(allTickets.map(t => t.sprintName).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'fr'));
    const allPIs     = [...new Set(allTickets.map(t => t.piSprint).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'fr'));

    const filters       = loadFilters();
    const groupBy       = localStorage.getItem(LS_GROUPBY)   || 'sprint';
    const collapsed     = getCollapsed();
    const density       = localStorage.getItem(LS_DENSITY)   || 'comfy';
    const hideDone      = localStorage.getItem(LS_HIDEDONE)  === '1';
    const hierarchyMode = localStorage.getItem(LS_HIERARCHY) || 'off';

    const allEpics    = hierarchyMode !== 'off' ? (store.get('epics')    || []) : [];
    const allFeatures = hierarchyMode === 'full' ? (store.get('features') || []) : [];
    const epicMap     = new Map(allEpics.map(e => [e.id, e]));
    const featureMap  = new Map(allFeatures.map(f => [f.id, f]));

    // Sprints futurs connus (peuvent être vides de tickets)
    const futureSprints  = (sprintInfo.teamSprints || [])
        .filter(s => s.state === 'future' && s.name)
        .map(s => s.name);
    const sprintMetaMap  = new Map((sprintInfo.teamSprints || []).map(s => [s.name, s]));

    const visible      = applyFilters(base, filters);
    const ticketGroups = buildGroups(visible, groupBy, activeSprints, futureSprints);

    // Counts from base (pre-backlog-filters) for chip badges
    const counts = { types: {}, statuses: {}, priorities: {} };
    for (const t of base) {
        counts.types[t.type]          = (counts.types[t.type]          || 0) + 1;
        counts.statuses[t.status]     = (counts.statuses[t.status]     || 0) + 1;
        counts.priorities[t.priority] = (counts.priorities[t.priority] || 0) + 1;
    }

    const prevScroll = container.querySelector('#bl-body')?.scrollTop || 0;

    container.innerHTML = `
        <div class="bl-root">
            ${_topbarHtml(filters, allPIs, groupBy, visible.length, base.length, counts, hideDone, density, ticketGroups, hierarchyMode)}
            <div class="bl-body" id="bl-body">
                ${ticketGroups.length === 0
                    ? `<div class="bl-empty">
                           <svg class="icon"><use href="#i-list"/></svg>
                           <p>Aucun ticket ne correspond aux filtres.</p>
                       </div>`
                    : `<table class="bl-table${density === 'compact' ? ' is-compact' : ''}${hideDone ? ' hide-done' : ''}" id="bl-table">
                        <thead><tr>
                            <th class="th-check"><input type="checkbox" class="bl-check" id="bl-check-all" title="Tout sélectionner / désélectionner"></th>
                            <th class="th-type"></th>
                            <th class="th-id bl-th-sort" data-sort="id">ID ${_sortIcon('id')}</th>
                            <th class="bl-th-sort" data-sort="title">Titre ${_sortIcon('title')}</th>
                            <th class="th-stat bl-th-sort" data-sort="status">Statut ${_sortIcon('status')}</th>
                            <th class="th-team">Équipe</th>
                            <th class="th-lead th-center">Leader</th>
                            <th class="th-pts th-center bl-th-sort" data-sort="points">SP ${_sortIcon('points')}</th>
                            <th class="th-prio bl-th-sort" data-sort="priority">Priorité ${_sortIcon('priority')}</th>
                            <th class="th-sprint bl-th-sort" data-sort="sprintName">Sprint ${_sortIcon('sprintName')}</th>
                            <th class="th-upd bl-th-sort" data-sort="updatedAt">Màj ${_sortIcon('updatedAt')}</th>
                        </tr></thead>
                        ${ticketGroups.map(g => _groupTbodyHtml(g, collapsed, teamColorMap, filters.search || '', hierarchyMode, epicMap, featureMap, groupBy, sprintMetaMap)).join('')}
                      </table>`
                }
            </div>
            ${_bulkBarHtml(allSprints, allPIs)}
        </div>
    `;

    requestAnimationFrame(() => {
        const body = container.querySelector('#bl-body');
        if (body && prevScroll) body.scrollTop = prevScroll;
    });

    const bulk = new BulkManager((ids) => _syncBulkUi(container, ids, visible));
    _wireEvents(container, filters, bulk, allSprints, allPIs, ticketGroups, visible, hierarchyMode, sprintMetaMap);

    // Synchronise le hash avec l'état courant des filtres
    _syncBacklogHash(filters, groupBy, hierarchyMode);

    // Ré-ouvre le popover actif après re-render (recompute la position fixe)
    if (_openPopover) {
        const btn = container.querySelector(`.bl-flt-btn[data-flt-toggle="${_openPopover}"]`);
        const pop = btn?.closest('.bl-flt-wrap')?.querySelector('.bl-flt-popover');
        if (btn && pop) {
            const r = btn.getBoundingClientRect();
            pop.style.top  = (r.bottom + 6) + 'px';
            pop.style.left = r.left + 'px';
            btn.classList.add('is-open');
            pop.classList.add('is-open');
        }
    }
}

// ── Filter popover button ──────────────────────────────────────────────────────
function _filterBtn(key, label, activeCount, chips, activeLabels = []) {
    const active = activeCount > 0;
    let tagsHtml = '';
    if (active) {
        if (activeLabels.length > 0) {
            const show = activeLabels.slice(0, 2);
            const rest = activeLabels.length > 2 ? activeLabels.length - 2 : 0;
            tagsHtml = show.map(l => `<span class="bl-flt-sel-tag">${esc(l)}</span>`).join('')
                     + (rest ? `<span class="bl-flt-badge">+${rest}</span>` : '');
        } else {
            tagsHtml = `<span class="bl-flt-badge">${activeCount}</span>`;
        }
    }
    return `<div class="bl-flt-wrap">
        <button type="button" class="bl-flt-btn${active ? ' has-filter' : ''}" data-flt-toggle="${key}">
            <span class="bl-flt-label">${esc(label)}</span>${tagsHtml}<span class="bl-flt-arrow">▾</span>
        </button>
        <div class="bl-flt-popover"><div class="bl-flt-chips">${chips}</div></div>
    </div>`;
}

// ── Topbar HTML ────────────────────────────────────────────────────────────────
function _topbarHtml(filters, allPIs, groupBy, visCount, baseCount, counts, hideDone, density, ticketGroups, hierarchyMode = 'off') {
    const typeChips = Object.entries(TYPE_LABELS).map(([k, v]) => {
        const n = counts.types[k] || 0;
        return `<button type="button" class="chip-sel chip-sel--${k}${(filters.types || []).includes(k) ? ' is-active' : ''}" data-filter="type" data-val="${k}" title="${esc(v)}">${TYPE_ICONS[k] || v}${n ? `<span class="chip-count">${n}</span>` : ''}</button>`;
    }).join('');

    const prioChips = ['critical', 'high', 'medium', 'low'].map(p => {
        const n = counts.priorities[p] || 0;
        return `<button type="button" class="chip-sel chip-sel--${p}${(filters.priorities || []).includes(p) ? ' is-active' : ''}" data-filter="priority" data-val="${p}">${esc(PRIO_LABELS[p])}${n ? `<span class="chip-count">${n}</span>` : ''}</button>`;
    }).join('');

    const statusChips = STATUS_ORDER.map(s => {
        const n = counts.statuses[s] || 0;
        return `<button type="button" class="chip-sel chip-sel--${s}${(filters.statuses || []).includes(s) ? ' is-active' : ''}" data-filter="status" data-val="${s}">${esc(STATUS_LABELS[s] || s)}${n ? `<span class="chip-count">${n}</span>` : ''}</button>`;
    }).join('');

    const piChips = allPIs.map(pi =>
        `<button type="button" class="chip-sel${filters.pi === pi ? ' is-active' : ''}" data-filter="pi-chip" data-val="${esc(pi)}">${esc(pi)}</button>`
    ).join('');

    const typeActive   = (filters.types      || []).length;
    const prioActive   = (filters.priorities || []).length;
    const statusActive = (filters.statuses   || []).length;
    const piActive     = filters.pi ? 1 : 0;
    const hasFilter    = hasActiveFilters(filters);

    const jumpOpts = ticketGroups.map(g =>
        `<option value="${esc(g.id)}">${esc(g.label)} (${g.tickets.length})</option>`
    ).join('');

    return `
    <div class="bl-topbar">
        <div class="bl-toolbar">
            <div class="bl-search">
                <svg class="icon icon-sm bl-search-icon"><use href="#i-search"/></svg>
                <input type="search" id="bl-search" placeholder="ID ou titre… (/)" value="${esc(filters.search || '')}">
            </div>
            <div class="bl-filter-sep"></div>
            ${_filterBtn('type',   'Type',     typeActive,   typeChips,   (filters.types      ||[]).map(k => TYPE_ICONS[k] || TYPE_LABELS[k] || k))}
            ${_filterBtn('prio',   'Priorité', prioActive,   prioChips,   (filters.priorities ||[]).map(p => PRIO_LABELS[p] || p))}
            ${_filterBtn('status', 'État',     statusActive, statusChips, (filters.statuses   ||[]).map(s => STATUS_LABELS[s] || s))}
            ${allPIs.length ? _filterBtn('pi', 'PI', piActive, piChips, filters.pi ? [filters.pi] : []) : ''}
            ${_filterBtn('hier', 'Hiérarchie', hierarchyMode !== 'off' ? 1 : 0,
                ['off','epic','full'].map(v =>
                    `<button type="button" class="chip-sel${hierarchyMode === v ? ' is-active' : ''}" data-filter="hierarchy" data-val="${v}">${HIER_LABELS[v]}</button>`
                ).join(''),
                hierarchyMode !== 'off' ? [HIER_LABELS[hierarchyMode]] : []
            )}
            ${hasFilter ? `<button type="button" class="btn btn-sm btn-secondary bl-icon-btn" id="bl-reset-filters" title="Réinitialiser les filtres">✕</button>` : ''}
            <div class="bl-toolbar-spacer"></div>
            <span class="bl-count"><span class="bl-count-vis">${visCount}</span><span class="bl-count-sep">/</span><span class="bl-count-base">${baseCount}</span></span>
            <div class="bl-filter-sep"></div>
            <div class="chip-sel-group" title="Regrouper par">
                <button type="button" class="chip-sel${groupBy === 'sprint' ? ' is-active' : ''}" data-groupby="sprint">Sprint</button>
                <button type="button" class="chip-sel${groupBy === 'pi'     ? ' is-active' : ''}" data-groupby="pi">PI</button>
                <button type="button" class="chip-sel${groupBy === 'flat'   ? ' is-active' : ''}" data-groupby="flat">Plat</button>
            </div>
            <div class="bl-filter-sep"></div>
            <button type="button" class="bl-icon-btn bl-toggle-btn${hideDone ? ' is-active' : ''}" id="bl-hide-done" title="${hideDone ? 'Afficher les tickets terminés' : 'Masquer les tickets terminés'}">${hideDone ? '⊠' : '⊡'}</button>
            <button type="button" class="bl-icon-btn bl-toggle-btn${density === 'compact' ? ' is-active' : ''}" id="bl-density" title="${density === 'compact' ? 'Vue confortable' : 'Vue compacte'}">${density === 'compact' ? '▤' : '▦'}</button>
            ${jumpOpts ? `<select id="bl-jump-group" class="select bl-sel-sm bl-jump-sel" title="Aller à un groupe"><option value="">Aller à…</option>${jumpOpts}</select>` : ''}
            <div class="bl-btn-group">
                <button type="button" class="bl-icon-btn" id="bl-expand-all" title="Tout ouvrir">⊞</button>
                <button type="button" class="bl-icon-btn" id="bl-collapse-all" title="Tout replier">⊟</button>
            </div>
            <div class="bl-filter-sep"></div>
            <button type="button" class="btn btn-sm btn-secondary" id="bl-csv">⬇ CSV</button>
            <button type="button" class="btn btn-primary btn-sm" id="bl-new">+ Ticket</button>
        </div>
    </div>`;
}

// ── Group tbody HTML ───────────────────────────────────────────────────────────
function _groupTbodyHtml(group, collapsed, teamColorMap = new Map(), searchTerm = '', hierarchyMode = 'off', epicMap = new Map(), featureMap = new Map(), groupBy = 'sprint', sprintMetaMap = new Map()) {
    const coll    = collapsed.has(group.id);
    const totalSP = group.tickets.reduce((s, t) => s + (t.points || 0), 0);
    const doneN   = group.tickets.filter(t => t.status === 'done').length;
    const donePct = group.tickets.length ? Math.round((doneN / group.tickets.length) * 100) : 0;
    const gid     = esc(group.id);
    const sm      = getStaleMonths();

    // Sprint metadata (dates, goal) — uniquement en mode groupBy sprint
    const meta        = groupBy === 'sprint' ? sprintMetaMap.get(group.label) : null;
    const datesHtml   = meta?.startDate
        ? `<span class="bl-group-dates${group.isFuture ? ' is-future' : ''}">${_fmtDate(meta.startDate)} → ${_fmtDate(meta.endDate)}</span>`
        : group.isFuture ? '<span class="bl-group-dates is-future">à venir</span>' : '';
    const goal        = meta?.goal || '';
    const goalSnippet = goal.length > 65 ? goal.slice(0, 65) + '…' : goal;
    const goalHtml    = goal
        ? `<span class="bl-group-goal" title="${esc(goal)}">🎯 ${esc(goalSnippet)}</span>`
        : '';
    const editBtnHtml = meta
        ? `<button type="button" class="bl-goal-btn" data-sprint="${esc(group.label)}" title="Modifier le sprint goal" onclick="event.stopPropagation()">✎</button>`
        : '';
    const goalEditor  = meta
        ? `<div class="bl-goal-editor" data-sprint="${esc(group.label)}" style="display:none">
                <div class="bl-goal-editor-dates">
                    <div class="bl-goal-date-field">
                        <label class="bl-goal-label">Début</label>
                        <input type="date" class="bl-goal-date-input" data-field="start" value="${_toDateInput(meta.startDate)}">
                    </div>
                    <span class="bl-goal-date-sep">→</span>
                    <div class="bl-goal-date-field">
                        <label class="bl-goal-label">Fin</label>
                        <input type="date" class="bl-goal-date-input" data-field="end" value="${_toDateInput(meta.endDate)}">
                    </div>
                </div>
                <div class="bl-goal-text-field">
                    <label class="bl-goal-label">🎯 Sprint goal</label>
                    <textarea class="bl-goal-textarea" placeholder="Décrivez l'objectif du sprint…" rows="2">${esc(goal)}</textarea>
                </div>
                <div class="bl-goal-actions">
                    <button type="button" class="btn btn-primary btn-sm bl-goal-save" data-sprint="${esc(group.label)}">✓ Enregistrer</button>
                    <button type="button" class="btn btn-secondary btn-sm bl-goal-cancel">Annuler</button>
                </div>
           </div>`
        : '';

    const bodyRows = hierarchyMode !== 'off'
        ? _buildHierarchyRows(group.tickets, epicMap, featureMap, hierarchyMode)
              .map(r => r.type === 'ticket'
                  ? _rowHtml(r.item, gid, isStale(r.item), teamColorMap, searchTerm, r.depth)
                  : _parentRowHtml(r.item, r.type, r.depth, r.childSP, r.childCount, searchTerm, teamColorMap))
              .join('')
        : (() => {
            const fresh = group.tickets.filter(t => !isStale(t));
            const stale = group.tickets.filter(t =>  isStale(t));
            return fresh.map(t => _rowHtml(t, gid, false, teamColorMap, searchTerm, 0)).join('')
                 + (stale.length ? `
        <tr class="bl-stale-sep-row">
            <td colspan="11">
                <div class="bl-stale-sep">
                    <span class="bl-stale-sep-text">⚠️ Non mis à jour depuis + de ${sm} mois — toujours d'actualité ?</span>
                    <button type="button" class="bl-stale-toggle" data-stale-gid="${gid}">Masquer</button>
                </div>
            </td>
        </tr>
        ${stale.map(t => _rowHtml(t, gid, true, teamColorMap, searchTerm, 0)).join('')}` : '');
          })();

    return `<tbody class="bl-group-body" data-gid="${gid}"${coll ? ' data-collapsed="true"' : ''}>
        <tr class="bl-group-hdr-row">
            <td colspan="11" class="bl-group-hdr-cell">
                <div class="bl-group-hdr${group.isActive ? ' is-active' : ''}${group.isFuture ? ' is-future' : ''}" data-gid="${gid}">
                    <svg class="icon icon-xs bl-group-chevron"><use href="#i-chevron-down"/></svg>
                    <span class="bl-group-name">${esc(group.label)}</span>
                    <span class="bl-group-count">${group.tickets.length}</span>
                    ${totalSP ? `<span class="bl-group-sp">${totalSP} SP</span>` : ''}
                    ${doneN   ? `<span class="bl-group-done">${doneN} ✓</span>` : ''}
                    ${group.tickets.length > 0 ? `<div class="bl-group-progress" title="${doneN}/${group.tickets.length} terminés (${donePct}%)">
                        <div class="bl-group-progress-fill" style="width:${donePct}%"></div>
                    </div>` : ''}
                    <div class="bl-group-right">
                        ${datesHtml}
                        ${goalHtml}
                        ${editBtnHtml}
                    </div>
                </div>
                ${goalEditor}
            </td>
        </tr>
        ${bodyRows}
    </tbody>`;
}

// ── Hierarchy row builder ──────────────────────────────────────────────────────
function _buildHierarchyRows(tickets, epicMap, featureMap, mode) {
    const rows = [];

    if (mode === 'epic' || mode === 'full') {
        // Group tickets by epicId
        const byEpic = new Map();
        const noEpic = [];
        for (const t of tickets) {
            const eid = t.epic || t.epicId || t.epic_id;
            if (eid) { if (!byEpic.has(eid)) byEpic.set(eid, []); byEpic.get(eid).push(t); }
            else noEpic.push(t);
        }

        if (mode === 'full' && featureMap.size > 0) {
            // Group epics by featureId
            const byFeature = new Map();
            const noFeature = new Set();
            for (const [eid] of byEpic) {
                const epic = epicMap.get(eid);
                const fid  = epic?.feature_id || epic?.featureId;
                if (fid && featureMap.has(fid)) {
                    if (!byFeature.has(fid)) byFeature.set(fid, []);
                    if (!byFeature.get(fid).includes(eid)) byFeature.get(fid).push(eid);
                } else { noFeature.add(eid); }
            }

            // Feature → epics → tickets
            for (const [fid, epicIds] of byFeature) {
                const feature = featureMap.get(fid);
                const allFeatureTickets = epicIds.flatMap(eid => byEpic.get(eid) || []);
                const fSP = allFeatureTickets.reduce((s, t) => s + (t.points || 0), 0);
                rows.push({ type: 'feature', item: feature, depth: 0, childSP: fSP, childCount: allFeatureTickets.length });
                for (const eid of epicIds) {
                    const epic       = epicMap.get(eid);
                    const epicTkts   = byEpic.get(eid) || [];
                    const epicSP     = epicTkts.reduce((s, t) => s + (t.points || 0), 0);
                    if (epic) rows.push({ type: 'epic', item: epic, depth: 1, childSP: epicSP, childCount: epicTkts.length });
                    epicTkts.forEach(t => rows.push({ type: 'ticket', item: t, depth: epic ? 2 : 1 }));
                }
            }
            // Orphan epics (no feature)
            for (const eid of noFeature) {
                const epic     = epicMap.get(eid);
                const epicTkts = byEpic.get(eid) || [];
                const epicSP   = epicTkts.reduce((s, t) => s + (t.points || 0), 0);
                if (epic) rows.push({ type: 'epic', item: epic, depth: 0, childSP: epicSP, childCount: epicTkts.length });
                epicTkts.forEach(t => rows.push({ type: 'ticket', item: t, depth: epic ? 1 : 0 }));
            }
        } else {
            // Epic mode — just epics and their tickets
            for (const [eid, epicTkts] of byEpic) {
                const epic   = epicMap.get(eid);
                const epicSP = epicTkts.reduce((s, t) => s + (t.points || 0), 0);
                if (epic) rows.push({ type: 'epic', item: epic, depth: 0, childSP: epicSP, childCount: epicTkts.length });
                epicTkts.forEach(t => rows.push({ type: 'ticket', item: t, depth: epic ? 1 : 0 }));
            }
        }
        // Tickets without any epic
        noEpic.forEach(t => rows.push({ type: 'ticket', item: t, depth: 0 }));
    }

    return rows;
}

// ── Parent row (epic / feature) ────────────────────────────────────────────────
function _parentRowHtml(item, type, depth, childSP, childCount, searchTerm, teamColorMap) {
    const indent    = depth * 22;
    const icon      = type === 'feature' ? '🚀' : '⚡';
    const teamColor = teamColorMap.get(item.team) || '#94a3b8';
    const spHtml    = childSP
        ? `<span class="bl-pts">${childSP}</span>`
        : `<span class="bl-pts bl-pts--empty">–</span>`;
    return `<tr class="bl-parent-row bl-parent-row--${type}" data-parent-id="${esc(item.id || '')}" data-parent-type="${type}" tabindex="0">
        <td class="td-check"></td>
        <td class="td-type"><span class="bl-type-dot" style="background:color-mix(in srgb,${type === 'feature' ? 'var(--primary)' : 'var(--warning,#f59e0b)'} 15%,transparent)">${icon}</span></td>
        <td class="bl-id-cell">${esc(item.id || '')}</td>
        <td class="td-title">
            <div class="bl-title-wrap" style="padding-left:${indent}px">
                <span class="bl-parent-line" style="left:${indent ? indent - 14 : -99}px"></span>
                <span class="bl-title-text bl-parent-title">${_highlight(item.title || '', searchTerm)}</span>
            </div>
        </td>
        <td>${statusHtml(item.status)}</td>
        <td class="td-team">
            <div class="bl-team-cell">
                <span class="bl-team-dot" style="background:${teamColor}"></span>
                <span class="bl-team-name">${esc(item.team || '—')}</span>
            </div>
        </td>
        <td class="td-center">${avatarHtml(item.leader)}</td>
        <td class="td-center">${spHtml}</td>
        <td></td>
        <td><span class="text-xs" style="color:var(--text-muted)">${childCount} ticket${childCount > 1 ? 's' : ''}</span></td>
        <td></td>
    </tr>`;
}

function _rowHtml(ticket, gid, staleRow, teamColorMap = new Map(), searchTerm = '', depth = 0) {
    const id        = esc(ticket.id);
    const upd       = ticket.updatedAt ? fmtRelative(ticket.updatedAt) : '—';
    const teamColor = teamColorMap.get(ticket.team) || '#94a3b8';
    const titleHtml = _highlight(ticket.title || '', searchTerm);
    const idHtml    = _highlight(ticket.id    || '', searchTerm);
    const spHtml    = ticket.points
        ? `<span class="bl-pts">${ticket.points}</span>`
        : `<span class="bl-pts bl-pts--empty">–</span>`;
    const indent    = depth * 22;

    return `<tr class="bl-row${ticket.status === 'done' ? ' is-done' : ''}${staleRow ? ' is-stale' : ''}"
               data-ticket-id="${id}" data-gid="${gid}" data-stale="${staleRow ? 'true' : 'false'}"
               draggable="true" tabindex="0">
        <td class="td-check" onclick="event.stopPropagation()">
            <input type="checkbox" class="bl-check bl-row-check" data-id="${id}">
        </td>
        <td class="td-type">${typeHtml(ticket.type)}</td>
        <td class="bl-id-cell">${idHtml}</td>
        <td class="td-title">
            <div class="bl-title-wrap"${indent ? ` style="padding-left:${indent}px"` : ''}>
                <span class="bl-title-text" title="${esc(ticket.title)}">${titleHtml}</span>
                ${ticket.flagged ? '<span class="bl-flag">🚫</span>' : ''}
            </div>
        </td>
        <td>${statusHtml(ticket.status)}</td>
        <td class="td-team">
            <div class="bl-team-cell">
                <span class="bl-team-dot" style="background:${teamColor}"></span>
                <span class="bl-team-name">${esc(ticket.team || '—')}</span>
            </div>
        </td>
        <td class="td-center">${avatarHtml(ticket.leader || ticket.assignee)}</td>
        <td class="td-center">${spHtml}</td>
        <td>${prioHtml(ticket.priority)}</td>
        <td><span class="bl-sprint-lbl" title="${esc(ticket.sprintName || '')}">${esc(ticket.sprintName || '—')}</span></td>
        <td><span class="bl-upd-lbl${staleRow ? ' is-stale' : ''}" title="${esc(ticket.updatedAt || '')}">${esc(upd)}</span></td>
    </tr>`;
}

// ── Bulk bar HTML ──────────────────────────────────────────────────────────────
function _bulkBarHtml(allSprints, allPIs) {
    const spOpts = allSprints.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    const piOpts = allPIs.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    return `
    <div class="bl-bulk-bar is-hidden" id="bl-bulk-bar">
        <span class="bl-bulk-count" id="bl-bulk-count">0 sélectionné</span>
        <div class="bl-bulk-sep"></div>
        <div class="bl-bulk-field">
            <span>→ Sprint</span>
            <select id="bl-bulk-sprint"><option value="">— Choisir —</option>${spOpts}</select>
        </div>
        <div class="bl-bulk-field">
            <span>PI</span>
            <select id="bl-bulk-pi"><option value="">— Choisir —</option>${piOpts}</select>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="bl-bulk-apply">Appliquer</button>
        <button type="button" class="btn btn-secondary btn-sm" id="bl-bulk-cancel">✕</button>
    </div>`;
}

// ── Sync bulk UI state ─────────────────────────────────────────────────────────
function _syncBulkUi(container, ids, visible) {
    const bar = container.querySelector('#bl-bulk-bar');
    const cnt = container.querySelector('#bl-bulk-count');
    if (!bar) return;

    bar.classList.toggle('is-hidden', ids.length === 0);
    if (cnt) cnt.textContent = `${ids.length} sélectionné${ids.length > 1 ? 's' : ''}`;

    const idSet = new Set(ids);
    container.querySelectorAll('.bl-row-check').forEach(cb => {
        cb.checked = idSet.has(cb.dataset.id);
        cb.closest('tr')?.classList.toggle('is-selected', cb.checked);
    });

    const allCb = container.querySelector('#bl-check-all');
    if (allCb) {
        const all = [...container.querySelectorAll('.bl-row-check')];
        allCb.checked       = all.length > 0 && all.every(c => c.checked);
        allCb.indeterminate = ids.length > 0 && !allCb.checked;
    }
}

// ── Wire all events ────────────────────────────────────────────────────────────
function _wireEvents(container, filters, bulk, allSprints, allPIs, ticketGroups, visible, hierarchyMode = 'off', sprintMetaMap = new Map()) {
    const root = container.querySelector('.bl-root');
    if (!root) return;

    // Search (debounced) — restaure le focus après re-render
    let _st;
    root.querySelector('#bl-search')?.addEventListener('input', e => {
        clearTimeout(_st);
        const val = e.target.value;
        _st = setTimeout(() => {
            filters.search = val;
            saveFilters(filters);
            renderBacklog(container);
            const inp = container.querySelector('#bl-search');
            if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        }, 200);
    });

    // Popover toggle (Type / Priorité / État / PI)
    // position:fixed calculée depuis getBoundingClientRect pour passer au-dessus de l'overflow du topbar
    const _positionPopover = (btn, pop) => {
        const r = btn.getBoundingClientRect();
        pop.style.top  = (r.bottom + 6) + 'px';
        pop.style.left = r.left + 'px';
    };

    root.querySelectorAll('.bl-flt-btn[data-flt-toggle]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const key    = btn.dataset.fltToggle;
            const pop    = btn.closest('.bl-flt-wrap').querySelector('.bl-flt-popover');
            const isOpen = pop.classList.contains('is-open');
            // ferme tous
            root.querySelectorAll('.bl-flt-popover.is-open').forEach(p => p.classList.remove('is-open'));
            root.querySelectorAll('.bl-flt-btn.is-open').forEach(b => b.classList.remove('is-open'));
            if (!isOpen) {
                _positionPopover(btn, pop);
                pop.classList.add('is-open');
                btn.classList.add('is-open');
                _openPopover = key;
            } else {
                _openPopover = null;
            }
        });
    });

    // Filter chips inside popovers (type / status / priority) — multi-select
    root.querySelectorAll('[data-filter]:not([data-filter="pi-chip"])').forEach(btn => {
        btn.addEventListener('click', () => {
            const arr = btn.dataset.filter + 's';
            if (!filters[arr]) filters[arr] = [];
            const val = btn.dataset.val;
            const i = filters[arr].indexOf(val);
            if (i >= 0) filters[arr].splice(i, 1); else filters[arr].push(val);
            saveFilters(filters);
            renderBacklog(container);
        });
    });

    // PI chips inside popover — single-select (toggle off if same)
    root.querySelectorAll('[data-filter="pi-chip"]').forEach(btn => {
        btn.addEventListener('click', () => {
            filters.pi = filters.pi === btn.dataset.val ? '' : btn.dataset.val;
            saveFilters(filters);
            renderBacklog(container);
        });
    });

    // Hierarchy chips — single-select
    root.querySelectorAll('[data-filter="hierarchy"]').forEach(btn => {
        btn.addEventListener('click', () => {
            localStorage.setItem(LS_HIERARCHY, btn.dataset.val);
            _openPopover = null;
            renderBacklog(container);
        });
    });

    // Goal edit — bouton ✎
    root.querySelectorAll('.bl-goal-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const name   = btn.dataset.sprint;
            const editor = btn.closest('.bl-group-hdr-cell')?.querySelector(`.bl-goal-editor[data-sprint="${CSS.escape(name)}"]`);
            if (!editor) return;
            const visible = editor.style.display !== 'none';
            editor.style.display = visible ? 'none' : 'flex';
            if (!visible) editor.querySelector('textarea')?.focus();
        });
    });

    root.querySelectorAll('.bl-goal-save').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const name     = btn.dataset.sprint;
            const editor   = btn.closest('.bl-goal-editor');
            const newGoal  = editor?.querySelector('textarea')?.value?.trim() ?? '';
            const newStart = editor?.querySelector('[data-field="start"]')?.value || null;
            const newEnd   = editor?.querySelector('[data-field="end"]')?.value   || null;
            const si       = store.get('sprintInfo') || {};
            const updated  = (si.teamSprints || []).map(s => s.name === name ? {
                ...s,
                goal: newGoal,
                ...(newStart ? { startDate: newStart } : {}),
                ...(newEnd   ? { endDate:   newEnd   } : {}),
            } : s);
            try {
                await api.updateSprint({ ...si, teamSprints: updated });
                store.set('sprintInfo', { ...si, teamSprints: updated });
                renderBacklog(container);
            } catch { toast('Erreur lors de la mise à jour', 'error'); }
        });
    });

    root.querySelectorAll('.bl-goal-cancel').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            btn.closest('.bl-goal-editor').style.display = 'none';
        });
    });

    // Reset filters
    root.querySelector('#bl-reset-filters')?.addEventListener('click', () => {
        _openPopover = null;
        clearFilters();
        renderBacklog(container);
    });

    // Group by
    root.querySelectorAll('[data-groupby]').forEach(btn => {
        btn.addEventListener('click', () => {
            localStorage.setItem(LS_GROUPBY, btn.dataset.groupby);
            renderBacklog(container);
        });
    });

    // Hide done toggle
    root.querySelector('#bl-hide-done')?.addEventListener('click', () => {
        localStorage.setItem(LS_HIDEDONE, localStorage.getItem(LS_HIDEDONE) === '1' ? '0' : '1');
        renderBacklog(container);
    });

    // Density toggle
    root.querySelector('#bl-density')?.addEventListener('click', () => {
        localStorage.setItem(LS_DENSITY, (localStorage.getItem(LS_DENSITY) || 'comfy') === 'compact' ? 'comfy' : 'compact');
        renderBacklog(container);
    });

    // Jump to group
    root.querySelector('#bl-jump-group')?.addEventListener('change', e => {
        const gid = e.target.value;
        e.target.value = '';
        if (!gid) return;
        const tbody = root.querySelector(`tbody.bl-group-body[data-gid="${CSS.escape(gid)}"]`);
        if (!tbody) return;
        if (tbody.dataset.collapsed === 'true') {
            tbody.dataset.collapsed = 'false';
            const coll = getCollapsed();
            coll.delete(gid);
            saveCollapsed(coll);
        }
        tbody.querySelector('.bl-group-hdr-cell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Column sort — 1er clic = asc, 2e = desc, 3e = reset
    root.querySelectorAll('.bl-th-sort').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (_sortKey === key) {
                if (_sortDir === 1) _sortDir = -1;
                else { _sortKey = null; _sortDir = 1; }
            } else {
                _sortKey = key;
                _sortDir = 1;
            }
            renderBacklog(container);
        });
    });

    // Expand / Collapse all
    root.querySelector('#bl-expand-all')?.addEventListener('click', () => {
        saveCollapsed(new Set());
        renderBacklog(container);
    });
    root.querySelector('#bl-collapse-all')?.addEventListener('click', () => {
        saveCollapsed(new Set(ticketGroups.map(g => g.id)));
        renderBacklog(container);
    });

    // CSV export
    root.querySelector('#bl-csv')?.addEventListener('click', () => exportCsv(visible));

    // New ticket
    root.querySelector('#bl-new')?.addEventListener('click', () => openCreateModal());

    // Table delegation
    const table = root.querySelector('#bl-table');
    table?.addEventListener('click', e => {
        const grpHdr = e.target.closest('.bl-group-hdr');
        if (grpHdr) {
            const gid   = grpHdr.dataset.gid;
            const tbody = root.querySelector(`tbody.bl-group-body[data-gid="${CSS.escape(gid)}"]`);
            if (tbody) {
                const isColl = tbody.dataset.collapsed === 'true';
                tbody.dataset.collapsed = isColl ? 'false' : 'true';
                const coll = getCollapsed();
                if (isColl) coll.delete(gid); else coll.add(gid);
                saveCollapsed(coll);
            }
            return;
        }
        const staleBtn = e.target.closest('.bl-stale-toggle');
        if (staleBtn) {
            const gid   = staleBtn.dataset.staleGid;
            const tbody = root.querySelector(`tbody.bl-group-body[data-gid="${CSS.escape(gid)}"]`);
            if (tbody) {
                tbody.classList.toggle('stale-hidden');
                staleBtn.textContent = tbody.classList.contains('stale-hidden') ? 'Afficher' : 'Masquer';
            }
            return;
        }
        const cb = e.target.closest('.bl-row-check');
        if (cb) { e.stopPropagation(); bulk.toggle(cb.dataset.id, cb.checked); return; }

        const row = e.target.closest('.bl-row');
        if (row?.dataset.ticketId) window.__squadBoard?.openTicketModal?.(row.dataset.ticketId);
    });

    // Keyboard navigation within table (↑↓ Enter Space)
    table?.addEventListener('keydown', e => {
        const row = e.target.closest('.bl-row');
        if (!row) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const rows = [...root.querySelectorAll('.bl-row[tabindex="0"]')]
                .filter(r => r.offsetParent !== null && getComputedStyle(r).display !== 'none');
            const idx  = rows.indexOf(row);
            const next = e.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
            if (next) next.focus();
        } else if (e.key === 'Enter') {
            const id = row.dataset.ticketId;
            if (id) window.__squadBoard?.openTicketModal?.(id);
        } else if (e.key === ' ') {
            e.preventDefault();
            const cb = row.querySelector('.bl-row-check');
            if (cb) { cb.checked = !cb.checked; bulk.toggle(cb.dataset.id, cb.checked); }
        }
    });

    // Select all
    root.querySelector('#bl-check-all')?.addEventListener('change', e => {
        if (e.target.checked) bulk.selectMany(visible.map(t => t.id));
        else bulk.clear();
    });

    // Bulk apply
    root.querySelector('#bl-bulk-apply')?.addEventListener('click', async () => {
        const sprint = root.querySelector('#bl-bulk-sprint')?.value;
        const pi     = root.querySelector('#bl-bulk-pi')?.value;
        if (!sprint && !pi) { toast('Choisir un sprint ou un PI cible', 'warning'); return; }
        const patch = {};
        if (sprint) patch.sprintName = sprint;
        if (pi)     patch.piSprint   = pi;
        await bulk.apply(patch, () => renderBacklog(container));
    });

    // Bulk cancel
    root.querySelector('#bl-bulk-cancel')?.addEventListener('click', () => bulk.clear());

    // / shortcut + fermeture popover sur clic extérieur (nettoie les listeners précédents)
    if (_kbCleanup) { _kbCleanup(); _kbCleanup = null; }

    const onGlobalKey = e => {
        if (e.key === 'Escape') {
            root.querySelectorAll('.bl-flt-popover.is-open').forEach(p => p.classList.remove('is-open'));
            root.querySelectorAll('.bl-flt-btn.is-open').forEach(b => b.classList.remove('is-open'));
            _openPopover = null;
            return;
        }
        if (e.key !== '/') return;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'
                    || active.tagName === 'SELECT' || active.isContentEditable)) return;
        e.preventDefault();
        container.querySelector('#bl-search')?.focus();
    };
    const onDocClick = e => {
        if (e.target.closest('.bl-flt-wrap')) return;
        root.querySelectorAll('.bl-flt-popover.is-open').forEach(p => p.classList.remove('is-open'));
        root.querySelectorAll('.bl-flt-btn.is-open').forEach(b => b.classList.remove('is-open'));
        _openPopover = null;
    };
    document.addEventListener('keydown', onGlobalKey);
    document.addEventListener('click',   onDocClick);
    _kbCleanup = () => {
        document.removeEventListener('keydown', onGlobalKey);
        document.removeEventListener('click',   onDocClick);
    };

    // Drag & drop
    _wireDnd(root, bulk, ticketGroups, container);
}

// ── Drag & Drop ────────────────────────────────────────────────────────────────
let _dndIds = [];

function _wireDnd(root, bulk, ticketGroups, container) {
    const table = root.querySelector('#bl-table');
    if (!table) return;

    table.addEventListener('dragstart', e => {
        const row = e.target.closest('.bl-row');
        if (!row) return;
        const id = row.dataset.ticketId;
        _dndIds = bulk.count > 0 && bulk.has(id) ? bulk.ids : [id];
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    });

    table.addEventListener('dragend', e => {
        e.target.closest('.bl-row')?.classList.remove('is-dragging');
        root.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    table.addEventListener('dragover', e => {
        const hdr = e.target.closest('.bl-group-hdr');
        if (!hdr) return;
        e.preventDefault();
        root.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        hdr.classList.add('drag-over');
    });

    table.addEventListener('dragleave', e => {
        const hdr = e.target.closest('.bl-group-hdr');
        if (hdr && !hdr.contains(e.relatedTarget)) hdr.classList.remove('drag-over');
    });

    table.addEventListener('drop', async e => {
        e.preventDefault();
        root.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        const hdr = e.target.closest('.bl-group-hdr');
        if (!hdr || !_dndIds.length) return;

        const gid     = hdr.dataset.gid;
        const groupBy = localStorage.getItem(LS_GROUPBY) || 'sprint';
        const patch   = {};
        if      (groupBy === 'sprint') patch.sprintName = gid.startsWith('__none') ? '' : gid;
        else if (groupBy === 'pi')     patch.piSprint   = gid.startsWith('__none') ? '' : gid;
        else { _dndIds = []; return; }

        let ok = 0;
        await Promise.all(_dndIds.map(id =>
            api.updateTicket(id, patch).then(() => ok++).catch(() => {})
        ));
        _dndIds = [];

        if (ok > 0) {
            toast(`${ok} ticket${ok > 1 ? 's' : ''} déplacé${ok > 1 ? 's' : ''}`, 'success');
            const updated = await api.getTickets().catch(() => null);
            if (updated) store.set('tickets', updated);
            bulk.clear();
            renderBacklog(container);
        }
    });
}
