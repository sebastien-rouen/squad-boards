/**
 * Composants PI PLANNING, RAPPORTS et SANTÉ — HTML pur sur `ui-*`.
 * Feuilles : `_shared/ui-pi.css` et `_shared/ui-health.css`.
 */
const D = require('./data');
const { esc, help, card, SEV, STATUS_LABEL } = require('./ui-dash');

const teamColor = (name) => (D.TEAMS.find((t) => t.name === name) || { color: 'var(--text-muted)' }).color;

/** Barre d'onglets (rail) — `active` = id. */
const tabs = (items, active) => `<nav class="ui-tabs" aria-label="Sections">${items.map((t) => `<a class="ui-tab${t.id === active ? ' is-active' : ''}" href="#${t.id}"${t.id === active ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}</nav>`;

/** Sélecteur de PI (PI-2 … PI+2). */
const piSelector = () => `<div class="ui-pisel" role="group" aria-label="Choisir le PI">${[28, 29, 30, 31, 32].map((n) => `<button type="button" class="ui-pisel-btn${n === D.PI.num ? ' is-active' : ''}">PI ${n}${n === D.PI.num ? ' <small>courant</small>' : ''}</button>`).join('')}</div>`;

/* ── PI Planning ─────────────────────────────────────────────────────── */

const piObjectivesFull = () => `
  <div class="ui-pi-objs">
    ${['Engagements', 'Extension'].map((grp) => {
        const list = D.OBJECTIVES.filter((o) => o.team === 'Vega' && (grp === 'Engagements' ? o.committed : !o.committed));
        return `<section class="ui-pi-objgrp"><h3>${grp === 'Engagements' ? '🎯' : '✨'} ${grp} <small>${list.length}</small></h3>
        ${list.map((o) => `
        <article class="ui-pi-obj">
          <span class="ui-ring ui-ring--${SEV(o.pct)}" style="--pct:${o.pct}"><b>${o.pct} %</b></span>
          <div class="ui-pi-obj-bd"><b>${esc(o.name)}</b><span class="ui-muted">Vega · ${o.status === 'done' ? 'atteint' : o.status === 'inprog' ? 'en cours' : 'non démarré'}</span></div>
          <span class="ui-obj-bv">${o.bv} BV</span>
          <button class="ui-btn ui-btn--ghost" type="button">✏️</button>
        </article>`).join('')}</section>`;
    }).join('')}
    <section class="ui-pi-objgrp ui-pi-objgrp--cross"><h3>🌐 Transverses <small>1</small></h3>
      <article class="ui-pi-obj"><span class="ui-ring ui-ring--bad" style="--pct:30"><b>30 %</b></span><div class="ui-pi-obj-bd"><b>Observabilité du train</b><span class="ui-muted">sans équipe — jamais écarté en silence</span></div><span class="ui-obj-bv">6 BV</span></article>
    </section>
  </div>`;

const capacityTable = () => `
  <table class="ui-table ui-cap">
    <thead><tr><th>Équipe</th><th>ETP</th><th>Sprints</th><th>Jours</th><th>Absences</th><th>Net</th><th>Base suggérée ${help('capbase', 'Comment la base est calculée')}</th></tr></thead>
    <tbody>${D.CAPACITY.map((c) => `<tr><td><span class="ui-dot" style="--dot:${teamColor(c.team)}"></span>${c.team}</td><td>${c.etp.toFixed(1)}</td><td>${c.sprints} <small>+ 🍃</small></td><td>${c.days}</td><td class="is-warn">− ${c.abs}</td><td><b>${c.net}</b></td><td class="${c.capped ? 'is-capped' : ''}">${c.base}${c.capped ? ' ⚠' : ''}</td></tr>`).join('')}</tbody>
  </table>
  <p class="ui-muted">⚠ Orion : la fenêtre dépasse la dernière absence connue — la base est un <b>plafond</b>, pas une prévision. Le sprint de respiration 🍃 ne compte nulle part.</p>`;

const featuresTable = () => `
  <table class="ui-table ui-feat">
    <thead><tr><th>#</th><th>Feature</th><th>Équipe</th><th>SP</th><th>Avancement</th></tr></thead>
    <tbody>${D.FEATURES.map((f) => `<tr><td class="ui-feat-rank">⠿ ${f.rank}</td><td><code>${f.id}</code> ${esc(f.title)}</td><td><span class="ui-dot" style="--dot:${teamColor(f.team)}"></span>${f.team}</td><td><b>${f.sp}</b></td><td><span class="ui-bar"><span class="ui-bar-fill ui-bar-fill--${SEV(f.pct)}" style="width:${f.pct}%"></span></span> ${f.pct} %</td></tr>`).join('')}</tbody>
  </table>
  <div class="ui-feat-cap"><span>Engagé <b>187 SP</b></span><span class="ui-bar"><span class="ui-bar-fill ui-bar-fill--warn" style="width:92%"></span></span><span>Capacité nette <b>146 j</b> · 92 %</span></div>`;

const depsMatrix = () => `
  <div class="ui-deps">
    <table class="ui-table ui-deps-mx"><thead><tr><th>de ↓ vers →</th>${D.TEAMS.map((t) => `<th><span class="ui-dot" style="--dot:${t.color}"></span>${t.name}</th>`).join('')}</tr></thead>
    <tbody>${D.DEPS.matrix.map(([from, row]) => `<tr><th>${from}</th>${D.TEAMS.map((t) => { const n = row[t.name]; return `<td class="${from === t.name ? 'is-self' : n ? 'is-cross' : ''}">${from === t.name ? '—' : n || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
    <div class="ui-deps-sum"><span class="ui-kpi ui-kpi--warn"><span class="ui-kpi-lbl">Liens inter-équipes</span><span class="ui-kpi-val">${D.DEPS.cross}</span><span class="ui-kpi-sub">bloquants, à traiter en séance</span></span>
      <ul class="ui-deps-list"><li><code>VEGA-415</code> ← attend <code>ORION-71</code> <em>API archive</em></li><li><code>VEGA-417</code> ← attend <code>ORION-74</code> <em>endpoint sprints</em></li><li><code>LYRA-201</code> ← attend <code>SIRIUS-40</code> <em>pool de connexions</em></li></ul></div>
  </div>`;

/** Burnup en SVG inline (périmètre vs réalisé). */
const burnup = () => {
    const W = 520, H = 200, padL = 36, padB = 26, padT = 12;
    const maxY = 150;
    const xs = D.BURNUP.labels.map((_, i) => padL + (i * (W - padL - 12)) / (D.BURNUP.labels.length - 1));
    const y = (v) => padT + (H - padB - padT) * (1 - v / maxY);
    const path = (arr) => arr.map((v, i) => (v == null ? null : `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
    return `
  <svg class="ui-burnup" viewBox="0 0 ${W} ${H}" role="img" aria-label="Burnup du PI : périmètre 134 points, réalisé 75">
    ${[0, 50, 100, 150].map((v) => `<g><line x1="${padL}" x2="${W - 12}" y1="${y(v)}" y2="${y(v)}" class="ui-burnup-grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="ui-burnup-lbl" text-anchor="end">${v}</text></g>`).join('')}
    ${D.BURNUP.labels.map((l, i) => `<text x="${xs[i]}" y="${H - 8}" class="ui-burnup-lbl" text-anchor="middle">${l}</text>`).join('')}
    <path d="${path(D.BURNUP.scope)}" class="ui-burnup-scope"/>
    <path d="${path(D.BURNUP.done)}" class="ui-burnup-done"/>
    <line x1="${xs[2]}" x2="${xs[2]}" y1="${padT}" y2="${H - padB}" class="ui-burnup-now"/>
    <text x="${xs[2] + 6}" y="${padT + 12}" class="ui-burnup-lbl">aujourd'hui</text>
    <circle cx="${xs[2]}" cy="${y(75)}" r="4" class="ui-burnup-pt"/>
  </svg>
  <div class="ui-legend"><span><i style="--dot:var(--status-todo)"></i>Périmètre 134 pts</span><span><i style="--dot:var(--status-done)"></i>Réalisé 75 pts · 56 %</span></div>`;
};

/** Distribution d'un vote 1→5. */
const voteDist = (kind) => {
    const v = D.VOTES[kind];
    const max = Math.max(...v.dist);
    const faces = kind === 'mood' ? ['😞', '😕', '😐', '🙂', '😄'] : ['✊', '☝️', '✌️', '🤟', '🖐️'];
    return `<div class="ui-vote">
      <div class="ui-vote-avg"><b>${v.avg.toFixed(1)}</b><small>/5</small><span>${v.n} votes</span></div>
      <div class="ui-vote-dist">${v.dist.map((n, i) => `<span class="ui-vote-bar" style="--h:${max ? Math.round((n / max) * 100) : 0}%"><b>${n || ''}</b><i>${faces[i]}</i></span>`).join('')}</div>
    </div>`;
};

/** Calendrier du PI : frise des sprints + PIP + fériés. */
const piCalendar = () => `
  <div class="ui-pical">${D.SPRINTS.map((s) => `<span class="ui-pical-sp ui-pical-sp--${s.breath ? 'breath' : s.state}"><b>${s.key}</b><small>${s.start.slice(8)}/${s.start.slice(5, 7)}</small></span>`).join('')}<span class="ui-pical-sp ui-pical-sp--pip"><b>PIP</b><small>12–13/10</small></span></div>
  <div class="ui-legend"><span><i style="--dot:var(--status-done)"></i>clos</span><span><i style="--dot:var(--status-inprog)"></i>en cours</span><span><i style="--dot:var(--status-todo)"></i>à venir</span><span><i style="--dot:var(--success)"></i>🍃 respiration</span><span><i style="--dot:var(--type-epic)"></i>PI Planning</span><span>🎌 fériés : 15 août</span></div>`;

/* ── Rapports ────────────────────────────────────────────────────────── */

const reportNav = (active = 'sprint') => `<nav class="ui-rpt-nav" aria-label="Sections du rapport">${D.REPORT_SECTIONS.map((s) => `<a class="ui-rpt-nav-it${s.id === active ? ' is-active' : ''}" href="#rpt-${s.id}">${s.icon} ${s.title}</a>`).join('')}</nav>`;

const reportSprint = ({ withCopy = true } = {}) => {
    const r = D.REPORT, s = r.sprint;
    const pct = Math.round((s.done / s.pts) * 100);
    return `
  <article class="ui-rpt" data-dom="report">
    <header class="ui-rpt-hd">
      <div><span class="ui-rpt-kicker">📋 Rapport de sprint</span><h3>${esc(s.name)} <small>3 → 14 août · clos</small></h3></div>
      ${withCopy ? `<div class="ui-rpt-copy"><button class="ui-btn" type="button">📄 Texte</button><button class="ui-btn" type="button">💬 Slack</button><button class="ui-btn" type="button">📘 Confluence</button><button class="ui-btn ui-btn--primary" type="button">⧉ Copier</button></div>` : ''}
    </header>
    <blockquote class="ui-rpt-goal">🎯 ${esc(s.goal)}</blockquote>
    <div class="ui-rpt-kpis">
      <span class="ui-kpi ui-kpi--${SEV(Math.round((s.tkDone / s.tk) * 100))}"><span class="ui-kpi-lbl">Tickets</span><span class="ui-kpi-val">${s.tkDone}<small>/${s.tk}</small></span><span class="ui-kpi-sub">${Math.round((s.tkDone / s.tk) * 100)} %</span></span>
      <span class="ui-kpi ui-kpi--${SEV(pct)}"><span class="ui-kpi-lbl">Points</span><span class="ui-kpi-val">${s.done}<small>/${s.pts}</small></span><span class="ui-kpi-sub">${pct} %</span></span>
      <span class="ui-kpi ui-kpi--warn"><span class="ui-kpi-lbl">Reportés</span><span class="ui-kpi-val">${s.slipped}</span><span class="ui-kpi-sub">↪ 30.2</span></span>
      <span class="ui-kpi ui-kpi--info"><span class="ui-kpi-lbl">Mood · Confiance</span><span class="ui-kpi-val">${s.mood}<small> · ${s.fist}</small></span><span class="ui-kpi-sub">/5</span></span>
    </div>
    ${r.groups.map((g) => `
    <section class="ui-rpt-grp">
      <h4>${g.icon} ${g.label} <small>${g.done}/${g.n} · ${g.ptsDone}/${g.pts} pts</small><span class="ui-badge ui-badge--${g.done === g.n ? 'done' : 'inprog'}">${g.done === g.n ? 'complet' : 'partiel'}</span></h4>
      <ul>${g.tks.map((t) => `<li class="ui-rpt-tk${t.status === 'done' ? ' is-done' : ''}"><span class="ui-dot" style="--dot:var(--status-${t.status === 'slipped' ? 'todo' : t.status})"></span><code>${t.id}</code><span>${esc(t.title)}</span><b>${t.pts} pts</b>${t.status === 'slipped' ? `<em class="ui-slip">↪ ${t.to}</em>` : '<em>✅</em>'}</li>`).join('')}</ul>
    </section>`).join('')}
  </article>`;
};

const slackPreview = () => `
  <div class="ui-slack" aria-label="Aperçu Slack">
    <div class="ui-slack-hd">📋 <b>Sprint 30.1 · Vega</b> <span>(3 → 14 août)</span></div>
    <div>🎯 <b>Objectif</b> : Automatiser l'export RH des absences</div>
    <div>📊 <b>Tickets</b> : 15/18 <span class="ui-slack-pill is-good">83 %</span></div>
    <div>💎 <b>Points</b>  : 41/48 <span class="ui-slack-pill is-good">85 %</span></div>
    <div>📝 <b>USER STORIES</b> — 10 tickets · <b>30/34 pts</b> <span class="ui-slack-pill is-warn">8/10</span></div>
    <div class="ui-slack-li">✅ Parser CSV pivot RH — colonnes-dates <span>[8 pts]</span></div>
    <div class="ui-slack-li">✅ Déduplication (nom, début, fin) <span>[5 pts]</span></div>
    <div class="ui-slack-li">⬜ Export CSV — BOM UTF-8 <span>[5 pts] ↪ 30.2</span></div>
  </div>`;

/* ── Santé ───────────────────────────────────────────────────────────── */

const sparkline = (arr, cls = '') => {
    const W = 120, H = 32, max = Math.max(...arr), min = Math.min(...arr);
    const pts = arr.map((v, i) => `${(i * W) / (arr.length - 1)},${H - 4 - ((v - min) / (max - min || 1)) * (H - 8)}`);
    return `<svg class="ui-spark ${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="M${pts.join(' L')}" /><circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="3"/></svg>`;
};

const healthScore = () => {
    const h = D.HEALTH;
    return `
  <section class="ui-hscore ui-hscore--${SEV(h.score)}" data-dom="health">
    <span class="ui-ring ui-ring--lg ui-ring--${SEV(h.score)}" style="--pct:${h.score}"><b>${h.score}</b><small>/100</small></span>
    <div class="ui-hscore-bd"><b>${h.label} <em class="ui-kpi-trend is-up">${h.trend}</em> ${help('hscore', 'Comment le score est calculé')}</b><span class="ui-muted">4 équipes · 52 tickets actifs · sur 30 jours</span>${sparkline(h.history)}</div>
  </section>`;
};

const anomalyCards = () => `<div class="ui-hcards">${D.HEALTH.anomalies.map((a) => `
  <button class="ui-hcard ui-hcard--${a.sev}${a.n ? '' : ' is-zero'}" type="button" title="${esc(a.desc)}">
    <span class="ui-hcard-ico">${a.icon}</span><b class="ui-hcard-val">${a.n}</b><span class="ui-hcard-lbl">${a.label}</span><small>${esc(a.desc)}</small>
  </button>`).join('')}</div>`;

const healthMatrix = () => {
    const A = D.HEALTH.anomalies;
    const maxCol = A.map((_, i) => Math.max(1, ...D.HEALTH.matrix.map((r) => r.cells[i])));
    return `
  <div class="ui-table-wrap"><table class="ui-table ui-hmx">
    <thead><tr><th>Équipe</th>${A.map((a) => `<th title="${esc(a.desc)}"><span>${a.icon}</span><small>${a.label}</small></th>`).join('')}<th>Total</th><th>Capacité ${help('capbase', 'Capacité nette du PI')}</th><th>🎭 Mood</th><th>✊ Confiance</th></tr></thead>
    <tbody>${D.HEALTH.matrix.map((r) => {
        const tot = r.cells.reduce((s, x) => s + x, 0);
        const ts = D.TEAM_STATS.find((t) => t.team === r.team);
        return `<tr><th><span class="ui-dot" style="--dot:${teamColor(r.team)}"></span>${r.team}</th>${r.cells.map((n, i) => `<td class="ui-hcell" style="--heat:${(n / maxCol[i]).toFixed(2)}">${n || '·'}</td>`).join('')}<td class="ui-hmx-tot ${tot >= 10 ? 'is-bad' : tot >= 5 ? 'is-warn' : 'is-good'}"><b>${tot}</b></td><td class="${r.capped ? 'is-capped' : ''}">${r.cap} %${r.capped ? ' ⚠' : ''}</td><td>${ts.mood.toFixed(1)}</td><td>${(ts.mood + 0.3).toFixed(1)}</td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
};

const healthVotes = () => `
  <table class="ui-table ui-hvotes"><thead><tr><th>Sprint</th><th>Engagé</th><th>Réalisé</th><th>Tenu</th><th>🎭 Mood</th><th>✊ Confiance</th></tr></thead>
  <tbody>${D.SPRINTS.filter((s) => !s.breath).map((s) => `<tr class="${s.state === 'active' ? 'is-active' : ''}"><th>${s.state === 'closed' ? '✓' : s.state === 'active' ? '▶' : '○'} ${s.key}</th><td>${s.pts || '—'}</td><td>${s.state === 'future' ? '—' : s.done}</td><td>${s.pts && s.state !== 'future' ? `<span class="ui-bar"><span class="ui-bar-fill ui-bar-fill--${SEV(Math.round((s.done / s.pts) * 100))}" style="width:${Math.round((s.done / s.pts) * 100)}%"></span></span>` : '—'}</td><td class="ui-vote-cell">${s.mood ? `<b class="ui-mood ui-mood--${s.mood >= 3.5 ? 'good' : 'warn'}">${s.mood.toFixed(1)}</b>` : '<i>voter</i>'}</td><td class="ui-vote-cell">${s.fist ? `<b class="ui-mood ui-mood--good">${s.fist.toFixed(1)}</b>` : '<i>voter</i>'}</td></tr>`).join('')}</tbody></table>`;

const coverageBanner = () => `<div class="ui-cov"><span>📡 Couverture JIRA</span><span class="ui-bar"><span class="ui-bar-fill ui-bar-fill--good" style="width:88%"></span></span><b>60 sprints rapatriés / 68 connus</b><small>historique plafonné par le réglage (26 sprints de détail), pas par JIRA</small></div>`;

module.exports = {
    teamColor, tabs, piSelector, piObjectivesFull, capacityTable, featuresTable, depsMatrix, burnup, voteDist, piCalendar,
    reportNav, reportSprint, slackPreview, sparkline, healthScore, anomalyCards, healthMatrix, healthVotes, coverageBanner,
};
