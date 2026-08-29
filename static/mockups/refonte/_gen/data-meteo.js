/**
 * Données et règles PROPRES À LA MÉTÉO — l'échelle, les cinq domaines, les douze
 * équipes du cas limite, les prévisions par PI, le roster, la rotation, le backlog.
 * Synthétique, calqué sur les pièges de prod.
 */
const D = require('./data');

/* ── L'échelle : quatre niveaux + « pas de donnée » ─────────────────── */
const THRESHOLDS = { sun: 80, cloud: 60, rain: 40 };
const WEATHER = { sun: '☀️', cloud: '⛅', rain: '🌧️', storm: '⛈️', none: '⚪' };
const WEATHER_LABEL = { sun: 'Beau', cloud: 'Variable', rain: 'Attention', storm: 'Critique', none: 'Pas de donnée' };

/** Score absolu (0–100) → niveau. `null` = pas de donnée. */
const weatherOf = (score) => (score == null ? 'none' : score >= THRESHOLDS.sun ? 'sun' : score >= THRESHOLDS.cloud ? 'cloud' : score >= THRESHOLDS.rain ? 'rain' : 'storm');

/** Avancement RELATIF au temps écoulé (sprint, PI) : l'écart en points décide. */
const weatherRel = (pct, timePct) => {
    if (pct == null) return 'none';
    const d = pct - timePct;
    return d >= 10 ? 'sun' : d >= -10 ? 'cloud' : d >= -20 ? 'rain' : 'storm';
};

/* ── Les cinq domaines de la matrice, avec leur formule ──────────────── */
const DOMAINS = [
    { key: 'sprint', icon: '🏃', label: 'Sprint', kind: 'rel', unit: '%',
      formula: 'points réalisés ÷ points engagés, comparé au temps écoulé',
      source: 'tickets du sprint actif — engagement = belongedToSprint(), réalisé = done ET isInSprint()',
      example: 'Vega : 34/52 = 65 % à 70 % du temps → écart −5 → ⛅' },
    { key: 'pi', icon: '🗓️', label: 'PI', kind: 'rel', unit: '%',
      formula: 'points réalisés ÷ périmètre du PI, comparé au temps écoulé du PI',
      source: 'burnup (périmètre = features du PI, reports compris)',
      example: 'Vega : 75/134 = 56 % à 32 % du PI → écart +24 → ☀️' },
    { key: 'health', icon: '🛡️', label: 'Santé', kind: 'abs', unit: '/100',
      formula: '100 − (anomalies pondérées ÷ tickets actifs) × 35',
      source: '7 anomalies : bloqués, > 48 h, stagnants, sans lead, sans estimation, WIP, périmètre élargi',
      example: 'Vega : 74 → ⛅ · Orion : 42 → ⛈️' },
    { key: 'support', icon: '🎧', label: 'Support', kind: 'abs', unit: '%',
      formula: 'tickets support clos sous le seuil de cycle time ÷ tickets support clos',
      source: 'SLA review (seuil 10 j, réglable)',
      example: 'Vega : 9/10 = 90 % → ☀️' },
    { key: 'mood', icon: '😊', label: 'Mood', kind: 'abs', unit: '/5',
      formula: 'moyenne des votes du dernier sprint × 20',
      source: 'votes Mood / ROTI (1 → 5), anonymes, dès 3 votes',
      example: 'Vega : 3,8 × 20 = 76 → ⛅ · Polaris : aucun vote → ⚪' },
];

