/**
 * Objectifs PI (#pi/{équipe}/objectives) — rendu et enregistrement.
 *
 * Régression couverte : le bouton « Enregistrer » était câblé en FIN de rendu ; toute erreur en
 * amont laissait un bouton visible mais inerte — clic sans requête ni toast, donc « j'enregistre,
 * j'actualise, rien n'a changé ». Il est désormais posé par délégation avant le rendu.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv, fauxElement } from './helpers/env.mjs';
import { chargerStore, PI_INFO, EQUIPES, TEAM_OBJECTS } from './helpers/fixtures.mjs';

const env = installerEnv();
let store, pi;

before(async () => {
    ({ store } = await import('../static/js/state.js'));
    pi = await import('../static/js/views/pi.js');
});

beforeEach(() => { env.storage.clear(); env.requetes.length = 0; chargerStore(store); });

/** Conteneur d'onglet avec un vrai bus de clics, pour exercer la délégation. */
function conteneurOnglet() {
    const el = fauxElement('pi-tab-content');
    const listeners = [];
    el.addEventListener = (t, fn) => { if (t === 'click') listeners.push(fn); };
    el.cliquerSur = (id) => listeners.forEach(fn => fn({ target: { closest: sel => (sel === `#${id}` ? {} : null) } }));
    return el;
}

const args = (extra = {}) => ({
    objectives: PI_INFO.objectives, piInfo: structuredClone(PI_INFO),
    teams: EQUIPES, teamObjects: TEAM_OBJECTS,
    isCurrentPi: true, piNum: 30, featureList: [], tickets: [], ...extra,
});

describe('rendu', () => {
    test('PI courant filtré sur une équipe : lignes éditables et bouton présent', () => {
        store.set('team', 'Fuego');
        const el = conteneurOnglet();
        pi.renderObjectives(el, args());
        assert.equal((el.innerHTML.match(/class="pi-obj-row/g) || []).length, 2, 'les 2 objectifs Fuego');
        assert.ok(el.innerHTML.includes('id="pi-obj-save"'));
    });

    test('toutes équipes : tous les objectifs, groupés', () => {
        store.set('team', 'all');
        const el = conteneurOnglet();
        pi.renderObjectives(el, args());
        assert.equal((el.innerHTML.match(/class="pi-obj-row/g) || []).length, 3);
    });

    test('PI non courant : lecture seule, pas de bouton', () => {
        store.set('team', 'Fuego');
        const el = conteneurOnglet();
        pi.renderObjectives(el, args({ isCurrentPi: false, piNum: 31, objectives: [] }));
        assert.ok(!el.innerHTML.includes('id="pi-obj-save"'));
        assert.ok(el.innerHTML.includes('pi-obj-unlock-btn'), 'déverrouillage proposé');
    });

    test('aucune exception quel que soit le scénario', () => {
        for (const cas of [{ isCurrentPi: true, piNum: 30 }, { isCurrentPi: false, piNum: 31 }]) {
            for (const equipe of ['Fuego', 'all', 'O']) {
                store.set('team', equipe);
                assert.doesNotThrow(() => pi.renderObjectives(conteneurOnglet(), args(cas)));
            }
        }
    });
});

describe('enregistrement', () => {
    test('un clic envoie un PUT /api/pi avec les objectifs et le snapshot', async () => {
        store.set('team', 'Fuego');
        const el = conteneurOnglet();
        pi.renderObjectives(el, args());
        el.cliquerSur('pi-obj-save');
        await new Promise(r => setImmediate(r));

        assert.equal(env.requetes.length, 1, 'exactement une requête');
        assert.equal(env.requetes[0].method, 'PUT');
        assert.equal(env.requetes[0].url, '/api/pi');
        assert.ok(Array.isArray(env.requetes[0].body.objectives));
        assert.ok(Array.isArray(env.requetes[0].body.piObjectives['30']), 'snapshot sous la clé du PI lu');
    });

    test('après plusieurs re-render, un clic reste un seul envoi', async () => {
        store.set('team', 'Fuego');
        const el = conteneurOnglet();
        pi.renderObjectives(el, args());
        pi.renderObjectives(el, args());
        pi.renderObjectives(el, args());
        env.requetes.length = 0;
        el.cliquerSur('pi-obj-save');
        await new Promise(r => setImmediate(r));
        assert.equal(env.requetes.length, 1, 'pas de listener empilé');
    });
});
