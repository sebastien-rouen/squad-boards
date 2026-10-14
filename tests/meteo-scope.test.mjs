/**
 * Météo — domaine 📐 Périmètre (utils/meteo.js : weatherChurn, meteoScopeThresholds ;
 * utils/sprint-scope.js : scopeStability).
 *
 * Pièges verrouillés : l'échelle est INVERSE des scores (un taux de mouvement bas est bon) ;
 * un sprint à venir n'a pas d'engagement et ne compte pas ; un report à la clôture n'est PAS
 * un retrait (sinon un sprint clos afficherait des « retraits » fantômes).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let mt, sc;
before(async () => {
    mt = await import('../static/js/utils/meteo.js');
    sc = await import('../static/js/utils/sprint-scope.js');
});

const fakeStorage = v => ({ getItem: () => v });

describe('weatherChurn — plus bas = mieux', () => {
    test('défauts 10 / 25 / 40', () => {
        assert.equal(mt.weatherChurn(0), 'sun');
        assert.equal(mt.weatherChurn(10), 'sun');
        assert.equal(mt.weatherChurn(11), 'cloud');
        assert.equal(mt.weatherChurn(25), 'cloud');
        assert.equal(mt.weatherChurn(40), 'rain');
        assert.equal(mt.weatherChurn(41), 'storm');
    });
    test('pas de donnée → ⚪', () => {
        assert.equal(mt.weatherChurn(null), 'none');
        assert.equal(mt.weatherChurn(NaN), 'none');
    });
    test('surcharge invalide (non croissante) → défauts', () => {
        assert.deepEqual(mt.meteoScopeThresholds(fakeStorage('{"sun":30,"cloud":20,"rain":40}')), mt.METEO_SCOPE_DEFAULT_THRESHOLDS);
        assert.deepEqual(mt.meteoScopeThresholds(fakeStorage('{"sun":5,"cloud":15,"rain":30}')), { sun: 5, cloud: 15, rain: 30 });
    });
});

describe('churnTrend — plus bas = mieux', () => {
    test('baisse = amélioration (↘), hausse = dégradation (↗)', () => {
        assert.equal(mt.churnTrend(45, 61).arrow, '↘');
        assert.equal(mt.churnTrend(45, 61).better, true);
        assert.equal(mt.churnTrend(29, 11).arrow, '↗');
        assert.equal(mt.churnTrend(29, 11).better, false);
    });
    test('écart < 3 points = stable', () => {
        assert.equal(mt.churnTrend(12, 10).arrow, '→');
        assert.equal(mt.churnTrend(12, 10).better, null);
    });
    test('PI précédent non mesuré → pas de tendance', () => {
        assert.equal(mt.churnTrend(40, null), null);
    });
});

describe('scopeStability', () => {
    const SP1 = 'Equipe O - Ité 30.1', SP2 = 'Equipe O - Ité 30.2', SP3 = 'Equipe O - Ité 30.3';
    const ch = (date, from, to) => ({ field: 'Sprint', date, from, to });
    const tk = (id, sprintName, changes, createdAt = '2026-01-01T00:00:00.000Z') => ({ id, sprintName, createdAt, recentChanges: changes });
    const sprints = [
        { name: SP1, state: 'closed', startDate: '2026-01-05T08:00:00.000Z' },
        { name: SP2, state: 'active', startDate: '2026-01-19T08:00:00.000Z' },
        { name: SP3, state: 'future', startDate: null },
    ];
    const tickets = [
        // Engagé en 30.1, reporté à la clôture en 30.2 : PAS un retrait de 30.1, engagé en 30.2.
        tk('A', SP2, [ch('2026-01-02T09:00:00.000+0100', '', SP1), ch('2026-01-19T08:30:00.000+0100', SP1, `${SP1}, ${SP2}`)]),
        // Engagé en 30.1, retiré en cours de sprint → retrait.
        tk('B', '', [ch('2026-01-02T09:00:00.000+0100', '', SP1), ch('2026-01-08T09:00:00.000+0100', SP1, '')]),
        // Ajouté en cours de 30.2.
        tk('C', SP2, [ch('2026-01-21T09:00:00.000+0100', '', SP2)]),
        // Dans le sprint à venir : ignoré.
        tk('D', SP3, [ch('2026-01-21T09:00:00.000+0100', '', SP3)]),
    ];
    test('compte engagés / ajouts / retraits des seuls sprints démarrés', () => {
        const st = sc.scopeStability(tickets, sprints);
        assert.equal(st.sprints, 2);
        assert.equal(st.plan, 3);      // A, B en 30.1 · A en 30.2
        assert.equal(st.removed, 1);   // B
        assert.equal(st.added, 1);     // C
        assert.equal(st.churnPct, 67); // (1 + 1) / 3
        assert.equal(st.stablePct, 67);
    });
    test('aucun sprint démarré → taux nuls (⚪ côté météo)', () => {
        const st = sc.scopeStability(tickets, [sprints[2]]);
        assert.equal(st.plan, 0);
        assert.equal(st.churnPct, null);
    });
});
