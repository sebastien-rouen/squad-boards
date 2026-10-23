/**
 * Contrôles de la galerie Atlas, PAGE PAR PAGE (une classe définie dans la feuille d'une autre
 * direction ne compte pas : la page ne la charge pas).
 *   1. balises équilibrées   2. liens / feuilles / scripts existants
 *   3. classes sans style    4. var(--x) sans repli jamais définie   5. aucune @media hors chrome
 * Usage : node static/mockups/atlas/_gen/verifier.cjs   (code de sortie 1 si une alerte)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'circle', 'line', 'polygon', 'path', 'rect', 'source']);
// Classes posées par le JS du chrome (pas dans le balisage, mais tolérées si elles y figurent)
const JS_CLASSES = new Set(['is-embedded']);
let alerts = 0;
const warn = (page, msg) => { alerts++; console.log(`⚠️ ${page} : ${msg}`); };

const sheetCache = new Map();
function sheet(file) {
    if (!sheetCache.has(file)) {
        const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        sheetCache.set(file, {
            classes: new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1])),
            vars: new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1])),
            uses: [...css.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1]),
        });
    }
    return sheetCache.get(file);
}

const pages = [path.join(ROOT, 'index.html'), ...['a-constellation', 'b-matrice', 'c-profils', 'd-signaux']
    .flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.html')).map(f => path.join(ROOT, d, f)))];

for (const page of pages) {
    const rel = path.relative(ROOT, page);
    const html = fs.readFileSync(page, 'utf8');
    const body = html.replace(/="data:[^"]*"/g, '=""').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');

    // 1. Balises
    const stack = [];
    for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
        const [, close, tag, self] = m; const t = tag.toLowerCase();
        if (t === '!doctype' || VOID.has(t) || self) continue;
        if (!close) stack.push(t);
        else if (stack.pop() !== t) { warn(rel, `balise </${t}> inattendue`); break; }
    }
    if (stack.length) warn(rel, `${stack.length} balise(s) non fermée(s) : ${stack.slice(-3).join(', ')}`);

    // 2. Liens
    const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map(m => m[1]).filter(u => !u.startsWith('data'));
    for (const r of refs) if (!fs.existsSync(path.resolve(path.dirname(page), r))) warn(rel, `lien cassé ${r}`);

    // 3 & 4. Classes et variables, d'après les feuilles CHARGÉES par la page
    const sheets = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m => sheet(path.resolve(path.dirname(page), m[1])));
    const defined = new Set(sheets.flatMap(s => [...s.classes]));
    const used = new Set([...body.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean));
    const missing = [...used].filter(c => !defined.has(c) && !JS_CLASSES.has(c));
    if (missing.length) warn(rel, `classes sans style : ${missing.join(', ')}`);
    const vars = new Set(sheets.flatMap(s => [...s.vars]));
    const orphan = [...new Set(sheets.flatMap(s => s.uses))].filter(v => !vars.has(v) && v !== '--echelle');
    if (orphan.length) warn(rel, `variables jamais définies : ${orphan.join(', ')}`);
}

// 5. Aucune requête média dans les feuilles des maquettes (gallery.css = chrome de galerie, hors cadre)
for (const f of ['_shared/ui.css', '_shared/blocks.css', '_shared/desktop.css', 'a-constellation/style.css', 'b-matrice/style.css', 'c-profils/style.css', 'd-signaux/style.css']) {
    if (/@media/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))) warn(f, 'requête média dans une feuille de maquette');
}

console.log(alerts ? `✗ ${alerts} alerte(s) sur ${pages.length} pages` : `✓ ${pages.length} pages : balises, liens, classes, variables, @media`);
process.exit(alerts ? 1 : 0);
