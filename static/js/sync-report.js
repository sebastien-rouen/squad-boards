/**
 * Synchro JIRA — rapport et progression (extrait de sync.js, 3.178.0, déplacé tel quel) :
 * collecteur d'échecs partiels, équipes retirées de l'import, barre et carte de progression.
 */

import { store } from './state.js';
import { toast } from './utils.js';

/**
 * Collecteur d'échecs PARTIELS d'un import.
 *
 * Un import parcourt des dizaines de boards et de sprints ; qu'un appel échoue ne doit pas
 * tout interrompre. Mais les `catch` muets faisaient l'inverse du bon compromis : l'import
 * se terminait sur un toast de succès, avec un historique de vélocité amputé ou des sprints
 * sans tickets, et rien nulle part pour le dire. Un jeton expiré produisait ainsi un import
 * « réussi » et silencieusement creux.
 *
 * Les incidents sont donc regroupés par (statut HTTP, opération) et comptés : trois lignes de
 * résumé valent mieux que deux cents lignes de console, et mieux que le silence.
 */
export function makeIncidents() {
    const byKey = new Map();
    return {
        add(quoi, e) {
            const status = e?.status || 0;
            const key = `${status}|${quoi}`;
            const cur = byKey.get(key) || { quoi, status, count: 0, message: e?.message || String(e) };
            cur.count++;
            byKey.set(key, cur);
        },
        get total() { return [...byKey.values()].reduce((n, i) => n + i.count, 0); },
        /** Incidents groupés, du plus fréquent au moins fréquent. */
        list() { return [...byKey.values()].sort((a, b) => b.count - a.count); },
        /** Vrai si JIRA a refusé la connexion : la cause dominante, à dire en premier. */
        get hasAuthFailure() { return [...byKey.values()].some(i => i.status === 401 || i.status === 403); },
        /** Résumé court, affichable dans un toast. '' s'il ne s'est rien passé. */
        summary() {
            const l = this.list();
            if (!l.length) return '';
            const detail = l.slice(0, 3)
                .map(i => `${i.quoi}${i.status ? ` (HTTP ${i.status})` : ''} ×${i.count}`)
                .join(', ');
            return `${this.total} appel${this.total > 1 ? 's' : ''} JIRA en échec — ${detail}${l.length > 3 ? '…' : ''}`
                + (this.hasAuthFailure
                    ? ' · JIRA a refusé la connexion : vérifier le jeton (Paramètres → Plugin JIRA)'
                    : '');
        },
    };
}

// ── Équipes / lignes produit retirées (exclusion de la sync JIRA) ───────────────
// Persistées en localStorage. Quand l'utilisateur supprime une équipe (ou une ligne
// produit) dans Paramètres, son nom est ajouté ici pour que la sync JIRA ne la
// recrée pas par défaut. La modale de début de sync permet de "tout réimporter"
// (vide cette liste) ou de "conserver la configuration" (respecte les exclusions).
const EXCLUDED_TEAMS_KEY = 'sb-jira-excluded-teams';

export function getExcludedTeams() {
    try {
        const arr = JSON.parse(localStorage.getItem(EXCLUDED_TEAMS_KEY) || '[]');
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch { return []; }
}
export function addExcludedTeam(name) {
    const n = String(name || '').trim();
    if (!n) return;
    const cur = getExcludedTeams();
    if (!cur.some(t => t.toLowerCase() === n.toLowerCase())) {
        localStorage.setItem(EXCLUDED_TEAMS_KEY, JSON.stringify([...cur, n]));
    }
}
export function removeExcludedTeam(name) {
    const n = String(name || '').trim().toLowerCase();
    localStorage.setItem(EXCLUDED_TEAMS_KEY,
        JSON.stringify(getExcludedTeams().filter(t => t.toLowerCase() !== n)));
}
export function clearExcludedTeams() {
    localStorage.removeItem(EXCLUDED_TEAMS_KEY);
}

// ── Progress UI (header bar — non-bloquant) ───────────────────────────────────
let _hideProgressTimer = null;

export function showProgress() {
    clearTimeout(_hideProgressTimer);
    store.set('syncType', 'jira');
    store.set('syncProgress', 2);
    store.set('syncLabel', 'Initialisation…');
    store.set('syncDetail', '');
}
/**
 * @param {Array} [incidents] échecs partiels — s'il y en a, la carte RESTE ouverte en mode
 *   rapport : un import incomplet mérite mieux qu'un toast de quelques secondes, et le détail
 *   ne doit pas n'exister qu'en console. L'utilisateur la ferme lui-même.
 */
export function hideProgress(incidents = []) {
    store.set('syncProgress', 100);
    store.set('syncIncidents', incidents);
    if (incidents.length) {
        const n = incidents.reduce((s, i) => s + i.count, 0);
        store.set('syncLabel', `Import terminé — ${n} appel${n > 1 ? 's' : ''} JIRA en échec`);
        store.set('syncDetail', 'Des données peuvent manquer.');
        return;   // pas d'effacement automatique
    }
    // Remonte à 100 % pour compléter visuellement, puis efface après transition
    store.set('syncLabel', 'Import termine !');
    _hideProgressTimer = setTimeout(() => {
        store.set('syncProgress', null);
        store.set('syncType', null);
        store.set('syncLabel', '');
        store.set('syncDetail', '');
    }, 600);
}

/** Ferme la carte de sync restée ouverte sur un rapport d'incidents. */
export function dismissSyncReport() {
    store.set('syncIncidents', []);
    store.set('syncProgress', null);
    store.set('syncType', null);
    store.set('syncLabel', '');
    store.set('syncDetail', '');
}
export function setProgress(pct, label, detail = '') {
    store.set('syncProgress', Math.min(100, Math.max(0, pct)));
    store.set('syncLabel', label);
    store.set('syncDetail', detail);
}

