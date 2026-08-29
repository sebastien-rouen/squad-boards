/**
 * Composants de COQUILLE (sidebar, topbar, tabbar), MODALES, ÉTATS LIVE et
 * ANNOTATIONS — HTML pur sur `ui-*`. Feuille : `_shared/ui-flows.css`.
 */
const D = require('./data');
const { esc, help } = require('./ui-dash');

/* ── Coquille ────────────────────────────────────────────────────────── */

/** Sidebar du site (identité fixe, toujours sombre — comme `--sidebar-bg`). */
const sidebar = (active = 'dashboard', { compact = false } = {}) => `
  <aside class="ui-side${compact ? ' ui-side--compact' : ''}">
    <div class="ui-side-logo"><b>SB</b><span>Squad Board</span></div>
    <nav class="ui-side-nav" aria-label="Pilotage">
      <small class="ui-side-grp">Pilotage</small>
      ${D.NAV.map((n) => `<a class="ui-nav-it${n.id === active ? ' is-active' : ''}" href="#${n.id}" data-dom="${n.dom}"><i>${n.icon}</i><span>${n.label}</span><kbd>${n.key}</kbd></a>`).join('')}
      <small class="ui-side-grp">Équipe &amp; RH ▸</small>
      <small class="ui-side-grp ui-side-grp--foot">⚙️ Paramètres <kbd>,</kbd></small>
    </nav>
    <div class="ui-side-teams"><small class="ui-side-grp">Équipes</small><div>${D.TEAMS.map((t) => `<button type="button" class="ui-team-btn${t.name === 'Vega' ? ' is-active' : ''}" style="--team:${t.color}" title="${t.name}">${t.name.slice(0, 2).toUpperCase()}</button>`).join('')}</div></div>
  </aside>`;

/** Topbar : titre, recherche, actions. `pi` = afficher le sélecteur de PI. */
const topbar = (title, { pi = false, mode = '' } = {}) => `
  <header class="ui-top">
    <h1 class="ui-top-title">${title}</h1>
    ${mode ? `<span class="ui-top-mode">${mode}</span>` : ''}
    <button class="ui-search" type="button"><span>🔍 Rechercher…</span><kbd>Ctrl K</kbd></button>
    ${pi ? `<div class="ui-pisel" role="group" aria-label="Choisir le PI">${[29, 30, 31].map((n) => `<button type="button" class="ui-pisel-btn${n === D.PI.num ? ' is-active' : ''}">PI ${n}</button>`).join('')}</div>` : ''}
    <div class="ui-top-actions"><button class="ui-btn" type="button">▶ Daily</button><button class="ui-btn" type="button">Mes tickets</button><button class="ui-btn ui-btn--primary" type="button">+ Nouveau</button></div>
  </header>`;

/** Barre d'onglets mobile (bas d'écran). */
const tabbar = (active = 'dashboard') => `
  <nav class="ui-tabbar" aria-label="Navigation principale">${[['dashboard', '▦', 'Dashboard'], ['board', '▥', 'Board'], ['pi', '🗓', 'PI'], ['health', '🛡', 'Santé'], ['more', '⋯', 'Plus']].map(([id, ic, lb]) => `<a class="ui-tabbar-it${id === active ? ' is-active' : ''}" href="#${id}"><i>${ic}</i><span>${lb}</span></a>`).join('')}</nav>`;

/**
 * Coquille complète. Sur mobile (`.phone .screen`) la sidebar est masquée et la
 * tabbar affichée ; sur `.bureau` / `.tv` c'est l'inverse — porté par la CLASSE
 * du cadre, jamais par une requête média.
 */
const shell = ({ active = 'dashboard', title = 'Dashboard', pi = false, mode = '', body, compactSide = false, noSide = false, cls = '' }) => `
  <div class="ui-app ${cls}${noSide ? ' ui-app--noside' : ''}">
    ${noSide ? '' : sidebar(active, { compact: compactSide })}
    <div class="ui-main">
      ${topbar(title, { pi, mode })}
      <main class="ui-content">${body}</main>
    </div>
    ${tabbar(active)}
  </div>`;

/* ── Modales ─────────────────────────────────────────────────────────── */

