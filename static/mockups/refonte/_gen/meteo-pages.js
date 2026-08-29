/**
 * Les SEPT PAGES D'APPROFONDISSEMENT de la Météo des équipes (mockup-3).
 * Chaque bâtisseur reçoit la direction et la liste des directions (pour le
 * panneau flottant) — il ne dépend jamais de layouts.js.
 */
const D = require('./data');
const M = require('./data-meteo');
const X = require('./meteo-matrix');
const U = require('./ui-dash');
const P = require('./ui-pi');
const F = require('./ui-flows');
const V = require('./views');
const Q = require('./ui-pages');
const G = require('./pages');

const vega = M.TEAMS4[0];
const orion = M.TEAMS4[2];
const app = (dir, o) => F.shell({ compactSide: false, ...o });
const tvApp = (body) => `<div class="ui-app ui-app--tv"><main class="ui-content ui-content--tv">${body}</main></div>`;
const secAnchor = (key, title, sub) => `<header class="ui-sec d3-fiche-sec" id="sec-${key}"><h2>${title}</h2><span class="ui-sec-sub">${sub}</span></header>`;

/* ── 06 · Fiche équipe ───────────────────────────────────────────────── */
const ficheVega = () => `
  ${X.teamHero(vega, { text: 'Ité 30.2 à J7/10 — le sprint est à l\'heure, le PI en avance, un ticket bloqué depuis 3 jours.' })}
  ${secAnchor('sprint', '🏃 Sprint en cours', 'engagement · réalisé · prévision')}
  ${U.sprintHeader()}
  ${U.kpiGrid('primary')}
  <div class="ui-duo">${U.sprintGoal()}${U.forecast()}</div>
  ${secAnchor('pi', '🗓️ Le PI #30', 'objectifs et sprints')}
  <div class="ui-duo ui-duo--wide">${U.card({ title: 'Objectifs', sub: '1/3 atteint', dom: 'pi', body: P.piObjectivesFull() })}${U.card({ title: 'Burnup', sub: '134 pts · 75 réalisés', dom: 'pi', body: P.burnup() })}</div>
  ${U.sprintStrip({ detail: true })}
  ${secAnchor('health', '🛡️ Santé', 'score 74 · 7 anomalies')}
  <div class="ui-duo">${P.anomalyCards()}${U.stuckList()}</div>
  ${secAnchor('support', '🎧 Support', 'rotation du PI · SLA 90 %')}
  ${U.card({ title: 'Rotation', sub: '10 semaines · Théo cette semaine', dom: 'health', body: Q.rotation() })}
  ${secAnchor('mood', '😊 Mood & confiance', 'tendance sur 7 sprints')}
  <div class="ui-duo">${U.card({ title: 'Tendance du mood', sub: '3,2 → 3,8', dom: 'health', body: `<div class="d3-trend">${P.sparkline(M.MOOD_TREND, 'd3-trend-spark')}<div class="d3-trend-vals">${M.MOOD_TREND.map((v, i) => `<span><b>${v.toFixed(1)}</b><small>${['29.1', '29.2', '29.3', '29.4', '29.5', '30.1', '30.2'][i]}</small></span>`).join('')}</div></div>` })}${U.card({ title: 'Votes de l\'ité 30.2', dom: 'health', body: `<div class="ui-vote-duo">${P.voteDist('mood')}${P.voteDist('fist')}</div>` })}</div>
  ${secAnchor('team', '👥 L\'équipe', '5 personnes · 3,7 ETP')}
  ${U.card({ title: 'Roster du PI', sub: 'capacité pondérée par rôle', dom: 'health', helpKey: 'capbase', body: Q.roster() })}`;

const ficheOrion = () => `
  ${X.teamHero(orion, { text: 'Trois bloqués dont deux depuis plus de 48 h, score de santé 42, capacité du PI 31 plafonnée. La météo ne juge pas : elle liste ce qui ferait revenir le soleil.' })}
  <div class="d3-plan-grid">
    <section class="d3-plan"><header><h2>🧭 Plan d'action proposé</h2><span class="ui-sec-sub">dérivé des anomalies — à discuter au daily</span></header>
      <ol>${M.ORION_PLAN.map((a) => `<li><i>${a.icon}</i><div><b>${a.what}</b><span>${a.why}</span></div><em>${a.who}</em><small class="d3-plan-when">${a.urgency}</small></li>`).join('')}</ol>
    </section>
    <aside class="d3-plan-side">
      ${U.card({ title: 'Ce qui pèse', sub: 'anomalies pondérées', dom: 'health', body: `<ul class="d3-weights"><li><span>🔴 Blockers > 48 h</span><b>2 × 3</b></li><li><span>🚫 Bloqués</span><b>3 × 2</b></li><li><span>🐌 Stagnants</span><b>4 × 1,5</b></li><li><span>👤 Sans lead</span><b>2 × 1</b></li><li><span>📊 Sans estimation</span><b>3 × 1</b></li><li class="d3-weights-tot"><span>Score</span><b>100 − 23/17 × 35 ≈ 42</b></li></ul>` })}
      ${U.card({ title: 'Dépendances sortantes', sub: '2 équipes attendent Orion', dom: 'pi', body: `<ul class="ui-deps-list"><li><code>ORION-71</code> → <code>VEGA-415</code> <em>API archive</em></li><li><code>ORION-74</code> → <code>VEGA-417</code> <em>endpoint sprints</em></li></ul>` })}
    </aside>
  </div>
  ${secAnchor('sprint', '🏃 Sprint en cours', '30 % des points à 70 % du temps')}
  ${Q.board({ mode: 'scrum', aging: true, tickets: D.TICKETS.map((t, i) => ({ ...t, id: t.id.replace('VEGA', 'ORION'), status: i < 3 ? 'blocked' : t.status, age: t.age != null ? t.age + 4 : null })) })}`;

