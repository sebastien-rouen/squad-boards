/**
 * Calendar banner — aujourd'hui en haut du Sprint/Kanban,
 * clic → modal semaine groupée par jour.
 */

import { store } from '../state.js';
import { esc, hashColor, toast, getSprintForTeam } from '../utils.js';
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

// ── Chip HTML (bannière aujourd'hui) ─────────────────────────────────────────
// Identifie les absences. Accepte "OFF" et les variantes demi-journée "1/2 OFF", "½ OFF",
// "AM OFF", "PM OFF" — toujours en fin de titre, après un tiret.
function _isOff(title)     { return /-\s*[^-]*\bOFF\s*$/i.test(title || ''); }
function _isHalfOff(title) { return /-\s*(?:1\s*\/\s*2|½|AM|PM|matin|après[- ]?midi)\s*OFF\s*$/i.test(title || ''); }

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

    const offLine = offEvs.length
        ? `<div class="cal-banner-line cal-banner-line--off">
               ${offEvs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('')}
           </div>`
        : '';

    const regularLine = regularEvs.length
        ? `<div class="cal-banner-line">
               ${regularEvs.map(ev => _chip(ev, todayEvs.indexOf(ev))).join('')}
           </div>`
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

    return `
    <div class="cal-week-sprint-bar cal-week-sprint-bar--${sprint.state || 'unknown'}" style="--sprint-color:var(--primary); --team-color:${teamColor}">
        <div class="cal-week-sprint-head">
            <div class="cal-week-sprint-info">
                <span class="cal-week-sprint-name">📌 ${esc(sprint.name || 'Sprint')}</span>
                ${stateBadge}
            </div>
            <div class="cal-week-sprint-stats">
                <span class="cal-week-sprint-chip cal-week-sprint-chip--dates">${_fmtDay(sStart)} → ${_fmtDay(sEnd)}</span>
                <span class="cal-week-sprint-chip cal-week-sprint-chip--jl">${esc(jlLabel)}</span>
            </div>
        </div>
        ${goalLine}
        <div class="cal-week-sprint-track-wrap">
            <div class="cal-week-sprint-track" title="Position de la semaine affichée dans le sprint (${elapsedPctInSprint}% du sprint)">
                ${ticksHtml}
                <div class="cal-week-sprint-fill" style="left:${leftPct}%; width:${widthPct}%" title="Semaine affichée"></div>
                ${todayPct != null ? `<div class="cal-week-sprint-today" style="left:${todayPct}%" title="Aujourd'hui"></div>` : ''}
            </div>
            ${labelsHtml}
        </div>
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

    let weekOffset = 0;
    // Sélection multi-équipes propre à la modal (Set d'équipes). Vide = montre tout.
    // initialisé via initialTeamSelection (pré-coche l'équipe topbar si spécifique).
    let teamSelection = initialTeamSelection instanceof Set ? new Set(initialTeamSelection) : new Set();

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
        inner.innerHTML = _renderWeekContent(filtered, weekOffset, initialHighlight, teamSelection);
        _wireWeekContent(overlay, filtered, () => _renderForOffset(null), (delta) => { weekOffset += delta; _renderForOffset(null); }, () => { weekOffset = 0; _renderForOffset(null); });
        _wireTeamPickerPopover(overlay, teamSelection, (newSel) => {
            teamSelection = newSel;
            _renderForOffset(null);
        });
        if (initialHighlight) {
            requestAnimationFrame(() => {
                const hl = inner.querySelector('.cal-ev-hl');
                if (hl) hl.closest('.cal-week-grid-wrap')?.scrollTo({ top: hl.offsetTop - 60, behavior: 'smooth' });
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
function _renderWeekContent(allEvents, weekOffset, highlightEv, teamSelection = new Set()) {
    const mon = _mondayOf(new Date(), weekOffset);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });

    const todayK = _todayKey();
    const highlightUid = highlightEv?.uid;

    // Repère les jours start/end du sprint courant (pour indicateur dans cal-day-hdr)
    const _currentTeam = store.get('team');
    const _teamFilterActive = _currentTeam && _currentTeam !== 'all';
    const _sprintRef = new Date(mon); _sprintRef.setDate(mon.getDate() + 3); // milieu de semaine
    const _sprint = getSprintForTeam(_currentTeam, store.get('sprintInfo'), _sprintRef);
    const sprintStartKey = _sprint?.startDate ? String(_sprint.startDate).slice(0, 10) : null;
    const sprintEndKey   = _sprint?.endDate   ? String(_sprint.endDate).slice(0, 10)   : null;

    const daysHtml = days.map(day => {
        const dk = _dayKey(day);
        const isToday = dk === todayK;
        const isPast  = dk < todayK;
        const isFuture = dk > todayK;
        const evs = allEvents
            .filter(e => _dayKey(e.start) === dk)
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

        const evCards = regularEvs.map(ev => {
                const s = new Date(ev.start), e = new Date(ev.end);
                const timeStr = ev.allDay ? 'Journée entière' : `${_h(s)} – ${_h(e)}`;
                const color = _teamColor(ev.team);
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
                // Badge léger : juste l'emoji + data-attrs ; la tooltip est rendue
                // par un singleton attaché au body (évite tout clip parent overflow/scroll).
                const scrumBadge = scrum
                    ? `<span class="cal-ev-scrum-badge cal-ev-scrum-badge--${scrum.key}" tabindex="0"
                              aria-label="${esc(scrum.label)}" data-scrum-key="${scrum.key}">
                            <span aria-hidden="true">${scrum.icon}</span>
                        </span>`
                    : '';
                return `<div class="cal-ev-row${isHL ? ' cal-ev-hl' : ''}${isPast ? ' cal-ev-past' : ''}${scrumClass}" style="border-left-color:${color}">
                    <div class="cal-ev-time">${timeStr}${scrumBadge}${recurMark}</div>
                    <div class="cal-ev-body">
                        <div class="cal-ev-title">${esc(ev.title)}</div>
                        ${ev.location ? (() => {
                            const isUrl = /^https?:\/\//i.test(ev.location);
                            return isUrl
                                ? `<div class="cal-ev-meta"><a class="cal-ev-link cal-ev-link--visio" href="${esc(ev.location)}" target="_blank" rel="noopener" title="${esc(ev.location)}">🎥 Visio</a></div>`
                                : `<div class="cal-ev-meta cal-ev-meta--loc">📍 ${esc(ev.location)}</div>`;
                        })() : ''}
                        ${metaLine ? `<div class="cal-ev-meta">${metaLine}</div>` : ''}
                        ${ev.url ? `<div class="cal-ev-meta"><a class="cal-ev-link" href="${esc(ev.url)}" target="_blank" rel="noopener">🔗 Rejoindre</a></div>` : ''}
                    </div>
                </div>`;
            }).join('');

        const evRows = (offBlock || evCards)
            ? offBlock + evCards
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
                ${isSprintStart ? '▶' : '◀'}
            </span>` : '';

        return `<div class="${dayCls}">
            <div class="cal-day-hdr">${_fmtDay(day)}${sprintMark}</div>
            <div class="cal-day-events">${holidayBadge}${evRows}</div>
        </div>`;
    }).join('');

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
                ${_renderTeamPickerToggle(teamSelection)}
                <button class="btn-icon" id="cal-week-sync" title="${esc(syncTip)}">
                    <svg class="icon"><use href="#i-sync"/></svg>
                </button>
                <button class="btn-icon" id="cal-week-close" title="Fermer (Échap)"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
        </div>
        ${_renderSprintBar(mon, sun)}
        <div class="cal-week-grid-wrap"><div class="cal-week-grid">${daysHtml}</div></div>`;
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
        // Récupère la liste d'équipes triée alpha, en s'appuyant sur les events
        // (équipes qui ont au moins un calendrier dispo) + équipes connues du store
        const fromCalendars = new Set();
        (store.get('calendars') || []).forEach(c => {
            if (c.team) c.team.split(',').map(s => s.trim()).filter(Boolean).forEach(t => fromCalendars.add(t));
        });
        const storeTeams = (store.get('teams') || []).filter(t => fromCalendars.has(t));
        const allTeams = [...new Set([...storeTeams, ...fromCalendars])]
            .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

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

/** Câble les boutons (close, sync, navigation) après chaque render. */
function _wireWeekContent(overlay, allEvents, refresh, navigate, resetToToday) {
    overlay.querySelector('#cal-week-close')?.addEventListener('click', _closeWeekModal);
    overlay.querySelector('#cal-week-sync')?.addEventListener('click', _syncCalendarsFromModal);
    overlay.querySelector('#cal-week-prev')?.addEventListener('click', () => navigate(-1));
    overlay.querySelector('#cal-week-next')?.addEventListener('click', () => navigate(+1));
    overlay.querySelector('#cal-week-today')?.addEventListener('click', resetToToday);
}

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
}

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
