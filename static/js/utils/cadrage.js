/**
 * 🧭 Tickets de CADRAGE d'une équipe — SOURCE UNIQUE de leur sélection (page Affinage).
 *
 * Un ticket de cadrage porte l'étiquette `Cadrage_PI<N>` et vit dans le sprint « Cadrage - Itération N.1 » :
 * le cadrage du sujet, pour qu'il soit prêt et macro-estimé. CIBLE = le PROCHAIN PI (on prépare en amont :
 * en 31.4, ce sont les `Cadrage_PI32`) ; s'y ajoutent les `Cadrage_PI<PI en cours>` encore ouverts
 * (PI 31 : 41 tickets). Ils appartiennent rarement à l'équipe (souvent « ERPC - Team Transverse ») :
 * on ne filtre donc PAS sur `t.team`, mais sur trois regards, par ordre d'affichage :
 *   • 🏛 SA          — étiquette `SA-<périmètre>`            (Fuego : SA-INFRA)
 *   • 🎯 PO / PM     — étiquette `PO-<périmètre>` / `PM-…`   (Fuego : PO-INFRA)
 *   • 🤝 contributeur — un membre de l'équipe est contributeur ou porteur (leader) du ticket, OU le
 *     ticket porte une étiquette métier de l'équipe (Fuego : OPS), OU il est rangé dans l'équipe.
 * Un ticket peut relever de plusieurs regards : il apparaît dans chacun (chaque rôle a sa part à faire).
 *
 * Périmètre = `CADRAGE_PERIMETERS[équipe]` (config.js), sinon le nom de la ligne produit (groupe du
 * topbar contenant l'équipe : Juke → GEX).
 */
import { CADRAGE_PERIMETERS } from '../config.js';
import { findPerson } from './person-name.js';
import { isAbandoned } from './sprint-scope.js';
import { priorityKey } from './priority.js';

export const CADRAGE_ROLES = [
    { key: 'sa',      icon: '🏛', label: 'En tant que SA' },
    { key: 'po',      icon: '🎯', label: 'En tant que PO / PM' },
    { key: 'contrib', icon: '🤝', label: 'En tant que contributeur' },
];

const _CADRAGE_RE = /^cadrage[\s_-]*pi\s*#?\s*(\d+)$/i;
const _PRIO = { critical: 0, high: 1, medium: 2, low: 3 };
const _STATUS_RANK = { blocked: 0, inprog: 1, review: 2, test: 3, todo: 4, done: 9 };

/** Numéros de PI des étiquettes `Cadrage_PI<N>` d'un ticket. */
export const cadragePis = t => (t.labels || []).map(l => String(l).trim().match(_CADRAGE_RE)).filter(Boolean).map(m => +m[1]);

/** Périmètre de cadrage d'une équipe : `{ product, tags }` (product en majuscules, '' si inconnu). */
export function cadragePerimeter(team, groups = []) {
    const own = CADRAGE_PERIMETERS[team];
    const product = own?.product || (groups.find(g => (g.teams || []).includes(team))?.name) || '';
    return { product: String(product).toUpperCase(), tags: (own?.tags || []).map(x => String(x).toUpperCase()) };
}

/**
 * @param {object}   p
 * @param {object[]} p.tickets
 * @param {string}   p.team
 * @param {number}   p.piNum        PI EN COURS de l'équipe (son sprint actif) — la cible est piNum + 1
 * @param {object[]} [p.groups]     lignes produit (store `groups`)
 * @param {string[]} [p.roster]     noms (RH) des membres de l'équipe au PI
 * @param {object}   [p.aliases]    `piInfo.personAliases` (JIRA → RH)
 * @param {Function} [p.sameTeam]   `teamNameMatches`
 * @param {number[]} [p.pis]        PI CHOISIS (3.247.0) : tickets portant une étiquette `Cadrage_PI<N>` de la liste,
 *                                  tous statuts. Absent / vide = AUTOMATIQUE (PI suivant + PI en cours encore ouvert).
 */
