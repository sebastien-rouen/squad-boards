/**
 * Sections « Roadmap / PI » (#reports/<équipe>/roadmap) et « Burnup du PI » (…/piburnup).
 *
 * ── Roadmap ──
 * Features du PI AFFICHÉ (avant 3.212.0 : toutes les features de l'équipe, tous PI confondus —
 * « 84/169 » pour Fuego qui en a 9 au PI 31). Appartenance au PI = même règle que
 * `_matchFeaturePi` (roadmap.js) : `piSprint`, puis `sprintName`, puis labels, via `extractPiNum`.
 * Avancement = tickets ENFANTS. ⚠️ Dans les données JIRA, `t.epic` porte l'id de la FEATURE
 * parente (0 ticket sur 4 845 ne pointe un epic du store) ; la chaîne feature → epic → ticket
 * est gardée en second recours, comme dans roadmap.js. Une feature sans enfant n'est PAS créditée
 * de l'avancement de toute l'équipe (repli de roadmap.js) : elle est dite « sans ticket ».
 * Météo d'une feature = `weatherRel(avancement, temps écoulé du PI)` — l'échelle de la météo des
 * équipes (utils/meteo.js). Les features « Buffer » (`isBufferItem`) sont une réserve de capacité,
 * pas un livrable : comptées à part.
 *
 * ── Burnup du PI ── (remplace l'« Epic Burndown », vide pour toutes les équipes pour la raison
 * ci-dessus). Périmètre = `belongedToPi` (reports compris) ; réalisé = terminé ET resté dans un
 * sprint du PI (règle engagement / réalisé de sprint-scope.js — un ticket du PI fini plus tard
 * ailleurs n'est pas crédité ici). Séries : `burnSeries` (utils/burn.js) via `renderBurnup`, le
 * même calcul que les burnups de sprint : périmètre daté à la CRÉATION du ticket.
 */

import {
    esc, pct, sumBy, extractPiNum, isBufferItem, rollupStatus, weatherRel, belongedToPi,
    burnSeries, burnDayKey, METEO_GLYPH, METEO_LABEL, emptyStateHtml,
} from '../utils.js';
import { STATUS_LABELS } from '../config.js';
import { renderBurnup } from '../components/charts.js';
import { store } from '../state.js';
import { B, E, SB, CS } from './reports-fmt.js';
import { windowLabel } from './reports-scope.js';

const DAY_MS = 86_400_000;
const WEATHER_RANK = { storm: 0, rain: 1, cloud: 2, sun: 3, none: 4 };
/** Au-delà, un groupe (sauf « En cours ») se replie : 169 features sur « Toutes équipes » = 7 700 px. */
const GROUP_OPEN_MAX = 8;
const plural = (n, s = 's') => (n > 1 ? s : '');
const clr = p => (p >= 80 ? 'green' : p >= 50 ? 'yellow' : 'red');
/** Pictogramme d'une feature : ⏳ si pas démarrée, sinon sa météo. */
const glyph = r => (r.status === 'todo' ? '⏳' : METEO_GLYPH[r.weather] || '⚪');

/** Même règle que `_matchFeaturePi` de roadmap.js — les deux vues doivent compter pareil. */
const featureInPi = (f, piNum) => !!piNum
    && [f.piSprint, f.sprintName, ...(Array.isArray(f.labels) ? f.labels : [])].some(v => v && extractPiNum(v) === piNum);