const pageFiche = (dir, DIRS) => G.page({
    dir, DIRS, file: '06-equipe.html', title: 'Fiche équipe', sub: 'Ce qui s\'ouvre quand on clique une ligne de la matrice : la météo d\'une équipe, domaine par domaine.',
    body: `
  ${G.bureau('Vega ☀️ — la fiche complète', 'pastilles cliquables → sections', app(dir, { active: 'team', title: 'Équipe · Vega', body: ficheVega() }))}
  ${G.bureau('Orion ⛈️ — la météo qui propose', 'plan d\'action dérivé des anomalies', app(dir, { active: 'team', title: 'Équipe · Orion', body: ficheOrion() }))}
  ${G.phones('la fiche à 390 px', [
        { tag: 'Fiche', title: 'Vega', why: 'Les cinq pastilles deviennent un rail collant ; chaque section s\'atteint d\'un tap.', inner: app(dir, { active: 'team', title: 'Vega', body: ficheVega() }) },
        { tag: 'Alerte', title: 'Orion', why: 'Le plan d\'action passe en premier — sur mobile on vient pour agir, pas pour lire.', inner: app(dir, { active: 'team', title: 'Orion', body: ficheOrion() }) },
    ])}`,
    notesList: [
        '<strong>La fiche est la réponse à la limite de la matrice.</strong> Une pastille ⛈️ cache ses causes ; la fiche les liste, dans l\'ordre des pastilles, et propose un plan d\'action dérivé des anomalies pondérées.',
        'Le plan d\'action <strong>nomme un responsable et une échéance</strong> pour chaque ligne — une liste sans « qui » ni « quand » n\'est pas un plan.',
        'La tendance du mood sur 7 sprints répond au #13 du BACKLOG (courbe de confiance) sans nouvelle table : les votes existent déjà par sprint.',
    ],
});

/* ── 07 · Prévisions ─────────────────────────────────────────────────── */
const previsions = (dir) => `
  <header class="d3-hero"><div class="d3-hero-main"><i>🔭</i><div><small>Prévisions</small><h2>PI 31 : risque de surcharge</h2><p>L'engagement prévu (187 pts) dépasse la base de capacité (142) de 32 %. Deux PI sur deux ont livré moins que leur engagement.</p></div></div>${X.scale({ withNone: true })}</header>
  ${X.forecastStrip()}
  <div class="ui-duo ui-duo--wide">
    ${U.card({ title: '📐 Prédictibilité', sub: 'mesure SAFe', dom: 'pi', helpKey: 'capbase', body: `<div class="d3-pred"><span class="ui-ring ui-ring--lg ui-ring--${U.SEV(M.PREDICTABILITY.pct)}" style="--pct:${M.PREDICTABILITY.pct}"><b>${M.PREDICTABILITY.pct} %</b><small>cible ${M.PREDICTABILITY.target}</small></span><div><p>Moyenne livrée sur les 2 PI précédents : <b>${M.PREDICTABILITY.delivered2} pts</b>. Capacité nette du PI courant : <b>${M.PREDICTABILITY.capacityNet} pts</b>. L'équipe livre en général <b>7 pts sur 10</b> de ce qu'elle pourrait.</p><p class="ui-muted">Sous 80 %, le PI Planning devrait engager <b>moins</b> que la base — pas plus.</p></div></div>` })}
    ${U.card({ title: '📊 Vélocité sur 12 sprints', sub: 'moy. 39 · 🍃 exclus', dom: 'flow', body: `<div class="ui-velo" style="--target:84%"><span class="ui-velo-target"><i>cible 42</i></span>${M.VELOCITY12.map((v) => `<span class="ui-velo-bar${v.current ? ' is-current' : ''}" style="--h:${Math.round((v.pts / 50) * 100)}%"><b>${v.pts}</b><i>${v.label}</i></span>`).join('')}</div>` })}
  </div>
  ${U.sec('🗺️ Features sur trois PI', 'la roadmap, une barre par feature')}
  ${U.card({ title: 'Roadmap PI 30 → 32', sub: '7 features · 4 équipes', dom: 'pi', body: `
    <div class="d3-rm"><div class="d3-rm-hd"><span></span>${[30, 31, 32].map((n) => `<span class="${n === 30 ? 'is-now' : ''}">PI ${n}</span>`).join('')}</div>
    ${M.ROADMAP.map((f) => { const c = M.TEAMS12.find((t) => t.name === f.team).color; return `<div class="d3-rm-row"><span class="d3-rm-lbl"><span class="ui-dot" style="--dot:${c}"></span><code>${f.id}</code> ${U.esc(f.title)}</span><span class="d3-rm-track"><span class="d3-rm-bar" style="--from:${f.from - 30};--to:${f.to - 30 + 1};--team:${c}"><i style="width:${f.pct}%"></i><b>${f.pct ? f.pct + ' %' : 'à planifier'}</b></span></span></div>`; }).join('')}
    </div>` })}
  <div class="ui-duo">
    ${U.card({ title: '⚡ Capacité du PI 31', sub: 'base suggérée par équipe', dom: 'pi', body: P.capacityTable() })}
    ${U.card({ title: '🔗 Dépendances à lever avant le PI 31', dom: 'pi', body: P.depsMatrix() })}
  </div>`;