export function cadrageModel({ tickets, team, piNum, groups = [], roster = [], aliases = null, sameTeam = (a, b) => a === b, pis = null }) {
    const perimeter = cadragePerimeter(team, groups);
    const { product, tags } = perimeter;
    const isMember = name => !!(name && findPerson(name, roster, aliases));
    const chosen = Array.isArray(pis) && pis.length ? [...new Set(pis.map(Number))].sort((a, b) => a - b) : null;
    const items = [];
    const byPi = new Map();   // PI → { total, done, open } sur le périmètre (alimente le sélecteur de PI)
    for (const t of tickets || []) {
        if (!piNum || isAbandoned(t)) continue;
        const tPis = cadragePis(t);
        if (!tPis.length) continue;
        const labels = (t.labels || []).map(l => String(l).trim().toUpperCase());
        const members = [...(t.contributors || []), t.leader].filter(isMember);
        const roles = [];
        if (product && labels.includes(`SA-${product}`)) roles.push('sa');
        if (product && (labels.includes(`PO-${product}`) || labels.includes(`PM-${product}`))) roles.push('po');
        if (members.length || labels.some(l => tags.includes(l)) || sameTeam(t.team, team)) roles.push('contrib');
        if (!roles.length) continue;
        const done = t.status === 'done';
        for (const n of new Set(tPis)) {
            const c = byPi.get(n) || { total: 0, done: 0, open: 0 };
            c.total++; if (done) c.done++; else c.open++;
            byPi.set(n, c);
        }
        // Choix explicite : le plus récent des PI choisis portés par le ticket. Automatique : prochain PI (la
        // cible) > PI en cours resté OUVERT (son cadrage n'est pas fini).
        const pi = chosen ? Math.max(0, ...tPis.filter(n => chosen.includes(n)))
            : tPis.includes(piNum + 1) ? piNum + 1 : tPis.includes(piNum) && !done ? piNum : 0;
        if (!pi) continue;
        items.push({ t, pi, roles, members: [...new Set(members)] });
    }
    // Le PI cible d'abord, puis à faire avant prêts (bloqué, en cours…) ; à égalité, priorité puis ancienneté.
    items.sort((a, b) => b.pi - a.pi
        || (_STATUS_RANK[a.t.status] ?? 5) - (_STATUS_RANK[b.t.status] ?? 5)
        || _PRIO[priorityKey(a.t.priority)] - _PRIO[priorityKey(b.t.priority)]
        || String(a.t.createdAt || '').localeCompare(String(b.t.createdAt || '')));
    const groupsOut = CADRAGE_ROLES.map(r => {
        const list = items.filter(x => x.roles.includes(r.key));
        return { ...r, items: list, done: list.filter(x => x.t.status === 'done').length };
    });
    // PI proposés au choix : ceux qui ont des tickets sur le périmètre, + le PI en cours et le suivant (toujours)
    if (piNum) for (const n of [piNum, piNum + 1]) if (!byPi.has(n)) byPi.set(n, { total: 0, done: 0, open: 0 });
    const available = [...byPi.entries()].sort((a, b) => a[0] - b[0])
        .map(([pi, c]) => ({ pi, ...c, target: pi === piNum + 1, current: pi === piNum }));
    return {
        perimeter, piNum, targetPi: piNum + 1,
        auto: !chosen, pis: chosen || [...new Set(items.map(x => x.pi))].sort((a, b) => a - b), available,
        items,   // tous rôles confondus, dans l'ordre d'affichage (série « Macro-estimer » du Poker)
        openCurrent: items.filter(x => x.pi === piNum).length,
        total: items.length,
        done: items.filter(x => x.t.status === 'done').length,
        unestimated: items.filter(x => x.t.status !== 'done' && !(Number(x.t.points) > 0)).length,
        groups: groupsOut,
    };
}
