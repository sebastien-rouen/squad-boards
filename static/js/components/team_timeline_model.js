/**
 * Modèle de la carte « Faits marquants » (page Équipe) — frise 1 de la maquette
 * static/mockups/team-timeline/ (« Couloirs du temps »), portée sur les données du store.
 *
 * Aucune saisie par défaut :
 *  - Rythme      : PI (1er sprint JIRA, `piStartDate`) + sprints JIRA de l'équipe + jalons des agendas du train
 *  - Production  : tickets bug/support « prod » / « production » / « incident » (mot entier), ou label `incident-prod`
 *  - Livraisons  : créneaux de MEP des agendas de l'équipe ou de son groupe (ICS)
 *  - Présence    : table `absence` × roster du PI en vigueur (`piInfo.piMembers`), par semaine
 *  - Arrivées & départs : différence des rosters d'un PI à l'autre + tickets « Check-list on/offboarding »
 *  - 1v1         : « [1v1] Mohamed/Omar », « O3 - Elsa/Tanisha » des agendas de l'équipe
 *  - Faits       : table `event` (store `events`), `teams` vide = tout le train
 *
 * Tout est recalculé quand un tableau du store change (mémo par identité).
 */

import { store } from '../state.js';
import { extractTeam, teamNameMatches, todayIsoLocal, calScope, CAL_SCOPES } from '../utils.js';
import { piStartDate, piNumFromSprintName } from '../utils/pi-weeks.js';
import { eventsFor } from './team_calendar.js';
import { holidayName } from '../utils/holidays.js';
import { addDays, diff, mondayOf, fmtShort, fmt, fmtY, inRange, localDay, norm, samePerson, per } from './team_timeline_base.js';
import { supportLoad, STALE_WEEKS } from './team_timeline_support.js';
// API inchangée pour les autres modules (couloirs, récit, export, matrice…) : ré-exports
export { addDays, diff, mondayOf, dayOfWeek, fmt, fmtShort, fmtY, monthShort, monthName, shortName } from './team_timeline_base.js';
export { STALE_WEEKS, supportTrackers } from './team_timeline_support.js';

// ── Catégories (couleur = jeton CSS --c-*) et types de faits (= `event.type` en base) ─
export const CATS = {
    rythme:     { label: 'Rythme',             emoji: '🧭' },
    production: { label: 'Production',         emoji: '🚨' },
    livraison:  { label: 'Livraisons',         emoji: '🚀' },
    operations: { label: 'Opérations',         emoji: '⚙️' },
    presence:   { label: 'Présence',           emoji: '🏖️' },
    equipe:     { label: 'Arrivées & départs', emoji: '👥' },
    oneonone:   { label: '1v1',                emoji: '💬' },
    charge:     { label: 'Support',            emoji: '🛎️' },
    fait:       { label: 'Faits marquants',    emoji: '📌' },
};
export const FACT_TYPES = {
    incident:  { label: 'Incident de production', emoji: '💥' },
    freeze:    { label: 'Gel / freeze',           emoji: '🧊' },
    milestone: { label: 'Jalon',                  emoji: '🚩' },
    period:    { label: 'Période',                emoji: '📅' },
    other:     { label: 'Autre',                  emoji: '📌' },
};

// Seuil de période creuse (et du rouge de présence) : 25 % d'absence
const LOW_THRESHOLD = 25, LOW_MIN_WEEKS = 2;
/** Niveau de présence d'une semaine : vert à 100 %, orange de 75 à 99 %, rouge sous 75 %. */
export const presenceLevel = pct => pct === null || pct === undefined ? null : pct === 0 ? 'ok' : pct <= LOW_THRESHOLD ? 'mid' : 'low';

