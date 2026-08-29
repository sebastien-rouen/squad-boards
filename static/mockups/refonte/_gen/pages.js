/**
 * Gabarits de PAGE et de CADRE de la galerie.
 *
 * - `.bureau` : 1280 × 820, réduit par `bureau.js` pour tenir dans la largeur.
 * - `.tv`     : 1920 × 1080, même mécanique (`data-w`/`data-h` sur la fenêtre).
 * - `.phone`  : 390 × 760, rail horizontal.
 *
 * Aucune requête média : la disposition large est portée par la classe du
 * cadre (`.bureau .ui-app`, `.tv .ui-app`), jamais par la largeur de la fenêtre.
 */
const F = require('./ui-flows');

const PAGES = [
    { file: '01-dashboard.html', nav: 'Dashboard', title: 'Dashboard', sub: 'L\'écran principal : desktop, puis mobile pour vérifier que la direction tient aux deux tailles.' },
    { file: '02-sections.html', nav: 'PI · Rapports · Santé', title: 'PI Planning, Rapports, Santé', sub: 'Les trois autres vues de pilotage, et un état vide utile.' },
    { file: '03-modals.html', nav: 'Modales', title: 'Modales & aide', sub: 'Créer, éditer, voter, supprimer sans casser — et le « ? » qui explique par un schéma.' },
    { file: '04-live.html', nav: 'En séance', title: 'Pendant que ça se passe', sub: 'Daily, PI Planning en salle, import JIRA, panne d\'auth, hors ligne, sprint clos.' },
    { file: '05-tv.html', nav: 'Mode TV', title: 'Mode TV — 1920 × 1080', sub: 'Sans chrome, en rotation : ce que l\'écran mural affiche seul, à trois mètres.' },
];

/** Feuilles d'une page : tokens du site → composants → identité (+ approfondissement) → chrome. */
const CSS_LINKS = (extra = []) => [
    '../../../css/tokens.css',
    '../_shared/ui.css', '../_shared/ui-pi.css', '../_shared/ui-health.css', '../_shared/ui-flows.css', '../_shared/ui-pages.css',
    'style.css', ...extra,
    '../_shared/gallery.css', '../_shared/bureau.css', '../_shared/overlay.css',
].map((h) => `  <link rel="stylesheet" href="${h}">`).join('\n');

/** Les pages d'une direction : les cinq communes + ses approfondissements. */
const pagesOf = (dir) => PAGES.concat(dir.extraPages || []);

const galNav = (current, dir) => `
    <nav class="gal-nav">
      ${pagesOf(dir).map((p) => `<a href="${p.file}"${p.file === current ? ' aria-current="page"' : ''}>${p.nav}</a>`).join('\n      ')}
    </nav>`;

const themeScript = `
  <script>
    /* Aperçu iframe de l'index : seul le premier cadre doit apparaître */
    if (window.self !== window.top) document.body.classList.add('is-embedded');
    /* Le site démarre en clair, la TV se lit en sombre : chaque direction doit tenir dans les deux. */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.gal-theme, .fcp-theme')) return;
      const racine = document.documentElement;
      const versClair = racine.getAttribute('data-theme') !== 'light';
      racine.setAttribute('data-theme', versClair ? 'light' : 'dark');
      document.querySelectorAll('.gal-theme').forEach((b) => { b.textContent = versClair ? '🌙 Voir en sombre' : '☀️ Voir en clair'; });
    });
  </script>`;

/** Cadre desktop 1280 × 820. */
const bureau = (title, sub, inner, { annots = '' } = {}) => `
  <div class="gal-group gal-group--vue">🖥️ Desktop — ${title} <small>1280 × 820, réduit pour tenir${sub ? ' · ' + sub : ''}</small></div>
  <div class="bureau-zone">
    <div class="bureau-fenetre" data-w="1280" data-h="820">
      <div class="bureau screen">
        <div class="desk">${inner}</div>
        ${annots}
      </div>
    </div>
  </div>`;

