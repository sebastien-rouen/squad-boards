/**
 * Chart library - all chart types for Sprint, Kanban, Dashboard, Reports.
 * Burndown, Burnup, CFD, Velocity, Throughput, Cycle Time Scatter, WIP Age,
 * Status Doughnut, Type Distribution.
 */

import { openSprintTicketsModal } from './sprint_tickets_modal.js';
import { openSprintCompareModal } from './sprint_compare_modal.js';

const _charts = new Map();
// Sélection multi-sprints pour comparaison (Set d'indices dans `data` du chart vélocité)
const _velocitySelection = new Set();
let _velocitySelectionData = null; // data du dernier render
const MS_DAY = 86_400_000;
const DAY_FR = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTHS_FR = ['Jan.','Fév.','Mar.','Avr.','Mai','Juin','Juil.','Aoû.','Sep.','Oct.','Nov.','Déc.'];
function fmtShortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

const _TT = {
    backgroundColor: 'rgba(15,23,42,.94)', titleColor: '#F8FAFC',
    bodyColor: '#CBD5E1', borderColor: 'rgba(255,255,255,.10)', borderWidth: 1,
    padding: 12, cornerRadius: 10,
    titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 11 },
    displayColors: true, boxWidth: 10, boxHeight: 10, boxPadding: 4,
};

function ctx(id) { const c = document.getElementById(id); return c?.getContext('2d'); }
function kill(id) { if (_charts.has(id)) { _charts.get(id).destroy(); _charts.delete(id); } }
function css(prop) { return getComputedStyle(document.documentElement).getPropertyValue(prop).trim(); }

// ── Event type styles ─────────────────────────────────────────────────────────
const _EV_COLORS = { incident:'#EF4444', freeze:'#3B82F6', milestone:'#10B981', period:'#7C3AED', other:'#94A3B8' };
const _EV_ICONS  = { incident:'💥', freeze:'🧊', milestone:'🚩', period:'📅', other:'ℹ️' };

// ── Events vertical markers plugin ────────────────────────────────────────────
let _eventsPluginReady = false;
function _ensureEventsPlugin() {
    if (_eventsPluginReady || !window.Chart) return;
    window.Chart.register({
        id: 'squadBoardEvents',
        afterDraw(chart) {
            const markers = chart.options?.eventMarkers;
            if (!markers?.length) return;
            const { ctx: c, chartArea, scales: { x } } = chart;
            if (!x || !chartArea) return;
            c.save();
            markers.forEach(({ dayIdx, icon, color }) => {
                const xPos = x.getPixelForValue(dayIdx);
                if (xPos == null) return;
                c.globalAlpha = 0.65;
                c.beginPath();
                c.setLineDash([4, 3]);
                c.strokeStyle = color;
                c.lineWidth = 1.5;
                c.moveTo(xPos, chartArea.top + 16);
                c.lineTo(xPos, chartArea.bottom);
                c.stroke();
                c.setLineDash([]);
                c.globalAlpha = 1;
                c.font = '12px system-ui,sans-serif';
                c.textAlign = 'center';
                c.textBaseline = 'top';
                c.fillText(icon, xPos, chartArea.top + 2);
            });
            c.restore();
        },
    });
    _eventsPluginReady = true;
}

function _eventMarkers(events, startDate, days) {
    if (!events?.length) return [];
    const start = new Date(startDate).getTime();
    return events.flatMap(ev => {
        const dayIdx = Math.round((new Date(ev.startDate).getTime() - start) / MS_DAY);
        if (dayIdx < 0 || dayIdx >= days) return [];
        return [{ dayIdx, icon: _EV_ICONS[ev.type] || 'ℹ️', color: _EV_COLORS[ev.type] || '#94A3B8' }];
    });
}

// ── "Aujourd'hui" vertical line plugin ───────────────────────────────────────
let _todayPluginReady = false;
function _ensureTodayPlugin() {
    if (_todayPluginReady || !window.Chart) return;
    window.Chart.register({
        id: 'squadBoardToday',
        afterDraw(chart) {
            const idx = chart.options?.todayIndex;
            if (idx == null || idx < 0) return;
            const { ctx: c, chartArea, scales: { x, y } } = chart;
            if (!x || !y || !chartArea) return;
            const xPos = x.getPixelForValue(idx);
            if (xPos == null) return;
            c.save();
            // dashed red line
            c.beginPath();
            c.setLineDash([5, 4]);
            c.strokeStyle = '#EF4444';
            c.lineWidth = 1.5;
            c.moveTo(xPos, chartArea.top);
            c.lineTo(xPos, chartArea.bottom);
            c.stroke();
            // label "Aujourd'hui"
            c.setLineDash([]);
            c.font = '600 9px system-ui,sans-serif';
            c.fillStyle = '#EF4444';
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillText("Aujourd'hui", xPos, chartArea.top - 2);
            c.restore();
        },
    });
    _todayPluginReady = true;
}

/**
 * Returns the index of today within the sprint (0-based), or -1 if outside.
 * Only returns a valid index when the sprint is actually ongoing.
 */
function _todayIdx(startDate, days) {
    const elapsed = Math.floor((Date.now() - new Date(startDate).getTime()) / MS_DAY);
    if (elapsed < 0 || elapsed >= days) return -1;
    return elapsed;
}

