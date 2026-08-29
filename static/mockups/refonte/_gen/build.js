/**
 * Génère la galerie : 4 directions × 5 pages + index.html.
 *
 * IDEMPOTENT : chaque fichier est réécrit intégralement depuis les gabarits,
 * jamais enveloppé ou concaténé. Relancer ne change rien si rien n'a changé.
 *
 * Usage : node static/mockups/refonte/_gen/build.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./data');
const U = require('./ui-dash');
const P = require('./ui-pi');
const F = require('./ui-flows');
const V = require('./views');
const { DIRS } = require('./layouts');
const G = require('./pages');

const ROOT = path.resolve(__dirname, '..');
const write = (rel, content) => {
    const abs = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = abs + '.tmp';
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, abs);
    return abs;
};

/** Coquille desktop : sidebar (compacte pour le Cockpit) + topbar + contenu. */
const app = (dir, { active, title, pi = false, mode = '', body, noSide = false }) => F.shell({ active, title, pi, mode, body, compactSide: !!dir.compactSide, noSide });
const tvApp = (body) => `<div class="ui-app ui-app--tv"><main class="ui-content ui-content--tv">${body}</main></div>`;

/* ── 01 · Dashboard ──────────────────────────────────────────────────── */
const pageDashboard = (dir) => {
    const body = app(dir, { active: 'dashboard', title: 'Dashboard', body: dir.dashboard() });
    const { pins, legend } = G.annotations(dir, [['22%', '9%'], ['45%', '28%'], ['62%', '58%'], ['4%', '30%']]);
    return G.page({
        dir, DIRS, file: '01-dashboard.html', title: 'Dashboard', sub: G.PAGES[0].sub,
        body: `
  ${G.bureau('Dashboard · Vega · Ité 30.2', 'cliquez « 💡 Explications » en bas à droite', body, { annots: pins })}
  ${legend}
  ${G.phones('la même page à 390 px', [
        { tag: 'Sur le pouce', title: 'Dashboard mobile', why: 'La direction se replie en une colonne, dans l\'ordre de lecture du desktop. Sidebar → barre d\'onglets.', inner: body },
        { tag: 'État vide', title: 'Aucun sprint actif', why: 'Un état vide qui dit pourquoi et propose la suite, jamais un écran blanc.', inner: app(dir, { active: 'dashboard', title: 'Dashboard', body: V.emptyDashView(dir) }) },
    ])}`,
        notesList: [
            `<strong>${dir.strong}</strong>`,
            `Limite assumée : ${dir.limit}`,
            `Moment idéal : ${dir.moment}`,
            'Les composants (KPI, cartes, bande des sprints, listes) sont <strong>les mêmes dans les quatre directions</strong> — seul le pont de tokens <code>--ui-*</code> et la mise en page changent. C\'est ce qui rend la comparaison honnête.',
        ],
    });
};

