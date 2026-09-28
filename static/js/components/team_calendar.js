/**
 * Carte « Agenda de l'équipe » (page Équipe) — direction D de la maquette static/mockups/team-calendar/ :
 * « Semaine » = grille horaire, « Itération » = couloirs (une ligne par équipe), zoom d'un jour de
 * l'itération vers sa semaine. Comparaison avec d'autres équipes à cocher (3 max).
 *
 * Données : store `calendarEvents` (ICS de tous les agendas, UTC), `calendars`, `calendarRules`.
 * Nature + portée : utils/cal-classify.js (source unique, aussi utilisée par le bandeau calendrier).
 * Ce module : modèle, coquille (en-tête, filtres, pied), fiche « Classer comme… », états.
 * Les deux vues vivent dans team_calendar_views.js.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import {
    esc, toast, getSprintForTeam, extractSprintLabel, todayIsoLocal,
    CAL_NATURES, CAL_SCOPES, calNorm, calNatureWithRules, calScope, calPerson,
} from '../utils.js';
import { TC_VIEWS } from './team_calendar_views.js';

export const COMMON = '__common__';                      // couloir « Train & commun » en comparaison
const DEFAULT_SCOPES = ['team', 'group', 'train'];         // « Opérations » masqué par défaut : bruyant
const NOT_MEETING = new Set(['off', 'support', 'busy', 'focus']);   // jamais comptés dans la charge
const SCOPE_RANK = { team: 0, group: 1, train: 2, ops: 3 };
const LS_PERIOD = 'sb-team-cal-period';
const MAX_COMPARE = 3;

// ── Dates locales (chaînes YYYY-MM-DD / YYYY-MM-DDTHH:MM, jamais d'UTC) ─────────────
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => new Date(s.slice(0, 10) + 'T00:00:00');
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return isoOf(d); };
export const dow = s => parse(s).getDay();
export const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
export const hhmm = m => `${Math.floor(m / 60)}h${pad(m % 60)}`;
export const DAY = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DAY_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const fmtDate = s => `${+s.slice(8, 10)} ${MONTH[+s.slice(5, 7) - 1]}`;
export const fmtLong = s => `${DAY_LONG[dow(s)]} ${+s.slice(8, 10)} ${MONTH[+s.slice(5, 7) - 1]}`;
export const durLabel = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m / 60} h`);
export const workdays = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) if (dow(d) % 6) out.push(d); return out; };

/** ICS UTC → heure locale. Journée entière : la date telle quelle (pas de décalage de fuseau). */
function toLocal(s, allDay) {
    if (!s) return '';
    if (allDay) return String(s).slice(0, 10);
    const d = new Date(s);
    return isNaN(d) ? '' : `${isoOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const minutesOf = s => (s.length > 10 ? (+s.slice(11, 13)) * 60 + (+s.slice(14, 16)) : 0);
export const teamColor = name => ((store.get('teamObjects') || []).find(t => t.name === name) || {}).color || '#64748b';

// ── Modèle : évènements d'une équipe, enrichis — mémoïsé par (évènements, règles) ────
let _cache = { evs: null, rules: null, byTeam: new Map() };

/** Évènements qui concernent `team` : nature (règle > détection), portée, personne, minutes locales.
 *  Dédoublonnés sur titre + début : la démo d'itération arrive par GLOBAL ET par le groupe GDEM ;
 *  on garde la portée la plus proche de l'équipe. */
export function eventsFor(team) {
    const evs = store.get('calendarEvents') || [];
    const rules = store.get('calendarRules') || [];
    if (_cache.evs !== evs || _cache.rules !== rules) _cache = { evs, rules, byTeam: new Map() };
    if (_cache.byTeam.has(team)) return _cache.byTeam.get(team);
    const out = [], seen = new Map();
    evs.forEach((ev, i) => {
        const scope = calScope(ev.team, ev.calendarName, team);
        if (!scope) return;
        const start = toLocal(ev.start, ev.allDay), end = toLocal(ev.end, ev.allDay) || start;
        if (!start) return;
        const key = `${ev.title}|${start}`;
        const prev = seen.get(key);
        if (prev && SCOPE_RANK[prev.scope] <= SCOPE_RANK[scope]) return;
        if (prev) out.splice(out.indexOf(prev), 1);
        const { nature, detected, rule } = calNatureWithRules(ev.title, rules);
        const s = minutesOf(start);
        const e = end.length > 10 && end.slice(0, 10) === start.slice(0, 10) ? minutesOf(end) : s + 30;
        const item = {
            id: `${team}#${i}`, team, title: ev.title || '', start, end, day: start.slice(0, 10),
            allDay: !!ev.allDay || e - s >= 360,            // ≥ 6 h = journée (« Livraison en prod ») : bandeau
            startMin: s, endMin: Math.max(e, s + 15), kind: nature, detected, rule,
            corrected: !!rule && nature !== detected, scope, cal: ev.calendarName || '', location: ev.location || '',
            person: calPerson(ev.title, nature),
        };
        seen.set(key, item);
        out.push(item);
    });
    _cache.byTeam.set(team, out);
    return out;
}

