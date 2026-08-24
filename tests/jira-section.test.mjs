/**
 * Section « Plugin JIRA » — rendu et câblage.
 *
 * Le module relit tout depuis le store : rien ne lui est passé, seul le rafraîchissement de la
 * vue est injecté (importer `reloadAndRender` depuis settings.js créerait un cycle d'imports).
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv, fauxConteneur } from './helpers/env.mjs';
import { chargerStore } from './helpers/fixtures.mjs';

const env = installerEnv();
let store, jira;

before(async () => {
    ({ store } = await import('../static/js/state.js'));
    jira = await import('../static/js/views/settings-jira.js');
});

beforeEach(() => {
    env.storage.clear();
    chargerStore(store);
    store.set('jiraConfigured', false);
    store.set('jiraUrl', null); store.set('project', null);
    store.set('jiraEnv', {}); store.set('jiraProjectTeams', {});
});

describe('rendu', () => {
    test('non configuré : le statut le dit, les champs sont là', () => {
        const h = jira.jiraSectionHtml();
        assert.ok(h.includes('Non configure'));
        for (const id of ['jira-url', 'jira-user', 'jira-token']) assert.ok(h.includes(id), id);
    });

    test('configuré : URL et projet affichés', () => {
        store.set('jiraConfigured', true);
        store.set('jiraUrl', 'https://exemple.atlassian.net');
        store.set('project', 'ERPC');
        const h = jira.jiraSectionHtml();
        assert.ok(h.includes('exemple.atlassian.net'));
        assert.ok(h.includes('ERPC'));
    });

    test('un token présent dans le .env est signalé', () => {
        store.set('jiraEnv', { tokenSet: true });
        assert.ok(jira.jiraSectionHtml().includes('déjà défini dans le .env'));
    });

    test('les valeurs du store sont échappées (XSS)', () => {
        store.set('jiraConfigured', true);
        store.set('jiraUrl', '<img src=x onerror=alert(1)>');
        const h = jira.jiraSectionHtml();
        assert.ok(h.includes('&lt;img'), 'échappé');
        assert.ok(!h.includes('<img src=x'), 'jamais injecté tel quel');
    });
});

describe('câblage', () => {
    const cibles = ['btn-save-jira-conn', 'btn-test-jira-conn', 'btn-reset-jira-conn', 'btn-save-sync-config', 'btn-clear-excluded'];

    test('tous les boutons de la section reçoivent un handler', () => {
        const c = fauxConteneur({ listesParSelecteur: { '.excluded-team-chip': ['chip-a', 'chip-b'] } });
        jira.wireJiraSection(c, () => {});
        const ids = c.poses.map(p => p.id);
        for (const id of cibles) assert.ok(ids.includes(id), id);
        assert.equal(ids.filter(i => i.startsWith('chip-')).length, 2, 'chips d\'équipes masquées');
    });

    test('le bouton « Créer les groupes » n\'est PAS câblé ici', () => {
        // Il est rendu par la section Groups : le câbler depuis ce module coupleraient
        // deux sections sans raison (cf. CHANGELOG 3.141.8).
        const c = fauxConteneur();
        jira.wireJiraSection(c, () => {});
        assert.ok(!c.poses.map(p => p.id).includes('btn-create-groups-from-jira'));
    });

    test('les plafonds de sync sont écrits puis effacés selon la saisie', () => {
        const champs = new Map([['sync-max-features', '250'], ['sync-quick-days', '7']]);
        const c = fauxConteneur({ champs });
        jira.wireJiraSection(c, () => {});
        const enregistrer = c.poses.find(p => p.id === 'btn-save-sync-config').fn;

        enregistrer();
        assert.equal(localStorage.getItem('sb-sync-maxFeatures'), '250');
        assert.equal(localStorage.getItem('sb-sync-quickDays'), '7');

        champs.set('sync-max-features', '');
        enregistrer();
        assert.equal(localStorage.getItem('sb-sync-maxFeatures'), null, 'champ vidé → clé supprimée');
    });

    test('une valeur non numérique n\'écrit rien', () => {
        const c = fauxConteneur({ champs: new Map([['sync-max-boards', 'abc']]) });
        jira.wireJiraSection(c, () => {});
        c.poses.find(p => p.id === 'btn-save-sync-config').fn();
        assert.equal(localStorage.getItem('sb-sync-maxBoards'), null);
    });
});
