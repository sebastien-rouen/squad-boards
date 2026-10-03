/**
 * Vues de la carte « Agenda de l'équipe » (team_calendar.js) — portage de la maquette D validée.
 *   - Semaine  : grille horaire (heure à 52 px, titre sur 1-3 lignes selon la durée, cascade au-delà
 *                de 2 chevauchements) ; mobile = vue Jour + sélecteur de jours.
 *   - Itération : couloirs (une ligne par équipe × une colonne par jour ouvré) ; rituels quotidiens
 *                une fois dans l'en-tête de ligne ; en comparaison, 3 évènements par case puis
 *                « + N autres » ; mobile = un jour à la fois.
 *   - Zoom : l'en-tête d'un jour de l'itération ouvre sa semaine ; « Tout le sprint » en revient.
 * Titres COURTS (calShortTitle) : la couleur dit la nature, la ligne dit l'équipe — le titre complet
 * reste en infobulle et dans la fiche. Imports de team_calendar.js utilisés à l'appel seulement
 * (cycle d'import sans effet à l'initialisation).
 */

import { esc, todayIsoLocal, CAL_NATURES, calNorm, calShortTitle } from '../utils.js';
import {
    dow, mondayOf, hhmm, DAY, fmtDate, fmtLong, durLabel, workdays,
    covers, load, layoutDay, iterationOf,
} from './team_calendar.js';

const H0 = 8, H1 = 19;                                   // plage horaire affichée
const mobile = () => window.matchMedia('(max-width: 640px)').matches;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const short = e => calShortTitle(e.title, e.team);
const tipOf = e => `${CAL_NATURES[e.kind].emoji} ${e.title} · ${hhmm(e.startMin)}–${hhmm(e.endMin)}`;
const tag = e => `<button class="tc-tag tc-ev" data-id="${esc(e.id)}" data-k="${e.kind}" title="${esc(e.title)}">${CAL_NATURES[e.kind].emoji} ${esc(e.person || short(e))}</button>`;
const alldayTags = (evs, day) => evs.filter(e => covers(e, day)).map(tag).join('');

// ══ Semaine : grille horaire ═══════════════════════════════════════════════════════
// Hauteur d'une heure (px) — DOIT suivre --tc-hour de team-calendar.css
const HOUR_PX = 52, LINE_PX = 14, PAD_PX = 8;
/** Bloc horaire : le titre prend TOUTES les lignes que la hauteur réelle permet (paliers fixes :
 *  « Raffinage de tickets » rogné dans 50 px de haut, mesuré) ; l'horaire seulement s'il reste
 *  une ligne après un titre complet — la position dans la grille le dit déjà. */
function block(e, style) {
    const dur = e.endMin - e.startMin;
    const room = Math.max(1, Math.floor((dur / 60 * HOUR_PX - 2 - PAD_PX) / LINE_PX));
    const withTime = room >= 4;
    const lines = withTime ? room - 1 : room;
    return `<button class="tc-ev ${lines > 1 ? 'tc-ev--multi' : 'tc-ev--l1'}${e.corrected ? ' is-corrected' : ''}" data-id="${esc(e.id)}" data-k="${e.kind}" style="${style};--lines:${lines}" title="${esc(tipOf(e))}">
        <span class="tc-ev-t">${esc(short(e))}</span>${withTime ? `<span class="tc-ev-h">${hhmm(e.startMin)} – ${hhmm(e.endMin)}</span>` : ''}</button>`;
}

/** Blocs d'un couloir pour un jour. ≤ 2 chevauchements : côte à côte ; au-delà (ou colonne étroite
 *  en comparaison) : cascade décalée — diviser la largeur donnait des blocs de moins de 28 px. */
function column(evs, narrow) {
    return layoutDay(evs.filter(e => !e.allDay)).map(e => {
        const top = (Math.max(e.startMin, H0 * 60) - H0 * 60) / 60;
        const h = Math.max(0.3, (Math.min(e.endMin, H1 * 60) - Math.max(e.startMin, H0 * 60)) / 60);
        const w = 100 / e._lanes, cascade = e._lanes > 2 || (narrow && e._lanes > 1);
        const x = cascade ? `left:calc(${e._lane * 10}px + 1px);width:calc(100% - ${e._lane * 10}px - 3px);z-index:${1 + e._lane}`
                          : `left:calc(${e._lane * w}% + 1px);width:calc(${w}% - 3px)`;
        return block(e, `position:absolute;top:calc(${top} * var(--tc-hour));height:calc(${h} * var(--tc-hour) - 2px);${x}`);
    }).join('');
}

