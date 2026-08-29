/**
 * Jeu de données SYNTHÉTIQUE des maquettes de refonte.
 *
 * Aucun nom réel : équipes et membres viennent du jeu de démo du site
 * (`static/js/demo.js`). Les chiffres sont calqués sur les pièges de prod
 * (sprint clos avec reports, capacité plafonnée, anomalies actives) pour que
 * les écrans montrent ce qu'un vrai Dashboard aurait à montrer.
 *
 * Une seule source pour les quatre directions : elles changent l'identité,
 * jamais le contenu.
 */

const TEAMS = [
    { name: 'Vega',   color: '#3b82f6', etp: 4.0, members: 5 },
    { name: 'Lyra',   color: '#0d9488', etp: 3.7, members: 5 },
    { name: 'Orion',  color: '#f59e0b', etp: 4.7, members: 6 },
    { name: 'Sirius', color: '#8b5cf6', etp: 3.0, members: 4 },
];

const GROUPS = [
    { name: 'Constellation Produit',    teams: ['Vega', 'Lyra'] },
    { name: 'Constellation Plateforme', teams: ['Orion', 'Sirius'] },
];

const PI = { num: 30, sprintsPerPI: 5, start: '2026-08-03', end: '2026-10-09', pipDays: ['2026-10-12', '2026-10-13'] };

/* Sprints du PI 30 pour Vega — 30.2 en cours à J7/10 */
const SPRINTS = [
    { key: '30.1', name: 'Vega - Ite 30.1', state: 'closed', start: '2026-08-03', end: '2026-08-14',
      goal: 'Automatiser l\'export RH des absences', pts: 48, done: 41, tk: 18, tkDone: 15, slipped: 2, mood: 3.6, fist: 4.0,
      groups: { us: { n: 10, pts: 34, done: 30 }, buffer: { n: 4, pts: 8, done: 6 }, action: { n: 4, pts: 6, done: 5 } } },
    { key: '30.2', name: 'Vega - Ite 30.2', state: 'active', start: '2026-08-17', end: '2026-08-28',
      goal: 'Livrer l\'export CSV des absences et stabiliser la sync JIRA', pts: 52, done: 34, tk: 14, tkDone: 9, slipped: 0, mood: 3.8, fist: 4.1,
      groups: { us: { n: 8, pts: 38, done: 26 }, buffer: { n: 3, pts: 8, done: 5 }, action: { n: 3, pts: 6, done: 3 } } },
    { key: '30.3', name: 'Vega - Ite 30.3', state: 'future', start: '2026-08-31', end: '2026-09-11',
      goal: 'Sync incrémentale : archive des sprints clos', pts: 44, done: 0, tk: 11, tkDone: 0, slipped: 0, mood: null, fist: null,
      groups: { us: { n: 7, pts: 32, done: 0 }, buffer: { n: 2, pts: 6, done: 0 }, action: { n: 2, pts: 6, done: 0 } } },
    { key: '30.4', name: 'Vega - Ite 30.4', state: 'future', start: '2026-09-14', end: '2026-09-25',
      goal: 'Atlas v2 — cartographie des appétences', pts: 40, done: 0, tk: 9, tkDone: 0, slipped: 0, mood: null, fist: null,
      groups: { us: { n: 6, pts: 30, done: 0 }, buffer: { n: 2, pts: 6, done: 0 }, action: { n: 1, pts: 4, done: 0 } } },
    { key: '30.5', name: 'Vega - Ite 30.5', state: 'future', breath: true, start: '2026-09-28', end: '2026-10-09',
      goal: 'Respiration — dette, I&A, préparation PI 31', pts: 0, done: 0, tk: 0, tkDone: 0, slipped: 0, mood: null, fist: null,
      groups: {} },
];

const CURRENT = SPRINTS[1];
const TODAY = { iso: '2026-08-25', label: '25 août', dayIdx: 7, dayTotal: 10, pct: 70 };

