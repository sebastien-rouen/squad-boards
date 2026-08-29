/**
 * Composants des PAGES SECONDAIRES — board, backlog, paramètres, roster,
 * rotation, glossaire. Génériques (classes `ui-*`, feuille `_shared/ui-pages.css`),
 * donc réutilisables par n'importe quelle direction.
 */
const D = require('./data');
const M = require('./data-meteo');
const { esc, STATUS_LABEL, card } = require('./ui-dash');
const F = require('./ui-flows');

const initials = (n) => (n ? n.split(' ').map((x) => x[0]).join('') : '—');
const TYPE_ICON = { story: '📗', bug: '🐛', task: '🛠️', support: '🛡️' };

/* ── Board ───────────────────────────────────────────────────────────── */
const boardToolbar = (mode) => `
  <div class="ui-toolbar">
    <div class="ui-seg" role="radiogroup" aria-label="Mode"><button type="button" class="ui-seg-btn${mode === 'scrum' ? ' is-active' : ''}">🏃 Scrum</button><button type="button" class="ui-seg-btn${mode === 'kanban' ? ' is-active' : ''}">🗂️ Kanban</button></div>
    <div class="ui-seg" role="radiogroup" aria-label="Disposition"><button type="button" class="ui-seg-btn is-active" title="Colonnes">▥</button><button type="button" class="ui-seg-btn" title="Swimlanes">☰</button><button type="button" class="ui-seg-btn" title="Liste">≡</button></div>
    <div class="ui-filters"><span class="ui-chip is-on">Vega ✕</span><span class="ui-chip">Mes tickets</span><span class="ui-chip">📗 Story</span><span class="ui-chip">🐛 Bug</span><span class="ui-chip">Sans estimation</span></div>
    <button class="ui-btn ui-btn--ghost" type="button">📈 Graphes ▾</button>
  </div>`;

const WIP = { inprog: 4, review: 2, test: 3 };
const board = ({ mode = 'scrum', aging = false, tickets = D.TICKETS } = {}) => `
  ${boardToolbar(mode)}
  <div class="ui-board${aging ? ' ui-board--aging' : ''}">${['todo', 'inprog', 'review', 'test', 'done'].map((st) => {
      const tks = tickets.filter((t) => t.status === st || (st === 'inprog' && t.status === 'blocked'));
      const wip = WIP[st];
      const over = wip && tks.length > wip;
      const pts = tks.reduce((s, t) => s + (t.pts || 0), 0);
      return `<div class="ui-board-col${over ? ' is-over' : ''}" data-st="${st}"><header>${STATUS_LABEL[st]} <small>${tks.length}${wip ? '/' + wip : ''} · ${pts} pts</small>${over ? '<em>WIP dépassé</em>' : ''}</header>
        ${tks.map((t) => {
            const age = t.age ?? 0;
            const ageCls = aging ? (age > D.AGING.p85 ? ' ui-tk--crit' : age > D.AGING.p50 ? ' ui-tk--warn' : ' ui-tk--ok') : '';
            return `<article class="ui-tk${t.status === 'blocked' ? ' is-blocked' : ''}${ageCls}"><header><code>${t.id}</code><i>${TYPE_ICON[t.type] || '📗'}</i></header><span>${esc(t.title)}</span><footer><b>${t.pts ?? '?'} pts</b>${aging && st !== 'todo' && st !== 'done' ? `<em class="ui-tk-age">${age} j</em>` : ''}<i class="ui-avatar">${initials(t.lead)}</i>${t.status === 'blocked' ? '<em>🚫 3 j</em>' : ''}</footer></article>`;
        }).join('')}
        ${st === 'todo' ? '<button class="ui-tk ui-tk--add" type="button">+ Ajouter (N)</button>' : ''}
      </div>`;
  }).join('')}</div>
  ${aging ? `<div class="ui-legend"><span><i style="--dot:var(--success)"></i>≤ P50 (${D.AGING.p50} j)</span><span><i style="--dot:var(--warning)"></i>P50 → P85</span><span><i style="--dot:var(--danger)"></i>&gt; P85 (${D.AGING.p85} j) — à traiter au daily</span></div>` : ''}`;

