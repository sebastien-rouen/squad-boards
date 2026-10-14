/**
 * Périmètre d'un sprint — `utils/sprint-scope.js`, socle de Health, du Sprint Review et du
 * Dashboard depuis 3.141.15.
 *
 * Le piège que ces tests verrouillent : JIRA DÉPLACE les tickets non finis à la clôture d'un
 * sprint, si bien qu'un sprint passé ne « contient » plus que ses réussites (54 % du périmètre
 * engagé manquant, mesuré sur un PI réel). D'où la règle, que le moindre refactor peut
 * réinverser sans bruit :
 *     ENGAGEMENT → belongedToSprint()   ·   RÉALISÉ → isInSprint() EN PLUS de `done`
 * Un ticket reporté puis terminé ailleurs est `done` aujourd'hui : le compter dans le réalisé
 * créditerait un sprint de travail fait APRÈS sa clôture. C'est le test central ci-dessous.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let sc;
before(async () => { sc = await import('../static/js/utils/sprint-scope.js'); });

/** Ticket dont l'historique du champ Sprint est une liste cumulative, comme JIRA l'écrit. */
const tk = (id, sprintName, status, sprintsTraverses = []) => ({
    id, sprintName, status,
    recentChanges: sprintsTraverses.length
        ? sprintsTraverses.map((_, i) => ({
            field: 'Sprint', date: `2026-0${i + 1}-01`,
            from: sprintsTraverses.slice(0, i).join(', '),
            to:   sprintsTraverses.slice(0, i + 1).join(', '),
        }))
        : [],
});

const SP1 = 'Equipe O - Ité 30.1';
const SP2 = 'Equipe O - Ité 30.2';

describe('extractSprintLabel', () => {
    test('extrait la clé NN.N', () => {
        assert.equal(sc.extractSprintLabel('Equipe O - Ité 30.1'), '30.1');
        assert.equal(sc.extractSprintLabel('GCOM 29.3'), '29.3');
    });
    test('rend une chaîne vide quand il n\'y a rien à extraire', () => {
        assert.equal(sc.extractSprintLabel('Cadrage_PI30'), '');
        assert.equal(sc.extractSprintLabel(null), '');
    });
});

describe('appartenance à un sprint', () => {
    test('un ticket resté est dedans, et y a appartenu', () => {
        const t = tk('A-1', SP1, 'done');
        assert.equal(sc.isInSprint(t, SP1), true);
        assert.equal(sc.belongedToSprint(t, SP1), true);
        assert.equal(sc.carriedOverTo(t, SP1), '');
    });

    test('un ticket REPORTÉ n\'est plus dedans mais y a bien appartenu', () => {
        const t = tk('A-2', SP2, 'todo', [SP1, SP2]);
        assert.equal(sc.isInSprint(t, SP1), false, 'il n\'est plus dans 30.1');
        assert.equal(sc.belongedToSprint(t, SP1), true, 'mais il y était engagé');
        assert.equal(sc.carriedOverTo(t, SP1), SP2, 'et il est parti en 30.2');
    });

    test('un ticket étranger au sprint n\'est ni dedans ni passé par là', () => {
        const t = tk('A-3', SP2, 'done', [SP2]);
        assert.equal(sc.belongedToSprint(t, SP1), false);
    });

    test('matching tolérant : le nom porté par le ticket peut différer de celui du board', () => {
        const t = tk('A-4', 'GCOM 30.1', 'done');
        assert.equal(sc.isInSprint(t, SP1), true, 'même clé 30.1 → même sprint');
    });

    test('spk=null exige le nom EXACT — indispensable sans filtre d\'équipe', () => {
        // Sans ce mode, le « 30.1 » d'une autre équipe serait aspiré dans le périmètre.
        const autreEquipe = tk('B-1', 'Equipe Z - Ité 30.1', 'done');
        assert.equal(sc.belongedToSprint(autreEquipe, SP1), true, 'tolérant par défaut');
        assert.equal(sc.belongedToSprint(autreEquipe, SP1, null), false, 'strict sur demande');
        assert.equal(sc.isInSprint(autreEquipe, SP1, null), false);
    });
});

describe('sprintNamesOf — l\'`allSprints` que rien ne produisait', () => {
    test('rend tous les sprints traversés, pas seulement le courant', () => {
        const noms = sc.sprintNamesOf(tk('A-5', SP2, 'done', [SP1, SP2]));
        assert.deepEqual([...noms].sort(), [SP1, SP2].sort());
    });
    test('prend aussi en compte un vrai champ allSprints, s\'il venait à exister', () => {
        const t = { id: 'A-6', sprintName: SP2, status: 'done', allSprints: [SP1] };
        assert.equal(sc.belongedToSprint(t, SP1), true);
    });
});