/* Tickets détaillés du sprint courant (pour la bande, le board et les modales) */
const TICKETS = [
    { id: 'VEGA-412', title: 'Export CSV — encodage UTF-8 BOM pour Excel FR', type: 'story', status: 'blocked', pts: 5, lead: 'Théo Vasseur', age: 3 },
    { id: 'VEGA-409', title: 'Colonne « Jours » : demi-journées acceptées', type: 'story', status: 'done', pts: 3, lead: 'Lucie Arnaud', age: 0 },
    { id: 'VEGA-415', title: 'Sync JIRA — mémoire des sprints clos vides', type: 'story', status: 'inprog', pts: 8, lead: 'Maxime Giraud', age: 2 },
    { id: 'VEGA-417', title: 'Bandeau de couverture : sprints rapatriés', type: 'story', status: 'review', pts: 5, lead: 'Théo Vasseur', age: 1 },
    { id: 'VEGA-398', title: 'Refacto du parseur CSV pivot RH', type: 'task', status: 'inprog', pts: 3, lead: 'Lucie Arnaud', age: 8 },
    { id: 'VEGA-420', title: 'Bug — capacité négative si absence hors roster', type: 'bug', status: 'test', pts: 2, lead: 'Maxime Giraud', age: 1 },
    { id: 'VEGA-421', title: 'Support — jeton JIRA expiré non signalé', type: 'support', status: 'done', pts: 2, lead: 'Chloé Mercier', age: 0 },
    { id: 'VEGA-424', title: 'Import : remonter les cellules ignorées', type: 'story', status: 'todo', pts: 5, lead: null, age: null },
    { id: 'VEGA-425', title: 'Écraser : fenêtre PIP comprise', type: 'story', status: 'done', pts: 3, lead: 'Théo Vasseur', age: 0 },
    { id: 'VEGA-426', title: 'Doc — guide Scrum Master : rotation', type: 'task', status: 'done', pts: 1, lead: 'Chloé Mercier', age: 0 },
];

const OBJECTIVES = [
    { name: 'Export RH automatisé', team: 'Vega', bv: 8, committed: true,  pct: 70, status: 'inprog' },
    { name: 'Sync JIRA incrémentale', team: 'Vega', bv: 9, committed: true,  pct: 45, status: 'inprog' },
    { name: 'Atlas v2 — appétences', team: 'Vega', bv: 5, committed: false, pct: 10, status: 'todo' },
    { name: 'Observabilité du train', team: null,   bv: 6, committed: true,  pct: 30, status: 'inprog' },
];

const KPIS = {
    tickets: { total: 14, done: 9, pct: 64 },
    points:  { total: 52, done: 34, pct: 65 },
    inprog: 3, blocked: 1, throughput7: 6, throughputTrend: 2,
    cycleMed: 4, leadMed: 11, waitMed: 7, flowEff: 36, noEstimate: 2, noLead: 1,
};

const VELOCITY = [
    { label: '29.1', pts: 37 }, { label: '29.2', pts: 40 }, { label: '29.3', pts: 35 },
    { label: '29.4', pts: 44 }, { label: '29.5', pts: 38 }, { label: '30.1', pts: 41 },
    { label: '30.2', pts: 34, current: true },
];
const VELO_AVG = 39;
const VELO_TARGET = 42;

/* Temps par colonne (médianes en jours) */
const STAGES = [
    { label: 'À faire', days: 6.5, color: 'var(--status-todo)' },
    { label: 'En cours', days: 3.2, color: 'var(--status-inprog)' },
    { label: 'Revue', days: 1.4, color: 'var(--status-review)' },
    { label: 'Test', days: 1.8, color: 'var(--status-test)' },
    { label: 'À livrer', days: 2.1, color: 'var(--status-done)' },
];

const AGING = {
    p50: 4, p85: 9,
    cols: [
        { label: 'En cours', tks: [{ id: 'VEGA-415', age: 2 }, { id: 'VEGA-398', age: 8 }, { id: 'LYRA-201', age: 6 }] },
        { label: 'Revue',    tks: [{ id: 'VEGA-417', age: 1 }] },
        { label: 'Test',     tks: [{ id: 'VEGA-420', age: 1 }, { id: 'ORION-88', age: 11 }] },
    ],
};

