/**
 * Sprint board view - 3 modes, quick filters, support banner, daily activity,
 * burndown/burnup/CFD/flow charts.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, filterByTeam, filterByMine, sumBy, pct, progressColor, fmtDate, fmtRelative, sortTickets, initials, hashColor, toast, getSprintForTeam, isBufferItem, countBlocked, typeBadge, statusBadge, computeStageAgeRefs } from '../utils.js';
import { renderActivityCard, bindActivityClicks } from '../components/activity.js';
import { STATUS_ORDER, STATUS_LABELS, WIP_LIMITS } from '../config.js';
import { renderCard, bindCardClicks } from '../components/card.js';
import { renderBoardChartsSection, mountBoardCharts } from '../components/board_charts.js';
import { getSprintTicketsAsync } from '../components/sprint_tickets_modal.js';

// Cache des tickets fetchés depuis JIRA pour un sprint passé sélectionné via le picker.
// Key = `${team || 'all'}::${sprintName}`. Vide tant que le sprint actif est affiché.
const _pastSprintFetched = new Map();
const _pastSprintInflight = new Set();

// Persisted state
let _boardMode = localStorage.getItem('sb-board-mode') || 'columns';
// Initialisé depuis sessionStorage au premier render (anciennement séparé en view-search-bar
// et qf-search — on a fusionné : qf-search est désormais l'unique champ recherche)
let _qfText = sessionStorage.getItem('sprint-qfText') || sessionStorage.getItem('sprint-search') || '';
let _qfFilter = null; // 'blocked' | 'unassigned' | 'critical' | null
let _chartsCollapsed = localStorage.getItem('sb-charts-collapsed') === 'true';
let _chartsMounted = false; // évite un double-montage Chart.js si la section est repliée/dépliée sans re-render complet
let _sprintContainer = null; // référence au conteneur pour _refreshBoard
// Contexte du board pour _refreshBoard : mêmes filtres que le rendu initial (sprint courant + snapshot
// d'un sprint clos le cas échéant), pour ne PAS afficher les tickets d'autres sprints après un refresh.
let _boardCtx = { sprintName: null, pastTickets: null };
// Sprint sélectionné manuellement par l'utilisateur via le sélecteur. null = sprint actif par défaut.
// Persisté dans store.sprintPick (consommé par pushHash → #sprint/<team>/<sprintName>) — lien partageable.
const _getSprintPick = () => store.get('sprintPick') || null;
const _setSprintPick = (name) => store.set('sprintPick', name || null);

// ── Mode "Daily" (déclenché par le bouton "Aller au Daily" de l'infopanel) ─────────────
// Lecture droite → gauche façon flux tiré : on scrolle vers la fin du board (Bloqués/Terminé)
// pour finir le travail en cours avant d'en tirer du nouveau, et on flashe la colonne la plus
// à droite qui a du contenu (priorité aux Bloqués, qui empêchent justement de tirer).
let _dailyPendingScroll = false;
let _dailyPendingHighlight = false;
const DAILY_TIMER_MS = 15 * 60 * 1000;
let _timerVisible = false;
let _timerRunning = false;
let _timerEndAt = 0;          // epoch ms — valide si _timerRunning
let _timerRemainingMs = DAILY_TIMER_MS; // valide si en pause
let _timerInterval = null;
let _timerDoneNotified = false;

/** Déclenché par le bouton "Aller au Daily" : scroll + flash colonne + (re)montre le timer. */
export function enterDailyMode() {
    _dailyPendingScroll = true;
    _dailyPendingHighlight = true;
    if (!_timerVisible) {
        _timerVisible = true;
        _timerRunning = true;
        _timerEndAt = Date.now() + DAILY_TIMER_MS;
        _timerRemainingMs = DAILY_TIMER_MS;
        _timerDoneNotified = false;
    }
}

function _timerMsLeft() {
    return Math.max(0, _timerRunning ? _timerEndAt - Date.now() : _timerRemainingMs);
}

