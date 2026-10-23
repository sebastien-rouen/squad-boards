/**
 * Calendar banner — aujourd'hui en haut du Sprint/Kanban,
 * clic → modal semaine groupée par jour.
 *
 * Découpé en 3.254.0 : modale semaine (cal_week_modal.js), outils de la modale (cal_week_tools.js),
 * calques et infobulles (cal_popups.js). Ici : helpers, pastilles, bandeau du jour, synchro des agendas.
 */

import { store } from '../state.js';
import { esc, hashColor, toast, relevantCalendars, calNatureWithRules } from '../utils.js';
import * as api from '../api.js';
import { holidayName } from '../utils/holidays.js';
import { offSummaryHtml } from './cal_banner_off.js';
import { groupDailies, isDailyGroupOpen, toggleDailyGroup, dailyGroupChipHtml } from './cal_banner_dailies.js';
import './cal_popups.js';   // effets de bord (écouteurs globaux)
import { _openWeekModal } from './cal_week_modal.js';
import './cal_week_tools.js';   // effets de bord (écouteurs globaux)

// ── Jours fériés France : utils/holidays.js (source unique, partagée avec la frise de la page Équipe) ─
export const _getHoliday = holidayName;

// ── Helpers formatage ─────────────────────────────────────────────────────────
export function _h(d) {
    return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}
export function _dayKey(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
export function _fmtDay(d) {
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function _todayKey() {
    return _dayKey(new Date());
}
// Retourne true si l'événement couvre le jour dk.
// Pour les events allDay, DTEND est exclusif (spec iCal) → on utilise > dk.
// Pour les events avec heure, la fin est inclusive → on utilise >= dk.
export function _eventCoversDay(ev, dk) {
    const sk = _dayKey(ev.start);
    if (sk > dk) return false;
    const ek = _dayKey(ev.end);
    return ev.allDay ? ek > dk : ek >= dk;
}
// Couleur dérivée de l'ID du calendrier (stable, unique par agenda).
export function _calColor(ev) {
    return hashColor(ev.calendarId || ev.calendarName || ev.team || '');
}
function _teamColor(team) {
    return team ? hashColor(team) : 'var(--primary)';
}
export function _duration(start, end) {
    const mins = Math.round((new Date(end) - new Date(start)) / 60000);
    if (mins <= 0) return '';
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h}h${m}` : `${h}h`;
}

// Domaines de visioconférence reconnus (premier lien trouvé = lien de réunion)
const _VISIO_DOMAINS = /https?:\/\/(?:[\w-]+\.)*(?:meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|zoom\.us|whereby\.com|webex\.com|chime\.aws|bluejeans\.com|visio\.[\w.-]+|gotomeeting\.com|jit\.si|meet\.jit\.si)\/\S+/i;

// Cherche un lien visio dans url > location > description (les invitations Meet/Teams
// mettent souvent le lien dans le corps de la description, pas dans LOCATION).
export function _extractVisioLink(ev) {
    // 1. champ url s'il pointe vers un domaine visio reconnu
    if (ev.url) { const m = ev.url.match(_VISIO_DOMAINS); if (m) return m[0]; }
    // 2. location : URL complète ou domaine visio
    const loc = (ev.location || '').trim();
    if (loc) {
        const m = loc.match(_VISIO_DOMAINS);
        if (m) return m[0];
        if (/^https?:\/\//i.test(loc)) return loc;
        // domaine nu type "meet.google.com/xxx"
        if (/^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}\/\S+/i.test(loc)) return `https://${loc}`;
    }
    // 3. description : 1er lien visio reconnu
    const desc = (ev.description || '').replace(/&nbsp;/g, ' ');
    const dm = desc.match(_VISIO_DOMAINS);
    if (dm) return dm[0].replace(/[)\].,;]+$/, ''); // nettoie ponctuation de fin
    return null;
}