const modal = ({ title, body, foot = '', size = '', kicker = '' }) => `
  <div class="ui-overlay">
    <div class="ui-modal ${size}" role="dialog" aria-modal="true" aria-labelledby="m-${title.replace(/\W+/g, '-')}">
      <header class="ui-modal-hd">${kicker ? `<small>${kicker}</small>` : ''}<h2 id="m-${title.replace(/\W+/g, '-')}">${title}</h2><button class="ui-btn ui-btn--ghost" type="button" aria-label="Fermer">✕</button></header>
      <div class="ui-modal-bd">${body}</div>
      ${foot ? `<footer class="ui-modal-ft">${foot}</footer>` : ''}
    </div>
  </div>`;

const field = (label, control, hint = '') => `<label class="ui-field"><span class="ui-field-lbl">${label}</span>${control}${hint ? `<small class="ui-field-hint">${hint}</small>` : ''}</label>`;
const input = (value = '', ph = '') => `<input class="ui-input" type="text" value="${esc(value)}" placeholder="${esc(ph)}">`;
const select = (opts, current) => `<select class="ui-input">${opts.map((o) => `<option${o === current ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
const seg = (opts, current) => `<div class="ui-seg" role="radiogroup">${opts.map((o) => `<button type="button" class="ui-seg-btn${o === current ? ' is-active' : ''}" aria-pressed="${o === current}">${o}</button>`).join('')}</div>`;

const modalTicket = () => modal({
    title: 'Nouveau ticket', kicker: 'Vega · Ité 30.2', size: 'ui-modal--lg',
    body: `<div class="ui-form-grid">
      ${field('Titre', input('', 'Ex. Export CSV — encodage UTF-8'))}
      ${field('Type', seg(['📗 Story', '🐛 Bug', '🛠️ Task', '🛡️ Support'], '📗 Story'))}
      ${field('Points', seg(['1', '2', '3', '5', '8', '13', '?'], '5'), 'Fibonacci — « ? » = à estimer en poker')}
      ${field('Leader', select(['Théo Vasseur', 'Lucie Arnaud', 'Maxime Giraud', 'Chloé Mercier'], 'Théo Vasseur'))}
      ${field('Sprint', select(['Ité 30.2 (en cours)', 'Ité 30.3', 'Backlog'], 'Ité 30.2 (en cours)'), 'Ajouté après le début du sprint → compte comme « périmètre élargi »')}
      ${field('Feature parente', select(['FEAT-301 Export RH automatisé', 'FEAT-305 Sync JIRA incrémentale', '— aucune —'], 'FEAT-301 Export RH automatisé'))}
    </div>`,
    foot: `<span class="ui-muted">Esc pour annuler · Ctrl+Entrée pour créer</span><button class="ui-btn" type="button">Annuler</button><button class="ui-btn ui-btn--primary" type="button">Créer le ticket</button>`,
});

const modalObjective = () => modal({
    title: 'Objectif du PI', kicker: 'PI #30 · Vega',
    body: `${field('Intitulé', input('Sync JIRA incrémentale'))}
      <div class="ui-form-row">${field('Business value', seg(['3', '5', '6', '8', '9', '10'], '9'), '0 → 10, estimée avec le Business Owner')}${field('Engagement', seg(['🎯 Commis', '✨ Extension'], '🎯 Commis'))}</div>
      ${field('Features rattachées', `<div class="ui-chips"><span class="ui-chip">FEAT-305 ✕</span><span class="ui-chip">FEAT-308 ✕</span><button class="ui-btn ui-btn--ghost" type="button">+ lier</button></div>`)}
      <div class="ui-note">💡 La progression (45 %) est un <b>rollup</b> des features liées — elle n'est jamais saisie à la main.</div>`,
    foot: `<button class="ui-btn ui-btn--danger-ghost" type="button">Supprimer</button><span class="ui-spacer"></span><button class="ui-btn" type="button">Annuler</button><button class="ui-btn ui-btn--primary" type="button">Enregistrer</button>`,
});

const modalFist = () => modal({
    title: 'Fist of Five — confiance sur le PI', kicker: 'Vega · Ité 30.2 · 4 votes reçus',
    body: `<p class="ui-muted">Quelle confiance as-tu que l'équipe atteigne ses <b>objectifs commis</b> ?</p>
      <div class="ui-fist">${[['✊', '1', 'Aucune'], ['☝️', '2', 'Faible'], ['✌️', '3', 'Moyenne'], ['🤟', '4', 'Bonne'], ['🖐️', '5', 'Totale']].map(([ic, n, lb]) => `<button type="button" class="ui-fist-btn${n === '4' ? ' is-active' : ''}"><i>${ic}</i><b>${n}</b><span>${lb}</span></button>`).join('')}</div>
      <div class="ui-note">Les votes sont <b>anonymes</b> ; la moyenne s'affiche dès 3 votes. Un vote sous 3 ouvre la discussion.</div>`,
    foot: `<button class="ui-btn" type="button">Passer</button><button class="ui-btn ui-btn--primary" type="button">Voter 🤟 4</button>`,
});

const modalDanger = () => modal({
    title: 'Générer une nouvelle rotation ?', kicker: 'Support · Vega · PI #30', size: 'ui-modal--sm',
    body: `<p>La rotation actuelle (5 semaines, 4 personnes) sera <b>réécrite</b>. Les affectations manuelles sont perdues.</p>
      <label class="ui-check"><input type="checkbox"> Je comprends que c'est irréversible</label>`,
    foot: `<button class="ui-btn" type="button">Annuler</button><button class="ui-btn ui-btn--danger" type="button" disabled>Régénérer</button>`,
});

const toastUndo = () => `<div class="ui-toast ui-toast--undo" role="status"><span>🗑️ VEGA-426 supprimé</span><button class="ui-btn ui-btn--ghost" type="button">Annuler</button><i class="ui-toast-timer"></i></div>`;

/** Popover d'aide « ? » avec schéma SVG et bordure conique en spirale (cf. BACKLOG). */
const helpPopover = ({ title, body, schema }) => `
  <div class="ui-pop" role="dialog" aria-label="${esc(title)}">
    <header><b>${title}</b><button class="ui-btn ui-btn--ghost" type="button" aria-label="Fermer">✕</button></header>
    <div class="ui-pop-schema">${schema}</div>
    <div class="ui-pop-bd">${body}</div>
  </div>`;

const SCHEMAS = {
    lct: `<svg viewBox="0 0 360 110" class="ui-schema" role="img" aria-label="Lead time = attente + cycle time">
      <line x1="20" y1="40" x2="340" y2="40" class="ui-sch-axis"/>
      <circle cx="30" cy="40" r="8" class="ui-sch-node"/><text x="30" y="70" text-anchor="middle">Créé</text>
      <circle cx="170" cy="40" r="8" class="ui-sch-node ui-sch-node--start"/><text x="170" y="70" text-anchor="middle">Démarré</text>
      <circle cx="330" cy="40" r="8" class="ui-sch-node ui-sch-node--done"/><text x="330" y="70" text-anchor="middle">Terminé</text>
      <rect x="40" y="32" width="120" height="16" class="ui-sch-seg ui-sch-seg--wait"/><text x="100" y="22" text-anchor="middle">attente 7 j</text>
      <rect x="180" y="32" width="140" height="16" class="ui-sch-seg ui-sch-seg--cycle"/><text x="250" y="22" text-anchor="middle">cycle time 4 j</text>
      <path d="M40 92 H320" class="ui-sch-brace"/><text x="180" y="105" text-anchor="middle" class="ui-sch-strong">lead time 11 j</text>
    </svg>`,
    floweff: `<svg viewBox="0 0 360 90" class="ui-schema" role="img" aria-label="Flow efficiency = cycle / lead">
      <rect x="20" y="20" width="320" height="26" class="ui-sch-seg ui-sch-seg--wait"/>
      <rect x="20" y="20" width="116" height="26" class="ui-sch-seg ui-sch-seg--cycle"/>
      <text x="78" y="37" text-anchor="middle" class="ui-sch-onbar">travail 36 %</text><text x="238" y="37" text-anchor="middle" class="ui-sch-onbar">attente 64 %</text>
      <text x="20" y="72">repère : ~15 % courant · 40 %+ bon</text>
    </svg>`,
    velocity: `<svg viewBox="0 0 360 100" class="ui-schema" role="img" aria-label="Vélocité : points terminés par sprint">
      ${[37, 40, 35, 44, 38, 41].map((v, i) => `<rect x="${30 + i * 50}" y="${80 - v * 1.4}" width="30" height="${v * 1.4}" class="ui-sch-bar"/>`).join('')}
      <line x1="20" y1="${80 - 39 * 1.4}" x2="340" y2="${80 - 39 * 1.4}" class="ui-sch-dash"/><text x="345" y="${84 - 39 * 1.4}">moy.</text>
      <text x="180" y="96" text-anchor="middle">le sprint 🍃 de respiration n'entre jamais dans la moyenne</text>
    </svg>`,
    capbase: `<svg viewBox="0 0 360 100" class="ui-schema" role="img" aria-label="Base = vélocité moyenne × sprints × (1 − absences)">
      <text x="20" y="30" class="ui-sch-strong">vélocité moy. 2 PI</text><text x="150" y="30">×</text><text x="170" y="30" class="ui-sch-strong">sprints</text><text x="235" y="30">×</text><text x="255" y="30" class="ui-sch-strong">(1 − absences)</text>
      <text x="20" y="60">39 pts × 4 × (1 − 9 %) = <tspan class="ui-sch-strong">142 pts</tspan></text>
      <text x="20" y="85">⚠ ETP pondéré par rôle : Dev 100 % · Tech Lead 70 % · PO/SM 0 %</text>
    </svg>`,
    hscore: `<svg viewBox="0 0 360 100" class="ui-schema" role="img" aria-label="Score = 100 − anomalies pondérées">
      <text x="20" y="30">score = 100 − <tspan class="ui-sch-strong">anomalies pondérées</tspan> ÷ tickets actifs × 35</text>
      <rect x="20" y="45" width="320" height="14" class="ui-sch-scale"/>
      <text x="40" y="80">critique</text><text x="140" y="80">attention</text><text x="225" y="80">correct</text><text x="305" y="80">excellent</text>
    </svg>`,
    objectives: `<svg viewBox="0 0 360 90" class="ui-schema" role="img" aria-label="Objectif = rollup de ses features">
      <rect x="20" y="15" width="320" height="22" rx="6" class="ui-sch-seg ui-sch-seg--cycle"/><text x="180" y="30" text-anchor="middle" class="ui-sch-onbar">Objectif · 45 % (rollup)</text>
      <rect x="20" y="52" width="150" height="18" rx="4" class="ui-sch-seg ui-sch-seg--wait"/><text x="95" y="65" text-anchor="middle" class="ui-sch-onbar">FEAT-305 · 45 %</text>
      <rect x="190" y="52" width="150" height="18" rx="4" class="ui-sch-seg ui-sch-seg--wait"/><text x="265" y="65" text-anchor="middle" class="ui-sch-onbar">FEAT-308 · 60 %</text>
      <text x="180" y="86" text-anchor="middle">commis = engagement · extension = si le temps le permet</text>
    </svg>`,
};

const popLct = () => helpPopover({ title: 'Lead time vs cycle time', schema: SCHEMAS.lct, body: `<p><b>Lead time</b> : de la création à la livraison — ce que <i>le client</i> attend. <b>Cycle time</b> : du démarrage à la livraison — ce que <i>l'équipe</i> maîtrise.</p><p>Réduire l'attente en file coûte moins que travailler plus vite.</p>` });
const popScore = () => helpPopover({ title: 'Le score de santé', schema: SCHEMAS.hscore, body: `<p>Chaque anomalie pèse selon sa gravité (bloqué > 48 h pèse 3, sans estimation 1). Un ticket <code>done</code> n'entre jamais dans le compte.</p>` });

/** Palette Ctrl+K. */
const cmdk = () => `
  <div class="ui-overlay ui-overlay--top">
    <div class="ui-cmdk" role="dialog" aria-modal="true" aria-label="Recherche rapide">
      <input class="ui-cmdk-in" type="text" value="velo" aria-label="Rechercher">
      <ul class="ui-cmdk-list">
        <li class="is-active"><i>📊</i><span>Dashboard › <b>Vélocité</b></span><kbd>↵</kbd></li>
        <li><i>🗓️</i><span>PI Planning › Capacité › <b>Vélocité moyenne</b></span></li>
        <li><i>📈</i><span>Rapports › Sprint › <b>Vélocité</b></span></li>
        <li><i>🛡️</i><span>Santé › Sprints du PI › <b>Vélo</b></span></li>
      </ul>
      <footer><kbd>↑↓</kbd> naviguer · <kbd>↵</kbd> ouvrir · <kbd>Esc</kbd> fermer · les mots-clés se cherchent <b>sans accents</b></footer>
    </div>
  </div>`;

/* ── États live ──────────────────────────────────────────────────────── */

const dailyBar = () => `<div class="ui-daily"><span class="ui-live-dot"></span><b>Daily · Vega</b><span class="ui-daily-timer">11:24</span><span class="ui-bar ui-bar--thin"><span class="ui-bar-fill ui-bar-fill--good" style="width:76%"></span></span><span>3/5 ont parlé</span><button class="ui-btn ui-btn--ghost" type="button">⏸</button><button class="ui-btn ui-btn--ghost" type="button">Terminer</button></div>`;

const syncCard = ({ failed = false } = {}) => `
  <div class="ui-sync${failed ? ' ui-sync--failed' : ''}" role="status">
    <header><span class="ui-live-dot${failed ? ' is-off' : ''}"></span><b>${failed ? 'Import JIRA terminé — avec incidents' : 'Import JIRA en cours'}</b><span class="ui-sync-timer">${failed ? '2 min 41 s' : '01:12'}</span></header>
    <div class="ui-bar"><span class="ui-bar-fill ui-bar-fill--${failed ? 'warn' : 'info'}" style="width:${failed ? 100 : 58}%"></span></div>
    <p class="ui-muted">${failed ? '17 appels · 212 sprints archivés · 3 opérations en échec' : 'Passe 3/5 — tickets des sprints clos (26 sprints, changelog compris) · 9/17 appels'}</p>
    ${failed ? `<ul class="ui-sync-inc"><li>🔐 <b>Board Orion</b> — 401 : jeton expiré. <i>Panne d'authentification, pas une absence de données.</i></li><li>⏱️ <b>Sprint 29.4 Lyra</b> — timeout (30 s)</li><li>📭 <b>Vélocité Sirius</b> — 404 : board sans estimation (nominal)</li></ul><footer><button class="ui-btn" type="button">Relancer les 3</button><button class="ui-btn ui-btn--ghost" type="button">Fermer le rapport</button></footer>` : ''}
  </div>`;

const banner = (kind, text, action = '') => `<div class="ui-banner ui-banner--${kind}"><span>${text}</span>${action ? `<button class="ui-btn" type="button">${action}</button>` : ''}</div>`;

const consensus = () => `
  <div class="ui-consensus">
    <div class="ui-consensus-votes">${['Théo', 'Lucie', 'Maxime', 'Chloé', 'Nadia'].map((n, i) => `<span class="ui-consensus-v${i < 4 ? ' is-in' : ''}"><i>${i < 4 ? ['🤟', '🖐️', '🤟', '✌️'][i] : '…'}</i><small>${n}</small></span>`).join('')}</div>
    <div class="ui-consensus-avg"><b>4,0</b><small>/5 · 4/5 votes</small><span class="ui-badge ui-badge--inprog">en attente de Nadia</span></div>
    <p class="ui-muted">Un ✌️ 2 déclenche la discussion : « qu'est-ce qui te ferait passer à 4 ? »</p>
  </div>`;

/* ── Annotations (explications visuelles) ────────────────────────────── */

/** Pastille numérotée posée en absolu dans un cadre ; le texte vit dans la légende. */
const annot = (n, x, y) => `<span class="ui-annot" style="--x:${x};--y:${y}"><b>${n}</b></span>`;
const annotLegend = (items) => `<ol class="ui-annot-legend">${items.map((t, i) => `<li><b>${i + 1}</b><span>${t}</span></li>`).join('')}</ol>`;

module.exports = {
    sidebar, topbar, tabbar, shell, modal, field, input, select, seg, modalTicket, modalObjective, modalFist, modalDanger,
    toastUndo, helpPopover, SCHEMAS, popLct, popScore, cmdk, dailyBar, syncCard, banner, consensus, annot, annotLegend,
};
