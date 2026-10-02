/**
 * Mode TV — écrans « du jour » et de tendance, à côté de ceux de tv.js :
 *
 *   👥 Qui est là      présents / absents par équipe aujourd'hui et au prochain jour ouvré, avec ce
 *                      qui tombe ces deux jours (férié, MEP, opérations, jalons du train) ;
 *
 * (🏃 Sprint en cours : tv-sprint.js ; 🗞️ La semaine : tv-week.js.) Aussi les briques partagées avec tv.js et tv-sprint.js : attributs de ticket cliquable, liste paginée, jour local.
 */

import { store } from '../state.js';
import { esc, teamCapacity, sumBy } from '../utils.js';
import { holidayName } from '../utils/holidays.js';
import { collect, shortName } from '../components/team_timeline_model.js';

// ── Briques partagées ─────────────────────────────────────────────────────────

/** Attributs d'un ticket cliquable (clic ou Entrée → popin du ticket, cf. renderTv). */
export const tkAttrs = id => `data-ticket="${esc(id)}" tabindex="0" role="button" aria-label="Ouvrir ${esc(id)}"`;

/** Conteneur paginé (cf. _paginate de tv.js) : `#tv-paged-list` découpé en pages qui tournent.
 *  `perPage` = pages de N éléments fixes ; sinon découpe à la hauteur de l'écran. */
export const pagedHtml = (inner, { tag = 'ul', cls = 'tv-list', unit = 'tickets', perPage = 0, style = '' } = {}) =>
    `<div class="tv-paged"><${tag} class="${cls}" id="tv-paged-list" data-unit="${esc(unit)}"${perPage ? ` data-per-page="${perPage}"` : ''}${style ? ` style="${style}"` : ''}>${inner}</${tag}><div class="tv-pager" id="tv-pager" hidden></div></div>`;

/** Jour LOCAL (AAAA-MM-JJ) — toISOString() donnerait le jour UTC, faux entre minuit et 2 h. */
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const atNoon = k => new Date(`${k}T12:00:00`);
const plusDays = (k, n) => { const d = atNoon(k); d.setDate(d.getDate() + n); return dayKey(d); };
const isWeekend = k => [0, 6].includes(atNoon(k).getDay());
const nextWorkday = k => { let d = plusDays(k, 1); while (isWeekend(d)) d = plusDays(d, 1); return d; };
const dayLabel = (k, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => atNoon(k).toLocaleDateString('fr-FR', opts);
const resolvedDay = t => (t.resolvedDate ? dayKey(new Date(String(t.resolvedDate).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))) : '');
const colorOf = (teamObjects, tm) => (teamObjects || []).find(o => o.name === tm)?.color || 'var(--border)';

// ── 👥 Qui est là ─────────────────────────────────────────────────────────────

export function screenPresence({ teams, teamObjects }) {
    const members = store.get('members') || [], absences = store.get('absences') || [];
    const today = dayKey(new Date()), next = nextWorkday(today);
    const nextName = plusDays(today, 1) === next ? 'Demain' : dayLabel(next, { weekday: 'long' });
    const rows = teams.map(tm => ({ tm, now: teamCapacity(tm, members, absences, atNoon(today)), then: teamCapacity(tm, members, absences, atNoon(next)) }))
        .filter(r => r.now.total);
    if (!rows.length) return `<div class="tv-clear"><span aria-hidden="true">👥</span><h2>Aucun effectif connu</h2><p>Importe les congés ou le roster (Paramètres) pour savoir qui est là.</p></div>`;
    const here = sumBy(rows, r => r.now.available), total = sumBy(rows, r => r.now.total);

    // Ce qui tombe aujourd'hui et au prochain jour ouvré : férié, MEP, opérations, jalons du train.
    const scopeTeam = teams.length === 1 ? teams[0] : '*';
    const c = collect(scopeTeam, today, next);
    const when = d => (d === today ? 'Aujourd\'hui' : nextName);
    const evts = [
        ...[today, next].map(d => holidayName(d) && { d, ico: '🎌', txt: `Férié · ${holidayName(d)}` }),
        ...c.releases.map(r => ({ d: r.day, ico: '🚀', txt: `MEP · ${r.items.map(i => i.title).join(' · ')}` })),
        ...c.operations.map(o => ({ d: o.day, ico: o.prod ? '⚠️' : '⚙️', txt: `${o.time ? o.time.replace(':', 'h') + ' · ' : ''}${o.title}`, prod: o.prod })),
        ...c.milestones.map(m => ({ d: m.day, ico: '🚂', txt: m.title })),
    ].filter(Boolean);

    const card = r => {
        const pct = Math.round((r.now.available / r.now.total) * 100);
        const lvl = pct === 100 ? 'ok' : pct >= 75 ? 'mid' : 'low';
        const later = r.then.absentNames.filter(n => !r.now.absentNames.includes(n));
        return `<li class="tv-pres" style="--team-color:${colorOf(teamObjects, r.tm)}">
            <div class="tv-pres-hd"><span class="team-dot" style="background:${colorOf(teamObjects, r.tm)}"></span><b>${esc(r.tm)}</b><span class="tv-pres-n" data-l="${lvl}">${r.now.available}<small> / ${r.now.total}</small></span></div>
            <div class="tv-pres-bar" data-l="${lvl}"><i style="width:${pct}%"></i></div>
            <p>${r.now.absentNames.length ? `🌴 ${r.now.absentNames.map(n => `<span class="tv-chip">${esc(shortName(n))}</span>`).join('')}` : '<span class="tv-pres-all">✓ Toute l\'équipe est là</span>'}</p>
            ${later.length ? `<p class="tv-pres-next">${esc(nextName)} : ${later.map(n => esc(shortName(n))).join(', ')} absent${later.length > 1 ? 's' : ''} en plus</p>` : ''}
        </li>`;
    };
    return `<div class="tv-presence">
        <div class="tv-journee-hd"><span aria-hidden="true">👥</span><div><h2>${esc(dayLabel(today))}</h2><p>${here} présents sur ${total}${isWeekend(today) ? ' · week-end' : ''}</p></div></div>
        ${evts.length ? `<ul class="tv-evts">${evts.sort((a, b) => a.d.localeCompare(b.d)).map(e => `<li${e.prod ? ' class="is-prod"' : ''}><small>${esc(when(e.d))}</small><span aria-hidden="true">${e.ico}</span>${esc(e.txt)}</li>`).join('')}</ul>` : ''}
        ${pagedHtml(rows.map(card).join(''), { cls: 'tv-pres-grid', unit: 'équipes' })}
    </div>`;
}
