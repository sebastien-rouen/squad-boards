/**
 * Mode TV — 🗞️ La semaine en bref, en CALENDRIER : une colonne par jour (lundi → dimanche, le
 * week-end resserré), les évènements rangés dans leur journée, et au-dessus des colonnes les
 * bandeaux de sprint (« Sprint 31.2 ») qui couvrent leurs jours, avec 🏁 fin et ▶ début.
 *
 * Évènements : MEP, incidents de prod (cliquables), opérations d'infrastructure (prod en rouge),
 * arrivées / départs / mobilités, faits saisis, jalons du train ; fériés dans l'en-tête du jour.
 * Plusieurs équipes : un bandeau par numéro de sprint (de la 1re ouverture à la dernière clôture),
 * et dans la journée « 🏁 Fin 31.2 · 6 équipes ».
 *
 * Navigation (3.196.0) : ‹ › semaine précédente / suivante (l'écran se fige le temps de la lecture,
 * tv.js) ; clic sur un jour → son détail complet dans le panneau (au lieu du seul défilement).
 *
 * Agendas (3.199.0) : une équipe → SON agenda (👥, liseré plein), celui de son groupe (🧩), et les
 * agendas communs du train (🚂) et des opérations (⚙️), en pointillé avec leur icône ; plusieurs
 * équipes → les agendas communs seuls (13 dailys par jour noieraient la semaine). Source unique :
 * `eventsFor` (carte « Agenda de l'équipe » — nature, portée, dédoublonnage). MEP, opérations et
 * jalons du train en viennent aussi : ils ne sont plus repris de la frise (pas de doublon). Les
 * absences d'agenda tiennent en une ligne par jour ; « Détails masqués » est écarté. Clic sur un
 * évènement → son détail (tv-week-event.js).
 */

import { store } from '../state.js';
import { esc, CAL_NATURES, CAL_SCOPES, calShortTitle } from '../utils.js';
import { holidayName } from '../utils/holidays.js';
import { collect, summary, shortName, opsIsProd } from '../components/team_timeline_model.js';
import { eventsFor, covers } from '../components/team_calendar.js';
import { calEventDetailHtml, offDetailHtml } from './tv-week-event.js';
import { kpisHtml } from '../components/team_timeline_export.js';
import { tkAttrs, dayKey } from './tv-screens.js';

