/**
 * Les QUATRE DIRECTIONS — chacune est un parti pris de mise en page, pas une
 * variation de couleur. Ici vit ce qui diffère : le Dashboard, les crochets
 * `lede` / `prefix`, les surcharges TV, et les annotations explicatives.
 */
const D = require('./data');
const U = require('./ui-dash');
const P = require('./ui-pi');
const V = require('./views');

/* L'échelle, la matrice et ses briques vivent dans meteo-matrix.js (partagées avec
   les pages d'approfondissement) ; les seuils et domaines dans data-meteo.js. */
const { WEATHER, weatherOf } = require('./data-meteo');
const X = require('./meteo-matrix');
const meteoMatrix = X.meteoMatrix;

/* ═══ 1 · COCKPIT — mur de tuiles bento, grands chiffres, une couleur par domaine ═══ */
const domnav = (active) => `
  <nav class="d1-domnav" aria-label="Domaines">
    ${[['dashboard', 'flow', '📊', 'Flux', '65 %', 'des points'], ['pi', 'pi', '🗓️', 'PI #30', '56 %', 'du périmètre'], ['reports', 'report', '📈', 'Rapports', '30.1', 'sprint clos'], ['health', 'health', '🛡️', 'Santé', '74', '/100']]
        .map(([id, dom, ic, lb, big, sub]) => `<a class="d1-dom${id === active ? ' is-active' : ''}" data-dom="${dom}" href="#${id}"><i>${ic}</i><span>${lb}</span><b>${big}</b><small>${sub}</small></a>`).join('')}
  </nav>`;

const cockpit = {
    id: 1, dir: 'mockup-1', name: 'Cockpit', emoji: '🧭',
    tagline: 'Mur de tuiles, grands chiffres, une couleur par domaine — lisible à trois mètres.',
    traits: ['Bento 12 colonnes', 'Domaines colorés', 'Chiffres 800', 'Sidebar icônes'],
    strong: 'Tout tient sur un écran sans défiler : la TV et le desktop montrent la même chose.',
    limit: 'Peu de texte — la compréhension passe par les « ? » et les infobulles.',
    moment: 'Salle d\'équipe avec un écran mural, revue de sprint, daily.',
    compactSide: true,
    lede: V.noop,
    prefix: (view) => domnav(view),
    dashboard: () => `
      ${domnav('dashboard')}
      <div class="d1-bento">
        <div class="d1-a">${U.sprintHeader()}</div>
        <div class="d1-b">${U.sprintGoal()}</div>
        <div class="d1-c">${U.piObjectives(true)}</div>
        <div class="d1-d">${U.kpiGrid('all')}</div>
        <div class="d1-e">${U.sec('🗓️ Les sprints du PI #30', 'US · Buffer · Action')}${U.sprintStrip({ detail: true })}</div>
        <div class="d1-f">${U.velocity()}</div>
        <div class="d1-g">${U.lctSchema()}</div>
        <div class="d1-h">${U.forecast()}</div>
        <div class="d1-i">${U.sec('👥 Équipes', 'score de santé · réalisé')}${U.teamCards()}</div>
        <div class="d1-j">${U.stuckList()}</div>
        <div class="d1-k">${U.agingWip()}</div>
        <div class="d1-l">${U.activity(4)}</div>
      </div>`,
    annots: [
        'Barre de domaines : quatre grands onglets colorés (Flux, PI, Rapports, Santé) portent chacun leur chiffre-clé — on lit l\'état du train avant d\'ouvrir la page.',
        'Grille bento 12 colonnes : la frise du sprint traverse tout en haut, les KPI sont des tuiles à liseré sémantique (vert / orange / rouge).',
        'La bande des sprints du PI garde son contenu riche (US, Buffer, Action, glissés) — c\'est la carte que tu apprécies, reprise telle quelle.',
        'Sidebar réduite aux icônes : sur un écran mural, le libellé de navigation ne sert à rien ; le raccourci clavier reste visible.',
    ],
};

