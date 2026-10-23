/**
 * Génère la galerie Atlas : 4 directions × 5 pages + index.
 * Idempotent : réécrit chaque page à partir des modules, ne relit jamais sa propre sortie.
 * Usage : node static/mockups/atlas/_gen/build.cjs
 */
const fs = require('fs');
const path = require('path');
const { page } = require('./page.cjs');
const { index } = require('./index-page.cjs');

const ROOT = path.join(__dirname, '..');
const DIRS = ['./dir-a.cjs', './dir-b.cjs', './dir-c.cjs', './dir-d.cjs']
    .filter(m => fs.existsSync(path.join(__dirname, m)))
    .map(m => require(m));

let n = 0;
for (const { dir, pages } of DIRS) {
    for (const p of pages()) {
        const html = page(dir, p);
        fs.writeFileSync(path.join(ROOT, dir.key, `${p.key}.html`), html);
        const lines = html.split('\n').length;
        if (lines > 800) console.warn(`⚠️ ${dir.key}/${p.key}.html : ${lines} lignes (> 800)`);
        n++;
    }
}
fs.writeFileSync(path.join(ROOT, 'index.html'), index(DIRS.map(d => d.dir)));
console.log(`✓ ${n} pages + index (${DIRS.length} direction${DIRS.length > 1 ? 's' : ''})`);
