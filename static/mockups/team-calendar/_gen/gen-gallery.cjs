// Générateur IDEMPOTENT de la galerie static/mockups/team-calendar/ (réécrit chaque page en entier).
const fs = require('fs');
const path = require('path');
const ROOT = 'Z:/drafts/squad-boards/static/mockups/team-calendar';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const q = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const TEAMS = ['Ami', 'Bellier', 'Caméléon', 'Dezir', 'Etoile', 'Fuego', 'Gabbiano', 'Helica', 'Initiale', 'Juke', 'Kadjar', 'Lion', 'Océane'];

const DIRS = [
    { key: 'hybrid', dir: 'd-synthese', L: 'D', name: 'Synthèse', tag: 'La clarté de A, le sprint entier de B',
      pitch: "Retenue après avis : « Semaine » montre la grille horaire de A, « Itération » les couloirs de B — le sélecteur choisit la période ET la représentation, comme Jour / Semaine / Mois des agendas standard. Un clic sur un jour de l'itération ouvre sa semaine ; « Tout le sprint » en revient.",
      strong: 'Heure exacte ET vue du sprint, sans rien réapprendre', limit: 'Deux représentations à maintenir (mais aucune nouvelle : A et B telles quelles)', when: 'Tous les jours (semaine) et en préparation de rétro ou de PI Planning (itération)' },
    { key: 'week', dir: 'a-semaine', L: 'A', name: 'Semaine', tag: 'La grille horaire standard',
      pitch: "Le format que tout le monde lit sans apprendre : Google Agenda, Outlook. Jours en colonnes, heures en lignes, bandeau pour le support et les absences, ligne rouge « maintenant ».",
      strong: 'Zéro apprentissage ; les conflits d’horaire se voient', limit: 'Comparer plus de 2 équipes serre les colonnes', when: 'Organiser sa semaine, trouver un créneau' },
    { key: 'lanes', dir: 'b-couloirs', L: 'B', name: 'Couloirs', tag: 'Une ligne par équipe',
      pitch: "La frise « ressources » (Teams Shifts, Gantt) : une ligne par équipe, une colonne par jour ouvré de l'itération. Les démos, rétros et plannings s'alignent verticalement d'une équipe à l'autre.",
      strong: 'Comparer : le rythme de 3 équipes d’un coup d’œil', limit: 'L’heure exacte passe au second plan', when: 'PI Planning, rétro de train, harmoniser les cadences' },
    { key: 'mosaic', dir: 'c-mosaique', L: 'C', name: 'Mosaïque', tag: "L'itération en cases",
      pitch: "Le mois condensé sur l'itération (Apple Calendrier, Notion) : une case par jour ouvré avec les jalons, et l'agenda du jour sélectionné à côté. Le plus calme ; se transpose naturellement en mobile.",
      strong: 'Lisible d’un coup d’œil, excellent en mobile', limit: 'Les chevauchements horaires ne se voient pas', when: 'Consulter, préparer la journée, écran d’accueil' },
];

