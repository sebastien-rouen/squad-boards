/**
 * 🕘 Historique d'un ticket — frise colorée de la popin (3.252.0).
 *
 * Avant : une liste grise « X a modifié Sprint : <12 sprints> → <13 sprints> ». Maintenant :
 *   - une FRISE verticale, groupée par JOUR (aujourd'hui, hier, 12 oct.), du plus récent au plus ancien ;
 *   - une entrée par AUTEUR consécutif (avatar + heure), chaque changement en carte colorée par CATÉGORIE
 *     (statut, sprint, points, personnes, blocage, priorité, étiquettes, texte, hiérarchie, liens, rang, dates) ;
 *   - des valeurs LISIBLES : statut en pastilles de couleur, points avec ▲/▼, sprint réduit à l'ÉCART
 *     (« + 29.1 · − 28.5 », JIRA stocke la liste cumulée), drapeau « 🚩 bloqué / levé », textes tronqués ;
 *   - un bandeau de filtres par catégorie (compte compris), en LECTURE seule (CSS, rien en base).
 * En modale : les 12 changements les plus récents ; pleine page : tout, déplié.
 * Styles : css/views/ticket-history.css. Câblage : `bindTicketHistory(root)` (filtres).
 */
import { esc, fmtRelative, initials, hashColor, fieldLabelFr, mapStatus } from '../utils.js';
import { extractSprintLabel } from '../utils/sprint-scope.js';

/** Catégories de champ : icône, libellé du filtre, couleur. */
const CATS = {
    status:   { icon: '🔄', label: 'Statut',      color: '#3b82f6' },
    sprint:   { icon: '🏃', label: 'Sprint',      color: '#8b5cf6' },
    points:   { icon: '🎯', label: 'Points',      color: '#f59e0b' },
    people:   { icon: '👤', label: 'Personnes',   color: '#14b8a6' },
    flag:     { icon: '🚩', label: 'Blocage',     color: '#ef4444' },
    priority: { icon: '⚡', label: 'Priorité',    color: '#f97316' },
    labels:   { icon: '🏷️', label: 'Étiquettes',  color: '#ec4899' },
    text:     { icon: '📝', label: 'Texte',       color: '#64748b' },
    tree:     { icon: '🧬', label: 'Rattachement', color: '#0ea5e9' },
    links:    { icon: '🔗', label: 'Liens',       color: '#6366f1' },
    rank:     { icon: '↕️', label: 'Rang',        color: '#94a3b8' },
    dates:    { icon: '📅', label: 'Dates',       color: '#10b981' },
    other:    { icon: '✏️', label: 'Autres',      color: '#a3a3a3' },
};

const _BY_FIELD = {
    status: 'status', resolution: 'status',
    sprint: 'sprint',
    'story points': 'points', 'story point estimate': 'points',
    assignee: 'people', reporter: 'people',
    flagged: 'flag',
    priority: 'priority',
    labels: 'labels', component: 'labels', 'fix version': 'labels',
    summary: 'text', description: 'text', environnement: 'text', environment: 'text', maquette: 'text',
    issueparentassociation: 'tree', 'parent link': 'tree', 'epic link': 'tree', team: 'tree', project: 'tree', key: 'tree', issuetype: 'tree',
    remoteworkitemlink: 'links', remoteissuelink: 'links', link: 'links',
    rank: 'rank', classement: 'rank',
    'start date': 'dates', 'target end': 'dates', 'target start': 'dates', duedate: 'dates',
};
export const catOf = field => _BY_FIELD[String(field || '').toLowerCase().trim()] || 'other';

const STATUS_COLOR = { todo: '#94a3b8', inprog: '#3b82f6', review: '#8b5cf6', test: '#f59e0b', done: '#10b981', blocked: '#ef4444' };
const _cut = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const _list = v => String(v || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);

