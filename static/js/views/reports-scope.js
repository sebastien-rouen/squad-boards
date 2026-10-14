/**
 * Fenêtres de temps des sections Flow, Support, Roadmap et Burnup du rapport.
 *
 * Calculées UNE fois par reports.js et posées dans le contexte (`ctx.period`, `ctx.piWindow`) :
 * les quatre sections parlent ainsi de la même période, et elle reste celle de la section Sprint.
 *
 *   • `period`   = le SPRINT de l'équipe quand le PI affiché est le PI courant
 *                  (`getSprintForTeam`, qui retrouve aussi le sprint d'un board mal nommé) ;
 *                  le PI entier sinon (PI passé ou épinglé à venir).
 *   • `piWindow` = du 1er au dernier sprint du PI de l'équipe, complétés par le train quand
 *                  l'équipe n'a pas encore créé ses derniers sprints (cf `piBounds`), à défaut
 *                  les dates PROJETÉES (`projectedPiSprints`, annoncées comme telles).
 *
 * Avant 3.212.0 ces sections lisaient TOUT l'historique chargé (≈ 1 an : « 534 terminés » pour
 * Fuego, 133 tickets de support, 169 features) — des chiffres sans période, donc sans sens.
 */

import { getSprintForTeam, extractPiNum, extractSprintLabel } from '../utils.js';
// pi-weeks.js n'est pas dans le barrel utils.js : import direct, comme health.js.
import { projectedPiSprints, detectSprintsPerPI } from '../utils/pi-weeks.js';

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

/** Nombre à la française : « 7,7 » et non « 7.7 ». */
export const num = v => String(v).replace('.', ',');

/** Le timestamp tombe-t-il dans la fenêtre mesurée (bornée à aujourd'hui) ? */
export const inWindow = (ms, w) => Number.isFinite(ms) && w && ms >= w.start && ms <= w.measuredEnd;

/** Médiane basse d'une liste de dates ISO (le tri de chaînes suffit). */
const medianIso = list => { const a = list.slice().sort(); return a[Math.floor((a.length - 1) / 2)]; };

/**
 * Bornes du PI affiché. `null` si aucun sprint, réel ni projeté.
 * Début = 1er sprint de l'équipe, fin = DERNIER sprint du PI de l'équipe (index = nombre de
 * sprints du PI, `detectSprintsPerPI`). ⚠️ Une équipe ne crée souvent ses derniers sprints JIRA
 * qu'en cours de PI (Lion au PI 31 : 31.1 → 31.3 seulement) : prendre la fin du dernier sprint
 * CONNU arrêtait son PI au 18/10 au lieu du 12/11 (« 91 % du temps écoulé » à mi-PI). Il manque →
 * date MÉDIANE de ce sprint dans le train, qui ignore un calendrier atypique (Gabbiano : 30/11).
 * Même médiane pour « Toutes équipes ». Aucun sprint réel → dates projetées.
 */
function piBounds({ team, sprintInfo, piInfo, piNum }) {
    if (!piNum) return null;
    const idx = s => parseInt(extractSprintLabel(s.name).split('.')[1], 10) || 0;
    const ofPi = (sprintInfo?.teamSprints || []).filter(s => extractPiNum(s.name) === piNum && s.startDate && s.endDate);
    const own = team && team !== 'all' ? ofPi.filter(s => s.team === team) : [];
    const count = detectSprintsPerPI(sprintInfo, piNum, piInfo?.sprintsPerPI || 5);
    const pick = (i, field) => {
        const mine = own.filter(s => idx(s) === i).map(s => s[field]).sort();
        if (mine.length) return field === 'startDate' ? mine[0] : mine.at(-1);
        const train = ofPi.filter(s => idx(s) === i).map(s => s[field]);
        return train.length ? medianIso(train) : null;
    };
    const start = pick(1, 'startDate') || own.map(s => s.startDate).sort()[0];
    const end = pick(count, 'endDate') || own.map(s => s.endDate).sort().at(-1);
    if (start && end && end > start) return { start: dayMs(start), end: dayMs(end, true), projected: false };
    const proj = projectedPiSprints(sprintInfo, piInfo, piNum);
    if (!proj.length) return null;
    return { start: dayMs(proj[0].startDate), end: dayMs(proj.at(-1).endDate, true), projected: true };
}

