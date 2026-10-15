/**
 * Relecture des CSV de l'export — `static/js/views/settings-io-csv.js` (import .zip / .csv).
 *
 * Régression verrouillée : un import .zip d'un export CSV complet tombait en 500
 * (« NOT NULL constraint failed: feature.title »). Le parser découpait le texte en lignes AVANT
 * de lire les guillemets — une description JIRA sur plusieurs lignes devenait plusieurs lignes
 * fantômes —, rendait `null` pour `""` et ignorait les booléens Python (`True`).
 * Fixture : le format EXACT de `_rows_to_csv` (app/routers/data.py) — BOM, `;`, tout entre
 * guillemets, `None` = cellule vide sans guillemets.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { csvTextToRows } from '../static/js/views/settings-io-csv.js';

const BOM = '﻿';
const CSV = BOM + [
    'id;title;points;flagged;labels;description;epic',
    '"T-1";"Titre ""cité""";"3";"True";"[""PI31"",""Buffer""]";"Ligne 1\nCODE_FABRICATION(40),\r\nLigne 3; avec point-virgule";',
    '"T-2";"Sans description";"0";"False";"[]";"";"F-9"',
].join('\n') + '\n';

describe('csvTextToRows — CSV de l\'export', () => {
    const rows = csvTextToRows(CSV);

    test('une description multi-lignes reste UNE cellule (plus de lignes fantômes)', () => {
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map(r => r.id), ['T-1', 'T-2']);
        // Le contenu d'une cellule est rendu tel quel, `\r\n` compris.
        assert.equal(rows[0].description, 'Ligne 1\nCODE_FABRICATION(40),\r\nLigne 3; avec point-virgule');
    });
    test('`""` = chaîne vide, cellule vide sans guillemets = null', () => {
        assert.equal(rows[1].description, '', 'une description vide ne doit pas devenir null (NOT NULL)');
        assert.equal(rows[0].epic, null);
        assert.equal(rows[1].epic, 'F-9');
    });
    test('types relus : nombres, booléens Python, JSON, guillemets doublés', () => {
        assert.equal(rows[0].points, 3);
        assert.equal(rows[0].flagged, true);
        assert.equal(rows[1].flagged, false);
        assert.deepEqual(rows[0].labels, ['PI31', 'Buffer']);
        assert.equal(rows[0].title, 'Titre "cité"');
    });
    test('fichier vide ou en-tête seul', () => {
        assert.deepEqual(csvTextToRows(''), []);
        assert.deepEqual(csvTextToRows(BOM + 'id;title\n'), []);
    });
    test('fins de ligne Windows et absence de saut final', () => {
        const r = csvTextToRows('id;n\r\n"A";"1"\r\n"B";"2"');
        assert.deepEqual(r, [{ id: 'A', n: 1 }, { id: 'B', n: 2 }]);
    });
});
