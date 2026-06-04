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
 *                   ctx = { sprintStartMs: number }
 */
export const ANOMALY_RULES = [
    {
        key: 'blocked',
        icon: '🚫', label: 'Bloqués',
        desc: 'Tickets en statut blocked',
        sev: 'danger',
        title: 'Tickets bloqués',
        intro: 'Identifie le blocker et débloquer rapidement pour limiter l\'impact sprint.',
        editableFields: ['leader', 'points'],
        match: t => t.status === 'blocked',
    },
    {
        key: 'oldBlockers',
        icon: '🔴', label: 'Blockers >48h',
        desc: 'Bloqués sans mouvement depuis >48h',
        sev: 'danger',
        title: 'Blockers sans mouvement > 48h',
        intro: 'Ces blockers stagnent depuis plus de 48h — sollicite l\'équipe pour les résoudre.',
        editableFields: ['leader', 'points'],
        match: t => t.status === 'blocked' && t.updatedAt &&
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
        match: t => !t.points && t.status !== 'done'
            && !(t.labels || []).some(l => /^ActionRetro$/i.test(l)),
    },
    {
        key: 'wip',
        icon: '🔄', label: 'WIP élevé',
        desc: 'Tickets en cours / review / test',
        sev: 'warning',
        title: 'WIP élevé — tickets en cours',
        intro: 'Trop de tickets en parallèle. Concentre-toi sur les plus avancés ou réassigne.',
        editableFields: ['leader', 'points'],
        match: t => ['inprog', 'review', 'test'].includes(t.status),
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
