/**
 * Tickets récemment ouverts (3.237.0) — alimenté par `openTicketModal`, relu par la palette Ctrl+K à vide
 * (« 🎫 Tickets récents »). Confort par écran : localStorage, 8 ids, le plus récent d'abord.
 */
const KEY = 'sb-recent-tickets';
const MAX = 8;

export function recentTicketIds() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function rememberTicket(id) {
    if (!id) return;
    const ids = [String(id), ...recentTicketIds().filter(x => x !== String(id))].slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* non retenu */ }
}
