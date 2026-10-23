/**
 * Dashboard — blocs de la page, rendus depuis le modèle (`m`, cf. dashboard-model.js) : support du jour,
 * frise du sprint, bandeau d'un autre PI, indicateurs, flux « Pilotage & flux » et « Équipe & risques ».
 */

import { todayIsoLocal, effectiveRosterForPi, getCurrentPi, supportMembersOnDay, teamNameMatches, initials, esc, progressColor, isBufferItem, countBlocked, sumBy } from '../utils.js';
import { store } from '../state.js';
import { piSprintsStripHtml } from './dashboard-pi-strip.js';
import { helpIconHtml } from '../components/help_popover.js';
import { metricScopeHtml } from '../components/metric_scope.js';
import { stageFlowCardHtml } from '../components/stage_flow_card.js';
import { velocityCardHtml } from '../components/velocity_card.js';
import { agingWipCardHtml } from '../components/aging_wip_card.js';
import { TEAM_COLORS } from '../config.js';
import { piProgressHtml } from '../components/pi_progress.js';
import { slaReviewCardHtml } from '../components/sla_review_card.js';
import { stuckCardHtml } from '../components/stuck_card.js';
import { renderActivityCard } from '../components/activity.js';

/** Bandeau « 🛎️ Support aujourd'hui » (roster du PI courant). */
export function onCallTodayHtml() {
    const todayIso = todayIsoLocal();   // heure locale : toISOString() donnait la veille avant 2 h
    const support  = store.get('support') || [];
    const teamObjects = store.get('teamObjects') || [];
    // Roster du PI courant : un membre sorti de l'équipe n'est plus de support (comme la
    // page Support et le panneau latéral, cf. effectiveRosterForPi).
    const _piInfo = store.get('piInfo');
    const roster = effectiveRosterForPi(_piInfo, getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: _piInfo }),
        store.get('absences') || [], store.get('members') || []);
    // supportMembersOnDay = même lecture que la grille Paramètres → Rotation : semaine du
    // mode ACTUEL de chaque équipe (doublons fusionnés) × jours cochés pour chaque membre.
    const oncall = supportMembersOnDay(support, todayIso)
        .filter(m => roster.some(r => r.name === m.name && teamNameMatches(r.team, m.team)))
        .map(m => ({ ...m, color: (teamObjects.find(o => o.name === m.team) || {}).color || '#64748b' }));
    if (!oncall.length) return '';
    const chips = oncall.map(({ name, color }) => {
        const ini = initials(name);
        return `<span class="db-oncall-chip" title="${esc(name)}" style="--chip-color:${color}">
            <span class="db-oncall-avatar" style="background:${color}">${esc(ini)}</span>
            <span class="db-oncall-name">${esc(name)}</span>
        </span>`;
    }).join('');
    return `<div class="db-oncall-bar">
        <span class="db-oncall-label">🛎️ Support aujourd'hui</span>
        <div class="db-oncall-chips">${chips}</div>
    </div>`;
}

