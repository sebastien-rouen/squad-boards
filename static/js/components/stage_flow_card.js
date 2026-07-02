/**
 * Card "Temps par colonne" (flux inter-étapes) — réutilisable Dashboard + PI Planning.
 *
 * Affiche la durée moyenne (jours) réellement passée par les tickets dans chaque étape
 * du workflow suivie (En cours de dév, En cours de test, Revue, À livrer en qualif,
 * À livrer en prod — ordre chronologique), calculée depuis ticket.stageDurations
 * (cf computeStageFlow / sync.js). Ne s'affiche que pour les colonnes réellement
 * présentes dans le workflow de l'équipe.
 *
 * Reprend le style visuel du schéma "Lead time & Cycle time" (classes .lct-*). Chaque
 * segment est cliquable : ouvre une modale de détail qui reprend la charte des tickets
 * (icône de type, couleur de statut, pastille buffer) et la liste `.stuck-row` déjà
 * utilisée par la card "Tickets bloqués ou stagnants" (cf bindStageFlowCard).
 */

import { esc, computeStageFlow, computeStageFlowDetail, isBufferItem, getStatusLabel } from '../utils.js';
import { TYPE_ICONS } from '../config.js';

const STAGE_ICONS = {
    dev: '💻',
    review: '👀',
    test: '🧪',
    qualif: '📦',
    prod: '🚀',
};

// Couleur d'accent par étape — reprend les variables de statut déjà utilisées ailleurs
// (board, badges) pour rester cohérent : dev↔en cours, test↔test, review↔revue,
// qualif/prod↔terminé (fin de flux).
const STAGE_COLORS = {
    dev: 'var(--status-inprog)',
    test: 'var(--status-test, #06b6d4)',
    review: 'var(--status-review, #8b5cf6)',
    qualif: 'var(--status-done)',
    prod: 'var(--status-done)',
};

const STAGE_LABELS = {
    dev: 'En cours de dév', test: 'En cours de test', review: 'Revue',
    qualif: 'À livrer en qualif', prod: 'À livrer en prod',
};

export function stageFlowCardHtml(tickets) {
    const groups = computeStageFlow(tickets);
    if (!groups.length) return '';
    return `
        <div class="card stage-flow-card">
            <div class="card-header">
                <span class="card-title">⏳ Temps par colonne</span>
                <span class="card-subtitle">Durée moyenne passée dans chaque étape — cliquer pour le détail</span>
            </div>
            <div class="lct-schema">
                <div class="lct-flow">
                    ${groups.map(g => `
                    <button type="button" class="lct-seg stage-flow-seg stage-flow-seg--${g.key}" data-stage-key="${g.key}" title="${g.count} ticket${g.count > 1 ? 's' : ''} concerné${g.count > 1 ? 's' : ''} — cliquer pour le détail">
                        <span class="lct-seg-lbl">${STAGE_ICONS[g.key] || ''} ${esc(g.label)}</span>
                        <span class="lct-seg-val">${g.avgDays} j</span>
                        <span class="stage-flow-count">${g.count} ticket${g.count > 1 ? 's' : ''}</span>
                    </button>`).join('')}
                </div>
            </div>
        </div>`;
}

/** Wire les clics sur les segments de la card (à appeler après insertion dans le DOM). */
export function bindStageFlowCard(container, tickets) {
    container.querySelectorAll('.stage-flow-seg[data-stage-key]').forEach(seg => {
        seg.addEventListener('click', () => _openStageFlowDetail(seg.dataset.stageKey, tickets));
    });
}

function _openStageFlowDetail(groupKey, tickets) {
    const { byRawStatus, tickets: rows } = computeStageFlowDetail(groupKey, tickets);
    if (!rows.length) return;
    const label = STAGE_LABELS[groupKey] || groupKey;
    const icon = STAGE_ICONS[groupKey] || '';
    const color = STAGE_COLORS[groupKey] || 'var(--text-muted)';
    const MAX_ROWS = 25;
    const visible = rows.slice(0, MAX_ROWS);
    const hiddenCount = rows.length - visible.length;

    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `
        <div class="confirm-modal confirm-modal--export stage-detail-modal" role="dialog" aria-modal="true" aria-label="Détail ${esc(label)}">
            <div class="confirm-body">
                <div class="stage-detail-hdr">
                    <span class="confirm-icon stage-detail-icon" style="background:color-mix(in srgb, ${color} 16%, transparent);color:${color}">${icon}</span>
                    <div>
                        <div class="confirm-title">${esc(label)}</div>
                        <span class="text-xs text-muted">${rows.length} ticket${rows.length > 1 ? 's' : ''} concerné${rows.length > 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="stage-detail-breakdown">
                    ${byRawStatus.map(r => `
                        <div class="stage-detail-row" style="border-left-color:${color}">
                            <span class="stage-detail-status">${esc(r.rawStatus)}</span>
                            <span class="stage-detail-count">${r.count} ticket${r.count > 1 ? 's' : ''}</span>
                            <span class="stage-detail-avg" style="color:${color}">${r.avgDays} j moy.</span>
                        </div>`).join('')}
                </div>
                <div class="stage-detail-tickets">
                    ${visible.map(({ ticket: t, days, jiraStatus }) => {
                        const typeIcon = TYPE_ICONS[t.type] ? `${TYPE_ICONS[t.type]} ` : '';
                        const bufferTag = isBufferItem(t) ? ' <span title="Buffer" style="color:#8B5CF6">🛡️</span>' : '';
                        return `
                        <button type="button" class="stuck-row" data-ticket-id="${esc(t.id)}" title="Ouvrir ${esc(t.id)}">
                            <span class="stuck-dot" style="background:var(--status-${esc(t.status)}, var(--text-muted))"></span>
                            <span class="stuck-id">${esc(t.id)}</span>
                            <span class="stuck-title">${typeIcon}${esc(t.title || '')}${bufferTag}</span>
                            <span class="stuck-state stuck-state--${esc(t.status)}">${esc(jiraStatus || getStatusLabel(t))}</span>
                            <span class="stuck-lead${t.leader ? '' : ' stuck-lead--none'}">${esc(t.leader || 'Non assigné')}</span>
                            <span class="stuck-age" style="color:${color};border-color:color-mix(in srgb, ${color} 35%, transparent);background:color-mix(in srgb, ${color} 12%, transparent)">${days} j</span>
                        </button>`;
                    }).join('')}
                    ${hiddenCount > 0 ? `<div class="stage-detail-more">+${hiddenCount} autre${hiddenCount > 1 ? 's' : ''}</div>` : ''}
                </div>
            </div>
            <div class="confirm-actions">
                <button class="btn btn-ghost btn-sm" data-act="close">Fermer</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));

    const close = () => {
        ov.classList.remove('visible');
        ov.addEventListener('transitionend', () => ov.remove(), { once: true });
        document.removeEventListener('keydown', onKey);
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => {
        if (e.target === ov || e.target.closest('[data-act="close"]')) return close();
        const ticketRow = e.target.closest('.stuck-row[data-ticket-id]');
        if (ticketRow) {
            close();
            window.__squadBoard?.openTicketModal?.(ticketRow.dataset.ticketId);
        }
    });
}
