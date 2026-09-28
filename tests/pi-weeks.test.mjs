/**
 * Semaines d'un PI — source unique `utils/pi-weeks.js`, consommée par la grille
 * « Paramètres → Rotation » ET la page Support. Ces deux écrans ont longtemps eu leur propre
 * calcul et divergeaient sur 25 des 27 configurations testées, jusqu'à plusieurs mois d'écart
 * (cf. CHANGELOG 3.141.6) : le test central ci-dessous est leur égalité.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';
import { chargerStore, EQUIPES, TEAM_OBJECTS, MEMBRES, ABSENCES } from './helpers/fixtures.mjs';

const env = installerEnv();
let store, rotation, support, piWeeks, utils;

before(async () => {
    ({ store } = await import('../static/js/state.js'));
    rotation = await import('../static/js/views/settings-rotation.js');
    support  = await import('../static/js/views/support.js');
    piWeeks  = await import('../static/js/utils/pi-weeks.js');
    utils    = await import('../static/js/utils.js');
});

beforeEach(() => { env.storage.clear(); chargerStore(store); });

const MODES = ['friday', 'monday', 'tuesday', 'wednesday', 'thursday'];

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

    test('6 itérations → 12 semaines, sans transition : le PI commence le jour de bascule', () => {
        // PI 30 débute le vendredi 12/06, mode « Ven → Jeu » : la 12ᵉ semaine couvre la fin du PI.
        const semaines = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(semaines.length, 12);
        assert.ok(!semaines.some(w => w.transition));
    });
});

describe('PI suivant (offset +1)', () => {
    beforeEach(() => store.set('piOffset', 1));

    test('5 itérations → 10 semaines + la transition, sans hériter des 6 du PI courant', () => {
        const { selectedPiNum, selectedWeeks } = rotation._rotBuildPiWeeks('Fuego');
        assert.equal(selectedPiNum, 31);
        assert.equal(selectedWeeks.filter(w => !w.transition).length, 10);
        assert.equal(selectedWeeks.length, 11, 'dimanche 06/09 reculé au vendredi 04/09 : le vendredi 13/11 (PIP) reste à couvrir');
        assert.ok(!selectedWeeks.some(w => w.label.startsWith('31.6')), 'pas de 6e itération fantôme');
    });

    test('ancre sur la date JIRA majoritaire, recalée sur le jour de bascule du mode', () => {
        // 2 équipes sur 3 démarrent le dimanche 06/09, la 3e le 07/09 : la majorité l'emporte…
        assert.equal(piWeeks.jiraSprint1Start(store.get('sprintInfo'), 31), '2026-09-06');
        // …puis la semaine recule jusqu'au jour du mode (6 jours max) : vendredi 04/09 par
        // défaut, jeudi 03/09 en « Jeu → Mer ». Une semaine qui démarrait un dimanche n'avait
        // aucun sens pour la grille (pastilles L→V quel que soit le mode).
        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks[0].weekStart, '2026-09-04');
        localStorage.setItem('rot-mode-Fuego', 'thursday');
        assert.equal(rotation._rotBuildPiWeeks('Fuego').selectedWeeks[0].weekStart, '2026-09-03');
    });

    test('chaque semaine commence le jour de bascule du mode — qui est aussi le 1er jour ouvré affiché', () => {
        for (const mode of MODES) {
            localStorage.setItem('rot-mode-Fuego', mode);
            const dow = utils.SUPPORT_WEEK_MODES[mode].dow;
            for (const w of rotation._rotBuildPiWeeks('Fuego').selectedWeeks) {
                assert.equal(new Date(w.weekStart + 'T00:00:00').getDay(), dow, `${mode} ${w.label}`);
                assert.equal(rotation._rotFirstWorkday(w.weekStart), w.weekStart, `${mode} ${w.label}`);
            }
        }
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

describe('le mode de semaine s’applique aussi à un PI épinglé', () => {
    // Bug (3.162.0) : « Semaine : Jeu → Mer » choisi sur un PI autre que le courant laissait
    // les pastilles du lundi au vendredi — la date JIRA (dimanche/lundi) n'était pas recalée
    // sur le jour du mode, contrairement au PI courant.
    beforeEach(() => store.set('piOffset', 1));

    test('« Jeu → Mer » : chaque semaine du PI 31 commence un jeudi, pastilles J V L M M', () => {
        localStorage.setItem('rot-mode-Fuego', 'thursday');
        const semaines = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(semaines.length, 11);
        for (const w of semaines) {
            assert.equal(new Date(w.weekStart + 'T00:00:00').getDay(), 4, w.label);
            assert.equal(utils.supportWorkingDays(w.weekStart).map(d => d.letter).join(''), 'JVLMM', w.label);
        }
    });

    test('buildPiWeeks avec le mode du pool (rotation mutualisée) donne les mêmes clés que la grille', () => {
        localStorage.setItem('rot-mode-Fuego', 'thursday');
        const pool = piWeeks.buildPiWeeks({
            piInfo: store.get('piInfo'), sprintInfo: store.get('sprintInfo'), piOffset: 1, weekMode: 'thursday',
        }).weeks.map(w => `${w.label}:${w.weekStart}`);
        const grille = rotation._rotBuildPiWeeks('Fuego').selectedWeeks.map(w => `${w.label}:${w.weekStart}`);
        assert.deepEqual(pool, grille);
    });
});

describe('les clés weekStart survivent au changement de PI', () => {
    // Invariant : un PI écrit depuis PI+1 doit se relire à l'identique une fois devenu
    // courant — sinon toute sa rotation disparaît de la grille le jour du changement de PI.
    for (const mode of MODES) {
        test(`mode ${mode} : PI 31 vu depuis PI 30, puis devenu courant`, () => {
            localStorage.setItem('rot-mode-Fuego', mode);
            store.set('piOffset', 1);
            const depuisPi30 = rotation._rotBuildPiWeeks('Fuego').selectedWeeks.map(w => `${w.label}:${w.weekStart}`);
            store.set('sprintInfo', { ...store.get('sprintInfo'), name: 'Fuego - Ité 31.1', startDate: '2026-09-06' });
            store.set('piOffset', 0);
            const devenuCourant = rotation._rotBuildPiWeeks('Fuego').selectedWeeks.map(w => `${w.label}:${w.weekStart}`);
            assert.equal(depuisPi30.length, 11);
            assert.deepEqual(devenuCourant, depuisPi30);
        });
    }
});

describe('semaine de transition (fin de PI laissée à découvert par le recul)', () => {
    // Demande utilisateur : en « Jeu → Mer », la dernière semaine du PI 31 s'arrêtait au mercredi
    // 11/11 ; le PIP (jeudi 12, vendredi 13) puis lundi 16 → mercredi 18 n'avaient aucune colonne,
    // trois jours de support invisibles. La semaine d'après doit rester affichée.
    test('« Jeu → Mer » sur PI 31 : une 11ᵉ semaine 31.5.3 du jeudi 12/11 au mercredi 18/11', () => {
        store.set('piOffset', 1);
        localStorage.setItem('rot-mode-Fuego', 'thursday');
        const semaines = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        const derniere = semaines[semaines.length - 1];
        assert.equal(semaines.length, 11);
        assert.equal(derniere.transition, true);
        assert.equal(derniere.label, '31.5.3');
        assert.equal(derniere.weekStart, '2026-11-12');
        assert.equal(derniere.weekEnd, '2026-11-18');
        assert.equal(utils.supportWorkingDays(derniere.weekStart).map(d => d.letter).join(''), 'JVLMM');
        assert.ok(semaines.slice(0, -1).every(w => !w.transition), 'une seule semaine de transition, la dernière');
    });

    test('la transition du PI 30 est la première semaine du PI 31 : même weekStart, même rotation en base', () => {
        localStorage.setItem('rot-mode-Fuego', 'thursday');
        store.set('piOffset', 0);
        const pi30 = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        store.set('piOffset', 1);
        const pi31 = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(pi30.length, 13, 'PI 30 : vendredi 12/06 reculé au jeudi 11/06 → 12 semaines + transition');
        assert.equal(pi30[pi30.length - 1].transition, true);
        assert.equal(pi30[pi30.length - 1].weekStart, pi31[0].weekStart);
        assert.equal(pi31[0].weekStart, '2026-09-03');
    });

    test('makePiWeeks : jamais de transition quand le début du PI tombe le jour de bascule', () => {
        for (const [mode, debut] of [['friday', '2026-06-12'], ['monday', '2026-06-08'], ['thursday', '2026-06-11']]) {
            const weeks = utils.makePiWeeks({ piNum: 30, rawStart: debut, weekMode: mode, sprintCnt: 6, sprintDur: 14 });
            assert.equal(weeks.length, 12, mode);
            assert.equal(weeks[0].weekStart, debut, mode);
        }
    });
});

describe('semaine partagée entre deux PI : les deux libellés', () => {
    beforeEach(() => localStorage.setItem('rot-mode-Fuego', 'thursday'));

    test('la transition du PI 31 sait qu’elle est la 32.1.1', () => {
        store.set('piOffset', 1);
        const s = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(s[s.length - 1].sharedWith, '32.1.1');
        assert.equal(utils.supportWeekHead(s[s.length - 1]).text, '↪ 31.5.3 · 32.1.1');
        assert.equal(s[0].sharedWith, '30.6.3', 'et sa première semaine est la transition du PI 30 (6 sprints)');
        assert.ok(s.slice(1, -1).every(w => !w.sharedWith), 'rien de partagé entre les deux coutures');
    });

    test('la première semaine du PI 32 sait qu’elle est la 31.5.3 — PI sans sprint JIRA, cadence prolongée depuis le PI 31 avec SES 5 sprints', () => {
        store.set('piOffset', 2);
        const s = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.equal(s[0].weekStart, '2026-11-12', 'dimanche 15/11 (= 06/09 + 5 × 14 j) reculé au jeudi — pas 06/09 + 2 × 6 × 14 j');
        assert.equal(s[0].sharedWith, '31.5.3');
        assert.equal(utils.supportWeekHead(s[0]).text, '32.1.1 · 31.5.3');
    });

    test('PI 30 en « Ven → Jeu » : sans transition, rien n’est partagé', () => {
        localStorage.setItem('rot-mode-Fuego', 'friday');
        store.set('piOffset', 0);
        const s = rotation._rotBuildPiWeeks('Fuego').selectedWeeks;
        assert.ok(s.every(w => !w.sharedWith && !w.transition));
    });

    test('l’en-tête de la grille affiche « ↪ 31.5.3 · 32.1.1 »', () => {
        store.set('piOffset', 1);
        localStorage.setItem('rot-collapsed', JSON.stringify({ Fuego: false }));
        const html = rotation._rotPanelsHtml(EQUIPES, TEAM_OBJECTS, [], MEMBRES, ABSENCES);
        assert.ok(html.includes('↪ 31.5.3 · 32.1.1'), 'les deux libellés');
        assert.ok(html.includes('rot-wk-transition'), 'classe de couture');
    });
});
