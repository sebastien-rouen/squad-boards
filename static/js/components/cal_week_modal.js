/**
 * 📅 Modale « semaine » du bandeau calendrier : barre de sprint, grille des jours, rendu des évènements par équipe.
 *
 * Extrait de cal_banner.js (3.254.0) — code déplacé à l'identique. Dépendances CIRCULAIRES vers cal_banner.js
 * assumées : jamais utilisées au niveau racine du module (seulement dans des fonctions / écouteurs).
 */
import { store } from '../state.js';
import { esc, getSprintForTeam, getCurrentPi, extractTeam, lastCalendarSync, supportMembersOnDay } from '../utils.js';
import { _showDescTt } from './cal_popups.js';
import { _renderTeamPickerToggle, _wireTeamPickerPopover, _wireWeekContent } from './cal_week_tools.js';
import { _calColor, _closeWeekModal, _dayKey, _detectScrumType, _eventCoversDay, _extractVisioLink, _fmtDay, _getHoliday, _h, _isFreeze, _isHalfOff, _isOff, _todayKey } from './cal_banner.js';

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
export function _mondayOf(date, weekOffset = 0) {
    const d = new Date(date);
    const dow = d.getDay();
    const diffMon = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diffMon + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function _openWeekModal(allEvents, highlightEv = null, initialTeamSelection = null) {
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

    // Dernière synchro la plus récente parmi les calendriers pertinents (helper unique)
    const team0 = store.get('team');
    const lastSync = lastCalendarSync(store.get('calendars'), team0);
    const syncTip = lastSync
        ? `Dernière synchro : ${new Date(lastSync).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — cliquer pour relancer`
        : 'Aucune synchro encore — cliquer pour démarrer';

    const weekLabel = weekOffset === 0 ? "Cette semaine"
        : weekOffset === -1 ? 'Semaine dernière'
        : weekOffset === 1  ? 'Semaine prochaine'
        : weekOffset < 0    ? `Il y a ${-weekOffset} semaines`
        : `Dans ${weekOffset} semaines`;

    // Support de la semaine — segmenté par jour, façon page Agenda : la frontière de semaine support
    // peut tomber en milieu de semaine (modes ven→jeu, lun→lun…), d'où des binômes différents. Chaque
    // segment reçoit une palette cyclique (mêmes teintes que l'Agenda) exposée en CSS vars.
    const _SUP_PAL = [
        { chipBg: '#fef9c3', chipBorder: '#fde68a', chipColor: '#92400e', rangeColor: '#b45309' },
        { chipBg: '#ffedd5', chipBorder: '#fed7aa', chipColor: '#9a3412', rangeColor: '#c2410c' },
        { chipBg: '#d1fae5', chipBorder: '#a7f3d0', chipColor: '#065f46', rangeColor: '#059669' },
    ];
    const _SUP_ABBR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    const _supAll = store.get('support') || [];
    // supportMembersOnDay = même lecture que la grille Paramètres → Rotation (mode actuel de
    // l'équipe + jours cochés) — un recouvrement de dates mêlait les lignes d'un ancien mode.
    const _supForDay = dk => new Set(
        supportMembersOnDay(_supAll, dk)
            .filter(m => !_currentTeam || _currentTeam === 'all' || m.team === _currentTeam)
            .map(m => m.name)
    );
    const _supWkKeys = days.slice(0, 5).map(_dayKey);
    const _supSetsEq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
    const _supSegs = [];
    _supWkKeys.forEach((dk, i) => {
        const mems = _supForDay(dk);
        const last = _supSegs[_supSegs.length - 1];
        if (last && _supSetsEq(last.members, mems)) last.idx.push(i);
        else _supSegs.push({ idx: [i], members: mems });
    });
    let _supPalI = 0;
    for (const s of _supSegs) s.pal = s.members.size ? _SUP_PAL[_supPalI++ % _SUP_PAL.length] : null;
    const _supActive = _supSegs.filter(s => s.members.size);
    const _supMulti = _supActive.length > 1;
    const _supSegLbl = s => {
        const fi = s.idx[0], li = s.idx[s.idx.length - 1];
        return fi === li ? _SUP_ABBR[fi] : `${_SUP_ABBR[fi]}–${_SUP_ABBR[li]}`;
    };
    const _supportBarHtml = _supActive.length
        ? `<div class="cal-support-bar">
               <span class="cal-support-bar-icon">🎧</span>
               <span class="cal-support-bar-label">Support</span>
               ${_supActive.map((seg, i) =>
                   `${i > 0 ? '<span class="cal-support-seg-div">·</span>' : ''}`
                   + `<span class="cal-support-seg"${seg.pal ? ` style="--seg-chip-bg:${seg.pal.chipBg};--seg-chip-border:${seg.pal.chipBorder};--seg-chip-color:${seg.pal.chipColor};--seg-range-color:${seg.pal.rangeColor}"` : ''}>`
                   + (_supMulti ? `<span class="cal-support-seg-range">${_supSegLbl(seg)}</span>` : '')
                   + [...seg.members].map(n => `<span class="cal-support-bar-chip">${esc(n)}</span>`).join('')
                   + `</span>`
               ).join('')}
           </div>`
        : '';

    return `
        <div class="cal-week-hdr">
            <div class="cal-week-hdr-left">
                <span>📅 Semaine du ${_fmtDay(mon)} au ${_fmtDay(sun)}</span>
                <span class="cal-week-offset-chip${weekOffset === 0 ? ' cal-week-offset-chip--today' : ''}">${esc(weekLabel)}</span>
            </div>
            <div class="cal-week-hdr-actions">
                <div class="cal-week-nav" role="group" aria-label="Navigation semaine">
                    <button aria-label="Semaine précédente (←)" class="btn-icon cal-week-nav-btn" id="cal-week-prev" title="Semaine précédente (←)">‹</button>
                    <button aria-label="Aujourd'hui (T)" class="btn-icon cal-week-nav-today${weekOffset === 0 ? ' cal-week-nav-today--current' : ''}" id="cal-week-today" title="Aujourd'hui (T)" ${weekOffset === 0 ? 'disabled' : ''}>•</button>
                    <button aria-label="Semaine suivante (→)" class="btn-icon cal-week-nav-btn" id="cal-week-next" title="Semaine suivante (→)">›</button>
                </div>
                <button aria-label="Copier la semaine (Slack)" class="btn-icon" id="cal-week-copy" data-week-offset="${weekOffset}" title="Copier la semaine (Slack)">📋</button>
                <button aria-label="Séparer matin / après-midi (14h)" class="btn-icon cal-week-toggle-btn${showPmSplit ? ' is-active' : ''}" id="cal-week-pm-split" title="Séparer matin / après-midi (14h)">🌗${showPmSplit ? '<sup class="cal-toggle-check">✓</sup>' : ''}</button>
                <button aria-label="Mode compact — titres seulement (survol pour détails)" class="btn-icon cal-week-toggle-btn${showCompact ? ' is-active' : ''}" id="cal-week-compact" title="Mode compact — titres seulement (survol pour détails)">≡${showCompact ? '<sup class="cal-toggle-check">✓</sup>' : ''}</button>
                ${_renderTeamPickerToggle(teamSelection)}
                <button aria-label="${esc(syncTip)}" class="btn-icon" id="cal-week-sync" title="${esc(syncTip)}">
                    <svg class="icon"><use href="#i-sync"/></svg>
                </button>
                <button aria-label="Fermer (Échap)" class="btn-icon" id="cal-week-close" title="Fermer (Échap)"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
        </div>
        ${_renderSprintBar(mon, sun)}
        ${_supportBarHtml}
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
