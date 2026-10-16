/**
 * États du rapport JIRA du train (00.TODO → 05.DEVELOPMENT_DONE) — source unique du rangement des statuts
 * JIRA BRUTS (`jiraStatus`, et les libellés de l'historique) dans ces six colonnes. Flux cumulé du PI
 * (`components/pi_stage_flow.js`), vérifié contre le tableau JIRA du PI 31 (Bellier 8 + 29 = 37 pts).
 *
 * ⚠️ Ce n'est PAS `STATUS_MAP` (config.js) : il range « En cours de qualification » en `done` et « Prêt » en
 * `todo` pour les métriques de cycle, alors que le rapport du train les distingue (04 / 02). Un libellé absent
 * d'ici retombe sur le statut interne (`mapStatus`) — jamais en silence : `stageOfLabel` dit `guessed`.
 * Abandonné (« Clos sans suite », `isAbandoned`) → `null` : hors périmètre, comme dans JIRA.
 */
import { isAbandoned } from './sprint-scope.js';

export const JIRA_STAGES = Object.freeze([
    { key: 'todo',    code: '00', label: '00.TODO',              short: 'À faire',        color: '#94A3B8' },
    { key: 'scoping', code: '01', label: '01.SCOPING',           short: 'Cadrage',        color: '#A78BFA' },
    { key: 'ready',   code: '02', label: '02.READY_TO_DEV',      short: 'Prêt',           color: '#22D3EE' },
    { key: 'dev',     code: '03', label: '03.IN_DEVELOPMENT',    short: 'En dév.',        color: '#3B82F6' },
    { key: 'testing', code: '04', label: '04.IN_TESTING',        short: 'En test',        color: '#F59E0B' },
    { key: 'done',    code: '05', label: '05.DEVELOPMENT_DONE',  short: 'Terminé',        color: '#10B981' },
]);

const _norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Libellés constatés en base (PI 31) + leurs variantes connues. Normalisés : sans accents ni casse.
const _BY_LABEL = (() => {
    const m = new Map();
    const put = (key, list) => list.forEach(l => m.set(_norm(l), key));
    put('todo', ['À Faire', 'A faire', 'To Do', 'Backlog', 'Open', 'Nouveau', 'En attente', 'A estimer',
        'Retour au demandeur', 'Requête/demande envoyée', 'En attente de retour']);
    put('scoping', ['En cours de spécification', "En cours d'analyse", 'Scoping', 'En cadrage']);
    put('ready', ['Prêt', 'Ready', 'Ready to dev', 'Prêt pour dev']);
    put('dev', ['En cours de développement', 'En cours', 'En cours de revue', 'En cours de relecture',
        'In Progress', 'Code review', 'En revue', 'Correction en cours']);
    put('testing', ['En cours de qualification', 'En cours de qualif', 'En cours de test Préprod', 'A livrer en Qual',
        'A livrer en Qualif', 'En cours de test DEV', 'A livrer en DEV', 'A livrer en Préprod',
        'En cours de test Recette', 'En cours de Recette', 'In Testing', 'QA']);
    put('done', ['À livrer pour validation', 'A livrer en Prod', 'En Prod', 'Terminé', 'Done', 'Livré', 'Déployé']);
    return m;
})();

// Repli par statut INTERNE (STATUS_MAP) pour un libellé inconnu.
const _BY_STATUS = { todo: 'todo', inprog: 'dev', review: 'dev', blocked: 'dev', test: 'testing', done: 'done' };

/**
 * @param {string} label  libellé JIRA brut
 * @param {(l: string) => string} [mapStatus]  repli : libellé → statut interne
 * @returns {{ key: string|null, guessed: boolean }}  key null = abandonné
 */
export function stageOfLabel(label, mapStatus) {
    if (isAbandoned({ jiraStatus: label })) return { key: null, guessed: false };
    const k = _BY_LABEL.get(_norm(label));
    if (k) return { key: k, guessed: false };
    return { key: _BY_STATUS[mapStatus?.(label)] || 'todo', guessed: true };
}
