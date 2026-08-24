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

/**
 * % de contribution d'un rôle à la capacité de livraison, depuis `piInfo.roleCapacity`
 * (réglé dans Paramètres → « Capacité dev — % de travail par rôle », `/#settings/cap-roles`).
 * 100 = dev à plein temps · 0 = ne produit pas de Story Points (PO, Scrum Master…).
 *
 * ⚠️ 100 par défaut pour un rôle NON configuré, et pour un membre dont le rôle est inconnu :
 * mieux vaut surestimer une équipe que l'effacer d'un tableau de bord parce qu'un libellé RH
 * a changé. Les rôles inconnus sont donc à signaler dans l'UI, pas à écarter en silence.
 */
export function roleCapacityPct(role, rolePctMap) {
    if (!role) return 100;
    const v = (rolePctMap || {})[role];
    return (v !== undefined && v !== null) ? v : 100;
}

/**
 * Effectif en ETP d'une équipe : on somme les % de rôle, pas les têtes.
 * Compter les personnes mettrait un Product Owner (0 %) au même rang qu'un dev, gonflerait le
 * dénominateur du taux d'absence et donc la capacité annoncée.
 * @returns {{etp, counted, ignored, unknownRole, members}} `members` porte le détail nominatif
 *   (nom, rôle, %) pour que l'UI puisse montrer QUI est compté — la première question posée
 *   devant un chiffre de capacité.
 */
export function teamEtp(members, rolePctMap) {
    const detail = (members || []).map(m => {
        const role = m.role || '';
        const pct = roleCapacityPct(role, rolePctMap);
        return { name: m.name, role, pct, unknownRole: !role };
    }).sort((a, b) => (b.pct - a.pct) || String(a.name).localeCompare(String(b.name), 'fr'));
    return {
        etp: detail.reduce((s, m) => s + m.pct / 100, 0),
        counted: detail.filter(m => m.pct > 0).length,
        ignored: detail.filter(m => m.pct === 0).length,
        unknownRole: detail.filter(m => m.unknownRole).length,
        members: detail,
    };
}

const _iso = d => String(d || '').slice(0, 10);
const _isWeekend = d => { const w = d.getDay(); return w === 0 || w === 6; };
const _piNumOf = name => {
    const m = String(name || '').match(/(\d+)\.\d+/);
    return m ? parseInt(m[1], 10) : null;
};
/** Une demi-journée compte 0,5 — sinon un vendredi après-midi pèse autant qu'une semaine. */
const _dayWeight = a => (a.type === '1/2' || /half|demi/i.test(a.type || '')) ? 0.5 : 1;