/** Un seul calcul pour les quatre formats. */
export function buildRoadmapData(ctx) {
    const { features = [], teamTickets = [], displayPiNum: piNum, piWindow, team } = ctx;
    const byParent = new Map();
    for (const t of teamTickets) if (t.epic) (byParent.get(t.epic) || byParent.set(t.epic, []).get(t.epic)).push(t);
    const epicsByFeature = new Map();
    for (const e of store.get('epics') || []) if (e.feature) (epicsByFeature.get(e.feature) || epicsByFeature.set(e.feature, []).get(e.feature)).push(e);

    const time = piWindow?.elapsed ?? null;
    const rows = features.filter(f => featureInPi(f, piNum)).map(f => {
        const children = [...(byParent.get(f.id) || []), ...(epicsByFeature.get(f.id) || []).flatMap(e => byParent.get(e.id) || [])];
        const done = children.filter(t => t.status === 'done');
        const childPts = sumBy(children, t => t.points);
        const status = rollupStatus(children, f.status) || 'todo';
        const progress = children.length ? pct(done.length, children.length) : (status === 'done' ? 100 : 0);
        // Météo réservée aux features DÉMARRÉES : une feature planifiée en fin de PI n'est pas
        // « très en retard » à mi-PI (11 ⛈️ sur 19 pour Fuego au PI 31) ; elle est rangée
        // « Pas démarrées », ce qui suffit à la signaler.
        const weather = status === 'done' ? 'sun' : children.length && status !== 'todo' ? weatherRel(progress, time) : 'none';
        return {
            f, status, weather, progress, n: children.length, done: done.length,
            pts: f.points || childPts || 0, donePts: sumBy(done, t => t.points),
            buffer: isBufferItem(f),
        };
    });

    const deliverables = rows.filter(r => !r.buffer);
    const byWeather = (a, b) => WEATHER_RANK[a.weather] - WEATHER_RANK[b.weather] || a.progress - b.progress;
    const groups = [
        { key: 'inprog', icon: '🔄', label: 'En cours', rows: deliverables.filter(r => r.status === 'inprog' || r.status === 'blocked').sort(byWeather) },
        { key: 'todo', icon: '⏳', label: 'Pas démarrées', rows: deliverables.filter(r => r.status === 'todo' || !r.status) },
        { key: 'done', icon: '✅', label: 'Livrées', rows: deliverables.filter(r => r.status === 'done') },
        { key: 'buffer', icon: '🔄', label: 'Buffer (réserve de capacité)', rows: rows.filter(r => r.buffer) },
    ].filter(g => g.rows.length);

    return {
        piNum, piWindow, time, teamLabel: team && team !== 'all' ? team : 'Toutes équipes',
        total: deliverables.length, delivered: deliverables.filter(r => r.status === 'done').length,
        inProgress: deliverables.filter(r => r.status === 'inprog' || r.status === 'blocked').length,
        notStarted: deliverables.filter(r => r.status === 'todo' || !r.status).length,
        atRisk: deliverables.filter(r => r.weather === 'rain' || r.weather === 'storm').length,
        pts: sumBy(deliverables, r => r.pts), donePts: sumBy(deliverables, r => r.donePts),
        groups,
    };
}

const featTxt = r => `${r.f.title}${r.n ? ` — ${r.progress} % (${r.done}/${r.n} tickets${r.pts ? `, ${r.pts} pts` : ''})` : ' — sans ticket rattaché'}`;
/**
 * Lien JIRA d'une feature (`jiraUrl` du store), ou '' si l'URL n'est pas configurée. URL NUE :
 * Slack, Teams et Confluence la rendent cliquable au collage — le format `<url|texte>` s'affiche,
 * lui, en littéral dans le composeur Slack (cf sprint_tickets_modal.js, 3.6.31).
 */
const browseUrl = f => {
    const base = String(store.get('jiraUrl') || '').replace(/\/$/, '');
    return base && f?.id ? `${base}/browse/${f.id}` : '';
};
const headTxt = d => `PI ${d.piNum}${d.time != null ? ` · ${d.time} % du temps écoulé` : ''}`;

// ── Rendu riche (format « Texte » de la vue) ─────────────────────────────────

function featureHtml(r) {
    return `<div class="rpt-rm-feat rpt-rm-feat--${esc(r.status)}">
        <span class="rpt-rm-meteo" title="${esc(r.status === 'todo' ? 'Pas démarrée' : METEO_LABEL[r.weather] || '')}">${glyph(r)}</span>
        <span class="rpt-rm-title">${esc(r.f.title || r.f.id)}</span>
        ${r.n ? `<span class="rpt-rm-bar" aria-hidden="true"><i class="rpt-pi-bar-fill rpt-pi-bar--${clr(r.progress)}" style="width:${r.progress}%"></i></span>
        <span class="rpt-rm-count">${r.done}/${r.n}${r.pts ? ` · ${r.pts} pts` : ''}</span>
        <span class="rpt-rm-pct rpt-pi-pct--${clr(r.progress)}">${r.progress}%</span>`
        : `<span class="rpt-rm-count">sans ticket</span>`}
    </div>`;
}

