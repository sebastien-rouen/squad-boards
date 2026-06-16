/**
 * Activity feed — historique des changements de tickets sous forme de chips.
 * Partagé entre Dashboard, Sprint et Kanban pour rester cohérent.
 *
 * Format de chaque entrée : `{ date, author, field, from, to, ticketId, ticketTitle }`
 * où `field` est la clé technique JIRA (status, assignee, sprint…) — traduite via
 * `fieldLabelFr` à l'affichage.
 */

import { esc, fmtRelative, fieldLabelFr } from '../utils.js';

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
    return tickets
        .flatMap(t => (t.recentChanges || [])
            .map(c => ({ ...c, ticketId: t.id, ticketTitle: t.title })))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, max);
}

/**
 * Renvoie le HTML d'une liste d'activités avec le style "chips" cohérent
 * (icône champ + valeurs from/to). Affiche un message si vide.
 *
 * Si `opts.filterable === true` (défaut), ajoute une barre de filtres au-dessus
 * de la liste pour ne voir qu'un type d'événements (statut, sprint, priorité…)
 * ou les changements d'un auteur particulier.
 *
 * @param {Array}  tickets    Liste des tickets (chacun avec `recentChanges[]`)
 * @param {object} opts       { max: number, filterable: boolean, scope: string }
 *                            `scope` = identifiant unique pour scoper les filtres
 *                            par vue (dashboard/sprint/kanban) — évite que le filtre
 *                            d'une vue contamine l'autre.
 */
export function renderActivityList(tickets, opts = {}) {
    const max = opts.max || 15;
    const filterable = opts.filterable !== false;
    const scope = opts.scope || 'default';
    // Collecte ×10 pour que les filtres sur champs rares (Story Points, Rang…)
    // trouvent toujours leurs cibles. Les items au-delà de `max` sont masqués
    // initialement via `.activity-item--overflow` et révélés par filtre.
    const activities = extractActivities(tickets, max * 10);
    if (!activities.length) {
        return '<p class="text-muted text-sm p-2">Aucune activité récente</p>';
    }

    // Compte des activités par champ et par auteur — pour décider quels chips afficher
    const fieldCounts = new Map();
    const authorCounts = new Map();
    for (const a of activities) {
        const fk = (a.field || '').toLowerCase().trim();
        fieldCounts.set(fk, (fieldCounts.get(fk) || 0) + 1);
        if (a.author) authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    }

    const filtersHtml = filterable ? _renderFilterBar(fieldCounts, authorCounts, scope) : '';
    // Regroupe les modifs consécutives d'un même auteur sur un même ticket (1 ligne, nom non répété).
    const groups = _groupActivities(activities);
    // On rend TOUS les groupes collectés dans le DOM pour que les filtres trouvent toujours
    // leurs cibles. Les groupes au-delà de `max` sont masqués via `.activity-item--overflow`.
    return `
        <div class="activity-wrapper" data-activity-scope="${esc(scope)}">
            ${filtersHtml}
            <div class="activity-list" data-activity-list data-default-max="${max}">
                ${groups.map((g, i) => renderActivityRow(g, i >= max)).join('')}
            </div>
        </div>`;
}

