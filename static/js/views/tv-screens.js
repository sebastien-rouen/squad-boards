/**
 * Mode TV — écrans « du jour » et de tendance, à côté de ceux de tv.js :
 *
 *   👥 Qui est là      présents / absents par équipe aujourd'hui et au prochain jour ouvré, avec ce
 *                      qui tombe ces deux jours (férié, MEP, opérations, jalons du train) — chaque
 *                      personne absente ouvre sa fiche membre (3.196.0) ;
 *   ✅ Zéro blocker    quand l'alerte disparaît : depuis combien de jours aucun blocker n'a dépassé
 *                      48 h (3.196.0) ;
 *
 * (🏃 Sprint en cours : tv-sprint.js ; 🗞️ La semaine : tv-week.js.) Aussi les briques partagées avec tv.js et tv-sprint.js : attributs de ticket cliquable, liste paginée, jour local.
 */

import { store } from '../state.js';
import { esc, teamCapacity, sumBy, mapStatus, getCurrentPi, emptyStateHtml, rosterCtx } from '../utils.js';
import { isPastPi, ANOMALY_BY_KEY } from '../business_rules.js';
import { holidayName } from '../utils/holidays.js';
import { shortName, REL, MIL, opsIsProd } from '../components/team_timeline_model.js';
import { eventsFor, covers } from '../components/team_calendar.js';
import { calEventDetailHtml } from './tv-week-event.js';

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

/** Personne cliquable → sa fiche membre (Atlas, chargé à la demande par tv.js), comme dans la frise. */
const personBtn = n => `<button type="button" class="tv-chip tv-person" data-member="${esc(n)}" title="Fiche de ${esc(n)}">${esc(shortName(n))}</button>`;

