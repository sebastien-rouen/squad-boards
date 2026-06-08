/**
 * Calendar banner — aujourd'hui en haut du Sprint/Kanban,
 * clic → modal semaine groupée par jour.
 */

import { store } from '../state.js';
import { esc, hashColor, toast, getSprintForTeam, getCurrentPi, extractTeam } from '../utils.js';
import * as api from '../api.js';

// ── Jours fériés France ───────────────────────────────────────────────────────
const _holidayCache = {}; // keyed by year, populated lazily via _dayKey (local time)

function _easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day   = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
}

function _frenchHolidays(y) {
    if (_holidayCache[y]) return _holidayCache[y];
    const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const iso = d => _dayKey(d);
    const E = _easter(y);
    _holidayCache[y] = {
        [iso(new Date(y,  0,  1))]: 'Jour de l\'An',
        [iso(add(E, 1))]:           'Lundi de Pâques',
        [iso(new Date(y,  4,  1))]: 'Fête du Travail',
        [iso(new Date(y,  4,  8))]: 'Victoire 1945',
        [iso(add(E, 39))]:          'Ascension',
        [iso(add(E, 50))]:          'Lundi de Pentecôte',
        [iso(new Date(y,  6, 14))]: 'Fête Nationale',
        [iso(new Date(y,  7, 15))]: 'Assomption',
        [iso(new Date(y, 10,  1))]: 'Toussaint',
        [iso(new Date(y, 10, 11))]: 'Armistice',
        [iso(new Date(y, 11, 25))]: 'Noël',
    };
    return _holidayCache[y];
}

function _getHoliday(isoDate) {
    const y = parseInt(isoDate.slice(0, 4), 10);
    return _frenchHolidays(y)[isoDate] || null;
}

// ── Helpers formatage ─────────────────────────────────────────────────────────
function _h(d) {
    return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}
