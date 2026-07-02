/**
 * Card "Temps par colonne" (flux inter-étapes) — réutilisable Dashboard + PI Planning.
 *
 * Affiche la durée moyenne (jours) réellement passée par les tickets dans chaque étape
 * du workflow suivie (Revue, En cours de dév, En cours de test, À livrer en qualif,
 * À livrer en prod), calculée depuis ticket.stageDurations (cf computeStageFlow / sync.js).
 * Ne s'affiche que pour les colonnes réellement présentes dans le workflow de l'équipe.
 *
 * Reprend le style visuel du schéma "Lead time & Cycle time" (classes .lct-*).
 */

import { esc, computeStageFlow } from '../utils.js';

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
                <span class="card-subtitle">Durée moyenne passée dans chaque étape</span>
            </div>
            <div class="lct-schema">
                <div class="lct-flow">
                    ${groups.map(g => `
                    <div class="lct-seg stage-flow-seg stage-flow-seg--${g.key}" title="${g.count} ticket${g.count > 1 ? 's' : ''} concerné${g.count > 1 ? 's' : ''}">
                        <span class="lct-seg-lbl">${STAGE_ICONS[g.key] || ''} ${esc(g.label)}</span>
                        <span class="lct-seg-val">${g.avgDays} j</span>
                        <span class="stage-flow-count">${g.count} ticket${g.count > 1 ? 's' : ''}</span>
                    </div>`).join('')}
                </div>
            </div>
        </div>`;
}