/* ── Backlog ─────────────────────────────────────────────────────────── */
const backlog = ({ selected = ['VEGA-430', 'VEGA-431', 'VEGA-433'] } = {}) => {
    const groups = [['30.2 · en cours', M.BACKLOG.filter((t) => t.sprint === '30.2')], ['30.3', M.BACKLOG.filter((t) => t.sprint === '30.3')], ['30.4', M.BACKLOG.filter((t) => t.sprint === '30.4')], ['Sans sprint', M.BACKLOG.filter((t) => !t.sprint)]];
    return `
  <div class="ui-toolbar">
    <input class="ui-input ui-input--search" type="search" placeholder="Filtrer par titre, id, personne…" aria-label="Filtrer">
    <div class="ui-filters"><span class="ui-chip is-on">Vega ✕</span><span class="ui-chip is-on">PI 30 ✕</span><span class="ui-chip">Statut ▾</span><span class="ui-chip">Type ▾</span><span class="ui-chip">Epic ▾</span></div>
    <label class="ui-field ui-field--inline"><span class="ui-field-lbl">Grouper</span><select class="ui-input"><option>par sprint</option><option>par PI</option><option>par epic</option><option>aucun</option></select></label>
  </div>
  <div class="ui-backlog">${groups.map(([g, list]) => `
    <section class="ui-bl-grp"><header><b>${g}</b><small>${list.length} tickets · ${list.reduce((s, t) => s + (t.pts || 0), 0)} pts</small></header>
      ${list.map((t) => `<label class="ui-bl-row${selected.includes(t.id) ? ' is-selected' : ''}"><input type="checkbox"${selected.includes(t.id) ? ' checked' : ''} aria-label="Sélectionner ${t.id}"><i>${TYPE_ICON[t.type] || '📗'}</i><code>${t.id}</code><span class="ui-bl-title">${esc(t.title)}</span><span class="ui-badge ui-badge--${t.status}">${STATUS_LABEL[t.status]}</span><em class="ui-bl-prio ui-bl-prio--${t.prio}">${t.prio}</em><b>${t.pts ?? '?'}</b><i class="ui-avatar${t.lead ? '' : ' is-none'}">${initials(t.lead)}</i></label>`).join('')}
    </section>`).join('')}
  </div>
  <div class="ui-bulk"><b>${selected.length} sélectionnés</b><button class="ui-btn" type="button">→ Sprint ▾</button><button class="ui-btn" type="button">👤 Assigner ▾</button><button class="ui-btn" type="button">🏷️ Étiqueter</button><button class="ui-btn ui-btn--danger-ghost" type="button">Supprimer</button><span class="ui-spacer"></span><button class="ui-btn ui-btn--ghost" type="button">Tout désélectionner</button></div>`;
};

/* ── Paramètres ──────────────────────────────────────────────────────── */
const STG_GROUPS = [
    { label: 'Équipe', tabs: [['groupes', '🧩', 'Lignes produit'], ['equipes', '🏷️', 'Équipes'], ['membres', '👤', 'Membres'], ['roles', '⚡', 'Capacité par rôle'], ['absences', '🌴', 'Absences']] },
    { label: 'Planning', tabs: [['sprint-pi', '🗓️', 'Sprint & PI'], ['rotation', '🛡️', 'Rotation'], ['faits', '📌', 'Faits marquants'], ['rappels', '🔔', 'Rappels']] },
    { label: 'Météo', tabs: [['seuils', '🌤️', 'Seuils météo']] },
    { label: 'Intégrations', tabs: [['ics', '📅', 'Calendriers ICS'], ['jira', '🔌', 'Plugin JIRA'], ['slack', '💬', 'Slack']] },
    { label: 'Système', tabs: [['donnees', '💾', 'Données'], ['apropos', 'ℹ️', 'À propos']] },
];
const settingsTabs = (active) => `<nav class="ui-stg-tabs" aria-label="Sections">${STG_GROUPS.map((g) => `<div class="ui-stg-grp"><small>${g.label}</small><div>${g.tabs.map(([id, ic, lb]) => `<a class="ui-stg-tab${id === active ? ' is-active' : ''}" href="#settings/${id}"><i>${ic}</i><span>${lb}</span></a>`).join('')}</div></div>`).join('')}</nav>`;
const settingsShell = (active, body) => `${settingsTabs(active)}<div class="ui-stg-body">${body}</div>`;
const stgSec = (title, body, sub = '') => `<section class="ui-stg-sec"><header><h3>${title}</h3>${sub ? `<span class="ui-muted">${sub}</span>` : ''}</header>${body}</section>`;

