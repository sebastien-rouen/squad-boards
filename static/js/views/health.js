/**
 * Health Check — vue de pilotage agrégée.
 *
 * Une page = un état des lieux complet de la santé des données et du sprint
 * pour toutes les équipes. Permet au RTE / Scrum Master de faire son tour
 * matinal en 30 secondes au lieu de naviguer dans 5 vues.
 *
 * Coquille de la vue : calcule le modèle UNE fois (`healthModel()`, health-model.js), pose l'état
 * partagé avec la modale de sprint (health-shared.js), assemble les blocs (health-sections.js,
 * health-capacity-card.js) et câble les interactions. Modale : health-sprint-modal.js.
 */

import { store } from '../state.js';
import { openAlertModal } from '../components/alert_modal.js';
import { mountVelocityChart } from '../components/velocity_card.js';
import { setVotes } from './health-votes.js';
import { computeCoverage, coverageBannerHtml, wireCoverageBanner } from './health-coverage.js';
import { meteoMatrixHtml, meteoPillsHtml, meteoContext, bindMeteoMatrix } from '../components/meteo_matrix.js';
import { _healthCtx, _sprintMetaStore } from './health-shared.js';
import { _openSprintModal } from './health-sprint-modal.js';
import { healthModel } from './health-model.js';
import { heroHtml, veloHostHtml, anomalyCardsHtml, matrixHtml } from './health-sections.js';

// API publique inchangée (app.js, tests) : ré-export
export { reopenSprintModalFromHash } from './health-sprint-modal.js';

export function renderHealth(container) {
    const m = healthModel();
    const { teamsScope, piOffset, currentPiNum, teamObjects, groups, _activeGroup, allTickets, sprintInfo } = m;

    // État partagé avec la modale de sprint, relu sans closure (clic, réouverture par le hash)
    _healthCtx.lastKnownAbsence = m._lastAbsence;
    _sprintMetaStore.clear();
    for (const [tm, meta] of Object.entries(m.sprintMetaByTeam)) _sprintMetaStore.set(tm, meta);
    // Les deux votes d'équipe rendus dans le tableau « Sprints du PI » (🎭 Mood et
    // ✊ Confiance) sont recopiés dans health-votes.js : les cellules re-rendues à
    // chaud après un vote y lisent leur instantané, sans repasser par le store.
    setVotes('mood', store.get('moodVotes') || []);
    setVotes('fist', store.get('fistVotes') || []);

    // Profondeur d'historique réellement disponible — lecture seule, aucun chiffre de la
    // page n'en dépend : le bandeau dit ce que ces chiffres valent, il ne les change pas.
    const _coverage = computeCoverage({ teamsScope, tickets: allTickets, sprintInfo });

    container.innerHTML = `
        <div class="health-view">
            ${heroHtml(m)}

            <!-- Météo par équipe : la même matrice que le Dashboard — c'est cette vue qui la nourrit
                 (score de santé, anomalies). PI courant seulement. -->
            ${piOffset === 0 && teamsScope.length > 1
                ? meteoMatrixHtml(teamsScope, meteoContext(currentPiNum), teamObjects, { groups: _activeGroup ? [] : groups, title: 'Météo par équipe' })
                : piOffset === 0 && teamsScope.length === 1 ? meteoPillsHtml(teamsScope[0], meteoContext(currentPiNum), teamObjects) : ''}

            ${coverageBannerHtml(_coverage)}

            ${veloHostHtml(m)}

            <div class="health-cards">${anomalyCardsHtml(m)}</div>

            ${matrixHtml(m)}
        </div>
    `;

    _bindHealth(container, m);
}

/** Graphes de vélocité (après insertion dans le DOM) et interactions de la page. */
function _bindHealth(container, m) {
    const { _activeGroup, _groupVeloData, velocityHistory, currentSprintEntry, piInfo, _veloMax, _veloCanvasId } = m;
    wireCoverageBanner(container);
    bindMeteoMatrix(container);
    container.querySelector('.capacity-mini-sprints')?.addEventListener('toggle', e => {
        try { localStorage.setItem('sb-health-cap-sprints', e.currentTarget.open ? '1' : '0'); } catch { /* stockage indisponible */ }
    });

    // Graphe(s) de vélocité (Chart.js) — monté(s) après insertion du DOM.
    // Mode ligne produit : un graphe par équipe du groupe (canvasId dédié par équipe).
    requestAnimationFrame(() => {
        if (_activeGroup) {
            for (const { team, vh, cur } of _groupVeloData) {
                mountVelocityChart({ velocityHistory: vh, currentSprintEntry: cur, target: piInfo?.velocityTarget || null, maxPoints: _veloMax, canvasId: _veloCanvasId(team) });
            }
        } else {
            mountVelocityChart({ velocityHistory, currentSprintEntry, target: piInfo?.velocityTarget || null, maxPoints: _veloMax });
        }
    });

    // Un seul listener à la fois : on remplace l'ancien pour éviter les stale closures
    if (container._healthClick) container.removeEventListener('click', container._healthClick);
    container._healthClick = e => {
        // Sélecteur ligne produit (groupe) du graphe de vélocité — affiche une carte par équipe
        // du groupe. Re-cliquer sur le groupe déjà actif le désélectionne (retour à l'équipe seule).
        const veloGroupChip = e.target.closest('.health-velo-group-chip');
        if (veloGroupChip?.dataset.veloGroup) {
            const isActive = veloGroupChip.classList.contains('is-active');
            if (isActive) localStorage.removeItem('sb-health-velo-group');
            else localStorage.setItem('sb-health-velo-group', veloGroupChip.dataset.veloGroup);
            renderHealth(container);
            return;
        }

        // Sélecteur d'équipe du graphe de vélocité (périmètre multi-équipes)
        const veloChip = e.target.closest('.health-velo-team-chip');
        if (veloChip?.dataset.veloTeam) {
            localStorage.setItem('sb-health-velo-team', veloChip.dataset.veloTeam);
            localStorage.removeItem('sb-health-velo-group');
            renderHealth(container);
            return;
        }

        const card = e.target.closest('.health-card');
        if (card?.dataset.anomaly) { openAlertModal(card.dataset.anomaly); return; }

        // Clic colonne Vélocité / Buffer / Confiance → modal sprint détaillé.
        // La colonne ✊ y mène aussi : c'est la seule surface où l'on peut voter.
        const metricCell = e.target.closest('.health-metric-cell.has-val, .health-fist-cell.has-val');
        if (metricCell?.dataset.metaId) {
            const tm     = metricCell.dataset.metaId;
            const metric = metricCell.dataset.metric;
            const meta   = _sprintMetaStore.get(tm);   // Map module-level, toujours à jour
            _openSprintModal(meta, tm, metric);
            return;
        }

        const cell = e.target.closest('.health-cell.has-val');
        if (cell?.dataset.anomaly) {
            const tm = cell.dataset.team;
            if (tm) { store.set('group', null); store.set('team', tm); }
            setTimeout(() => openAlertModal(cell.dataset.anomaly), 60);
        }
    };
    container.addEventListener('click', container._healthClick);
}