/* ── 02 · PI · Rapports · Santé ──────────────────────────────────────── */
const pageSections = (dir) => {
    const piBody = app(dir, { active: 'pi', title: 'PI Planning', pi: true, body: dir.pi ? dir.pi() : V.piView(dir) });
    const featBody = app(dir, { active: 'pi', title: 'PI Planning', pi: true, body: V.piFeaturesView(dir) });
    const rptBody = app(dir, { active: 'reports', title: 'Rapports', pi: true, body: V.reportsView(dir) });
    const hBody = app(dir, { active: 'health', title: 'Santé', body: dir.health ? dir.health() : V.healthView(dir) });
    const emptyBody = app(dir, { active: 'pi', title: 'PI Planning', pi: true, body: V.emptyPiView(dir) });
    return G.page({
        dir, DIRS, file: '02-sections.html', title: 'PI · Rapports · Santé', sub: G.PAGES[1].sub,
        body: `
  ${G.bureau('PI Planning · Objectifs', 'burnup, capacité, dépendances, votes', piBody)}
  ${G.bureau('PI Planning · Features & calendrier', 'rang JIRA préservé', featBody)}
  ${G.bureau('Rapports · Sprint 30.1', 'copie Texte / Slack / Confluence', rptBody)}
  ${G.bureau('Santé', 'score, anomalies, matrice, votes', hBody)}
  ${G.bureau('État vide · PI #31 non planifié', 'l\'écran dit quoi faire', emptyBody)}
  ${G.phones('les trois vues à 390 px', [
        { tag: 'PI Planning', title: 'Objectifs & burnup', why: 'Les onglets deviennent un rail défilant ; la colonne latérale passe sous les objectifs.', inner: piBody },
        { tag: 'Rapports', title: 'Sprint 30.1', why: 'Le rapport d\'abord, les boutons de copie restent en tête ; l\'aperçu Slack passe en bas.', inner: rptBody },
        { tag: 'Santé', title: 'Score & anomalies', why: 'Le score en grand, les sept anomalies en tuiles ; la matrice défile horizontalement.', inner: hBody },
    ])}`,
        notesList: [
            'Le <strong>rapport de sprint</strong> distingue l\'engagement du réalisé : un ticket glissé (↪ 30.2) compte dans l\'engagement de 30.1, jamais dans son réalisé — la règle de <code>sprint-scope.js</code>, rendue visible.',
            'La <strong>matrice Santé</strong> teinte chaque case selon son poids dans la colonne, pas en valeur absolue : une équipe qui concentre les stagnants se voit même quand les chiffres sont petits.',
            'La <strong>capacité</strong> affiche ⚠ quand la base est un plafond (fenêtre au-delà des absences connues) — le chiffre n\'est jamais présenté sans sa réserve.',
        ],
    });
};

/* ── 03 · Modales ────────────────────────────────────────────────────── */
const pageModals = (dir) => {
    const backdrop = app(dir, { active: 'dashboard', title: 'Dashboard', body: dir.dashboard() });
    const withOverlay = (overlay) => `<div class="scr-clip">${backdrop}${overlay}</div>`;
    const popAt = (pop, x, y) => `<div class="ui-pop-anchor" style="--x:${x};--y:${y}">${pop}</div>`;
    return G.page({
        dir, DIRS, file: '03-modals.html', title: 'Modales', sub: G.PAGES[2].sub,
        body: `
  ${G.bureau('Nouveau ticket', 'raccourci N · Ctrl+Entrée pour créer', withOverlay(F.modalTicket()))}
  ${G.bureau('Objectif du PI', 'BV, engagement, features liées', withOverlay(F.modalObjective()))}
  ${G.bureau('Fist of Five', 'vote anonyme, moyenne dès 3 votes', withOverlay(F.modalFist()))}
  ${G.bureau('Suppression annulable', 'toast avec « Annuler » 8 s — et confirmDanger pour l\'irréversible', withOverlay(F.modalDanger() + F.toastUndo()))}
  ${G.bureau('Aide « ? » — schéma explicatif', 'bordure conique en spirale, fond surface-3', withOverlay(popAt(F.popLct(), '38%', '22%') + popAt(F.popScore(), '66%', '52%')))}
  ${G.bureau('Palette Ctrl+K', 'recherche sans accents, ancrée sur les libellés', withOverlay(F.cmdk()))}
  ${G.phones('les modales à 390 px', [
        { tag: 'Créer', title: 'Nouveau ticket', why: 'Plein écran sur mobile ; les segments (type, points) restent tactiles à 46 px.', inner: withOverlay(F.modalTicket()) },
        { tag: 'Voter', title: 'Fist of Five', why: 'Cinq grands boutons, un pouce suffit.', inner: withOverlay(F.modalFist()) },
        { tag: 'Annuler', title: 'Suppression', why: 'Le toast reste 8 s au-dessus de la barre d\'onglets.', inner: withOverlay(F.toastUndo()) },
        { tag: 'Comprendre', title: 'Aide « ? »', why: 'Le popover devient une feuille en bas d\'écran.', inner: withOverlay(popAt(F.popLct(), '4%', '30%')) },
    ])}`,
        notesList: [
            'Chaque modale porte <code>role="dialog" aria-modal="true"</code> et un titre lié ; le focus y est piégé (<code>trapFocus</code>) et rendu à la fermeture.',
            'La suppression d\'un ticket est <strong>annulable</strong> (toast 8 s) ; seule une action réellement irréversible — régénérer une rotation — passe par <code>confirmDanger</code> avec case à cocher.',
            'Les « ? » ouvrent un <strong>schéma</strong>, pas un paragraphe : lead time vs cycle time, calcul du score, base de capacité, rollup d\'objectif.',
        ],
    });
};

