/**
 * Météo des équipes — les PRÉVISIONS : la météo à cinq PI (PI−2 → PI+2), en tête de la Roadmap.
 *
 *   passé      → % livré de l'engagement (Σ velocity / Σ estimated des sprints JIRA du PI,
 *                repli sur les tickets terminés) — échelle absolue, la même que la prédictibilité SAFe
 *   en cours   → % du périmètre réalisé, comparé au temps écoulé du PI (échelle relative)
 *   à venir    → engagement (Σ estimated des sprints, sinon Σ points des features du PI) rapporté à
 *                la BASE de capacité (`piCapacityBase`, la même que Santé) : ≤ 100 % ☀️, ≤ 115 % ⛅,
 *                ≤ 130 % 🌧️, au-delà ⛈️ — un PI peut être 🌧️ avant d'avoir commencé, et c'est
 *                exactement le moment de le dire
 *   inconnu    → ⚪ à planifier
 *
 * Rien n'est inventé : sprints JIRA (`sprintInfo.teamSprints`), `belongedToPi`, `piCapacityBase`.
 */

import { esc, pct as pctOf, sumBy, extractPiNum, belongedToPi, piCapacityBase, lastKnownAbsenceDate, deriveMembersFromAbsences, teamNameMatches, weatherOf, weatherRel, elapsedPct, METEO_GLYPH, METEO_LABEL } from '../utils.js';
import { helpIconHtml } from './help_popover.js';
import { meteoScaleHtml } from './meteo_matrix.js';

const LOAD_LEVELS = [[100, 'sun'], [115, 'cloud'], [130, 'rain']];
const loadLevel = ratio => (LOAD_LEVELS.find(([max]) => ratio <= max) || [null, 'storm'])[1];

/** Points d'une feature rattachée au PI `n` (champ piSprint, nom de sprint ou label). */
const _featureInPi = (f, n) => extractPiNum(f.piSprint) === n || extractPiNum(f.sprintName) === n || (Array.isArray(f.labels) && f.labels.some(l => extractPiNum(l) === n));

/**
 * Prévision d'un PI pour un périmètre d'équipes.
 * @returns {{ num, state, level, value, sub, committed, delivered, base, capped }}
 */
export function computePiForecast(n, current, { teams, tickets = [], features = [], sprintInfoAll, absences = [], members = [], piInfo = null } = {}) {
    const all = sprintInfoAll?.teamSprints || [];
    const sprints = all.filter(s => teams.includes(s.team) && extractPiNum(s.name) === n);
    const scoped = tickets.filter(t => teams.includes(t.team));
    const state = n < current ? 'past' : n === current ? 'current' : 'future';
    const r = { num: n, state, level: 'none', value: '—', sub: '', committed: 0, delivered: 0, base: null, capped: false };

    if (state === 'past') {
        if (!sprints.length) { r.sub = 'aucun sprint connu'; return r; }
        r.committed = sumBy(sprints, s => s.estimated);
        r.delivered = sumBy(sprints, s => s.velocity || sumBy(scoped.filter(t => t.status === 'done' && t.team === s.team && (t.sprintName || '') === s.name), t => t.points));
        if (!r.committed) { r.sub = `${r.delivered} pts livrés · engagement inconnu`; return r; }
        const p = pctOf(r.delivered, r.committed);
        Object.assign(r, { level: weatherOf(p), value: `${p} %`, sub: `${r.delivered}/${r.committed} pts livrés` });
        return r;
    }
    if (state === 'current') {
        const scope = scoped.filter(t => belongedToPi(t, n));
        r.committed = sumBy(scope, t => t.points);
        r.delivered = sumBy(scope.filter(t => t.status === 'done' && extractPiNum(t.sprintName || '') === n), t => t.points);
        const start = sprints.map(s => s.startDate).filter(Boolean).sort()[0];
        const end = sprints.map(s => s.endDate).filter(Boolean).sort().at(-1);
        const time = elapsedPct(start, end);
        if (!r.committed) { r.sub = 'périmètre vide'; return r; }
        const p = pctOf(r.delivered, r.committed);
        Object.assign(r, { level: weatherRel(p, time), value: `${p} %`, sub: `${r.delivered}/${r.committed} pts · ${time ?? '?'} % du PI` });
        return r;
    }
    // À venir : engagement vs base de capacité
    r.committed = sumBy(sprints, s => s.estimated) || sumBy(features.filter(f => teams.includes(f.team) && _featureInPi(f, n)), f => f.points);
    let base = 0, capped = false, known = false;
    const roster = deriveMembersFromAbsences(absences, members);
    for (const tm of teams) {
        const piSprints = sprints.filter(s => s.team === tm);
        if (!piSprints.length) continue;
        const cb = piCapacityBase({
            teamSprints: all, piSprints, team: tm, absences, targetPiNum: n,
            lastAbsenceDate: lastKnownAbsenceDate(absences),
            teamMembers: roster.filter(m => teamNameMatches(m.team, tm)),
            rolePctMap: piInfo?.roleCapacity || {},
            sprintsPerPI: piInfo?.sprintsPerPI || 0,
        });
        if (cb?.points) { base += cb.points; known = true; capped = capped || !!cb.capped; }
    }
    r.base = known ? Math.round(base) : null; r.capped = capped;
    if (!r.committed) { r.sub = r.base ? `base ${r.base} pts · à planifier` : 'à planifier'; return r; }
    if (!r.base) { Object.assign(r, { level: 'cloud', value: `${r.committed} pts`, sub: 'engagés · base de capacité inconnue' }); return r; }
    const ratio = Math.round((r.committed / r.base) * 100);
    Object.assign(r, { level: loadLevel(ratio), value: `${ratio} %`, sub: `${r.committed} engagés / ${r.base} de base${capped ? ' ⚠ plafond' : ''}` });
    return r;
}

