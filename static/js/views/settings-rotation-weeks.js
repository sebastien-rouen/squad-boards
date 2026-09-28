/**
 * Semaines d'un PI pour la grille Rotation Support, et les dates qui vont avec.
 *
 * Extrait de settings-rotation.js (3.162.0), qui depassait les 800 lignes. Rien de neuf
 * ici : ce module ne fait que deleguer a la source unique `utils/pi-weeks.js` en lui
 * passant l'etat du store. Ne JAMAIS recalculer des semaines ailleurs — `weekStart` est
 * la cle d'appariement des rotations en base.
 */

import { store } from '../state.js';
import { supportWorkingDays, getSupportWeekMode, SUPPORT_WEEK_MODE_DEFAULT, supportAbsenceDays } from '../utils.js';
import { buildPiWeeks, detectSprintsPerPI, jiraSprint1Start } from '../utils/pi-weeks.js';
import { _rotPiOff } from './settings-rotation-display.js';

/** Détecte le nombre réel de sprints d'un PI depuis les teamSprints JIRA (max index).
 *  Couvre les PI exceptionnels à 6 sprints (ex: PI30 avec un sprint 30.6). */

const _detectSprintsPerPI = (piNum, fallback) => detectSprintsPerPI(store.get('sprintInfo'), piNum, fallback);

const _jiraSprint1Start = (piNum) => jiraSprint1Start(store.get('sprintInfo'), piNum);

/** Semaines du PI affiché pour une équipe — délègue à la source unique utils/pi-weeks.js.
 *  Conserve la forme historique { selectedWeeks, selectedPiNum, curWeeks, nextWeeks, … }
 *  attendue par la grille et le shuffle. */
function _rotBuildPiWeeks(team = null) {
    const { weeks, piNum, base } = buildPiWeeks({
        piInfo: store.get('piInfo'),
        sprintInfo: store.get('sprintInfo'),
        piOffset: _rotPiOff(),
        weekMode: team ? getSupportWeekMode(team) : SUPPORT_WEEK_MODE_DEFAULT,
    });
    return { ...base, selectedWeeks: weeks, selectedPiNum: piNum };
}

/** Jours d'absence d'un membre DANS la semaine — source unique supportAbsenceDays (utils/support.js).
 *  L'ancienne copie additionnait la durée totale de chaque congé qui chevauchait la semaine. */
function _rotAbsDays(memberName, weekStart, weekEnd, absences) {
    return supportAbsenceDays(memberName, weekStart, weekEnd, absences);
}

/** Premier jour OUVRÉ de la semaine — celui qu'affiche la première pastille de la colonne
 *  (supportWorkingDays saute samedi/dimanche). Quand la date de début du PI vient de JIRA
 *  sans être snappée (PI 31 : dimanche 2026-09-06), l'en-tête annonçait « 6 sept. » au-dessus
 *  d'une colonne qui commence le lundi 7. Correction d'AFFICHAGE seulement : `weekStart` reste
 *  la clé d'appariement des rotations déjà enregistrées en base. */
function _rotFirstWorkday(weekStart) {
    return supportWorkingDays(weekStart)[0]?.iso || weekStart;
}

/** Dernier jour ouvré de la semaine (infobulle de l'en-tête). */
function _rotLastWorkday(weekStart) {
    const days = supportWorkingDays(weekStart);
    return days[days.length - 1]?.iso || weekStart;
}

/** Format court : "14 avr." */
function _rotFmtShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export {
    _detectSprintsPerPI, _jiraSprint1Start, _rotBuildPiWeeks, _rotAbsDays,
    _rotFirstWorkday, _rotLastWorkday, _rotFmtShort,
};
