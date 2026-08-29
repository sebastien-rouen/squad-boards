/**
 * Compositions PAR DÉFAUT des écrans — PI Planning, Rapports, Santé, états
 * vides, mode live, mode TV. Le Dashboard, lui, est le parti pris de chaque
 * direction et vit dans `layouts.js`.
 *
 * Chaque composition reçoit la direction (`dir`) pour deux crochets :
 *   - `dir.lede(texte)`  → phrase de synthèse (le Journal la rend, les autres non)
 *   - `dir.prefix(vue)`  → bandeau avant le contenu (le Cockpit y met sa domnav)
 */
const D = require('./data');
const U = require('./ui-dash');
const P = require('./ui-pi');
const F = require('./ui-flows');

const noop = () => '';

/* ── PI Planning ─────────────────────────────────────────────────────── */
const piView = (dir, tab = 'objectives') => `
  ${dir.prefix('pi')}
  ${P.tabs(D.PI_TABS, tab)}
  ${dir.lede('Trois objectifs pour Vega, deux commis. À mi-PI, le premier est à 70 %, le second à 45 % — la sync incrémentale porte le risque : elle dépend de deux tickets Orion.')}
  <div class="ui-pi-grid">
    <div class="ui-pi-main">
      ${U.sec('🎯 Objectifs du PI #30', 'Vega · 1/3 atteint', `<button class="ui-btn ui-btn--primary" type="button">+ Objectif</button>`)}
      ${P.piObjectivesFull()}
      ${U.sec('📈 Burnup', '134 pts de périmètre · 75 réalisés')}
      ${U.card({ title: 'Avancement du PI', sub: 'périmètre vs réalisé', dom: 'pi', body: P.burnup() })}
    </div>
    <aside class="ui-pi-aside">
      ${U.card({ title: '⚡ Capacité', sub: 'PI #30 · 4 sprints + 🍃', dom: 'pi', helpKey: 'capbase', body: P.capacityTable() })}
      ${U.card({ title: '🔗 Dépendances', sub: '3 liens inter-équipes', dom: 'pi', body: P.depsMatrix() })}
      ${U.card({ title: '✊ Confiance · 😊 Mood', sub: 'Ité 30.2', dom: 'health', body: `<div class="ui-vote-duo">${P.voteDist('fist')}${P.voteDist('mood')}</div>` })}
    </aside>
  </div>`;

const piFeaturesView = (dir) => `
  ${dir.prefix('pi')}
  ${P.tabs(D.PI_TABS, 'features')}
  ${dir.lede('Six features, 187 SP engagés pour 146 jours nets : 92 % de la capacité. Le rang JIRA est conservé — glisser une ligne le change des deux côtés.')}
  ${U.sec('📦 Features du PI #30', 'rang JIRA préservé · glisser pour réordonner')}
  ${U.card({ title: 'Backlog du PI', sub: '6 features · 187 SP', dom: 'pi', body: P.featuresTable() })}
  ${U.sec('📅 Calendrier', 'sprints, PIP et fériés')}
  ${U.card({ title: 'Le PI sur une ligne', dom: 'pi', body: P.piCalendar() })}`;

/* ── Rapports ────────────────────────────────────────────────────────── */
const reportsView = (dir) => `
  ${dir.prefix('reports')}
  ${dir.lede('Le sprint 30.1 est clos : 15 tickets sur 18, 41 points sur 48. Deux tickets ont glissé vers 30.2 — ils comptent dans l\'engagement de 30.1, pas dans son réalisé.')}
  <div class="ui-rpt-grid">
    ${P.reportNav('sprint')}
    <div class="ui-rpt-main">${P.reportSprint()}</div>
    <aside class="ui-rpt-aside">
      ${U.card({ title: '💬 Aperçu Slack', sub: 'prêt à coller', dom: 'report', body: P.slackPreview() })}
      ${U.card({ title: '📊 Vélocité', sub: 'moy. 39 · cible 42', dom: 'flow', body: `<div class="ui-velo ui-velo--sm" style="--target:82%"><span class="ui-velo-target"><i>42</i></span>${D.VELOCITY.slice(0, 6).map((v) => `<span class="ui-velo-bar" style="--h:${Math.round((v.pts / 50) * 100)}%"><b>${v.pts}</b><i>${v.label}</i></span>`).join('')}</div>` })}
    </aside>
  </div>`;

