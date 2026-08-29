/**
 * Météo des équipes — FIN DE PI : quand le sprint actif est le dernier du PI (respiration 🍃 ou
 * dernier index), le Dashboard ouvre par un bandeau « 🏁 Dernier sprint du PI » et une checklist
 * du PI Planning à venir, calculée sur les données — pas une liste à cocher à la main :
 *
 *   ✅/⬜ sprints du PI+1 connus côté JIRA · objectifs du PI+1 saisis · absences connues jusqu'à
 *   la fin du PI+1 · baseline du PI courant figée · rotation support du PI+1 générée
 *
 * Chaque ligne mène là où ça se règle. Rien n'est inventé : sprints JIRA, `piInfo.piObjectives`,
 * `lastKnownAbsenceDate`, `piInfo.piBaselines`, table `support`.
 */

import { esc, extractPiNum, getSprintForTeam, breathIdxOf, isBreathSprint, sprintIdx, lastKnownAbsenceDate, teamNameMatches } from '../utils.js';
import { loadPiCfg } from '../utils/pi-config.js';

const DAY = 86400000;
const _iso = d => String(d || '').slice(0, 10);
const _fmt = iso => (iso ? new Date(`${_iso(iso)}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '') : '');
const _daysUntil = iso => Math.ceil((new Date(`${_iso(iso)}T00:00:00`).getTime() - Date.now()) / DAY);

/** Le sprint actif d'une équipe est-il le dernier de son PI ? Renvoie `{ sprint, breath }` ou null. */
function _lastSprintOfPi(team, sprintInfoAll, piNum, sprintsPerPI) {
    const active = getSprintForTeam(team, sprintInfoAll);
    if (!active?.name || extractPiNum(active.name) !== piNum) return null;
    const piSprints = (sprintInfoAll?.teamSprints || []).filter(s => s.team === team && extractPiNum(s.name) === piNum);
    if (!piSprints.length) return null;
    const breathIdx = breathIdxOf(piSprints, sprintsPerPI);
    const lastIdx = Math.max(...piSprints.map(s => sprintIdx(s.name) || 0));
    const idx = sprintIdx(active.name) || 0;
    if (isBreathSprint(active.name, breathIdx) || (idx > 0 && idx === lastIdx)) return { sprint: active, breath: isBreathSprint(active.name, breathIdx) };
    return null;
}

/**
 * @returns {string} '' tant qu'aucune équipe du périmètre n'est dans son dernier sprint.
 */
export function endOfPiHtml({ teams = [], sprintInfoAll, piNum, piInfo, absences = [], support = [] } = {}) {
    if (!piNum || !teams.length) return '';
    const sprintsPerPI = piInfo?.sprintsPerPI || 0;
    const lasts = teams.map(t => ({ team: t, ...(_lastSprintOfPi(t, sprintInfoAll, piNum, sprintsPerPI) || {}) })).filter(x => x.sprint);
    if (!lasts.length) return '';
    const next = piNum + 1;
    const all = sprintInfoAll?.teamSprints || [];
    const endIso = lasts.map(x => _iso(x.sprint.endDate)).filter(Boolean).sort().at(-1);
    const daysLeft = endIso ? _daysUntil(endIso) : null;

    // 1. Sprints du PI+1 côté JIRA
    const withNext = teams.filter(t => all.some(s => s.team === t && extractPiNum(s.name) === next));
    // 2. Objectifs du PI+1 (snapshot) par équipe
    const nextObjs = (piInfo?.piObjectives || {})[String(next)] || [];
    const withObjs = teams.filter(t => nextObjs.some(o => (o.team || '') === t && (o.text || '').trim()));
    // 3. Absences connues jusqu'à la fin du PI+1
    const nextEnd = all.filter(s => extractPiNum(s.name) === next && s.endDate).map(s => _iso(s.endDate)).sort().at(-1) || null;
    const lastAbs = lastKnownAbsenceDate(absences);
    const absOk = !!(nextEnd && lastAbs && _iso(lastAbs) >= nextEnd);
    // 4. Baseline du PI courant
    const baseline = (piInfo?.piBaselines || {})[String(piNum)];
    // 5. Rotation support du PI+1 (entrées dont la semaine commence après la fin du sprint actif)
    const withRota = teams.filter(t => (support || []).some(e => teamNameMatches(e.team, t) && endIso && _iso(e.weekStart) > endIso));
    // Dates du PI Planning (pi-cfg-<N+1>), sinon config du PI courant
    const pip = (loadPiCfg(next)?.pipDates || loadPiCfg(piNum)?.pipDates || []).filter(Boolean);
    const pipLabel = pip.length ? (pip.length > 1 ? `${_fmt(pip[0])} → ${_fmt(pip.at(-1))}` : _fmt(pip[0])) : null;

    const n = teams.length;
    const one = n === 1;
    const teamHash = one ? encodeURIComponent(teams[0]) : 'all';
    const items = [
        { ok: withNext.length === n, label: `Sprints du PI #${next} connus côté JIRA`, detail: one ? (withNext.length ? 'oui' : 'aucun — créer les sprints dans JIRA puis synchroniser') : `${withNext.length}/${n} équipes`, href: '#settings/jira' },
        { ok: withObjs.length === n, label: `Objectifs du PI #${next} saisis`, detail: one ? `${nextObjs.filter(o => (o.team || '') === teams[0]).length} objectif(s)` : `${withObjs.length}/${n} équipes`, href: `#pi/${teamHash}/objectives/1` },
        { ok: absOk, label: `Absences connues jusqu'à la fin du PI #${next}`, detail: nextEnd ? `dernière absence connue : ${lastAbs ? _fmt(lastAbs) : 'aucune'} · fin du PI #${next} : ${_fmt(nextEnd)}` : `fin du PI #${next} inconnue (sprints non datés)`, href: '#settings/absences' },
        { ok: !!baseline, label: `Baseline du PI #${piNum} figée`, detail: baseline ? `figée le ${_fmt(baseline.capturedAt)}` : 'à figer avant la revue, pour mesurer le Say/Do', href: `#pi/${teamHash}/objectives` },
        { ok: withRota.length === n, label: `Rotation support du PI #${next} générée`, detail: one ? (withRota.length ? 'oui' : 'aucune semaine après la fin du sprint') : `${withRota.length}/${n} équipes`, href: one ? `#settings/rotation/${teamHash}` : '#settings/rotation' },
    ];
    const done = items.filter(i => i.ok).length;
    const breath = lasts.every(x => x.breath);
    return `
    <section class="card meteo-endpi${done === items.length ? ' meteo-endpi--ready' : ''}" aria-labelledby="meteo-endpi-title">
        <div class="card-header meteo-header">
            <span class="card-title" id="meteo-endpi-title">🏁 ${breath ? 'Sprint de respiration' : 'Dernier sprint'} du PI #${piNum}${one ? '' : ` — ${lasts.length}/${n} équipes`}</span>
            <span class="card-subtitle">${daysLeft != null ? (daysLeft > 0 ? `J−${daysLeft} · ` : 'dernier jour · ') : ''}PI Planning #${next}${pipLabel ? ` : ${esc(pipLabel)}` : ' : dates à saisir dans Sprint &amp; PI'} · préparation ${done}/${items.length}</span>
        </div>
        <ul class="meteo-endpi-list">${items.map(i => `
            <li class="${i.ok ? 'is-done' : ''}"><a href="${i.href}"><span class="meteo-endpi-check" aria-hidden="true">${i.ok ? '✅' : '⬜'}</span><span class="meteo-endpi-lbl">${esc(i.label)}</span><small>${esc(i.detail)}</small><span class="meteo-sr">${i.ok ? 'fait' : 'à faire'}</span></a></li>`).join('')}
        </ul>
    </section>`;
}