const FORECAST = { probability: 78, p50: 'ven. 28 août', p85: 'mar. 1 sept.', runs: 5000 };

const TEAM_STATS = [
    { team: 'Vega',   tk: 14, done: 9, pts: 52, ptsDone: 34, blocked: 1, health: 74, mood: 3.8, weather: 'sun' },
    { team: 'Lyra',   tk: 12, done: 5, pts: 40, ptsDone: 14, blocked: 0, health: 61, mood: 3.2, weather: 'cloud' },
    { team: 'Orion',  tk: 17, done: 6, pts: 61, ptsDone: 18, blocked: 3, health: 42, mood: 2.6, weather: 'storm' },
    { team: 'Sirius', tk: 9,  done: 7, pts: 30, ptsDone: 25, blocked: 0, health: 88, mood: 4.4, weather: 'sun' },
];

const STUCK = [
    { id: 'VEGA-412', title: 'Export CSV — encodage UTF-8 BOM', status: 'blocked', lead: 'Théo Vasseur', age: 3 },
    { id: 'VEGA-398', title: 'Refacto du parseur CSV pivot RH', status: 'inprog', lead: 'Lucie Arnaud', age: 8 },
    { id: 'LYRA-201', title: 'Calendrier ICS — refresh en pool', status: 'inprog', lead: 'Manon Cros', age: 6 },
    { id: 'ORION-88', title: 'Migration SQLite → colonne created_at', status: 'test', lead: null, age: 11 },
];

const FEED = [
    { when: 'il y a 12 min', who: 'Théo Vasseur',  what: 'VEGA-417', change: 'En cours → Revue' },
    { when: 'il y a 40 min', who: 'Maxime Giraud', what: 'VEGA-420', change: '+2 pts' },
    { when: 'il y a 2 h',    who: 'Chloé Mercier', what: 'VEGA-421', change: 'Revue → Terminé' },
    { when: 'hier 17:40',    who: 'Lucie Arnaud',  what: 'VEGA-409', change: 'Test → Terminé' },
    { when: 'hier 09:15',    who: 'Théo Vasseur',  what: 'VEGA-412', change: 'En cours → Bloqué' },
];

const ONCALL = [
    { name: 'Théo Vasseur', team: 'Vega', color: '#3b82f6' },
    { name: 'Manon Cros', team: 'Lyra', color: '#0d9488' },
    { name: 'Nadia Ferro', team: 'Orion', color: '#f59e0b' },
];

/* ── PI Planning ─────────────────────────────────────────────────────── */
const CAPACITY = [
    { team: 'Vega',   etp: 4.0, sprints: 4, days: 160, abs: 14, net: 146, base: 156, capped: false },
    { team: 'Lyra',   etp: 3.7, sprints: 4, days: 148, abs: 22, net: 126, base: 132, capped: false },
    { team: 'Orion',  etp: 4.7, sprints: 4, days: 188, abs: 9,  net: 179, base: 171, capped: true },
    { team: 'Sirius', etp: 3.0, sprints: 4, days: 120, abs: 6,  net: 114, base: 118, capped: false },
];

const FEATURES = [
    { rank: 1, id: 'FEAT-301', title: 'Export RH automatisé (CSV pivot)', team: 'Vega', sp: 34, pct: 70 },
    { rank: 2, id: 'FEAT-305', title: 'Sync JIRA incrémentale & archive', team: 'Vega', sp: 46, pct: 45 },
    { rank: 3, id: 'FEAT-308', title: 'Calendriers ICS — refresh robuste', team: 'Lyra', sp: 21, pct: 60 },
    { rank: 4, id: 'FEAT-311', title: 'Observabilité du train', team: 'Orion', sp: 40, pct: 30 },
    { rank: 5, id: 'FEAT-314', title: 'Atlas v2 — appétences', team: 'Vega', sp: 28, pct: 10 },
    { rank: 6, id: 'FEAT-317', title: 'Rotation support multi-équipes', team: 'Sirius', sp: 18, pct: 80 },
];