/* ── Santé ───────────────────────────────────────────────────────────── */
const healthView = (dir) => `
  ${dir.prefix('health')}
  ${dir.lede('Le train est à 74/100, en hausse de 6 points en un mois. Orion concentre 18 des 30 anomalies : trois bloqués dont deux depuis plus de 48 h.')}
  ${P.healthScore()}
  ${U.sec('🔎 Anomalies actionnables', 'un clic ouvre la liste des tickets concernés')}
  ${P.anomalyCards()}
  ${U.sec('👥 Équipes × anomalies', 'plus la case est sombre, plus l\'équipe pèse dans la colonne')}
  ${U.card({ title: 'Matrice', sub: '4 équipes · 52 tickets actifs', dom: 'health', body: P.healthMatrix() })}
  <div class="ui-duo">
    ${U.card({ title: 'Sprints du PI', sub: 'engagement · réalisé · votes', dom: 'health', body: P.healthVotes() })}
    ${U.card({ title: 'Couverture des données', sub: 'sprints présents en base', dom: 'report', body: P.coverageBanner() + `<p class="ui-muted">La couverture compte la <b>présence actuelle</b>, pas le périmètre engagé : la question est « ce sprint a-t-il été rapatrié ? ».</p>` })}
  </div>`;

/* ── États vides / erreur ────────────────────────────────────────────── */
const emptyPiView = (dir) => `
  ${dir.prefix('pi')}
  ${P.tabs(D.PI_TABS, 'objectives')}
  ${U.empty({ icon: '🎯', title: 'Aucun objectif pour le PI #31', text: 'Le PI n\'a pas encore été planifié. Saisis les objectifs commis et d\'extension, ou importe-les depuis la baseline JIRA.', action: '+ Premier objectif' })}
  <div class="ui-duo">
    ${U.card({ title: '⚡ Capacité suggérée', sub: 'PI #31 · à venir', dom: 'pi', body: `<p class="ui-muted">Base = vélocité moyenne des 2 derniers PI × 4 sprints × (1 − absences).</p>${P.capacityTable()}` })}
    ${U.card({ title: '📅 Calendrier', dom: 'pi', body: U.empty({ icon: '📅', title: 'Dates inconnues', text: 'Renseigne la date de début dans Paramètres → Sprint & PI.', action: 'Ouvrir Sprint & PI' }) })}
  </div>`;

const emptyDashView = (dir) => `
  ${dir.prefix('dashboard')}
  ${U.empty({ icon: '🫙', title: 'Aucun sprint actif pour Lyra', text: 'Le dernier sprint connu (30.1) est clos et 30.2 n\'a pas démarré côté JIRA. Le Dashboard affiche le PI à défaut.', action: 'Voir le PI #30' })}
  ${U.sec('🗓️ Le PI en attendant', 'sprints connus')}
  ${U.sprintStrip({ detail: false })}`;

/* ── Live ────────────────────────────────────────────────────────────── */
const dailyView = (dir) => `
  ${F.dailyBar()}
  ${dir.lede('Daily : le board seul, graphes repliés, un chrono de quinze minutes. Chaque tour de parole avance la jauge.')}
  ${U.sprintHeader()}
  <div class="ui-board">${['todo', 'inprog', 'review', 'test', 'done'].map((st) => {
      const tks = D.TICKETS.filter((t) => t.status === st || (st === 'inprog' && t.status === 'blocked'));
      return `<div class="ui-board-col" data-st="${st}"><header>${U.STATUS_LABEL[st]} <small>${tks.length}</small>${st === 'inprog' ? '<em>WIP 3/4</em>' : ''}</header>${tks.map((t) => `<article class="ui-tk${t.status === 'blocked' ? ' is-blocked' : ''}"><code>${t.id}</code><span>${U.esc(t.title)}</span><footer><b>${t.pts} pts</b><i>${t.lead ? t.lead.split(' ').map((x) => x[0]).join('') : '—'}</i>${t.status === 'blocked' ? '<em>🚫 3 j</em>' : ''}</footer></article>`).join('')}</div>`;
  }).join('')}</div>`;

