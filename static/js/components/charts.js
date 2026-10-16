/**
 * Chart library - all chart types for Sprint, Kanban, Dashboard, Reports.
 * Burndown, Burnup, CFD, Velocity, Throughput, Cycle Time Scatter, WIP Age,
 * Status Doughnut, Type Distribution.
 */

import { openSprintTicketsModal } from './sprint_tickets_modal.js';
import { openSprintCompareModal } from './sprint_compare_modal.js';
import { burnSeries, burnDayKey, cycleDays, leadDays, wipAgeDays, isWorkday, workdaysBetween, workdayDurationDays, mapStatus, blockedIntervals, sprintStartsOf, sprintNamesOf, extractSprintLabel, JIRA_STAGES } from '../utils.js';
import { store } from '../state.js';
import { TYPE_ICONS, STATUS_LABELS } from '../config.js';
// holidays.js n'est pas dans le barrel : import direct (SOURCE UNIQUE des fériés).
import { holidayName } from '../utils/holidays.js';

const _charts = new Map();

// ── Registre des graphiques (pour le zoom plein écran) ─────────────────────────
// Chaque render*() enregistre sa fonction + ses arguments, indexés par canvasId.
// Le composant chart_zoom.js relit ce registre pour redessiner le même graphique
// dans un canvas agrandi, et fournit un titre + une clé de type pour la légende.
const _chartMeta = new Map();
function _register(canvasId, kind, title, render, args) {
    // Les canvas de la popin de zoom (préfixe `zoom-`) ne s'enregistrent pas eux-mêmes.
    if (typeof canvasId === 'string' && canvasId.startsWith('zoom-')) return;
    const prev = _chartMeta.get(canvasId);
    _chartMeta.set(canvasId, { kind, title, render, args, controls: prev?.controls });
}
/** Métadonnées d'un graphique enregistré (ou undefined s'il n'a jamais été rendu). */
export function getChartMeta(canvasId) { return _chartMeta.get(canvasId); }
/**
 * Redessine tous les graphiques actuellement affichés avec leurs couleurs CSS
 * courantes (--text, --text-muted, --border…). À appeler après un changement de
 * thème clair/sombre : les couleurs sont lues via `css()` au moment du rendu,
 * donc un graphique déjà dessiné garde les couleurs de l'ancien thème sinon.
 */
export function redrawAllCharts() {
    for (const [canvasId, meta] of _chartMeta) {
        if (!document.getElementById(canvasId)) continue;
        meta.render(canvasId, ...meta.args);
    }
}
/**
 * Descripteur des contrôles interactifs proposés par un graphique en vue zoom
 * (toggle de mode, filtres, tri…). Renseigné par le render via `_setControls`.
 * Indexé par le canvasId SOURCE (la carte d'origine), pas le canvas de zoom.
 */
export function getChartControls(sourceId) { return _chartMeta.get(sourceId)?.controls; }
function _setControls(canvasId, controls) {
    if (_isZoom(canvasId)) return;            // seul le rendu de la carte source décrit les contrôles
    const m = _chartMeta.get(canvasId);
    if (m) m.controls = controls;
}
/**
 * Enregistre un graphique rendu en dehors de ce module (ex. burnup PI dans pi.js)
 * pour le rendre zoomable. `render(targetId)` doit (re)dessiner dans le canvas cible.
 */
export function registerExternalChart(canvasId, kind, title, render) {
    _register(canvasId, kind, title, (targetId) => render(targetId), []);
}
/**
 * Redessine un graphique enregistré dans un autre canvas (même type, mêmes données).
 * `overrideOpts` (optionnel) est fusionné dans le DERNIER argument s'il s'agit d'un
 * objet d'options — permet à la popin de zoom de piloter mode/filtre/tri.
 */
export function rerenderChart(sourceId, targetCanvasId, overrideOpts) {
    const meta = _chartMeta.get(sourceId);
    if (!meta) return null;
    let args = meta.args;
    if (overrideOpts && args.length && typeof args[args.length - 1] === 'object' && !Array.isArray(args[args.length - 1])) {
        args = [...args.slice(0, -1), { ...args[args.length - 1], ...overrideOpts }];
    } else if (overrideOpts) {
        args = [...args, overrideOpts];
    }
    meta.render(targetCanvasId, ...args);
    return meta;
}

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
function kill(id) { _copyLists.delete(id); if (_charts.has(id)) { _charts.get(id).destroy(); _charts.delete(id); } }

// Liste des tickets d'une vue AGRANDIE (« Copier la liste » de chart_zoom.js), posée par le rendu :
// { heading, subtitle, columns, rows: [{ id, icon, title, flag, cells }] }. Vidée à chaque rendu (kill).
const _copyLists = new Map();
export function getChartCopyList(canvasId) { return _copyLists.get(canvasId) || null; }
function css(prop) { return getComputedStyle(document.documentElement).getPropertyValue(prop).trim(); }

/** Un canvas est-il celui de la popin de zoom ? (préfixe `zoom-`). */
function _isZoom(canvasId) { return typeof canvasId === 'string' && canvasId.startsWith('zoom-'); }

/**
 * Nombre max d'éléments à afficher : plus large dans la vue agrandie (zoom) que
 * dans la carte compacte. Permet aux barres (Cycle Time / WIP Age) de profiter de
 * la place disponible une fois le graphique zoomé.
 */
function _displayLimit(canvasId, compact, zoomed) {
    return _isZoom(canvasId) ? zoomed : compact;
}

/**
 * Affiche un état vide PAR-DESSUS le canvas, sans détruire ni le canvas ni le
 * bouton de zoom (contrairement à `parentElement.innerHTML = …` qui efface tout).
 * Retire un éventuel overlay précédent du même conteneur. Idempotent.
 */
function _emptyOverlay(canvas, message, icon = '📊') {
    kill(canvas?.id);
    const wrap = canvas?.parentElement;
    if (!wrap) return;
    wrap.querySelector('.chart-empty-overlay')?.remove();
    const ov = document.createElement('div');
    ov.className = 'chart-empty-overlay';
    ov.innerHTML = `<span class="chart-empty-ico" aria-hidden="true">${icon}</span><span class="chart-empty-msg"></span>`;
    ov.querySelector('.chart-empty-msg').textContent = message;
    wrap.appendChild(ov);
}

/** Retire l'état vide d'un conteneur de graphique (avant un rendu normal). */
function _clearEmptyOverlay(canvas) {
    canvas?.parentElement?.querySelector('.chart-empty-overlay')?.remove();
}

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

/**
 * Axe en jours OUVRÉS (`sprint.workdaysOnly`, posé par les Rapports) : samedis, dimanches et jours
 * FÉRIÉS (utils/holidays.js) retirés de l'axe — ni point, ni étiquette, ni pente de l'idéal sur un
 * jour non travaillé. Les séries restent celles de burnSeries : un ticket résolu un jour chômé tombe
 * sur le jour ouvré suivant (même règle que la TV). Le Board garde l'axe calendaire.
 */
function _axisDays(sprint) {
    const days = sprint?.durationDays || 14;
    const startDate = sprint?.startDate || new Date().toISOString();
    const all = sprintDays(startDate, days);
    if (!sprint?.workdaysOnly) return { startDate, days, dayInfo: all, todayIndex: _todayIdx(startDate, days) };
    const dayInfo = all.filter(d => !d.isOff && !holidayName(burnDayKey(d.date)));
    return { startDate, days: dayInfo.length, dayInfo, todayIndex: _todayIdxOn(dayInfo) };
}

/** Index d'aujourd'hui sur un axe filtré (dernier jour de l'axe ≤ aujourd'hui), -1 hors de l'axe. */
function _todayIdxOn(dayInfo) {
    const today = burnDayKey(new Date());
    const keys = dayInfo.map(d => burnDayKey(d.date));
    if (!keys.length || today < keys[0] || today > keys.at(-1)) return -1;
    return keys.findLastIndex(k => k <= today);
}

/** Marqueurs d'évènements sur l'axe : par date sur un axe filtré (un évènement un jour chômé → jour ouvré suivant). */
function _markersOn(events, sprint, axis) {
    if (!sprint?.workdaysOnly) return _eventMarkers(events, axis.startDate, axis.days);
    if (!events?.length) return [];
    const keys = axis.dayInfo.map(d => burnDayKey(d.date));
    return events.flatMap(ev => {
        const k = burnDayKey(new Date(ev.startDate));
        if (!keys.length || k < keys[0] || k > keys.at(-1)) return [];
        return [{ dayIdx: keys.findIndex(x => x >= k), icon: _EV_ICONS[ev.type] || 'ℹ️', color: _EV_COLORS[ev.type] || '#94A3B8' }];
    });
}

function currentDay(startDate, days) {
    const elapsed = Math.floor((Date.now() - new Date(startDate).getTime()) / MS_DAY);
    return Math.max(0, Math.min(days - 1, elapsed));
}

/**
 * Séries RÉELLES (utils/burn.js, même calcul que la TV) sur l'axe calendaire du graphique, en points et
 * en tickets. `null` au-delà d'aujourd'hui (Chart.js coupe la ligne). Sprint clos : jusqu'au dernier jour.
 */
