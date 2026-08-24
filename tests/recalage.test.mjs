/**
 * Bandeau « Recaler ce PI sur les Congés » (Paramètres → Rotation).
 *
 * `weekStart` est la clé d'appariement des rotations enregistrées : le recalage doit rester un
 * geste explicite, PI par PI, et réversible.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';
import { chargerStore, EQUIPES, TEAM_OBJECTS, MEMBRES, ABSENCES } from './helpers/fixtures.mjs';

const env = installerEnv();
let store, rotation, cfg;

before(async () => {
    ({ store } = await import('../static/js/state.js'));
    rotation = await import('../static/js/views/settings-rotation.js');
    cfg = await import('../static/js/utils/pi-config.js');
});

beforeEach(() => { env.storage.clear(); chargerStore(store, { piOffset: 1 }); });

const html = () => rotation._rotPanelsHtml(EQUIPES, TEAM_OBJECTS, [], MEMBRES, ABSENCES);

describe('affichage du bandeau', () => {
    test('aucun CSV importé → pas de bandeau', () => {
        assert.ok(!html().includes('rot-conges-banner'));
    });

    test('CSV conforme à la grille → pas de bandeau', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-06', sprintsPerPIFromCsv: 5 });
        assert.ok(!html().includes('rot-conges-banner'));
    });

    test('écart → bandeau d\'alerte avec les deux dates', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-07', sprintsPerPIFromCsv: 5 });
        const h = html();
        assert.ok(h.includes('rot-conges-banner'));
        assert.ok(!h.includes('rot-conges-banner--on'), 'état « écart », pas « calé »');
        assert.ok(h.includes('id="rot-recal-conges"'), 'bouton de recalage proposé');
        assert.ok(h.includes('7 sept.') && h.includes('6 sept.'), 'les deux dates sont annoncées');
    });
});

describe('effet du recalage', () => {
    beforeEach(() => cfg.savePiCfg(31, { startDateFromCsv: '2026-09-07', sprintsPerPIFromCsv: 5 }));

    test('les semaines se décalent d\'un jour, sans en perdre', () => {
        const avant = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(avant[0].weekStart, '2026-09-06');

        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });

        const apres = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(apres[0].weekStart, '2026-09-07');
        assert.equal(apres.length, avant.length);
        for (let i = 0; i < apres.length; i++) {
            const d = (new Date(apres[i].weekStart) - new Date(avant[i].weekStart)) / 86400000;
            assert.equal(d, 1, `${apres[i].label}`);
        }
    });

    test('le bandeau passe en état « calé » et propose le retour', () => {
        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });
        const h = html();
        assert.ok(h.includes('rot-conges-banner--on'));
        assert.ok(h.includes('id="rot-recal-jira"'));
    });

    test('le retour arrière restaure l\'ancrage JIRA et garde les valeurs du CSV', () => {
        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });

        const c2 = cfg.loadPiCfg(31);
        const manual = { ...(c2.manual || {}) };
        delete manual.startDate; delete manual.sprintsPerPI;
        cfg.savePiCfg(31, { manual });

        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks[0].weekStart, '2026-09-06');
        assert.equal(cfg.loadPiCfg(31).startDateFromCsv, '2026-09-07', 'valeur CSV toujours mémorisée');
    });

    test('un PI recalé n\'affecte pas les autres', () => {
        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });
        store.set('piOffset', 0);
        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks[0].weekStart, '2026-06-12', 'PI 30 intact');
    });
});
