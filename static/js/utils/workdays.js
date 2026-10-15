/**
 * Durées en JOURS OUVRÉS — SOURCE UNIQUE du Cycle Time, du Lead Time et de l'âge du WIP (3.216.0).
 *
 * Un ticket commencé un vendredi et livré le lundi a coûté 1 jour de travail, pas 3. Les samedis,
 * dimanches et jours fériés (utils/holidays.js) ne comptent donc plus.
 *
 * ⚠️ `t.cycleTimeDays` / `t.leadTimeDays` restent en base en jours CALENDAIRES (sync-parse.js) :
 * ne JAMAIS les afficher ni les agréger directement — passer par `cycleDays(t)` / `leadDays(t)`,
 * qui recalculent depuis les dates déjà stockées (`startedDate`, `resolvedDate`, `createdAt`).
 * Aucune resynchro nécessaire, et les sprints clos archivés en profitent aussi.
 * La valeur stockée garde un rôle : 0 = ticket hors des métriques de flux (dates de cycle
 * absentes, cf. config.js) — 0 reste 0. Sans les dates, la valeur stockée sert de repli.
 */
import { holidayName } from './holidays.js';

const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// JIRA écrit « +0200 », que Date ne lit pas sans le « : ».
const toDate = v => (v ? new Date(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null);
const valid = d => d instanceof Date && Number.isFinite(d.getTime());

/** Jour ouvré : ni samedi, ni dimanche, ni férié (dates LOCALES). */
export function isWorkday(d) {
    const day = d.getDay();
    return day !== 0 && day !== 6 && !holidayName(dayKey(d));
}

/**
 * Jours ouvrés écoulés de `from` à `to` : nombre de jours ouvrés dans ]jour(from), jour(to)].
 * Vendredi → lundi = 1 ; même jour = 0 (les appelants plancher à 1, comme l'ancien calcul).
 * @returns {number|null} null si une date est illisible
 */
export function workdaysBetween(from, to) {
    const a = from instanceof Date ? from : toDate(from);
    const b = to instanceof Date ? to : toDate(to);
    if (!valid(a) || !valid(b)) return null;
    const d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    let n = 0;
    // setDate et non `+ 24 h` : au changement d'heure, minuit + 24 h retombe la veille.
    for (d.setDate(d.getDate() + 1); d <= end; d.setDate(d.getDate() + 1)) if (isWorkday(d)) n++;
    return n;
}

const _memo = new WeakMap();
function _durations(t) {
    let m = _memo.get(t);
    if (m) return m;
    const ct = Number(t.cycleTimeDays) || 0, lt = Number(t.leadTimeDays) || 0;
    const wdCt = ct > 0 ? workdaysBetween(t.startedDate, t.resolvedDate) : null;
    const wdLt = lt > 0 ? workdaysBetween(t.createdAt, t.resolvedDate) : null;
    m = {
        ct: ct > 0 ? (wdCt == null ? ct : Math.max(1, wdCt)) : 0,
        lt: lt > 0 ? (wdLt == null ? lt : Math.max(1, wdLt)) : 0,
    };
    _memo.set(t, m);
    return m;
}

/** Cycle Time en jours ouvrés (mise en cours → livraison) ; 0 = hors métriques de flux. */
export const cycleDays = t => (t ? _durations(t).ct : 0);

/** Lead Time en jours ouvrés (création → livraison) ; 0 = inconnu. */
export const leadDays = t => (t ? _durations(t).lt : 0);

/** Âge d'un ticket en cours, en jours ouvrés depuis `started` (plancher 1, comme le Cycle Time). */
export function wipAgeDays(started, now = new Date()) {
    const n = workdaysBetween(started, now);
    return Math.max(1, n ?? 0);
}

/**
 * Jours ouvrés RESTANTS d'une période, aujourd'hui compris : jours ouvrés de jour(now) à jour(end)
 * inclus — la même règle que l'axe des graphiques (jour de clôture compris, cf. tv-sprint.js).
 * 0 si la période est finie. Remplace `round((fin − maintenant) / 24 h)`, qui comptait le week-end.
 */
export function workdaysLeft(end, now = new Date()) {
    const e = end instanceof Date ? end : toDate(end);
    if (!valid(e) || e < now) return 0;
    const n = workdaysBetween(now, e) ?? 0;
    return n + (isWorkday(now) ? 1 : 0);
}

/**
 * Durée en jours ouvrés FRACTIONNAIRES entre deux instants : le temps écoulé, moins les heures
 * tombées un samedi, un dimanche ou un férié. Sert aux durées par colonne (`stageDurations`,
 * sync-parse.js) : un ticket entré en revue le vendredi 17 h et sorti le lundi 9 h y a passé
 * ~0,7 j, plus 2,7 j. Jour = 24 h (comme avant), seuls les jours chômés sont retirés.
 * @returns {number} jours (≥ 0), 0 si une date est illisible ou si `to` ≤ `from`
 */
export function workdayDurationDays(from, to) {
    const a = from instanceof Date ? from : typeof from === 'number' ? new Date(from) : toDate(from);
    const b = to instanceof Date ? to : typeof to === 'number' ? new Date(to) : toDate(to);
    if (!valid(a) || !valid(b) || b <= a) return 0;
    let ms = 0;
    const d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    while (d < b) {
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);   // minuit suivant (DST-safe)
        if (isWorkday(d)) ms += Math.min(next, b) - Math.max(d, a);
        d.setTime(next.getTime());
    }
    return ms / 86_400_000;
}
