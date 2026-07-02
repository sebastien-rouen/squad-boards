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
 * segment est cliquable : ouvre une modale de détail (répartition par statut JIRA brut
 * + liste des tickets concernés, cf bindStageFlowCard).
 */

import { esc, computeStageFlow, computeStageFlowDetail } from '../utils.js';

const STAGE_ICONS = {
    dev: '💻',
    review: '👀',
    test: '🧪',
    qualif: '📦',
    prod: '🚀',
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

const STAGE_LABELS = {
    dev: 'En cours de dév', test: 'En cours de test', review: 'Revue',
    qualif: 'À livrer en qualif', prod: 'À livrer en prod',
};

function _openStageFlowDetail(groupKey, tickets) {
    const { byRawStatus, tickets: rows } = computeStageFlowDetail(groupKey, tickets);
    if (!rows.length) return;
    const label = STAGE_LABELS[groupKey] || groupKey;
    const icon = STAGE_ICONS[groupKey] || '';
    const MAX_ROWS = 25;
    const visible = rows.slice(0, MAX_ROWS);
    const hiddenCount = rows.length - visible.length;

    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `
        <div class="confirm-modal confirm-modal--export stage-detail-modal" role="dialog" aria-modal="true" aria-label="Détail ${esc(label)}">
            <div class="confirm-body">
                <div class="confirm-title">${icon} ${esc(label)} — détail</div>
                <div class="stage-detail-breakdown">
                    ${byRawStatus.map(r => `
                        <div class="stage-detail-row">
                            <span class="stage-detail-status">${esc(r.rawStatus)}</span>
                            <span class="stage-detail-count">${r.count} ticket${r.count > 1 ? 's' : ''}</span>
                            <span class="stage-detail-avg">${r.avgDays} j moy.</span>
                        </div>`).join('')}
                </div>
                <div class="stage-detail-tickets">
                    ${visible.map(t => `
                        <button type="button" class="stage-detail-ticket-row" data-ticket-id="${esc(t.id)}">
                            <span class="stage-detail-ticket-id">${esc(t.id)}</span>
                            <span class="stage-detail-ticket-title" title="${esc(t.title)}">${esc(t.title)}</span>
                            <span class="stage-detail-ticket-days">${t.days} j</span>
                        </button>`).join('')}
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
        const ticketRow = e.target.closest('.stage-detail-ticket-row');
        if (ticketRow) {
            close();
            window.__squadBoard?.openTicketModal?.(ticketRow.dataset.ticketId);
        }
    });
}