function htmlReport(ctx) {
    const d = buildRoadmapData(ctx);
    if (!d.piNum) return emptyStateHtml({ icon: '🗓️', title: 'Aucun PI identifié', text: 'Configurer « Sprint & PI » dans les Paramètres.' });
    if (!d.groups.length) return emptyStateHtml({ icon: '🗺️', title: `Aucune feature au PI ${d.piNum}`, text: `Aucune feature de ${d.teamLabel} n'est rattachée à ce PI (champ PI, sprint ou label).` });
    const featPct = pct(d.delivered, d.total);
    return `
    <div class="rpt-pi-card">
        <p class="rpt-flow-period">🗓️ ${esc(windowLabel(d.piWindow))}${d.piWindow?.projected ? ' (dates projetées)' : ''}${d.time != null ? ` · ${d.time} % du temps écoulé` : ''}</p>
        <div class="rpt-metrics-row rpt-flow-metrics">
            <div class="rpt-metric"><span class="rpt-metric-label">Features livrées</span><span class="rpt-metric-val">${d.delivered}/${d.total}</span>
                <div class="rpt-metric-bar"><div class="rpt-pi-bar--${clr(featPct)}" style="width:${featPct}%"></div></div></div>
            ${d.pts ? `<div class="rpt-metric"><span class="rpt-metric-label">Points des features</span><span class="rpt-metric-val">${d.donePts}/${d.pts}</span></div>` : ''}
            <div class="rpt-metric"><span class="rpt-metric-label">En cours</span><span class="rpt-metric-val">${d.inProgress}</span>
                ${d.atRisk ? `<span class="rpt-metric-pct rpt-pi-pct--red">dont ${d.atRisk} en retard</span>` : ''}</div>
            <div class="rpt-metric"><span class="rpt-metric-label">Pas démarrées</span><span class="rpt-metric-val">${d.notStarted}</span></div>
        </div>
        ${d.groups.map(g => `
        <details class="rpt-pi-section rpt-rm-grp"${g.key === 'inprog' || g.rows.length <= GROUP_OPEN_MAX ? ' open' : ''}>
            <summary class="rpt-pi-h">${g.icon} ${esc(g.label)}<span class="rpt-pi-h-count">${g.rows.length}</span></summary>
            <div class="rpt-rm-list">${g.rows.map(featureHtml).join('')}</div>
        </details>`).join('')}
        <p class="rpt-flow-muted">Météo d'une feature démarrée : avancement de ses tickets comparé au temps écoulé du PI (☀️ en avance · ⛅ dans les temps · 🌧️ en retard · ⛈️ très en retard). ⏳ = pas démarrée.</p>
    </div>`;
}

// ── Formats d'export ─────────────────────────────────────────────────────────

function textReport(ctx) {
    const d = buildRoadmapData(ctx);
    if (!d.piNum) return '🗺️ Roadmap\n\nAucun PI identifié.';
    let r = `🗺️ Roadmap — ${d.teamLabel} — ${headTxt(d)}\n\n`;
    r += `- 📦 Features livrées : ${d.delivered}/${d.total}${d.pts ? ` (${d.donePts}/${d.pts} pts)` : ''}\n`;
    r += `- 🔄 En cours : ${d.inProgress}${d.atRisk ? ` (dont ${d.atRisk} en retard sur le temps)` : ''}\n`;
    r += `- ⏳ Pas démarrées : ${d.notStarted}\n`;
    for (const g of d.groups) {
        r += `\n${g.icon} ${g.label}\n`;
        for (const row of g.rows) {
            const url = browseUrl(row.f);
            r += `- ${glyph(row)} ${featTxt(row)}${url ? ` — ${url}` : ''}\n`;
        }
    }
    return r;
}