const sessionView = (dir) => `
  ${dir.prefix('pi')}
  <div class="ui-session-hd"><span class="ui-live-dot"></span><b>PI Planning #30 · séance en cours</b><span>Jour 2 · 14:20 · Vote de confiance</span><button class="ui-btn ui-btn--ghost" type="button">⊞ Plein écran</button></div>
  ${dir.lede('Le vote se remplit en direct sur l\'écran de la salle : un ✌️ ouvre la discussion avant de passer à l\'équipe suivante.')}
  <div class="ui-duo ui-duo--wide">
    ${U.card({ title: '✊ Fist of Five — Vega', sub: 'objectifs commis', dom: 'health', body: F.consensus() })}
    ${U.card({ title: '🎯 Objectifs soumis au vote', sub: 'PI #30 · Vega', dom: 'pi', body: P.piObjectivesFull() })}
  </div>
  ${U.sec('🔗 Dépendances à lever avant la fin de la séance', '3 liens inter-équipes')}
  ${U.card({ title: 'Programme board', dom: 'pi', body: P.depsMatrix() })}`;

const syncView = (dir, { failed = false } = {}) => `
  ${dir.prefix('dashboard')}
  ${failed ? F.banner('error', '🔐 <b>Jeton JIRA expiré</b> — le board Orion n\'a pas pu être lu. C\'est une panne d\'authentification, pas une absence de données.', 'Renouveler le jeton') : F.banner('info', '🔄 Import JIRA en cours — les chiffres ci-dessous datent de la dernière sync (hier 18:02).')}
  ${F.syncCard({ failed })}
  ${dir.lede(failed ? 'Trois opérations ont échoué ; l\'import n\'est pas « réussi mais creux », il le dit.' : 'Pendant l\'import, le Dashboard reste lisible : ce sont les chiffres d\'hier, marqués comme tels.')}
  ${U.sprintHeader()}
  ${U.kpiGrid('primary')}`;

const offlineView = (dir) => `
  ${dir.prefix('dashboard')}
  ${F.banner('offline', '📡 <b>Hors ligne</b> — API injoignable depuis 2 min. Affichage du dernier état connu (14:03).', 'Réessayer')}
  ${U.sprintHeader()}
  <div class="ui-kpi-grid ui-kpi-grid--primary">${[1, 2, 3, 4].map(() => `<div class="ui-kpi ui-skeleton"><span class="ui-kpi-lbl">&nbsp;</span><span class="ui-kpi-val">&nbsp;</span><span class="ui-kpi-sub">&nbsp;</span></div>`).join('')}</div>
  ${U.card({ title: 'Activité récente', sub: 'figée', dom: 'report', body: `<ul class="ui-feed ui-skeleton-list"><li><time>&nbsp;</time><b>&nbsp;</b><span>&nbsp;</span></li><li><time>&nbsp;</time><b>&nbsp;</b><span>&nbsp;</span></li><li><time>&nbsp;</time><b>&nbsp;</b><span>&nbsp;</span></li></ul>` })}`;

