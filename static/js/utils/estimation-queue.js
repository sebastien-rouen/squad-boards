/**
 * File des tickets À ESTIMER d'une équipe — SOURCE UNIQUE de son ordre : page « Séance d'affinage »
 * (views/refinement.js) ET bouton « ⏭ Suivant » de la popin Poker (modal.js, `_nextToEstimate`).
 *
 * À estimer = même équipe, non terminé, sans points (> 0), hors epics / features.
 * Ordre : sprint de référence (`sprintName`), puis autres sprints DU PLUS PROCHE AU PLUS LOIN (3.241.0,
 * `sprintProximity`), puis backlog (sans sprint) ; à égalité, priorité (`priorityKey`) puis ancienneté de création.
 */
import { priorityKey } from './priority.js';

const _PRIO = { critical: 0, high: 1, medium: 2, low: 3 };

/** Groupes de la file, dans l'ordre d'affichage. */
export const ESTIMATION_GROUPS = [
    { key: 'sprint',  label: 'Sprint en cours' },
    { key: 'other',   label: 'Autres sprints' },
    { key: 'backlog', label: 'Backlog' },
];

const _label = name => { const m = String(name || '').match(/(\d{2})\.(\d+)/); return m ? Number(m[1]) * 100 + Number(m[2]) : Infinity; };
const _ms = d => (d ? Date.parse(d) : NaN);

/**
 * Rang de proximité des sprints : actif(s), puis à venir par date de début croissante, puis clos du plus
 * récent au plus ancien (des tickets non finis y traînent : signalés, mais loin). Sprint sans date connue
 * (JIRA ne crée les sprints futurs qu'en cours de PI) : situé par son numéro « NN.N » — postérieur au sprint
 * en cours → après les « à venir » datés (`future`), sinon tout au bout. Plusieurs sprints du même nom
 * (équipes) : la 1ʳᵉ date connue fait foi.
 * @param {string[]} names
 * @param {{ name: string, state?: string, startDate?: string, endDate?: string }[]} teamSprints  (`sprintInfo.teamSprints`)
 * @returns {Map<string, { rank: number, state: string, startDate: string|null, endDate: string|null }>}
 */
export function sprintProximity(names, teamSprints = [], now = Date.now()) {
    const info = name => (teamSprints || []).find(s => s.name === name && s.startDate) || (teamSprints || []).find(s => s.name === name) || null;
    // Repère « NN.N » du présent : sprint actif connu (de toute équipe), sinon le plus récent des clos
    const known = (teamSprints || []).filter(s => Number.isFinite(_label(s.name)));
    const act = known.filter(s => s.state === 'active').map(s => _label(s.name));
    const ref = act.length ? Math.min(...act) : Math.max(-Infinity, ...known.filter(s => s.state === 'closed').map(s => _label(s.name)));
    const rows = [...new Set(names)].map(name => {
        const s = info(name);
        const start = _ms(s?.startDate), end = _ms(s?.endDate);
        let state = s?.state === 'active' || (start <= now && !(end < now)) ? 'active'
            : s?.state === 'closed' || end < now ? 'closed' : Number.isFinite(start) ? 'future' : 'unknown';
        let bucket = { active: 0, future: 1, closed: 2, unknown: 3 }[state];
        let key = state === 'closed' ? -(end || start || 0) : state === 'unknown' ? _label(name) : start || 0;
        if (state === 'unknown' && _label(name) > ref) { state = 'future'; bucket = 1; key = 1e14 + _label(name); }   // après les datés
        return { name, state, bucket, key, startDate: s?.startDate || null, endDate: s?.endDate || null };
    }).sort((a, b) => a.bucket - b.bucket || a.key - b.key || a.name.localeCompare(b.name));
    return new Map(rows.map((r, i) => [r.name, { rank: i, state: r.state, startDate: r.startDate, endDate: r.endDate }]));
}

/**
 * @param {object[]} tickets
 * @param {string}   team
 * @param {object}   [opts]  `sprintName` = sprint de référence (1ᵉʳ groupe), `exclude` = id à écarter,
 *                           `teamSprints` = `sprintInfo.teamSprints` (ordre de proximité des autres sprints)
 * @returns {{ t: object, group: 'sprint'|'other'|'backlog' }[]}
 */
export function estimationQueue(tickets, team, { sprintName = '', exclude = '', teamSprints = [] } = {}) {
    if (!team) return [];
    const group = t => (sprintName && t.sprintName === sprintName ? 'sprint' : t.sprintName ? 'other' : 'backlog');
    const rank = { sprint: 0, other: 1, backlog: 2 };
    const items = (tickets || [])
        .filter(t => t.id !== exclude && t.team === team && t.status !== 'done'
            && !(Number(t.points) > 0) && !['epic', 'feature'].includes(t.type))
        .map(t => ({ t, group: group(t) }));
    const prox = sprintProximity(items.filter(x => x.group === 'other').map(x => x.t.sprintName), teamSprints);
    const sRank = x => (x.group === 'other' ? prox.get(x.t.sprintName)?.rank ?? Infinity : 0);
    return items
        .sort((a, b) => rank[a.group] - rank[b.group] || sRank(a) - sRank(b)
            || _PRIO[priorityKey(a.t.priority)] - _PRIO[priorityKey(b.t.priority)]
            || String(a.t.createdAt || '').localeCompare(String(b.t.createdAt || '')));
}
