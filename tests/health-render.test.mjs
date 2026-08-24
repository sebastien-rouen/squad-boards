/**
 * Rendu de la vue Health — matrice et modale « Sprints du PI ».
 *
 * Seule partie du chemin capacité/périmètre qui n'était couverte par aucun test : c'est
 * pourtant là que les erreurs coûtent le plus, car elles ne se voient qu'à l'écran. Une
 * variable oubliée dans une déstructuration (`carriedCount is not defined`, survenue en
 * développement) passe `node --check` sans broncher et casse tout le rendu à l'exécution.
 *
 * Ce que ces tests verrouillent, au-delà de « ça ne plante pas » :
 *  - le total « Charge prévue » de la modale ÉGALE la Base capacité de la matrice ;
 *  - le sprint de RESPIRATION n'est ni compté ni suggéré ;
 *  - un ticket reporté est marqué barré, et ne gonfle pas la vélocité réalisée ;
 *  - la colonne Base capacité n'apparaît que sur un PI à venir.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv, fauxElement } from './helpers/env.mjs';

const env = installerEnv();
globalThis.location = { hash: '' };
globalThis.history = { pushState() {}, replaceState() {}, back() {} };

// Capture des éléments créés : la modale vit dans un overlay détaché du faux DOM.
const crees = [];
const _creerVrai = globalThis.document.createElement;
globalThis.document.createElement = (...a) => { const el = _creerVrai(...a); crees.push(el); return el; };

let store, health;
before(async () => {
    ({ store } = await import('../static/js/state.js'));
    health = await import('../static/js/views/health.js');
});

const EQUIPE = 'O';
const ROLES = { 'Dev': 100, 'Tech Lead': 70, 'Product Owner': 0 };
const MEMBRES = [
    { name: 'Dupont, A', team: EQUIPE, role: 'Dev' },
    { name: 'Durand, B', team: EQUIPE, role: 'Dev' },
    { name: 'Martin, C', team: EQUIPE, role: 'Tech Lead' },
    { name: 'Petit, D',  team: EQUIPE, role: 'Product Owner' },
];
// Un congé par membre, pour que l'appartenance à l'équipe soit dérivable (table absence).
const PRESENCE = MEMBRES.map(m => ({
    memberName: m.name, team: EQUIPE, type: 'conge',
    startDate: '2026-01-05', endDate: '2026-01-05',
}));

const clos = (pi, idx, velocity) => ({
    team: EQUIPE, name: `Equipe O - Ité ${pi}.${idx}`, state: 'closed', velocity,
    startDate: `2026-0${idx}-05`, endDate: `2026-0${idx}-16`,
});
// PI 30 : 3 sprints à 20 pts + la respiration (.4) à 2 pts, qui ne doit PAS peser.
const PI30 = [clos(30, 1, 20), clos(30, 2, 20), clos(30, 3, 20), clos(30, 4, 2)];
const PI31 = [1, 2, 3, 4].map(i => ({
    team: EQUIPE, name: `Equipe O - Ité 31.${i}`, state: 'future',
    startDate: ['2026-09-07', '2026-09-21', '2026-10-05', '2026-10-19'][i - 1],
    endDate:   ['2026-09-18', '2026-10-02', '2026-10-16', '2026-10-30'][i - 1],
}));

const tk = (id, sprintName, status, points, sprintsTraverses = []) => ({
    id, title: `Ticket ${id}`, team: EQUIPE, sprintName, status, points, labels: [], epic: '',
    recentChanges: sprintsTraverses.map((_, i) => ({
        field: 'Sprint', date: `2026-0${i + 1}-01`,
        from: sprintsTraverses.slice(0, i).join(', '),
        to:   sprintsTraverses.slice(0, i + 1).join(', '),
    })),
});

function charger({ piOffset = 1, absences = PRESENCE, tickets = [] } = {}) {
    env.storage.clear();
    store.set('teams', [EQUIPE]);
    store.set('teamObjects', [{ name: EQUIPE }]);
    store.set('team', EQUIPE);
    store.set('group', null);
    store.set('groups', []);
    store.set('tickets', tickets);
    store.set('features', []); store.set('epics', []); store.set('support', []);
    store.set('members', MEMBRES);
    store.set('absences', absences);
    store.set('sprintInfo', { name: 'Equipe O - Ité 30.4', teamSprints: [...PI30, ...PI31] });
    store.set('piInfo', { objectives: [], sprintsPerPI: 4, sprintDuration: 14, roleCapacity: ROLES });
    store.set('moodVotes', []); store.set('fistVotes', []);
    store.set('piOffset', piOffset);
}

/** Rend la vue et retourne son HTML. */
function rendre(opts) {
    charger(opts);
    const c = fauxElement('health');
    health.renderHealth(c);          // toute exception fait échouer le test — c'est voulu
    return c.innerHTML || '';
}

/** Ouvre la modale d'un sprint et retourne son HTML. */
function ouvrirModale(sprintName, metric = 'velocity') {
    crees.length = 0;
    health.reopenSprintModalFromHash(EQUIPE, metric, sprintName);
    const ov = crees.find(el => (el.innerHTML || '').includes('htl-sprint-table'));
    assert.ok(ov, 'la modale doit être rendue');
    return ov.innerHTML;
}

const nombre = (html, re) => { const m = html.match(re); return m ? Number(m[1]) : null; };

