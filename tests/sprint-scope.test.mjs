/**
 * Périmètre d'un sprint — `utils/sprint-scope.js`, socle de Health, du Sprint Review et du
 * Dashboard depuis 3.141.15.
 *
 * Le piège que ces tests verrouillent : JIRA DÉPLACE les tickets non finis à la clôture d'un
 * sprint, si bien qu'un sprint passé ne « contient » plus que ses réussites (54 % du périmètre
 * engagé manquant, mesuré sur un PI réel). D'où la règle, que le moindre refactor peut
 * réinverser sans bruit :
 *     ENGAGEMENT → belongedToSprint()   ·   RÉALISÉ → isInSprint() EN PLUS de `done`
 *     (3.216.0 : engagedInSprint() = belongedToSprint() moins les retraits d'avant-lancement)
 * Un ticket reporté puis terminé ailleurs est `done` aujourd'hui : le compter dans le réalisé
 * créditerait un sprint de travail fait APRÈS sa clôture. C'est le test central ci-dessous.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let sc, u;
before(async () => {
    sc = await import('../static/js/utils/sprint-scope.js');
    u = await import('../static/js/utils.js');   // engagedInPi (barrel)
});

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

describe('engagedInSprint — un retrait AVANT le lancement n\'est pas un engagement', () => {
    const ch = (date, from, to) => ({ field: 'Sprint', date, from, to });
    // 30.2 démarre le 05/01 à 08:05 Z ; 30.1 est le sprint précédent.
    const starts = new Map([[SP1, '2025-12-22T08:00:00.000Z'], [SP2, '2026-01-05T08:05:16.000Z']]);
    test('planifié en 30.2 puis renvoyé en 30.1 avant son démarrage : hors périmètre', () => {
        // Le cas réel (3 pts de trop, 30 au lieu des 27 du burnup JIRA).
        const x = { id: 'P', sprintName: SP1, status: 'done', points: 3, createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2025-12-10T16:40:10.174+0200', '', SP2),
            ch('2025-12-28T14:33:26.183+0200', SP2, SP1)] };
        assert.equal(sc.belongedToSprint(x, SP2), true, 'il y est bien passé…');
        assert.equal(sc.engagedInSprint(x, SP2, starts), false, '…mais pendant la préparation seulement');
        assert.equal(sc.engagedInSprint(x, SP1, starts), true);
        assert.deepEqual(sc.sprintScope([x], SP2, starts).engaged, []);
    });
    test('reporté à la clôture du précédent : engagé (le `to` cumulatif arrive avant le lancement)', () => {
        // Changement à 09:36 +0200 = 07:36 Z, AVANT le démarrage de 08:05 Z.
        const x = { id: 'R', sprintName: SP2, status: 'todo', createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2025-12-20T16:37:47.806+0200', '', SP1),
            ch('2026-01-05T09:36:16.463+0200', SP1, `${SP1}, ${SP2}`)] };
        assert.equal(sc.engagedInSprint(x, SP2, starts), true);
    });
    test('ajouté en cours de sprint, ou créé dedans : engagé', () => {
        const ajout = { id: 'A', sprintName: SP2, createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2026-01-08T12:01:31.025+0200', '', SP2)] };
        const cree = { id: 'C', sprintName: SP2, createdAt: '2026-01-09T10:00:00Z', recentChanges: [] };
        assert.equal(sc.engagedInSprint(ajout, SP2, starts), true);
        assert.equal(sc.engagedInSprint(cree, SP2, starts), true);
    });
    test('ajouté puis retiré EN COURS de sprint : reste engagé (il y a été après le lancement)', () => {
        const x = { id: 'D', sprintName: '', createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2026-01-06T09:00:00.000+0200', '', SP2),
            ch('2026-01-07T09:00:00.000+0200', SP2, '')] };
        assert.equal(sc.engagedInSprint(x, SP2, starts), true);
    });
    test('sans démarrage connu : belongedToSprint, comme avant', () => {
        const x = { id: 'P', sprintName: SP1, createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2025-12-10T16:40:10.174+0200', '', SP2),
            ch('2025-12-28T14:33:26.183+0200', SP2, SP1)] };
        assert.equal(sc.engagedInSprint(x, SP2), true);
        assert.equal(sc.engagedInSprint(x, SP2, new Map()), true);
        assert.equal(sc.sprintScope([x], SP2).engaged.length, 1);
    });
    test('clé NN.N : chaque sprint de l\'historique est daté par son NOM exact', () => {
        const x = { id: 'P', sprintName: SP1, createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2025-12-10T16:40:10.174+0200', '', SP2),
            ch('2025-12-28T14:33:26.183+0200', SP2, SP1)] };
        assert.equal(sc.engagedInSprint(x, '30.2', starts), false);
    });
    test('sprintStartsOf : sprint global + teamSprints, par nom', () => {
        const m = sc.sprintStartsOf({ name: SP1, startDate: 'a', teamSprints: [{ name: SP2, startDate: 'b' }, { name: 'X', startDate: '' }] });
        assert.equal(m.get(SP1), 'a');
        assert.equal(m.get(SP2), 'b');
        assert.equal(m.has('X'), false);
        assert.equal(sc.sprintStartsOf(null).size, 0);
    });
});

describe('engagedInPi — périmètre du PI aligné sur JIRA (3.224.0)', () => {
    // Rapport JIRA du train, PI 31 : Fuego 76 pts, le site 170 — 85 pts renvoyés au PI suivant pendant la
    // préparation (pseudo-sprint « PI31 », ménage du matin du lancement), et 31 « Clos sans suite » comptés
    // terminés chez Ami. Règle : présent AUJOURD'HUI dans un sprint du PI, reports à la clôture compris.
    const ch = (date, from, to) => ({ field: 'Sprint', date, from, to });
    const starts = new Map([[SP1, '2025-12-22T08:00:00.000Z'], [SP2, '2026-01-05T08:05:16.000Z']]);
    const SP31 = 'Equipe O - Ité 31.1';
    test('planifié dans le PI puis renvoyé au backlog avant le lancement : hors périmètre', () => {
        const x = { id: 'B', sprintName: '', createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2025-12-10T10:00:00.000+0200', '', SP2),
            ch('2025-12-28T10:00:00.000+0200', SP2, '')] };
        assert.equal(u.belongedToPi(x, 30), true);
        assert.equal(u.engagedInPi(x, 30, starts), false);
    });
    test('déplacé d\'un sprint du PI à un autre : reste dans le PI', () => {
        const x = { id: 'M', sprintName: SP2, createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2025-12-10T10:00:00.000+0200', '', SP1),
            ch('2025-12-21T10:00:00.000+0200', SP1, SP2)] };
        assert.equal(sc.engagedInSprint(x, SP1, starts), false);
        assert.equal(u.engagedInPi(x, 30, starts), true);
    });
    test('REPORTÉ à la clôture vers le PI suivant (`to` cumulatif) : reste dans le PI', () => {
        const x = { id: 'R', sprintName: SP31, createdAt: '2025-12-01T00:00:00Z', recentChanges: [
            ch('2025-12-10T10:00:00.000+0100', '', SP2),
            ch('2026-01-16T18:00:00.000+0100', SP2, `${SP2}, ${SP31}`)] };
        assert.equal(u.engagedInPi(x, 30, starts), true);
        assert.equal(u.engagedInPi(x, 31, starts), true);
    });
    test('retiré en cours de sprint vers le PI suivant (le matin du lancement ou après) : hors périmètre', () => {
        const mk = date => ({ id: 'J', sprintName: SP31, createdAt: '2025-11-01T00:00:00Z', recentChanges: [
            ch('2025-12-01T10:00:00.000+0100', '', SP1),
            ch(date, SP1, SP31)] });
        assert.equal(u.engagedInPi(mk('2025-12-22T10:38:00.000Z'), 30, starts), false);
        assert.equal(u.engagedInPi(mk('2025-12-29T15:00:00.000Z'), 30, starts), false);
        assert.equal(sc.engagedInSprint(mk('2025-12-29T15:00:00.000Z'), SP1, starts), true,
            'le sprint, lui, le garde comme engagé puis retiré (Health)');
    });
    test('pseudo-sprint « PI30 » : quitté = hors périmètre, encore porté = dedans', () => {
        const parti = { id: 'P', sprintName: SP31, createdAt: '2025-11-01T00:00:00Z', recentChanges: [
            ch('2025-11-05T10:00:00.000+0100', '', 'PI30'),
            ch('2025-12-01T10:00:00.000+0100', 'PI30', SP31)] };
        const reste = { id: 'Q', sprintName: 'PI30', createdAt: '2025-11-01T00:00:00Z', recentChanges: [
            ch('2025-11-05T10:00:00.000+0100', '', 'PI30')] };
        assert.equal(u.belongedToPi(parti, 30), true);
        assert.equal(u.engagedInPi(parti, 30, starts), false);
        assert.equal(u.engagedInPi(reste, 30, starts), true);
    });
    test('sprint RENOMMÉ après le dernier changement (« PI#31 » → « PI#30.6 ») : le nom actuel fait foi', () => {
        const x = { id: 'N', sprintName: 'PI#30.6', createdAt: '2025-11-01T00:00:00Z', recentChanges: [
            ch('2025-11-05T10:00:00.000+0100', '', 'PI#31')] };
        assert.deepEqual(sc.currentSprintNames(x), ['PI#30.6']);
        assert.equal(u.engagedInPi(x, 31), false);
        assert.equal(u.engagedInPi(x, 30), true);
        const multi = { id: 'K', sprintName: 'Equipe O - Ité 27.5', recentChanges: [
            ch('2025-11-05T10:00:00.000+0100', 'Equipe O - Ité 27.5', `Equipe O - Ité 27.5, ${SP31}`)] };
        assert.equal(u.engagedInPi(multi, 31), true, 'ticket dans deux sprints : le nom actuel est l\'un d\'eux, pas de renommage');
    });
    test('ticket sans historique : son sprint actuel fait foi', () => {
        assert.equal(u.engagedInPi(tk('S', SP1, 'todo'), 30), true);
        assert.equal(u.engagedInPi(tk('S', SP31, 'todo'), 30), false);
    });
    test('ticket abandonné (« Clos sans suite ») hors périmètre du PI', () => {
        const x = { ...tk('C', SP1, 'done'), jiraStatus: 'Clos sans suite' };
        assert.equal(sc.isAbandoned(x), true);
        assert.equal(sc.isAbandoned({ jiraStatus: "Won't Fix" }), true);
        assert.equal(sc.isAbandoned({ jiraStatus: 'En Prod' }), false);
        assert.equal(u.engagedInPi(x, 30, starts), false);
        assert.equal(u.engagedInPi({ ...x, jiraStatus: 'Terminé' }, 30, starts), true);
    });
});
