/**
 * Météo des équipes — la FICHE d'une équipe, deuxième rangée (Dashboard filtré) :
 *   😊 tendance du mood et de la confiance, sprint par sprint ;
 *   👥 roster du PI avec la capacité par rôle et la prochaine absence.
 *
 * Tout vient de sources déjà en place : `store.moodVotes` / `fistVotes` appariés par clé
 * `NN.N` (comme health-votes.js), `effectiveRosterForPi` (snapshot du PI, sinon dérivation
 * des absences), `teamEtp` / `roleCapacityPct` (Paramètres → capacité par rôle).
 * La tendance répond au #13 du BACKLOG sans nouvelle table : les votes existent par sprint.
 */

import { esc, initials, extractPiNum, teamNameMatches, effectiveRosterForPi, teamEtp } from '../utils.js';
import { sparkline } from './sparkline.js';
import { helpIconHtml } from './help_popover.js';

const MAX_SPRINTS = 8;
const _lbl = name => (String(name || '').match(/(\d+\.\d+)/) || [])[1] || '';
const _avg = arr => (arr.length ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10 : null);

/** Moyenne des votes d'un type pour une équipe et un sprint (clé NN.N). */
function _voteAvg(votes, team, lbl) {
    const vals = (votes || [])
        .filter(v => v.team === team && lbl && v.piSprint && (v.piSprint === lbl || v.piSprint.includes(lbl)))
        .map(v => parseInt(v.value, 10)).filter(n => n >= 1 && n <= 5);
    return _avg(vals);
}

/** Série mood / confiance sur les derniers sprints de l'équipe (clos + actif). */
export function computeVoteTrend(team, { sprintInfoAll, moodVotes = [], fistVotes = [] } = {}) {
    const sprints = (sprintInfoAll?.teamSprints || [])
        .filter(s => s.team === team && s.state !== 'future' && _lbl(s.name))
        .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')))
        .slice(-MAX_SPRINTS);
    return sprints.map(s => {
        const lbl = _lbl(s.name);
        return { lbl, mood: _voteAvg(moodVotes, team, lbl), fist: _voteAvg(fistVotes, team, lbl), active: s.state === 'active' };
    });
}

const _tone = v => (v == null ? '' : v >= 4 ? 'is-good' : v >= 3 ? 'is-ok' : 'is-bad');

export function meteoTrendHtml(team, ctx) {
    const pts = computeVoteTrend(team, ctx);
    const moods = pts.filter(p => p.mood != null);
    const body = moods.length >= 2 ? `
        <div class="meteo-trend-spark">${sparkline(moods.map(p => p.mood), { width: 240, height: 40, color: 'var(--primary)', showMinMax: true })}</div>
        <div class="meteo-trend-cells" style="--n:${pts.length}">
            ${pts.map(p => `<div class="meteo-trend-cell${p.active ? ' is-active' : ''}" title="${esc(p.lbl)}${p.active ? ' — sprint en cours' : ''}">
                <b class="${_tone(p.mood)}">${p.mood == null ? '—' : p.mood.toFixed(1)}</b>
                <i class="${_tone(p.fist)}" title="Confiance (Fist of Five)">✊ ${p.fist == null ? '—' : p.fist.toFixed(1)}</i>
                <small>${esc(p.lbl)}</small>
            </div>`).join('')}
        </div>`
        : `<p class="meteo-fiche-empty">Pas encore de tendance : il faut des votes Mood sur au moins <b>deux sprints</b> — ${moods.length ? 'un seul pour l\'instant' : 'aucun pour l\'instant'}. Les votes se saisissent dans Santé → Sprints du PI.</p>`;
    const last = moods.at(-1)?.mood, prev = moods.at(-2)?.mood;
    const delta = last != null && prev != null ? Math.round((last - prev) * 10) / 10 : null;
    return `
    <section class="card meteo-trend" aria-labelledby="meteo-trend-title">
        <div class="card-header">
            <span class="card-title" id="meteo-trend-title">😊 Mood &amp; confiance — tendance ${helpIconHtml({ key: 'mood-trend', label: 'Comprendre la tendance Mood & confiance' })}</span>
            <span class="card-subtitle">${moods.length} sprint${moods.length > 1 ? 's' : ''} votés${delta != null ? ` · ${delta >= 0 ? '↗ +' : '↘ '}${delta}` : ''}</span>
        </div>
        ${body}
    </section>`;
}

