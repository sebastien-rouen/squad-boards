/**
 * Archive des sprints clos + mémoire des sprints clos VIDES (extrait de sync.js en 3.252.0).
 * Ré-exporté par sync.js (`clearEmptyClosedMemory` pour app.js, `_buildClosedArchive` pour les tests).
 */
import { store } from './state.js';

/**
 * Archive des sprints clos — ce qu'une sync complète n'a pas besoin de re-télécharger.
 *
 * La sync complète est en mode `replace` : elle efface puis ré-importe. L'historique ne
 * s'accumule donc JAMAIS, et élargir la fenêtre se repaie intégralement à chaque fois —
 * `closedTicketSprints` coûtant un appel par sprint ET par board, une profondeur d'un an
 * sur quatorze boards fait ~364 appels avec changelog, à chaque sync complète.
 *
 * Or un sprint CLOS ne bouge plus : son périmètre, ses points et ses dates sont figés. On
 * relit donc ses tickets depuis la base et on les réinjecte dans le payload, au lieu de les
 * redemander à JIRA. Seule la première sync après un élargissement paie le prix.
 *
 * ⚠️ Repose sur l'aller-retour exact entre `_ticket_dict` (serializers.py) et le contrat lu
 * par `import_all` (data.py) : les objets du store repartent tels quels. Y compris
 * `createdAt` — sans le correctif 3.143.1 qui le persiste, chaque archivage aurait re-daté
 * les tickets à l'heure de la sync, exactement le bug qu'on venait de corriger.
 *
 * ⚠️ Contrepartie assumée : une correction faite dans JIRA sur un sprint déjà clos (points
 * réajustés, statut rectifié) ne redescendra plus. C'est pourquoi le réglage est
 * désactivable, et pourquoi « Tout réimporter depuis JIRA » le contourne.
 *
 * Exportée pour les tests — comme `makeIncidents`, sa logique se vérifie sans lancer d'import.
 *
 * @param {boolean} enabled  false → archive vide, comportement d'origine
 * @param {(name:string)=>boolean} isExcludedTeam
 */
const EMPTY_CLOSED_KEY = 'sb-sync-emptyClosed';
const EMPTY_CLOSED_MAX = 800;   // borne : ~40 boards × 20 sprints vides, largement au-delà du parc

/**
 * Sprints clos constatés SANS AUCUN TICKET — la moitié manquante de l'archive.
 *
 * `_buildClosedArchive` ne peut retenir qu'un sprint qui a laissé des tickets en base. Un
 * sprint clos réellement vide n'y entre donc jamais et se fait réinterroger à chaque sync,
 * pour rien. Mesuré le 25/08/2026 : 85 des 254 sprints de la fenêtre (33 %) — c'est-à-dire
 * la TOTALITÉ des appels que l'archive laissait passer.
 *
 * ⚠️ On ne mémorise QUE sur un appel RÉUSSI renvoyant zéro issue. Un 401 ou un timeout rend
 * aussi « aucun ticket » : le confondre avec un sprint vide graverait une panne passagère
 * dans la mémoire, et le sprint ne serait plus jamais redemandé.
 *
 * Même contrepartie que l'archive — un sprint clos qu'on rattacherait plus tard à un ticket
 * dans JIRA resterait invisible — donc même interrupteur (`archiveClosed`) et même
 * contournement (« Tout réimporter depuis JIRA », qui purge la liste).
 */
export function _loadEmptyClosed(enabled) {
    if (!enabled) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(EMPTY_CLOSED_KEY) || '[]')); }
    catch { return new Set(); }
}

export function _saveEmptyClosed(ids) {
    try {
        // Les plus récemment constatés en dernier : c'est le début qu'on sacrifie si ça déborde.
        const list = [...ids].slice(-EMPTY_CLOSED_MAX);
        localStorage.setItem(EMPTY_CLOSED_KEY, JSON.stringify(list));
    } catch { /* quota localStorage : la mémoire est un confort, pas une dépendance */ }
}

/** Purge la mémoire des sprints vides — appelée par « Tout réimporter depuis JIRA ». */
export function clearEmptyClosedMemory() {
    try { localStorage.removeItem(EMPTY_CLOSED_KEY); } catch { /* ignore */ }
}

export function _buildClosedArchive(enabled, isExcludedTeam) {
    const vide = { bySprintId: new Map(), sprintCount: 0, ticketCount: 0 };
    if (!enabled) return vide;
    const prev = store.get('tickets') || [];
    if (!prev.length) return vide;
    // Un sprint n'est archivable que s'il est CLOS : un sprint actif ou futur bouge encore.
    const closedIds = new Set(
        (store.get('sprintInfo')?.teamSprints || [])
            .filter(s => s.state === 'closed' && s.jiraId && !isExcludedTeam(s.team))
            .map(s => String(s.jiraId))
    );
    if (!closedIds.size) return vide;
    const bySprintId = new Map();
    let ticketCount = 0;
    for (const t of prev) {
        // Features et epics ont leurs propres passes JQL, qui tournent de toute façon :
        // les archiver les ferait exister en double.
        if (t.type === 'feature' || t.type === 'epic') continue;
        if (isExcludedTeam(t.team)) continue;
        const sid = String(t.sprint || '');
        if (!sid || !closedIds.has(sid)) continue;
        if (!bySprintId.has(sid)) bySprintId.set(sid, []);
        bySprintId.get(sid).push(t);
        ticketCount++;
    }
    return { bySprintId, sprintCount: bySprintId.size, ticketCount };
}