/* ── Douze équipes, trois lignes produit (cas limite « train complet ») ── */
const TEAMS12 = [
    { name: 'Vega',    color: '#3b82f6', group: 'Produit',    members: 5, sprint: 65, pi: 56, health: 74, support: 90, mood: 3.8, blocked: 1 },
    { name: 'Lyra',    color: '#0d9488', group: 'Produit',    members: 5, sprint: 35, pi: 48, health: 61, support: 75, mood: 3.2, blocked: 0 },
    { name: 'Orion',   color: '#f59e0b', group: 'Produit',    members: 6, sprint: 30, pi: 31, health: 42, support: 55, mood: 2.6, blocked: 3 },
    { name: 'Sirius',  color: '#8b5cf6', group: 'Produit',    members: 4, sprint: 83, pi: 71, health: 88, support: 95, mood: 4.4, blocked: 0 },
    { name: 'Altaïr',  color: '#06b6d4', group: 'Plateforme', members: 5, sprint: 58, pi: 60, health: 70, support: 80, mood: 3.5, blocked: 1 },
    { name: 'Deneb',   color: '#10b981', group: 'Plateforme', members: 6, sprint: 72, pi: 66, health: 81, support: 88, mood: 4.0, blocked: 0 },
    { name: 'Rigel',   color: '#f97316', group: 'Plateforme', members: 4, sprint: 44, pi: 40, health: 55, support: 62, mood: 3.0, blocked: 2 },
    { name: 'Mizar',   color: '#6366f1', group: 'Plateforme', members: 5, sprint: 91, pi: 80, health: 90, support: 97, mood: 4.6, blocked: 0 },
    { name: 'Antarès', color: '#ec4899', group: 'Data',       members: 4, sprint: 50, pi: 52, health: 63, support: null, mood: 3.4, blocked: 1 },
    { name: 'Polaris', color: '#14b8a6', group: 'Data',       members: 3, sprint: 68, pi: 58, health: 77, support: 85, mood: null, blocked: 0 },
    { name: 'Capella', color: '#ef4444', group: 'Data',       members: 5, sprint: 22, pi: 28, health: 38, support: 40, mood: 2.2, blocked: 4 },
    { name: 'Castor',  color: '#84cc16', group: 'Data',       members: 4, sprint: 76, pi: 70, health: 84, support: 90, mood: 4.1, blocked: 0 },
];

/* Les quatre équipes de base, au même format (Sirius et Vega restent la référence). */
const TEAMS4 = TEAMS12.slice(0, 4);

/* ── Prévisions : cinq PI, du passé au non planifié ─────────────────── */
const PI_FORECAST = [
    { num: 28, state: 'past', committed: 118, delivered: 109, pct: 92, note: 'tenu' },
    { num: 29, state: 'past', committed: 126, delivered: 98, pct: 78, note: '2 features reportées' },
    { num: 30, state: 'current', committed: 134, delivered: 75, pct: 56, timePct: 32, note: 'à J22/68' },
    { num: 31, state: 'planned', committed: 187, capacity: 142, pct: null, note: 'engagement à 132 % de la base' },
    { num: 32, state: 'unplanned', note: 'PI Planning le 12–13 oct.' },
];
const PREDICTABILITY = { delivered2: 103, capacityNet: 146, pct: 71, target: 80 };
const VELOCITY12 = [
    { label: '28.1', pts: 33 }, { label: '28.2', pts: 36 }, { label: '28.3', pts: 31 }, { label: '28.4', pts: 39 }, { label: '28.5', pts: 35 },
    ...D.VELOCITY,
];
const ROADMAP = [
    { id: 'FEAT-301', title: 'Export RH automatisé', team: 'Vega', from: 30, to: 30, pct: 70 },
    { id: 'FEAT-305', title: 'Sync JIRA incrémentale & archive', team: 'Vega', from: 30, to: 31, pct: 45 },
    { id: 'FEAT-308', title: 'Calendriers ICS robustes', team: 'Lyra', from: 30, to: 30, pct: 60 },
    { id: 'FEAT-311', title: 'Observabilité du train', team: 'Orion', from: 30, to: 31, pct: 30 },
    { id: 'FEAT-314', title: 'Atlas v2 — appétences', team: 'Vega', from: 30, to: 31, pct: 10 },
    { id: 'FEAT-320', title: 'Portail self-service RH', team: 'Sirius', from: 31, to: 32, pct: 0 },
    { id: 'FEAT-322', title: 'Migration SQLite → Postgres', team: 'Orion', from: 31, to: 31, pct: 0 },
];