const pagePrevisions = (dir, DIRS) => G.page({
    dir, DIRS, file: '07-previsions.html', title: 'Prévisions', sub: 'La météo à cinq PI : ce qui a été tenu, ce qui se joue, ce qui s\'annonce — la roadmap racontée comme une prévision.',
    body: `
  ${G.bureau('Prévisions · Roadmap multi-PI', 'PI-2 → PI+2, prédictibilité, vélocité, features', app(dir, { active: 'roadmap', title: 'Prévisions', pi: true, body: previsions(dir) }))}
  ${G.phones('les prévisions à 390 px', [{ tag: 'Roadmap', title: 'Cinq PI', why: 'La frise des PI défile horizontalement ; la roadmap devient une liste de barres.', inner: app(dir, { active: 'roadmap', title: 'Prévisions', body: previsions(dir) }) }])}`,
    notesList: [
        '<strong>Une prévision, pas une promesse.</strong> Le PI 31 est 🌧️ avant d\'avoir commencé : l\'engagement dépasse la base, et la base elle-même est plafonnée pour Orion. C\'est le moment de le dire — au PI Planning, pas à la revue.',
        'La prédictibilité SAFe (livré ÷ capacité) est expliquée en une phrase : « l\'équipe livre 7 points sur 10 de ce qu\'elle pourrait ». Le chiffre seul ne dit rien.',
        'Les 🍃 sont exclus de la vélocité sur 12 sprints — la règle de <code>breathIdxOf()</code>, visible.',
    ],
});

/* ── 08 · Board & backlog ────────────────────────────────────────────── */
const pageBoard = (dir, DIRS) => {
    const scrum = app(dir, { active: 'board', title: 'Board', mode: '☀️ 65 %', body: Q.board({ mode: 'scrum' }) });
    const kanban = app(dir, { active: 'board', title: 'Board', mode: '⛅ WIP 5/4', body: Q.board({ mode: 'kanban', aging: true }) });
    const bl = app(dir, { active: 'backlog', title: 'Backlog', body: Q.backlog() });
    return G.page({
        dir, DIRS, file: '08-board.html', title: 'Board & backlog', sub: 'Le quotidien : Scrum, Kanban avec vieillissement, backlog groupé et actions en masse.',
        body: `
  ${G.bureau('Board Scrum', 'colonnes, WIP, filtres — la météo du sprint dans le titre', scrum)}
  ${G.bureau('Board Kanban · vieillissement', 'chaque carte colorée par son âge vs P50/P85', kanban)}
  ${G.bureau('Backlog', 'groupé par sprint, 3 sélectionnés, barre d\'actions', bl)}
  ${G.phones('board & backlog à 390 px', [
            { tag: 'Board', title: 'Scrum', why: 'Une colonne à la fois, défilement horizontal avec accroche.', inner: scrum },
            { tag: 'Backlog', title: 'Groupé', why: 'La barre d\'actions se colle au-dessus de la barre d\'onglets.', inner: bl },
        ])}`,
        notesList: [
            'Le titre du Board porte la <strong>météo du sprint</strong> (☀️ 65 %) : on sait où on en est sans ouvrir le Dashboard.',
            'En Kanban, le vieillissement colore la carte, pas seulement un chiffre — un ticket rouge dans « En cours » se voit depuis la porte de la salle.',
            'Le backlog garde les <strong>trois dispositions</strong> du site (colonnes, swimlanes, liste) et le groupement par sprint / PI / epic.',
        ],
    });
};

