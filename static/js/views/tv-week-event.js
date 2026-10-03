/**
 * Mode TV — 🗞️ La semaine en bref : DÉTAIL d'un évènement d'agenda (panneau, au clic) — 3.199.0.
 *
 * Nature (couleur et emoji du détecteur), horaire et durée, récurrence, agenda SOURCE (équipe, groupe,
 * train, opérations — même vocabulaire que la carte « Agenda de l'équipe »), lieu, description et
 * liens utiles (visio, documents) en boutons.
 *
 * ⚠️ La description vient de Google Agenda en HTML : jamais injectée telle quelle. Elle est lue par
 * DOMParser (aucun script exécuté), réduite à du TEXTE (sauts de ligne gardés) puis échappée ; seuls
 * les liens http(s) en sont extraits, rendus en boutons.
 */

import { store } from '../state.js';
import { esc, CAL_NATURES, CAL_SCOPES } from '../utils.js';
import { durLabel } from '../components/team_calendar.js';

const DESC_MAX = 1400;
const atNoon = k => new Date(`${k}T12:00:00`);
const longDay = k => atNoon(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const hm = iso => String(iso).slice(11, 16).replace(':', 'h');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Libellé d'un lien selon son hôte : la visio d'abord, c'est ce qu'on cherche en arrivant. */
function linkLabel(href) {
    let host = '';
    try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { return '🔗 Lien'; }
    if (/meet\.google/.test(host)) return '📹 Rejoindre Google Meet';
    if (/teams\.(microsoft|live)/.test(host)) return '📹 Rejoindre Teams';
    if (/zoom\.us/.test(host)) return '📹 Rejoindre Zoom';
    if (/docs\.google|drive\.google/.test(host)) return '📄 Document Google';
    if (/miro\.com|mural\.co|klaxoon/.test(host)) return '🧩 Tableau collaboratif';
    if (/confluence|atlassian\.net\/wiki/.test(host + href)) return '📘 Confluence';
    if (/atlassian\.net|jira/.test(host)) return '🎫 JIRA';
    if (/maps\.|g\.co|goo\.gl/.test(host)) return '🗺️ Plan d\'accès';
    return `🔗 ${host}`;
}

/** HTML Google → { text, links } sûrs. */
export function eventDescParts(html, location = '') {
    const links = new Map();
    const add = href => { if (/^https?:\/\//i.test(href) && !links.has(href)) links.set(href, linkLabel(href)); };
    let text = '';
    if (html) {
        const doc = new DOMParser().parseFromString(`<div>${String(html).replace(/<br\s*\/?>/gi, '\n')}</div>`, 'text/html');
        doc.querySelectorAll('a[href]').forEach(a => add(a.getAttribute('href') || ''));
        doc.querySelectorAll('p, div, li, tr, h1, h2, h3').forEach(n => n.append('\n'));
        text = (doc.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    for (const m of `${text} ${location}`.matchAll(/https?:\/\/[^\s<>"')]+/g)) add(m[0]);
    if (text.length > DESC_MAX) text = `${text.slice(0, DESC_MAX).replace(/\s+\S*$/, '')} …`;
    return { text, links: [...links].map(([href, label]) => ({ href, label })) };
}

/** Évènement brut du store (description, récurrence…) depuis l'item d'`eventsFor` (`id` = « équipe#index »). */
const rawOf = ev => (store.get('calendarEvents') || [])[+String(ev.id).split('#').pop()] || {};

/** Panneau de détail d'un évènement d'agenda (item d'`eventsFor`). */
export function calEventDetailHtml(ev) {
    const raw = rawOf(ev);
    const nat = CAL_NATURES[ev.kind] || CAL_NATURES.other;
    const scope = CAL_SCOPES[ev.scope] || { icon: '📅', label: 'Agenda' };
    const isTeam = ev.scope === 'team';
    const dur = !ev.allDay ? ev.endMin - ev.startMin : 0;
    const multiDay = ev.allDay && ev.end.slice(0, 10) > ev.day && (atNoon(ev.end.slice(0, 10)) - atNoon(ev.day)) / 864e5 > 1;
    const when = ev.allDay
        ? (multiDay ? `du ${longDay(ev.day)} au ${longDay(new Date(atNoon(ev.end.slice(0, 10)) - 864e5).toISOString().slice(0, 10))}` : `${longDay(ev.day)} · toute la journée`)
        : `${longDay(ev.day)} · ${hm(ev.start)} → ${hm(ev.end)}`;
    const { text, links } = eventDescParts(raw.description, raw.location || ev.location);
    const loc = String(raw.location || ev.location || '').trim();
    const locIsUrl = /^https?:\/\//i.test(loc);
    return `<div class="tvd-panel tvw-evd" data-k="${esc(ev.kind)}" data-scope="${esc(ev.scope)}" role="dialog" aria-modal="true" aria-label="${esc(ev.title)}">
        <header class="tvw-evd-hd">
            <span class="tvw-evd-ico" aria-hidden="true">${nat.emoji}</span>
            <div class="tvw-evd-id">
                <small class="tvw-evd-kind">${esc(nat.label)}${ev.corrected ? ' · rangé à la main' : ''}</small>
                <h3>${esc(ev.title || 'Sans titre')}</h3>
            </div>
            <button type="button" class="btn-icon tvd-close" data-tvd-close aria-label="Fermer">✕</button>
        </header>
        <div class="tvw-evd-when">
            <span>🗓️ ${esc(cap(when))}</span>
            ${dur ? `<span class="tvw-evd-chip">⏱️ ${esc(durLabel(dur))}</span>` : ''}
            ${raw.recurring ? '<span class="tvw-evd-chip">🔁 Récurrent</span>' : ''}
        </div>
        <div class="tvw-evd-meta">
            <span class="tvw-evd-src" data-scope="${esc(ev.scope)}"><span aria-hidden="true">${scope.icon}</span> ${isTeam ? 'Agenda de l\'équipe' : `Agenda commun · ${esc(scope.label)}`}<small>${esc(ev.cal)}</small></span>
            ${ev.person ? `<span class="tvw-evd-chip">👤 ${esc(ev.person)}</span>` : ''}
            ${loc && !locIsUrl ? `<span class="tvw-evd-loc">📍 ${esc(loc)}</span>` : ''}
        </div>
        ${links.length ? `<div class="tvw-evd-links">${links.slice(0, 6).map((l, i) => `<a class="btn ${i === 0 && /^📹/u.test(l.label) ? 'btn-primary' : 'btn-secondary'} btn-sm" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</div>` : ''}
        ${text ? `<div class="tvw-evd-desc">${text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : '<p class="tv-muted tvw-evd-empty">Pas de description dans l\'agenda.</p>'}
        <p class="tv-muted tvw-evd-foot">Nature déduite du titre${ev.corrected ? ' (règle posée à la main)' : ''} — à corriger dans Paramètres → Calendriers → Détecteur d'évènements.</p>
    </div>`;
}

/** Panneau « absents du jour » (évènements 🏖️ regroupés en une ligne dans la journée). */
export function offDetailHtml(day, list) {
    return `<div class="tvd-panel tvw-evd" data-k="off" role="dialog" aria-modal="true" aria-label="Absences du ${esc(longDay(day))}">
        <header class="tvw-evd-hd">
            <span class="tvw-evd-ico" aria-hidden="true">🏖️</span>
            <div class="tvw-evd-id"><small class="tvw-evd-kind">Absences · agendas</small><h3>${list.length} absent${list.length > 1 ? 's' : ''} — ${esc(longDay(day))}</h3></div>
            <button type="button" class="btn-icon tvd-close" data-tvd-close aria-label="Fermer">✕</button>
        </header>
        <ul class="tvw-daylist">${list.map(e => `<li class="is-off"><span aria-hidden="true">🏖️</span><span>${esc(e.person || e.title)}${e.allDay ? '' : ` <small>${esc(hm(e.start))} → ${esc(hm(e.end))}</small>`}<small> · ${esc(e.cal)}</small></span></li>`).join('')}</ul>
        <p class="tv-muted tvw-evd-foot">Saisies dans les agendas (« Prénom - OFF ») — l'écran 👥 Qui est là compte, lui, les congés importés.</p>
    </div>`;
}
