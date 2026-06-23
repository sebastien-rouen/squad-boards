/**
 * Board charts — section graphiques partagée entre les modes Scrum et Kanban du Board.
 * Les deux modes ne sont jamais montés simultanément (toggle topbar), donc les IDs de
 * canvas sont canoniques (préfixe `board-chart-`) sans risque de collision.
 *
 * Avant : ce bloc (Burndown / Burnup / CFD / Throughput / Cycle Time / WIP Age) était
 * dupliqué à l'identique dans sprint.js et kanban.js.
 */

import { renderBurndown, renderBurnup, renderCFD, renderThroughput, renderCycleTime, renderWIPAge } from './charts.js';

// IDs canoniques des canvas (préfixe `board-` → pas de collision avec le Dashboard).
const IDS = {
    burndown:   'board-chart-burndown',
    burnup:     'board-chart-burnup',
    cfd:        'board-chart-cfd',
    throughput: 'board-chart-throughput',
    cycletime:  'board-chart-cycletime',
    wipage:     'board-chart-wipage',
};

const _WIPAGE_TIP = 'Age = jours depuis la mise en cours (ou la création si pas encore mis en cours).&#10;Seuils colorés : 🟢 OK · 🟡 attention (≥70% du p85 cycle time des tickets done) · 🔴 critique (≥p85).&#10;Si pas assez de tickets done : seuils fixes 🟡≥7j / 🔴≥14j.';

/**
 * HTML de la section graphiques (repliable). À insérer dans le template d'une vue Board.
 * @param {object} opts { collapsed: bool, sectionId: string }
 */
export function renderBoardChartsSection({ collapsed = false, sectionId = 'charts-section' } = {}) {
    return `
        <details ${collapsed ? '' : 'open'} id="${sectionId}">
            <summary class="text-xs font-semibold text-muted mb-2">Metriques sprint</summary>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Burndown</span></div><div class="chart-container chart-h-sm"><canvas id="${IDS.burndown}"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Burnup</span></div><div class="chart-container chart-h-sm"><canvas id="${IDS.burnup}"></canvas></div></div>
            </div>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">CFD</span></div><div class="chart-container chart-h-sm"><canvas id="${IDS.cfd}"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Throughput</span></div><div class="chart-container chart-h-sm"><canvas id="${IDS.throughput}"></canvas></div></div>
            </div>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Cycle Time</span></div><div class="chart-container chart-h-sm"><canvas id="${IDS.cycletime}"></canvas></div></div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">WIP Age</span>
                        <span class="card-subtitle" title="${_WIPAGE_TIP}">ⓘ comment ça marche</span>
                    </div>
                    <div class="chart-container chart-h-sm"><canvas id="${IDS.wipage}"></canvas></div>
                    <div class="wip-age-legend">
                        <span class="wip-age-legend-item"><span class="wip-age-swatch wip-age-swatch--ok"></span>OK · &lt; 70% p85</span>
                        <span class="wip-age-legend-item"><span class="wip-age-swatch wip-age-swatch--warn"></span>Attention · ≥ 70% p85</span>
                        <span class="wip-age-legend-item"><span class="wip-age-swatch wip-age-swatch--crit"></span>Critique · ≥ p85 (à débloquer)</span>
                    </div>
                </div>
            </div>
        </details>`;
}

/**
 * Monte les 6 graphiques du Board (au prochain frame). À appeler après l'insertion du HTML
 * de `renderBoardChartsSection`, uniquement si la section n'est pas repliée.
 */
export function mountBoardCharts(tickets, sprintCtx, events) {
    requestAnimationFrame(() => {
        renderBurndown(IDS.burndown, tickets, sprintCtx, events);
        renderBurnup(IDS.burnup, tickets, sprintCtx, events);
        renderCFD(IDS.cfd, tickets, sprintCtx, events);
        renderThroughput(IDS.throughput, tickets, sprintCtx, events);
        renderCycleTime(IDS.cycletime, tickets);
        renderWIPAge(IDS.wipage, tickets);
    });
}
