// Vérification au RENDU : classes du DOM réellement produit vs feuilles chargées PAR CE CADRE,
// + variables CSS orphelines, + liens/ressources, + chargement de toutes les pages de la galerie.
const fs = require('fs');
const path = require('path');
const { chromium } = require('z:/drafts/stream/tests/e2e/node_modules/playwright-core');
const ROOT = 'Z:/drafts/squad-boards/static/mockups/team-calendar';
// Port du serveur local (PORT=8766 si 8765 est pris par une autre session)
const URL0 = `http://127.0.0.1:${process.env.PORT || 8765}/mockups/team-calendar`;

// Classes posées par le JS du site ou purement sémantiques : pas de style attendu
const IGNORE = new Set(['gallery', 'tcf-compact', 'is-me', 'is-common', 'is-week', 'is-selected', 'is-dim', 'tc-dir-week', 'tc-dir-lanes', 'tc-dir-mosaic',
    'mobile-only', 'bc-seg--view', 'bc-seg--team', 'nav-main', 'nav-secondary', 'has-role', 'tc-meta', 'tc-card', 'is-on', 'is-today', 'is-done', 'is-corrected', 'tc-dir-hybrid', 'tch--week', 'tch--iteration']);

(async () => {
    const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    let ko = 0;

    // 1. Classes au rendu, par cadre
    const frames = [];
    for (const dir of ['week', 'lanes', 'mosaic', 'hybrid']) for (const w of [1280, 390])
        for (const extra of ['', '&period=iteration', '&cmp=Fuego,Helica', '&state=noical', '&state=loading', '&team=Lion&banner=masked', '&select=' + encodeURIComponent('Gabbiano - Rétro@2026-10-02'), '&pop=1'])
            frames.push({ dir, w, extra });
    const missing = new Map();
    for (const f of frames) {
        const p = await b.newPage({ viewport: { width: f.w, height: 800 } });
        const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.goto(`${URL0}/frame.html?dir=${f.dir}${f.extra}`);
        await p.waitForLoadState('load'); await p.waitForTimeout(100);
        const miss = await p.evaluate(ignore => {
            const defined = new Set();
            for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; }
                const walk = rs => { for (const r of rs) { if (r.selectorText) (r.selectorText.match(/\.[\w-]+/g) || []).forEach(c => defined.add(c.slice(1))); if (r.cssRules) walk(r.cssRules); if (r.styleSheet) { try { walk(r.styleSheet.cssRules); } catch { /* origine */ } } } };  // descend dans les @import
                walk(rules); }
            const used = new Set(); document.querySelectorAll('[class]').forEach(el => el.classList.forEach(c => used.add(c)));
            return [...used].filter(c => !defined.has(c) && !ignore.includes(c));
        }, [...IGNORE]);
        miss.forEach(c => missing.set(c, (missing.get(c) || new Set()).add(`${f.dir}/${f.w}`)));
        if (errs.length) { ko++; console.log(`❌ erreurs JS ${f.dir} ${f.w} ${f.extra} : ${errs.join(' / ')}`); }
        await p.close();
    }
    if (missing.size) { ko++; for (const [c, where] of missing) console.log(`❌ classe sans style : .${c}  (${[...where].join(', ')})`); }
    else console.log(`✅ ${frames.length} rendus : toutes les classes ont un style dans les feuilles du cadre`);

    // 2. Variables orphelines (sans valeur de repli) dans nos feuilles
    const sheets = ['../../css/tokens.css', '../../css/base-shell.css', '../../css/base-components.css', '../../css/base-overlays.css', '../../css/base-utilities.css', '../../css/base-palette.css', '../../css/base-misc.css', '../../css/views/team.css', '_shared/tc.css', '_shared/frame.css', '_shared/gallery.css', '_shared/detection.css', 'a-semaine/style.css', 'b-couloirs/style.css', 'c-mosaique/style.css', 'd-synthese/style.css']
        .map(s => fs.readFileSync(path.join(ROOT, s), 'utf8'));
    const defs = new Set(sheets.join('\n').match(/--[\w-]+(?=\s*:)/g));
    const ours = ['_shared/tc.css', '_shared/frame.css', '_shared/gallery.css', '_shared/detection.css', 'a-semaine/style.css', 'b-couloirs/style.css', 'c-mosaique/style.css', 'd-synthese/style.css'];
    const js = ['_shared/tc-ui.js', '_shared/tc-week.js', '_shared/tc-lanes.js', '_shared/tc-mosaic.js', '_shared/tc-hybrid.js', '_shared/gallery.js', '_shared/frame.js', '_shared/detection.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    (js.match(/--[\w-]+(?=\s*:)/g) || []).forEach(v => defs.add(v));
    const orphans = [];
    for (const f of ours) for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/var\((--[\w-]+)\s*\)/g)) if (!defs.has(m[1])) orphans.push(`${f}: ${m[1]}`);
    if (orphans.length) { ko++; console.log('❌ variables orphelines :\n  ' + [...new Set(orphans)].join('\n  ')); } else console.log('✅ aucune variable orpheline');

    // 3. Toutes les pages de la galerie : chargement, liens relatifs, iframes rendues, pas de défilement horizontal
    const pages = ['index.html', 'detection.html', ...['a-semaine', 'b-couloirs', 'c-mosaique', 'd-synthese'].flatMap(d => ['01-principal', '02-comparer', '03-fiche', '04-etats'].map(p => `${d}/${p}.html`)), 'd-synthese/05-zoom.html'];
    for (const pg of pages) {
        const html = fs.readFileSync(path.join(ROOT, pg), 'utf8');
        const badLinks = [...html.matchAll(/(?:href|src)="([^"#?][^"?#]*)[^"]*"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|data:)/.test(u) && !u.endsWith('/'))
            .filter(u => !fs.existsSync(path.resolve(path.dirname(path.join(ROOT, pg)), decodeURIComponent(u))));
        const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.goto(`${URL0}/${pg}`);
        await p.evaluate(() => document.querySelectorAll('iframe').forEach(f => f.loading = 'eager'));
        await p.waitForTimeout(700);
        const r = await p.evaluate(() => ({
            ovx: document.documentElement.scrollWidth - innerWidth,
            frames: [...document.querySelectorAll('iframe')].map(f => { try { return !!f.contentDocument.querySelector('.tc-card, .team-id-header'); } catch { return 'x-origin'; } }),
            scaleOk: [...document.querySelectorAll('.bureau-fenetre')].every(f => f.getBoundingClientRect().width <= f.parentElement.getBoundingClientRect().width + 1),
        }));
        const empty = r.frames.filter(x => x === false).length;
        const ok = !errs.length && !badLinks.length && r.ovx <= 0 && r.scaleOk && !empty;
        if (!ok) ko++;
        console.log(`${ok ? '✅' : '❌'} ${pg.padEnd(26)} iframes ${r.frames.length}${empty ? ` (${empty} vides)` : ''}${badLinks.length ? ` | liens cassés ${badLinks.join(', ')}` : ''}${r.ovx > 0 ? ` | défilement horiz ${r.ovx}` : ''}${errs.length ? ` | ERREURS ${errs.join(' / ')}` : ''}`);
        await p.close();
    }
    await b.close();
    console.log(ko ? `\n❌ ${ko} contrôle(s) en échec` : '\n✅ tous les contrôles passent');
})();
