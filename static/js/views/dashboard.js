/**
 * Dashboard — coquille de la vue : calcule le modèle UNE fois (`dashboardModel()`, dashboard-model.js),
 * assemble les blocs, puis câble graphiques et interactions.
 *
 * Blocs : dashboard-sections.js (support du jour, frise du sprint, indicateurs, deux flux),
 * dashboard-goals.js (« Cap de l'équipe » + édition des objectifs), dashboard-pi-strip.js (sprints du PI).
 * Contrat : `xxxHtml(m)` rend, `bindXxx(container, m)` câble, `m.rerender()` re-rend la vue.
 */

import { store } from '../state.js';
import { renderCycleTime } from '../components/charts.js';
import { bindActivityClicks } from '../components/activity.js';
import { mountNavRail } from '../components/nav-rail.js';
import { mountVelocityChart } from '../components/velocity_card.js';
import { bindStageFlowCard } from '../components/stage_flow_card.js';
import { bindAgingWipCard } from '../components/aging_wip_card.js';
import { bindSlaReviewCard } from '../components/sla_review_card.js';
import { meteoMatrixHtml, meteoPillsHtml, meteoContext, bindMeteoMatrix } from '../components/meteo_matrix.js';
import { meteoPlanHtml, bindMeteoPlan } from '../components/meteo_plan.js';
import { meteoFicheHtml, bindMeteoFiche } from '../components/meteo_fiche.js';
import { mountPageToc } from '../components/page_toc.js';
import { bindCollapsibles } from '../components/collapsible.js';
import { endOfPiHtml, recentlyClosedHtml } from '../components/meteo_endpi.js';
import { firstLaunchHtml, bindFirstLaunch } from '../components/first_launch.js';
import { bindPiProgress } from '../components/pi_progress.js';
import { bindPiFlowRows } from '../components/pi_stage_flow.js';
import { dashboardModel } from './dashboard-model.js';
import { goalsBandHtml, bindObjectivesEdit } from './dashboard-goals.js';
import { onCallTodayHtml, sprintTimelineHtml, otherPiHeaderHtml, metricsHtml, flowStreamHtml, teamStreamHtml } from './dashboard-sections.js';
import { projectStorage } from '../project-settings.js';

/** Sections du sommaire du Dashboard, dans l'ordre de la page (sélecteurs = blocs racines de la vue). */
const _DASH_TOC = [
    { sel: '.meteo-card, .meteo-pills', icon: '🌤️', label: 'Météo' },
    { sel: '.meteo-plan', icon: '☀️', label: 'Plan d\'action' },
    { sel: '.meteo-endpi', icon: '🏁', label: 'Fin de PI' },
    { sel: '.goals-band', icon: '🎯', label: 'Cap' },
    { sel: '.meteo-fiche', icon: '😊', label: 'Mood & effectif' },
    { sel: '.sprint-header--timeline', icon: '🏃', label: 'Sprint' },
    { sel: '.dashboard-metrics', icon: '📊', label: 'Indicateurs' },
    { sel: '.dash-streams > .dash-stream:nth-child(1)', icon: '🚀', label: 'Pilotage & flux' },
    { sel: '.dash-streams > .dash-stream:nth-child(2)', icon: '👥', label: 'Équipe & risques' },
];

/** Sections repliables du Dashboard (en-tête qui reçoit le bouton ▾, corps masqué). */
const _DASH_COLLAPSIBLE = [
    { key: 'pi-sprints', sel: '.pi-sprints-strip', head: '.pi-sprints-strip-head', body: '.pi-sprints-strip-cards', label: 'Sprints du PI' },
    { key: 'stream-flow', sel: '.dash-streams > .dash-stream:nth-child(1)', head: '.dash-stream-hd', body: '.dash-stream-cards', label: 'Pilotage & flux' },
    { key: 'stream-team', sel: '.dash-streams > .dash-stream:nth-child(2)', head: '.dash-stream-hd', body: '.dash-stream-cards', label: 'Équipe & risques' },
];

