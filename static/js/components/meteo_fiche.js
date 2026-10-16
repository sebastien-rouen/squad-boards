/**
 * Météo des équipes — la FICHE d'une équipe, deuxième rangée (Dashboard filtré) :
 *   😊 tendance du mood et de la confiance, sprint par sprint ;
 *   👥 roster du PI avec la capacité par rôle et la prochaine absence — itération navigable
 *      (◀ / ▶) pour PROJETER la présence sur un sprint voisin, futur compris (dates projetées) :
 *      capacité en STORY POINTS (`sprintCapacityBase`, même base que Santé) et présence en j/h.
 *
 * Tout vient de sources déjà en place : `store.moodVotes` / `fistVotes` appariés par clé
 * `NN.N` (comme health-votes.js), `effectiveRosterForPi` (snapshot du PI, sinon dérivation
 * des absences), `teamEtp` / `roleCapacityPct` (Paramètres → capacité par rôle).
 * La tendance répond au #13 du BACKLOG sans nouvelle table : les votes existent par sprint.
 */

import { esc, initials, extractPiNum, teamNameMatches, effectiveRosterForPi, teamEtp, getSprintForTeam, supportAbsenceDayLevel, todayIsoLocal,
    avgVelocityOverLastPis, sprintRealizedVelocity, sprintCapacityBase, lastKnownAbsenceDate, breathIdxOf, isBreathSprint } from '../utils.js';
// holidays.js n'est pas dans le barrel : import direct, comme cal_banner.js (SOURCE UNIQUE des fériés).
import { holidayName } from '../utils/holidays.js';
// pi-weeks.js n'est pas dans le barrel : import direct, comme health.js.
import { piNumFromSprintName, projectedPiSprints } from '../utils/pi-weeks.js';
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

/** Prochaine absence (≥ aujourd'hui) d'une personne, libellée « 2 → 3 sept. » — partagée avec la
 *  modale ticket. `name` = nom TEL QU'ÉCRIT dans les absences (cf. `findPerson`). */
export function nextAbsence(name, absences, todayIso) {
    const fmt = iso => { const d = String(iso || '').slice(0, 10); return d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '') : ''; };
    const next = (absences || [])
        .filter(a => a.memberName === name && String(a.endDate || '').slice(0, 10) >= todayIso)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0];
    if (!next) return null;
    const s = String(next.startDate).slice(0, 10), e = String(next.endDate).slice(0, 10);
    const now = s <= todayIso;
    return { label: s === e ? fmt(s) : `${fmt(s)} → ${fmt(e)}`, now, days: next.days };
}

const _isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _dayFmt = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const ITER_LEVEL = { in: 'présent', half: 'demi-journée', out: 'absent', off: 'férié' };

/**
 * Jours OUVRÉS d'un sprint (`{ name, startDate, endDate }`) — partagé avec la section Équipes du
 * rapport (reports-teams.js), qui passe le sprint AFFICHÉ.
 * @returns {{ label: string, days: string[] }|null}
 */
export function sprintWorkDays(sp) {
    const s = String(sp?.startDate || '').slice(0, 10), e = String(sp?.endDate || '').slice(0, 10);
    if (!s || !e || e < s) return null;
    const days = [];
    // Midi local + setDate : ni décalage UTC, ni jour sauté au changement d'heure.
    for (const d = new Date(`${s}T12:00:00`); _isoLocal(d) <= e; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) days.push(_isoLocal(d));
    }
    return days.length ? { label: _lbl(sp.name) || String(sp.name || ''), days } : null;
}

/** Niveau d'un jour pour un membre : 'in' | 'half' | 'out' | 'off' (férié). Source des bandes ET des comptes. */
export const presenceLevel = (name, iso, absences) => (holidayName(iso) ? 'off'
    : ({ full: 'out', half: 'half' })[supportAbsenceDayLevel(name, iso, absences)] || 'in');

/**
 * Bande de présence d'un membre sur l'itération : une case par jour ouvré, de LARGEUR FIXE pour
 * que les bandes s'alignent d'une ligne à l'autre (on lit les trous communs d'un coup d'œil).
 * Niveau du jour = `supportAbsenceDayLevel` (même lecture que la grille de rotation) ; férié gris.
 */