function baseOpts(extra = {}) {
    const muted = css('--text-muted') || '#94a3b8';
    const border = css('--border') || '#e2e8f0';
    return {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: css('--text-secondary') || '#475569', font: { size: 11 } } }, tooltip: _TT },
        scales: {
            x: { ticks: { color: muted, font: { size: 10 } }, grid: { color: border } },
            y: { ticks: { color: muted, font: { size: 10 } }, grid: { color: border }, beginAtZero: true },
        },
        ...extra,
    };
}

/** Build sprint day labels: ["12/05 L", "13/05 M", ...] — dates réelles du sprint */
function sprintDays(startDate, days) {
    const result = [];
    const start = new Date(startDate);
    for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * MS_DAY);
        const wd = DAY_FR[d.getDay()];
        const isOff = d.getDay() === 0 || d.getDay() === 6;
        const dateShort = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        result.push({ label: `${dateShort} ${wd}`, date: d, isOff });
    }
    return result;
}

function currentDay(startDate, days) {
    const elapsed = Math.floor((Date.now() - new Date(startDate).getTime()) / MS_DAY);
    return Math.max(0, Math.min(days - 1, elapsed));
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Burndown
// ══════════════════════════════════════════════════════════════════════════════
export function renderBurndown(canvasId, tickets, sprint, events = []) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _ensureTodayPlugin(); _ensureEventsPlugin();
    const days = sprint?.durationDays || 14;
    const startDate = sprint?.startDate || new Date().toISOString();
    const dayInfo = sprintDays(startDate, days);
    const cd = currentDay(startDate, days);
    const todayIndex = _todayIdx(startDate, days);
    const eventMarkers = _eventMarkers(events, startDate, days);

    const ptsTotal = tickets.reduce((s, t) => s + (t.points || 0), 0) || 1;
    const ptsDone = tickets.filter(t => t.status === 'done').reduce((s, t) => s + (t.points || 0), 0);
    const tTotal = tickets.length;
    const tDone = tickets.filter(t => t.status === 'done').length;

    const ideal = dayInfo.map((_, i) => Math.round(ptsTotal * (1 - i / (days - 1))));
    const real = dayInfo.map((_, i) => i > cd ? null : Math.round(ptsTotal - (ptsDone * i / Math.max(1, cd))));
    const ticketLine = dayInfo.map((_, i) => i > cd ? null : Math.round(tTotal - (tDone * i / Math.max(1, cd))));

    _charts.set(canvasId, new Chart(c, {
        type: 'line',
        data: {
            labels: dayInfo.map(d => d.label),
            datasets: [
                { label: 'Ideal', data: ideal, borderColor: '#94A3B8', borderDash: [5, 5], pointRadius: 0, borderWidth: 2, fill: false },
                { label: `Reel (${ptsDone}/${ptsTotal} pts)`, data: real, borderColor: '#0284C7', backgroundColor: 'rgba(2,132,199,.1)', pointRadius: 3, borderWidth: 2, fill: true },
                { label: `Tickets (${tDone}/${tTotal})`, data: ticketLine, borderColor: '#F59E0B', borderDash: [3, 3], pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1', fill: false },
            ],
        },
        options: {
            ...baseOpts(),
            todayIndex,
            eventMarkers,
            scales: {
                ...baseOpts().scales,
                y: { ...baseOpts().scales.y, title: { display: true, text: 'Points restants', font: { size: 10 } } },
                y1: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#F59E0B', font: { size: 9 } }, title: { display: true, text: 'Tickets', font: { size: 10 }, color: '#F59E0B' } },
            },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. Burnup
// ══════════════════════════════════════════════════════════════════════════════
export function renderBurnup(canvasId, tickets, sprint, events = [], opts = {}) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _ensureTodayPlugin(); _ensureEventsPlugin();
    const days = sprint?.durationDays || 14;
    const startDate = sprint?.startDate || new Date().toISOString();
    const dayInfo = sprintDays(startDate, days);
    const cd = currentDay(startDate, days);
    const todayIndex = _todayIdx(startDate, days);
    const eventMarkers = _eventMarkers(events, startDate, days);

    const scope = tickets.reduce((s, t) => s + (t.points || 0), 0) || 1;
    const done = tickets.filter(t => t.status === 'done').reduce((s, t) => s + (t.points || 0), 0);

    const scopeLine = dayInfo.map(() => scope);
    const doneLine = dayInfo.map((_, i) => i > cd ? null : Math.round(done * i / Math.max(1, cd)));

    // Override des couleurs pour fond sombre (modal Demo) — texte clair, grilles très faibles.
    const _base = baseOpts();
    if (opts.theme === 'dark') {
        const tick = '#cbd5e1', grid = 'rgba(255,255,255,0.08)', legend = '#f1f5f9';
        _base.plugins = _base.plugins || {};
        _base.plugins.legend = { labels: { color: legend, font: { size: 11 } } };
        _base.scales.x.ticks.color = tick;
        _base.scales.x.grid.color = grid;
        _base.scales.y.ticks.color = tick;
        _base.scales.y.grid.color = grid;
    }

    _charts.set(canvasId, new Chart(c, {
        type: 'line',
        data: {
            labels: dayInfo.map(d => d.label),
            datasets: [
                { label: `Scope (${scope} pts)`, data: scopeLine, borderColor: '#94A3B8', borderDash: [5, 5], pointRadius: 0, borderWidth: 2, fill: false },
                { label: `Termine (${done} pts)`, data: doneLine, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,.12)', pointRadius: 3, borderWidth: 2, fill: true },
            ],
        },
        options: {
            ..._base,
            todayIndex,
            eventMarkers,
            scales: { ..._base.scales, y: { ..._base.scales.y, max: Math.round(scope * 1.15) } },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. CFD (Cumulative Flow Diagram)
// ══════════════════════════════════════════════════════════════════════════════
export function renderCFD(canvasId, tickets, sprint, events = []) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _ensureTodayPlugin(); _ensureEventsPlugin();
    const days = sprint?.durationDays || 14;
    const startDate = sprint?.startDate || new Date().toISOString();
    const dayInfo = sprintDays(startDate, days);
    const cd = currentDay(startDate, days);
    const todayIndex = _todayIdx(startDate, days);
    const eventMarkers = _eventMarkers(events, startDate, days);
    const total = tickets.length || 1;

    // Current distribution
    const now = { done: 0, test: 0, review: 0, inprog: 0, blocked: 0, todo: 0 };
    for (const t of tickets) now[t.status] = (now[t.status] || 0) + 1;

    // Simulate linear transition from all-todo to current
    const statuses = ['done', 'test', 'review', 'inprog', 'blocked', 'todo'];
    const colors = { done: '#10B981', test: '#06B6D4', review: '#8B5CF6', inprog: '#3B82F6', blocked: '#EF4444', todo: '#94A3B8' };
    const labels = { done: 'Termine', test: 'Test', review: 'Revue', inprog: 'En cours', blocked: 'Bloque', todo: 'A faire' };

    const datasets = statuses.map(s => {
        const startVal = s === 'todo' ? total : 0;
        const data = dayInfo.map((_, i) => {
            if (i > cd) return null;
            const t = cd > 0 ? i / cd : 1;
            return Math.round(startVal + (now[s] - startVal) * t);
        });
        return {
            label: `${labels[s]} (${now[s]})`,
            data,
            backgroundColor: colors[s] + 'CC',
            borderColor: colors[s],
            borderWidth: 1,
            fill: true,
            pointRadius: 0,
        };
    });

    _charts.set(canvasId, new Chart(c, {
        type: 'line',
        data: { labels: dayInfo.map(d => d.label), datasets },
        options: {
            ...baseOpts(),
            todayIndex,
            eventMarkers,
            plugins: { ...baseOpts().plugins, legend: { position: 'right', labels: { font: { size: 10 }, usePointStyle: true, pointStyleWidth: 10 } } },
            scales: { x: { ...baseOpts().scales.x, stacked: true }, y: { ...baseOpts().scales.y, stacked: true, max: total } },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. Cycle Time - histogramme horizontal empilé (Attente + CT, 1 ticket / ligne)
//
//  |══════ Attente ══════|══ Cycle Time ══|   ← Lead Time total
//  Work Scheduled        Work Started     Work Complete
// ══════════════════════════════════════════════════════════════════════════════
export function renderCycleTime(canvasId, tickets) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);

    const done = tickets
        .filter(t => t.status === 'done' && t.cycleTimeDays > 0)
        .sort((a, b) => (a.resolvedDate || '') < (b.resolvedDate || '') ? -1 : 1)
        .slice(-15);

    if (done.length < 2) {
        c.canvas.parentElement.innerHTML = '<p class="text-muted text-sm text-center chart-empty">Pas assez de tickets terminés pour le Cycle Time</p>';
        return;
    }

    const ctSorted = done.map(t => t.cycleTimeDays).sort((a, b) => a - b);
    const p50ct = ctSorted[Math.ceil(ctSorted.length * 0.5) - 1];
    const p85ct = ctSorted[Math.ceil(ctSorted.length * 0.85) - 1];
    const avgCT = Math.round(ctSorted.reduce((s, v) => s + v, 0) / ctSorted.length * 10) / 10;

    const ltVals  = done.map(t => t.leadTimeDays > 0 ? t.leadTimeDays : t.cycleTimeDays);
    const ltSorted = [...ltVals].sort((a, b) => a - b);
    const p50lt = ltSorted[Math.ceil(ltSorted.length * 0.5) - 1];
    const p85lt = ltSorted[Math.ceil(ltSorted.length * 0.85) - 1];
    const avgLT  = Math.round(ltVals.reduce((s, v) => s + v, 0) / ltVals.length * 10) / 10;

    const muted  = css('--text-muted') || '#94a3b8';
    const border = css('--border') || '#e2e8f0';
    const labels    = done.map(t => t.id);
    // Attente = temps en backlog avant démarrage (LT - CT)
    const waitData  = done.map((t, i) => Math.max(0, ltVals[i] - t.cycleTimeDays));
    const ctData    = done.map(t => t.cycleTimeDays);
    const ctColors  = done.map(t =>
        t.cycleTimeDays > p85ct ? '#EF4444cc' : t.cycleTimeDays > p50ct ? '#F59E0Bcc' : '#10B981cc'
    );

    // Plugin : lignes verticales de référence (Lead Time P50 / P85)
    // La largeur totale de chaque barre = Lead Time → les percentiles LT sont lisibles
    const refLinesPlugin = {
        id: 'ctRefLines',
        afterDraw(chart) {
            const { ctx: cx, chartArea, scales: { x } } = chart;
            if (!x || !chartArea) return;
            [
                [p50lt, '#64748B', `LT méd. ${p50lt}j`],
                [p85lt, '#334155', `LT 85%  ${p85lt}j`],
            ].forEach(([val, color, lbl]) => {
                const xPos = x.getPixelForValue(val);
                cx.save();
                cx.beginPath();
                cx.setLineDash([5, 4]);
                cx.strokeStyle = color;
                cx.lineWidth = 1.5;
                cx.moveTo(xPos, chartArea.top);
                cx.lineTo(xPos, chartArea.bottom);
                cx.stroke();
                cx.setLineDash([]);
                cx.font = '600 9px system-ui,sans-serif';
                cx.fillStyle = color;
                cx.textAlign = 'center';
                cx.textBaseline = 'top';
                cx.fillText(lbl, xPos, chartArea.top + 2);
                cx.restore();
            });
        },
    };

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        plugins: [refLinesPlugin],
        data: {
            labels,
            datasets: [
                {
                    // Segment gauche : temps d'attente avant démarrage
                    label: 'Attente (planifié → démarré)',
                    data: waitData,
                    backgroundColor: '#6366F155',
                    borderColor: '#6366F1',
                    borderWidth: 1,
                    borderRadius: { topLeft: 3, bottomLeft: 3, topRight: 0, bottomRight: 0 },
                    stack: 'ct',
                    order: 2,
                },
                {
                    // Segment droit : Cycle Time effectif
                    label: 'Cycle Time (démarré → terminé)',
                    data: ctData,
                    backgroundColor: ctColors,
                    borderColor: ctColors.map(col => col.slice(0, 7)),
                    borderWidth: 1,
                    borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 3, bottomRight: 3 },
                    stack: 'ct',
                    order: 1,
                },
            ],
        },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            interaction: { mode: 'index', intersect: true },
            onClick(event, elements) {
                if (!elements.length) return;
                const t = done[elements[0].index];
                if (t) window.__squadBoard?.openTicketModal?.(t.id);
            },
            onHover(event, elements) {
                event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: muted, font: { size: 9 } },
                    grid: { color: border },
                    beginAtZero: true,
                    title: { display: true, text: 'Jours depuis la planification', font: { size: 10 }, color: muted },
                },
                y: {
                    stacked: true,
                    ticks: { color: muted, font: { size: 9 } },
                    grid: { color: border },
                },
            },
            plugins: {
                ...baseOpts().plugins,
                legend: {
                    position: 'bottom',
                    labels: {
                        color: css('--text-secondary') || '#475569',
                        font: { size: 10 },
                        usePointStyle: true,
                        pointStyleWidth: 10,
                        generateLabels(chart) {
                            // Légende fixe : Attente, CT ≤ méd, CT méd→85%, CT > 85%
                            return [
                                { text: 'Attente (planifié → démarré)', fillStyle: '#6366F155', strokeStyle: '#6366F1', lineWidth: 1, pointStyle: 'rect' },
                                { text: `Cycle Time ≤ méd. (${p50ct}j)`, fillStyle: '#10B981cc', strokeStyle: '#10B981', lineWidth: 1, pointStyle: 'rect' },
                                { text: `CT méd.–85% (${p50ct}–${p85ct}j)`, fillStyle: '#F59E0Bcc', strokeStyle: '#F59E0B', lineWidth: 1, pointStyle: 'rect' },
                                { text: `CT > 85% (> ${p85ct}j)`,          fillStyle: '#EF4444cc', strokeStyle: '#EF4444', lineWidth: 1, pointStyle: 'rect' },
                            ];
                        },
                    },
                    onClick: () => {}, // désactive le toggle des datasets au clic légende
                },
                tooltip: {
                    ..._TT,
                    callbacks: {
                        title: items => {
                            const t = done[items[0]?.dataIndex];
                            if (!t) return '';
                            return [t.title || t.id, `${t.id} · ${fmtShortDate(t.resolvedDate)}`];
                        },
                        label: item => {
                            const t = done[item.dataIndex];
                            if (item.datasetIndex === 0) {
                                const w = waitData[item.dataIndex];
                                return w > 0 ? `Attente : ${w}j` : null;
                            }
                            return `Cycle Time : ${t.cycleTimeDays}j  |  Lead Time : ${ltVals[item.dataIndex]}j`;
                        },
                        footer: () => `Moy CT: ${avgCT}j · Moy LT: ${avgLT}j · CT méd: ${p50ct}j · CT 85%: ${p85ct}j`,
                    },
                },
            },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. WIP Age
// ══════════════════════════════════════════════════════════════════════════════
export function renderWIPAge(canvasId, tickets) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const wip = tickets
        .filter(t => ['inprog', 'review', 'test'].includes(t.status))
        .map(t => {
            const started = t.startedDate ? new Date(t.startedDate) : t.createdAt ? new Date(t.createdAt) : today;
            const startedSource = t.startedDate ? 'mise en cours' : t.createdAt ? 'création (pas de mise en cours)' : 'aujourd\'hui (fallback)';
            const age = Math.max(1, Math.round((today - started) / MS_DAY));
            return { ...t, age, startedDate: started.toISOString().slice(0, 10), startedSource };
        })
        .sort((a, b) => b.age - a.age)
        .slice(0, 15);

    if (!wip.length) {
        c.canvas.parentElement.innerHTML = '<p class="text-muted text-sm text-center chart-empty">Aucun ticket en cours</p>';
        return;
    }

    // P85 from done tickets (seuil "85% des tickets done ont fini en moins de X jours")
    const doneWithCT = tickets.filter(t => t.status === 'done' && t.cycleTimeDays > 0);
    let p85 = null;
    if (doneWithCT.length >= 3) {
        const sorted = doneWithCT.map(t => t.cycleTimeDays).sort((a, b) => a - b);
        p85 = sorted[Math.ceil(sorted.length * 0.85) - 1];
    }
    // Fallback : seuils fixes (Kanban classique : ~7j alerte, ~14j critique) si p85 non calculable
    const warnThresh = p85 ? Math.round(p85 * 0.7) : 7;
    const dangerThresh = p85 || 14;
    const thresholdSource = p85 ? `p85 cycle time = ${p85}j (calculé sur ${doneWithCT.length} tickets done)` : `fallback fixe (orange ≥7j, rouge ≥14j) — pas assez de tickets done pour calculer le p85`;

    const _color = (age) => age >= dangerThresh ? '#EF4444' : age >= warnThresh ? '#F59E0B' : '#10B981';
    const _zoneLabel = (age) => age >= dangerThresh ? 'critique 🔴' : age >= warnThresh ? 'attention 🟡' : 'OK 🟢';

    const labels = wip.map(t => `${t.id} · ${(t.title || '').slice(0, 25)}`);
    const data = wip.map(t => t.age);
    const colors = wip.map(t => _color(t.age));

    const datasets = [
        { label: 'Age (jours)', data, backgroundColor: colors, borderRadius: 3 },
    ];
    if (p85) {
        datasets.push({
            label: `Seuil p85 (${p85}j)`, type: 'line',
            data: new Array(wip.length).fill(p85),
            borderColor: '#EF444488', borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false,
            xAxisID: 'x',
        });
    }

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            plugins: {
                ...baseOpts().plugins,
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const t = wip[ctx.dataIndex]; if (!t) return '';
                            return [
                                `Age : ${t.age}j (${_zoneLabel(t.age)})`,
                                `Démarré le ${t.startedDate} (${t.startedSource})`,
                                `Statut : ${t.status}`,
                                t.leader ? `Lead : ${t.leader}` : null,
                                `— Seuils : 🟢 < ${warnThresh}j  ·  🟡 ≥ ${warnThresh}j  ·  🔴 ≥ ${dangerThresh}j`,
                                `— Référence : ${thresholdSource}`,
                            ].filter(Boolean);
                        },
                    },
                },
            },
            scales: {
                x: { ...baseOpts().scales.x, title: { display: true, text: 'Jours en WIP', font: { size: 10 } } },
                y: { ticks: { font: { size: 9 } }, grid: { display: false } },
            },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. Throughput
// ══════════════════════════════════════════════════════════════════════════════
export function renderThroughput(canvasId, tickets, sprint, events = []) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _ensureTodayPlugin(); _ensureEventsPlugin();
    const days = sprint?.durationDays || 14;
    const startDate = sprint?.startDate || new Date().toISOString();
    const dayInfo = sprintDays(startDate, days);
    const cd = currentDay(startDate, days);
    const todayIndex = _todayIdx(startDate, days);
    const eventMarkers = _eventMarkers(events, startDate, days);

    // Count tickets resolved per day
    const countByDay = new Array(days).fill(0);
    for (const t of tickets) {
        if (t.status !== 'done' || !t.resolvedDate) continue;
        const rd = new Date(t.resolvedDate);
        const idx = dayInfo.findIndex(d => d.date.toISOString().slice(0, 10) === rd.toISOString().slice(0, 10));
        if (idx >= 0) countByDay[idx]++;
    }

    const data = countByDay.map((v, i) => i > cd ? null : v);

    // 3-day moving average
    const trend = data.map((_, i) => {
        if (i > cd) return null;
        let sum = 0, cnt = 0;
        for (let j = Math.max(0, i - 2); j <= i; j++) {
            if (data[j] != null) { sum += data[j]; cnt++; }
        }
        return cnt ? Math.round(sum / cnt * 10) / 10 : null;
    });

    // Average per work day
    let totalDone = 0, workDays = 0;
    for (let i = 0; i <= cd; i++) {
        if (!dayInfo[i]?.isOff) { totalDone += countByDay[i]; workDays++; }
    }
    const avgPerDay = workDays ? Math.round(totalDone / workDays * 10) / 10 : 0;

    const barColors = dayInfo.map(d => d.isOff ? 'rgba(148,163,184,.25)' : 'rgba(16,185,129,.7)');

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        data: {
            labels: dayInfo.map(d => d.label),
            datasets: [
                { label: `Tickets termines (moy: ${avgPerDay}/j)`, data, backgroundColor: barColors, borderRadius: 3 },
                { label: 'Tendance (3j)', data: trend, type: 'line', borderColor: '#0284C7', borderWidth: 2, tension: 0.4, pointRadius: 0, fill: false },
            ],
        },
        options: {
            ...baseOpts(),
            todayIndex,
            eventMarkers,
            scales: {
                ...baseOpts().scales,
                y: { ...baseOpts().scales.y, ticks: { stepSize: 1 }, title: { display: true, text: 'Tickets', font: { size: 10 } } },
            },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Existing charts (velocity, status doughnut, type bar)
// ══════════════════════════════════════════════════════════════════════════════
export function renderVelocityChart(canvasId, data, opts = {}) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);

    // Détection sprint en cours (dernière entrée flaggée isCurrent — exclue des stats)
    const currentIdx = data.findIndex(d => d.isCurrent);
    const closed = currentIdx >= 0 ? data.slice(0, currentIdx) : data;
    const closedValues = closed.map(d => d.velocity || 0);

    const values = data.map(d => d.velocity || 0);
    const estimateds = data.map(d => d.estimated || 0);

    // Moyenne glissante 3 sprints — calculée sur les SPRINTS CLOS uniquement
    const avg3 = data.map((_, i) => {
        if (i === currentIdx) return null; // pas de moyenne sur le sprint en cours
        const slice = closedValues.slice(Math.max(0, i - 2), i + 1);
        return slice.length ? Math.round(slice.reduce((s, v) => s + v, 0) / slice.length) : 0;
    });

    const max = Math.max(...values, ...estimateds, opts.target || 0, 1);
    // Moyenne globale calculée sur SPRINTS CLOS uniquement
    const avgAll = closedValues.length ? closedValues.reduce((s, v) => s + v, 0) / closedValues.length : 0;
    // Couleur barre vélocité : par performance vs moyenne. Le current est en gris muté.
    const lastClosedIdx = closed.length - 1;
    const bg = data.map((d, i) => {
        if (i === currentIdx) return 'rgba(148,163,184,0.35)'; // gris translucide pour current
        const v = values[i];
        const isLast = i === lastClosedIdx;
        const ratio = avgAll > 0 ? (v - avgAll) / avgAll : 0;
        const palette = ratio >= 0.1 ? ['rgba(16,185,129,0.85)', 'rgba(16,185,129,0.45)']
                      : ratio <= -0.2 ? ['rgba(239,68,68,0.85)',  'rgba(239,68,68,0.40)']
                      : ratio <= -0.1 ? ['rgba(245,158,11,0.85)', 'rgba(245,158,11,0.45)']
                      :                  ['rgba(59,130,246,0.85)', 'rgba(59,130,246,0.45)'];
        return isLast ? palette[0] : palette[1];
    });
    const bd = data.map((d, i) => {
        if (i === currentIdx) return 'rgba(100,116,139,0.7)';
        const v = values[i];
        const ratio = avgAll > 0 ? (v - avgAll) / avgAll : 0;
        if (ratio >= 0.1)  return i === lastClosedIdx ? '#047857' : '#10b981';
        if (ratio <= -0.2) return i === lastClosedIdx ? '#b91c1c' : '#ef4444';
        if (ratio <= -0.1) return i === lastClosedIdx ? '#b45309' : '#f59e0b';
        return i === lastClosedIdx ? '#1d4ed8' : '#3b82f6';
    });

    const hasEstimated = estimateds.some(v => v > 0);
    const datasets = [];

    // Buffer (estimé JIRA Velocity) — barre violette plus large en arrière-plan,
    // toggleable via clic légende. Représente le total des Story Points engagés
    // au début du sprint. Les tickets ayant le label "Buffer" sont distingués
    // visuellement dans la modale détail (icône 🛡️, fond violet sur la ligne).
    if (hasEstimated) {
        datasets.push({
            label: 'Buffer (estimé)',
            data: estimateds,
            backgroundColor: data.map((d, i) => i === currentIdx ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.22)'),
            borderColor: data.map((d, i) => i === currentIdx ? 'rgba(139,92,246,0.55)' : 'rgba(139,92,246,0.70)'),
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.95,
            categoryPercentage: 0.85,
            grouped: false,  // overlay avec la barre vélocité (même x)
            order: 5,        // derrière la vélocité
        });
    }

    datasets.push({
        label: 'Vélocité (pts)',
        data: values,
        backgroundColor: bg,
        borderColor: bd,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.85,
        grouped: false,
        order: 3,
    });

    datasets.push({
        type: 'line',
        label: 'Moy. glissante (3)',
        data: avg3,
        borderColor: '#0891b2',  // cyan-600 — distinct du violet (Buffer)
        backgroundColor: 'rgba(8,145,178,0.08)',
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 2,
        pointBackgroundColor: '#0891b2',
        spanGaps: false,  // coupe la ligne au current (data=null)
        fill: false,
        order: 1,
    });

    if (avgAll > 0) {
        datasets.push({
            type: 'line',
            label: `Moyenne (${Math.round(avgAll)} pts)`,
            data: data.map(() => Math.round(avgAll)),
            borderColor: '#0891b2',  // cyan-600 — distinct du violet (Buffer)
            borderDash: [4, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            order: 2,
        });
    }

    if (opts.target) {
        datasets.push({
            type: 'line',
            label: `Objectif (${opts.target} pts)`,
            data: data.map(() => opts.target),
            borderColor: '#f59e0b',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 0,
        });
    }

    _velocitySelectionData = data;
    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        data: { labels: data.map(d => d.name), datasets },
        options: {
            ...baseOpts(),
            onClick(event, elements) {
                if (!elements?.length) return;
                const i = elements[0].index;
                const sprint = data[i];
                if (!sprint?.name) return;
                // Shift / Ctrl / Cmd → toggle sélection multi (mode comparaison)
                const ev = event?.native;
                if (ev && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) {
                    if (_velocitySelection.has(i)) _velocitySelection.delete(i);
                    else _velocitySelection.add(i);
                    _refreshVelocitySelectionBar(canvasId);
                    return;
                }
                openSprintTicketsModal(sprint);
            },
            onHover(event, elements) {
                if (event?.native?.target) {
                    event.native.target.style.cursor = elements?.length ? 'pointer' : 'default';
                }
            },
            scales: {
                ...baseOpts().scales,
                y: { ...baseOpts().scales.y, suggestedMax: Math.ceil(max * 1.15) },
            },
            plugins: {
                ...baseOpts().plugins,
                legend: {
                    position: 'top', align: 'end',
                    labels: {
                        color: css('--text-secondary') || '#475569',
                        font: { size: 10 },
                        usePointStyle: true,
                        pointStyleWidth: 8,
                        padding: 10,
                        boxHeight: 6,
                    },
                },
                tooltip: {
                    ..._TT,
                    // Masque les lignes "Moyenne" et "Moy. glissante" du tooltip — elles
                    // restent visibles sur le graphique (lignes pointillées/courbes) mais
                    // ne sont pas attachées à un sprint en particulier.
                    filter: item => !/^Moy/i.test(item.dataset?.label || ''),
                    callbacks: {
                        title: items => {
                            const i = items[0]?.dataIndex;
                            const name = data[i]?.name || '';
                            return i === currentIdx ? `${name} · en cours` : name;
                        },
                        afterBody: items => {
                            const i = items[0]?.dataIndex;
                            if (i == null) return [];
                            const lines = [];
                            const est = estimateds[i];
                            if (est > 0 && i !== currentIdx) {
                                lines.push(`Réalisé : ${Math.round((values[i] / est) * 100)}% du buffer`);
                            }
                            if (i === currentIdx) {
                                lines.push('⏳ Sprint en cours — non compté dans les stats');
                            }
                            return lines;
                        },
                    },
                },
            },
        },
    }));
}

export function renderPIVelocityChart(canvasId, data, velocityTarget) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    if (!data.length) return;

    const datasets = [
        {
            label: 'Estimé',
            data: data.map(d => d.estimated),
            backgroundColor: data.map(d => d.isCurrent ? 'rgba(59,130,246,0.18)' : 'rgba(100,116,139,0.28)'),
            borderColor: data.map(d => d.isCurrent ? 'rgba(59,130,246,0.7)' : 'rgba(100,116,139,0.55)'),
            borderWidth: 1.5, borderRadius: 6, borderSkipped: false, order: 3,
        },
        {
            label: 'Buffer',
            data: data.map(d => d.buffer || 0),
            backgroundColor: data.map(d => d.isCurrent ? 'rgba(139,92,246,0.70)' : 'rgba(139,92,246,0.45)'),
            borderColor: data.map(d => d.isCurrent ? '#7c3aed' : '#8b5cf6'),
            borderWidth: 1.5, borderRadius: 6, borderSkipped: false, order: 2,
        },
        {
            label: 'Réalisé',
            data: data.map(d => d.realized),
            backgroundColor: data.map(d => d.isCurrent ? 'rgba(59,130,246,0.75)' : 'rgba(34,197,94,0.65)'),
            borderColor: data.map(d => d.isCurrent ? '#3b82f6' : '#16a34a'),
            borderWidth: 1.5, borderRadius: 6, borderSkipped: false, order: 1,
        },
    ];

    if (velocityTarget) {
        datasets.push({
            type: 'line',
            label: `Objectif (${velocityTarget} pts)`,
            data: data.map(() => velocityTarget),
            borderColor: '#f59e0b',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0,
            order: 0,
        });
    }

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        data: { labels: data.map(d => d.label), datasets },
        options: {
            ...baseOpts(),
            plugins: {
                ...baseOpts().plugins,
                legend: {
                    position: 'top', align: 'end',
                    labels: {
                        color: css('--text-secondary') || '#475569', font: { size: 11 },
                        usePointStyle: true, pointStyleWidth: 10, padding: 12,
                    },
                },
                tooltip: {
                    ..._TT,
                    callbacks: {
                        title: items => `Sprint ${data[items[0].dataIndex].label}`,
                        afterBody: items => {
                            const d = data[items[0].dataIndex];
                            const lines = [];
                            if (d.estimated) lines.push(`Avancement : ${Math.round(d.realized / d.estimated * 100)}%`);
                            if (d.buffer) lines.push(`Buffer : ${d.buffer} pts (${Math.round(d.buffer / d.estimated * 100)}%)`);
                            return lines;
                        },
                    },
                },
            },
        },
    }));
}