/* ── 09 · Paramètres & seuils météo ──────────────────────────────────── */
const thresholds = () => Q.settingsShell('seuils', `
  ${Q.stgSec('🌤️ Seuils de la météo', `
    <p class="ui-muted">Quatre niveaux, trois seuils, <b>les mêmes pour tous les domaines absolus</b> (Santé, Support, Mood × 20). Les domaines relatifs (Sprint, PI) comparent l'avancement au temps écoulé : ±10 points = variable, −20 = attention.</p>
    <div class="d3-thr">
      <div class="d3-thr-bar"><span class="d3-thr-seg d3-cell--storm" style="flex:${M.THRESHOLDS.rain}"><i>⛈️</i>0 – ${M.THRESHOLDS.rain - 1}</span><span class="d3-thr-seg d3-cell--rain" style="flex:${M.THRESHOLDS.cloud - M.THRESHOLDS.rain}"><i>🌧️</i>${M.THRESHOLDS.rain} – ${M.THRESHOLDS.cloud - 1}</span><span class="d3-thr-seg d3-cell--cloud" style="flex:${M.THRESHOLDS.sun - M.THRESHOLDS.cloud}"><i>⛅</i>${M.THRESHOLDS.cloud} – ${M.THRESHOLDS.sun - 1}</span><span class="d3-thr-seg d3-cell--sun" style="flex:${100 - M.THRESHOLDS.sun}"><i>☀️</i>${M.THRESHOLDS.sun} – 100</span></div>
      <div class="d3-thr-marks"><span class="d3-thr-mark" style="--at:${M.THRESHOLDS.rain}%"><b>${M.THRESHOLDS.rain}</b></span><span class="d3-thr-mark" style="--at:${M.THRESHOLDS.cloud}%"><b>${M.THRESHOLDS.cloud}</b></span><span class="d3-thr-mark" style="--at:${M.THRESHOLDS.sun}%"><b>${M.THRESHOLDS.sun}</b></span></div>
    </div>
    <div class="ui-form-grid">${F.field('Seuil « critique »', F.seg(['30', '40', '50'], '40'))}${F.field('Seuil « attention »', F.seg(['50', '60', '70'], '60'))}${F.field('Seuil « beau »', F.seg(['75', '80', '85', '90'], '80'))}${F.field('Écart relatif (sprint, PI)', F.seg(['± 5', '± 10', '± 15'], '± 10'), 'en points d\'avancement vs temps écoulé')}</div>
    <div class="d3-thr-preview"><b>Aperçu avec ces seuils</b><div class="ui-table-wrap">${X.meteoMatrix({ compact: true })}</div></div>
    <div class="ui-toolbar"><button class="ui-btn ui-btn--primary" type="button">Enregistrer</button><button class="ui-btn ui-btn--ghost" type="button">Revenir aux valeurs par défaut</button><span class="ui-muted">Les seuils sont <b>globaux</b> : une équipe ne se choisit pas une météo plus clémente.</span></div>`, 'la même échelle partout — c\'est ce qui rend la matrice lisible')}`);

const pageParametres = (dir, DIRS) => G.page({
    dir, DIRS, file: '09-parametres.html', title: 'Paramètres', sub: 'Les formulaires dans l\'identité Météo — et les seuils de l\'échelle, réglables mais globaux.',
    body: `
  ${G.bureau('Seuils météo', 'nouveau : l\'échelle est un réglage, avec aperçu', app(dir, { active: 'settings', title: 'Paramètres', body: thresholds() }))}
  ${G.bureau('Absences · import CSV', 'le parser dit ce qu\'il écarte', app(dir, { active: 'settings', title: 'Paramètres', body: Q.settingsAbsences() }))}
  ${G.bureau('Sprint & PI', 'saisie manuelle prioritaire, récapitulatif', app(dir, { active: 'settings', title: 'Paramètres', body: Q.settingsSprintPi() }))}
  ${G.bureau('Équipes & lignes produit', 'couleur = identité de la ligne de matrice', app(dir, { active: 'settings', title: 'Paramètres', body: Q.settingsTeams() }))}
  ${G.phones('paramètres à 390 px', [
        { tag: 'Seuils', title: 'Échelle', why: 'Les onglets groupés deviennent un rail ; la barre reste sur une ligne.', inner: app(dir, { active: 'settings', title: 'Paramètres', body: thresholds() }) },
        { tag: 'Import', title: 'Absences', why: 'Le résultat de l\'analyse s\'affiche sous la zone de collage, avec les lignes écartées.', inner: app(dir, { active: 'settings', title: 'Paramètres', body: Q.settingsAbsences() }) },
    ])}`,
    notesList: [
        '<strong>Les seuils sont globaux.</strong> Réglables (une organisation qui vit à 70 % de prédictibilité ne veut pas un train ⛈️ en permanence), mais identiques pour toutes les équipes — sinon la matrice ment.',
        'L\'aperçu sous les seuils recalcule la matrice réelle : on voit qui change de couleur avant d\'enregistrer.',
        'L\'import CSV reprend la règle du site : ce qui est écarté est <strong>compté et montré</strong> (« CP » n\'est pas un nombre), jamais avalé.',
    ],
});