export function presenceStripHtml(name, it, absences, todayIso = todayIsoLocal()) {
    const count = { in: 0, half: 0, out: 0, off: 0 };
    const cells = it.days.map(iso => {
        const lvl = presenceLevel(name, iso, absences);
        count[lvl]++;
        return `<i class="meteo-iter-d is-${lvl}${iso === todayIso ? ' is-today' : ''}" title="${esc(`${_dayFmt(iso)} — ${holidayName(iso) || ITER_LEVEL[lvl]}`)}"></i>`;
    }).join('');
    const summary = Object.entries(count).filter(([, n]) => n).map(([k, n]) => `${n} ${ITER_LEVEL[k]}`).join(', ');
    return `<span class="meteo-iter" role="img" aria-label="${esc(`Itération ${it.label} : ${summary}`)}">${cells}</span>`;
}

/**
 * Itérations navigables de l'équipe : PI de son sprint en cours ± 1. Sprints JIRA de l'équipe
 * d'abord (dédoublonnés par clé `NN.N`), complétés par la CADENCE (`projectedPiSprints`) pour les
 * sprints que JIRA n'a pas encore créés — une équipe crée ses derniers sprints en cours de PI.
 * `curIdx` = sprint en cours (`getSprintForTeam`), à défaut le premier qui n'est pas fini.
 * @returns {{ list: Array<{name, startDate, endDate, state?, projected?}>, curIdx: number }}
 */
export function rosterSprints(team, { sprintInfoAll, piInfo, piNum } = {}) {
    const cur = getSprintForTeam(team, sprintInfoAll);
    const byLbl = new Map();
    const add = s => { const l = _lbl(s?.name); if (l && s.startDate && s.endDate && !byLbl.has(l)) byLbl.set(l, s); };
    add(cur);
    (sprintInfoAll?.teamSprints || []).filter(s => s.team === team).forEach(add);
    const basePi = piNumFromSprintName(cur?.name) || piNum;
    if (!basePi) return { list: [...byLbl.values()], curIdx: byLbl.size ? 0 : -1 };
    for (const n of [basePi - 1, basePi, basePi + 1]) projectedPiSprints(sprintInfoAll, piInfo, n).forEach(add);
    const list = [...byLbl.values()]
        .filter(s => Math.abs(piNumFromSprintName(s.name) - basePi) <= 1)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    let curIdx = cur ? list.findIndex(s => _lbl(s.name) === _lbl(cur.name)) : -1;
    if (curIdx < 0) {
        const today = todayIsoLocal();
        curIdx = list.findIndex(s => String(s.endDate).slice(0, 10) >= today);
        if (curIdx < 0) curIdx = list.length - 1;
    }
    return { list, curIdx };
}

// Décalage affiché par équipe (en mémoire : une projection est une lecture, pas un réglage).
const _rosterOffset = new Map();
const _shortDate = iso => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
const _fr1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');

/**
 * Jours/homme d'une itération — SOURCE UNIQUE (carte roster du Dashboard, détail par sprint de la
 * carte 🎯 Capacité de Santé). Chaque jour ouvré d'un membre vaut sa capacité par rôle (Dev 1 j/h,
 * Tech Lead 0,7, PO/SM 0) ; `present` déduit congés et fériés (`presenceLevel`, même lecture que la
 * bande, ½ journée = moitié), `nominal` = itération pleine, sans aucune absence.
 * @param {Array<{name: string, pct: number}>} members  `teamEtp(...).members`
 * @param {{days: string[]}} it  `sprintWorkDays(sprint)`
 * @returns {{present: number, nominal: number}|null}
 */
export function iterationManDays(members, it, absences) {
    if (!it?.days?.length) return null;
    let present = 0, nominal = 0;
    for (const m of members || []) {
        const w = m.pct / 100;
        if (!w) continue;
        nominal += w * it.days.length;
        for (const iso of it.days) {
            const lvl = presenceLevel(m.name, iso, absences);
            present += w * (lvl === 'in' ? 1 : lvl === 'half' ? 0.5 : 0);
        }
    }
    return { present, nominal };
}

/** Sprints d'un PI pour l'équipe : JIRA d'abord, complétés par la cadence (repère de la respiration). */
function _piSprintsOf(team, pi, { sprintInfoAll, piInfo } = {}) {
    const byLbl = new Map();
    const add = s => { const l = _lbl(s?.name); if (l && !byLbl.has(l)) byLbl.set(l, s); };
    (sprintInfoAll?.teamSprints || []).filter(s => s.team === team && piNumFromSprintName(s.name) === pi).forEach(add);
    projectedPiSprints(sprintInfoAll, piInfo, pi).forEach(add);
    return [...byLbl.values()];
}