function _fmtTimer(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Câble le widget timer du daily : play/pause, fermeture, tick chaque seconde. */
function _wireDailyTimer(container) {
    clearInterval(_timerInterval);
    const widget = container.querySelector('#daily-timer');
    if (!widget) return;
    const timeEl   = widget.querySelector('#daily-timer-time');
    const toggleEl = widget.querySelector('#daily-timer-toggle');

    const tick = () => {
        const left = _timerMsLeft();
        if (timeEl) timeEl.textContent = _fmtTimer(left);
        widget.classList.toggle('daily-timer--warn', left > 0 && left <= 5 * 60 * 1000);
        widget.classList.toggle('daily-timer--done', left <= 0);
        if (left <= 0 && _timerRunning) {
            _timerRunning = false;
            if (!_timerDoneNotified) { _timerDoneNotified = true; toast('⏰ Daily terminé (15 min)'); }
            if (toggleEl) { toggleEl.textContent = '▶'; toggleEl.title = 'Relancer'; }
        }
    };
    tick();
    _timerInterval = setInterval(tick, 1000);

    toggleEl?.addEventListener('click', e => {
        e.stopPropagation();
        if (_timerRunning) {
            _timerRunning = false;
            _timerRemainingMs = _timerMsLeft();
            toggleEl.textContent = '▶'; toggleEl.title = 'Reprendre';
        } else {
            _timerRunning = true;
            _timerRemainingMs = _timerRemainingMs > 0 ? _timerRemainingMs : DAILY_TIMER_MS;
            _timerEndAt = Date.now() + _timerRemainingMs;
            _timerDoneNotified = false;
            toggleEl.textContent = '⏸'; toggleEl.title = 'Pause';
        }
        tick();
    });
    widget.querySelector('#daily-timer-close')?.addEventListener('click', e => {
        e.stopPropagation();
        _timerVisible = false;
        clearInterval(_timerInterval);
        widget.remove();
    });
}

/** Replie la section graphiques (ex: avant un raccourci "Aller au Daily" — on veut le board, pas les métriques). */
export function collapseCharts() {
    _chartsCollapsed = true;
    localStorage.setItem('sb-charts-collapsed', 'true');
}

export function renderSprint(container) {
    _sprintContainer = container;
    // Mode d'affichage : priorité au hash (store.sprintLayout, posé par applyHash) sinon localStorage.
    const _layoutFromHash = store.get('sprintLayout');
    if (_layoutFromHash && ['columns', 'swimlanes', 'list'].includes(_layoutFromHash)) {
        _boardMode = _layoutFromHash;
    }
    const team = store.get('team');
    const allTickets = store.get('tickets') || [];
    const teamTickets = filterByMine(filterByTeam(allTickets, team));
    // La recherche est désormais centralisée dans _qfText (cf. filter ci-dessous)
    const globalSprintInfo = store.get('sprintInfo');
    const support = store.get('support') || [];
    const absences = store.get('absences') || [];

    // Sprint pour l'équipe sélectionnée : utilise teamSprints[] (sync.js) en priorité,
    // fallback sur la dérivation depuis sprintName des tickets, puis sur le global.
    let sprintInfo = getSprintForTeam(team, globalSprintInfo);
    if (!sprintInfo) {
        // Fallback heuristique : déduire depuis le sprintName le plus fréquent dans les tickets filtrés
        const sprintNames = teamTickets.map(t => t.sprintName).filter(Boolean);
        const sprintNameCounts = {};
        for (const n of sprintNames) sprintNameCounts[n] = (sprintNameCounts[n] || 0) + 1;
        const teamSprintName = Object.entries(sprintNameCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        sprintInfo = teamSprintName ? { ...globalSprintInfo, name: teamSprintName } : globalSprintInfo;
    }
    const activeSprintName = sprintInfo?.name || '';

    // Override si l'utilisateur a choisi un autre sprint dans le sélecteur (PI précédent/courant/suivant)
    const teamSprintsArr = Array.isArray(globalSprintInfo?.teamSprints) ? globalSprintInfo.teamSprints : [];
    const pickedSprintName = _getSprintPick();
    if (pickedSprintName && pickedSprintName !== activeSprintName) {
        const ts = (team && team !== 'all')
            ? teamSprintsArr.filter(s => s.team === team)
            : teamSprintsArr;
        const chosen = ts.find(s => s.name === pickedSprintName);
        if (chosen) {
            sprintInfo = {
                ...globalSprintInfo, ...chosen,
                name: chosen.name, startDate: chosen.startDate, endDate: chosen.endDate, goal: chosen.goal,
            };
        }
    }

    // Filtre par sprint : ne garde que les tickets dont sprintName correspond au sprint courant
    // (évite d'afficher les tickets de sprints futurs/passés ou de sprints PI-named comme "PI30").
    // Si le sprint n'a pas de nom (cas dégradé), on conserve tout pour ne pas tout masquer.
    let tickets = sprintInfo?.name
        ? teamTickets.filter(t => (t.sprintName || '') === sprintInfo.name)
        : teamTickets;

    // ── Sprint passé sélectionné via le picker : injecter le snapshot JIRA (lazy fetch) ──
    // Pour un sprint clos, la base locale ne reflète que les tickets DONE qui sont restés
    // taggés avec ce sprint — les "à reporter" ont été retaggés sur le sprint suivant.
    // → On fetch JIRA pour avoir la photo à la clôture (Done + reportés), via cache partagé
    // avec la modal Sprint Tickets (getSprintTicketsAsync).
    let pastSprintLoading = false;
    let _usingPastSnapshot = false;
    const _isPickedClosedSprint = pickedSprintName
        && pickedSprintName !== activeSprintName
        && sprintInfo?.name
        && (sprintInfo.state === 'closed' || (sprintInfo.state !== 'future' && tickets.length === 0));
    if (_isPickedClosedSprint) {
        const cacheKey = `${team || 'all'}::${sprintInfo.name}`;
        if (_pastSprintFetched.has(cacheKey)) {
            tickets = _pastSprintFetched.get(cacheKey);
            _usingPastSnapshot = true;
        } else if (
            !_pastSprintInflight.has(cacheKey)
            && store.get('jiraConfigured')
            && (sprintInfo.jiraId || (sprintInfo.jiraIds || []).length)
        ) {
            _pastSprintInflight.add(cacheKey);
            pastSprintLoading = true;
            getSprintTicketsAsync(sprintInfo).then(arr => {
                _pastSprintInflight.delete(cacheKey);
                _pastSprintFetched.set(cacheKey, arr || []);
                if (_sprintContainer) renderSprint(_sprintContainer);
            });
        } else if (_pastSprintInflight.has(cacheKey)) {
            pastSprintLoading = true;
        }
    }

    // ── Liste des sprints sélectionnables (PI N-1 + N + N+1) pour le sélecteur en haut ──
    const _extractPi = (name) => {
        const m = String(name || '').match(/(\d+)\.\d+/) || String(name || '').match(/PI\s*#?\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    const activePi = _extractPi(activeSprintName);
    const sprintCandidates = (() => {
        const teamFiltered = (team && team !== 'all')
            ? teamSprintsArr.filter(s => s.team === team)
            : teamSprintsArr;
        // Dédup par nom si team='all'
        const seen = new Map();
        for (const s of teamFiltered) {
            const k = (s.name || '').toLowerCase();
            if (!seen.has(k) || s.state === 'active') seen.set(k, s);
        }
        return [...seen.values()]
            .filter(s => {
                if (!activePi) return true;
                const pi = _extractPi(s.name);
                return pi >= activePi - 1 && pi <= activePi + 1;
            })
            .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
    })();

    // Quick filter
    const blocked = countBlocked(tickets);
    const unassigned = tickets.filter(t => !t.leader && !t.assignee).length;
    const critical = tickets.filter(t => t.priority === 'critical' || t.priority === 'high').length;

    // Mémorise le contexte pour _refreshBoard (mêmes filtres que ce rendu initial : sprint courant,
    // ou snapshot JIRA figé si sprint clos) → évite d'afficher des tickets d'autres sprints au refresh.
    _boardCtx = { sprintName: sprintInfo?.name || null, pastTickets: _usingPastSnapshot ? tickets : null };

    // Apply active quick filter
    let filtered = tickets;
    if (_qfFilter === 'blocked') filtered = tickets.filter(t => t.status === 'blocked');
    else if (_qfFilter === 'unassigned') filtered = tickets.filter(t => !t.leader && !t.assignee);
    else if (_qfFilter === 'critical') filtered = tickets.filter(t => t.priority === 'critical' || t.priority === 'high');
    if (_qfText) {
        const q = _qfText.toLowerCase().trim();
        // Index parent pour résoudre l'Epic et la Feature en O(1) par ticket
        const epicsById    = new Map((store.get('epics')    || []).map(e => [e.id, e]));
        const featuresById = new Map((store.get('features') || []).map(f => [f.id, f]));
        const _matchTextual = (s) => (s || '').toLowerCase().includes(q);
        // Vérifie si le PARENT (Epic ou Feature ancêtre) matche le query
        const _matchParent = (t) => {
            if (!t.epic) return false;
            const ep = epicsById.get(t.epic);
            if (!ep) return false;
            if (_matchTextual(ep.id) || _matchTextual(ep.title)) return true;
            // Chaîne ticket → epic → feature
            const ftId = ep.feature_id || ep.feature || ep.featureId;
            if (ftId) {
                const ft = featuresById.get(ftId);
                if (ft && (_matchTextual(ft.id) || _matchTextual(ft.title))) return true;
            }
            return false;
        };
        // Élargi : clé, titre, leader/assignee, labels, contributors, parent Epic/Feature
        filtered = filtered.filter(t =>
            _matchTextual(t.id) ||
            _matchTextual(t.title) ||
            _matchTextual(t.leader || t.assignee || '') ||
            (t.labels || []).some(l => _matchTextual(l)) ||
            (t.contributors || []).some(c => _matchTextual(c)) ||
            _matchParent(t)
        );
    }

    const total = tickets.length;
    const done = tickets.filter(t => t.status === 'done').length;
    const totalPts = sumBy(tickets, t => t.points);
    const donePts = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    // % d'avancement : basé sur les story points quand ils sont estimés, sinon repli sur les tickets
    // (évite l'affichage trompeur "Pts: 0/0 (0%)" quand aucun ticket du sprint n'est estimé).
    const hasPts = totalPts > 0;
    const completion = hasPts ? pct(donePts, totalPts) : pct(done, total);
    // sprintCtx : startDate + durationDays calculés à partir du sprint réel pour que
    // les axes x des charts (burndown, burnup, CFD, throughput) s'étendent exactement
    // sur la durée du sprint (premier jour → dernier jour).
    const _sStart = sprintInfo?.startDate ? new Date(sprintInfo.startDate).getTime() : null;
    const _sEnd   = sprintInfo?.endDate   ? new Date(sprintInfo.endDate).getTime()   : null;
    const _realDuration = (_sStart && _sEnd && _sEnd > _sStart)
        ? Math.max(1, Math.round((_sEnd - _sStart) / 86400000) + 1)
        : 14;
    const sprintCtx = {
        startDate: sprintInfo?.startDate || new Date(Date.now() - 8 * 86400000).toISOString(),
        endDate:   sprintInfo?.endDate || null,
        durationDays: _realDuration,
    };
    const events    = store.get('events') || [];

    // Support banner data — regroupé par équipe (les rotations sont par team)
    const now = new Date().toISOString().slice(0, 10);
    const currentSupport = support.filter(s => s.weekStart <= now && s.weekEnd >= now);
    const supportMembers = currentSupport.flatMap(s => (s.members || []).map(m => ({ name: m, team: s.team })));
    const supportByTeam = supportMembers.reduce((acc, m) => {
        const k = m.team || '';
        if (!acc[k]) acc[k] = [];
        acc[k].push(m.name);
        return acc;
    }, {});
    const supportTeamCount = Object.keys(supportByTeam).length;
    // Format court de plage : "5 → 11 juin" si même mois, sinon "28 mai → 3 juin"
    const _shortRange = (a, b) => {
        if (!a || !b) return '';
        const da = new Date(a), db = new Date(b);
        if (isNaN(da) || isNaN(db)) return '';
        const _m = d => d.toLocaleDateString('fr-FR', { month: 'short' }).replace(/\.$/, '');
        return da.getMonth() === db.getMonth()
            ? `${da.getDate()} → ${db.getDate()} ${_m(db)}`
            : `${da.getDate()} ${_m(da)} → ${db.getDate()} ${_m(db)}`;
    };
    // Format compact d'un nom complet : "Jean Dupont" → "Jean D."
    // Mots intermédiaires (particules, multi-prénoms) → on garde seulement le dernier comme initiale
    const _shortName = (n) => {
        const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length <= 1) return parts[0] || '';
        return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
    };

    // Buffer (détection via helper unique isBufferItem)
    const bufferTickets = tickets.filter(isBufferItem);
    const bufferPts = sumBy(bufferTickets, t => t.points);
    const bufferDone = sumBy(bufferTickets.filter(t => t.status === 'done'), t => t.points);

    container.innerHTML = `
        <!-- Sticky zone: banner + header + filters -->
        <div class="sprint-sticky">
            ${supportMembers.length ? `
                <div class="support-banner">
                    <span class="support-banner-icon">🛡️</span>
                    <span><strong>Support</strong></span>
                    <div class="support-banner-members">
                        ${Object.entries(supportByTeam).map(([team, names]) => `
                            <span class="support-team-group${supportTeamCount > 1 ? ' support-team-group--bordered' : ''}" style="${team ? `--team-dot:${hashColor(team)}` : ''}">
                                ${supportTeamCount > 1 && team ? `<span class="support-team-label" style="--team-dot:${hashColor(team)}" title="Équipe ${esc(team)}">${esc(team.slice(0, 2).toUpperCase())}</span>` : ''}
                                ${names.map(n => `<span class="chip inline-flex-center support-member-chip" title="${esc(n)}"><span class="assignee-avatar" style="background:${hashColor(n)};color:white;width:16px;height:16px;font-size:7px">${esc(initials(n))}</span>${esc(_shortName(n))}</span>`).join('')}
                            </span>
                        `).join('')}
                    </div>
                    ${currentSupport[0] ? `<span class="support-banner-dates" title="${fmtDate(currentSupport[0].weekStart)} → ${fmtDate(currentSupport[0].weekEnd)}">${esc(_shortRange(currentSupport[0].weekStart, currentSupport[0].weekEnd))}</span>` : ''}
                </div>
            ` : ''}

            ${sprintCandidates.length > 1 ? `
            <div class="sprint-picker" title="Sélectionnez un sprint des PI ${activePi - 1} / ${activePi} / ${activePi + 1}">
                <label for="sprint-picker-select" class="sprint-picker-label">📌 Sprint :</label>
                <select id="sprint-picker-select" class="select select-sm sprint-picker-select">
                    ${(() => {
                        // Grouper par PI pour <optgroup>
                        const byPi = new Map();
                        for (const s of sprintCandidates) {
                            const pi = _extractPi(s.name) || 0;
                            if (!byPi.has(pi)) byPi.set(pi, []);
                            byPi.get(pi).push(s);
                        }
                        const _piLbl = (pi) => pi === activePi ? `PI ${pi} · courant`
                                            : pi === activePi - 1 ? `PI ${pi} · précédent`
                                            : pi === activePi + 1 ? `PI ${pi} · à venir`
                                            : `PI ${pi}`;
                        const _stateBadge = (s) => s.state === 'active' ? ' ● ' : s.state === 'closed' ? ' ✓ ' : s.state === 'future' ? ' ○ ' : ' ';
                        return [...byPi.entries()].sort((a, b) => a[0] - b[0]).map(([pi, list]) =>
                            `<optgroup label="${_piLbl(pi)}">${list.map(s =>
                                `<option value="${esc(s.name)}"${s.name === sprintInfo?.name ? ' selected' : ''}>${_stateBadge(s)}${esc(s.name)}</option>`
                            ).join('')}</optgroup>`
                        ).join('');
                    })()}
                </select>
                ${pickedSprintName && pickedSprintName !== activeSprintName ? `<button class="btn btn-sm btn-ghost sprint-picker-reset" id="sprint-picker-reset" title="Revenir au sprint actif">↺ Sprint actif (${esc(activeSprintName)})</button>` : ''}
                ${pastSprintLoading ? `<span class="sprint-picker-loading" title="Chargement des tickets de ce sprint depuis JIRA"><span class="sprint-picker-spinner"></span> Chargement JIRA…</span>` : ''}
            </div>` : ''}

            <!-- Sprint header en 2 colonnes : info+goal (gauche) / stats+progress (droite) -->
            <div class="sprint-header sprint-header--2col">
                <div class="sprint-header-col sprint-header-col--info">
                    <div class="sprint-info">
                        <span class="sprint-name">${esc(sprintInfo?.name || 'Sprint')}</span>
                        ${sprintInfo?.startDate ? `<span class="sprint-dates">${fmtDate(sprintInfo.startDate)} → ${fmtDate(sprintInfo.endDate)}</span>` : ''}
                    </div>
                    ${sprintInfo?.goal ? `<div class="sprint-goal-bar" title="Objectif de sprint">
                        <span class="sprint-goal-icon" aria-label="Objectif de sprint">🎯</span>
                        <span class="sprint-goal-text">${esc(sprintInfo.goal)}</span>
                    </div>` : ''}
                </div>
                <div class="sprint-header-col sprint-header-col--stats">
                    <div class="sprint-stats">
                        ${hasPts
                            ? `<div class="sprint-stat">Pts: <strong>${donePts}/${totalPts}</strong> (${completion}%)</div>
                        <div class="sprint-stat">Tickets: <strong>${done}/${total}</strong></div>`
                            : `<div class="sprint-stat">Tickets: <strong>${done}/${total}</strong> (${completion}%)</div>
                        <div class="sprint-stat sprint-stat--muted" title="Aucun story point estimé sur ce sprint">Pts non estimés</div>`}
                        ${bufferPts ? `<div class="sprint-stat">Buffer: <strong>${bufferDone}/${bufferPts}</strong></div>` : ''}
                    </div>
                    <div class="sprint-quick-actions">
                        ${_timerVisible ? `
                        <div class="daily-timer" id="daily-timer">
                            <span class="daily-timer-icon">⏱</span>
                            <span class="daily-timer-time" id="daily-timer-time">${_fmtTimer(_timerMsLeft())}</span>
                            <button class="daily-timer-toggle" id="daily-timer-toggle" type="button" title="${_timerRunning ? 'Pause' : 'Reprendre'}">${_timerRunning ? '⏸' : '▶'}</button>
                            <button class="daily-timer-close" id="daily-timer-close" type="button" title="Fermer">✕</button>
                        </div>` : ''}
                        <button class="btn btn-sm btn-secondary" id="sprint-open-review" title="Compte-rendu Sprint Review (Confluence-ready)">📋 Review</button>
                        <button class="btn btn-sm btn-primary" id="sprint-open-demo" title="Mode Démo fullscreen (présentation TV)">📺 Demo</button>
                    </div>
                </div>
                <div class="progress progress-inline-lg sprint-progress-full" title="${completion}% terminé"><div class="progress-bar ${progressColor(completion)}" style="width:${completion}%"></div></div>
            </div>
        </div>

        <!-- Charts (collapsible) — composant partagé Scrum/Kanban -->
        ${renderBoardChartsSection({ collapsed: _chartsCollapsed, sectionId: 'charts-section' })}

        <!-- Filtres & modes d'affichage — juste au-dessus du board (contrôlent directement les cartes) -->
        <div class="sprint-filter-row">
            <div class="quick-filters">
                <button class="qf-btn${_qfFilter === 'blocked' ? ' active' : ''}" data-qf="blocked">🚫 Bloqués <span class="qf-count">${blocked}</span></button>
                <button class="qf-btn${_qfFilter === 'unassigned' ? ' active' : ''}" data-qf="unassigned">👤 Non assignés <span class="qf-count">${unassigned}</span></button>
                <button class="qf-btn${_qfFilter === 'critical' ? ' active' : ''}" data-qf="critical">🔴 Critique/High <span class="qf-count">${critical}</span></button>
                <input class="qf-search" id="qf-text" placeholder="🔍 Filtrer : clé, titre, leader, label, contributeur, Epic/Feature parente…" value="${esc(_qfText)}" autocomplete="off">
                ${_qfFilter || _qfText ? `<span class="qf-clear" id="qf-clear" title="Effacer les filtres">✕</span>` : ''}
                <span class="qf-shown" id="qf-shown" hidden></span>
            </div>
            <div class="board-modes">
                <button class="board-mode-btn${_boardMode === 'columns' ? ' active' : ''}" data-mode="columns" title="Colonnes">▤</button>
                <button class="board-mode-btn${_boardMode === 'swimlanes' ? ' active' : ''}" data-mode="swimlanes" title="Swimlanes">☰</button>
                <button class="board-mode-btn${_boardMode === 'list' ? ' active' : ''}" data-mode="list" title="Liste">≡</button>
            </div>
        </div>

        <!-- Board -->
        <div id="board-container"></div>

        <!-- Recent Activity (composant partagé) -->
        ${renderActivityCard(tickets, { max: 20, scope: 'sprint' })}
    `;

    // ── Wire events ───────────────────────────────────────────────────────────
    // Sprint Review / Demo — délégué aux helpers exposés sur window.__squadBoard
    container.querySelector('#sprint-open-review')?.addEventListener('click', () =>
        window.__squadBoard?.openCurrentSprintReview?.());
    container.querySelector('#sprint-open-demo')?.addEventListener('click', () =>
        window.__squadBoard?.openCurrentSprintDemo?.());

    // Sélecteur de sprint (PI N-1 / N / N+1) — synchronise store.sprintPick + hash
    container.querySelector('#sprint-picker-select')?.addEventListener('change', (e) => {
        const v = e.target.value;
        _setSprintPick(v && v !== activeSprintName ? v : null);
        window.__squadBoard?.pushHash?.();
        renderSprint(container);
    });
    container.querySelector('#sprint-picker-reset')?.addEventListener('click', () => {
        _setSprintPick(null);
        window.__squadBoard?.pushHash?.();
        renderSprint(container);
    });

    // Quick filters - mise à jour ciblée, sans toucher le filtre texte
    container.querySelectorAll('.qf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _qfFilter = _qfFilter === btn.dataset.qf ? null : btn.dataset.qf;
            container.querySelectorAll('.qf-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.qf === _qfFilter));
            _syncClearBtn(container);
            _refreshBoard(container);
        });
    });
    // qf-search : input élargi (clé, titre, leader, label, contributors), persisté en sessionStorage
    container.querySelector('#qf-text')?.addEventListener('input', e => {
        _qfText = e.target.value;
        sessionStorage.setItem('sprint-qfText', _qfText);
        _syncClearBtn(container);
        _refreshBoard(container); // pas de re-render complet → focus préservé
    });
    container.querySelector('#qf-clear')?.addEventListener('click', () => {
        _qfFilter = null; _qfText = '';
        sessionStorage.removeItem('sprint-qfText');
        container.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
        _syncClearBtn(container);
        _refreshBoard(container);
    });

    // Board modes (colonnes / swimlanes / liste) — le mode est aussi reflété dans le hash
    // (#sprint/<team>/[pick/]<mode>, mode "columns" par défaut omis) → lien partageable.
    container.querySelectorAll('.board-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _boardMode = btn.dataset.mode;
            localStorage.setItem('sb-board-mode', _boardMode);
            store.set('sprintLayout', _boardMode);
            container.querySelectorAll('.board-mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.mode === _boardMode));
            window.__squadBoard?.pushHash?.();
            _refreshBoard(container);
        });
    });

    // Charts collapse state — si on déplie une section jamais montée (ex: arrivée avec
    // collapseCharts() forcé), on monte les graphiques à la demande plutôt que de laisser
    // les canvas vides jusqu'au prochain re-render complet.
    container.querySelector('#charts-section')?.addEventListener('toggle', e => {
        _chartsCollapsed = !e.target.open;
        localStorage.setItem('sb-charts-collapsed', _chartsCollapsed);
        if (e.target.open && !_chartsMounted) { mountBoardCharts(tickets, sprintCtx, events); _chartsMounted = true; }
    });

    // ── Render board mode ─────────────────────────────────────────────────────
    const boardContainer = container.querySelector('#board-container');
    if (_boardMode === 'list') renderListView(boardContainer, filtered);
    else if (_boardMode === 'swimlanes') renderSwimlaneView(boardContainer, filtered);
    else renderColumnView(boardContainer, filtered);

    bindCardClicks(container);
    wireDragDrop(boardContainer);
    _updateShownCount(container, filtered.length, tickets.length);

    // ── Mode Daily : scroll droite→gauche (flux tiré) + flash de la colonne prioritaire ───
    if (_boardMode === 'columns' && (_dailyPendingScroll || _dailyPendingHighlight)) {
        const board = boardContainer.querySelector('.board');
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (board && _dailyPendingScroll) {
            requestAnimationFrame(() => board.scrollTo({ left: board.scrollWidth, behavior: reduce ? 'auto' : 'smooth' }));
        }
        if (board && _dailyPendingHighlight) {
            // Priorité : Bloqués (ce qui empêche de tirer le flux), sinon la colonne non-vide la plus à droite.
            const cols = [...board.querySelectorAll('.board-column:not(.board-column--empty)')];
            const target = cols.find(c => c.querySelector('.column-header.col-blocked')) || cols[cols.length - 1];
            if (target) {
                target.classList.add('board-column--daily-pulse');
                setTimeout(() => target.classList.remove('board-column--daily-pulse'), 2600);
            }
        }
        _dailyPendingScroll = false;
        _dailyPendingHighlight = false;
    }

    // ── Activity feed (composant partagé avec Dashboard/Kanban) ─────────────
    bindActivityClicks(container);

    // ── Render charts (composant partagé Scrum/Kanban) ──────────────────────────
    _chartsMounted = !_chartsCollapsed;
    if (_chartsMounted) mountBoardCharts(tickets, sprintCtx, events);

    // ── Widget timer Daily ───────────────────────────────────────────────────
    _wireDailyTimer(container);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers filtre / refresh ciblé

