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
import { esc, filterByTeam, sumBy, computeCapacityNextPI, getCurrentPi, extractPiNum, toast, hashColor } from '../utils.js';
import * as api from '../api.js';
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

// Stockage module-level des métadonnées sprint — peuplé à chaque render, lu sans closure
const _sprintMetaStore = new Map();

// Helpers et données partagés entre renderHealth et _openSprintModal (module-level)
let _lastMoodVotes   = [];
let _lastTeamObjects = [];
const _spKey  = name => { const m = String(name||'').match(/(\d+\.\d+)/); return m ? m[1] : ''; };
const _face   = n => ({ 1:'😞', 2:'😕', 3:'😐', 4:'🙂', 5:'😄' }[Math.round(n)] || '—');
const _fmtD   = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) : '—';
const _stateL = s => ({ active:'🟢 En cours', closed:'✅ Terminé', future:'🔜 À venir' }[s] || s || '—');

// Badge état coloré pour le tableau sprints : bleu=en cours, vert=clos/terminé, gris=à venir
function _stateBadge(state) {
    const map = {
        active: { cls: 'htl-state--active', label: '🔵 En cours' },
        closed: { cls: 'htl-state--closed', label: '✅ Terminé'  },
        future: { cls: 'htl-state--future', label: '⚪ À venir'   },
    };
    const m = map[state] || { cls: 'htl-state--future', label: state || '—' };
    return `<span class="htl-state ${m.cls}">${m.label}</span>`;
}

// Construit la cellule mood (moyenne + nb votes + tooltip distribution) pour un sprint.
// Lit _lastMoodVotes (rafraîchi à chaque render + après un vote).
function _moodCellHtml(team, sprintKey) {
    const moods = _lastMoodVotes
        .filter(v => v.team === team && v.piSprint === sprintKey)
        .map(v => parseInt(v.value) || 0).filter(Boolean);
    const n = moods.length;
    const avg = n ? Math.round((moods.reduce((a, b) => a + b, 0) / n) * 10) / 10 : null;
    const attrs = `data-mood-editable data-sprint-key="${esc(sprintKey)}" data-team="${esc(team)}"`;
    if (!n) {
        return `<span class="htl-mood-empty htl-muted" ${attrs} title="Aucun vote pour le sprint ${esc(sprintKey)} — cliquer pour voter">+ voter</span>`;
    }
    const dist = [1, 2, 3, 4, 5].map(v => moods.filter(m => m === v).length);
    const tip = `Mood ${team} · sprint ${sprintKey}\nMoyenne ${avg}/5 · ${n} vote${n > 1 ? 's' : ''}\n`
        + [5, 4, 3, 2, 1].map(v => `${_face(v)} ${v} : ${dist[v - 1]}`).join('\n')
        + `\n\nCliquer pour voter`;
    const cls = avg >= 4 ? 'htl-mood--good' : avg >= 3 ? 'htl-mood--ok' : 'htl-mood--bad';
    return `<span class="htl-mood-val ${cls}" ${attrs} title="${esc(tip)}">${_face(avg)} ${avg} <span class="htl-mood-count">(${n})</span></span>`;
}

