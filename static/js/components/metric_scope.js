/**
 * Badge « périmètre + couverture de données » réutilisable sur les cards de métriques.
 *
 * Objectif (axe « confiance des chiffres ») : rendre explicite SUR QUOI un chiffre est calculé,
 * combien de tickets ont réellement pu être mesurés, et combien ont été exclus (et pourquoi).
 * Un « cycle time médian : 4 j » n'a pas le même poids selon qu'il repose sur 3 ou 120 tickets.
 *
 * Usage :
 *   import { metricScopeHtml } from './metric_scope.js';
 *   metricScopeHtml({ scope: 'PI 30', measured: 12, total: 40, excludedReason: 'dates manquantes' })
 */

import { esc } from '../utils.js';

/**
 * @param {object} o
 * @param {string} [o.scope]          Périmètre lisible ("Sprint 30.2", "PI 30", "historique équipe").
 * @param {number} o.measured         Nb de tickets/éléments réellement pris dans le calcul.
 * @param {number} o.total            Nb de tickets/éléments candidats (avant exclusions).
 * @param {string} [o.unit]           Nom de l'unité comptée (par défaut "tickets").
 * @param {string} [o.excludedReason] Raison courte des exclusions ("dates manquantes", "hors flux"…).
 * @param {'ok'|'low'|'auto'} [o.level] Forçage du niveau de confiance (sinon déduit de la couverture).
 * @returns {string} HTML d'un bloc `.metric-scope`.
 */
export function metricScopeHtml({ scope, measured = 0, total = 0, unit = 'tickets', excludedReason, level } = {}) {
    const excluded = Math.max(0, total - measured);
    const cov = total > 0 ? Math.round((measured / total) * 100) : 0;
    // Niveau de confiance : rouge si très peu de données, ambre si couverture partielle, vert sinon.
    const lvl = level || (measured < 5 ? 'low' : (cov < 60 || measured < 12) ? 'auto' : 'ok');
    const icon = lvl === 'low' ? '⚠' : lvl === 'auto' ? '◐' : '📐';
    const scopeTxt = scope ? `<strong>${esc(scope)}</strong>` : '';
    const exclTxt = excluded > 0
        ? ` · <span class="metric-scope-excl" title="Exclus du calcul${excludedReason ? ' : ' + esc(excludedReason) : ''}">${excluded} exclu${excluded > 1 ? 's' : ''}${excludedReason ? ` (${esc(excludedReason)})` : ''}</span>`
        : '';
    const title = `Mesuré sur ${measured}/${total} ${esc(unit)}${scope ? ' — ' + esc(scope) : ''}`
        + (excluded > 0 ? ` — ${excluded} exclu(s)${excludedReason ? ' : ' + esc(excludedReason) : ''}` : '')
        + ` — couverture ${cov}%`;
    return `<div class="metric-scope metric-scope--${lvl}" title="${title}">`
        + `${icon} Mesuré sur ${scopeTxt ? scopeTxt + ' · ' : ''}<strong>${measured}/${total}</strong> ${esc(unit)}${exclTxt}`
        + `</div>`;
}
