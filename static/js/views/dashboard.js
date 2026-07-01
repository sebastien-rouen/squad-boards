/**
 * Dashboard view - overview metrics, team cards, recent activity.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, pct, progressColor, filterByTeam, groupBy, sumBy, fmtRelative, hashColor, getSprintForTeam, computeVelocityHistory, computeCurrentSprintEntry, getCurrentPi, extractPiNum, resolvePiObjectives, isBufferItem, countBlocked, throughputSince, toast, supportWorkingDays, supportDaysForMember, initials } from '../utils.js';
import { TEAM_COLORS } from '../config.js';
import { renderCycleTime } from '../components/charts.js';
import { renderActivityCard, bindActivityClicks } from '../components/activity.js';
import { velocityCardHtml, mountVelocityChart } from '../components/velocity_card.js';

export function renderDashboard(container) {
    const team = store.get('team');
    const groupId = store.get('group');
    const allTickets = store.get('tickets') || [];
    const tickets = filterByTeam(allTickets, team);
    // Features filtrées par équipe (champ team = Team[Team] JIRA). 'all' sans groupe → vue globale.
    const features = filterByTeam(store.get('features') || [], team);
    const allTeams = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const groups = store.get('groups') || [];

    // Filter teams to only show selected team or group
    let teams = allTeams;
    if (groupId) {
        const g = groups.find(x => x.id === groupId);
        if (g?.teams?.length) teams = allTeams.filter(t => g.teams.includes(t));
    } else if (team && team !== 'all') {
        teams = allTeams.filter(t => t === team);
    }
    // Vélocité : dérivée à la volée depuis les sprints clôturés + tickets done.
    // velocityHistory = sprints CLOS uniquement (stats/KPIs) ; currentSprintEntry = sprint actif.
    // Périmètre large (plusieurs équipes) → on affiche UNE équipe à la fois via un sélecteur,
    // sinon le graphe agrège les sprints de toutes les équipes et devient illisible.
    let _veloSel = (team && team !== 'all' && teams.includes(team)) ? team : null;
    if (!_veloSel) {
        const _saved = localStorage.getItem('sb-dash-velo-team');
        _veloSel = (_saved && teams.includes(_saved)) ? _saved : (teams[0] || null);
    }
    const _veloMax = 16;   // n'affiche que les derniers sprints (lisibilité)
    const velocityHistory = computeVelocityHistory(allTickets, store.get('sprintInfo'), _veloSel || team);
    const currentSprintEntry = computeCurrentSprintEntry(allTickets, store.get('sprintInfo'), _veloSel || team);
    const _veloTeamChips = teams.length > 1
        ? `<div class="health-velo-teams"><span class="health-velo-teams-lbl">Vélocité par équipe :</span>${teams.map(tm => `<button class="health-velo-team-chip${tm === _veloSel ? ' is-active' : ''}" data-velo-team="${esc(tm)}">${esc(tm)}</button>`).join('')}</div>`
        : '';
    // sprintInfoAll = objet global avec teamSprints[] (pour la liste des sprints du PI)
    // sprintInfo    = sprint actif de l'équipe sélectionnée (pour la card principale)
    const sprintInfoAll = store.get('sprintInfo');
    const sprintInfo = getSprintForTeam(team, sprintInfoAll);
    const piInfo = store.get('piInfo');

    // PI affiché = PI courant + offset du sélecteur topbar (-2..+2)
    const piOffset = store.get('piOffset') || 0;
    // PI COURANT (offset 0) = source unique getCurrentPi (sprint actif > piInfo.number).
    const _basePiNum = getCurrentPi({ sprintInfo: sprintInfoAll, piInfo });
    const displayPiNum = _basePiNum ? Math.max(1, _basePiNum + piOffset) : 0;

    // Atteinte des PI Objectives (SAFe predictability score)
    // Score = Σ BV livrés (commits done) / Σ BV planifiés (commits)
    // Stretch livré = bonus au numérateur (peut dépasser 100%)
    // Objectifs du PI affiché.
    // Résolution courant-vs-snapshot déléguée à resolvePiObjectives (source unique partagée
    // avec pi.js renderObjectives) — supprime le footgun « doit rester cohérent ».
    const _rawObjs = resolvePiObjectives({ piInfo, piNum: displayPiNum, isCurrentPi: piOffset === 0 });
    // _idx = position dans le tableau live piInfo.objectives — conservé après filtre/tri pour
    // pouvoir réécrire le bon objectif lors de l'édition inline depuis le Dashboard.
    const piObjs = _rawObjs
        .map((o, i) => ({ ...o, _idx: i }))
        .filter(o => (o.text || '').trim());
    const teamObjs = (team && team !== 'all') ? piObjs.filter(o => (o.team || '') === team) : piObjs;
    const _bv = o => Math.max(0, Math.min(10, parseInt(o.bv) || 0));
    const commitObjs   = teamObjs.filter(o => o.committed);
    const stretchObjs  = teamObjs.filter(o => !o.committed);
    const commitTotal  = sumBy(commitObjs, _bv);
    const commitDone   = sumBy(commitObjs.filter(o => o.status === 'done'), _bv);
    const stretchDone  = sumBy(stretchObjs.filter(o => o.status === 'done'), _bv);
    const piScore      = commitTotal > 0 ? Math.round(((commitDone + stretchDone) / commitTotal) * 100) : null;
    const piScoreColor = piScore == null ? 'mc-info'
                       : piScore >= 100 ? 'mc-done'
                       : piScore >= 80  ? 'mc-warning'
                       : 'mc-danger';

    // Extraction du PI depuis le sprint name d'un ticket (source unique extractPiNum)
    const _ticketPiNum = t => extractPiNum(t.sprintName || t.piSprint || '');

    // Scope des métriques : sprint courant (piOffset=0) ou tickets du PI sélectionné
    const isCurrentPi = piOffset === 0;
    const _scopeTickets = ts => isCurrentPi
        ? (sprintInfo
            ? ts.filter(t => t.sprintName === sprintInfo.name
                || (Array.isArray(t.allSprints) && t.allSprints.includes(sprintInfo.name)))
            : ts)
        : (displayPiNum ? ts.filter(t => _ticketPiNum(t) === displayPiNum) : ts);

    const displayTickets = _scopeTickets(tickets);
    const metricScope = isCurrentPi ? 'Sprint' : `PI #${displayPiNum}`;

    const total = displayTickets.length;
    const done = displayTickets.filter(t => t.status === 'done').length;
    const inprog = displayTickets.filter(t => t.status === 'inprog').length;
    const blocked = countBlocked(displayTickets);
    const totalPts = sumBy(displayTickets, t => t.points);
    const donePts = sumBy(displayTickets.filter(t => t.status === 'done'), t => t.points);
    const completion = pct(done, total);
    const ptsPct = pct(donePts, totalPts);

    // ── Indicateurs de flux (cycle/lead time) — calculés sur l'historique team complet ──
    // (pas seulement le sprint courant, pour avoir assez de tickets terminés)
    const _nowMs = Date.now();
    const DAY_MS = 86400000;
    const _median = arr => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2 * 10) / 10;
    };
    const _doneCT = tickets.filter(t => t.status === 'done' && t.cycleTimeDays > 0);
    const _ltVals = _doneCT.map(t => t.leadTimeDays > 0 ? t.leadTimeDays : t.cycleTimeDays);
    const ctMedian = _median(_doneCT.map(t => t.cycleTimeDays));
    const ltMedian = _median(_ltVals);
    const avgCT = _doneCT.length ? Math.round(_doneCT.reduce((s, t) => s + t.cycleTimeDays, 0) / _doneCT.length * 10) / 10 : 0;
    const avgLT = _ltVals.length ? Math.round(_ltVals.reduce((s, v) => s + v, 0) / _ltVals.length * 10) / 10 : 0;
    const avgWait = Math.max(0, Math.round((avgLT - avgCT) * 10) / 10);

    // Débit (throughput) : tickets terminés sur les 7 derniers jours (team complet) — helper unique
    const throughput7 = throughputSince(tickets, 7);
    // Hygiène backlog (périmètre courant) : actifs non estimés / non assignés
    const noEstimate = displayTickets.filter(t => t.status !== 'done' && !(t.points > 0)).length;
    const noAssignee = displayTickets.filter(t => t.status !== 'done' && !t.leader).length;

    // ── Tickets bloqués / stagnants (même état depuis longtemps) ──────────────
    // Seuil de stagnation éditable (champ discret dans la card), persisté en localStorage.
    const _staleRaw = parseInt(localStorage.getItem('sb-dash-stale-days') || '', 10);
    const STALE_DAYS = (!isNaN(_staleRaw) && _staleRaw >= 1 && _staleRaw <= 365) ? _staleRaw : 5;
    const _daysSince = iso => iso ? Math.max(0, Math.round((_nowMs - new Date(iso).getTime()) / DAY_MS)) : null;
    // ⚠ NE PAS utiliser `updatedAt` : c'est l'horodatage d'écriture en base (= heure de sync),
    // pas la dernière activité JIRA → vaudrait 0 pour tous les tickets après une sync.
    // « Sans mouvement » = temps écoulé depuis le dernier mouvement de STATUT connu, soit le plus
    // récent entre l'entrée en cours (`startedDate`) et le dernier changement de statut du changelog.
    const _lastStatusChange = t => {
        let d = null;
        for (const c of (t.recentChanges || [])) {
            if (/^status$/i.test(c.field || '') && c.date && (!d || c.date > d)) d = c.date;
        }
        return d;
    };
    const _stagDays = t => {
        const dates = [t.startedDate, _lastStatusChange(t)].filter(Boolean);
        if (!dates.length) return null;
        const mostRecent = dates.reduce((a, b) => (a > b ? a : b));
        return _daysSince(mostRecent);
    };
    const stuckTickets = tickets
        .filter(t => t.status !== 'done')
        .map(t => ({ t, stag: _stagDays(t) }))
        .filter(({ t, stag }) => t.status === 'blocked' || (stag != null && stag >= STALE_DAYS))
        .sort((a, b) => (b.stag ?? 0) - (a.stag ?? 0))
        .slice(0, 12);

    // Recent changes — délégué au composant activity.js

    // Team breakdown (scopé sur le même périmètre que les métriques)
    const byTeam = groupBy(_scopeTickets(allTickets), t => t.team);

    // ── Mood + Fist (votes filtrés par sprint actif + équipe) ─────────────
    const _sprintLbl = (String(sprintInfo?.name || '').match(/(\d+\.\d+)/) || [])[1] || '';
    const _voteOk = v => (!team || team === 'all' || v.team === team)
        && (!_sprintLbl || (v.piSprint && (v.piSprint === _sprintLbl || v.piSprint.includes(_sprintLbl)
            || (sprintInfo?.name && (v.piSprint === sprintInfo.name || sprintInfo.name.includes(v.piSprint))))));
    const _vStats = arr => {
        if (!arr.length) return null;
        const dist = [0,0,0,0,0,0]; let s = 0;
        for (const v of arr) { const n = parseInt(v.value) || 0; if (n>=1&&n<=5) { dist[n]++; s+=n; } }
        return { avg: Math.round((s/arr.length)*10)/10, count: arr.length, dist };
    };
    const moodSt = _vStats((store.get('moodVotes') || []).filter(_voteOk));
    const fistSt = _vStats((store.get('fistVotes') || []).filter(_voteOk));
    const _face = n => ({ 1:'😞', 2:'😕', 3:'😐', 4:'🙂', 5:'😄' }[Math.round(n)] || '❓');
    const _vColor = n => n >= 4 ? 'var(--success)' : n >= 3 ? 'var(--warning)' : 'var(--danger)';

    // ── "Cette semaine" : activité par jour (J-4 à J0) ─────────────────────
    const today = new Date();
    today.setHours(0,0,0,0);
    const wkDays = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (4 - i));
        const iso = d.toISOString().slice(0, 10);
        const dayLbl = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
        const isToday = iso === today.toISOString().slice(0, 10);
        // Tickets résolus ce jour
        const done = allTickets.filter(t => (t.resolvedDate || '').slice(0, 10) === iso && (team === 'all' || t.team === team));
        const donePts = sumBy(done, t => t.points || 0);
        // Blockers résolus = tickets dont status est passé de blocked à autre ce jour-là (approx via recentChanges)
        // Faute de mieux : on ne distingue pas, on affiche done global.
        return { iso, dayLbl, isToday, doneCount: done.length, donePts };
    });

    container.innerHTML = `
        ${(sprintInfo && piOffset === 0) ? (() => {
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
            // Indicateur d'écart pts vs temps : positif = avance, négatif = retard
            const delta = (timePct != null) ? ptsPct - timePct : null;
            const deltaCls = delta == null ? '' : delta >= 0 ? 'sprint-delta--ahead' : 'sprint-delta--behind';
            const deltaTxt = delta == null ? '' : delta >= 0 ? `+${delta}% d'avance` : `${delta}% de retard`;

            const dayLabel = !isNaN(sEnd) && now > sEnd ? 'Terminé'
                           : !isNaN(sEnd) && now < sStart ? `Démarre dans ${Math.ceil((sStart - now) / 86400000)}j`
                           : !isNaN(sEnd) ? (() => {
                                const d = Math.ceil((sEnd - now) / 86400000);
                                return d <= 0 ? 'Dernier jour' : d === 1 ? 'J-1' : `J-${d}`;
                             })() : '';
            return `
        <div class="sprint-header mb-4">
            <div class="sprint-header-top">
                <div class="sprint-info">
                    <span class="sprint-name">📌 ${esc(sprintInfo.name)}</span>
                    ${dayLabel ? `<span class="sprint-dayleft ${deltaCls === 'sprint-delta--behind' ? 'sprint-dayleft--warn' : ''}">${esc(dayLabel)}</span>` : ''}
                </div>
                <div class="sprint-header-stats">
                    <span class="sprint-stat-chip" title="Story points livrés / total">
                        <strong>${donePts}</strong><span class="sep">/</span>${totalPts} <small>pts</small>
                    </span>
                    ${deltaTxt ? `<span class="sprint-stat-chip ${deltaCls}" title="Écart entre l'avancement points et le temps écoulé">${deltaTxt}</span>` : ''}
                    ${moodSt ? `<span class="sprint-stat-chip dash-vote-chip" title="Mood Meter — ${moodSt.count} vote(s)" style="border-color:${_vColor(moodSt.avg)}">🎭 ${_face(moodSt.avg)} <strong>${moodSt.avg}</strong><small>/5</small></span>` : ''}
                    ${fistSt ? `<span class="sprint-stat-chip dash-vote-chip" title="Fist of Five — ${fistSt.count} vote(s)" style="border-color:${_vColor(fistSt.avg)}">✊ <strong>${fistSt.avg}</strong><small>/5</small></span>` : ''}
                </div>
            </div>
            ${sprintInfo.goal ? `<div class="sprint-goal-line">🎯 ${esc(sprintInfo.goal)}</div>` : ''}
            <div class="sprint-progress-wrap">
                <div class="sprint-progress-meta">
                    ${_sprintShort ? `<span class="sprint-progress-label" title="${esc(sprintInfo.name)}">${esc(_sprintShort)}</span>` : ''}
                    ${_sprintEvents.length ? `<span class="sprint-progress-events">${_sprintEvents.map(ev => {
                        const icon = _EV_ICONS[ev.type] || 'ℹ️';
                        const _fmtD = iso => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}`; };
                        const dateStr = ev.endDate && ev.endDate !== ev.startDate ? `${_fmtD(ev.startDate)} → ${_fmtD(ev.endDate)}` : _fmtD(ev.startDate);
                        const tip = [ev.title, dateStr, ev.description].filter(Boolean).join(' · ');
                        return `<span class="sprint-ev-chip sprint-ev-chip--${ev.type || 'other'}" title="${esc(tip)}">${icon} ${esc(ev.title)}</span>`;
                    }).join('')}</span>` : ''}
                </div>
                <div class="sprint-progress-bar" title="Avancement points : ${donePts}/${totalPts} pts (${ptsPct}%) — Temps écoulé : ${timePct ?? '?'}%">
                    <div class="sprint-progress-time" style="width:${timePct ?? 0}%" title="Temps écoulé : ${timePct ?? '?'}%"></div>
                    <div class="sprint-progress-pts ${progressColor(ptsPct)}" style="width:${ptsPct}%"></div>
                    ${todayInSprint ? `<div class="sprint-progress-today" style="left:${timePct}%" title="Aujourd'hui · ${_fmt(now)}"></div>` : ''}
                    ${ptsPct > 0 ? `<span class="sprint-progress-pts-label" style="left:${Math.min(ptsPct, 95)}%">${ptsPct}%</span>` : ''}
                </div>
                ${!isNaN(sStart) ? `
                <div class="sprint-progress-scale">
                    <span class="sprint-progress-start">${_fmt(sStart)}</span>
                    ${todayInSprint ? `<span class="sprint-progress-mid" style="left:${timePct}%">${_fmt(now)}</span>` : ''}
                    <span class="sprint-progress-end">${_fmt(sEnd)}</span>
                </div>` : ''}
            </div>
            ${_renderPiSprintsStrip(sprintInfoAll, sprintInfo, team, allTickets, displayPiNum)}
        </div>`;
        })() : ''}

        ${(piOffset !== 0 && displayPiNum) ? (() => {
            // PI sélectionné ≠ courant : pas de "sprint en cours", on affiche le bandeau PI + ses sprints
            const strip = _renderPiSprintsStrip(sprintInfoAll, sprintInfo, team, allTickets, displayPiNum);
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
        })() : ''}

        <!-- Metrics row -->
        <div class="dashboard-metrics">
            <div class="metric-card mc-primary">
                <span class="metric-icon">📋</span>
                <span class="metric-label">Tickets ${metricScope}</span>
                <span class="metric-value">${total}</span>
                <span class="metric-sub">${done} terminés (${completion}%)</span>
            </div>
            <div class="metric-card ${ptsPct >= 80 ? 'mc-done' : ptsPct >= 50 ? 'mc-warning' : 'mc-danger'}">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Story Points</span>
                <span class="metric-value">${donePts}<span class="metric-value-sub">/${totalPts}</span></span>
                <span class="metric-sub">${ptsPct}% réalisés · ${metricScope}</span>
            </div>
            <div class="metric-card mc-inprog">
                <span class="metric-icon">🔄</span>
                <span class="metric-label">En cours</span>
                <span class="metric-value text-status-inprog">${inprog}</span>
                <span class="metric-sub">tickets actifs</span>
            </div>
            <div class="metric-card ${blocked > 0 ? 'mc-danger' : 'mc-done'}">
                <span class="metric-icon">${blocked > 0 ? '🚫' : '✅'}</span>
                <span class="metric-label">Bloqués</span>
                <span class="metric-value ${blocked > 0 ? 'text-danger' : 'text-status-done'}">${blocked}</span>
                <span class="metric-sub">${blocked > 0 ? 'attention requise' : 'aucun impediment'}</span>
            </div>
        </div>

        <!-- Secondary indicators row (flux & hygiène) -->
        <div class="dashboard-metrics dashboard-metrics--secondary">
            <div class="metric-card mc-info" title="Tickets terminés sur les 7 derniers jours (équipe complète)">
                <span class="metric-icon">🚀</span>
                <span class="metric-label">Débit (7j)</span>
                <span class="metric-value">${throughput7}</span>
                <span class="metric-sub">tickets terminés / semaine</span>
            </div>
            <div class="metric-card mc-inprog" title="Temps médian entre la mise en cours et la clôture d'un ticket">
                <span class="metric-icon">⏱️</span>
                <span class="metric-label">Cycle time méd.</span>
                <span class="metric-value">${ctMedian}<span class="metric-denom"> j</span></span>
                <span class="metric-sub">lead time méd. ${ltMedian} j</span>
            </div>
            <div class="metric-card ${noEstimate > 0 ? 'mc-warning' : 'mc-done'}" title="Tickets actifs sans Story Points (${metricScope})">
                <span class="metric-icon">📝</span>
                <span class="metric-label">Sans estimation</span>
                <span class="metric-value ${noEstimate > 0 ? 'text-warning' : ''}">${noEstimate}</span>
                <span class="metric-sub">tickets actifs non estimés</span>
            </div>
            <div class="metric-card ${noAssignee > 0 ? 'mc-warning' : 'mc-done'}" title="Tickets actifs sans responsable (${metricScope})">
                <span class="metric-icon">👤</span>
                <span class="metric-label">Sans assigné</span>
                <span class="metric-value ${noAssignee > 0 ? 'text-warning' : ''}">${noAssignee}</span>
                <span class="metric-sub">tickets actifs sans lead</span>
            </div>
        </div>

        <!-- Widget : qui est en support aujourd'hui -->
        ${(() => {
            const todayIso = new Date().toISOString().slice(0, 10);
            const support  = store.get('support') || [];
            const teamObjects = store.get('teamObjects') || [];
            const curEntries = support.filter(s => s.weekStart <= todayIso && s.weekEnd >= todayIso);
            if (!curEntries.length) return '';
            // Pour chaque entrée, filtre les membres qui couvrent réellement aujourd'hui
            const oncall = curEntries.flatMap(entry => {
                const wd     = supportWorkingDays(entry.weekStart);
                const todayWd = wd.find(d => d.iso === todayIso);
                if (!todayWd) return [];
                return (entry.members || []).filter(m => {
                    const days = supportDaysForMember(entry, m);
                    return days.includes(todayWd.index);
                }).map(m => ({ name: m, team: entry.team, color: (teamObjects.find(o => o.name === entry.team) || {}).color || '#64748b' }));
            });
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
        })()}

        <!-- Team Cards — affiché seulement si >1 équipe -->
        ${teams.length > 1 ? (() => {
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

                // SP nets (hors buffer) + SP buffer réalisés
                const netDone    = done.filter(x => !_isBuf(x));
                const bufDone    = done.filter(x => _isBuf(x));
                const spNetDone  = sumBy(netDone, x => x.points);
                const spBufDone  = sumBy(bufDone, x => x.points);

                // SP totaux estimés (hors buffer) pour la largeur des barres
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
        })() : ''}

        ${(!teamObjs.length && displayPiNum) ? `
        <!-- Aucun objectif enregistré pour ce PI (ni jeu courant, ni snapshot pi_objectives) -->
        <h3 class="section-title">Objectifs PI #${displayPiNum}${team && team !== 'all' ? ` — ${esc(team)}` : ''}</h3>
        <div class="card pi-obj-attain mc-info">
            <div class="pi-obj-empty-cta" style="padding:var(--sp-3)">
                <p class="text-sm text-muted" style="margin:0 0 var(--sp-2)">
                    Aucun objectif enregistré pour le PI #${displayPiNum}${team && team !== 'all' ? ` (équipe ${esc(team)})` : ''}.
                    Saisissez-les dans <strong>PI Planning → Objectifs</strong>.
                </p>
                <a class="btn btn-secondary btn-sm" id="pi-obj-add" href="#pi/${groupId ? 'group:' + encodeURIComponent(groupId) : encodeURIComponent(team || 'all')}/objectives">+ Ajouter un objectif</a>
            </div>
        </div>` : ''}
        ${teamObjs.length ? `
        <!-- PI Objectives — atteinte (Predictability score SAFe) -->
        <h3 class="section-title">Objectifs PI${displayPiNum ? ' #' + displayPiNum : ''}${team && team !== 'all' ? ` — ${esc(team)}` : ''}</h3>
        <div class="card pi-obj-attain ${piScoreColor}">
            <div class="pi-obj-attain-hdr">
                <div class="pi-obj-attain-score">
                    <span class="pi-obj-attain-num">${piScore == null ? '—' : piScore + '%'}</span>
                    <span class="pi-obj-attain-label">Atteinte ${commitDone}/${commitTotal} BV commis${stretchDone > 0 ? ` <small>+${stretchDone} BV stretch</small>` : ''}</span>
                </div>
                <div class="pi-obj-attain-summary">
                    <span class="pi-obj-summary-item">📌 <strong>${commitObjs.length}</strong> commis</span>
                    <span class="pi-obj-summary-item">🎯 <strong>${stretchObjs.length}</strong> stretch</span>
                    <span class="pi-obj-summary-item pi-obj-summary-item--done">✓ <strong>${teamObjs.filter(o => o.status === 'done').length}</strong> atteints</span>
                    <span class="pi-obj-summary-item pi-obj-summary-item--inprog">▶ <strong>${teamObjs.filter(o => o.status === 'inprog').length}</strong> en cours</span>
                    <span class="pi-obj-summary-item pi-obj-summary-item--todo">○ <strong>${teamObjs.filter(o => o.status === 'todo' || !o.status).length}</strong> à faire</span>
                </div>
            </div>
            ${piScore != null ? `
            <div class="pi-obj-attain-bar" title="Atteinte = (BV commis livrés + BV stretch livrés) / BV commis total">
                <div class="pi-obj-attain-bar-track">
                    <div class="pi-obj-attain-bar-fill" style="width:${Math.min(100, piScore)}%"></div>
                    ${piScore > 100 ? `<div class="pi-obj-attain-bar-bonus" style="left:100%; width:${Math.min(20, piScore - 100)}%" title="Stretch livré au-delà des commits"></div>` : ''}
                    <div class="pi-obj-attain-bar-target" style="left:80%" title="Cible SAFe : 80%"></div>
                </div>
                <div class="pi-obj-attain-bar-scale">
                    <span>0</span><span>80% <small>cible</small></span><span>100%</span>
                </div>
            </div>` : '<div class="text-sm text-muted">Aucun objectif commis défini — ajouter via PI Planning → Objectifs</div>'}
            <div class="pi-obj-attain-list">
                ${(() => {
                    const _stCls = o => o.status === 'done' ? 'done' : o.status === 'inprog' ? 'inprog' : o.status === 'blocked' ? 'blocked' : 'todo';
                    const _icon  = o => o.status === 'done' ? '✓' : o.status === 'inprog' ? '◐' : o.status === 'blocked' ? '⚠' : '○';
                    const _row   = o => {
                        // Commis/Stretch : bouton cliquable sur le PI courant, simple badge sinon.
                        const kind = isCurrentPi
                            ? `<button type="button" class="pi-obj-kind pi-obj-kind--${o.committed ? 'commit' : 'stretch'}" data-obj-toggle-committed title="Cliquer pour basculer Commis/Stretch">${o.committed ? 'Commis' : 'Stretch'}</button>`
                            : (o.committed
                                ? `<span class="pi-obj-kind pi-obj-kind--commit">Commis</span>`
                                : `<span class="pi-obj-kind pi-obj-kind--stretch">Stretch</span>`);
                        // Édition inline (texte, statut, commis, BV) uniquement sur le PI courant — pour un PI
                        // passé les objectifs sont un snapshot figé, édités via PI Planning si déverrouillé.
                        return `<div class="pi-obj-attain-item pi-obj-attain-item--${_stCls(o)}${isCurrentPi ? ' pi-obj-attain-item--editable' : ''}" data-obj-idx="${o._idx}" title="${esc(o.text || '')}">
                            <span class="pi-obj-attain-icon"${isCurrentPi ? ' data-obj-cycle-status title="Cliquer pour changer le statut"' : ''}>${_icon(o)}</span>
                            <span class="pi-obj-attain-text"${isCurrentPi ? ' data-obj-edit-text contenteditable="true" spellcheck="false" title="Cliquer pour modifier"' : ''}>${esc(o.text || 'Sans titre')}</span>
                            ${kind}
                            <span class="pi-obj-attain-bv" title="Business Value">BV <span${isCurrentPi ? ' data-obj-edit-bv contenteditable="true" spellcheck="false" title="Cliquer pour modifier (0–10)"' : ''}>${_bv(o)}</span></span>
                        </div>`;
                    };
                    const _sortObjs = list => list.slice().sort((a, b) =>
                        (a.committed === b.committed ? 0 : a.committed ? -1 : 1) || _bv(b) - _bv(a)
                    );

                    // Vue équipe unique : pas de groupement
                    if (team && team !== 'all') {
                        return _sortObjs(teamObjs).map(_row).join('');
                    }

                    // Vue globale : grouper par équipe, triées alphabétiquement
                    const byTeamMap = new Map();
                    for (const o of teamObjs) {
                        const k = o.team || '—';
                        if (!byTeamMap.has(k)) byTeamMap.set(k, []);
                        byTeamMap.get(k).push(o);
                    }
                    return [...byTeamMap.entries()]
                        .sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
                        .map(([teamName, objs]) => {
                            const tObj  = teamObjects.find(o => o.name === teamName);
                            const color = tObj?.color || 'var(--border)';
                            const done  = objs.filter(o => o.status === 'done').length;
                            return `
                            <div class="pi-obj-team-group">
                                <div class="pi-obj-team-hdr">
                                    <span class="pi-obj-team-dot" style="background:${color}"></span>
                                    <span class="pi-obj-team-name">${esc(teamName)}</span>
                                    <span class="pi-obj-team-count">${done}/${objs.length}</span>
                                </div>
                                ${_sortObjs(objs).map(_row).join('')}
                            </div>`;
                        }).join('');
                })()}
            </div>
        </div>` : ''}

        <!-- Charts row -->
        <div class="dashboard-grid">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Lead time &amp; Cycle time</span>
                    <span class="card-subtitle">${_doneCT.length} ticket${_doneCT.length !== 1 ? 's' : ''} terminé${_doneCT.length !== 1 ? 's' : ''}</span>
                </div>
                <!-- Schéma : Créé → (attente) → Démarré → (cycle time) → Terminé ; Lead time = total -->
                <div class="lct-schema">
                    <div class="lct-flow">
                        <span class="lct-node"><span class="lct-node-ico">📥</span><small>Créé</small></span>
                        <span class="lct-seg lct-seg--wait"><span class="lct-seg-lbl">Attente</span><span class="lct-seg-val">${avgWait} j</span></span>
                        <span class="lct-node"><span class="lct-node-ico">▶️</span><small>Démarré</small></span>
                        <span class="lct-seg lct-seg--cycle"><span class="lct-seg-lbl">Cycle time</span><span class="lct-seg-val">${avgCT} j</span></span>
                        <span class="lct-node"><span class="lct-node-ico">✅</span><small>Terminé</small></span>
                    </div>
                    <div class="lct-lead"><span class="lct-lead-lbl">⟵ Lead time moyen · <strong>${avgLT} j</strong> ⟶</span></div>
                </div>
                <div class="chart-container chart-h-md"><canvas id="chart-cycletime"></canvas></div>
            </div>
            <div class="health-velo-host">
                ${_veloTeamChips}
                ${velocityCardHtml({ velocityHistory, currentSprintEntry, target: piInfo?.velocityTarget || null, maxPoints: _veloMax })}
            </div>
        </div>

        <!-- Tickets bloqués ou stagnants (même état depuis longtemps) -->
        <div class="card mt-4">
            <div class="card-header">
                <span class="card-title">Tickets bloqués ou stagnants</span>
                <span class="card-subtitle">bloqués, ou sans mouvement depuis ≥
                    <input type="number" id="stuck-stale-days" class="inline-num-edit" min="1" max="365" step="1"
                        value="${STALE_DAYS}" title="Seuil de stagnation (jours) — modifiable" aria-label="Seuil de stagnation en jours"> j</span>
            </div>
            <div class="stuck-list">
                ${stuckTickets.length ? stuckTickets.map(({ t, stag }) => {
                    const _STL = { todo: 'À faire', inprog: 'En cours', review: 'Revue', test: 'Test', blocked: 'Bloqué', done: 'Terminé' };
                    const ageCls = stag == null ? '' : stag >= 14 ? 'is-danger' : stag >= STALE_DAYS ? 'is-warn' : '';
                    const ageTxt = stag == null ? '—' : `${stag} j`;
                    const ageTip = stag == null
                        ? 'Ancienneté inconnue (pas de date de mise en cours)'
                        : `En l'état depuis ${stag} jour${stag > 1 ? 's' : ''}`;
                    return `
                    <button class="stuck-row" data-ticket="${esc(t.id)}" title="Ouvrir ${esc(t.id)} — ${esc(t.jiraStatus || _STL[t.status] || t.status)}">
                        <span class="stuck-dot" style="background:var(--status-${esc(t.status)}, var(--text-muted))"></span>
                        <span class="stuck-id">${esc(t.id)}</span>
                        <span class="stuck-title">${esc(t.title || '')}</span>
                        <span class="stuck-state stuck-state--${esc(t.status)}">${esc(t.jiraStatus || _STL[t.status] || t.status)}</span>
                        <span class="stuck-lead${t.leader ? '' : ' stuck-lead--none'}">${esc(t.leader || 'Non assigné')}</span>
                        <span class="stuck-age ${ageCls}" title="${esc(ageTip)}">${ageTxt}</span>
                    </button>`;
                }).join('') : '<p class="text-muted text-sm" style="padding:var(--sp-3)">Aucun ticket bloqué ou stagnant 🎉</p>'}
            </div>
        </div>

        <!-- Recent Activity (composant partagé) -->
        ${renderActivityCard(tickets, { max: 15, scope: 'dashboard' })}
    `;

    // Render charts after DOM is ready
    requestAnimationFrame(() => {
        renderCycleTime('chart-cycletime', tickets);
        mountVelocityChart({ velocityHistory, currentSprintEntry, target: piInfo?.velocityTarget || null, maxPoints: _veloMax });
        bindActivityClicks(container);
    });

    // Liste "bloqués / stagnants" → ouvre le ticket au clic
    container.querySelectorAll('.stuck-row').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticket));
    });

    // Détail des tickets par sprint (strip PI) → ouvre le ticket au clic
    container.querySelectorAll('.pi-sprint-card-ticket').forEach(row => {
        row.addEventListener('click', e => {
            e.stopPropagation();
            window.__squadBoard?.openTicketModal?.(row.dataset.ticket);
        });
    });

    // Champ discret : seuil de stagnation (jours) → persiste et re-render
    const staleInput = container.querySelector('#stuck-stale-days');
    staleInput?.addEventListener('change', () => {
        const n = parseInt(staleInput.value, 10);
        if (isNaN(n) || n < 1 || n > 365) { staleInput.value = STALE_DAYS; return; }
        if (n === STALE_DAYS) return;
        localStorage.setItem('sb-dash-stale-days', String(n));
        renderDashboard(container);
    });

    // Sélecteur d'équipe du graphe de vélocité (périmètre multi-équipes) → re-render
    if (container._dashVeloClick) container.removeEventListener('click', container._dashVeloClick);
    container._dashVeloClick = e => {
        const chip = e.target.closest('.health-velo-team-chip');
        if (chip?.dataset.veloTeam) {
            localStorage.setItem('sb-dash-velo-team', chip.dataset.veloTeam);
            renderDashboard(container);
        }
    };
    container.addEventListener('click', container._dashVeloClick);

    // ── Édition inline des objectifs PI (pi-obj-attain-list) ───────────────────
    // Permet de corriger un texte ou faire avancer un statut directement depuis le Dashboard,
    // sans repasser par PI Planning → Objectifs. Réécrit l'objectif à son index d'origine
    // (`_idx`, posé lors du calcul de piObjs) dans piInfo.objectives puis sauvegarde via l'API.
    if (isCurrentPi) {
        const STATUS_CYCLE = ['todo', 'inprog', 'done', 'blocked'];

        async function saveObjectiveField(idx, patch) {
            const piRaw = store.get('piInfo') || {};
            const liveObjs = [...(piRaw.objectives || [])];
            if (!liveObjs[idx]) return;
            liveObjs[idx] = { ...liveObjs[idx], ...patch };
            const piObjectives = displayPiNum
                ? { ...(piRaw.piObjectives || {}), [String(displayPiNum)]: liveObjs }
                : piRaw.piObjectives;
            try {
                const updated = await api.updatePI({ ...piRaw, objectives: liveObjs, piObjectives });
                store.set('piInfo', updated);
            } catch (e) { toast(e.message, 'error'); }
            renderDashboard(container);
        }

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-cycle-status]').forEach(icon => {
            icon.addEventListener('click', () => {
                const idx = parseInt(icon.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                if (isNaN(idx)) return;
                const cur  = (store.get('piInfo')?.objectives || [])[idx]?.status || 'todo';
                const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
                saveObjectiveField(idx, { status: next });
            });
        });

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-edit-text]').forEach(textEl => {
            textEl.dataset.orig = textEl.textContent;
            textEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
                else if (e.key === 'Escape') { e.preventDefault(); textEl.textContent = textEl.dataset.orig; textEl.blur(); }
            });
            textEl.addEventListener('blur', () => {
                const idx = parseInt(textEl.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                const val = textEl.textContent.trim();
                if (isNaN(idx) || !val || val === textEl.dataset.orig) { textEl.textContent = textEl.dataset.orig; return; }
                saveObjectiveField(idx, { text: val });
            });
        });

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-toggle-committed]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                if (isNaN(idx)) return;
                const cur = (store.get('piInfo')?.objectives || [])[idx]?.committed || false;
                saveObjectiveField(idx, { committed: !cur });
            });
        });

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-edit-bv]').forEach(bvEl => {
            bvEl.dataset.orig = bvEl.textContent;
            bvEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); bvEl.blur(); }
                else if (e.key === 'Escape') { e.preventDefault(); bvEl.textContent = bvEl.dataset.orig; bvEl.blur(); }
            });
            bvEl.addEventListener('blur', () => {
                const idx = parseInt(bvEl.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                const n = Math.max(0, Math.min(10, parseInt(bvEl.textContent, 10) || 0));
                if (isNaN(idx) || String(n) === bvEl.dataset.orig) { bvEl.textContent = bvEl.dataset.orig; return; }
                bvEl.textContent = String(n);
                saveObjectiveField(idx, { bv: n });
            });
        });
    }
}

// ── Strip "Sprints du PI courant" ───────────────────────────────────────────
// Affiche une rangée de mini-pills sous le sprint-progress avec tous les sprints
// du PI courant (closed/active/future).
//
// @param sprintInfoAll   Objet store.sprintInfo GLOBAL avec teamSprints[]
// @param currentSprint   Sprint actif de l'équipe sélectionnée (résultat de
//                        getSprintForTeam) — utilisé pour déduire le PI courant
// @param team            Équipe sélectionnée ('all' ou nom)
// @param allTickets      Pour le compteur points par sprint
function _renderPiSprintsStrip(sprintInfoAll, currentSprint, team, allTickets, displayPiNum = 0) {
    const ts = Array.isArray(sprintInfoAll?.teamSprints) ? sprintInfoAll.teamSprints : [];
    if (!ts.length) return '';
    // Extraction du PI courant (regex `(\d+)\.\d+` ou `PI\s*#?\s*(\d+)` sur le nom)
    const _extractPi = (name) => {
        if (!name) return 0;
        const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    // PI à afficher : displayPiNum (du sélecteur) en priorité, sinon dérivé du sprint actif.
    const referenceName = currentSprint?.name || sprintInfoAll?.name
        || (ts.find(s => s.state === 'active')?.name) || '';
    const curPi = displayPiNum || _extractPi(referenceName);
    if (!curPi) return '';

    // Filtre les sprints du PI courant (selon le nom)
    let piSprints = ts.filter(s => _extractPi(s.name) === curPi);
    if (team && team !== 'all') {
        piSprints = piSprints.filter(s => s.team === team);
    } else {
        // Dédup par nom (plusieurs équipes peuvent avoir le même nom de sprint)
        const seen = new Map();
        for (const s of piSprints) {
            const k = (s.name || '').toLowerCase();
            if (!seen.has(k) || (s.state === 'active' && seen.get(k).state !== 'active')) {
                seen.set(k, s);
            }
        }
        piSprints = [...seen.values()];
    }
    if (!piSprints.length) return '';
    // Tri chronologique
    piSprints.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

    const _fmtShort = iso => {
        if (!iso) return '';
        // iso peut être 'YYYY-MM-DD' OU un ISO complet JIRA ('...T08:00:00+02:00',
        // ex. completeDate des sprints clos) → on ne garde que la partie date.
        const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
        if (isNaN(d)) return '';
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
    };
    const today = new Date().toISOString().slice(0, 10);
    const _stateIcon = st => st === 'closed' ? '✓' : st === 'active' ? '▶' : '○';

    const _stateLabel = st => st === 'closed' ? 'Terminé' : st === 'active' ? 'En cours' : 'À venir';

    // Groupes affichés dans le détail de chaque carte sprint — ordre : US, Buffer, Action
    // (Action = tout ticket qui n'est ni une US ni un item taggé "buffer", ex. task/bug/ops/debt).
    const _GROUPS = [
        { key: 'us',     label: 'US',     icon: '📗', test: t => !isBufferItem(t) && t.type === 'story' },
        { key: 'buffer', label: 'Buffer', icon: '🧯', test: t => isBufferItem(t) },
        { key: 'action', label: 'Action', icon: '🛠️', test: t => !isBufferItem(t) && t.type !== 'story' },
    ];
    const _byRank = (a, b) => (a.rank ?? 9999) - (b.rank ?? 9999);

    const cards = piSprints.map(s => {
        const st = s.state || (s.endDate && s.endDate < today ? 'closed' : (s.startDate && s.startDate > today ? 'future' : 'active'));
        // Compteur de points pour ce sprint (filtré par équipe si sélectionnée)
        let pts = 0, donePts = 0;
        let ts2 = [];
        if (allTickets && s.name) {
            ts2 = allTickets.filter(t =>
                (t.sprintName === s.name || (Array.isArray(t.allSprints) && t.allSprints.includes(s.name)))
                && (team === 'all' || !team || t.team === team)
            );
            for (const t of ts2) {
                pts += (t.points || 0);
                if (t.status === 'done') donePts += (t.points || 0);
            }
        }
        const ratio = pts ? Math.round(donePts / pts * 100) : 0;
        const ratioBar = pts
            ? `<div class="pi-sprint-card-bar"><div class="pi-sprint-card-bar-fill ${progressColor(ratio)}" style="width:${ratio}%"></div></div>`
            : '';
        const dates = `${_fmtShort(s.startDate)} → ${_fmtShort(s.endDate)}`;
        const goalText = (s.goal || '').trim();
        const goalHtml = goalText
            ? `<div class="pi-sprint-card-goal">${esc(goalText)}</div>`
            : `<div class="pi-sprint-card-goal pi-sprint-card-goal--empty">Aucun objectif défini</div>`;

        // Sprint clos : tickets non terminés à la clôture = "glissés" — ils sont restés dans ce
        // sprint (allSprints) mais ont continué leur vie ailleurs (sprintName actuel différent,
        // ou simplement jamais clos). On les repère pour les distinguer dans la liste.
        const _slippedTo = t => (st === 'closed' && t.status !== 'done')
            ? (t.sprintName && t.sprintName !== s.name ? t.sprintName : null)
            : undefined; // undefined = non concerné (pas un sprint clos, ou ticket fini)
        const slippedCount = st === 'closed' ? ts2.filter(t => t.status !== 'done').length : 0;

        // Détail des tickets : groupés par catégorie (US / Buffer / Action), triés par rank.
        const groupsHtml = _GROUPS.map(g => {
            const items = ts2.filter(g.test).sort(_byRank);
            if (!items.length) return '';
            const planned  = sumBy(items, t => t.points);
            const inProg   = sumBy(items.filter(t => t.status === 'inprog'), t => t.points);
            const groupDone = sumBy(items.filter(t => t.status === 'done'), t => t.points);
            return `<div class="pi-sprint-card-group">
                <div class="pi-sprint-card-group-hd">
                    <span class="pi-sprint-card-group-label">${g.icon} ${g.label} <span class="pi-sprint-card-group-count">(${items.length})</span></span>
                    <span class="pi-sprint-card-group-pts">${planned} pts<span class="sep">·</span>${inProg} en cours<span class="sep">·</span>${groupDone} fait</span>
                </div>
                <div class="pi-sprint-card-group-list">
                    ${items.map(t => {
                        const to = _slippedTo(t);
                        const slipped = to !== undefined;
                        return `<div class="pi-sprint-card-ticket${slipped ? ' pi-sprint-card-ticket--slipped' : ''}" data-ticket="${esc(t.id)}" title="${esc(t.title || '')}${slipped ? (to ? ` · Glissé vers ${esc(to)}` : ' · Non terminé à la clôture') : ''}">
                        <span class="status-dot-sm" style="background:var(--status-${t.status || 'todo'})"></span>
                        <span class="pi-sprint-card-ticket-id">${esc(t.id)}</span>
                        <span class="pi-sprint-card-ticket-title">${esc(t.title || '')}</span>
                        ${slipped ? `<span class="pi-sprint-card-ticket-slip">↪${to ? esc(to) : ''}</span>` : ''}
                        <span class="pi-sprint-card-ticket-pts">${t.points || '—'}</span>
                    </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
        const ticketsHtml = ts2.length
            ? `<details class="pi-sprint-card-tickets"${(st === 'future' || st === 'active' || slippedCount) ? ' open' : ''}>
                <summary>Tickets <span class="pi-sprint-card-tickets-count">(${ts2.length})</span>${slippedCount ? ` <span class="pi-sprint-card-slip-count">⚠ ${slippedCount} glissé${slippedCount > 1 ? 's' : ''}</span>` : ''}</summary>
                ${groupsHtml}
            </details>`
            : '';

        return `<div class="pi-sprint-card pi-sprint-card--${st}" title="${esc(s.name)} · ${dates}">
            <div class="pi-sprint-card-hdr">
                <span class="pi-sprint-card-state pi-sprint-card-state--${st}">${_stateIcon(st)} ${_stateLabel(st)}</span>
                ${st === 'active' ? '<span class="pi-sprint-card-now">● MAINTENANT</span>' : ''}
            </div>
            <div class="pi-sprint-card-name">${esc(s.name)}</div>
            <div class="pi-sprint-card-dates">${dates}</div>
            ${goalHtml}
            ${pts ? `<div class="pi-sprint-card-pts">
                <span><strong>${donePts}</strong><span class="sep">/</span>${pts} <small>pts</small></span>
                <span class="pi-sprint-card-pct">${ratio}%</span>
            </div>${ratioBar}` : ''}
            ${ticketsHtml}
        </div>`;
    }).join('');

    return `<div class="pi-sprints-strip">
        <div class="pi-sprints-strip-head">
            <span class="pi-sprints-strip-title">Sprints du PI ${curPi}</span>
            <span class="pi-sprints-strip-count">${piSprints.length} sprint${piSprints.length > 1 ? 's' : ''}</span>
        </div>
        <div class="pi-sprints-strip-cards">${cards}</div>
    </div>`;
}