const hours = () => Array.from({ length: H1 - H0 }, (_, i) => `<div class="tcw-hour"><span>${H0 + i}h</span></div>`).join('');
function nowLine(day) {
    const m = nowMin();
    if (day !== todayIsoLocal() || m < H0 * 60 || m > H1 * 60) return '';
    return `<div class="tcw-now" style="top:calc(${(m - H0 * 60) / 60} * var(--tc-hour))"></div>`;
}
const laneCol = (l, evs, narrow) => `<div class="tcw-lane${l.common ? ' is-common' : ''}" style="--team:${l.color}">${column(evs, narrow)}</div>`;

function weekDesktop(st, p, lanes, byLane) {
    const today = todayIsoLocal(), multi = lanes.length > 1;
    const head = p.days.map(d => `<div class="tcw-dayhead${d === today ? ' is-today' : ''}">
        <span class="tcw-dow">${DAY[dow(d)]}</span><span class="tcw-num">${+d.slice(8, 10)}</span>
        ${multi ? `<div class="tcw-sublabels">${lanes.map(l => `<span style="--team:${l.color}" title="${esc(l.label)}">${esc(l.common ? 'Commun' : l.label)}</span>`).join('')}</div>` : ''}
    </div>`).join('');
    const allday = p.days.map(d => `<div class="tcw-allday-cell">${lanes.map(l => `<div class="tc-allday">${alldayTags(byLane[l.key] || [], d)}</div>`).join('')}</div>`).join('');
    const cols = p.days.map(d => `<div class="tcw-day${d === today ? ' is-today' : ''}">
        ${lanes.map(l => laneCol(l, (byLane[l.key] || []).filter(e => e.day === d), multi)).join('')}${nowLine(d)}</div>`).join('');
    return `<div class="tcw" style="--days:${p.days.length};--lanes:${lanes.length}">
        <div class="tcw-corner"></div>${head}
        <div class="tcw-corner tcw-corner--allday">Journée</div>${allday}
        <div class="tcw-gutter">${hours()}</div><div class="tcw-cols">${cols}</div>
    </div>`;
}

/** Sélecteur de jours (mobile) — commun aux deux vues. */
function strip(p, day, lanes, byLane) {
    const today = todayIsoLocal();
    return `<div class="tc-strip" role="tablist" aria-label="Jour">${p.days.map(d => `<button class="tc-pick${d === day ? ' is-on' : ''}${d === today ? ' is-today' : ''}" data-mday="${d}" role="tab" aria-selected="${d === day}">
        <span>${DAY[dow(d)]}</span><b>${+d.slice(8, 10)}</b>
        <i>${lanes.map(l => (byLane[l.key] || []).some(e => e.day === d && !e.allDay) ? `<em style="--team:${l.color}"></em>` : '').join('')}</i>
    </button>`).join('')}</div>`;
}
const mobileDay = (st, p) => { const t = todayIsoLocal(); st.mDay = p.days.includes(st.mDay) ? st.mDay : (p.days.includes(t) ? t : p.days[0]); return st.mDay; };

function weekPhone(st, p, lanes, byLane) {
    const day = mobileDay(st, p), multi = lanes.length > 1;
    const tags = lanes.map(l => alldayTags(byLane[l.key] || [], day)).join('');
    return `<div class="tcw-phone">${strip(p, day, lanes, byLane)}
        ${tags ? `<div class="tc-allday tcw-mtags">${tags}</div>` : ''}
        <div class="tcw tcw--one" style="--days:1;--lanes:${lanes.length}">
            ${multi ? `<div class="tcw-corner"></div><div class="tcw-dayhead"><div class="tcw-sublabels">${lanes.map(l => `<span style="--team:${l.color}">${esc(l.common ? 'Commun' : l.label)}</span>`).join('')}</div></div>` : ''}
            <div class="tcw-gutter">${hours()}</div>
            <div class="tcw-cols"><div class="tcw-day${day === todayIsoLocal() ? ' is-today' : ''}">
                ${lanes.map(l => laneCol(l, (byLane[l.key] || []).filter(e => e.day === day), lanes.length > 2)).join('')}${nowLine(day)}
            </div></div>
        </div></div>`;
}

