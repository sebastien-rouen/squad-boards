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
// PI de 3 sprints de 2 semaines (10 jours ouvrés chacun) dont le 3e est la RESPIRATION :
// rien n'y est planifié, il ne compte ni dans la moyenne ni dans la capacité du PI.
const SPRINTS_PAR_PI = 3;
const SPRINTS = [
    { name: 'Equipe O - Ité 31.1', team: 'O', startDate: '2026-09-07', endDate: '2026-09-18', state: 'future' },
    { name: 'Equipe O - Ité 31.2', team: 'O', startDate: '2026-09-21', endDate: '2026-10-02', state: 'future' },
    { name: 'Equipe O - Ité 31.3', team: 'O', startDate: '2026-10-05', endDate: '2026-10-16', state: 'future' },
];
const clos = (pi, idx, velocity) => ({
    name: `Equipe O - Ité ${pi}.${idx}`, team: 'O', state: 'closed', velocity,
    endDate: `2026-0${idx}-28`,
});
// PI 29 → 10 pts/sprint · PI 30 → 20 pts/sprint · PI 28 (plus ancien, à ignorer) → 100.
// Chaque PI se termine par sa respiration (.3), à la vélocité volontairement basse : si elle
// entrait dans la moyenne, elle la tirerait vers le bas (footgun remonté en revue).
const HISTORIQUE = [
    ...[1, 2].map(i => clos(28, i, 100)), clos(28, 3, 2),
    ...[1, 2].map(i => clos(29, i, 10)),  clos(29, 3, 2),
    ...[1, 2].map(i => clos(30, i, 20)),  clos(30, 3, 2),
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
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 2, undefined, SPRINTS_PAR_PI);
        assert.deepEqual(v.pis, [29, 30]);
        assert.equal(v.sprintsUsed, 4);
        assert.equal(v.total, 60);
        assert.equal(v.avg, 15, '(10+10+20+20)/4');
    });
    test('le PI 28 est ignoré — sinon sa vélocité de 100 écraserait la moyenne', () => {
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 2, undefined, SPRINTS_PAR_PI);
        assert.ok(!v.pis.includes(28));
    });
    test('nbPi=3 élargit bien la fenêtre', () => {
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 3, undefined, SPRINTS_PAR_PI);
        assert.deepEqual(v.pis, [28, 29, 30]);
        assert.equal(v.sprintsUsed, 6);
    });
    test('les sprints du PI cible et les non-clos sont exclus', () => {
        const v = cb.avgVelocityOverLastPis(HISTORIQUE, 'O', 31, 2, undefined, SPRINTS_PAR_PI);
        assert.equal(v.sprintsUsed, 4, 'les 2 sprints `future` du PI 31 ne comptent pas');
    });
    test('sans historique, rend une moyenne nulle plutôt qu\'une erreur', () => {
        const v = cb.avgVelocityOverLastPis([], 'O', 31, 2, undefined, SPRINTS_PAR_PI);
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
        sprintsPerPI: SPRINTS_PAR_PI,
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
        const somme = SPRINTS.filter(sp => !cb.isBreathSprint(sp.name, SPRINTS_PAR_PI)).reduce((s, sp) => {
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
        const sansDates = [{ name: 'Equipe O - Ité 31.1', team: 'O', state: 'future' },
                           { name: 'Equipe O - Ité 31.3', team: 'O', state: 'future' }];
        const b = cb.piCapacityBase({ ...commun, piSprints: sansDates, absences: [] });
        assert.equal(b.dated, 0);
        assert.equal(b.ratio, 0);
        assert.equal(b.points, 15);
    });
});

describe('sprint de respiration (IP) — le dernier du PI ne compte pas', () => {
    // 3 sprints par PI : le 3e est la respiration. Vélocités PI 30 : 20, 20, puis 2 (le
    // sprint IP livre peu, par nature) — l'inclure tirerait la moyenne de 20 à 14.
    const AVEC_IP = [
        { name: 'Equipe O - Ité 29.1', team: 'O', state: 'closed', velocity: 20 },
        { name: 'Equipe O - Ité 29.2', team: 'O', state: 'closed', velocity: 20 },
        { name: 'Equipe O - Ité 29.3', team: 'O', state: 'closed', velocity: 2 },
        { name: 'Equipe O - Ité 30.1', team: 'O', state: 'closed', velocity: 20 },
        { name: 'Equipe O - Ité 30.2', team: 'O', state: 'closed', velocity: 20 },
        { name: 'Equipe O - Ité 30.3', team: 'O', state: 'closed', velocity: 2 },
    ];
    const PI31 = [
        { name: 'Equipe O - Ité 31.1', team: 'O', startDate: '2026-09-07', endDate: '2026-09-18', state: 'future' },
        { name: 'Equipe O - Ité 31.2', team: 'O', startDate: '2026-09-21', endDate: '2026-10-02', state: 'future' },
        { name: 'Equipe O - Ité 31.3', team: 'O', startDate: '2026-10-05', endDate: '2026-10-16', state: 'future' },
    ];

    test('breathIdxOf prend le dernier index du PI', () => {
        assert.equal(cb.breathIdxOf(PI31, 3), 3);
        assert.equal(cb.isBreathSprint('Equipe O - Ité 31.3', 3), true);
        assert.equal(cb.isBreathSprint('Equipe O - Ité 31.2', 3), false);
    });

    test('un PI incomplet ne promeut PAS son dernier sprint connu', () => {
        // 2 sprints créés sur 5 attendus : le 2e n'est pas la respiration.
        const partiel = PI31.slice(0, 2);
        assert.equal(cb.breathIdxOf(partiel, 5), 5);
        assert.equal(cb.isBreathSprint('Equipe O - Ité 31.2', cb.breathIdxOf(partiel, 5)), false);
    });

    test('RÉGRESSION : la respiration est exclue de la moyenne de vélocité', () => {
        const v = cb.avgVelocityOverLastPis(AVEC_IP, 'O', 31, 2, undefined, 3);
        assert.equal(v.sprintsUsed, 4, 'les deux sprints .3 sont écartés');
        assert.equal(v.avg, 20, 'et non 14 si on les comptait');
        assert.equal(v.breathExcluded, 2);
    });

    test('RÉGRESSION : la respiration ne compte pas dans les sprints du PI visé', () => {
        const b = cb.piCapacityBase({
            teamSprints: [...AVEC_IP, ...PI31], piSprints: PI31, team: 'O',
            absences: [], targetPiNum: 31, teamMembers: EQUIPE, rolePctMap: ROLES, sprintsPerPI: 3,
        });
        assert.equal(b.sprintsCount, 2, 'seuls 31.1 et 31.2 sont planifiables');
        assert.equal(b.sprintsTotal, 3);
        assert.equal(b.breathCount, 1);
        assert.equal(b.points, 40, '20 × 2 sprints, et non 60 sur 3');
    });
});