// ── Chip HTML (bannière aujourd'hui) ─────────────────────────────────────────
// Identifie les absences. Accepte "OFF" et les variantes demi-journée "1/2 OFF", "½ OFF",
// "AM OFF", "PM OFF" — toujours en fin de titre, après un tiret.
export function _isOff(title)     { return /-\s*[^-]*\bOFF\s*$/i.test(title || ''); }
export function _isHalfOff(title) { return /-\s*(?:1\s*\/\s*2|½|AM|PM|matin|après[- ]?midi)\s*OFF\s*$/i.test(title || ''); }
export function _isFreeze(title)  { return /\b(gel|freeze)\b/i.test(title || ''); }

// Détecte une cérémonie Scrum/Agile depuis le titre — retourne {key, icon, label, details} ou null
// L'ordre des règles compte : plus spécifique d'abord (sprint review/planning avant "review"/"planning" seul).
// Les `details` alimentent la tooltip pédagogique (pourquoi, qui, fréquence, output, exemple).
export const _SCRUM_DETAILS = {
    daily: {
        why: 'Synchroniser l\'équipe et lever les blockers au plus tôt',
        who: 'Toute l\'équipe de dev + le Scrum Master',
        frequency: 'Chaque jour ouvré, ~15 min, à heure fixe',
        output: 'Plan du jour partagé + blockers identifiés à traiter',
        example: '« Hier j\'ai fini la migration X, aujourd\'hui je commence Y, je suis bloqué par l\'accès à la base. »',
    },
    planning: {
        why: 'Engager l\'équipe sur les tickets du sprint à venir et définir un objectif clair',
        who: 'Équipe dev + Product Owner + Scrum Master',
        frequency: 'Au démarrage de chaque sprint, ~2-4 h pour un sprint de 2 semaines',
        output: 'Sprint Backlog priorisé + Sprint Goal partagé',
        example: '« Ce sprint on s\'engage sur 25 SP, objectif : livrer le parcours de connexion. »',
    },
    refinement: {
        why: 'Préparer le backlog du prochain sprint : clarifier, découper, estimer',
        who: 'Équipe dev + Product Owner (Scrum Master facilite)',
        frequency: '1 séance par sprint, ~1-2 h (peut être splitée)',
        output: 'Tickets affinés (critères d\'acceptation, dépendances, Story Points)',
        example: '« On reformule US-123 en 3 sous-tickets et on l\'estime à 5 SP. »',
    },
    retro: {
        why: 'Identifier ce qui marche, ce qui coince, et lancer des actions d\'amélioration continue',
        who: 'Équipe dev + Product Owner + Scrum Master',
        frequency: 'Fin de chaque sprint, ~1 h à 1 h 30',
        output: 'Actions concrètes (Start / Stop / Continue) avec porteur et échéance',
        example: '« Stop : daily à 10 h trop tard. Start : pair programming le lundi. »',
    },
    review: {
        why: 'Démontrer l\'incrément livré, recueillir le feedback métier, ajuster la suite',
        who: 'Équipe + PO + stakeholders / métier / invités',
        frequency: 'Fin de chaque sprint, ~1 à 2 h selon le périmètre',
        output: 'Feedback métier + décisions sur le backlog (priorité, scope)',
        example: '« Démo live de la feature login, le métier valide et demande un ajustement sur l\'erreur 401. »',
    },
};
// Nature du détecteur commun (utils/cal-classify.js) → clé de cérémonie du bandeau. L'ancien
// détecteur local ignorait « Raffinage de tickets » et « Démonstration d'itération », et rangeait
// le PI Planning (train) avec le sprint planning. Les règles positionnées à la main s'appliquent aussi.
const _SCRUM_OF_NATURE = {
    daily:    ['daily',      '🌅', 'Daily'],
    planning: ['planning',   '🎯', 'Planning'],
    affinage: ['refinement', '🔍', 'Refinement'],
    demo:     ['review',     '🎤', 'Sprint Review'],
    retro:    ['retro',      '🔁', 'Rétro'],
};
export function _detectScrumType(title) {
    if (!title) return null;
    const m = _SCRUM_OF_NATURE[calNatureWithRules(title, store.get('calendarRules')).nature];
    return m ? { key: m[0], icon: m[1], label: m[2], details: _SCRUM_DETAILS[m[0]] } : null;
}