const SEV_COLOR = { danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' };
const SEV_BG    = {
    danger:  'color-mix(in srgb, var(--danger) 12%, transparent)',
    warning: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    info:    'color-mix(in srgb, var(--info) 10%, transparent)',
};

export function renderHealth(container) {
    const allTickets  = store.get('tickets')   || [];
    const allTeams    = store.get('teams')     || [];
    const teamObjects = store.get('teamObjects') || [];
    const sprintInfo  = store.get('sprintInfo') || {};
    const teamFilter  = store.get('team');
    const groupId     = store.get('group');
    const groups      = store.get('groups')    || [];
    const absences    = store.get('absences')  || [];
    const piInfo      = store.get('piInfo');
    const piOffset    = store.get('piOffset')  || 0;
    const currentPiNum = getCurrentPi({ sprintInfo, piInfo });
    const targetPiNum  = currentPiNum ? currentPiNum + piOffset : 0;
    // Contexte du sprint mesuré par les colonnes Vélo/Buffer (dépend du sélecteur PI)
    const _sprintCtxLabel = piOffset === 0
        ? 'sprint courant'
        : `dernier sprint du PI#${targetPiNum}`;
    const _sprintCtxShort = piOffset === 0 ? 'sprint courant' : `PI#${targetPiNum}`;

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

    // Filtre PI : si offset ≠ 0, on ne garde que les tickets du PI cible
    const piTickets = (piOffset !== 0 && targetPiNum)
        ? allTickets.filter(t => extractPiNum(t.sprintName || t.sprint_name || '') === targetPiNum)
        : allTickets;

    const matrix = {}; // matrix[team][anomalyKey] = count
    const totals = {}; // totals[anomalyKey] = sum across teams
    for (const a of ANOMALIES) totals[a.key] = 0;
    for (const tm of teamsScope) {
        matrix[tm] = {};
        const tickets = piTickets.filter(t => t.team === tm);
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

    // ── Vélocité et buffer réalisés par équipe ────────────────────────────────
    _sprintMetaStore.clear();
    const moodVotes   = store.get('moodVotes') || [];
    _lastMoodVotes    = moodVotes;
    _lastTeamObjects  = teamObjects;

    const veloByTeam = {}, bufByTeam = {}, sprintMetaByTeam = {};
    for (const tm of teamsScope) {
        const ts = (sprintInfo.teamSprints || []).filter(s => s.team === tm);
        // Sprint de référence : actif ou dernier fermé (du PI cible si offset)
        let ref;
        if (piOffset === 0 || !targetPiNum) {
            ref = ts.find(s => s.state === 'active')
               || ts.slice().sort((a, b) => (b.endDate||'').localeCompare(a.endDate||''))[0];
        } else {
            ref = ts.filter(s => extractPiNum(s.name||'') === targetPiNum)
                    .sort((a, b) => (b.endDate||'').localeCompare(a.endDate||''))[0];
        }

        // Tickets Done de l'équipe dans le périmètre PI courant
        const spName    = ref?.name || '';
        const spTickets = spName
            ? piTickets.filter(t => t.team === tm && (t.sprintName === spName || t.sprint_name === spName))
            : piTickets.filter(t => t.team === tm);
        const done    = spTickets.filter(t => t.status === 'done');
        const bufDone = done.filter(t => (t.labels||[]).some(l => /^buffer$/i.test(l)));

        // Vélocité : JIRA > calculé depuis tickets Done
        const vPts = ref?.velocity     != null ? ref.velocity     : done.reduce((s, t) => s + (t.points||0), 0);
        const bPts = ref?.bufferPoints != null ? ref.bufferPoints : bufDone.reduce((s, t) => s + (t.points||0), 0);

        // Mood du sprint (piSprint = "29.3" extrait du nom de sprint)
        const spKey   = _spKey(spName);
        const moods   = moodVotes.filter(v => v.team === tm && (!spKey || v.piSprint === spKey)).map(v => parseInt(v.value)||0).filter(Boolean);
        const avgMood = moods.length ? Math.round((moods.reduce((a,b)=>a+b,0)/moods.length)*10)/10 : null;

        // Tous les sprints du PI pour ce team (tableau PI)
        const piSprints = ts
            .filter(s => !targetPiNum || extractPiNum(s.name||'') === targetPiNum)
            .sort((a, b) => (a.startDate||'').localeCompare(b.startDate||''));

        // Tickets Done / Buffer Done par sprint (pour le clic sur les cellules Vélo/Buffer).
        // Matching tolérant : nom exact OU même clé de sprint NN.N (ex: "Team G - Ité 29.3"
        // ↔ "GCOM 29.3" → "29.3"), car le nom du sprint JIRA et celui porté par les tickets
        // peuvent différer légèrement.
        const sprintTickets = {};
        for (const sp of piSprints) {
            const spk  = _spKey(sp.name);
            const spTk = piTickets.filter(t => {
                if (t.team !== tm) return false;
                const tn = t.sprintName || t.sprint_name || '';
                return tn === sp.name || (spk && _spKey(tn) === spk);
            });
            const spDone = spTk.filter(t => t.status === 'done');
            sprintTickets[sp.name] = {
                done:    spDone,
                bufDone: spDone.filter(t => (t.labels||[]).some(l => /^buffer$/i.test(l))),
            };
        }

        const tObj = teamObjects.find(o => o.name === tm);
        const teamColor = tObj?.color || TEAM_COLORS[allTeams.indexOf(tm) % TEAM_COLORS.length] || '#6366f1';

        const metaObj = {
            ref,
            done, bufDone,
            spName, spKey,
            vPts, bPts,
            estimated:    ref?.estimated    ?? null,
            velocity:     ref?.velocity     ?? null,
            bufferPoints: ref?.bufferPoints ?? null,
            startDate:    ref?.startDate    ?? null,
            endDate:      ref?.endDate      ?? null,
            state:        ref?.state        ?? null,
            avgMood, moods,
            piSprints, teamColor, sprintTickets,
            piNum: targetPiNum || currentPiNum,
        };
        veloByTeam[tm]       = { pts: vPts, sprint: spName, estimated: ref?.estimated, startDate: ref?.startDate, endDate: ref?.endDate, state: ref?.state };
        bufByTeam[tm]        = { pts: bPts, sprint: spName };
        sprintMetaByTeam[tm] = metaObj;
        _sprintMetaStore.set(tm, metaObj);  // accessible sans closure dans le handler
    }

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

        // Cellule Vélocité / Buffer — has-val dès qu'un sprint est connu (même 0 pts)
        const cellMeta = sprintMetaByTeam[tm];
        const vPts = cellMeta.vPts, bPts = cellMeta.bPts;
        const hasSprint = !!cellMeta.spName || cellMeta.done.length > 0;
        const veloCell = `<td class="health-cell health-metric-cell${hasSprint ? ' has-val' : ''} health-metric-cell--velo"
            data-metric="velocity" data-meta-id="${esc(tm)}"
            title="⚡ Vélocité réalisée — ${esc(tm)}${cellMeta.spName ? '\nSprint : ' + cellMeta.spName : ''}${cellMeta.estimated != null ? '\nCharge prévue : ' + cellMeta.estimated + ' pts' : ''}\nDone : ${vPts} pts — cliquer pour le détail">
            ${hasSprint ? `${vPts}<span class="health-metric-unit">pts</span>` : '<span class="health-cell-zero">—</span>'}
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
            ${veloCell}
            ${bufCell}
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
                            <th class="health-metric-col health-metric-col--velo" title="Points Done du ${esc(_sprintCtxLabel)} de chaque équipe (cliquer pour voir les tickets)">⚡ Vélo.<span class="health-metric-sub">${esc(_sprintCtxShort)}</span></th>
                            <th class="health-metric-col health-metric-col--buf"  title="Points Done avec label Buffer du ${esc(_sprintCtxLabel)} (cliquer pour voir les tickets)">🛡 Buffer<span class="health-metric-sub">${esc(_sprintCtxShort)}</span></th>
                        </tr>
                    </thead>
                    <tbody>${matrixRowsHtml}</tbody>
                </table>
                ${teamsScope.length === 0 ? '<p class="text-muted text-sm text-center p-4">Aucune équipe dans le périmètre.</p>' : ''}
            </div>
        </div>
    `;

    // Un seul listener à la fois : on remplace l'ancien pour éviter les stale closures
    if (container._healthClick) container.removeEventListener('click', container._healthClick);
    container._healthClick = e => {
        const card = e.target.closest('.health-card');
        if (card?.dataset.anomaly) { openAlertModal(card.dataset.anomaly); return; }

        // Clic colonne Vélocité / Buffer → modal sprint détaillé
        const metricCell = e.target.closest('.health-metric-cell.has-val');
        if (metricCell?.dataset.metaId) {
            const tm     = metricCell.dataset.metaId;
            const metric = metricCell.dataset.metric;
            const meta   = _sprintMetaStore.get(tm);   // Map module-level, toujours à jour
            _openSprintModal(meta, tm, metric);
            return;
        }

        const cell = e.target.closest('.health-cell.has-val');
        if (cell?.dataset.anomaly) {
            const tm = cell.dataset.team;
            if (tm) { store.set('group', null); store.set('team', tm); }
            setTimeout(() => openAlertModal(cell.dataset.anomaly), 60);
        }
    };
    container.addEventListener('click', container._healthClick);
}

// Réouverture depuis le hash (refresh / lien partagé) : lit _sprintMetaStore peuplé par renderHealth.
export function reopenSprintModalFromHash(team, metric) {
    const meta = _sprintMetaStore.get(team);
    if (meta) _openSprintModal(meta, team, metric);
}

// Découverte (mise en cache) du champ Story Points JIRA — pour le lazy-fetch des sprints clos.
let _spFieldCache = null;
async function _discoverSpField() {
    if (_spFieldCache !== null) return _spFieldCache;
    try {
        const fields = await api.jiraGet('rest/api/3/field');
        const sp = (fields || []).find(f => f.custom && /story point/i.test(f.name || ''));
        _spFieldCache = sp?.id || '';
    } catch { _spFieldCache = ''; }
    return _spFieldCache;
}

// Récupère les issues d'un sprint JIRA (sprints clos non synchronisés localement).
// Retourne des objets ticket simplifiés {id,title,status,points,leader,labels,epic}.
async function _fetchSprintIssuesFromJira(jiraId) {
    const spField = await _discoverSpField();
    const fieldList = `summary,status,assignee,labels,parent${spField ? ',' + spField : ''}`;
    const out = [];
    let startAt = 0;
    while (true) {
        const r = await api.jiraGet(`rest/agile/1.0/sprint/${jiraId}/issue`, { startAt, maxResults: 50, fields: fieldList });
        const issues = r?.issues || [];
        for (const it of issues) {
            const f = it.fields || {};
            out.push({
                id: it.key,
                title: f.summary || '',
                status: f.status?.statusCategory?.key === 'done' ? 'done' : 'other',
                points: spField ? (Number(f[spField]) || 0) : 0,
                leader: f.assignee?.displayName || '',
                labels: f.labels || [],
                epic: f.parent?.key || '',
            });
        }
        if (issues.length < 50 || r?.isLast) break;
        startAt += issues.length;
        if (startAt > 300) break; // garde-fou
    }
    return out;
}

// ── Modal sprint détaillé (vélocité / buffer) ─────────────────────────────────
function _openSprintModal(meta, teamName, metric) {
    if (!meta) return;
    document.getElementById('health-sprint-modal')?.remove();

    const isVelo  = metric === 'velocity';
    const icon    = isVelo ? '⚡' : '🛡';
    const label   = isVelo ? 'Vélocité réalisée' : 'Buffer réalisé';
    const color   = meta.teamColor || '#6366f1';
    const initials = teamName.slice(0, 2).toUpperCase();
    const piLabel  = meta.piNum ? `PI#${meta.piNum}` : '';

    // ── Tableau des sprints du PI ────────────────────────────────────────────
    const sprintRows = (meta.piSprints || []).map(s => {
        const sk    = _spKey(s.name);
        const moodHtml   = _moodCellHtml(teamName, sk);
        const isRef = s.name === meta.spName;
        const est        = s.estimated    != null ? s.estimated    : '—';
        const chargeKey  = `sb-charge-${s.name}`;
        const chargeSaved = localStorage.getItem(chargeKey);
        const chargeVal  = chargeSaved != null ? chargeSaved : (s.estimated != null ? String(s.estimated) : '');
        // Cellules Vélo/Buffer cliquables → section tickets en bas.
        // COHÉRENCE : « réalisé » = somme des Story Points des tickets Done locaux quand on les a
        // (= total affiché dans la section). Fallback sur la vélocité JIRA (greenhopper) sinon.
        const spT = meta.sprintTickets?.[s.name] || { done: [], bufDone: [] };
        const vel = spT.done.length
            ? spT.done.reduce((a, t) => a + (t.points || 0), 0)
            : (s.velocity != null ? s.velocity : '—');
        const buf = spT.bufDone.length
            ? spT.bufDone.reduce((a, t) => a + (t.points || 0), 0)
            : (s.bufferPoints != null ? s.bufferPoints : '—');
        const veloClickable = vel !== '—' || spT.done.length > 0;
        const bufClickable  = buf !== '—' || spT.bufDone.length > 0;
        const veloAttr = veloClickable ? ` htl-cell-clickable" data-sp-tickets="${esc(s.name)}" data-sp-metric="velocity` : '';
        const bufAttr  = bufClickable  ? ` htl-cell-clickable" data-sp-tickets="${esc(s.name)}" data-sp-metric="buffer`   : '';
        return `<tr class="${isRef ? 'htl-sprint-row--ref' : ''}">
            <td class="htl-spr-name">${isRef ? `<strong>${esc(s.name)}</strong>` : esc(s.name)}</td>
            <td class="htl-spr-date">${_fmtD(s.startDate)}</td>
            <td class="htl-spr-state">${_stateBadge(s.state)}</td>
            <td class="htl-spr-mood">${moodHtml}</td>
            <td class="htl-spr-num">${est}</td>
            <td class="htl-spr-num"><input class="htl-charge-input" type="number" min="0" value="${esc(chargeVal)}" data-charge-key="${esc(chargeKey)}" title="Charge prévue — éditable (PI Planning)"></td>
            <td class="htl-spr-num htl-velo-col${veloAttr}"${veloClickable ? ' title="Voir les tickets Done de ce sprint"' : ''}>${vel}</td>
            <td class="htl-spr-num htl-buf-col${bufAttr}"${bufClickable ? ' title="Voir les tickets Buffer de ce sprint"' : ''}>${buf}</td>
        </tr>`;
    }).join('');

    // ── Section tickets (re-render au clic sur une cellule Vélo/Buffer) ───────
    // Index id → titre du parent : le parent (t.epic) peut être un epic, une feature
    // ou un ticket selon la hiérarchie JIRA → on cherche dans les 3 collections.
    const _parentTitleById = new Map();
    for (const e of (store.get('epics') || []))    _parentTitleById.set(e.id, e.title);
    for (const f of (store.get('features') || [])) _parentTitleById.set(f.id, f.title);
    for (const tk of (store.get('tickets') || [])) if (!_parentTitleById.has(tk.id)) _parentTitleById.set(tk.id, tk.title);

    // Tickets d'un sprint pour une métrique (done | bufDone), avec fallback sprint de réf.
    const _ticketsFor = (sprintName, veloFlag) => {
        const bucket = meta.sprintTickets?.[sprintName];
        if (bucket) return veloFlag ? bucket.done : bucket.bufDone;
        if (sprintName === meta.spName) return veloFlag ? meta.done : meta.bufDone;
        return [];
    };

    const _ticketRowsHtml = (list, veloFlag) => list.length
        ? list.map(t => {
            const who = t.leader || t.assignee || '';
            const isBuf = (t.labels || []).some(l => /^buffer$/i.test(l));
            const parentKey   = t.epic ? String(t.epic) : '';
            const parentTitle = parentKey ? (_parentTitleById.get(parentKey) || '') : '';
            const parentLabel = parentTitle
                ? `${parentKey} — ${parentTitle.length > 26 ? parentTitle.slice(0, 25) + '…' : parentTitle}`
                : parentKey;
            const parentChip = parentKey
                ? `<span class="htl-parent-chip" style="--pc:${hashColor(parentKey)}" data-open-ticket="${esc(parentKey)}" title="Parent : ${esc(parentKey)}${parentTitle ? ' — ' + esc(parentTitle) : ''} — cliquer pour voir le détail">${esc(parentLabel)}</span>`
                : '<span class="htl-muted">—</span>';
            return `<tr class="htl-ticket-row" data-open-ticket="${esc(t.id || '')}" title="Voir le détail du ticket">
            <td class="htl-id">${esc(t.id || '—')}</td>
            <td class="htl-title">${esc(t.title || '')}</td>
            <td class="htl-parent">${parentChip}</td>
            <td class="htl-buf-flag">${isBuf ? '<span title="Ticket Buffer">🛡️</span>' : ''}</td>
            <td class="htl-pts">${t.points ? `<span class="htl-pts-chip">${t.points}</span>` : '<span class="htl-muted">—</span>'}</td>
            <td class="htl-who">${who ? esc(who) : '<span class="htl-muted">—</span>'}</td>
          </tr>`;
        }).join('')
        : `<tr><td colspan="6" class="text-muted text-center" style="padding:16px">Aucun ticket ${veloFlag ? 'Done' : 'Buffer Done'}</td></tr>`;

    // Contenu de la section tickets pour un sprint + métrique donnés
    const _ticketsSection = (sprintName, veloFlag) => {
        const list = _ticketsFor(sprintName, veloFlag);
        const tot  = list.reduce((s, t) => s + (t.points || 0), 0);
        return `
            <div class="htl-tickets-hdr">
                <span class="htl-tickets-hdr-title">${veloFlag ? '⚡ Tickets Done' : '🛡 Buffer Done'}</span>
                ${sprintName ? `<span class="htl-tickets-hdr-sprint">${esc(sprintName)}</span>` : ''}
                <span class="htl-tickets-hdr-badge">${list.length} ticket${list.length !== 1 ? 's' : ''} · ${tot} pts</span>
            </div>
            <table class="htl-table">
                <thead><tr>
                    <th>ID</th><th>Titre</th><th>Parent</th>
                    <th title="Ticket Buffer">🛡️</th><th>Pts</th><th>Responsable</th>
                </tr></thead>
                <tbody>${_ticketRowsHtml(list, veloFlag)}</tbody>
                ${list.length ? `<tfoot><tr>
                    <td colspan="4" class="htl-total-lbl">Total</td>
                    <td class="htl-total-val">${tot}</td>
                    <td></td>
                </tr></tfoot>` : ''}
            </table>`;
    };

    const overlay = document.createElement('div');
    overlay.id = 'health-sprint-modal';
    overlay.className = 'modal-overlay alert-modal-overlay';
    overlay.innerHTML = `
        <div class="modal htl-modal">
            <div class="htl-modal-hdr" style="border-top:4px solid ${esc(color)}">
                <div class="htl-modal-hdr-left">
                    <div class="htl-modal-swatch" style="background:${esc(color)}">${esc(initials)}</div>
                    <div class="htl-modal-hdr-text">
                        <div class="htl-modal-hdr-title">${icon} ${esc(label)}</div>
                        <div class="htl-modal-hdr-sub">${esc(teamName)}${piLabel ? ` · ${esc(piLabel)}` : ''}${meta.piSprints?.length ? ` · ${meta.piSprints.length} sprint${meta.piSprints.length>1?'s':''}` : ''}</div>
                    </div>
                </div>
                <button class="btn-icon modal-close htl-modal-close" aria-label="Fermer">
                    <svg class="icon"><use href="#i-x"/></svg>
                </button>
            </div>
            <div class="modal-body htl-modal-body">
                <div class="htl-section-lbl">Sprints du PI</div>
                <div class="htl-sprint-table-wrap">
                    <table class="htl-sprint-table">
                        <thead><tr>
                            <th>Sprint</th>
                            <th>Début</th>
                            <th>État</th>
                            <th title="Mood moyen — cliquer pour voter">Mood</th>
                            <th class="htl-th-num" title="Capacité estimée (JIRA estimated)">Capa. estimée</th>
                            <th class="htl-th-num" title="Charge positionnée lors du PI Planning — éditable">Charge prévue ✏️</th>
                            <th class="htl-th-num htl-velo-col" title="Vélocité réalisée (Done SP)">⚡ Vélo. réalisée</th>
                            <th class="htl-th-num htl-buf-col" title="Points Buffer consommés">🛡 Buffer réalisé</th>
                        </tr></thead>
                        <tbody>${sprintRows || '<tr><td colspan="8" class="htl-muted text-center" style="padding:12px">Aucun sprint trouvé pour ce PI</td></tr>'}</tbody>
                    </table>
                </div>
                <div class="htl-section-lbl htl-tickets-hint">Détail des tickets — clique une cellule ⚡ Vélo. ou 🛡 Buffer ci-dessus</div>
                <div class="htl-tickets-section" id="htl-tickets-host">${_ticketsSection(meta.spName, isVelo)}</div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // ── Hash routing : reflète l'ouverture dans l'URL (back-button + partage) ─
    // On empile une entrée d'historique avec le marqueur ~sprint=<metric>:<team>.
    // On retire d'abord tout marqueur existant pour ne jamais le doubler.
    // (Au refresh, pushHash a déjà recréé une entrée propre dessous → back() ne quitte pas l'app.)
    const _base = (location.hash || '#').replace(/~sprint=[^~]*/g, '') || '#';
    history.pushState({ healthSprint: true }, '',
        _base + '~sprint=' + encodeURIComponent(`${metric}:${teamName}`));

    // ── Charge prévue éditable (localStorage) ───────────────────────────────
    overlay.querySelectorAll('.htl-charge-input').forEach(input => {
        input.addEventListener('change', () => {
            const v = input.value.trim();
            if (v === '' || isNaN(Number(v))) return;
            localStorage.setItem(input.dataset.chargeKey, v);
        });
    });

    // ── Clic cellule Vélo/Buffer d'un sprint → met à jour la section tickets ──
    // Les sprints clos ne sont pas synchronisés localement → lazy-fetch depuis JIRA.
    overlay.addEventListener('click', async e => {
        const cell = e.target.closest('[data-sp-tickets]');
        if (!cell) return;
        const host = overlay.querySelector('#htl-tickets-host');
        if (!host) return;
        const sprintName = cell.dataset.spTickets;
        const veloFlag   = cell.dataset.spMetric === 'velocity';
        overlay.querySelectorAll('.htl-cell-active').forEach(c => c.classList.remove('htl-cell-active'));
        cell.classList.add('htl-cell-active');

        // Tickets locaux dispo → affichage direct
        if (_ticketsFor(sprintName, veloFlag).length) {
            host.innerHTML = _ticketsSection(sprintName, veloFlag);
            host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Sinon : lazy-fetch depuis JIRA via le jiraId du sprint
        const sp = (meta.piSprints || []).find(s => s.name === sprintName);
        if (!sp?.jiraId) {
            host.innerHTML = _ticketsSection(sprintName, veloFlag); // "Aucun ticket"
            host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        host.innerHTML = `<div class="htl-loading">⏳ Chargement des tickets du sprint depuis JIRA…</div>`;
        host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        try {
            const fetched = await _fetchSprintIssuesFromJira(sp.jiraId);
            const done = fetched.filter(t => t.status === 'done');
            meta.sprintTickets = meta.sprintTickets || {};
            meta.sprintTickets[sprintName] = {
                done,
                bufDone: done.filter(t => (t.labels || []).some(l => /^buffer$/i.test(l))),
            };
            host.innerHTML = _ticketsSection(sprintName, veloFlag);
        } catch {
            host.innerHTML = `<div class="htl-loading htl-muted">Impossible de récupérer les tickets de ce sprint (JIRA indisponible ou non configuré).</div>`;
        }
    });

    // ── Liens ticket → modal de détail (délégué : gère les lignes re-rendues) ─
    // Même pattern qu'alert_modal : on force le modal détail au-dessus via .above-demo.
    overlay.addEventListener('click', e => {
        const el = e.target.closest('[data-open-ticket]');
        if (!el) return;
        e.stopPropagation();
        const id = el.dataset.openTicket;
        if (!id) return;
        const mo = document.getElementById('modal-overlay');
        if (mo) mo.classList.add('above-demo');
        window.__squadBoard?.openTicketModal?.(id);
    });

    // ── Mood éditable : picker inline au clic ────────────────────────────────
    const EMOJIS = ['😞','😕','😐','🙂','😄'];
    overlay.addEventListener('click', e => {
        const target = e.target.closest('[data-mood-editable]');
        if (!target) return;
        e.stopPropagation();
        // Ferme un picker déjà ouvert
        overlay.querySelector('.htl-mood-picker')?.remove();
        const sprintKey = target.dataset.sprintKey;
        const moodTeam  = target.dataset.team;
        const picker = document.createElement('div');
        picker.className = 'htl-mood-picker';
        picker.innerHTML = EMOJIS.map((em, i) =>
            `<button class="htl-mood-btn" data-val="${i+1}" title="${i+1}/5">${em}</button>`
        ).join('');
        target.parentNode.appendChild(picker);
        picker.querySelectorAll('.htl-mood-btn').forEach(btn => {
            btn.addEventListener('click', async ev => {
                ev.stopPropagation();
                const val = parseInt(btn.dataset.val, 10);   // backend exige un entier
                picker.remove();
                try {
                    await api.createMood({ type: 'mood', team: moodTeam, piSprint: sprintKey, value: val });
                    // Maj du store local + recalcul moyenne/nb votes
                    const votes = (store.get('moodVotes') || []).concat({ type: 'mood', team: moodTeam, piSprint: sprintKey, value: val });
                    store.set('moodVotes', votes);
                    _lastMoodVotes = votes;
                    // Remplace la cellule par sa version recalculée (moyenne + nb votes + tooltip)
                    const td = target.closest('.htl-spr-mood');
                    if (td) td.innerHTML = _moodCellHtml(moodTeam, sprintKey);
                    toast?.('Vote enregistré', 'success');
                } catch { toast?.('Erreur lors du vote mood', 'error'); }
            });
        });
        // Fermer le picker au clic ailleurs
        const onOut = ev => { if (!picker.contains(ev.target) && ev.target !== target) { picker.remove(); document.removeEventListener('click', onOut, true); } };
        setTimeout(() => document.addEventListener('click', onOut, true), 0);
    });
    // Fermeture initiée par l'utilisateur → history.back() : le popstate (géré par app.js)
    // re-route, retire le marqueur et ferme la modale. Le bouton « Précédent » fait pareil.
    const _userClose = () => {
        if (location.hash.includes('~sprint=')) history.back();
        else _closeSprintModal();
    };
    overlay.addEventListener('click', e => {
        if (e.target === overlay || e.target.closest('.modal-close')) _userClose();
    });
    document.addEventListener('keydown', function onK(ev) {
        if (ev.key === 'Escape' && document.getElementById('health-sprint-modal')) {
            _userClose();
            document.removeEventListener('keydown', onK);
        }
    });
}

// Retire la modale sprint du DOM (sans toucher à l'historique).
function _closeSprintModal() {
    const ov = document.getElementById('health-sprint-modal');
    if (!ov) return;
    ov.classList.remove('visible');
    ov.addEventListener('transitionend', () => ov.remove(), { once: true });
    setTimeout(() => ov.remove(), 300); // filet de sécurité si transitionend ne se déclenche pas
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
