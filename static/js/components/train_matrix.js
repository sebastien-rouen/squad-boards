/**
 * Section « 🚂 Le train, semaine par semaine » (Rapports) : matrice équipes × semaines, vue d'ensemble
 * de la frise des faits marquants (même modèle : team_timeline_model.js).
 *
 * Cellule : fond = présence (vert 100 % / orange ≥ 75 % / rouge < 75 %), chiffre = charge Support
 * (tickets + tâches du suivi), point rouge = incident de production, ◆ = MEP, ▲▼ = arrivée / départ,
 * contour rouge = une tâche de support traîne (≥ 3 semaines). Survol = détail ; clic sur une équipe
 * = sa frise sur la période ; clic sur une cellule = sa frise zoomée sur la semaine.
 */

import { store } from '../state.js';
import { esc } from '../utils.js';
import { teamColor } from './team_calendar.js';
import { collect, presets, presenceLevel, addDays, mondayOf, fmt, fmtY, STALE_WEEKS, timelineToday } from './team_timeline_model.js';

const PRESETS = ['pi', 'piprev', '6m'];
let _preset = 'pi';

/** Données d'une équipe, indexées par semaine (lundi). */
function teamWeeks(team, A, B) {
    const c = collect(team, A, B), by = new Map();
    const at = w => by.get(w) || by.set(w, { pct: null, inc: 0, mep: 0, sup: 0, stale: 0, inn: 0, out: 0 }).get(w);
    c.presence.forEach(s => { at(s.week).pct = s.pct; });
    c.incidents.forEach(x => { at(x.week).inc += x.count; });
    c.releases.forEach(r => { at(mondayOf(r.day)).mep++; });
    c.support.forEach(w => { const d = at(w.week); d.sup = w.tickets.length + w.tasks.length; d.stale = w.tasks.filter(k => k.streak >= STALE_WEEKS).length; });
    c.moves.forEach(m => { const d = at(mondayOf(m.day)); if (m.kind.endsWith('in')) d.inn++; else d.out++; });
    return by;
}

function cell(team, w, d) {
    const tip = [`${team} · semaine du ${fmtY(w)}`,
        d.pct !== null ? `${100 - d.pct} % présents` : 'présence inconnue',
        d.sup && `🛎️ ${d.sup} support${d.stale ? ` (⏳ ${d.stale} traîne)` : ''}`,
        d.inc && `🚨 ${d.inc} incident(s) prod`, d.mep && `🚀 ${d.mep} jour(s) de MEP`,
        d.inn && `▲ ${d.inn} arrivée(s)`, d.out && `▼ ${d.out} départ(s)`].filter(Boolean).join('\n');
    return `<button type="button" class="tm-cell${d.stale ? ' is-stale' : ''}" data-l="${presenceLevel(d.pct) || 'none'}" data-team="${esc(team)}" data-week="${w}" title="${esc(tip)}" aria-label="${esc(tip.replace(/\n/g, ', '))}">
        ${d.sup ? `<b>${d.sup}</b>` : ''}${d.inc ? '<i class="tm-inc"></i>' : ''}${d.mep ? '<i class="tm-mep">◆</i>' : ''}${d.inn || d.out ? `<i class="tm-move">${d.inn ? '▲' : ''}${d.out ? '▼' : ''}</i>` : ''}
    </button>`;
}

function render(el) {
    const all = presets(), p = all.find(x => x.key === _preset) || all[0];
    const weeks = [];
    for (let w = mondayOf(p.A); w <= p.B; w = addDays(w, 7)) weeks.push(w);
    const teams = [...(store.get('teams') || [])].sort((a, b) => a.localeCompare(b, 'fr'));
    const rows = teams.map(t => {
        const by = teamWeeks(t, p.A, p.B);
        const empty = { pct: null, inc: 0, mep: 0, sup: 0, stale: 0, inn: 0, out: 0 };
        return `<div class="tm-row" role="row">
            <button type="button" class="tm-team" data-team="${esc(t)}" style="--team:${teamColor(t)}" title="${esc(`Ouvrir la frise de ${t}`)}">${esc(t)}</button>
            ${weeks.map(w => cell(t, w, by.get(w) || empty)).join('')}
        </div>`;
    }).join('');
    // Mois au-dessus des colonnes (seulement quand il change) — années sur le premier et sur janvier
    const now = mondayOf(timelineToday());
    const head = weeks.map((w, i) => {
        const m = addDays(w, 3).slice(0, 7), prev = i ? addDays(weeks[i - 1], 3).slice(0, 7) : null;
        const label = m !== prev ? `${fmt(`${m}-01`).split(' ')[1]}${!i || m.endsWith('-01') ? ` ${m.slice(0, 4)}` : ''}` : '';
        return `<span class="tm-col${w === now ? ' is-now' : ''}" title="Semaine du ${fmtY(w)}${w === now ? ' (en cours)' : ''}">${label ? `<b>${esc(label)}</b>` : ''}${+w.slice(8, 10)}</span>`;
    }).join('');
    el.innerHTML = `
    <details class="report-section tm-section" open id="report-sec-train">
        <summary class="report-section-charts-summary">
            <span class="report-section-title"><span class="report-section-icon">🚂</span>Le train, semaine par semaine</span>
        </summary>
        <div class="tm-body">
            <div class="tm-toolbar">
                <div class="tl-presets" role="group" aria-label="Période">${all.filter(x => PRESETS.includes(x.key)).map(x =>
                    `<button type="button" class="tl-preset" data-tm-preset="${x.key}" aria-pressed="${x.key === p.key}">${esc(x.label)}</button>`).join('')}</div>
                <p class="tm-legend"><span data-l="ok"></span>100 % présents <span data-l="mid"></span>75–99 % <span data-l="low"></span>&lt; 75 %
                    · <b>3</b> support · <i class="tm-inc"></i> incident prod · <i class="tm-mep">◆</i> MEP · ▲▼ arrivée / départ · <span class="tm-stale-key"></span> tâche qui traîne</p>
            </div>
            <div class="tm-scroll"><div class="tm-grid" role="grid" aria-label="Équipes par semaine" style="--cols:${weeks.length}">
                <div class="tm-row tm-row--head" role="row"><span class="tm-team tm-team--head">Équipe</span>${head}</div>
                ${rows || '<p class="tm-empty">Aucune équipe.</p>'}
            </div></div>
        </div>
    </details>`;
    el.querySelectorAll('[data-tm-preset]').forEach(b => b.addEventListener('click', () => { _preset = b.dataset.tmPreset; render(el); }));
    // Équipe → sa frise sur la période ; cellule → sa frise zoomée sur la semaine (lien ~frise=)
    el.querySelectorAll('.tm-team[data-team]').forEach(b => b.addEventListener('click', () => {
        location.hash = `#team/${encodeURIComponent(b.dataset.team)}~frise=v=lanes&p=${p.key}`;
    }));
    el.querySelectorAll('.tm-cell').forEach(b => b.addEventListener('click', () => {
        const w = b.dataset.week;
        location.hash = `#team/${encodeURIComponent(b.dataset.team)}~frise=v=lanes&du=${addDays(w, -7)}&au=${addDays(w, 13)}`;
    }));
}

/** Monte la section dans `el` (Rapports). */
export function mountTrainMatrix(el) {
    if (el) render(el);
}
