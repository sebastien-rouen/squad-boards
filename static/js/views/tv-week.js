/**
 * Mode TV — 🗞️ La semaine en bref, en CALENDRIER : une colonne par jour (lundi → dimanche, le
 * week-end resserré), les évènements rangés dans leur journée, et au-dessus des colonnes les
 * bandeaux de sprint (« Sprint 31.2 ») qui couvrent leurs jours, avec 🏁 fin et ▶ début.
 *
 * Évènements : MEP, incidents de prod (cliquables), opérations d'infrastructure (prod en rouge),
 * arrivées / départs / mobilités, faits saisis, jalons du train ; fériés dans l'en-tête du jour.
 * Plusieurs équipes : un bandeau par numéro de sprint (de la 1re ouverture à la dernière clôture),
 * et dans la journée « 🏁 Fin 31.2 · 6 équipes ».
 */

import { store } from '../state.js';
import { esc } from '../utils.js';
import { holidayName } from '../utils/holidays.js';
import { collect, summary, shortName } from '../components/team_timeline_model.js';
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

/** Évènements de la semaine par jour : { day → [{ ico, txt, id?, who?, cls? }] }. */
function eventsByDay(teams, A, B) {
    const single = teams.length === 1, scopeTeam = single ? teams[0] : '*';
    const inScope = tm => single || !tm || teams.includes(tm);
    const c = collect(scopeTeam, A, B);
    const out = new Map();
    const add = (d, e) => { if (d >= A && d <= B) (out.get(d) || out.set(d, []).get(d)).push(e); };
    c.milestones.forEach(m => add(m.day, { ico: '🚂', txt: m.title, cls: 'is-train' }));
    c.releases.forEach(r => r.items.forEach(i => add(r.day, { ico: '🚀', txt: i.title, cls: 'is-mep' })));
    c.incidents.flatMap(x => x.items).filter(i => inScope(i.team)).forEach(i => add(i.day, { ico: '🚨', id: i.id, txt: i.title, who: single ? '' : i.team, cls: 'is-inc' }));
    c.operations.forEach(o => add(o.day, { ico: o.prod ? '⚠️' : '⚙️', txt: `${o.time ? o.time.replace(':', 'h') + ' ' : ''}${o.title}`, cls: o.prod ? 'is-prod' : 'is-ops' }));
    c.moves.filter(m => inScope(m.team)).forEach(m => add(m.day, { ico: MOVE[m.kind]?.[0] || '⇄', txt: `${MOVE[m.kind]?.[1] || 'Mouvement'} · ${shortName(m.who)}`, who: single ? '' : m.team, cls: 'is-move' }));
    c.facts.forEach(f => add(f.start < A ? A : f.start, { ico: '📌', txt: `${f.title}${f.end > f.start ? ` (→ ${+f.end.slice(8)}/${+f.end.slice(5, 7)})` : ''}`, cls: 'is-fact' }));
    return { byDay: out, c };
}

export function screenWeek({ teams }) {
    const today = dayKey(new Date()), A = mondayOf(today), B = plusDays(A, 6);
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

    // Bornes de sprint dans la journée (plusieurs équipes : combien ouvrent / clôturent ce jour-là).
    const bounds = d => bands.flatMap(g => [
        ...(g.ends.get(d) ? [{ ico: '🏁', txt: `Fin ${g.lbl}${single ? '' : ` · ${g.ends.get(d).length} équipe${g.ends.get(d).length > 1 ? 's' : ''}`}`, cls: 'is-sprint' }] : []),
        ...(g.starts.get(d) ? [{ ico: '▶', txt: `Début ${g.lbl}${single ? '' : ` · ${g.starts.get(d).length} équipe${g.starts.get(d).length > 1 ? 's' : ''}`}`, cls: 'is-sprint' }] : []),
    ]);

    const item = e => `<li class="${e.cls || ''}"${e.id ? ` ${tkAttrs(e.id)}` : ''}><span aria-hidden="true">${e.ico}</span><span>${e.id ? `<code>${esc(e.id)}</code> ` : ''}${esc(e.txt)}${e.who ? ` <small>${esc(e.who)}</small>` : ''}</span></li>`;
    const dayHtml = d => {
        const list = [...bounds(d), ...(byDay.get(d) || [])];
        const wd = atNoon(d).getDay(), hol = holidayName(d);
        return `<section class="tvw-day${d === today ? ' is-today' : ''}${wd % 6 === 0 ? ' is-weekend' : ''}${d > today ? ' is-future' : ''}${hol ? ' is-holiday' : ''}">
            <header><span>${DOW[wd]}</span><b>${+d.slice(8)}</b>${list.length ? `<small>${list.length}</small>` : ''}${hol ? `<em>🎌 ${esc(hol)}</em>` : ''}</header>
            <div class="tvw-list"><ul>${list.map(item).join('')}</ul></div>
        </section>`;
    };
    const fmt = k => atNoon(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return `<div class="tv-week">
        <div class="tv-journee-hd"><span aria-hidden="true">🗞️</span><div><h2>Semaine du ${esc(fmt(A))} au ${esc(fmt(B))}</h2><p>${single ? esc(teams[0]) : 'tout le train'} · ${total} évènement${total > 1 ? 's' : ''}${bands.length ? ` · sprint${bands.length > 1 ? 's' : ''} ${bands.map(g => esc(g.lbl)).join(' → ')}` : ''}</p></div></div>
        <div class="tl-kpis">${kpisHtml(summary(c))}</div>
        <div class="tvw-cal">
            ${bandHtml ? `<div class="tvw-bands">${bandHtml}</div>` : ''}
            <div class="tvw-days">${days.map(dayHtml).join('')}</div>
        </div>
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