/**
 * Story points projetés d'une itération pour l'équipe — SOURCE UNIQUE hors Santé (carte roster du
 * Dashboard, section Équipe(s) du rapport) : `sprintCapacityBase` (vélocité moyenne des 2 PI précédant
 * celui du sprint, moins ses absences pondérées par rôle), MÊME calcul que la Base capacité de Santé.
 * @param {{members: Array<{name, pct}>, etp: number}} cap  `teamEtp(roster, roleCapacity)`
 * @param {{sprintInfoAll, piInfo, absences, tickets}} ctx  `tickets` = TOUS les tickets (vélocité passée)
 * @returns {null|{breath: true}|{points, ratio, capped, avg, last}} `null` = pas de vélocité de référence
 */
export function sprintPointsProjection(team, sp, cap, ctx) {
    const { sprintInfoAll, piInfo, absences = [], tickets = [] } = ctx;
    const pi = piNumFromSprintName(sp?.name);
    if (!pi || !cap?.members?.length) return null;
    const spp = piInfo?.sprintsPerPI || 0;
    if (isBreathSprint(sp.name, breathIdxOf(_piSprintsOf(team, pi, ctx), spp))) return { breath: true };
    const v = avgVelocityOverLastPis(sprintInfoAll?.teamSprints || [], team, pi, 2,
        s => sprintRealizedVelocity(tickets, s.team ? s : { ...s, team }), spp);
    if (!v.avg) return null;
    const pct = new Map(cap.members.map(m => [m.name, m.pct]));
    const last = lastKnownAbsenceDate(absences);
    const b = sprintCapacityBase({ avg: v.avg, sprint: sp, absences, team, etp: cap.etp,
        pctOf: n => (pct.has(n) ? pct.get(n) : 0), lastAbsenceDate: last });
    return b ? { ...b, avg: v.avg, last } : null;
}

/** Jours d'absence d'un membre sur l'itération (½ journée = 0,5), fériés exclus. */
function _iterAbsence(name, it, absences) {
    return it.days.reduce((s, iso) => {
        const lvl = presenceLevel(name, iso, absences);
        return s + (lvl === 'out' ? 1 : lvl === 'half' ? 0.5 : 0);
    }, 0);
}

