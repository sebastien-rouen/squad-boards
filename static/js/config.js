/** Centralized configuration constants. */

export const STATUS_ORDER = ['todo', 'inprog', 'review', 'test', 'blocked', 'done'];

export const STATUS_LABELS = {
    todo: 'A faire',
    inprog: 'En cours',
    review: 'Revue',
    test: 'Test',
    blocked: 'Bloque',
    done: 'Termine',
};

export const STATUS_MAP = {
    // Todo / Backlog
    'to do': 'todo', 'a faire': 'todo', 'à faire': 'todo', 'open': 'todo', 'backlog': 'todo',
    'nouveau': 'todo', 'new': 'todo', 'ouvert': 'todo',
    'selected for development': 'todo', 'sprint backlog': 'todo',
    'ready': 'todo', 'prêt': 'todo', 'pret': 'todo',
    'en attente': 'todo', 'en cours d\'analyse': 'todo', 'en cours de specification': 'todo',
    'en cours de spécification': 'todo', 'en cours de spécification tech': 'todo',
    // In Progress
    'in progress': 'inprog', 'en cours': 'inprog', 'in development': 'inprog',
    'development': 'inprog', 'doing': 'inprog',
    'en cours de développement': 'inprog', 'en cours de developpement': 'inprog',
    'résolution en cours': 'inprog', 'en cours de traitement': 'inprog',
    // Review
    'in review': 'review', 'code review': 'review', 'review': 'review', 'revue': 'review',
    'en revue': 'review', 'en cours de revue': 'review', 'peer review': 'review',
    // Test / Recette / QA
    'in test': 'test', 'testing': 'test', 'test': 'test', 'qa': 'test',
    'validation': 'test', 'recette': 'test', 'uat': 'test',
    'en test': 'test', 'en cours de recette': 'test',
    'a livrer en recette': 'test', 'à livrer en recette': 'test',
    // Done / Livraison (inclut preprod, qualif, prod)
    'done': 'done', 'termine': 'done', 'terminé': 'done', 'closed': 'done', 'resolved': 'done',
    'ferme': 'done', 'fermé': 'done', 'resolu': 'done', 'résolu': 'done',
    'delivered': 'done', 'livre': 'done', 'livré': 'done',
    'deployed': 'done', 'deploye': 'done', 'déployé': 'done', 'in production': 'done',
    'a livrer en preprod': 'done', 'à livrer en preprod': 'done',
    'a livrer en préprod': 'done', 'à livrer en préprod': 'done',
    'en cours de test preprod': 'done', 'en cours de test préprod': 'done',
    'a livrer en qualif': 'done', 'à livrer en qualif': 'done',
    'a livrer en qualif (mi)': 'done', 'à livrer en qualif (mi)': 'done',
    'en cours de qualif': 'done', 'en cours de qualif (mi)': 'done',
    'a livrer en prod': 'done', 'à livrer en prod': 'done', 'en prod': 'done',
    'clos sans suite': 'done', 'won\'t fix': 'done', 'wont fix': 'done', 'duplicate': 'done',
    // Blocked
    'blocked': 'blocked', 'bloque': 'blocked', 'bloqué': 'blocked', 'impediment': 'blocked',
    'on hold': 'blocked', 'retour au demandeur': 'blocked', 'en attente de retour': 'blocked',
};

export const TYPE_MAP = {
    'story': 'story', 'histoire': 'story', 'user story': 'story',
    'bug': 'bug', 'defect': 'bug',
    'task': 'task', 'tache': 'task', 'sous-tache': 'task', 'sub-task': 'task',
    'support': 'support',
    'ops': 'ops', 'operation': 'ops',
    'technical story': 'debt', 'dette': 'debt', 'tech debt': 'debt', 'debt': 'debt',
    'epic': 'epic',
    'feature': 'feature', 'fonctionnalite': 'feature',
    'incident': 'support',
};

export const TYPE_LABELS = {
    story: 'Story',
    bug: 'Bug',
    task: 'Tache',
    support: 'Support',
    ops: 'Ops',
    debt: 'Dette',
    epic: 'Epic',
    feature: 'Feature',
};

// Icônes de TYPE — source unique (cf. typeBadge() dans utils.js). Reprend le jeu déjà utilisé
// par modal.js/backlog.js ; évite la divergence historique avec l'ancien jeu de roadmap.js.
export const TYPE_ICONS = {
    story: '✨',
    bug: '🐛',
    task: '✅',
    support: '🎯',
    ops: '⚙️',
    debt: '🏚️',
    epic: '⚡',
    feature: '🚀',
};

export const TEAM_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
    '#14b8a6', '#6366f1', '#84cc16', '#e11d48',
];

export const WIP_LIMITS = {
    todo: 0,
    inprog: 8,
    review: 5,
    test: 5,
    blocked: 0,
    done: 0,
};

// Statuts comptabilisés dans le WIP (Work In Progress) — source unique pour countWip().
export const WIP_STATUSES = ['inprog', 'review', 'test'];