const DEPS = { cross: 3, matrix: [
    ['Vega',   { Vega: 0, Lyra: 1, Orion: 2, Sirius: 0 }],
    ['Lyra',   { Vega: 0, Lyra: 0, Orion: 0, Sirius: 1 }],
    ['Orion',  { Vega: 0, Lyra: 0, Orion: 0, Sirius: 0 }],
    ['Sirius', { Vega: 0, Lyra: 0, Orion: 0, Sirius: 0 }],
] };

const BURNUP = { scope: [128, 128, 132, 134, 134, 134], done: [0, 41, 75, null, null, null], labels: ['PIP', '30.1', '30.2', '30.3', '30.4', '30.5'] };

const VOTES = {
    mood: { avg: 3.8, dist: [0, 1, 1, 2, 1], n: 5 },
    fist: { avg: 4.1, dist: [0, 0, 1, 3, 1], n: 5 },
};

/* ── Santé ───────────────────────────────────────────────────────────── */
const HEALTH = {
    score: 74, label: 'Correct', trend: '+6 pts', history: [58, 62, 61, 66, 70, 68, 74],
    anomalies: [
        { key: 'blocked',     icon: '🚫', label: 'Bloqués',           n: 1, sev: 'danger',  desc: 'Tickets en statut bloqué' },
        { key: 'oldBlockers', icon: '🔴', label: 'Blockers > 48 h',   n: 1, sev: 'danger',  desc: 'Bloqués sans mouvement depuis plus de 48 h' },
        { key: 'stale',       icon: '🐌', label: 'Stagnants',         n: 3, sev: 'warning', desc: 'En cours sans mise à jour depuis plus de 5 jours' },
        { key: 'unassigned',  icon: '👤', label: 'Sans assigné·e',    n: 1, sev: 'warning', desc: 'Tickets actifs sans leader' },
        { key: 'noPoints',    icon: '📊', label: 'Sans estimation',   n: 2, sev: 'warning', desc: 'Tickets actifs sans story points' },
        { key: 'wip',         icon: '🔄', label: 'WIP élevé',         n: 0, sev: 'info',    desc: 'En cours au-delà de la capacité de l\'équipe' },
        { key: 'scopeCreep',  icon: '📈', label: 'Périmètre élargi',  n: 2, sev: 'info',    desc: 'Ajoutés après le début du sprint' },
    ],
    matrix: [
        { team: 'Vega',   cells: [1, 1, 2, 1, 2, 0, 2], cap: 91, capped: false },
        { team: 'Lyra',   cells: [0, 0, 1, 0, 1, 0, 1], cap: 85, capped: false },
        { team: 'Orion',  cells: [3, 2, 4, 2, 3, 1, 3], cap: 95, capped: true },
        { team: 'Sirius', cells: [0, 0, 0, 0, 0, 0, 0], cap: 95, capped: false },
    ],
};