function _chip(ev, idx = 0) {
    const s = new Date(ev.start), e = new Date(ev.end);
    const timeStr = ev.allDay ? 'Journée' : `${_h(s)}–${_h(e)}`;
    const off = _isOff(ev.title);
    const half = off && _isHalfOff(ev.title);
    const color = off ? '#f97316' : _teamColor(ev.team);
    const tip = [ev.title, timeStr, ev.location ? '📍 ' + ev.location : ''].filter(Boolean).join('\n');
    return `<span class="cal-chip${off ? ' cal-chip--off' : ''}${half ? ' cal-chip--half' : ''}" data-ev-idx="${idx}" style="--cal-color:${color}" title="${esc(tip)}">
        <span class="cal-chip-time">${off ? (half ? '½' : '🚫') : timeStr}</span>
        <span class="cal-chip-title">${esc(ev.title)}</span>
        ${!off && ev.team ? `<span class="cal-chip-team">${esc(ev.team)}</span>` : ''}
    </span>`;
}

// Au-delà de ce nombre d'absences du jour, vue "toutes équipes" : un chip par
// personne casse le visuel (déborde sur plusieurs lignes) → on regroupe par équipe.
const OFF_GROUP_THRESHOLD = 5;

/** Chip groupé "N absences" pour une équipe (couleur de l'équipe, pas de nom listé). */
function _offGroupChip(team, count) {
    const color = team ? _teamColor(team) : '#94a3b8';
    const label = team || 'Sans équipe';
    return `<span class="cal-chip cal-chip--off-group" style="--cal-color:${color}" title="${count} absence${count > 1 ? 's' : ''} aujourd'hui · ${esc(label)}">
        <span class="cal-chip-time">🚫</span>
        <span class="cal-chip-title">${esc(label)}</span>
        <span class="cal-chip-off-count">${count}</span>
    </span>`;
}

/** HTML des chips d'absences du jour — groupé par équipe si `groupOff`, sinon un chip par personne. */
function _offChipsHtml(offEvs, todayEvs, groupOff) {
    if (!offEvs.length) return '';
    if (!groupOff) return offEvs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('');
    const byTeam = new Map();
    for (const ev of offEvs) {
        const t = (ev.team || '').split(',')[0].trim() || null;
        byTeam.set(t, (byTeam.get(t) || 0) + 1);
    }
    return [...byTeam.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t, count]) => _offGroupChip(t, count))
        .join('');
}

/** Colonne label + chips, réutilisée par le rendu plié (créneaux / absents côte à côte). */
function _halfGroupHtml(label, innerHtml) {
    return innerHtml
        ? `<div class="cal-banner-half">
               <span class="cal-banner-half-lbl">${label}</span>
               <div class="cal-banner-half-chips">${innerHtml}</div>
           </div>`
        : '';
}

// Préférence d'affichage plié/déplié du bandeau — persistée, partagée entre toutes les vues.
const _CAL_BANNER_COLLAPSED_KEY = 'sb-cal-banner-collapsed';

// Subscription au store : re-render auto quand les events/team changent.
// Une seule subscription par instance de wrap — déstockée si wrap retiré du DOM.
const _bannerUnsubs = new WeakMap();