/** Cadre TV 1920 × 1080. */
const tv = (title, sub, inner) => `
  <div class="gal-group gal-group--vue">📺 TV — ${title} <small>1920 × 1080, réduit pour tenir${sub ? ' · ' + sub : ''}</small></div>
  <div class="bureau-zone">
    <div class="bureau-fenetre bureau-fenetre--tv" data-w="1920" data-h="1080">
      <div class="bureau tv screen">
        <div class="desk">${inner}</div>
      </div>
    </div>
  </div>`;

/** Rail de téléphones. `items` = [{tag, title, why, inner}]. */
const phones = (label, items) => `
  <div class="gal-group gal-group--vue">📱 Mobile — ${label} <small>390 × 760 — faites défiler horizontalement</small></div>
  <div class="gal-rail">
    ${items.map((it) => `
    <figure class="phone">
      ${it.tag ? `<span class="phone-tag">${it.tag}</span>` : ''}
      <div class="phone-frame"><div class="screen">${it.inner}</div></div>
      <figcaption><b>${it.title}</b><span>${it.why}</span></figcaption>
    </figure>`).join('')}
  </div>`;

/** Notes de conception (bloc « Parti pris UX »). */
const notes = (items) => `
  <section class="gal-notes"><h2>Parti pris UX</h2><ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></section>`;

/** Panneau de contrôle flottant (bas droite) : direction, page, thème, explications. */
const fcp = (dir, current, DIRS) => `
  <aside class="fcp" aria-label="Panneau de navigation des maquettes">
    <button class="fcp-toggle" type="button" aria-expanded="true" title="Replier">🎛️</button>
    <div class="fcp-bd">
      <div class="fcp-row"><small>Direction</small><div class="fcp-btns">${DIRS.map((d) => `<a class="fcp-btn${d.dir === dir.dir ? ' is-active' : ''}" href="../${d.dir}/${pagesOf(d).some((p) => p.file === current) ? current : '01-dashboard.html'}" title="${d.name}${pagesOf(d).some((p) => p.file === current) ? '' : ' — cette page n\'existe que pour la direction approfondie'}">${d.emoji} ${d.id}</a>`).join('')}</div></div>
      <div class="fcp-row"><small>Écran</small><div class="fcp-btns fcp-btns--col">${pagesOf(dir).map((p) => `<a class="fcp-btn${p.file === current ? ' is-active' : ''}" href="${p.file}">${p.nav}</a>`).join('')}</div></div>
      <div class="fcp-row"><small>Affichage</small><div class="fcp-btns"><button class="fcp-btn fcp-theme" type="button">🌓 Thème</button><button class="fcp-btn fcp-annot" type="button" aria-pressed="false">💡 Explications</button></div></div>
      <div class="fcp-row"><a class="fcp-btn" href="../index.html">↖ Galerie</a></div>
    </div>
  </aside>`;

const page = ({ dir, DIRS, file, title, sub, body, notesList = [] }) => `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mockup ${dir.id} — ${dir.name} — ${title}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📋</text></svg>">
${CSS_LINKS(dir.extraCss || [])}
</head>
<body class="gallery" data-dir="${dir.dir}">
${themeScript}

  <header class="gal-head">
    <div class="gal-head-top">
      <a class="gal-back" href="../index.html">← Toutes les directions</a>
      <button class="gal-theme" type="button">☀️ Voir en clair</button>
    </div>
    <h1>${dir.emoji} Mockup ${dir.id} — ${dir.name} · ${title}</h1>
    <p class="gal-sub">${dir.tagline} ${sub}</p>
  </header>
${galNav(file, dir)}

${body}

${notesList.length ? notes(notesList) : ''}
${fcp(dir, file, DIRS)}

  <script src="../_shared/bureau.js"></script>
  <script src="../_shared/overlay.js"></script>
</body>
</html>
`;

/** Pastilles d'annotation + légende (affichées via « 💡 Explications »). */
const annotations = (dir, positions) => ({
    pins: positions.map(([x, y], i) => F.annot(i + 1, x, y)).join(''),
    legend: `<div class="gal-annot-legend">${F.annotLegend(dir.annots)}</div>`,
});

module.exports = { PAGES, pagesOf, page, bureau, tv, phones, notes, annotations };
