/**
 * Sprint comparison modal — comparer 2 à 5 sprints côte-à-côte.
 *
 * Déclenché depuis le chart vélocité quand l'utilisateur sélectionne plusieurs
 * sprints via shift+clic. Affiche un tableau comparatif avec :
 * - Métriques clés (Engagement, Vélocité, Buffer, % réalisé)
 * - Min / Max / Moyenne en footer
 * - Indicateur visuel best/worst (↑ vert pour le meilleur, ↓ rouge pour le pire)
 */

import { esc } from '../utils.js';

export function openSprintCompareModal(sprints) {
    if (!sprints || sprints.length < 2) return;
    _closeModal();

    const overlay = document.createElement('div');
    overlay.id = 'sprint-compare-overlay';
    overlay.className = 'modal-overlay sprint-compare-overlay';
    overlay.innerHTML = _renderHtml(sprints);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.querySelector('#sprint-compare-close')?.addEventListener('click', _closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(); });
    const onKey = e => {
        if (e.key === 'Escape') { _closeModal(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

function _closeModal() {
    const ov = document.getElementById('sprint-compare-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    ov.addEventListener('transitionend', () => ov.remove(), { once: true });
}

// ── HTML ─────────────────────────────────────────────────────────────────────
function _renderHtml(sprints) {
    const cols = sprints.length;
    // Calcule min/max par métrique pour highlighting
    const vels = sprints.map(s => s.velocity || 0);
    const ests = sprints.map(s => s.estimated || 0);
    const bufs = sprints.map(s => s.bufferPoints || 0);
    const ratios = sprints.map(s => s.estimated > 0 ? Math.round((s.velocity / s.estimated) * 100) : 0);

    const maxVel = Math.max(...vels); const minVel = Math.min(...vels);
    const maxEst = Math.max(...ests); const minEst = Math.min(...ests);
    const maxRatio = Math.max(...ratios); const minRatio = Math.min(...ratios);

    const avgVel = Math.round(vels.reduce((a, b) => a + b, 0) / cols);
    const avgEst = Math.round(ests.reduce((a, b) => a + b, 0) / cols);
    const avgBuf = Math.round(bufs.reduce((a, b) => a + b, 0) / cols);
    const avgRatio = Math.round(ratios.reduce((a, b) => a + b, 0) / cols);

    // Cellule avec indicateur best/worst
    const cell = (val, suffix, min, max, isGood = true) => {
        let cls = '', ind = '';
        if (cols > 1 && min !== max) {
            if (val === max) { cls = isGood ? 'cmp-best' : 'cmp-worst'; ind = isGood ? '↑' : '↓'; }
            else if (val === min) { cls = isGood ? 'cmp-worst' : 'cmp-best'; ind = isGood ? '↓' : '↑'; }
        }
        return `<td class="${cls}"><span class="cmp-val">${val}${suffix || ''}</span>${ind ? `<span class="cmp-ind">${ind}</span>` : ''}</td>`;
    };

    return `
        <div class="modal sprint-compare-modal" role="dialog" aria-labelledby="sprint-compare-title">
            <div class="modal-header sprint-compare-header">
                <h2 id="sprint-compare-title">
                    <span class="sprint-compare-icon">⚖️</span>
                    <span class="truncate">Comparaison de ${cols} sprints</span>
                </h2>
                <button class="mdl-nav-btn" id="sprint-compare-close" title="Fermer (Esc)">
                    <svg><use href="#i-x"/></svg>
                </button>
            </div>
            <div class="modal-body sprint-compare-body">
                <table class="sprint-compare-table">
                    <thead>
                        <tr>
                            <th class="cmp-metric-col">Métrique</th>
                            ${sprints.map(s => `
                                <th class="cmp-sprint-col">
                                    <div class="cmp-sprint-name">${esc(s.name)}</div>
                                    ${s.team ? `<div class="cmp-sprint-team">${esc(s.team)}</div>` : ''}
                                    <div class="cmp-sprint-state cmp-state--${s.isCurrent ? 'current' : 'closed'}">
                                        ${s.isCurrent ? '● en cours' : '○ clos'}
                                    </div>
                                </th>
                            `).join('')}
                            <th class="cmp-summary-col" title="Moyenne sur les sprints comparés">Moy.</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="cmp-metric"><span class="cmp-dot" style="background:#94a3b8"></span> Engagement (estimé)</td>
                            ${ests.map(v => cell(v, ' pts', minEst, maxEst, true)).join('')}
                            <td class="cmp-avg">${avgEst} pts</td>
                        </tr>
                        <tr>
                            <td class="cmp-metric"><span class="cmp-dot" style="background:#3b82f6"></span> Vélocité (livrée)</td>
                            ${vels.map(v => cell(v, ' pts', minVel, maxVel, true)).join('')}
                            <td class="cmp-avg">${avgVel} pts</td>
                        </tr>
                        <tr>
                            <td class="cmp-metric"><span class="cmp-dot" style="background:#8b5cf6"></span> 🛡️ Buffer (réservé)</td>
                            ${bufs.map(v => cell(v, ' pts', Math.min(...bufs), Math.max(...bufs), false)).join('')}
                            <td class="cmp-avg">${avgBuf} pts</td>
                        </tr>
                        <tr class="cmp-row-highlight">
                            <td class="cmp-metric">% réalisé / engagement</td>
                            ${ratios.map(v => cell(v, '%', minRatio, maxRatio, true)).join('')}
                            <td class="cmp-avg">${avgRatio}%</td>
                        </tr>
                    </tbody>
                </table>
                <div class="sprint-compare-legend">
                    <span class="cmp-leg-item"><span class="cmp-leg-pill cmp-best">↑</span> Meilleur sur la métrique</span>
                    <span class="cmp-leg-item"><span class="cmp-leg-pill cmp-worst">↓</span> Le plus faible</span>
                </div>
            </div>
        </div>`;
}