const PAGES = [
    { f: '01-principal.html', n: '01 Principal', title: "Écran principal",
      lead: "La page Équipe de Gabbiano, carte « Agenda de l'équipe » insérée sous l'en-tête. Données réelles de l'agenda ICS, rangées automatiquement.",
      desk: d => d.key === 'hybrid' ? [
            { o: { team: 'Gabbiano', period: 'week' }, cap: '<b>Semaine — la clarté de A</b> : grille horaire, rétro du train lundi, démo vendredi, ligne « maintenant ». Le sélecteur en tête bascule sur l’itération.' },
            { o: { team: 'Gabbiano', period: 'iteration' }, cap: '<b>Itération — le sprint entier de B</b> : 10 jours ouvrés d’un coup d’œil ; la semaine en cours est encadrée, un clic sur un jour l’ouvre en grille horaire.' },
        ] : [{ o: { team: 'Gabbiano' }, cap: `<b>Vue ${d.name.toLowerCase()}</b> — ${d.key === 'week' ? 'semaine du 28 sept., rétro du train lundi, démo vendredi' : "itération 31.2 de Gabbiano, 10 jours ouvrés"}. Filtres de nature en chips, portées Équipe / Groupe / Train (Opérations masqué par défaut : trop bruyant).` }],
      mob: d => d.key === 'hybrid' ? [
            { o: { team: 'Gabbiano', period: 'week' }, cap: '<b>Semaine</b> : vue Jour et sélecteur de jours.' },
            { o: { team: 'Gabbiano', period: 'iteration' }, cap: '<b>Itération</b> : un jour à la fois, les 10 jours dans le sélecteur.' },
        ] : [{ o: { team: 'Gabbiano' }, cap: d.key === 'mosaic' ? '<b>Cases à pastilles</b> + agenda du jour dessous.' : '<b>Un jour à la fois</b> — sélecteur de jours, standard des applis d’agenda.' },
                 { o: { team: 'Gabbiano', period: d.key === 'week' ? 'iteration' : 'week' }, cap: `Même vue en <b>${d.key === 'week' ? 'itération' : 'semaine'}</b> (bascule en tête de carte).` }],
      ux: ["<b>Deux axes, pas un</b> : la couleur dit la <b>nature</b> (daily, démo, support…), l'étiquette dit la <b>portée</b> (équipe, groupe, train). La démo du train et la répétition de l'équipe ont la même couleur, pas la même portée.",
           "<b>Les gens ne sont pas des réunions</b> : support et absences vivent dans un bandeau « Journée » (prénoms), jamais dans la grille, et ne comptent pas dans la charge.",
           "<b>Le pied de carte rend des comptes</b> : charge de réunions (base 7 h/jour affichée), taux de détection, fraîcheur de la synchronisation."] },
    { f: '02-comparer.html', n: '02 Comparer', title: 'Comparer avec d’autres équipes',
      lead: "« Comparer » ouvre une liste à cocher (le motif « Autres agendas » de Google Agenda). Les équipes cochées deviennent des pastilles retirables. Le train n'est dessiné qu'une fois, dans un couloir « Commun ».",
      desk: () => [{ o: { team: 'Gabbiano', cmp: 'Fuego', pop: '1' }, cap: '<b>La liste à cocher</b> — recherche, couleur de chaque équipe, volume d’évènements, « sans agenda » signalé. Plafond à 3 : au-delà, illisible.' },
                   { o: { team: 'Gabbiano', cmp: 'Fuego,Helica' }, cap: '<b>Trois équipes + Commun</b> — les évènements du train (démo d’itération, CoP, PI Planning) sont regroupés une seule fois au lieu d’être triplés.' }],
      mob: () => [{ o: { team: 'Gabbiano', cmp: 'Fuego,Helica' }, cap: '<b>Comparaison mobile</b> — mêmes couleurs d’équipe, une section par équipe.' },
                  { o: { team: 'Gabbiano', cmp: 'Fuego', pop: '1' }, cap: 'La liste à cocher devient une <b>feuille du bas</b> (bottom sheet).' }],
      ux: ["<b>Cocher plutôt que choisir</b> : la case à cocher dit « en plus de la mienne » ; un sélecteur remplacerait l'équipe courante.",
           "<b>Le commun une seule fois</b> : sans ce couloir, comparer 3 équipes triple la démo d'itération et le PI Planning — le bruit masque les vraies différences.",
           "<b>3 équipes au plus</b> : case grisée au-delà, avec l'explication en infobulle — pas une erreur après coup."] },
    { f: '03-fiche.html', n: '03 Fiche & positionner', title: 'Fiche d’évènement et positionnement manuel',
      lead: "Un clic ouvre la fiche : horaires, agenda source, nature et portée, et « Classer comme… ». Corriger un évènement range TOUS ceux du même titre, dans toutes les équipes — le détecteur apprend.",
      desk: () => [{ o: { team: 'Gabbiano', select: 'Gabbiano - Rétro@2026-10-02' }, cap: '<b>Fiche d’un évènement détecté</b> — « 🧭 détecté automatiquement », portée, agenda source.' },
                   { o: { team: 'Helica', select: '(🪄✨)@2026-09-25', day: '2026-09-25' }, lock: 1, cap: '<b>Positionner à la main</b> — « (🪄✨) » (21 occurrences chez Helica) n’est pas devinable : on le range, la règle vaut pour tous.' },
                   { o: { team: 'Helica', banner: 'learned', day: '2026-09-25' }, lock: 1, cap: '<b>Confirmation annulable</b> — bandeau informatif avec « Annuler », les blocs corrigés portent un ✎.' }],
      mob: () => [{ o: { team: 'Helica', select: '(🪄✨)@2026-09-25', day: '2026-09-25' }, lock: 1, cap: 'La fiche devient une <b>feuille du bas</b>, pouce-accessible.' }],
      ux: ["<b>Positionner = corriger une règle, pas un évènement</b> : sinon la correction disparaît au prochain import ICS.",
           "<b>Toujours dire d'où vient la nature</b> : « détecté automatiquement » ou « rangé à la main », avec « Revenir à la détection ».",
           "<b>Annulable plutôt que confirmé</b> : pas de modale « Êtes-vous sûr ? », un bandeau avec Annuler."] },
    { f: '04-etats.html', n: '04 États', title: 'États : masqué, sans agenda, chargement, périmé, vide, erreur',
      lead: "Les cas réels, pas des hypothèses : Lion partage son agenda en « disponibilités seulement » (37 créneaux « Busy » sur 37), Etoile n'a aucun agenda relié.",
      desk: () => [{ o: { team: 'Lion', banner: 'masked', day: '2026-09-21' }, lock: 1, cap: '<b>Détails masqués (Lion)</b> — hachuré, 🔒, et le bandeau dit comment régler le partage.' },
                   { o: { team: 'Etoile', state: 'noical' }, lock: 1, cap: '<b>Sans agenda (Etoile, Océane)</b> — un état vide utile, avec l’action.' },
                   { o: { team: 'Gabbiano', state: 'loading' }, cap: '<b>Chargement</b> — squelette à la forme de la vue.' },
                   { o: { team: 'Gabbiano', state: 'stale', banner: 'stale' }, cap: '<b>Périmé</b> — on montre ce qu’on a, point orange et bandeau.' },
                   { o: { team: 'Gabbiano', state: 'empty' }, cap: '<b>Vide après filtres</b> — « Réinitialiser les filtres ».' },
                   { o: { team: 'Gabbiano', state: 'error' }, cap: '<b>Erreur ICS</b> — cause probable et où la corriger.' }],
      mob: () => [{ o: { team: 'Lion', banner: 'masked', day: '2026-09-21' }, lock: 1, cap: 'Lion, détails masqués.' },
                  { o: { team: 'Etoile', state: 'noical' }, lock: 1, cap: 'Etoile, sans agenda.' },
                  { o: { team: 'Gabbiano', state: 'loading' }, cap: 'Chargement.' }],
      ux: ["<b>Un état = une cause + une action</b> : « partager avec tous les détails », « relier un agenda », « réinitialiser les filtres ».",
           "<b>Périmé n'est pas bloquant</b> : un agenda d'hier reste utile ; on le dit, on ne le cache pas.",
           "<b>Le masqué reste visible</b> : Lion est occupé, on ne sait juste pas à quoi — l'information de charge demeure."] },
    { f: '05-zoom.html', n: '05 Zoom', title: 'Du sprint à la semaine, et retour', for: ['hybrid'],
      lead: "Le geste qui relie A et B : on repère dans l'itération le jour qui intrigue, on l'ouvre en grille horaire pour l'heure exacte, on revient au sprint. Les filtres et les équipes comparées suivent.",
      desk: () => [{ o: { team: 'Gabbiano', cmp: 'Fuego', period: 'iteration', day: '2026-10-01' }, cap: '<b>1. Repérer</b> — itération comparée avec Fuego ; la semaine du 28 sept. est encadrée, l’en-tête de chaque jour porte une loupe au survol.' },
                   { o: { team: 'Gabbiano', cmp: 'Fuego', period: 'week', day: '2026-10-01' }, cap: '<b>2. Zoomer</b> — même comparaison, en grille horaire : le fil « ↩ Tout le sprint 31.2 · semaine 2 sur 2 » dit où l’on est et comment revenir.' },
                   { o: { team: 'Helica', period: 'week', day: '2026-09-25', select: '(🪄✨)@2026-09-25' }, lock: 1, cap: '<b>3. Agir</b> — la fiche et « Classer comme… » marchent pareil dans les deux vues.' }],
      mob: () => [{ o: { team: 'Gabbiano', period: 'iteration', day: '2026-10-01' }, cap: 'Itération : un jour à la fois.' },
                  { o: { team: 'Gabbiano', period: 'week', day: '2026-10-01' }, cap: 'Semaine : le fil de retour passe en pleine largeur, 44 px.' }],
      ux: ["<b>Une bascule, pas deux pages</b> : le sélecteur Semaine / Itération change la période ET la représentation — le modèle mental de Jour / Semaine / Mois.",
           "<b>Le zoom se prévisualise</b> : la semaine qu'ouvrira le clic est déjà encadrée dans l'itération.",
           "<b>Le contexte voyage</b> : filtres de nature, portées, équipes comparées et fiche ouverte sont conservés d'une vue à l'autre.",
           "<b>Aucune troisième implémentation</b> : D réutilise A et B telles quelles — ce qui est corrigé dans l'une profite à la synthèse."] },
];

