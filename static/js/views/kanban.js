/**
 * Kanban view - flow-based board with WIP metrics.
 */

import { store } from '../state.js';
import { esc, filterByTeam, filterByMine, sumBy, groupBy, sortTickets, countWip, countBlocked, throughputSince, typeBadge } from '../utils.js';
import { STATUS_ORDER, STATUS_LABELS, TYPE_LABELS, WIP_LIMITS } from '../config.js';
import { renderCard, bindCardClicks } from '../components/card.js';
import { renderBoardChartsSection, mountBoardCharts } from '../components/board_charts.js';
import { renderActivityCard, bindActivityClicks } from '../components/activity.js';

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
    const wip = countWip(tickets);
    const blocked = countBlocked(tickets);
    // Débit canonique (7 derniers jours) — aligné sur le Dashboard. Avant : total des "done"
    // labellisé "Throughput" (commentaire `// simplified`), ce qui était trompeur.
    const throughput = throughputSince(tickets, 7);

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
                <span class="metric-label">📈 Throughput <small>7j</small></span>
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
            ${Object.entries(byType).map(([type, count]) =>
                typeBadge(type, { label: `${TYPE_LABELS[type] || type} ${count}`, title: false })
            ).join('')}
        </div>

        <!-- Charts (collapsible) — composant partagé Scrum/Kanban -->
        ${renderBoardChartsSection({ collapsed: _chartsCollapsed, sectionId: 'kanban-charts-section' })}

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
        ${renderActivityCard(tickets, { max: 20, scope: 'kanban' })}
    `;

    bindActivityClicks(container);

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

    if (!_chartsCollapsed) mountBoardCharts(tickets, sprintCtx, events);
}
