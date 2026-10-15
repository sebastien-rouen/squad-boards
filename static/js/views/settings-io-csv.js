/**
 * Relecture des CSV produits par l'export (`_rows_to_csv`, app/routers/data.py) — logique pure,
 * sans aucune dépendance, donc testable (tests/import-csv.test.mjs). Extrait de settings-io.js.
 *
 * Format écrit par l'export : BOM + délimiteur `;`, TOUTE valeur non nulle entre guillemets
 * (`"` doublés), `None` en cellule vide SANS guillemets, listes / objets en JSON dans leur cellule.
 *
 * ⚠️ Trois pièges, tous constatés sur un export réel (import .zip → 500 « NOT NULL constraint
 * failed: feature.title ») :
 *   1. Une cellule entre guillemets peut contenir des SAUTS DE LIGNE (descriptions JIRA). Découper
 *      le texte en lignes avant de lire les guillemets fabriquait des lignes fantômes : 5 490
 *      « tickets » pour 4 182, une feature d'id « CODE_FABRICATION(40), » et sans titre.
 *   2. `""` (chaîne vide) ≠ cellule vide (`None`) : rendre `null` pour une description vide
 *      viole les colonnes NOT NULL du backend.
 *   3. Python écrit les booléens `True` / `False`, pas `true` / `false`.
 */

/** Découpe un texte CSV (`;`, guillemets RFC 4180) en lignes de cellules `{ v, q }` (q = entre guillemets). */
function _cells(text) {
    const rows = [];
    let row = [], cur = '', quoted = false, inQuotes = false;
    const endCell = () => { row.push({ v: cur, q: quoted }); cur = ''; quoted = false; };
    const endRow = () => {
        endCell();
        // Ligne vide (fin de fichier, ligne blanche) : ignorée.
        if (!(row.length === 1 && row[0].v === '' && !row[0].q)) rows.push(row);
        row = [];
    };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else cur += ch;
        } else if (ch === '"') { inQuotes = true; quoted = true; }
        else if (ch === ';') endCell();
        else if (ch === '\n') endRow();
        else if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); }
        else cur += ch;
    }
    if (cur !== '' || quoted || row.length) endRow();
    return rows;
}

/** Cast au mieux (types perdus par le CSV) : JSON pour listes / objets, nombres, booléens. */
function _cast({ v, q }) {
    if (v === '') return q ? '' : null;
    if ((v[0] === '[' && v[v.length - 1] === ']') || (v[0] === '{' && v[v.length - 1] === '}')) {
        try { return JSON.parse(v); } catch { /* garde la chaîne brute */ }
    }
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    if (v === 'true' || v === 'True') return true;
    if (v === 'false' || v === 'False') return false;
    return v;
}

/**
 * CSV d'export → tableau d'objets (une clé par colonne de l'en-tête).
 * @param {string} text
 * @returns {object[]}
 */
export function csvTextToRows(text) {
    const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;   // BOM utf-8 de l'export
    const rows = _cells(clean);
    if (!rows.length) return [];
    const headers = rows[0].map(c => c.v);
    return rows.slice(1).map(cells => {
        const row = {};
        headers.forEach((h, idx) => { row[h] = _cast(cells[idx] ?? { v: '', q: false }); });
        return row;
    });
}
