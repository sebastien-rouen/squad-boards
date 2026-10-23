/**
 * Index de la galerie Atlas : aperçu réel de chaque direction (iframe, vue mobile), liens vers ses
 * écrans, tableau de choix (point fort / limite / moment idéal) et décisions communes.
 */
const { esc } = require('./ui.cjs');
const { PAGES } = require('./page.cjs');

const ICON = { '01-atlas': '🏠', '02-sections': '📑', '03-modales': '🪟', '04-atelier': '⚡', '05-mobilite': '🧭' };

const card = d => `<article class="ix-card">
  <div class="ix-preview"><span class="ix-num">${d.num}</span><iframe src="${d.key}/01-atlas.html" title="Aperçu de la direction ${esc(d.name)}" loading="lazy" tabindex="-1"></iframe></div>
  <div class="ix-body"><span class="ix-tag ix-tag--${d.key}">Direction ${d.num}</span><h3>${d.icon || ''} ${esc(d.name)}</h3><p>${d.pitch || ''}</p><div class="ix-traits">${(d.traits || []).map(t => `<span>${t}</span>`).join('')}</div></div>
  <div class="ix-links">${PAGES.map(([k, l]) => `<a href="${d.key}/${k}.html"><i>${ICON[k]}</i>${l}<em>${k === '01-atlas' ? 'pleine page + desktop' : 'mobile + desktop'}</em></a>`).join('')}</div>
</article>`;

function index(dirs) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mockups — Atlas</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧬</text></svg>">
  <link rel="stylesheet" href="_shared/index.css">
  <link rel="stylesheet" href="index-theme.css">
</head>
<body>
  <header class="ix-hero">
    <span class="ix-eyebrow">Squad Board · refonte de l'Atlas</span>
    <h1>Atlas — quatre directions pour piloter les compétences</h1>
    <p>L'Atlas actuel empile une carte unFIX zoomable et une Skills Matrix, avec une douzaine de modales (comparaison, mobilité, catalogue, montée en compétence, « qui affecter ? »). Les quatre directions ci-dessous répondent au même cahier : <b>voir qui sait quoi</b>, <b>repérer les trous avant qu'ils coûtent</b>, <b>agir</b> (former, affecter, accompagner une mobilité). Même contenu partout — seul le parti pris change.</p>
    <p>Chaque direction est déclinée sur cinq pages : écran principal, sections, modales, atelier de staffing, mobilité. <b>Desktop par défaut</b> (bureau 1280 × 820 réduit), <b>mobile 390 × 760</b> via le commutateur 🖥️ / 📱 de la barre — choix mémorisé. Le panneau 🧭 en bas à droite bascule d'une direction à l'autre sur le même écran. Données fictives : 5 équipes, 26 personnes, 10 compétences.</p>
    <div class="ix-stats"><div><b>${dirs.length}</b><span>Directions</span></div><div><b>${dirs.length * PAGES.length}</b><span>Pages</span></div><div><b>${dirs.length * 24}</b><span>Écrans</span></div><div><b>0</b><span>Ligne du site touchée</span></div></div>
  </header>

  <section class="ix-sec">
    <h2>Les directions</h2>
    <p>L'aperçu de gauche est le mockup réel (vue mobile), à l'échelle. Cliquez sur un écran pour l'ouvrir.</p>
    <div class="ix-grid">${dirs.map(card).join('')}</div>
  </section>

  <section class="ix-sec">
    <h2>Tableau de choix</h2>
    <p>Ce que chacune fait mieux, ce qu'elle paie, et le moment où elle s'impose.</p>
    <div class="ix-scroll"><table class="ix-table">
      <thead><tr><th>Direction</th><th>Point fort</th><th>Limite</th><th>Moment idéal</th></tr></thead>
      <tbody>${dirs.map(d => `<tr><td>${d.num} · ${d.icon || ''} ${esc(d.name)}</td><td class="is-plus">${d.plus || ''}</td><td class="is-minus">${d.minus || ''}</td><td>${d.moment || ''}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>

  <section class="ix-sec">
    <h2>Ce que les quatre partagent</h2>
    <p>Décisions prises avant de dessiner, valables quelle que soit la direction retenue.</p>
    <div class="ix-principes">
      <div class="ix-principe"><i>🎨</i><b>Couleurs de données fixes</b><p>Niveau 1 gris, 2 bleu, 3 vert, 4 violet ; appétence forte = point ambre. Même code dans les quatre directions et dans le site actuel : on ne réapprend rien.</p></div>
      <div class="ix-principe"><i>🚨</i><b>Les trous sont nommés</b><p>« Kubernetes non couvert chez Delta », pas « 75 % ». Un signal dit quoi, qui, et propose une action (former, binôme, prêt).</p></div>
      <div class="ix-principe"><i>🔀</i><b>Simuler n'est pas décider</b><p>L'atelier de staffing est un mode visible (bandeau, fantôme), rien n'est enregistré ; la sortie est « Proposer au PI Planning ».</p></div>
      <div class="ix-principe"><i>🧭</i><b>La mobilité a sa page</b><p>Souhait → plan → suivi → bilan, avec l'effet sur la couverture de l'équipe et une relève proposée.</p></div>
      <div class="ix-principe"><i>🌴</i><b>Les absences comptent</b><p>Un sachant unique qui part en congés devient un signal daté, et « Qui affecter ? » tient compte de la charge et des absences.</p></div>
      <div class="ix-principe"><i>↩️</i><b>Rien d'irréversible</b><p>Retirer une compétence ne demande pas de confirmation : c'est immédiat, annulable, et les évaluations sont gardées 30 jours.</p></div>
    </div>
  </section>
</body>
</html>
`;
}

module.exports = { index };