/** Index d'un sprint dans son PI : « Team G - Ité 31.5 » → 5. */
export const sprintIdx = name => {
    const m = String(name || '').match(/\d+\.(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
};

/**
 * Index du sprint de RESPIRATION (IP sprint SAFe) d'un PI : le dernier.
 *
 * Il ne produit pas de valeur planifiable — on n'y engage rien et on ne compte pas sa
 * vélocité, sans quoi la moyenne d'un PI est tirée vers le bas et la capacité du PI suivant
 * gonflée d'un sprint fantôme.
 *
 * `max(sprintsPerPI configuré, plus grand index observé)` et non le seul index observé : sur
 * un PI dont tous les sprints ne sont pas encore créés (2 connus sur 5), le dernier connu
 * n'est PAS la respiration — la prendre pour telle amputerait la base d'un sprint réel.
 *
 * ⚠️ `pi.js::_isIpSprint` applique une règle DIFFÉRENTE (respiration seulement si le PI
 * compte ≥ 6 sprints). Les deux coexistent volontairement : celle-ci suit l'affichage 🍃 de
 * la Sprint Review, qui traite toujours le dernier sprint en respiration.
 */
export function breathIdxOf(piSprints, sprintsPerPI) {
    const idxs = (piSprints || []).map(s => sprintIdx(s.name || s)).filter(Boolean);
    return Math.max(sprintsPerPI || 0, ...(idxs.length ? idxs : [0]));
}

/** Ce sprint est-il la respiration de son PI ? */
export const isBreathSprint = (name, breathIdx) => breathIdx > 0 && sprintIdx(name) === breathIdx;

/**
 * Index de respiration PI par PI, pour une liste de sprints mêlant plusieurs PI.
 * Le calcul se fait sur TOUS les sprints d'un PI (clos ou non) : sinon, un PI dont le dernier
 * sprint n'est pas encore clos verrait l'avant-dernier promu respiration à tort.
 * @returns {Map<number, number>} numéro de PI → index de sa respiration
 */
export function breathIdxByPi(sprints, sprintsPerPI) {
    const byPi = new Map();
    for (const s of (sprints || [])) {
        const pi = _piNumOf(s.name || s);
        if (pi == null) continue;
        byPi.set(pi, Math.max(byPi.get(pi) || 0, sprintIdx(s.name || s)));
    }
    for (const [pi, mx] of byPi) byPi.set(pi, Math.max(mx, sprintsPerPI || 0));
    return byPi;
}

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
export function absenceDaysInWindow(absences, team, start, end, pctOf = null) {
    const s = new Date(_iso(start)), e = new Date(_iso(end));
    if (isNaN(s) || isNaN(e) || s > e) return 0;
    let days = 0;
    for (const a of (absences || [])) {
        if (team && a.team !== team) continue;
        if (!a.startDate || !a.endDate) continue;
        // Absence pondérée par le rôle : celle d'un Product Owner (0 %) ne retire rien à la
        // capacité de livraison, puisqu'il n'y contribue pas. Sans cette pondération, on
        // ferait baisser la vélocité prévue à cause de gens qui ne la produisent pas.
        const w = _dayWeight(a) * (pctOf ? pctOf(a.memberName) / 100 : 1);
        if (!w) continue;
        const aS = new Date(_iso(a.startDate)), aE = new Date(_iso(a.endDate));
        const ovS = aS > s ? aS : s, ovE = aE < e ? aE : e;
        if (ovS > ovE) continue;
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
export function avgVelocityOverLastPis(teamSprints, team, targetPiNum, nbPi = 2, velocityOf = s => s.velocity || 0, sprintsPerPI = 0) {
    const mine = (teamSprints || []).filter(s => s.name && (!team || s.team === team) && _piNumOf(s.name) != null);
    const closed = mine.filter(s =>
        s.state === 'closed' && (!targetPiNum || _piNumOf(s.name) < targetPiNum));
    if (!closed.length) return { avg: 0, sprintsUsed: 0, pis: [], total: 0, breathExcluded: 0 };

    const pis = [...new Set(closed.map(s => _piNumOf(s.name)))].sort((a, b) => b - a).slice(0, nbPi);
    const breathByPi = breathIdxByPi(mine, sprintsPerPI);

    const used = closed.filter(s => pis.includes(_piNumOf(s.name)));
    // Dédoublonnage par label NN.N : un même sprint peut apparaître deux fois (boards multiples).
    const seen = new Map();
    for (const s of used) seen.set(extractSprintLabel(s.name) || s.name, s);
    const all = [...seen.values()];
    // Le sprint de respiration ne se planifie pas : le garder tirerait la moyenne vers le bas.
    const list = all.filter(s => !isBreathSprint(s.name, breathByPi.get(_piNumOf(s.name))));
    const total = list.reduce((sum, s) => sum + (velocityOf(s) || 0), 0);
    return {
        avg: list.length ? total / list.length : 0,
        sprintsUsed: list.length,
        pis: pis.slice().sort((a, b) => a - b),
        total,
        breathExcluded: all.length - list.length,
    };
}

/**
 * Base de capacité d'un sprint : la moyenne, corrigée de la disponibilité sur SA fenêtre.
 * @returns {null|{points, gross, ratio, absencesDays, openDays, teamSize, capped}}
 *   `capped` = la fenêtre dépasse les congés connus, le ratio est donc un plancher.
 */
export function sprintCapacityBase({ avg, sprint, absences, team, etp, pctOf, lastAbsenceDate }) {
    if (!avg || !sprint?.startDate || !sprint?.endDate) return null;
    const openDays = openDaysBetween(sprint.startDate, sprint.endDate);
    if (!openDays) return null;
    const size = etp > 0 ? etp : 1;   // ETP, pas un nombre de têtes (voir teamEtp)
    const absencesDays = absenceDaysInWindow(absences, team, sprint.startDate, sprint.endDate, pctOf);
    const ratio = Math.min(1, absencesDays / (openDays * size));
    return {
        points: Math.round(avg * (1 - ratio)),
        gross: Math.round(avg),
        ratio, absencesDays, openDays, etp: size,
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
export function piCapacityBase({ teamSprints, piSprints, team, absences, targetPiNum, nbPi = 2, velocityOf, lastAbsenceDate, teamMembers, rolePctMap, sprintsPerPI = 0 }) {
    const v = avgVelocityOverLastPis(teamSprints, team, targetPiNum, nbPi, velocityOf, sprintsPerPI);
    if (!v.avg || !piSprints?.length) return null;

    // Le sprint de respiration du PI visé sort du décompte : on n'y engage rien, donc il
    // n'apporte aucune capacité. L'inclure ajoutait une itération entière de capacité fictive.
    const breathIdx = breathIdxOf(piSprints, sprintsPerPI);
    const planSprints = piSprints.filter(sp => !isBreathSprint(sp.name, breathIdx));
    const breathCount = piSprints.length - planSprints.length;

    // Appartenance à l'équipe : la table `absence` (CSV RH) fait foi — cf. CLAUDE.md. Les
    // rôles, eux, ne peuvent venir que de la table `member`, d'où `teamMembers` fourni par
    // l'appelant (deriveMembersFromAbsences fait déjà cette jointure).
    const fallback = [...new Set((absences || [])
        .filter(a => (!team || a.team === team) && a.memberName).map(a => a.memberName))]
        .map(name => ({ name, role: '' }));
    const staff = teamEtp(teamMembers?.length ? teamMembers : fallback, rolePctMap);
    const pctByName = new Map(staff.members.map(m => [m.name, m.pct]));
    // Hors roster → 0 : les congés d'une personne SORTIE de l'équipe traînent dans la table
    // absence bien après son départ. Les compter ferait baisser la capacité d'un PI auquel
    // elle ne participe plus. (En repli sur les absences, tout le monde y est déjà.)
    const pctOf = name => (pctByName.has(name) ? pctByName.get(name) : 0);

    let points = 0, absencesDays = 0, openDays = 0, capped = false, dated = 0;
    for (const sp of planSprints) {
        const b = sprintCapacityBase({ avg: v.avg, sprint: sp, absences, team, etp: staff.etp, pctOf, lastAbsenceDate });
        if (!b) continue;
        dated++;
        points += b.points;
        absencesDays += b.absencesDays;
        openDays += b.openDays;
        capped = capped || b.capped;
    }
    const base = {
        staff, etp: staff.etp,
        sprintsCount: planSprints.length,   // sprints RÉELLEMENT planifiables
        sprintsTotal: piSprints.length,     // ceux du PI, respiration comprise
        breathCount, breathIdx,
        avg: v.avg, pis: v.pis, sprintsUsed: v.sprintsUsed, velocityTotal: v.total,
        breathExcluded: v.breathExcluded,
    };
    // Aucun sprint daté : la fenêtre est inconnue, donc la disponibilité aussi. On rend la
    // capacité brute plutôt que rien — en le signalant par `ratio: 0` et `dated: 0`.
    if (!dated) {
        const gross = Math.round(v.avg * planSprints.length);
        return { ...base, points: gross, gross, ratio: 0, absencesDays: 0, openDays: 0, dated: 0, capped: false };
    }
    return {
        ...base,
        points, gross: Math.round(v.avg * dated),
        ratio: openDays * staff.etp > 0 ? Math.min(1, absencesDays / (openDays * staff.etp)) : 0,
        absencesDays, openDays, dated, capped,
    };
}

/** Dernière date de congés connue — au-delà, tout ratio d'absence est un plancher. */
export const lastKnownAbsenceDate = absences =>
    (absences || []).reduce((max, a) => {
        const e = _iso(a.endDate);
        return e && e > max ? e : max;
    }, '');