function _burnOnAxis(tickets, dayInfo, entryDay) {
    const days = dayInfo.map(d => burnDayKey(d.date));
    const today = burnDayKey(new Date());
    const done = tickets.filter(t => t.status === 'done');
    const extra = entryDay ? { entryDay } : {};   // entrée dans le périmètre (Burnup du PI), sinon la création
    const pts = burnSeries({ engaged: tickets, done, days, today, ...extra });
    const cnt = burnSeries({ engaged: tickets, done, days, today, val: () => 1, ...extra });
    const pad = arr => days.map((_, i) => (i < arr.length ? arr[i] : null));
    return { pts, cnt, pad };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Burndown
// ══════════════════════════════════════════════════════════════════════════════
export function renderBurndown(canvasId, tickets, sprint, events = []) {
    _register(canvasId, 'burndown', 'Burndown', renderBurndown, [tickets, sprint, events]);
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _ensureTodayPlugin(); _ensureEventsPlugin();
    const axis = _axisDays(sprint);
    const { days, dayInfo, todayIndex } = axis;
    const eventMarkers = _markersOn(events, sprint, axis);

    // Reste à faire RÉEL jour par jour (dates de résolution) — plus de droite interpolée.
    const { pts, cnt, pad } = _burnOnAxis(tickets, dayInfo);
    const ptsTotal = pts.total || 1;
    const ptsDone = Math.round(pts.done * 10) / 10, tTotal = cnt.total, tDone = cnt.done;

    const ideal = dayInfo.map((_, i) => Math.round(ptsTotal * (1 - i / Math.max(1, days - 1))));
    const real = pad(pts.real.map(v => Math.round(v * 10) / 10));
    const ticketLine = pad(cnt.real);

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
    _register(canvasId, 'burnup', 'Burnup', renderBurnup, [tickets, sprint, events, opts]);
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _ensureTodayPlugin(); _ensureEventsPlugin();
    const axis = _axisDays(sprint);
    const { dayInfo, todayIndex } = axis;
    const eventMarkers = _markersOn(events, sprint, axis);

    // Fait cumulé RÉEL (dates de résolution) et périmètre en marches (dates de création), tenu
    // ensuite jusqu'à la fin du sprint — même calcul que le burnup de la TV.
    const { pts, pad } = _burnOnAxis(tickets, dayInfo, opts.entryDay);
    const scope = pts.total || 1;
    const done = Math.round(pts.done * 10) / 10;

    const scopeLine = dayInfo.map((_, i) => (i < pts.scopeAt.length ? pts.scopeAt[i] : scope));
    const doneLine = pad(pts.real.map(v => Math.round((pts.total - v) * 10) / 10));

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
    _register(canvasId, 'cfd', 'CFD — Diagramme de flux cumulé', renderCFD, [tickets, sprint, events]);
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
            plugins: { ...baseOpts().plugins, legend: { position: 'right', labels: { color: css('--text-secondary') || '#475569', font: { size: 10 }, usePointStyle: true, pointStyleWidth: 10 } } },
            scales: { x: { ...baseOpts().scales.x, stacked: true }, y: { ...baseOpts().scales.y, stacked: true, max: total } },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 3 bis. Flux cumulé du PI par état JIRA (page PI → Indicateurs, `pi_stage_flow.js`)
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Surfaces empilées des six états du rapport JIRA (05 en bas → 00 en haut, lecture d'un CFD) à partir du
 * modèle `piStageFlowModel` — séries RÉELLES, rien d'interpolé (≠ renderCFD). Jours futurs vides.
 * `opts.view = 'bars'` : une barre horizontale par équipe (`m.rows` ; sans lignes, UNE barre `opts.barLabel`),
 * segments = états du jour, de 00 (non commencé, à gauche) à 05 (terminé, à droite), valeurs écrites dedans.
 * `opts.onPick({ key, i, team })` : clic sur une bande (jour `i`) ou un segment (équipe `team`) — ignoré en zoom.
 */
/**
 * Barres du flux cumulé : valeur au centre de chaque segment assez large (texte sombre sur fond clair), part
 * TERMINÉE en bout de barre (rouge si en retard sur le temps écoulé) et repère du temps écoulé du PI — une
 * ligne pleine hauteur en %, un trait par barre en valeur (à `total × écoulé`, ce qui serait fini à ce rythme).
 */
function _barValuesPlugin({ fmt, pct, rows, elapsed, isLate }) {
    const dark = hex => {
        const n = parseInt(String(hex).slice(1, 7), 16);
        return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 150;
    };
    const RED = '#EF4444';
    return {
        id: 'sbBarValues',
        afterDatasetsDraw(chart) {
            const { ctx: g, scales: { x, y }, chartArea } = chart;
            g.save();
            g.font = '600 11px system-ui,sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            chart.data.datasets.forEach((ds, di) => {
                const meta = chart.getDatasetMeta(di);
                if (meta.hidden) return;
                meta.data.forEach((bar, i) => {
                    const v = ds.data[i];
                    if (!v) return;
                    const txt = pct ? `${Math.round(v)} %` : fmt(v);
                    const w = Math.abs(bar.x - bar.base);
                    if (w < g.measureText(txt).width + 8 || bar.height < 14) return;
                    g.fillStyle = dark(ds.borderColor) ? '#fff' : '#0f172a';
                    g.fillText(txt, (bar.x + bar.base) / 2, bar.y);
                });
            });
            // Repère « temps écoulé »
            const anyBar = chart.getDatasetMeta(0).data;
            g.strokeStyle = RED; g.lineWidth = 1.5; g.setLineDash([4, 3]);
            if (pct && elapsed != null) {
                const px = x.getPixelForValue(elapsed);
                g.beginPath(); g.moveTo(px, chartArea.top); g.lineTo(px, chartArea.bottom); g.stroke();
                g.setLineDash([]); g.fillStyle = RED; g.font = '600 9px system-ui,sans-serif'; g.textBaseline = 'bottom';
                g.fillText(`${elapsed} % du PI`, px, chartArea.top - 1);
            } else if (elapsed != null) {
                rows.forEach((r, i) => {
                    const bar = anyBar[i];
                    if (!bar || !r.total) return;
                    const px = x.getPixelForValue(r.total * elapsed / 100), h = bar.height / 2 + 4;
                    g.beginPath(); g.moveTo(px, bar.y - h); g.lineTo(px, bar.y + h); g.stroke();
                });
            }
            g.setLineDash([]);
            // Part terminée en bout de barre
            g.font = '700 11px system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
            rows.forEach((r, i) => {
                const bar = anyBar[i];
                if (!bar || !r.total) return;
                g.fillStyle = isLate(r.donePct) ? RED : '#10B981';
                g.fillText(`✓ ${r.donePct} %`, x.getPixelForValue(pct ? 100 : r.total) + 6, bar.y);
            });
            g.restore();
        },
    };
}

export function renderPiFlow(canvasId, m, title = 'Flux cumulé par état', opts = {}) {
    _register(canvasId, 'piflow', title, renderPiFlow, [m, title, opts]);
    const c = ctx(canvasId); if (!c || !window.Chart || !m) return; kill(canvasId);
    const unit = m.unit === 'tickets' ? 'tickets' : 'pts';
    const stages = [...JIRA_STAGES].reverse();   // 05 d'abord : bas de la pile / gauche de la barre
    const pick = !_isZoom(canvasId) && typeof opts.onPick === 'function' ? opts.onPick : null;
    const base = baseOpts();
    const fmt = v => String(Math.round((v || 0) * 10) / 10).replace('.', ',');
    const legend = { position: 'bottom', reverse: true, labels: { ...base.plugins.legend.labels, usePointStyle: true, pointStyleWidth: 10, font: { size: 10 } } };
    const tooltip = {
        ..._TT, itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
        callbacks: {
            label: it => ` ${it.dataset.label} : ${fmt(it.parsed[opts.view === 'bars' ? 'x' : 'y'])} ${unit}`,
            footer: items => `Total : ${fmt(items.reduce((s, it) => s + (it.parsed[opts.view === 'bars' ? 'x' : 'y'] || 0), 0))} ${unit}${pick ? ' — cliquer pour la liste' : ''}`,
        },
    };

    if (opts.view === 'bars') {
        const multi = m.rows.length > 0;
        const rows = multi ? m.rows.filter(r => r.n) : [{ ...m.total, label: opts.barLabel || 'Total' }];
        const order = JIRA_STAGES;   // 00 à gauche → 05 à droite : le terminé finit la barre
        const pct = !!opts.pct;
        const val = (r, k) => (pct ? (r.total > 0 ? r.by[k] / r.total * 100 : 0) : r.by[k]);
        const isLate = typeof opts.isLate === 'function' ? opts.isLate : () => false;
        const maxTotal = Math.max(1, ...rows.map(r => r.total));
        _charts.set(canvasId, new Chart(c, {
            type: 'bar',
            plugins: [_barValuesPlugin({ fmt, pct, rows, elapsed: m.elapsed, isLate: d => isLate(d, m.elapsed) })],
            data: {
                labels: rows.map(r => `${r.label} · ${fmt(r.total)}`),
                datasets: order.map(s => ({
                    label: s.label, data: rows.map(r => val(r, s.key)), raw: rows.map(r => r.by[s.key]),
                    backgroundColor: s.color + 'D9', borderColor: s.color, borderWidth: 1, borderSkipped: false,
                    barPercentage: 0.75, categoryPercentage: 0.9,
                })),
            },
            options: {
                ...base,
                indexAxis: 'y',
                interaction: { mode: 'nearest', axis: 'xy', intersect: true },
                onClick: pick && ((evt, els) => {
                    const el = els[0];
                    if (el) pick({ key: order[el.datasetIndex].key, i: m.shownN - 1, team: multi ? rows[el.index].label : '' });
                }),
                onHover: pick && ((evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; }),
                layout: { padding: { top: pct ? 12 : 4, right: 58 } },   // place du « ✓ 46 % » en bout de barre
                plugins: { ...base.plugins, legend: { ...legend, reverse: false },
                    tooltip: { ...tooltip, itemSort: (a, b) => a.datasetIndex - b.datasetIndex, mode: 'index', intersect: true, axis: 'y',
                        callbacks: {
                            label: it => { const raw = it.dataset.raw[it.dataIndex], tot = rows[it.dataIndex].total;
                                return ` ${it.dataset.label} : ${fmt(raw)} ${unit} (${tot > 0 ? Math.round(raw / tot * 100) : 0} %)`; },
                            footer: items => { const r = rows[items[0]?.dataIndex]; if (!r) return '';
                                return `Total : ${fmt(r.total)} ${unit} · terminé ${r.donePct} % · ${m.elapsed} % du PI écoulé${pick ? ' — cliquer pour la liste' : ''}`; },
                        } } },
                scales: {
                    x: { ...base.scales.x, stacked: true, beginAtZero: true, ...(pct ? { max: 100, ticks: { ...base.scales.x.ticks, callback: v => `${v} %` } } : { suggestedMax: maxTotal }),
                        title: { display: true, text: pct ? '% du périmètre de chaque équipe' : unit, color: css('--text-muted') || '#94a3b8', font: { size: 10 } } },
                    y: { ...base.scales.y, stacked: true, grid: { display: false }, ticks: { ...base.scales.y.ticks, color: css('--text-secondary') || '#475569', font: { size: 11, weight: '600' } } },
                },
            },
        }));
        return;
    }

    _ensureTodayPlugin();
    // Bande sous le pointeur : cumul des états du jour, de bas (05) en haut (00).
    const bandAt = (chart, evt) => {
        const i = chart.scales.x.getValueForPixel(evt.x);
        const idx = Math.round(i);
        if (!(idx >= 0 && idx < m.shownN)) return null;
        const y = chart.scales.y.getValueForPixel(evt.y);
        let cum = 0;
        for (const s of stages) {
            const v = m.series[s.key][idx] || 0;
            if (v > 0 && y >= cum && y <= cum + v) return { key: s.key, i: idx };
            cum += v;
        }
        return null;
    };
    _charts.set(canvasId, new Chart(c, {
        type: 'line',
        data: {
            labels: m.labels,
            datasets: stages.map(s => ({
                label: s.label, data: m.series[s.key],
                backgroundColor: s.color + 'B3', borderColor: s.color, borderWidth: 1,
                fill: true, pointRadius: 0, pointHoverRadius: 3, tension: 0.15, spanGaps: false,
            })),
        },
        options: {
            ...base,
            todayIndex: m.todayIndex,
            onClick: pick && ((evt, _els, chart) => { const b = bandAt(chart, evt); if (b) pick({ ...b, team: '' }); }),
            onHover: pick && ((evt, _els, chart) => { evt.native.target.style.cursor = bandAt(chart, evt) ? 'pointer' : 'default'; }),
            plugins: { ...base.plugins, legend, tooltip: { ...tooltip, reverse: false } },
            scales: {
                x: { ...base.scales.x, stacked: true, ticks: { ...base.scales.x.ticks, maxRotation: 0, autoSkipPadding: 8 } },
                y: { ...base.scales.y, stacked: true, title: { display: true, text: unit, color: css('--text-muted') || '#94a3b8', font: { size: 10 } } },
            },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. Cycle Time - histogramme horizontal empilé (Attente + CT, 1 ticket / ligne)
//
//  |══════ Attente ══════|══ Cycle Time ══|   ← Lead Time total
//  Work Scheduled        Work Started     Work Complete
// ══════════════════════════════════════════════════════════════════════════════
// Percentile (méthode "nearest-rank") sur un tableau déjà trié croissant.
function _pct(sortedAsc, p) {
    if (!sortedAsc.length) return 0;
    return sortedAsc[Math.ceil(sortedAsc.length * p) - 1];
}
const _ctColor = (ct, p50, p85) => ct > p85 ? '#EF4444' : ct > p50 ? '#F59E0B' : '#10B981';
const _CT_LEADER = (t) => t.leader || t.assignee || '';
/** « DUPONT, Marie » → « Marie D. » ; « Marie Dupont » → « Marie D. » — tient en bout de barre. */
const _shortPerson = (n) => {
    const s = String(n || '').trim();
    if (!s) return '';
    const [last, first] = s.includes(',') ? s.split(',').map(x => x.trim()) : [s.split(/\s+/).slice(1).join(' '), s.split(/\s+/)[0]];
    return last ? `${first} ${last[0].toUpperCase()}.` : first;
};
const _plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
/**
 * Texte en bout de barre (vues agrandies) : la VALEUR en gras dans la couleur de sa zone, puis les
 * repères en couleur de texte normale, séparés par des points médians espacés — un bloc gris continu
 * se lisait mal (retour utilisateur).
 */
function _barEndText(cx, x, y, value, color, rest) {
    cx.font = '700 12px system-ui,sans-serif';
    cx.fillStyle = color;
    cx.fillText(value, x, y);
    let px = x + cx.measureText(value).width;
    cx.font = '12px system-ui,sans-serif';
    for (const part of rest.filter(Boolean)) {
        cx.fillStyle = css('--text-muted') || '#94a3b8';
        cx.fillText('  ·  ', px, y);
        px += cx.measureText('  ·  ').width;
        cx.fillStyle = css('--text') || '#0f172a';
        cx.fillText(part, px, y);
        px += cx.measureText(part).width;
    }
}
const _CT_SORT_LBL = { date: 'date de livraison', ct: 'cycle time', wait: 'attente', lt: 'lead time' };
/**
 * Sous-titre de la vue AGRANDIE du Cycle Time : ce qui est affiché, sur quoi, et les repères — le
 * graphique (et son image copiée) se lit sans survol ni contexte (3.216.0).
 */
function _ctSubtitle({ shown, base, sortBy, opts, avgCT, p50ct, p85ct, waitShare, scatter }) {
    const res = base.map(t => t.resolvedDate).filter(Boolean).sort();
    const period = res.length ? ` · livrés du ${fmtShortDate(res[0])} au ${fmtShortDate(res.at(-1))}` : '';
    const filters = [opts.filterType && `type ${opts.filterType}`, opts.filterLeader && `lead ${opts.filterLeader}`].filter(Boolean);
    const what = scatter
        ? `${_plural(base.length, 'ticket')} terminé${base.length > 1 ? 's' : ''}`
        : `${_plural(shown, 'ticket')} affiché${shown > 1 ? 's' : ''} sur ${base.length} terminé${base.length > 1 ? 's' : ''}`
          + (base.length > shown ? ` (les ${sortBy === 'date' ? 'plus récents' : 'plus longs'})` : '') + ` · tri : ${_CT_SORT_LBL[sortBy] || sortBy}`;
    return [
        `${what}${period}${filters.length ? ` · filtre : ${filters.join(', ')}` : ''} · en jours ouvrés`,
        scatter
            ? `Point = un ticket (hauteur = cycle time) · CT moyen ${avgCT} j · médiane ${p50ct} j · 85 % ≤ ${p85ct} j · clé affichée au-delà du 85ᵉ percentile`
            : `Barre = lead time (création → livraison) = attente + cycle time · CT moyen ${avgCT} j · médiane ${p50ct} j · 85 % ≤ ${p85ct} j · attente = ${waitShare} % du lead time`,
    ];
}

export function renderCycleTime(canvasId, tickets, opts = {}) {
    _register(canvasId, 'cycletime', 'Cycle Time & Lead Time', renderCycleTime, [tickets, opts]);
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _clearEmptyOverlay(c.canvas);

    const zoomed = _isZoom(canvasId);
    // Agrandi : la FRISE chronologique par défaut (3.216.0) ; barres et nuage restent au choix.
    const mode   = zoomed ? (opts.mode || 'timeline') : 'bars';   // contrôles uniquement en zoom
    const sortBy = opts.sortBy || 'date';

    // Base : tickets terminés avec un cycle time mesuré, du plus ancien au plus récent.
    let base = tickets
        .filter(t => t.status === 'done' && cycleDays(t) > 0)
        .sort((a, b) => (a.resolvedDate || '') < (b.resolvedDate || '') ? -1 : 1);

    // Valeurs de filtre disponibles (calculées AVANT filtrage, pour proposer les chips).
    // NB : pas de filtre "équipe" ici — la liste `tickets` arrive déjà filtrée par
    // l'équipe/groupe sélectionné dans la sidebar (filterByTeam), un second filtre
    // équipe serait redondant et trompeur. On ne propose que ce qui n'est filtrable
    // nulle part ailleurs : le type et le lead.
    const _uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const filterValues = {
        type:   _uniq(base.map(t => t.type)),
        leader: _uniq(base.map(t => _CT_LEADER(t))),
    };
    // Expose les contrôles à la popin de zoom (toggle mode, tri, filtres).
    _setControls(canvasId, {
        modes:   [{ value: 'timeline', label: '⟿ Frise' }, { value: 'bars', label: '▭ Barres' }, { value: 'scatter', label: '⠿ Nuage' }],
        sorts:   [
            { value: 'date', label: 'Date' }, { value: 'ct', label: 'Cycle time ↓' },
            { value: 'wait', label: 'Attente ↓' }, { value: 'lt', label: 'Lead time ↓' },
        ],
        filters: filterValues,
    });

    // Application des filtres (c).
    if (opts.filterType)   base = base.filter(t => t.type === opts.filterType);
    if (opts.filterLeader) base = base.filter(t => _CT_LEADER(t) === opts.filterLeader);

    if (base.length < 2) {
        _emptyOverlay(c.canvas, 'Pas assez de tickets terminés pour le Cycle Time', '⏱');
        return;
    }

    // Percentiles calculés sur l'ensemble filtré (avant troncature d'affichage).
    const lt = (t) => leadDays(t) > 0 ? leadDays(t) : cycleDays(t);
    const ctAll = base.map(t => cycleDays(t)).sort((a, b) => a - b);
    const ltAll = base.map(lt).sort((a, b) => a - b);
    const p50ct = _pct(ctAll, 0.5), p85ct = _pct(ctAll, 0.85);
    const p50lt = _pct(ltAll, 0.5), p85lt = _pct(ltAll, 0.85);
    const avgCT = Math.round(ctAll.reduce((s, v) => s + v, 0) / ctAll.length * 10) / 10;
    const avgLT = Math.round(ltAll.reduce((s, v) => s + v, 0) / ltAll.length * 10) / 10;
    // (f) part moyenne d'attente dans le lead time.
    const totLt = base.reduce((s, t) => s + lt(t), 0);
    const totWait = base.reduce((s, t) => s + Math.max(0, lt(t) - cycleDays(t)), 0);
    const waitShare = totLt > 0 ? Math.round(totWait / totLt * 100) : 0;

    const muted  = css('--text-muted') || '#94a3b8';
    const border = css('--border') || '#e2e8f0';
    const limit  = opts.limit || _displayLimit(canvasId, 15, 40);

    if (mode === 'timeline') {
        _renderCycleTimeline(canvasId, c, base, { p50ct, p85ct, p85lt, avgCT, waitShare, muted, border, limit, opts });
        return;
    }
    if (mode === 'scatter') {
        _renderCycleScatter(canvasId, c, base, { p50ct, p85ct, p50lt, p85lt, avgCT, avgLT, waitShare, muted, border, zoomed, trend: opts.trend !== false,
            subtitle: zoomed ? _ctSubtitle({ shown: base.length, base, sortBy, opts, avgCT, p50ct, p85ct, waitShare, scatter: true }) : null });
        return;
    }

    // ── Mode barres (défaut) ────────────────────────────────────────────────────
    // Tri d'affichage (d) puis troncature.
    const sorters = {
        date: (a, b) => (a.resolvedDate || '') < (b.resolvedDate || '') ? -1 : 1,
        ct:   (a, b) => cycleDays(a) - cycleDays(b),
        wait: (a, b) => (lt(a) - cycleDays(a)) - (lt(b) - cycleDays(b)),
        lt:   (a, b) => lt(a) - lt(b),
    };
    // Pour les tris "↓" on garde les plus grands : on trie croissant puis on prend la fin.
    const done = base.slice().sort(sorters[sortBy] || sorters.date).slice(-limit);

    const ltVals  = done.map(lt);
    // Clé + titre (tronqué proprement) — le ticket se reconnaît sans survol. Compact : titre plus court,
    // la carte du Dashboard est étroite ; agrandi : icône du type en plus et titre plus long.
    const labels  = done.map(t => {
        const ti = String(t.title || '').trim(), max = zoomed ? 42 : 28;
        const short = ti.length > max ? `${ti.slice(0, max - 1).trim()}…` : ti;
        return `${zoomed ? `${TYPE_ICONS[t.type] || '•'} ` : ''}${t.id}${short ? ` · ${short}` : ''}`;
    });
    const waitData = done.map((t, i) => Math.max(0, ltVals[i] - cycleDays(t)));
    const ctData   = done.map(t => cycleDays(t));
    const ctColors = done.map(t => _ctColor(cycleDays(t), p50ct, p85ct) + 'cc');
    // (e) outliers = lead time > P85 → bordure épaisse + couleur appuyée.
    const isOutlier = done.map(t => lt(t) > p85lt);

    // Plugin : lignes de référence Lead Time (P50/P85) + marqueur ⚠ sur les outliers.
    const refLinesPlugin = {
        id: 'ctRefLines',
        afterDraw(chart) {
            const { ctx: cx, chartArea, scales: { x, y } } = chart;
            if (!x || !chartArea) return;
            [
                [p50lt, css('--text-muted') || '#64748B', `LT méd. ${p50lt}j`],
                [p85lt, css('--text-secondary') || '#334155', `LT 85%  ${p85lt}j`],
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
                cx.font = `600 ${zoomed ? 13 : 9}px system-ui,sans-serif`;
                cx.fillStyle = color;
                cx.textAlign = 'center';
                cx.textBaseline = 'top';
                cx.fillText(lbl, xPos, chartArea.top + 2);
                cx.restore();
            });
            // ⚠ devant les barres outlier (lead time > P85).
            if (y) {
                cx.save();
                cx.font = `${zoomed ? 14 : 11}px system-ui,sans-serif`;
                cx.textAlign = 'left';
                cx.textBaseline = 'middle';
                isOutlier.forEach((out, i) => {
                    if (!out) return;
                    cx.fillText('⚠', chartArea.left + 2, y.getPixelForValue(i));
                });
                cx.restore();
            }
        },
    };

    // Agrandi : au bout de chaque barre, le CYCLE TIME (gras, couleur de son percentile), la date de
    // livraison et le lead — autoporteur, image copiée comprise. Pas le lead time : la barre le montre.
    const valuesPlugin = {
        id: 'ctValues',
        afterDatasetsDraw(chart) {
            if (!zoomed) return;
            const { ctx: cx, scales: { x, y } } = chart;
            if (!x || !y) return;
            cx.save();
            cx.textAlign = 'left';
            cx.textBaseline = 'middle';
            done.forEach((t, i) => {
                const ct = cycleDays(t);
                _barEndText(cx, x.getPixelForValue(ltVals[i]) + 8, y.getPixelForValue(i), `${ct} j`, _ctColor(ct, p50ct, p85ct),
                    [`livré le ${fmtShortDate(t.resolvedDate)}`, _shortPerson(_CT_LEADER(t))]);
            });
            cx.restore();
        },
    };

    if (zoomed) _copyLists.set(canvasId, {
        heading: 'Cycle Time & Lead Time',
        subtitle: _ctSubtitle({ shown: done.length, base, sortBy, opts, avgCT, p50ct, p85ct, waitShare }).join(' — '),
        columns: ['Cycle time', 'Lead time', 'Attente', 'Livré le', 'Lead'],
        rows: done.map((t, i) => ({
            id: t.id, icon: TYPE_ICONS[t.type] || '•', title: t.title || '', flag: isOutlier[i] ? '⚠ lead time > P85' : '',
            cells: [`${cycleDays(t)} j`, `${ltVals[i]} j`, `${waitData[i]} j`, fmtShortDate(t.resolvedDate), _shortPerson(_CT_LEADER(t))],
        })),
    });

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        plugins: [refLinesPlugin, valuesPlugin],
        data: {
            labels,
            datasets: [
                {
                    label: 'Attente (créé → démarré)',
                    data: waitData,
                    backgroundColor: '#6366F155',
                    borderColor: '#6366F1',
                    borderWidth: 1,
                    borderRadius: { topLeft: 3, bottomLeft: 3, topRight: 0, bottomRight: 0 },
                    stack: 'ct',
                    order: 2,
                },
                {
                    label: 'Cycle Time (démarré → terminé)',
                    data: ctData,
                    backgroundColor: ctColors,
                    borderColor: done.map((t, i) => isOutlier[i] ? '#7f1d1d' : _ctColor(cycleDays(t), p50ct, p85ct)),
                    borderWidth: done.map((_, i) => isOutlier[i] ? 2.5 : 1),
                    borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 3, bottomRight: 3 },
                    stack: 'ct',
                    order: 1,
                },
            ],
        },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            // Place à droite pour les valeurs écrites en bout de barre (vue agrandie).
            layout: { padding: { right: zoomed ? 230 : 0 } },
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
                    ticks: { color: muted, font: { size: zoomed ? 12 : 9 } },
                    grid: { color: border },
                    beginAtZero: true,
                    title: { display: true, text: 'Jours ouvrés depuis la planification', font: { size: zoomed ? 13 : 10 }, color: muted },
                },
                y: {
                    stacked: true,
                    // Tous les tickets nommés (jamais sautés), police selon le nombre de lignes.
                    ticks: { autoSkip: false, color: muted, font: { size: _rowFontSize(done.length, zoomed ? 12 : 9) } },
                    grid: { color: border },
                },
            },
            plugins: {
                ...baseOpts().plugins,
                legend: {
                    position: 'bottom',
                    labels: {
                        color: css('--text-secondary') || '#475569',
                        font: { size: zoomed ? 12 : 10 },
                        usePointStyle: true,
                        pointStyleWidth: 10,
                        generateLabels() {
                            return [
                                { text: 'Attente (créé → démarré)', fillStyle: '#6366F155', strokeStyle: '#6366F1', lineWidth: 1, pointStyle: 'rect' },
                                { text: `Cycle Time ≤ méd. (${p50ct}j)`, fillStyle: '#10B981cc', strokeStyle: '#10B981', lineWidth: 1, pointStyle: 'rect' },
                                { text: `CT méd.–85% (${p50ct}–${p85ct}j)`, fillStyle: '#F59E0Bcc', strokeStyle: '#F59E0B', lineWidth: 1, pointStyle: 'rect' },
                                { text: `CT > 85% (> ${p85ct}j)`,          fillStyle: '#EF4444cc', strokeStyle: '#EF4444', lineWidth: 1, pointStyle: 'rect' },
                                { text: `⚠ Outlier · lead time > ${p85lt}j`, fillStyle: 'transparent', strokeStyle: '#7f1d1d', lineWidth: 2.5, pointStyle: 'rectRounded' },
                            ];
                        },
                    },
                    onClick: () => {},
                },
                subtitle: {
                    display: zoomed,
                    text: zoomed ? _ctSubtitle({ shown: done.length, base, sortBy, opts, avgCT, p50ct, p85ct, waitShare }) : '',
                    color: css('--text-secondary') || '#475569',
                    font: { size: 12 }, align: 'start', padding: { bottom: 10 },
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
                            return `Cycle Time : ${cycleDays(t)}j  |  Lead Time : ${ltVals[item.dataIndex]}j`;
                        },
                        afterBody: items => {
                            const t = done[items[0]?.dataIndex];
                            const out = [];
                            if (t && _CT_LEADER(t)) out.push(`Lead : ${_CT_LEADER(t)}`);
                            if (isOutlier[items[0]?.dataIndex]) out.push(`⚠ Outlier (LT > P85 ${p85lt}j)`);
                            return out;
                        },
                        footer: () => `Moy CT: ${avgCT}j · Moy LT: ${avgLT}j · CT méd: ${p50ct}j · CT 85%: ${p85ct}j · Attente: ${waitShare}% du lead time`,
                    },
                },
            },
        },
    }));
}