export function screenPresence({ teams, teamObjects }) {
    const members = store.get('members') || [], absences = store.get('absences') || [];
    const today = dayKey(new Date()), next = nextWorkday(today);
    const nextName = plusDays(today, 1) === next ? 'Demain' : dayLabel(next, { weekday: 'long' }).replace(/^./, c => c.toUpperCase());
    const rc = rosterCtx(store.get('piInfo'), store.get('sprintInfo'));   // roster du PI courant, pas l'historique des congés
    const rows = teams.map(tm => ({ tm, now: teamCapacity(tm, members, absences, atNoon(today), rc), then: teamCapacity(tm, members, absences, atNoon(next), rc) }))
        .filter(r => r.now.total);
    if (!rows.length) return emptyStateHtml({ size: 'tv', icon: '👥', title: 'Aucun effectif connu', text: 'Importe les congés ou le roster (Paramètres) pour savoir qui est là.' });
    const here = sumBy(rows, r => r.now.available), total = sumBy(rows, r => r.now.total);

    // Ce qui tombe aujourd'hui et au prochain jour ouvré : férié, MEP, opérations, jalons du train — lu
    // dans l'agenda (`eventsFor`, mêmes règles MEP / jalons que la frise) pour être CLIQUABLE, et REGROUPÉ :
    // un même évènement les deux jours ou plusieurs fois (« [Gen2] Intervention » 09h30 et 15h00) = une pastille.
    const evts = presenceEvents(teams, today, next, nextName);

    const card = r => {
        const pct = Math.round((r.now.available / r.now.total) * 100);
        const lvl = pct === 100 ? 'ok' : pct >= 75 ? 'mid' : 'low';
        const later = r.then.absentNames.filter(n => !r.now.absentNames.includes(n));
        const absN = r.now.absentNames.length;
        return `<li class="tv-pres" style="--team-color:${colorOf(teamObjects, r.tm)}">
            <div class="tv-pres-hd"><span class="team-dot" style="background:${colorOf(teamObjects, r.tm)}"></span><b>${esc(r.tm)}</b>
                <span class="tv-pres-n" data-l="${lvl}" title="${esc(`${r.now.available} présent${r.now.available > 1 ? 's' : ''} sur ${r.now.total} aujourd'hui (${pct} %)${absN ? ` · ${absN} absent${absN > 1 ? 's' : ''}` : ''}`)}"><b>${r.now.available}</b><small>présent${r.now.available > 1 ? 's' : ''}<br>sur ${r.now.total}</small></span></div>
            <div class="tv-pres-bar" data-l="${lvl}" role="img" aria-label="${pct} % de l'équipe présente"><i style="width:${pct}%"></i></div>
            <p>${absN ? `<span class="tv-pres-abs">🌴 ${absN} absent${absN > 1 ? 's' : ''}</span> ${r.now.absentNames.map(personBtn).join('')}` : '<span class="tv-pres-all">✓ Toute l\'équipe est là</span>'}</p>
            ${later.length ? `<p class="tv-pres-next">${esc(nextName)} : ${later.map(n => personBtn(n)).join('')} absent${later.length > 1 ? 's' : ''} en plus</p>` : ''}
        </li>`;
    };
    return `<div class="tv-presence">
        <div class="tv-journee-hd"><span aria-hidden="true">👥</span><div><h2>${esc(dayLabel(today))}</h2><p>${here} présents sur ${total}${isWeekend(today) ? ' · week-end' : ''}</p></div></div>
        ${evts.length ? `<ul class="tv-evts">${evts.map(e => `<li class="${e.prod ? 'is-prod' : ''}${e.i !== undefined ? ' is-click' : ''}"${e.i !== undefined ? ` data-pres-ev="${e.i}" tabindex="0" role="button" aria-label="${esc(`${e.txt} — ${e.when} — voir le détail`)}"` : ''}><small>${esc(e.when)}</small><span aria-hidden="true">${e.ico}</span>${esc(e.txt)}${e.n > 1 ? ` <b class="tv-evts-n">×${e.n}</b>` : ''}</li>`).join('')}</ul>` : ''}
        ${pagedHtml(rows.map(card).join(''), { cls: 'tv-pres-grid', unit: 'équipes' })}
    </div>`;
}

// ── Évènements du jour et du lendemain (Qui est là) ──────────────────────────

let _presEvents = [];   // groupes affichés : { first, all[] } — résolus au clic (data-pres-ev)

/** Férié, MEP, opérations, jalons du train d'aujourd'hui et du prochain jour ouvré, REGROUPÉS par titre :
 *  « Aujourd'hui + Demain », « ×2 · 09h30, 15h00 ». */
function presenceEvents(teams, today, next, nextName) {
    const single = teams.length === 1;
    const days = [today, next];
    const label = d => (d === today ? 'Aujourd\'hui' : nextName);
    const wanted = e => e.scope === 'ops' || (e.scope === 'train' && MIL.test(e.title)) || ((e.scope === 'team' || e.scope === 'group' || !single) && REL.test(e.title));
    const groups = new Map();
    for (const e of eventsFor(single ? teams[0] : '*')) {
        if (!wanted(e)) continue;
        const on = days.filter(d => (e.allDay ? covers(e, d) : e.day === d));
        if (!on.length) continue;
        const key = e.title.trim().toLowerCase();
        const g = groups.get(key) || groups.set(key, { first: e, all: [], days: new Set() }).get(key);
        g.all.push(e); on.forEach(d => g.days.add(d));
    }
    _presEvents = [...groups.values()];
    const evs = _presEvents.map((g, i) => {
        const e = g.first, prod = e.scope === 'ops' && opsIsProd(e.title);
        const times = [...new Set(g.all.filter(x => !x.allDay).map(x => x.start.slice(11, 16).replace(':', 'h')))].sort();
        const ico = prod ? '⚠️' : e.scope === 'ops' ? '⚙️' : REL.test(e.title) ? '🚀' : '🚂';
        const title = e.title.replace(/^\s*⚠️\s*/u, '');
        return { i, prod, ico, n: g.all.length, sort: [...g.days].sort()[0] + (times[0] || ''),
            when: [...g.days].sort().map(label).join(' + '),
            txt: `${times.length ? `${times.join(', ')} · ` : ''}${REL.test(e.title) && e.scope !== 'ops' ? 'MEP · ' : ''}${title}` };
    });
    const hol = days.filter(d => holidayName(d)).map(d => ({ when: label(d), ico: '🎌', txt: `Férié · ${holidayName(d)}`, sort: d }));
    return [...hol, ...evs].sort((a, b) => a.sort.localeCompare(b.sort));
}

/** Détail d'un évènement de « Qui est là » (clic sur `data-pres-ev`), avec ses autres occurrences. */
export function presenceEventHtml(i) {
    const g = _presEvents[+i];
    return g ? calEventDetailHtml(g.first, { also: g.all.slice(1) }) : '';
}

// ── ✅ Zéro blocker ───────────────────────────────────────────────────────────

const BLOCKER_SEEN_KEY = 'sb-tv-blocker-seen';   // { équipe: ISO } — dernière alerte vue, PAR équipe
const H48 = 48 * 3600000;
const _isoTz = d => String(d || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');

function _seenMap() {
    try { const m = JSON.parse(localStorage.getItem(BLOCKER_SEEN_KEY) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; }
}

/** tv.js le note à chaque tour où l'alerte existe, pour les équipes concernées : la série « sans
 *  blocker » d'un périmètre part de la plus récente de ses équipes (une alerte de Fuego ne remet pas
 *  à zéro la série de Lion). */
export function noteBlockersSeen(teams) {
    const m = _seenMap(), now = new Date().toISOString();
    for (const t of new Set(teams)) m[t] = now;
    try { localStorage.setItem(BLOCKER_SEEN_KEY, JSON.stringify(m)); } catch { /* stockage indisponible */ }
}

/**
 * Fin du dernier blocage de plus de 48 h retrouvé dans le changelog (statut bloquant ou drapeau
 * JIRA). L'historique d'un ticket est tronqué (8 derniers évènements) : un blocage dont on ne voit
 * pas le début est ignoré — d'où le complément `noteBlockersSeen`, ce que l'écran a vu lui-même.
 */
function lastLongBlock(tickets) {
    let best = null;
    for (const t of tickets) {
        const ch = (t.recentChanges || []).filter(c => ['status', 'flagged'].includes(String(c.field || '').toLowerCase()))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        if (!ch.length) continue;
        // État avant le premier changement connu, d'après son « from ».
        const first = f => ch.find(c => String(c.field).toLowerCase() === f);
        let flagged = !!first('flagged')?.from, stBlocked = first('status') ? mapStatus(first('status').from) === 'blocked' : false;
        let since = null;   // début du blocage en cours (inconnu s'il précède l'historique)
        for (const c of ch) {
            const ms = new Date(_isoTz(c.date)).getTime(), was = flagged || stBlocked;
            if (String(c.field).toLowerCase() === 'flagged') flagged = !!c.to; else stBlocked = mapStatus(c.to) === 'blocked';
            const now = flagged || stBlocked;
            if (!was && now) since = ms;
            else if (was && !now) {
                if (since != null && ms - since > H48 && (!best || ms > best.at)) best = { at: ms, t, hours: Math.round((ms - since) / 3600000) };
                since = null;
            }
        }
    }
    return best;
}

/** `liveBlockers` : blockers > 48 h en cours (écran figé par l'adresse alors que l'alerte existe). */
export function screenZeroBlocker({ teams, teamObjects, liveBlockers = 0 }) {
    if (liveBlockers) return emptyStateHtml({ size: 'tv', tone: 'warn', icon: '⛈️', title: `${liveBlockers} blocker${liveBlockers > 1 ? 's' : ''} de plus de 48 h en ce moment`, text: `La série « zéro blocker » repartira quand ${liveBlockers > 1 ? 'ils auront' : 'il aura'} bougé — voir l'écran ⛈️ Alerte.` });
    const curPi = getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') });
    const teamTickets = (store.get('tickets') || []).filter(t => teams.includes(t.team));
    const tickets = teamTickets.filter(t => !isPastPi(t, curPi));
    const fromLog = lastLongBlock(teamTickets);   // l'historique : tous les tickets, PI révolus compris
    const seenMap = _seenMap();
    const seen = Math.max(0, ...teams.map(t => new Date(seenMap[t] || 0).getTime() || 0));
    const last = Math.max(fromLog?.at || 0, seen);
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    // Bloqués « jeunes » : les > 48 h relèvent de l'alerte (même règle que Santé).
    const recent = tickets.filter(t => t.status === 'blocked' && !ANOMALY_BY_KEY.oldBlockers.match(t, { curPi }));
    const when = ms => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const streak = days === null ? 'dans tout l\'historique connu'
        : days === 0 ? 'depuis aujourd\'hui' : `depuis <b>${days}</b> jour${days > 1 ? 's' : ''}`;
    const lastLine = fromLog && fromLog.at >= seen
        ? `Dernier : <code ${tkAttrs(fromLog.t.id)}>${esc(fromLog.t.id)}</code> · ${esc(fromLog.t.team)} — bloqué ${fromLog.hours >= 72 ? `${Math.round(fromLog.hours / 24)} j` : `${fromLog.hours} h`}, levé le ${esc(when(fromLog.at))}`
        : last ? `Dernière alerte vue sur cet écran : ${esc(when(last))}` : '';
    const color = tm => (teamObjects || []).find(o => o.name === tm)?.color || 'var(--border)';
    return `<div class="tv-zero">
        <div class="tv-zero-badge" aria-hidden="true">✅</div>
        <h2>Aucun blocker de plus de 48 h</h2>
        <p class="tv-zero-streak">${streak}</p>
        ${lastLine ? `<p class="tv-zero-last">${lastLine}</p>` : ''}
        ${recent.length
            ? `<div class="tv-zero-recent"><p>🚧 <b>${recent.length} ticket${recent.length > 1 ? 's' : ''} bloqué${recent.length > 1 ? 's' : ''}</b> depuis moins de 48 h — à lever avant qu'ils ne vieillissent :</p>
                <ul>${recent.map(t => `<li ${tkAttrs(t.id)} style="--team-color:${color(t.team)}"><code>${esc(t.id)}</code><span>${esc(t.title || '')}</span><small>${esc(t.team)}${t.leader ? ` · ${esc(t.leader)}` : ''}</small></li>`).join('')}</ul></div>`
            : '<p class="tv-zero-none">Et aucun ticket bloqué en ce moment. 🎉</p>'}
        <p class="tv-muted tv-zero-note">Série d'après l'historique JIRA (statuts bloquants, drapeaux) et les alertes vues par cet écran.</p>
    </div>`;
}