// ══ Itération : couloirs ═══════════════════════════════════════════════════════════
// Priorité quand une case est plafonnée : les jalons d'abord
const RANK = { planning: 0, demo: 1, retro: 2, train: 3, cadrage: 4, affinage: 5, metier: 6, support: 7, community: 8, rh: 9, daily: 10, release: 11, orga: 12, sync: 13, social: 14, focus: 15, other: 16, busy: 17, off: 18 };

const pill = e => `<button class="tc-ev tcl-pill${e.corrected ? ' is-corrected' : ''}" data-id="${esc(e.id)}" data-k="${e.kind}" title="${esc(tipOf(e))}">
    <span class="tcl-name">${esc(short(e))}</span><span class="tcl-time">${hhmm(e.startMin)}</span></button>`;

/** Case équipe × jour. `cap` (comparaison) : N évènements les plus importants puis « + N autres ». */
function cell(evs, day, cap, key, open) {
    const all = evs.filter(e => covers(e, day));
    let timed = evs.filter(e => !e.allDay && e.day === day).sort((a, b) => a.startMin - b.startMin);
    let more = '';
    if (cap && !open && timed.length > cap + 1) {
        const keep = new Set([...timed].sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || a.startMin - b.startMin).slice(0, cap));
        more = `<button class="tcl-more" data-expand="${esc(key)}" aria-expanded="false">+ ${timed.length - cap} autres</button>`;
        timed = timed.filter(e => keep.has(e));
    } else if (cap && open) more = `<button class="tcl-more" data-expand="${esc(key)}" aria-expanded="true">Replier</button>`;
    return `${all.length ? `<div class="tc-allday">${all.map(tag).join('')}</div>` : ''}${timed.map(pill).join('')}${more}`;
}

/** Rituels quotidiens (même titre court, même heure, ≥ 60 % des jours et au moins 3) : UNE fois
 *  dans l'en-tête de ligne — « Daily · 9h45 · 9/10 j » plutôt que dix fois « Daily ». */
function splitRecurring(evs, days) {
    const groups = new Map();
    for (const e of evs) {
        if (e.allDay) continue;
        const k = `${calNorm(short(e))}|${e.startMin}|${e.endMin}`;
        (groups.get(k) || groups.set(k, []).get(k)).push(e);
    }
    const min = Math.max(3, Math.ceil(days.length * 0.6));
    const recurring = [], drop = new Set();
    for (const g of groups.values()) {
        const n = new Set(g.map(e => e.day)).size;
        if (n >= min) { recurring.push({ first: g[0], days: n }); g.forEach(e => drop.add(e)); }
    }
    recurring.sort((a, b) => a.first.startMin - b.first.startMin);
    return { recurring, rest: evs.filter(e => !drop.has(e)) };
}

function lanesDesktop(st, p, lanes, byLane) {
    const today = todayIsoLocal(), focusMon = mondayOf(st.anchor), weeks = new Set();
    const head = p.days.map((d, i) => {
        const newWeek = i > 0 && mondayOf(d) !== mondayOf(p.days[i - 1]);
        if (newWeek) weeks.add(d);
        return `<button class="tcl-dayhead${d === today ? ' is-today' : ''}${newWeek ? ' is-week' : ''}${mondayOf(d) === focusMon ? ' is-focus' : ''}" data-zoom="${d}"
            title="Ouvrir la semaine du ${fmtDate(mondayOf(d))} en grille horaire"><span>${DAY[dow(d)]}</span><b>${+d.slice(8, 10)}</b><i aria-hidden="true">🔍</i></button>`;
    }).join('');
    const rows = lanes.map(l => {
        const all = byLane[l.key] || [];
        const { recurring, rest } = splitRecurring(all, p.days);
        return `<div class="tcl-rowhead${l.me ? ' is-me' : ''}${l.common ? ' is-common' : ''}" style="--team:${l.color}">
                <b>${esc(l.label)}</b><span>${l.common ? 'une seule fois pour toutes' : `${durLabel(Math.round(load(all, p.days)))} de réunions`}</span>
                ${recurring.map(r => `<button class="tc-ev tcl-rec" data-id="${esc(r.first.id)}" data-k="${r.first.kind}" title="${esc(`${r.first.title} — ${r.days} jours sur ${p.days.length}, retiré des cases`)}">
                    <span class="tcl-name">${esc(short(r.first))}</span><span class="tcl-time">${hhmm(r.first.startMin)} · ${r.days}/${p.days.length} j</span></button>`).join('')}
            </div>
            ${p.days.map(d => `<div class="tcl-cell${d === today ? ' is-today' : ''}${weeks.has(d) ? ' is-week' : ''}${l.common ? ' is-common' : ''}${mondayOf(d) === focusMon ? ' is-focus' : ''}">${cell(rest, d, lanes.length > 2 ? 3 : 0, `${l.key}|${d}`, (st.expanded || new Set()).has(`${l.key}|${d}`))}</div>`).join('')}`;
    }).join('');
    return `<div class="tcl-scroll"><div class="tcl" style="--days:${p.days.length}"><div class="tcl-corner"></div>${head}${rows}</div></div>`;
}