/* ── 04 · En séance ──────────────────────────────────────────────────── */
const pageLive = (dir) => {
    const daily = app(dir, { active: 'board', title: 'Board', mode: '▶ Daily', body: V.dailyView(dir) });
    const session = app(dir, { active: 'pi', title: 'PI Planning', pi: true, mode: '🔴 Séance', body: V.sessionView(dir) });
    const sync = app(dir, { active: 'dashboard', title: 'Dashboard', body: V.syncView(dir) });
    const failed = app(dir, { active: 'dashboard', title: 'Dashboard', body: V.syncView(dir, { failed: true }) });
    const offline = app(dir, { active: 'dashboard', title: 'Dashboard', body: V.offlineView(dir) });
    const bilan = app(dir, { active: 'reports', title: 'Rapports', body: V.bilanView(dir) });
    return G.page({
        dir, DIRS, file: '04-live.html', title: 'En séance', sub: G.PAGES[3].sub,
        body: `
  ${G.bureau('Daily · 15 min', 'board seul, graphes repliés, chrono', daily)}
  ${G.bureau('PI Planning en salle', 'vote de confiance en direct', session)}
  ${G.bureau('Import JIRA en cours', 'les chiffres d\'hier restent lisibles, marqués comme tels', sync)}
  ${G.bureau('Jeton JIRA expiré', '401 = panne d\'auth, jamais « aucune donnée »', failed)}
  ${G.bureau('Hors ligne', 'dernier état connu, squelettes pour ce qui manque', offline)}
  ${G.bureau('Sprint clos', 'le rapport se génère seul', bilan)}
  ${G.phones('en séance, à 390 px', [
        { tag: 'Daily', title: 'Chrono & board', why: 'Le chrono reste en tête, les colonnes défilent horizontalement.', inner: daily },
        { tag: 'Import', title: 'Sync JIRA', why: 'La carte de progression prend la largeur ; le rapport d\'incidents ne se ferme jamais seul.', inner: failed },
        { tag: 'Hors ligne', title: 'Dernier état', why: 'Le bandeau dit depuis quand, et propose de réessayer.', inner: offline },
    ])}`,
        notesList: [
            'Un <strong>401/403</strong> est raconté comme une panne d\'authentification : le bandeau nomme le board, propose de renouveler le jeton, et la carte d\'import liste les trois opérations en échec — jamais un import « réussi mais creux ».',
            'Pendant un import, le Dashboard <strong>reste lisible</strong> avec les chiffres de la dernière sync, datés. On ne vide pas un écran pour le remplir 2 minutes plus tard.',
            'La <strong>séance de PI Planning</strong> montre le vote se remplir en direct ; un vote ≤ 2 ouvre la discussion avant de passer à l\'équipe suivante.',
        ],
    });
};