function _renderFilterBar(fieldCounts, authorCounts, scope) {
    // Top champs (les plus actifs) + tous les autres avec >0
    const fields = [...fieldCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .filter(([k]) => k);
    if (!fields.length) return '';
    const authors = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const fieldChips = fields.map(([fk, n]) => {
        const meta = _ACTIVITY_FIELD_META[fk] || { icon: '◇', cls: 'act-field--generic' };
        // fieldLabelFr est importé en haut
        return `<button class="act-filter-chip ${meta.cls}" data-filter-type="field" data-filter-value="${esc(fk)}" title="Filtrer sur ${esc(fieldLabelFr(fk))}">
            <span class="act-field-icon">${meta.icon}</span>
            <span>${esc(fieldLabelFr(fk))}</span>
            <span class="act-filter-count">${n}</span>
        </button>`;
    }).join('');

    const authorChips = authors.map(([name, n]) =>
        `<button class="act-filter-chip act-filter-chip--author" data-filter-type="author" data-filter-value="${esc(name)}" title="Filtrer sur ${esc(name)}">
            <span>👤 ${esc(name)}</span>
            <span class="act-filter-count">${n}</span>
        </button>`
    ).join('');

    return `
        <div class="activity-filters" data-activity-filters="${esc(scope)}">
            <span class="act-filter-label">Filtrer :</span>
            <button class="act-filter-chip act-filter-chip--all is-active" data-filter-type="all" title="Tout afficher">
                Tout <span class="act-filter-count">${[...fieldCounts.values()].reduce((s, v) => s + v, 0)}</span>
            </button>
            ${fieldChips}
            ${authorChips ? `<span class="act-filter-sep"></span>${authorChips}` : ''}
        </div>`;
}

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
export function renderActivityRow(group, overflow = false) {
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

    // Un seul changement → ligne inline classique.
    if (changes.length === 1) {
        return `
        <div class="activity-item${overflowCls}" ${dataAttrs}>
            <span class="activity-time"${whenTip ? ` title="${esc(whenTip)}"` : ''}>${fmtRelative(group.date)}</span>
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
            <span class="activity-time"${whenTip ? ` title="${esc(whenTip)}"` : ''}>${fmtRelative(group.date)}</span>
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
 * Bind les clics sur les chips `act-ticket` (ouverture modal) et les chips de
 * filtre (filtrage in-place des activités). À appeler après mount du HTML.
 */
export function bindActivityClicks(container) {
    container.querySelectorAll('.act-ticket[data-ticket-id]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.ticketId;
            if (id) window.__squadBoard?.openTicketModal?.(id);
        });
    });

    // Filtres : un wrapper `.activity-wrapper` peut contenir une barre `.activity-filters`
    container.querySelectorAll('.activity-wrapper').forEach(wrapper => {
        const filters = wrapper.querySelector('.activity-filters');
        const list = wrapper.querySelector('[data-activity-list]');
        if (!filters || !list) return;
        filters.querySelectorAll('.act-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                // Toggle d'état actif (mode mono-sélection : un seul filtre actif à la fois)
                filters.querySelectorAll('.act-filter-chip').forEach(c => c.classList.remove('is-active'));
                chip.classList.add('is-active');
                const type  = chip.dataset.filterType;
                const value = chip.dataset.filterValue;
                _applyFilter(list, type, value);
            });
        });
    });
}

function _applyFilter(list, type, value) {
    const items = list.querySelectorAll('.activity-item');
    const defaultMax = parseInt(list.dataset.defaultMax || '0', 10) || items.length;
    let visible = 0;
    let shownInDefault = 0;
    items.forEach(item => {
        // data-act-field peut contenir plusieurs champs (ligne groupée) → test d'appartenance
        const itemFields = (item.dataset.actField || '').split(' ').filter(Boolean);
        const matches = type === 'all'
            ? true
            : type === 'field'  ? itemFields.includes(value)
            : type === 'author' ? item.dataset.actAuthor === value
            : true;
        // Si "Tout" : on garde le comportement "limite à defaultMax premiers"
        // Sinon : on affiche TOUS les matches (sans limite — important pour les
        // champs rares dont l'occurrence peut être au-delà de la limite par défaut)
        let keep = matches;
        if (type === 'all' && shownInDefault >= defaultMax) keep = false;
        item.style.display = keep ? '' : 'none';
        // Sur une ligne groupée filtrée par champ, ne montre que les changements concernés
        const changes = item.querySelectorAll('.act-change');
        if (changes.length > 1) {
            changes.forEach(ch => {
                ch.style.display = (keep && type === 'field' && ch.dataset.actField !== value) ? 'none' : '';
            });
        }
        if (keep) { visible++; shownInDefault++; }
    });
    // Marque "vide après filtre" si rien ne reste
    let emptyMsg = list.querySelector('.activity-filter-empty');
    if (visible === 0) {
        if (!emptyMsg) {
            list.insertAdjacentHTML('beforeend',
                '<p class="text-muted text-sm activity-filter-empty p-2">Aucune activité ne correspond au filtre</p>');
        }
    } else if (emptyMsg) {
        emptyMsg.remove();
    }
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