const atNoon = k => new Date(`${k}T12:00:00`);
const plusDays = (k, n) => { const d = atNoon(k); d.setDate(d.getDate() + n); return dayKey(d); };
const mondayOf = k => plusDays(k, -((atNoon(k).getDay() + 6) % 7));
const sprintLabel = name => (String(name || '').match(/(\d+\.\d+)/) || [])[1] || String(name || '');
const MOVE = { in: ['▲', 'Arrivée'], out: ['▼', 'Départ'], 'move-in': ['⇄', 'Arrivée par mobilité'], 'move-out': ['⇄', 'Départ en mobilité'] };
const DOW = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** Sprints du périmètre qui touchent la semaine, regroupés par numéro (31.2) : bandeau + bornes. */
function sprintBands(teams, days) {
    const A = days[0], B = days.at(-1);
    const by = new Map();
    for (const s of store.get('sprintInfo')?.teamSprints || []) {
        if (!teams.includes(s.team) || !s.startDate || !s.endDate) continue;
        const start = dayKey(new Date(s.startDate)), end = dayKey(new Date(s.endDate));
        if (end < A || start > B) continue;
        const lbl = sprintLabel(s.name);
        const g = by.get(lbl) || by.set(lbl, { lbl, start, end, starts: new Map(), ends: new Map() }).get(lbl);
        g.start = start < g.start ? start : g.start;
        g.end = end > g.end ? end : g.end;
        if (start >= A) g.starts.set(start, [...(g.starts.get(start) || []), s.team]);
        if (end <= B) g.ends.set(end, [...(g.ends.get(end) || []), s.team]);
    }
    return [...by.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** Bornes de sprint d'une journée (plusieurs équipes : combien ouvrent / clôturent ; `full` : lesquelles). */
function boundsOf(bands, d, single, full = false) {
    const who = list => (single ? '' : full ? ` · ${list.join(', ')}` : ` · ${list.length} équipe${list.length > 1 ? 's' : ''}`);
    return bands.flatMap(g => [
        ...(g.ends.get(d) ? [{ ico: '🏁', txt: `Fin ${g.lbl}${who(g.ends.get(d))}`, cls: 'is-sprint' }] : []),
        ...(g.starts.get(d) ? [{ ico: '▶', txt: `Début ${g.lbl}${who(g.starts.get(d))}`, cls: 'is-sprint' }] : []),
    ]);
}

/** Évènement d'agenda : couleur de sa nature (`data-k`, palette de team-calendar.css), heure, et pour un
 *  agenda commun l'icône de sa portée. Cliquable → détail (`data-cal-ev` = index dans `_weekCal`). */
const calItemHtml = e => {
    const sc = CAL_SCOPES[e.scope] || { icon: '📅', label: '' };
    return `<li class="tvw-cal ${e.scope === 'team' ? 'is-team' : 'is-common'}${e.prod ? ' is-prod' : ''}" data-k="${esc(e.kind)}" data-scope="${esc(e.scope)}" data-cal-ev="${e.cal}" tabindex="0" role="button" aria-label="${esc(`${e.title} — ${sc.label} — voir le détail`)}">`
        + `<span aria-hidden="true">${e.ico}</span><span>${e.time ? `<time>${esc(e.time)}</time> ` : ''}${esc(e.txt)}${e.scope !== 'team' ? ` <small class="tvw-scope" title="${esc(`Agenda commun · ${sc.label} · ${e.calName}`)}">${sc.icon}</small>` : ''}</span></li>`;
};
const itemHtml = e => (e.cal !== undefined ? calItemHtml(e)
    : e.offDay ? `<li class="tvw-cal is-off" data-k="off" data-cal-off="${e.offDay}" tabindex="0" role="button" aria-label="${esc(e.txt)} — voir le détail"><span aria-hidden="true">🏖️</span><span>${esc(e.txt)}</span></li>`
    : `<li class="${e.cls || ''}"${e.id ? ` ${tkAttrs(e.id)}` : ''}><span aria-hidden="true">${e.ico}</span><span>${e.id ? `<code>${esc(e.id)}</code> ` : ''}${esc(e.txt)}${e.who ? ` <small>${esc(e.who)}</small>` : ''}</span></li>`);

let _weekCal = [];          // items d'agenda de la dernière semaine rendue — résolus au clic
let _weekOff = new Map();   // jour → évènements d'absence regroupés
let _weekMulti = [];        // index (dans _weekCal) des évènements de PLUSIEURS jours → bandeaux

/** Durée en jours d'un évènement « journée entière » (fin EXCLUSIVE en ICS) ; 1 pour un horaire. */
const spanDays = e => (e.allDay ? Math.max(1, Math.round((atNoon(e.end.slice(0, 10)) - atNoon(e.day)) / 864e5)) : 1);

/** Évènements d'agenda de la semaine (items d'`eventsFor`), sans « Détails masqués ». */
function calendarItems(teams, A, B) {
    const single = teams.length === 1;
    return eventsFor(single ? teams[0] : '*').filter(e => e.kind !== 'busy'
        && (e.allDay ? e.day <= B && (e.end.slice(0, 10) > A || e.day >= A) : e.day >= A && e.day <= B));
}
const weekLabel = off => (off === 0 ? 'cette semaine' : off === -1 ? 'semaine dernière' : off === 1 ? 'semaine prochaine' : off < 0 ? `il y a ${-off} semaines` : `dans ${off} semaines`);

/** Évènements de la semaine par jour : { day → [item] }, dans l'ordre d'affichage (journée entière,
 *  absences, puis à l'heure). Agenda via `eventsFor` ; incidents, mouvements et faits saisis via la frise. */
function eventsByDay(teams, A, B) {
    const single = teams.length === 1, scopeTeam = single ? teams[0] : '*';
    const inScope = tm => single || !tm || teams.includes(tm);
    const c = collect(scopeTeam, A, B);
    const out = new Map();
    const add = (d, e) => { if (d >= A && d <= B) (out.get(d) || out.set(d, []).get(d)).push(e); };
    // Agenda
    _weekCal = calendarItems(teams, A, B);
    _weekOff = new Map();
    // Plusieurs jours (« Audit SSI » du 21/09 au 09/10) : un bandeau au-dessus des colonnes, pas une
    // ligne répétée dans chaque journée. Les absences restent comptées par jour.
    _weekMulti = _weekCal.map((e, i) => (e.kind !== 'off' && spanDays(e) > 1 ? i : -1)).filter(i => i >= 0);
    const multi = new Set(_weekMulti);
    for (let d = A; d <= B; d = plusDays(d, 1)) {
        const offs = [];
        _weekCal.forEach((e, i) => {
            if (multi.has(i) || !(e.allDay ? covers(e, d) : e.day === d)) return;
            if (e.kind === 'off') { offs.push(e); return; }
            const prod = e.scope === 'ops' && opsIsProd(e.title);
            add(d, { cal: i, kind: e.kind, scope: e.scope, title: e.title, calName: e.cal, prod,
                ico: prod ? '⚠️' : (CAL_NATURES[e.kind] || CAL_NATURES.other).emoji,
                time: e.allDay ? '' : e.start.slice(11, 16).replace(':', 'h'), sort: e.allDay ? '' : e.start.slice(11, 16),
                txt: calShortTitle(e.title, single ? teams[0] : '') });
        });
        if (offs.length) {
            _weekOff.set(d, offs);
            const names = offs.map(e => shortName(e.person || e.title));
            add(d, { offDay: d, sort: '', txt: `${offs.length} absent${offs.length > 1 ? 's' : ''} · ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` });
        }
    }
    // Hors agenda : incidents (tickets), arrivées / départs, faits saisis
    c.incidents.flatMap(x => x.items).filter(i => inScope(i.team)).forEach(i => add(i.day, { ico: '🚨', id: i.id, txt: i.title, who: single ? '' : i.team, cls: 'is-inc', sort: '' }));
    c.moves.filter(m => inScope(m.team)).forEach(m => add(m.day, { ico: MOVE[m.kind]?.[0] || '⇄', txt: `${MOVE[m.kind]?.[1] || 'Mouvement'} · ${shortName(m.who)}`, who: single ? '' : m.team, cls: 'is-move', sort: '' }));
    c.facts.forEach(f => add(f.start < A ? A : f.start, { ico: '📌', txt: `${f.title}${f.end > f.start ? ` (→ ${+f.end.slice(8)}/${+f.end.slice(5, 7)})` : ''}`, cls: 'is-fact', sort: '' }));
    // Journée entière d'abord (sort ''), puis à l'heure ; tri stable.
    for (const list of out.values()) list.sort((x, y) => (x.sort || '').localeCompare(y.sort || ''));
    return { byDay: out, c };
}

/** Détail d'un évènement d'agenda de la semaine affichée (clic sur `data-cal-ev`). `backDay` : panneau
 *  ouvert depuis le détail d'un jour → bouton de retour vers ce jour. */
export function weekCalEventHtml(i, backDay = null) {
    const ev = _weekCal[+i];
    if (!ev) return '';
    const html = calEventDetailHtml(ev);
    return backDay ? html.replace('<header class="tvw-evd-hd">', `<button type="button" class="tv-chip-btn tvw-evd-back" data-week-day="${esc(backDay)}">← Toute la journée</button><header class="tvw-evd-hd">`) : html;
}

/** Détail des absences d'agenda d'un jour (clic sur `data-cal-off`). */
export function weekOffHtml(day) {
    const list = _weekOff.get(day) || [];
    return list.length ? offDetailHtml(day, list) : '';
}

/** `offset` : semaines par rapport à la semaine courante (‹ › de l'en-tête). */
export function screenWeek({ teams }, offset = 0) {
    const today = dayKey(new Date()), A = plusDays(mondayOf(today), 7 * offset), B = plusDays(A, 6);
    const days = Array.from({ length: 7 }, (_, i) => plusDays(A, i));
    const single = teams.length === 1;
    const { byDay, c } = eventsByDay(teams, A, B);
    const bands = sprintBands(teams, days);
    const col = d => days.indexOf(d) + 1;
    const total = [...byDay.values()].reduce((n, l) => n + l.length, 0);

    // Bandeaux de sprint : une rangée par numéro, du 1er jour couvert au dernier (bornés à la semaine).
    const bandHtml = bands.map(g => {
        const from = g.start < A ? A : g.start, to = g.end > B ? B : g.end;
        const opened = g.start >= A, closed = g.end <= B;
        return `<div class="tvw-band${opened ? ' is-open' : ''}${closed ? ' is-close' : ''}" style="grid-column:${col(from)} / ${col(to) + 1}">
            ${opened ? '<span aria-hidden="true">▶</span>' : '<span class="tvw-band-cont" aria-hidden="true">…</span>'}<b>Sprint ${esc(g.lbl)}</b>${closed ? '<span aria-hidden="true">🏁</span>' : '<span class="tvw-band-cont" aria-hidden="true">…</span>'}
        </div>`;
    }).join('');

    const dayHtml = d => {
        const list = [...boundsOf(bands, d, single), ...(byDay.get(d) || [])];
        const wd = atNoon(d).getDay(), hol = holidayName(d);
        const lbl = atNoon(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        // Jour cliquable (souris, ou Entrée sur l'en-tête) → son détail complet dans le panneau.
        return `<section class="tvw-day${d === today ? ' is-today' : ''}${wd % 6 === 0 ? ' is-weekend' : ''}${d > today ? ' is-future' : ''}${hol ? ' is-holiday' : ''}" data-week-day="${d}">
            <header tabindex="0" role="button" data-week-day="${d}" aria-label="Détail du ${esc(lbl)}${list.length ? ` — ${list.length} évènement${list.length > 1 ? 's' : ''}` : ''}"><span>${DOW[wd]}</span><b>${+d.slice(8)}</b>${list.length ? `<small>${list.length}</small>` : ''}${hol ? `<em>🎌 ${esc(hol)}</em>` : ''}</header>
            <div class="tvw-list"><ul>${list.map(itemHtml).join('')}</ul></div>
        </section>`;
    };
    // Évènements de plusieurs jours : bandeaux cliquables, couleur de leur nature, liseré de leur portée.
    const evBandHtml = _weekMulti.map(i => {
        const e = _weekCal[i], last = plusDays(e.end.slice(0, 10), -1);
        const from = e.day < A ? A : e.day, to = last > B ? B : last;
        if (to < A || from > B) return '';
        const sc = CAL_SCOPES[e.scope] || { icon: '📅', label: '' };
        return `<button type="button" class="tvw-band is-ev tvw-cal ${e.scope === 'team' ? 'is-team' : 'is-common'}" data-k="${esc(e.kind)}" data-cal-ev="${i}" style="grid-column:${col(from)} / ${col(to) + 1}" title="${esc(`${e.title} — ${sc.label} · ${e.cal}`)}">`
            + `${e.day < A ? '<span class="tvw-band-cont" aria-hidden="true">…</span>' : ''}<span aria-hidden="true">${(CAL_NATURES[e.kind] || CAL_NATURES.other).emoji}</span><b>${esc(calShortTitle(e.title, single ? teams[0] : ''))}</b>${e.scope !== 'team' ? `<small class="tvw-scope">${sc.icon}</small>` : ''}${last > B ? '<span class="tvw-band-cont" aria-hidden="true">…</span>' : ''}</button>`;
    }).join('');
    const fmt = k => atNoon(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const nav = `<nav class="tvw-nav" aria-label="Changer de semaine">
            <button type="button" class="tv-chip-btn" data-week-nav="-1" aria-label="Semaine précédente">‹</button>
            ${offset ? '<button type="button" class="tv-chip-btn" data-week-nav="0">Cette semaine</button>' : ''}
            <button type="button" class="tv-chip-btn" data-week-nav="1" aria-label="Semaine suivante">›</button>
        </nav>`;
    return `<div class="tv-week">
        <div class="tv-journee-hd"><span aria-hidden="true">🗞️</span><div><h2>Semaine du ${esc(fmt(A))} au ${esc(fmt(B))}${offset ? ` <small class="tvw-rel">· ${esc(weekLabel(offset))}</small>` : ''}</h2><p>${single ? esc(teams[0]) : 'tout le train'} · ${total} évènement${total > 1 ? 's' : ''}${bands.length ? ` · sprint${bands.length > 1 ? 's' : ''} ${bands.map(g => esc(g.lbl)).join(' → ')}` : ''}</p>
            <p class="tvw-legend">${single
                ? `<span class="tvw-lg is-team">👥 Agenda de l'équipe</span><span class="tvw-lg is-common">🧩 Groupe</span><span class="tvw-lg is-common">🚂 Train</span><span class="tvw-lg is-common">⚙️ Opérations</span>`
                : '<span class="tvw-lg is-common">🚂 Train · ⚙️ Opérations — agendas communs seulement</span><span class="tvw-lg-hint">choisis une équipe pour voir son agenda</span>'}</p></div>${nav}</div>
        <div class="tl-kpis">${kpisHtml(summary(c))}</div>
        <div class="tvw-cal">
            ${bandHtml || evBandHtml ? `<div class="tvw-bands">${bandHtml}${evBandHtml}</div>` : ''}
            <div class="tvw-days">${days.map(dayHtml).join('')}</div>
        </div>
    </div>`;
}

/** Panneau « détail d'un jour » : tous ses évènements, texte entier, équipes nommées. */
export function weekDayHtml(teams, d) {
    const A = mondayOf(d), B = plusDays(A, 6);
    const days = Array.from({ length: 7 }, (_, i) => plusDays(A, i));
    const single = teams.length === 1;
    const { byDay } = eventsByDay(teams, A, B);
    const spans = _weekMulti.filter(i => covers(_weekCal[i], d)).map(i => {
        const e = _weekCal[i];
        return { cal: i, kind: e.kind, scope: e.scope, title: e.title, calName: e.cal, ico: (CAL_NATURES[e.kind] || CAL_NATURES.other).emoji,
            time: '', txt: `${calShortTitle(e.title, single ? teams[0] : '')} (${+e.day.slice(8)}/${+e.day.slice(5, 7)} → ${+plusDays(e.end.slice(0, 10), -1).slice(8)}/${+plusDays(e.end.slice(0, 10), -1).slice(5, 7)})` };
    });
    const list = [...boundsOf(sprintBands(teams, days), d, single, true), ...spans, ...(byDay.get(d) || [])];   // items d'agenda cliquables
    const lbl = atNoon(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const hol = holidayName(d);
    return `<div class="tvd-panel tvw-detail" data-l="cloud" data-day="${esc(d)}" role="dialog" aria-modal="true" aria-label="${esc(lbl)}">
        <header class="tvd-hd"><span aria-hidden="true">🗓️</span><b>${esc(lbl)}</b>
            <span class="tvd-big">${single ? esc(teams[0]) : 'tout le train'}</span>
            <button type="button" class="btn-icon tvd-close" data-tvd-close aria-label="Fermer">✕</button></header>
        ${hol ? `<p class="tvd-tip">🎌 Jour férié · ${esc(hol)}</p>` : ''}
        ${list.length ? `<ul class="tvw-daylist">${list.map(itemHtml).join('')}</ul>` : '<p class="tv-muted">Rien de prévu ni de marquant ce jour-là.</p>'}
    </div>`;
}

/** Jours trop chargés : la liste glisse jusqu'en bas pendant `ms` (pauses en haut et en bas), en
 *  boucle aller-retour sur un écran figé. Appelé par tv.js après le rendu (il faut la hauteur réelle). */
export function rollDays(root, ms, loop) {
    root.querySelectorAll('.tvw-list').forEach(box => {
        const ul = box.firstElementChild, over = ul.scrollHeight - box.clientHeight;
        ul.classList.remove('is-rolling', 'is-loop');
        if (over <= 4) return;
        ul.style.setProperty('--dy', `${-over - 8}px`);
        ul.style.setProperty('--d', `${Math.max(6000, ms - 1000)}ms`);
        ul.classList.add('is-rolling');
        ul.classList.toggle('is-loop', !!loop);
    });
}
