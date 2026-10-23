/**
 * Gabarit d'une page de la galerie Atlas : chrome (en-tête à hauteur constante, barre des écrans,
 * commutateur 🖥️ / 📱 posé par view-switch.js), vue desktop 1280 × 820 réduite, vue mobile 390 × 760,
 * notes « Parti pris UX », navigateur 🧭.
 * Ordre des feuilles : composants communs → coquille desktop → DIRECTION (ses partis pris gagnent)
 * → chrome de galerie.
 */
const { esc } = require('./ui.cjs');

const PAGES = [
    ['01-atlas', 'Écran principal'],
    ['02-sections', 'Sections'],
    ['03-modales', 'Modales'],
    ['04-atelier', 'Atelier de staffing'],
    ['05-mobilite', 'Mobilité & trajectoires'],
];

const DIRS = ['a-constellation', 'b-matrice', 'c-profils', 'd-signaux'];

/** Téléphone du rail : étiquette d'intention, écran, légende (titre + raison du parti pris). */
const phone = ({ tag, html, cap, why }) =>
    `<figure class="phone"><span class="phone-tag">${tag}</span><div class="phone-frame">${html}</div><figcaption><b>${cap}</b><span>${why}</span></figcaption></figure>`;

/**
 * @param dir   { key, name, num, sub, icon }
 * @param p     { key, title, sub, desk, deskNote, solo?, phones?, notes[] }
 */
function page(dir, p) {
    const i = DIRS.indexOf(dir.key);
    const next = DIRS[(i + 1) % DIRS.length];
    const nav = PAGES.map(([k, l]) => `<a href="${k}.html"${k === p.key ? ' aria-current="page"' : ''}>${l}</a>`).join('');
    const mobile = p.solo
        ? `<div class="gal-mobile"><div class="gal-group">📱 Mobile — 390 × 760 (pleine page)</div>${p.solo}</div>`
        : `<div class="gal-mobile"><div class="gal-group">📱 Mobile — 390 × 760</div><div class="gal-rail">${p.phones.map(phone).join('')}</div></div>`;
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(dir.name)} — ${esc(p.title)} · Atlas</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧬</text></svg>">
  <link rel="stylesheet" href="../_shared/ui.css">
  <link rel="stylesheet" href="../_shared/desktop.css">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="../_shared/gallery.css">
  <link rel="stylesheet" href="../_shared/bureau.css">
  <link rel="stylesheet" href="../_shared/navigator.css">
</head>
<body class="gallery${p.solo ? ' gallery--solo' : ''}" data-dir="${dir.key}" data-page="${p.key}">
<header class="gal-head">
  <div class="gal-head-top"><a class="gal-back" href="../index.html">← Toutes les directions</a><a class="gal-back" href="../${next}/${p.key}.html">Même écran en ${esc(dir.nextName)} →</a></div>
  <h1>Direction ${dir.num} · ${esc(dir.name)} — ${esc(p.title)}</h1>
  <p class="gal-sub">${p.sub}</p>
</header>
<nav class="gal-nav">${nav}</nav>
<div class="gal-desktop"><div class="gal-group gal-group--vue">🖥️ Desktop <small>1280 × 820, réduit pour tenir — ${p.deskNote}</small></div>
<div class="bureau-zone"><div class="bureau-fenetre"><div class="bureau">${p.desk}</div></div></div></div>
${mobile}
<section class="gal-notes"><h2>Parti pris UX</h2><ul>${p.notes.map(n => `<li>${n}</li>`).join('')}</ul></section>
<script src="../_shared/view-switch.js"></script>
<script src="../_shared/bureau.js"></script>
<script src="../_shared/navigator.js"></script>
<script>if (window.self !== window.top) document.body.classList.add('is-embedded');</script>
</body>
</html>
`;
}

module.exports = { page, PAGES, DIRS };
