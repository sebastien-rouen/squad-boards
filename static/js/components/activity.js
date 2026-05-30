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
    // On rend TOUTES les activités collectées dans le DOM (jusqu'à max*3) pour que
    // les filtres puissent toujours trouver leurs cibles. Les items au-delà de `max`
    // sont initialement masqués via `.activity-item--overflow` (état "Tout" filtré).
    return `
        <div class="activity-wrapper" data-activity-scope="${esc(scope)}">
            ${filtersHtml}
            <div class="activity-list" data-activity-list data-default-max="${max}">
                ${activities.map((a, i) => renderActivityRow(a, i >= max)).join('')}
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

/** HTML d'une ligne d'activité — exposé pour permettre des intégrations sur mesure. */
export function renderActivityRow(a, overflow = false) {
    const fieldKey = (a.field || '').toLowerCase().trim();
    const meta = _ACTIVITY_FIELD_META[fieldKey] || { icon: '◇', cls: 'act-field--generic' };
    const fieldLbl = fieldLabelFr(a.field);

    const valueChip = (v) => {
        if (v === null || v === undefined || v === '') {
            return '<span class="act-value act-value--empty" title="vide">—</span>';
        }
        if (fieldKey === 'status') {
            const cls = _statusKeyForBadge(v);
            return `<span class="act-value act-value--status badge-${cls}">${esc(v)}</span>`;
        }
        if (fieldKey === 'priority') {
            const cls = String(v).toLowerCase().replace(/[^a-z]/g, '');
            return `<span class="act-value act-value--priority act-value--prio-${cls}">${esc(v)}</span>`;
        }
        return `<span class="act-value">${esc(v)}</span>`;
    };

    return `
        <div class="activity-item${overflow ? ' activity-item--overflow' : ''}" data-act-field="${esc(fieldKey)}" data-act-author="${esc(a.author || '')}">
            <span class="activity-time">${fmtRelative(a.date)}</span>
            <span class="activity-text">
                <strong class="act-author">${esc(a.author)}</strong>
                <span class="act-field-chip ${meta.cls}" title="${esc(fieldLbl)}">
                    <span class="act-field-icon">${meta.icon}</span>
                    <span class="act-field-name">${esc(fieldLbl)}</span>
                </span>
                <span class="act-on">sur</span>
                <span class="act-ticket" data-ticket-id="${esc(a.ticketId)}">${esc(a.ticketId)}</span>
                ${valueChip(a.from)}
                <span class="act-arrow">→</span>
                ${valueChip(a.to)}
            </span>
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
        const matches = type === 'all'
            ? true
            : type === 'field'  ? item.dataset.actField === value
            : type === 'author' ? item.dataset.actAuthor === value
            : true;
        // Si "Tout" : on garde le comportement "limite à defaultMax premiers"
        // Sinon : on affiche TOUS les matches (sans limite — important pour les
        // champs rares dont l'occurrence peut être au-delà de la limite par défaut)
        let keep = matches;
        if (type === 'all' && shownInDefault >= defaultMax) keep = false;
        item.style.display = keep ? '' : 'none';
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
