/**
 * 🧭 Fil « Par où commencer ? » de la page Affinage (views/refinement.js) — sommaire discret en tête de page,
 * dans l'ordre d'une séance : compléter (prêt à estimer ?) → estimer → cadrer le prochain PI → partager.
 *
 * Aucun chiffre n'est recalculé ici : la vue passe ceux qu'elle affiche déjà (file, `toFix`, `cadrageModel`,
 * tours du jour). Étape « à traiter » = la première qui a encore du travail ET n'a pas été ouverte aujourd'hui
 * (`visited`, mémorisé par la vue pour la journée) ; à défaut, la première qui a du travail. Une étape à 0
 * est cochée ; une étape ouverte mais pas finie porte « vu ».
 * Clic = `data-rf-step` (câblé par la vue : filtre / dépliage + défilement vers la section).
 */
import { esc } from '../utils.js';

/**
 * @param {object} p
 * @param {number} p.toFix        tickets de la file sans description / critères
 * @param {number} p.toEstimate   taille de la file
 * @param {number} p.inSprint     dont sprint en cours
 * @param {object} p.cadrage      `cadrageModel(...)`
 * @param {number} p.rounds       tours enregistrés aujourd'hui
 * @param {Set}    [p.visited]    étapes déjà ouvertes aujourd'hui
 * @param {string} [p.startId]    1ᵉʳ ticket de la file : bouton « ▶ Poker » au bout du fil (collant, toujours sous la main)
 */
export function refinementStepsHtml({ toFix, toEstimate, inSprint, cadrage, rounds, visited = new Set(), startId = '' }) {
    const cadTodo = cadrage.total - cadrage.done;
    const steps = [
        { key: 'fix', icon: '📝', label: 'Compléter', count: toFix,
          text: toFix ? `${toFix} ticket${toFix > 1 ? 's' : ''} à compléter` : 'File prête à estimer',
          tip: 'Tickets de la file au badge ✨ incomplet : description, critères d\'acceptation (story), feature parente ou porteur — à compléter avant de les estimer' },
        { key: 'estimate', icon: '🃏', label: 'Estimer', count: toEstimate,
          text: toEstimate ? `${toEstimate} à estimer${inSprint ? `, dont ${inSprint} du sprint` : ''}` : 'Tout est estimé',
          tip: 'File d\'attente du Poker, dans l\'ordre : sprint en cours, autres sprints, backlog' },
        { key: 'cadrage', icon: '🧭', label: `Cadrer le PI ${cadrage.targetPi}`, count: cadTodo,
          text: cadTodo ? `${cadTodo} à préparer${cadrage.unestimated ? ` · ${cadrage.unestimated} sans macro-estimation` : ''}` : (cadrage.total ? 'Cadrage prêt' : 'Aucun ticket de cadrage'),
          tip: `Tickets Cadrage_PI${cadrage.targetPi} du périmètre de l'équipe (+ cadrages du PI ${cadrage.piNum} encore ouverts)` },
    ];
    const current = (steps.find(s => s.count > 0 && !visited.has(s.key)) || steps.find(s => s.count > 0))?.key || '';
    const items = steps.map((s, i) => {
        const state = s.count === 0 ? 'done' : s.key === current ? 'current' : 'todo';
        const seen = state !== 'done' && visited.has(s.key);
        return `<li class="rf-step is-${state}${seen ? ' is-visited' : ''}">
            <button type="button" class="rf-step-btn" data-rf-step="${s.key}" title="${esc(s.tip)}"${state === 'current' ? ' aria-current="step"' : ''}>
                <span class="rf-step-dot" aria-hidden="true">${state === 'done' ? '✓' : i + 1}</span>
                <span class="rf-step-body">
                    <span class="rf-step-label">${s.icon} ${esc(s.label)}${state === 'current' ? '<em class="rf-step-now">à traiter</em>' : seen ? '<em class="rf-step-seen" title="Déjà ouverte aujourd\'hui">vu</em>' : ''}</span>
                    <span class="rf-step-text">${esc(s.text)}</span>
                </span>
            </button>
        </li>`;
    }).join('');
    // Dernière étape : partager le récap — disponible dès qu'un Poker est enregistré, jamais « cochée ».
    const share = `<li class="rf-step is-${rounds ? 'todo' : 'later'}">
        <button type="button" class="rf-step-btn" data-rf-step="recap"${rounds ? '' : ' disabled'}
            title="${rounds ? 'Récapitulatif de la séance à partager (Slack, Teams / mail, CSV)' : 'Disponible dès qu\'une estimation est enregistrée'}">
            <span class="rf-step-dot" aria-hidden="true">4</span>
            <span class="rf-step-body">
                <span class="rf-step-label">📤 Partager</span>
                <span class="rf-step-text">${rounds ? `${rounds} estimé${rounds > 1 ? 's' : ''} aujourd'hui` : 'Après le Poker'}</span>
            </span>
        </button>
    </li>`;
    // Pied du fil : part des étapes faites (le partage, jamais « cochée », n'y entre pas)
    const pDone = Math.round(steps.filter(s => s.count === 0).length / steps.length * 100);
    return `<nav class="rf-steps" aria-label="Par où commencer ?" style="--rf-steps-p:${pDone}%">
        <span class="rf-steps-title">Par où commencer ?</span>
        <ol class="rf-steps-list">${items}${share}</ol>
        ${startId ? `<button type="button" class="btn btn-primary btn-sm rf-steps-start" data-rf-poker="${esc(startId)}" title="Démarrer le Poker sur ${esc(startId)}">▶ Poker</button>` : ''}
    </nav>`;
}
