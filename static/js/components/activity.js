/**
 * Activity feed — historique des changements de tickets sous forme de chips.
 * Partagé entre Dashboard, Sprint et Kanban pour rester cohérent.
 *
 * Format de chaque entrée : `{ date, author, field, from, to, ticketId, ticketTitle }`
 * où `field` est la clé technique JIRA (status, assignee, sprint…) — traduite via
 * `fieldLabelFr` à l'affichage.
 */

import { mountNavRail } from './nav-rail.js';

import { esc, fmtRelative, fieldLabelFr, emptyStateHtml } from '../utils.js';

// Mapping clé champ → icône + classe couleur du chip
const _ACTIVITY_FIELD_META = {
    status:        { icon: '🚦', cls: 'act-field--status' },
    assignee:      { icon: '👤', cls: 'act-field--assignee' },
    reporter:      { icon: '✍️', cls: 'act-field--assignee' },
    priority:      { icon: '⚡', cls: 'act-field--priority' },
    sprint:        { icon: '🏃', cls: 'act-field--sprint' },
    resolution:    { icon: '✅', cls: 'act-field--status' },
    labels:        { icon: '🏷️', cls: 'act-field--labels' },
    fixversion:    { icon: '🎯', cls: 'act-field--version' },
    'fix version': { icon: '🎯', cls: 'act-field--version' },
    duedate:       { icon: '📅', cls: 'act-field--date' },
    summary:       { icon: '✏️', cls: 'act-field--generic' },
    epic:          { icon: '🧭', cls: 'act-field--epic' },
    'epic link':   { icon: '🧭', cls: 'act-field--epic' },
    parent:        { icon: '🧭', cls: 'act-field--epic' },
    rank:          { icon: '↕️', cls: 'act-field--rank' },
    'story points': { icon: '📊', cls: 'act-field--points' },
    team:          { icon: '👥', cls: 'act-field--team' },
    'team[team]':  { icon: '👥', cls: 'act-field--team' },
    flagged:       { icon: '🚩', cls: 'act-field--priority' },
};

/**
 * Construit la liste des activités à partir des tickets (extrait `recentChanges`,
 * trie par date desc et limite). Retourne `[{date, author, field, from, to, ticketId, ticketTitle}]`.
 */
export function extractActivities(tickets, max = 15) {
    if (!tickets?.length) return [];
    const list = tickets
        .flatMap(t => (t.recentChanges || [])
            .map(c => ({ ...c, ticketId: t.id, ticketTitle: t.title })))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    return Number.isFinite(max) ? list.slice(0, max) : list;
}

// ── Période et filtres ──────────────────────────────────────────────────────
// La liste est RECALCULÉE depuis les tickets à chaque changement (période, champ, auteur) : l'ancien
// filtrage masquait des lignes déjà rendues, et une ligne au-delà de `max` gardait sa classe
// `display: none` — un filtre sur un champ rare affichait une liste vide sans le dire.
const WINDOWS = [
    { h: 6, label: '6 h' }, { h: 12, label: '12 h' }, { h: 24, label: '1 j' },
    { h: 72, label: '3 j' }, { h: 168, label: '7 j' }, { h: 720, label: '30 j' },
];
const DEFAULT_HOURS = 24;
const _hoursKey = scope => `sb-activity-hours-${scope}`;

/** Tickets et options du dernier rendu, par vue (`scope`) — relus par le câblage. */
const _sources = new Map();
/** Filtres de la session, par vue : { field, author, shown }. La période, elle, est mémorisée. */
const _filters = new Map();

function _readHours(scope) {
    try {
        const h = Number(localStorage.getItem(_hoursKey(scope)));
        if (WINDOWS.some(w => w.h === h)) return h;
    } catch { /* stockage indisponible : défaut */ }
    return DEFAULT_HOURS;
}
function _writeHours(scope, h) {
    try { localStorage.setItem(_hoursKey(scope), String(h)); } catch { /* sans mémoire */ }
}
const _windowLabel = h => (h < 24 ? `${h} dernières heures` : h === 24 ? 'dernières 24 h' : `${h / 24} derniers jours`);
const _fk = a => (a.field || '').toLowerCase().trim();