// Heuristiques de titres (mêmes règles que la maquette, éprouvées sur les vraies données)
const INCIDENT = /\bprod\b|production|incident/i;
// PAS `désynchro` : chez Initiale ce sont 47 campagnes de comparaison GDD/SPD en masse, pas des incidents.
// « prod » en MOT ENTIER : écarte « problème » et « PreProd » (faux positifs mesurés).
const INCIDENT_LABELS = ['incident-prod'];
export const REL = /\bmepp?\b|me\(p\)p|mise en (pr[ée])?prod|livraison en prod/i;
export const MIL = /pi\s*planning|i\s*&\s*a|inspect|journ[ée]es?\s*innovation|d[ée]monstration d.it[ée]ration/i;
// « Ptit point entretien » (Helica) est ambigu : exclu plutôt que deviné
// « O3 » partout dans le titre (« O3 - Elsa/Tanisha », « [O3] … », « Point O3 … »), pas seulement en tête
const ONE = /\b1v1\b|\bo3\b|one[- ]on[- ]one|\b1:1\b/i;
const ONE_PREFIX = /^\s*(\[\s*(1v1|o3)\s*\]|1v1|o3)\s*[-–:]?\s*/i;
// Les 1v1 sont planifiés des mois à l'avance (O3 de Gabbiano jusqu'en janvier) : fenêtre étendue
const FUTURE_DAYS = 183;

// ── Mémo : un modèle par état du store ─────────────────────────────────────────
const SOURCES = ['tickets', 'absences', 'piInfo', 'sprintInfo', 'events', 'calendarEvents', 'calendarRules', 'teams'];
let _memo = { key: null, model: null };

function model() {
    const key = SOURCES.map(k => store.get(k));
    if (_memo.key && key.every((v, i) => v === _memo.key[i])) return _memo.model;
    _memo = { key, model: build() };
    return _memo.model;
}

function build() {
    const teams = store.get('teams') || [];
    const sprintInfo = store.get('sprintInfo'), piInfo = store.get('piInfo');
    const teamSprints = sprintInfo?.teamSprints || [];
    const canon = name => teams.find(t => t === name) || teams.find(t => teamNameMatches(name, t)) || null;

    // PI connus (rosters importés + sprints JIRA), bornés par leurs sprints réels
    const piNums = new Set(Object.keys(piInfo?.piMembers || {}).map(Number));
    teamSprints.forEach(s => { const n = piNumFromSprintName(s.name); if (n) piNums.add(n); });
    const pis = [...piNums].map(n => ({ n, start: piStartDate(sprintInfo, n) })).filter(p => p.start).sort((a, b) => a.start.localeCompare(b.start));
    pis.forEach((p, i) => {
        const ends = teamSprints.filter(s => piNumFromSprintName(s.name) === p.n).map(s => localDay(s.plannedEndDate || s.endDate)).filter(Boolean).sort();
        const next = pis[i + 1] ? addDays(pis[i + 1].start, -1) : null;
        p.end = next || ends[ends.length - 1] || addDays(p.start, 10 * 7 - 1);
    });

    // Sprints par équipe (« Juke - ité 31.2 » → 31.2)
    const sprints = {};
    for (const s of teamSprints) {
        const t = canon(s.team), m = String(s.name || '').match(/(\d+)\.(\d+)/);
        if (!t || !m || !s.startDate) continue;
        (sprints[t] ||= []).push({ label: `${m[1]}.${m[2]}`, start: localDay(s.startDate), end: localDay(s.plannedEndDate || s.endDate) || localDay(s.startDate) });
    }
    Object.values(sprints).forEach(v => v.sort((a, b) => a.start.localeCompare(b.start)));

    // Rosters par PI, dédoublonnés sans accents
    const rosters = {};
    for (const [pi, members] of Object.entries(piInfo?.piMembers || {})) {
        const by = {};
        for (const m of members || []) {
            const t = canon(extractTeam(m.team || ''));
            if (!t) continue;
            const k = norm(m.name);
            (by[t] ||= new Map()).has(k) || by[t].set(k, { name: m.name, role: m.role || '' });
        }
        rosters[pi] = Object.fromEntries(Object.entries(by).map(([t, v]) => [t, [...v.values()]]));
    }

    const today = todayIsoLocal();
    // Début : premier PI dont on a le roster (les vieux sprints JIRA — PI 20… — faisaient partir
    // « Tout » de 2024 : 125 semaines de couloirs vides) ; au plus un an en arrière
    const rostered = pis.filter(p => M_hasRoster(rosters, p.n));
    const W0 = [rostered[0]?.start || addDays(today, -182), addDays(today, -365)].sort()[1];
    // Fin : dernier PI, ou dernier évènement d'agenda déjà planifié (plafonné à 6 mois)
    const lastIcs = (store.get('calendarEvents') || []).map(e => localDay(e.start)).filter(Boolean).sort().pop() || today;
    const W1 = [pis[pis.length - 1]?.end || today, today, [lastIcs, addDays(today, FUTURE_DAYS)].sort()[0]].sort()[2];
    return { teams, pis, sprints, rosters, today, window: [W0, W1], cache: new Map(), canon };
}

