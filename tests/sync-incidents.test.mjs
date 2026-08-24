/**
 * Échecs PARTIELS d'un import JIRA — `sync.makeIncidents`.
 *
 * Un import parcourt des dizaines de boards et de sprints, et un appel raté ne doit pas tout
 * interrompre. Mais les `catch` muets choisissaient l'excès inverse : l'import se concluait
 * sur un toast vert alors que l'historique de vélocité était amputé et que des sprints
 * n'avaient aucun ticket. Un jeton expiré produisait un import « réussi » et creux.
 *
 * Ces tests verrouillent le compromis : on continue, mais on compte, et on le dit.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let sync;
before(async () => { sync = await import('../static/js/sync.js'); });

const err = (status, message = 'Unauthorized') => Object.assign(new Error(message), { status });

describe('makeIncidents', () => {
    test('sans incident, le résumé est vide — rien à signaler', () => {
        const inc = sync.makeIncidents();
        assert.equal(inc.total, 0);
        assert.equal(inc.summary(), '');
        assert.equal(inc.hasAuthFailure, false);
    });

    test('regroupe par (statut, opération) et compte', () => {
        const inc = sync.makeIncidents();
        inc.add('sprints clos', err(401));
        inc.add('sprints clos', err(401));
        inc.add('sprints clos', err(401));
        inc.add('rapport de vélocité', err(500, 'Server Error'));
        assert.equal(inc.total, 4);
        assert.equal(inc.list().length, 2, 'deux groupes, pas quatre lignes');
        assert.equal(inc.list()[0].count, 3, 'le plus fréquent en premier');
        assert.equal(inc.list()[0].quoi, 'sprints clos');
    });

    test('une même opération sur deux statuts reste distinguée', () => {
        const inc = sync.makeIncidents();
        inc.add('sprints clos', err(401));
        inc.add('sprints clos', err(503));
        assert.equal(inc.list().length, 2);
    });

    test('RÉGRESSION : un refus d’authentification est nommé, pas noyé', () => {
        const inc = sync.makeIncidents();
        inc.add('sprints actifs', err(401));
        assert.equal(inc.hasAuthFailure, true);
        const s = inc.summary();
        assert.match(s, /1 appel JIRA en échec/);
        assert.match(s, /HTTP 401/);
        assert.match(s, /vérifier le jeton/, 'et le message dit où corriger');
    });

    test('403 compte aussi comme refus d’authentification', () => {
        const inc = sync.makeIncidents();
        inc.add('boards', err(403, 'Forbidden'));
        assert.equal(inc.hasAuthFailure, true);
    });

    test('une panne serveur n’est pas présentée comme un problème de jeton', () => {
        const inc = sync.makeIncidents();
        inc.add('sprints clos', err(503, 'Unavailable'));
        assert.equal(inc.hasAuthFailure, false);
        assert.doesNotMatch(inc.summary(), /jeton/);
    });

    test('le résumé reste court : trois groupes au plus, puis une ellipse', () => {
        const inc = sync.makeIncidents();
        for (const q of ['a', 'b', 'c', 'd', 'e']) inc.add(q, err(500));
        const s = inc.summary();
        assert.match(s, /…/, 'les groupes suivants sont élidés');
        assert.ok(s.length < 320, `résumé trop long pour un toast : ${s.length} caractères`);
    });

    test('une erreur sans statut HTTP est conservée avec son message', () => {
        const inc = sync.makeIncidents();
        inc.add('sprints clos', new Error('NetworkError when attempting to fetch'));
        assert.equal(inc.list()[0].status, 0);
        assert.match(inc.list()[0].message, /NetworkError/);
        assert.match(inc.summary(), /sprints clos/);
    });

    test('le pluriel suit le nombre d’appels, pas le nombre de groupes', () => {
        const inc = sync.makeIncidents();
        inc.add('sprints clos', err(500));
        assert.match(inc.summary(), /^1 appel JIRA/);
        inc.add('sprints clos', err(500));
        assert.match(inc.summary(), /^2 appels JIRA/);
    });
});
