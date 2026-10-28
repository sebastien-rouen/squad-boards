/**
 * Réglages de PROJET partagés (3.266.0) — en base (`/api/project-settings`), plus dans le navigateur.
 *
 * Avant : mapping des champs JIRA, profondeur de synchro, seuils météo, SLA, charges prévues… vivaient
 * en localStorage, donc un comportement par poste. `projectStorage` garde l'INTERFACE de localStorage
 * (getItem / setItem / removeItem, valeurs texte) : chaque appel concerné troque `localStorage` contre
 * `projectStorage` sans changer sa logique.
 *
 * Lecture : store `projectSettings` (chargé au démarrage avec /api/all) ; tant qu'il n'est pas chargé
 * (API injoignable), repli sur le localStorage du poste. Écriture : store tout de suite, puis un PUT
 * groupé (300 ms) — une saisie au clavier ne fait qu'un appel.
 *
 * Ce qui est « projet » se décide ICI (PROJECT_KEYS / PROJECT_PREFIXES). Le reste — thème, dépliages,
 * filtres, onglet ouvert, jeton JIRA — reste une préférence du poste, en localStorage.
 */
import { store } from './state.js';
import * as api from './api.js';
import { toast } from './utils/dom.js';
import { meteoStorage } from './utils/meteo.js';

export const PROJECT_KEYS = Object.freeze([
    // Synchro JIRA : champs, profondeurs, mémoire des sprints vides, résultat partagé de la dernière synchro
    'sb-sync-sprintField', 'sb-sync-teamField', 'sb-sync-piSprintField', 'sb-sync-contributorsField',
    'sb-sync-quickDays', 'sb-sync-closedKeep', 'sb-sync-closedTicketSprints', 'sb-sync-archiveClosed',
    'sb-sync-maxBoards', 'sb-sync-maxFeatures', 'sb-sync-emptyClosed',
    'sb-jiraProjectTeams', 'sb-jira-excluded-teams', 'sb-boardColumns',
    // Règles métier
    'sb-meteo-thresholds', 'sb-meteo-scope', 'sb-sla-target-days', 'sb-backlog-stale-months',
    'sb-dash-stale-days', 'sb-reminders', 'sb-cadrage-perimeters',
]);
// Clés à suffixe : charge prévue par sprint, objectifs d'équipe de l'Atlas (par équipe et PI)
export const PROJECT_PREFIXES = Object.freeze(['sb-charge-', 'sb-team-objectives-']);
export const isProjectKey = k => PROJECT_KEYS.includes(k) || PROJECT_PREFIXES.some(p => k.startsWith(p));

const _ls = () => { try { return localStorage; } catch { return null; } };
let _pending = {};
let _timer = null;

async function _flush() {
    const values = _pending;
    _pending = {};
    _timer = null;
    try { await api.putProjectSettings(values); }
    catch { toast('Réglage non enregistré sur le serveur', 'error'); }
}

function _write(key, value) {
    const cur = store.get('projectSettings');
    if (!cur) {   // réglages non chargés (API injoignable) : on reste sur le poste
        if (value == null) _ls()?.removeItem(key); else _ls()?.setItem(key, value);
        return;
    }
    const next = { ...cur };
    if (value == null) delete next[key]; else next[key] = value;
    store.set('projectSettings', next);
    _pending[key] = value;
    clearTimeout(_timer);
    _timer = setTimeout(_flush, 300);
}

/** Même contrat que localStorage (valeurs texte, `null` si absent). */
export const projectStorage = Object.freeze({
    getItem(key) {
        const cur = store.get('projectSettings');
        if (!cur) return _ls()?.getItem(key) ?? null;
        return Object.prototype.hasOwnProperty.call(cur, key) ? cur[key] : null;
    },
    setItem(key, value) { _write(key, String(value)); },
    removeItem(key) { _write(key, null); },
});

meteoStorage.current = projectStorage;   // seuils météo : utils/meteo.js est pur, on lui branche la source

/**
 * Migration unique : les réglages de projet saisis sur CE poste avant 3.266.0 montent en base s'ils
 * n'y sont pas encore (le premier poste qui se connecte fait foi), puis la copie locale est retirée.
 */
export async function migrateLocalProjectSettings() {
    const cur = store.get('projectSettings');
    const ls = _ls();
    if (!cur || !ls) return;
    const keys = Object.keys(ls).filter(isProjectKey);
    if (!keys.length) return;
    const values = {};
    for (const k of keys) if (!(k in cur) && ls.getItem(k)) values[k] = ls.getItem(k);
    try {
        if (Object.keys(values).length) {
            await api.putProjectSettings(values);
            store.set('projectSettings', { ...store.get('projectSettings'), ...values });
        }
        keys.forEach(k => ls.removeItem(k));
    } catch { /* serveur injoignable : on réessaiera au prochain chargement */ }
}
