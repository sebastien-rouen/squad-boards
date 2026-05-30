/**
 * Kanban view - flow-based board with WIP metrics.
 */

import { store } from '../state.js';
import { esc, filterByTeam, filterByMine, sumBy, groupBy, sortTickets } from '../utils.js';
import { STATUS_ORDER, STATUS_LABELS, WIP_LIMITS } from '../config.js';
import { renderCard, bindCardClicks } from '../components/card.js';
import { renderBurndown, renderBurnup, renderCFD, renderThroughput, renderCycleTime, renderWIPAge } from '../components/charts.js';
import { renderCalBanner } from '../components/cal_banner.js';
import { renderActivityList, bindActivityClicks } from '../components/activity.js';

let _chartsCollapsed = localStorage.getItem('sb-kanban-charts-collapsed') === 'true';

export function renderKanban(container) {
    const team = store.get('team');
    const allTickets = store.get('tickets') || [];
    let tickets = filterByMine(filterByTeam(allTickets, team));
    const searchQ = (sessionStorage.getItem('kanban-search') || '').trim().toLowerCase();
    if (searchQ) {
        tickets = tickets.filter(t =>
            (t.id || '').toLowerCase().includes(searchQ) ||
            (t.title || '').toLowerCase().includes(searchQ) ||
            (t.leader || t.assignee || '').toLowerCase().includes(searchQ) ||
            (t.labels || []).some(l => (l || '').toLowerCase().includes(searchQ))
        );
    }
    const sprintInfo = store.get('sprintInfo');

    const sprintNames = tickets.map(t => t.sprintName).filter(Boolean);
    const sprintNameCounts = {};
    for (const n of sprintNames) sprintNameCounts[n] = (sprintNameCounts[n] || 0) + 1;
    const teamSprintName = Object.entries(sprintNameCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const effectiveSprintInfo = teamSprintName ? { ...sprintInfo, name: teamSprintName } : sprintInfo;
    // sprintCtx : durée réelle calculée depuis startDate/endDate du sprint
    // pour que les axes x des charts s'étendent exactement sur la durée du sprint.
    const _sStart = effectiveSprintInfo?.startDate ? new Date(effectiveSprintInfo.startDate).getTime() : null;
    const _sEnd   = effectiveSprintInfo?.endDate   ? new Date(effectiveSprintInfo.endDate).getTime()   : null;
    const _realDuration = (_sStart && _sEnd && _sEnd > _sStart)
        ? Math.max(1, Math.round((_sEnd - _sStart) / 86400000) + 1)
        : (sprintInfo?.durationDays || 14);
    const sprintCtx = {
        startDate: effectiveSprintInfo?.startDate || new Date(Date.now() - 8 * 86400000).toISOString(),
        endDate:   effectiveSprintInfo?.endDate || null,
        durationDays: _realDuration,
    };
    const events    = store.get('events') || [];

    const total = tickets.length;
    const wip = tickets.filter(t => ['inprog', 'review', 'test'].includes(t.status)).length;
    const blocked = tickets.filter(t => t.status === 'blocked').length;
    const done = tickets.filter(t => t.status === 'done').length;
    const throughput = done; // simplified

    // Group by status
    const byStatus = {};
    for (const s of STATUS_ORDER) byStatus[s] = [];
    for (const t of tickets) {
        const bucket = byStatus[t.status] || byStatus.todo;
        bucket.push(t);
    }
    for (const s of STATUS_ORDER) byStatus[s] = sortTickets(byStatus[s]);

    // Type breakdown
    const byType = {};
    for (const t of tickets) byType[t.type] = (byType[t.type] || 0) + 1;

    container.innerHTML = `
        <div id="cal-banner-wrap"></div>
        <div class="view-search-bar">
            <input type="search" id="kanban-search" class="input view-search-input" placeholder="🔍 Recherche : clé, titre, leader, label…" value="${esc(sessionStorage.getItem('kanban-search') || '')}" autocomplete="off">
            ${searchQ ? `<button class="btn-icon view-search-clear" id="kanban-search-clear" title="Effacer"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>` : ''}
            ${searchQ ? `<span class="view-search-count">${tickets.length} résultat${tickets.length > 1 ? 's' : ''}</span>` : ''}
        </div>
        <!-- Kanban Metrics -->
        <div class="kanban-metrics">
            <div class="kanban-metric kanban-metric-inprog">
                <span class="metric-label">🔄 WIP</span>
                <span class="metric-value text-status-inprog">${wip}</span>
            </div>
            <div class="kanban-metric${blocked > 0 ? ' kanban-metric-danger' : ' kanban-metric-success'}">
                <span class="metric-label">${blocked > 0 ? '🚫' : '✅'} Bloques</span>
                <span class="metric-value ${blocked > 0 ? 'text-danger' : 'text-success'}">${blocked}</span>
            </div>
            <div class="kanban-metric kanban-metric-done">
                <span class="metric-label">📈 Throughput</span>
                <span class="metric-value text-status-done">${throughput}</span>
            </div>
            <div class="kanban-metric kanban-metric-primary">
                <span class="metric-label">Total</span>
                <span class="metric-value">${total}</span>
            </div>
            <div class="kanban-metric kanban-metric-actions">
                <button class="btn btn-sm btn-secondary" id="kanban-open-review" title="Compte-rendu Sprint Review (Confluence-ready)">📋 Review</button>
                <button class="btn btn-sm btn-primary" id="kanban-open-demo" title="Mode Démo fullscreen (présentation TV)">📺 Demo</button>
            </div>
        </div>

        <!-- Type Breakdown -->
        <div class="flex gap-2 mb-4 flex-wrap">
            ${Object.entries(byType).map(([type, count]) => `
                <span class="badge badge-type badge-${type}">${esc(type)} ${count}</span>
            `).join('')}
        </div>

        <!-- Charts (collapsible) -->
        <details ${_chartsCollapsed ? '' : 'open'} id="kanban-charts-section">
            <summary class="text-xs font-semibold text-muted mb-2">Métriques sprint</summary>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Burndown</span></div><div class="chart-container chart-h-sm"><canvas id="kchart-burndown"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Burnup</span></div><div class="chart-container chart-h-sm"><canvas id="kchart-burnup"></canvas></div></div>
            </div>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">CFD</span></div><div class="chart-container chart-h-sm"><canvas id="kchart-cfd"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Throughput</span></div><div class="chart-container chart-h-sm"><canvas id="kchart-throughput"></canvas></div></div>
            </div>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Cycle Time</span></div><div class="chart-container chart-h-sm"><canvas id="kchart-cycletime"></canvas></div></div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">WIP Age</span>
                        <span class="card-subtitle" title="Age = jours depuis la mise en cours.&#10;🟢 OK · 🟡 attention (≥70% p85) · 🔴 critique (≥p85). Fallback : 🟡≥7j / 🔴≥14j.">ⓘ</span>
                    </div>
                    <div class="chart-container chart-h-sm"><canvas id="khart-wipage"></canvas></div>
                    <div class="wip-age-legend">
                        <span class="wip-age-legend-item"><span class="wip-age-swatch" style="background:#10B981"></span>OK</span>
                        <span class="wip-age-legend-item"><span class="wip-age-swatch" style="background:#F59E0B"></span>Attention</span>
                        <span class="wip-age-legend-item"><span class="wip-age-swatch" style="background:#EF4444"></span>Critique</span>
                    </div>
                </div>
            </div>
        </details>

        <!-- Kanban Board -->
        <div class="board" id="kanban-board">
            ${STATUS_ORDER.map(status => {
                const items = byStatus[status];
                const colPts = sumBy(items, t => t.points);
                const wip = WIP_LIMITS[status];
                const exceeded = wip > 0 && items.length > wip;
                return `
                    <div class="board-column">
                        <div class="column-header col-${status}">
                            <span>${esc(STATUS_LABELS[status])}</span>
                            <span class="column-count${exceeded ? ' wip-exceeded' : ''}">
                                ${items.length}${wip ? '/' + wip : ''}
                            </span>
                        </div>
                        <div class="column-cards">
                            ${items.length ? items.map(t => renderCard(t)).join('') : `
                                <div class="empty-state empty-column">
                                    <p class="text-xs text-muted">Vide</p>
                                </div>
                            `}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        <!-- Recent Activity (composant partagé avec Dashboard/Sprint) -->
        <div class="card mt-4">
            <div class="card-header"><span class="card-title">Activité récente</span></div>
            <div id="kanban-activity-list"></div>
        </div>
    `;

    renderCalBanner(container.querySelector('#cal-banner-wrap'));
    const actEl = container.querySelector('#kanban-activity-list');
    if (actEl) {
        actEl.innerHTML = renderActivityList(tickets, { max: 20, scope: 'kanban' });
        bindActivityClicks(actEl);
    }

    // Boutons Sprint Review / Demo (délégués aux helpers globaux)
    container.querySelector('#kanban-open-review')?.addEventListener('click', () =>
        window.__squadBoard?.openCurrentSprintReview?.());
    container.querySelector('#kanban-open-demo')?.addEventListener('click', () =>
        window.__squadBoard?.openCurrentSprintDemo?.());

    // Recherche temps réel (debounce 200ms + restauration focus)
    const searchInput = container.querySelector('#kanban-search');
    let _searchT = null;
    searchInput?.addEventListener('input', () => {
        clearTimeout(_searchT);
        _searchT = setTimeout(() => {
            const val = searchInput.value;
            const pos = searchInput.selectionStart ?? val.length;
            sessionStorage.setItem('kanban-search', val);
            renderKanban(container);
            const newInp = container.querySelector('#kanban-search');
            if (newInp) { newInp.focus(); newInp.setSelectionRange(pos, pos); }
        }, 200);
    });
    container.querySelector('#kanban-search-clear')?.addEventListener('click', () => {
        sessionStorage.removeItem('kanban-search');
        renderKanban(container);
    });
    bindCardClicks(container);

    container.querySelector('#kanban-charts-section')?.addEventListener('toggle', e => {
        _chartsCollapsed = !e.target.open;
        localStorage.setItem('sb-kanban-charts-collapsed', _chartsCollapsed);
    });

    if (!_chartsCollapsed) {
        requestAnimationFrame(() => {
            renderBurndown('kchart-burndown', tickets, sprintCtx, events);
            renderBurnup('kchart-burnup', tickets, sprintCtx, events);
            renderCFD('kchart-cfd', tickets, sprintCtx, events);
            renderThroughput('kchart-throughput', tickets, sprintCtx, events);
            renderCycleTime('kchart-cycletime', tickets);
            renderWIPAge('khart-wipage', tickets);
        });
    }
}