/* ── 10 · États & cas limites ────────────────────────────────────────── */
const twelve = () => `
  <header class="d3-hero"><div class="d3-hero-main"><i>⛅</i><div><small>Météo du train · 3 lignes produit</small><h2>Variable — deux orages</h2><p>12 équipes · 56 personnes · Capella et Orion en ⛈️ · 2 domaines sans donnée</p></div></div>${X.scale()}</header>
  <div class="ui-table-wrap">${X.meteoMatrix({ teams: M.TEAMS12, grouped: true, selected: '' })}</div>`;
const single = () => `
  <header class="d3-hero"><div class="d3-hero-main"><i>☀️</i><div><small>Une seule équipe</small><h2>Vega — Beau</h2><p>Avec une équipe, la matrice tient en une ligne : le Dashboard <b>est</b> la fiche.</p></div></div>${X.scale({ withNone: false })}</header>
  <div class="ui-table-wrap">${X.meteoMatrix({ teams: [vega] })}</div>
  ${ficheVega()}`;
const first = () => `
  <div class="d3-first"><i>🌤️</i><h2>Bienvenue sur Squad Board</h2><p>Aucune équipe pour l'instant. La météo a besoin de trois choses : des équipes, un sprint, des tickets. Trois façons de commencer :</p>
    <div class="d3-first-choices">
      <button class="d3-first-choice" type="button"><i>🎲</i><b>Données de démo</b><span>Quatre équipes fictives, un PI complet — pour voir la météo tout de suite.</span></button>
      <button class="d3-first-choice" type="button"><i>🔌</i><b>Importer depuis JIRA</b><span>Jeton + boards : la première sync remplit tout (≈ 2 min).</span></button>
      <button class="d3-first-choice" type="button"><i>✏️</i><b>Créer à la main</b><span>Une équipe, un sprint, tes tickets. JIRA restera optionnel.</span></button>
    </div></div>`;
const endOfPi = () => `
  ${F.banner('info', '🏁 <b>Dernier jour du PI 30</b> — 30.5 🍃 se termine ce soir. Le PI 31 n\'est pas planifié : le PI Planning est dans 3 jours (12–13 oct.).', 'Préparer le PI 31')}
  <header class="d3-hero"><div class="d3-hero-main"><i>⛅</i><div><small>Bilan du PI 30</small><h2>Variable — 78 % tenu</h2><p>105/134 pts · 2 objectifs commis sur 3 · prédictibilité 71 %</p></div></div>${X.scale({ withNone: false })}</header>
  <div class="ui-table-wrap">${X.meteoMatrix({ selected: '' })}</div>
  ${U.sec('📋 Ce qu\'il reste à faire avant le PI Planning', 'checklist')}
  ${U.card({ title: 'Préparation', dom: 'pi', body: `<ul class="d3-check"><li class="is-done">✅ Absences importées jusqu'au 18 déc.</li><li class="is-done">✅ Baseline des features du PI 30 figée</li><li>⬜ Capacité PI 31 validée (Orion : plafonnée ⚠)</li><li>⬜ Objectifs commis saisis (0/4 équipes)</li><li>⬜ Rotation support PI 31 générée</li><li>⬜ I&amp;A : 3 actions de rétro ouvertes</li></ul>` })}`;
const noJira = () => `
  ${F.banner('info', '🔌 <b>Mode autoporteur</b> — aucun plugin JIRA configuré. Les tickets se créent ici (touche N) ; la météo se calcule sur ce que tu saisis.')}
  <header class="d3-hero"><div class="d3-hero-main"><i>⛅</i><div><small>Météo du train</small><h2>Variable</h2><p>2 équipes · 9 personnes · sans JIRA</p></div></div>${X.scale()}</header>
  <div class="ui-table-wrap">${X.meteoMatrix({ teams: M.TEAMS4.slice(0, 2).map((t, i) => (i === 1 ? { ...t, support: null, mood: null } : t)) })}</div>
  <p class="ui-muted">⚪ Lyra n'a ni SLA ni votes : les cases restent <b>grises</b>, jamais rouges. L'absence de donnée n'est pas une mauvaise nouvelle, c'est une case à remplir.</p>
  ${U.sprintStrip({ detail: true })}`;

