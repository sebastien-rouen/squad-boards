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
