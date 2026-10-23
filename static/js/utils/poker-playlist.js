/**
 * 🃏 « Liste de jeu » du Poker (3.248.0) — une série de tickets choisie ailleurs que dans la file d'estimation.
 *
 * Usage : le volet 🧭 Cadrage de l'Affinage lance « Macro-estimer les N » → `setPokerPlaylist` avec les tickets de
 * cadrage non estimés des PI affichés, puis ouvre le Poker sur le premier. Tant que la liste est active ET que le
 * ticket affiché en fait partie, « ⏭ Suivant » du Poker n'enchaîne QUE sur elle (`playlistNext`) au lieu de
 * `estimationQueue`. Un ticket estimé (points > 0) ou terminé sort de la liste. Un ticket ouvert hors liste
 * retrouve la file normale ; « ✕ » sur le bandeau du Poker l'abandonne.
 * Mémoire de session (`sessionStorage`) : la liste survit au rechargement de l'onglet, pas au-delà.
 */
const _KEY = 'sb-poker-playlist';
let _pl = null;
try { _pl = JSON.parse(sessionStorage.getItem(_KEY) || 'null'); } catch { _pl = null; }

const _save = () => { try { _pl ? sessionStorage.setItem(_KEY, JSON.stringify(_pl)) : sessionStorage.removeItem(_KEY); } catch { /* sans gravité */ } };
const _pending = t => t && t.status !== 'done' && !(Number(t.points) > 0);

/** @param {{label: string, ids: string[]}} pl */
export function setPokerPlaylist({ label, ids }) { _pl = ids?.length ? { label, ids: [...new Set(ids)] } : null; _save(); }
export function clearPokerPlaylist() { _pl = null; _save(); }

/** Liste active pour CE ticket (null si aucune, ou si le ticket n'en fait pas partie). */
export function playlistFor(ticketId) { return _pl && _pl.ids.includes(ticketId) ? _pl : null; }

/** Tickets restant à estimer dans la liste, ordre de la liste, hors `exclude`. */
export function playlistNext(tickets, exclude) {
    if (!_pl) return [];
    const byId = new Map((tickets || []).map(t => [t.id, t]));
    return _pl.ids.filter(id => id !== exclude).map(id => byId.get(id)).filter(_pending);
}
