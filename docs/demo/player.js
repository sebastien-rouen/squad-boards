/* Lecteur des démos — tools/demo-video/player/player.js (copié dans {site}/docs/demo/).
   Lit window.DEMOS (demos.js généré) : grille de cartes, lecteur avec chapitres cliquables,
   barre de progression par chapitre, raccourcis clavier, lien profond #nom. Aucun fetch : marche en file://. */
const DEMOS = Array.isArray(window.DEMOS) ? window.DEMOS : [];
const $ = (id) => document.getElementById(id);
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtMb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} Mo` : `${Math.round(b / 1024)} Ko`);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

let current = null;
const video = $('pl-video');

// ── Sélecteur (vignettes en haut de page) ──
function renderGrid() {
    const nav = $('picker');
    nav.replaceChildren();
    for (const d of DEMOS) {
        const btn = $('tpl-pick').content.firstElementChild.cloneNode(true);
        btn.dataset.name = d.name;
        const img = btn.querySelector('img');
        img.src = `${d.name}-poster.webp`;
        img.alt = d.title;
        btn.querySelector('.pick-dur').textContent = fmtT(d.durationS);
        btn.querySelector('.pick-title').textContent = d.title;
        btn.querySelector('.pick-meta').textContent = `${fmtMb(d.files.mp4)} · ${d.chapters.length} chap.${d.audience === 'interne' ? ' · 🔒' : ''}`;
        btn.addEventListener('click', () => { location.hash = d.name; });
        nav.append(btn);
    }
    $('hd-count').textContent = `${DEMOS.length} démo${DEMOS.length > 1 ? 's' : ''}`;
    $('hd-site').textContent = DEMOS[0]?.site ? `· ${DEMOS[0].site}` : '';
    $('empty').hidden = DEMOS.length > 0;
}

// ── Lecteur ──
function stepLabel(s) {
    if (s.goto !== undefined) return ['Aller à', s.goto];
    if (s.click) return ['Clic', s.click];
    if (s.hover) return ['Survol', s.hover];
    if (s.type) return ['Saisie', `${s.type.text} → ${s.type.sel}`];
    if (s.press) return ['Touche', s.press];
    if (s.scroll) return ['Défilement', `${s.scroll.y ?? 300}px`];
    if (s.highlight !== undefined) return ['Halo', s.highlight ? `${s.highlight}${s.tip ? ` — « ${s.tip} »` : ''}` : 'retiré'];
    if (s.draw !== undefined) return ['Tracé', s.draw ? `${s.draw.shape || 'circle'} sur ${s.draw.sel}${s.draw.label ? ` — « ${s.draw.label} »` : ''}` : 'effacé'];
    if (s.caption !== undefined) return ['Sous-titre', s.caption || '(masqué)'];
    if (s.wait !== undefined) return ['Pause', `${s.wait} ms`];
    return ['?', JSON.stringify(s)];
}

function openDemo(name) {
    const d = DEMOS.find(x => x.name === name);
    if (!d) return;
    current = d;
    $('player').hidden = false;
    video.src = `${d.name}.mp4`;
    video.poster = `${d.name}-poster.webp`;
    $('pl-kicker').textContent = `${d.site || ''} · ${fmtT(d.durationS)} · ${d.viewport.width}×${d.viewport.height}`;
    $('pl-title').textContent = d.title;
    $('pl-desc').textContent = d.description || '';

    const chapters = $('pl-chapters');
    chapters.replaceChildren(...d.chapters.map((c, i) => {
        const li = el('li');
        li.dataset.i = i;
        li.append(el('time', '', fmtT(c.t)), el('span', '', c.text));
        li.addEventListener('click', () => seek(c.t));
        return li;
    }));
    $('pl-chapbar').replaceChildren(...d.chapters.map((c) => { const s = el('span'); s.addEventListener('click', () => seek(c.t)); return s; }));

    const meta = $('pl-meta');
    meta.replaceChildren();
    const rows = [
        ['Enregistrée', new Date(d.recordedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })],
        ['Audience', d.audience === 'interne' ? 'interne (rien de flouté)' : `public · ${d.blur.length} sélecteur${d.blur.length > 1 ? 's' : ''} flouté${d.blur.length > 1 ? 's' : ''}`],
        ['Source', d.url],
        ['Poids', `MP4 ${fmtMb(d.files.mp4)}${d.files.webp ? ` · WebP ${fmtMb(d.files.webp)}` : ''} · poster ${fmtMb(d.files.poster)}`],
    ];
    for (const [k, v] of rows) meta.append(el('dt', '', k), el('dd', '', v));

    const links = $('pl-links');
    links.replaceChildren();
    const mk = (href, label, alt) => { const a = el('a', alt ? 'is-alt' : '', label); a.href = href; a.download = ''; return a; };
    links.append(mk(`${d.name}.mp4`, '⬇ Télécharger le MP4'));
    if (d.files.webp) links.append(mk(`${d.name}.webp`, 'WebP animé', true));
    links.append(mk(`${d.name}-poster.webp`, 'Poster', true), mk(d.scenario, 'Scénario JSON', true));

    $('pl-steps').replaceChildren(...d.steps.map((s) => { const [k, v] = stepLabel(s); const li = el('li'); li.append(el('b', '', `${k} `), document.createTextNode(v)); return li; }));
    $('pl-cmd').textContent = `node tools/demo-video/record.mjs ${d.site}/docs/demo/${d.scenario}`;

    document.querySelectorAll('.pick').forEach(c => c.classList.toggle('is-on', c.dataset.name === name));
    $('pl-chapcount').textContent = d.chapters.length;
    document.title = `${d.title} — Démos`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    video.play().catch(() => {});   // lecture auto refusée sans geste utilisateur : le bouton reste là
}

function seek(t) { video.currentTime = t + 0.05; video.play().catch(() => {}); }

function chapterIndex(t) {
    if (!current) return -1;
    let i = -1;
    current.chapters.forEach((c, k) => { if (t >= c.t) i = k; });
    return i;
}

video.addEventListener('timeupdate', () => {
    const i = chapterIndex(video.currentTime);
    document.querySelectorAll('#pl-chapters li').forEach((li, k) => { li.classList.toggle('is-on', k === i); li.classList.toggle('is-done', k < i); });
    document.querySelectorAll('#pl-chapbar span').forEach((s, k) => { s.classList.toggle('is-done', k < i); s.classList.toggle('is-on', k === i); });
});

document.addEventListener('keydown', (e) => {
    if (!current || e.target.tagName === 'INPUT' || e.target.id === 'blur-demo') return;
    const i = chapterIndex(video.currentTime);
    if (e.key === 'ArrowRight' && current.chapters[i + 1]) { e.preventDefault(); seek(current.chapters[i + 1].t); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(current.chapters[Math.max(0, i - 1)]?.t ?? 0); }
    else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); video.paused ? video.play() : video.pause(); }
});

// ── Accueil : poids pour une minute (extrapolé depuis les démos du dossier) + bascule du floutage ──
function renderHow() {
    const secs = DEMOS.reduce((a, d) => a + d.durationS, 0) || 1;
    const perMin = (k) => DEMOS.reduce((a, d) => a + (d.files[k] || 0), 0) / secs * 60;
    const mp4 = perMin('mp4'), webp = DEMOS.some(d => d.files.webp) ? perMin('webp') : 0;
    const gif = 25 * 1048576;   // ordre de grandeur d'un GIF 720p d'une minute, 256 couleurs
    const rows = [['MP4', mp4, 'is-mp4'], ['WebP', webp, 'is-webp'], ['GIF', gif, 'is-gif']].filter(r => r[1] > 0);
    const max = Math.max(...rows.map(r => r[1]));
    const ul = $('bars');
    ul.replaceChildren(...rows.map(([label, bytes, cls]) => {
        const li = el('li', cls);
        const bar = el('span', 'bar'); const fill = el('i'); bar.append(fill);
        li.append(el('span', '', label), bar, el('b', '', `${fmtMb(bytes)}${cls === 'is-gif' ? ' ≈' : ''}`));
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${Math.max(2, bytes / max * 100)}%`; }));
        return li;
    }));
    const demo = $('blur-demo');
    if (!demo) return;
    demo.classList.add('is-blurred');
    const toggle = () => {
        const on = demo.classList.toggle('is-blurred');
        demo.setAttribute('aria-pressed', String(on));
        $('blur-state').textContent = on ? 'flouté · cliquer pour voir net' : 'net · cliquer pour flouter';
    };
    demo.addEventListener('click', toggle);
    demo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
}

window.addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && h !== 'how') openDemo(h); });
renderGrid();
renderHow();
const first = decodeURIComponent(location.hash.slice(1));
if (first && first !== 'how') openDemo(first); else if (DEMOS[0]) openDemo(DEMOS[0].name);
