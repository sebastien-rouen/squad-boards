/**
 * Ticket card component - renders a ticket as a card in board columns.
 * Shows leader + contributor avatars.
 */

import { esc, initials, hashColor, daysInCurrentColumn, fmtDate, typeBadge, currentStageGroupKey } from '../utils.js';

const _DWELL_SOURCE_LABEL = {
    status:  'depuis la dernière transition de statut',
    started: 'depuis la mise en cours',
    updated: 'depuis la dernière modification',
};

/**
 * Chip "jours dans la colonne courante" — repère visuel pour le daily.
 * Masqué pour les tickets `done` (peu actionnable) et < 2j (frais).
 *
 * Coloration : si des repères d'ancienneté par colonne sont fournis (`ageRefs`, issus du P50/P85
 * des tickets déjà terminés dans la même colonne — cf computeStageAgeRefs), le seuil devient
 * data-driven : ambre entre P50 et P85, rouge au-delà du P85 (le ticket sort de la zone habituelle
 * de SA colonne). Sans repère fiable, on retombe sur des seuils fixes (4 j / 7 j).
 */
function _dwellChip(ticket, ageRefs) {
    if (!ticket || ticket.status === 'done') return '';
    const d = daysInCurrentColumn(ticket);
    if (!d || d.days < 2) return '';
    let zone = 'ok';
    let refTip = '';
    const gk = currentStageGroupKey(ticket);
    const ref = ageRefs && gk ? ageRefs[gk] : null;
    if (ref && ref.p85 > 0 && ref.n >= 5) {
        // Repère fiable (au moins 5 tickets terminés dans cette colonne) → coloration par percentile.
        if (d.days >= ref.p85) zone = 'crit';
        else if (ref.p50 > 0 && d.days >= ref.p50) zone = 'warn';
        refTip = ` · repère colonne P50 ${ref.p50} j / P85 ${ref.p85} j`;
    } else {
        if (d.days >= 7) zone = 'crit';
        else if (d.days >= 4) zone = 'warn';
    }
    const srcLbl = _DWELL_SOURCE_LABEL[d.source] || '';
    const zoneLbl = zone === 'crit' ? ' — au-delà de l\'habituel, à débloquer' : zone === 'warn' ? ' — à surveiller' : '';
    const title = `${d.days} jour${d.days > 1 ? 's' : ''} dans cette colonne · ${srcLbl} (${fmtDate(d.sinceIso)})${refTip}${zoneLbl}`;
    return `<span class="ticket-dwell ticket-dwell--${zone}" title="${esc(title)}" aria-label="${esc(title)}">`
         + `<svg class="icon icon-xs" aria-hidden="true"><use href="#i-clock"/></svg>`
         + `<span>${d.days}j</span>`
         + `</span>`;
}

/**
 * Badge discret "pas de mise à jour depuis hier" — repère pour le daily : un ticket actif
 * dont personne n'a touché le statut/contenu depuis 24h mérite d'être pointé en priorité.
 */
function _staleBadge(ticket) {
    if (!ticket || !['inprog', 'review', 'test'].includes(ticket.status)) return '';
    if (!ticket.updatedAt) return '';
    const hours = (Date.now() - new Date(ticket.updatedAt).getTime()) / 3600000;
    if (hours < 24) return '';
    const days = Math.floor(hours / 24);
    const since = days >= 1 ? `${days} jour${days > 1 ? 's' : ''}` : '24h';
    const title = `Pas de mise à jour depuis ${since} · dernière maj ${fmtDate(ticket.updatedAt)}`;
    return `<span class="ticket-stale" title="${esc(title)}" aria-label="${esc(title)}">⏰</span>`;
}

/**
 * Render a ticket card HTML string.
 */
export function renderCard(ticket, { ageRefs } = {}) {
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
        <div class="ticket-card${flagClass}" data-ticket-id="${esc(ticket.id)}" title="${esc(ticket.title)}" draggable="true"
             tabindex="0" role="button" aria-label="${esc(ticket.id)} · ${esc(ticket.title)} — Entrée : ouvrir · Alt+←/→ : changer de colonne">
            <div class="ticket-card-top">
                ${typeBadge(ticket.type, { title: false })}
                <div class="ticket-card-top-right">
                    ${_dwellChip(ticket, ageRefs)}
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
                    ${_staleBadge(ticket)}
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
    // Équivalent clavier du clic — les cartes sont focusables (tabindex=0, role=button).
    container.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+flèches = déplacement (géré par la vue)
        const card = e.target.closest('.ticket-card');
        if (!card || e.target !== card) return;
        e.preventDefault();
        const { openTicketModal } = window.__squadBoard || {};
        if (openTicketModal) openTicketModal(card.dataset.ticketId);
    });
}