function slackReport(ctx) {
    const d = buildRoadmapData(ctx);
    let r = `<div class="s-header">${E('🗺️')} Roadmap · ${esc(d.teamLabel)}</div><hr class="s-divider">`;
    if (!d.piNum) return `${r}Aucun PI identifié`;
    r += `<span class="s-muted">${esc(headTxt(d))}</span>\n`;
    const fp = pct(d.delivered, d.total);
    r += `${E('📦')} ${B('Features livrées')} : ${d.delivered}/${d.total} ${SB(fp + '%', clr(fp))}`;
    r += ` · ${d.inProgress} en cours${d.atRisk ? ` ${SB(`dont ${d.atRisk} en retard`, 'red')}` : ''} · ${d.notStarted} pas démarrée${plural(d.notStarted)}`;
    r += '\n';
    for (const g of d.groups) {
        r += `\n${E(g.icon)} ${B(g.label.toUpperCase())}\n`;
        for (const row of g.rows) {
            const url = browseUrl(row.f);
            r += `${E(glyph(row))} ${esc(row.f.title)}`;
            r += row.n ? ` <span class="s-muted">${row.progress}% · ${row.done}/${row.n}</span>` : ` <span class="s-muted">sans ticket</span>`;
            // Copie = textContent de l'aperçu : l'URL y reste nue, Slack la rend cliquable au collage.
            r += url ? ` <a class="s-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>\n` : '\n';
        }
    }
    return r;
}

function confluenceReport(ctx) {
    const d = buildRoadmapData(ctx);
    let r = `<h2>Roadmap — ${esc(d.teamLabel)}</h2>`;
    if (!d.piNum) return `${r}<p>Aucun PI identifié</p>`;
    r += `<p><em>${esc(headTxt(d))}</em> — <strong>Features livrées :</strong> ${d.delivered}/${d.total}`;
    r += ` — <strong>En cours :</strong> ${d.inProgress}${d.atRisk ? ` (${CS(`dont ${d.atRisk} en retard`, 'red')})` : ''} — <strong>Pas démarrées :</strong> ${d.notStarted}`;
    r += `</p><table><tr><th>Météo</th><th>Feature</th><th>Statut</th><th>Tickets</th><th>Avancement</th></tr>`;
    for (const g of d.groups) {
        r += g.rows.map(row => `<tr><td>${glyph(row)}</td><td>${esc(row.f.title)}${row.buffer ? ' (buffer)' : ''}</td>`
            + `<td>${CS(esc(STATUS_LABELS[row.status] || row.status), row.status === 'done' ? 'green' : row.status === 'blocked' ? 'red' : row.status === 'inprog' ? 'blue' : 'gray')}</td>`
            + `<td>${row.n ? `${row.done}/${row.n}` : '-'}</td><td>${row.n ? CS(row.progress + '%', clr(row.progress)) : '-'}</td></tr>`).join('');
    }
    return `${r}</table>`;
}

/** Générateur consommé par reports.js (`GENERATORS.roadmap`). */
export const ROADMAP_GENERATOR = { text: textReport, slack: slackReport, confluence: confluenceReport, html: htmlReport };

// ══════════════════════════════════════════════════════════════════════════════
// Burnup du PI — section interactive (non exportable)
// ══════════════════════════════════════════════════════════════════════════════

/** Périmètre du PI et tickets « tels que crédités » : un terminé hors du PI redevient en cours. */
function burnupTickets({ teamTickets = [], displayPiNum: piNum }) {
    return teamTickets.filter(t => belongedToPi(t, piNum)).map(t =>
        (t.status === 'done' && extractPiNum(t.sprintName || '') !== piNum ? { ...t, status: 'inprog' } : t));
}

export function buildBurnupData(ctx) {
    const w = ctx.piWindow;
    if (!ctx.displayPiNum || !w) return null;
    const tickets = burnupTickets(ctx);
    // setDate et non `+ i × 24 h` : au passage à l'heure d'hiver, minuit + 24 h retombe la veille.
    const days = Array.from({ length: w.days }, (_, i) => { const x = new Date(w.start); x.setDate(x.getDate() + i); return burnDayKey(x); });
    const s = burnSeries({ engaged: tickets, done: tickets.filter(t => t.status === 'done'), days, today: burnDayKey(new Date()) });
    const initial = s.scopeAt[0] ?? s.total;
    // Même série en TICKETS : souvent plus de la moitié du périmètre n'est pas estimée.
    const c = burnSeries({ engaged: tickets, done: tickets.filter(t => t.status === 'done'), days, today: burnDayKey(new Date()), val: () => 1 });
    // Projection linéaire au rythme observé — seulement une fois le PI bien entamé.
    const projected = !w.over && !w.future && w.elapsed >= 15 ? Math.round(s.done / (w.elapsed / 100)) : null;
    return {
        w, tickets, total: s.total, initial, added: Math.max(0, s.total - initial), done: s.done,
        remaining: s.remaining, projected, unestimated: tickets.filter(t => !t.points).length,
        count: c.total, countDone: c.done,
    };
}

