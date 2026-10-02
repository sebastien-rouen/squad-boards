// Vérification AU RENDU de la galerie « Frise » (servir static/ en HTTP sur 127.0.0.1:8765 — en file://
// les règles CSS sont illisibles) : classes du DOM produit vs feuilles du cadre, variables orphelines,
// liens, chargement de toutes les pages.
const fs = require('fs');
const path = require('path');
const { chromium } = require('z:/drafts/stream/tests/e2e/node_modules/playwright-core');
const ROOT = path.resolve(__dirname, '..');
// Port du serveur local (PORT=8766 si 8765 est pris par une autre session)
const URL0 = `http://127.0.0.1:${process.env.PORT || 8765}/mockups/team-timeline`;
const IGNORE = new Set(['gallery', 'tl-card', 'tl-dir-lanes', 'tl-dir-story', 'mobile-only', 'bc-seg--view', 'bc-seg--team', 'nav-main', 'nav-secondary', 'is-manual', 'tll-row--axis']);

(async () => {
    const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    let ko = 0;
    const missing = new Map();
    for (const dir of ['lanes', 'story']) for (const w of [1280, 390])
        for (const extra of ['', '&scope=train', '&preset=ete', '&seed=1&select=0', '&add=1', '&state=loading', '&state=empty']) {
            const p = await b.newPage({ viewport: { width: w, height: 800 } });
            const errs = []; p.on('pageerror', e => errs.push(e.message));
            await p.goto(`${URL0}/frame.html?dir=${dir}&reset=1${extra}`); await p.waitForLoadState('load'); await p.waitForTimeout(80);
            const miss = await p.evaluate(ignore => {
                const defined = new Set();
                const walk = rs => { for (const r of rs) { if (r.selectorText) (r.selectorText.match(/\.[\w-]+/g) || []).forEach(c => defined.add(c.slice(1))); if (r.cssRules) walk(r.cssRules); if (r.styleSheet) { try { walk(r.styleSheet.cssRules); } catch { } } } };
                for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
                const used = new Set(); document.querySelectorAll('[class]').forEach(el => el.classList.forEach(c => used.add(c)));
                return [...used].filter(c => !defined.has(c) && !ignore.includes(c));
            }, [...IGNORE]);
            miss.forEach(c => missing.set(c, (missing.get(c) || new Set()).add(`${dir}/${w}${extra}`)));
            if (errs.length) { ko++; console.log(`❌ erreurs JS ${dir} ${w} ${extra} : ${errs.join(' / ')}`); }
            await p.close();
        }
    if (missing.size) { ko++; for (const [c, wh] of missing) console.log(`❌ classe sans style : .${c} (${[...wh].slice(0, 3).join(', ')})`); }
    else console.log('✅ 28 rendus : toutes les classes ont un style dans les feuilles du cadre');

    // Variables orphelines (sans repli) dans nos feuilles
    const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const sheets = ['../../css/tokens.css', '../../css/base-shell.css', '../../css/base-components.css', '../../css/base-overlays.css', '../../css/base-utilities.css', '../../css/base-palette.css', '../../css/base-misc.css', '../../css/views/team.css', '_shared/tl.css', 'a-couloirs/style.css', 'b-recit/style.css', '../team-calendar/_shared/gallery.css'];
    const defs = new Set(sheets.map(read).join('\n').match(/--[\w-]+(?=\s*:)/g));
    ['_shared/tl-ui.js', '_shared/tl-lanes.js', '_shared/tl-story.js', 'frame.html'].map(read).join('\n').match(/--[\w-]+(?=\s*:)/g)?.forEach(v => defs.add(v));
    const orph = [];
    for (const f of ['_shared/tl.css', 'a-couloirs/style.css', 'b-recit/style.css']) for (const m of read(f).matchAll(/var\((--[\w-]+)\s*\)/g)) if (!defs.has(m[1])) orph.push(`${f}: ${m[1]}`);
    if (orph.length) { ko++; console.log('❌ variables orphelines :\n  ' + [...new Set(orph)].join('\n  ')); } else console.log('✅ aucune variable orpheline');

    // Pages de la galerie
    const pages = ['index.html', ...['a-couloirs', 'b-recit'].flatMap(d => ['01-principal', '02-periode', '03-fiche', '04-etats'].map(p => `${d}/${p}.html`))];
    for (const pg of pages) {
        const html = read(pg);
        const bad = [...html.matchAll(/(?:href|src)="([^"#?][^"?#]*)[^"]*"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|data:)/.test(u) && !u.endsWith('/'))
            .filter(u => !fs.existsSync(path.resolve(path.dirname(path.join(ROOT, pg)), decodeURIComponent(u))));
        const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.goto(`${URL0}/${pg}`); await p.evaluate(() => document.querySelectorAll('iframe').forEach(f => { f.loading = 'eager'; }));
        await p.waitForTimeout(900);
        const r = await p.evaluate(() => ({ ovx: document.documentElement.scrollWidth - innerWidth,
            frames: [...document.querySelectorAll('iframe')].map(f => { try { return !!f.contentDocument.querySelector('.tl-card'); } catch { return 'x'; } }) }));
        const empty = r.frames.filter(x => x === false).length;
        const ok = !errs.length && !bad.length && r.ovx <= 0 && !empty;
        if (!ok) ko++;
        console.log(`${ok ? '✅' : '❌'} ${pg.padEnd(26)} iframes ${r.frames.length}${empty ? ` (${empty} vides)` : ''}${bad.length ? ` | liens cassés ${bad.join(', ')}` : ''}${r.ovx > 0 ? ` | défilement ${r.ovx}` : ''}${errs.length ? ` | ERREURS ${errs.join(' / ')}` : ''}`);
        await p.close();
    }
    await b.close();
    console.log(ko ? `\n❌ ${ko} contrôle(s) en échec` : '\n✅ tous les contrôles passent');
})();