/** Affiche/masque le bouton ✕ selon l'état courant des filtres. */
function _syncClearBtn(container) {
    const clear = container.querySelector('#qf-clear');
    if (!clear) return;
    clear.style.display = (_qfFilter || _qfText) ? '' : 'none';
}

/**
 * Met à jour uniquement #board-container sans recréer le reste du DOM.
 * Préserve le focus et la valeur de l'input de filtre.
 */
function _refreshBoard(container) {
    const boardEl = container.querySelector('#board-container');
    if (!boardEl) return;
    // Base IDENTIQUE au rendu initial (bug historique : on repartait de store.tickets filtrés seulement
    // par équipe → tous les sprints s'affichaient, dont des Done de sprints passés). Ici : snapshot JIRA
    // d'un sprint clos, sinon tickets live filtrés équipe + « Mes tickets » + sprint courant.
    let base;
    if (_boardCtx.pastTickets) {
        base = _boardCtx.pastTickets;
    } else {
        base = filterByMine(filterByTeam(store.get('tickets') || [], store.get('team')));
        if (_boardCtx.sprintName) base = base.filter(t => (t.sprintName || '') === _boardCtx.sprintName);
    }
    let filtered = base;
    if (_qfFilter === 'blocked')    filtered = base.filter(t => t.status === 'blocked');
    else if (_qfFilter === 'unassigned') filtered = base.filter(t => !t.leader && !t.assignee);
    else if (_qfFilter === 'critical')   filtered = base.filter(t => t.priority === 'critical' || t.priority === 'high');
    if (_qfText) {
        const q = _qfText.toLowerCase().trim();
        // Aligné sur renderSprint : matche clé, titre, leader, labels, contributors,
        // ainsi que l'Epic parent et sa Feature ancêtre (chaîne ticket → epic → feature)
        const epicsById    = new Map((store.get('epics')    || []).map(e => [e.id, e]));
        const featuresById = new Map((store.get('features') || []).map(f => [f.id, f]));
        const _m = (s) => (s || '').toLowerCase().includes(q);
        const _matchParent = (t) => {
            if (!t.epic) return false;
            const ep = epicsById.get(t.epic);
            if (!ep) return false;
            if (_m(ep.id) || _m(ep.title)) return true;
            const ftId = ep.feature_id || ep.feature || ep.featureId;
            if (ftId) {
                const ft = featuresById.get(ftId);
                if (ft && (_m(ft.id) || _m(ft.title))) return true;
            }
            return false;
        };
        filtered = filtered.filter(t =>
            _m(t.id) || _m(t.title) || _m(t.leader || t.assignee || '') ||
            (t.labels || []).some(l => _m(l)) ||
            (t.contributors || []).some(c => _m(c)) ||
            _matchParent(t)
        );
    }
    if (_boardMode === 'list')       renderListView(boardEl, filtered);
    else if (_boardMode === 'swimlanes') renderSwimlaneView(boardEl, filtered);
    else                             renderColumnView(boardEl, filtered);
    bindCardClicks(container);
    wireDragDrop(boardEl);
    _updateShownCount(container, filtered.length, base.length);
}

