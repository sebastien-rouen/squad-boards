/**
 * 🚫 Absents du jour en VUE GLOBALE (toutes les équipes / une ligne produit) — bandeau calendrier (3.246.0).
 *
 * Avant : une pastille « 🚫 Équipe N » par équipe. Sur mobile, elles s'empilaient sur la moitié de l'écran ;
 * sur desktop, elles passaient sur deux lignes. Maintenant : UNE pastille de synthèse sur une ligne,
 * « 🚫 10 absents », suivie d'un mini-badge par équipe (initiales + nombre, couleur de l'équipe), triés du plus
 * touché au moins touché. Le détail (qui, dans quelle équipe) est dans l'infobulle ; un clic ouvre la semaine
 * (chip sans `data-ev-idx`, câblé par cal_banner.js).
 * Styles : css/views/cal-banner-compact.css.
 */
import { esc, calPerson } from '../utils.js';

const _MAX_BADGES = 8;   // au-delà : « +N » (la synthèse reste sur une ligne, même avec 13 équipes)

/**
 * @param {object[]} offEvs      évènements d'absence du jour
 * @param {(team: string) => string} teamColor  couleur d'une équipe (même règle que les chips)
 */
export function offSummaryHtml(offEvs, teamColor) {
    if (!offEvs.length) return '';
    const byTeam = new Map();
    for (const ev of offEvs) {
        const t = (ev.team || '').split(',')[0].trim() || '';
        if (!byTeam.has(t)) byTeam.set(t, []);
        byTeam.get(t).push(calPerson(ev.title, 'off') || ev.title);
    }
    const teams = [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const n = offEvs.length;
    const tip = [`${n} absent${n > 1 ? 's' : ''} aujourd'hui — clic : voir la semaine`,
        ...teams.map(([t, people]) => `${t || 'Sans équipe'} (${people.length}) : ${people.join(', ')}`)].join('\n');
    const shown = teams.slice(0, _MAX_BADGES);
    const rest = teams.length - shown.length;
    const badges = shown.map(([t, people]) => {
        const abbr = t ? t.replace(/^(team|équipe)\s+/i, '').slice(0, 2).toUpperCase() : '?';
        return `<span class="cal-off-team" style="--cal-color:${t ? teamColor(t) : '#94a3b8'}" aria-hidden="true">${esc(abbr)}<b>${people.length}</b></span>`;
    }).join('');
    return `<span class="cal-chip cal-chip--off-sum" role="button" tabindex="0" title="${esc(tip)}"
            aria-label="${n} absent${n > 1 ? 's' : ''} aujourd'hui dans ${teams.length} équipe${teams.length > 1 ? 's' : ''} — voir la semaine">
        <span class="cal-off-sum-n">🚫 <b>${n}</b> absent${n > 1 ? 's' : ''}</span>
        <span class="cal-off-teams">${badges}${rest > 0 ? `<span class="cal-off-more">+${rest}</span>` : ''}</span>
    </span>`;
}
