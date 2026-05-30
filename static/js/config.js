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

export const NAV_ITEMS = [
    { id: 'dashboard',  label: 'Dashboard',    icon: 'i-grid',       shortcut: '1' },
    { id: 'sprint',     label: 'Sprint',       icon: 'i-zap',        shortcut: '2' },
    { id: 'kanban',     label: 'Kanban',       icon: 'i-columns',    shortcut: '3' },
    { id: 'pi',         label: 'PI Planning',  icon: 'i-calendar',   shortcut: '4' },
    { id: 'picalendar', label: 'PI Calendrier',icon: 'i-clock',      shortcut: '5' },
    { id: 'roadmap',    label: 'Roadmap',      icon: 'i-map',        shortcut: '6' },
    { id: 'health',     label: 'Health',       icon: 'i-shield',     shortcut: 'H' },
    { id: 'retro',      label: 'Amelioration', icon: 'i-refresh',    shortcut: '7' },
    { id: 'support',    label: 'Support',      icon: 'i-users',      shortcut: 'S' },
    { id: 'roam',       label: 'ROAM',         icon: 'i-shield',     shortcut: 'R' },
    { id: 'agenda',     label: 'Agenda',       icon: 'i-agenda',     shortcut: 'G' },
    { id: 'reports',    label: 'Rapports',     icon: 'i-chart',      shortcut: '8' },
    { id: 'settings',   label: 'Parametres',   icon: 'i-settings',   shortcut: '9' },
];

export const SYNC_CONFIG = {
    sprintField: 'customfield_10021',
};