function _dayKey(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function _fmtDay(d) {
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function _todayKey() {
    return _dayKey(new Date());
}
// Retourne true si l'événement couvre le jour dk.
// Pour les events allDay, DTEND est exclusif (spec iCal) → on utilise > dk.
// Pour les events avec heure, la fin est inclusive → on utilise >= dk.
function _eventCoversDay(ev, dk) {
    const sk = _dayKey(ev.start);
    if (sk > dk) return false;
    const ek = _dayKey(ev.end);
    return ev.allDay ? ek > dk : ek >= dk;
}
// Couleur dérivée de l'ID du calendrier (stable, unique par agenda).
function _calColor(ev) {
    return hashColor(ev.calendarId || ev.calendarName || ev.team || '');
}
function _teamColor(team) {
    return team ? hashColor(team) : 'var(--primary)';
}
function _duration(start, end) {
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
function _extractVisioLink(ev) {
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
function _isOff(title)     { return /-\s*[^-]*\bOFF\s*$/i.test(title || ''); }
function _isHalfOff(title) { return /-\s*(?:1\s*\/\s*2|½|AM|PM|matin|après[- ]?midi)\s*OFF\s*$/i.test(title || ''); }
function _isFreeze(title)  { return /\b(gel|freeze)\b/i.test(title || ''); }

// Détecte une cérémonie Scrum/Agile depuis le titre — retourne {key, icon, label, details} ou null
// L'ordre des règles compte : plus spécifique d'abord (sprint review/planning avant "review"/"planning" seul).
// Les `details` alimentent la tooltip pédagogique (pourquoi, qui, fréquence, output, exemple).
const _SCRUM_DETAILS = {
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
function _detectScrumType(title) {
    const t = (title || '').toLowerCase();
    if (!t) return null;
    const mk = (key, icon, label) => ({ key, icon, label, details: _SCRUM_DETAILS[key] });
    if (/sprint\s*review|sprint\s*demo|démo\s*sprint|review\s*sprint/.test(t))
        return mk('review',     '🎤', 'Sprint Review');
    if (/sprint\s*planning|planning\s*sprint|pi\s*planning/.test(t))
        return mk('planning',   '🎯', 'Planning');
    if (/\bdaily\b|stand[- ]?up|standup|scrum\s*matinal/.test(t))
        return mk('daily',      '🌅', 'Daily');
    if (/refinement|grooming|backlog\s*refinement|raffinement/.test(t))
        return mk('refinement', '🔍', 'Refinement');
    if (/r[ée]tro(?:spective)?\b|retrospective\b/.test(t))
        return mk('retro',      '🔁', 'Rétro');
    return null;
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
        ]);
    }

    const calendars = store.get('calendars') || [];
    if (!calendars.length) { wrap.innerHTML = ''; return; }

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

    // Debug : si on a des events filtrés mais aucun aujourd'hui, log un échantillon
    // pour comprendre (équipe sélectionnée vs equipe events vs dates parsées)
    if (!todayEvs.length && filtered.length && console?.debug) {
        const sample = filtered.slice(0, 3).map(e => ({
            title: e.title, start: e.start, dayKey: _dayKey(e.start), team: e.team,
        }));
        console.debug('[cal-banner] 0 réunion aujourd\'hui malgré', filtered.length,
            'events filtered (team:', team, ', today:', today, ') — échantillon:', sample);
    }

    const offEvs     = todayEvs.filter(e => _isOff(e.title));
    const regularEvs = todayEvs.filter(e => !_isOff(e.title));

    const matinEvs = regularEvs.filter(e => new Date(e.start).getHours() < 12);
    const apremEvs = regularEvs.filter(e => new Date(e.start).getHours() >= 12);

    const offLine = offEvs.length
        ? `<div class="cal-banner-line cal-banner-line--off">
               ${offEvs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('')}
           </div>`
        : '';

    const _halfGroup = (evs, label) => evs.length
        ? `<div class="cal-banner-half">
               <span class="cal-banner-half-lbl">${label}</span>
               <div class="cal-banner-half-chips">${evs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('')}</div>
           </div>`
        : '';

    const regularLine = regularEvs.length
        ? (matinEvs.length && apremEvs.length
            ? `<div class="cal-banner-split">
                   ${_halfGroup(matinEvs, '🌅')}
                   <span class="cal-banner-split-sep"></span>
                   ${_halfGroup(apremEvs, '☀️')}
               </div>`
            : `<div class="cal-banner-line">${regularEvs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('')}</div>`)
        : '';

    const emptyMsg = !todayEvs.length
        ? '<span class="cal-banner-empty">Aucune réunion aujourd\'hui 🎉</span>'
        : '';

    // Mini calendrier d'aujourd'hui dans le bouton "Voir la semaine"
    const nowDate = new Date();
    const _months = ['JAN','FÉV','MAR','AVR','MAI','JUIN','JUIL','AOÛ','SEP','OCT','NOV','DÉC'];
    const _wdayShort = ['DIM','LUN','MAR','MER','JEU','VEN','SAM'];
    const todayMonth = _months[nowDate.getMonth()];
    const todayDay = nowDate.getDate();
    const todayWday = _wdayShort[nowDate.getDay()];

    wrap.innerHTML = `
        <div class="cal-banner">
            <span class="cal-banner-icon">📅</span>
            <div class="cal-banner-events cal-banner-events--rows">
                ${offLine}${regularLine}${emptyMsg}
            </div>
            <button class="cal-banner-week-btn" title="Voir la semaine — ${esc(_fmtDay(nowDate))}">
                <span class="cal-mini" aria-hidden="true">
                    <span class="cal-mini-hdr">${todayMonth}</span>
                    <span class="cal-mini-day">${todayDay}</span>
                    <span class="cal-mini-wday">${todayWday}</span>
                </span>
                <span class="cal-mini-label">
                    <span class="cal-mini-label-main">Semaine</span>
                    <span class="cal-mini-label-sub">vue détaillée</span>
                </span>
            </button>
        </div>`;

    wrap.querySelector('.cal-banner-week-btn')?.addEventListener('click', () => _openWeekModal(filtered));
    wrap.querySelectorAll('.cal-chip').forEach(chip => {
        const i = parseInt(chip.dataset.evIdx ?? '0', 10);
        chip.addEventListener('click', () => _openWeekModal(filtered, todayEvs[i]));
    });
}

// ── Modal semaine ─────────────────────────────────────────────────────────────
/**
 * Barre visuelle du sprint courant affichée sous le header de la modal.
 * Visualise la position de la semaine affichée dans la durée totale du sprint,
 * avec la couleur de l'équipe sélectionnée.
 */
function _renderSprintBar(mon, sun) {
    const team = store.get('team');
    const si = store.get('sprintInfo');
    const teamSprintsArr = Array.isArray(si?.teamSprints) ? si.teamSprints : [];
    // Récupère le sprint qui contient la semaine affichée (passé / actuel / futur selon navigation)
    // On utilise le milieu de la semaine comme date de référence pour gérer les chevauchements.
    const refDate = new Date(mon); refDate.setDate(mon.getDate() + 3);
    const sprint = getSprintForTeam(team, si, refDate);

    if (!sprint?.startDate || !sprint?.endDate) {
        // Aide au debug : si on demande une équipe spécifique sans sprint trouvé, affiche un placeholder
        if (team && team !== 'all' && !teamSprintsArr.some(s => s.team === team)) {
            return `<div class="cal-week-sprint-bar cal-week-sprint-bar--missing">
                <span class="cal-week-sprint-missing">Aucun sprint connu pour l'équipe <strong>${esc(team)}</strong> sur cette semaine — relancer une sync JIRA pour peupler les sprints passés/futurs.</span>
            </div>`;
        }
        return '';
    }
    // JIRA renvoie un ISO complet ("2026-05-12T08:00:00.000+02:00") — on garde la date locale (10 premiers chars)
    const _parseDate = (s, endOfDay = false) => {
        const d = String(s).slice(0, 10);
        return new Date(`${d}T${endOfDay ? '23:59:59' : '00:00:00'}`);
    };
    const sStart = _parseDate(sprint.startDate);
    const sEnd   = _parseDate(sprint.endDate, true);
    if (isNaN(sStart) || isNaN(sEnd)) return '';
    // Note : on ne masque PLUS la barre si la semaine est hors sprint —
    // getSprintForTeam a déjà sélectionné le sprint le plus pertinent (closed/future inclus)

    const teamObjects = store.get('teamObjects') || [];
    const tObj = teamObjects.find(o => o.name === team);
    const teamColor = tObj?.color || 'var(--primary)';

    const DAY = 86400000;
    const sTotalDays = Math.max(1, Math.round((sEnd - sStart) / DAY) + 1);
    // Segment de la semaine affichée dans le sprint
    const wStartDay  = Math.max(0,            Math.floor((mon - sStart) / DAY));
    const wEndDay    = Math.min(sTotalDays-1, Math.floor((sun - sStart) / DAY));
    const leftPct    = (wStartDay / sTotalDays) * 100;
    const widthPct   = Math.max(2, ((wEndDay - wStartDay + 1) / sTotalDays) * 100);
    // Marqueur "aujourd'hui" si dans le sprint
    const now = new Date();
    const todayDay = Math.floor((now - sStart) / DAY);
    const todayInSprint = todayDay >= 0 && todayDay < sTotalDays;
    const todayPct = todayInSprint ? ((todayDay + 0.5) / sTotalDays) * 100 : null;

    // Graduation : ticks tous les 7 jours pour les sprints ≥ 10 jours
    // Format date court : "12 mai" — concis. Affiché sous le track.
    const _shortDate = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
    const ticks = [];
    if (sTotalDays >= 10) {
        for (let day = 7; day < sTotalDays; day += 7) {
            const tickDate = new Date(sStart); tickDate.setDate(sStart.getDate() + day);
            ticks.push({ pct: (day / sTotalDays) * 100, label: _shortDate(tickDate), day });
        }
    }
    // Ticks intérieurs (graduation hebdo) + 2 ticks d'extrémité plus marqués (début/fin)
    const ticksHtml =
        `<div class="cal-week-sprint-tick cal-week-sprint-tick--edge" style="left:0%" title="Début du sprint · ${esc(_shortDate(sStart))}"></div>` +
        ticks.map(t =>
            `<div class="cal-week-sprint-tick" style="left:${t.pct}%" title="J${t.day} · ${esc(t.label)}"></div>`
        ).join('') +
        `<div class="cal-week-sprint-tick cal-week-sprint-tick--edge" style="left:100%" title="Fin du sprint · ${esc(_shortDate(sEnd))}"></div>`;
    const labelsHtml = ticks.length
        ? `<div class="cal-week-sprint-scale">
            <span class="cal-week-sprint-scale-start">${esc(_shortDate(sStart))}</span>
            ${ticks.map(t => `<span class="cal-week-sprint-scale-mid" style="left:${t.pct}%">${esc(t.label)}</span>`).join('')}
            <span class="cal-week-sprint-scale-end">${esc(_shortDate(sEnd))}</span>
          </div>`
        : '';
    // Jours restants
    const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((sEnd - today0) / DAY);
    const dayLeftLabel = daysLeft < 0 ? 'Terminé'
                       : daysLeft === 0 ? 'Dernier jour'
                       : daysLeft === 1 ? 'J-1'
                       : `J-${daysLeft}`;

    const goalLine = sprint.goal
        ? `<div class="cal-week-sprint-goal" title="${esc(sprint.goal)}">🎯 ${esc(sprint.goal)}</div>`
        : '';

    // Badge d'état du sprint (clos / actif / futur)
    const stateLabel = sprint.state === 'closed' ? 'Clos'
                     : sprint.state === 'future' ? 'À venir'
                     : sprint.state === 'active' ? 'Actif'
                     : '';
    const stateBadge = stateLabel
        ? `<span class="cal-week-sprint-state cal-week-sprint-state--${sprint.state}">${esc(stateLabel)}</span>`
        : '';

    // Adapte le label J-N selon l'état
    const jlLabel = sprint.state === 'closed' ? 'Terminé'
                  : sprint.state === 'future' ? `Démarre dans ${Math.max(0, Math.ceil((sStart - new Date()) / DAY))}j`
                  : dayLeftLabel;

    // Largeur du segment "semaine affichée" en jours pour le label
    const weekLenDays = Math.min(7, wEndDay - wStartDay + 1);
    const elapsedPctInSprint = Math.round(((wStartDay + weekLenDays / 2) / sTotalDays) * 100);

    // ── Grille colonnes : nom + goal alignés sur les jours ─────────────────
    // Convertit une date en colonne (1=lun … 7=dim) dans la semaine affichée
    const dayToCol = d => Math.max(1, Math.min(7, Math.floor((d - mon) / DAY) + 1));

    // TOUS les sprints de l'équipe qui chevauchent la semaine affichée [mon, sun].
    // → permet d'afficher le sprint précédent (ex: lun→jeu) ET le suivant (ex: ven→dim)
    //   côte à côte, chacun positionné sur ses propres colonnes.
    const _teamMatch = s => (team && team !== 'all')
        ? (s.team === team || extractTeam(s.name) === team)
        : (sprint.team ? s.team === sprint.team : true);
    const weekSprints = teamSprintsArr
        .filter(s => s.startDate && s.endDate && _teamMatch(s))
        .map(s => ({ s, start: _parseDate(s.startDate), end: _parseDate(s.endDate, true) }))
        .filter(({ start, end }) => !isNaN(start) && !isNaN(end) && end >= mon && start <= sun)
        .sort((a, b) => a.start - b.start);

    const colItem = (s, start, end) => {
        const colStart = start >= mon ? dayToCol(start) : 1;
        const colEnd   = end   <= sun ? dayToCol(end)   : 7;
        const isMain   = s.name === sprint.name;
        return `<div class="cal-sprint-col-item cal-sprint-col-item--${s.state || 'unknown'}${isMain ? ' cal-sprint-col-item--main' : ''}" style="grid-column:${colStart}/${colEnd + 1}" title="${esc(s.name || 'Sprint')}${s.goal ? ' — ' + esc(s.goal) : ''}">
            <span class="cal-sprint-col-name">📌 ${esc(s.name || 'Sprint')}</span>
            ${s.goal ? `<span class="cal-sprint-col-goal">${esc(s.goal.slice(0, 80))}</span>` : ''}
        </div>`;
    };

    // Fallback : si aucun sprint ne chevauche réellement la semaine (sprint "proche"
    // renvoyé par getSprintForTeam), on affiche au moins le sprint principal pleine largeur.
    const colInner = weekSprints.length
        ? weekSprints.map(({ s, start, end }) => colItem(s, start, end)).join('')
        : colItem(sprint, sStart, sEnd);

    const colLabels = `<div class="cal-sprint-col-labels">${colInner}</div>`;

    return `
    <div class="cal-week-sprint-bar cal-week-sprint-bar--${sprint.state || 'unknown'}" style="--sprint-color:var(--primary); --team-color:${teamColor}">
        <div class="cal-week-sprint-head">
            <div class="cal-week-sprint-info">
                <span class="cal-week-sprint-chip cal-week-sprint-chip--dates">${_fmtDay(sStart)} → ${_fmtDay(sEnd)}</span>
                ${stateBadge}
            </div>
            <div class="cal-week-sprint-stats">
                <span class="cal-week-sprint-chip cal-week-sprint-chip--jl">${esc(jlLabel)}</span>
            </div>
        </div>
        <div class="cal-week-sprint-track-wrap">
            <div class="cal-week-sprint-track" title="Position de la semaine affichée dans le sprint (${elapsedPctInSprint}% du sprint)">
                ${ticksHtml}
                <div class="cal-week-sprint-fill" style="left:${leftPct}%; width:${widthPct}%" title="Semaine affichée"></div>
                ${todayPct != null ? `<div class="cal-week-sprint-today" style="left:${todayPct}%" title="Aujourd'hui"></div>` : ''}
            </div>
            ${labelsHtml}
        </div>
        ${colLabels}
    </div>`;
}

/** Lundi de la semaine contenant `date`, ajusté d'un offset (en semaines). */
function _mondayOf(date, weekOffset = 0) {
    const d = new Date(date);
    const dow = d.getDay();
    const diffMon = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diffMon + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
}

function _openWeekModal(allEvents, highlightEv = null, initialTeamSelection = null) {
    document.getElementById('cal-week-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cal-week-overlay';
    overlay.className = 'cal-week-overlay';
    overlay.innerHTML = `<div class="cal-week-modal" id="cal-week-modal-inner"></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    overlay.dataset.prevHash = location.hash || '#';
    history.pushState({ calModal: true }, '', (location.hash || '#') + '~cal');

    let weekOffset = 0;
    // Sélection multi-équipes propre à la modal (Set d'équipes). Vide = montre tout.
    // initialisé via initialTeamSelection (pré-coche l'équipe topbar si spécifique).
    let teamSelection = initialTeamSelection instanceof Set ? new Set(initialTeamSelection) : new Set();
    // Séparateur matin / après-midi — persisté en localStorage
    let showPmSplit  = localStorage.getItem('sb-cal-split-pm')  === '1';
    let showCompact  = localStorage.getItem('sb-cal-compact')   === '1';

    // Helper match CSV (e.team peut être "Fuego,Caméléon")
    const _matchTeam = (et, t) => !et || et === t || et.split(',').map(s => s.trim()).includes(t);
    const _filterEvents = () => {
        if (!teamSelection.size) return allEvents; // pas de filtre actif → tout
        return allEvents.filter(ev => {
            // Garde les events sans team (calendriers globaux) en plus de ceux des teams cochées
            if (!ev.team) return true;
            for (const t of teamSelection) if (_matchTeam(ev.team, t)) return true;
            return false;
        });
    };

    const _renderForOffset = (initialHighlight = highlightEv) => {
        const inner = overlay.querySelector('#cal-week-modal-inner');
        if (!inner) return;
        const filtered = _filterEvents();
        inner.innerHTML = _renderWeekContent(filtered, weekOffset, initialHighlight, teamSelection, showPmSplit, showCompact);
        _wireWeekContent(overlay, filtered,
            () => _renderForOffset(null),
            (delta) => { weekOffset += delta; _renderForOffset(null); },
            () => { weekOffset = 0; _renderForOffset(null); },
            () => { showPmSplit = !showPmSplit; localStorage.setItem('sb-cal-split-pm', showPmSplit ? '1' : '0'); _renderForOffset(null); },
            () => { showCompact = !showCompact; localStorage.setItem('sb-cal-compact',  showCompact  ? '1' : '0'); _renderForOffset(null); }
        );
        _wireTeamPickerPopover(overlay, teamSelection, (newSel) => {
            teamSelection = newSel;
            _renderForOffset(null);
        });
        if (initialHighlight) {
            requestAnimationFrame(() => {
                const hl = inner.querySelector('.cal-ev-hl');
                const wrap = inner.querySelector('.cal-week-grid-wrap');
                if (hl && wrap) {
                    const hlRect   = hl.getBoundingClientRect();
                    const wrapRect = wrap.getBoundingClientRect();
                    const scrollTop = wrap.scrollTop + (hlRect.top - wrapRect.top) - 60;
                    wrap.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
                }
                // Si l'event highlighté a une description, afficher la tooltip automatiquement
                if (initialHighlight.description) {
                    const descBtn = hl?.querySelector('.cal-ev-desc-btn');
                    if (descBtn) setTimeout(() => _showDescTt(descBtn), 350);
                }
            });
        }
    };
    _renderForOffset(highlightEv);

    overlay.addEventListener('click', e => { if (e.target === overlay) _closeWeekModal(); });
    const onKey = e => {
        if (e.key === 'Escape')  { _closeWeekModal(); document.removeEventListener('keydown', onKey); }
        else if (e.key === 'ArrowLeft')  { weekOffset--; _renderForOffset(null); }
        else if (e.key === 'ArrowRight') { weekOffset++; _renderForOffset(null); }
        else if (e.key === 't' || e.key === 'T') { weekOffset = 0; _renderForOffset(null); }
    };
    document.addEventListener('keydown', onKey);
}

/** Construit le HTML interne de la modal pour un offset semaine donné. */
function _renderWeekContent(allEvents, weekOffset, highlightEv, teamSelection = new Set(), showPmSplit = false, showCompact = false) {
    const mon = _mondayOf(new Date(), weekOffset);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });

    const todayK = _todayKey();
    const highlightUid = highlightEv?.uid;

    // Jours PIP (PI Planning récupérables) — stockés dans localStorage pi-cfg-N
    const _piNum = getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') });
    const _piCfgPip = _piNum ? JSON.parse(localStorage.getItem(`pi-cfg-${_piNum}`) || 'null') : null;
    const _pipDates = new Set(Array.isArray(_piCfgPip?.pipDates) ? _piCfgPip.pipDates : []);

    // Repère les jours start/end du sprint courant (pour indicateur dans cal-day-hdr)
    const _currentTeam = store.get('team');
    const _teamFilterActive = _currentTeam && _currentTeam !== 'all';
    const _sprintRef = new Date(mon); _sprintRef.setDate(mon.getDate() + 3); // milieu de semaine
    const _sprint = getSprintForTeam(_currentTeam, store.get('sprintInfo'), _sprintRef);
    const sprintStartKey = _sprint?.startDate ? String(_sprint.startDate).slice(0, 10) : null;
    const sprintEndKey   = _sprint?.endDate   ? String(_sprint.endDate).slice(0, 10)   : null;

    const dayParts = days.map(day => {
        const dk = _dayKey(day);
        const isToday = dk === todayK;
        const isPast  = dk < todayK;
        const isFuture = dk > todayK;
        const evs = allEvents
            .filter(e => _eventCoversDay(e, dk))
            .sort((a, b) => a.start.localeCompare(b.start));

        const offEvs     = evs.filter(ev => _isOff(ev.title));
        const regularEvs = evs.filter(ev => !_isOff(ev.title));

        const offBlock = offEvs.length
            ? `<div class="cal-ev-off-group">
                ${offEvs.map(ev => {
                    // Nettoie le titre : retire "- OFF" en fin avec ses préfixes éventuels (1/2, ½, AM, PM…)
                    const name = ev.title.replace(/-\s*[^-]*\bOFF\s*$/i, '').trim() || ev.title;
                    const half = _isHalfOff(ev.title);
                    const cls  = half ? 'cal-ev-off-chip cal-ev-off-chip--half' : 'cal-ev-off-chip';
                    return `<span class="${cls}" title="${esc(ev.title)}">${half ? '<span class="cal-ev-off-half">½</span> ' : ''}${esc(name)}</span>`;
                }).join('')}
               </div>`
            : '';

        const _card = ev => {
                const s = new Date(ev.start), e = new Date(ev.end);
                const isStartDay = _dayKey(ev.start) === dk;
                const isEndDay   = ev.allDay ? false : _dayKey(ev.end) === dk;
                const timeStr = ev.allDay
                    ? 'Journée entière'
                    : (isStartDay && isEndDay) ? `${_h(s)} – ${_h(e)}`
                    : isStartDay ? `${_h(s)} →`
                    : isEndDay   ? `← ${_h(e)}`
                    : '← →';
                const color = _calColor(ev);
                const isHL = ev.uid && ev.uid === highlightUid;
                // Si une équipe est filtrée → on n'affiche pas l'équipe de l'event (redondant)
                const showTeam = !_teamFilterActive && ev.team;
                const metaLine = [
                    showTeam ? `👥 ${esc(ev.team)}` : '',
                    ev.calendarName && ev.calendarName !== ev.team ? esc(ev.calendarName) : '',
                ].filter(Boolean).join(' · ');
                const recurMark = ev.recurring ? '<span class="cal-ev-recur" title="Événement récurrent">🔄</span>' : '';
                // Détection cérémonie Scrum → ajoute classe + badge + icône préfixe titre
                const scrum = _detectScrumType(ev.title);
                const scrumClass = scrum ? ` cal-ev-row--scrum cal-ev-row--scrum-${scrum.key}` : '';
                const multidayCls = !isStartDay ? ' cal-ev-row--multiday-cont' : '';
                // Badge léger : juste l'emoji + data-attrs ; la tooltip est rendue
                // par un singleton attaché au body (évite tout clip parent overflow/scroll).
                const scrumBadge = scrum
                    ? `<span class="cal-ev-scrum-badge cal-ev-scrum-badge--${scrum.key}" tabindex="0"
                              aria-label="${esc(scrum.label)}" data-scrum-key="${scrum.key}">
                            <span aria-hidden="true">${scrum.icon}</span>
                        </span>`
                    : '';
                // Visio/loc calculés ici pour être réutilisés en mode compact
                const visio    = _extractVisioLink(ev);
                const locIsVisio = ev.location && visio && (esc(visio).includes(esc((ev.location || '').trim())) || (ev.location || '').trim() === visio);
                const physLoc  = (ev.location && !locIsVisio && !/^https?:\/\//i.test(ev.location)) ? ev.location.trim() : '';
                const otherUrl = (ev.url && !visio && /^https?:\/\//i.test(ev.url)) ? ev.url : '';
                const titleHtml  = `${_isFreeze(ev.title) ? '❄️ ' : ''}${esc(ev.title)}`;
                const compactCls = showCompact ? ' cal-ev-row--compact' : '';
                const rowBase    = `class="cal-ev-row${isHL ? ' cal-ev-hl' : ''}${isPast ? ' cal-ev-past' : ''}${scrumClass}${multidayCls}${compactCls}" style="border-left-color:${color};background:color-mix(in srgb,${color} 9%,var(--surface))"`;

                // data-* individuels — pas de JSON.parse, pas de risque de parsing
                const dataAttrs = [
                    `data-ev-title="${esc(ev.title)}"`,
                    `data-ev-start="${esc(ev.start)}"`,
                    `data-ev-end="${esc(ev.end)}"`,
                    `data-ev-allday="${ev.allDay ? '1' : ''}"`,
                    `data-ev-calname="${esc(ev.calendarName || '')}"`,
                    `data-ev-team="${esc(ev.team || '')}"`,
                    `data-ev-color="${esc(color)}"`,
                    `data-ev-visio="${esc(visio || '')}"`,
                    `data-ev-url="${esc(otherUrl || '')}"`,
                    `data-ev-loc="${esc(physLoc)}"`,
                    `data-ev-rawloc="${esc(ev.location || '')}"`,
                    `data-ev-desc="${esc(ev.description || '')}"`,
                    `data-ev-recur="${ev.recurring ? '1' : ''}"`,
                    `data-ev-scrum="${esc(scrum ? scrum.key : '')}"`,
                ].join(' ');

                if (showCompact) {
                    return `<div ${rowBase} ${dataAttrs} role="button" tabindex="0">
                        <span class="cal-ev-compact-title">${titleHtml}</span>${recurMark}
                    </div>`;
                }

                // Icône discrète si visio présente (scannable sans texte)
                const visioBadge = visio ? `<span class="cal-ev-visio-badge" title="Visio disponible">🎥</span>` : '';
                return `<div ${rowBase} ${dataAttrs} role="button" tabindex="0">
                    <div class="cal-ev-time">${timeStr}${visioBadge}${scrumBadge}${recurMark}</div>
                    <div class="cal-ev-title">${titleHtml}</div>
                </div>`;
        };

        const maEvs = showPmSplit ? regularEvs.filter(ev => ev.allDay || new Date(ev.start).getHours() < 14) : regularEvs;
        const pmEvs = showPmSplit ? regularEvs.filter(ev => !ev.allDay && new Date(ev.start).getHours() >= 14) : [];
        const maCards = maEvs.map(_card).join('');
        const pmCards = pmEvs.map(_card).join('');

        const evRows = (offBlock || maCards)
            ? offBlock + maCards
            : `<div class="cal-ev-none">—</div>`;

        const holiday  = _getHoliday(dk);
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const dayCls = [
            'cal-day-col',
            isToday   ? 'cal-day-today'   : isPast ? 'cal-day-past' : 'cal-day-future',
            holiday   ? 'cal-day-holiday'  : '',
            isWeekend ? 'cal-day-weekend'  : '',
        ].filter(Boolean).join(' ');

        const holidayBadge = holiday
            ? `<div class="cal-ev-holiday-badge">🇫🇷 ${esc(holiday)}</div>`
            : '';

        // Indicateur discret : ▶ premier jour du sprint, ◀ dernier jour
        const isSprintStart = sprintStartKey === dk;
        const isSprintEnd   = sprintEndKey   === dk;
        const sprintMark = (isSprintStart || isSprintEnd) ? `
            <span class="cal-day-sprint-mark cal-day-sprint-mark--${isSprintStart ? 'start' : 'end'}"
                  title="${isSprintStart ? 'Premier' : 'Dernier'} jour du sprint">
                ${isSprintStart ? '▶' : '🏁'}
            </span>` : '';

        // Indicateur jour PIP (PI Planning récupérable)
        const isPip = _pipDates.has(dk);
        const pipMark = isPip
            ? `<span class="cal-day-pip-mark" title="Jour de PI Planning — récupérable">🗓️ PIP</span>`
            : '';

        const hasCopyable = regularEvs.length > 0;
        const maCol = `<div class="${dayCls}">
            <div class="cal-day-hdr">
                <span class="cal-day-hdr-label">${_fmtDay(day)}${sprintMark}${pipMark}</span>
                ${hasCopyable ? `<button class="cal-day-copy-btn" data-dk="${dk}" title="Copier l'agenda du jour (Slack)">📋</button>` : ''}
            </div>
            <div class="cal-day-events">${holidayBadge}${evRows}</div>
        </div>`;
        const pmCol = `<div class="${dayCls} cal-day-col--pm">
            <div class="cal-day-events">${pmCards}</div>
        </div>`;
        return { ma: maCol, pm: pmCol };
    });
    const daysHtml   = dayParts.map(p => p.ma).join('');
    const pmDaysHtml = showPmSplit ? dayParts.map(p => p.pm).join('') : '';

    // Dernière synchro la plus récente parmi les calendriers pertinents
    const team0 = store.get('team');
    const cals0 = store.get('calendars') || [];
    const relevantCals = (team0 && team0 !== 'all')
        ? cals0.filter(c => !c.team || c.team === team0)
        : cals0;
    const lastSync = relevantCals.reduce((max, c) => c.lastFetched > max ? c.lastFetched : max, '');
    const syncTip = lastSync
        ? `Dernière synchro : ${new Date(lastSync).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — cliquer pour relancer`
        : 'Aucune synchro encore — cliquer pour démarrer';

    const weekLabel = weekOffset === 0 ? "Cette semaine"
        : weekOffset === -1 ? 'Semaine dernière'
        : weekOffset === 1  ? 'Semaine prochaine'
        : weekOffset < 0    ? `Il y a ${-weekOffset} semaines`
        : `Dans ${weekOffset} semaines`;

    return `
        <div class="cal-week-hdr">
            <div class="cal-week-hdr-left">
                <span>📅 Semaine du ${_fmtDay(mon)} au ${_fmtDay(sun)}</span>
                <span class="cal-week-offset-chip${weekOffset === 0 ? ' cal-week-offset-chip--today' : ''}">${esc(weekLabel)}</span>
            </div>
            <div class="cal-week-hdr-actions">
                <div class="cal-week-nav" role="group" aria-label="Navigation semaine">
                    <button class="btn-icon cal-week-nav-btn" id="cal-week-prev" title="Semaine précédente (←)">‹</button>
                    <button class="btn-icon cal-week-nav-today${weekOffset === 0 ? ' cal-week-nav-today--current' : ''}" id="cal-week-today" title="Aujourd'hui (T)" ${weekOffset === 0 ? 'disabled' : ''}>•</button>
                    <button class="btn-icon cal-week-nav-btn" id="cal-week-next" title="Semaine suivante (→)">›</button>
                </div>
                <button class="btn-icon" id="cal-week-copy" data-week-offset="${weekOffset}" title="Copier la semaine (Slack)">📋</button>
                <button class="btn-icon cal-week-toggle-btn${showPmSplit ? ' is-active' : ''}" id="cal-week-pm-split" title="Séparer matin / après-midi (14h)">🌗${showPmSplit ? '<sup class="cal-toggle-check">✓</sup>' : ''}</button>
                <button class="btn-icon cal-week-toggle-btn${showCompact ? ' is-active' : ''}" id="cal-week-compact" title="Mode compact — titres seulement (survol pour détails)">≡${showCompact ? '<sup class="cal-toggle-check">✓</sup>' : ''}</button>
                ${_renderTeamPickerToggle(teamSelection)}
                <button class="btn-icon" id="cal-week-sync" title="${esc(syncTip)}">
                    <svg class="icon"><use href="#i-sync"/></svg>
                </button>
                <button class="btn-icon" id="cal-week-close" title="Fermer (Échap)"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
        </div>
        ${_renderSprintBar(mon, sun)}
        <div class="cal-week-grid-wrap${showPmSplit ? ' cal-week-split-active' : ''}">
            ${showPmSplit ? `
                <div class="cal-time-gutter" aria-hidden="true">
                    <div class="cal-time-label cal-time-label--am">🌅 Matin</div>
                    <div class="cal-time-label cal-time-label--pm">☀️ Après-midi</div>
                </div>
                <div class="cal-split-body">
                    <div class="cal-week-section cal-week-section--am">
                        <div class="cal-week-grid">${daysHtml}</div>
                    </div>
                    <div class="cal-week-pm-bar" aria-hidden="true"><span class="cal-week-pm-bar-lbl">☀️ Après-midi</span></div>
                    <div class="cal-week-section cal-week-section--pm">
                        <div class="cal-week-grid cal-week-grid--pm">${pmDaysHtml}</div>
                    </div>
                </div>
            ` : `<div class="cal-week-grid">${daysHtml}</div>`}
        </div>`;
}

// ── Picker équipes dans le header de la modal (toggle + popover) ──────────
// Permet de filtrer dynamiquement les events affichés par équipe(s).
// Set vide = "Toutes" (montre tout, comportement par défaut).
function _renderTeamPickerToggle(teamSelection) {
    const n = teamSelection.size;
    const labelTxt = n === 0 ? 'Toutes équipes'
                   : n === 1 ? [...teamSelection][0]
                   : `${n} équipes`;
    const activeCls = n > 0 ? ' is-active' : '';
    return `
        <div class="cal-week-team-picker-wrap">
            <button class="btn-icon cal-week-team-toggle${activeCls}" id="cal-week-team-toggle"
                    title="Filtrer par équipe(s)" aria-haspopup="true" aria-expanded="false">
                <span class="cal-week-team-toggle-icon">👥</span>
                <span class="cal-week-team-toggle-lbl">${esc(labelTxt)}</span>
                ${n > 0 ? `<span class="cal-week-team-toggle-count">${n}</span>` : ''}
            </button>
        </div>`;
}

function _wireTeamPickerPopover(overlay, currentSelection, onChange) {
    const toggle = overlay.querySelector('#cal-week-team-toggle');
    if (!toggle) return;
    let popover = null;
    let onDocClick = null;

    const close = () => {
        if (!popover) return;
        popover.remove();
        popover = null;
        toggle.setAttribute('aria-expanded', 'false');
        if (onDocClick) document.removeEventListener('mousedown', onDocClick, true);
    };

    const open = () => {
        if (popover) { close(); return; }
        // Sources cumulées pour la liste d'équipes :
        // 1. champ team des calendriers configurés (peut être multi-valeur "A,B")
        // 2. champ team de chaque event (source de vérité du backend, toujours à jour)
        // 3. sélection courante (garantit que l'équipe topbar est toujours listée)
        const teamSet = new Set();
        (store.get('calendars') || []).forEach(c => {
            if (c.team) c.team.split(',').map(s => s.trim()).filter(Boolean).forEach(t => teamSet.add(t));
        });
        (store.get('calendarEvents') || []).forEach(e => {
            if (e.team) e.team.split(',').map(s => s.trim()).filter(Boolean).forEach(t => teamSet.add(t));
        });
        currentSelection.forEach(t => teamSet.add(t));
        const allTeams = [...teamSet].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

        popover = document.createElement('div');
        popover.className = 'cal-week-team-popover';
        popover.innerHTML = `
            <div class="cal-week-team-popover-hdr">Filtrer par équipe(s)</div>
            <div class="cal-week-team-popover-pills">
                <button type="button" class="team-pill${currentSelection.size === 0 ? ' is-active' : ''}" data-team="">Toutes</button>
                ${allTeams.map(t => `<button type="button" class="team-pill${currentSelection.has(t) ? ' is-active' : ''}" data-team="${esc(t)}">${esc(t)}</button>`).join('')}
            </div>
            ${allTeams.length === 0 ? '<p class="cal-week-team-popover-empty">Aucune équipe configurée sur un calendrier ICS.</p>' : ''}
        `;
        // Position absolue sous le toggle (utilise getBoundingClientRect pour ne pas être cropped)
        document.body.appendChild(popover);
        const r = toggle.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.top = `${r.bottom + 6}px`;
        const popW = 280;
        popover.style.left = `${Math.max(8, Math.min(window.innerWidth - popW - 8, r.right - popW))}px`;
        popover.style.zIndex = '10001';
        toggle.setAttribute('aria-expanded', 'true');

        popover.addEventListener('click', e => {
            const pill = e.target.closest('.team-pill');
            if (!pill) return;
            const team = pill.dataset.team;
            const next = new Set(currentSelection);
            if (!team) next.clear(); // "Toutes" → vide
            else if (next.has(team)) next.delete(team);
            else next.add(team);
            currentSelection = next;
            // Re-render local (active/inactive states)
            popover.querySelectorAll('.team-pill').forEach(p => {
                const t = p.dataset.team;
                p.classList.toggle('is-active', t === '' ? next.size === 0 : next.has(t));
            });
            onChange(next);
        });

        onDocClick = (ev) => {
            if (popover && !popover.contains(ev.target) && !toggle.contains(ev.target)) close();
        };
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    };

    toggle.addEventListener('click', (e) => { e.stopPropagation(); open(); });
}

/** Formate un event pour Slack : "  • HH:mm–HH:mm : Titre lien" */
function _fmtEvSlack(ev) {
    const s = new Date(ev.start), e = new Date(ev.end);
    const time = `${_h(s)}–${_h(e)}`;
    // Lien visio (url > location > description) — sinon url générique éventuelle
    const link = _extractVisioLink(ev) || (ev.url && /^https?:\/\//i.test(ev.url) ? ev.url : null);
    return link ? `  • ${time} : ${ev.title} ${link}` : `  • ${time} : ${ev.title}`;
}

/** Extrait le nom depuis un titre OFF : "NOM, Prénom - OFF" → "NOM, Prénom" */
function _nameFromOff(title) {
    return title.replace(/-\s*[^-]*\bOFF\s*$/i, '').trim();
}

/** Construit le message Slack pour un seul jour. */
function _buildDaySlack(evs, day) {
    const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const _fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const regular = evs.filter(e => !_isOff(e.title) && !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
    const offEvs  = evs.filter(e => _isOff(e.title));

    if (!regular.length && !offEvs.length) return '_(Aucun événement)_';

    const dow = (day.getDay() + 6) % 7;
    const lines = [`:date: AGENDA DU JOUR — *${DAY_LABELS[dow]} ${_fmtD(day)}*`, ''];

    const matin = regular.filter(e => new Date(e.start).getHours() < 12);
    const aprem  = regular.filter(e => new Date(e.start).getHours() >= 12);

    if (matin.length) { lines.push('  🌅 Matin');  matin.forEach(ev => lines.push(_fmtEvSlack(ev))); }
    if (aprem.length) { lines.push('  ☀️ Après-midi'); aprem.forEach(ev => lines.push(_fmtEvSlack(ev))); }

    if (offEvs.length) {
        const names = offEvs.map(ev => {
            const name = _nameFromOff(ev.title);
            return _isHalfOff(ev.title) ? `${name} (½)` : name;
        }).join(', ');
        lines.push(`🏖️ Absents : ${names}`);
    }

    return lines.join('\n');
}

/** Construit le message Slack de la semaine : un bloc par jour (lun→dim). */
function _buildWeekSlack(allEvents, days) {
    const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const _fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const lines = [];

    for (const day of days) {
        const dk = _dayKey(day);
        const allDay = allEvents.filter(e => _eventCoversDay(e, dk));
        const evs    = allDay.filter(e => !_isOff(e.title) && !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
        const offEvs = allDay.filter(e => _isOff(e.title));
        if (!evs.length && !offEvs.length) continue;

        const dow = (day.getDay() + 6) % 7;
        lines.push(`*${DAY_LABELS[dow]} ${_fmtD(day)}*`);

        const matin = evs.filter(e => new Date(e.start).getHours() < 12);
        const aprem  = evs.filter(e => new Date(e.start).getHours() >= 12);

        if (matin.length) { lines.push('  🌅 Matin');  matin.forEach(ev => lines.push(_fmtEvSlack(ev))); }
        if (aprem.length) { lines.push('  ☀️ Après-midi'); aprem.forEach(ev => lines.push(_fmtEvSlack(ev))); }
        if (offEvs.length) {
            const names = offEvs.map(ev => _isHalfOff(ev.title) ? `${_nameFromOff(ev.title)} (½)` : _nameFromOff(ev.title)).join(', ');
            lines.push(`🏖️ Absents : ${names}`);
        }
        lines.push('');
    }

    if (!lines.length) return '_(Aucun événement cette semaine)_';
    return lines.join('\n').trimEnd();
}

/** Câble les boutons (close, sync, navigation) après chaque render. */
function _wireWeekContent(overlay, allEvents, refresh, navigate, resetToToday, togglePmSplit, toggleCompact) {
    overlay.querySelector('#cal-week-close')?.addEventListener('click', _closeWeekModal);
    overlay.querySelector('#cal-week-sync')?.addEventListener('click', _syncCalendarsFromModal);
    overlay.querySelector('#cal-week-prev')?.addEventListener('click', () => navigate(-1));
    overlay.querySelector('#cal-week-next')?.addEventListener('click', () => navigate(+1));
    overlay.querySelector('#cal-week-today')?.addEventListener('click', resetToToday);
    overlay.querySelector('#cal-week-pm-split')?.addEventListener('click', () => togglePmSplit?.());
    overlay.querySelector('#cal-week-compact')?.addEventListener('click', () => toggleCompact?.());

    overlay.querySelectorAll('.cal-day-copy-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const dk = btn.dataset.dk;
            const day = new Date(dk + 'T00:00:00');
            const dayEvs = allEvents.filter(ev => _dayKey(ev.start) === dk);
            const msg = _buildDaySlack(dayEvs, day);
            try {
                await navigator.clipboard.writeText(msg);
                btn.textContent = '✓';
                setTimeout(() => { btn.textContent = '📋'; }, 1800);
            } catch {
                toast('Copie impossible', 'error');
            }
        });
    });

    const copyBtn = overlay.querySelector('#cal-week-copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const weekOffset = parseInt(copyBtn.dataset.weekOffset ?? '0', 10);
            const mon = _mondayOf(new Date(), weekOffset);
            const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
            const msg = _buildWeekSlack(allEvents, days);
            try {
                await navigator.clipboard.writeText(msg);
                copyBtn.textContent = '✓';
                copyBtn.title = 'Copié !';
                setTimeout(() => { copyBtn.textContent = '📋'; copyBtn.title = 'Copier la semaine (Slack)'; }, 1800);
            } catch {
                toast('Copie impossible', 'error');
            }
        });
    }
}

// ── Popup détail événement au clic — style Google Calendar ───────────────────
let _evPopEl = null;

function _evPopup() {
    if (_evPopEl) return _evPopEl;
    _evPopEl = document.createElement('div');
    _evPopEl.id = 'cal-ev-popup';
    _evPopEl.className = 'cal-ev-popup';
    _evPopEl.setAttribute('role', 'dialog');
    document.body.appendChild(_evPopEl);
    // Fermeture via bouton ×
    _evPopEl.addEventListener('click', e => {
        if (e.target.closest('.cal-ev-popup-close')) _hideEvPopup();
    });
    return _evPopEl;
}

function _hideEvPopup() {
    _evPopEl?.classList.remove('visible');
}

function _showEvPopup(card) {
    const d = card.dataset;
    if (!d.evTitle && !d.evStart) return;

    const ev = {
        title:   d.evTitle   || '',
        start:   d.evStart   || '',
        end:     d.evEnd     || '',
        allDay:  d.evAllday  === '1',
        calName: d.evCalname || '',
        team:    d.evTeam    || '',
        color:   d.evColor   || 'var(--primary)',
        visio:   d.evVisio   || '',
        url:     d.evUrl     || '',
        loc:     d.evLoc     || '',
        rawLoc:  d.evRawloc  || '',
        desc:    d.evDesc    || '',
        recur:   d.evRecur   === '1',
        scrum:   d.evScrum   || '',
    };

    // ── Formatage heure ──────────────────────────────────────────────────────
    const s = new Date(ev.start), e = new Date(ev.end);
    const fmtDate = dt => dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
    const fmtTime = dt => `${String(dt.getHours()).padStart(2,'0')}h${String(dt.getMinutes()).padStart(2,'0')}`;
    const dur = ev.allDay ? '' : _duration(ev.start, ev.end);

    let timeHtml;
    if (ev.allDay) {
        const endDay = new Date(e.getTime() - 1);
        timeHtml = fmtDate(s) === fmtDate(endDay)
            ? `${fmtDate(s)} · Journée entière`
            : `${fmtDate(s)} → ${fmtDate(endDay)} · Journée entière`;
    } else {
        const sd = fmtDate(s), ed = fmtDate(e);
        timeHtml = sd === ed
            ? `${sd} · ${fmtTime(s)} – ${fmtTime(e)}${dur ? ` <span class="cal-ev-popup-dur">(${dur})</span>` : ''}`
            : `${sd} ${fmtTime(s)} → ${ed} ${fmtTime(e)}`;
    }

    // ── Extraction contacts depuis la description brute ──────────────────────
    const rawDesc = ev.desc;
    const emails = rawDesc
        ? [...new Set(rawDesc.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])].slice(0, 5)
        : [];
    const phones = rawDesc
        ? [...new Set((rawDesc.match(/(?:\+\d{1,3}[\s.]?)?\(?\d{2,4}\)?[\s.\-]?\d{2,4}[\s.\-]?\d{4}/g) || [])
            .map(p => p.trim()).filter(p => p.replace(/\D/g, '').length >= 8))].slice(0, 3)
        : [];

    // Réunion : ID + passcode (Teams, Zoom, Meet)
    const meetIdMatch  = rawDesc.match(/(?:ID[^\d]*|Meeting ID|R.union ID|ID de la r.union)\s*[:\-]?\s*([\d\s]{8,})/i);
    const passcodeMatch = rawDesc.match(/(?:code|passcode|mot de passe|password)\s*[:\-]?\s*(\d{4,10})/i);
    const meetId   = meetIdMatch  ? meetIdMatch[1].trim()  : '';
    const passcode = passcodeMatch ? passcodeMatch[1]       : '';

    // ── Cérémonie Scrum ──────────────────────────────────────────────────────
    const scrumMeta = ev.scrum ? ({ daily: { icon: '🌅', label: 'Daily Scrum', detail: '15 min · toute l\'équipe' },
        planning: { icon: '🎯', label: 'Sprint Planning', detail: 'Début de sprint · équipe + PO' },
        refinement: { icon: '🔍', label: 'Backlog Refinement', detail: 'Estimation + clarification des US' },
        retro: { icon: '🔁', label: 'Rétrospective', detail: 'Fin de sprint · amélioration continue' },
        review: { icon: '🎤', label: 'Sprint Review', detail: 'Démonstration · parties prenantes invitées' },
    })[ev.scrum] : null;

    // ── Description nettoyée ─────────────────────────────────────────────────
    const desc = rawDesc ? _cleanDescHtml(rawDesc) : '';

    // ── Localisation : on affiche la brute si elle apporte plus que physLoc ──
    const displayLoc = ev.rawLoc && ev.rawLoc !== ev.loc && ev.rawLoc.length > (ev.loc.length + 3)
        ? ev.rawLoc : ev.loc;

    // ── Titre ────────────────────────────────────────────────────────────────
    const title = `${_isFreeze(ev.title) ? '❄️ ' : ''}${esc(ev.title)}`;

    const pop = _evPopup();
    pop.innerHTML = `
        <div class="cal-ev-popup-accent" style="background:${esc(ev.color)}"></div>
        <div class="cal-ev-popup-hdr">
            <div class="cal-ev-popup-title">${title}</div>
            <button class="cal-ev-popup-close" aria-label="Fermer">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
            </button>
        </div>
        <div class="cal-ev-popup-body">
            <div class="cal-ev-popup-row"><span class="cal-ev-popup-icon">🕐</span><span>${timeHtml}</span></div>
            ${ev.calName ? `<div class="cal-ev-popup-row">
                <span class="cal-ev-popup-dot" style="background:${esc(ev.color)}"></span>
                <span>${esc(ev.calName)}${ev.team && ev.team !== ev.calName ? ` · <em>${esc(ev.team)}</em>` : ''}</span>
            </div>` : ''}
            ${displayLoc ? `<div class="cal-ev-popup-row"><span class="cal-ev-popup-icon">📍</span><span class="cal-ev-popup-loc">${esc(displayLoc)}</span></div>` : ''}
            ${ev.recur   ? `<div class="cal-ev-popup-row cal-ev-popup-row--muted"><span class="cal-ev-popup-icon">🔄</span><span>Événement récurrent</span></div>` : ''}
            ${scrumMeta  ? `<div class="cal-ev-popup-row cal-ev-popup-row--scrum"><span class="cal-ev-popup-icon">${scrumMeta.icon}</span><span><strong>${esc(scrumMeta.label)}</strong> <span class="cal-ev-popup-muted">— ${esc(scrumMeta.detail)}</span></span></div>` : ''}
            ${ev.visio   ? `<a class="cal-ev-popup-btn cal-ev-popup-btn--visio" href="${esc(ev.visio)}" target="_blank" rel="noopener">🎥 Rejoindre la visio</a>` : ''}
            ${ev.url     ? `<a class="cal-ev-popup-btn" href="${esc(ev.url)}" target="_blank" rel="noopener">🔗 Rejoindre</a>` : ''}
            ${(meetId || passcode) ? `<div class="cal-ev-popup-section">
                ${meetId   ? `<div class="cal-ev-popup-row cal-ev-popup-row--muted"><span class="cal-ev-popup-icon">🔑</span><span>ID : <code class="cal-ev-popup-code">${esc(meetId)}</code></span></div>` : ''}
                ${passcode ? `<div class="cal-ev-popup-row cal-ev-popup-row--muted"><span class="cal-ev-popup-icon">🔒</span><span>Code : <code class="cal-ev-popup-code">${esc(passcode)}</code></span></div>` : ''}
            </div>` : ''}
            ${(emails.length || phones.length) ? `<div class="cal-ev-popup-section">
                <div class="cal-ev-popup-section-hdr">👤 Contacts</div>
                ${emails.map(e => `<div class="cal-ev-popup-contact"><a href="mailto:${esc(e)}">${esc(e)}</a></div>`).join('')}
                ${phones.map(p => `<div class="cal-ev-popup-contact"><a href="tel:${esc(p.replace(/\s/g,''))}">${esc(p)}</a></div>`).join('')}
            </div>` : ''}
            ${desc ? `<div class="cal-ev-popup-desc">${desc}</div>` : ''}
        </div>`;

    // Positionnement : à droite de la carte, flip si débord
    const POP_W = 340, MARGIN = 8, Z = 10100;
    pop.style.cssText = `position:fixed;z-index:${Z};visibility:hidden`;
    const r   = card.getBoundingClientRect();
    const ww  = window.innerWidth, wh = window.innerHeight;
    const popH = Math.min(pop.scrollHeight || 320, wh - 2 * MARGIN);
    let left = r.right + MARGIN;
    if (left + POP_W > ww - MARGIN) left = r.left - POP_W - MARGIN;
    left = Math.max(MARGIN, left);
    let top = r.top;
    if (top + popH > wh - MARGIN) top = wh - MARGIN - popH;
    top = Math.max(MARGIN, top);
    pop.style.cssText = `position:fixed;z-index:${Z};left:${left}px;top:${top}px;width:${POP_W}px;max-height:${popH}px`;
    requestAnimationFrame(() => pop.classList.add('visible'));
}

// Délégation clic globale sur toutes les cartes event
document.addEventListener('click', e => {
    const card = e.target.closest?.('.cal-ev-row[data-ev-start]');
    if (card) { e.stopPropagation(); _showEvPopup(card); return; }
    // Clic ailleurs (hors popup) → ferme
    if (_evPopEl?.classList.contains('visible') && !_evPopEl.contains(e.target)) _hideEvPopup();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') _hideEvPopup();
});

// ── Tooltip mode compact (singleton body, position fixed) ────────────────────
let _compactTtEl = null;
let _compactTtHideT = null;
function _compactTooltipEl() {
    if (_compactTtEl) return _compactTtEl;
    _compactTtEl = document.createElement('div');
    _compactTtEl.className = 'cal-compact-tt';
    document.body.appendChild(_compactTtEl);
    _compactTtEl.addEventListener('mouseenter', () => clearTimeout(_compactTtHideT));
    _compactTtEl.addEventListener('mouseleave', _hideCompactTt);
    return _compactTtEl;
}
function _showCompactTt(card) {
    const time    = card.dataset.time  || '';
    const visio   = card.dataset.visio || '';
    const descRaw = card.dataset.desc  || '';
    const loc     = card.dataset.loc   || '';
    const desc    = descRaw ? _cleanDescHtml(descRaw) : '';
    if (!time && !visio && !desc && !loc) return;
    const tt = _compactTooltipEl();
    tt.innerHTML = [
        time  ? `<div class="cal-compact-tt-time">${esc(time)}</div>` : '',
        loc   ? `<div class="cal-compact-tt-row">📍 ${esc(loc)}</div>` : '',
        visio ? `<div class="cal-compact-tt-row"><a class="cal-compact-tt-visio" href="${esc(visio)}" target="_blank" rel="noopener">🎥 Rejoindre la visio</a></div>` : '',
        desc  ? `<div class="cal-compact-tt-desc">${desc}</div>` : '',
    ].join('');
    tt.classList.add('visible');
    const r = card.getBoundingClientRect();
    const W = 280;
    let left = Math.min(r.left, window.innerWidth - W - 8);
    left = Math.max(8, left);
    const below = r.bottom + 8 + 160 < window.innerHeight;
    tt.style.left = `${left}px`;
    tt.style.top  = below ? `${r.bottom + 4}px` : `${r.top - 4}px`;
    tt.style.transform = below ? 'translateY(0)' : 'translateY(-100%)';
    clearTimeout(_compactTtHideT);
}
function _hideCompactTt() {
    clearTimeout(_compactTtHideT);
    _compactTtHideT = setTimeout(() => _compactTtEl?.classList.remove('visible'), 120);
}
document.addEventListener('mouseover', e => {
    const card = e.target.closest?.('.cal-ev-row--compact');
    if (card) _showCompactTt(card);
});
document.addEventListener('mouseout', e => {
    const card = e.target.closest?.('.cal-ev-row--compact');
    if (card && !card.contains(e.relatedTarget)) _hideCompactTt();
});

// ── Tooltip Scrum globale (singleton attaché au body, position: fixed) ──────
// Évite tout clip parent (overflow:hidden, scroll de la modal, etc.).
let _scrumTtEl = null;
function _scrumTooltipEl() {
    if (_scrumTtEl) return _scrumTtEl;
    _scrumTtEl = document.createElement('div');
    _scrumTtEl.id = 'cal-scrum-tt-global';
    _scrumTtEl.className = 'cal-scrum-tt';
    _scrumTtEl.setAttribute('role', 'tooltip');
    document.body.appendChild(_scrumTtEl);
    // Permet de rentrer dans la tooltip sans la fermer
    _scrumTtEl.addEventListener('mouseenter', () => clearTimeout(_scrumTtHideT));
    _scrumTtEl.addEventListener('mouseleave', _hideScrumTt);
    return _scrumTtEl;
}
let _scrumTtHideT = null;
function _showScrumTt(badge) {
    const key = badge.dataset.scrumKey;
    const details = _SCRUM_DETAILS[key];
    if (!details) return;
    const meta = { daily: { icon: '🌅', label: 'Daily' },
                   planning: { icon: '🎯', label: 'Planning' },
                   refinement: { icon: '🔍', label: 'Refinement' },
                   retro: { icon: '🔁', label: 'Rétro' },
                   review: { icon: '🎤', label: 'Sprint Review' } }[key];

    const tt = _scrumTooltipEl();
    tt.className = `cal-scrum-tt cal-scrum-tt--${key}`;
    tt.innerHTML = `
        <span class="cal-scrum-tt-hdr">
            <span class="cal-scrum-tt-icon">${meta.icon}</span>
            <span class="cal-scrum-tt-title">${esc(meta.label)}</span>
        </span>
        <span class="cal-scrum-tt-row"><b>🎯 Pourquoi —</b> ${esc(details.why)}</span>
        <span class="cal-scrum-tt-row"><b>👥 Qui —</b> ${esc(details.who)}</span>
        <span class="cal-scrum-tt-row"><b>⏱ Fréquence —</b> ${esc(details.frequency)}</span>
        <span class="cal-scrum-tt-row"><b>📦 Output —</b> ${esc(details.output)}</span>
        <span class="cal-scrum-tt-row cal-scrum-tt-row--ex"><b>💡 Exemple —</b> <em>${esc(details.example)}</em></span>
    `;

    // Positionne en fixed selon le badge — préfère "au-dessus à droite", flip si débord
    const r = badge.getBoundingClientRect();
    const TT_W = 320, TT_H = 220; // approx (la vraie hauteur est calculée après display)
    const margin = 8;
    let left = r.right - TT_W;  // aligné à droite du badge
    if (left < 8) left = r.left;             // si débord à gauche, aligne à gauche du badge
    if (left + TT_W > window.innerWidth - 8) left = window.innerWidth - TT_W - 8;
    let top = r.top - margin;                // par défaut : tooltip au-dessus
    let placement = 'top';
    // Si pas assez d'espace en haut → afficher en dessous
    if (r.top < TT_H + margin + 8) {
        top = r.bottom + margin;
        placement = 'bottom';
    }
    tt.dataset.placement = placement;
    tt.style.left = `${Math.max(8, Math.round(left))}px`;
    tt.style.top  = `${Math.round(top)}px`;
    tt.style.transform = placement === 'top' ? 'translateY(-100%)' : 'translateY(0)';
    clearTimeout(_scrumTtHideT);
    requestAnimationFrame(() => tt.classList.add('visible'));
}
function _hideScrumTt() {
    if (!_scrumTtEl) return;
    clearTimeout(_scrumTtHideT);
    _scrumTtHideT = setTimeout(() => _scrumTtEl.classList.remove('visible'), 80);
}
// Délégation globale (mouseenter via mouseover) sur les badges scrum partout dans la page
document.addEventListener('mouseover', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge) _showScrumTt(badge);
});
document.addEventListener('mouseout', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge && !badge.contains(e.relatedTarget)) _hideScrumTt();
});
document.addEventListener('focusin', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge) _showScrumTt(badge);
});
document.addEventListener('focusout', (e) => {
    const badge = e.target.closest?.('.cal-ev-scrum-badge[data-scrum-key]');
    if (badge) _hideScrumTt();
});

// ── Tooltip description événement (singleton body, position fixed) ──────────
let _descTtEl = null;
let _descTtHideT = null;

function _descTooltipEl() {
    if (_descTtEl) return _descTtEl;
    _descTtEl = document.createElement('div');
    _descTtEl.id = 'cal-desc-tt-global';
    _descTtEl.className = 'cal-desc-tt';
    document.body.appendChild(_descTtEl);
    _descTtEl.addEventListener('mouseenter', () => clearTimeout(_descTtHideT));
    _descTtEl.addEventListener('mouseleave', _hideDescTt);
    return _descTtEl;
}

function _cleanDescHtml(raw) {
    return raw
        .replace(/<(u|b|i|strong|em|span|a)[^>]*>\s*<\/\1>/gi, '') // balises vides
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')  // ul/ol → saut de ligne
        .replace(/<\/li>/gi, '')                  // fermeture li : rien
        .replace(/<li[^>]*>/gi, '\n• ')           // ouverture li : saut + puce
        // Conserve <b> et <strong> → <b>, retire tout le reste
        .replace(/<(b|strong)(\s[^>]*)?>/gi, '<b>')
        .replace(/<\/(b|strong)>/gi, '</b>')
        .replace(/<(?!\/?(b)[ >])[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/\n[ \t]+\n/g, '\n\n')          // lignes vides avec espaces
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function _showDescTt(btn) {
    const raw = btn.dataset.desc;
    if (!raw) return;
    const html = _cleanDescHtml(raw);
    if (!html) return;
    const tt = _descTooltipEl();
    tt.innerHTML = html;
    tt.classList.add('visible');

    const r = btn.getBoundingClientRect();
    const W = 280;
    let left = Math.min(r.left, window.innerWidth - W - 8);
    left = Math.max(8, left);
    const below = r.bottom + 8 + 120 < window.innerHeight;
    tt.style.left = `${left}px`;
    tt.style.top  = below ? `${r.bottom + 6}px` : `${r.top - 6}px`;
    tt.style.transform = below ? 'translateY(0)' : 'translateY(-100%)';
    clearTimeout(_descTtHideT);
}

function _hideDescTt() {
    clearTimeout(_descTtHideT);
    _descTtHideT = setTimeout(() => _descTtEl?.classList.remove('visible'), 120);
}

// Délégation globale sur les boutons description
document.addEventListener('mouseover', e => {
    const btn = e.target.closest?.('.cal-ev-desc-btn');
    if (btn) _showDescTt(btn);
});
document.addEventListener('mouseout', e => {
    const btn = e.target.closest?.('.cal-ev-desc-btn');
    if (btn && !btn.contains(e.relatedTarget)) _hideDescTt();
});
// Clic sur le bouton : empêche la propagation (évite d'ouvrir la modal)
document.addEventListener('click', e => {
    const btn = e.target.closest?.('.cal-ev-desc-btn');
    if (btn) { e.stopPropagation(); _showDescTt(btn); return; }
    // clic ailleurs → ferme
    if (_descTtEl?.classList.contains('visible') && !_descTtEl.contains(e.target)) {
        _descTtEl.classList.remove('visible');
    }
});

/** Ouverture publique de la modal semaine. La modal a son propre picker d'équipes
 *  (popover dans le header) — par défaut pré-coche l'équipe topbar si elle est spécifique. */
export function openCalWeekModal() {
    const team = store.get('team');
    const all = store.get('calendarEvents') || [];
    const initialSelection = (team && team !== 'all') ? new Set([team]) : new Set();
    _openWeekModal(all, null, initialSelection);
}

function _closeWeekModal() {
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
async function _syncCalendarsFromModal(e) {
    const btn = e.currentTarget;
    if (!btn || btn.disabled) return;
    const calendars = store.get('calendars') || [];
    const team = store.get('team');
    // Calendriers pertinents : sans équipe (= toutes) OU pour l'équipe courante
    const relevant = (team && team !== 'all')
        ? calendars.filter(c => !c.team || c.team === team)
        : calendars;
    if (!relevant.length) {
        toast('Aucun calendrier ICS à synchroniser', 'info');
        return;
    }
    btn.disabled = true;
    btn.classList.add('cal-sync-spin');
    try {
        const results = await Promise.allSettled(relevant.map(c => api.refreshCalendar(c.id)));
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
