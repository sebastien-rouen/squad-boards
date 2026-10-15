/**
 * Détail « Flux » de la modale ticket (components/ticket_flow.js) + paliers de points (utils/points.js).
 *
 * Pièges verrouillés :
 *   • la PRÉPARATION (« en cours de spécification ») n'est pas du temps actif — sinon un ticket resté
 *     3 semaines en spécification affichait 95 % d'efficacité du flux ;
 *   • la 1ʳᵉ estimation (« — → 5 ») n'est pas une réestimation ;
 *   • un statut qui RECULE (revue → dév) est un aller-retour, un statut qui avance non.
 * Fixture synthétique, dates fixes (jours ouvrés = lun → ven, sans férié sur la période).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let u, tf;
before(async () => {
    u = await import('../static/js/utils.js');
    tf = await import('../static/js/components/ticket_flow.js');
});

const TICKET = {
    id: 'X-1', team: 'Alpha', status: 'done', points: 5,
    createdAt: '2026-03-02T09:00:00Z', startedDate: '2026-03-16T09:00:00Z', resolvedDate: '2026-03-20T16:00:00Z',
    cycleTimeDays: 4, leadTimeDays: 18,
    stageDurations: { 'en cours de spécification': 8, 'prêt': 2, 'en cours de développement': 3, 'en cours de revue': 1 },
    recentChanges: [
        { date: '2026-03-03T10:00:00.000+0100', author: 'A', field: 'Story Points', from: '', to: '3' },
        { date: '2026-03-12T10:00:00.000+0100', author: 'B', field: 'Story Points', from: '3', to: '5' },
        { date: '2026-03-16T10:00:00.000+0100', author: 'C', field: 'status', from: 'Prêt', to: 'En cours de développement' },
        { date: '2026-03-18T10:00:00.000+0100', author: 'C', field: 'status', from: 'En cours de développement', to: 'En cours de revue' },
        { date: '2026-03-19T10:00:00.000+0100', author: 'D', field: 'status', from: 'En cours de revue', to: 'En cours de développement' },
    ],
};

describe('pointsTone', () => {
    for (const [p, k] of [[0, 'none'], [null, 'none'], [1, 'xs'], [2, 'xs'], [3, 's'], [5, 's'], [8, 'm'], [13, 'l'], [21, 'xl'], [40, 'xl']]) {
        test(`${p} pts → ${k}`, () => assert.equal(u.pointsTone(p).key, k));
    }
    test('médiane des points > 0 seulement', () => {
        assert.equal(u.teamPointsMedian([{ points: 0 }, { points: 1 }, { points: 3 }, { points: 8 }]), 3);
        assert.equal(u.teamPointsMedian([{ points: 0 }]), null);
    });
});

describe('ticketFlowModel', () => {
    test('phases : spécification = préparation, prêt = attente', () => {
        assert.equal(tf.flowPhaseOf('en cours de spécification'), 'prep');
        assert.equal(tf.flowPhaseOf('prêt'), 'wait');
        assert.equal(tf.flowPhaseOf('en cours de développement'), 'work');
        assert.equal(tf.flowPhaseOf('en cours de revue'), 'review');
    });
    test('efficacité = dév + revue + test ÷ total (préparation exclue)', () => {
        const m = tf.ticketFlowModel(TICKET, [], new Date('2026-03-25T12:00:00Z'));
        assert.equal(m.total, 14);
        assert.equal(m.efficiency, Math.round(4 / 14 * 100));
        assert.equal(m.longest.label, 'en cours de spécification');
    });
    test('la 1ʳᵉ estimation n\'est pas une réestimation ; un recul de statut est un aller-retour', () => {
        const m = tf.ticketFlowModel(TICKET, [], new Date('2026-03-25T12:00:00Z'));
        assert.equal(m.estimates.length, 1);
        assert.deepEqual([m.estimates[0].from, m.estimates[0].to], ['3', '5']);
        assert.equal(m.backs.length, 1);
    });
    test('au moins une question, 4 au plus', () => {
        const q = tf.flowQuestions(tf.ticketFlowModel(TICKET, [], new Date('2026-03-25T12:00:00Z')));
        assert.ok(q.length >= 1 && q.length <= 4);
    });
});
