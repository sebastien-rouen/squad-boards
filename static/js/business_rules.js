/**
 * Shared anomaly rules — single source of truth used by health.js (cards + matrix)
 * and alert_modal.js (action modal filter). Keeping both in sync here prevents
 * the counter/modal divergence bug (e.g. noPoints excluding ActionRetro in one place but not the other).
 *
 * Each rule exposes:
 *   key       — unique identifier
 *   icon      — emoji for display
 *   label     — short label
 *   desc      — longer description
 *   sev       — 'danger' | 'warning' | 'info'
 *   match(t, ctx) — returns true if ticket t matches the anomaly
 *                   ctx = { sprintStartMs: number, wipExceededTeams?: Set<string> }
 *                   (wipExceededTeams = équipes dont le WIP dépasse la capacité du jour,
 *                    signal d'agrégat calculé par l'appelant — un ticket seul n'est jamais une anomalie WIP)
 */

import { extractPiNum } from './utils.js';

// Détection ticket ActionRetro — exportée pour rester l'unique source de vérité (cf. note
// ci-dessus) : utilisée ici par la règle `noPoints` ET par health.js pour regrouper ces
// tickets à part dans le détail des sprints (ils n'ont normalement pas de Story Points).
export const isActionRetro = t => (t.labels || []).some(l => /^ActionRetro$/i.test(l));

// Ticket d'un PI révolu (sprint « 26.5 » quand on regarde le PI 31) : reliquat resté au backlog
// avec son drapeau, pas un blocage d'aujourd'hui. `ctx.curPi` = PI regardé ; absent → pas d'exclusion.
// Exportée : la TV cite ces reliquats à part, avec la même règle.
export const isPastPi = (t, curPi) => {
    const n = extractPiNum(t.sprintName || t.sprint || '');
    return !!(curPi && n && n < curPi);
};

export const ANOMALY_RULES = [
    {
        key: 'blocked',
        icon: '🚫', label: 'Bloqués',
        desc: 'Tickets en statut blocked',
        sev: 'danger',
        title: 'Tickets bloqués',
        intro: 'Identifie le blocker et débloquer rapidement pour limiter l\'impact sprint.',
        editableFields: ['leader', 'points'],
        match: (t, ctx) => t.status === 'blocked' && !isPastPi(t, ctx?.curPi),
    },
    {
        key: 'oldBlockers',
        icon: '🔴', label: 'Blockers >48h',
        desc: 'Bloqués sans mouvement depuis >48h',
        sev: 'danger',
        title: 'Blockers sans mouvement > 48h',
        intro: 'Ces blockers stagnent depuis plus de 48h — sollicite l\'équipe pour les résoudre.',
        editableFields: ['leader', 'points'],
        match: (t, ctx) => t.status === 'blocked' && !isPastPi(t, ctx?.curPi) && t.updatedAt &&
            (Date.now() - new Date(t.updatedAt).getTime()) > 48 * 3600 * 1000,
    },
    {
        key: 'stale',
        icon: '🐌', label: 'Stagnants',
        desc: 'En cours sans update depuis >5 jours',
        sev: 'warning',
        title: 'Tickets stagnants (>5j sans update)',
        intro: 'En cours mais aucune activité depuis plus de 5 jours. Relance ou réassigne.',
        editableFields: ['leader', 'points'],
        match: t => ['inprog', 'review', 'test'].includes(t.status) && t.updatedAt &&
            (Date.now() - new Date(t.updatedAt).getTime()) > 5 * 86400 * 1000,
    },
    {
        key: 'unassigned',
        icon: '👤', label: 'Sans assigné·e',
        desc: 'Tickets actifs sans leader',
        sev: 'info',
        title: 'Tickets sans assigné·e',
        intro: 'Ces tickets n\'ont pas de responsable. Assigne quelqu\'un pour que le travail démarre.',
        editableFields: ['leader', 'points'],
        match: t => t.status !== 'done' && !(t.leader || t.assignee),
    },
    {
        key: 'noPoints',
        icon: '📊', label: 'Sans estimation',
        desc: 'Tickets actifs sans Story Points (hors ActionRetro)',
        sev: 'info',
        title: 'Tickets sans estimation',
        intro: 'Ces tickets n\'ont pas de Story Points. Estime-les pour suivre la vélocité correctement.',
        editableFields: ['points', 'leader'],
        // ActionRetro tickets are excluded — no estimation expected on retro actions.
        match: t => !t.points && t.status !== 'done' && !isActionRetro(t),
    },
    {
        key: 'wip',
        icon: '🔄', label: 'WIP élevé',
        desc: 'Tickets en cours quand le WIP dépasse la capacité de l\'équipe',
        sev: 'warning',
        title: 'WIP élevé — au-delà de la capacité de l\'équipe',
        intro: 'Le nombre de tickets en parallèle dépasse la capacité de l\'équipe (membres présents, congés déduits). Concentre-toi sur les plus avancés ou réassigne.',
        editableFields: ['leader', 'points'],
        // WIP "élevé" = tickets en cours UNIQUEMENT pour les équipes dont le WIP dépasse
        // leur seuil de capacité (membres présents). Signal d'agrégat calculé en amont.
        match: (t, ctx) => ['inprog', 'review', 'test'].includes(t.status)
            && !!ctx?.wipExceededTeams?.has(t.team),
    },
    {
        key: 'scopeCreep',
        icon: '📈', label: 'Périmètre élargi',
        desc: 'Tickets ajoutés après début du sprint actif',
        sev: 'warning',
        title: 'Périmètre élargi — tickets ajoutés en cours de sprint',
        intro: 'Tickets ajoutés après le début du sprint. Vérifie si justifié ou à reporter.',
        editableFields: ['leader', 'points'],
        match: (t, ctx) => ctx?.sprintStartMs && t.createdAt &&
            new Date(t.createdAt).getTime() > ctx.sprintStartMs && t.status !== 'done',
    },
];

/** Lookup by key — O(1) access for alert_modal.js */
export const ANOMALY_BY_KEY = Object.fromEntries(ANOMALY_RULES.map(r => [r.key, r]));

/**
 * Score de santé 0–100 — SOURCE UNIQUE, partagée par health.js (score global) et par la
 * météo des équipes (score par équipe). Pondération par gravité, puis NORMALISATION par le
 * nombre de tickets actifs : une équipe de 3 avec 2 bloqués pèse plus qu'une de 8 avec 3.
 * Un compte brut ne doit jamais être présenté comme un score.
 *
 * @param {Object<string, number>} countsByKey  anomalies par clé (cf. ANOMALY_RULES)
 * @param {number} activeCount                  tickets non terminés du périmètre
 */
export const HEALTH_WEIGHTS = Object.freeze({ danger: 3, warning: 1.5, info: 0.5 });
export function healthScore(countsByKey, activeCount) {
    const base = Math.max(1, activeCount || 0);
    let weighted = 0;
    for (const a of ANOMALY_RULES) weighted += (countsByKey?.[a.key] || 0) * (HEALTH_WEIGHTS[a.sev] ?? 1);
    return Math.max(0, Math.min(100, Math.round(100 - (weighted / base) * 35)));
}