const pageEtats = (dir, DIRS) => G.page({
    dir, DIRS, file: '10-etats.html', title: 'États & cas limites', sub: 'Douze équipes, une seule, aucune ; fin de PI ; sans JIRA ; pas de donnée. Une direction se juge sur ses cas limites.',
    body: `
  ${G.bureau('Douze équipes, trois lignes produit', 'en-têtes de groupe avec le pire niveau du groupe', app(dir, { active: 'dashboard', title: 'Dashboard', body: twelve() }))}
  ${G.bureau('Une seule équipe', 'le Dashboard devient la fiche', app(dir, { active: 'dashboard', title: 'Dashboard', body: single() }))}
  ${G.bureau('Premier lancement', 'trois façons de commencer', app(dir, { active: 'dashboard', title: 'Dashboard', body: first() }))}
  ${G.bureau('Dernier jour du PI', 'bilan + checklist du PI Planning', app(dir, { active: 'dashboard', title: 'Dashboard', pi: true, body: endOfPi() }))}
  ${G.bureau('Sans JIRA · pas de donnée', 'les cases ⚪ ne sont pas des ⛈️', app(dir, { active: 'dashboard', title: 'Dashboard', body: noJira() }))}
  ${G.phones('cas limites à 390 px', [
        { tag: '12 équipes', title: 'Train complet', why: 'La matrice défile horizontalement, les groupes restent des lignes collantes.', inner: app(dir, { active: 'dashboard', title: 'Dashboard', body: twelve() }) },
        { tag: 'Vide', title: 'Premier lancement', why: 'Trois grands boutons, une phrase chacun.', inner: app(dir, { active: 'dashboard', title: 'Dashboard', body: first() }) },
    ])}`,
    notesList: [
        '<strong>Le niveau d\'un groupe est le pire de ses équipes</strong>, jamais une moyenne : une moyenne cache l\'orage.',
        '<strong>⚪ Pas de donnée ≠ ⛈️.</strong> Une équipe sans SLA ni votes reste grise ; la colorer en rouge punirait celles qui n\'ont pas encore branché le module.',
        'À douze équipes la matrice tient encore sans défiler sur desktop (12 lignes × 5 domaines) ; au-delà, on filtre par ligne produit — le sélecteur du topbar existe déjà.',
    ],
});

/* ── 11 · Comprendre la météo ────────────────────────────────────────── */
const how = () => `
  <header class="d3-hero"><div class="d3-hero-main"><i>🎓</i><div><small>Aide · Comprendre la météo</small><h2>Cinq domaines, une échelle</h2><p>Chaque case de la matrice vient d'une formule connue du site. Rien n'est un jugement : ce sont des chiffres traduits en couleur.</p></div></div>${X.scale()}</header>
  <div class="d3-how">${M.DOMAINS.map((d) => `
    <article class="d3-how-card"><header><i>${d.icon}</i><b>${d.label}</b><small>${d.kind === 'rel' ? 'relatif au temps' : 'absolu'} · ${d.unit}</small></header>
      <p class="d3-formula">${d.formula}</p>
      <p class="ui-muted"><b>Source :</b> ${d.source}</p>
      ${d.kind === 'rel' ? `<div class="d3-scalebar d3-scalebar--rel"><span class="d3-cell--storm">⛈️ &lt; −20</span><span class="d3-cell--rain">🌧️ −20 … −10</span><span class="d3-cell--cloud">⛅ ±10</span><span class="d3-cell--sun">☀️ ≥ +10</span></div>` : `<div class="d3-scalebar"><span class="d3-cell--storm">⛈️ &lt; ${M.THRESHOLDS.rain}</span><span class="d3-cell--rain">🌧️ ${M.THRESHOLDS.rain}–${M.THRESHOLDS.cloud - 1}</span><span class="d3-cell--cloud">⛅ ${M.THRESHOLDS.cloud}–${M.THRESHOLDS.sun - 1}</span><span class="d3-cell--sun">☀️ ≥ ${M.THRESHOLDS.sun}</span></div>`}
      <p class="d3-example">${d.example}</p>
    </article>`).join('')}
    <article class="d3-how-card d3-how-card--rule"><header><i>🧮</i><b>Le niveau d'une équipe</b><small>et d'un groupe</small></header><p class="d3-formula">le <b>pire</b> de ses cinq domaines</p><p class="ui-muted">Une moyenne masquerait un orage derrière quatre beaux temps. Une case ⚪ (pas de donnée) ne compte pas.</p><p class="d3-example">Vega : ⛅ ☀️ ⛅ ☀️ ⛅ → ⛅ · Orion : ⛈️ ⛅ ⛈️ 🌧️ ⛈️ → ⛈️</p></article>
  </div>
  ${U.sec('📖 Glossaire visuel', 'les mots du site, avec leur schéma')}
  ${Q.glossary()}`;

