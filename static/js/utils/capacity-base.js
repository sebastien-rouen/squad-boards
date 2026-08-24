/**
 * Base de capacité d'une équipe pour un PI À VENIR.
 *
 * Deux ingrédients, et un seul endroit où ils sont combinés :
 *   1. la VÉLOCITÉ moyenne par sprint, mesurée sur les sprints clos des 2 derniers PI —
 *      deux PI plutôt qu'un pour lisser un PI accidenté (congés d'été, incident, renfort) ;
 *   2. la DISPONIBILITÉ, déduite des congés saisis sur la fenêtre visée : un sprint amputé
 *      de 20 % de ses jours-personne ne peut pas livrer la moyenne d'un sprint plein.
 *
 * base = vélocité moyenne/sprint × nb de sprints × (1 − ratio d'absence)
 *
 * ⚠️ Ce n'est PAS un engagement : c'est le point de départ chiffré d'une discussion de PI
 * Planning, que l'équipe reste libre d'écraser (la « Charge prévue » de Health est éditable).
 *
 * ⚠️ La fenêtre peut dépasser la dernière date de congés connue — l'import RH ne va pas
 * jusqu'au bout du PI. Le ratio est alors sous-estimé, donc la base surestimée : chaque
 * résultat porte `absencesCoverage` pour pouvoir le dire à l'utilisateur plutôt que de
 * présenter un chiffre trop optimiste sans réserve.
 */

import { extractSprintLabel } from './sprint-scope.js';

const _iso = d => String(d || '').slice(0, 10);
const _isWeekend = d => { const w = d.getDay(); return w === 0 || w === 6; };
const _piNumOf = name => {
    const m = String(name || '').match(/(\d+)\.\d+/);
    return m ? parseInt(m[1], 10) : null;
};
/** Une demi-journée compte 0,5 — sinon un vendredi après-midi pèse autant qu'une semaine. */
const _dayWeight = a => (a.type === '1/2' || /half|demi/i.test(a.type || '')) ? 0.5 : 1;

/** Jours ouvrés (lun-ven) dans [start, end], bornes incluses. */
export function openDaysBetween(start, end) {
    const s = new Date(_iso(start)), e = new Date(_iso(end));
    if (isNaN(s) || isNaN(e) || s > e) return 0;
    let n = 0;
    for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (!_isWeekend(d)) n++;
    return n;
}

/**
 * Jours-personne d'absence d'une équipe recouvrant [start, end].
 * On compte le RECOUVREMENT, pas l'absence entière : trois semaines de congés à cheval sur
 * deux sprints ne pèsent sur chacun que par la part qui le concerne.
 */
export function absenceDaysInWindow(absences, team, start, end) {
    const s = new Date(_iso(start)), e = new Date(_iso(end));
    if (isNaN(s) || isNaN(e) || s > e) return 0;
    let days = 0;
    for (const a of (absences || [])) {
        if (team && a.team !== team) continue;
        if (!a.startDate || !a.endDate) continue;
        const aS = new Date(_iso(a.startDate)), aE = new Date(_iso(a.endDate));
        const ovS = aS > s ? aS : s, ovE = aE < e ? aE : e;
        if (ovS > ovE) continue;
        const w = _dayWeight(a);
        for (const d = new Date(ovS); d <= ovE; d.setDate(d.getDate() + 1)) if (!_isWeekend(d)) days += w;
    }
    return days;
}

/**
 * Vélocité moyenne par sprint sur les sprints CLOS des `nbPi` derniers PI précédant
 * `targetPiNum`. Les PI sont pris dans l'ordre décroissant parmi ceux qui ont réellement des
 * sprints clos : un PI sans mesure est sauté plutôt que compté zéro, ce qui écraserait la
 * moyenne. `velocityOf(sprint)` permet à l'appelant d'imposer sa propre mesure du réalisé.
 */