export function renderStatusChart(canvasId, counts) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);

    const ALL_KEYS   = ['todo', 'inprog', 'review', 'test', 'blocked', 'done'];
    const ALL_LABELS = ['À faire', 'En cours', 'Revue', 'Test', 'Bloqué', 'Terminé'];
    const pairs = ALL_KEYS
        .map((k, i) => ({ key: k, label: ALL_LABELS[i], value: counts[k] || 0 }))
        .filter(p => p.value > 0);

    const total   = pairs.reduce((s, p) => s + p.value, 0);
    const done    = counts.done || 0;
    const pctDone = total ? Math.round(done / total * 100) : 0;
    const colors  = pairs.map(p => css(`--status-${p.key}`) || '#94a3b8');

    const centerPlugin = {
        id: 'statusCenter',
        afterDraw(chart) {
            const { ctx: cx, chartArea: { top, bottom, left, right } } = chart;
            const x = (left + right) / 2, y = (top + bottom) / 2;
            cx.save();
            cx.textAlign = 'center'; cx.textBaseline = 'middle';
            cx.fillStyle = css('--text') || '#0f172a';
            cx.font = `700 20px ${css('--font-sans') || 'system-ui,sans-serif'}`;
            cx.fillText(`${pctDone}%`, x, y - 9);
            cx.fillStyle = css('--text-muted') || '#94a3b8';
            cx.font = `11px ${css('--font-sans') || 'system-ui,sans-serif'}`;
            cx.fillText(`${done} / ${total}`, x, y + 10);
            cx.restore();
        },
    };

    _charts.set(canvasId, new Chart(c, {
        type: 'doughnut',
        plugins: [centerPlugin],
        data: {
            labels: pairs.map(p => p.label),
            datasets: [{
                data: pairs.map(p => p.value),
                backgroundColor: colors,
                borderColor: css('--surface') || '#fff',
                borderWidth: 3,
                hoverOffset: 8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            animation: { animateRotate: true, duration: 600 },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: css('--text-secondary') || '#475569',
                        font: { size: 11 },
                        padding: 10,
                        usePointStyle: true,
                        pointStyleWidth: 8,
                        generateLabels: chart => {
                            const ds = chart.data.datasets[0];
                            return chart.data.labels.map((lbl, i) => ({
                                text: `${lbl}  ${ds.data[i]}`,
                                fillStyle: ds.backgroundColor[i],
                                strokeStyle: ds.backgroundColor[i],
                                pointStyle: 'circle',
                                hidden: false,
                                index: i,
                            }));
                        },
                    },
                },
                tooltip: {
                    ..._TT,
                    callbacks: {
                        label: item => {
                            const pct = total ? Math.round(item.raw / total * 100) : 0;
                            return `  ${item.raw} tickets — ${pct}%`;
                        },
                    },
                },
            },
        },
    }));
}

