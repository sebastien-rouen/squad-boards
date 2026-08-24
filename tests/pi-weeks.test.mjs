/**
 * Semaines d'un PI — source unique `utils/pi-weeks.js`, consommée par la grille
 * « Paramètres → Rotation » ET la page Support. Ces deux écrans ont longtemps eu leur propre
 * calcul et divergeaient sur 25 des 27 configurations testées, jusqu'à plusieurs mois d'écart
 * (cf. CHANGELOG 3.141.6) : le test central ci-dessous est leur égalité.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';
import { chargerStore } from './helpers/fixtures.mjs';

const env = installerEnv();
let store, rotation, support, piWeeks;

before(async () => {
    ({ store } = await import('../static/js/state.js'));
    rotation = await import('../static/js/views/settings-rotation.js');
    support  = await import('../static/js/views/support.js');
    piWeeks  = await import('../static/js/utils/pi-weeks.js');
});

beforeEach(() => { env.storage.clear(); chargerStore(store); });

const MODES = ['friday', 'monday', 'wednesday'];

describe('Rotation et Support affichent les mêmes semaines', () => {
    for (const offset of [0, 1, 2]) {
        for (const mode of MODES) {
            test(`offset ${offset}, mode ${mode}`, () => {
                store.set('piOffset', offset);
                localStorage.setItem('rot-mode-Fuego', mode);
                const rot = rotation._rotBuildPiWeeks('Fuego').selectedWeeks || [];
                const sup = support._supPiWeeks(store.get('piInfo'), store.get('sprintInfo'), offset, mode).weeks || [];
                assert.ok(rot.length > 0, 'la grille doit produire des semaines');
                assert.deepEqual(sup.map(w => `${w.label}:${w.weekStart}`), rot.map(w => `${w.label}:${w.weekStart}`));
            });
        }
    }
});

describe('PI courant (offset 0)', () => {
    test('déduit du sprint JIRA actif, pas de piInfo.number', () => {
        // piInfo.number vaut 0 en base et piInfo.startDate pointe vers un PI antérieur :
        // c'est le nom du sprint (« Fuego - Ité 30.6 ») qui donne le PI courant.
        const { selectedPiNum, selectedWeeks } = rotation._rotBuildPiWeeks('Fuego');
        assert.equal(selectedPiNum, 30);
        assert.equal(selectedWeeks[0].weekStart, '2026-06-12', 'date JIRA du sprint 30.1, pas 2026-04-02');
    });

    test('6 itérations → 12 semaines', () => {
        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks.length, 12);
    });
});

describe('PI suivant (offset +1)', () => {
    beforeEach(() => store.set('piOffset', 1));

    test('5 itérations → 10 semaines, sans hériter des 6 du PI courant', () => {
        const { selectedPiNum, selectedWeeks } = rotation._rotBuildPiWeeks('Fuego');
        assert.equal(selectedPiNum, 31);
        assert.equal(selectedWeeks.length, 10);
        assert.ok(!selectedWeeks.some(w => w.label.startsWith('31.6')), 'pas de 6e itération fantôme');
    });

    test('ancre sur la date JIRA majoritaire, même si elle tombe un dimanche', () => {
        const semaines = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(semaines[0].weekStart, '2026-09-06');
        // 2 équipes sur 3 démarrent le 06/09, la 3e le 07/09 : la majorité l'emporte.
        assert.equal(piWeeks.jiraSprint1Start(store.get('sprintInfo'), 31), '2026-09-06');
    });

    test('les en-têtes affichés tombent tous un jour ouvré', () => {
        const jours = rotation._rotBuildPiWeeks('Fuego').selectedWeeks
            .map(w => new Date(rotation._rotFirstWorkday(w.weekStart) + 'T00:00:00').getDay());
        assert.deepEqual([...new Set(jours)], [1], 'tous lundi');
    });
});

describe('semaines espacées régulièrement', () => {
    test('7 jours entre deux semaines consécutives', () => {
        store.set('piOffset', 1);
        const w = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        for (let i = 1; i < w.length; i++) {
            const ecart = (new Date(w[i].weekStart) - new Date(w[i - 1].weekStart)) / 86400000;
            assert.equal(ecart, 7, `${w[i - 1].label} → ${w[i].label}`);
        }
    });
});