function _state(scope) {
    if (!_filters.has(scope)) _filters.set(scope, { field: null, author: null, shown: 0 });
    return _filters.get(scope);
}

/** Activités de la période + compteurs à facettes (le compte d'un champ tient compte de l'auteur choisi, et inversement). */
function _model(scope) {
    const { tickets, max } = _sources.get(scope) || { tickets: [], max: 15 };
    const st = _state(scope);
    const hours = _readHours(scope);
    const all = extractActivities(tickets, Infinity);
    const since = Date.now() - hours * 3600000;
    const inWindow = all.filter(a => new Date(a.date).getTime() >= since);
    const okField = a => !st.field || _fk(a) === st.field;
    const okAuthor = a => !st.author || a.author === st.author;
    const fieldCounts = new Map(), authorCounts = new Map();
    for (const a of inWindow) {
        if (okAuthor(a) && _fk(a)) fieldCounts.set(_fk(a), (fieldCounts.get(_fk(a)) || 0) + 1);
        if (okField(a) && a.author) authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    }
    // Un filtre actif reste visible même sans résultat sur la nouvelle période (sinon impossible à retirer).
    if (st.field && !fieldCounts.has(st.field)) fieldCounts.set(st.field, 0);
    if (st.author && !authorCounts.has(st.author)) authorCounts.set(st.author, 0);
    const filtered = inWindow.filter(a => okField(a) && okAuthor(a));
    return {
        st, hours, max, inWindow, filtered, fieldCounts, authorCounts,
        groups: _groupActivities(filtered),
        lastKnown: all[0]?.date || null,
    };
}

/**
 * Renvoie le HTML d'une liste d'activités avec le style "chips" cohérent
 * (icône champ + valeurs from/to), une PÉRIODE (6 h → 30 j, 1 j par défaut, mémorisée par vue)
 * et des filtres combinables : un type de champ ET/OU un auteur.
 *
 * @param {Array}  tickets    Liste des tickets (chacun avec `recentChanges[]`)
 * @param {object} opts       { max: number, filterable: boolean, scope: string }
 *                            `max` = lignes affichées avant « Afficher plus ».
 *                            `scope` = identifiant de la vue (dashboard/sprint/kanban) : période et
 *                            filtres d'une vue ne contaminent pas l'autre.
 */
export function renderActivityList(tickets, opts = {}) {
    const scope = opts.scope || 'default';
    _sources.set(scope, { tickets: tickets || [], max: opts.max || 15, filterable: opts.filterable !== false });
    const st = _state(scope);
    st.shown = 0;
    const m = _model(scope);
    return `
        <div class="activity-wrapper" data-activity-scope="${esc(scope)}">
            <div class="act-toolbar">
                <div class="act-window" role="group" aria-label="Période affichée">
                    <span class="act-window-lbl">Dernières</span>
                    ${WINDOWS.map(w => `<button type="button" class="act-window-btn${w.h === m.hours ? ' is-active' : ''}" data-act-hours="${w.h}" aria-pressed="${w.h === m.hours}" title="Activité des ${esc(_windowLabel(w.h))}">${w.label}</button>`).join('')}
                </div>
                <span class="act-summary" data-act-summary>${_summaryHtml(m)}</span>
            </div>
            ${opts.filterable !== false ? `<div class="activity-filters" data-activity-filters="${esc(scope)}" role="toolbar" aria-label="Filtrer l'activité">${_filterChipsHtml(m)}</div>` : ''}
            <div class="activity-list" data-activity-list>${_listHtml(m)}</div>
        </div>`;
}