// ── Frises chronologiques (vues agrandies Cycle Time et WIP Age, 3.216.0) ────────
// Briques partagées : axe de dates lisible, fond des jours chômés, débuts de sprint, repère du jour.
const _msOf = v => (v ? Date.parse(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN);
const _dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const _addDaysMs = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
const _mondayOf = ms => { const d = _dayStart(ms); return _addDaysMs(d, -((new Date(d).getDay() + 6) % 7)); };
const _isoOf = ms => new Date(ms).toISOString();
const _OFF_FILL = 'rgba(148,163,184,0.13)';

/**
 * Axe X de dates : le PAS (1 j, 2 j, 1, 2 ou 4 semaines) suit la largeur RÉELLE du tracé — à pas fixe, les
 * dates se chevauchaient (retour utilisateur). Graduations construites à la main (`afterBuildTicks`) :
 * Chart.js aligne sinon un pas linéaire sur des multiples depuis 1970 (un jeudi), et non sur le lundi.
 */
function _dateAxis(c, xMin, xMax, { muted, border, reserved = 480 }) {
    const spanDays = Math.max(1, Math.round((xMax - xMin) / MS_DAY));
    const plotW = Math.max(240, (c.canvas.clientWidth || c.canvas.parentElement?.clientWidth || 900) - reserved);
    const maxTicks = Math.max(2, Math.floor(plotW / 78));          // ~78 px par date (« 12 Oct. » + marge)
    const step = [1, 2, 7, 14, 28].find(n => spanDays / n <= maxTicks) || 28;
    const from = step >= 7 ? _mondayOf(xMin) : _dayStart(xMin);
    const values = [];
    for (let d = from; d <= xMax; d = _addDaysMs(d, step)) if (d >= xMin) values.push(d);
    return {
        type: 'linear', min: xMin, max: xMax,
        afterBuildTicks: scale => { scale.ticks = values.map(value => ({ value })); },
        ticks: { color: muted, font: { size: 11 }, maxRotation: 0, autoSkip: false, callback: v => fmtShortDate(_isoOf(v)) },
        grid: { color: border },
        title: { display: true, text: step >= 7 ? `Calendrier — une graduation ${step === 7 ? 'par lundi' : `tous les ${step / 7} lundis`}` : `Calendrier — une graduation ${step === 1 ? 'par jour' : 'tous les 2 jours'}`, font: { size: 12 }, color: muted },
    };
}

/** Débuts de sprint passés par les tickets affichés (nom JIRA exact → démarrage), regroupés par « NN.N ». */
function _sprintMarks(rows, xMin, xMax) {
    const starts = sprintStartsOf(store.get('sprintInfo'));
    const byKey = new Map();
    for (const t of rows) {
        for (const n of sprintNamesOf(t)) {
            const k = extractSprintLabel(n), at = _msOf(starts.get(n));
            if (!k || !Number.isFinite(at)) continue;
            (byKey.get(k) || byKey.set(k, new Set()).get(k)).add(_dayStart(at));
        }
    }
    // Plusieurs équipes : une date par clé, la MÉDIANE de leurs démarrages (comme piBounds).
    return [...byKey].map(([key, set]) => { const a = [...set].sort((x, y) => x - y); return { key, at: a[Math.floor(a.length / 2)] }; })
        .filter(m => m.at > xMin && m.at < xMax).sort((a, b) => a.at - b.at);
}

/** Fond : jours chômés grisés ; avant-plan : débuts de sprint (trait + « 31.2 ») et repère du jour. */
function _timelinePlugin({ xMin, xMax, marks = [], today = false, afterRows }) {
    return {
        id: 'sbTimeline',
        beforeDatasetsDraw(chart) {
            const { ctx: cx, chartArea, scales: { x } } = chart;
            if (!x || !chartArea) return;
            cx.save();
            cx.fillStyle = _OFF_FILL;
            for (let d = _dayStart(xMin); d < xMax; d = _addDaysMs(d, 1)) {
                if (isWorkday(new Date(d))) continue;
                const x1 = Math.max(chartArea.left, x.getPixelForValue(d)), x2 = Math.min(chartArea.right, x.getPixelForValue(_addDaysMs(d, 1)));
                if (x2 > x1) cx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
            }
            cx.restore();
        },
        afterDatasetsDraw(chart) {
            const { ctx: cx, chartArea, scales: { x } } = chart;
            if (!x || !chartArea) return;
            cx.save();
            const line = (xp, color, label) => {
                cx.beginPath(); cx.setLineDash([4, 4]); cx.strokeStyle = color; cx.lineWidth = 1.25;
                cx.moveTo(xp, chartArea.top); cx.lineTo(xp, chartArea.bottom); cx.stroke(); cx.setLineDash([]);
                cx.font = '600 11px system-ui,sans-serif'; cx.fillStyle = color; cx.textAlign = 'left'; cx.textBaseline = 'bottom';
                cx.fillText(label, xp + 3, chartArea.top - 3);
            };
            for (const m of marks) line(x.getPixelForValue(m.at), css('--primary') || '#0284C7', `▸ ${m.key}`);
            if (today) line(x.getPixelForValue(Date.now()), '#EF4444', "Aujourd'hui");
            cx.restore();
            afterRows?.(chart);
        },
    };
}

/**
 * Axe Y des graphiques « une ligne par ticket » : TOUS les libellés, jamais sautés. Chart.js masque
 * sinon une partie des catégories quand il croit manquer de place (`autoSkip`, hauteur des emoji
 * surestimée) — 7 tickets tracés pour 5 titres affichés. La police rétrécit avec le nombre de lignes.
 */
const _rowFontSize = (n, base = 12) => (n > 30 ? 9 : n > 22 ? 10 : n > 15 ? 11 : base);
const _rowsAxis = (n, { color, base = 12 } = {}) => ({
    ticks: { autoSkip: false, ...(color ? { color } : {}), font: { size: _rowFontSize(n, base) } },
    grid: { display: false },
});

/** Libellé de ligne : (⚠ / 🚫) icône du type, clé, titre tronqué proprement. */
const _rowLabel = (t, warn = false) => {
    const ti = String(t.title || '');
    return `${t.status === 'blocked' ? '🚫 ' : ''}${warn ? '⚠ ' : ''}${TYPE_ICONS[t.type] || '•'} ${t.id}${ti ? ` · ${ti.length > 38 ? `${ti.slice(0, 37)}…` : ti}` : ''}`;
};

/**
 * Début du blocage EN COURS : dernier passage au drapeau JIRA (`Flagged` → « Impediment ») ou à un
 * statut classé « bloqué » (`mapStatus`, ex. « Retour au demandeur »). NaN si l'historique (tronqué à
 * quelques changements, cf. sync-parse.js) ne le contient plus — on dit alors « bloqué », sans durée.
 */
function _blockedSinceMs(t) {
    let best = NaN;
    for (const ch of t.recentChanges || []) {
        const f = String(ch.field || '').toLowerCase();
        const to = String(ch.to || '').trim();
        if (!((f === 'flagged' && to) || (f === 'status' && mapStatus(to.toLowerCase()) === 'blocked'))) continue;
        const ms = _msOf(ch.date);
        if (Number.isFinite(ms) && !(ms <= best)) best = ms;
    }
    return best;
}
// Périodes de blocage : source unique utils/blocked.js (partagée avec le détail « Flux » de la modale).
const _blockedIntervals = blockedIntervals;
/** Durée bloquée (jours ouvrés) d'une liste de périodes, arrondie au demi-jour : « 2 j », « ½ j ». */
const _blockedDaysTxt = iv => {
    const d = Math.round(iv.reduce((s, x) => s + workdayDurationDays(x.from, x.to), 0) * 2) / 2;
    return d < 0.5 ? '< ½ j' : `${String(d).replace('.5', ',5')} j`;
};

/** « 🚫 bloqué 4 j » (jours ouvrés) ou « 🚫 bloqué » si la date est inconnue. */
const _blockedTxt = t => `🚫 bloqué${t._blockedDays != null ? ` ${t._blockedDays} j` : ''}`;

/** Hachures (motif) pour la partie BLOQUÉE d'une ligne — lisible en clair comme en sombre. */
function _stripes(color) {
    const p = document.createElement('canvas');
    p.width = p.height = 8;
    const g = p.getContext('2d');
    g.fillStyle = `${color}33`; g.fillRect(0, 0, 8, 8);
    g.strokeStyle = color; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.stroke();
    return g.createPattern(p, 'repeat');
}

// ── Cycle Time — mode « frise chronologique » (vue agrandie, défaut) ─────────────
// Une ligne par ticket, rangée par date de démarrage, sur un VRAI axe de dates : segment clair =
// attente (créé → démarré), segment plein = cycle time (démarré → livré), couleur = percentile CT.
// Week-ends et fériés grisés en fond : on voit pourquoi ils ne comptent pas (jours OUVRÉS). Une attente
// commencée avant la fenêtre est coupée au bord gauche, annoncée « ◂ créé le … ». Débuts de sprint tracés.
function _renderCycleTimeline(canvasId, c, base, p) {
    const { p50ct, p85ct, p85lt, avgCT, waitShare, muted, border, limit, opts } = p;
    // Les plus récemment livrés (fenêtre lisible), puis rangés par démarrage : l'ordre de la frise.
    const dated = base.filter(t => Number.isFinite(_msOf(t.startedDate)) && Number.isFinite(_msOf(t.resolvedDate)));
    const rows = dated.slice(-limit).sort((a, b) => _msOf(a.startedDate) - _msOf(b.startedDate));
    if (rows.length < 2) { _emptyOverlay(c.canvas, 'Pas assez de tickets datés pour la frise', '⏱'); return; }
    const lt = t => (leadDays(t) > 0 ? leadDays(t) : cycleDays(t));

    // Fenêtre : du lundi précédant le 1er démarrage au lendemain de la dernière livraison.
    const xMin = _mondayOf(Math.min(...rows.map(t => _msOf(t.startedDate))));
    const xMax = _addDaysMs(_dayStart(Math.max(...rows.map(t => _msOf(t.resolvedDate)))), 1);
    const created = rows.map(t => _msOf(t.createdAt));
    const wait  = rows.map((t, i) => [Math.max(xMin, Number.isFinite(created[i]) ? Math.min(created[i], _msOf(t.startedDate)) : _msOf(t.startedDate)), _msOf(t.startedDate)]);
    const cycle = rows.map(t => [_msOf(t.startedDate), Math.max(_msOf(t.resolvedDate), _msOf(t.startedDate) + MS_DAY / 6)]);
    const clipped = rows.map((t, i) => Number.isFinite(created[i]) && created[i] < xMin);
    const outlier = rows.map(t => lt(t) > p85lt);
    const ctCol = t => _ctColor(cycleDays(t), p50ct, p85ct);
    const marks = _sprintMarks(rows, xMin, xMax);
    // Périodes BLOQUÉES pendant le cycle (démarré → livré), hachurées sur le segment.
    const blockedIv = rows.map(t => _blockedIntervals(t, _msOf(t.startedDate), _msOf(t.resolvedDate)));
    const nBlocked = blockedIv.filter(iv => iv.length).length;
    const stripes = _stripes('#DC2626');

    // Hachures des blocages, puis bout de ligne : cycle time (gras, couleur du percentile), blocage, lead ;
    // « ◂ créé le … » si l'attente est coupée.
    const afterRows = chart => {
        const { ctx: cx, chartArea, scales: { x, y } } = chart;
        const bars = chart.getDatasetMeta(1).data;
        cx.save();
        blockedIv.forEach((iv, i) => {
            const el = bars[i];
            if (!el || !iv.length) return;
            const h = el.height || 12, top = el.y - h / 2;
            for (const b of iv) {
                const x1 = Math.max(chartArea.left, x.getPixelForValue(b.from)), x2 = Math.min(chartArea.right, x.getPixelForValue(b.to));
                if (x2 <= x1) continue;
                cx.fillStyle = stripes; cx.fillRect(x1, top, x2 - x1, h);
                cx.strokeStyle = '#DC2626'; cx.lineWidth = 1; cx.strokeRect(x1 + 0.5, top + 0.5, x2 - x1 - 1, h - 1);
            }
        });
        cx.textBaseline = 'middle'; cx.textAlign = 'left';
        rows.forEach((t, i) => {
            const yp = y.getPixelForValue(i);
            _barEndText(cx, x.getPixelForValue(cycle[i][1]) + 8, yp, `${cycleDays(t)} j`, ctCol(t),
                [blockedIv[i].length ? `🚫 ${_blockedDaysTxt(blockedIv[i])} bloqué` : '', _shortPerson(_CT_LEADER(t))]);
            if (clipped[i]) {
                cx.font = '11px system-ui,sans-serif';
                cx.fillStyle = css('--text-muted') || '#94a3b8';
                cx.fillText(`◂ créé le ${fmtShortDate(_isoOf(created[i]))}`, chartArea.left + 4, yp);
            }
        });
        cx.restore();
    };

    const res = rows.map(t => t.resolvedDate).sort();
    const subtitle = [
        `${_plural(rows.length, 'ticket')} livré${rows.length > 1 ? 's' : ''} du ${fmtShortDate(res[0])} au ${fmtShortDate(res.at(-1))}${dated.length > rows.length ? ` (les plus récents sur ${dated.length})` : ''}`
            + `${nBlocked ? ` · ${nBlocked} bloqué${nBlocked > 1 ? 's' : ''} en cours de route 🚫` : ''}`
            + `${base.length > dated.length ? ` · ${base.length - dated.length} sans dates de cycle, non affiché${base.length - dated.length > 1 ? 's' : ''}` : ''}`
            + `${[opts.filterType && `type ${opts.filterType}`, opts.filterLeader && `lead ${opts.filterLeader}`].filter(Boolean).map(f => ` · filtre ${f}`).join('')}`,
        `CT moyen ${avgCT} j ouvrés · médiane ${p50ct} j · 85 % ≤ ${p85ct} j · attente = ${waitShare} % du lead time — repères : voir « Comment lire ce graphique »`,
    ];

    _copyLists.set(canvasId, {
        heading: 'Cycle Time — frise',
        subtitle: subtitle.join(' — '),
        columns: ['Démarré le', 'Livré le', 'Cycle time', 'Lead time', 'Lead'],
        rows: rows.map((t, i) => ({
            id: t.id, icon: TYPE_ICONS[t.type] || '•', title: t.title || '',
            flag: [blockedIv[i].length ? `🚫 ${_blockedDaysTxt(blockedIv[i])} bloqué` : '', outlier[i] ? '⚠ lead time > P85' : ''].filter(Boolean).join(' · '),
            cells: [fmtShortDate(t.startedDate), fmtShortDate(t.resolvedDate), `${cycleDays(t)} j`, `${lt(t)} j`, _shortPerson(_CT_LEADER(t))],
        })),
    });

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        plugins: [_timelinePlugin({ xMin, xMax, marks, afterRows })],
        data: {
            labels: rows.map((t, i) => _rowLabel(t, outlier[i])),
            datasets: [
                { label: 'Attente (créé → démarré)', data: wait, backgroundColor: '#6366F133', borderColor: '#6366F199', borderWidth: 1, borderSkipped: false, borderRadius: 3, grouped: false, barPercentage: 0.5 },
                { label: 'Cycle time (démarré → livré)', data: cycle, backgroundColor: rows.map(t => `${ctCol(t)}dd`), borderColor: rows.map((t, i) => (outlier[i] ? '#7f1d1d' : ctCol(t))), borderWidth: rows.map((_, i) => (outlier[i] ? 2 : 1)), borderSkipped: false, borderRadius: 3, grouped: false, barPercentage: 0.78 },
            ],
        },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            layout: { padding: { right: 150, top: marks.length ? 16 : 0 } },
            interaction: { mode: 'index', intersect: true },
            onClick(event, elements) {
                const t = elements.length ? rows[elements[0].index] : null;
                if (t) window.__squadBoard?.openTicketModal?.(t.id);
            },
            onHover(event, elements) { event.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
            scales: {
                x: _dateAxis(c, xMin, xMax, { muted, border }),
                y: _rowsAxis(rows.length, { color: css('--text') || '#0f172a' }),
            },
            plugins: {
                ...baseOpts().plugins,
                legend: { position: 'bottom', labels: { color: css('--text-secondary') || '#475569', font: { size: 12 }, usePointStyle: true, pointStyleWidth: 10,
                    generateLabels: () => [
                        { text: 'Attente (créé → démarré)', fillStyle: '#6366F133', strokeStyle: '#6366F199', lineWidth: 1, pointStyle: 'rect' },
                        { text: `Cycle time ≤ médiane (${p50ct} j)`, fillStyle: '#10B981dd', strokeStyle: '#10B981', lineWidth: 1, pointStyle: 'rect' },
                        { text: `Médiane → 85 % (${p50ct}–${p85ct} j)`, fillStyle: '#F59E0Bdd', strokeStyle: '#F59E0B', lineWidth: 1, pointStyle: 'rect' },
                        { text: `> 85 % (> ${p85ct} j)`, fillStyle: '#EF4444dd', strokeStyle: '#EF4444', lineWidth: 1, pointStyle: 'rect' },
                        ...(nBlocked ? [{ text: '🚫 Période bloquée', fillStyle: stripes, strokeStyle: '#DC2626', lineWidth: 1, pointStyle: 'rect' }] : []),
                        { text: 'Week-end / férié (non compté)', fillStyle: 'rgba(148,163,184,0.25)', strokeStyle: 'transparent', lineWidth: 0, pointStyle: 'rect' },
                        ...(marks.length ? [{ text: '▸ Début de sprint', fillStyle: 'transparent', strokeStyle: css('--primary') || '#0284C7', lineWidth: 1.5, pointStyle: 'line' }] : []),
                        { text: `⚠ lead time > ${p85lt} j`, fillStyle: 'transparent', strokeStyle: '#7f1d1d', lineWidth: 2, pointStyle: 'rectRounded' },
                    ] },
                    onClick: () => {} },
                subtitle: { display: true, text: subtitle, color: css('--text-secondary') || '#475569', font: { size: 12 }, align: 'start', padding: { bottom: marks.length ? 18 : 10 } },
                tooltip: {
                    ..._TT,
                    callbacks: {
                        title: items => { const t = rows[items[0]?.dataIndex]; return t ? [t.title || t.id, t.id] : ''; },
                        label: () => null,
                        afterBody: items => {
                            const i = items[0]?.dataIndex, t = rows[i];
                            if (!t) return [];
                            return [
                                `Créé le ${Number.isFinite(created[i]) ? fmtShortDate(_isoOf(created[i])) : '?'} · démarré le ${fmtShortDate(t.startedDate)} · livré le ${fmtShortDate(t.resolvedDate)}`,
                                `Cycle time ${cycleDays(t)} j · lead time ${lt(t)} j (jours ouvrés)`,
                                ...blockedIv[i].map(b => `🚫 Bloqué du ${fmtShortDate(_isoOf(b.from))} au ${fmtShortDate(_isoOf(b.to))} (${_blockedDaysTxt([b])})`),
                                _CT_LEADER(t) ? `Lead : ${_CT_LEADER(t)}` : '',
                                outlier[i] ? `⚠ Lead time au-delà du 85ᵉ percentile (${p85lt} j)` : '',
                            ].filter(Boolean);
                        },
                    },
                },
            },
        },
    }));
}

