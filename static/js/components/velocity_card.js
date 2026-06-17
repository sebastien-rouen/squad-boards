/**
 * Card Vélocité réutilisable (Dashboard + Health) — KPIs, sparkline mini-bars, graphe Chart.js.
 *
 * Données :
 *  - velocityHistory   : sprints CLOS uniquement (alimente les stats/KPIs)
 *  - currentSprintEntry: sprint actif (rendu en bout de graphe, EXCLU des stats)
 *  - target            : objectif de vélocité (piInfo.velocityTarget) ou null
 *  - canvasId          : id du <canvas> (unique par page ; défaut 'chart-velocity')
 *
 * Usage : insérer `velocityCardHtml(opts)` dans le HTML, puis appeler `mountVelocityChart(opts)`
 * dans un requestAnimationFrame une fois le DOM monté.
 */

import { esc } from '../utils.js';
import { renderVelocityChart } from './charts.js';

// Limite l'historique aux N derniers sprints (lisibilité quand le périmètre est large).
function _cap(vh, maxPoints) {
    return (maxPoints > 0 && vh.length > maxPoints) ? vh.slice(-maxPoints) : vh;
}

export function velocityCardHtml({ velocityHistory = [], currentSprintEntry = null, target = null, canvasId = 'chart-velocity', maxPoints = 0 } = {}) {
    const vh = _cap(velocityHistory || [], maxPoints);
    const cur = currentSprintEntry;
    if (!vh.length && !cur) {
        return `
        <div class="card velocity-card velocity-card--empty">
            <div class="card-header"><span class="card-title">📈 Vélocité</span></div>
            <div class="chart-container chart-h-md velocity-empty">
                <div class="velocity-empty-inner">
                    <span class="velocity-empty-icon">📊</span>
                    <p class="text-muted text-sm">Pas encore d'historique de vélocité</p>
                    <small class="text-muted">Les sprints clôturés alimenteront ce graphique</small>
                </div>
            </div>
        </div>`;
    }
    // Stats — calculées sur SPRINTS CLOS uniquement (vh), pas le current
    const vals = vh.map(v => v.velocity || 0);
    const last = vals.length ? vals[vals.length - 1] : 0;
    const lastName = vh.length ? vh[vh.length - 1].name : '—';
    const last3 = vals.slice(-3);
    const avg3 = last3.length ? Math.round(last3.reduce((s, v) => s + v, 0) / last3.length) : 0;
    const prev3 = vals.slice(-6, -3);
    const prevAvg = prev3.length ? Math.round(prev3.reduce((s, v) => s + v, 0) / prev3.length) : null;
    const trend = (prevAvg && prevAvg > 0) ? Math.round(((avg3 - prevAvg) / prevAvg) * 100) : null;
    const best = vals.length ? Math.max(...vals) : 0;
    const worst = vals.length ? Math.min(...vals) : 0;
    // Stabilité = coefficient de variation (écart-type / moyenne)
    const overallAvg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    const variance = vals.length ? vals.reduce((s, v) => s + Math.pow(v - overallAvg, 2), 0) / vals.length : 0;
    const stdDev = Math.sqrt(variance);
    const cv = overallAvg > 0 ? Math.round((stdDev / overallAvg) * 100) : 0;
    const stabilityLabel = cv < 15 ? 'Très stable' : cv < 30 ? 'Stable' : cv < 50 ? 'Variable' : 'Instable';
    const stabilityCls = cv < 15 ? 'velocity-kpi--good' : cv < 30 ? 'velocity-kpi--ok' : cv < 50 ? 'velocity-kpi--warn' : 'velocity-kpi--danger';
    // Couleur d'accent global selon la tendance
    const accentCls = trend == null ? 'velocity-card--neutral'
                    : trend >= 10 ? 'velocity-card--up'
                    : trend <= -10 ? 'velocity-card--down'
                    : 'velocity-card--neutral';
    // % vs objectif (sprint le plus récent)
    const targetPct = target ? Math.round((last / target) * 100) : null;
    const targetCls = targetPct == null ? ''
                    : targetPct >= 100 ? 'velocity-kpi--good'
                    : targetPct >= 80 ? 'velocity-kpi--ok'
                    : 'velocity-kpi--warn';
    // Sparkline mini-bars
    const sparkMax = Math.max(...vals, target || 0, 1);
    return `
        <div class="card velocity-card ${accentCls}">
            <div class="velocity-card-hdr">
                <div class="velocity-card-title">
                    <span class="card-title">📈 Vélocité</span>
                    <span class="velocity-card-sub">${vh.length} sprint${vh.length > 1 ? 's' : ''} clos${cur ? ` + 1 en cours <small>(non comptés)</small>` : ''} · moy. ${avg3} pts/sprint</span>
                </div>
                <div class="velocity-kpis">
                    <div class="velocity-kpi velocity-kpi--primary" title="Moyenne des 3 derniers sprints">
                        <span class="velocity-kpi-val">${avg3}</span>
                        <span class="velocity-kpi-lbl">moy. 3 derniers</span>
                    </div>
                    ${trend != null ? `
                    <div class="velocity-kpi ${trend >= 0 ? 'velocity-kpi--good' : 'velocity-kpi--warn'}" title="Tendance : ${avg3} vs ${prevAvg} pts (3 sprints précédents)">
                        <span class="velocity-kpi-val">${trend >= 0 ? '↗' : '↘'} ${trend >= 0 ? '+' : ''}${trend}%</span>
                        <span class="velocity-kpi-lbl">tendance</span>
                    </div>` : ''}
                    <div class="velocity-kpi" title="Sprint clôturé le plus récent : ${esc(lastName)} (le sprint en cours n'est pas compté)">
                        <span class="velocity-kpi-val">${last}</span>
                        <span class="velocity-kpi-lbl">dernier clos</span>
                    </div>
                    <div class="velocity-kpi" title="Meilleure vélocité observée">
                        <span class="velocity-kpi-val">⭐ ${best}</span>
                        <span class="velocity-kpi-lbl">record</span>
                    </div>
                    <div class="velocity-kpi ${stabilityCls}" title="Coefficient de variation : ${cv}% — plus c'est bas, plus l'équipe est prédictible">
                        <span class="velocity-kpi-val">${stabilityLabel}</span>
                        <span class="velocity-kpi-lbl">cv ${cv}%</span>
                    </div>
                    ${target ? `
                    <div class="velocity-kpi ${targetCls}" title="Dernier sprint vs objectif : ${last}/${target} pts">
                        <span class="velocity-kpi-val">🎯 ${targetPct}%</span>
                        <span class="velocity-kpi-lbl">vs cible ${target}</span>
                    </div>` : ''}
                </div>
            </div>
            <div class="chart-container chart-h-md"><canvas id="${esc(canvasId)}"></canvas></div>
            <div class="velocity-spark" title="Aperçu : ${vh.length} sprints clos${cur ? ' + 1 en cours' : ''}, min ${worst} · max ${best}">
                ${[...vh, ...(cur ? [cur] : [])].map((v, i, arr) => {
                    const h = sparkMax > 0 ? Math.max(6, Math.round((v.velocity / sparkMax) * 100)) : 6;
                    const isLast = i === arr.length - 1;
                    const isBest = !v.isCurrent && v.velocity === best;
                    const cls = v.isCurrent ? 'velocity-spark-bar--current'
                             : isLast ? 'velocity-spark-bar--last'
                             : isBest ? 'velocity-spark-bar--best' : '';
                    const lbl = v.isCurrent ? `${esc(v.name)} · ${v.velocity}/${v.estimated} pts (en cours)`
                                            : `${esc(v.name)} · ${v.velocity} pts`;
                    return `<span class="velocity-spark-bar ${cls}" style="height:${h}%" title="${lbl}"></span>`;
                }).join('')}
            </div>
        </div>`;
}

export function mountVelocityChart({ velocityHistory = [], currentSprintEntry = null, target = null, canvasId = 'chart-velocity', maxPoints = 0 } = {}) {
    const vh = _cap(velocityHistory || [], maxPoints);
    const data = currentSprintEntry ? [...vh, currentSprintEntry] : vh;
    if (data.length) renderVelocityChart(canvasId, data, { target });
}