// ── Render bannière ───────────────────────────────────────────────────────────
export function renderCalBanner(wrap) {
    if (!wrap) return;

    // Premier appel sur ce wrap : on s'abonne aux changements du store
    if (!_bannerUnsubs.has(wrap)) {
        const rerender = () => {
            if (wrap.isConnected) renderCalBanner(wrap);
            else { // nettoyage si le wrap a été retiré du DOM
                _bannerUnsubs.get(wrap)?.forEach(u => u && u());
                _bannerUnsubs.delete(wrap);
            }
        };
        _bannerUnsubs.set(wrap, [
            store.on('calendarEvents', rerender),
            store.on('calendars', rerender),
            store.on('team', rerender),
            store.on('view', rerender),
        ]);
    }

    const calendars = store.get('calendars') || [];
    if (!calendars.length) { wrap.innerHTML = ''; return; }

    // Le bandeau du jour (réunions + absences) n'a de sens que sur les vues de pilotage
    // quotidien (Dashboard, Board) — ailleurs il est redondant avec les sections propres
    // de chaque page (Calendrier/Support sur Reports, ateliers sur Équipe, etc.).
    if (!['dashboard', 'sprint'].includes(store.get('view'))) { wrap.innerHTML = ''; return; }

    const team = store.get('team');
    const all = store.get('calendarEvents') || [];
    // Support du CSV multi-équipes : `e.team = "Fuego,Caméléon"` matche les deux
    const _matchTeam = (et, t) => {
        if (!et) return true;
        if (et === t) return true;
        return et.split(',').map(s => s.trim()).includes(t);
    };
    const filtered = (team && team !== 'all')
        ? all.filter(e => _matchTeam(e.team, team))
        : all;

    const today = _todayKey();
    const todayEvs = filtered
        .filter(e => _dayKey(e.start) === today)
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    const offEvs     = todayEvs.filter(e => _isOff(e.title));
    const regularEvs = todayEvs.filter(e => !_isOff(e.title));

    const matinEvs = regularEvs.filter(e => new Date(e.start).getHours() < 12);
    const apremEvs = regularEvs.filter(e => new Date(e.start).getHours() >= 12);

    // "Toutes équipes" + beaucoup d'absences le même jour → un chip par personne déborde et
    // casse le visuel. On regroupe alors par équipe (couleur d'équipe + nombre d'absents).
    const groupOff = (!team || team === 'all') && offEvs.length > OFF_GROUP_THRESHOLD;
    // Vue globale (toutes les équipes / ligne produit) : UNE pastille de synthèse sur une ligne (3.246.0) — les
    // pastilles par équipe s'empilaient sur la moitié de l'écran mobile. Vue équipe : un chip par personne.
    const _global = (team || 'all') === 'all' || !!store.get('group');
    const offSummary = _global && offEvs.length > 1;
    const offChips = offSummary ? offSummaryHtml(offEvs, _teamColor) : _offChipsHtml(offEvs, todayEvs, groupOff);
    const offLine  = offChips
        ? `<div class="cal-banner-line cal-banner-line--off${groupOff ? ' cal-banner-line--off-grouped' : ''}">${offChips}</div>`
        : '';

    // Vue globale : les dailys d'un même créneau → une pastille dépliable (cal_banner_dailies.js, 3.247.0)
    const _chipsOf = evs => !_global ? evs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('')
        : groupDailies(evs, store.get('calendarRules')).map(it => it.ev ? _chip(it.ev, todayEvs.indexOf(it.ev))
            : dailyGroupChipHtml(it.key, it.evs, _teamColor)
              + (isDailyGroupOpen(it.key) ? it.evs.map(ev => _chip(ev, todayEvs.indexOf(ev)).replace('class="cal-chip', 'class="cal-chip cal-chip--in-group')).join('') : '')).join('');
    const _halfGroup = (evs, label) => _halfGroupHtml(label, evs.length ? _chipsOf(evs) : '');

    const regularLine = regularEvs.length
        ? (matinEvs.length && apremEvs.length
            ? `<div class="cal-banner-split">
                   ${_halfGroup(matinEvs, '🌅')}
                   <span class="cal-banner-split-sep"></span>
                   ${_halfGroup(apremEvs, '☀️')}
               </div>`
            : `<div class="cal-banner-line">${_chipsOf(regularEvs)}</div>`)
        : '';

    const emptyMsg = !todayEvs.length
        ? '<span class="cal-banner-empty">Aucune réunion aujourd\'hui 🎉</span>'
        : '';

    // ── Rendu plié : les 2 prochains créneaux + les absents, côte à côte (compact) ──────
    // Vue globale (toutes les équipes / une ligne produit) : clé À PART, REPLIÉE PAR DÉFAUT (3.238.0) — dépliée, la
    // journée de 13 équipes (~40 créneaux) prenait les deux tiers de l'écran et écrasait la page. Vue équipe :
    // clé historique, dépliée par défaut. Déplier l'une ne touche pas l'autre.
    const _ckey = _global ? `${_CAL_BANNER_COLLAPSED_KEY}-all` : _CAL_BANNER_COLLAPSED_KEY;
    const _cval = localStorage.getItem(_ckey);
    const collapsed = _global ? _cval !== '0' : _cval === '1';
    const nowTs = Date.now();
    const upcomingEvs = regularEvs
        .filter(ev => new Date(ev.end).getTime() >= nowTs)
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
        .slice(0, 2);
    const upcomingHtml = upcomingEvs.length
        ? upcomingEvs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('')
        : '<span class="cal-banner-empty">Aucune réunion à venir 🎉</span>';
    const collapsedHtml = `<div class="cal-banner-split">
        ${_halfGroupHtml('🕐 <span class="cal-lbl-txt">Prochains créneaux</span>', upcomingHtml)}
        ${offChips ? `<span class="cal-banner-split-sep"></span>${_halfGroupHtml('🚫 <span class="cal-lbl-txt">Absents</span>', offChips)}` : ''}
    </div>`;

    wrap.innerHTML = `
        <div class="cal-banner${_global ? ' cal-banner--global' : ''}${collapsed ? ' is-collapsed' : ''}">
            <span class="cal-banner-icon">📅</span>
            <div class="cal-banner-events cal-banner-events--rows">
                ${collapsed ? collapsedHtml : `${offLine}${regularLine}${emptyMsg}`}
            </div>
            <button aria-label="${collapsed ? 'Déplier le bandeau (toute la journée)' : 'Replier le bandeau (résumé compact)'}" class="btn-icon cal-banner-collapse-btn" id="cal-banner-collapse-btn"
                    title="${collapsed ? 'Déplier le bandeau (toute la journée)' : 'Replier le bandeau (résumé compact)'}"
                    aria-expanded="${collapsed ? 'false' : 'true'}">
                <svg class="icon icon-sm cal-banner-collapse-icon${collapsed ? '' : ' cal-banner-collapse-icon--open'}"><use href="#i-chevron-down"/></svg>
            </button>
        </div>`;

    wrap.querySelector('#cal-banner-collapse-btn')?.addEventListener('click', () => {
        localStorage.setItem(_ckey, collapsed ? '0' : '1');
        renderCalBanner(wrap);
    });
    // Chips liés à un event précis (data-ev-idx posé par _chip) → ouvrent la semaine en surlignant
    // cet event. Les chips groupés (_offGroupChip, sans data-ev-idx) ouvrent juste la semaine.
    wrap.querySelectorAll('.cal-chip[data-ev-idx]').forEach(chip => {
        const i = parseInt(chip.dataset.evIdx, 10);
        chip.addEventListener('click', () => _openWeekModal(filtered, todayEvs[i]));
    });
    wrap.querySelectorAll('[data-daily-group]').forEach(btn => btn.addEventListener('click', () => {
        toggleDailyGroup(btn.dataset.dailyGroup);
        renderCalBanner(wrap);
        wrap.querySelector(`[data-daily-group="${CSS.escape(btn.dataset.dailyGroup)}"]`)?.focus();
    }));
    wrap.querySelectorAll('.cal-chip:not([data-ev-idx]):not([data-daily-group])').forEach(chip => {
        chip.addEventListener('click', () => _openWeekModal(filtered));
        // Synthèse des absents (role="button") : clavier aussi
        chip.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openWeekModal(filtered); }
        });
    });
}

