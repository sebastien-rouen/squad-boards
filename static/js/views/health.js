/**
 * Health Check — vue de pilotage agrégée.
 *
 * Une page = un état des lieux complet de la santé des données et du sprint
 * pour toutes les équipes. Permet au RTE / Scrum Master de faire son tour
 * matinal en 30 secondes au lieu de naviguer dans 5 vues.
 *
 * Contenu :
 * - Score de santé global (0-100) calculé depuis l'ensemble des anomalies
 * - 7 cards "anomalie" avec count global (cliquables → ouvre modal d'action)
 * - Matrice équipe × anomalie : compte par cellule, hover = highlight, clic = modal
 */

import { store } from '../state.js';
import { esc, filterByTeam, sumBy, computeCapacityNextPI } from '../utils.js';
import { TEAM_COLORS } from '../config.js';
import { openAlertModal } from '../components/alert_modal.js';
import { sparkline, trendChip } from '../components/sparkline.js';
import { ANOMALY_RULES } from '../business_rules.js';

// Historique local du score Health (snapshot à chaque visite, max 30 entrées)
const HEALTH_HIST_KEY = 'sb-health-history';
const HEALTH_HIST_MAX = 90;   // 3 mois (1 snapshot par jour)
function _loadHealthHistory() {
    try { return JSON.parse(localStorage.getItem(HEALTH_HIST_KEY) || '[]'); }
    catch { return []; }
}
function _pushHealthSnapshot(score, byKey) {
    const today = new Date().toISOString().slice(0, 10);
    const list = _loadHealthHistory();
    // Remplace l'entrée du jour si elle existe, sinon ajoute
    const idx = list.findIndex(s => s.date === today);
    const entry = { date: today, score, byKey };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    localStorage.setItem(HEALTH_HIST_KEY, JSON.stringify(list.slice(-HEALTH_HIST_MAX)));
    return list;
}

// ANOMALY_RULES imported from business_rules.js — single source of truth shared with alert_modal.js
const ANOMALIES = ANOMALY_RULES;

