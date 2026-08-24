/**
 * Rotation support — matching d'équipe, roster du shuffle, en-tête de colonne, nombre
 * d'itérations. Chaque cas rejoue une régression réellement survenue (cf. CHANGELOG 3.141.2 → .4).
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';
import { chargerStore, ABSENCES, MEMBRES } from './helpers/fixtures.mjs';

const env = installerEnv();
let store, utils, rotation;

before(async () => {
    ({ store } = await import('../static/js/state.js'));
    utils = await import('../static/js/utils.js');
    rotation = await import('../static/js/views/settings-rotation.js');
});

beforeEach(() => {
    env.storage.clear();
    chargerStore(store, { piOffset: 1 });   // PI 31
});

describe('teamNameMatches — comparaison par mots entiers', () => {
    test('une équipe d\'une lettre n\'est pas aspirée par un nom qui la contient', () => {
        // « O » ⊂ « Fuego » : l'ancien matching par sous-chaîne tirait les membres de « O »
        // dans la rotation de Fuego (total 3/3 en base, 2 personnes visibles dans la grille).
        for (const equipe of ['Fuego', 'Gabbiano', 'Lion', 'Caméléon']) {
            assert.equal(utils.teamNameMatches('O', equipe), false, `"O" ne doit pas matcher "${equipe}"`);
        }
        assert.equal(utils.teamNameMatches('O', 'O'), true);
        assert.equal(utils.teamNameMatches('Team O', 'O'), true);
    });

    test('les variantes usuelles matchent toujours', () => {
        assert.equal(utils.teamNameMatches('Team Fuego', 'Fuego'), true);
        assert.equal(utils.teamNameMatches('GCOM - Fuego', 'Fuego'), true);
        assert.equal(utils.teamNameMatches('FUEGO', 'Fuego'), true);
        assert.equal(utils.teamNameMatches('Cameleon', 'Caméléon'), true, 'accents normalisés');
    });

    test('vide et équipes distinctes ne matchent pas', () => {
        assert.equal(utils.teamNameMatches('', 'Fuego'), false);
        assert.equal(utils.teamNameMatches('Fuego', 'Gabbiano'), false);
    });
});

describe('roster du shuffle = roster affiché par la grille', () => {
    test('le snapshot du PI prime sur la dérivation des absences (turnover)', () => {
        const roster = utils.effectiveRosterForPi(store.get('piInfo'), 31, ABSENCES, MEMBRES)
            .filter(m => utils.teamNameMatches(m.team, 'Fuego'))
            .map(m => m.name);
        assert.ok(roster.includes('DUPONT, Alice'));
        assert.ok(!roster.includes('MARTIN, Eva'), 'partie après le PI 30, absente du snapshot 31');
        assert.ok(!roster.includes('MOREAU, Émile'), 'équipe « O », jamais dans Fuego');
    });

    test('le tirage ne sort que des membres présents dans la grille', () => {
        const grille = utils.effectiveRosterForPi(store.get('piInfo'), 31, ABSENCES, MEMBRES)
            .filter(m => utils.teamNameMatches(m.team, 'Fuego')).map(m => m.name);
        const semaines = Array.from({ length: 6 }, (_, i) => {
            const d = new Date('2026-09-07T00:00:00'); d.setDate(d.getDate() + i * 7);
            const iso = x => x.toISOString().slice(0, 10);
            const fin = new Date(d); fin.setDate(d.getDate() + 6);
            return { label: `31.${Math.floor(i / 2) + 1}.${(i % 2) + 1}`, weekStart: iso(d), weekEnd: iso(fin) };
        });
        const rotations = utils.generateSupportRotation({
            team: 'Fuego', weeks: semaines, memberNames: grille, absences: ABSENCES,
            existingSupport: [], membersPerWeek: 2, weekMode: 'monday', today: '2026-08-24',
        });
        for (const r of rotations) {
            assert.equal(r.members.length, 2, `${r.label} doit être complète`);
            for (const m of r.members) assert.ok(grille.includes(m), `${m} doit avoir une ligne dans la grille`);
        }
    });
});

describe('en-tête de colonne', () => {
    test('affiche le premier jour OUVRÉ, pas la date d\'ancrage', () => {
        // Le sprint 31.1 de JIRA démarre un dimanche : la colonne commence le lundi.
        assert.equal(rotation._rotFirstWorkday('2026-09-06'), '2026-09-07');
        assert.equal(new Date('2026-09-06T00:00:00').getDay(), 0, 'la fixture doit bien être un dimanche');
    });

    test('une semaine qui démarre déjà un jour ouvré est inchangée', () => {
        assert.equal(rotation._rotFirstWorkday('2026-09-11'), '2026-09-11', 'vendredi');
        assert.equal(rotation._rotFirstWorkday('2026-09-07'), '2026-09-07', 'lundi');
    });
});

describe('nombre d\'itérations d\'un PI', () => {
    test('les sprints JIRA du PI visé font foi, jamais le compte du PI courant', () => {
        assert.equal(rotation._detectSprintsPerPI(30, 5), 6, 'PI 30 : 30.1 → 30.6');
        assert.equal(rotation._detectSprintsPerPI(31, 6), 5, 'PI 31 : 31.1 → 31.5, malgré un repli à 6');
    });

    test('un PI inconnu de JIRA retombe sur la valeur de repli', () => {
        assert.equal(rotation._detectSprintsPerPI(99, 5), 5);
    });
});