/* ═══ 2 · JOURNAL DE BORD — éditorial, chapitres, une phrase de synthèse par indicateur ═══ */
const chap = (n, title, lede, body) => `
  <section class="d2-chap" id="chap-${n}">
    <header class="d2-chap-hd"><span class="d2-num">${String(n).padStart(2, '0')}</span><h2>${title}</h2></header>
    <p class="d2-lede">${lede}</p>
    ${body}
  </section>`;

const toc = () => `<nav class="d2-toc" aria-label="Sommaire"><small>Sommaire</small>${['Le cap', 'Le rythme', 'Le PI, sprint par sprint', 'La livraison', 'Les équipes'].map((t, i) => `<a href="#chap-${i + 1}"${i === 0 ? ' class="is-active"' : ''}><b>${String(i + 1).padStart(2, '0')}</b>${t}</a>`).join('')}<small>Lecture · 4 min</small></nav>`;

const journal = {
    id: 2, dir: 'mockup-2', name: 'Journal de bord', emoji: '📖',
    tagline: 'Chapitres, phrases de synthèse et schémas intégrés — le Dashboard se lit comme une note.',
    traits: ['Colonne 980 px', 'Sommaire collant', 'Titres serif', 'Une phrase par chiffre'],
    strong: 'Un manager qui découvre l\'équipe comprend sans qu\'on lui explique : chaque chiffre est traduit en français.',
    limit: 'Plus long à parcourir ; sur TV il faut faire défiler ou tourner les chapitres.',
    moment: 'Point hebdo avec le management, préparation d\'un rapport, onboarding.',
    lede: (t) => `<p class="d2-lede">${t}</p>`,
    prefix: V.noop,
    dashboard: () => `
      <div class="d2-journal">
        <div class="d2-body">
          <header class="d2-masthead"><small>Journal de bord · Vega</small><h1>Ité 30.2, jour 7 sur 10</h1><p>${D.TODAY.label} 2026 · PI #30 · rédigé automatiquement à 14:37</p></header>
          ${chap(1, 'Le cap', 'Le sprint vise <b>« l\'export CSV des absences »</b>. À 70 % du temps, 65 % des points sont réalisés : <b>léger retard, rattrapable</b> si VEGA-412 se débloque cette semaine.', `<div class="d2-duo">${U.sprintGoal()}${U.piObjectives(false)}</div>`)}
          ${chap(2, 'Le rythme', 'Six tickets terminés cette semaine, deux de plus que la précédente. Un ticket met <b>4 jours</b> à traverser l\'équipe… mais en attend <b>7</b> avant d\'être pris : l\'attente pèse deux fois plus que le travail.', `${U.sprintHeader()}${U.kpiGrid('primary')}<div class="d2-duo">${U.lctSchema()}${U.stageFlow()}</div>`)}
          ${chap(3, 'Le PI, sprint par sprint', 'Le 30.1 a tenu 85 % de son engagement, deux tickets ont glissé vers le 30.2. Les 30.3 et 30.4 sont chargés à hauteur de la vélocité moyenne ; le 30.5 respire.', U.sprintStrip({ detail: true }))}
          ${chap(4, 'La livraison', 'Vélocité 34 en cours contre 39 de moyenne — normal à J7. La simulation donne <b>78 % de chances</b> de finir à temps ; au-delà de mardi, on est dans les 15 % défavorables.', `<div class="d2-duo">${U.velocity()}${U.forecast()}</div>${U.agingWip()}`)}
          ${chap(5, 'Les équipes et les signaux', 'Orion concentre les risques du train : trois bloqués, score de santé à 42. Chez Vega, deux tickets stagnent depuis plus d\'une semaine — VEGA-398 n\'a pas bougé depuis 8 jours.', `${U.teamCards()}<div class="d2-duo">${U.stuckList()}${U.slaReview()}</div>${U.activity(5)}`)}
        </div>
        ${toc()}
      </div>`,
    annots: [
        'Manchette : le Dashboard porte une date, un sujet et une durée de lecture — c\'est une note, pas un tableau de bord.',
        'Chaque chapitre ouvre par une phrase de synthèse en français qui traduit les chiffres ; les cartes viennent ensuite comme preuves.',
        'Sommaire collant à droite : sur desktop, on saute d\'un chapitre à l\'autre ; sur TV, il devient l\'indicateur de rotation.',
        'Titres en serif et colonne plafonnée à 980 px : la largeur de lecture d\'un article, pas celle d\'un écran.',
    ],
};