/** Prochaine absence (≥ aujourd'hui) d'une personne, libellée « 2 → 3 sept. ». */
function _nextAbsence(name, absences, todayIso) {
    const fmt = iso => { const d = String(iso || '').slice(0, 10); return d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '') : ''; };
    const next = (absences || [])
        .filter(a => a.memberName === name && String(a.endDate || '').slice(0, 10) >= todayIso)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0];
    if (!next) return null;
    const s = String(next.startDate).slice(0, 10), e = String(next.endDate).slice(0, 10);
    const now = s <= todayIso;
    return { label: s === e ? fmt(s) : `${fmt(s)} → ${fmt(e)}`, now, days: next.days };
}

export function meteoRosterHtml(team, ctx) {
    const { piInfo, piNum, absences = [], members = [] } = ctx;
    const roster = effectiveRosterForPi(piInfo, piNum, absences, members).filter(m => teamNameMatches(m.team, team));
    if (!roster.length) {
        return `<section class="card meteo-roster"><div class="card-header"><span class="card-title">👥 L'équipe</span></div>
            <p class="meteo-fiche-empty">Aucun membre connu pour ${esc(team)} — le roster vient du <b>CSV des absences</b> (Paramètres → Absences) ou du snapshot du PI.</p></section>`;
    }
    const cap = teamEtp(roster, piInfo?.roleCapacity || {});
    const todayIso = new Date().toISOString().slice(0, 10);
    const rows = cap.members.map(m => {
        const abs = _nextAbsence(m.name, absences, todayIso);
        return `<tr>
            <td><span class="meteo-plan-avatar" aria-hidden="true">${esc(initials(m.name))}</span> ${esc(m.name)}</td>
            <td>${m.role ? esc(m.role) : '<span class="meteo-roster-unknown" title="Rôle inconnu : compté à 100 %">rôle ?</span>'}</td>
            <td><span class="meteo-roster-bar" title="${m.pct} % de capacité dev"><i style="width:${m.pct}%"></i></span> <b>${m.pct} %</b></td>
            <td class="${abs ? (abs.now ? 'is-now' : 'is-next') : ''}">${abs ? `${abs.now ? '🌴 absent' : abs.label}${abs.days ? ` <small>(${abs.days} j)</small>` : ''}` : '—'}</td>
        </tr>`;
    }).join('');
    return `
    <section class="card meteo-roster" aria-labelledby="meteo-roster-title">
        <div class="card-header">
            <span class="card-title" id="meteo-roster-title">👥 L'équipe — PI #${piNum || '?'}</span>
            <span class="card-subtitle">${roster.length} personne${roster.length > 1 ? 's' : ''} · <b>${(Math.round(cap.etp * 10) / 10).toString().replace('.', ',')} ETP</b>${cap.ignored ? ` · ${cap.ignored} à 0 %` : ''}${cap.unknownRole ? ` · ${cap.unknownRole} rôle inconnu` : ''}</span>
        </div>
        <div class="meteo-wrap">
            <table class="meteo-roster-table">
                <caption class="meteo-sr">Membres de l'équipe, capacité par rôle et prochaine absence</caption>
                <thead><tr><th scope="col">Membre</th><th scope="col">Rôle</th><th scope="col">Capacité</th><th scope="col">Prochaine absence</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </section>`;
}

/** La rangée « fiche » : tendance + roster. */
export function meteoFicheHtml(team, ctx) {
    return `<div class="meteo-fiche">${meteoTrendHtml(team, ctx)}${meteoRosterHtml(team, ctx)}</div>`;
}