export function renderDashboard(container) {
    const m = dashboardModel();
    m.rerender = () => renderDashboard(container);
    const { allTeams, isCurrentPi, teams, sprintInfoAll, allTickets, displayPiNum, teamObjects, groupId, groups, piInfo, sprintInfo, piOffset } = m;
    const _goalsBandHtml = goalsBandHtml(m);

    container.innerHTML = `
        <!-- Premier lancement : aucune équipe → trois façons de commencer, jamais un écran vide -->
        ${allTeams.length === 0 ? firstLaunchHtml() : ''}

        <!-- Sprint clos il y a moins de 3 jours → le rapport est prêt -->
        ${isCurrentPi ? recentlyClosedHtml({ teams, sprintInfoAll, tickets: allTickets }) : ''}

        <!-- Widget : qui est en support aujourd'hui -->
        ${onCallTodayHtml()}

        <!-- Météo des équipes (PI courant) : matrice équipes × domaines quand plusieurs équipes sont
             affichées, rangée de pastilles quand une seule — composant meteo_matrix.js -->
        <!-- Fiche d'UNE équipe : « Cap de l'équipe » passe AU-DESSUS de « 😊 Mood & confiance » (3.235.0) — le cap
             se lit avant l'humeur. Plusieurs équipes (matrice, sans fiche) : le cap garde sa place, plus bas. -->
        ${isCurrentPi && teams.length > 1 ? meteoMatrixHtml(teams, meteoContext(displayPiNum), teamObjects, { groups: groupId ? [] : groups })
            : isCurrentPi && teams.length === 1 ? meteoPillsHtml(teams[0], meteoContext(displayPiNum), teamObjects) + meteoPlanHtml(teams[0], meteoContext(displayPiNum)) + _goalsBandHtml + meteoFicheHtml(teams[0], meteoContext(displayPiNum)) : ''}

        <!-- Fin de PI : bandeau + checklist du PI Planning, seulement sur le dernier sprint du PI -->
        ${isCurrentPi ? endOfPiHtml({ teams, sprintInfoAll, piNum: displayPiNum, piInfo, absences: store.get('absences') || [], support: store.get('support') || [] }) : ''}

        <!-- Bande "Cap de l'équipe" : Objectif de sprint ⟷ Objectifs du PI (au-dessus du bandeau) — sauf si déjà
             posée au-dessus de la fiche équipe -->
        ${isCurrentPi && teams.length === 1 ? '' : _goalsBandHtml}

        ${sprintInfo && piOffset === 0 ? sprintTimelineHtml(m) : ''}

        ${piOffset !== 0 && displayPiNum ? otherPiHeaderHtml(m) : ''}

        ${metricsHtml(m)}

        <!-- ═══ Deux flux thématiques (refonte F) : Pilotage & flux · Équipe & risques ═══ -->
        <div class="dash-streams">
        ${flowStreamHtml(m)}
        ${teamStreamHtml(m)}
        </div>
    `;

    _bindDashboard(container, m);
}

/** Graphiques (après insertion dans le DOM) et interactions de la page. */
function _bindDashboard(container, m) {
    const { _flowTickets, velocityHistory, currentSprintEntry, piInfo, _veloMax, _flowScopeTickets, _flowCardOpts, _pipModel, _pipOpts, _psrModel, _psrCopy, tickets, displayPiNum, STALE_DAYS } = m;
    // Render charts after DOM is ready
    requestAnimationFrame(() => {
        renderCycleTime('chart-cycletime', _flowTickets);
        mountVelocityChart({ velocityHistory, currentSprintEntry, target: piInfo?.velocityTarget || null, maxPoints: _veloMax });
        bindActivityClicks(container);
        // Rail sur les chips d'astreinte : leur nombre suit le périmètre (une équipe ou
        // toutes), et la bande est en tête de dashboard — chaque ligne repousse les KPI.
        const oncall = container.querySelector('.db-oncall-chips');
        if (oncall) mountNavRail(oncall, { labelPrev: 'Personnes précédentes', labelNext: 'Personnes suivantes' });
        bindStageFlowCard(container, _flowScopeTickets, _flowCardOpts);
        bindPiProgress(container, _pipModel, _pipOpts);
        bindPiFlowRows(container, _psrModel, _psrCopy);
        bindAgingWipCard(container);
        bindSlaReviewCard(container, tickets);
        bindMeteoMatrix(container);
        bindMeteoPlan(container);
        bindMeteoFiche(container, () => meteoContext(displayPiNum));
        bindFirstLaunch(container);
        // Sommaire collant (3.236.0) : seules les sections présentes sont proposées (cf. page_toc.js).
        mountPageToc(container, _DASH_TOC);
        // Sections repliables (3.237.0), état retenu à part pour « toutes les équipes » et pour une équipe.
        const _team = store.get('team');
        bindCollapsibles(container, { storageKey: 'sb-dash-collapsed', scope: _team && _team !== 'all' && !store.get('group') ? 'team' : 'all', items: _DASH_COLLAPSIBLE });
    });

    // Liste "bloqués / stagnants" → ouvre le ticket au clic
    container.querySelectorAll('.stuck-row').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticket));
    });

    // Détail des tickets par sprint (strip PI) → ouvre le ticket au clic
    container.querySelectorAll('.pi-sprint-card-ticket').forEach(row => {
        row.addEventListener('click', e => {
            e.stopPropagation();
            window.__squadBoard?.openTicketModal?.(row.dataset.ticket);
        });
    });

    // Champ discret : seuil de stagnation (jours) → persiste et re-render
    const staleInput = container.querySelector('#stuck-stale-days');
    staleInput?.addEventListener('change', () => {
        const n = parseInt(staleInput.value, 10);
        if (isNaN(n) || n < 1 || n > 365) { staleInput.value = STALE_DAYS; return; }
        if (n === STALE_DAYS) return;
        projectStorage.setItem('sb-dash-stale-days', String(n));
        m.rerender();
    });

    // Sélecteur d'équipe du graphe de vélocité (périmètre multi-équipes) → re-render
    if (container._dashVeloClick) container.removeEventListener('click', container._dashVeloClick);
    container._dashVeloClick = e => {
        const chip = e.target.closest('.health-velo-team-chip');
        if (chip?.dataset.veloTeam) {
            localStorage.setItem('sb-dash-velo-team', chip.dataset.veloTeam);
            m.rerender();
        }
    };
    container.addEventListener('click', container._dashVeloClick);

    bindObjectivesEdit(container, m);
}
