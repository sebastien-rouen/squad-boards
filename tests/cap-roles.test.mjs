/**
 * Section « Capacité dev — % de travail par rôle » (`/#settings/cap-roles`), câblage.
 *
 * Bug corrigé en 3.141.17 : le clic sur « N membres » produisait autant de copies — et de
 * toasts « Copie impossible » — qu'il y a de rôles configurés (23 en production). Deux causes
 * cumulées, que ces tests verrouillent séparément :
 *
 *  1. le câblage des compteurs vivait DANS le `forEach` des sliders, si bien que chaque rôle
 *     réattachait un listener à TOUS les compteurs ;
 *  2. la copie appelait `navigator.clipboard.writeText` sans repli : hors contexte sécurisé
 *     (accès en http par IP LAN), `navigator.clipboard` est absent et l'appel lève une
 *     TypeError SYNCHRONE qu'aucun `.catch()` ne rattrape.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

const env = installerEnv();
let rotation;
before(async () => { rotation = await import('../static/js/views/settings-rotation.js'); });

// Nombre de rôles réellement configurés en production : c'est le facteur de multiplication
// du bug, donc la valeur qui rend le test parlant.
const NB_ROLES = 23;

let listeners;

/** Conteneur factice : ne répond qu'aux sélecteurs de la section cap-roles. */
function fauxContainer(nbTips = 1) {
    const faire = (cls, dataset) => ({
        className: cls, dataset, classList: { add() {}, remove() {}, contains: () => false },
        addEventListener: (type, fn) => listeners.push({ cls, dataset, type, fn }),
        querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    });
    const sliders = Array.from({ length: NB_ROLES }, (_, i) => faire('cap-role-slider', { role: `Role ${i}` }));
    const tips = Array.from({ length: nbTips }, (_, i) =>
        faire('cap-role-count--tip', { copy: `Membre ${i} (Equipe O)` }));
    return {
        querySelector: () => null,
        querySelectorAll: (sel) => {
            if (sel.includes('cap-role-slider')) return sliders;
            if (sel.includes('cap-role-count--tip')) return tips;
            return [];
        },
    };
}

const clicsSurTips = () => listeners.filter(l => l.cls === 'cap-role-count--tip' && l.type === 'click');

beforeEach(() => { listeners = []; env.storage.clear(); });

describe('câblage des compteurs « N membres »', () => {
    test('RÉGRESSION : un seul listener par compteur, quel que soit le nombre de rôles', () => {
        rotation._rotWirePanelEvents(fauxContainer(1));
        assert.equal(clicsSurTips().length, 1,
            `avec ${NB_ROLES} rôles, le câblage imbriqué en posait ${NB_ROLES}`);
    });

    test('trois compteurs → trois listeners, pas 3 × le nombre de rôles', () => {
        rotation._rotWirePanelEvents(fauxContainer(3));
        assert.equal(clicsSurTips().length, 3);
    });

    test('les sliders gardent bien leur propre câblage', () => {
        rotation._rotWirePanelEvents(fauxContainer(1));
        const surSliders = listeners.filter(l => l.cls === 'cap-role-slider' && l.type === 'input');
        assert.equal(surSliders.length, NB_ROLES, 'un listener `input` par slider');
    });
});

describe('copie de la liste des membres', () => {
    /** Installe un presse-papier absent (contexte non sécurisé) + un DOM sachant sélectionner. */
    function sansClipboard() {
        const etat = { execCommand: 0, texte: null };
        Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
        globalThis.document.body = { appendChild() {}, removeChild() {} };
        const creerVrai = globalThis.document.createElement;
        globalThis.document.createElement = (...a) => {
            const el = creerVrai(...a);
            el.select = () => {};
            el.remove = () => {};
            return el;
        };
        globalThis.document.execCommand = () => { etat.execCommand++; return true; };
        return etat;
    }

    test('RÉGRESSION : la copie aboutit sans `navigator.clipboard`', () => {
        // Sans repli, l'appel levait une TypeError synchrone → « Copie impossible ».
        const etat = sansClipboard();
        rotation._rotWirePanelEvents(fauxContainer(1));
        const [clic] = clicsSurTips();
        assert.doesNotThrow(() => clic.fn({ stopPropagation() {} }));
        assert.equal(etat.execCommand, 1, 'exactement une copie, via le repli execCommand');
    });

    test('un clic = une seule copie, jamais une par rôle', () => {
        const etat = sansClipboard();
        rotation._rotWirePanelEvents(fauxContainer(1));
        for (const l of clicsSurTips()) l.fn({ stopPropagation() {} });
        assert.equal(etat.execCommand, 1);
    });

    test('chaque compteur copie SON propre texte', () => {
        sansClipboard();
        rotation._rotWirePanelEvents(fauxContainer(3));
        const textes = clicsSurTips().map(l => l.dataset.copy);
        assert.deepEqual(textes, ['Membre 0 (Equipe O)', 'Membre 1 (Equipe O)', 'Membre 2 (Equipe O)']);
    });

    test('un compteur sans texte ne déclenche aucune copie', () => {
        const etat = sansClipboard();
        listeners = [];
        const c = fauxContainer(1);
        c.querySelectorAll('.cap-role-count--tip')[0].dataset.copy = '';
        rotation._rotWirePanelEvents(c);
        clicsSurTips()[0].fn({ stopPropagation() {} });
        assert.equal(etat.execCommand, 0);
    });
});
