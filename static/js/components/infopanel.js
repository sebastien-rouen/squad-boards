/**
 * Info panel (right sidebar) - progress, alerts, risks, objectives.
 * Updates contextually based on current view.
 */

import { store } from '../state.js';
import { esc, pct, progressColor, filterByTeam, sumBy, computeVelocityHistory, getSprintForTeam, relevantCalendars, lastCalendarSync, isBufferItem, getCurrentPi, typeBadge, teamCapacity, wipThreshold, extractSprintLabel, effectiveRosterForPi, teamNameMatches } from '../utils.js';
import { STATUS_LABELS } from '../config.js';
import { loadReminders, REMINDER_DEFS } from '../views/settings.js';
import { openCalWeekModal } from './cal_banner.js';
import { openAlertModal } from './alert_modal.js';
import { collapseCharts, enterDailyMode } from '../views/sprint.js';

const panel = () => document.getElementById('info-panel');

const _MONTHS = ['Jan.','Fév.','Mar.','Avr.','Mai','Juin','Juil.','Aoû.','Sep.','Oct.','Nov.','Déc.'];
const _fmtDate = iso => {
    if (!iso) return '?';
    const d = new Date(iso);
    return `${d.getDate()} ${_MONTHS[d.getMonth()]}`;
};
// Ligne mini d'item (ticket/feature) dans un détail de carte — cliquable (ouvre la modal).
const _miniRow = (item, statusColor, jiraUrl) => {
    const idEl = jiraUrl
        ? `<a class="panel-buf-id" href="${jiraUrl}/browse/${esc(item.id)}" target="_blank" rel="noopener" title="${esc(item.id)}">${esc(item.id)}</a>`
        : `<span class="panel-buf-id">${esc(item.id)}</span>`;
    return `<div class="panel-buf-row" data-ticket-id="${esc(item.id)}">
        <span class="status-dot-xs" style="background:var(--status-${statusColor})"></span>
        ${idEl}
        <span class="panel-buf-title" title="${esc(item.title || '')}">${esc((item.title || '').slice(0, 22))}</span>
        ${item.points ? `<span class="panel-buf-pts-sm">${item.points}pt</span>` : '<span class="panel-buf-pts-sm" style="opacity:.35">-</span>'}
    </div>`;
};
const _daysLeft = endIso => {
    if (!endIso) return null;
    return Math.max(0, Math.round((new Date(endIso).getTime() - Date.now()) / 86_400_000));
};