function _summaryHtml(m) {
    const n = m.filtered.length;
    if (!n) return '';
    const tk = new Set(m.filtered.map(a => a.ticketId)).size;
    const ppl = new Set(m.filtered.map(a => a.author).filter(Boolean)).size;
    return `<b>${n}</b> modif${n > 1 ? 's' : ''} · <b>${tk}</b> ticket${tk > 1 ? 's' : ''} · <b>${ppl}</b> personne${ppl > 1 ? 's' : ''}`;
}

function _filterChipsHtml(m) {
    const fields = [...m.fieldCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (!fields.length && !m.authorCounts.size) return '';
    const authors = [...m.authorCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const none = !m.st.field && !m.st.author;
    const fieldChips = fields.map(([fk, n]) => {
        const meta = _ACTIVITY_FIELD_META[fk] || { icon: '◇', cls: 'act-field--generic' };
        const on = m.st.field === fk;
        return `<button type="button" class="act-filter-chip ${meta.cls}${on ? ' is-active' : ''}${n ? '' : ' is-empty'}" data-filter-type="field" data-filter-value="${esc(fk)}" aria-pressed="${on}" title="${on ? 'Retirer le filtre' : `Ne voir que : ${esc(fieldLabelFr(fk))}`}">
            <span class="act-field-icon">${meta.icon}</span><span>${esc(fieldLabelFr(fk))}</span><span class="act-filter-count">${n}</span>${on ? '<span class="act-filter-x" aria-hidden="true">×</span>' : ''}
        </button>`;
    }).join('');
    const authorChips = authors.map(([name, n]) => {
        const on = m.st.author === name;
        return `<button type="button" class="act-filter-chip act-filter-chip--author${on ? ' is-active' : ''}${n ? '' : ' is-empty'}" data-filter-type="author" data-filter-value="${esc(name)}" aria-pressed="${on}" title="${on ? 'Retirer le filtre' : `Ne voir que les modifications de ${esc(name)}`}">
            <span class="act-filter-ava" aria-hidden="true">${esc(_initials(name))}</span><span>${esc(name)}</span><span class="act-filter-count">${n}</span>${on ? '<span class="act-filter-x" aria-hidden="true">×</span>' : ''}
        </button>`;
    }).join('');
    return `
        <button type="button" class="act-filter-chip act-filter-chip--all${none ? ' is-active' : ''}" data-filter-type="all" aria-pressed="${none}" title="Retirer tous les filtres">
            Tout <span class="act-filter-count">${m.inWindow.length}</span>
        </button>
        ${fieldChips ? `<span class="act-filter-sep" aria-hidden="true"></span><span class="act-filter-label">Champ</span>${fieldChips}` : ''}
        ${authorChips ? `<span class="act-filter-sep" aria-hidden="true"></span><span class="act-filter-label">Qui</span>${authorChips}` : ''}`;
}

const _initials = name => String(name || '').replace(/,/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

/** Libellé du jour d'un séparateur : « Aujourd'hui », « Hier », sinon « lun. 12 oct. ». */
function _dayLabel(d) {
    const dt = new Date(d), today = new Date();
    const key = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (key(dt) === key(today)) return "Aujourd'hui";
    if (key(dt) === key(y)) return 'Hier';
    return dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function _listHtml(m) {
    if (!m.groups.length) {
        const filtered = m.st.field || m.st.author;
        const wider = WINDOWS.find(w => w.h > m.hours);
        if (filtered && m.inWindow.length) {
            return emptyStateHtml({ icon: '🔎', title: 'Aucune activité pour ce filtre', text: `Sur les ${_windowLabel(m.hours)}.`, action: { label: 'Retirer les filtres', attrs: 'data-act-reset' } });
        }
        return emptyStateHtml({
            icon: '🕊️',
            title: `Rien sur les ${_windowLabel(m.hours)}`,
            text: m.lastKnown ? `Dernière modification connue ${fmtRelative(m.lastKnown)} (selon la dernière synchro).` : 'Aucun historique de modification dans les tickets chargés.',
            action: m.lastKnown && wider ? { label: `Élargir à ${wider.label}`, attrs: `data-act-hours="${wider.h}"` } : null,
        });
    }
    const limit = m.max + m.st.shown;
    const visible = m.groups.slice(0, limit);
    const multiDay = new Set(m.groups.map(g => new Date(g.date).toDateString())).size > 1;
    let lastDay = '';
    const rows = visible.map(g => {
        const day = new Date(g.date).toDateString();
        const sep = multiDay && day !== lastDay ? `<div class="act-day" role="separator">${esc(_dayLabel(g.date))}</div>` : '';
        lastDay = day;
        return sep + renderActivityRow(g, false, { clock: multiDay });
    }).join('');
    const rest = m.groups.length - visible.length;
    return rows + (rest > 0
        ? `<button type="button" class="act-more" data-act-more>Afficher ${Math.min(rest, 20)} de plus <span class="text-muted">(reste ${rest})</span></button>`
        : '');
}

/**
 * Carte « Activité récente » complète et repliable — shell `<details>` + liste.
 * Mutualise le boilerplate dupliqué entre Dashboard, Sprint et Kanban.
 * À coupler avec `bindActivityClicks(container)` après le mount.
 *
 * @param {Array}  tickets  Liste des tickets (chacun avec `recentChanges[]`)
 * @param {object} opts     Mêmes options que `renderActivityList` (max, scope, filterable)
 *                          + `{ open: boolean }` pour déplier la carte par défaut.
 */
export function renderActivityCard(tickets, opts = {}) {
    const list = renderActivityList(tickets, opts);
    const m = _model(opts.scope || 'default');
    return `
        <details class="card mt-4 card-collapsible act-card"${opts.open ? ' open' : ''}>
            <summary class="card-header"><span class="card-title">Activité récente</span><span class="act-card-badge" data-act-card-badge>${_badgeText(m)}</span><span class="card-collapse-icon">▸</span></summary>
            ${list}
        </details>`;
}
const _badgeText = m => `${m.filtered.length} · ${WINDOWS.find(w => w.h === m.hours)?.label || ''}`;

/** Chip d'une valeur from/to, coloré selon le type de champ (statut, priorité…). */
function _valueChip(v, fieldKey) {
    if (v === null || v === undefined || v === '') {
        return '<span class="act-value act-value--empty" title="vide">—</span>';
    }
    if (fieldKey === 'status') {
        return `<span class="act-value act-value--status badge-${_statusKeyForBadge(v)}">${esc(v)}</span>`;
    }
    if (fieldKey === 'priority') {
        const cls = String(v).toLowerCase().replace(/[^a-z]/g, '');
        return `<span class="act-value act-value--priority act-value--prio-${cls}">${esc(v)}</span>`;
    }
    return `<span class="act-value">${esc(v)}</span>`;
}

/** Date+heure complète FR pour les tooltips de survol : "mer. 17 juin, 14:32". */
function _fmtDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

/** HTML d'un changement isolé : chip de champ + valeurs `from → to`. Survol = heure de modif. */
function _changeHtml(c) {
    const fk = (c.field || '').toLowerCase().trim();
    const meta = _ACTIVITY_FIELD_META[fk] || { icon: '◇', cls: 'act-field--generic' };
    const fieldLbl = fieldLabelFr(c.field);
    const when = _fmtDateTime(c.date);
    return `<span class="act-change" data-act-field="${esc(fk)}"${when ? ` title="${esc(when)}"` : ''}>
        <span class="act-field-chip ${meta.cls}">
            <span class="act-field-icon">${meta.icon}</span>
            <span class="act-field-name">${esc(fieldLbl)}</span>
        </span>
        ${_valueChip(c.from, fk)}
        <span class="act-arrow">→</span>
        ${_valueChip(c.to, fk)}
    </span>`;
}

/**
 * Regroupe les activités ADJACENTES (la liste est déjà triée par date desc) d'un même
 * auteur sur un même ticket — typiquement plusieurs champs modifiés en une seule édition.
 * Conserve l'ordre chronologique (on ne fusionne que des entrées consécutives).
 * @returns {Array<{author, ticketId, ticketTitle, date, changes:[]}>}
 */
function _groupActivities(activities) {
    const groups = [];
    for (const a of activities) {
        const last = groups[groups.length - 1];
        if (last && last.author === a.author && last.ticketId === a.ticketId) {
            last.changes.push(a);
        } else {
            groups.push({
                author: a.author, ticketId: a.ticketId, ticketTitle: a.ticketTitle,
                date: a.date, changes: [a],
            });
        }
    }
    return groups;
}

/**
 * HTML d'une ligne d'activité. Accepte un *groupe* (auteur+ticket, ≥1 changement)
 * ou, par rétrocompat, une activité simple. Quand un membre a fait plusieurs
 * modifications sur le même ticket, le nom et le ticket ne sont affichés qu'une fois
 * et les changements sont listés proprement en dessous.
 */
export function renderActivityRow(group, overflow = false, { clock = false } = {}) {
    // Rétrocompat : une activité simple devient un groupe d'un seul changement.
    const changes = group.changes || [group];
    const author = group.author;
    const ticketId = group.ticketId;
    const ticketTitle = group.ticketTitle || '';
    const fieldKeys = [...new Set(changes.map(c => (c.field || '').toLowerCase().trim()))];

    // Ticket cliquable + début du titre tronqué (titre complet en tooltip).
    const titleTrunc = ticketTitle.length > 42 ? ticketTitle.slice(0, 42).trimEnd() + '…' : ticketTitle;
    const ticketChip = `<span class="act-ticket" data-ticket-id="${esc(ticketId)}"${ticketTitle ? ` title="${esc(ticketTitle)}"` : ''}>${esc(ticketId)}</span>`
        + (ticketTitle ? `<span class="act-ticket-title" title="${esc(ticketTitle)}">${esc(titleTrunc)}</span>` : '');
    const overflowCls = overflow ? ' activity-item--overflow' : '';
    const dataAttrs = `data-act-field="${esc(fieldKeys.join(' '))}" data-act-author="${esc(author || '')}"`;
    const whenTip = _fmtDateTime(group.date);
    // Sous un séparateur de jour, l'heure se lit mieux que « il y a 31h ».
    const when = clock && group.date
        ? new Date(group.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : fmtRelative(group.date);

    // Un seul changement → ligne inline classique.
    if (changes.length === 1) {
        return `
        <div class="activity-item${overflowCls}" ${dataAttrs}>
            <span class="activity-time"${whenTip ? ` title="${esc(whenTip)}"` : ''}>${esc(when)}</span>
            <span class="activity-text">
                <strong class="act-author">${esc(author)}</strong>
                <span class="act-on">sur</span>
                ${ticketChip}
                ${_changeHtml(changes[0])}
            </span>
        </div>`;
    }

    // Plusieurs changements → en-tête (auteur + ticket une seule fois) puis liste.
    return `
        <div class="activity-item activity-item--grouped${overflowCls}" ${dataAttrs}>
            <span class="activity-time"${whenTip ? ` title="${esc(whenTip)}"` : ''}>${esc(when)}</span>
            <div class="activity-text activity-text--grouped">
                <div class="act-head">
                    <strong class="act-author">${esc(author)}</strong>
                    <span class="act-on">sur</span>
                    ${ticketChip}
                    <span class="act-change-count" title="${changes.length} modifications">${changes.length} modifs</span>
                </div>
                <div class="act-changes">${changes.map(_changeHtml).join('')}</div>
            </div>
        </div>`;
}

/**
 * Câble les tickets (ouverture de la modale), la période, les filtres et « Afficher plus ».
 * Délégation sur chaque `.activity-wrapper` : la liste est re-rendue en place à chaque changement.
 * À appeler après mount du HTML (idempotent).
 */
export function bindActivityClicks(container) {
    container.querySelectorAll('.activity-wrapper').forEach(wrapper => {
        const filters = wrapper.querySelector('.activity-filters');
        // Rail : le nombre de chips dépend des champs modifiés ET des auteurs présents
        // dans le flux — il n'est pas borné. Sans rail, la barre empile des lignes qui
        // repoussent la liste qu'elle est censée filtrer.
        if (filters) mountNavRail(filters, { labelPrev: 'Filtres précédents', labelNext: 'Filtres suivants' });
        if (wrapper._actBound) return;
        wrapper._actBound = true;
        wrapper.addEventListener('click', e => {
            const scope = wrapper.dataset.activityScope;
            const st = _state(scope);
            const tk = e.target.closest('.act-ticket[data-ticket-id]');
            if (tk) { window.__squadBoard?.openTicketModal?.(tk.dataset.ticketId); return; }
            const win = e.target.closest('[data-act-hours]');
            if (win) {
                _writeHours(scope, Number(win.dataset.actHours));
                st.shown = 0;
                return _rerender(wrapper);
            }
            if (e.target.closest('[data-act-more]')) { st.shown += 20; return _rerender(wrapper, { keepScroll: true }); }
            if (e.target.closest('[data-act-reset]')) { st.field = st.author = null; st.shown = 0; return _rerender(wrapper); }
            const chip = e.target.closest('.act-filter-chip');
            if (!chip) return;
            const { filterType: type, filterValue: value } = chip.dataset;
            if (type === 'all') st.field = st.author = null;
            else if (type === 'field') st.field = st.field === value ? null : value;
            else if (type === 'author') st.author = st.author === value ? null : value;
            st.shown = 0;
            _rerender(wrapper);
        });
    });
    // Lignes rendues hors d'un wrapper (renderActivityRow seul)
    container.querySelectorAll('.act-ticket[data-ticket-id]').forEach(el => {
        if (el.closest('.activity-wrapper')) return;
        el.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(el.dataset.ticketId));
    });
}

function _rerender(wrapper) {
    const scope = wrapper.dataset.activityScope;
    const m = _model(scope);
    wrapper.querySelectorAll('[data-act-hours]').forEach(b => {
        if (!b.classList.contains('act-window-btn')) return;
        const on = Number(b.dataset.actHours) === m.hours;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
    });
    const sum = wrapper.querySelector('[data-act-summary]');
    if (sum) sum.innerHTML = _summaryHtml(m);
    // innerHTML de la barre, jamais la barre elle-même : le rail l'enveloppe et observe son contenu.
    const filters = wrapper.querySelector('.activity-filters');
    if (filters) filters.innerHTML = _filterChipsHtml(m);
    const list = wrapper.querySelector('[data-activity-list]');
    if (list) list.innerHTML = _listHtml(m);
    const badge = wrapper.closest('.act-card')?.querySelector('[data-act-card-badge]');
    if (badge) badge.textContent = _badgeText(m);
}

/** Mappe un libellé JIRA arbitraire vers une clé interne badge-status. */
function _statusKeyForBadge(jiraStatusLabel) {
    const s = String(jiraStatusLabel || '').toLowerCase();
    if (/done|termin|clos|résolu|fait/i.test(s)) return 'done';
    if (/bloqu|imped|hold/i.test(s)) return 'blocked';
    if (/test|recette|qualif|uat/i.test(s)) return 'test';
    if (/review|revue/i.test(s)) return 'review';
    if (/cours|progress|dev|wip/i.test(s)) return 'inprog';
    return 'todo';
}