/** Ouverture publique de la modal semaine. La modal a son propre picker d'équipes
 *  (popover dans le header) — par défaut pré-coche l'équipe topbar si elle est spécifique. */
export function openCalWeekModal() {
    const team = store.get('team');
    const all = store.get('calendarEvents') || [];
    const initialSelection = (team && team !== 'all') ? new Set([team]) : new Set();
    _openWeekModal(all, null, initialSelection);
}

export function _closeWeekModal() {
    const ov = document.getElementById('cal-week-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    ov.addEventListener('transitionend', () => ov.remove(), { once: true });
    if (location.hash.endsWith('~cal')) history.back();
}

// Ferme la modal si l'utilisateur navigue en arrière (popstate retire ~cal)
window.addEventListener('popstate', () => {
    if (!location.hash.endsWith('~cal')) {
        const ov = document.getElementById('cal-week-overlay');
        if (ov) { ov.classList.remove('visible'); ov.addEventListener('transitionend', () => ov.remove(), { once: true }); }
    }
});

/**
 * Synchronise les calendriers ICS pertinents pour l'équipe courante, puis rafraîchit la modal.
 * Réutilise le endpoint `/api/calendars/{id}/refresh` (même que Paramètres → Calendriers ICS).
 */
/**
 * Rafraichit une liste de calendriers en bornant la concurrence.
 *
 * ⚠️ NE JAMAIS repasser a un `Promise.allSettled(list.map(...))` nu : chaque refresh ouvre
 * une connexion SQLite cote serveur, et 16 calendriers lances de front epuisaient le pool
 * SQLAlchemy (5 + 10 overflow) — « Rafraichir tous » echouait alors que le meme bouton,
 * ligne par ligne, passait. Le backend ne tient plus sa connexion pendant le fetch, mais
 * cette borne reste le garde-fou : elle menage aussi le serveur ICS distant et rend la
 * progression fidele.
 * @param {Array}    list       calendriers a rafraichir
 * @param {Function} [onDone]   appele apres chaque calendrier — (fait, total, calendrier)
 * @param {number}   [limit]    nombre de requetes simultanees
 * @returns {Promise<Array>} resultats au format Promise.allSettled, dans l'ordre d'entree
 */
async function _refreshPooled(list, onDone = null, limit = 4) {
    const results = new Array(list.length);
    let next = 0, done = 0;
    const worker = async () => {
        while (next < list.length) {
            const i = next++;
            const c = list[i];
            try { results[i] = { status: 'fulfilled', value: await api.refreshCalendar(c.id) }; }
            catch (reason) { results[i] = { status: 'rejected', reason }; }
            done++;
            onDone?.(done, list.length, c);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
    return results;
}

export async function _syncCalendarsFromModal(e) {
    const btn = e.currentTarget;
    if (!btn || btn.disabled) return;
    const calendars = store.get('calendars') || [];
    const team = store.get('team');
    // Calendriers pertinents : sans équipe (= toutes) OU pour l'équipe courante
    const relevant = relevantCalendars(calendars, team);
    if (!relevant.length) {
        toast('Aucun calendrier ICS à synchroniser', 'info');
        return;
    }
    btn.disabled = true;
    btn.classList.add('cal-sync-spin');
    try {
        const results = await _refreshPooled(relevant);
        const ok = results.filter(r => r.status === 'fulfilled').length;
        const ko = results.length - ok;
        // Recharger les events depuis la base + maj du store
        const [freshCals, freshEvents] = await Promise.all([
            api.getCalendars().catch(() => store.get('calendars') || []),
            api.getCalendarEvents().catch(() => []),
        ]);
        store.set('calendars', freshCals);
        store.set('calendarEvents', freshEvents);
        toast(`${ok} calendrier${ok > 1 ? 's' : ''} synchronisé${ok > 1 ? 's' : ''}${ko ? ` (${ko} en échec)` : ''}`, ko ? 'warning' : 'success');
        // Réouvrir la modal avec les nouveaux events
        _closeWeekModal();
        const filtered = (team && team !== 'all')
            ? freshEvents.filter(ev => !ev.team || ev.team === team)
            : freshEvents;
        setTimeout(() => _openWeekModal(filtered), 220);  // attendre fin de transition
    } catch (err) {
        toast(`Erreur de synchronisation : ${err.message || err}`, 'error');
        btn.disabled = false;
        btn.classList.remove('cal-sync-spin');
    }
}

/**
 * Synchronise les calendriers ICS sans ouvrir la modal — utilisé par le badge de fraîcheur
 * de la topbar. Met à jour le store (calendars + calendarEvents) et renvoie le nombre de
 * calendriers synchronisés avec succès.
 * @param {'team'|'all'} scope  'team' (défaut) = calendriers pertinents pour l'équipe topbar
 *   courante (cf. relevantCalendars) ; 'all' = absolument tous les calendriers configurés,
 *   même si une équipe spécifique est sélectionnée dans la topbar.
 */
export async function syncCalendars(scope = 'team') {
    const team = store.get('team');
    const all = store.get('calendars') || [];
    const relevant = scope === 'all' ? all : relevantCalendars(all, team);
    if (!relevant.length) { toast('Aucun calendrier ICS à synchroniser', 'info'); return 0; }

    store.set('syncType', 'calendar');
    store.set('syncProgress', 5);
    store.set('syncLabel', `Synchronisation des agendas…`);
    store.set('syncDetail', `0 / ${relevant.length} calendrier${relevant.length > 1 ? 's' : ''}`);

    const results = await _refreshPooled(relevant, (done, total, c) => {
        store.set('syncProgress', Math.round(5 + (done / total) * 80));
        store.set('syncDetail', `${done} / ${total} calendrier${total > 1 ? 's' : ''} — ${c.name || c.label || c.id}`);
    });

    store.set('syncProgress', 90);
    store.set('syncLabel', 'Rafraichissement des evenements…');
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const ko = results.length - ok;
    const [freshCals, freshEvents] = await Promise.all([
        api.getCalendars().catch(() => store.get('calendars') || []),
        api.getCalendarEvents().catch(() => []),
    ]);
    store.set('calendars', freshCals);
    store.set('calendarEvents', freshEvents);

    store.set('syncProgress', 100);
    store.set('syncLabel', 'Agendas synchronises !');
    store.set('syncDetail', `${ok} reussi${ok > 1 ? 's' : ''}${ko ? ` · ${ko} en echec` : ''}`);
    setTimeout(() => {
        store.set('syncProgress', null);
        store.set('syncType', null);
        store.set('syncLabel', '');
        store.set('syncDetail', '');
    }, 600);

    // Un echec doit se lire : nommer les calendriers fautifs et la premiere cause, sinon un
    // ICS casse (URL revoquee, 404) reste invisible derriere un simple compteur.
    const failed = results
        .map((r, i) => (r.status === 'rejected' ? relevant[i] : null))
        .filter(Boolean);
    const why = results.find(r => r.status === 'rejected')?.reason?.message || '';
    const koDetail = failed.length
        ? ` — echec : ${failed.map(c => c.name || c.id).join(', ')}${why ? ` (${why})` : ''}`
        : '';
    toast(`${ok} calendrier${ok > 1 ? 's' : ''} synchronisé${ok > 1 ? 's' : ''}${ko ? ` (${ko} en échec)${koDetail}` : ''}`, ko ? 'warning' : 'success');
    return ok;
}