describe('sprintScope — engagement vs réalisé', () => {
    const tickets = [
        tk('OK-1', SP1, 'done'),                    // livré dans le sprint
        tk('OK-2', SP1, 'done'),                    // livré dans le sprint
        tk('EN-1', SP1, 'inprog'),                  // resté, pas fini
        tk('RE-1', SP2, 'done',  [SP1, SP2]),       // reporté PUIS terminé ailleurs
        tk('RE-2', SP2, 'todo',  [SP1, SP2]),       // reporté, toujours pas fini
        tk('HS-1', SP2, 'done',  [SP2]),            // jamais passé par 30.1
    ];

    test('l\'engagement inclut les reportés, le réalisé non', () => {
        const s = sc.sprintScope(tickets, SP1);
        assert.deepEqual(s.engaged.map(t => t.id), ['OK-1', 'OK-2', 'EN-1', 'RE-1', 'RE-2']);
        assert.deepEqual(s.done.map(t => t.id), ['OK-1', 'OK-2']);
        assert.deepEqual(s.carried.map(t => t.id), ['RE-1', 'RE-2']);
    });

    test('RÉGRESSION : un reporté `done` ne gonfle JAMAIS la vélocité', () => {
        // RE-1 est `done` aujourd'hui, mais l'a été dans 30.2. Le compter ici créditerait
        // 30.1 de travail fait après sa clôture — la vélocité augmenterait rétroactivement.
        const s = sc.sprintScope(tickets, SP1);
        assert.ok(!s.done.some(t => t.id === 'RE-1'), 'RE-1 doit rester hors du réalisé');
        assert.ok(s.engaged.some(t => t.id === 'RE-1'), 'mais compter dans l\'engagement');
    });

    test('le sprint d\'arrivée reste lisible pour chaque report', () => {
        const s = sc.sprintScope(tickets, SP1);
        assert.deepEqual(s.carried.map(t => sc.carriedOverTo(t, SP1)), [SP2, SP2]);
    });

    test('sans report, engagement et réalisé coïncident sur les tickets finis', () => {
        const s = sc.sprintScope([tk('X-1', SP1, 'done'), tk('X-2', SP1, 'done')], SP1);
        assert.equal(s.engaged.length, 2);
        assert.equal(s.done.length, 2);
        assert.equal(s.carried.length, 0);
    });
});

describe('plannedAtSprintStart — engagement au lancement', () => {
    // Lancement en « Z », changelog en « +0200 » : comme en prod.
    const START = '2026-10-05T08:05:16.000Z';
    const ch = (date, from, to) => ({ field: 'Sprint', date, from, to });
    const t = (id, sprintName, changes, createdAt = '2026-09-01T10:00:00.000Z') =>
        ({ id, sprintName, status: 'todo', createdAt, recentChanges: changes });

    test('reporté à la clôture du précédent, AVANT le lancement (09:36+02 = 07:36 Z) → planifié', () => {
        const x = t('A', SP2, [ch('2026-09-07T16:37:47.806+0200', '', SP1),
            ch('2026-10-05T09:36:16.463+0200', SP1, `${SP1}, ${SP2}`)]);
        assert.equal(sc.plannedAtSprintStart(x, SP2, START), true);
    });
    test('ajouté après le lancement → hors engagement', () => {
        const x = t('B', SP2, [ch('2026-10-08T12:01:31.025+0200', '', SP2)]);
        assert.equal(sc.belongedToSprint(x, SP2), true);
        assert.equal(sc.plannedAtSprintStart(x, SP2, START), false);
    });
    test('retiré du sprint avant le lancement → hors engagement', () => {
        const x = t('C', SP1, [ch('2026-09-07T16:40:10.174+0200', '', SP2),
            ch('2026-09-24T14:33:26.183+0200', SP2, SP1)]);
        assert.equal(sc.plannedAtSprintStart(x, SP2, START), false);
    });
    test('retiré après le lancement → reste engagé (engagement non tenu)', () => {
        const x = t('D', '', [ch('2026-09-07T16:40:10.000+0200', '', SP2),
            ch('2026-10-07T10:00:00.000+0200', SP2, '')]);
        assert.equal(sc.plannedAtSprintStart(x, SP2, START), true);
    });
    test('sans historique : créé avant le lancement → planifié, après → non', () => {
        assert.equal(sc.plannedAtSprintStart(t('E', SP2, []), SP2, START), true);
        assert.equal(sc.plannedAtSprintStart(t('F', SP2, [], '2026-10-06T09:00:00.000Z'), SP2, START), false);
    });
    test('créé APRÈS le lancement directement dans le sprint, puis reporté → hors engagement', () => {
        // Aucun changement « entrée dans le sprint » : le 1er changement est le report à la
        // clôture, dont le `from` contient le sprint — piège de GDEM-4761.
        const x = t('H', SP1, [ch('2026-10-19T09:40:57.054+0200', SP2, `${SP2}, ${SP1}`)],
            '2026-10-08T07:51:03.000Z');
        assert.equal(sc.plannedAtSprintStart(x, SP2, START), false);
    });
    test('sprint sans date de lancement → périmètre courant', () => {
        const x = t('G', SP2, [ch('2026-10-08T12:01:31.025+0200', '', SP2)]);
        assert.equal(sc.plannedAtSprintStart(x, SP2, null), true);
    });
});

describe('inSprintNow — périmètre actuel, ou à la clôture pour un sprint clos', () => {
    const ch = (date, from, to) => ({ field: 'Sprint', date, from, to });
    test('reporté à la clôture : toujours compté (le `to` JIRA garde le sprint clos)', () => {
        const x = { id: 'A', sprintName: SP2, createdAt: '2026-01-01T00:00:00Z', recentChanges: [
            ch('2026-01-05T09:00:00.000+0200', '', SP1),
            ch('2026-01-19T09:40:56.000+0200', SP1, `${SP1}, ${SP2}`)] };
        assert.equal(sc.isInSprint(x, SP1), false);
        assert.equal(sc.inSprintNow(x, SP1), true);
    });
    test('retiré en cours de sprint : plus compté', () => {
        const x = { id: 'B', sprintName: '', createdAt: '2026-01-01T00:00:00Z', recentChanges: [
            ch('2026-01-05T09:00:00.000+0200', '', SP1),
            ch('2026-01-10T09:00:00.000+0200', SP1, '')] };
        assert.equal(sc.inSprintNow(x, SP1), false);
    });
});
