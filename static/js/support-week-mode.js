/**
 * Mode de semaine de support par équipe (« Jeu → Mer »…) — ÉCRITURE en base.
 *
 * Avant 3.165.0, le mode vivait en localStorage (`rot-mode-<équipe>`) : chaque navigateur avait
 * le sien, et un poste neuf voyait toutes les équipes en « Ven → Jeu ». La grille, la page
 * Support, le Dashboard et l'Agenda y lisaient alors d'autres semaines que celles saisies.
 * La lecture reste `getSupportWeekMode()` (utils/support.js) : base d'abord, localStorage en repli.
 * Module hors de `utils/` : il parle à l'API, les utilitaires restent purs (tests Node).
 */

import { store } from './state.js';
import * as api from './api.js';
import { SUPPORT_WEEK_MODES } from './utils.js';

const _LS_PREFIX = 'rot-mode-';

/** Pose le mode dans le piInfo du store EN PLACE : lecture synchrone immédiate par les rendus
 *  qui suivent, sans store.set (qui relancerait tous les écouteurs de piInfo). */
function _setLocal(team, mode) {
    try { localStorage.setItem(`${_LS_PREFIX}${team}`, mode); } catch { /* navigation privée */ }
    const pi = store.get('piInfo');
    if (pi) pi.supportWeekModes = { ...(pi.supportWeekModes || {}), [team]: mode };
    else store.set('piInfo', { supportWeekModes: { [team]: mode } });
}

/**
 * Enregistre le mode d'une équipe : store + localStorage tout de suite (l'appelant peut
 * re-rendre sans attendre), puis base. Renvoie la promesse de l'appel API.
 * @param {string} team
 * @param {string} mode  clé de SUPPORT_WEEK_MODES
 */
export function saveSupportWeekMode(team, mode) {
    if (!team || !SUPPORT_WEEK_MODES[mode]) return Promise.resolve(null);
    _setLocal(team, mode);
    return api.setSupportWeekMode(team, mode);
}

/**
 * Reprise des réglages d'avant 3.165.0 : pousse en base les modes de CE navigateur que la base
 * ne connaît pas encore. La base l'emporte toujours — une équipe déjà réglée n'est jamais écrasée
 * par un vieux localStorage d'un autre poste. Appelée après chaque chargement des données.
 */
export async function migrateLocalWeekModes() {
    let keys = [];
    try { keys = Object.keys(localStorage).filter(k => k.startsWith(_LS_PREFIX)); } catch { return; }
    const known = store.get('piInfo')?.supportWeekModes || {};
    for (const key of keys) {
        const team = key.slice(_LS_PREFIX.length);
        const mode = localStorage.getItem(key);
        if (!team || known[team] || !SUPPORT_WEEK_MODES[mode]) continue;
        try { await saveSupportWeekMode(team, mode); } catch { /* réessayé au prochain chargement */ }
    }
}
