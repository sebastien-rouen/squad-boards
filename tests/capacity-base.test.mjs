/**
 * Base de capacité d'un PI à venir — `utils/capacity-base.js` (3.141.16).
 *
 *     base = vélocité moyenne/sprint (2 derniers PI) × nb de sprints × (1 − taux d'absence)
 *
 * Deux règles s'y jouent, invisibles à la lecture d'un chiffre affiché :
 *  1. l'effectif se compte en **ETP**, pas en têtes — un Product Owner à 0 % gonflerait le
 *     dénominateur du taux d'absence, donc la capacité annoncée ;
 *  2. la base d'un PI est la **somme des bases par sprint**, jamais un ratio global — sinon
 *     le total de la matrice contredit le détail affiché dans la modale.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let cb;
before(async () => { cb = await import('../static/js/utils/capacity-base.js'); });

// Rôles calqués sur une configuration réelle : Tech Lead partiel, PO/SM exclus.
const ROLES = { 'Dev': 100, 'Tech Lead': 70, 'Product Owner': 0, 'Scrum Master': 0 };
const EQUIPE = [
    { name: 'Dupont, A', role: 'Dev' },
    { name: 'Durand, B', role: 'Dev' },
    { name: 'Martin, C', role: 'Tech Lead' },
    { name: 'Petit, D',  role: 'Product Owner' },
];
// 2 sprints de 2 semaines, du lundi au vendredi suivant : 10 jours ouvrés chacun.
const SPRINTS = [
    { name: 'Equipe O - Ité 31.1', team: 'O', startDate: '2026-09-07', endDate: '2026-09-18', state: 'future' },
    { name: 'Equipe O - Ité 31.2', team: 'O', startDate: '2026-09-21', endDate: '2026-10-02', state: 'future' },
];
const clos = (pi, idx, velocity) => ({
    name: `Equipe O - Ité ${pi}.${idx}`, team: 'O', state: 'closed', velocity,
    endDate: `2026-0${idx}-28`,
});
// PI 29 → 10 pts/sprint · PI 30 → 20 pts/sprint · PI 28 (plus ancien, à ignorer) → 100
const HISTORIQUE = [
    ...[1, 2].map(i => clos(28, i, 100)),
    ...[1, 2].map(i => clos(29, i, 10)),
    ...[1, 2].map(i => clos(30, i, 20)),
    ...SPRINTS,
];

describe('roleCapacityPct', () => {
    test('lit le % configuré, 100 par défaut', () => {
        assert.equal(cb.roleCapacityPct('Dev', ROLES), 100);
        assert.equal(cb.roleCapacityPct('Tech Lead', ROLES), 70);
        assert.equal(cb.roleCapacityPct('Product Owner', ROLES), 0);
    });
    test('un rôle inconnu vaut 100 — surestimer vaut mieux qu\'effacer une équipe', () => {
        assert.equal(cb.roleCapacityPct('Ergonome', ROLES), 100);
        assert.equal(cb.roleCapacityPct('', ROLES), 100);
    });
});

describe('teamEtp — on somme des ETP, pas des têtes', () => {
    test('4 personnes dont un Tech Lead à 70 % et un PO à 0 % font 2,7 ETP', () => {
        const s = cb.teamEtp(EQUIPE, ROLES);
        assert.equal(s.etp, 2.7);
        assert.equal(s.members.length, 4);
        assert.equal(s.counted, 3);
        assert.equal(s.ignored, 1);
    });
    test('le détail nominatif est exposé, pour pouvoir montrer QUI est compté', () => {
        const s = cb.teamEtp(EQUIPE, ROLES);
        const po = s.members.find(m => m.role === 'Product Owner');
        assert.equal(po.pct, 0);
        assert.equal(s.members[0].pct, 100, 'trié par % décroissant');
    });
    test('un membre sans rôle est compté à 100 %, mais signalé', () => {
        const s = cb.teamEtp([{ name: 'Sansrole, E', role: '' }], ROLES);
        assert.equal(s.etp, 1);
        assert.equal(s.unknownRole, 1);
    });
});

describe('openDaysBetween', () => {
    test('ne compte que les jours ouvrés, bornes incluses', () => {
        assert.equal(cb.openDaysBetween('2026-09-07', '2026-09-18'), 10);
        assert.equal(cb.openDaysBetween('2026-09-12', '2026-09-13'), 0, 'un week-end seul');
    });
    test('rend 0 sur une plage inversée ou vide', () => {
        assert.equal(cb.openDaysBetween('2026-09-18', '2026-09-07'), 0);
        assert.equal(cb.openDaysBetween(null, null), 0);
    });
});

describe('absenceDaysInWindow', () => {
    const abs = [
        { memberName: 'Dupont, A', team: 'O', startDate: '2026-09-07', endDate: '2026-09-11', type: 'conge' },
        { memberName: 'Petit, D',  team: 'O', startDate: '2026-09-07', endDate: '2026-09-11', type: 'conge' },
    ];
    test('sans pondération, toutes les absences se valent', () => {
        assert.equal(cb.absenceDaysInWindow(abs, 'O', '2026-09-07', '2026-09-18'), 10);
    });
    test('pondérée : l\'absence d\'un rôle à 0 % ne retire rien à la capacité', () => {
        const pctOf = n => (n === 'Petit, D' ? 0 : 100);
        assert.equal(cb.absenceDaysInWindow(abs, 'O', '2026-09-07', '2026-09-18', pctOf), 5);
    });
    test('seul le RECOUVREMENT compte, pas l\'absence entière', () => {
        const long = [{ memberName: 'Dupont, A', team: 'O', startDate: '2026-08-01', endDate: '2026-09-09', type: 'conge' }];
        assert.equal(cb.absenceDaysInWindow(long, 'O', '2026-09-07', '2026-09-18'), 3, 'lun-mar-mer seulement');
    });
    test('une demi-journée pèse 0,5', () => {
        const demi = [{ memberName: 'Dupont, A', team: 'O', startDate: '2026-09-07', endDate: '2026-09-07', type: '1/2' }];
        assert.equal(cb.absenceDaysInWindow(demi, 'O', '2026-09-07', '2026-09-18'), 0.5);
    });
    test('filtre par équipe', () => {
        const autre = [{ memberName: 'X', team: 'Z', startDate: '2026-09-07', endDate: '2026-09-11', type: 'conge' }];
        assert.equal(cb.absenceDaysInWindow(autre, 'O', '2026-09-07', '2026-09-18'), 0);
    });
});

describe('avgVelocityOverLastPis', () => {
    test('ne retient que les 2 derniers PI précédant la cible', () => {
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 2);
        assert.deepEqual(v.pis, [29, 30]);
        assert.equal(v.sprintsUsed, 4);
        assert.equal(v.total, 60);
        assert.equal(v.avg, 15, '(10+10+20+20)/4');
    });
    test('le PI 28 est ignoré — sinon sa vélocité de 100 écraserait la moyenne', () => {
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 2);
        assert.ok(!v.pis.includes(28));
    });
    test('nbPi=3 élargit bien la fenêtre', () => {
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 3);
        assert.deepEqual(v.pis, [28, 29, 30]);
        assert.equal(v.sprintsUsed, 6);
    });
    test('les sprints du PI cible et les non-clos sont exclus', () => {
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 2);
        assert.equal(v.sprintsUsed, 4, 'les 2 sprints `future` du PI 31 ne comptent pas');
    });
    test('sans historique, rend une moyenne nulle plutôt qu\'une erreur', () => {
        const v = cb.avgVelocityOverLastPis([], 'O', 31, 2);
        assert.equal(v.avg, 0);
        assert.equal(v.sprintsUsed, 0);
    });
});

describe('sprintCapacityBase', () => {
    test('sans absence, la base d\'un sprint est la moyenne', () => {
        const b = cb.sprintCapacityBase({ avg: 15, sprint: SPRINTS[0], absences: [], team: 'O', etp: 2.7 });
        assert.equal(b.points, 15);
        assert.equal(b.ratio, 0);
    });
    test('une semaine d\'absence d\'un dev sur 2,7 ETP retire ~19 %', () => {
        const abs = [{ memberName: 'Dupont, A', team: 'O', startDate: '2026-09-07', endDate: '2026-09-11', type: 'conge' }];
        const b = cb.sprintCapacityBase({ avg: 15, sprint: SPRINTS[0], absences: abs, team: 'O', etp: 2.7 });
        assert.equal(b.absencesDays, 5);
        assert.equal(Math.round(b.ratio * 100), 19, '5 / (10 j × 2,7 ETP)');
        assert.equal(b.points, 12);
    });
    test('`capped` signale une fenêtre au-delà des congés connus', () => {
        const b = cb.sprintCapacityBase({ avg: 15, sprint: SPRINTS[1], absences: [], team: 'O', etp: 2.7, lastAbsenceDate: '2026-09-25' });
        assert.equal(b.capped, true, 'le sprint finit le 02/10, après le 25/09');
    });
    test('rend null sans dates ou sans moyenne', () => {
        assert.equal(cb.sprintCapacityBase({ avg: 0, sprint: SPRINTS[0], etp: 2.7 }), null);
        assert.equal(cb.sprintCapacityBase({ avg: 15, sprint: { name: 'x' }, etp: 2.7 }), null);
    });
});

describe('piCapacityBase', () => {
    const commun = {
        teamSprints: HISTORIQUE, piSprints: SPRINTS, team: 'O',
        targetPiNum: 31, teamMembers: EQUIPE, rolePctMap: ROLES,
    };

    test('sans absence : moyenne × nombre de sprints', () => {
        const b = cb.piCapacityBase({ ...commun, absences: [] });
        assert.equal(b.avg, 15);
        assert.equal(b.gross, 30);
        assert.equal(b.points, 30);
        assert.equal(b.etp, 2.7);
    });

    test('RÉGRESSION : le total du PI égale la somme des bases par sprint', () => {
        // Un ratio global appliqué au total donnerait un chiffre différent de la somme des
        // lignes affichées dans la modale — un total qui contredit son détail est inutile.
        const abs = [
            { memberName: 'Dupont, A', team: 'O', startDate: '2026-09-07', endDate: '2026-09-11', type: 'conge' },
            { memberName: 'Martin, C', team: 'O', startDate: '2026-09-21', endDate: '2026-09-25', type: 'conge' },
        ];
        const b = cb.piCapacityBase({ ...commun, absences: abs });
        const somme = SPRINTS.reduce((s, sp) => {
            const one = cb.sprintCapacityBase({
                avg: b.avg, sprint: sp, absences: abs, team: 'O', etp: b.etp,
                pctOf: n => cb.roleCapacityPct(EQUIPE.find(m => m.name === n)?.role, ROLES),
            });
            return s + one.points;
        }, 0);
        assert.equal(b.points, somme);
    });

    test('RÉGRESSION : les congés d\'un rôle à 0 % ne réduisent pas la base', () => {
        const absPo = [{ memberName: 'Petit, D', team: 'O', startDate: '2026-09-07', endDate: '2026-09-18', type: 'conge' }];
        const avec = cb.piCapacityBase({ ...commun, absences: absPo });
        const sans = cb.piCapacityBase({ ...commun, absences: [] });
        assert.equal(avec.points, sans.points, 'un PO absent ne change pas la capacité de livraison');
        assert.equal(avec.absencesDays, 0);
    });

    test('un dev absent, lui, réduit bien la base', () => {
        const absDev = [{ memberName: 'Dupont, A', team: 'O', startDate: '2026-09-07', endDate: '2026-09-18', type: 'conge' }];
        const b = cb.piCapacityBase({ ...commun, absences: absDev });
        assert.ok(b.points < 30, `attendu < 30, obtenu ${b.points}`);
        assert.equal(b.absencesDays, 10);
    });

    test('le détail de l\'effectif accompagne le résultat, pour l\'infobulle', () => {
        const b = cb.piCapacityBase({ ...commun, absences: [] });
        assert.equal(b.staff.members.length, 4);
        assert.equal(b.staff.ignored, 1);
        assert.deepEqual(b.pis, [29, 30]);
        assert.equal(b.sprintsUsed, 4);
        assert.equal(b.velocityTotal, 60);
    });

    test('sans rôles fournis, on retombe sur les membres vus dans les absences', () => {
        const abs = [{ memberName: 'Dupont, A', team: 'O', startDate: '2026-09-07', endDate: '2026-09-11', type: 'conge' }];
        const b = cb.piCapacityBase({ ...commun, teamMembers: [], rolePctMap: {}, absences: abs });
        assert.equal(b.etp, 1, 'une seule personne connue, comptée à 100 %');
    });

    test('rend null sans vélocité mesurable ou sans sprint cible', () => {
        assert.equal(cb.piCapacityBase({ ...commun, teamSprints: [], absences: [] }), null);
        assert.equal(cb.piCapacityBase({ ...commun, piSprints: [], absences: [] }), null);
    });

    test('sprints sans dates : capacité brute rendue, et signalée par dated=0', () => {
        const sansDates = [{ name: 'Equipe O - Ité 31.1', team: 'O', state: 'future' }];
        const b = cb.piCapacityBase({ ...commun, piSprints: sansDates, absences: [] });
        assert.equal(b.dated, 0);
        assert.equal(b.ratio, 0);
        assert.equal(b.points, 15);
    });
});

describe('lastKnownAbsenceDate', () => {
    test('rend la dernière date de fin connue', () => {
        assert.equal(cb.lastKnownAbsenceDate([
            { endDate: '2026-09-11' }, { endDate: '2026-11-13' }, { endDate: '2026-10-02' },
        ]), '2026-11-13');
    });
    test('rend une chaîne vide sans absence', () => {
        assert.equal(cb.lastKnownAbsenceDate([]), '');
    });
});
