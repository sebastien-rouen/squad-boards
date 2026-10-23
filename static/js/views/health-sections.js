/**
 * Health — blocs de la page, rendus depuis le modèle (`m`, cf. health-model.js) : en-tête (score +
 * capacité), vélocité, cartes d'anomalies, matrice équipes × anomalies.
 */

import { esc } from '../utils.js';
import { capacityCardHtml } from './health-capacity-card.js';
import { velocityCardHtml } from '../components/velocity_card.js';
import { ANOMALY_RULES } from '../business_rules.js';
import { sparkline, trendChip } from '../components/sparkline.js';
import { _spKey, _capacityTip } from './health-shared.js';
import { voteCount, voteTotalHtml } from './health-votes.js';

const SEV_COLOR = { danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' };

/** En-tête : score de santé, tendance, intro, carte capacité. */
export function heroHtml(m) {
    const { scoreCls, score, scoreLabel, scoreTrend, teamsScope, totalActiveTickets, scoreSparkline } = m;
    return `
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

                ${capacityCardHtml(m)}
            </div>`;
}

/** Vélocité : une équipe, ou une carte par équipe de la ligne produit sélectionnée. */
export function veloHostHtml(m) {
    const { _veloTeamChips, _activeGroup, _groupVeloData, piInfo, _veloMax, _veloCanvasId, velocityHistory, currentSprintEntry } = m;
    return `
            <div class="health-velo-host">
                ${_veloTeamChips}
                ${_activeGroup
                    ? (_groupVeloData.length
                        ? `<div class="health-velo-group-grid">${_groupVeloData.map(({ team, vh, cur }) => `
                            <div class="health-velo-group-card">
                                <div class="health-velo-group-card-lbl">${esc(team)}</div>
                                ${velocityCardHtml({ velocityHistory: vh, currentSprintEntry: cur, target: piInfo?.velocityTarget || null, maxPoints: _veloMax, canvasId: _veloCanvasId(team) })}
                            </div>`).join('')}</div>`
                        : '<p class="text-muted text-sm">Aucune équipe de cette ligne produit dans le périmètre courant.</p>')
                    : velocityCardHtml({ velocityHistory, currentSprintEntry, target: piInfo?.velocityTarget || null, maxPoints: _veloMax })}
            </div>`;
}

/** Cartes d'anomalie : total, sparkline et tendance (baisse = mieux). */
export function anomalyCardsHtml(m) {
    const { seriesFor, totals } = m;

    // Cards avec sparkline + chip de tendance (delta vs jour précédent)
    const cardsHtml = ANOMALY_RULES.map(a => {
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
    return cardsHtml;
}

/** Lignes de la matrice : anomalies en heatmap, Σ, Confiance, base capacité, prévu / vélo / buffer. */
function _matrixRowsHtml(m) {
    const { teamsScope, matrix, sprintMetaByTeam, _showCapacity, targetPiNum, _lastAbsence, teamColor } = m;
    // Cellule matrice avec heatmap (intensité = count vs max global de l'anomalie)
    const maxByAnomaly = {};
    for (const a of ANOMALY_RULES) maxByAnomaly[a.key] = Math.max(1, ...teamsScope.map(t => matrix[t][a.key]));

    const matrixRowsHtml = teamsScope.map(tm => {
        const sumRow = ANOMALY_RULES.reduce((s, a) => s + matrix[tm][a.key], 0);
        const cells = ANOMALY_RULES.map(a => {
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

        // Cellule Vélocité / Buffer — has-val dès qu'un sprint est connu (même 0 pts)
        const cellMeta = sprintMetaByTeam[tm];

        // ✊ Confiance du PI (Fist of Five) — posée à côté du Σ des anomalies, car c'est
        // le même usage : repérer une équipe à risque d'un coup d'œil. Une squad sans
        // aucune anomalie mais peu confiante dans les objectifs mérite autant l'attention,
        // et ce signal-là ne sort d'aucune règle automatique — seule l'équipe le donne.
        // Moyenne sur TOUT le PI (pas le sprint) : c'est la portée du Fist of Five.
        // Cliquable dès que le PI a un sprint, MÊME sans aucun vote : une équipe qui n'a
        // pas voté est précisément celle qu'on veut emmener vers la saisie, et la modale
        // est la seule surface de vote. Un `has-val` conditionné aux votes fermerait la
        // porte à ceux qui en ont le plus besoin.
        const fistKeys = (cellMeta.piSprints || []).map(s => _spKey(s.name));
        const fistN    = voteCount('fist', tm, fistKeys);
        const fistCell = `<td class="health-cell health-fist-cell${fistKeys.length ? ' has-val' : ''}"
            data-metric="velocity" data-meta-id="${esc(tm)}"
            title="✊ Confiance dans les objectifs du PI — ${esc(tm)}${fistN ? '' : '\nAucun vote enregistré'}${fistKeys.length ? '\nCliquer pour ouvrir le détail et voter' : ''}">
            ${voteTotalHtml('fist', tm, fistKeys, `<span class="health-cell-zero" title="Aucun vote">${fistKeys.length ? '+ voter' : '—'}</span>`)}
        </td>`;
        // 🎯 Base capacité du PI visé : vélocité moyenne des 2 derniers PI, corrigée des
        // congés saisis sur la fenêtre. Point de départ du PI Planning, pas un engagement.
        const capBase = cellMeta.capBase;
        const capCell = !_showCapacity ? '' : (() => {
            if (!capBase) {
                return `<td class="health-cell health-capa-cell" title="${esc(`Base capacité — ${tm}\nAucune vélocité mesurée sur les PI précédents, ou aucun sprint connu pour le PI#${targetPiNum}`)}">
                    <span class="health-cell-zero">—</span></td>`;
            }
            const tip = _capacityTip(capBase, tm, targetPiNum, _lastAbsence);
            return `<td class="health-cell health-capa-cell has-val${capBase.capped ? ' health-capa-cell--capped' : ''}" title="${esc(tip)}">
                ${capBase.points}<span class="health-metric-unit">pts</span><span class="health-metric-count">−${Math.round(capBase.ratio * 100)} %${capBase.capped ? ' ⚠' : ''}</span>
            </td>`;
        })();

        const vPts = cellMeta.vPts, bPts = cellMeta.bPts;
        const hasSprint = !!cellMeta.spName || cellMeta.done.length > 0;
        const planTk = cellMeta.planTk, planPts = cellMeta.planPts;
        const bufPlanTk = cellMeta.bufPlanTk, bufPlanPts = cellMeta.bufPlanPts;
        const planSrc = (cellMeta.estimated != null && cellMeta.estimated > 0)
            ? '(vélocité = estimation JIRA au lancement)'
            : '(estimée depuis le périmètre courant du sprint)';

        const planCell = `<td class="health-cell health-metric-cell${hasSprint ? ' has-val' : ''} health-metric-cell--plan"
            data-metric="velocity" data-meta-id="${esc(tm)}"
            title="📋 Périmètre engagé au lancement — ${esc(tm)}${cellMeta.spName ? '\nSprint : ' + cellMeta.spName : ''}\nVélocité planifiée : ${planPts} pts\nTickets engagés : ${planTk}\n${planSrc} — cliquer pour le détail">
            ${hasSprint ? `${planPts}<span class="health-metric-unit">pts</span><span class="health-metric-count">${planTk} tk</span>` : '<span class="health-cell-zero">—</span>'}
        </td>`;

        const veloCell = `<td class="health-cell health-metric-cell${hasSprint ? ' has-val' : ''} health-metric-cell--velo"
            data-metric="velocity" data-meta-id="${esc(tm)}"
            title="⚡ Vélocité réalisée — ${esc(tm)}${cellMeta.spName ? '\nSprint : ' + cellMeta.spName : ''}${cellMeta.estimated != null ? '\nCharge prévue : ' + cellMeta.estimated + ' pts' : ''}\nDone : ${vPts} pts — cliquer pour le détail">
            ${hasSprint ? `${vPts}<span class="health-metric-unit">pts</span>` : '<span class="health-cell-zero">—</span>'}
        </td>`;

        const bufPlanCell = `<td class="health-cell health-metric-cell${hasSprint ? ' has-val' : ''} health-metric-cell--bufplan"
            data-metric="buffer" data-meta-id="${esc(tm)}"
            title="🛡 Buffer engagé au lancement — ${esc(tm)}${cellMeta.spName ? '\nSprint : ' + cellMeta.spName : ''}\nVélocité Buffer planifiée : ${bufPlanPts} pts\nTickets Buffer engagés : ${bufPlanTk} — cliquer pour le détail">
            ${hasSprint ? `${bufPlanPts}<span class="health-metric-unit">pts</span><span class="health-metric-count">${bufPlanTk} tk</span>` : '<span class="health-cell-zero">—</span>'}
        </td>`;

        const bufCell = `<td class="health-cell health-metric-cell${hasSprint ? ' has-val' : ''} health-metric-cell--buf"
            data-metric="buffer" data-meta-id="${esc(tm)}"
            title="🛡 Buffer réalisé — ${esc(tm)}${cellMeta.spName ? '\nSprint : ' + cellMeta.spName : ''}\nBuffer : ${bPts} pts — cliquer pour le détail">
            ${hasSprint ? `${bPts}<span class="health-metric-unit">pts</span>` : '<span class="health-cell-zero">—</span>'}
        </td>`;

        return `<tr>
            <th scope="row" class="health-team">
                <span class="health-team-swatch" style="background:${teamColor(tm)}">${esc(tm.slice(0, 2).toUpperCase())}</span>
                <span class="health-team-name">${esc(tm)}</span>
            </th>
            ${cells}
            <td class="health-row-total">${sumRow}</td>
            ${fistCell}
            ${capCell}
            ${planCell}
            ${veloCell}
            ${bufPlanCell}
            ${bufCell}
        </tr>`;
    }).join('');
    return matrixRowsHtml;
}

/** Matrice équipes × anomalies (+ métriques de sprint cliquables). */
export function matrixHtml(m) {
    const { _piColLabel, _showCapacity, targetPiNum, _sprintCtxLabel, _sprintCtxShort, teamsScope } = m;
    return `
            <div class="health-matrix-wrap">
                <h3 class="health-matrix-title">Matrice équipes × anomalies</h3>
                <table class="health-matrix">
                    <thead>
                        <tr>
                            <th class="health-team-col">Équipe</th>
                            ${ANOMALY_RULES.map(a => `<th class="health-anomaly-col" title="${esc(a.desc)}">
                                <span class="health-anomaly-icon">${a.icon}</span>
                                <span class="health-anomaly-label">${esc(a.label)}</span>
                            </th>`).join('')}
                            <th class="health-row-total-col">Σ</th>
                            <th class="health-metric-col health-fist-col" title="✊ Fist of Five — confiance de chaque équipe dans l'atteinte des objectifs du PI, moyenne de tous ses votes du PI (cliquer une cellule pour ouvrir le détail et voter)">✊ Confiance${_piColLabel ? `<span class="health-metric-sub">${esc(_piColLabel)}</span>` : ''}</th>
                            ${_showCapacity ? `<th class="health-metric-col health-capa-col" title="${esc(`🎯 Base capacité — repère de PI Planning pour le PI#${targetPiNum}.
Vélocité moyenne par sprint des 2 derniers PI × nombre de sprints du PI, moins le taux d'absence déduit des congés saisis sur la période.
C'est un point de départ chiffré, pas un engagement : la « Charge prévue » de la modale reste éditable.`)}">🎯 Base capacité<span class="health-metric-sub">${esc(_piColLabel)}</span></th>` : ''}
                            <th class="health-metric-col health-metric-col--plan" title="Périmètre engagé au lancement du ${esc(_sprintCtxLabel)} : nb de tickets + vélocité planifiée (estimation JIRA au démarrage)">📋 Prévu<span class="health-metric-sub">${esc(_sprintCtxShort)}</span></th>
                            <th class="health-metric-col health-metric-col--velo" title="Points Done du ${esc(_sprintCtxLabel)} de chaque équipe (cliquer pour voir les tickets)">⚡ Vélo.<span class="health-metric-sub">${esc(_sprintCtxShort)}</span></th>
                            <th class="health-metric-col health-metric-col--bufplan" title="Buffer engagé au lancement du ${esc(_sprintCtxLabel)} : nb de tickets Buffer + vélocité Buffer planifiée">🛡 Buf. prévu<span class="health-metric-sub">${esc(_sprintCtxShort)}</span></th>
                            <th class="health-metric-col health-metric-col--buf"  title="Points Done avec label Buffer du ${esc(_sprintCtxLabel)} (cliquer pour voir les tickets)">🛡 Buffer<span class="health-metric-sub">${esc(_sprintCtxShort)}</span></th>
                        </tr>
                    </thead>
                    <tbody>${_matrixRowsHtml(m)}</tbody>
                </table>
                ${teamsScope.length === 0 ? '<p class="text-muted text-sm text-center p-4">Aucune équipe dans le périmètre.</p>' : ''}
            </div>`;
}
