/**
 * Météo des équipes — le RÉSUMÉ en une ligne, pour les rapports (texte / Slack / Confluence)
 * et l'en-tête du PI Planning.
 *
 *   une équipe   → « ⛅ Variable — 🏃 Sprint ⛅ 65 % · 🗓️ PI ☀️ 56 % · 🛡️ Santé ⛅ 74 · 🎧 SLA ☀️ 90 % · 😊 Mood ⛅ 3,8 »
 *   plusieurs    → « ⛅ Variable — 4 équipes · 1 en ⛈️ (Orion) »
 *
 * Même calcul que la matrice (`computeTeamMeteo`) : le rapport dit ce que le Dashboard montre.
 */

import { worstLevel, METEO_GLYPH, METEO_LABEL } from '../utils.js';
import { computeTeamMeteo } from './meteo_matrix.js';

/** Classe de tuile métrique (`metric-card`) pour un niveau. */
export const METEO_MC = Object.freeze({ sun: 'mc-done', cloud: 'mc-info', rain: 'mc-warning', storm: 'mc-danger', none: 'mc-info' });

/**
 * @param {string[]} teams  périmètre (une équipe ou plusieurs)
 * @param {object}   ctx    `meteoContext(piNum)`
 * @returns {null|{ level, glyph, label, text, rows, pi }}  `null` si aucune équipe
 */
export function meteoSummary(teams, ctx) {
    if (!teams?.length) return null;
    const rows = teams.map(t => computeTeamMeteo(t, ctx));
    const level = worstLevel(rows.map(r => r.level));
    const glyph = METEO_GLYPH[level], label = METEO_LABEL[level];
    let text;
    if (rows.length === 1) {
        const r = rows[0];
        text = `${glyph} ${label} — ` + r.domains.map(d => `${d.icon} ${d.label} ${METEO_GLYPH[d.level]} ${d.value}`).join(' · ');
    } else {
        const storms = rows.filter(r => r.level === 'storm');
        const rains = rows.filter(r => r.level === 'rain');
        const parts = [`${rows.length} équipes`];
        if (storms.length) parts.push(`${storms.length} en ⛈️ (${storms.map(r => r.team).join(', ')})`);
        if (rains.length) parts.push(`${rains.length} en 🌧️ (${rains.map(r => r.team).join(', ')})`);
        if (!storms.length && !rains.length) parts.push('aucune en 🌧️ ni ⛈️');
        text = `${glyph} ${label} — ${parts.join(' · ')}`;
    }
    // Le domaine PI seul (en-tête du PI Planning) : pour une équipe sa case, sinon le pire des équipes.
    const piCells = rows.map(r => r.domains.find(d => d.key === 'pi'));
    const piLevel = worstLevel(piCells.map(c => c.level));
    const pi = rows.length === 1 ? { ...piCells[0] } : { level: piLevel, value: `${piCells.filter(c => c.level === 'sun').length}/${rows.length}`, sub: 'équipes en avance sur le PI' };
    return { level, glyph, label, text, rows, pi };
}