/** Complète une fenêtre : fin mesurée bornée à maintenant, durée, temps écoulé, statut. */
function finish(w, now) {
    const measuredEnd = Math.min(w.end, now);
    const days = Math.max(1, Math.round((w.end - w.start) / DAY_MS));
    const elapsed = Math.max(0, Math.min(100, Math.round(((now - w.start) / (w.end - w.start)) * 100)));
    return { ...w, measuredEnd, days, elapsed, future: w.start > now, over: w.end < now };
}

/**
 * Sprint AFFICHÉ par les sections Métriques sprint, Sprint et Équipes (3.213.0).
 *   • PI courant → sprint de l'équipe (`getSprintForTeam` : nom, dates et OBJECTIF de l'équipe —
 *     avant, Fuego affichait l'objectif du sprint global, celui d'Ami) ;
 *   • PI passé   → DERNIER sprint du PI (ce qui a été livré à la fin) ;
 *   • PI à venir → PREMIER sprint du PI (souvent vide : rien d'engagé, et c'est la vérité).
 * Sprints du PI : ceux de l'équipe, à défaut ceux du train (une ligne par index).
 * @returns {{name, startDate, endDate, goal}|null}
 */
export function reportSprint({ team, sprintInfo, displayPiNum, isCurrentPi }) {
    if (isCurrentPi) {
        const sp = getSprintForTeam(team, sprintInfo);
        if (!sp) return null;
        // Toutes équipes / groupe : le sprint « global » est celui d'UNE équipe (Ami) — son nom et
        // son objectif ne parlent pas pour le train. Clé « NN.N » seule, sans objectif.
        return team && team !== 'all' ? sp : { ...sp, name: extractSprintLabel(sp.name) || sp.name, goal: '' };
    }
    if (!displayPiNum) return null;
    const idx = s => parseInt(extractSprintLabel(s.name).split('.')[1], 10) || 0;
    const ofPi = (sprintInfo?.teamSprints || []).filter(s => extractPiNum(s.name) === displayPiNum && idx(s));
    const own = team && team !== 'all' ? ofPi.filter(s => s.team === team) : [];
    const list = own.length ? own : ofPi;
    if (!list.length) return null;
    const isPast = extractPiNum(sprintInfo?.name) > displayPiNum;
    const target = isPast ? Math.max(...list.map(idx)) : Math.min(...list.map(idx));
    const pick = list.filter(s => idx(s) === target).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0];
    // Sur le train, le nom d'UNE équipe tromperait : on garde la clé « NN.N », qui les couvre toutes.
    return own.length ? pick : { ...pick, name: `${displayPiNum}.${target}`, goal: '' };
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

/**
 * Pourquoi une section de MESURE (Flow, Support) n'a rien à dire : pas de période, ou période
 * à venir (PI épinglé dans le futur). `null` quand il y a de quoi mesurer.
 */
export const idleReason = w => (!w
    ? { icon: '🗓️', title: 'Aucun sprint ni PI daté', text: 'Rien à mesurer — configurer « Sprint & PI » dans les Paramètres.' }
    : w.future ? { icon: '⏳', title: `${w.label} pas encore commencé`, text: `Début le ${shortDate(w.start)} : les mesures viendront avec le premier jour.` } : null);

/** « Sprint 31.3 · 05/10 → 16/10 » — libellé commun des en-têtes de section. */
export const windowLabel = w => (w ? `${w.label} · ${shortDate(w.start)} → ${shortDate(w.end)}` : 'période inconnue');