// Compteur "X / Y affichés" dans la barre de filtres — visible seulement quand un filtre rapide ou
// une recherche masque des cartes (rend explicite ce qui est caché, écho au piège du filtre invisible).
function _updateShownCount(container, shown, total) {
    const el = container.querySelector('#qf-shown');
    if (!el) return;
    if ((_qfFilter || _qfText) && total > 0) {
        el.textContent = `${shown} / ${total} affiché${shown > 1 ? 's' : ''}`;
        el.hidden = false;
    } else {
        el.hidden = true;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Board Modes
/**
 * Retourne les colonnes à afficher sous forme de tableau { key, label, jiraStatuses }.
 * - Équipe sélectionnée → tableau boardColumns[team] (toutes les colonnes JIRA, y compris doublons)
 * - Toutes équipes → union dédupliquée par label
 * - Fallback → STATUS_ORDER complet
 */
function _activeColumns() {
    const team = store.get('team');
    const allCols = store.get('boardColumns') || {};
    if (team && team !== 'all') {
        const cols = allCols[team];
        if (Array.isArray(cols) && cols.length) return cols;
    } else if (Object.keys(allCols).length) {
        const seen = new Map();
        for (const cols of Object.values(allCols)) {
            if (!Array.isArray(cols)) continue;
            for (const col of cols) {
                const k = `${col.key}|${col.label}`;
                if (!seen.has(k)) seen.set(k, col);
            }
        }
        const merged = [...seen.values()];
        merged.sort((a, b) => STATUS_ORDER.indexOf(a.key) - STATUS_ORDER.indexOf(b.key));
        return merged;
    }
    // Fallback : STATUS_ORDER complet comme objets simples
    return STATUS_ORDER.map(s => ({ key: s, label: STATUS_LABELS[s], jiraStatuses: [] }));
}

/** Label d'affichage pour un statut interne (utilisé dans la vue liste). */
function _colLabel(status) {
    const col = _activeColumns().find(c => c.key === status);
    return col ? col.label : STATUS_LABELS[status] || status;
}

/** Normalise un label pour comparaison : lowercase + suppression des accents. */
function _normLabel(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Assigne les tickets à une colonne, par ordre de priorité :
 * 1. _jiraStatus normalisé = label de colonne normalisé (override board config)
 * 2. _jiraStatus dans jiraStatuses de la colonne (board config)
 * 3. Fallback status interne, uniquement si _jiraStatus non réclamé ailleurs
 */
function _ticketsForCol(col, tickets, allCols) {
    const colNorm = _normLabel(col.label);
    if (col.jiraStatuses && col.jiraStatuses.length) {
        return tickets.filter(t => {
            const stNorm = _normLabel(t._jiraStatus);
            // Priorité 1 : le _jiraStatus correspond exactement au label de cette colonne
            if (stNorm && stNorm === colNorm) return true;
            // Si une autre colonne réclame ce _jiraStatus via son label, ne pas le voler
            if (stNorm && allCols?.some(c => c !== col && _normLabel(c.label) === stNorm)) return false;
            // Priorité 2 : board config
            if (col.jiraStatuses.includes(t._jiraStatus || '')) return true;
            // Priorité 3 : fallback statut interne si non réclamé dans aucun jiraStatuses
            if (t._jiraStatus && allCols?.some(c => c.jiraStatuses?.includes(t._jiraStatus))) return false;
            return t.status === col.key;
        });
    }
    return tickets.filter(t => t.status === col.key);
}

// ═══════════════════════════════════════════════════════════════════════════════

// Repères d'ancienneté par colonne (P50/P85), calculés sur l'HISTORIQUE COMPLET de l'équipe
// (pas seulement le sprint affiché, souvent trop peu de tickets terminés). Sert à colorer l'âge
// des cartes du board (cf card.js _dwellChip). Recalculé à chaque rendu — peu coûteux.
function _boardAgeRefs() {
    try {
        const all = filterByTeam(store.get('tickets') || [], store.get('team'));
        return computeStageAgeRefs(all);
    } catch { return null; }
}

function renderColumnView(el, tickets) {
    const activeCols = _activeColumns();
    const ageRefs = _boardAgeRefs();
    // Déduplication : un ticket ne peut apparaître que dans une seule colonne
    const seen = new Set();
    const colItems = activeCols.map(col => {
        const items = sortTickets(_ticketsForCol(col, tickets, activeCols).filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
        }));
        return { col, items };
    });

    el.innerHTML = `<div class="board">${colItems.map(({ col, items }) => {
        const empty = items.length === 0;
        const colPts = sumBy(items, t => t.points);
        const wip = WIP_LIMITS[col.key];
        const exceeded = wip > 0 && items.length > wip;
        if (empty) {
            return `<div class="board-column board-column--empty"><div class="column-header col-${col.key}"><span class="col-label-text">${esc(col.label)}</span><span class="column-count">0</span></div><div class="column-cards"></div></div>`;
        }
        return `<div class="board-column"><div class="column-header col-${col.key}"><span>${esc(col.label)}</span><span class="column-count${exceeded ? ' wip-exceeded' : ''}">${items.length}${wip ? '/' + wip : ''}${colPts ? ' · ' + colPts + 'pts' : ''}</span></div><div class="column-cards">${items.map(t => renderCard(t, { ageRefs })).join('')}</div></div>`;
    }).join('')}</div>`;
}

function renderListView(el, tickets) {
    const sorted = sortTickets(tickets);
    el.innerHTML = `
        <div class="board-list-header"><span>ID</span><span>Titre</span><span>Type</span><span>Statut</span><span>Assigne</span><span>Equipe</span><span>Pts</span></div>
        <div class="board-list">${sorted.map(t => `
            <div class="board-list-row${t.flagged ? ' flagged' : ''}" data-ticket-id="${esc(t.id)}">
                <span class="ticket-id">${esc(t.id)}</span>
                <span class="truncate">${esc(t.title)}</span>
                <span>${typeBadge(t.type)}</span>
                <span>${statusBadge(t, { label: t.jiraStatus || _colLabel(t.status), attrs: `title="${esc((STATUS_LABELS[t.status] || t.status))} (interne)"`, title: false })}</span>
                <span class="board-list-assignee text-xs">${(() => {
                    const a = t.leader || t.assignee;
                    return a
                        ? `<span class="assignee-avatar" style="background:${hashColor(a)};color:white;width:20px;height:20px;font-size:8px" title="${esc(a)}">${esc(initials(a))}</span>`
                        : '<span class="text-muted">-</span>';
                })()}</span>
                <span class="text-xs text-muted">${esc(t.team || '-')}</span>
                <span class="text-xs font-semibold">${t.points || '-'}</span>
            </div>
        `).join('')}</div>
    `;
    el.querySelectorAll('.board-list-row').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticketId));
    });
}