/* ── Roster et rotation de Vega ─────────────────────────────────────── */
const ROSTER = [
    { name: 'Chloé Mercier', role: 'Scrum Master', pct: 0, next: null, skills: 'facilitation · SAFe' },
    { name: 'Théo Vasseur',  role: 'Tech Lead',    pct: 70, next: '2–3 sept.', skills: 'FastAPI · SQLite' },
    { name: 'Lucie Arnaud',  role: 'Dev',          pct: 100, next: null, skills: 'JS · CSS · a11y' },
    { name: 'Maxime Giraud', role: 'Dev',          pct: 100, next: '7–11 sept.', skills: 'JIRA API · sync' },
    { name: 'Nour Haddad',   role: 'Dev',          pct: 100, next: '14 sept. (½ j)', skills: 'Python · tests' },
];
const ROTATION = [
    { week: 'S32', start: '3 août', who: 'Théo Vasseur', state: 'done', tickets: 4 },
    { week: 'S33', start: '10 août', who: 'Lucie Arnaud', state: 'done', tickets: 2 },
    { week: 'S34', start: '17 août', who: 'Maxime Giraud', state: 'done', tickets: 5 },
    { week: 'S35', start: '24 août', who: 'Théo Vasseur', state: 'now', tickets: 3 },
    { week: 'S36', start: '31 août', who: 'Nour Haddad', state: 'next', tickets: null },
    { week: 'S37', start: '7 sept.', who: 'Lucie Arnaud', state: 'future', tickets: null, warn: 'Maxime absent' },
    { week: 'S38', start: '14 sept.', who: 'Maxime Giraud', state: 'future', tickets: null },
    { week: 'S39', start: '21 sept.', who: 'Théo Vasseur', state: 'future', tickets: null },
    { week: 'S40', start: '28 sept.', who: 'Nour Haddad', state: 'future', tickets: null },
    { week: 'S41', start: '5 oct.', who: 'Lucie Arnaud', state: 'future', tickets: null, pip: true },
];
const MOOD_TREND = [3.2, 3.4, 3.1, 3.6, 3.5, 3.6, 3.8];

/* ── Backlog : les tickets du sprint + quelques autres ───────────────── */
const BACKLOG = [
    ...D.TICKETS.map((t) => ({ ...t, sprint: '30.2', epic: 'FEAT-301', prio: t.status === 'blocked' ? 'haute' : 'normale' })),
    { id: 'VEGA-430', title: 'Archive des sprints clos — réinjection', type: 'story', status: 'todo', pts: 8, lead: null, sprint: '30.3', epic: 'FEAT-305', prio: 'haute' },
    { id: 'VEGA-431', title: 'Mémoire des sprints vides — purge', type: 'task', status: 'todo', pts: 3, lead: 'Maxime Giraud', sprint: '30.3', epic: 'FEAT-305', prio: 'normale' },
    { id: 'VEGA-432', title: 'Atlas — import des appétences', type: 'story', status: 'todo', pts: 13, lead: null, sprint: '30.4', epic: 'FEAT-314', prio: 'basse' },
    { id: 'VEGA-433', title: 'Bug — capacité négative (bis)', type: 'bug', status: 'todo', pts: null, lead: null, sprint: null, epic: null, prio: 'haute' },
];

/* ── Plan d'action d'Orion (ce que la météo ⛈️ propose) ─────────────── */
const ORION_PLAN = [
    { icon: '🚫', what: 'Débloquer ORION-71 « API archive »', why: 'bloque VEGA-415 depuis 4 j — dépendance inter-équipes', who: 'Nadia Ferro', urgency: 'aujourd\'hui' },
    { icon: '🔴', what: 'Trancher ORION-63 (bloqué > 48 h)', why: 'attente d\'une décision produit, pas d\'un développement', who: 'PO Orion', urgency: 'aujourd\'hui' },
    { icon: '🐌', what: 'Fermer ou reporter 4 tickets stagnants', why: 'aucun mouvement depuis 6 à 11 jours', who: 'Scrum Master', urgency: 'cette semaine' },
    { icon: '📊', what: 'Estimer 3 tickets sans points', why: 'la vélocité et la prévision les ignorent', who: 'équipe, au refinement', urgency: 'avant 30.3' },
    { icon: '⚠️', what: 'Compléter les absences après le 11 sept.', why: 'la capacité du PI 31 est un plafond, pas une prévision', who: 'Scrum Master', urgency: 'avant le PI Planning' },
];

module.exports = { THRESHOLDS, WEATHER, WEATHER_LABEL, weatherOf, weatherRel, DOMAINS, TEAMS12, TEAMS4, PI_FORECAST, PREDICTABILITY, VELOCITY12, ROADMAP, ROSTER, ROTATION, MOOD_TREND, BACKLOG, ORION_PLAN };