/* ── Rapport de sprint 30.1 (clos) ───────────────────────────────────── */
const REPORT = {
    sprint: SPRINTS[0],
    groups: [
        { icon: '📝', label: 'User Stories', n: 10, done: 8, pts: 34, ptsDone: 30,
          tks: [{ id: 'VEGA-380', title: 'Parser CSV pivot RH — colonnes-dates', pts: 8, status: 'done' },
                { id: 'VEGA-383', title: 'Déduplication (nom, début, fin)', pts: 5, status: 'done' },
                { id: 'VEGA-388', title: 'Mode « Ajouter » — mise à jour des durées', pts: 5, status: 'done' },
                { id: 'VEGA-391', title: 'Chevauchements partiels remontés', pts: 3, status: 'done' },
                { id: 'VEGA-394', title: 'Export CSV — BOM UTF-8', pts: 5, status: 'slipped', to: '30.2' }] },
        { icon: '🔄', label: 'Buffer', n: 4, done: 3, pts: 8, ptsDone: 6,
          tks: [{ id: 'VEGA-370', title: 'Diagnostic du format non reconnu', pts: 3, status: 'done' },
                { id: 'VEGA-372', title: 'Compter les cellules ignorées', pts: 2, status: 'slipped', to: '30.2' }] },
        { icon: '🐛', label: 'Bugs', n: 2, done: 2, pts: 4, ptsDone: 4,
          tks: [{ id: 'VEGA-401', title: 'Import silencieux « CP »/« RTT »', pts: 2, status: 'done' },
                { id: 'VEGA-402', title: 'Tolérance flottants 1e-6', pts: 2, status: 'done' }] },
        { icon: '🛡️', label: 'Support', n: 2, done: 2, pts: 2, ptsDone: 2,
          tks: [{ id: 'VEGA-405', title: 'Astreinte — 3 tickets N2', pts: 1, status: 'done' }] },
    ],
};

const REPORT_SECTIONS = [
    { id: 'sprint',   icon: '📋', title: 'Sprint' },
    { id: 'kanban',   icon: '🗂️', title: 'Kanban / Flow' },
    { id: 'support',  icon: '🛡️', title: 'Support' },
    { id: 'roadmap',  icon: '🗺️', title: 'Roadmap / PI' },
    { id: 'epicburn', icon: '📉', title: 'Epic Burndown' },
    { id: 'sondage',  icon: '😊', title: 'Mood / ROTI' },
    { id: 'pifist',   icon: '✊', title: 'Vote de confiance' },
    { id: 'teams',    icon: '👥', title: 'Équipes' },
    { id: 'pi',       icon: '🗓️', title: 'PI Planning' },
    { id: 'full',     icon: '📄', title: 'Rapport complet' },
];

const PI_TABS = [
    { id: 'objectives', label: '🎯 Objectifs (3)' }, { id: 'indicators', label: '📊 Indicateurs' },
    { id: 'features', label: '📦 Features (6)' }, { id: 'capacity', label: '⚡ Capacité' },
    { id: 'burnup', label: '📈 Burnup' }, { id: 'deps', label: '🔗 Dépendances (3)' },
    { id: 'teams', label: '👥 Équipes' }, { id: 'support', label: '🛡️ Support' },
    { id: 'mood', label: '😊 Mood / ROTI' }, { id: 'fist', label: '✊ Fist of Five' },
    { id: 'calendar', label: '📅 Calendrier' },
];

const NAV = [
    { id: 'dashboard', icon: '▦', label: 'Dashboard', key: '1', dom: 'flow' },
    { id: 'board',     icon: '▥', label: 'Board',     key: '2', dom: 'flow' },
    { id: 'backlog',   icon: '☰', label: 'Backlog',   key: '3', dom: 'flow' },
    { id: 'pi',        icon: '🗓', label: 'PI Planning', key: '4', dom: 'pi' },
    { id: 'roadmap',   icon: '🗺', label: 'Roadmap',   key: '5', dom: 'pi' },
    { id: 'health',    icon: '🛡', label: 'Santé',     key: '6', dom: 'health' },
    { id: 'reports',   icon: '📈', label: 'Rapports',  key: '7', dom: 'report' },
    { id: 'retro',     icon: '↻', label: 'Amélioration', key: '8', dom: 'health' },
];

module.exports = {
    TEAMS, GROUPS, PI, SPRINTS, CURRENT, TODAY, TICKETS, OBJECTIVES, KPIS, VELOCITY, VELO_AVG, VELO_TARGET,
    STAGES, AGING, FORECAST, TEAM_STATS, STUCK, FEED, ONCALL, CAPACITY, FEATURES, DEPS, BURNUP, VOTES,
    HEALTH, REPORT, REPORT_SECTIONS, PI_TABS, NAV,
};