/** Évènement journée entière qui couvre `day` (fin exclusive en ICS). */
export const covers = (ev, day) => ev.allDay && ev.day <= day && (ev.end.slice(0, 10) > day || ev.day === day);

/** Charge de réunions (minutes) sur des jours donnés. */
export function load(events, days) {
    const set = new Set(days);
    let total = 0;
    for (const e of events) if (!e.allDay && !NOT_MEETING.has(e.kind) && set.has(e.day)) total += e.endMin - e.startMin;
    return total;
}

/** Itération JIRA de l'équipe contenant `day` : { label, start, lastDay } (dernier jour inclus). */
export function iterationOf(team, day) {
    const s = getSprintForTeam(team, store.get('sprintInfo'), day);
    if (!s?.startDate || !s?.endDate) return null;
    const last = new Date(Date.parse(s.endDate) - 60000);    // fin JIRA à minuit = veille incluse
    return { label: extractSprintLabel(s.name) || s.name, start: toLocal(s.startDate, false).slice(0, 10), lastDay: isoOf(last) };
}

/** Couloirs de chevauchement pour une journée (algorithme glouton standard des agendas). */
export function layoutDay(evs) {
    const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    const lanes = []; let cluster = [], clusterEnd = -1;
    const flush = () => { const n = Math.max(1, ...cluster.map(e => e._lane + 1)); cluster.forEach(e => { e._lanes = n; }); cluster = []; };
    for (const e of sorted) {
        if (e.startMin >= clusterEnd && cluster.length) { flush(); lanes.length = 0; }
        let li = lanes.findIndex(end => end <= e.startMin);
        if (li < 0) { li = lanes.length; lanes.push(0); }
        lanes[li] = e.endMin; e._lane = li; cluster.push(e);
        clusterEnd = Math.max(clusterEnd, e.endMin);
    }
    if (cluster.length) flush();
    return sorted;
}

// ── Période, couloirs, visibles ─────────────────────────────────────────────────────
export function period(st) {
    const it = iterationOf(st.team, st.anchor);
    if (st.period === 'iteration' && it) return { label: `Itération ${it.label}`, days: workdays(it.start, it.lastDay), it };
    const mon = mondayOf(st.anchor);
    return { label: `Semaine du ${fmtDate(mon)}`, days: workdays(mon, addDays(mon, 4)), it };
}

export function lanesOf(st) {
    const out = [st.team, ...st.compare].map(t => ({ key: t, label: t, color: teamColor(t), me: t === st.team }));
    if (st.compare.length) out.push({ key: COMMON, label: 'Train & commun', color: 'var(--text-muted)', common: true });
    return out;
}

/** Visibles par couloir. En comparaison, train/opérations ne sont dessinés qu'UNE fois (« Commun »). */
function visible(st, days) {
    const first = days[0], last = days[days.length - 1];
    const inRange = e => e.allDay ? (e.day <= last && e.end.slice(0, 10) > first) : (e.day >= first && e.day <= last);
    const byLane = {}, shared = new Map();
    for (const t of [st.team, ...st.compare]) {
        byLane[t] = [];
        for (const e of eventsFor(t)) {
            if (!st.kinds.has(e.kind) || !st.scopes.has(e.scope) || !inRange(e)) continue;
            if (st.compare.length && (e.scope === 'train' || e.scope === 'ops')) shared.set(`${e.title}|${e.start}`, { ...e, team: COMMON });
            else byLane[t].push(e);
        }
    }
    if (st.compare.length) byLane[COMMON] = [...shared.values()];
    return byLane;
}