const learning = (dir) => {
    const popAt = (pop, x, y) => `<div class="ui-pop-anchor" style="--x:${x};--y:${y}">${pop}</div>`;
    const popWeather = F.helpPopover({ title: 'Comment lire une case', schema: `<svg viewBox="0 0 360 90" class="ui-schema" role="img" aria-label="Une case météo"><rect x="20" y="10" width="110" height="70" rx="10" class="ui-sch-seg ui-sch-seg--cycle"/><text x="75" y="38" text-anchor="middle" font-size="22">⛅</text><text x="75" y="60" text-anchor="middle" class="ui-sch-strong">65 %</text><text x="75" y="74" text-anchor="middle">des points</text><text x="150" y="30">glyphe = niveau (le pire domaine)</text><text x="150" y="50">chiffre = la mesure brute</text><text x="150" y="70">unité = ce qu'on mesure</text></svg>`, body: '<p>La couleur vient de la mesure et des seuils, jamais d\'une saisie. Cliquer la ligne ouvre la fiche.</p>' });
    const popGroup = F.helpPopover({ title: 'Le niveau d\'une équipe', schema: F.SCHEMAS.hscore, body: '<p>C\'est le <b>pire</b> de ses domaines, pas la moyenne — une moyenne masquerait un orage.</p>' });
    return `<div class="scr-clip">${app(dir, { active: 'dashboard', title: 'Dashboard', mode: '🎓 Apprentissage', body: dir.dashboard() })}${popAt(popWeather, '18%', '30%')}${popAt(popGroup, '4%', '58%')}${popAt(F.popLct(), '62%', '20%')}${popAt(F.popScore(), '62%', '58%')}</div>`;
};

const pageComprendre = (dir, DIRS) => G.page({
    dir, DIRS, file: '11-comprendre.html', title: 'Comprendre la météo', sub: 'L\'explication visuelle en détail : les formules, l\'échelle, le glossaire — et le mode apprentissage qui ouvre tous les « ? » d\'un coup.',
    body: `
  ${G.bureau('Aide · Comment la météo est calculée', 'une carte par domaine : formule, source, seuils, exemple', app(dir, { active: 'dashboard', title: 'Aide', body: how() }))}
  ${G.bureau('Mode apprentissage', 'le Dashboard avec ses « ? » ouverts — à activer depuis le topbar', learning(dir))}
  ${G.phones('comprendre à 390 px', [{ tag: 'Aide', title: 'Les formules', why: 'Une carte par domaine, l\'échelle en tête ; le glossaire suit.', inner: app(dir, { active: 'dashboard', title: 'Aide', body: how() }) }])}`,
    notesList: [
        '<strong>Expliquer par le dessin</strong> : chaque domaine a sa formule en une ligne, sa source dans le code du site, ses seuils sous forme de barre, et un exemple avec les vrais chiffres de la maquette.',
        'Le mode apprentissage ouvre tous les « ? » en même temps : c\'est ce qu\'on montre à un nouveau Scrum Master la première fois, puis on l\'éteint.',
        'Le glossaire porte les règles métier du site (engagement vs réalisé, glissé, 🍃, plafond, flow efficiency, commis / extension) — les mêmes schémas que les popovers, jamais réécrits.',
    ],
});

/* ── 12 · TV : rotation & alerte ─────────────────────────────────────── */
const alertScreen = () => `
  <div class="d3-alert"><div class="d3-alert-hd"><i>⛈️</i><div><small>Alerte · Orion</small><h2>Blocker depuis plus de 48 h</h2><p>La rotation s'interrompt tant qu'un blocker > 48 h existe sur le train.</p></div><span class="d3-alert-since">52 h</span></div>
    <div class="d3-alert-bd">
      <article class="d3-alert-tk"><code>ORION-63</code><b>Trancher le format de l'archive (décision produit)</b><span>Bloqué depuis le 23 août · Nadia Ferro · 8 pts</span></article>
      <div class="d3-alert-chain"><span>bloque →</span><code>ORION-71</code><span>→</span><code>VEGA-415</code><span>→ objectif « Sync incrémentale » (45 %)</span></div>
      <div class="d3-alert-actions"><span>Qui peut débloquer : <b>PO Orion</b> · Escalade : <b>RTE</b></span><span class="ui-muted">Reprise de la rotation dès que le ticket bouge</span></div>
    </div></div>`;

