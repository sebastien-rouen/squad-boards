/**
 * Composants du DASHBOARD — HTML pur sur les classes `ui-*` de `_shared/ui.css`.
 *
 * Chaque composant est une fonction pure (données → chaîne). Les directions
 * n'en réécrivent aucun : elles les ARRANGENT (layouts.js) et les HABILLENT
 * (mockup-N/style.css via le pont de tokens `--ui-*`).
 */
const D = require('./data');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS_LABEL = { todo: 'À faire', inprog: 'En cours', review: 'Revue', test: 'Test', blocked: 'Bloqué', done: 'Terminé', slipped: 'Reporté' };
const SEV = (pct) => (pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad');

/** Bouton « ? » : ouvre le popover explicatif (schéma). `key` = sujet. */
const help = (key, label) => `<button class="ui-help" type="button" data-help="${key}" aria-label="${esc(label)}" title="${esc(label)}">?</button>`;

/** Titre de section. */
const sec = (title, sub = '', extra = '') => `
  <header class="ui-sec">
    <h2>${title}</h2>${sub ? `<span class="ui-sec-sub">${sub}</span>` : ''}${extra}
  </header>`;

/** Carte générique. `dom` = domaine sémantique (flow | pi | report | health). */
const card = ({ title, sub = '', body, dom = 'flow', helpKey = '', cls = '', foot = '' }) => `
  <article class="ui-card ${cls}" data-dom="${dom}">
    <header class="ui-card-hd">
      <span class="ui-card-title">${title}${helpKey ? ' ' + help(helpKey, 'Comprendre ' + title.replace(/<[^>]+>/g, '')) : ''}</span>
      ${sub ? `<span class="ui-card-sub">${sub}</span>` : ''}
    </header>
    <div class="ui-card-bd">${body}</div>
    ${foot ? `<footer class="ui-card-ft">${foot}</footer>` : ''}
  </article>`;

/** Tuile KPI. */
const kpi = ({ label, value, unit = '', sub = '', sev = 'info', trend = '', dom = 'flow', helpKey = '' }) => `
  <div class="ui-kpi ui-kpi--${sev}" data-dom="${dom}">
    <span class="ui-kpi-lbl">${label}${helpKey ? ' ' + help(helpKey, label) : ''}</span>
    <span class="ui-kpi-val">${value}${unit ? `<small>${unit}</small>` : ''}${trend ? `<em class="ui-kpi-trend ${trend.startsWith('+') || trend.startsWith('↗') ? 'is-up' : 'is-down'}">${trend}</em>` : ''}</span>
    ${sub ? `<span class="ui-kpi-sub">${sub}</span>` : ''}
  </div>`;

/** Les 8 KPI du sprint courant. */
const kpiGrid = (which = 'all') => {
    const k = D.KPIS;
    const primary = [
        kpi({ label: 'Tickets', value: k.tickets.total, sub: `${k.tickets.done} terminés · ${k.tickets.pct} %`, sev: 'info' }),
        kpi({ label: 'Story points', value: `${k.points.done}<small>/${k.points.total}</small>`, sub: `${k.points.pct} % réalisés`, sev: SEV(k.points.pct) }),
        kpi({ label: 'En cours', value: k.inprog, sub: 'tickets actifs', sev: 'info' }),
        kpi({ label: 'Bloqués', value: k.blocked, sub: k.blocked ? 'attention requise' : 'aucun impediment', sev: k.blocked ? 'bad' : 'good' }),
    ];
    const secondary = [
        kpi({ label: 'Débit (7 j)', value: k.throughput7, trend: `↗ +${k.throughputTrend}`, sub: 'tickets terminés / semaine', sev: 'info', helpKey: 'throughput' }),
        kpi({ label: 'Cycle time méd.', value: k.cycleMed, unit: ' j', sub: `lead time méd. ${k.leadMed} j`, sev: 'info', helpKey: 'lct' }),
        kpi({ label: 'Flow efficiency', value: k.flowEff, unit: ' %', sub: `travail ${k.cycleMed} j · attente ${k.waitMed} j`, sev: k.flowEff >= 40 ? 'good' : 'warn', helpKey: 'floweff' }),
        kpi({ label: 'Sans estimation', value: k.noEstimate, sub: `${k.noLead} sans lead`, sev: k.noEstimate ? 'warn' : 'good' }),
    ];
    const list = which === 'primary' ? primary : which === 'secondary' ? secondary : primary.concat(secondary);
    return `<div class="ui-kpi-grid ui-kpi-grid--${which}">${list.join('')}</div>`;
};

/** Cap de l'équipe : objectif de sprint + objectifs PI. */
const sprintGoal = () => card({
    title: '🎯 Objectif du sprint', sub: `Ité ${D.CURRENT.key}`, dom: 'flow',
    body: `<p class="ui-goal">${esc(D.CURRENT.goal)}</p>
      <div class="ui-goal-meta"><span>${D.KPIS.tickets.done}/${D.KPIS.tickets.total} tickets</span><span>${D.KPIS.points.done}/${D.KPIS.points.total} pts</span><span>J${D.TODAY.dayIdx}/${D.TODAY.dayTotal}</span></div>`,
});

const piObjectives = (compact = false) => card({
    title: '🗓️ Objectifs du PI', sub: `PI #${D.PI.num} · 1/3 atteint`, dom: 'pi', helpKey: 'objectives',
    body: `<ul class="ui-objs${compact ? ' ui-objs--compact' : ''}">${D.OBJECTIVES.filter((o) => o.team === 'Vega').map((o) => `
      <li class="ui-obj">
        <span class="ui-obj-name">${esc(o.name)}</span>
        <span class="ui-tag ui-tag--${o.committed ? 'commit' : 'stretch'}">${o.committed ? 'Commis' : 'Extension'}</span>
        <span class="ui-obj-bv" title="Business value">${o.bv} BV</span>
        <span class="ui-bar"><span class="ui-bar-fill ui-bar-fill--${SEV(o.pct)}" style="width:${o.pct}%"></span></span>
        <b class="ui-obj-pct">${o.pct} %</b>
      </li>`).join('')}</ul>`,
});

/** En-tête du sprint en cours avec frise temporelle J7/10. */
const sprintHeader = () => {
    const s = D.CURRENT;
    return `
  <section class="ui-sprint" data-dom="flow">
    <div class="ui-sprint-top">
      <span class="ui-sprint-name">▶ ${esc(s.name)}</span>
      <span class="ui-sprint-dates">17 → 28 août</span>
      <span class="ui-sprint-left"><b>3</b> jours restants</span>
    </div>
    <div class="ui-tl" role="img" aria-label="Sprint à 70 % du temps, 65 % des points réalisés">
      <span class="ui-tl-fill" style="width:${D.KPIS.points.pct}%"></span>
      <span class="ui-tl-today" style="left:${D.TODAY.pct}%"><i>aujourd'hui</i></span>
    </div>
    <div class="ui-tl-scale"><span>17 août</span><span>${D.KPIS.points.pct} % des points · ${D.TODAY.pct} % du temps</span><span>28 août</span></div>
  </section>`;
};

/** Bande des sprints du PI — le contenu riche à conserver (US / Buffer / Action, glissés, points). */
const sprintStrip = ({ detail = true } = {}) => `
  <div class="ui-strip">${D.SPRINTS.map((s) => {
      const ratio = s.pts ? Math.round((s.done / s.pts) * 100) : 0;
      const icon = s.breath ? '🍃' : s.state === 'closed' ? '✓' : s.state === 'active' ? '▶' : '○';
      const g = s.groups;
      const groups = detail && !s.breath ? `
        <div class="ui-strip-groups">
          ${[['📗', 'US', g.us], ['🧯', 'Buffer', g.buffer], ['🛠️', 'Action', g.action]].map(([ic, lb, v]) => v ? `
          <div class="ui-strip-grp"><span>${ic} ${lb} <small>(${v.n})</small></span><span>${v.pts} pts · <b>${v.done}</b> fait</span></div>` : '').join('')}
        </div>` : '';
      return `
    <article class="ui-strip-card ui-strip-card--${s.breath ? 'breath' : s.state}">
      <header class="ui-strip-hd"><span class="ui-strip-st">${icon}</span><b>${s.key}</b><span class="ui-strip-dates">${s.start.slice(8)}/${s.start.slice(5, 7)} → ${s.end.slice(8)}/${s.end.slice(5, 7)}</span></header>
      <p class="ui-strip-goal${s.goal ? '' : ' is-empty'}">${esc(s.goal || 'Aucun objectif défini')}</p>
      ${s.pts ? `<div class="ui-bar ui-bar--thin"><span class="ui-bar-fill ui-bar-fill--${SEV(ratio)}" style="width:${ratio}%"></span></div>
      <div class="ui-strip-nums"><span><b>${s.done}</b>/${s.pts} pts</span><span>${s.tkDone}/${s.tk} tk</span>${s.slipped ? `<span class="ui-slip">↪ ${s.slipped} glissés</span>` : ''}</div>` : '<div class="ui-strip-nums"><span>Respiration — pas de charge</span></div>'}
      ${groups}
    </article>`;
  }).join('')}</div>`;

/** Schéma lead time / cycle time (celui du site, en composant). */
const lctSchema = () => card({
    title: 'Lead time & cycle time', sub: '9 tickets terminés', dom: 'flow', helpKey: 'lct',
    body: `
    <div class="ui-lct">
      <span class="ui-lct-node">📥<small>Créé</small></span>
      <span class="ui-lct-seg ui-lct-seg--wait"><i>Attente</i><b>${D.KPIS.waitMed} j</b></span>
      <span class="ui-lct-node">▶️<small>Démarré</small></span>
      <span class="ui-lct-seg ui-lct-seg--cycle"><i>Cycle time</i><b>${D.KPIS.cycleMed} j</b></span>
      <span class="ui-lct-node">✅<small>Terminé</small></span>
    </div>
    <div class="ui-lct-lead">⟵ Lead time médian · <b>${D.KPIS.leadMed} j</b> ⟶</div>
    <div class="ui-floweff"><span>⚡ Flow efficiency</span><span class="ui-bar"><span class="ui-bar-fill ui-bar-fill--warn" style="width:${D.KPIS.flowEff}%"></span></span><b>${D.KPIS.flowEff} %</b></div>`,
});

/** Temps par colonne : barre empilée. */
const stageFlow = () => {
    const total = D.STAGES.reduce((s, x) => s + x.days, 0);
    return card({
        title: 'Temps par colonne', sub: 'médianes · reports compris', dom: 'flow', helpKey: 'stages',
        body: `<div class="ui-stage">${D.STAGES.map((s) => `<span class="ui-stage-seg" style="flex:${s.days};--seg:${s.color}"><i>${s.label}</i><b>${s.days} j</b></span>`).join('')}</div>
        <p class="ui-muted">${total.toFixed(1)} j de traversée médiane — la file « À faire » en prend ${Math.round((D.STAGES[0].days / total) * 100)} %.</p>`,
    });
};

/** Vélocité : barres CSS + ligne de cible. */
const velocity = () => {
    const max = Math.max(...D.VELOCITY.map((v) => v.pts), D.VELO_TARGET) * 1.15;
    return card({
        title: 'Vélocité', sub: `moy. ${D.VELO_AVG} pts · cible ${D.VELO_TARGET}`, dom: 'flow', helpKey: 'velocity',
        body: `<div class="ui-velo" style="--target:${Math.round((D.VELO_TARGET / max) * 100)}%">
          <span class="ui-velo-target"><i>cible ${D.VELO_TARGET}</i></span>
          ${D.VELOCITY.map((v) => `<span class="ui-velo-bar${v.current ? ' is-current' : ''}" style="--h:${Math.round((v.pts / max) * 100)}%"><b>${v.pts}</b><i>${v.label}</i></span>`).join('')}
        </div>`,
    });
};

/** Aging WIP. */
const agingWip = () => card({
    title: 'Ancienneté du travail en cours', sub: `P50 ${D.AGING.p50} j · P85 ${D.AGING.p85} j`, dom: 'flow', helpKey: 'aging',
    body: `<div class="ui-aging">${D.AGING.cols.map((c) => `
      <div class="ui-aging-col"><header>${c.label} <small>${c.tks.length}</small></header>
        ${c.tks.map((t) => `<span class="ui-chip ui-chip--${t.age > D.AGING.p85 ? 'bad' : t.age > D.AGING.p50 ? 'warn' : 'good'}">${t.id}<b>${t.age} j</b></span>`).join('')}
      </div>`).join('')}</div>`,
});

/** Prévision Monte-Carlo : jauge conique. */
const forecast = () => card({
    title: 'Prévision de fin de sprint', sub: `${D.FORECAST.runs.toLocaleString('fr-FR')} simulations`, dom: 'flow', helpKey: 'forecast',
    body: `<div class="ui-forecast">
      <span class="ui-gauge ui-gauge--${SEV(D.FORECAST.probability)}" style="--pct:${D.FORECAST.probability}"><b>${D.FORECAST.probability} %</b><i>de finir à temps</i></span>
      <dl class="ui-forecast-dl"><dt>Fin probable (P50)</dt><dd>${D.FORECAST.p50}</dd><dt>Fin prudente (P85)</dt><dd>${D.FORECAST.p85}</dd></dl>
    </div>`,
});

/** Cartes équipes. */
const teamCards = () => `<div class="ui-teams">${D.TEAM_STATS.map((t) => {
    const c = D.TEAMS.find((x) => x.name === t.team).color;
    const pct = Math.round((t.ptsDone / t.pts) * 100);
    return `
    <article class="ui-team" style="--team:${c}">
      <header><span class="ui-team-dot"></span><b>${t.team}</b><span class="ui-team-health ui-team-health--${SEV(t.health)}">${t.health}</span></header>
      <span class="ui-ring ui-ring--${SEV(pct)}" style="--pct:${pct}"><b>${pct} %</b></span>
      <dl><dt>Tickets</dt><dd>${t.done}/${t.tk}</dd><dt>Points</dt><dd>${t.ptsDone}/${t.pts}</dd><dt>Bloqués</dt><dd class="${t.blocked ? 'is-bad' : ''}">${t.blocked}</dd></dl>
    </article>`;
}).join('')}</div>`;

/** SLA review. */
const slaReview = () => card({
    title: 'Respect du seuil de cycle time', sub: 'seuil 10 j · 9 tickets', dom: 'health', helpKey: 'sla',
    body: `<div class="ui-sla"><span class="ui-ring ui-ring--good" style="--pct:78"><b>78 %</b></span>
      <ul><li>7 tickets sous le seuil</li><li class="is-warn">2 au-dessus — VEGA-398 (14 j), ORION-88 (17 j)</li></ul></div>`,
});

/** Bloqués / stagnants. */
const stuckList = () => card({
    title: 'Tickets bloqués ou stagnants', sub: 'sans mouvement depuis ≥ 5 j', dom: 'health',
    body: `<ul class="ui-stuck">${D.STUCK.map((t) => `
      <li class="ui-stuck-row"><span class="ui-dot" style="--dot:var(--status-${t.status})"></span><code>${t.id}</code><span class="ui-stuck-title">${esc(t.title)}</span>
        <span class="ui-badge ui-badge--${t.status}">${STATUS_LABEL[t.status]}</span><span class="ui-stuck-lead${t.lead ? '' : ' is-none'}">${t.lead || 'Non assigné'}</span><b class="ui-stuck-age ${t.age >= 8 ? 'is-bad' : 'is-warn'}">${t.age} j</b></li>`).join('')}</ul>`,
});

/** Activité récente. */
const activity = (max = 5) => card({
    title: 'Activité récente', sub: `${D.FEED.length} changements`, dom: 'report',
    body: `<ul class="ui-feed">${D.FEED.slice(0, max).map((f) => `<li><time>${f.when}</time><b>${f.who}</b><code>${f.what}</code><span>${f.change}</span></li>`).join('')}</ul>`,
});

/** Astreinte de la semaine. */
const oncall = () => `<div class="ui-oncall"><span class="ui-oncall-lbl">🛡️ Astreinte cette semaine</span>${D.ONCALL.map((p) => `<span class="ui-oncall-chip" style="--team:${p.color}"><i>${p.name.split(' ').map((x) => x[0]).join('')}</i>${p.name}<small>${p.team}</small></span>`).join('')}</div>`;

/** Écran vide utile. */
const empty = ({ icon = '🫙', title, text, action = '' }) => `
  <div class="ui-empty"><span class="ui-empty-ico">${icon}</span><b>${title}</b><p>${text}</p>${action ? `<button class="ui-btn ui-btn--primary" type="button">${action}</button>` : ''}</div>`;

module.exports = {
    esc, help, sec, card, kpi, kpiGrid, sprintGoal, piObjectives, sprintHeader, sprintStrip, lctSchema, stageFlow,
    velocity, agingWip, forecast, teamCards, slaReview, stuckList, activity, oncall, empty, STATUS_LABEL, SEV,
};