// `section` : 'main' (Pilotage, réordonnable), 'team' (Équipe & RH, groupe repliable)
// ou 'footer' (pied de sidebar — administration, hors pilotage quotidien).
// `shortcut` : chiffres `1`-`8` réservés au pilotage (dans l'ordre du menu), `,` = Paramètres.
// Le groupe "Équipe & RH" n'a PAS de raccourci nu (décision : éviter les lettres → taper du texte
// hors champ ne déclenche plus de navigation accidentelle ; ces vues restent accessibles via Ctrl+K).
// SOURCE UNIQUE de la navigation : sidebar, Ctrl+K et titres de document en dérivent tous.
export const NAV_ITEMS = [
    { id: 'dashboard',  label: 'Dashboard',    icon: 'i-grid',       shortcut: '1', section: 'main' },
    { id: 'sprint',     label: 'Board',        icon: 'i-columns',    shortcut: '2', section: 'main' },
    { id: 'backlog',    label: 'Backlog',       icon: 'i-list',       shortcut: '3', section: 'main' },
    { id: 'pi',         label: 'PI Planning',  icon: 'i-calendar',   shortcut: '4', section: 'main' },
    { id: 'roadmap',    label: 'Roadmap',      icon: 'i-map',        shortcut: '5', section: 'main' },
    { id: 'health',     label: 'Santé',        icon: 'i-shield',     shortcut: '6', section: 'main' },
    { id: 'reports',    label: 'Rapports',     icon: 'i-chart',      shortcut: '7', section: 'main' },
    { id: 'retro',      label: 'Amélioration', icon: 'i-refresh',    shortcut: '8', section: 'main' },
    { id: 'team',       label: 'Équipe',       icon: 'i-id-card',    shortcut: '',  section: 'team' },
    { id: 'support',    label: 'Support',      icon: 'i-users',      shortcut: '',  section: 'team' },
    { id: 'roam',       label: 'Risques ROAM', icon: 'i-alert',      shortcut: '',  section: 'team' },
    { id: 'atlas',      label: 'Atlas',        icon: 'i-network',    shortcut: '',  section: 'team' },
    { id: 'agenda',     label: 'Agenda',       icon: 'i-agenda',     shortcut: '',  section: 'team' },
    { id: 'settings',   label: 'Paramètres',   icon: 'i-settings',   shortcut: ',', section: 'footer' },
];

export const SYNC_CONFIG = {
    sprintField: 'customfield_10021',
};

/**
 * Profondeur d'historique rapatriée depuis JIRA — source UNIQUE des valeurs par défaut.
 *
 * Chaque clé est surchargeable dans Paramètres → Plugin JIRA via `sb-sync-<nom>`
 * (localStorage). Les défauts vivent ici et NULLE PART ailleurs : la page Health les relit
 * pour dire « ton historique est plafonné par le réglage, pas par JIRA », et un défaut
 * recopié dans la vue mentirait au premier changement.
 *
 * ⚠️ Deux profondeurs DISTINCTES, à ne pas confondre :
 *   - `closedKeep`          → MÉTADONNÉES de sprint (dates + vélocité Greenhopper).
 *                             1 appel par board : peu cher, monter ce chiffre coûte peu.
 *   - `closedTicketSprints` → DÉTAIL des tickets (cycle time, engagement, scope creep).
 *                             1 appel par sprint ET par board, changelog inclus : c'est
 *                             lui qui fait la durée d'un import et le poids de la base.
 *
 * ⚠️ `app.js` reste sur sa propre lecture de `quickDays` : il charge `sync.js` en import
 * DYNAMIQUE (au clic) et importer ces constantes depuis la vue casserait ce lazy.
 */
export const SYNC_DEFAULTS = {
    quickDays: 14,           // fenêtre de la sync rapide, en jours
    // 40 et non 20 : la passe d'import PAGINE DÉJÀ tous les sprints clos du board avant de
    // trancher, et le rapport de vélocité Greenhopper arrive en un appel pour le board
    // entier. Élargir ici ne coûte donc AUCUN appel JIRA de plus — seulement quelques Ko de
    // `teamSprints`. À 20, dix des treize équipes butaient sur le plafond (mesuré le
    // 25/08/2026) et perdaient leur historique au-delà de ~9 mois pour rien.
    closedKeep: 40,          // sprints clos gardés par board (vélocité, tendances)
    closedTicketSprints: 6,  // sprints clos dont les TICKETS sont rapatriés
    archiveClosed: 1,        // 1 = ne pas re-télécharger les sprints clos déjà en base
};

/**
 * Lit un réglage de sync entier depuis localStorage, avec repli sur `SYNC_DEFAULTS`.
 * @param {'quickDays'|'closedKeep'|'closedTicketSprints'} name
 * @returns {number} valeur effective — jamais NaN, jamais négative
 */
export function syncSetting(name) {
    const raw = (localStorage.getItem(`sb-sync-${name}`) || '').trim();
    const n = parseInt(raw, 10);
    // 0 est LÉGITIME pour `closedTicketSprints` (désactive la passe) : on ne retombe sur le
    // défaut que si la saisie est absente ou illisible, pas si elle vaut zéro.
    return (raw !== '' && !isNaN(n) && n >= 0) ? n : SYNC_DEFAULTS[name];
}