const rotationOverview = () => `
  ${V.tvTop('📺 Rotation TV', 0, 5)}
  <div class="d3-rot">
    ${[['🌤️ Météo du train', '30 s', 'toujours en premier'], ['📊 Dashboard Vega', '30 s', 'équipe du plateau'], ['🛡️ Santé', '20 s', 'anomalies + matrice'], ['🗓️ PI Planning', '20 s', 'objectifs + burnup'], ['📈 Sprint review', '20 s', 'le sprint clos']].map(([t, d, s], i) => `<article class="d3-rot-it${i === 0 ? ' is-on' : ''}"><b>${t}</b><span>${d}</span><small>${s}</small></article>`).join('')}
  </div>
  <div class="d3-rot-rules"><h3>Règles</h3><ul><li>⛈️ <b>Un blocker > 48 h interrompt la rotation</b> et affiche l'alerte plein écran jusqu'à ce que le ticket bouge.</li><li>⏸ Survol ou barre d'espace : pause. <kbd>←</kbd> <kbd>→</kbd> : écran précédent / suivant.</li><li>🌙 De 19 h à 8 h : écran de fin de journée, puis veille.</li><li>🔗 <code>#tv</code> lance la rotation ; <code>#tv/meteo</code> fige un écran.</li></ul></div>`;

const endOfDay = () => `
  ${V.tvTop('🌙 Fin de journée', 4, 5)}
  <div class="d3-eod">
    <div class="d3-eod-main"><i>🌤️</i><h2>Mardi 25 août — variable, éclaircies</h2><p>6 tickets terminés aujourd'hui sur le train · 1 bloqué débloqué · 2 votes mood reçus</p></div>
    <div class="ui-kpi-grid ui-kpi-grid--primary">${U.kpi({ label: 'Terminés aujourd\'hui', value: 6, sub: 'VEGA-409, VEGA-425, LYRA-198…', sev: 'good' })}${U.kpi({ label: 'Débloqués', value: 1, sub: 'SIRIUS-40 → LYRA-201 libre', sev: 'good' })}${U.kpi({ label: 'Toujours bloqués', value: 4, sub: 'dont 2 > 48 h (Orion)', sev: 'bad' })}${U.kpi({ label: 'Demain', value: '3', unit: ' j', sub: 'avant la fin de l\'ité 30.2', sev: 'info' })}</div>
    <div class="ui-table-wrap">${X.meteoMatrix({ selected: '' })}</div>
  </div>`;

const pageTvRotation = (dir, DIRS) => G.page({
    dir, DIRS, file: '12-tv-rotation.html', title: 'TV · rotation & alerte', sub: 'Ce que l\'écran mural fait seul : la séquence, l\'alerte qui l\'interrompt, le train complet, la fin de journée.',
    body: `
  ${G.tv('Rotation — la séquence', 'écran 0 : ce que l\'écran affiche à la première seconde', tvApp(rotationOverview()))}
  ${G.tv('Alerte ⛈️ — blocker > 48 h', 'interrompt la rotation', tvApp(`${V.tvTop('⛈️ Alerte', 0, 5)}${alertScreen()}`))}
  ${G.tv('Train complet — 12 équipes', 'trois lignes produit', tvApp(`${V.tvTop('🌤️ Météo du train', 0, 5)}<div class="ui-table-wrap">${X.meteoMatrix({ teams: M.TEAMS12, grouped: true, selected: '' })}</div>`))}
  ${G.tv('Fin de journée', 'écran 19 h → 8 h', tvApp(endOfDay()))}`,
    notesList: [
        '<strong>L\'alerte n\'est pas un toast</strong> : sur un écran mural, ce qui compte se lit à trois mètres, et un blocker > 48 h est ce qui compte. Elle nomme le ticket, la chaîne qu\'il bloque, et qui peut le lever.',
        'La météo du train passe toujours en premier dans la rotation : c\'est l\'écran qu\'un passant voit en cinq secondes.',
        'L\'écran de fin de journée remplace la rotation le soir — quatre chiffres et la matrice, pour celui qui part en dernier.',
    ],
});

const EXTRA_PAGES = [
    { file: '06-equipe.html', nav: 'Fiche équipe', icon: '🪪', count: '2 écrans + mobile', build: pageFiche },
    { file: '07-previsions.html', nav: 'Prévisions', icon: '🔭', count: 'desktop + mobile', build: pagePrevisions },
    { file: '08-board.html', nav: 'Board & backlog', icon: '🗂️', count: '3 écrans + mobile', build: pageBoard },
    { file: '09-parametres.html', nav: 'Paramètres', icon: '⚙️', count: '4 écrans + mobile', build: pageParametres },
    { file: '10-etats.html', nav: 'États limites', icon: '🫙', count: '5 écrans + mobile', build: pageEtats },
    { file: '11-comprendre.html', nav: 'Comprendre', icon: '🎓', count: '2 écrans + mobile', build: pageComprendre },
    { file: '12-tv-rotation.html', nav: 'TV · rotation', icon: '📺', count: '4 écrans TV', build: pageTvRotation },
];

module.exports = { EXTRA_PAGES };