function lanesPhone(st, p, lanes, byLane) {
    const d = mobileDay(st, p), today = todayIsoLocal();
    const sections = lanes.map(l => {
        const html = cell(byLane[l.key] || [], d);
        return html ? `<div class="tcl-msec" style="--team:${l.color}"><h6>${esc(l.label)}</h6>${html}</div>` : '';
    }).join('');
    return `<div class="tcl-list">${strip(p, d, lanes, byLane)}
        <section class="tcl-mday${d === today ? ' is-today' : ''}">
            <header><b>${fmtLong(d)}</b>${d === today ? '<span>Aujourd’hui</span>' : ''}</header>
            ${sections || '<p class="tcl-free">Journée sans réunion</p>'}
        </section></div>`;
}

// ══ Synthèse : aiguillage + zoom ═══════════════════════════════════════════════════
function backBar(st) {
    const it = iterationOf(st.team, st.anchor);
    if (st.period !== 'week' || !it) return '';
    const days = workdays(it.start, it.lastDay), mon = mondayOf(st.anchor);
    const n = days.findIndex(d => d >= mon);
    const wk = n < 0 ? '' : ` · semaine ${Math.floor(n / 5) + 1} sur ${Math.ceil(days.length / 5)}`;
    return `<div class="tch-crumb"><button class="tch-back" data-period-to="iteration">↩ Tout le sprint ${esc(it.label)}</button><span>Semaine du ${esc(fmtDate(mon))}${esc(wk)}</span></div>`;
}
/** 3 équipes en grille horaire = 4 sous-colonnes par jour : trop étroit pour lire (mesuré). */
function crowdHint(st) {
    if (st.period !== 'week' || st.compare.length < 2) return '';
    return `<div class="tch-hint">💡 ${st.compare.length + 1} équipes en semaine, c'est serré — les titres se lisent en entier
        <button class="tch-back" data-period-to="iteration">sur l'itération</button> ou au survol d'un bloc.</div>`;
}

export const TC_VIEWS = {
    hybrid: {
        html(st, p, lanes, byLane) {
            const it = st.period === 'iteration' && p.it;
            const view = it ? (mobile() ? lanesPhone : lanesDesktop) : (mobile() ? weekPhone : weekDesktop);
            return `<div class="tch tch--${it ? 'iteration' : 'week'}">${backBar(st)}${crowdHint(st)}${view(st, p, lanes, byLane)}</div>`;
        },
        after(el, st, rerender) {
            const again = () => rerender(el, st);
            el.querySelectorAll('[data-mday]').forEach(b => b.addEventListener('click', () => { st.mDay = b.dataset.mday; again(); }));
            el.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => { st.period = 'week'; st.anchor = b.dataset.zoom; st.mDay = b.dataset.zoom; again(); }));
            el.querySelectorAll('[data-period-to]').forEach(b => b.addEventListener('click', () => { st.period = b.dataset.periodTo; again(); }));
            el.querySelectorAll('[data-expand]').forEach(b => b.addEventListener('click', () => {
                st.expanded = st.expanded || new Set();
                const k = b.dataset.expand;
                st.expanded.has(k) ? st.expanded.delete(k) : st.expanded.add(k);
                again();
                el.querySelector(`[data-expand="${CSS.escape(k)}"]`)?.focus();
            }));
            // Survol d'un évènement (couloirs) : même nature mise en évidence dans toutes les équipes
            const grid = el.querySelector('.tcl');
            if (grid) {
                grid.addEventListener('mouseover', e => { const b = e.target.closest('.tc-ev'); grid.dataset.hl = b ? b.dataset.k : ''; });
                grid.addEventListener('mouseleave', () => { grid.dataset.hl = ''; });
            }
        },
    },
};
