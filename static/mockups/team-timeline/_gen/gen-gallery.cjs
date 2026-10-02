// Générateur IDEMPOTENT de la galerie static/mockups/team-timeline/ (réécrit chaque page en entier).
// Chrome (gallery.css / gallery.js) partagé avec ../team-calendar/_shared/ : ne pas déplacer ce dossier.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const q = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const TEAMS = ['Ami', 'Bellier', 'Caméléon', 'Dezir', 'Etoile', 'Fuego', 'Gabbiano', 'Helica', 'Initiale', 'Juke', 'Kadjar', 'Lion', 'Océane'];
const CHROME = '../../team-calendar/_shared';

const DIRS = [
    { key: 'lanes', dir: 'a-couloirs', L: '1', name: 'Couloirs du temps', tag: 'Un axe, une ligne par thème',
      pitch: "Frise horizontale A → B : rythme (PI, sprints, jalons), présence (bande de chaleur, congés d'été annotés), production (incidents groupés), livraisons (MEP), équipe (▲ arrivées en vert, ▼ départs en rouge, ⇄ mobilités en bleu), faits saisis. Mini-carte de l'année dessous : on fait glisser la fenêtre.",
      strong: 'Les corrélations sautent aux yeux (incidents pendant l’été, vague d’arrivées au changement de PI)', limit: 'Dense ; les textes longs vivent dans la fiche', when: 'Rétro de PI, analyse, comparer des périodes' },
    { key: 'story', dir: 'b-recit', L: '2', name: 'Fil du temps', tag: 'Le journal de l’équipe',
      pitch: "Récit vertical mois par mois : une carte par fait, regroupés par semaine, période creuse avec son histogramme, personnes en pastilles vertes / rouges / bleues, mini-bilan par mois. Se lit comme un journal ; naturel sur mobile.",
      strong: 'Se lit sans légende ; parfait pour raconter (onboarding, rapport)', limit: 'Les corrélations dans le temps se voient moins', when: 'Onboarding d’un arrivant, rapport, bilan d’été' },
];