const SEV_COLOR = { danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' };
const SEV_BG    = {
    danger:  'color-mix(in srgb, var(--danger) 12%, transparent)',
    warning: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    info:    'color-mix(in srgb, var(--info) 10%, transparent)',
};

export function renderHealth(container) {
    const allTickets = store.get('tickets') || [];
    const allTeams = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const sprintInfo = store.get('sprintInfo') || {};
    const teamFilter = store.get('team');
    const groupId = store.get('group');
    const groups = store.get('groups') || [];

    // Périmètre : équipes selon filtre topbar (groupe / équipe / toutes)
    let teamsScope = allTeams;
    if (groupId) {
        const g = groups.find(x => x.id === groupId);
        if (g?.teams?.length) teamsScope = allTeams.filter(t => g.teams.includes(t));
    } else if (teamFilter && teamFilter !== 'all') {
        teamsScope = allTeams.filter(t => t === teamFilter);
    }
    teamsScope = teamsScope.slice().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    // Compute : pour chaque équipe, pour chaque anomalie, count
    const ctxByTeam = {};
    for (const tm of teamsScope) {
        const ts = sprintInfo.teamSprints || [];
        const teamSprint = ts.find(s => s.team === tm && s.state === 'active') || ts.find(s => s.team === tm);
        const sprintStartMs = teamSprint?.startDate
            ? new Date(String(teamSprint.startDate).slice(0, 10)).getTime() : 0;
        ctxByTeam[tm] = { sprintStartMs };
    }

    const matrix = {}; // matrix[team][anomalyKey] = count
    const totals = {}; // totals[anomalyKey] = sum across teams
    for (const a of ANOMALIES) totals[a.key] = 0;
    for (const tm of teamsScope) {
        matrix[tm] = {};
        const tickets = allTickets.filter(t => t.team === tm);
        for (const a of ANOMALIES) {
            const n = tickets.filter(t => a.match(t, ctxByTeam[tm])).length;
            matrix[tm][a.key] = n;
            totals[a.key] += n;
        }
    }

    // Score global de santé : 100 - somme pondérée des anomalies / total
    // Pondération : danger ×3, warning ×1.5, info ×0.5
    const totalActiveTickets = allTickets.filter(t => teamsScope.includes(t.team) && t.status !== 'done').length || 1;
    let weighted = 0;
    for (const a of ANOMALIES) {
        const w = a.sev === 'danger' ? 3 : a.sev === 'warning' ? 1.5 : 0.5;
        weighted += totals[a.key] * w;
    }
    const score = Math.max(0, Math.min(100, Math.round(100 - (weighted / totalActiveTickets) * 35)));
    const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Correct' : score >= 40 ? 'Attention' : 'Critique';
    const scoreCls   = score >= 80 ? 'health-score--good' : score >= 60 ? 'health-score--ok' : score >= 40 ? 'health-score--warn' : 'health-score--bad';

    // Snapshot du jour → historique → sparkline tendance
    const history = _pushHealthSnapshot(score, { ...totals });
    const scoreSeries = history.map(s => s.score);
    const scoreSparkline = scoreSeries.length >= 2
        ? sparkline(scoreSeries, { width: 120, height: 32, color: 'var(--health-color, #3b82f6)', areaFill: true, showLast: true, showMinMax: true })
        : '';
    const scoreTrend = scoreSeries.length >= 2 ? trendChip(scoreSeries, { invertGood: false, unit: ' pts' }) : '';

    // Helpers pour series par anomalie
    const seriesFor = (key) => history.map(s => s.byKey?.[key] ?? 0);

    // Capacité prévisionnelle du PI suivant (si une équipe est sélectionnée)
    const absences = store.get('absences') || [];
    const piInfo = store.get('piInfo');
    const capacityCard = teamsScope.length === 1 ? (() => {
        const team = teamsScope[0];
        const cap = computeCapacityNextPI(team, sprintInfo, piInfo, absences, allTickets);
        if (!cap) return '';
        const _fmtD = iso => { const d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
        const ratioColor = cap.ratio >= 30 ? 'var(--warning)' : cap.ratio >= 15 ? 'var(--info)' : 'var(--success)';
        const piLabel = cap.piNumber ? `PI#${cap.piNumber}` : 'prochain PI';
        return `
            <div class="capacity-card" title="Vélocité moyenne sprint (3 derniers) × ${cap.sprintsPerPI} sprints × (1 − % absences)">
                <div class="capacity-hdr">
                    <span class="capacity-icon">🎯</span>
                    <div>
                        <div class="capacity-title">Capacité prévisionnelle — ${esc(piLabel)}</div>
                        <div class="capacity-sub">${esc(team)} · ${cap.sprintsPerPI} sprints × ${cap.sprintDuration}j · ${_fmtD(cap.windowStart)} → ${_fmtD(cap.windowEnd)}</div>
                    </div>
                </div>
                <div class="capacity-metrics">
                    <div class="capacity-metric capacity-metric--main" title="Capacité nette = vélocité × sprints × (1 − absences)">
                        <span class="capacity-metric-val">${cap.netCapacity}<small>pts</small></span>
                        <span class="capacity-metric-lbl">Capacité nette PI</span>
                    </div>
                    <div class="capacity-metric" title="Vélocité × nb sprints, sans tenir compte des absences">
                        <span class="capacity-metric-val">${cap.grossCapacity}<small>pts</small></span>
                        <span class="capacity-metric-lbl">Brute (sans absences)</span>
                    </div>
                    <div class="capacity-metric">
                        <span class="capacity-metric-val">${cap.avgVelocityPerSprint}<small>pts/sp</small></span>
                        <span class="capacity-metric-lbl">Vélocité moy. (3)</span>
                    </div>
                    <div class="capacity-metric">
                        <span class="capacity-metric-val" style="color:${ratioColor}">−${cap.ratio}<small>%</small></span>
                        <span class="capacity-metric-lbl">Absences (${cap.absencesDays}j sur ${cap.totalOpenDaysTeam})</span>
                    </div>
                </div>
            </div>`;
    })() : '';

    // Cards avec sparkline + chip de tendance (delta vs jour précédent)
    const cardsHtml = ANOMALIES.map(a => {
        const series = seriesFor(a.key);
        const spark = series.length >= 2
            ? sparkline(series, { width: 70, height: 22, color: a.sev === 'danger' ? '#ef4444' : a.sev === 'warning' ? '#f59e0b' : '#3b82f6', areaFill: true })
            : '';
        // Pour les anomalies, baisse = bien → invertGood=true
        const tr = series.length >= 2 ? trendChip(series, { invertGood: true }) : '';
        return `
        <button class="health-card health-card--${a.sev}" data-anomaly="${a.key}" title="${esc(a.desc)} — cliquer pour agir">
            <div class="health-card-hdr">
                <span class="health-card-icon">${a.icon}</span>
                <span class="health-card-label">${esc(a.label)}</span>
                ${tr}
            </div>
            <div class="health-card-mid">
                <div class="health-card-val">${totals[a.key]}</div>
                <div class="health-card-spark">${spark}</div>
            </div>
            <div class="health-card-foot">${esc(a.desc)}</div>
        </button>`;
    }).join('');

    const teamColor = (name) => {
        const tObj = teamObjects.find(o => o.name === name);
        if (tObj?.color) return tObj.color;
        const idx = allTeams.indexOf(name);
        return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0];
    };

    // Cellule matrice avec heatmap (intensité = count vs max global de l'anomalie)
    const maxByAnomaly = {};
    for (const a of ANOMALIES) maxByAnomaly[a.key] = Math.max(1, ...teamsScope.map(t => matrix[t][a.key]));

    const matrixRowsHtml = teamsScope.map(tm => {
        const sumRow = ANOMALIES.reduce((s, a) => s + matrix[tm][a.key], 0);
        const cells = ANOMALIES.map(a => {
            const n = matrix[tm][a.key];
            const intensity = n === 0 ? 0 : Math.min(1, n / maxByAnomaly[a.key]);
            const bg = n === 0
                ? 'transparent'
                : `color-mix(in srgb, ${SEV_COLOR[a.sev]} ${Math.round(8 + intensity * 22)}%, transparent)`;
            return `<td class="health-cell${n > 0 ? ' has-val' : ''}" style="background:${bg}"
                       data-anomaly="${a.key}" data-team="${esc(tm)}" title="${esc(a.label)} — ${esc(tm)} : ${n}">
                ${n > 0 ? n : '<span class="health-cell-zero">·</span>'}
            </td>`;
        }).join('');
        return `<tr>
            <th scope="row" class="health-team">
                <span class="health-team-swatch" style="background:${teamColor(tm)}">${esc(tm.slice(0, 2).toUpperCase())}</span>
                <span class="health-team-name">${esc(tm)}</span>
            </th>
            ${cells}
            <td class="health-row-total">${sumRow}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="health-view">
            <div class="health-hero">
                <div class="health-score-wrap ${scoreCls}">
                    <div class="health-score-circle">
                        <span class="health-score-val">${score}</span>
                        <span class="health-score-max">/100</span>
                    </div>
                    <div class="health-score-meta">
                        <div class="health-score-label">${esc(scoreLabel)} ${scoreTrend}</div>
                        <div class="health-score-sub">${teamsScope.length} équipe${teamsScope.length > 1 ? 's' : ''} · ${totalActiveTickets} ticket${totalActiveTickets > 1 ? 's' : ''} actifs</div>
                        ${scoreSparkline ? `<div class="health-score-spark">${scoreSparkline}</div>` : ''}
                    </div>
                </div>
                <div class="health-intro">
                    <h2>🩺 Health Check</h2>
                    <p>Vue agrégée des anomalies par équipe pour le RTE / Scrum Master. <strong>Clique sur un chiffre</strong> pour ouvrir la liste des tickets concernés (avec édition rapide).</p>
                </div>
            </div>

            ${capacityCard}

            ${history.length >= 3 ? (() => {
                const series = history.map(s => s.score);
                const dates = history.map(s => s.date);
                const minS = Math.min(...series), maxS = Math.max(...series);
                const avg  = Math.round(series.reduce((a,b) => a+b, 0) / series.length);
                const last = series[series.length - 1];
                const first = series[0];
                const delta = last - first;
                const days = history.length;
                return `<div class="health-history-card">
                    <div class="health-history-hdr">
                        <h3 class="health-history-title">📈 Évolution sur ${days} jour${days > 1 ? 's' : ''}</h3>
                        <div class="health-history-kpis">
                            <span class="health-history-kpi"><strong>${avg}</strong><small>moy.</small></span>
                            <span class="health-history-kpi"><strong>${minS}</strong><small>min</small></span>
                            <span class="health-history-kpi"><strong>${maxS}</strong><small>max</small></span>
                            <span class="health-history-kpi ${delta >= 0 ? 'is-up' : 'is-down'}">
                                <strong>${delta >= 0 ? '↗ +' : '↘ '}${delta}</strong><small>vs début</small>
                            </span>
                        </div>
                    </div>
                    <div class="health-history-chart">
                        ${_renderHealthHistorySvg(series, dates)}
                    </div>
                </div>`;
            })() : ''}

            <div class="health-cards">${cardsHtml}</div>

            <div class="health-matrix-wrap">
                <h3 class="health-matrix-title">Matrice équipes × anomalies</h3>
                <table class="health-matrix">
                    <thead>
                        <tr>
                            <th class="health-team-col">Équipe</th>
                            ${ANOMALIES.map(a => `<th class="health-anomaly-col" title="${esc(a.desc)}">
                                <span class="health-anomaly-icon">${a.icon}</span>
                                <span class="health-anomaly-label">${esc(a.label)}</span>
                            </th>`).join('')}
                            <th class="health-row-total-col">Σ</th>
                        </tr>
                    </thead>
                    <tbody>${matrixRowsHtml}</tbody>
                </table>
                ${teamsScope.length === 0 ? '<p class="text-muted text-sm text-center p-4">Aucune équipe dans le périmètre.</p>' : ''}
            </div>
        </div>
    `;

    // Delegated click handlers — one listener per container instead of one per element
    container.addEventListener('click', e => {
        const card = e.target.closest('.health-card');
        if (card?.dataset.anomaly) { openAlertModal(card.dataset.anomaly); return; }

        const cell = e.target.closest('.health-cell.has-val');
        if (cell?.dataset.anomaly) {
            const tm = cell.dataset.team;
            if (tm) { store.set('group', null); store.set('team', tm); }
            setTimeout(() => openAlertModal(cell.dataset.anomaly), 60);
        }
    });
}

// SVG inline pour la courbe historique du score Health.
// Petite courbe area + ligne + tick zones de bandes (good/ok/warn/bad).
function _renderHealthHistorySvg(series, dates) {
    if (!series.length) return '';
    const W = 800, H = 160, padL = 28, padR = 10, padT = 12, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const n = series.length;
    const xOf = (i) => padL + (n > 1 ? (i / (n - 1)) * innerW : 0);
    const yOf = (v) => padT + innerH - (v / 100) * innerH;
    // Path ligne + path area (line + base)
    const pts = series.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    const areaPath = `M ${xOf(0).toFixed(1)},${(padT + innerH).toFixed(1)} L ${pts.replace(/ /g, ' L ')} L ${xOf(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
    const linePath = `M ${pts.split(' ').join(' L ')}`;
    // Bandes de couleur en arrière-plan (good/ok/warn/bad)
    const bands = [
        { from: 80, to: 100, color: 'rgba(16,185,129,0.08)' },
        { from: 60, to: 80,  color: 'rgba(245,158,11,0.06)' },
        { from: 40, to: 60,  color: 'rgba(249,115,22,0.06)' },
        { from: 0,  to: 40,  color: 'rgba(239,68,68,0.08)'  },
    ].map(b => `<rect x="${padL}" y="${yOf(b.to).toFixed(1)}" width="${innerW}" height="${(yOf(b.from) - yOf(b.to)).toFixed(1)}" fill="${b.color}"/>`).join('');
    // Axe Y : 0, 50, 100
    const yTicks = [0, 50, 100].map(v => `
        <line x1="${padL}" y1="${yOf(v).toFixed(1)}" x2="${W - padR}" y2="${yOf(v).toFixed(1)}" stroke="rgba(148,163,184,0.18)" stroke-dasharray="3,3"/>
        <text x="${padL - 6}" y="${(yOf(v) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-muted)" font-family="system-ui">${v}</text>
    `).join('');
    // Axe X : 1er et dernier label
    const xLabels = `
        <text x="${xOf(0).toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="start" font-size="10" fill="var(--text-muted)" font-family="system-ui">${dates[0]?.slice(5) || ''}</text>
        <text x="${xOf(n - 1).toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-muted)" font-family="system-ui">${dates[n - 1]?.slice(5) || ''}</text>`;
    // Point final mis en valeur
    const lastX = xOf(n - 1), lastY = yOf(series[n - 1]);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-label="Évolution du score Health">
        ${bands}
        ${yTicks}
        <path d="${areaPath}" fill="url(#health-grad)" opacity="0.55"/>
        <path d="${linePath}" stroke="#3b82f6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="#3b82f6" stroke="#fff" stroke-width="2"/>
        ${xLabels}
        <defs>
            <linearGradient id="health-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.04"/>
            </linearGradient>
        </defs>
    </svg>`;
}