export function renderTypeChart(canvasId, counts) {
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    const keys = Object.keys(counts).filter(k => counts[k] > 0);
    const colors = keys.map(k => css(`--type-${k}`) || '#94a3b8');
    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        data: { labels: keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)), datasets: [{ label: 'Tickets', data: keys.map(k => counts[k]), backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 1, borderRadius: 4 }] },
        options: { ...baseOpts(), plugins: { ...baseOpts().plugins, legend: { display: false } }, indexAxis: 'y' },
    }));
}

export function destroyAllCharts() {
    for (const [, chart] of _charts) chart.destroy();
    _charts.clear();
    _velocitySelection.clear();
    _velocitySelectionData = null;
    document.getElementById('velocity-compare-bar')?.remove();
}

// ── Barre flottante "Comparer N sprints" — chart vélocité multi-sélection ──
function _refreshVelocitySelectionBar(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const wrap = canvas.closest('.chart-container')?.parentElement;
    if (!wrap) return;
    let bar = wrap.querySelector('.velocity-compare-bar');
    const n = _velocitySelection.size;
    if (n === 0) { bar?.remove(); return; }
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'velocity-compare-bar';
        bar.id = 'velocity-compare-bar';
        wrap.appendChild(bar);
    }
    bar.innerHTML = `
        <span class="velocity-compare-info">
            ⚖️ <strong>${n}</strong> sprint${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}
            <small>(shift+clic pour ajouter/retirer)</small>
        </span>
        <div class="velocity-compare-actions">
            <button class="btn btn-ghost btn-sm" data-act="clear">Effacer</button>
            <button class="btn btn-primary btn-sm" data-act="compare"${n < 2 ? ' disabled title="Sélectionne au moins 2 sprints"' : ''}>
                Comparer →
            </button>
        </div>`;
    bar.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
        _velocitySelection.clear();
        _refreshVelocitySelectionBar(canvasId);
    });
    bar.querySelector('[data-act="compare"]')?.addEventListener('click', () => {
        if (_velocitySelection.size < 2 || !_velocitySelectionData) return;
        const selected = [..._velocitySelection].sort((a, b) => a - b)
            .map(i => _velocitySelectionData[i]).filter(Boolean);
        openSprintCompareModal(selected);
    });
}
