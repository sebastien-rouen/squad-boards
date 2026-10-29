/**
 * Rôles canoniques (3.286.0) — un même rôle n'a qu'UN libellé dans tout le site (« Product Owner », jamais « PO »).
 *
 * Trois règles, dans l'ordre :
 *   1. alias du projet (réglage `sb-role-aliases`, édité dans Paramètres → Capacité par rôle : « même rôle que… ») ;
 *   2. abréviations usuelles (`DEFAULT_ROLE_ALIASES`) ;
 *   3. casse et accents ignorés : « DIMI » = « DiMi » ; la graphie la PLUS FRÉQUENTE l'emporte.
 * Appliqué au CHARGEMENT (`store.transform` sur `members` et `piInfo` : rôles des rosters par PI et clés de
 * `roleCapacity`) — les vues et `roleCapacityPct` ne voient que des libellés canoniques. La base garde la saisie RH.
 */
import { store } from '../state.js';
import { projectStorage } from '../project-settings.js';

export const ROLE_ALIASES_KEY = 'sb-role-aliases';
/** Abréviations reconnues partout (clé repliée → libellé affiché). */
export const DEFAULT_ROLE_ALIASES = Object.freeze({
    po: 'Product Owner', sm: 'Scrum Master', tl: 'Tech Lead', bo: 'Business Owner', rte: 'Release Train Engineer',
});

export const foldRole = r => String(r || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Alias saisis pour le projet : { « libellé source » : « libellé cible » }. */
export function projectRoleAliases() {
    try { return JSON.parse(projectStorage.getItem(ROLE_ALIASES_KEY) || '{}') || {}; } catch { return {}; }
}

export function setRoleAlias(from, to) {
    const cur = projectRoleAliases();
    if (to && foldRole(to) !== foldRole(from)) cur[from] = to; else delete cur[from];
    if (Object.keys(cur).length) projectStorage.setItem(ROLE_ALIASES_KEY, JSON.stringify(cur));
    else projectStorage.removeItem(ROLE_ALIASES_KEY);
}

// Graphies vues au chargement : repli → { graphie : nombre } (members + rosters) — la plus fréquente gagne
const _seen = new Map();
function _note(role) {
    if (!role) return;
    const k = foldRole(role);
    const m = _seen.get(k) || new Map();
    m.set(role, (m.get(role) || 0) + 1);
    _seen.set(k, m);
}
function _bestSpelling(role) {
    const m = _seen.get(foldRole(role));
    if (!m) return String(role).trim();
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/** Libellé canonique d'un rôle (vide → vide). */
export function canonicalRole(role) {
    if (!role) return role;
    const proj = Object.fromEntries(Object.entries(projectRoleAliases()).map(([k, v]) => [foldRole(k), v]));
    let r = role;
    for (let i = 0; i < 3; i++) {   // une cible peut elle-même être un alias (PO → Product owner → graphie la plus fréquente)
        const k = foldRole(r);
        const next = proj[k] || DEFAULT_ROLE_ALIASES[k];
        if (!next || foldRole(next) === k) break;
        r = next;
    }
    return _bestSpelling(r);
}

// Compter TOUTES les graphies avant de remplacer : sinon la première lue fixerait la « plus fréquente »
const _mapRoles = list => (Array.isArray(list) ? list.map(m => (m?.role ? { ...m, role: canonicalRole(m.role) } : m)) : list);

function _canonMembers(list) {
    if (!Array.isArray(list)) return list;
    list.forEach(m => _note(m?.role));
    return _mapRoles(list);
}

function _canonPi(pi) {
    if (!pi || typeof pi !== 'object') return pi;
    const snaps = pi.piMembers || {};
    Object.values(snaps).forEach(l => (Array.isArray(l) ? l : []).forEach(m => _note(m?.role)));
    const piMembers = Object.fromEntries(Object.entries(snaps).map(([k, l]) => [k, _mapRoles(l)]));
    // Pondérations : clés canoniques ; si deux graphies avaient chacune une valeur, celle du libellé canonique prime
    const rc = {};
    for (const [role, pct] of Object.entries(pi.roleCapacity || {})) {
        const c = canonicalRole(role);
        if (!(c in rc) || role === c) rc[c] = pct;
    }
    return { ...pi, piMembers, roleCapacity: rc };
}

store.transform('members', _canonMembers);
store.transform('piInfo', _canonPi);