const STATE_LABEL = { past: 'passé', current: 'en cours', future: 'prévision' };

/** La frise « météo à cinq PI » + une phrase de prédictibilité. */
export function meteoForecastHtml({ teams, current, ctx, tickets, features }) {
    if (!current || !teams.length) return '';
    const nums = [current - 2, current - 1, current, current + 1, current + 2].filter(n => n >= 1);
    const cols = nums.map(n => computePiForecast(n, current, { teams, tickets, features, sprintInfoAll: ctx.sprintInfoAll, absences: ctx.absences, members: ctx.members, piInfo: ctx.piInfo }));
    const past = cols.filter(c => c.state === 'past' && c.committed);
    const avgDelivered = past.length ? Math.round(sumBy(past, c => c.delivered) / past.length) : null;
    const next = cols.find(c => c.state === 'future');
    const worstFuture = cols.filter(c => c.state === 'future' && c.level !== 'none').map(c => c.level);
    const sub = worstFuture.includes('storm') || worstFuture.includes('rain')
        ? `PI ${next.num} : engagement au-dessus de la base — à dire au PI Planning, pas à la revue`
        : `${past.length} PI passé${past.length > 1 ? 's' : ''} mesuré${past.length > 1 ? 's' : ''} · ${cols.filter(c => c.state === 'future' && c.committed).length} PI planifié${cols.filter(c => c.state === 'future' && c.committed).length > 1 ? 's' : ''}`;
    return `
    <section class="card meteo-fc-card" aria-labelledby="meteo-fc-title">
        <div class="card-header meteo-header">
            <span class="card-title" id="meteo-fc-title">🔭 Prévisions — la météo à cinq PI ${helpIconHtml({ key: 'meteo', label: 'Comprendre la météo des équipes' })}</span>
            <span class="card-subtitle">${esc(sub)}</span>
        </div>
        ${meteoScaleHtml()}
        <div class="meteo-fc">${cols.map(c => `
            <article class="meteo-fc-col meteo-cell--${c.level} meteo-fc-col--${c.state}${c.state === 'future' && !c.committed ? ' meteo-fc-col--unplanned' : ''}" title="${esc(METEO_LABEL[c.level])}">
                <header><small>${c.state === 'future' && !c.committed ? 'à planifier' : STATE_LABEL[c.state]}</small><b>PI ${c.num}</b></header>
                <span class="meteo-glyph" aria-hidden="true">${METEO_GLYPH[c.level]}</span>
                <strong class="meteo-fc-val">${esc(c.value)}</strong>
                <span class="meteo-fc-sub">${esc(c.sub)}</span>
                <span class="meteo-sr">${esc(METEO_LABEL[c.level])}</span>
            </article>`).join('')}</div>
        ${avgDelivered != null ? `<p class="meteo-fc-note">📐 Livré en moyenne <b>${avgDelivered} pts</b> par PI sur les ${past.length} derniers${next?.base ? ` · base du PI ${next.num} : <b>${next.base} pts</b>${next.capped ? ' <span class="is-warn">⚠ plafond — absences inconnues au-delà de la dernière date connue</span>' : ''}` : ''}${next?.committed && avgDelivered ? ` · engagement prévu <b>${next.committed} pts</b> = ${Math.round((next.committed / avgDelivered) * 100)} % du livré habituel` : ''}.</p>` : ''}
    </section>`;
}