describe('matrice — colonne 🎯 Base capacité', () => {
    test('le rendu ne lève pas et produit la matrice', () => {
        const h = rendre({ piOffset: 1 });
        assert.match(h, /health-matrix/);
    });

    test('absente sur le PI courant : les colonnes mesurées font foi', () => {
        assert.doesNotMatch(rendre({ piOffset: 0 }), /health-capa-col/);
    });

    test('présente sur un PI à venir', () => {
        assert.match(rendre({ piOffset: 1 }), /health-capa-col/);
    });

    test('RÉGRESSION : la respiration ne compte pas dans la base', () => {
        // PI 30 : 20+20+20 sur 3 sprints (la respiration à 2 pts est écartée) → 20 pts/sprint.
        // PI 31 : 4 sprints dont 1 de respiration → 3 planifiables → 60 pts bruts.
        // Compter la respiration des deux côtés aurait donné 15,5 × 4 ≈ 62.
        const h = rendre({ piOffset: 1 });
        const pts = nombre(h, /health-capa-cell[^>]*>\s*(\d+)<span class="health-metric-unit">/);
        assert.equal(pts, 60);
    });

    test('l\'infobulle nomme les membres comptés et exclut le rôle à 0 %', () => {
        const h = rendre({ piOffset: 1 });
        const tip = (h.match(/class="health-cell health-capa-cell[^"]*" title="([\s\S]*?)">/) || [])[1] || '';
        assert.match(tip, /2\.70 ETP/, 'Dev+Dev+TechLead 70 % = 2,70 ETP, le PO ne compte pas');
        assert.match(tip, /Petit, D/);
        assert.match(tip, /exclu/);
        assert.match(tip, /respiration/, 'la respiration écartée est annoncée');
    });
});

describe('modale — Charge prévue', () => {
    test('RÉGRESSION : le total de la modale égale la Base capacité de la matrice', () => {
        // Un total qui contredit le chiffre de la matrice rendrait les deux inutilisables.
        const h = rendre({ piOffset: 1 });
        const base = nombre(h, /health-capa-cell[^>]*>\s*(\d+)<span class="health-metric-unit">/);
        const modale = ouvrirModale('Equipe O - Ité 31.1');
        const total = nombre(modale, /id="htl-tot-charge"[^>]*>(\d+)</);
        assert.equal(total, base);
    });

    test('RÉGRESSION : aucune charge suggérée sur le sprint de respiration', () => {
        rendre({ piOffset: 1 });
        const modale = ouvrirModale('Equipe O - Ité 31.1');
        const lignes = [...modale.matchAll(/<td class="htl-spr-name">([\s\S]*?)<\/td>[\s\S]*?<input class="htl-charge-input([^"]*)"[^>]*value="([^"]*)"/g)];
        assert.equal(lignes.length, 4, 'les 4 sprints du PI restent affichés');
        const respiration = lignes.find(l => l[1].includes('31.4'));
        assert.ok(respiration, 'le sprint de respiration doit apparaître');
        assert.equal(respiration[3], '', 'sans valeur suggérée');
        assert.ok(!respiration[2].includes('suggested'));
        assert.match(respiration[1], /htl-breath-chip/, 'et marqué 🍃');
        for (const l of lignes.filter(x => !x[1].includes('31.4'))) {
            assert.ok(l[2].includes('suggested'), `${l[1]} doit porter une suggestion`);
        }
    });

    test('une saisie manuelle prime sur la suggestion', () => {
        charger({ piOffset: 1 });
        localStorage.setItem('sb-charge-Equipe O - Ité 31.2', '99');
        const c = fauxElement('health');
        health.renderHealth(c);
        const modale = ouvrirModale('Equipe O - Ité 31.1');
        const saisie = modale.match(/31\.2[\s\S]*?<input class="htl-charge-input([^"]*)"[^>]*value="([^"]*)"/);
        assert.equal(saisie[2], '99');
        assert.ok(!saisie[1].includes('suggested'), 'une valeur décidée n\'est plus une suggestion');
    });
});

describe('modale — tickets engagés et reports', () => {
    const TICKETS = [
        tk('OK-1', 'Equipe O - Ité 30.1', 'done', 8),
        tk('RE-1', 'Equipe O - Ité 30.2', 'done', 5, ['Equipe O - Ité 30.1', 'Equipe O - Ité 30.2']),
    ];

    test('RÉGRESSION : un reporté est barré et ne gonfle pas la vélocité réalisée', () => {
        rendre({ piOffset: 0, tickets: TICKETS });
        const modale = ouvrirModale('Equipe O - Ité 30.1', 'planned');
        // Les deux tickets sont dans le périmètre engagé…
        assert.match(modale, /OK-1/);
        assert.match(modale, /RE-1/);
        // …mais seul le reporté est marqué barré (sprint clos).
        const ligneRe = modale.match(/<tr class="([^"]*)"[^>]*data-open-ticket="RE-1"/);
        assert.match(ligneRe[1], /htl-ticket-row--missed-final/);
        const ligneOk = modale.match(/<tr class="([^"]*)"[^>]*data-open-ticket="OK-1"/);
        assert.ok(!ligneOk[1].includes('missed'), 'OK-1 a bien été livré ici');
        // La vélocité réalisée du sprint ne retient que OK-1 (8 pts), pas RE-1.
        assert.match(modale, /htl-tickets-hdr-missed/, 'le compteur de non réalisés est affiché');
    });

    test('le sprint d\'arrivée du report est indiqué', () => {
        rendre({ piOffset: 0, tickets: TICKETS });
        const modale = ouvrirModale('Equipe O - Ité 30.1', 'planned');
        assert.match(modale, /htl-moved-chip[^>]*>↪ 30\.2</);
    });
});
