/**
 * Config PI locale (`pi-cfg-<N>`) — priorité des sources et non-écrasement.
 *
 * Règle métier : la saisie « Sprint & PI » fait foi ; l'import Congés COMPLÈTE sans jamais
 * écraser (l'ancrage d'un PI déjà planifié ne doit pas bouger dans le dos de l'utilisateur).
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';
import { chargerStore, SPRINT_INFO, PI_INFO } from './helpers/fixtures.mjs';

const env = installerEnv();
let store, cfg, piWeeks;

before(async () => {
    ({ store } = await import('../static/js/state.js'));
    cfg = await import('../static/js/utils/pi-config.js');
    piWeeks = await import('../static/js/utils/pi-weeks.js');
});

beforeEach(() => { env.storage.clear(); chargerStore(store); });

describe('nombre d\'itérations — ordre de résolution', () => {
    test('sans config, JIRA fait foi', () => {
        assert.equal(piWeeks.detectSprintsPerPI(SPRINT_INFO, 31, 6), 5);
    });

    test('une valeur héritée d\'un ancien import ne s\'impose pas à JIRA', () => {
        // Cas vécu : un import Congés avait écrit sprintsPerPI = 6 pour le PI 31.
        cfg.savePiCfg(31, { sprintsPerPI: 6 });
        assert.equal(piWeeks.detectSprintsPerPI(SPRINT_INFO, 31, 6), 5);
    });

    test('la saisie « Sprint & PI » gagne sur JIRA', () => {
        cfg.savePiCfg(31, { sprintsPerPI: 4 }, { manual: true });
        assert.equal(piWeeks.detectSprintsPerPI(SPRINT_INFO, 31, 6), 4);
    });

    test('un PI hors JIRA utilise la déduction du CSV', () => {
        cfg.savePiCfg(40, { sprintsPerPIFromCsv: 6 });
        assert.equal(piWeeks.detectSprintsPerPI(SPRINT_INFO, 40, 5), 6);
    });

    test('sans rien, on retombe sur le repli', () => {
        assert.equal(piWeeks.detectSprintsPerPI(SPRINT_INFO, 99, 5), 5);
    });
});

describe('savePiCfg fusionne', () => {
    test('un enregistrement partiel ne détruit pas les autres clés', () => {
        cfg.savePiCfg(32, { startDate: '2026-11-16', sprintsPerPI: 5, pipDates: ['2026-11-12'] }, { manual: true });
        cfg.savePiCfg(32, { startDateFromCsv: '2026-11-20', sprintsPerPIFromCsv: 6 });
        const c = cfg.loadPiCfg(32);
        assert.equal(c.startDate, '2026-11-16', 'saisie préservée');
        assert.equal(c.sprintsPerPI, 5);
        assert.deepEqual(c.pipDates, ['2026-11-12'], 'jours PIP non effacés');
        assert.equal(c.startDateFromCsv, '2026-11-20', 'valeur CSV rangée à part');
        assert.equal(c.manual.sprintsPerPI, true, 'flag manuel conservé');
    });

    test('piSprintCount expose l\'origine de la valeur', () => {
        cfg.savePiCfg(32, { sprintsPerPIFromCsv: 6 });
        assert.deepEqual(cfg.piSprintCount(32), { value: 6, source: 'csv' });
        cfg.savePiCfg(32, { sprintsPerPI: 5 }, { manual: true });
        assert.deepEqual(cfg.piSprintCount(32), { value: 5, source: 'manuel' });
    });

    test('listPiCfgNumbers ne renvoie que des PI', () => {
        cfg.savePiCfg(30, { sprintsPerPI: 6 });
        cfg.savePiCfg(31, { sprintsPerPI: 5 });
        localStorage.setItem('sb-piOffset', '1');       // clé voisine, ne doit pas être captée
        assert.deepEqual(cfg.listPiCfgNumbers(), [30, 31]);
    });
});

describe('écart PI ↔ Congés (piCongesDiff)', () => {
    test('détecte un décalage d\'un jour', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-07', sprintsPerPIFromCsv: 5 });
        const d = piWeeks.piCongesDiff(SPRINT_INFO, 31, PI_INFO);
        assert.equal(d.ecart, true);
        assert.equal(d.startUsed, '2026-09-06', 'la grille suit JIRA');
        assert.equal(d.startCsv, '2026-09-07');
        assert.equal(d.source, 'jira');
    });

    test('pas d\'écart quand le CSV confirme JIRA', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-06', sprintsPerPIFromCsv: 5 });
        assert.equal(piWeeks.piCongesDiff(SPRINT_INFO, 31, PI_INFO).ecart, false);
    });

    test('après recalage, le PI est marqué « calé »', () => {
        cfg.savePiCfg(31, { startDateFromCsv: '2026-09-07', sprintsPerPIFromCsv: 5 });
        cfg.savePiCfg(31, { startDate: '2026-09-07', sprintsPerPI: 5 }, { manual: true });
        const d = piWeeks.piCongesDiff(SPRINT_INFO, 31, PI_INFO);
        assert.equal(d.cale, true);
        assert.equal(d.ecart, false);
        assert.equal(d.source, 'saisie');
    });

    test('knownPiNumbers agrège config locale et boards JIRA sans sprint', () => {
        cfg.savePiCfg(40, { startDateFromCsv: '2027-01-04' });
        const pis = piWeeks.knownPiNumbers(SPRINT_INFO);
        assert.ok(pis.includes(32) && pis.includes(33), 'boards PI#32 / PI#33 connus sans sprint daté');
        assert.ok(pis.includes(40), 'PI présent seulement en config locale');
    });
});
