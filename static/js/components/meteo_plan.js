/**
 * Météo des équipes — le PLAN D'ACTION d'une équipe (fiche équipe, Dashboard filtré).
 *
 * La météo ne juge pas : une pastille 🌧️ ou ⛈️ liste ce qui ferait revenir le soleil. Chaque
 * ligne est une anomalie de `ANOMALY_RULES` détectée sur l'équipe — avec son effectif, les
 * responsables concernés et une échéance dérivée de la gravité — et ouvre la modale d'action
 * existante (`openAlertModal`), qui liste les tickets et permet de les corriger en ligne.
 *
 * Une liste sans « qui » ni « quand » n'est pas un plan : les deux sont toujours affichés,
 * « non assigné » compris (c'est alors l'action elle-même).
 */

import { esc, initials, METEO_GLYPH, METEO_LABEL } from '../utils.js';
import { openAlertModal } from './alert_modal.js';
import { computeTeamMeteo } from './meteo_matrix.js';

const URGENCY = { danger: 'aujourd\'hui', warning: 'cette semaine', info: 'avant le prochain sprint' };
const ORDER = { danger: 0, warning: 1, info: 2 };
/** Prénom + initiale du nom (« SYLLA, Mohamed » → « Mohamed S. »). */
const _short = n => { const [last, first] = String(n).split(','); return first ? `${first.trim()} ${last.trim().charAt(0)}.` : String(n); };

/** TOUS les responsables (avant 3.199.2 : deux, puis « +1 » — à la TV, on ne voyait pas qui).
 *  `names` (mode TV) : prénoms lisibles de loin plutôt qu'initiales. */
const _who = (leaders, names = false) => {
    if (!leaders.length) return '<span class="meteo-plan-who meteo-plan-who--none">non assigné</span>';
    const shown = leaders.map(n => (names
        ? `<span class="meteo-plan-name" title="${esc(n)}">${esc(_short(n))}</span>`
        : `<span class="meteo-plan-avatar" title="${esc(n)}">${esc(initials(n))}</span>`)).join('');
    return `<span class="meteo-plan-who${names ? ' is-names' : ''}" title="${esc(leaders.join(', '))}">${shown}</span>`;
};

/**
 * Card « Plan d'action » — vide (chaîne vide) quand aucune anomalie : un plan sans rien à
 * faire n'a pas à occuper l'écran.
 */
export function meteoPlanHtml(team, ctx, { names = false } = {}) {
    const r = computeTeamMeteo(team, ctx);
    const rows = (r.anomalies || []).filter(a => a.n > 0).sort((a, b) => (ORDER[a.sev] - ORDER[b.sev]) || (b.n - a.n));
    if (!rows.length) return '';
    const total = rows.reduce((s, a) => s + a.n, 0);
    const bad = r.level === 'storm' || r.level === 'rain';
    const lead = bad ? 'Ce qui ferait revenir le soleil' : 'À garder à l\'œil';
    return `
    <section class="card meteo-plan meteo-plan--${r.level}" aria-labelledby="meteo-plan-title">
        <div class="card-header">
            <span class="card-title" id="meteo-plan-title"><span aria-hidden="true">${METEO_GLYPH[r.level]}</span> ${esc(lead)} — ${esc(team)}</span>
            <span class="card-subtitle">${esc(METEO_LABEL[r.level])} · ${total} anomalie${total > 1 ? 's' : ''} · cliquer une ligne ouvre les tickets</span>
        </div>
        <ol class="meteo-plan-list">
            ${rows.map(a => `
            <li>
                <button type="button" class="meteo-plan-row meteo-plan-row--${esc(a.sev)}" data-plan-anomaly="${esc(a.key)}" title="${esc(a.title)}">
                    <span class="meteo-plan-ico" aria-hidden="true">${a.icon}</span>
                    <span class="meteo-plan-txt"><b>${esc(a.title)}</b><span>${esc(a.intro)}</span></span>
                    <span class="meteo-plan-n" title="${a.n} ticket${a.n > 1 ? 's' : ''}">${a.n}</span>
                    ${_who(a.leaders, names)}
                    <span class="meteo-plan-when">${URGENCY[a.sev] || ''}</span>
                </button>
            </li>`).join('')}
        </ol>
    </section>`;
}

/** Une ligne du plan → la modale d'action de l'anomalie (périmètre = équipe filtrée du store). */
export function bindMeteoPlan(container) {
    container.querySelectorAll('.meteo-plan-row[data-plan-anomaly]').forEach(btn => {
        btn.addEventListener('click', () => openAlertModal(btn.dataset.planAnomaly));
    });
}