// ── WIP Age — mode « frise chronologique » (vue agrandie, défaut) ────────────────
// Chaque ticket EN COURS, de sa mise en travail jusqu'à aujourd'hui, sur le même calendrier que la frise du
// Cycle Time : segment clair = attente avant la mise en cours, plein = en cours (couleur 🟢 🟡 🔴 de son âge).
// Fenêtre bornée à 12 semaines : un ticket plus ancien est coupé au bord, « ◂ depuis le … ».
function _renderWipTimeline(canvasId, c, wip, p) {
    const { wipTotal, warnThresh, dangerThresh, p85, doneCount, colorOf } = p;
    const muted = css('--text-muted') || '#94a3b8', border = css('--border') || '#e2e8f0';
    const rows = wip.slice().sort((a, b) => a._startMs - b._startMs);
    const now = Date.now();
    const xMin = Math.max(_mondayOf(Math.min(...rows.map(t => t._startMs))), _mondayOf(_addDaysMs(now, -84)));
    const xMax = _addDaysMs(_dayStart(now), 1);
    const created = rows.map(t => _msOf(t.createdAt));
    const hasWait = rows.map((t, i) => t.startedSource === 'mise en cours' && Number.isFinite(created[i]) && created[i] < t._startMs);
    const wait = rows.map((t, i) => (hasWait[i] ? [Math.max(xMin, created[i]), Math.max(xMin, t._startMs)] : null));
    // Bloqué : le segment « en cours » s'arrête au début du blocage, la suite est hachurée en rouge
    // (blocage de date inconnue → toute la ligne hachurée).
    const blockFrom = rows.map(t => (t.status !== 'blocked' ? null : Math.max(xMin, Number.isFinite(t._blockedMs) ? Math.max(t._blockedMs, t._startMs) : t._startMs)));
    const work = rows.map((t, i) => (blockFrom[i] != null && blockFrom[i] <= Math.max(xMin, t._startMs) ? null : [Math.max(xMin, t._startMs), blockFrom[i] ?? now]));
    const blocked = rows.map((t, i) => (blockFrom[i] == null ? null : [blockFrom[i], now]));
    const nBlocked = rows.filter(t => t.status === 'blocked').length;
    const stripes = _stripes('#DC2626');
    const clipped = rows.map(t => t._startMs < xMin);
    const marks = _sprintMarks(rows, xMin, xMax);
    const sinceTxt = t => `${t.startedSource === 'mise en cours' ? 'depuis le' : 'créé le'} ${fmtShortDate(_isoOf(t._startMs))}`;

    const afterRows = chart => {
        const { ctx: cx, chartArea, scales: { x, y } } = chart;
        cx.save();
        cx.textBaseline = 'middle'; cx.textAlign = 'left';
        rows.forEach((t, i) => {
            const yp = y.getPixelForValue(i);
            _barEndText(cx, x.getPixelForValue(now) + 8, yp, `${t.age} j`, colorOf(t.age),
                [t.status === 'blocked' ? _blockedTxt(t) : (STATUS_LABELS[t.status] || t.status), _shortPerson(_CT_LEADER(t))]);
            if (clipped[i]) {
                cx.font = '11px system-ui,sans-serif';
                cx.fillStyle = css('--text') || '#0f172a';
                cx.fillText(`◂ ${sinceTxt(t)}`, chartArea.left + 4, yp);
            }
        });
        cx.restore();
    };

    const subtitle = [
        `${_plural(rows.length, 'ticket')} en cours${nBlocked ? `, dont ${nBlocked} bloqué${nBlocked > 1 ? 's' : ''} 🚫` : ''}${wipTotal > rows.length ? ` (les plus anciens sur ${wipTotal})` : ''} · âge = jours ouvrés depuis la mise en cours (à défaut : la création)`,
        `🟢 < ${warnThresh} j · 🟡 ≥ ${warnThresh} j · 🔴 ≥ ${dangerThresh} j — ${p85 ? `🔴 = 85ᵉ percentile du cycle time (${doneCount} tickets terminés), 🟡 = 70 % de ce seuil` : 'seuils fixes : pas assez de tickets terminés pour un P85'}`,
    ];

    _copyLists.set(canvasId, {
        heading: 'WIP Age — frise',
        subtitle: subtitle.join(' — '),
        columns: ['Âge', 'Statut', 'Depuis', 'Lead'],
        rows: rows.map(t => ({
            id: t.id, icon: TYPE_ICONS[t.type] || '•', title: t.title || '',
            flag: [t.status === 'blocked' ? _blockedTxt(t) : '', t.age >= dangerThresh ? '🔴 critique' : t.age >= warnThresh ? '🟡 attention' : ''].filter(Boolean).join(' · '),
            cells: [`${t.age} j`, STATUS_LABELS[t.status] || t.status, sinceTxt(t), _shortPerson(_CT_LEADER(t))],
        })),
    });

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        plugins: [_timelinePlugin({ xMin, xMax, marks, today: true, afterRows })],
        data: {
            labels: rows.map(t => _rowLabel(t)),
            datasets: [
                { label: 'Attente (créé → mis en cours)', data: wait, backgroundColor: '#6366F133', borderColor: '#6366F199', borderWidth: 1, borderSkipped: false, borderRadius: 3, grouped: false, barPercentage: 0.5 },
                { label: 'En cours (jusqu’à aujourd’hui)', data: work, backgroundColor: rows.map(t => `${colorOf(t.age)}dd`), borderColor: rows.map(t => colorOf(t.age)), borderWidth: 1, borderSkipped: false, borderRadius: 3, grouped: false, barPercentage: 0.78 },
                { label: 'Bloqué', data: blocked, backgroundColor: stripes, borderColor: '#DC2626', borderWidth: 1.5, borderSkipped: false, borderRadius: 3, grouped: false, barPercentage: 0.78 },
            ],
        },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            layout: { padding: { right: 200, top: 16 } },
            interaction: { mode: 'index', intersect: true },
            onClick(event, elements) {
                const t = elements.length ? rows[elements[0].index] : null;
                if (t) window.__squadBoard?.openTicketModal?.(t.id);
            },
            onHover(event, elements) { event.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
            scales: {
                x: _dateAxis(c, xMin, xMax, { muted, border, reserved: 530 }),
                y: _rowsAxis(rows.length, { color: css('--text') || '#0f172a' }),
            },
            plugins: {
                ...baseOpts().plugins,
                legend: { position: 'bottom', labels: { color: css('--text-secondary') || '#475569', font: { size: 12 }, usePointStyle: true, pointStyleWidth: 10,
                    generateLabels: () => [
                        { text: 'Attente (créé → mis en cours)', fillStyle: '#6366F133', strokeStyle: '#6366F199', lineWidth: 1, pointStyle: 'rect' },
                        { text: `En cours < ${warnThresh} j`, fillStyle: '#10B981dd', strokeStyle: '#10B981', lineWidth: 1, pointStyle: 'rect' },
                        { text: `${warnThresh}–${dangerThresh} j`, fillStyle: '#F59E0Bdd', strokeStyle: '#F59E0B', lineWidth: 1, pointStyle: 'rect' },
                        { text: `≥ ${dangerThresh} j`, fillStyle: '#EF4444dd', strokeStyle: '#EF4444', lineWidth: 1, pointStyle: 'rect' },
                        ...(nBlocked ? [{ text: '🚫 Bloqué (depuis le drapeau / statut)', fillStyle: stripes, strokeStyle: '#DC2626', lineWidth: 1.5, pointStyle: 'rect' }] : []),
                        { text: 'Week-end / férié (non compté)', fillStyle: 'rgba(148,163,184,0.25)', strokeStyle: 'transparent', lineWidth: 0, pointStyle: 'rect' },
                        ...(marks.length ? [{ text: '▸ Début de sprint', fillStyle: 'transparent', strokeStyle: css('--primary') || '#0284C7', lineWidth: 1.5, pointStyle: 'line' }] : []),
                        { text: "Aujourd'hui", fillStyle: 'transparent', strokeStyle: '#EF4444', lineWidth: 1.5, pointStyle: 'line' },
                    ] },
                    onClick: () => {} },
                subtitle: { display: true, text: subtitle, color: css('--text-secondary') || '#475569', font: { size: 12 }, align: 'start', padding: { bottom: 18 } },
                tooltip: {
                    ..._TT,
                    callbacks: {
                        title: items => { const t = rows[items[0]?.dataIndex]; return t ? [t.title || t.id, t.id] : ''; },
                        label: () => null,
                        afterBody: items => {
                            const i = items[0]?.dataIndex, t = rows[i];
                            if (!t) return [];
                            return [
                                `${STATUS_LABELS[t.status] || t.status} · ${sinceTxt(t)}${Number.isFinite(created[i]) && hasWait[i] ? ` · créé le ${fmtShortDate(_isoOf(created[i]))}` : ''}`,
                                `Âge ${t.age} j ouvrés (${t.age >= dangerThresh ? 'critique 🔴' : t.age >= warnThresh ? 'attention 🟡' : 'OK 🟢'})`,
                                t.status === 'blocked' ? (Number.isFinite(t._blockedMs) ? `🚫 Bloqué depuis le ${fmtShortDate(_isoOf(t._blockedMs))} (${t._blockedDays} j ouvrés)` : '🚫 Bloqué — début du blocage absent de l’historique récent') : '',
                                _CT_LEADER(t) ? `Lead : ${_CT_LEADER(t)}` : '',
                            ].filter(Boolean);
                        },
                    },
                },
            },
        },
    }));
}