const M_hasRoster = (rosters, n) => Object.keys(rosters[String(n)] || {}).length > 0;

const teamsOf = (M, team) => team === '*' ? M.teams : [team];
const piOf = (M, d) => [...M.pis].reverse().find(p => p.start <= d) || null;

// ── Arrivées & départs ─────────────────────────────────────────────────────────
const rosterNames = (M, pi, team) => ((M.rosters[pi] || {})[team] || []).map(m => m.name);
const teamOfIn = (M, pi, name, except) => Object.entries(M.rosters[pi] || {}).find(([t, ms]) => t !== except && ms.some(m => samePerson(m.name, name)))?.[0] || null;

/** Check-lists on/offboarding (tickets du TRAIN, rangés chez Fuego) : rattachées à une équipe par le nom. */
function checklists(M) {
    return per(M, 'checklists', '', () => {
        const members = Object.values(M.rosters).flatMap(r => Object.entries(r).flatMap(([t, ms]) => ms.map(m => [t, m.name])));
        const out = [];
        for (const t of store.get('tickets') || []) {
            const lab = (t.labels || []).map(x => String(x).toLowerCase());
            const kind = lab.includes('offboarding') ? 'out' : lab.includes('onboarding') ? 'in' : null;
            if (!kind) continue;
            const who = String(t.title || '').replace(/^.*?(on|off)boarding\s*[-–:]?\s*/i, '')
                .replace(/^(d['’]un\s+)?co[ée]quipier\s+ERPC\s*[-–:]?\s*/i, '').replace(/^[\s\-–]+|[\s\-–]+$/g, '');
            const hit = members.find(([, n]) => samePerson(n, who));
            out.push({ day: localDay(t.createdAt), kind, who, team: hit ? hit[0] : null, ticket: t.id });
        }
        return out;
    });
}

/** Mouvements d'une équipe (ou du train si team === '*'). kind : in | out | move-in | move-out. */
function turnover(M, team) {
    return per(M, 'turnover', team, () => {
        const out = [];
        for (let i = 1; i < M.pis.length; i++) {
            const p = String(M.pis[i - 1].n), q = String(M.pis[i].n), day = M.pis[i].start;
            if (!M.rosters[p] || !M.rosters[q]) continue;                // PI sans roster importé : rien à comparer
            for (const t of teamsOf(M, team)) {
                const before = rosterNames(M, p, t), after = rosterNames(M, q, t);
                for (const n of after.filter(x => !before.some(y => samePerson(x, y)))) {
                    const from = teamOfIn(M, p, n, t);
                    if (team === '*' && from) continue;                     // mobilité interne : comptée une fois (départ)
                    out.push({ day, kind: from ? 'move-in' : 'in', who: n, team: t, from, to: t, precise: false, pi: +q });
                }
                for (const n of before.filter(x => !after.some(y => samePerson(x, y)))) {
                    const to = teamOfIn(M, q, n, t);
                    out.push({ day, kind: to ? 'move-out' : 'out', who: n, team: t, from: t, to, precise: false, pi: +q });
                }
            }
        }
        // Check-list : date exacte, fusionnée avec le mouvement de roster de la même personne
        for (const m of checklists(M)) {
            if (team !== '*' && m.team !== team) continue;
            const kinds = m.kind === 'in' ? ['in', 'move-in'] : ['out', 'move-out'];
            const hit = out.find(o => kinds.includes(o.kind) && samePerson(o.who, m.who));
            if (hit) { hit.checklist = m.day; hit.precise = true; hit.day = m.day; }
            else out.push({ day: m.day, kind: m.kind, who: m.who, team: m.team, precise: true, checklist: m.day, onlyChecklist: true });
        }
        // Entrée et sortie de la même personne à moins de 45 jours : signalée « à vérifier », pas tranchée
        for (const a of out) for (const b of out) {
            if (a !== b && a.kind.endsWith('in') !== b.kind.endsWith('in') && samePerson(a.who, b.who) && Math.abs(diff(a.day, b.day)) <= 45) a.conflict = b.conflict = true;
        }
        return out.sort((a, b) => a.day.localeCompare(b.day));
    });
}

// ── Présence : % d'absence par semaine, périodes creuses ───────────────────────
function absenceIndex(M) {
    return per(M, 'absIdx', '', () => {
        const idx = new Map();
        for (const a of store.get('absences') || []) {
            const k = norm(a.memberName), s = localDay(a.startDate), e = localDay(a.endDate) || s;
            if (k && s) (idx.get(k) || idx.set(k, []).get(k)).push([s, e]);
        }
        return idx;
    });
}

function presence(M, team) {
    return per(M, 'presence', team, () => {
        if (team === '*') {
            const all = M.teams.map(t => presence(M, t));
            return (all[0] || []).map((w, i) => {
                const vals = all.map(r => r[i]?.pct).filter(v => v !== null && v !== undefined);
                const sum = k => all.reduce((a, r) => a + (r[i]?.[k] || 0), 0);   // train : absents et effectifs additionnés
                return { week: w.week, pct: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, peak: 0, away: sum('away'), size: sum('size'), holidays: w.holidays };
            });
        }
        const idx = absenceIndex(M), out = [];
        for (let w = mondayOf(M.window[0]); w <= M.window[1]; w = addDays(w, 7)) {
            const pi = piOf(M, w);
            const ros = pi ? rosterNames(M, String(pi.n), team).map(norm) : [];
            // Fériés de la semaine : ni congé ni jour ouvré (l'import RH les enregistre comme des absences —
            // le 1er et le 8 mai gonflaient la semaine du 4 mai). Montrés à part (🎌).
            const holidays = [0, 1, 2, 3, 4].map(i => addDays(w, i)).filter(holidayName).map(d => ({ day: d, name: holidayName(d) }));
            if (!ros.length) { out.push({ week: w, pct: null, peak: 0, holidays }); continue; }
            const days = [0, 1, 2, 3, 4].map(i => addDays(w, i)).filter(d => !holidayName(d));
            if (!days.length) { out.push({ week: w, pct: 0, peak: 0, away: 0, size: ros.length, holidays }); continue; }
            const offAt = d => ros.filter(n => (idx.get(n) || []).some(([s, e]) => s <= d && d <= e)).length;
            const perDay = days.map(offAt);
            // `away` = personnes en congé AU MOINS un jour de la semaine, sur `size` (plus parlant qu'un % en petite équipe)
            const away = ros.filter(n => days.some(d => (idx.get(n) || []).some(([s, e]) => s <= d && d <= e))).length;
            out.push({ week: w, pct: Math.round(perDay.reduce((a, b) => a + b, 0) / (days.length * ros.length) * 100), peak: Math.max(...perDay), away, size: ros.length, holidays });
        }
        return out;
    });
}

/** Semaines consécutives ≥ seuil → une période ; « Congés d'été » si son MILIEU tombe en juillet-août. */
function lowPeriods(series) {
    const out = []; let cur = null;
    const close = () => { if (cur && cur.weeks >= LOW_MIN_WEEKS) out.push(cur); cur = null; };
    for (const s of series) {
        if (s.pct !== null && s.pct >= LOW_THRESHOLD) {
            cur ||= { start: s.week, end: addDays(s.week, 4), peak: s.pct, peakWeek: s.week, weeks: 0, sum: 0 };
            cur.end = addDays(s.week, 4); cur.weeks++; cur.sum += s.pct;
            if (s.pct > cur.peak) { cur.peak = s.pct; cur.peakWeek = s.week; }
        } else close();
    }
    close();
    out.forEach(p => {
        p.avg = Math.round(p.sum / p.weeks);
        const mid = addDays(p.start, Math.floor(diff(p.start, p.end) / 2)), mm = mid.slice(5, 7);
        p.label = mm === '07' || mm === '08' ? 'Congés d’été' : 'Période creuse';
    });
    return out;
}

// ── Production, livraisons, jalons, 1v1 ────────────────────────────────────────
/** Incidents regroupés par semaine (un marqueur par semaine, taille = nombre). */
function incidents(M, team) {
    return per(M, 'incidents', team, () => {
        const by = new Map();
        for (const t of store.get('tickets') || []) {
            if (!['bug', 'support'].includes(t.type)) continue;
            const labels = (t.labels || []).map(x => String(x).toLowerCase());
            if (!INCIDENT.test(t.title || '') && !labels.some(l => INCIDENT_LABELS.includes(l))) continue;
            const tt = M.canon(t.team || '');
            if (!tt || (team !== '*' && tt !== team)) continue;
            const day = localDay(t.createdAt), w = mondayOf(day);
            (by.get(w) || by.set(w, []).get(w)).push({ id: t.id, day, team: tt, status: t.jiraStatus || t.status || '', title: String(t.title || '').slice(0, 160) });
        }
        return [...by.entries()].map(([week, items]) => ({ week, day: items[0].day, items, count: items.length })).sort((a, b) => a.week.localeCompare(b.week));
    });
}

/** Évènements d'agenda de l'équipe (ou de toutes), dédoublonnés sur titre + jour. */
function calendar(M, team) {
    return per(M, 'calendar', team, () => {
        const seen = new Set(), out = [];
        for (const t of teamsOf(M, team)) for (const e of eventsFor(t)) {
            const k = `${e.title}|${e.day}`;
            if (!seen.has(k)) { seen.add(k); out.push(e); }
        }
        return out;
    });
}

function releases(M, team, src) {
    const by = new Map();
    for (const e of calendar(M, team)) {
        if (!['team', 'group'].includes(e.scope) || !src.has(e.scope) || !REL.test(e.title)) continue;
        (by.get(e.day) || by.set(e.day, []).get(e.day)).push({ title: e.title, cal: e.cal });
    }
    return [...by.entries()].map(([day, items]) => ({ day, items })).sort((a, b) => a.day.localeCompare(b.day));
}
const milestones = M => calendar(M, '*').filter(e => e.scope === 'train' && MIL.test(e.title))
    .map(e => ({ day: e.day, title: e.title }))
    .filter((m, i, all) => all.findIndex(x => x.day === m.day && x.title.replace(/Adapt|Inspect/, '') === m.title.replace(/Adapt|Inspect/, '')) === i)
    .sort((a, b) => a.day.localeCompare(b.day));
const oneOnOnes = (M, team) => calendar(M, team).filter(e => e.scope === 'team' && ONE.test(e.title))
    .map(e => ({ day: e.day, title: e.title, pair: e.title.replace(ONE_PREFIX, '').trim() }))
    .sort((a, b) => a.day.localeCompare(b.day));
/** Opérations d'infrastructure (agenda « ERPC - Opérations » : migrations, interventions, audits, PRA).
 *  En production = « [PROD_…] », ou « ⚠️ » SANS étiquette d'environnement hors prod : dans cet agenda
 *  ⚠️ signale une opération importante, pas la prod (« ⚠️[ERPC_RECETTE] Exercice de PRA »). */
const OPS_PROD_TAG = /\[\s*prod/i;
const OPS_NON_PROD = /\[[^\]]*(recette|qual|preprod|pre-prod|dev|test|int[eé]g)/i;
export const opsIsProd = t => OPS_PROD_TAG.test(t) || (/⚠️/u.test(t) && !OPS_NON_PROD.test(t));
const operations = (M, team) => calendar(M, team).filter(e => e.scope === 'ops')
    .map(e => ({ day: e.day, title: e.title.replace(/^\s*⚠️\s*/u, ''), time: e.allDay ? '' : e.start.slice(11, 16), prod: opsIsProd(e.title), cal: e.cal }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));

/** Sources d'agenda de l'équipe (ou du train), par portée : { team: ['ERPC - Gabbiano'], group: [...], … }. */
export function calendarSources(team) {
    const out = {};
    for (const c of store.get('calendars') || []) {
        const teams = String(c.team || '').split(',').map(x => x.trim()).filter(Boolean);
        const scope = team !== '*' ? calScope(c.team, c.name, team)
            : !teams.length ? calScope(c.team, c.name, '') : teams.length > 1 ? 'group' : 'team';
        if (scope) (out[scope] ||= []).push(c.name);
    }
    return Object.keys(CAL_SCOPES).filter(k => out[k]).map(k => ({ key: k, ...CAL_SCOPES[k], cals: out[k].sort() }));
}
export const ALL_SOURCES = () => new Set(Object.keys(CAL_SCOPES));

/** Début de la couverture ICS : avant, une ligne vide n'est pas « aucune MEP » — dit, pas caché. */
const icsFrom = () => (store.get('calendarEvents') || []).map(e => localDay(e.start)).filter(Boolean).sort()[0] || null;

/** Faits saisis (table `event`) : `teams` vide = tout le train. */
function facts(team) {
    return (store.get('events') || []).filter(e => e.startDate)
        .filter(e => team === '*' || !(e.teams || []).length || e.teams.some(t => t === team || teamNameMatches(t, team)))
        .map(e => ({
            id: e.id, type: FACT_TYPES[e.type] ? e.type : 'other', title: e.title || '', note: e.description || '',
            start: localDay(e.startDate), end: localDay(e.endDate) || localDay(e.startDate), teams: e.teams || [],
            author: e.author || '', createdAt: localDay(e.createdAt || ''),
        }));
}

// ── API du module ──────────────────────────────────────────────────────────────
export const timelineWindow = () => model().window;
export const timelineToday = () => model().today;

/** Présélections de période : PI courant, PI précédent, Été, 6 mois, Tout. */
export function presets() {
    const M = model(), t = M.today, cur = piOf(M, t), prev = cur && M.pis[M.pis.indexOf(cur) - 1];
    const y = t.slice(5) >= '07-01' ? t.slice(0, 4) : String(+t.slice(0, 4) - 1);
    return [
        cur && { key: 'pi', label: `PI ${cur.n}`, A: cur.start, B: cur.end },
        prev && { key: 'piprev', label: `PI ${prev.n}`, A: prev.start, B: prev.end },
        { key: 'ete', label: 'Été', A: mondayOf(`${y}-07-01`), B: `${y}-08-31` },
        { key: '6m', label: '6 mois', A: addDays(t, -182), B: t },
        { key: 'tout', label: 'Tout', A: M.window[0], B: M.window[1] },
    ].filter(Boolean);
}

/** Tout ce qui tombe dans [A, B] pour une équipe (ou '*' = train), par catégorie. */
/** `src` = portées d'agenda retenues (filtre « Sources d'agenda ») ; toutes par défaut. */
export function collect(team, A, B, src = ALL_SOURCES()) {
    const M = model(), pres = presence(M, team);
    return {
        pis: M.pis.filter(p => p.end >= A && p.start <= B),
        sprints: team === '*' ? [] : (M.sprints[team] || []).filter(s => s.end >= A && s.start <= B),
        presence: pres.filter(s => s.week <= B && addDays(s.week, 4) >= A),
        low: lowPeriods(pres).filter(p => p.end >= A && p.start <= B),
        incidents: incidents(M, team).filter(x => x.week <= B && addDays(x.week, 6) >= A),
        releases: releases(M, team, src).filter(x => inRange(x.day, A, B)),
        milestones: src.has('train') ? milestones(M).filter(x => inRange(x.day, A, B)) : [],
        operations: src.has('ops') ? operations(M, team).filter(x => inRange(x.day, A, B)) : [],
        moves: turnover(M, team).filter(x => inRange(x.day, A, B)),
        ones: src.has('team') ? oneOnOnes(M, team).filter(x => inRange(x.day, A, B)) : [],
        onesAll: oneOnOnes(M, team),                    // pour reconnaître le manager hors période
        facts: facts(team).filter(f => f.end >= A && f.start <= B),
        holidays: pres.flatMap(s => s.holidays || []).filter(h => inRange(h.day, A, B)),
        support: supportLoad(M, team).filter(w => w.week <= B && addDays(w.week, 6) >= A),
        icsFrom: icsFrom(),
    };
}

/** Couloirs dont la portée se choisit À PART (clic sur leur libellé) : leurs champs dans `collect`.
 *  Ex. une équipe OPS garde sa frise d'équipe mais regarde la Production de tout le train.
 *  Pas « operations » : l'agenda « ERPC - Opérations » est commun, identique pour équipe et train. */
export const LANE_TRAIN_FIELDS = {
    production: ['incidents'], livraison: ['releases'], presence: ['presence', 'low', 'holidays'],
    equipe: ['moves'], oneonone: ['ones', 'onesAll'], charge: ['support'],
};

/** Données de la vue : portée générale (`st.scope`) + couloirs basculés sur le train (`st.laneTrain`). */
export function collectView(st) {
    const team = st.scope === 'train' ? '*' : st.team;
    const c = collect(team, st.A, st.B, st.sources);
    const lanes = st.scope === 'train' ? [] : [...(st.laneTrain || [])].filter(k => LANE_TRAIN_FIELDS[k]);
    if (lanes.length) {
        const t = collect('*', st.A, st.B, st.sources);
        lanes.forEach(k => LANE_TRAIN_FIELDS[k].forEach(f => { c[f] = t[f]; }));
        c.trainLanes = new Set(lanes);
    }
    return c;
}

/** MEP suivie d'un incident de production dans les 48 h (J, J+1, J+2) : signal de qualité des livraisons.
 *  { byRelease: Map(jour de MEP → incidents), byIncident: Map(id d'incident → jours de MEP) }.
 *  Vue Équipe seulement (en vue Train, MEP et incidents de toutes les équipes se croiseraient au hasard). */
export function mepFollowUps(c, scope) {
    const byRelease = new Map(), byIncident = new Map();
    if (scope === 'train') return { byRelease, byIncident };
    const incs = c.incidents.flatMap(x => x.items);
    for (const r of c.releases) {
        const hit = incs.filter(i => i.day >= r.day && i.day <= addDays(r.day, 2));
        if (!hit.length) continue;
        byRelease.set(r.day, hit);
        hit.forEach(i => (byIncident.get(i.id) || byIncident.set(i.id, []).get(i.id)).push(r.day));
    }
    return { byRelease, byIncident };
}

/** Jours où une opération EN PRODUCTION tombe (Map jour → titres) — pour signaler une MEP ou un
 *  incident le même jour (piste : la migration PostgreSQL du 23/09 et les MEP GDEM du même jour). */
export function prodOpsByDay(c) {
    const m = new Map();
    c.operations.filter(o => o.prod).forEach(o => (m.get(o.day) || m.set(o.day, []).get(o.day)).push(o.title));
    return m;
}

/** Série complète (mini-carte) : présence et incidents sur toute la fenêtre. */
export function overview(team) {
    const M = model();
    return { presence: presence(M, team), incidents: incidents(M, team).flatMap(x => x.items) };
}

/** Collaborateurs vus en 1v1. Le manager n'est PAS toujours à la même place : « [1v1] Mohamed/Omar »
 *  (Fuego, manager en 1er) mais « O3 - David/Tanisha » (Gabbiano, manager en 2nd). Manager = nom
 *  vu avec au moins 2 partenaires différents SUR TOUT L'HISTORIQUE (`all`) — sur une période courte,
 *  un seul « O3 - David/Tanisha » comptait 2 collaborateurs ; on compte les autres, sur `ones`. */
function oneManagers(all) {
    const partners = new Map();
    for (const o of all) {
        const names = o.pair.split('/').map(x => norm(x)).filter(Boolean);
        if (names.length !== 2) continue;
        names.forEach((n, i) => (partners.get(n) || partners.set(n, new Set()).get(n)).add(names[1 - i]));
    }
    return new Set([...partners].filter(([, p]) => p.size >= 2).map(([n]) => n));
}
function onePeople(ones, all = ones) {
    const managers = oneManagers(all);
    const seen = new Set(ones.flatMap(o => o.pair.split('/').map(x => norm(x)).filter(Boolean)));
    return [...seen].filter(n => !managers.has(n)).length;
}

/**
 * Prénom d'un 1v1 (l'agenda n'écrit que « Mohamed/Omar ») → membre { name, team } quand il n'en
 * désigne qu'un : d'abord dans l'équipe affichée, sinon dans tout le train. Ambigu ou inconnu → null
 * (la personne reste affichée, sans lien). `store.members` = recherche seulement, comme l'autocomplete.
 */
export function resolveOnePerson(token, team = '*') {
    const t = norm(token);
    if (!t) return null;
    const firstOf = n => norm(String(n).split(',')[1] ?? n);
    const hits = (store.get('members') || []).filter(m => {
        const f = firstOf(m.name);
        return f === t || f.split(/[\s-]+/)[0] === t || samePerson(m.name, token);
    });
    const uniq = list => [...new Map(list.map(m => [norm(m.name), m])).values()];
    const inTeam = team && team !== '*' ? uniq(hits.filter(m => teamNameMatches(m.team, team))) : [];
    const all = uniq(hits);
    const pick = inTeam.length === 1 ? inTeam[0] : all.length === 1 ? all[0] : null;
    return pick ? { name: pick.name, team: pick.team || '' } : null;
}

/** Collaborateurs vus en 1v1 sur la période (managers exclus), avec leurs dates : [{ who, member, days }]. */
export function onePeopleList(ones, all = ones, team = '*') {
    const managers = oneManagers(all);
    const by = new Map();
    for (const o of ones) {
        for (const raw of o.pair.split('/').map(x => x.trim()).filter(Boolean)) {
            const k = norm(raw);
            if (managers.has(k)) continue;
            const e = by.get(k) || by.set(k, { who: raw, member: resolveOnePerson(raw, team), days: [] }).get(k);
            e.days.push(o.day);
        }
    }
    return [...by.values()].sort((a, b) => a.who.localeCompare(b.who, 'fr'));
}

/** Résumé chiffré de la période (bandeau de chiffres clés). */
export function summary(c) {
    const n = k => c.moves.filter(m => m.kind === k).length;
    const peak = c.presence.reduce((best, s) => (s.pct ?? -1) > (best?.pct ?? -1) ? s : best, null);
    return {
        arrivals: n('in'), departures: n('out'), movesIn: n('move-in'), movesOut: n('move-out'),
        incidents: c.incidents.reduce((a, x) => a + x.count, 0), releases: c.releases.length,
        peak, facts: c.facts.length, ones: c.ones.length,
        ops: c.operations.length, opsProd: c.operations.filter(o => o.prod).length,
        supTickets: c.support.reduce((a, w) => a + w.tickets.length, 0), supBoarding: c.support.reduce((a, w) => a + w.tickets.filter(t => t.boarding).length, 0), supTasks: c.support.reduce((a, w) => a + w.tasks.length, 0),
        // Tâches qui TRAÎNENT : séries (ticket + semaine de départ) atteignant 3 semaines ou plus sur la période
        stale: new Set(c.support.flatMap(w => w.tasks.filter(k => k.streak >= STALE_WEEKS).map(k => `${k.ticket}|${k.since}`))).size,
        onesPlanned: c.ones.filter(o => o.day > model().today).length,
        onePeople: onePeople(c.ones, c.onesAll),
    };
}