export function meteoRosterHtml(team, ctx) {
    const { piInfo, piNum, absences = [], members = [], sprintInfoAll } = ctx;
    const { list, curIdx } = rosterSprints(team, ctx);
    const offset = curIdx < 0 ? 0 : Math.max(-curIdx, Math.min(list.length - 1 - curIdx, _rosterOffset.get(team) || 0));
    _rosterOffset.set(team, offset);
    const sp = curIdx < 0 ? getSprintForTeam(team, sprintInfoAll) : list[curIdx + offset];
    const shifted = offset !== 0;
    // Roster du PI de l'itération affichée s'il a un snapshot ; sinon celui de la carte (projection
    // à effectif constant — la dérivation des absences ramènerait les partis).
    const spPi = piNumFromSprintName(sp?.name);
    const rosterPi = shifted && spPi && piInfo?.piMembers?.[String(spPi)]?.length ? spPi : piNum;
    const roster = effectiveRosterForPi(piInfo, rosterPi, absences, members).filter(m => teamNameMatches(m.team, team));
    if (!roster.length) {
        return `<section class="card meteo-roster" data-roster-team="${esc(team)}"><div class="card-header"><span class="card-title">👥 L'équipe</span></div>
            <p class="meteo-fiche-empty">Aucun membre connu pour ${esc(team)} — le roster vient du <b>CSV des absences</b> (Paramètres → Absences) ou du snapshot du PI.</p></section>`;
    }
    const cap = teamEtp(roster, piInfo?.roleCapacity || {});
    // Jour LOCAL : `toISOString()` donnait la veille entre minuit et 2 h (heure d'été).
    const todayIso = todayIsoLocal();
    const it = sprintWorkDays(sp);
    const md = iterationManDays(cap.members, it, absences);
    const pts = it ? sprintPointsProjection(team, sp, cap, ctx) : null;
    // Colonne « Dispo » : j/h PRÉSENTS du membre sur l'itération affichée (même lecture que la bande
    // et que le total d'en-tête, `iterationManDays`) + sa part des story points projetés, au prorata de
    // ces j/h — la somme des parts retombe sur le total de l'équipe (≈ N pts d'en-tête).
    const ptsTotal = pts && !pts.breath ? pts.points : null;
    const dispoOf = m => {
        const d = it ? iterationManDays([m], it, absences) : null;
        if (!d || !d.nominal) return null;
        return { ...d, pct: m.pct, pts: ptsTotal != null && md?.present ? ptsTotal * d.present / md.present : null };
    };
    const dispoHtml = d => {
        if (!d) return '<span class="meteo-roster-dispo is-none" title="Rôle compté à 0 % : hors capacité dev">—</span>';
        const r = d.present / d.nominal;
        const cls = r >= 0.999 ? 'is-full' : r >= 0.75 ? 'is-mid' : 'is-low';
        const tip = (d.pct != null ? `Capacité dev du rôle : ${d.pct} % · ` : '') + `${_fr1(d.present)} j/h présents sur ${_fr1(d.nominal)} (${Math.round(r * 100)} %)`
            + (d.pts != null ? ` · ≈ ${_fr1(d.pts)} pts, part des ${ptsTotal} pts projetés de l'équipe au prorata des j/h` : '');
        return `<span class="meteo-roster-dispo ${cls}" title="${esc(tip)}">
            <span class="meteo-roster-bar meteo-roster-bar--dispo"><i style="width:${Math.round(r * 100)}%"></i></span>
            <b>${_fr1(d.present)}</b><small>/${_fr1(d.nominal)} j/h</small>${d.pts != null ? `<span class="meteo-roster-pts">≈ ${_fr1(d.pts)} pts</span>` : ''}
        </span>`;
    };
    const rows = cap.members.map(m => {
        let absTxt, absCls = '';
        if (shifted && it) {
            const n = _iterAbsence(m.name, it, absences);
            absTxt = n ? `🌴 ${_fr1(n)} j` : '—';
            absCls = n ? 'is-next' : '';
        } else {
            const abs = nextAbsence(m.name, absences, todayIso);
            absTxt = abs ? `${abs.now ? '🌴 absent' : abs.label}${abs.days ? ` <small>(${abs.days} j)</small>` : ''}` : '—';
            absCls = abs ? (abs.now ? 'is-now' : 'is-next') : '';
        }
        return `<tr>
            <td><span class="meteo-plan-avatar" aria-hidden="true">${esc(initials(m.name))}</span> ${esc(m.name)}</td>
            <td>${m.role ? esc(m.role) : '<span class="meteo-roster-unknown" title="Rôle inconnu : compté à 100 %">rôle ?</span>'}</td>
            ${it ? `<td class="meteo-roster-dispo-td">${dispoHtml(dispoOf(m))}</td>` : ''}
            <td class="meteo-roster-abs ${absCls}">${it ? presenceStripHtml(m.name, it, absences, todayIso) : ''}<span>${absTxt}</span></td>
        </tr>`;
    }).join('');
    const legend = it ? `<p class="meteo-iter-legend">Itération ${esc(it.label)} :
        <span><i class="meteo-iter-d is-in"></i> présent</span><span><i class="meteo-iter-d is-half"></i> ½ journée</span>
        <span><i class="meteo-iter-d is-out"></i> absent</span><span><i class="meteo-iter-d is-off"></i> férié</span>
        <span><i class="meteo-iter-d is-in is-today"></i> aujourd'hui</span></p>` : '';
    const tag = !sp ? '' : sp.projected ? ' <em class="meteo-roster-tag" title="Sprint pas encore créé dans JIRA : dates déduites de la cadence du PI">projetée</em>'
        : offset > 0 ? ' <em class="meteo-roster-tag">à venir</em>' : offset < 0 ? ' <em class="meteo-roster-tag">passée</em>' : '';
    const nav = curIdx < 0 || !it ? '' : `
        <div class="meteo-roster-nav" role="group" aria-label="Itération affichée">
            <button type="button" class="btn-icon" data-roster-step="-1" title="Itération précédente" aria-label="Itération précédente" ${curIdx + offset <= 0 ? 'disabled' : ''}>‹</button>
            <span class="meteo-roster-it" aria-live="polite"><b>${esc(it.label)}</b>${tag}<small>${esc(_shortDate(sp.startDate))} → ${esc(_shortDate(sp.endDate))}</small></span>
            <button type="button" class="btn-icon" data-roster-step="1" title="Itération suivante" aria-label="Itération suivante" ${curIdx + offset >= list.length - 1 ? 'disabled' : ''}>›</button>
            ${shifted ? '<button type="button" class="btn btn-ghost btn-xs" data-roster-step="0" title="Revenir à l\'itération en cours">↺ en cours</button>' : ''}
        </div>`;
    return `
    <section class="card meteo-roster" aria-labelledby="meteo-roster-title" data-roster-team="${esc(team)}">
        <div class="card-header">
            <span class="card-title" id="meteo-roster-title">👥 L'équipe — PI #${rosterPi || '?'}</span>
            <span class="card-subtitle">${roster.length} personne${roster.length > 1 ? 's' : ''}${it ? ` · ${esc(it.label)} :` : ''}${pts?.breath ? ' <b title="Sprint de respiration : rien n\'y est engagé">🍃 respiration</b>'
                : pts ? ` <b title="${esc(`Capacité projetée : ${pts.avg.toFixed(1)} pts/sprint (vélocité moyenne des 2 PI précédents) − ${Math.round(pts.ratio * 100)} % d'absences sur l'itération — même calcul que la Base capacité de Santé`)}">≈ ${pts.points} pts</b>${pts.capped ? ` <span title="${esc(`Congés connus jusqu'au ${_shortDate(pts.last)} seulement : absences sous-estimées, projection optimiste`)}">⚠</span>` : ''}` : ''}${md ? ` · <span title="Jours/homme de l'itération : chaque jour ouvré compte la capacité du rôle (Paramètres → Capacité dev), congés et fériés déduits — sur ${esc(_fr1(md.nominal))} j/h sans absence">${_fr1(md.present)} / ${_fr1(md.nominal)} j/h</span>` : ''}${cap.ignored ? ` · ${cap.ignored} à 0 %` : ''}${cap.unknownRole ? ` · ${cap.unknownRole} rôle inconnu` : ''}</span>
        </div>
        ${nav}
        <div class="meteo-wrap">
            <table class="meteo-roster-table">
                <caption class="meteo-sr">Membres de l'équipe, disponibilité sur l'itération et ${shifted ? 'absences sur l\'itération' : 'prochaine absence'}</caption>
                <thead><tr><th scope="col">Membre</th><th scope="col">Rôle</th>${it ? `<th scope="col" title="Capacité réelle sur l'itération : j/h présents (congés et fériés déduits) et part des story points projetés">Dispo<small class="meteo-iter-th">itération ${esc(it.label)}</small></th>` : ''}<th scope="col">${shifted ? 'Absences' : 'Prochaine absence'}${it ? `<small class="meteo-iter-th">itération ${esc(it.label)}</small>` : ''}</th></tr></thead>
                <tbody>${rows}</tbody>
                ${it && md ? `<tfoot><tr><td colspan="2">Total équipe</td><td class="meteo-roster-dispo-td">${dispoHtml({ ...md, pts: ptsTotal })}</td><td></td></tr></tfoot>` : ''}
            </table>
        </div>
        ${legend}
    </section>`;
}

/**
 * Navigation ◀ / ▶ de la carte roster : re-rend la SEULE carte (pas le Dashboard), puis rend le
 * focus au bouton cliqué. `getCtx` = contexte frais (`meteoContext`) à chaque pas.
 */
export function bindMeteoFiche(container, getCtx) {
    const card = container.querySelector('.meteo-roster[data-roster-team]');
    if (!card) return;
    card.addEventListener('click', e => {
        const btn = e.target.closest('[data-roster-step]');
        if (!btn || btn.disabled) return;
        const team = card.dataset.rosterTeam;
        const step = Number(btn.dataset.rosterStep);
        _rosterOffset.set(team, step === 0 ? 0 : (_rosterOffset.get(team) || 0) + step);
        const tpl = document.createElement('template');
        tpl.innerHTML = meteoRosterHtml(team, getCtx()).trim();
        card.replaceWith(tpl.content.firstElementChild);
        bindMeteoFiche(container, getCtx);
        const again = container.querySelector(`.meteo-roster [data-roster-step="${step}"]:not([disabled])`)
            || container.querySelector('.meteo-roster [data-roster-step]:not([disabled])');
        again?.focus();
    });
}

/** La rangée « fiche » : tendance + roster. */
export function meteoFicheHtml(team, ctx) {
    return `<div class="meteo-fiche">${meteoTrendHtml(team, ctx)}${meteoRosterHtml(team, ctx)}</div>`;
}