const PAGES = [
    { f: '01-principal.html', n: '01 Principal', title: 'Écran principal',
      lead: "Page Équipe d'Initiale, 6 derniers mois (avril → septembre 2026), données réelles : 16 incidents de production, congés d'été du 27/07 au 14/08 (pic 50 %), 3 arrivées, 1 départ, et la mobilité de REJA vers Gabbiano.",
      desk: () => [{ o: { team: 'Initiale', preset: '6m' }, cap: '<b>6 mois d’Initiale</b> — bandeau de chiffres clés, catégories filtrables, période choisie par présélection ou par dates.' }],
      mob: d => [{ o: { team: 'Initiale', preset: '6m' }, cap: d.key === 'lanes' ? '<b>Piste défilante</b>, libellés de ligne collants, mini-carte en pleine largeur (poignées de 40 px).' : '<b>Le récit</b> — lecture verticale, mois collants.' },
                 { o: { team: 'Fuego', preset: 'piprev' }, lock: 1, cap: '<b>Fuego, PI 30</b> — la vague d’arrivées du 08/06 (check-lists d’onboarding), BASSO venu de Lion.' }],
      ux: ["<b>Une période, pas une date</b> : présélections (PI courant, PI précédent, Été, 6 mois, Tout) + deux dates libres — le motif des outils d'analyse.",
           "<b>Vert = arrivée, rouge = départ, bleu = mobilité</b> ; pointillé = date « au changement de PI » (roster), plein = date exacte (check-list d'onboarding).",
           "<b>L'été n'est pas saisi, il est détecté</b> : semaines consécutives ≥ 25 % d'absence, étiquetées « Congés d'été » quand leur milieu tombe en juillet-août."] },
    { f: '02-periode.html', n: '02 Période A → B', title: 'Choisir la période A → B',
      lead: "La même frise sur quatre fenêtres : l'été, un PI, tout le train, et la fenêtre qu'on fait glisser. Au zoom, les marqueurs regroupés (🚩 3, ◆ 4) se séparent d'eux-mêmes.",
      desk: d => [{ o: { team: 'Initiale', preset: 'ete' }, cap: '<b>Été</b> (29/06 → 31/08) — congés d’été annotés, incidents de juillet.' },
                  { o: { team: 'Initiale', preset: 'pi' }, cap: '<b>PI 31</b> — MEP et jalons du train (agendas ICS disponibles depuis fin août).' },
                  { o: { team: 'Initiale', preset: '6m', scope: 'train' }, cap: `<b>Tout le train</b> — ${d.key === 'lanes' ? 'mouvements regroupés en comptes ▲ ▼ ⇄ (56 prénoms se chevauchaient 289 fois)' : 'le journal du train entier'}.` },
                  { o: { team: 'Gabbiano', preset: 'tout' }, lock: 1, cap: '<b>Gabbiano, tout</b> — une équipe sans incident : la ligne le dit, elle ne disparaît pas.' }],
      mob: () => [{ o: { team: 'Initiale', preset: 'ete' }, cap: 'Été, sur mobile.' }, { o: { team: 'Initiale', preset: '6m', scope: 'train' }, cap: 'Tout le train, sur mobile.' }],
      ux: ["<b>La mini-carte</b> (frise 1) montre toute l'année : on voit où sont les pics avant de choisir sa fenêtre ; poignées au clavier (← →).",
           "<b>Regrouper selon l'échelle</b> : les marqueurs trop proches fusionnent (🚩 3) et se séparent au zoom — jamais de marqueur caché sous un autre.",
           "<b>Dire ce qu'on ne sait pas</b> : « les MEP viennent des agendas ICS, disponibles à partir du 31 août » — une ligne vide avant n'est pas « aucune MEP »."] },
    { f: '03-fiche.html', n: '03 Fiche & ajout', title: 'Fiche d’un fait et ajout manuel',
      lead: "Un clic ouvre la fiche : les tickets d'incident de la semaine, les personnes d'un mouvement (date exacte ou « au PI »), la période creuse. « ＋ Fait marquant » ajoute ce qu'aucune source ne voit (une panne, un gel).",
      desk: () => [{ o: { team: 'Initiale', preset: 'pi', select: '0' }, cap: '<b>Fiche</b> d’une cible (la première de la frise).' },
                   { o: { team: 'Initiale', preset: 'pi', add: '1' }, cap: '<b>＋ Fait marquant</b> — type (incident, gel, jalon, période, autre), dates, portée équipe ou train.' },
                   { o: { team: 'Initiale', preset: 'pi', seed: '1' }, cap: '<b>Faits saisis</b> — 2 exemples tirés de vrais tickets : la panne INES SPD du 22/09, le gel des MEP pendant le PI Planning.' }],
      mob: () => [{ o: { team: 'Initiale', preset: 'pi', add: '1' }, cap: 'Le formulaire en feuille du bas.' }],
      ux: ["<b>Les sources automatiques d'abord</b> (tickets, rosters, check-lists, congés, agendas) ; la saisie ne sert qu'à ce qu'elles ne voient pas.",
           "<b>Les incohérences sont signalées</b> : RODRIGUEZ sort du roster d'Initiale au PI 30 puis a une check-list d'onboarding le 19/06 → « ⚠️ à vérifier », pas de choix silencieux.",
           "<b>Un fait saisi = la table `event` existante</b> (vide aujourd'hui) : aucun nouveau modèle."] },
    { f: '04-etats.html', n: '04 États', title: 'États : chargement, vide, catégories',
      lead: "Chargement, période vide après filtres, et une frise réduite à deux catégories (production + équipe) pour une rétro ciblée.",
      desk: () => [{ o: { team: 'Initiale', state: 'loading' }, cap: '<b>Chargement</b> — squelette.' },
                   { o: { team: 'Initiale', state: 'empty' }, cap: '<b>Vide</b> — « Réinitialiser ».' },
                   { o: { team: 'Initiale', preset: '6m', cats: 'production,equipe' }, cap: '<b>Deux catégories</b> — production et arrivées/départs seulement.' }],
      mob: () => [{ o: { team: 'Initiale', state: 'loading' }, cap: 'Chargement.' }, { o: { team: 'Initiale', preset: '6m', cats: 'production,equipe' }, cap: 'Deux catégories.' }],
      ux: ["<b>Un état = une cause + une action</b>.", "<b>Les catégories se combinent</b> : la frise devient l'outil d'une question précise (« nos incidents suivent-ils les départs ? »)."] },
];