/** Valeur d'un changement, rendue selon sa catégorie. */
function _valueHtml(c, cat) {
    const from = String(c.from ?? '').trim(), to = String(c.to ?? '').trim();
    const arrow = '<span class="th-arrow" aria-hidden="true">→</span>';
    const plain = (v, cls = '') => v ? `<span class="th-val${cls}" title="${esc(v)}">${esc(_cut(v))}</span>` : '<span class="th-val is-empty">—</span>';
    switch (cat) {
    case 'status': {
        const pill = v => v ? `<span class="th-status" style="--st:${STATUS_COLOR[mapStatus(v)] || '#94a3b8'}">${esc(v)}</span>` : '<span class="th-val is-empty">—</span>';
        return `${from ? `${pill(from)}${arrow}` : ''}${pill(to)}`;
    }
    case 'points': {
        const a = Number(from) || 0, b = Number(to) || 0;
        const trend = !to ? '<span class="th-trend is-down">retirés</span>'
            : b > a ? `<span class="th-trend is-up">▲ ${b - a}</span>` : b < a ? `<span class="th-trend is-down">▼ ${a - b}</span>` : '';
        return `<span class="th-num">${esc(from || '—')}</span>${arrow}<span class="th-num is-to">${esc(to || '—')}</span>${trend}`;
    }
    case 'sprint': {
        // JIRA écrit la liste CUMULÉE des sprints : seul l'écart a du sens
        const fa = _list(from), ta = _list(to);
        const lbl = n => extractSprintLabel(n) || n;
        const added = ta.filter(n => !fa.includes(n)), removed = fa.filter(n => !ta.includes(n));
        if (!added.length && !removed.length) return plain(to);
        return [...added.map(n => `<span class="th-spr is-add" title="${esc(n)}">+ ${esc(lbl(n))}</span>`),
                ...removed.map(n => `<span class="th-spr is-rm" title="${esc(n)}">− ${esc(lbl(n))}</span>`)].join('');
    }
    case 'flag':
        return to ? '<span class="th-flag is-on">🚩 bloqué</span>' : '<span class="th-flag is-off">✓ blocage levé</span>';
    case 'people': {
        const who = v => v ? `<span class="th-who"><span class="th-av" style="background:${hashColor(v)}">${esc(initials(v))}</span>${esc(v)}</span>` : '<span class="th-val is-empty">personne</span>';
        return `${from ? `${who(from)}${arrow}` : ''}${who(to)}`;
    }
    case 'labels': {
        const fa = _list(from), ta = _list(to);
        const added = ta.filter(n => !fa.includes(n)), removed = fa.filter(n => !ta.includes(n));
        if (!added.length && !removed.length) return plain(to);
        return [...added.map(n => `<span class="th-tag is-add">+ ${esc(n)}</span>`), ...removed.map(n => `<span class="th-tag is-rm">− ${esc(n)}</span>`)].join('');
    }
    case 'text':
    case 'links':
        return from && to ? `${plain(from, ' is-old')}${arrow}${plain(to)}` : plain(to || from, to ? '' : ' is-old');
    default:
        return from ? `${plain(from, ' is-old')}${arrow}${plain(to)}` : plain(to);
    }
}

function _changeHtml(c) {
    const cat = catOf(c.field), k = CATS[cat];
    return `<div class="th-change" data-cat="${cat}" style="--c:${k.color}" title="${esc(_fmtFull(c.date))}">
        <span class="th-field"><span class="th-ico" aria-hidden="true">${k.icon}</span>${esc(fieldLabelFr(c.field))}</span>
        <span class="th-vals">${_valueHtml(c, cat)}</span>
    </div>`;
}