/* ── 05 · Mode TV ────────────────────────────────────────────────────── */
const pageTv = (dir) => G.page({
    dir, DIRS, file: '05-tv.html', title: 'Mode TV', sub: G.PAGES[4].sub,
    body: `
  ${G.tv('Dashboard', 'écran 1/4 de la rotation', tvApp(V.tvDashboard(dir)))}
  ${G.tv('Santé du train', 'écran 2/4', tvApp(V.tvHealth(dir)))}
  ${G.tv('PI Planning', 'écran 3/4', tvApp(V.tvPi(dir)))}
  ${G.tv('Sprint review', 'écran 4/4', tvApp(V.tvReports(dir)))}`,
    notesList: [
        'Le mode TV est <strong>sans chrome</strong> : ni sidebar, ni recherche, ni boutons — un titre, l\'heure, et les points de rotation. Il se lance par le ⊞ de l\'en-tête PI ou l\'URL <code>#tv</code>.',
        'Le contenu est agrandi par <code>zoom: 1.4</code> sur le cadre 1920 px (≈ 1370 px effectifs) : la mise en page desktop, à la taille d\'une TV. Les chiffres se lisent à trois mètres.',
        'La rotation (30 s) se met en pause au survol ou à la touche Espace ; l\'écran « Santé » saute en tête dès qu\'un blocker > 48 h apparaît.',
    ],
});

