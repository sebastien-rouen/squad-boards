/**
 * Correspondance des statuts et types JIRA PROPRE AU PROJET (3.268.0) — complète STATUS_MAP / TYPE_MAP
 * (config.js, libellés courants) sans toucher au code.
 *
 *   Statut : statuts forcés > CETTE correspondance > colonne du board JIRA > STATUS_MAP > « À faire ».
 *   Type   : CETTE correspondance > TYPE_MAP > « Tâche ».
 * Réglages de projet `sb-status-map` / `sb-type-map` = { « libellé en minuscules » : clé interne }. Une
 * correspondance s'applique dès le chargement (status-override.js rejoue les tickets) ; un type, lui, n'est
 * recalculé qu'à la prochaine synchro (le libellé JIRA du type n'est pas gardé sur le ticket).
 *
 * La synchro note les libellés qu'AUCUNE source ne connaît (`noteUnmapped`) ; ils sont enregistrés en fin de
 * synchro (`sb-sync-unmapped`) et listés dans Paramètres → JIRA → Correspondance, à ranger en un clic.
 */
import { projectStorage } from '../project-settings.js';

export const STATUS_MAP_KEY = 'sb-status-map';
export const TYPE_MAP_KEY = 'sb-type-map';
export const UNMAPPED_KEY = 'sb-sync-unmapped';
export const STATUS_KEYS = ['todo', 'inprog', 'review', 'test', 'blocked', 'done'];
export const TYPE_KEYS = ['story', 'bug', 'task', 'support', 'ops', 'debt', 'epic', 'feature'];

export const normLabel = s => String(s || '').toLowerCase().trim();

// Lecture mémorisée par valeur brute : mapStatus est appelé pour chaque ticket d'une synchro.
const _cache = {};
function _read(key) {
    const raw = projectStorage.getItem(key) || '';
    if (_cache[key]?.raw === raw) return _cache[key].map;
    let map = {};
    try { map = JSON.parse(raw || '{}') || {}; } catch { /* réglage illisible : ignoré */ }
    _cache[key] = { raw, map };
    return map;
}

export const customStatusMap = () => _read(STATUS_MAP_KEY);
export const customTypeMap = () => _read(TYPE_MAP_KEY);
export const customStatusOf = name => customStatusMap()[normLabel(name)] || null;
export const customTypeOf = name => customTypeMap()[normLabel(name)] || null;

/** Range (ou libère, `value` vide) un libellé. `kind` = 'status' | 'type'. */
export function setCustomMapping(kind, name, value) {
    const key = kind === 'type' ? TYPE_MAP_KEY : STATUS_MAP_KEY;
    const allowed = kind === 'type' ? TYPE_KEYS : STATUS_KEYS;
    const map = { ..._read(key) };
    if (value && allowed.includes(value)) map[normLabel(name)] = value; else delete map[normLabel(name)];
    if (Object.keys(map).length) projectStorage.setItem(key, JSON.stringify(map)); else projectStorage.removeItem(key);
}

// ── Libellés inconnus vus pendant une synchro ─────────────────────────────────
let _seen = { statuses: {}, types: {} };
/** Appelé par sync-parse pour un libellé qu'aucune source ne range (garde le libellé d'origine pour l'affichage). */
export function noteUnmapped(kind, label) {
    const bag = kind === 'type' ? _seen.types : _seen.statuses;
    const k = String(label || '').trim();
    if (k) bag[k] = (bag[k] || 0) + 1;
}
export function resetUnmapped() { _seen = { statuses: {}, types: {} }; }

/** Fin de synchro : enregistre ce qui a été vu (une synchro rapide complète la liste, une complète la remplace). */
export function saveUnmapped({ merge = false } = {}) {
    const prev = merge ? readUnmapped() : { statuses: {}, types: {} };
    const add = (a, b) => { const o = { ...a }; for (const [k, n] of Object.entries(b)) o[k] = (o[k] || 0) + n; return o; };
    const out = { at: new Date().toISOString(), statuses: add(prev.statuses, _seen.statuses), types: add(prev.types, _seen.types) };
    if (Object.keys(out.statuses).length || Object.keys(out.types).length) projectStorage.setItem(UNMAPPED_KEY, JSON.stringify(out));
    else if (!merge) projectStorage.removeItem(UNMAPPED_KEY);
    resetUnmapped();
}

/** Libellés inconnus enregistrés, SANS ceux rangés depuis : { at, statuses: {libellé: n}, types: {…} }. */
export function readUnmapped() {
    let v = {};
    try { v = JSON.parse(projectStorage.getItem(UNMAPPED_KEY) || '{}') || {}; } catch { /* illisible */ }
    const keep = (bag, custom) => Object.fromEntries(Object.entries(bag || {}).filter(([k]) => !custom[normLabel(k)]));
    return { at: v.at || null, statuses: keep(v.statuses, customStatusMap()), types: keep(v.types, customTypeMap()) };
}
