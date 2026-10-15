/**
 * File des tickets À ESTIMER d'une équipe — SOURCE UNIQUE de son ordre : page « Séance d'affinage »
 * (views/refinement.js) ET bouton « ⏭ Suivant » de la popin Poker (modal.js, `_nextToEstimate`).
 *
 * À estimer = même équipe, non terminé, sans points (> 0), hors epics / features.
 * Ordre : sprint de référence (`sprintName`), puis autres sprints, puis backlog (sans sprint) ;
 * à égalité, priorité (`priorityKey`) puis ancienneté de création.
 */
import { priorityKey } from './priority.js';

const _PRIO = { critical: 0, high: 1, medium: 2, low: 3 };

/** Groupes de la file, dans l'ordre d'affichage. */
export const ESTIMATION_GROUPS = [
    { key: 'sprint',  label: 'Sprint en cours' },
    { key: 'other',   label: 'Autres sprints' },
    { key: 'backlog', label: 'Backlog' },
];

/**
 * @param {object[]} tickets
 * @param {string}   team
 * @param {object}   [opts]  `sprintName` = sprint de référence (1ᵉʳ groupe), `exclude` = id à écarter
 * @returns {{ t: object, group: 'sprint'|'other'|'backlog' }[]}
 */
export function estimationQueue(tickets, team, { sprintName = '', exclude = '' } = {}) {
    if (!team) return [];
    const group = t => (sprintName && t.sprintName === sprintName ? 'sprint' : t.sprintName ? 'other' : 'backlog');
    const rank = { sprint: 0, other: 1, backlog: 2 };
    return (tickets || [])
        .filter(t => t.id !== exclude && t.team === team && t.status !== 'done'
            && !(Number(t.points) > 0) && !['epic', 'feature'].includes(t.type))
        .map(t => ({ t, group: group(t) }))
        .sort((a, b) => rank[a.group] - rank[b.group]
            || _PRIO[priorityKey(a.t.priority)] - _PRIO[priorityKey(b.t.priority)]
            || String(a.t.createdAt || '').localeCompare(String(b.t.createdAt || '')));
}