/* ═══ 3 · MÉTÉO DES ÉQUIPES — matrice équipes × domaines en pastilles météo ═══ */
const meteo = {
    id: 3, dir: 'mockup-3', name: 'Météo des équipes', emoji: '🌤️', preferred: true,
    extraPages: require('./meteo-pages').EXTRA_PAGES, extraCss: ['deep.css'],
    tagline: 'Une matrice équipes × domaines en pastilles météo ; un clic ouvre la fiche.',
    traits: ['Matrice 4 × 5', '4 niveaux ☀️⛅🌧️⛈️', 'Panneau de détail', 'Très coloré'],
    strong: 'La santé de toutes les équipes en un coup d\'œil — c\'est l\'écran du RTE, pas celui d\'une équipe.',
    limit: 'Réducteur par construction : un ⛈️ cache ses causes, d\'où le panneau qui s\'ouvre à côté.',
    moment: 'Écran mural multi-équipes, ART sync, revue de PI.',
    lede: V.noop,
    prefix: V.noop,
    dashboard: () => `
      <header class="d3-hero">
        <div class="d3-hero-main"><i>⛅</i><div><small>Météo du train</small><h2>Variable, éclaircies attendues</h2><p>PI #30 · Ité 30.2 · J7/10 · 4 équipes · 52 tickets actifs</p></div></div>
        ${X.scale()}
      </header>
      <div class="d3-grid">
        <div class="d3-main">
          <div class="ui-table-wrap">${meteoMatrix()}</div>
          ${U.sec('⚠️ Ce qui demande attention aujourd\'hui', 'toutes équipes')}
          <div class="ui-duo">${U.stuckList()}${U.card({ title: 'Prochaines échéances', sub: 'cette semaine', dom: 'pi', body: `<ul class="d3-agenda"><li><time>jeu. 28</time><b>Fin de l'ité 30.2</b><span>Vega · Lyra</span></li><li><time>ven. 29</time><b>Sprint review + rétro</b><span>Vega</span></li><li><time>lun. 31</time><b>Ité 30.3 démarre</b><span>toutes</span></li><li><time>12–13 oct.</time><b>PI Planning #31</b><span>train</span></li></ul>` })}</div>
        </div>
        <aside class="d3-panel">
          <header class="d3-panel-hd"><span class="d3-team" style="--team:#3b82f6"><i></i>Vega</span><i class="d3-panel-w">☀️</i><button class="ui-btn ui-btn--ghost" type="button" aria-label="Fermer">✕</button></header>
          ${U.sprintGoal()}
          ${U.kpiGrid('primary')}
          ${U.piObjectives(true)}
          ${U.sprintStrip({ detail: false })}
          ${U.oncall()}
        </aside>
      </div>`,
    tvDashboard: () => `<div class="d3-tv"><div class="ui-table-wrap">${meteoMatrix()}</div><div class="d3-tv-side">${U.stuckList()}${U.oncall()}</div></div>`,
    tvHealth: () => `<div class="d3-tv"><div class="ui-table-wrap">${meteoMatrix()}</div><div class="d3-tv-side">${P.healthScore()}${P.anomalyCards()}</div></div>`,
    health: () => `
      ${P.healthScore()}
      ${U.sec('🌤️ Météo par équipe', 'la même matrice que le Dashboard — c\'est la vue Santé qui la nourrit')}
      <div class="ui-table-wrap">${meteoMatrix()}</div>
      ${U.sec('🔎 Anomalies', '30 sur le train')}
      ${P.anomalyCards()}
      ${U.card({ title: 'Équipes × anomalies', sub: 'le détail derrière chaque pastille', dom: 'health', body: P.healthMatrix() })}`,
    annots: [
        'Bandeau météo : une phrase, un glyphe, l\'échelle des quatre niveaux — la légende est toujours à l\'écran, jamais dans une infobulle.',
        'Matrice équipes × domaines : chaque case porte un glyphe, un chiffre et son unité ; la couleur du fond est la même échelle partout.',
        'Le panneau de détail à droite est la fiche de l\'équipe sélectionnée (objectif, KPI, sprints du PI) — la matrice reste visible pendant qu\'on lit.',
        'Sous la matrice, uniquement ce qui demande une action aujourd\'hui : bloqués/stagnants et échéances de la semaine.',
    ],
};

/* ═══ 4 · FRISE DU PI — tout ancré sur l'axe des sprints, curseur « aujourd'hui » ═══ */
const railCols = () => D.SPRINTS.map((s) => {
    const ratio = s.pts ? Math.round((s.done / s.pts) * 100) : 0;
    const cls = s.breath ? 'breath' : s.state;
    const extra = s.state === 'closed'
        ? `<div class="d4-col-ft"><span>😊 ${s.mood}</span><span>✊ ${s.fist}</span><a href="#reports">rapport ›</a></div>`
        : s.state === 'active'
            ? `<div class="d4-col-ft is-now"><b>J${D.TODAY.dayIdx}/${D.TODAY.dayTotal}</b><span>3 j restants</span><span>${D.FORECAST.probability} % à temps</span></div>`
            : s.breath ? '<div class="d4-col-ft"><span>dette · I&amp;A · prépa PI 31</span></div>'
                : `<div class="d4-col-ft"><span>base 39 pts</span><span>${s.pts} engagés</span></div>`;
    return `<div class="d4-col d4-col--${cls}">
      <header class="d4-col-hd"><b>${s.breath ? '🍃 ' : ''}${s.key}</b><span>${s.start.slice(8)}/${s.start.slice(5, 7)} → ${s.end.slice(8)}/${s.end.slice(5, 7)}</span></header>
      ${s.pts ? `<div class="d4-col-bar"><span class="ui-bar ui-bar--thin"><span class="ui-bar-fill ui-bar-fill--${U.SEV(ratio)}" style="width:${ratio}%"></span></span><b>${s.done}/${s.pts}</b></div>` : ''}
      <p class="d4-col-goal">${U.esc(s.goal)}</p>
      ${s.groups.us ? `<ul class="d4-col-grps">${[['📗', 'US', s.groups.us], ['🧯', 'Buffer', s.groups.buffer], ['🛠️', 'Action', s.groups.action]].map(([ic, lb, g]) => `<li><span>${ic} ${lb} <small>${g.n}</small></span><b>${g.done}/${g.pts}</b></li>`).join('')}</ul>` : ''}
      ${s.slipped ? `<span class="ui-slip">↪ ${s.slipped} glissés vers 30.2</span>` : ''}
      ${extra}
    </div>`;
}).join('');

const frise = {
    id: 4, dir: 'mockup-4', name: 'Frise du PI', emoji: '🛤️',
    tagline: 'Tout est ancré sur l\'axe des sprints ; le présent est un curseur qui avance.',
    traits: ['Rail 5 + 🍃', 'Curseur aujourd\'hui', 'Chiffres mono', 'Large obligatoire'],
    strong: 'PI Planning, suivi de sprint et rapport deviennent la même vue à des instants différents : on ne change plus de page, on regarde ailleurs sur la frise.',
    limit: 'Exige la largeur — sur mobile la frise se replie en liste et perd son sens.',
    moment: 'Suivi continu du PI, préparation de l\'I&A, TV de plateau.',
    lede: V.noop,
    prefix: V.noop,
    dashboard: () => `
      <header class="d4-pihead">
        <div><small>Program Increment</small><h2>PI #30 <span>3 août → 9 oct.</span></h2></div>
        <div class="d4-pihead-kpis">${U.kpi({ label: 'Périmètre', value: 134, unit: ' pts', sub: '75 réalisés · 56 %', sev: 'info', dom: 'pi' })}${U.kpi({ label: 'Objectifs', value: '1<small>/3</small>', sub: 'atteint · 2 en cours', sev: 'warn', dom: 'pi' })}${U.kpi({ label: 'Confiance', value: '4,1', unit: '/5', sub: 'Fist of Five 30.2', sev: 'good', dom: 'health' })}${U.kpi({ label: 'Dépendances', value: 3, sub: 'inter-équipes ouvertes', sev: 'warn', dom: 'pi' })}</div>
      </header>
      <div class="d4-rail" style="--now:32%">
        <span class="d4-now"><i>aujourd'hui · ${D.TODAY.label}</i></span>
        ${railCols()}
      </div>
      <div class="d4-under">
        <section class="d4-under-col"><header class="ui-sec"><h2>⏱️ Maintenant · Ité 30.2</h2><span class="ui-sec-sub">ce qui se joue cette semaine</span></header>${U.kpiGrid('primary')}${U.lctSchema()}${U.stuckList()}</section>
        <section class="d4-under-col"><header class="ui-sec"><h2>🗓️ Sur le PI</h2><span class="ui-sec-sub">tendance et équipes</span></header>${U.card({ title: 'Burnup', sub: '134 pts · 75 réalisés', dom: 'pi', body: P.burnup() })}${U.velocity()}${U.teamCards()}</section>
      </div>`,
    pi: () => `
      ${P.tabs(D.PI_TABS, 'objectives')}
      <div class="d4-rail d4-rail--pi" style="--now:32%"><span class="d4-now"><i>aujourd'hui</i></span>${railCols()}</div>
      <div class="ui-pi-grid">
        <div class="ui-pi-main">${U.sec('🎯 Objectifs du PI #30', 'Vega · 1/3 atteint')}${P.piObjectivesFull()}</div>
        <aside class="ui-pi-aside">${U.card({ title: '⚡ Capacité', dom: 'pi', helpKey: 'capbase', body: P.capacityTable() })}${U.card({ title: '🔗 Dépendances', dom: 'pi', body: P.depsMatrix() })}</aside>
      </div>`,
    tvDashboard: () => `<div class="d4-rail d4-rail--tv" style="--now:32%"><span class="d4-now"><i>aujourd'hui</i></span>${railCols()}</div><div class="d4-under">${U.kpiGrid('primary')}${U.card({ title: 'Burnup', dom: 'pi', body: P.burnup() })}</div>`,
    annots: [
        'En-tête du PI : période, périmètre, objectifs, confiance, dépendances — les quatre chiffres qui résument un Program Increment.',
        'La frise : une colonne par sprint, le sprint de respiration 🍃 à part ; les colonnes closes portent leurs votes et un lien vers le rapport, la colonne active son compte à rebours.',
        'Le curseur « aujourd\'hui » traverse la frise : on voit d\'un coup où l\'on en est du PI, pas seulement du sprint.',
        'Sous la frise, deux temps : « Maintenant » (le sprint, ses KPI, ses bloqués) et « Sur le PI » (burnup, vélocité, équipes).',
    ],
};

module.exports = { DIRS: [cockpit, journal, meteo, frise], WEATHER, weatherOf };
