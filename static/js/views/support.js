/**
 * Support dashboard - rotation actuelle, tickets support par équipe, métriques SLA.
 * Inclut une timeline PI + bouton de génération aléatoire respectant les règles métier
 * (cf. utils.generateSupportRotation et CLAUDE.md "Règles métier Rotation Support").
 */

import { store } from '../state.js';
import {
    esc, filterByTeam, sumBy, groupBy, fmtDate, toast,
    deriveMembersFromAbsences, generateSupportRotation, buildSupportPiWeeks, supportAbsenceDays,
    initials, hashColor,
    SUPPORT_WEEK_MODES, SUPPORT_WEEK_MODE_DEFAULT, getSupportWeekMode,
    isMemberSupportActive,
} from '../utils.js';
import * as api from '../api.js';

function _fmtDay(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Avatar circulaire avec initiales et couleur dérivée du nom
function _avatar(name, size = 28) {
    if (!name) return `<span class="sup-avatar sup-avatar--empty" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">?</span>`;
    return `<span class="sup-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${hashColor(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_LABELS = { critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Basse' };
const PRIORITY_CSS   = { critical: 'danger', high: 'warning', medium: 'info', low: 'success' };

function _daysOpen(createdAt) {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function _slaCss(days) {
    if (days > 7)  return 'danger';
    if (days > 3)  return 'warning';
    return 'success';
}

export function renderSupport(container) {
    const team      = store.get('team');
    const allTickets = store.get('tickets') || [];
    const support   = store.get('support') || [];
    const teams     = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];

    const tickets = filterByTeam(allTickets, team).filter(t => t.type === 'support');
    const open    = tickets.filter(t => t.status !== 'done');
    const done    = tickets.filter(t => t.status === 'done');

    // Current week rotation
    const today = new Date().toISOString().slice(0, 10);
    const curRot = support.filter(s => s.weekStart <= today && s.weekEnd >= today);

    // Stats
    const avgAge    = open.length ? Math.round(open.reduce((s, t) => s + _daysOpen(t.createdAt), 0) / open.length) : 0;
    const critical  = open.filter(t => t.priority === 'critical').length;
    const byTeam    = groupBy(open, t => t.team);

    // Sorted open tickets
    const sortedOpen = [...open].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2;
        const pb = PRIORITY_ORDER[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return _daysOpen(b.createdAt) - _daysOpen(a.createdAt);
    });

    container.innerHTML = `
        <!-- Métriques -->
        <div class="dashboard-metrics mb-4">
            <div class="metric-card ${open.length > 10 ? 'mc-danger' : open.length > 5 ? 'mc-warning' : 'mc-done'}">
                <span class="metric-icon">🎫</span>
                <span class="metric-label">Tickets ouverts</span>
                <span class="metric-value">${open.length}</span>
                <span class="metric-sub">${done.length} resolus au total</span>
            </div>
            <div class="metric-card ${critical > 0 ? 'mc-danger' : 'mc-done'}">
                <span class="metric-icon">🚨</span>
                <span class="metric-label">Critiques</span>
                <span class="metric-value">${critical}</span>
                <span class="metric-sub">${open.filter(t => t.priority === 'high').length} haute priorite</span>
            </div>
            <div class="metric-card ${avgAge > 7 ? 'mc-danger' : avgAge > 3 ? 'mc-warning' : 'mc-primary'}">
                <span class="metric-icon">⏱️</span>
                <span class="metric-label">Age moyen</span>
                <span class="metric-value">${avgAge}j</span>
                <span class="metric-sub">tickets ouverts</span>
            </div>
            <div class="metric-card mc-info">
                <span class="metric-icon">🔄</span>
                <span class="metric-label">En rotation</span>
                <span class="metric-value">${curRot.reduce((s, r) => s + (r.members || []).length, 0)}</span>
                <span class="metric-sub">membres cette semaine</span>
            </div>
        </div>

        <!-- Rotation actuelle (hero-cards) -->
        <div class="pi-section mb-4">
            <h3 class="pi-section-title">🛎️ Rotation cette semaine</h3>
            ${curRot.length ? `
            <div class="sup-hero-grid">
                ${curRot.map(rot => {
                    const tObj = teamObjects.find(o => o.name === rot.team);
                    const color = tObj?.color || '#6366f1';
                    const _today = new Date().toISOString().slice(0, 10);
                    const wStart = rot.weekStart || '';
                    const wEnd   = rot.weekEnd   || '';
                    // Progression dans la semaine
                    const sMs = wStart ? new Date(wStart + 'T00:00:00').getTime() : 0;
                    const eMs = wEnd   ? new Date(wEnd   + 'T23:59:59').getTime() : 0;
                    const now = Date.now();
                    const total = eMs - sMs;
                    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((now - sMs) / total * 100))) : 0;
                    const remaining = eMs > now ? Math.ceil((eMs - now) / 86400000) : 0;
                    const remainTxt = remaining === 0 ? 'Dernier jour' : remaining === 1 ? '1j restant' : `${remaining}j restants`;
                    // Membres + état absence
                    const absences = store.get('absences') || [];
                    const memberChips = (rot.members || []).map(m => {
                        const absent = supportAbsenceDays(m, wStart, wEnd, absences) >= 3;
                        return `<div class="sup-hero-member${absent ? ' is-absent' : ''}" title="${esc(m)}${absent ? ' · absent ≥ 3j' : ''}">
                            ${_avatar(m, 36)}
                            <div class="sup-hero-member-info">
                                <span class="sup-hero-member-name">${esc(m)}</span>
                                ${absent ? '<span class="sup-hero-member-tag sup-hero-member-tag--absent">Absent</span>'
                                          : '<span class="sup-hero-member-tag sup-hero-member-tag--avail">Disponible</span>'}
                            </div>
                        </div>`;
                    }).join('');
                    return `
                    <div class="sup-hero-card" style="--team-color:${color}">
                        <div class="sup-hero-card-hdr">
                            <div class="sup-hero-card-team">
                                <span class="team-dot" style="background:${color}"></span>
                                <strong>${esc(rot.team)}</strong>
                            </div>
                            <span class="sup-hero-card-badge">EN COURS</span>
                        </div>
                        <div class="sup-hero-card-meta">
                            <span class="sup-hero-card-week">📆 ${esc(rot.weekLabel || '')}</span>
                            <span class="sup-hero-card-dates">${_fmtDay(wStart)} → ${_fmtDay(wEnd)}</span>
                            <span class="sup-hero-card-remain ${remaining <= 1 ? 'is-urgent' : ''}">${remainTxt}</span>
                        </div>
                        <div class="sup-hero-card-progress" title="Progression de la semaine : ${pct}%">
                            <div class="sup-hero-card-progress-fill" style="width:${pct}%;background:${color}"></div>
                        </div>
                        <div class="sup-hero-card-members">
                            ${memberChips || '<span class="text-muted text-xs">Aucun membre assigné</span>'}
                        </div>
                    </div>`;
                }).join('')}
            </div>` : `<div class="empty-state"><p>🪂 Aucune rotation définie pour cette semaine. Génère depuis la timeline ci-dessous.</p></div>`}
        </div>

        <!-- Timeline rotation PI + génération -->
        ${_renderPiTimeline(team, teams, teamObjects, support, store.get('absences') || [], store.get('members') || [], store.get('piInfo'), store.get('sprintInfo'))}

        <!-- Tickets par équipe -->
        ${teams.length > 1 && team === 'all' ? `
        <div class="pi-section mb-4">
            <h3 class="pi-section-title">Repartition par equipe</h3>
            <div class="support-team-bars">
                ${teams.map(t => {
                    const tt = byTeam.get(t) || [];
                    if (!tt.length) return '';
                    const tObj = teamObjects.find(o => o.name === t);
                    const color = tObj?.color || '#6366f1';
                    const maxCount = Math.max(...teams.map(tn => (byTeam.get(tn) || []).length), 1);
                    return `
                    <div class="support-team-bar-row">
                        <span class="support-team-label" style="color:${color}">${esc(t)}</span>
                        <div class="support-team-bar-track">
                            <div class="support-team-bar-fill" style="width:${Math.round(tt.length/maxCount*100)}%;background:${color}"></div>
                        </div>
                        <span class="support-team-count">${tt.length}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>` : ''}

        <!-- Liste tickets ouverts -->
        <div class="pi-section">
            <h3 class="pi-section-title">Tickets ouverts${open.length ? ` (${open.length})` : ''}</h3>
            ${sortedOpen.length ? `
            <div class="card card-flush">
                <table class="support-table">
                    <thead><tr>
                        <th>Ticket</th><th>Priorite</th><th>Equipe</th><th>Responsable</th><th>Age</th><th>Statut</th>
                    </tr></thead>
                    <tbody>
                        ${sortedOpen.map(t => {
                            const days = _daysOpen(t.createdAt);
                            return `
                            <tr class="support-ticket-row" data-ticket-id="${esc(t.id)}">
                                <td class="support-ticket-title">${esc(t.title)}</td>
                                <td><span class="badge badge-${PRIORITY_CSS[t.priority] || 'info'}">${PRIORITY_LABELS[t.priority] || t.priority}</span></td>
                                <td class="text-sm">${esc(t.team || '-')}</td>
                                <td class="text-sm">${esc(t.leader || '-')}</td>
                                <td><span class="sla-badge sla-${_slaCss(days)}">${days}j</span></td>
                                <td><span class="badge badge-${t.status}">${esc(t.status)}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>` : `<div class="empty-state"><p>Aucun ticket support ouvert</p></div>`}
        </div>
    `;

    container.querySelectorAll('.support-ticket-row').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticketId));
    });

    // Wiring boutons de génération de la timeline
    _wirePiTimeline(container);
}

// ── Timeline PI + génération ─────────────────────────────────────────────────
function _renderPiTimeline(teamFilter, teams, teamObjects, support, absences, members, piInfo, sprintInfo) {
    const { curWeeks, nextWeeks, curPiNum, nextPiNum } = buildSupportPiWeeks(piInfo, sprintInfo);
    if (!curWeeks.length) {
        return `<div class="pi-section mb-4">
            <h3 class="pi-section-title">Rotation du PI</h3>
            <p class="text-muted text-sm">Configure d'abord le PI (numéro + dates) dans <strong>Paramètres → PI</strong>.</p>
        </div>`;
    }
    // Quelles équipes afficher ?
    const targetTeams = (teamFilter && teamFilter !== 'all')
        ? [teamFilter]
        : teams.slice();
    const showNext = localStorage.getItem('sup-show-next-pi') === 'true';
    const showPast = localStorage.getItem('sup-show-past') === 'true';   // OFF par défaut
    const allWeeks = showNext ? [...curWeeks, ...nextWeeks] : curWeeks;
    const today = new Date().toISOString().slice(0, 10);
    // Filtrage du passé : on garde uniquement les semaines en cours + futures, sauf si l'utilisateur a explicitement demandé l'historique.
    const visibleWeeks = showPast ? allWeeks : allWeeks.filter(w => w.weekEnd >= today);
    const hiddenPastCount = allWeeks.length - visibleWeeks.length;

    const _panel = (team) => {
        const tObj  = teamObjects.find(o => o.name === team);
        const color = tObj?.color || '#6366f1';
        const _norm = s => (s || '').toLowerCase().trim();
        const _matchTeam = (mt, tgt) => {
            const t = _norm(mt), gg = _norm(tgt);
            return t === gg || (gg && t && (t.includes(gg) || gg.includes(t)));
        };
        const teamSupport = support.filter(s => _matchTeam(s.team, team));
        const derived = deriveMembersFromAbsences(absences, members).filter(m => _matchTeam(m.team, team));
        const totalMembers = derived.length;
        const mpw = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
        // Mode semaine par équipe (vendredi par défaut = 1er jour de sprint typique).
        // Si différent du mode global utilisé pour le calcul des semaines, on recalcule POUR cette équipe.
        const teamMode = getSupportWeekMode(team);
        const { curWeeks: teamCurWeeks, nextWeeks: teamNextWeeks } = (teamMode === SUPPORT_WEEK_MODE_DEFAULT)
            ? { curWeeks, nextWeeks }
            : buildSupportPiWeeks(piInfo, sprintInfo, teamMode);
        const teamAllWeeks = showNext ? [...teamCurWeeks, ...teamNextWeeks] : teamCurWeeks;
        const teamVisibleWeeks = showPast ? teamAllWeeks : teamAllWeeks.filter(w => w.weekEnd >= today);
        const modeLabel = SUPPORT_WEEK_MODES[teamMode]?.label || teamMode;

        // Statistiques d'équité : sur tout le PI de cette équipe (passé inclus).
        const counts = {};
        for (const w of teamAllWeeks) {
            const rot = teamSupport.find(s => s.weekStart === w.weekStart && s.weekEnd === w.weekEnd);
            for (const m of (rot?.members || [])) counts[m] = (counts[m] || 0) + 1;
        }

        // Détection PI-frontière pour l'affichage de séparateurs (PI courant vs suivant)
        const curWeekKeys = new Set(teamCurWeeks.map(w => `${w.weekStart}|${w.weekEnd}`));

        const rows = teamVisibleWeeks.map(w => {
            const rot = teamSupport.find(s => s.weekStart === w.weekStart && s.weekEnd === w.weekEnd);
            const isPast    = w.weekEnd < today;
            const isCurrent = w.weekStart <= today && w.weekEnd >= today;
            const isFuture  = w.weekStart > today;
            const inCurPi   = curWeekKeys.has(`${w.weekStart}|${w.weekEnd}`);
            const state = isCurrent ? 'current' : isPast ? 'past' : 'future';
            const stateLbl = isCurrent ? 'EN COURS' : isPast ? 'PASSÉ 🔒' : 'À VENIR';
            const memberCells = (rot?.members || []).map(m => {
                const absent = supportAbsenceDays(m, w.weekStart, w.weekEnd, absences) >= 3;
                return `<div class="sup-row-member${absent ? ' is-absent' : ''}" title="${esc(m)}${absent ? ' · absent ≥ 3j' : ''}">
                    ${_avatar(m, 24)}
                    <span class="sup-row-member-name">${esc(m)}</span>
                    ${absent ? '<span class="sup-row-member-flag">absent</span>' : ''}
                </div>`;
            }).join('');
            const count = (rot?.members || []).length;
            const fillCls = count === 0 ? 'is-empty' : count < mpw ? 'is-partial' : 'is-full';
            const fillLbl = count === 0 ? 'Vide' : count < mpw ? `${count}/${mpw}` : '✓ Complet';

            // Charge dispo = nb jours sans absence sur la semaine pour les membres assignés
            const teamPool = derived.map(d => d.name);
            const poolDays = teamPool.reduce((s, m) => s + Math.max(0, 5 - Math.min(5, supportAbsenceDays(m, w.weekStart, w.weekEnd, absences))), 0);
            const poolMax = teamPool.length * 5;
            const poolPct = poolMax ? Math.round(poolDays / poolMax * 100) : 0;
            const poolCls = poolPct >= 80 ? 'is-ok' : poolPct >= 50 ? 'is-mid' : 'is-low';

            return `<tr class="sup-row sup-row--${state}${inCurPi ? '' : ' sup-row--next-pi'}" data-week-start="${w.weekStart}" data-week-end="${w.weekEnd}">
                <td class="sup-row-week">
                    <div class="sup-row-week-lbl">${esc(w.label)}</div>
                    <div class="sup-row-week-dates">${_fmtDay(w.weekStart)} → ${_fmtDay(w.weekEnd)}</div>
                </td>
                <td class="sup-row-state-td"><span class="sup-row-state sup-row-state--${state}">${stateLbl}</span></td>
                <td class="sup-row-members-td">
                    <div class="sup-row-members">${memberCells || '<span class="sup-row-empty">— Aucun membre assigné —</span>'}</div>
                </td>
                <td class="sup-row-fill-td"><span class="sup-row-fill ${fillCls}">${fillLbl}</span></td>
                <td class="sup-row-pool-td">
                    <div class="sup-row-pool ${poolCls}" title="${poolDays}/${poolMax} jours dispo équipe">
                        <div class="sup-row-pool-bar"><div class="sup-row-pool-bar-fill" style="width:${poolPct}%"></div></div>
                        <span class="sup-row-pool-val">${poolPct}%</span>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // Total pied de tableau (sur les semaines de cette équipe)
        const totalWeeks = teamAllWeeks.length;
        const totalAssigned = teamAllWeeks.reduce((s, w) => {
            const rot = teamSupport.find(x => x.weekStart === w.weekStart && x.weekEnd === w.weekEnd);
            return s + ((rot?.members || []).length);
        }, 0);
        const target = totalWeeks * mpw;
        const fillPct = target ? Math.round(totalAssigned / target * 100) : 0;
        // Top 3 membres les plus chargés pour équité
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topHtml = top.map(([n, c]) => `<span class="sup-foot-chip">${_avatar(n, 18)} ${esc(n)} <strong>×${c}</strong></span>`).join('');

        // Sélecteur de mode semaine par équipe
        const modeOptions = Object.entries(SUPPORT_WEEK_MODES).map(([k, v]) =>
            `<option value="${k}"${k === teamMode ? ' selected' : ''}>${v.label}</option>`
        ).join('');

        return `<div class="sup-table-panel" style="--team-color:${color}">
            <div class="sup-table-panel-hdr">
                <div class="sup-table-panel-title">
                    <span class="team-dot" style="background:${color}"></span>
                    <strong>${esc(team)}</strong>
                    <span class="sup-table-panel-stats">${totalMembers} membres · ${mpw}/sem · ${totalWeeks} semaines</span>
                </div>
                <div class="sup-table-panel-mode">
                    <label class="sup-mode-label" title="Jour de début de chaque semaine support">Semaine
                        <select class="select select-sm sup-mode-select" data-sup-mode="${esc(team)}">${modeOptions}</select>
                    </label>
                </div>
                <div class="sup-table-panel-actions">
                    <button class="btn btn-sm btn-primary" data-sup-shuffle="${esc(team)}" title="Génère la rotation PI ${curPiNum} (passé préservé)">🎲 Générer PI${curPiNum}</button>
                    ${nextPiNum ? `<button class="btn btn-sm btn-secondary" data-sup-shuffle-next="${esc(team)}" title="Génère la rotation PI ${nextPiNum}">🎲 PI${nextPiNum}</button>` : ''}
                    <a class="btn btn-sm btn-secondary" href="#settings/rotation" title="Éditer finement dans Paramètres > Rotation Support">⚙ Édition</a>
                </div>
            </div>
            <div class="sup-table-wrap">
                <table class="sup-table-rotation">
                    <thead>
                        <tr>
                            <th>Semaine</th>
                            <th>Statut</th>
                            <th>Membres assignés</th>
                            <th>Effectif</th>
                            <th>Charge équipe</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                        <tr>
                            <td colspan="2"><strong>Bilan</strong></td>
                            <td colspan="2">
                                <div class="sup-foot-summary">
                                    <span class="sup-foot-pct ${fillPct >= 100 ? 'is-ok' : fillPct >= 60 ? 'is-mid' : 'is-low'}">${totalAssigned}/${target} <small>(${fillPct}%)</small></span>
                                    ${topHtml ? `<span class="sup-foot-equity-label">Plus chargés :</span>${topHtml}` : ''}
                                </div>
                            </td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>`;
    };

    return `<div class="pi-section mb-4">
        <div class="sup-tl-hdr">
            <h3 class="pi-section-title">Rotation du PI ${curPiNum || ''}${showNext && nextPiNum ? ` + PI ${nextPiNum}` : ''}</h3>
            <div class="sup-tl-hdr-actions">
                <div class="rot-pi-switch" role="tablist" aria-label="Périmètre PI affiché">
                    <button class="rot-pi-switch-btn${!showNext ? ' is-active' : ''}" id="sup-pi-switch-cur" role="tab" aria-selected="${!showNext}" title="Afficher uniquement le PI courant">
                        <span class="rot-pi-switch-icon">📆</span>
                        <span>PI ${curPiNum || '?'} <small>courant</small></span>
                    </button>
                    <button class="rot-pi-switch-btn${showNext ? ' is-active' : ''}" id="sup-toggle-next" role="tab" aria-selected="${showNext}" title="Inclure le PI suivant">
                        <span class="rot-pi-switch-icon">➕</span>
                        <span>PI ${nextPiNum || '?'} <small>suivant</small></span>
                    </button>
                </div>
                ${hiddenPastCount > 0 || showPast ? `
                <button class="btn btn-sm btn-ghost sup-show-past-btn${showPast ? ' is-on' : ''}" id="sup-toggle-past"
                        title="${showPast ? 'Masquer les semaines passées' : `Afficher les ${hiddenPastCount} semaine(s) passée(s)`}">
                    ${showPast ? '👁️‍🗨️ Masquer le passé' : `🕰️ Afficher passé (${hiddenPastCount})`}
                </button>` : ''}
            </div>
        </div>
        <p class="text-xs text-muted mb-2">Règles : membre absent ≥ 3j ignoré · jamais 2 semaines consécutives · semaines passées verrouillées · équité par compteur.</p>
        ${targetTeams.map(_panel).join('') || '<p class="text-muted text-sm">Aucune équipe à afficher.</p>'}
    </div>`;
}

function _wirePiTimeline(container) {
    // Switch 2 segments : chaque bouton ACTIVE son mode (pas un toggle aveugle)
    const _rerender = () => { if (typeof window.__squadBoard?.rerenderView === 'function') window.__squadBoard.rerenderView(); };
    container.querySelector('#sup-pi-switch-cur')?.addEventListener('click', () => {
        localStorage.setItem('sup-show-next-pi', 'false');
        _rerender();
    });
    container.querySelector('#sup-toggle-next')?.addEventListener('click', () => {
        localStorage.setItem('sup-show-next-pi', 'true');
        _rerender();
    });
    container.querySelector('#sup-toggle-past')?.addEventListener('click', () => {
        const cur = localStorage.getItem('sup-show-past') === 'true';
        localStorage.setItem('sup-show-past', String(!cur));
        _rerender();
    });

    // Sélecteur de mode semaine par équipe
    container.querySelectorAll('[data-sup-mode]').forEach(sel => {
        sel.addEventListener('change', () => {
            const team = sel.dataset.supMode;
            if (team) localStorage.setItem(`rot-mode-${team}`, sel.value);
            _rerender();
        });
    });

    const _shuffle = async (team, includeNext) => {
        const absences = store.get('absences') || [];
        const allMembers = deriveMembersFromAbsences(absences, store.get('members') || []);
        // Match tolérant : casse + trim + inclusion bidirectionnelle.
        // Gère le piège classique "Fuego" (config app) vs "GCOM - Fuego" (CSV RH) vs "Team Fuego".
        const _norm = s => (s || '').toLowerCase().trim();
        const target = _norm(team);
        const teamMembers = allMembers
            .filter(m => {
                const t = _norm(m.team);
                return t === target || (target && t && (t.includes(target) || target.includes(t)));
            })
            .map(m => m.name);
        if (!teamMembers.length) {
            const known = [...new Set(allMembers.map(m => m.team).filter(Boolean))].sort();
            const hint = known.length
                ? `Équipes vues en base : ${known.slice(0, 6).join(', ')}${known.length > 6 ? '…' : ''}`
                : 'Aucune absence n\'est enregistrée — importe d\'abord le CSV RH.';
            toast(`Aucun membre rattaché à "${team}". ${hint}`, 'warning');
            return;
        }
        const teamMode = getSupportWeekMode(team);
        const { curWeeks, nextWeeks } = buildSupportPiWeeks(store.get('piInfo'), store.get('sprintInfo'), teamMode);
        const weeks = includeNext ? nextWeeks : curWeeks;
        const mpw = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
        const existingSupport = (store.get('support') || []).filter(s => s.team === team);
        // Exclut les membres marqués inactifs support (rôles non éligibles)
        const activeMembers = teamMembers.filter(isMemberSupportActive);
        if (!activeMembers.length) {
            toast(`Tous les membres de ${team} sont marqués inactifs support.`, 'warning');
            return;
        }
        const rotations = generateSupportRotation({
            team, weeks, memberNames: activeMembers, absences, existingSupport,
            membersPerWeek: mpw, weekMode: teamMode,
        });
        try {
            // /api/support/bulk clear par team — mais on n'envoie que les semaines du PI ciblé,
            // donc on doit aussi inclure l'autre PI déjà existant pour ne pas le perdre.
            const otherPiSupport = existingSupport.filter(s =>
                !weeks.some(w => w.weekStart === s.weekStart && w.weekEnd === s.weekEnd)
            );
            await api.bulkCreateSupport(team, [...otherPiSupport, ...rotations]);
            const preserved = rotations.filter(r => r._autoLocked || r.locked).length;
            toast(`Rotation ${team} générée (${weeks.length} sem.${preserved ? `, ${preserved} préservées` : ''})`, 'success');
            // Refresh store puis re-render
            const fresh = await api.getSupport();
            store.set('support', fresh);
            if (typeof window.__squadBoard?.rerenderView === 'function') window.__squadBoard.rerenderView();
        } catch (e) { toast(e.message || 'Erreur', 'error'); }
    };

    container.querySelectorAll('[data-sup-shuffle]').forEach(btn => {
        btn.addEventListener('click', () => _shuffle(btn.dataset.supShuffle, false));
    });
    container.querySelectorAll('[data-sup-shuffle-next]').forEach(btn => {
        btn.addEventListener('click', () => _shuffle(btn.dataset.supShuffleNext, true));
    });
}