const _d = v => { const d = new Date(v); return isNaN(d) ? null : d; };
const _fmtFull = v => _d(v)?.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '';
const _hm = v => _d(v)?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || '';
const _dayKey = v => { const d = _d(v); return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '?'; };
function _dayLabel(v) {
    const d = _d(v); if (!d) return 'Date inconnue';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

/**
 * Bloc complet `<details>` (ou '' sans historique).
 * @param {object} ticket
 * @param {{ full?: boolean, limit?: number }} opts  full = pleine page (tout, déplié)
 */
export function ticketHistoryHtml(ticket, { full = false, limit = 12 } = {}) {
    const all = [...(ticket.recentChanges || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!all.length) return '';
    const shown = full ? all : all.slice(0, limit);

    // Jour → entrées (auteur consécutif, même jour)
    const days = [];
    for (const c of shown) {
        const key = _dayKey(c.date);
        let day = days[days.length - 1];
        if (!day || day.key !== key) { day = { key, date: c.date, entries: [] }; days.push(day); }
        const last = day.entries[day.entries.length - 1];
        if (last && last.author === c.author) last.changes.push(c);
        else day.entries.push({ author: c.author || 'Inconnu', date: c.date, changes: [c] });
    }

    // Filtres : catégories présentes dans ce qui est AFFICHÉ, de la plus fréquente à la moins fréquente
    const counts = new Map();
    for (const c of shown) { const k = catOf(c.field); counts.set(k, (counts.get(k) || 0) + 1); }
    const filters = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
        `<button type="button" class="th-filter" data-th-filter="${k}" style="--c:${CATS[k].color}" aria-pressed="false" title="N'afficher que : ${esc(CATS[k].label)}">
            <span aria-hidden="true">${CATS[k].icon}</span>${esc(CATS[k].label)}<b>${n}</b></button>`).join('');

    const body = days.map(day => {
        const dayCats = [...new Set(day.entries.flatMap(e => e.changes.map(c => catOf(c.field))))].join(' ');
        return `<li class="th-day" data-cats="${dayCats}">
            <div class="th-day-hdr">${esc(_dayLabel(day.date))}</div>
            <ol class="th-entries">${day.entries.map(e => {
                const cats = [...new Set(e.changes.map(c => catOf(c.field)))];
                return `<li class="th-entry" data-cats="${cats.join(' ')}" style="--c:${CATS[cats[0]].color}">
                    <span class="th-dot" aria-hidden="true"></span>
                    <div class="th-entry-hdr">
                        <span class="th-av th-av--author" style="background:${hashColor(e.author)}" aria-hidden="true">${esc(initials(e.author))}</span>
                        <strong class="th-author">${esc(e.author)}</strong>
                        <span class="th-time" title="${esc(_fmtFull(e.date))}">${esc(_hm(e.date))} · ${esc(fmtRelative(e.date))}</span>
                        ${e.changes.length > 1 ? `<span class="th-count">${e.changes.length} changements</span>` : ''}
                    </div>
                    <div class="th-changes">${e.changes.map(_changeHtml).join('')}</div>
                </li>`;
            }).join('')}</ol>
        </li>`;
    }).join('');

    const more = all.length - shown.length;
    return `<details class="mb-4 mdl-history th"${full ? ' open' : ''}>
        <summary class="th-sum">
            <span class="th-sum-title">🕘 Historique</span>
            <span class="th-sum-n">${all.length}</span>
            <span class="th-sum-hint">${full ? 'complet' : more > 0 ? `${shown.length} plus récents` : ''}</span>
        </summary>
        ${counts.size > 1 ? `<div class="th-filters" role="group" aria-label="Filtrer l'historique">${filters}</div>` : ''}
        <ol class="th-days">${body}</ol>
        ${more > 0 ? `<p class="th-more">… et ${more} changement${more > 1 ? 's' : ''} plus ancien${more > 1 ? 's' : ''} — passe en pleine page pour l'historique complet.</p>` : ''}
    </details>`;
}

/** Filtres par catégorie : un clic isole la catégorie, un second rend tout (lecture seule, aucun re-rendu). */
export function bindTicketHistory(root) {
    const box = root?.querySelector('.th');
    if (!box) return;
    box.querySelector('.th-filters')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-th-filter]');
        if (!btn) return;
        const k = btn.dataset.thFilter;
        const on = box.dataset.filter === k ? '' : k;
        if (on) box.dataset.filter = on; else delete box.dataset.filter;
        box.querySelectorAll('[data-th-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.thFilter === on)));
        // Masquage par attribut : une entrée / un jour reste s'il porte la catégorie, une carte seulement si c'est la sienne
        box.querySelectorAll('.th-day, .th-entry').forEach(el => { el.hidden = !!on && !el.dataset.cats.split(' ').includes(on); });
        box.querySelectorAll('.th-change').forEach(el => { el.hidden = !!on && el.dataset.cat !== on; });
    });
}
