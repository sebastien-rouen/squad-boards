/**
 * Rapport d'échecs partiels dans la carte de synchronisation (topbar).
 *
 * Le détail des incidents ne vivait qu'en `console.warn`, où personne ne va le chercher, et
 * le toast disparaît en quelques secondes. La carte de sync reste donc ouverte quand l'import
 * s'est terminé avec des trous — et c'est l'utilisateur qui la ferme.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

const env = installerEnv();

/** DOM minimal de la carte : les éléments que topbar.js va chercher par id. */
function fauxCarte() {
    const noeuds = new Map();
    const faire = (id) => {
        const el = {
            id, hidden: false, textContent: '', innerHTML: '', dataset: {}, style: {}, title: '',
            enfants: [], className: '',
            classes: new Set(),
            classList: {
                add: c => el.classes.add(c), remove: c => el.classes.delete(c),
                contains: c => el.classes.has(c),
                toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)),
            },
            append: (...n) => el.enfants.push(...n),
            appendChild: n => { el.enfants.push(n); return n; },
            setAttribute() {}, addEventListener(t, fn) { (el.handlers ||= {})[t] = fn; },
            querySelector: () => null, querySelectorAll: () => [],
        };
        return el;
    };
    // Tout id inconnu reçoit aussi un élément : `initTopbar` en touche beaucoup d'autres
    // (fil d'Ariane, sélecteur de PI, menus) et un `null` y ferait échouer le câblage avant
    // même d'arriver à la carte de sync — on ne testerait alors plus rien.
    noeuds.creer = () => faire('');
    noeuds.obtenir = id => {
        if (!noeuds.has(id)) {
            const el = faire(id);
            el.querySelector = () => ({ setAttribute() {} });
            noeuds.set(id, el);
        }
        return noeuds.get(id);
    };
    return noeuds;
}

let noeuds, store, topbar, sync;

// ⚠️ Le DOM est construit UNE fois : `initTopbar` capture ses éléments par id au câblage.
// Le recréer entre les tests laisserait le composant écrire dans des noeuds orphelins, et
// les assertions liraient une carte que plus personne ne met à jour.
before(async () => {
    noeuds = fauxCarte();
    globalThis.document.getElementById = id => noeuds.obtenir(id);
    // Les éléments créés par le rendu doivent CONSERVER leurs enfants : le fauxElement
    // d'env.mjs a un appendChild neutre, on ne pourrait rien inspecter du résultat.
    globalThis.document.createElement = () => noeuds.creer();
    ({ store } = await import('../static/js/state.js'));
    sync = await import('../static/js/sync.js');
    topbar = await import('../static/js/components/topbar.js');
    topbar.initTopbar();
});

beforeEach(() => {
    env.storage.clear();
    for (const el of noeuds.values()) { el.enfants = []; el.textContent = ''; el.classes.clear(); }
    store.set('syncIncidents', []);
    store.set('syncProgress', null);
});

const INCIDENTS = [
    { quoi: 'sprints clos (historique de vélocité)', status: 401, count: 3, message: 'Unauthorized' },
    { quoi: 'features (requête JQL)', status: 401, count: 1, message: 'Unauthorized' },
];
const zone = () => noeuds.obtenir('sync-card-incidents');
const carte = () => noeuds.obtenir('sync-card');
const texte = el => [el.textContent, ...(el.enfants || []).map(texte)].join(' ');

describe('carte de sync — rapport d’incidents', () => {
    test('sans incident, la zone reste masquée et la fermeture indisponible', () => {
        store.set('syncProgress', 40);
        assert.equal(zone().hidden, true);
        assert.equal(noeuds.obtenir('sync-card-close').hidden, true);
        assert.equal(carte().classList.contains('has-incidents'), false);
    });

    test('RÉGRESSION : le détail des incidents est rendu, pas seulement loggé', () => {
        store.set('syncProgress', 100);
        store.set('syncIncidents', INCIDENTS);
        assert.equal(zone().hidden, false);
        const t = texte(zone());
        assert.match(t, /sprints clos/);
        assert.match(t, /features/);
        assert.match(t, /HTTP 401/);
        assert.match(t, /×3/, 'le nombre d’occurrences est visible');
    });

    test('un refus d’authentification est expliqué en tête, avec le chemin de réglage', () => {
        store.set('syncProgress', 100);
        store.set('syncIncidents', INCIDENTS);
        const t = texte(zone());
        assert.match(t, /refusé la connexion/);
        assert.match(t, /Plugin JIRA/);
    });

    test('une panne serveur n’évoque pas le jeton', () => {
        store.set('syncProgress', 100);
        store.set('syncIncidents', [{ quoi: 'epics', status: 503, count: 1, message: 'Unavailable' }]);
        const t = texte(zone());
        assert.doesNotMatch(t, /jeton/);
        assert.match(t, /HTTP 503/);
    });

    test('la carte se marque et propose sa fermeture', () => {
        store.set('syncProgress', 100);
        store.set('syncIncidents', INCIDENTS);
        assert.equal(carte().classList.contains('has-incidents'), true);
        assert.equal(noeuds.obtenir('sync-card-close').hidden, false);
    });

    test('RÉGRESSION : le rapport ne se referme que sur action de l’utilisateur', () => {
        store.set('syncProgress', 100);
        store.set('syncIncidents', INCIDENTS);
        assert.equal(zone().hidden, false);
        sync.dismissSyncReport();
        assert.equal(store.get('syncProgress'), null, 'la carte se retire');
        assert.deepEqual(store.get('syncIncidents'), []);
    });

    test('le message brut de l’erreur reste accessible en infobulle', () => {
        store.set('syncProgress', 100);
        store.set('syncIncidents', INCIDENTS);
        const ul = zone().enfants.find(e => e.className === 'sync-card__incidents-list');
        assert.ok(ul, 'la liste est rendue');
        assert.equal(ul.enfants[0].title, 'Unauthorized');
    });
});