/** Frise du sprint en cours : une case par jour, puces d'avancement, évènements, sprints du PI. */
export function sprintTimelineHtml(m) {
    const { sprintInfo, ptsPct, donePts, totalPts, done, total, inprog, blocked, sprintInfoAll, team, allTickets, displayPiNum } = m;
    // Calcul positionnel du sprint : où en est-on dans la durée ?
    const _parse = s => { const d = String(s || '').slice(0,10); return d ? new Date(`${d}T00:00:00`).getTime() : NaN; };
    const sStart = _parse(sprintInfo.startDate);
    const sEnd   = _parse(sprintInfo.endDate);
    // Nom court du sprint : extrait "30.1" depuis "Fuego - Ite 30.1" ou similaire
    const _sprintShort = (() => { const m = (sprintInfo.name || '').match(/(\d+\.\d+)/); return m ? m[1] : null; })();
    // Events chevauchant le sprint
    const _allEvents = store.get('events') || [];
    const _sprintEvents = (!isNaN(sStart) && !isNaN(sEnd))
        ? _allEvents.filter(ev => {
            const es = _parse(ev.startDate), ee = _parse(ev.endDate || ev.startDate);
            return es <= sEnd && ee >= sStart;
          })
        : [];
    const _EV_ICONS = { incident:'💥', freeze:'🧊', milestone:'🚩', period:'📅', other:'ℹ️' };
    const now    = Date.now();
    const totalMs   = (!isNaN(sStart) && !isNaN(sEnd) && sEnd > sStart) ? sEnd - sStart : 0;
    const elapsedMs = totalMs ? Math.max(0, Math.min(totalMs, now - sStart)) : 0;
    const timePct   = totalMs ? Math.round((elapsedMs / totalMs) * 100) : null;
    const todayInSprint = totalMs && now >= sStart && now <= sEnd;
    const _fmt = ts => isNaN(ts) ? '' : new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
    // Nom, jour restant et stats (pts/écart/mood/fist) sont désormais dans la carte "Objectif
    // du sprint" de la bande ci-dessus ; ce bandeau ne garde que la timeline + les sprints du PI.

    // Un carré par jour calendaire du sprint (au lieu d'un dégradé continu) : chaque case
    // "rempli" représente une part du % de points réalisés (donePts/totalPts), ordonnée dans
    // le temps — la case du jour a un anneau distinct, le week-end une texture atténuée.
    // Donne une lecture immédiate de l'avance/retard jour par jour (façon heatmap), pas
    // seulement un pourcentage abstrait.
    const totalDays  = (!isNaN(sStart) && !isNaN(sEnd) && sEnd >= sStart) ? Math.round((sEnd - sStart) / 86400000) + 1 : 0;
    const todayIdx   = totalDays ? Math.floor((now - sStart) / 86400000) : -1;
    const filledCount = totalDays ? Math.round((ptsPct / 100) * totalDays) : 0;
    const pcColor = progressColor(ptsPct);

    // Détail meta : jours restants + écart avancement points vs temps écoulé (ahead/behind),
    // pour donner un jugement ("on tient le rythme ?") sans avoir à lire la rangée de carrés.
    const daysLeft = todayInSprint ? Math.max(0, Math.ceil((sEnd - now) / 86400000)) : null;
    const deltaPct = (totalDays && timePct != null) ? ptsPct - timePct : null;
    const daySquaresHtml = totalDays ? Array.from({ length: totalDays }, (_, i) => {
        const dDate = new Date(sStart + i * 86400000);
        const dow = dDate.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isToday   = i === todayIdx;
        const isPast    = i < todayIdx;
        const isFilled  = i < filledCount;
        const dLabel = dDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        const tip = [dLabel, isToday ? "Aujourd'hui" : isPast ? 'Passé' : 'À venir', isFilled ? 'Points réalisés' : null]
            .filter(Boolean).join(' · ');
        // État temporel toujours posé (passé/aujourd'hui/futur), + is-filled en overlay
        // pour la couleur d'avancement (points réalisés) — les 2 se cumulent.
        const stateCls = isToday ? 'is-today' : isPast ? 'is-past' : 'is-future';
        const cls = ['sprint-day-sq', stateCls,
            isFilled ? `is-filled ${pcColor}` : '',
            isWeekend ? 'is-weekend' : ''].filter(Boolean).join(' ');
        return `<span class="${cls}" title="${esc(tip)}"></span>`;
    }).join('') : '<span class="sprint-progress-days-empty">Dates de sprint indisponibles</span>';

    return `
<div class="sprint-header sprint-header--timeline mb-4">
    <div class="sprint-progress-wrap">
        <div class="sprint-progress-meta">
            ${_sprintShort ? `<span class="sprint-progress-label" title="${esc(sprintInfo.name)}">${esc(_sprintShort)}</span>` : ''}
            ${totalDays ? `
            <span class="sprint-progress-chip sprint-progress-chip--pts" title="${donePts}/${totalPts} pts réalisés">
                <strong class="${pcColor}">${ptsPct}%</strong> pts
            </span>
            <span class="sprint-progress-chip sprint-progress-chip--tix" title="${done}/${total} tickets terminés${inprog ? ` · ${inprog} en cours` : ''}">
                🎫 ${done}/${total}
            </span>
            <span class="sprint-progress-chip sprint-progress-chip--time" title="Temps écoulé depuis le début du sprint">
                ⏱️ ${timePct ?? '?'}% temps
            </span>
            ${(deltaPct !== null && Math.abs(deltaPct) >= 5) ? `
            <span class="sprint-progress-chip sprint-progress-chip--${deltaPct > 0 ? 'ahead' : 'behind'}" title="Écart entre l'avancement points (${ptsPct}%) et le temps écoulé (${timePct}%)">
                ${deltaPct > 0 ? '▲' : '▼'} ${Math.abs(deltaPct)}% ${deltaPct > 0 ? "d'avance" : 'de retard'}
            </span>` : ''}
            ${daysLeft !== null ? `
            <span class="sprint-progress-chip sprint-progress-chip--days" title="Jours restants avant la fin du sprint">
                📆 ${daysLeft > 0 ? `${daysLeft} j restant${daysLeft > 1 ? 's' : ''}` : 'Dernier jour'}
            </span>` : ''}
            ${blocked > 0 ? `
            <span class="sprint-progress-chip sprint-progress-chip--blocked" title="${blocked} ticket${blocked > 1 ? 's' : ''} bloqué${blocked > 1 ? 's' : ''}">
                🚫 ${blocked} bloqué${blocked > 1 ? 's' : ''}
            </span>` : ''}
            ` : ''}
            ${_sprintEvents.length ? `<span class="sprint-progress-events">${_sprintEvents.map(ev => {
                const icon = _EV_ICONS[ev.type] || 'ℹ️';
                const _fmtD = iso => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}`; };
                const dateStr = ev.endDate && ev.endDate !== ev.startDate ? `${_fmtD(ev.startDate)} → ${_fmtD(ev.endDate)}` : _fmtD(ev.startDate);
                const tip = [ev.title, dateStr, ev.description].filter(Boolean).join(' · ');
                return `<span class="sprint-ev-chip sprint-ev-chip--${ev.type || 'other'}" title="${esc(tip)}">${icon} ${esc(ev.title)}</span>`;
            }).join('')}</span>` : ''}
        </div>
        <div class="sprint-progress-days" title="Avancement points : ${donePts}/${totalPts} pts (${ptsPct}%) — Temps écoulé : ${timePct ?? '?'}%">
            ${daySquaresHtml}
        </div>
        ${!isNaN(sStart) ? `
        <div class="sprint-progress-scale">
            <span class="sprint-progress-start">${_fmt(sStart)}</span>
            ${todayInSprint ? `<span class="sprint-progress-mid" style="left:${timePct}%">${_fmt(now)}</span>` : ''}
            <span class="sprint-progress-end">${_fmt(sEnd)}</span>
        </div>` : ''}
    </div>
    ${piSprintsStripHtml(sprintInfoAll, sprintInfo, team, allTickets, displayPiNum)}
</div>`;
}

/** Bandeau d'un PI autre que le courant (pas de sprint en cours) et ses sprints. */
export function otherPiHeaderHtml(m) {
    const { sprintInfoAll, sprintInfo, team, allTickets, displayPiNum, piOffset } = m;
    // PI sélectionné ≠ courant : pas de "sprint en cours", on affiche le bandeau PI + ses sprints
    const strip = piSprintsStripHtml(sprintInfoAll, sprintInfo, team, allTickets, displayPiNum);
    return `
    <div class="sprint-header mb-4 sprint-header--other-pi">
        <div class="sprint-header-top">
            <div class="sprint-info">
                <span class="sprint-name">🗓️ PI #${displayPiNum}</span>
                <span class="sprint-dayleft">${piOffset > 0 ? `PI +${piOffset}` : `PI ${piOffset}`}</span>
            </div>
        </div>
        ${strip || '<p class="text-sm text-muted" style="padding:var(--sp-2) 0">Aucun sprint connu pour ce PI.</p>'}
    </div>`;
}

/** Indicateurs : KPI primaires puis flux & hygiène. */
export function metricsHtml(m) {
    const { metricScope, done, total, completion, ptsPct, donePts, totalPts, inprog, blocked, _flowScopeLabel, throughputPrev7, throughput7, throughputTrend, ctMedian, ltMedian, flowEffCls, flowEff, medWait, noEstimate, noAssignee } = m;
    return `
        <!-- KPI de synthèse (pleine largeur, au-dessus des deux flux) -->
        <!-- KPI primaires -->
        <div class="dashboard-metrics">
            <div class="metric-card mc-primary" data-tooltip="Tickets engagés dans le périmètre (${esc(metricScope)}), reports compris — ${done} terminés">
                <span class="metric-icon">📋</span>
                <span class="metric-label">Tickets ${metricScope} ${helpIconHtml({ key: 'flow-kpis', label: 'Comprendre les indicateurs du sprint' })}</span>
                <span class="metric-value">${total}</span>
                <span class="metric-sub">${done} terminés (${completion}%)</span>
            </div>
            <div class="metric-card ${ptsPct >= 80 ? 'mc-done' : ptsPct >= 50 ? 'mc-warning' : 'mc-danger'}" data-tooltip="Points terminés sur points engagés — vert dès 80 %, orange dès 50 %">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Story Points</span>
                <span class="metric-value">${donePts}<span class="metric-value-sub">/${totalPts}</span></span>
                <span class="metric-sub">${ptsPct}% réalisés · ${metricScope}</span>
            </div>
            <div class="metric-card mc-inprog" data-tooltip="Tickets réellement entamés (statut En cours) — hors revue, test et bloqués">
                <span class="metric-icon">🔄</span>
                <span class="metric-label">En cours</span>
                <span class="metric-value text-status-inprog">${inprog}</span>
                <span class="metric-sub">tickets actifs</span>
            </div>
            <div class="metric-card ${blocked > 0 ? 'mc-danger' : 'mc-done'}" data-tooltip="Statut bloquant ou drapeau JIRA — sans mouvement depuis 48 h, c'est l'alerte de la TV et de Santé">
                <span class="metric-icon">${blocked > 0 ? '🚫' : '✅'}</span>
                <span class="metric-label">Bloqués</span>
                <span class="metric-value ${blocked > 0 ? 'text-danger' : 'text-status-done'}">${blocked}</span>
                <span class="metric-sub">${blocked > 0 ? 'attention requise' : 'aucun impediment'}</span>
            </div>
        </div>

        <!-- Secondary indicators row (flux & hygiène) -->
        <div class="dashboard-metrics dashboard-metrics--secondary">
            <div class="metric-card mc-info" data-tooltip="Tickets terminés sur les 7 derniers jours (${esc(_flowScopeLabel)}) — tendance vs semaine précédente (${throughputPrev7})">
                <span class="metric-icon">🚀</span>
                <span class="metric-label">Débit (7j)</span>
                <span class="metric-value">${throughput7}${throughputTrend !== 0 ? `<span class="metric-trend ${throughputTrend > 0 ? 'metric-trend--up' : 'metric-trend--down'}">${throughputTrend > 0 ? '↗' : '↘'} ${throughputTrend > 0 ? '+' : ''}${throughputTrend}</span>` : ''}</span>
                <span class="metric-sub">tickets terminés / semaine</span>
            </div>
            <div class="metric-card mc-inprog" data-tooltip="Temps médian entre la mise en cours et la clôture d'un ticket">
                <span class="metric-icon">⏱️</span>
                <span class="metric-label">Cycle time méd.</span>
                <span class="metric-value">${ctMedian}<span class="metric-denom"> j</span></span>
                <span class="metric-sub">lead time méd. ${ltMedian} j</span>
            </div>
            <div class="metric-card ${flowEffCls}" data-tooltip="Flow efficiency = cycle time / lead time — part du temps réellement passée à travailler le ticket plutôt qu'à attendre en file. Repère : ~15% courant, 40%+ bon.">
                <span class="metric-icon">⚡</span>
                <span class="metric-label">Flow efficiency</span>
                <span class="metric-value">${flowEff == null ? '—' : `${flowEff}<span class="metric-denom"> %</span>`}</span>
                <span class="metric-sub">${flowEff == null ? 'pas assez de tickets terminés' : `travail ${ctMedian} j · attente ${medWait} j (médianes)`}</span>
            </div>
            <div class="metric-card ${noEstimate > 0 ? 'mc-warning' : 'mc-done'}" data-tooltip="Tickets actifs sans Story Points (${metricScope})">
                <span class="metric-icon">📝</span>
                <span class="metric-label">Sans estimation</span>
                <span class="metric-value ${noEstimate > 0 ? 'text-warning' : ''}">${noEstimate}</span>
                <span class="metric-sub">tickets actifs non estimés</span>
            </div>
            <div class="metric-card ${noAssignee > 0 ? 'mc-warning' : 'mc-done'}" data-tooltip="Tickets actifs sans responsable (${metricScope})">
                <span class="metric-icon">👤</span>
                <span class="metric-label">Sans assigné</span>
                <span class="metric-value ${noAssignee > 0 ? 'text-warning' : ''}">${noAssignee}</span>
                <span class="metric-sub">tickets actifs sans lead</span>
            </div>
        </div>`;
}

/** Flux « 🚀 Pilotage & flux » : lead / cycle time, temps par colonne, vélocité, aging WIP, prévision. */
export function flowStreamHtml(m) {
    const { _doneCT, _flowScopeLabel, _doneAll, medWait, ctMedian, ltMedian, flowEff, _flowScopeTickets, _flowCardOpts, _veloTeamChips, velocityHistory, currentSprintEntry, piInfo, _veloMax, tickets, _forecastCard } = m;
    return `
        <section class="dash-stream">
            <header class="dash-stream-hd"><h2>🚀 Pilotage &amp; flux</h2><span class="dash-stream-sub">rythme &amp; traversée</span></header>

        <!-- Charts de flux -->
        <div class="dash-stream-cards">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Lead time &amp; Cycle time ${helpIconHtml({ key: 'lct', label: 'Comprendre lead time vs cycle time' })}</span>
                    <span class="card-subtitle">${_doneCT.length} ticket${_doneCT.length !== 1 ? 's' : ''} terminé${_doneCT.length !== 1 ? 's' : ''}</span>
                    ${metricScopeHtml({ scope: _flowScopeLabel, measured: _doneCT.length, total: _doneAll.length, excludedReason: 'dates de cycle manquantes' })}
                </div>
                <!-- Schéma : Créé → (attente) → Démarré → (cycle time) → Terminé ; Lead time = total -->
                <div class="lct-schema">
                    <div class="lct-flow">
                        <span class="lct-node"><span class="lct-node-ico">📥</span><small>Créé</small></span>
                        <span class="lct-seg lct-seg--wait"><span class="lct-seg-lbl">Attente</span><span class="lct-seg-val">${medWait} j</span></span>
                        <span class="lct-node"><span class="lct-node-ico">▶️</span><small>Démarré</small></span>
                        <span class="lct-seg lct-seg--cycle"><span class="lct-seg-lbl">Cycle time</span><span class="lct-seg-val">${ctMedian} j</span></span>
                        <span class="lct-node"><span class="lct-node-ico">✅</span><small>Terminé</small></span>
                    </div>
                    <div class="lct-lead"><span class="lct-lead-lbl">⟵ Lead time médian · <strong>${ltMedian} j</strong> ⟶</span></div>
                    ${flowEff != null ? `<div class="lct-floweff" title="Flow efficiency = cycle time / lead time. Part du lead time réellement passée à travailler le ticket (le reste = attente en file). Repère : ~15% courant, 40%+ bon.">
                        <span class="lct-floweff-lbl">⚡ Flow efficiency</span>
                        <span class="lct-floweff-bar"><span class="lct-floweff-fill ${flowEff >= 40 ? 'is-good' : flowEff >= 25 ? 'is-ok' : 'is-low'}" style="width:${Math.min(100, flowEff)}%"></span></span>
                        <span class="lct-floweff-val">${flowEff}%</span>
                    </div>` : ''}
                </div>
                <div class="chart-container chart-h-md"><canvas id="chart-cycletime"></canvas></div>
            </div>
            ${stageFlowCardHtml(_flowScopeTickets, _flowCardOpts)}
            <div class="health-velo-host">
                ${_veloTeamChips}
                ${velocityCardHtml({ velocityHistory, currentSprintEntry, target: piInfo?.velocityTarget || null, maxPoints: _veloMax })}
            </div>
            <!-- Aging WIP : ancienneté du travail en cours (proactif) — à côté de la Vélocité -->
            <!-- Volontairement l'historique équipe complet et NON le périmètre du PI : le WIP est
                 par nature actuel, et les P50/P85 de référence viennent des tickets terminés —
                 les restreindre au PI affiché rétrécirait l'échantillon sans rien gagner.
                 (Pas de backtick dans ce commentaire : il fermerait la template literal.) -->
            ${agingWipCardHtml(tickets)}
            <!-- Prévision Monte-Carlo : va-t-on finir le sprint courant à temps ? -->
            ${_forecastCard}
        </div>
        </section>`;
}

/** Cartes « Équipes » (plusieurs équipes) : points nets / buffer réalisés. */
export function teamsCardsHtml(m) {
    const { teams, byTeam, teamObjects } = m;
    const _teamsCards = teams.length > 1 ? (() => {
        const _isBuf = isBufferItem;
        return `
        <h3 class="section-title">Équipes</h3>
        <div class="team-cards mb-4">
            ${teams.map((t, i) => {
                const tt    = byTeam.get(t) || [];
                const done  = tt.filter(x => x.status === 'done');
                const b     = countBlocked(tt);
                const tObj  = teamObjects.find(o => o.name === t);
                const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];
                const netDone    = done.filter(x => !_isBuf(x));
                const bufDone    = done.filter(x => _isBuf(x));
                const spNetDone  = sumBy(netDone, x => x.points);
                const spBufDone  = sumBy(bufDone, x => x.points);
                const netAll     = tt.filter(x => !_isBuf(x));
                const bufAll     = tt.filter(x => _isBuf(x));
                const spNetRaw   = sumBy(netAll, x => x.points);
                const spBufRaw   = sumBy(bufAll, x => x.points);
                const spNetTotal = spNetRaw || 1;
                const spBufTotal = spBufRaw || 1;
                const netFill = Math.round(Math.min(spNetDone / spNetTotal, 1) * 100);
                const bufFill = Math.round(Math.min(spBufDone / spBufTotal, 1) * 100);
                const tipNet = `${spNetDone} SP nets réalisés / ${spNetRaw} estimés (${netFill}%)`;
                const tipBuf = `${spBufDone} SP buffer réalisés / ${spBufRaw} estimés (${bufFill}%)`;
                return `
                <div class="team-card" style="--team-card-color:${color}">
                    <div class="team-card-header">
                        <span class="team-card-name inline-flex-center">
                            <span class="team-dot" style="background:${color}"></span>
                            ${esc(t)}
                        </span>
                        ${b > 0 ? `<span class="team-card-stat team-card-stat--blocked" title="${b} bloqué${b>1?'s':''}">⚠ ${b}</span>` : ''}
                    </div>
                    <div class="picap-sp-row dash-sp-row">
                        <div class="picap-sp-bars">
                            <div class="picap-sp-net" style="flex:${spNetTotal}">
                                <div class="picap-sp-real-fill picap-sp-real-fill--net" style="width:${netFill}%" title="${esc(tipNet)}"></div>
                                <span class="picap-sp-val">${spNetDone}</span>
                                <span class="picap-sp-lbl">SP <em class="picap-sp-real-hint">/ ${sumBy(netAll, x => x.points)}</em></span>
                            </div>
                            ${spBufTotal > 1 ? `
                            <div class="picap-sp-buf" style="flex:${spBufTotal}">
                                <div class="picap-sp-real-fill picap-sp-real-fill--buf" style="width:${bufFill}%" title="${esc(tipBuf)}"></div>
                                <span class="picap-sp-val">${spBufDone}</span>
                                <span class="picap-sp-lbl">buf</span>
                            </div>` : ''}
                        </div>
                        <span class="picap-sp-total">≈&thinsp;${spNetRaw + spBufRaw} SP</span>
                    </div>
                    <div class="team-card-stats">
                        <span class="team-card-stat" title="Tickets terminés / total">✓ ${done.length}/${tt.length}</span>
                        <span class="team-card-stat" title="SP réalisés / total">${spNetDone + spBufDone}/${sumBy(tt, x => x.points)} pts</span>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    })() : '';
    return _teamsCards;
}

/** Flux « 👥 Équipe & risques » : avancement du PI, équipes, SLA, bloqués, activité. */
export function teamStreamHtml(m) {
    const { _pipModel, _psrHtml, tickets, stuckTickets, STALE_DAYS } = m;
    return `
        <section class="dash-stream">
            <header class="dash-stream-hd"><h2>👥 Équipe &amp; risques</h2><span class="dash-stream-sub">santé &amp; signaux</span></header>
        <div class="dash-stream-cards"><!-- conteneur des cartes : repliable (collapsible.js), comme le 1er flux -->

        ${piProgressHtml(_pipModel, { statesHtml: _psrHtml })}

        ${teamsCardsHtml(m)}

        <!-- SLA Review : respect du seuil de cycle time -->
        ${slaReviewCardHtml(tickets)}

        <!-- Tickets bloqués ou stagnants (même état depuis longtemps) — components/stuck_card.js -->
        ${stuckCardHtml({ items: stuckTickets, staleDays: STALE_DAYS })}

        <!-- Recent Activity (composant partagé) -->
        ${renderActivityCard(tickets, { max: 15, scope: 'dashboard' })}
        </div>
        </section>`;
}