export function avgVelocityOverLastPis(teamSprints, team, targetPiNum, nbPi = 2, velocityOf = s => s.velocity || 0) {
    const closed = (teamSprints || []).filter(s =>
        s.state === 'closed' && s.name && (!team || s.team === team) && _piNumOf(s.name) != null
        && (!targetPiNum || _piNumOf(s.name) < targetPiNum));
    if (!closed.length) return { avg: 0, sprintsUsed: 0, pis: [], total: 0 };

    const pis = [...new Set(closed.map(s => _piNumOf(s.name)))].sort((a, b) => b - a).slice(0, nbPi);
    const used = closed.filter(s => pis.includes(_piNumOf(s.name)));
    // Dédoublonnage par label NN.N : un même sprint peut apparaître deux fois (boards multiples).
    const seen = new Map();
    for (const s of used) seen.set(extractSprintLabel(s.name) || s.name, s);
    const list = [...seen.values()];
    const total = list.reduce((sum, s) => sum + (velocityOf(s) || 0), 0);
    return {
        avg: list.length ? total / list.length : 0,
        sprintsUsed: list.length,
        pis: pis.slice().sort((a, b) => a - b),
        total,
    };
}

/**
 * Base de capacité d'un sprint : la moyenne, corrigée de la disponibilité sur SA fenêtre.
 * @returns {null|{points, gross, ratio, absencesDays, openDays, teamSize, capped}}
 *   `capped` = la fenêtre dépasse les congés connus, le ratio est donc un plancher.
 */
export function sprintCapacityBase({ avg, sprint, absences, team, teamSize, lastAbsenceDate }) {
    if (!avg || !sprint?.startDate || !sprint?.endDate) return null;
    const openDays = openDaysBetween(sprint.startDate, sprint.endDate);
    if (!openDays) return null;
    const size = Math.max(1, teamSize || 1);
    const absencesDays = absenceDaysInWindow(absences, team, sprint.startDate, sprint.endDate);
    const ratio = Math.min(1, absencesDays / (openDays * size));
    return {
        points: Math.round(avg * (1 - ratio)),
        gross: Math.round(avg),
        ratio, absencesDays, openDays, teamSize: size,
        capped: !!lastAbsenceDate && _iso(sprint.endDate) > _iso(lastAbsenceDate),
    };
}

/**
 * Base de capacité d'un PI entier : même règle, appliquée sprint par sprint puis sommée.
 * Sommer les sprints plutôt qu'appliquer un ratio global n'est pas cosmétique — c'est ce qui
 * garantit que le total du PI égale la somme des lignes affichées dans la modale, et un
 * total qui contredit son propre détail ne sert à rien.
 * @returns {null|{points, gross, ratio, sprintsCount, avg, pis, sprintsUsed, capped, ...}}
 */
export function piCapacityBase({ teamSprints, piSprints, team, absences, targetPiNum, nbPi = 2, velocityOf, lastAbsenceDate }) {
    const v = avgVelocityOverLastPis(teamSprints, team, targetPiNum, nbPi, velocityOf);
    if (!v.avg || !piSprints?.length) return null;

    const members = new Set();
    for (const a of (absences || [])) if ((!team || a.team === team) && a.memberName) members.add(a.memberName);
    const teamSize = Math.max(1, members.size);

    let points = 0, absencesDays = 0, openDays = 0, capped = false, dated = 0;
    for (const sp of piSprints) {
        const b = sprintCapacityBase({ avg: v.avg, sprint: sp, absences, team, teamSize, lastAbsenceDate });
        if (!b) continue;
        dated++;
        points += b.points;
        absencesDays += b.absencesDays;
        openDays += b.openDays;
        capped = capped || b.capped;
    }
    // Aucun sprint daté : la fenêtre est inconnue, donc la disponibilité aussi. On rend la
    // capacité brute plutôt que rien — en le signalant par `ratio: 0` et `dated: 0`.
    if (!dated) {
        return {
            points: Math.round(v.avg * piSprints.length), gross: Math.round(v.avg * piSprints.length),
            ratio: 0, absencesDays: 0, openDays: 0, teamSize, dated: 0, capped: false,
            sprintsCount: piSprints.length, avg: v.avg, pis: v.pis, sprintsUsed: v.sprintsUsed,
        };
    }
    const gross = Math.round(v.avg * dated);
    return {
        points, gross,
        ratio: openDays * teamSize > 0 ? Math.min(1, absencesDays / (openDays * teamSize)) : 0,
        absencesDays, openDays, teamSize, dated, capped,
        sprintsCount: piSprints.length,
        avg: v.avg, pis: v.pis, sprintsUsed: v.sprintsUsed,
    };
}

/** Dernière date de congés connue — au-delà, tout ratio d'absence est un plancher. */
export const lastKnownAbsenceDate = absences =>
    (absences || []).reduce((max, a) => {
        const e = _iso(a.endDate);
        return e && e > max ? e : max;
    }, '');