export function updateInfoPanel() {
    const el = panel();
    if (!el) return;

    const view      = store.get('view');
    const team      = store.get('team');
    const jiraUrl   = store.get('jiraUrl') || null;
    const allTeamTickets = filterByTeam(store.get('tickets') || [], team);
    const allTeamFeatures = filterByTeam(store.get('features') || [], team);
    const calendars = store.get('calendars') || [];
    // sprintInfo = sprint ACTIF de l'équipe sélectionnée (pas le sprint global qui mélange).
    // Si team='all', getSprintForTeam retourne le 1er actif → on garde sprintInfo global en fallback.
    const sprintInfoAll = store.get('sprintInfo');
    const sprintInfo = getSprintForTeam(team, sprintInfoAll) || sprintInfoAll;
    // Card Sprint : filtre les tickets du seul sprint actif (sinon on mélangeait
    // tickets PI courant + sprints précédents / suivants ramenés par la sync).
    const _curSprintName = sprintInfo?.name || '';
    const tickets = _curSprintName
        ? allTeamTickets.filter(t =>
            t.sprintName === _curSprintName
            || (Array.isArray(t.allSprints) && t.allSprints.includes(_curSprintName))
            || t.sprint === _curSprintName
          )
        : allTeamTickets;
    const piInfo    = store.get('piInfo');
    const support   = store.get('support') || [];

    // PI courant (offset 0 — l'info-panel suit toujours le PI en cours) → filtre les features.
    // Même logique que la vue PI (pi.js) : match sur piSprint / sprintName / labels.
    const curPiNum = getCurrentPi({ sprintInfo, piInfo });
    const _inPi = (raw) => {
        if (!raw || !curPiNum) return true; // pas de PI exploitable → on garde
        const s = String(raw).toUpperCase().replace(/\s+/g, '');
        const m = s.match(/^(\d+)\.\d+$/);
        return s === `PI#${curPiNum}` || s === `PI${curPiNum}` || !!(m && +m[1] === curPiNum);
    };
    const features = curPiNum
        ? allTeamFeatures.filter(f => _inPi(f.piSprint) || _inPi(f.sprintName) || (f.labels || []).some(_inPi))
        : allTeamFeatures;

    if (['settings'].includes(view)) { el.innerHTML = ''; return; }

    const total    = tickets.length;
    const done     = tickets.filter(t => t.status === 'done').length;
    const blocked  = tickets.filter(t => t.status === 'blocked').length;
    const inprog   = tickets.filter(t => t.status === 'inprog').length;
    const totalPts = sumBy(tickets, t => t.points);
    const donePts  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const ptsPct   = pct(donePts, totalPts);
    const ticketPct = pct(done, total);

    const statusCounts = {};
    const ticketsByStatus = {};
    for (const t of tickets) {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        if (!ticketsByStatus[t.status]) ticketsByStatus[t.status] = [];
        ticketsByStatus[t.status].push(t);
    }

    const featureDone   = features.filter(f => f.status === 'done').length;
    const featurePct    = pct(featureDone, features.length);
    const featurePts    = sumBy(features, f => f.points);
    const featureDonePts = sumBy(features.filter(f => f.status === 'done'), f => f.points);
    const featuresByStatus = {};
    for (const f of features) (featuresByStatus[f.status] = featuresByStatus[f.status] || []).push(f);
    const featBlocked  = (featuresByStatus.blocked || []).length;
    const featInprog   = (featuresByStatus.inprog || []).length + (featuresByStatus.review || []).length + (featuresByStatus.test || []).length;
    const featTodo     = (featuresByStatus.todo || []).length;
    const featPctClr   = featurePct >= 80 ? 'var(--status-done)' : featurePct >= 50 ? 'var(--status-inprog)' : 'var(--status-blocked)';

    const now = new Date().toISOString().slice(0, 10);
    // Support de la semaine : limité à l'équipe sélectionnée dans le sidebar (sinon toutes
    // les équipes s'accumulaient dans une seule card, peu utile une fois une équipe choisie).
    const currentSupportRaw = support.filter(s => s.weekStart <= now && s.weekEnd >= now
        && (!team || team === 'all' || s.team === team));
    // Filtre les membres qui ont quitté l'équipe depuis que cette semaine a été shuffle :
    // une rotation déjà générée garde des noms figés en base, jamais réécrits tant que
    // personne ne relance un shuffle — un membre parti continuerait sinon d'apparaître ici
    // indéfiniment (même symptôme déjà géré côté grille Rotation Support via effectiveRosterForPi).
    const absences = store.get('absences') || [];
    const rosterByPi = effectiveRosterForPi(piInfo, curPiNum, absences, store.get('members') || []);
    const currentSupport = currentSupportRaw.map(s => ({
        ...s,
        members: (s.members || []).filter(m => rosterByPi.some(r => r.name === m && teamNameMatches(r.team, s.team))),
    }));
    const supportMembers   = currentSupport.flatMap(s => s.members || []);

    // Mood & fist votes
    const moodVotes = store.get('moodVotes') || [];
    const fistVotes = store.get('fistVotes') || [];

    // Reminder thresholds from settings (localStorage)
    const reminders = loadReminders();

    // Label du sprint courant dans le PI (ex: "29.1") — extrait directement du nom du sprint
    // actif plutôt que reconstruit depuis piInfo.number + index (qui produit un label tronqué
    // type ".1" si piInfo.number est vide/obsolète, et ne matche alors plus aucun vote).
    const curLabel = extractSprintLabel(sprintInfo?.name) || null;

    // Sprint time progress
    let timePct = 0;
    if (sprintInfo?.startDate && sprintInfo?.endDate) {
        const s = new Date(sprintInfo.startDate).getTime();
        const e = new Date(sprintInfo.endDate).getTime();
        timePct = Math.min(100, Math.max(0, Math.round(((Date.now() - s) / (e - s)) * 100)));
    }
    const dLeft     = _daysLeft(sprintInfo?.endDate);
    const sprintStarted = sprintInfo?.startDate && Date.now() >= new Date(sprintInfo.startDate).getTime();
    const ptsBehind = timePct > ptsPct + 20;
    const ptsColor  = ptsPct >= 80 ? 'var(--status-done)' : ptsPct >= 50 ? 'var(--status-inprog)' : 'var(--status-blocked)';

    // Buffer tickets — détection via helper unique isBufferItem
    const bufferTickets = tickets.filter(isBufferItem);
    const bufPts        = sumBy(bufferTickets, t => t.points);
    const bufDonePts    = sumBy(bufferTickets.filter(t => t.status === 'done'), t => t.points);
    const bufPct        = pct(bufDonePts, bufPts || 1);
    const bufRatio      = pct(bufPts, totalPts || 1);
    const bufInprog     = bufferTickets.filter(t => ['inprog','review','test'].includes(t.status));
    const bufBlocked    = bufferTickets.filter(t => t.status === 'blocked');
    const bufTodo       = bufferTickets.filter(t => t.status === 'todo');
    const bufDone       = bufferTickets.filter(t => t.status === 'done');
    const theoreticalBuf = Math.round(totalPts * 0.2);
    const BUF_CLR       = '#8B5CF6';
    const bufPctClr     = bufPct >= 70 ? 'var(--status-done)' : bufPct >= 30 ? 'var(--warning)' : BUF_CLR;

    let html = '';

    // ── Sprint card ───────────────────────────────────────────────────────
    const sprintName = sprintInfo?.name ? esc(sprintInfo.name) : 'Sprint en cours';
    const sprintGoal = sprintInfo?.goal ? esc(sprintInfo.goal) : '';
    const dLeftLabel = dLeft === null ? '' :
        dLeft === 0 ? 'Dernier jour' :
        dLeft === 1 ? '1j restant' : `${dLeft}j restants`;
    const dLeftDanger = dLeft !== null && dLeft <= 2;

    html += `
    <div class="panel-card panel-card--clickable" data-panel-id="sprint">
        <div class="panel-card-header">
            <div class="panel-title panel-title--icon"><span class="panel-title-emoji">🎯</span>Sprint</div>
            <button class="panel-goto-daily" type="button" title="Ouvrir le board Scrum, métriques repliées">Aller au Daily →</button>
            <span class="panel-card-chevron">▾</span>
        </div>
        <div class="panel-value" style="color:${ptsColor}">${ptsPct}%</div>
        <div class="panel-sub">${donePts}/${totalPts} pts &middot; ${done}/${total} tickets</div>
        <div class="mt-2">
            <div class="panel-bar-track">
                <div class="panel-bar-fill ${progressColor(ptsPct)}" style="width:${ptsPct}%"></div>
                ${timePct > 0 ? `<div class="panel-bar-time" style="left:${Math.min(98,timePct)}%" title="Temps écoulé : ${timePct}%"></div>` : ''}
            </div>
            ${timePct > 0 ? `<div class="panel-bar-caption mt-1">
                <span>Points : <strong>${ptsPct}%</strong></span>
                <span style="color:${ptsBehind ? 'var(--warning)' : 'var(--text-muted)'}">Temps : ${timePct}%${ptsBehind ? ' ⚠' : ''}</span>
            </div>` : ''}
        </div>
        <div class="panel-card-detail">
            <div class="panel-card-detail-inner">
                <div class="panel-sprint-name">${sprintName}</div>
                <div class="panel-sprint-dates">
                    <span>${_fmtDate(sprintInfo?.startDate)}</span>
                    <span class="panel-sprint-arrow">→</span>
                    <span>${_fmtDate(sprintInfo?.endDate)}</span>
                    ${dLeftLabel ? `<span class="panel-sprint-badge" style="background:${dLeftDanger ? 'var(--danger-bg)' : 'var(--surface)'}; color:${dLeftDanger ? 'var(--danger)' : 'var(--text-muted)'}">${dLeftLabel}</span>` : ''}
                </div>
                ${sprintGoal ? `<div class="panel-sprint-goal">&ldquo;${sprintGoal.slice(0, 100)}${sprintGoal.length > 100 ? '&hellip;' : ''}&rdquo;</div>` : ''}
                ${['blocked','inprog','review','test','todo','done'].map(s => {
                    const group = ticketsByStatus[s] || [];
                    if (!group.length) return '';
                    const max = s === 'done' ? group.length : 5;
                    const rowHtml = t => _miniRow(t, s, jiraUrl);
                    const visibleRows = group.slice(0, max).map(rowHtml).join('');
                    const hiddenRows  = group.slice(max).map(rowHtml).join('');
                    const more = group.length > max
                        ? `<button class="panel-more-toggle" data-target="panel-more-${s}" aria-expanded="false">+${group.length - max} autres ▾</button>
                           <div class="panel-more-extra" id="panel-more-${s}" hidden>${hiddenRows}</div>`
                        : '';
                    // Groupe pliable, replié par défaut ; « en cours » / « bloqué » restent ouverts.
                    return `<details class="panel-sprint-group"${(s === 'inprog' || s === 'blocked') ? ' open' : ''}>
                        <summary class="panel-sprint-group-hd">
                            <span class="status-dot-xs" style="background:var(--status-${s})"></span>
                            <span>${esc(STATUS_LABELS[s])}</span>
                            <span class="panel-mini-count">${group.length}</span>
                            <span class="panel-group-caret" aria-hidden="true">▾</span>
                        </summary>
                        <div class="panel-buf-list">${visibleRows}${more}</div>
                    </details>`;
                }).join('')}
            </div>
        </div>
    </div>`;

    // ── Buffer card ───────────────────────────────────────────────────────
    if (bufferTickets.length > 0) {
        html += `
        <div class="panel-card panel-card--clickable panel-card-buffer" data-panel-id="buffer">
            <div class="panel-card-header">
                <div class="panel-title panel-title--icon" style="color:${BUF_CLR}"><span class="panel-title-emoji">🛡️</span>Buffer</div>
                <span class="panel-card-chevron" style="color:${BUF_CLR}">▾</span>
            </div>
            <div class="panel-buf-summary">
                <span class="panel-buf-value" style="color:${BUF_CLR}">${bufferTickets.length}</span>
                <span class="panel-buf-sep">tickets</span>
                <span class="panel-buf-pts">${bufPts} pts</span>
            </div>
            <div class="panel-bar-track">
                <div class="panel-bar-fill" style="width:${bufPct}%;background:${bufPctClr}"></div>
            </div>
            <div class="panel-bar-caption mt-1">
                <span>${bufDonePts}/${bufPts} pts done</span>
                <span style="color:${BUF_CLR};font-weight:600">${bufRatio}% du sprint</span>
            </div>
            <div class="panel-card-detail">
                <div class="panel-card-detail-inner">
                    <div class="panel-buf-stats">
                        ${bufDone.length    ? `<span class="panel-buf-chip" style="background:#10B98120;color:#10B981">✓ ${bufDone.length} done</span>`    : ''}
                        ${bufInprog.length  ? `<span class="panel-buf-chip" style="background:#3B82F620;color:#3B82F6">⟳ ${bufInprog.length} en cours</span>` : ''}
                        ${bufBlocked.length ? `<span class="panel-buf-chip" style="background:#EF444420;color:#EF4444">⚠ ${bufBlocked.length} bloqué</span>` : ''}
                        ${bufTodo.length    ? `<span class="panel-buf-chip" style="background:#94A3B820;color:#94A3B8">○ ${bufTodo.length} à faire</span>`  : ''}
                    </div>
                    <div class="panel-buf-list">
                        ${(() => {
                            const bufRow = t => {
                                const href = jiraUrl ? `${jiraUrl}/browse/${esc(t.id)}` : null;
                                const idEl = href
                                    ? `<a class="panel-buf-id" href="${href}" target="_blank" rel="noopener" title="${esc(t.id)}">${esc(t.id)}</a>`
                                    : `<span class="panel-buf-id">${esc(t.id)}</span>`;
                                return `<div class="panel-buf-row" data-ticket-id="${esc(t.id)}">
                                    <span class="status-dot-xs" style="background:var(--status-${t.status})"></span>
                                    ${idEl}
                                    <span class="panel-buf-title" title="${esc(t.title || '')}">${esc((t.title || '').slice(0, 22))}</span>
                                    ${t.points ? `<span class="panel-buf-pts-sm">${t.points}pt</span>` : '<span class="panel-buf-pts-sm" style="opacity:.35">-</span>'}
                                </div>`;
                            };
                            const visible = bufferTickets.slice(0, 8).map(bufRow).join('');
                            const hidden  = bufferTickets.slice(8).map(bufRow).join('');
                            const more = bufferTickets.length > 8
                                ? `<button class="panel-more-toggle" data-target="panel-more-buf" aria-expanded="false">+${bufferTickets.length - 8} autres ▾</button>
                                   <div class="panel-more-extra" id="panel-more-buf" hidden>${hidden}</div>`
                                : '';
                            return visible + more;
                        })()}
                    </div>
                    <div class="panel-buf-ratio-row">
                        <span style="color:var(--text-muted)">Ratio recommandé : ~20%</span>
                        <span style="font-weight:600;color:${bufRatio < 10 ? 'var(--danger)' : bufRatio > 30 ? 'var(--warning)' : BUF_CLR}">
                            ${bufRatio}% ${bufRatio < 10 ? '↓' : bufRatio > 30 ? '↑' : '✓'}
                        </span>
                    </div>
                </div>
            </div>
        </div>`;
    } else {
        // Théorique - aucun ticket labellisé
        html += `
        <div class="panel-card panel-card--clickable panel-card-buffer" data-panel-id="buffer">
            <div class="panel-card-header">
                <div class="panel-title panel-title--icon" style="color:${BUF_CLR}"><span class="panel-title-emoji">🛡️</span>Buffer</div>
                <span class="panel-card-chevron" style="color:${BUF_CLR}">▾</span>
            </div>
            <div class="panel-buf-theoric">~${theoreticalBuf} pts</div>
            <div class="panel-sub">Capacité conseillée (20%)</div>
            <div class="panel-card-detail">
                <div class="panel-card-detail-inner">
                    <div class="panel-buf-theoric-row">
                        <span>Capacité sprint</span>
                        <strong>${totalPts} pts</strong>
                    </div>
                    <div class="panel-buf-theoric-row">
                        <span style="color:${BUF_CLR}">Buffer 20% conseillé</span>
                        <strong style="color:${BUF_CLR}">~${theoreticalBuf} pts</strong>
                    </div>
                    <div class="panel-buf-theoric-row">
                        <span>Tickets features</span>
                        <strong>${totalPts - theoreticalBuf} pts</strong>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── Alertes proactives (au-dessus des Statuts) ─────────────────────────
    const proactiveAlerts = getSprintAlerts(tickets, sprintInfo).filter(a => a.type !== 'success');
    if (proactiveAlerts.length) {
        // Tri par sévérité : danger > warning > info
        const sevOrder = { danger: 0, warning: 1, info: 2 };
        proactiveAlerts.sort((a, b) => (sevOrder[a.type] ?? 9) - (sevOrder[b.type] ?? 9));
        const sevIcon = { danger: '🔴', warning: '⚠️', info: 'ℹ️' };
        const counts = proactiveAlerts.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});
        html += `<div class="panel-card panel-card-alert">
            <div class="panel-title text-danger">
                Alertes
                <span class="panel-alert-counts">
                    ${counts.danger ? `<span class="panel-alert-pill alert-pill--danger">${counts.danger}</span>` : ''}
                    ${counts.warning ? `<span class="panel-alert-pill alert-pill--warning">${counts.warning}</span>` : ''}
                    ${counts.info ? `<span class="panel-alert-pill alert-pill--info">${counts.info}</span>` : ''}
                </span>
            </div>
            <div class="panel-alert-list">
                ${proactiveAlerts.map(a => {
                    const clickable = !!a.actionable;
                    const cls = clickable ? 'panel-alert-row panel-alert-row--clickable' : 'panel-alert-row';
                    const attr = clickable ? ` data-alert-action="${esc(a.actionable)}" title="Cliquer pour agir sur ces tickets"` : '';
                    return `<div class="${cls} panel-alert-row--${a.type}"${attr}>
                        <span class="panel-alert-icon">${sevIcon[a.type] || '•'}</span>
                        <span class="panel-alert-text">${esc(a.text)}</span>
                        ${clickable ? '<span class="panel-alert-cta">→</span>' : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // ── Statuts (sous les Alertes) ─────────────────────────────────────────
    html += `
    <div class="panel-card">
        <div class="panel-title">Statuts</div>
        <div class="panel-list">
            ${['todo','inprog','review','test','blocked','done'].map(s => {
                const count = statusCounts[s] || 0;
                if (!count) return '';
                const tooltipRows = (ticketsByStatus[s] || []).map(t => {
                    const idEl = jiraUrl
                        ? `<a class="ticket-id sb-tooltip-id" href="${jiraUrl}/browse/${esc(t.id)}" target="_blank" rel="noopener">${esc(t.id)}</a>`
                        : `<span class="ticket-id sb-tooltip-id">${esc(t.id)}</span>`;
                    return `<div class="sb-tooltip-row">${idEl}${typeBadge(t.type, { size: '2xs' })}<span class="sb-tooltip-title truncate flex-1" data-open-ticket="${esc(t.id)}">${esc(t.title?.slice(0, 30))}</span>${t.points ? `<span class="sb-tooltip-pts badge badge-points badge-2xs" data-open-ticket="${esc(t.id)}">${t.points}</span>` : ''}</div>`;
                }).join('');
                return `<div class="panel-list-item">
                    <span><span class="status-dot-sm" style="background:var(--status-${s})"></span>${esc(STATUS_LABELS[s])}</span>
                    <strong>${count}</strong>
                    <div class="sb-tooltip">${tooltipRows}</div>
                </div>`;
            }).join('')}
        </div>
    </div>`;

    // ── Calendrier (raccourci semaine) ────────────────────────────────────
    if (calendars.length) {
        const relCals = relevantCalendars(calendars, team);
        const lastSync = lastCalendarSync(calendars, team);
        const lastTxt = lastSync
            ? new Date(lastSync).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : 'jamais';
        html += `
        <button class="panel-card panel-card-action" id="panel-open-cal" title="Voir la semaine — dernière synchro : ${esc(lastTxt)}">
            <span class="panel-card-action-icon">📅</span>
            <span class="panel-card-action-text">
                <span class="panel-card-action-label">Voir le calendrier</span>
                <span class="panel-card-action-sub">${relCals.length} cal. · sync ${esc(lastTxt)}</span>
            </span>
        </button>`;
    }

    // ── Features ── (libellés de contexte équipe + PI pour l'état vide)
    const _teamLabel = (!team || team === 'all') ? 'toutes les équipes' : team, _piLabel = curPiNum ? `PI #${curPiNum}` : 'ce PI';
    if (!features.length) {
        // État vide explicite : aucune feature pour l'équipe + PI courant
        html += `
        <div class="panel-card panel-card-empty">
            <div class="panel-card-header"><div class="panel-title">Features</div></div>
            <div class="panel-empty-state">
                <span class="panel-empty-icon" aria-hidden="true">📦</span>
                <div class="panel-empty-text"><strong>Aucune feature</strong><span>pour ${esc(_teamLabel)} · ${esc(_piLabel)}</span></div>
            </div>
        </div>`;
    } else {
        // Ordre d'affichage : ce qui demande attention d'abord, terminé en dernier
        const FEAT_STATUS_ORDER = ['blocked', 'inprog', 'review', 'test', 'todo', 'done'];
        const featGroups = FEAT_STATUS_ORDER.map(s => {
            const group = featuresByStatus[s] || [];
            if (!group.length) return '';
            // Affiche toutes les features du groupe (pas de troncature « +N autres »)
            const rows = group.map(f => _miniRow(f, f.status, jiraUrl)).join('');
            return `<div class="panel-sprint-group">
                <div class="panel-sprint-group-hd">
                    <span class="status-dot-xs" style="background:var(--status-${s})"></span>
                    <span>${esc(STATUS_LABELS[s])}</span>
                    <span class="panel-mini-count">${group.length}</span>
                </div>
                <div class="panel-buf-list">${rows}</div>
            </div>`;
        }).join('');

        // Mini-répartition (segments visuels) pour scanner l'état d'un coup d'œil
        const segs = [[featBlocked, 'blocked'], [featInprog, 'inprog'], [featTodo, 'todo'], [featureDone, 'done']].filter(([n]) => n > 0);
        const distrib = segs.map(([n, s]) =>
            `<span class="panel-feat-seg" style="flex:${n};background:var(--status-${s})" title="${n} ${esc(STATUS_LABELS[s])}"></span>`
        ).join('');

        html += `
        <div class="panel-card panel-card--clickable" data-panel-id="features">
            <div class="panel-card-header">
                <div class="panel-title">Features</div>
                <span class="panel-card-chevron">▾</span>
            </div>
            <div class="panel-value" style="color:${featPctClr}">${featureDone}/${features.length}</div>
            <div class="panel-sub">${featurePct}% terminées${featurePts ? ` &middot; ${featureDonePts}/${featurePts} pts` : ''}</div>
            <div class="panel-feat-distrib mt-2">${distrib}</div>
            <div class="panel-feat-legend">
                ${[[featBlocked, 'blocked', `bloquée${featBlocked > 1 ? 's' : ''}`], [featInprog, 'inprog', 'en cours'], [featTodo, 'todo', 'à faire']]
                    .filter(([n]) => n)
                    .map(([n, s, lbl]) => `<span><span class="status-dot-xs" style="background:var(--status-${s})"></span>${n} ${lbl}</span>`).join('')}
            </div>
            <div class="panel-card-detail">
                <div class="panel-card-detail-inner">${featGroups}</div>
            </div>
        </div>`;
    }

    // ── Cérémonies à venir ────────────────────────────────────────────────
    if (dLeft !== null && sprintStarted) {
        const upcoming = REMINDER_DEFS.filter(def => {
            const cfg = reminders[def.id];
            return cfg.enabled && dLeft <= cfg.dBefore && !['mood', 'fist'].includes(def.id);
        });
        if (upcoming.length) {
            const _badgeCls = d => d === 0 ? 'panel-ceremony-badge--today' : d <= 1 ? 'panel-ceremony-badge--soon' : 'panel-ceremony-badge--upcoming';
            const _badgeTxt = d => d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `J-${d}`;
            html += `
            <div class="panel-card">
                <div class="panel-card-header">
                    <div class="panel-title">🗓️ Cérémonies</div>
                </div>
                <div style="margin-top:var(--sp-1)">
                    ${upcoming.map(def => `
                    <div class="panel-ceremony-row">
                        <span class="panel-ceremony-icon">${def.icon}</span>
                        <span class="panel-ceremony-name">${esc(def.label)}</span>
                        <span class="panel-ceremony-badge ${_badgeCls(dLeft)}">${_badgeTxt(dLeft)}</span>
                    </div>`).join('')}
                </div>
            </div>`;
        }
    }

    // ── Mood Meter ────────────────────────────────────────────────────────
    if (dLeft !== null && reminders.mood.enabled && dLeft <= reminders.mood.dBefore) {
        const filtered = moodVotes.filter(v =>
            (team === 'all' || v.team === team) &&
            (curLabel ? v.piSprint === curLabel : true)
        );
        const moodAvg  = filtered.length
            ? Math.round(filtered.reduce((s, v) => s + v.value, 0) / filtered.length * 10) / 10
            : null;
        const moodPct  = moodAvg !== null ? Math.round((moodAvg / 5) * 100) : 0;
        const moodClr  = moodAvg >= 4 ? 'var(--status-done)' : moodAvg >= 3 ? 'var(--warning)' : 'var(--danger)';
        const teamSlug = encodeURIComponent(team && team !== 'all' ? team : 'all');
        const moodHref = `/#pi/${teamSlug}/mood`;

        html += `
        <div class="panel-card">
            <div class="panel-card-header">
                <div class="panel-title">🎭 Mood</div>
                <a class="panel-link-sm" href="${moodHref}" title="Voter / modifier">Voter →</a>
            </div>
            ${moodAvg !== null ? `
                <div class="panel-meter-row">
                    <span class="panel-meter-score" style="color:${moodClr}">${moodAvg}</span>
                    <span class="panel-meter-max">/5</span>
                    <span class="panel-meter-count">${filtered.length} vote${filtered.length > 1 ? 's' : ''}</span>
                </div>
                <div class="panel-bar-track mt-1">
                    <div class="panel-bar-fill" style="width:${moodPct}%;background:${moodClr}"></div>
                </div>
            ` : `
                <div class="panel-sub mt-1">Aucun vote${curLabel ? ` · ${curLabel}` : ''}</div>
            `}
        </div>`;
    }

    // ── Objectifs PI (dès le premier jour de sprint) ──────────────────────
    if (piInfo?.objectives?.length && sprintStarted) {
        const teamSlug = encodeURIComponent(team && team !== 'all' ? team : 'all');
        const objHref  = `/#pi/${teamSlug}/fist`;
        const objs     = (team && team !== 'all')
            ? piInfo.objectives.filter(o => !o.team || o.team === team)
            : piInfo.objectives;
        if (objs.length) {
            const objDone   = objs.filter(o => o.status === 'done').length;
            const objInprog = objs.filter(o => o.status === 'inprog').length;
            const objPct    = pct(objDone, objs.length);
            const objClr    = objPct >= 80 ? 'var(--status-done)' : objPct >= 40 ? 'var(--status-inprog)' : 'var(--status-todo)';

            const fistFiltered = fistVotes.filter(v =>
                (team === 'all' || v.team === team) &&
                (curLabel ? v.piSprint === curLabel : true)
            );
            const fistAvg = fistFiltered.length
                ? Math.round(fistFiltered.reduce((s, v) => s + v.value, 0) / fistFiltered.length * 10) / 10
                : null;
            const fistClr = fistAvg >= 4 ? 'var(--status-done)' : fistAvg >= 3 ? 'var(--warning)' : 'var(--danger)';

            html += `
            <div class="panel-card">
                <div class="panel-card-header">
                    <div class="panel-title">🎯 Objectifs PI</div>
                    <a class="panel-link-sm" href="${objHref}" title="Gérer les objectifs">Gérer →</a>
                </div>
                <div class="panel-meter-row">
                    <span class="panel-meter-score" style="color:${objClr}">${objDone}/${objs.length}</span>
                    ${objInprog ? `<span class="panel-meter-count">${objInprog} en cours</span>` : ''}
                </div>
                <div class="panel-bar-track mt-1">
                    <div class="panel-bar-fill" style="width:${objPct}%;background:${objClr}"></div>
                </div>
                <div class="panel-list mt-2">
                    ${objs.slice(0, 6).map(o => {
                        const oIcon = o.status === 'done' ? '✓' : o.status === 'blocked' ? '⚠' : o.status === 'inprog' ? '◐' : '○';
                        const oClr  = o.status === 'done' ? 'var(--status-done)' : o.status === 'blocked' ? 'var(--status-blocked)' : o.status === 'inprog' ? 'var(--status-inprog)' : 'var(--status-todo)';
                        const oText = o.text || o.title || 'Sans titre';
                        return `<div class="panel-list-item" title="${esc(oText)}">
                            <span class="truncate"><span style="color:${oClr}">${oIcon}</span> ${esc(oText)}</span>
                        </div>`;
                    }).join('')}
                    ${objs.length > 6 ? `<div class="panel-list-item"><span class="text-muted text-xs">+${objs.length - 6} autre${objs.length - 6 > 1 ? 's' : ''}</span></div>` : ''}
                </div>
                ${fistAvg !== null ? `
                <div class="panel-meter-row mt-2">
                    <span class="panel-sub" style="margin-right:6px">✊ Vote confiance${curLabel ? ` · ${curLabel}` : ''}</span>
                    <span class="panel-meter-score" style="color:${fistClr};font-size:1rem">${fistAvg}</span>
                    <span class="panel-meter-max">/5</span>
                    <span class="panel-meter-count">${fistFiltered.length} vote${fistFiltered.length > 1 ? 's' : ''}</span>
                </div>
                <div class="panel-bar-track mt-1">
                    <div class="panel-bar-fill" style="width:${Math.round((fistAvg/5)*100)}%;background:${fistClr}"></div>
                </div>
                ` : curLabel ? `<div class="panel-sub mt-2">✊ Aucun vote confiance · ${curLabel}</div>` : ''}
            </div>`;
        }
    }

    // ── Support cette semaine ─────────────────────────────────────────────
    if (supportMembers.length) {
        const teamObjects = store.get('teamObjects') || [];
        const byTeam = currentSupport.filter(s => (s.members || []).length > 0);
        html += `
        <div class="panel-card">
            <div class="panel-title">Support cette semaine</div>
            <div class="panel-list">
                ${byTeam.map(s => {
                    const tObj  = teamObjects.find(t => t.name === s.team);
                    const color = tObj?.color || 'var(--text-muted)';
                    return `
                    <div class="panel-support-group">
                        <div class="panel-support-team" style="color:${color}">
                            <span class="panel-support-dot" style="background:${color}"></span>
                            ${esc(s.team)}
                        </div>
                        ${(s.members || []).map(m => `<div class="panel-list-item panel-list-item--indent"><span>${esc(m)}</span></div>`).join('')}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    el.innerHTML = html;
    _attachPanelEvents(el);
}

function _attachPanelEvents(el) {
    el.querySelector('#panel-open-cal')?.addEventListener('click', () => openCalWeekModal());

    // Alertes proactives cliquables → ouvre la modal d'action
    el.querySelectorAll('[data-alert-action]').forEach(row => {
        row.addEventListener('click', () => {
            const actionable = row.dataset.alertAction;
            if (actionable) openAlertModal(actionable);
        });
    });

    el.querySelector('.panel-goto-daily')?.addEventListener('click', e => {
        e.stopPropagation();
        collapseCharts();
        enterDailyMode();
        store.set('view', 'sprint');
    });

    el.querySelectorAll('.panel-card--clickable').forEach(card => {
        card.addEventListener('click', e => {
            // Laisse passer : liens, boutons, et le pli/dépli des groupes de statut (<summary>)
            if (e.target.closest('a, button, summary')) return;
            const expanded = card.classList.toggle('panel-card--expanded');
            // À l'ouverture : déplie tous les groupes de statut + amène la carte en vue.
            if (expanded) {
                card.querySelectorAll('details.panel-sprint-group').forEach(d => { d.open = true; });
                const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                setTimeout(() => card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }), 320);
            }
        });
    });

    // Toggle "+ N autres" : expand/collapse la liste cachée
    el.querySelectorAll('.panel-more-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const target = el.querySelector(`#${btn.dataset.target}`);
            if (!target) return;
            const isOpen = !target.hidden;
            target.hidden = isOpen;
            btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
            btn.textContent = btn.textContent.replace(/[▾▴]/, isOpen ? '▾' : '▴');
        });
    });

    // Clic sur un ticket de la liste mini → ouvre la modal
    el.querySelectorAll('.panel-buf-row[data-ticket-id]').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('a')) return;  // laisse passer le lien JIRA
            e.stopPropagation();  // n'entraîne pas le pli/dépli de la carte parente
            const id = row.dataset.ticketId;
            window.__squadBoard?.openTicketModal?.(id);
        });
    });

    el.querySelectorAll('.panel-list-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            const tooltip = item.querySelector('.sb-tooltip');
            if (!tooltip) return;
            const rect = item.getBoundingClientRect();
            const TOOLTIP_W = 288;
            const left = window.innerWidth - rect.right >= TOOLTIP_W + 8
                ? rect.right + 8
                : rect.left - TOOLTIP_W - 8;
            tooltip.style.left = `${left}px`;
            tooltip.style.top  = `${rect.top - 4}px`;
        });
    });

    el.addEventListener('click', e => {
        const trigger = e.target.closest('[data-open-ticket]');
        if (!trigger) return;
        const { openTicketModal } = window.__squadBoard || {};
        if (openTicketModal) openTicketModal(trigger.dataset.openTicket);
    });
}

