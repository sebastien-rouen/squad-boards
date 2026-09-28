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

    test('un jour d’écart dans la même semaine de bascule → pas de bandeau', () => {
        // JIRA dimanche 06/09, CSV lundi 07/09 : même vendredi 04/09 pour toutes les équipes
        // (mode par défaut) — recaler ne changerait rien à la grille.
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-07', sprintsPerPIFromCsv: 5 });
        assert.ok(!html().includes('rot-conges-banner'));
    });

    test('le même jour d’écart affiche le bandeau dès qu’une équipe est en « Lun → Dim »', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-07', sprintsPerPIFromCsv: 5 });
        localStorage.setItem('rot-mode-Gabbiano', 'monday');
        const h = html();
        assert.ok(h.includes('rot-conges-banner') && h.includes('id="rot-recal-conges"'));
    });

    test('écart d’une semaine → bandeau d’alerte avec les deux dates', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-14', sprintsPerPIFromCsv: 5 });
        const h = html();
        assert.ok(h.includes('rot-conges-banner'));
        assert.ok(!h.includes('rot-conges-banner--on'), 'état « écart », pas « calé »');
        assert.ok(h.includes('id="rot-recal-conges"'), 'bouton de recalage proposé');
        assert.ok(h.includes('14 sept.') && h.includes('6 sept.'), 'les deux dates sont annoncées');
    });
});

describe('effet du recalage', () => {
    beforeEach(() => cfg.savePiCfg(31, { startDateFromCsv: '2026-09-07', sprintsPerPIFromCsv: 5 }));

    test('un recalage dans la même semaine de bascule ne déplace aucune clé', () => {
        // JIRA dit dimanche 06/09, le CSV lundi 07/09 : les deux reculent au vendredi 04/09
        // (mode par défaut) — les rotations déjà enregistrées restent appariées.
        const avant = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(avant[0].weekStart, '2026-09-04');

        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });

        const apres = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.deepEqual(apres.map(w => w.weekStart), avant.map(w => w.weekStart));
    });

    test('un recalage d’une semaine décale toutes les semaines de 7 jours, sans en perdre', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-14', sprintsPerPIFromCsv: 5 });
        const avant = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;

        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });

        const apres = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(apres[0].weekStart, '2026-09-11');
        assert.equal(apres.length, avant.length);
        for (let i = 0; i < apres.length; i++) {
            const d = (new Date(apres[i].weekStart) - new Date(avant[i].weekStart)) / 86400000;
            assert.equal(d, 7, `${apres[i].label}`);
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
        // CSV une semaine après JIRA, pour que le recalage déplace réellement les clés.
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-14', sprintsPerPIFromCsv: 5 });
        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });
        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks[0].weekStart, '2026-09-11', 'recalé');

        const c2 = cfg.loadPiCfg(31);
        const manual = { ...(c2.manual || {}) };
        delete manual.startDate; delete manual.sprintsPerPI;
        cfg.savePiCfg(31, { manual });

        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks[0].weekStart, '2026-09-04', 'ancrage JIRA (dimanche 06/09) reculé au vendredi');
        assert.equal(cfg.loadPiCfg(31).startDateFromCsv, '2026-09-14', 'valeur CSV toujours mémorisée');
    });

    test('un PI recalé n\'affecte pas les autres', () => {
        const c = cfg.loadPiCfg(31);
        cfg.savePiCfg(31, { startDate: c.startDateFromCsv, sprintsPerPI: c.sprintsPerPIFromCsv }, { manual: true });
        store.set('piOffset', 0);
        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks[0].weekStart, '2026-06-12', 'PI 30 intact');
    });
});
