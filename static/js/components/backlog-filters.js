/**
 * Backlog filter state — persistence localStorage + helpers d'application.
 * Séparé pour alléger backlog.js.
 */

const LS_KEY = 'sb-backlog-filters';

export function defaultFilters() {
    return { search: '', types: [], statuses: [], priorities: [], pi: '' };
}

export function loadFilters() {
    try { return { ...defaultFilters(), ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
    catch { return defaultFilters(); }
}

export function saveFilters(f) {
    localStorage.setItem(LS_KEY, JSON.stringify(f));
}

export function clearFilters() {
    localStorage.removeItem(LS_KEY);
}

export function hasActiveFilters(f) {
    return !!(f.search || f.types?.length || f.statuses?.length || f.priorities?.length || f.pi);
}

export function applyFilters(tickets, f) {
    const q = (f.search || '').trim().toLowerCase();
    return tickets.filter(t => {
        if (q && !(t.title || '').toLowerCase().includes(q) && !(t.id || '').toLowerCase().includes(q)) return false;
        if (f.types?.length      && !f.types.includes(t.type))         return false;
        if (f.statuses?.length   && !f.statuses.includes(t.status))    return false;
        if (f.priorities?.length && !f.priorities.includes(t.priority)) return false;
        if (f.pi                 && t.piSprint !== f.pi)               return false;
        return true;
    });
}