export function piBurnupHtml(ctx) {
    const d = buildBurnupData(ctx);
    if (!d) return emptyStateHtml({ icon: '🗓️', title: 'Aucun PI daté', text: 'Configurer « Sprint & PI » dans les Paramètres.' });
    if (!d.tickets.length) return emptyStateHtml({ icon: '📈', title: `Aucun ticket au PI ${ctx.displayPiNum}`, text: 'Aucun ticket n’est encore passé par un sprint de ce PI.' });
    const addPct = pct(d.added, d.initial || 1);
    const donePct = pct(d.done, d.total);
    return `
    <div class="rpt-pi-card">
        <p class="rpt-flow-period">🗓️ ${esc(windowLabel(d.w))}${d.w.projected ? ' (dates projetées)' : ''} · ${d.w.elapsed} % du temps écoulé</p>
        <div class="rpt-metrics-row rpt-flow-metrics">
            <div class="rpt-metric"><span class="rpt-metric-label">Périmètre initial</span><span class="rpt-metric-val">${d.initial} pts</span></div>
            <div class="rpt-metric${addPct >= 25 ? ' rpt-metric--alert' : ''}"><span class="rpt-metric-label">Ajouté</span>
                <span class="rpt-metric-val">+${d.added} pts</span><span class="rpt-metric-pct">+${addPct}%</span></div>
            <div class="rpt-metric"><span class="rpt-metric-label">Réalisé</span><span class="rpt-metric-val">${d.done}/${d.total} pts</span>
                <div class="rpt-metric-bar"><div class="rpt-pi-bar--${clr(donePct)}" style="width:${donePct}%"></div></div>
                <span class="rpt-metric-pct rpt-pi-pct--${clr(donePct)}">${donePct}%</span></div>
            <div class="rpt-metric"><span class="rpt-metric-label">Tickets</span><span class="rpt-metric-val">${d.countDone}/${d.count}</span>
                <span class="rpt-metric-pct">${pct(d.countDone, d.count)}%</span></div>
        </div>
        <div class="card"><div class="chart-container chart-h-md"><canvas id="chart-rpt-piburnup" aria-label="Burnup du PI ${ctx.displayPiNum} : périmètre et points réalisés jour par jour" role="img"></canvas></div></div>
        <p class="rpt-flow-muted">
            ${d.projected == null ? '' : d.projected >= d.total
                ? 'Au rythme actuel, le périmètre d’aujourd’hui serait bouclé avant la fin du PI. '
                : `Au rythme actuel : ~${d.projected} pts réalisés à la fin du PI sur ${d.total} (${pct(d.projected, d.total)} %). `}
            ${d.unestimated ? `${d.unestimated} ticket${plural(d.unestimated)} sans estimation, non compté${plural(d.unestimated)}. ` : ''}
            Périmètre = tickets passés par un sprint du PI, datés à leur création ; réalisé = terminé dans un sprint du PI.
        </p>
    </div>`;
}

/** Dessine le graphique une fois la section dans le DOM (appelé dans le rAF de reports.js). */
export function mountPiBurnup(ctx) {
    const w = ctx.piWindow;
    if (!w || !document.getElementById('chart-rpt-piburnup')) return;
    // Départ à 1 h : l'axe de charts.js avance de 24 h en 24 h, et un PI de 10 semaines traverse
    // souvent un changement d'heure — depuis minuit, un jour sauterait.
    renderBurnup('chart-rpt-piburnup', burnupTickets(ctx), { startDate: new Date(w.start + DAY_MS / 24).toISOString(), durationDays: w.days }, []);
}
