/**
 * Ticket card component - renders a ticket as a card in board columns.
 * Shows leader + contributor avatars.
 */

import { esc, initials, hashColor, daysInCurrentColumn, fmtDate } from '../utils.js';
import { TYPE_LABELS } from '../config.js';

const _DWELL_SOURCE_LABEL = {
    status:  'depuis la dernière transition de statut',
    started: 'depuis la mise en cours',
    updated: 'depuis la dernière modification',
};

/**
 * Chip "jours dans la colonne courante" — repère visuel pour le daily.
 * Masqué pour les tickets `done` (peu actionnable) et < 2j (frais).
 */
function _dwellChip(ticket) {
    if (!ticket || ticket.status === 'done') return '';
    const d = daysInCurrentColumn(ticket);
    if (!d || d.days < 2) return '';
    let zone = 'ok';
    if (d.days >= 7) zone = 'crit';
    else if (d.days >= 4) zone = 'warn';
    const srcLbl = _DWELL_SOURCE_LABEL[d.source] || '';
    const title = `${d.days} jour${d.days > 1 ? 's' : ''} dans cette colonne · ${srcLbl} (${fmtDate(d.sinceIso)})`;
    return `<span class="ticket-dwell ticket-dwell--${zone}" title="${esc(title)}" aria-label="${esc(title)}">`
         + `<svg class="icon icon-xs" aria-hidden="true"><use href="#i-clock"/></svg>`
         + `<span>${d.days}j</span>`
         + `</span>`;
}

/**
 * Render a ticket card HTML string.
 */
export function renderCard(ticket) {
    const typeLabel = TYPE_LABELS[ticket.type] || ticket.type;
    const flagClass = ticket.flagged ? ' flagged' : '';
    const leader = ticket.leader || ticket.assignee;
    const contributors = (ticket.contributors || []).filter(c => c && c !== leader);
    const labels = (ticket.labels || []).filter(l => l).slice(0, 3);

    // Avatars: leader + up to 2 contributors
    const avatars = [];
    if (leader) {
        avatars.push({ name: leader, isLeader: true });
    }
    for (const c of contributors.slice(0, 2)) {
        avatars.push({ name: c, isLeader: false });
    }
    const extraCount = contributors.length > 2 ? contributors.length - 2 : 0;

    return `
        <div class="ticket-card${flagClass}" data-ticket-id="${esc(ticket.id)}" title="${esc(ticket.title)}" draggable="true">
            <div class="ticket-card-top">
                <span class="badge badge-type badge-${ticket.type}">${esc(typeLabel)}</span>
                <div class="ticket-card-top-right">
                    ${_dwellChip(ticket)}
                    <span class="ticket-id">${esc(ticket.id)}</span>
                </div>
            </div>
            <div class="ticket-title">${esc(ticket.title)}</div>
            <div class="ticket-card-bottom">
                <div class="ticket-assignee">
                    ${avatars.length ? avatars.map(a => `
                        <span class="assignee-avatar${a.isLeader ? ' leader' : ''}" style="background:${hashColor(a.name)};color:white" title="${esc(a.name)}${a.isLeader ? ' (leader)' : ''}">${esc(initials(a.name))}</span>
                    `).join('') : `
                        <span class="assignee-avatar assignee-avatar-empty">?</span>
                    `}
                    ${extraCount > 0 ? `<span class="assignee-avatar assignee-avatar-extra">+${extraCount}</span>` : ''}
                    <span class="truncate">${esc(leader || 'Non assigne')}</span>
                </div>
                <div class="ticket-meta">
                    ${(ticket.comments?.length) ? `<span class="ticket-comment-count">💬${ticket.comments.length}</span>` : ''}
                    ${ticket.points ? `<span class="badge badge-points">${ticket.points} pts</span>` : ''}
                    ${ticket.flagged ? '<svg class="icon icon-sm text-danger"><use href="#i-alert"/></svg>' : ''}
                </div>
            </div>
            ${labels.length ? `<div class="ticket-labels">${labels.map(l => `<span class="chip">${esc(l)}</span>`).join('')}</div>` : ''}
        </div>
    `;
}

/**
 * Attach click handlers on ticket cards within a container.
 */
export function bindCardClicks(container) {
    container.addEventListener('click', e => {
        const card = e.target.closest('.ticket-card');
        if (!card) return;
        const { openTicketModal } = window.__squadBoard || {};
        if (openTicketModal) openTicketModal(card.dataset.ticketId);
    });
}
