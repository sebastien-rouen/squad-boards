/**
 * 👀 Contributeurs = WATCHERS JIRA (3.251.0).
 *
 * L'instance n'a pas de champ « Contributeur(s) » : ce sont les observateurs (watchers) d'un ticket
 * qui disent qui, en plus du porteur, s'y intéresse — c'est eux qu'affichent la popin (bande de
 * présence), le volet 🧭 Cadrage de l'Affinage (filtre « contributeur » du roster) et le panneau ↻ JIRA.
 *
 * Coût maîtrisé : la liste n'existe qu'à l'unité (`GET /issue/{clé}/watchers`). Les passes de la
 * synchro demandent `watches` (nombre d'observateurs, gratuit) ; on ne relit QUE les tickets OUVERTS
 * dont le nombre dépasse leurs observateurs « d'office » (porteur + rapporteur, abonnés par JIRA).
 * Concurrence bornée, plafond d'appels ; un échec garde la valeur en base (jamais d'effacement sur panne).
 *
 * Contributeurs = observateurs MOINS porteur, rapporteur et comptes techniques (`isBotName`).
 * Inactif dès qu'un vrai champ Contributeurs est détecté (`contributorsFromWatchers()`).
 */
import * as api from './api.js';
import { isBotName } from './utils.js';
import { contributorsFromWatchers } from './sync-parse.js';

const _CONCURRENCY = 6;
const _MAX_CALLS = 800;

/** Observateurs d'office : JIRA abonne le rapporteur et le porteur à « leur » ticket. */
const _selfWatchers = t => new Set([t.leader || t.assignee, t.reporter].filter(Boolean)).size;

/** Noms d'observateurs → contributeurs (sans porteur, rapporteur ni robot), ordre JIRA conservé. */
export function watchersToContributors(watchers, t) {
    const skip = new Set([t.leader || t.assignee, t.reporter].filter(Boolean).map(n => n.toLowerCase()));
    return [...new Set((watchers || [])
        .filter(w => w && w.active !== false)
        .map(w => String(w.displayName || w.name || '').trim())
        .filter(n => n && !skip.has(n.toLowerCase()) && !isBotName(n)))];
}

/** Lecture des observateurs d'UN ticket (popin ↻ JIRA, synchro). */
export async function fetchWatchers(key) {
    const r = await api.jiraGet(`rest/api/3/issue/${encodeURIComponent(key)}/watchers`);
    return r?.watchers || [];
}

/**
 * Renseigne `contributors` des tickets depuis leurs observateurs et retire la clé technique `_watchCount`.
 * @param {{ tickets: object[], features?: object[], epics?: object[] }} items  payload de la synchro (muté)
 * @param {{ prevTickets?: object[], onProgress?: (done: number, total: number) => void, incidents?: { add: Function } }} opts
 * @returns {Promise<{ fetched: number, failed: number, kept: number, skipped: number } | null>}
 */
export async function fillContributorsFromWatchers({ tickets, features = [], epics = [] }, opts = {}) {
    const counts = new Map(tickets.map(t => [t.id, t._watchCount]));
    for (const x of [...tickets, ...features, ...epics]) delete x._watchCount;
    if (!contributorsFromWatchers()) return null;

    const prev = new Map((opts.prevTickets || []).map(t => [t.id, t.contributors || []]));
    const stats = { fetched: 0, failed: 0, kept: 0, skipped: 0 };
    const todo = [];
    for (const t of tickets) {
        const n = counts.get(t.id);
        if (n === undefined) {                       // pas lu par une passe (archive, …) : valeur en base
            t.contributors = prev.get(t.id) || t.contributors || [];
            stats.kept++;
        } else if (t.status === 'done' || t.type === 'feature' || t.type === 'epic' || n <= _selfWatchers(t)) {
            // Terminé, ou personne d'autre que les abonnés d'office : rien à relire
            t.contributors = (t.status === 'done' ? prev.get(t.id) : null) || [];
            stats.skipped++;
        } else {
            todo.push(t);
        }
    }
    if (todo.length > _MAX_CALLS) {
        console.warn(`[Squad-Board] Observateurs : ${todo.length} tickets suivis, plafond ${_MAX_CALLS} — les plus récents d'abord.`);
        todo.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        for (const t of todo.splice(_MAX_CALLS)) { t.contributors = prev.get(t.id) || []; stats.kept++; }
    }

    let i = 0, firstErr = null;
    const worker = async () => {
        while (i < todo.length) {
            const t = todo[i++];
            try {
                t.contributors = watchersToContributors(await fetchWatchers(t.id), t);
                stats.fetched++;
            } catch (e) {
                t.contributors = prev.get(t.id) || [];   // panne ≠ « personne » : on garde la base
                stats.failed++;
                firstErr ||= e;
            }
            opts.onProgress?.(stats.fetched + stats.failed, todo.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(_CONCURRENCY, todo.length) }, worker));
    if (firstErr) opts.incidents?.add(`observateurs (contributeurs) — ${stats.failed} ticket(s)`, firstErr);
    console.log(`[Squad-Board] Contributeurs depuis les observateurs JIRA : ${stats.fetched} relus, ${stats.skipped} sans autre observateur, ${stats.kept} conservés, ${stats.failed} en échec.`);
    return stats;
}