describe('roster du PI — un membre sorti ne pèse plus', () => {
    // Cas réel : une personne retirée de l'équipe pour le PI 31 continuait d'y être comptée,
    // parce que ses congés restent dans la table absence bien après son départ.
    const ANCIEN = { memberName: 'Ancien, Z', team: 'O', startDate: '2026-09-07', endDate: '2026-09-18', type: 'conge' };

    test('RÉGRESSION : ses congés ne réduisent pas la capacité', () => {
        const commun = {
            teamSprints: HISTORIQUE, piSprints: SPRINTS, team: 'O', targetPiNum: 31,
            teamMembers: EQUIPE, rolePctMap: ROLES, sprintsPerPI: SPRINTS_PAR_PI,
        };
        const sans = cb.piCapacityBase({ ...commun, absences: [] });
        const avec = cb.piCapacityBase({ ...commun, absences: [ANCIEN] });
        assert.equal(avec.points, sans.points, 'un ex-membre absent ne change rien');
        assert.equal(avec.absencesDays, 0);
    });

    test('et il ne figure pas dans l’effectif affiché', () => {
        const b = cb.piCapacityBase({
            teamSprints: HISTORIQUE, piSprints: SPRINTS, team: 'O', targetPiNum: 31,
            teamMembers: EQUIPE, rolePctMap: ROLES, sprintsPerPI: SPRINTS_PAR_PI,
            absences: [ANCIEN],
        });
        assert.ok(!b.staff.members.some(m => m.name === 'Ancien, Z'));
        assert.equal(b.staff.members.length, EQUIPE.length);
    });

    test('sans roster fourni, on retombe sur les absences (comportement de repli)', () => {
        const b = cb.piCapacityBase({
            teamSprints: HISTORIQUE, piSprints: SPRINTS, team: 'O', targetPiNum: 31,
            teamMembers: [], rolePctMap: {}, sprintsPerPI: SPRINTS_PAR_PI, absences: [ANCIEN],
        });
        assert.equal(b.staff.members.length, 1, 'le seul nom connu vient des absences');
        assert.ok(b.absencesDays > 0, 'et son absence compte alors bien');
    });
});

describe('breathIdxByPi — une respiration par PI, source unique partagee avec pi.js', () => {
    const SPRINTS_MIXTES = [
        { name: 'Equipe O - Ite 29.1' }, { name: 'Equipe O - Ite 29.2' },
        { name: 'Equipe O - Ite 29.3' }, { name: 'Equipe O - Ite 29.4' },
        { name: 'Equipe O - Ite 29.5' },
        // Ce PI compte SIX sprints la ou la config en annonce cinq
        { name: 'Equipe O - Ite 30.1' }, { name: 'Equipe O - Ite 30.2' },
        { name: 'Equipe O - Ite 30.3' }, { name: 'Equipe O - Ite 30.4' },
        { name: 'Equipe O - Ite 30.5' }, { name: 'Equipe O - Ite 30.6' },
    ];

    test('chaque PI a la sienne, meme si leur nombre de sprints differe', () => {
        const m = cb.breathIdxByPi(SPRINTS_MIXTES, 5);
        assert.equal(m.get(29), 5);
        assert.equal(m.get(30), 6, 'le 6e sprint, pas le 5e annonce par la config');
    });

    test('REGRESSION : un PI plus long que la config exclut son VRAI dernier sprint', () => {
        // Ancienne regle de pi.js : comparaison au sprintsPerPI configure, donc le 30.5
        // etait pris pour la respiration alors que le PI va jusqu'au 30.6.
        const m = cb.breathIdxByPi(SPRINTS_MIXTES, 5);
        assert.equal(cb.isBreathSprint('Equipe O - Ite 30.5', m.get(30)), false);
        assert.equal(cb.isBreathSprint('Equipe O - Ite 30.6', m.get(30)), true);
    });

    test('la config sert de plancher quand tous les sprints ne sont pas crees', () => {
        const m = cb.breathIdxByPi([{ name: 'Equipe O - Ite 31.1' }, { name: 'Equipe O - Ite 31.2' }], 5);
        assert.equal(m.get(31), 5, 'et non 2');
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