const bilanView = (dir) => `
  ${dir.prefix('reports')}
  ${F.banner('success', '🏁 <b>Sprint 30.1 clos</b> hier à 18:00 — le rapport est prêt. Deux tickets ont glissé vers 30.2.', 'Ouvrir la rétro')}
  ${dir.lede('Le rapport se génère seul à la clôture : ce que l\'équipe a tenu, ce qui a glissé, et le mood du sprint.')}
  <div class="ui-rpt-grid ui-rpt-grid--nonav">
    <div class="ui-rpt-main">${P.reportSprint()}</div>
    <aside class="ui-rpt-aside">${U.card({ title: '😊 Mood du sprint', sub: '5 votes', dom: 'health', body: P.voteDist('mood') })}${U.card({ title: '💬 Aperçu Slack', dom: 'report', body: P.slackPreview() })}</aside>
  </div>`;

/* ── TV ──────────────────────────────────────────────────────────────── */
const tvTop = (title, idx, total = 4) => `<header class="ui-tv-top"><b>${title}</b><span>Vega · PI #30 · Ité 30.2 · J7/10</span><span class="ui-tv-clock">14:37</span><span class="ui-tv-dots">${Array.from({ length: total }, (_, i) => `<i class="${i === idx ? 'is-on' : ''}"></i>`).join('')}<small>rotation 30 s</small></span></header>`;

const tvDashboard = (dir) => `${tvTop('📊 Dashboard', 0)}<div class="ui-tv-body">${dir.tvDashboard ? dir.tvDashboard() : `
  <div class="ui-tv-grid">
    <div class="ui-tv-a">${U.sprintHeader()}${U.kpiGrid('primary')}</div>
    <div class="ui-tv-b">${U.sprintGoal()}${U.piObjectives(true)}</div>
    <div class="ui-tv-c">${U.sprintStrip({ detail: false })}</div>
    <div class="ui-tv-d">${U.velocity()}${U.forecast()}</div>
    <div class="ui-tv-e">${U.teamCards()}</div>
  </div>`}</div>`;

const tvHealth = (dir) => `${tvTop('🛡️ Santé du train', 1)}<div class="ui-tv-body">${dir.tvHealth ? dir.tvHealth() : `
  <div class="ui-tv-grid ui-tv-grid--health">
    <div class="ui-tv-a">${P.healthScore()}${P.anomalyCards()}</div>
    <div class="ui-tv-b">${U.card({ title: 'Équipes × anomalies', dom: 'health', body: P.healthMatrix() })}</div>
    <div class="ui-tv-c">${U.stuckList()}</div>
  </div>`}</div>`;

const tvPi = (dir) => `${tvTop('🗓️ PI Planning #30', 2)}<div class="ui-tv-body">${dir.tvPi ? dir.tvPi() : `
  <div class="ui-tv-grid ui-tv-grid--pi">
    <div class="ui-tv-a">${P.piObjectivesFull()}</div>
    <div class="ui-tv-b">${U.card({ title: 'Burnup', dom: 'pi', body: P.burnup() })}</div>
    <div class="ui-tv-c">${U.card({ title: 'Capacité', dom: 'pi', body: P.capacityTable() })}</div>
    <div class="ui-tv-d">${U.card({ title: 'Confiance · Mood', dom: 'health', body: `<div class="ui-vote-duo">${P.voteDist('fist')}${P.voteDist('mood')}</div>` })}</div>
  </div>`}</div>`;

const tvReports = (dir) => `${tvTop('📈 Sprint review · 30.1', 3)}<div class="ui-tv-body">${dir.tvReports ? dir.tvReports() : `
  <div class="ui-tv-grid ui-tv-grid--rpt">
    <div class="ui-tv-a">${P.reportSprint({ withCopy: false })}</div>
    <div class="ui-tv-b">${U.velocity()}${U.card({ title: 'Mood du sprint', dom: 'health', body: P.voteDist('mood') })}</div>
  </div>`}</div>`;

module.exports = {
    noop, piView, piFeaturesView, reportsView, healthView, emptyPiView, emptyDashView, dailyView, sessionView, syncView,
    offlineView, bilanView, tvTop, tvDashboard, tvHealth, tvPi, tvReports,
};