const settingsTeams = () => settingsShell('equipes', `
  ${stgSec('🏷️ Équipes', `<table class="ui-table ui-stg-table"><thead><tr><th>Équipe</th><th>Couleur</th><th>Ligne produit</th><th>Membres</th><th>Board JIRA</th><th></th></tr></thead>
    <tbody>${M.TEAMS4.map((t) => `<tr><td><b>${t.name}</b></td><td><span class="ui-swatch" style="--team:${t.color}"></span><code>${t.color}</code></td><td>${t.group}</td><td>${t.members}</td><td><code>${t.name.toUpperCase()}-SCRUM</code></td><td><button class="ui-btn ui-btn--ghost" type="button">✏️</button></td></tr>`).join('')}</tbody></table>
    <button class="ui-btn ui-btn--primary" type="button">+ Équipe</button>`, '4 équipes · 2 lignes produit')}
  ${stgSec('🧩 Lignes produit', `<div class="ui-chips">${D.GROUPS.map((g) => `<span class="ui-chip is-on">${g.name} · ${g.teams.join(', ')}</span>`).join('')}<button class="ui-btn ui-btn--ghost" type="button">+ ligne produit</button></div>`, 'un filtre du topbar par ligne')}`);

const settingsSprintPi = () => settingsShell('sprint-pi', `
  ${stgSec('🗓️ Sprint & PI', `<div class="ui-form-grid">
    ${F.field('PI courant', F.input('30'), 'détecté depuis les noms de sprint (« Ite 30.2 ») — écrasable')}
    ${F.field('Début du PI', F.input('2026-08-03'), 'clé d\'appariement des rotations : le changer les rend invisibles → bouton « Recaler »')}
    ${F.field('Sprints par PI', F.seg(['4', '5', '6'], '5'), 'le dernier est la respiration 🍃')}
    ${F.field('Durée d\'un sprint', F.seg(['1 sem.', '2 sem.', '3 sem.'], '2 sem.'))}
    ${F.field('Jours de PI Planning (PIP)', `<div class="ui-chips"><span class="ui-chip is-on">12 oct. ✕</span><span class="ui-chip is-on">13 oct. ✕</span><button class="ui-btn ui-btn--ghost" type="button">+ jour</button></div>`, 'récupérables, hors capacité')}
    ${F.field('Cible de vélocité', F.input('42'), 'ligne pointillée sur le graphe')}
  </div>
  <div class="ui-note">📐 Récapitulatif : PI 30 = 3 août → 9 oct. · 5 sprints de 10 j ouvrés · 1 férié (15 août) · PIP 12–13 oct. — <b>écart CSV Congés : aucun</b>.</div>`, 'saisie manuelle prioritaire sur l\'import Congés')}`);

const settingsAbsences = ({ parsed = true } = {}) => settingsShell('absences', `
  ${stgSec('🌴 Import des absences (CSV)', `
    <div class="ui-import">
      <textarea class="ui-textarea" rows="6" aria-label="CSV">Nom;Equipe;Debut;Fin;Type;Jours
Théo Vasseur;Vega;2026-09-02;2026-09-03;conge;2
Maxime Giraud;Vega;2026-09-07;2026-09-11;conge;5
Nour Haddad;Vega;2026-09-14;2026-09-14;conge;0,5
Lucie Arnaud;Vega;2026-09-21;2026-09-21;CP;</textarea>
      ${parsed ? `<div class="ui-import-res">
        <b>Format « ligne par absence » reconnu</b>
        <div class="ui-import-nums"><span class="ui-kpi ui-kpi--good"><span class="ui-kpi-lbl">Absences</span><span class="ui-kpi-val">3</span><span class="ui-kpi-sub">2 nouvelles · 1 mise à jour (½ j)</span></span><span class="ui-kpi ui-kpi--warn"><span class="ui-kpi-lbl">Écartées</span><span class="ui-kpi-val">1</span><span class="ui-kpi-sub">« CP » n'est pas un nombre</span></span><span class="ui-kpi ui-kpi--info"><span class="ui-kpi-lbl">Chevauchements</span><span class="ui-kpi-val">0</span><span class="ui-kpi-sub">partiels, à arbitrer</span></span></div>
        <p class="ui-muted">⚠️ Ligne 5 : <code>Lucie Arnaud;…;CP;</code> — seul un nombre vaut absence ; la ligne est ignorée <b>et dite</b>, jamais en silence.</p>
        <div class="ui-seg"><button type="button" class="ui-seg-btn is-active">➕ Ajouter</button><button type="button" class="ui-seg-btn">♻️ Écraser du 2 sept. au 21 sept. (PIP compris)</button></div>
        <div class="ui-toolbar"><button class="ui-btn ui-btn--primary" type="button">Importer 3 absences</button><button class="ui-btn ui-btn--ghost" type="button">Annuler</button></div>
      </div>` : ''}
    </div>`, 'format « ligne par absence » ou pivot RH (colonnes-dates), détecté automatiquement')}`);

