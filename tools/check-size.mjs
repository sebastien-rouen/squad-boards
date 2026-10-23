/**
 * Contrôle de taille — `npm run check:size` (`-- --strict` : code de sortie 1 si un FICHIER dépasse).
 *
 * Règles BastaVerse :
 *   - fichier (JS, CSS, Python) : 800 lignes max — bloquant en --strict ;
 *   - fonction JS : 150 lignes max ; gabarit `…Html` / `…Css` (rendu déclaratif) : 300 — signalé.
 * Une fonction est mesurée de sa première à sa dernière ligne, fonctions imbriquées comprises :
 * une fonction de 3 000 lignes qui en contient d'autres reste UNE fonction trop longue.
 * Parseur : espree (celui d'ESLint, déjà en devDependency) — aucune dépendance ajoutée.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import * as espree from 'espree';

const ROOT = new URL('..', import.meta.url).pathname;
const MAX_FILE = 800;
const MAX_FN = 150;
const MAX_TEMPLATE_FN = 300;
const SCAN = ['static/js', 'static/css', 'app', 'main.py'];
const SKIP = /(^|\/)(vendor|node_modules|__pycache__|mockups)(\/|$)/;
const isTemplate = name => /(Html|Css)$/.test(name);

function* walk(path) {
    if (SKIP.test(path)) return;
    if (statSync(path).isDirectory()) for (const f of readdirSync(path)) yield* walk(join(path, f));
    else if (['.js', '.mjs', '.css', '.py'].includes(extname(path))) yield path;
}

/** Nom lisible d'une fonction d'après son contexte (déclaration, variable, propriété, méthode). */
function fnName(node, parent) {
    if (node.id?.name) return node.id.name;
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
    if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition') && parent.key.type === 'Identifier') return parent.key.name;
    if (parent?.type === 'AssignmentExpression') return parent.left.property?.name || parent.left.name || null;
    return null;
}

function longFunctions(src, file) {
    let ast;
    try { ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', loc: true }); }
    catch (e) { return [{ name: `⚠ analyse impossible (${e.message})`, line: 0, lines: 0, limit: 0 }]; }
    const out = [];
    const visit = (node, parent) => {
        if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
            const name = fnName(node, parent);
            const lines = node.loc.end.line - node.loc.start.line + 1;
            const limit = name && isTemplate(name) ? MAX_TEMPLATE_FN : MAX_FN;
            if (lines > limit) out.push({ name: name || '(anonyme)', line: node.loc.start.line, lines, limit });
        }
        for (const key in node) {
            if (key === 'loc' || key === 'range') continue;
            const v = node[key];
            if (Array.isArray(v)) v.forEach(c => c?.type && visit(c, node));
            else if (v?.type) visit(v, node);
        }
    };
    visit(ast, null);
    return out.map(f => ({ ...f, file }));
}

const bigFiles = [];
const bigFns = [];
for (const entry of SCAN) {
    for (const path of walk(join(ROOT, entry))) {
        const src = readFileSync(path, 'utf8');
        const file = relative(ROOT, path);
        const n = src.split('\n').length - (src.endsWith('\n') ? 1 : 0);
        if (n > MAX_FILE) bigFiles.push({ file, n });
        if (/\.m?js$/.test(path)) bigFns.push(...longFunctions(src, file));
    }
}

bigFiles.sort((a, b) => b.n - a.n);
bigFns.sort((a, b) => b.lines - a.lines);
const pad = (s, w) => String(s).padStart(w);

console.log(`\n📏 Fichiers > ${MAX_FILE} lignes : ${bigFiles.length}`);
for (const { file, n } of bigFiles) console.log(`  ❌ ${pad(n, 5)}  ${file}`);
console.log(`\n🔧 Fonctions trop longues (> ${MAX_FN} lignes, gabarits …Html / …Css > ${MAX_TEMPLATE_FN}) : ${bigFns.length}`);
for (const f of bigFns) console.log(`  ⚠️ ${pad(f.lines, 5)}  ${f.file}:${f.line}  ${f.name}${f.limit === MAX_TEMPLATE_FN ? ' (gabarit)' : ''}`);
console.log('');

if (process.argv.includes('--strict') && bigFiles.length) process.exit(1);