function renderSwimlaneView(el, tickets) {
    const ageRefs = _boardAgeRefs();
    const byAssignee = new Map();
    for (const t of tickets) {
        const key = t.leader || t.assignee || 'Non assigne';
        if (!byAssignee.has(key)) byAssignee.set(key, []);
        byAssignee.get(key).push(t);
    }
    // Sort: assignees with most tickets first, "Non assigne" last
    const lanes = [...byAssignee.entries()].sort((a, b) => {
        if (a[0] === 'Non assigne') return 1;
        if (b[0] === 'Non assigne') return -1;
        return b[1].length - a[1].length;
    });

    el.innerHTML = `<div class="board-swimlanes">${lanes.map(([name, items]) => {
        const pts = sumBy(items, t => t.points);
        const d = items.filter(t => t.status === 'done').length;
        const activeCols = _activeColumns();
        const seenSw = new Set();
        return `<div class="swimlane"><div class="swimlane-header" data-lane="${esc(name)}"><span class="inline-flex-center"><span class="assignee-avatar" style="background:${hashColor(name)};color:white;width:20px;height:20px;font-size:8px">${esc(initials(name))}</span>${esc(name)} <span class="text-xs text-muted">(${items.length} tickets, ${pts} pts, ${d} done)</span></span><svg class="icon icon-sm"><use href="#i-chevron-down"/></svg></div><div class="swimlane-body"><div class="board" class="board-compact">${activeCols.map(col => {
            const si = _ticketsForCol(col, items, activeCols).filter(t => { if (seenSw.has(t.id)) return false; seenSw.add(t.id); return true; });
            return si.length ? `<div class="board-column" class="board-column-narrow"><div class="column-header col-${col.key}"><span>${esc(col.label)}</span><span class="column-count">${si.length}</span></div><div class="column-cards">${si.map(t => renderCard(t, { ageRefs })).join('')}</div></div>` : '';
        }).join('')}</div></div></div>`;
    }).join('')}</div>`;

    // Swimlane collapse toggle
    el.querySelectorAll('.swimlane-header').forEach(h => {
        h.addEventListener('click', () => {
            const body = h.nextElementSibling;
            body?.classList.toggle('collapsed');
            const icon = h.querySelector('.icon');
            if (icon) icon.style.transform = body?.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Drag & Drop
// ═══════════════════════════════════════════════════════════════════════════════

function wireDragDrop(container) {
    let draggedId = null;

    container.addEventListener('dragstart', e => {
        const card = e.target.closest('.ticket-card');
        if (!card) return;
        draggedId = card.dataset.ticketId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
    });

    container.addEventListener('dragend', e => {
        const card = e.target.closest('.ticket-card');
        card?.classList.remove('dragging');
        container.querySelectorAll('.column-cards').forEach(c => c.classList.remove('drag-over'));
        draggedId = null;
    });

    container.addEventListener('dragover', e => {
        const col = e.target.closest('.column-cards');
        if (!col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
    });

    container.addEventListener('dragleave', e => {
        const col = e.target.closest('.column-cards');
        if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });

    container.addEventListener('drop', async e => {
        e.preventDefault();
        const col = e.target.closest('.column-cards');
        if (!col || !draggedId) return;
        col.classList.remove('drag-over');

        // Find target status from column header
        const column = col.closest('.board-column');
        const header = column?.querySelector('.column-header');
        const targetStatus = STATUS_ORDER.find(s => header?.classList.contains(`col-${s}`));
        if (!targetStatus) return;

        try {
            await api.updateTicket(draggedId, { status: targetStatus });
            // Reload data and re-render
            const tickets = await api.getTickets();
            store.set('tickets', tickets);
            toast(`${draggedId} → ${_colLabel(targetStatus)}`, 'success');
            if (_sprintContainer) _refreshBoard(_sprintContainer);
            else window.__squadBoard?.rerenderView?.();
        } catch (err) {
            toast(`Erreur: ${err.message}`, 'error');
        }
    });
}