/* ── Roster & rotation ───────────────────────────────────────────────── */
const roster = () => `
  <table class="ui-table ui-roster"><thead><tr><th>Membre</th><th>Rôle</th><th>Capacité</th><th>Prochaine absence</th><th>Compétences</th></tr></thead>
  <tbody>${M.ROSTER.map((m) => `<tr><td><i class="ui-avatar">${initials(m.name)}</i> ${m.name}</td><td>${m.role}</td><td><span class="ui-bar ui-bar--thin"><span class="ui-bar-fill ui-bar-fill--${m.pct >= 100 ? 'good' : m.pct > 0 ? 'warn' : 'info'}" style="width:${m.pct}%"></span></span> ${m.pct} %</td><td class="${m.next ? 'is-warn' : ''}">${m.next || '—'}</td><td class="ui-muted">${m.skills}</td></tr>`).join('')}</tbody>
  <tfoot><tr><th>5 personnes</th><td></td><td><b>3,7 ETP</b></td><td colspan="2" class="ui-muted">18 j d'absence sur le PI · 91 % de capacité</td></tr></tfoot></table>`;

const rotation = ({ weeks = M.ROTATION } = {}) => `
  <div class="ui-rota">${weeks.map((w) => `<article class="ui-rota-week ui-rota-week--${w.state}${w.pip ? ' ui-rota-week--pip' : ''}"><header><b>${w.week}</b><small>${w.start}</small></header><i class="ui-avatar">${initials(w.who)}</i><span>${w.who}</span>${w.tickets != null ? `<small>${w.tickets} tickets</small>` : ''}${w.state === 'now' ? '<em>cette semaine</em>' : ''}${w.warn ? `<em class="is-warn">⚠ ${w.warn}</em>` : ''}${w.pip ? '<em>PIP</em>' : ''}</article>`).join('')}</div>
  <div class="ui-toolbar"><button class="ui-btn" type="button">🔀 Échanger deux semaines</button><button class="ui-btn ui-btn--danger-ghost" type="button">🎲 Régénérer (confirmation)</button><span class="ui-muted">Mode « semaine calendaire » · 1 personne par semaine</span></div>`;

/* ── Glossaire visuel ────────────────────────────────────────────────── */
const GLOSSARY = [
    { icon: '📌', term: 'Engagement vs réalisé', text: 'L\'engagement compte ce qui a fait partie du sprint (reports compris). Le réalisé exige d\'être terminé <b>et</b> encore dans le sprint.', schema: 'lct' },
    { icon: '↪', term: 'Ticket glissé', text: 'Engagé dans 30.1, livré ailleurs : JIRA le déplace à la clôture. Il reste dans l\'engagement de 30.1, jamais dans son réalisé.', schema: null },
    { icon: '🍃', term: 'Sprint de respiration', text: 'Le dernier sprint du PI : dette, I&A, préparation. Il ne compte ni dans la vélocité moyenne, ni dans la capacité, ni dans la charge suggérée.', schema: 'velocity' },
    { icon: '⚠', term: 'Capacité plafonnée', text: 'Quand la fenêtre dépasse la dernière absence connue, le taux d\'absence est un plancher et la base un plafond — le chiffre est montré avec sa réserve.', schema: 'capbase' },
    { icon: '⚡', term: 'Flow efficiency', text: 'Part du lead time réellement passée à travailler le ticket. 15 % est courant, 40 % est bon : réduire l\'attente vaut plus que travailler plus vite.', schema: 'floweff' },
    { icon: '🎯', term: 'Objectif commis / extension', text: 'Commis = engagement ferme, extension = si le temps le permet. La progression est un rollup des features liées, jamais saisie.', schema: 'objectives' },
];
const glossary = () => `<div class="ui-gloss">${GLOSSARY.map((g) => `<article class="ui-gloss-card"><header><i>${g.icon}</i><b>${g.term}</b></header>${g.schema ? `<div class="ui-pop-schema">${F.SCHEMAS[g.schema]}</div>` : ''}<p>${g.text}</p></article>`).join('')}</div>`;

module.exports = { initials, board, backlog, settingsShell, settingsTabs, stgSec, settingsTeams, settingsSprintPi, settingsAbsences, roster, rotation, glossary, card };