const frameSrc = (d, o) => `../frame.html?${q({ dir: d.key, ...o })}`;
const fcp = (d, page) => `
<aside class="gal-fcp" aria-label="Panneau de démo">
    <button class="gal-fcp-toggle" type="button">🎛️ Démo</button>
    <label>Équipe affichée<select data-team><option value="">(celle de l'écran)</option>${TEAMS.map(t => `<option>${t}</option>`).join('')}</select></label>
    <button class="gal-fcp-btn" type="button" data-theme-toggle>🌓 Thème clair / sombre</button>
    <label>Direction</label>
    <div class="gal-fcp-dirs">${DIRS.filter(x => !page.for || page.for.includes(x.key)).map(x => `<a href="../${x.dir}/${page.f}" aria-current="${x.key === d.key}">${x.L}</a>`).join('')}</div>
</aside>`;

function dirPage(d, page) {
    const desks = page.desk(d);
    const mobs = page.mob(d);
    return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${d.L} · ${d.name} — ${esc(page.title)}</title>
<link rel="stylesheet" href="../../../css/tokens.css">
<link rel="stylesheet" href="../_shared/gallery.css">
</head>
<body class="gallery">
<!-- GÉNÉRÉ par gen-gallery.cjs — ne pas éditer à la main (voir README.md) -->
<header class="gal-head">
    <a href="../index.html">← Galerie « Calendrier de l'équipe »</a>
    <h1>${d.L} · ${d.name} — ${esc(page.title)}</h1>
    <p>${page.lead}</p>
</header>
<nav class="gal-nav" aria-label="Écrans">
    ${PAGES.filter(p => !p.for || p.for.includes(d.key)).map(p => `<a href="${p.f}"${p.f === page.f ? ' aria-current="page"' : ''}>${p.n}</a>`).join('')}
    <span class="gal-spacer"></span><a href="../detection.html">🧭 Détecteur</a>
</nav>
<main class="gal-main">
    <div class="gal-group">🖥️ Desktop — 1280 × 820, réduit pour tenir</div>
    <div class="gal-desks${desks.length > 3 ? ' gal-desks--2' : ''}">
        ${desks.map(x => `<figure class="bureau-fig"><div class="bureau-fenetre"><iframe class="bureau" data-src="${esc(frameSrc(d, x.o))}"${x.lock ? ' data-teamlock="1"' : ''} title="Desktop" loading="lazy"></iframe></div><figcaption>${x.cap}</figcaption></figure>`).join('\n        ')}
    </div>
    <div class="gal-group">📱 Mobile — 390 × 760</div>
    <div class="gal-rail">
        ${mobs.map(x => `<figure class="phone"><iframe data-src="${esc(frameSrc(d, x.o))}"${x.lock ? ' data-teamlock="1"' : ''} title="Mobile" loading="lazy"></iframe><figcaption>${x.cap}</figcaption></figure>`).join('\n        ')}
    </div>
    <section class="gal-ux"><h2>Parti pris UX</h2><ul>${page.ux.map(u => `<li>${u}</li>`).join('')}</ul></section>
</main>
${fcp(d, page)}
<script src="../_shared/gallery.js"></script>
</body>
</html>
`;
}

function indexPage() {
    return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Calendrier de l'équipe — galerie</title>
<link rel="stylesheet" href="../../css/tokens.css">
<link rel="stylesheet" href="_shared/gallery.css">
</head>
<body class="gallery">
<!-- GÉNÉRÉ par gen-gallery.cjs — ne pas éditer à la main (voir README.md) -->
<header class="gal-head">
    <a href="../">← Maquettes Squad Board</a>
    <h1>📅 Calendrier de l'équipe — détecter, voir, comparer</h1>
    <p>Sur la page <b>#team/{équipe}</b> : les évènements de l'agenda Google de l'équipe, <b>rangés automatiquement</b>
       (97,3 % des 3 580 évènements réels), affichés sur un calendrier, et <b>comparables</b> avec d'autres équipes à cocher.
       Trois directions explorées, puis <b>D · Synthèse retenue</b> (la clarté de A, le sprint entier de B), desktop et mobile, sur les vraies données des 13 équipes.</p>
</header>
<nav class="gal-nav" aria-label="Sections">
    <a href="#directions" aria-current="page">Directions</a><a href="detection.html">🧭 Détecteur (comment ça range)</a><a href="#choisir">Choisir</a>
    <span class="gal-spacer"></span><a href="README.md">README</a>
</nav>
<main class="gal-main">
    <div class="ix-callout">💡 <b>Le cœur n'est pas la vue, c'est le rangement.</b> Chaque évènement reçoit une <b>nature</b> (déduite du titre :
    Daily, Démo, Support, Absence…) et une <b>portée</b> (déduite de l'agenda source : équipe, groupe, train, opérations). Les trois directions
    partagent ce détecteur, la fiche « Classer comme… » et les filtres — seule la vue change. Voir <a href="detection.html">le détecteur</a>.</div>
    <div class="gal-group" id="directions">Directions</div>
    <div class="ix-grid">
    ${DIRS.map(d => `<article class="ix-card${d.key === 'hybrid' ? ' ix-reco' : ''}">
        <div class="ix-preview"><div class="bureau-fenetre"><iframe class="bureau" data-src="${esc(`frame.html?${q({ dir: d.key, team: 'Gabbiano', cmp: d.key === 'lanes' ? 'Fuego,Helica' : '', ...(d.key === 'hybrid' ? { period: 'iteration', cmp: 'Fuego' } : {}) })}`)}" title="Aperçu ${d.name}" loading="lazy"></iframe></div></div>
        <div class="ix-body">
            <h3>${d.L} · ${d.name}${d.key === 'hybrid' ? '<span class="ix-badge">Retenue</span>' : ''}</h3>
            <p><b>${esc(d.tag)}.</b> ${d.pitch}</p>
            <dl class="ix-traits"><dt>Point fort</dt><dd>${esc(d.strong)}</dd><dt>Limite</dt><dd>${esc(d.limit)}</dd><dt>Moment idéal</dt><dd>${esc(d.when)}</dd></dl>
        </div>
        <div class="ix-links">${PAGES.filter(p => !p.for || p.for.includes(d.key)).map(p => `<a href="${d.dir}/${p.f}">${d.L}${p.n.slice(0, 2)} · ${esc(p.title)}</a>`).join('')}</div>
    </article>`).join('\n    ')}
    </div>
    <div class="gal-group" id="choisir">Choisir</div>
    <table class="ix-table">
        <thead><tr><th>Besoin</th><th>D · Synthèse</th><th>A · Semaine</th><th>B · Couloirs</th><th>C · Mosaïque</th></tr></thead>
        <tbody>
            <tr><td>Comparer 2-3 équipes</td><td>🟢 itération</td><td>🟡 serré au-delà de 2</td><td>🟢 fait pour ça</td><td>🟡 pastilles seulement</td></tr>
            <tr><td>Voir l'heure exacte, les conflits</td><td>🟢 semaine</td><td>🟢</td><td>🟡 heure de début</td><td>🔴</td></tr>
            <tr><td>Itération entière (10 jours)</td><td>🟢</td><td>🟡 dense</td><td>🟢 tient sans défiler en 1280</td><td>🟢</td></tr>
            <tr><td>Mobile</td><td>🟢</td><td>🟢 vue Jour</td><td>🟢 un jour à la fois</td><td>🟢 naturel</td></tr>
            <tr><td>Apprentissage</td><td>🟢 aucun</td><td>🟢 aucun</td><td>🟢 faible</td><td>🟢 aucun</td></tr>
        </tbody>
    </table>
</main>
<script src="_shared/gallery.js"></script>
</body>
</html>
`;
}

const write = (rel, body) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = p + '.tmp'; fs.writeFileSync(tmp, body); fs.renameSync(tmp, p); };
write('index.html', indexPage());
for (const d of DIRS) for (const page of PAGES.filter(p => !p.for || p.for.includes(d.key))) write(`${d.dir}/${page.f}`, dirPage(d, page));
console.log(`OK : index + ${DIRS.reduce((n, d) => n + PAGES.filter(p => !p.for || p.for.includes(d.key)).length, 0)} pages`);
