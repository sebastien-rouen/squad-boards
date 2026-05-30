/**
 * ROAM board - matrice Risques (Resolved / Owned / Accepted / Mitigated).
 */

import { store } from '../state.js';
import { esc, filterByTeam, toast } from '../utils.js';
import * as api from '../api.js';

const QUADRANTS = [
    { id: 'open',      label: 'Non traites',  icon: '⚠️',  cls: 'roam-open'      },
    { id: 'owned',     label: 'Pris en charge',icon: '👤', cls: 'roam-owned'     },
    { id: 'accepted',  label: 'Acceptes',     icon: '✅',  cls: 'roam-accepted'  },
    { id: 'mitigated', label: 'Mitiges',      icon: '🛡️', cls: 'roam-mitigated' },
    { id: 'resolved',  label: 'Resolus',      icon: '✔️',  cls: 'roam-resolved'  },
];

const IMPACT_CSS = { low: 'success', medium: 'warning', high: 'danger', critical: 'danger' };
const IMPACT_LABEL = { low: 'Faible', medium: 'Moyen', high: 'Eleve', critical: 'Critique' };

export function renderRoam(container) {
    _render(container);
}

function _render(container) {
    const team  = store.get('team');
    const risks = (store.get('risks') || []).filter(r => team === 'all' || !team || r.team === team || !r.team);
    const teams = store.get('teams') || [];
    const piInfo = store.get('piInfo');
    const members = store.get('members') || [];

    const byQ = {};
    for (const q of QUADRANTS) byQ[q.id] = risks.filter(r => r.quadrant === q.id);

    container.innerHTML = `
        <!-- Add risk form -->
        <div class="card mb-4">
            <div class="card-header"><span class="card-title">Ajouter un risque</span></div>
            <form id="roam-form" class="roam-form">
                <div class="form-row">
                    <input class="input" name="title" placeholder="Titre du risque *" required>
                    <select class="input" name="quadrant">
                        ${QUADRANTS.map(q => `<option value="${q.id}">${q.icon} ${q.label}</option>`).join('')}
                    </select>
                    <select class="input" name="impact">
                        <option value="low">Faible</option>
                        <option value="medium" selected>Moyen</option>
                        <option value="high">Eleve</option>
                        <option value="critical">Critique</option>
                    </select>
                    <select class="input" name="probability">
                        <option value="low">Prob. Faible</option>
                        <option value="medium" selected>Prob. Moyenne</option>
                        <option value="high">Prob. Haute</option>
                    </select>
                </div>
                <div class="form-row">
                    <input class="input flex-1" name="description" placeholder="Description / impact">
                    <input class="input flex-1" name="mitigation" placeholder="Plan de mitigation">
                    <select class="input" name="team">
                        <option value="">Toutes equipes</option>
                        ${teams.map(t => `<option value="${esc(t)}" ${t === team && team !== 'all' ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                    </select>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        </div>

        <!-- ROAM board -->
        <div class="roam-board">
            ${QUADRANTS.map(q => `
            <div class="roam-col ${q.cls}" data-quadrant="${q.id}">
                <div class="roam-col-hdr">
                    <span class="roam-col-icon">${q.icon}</span>
                    <span class="roam-col-title">${q.label}</span>
                    <span class="roam-col-count">${byQ[q.id].length}</span>
                </div>
                <div class="roam-col-body" id="roam-col-${q.id}">
                    ${byQ[q.id].length ? byQ[q.id].map(r => _riskCard(r)).join('') : `<div class="roam-empty">Aucun risque</div>`}
                </div>
            </div>`).join('')}
        </div>
    `;

    // Add risk
    container.querySelector('#roam-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        if (!data.title?.trim()) return;
        try {
            const r = await api.createRisk(data);
            const risks2 = [...(store.get('risks') || []), r];
            store.set('risks', risks2);
            _render(container);
            toast('Risque ajoute', 'success');
        } catch (err) { toast(err.message, 'error'); }
    });

    // Move to quadrant
    container.querySelectorAll('.roam-move-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = btn.closest('[data-risk-id]')?.dataset.riskId;
            const q  = btn.dataset.moveQ;
            if (!id) return;
            try {
                await api.updateRisk(id, { quadrant: q });
                const risks2 = (store.get('risks') || []).map(r => r.id === id ? { ...r, quadrant: q } : r);
                store.set('risks', risks2);
                _render(container);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Delete
    container.querySelectorAll('.roam-delete-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = btn.closest('[data-risk-id]')?.dataset.riskId;
            if (!id || !confirm('Supprimer ce risque ?')) return;
            try {
                await api.deleteRisk(id);
                store.set('risks', (store.get('risks') || []).filter(r => r.id !== id));
                _render(container);
            } catch (err) { toast(err.message, 'error'); }
        });
    });
}

function _riskCard(r) {
    const otherQ = QUADRANTS.filter(q => q.id !== r.quadrant);
    return `
    <div class="roam-card" data-risk-id="${esc(r.id)}">
        <div class="roam-card-title">${esc(r.title)}</div>
        ${r.description ? `<div class="roam-card-desc">${esc(r.description)}</div>` : ''}
        ${r.mitigation  ? `<div class="roam-card-mit"><em>Mitigation:</em> ${esc(r.mitigation)}</div>` : ''}
        <div class="roam-card-meta">
            <span class="badge badge-${IMPACT_CSS[r.impact] || 'info'}">${IMPACT_LABEL[r.impact] || r.impact}</span>
            ${r.team ? `<span class="text-xs text-muted">${esc(r.team)}</span>` : ''}
            ${r.owner ? `<span class="text-xs text-muted">${esc(r.owner)}</span>` : ''}
        </div>
        <div class="roam-card-actions">
            <div class="roam-move-menu">
                ${otherQ.map(q => `<button class="roam-move-btn btn btn-secondary btn-xs" data-move-q="${q.id}" title="Deplacer vers ${q.label}">${q.icon}</button>`).join('')}
            </div>
            <button class="roam-delete-btn btn-icon btn-icon-sm" title="Supprimer">
                <svg class="icon icon-sm"><use href="#i-x"/></svg>
            </button>
        </div>
    </div>`;
}