const src = (d, o) => `../frame.html?${q({ dir: d.key, reset: '1', ...o })}`;
function dirPage(d, page) {
    const desks = page.desk(d), mobs = page.mob(d);
    return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frise ${d.L} · ${d.name} — ${esc(page.title)}</title>
<link rel="stylesheet" href="../../../css/tokens.css">
<link rel="stylesheet" href="${CHROME}/gallery.css">
</head>
<body class="gallery">
<!-- GÉNÉRÉ par _gen/gen-gallery.cjs — ne pas éditer à la main -->
<header class="gal-head">
    <a href="../index.html">← Galerie « Frise des faits marquants »</a>
    <h1>Frise ${d.L} · ${d.name} — ${esc(page.title)}</h1>
    <p>${page.lead}</p>
</header>
<nav class="gal-nav" aria-label="Écrans">
    ${PAGES.map(p => `<a href="${p.f}"${p.f === page.f ? ' aria-current="page"' : ''}>${p.n}</a>`).join('')}
    <span class="gal-spacer"></span>${DIRS.filter(x => x.key !== d.key).map(x => `<a href="../${x.dir}/${page.f}">↔ Frise ${x.L}</a>`).join('')}
</nav>
<main class="gal-main">
    <div class="gal-group">🖥️ Desktop — 1280 × 820, réduit pour tenir</div>
    <div class="gal-desks${desks.length > 2 ? ' gal-desks--2' : ''}">
        ${desks.map(x => `<figure class="bureau-fig"><div class="bureau-fenetre"><iframe class="bureau" data-src="${esc(src(d, x.o))}"${x.lock ? ' data-teamlock="1"' : ''} title="Desktop" loading="lazy"></iframe></div><figcaption>${x.cap}</figcaption></figure>`).join('\n        ')}
    </div>
    <div class="gal-group">📱 Mobile — 390 × 760</div>
    <div class="gal-rail">
        ${mobs.map(x => `<figure class="phone"><iframe data-src="${esc(src(d, x.o))}"${x.lock ? ' data-teamlock="1"' : ''} title="Mobile" loading="lazy"></iframe><figcaption>${x.cap}</figcaption></figure>`).join('\n        ')}
    </div>
    <section class="gal-ux"><h2>Parti pris UX</h2><ul>${page.ux.map(u => `<li>${u}</li>`).join('')}</ul></section>
</main>
<aside class="gal-fcp" aria-label="Panneau de démo">
    <button class="gal-fcp-toggle" type="button">🎛️ Démo</button>
    <label>Équipe affichée<select data-team><option value="">(celle de l'écran)</option>${TEAMS.map(t => `<option>${t}</option>`).join('')}</select></label>
    <button class="gal-fcp-btn" type="button" data-theme-toggle>🌓 Thème clair / sombre</button>
    <label>Frise</label>
    <div class="gal-fcp-dirs">${DIRS.map(x => `<a href="../${x.dir}/${page.f}" aria-current="${x.key === d.key}">${x.L}</a>`).join('')}</div>
</aside>
<script src="${CHROME}/gallery.js"></script>
</body>
</html>
`;
}

function indexPage() {
    return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frise des faits marquants — galerie</title>
<link rel="stylesheet" href="../../css/tokens.css">
<link rel="stylesheet" href="${CHROME.replace('../', '')}/gallery.css">
</head>
<body class="gallery">
<!-- GÉNÉRÉ par _gen/gen-gallery.cjs — ne pas éditer à la main -->
<header class="gal-head">
    <a href="../">← Maquettes Squad Board</a>
    <h1>🕰️ Frise des faits marquants — deux propositions</h1>
    <p>Sur la page <b>#team/{équipe}</b> (ou pour tout le train) : incidents de production, congés d'été, arrivées (vert), départs (rouge),
       mobilités (bleu), MEP, jalons du train et faits saisis à la main, <b>de la date A à la date B</b>. Données réelles des 13 équipes, avril → novembre 2026.</p>
</header>
<nav class="gal-nav" aria-label="Sections"><a href="#frises" aria-current="page">Frises</a><a href="#sources">Sources</a><a href="#choisir">Choisir</a><span class="gal-spacer"></span><a href="README.md">README</a></nav>
<main class="gal-main">
    <div class="ix-callout">💡 <b>Rien n'est saisi à la main par défaut.</b> Incidents = tickets support/bug « PROD », « incident » ou label <code>désynchro</code> ;
    été = semaines à ≥ 25 % d'absence (congés RH) ; turnover = rosters par PI + check-lists d'onboarding / offboarding (date exacte) ; MEP et jalons = agendas ICS.
    La saisie (« ＋ Fait marquant ») ne sert qu'à ce que ces sources ne voient pas.</div>
    <div class="gal-group" id="frises">Frises</div>
    <div class="ix-grid">
    ${DIRS.map(d => `<article class="ix-card">
        <div class="ix-preview"><div class="bureau-fenetre"><iframe class="bureau" data-src="frame.html?${q({ dir: d.key, team: 'Initiale', preset: '6m', reset: '1' })}" title="Aperçu ${esc(d.name)}" loading="lazy"></iframe></div></div>
        <div class="ix-body">
            <h3>Frise ${d.L} · ${esc(d.name)}</h3>
            <p><b>${esc(d.tag)}.</b> ${d.pitch}</p>
            <dl class="ix-traits"><dt>Point fort</dt><dd>${esc(d.strong)}</dd><dt>Limite</dt><dd>${esc(d.limit)}</dd><dt>Moment idéal</dt><dd>${esc(d.when)}</dd></dl>
        </div>
        <div class="ix-links">${PAGES.map(p => `<a href="${d.dir}/${p.f}">${d.L}·${p.n.slice(0, 2)} ${esc(p.title)}</a>`).join('')}</div>
    </article>`).join('\n    ')}
    </div>
    <div class="gal-group" id="sources">Sources (toutes existantes)</div>
    <table class="ix-table"><thead><tr><th>Catégorie</th><th>Source</th><th>Couverture</th></tr></thead><tbody>
        <tr><td>🚨 Production</td><td>tickets support/bug « PROD », « incident », label désynchro</td><td>23 incidents (Initiale 16)</td></tr>
        <tr><td>🏖️ Présence</td><td>table <code>absence</code> (import Congés) × roster du PI</td><td>avril → novembre</td></tr>
        <tr><td>👥 Arrivées & départs</td><td><code>piMembers</code> (PI 29, 30, 31) + tickets « Check-list onboarding / offboarding »</td><td>39 check-lists, 24 rattachées à une équipe</td></tr>
        <tr><td>🚀 Livraisons · 🧭 Rythme</td><td>agendas ICS (MEP, I&A, PI Planning, démos) + sprints JIRA</td><td>ICS : fin août → novembre</td></tr>
        <tr><td>📌 Faits marquants</td><td>table <code>event</code> (vide aujourd'hui) — saisie « ＋ Fait marquant »</td><td>à la main</td></tr>
    </tbody></table>
    <div class="gal-group" id="choisir">Choisir</div>
    <table class="ix-table"><thead><tr><th>Besoin</th><th>Frise 1 · Couloirs</th><th>Frise 2 · Fil du temps</th></tr></thead><tbody>
        <tr><td>Voir des corrélations (incidents ↔ été ↔ départs)</td><td>🟢</td><td>🟡</td></tr>
        <tr><td>Raconter une période (onboarding, rapport)</td><td>🟡</td><td>🟢</td></tr>
        <tr><td>Choisir A → B</td><td>🟢 présélections, dates, mini-carte</td><td>🟢 présélections, dates</td></tr>
        <tr><td>Tout le train (56 mouvements)</td><td>🟢 comptes regroupés</td><td>🟡 long à lire</td></tr>
        <tr><td>Mobile</td><td>🟡 piste défilante</td><td>🟢 naturel</td></tr>
    </tbody></table>
</main>
<script src="${CHROME.replace('../', '')}/gallery.js"></script>
</body>
</html>
`;
}

const write = (rel, body) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); const t = p + '.tmp'; fs.writeFileSync(t, body); fs.renameSync(t, p); };
write('index.html', indexPage());
for (const d of DIRS) for (const page of PAGES) write(`${d.dir}/${page.f}`, dirPage(d, page));
console.log(`OK : index + ${DIRS.length * PAGES.length} pages`);
