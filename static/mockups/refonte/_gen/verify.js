/**
 * Contrôles scriptés de la galerie — à relancer après chaque génération.
 *
 *   1. équilibre des balises ouvrantes / fermantes
 *   2. liens et feuilles relatifs qui existent
 *   3. variables CSS orphelines : `var(--x)` sans repli dont `--x` n'est défini
 *      dans aucune feuille chargée PAR CETTE PAGE (tokens du site compris)
 *   4. classes du balisage définies par les feuilles que la page charge
 *   5. aucune requête média dans les feuilles de direction et de cadre
 *
 * Usage : node static/mockups/refonte/_gen/verify.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let alertes = 0;
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function parcourir(dossier, ext, out = []) {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
        const full = path.join(dossier, e.name);
        if (e.isDirectory()) { if (e.name !== '_gen') parcourir(full, ext, out); }
        else if (e.name.endsWith(ext)) out.push(full);
    }
    return out;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'circle', 'line', 'rect', 'use', 'polyline', 'polygon']);

function balises(html, page) {
    const pile = [];
    // Les valeurs d'attribut sont vidées d'abord : un favicon `data:image/svg+xml,<svg…>`
    // dans un `href` n'est pas une balise.
    const sansAttributs = html.replace(/="[^"]*"/g, '=""');
    const re = /<\/?([a-zA-Z][\w-]*)[^>]*?(\/?)>/g;
    let m;
    while ((m = re.exec(sansAttributs))) {
        const tag = m[1].toLowerCase();
        if (m[0].startsWith('</')) {
            const idx = pile.lastIndexOf(tag);
            if (idx === -1) { console.log(`  ${page} : </${tag}> sans ouvrante`); alertes += 1; }
            else pile.splice(idx, 1);
        } else if (!VOID.has(tag) && !m[2]) {
            pile.push(tag);
        }
    }
    if (pile.length) { console.log(`  ${page} : ${pile.length} balise(s) non fermée(s) → ${[...new Set(pile)].join(', ')}`); alertes += pile.length; }
}

const cacheCss = new Map();
function lireCss(feuille) {
    if (!cacheCss.has(feuille)) {
        let txt = '';
        try { txt = fs.readFileSync(feuille, 'utf8'); } catch { txt = ''; }
        cacheCss.set(feuille, {
            classes: new Set([...txt.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1])),
            vars: new Set([...txt.matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1])),
            uses: [...txt.matchAll(/var\((--[\w-]+)\s*\)/g)].map((x) => x[1]),
        });
    }
    return cacheCss.get(feuille);
}

const pages = parcourir(ROOT, '.html');
for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const nom = rel(page);
    balises(html, nom);

    const feuilles = [];
    for (const l of html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) {
        const f = path.resolve(path.dirname(page), l[1]);
        if (!fs.existsSync(f)) { console.log(`  ${nom} : feuille introuvable → ${l[1]}`); alertes += 1; continue; }
        feuilles.push(f);
    }
    for (const l of html.matchAll(/(?:href|src)="([^"#:]+\.(?:html|js|css|png|svg|woff2))"/g)) {
        const f = path.resolve(path.dirname(page), l[1]);
        if (!fs.existsSync(f)) { console.log(`  ${nom} : lien cassé → ${l[1]}`); alertes += 1; }
    }

    const definies = new Set(); const vars = new Set(); const uses = [];
    for (const f of feuilles) { const c = lireCss(f); c.classes.forEach((x) => definies.add(x)); c.vars.forEach((x) => vars.add(x)); uses.push(...c.uses); }
    // variables posées en ligne dans le balisage (style="--x:…")
    for (const s of html.matchAll(/style="([^"]+)"/g)) for (const v of s[1].matchAll(/(--[\w-]+)\s*:/g)) vars.add(v[1]);
    for (const v of html.matchAll(/var\((--[\w-]+)\s*\)/g)) uses.push(v[1]);
    const orphelines = [...new Set(uses.filter((v) => !vars.has(v)))];
    if (orphelines.length) { console.log(`  ${nom} : variables orphelines → ${orphelines.join(', ')}`); alertes += orphelines.length; }

    const manquantes = new Set();
    for (const a of html.matchAll(/class="([^"]+)"/g)) for (const c of a[1].split(/\s+/)) if (c && !definies.has(c)) manquantes.add(c);
    if (manquantes.size) { console.log(`  ${nom} : classes sans style → ${[...manquantes].map((c) => '.' + c).join(', ')}`); alertes += manquantes.size; }
}

for (const f of parcourir(ROOT, '.css')) {
    const n = rel(f);
    if (/_shared\/(gallery|index)\.css$/.test(n) || /^index-theme\.css$/.test(n) || /overlay\.css$/.test(n)) continue;
    const nb = (fs.readFileSync(f, 'utf8').match(/@media/g) || []).length;
    if (nb) { console.log(`  ${n} : ${nb} requête(s) média — la disposition doit être portée par la classe du cadre`); alertes += nb; }
    const lignes = fs.readFileSync(f, 'utf8').split('\n').length;
    if (lignes > 800) { console.log(`  ${n} : ${lignes} lignes (> 800)`); alertes += 1; }
}

console.log(alertes === 0 ? `  OK — ${pages.length} pages : balises équilibrées, liens résolus, aucune variable orpheline, classes définies, 0 requête média` : `  ${alertes} alerte(s)`);
process.exit(alertes === 0 ? 0 : 1);