// ── Cycle Time — mode "nuage de points" (scatter temporel) ─────────────────────
// X = date de résolution, Y = cycle time, couleur = percentile CT.
// Révèle la tendance dans le temps (flux qui se dégrade / s'améliore).
function _renderCycleScatter(canvasId, c, base, p) {
    const { p50ct, p85ct, p50lt, p85lt, avgCT, avgLT, waitShare, muted, border, zoomed, trend, subtitle } = p;
    const lt = (t) => leadDays(t) > 0 ? leadDays(t) : cycleDays(t);
    // Ordonné par date de résolution (axe temps).
    const items = base.slice().sort((a, b) => (a.resolvedDate || '') < (b.resolvedDate || '') ? -1 : 1);
    const points = items.map(t => ({
        x: new Date(t.resolvedDate || Date.now()).getTime(),
        y: cycleDays(t),
        _t: t,
    }));
    const ptColors = items.map(t => _ctColor(cycleDays(t), p50ct, p85ct) + 'cc');
    const isOutlier = items.map(t => lt(t) > p85lt);

    // (b) Tendance : moyenne mobile sur N tickets (granularité retenue avec l'utilisateur).
    const N = Math.max(3, Math.min(7, Math.round(items.length / 4)));
    const trendPts = trend ? points.map((pt, i) => {
        const from = Math.max(0, i - N + 1);
        const slice = points.slice(from, i + 1);
        const avg = slice.reduce((s, q) => s + q.y, 0) / slice.length;
        return { x: pt.x, y: Math.round(avg * 10) / 10 };
    }) : [];

    const datasets = [{
        type: 'scatter',
        label: 'Cycle time (par ticket)',
        data: points,
        pointBackgroundColor: ptColors,
        pointBorderColor: items.map((t, i) => isOutlier[i] ? '#7f1d1d' : 'transparent'),
        pointBorderWidth: items.map((_, i) => isOutlier[i] ? 2.5 : 0),
        pointRadius: zoomed ? 6 : 4,
        pointHoverRadius: zoomed ? 8 : 6,
    }];
    if (trend) {
        datasets.push({
            type: 'line',
            label: `Tendance (moy. mobile ${N})`,
            data: trendPts,
            borderColor: '#0891b2',
            backgroundColor: 'rgba(8,145,178,0.08)',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            fill: false,
        });
    }

    // Bandes de percentile CT en fond (vert / orange / rouge).
    const bandsPlugin = {
        id: 'ctBands',
        beforeDatasetsDraw(chart) {
            const { ctx: cx, chartArea, scales: { y } } = chart;
            if (!y || !chartArea) return;
            const yTop = (v) => Math.max(chartArea.top, Math.min(chartArea.bottom, y.getPixelForValue(v)));
            const zones = [
                [chartArea.top, yTop(p85ct), 'rgba(239,68,68,0.06)'],   // > P85
                [yTop(p85ct), yTop(p50ct), 'rgba(245,158,11,0.06)'],     // P50–P85
                [yTop(p50ct), chartArea.bottom, 'rgba(16,185,129,0.06)'],// ≤ P50
            ];
            cx.save();
            zones.forEach(([top, bot, color]) => {
                cx.fillStyle = color;
                cx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bot - top);
            });
            // Lignes P50 / P85.
            [[p50ct, '#10B981', `CT méd. ${p50ct}j`], [p85ct, '#EF4444', `CT 85% ${p85ct}j`]].forEach(([v, col, lbl]) => {
                const yp = yTop(v);
                cx.beginPath();
                cx.setLineDash([5, 4]);
                cx.strokeStyle = col;
                cx.lineWidth = 1.25;
                cx.moveTo(chartArea.left, yp);
                cx.lineTo(chartArea.right, yp);
                cx.stroke();
                cx.setLineDash([]);
                cx.font = `600 ${zoomed ? 12 : 9}px system-ui,sans-serif`;
                cx.fillStyle = col;
                cx.textAlign = 'right';
                cx.textBaseline = 'bottom';
                cx.fillText(lbl, chartArea.right - 4, yp - 2);
            });
            cx.restore();
        },
    };

    // Agrandi : clé des tickets au-delà du 85ᵉ percentile (ou outliers de lead time) à côté de leur point,
    // CLIQUABLE (ouvre la fiche) : les zones dessinées sont mémorisées pour le test de clic / survol.
    let idBoxes = [];
    const idsPlugin = {
        id: 'ctScatterIds',
        afterDatasetsDraw(chart) {
            idBoxes = [];
            if (!zoomed) return;
            const meta = chart.getDatasetMeta(0);
            const { ctx: cx } = chart;
            cx.save();
            cx.font = '600 11px system-ui,sans-serif';
            cx.fillStyle = css('--primary') || '#0284C7';
            cx.textAlign = 'left';
            cx.textBaseline = 'middle';
            items.forEach((t, i) => {
                if (!(cycleDays(t) > p85ct || isOutlier[i])) return;
                const el = meta.data[i];
                if (!el) return;
                const x0 = el.x + 9, w = cx.measureText(t.id).width;
                cx.fillText(t.id, x0, el.y);
                cx.fillRect(x0, el.y + 7, w, 1);   // souligné : se lit comme un lien
                idBoxes.push({ x1: x0 - 2, x2: x0 + w + 2, y1: el.y - 9, y2: el.y + 9, id: t.id });
            });
            cx.restore();
        },
    };
    const idAt = (event) => idBoxes.find(b => event.x >= b.x1 && event.x <= b.x2 && event.y >= b.y1 && event.y <= b.y2)?.id || null;

    if (zoomed) _copyLists.set(canvasId, {
        heading: 'Cycle Time — nuage',
        subtitle: (subtitle || []).join(' — '),
        columns: ['Cycle time', 'Lead time', 'Livré le', 'Lead'],
        rows: items.map((t, i) => ({
            id: t.id, icon: TYPE_ICONS[t.type] || '•', title: t.title || '',
            flag: cycleDays(t) > p85ct ? '🔴 > P85' : isOutlier[i] ? '⚠ lead time > P85' : '',
            cells: [`${cycleDays(t)} j`, `${lt(t)} j`, fmtShortDate(t.resolvedDate), _shortPerson(_CT_LEADER(t))],
        })),
    });

    _charts.set(canvasId, new Chart(c, {
        type: 'scatter',
        plugins: [bandsPlugin, idsPlugin],
        data: { datasets },
        options: {
            ...baseOpts(),
            interaction: { mode: 'nearest', intersect: true },
            onClick(event, elements) {
                const id = elements.length ? points[elements[0].index]?._t?.id : idAt(event);
                if (id) window.__squadBoard?.openTicketModal?.(id);
            },
            onHover(event, elements) {
                event.native.target.style.cursor = elements.length || idAt(event) ? 'pointer' : 'default';
            },
            scales: {
                x: {
                    // Axe linéaire de timestamps (pas de dépendance à un adaptateur de date
                    // Chart.js, absent du bundle) ; on formate les ticks nous-mêmes.
                    type: 'linear',
                    ticks: {
                        color: muted, font: { size: zoomed ? 12 : 9 },
                        maxRotation: 0, autoSkipPadding: 16,
                        callback: (v) => fmtShortDate(new Date(v).toISOString()),
                    },
                    grid: { color: border },
                    title: { display: true, text: 'Date de résolution', font: { size: zoomed ? 13 : 10 }, color: muted },
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: muted, font: { size: zoomed ? 12 : 9 } },
                    grid: { color: border },
                    title: { display: true, text: 'Cycle time (jours ouvrés)', font: { size: zoomed ? 13 : 10 }, color: muted },
                },
            },
            plugins: {
                ...baseOpts().plugins,
                legend: { position: 'bottom', labels: { color: css('--text-secondary') || '#475569', font: { size: zoomed ? 12 : 10 }, usePointStyle: true } },
                subtitle: {
                    display: !!subtitle, text: subtitle || '',
                    color: css('--text-secondary') || '#475569',
                    font: { size: 12 }, align: 'start', padding: { bottom: 10 },
                },
                tooltip: {
                    ..._TT,
                    callbacks: {
                        title: items => {
                            const t = items[0]?.raw?._t;
                            return t ? [t.title || t.id, `${t.id} · ${fmtShortDate(t.resolvedDate)}`] : '';
                        },
                        label: item => {
                            const t = item.raw?._t;
                            if (!t) return '';
                            return `Cycle Time : ${cycleDays(t)}j  |  Lead Time : ${lt(t)}j`;
                        },
                        footer: () => `Moy CT: ${avgCT}j · Moy LT: ${avgLT}j · CT méd: ${p50ct}j · CT 85%: ${p85ct}j · Attente: ${waitShare}% du lead time`,
                    },
                },
            },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. WIP Age
// ══════════════════════════════════════════════════════════════════════════════
export function renderWIPAge(canvasId, tickets, opts = {}) {
    _register(canvasId, 'wipage', 'WIP Age — âge des tickets en cours', renderWIPAge, [tickets, opts]);
    const c = ctx(canvasId); if (!c || !window.Chart) return; kill(canvasId);
    _clearEmptyOverlay(c.canvas);

    const zoomed = _isZoom(canvasId);
    const limit = opts.limit || _displayLimit(canvasId, 15, 40);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Bloqués COMPRIS (3.216.0) : ils sont en cours, et ce sont ceux à surveiller — ils n'apparaissaient pas.
    const WIP_STATUSES = ['inprog', 'review', 'test', 'blocked'];
    const wipTotal = tickets.filter(t => WIP_STATUSES.includes(t.status)).length;
    const wip = tickets
        .filter(t => WIP_STATUSES.includes(t.status))
        .map(t => {
            const started = t.startedDate ? new Date(t.startedDate) : t.createdAt ? new Date(t.createdAt) : today;
            const startedSource = t.startedDate ? 'mise en cours' : t.createdAt ? 'création (pas de mise en cours)' : 'aujourd\'hui (fallback)';
            const age = wipAgeDays(started, new Date());   // jours OUVRÉS (utils/workdays.js)
            const blockedMs = t.status === 'blocked' ? _blockedSinceMs(t) : NaN;
            return { ...t, age, startedDate: started.toISOString().slice(0, 10), startedSource, _startMs: started.getTime(),
                _blockedMs: blockedMs, _blockedDays: Number.isFinite(blockedMs) ? workdaysBetween(blockedMs, new Date()) : null };
        })
        .sort((a, b) => b.age - a.age)
        .slice(0, limit);

    if (!wip.length) {
        _emptyOverlay(c.canvas, 'Aucun ticket en cours', '✅');
        return;
    }

    // P85 from done tickets (seuil "85% des tickets done ont fini en moins de X jours")
    const doneWithCT = tickets.filter(t => t.status === 'done' && cycleDays(t) > 0);
    let p85 = null;
    if (doneWithCT.length >= 3) {
        const sorted = doneWithCT.map(t => cycleDays(t)).sort((a, b) => a - b);
        p85 = sorted[Math.ceil(sorted.length * 0.85) - 1];
    }
    // Fallback : seuils fixes (Kanban classique : ~7j alerte, ~14j critique) si p85 non calculable
    const warnThresh = p85 ? Math.round(p85 * 0.7) : 7;
    const dangerThresh = p85 || 14;
    const thresholdSource = p85 ? `p85 cycle time = ${p85}j (calculé sur ${doneWithCT.length} tickets done)` : `fallback fixe (orange ≥7j, rouge ≥14j) — pas assez de tickets done pour calculer le p85`;

    const _color = (age) => age >= dangerThresh ? '#EF4444' : age >= warnThresh ? '#F59E0B' : '#10B981';
    const _zoneLabel = (age) => age >= dangerThresh ? 'critique 🔴' : age >= warnThresh ? 'attention 🟡' : 'OK 🟢';

    // Agrandi : FRISE par défaut (3.216.0) — barres au choix (sélecteur « Vue » de la popin).
    _setControls(canvasId, { modes: [{ value: 'timeline', label: '⟿ Frise' }, { value: 'bars', label: '▭ Barres' }] });
    if (zoomed && (opts.mode || 'timeline') === 'timeline') {
        _renderWipTimeline(canvasId, c, wip, { wipTotal, warnThresh, dangerThresh, p85, doneCount: doneWithCT.length, colorOf: _color });
        return;
    }

    // Agrandi : icône du type + clé + titre tronqué proprement (le ticket se reconnaît sans survol).
    const labels = wip.map(t => {
        if (!zoomed) return `${t.status === 'blocked' ? '🚫 ' : ''}${t.id} · ${(t.title || '').slice(0, 25)}`;
        return _rowLabel(t);
    });
    const data = wip.map(t => t.age);

    // Agrandi : seuils tracés et nommés + valeurs au bout de chaque barre — autoporteur, image copiée comprise.
    const wipPlugin = {
        id: 'wipExplain',
        afterDatasetsDraw(chart) {
            if (!zoomed) return;
            const { ctx: cx, chartArea, scales: { x, y } } = chart;
            if (!x || !y || !chartArea) return;
            cx.save();
            [[warnThresh, '#F59E0B', `🟡 ${warnThresh} j`], [dangerThresh, '#EF4444', `🔴 ${dangerThresh} j${p85 ? ' (P85)' : ''}`]].forEach(([v, col, lbl]) => {
                const xp = x.getPixelForValue(v);
                if (xp < chartArea.left || xp > chartArea.right) return;
                cx.beginPath(); cx.setLineDash([5, 4]); cx.strokeStyle = col; cx.lineWidth = 1.25;
                cx.moveTo(xp, chartArea.top); cx.lineTo(xp, chartArea.bottom); cx.stroke(); cx.setLineDash([]);
                cx.font = '600 12px system-ui,sans-serif'; cx.fillStyle = col; cx.textAlign = 'center'; cx.textBaseline = 'bottom';
                cx.fillText(lbl, xp, chartArea.top - 2);
            });
            cx.textAlign = 'left'; cx.textBaseline = 'middle';
            wip.forEach((t, i) => {
                const since = `${t.startedSource === 'mise en cours' ? 'depuis le' : 'créé le'} ${fmtShortDate(t.startedDate)}`;
                _barEndText(cx, x.getPixelForValue(t.age) + 8, y.getPixelForValue(i), `${t.age} j`, _color(t.age),
                    [t.status === 'blocked' ? _blockedTxt(t) : (STATUS_LABELS[t.status] || t.status), since, _shortPerson(_CT_LEADER(t))]);
            });
            cx.restore();
        },
    };
    const colors = wip.map(t => _color(t.age));

    const datasets = [
        { label: 'Âge (jours ouvrés)', data, backgroundColor: colors, borderRadius: 3 },
    ];
    if (p85) {
        datasets.push({
            label: `Seuil p85 (${p85}j)`, type: 'line',
            data: new Array(wip.length).fill(p85),
            borderColor: '#EF444488', borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false,
            xAxisID: 'x',
        });
    }

    if (zoomed) _copyLists.set(canvasId, {
        heading: 'WIP Age — tickets en cours',
        subtitle: `${_plural(wip.length, 'ticket')} sur ${wipTotal} en cours · jours ouvrés · 🟡 ≥ ${warnThresh} j · 🔴 ≥ ${dangerThresh} j${p85 ? ' (P85 du cycle time)' : ' (seuils fixes)'}`,
        columns: ['Âge', 'Statut', 'Depuis', 'Lead'],
        rows: wip.map(t => ({
            id: t.id, icon: TYPE_ICONS[t.type] || '•', title: t.title || '',
            flag: [t.status === 'blocked' ? _blockedTxt(t) : '', t.age >= dangerThresh ? '🔴 critique' : t.age >= warnThresh ? '🟡 attention' : ''].filter(Boolean).join(' · '),
            cells: [`${t.age} j`, STATUS_LABELS[t.status] || t.status, `${t.startedSource === 'mise en cours' ? '' : 'créé le '}${fmtShortDate(t.startedDate)}`, _shortPerson(_CT_LEADER(t))],
        })),
    });

    _charts.set(canvasId, new Chart(c, {
        type: 'bar',
        plugins: [wipPlugin],
        data: { labels, datasets },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            layout: { padding: { right: zoomed ? 330 : 0, top: zoomed ? 18 : 0 } },
            onClick(event, elements) {
                const t = elements.length ? wip[elements[0].index] : null;
                if (t) window.__squadBoard?.openTicketModal?.(t.id);
            },
            onHover(event, elements) {
                event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            plugins: {
                ...baseOpts().plugins,
                subtitle: {
                    display: zoomed,
                    text: zoomed ? [
                        `${_plural(wip.length, 'ticket')} en cours affiché${wip.length > 1 ? 's' : ''} sur ${wipTotal}${wipTotal > wip.length ? ' (les plus anciens)' : ''} · âge = jours ouvrés depuis la mise en cours (à défaut : la création)`,
                        `🟢 < ${warnThresh} j · 🟡 ≥ ${warnThresh} j · 🔴 ≥ ${dangerThresh} j — ${p85 ? `🔴 = 85ᵉ percentile du cycle time (${doneWithCT.length} tickets terminés), 🟡 = 70 % de ce seuil` : 'seuils fixes : pas assez de tickets terminés pour un P85'}`,
                    ] : '',
                    color: css('--text-secondary') || '#475569',
                    font: { size: 12 }, align: 'start', padding: { bottom: 10 },
                },
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
                x: { ...baseOpts().scales.x, ticks: { ...baseOpts().scales.x.ticks, font: { size: zoomed ? 12 : 10 } },
                     title: { display: true, text: 'Jours ouvrés en WIP', font: { size: zoomed ? 13 : 10 } } },
                y: _rowsAxis(wip.length, { base: zoomed ? 12 : 9 }),
            },
        },
    }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. Throughput
// ══════════════════════════════════════════════════════════════════════════════
export function renderThroughput(canvasId, tickets, sprint, events = []) {
    _register(canvasId, 'throughput', 'Throughput — débit quotidien', renderThroughput, [tickets, sprint, events]);
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
    _register(canvasId, 'velocity', 'Vélocité par sprint', renderVelocityChart, [data, opts]);
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
    _register(canvasId, 'pivelocity', 'Vélocité PI (estimé / buffer / réalisé)', renderPIVelocityChart, [data, velocityTarget]);
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
    _register(canvasId, 'status', 'Répartition par statut', renderStatusChart, [counts]);
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
    _register(canvasId, 'type', 'Répartition par type', renderTypeChart, [counts]);
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
    // On purge le registre de zoom des canvas non éphémères (zoom-*) — le re-render
    // de la vue ré-enregistrera les graphiques encore présents.
    for (const id of [..._chartMeta.keys()]) {
        if (!id.startsWith('zoom-')) _chartMeta.delete(id);
    }
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