// ── Agendas de l'équipe : existence, fraîcheur, masquage ─────────────────────────
function teamCalendars(team) {
    return (store.get('calendars') || []).filter(c => String(c.team || '').split(',').map(s => s.trim()).includes(team));
}

// ── Rendu ────────────────────────────────────────────────────────────────────────
export function render(el, st) {
    const p = period(st);
    const cals = teamCalendars(st.team);
    const mine = eventsFor(st.team);
    const counts = {};
    for (const e of mine) if (p.days.includes(e.day)) counts[e.kind] = (counts[e.kind] || 0) + 1;
    const ownInP = mine.filter(e => (e.scope === 'team' || e.scope === 'group') && p.days.includes(e.day));
    const masked = ownInP.length > 0 && ownInP.every(e => e.kind === 'busy');
    const last = cals.map(c => c.lastFetched).filter(Boolean).sort().pop();
    const stale = !!last && Date.now() - Date.parse(last) > 48 * 3600e3;
    let body;
    if (!store.get('calendarEvents')) body = skeleton();
    else if (!cals.length) body = stateHtml('📭', "Aucun agenda relié à cette équipe", "Reliez l'agenda Google de l'équipe (adresse iCal secrète) : cérémonies, support et absences apparaîtront ici, rangés automatiquement.", '<a class="btn btn-primary" href="#settings/calendriers">＋ Relier un agenda</a>');
    else {
        const byLane = visible(st, p.days);
        const any = Object.values(byLane).some(a => a.length);
        body = any ? TC_VIEWS.hybrid.html(st, p, lanesOf(st), byLane)
            : stateHtml('🌤️', 'Rien de prévu sur cette période', 'Aucun évènement ne correspond aux filtres. Réactivez des natures, des portées, ou changez de période.', '<button class="btn btn-secondary" data-act="reset">Réinitialiser les filtres</button>');
    }
    el.innerHTML = `
    <section class="card tc-card" style="--team:${teamColor(st.team)}" aria-label="Agenda de l'équipe">
        <header class="tc-head">
            <div class="tc-title">
                <strong>📅 Agenda de l'équipe</strong>
                <span class="tc-sub">${esc(p.label)}${p.it ? (st.period === 'iteration' && p.it
                    ? ` · du ${fmtDate(p.it.start)} au ${fmtDate(p.it.lastDay)}`
                    : ` · itération ${esc(p.it.label)} (${fmtDate(p.it.start)} → ${fmtDate(p.it.lastDay)})`) : ''}</span>
            </div>
            <div class="tc-nav" role="group" aria-label="Naviguer">
                <button class="tc-iconbtn" data-act="prev" aria-label="Période précédente">‹</button>
                <button class="tc-today" data-act="today">Aujourd'hui</button>
                <button class="tc-iconbtn" data-act="next" aria-label="Période suivante">›</button>
            </div>
            <div class="tc-seg" role="group" aria-label="Période">
                <button data-period="week" aria-pressed="${st.period === 'week'}">Semaine</button>
                <button data-period="iteration" aria-pressed="${st.period === 'iteration'}"${p.it ? '' : ' disabled title="Aucune itération JIRA connue pour cette équipe"'}>Itération</button>
            </div>
            <div class="tc-compare">
                <button data-act="compare" aria-haspopup="true" aria-expanded="${!!st.popOpen}">⇄ Comparer${st.compare.length ? ` <span class="tc-count">${st.compare.length}</span>` : ''}</button>
                ${comparePop(st)}
            </div>
        </header>
        ${st.compare.length ? `<div class="tc-compared">${lanesOf(st).filter(l => !l.common).map(l => `
            <span class="tc-team-pill${l.me ? ' tc-team-pill--me' : ''}" style="--team:${l.color}">${esc(l.label)}${l.me ? '' : `<button data-remove="${esc(l.key)}" aria-label="Retirer ${esc(l.label)}">×</button>`}</span>`).join('')}</div>` : ''}
        ${masked ? `<div class="tc-banner">🔒 <div><b>Agenda partagé en « disponibilités seulement ».</b> Google masque les titres : ces créneaux ne peuvent pas être rangés. Partagez l'agenda avec <b>tous les détails</b> au compte de synchronisation.</div></div>` : ''}
        ${stale ? `<div class="tc-banner">⏳ <div><b>Dernière synchronisation de l'agenda : ${esc(new Date(last).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }))}.</b> Les évènements ajoutés depuis n'apparaissent pas. <a href="#settings/calendriers">Synchroniser</a></div></div>` : ''}
        <div class="tc-filters" role="group" aria-label="Filtrer">
            ${Object.entries(CAL_NATURES).filter(([k]) => counts[k] || !st.kinds.has(k)).map(([k, n]) => `
                <button class="tc-chip" data-k="${k}" data-kind="${k}" aria-pressed="${st.kinds.has(k)}">${n.emoji} ${esc(n.label)} <b>${counts[k] || 0}</b></button>`).join('')}
            <span class="tc-sep" aria-hidden="true"></span>
            ${Object.entries(CAL_SCOPES).map(([k, s]) => `<button class="tc-chip tc-chip--scope" data-scope="${k}" aria-pressed="${st.scopes.has(k)}">${s.icon} ${esc(s.label)}</button>`).join('')}
        </div>
        <div class="tc-body">${body}${detailHtml(st)}</div>
        ${footHtml(p, mine, st, last)}
    </section>`;
    if (store.get('calendarEvents') && cals.length) TC_VIEWS.hybrid.after(el, st, render);
    wire(el, st);
}

function comparePop(st) {
    const others = (store.get('teamObjects') || []).filter(t => t.name !== st.team);
    return `<div class="tc-pop" ${st.popOpen ? '' : 'hidden'} role="dialog" aria-label="Comparer avec d'autres équipes">
        <div class="tc-pop-title">Comparer avec</div>
        <input class="tc-pop-search" type="search" placeholder="Filtrer les équipes…" aria-label="Filtrer les équipes">
        ${others.map(t => {
            const on = st.compare.includes(t.name), full = !on && st.compare.length >= MAX_COMPARE;
            const has = teamCalendars(t.name).length > 0;
            return `<label class="tc-check" style="--team:${t.color || '#64748b'}"${full ? ` aria-disabled="true" title="${MAX_COMPARE} équipes au plus : au-delà, la grille devient illisible"` : ''}>
                <input type="checkbox" data-cmp="${esc(t.name)}" ${on ? 'checked' : ''} ${full ? 'disabled' : ''}>
                <span class="tc-box" aria-hidden="true"></span>${esc(t.name)}<span class="tc-meta">${has ? '' : 'sans agenda'}</span>
            </label>`;
        }).join('')}
    </div>`;
}

function footHtml(p, mine, st, last) {
    const inP = mine.filter(e => p.days.includes(e.day));
    const total = load(inP.filter(e => st.scopes.has(e.scope)), p.days);
    const detectable = inP.filter(e => e.kind !== 'busy');
    const pct = detectable.length ? Math.round(detectable.filter(e => e.kind !== 'other').length / detectable.length * 100) : 100;
    const base = p.days.length * 7 * 60, ratio = base ? Math.min(100, Math.round(total / base * 100)) : 0;
    return `<footer class="tc-foot">
        <span class="tc-meter" title="Réunions hors absences, support, détails masqués et temps protégé — base 7 h par jour ouvré">
            ⏱️ <strong>${durLabel(Math.round(total))}</strong> de réunions <span class="tc-meter-bar"><span style="width:${ratio}%"></span></span> ${ratio} %
        </span>
        <span title="Évènements rangés automatiquement ou à la main dans une nature">🧭 <strong>${pct} %</strong> rangés</span>
        ${last ? `<span class="tc-fresh"><span class="tc-dot"></span>Agenda synchronisé le ${esc(new Date(last).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</span>` : ''}
    </footer>`;
}

const stateHtml = (ico, h, p, action) => `<div class="tc-state"><div class="tc-state-ico">${ico}</div><h5>${h}</h5><p>${p}</p>${action}</div>`;
const skeleton = () => `<div class="tc-skeleton" aria-busy="true" aria-label="Chargement de l'agenda">${Array.from({ length: 5 },
    () => `<div>${[40, 70, 28, 90, 50].map(h => `<div class="tc-skel" style="height:${h}px"></div>`).join('')}</div>`).join('')}</div>`;

// ── Fiche d'évènement + « Classer comme… » ──────────────────────────────────────────
function findEvent(st, id) {
    for (const t of [st.team, ...st.compare]) { const e = eventsFor(t).find(x => x.id === id); if (e) return e; }
    return null;
}

function detailHtml(st) {
    const e = st.selected && findEvent(st, st.selected);
    if (!e) return '';
    const n = CAL_NATURES[e.kind], sc = CAL_SCOPES[e.scope];
    const norm = calNorm(e.title);
    const same = (store.get('calendarEvents') || []).filter(x => calNorm(x.title) === norm).length;
    const when = e.allDay ? `${fmtLong(e.day)} · journée entière` : `${fmtLong(e.day)} · ${hhmm(e.startMin)} → ${hhmm(e.endMin)} (${durLabel(e.endMin - e.startMin)})`;
    return `<div class="tc-detail" data-k="${e.kind}" role="dialog" aria-label="${esc(e.title)}" style="${st.detailPos || 'top:60px;right:24px'}">
        <div class="tc-detail-band"></div>
        <button class="tc-close" data-act="close" aria-label="Fermer">✕</button>
        <div class="tc-detail-body">
            <h4>${esc(e.title)}</h4>
            <div class="tc-detail-row"><span>🕘</span><span>${esc(when)}</span></div>
            <div class="tc-detail-row"><span>🗓️</span><span>${esc(e.cal)}</span></div>
            ${e.location ? `<div class="tc-detail-row"><span>📍</span><span>${esc(e.location)}</span></div>` : ''}
            ${e.person ? `<div class="tc-detail-row"><span>👤</span><span>${esc(e.person)}</span></div>` : ''}
            <div class="tc-badges">
                <span class="tc-badge tc-badge--k">${n.emoji} ${esc(n.label)}</span>
                <span class="tc-badge">${sc.icon} ${esc(sc.label)}</span>
                <span class="tc-badge">${e.rule ? '✎ rangé à la main' : '🧭 détecté automatiquement'}</span>
            </div>
        </div>
        <div class="tc-reclass">
            <label for="tc-reclass-sel">Classer comme</label>
            <select id="tc-reclass-sel" data-reclass="${esc(e.title)}">
                ${Object.entries(CAL_NATURES).map(([k, v]) => `<option value="${k}" ${k === e.kind ? 'selected' : ''}>${v.emoji} ${esc(v.label)}</option>`).join('')}
            </select>
            <p>S'applique aux <b>${same}</b> évènements « ${esc(e.title)} », dans toutes les équipes.${e.rule ? ` <a href="#" data-unclass="${esc(e.rule.id)}">Revenir à la détection</a>` : ''}</p>
        </div>
    </div>`;
}

/** Enregistre une règle et rafraîchit le store (le cache des évènements se recalcule seul).
 *  Exportée : aussi utilisée par Paramètres → Calendriers (file « À positionner »). */
export async function saveRule(title, nature) {
    try {
        const r = await api.saveCalendarRule({ titleNorm: calNorm(title), nature, titleExample: title });
        store.set('calendarRules', [...(store.get('calendarRules') || []).filter(x => x.titleNorm !== r.titleNorm), r]);
        toast(`« ${title} » rangé en ${CAL_NATURES[nature].label} — pour toutes les équipes`, 'success');
    } catch (e) { toast(`Classement non enregistré : ${e.message}`, 'error'); }
}
export async function dropRule(id) {
    try {
        await api.deleteCalendarRule(id);
        store.set('calendarRules', (store.get('calendarRules') || []).filter(x => x.id !== id));
    } catch (e) { toast(`Impossible de revenir à la détection : ${e.message}`, 'error'); }
}

// ── Interactions ─────────────────────────────────────────────────────────────────
function wire(el, st) {
    const again = () => render(el, st);
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => {
        const a = b.dataset.act, step = st.period === 'iteration' ? 14 : 7;
        if (a === 'prev' || a === 'next') st.anchor = addDays(st.anchor, a === 'prev' ? -step : step);
        else if (a === 'today') st.anchor = todayIsoLocal();
        else if (a === 'compare') st.popOpen = !st.popOpen;
        else if (a === 'close') st.selected = null;
        else if (a === 'reset') { st.kinds = new Set(Object.keys(CAL_NATURES)); st.scopes = new Set(DEFAULT_SCOPES); }
        else return;
        ev.preventDefault(); again();
    }));
    el.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
        st.period = b.dataset.period;
        try { localStorage.setItem(LS_PERIOD, st.period); } catch { /* navigation privée */ }
        again();
    }));
    el.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { st.kinds.has(b.dataset.kind) ? st.kinds.delete(b.dataset.kind) : st.kinds.add(b.dataset.kind); again(); }));
    el.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { st.scopes.has(b.dataset.scope) ? st.scopes.delete(b.dataset.scope) : st.scopes.add(b.dataset.scope); again(); }));
    el.querySelectorAll('[data-cmp]').forEach(i => i.addEventListener('change', () => {
        st.compare = i.checked ? [...st.compare, i.dataset.cmp] : st.compare.filter(t => t !== i.dataset.cmp); again();
    }));
    el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { st.compare = st.compare.filter(t => t !== b.dataset.remove); again(); }));
    el.querySelectorAll('.tc-ev[data-id]').forEach(b => b.addEventListener('click', () => {
        st.selected = st.selected === b.dataset.id ? null : b.dataset.id;
        const r = b.getBoundingClientRect(), host = el.querySelector('.tc-body').getBoundingClientRect();
        const left = Math.min(Math.max(8, r.right - host.left + 8), host.width - 330);
        st.detailPos = `top:${Math.max(8, r.top - host.top)}px;left:${left > 8 ? left : Math.max(8, r.left - host.left - 330)}px`;
        again();
    }));
    el.querySelector('[data-reclass]')?.addEventListener('change', e => saveRule(e.target.dataset.reclass, e.target.value));
    el.querySelector('[data-unclass]')?.addEventListener('click', e => { e.preventDefault(); dropRule(e.target.dataset.unclass); });
    const search = el.querySelector('.tc-pop-search');
    search?.addEventListener('input', () => el.querySelectorAll('.tc-check').forEach(l => { l.hidden = !l.textContent.toLowerCase().includes(search.value.toLowerCase()); }));
}

// ── Montage ──────────────────────────────────────────────────────────────────────
let _mounted = null;    // { el, st } — une seule carte à la fois (page Équipe)
let _listening = false;

/** Monte la carte sur `el` pour `team`. Se redessine quand les règles ou les agendas changent. */
export function mountTeamCalendar(el, team) {
    let saved = 'week';
    try { saved = localStorage.getItem(LS_PERIOD) === 'iteration' ? 'iteration' : 'week'; } catch { /* privé */ }
    const prev = _mounted && _mounted.st.team === team ? _mounted.st : null;
    const st = prev || {
        team, compare: [], period: saved, anchor: todayIsoLocal(), popOpen: false, selected: null, detailPos: null,
        kinds: new Set(Object.keys(CAL_NATURES)), scopes: new Set(DEFAULT_SCOPES),
    };
    _mounted = { el, st };
    if (!_listening) {
        _listening = true;
        const redraw = () => { if (_mounted?.el.isConnected) render(_mounted.el, _mounted.st); };
        store.on('calendarRules', redraw);
        store.on('calendarEvents', redraw);
        // Popover « Comparer » et fiche : fermés au clic extérieur et sur Échap (comportement standard —
        // restés ouverts, ils recouvraient les évènements après avoir coché une équipe, mesuré).
        document.addEventListener('click', e => {
            const m = _mounted;
            if (!m?.el.isConnected) return;
            let changed = false;
            if (m.st.popOpen && !e.target.closest('.tc-compare')) { m.st.popOpen = false; changed = true; }
            if (m.st.selected && !e.target.closest('.tc-detail, .tc-ev')) { m.st.selected = null; changed = true; }
            if (changed) render(m.el, m.st);
        });
        document.addEventListener('keydown', e => {
            const m = _mounted;
            if (e.key !== 'Escape' || !m?.el.isConnected || !(m.st.popOpen || m.st.selected)) return;
            m.st.popOpen = false; m.st.selected = null;
            render(m.el, m.st);
        });
    }
    render(el, st);
}
