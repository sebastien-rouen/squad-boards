/**
 * 🌅 Dailys regroupés par créneau — bandeau calendrier DÉPLIÉ en vue globale (3.247.0).
 *
 * À 09h30, six équipes tiennent leur daily : six pastilles quasi identiques remplissaient deux lignes de la
 * grille. Elles deviennent UNE pastille « 🌅 09h30 · 6 dailys » + mini-badges d'équipe ; un clic la déplie
 * (les six réapparaissent juste derrière elle), un second la replie. État d'ouverture = mémoire de session
 * (`_open`), pas de localStorage : on déplie pour regarder, pas pour garder.
 * Nature « daily » = `calNatureWithRules` (règles saisies à la main comprises, même source que la carte agenda).
 * Styles : css/views/cal-banner-compact.css.
 */
import { esc, calNatureWithRules } from '../utils.js';

const _MIN_GROUP = 2;     // à partir de 2 dailys au même créneau
const _open = new Set();  // clés « HH:MM » dépliées

const _hm = d => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Remplace, dans une liste d'évènements triés, les dailys d'un même créneau de début par un groupe.
 * @returns {Array<{ev: object} | {key: string, evs: object[]}>}  ordre d'origine conservé (1ʳᵉ occurrence)
 */
export function groupDailies(evs, rules) {
    const byStart = new Map();
    for (const ev of evs) {
        if (ev.allDay || calNatureWithRules(ev.title, rules).nature !== 'daily') continue;
        const k = _hm(new Date(ev.start));
        if (!byStart.has(k)) byStart.set(k, []);
        byStart.get(k).push(ev);
    }
    const out = [], seen = new Set();
    for (const ev of evs) {
        const k = ev.allDay ? null : _hm(new Date(ev.start));
        const grp = k && byStart.get(k);
        if (grp && grp.length >= _MIN_GROUP && grp.includes(ev)) {
            if (!seen.has(k)) { seen.add(k); out.push({ key: k, evs: grp }); }
        } else out.push({ ev });
    }
    return out;
}

export const isDailyGroupOpen = key => _open.has(key);
export function toggleDailyGroup(key) { if (_open.has(key)) _open.delete(key); else _open.add(key); }

/** Pastille d'un groupe de dailys (mini-badges d'équipe, détail en infobulle). */
export function dailyGroupChipHtml(key, evs, teamColor) {
    const open = _open.has(key);
    const teams = [...new Set(evs.map(ev => (ev.team || '').split(',')[0].trim()))];   // une équipe = un badge
    const tip = [`${evs.length} dailys à ${key} — clic : ${open ? 'replier' : 'les voir'}`,
        ...evs.map(ev => `• ${ev.title}${ev.team ? ` (${ev.team})` : ''}`)].join('\n');
    const badges = teams.map(t => {
        const abbr = t ? t.replace(/^(team|équipe)\s+/i, '').slice(0, 2).toUpperCase() : '?';
        return `<span class="cal-dg-team" style="--cal-color:${t ? teamColor(t) : '#94a3b8'}">${esc(abbr)}</span>`;
    }).join('');
    return `<button type="button" class="cal-chip cal-chip--daily-group${open ? ' is-open' : ''}" data-daily-group="${esc(key)}"
            aria-expanded="${open}" title="${esc(tip)}">
        <span class="cal-chip-time">🌅 ${esc(key)}</span>
        <span class="cal-chip-title">${evs.length} dailys</span>
        <span class="cal-dg-teams" aria-hidden="true">${badges}</span>
        <span class="cal-dg-chev" aria-hidden="true">${open ? '▴' : '▾'}</span>
    </button>`;
}
