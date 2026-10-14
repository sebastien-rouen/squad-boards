/**
 * Fenêtres de temps des sections Flow, Support, Roadmap et Burnup du rapport.
 *
 * Calculées UNE fois par reports.js et posées dans le contexte (`ctx.period`, `ctx.piWindow`) :
 * les quatre sections parlent ainsi de la même période, et elle reste celle de la section Sprint.
 *
 *   • `period`   = le SPRINT de l'équipe quand le PI affiché est le PI courant
 *                  (`getSprintForTeam`, qui retrouve aussi le sprint d'un board mal nommé) ;
 *                  le PI entier sinon (PI passé ou épinglé à venir).
 *   • `piWindow` = du premier au dernier jour des sprints JIRA du PI — ceux de l'équipe, à défaut
 *                  ceux du train (même règle que la météo, meteo_matrix.js), à défaut les dates
 *                  PROJETÉES (`projectedPiSprints`, annoncées comme telles).
 *
 * Avant 3.212.0 ces sections lisaient TOUT l'historique chargé (≈ 1 an : « 534 terminés » pour
 * Fuego, 133 tickets de support, 169 features) — des chiffres sans période, donc sans sens.
 */

import { getSprintForTeam, extractPiNum, extractSprintLabel, projectedPiSprints } from '../utils.js';

const DAY_MS = 86_400_000;

/** Jour ISO (AAAA-MM-JJ) → ms à minuit LOCAL ; `endOfDay` → 23:59:59.999 du même jour. */
const dayMs = (iso, endOfDay = false) => {
    const d = String(iso || '').slice(0, 10);
    if (!d) return NaN;
    return new Date(`${d}T00:00:00`).getTime() + (endOfDay ? DAY_MS - 1 : 0);
};

/** Date JIRA (« +0200 » sans « : », que Date ne lit pas toujours) → ms, NaN si absente. */
export const jiraMs = v => (v ? new Date(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime() : NaN);

/** « 05/10 » — date courte des en-têtes. */
export const shortDate = ms => {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Âge en jours entiers d'une date passée (0 si inconnue). */
export const ageDays = (v, now = Date.now()) => {
    const ms = jiraMs(v);
    return Number.isFinite(ms) ? Math.max(0, Math.floor((now - ms) / DAY_MS)) : 0;
};

/** Le timestamp tombe-t-il dans la fenêtre mesurée (bornée à aujourd'hui) ? */
export const inWindow = (ms, w) => Number.isFinite(ms) && w && ms >= w.start && ms <= w.measuredEnd;

/** Bornes du PI affiché. `null` si aucun sprint, réel ni projeté. */
function piBounds({ team, sprintInfo, piInfo, piNum }) {
    if (!piNum) return null;
    const ofPi = (sprintInfo?.teamSprints || []).filter(s => extractPiNum(s.name) === piNum);
    const own = team && team !== 'all' ? ofPi.filter(s => s.team === team) : ofPi;
    const real = own.length ? own : ofPi;
    const list = real.length ? real : projectedPiSprints(sprintInfo, piInfo, piNum);
    const starts = list.map(s => s.startDate).filter(Boolean).sort();
    const ends = list.map(s => s.endDate).filter(Boolean).sort();
    if (!starts.length || !ends.length) return null;
    return { start: dayMs(starts[0]), end: dayMs(ends.at(-1), true), projected: !real.length };
}

/** Complète une fenêtre : fin mesurée bornée à maintenant, durée, temps écoulé, statut. */
function finish(w, now) {
    const measuredEnd = Math.min(w.end, now);
    const days = Math.max(1, Math.round((w.end - w.start) / DAY_MS));
    const elapsed = Math.max(0, Math.min(100, Math.round(((now - w.start) / (w.end - w.start)) * 100)));
    return { ...w, measuredEnd, days, elapsed, future: w.start > now, over: w.end < now };
}

/**
 * @param {object} o { team, sprintInfo, piInfo, displayPiNum, isCurrentPi }
 * @returns {{ period: object|null, piWindow: object|null }}
 *   fenêtre = { kind: 'sprint'|'pi', label, start, end, measuredEnd, days, elapsed, future, over, projected? }
 */
export function reportWindows({ team, sprintInfo, piInfo, displayPiNum, isCurrentPi }, now = Date.now()) {
    const pi = piBounds({ team, sprintInfo, piInfo, piNum: displayPiNum });
    const piWindow = pi ? finish({ kind: 'pi', label: `PI ${displayPiNum}`, ...pi }, now) : null;

    let period = null;
    if (isCurrentPi) {
        const sp = getSprintForTeam(team, sprintInfo);
        const start = dayMs(sp?.startDate), end = dayMs(sp?.endDate, true);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            const key = extractSprintLabel(sp.name);
            period = finish({ kind: 'sprint', label: key ? `Sprint ${key}` : (sp.name || 'Sprint'), start, end }, now);
        }
    }
    // PI passé ou à venir, ou sprint introuvable : la période est le PI entier.
    return { period: period || piWindow, piWindow };
}

/** « Sprint 31.3 · 05/10 → 16/10 » — libellé commun des en-têtes de section. */
export const windowLabel = w => (w ? `${w.label} · ${shortDate(w.start)} → ${shortDate(w.end)}` : 'période inconnue');