/* ── Index ───────────────────────────────────────────────────────────── */
const index = () => `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refonte visuelle — 4 directions · Squad Board</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📋</text></svg>">
  <link rel="stylesheet" href="_shared/index.css">
  <link rel="stylesheet" href="index-theme.css">
</head>
<body>
  <header class="ix-hero">
    <span class="ix-eyebrow">Squad Board · exploration UI · desktop &amp; TV</span>
    <h1>Refonte visuelle — quatre directions</h1>
    <p>Quatre partis pris de mise en page pour simplifier le pilotage : le Dashboard, le PI Planning, les rapports de sprint et la santé des équipes en un coup d'œil. Même contenu partout — seules l'identité et l'organisation changent, pour que la comparaison soit honnête.</p>
    <p>Chaque direction est déclinée sur cinq pages : le Dashboard (desktop + mobile), les trois autres vues, les modales, le mode « en séance » et le mode TV 1920 × 1080. Le panneau 🎛️ en bas à droite de chaque page permet de sauter d'une direction à l'autre <b>sur le même écran</b>, de basculer le thème et d'afficher les <b>💡 explications</b> — des pastilles numérotées qui disent pourquoi chaque zone est là.</p>
    <p><strong>Les pages démarrent en sombre</strong> (c'est le mode d'un écran mural) ; le bouton ☀️ bascule en clair, le thème par défaut du site.</p>
    <div class="ix-stats"><div><b>4</b><span>Directions</span></div><div><b>${DIRS.reduce((s, d) => s + G.pagesOf(d).length, 0)}</b><span>Pages</span></div><div><b>${DIRS.length * 30 + 44}</b><span>Écrans</span></div><div><b>× 2</b><span>Thèmes</span></div><div><b>3</b><span>Tailles</span></div></div>
  </header>

  <section class="ix-sec">
    <h2>Les quatre directions</h2>
    <p>L'aperçu est le Dashboard réel, en desktop, à l'échelle. Cliquez un écran pour l'ouvrir en pleine page.</p>
    <div class="ix-grid">
      ${DIRS.map((d) => `
      <article class="ix-card${d.preferred ? ' ix-card--retenue' : ''}">
        <div class="ix-preview"><span class="ix-num">${d.id}</span><iframe src="${d.dir}/01-dashboard.html" title="Aperçu — ${d.name}" loading="lazy" tabindex="-1"></iframe></div>
        <div class="ix-body">
          <h3>${d.emoji} ${d.name}${d.preferred ? ' <span class="ix-retenue">Préférée · approfondie</span>' : ''}</h3>
          <p>${d.tagline}</p>
          <p><b>Point fort.</b> ${d.strong}</p>
          <p><b>Limite.</b> ${d.limit}</p>
          ${d.preferred ? '<p class="ix-ecart">🌤️ Direction préférée le 2026-08-29 : sept pages d\'approfondissement (fiche équipe, prévisions, board, paramètres, cas limites, aide, TV) — l\'avis est dans le README.</p>' : ''}
          <div class="ix-traits">${d.traits.map((t) => `<span>${t}</span>`).join('')}</div>
        </div>
        <nav class="ix-links">
          ${G.PAGES.map((p, i) => `<a href="${d.dir}/${p.file}"><i>${['📊', '🗂️', '✏️', '🔴', '📺'][i]}</i>${p.nav}<em>${['desktop + mobile', '5 écrans + mobile', '6 écrans + mobile', '6 écrans + mobile', '4 écrans TV'][i]}</em></a>`).join('\n          ')}
          ${(d.extraPages || []).map((p) => `<a href="${d.dir}/${p.file}"><i>${p.icon}</i>${p.nav}<em>${p.count}</em></a>`).join('\n          ')}
        </nav>
      </article>`).join('')}
    </div>
  </section>

  <section class="ix-sec">
    <h2>Choisir</h2>
    <p>Une direction par usage dominant — la question n'est pas « laquelle est la plus belle » mais « devant quel écran, avec qui ».</p>
    <div class="ix-scroll"><table class="ix-table">
      <thead><tr><th>Direction</th><th>Point fort</th><th>Limite</th><th>Moment idéal</th></tr></thead>
      <tbody>${DIRS.map((d) => `<tr><td>${d.emoji} ${d.name}</td><td>${d.strong}</td><td>${d.limit}</td><td>${d.moment}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>

  <section class="ix-sec">
    <h2>Ce qui ne change pas</h2>
    <div class="ix-principes">
      <div class="ix-principe"><i>🧱</i><b>Mêmes composants partout</b><p>KPI, cartes, bande des sprints, matrice, rapport : écrits une fois dans <code>_shared/</code> sur les tokens <code>--ui-*</code>. Une direction ne fait qu'arranger et habiller.</p></div>
      <div class="ix-principe"><i>🎨</i><b>Les vrais tokens du site</b><p>Chaque page charge <code>static/css/tokens.css</code> : couleurs de statut, espacements, rayons sont ceux de Squad Board. Rien n'est inventé qu'il faudrait re-porter.</p></div>
      <div class="ix-principe"><i>❓</i><b>Expliquer par le dessin</b><p>Chaque « ? » ouvre un schéma (lead vs cycle, score, capacité, rollup). Les 💡 explications de chaque page disent pourquoi une zone est là.</p></div>
      <div class="ix-principe"><i>📐</i><b>Aucune requête média</b><p>Desktop, TV et mobile cohabitent sur une même page : la disposition est portée par la classe du cadre, jamais par la largeur de la fenêtre.</p></div>
    </div>
  </section>

  <footer class="ix-foot">Maquettes statiques — aucun appel API, aucune donnée réelle (équipes et personnes du jeu de démo). Générées par <code>_gen/build.js</code>, vérifiées par <code>_gen/verify.js</code>. Le README du dossier porte l'avis argumenté.</footer>
</body>
</html>
`;

/* ── Exécution ───────────────────────────────────────────────────────── */
let n = 0;
for (const dir of DIRS) {
    for (const [file, fn] of [['01-dashboard.html', pageDashboard], ['02-sections.html', pageSections], ['03-modals.html', pageModals], ['04-live.html', pageLive], ['05-tv.html', pageTv]]) {
        write(path.join(dir.dir, file), fn(dir));
        n += 1;
    }
    // Pages d'approfondissement propres à une direction (la Météo en a sept)
    for (const ep of dir.extraPages || []) {
        write(path.join(dir.dir, ep.file), ep.build(dir, DIRS));
        n += 1;
    }
}
write('index.html', index());
console.log(`  ${n + 1} pages écrites dans ${path.relative(process.cwd(), ROOT).replace(/\\/g, '/')}/`);
