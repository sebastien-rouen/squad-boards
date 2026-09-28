// Sonde de la direction D : zoom itération → semaine → retour, contexte conservé (comparaison, filtres).
// À lancer avec le dossier static/ servi en HTTP sur 127.0.0.1:8765 (voir README).
const { chromium } = require('z:/drafts/stream/tests/e2e/node_modules/playwright-core');
const URL0 = 'http://127.0.0.1:8765/mockups/team-calendar/frame.html';
(async () => {
    const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    let ko = 0;
    const check = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) ko++; };
    for (const [w, h, label] of [[1280, 820, 'bureau'], [390, 760, 'mobile']]) {
        const p = await b.newPage({ viewport: { width: w, height: h } });
        const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.goto(`${URL0}?dir=hybrid&team=Gabbiano&cmp=Fuego&period=iteration&day=2026-10-01`);
        await p.waitForLoadState('load');
        const state = () => p.evaluate(() => ({
            lanes: !!document.querySelector('.tcl, .tcl-list'), grid: !!document.querySelector('.tcw'),
            crumb: document.querySelector('.tch-crumb')?.textContent.replace(/\s+/g, ' ').trim() || '',
            pills: [...document.querySelectorAll('.tc-team-pill')].map(x => x.textContent.replace('×', '').trim()),
            pressed: document.querySelector('[data-period][aria-pressed="true"]')?.dataset.period,
            focus: document.querySelectorAll('.tcl-dayhead.is-focus').length,
        }));
        let s = await state();
        check(s.lanes && !s.grid && s.pressed === 'iteration', `${label} : itération = couloirs (B)`);
        if (label === 'bureau') check(s.focus === 5, `${label} : semaine d'ancre encadrée (${s.focus} en-têtes)`);
        // Filtre : on retire les dailies, il doit survivre au zoom
        await p.click('[data-kind="daily"]');
        if (label === 'bureau') {
            await p.click('[data-zoom="2026-09-22"]');
        } else {
            await p.click('[data-period="week"]');
        }
        s = await state();
        check(s.grid && !s.lanes && s.pressed === 'week', `${label} : zoom → grille horaire (A)`);
        check(/Tout le sprint 31\.2/.test(s.crumb), `${label} : fil de retour « ${s.crumb} »`);
        check(s.pills.join() === 'Gabbiano,Fuego', `${label} : comparaison conservée (${s.pills.join(', ')})`);
        const dailyOff = await p.$eval('[data-kind="daily"]', x => x.getAttribute('aria-pressed')).catch(() => 'absent');
        check(dailyOff === 'false' || dailyOff === 'absent', `${label} : filtre « Daily » conservé (${dailyOff})`);
        await p.click('[data-period-to="iteration"]');
        s = await state();
        check(s.lanes && s.pressed === 'iteration', `${label} : « Tout le sprint » ramène aux couloirs`);
        check(!errs.length, `${label} : aucune erreur JS${errs.length ? ' — ' + errs.join(' / ') : ''}`);
        await p.close();
    }
    await b.close();
    console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ zoom aller-retour validé');
})();
