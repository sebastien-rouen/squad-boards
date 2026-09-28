// Sonde : titres d'évènements tronqués — part coupée et caractères réellement visibles, par vue.
// Fonctionne en file:// (mesure de mise en page, pas de lecture de cssRules).
const { chromium } = require('z:/drafts/stream/tests/e2e/node_modules/playwright-core');
const URL0 = 'file:///Z:/drafts/squad-boards/static/mockups/team-calendar/frame.html';
const CASES = [
    ['Semaine · seule', 'dir=hybrid&period=week', 1280], ['Semaine · 3 équipes', 'dir=hybrid&period=week&cmp=Fuego,Helica', 1280],
    ['Itération · seule', 'dir=hybrid&period=iteration', 1280], ['Itération · 3 équipes', 'dir=hybrid&period=iteration&cmp=Fuego,Helica', 1280],
    ['Semaine · mobile', 'dir=hybrid&period=week&team=Fuego', 390], ['Itération · mobile', 'dir=hybrid&period=iteration&team=Fuego', 390],
];
(async () => {
    const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    for (const [label, qs, w] of CASES) {
        const p = await b.newPage({ viewport: { width: w, height: 820 } });
        await p.goto(`${URL0}?${qs}`);
        await p.waitForLoadState('load');
        const r = await p.evaluate(() => {
            const ts = [...document.querySelectorAll('.tc-body .tc-ev-t, .tc-body .tcl-name')].filter(e => e.getClientRects().length);
            const cut = ts.filter(e => e.scrollWidth > e.clientWidth + 1);
            const vcut = ts.filter(e => e.scrollHeight > e.clientHeight + 2 && !cut.includes(e));   // rogné par le bas (line-clamp)
            // Caractères visibles ≈ longueur × largeur visible / largeur nécessaire
            const vis = cut.map(e => Math.floor(e.textContent.trim().length * e.clientWidth / e.scrollWidth));
            const worst = cut.map((e, i) => ({ t: e.textContent.trim(), v: vis[i] })).sort((a, b) => a.v - b.v).slice(0, 3);
            return { n: ts.length, cut: cut.length, vcut: vcut.length, vex: vcut.slice(0, 2).map(e => e.textContent.trim()), under8: vis.filter(v => v < 8).length, worst };
        });
        console.log(`${label.padEnd(22)} ${String(r.cut).padStart(3)}/${String(r.n).padEnd(3)} coupés · ${String(r.vcut).padStart(2)} rognés en bas${r.vex.length ? ` (${r.vex.join(' ; ')})` : ''} · ${String(r.under8).padStart(3)} avec < 8 caractères visibles · pire : ${r.worst.map(x => `« ${x.t} » → ${x.v}`).join(' ; ')}`);
        await p.close();
    }
    await b.close();
})();
