/**
 * Reports view - 7 sections, rich Slack/Confluence visual preview.
 */

import { store } from '../state.js';
import { esc, filterByTeam, sumBy, pct, groupBy, fmtDate, toast } from '../utils.js';
import { STATUS_LABELS, TYPE_LABELS } from '../config.js';
import { renderPIVelocityChart, renderStatusChart, renderTypeChart, renderBurndown, renderBurnup, renderCycleTime, renderWIPAge } from '../components/charts.js';
import { FIST_SCALE, slackToEmoji, buildMoodSlackRaw, buildFistSlackRaw } from '../components/sondage.js';
import * as api from '../api.js';

let _format = 'text';
let _chartsCollapsed = localStorage.getItem('sb-rpt-charts-collapsed') === 'true';

export function renderReports(container) {
    const team = store.get('team');
    const tickets = filterByTeam(store.get('tickets') || [], team);
    // Features filtrées par équipe (champ team = Team[Team] JIRA). 'all' sans groupe → vue globale.
    const features = filterByTeam(store.get('features') || [], team);
    const sprintInfo = store.get('sprintInfo');
    const teams = store.get('teams') || [];
    const piInfo = store.get('piInfo');
    const absences = store.get('absences') || [];
    const support = store.get('support') || [];

    const total = tickets.length;
    const done = tickets.filter(t => t.status === 'done').length;
    const totalPts = sumBy(tickets, t => t.points);
    const donePts = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const statusCounts = {};
    for (const t of tickets) statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

    const _piNum      = piInfo?.number || '';
    const _sprintsCnt = piInfo?.sprintsPerPI || 5;
    const _piLabels   = _piNum ? Array.from({ length: _sprintsCnt }, (_, i) => `${_piNum}.${i + 1}`) : [];
    const _curPiSprint = _parseSprintName(sprintInfo?.name || '').piSprint;
    const allTickets   = store.get('tickets') || [];
    const _tPiSprint   = t => {
        const fromName = _parseSprintName(t.sprintName || '').piSprint;
        if (fromName) return fromName;
        return t.piSprint && /^\d+\.\d+$/.test(String(t.piSprint)) ? String(t.piSprint) : null;
    };
    const _isBuffer    = t => (t.labels || []).some(l => /buffer/i.test(l));
    const _storedVel   = piInfo?.sprintVelocities || [];
    const _teamKey     = team === 'all' ? 'all' : team;

    const piVelocityData = _piLabels.map(lbl => {
        const isCurrent = lbl === _curPiSprint;
        const liveBase  = team === 'all'
            ? allTickets.filter(t => _tPiSprint(t) === lbl)
            : allTickets.filter(t => _tPiSprint(t) === lbl && t.team === team);
        const liveEst  = sumBy(liveBase, t => t.points);
        const liveBuf  = sumBy(liveBase.filter(_isBuffer), t => t.points);
        const liveReal = sumBy(liveBase.filter(t => t.status === 'done'), t => t.points);

        if (isCurrent) {
            return { label: lbl, estimated: liveEst, buffer: liveBuf, realized: liveReal, isCurrent: true, isLive: true };
        }
        // Sprints passés : données stockées en priorité, sinon données live si tickets toujours présents
        const stored = _storedVel.find(v => v.sprint === lbl && v.team === _teamKey);
        if (stored) {
            return { label: lbl, estimated: stored.estimated || 0, buffer: stored.buffer || 0, realized: stored.realized || 0, isCurrent: false };
        }
        return { label: lbl, estimated: liveEst, buffer: liveBuf, realized: liveReal, isCurrent: false };
    });

    const typeCounts  = {};
    for (const t of tickets) typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
    const sprintCtx   = { startDate: sprintInfo?.startDate || new Date(Date.now() - 8 * 86400000).toISOString(), durationDays: sprintInfo?.durationDays || 14 };
    const events      = store.get('events') || [];
    const blocked     = tickets.filter(t => t.status === 'blocked').length;
    const bufferPts   = sumBy(tickets.filter(_isBuffer), t => t.points);
    const bufPct      = pct(bufferPts, totalPts);
    const daysLeft    = sprintInfo?.endDate ? Math.max(0, Math.round((new Date(sprintInfo.endDate) - Date.now()) / 86_400_000)) : null;

    const ctx = { tickets, features, sprintInfo, teams, team, piInfo, absences, support, statusCounts, total, done, totalPts, donePts };
    const dLeft = _dLeft(sprintInfo?.endDate);

    const sections = [
        { id: 'sprint', title: 'Sprint' },
        { id: 'kanban', title: 'Kanban / Flow' },
        { id: 'support', title: 'Support' },
        { id: 'roadmap', title: 'Roadmap / PI' },
        { id: 'epicburn', title: 'Epic Burndown',     noExport: true },
        { id: 'sondage',  title: 'Mood Meter / ROTI', noExport: true },
        { id: 'pifist',   title: 'Vote de confiance PI', noExport: true, dLeft },
        { id: 'calendar', title: 'Calendrier', noExport: true },
        { id: 'teams', title: 'Equipes' },
        { id: 'pi', title: 'PI Planning' },
        { id: 'full', title: 'Rapport complet' },
    ];

    container.innerHTML = `
        <div class="report-controls">
            <div class="board-modes">
                <button class="board-mode-btn${_format === 'text' ? ' active' : ''}" data-fmt="text">Texte</button>
                <button class="board-mode-btn${_format === 'slack' ? ' active' : ''}" data-fmt="slack">Slack</button>
                <button class="board-mode-btn${_format === 'confluence' ? ' active' : ''}" data-fmt="confluence">Confluence</button>
            </div>
            <span class="text-xs text-muted">${team === 'all' ? 'Toutes equipes' : team} | ${total} tickets | ${fmtDate(new Date())}</span>
            <button class="btn btn-secondary btn-sm btn-print" title="Exporter en PDF">
                <svg class="icon icon-sm"><use href="#i-download"/></svg> PDF
            </button>
        </div>

        <!-- Charts (collapsible) -->
        <details ${_chartsCollapsed ? '' : 'open'} id="rpt-charts-section">
            <summary class="text-xs font-semibold text-muted mb-2">Métriques sprint</summary>

            <!-- KPI row -->
            <div class="rpt-kpi-row mb-4">
                <div class="rpt-kpi-chip">
                    <span class="rpt-kpi-label">Complétion</span>
                    <span class="rpt-kpi-value">${pct(done, total)}%</span>
                    <span class="rpt-kpi-sub">${done}/${total} tickets</span>
                </div>
                <div class="rpt-kpi-chip">
                    <span class="rpt-kpi-label">Points</span>
                    <span class="rpt-kpi-value">${donePts}<span class="rpt-kpi-denom">/${totalPts}</span></span>
                    <span class="rpt-kpi-sub">${pct(donePts, totalPts)}% réalisés</span>
                </div>
                <div class="rpt-kpi-chip${blocked > 0 ? ' rpt-kpi-chip--danger' : ''}">
                    <span class="rpt-kpi-label">Bloqués</span>
                    <span class="rpt-kpi-value ${blocked > 0 ? 'text-danger' : 'text-success'}">${blocked}</span>
                    <span class="rpt-kpi-sub">${blocked > 0 ? 'à débloquer' : 'aucun bloqué'}</span>
                </div>
                <div class="rpt-kpi-chip">
                    <span class="rpt-kpi-label">Buffer</span>
                    <span class="rpt-kpi-value">${bufPct}%</span>
                    <span class="rpt-kpi-sub">${bufferPts} pts</span>
                </div>
                ${daysLeft !== null ? `
                <div class="rpt-kpi-chip${daysLeft <= 2 ? ' rpt-kpi-chip--warn' : ''}">
                    <span class="rpt-kpi-label">Jours restants</span>
                    <span class="rpt-kpi-value">${daysLeft}</span>
                    <span class="rpt-kpi-sub">${daysLeft === 0 ? 'Sprint terminé' : daysLeft === 1 ? 'Dernier jour' : 'jours'}</span>
                </div>` : ''}
            </div>

            <!-- Row 1: Statuts + Types -->
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Statuts</span></div><div class="chart-container chart-h-sm"><canvas id="chart-rpt-status"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Types</span></div><div class="chart-container chart-h-sm"><canvas id="chart-rpt-types"></canvas></div></div>
            </div>

            <!-- Row 2: Burndown + Burnup -->
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Burndown</span></div><div class="chart-container chart-h-sm"><canvas id="chart-rpt-burndown"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Burnup</span></div><div class="chart-container chart-h-sm"><canvas id="chart-rpt-burnup"></canvas></div></div>
            </div>

            <!-- Row 3: Cycle Time + Vélocité PI -->
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Cycle Time</span></div><div class="chart-container chart-h-sm"><canvas id="chart-rpt-cycletime"></canvas></div></div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Vélocité PI${_piNum ? ` ${_piNum}` : ''}</span>
                        ${piInfo?.velocityTarget ? `<span style="font-size:var(--fs-xs);color:var(--warning)">Objectif : ${piInfo.velocityTarget} pts/sprint</span>` : ''}
                    </div>
                    ${_piLabels.length
                        ? `<div class="chart-container chart-h-sm"><canvas id="chart-rpt-velocity"></canvas></div>`
                        : `<div class="empty-state" style="padding:var(--sp-6)">Aucun sprint PI configuré</div>`}
                    ${_piLabels.length ? `
                    <details class="vel-history">
                        <summary class="vel-history-summary">Historique sprints passés</summary>
                        <div class="vel-history-grid">
                            <div class="vel-history-row vel-history-row--header">
                                <span>Sprint</span><span>Estimé</span><span>Buffer</span><span>Réalisé</span>
                            </div>
                            ${_piLabels.map(lbl => {
                                const d = piVelocityData.find(v => v.label === lbl);
                                const isLive = d?.isLive;
                                const stored = _storedVel.find(v => v.sprint === lbl && v.team === _teamKey);
                                return `<div class="vel-history-row${isLive ? ' vel-history-row--current' : ''}" data-sprint="${lbl}">
                                    <span class="vel-sprint-lbl">${lbl}${isLive ? ' <span class="vel-live-badge">live</span>' : ''}</span>
                                    <input class="vel-input" type="number" min="0" name="estimated" value="${isLive ? d.estimated : (stored?.estimated ?? '')}" placeholder="—" ${isLive ? 'readonly' : ''}>
                                    <input class="vel-input" type="number" min="0" name="buffer"    value="${isLive ? d.buffer    : (stored?.buffer    ?? '')}" placeholder="—" ${isLive ? 'readonly' : ''}>
                                    <input class="vel-input" type="number" min="0" name="realized"  value="${isLive ? d.realized  : (stored?.realized  ?? '')}" placeholder="—" ${isLive ? 'readonly' : ''}>
                                </div>`;
                            }).join('')}
                        </div>
                        <button class="btn btn-secondary btn-xs vel-save-btn" id="vel-save-btn">Enregistrer</button>
                    </details>` : ''}
                </div>
            </div>
        </details>

        ${sections.map(s => {
            const urgentBadge = s.id === 'pifist' && s.dLeft !== null && s.dLeft <= 1
                ? `<span class="report-section-badge report-section-badge--urgent">${s.dLeft === 0 ? '⏰ Aujourd\'hui' : '🔔 Demain'}</span>`
                : s.id === 'pifist' && s.dLeft !== null && s.dLeft <= 3
                    ? `<span class="report-section-badge">J-${s.dLeft}</span>`
                    : '';
            return `
            <div class="report-section">
                <div class="report-section-header" data-section="${s.id}">
                    <span class="report-section-title">${s.title}${urgentBadge}</span>
                    <div style="display:flex;align-items:center;gap:var(--sp-2)">
                        ${!s.noExport ? `<button class="btn btn-secondary btn-sm btn-copy-section" data-section="${s.id}" title="Copier"><svg class="icon icon-sm"><use href="#i-copy"/></svg></button>` : ''}
                        <svg class="icon icon-sm"><use href="#i-chevron-down"/></svg>
                    </div>
                </div>
                <div class="report-section-body" data-body="${s.id}">
                    ${s.id === 'epicburn'
                        ? renderEpicBurndown(ctx)
                        : s.id === 'calendar'
                            ? `<div id="cal-report-section"></div>`
                            : s.id === 'sondage'
                                ? `<div id="sondage-section"></div>`
                                : s.id === 'pifist'
                                    ? `<div id="pifist-section"></div>`
                                : (() => {
                                    const gen = GENERATORS[s.id];
                                    const isRich = _format === 'text' && gen?.html;
                                    const content = renderSection(s.id, _format, ctx);
                                    const fmtCls  = isRich ? 'fmt-html' : `fmt-${_format}`;
                                    const _escAttr = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                                    const plain   = isRich ? ` data-plain="${_escAttr(gen.text(ctx))}"` : '';
                                    return `<div class="report-content ${fmtCls}" data-content="${s.id}"${plain}>${content}</div>`;
                                })()}
                </div>
            </div>`;
        }).join('')}
    `;

    container.querySelectorAll('[data-fmt]').forEach(btn => {
        btn.addEventListener('click', () => { _format = btn.dataset.fmt; renderReports(container); });
    });
    container.querySelector('.btn-print')?.addEventListener('click', () => window.print());
    container.querySelectorAll('.report-section-header').forEach(h => {
        h.addEventListener('click', e => {
            if (e.target.closest('.btn-copy-section')) return;
            container.querySelector(`[data-body="${h.dataset.section}"]`)?.classList.toggle('collapsed');
        });
    });
    container.querySelectorAll('.btn-copy-section').forEach(btn => {
        btn.addEventListener('click', async () => {
            const el = container.querySelector(`[data-content="${btn.dataset.section}"]`);
            if (!el) return;
            try {
                await navigator.clipboard.writeText(el.dataset.plain || el.textContent);
                btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-check"/></svg>';
                setTimeout(() => { btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-copy"/></svg>'; }, 1500);
            } catch {}
        });
    });

    container.querySelector('#vel-save-btn')?.addEventListener('click', async () => {
        const rows = container.querySelectorAll('.vel-history-row[data-sprint]:not(.vel-history-row--current)');
        const newEntries = [...rows].map(row => ({
            sprint:    row.dataset.sprint,
            team:      _teamKey,
            estimated: parseInt(row.querySelector('[name=estimated]')?.value) || 0,
            buffer:    parseInt(row.querySelector('[name=buffer]')?.value)    || 0,
            realized:  parseInt(row.querySelector('[name=realized]')?.value)  || 0,
        })).filter(e => e.estimated || e.realized);
        const kept   = (_storedVel).filter(v => !(newEntries.some(e => e.sprint === v.sprint && e.team === v.team)));
        const merged = [...kept, ...newEntries];
        try {
            const updated = await api.updatePI({ ...(piInfo || {}), sprintVelocities: merged });
            store.set('piInfo', updated);
            toast('Vélocité enregistrée', 'success');
            renderReports(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelector('#rpt-charts-section')?.addEventListener('toggle', e => {
        _chartsCollapsed = !e.target.open;
        localStorage.setItem('sb-rpt-charts-collapsed', _chartsCollapsed);
    });

    requestAnimationFrame(() => {
        if (!_chartsCollapsed) {
            renderStatusChart('chart-rpt-status', statusCounts);
            renderTypeChart('chart-rpt-types', typeCounts);
            renderBurndown('chart-rpt-burndown', tickets, sprintCtx, events);
            renderBurnup('chart-rpt-burnup', tickets, sprintCtx, events);
            renderCycleTime('chart-rpt-cycletime', tickets);
            if (piVelocityData.length) renderPIVelocityChart('chart-rpt-velocity', piVelocityData, piInfo?.velocityTarget);
        }
        _renderSondage(container);
        _renderPiFist(container, dLeft);
        _renderCalReport(container, team);
    });
}


/** Parse le nom du sprint - ex: "Sprint Design #29.2" → { type:"Design", piSprint:"29.2", display:"#29.2" } */
function _parseSprintName(name) {
    if (!name) return { type: null, piSprint: null, display: 'Sprint' };
    const m = name.match(/^(.*?)\s*#?\s*(\d+\.\d+)\s*$/);
    if (m) {
        const prefix = m[1].replace(/\bsprint\b/i, '').trim();
        return { type: prefix || null, piSprint: m[2], display: `#${m[2]}` };
    }
    return { type: null, piSprint: null, display: name };
}

const _ST_ICON  = { done:'✓', inprog:'●', review:'◑', test:'◕', blocked:'✗', todo:'○' };
const _ST_COLOR = {
    done:    'var(--status-done)',
    inprog:  'var(--status-inprog)',
    review:  '#6366f1',
    test:    'var(--warning)',
    blocked: 'var(--danger)',
    todo:    'var(--text-muted)',
};

/** Jours restants avant la fin du sprint (entier, min 0) */
function _dLeft(endIso) {
    if (!endIso) return null;
    return Math.max(0, Math.round((new Date(endIso).getTime() - Date.now()) / 86_400_000));
}

/** Calcule la date limite d'envoi (2 jours ouvrés avant la fin du sprint) */
function _sendByDate(endStr) {
  if (!endStr) return '';
  const d = new Date(endStr.length === 10 ? endStr + 'T00:00:00' : endStr);
  if (isNaN(d)) return '';
  let back = 0;
  while (back < 2) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) back++;
  }
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Formate une date ISO en JJ/MM */
function _fmtShortDate(s) {
  if (!s) return '??';
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return isNaN(d) ? s : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Rendu d'une ligne pour la preview Slack sombre */
function _spLine(line) {
  if (!line.trim()) return '<div class="sp-br"></div>';
  const isQuote = line.startsWith('>');
  const raw = isQuote ? line.slice(1).trim() : line;
  const html = slackToEmoji(raw)
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<span class="sp-bold">$1</span>');
  return isQuote
    ? `<div class="sp-quote">${html}</div>`
    : `<div>${html}</div>`;
}

/** Génère le bloc "Message Slack" à partir du contexte sprint */
function _sondageSlackBlock(sprintInfo, teamLabel) {
  const sprintName = sprintInfo?.name || '';
  const start  = sprintInfo?.startDate || '';
  const end    = sprintInfo?.endDate   || '';
  const period = start && end ? ` (${_fmtShortDate(start)} → ${_fmtShortDate(end)})` : '';
  const sendBy = _sendByDate(end);

  const raw = buildMoodSlackRaw(sprintName);

  // Preview Slack
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const previewLines = raw.split('\n').map(l => _spLine(l)).join('');
  const preview = `
    <div class="slack-preview-box">
      <div class="slack-preview-header">
        <div class="slack-preview-avatar">📊</div>
        <div><span class="slack-preview-name">Squad Board</span><span class="slack-preview-badge">APP ${now}</span></div>
      </div>
      <div class="slack-preview-body">${previewLines}</div>
    </div>`;

  const infoBanner = sendBy
    ? `<div class="sondage-info">
        <span class="si-icon">💡</span>
        <div class="si-text">À envoyer au plus tard le <strong>${sendBy}</strong><small>2 jours ouvrés avant la fin du sprint</small></div>
       </div>`
    : '';

  return { raw, preview, infoBanner };
}

// ══════════════════════════════════════════════════════════════════════════════
// Sondage Mood Meter / ROTI - votes par équipe, sparkline historique
// ══════════════════════════════════════════════════════════════════════════════
const MOOD_EMOJIS  = ['😡', '😟', '😐', '🙂', '😍'];
const MOOD_LABELS  = ['Très insatisfait', 'Insatisfait', 'Neutre', 'Satisfait', 'Très satisfait'];

function _moodColor(avg) {
    if (avg === null || avg === undefined) return 'var(--text-muted)';
    if (avg < 2.5) return 'var(--danger)';
    if (avg < 3.5) return 'var(--warning)';
    return 'var(--success)';
}
function _moodBg(avg) {
    if (avg === null || avg === undefined) return 'var(--bg)';
    if (avg < 2.5) return 'var(--danger-bg)';
    if (avg < 3.5) return 'var(--warning-bg)';
    return 'var(--success-bg)';
}

function _moodSparkline(allVotes, teams) {
    // Groupe les votes par piSprint, calcule la moyenne
    const bysprint = new Map();
    allVotes.forEach(v => {
        if (!teams.includes(v.team)) return;
        const key = v.piSprint || 'sprint';
        if (!bysprint.has(key)) bysprint.set(key, []);
        bysprint.get(key).push(v.value);
    });
    if (bysprint.size < 2) return '';

    const sorted = [...bysprint.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .slice(-8);
    const points = sorted.map(([label, votes]) => ({
        label,
        avg: Math.round(votes.reduce((s, v) => s + v, 0) / votes.length * 10) / 10,
        count: votes.length,
    }));

    const W = 240, H = 44, PAD = 16;
    const stepX = (W - PAD * 2) / Math.max(points.length - 1, 1);
    const pts = points.map((p, i) => ({
        ...p,
        x: PAD + i * stepX,
        y: H - PAD - ((p.avg - 1) / 4) * (H - PAD * 2),
    }));

    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${pts[pts.length-1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`;
    const midY = H - PAD - ((3 - 1) / 4) * (H - PAD * 2);

    const dots = pts.map(p => {
        const c = p.avg < 2.5 ? 'var(--danger)' : p.avg < 3.5 ? 'var(--warning)' : 'var(--success)';
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${c}" stroke="var(--surface)" stroke-width="1.5">
            <title>${esc(p.label)}: ${p.avg}/5 (${p.count} vote${p.count > 1 ? 's' : ''})</title></circle>`;
    }).join('');

    const last = points[points.length - 1], prev = points[points.length - 2];
    const delta = last.avg - prev.avg;
    const arrow = delta > 0.2 ? '↗' : delta < -0.2 ? '↘' : '→';
    const arrowColor = _moodColor(last.avg);

    return `
    <div class="mood-sparkline">
        <span class="mood-sparkline-label">Tendance</span>
        <svg width="${W}" height="${H + 14}" class="mood-spark-svg">
            <line x1="${PAD}" y1="${midY.toFixed(1)}" x2="${W - PAD}" y2="${midY.toFixed(1)}"
                  stroke="var(--border)" stroke-dasharray="3,3" stroke-width="1"/>
            <path d="${area}" fill="var(--primary-bg)" opacity="0.4"/>
            <path d="${line}" fill="none" stroke="var(--primary)" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}
            ${pts.map((p, i) => {
                const short = p.label.replace(/PI#?/i, 'PI');
                const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
                return `<text x="${p.x.toFixed(1)}" y="${H + 11}" text-anchor="${anchor}"
                    fill="var(--text-muted)" font-size="7">${esc(short)}</text>`;
            }).join('')}
        </svg>
        <span class="mood-sparkline-arrow" style="color:${arrowColor}">${arrow}</span>
        <span class="mood-sparkline-delta" style="color:${arrowColor}">${delta > 0 ? '+' : ''}${delta.toFixed(1)}</span>
    </div>`;
}

function _renderCalReport(outerContainer, teamFilter) {
    const el = outerContainer.querySelector('#cal-report-section');
    if (!el) return;

    const allEvents = store.get('calendarEvents') || [];
    const calendars = store.get('calendars') || [];

    if (!calendars.length) {
        el.innerHTML = `<p class="text-muted text-sm">Aucun calendrier ICS configure. Ajoutez-en dans les Parametres.</p>`;
        return;
    }

    const filtered = (teamFilter && teamFilter !== 'all')
        ? allEvents.filter(e => !e.team || e.team === teamFilter)
        : allEvents;

    // ── Semaine courante (lun → dim) ──────────────────────────────────────────
    const now = new Date();
    const dow = now.getDay();
    const diffMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(now); mon.setDate(now.getDate() + diffMon); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);

    const monKey = mon.toISOString().slice(0, 10);
    const sunKey = sun.toISOString().slice(0, 10);

    const _dk = d => new Date(d).toISOString().slice(0, 10);
    const _h  = d => { const dt = new Date(d); return `${String(dt.getHours()).padStart(2,'0')}h${String(dt.getMinutes()).padStart(2,'0')}`; };
    const _dur = (s, e) => { const m = Math.round((new Date(e) - new Date(s)) / 60000); if (m <= 0 || isNaN(m)) return ''; return m < 60 ? `${m}min` : m % 60 ? `${Math.floor(m/60)}h${m%60}` : `${m/60}h`; };
    const _fmtDay = d => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

    const weekEvs = filtered.filter(e => _dk(e.start) >= monKey && _dk(e.start) <= sunKey);

    // ── Métriques agrégées ────────────────────────────────────────────────────
    const totalMins = weekEvs.filter(e => !e.allDay).reduce((s, e) => {
        const m = Math.round((new Date(e.end) - new Date(e.start)) / 60000);
        return s + (m > 0 ? m : 0);
    }, 0);
    const totalH = (totalMins / 60).toFixed(1);
    const eventsByDay = {};
    for (const e of weekEvs) {
        const dk = _dk(e.start);
        eventsByDay[dk] = (eventsByDay[dk] || []);
        eventsByDay[dk].push(e);
    }
    const activeDays = Object.keys(eventsByDay).length;
    const avgPerDay = activeDays ? (weekEvs.length / activeDays).toFixed(1) : 0;
    const busiestDay = Object.entries(eventsByDay).sort((a,b) => b[1].length - a[1].length)[0];

    // Per-team breakdown
    const byTeam = {};
    for (const e of weekEvs) {
        const t = e.team || '—';
        if (!byTeam[t]) byTeam[t] = { count: 0, mins: 0 };
        byTeam[t].count++;
        const m = e.allDay ? 0 : Math.round((new Date(e.end) - new Date(e.start)) / 60000);
        byTeam[t].mins += m > 0 ? m : 0;
    }

    // ── Days rendering ────────────────────────────────────────────────────────
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
    const todayKey = new Date().toISOString().slice(0, 10);

    const daysHtml = days.map(day => {
        const dk = _dk(day);
        const evs = (eventsByDay[dk] || []).sort((a,b) => a.start.localeCompare(b.start));
        const isToday = dk === todayKey;
        return `<div class="cal-rpt-day${isToday ? ' cal-rpt-day--today' : ''}">
            <div class="cal-rpt-day-hdr">${_fmtDay(day)}</div>
            ${evs.length ? evs.map(e => {
                const timeStr = e.allDay ? 'Journée' : `${_h(e.start)} – ${_h(e.end)}`;
                const dur = e.allDay ? '' : _dur(e.start, e.end);
                return `<div class="cal-rpt-ev">
                    <span class="cal-rpt-ev-time">${timeStr}${dur ? ` <span class="cal-ev-dur">(${dur})</span>` : ''}</span>
                    <span class="cal-rpt-ev-title">${esc(e.title)}</span>
                    ${e.location ? `<span class="cal-rpt-ev-meta">📍 ${esc(e.location)}</span>` : ''}
                    ${e.team ? `<span class="cal-rpt-ev-meta">👥 ${esc(e.team)}</span>` : ''}
                    ${e.recurring ? '<span class="cal-rpt-ev-meta">🔄 récurrent</span>' : ''}
                </div>`;
            }).join('') : `<div class="cal-rpt-ev-none">—</div>`}
        </div>`;
    }).join('');

    const teamsHtml = Object.entries(byTeam).sort((a,b) => b[1].count - a[1].count).map(([t, d]) =>
        `<div class="cal-rpt-team-row">
            <span class="cal-rpt-team-name">${esc(t)}</span>
            <span class="cal-rpt-team-count">${d.count} réunion${d.count > 1 ? 's' : ''}</span>
            <span class="cal-rpt-team-time">${(d.mins / 60).toFixed(1)}h</span>
        </div>`
    ).join('');

    el.innerHTML = `
        <div class="cal-rpt-kpis">
            <div class="cal-rpt-kpi">
                <span class="cal-rpt-kpi-label">Réunions semaine</span>
                <span class="cal-rpt-kpi-value">${weekEvs.length}</span>
            </div>
            <div class="cal-rpt-kpi">
                <span class="cal-rpt-kpi-label">Temps total</span>
                <span class="cal-rpt-kpi-value">${totalH}h</span>
            </div>
            <div class="cal-rpt-kpi">
                <span class="cal-rpt-kpi-label">Moy. / jour actif</span>
                <span class="cal-rpt-kpi-value">${avgPerDay}</span>
            </div>
            ${busiestDay ? `<div class="cal-rpt-kpi">
                <span class="cal-rpt-kpi-label">Jour le plus chargé</span>
                <span class="cal-rpt-kpi-value" style="font-size:var(--fs-sm)">${_fmtDay(new Date(busiestDay[0] + 'T12:00:00'))}</span>
                <span class="cal-rpt-kpi-sub">${busiestDay[1].length} réunion${busiestDay[1].length > 1 ? 's' : ''}</span>
            </div>` : ''}
        </div>

        ${Object.keys(byTeam).length > 1 ? `
        <div class="cal-rpt-team-breakdown mb-4">
            <h4 class="cal-rpt-sub-title">Par équipe</h4>
            ${teamsHtml}
        </div>` : ''}

        <h4 class="cal-rpt-sub-title">Semaine du ${_fmtDay(mon)} au ${_fmtDay(sun)}</h4>
        <div class="cal-rpt-week">${daysHtml}</div>
    `;
}

function _renderSondage(outerContainer) {
    const el = outerContainer.querySelector('#sondage-section');
    if (!el) return;

    const team        = store.get('team');
    const teams       = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const allVotes    = (store.get('moodVotes') || []).filter(v => v.type === 'mood');
    const piInfo      = store.get('piInfo');
    const sprintInfo  = store.get('sprintInfo');
    const curSprint   = piInfo?.name || sprintInfo?.name || 'sprint';
    const teamLabel   = team === 'all' ? 'Toutes équipes' : (team || 'Equipe');
    const { raw: slackRaw, preview: slackPreview, infoBanner: slackBanner } = _sondageSlackBlock(sprintInfo, teamLabel);

    const activeTeams = team === 'all' ? teams : teams.filter(t => t === team);

    // Votes du sprint courant par équipe
    const curVotes = allVotes.filter(v => (v.piSprint || 'sprint') === curSprint);

    // Stats globales
    const allCurValues = curVotes.map(v => v.value);
    const gAvg = allCurValues.length
        ? Math.round(allCurValues.reduce((s, v) => s + v, 0) / allCurValues.length * 10) / 10
        : null;
    const teamsVoted = new Set(curVotes.map(v => v.team)).size;

    const sparklineHtml = _moodSparkline(allVotes, activeTeams);

    const cards = activeTeams.map(teamName => {
        const tObj  = teamObjects.find(t => (t.name || t) === teamName);
        const color = tObj?.color || 'var(--primary)';
        const tvotes = curVotes.filter(v => v.team === teamName).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const count  = tvotes.length;
        const avg    = count ? Math.round(tvotes.reduce((s, v) => s + v.value, 0) / count * 10) / 10 : null;
        const vc     = _moodColor(avg);
        const borderCls = avg === null ? '' : avg >= 3.5 ? 'mood-card-good' : avg >= 2.5 ? 'mood-card-mid' : 'mood-card-bad';

        // Barres de distribution
        const distrib = [1, 2, 3, 4, 5].map(n => tvotes.filter(v => v.value === n).length);
        const maxD    = Math.max(...distrib, 1);
        const bars    = distrib.map((d, i) => {
            const h    = count ? Math.max(4, Math.round(d / maxD * 28)) : 4;
            const bg   = i < 2 ? 'var(--danger-bg)' : i === 2 ? 'var(--warning-bg)' : 'var(--success-bg)';
            const fill = (count && d) ? (i < 2 ? 'var(--danger)' : i === 2 ? 'var(--warning)' : 'var(--success)') : 'var(--border)';
            return `<div class="mood-bar-col">
                <div class="mood-bar-fill" style="height:${h}px;background:${fill};opacity:${count ? 1 : 0.35}"></div>
                <span class="mood-bar-count">${d || ''}</span>
            </div>`;
        }).join('');

        const btns = [1, 2, 3, 4, 5].map(n => `
            <button class="mood-vote-btn" data-team="${esc(teamName)}" data-sprint="${esc(curSprint)}" data-value="${n}"
                title="${n} - ${MOOD_LABELS[n - 1]}">${MOOD_EMOJIS[n - 1]}</button>`).join('');

        const lastVote = tvotes[tvotes.length - 1];
        const undoBtn  = lastVote ? `<button class="mood-undo-btn btn btn-secondary btn-xs" data-id="${esc(lastVote.id)}" title="Annuler mon dernier vote">↩ Annuler</button>` : '';

        return `
        <div class="mood-card ${borderCls}" style="--team-color:${color}">
            <div class="mood-card-header">
                <div class="mood-team-dot" style="background:${color}"></div>
                <span class="mood-team-name">${esc(teamName)}</span>
                <div class="mood-distrib">${bars}</div>
                <div class="mood-score" style="color:${vc}">
                    <span class="mood-score-val">${avg !== null ? avg : '?'}</span>
                    <span class="mood-score-max">/5</span>
                </div>
                ${count ? `<span class="mood-vote-count">${count} vote${count > 1 ? 's' : ''}</span>` : ''}
            </div>
            <div class="mood-btns">
                ${btns}
                <div class="mood-actions">${undoBtn}</div>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
    <div class="sondage-msg">
        <div class="sondage-msg-header">💬 Message Slack - Sondage Mood Meter</div>
        ${slackBanner}
        <div class="sondage-columns">
            <div class="sondage-col">
                <div class="sondage-col-label">
                    Message à copier dans Slack
                    <button class="btn btn-secondary btn-xs btn-copy-raw">📋 Copier</button>
                </div>
                <pre class="sondage-raw" id="sondage-raw-pre"></pre>
            </div>
            <div class="sondage-col">
                <div class="sondage-col-label">Aperçu Slack</div>
                ${slackPreview}
            </div>
        </div>
    </div>

    <div class="mood-section">
        <div class="mood-header">
            <span class="mood-title">😊 Mood Meter / ROTI</span>
            <span class="text-xs text-muted">${esc(curSprint)}</span>
            ${gAvg !== null ? `
            <div class="mood-global-badge" style="background:${_moodBg(gAvg)};color:${_moodColor(gAvg)}">
                <span class="mood-global-val">${gAvg}</span><span class="mood-global-max">/5</span>
                <span class="mood-global-sub">${allCurValues.length} votes · ${teamsVoted}/${activeTeams.length} equipe${activeTeams.length > 1 ? 's' : ''}</span>
            </div>` : ''}
        </div>
        ${sparklineHtml}
        <div class="mood-scale">
            ${MOOD_EMOJIS.map((e, i) => `<span>${e} <span class="text-muted">${i + 1}</span></span>`).join('')}
        </div>
        <div class="mood-cards">${cards}</div>
        ${!activeTeams.length ? '<div class="empty-state"><p>Aucune equipe configuree</p></div>' : ''}
    </div>`;

    // Raw Slack message (set via textContent to avoid HTML escaping)
    const rawPre = el.querySelector('#sondage-raw-pre');
    if (rawPre) rawPre.textContent = slackRaw;

    // Copy raw Slack message
    el.querySelector('.btn-copy-raw')?.addEventListener('click', async () => {
        const copyBtn = el.querySelector('.btn-copy-raw');
        try {
            await navigator.clipboard.writeText(slackRaw);
            if (copyBtn) { copyBtn.textContent = '✓ Copié !'; setTimeout(() => { copyBtn.textContent = '📋 Copier'; }, 1500); }
        } catch {}
    });

    // Vote
    el.querySelectorAll('.mood-vote-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const teamName = btn.dataset.team;
            const value    = parseInt(btn.dataset.value);
            const sprint   = btn.dataset.sprint;
            btn.disabled = true;
            try {
                const vote = await api.createMood({ type: 'mood', team: teamName, value, piSprint: sprint });
                store.set('moodVotes', [...(store.get('moodVotes') || []), vote]);
                _renderSondage(outerContainer);
            } catch (e) {
                toast(e.message, 'error');
                btn.disabled = false;
            }
        });
    });

    // Undo
    el.querySelectorAll('.mood-undo-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await api.deleteMood(btn.dataset.id);
                store.set('moodVotes', (store.get('moodVotes') || []).filter(v => v.id !== btn.dataset.id));
                _renderSondage(outerContainer);
            } catch (e) {
                toast(e.message, 'error');
                btn.disabled = false;
            }
        });
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Vote de confiance PI - message Slack + guide de vote
// ══════════════════════════════════════════════════════════════════════════════

function _renderPiFist(outerContainer, dLeft) {
    const el = outerContainer.querySelector('#pifist-section');
    if (!el) return;

    const sprintInfo = store.get('sprintInfo');
    const piInfo     = store.get('piInfo');
    const team       = store.get('team');
    const teams      = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const allFistVotes = (store.get('fistVotes') || []).filter(v => v.type === 'fist');

    const sprintName  = sprintInfo?.name || '';

    // Sprint label courant (ex: "29.3")
    const _piNum = piInfo?.number || '';
    const _spCnt = piInfo?.sprintsPerPI || 0;
    const _piLabels = _spCnt > 0 ? [...Array(_spCnt)].map((_, i) => `${_piNum}.${i + 1}`) : [];
    const curLabel = _piLabels.find(lbl => sprintName.includes(lbl)) || null;

    const activeTeams = team === 'all' ? teams : teams.filter(t => t === team);
    const curVotes = allFistVotes.filter(v =>
        (team === 'all' || v.team === team) &&
        (curLabel ? v.piSprint === curLabel : true)
    );

    // ── Message Slack brut ──────────────────────────────────────────────
    const raw = buildFistSlackRaw(sprintName);

    // ── Banners ──────────────────────────────────────────────────────────
    const end = sprintInfo?.endDate || '';
    let infoBanner = '';
    if (dLeft !== null && dLeft <= 1) {
        infoBanner = `<div class="sondage-info sondage-info--urgent">
            <span class="si-icon">⏰</span>
            <div class="si-text"><strong>${dLeft === 0 ? 'Dernier jour !' : 'Demain !'}</strong> Envoyez ce sondage avant la fin du sprint.
            <small>Sprint se termine le ${_fmtShortDate(end)}</small></div>
        </div>`;
    } else if (end) {
        const sendBy = _sendByDate(end);
        if (sendBy) infoBanner = `<div class="sondage-info">
            <span class="si-icon">📅</span>
            <div class="si-text">À envoyer le <strong>${sendBy}</strong><small>1 jour ouvré avant la fin du sprint</small></div>
        </div>`;
    }

    // ── Résumé des votes existants ───────────────────────────────────────
    let fistSummary = '';
    if (curVotes.length) {
        const avg = Math.round(curVotes.reduce((s, v) => s + v.value, 0) / curVotes.length * 10) / 10;
        const clr = avg >= 4 ? 'var(--success)' : avg >= 3 ? 'var(--warning)' : 'var(--danger)';
        const teamSlug = encodeURIComponent(team && team !== 'all' ? team : 'all');

        // Mini distribution
        const distrib = [1, 2, 3, 4, 5].map(n => curVotes.filter(v => v.value === n).length);
        const maxD = Math.max(...distrib, 1);
        const bars = distrib.map((d, i) => {
            const h    = Math.max(4, Math.round(d / maxD * 28));
            const fill = i < 2 ? 'var(--danger)' : i === 2 ? 'var(--warning)' : 'var(--success)';
            return `<div class="mood-bar-col">
                <div class="mood-bar-fill" style="height:${d ? h : 4}px;background:${d ? fill : 'var(--border)'};opacity:${d ? 1 : 0.35}"></div>
                <span class="mood-bar-count">${d || ''}</span>
            </div>`;
        }).join('');

        fistSummary = `
        <div class="fist-summary">
            <span class="fist-sum-icon">✊</span>
            <div class="fist-sum-info">
                <span class="fist-sum-count">${curVotes.length} vote${curVotes.length > 1 ? 's' : ''} enregistré${curVotes.length > 1 ? 's' : ''}${curLabel ? ' · ' + curLabel : ''}</span>
                <div class="mood-distrib">${bars}</div>
            </div>
            <span class="fist-sum-avg" style="color:${clr}">${avg}<span class="fist-sum-max">/5</span></span>
            <a class="btn btn-secondary btn-xs" href="/#pi/${teamSlug}/fist">Voir →</a>
        </div>`;
    }

    // ── Aperçu Slack ─────────────────────────────────────────────────────
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const previewLines = raw.split('\n').map(l => _spLine(l)).join('');
    const slackPreview = `
    <div class="slack-preview-box">
        <div class="slack-preview-header">
            <div class="slack-preview-avatar">✊</div>
            <div><span class="slack-preview-name">Squad Board</span><span class="slack-preview-badge">APP ${now}</span></div>
        </div>
        <div class="slack-preview-body">${previewLines}</div>
    </div>`;

    // ── Guide visuel (échelle) ────────────────────────────────────────────
    const scaleHtml = `
    <div class="fist-scale-guide">
        ${FIST_SCALE.map(r => `
        <div class="fist-scale-row">
            <span class="fist-scale-emoji">${r.emoji}</span>
            <div class="fist-scale-text">
                <span class="fist-scale-label">${esc(r.label)}</span>
                <span class="fist-scale-desc">${esc(r.text)}</span>
            </div>
        </div>`).join('')}
    </div>`;

    el.innerHTML = `
    <div class="sondage-msg">
        <div class="sondage-msg-header">✊ Message Slack - Vote de confiance PI${curLabel ? ` · <span class="s-badge s-badge-blue">${esc(curLabel)}</span>` : ''}</div>
        ${infoBanner}
        ${fistSummary}
        <div class="sondage-columns">
            <div class="sondage-col">
                <div class="sondage-col-label">
                    Message à copier dans Slack
                    <button class="btn btn-secondary btn-xs btn-copy-fist">📋 Copier</button>
                </div>
                <pre class="sondage-raw" id="pifist-raw-pre"></pre>
            </div>
            <div class="sondage-col">
                <div class="sondage-col-label">Aperçu Slack</div>
                ${slackPreview}
            </div>
        </div>
    </div>
    ${scaleHtml}`;

    const rawPre = el.querySelector('#pifist-raw-pre');
    if (rawPre) rawPre.textContent = raw;

    el.querySelector('.btn-copy-fist')?.addEventListener('click', async () => {
        const btn = el.querySelector('.btn-copy-fist');
        try {
            await navigator.clipboard.writeText(raw);
            if (btn) { btn.textContent = '✓ Copié !'; setTimeout(() => { btn.textContent = '📋 Copier'; }, 1500); }
        } catch {}
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Epic Burndown - non exportable, rendu HTML direct
// ══════════════════════════════════════════════════════════════════════════════
function renderEpicBurndown({ tickets, team }) {
    const allEpics = store.get('epics') || [];
    const epics = allEpics.filter(e => team === 'all' || !team || e.team === team);
    if (!epics.length) return '<div class="empty-state"><p>Aucun epic</p></div>';

    const rows = epics.map(epic => {
        const epicTickets = tickets.filter(t => t.epic === epic.id);
        const total  = epicTickets.length;
        const done   = epicTickets.filter(t => t.status === 'done').length;
        const pts    = sumBy(epicTickets, t => t.points);
        const donePts = sumBy(epicTickets.filter(t => t.status === 'done'), t => t.points);
        const pctDone = pct(done, total);
        const pctPts  = pct(donePts, pts);
        const color   = pctDone >= 80 ? 'var(--success)' : pctDone >= 50 ? 'var(--warning)' : 'var(--danger)';
        return { epic, total, done, pts, donePts, pctDone, pctPts, color };
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);

    if (!rows.length) return '<div class="empty-state"><p>Aucun ticket associe aux epics</p></div>';

    return `
    <div class="epic-burn-list">
        ${rows.map(r => `
        <div class="epic-burn-row">
            <div class="epic-burn-meta">
                <span class="epic-burn-title">${esc(r.epic.title)}</span>
                <span class="text-xs text-muted">${esc(r.epic.team || '-')}</span>
            </div>
            <div class="epic-burn-bar-wrap">
                <div class="epic-burn-bar-track">
                    <div class="epic-burn-bar-fill" style="width:${r.pctDone}%;background:${r.color}"></div>
                </div>
                <span class="epic-burn-stat">${r.done}/${r.total} tickets · ${r.donePts}/${r.pts} pts (${r.pctDone}%)</span>
            </div>
        </div>`).join('')}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
function renderSection(id, fmt, ctx) {
    const gen = GENERATORS[id];
    if (!gen) return '';
    if (fmt === 'slack') return gen.slack(ctx);
    if (fmt === 'confluence') return gen.confluence(ctx);
    return gen.html ? gen.html(ctx) : esc(gen.text(ctx));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const B = t => `<span class="s-bold">${t}</span>`;
const E = t => `<span class="s-emoji">${t}</span>`;
const SB = (t, c) => `<span class="s-badge s-badge-${c}">${t}</span>`;
const CS = (t, c) => `<span class="c-status c-${c}">${t}</span>`;

function teamBreakdown(tickets, teams, fmt) {
    const byTeam = groupBy(tickets, t => t.team);
    if (fmt === 'slack') {
        return teams.map(t => {
            const tt = byTeam.get(t) || [];
            const d = tt.filter(x => x.status === 'done').length;
            const b = tt.filter(x => x.status === 'blocked').length;
            return `${B(t)}: ${d}/${tt.length} done, ${sumBy(tt, x => x.points)} pts${b ? ` ${E('🚫')} ${b} bloques` : ''}`;
        }).join('\n');
    }
    if (fmt === 'confluence') {
        return `<table><tr><th>Equipe</th><th>Done</th><th>Total</th><th>Points</th><th>Bloques</th></tr>${teams.map(t => {
            const tt = byTeam.get(t) || []; const d = tt.filter(x => x.status === 'done').length; const b = tt.filter(x => x.status === 'blocked').length;
            return `<tr><td>${esc(t)}</td><td>${d}</td><td>${tt.length}</td><td>${sumBy(tt, x => x.points)}</td><td>${b ? CS(b, 'red') : CS('0', 'green')}</td></tr>`;
        }).join('')}</table>`;
    }
    return teams.map(t => {
        const tt = byTeam.get(t) || []; const d = tt.filter(x => x.status === 'done').length;
        return `  ${t}: ${d}/${tt.length} tickets, ${sumBy(tt, x => x.points)} pts`;
    }).join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
const GENERATORS = {
    sprint: {
        text: ctx => {
            const { tickets, sprintInfo, teams, team, done, total, donePts, totalPts } = ctx;
            const blocked = tickets.filter(t => t.status === 'blocked').length;
            let r = `=== Sprint: ${sprintInfo?.name || 'N/A'} ===\nEquipe: ${team === 'all' ? 'Toutes' : team}\n`;
            r += `Tickets: ${done}/${total} (${pct(done, total)}%)\nPoints: ${donePts}/${totalPts} (${pct(donePts, totalPts)}%)\n`;
            if (blocked) r += `Bloques: ${blocked}\n`;
            if (sprintInfo?.goal) r += `\nObjectif: ${sprintInfo.goal}\n`;
            if (teams.length > 1 && team === 'all') r += `\nPar equipe:\n${teamBreakdown(tickets, teams, 'text')}`;
            return r;
        },
        slack: ctx => {
            const { tickets, sprintInfo, teams, team, done, total, donePts, totalPts } = ctx;
            const teamLabel = team === 'all' ? 'Toutes équipes' : (team || '-');
            const ticketPct = pct(done, total);
            const ptsPct    = pct(donePts, totalPts);
            const isBuffer  = t => (t.labels || []).some(l => /buffer/i.test(l));
            const stories   = tickets.filter(t => !isBuffer(t) && t.type !== 'bug' && t.type !== 'support');
            const buffers   = tickets.filter(isBuffer);
            const bugs      = tickets.filter(t => t.type === 'bug' && !isBuffer(t));
            const support   = tickets.filter(t => t.type === 'support' && !isBuffer(t));

            const _stIcon = { done:'✅', inprog:'🔄', review:'👀', test:'🧪', blocked:'🚫', todo:'⬜' };
            const _clr    = p => p >= 80 ? 'green' : p >= 50 ? 'yellow' : 'red';

            function _tgSlack(items, icon, label) {
                if (!items.length) return '';
                const grpDone = items.filter(t => t.status === 'done').length;
                const grpPts  = sumBy(items, t => t.points);
                const grpDonePts = sumBy(items.filter(t => t.status === 'done'), t => t.points);
                const ptsInfo = grpPts ? ` · ${B(`${grpDonePts}/${grpPts} pts`)}` : '';
                let r = `\n${E(icon)} ${B(label.toUpperCase())} - ${items.length} ticket${items.length > 1 ? 's' : ''}${ptsInfo} ${SB(`${grpDone}/${items.length}`, grpDone === items.length ? 'green' : grpDone > 0 ? 'yellow' : 'red')}\n`;
                items.forEach(t => {
                    const ic  = _stIcon[t.status] || '⬜';
                    const pts = t.points ? ` <span class="s-muted">[${t.points} pts]</span>` : '';
                    r += `${E(ic)} ${esc(t.title)}${pts}\n`;
                });
                return r;
            }

            const period = sprintInfo?.startDate && sprintInfo?.endDate
                ? ` <span class="s-muted">(${_fmtShortDate(sprintInfo.startDate)} → ${_fmtShortDate(sprintInfo.endDate)})</span>`
                : '';

            const _sp = _parseSprintName(sprintInfo?.name || '');
            const _spLabel = _sp.piSprint ? `Sprint ${_sp.display}` : 'Sprint';
            let r = `<div class="s-header">${E('📋')} ${esc(_spLabel)} · ${esc(teamLabel)}${period}</div>`;
            if (sprintInfo?.goal) r += `${E('🎯')} ${B('Objectif')} : ${esc(sprintInfo.goal)}\n`;
            r += `${E('📊')} ${B('Tickets')} : ${done}/${total} ${SB(ticketPct + '%', _clr(ticketPct))}\n`;
            r += `${E('💎')} ${B('Points')}  : ${donePts}/${totalPts} ${SB(ptsPct + '%', _clr(ptsPct))}\n`;
            const blocked = tickets.filter(t => t.status === 'blocked');
            if (blocked.length) r += `${E('🚫')} ${B('Bloqués')} : ${SB(blocked.length, 'red')} - ${blocked.map(t => esc(t.title)).join(', ')}\n`;
            r += _tgSlack(stories, '📝', 'User Stories');
            r += _tgSlack(buffers, '🔄', 'Buffer');
            r += _tgSlack(bugs,    '🐛', 'Bugs');
            r += _tgSlack(support, '🛡️', 'Support');
            if (teams.length > 1 && team === 'all') r += `\n<hr class="s-divider">\n${teamBreakdown(tickets, teams, 'slack')}`;
            return r;
        },
        confluence: ctx => {
            const { tickets, sprintInfo, teams, team, done, total, donePts, totalPts } = ctx;
            const teamLabel = team === 'all' ? 'Toutes équipes' : (team || '-');
            const ticketPct = pct(done, total);
            const ptsPct    = pct(donePts, totalPts);
            const isBuffer  = t => (t.labels || []).some(l => /buffer/i.test(l));
            const stories   = tickets.filter(t => !isBuffer(t) && t.type !== 'bug' && t.type !== 'support');
            const buffers   = tickets.filter(isBuffer);
            const bugs      = tickets.filter(t => t.type === 'bug' && !isBuffer(t));
            const support   = tickets.filter(t => t.type === 'support' && !isBuffer(t));
            const blocked   = tickets.filter(t => t.status === 'blocked');
            const _clr      = p => p >= 80 ? 'green' : p >= 50 ? 'yellow' : 'red';

            const _stIcon = { done:'✅', inprog:'🔄', review:'👀', test:'🧪', blocked:'🚫', todo:'⬜' };

            function _tgConf(items, icon, label) {
                if (!items.length) return '';
                const grpDone    = items.filter(t => t.status === 'done').length;
                const grpPts     = sumBy(items, t => t.points);
                const grpDonePts = sumBy(items.filter(t => t.status === 'done'), t => t.points);
                const ptsInfo    = grpPts ? ` · ${grpDonePts}/${grpPts} pts` : '';
                let r = `<h3>${icon} ${label} <span style="font-weight:normal;font-size:.85em;color:#6b778c">(${grpDone}/${items.length}${ptsInfo})</span></h3>`;
                r += `<table><tr><th>Ticket</th><th>Points</th><th>Statut</th></tr>`;
                r += items.map(t => {
                    const st  = STATUS_LABELS[t.status] || t.status;
                    const stClr = _clr === 'green' ? 'green' : t.status === 'done' ? 'green' : t.status === 'blocked' ? 'red' : t.status === 'todo' ? 'gray' : 'blue';
                    const icon = _stIcon[t.status] || '';
                    return `<tr>
                        <td>${esc(t.title)}</td>
                        <td style="text-align:center">${t.points || '-'}</td>
                        <td>${CS(`${icon} ${esc(st)}`, t.status === 'done' ? 'green' : t.status === 'blocked' ? 'red' : t.status === 'todo' ? 'gray' : 'blue')}</td>
                    </tr>`;
                }).join('');
                r += `</table>`;
                return r;
            }

            const period = sprintInfo?.startDate && sprintInfo?.endDate
                ? ` — ${_fmtShortDate(sprintInfo.startDate)} → ${_fmtShortDate(sprintInfo.endDate)}`
                : '';
            let r = `<h2>${esc(sprintInfo?.name || 'Sprint')}</h2>`;
            r += `<p><strong>Équipe :</strong> ${esc(teamLabel)}${period}</p>`;
            if (sprintInfo?.goal) r += `<blockquote style="border-left:4px solid #0052cc;padding:8px 16px;background:#f4f5f7;margin:8px 0;border-radius:0 4px 4px 0"><strong>🎯 Objectif :</strong> ${esc(sprintInfo.goal)}</blockquote>`;
            r += `<h3>Métriques</h3><table><tr><th>Indicateur</th><th>Valeur</th><th>Progression</th></tr>`;
            r += `<tr><td>Tickets terminés</td><td>${done}/${total}</td><td>${CS(ticketPct + '%', _clr(ticketPct))}</td></tr>`;
            r += `<tr><td>Story Points</td><td>${donePts}/${totalPts}</td><td>${CS(ptsPct + '%', _clr(ptsPct))}</td></tr>`;
            if (blocked.length) r += `<tr><td>🚫 Bloqués</td><td colspan="2">${CS(blocked.length + ' ticket' + (blocked.length > 1 ? 's' : ''), 'red')} - ${blocked.map(t => esc(t.title)).join(', ')}</td></tr>`;
            r += `</table>`;
            r += _tgConf(stories, '📝', 'User Stories');
            r += _tgConf(buffers, '🔄', 'Buffer');
            r += _tgConf(bugs,    '🐛', 'Bugs');
            r += _tgConf(support, '🛡️', 'Support');
            if (teams.length > 1 && team === 'all') r += `<h3>Par équipe</h3>${teamBreakdown(tickets, teams, 'confluence')}`;
            return r;
        },
        html: ctx => {
            const { tickets, sprintInfo, teams, team, done, total, donePts, totalPts } = ctx;
            const parsed     = _parseSprintName(sprintInfo?.name || '');
            const teamLabel  = team === 'all' ? 'Toutes équipes' : (team || '-');
            const ticketPct  = pct(done, total);
            const ptsPct     = pct(donePts, totalPts);
            const blocked    = tickets.filter(t => t.status === 'blocked');
            const isBuffer   = t => (t.labels || []).some(l => /buffer/i.test(l));
            const stories    = tickets.filter(t => ['story', 'feature', 'debt', 'task', 'ops', null, undefined, ''].includes(t.type) && !isBuffer(t) && t.type !== 'bug' && t.type !== 'support');
            const buffers    = tickets.filter(isBuffer);
            const bugs       = tickets.filter(t => t.type === 'bug' && !isBuffer(t));
            const support    = tickets.filter(t => t.type === 'support' && !isBuffer(t));

            const _barColor = p => p >= 80 ? 'var(--status-done)' : p >= 50 ? 'var(--status-inprog)' : 'var(--danger)';

            function _tgHtml(items, icon, label) {
                if (!items.length) return '';
                const grpDone    = items.filter(t => t.status === 'done').length;
                const grpPts     = sumBy(items, t => t.points);
                const grpDonePts = sumBy(items.filter(t => t.status === 'done'), t => t.points);
                const rows = items.map(t => {
                    const ic  = _ST_ICON[t.status]  || '○';
                    const clr = _ST_COLOR[t.status] || 'var(--text-muted)';
                    const lbl = STATUS_LABELS[t.status] || t.status || '';
                    return `<div class="rpt-ti rpt-ti--${t.status}">
                        <span class="rpt-ti-st" style="color:${clr}">${ic}</span>
                        <span class="rpt-ti-title">${esc(t.title)}</span>
                        ${t.points ? `<span class="rpt-ti-pts">${t.points} pts</span>` : ''}
                        <span class="rpt-ti-badge rpt-ti-s-${t.status}">${esc(lbl)}</span>
                    </div>`;
                }).join('');
                const ptsTag = grpPts
                    ? `<span class="rpt-tg-pts"><span class="rpt-tg-pts-done">${grpDonePts}</span>/<span class="rpt-tg-pts-total">${grpPts}</span> pts</span>`
                    : '';
                return `
                <div class="rpt-ticket-group">
                    <div class="rpt-tg-hdr">
                        <span class="rpt-tg-icon">${icon}</span>
                        <span class="rpt-tg-label">${label}</span>
                        <span class="rpt-tg-count">${items.length} ticket${items.length > 1 ? 's' : ''}</span>
                        <span class="rpt-tg-done-ratio">${grpDone}/${items.length} terminé${grpDone > 1 ? 's' : ''}</span>
                        ${ptsTag}
                    </div>
                    <div class="rpt-tg-items">${rows}</div>
                </div>`;
            }

            return `
            <div class="rpt-sprint-card">
                <div class="rpt-sprint-head">
                    <div class="rpt-sprint-name-row">
                        <span class="rpt-sprint-num">Sprint ${esc(parsed.display)}</span>
                        <span class="rpt-sprint-team">${esc(teamLabel)}</span>
                        ${sprintInfo?.startDate && sprintInfo?.endDate
                            ? `<span class="rpt-sprint-dates">${_fmtShortDate(sprintInfo.startDate)} → ${_fmtShortDate(sprintInfo.endDate)}</span>`
                            : ''}
                    </div>
                    ${sprintInfo?.goal
                        ? `<div class="rpt-sprint-goal"><span class="rpt-goal-icon">🎯</span><span>${esc(sprintInfo.goal)}</span></div>`
                        : ''}
                </div>

                <div class="rpt-metrics-row">
                    <div class="rpt-metric">
                        <span class="rpt-metric-label">Tickets</span>
                        <span class="rpt-metric-val">${done}/${total}</span>
                        <div class="rpt-metric-bar"><div style="width:${ticketPct}%;background:${_barColor(ticketPct)}"></div></div>
                        <span class="rpt-metric-pct" style="color:${_barColor(ticketPct)}">${ticketPct}%</span>
                    </div>
                    <div class="rpt-metric">
                        <span class="rpt-metric-label">Story Points</span>
                        <span class="rpt-metric-val">${donePts}/${totalPts}</span>
                        <div class="rpt-metric-bar"><div style="width:${ptsPct}%;background:${_barColor(ptsPct)}"></div></div>
                        <span class="rpt-metric-pct" style="color:${_barColor(ptsPct)}">${ptsPct}%</span>
                    </div>
                    ${blocked.length ? `<div class="rpt-metric rpt-metric--alert">
                        <span class="rpt-metric-label">Bloqués</span>
                        <span class="rpt-metric-val rpt-metric-val--danger">${blocked.length}</span>
                    </div>` : ''}
                </div>

                <div class="rpt-ticket-groups">
                    ${_tgHtml(stories, '📝', 'User Stories')}
                    ${_tgHtml(buffers, '🔄', 'Buffer')}
                    ${_tgHtml(bugs,    '🐛', 'Bugs')}
                    ${_tgHtml(support, '🛡️', 'Support')}
                </div>

                ${teams.length > 1 && team === 'all' ? `
                <details class="rpt-by-team">
                    <summary class="rpt-by-team-toggle">Par équipe</summary>
                    <div class="rpt-by-team-body">${teamBreakdown(tickets, teams, 'confluence')}</div>
                </details>` : ''}
            </div>`;
        },
    },
    kanban: {
        text: ctx => {
            const { tickets } = ctx;
            const wip = tickets.filter(t => ['inprog', 'review', 'test'].includes(t.status)).length;
            return `=== Flow ===\nWIP: ${wip}\nBloques: ${tickets.filter(t => t.status === 'blocked').length}\nDone: ${tickets.filter(t => t.status === 'done').length}\nRatio done: ${pct(tickets.filter(t => t.status === 'done').length, tickets.length)}%`;
        },
        slack: ctx => {
            const { tickets } = ctx;
            const wip = tickets.filter(t => ['inprog', 'review', 'test'].includes(t.status)).length;
            const blocked = tickets.filter(t => t.status === 'blocked').length;
            const d = tickets.filter(t => t.status === 'done').length;
            return `<div class="s-header">${E('🗂️')} Metriques Flow</div><hr class="s-divider">${E('📈')} ${B('WIP')}: ${SB(wip, 'blue')}\n${E('🚫')} ${B('Bloques')}: ${blocked > 0 ? SB(blocked, 'red') : SB('0', 'green')}\n${E('✅')} ${B('Done')}: ${SB(d, 'green')}\n${E('📊')} ${B('Ratio')}: ${pct(d, tickets.length)}%`;
        },
        confluence: ctx => {
            const { tickets } = ctx;
            const wip = tickets.filter(t => ['inprog', 'review', 'test'].includes(t.status)).length;
            const blocked = tickets.filter(t => t.status === 'blocked').length;
            const d = tickets.filter(t => t.status === 'done').length;
            return `<h2>Metriques Flow</h2><table><tr><th>KPI</th><th>Valeur</th></tr><tr><td>WIP</td><td>${CS(wip, 'blue')}</td></tr><tr><td>Bloques</td><td>${blocked > 0 ? CS(blocked, 'red') : CS('0', 'green')}</td></tr><tr><td>Done</td><td>${CS(d, 'green')}</td></tr><tr><td>Ratio done</td><td>${pct(d, tickets.length)}%</td></tr></table>`;
        },
    },
    support: {
        text: ctx => {
            const { tickets, support } = ctx;
            const now = new Date().toISOString().slice(0, 10);
            const cur = support.filter(s => s.weekStart <= now && s.weekEnd >= now);
            let r = '=== Support ===\n';
            if (cur.length) { r += 'Rotation:\n'; for (const s of cur) r += `  ${s.team}: ${(s.members||[]).join(', ')}\n`; }
            const sup = tickets.filter(t => t.type === 'support');
            r += `Tickets support: ${sup.length}\n`;
            return r;
        },
        slack: ctx => {
            const { tickets, support } = ctx;
            const now = new Date().toISOString().slice(0, 10);
            const cur = support.filter(s => s.weekStart <= now && s.weekEnd >= now);
            let r = `<div class="s-header">${E('🛡️')} Support</div><hr class="s-divider">`;
            if (cur.length) { for (const s of cur) r += `${B(s.team)}: ${(s.members||[]).join(', ')}\n`; r += '\n'; }
            const sup = tickets.filter(t => t.type === 'support');
            r += `${E('🎫')} Tickets: ${SB(sup.length, sup.length > 0 ? 'yellow' : 'green')}`;
            return r;
        },
        confluence: ctx => {
            const { tickets, support } = ctx;
            const now = new Date().toISOString().slice(0, 10);
            const cur = support.filter(s => s.weekStart <= now && s.weekEnd >= now);
            let r = `<h2>Support</h2>`;
            if (cur.length) { r += `<h3>Rotation</h3><table><tr><th>Equipe</th><th>Membres</th></tr>${cur.map(s => `<tr><td>${esc(s.team)}</td><td>${(s.members||[]).join(', ')}</td></tr>`).join('')}</table>`; }
            const sup = tickets.filter(t => t.type === 'support');
            r += `<p>Tickets support: ${CS(sup.length, sup.length > 0 ? 'yellow' : 'green')}</p>`;
            return r;
        },
    },
    roadmap: {
        text: ctx => {
            const { features, tickets, piInfo, donePts, totalPts } = ctx;
            let r = `=== Roadmap ===\nPoints: ${donePts}/${totalPts} (${pct(donePts, totalPts)}%)\nFeatures: ${features.filter(f => f.status === 'done').length}/${features.length}\n`;
            if (piInfo?.name) r += `PI: ${piInfo.name}\n`;
            return r;
        },
        slack: ctx => {
            const { features, piInfo, donePts, totalPts } = ctx;
            const ptsPct = pct(donePts, totalPts);
            let r = `<div class="s-header">${E('🗺️')} Roadmap</div><hr class="s-divider">`;
            r += `${E('🎯')} ${B('Points')}: ${donePts}/${totalPts} ${ptsPct >= 80 ? SB(ptsPct + '%', 'green') : SB(ptsPct + '%', 'yellow')}\n`;
            r += `${E('📦')} ${B('Features')}: ${features.filter(f => f.status === 'done').length}/${features.length}\n`;
            if (features.length) { r += '\n'; for (const f of features) r += `${f.status === 'done' ? E('✅') : E('⏳')} ${esc(f.title)} <span class="s-muted">(${esc(f.team || '?')})</span>\n`; }
            return r;
        },
        confluence: ctx => {
            const { features, piInfo, donePts, totalPts } = ctx;
            let r = `<h2>Roadmap${piInfo?.name ? ' - ' + esc(piInfo.name) : ''}</h2>`;
            r += `<table><tr><th>Feature</th><th>Equipe</th><th>Statut</th></tr>${features.map(f => `<tr><td>${esc(f.title)}</td><td>${esc(f.team || '-')}</td><td>${CS(STATUS_LABELS[f.status] || f.status, f.status === 'done' ? 'green' : f.status === 'inprog' ? 'blue' : 'gray')}</td></tr>`).join('')}</table>`;
            return r;
        },
    },
    teams: {
        text: ctx => { let r = '=== Equipes ===\n'; r += teamBreakdown(ctx.tickets, ctx.teams, 'text'); return r; },
        slack: ctx => `<div class="s-header">${E('👥')} Equipes</div><hr class="s-divider">\n${teamBreakdown(ctx.tickets, ctx.teams, 'slack')}`,
        confluence: ctx => `<h2>Equipes</h2>${teamBreakdown(ctx.tickets, ctx.teams, 'confluence')}`,
    },
    pi: {
        text: ctx => {
            const objs = ctx.piInfo?.objectives || [];
            const done = objs.filter(o => o.status === 'done').length;
            let r = `=== PI: ${ctx.piInfo?.name || 'N/A'} ===\nObjectifs: ${done}/${objs.length}\n`;
            // Grouper par équipe
            const byTeam = {};
            for (const o of objs) { const t = o.team || '-'; (byTeam[t] = byTeam[t] || []).push(o); }
            for (const [team, list] of Object.entries(byTeam)) {
                r += `\n  ${team}\n`;
                for (const o of list) {
                    const bv = o.bv ? ` (💰${o.bv})` : '';
                    r += `    ${o.status === 'done' ? '[x]' : o.status === 'inprog' ? '[~]' : '[ ]'} ${o.text}${bv}\n`;
                }
            }
            return r;
        },
        slack: ctx => {
            const objs = ctx.piInfo?.objectives || [];
            const done = objs.filter(o => o.status === 'done').length;
            let r = `<div class="s-header">${E('🗓️')} PI: ${esc(ctx.piInfo?.name || 'N/A')}</div><hr class="s-divider">`;
            r += `${B('Objectifs')}: ${done}/${objs.length}\n\n`;
            // Grouper par équipe
            const byTeam = {};
            for (const o of objs) { const t = o.team || '-'; (byTeam[t] = byTeam[t] || []).push(o); }
            for (const [team, list] of Object.entries(byTeam)) {
                r += `${B(esc(team))}\n`;
                for (const o of list) {
                    const icon = o.status === 'done' ? E('✅') : o.status === 'inprog' ? E('🔄') : E('⬜');
                    const bv   = o.bv ? ` <span class="s-muted">(💰${o.bv})</span>` : '';
                    const comm = o.committed ? ` ${SB('Commis', 'blue')}` : '';
                    r += `${icon} ${esc(o.text)}${bv}${comm}\n`;
                }
                r += '\n';
            }
            return r;
        },
        confluence: ctx => {
            const objs = ctx.piInfo?.objectives || [];
            let r = `<h2>PI: ${esc(ctx.piInfo?.name || 'N/A')}</h2>`;
            // Grouper par équipe
            const byTeam = {};
            for (const o of objs) { const t = o.team || '-'; (byTeam[t] = byTeam[t] || []).push(o); }
            for (const [team, list] of Object.entries(byTeam)) {
                r += `<h3>${esc(team)}</h3>`;
                r += `<table><tr><th>Objectif</th><th>Statut</th><th>BV</th></tr>`;
                r += list.map(o =>
                    `<tr><td>${esc(o.text)}</td><td>${CS(STATUS_LABELS[o.status] || o.status, o.status === 'done' ? 'green' : o.status === 'inprog' ? 'blue' : 'gray')}</td><td>${o.bv ? `💰${o.bv}` : '-'}</td></tr>`
                ).join('');
                r += `</table>`;
            }
            return r;
        },
    },
    full: {
        text: ctx => ['sprint', 'kanban', 'support', 'roadmap', 'teams', 'pi'].map(id => GENERATORS[id].text(ctx)).join('\n\n'),
        slack: ctx => ['sprint', 'kanban', 'support', 'roadmap', 'teams', 'pi'].map(id => GENERATORS[id].slack(ctx)).join('\n\n'),
        confluence: ctx => ['sprint', 'kanban', 'support', 'roadmap', 'teams', 'pi'].map(id => GENERATORS[id].confluence(ctx)).join(''),
    },
};