/** Generate sprint alerts as HTML for insertion in sprint view. */
export function getSprintAlerts(tickets, sprintInfo) {
    const alerts = [];
    const total    = tickets.length;
    const blocked  = tickets.filter(t => t.status === 'blocked').length;
    const done     = tickets.filter(t => t.status === 'done').length;
    const totalPts = sumBy(tickets, t => t.points);
    const donePts  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const ptsPct   = pct(donePts, totalPts);
    const inprog   = tickets.filter(t => ['inprog', 'review', 'test'].includes(t.status)).length;

    if (sprintInfo?.startDate && sprintInfo?.endDate) {
        const start = new Date(sprintInfo.startDate).getTime();
        const end   = new Date(sprintInfo.endDate).getTime();
        const now   = Date.now();
        const rawPct = Math.round(((now - start) / (end - start)) * 100);
        const timePct = Math.max(0, Math.min(100, rawPct));
        // Statut temporel du sprint : actif / futur / terminé (ne génère pas d'alerte sur les vieux sprints).
        const isActive  = now >= start && now <= end;
        const isFuture  = now < start;
        const recentlyEnded = !isFuture && !isActive && (now - end) < 7 * 86400000; // < 7j après fin

        // Alertes "temps vs pts" : uniquement pour le sprint actif (sinon bruit sur les sprints anciens).
        if (isActive) {
            if (timePct > 75 && ptsPct < 50)
                alerts.push({ type: 'danger',  text: `Sprint à ${timePct}% du temps mais seulement ${ptsPct}% des points` });
            else if (timePct > 50 && ptsPct < 30)
                alerts.push({ type: 'warning', text: `Attention : ${ptsPct}% des points réalisés à mi-sprint` });
        }
        // "Sprint terminé" : uniquement si la fin est récente (< 7j) — sinon inutile pour les vieux sprints.
        if (recentlyEnded)
            alerts.push({ type: 'info',    text: 'Sprint terminé - pensez à la démo et à la rétro' });
    }

    if (blocked > 0) {
        const blockedPct = Math.round((blocked / total) * 100);
        alerts.push({
            type: blockedPct > 20 ? 'danger' : 'warning',
            text: `${blocked} ticket(s) bloqué(s) (${blockedPct}%)`,
            actionable: 'blocked',
        });
    }

    // Blockers anciens (> 48h sans update) — appelle à l'action
    const now = Date.now();
    const oldBlockers = tickets.filter(t =>
        t.status === 'blocked' && t.updatedAt && (now - new Date(t.updatedAt).getTime()) > 48 * 3600 * 1000
    );
    if (oldBlockers.length > 0) {
        const oldest = oldBlockers.reduce((m, t) =>
            !m || new Date(t.updatedAt) < new Date(m.updatedAt) ? t : m, null);
        const daysOldest = Math.floor((now - new Date(oldest.updatedAt).getTime()) / (86400 * 1000));
        alerts.push({
            type: 'danger',
            text: `${oldBlockers.length} blocker(s) sans mouvement > 48h (le plus ancien : ${daysOldest}j)`,
            actionable: 'oldBlockers',
        });
    }

    // WIP "élevé" = au-delà de la capacité de l'équipe (membres présents, congés déduits).
    // Même logique que la modale d'action et la vue Health (pas un simple ratio).
    const _wipTeam = store.get('team');
    const _cap = (_wipTeam && _wipTeam !== 'all') ? teamCapacity(_wipTeam, store.get('members') || [], store.get('absences') || []) : null;
    const _wipMax = _cap ? wipThreshold(_cap) : 0;
    if (_cap && inprog > _wipMax)
        alerts.push({ type: 'warning', actionable: 'wip', text: `WIP élevé : ${inprog} en cours pour ${_cap.available} présent${_cap.available > 1 ? 's' : ''} (seuil ${_wipMax})` });

    // Tickets stagnants : en cours/review/test depuis plus de 5 jours sans update
    const stale = tickets.filter(t =>
        ['inprog', 'review', 'test'].includes(t.status) && t.updatedAt &&
        (now - new Date(t.updatedAt).getTime()) > 5 * 86400 * 1000
    );
    if (stale.length > 0)
        alerts.push({
            type: 'warning',
            text: `${stale.length} ticket(s) en cours stagnant(s) (>5j sans update)`,
            actionable: 'stale',
        });

    // Tickets sans assignee (hors done) — risque de "personne ne prend"
    const unassigned = tickets.filter(t =>
        t.status !== 'done' && !(t.leader || t.assignee)
    );
    if (unassigned.length >= 3)
        alerts.push({
            type: 'info',
            text: `${unassigned.length} ticket(s) sans assigné·e`,
            actionable: 'unassigned',
        });

    const noPoints = tickets.filter(t => !t.points && t.status !== 'done').length;
    if (noPoints > 3)
        alerts.push({
            type: 'info',
            text: `${noPoints} tickets sans estimation`,
            actionable: 'noPoints',
        });

    if (sprintInfo?.startDate) {
        const sprintStart = new Date(sprintInfo.startDate).getTime();
        const added = tickets.filter(t => new Date(t.createdAt).getTime() > sprintStart && t.status !== 'done');
        if (added.length >= 2) {
            const addedPts = sumBy(added, t => t.points);
            const detail = addedPts > 0 ? ` (+${addedPts} pts)` : '';
            alerts.push({
                type: addedPts >= 8 ? 'danger' : 'warning',
                text: `Périmètre élargi : ${added.length} ticket(s) ajouté(s) après début${detail}`,
                actionable: 'scopeCreep',
            });
        }
    }

    // Vélocité dérivée des sprints clôturés (sprint actuel filtré par équipe si applicable)
    const _team = store.get('team');
    const _allTickets = store.get('tickets') || [];
    const velocityHistory = computeVelocityHistory(_allTickets, sprintInfo, _team);
    if (velocityHistory.length >= 3) {
        const last3 = velocityHistory.slice(-3);
        const avg   = Math.round(last3.reduce((s, v) => s + v.velocity, 0) / 3);
        const prev3 = velocityHistory.slice(-6, -3);
        if (prev3.length >= 3) {
            const prevAvg = Math.round(prev3.reduce((s, v) => s + v.velocity, 0) / 3);
            if (prevAvg > 0) {
                const drop = Math.round(((prevAvg - avg) / prevAvg) * 100);
                if (drop > 15)
                    alerts.push({ type: 'warning', text: `Velocity en baisse : ${avg} pts/sprint (${drop > 0 ? '-' : ''}${drop}% vs précédent)` });
            }
        }
    }

    if (!alerts.length && ptsPct > 0)
        alerts.push({ type: 'success', text: `Sprint en bonne voie (${ptsPct}% des points)` });

    return alerts;
}
