/**
 * Modules activables et libellés du menu (3.273.0) — réglage de projet `sb-modules` =
 * { off: ['pi', 'atlas', …], labels: { pi: 'Release', … } }.
 *
 * Un module désactivé disparaît de la navigation (barre latérale, raccourcis chiffrés, palette Ctrl+K, blocs de
 * page) et sa route renvoie au Dashboard ; ses données restent intactes. Dashboard et Paramètres sont toujours
 * actifs. Les libellés sont appliqués EN PLACE sur NAV_ITEMS (source unique de la navigation) : barre latérale,
 * titres d'onglet, palette et blocs de page les relisent à chaque rendu.
 */
import { NAV_ITEMS } from '../config.js';
import { store } from '../state.js';
import { projectStorage } from '../project-settings.js';

export const MODULES_KEY = 'sb-modules';
export const ALWAYS_ON = Object.freeze(['dashboard', 'settings']);
const DEFAULT_LABELS = Object.freeze(Object.fromEntries(NAV_ITEMS.map(n => [n.id, n.label])));
export const defaultLabel = id => DEFAULT_LABELS[id] || id;

export function modulesConfig() {
    let v = {};
    try { v = JSON.parse(projectStorage.getItem(MODULES_KEY) || '{}') || {}; } catch { /* réglage illisible : tout actif */ }
    return { off: (v.off || []).filter(id => !ALWAYS_ON.includes(id)), labels: v.labels || {} };
}

/** Vue active ? Les vues hors menu (tv, kanban, picalendar…) suivent leur module parent quand il y en a un. */
const _PARENT = { kanban: 'sprint', picalendar: 'pi' };
export const isModuleOn = view => !modulesConfig().off.includes(_PARENT[view] || view);

/** Applique les libellés du projet sur NAV_ITEMS (en place). */
export function applyNavLabels() {
    const { labels } = modulesConfig();
    for (const n of NAV_ITEMS) n.label = String(labels[n.id] || '').trim() || DEFAULT_LABELS[n.id];
}

export function saveModulesConfig({ off, labels }) {
    const o = [...new Set(off)].filter(id => !ALWAYS_ON.includes(id));
    const l = Object.fromEntries(Object.entries(labels || {}).map(([k, v]) => [k, String(v || '').trim()]).filter(([k, v]) => v && v !== DEFAULT_LABELS[k]));
    if (o.length || Object.keys(l).length) projectStorage.setItem(MODULES_KEY, JSON.stringify({ off: o, labels: l }));
    else projectStorage.removeItem(MODULES_KEY);
}

// Réglage changé (chargement, autre poste, Paramètres) : libellés rafraîchis, vue désactivée → Dashboard.
applyNavLabels();
store.on('projectSettings', (v, old) => {
    if ((v?.[MODULES_KEY] || '') === (old?.[MODULES_KEY] || '')) return;
    applyNavLabels();
    store.set('navVersion', (store.get('navVersion') || 0) + 1);   // la barre latérale se redessine
    if (!isModuleOn(store.get('view'))) store.set('view', 'dashboard');
});
store.transform('view', v => (v && !isModuleOn(v) ? 'dashboard' : v));
