/**
 * Sprint board view - 3 modes, quick filters, support banner, daily activity,
 * alerts, burndown/burnup/CFD/flow charts.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, filterByTeam, filterByMine, sumBy, pct, progressColor, fmtDate, fmtRelative, sortTickets, initials, hashColor, toast, getSprintForTeam } from '../utils.js';
import { renderActivityList, bindActivityClicks } from '../components/activity.js';
import { STATUS_ORDER, STATUS_LABELS, WIP_LIMITS, TYPE_LABELS } from '../config.js';
import { renderCard, bindCardClicks } from '../components/card.js';
import { renderBurndown, renderBurnup, renderCFD, renderThroughput, renderCycleTime, renderWIPAge } from '../components/charts.js';
import { getSprintAlerts } from '../components/infopanel.js';
import { renderCalBanner } from '../components/cal_banner.js';
import { openAlertModal } from '../components/alert_modal.js';
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
let _sprintContainer = null; // référence au conteneur pour _refreshBoard
// Sprint sélectionné manuellement par l'utilisateur via le sélecteur. null = sprint actif par défaut.
// Persisté dans store.sprintPick (consommé par pushHash → #sprint/<team>/<sprintName>) — lien partageable.
const _getSprintPick = () => store.get('sprintPick') || null;
const _setSprintPick = (name) => store.set('sprintPick', name || null);

export function renderSprint(container) {
    _sprintContainer = container;
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
    const _isPickedClosedSprint = pickedSprintName
        && pickedSprintName !== activeSprintName
        && sprintInfo?.name
        && (sprintInfo.state === 'closed' || (sprintInfo.state !== 'future' && tickets.length === 0));
    if (_isPickedClosedSprint) {
        const cacheKey = `${team || 'all'}::${sprintInfo.name}`;
        if (_pastSprintFetched.has(cacheKey)) {
            tickets = _pastSprintFetched.get(cacheKey);
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
    const blocked = tickets.filter(t => t.status === 'blocked').length;
    const unassigned = tickets.filter(t => !t.leader && !t.assignee).length;
    const critical = tickets.filter(t => t.priority === 'critical' || t.priority === 'high').length;

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
    const completion = pct(donePts, totalPts);
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

    // Alerts
    const alerts = getSprintAlerts(tickets, sprintInfo);

    // Buffer
    const bufferTickets = tickets.filter(t => (t.labels || []).some(l => l.toLowerCase().includes('buffer')));
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

            <div id="cal-banner-wrap"></div>

            ${alerts.length ? `<div class="alert-bar">${alerts.map(a => {
                const clickable = !!a.actionable;
                const cls = `alert-item alert-${a.type}${clickable ? ' alert-item--clickable' : ''}`;
                const attr = clickable ? ` data-alert-action="${esc(a.actionable)}" title="Cliquer pour agir sur ces tickets" role="button" tabindex="0"` : '';
                const cta = clickable ? '<span class="alert-item-cta" aria-hidden="true">→</span>' : '';
                return `<div class="${cls}"${attr}>${esc(a.text)}${cta}</div>`;
            }).join('')}</div>` : ''}

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
                    ${sprintInfo?.goal ? `<div class="sprint-goal-bar"><span class="text-sm"><strong>🎯 Objectif :</strong> ${esc(sprintInfo.goal)}</span></div>` : ''}
                </div>
                <div class="sprint-header-col sprint-header-col--stats">
                    <div class="sprint-stats">
                        <div class="sprint-stat">Pts: <strong>${donePts}/${totalPts}</strong> (${completion}%)</div>
                        <div class="sprint-stat">Tickets: <strong>${done}/${total}</strong></div>
                        ${bufferPts ? `<div class="sprint-stat">Buffer: <strong>${bufferDone}/${bufferPts}</strong></div>` : ''}
                    </div>
                    <div class="sprint-quick-actions">
                        <button class="btn btn-sm btn-secondary" id="sprint-open-review" title="Compte-rendu Sprint Review (Confluence-ready)">📋 Review</button>
                        <button class="btn btn-sm btn-primary" id="sprint-open-demo" title="Mode Démo fullscreen (présentation TV)">📺 Demo</button>
                    </div>
                </div>
                <div class="progress progress-inline-lg sprint-progress-full" title="${completion}% terminé"><div class="progress-bar ${progressColor(completion)}" style="width:${completion}%"></div></div>
            </div>

            <div class="sprint-filter-row">
                <div class="quick-filters">
                    <button class="qf-btn${_qfFilter === 'blocked' ? ' active' : ''}" data-qf="blocked">🚫 Bloques <span class="qf-count">${blocked}</span></button>
                    <button class="qf-btn${_qfFilter === 'unassigned' ? ' active' : ''}" data-qf="unassigned">👤 Non assignes <span class="qf-count">${unassigned}</span></button>
                    <button class="qf-btn${_qfFilter === 'critical' ? ' active' : ''}" data-qf="critical">🔴 Critique/High <span class="qf-count">${critical}</span></button>
                    <input class="qf-search" id="qf-text" placeholder="🔍 Filtrer : clé, titre, leader, label, contributeur, Epic/Feature parente…" value="${esc(_qfText)}" autocomplete="off">
                    ${_qfFilter || _qfText ? `<span class="qf-clear" id="qf-clear" title="Effacer les filtres">✕</span>` : ''}
                </div>
                <div class="board-modes">
                    <button class="board-mode-btn${_boardMode === 'columns' ? ' active' : ''}" data-mode="columns" title="Colonnes">▤</button>
                    <button class="board-mode-btn${_boardMode === 'swimlanes' ? ' active' : ''}" data-mode="swimlanes" title="Swimlanes">☰</button>
                    <button class="board-mode-btn${_boardMode === 'list' ? ' active' : ''}" data-mode="list" title="Liste">≡</button>
                </div>
            </div>
        </div>

        <!-- Charts (collapsible) -->
        <details ${_chartsCollapsed ? '' : 'open'} id="charts-section">
            <summary class="text-xs font-semibold text-muted mb-2">Metriques sprint</summary>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Burndown</span></div><div class="chart-container chart-h-sm"><canvas id="chart-burndown"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Burnup</span></div><div class="chart-container chart-h-sm"><canvas id="chart-burnup"></canvas></div></div>
            </div>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">CFD</span></div><div class="chart-container chart-h-sm"><canvas id="chart-cfd"></canvas></div></div>
                <div class="card"><div class="card-header"><span class="card-title">Throughput</span></div><div class="chart-container chart-h-sm"><canvas id="chart-throughput"></canvas></div></div>
            </div>
            <div class="dashboard-grid mb-4">
                <div class="card"><div class="card-header"><span class="card-title">Cycle Time</span></div><div class="chart-container chart-h-sm"><canvas id="chart-cycletime"></canvas></div></div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">WIP Age</span>
                        <span class="card-subtitle" title="Age = jours depuis la mise en cours (ou la création si pas encore mis en cours).&#10;Seuils colorés : 🟢 OK · 🟡 attention (≥70% du p85 cycle time des tickets done) · 🔴 critique (≥p85).&#10;Si pas assez de tickets done : seuils fixes 🟡≥7j / 🔴≥14j.">ⓘ comment ça marche</span>
                    </div>
                    <div class="chart-container chart-h-sm"><canvas id="chart-wipage"></canvas></div>
                    <div class="wip-age-legend">
                        <span class="wip-age-legend-item"><span class="wip-age-swatch" style="background:#10B981"></span>OK · &lt; 70% p85</span>
                        <span class="wip-age-legend-item"><span class="wip-age-swatch" style="background:#F59E0B"></span>Attention · ≥ 70% p85</span>
                        <span class="wip-age-legend-item"><span class="wip-age-swatch" style="background:#EF4444"></span>Critique · ≥ p85 (à débloquer)</span>
                    </div>
                </div>
            </div>
        </details>

        <!-- Board -->
        <div id="board-container"></div>

        <!-- Recent Activity (composant partagé) -->
        <div class="card mt-4">
            <div class="card-header"><span class="card-title">Activité récente</span></div>
            <div id="sprint-activity-list"></div>
        </div>
    `;

    renderCalBanner(container.querySelector('#cal-banner-wrap'));

    // Alert-bar cliquable → ouvre la modal d'action (même qu'au clic sur panel-alert)
    container.querySelectorAll('.alert-item[data-alert-action]').forEach(el => {
        const open = () => {
            const actionable = el.dataset.alertAction;
            if (actionable) openAlertModal(actionable);
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    });

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

    // Board modes
    container.querySelectorAll('.board-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _boardMode = btn.dataset.mode;
            localStorage.setItem('sb-board-mode', _boardMode);
            container.querySelectorAll('.board-mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.mode === _boardMode));
            _refreshBoard(container);
        });
    });

    // Charts collapse state
    container.querySelector('#charts-section')?.addEventListener('toggle', e => {
        _chartsCollapsed = !e.target.open;
        localStorage.setItem('sb-charts-collapsed', _chartsCollapsed);
    });

    // ── Render board mode ─────────────────────────────────────────────────────
    const boardContainer = container.querySelector('#board-container');
    if (_boardMode === 'list') renderListView(boardContainer, filtered);
    else if (_boardMode === 'swimlanes') renderSwimlaneView(boardContainer, filtered);
    else renderColumnView(boardContainer, filtered);

    bindCardClicks(container);
    wireDragDrop(boardContainer);

    // ── Render activity feed (composant partagé avec Dashboard/Kanban) ───────
    const actEl = container.querySelector('#sprint-activity-list');
    if (actEl) {
        actEl.innerHTML = renderActivityList(tickets, { max: 20, scope: 'sprint' });
        bindActivityClicks(actEl);
    }

    // ── Render charts ─────────────────────────────────────────────────────────
    if (!_chartsCollapsed) {
        requestAnimationFrame(() => {
            renderBurndown('chart-burndown', tickets, sprintCtx, events);
            renderBurnup('chart-burnup', tickets, sprintCtx, events);
            renderCFD('chart-cfd', tickets, sprintCtx, events);
            renderThroughput('chart-throughput', tickets, sprintCtx, events);
            renderCycleTime('chart-cycletime', tickets);
            renderWIPAge('chart-wipage', tickets);
        });
    }
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
    const team = store.get('team');
    const allTickets = filterByTeam(store.get('tickets') || [], team);
    let filtered = allTickets;
    if (_qfFilter === 'blocked')    filtered = allTickets.filter(t => t.status === 'blocked');
    else if (_qfFilter === 'unassigned') filtered = allTickets.filter(t => !t.leader && !t.assignee);
    else if (_qfFilter === 'critical')   filtered = allTickets.filter(t => t.priority === 'critical' || t.priority === 'high');
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

function renderColumnView(el, tickets) {
    const activeCols = _activeColumns();
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
        return `<div class="board-column"><div class="column-header col-${col.key}"><span>${esc(col.label)}</span><span class="column-count${exceeded ? ' wip-exceeded' : ''}">${items.length}${wip ? '/' + wip : ''}${colPts ? ' · ' + colPts + 'pts' : ''}</span></div><div class="column-cards">${items.map(t => renderCard(t)).join('')}</div></div>`;
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
                <span><span class="badge badge-type badge-${t.type}">${esc(TYPE_LABELS[t.type] || t.type)}</span></span>
                <span><span class="badge badge-${t.status} badge-status" title="${esc(STATUS_LABELS[t.status] || t.status)} (interne)">${esc(t.jiraStatus || _colLabel(t.status))}</span></span>
                <span class="truncate text-xs">${esc(t.leader || t.assignee || '-')}</span>
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
            return si.length ? `<div class="board-column" class="board-column-narrow"><div class="column-header col-${col.key}"><span>${esc(col.label)}</span><span class="column-count">${si.length}</span></div><div class="column-cards">${si.map(t => renderCard(t)).join('')}</div></div>` : '';
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

