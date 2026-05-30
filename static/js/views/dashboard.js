/**
 * Dashboard view - overview metrics, team cards, recent activity.
 */

import { store } from '../state.js';
import { esc, pct, progressColor, filterByTeam, groupBy, sumBy, fmtRelative, hashColor, getSprintForTeam, computeVelocityHistory, computeCurrentSprintEntry } from '../utils.js';
import { TEAM_COLORS } from '../config.js';
import { renderStatusChart, renderVelocityChart } from '../components/charts.js';
import { renderActivityList, bindActivityClicks } from '../components/activity.js';

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
    // Vélocité : dérivée à la volée depuis les sprints clôturés + tickets done
    // velocityHistory = sprints CLOS uniquement (utilisé pour les stats/KPIs)
    // currentSprintEntry = sprint actif (rendu en bout de chart, EXCLU des stats)
    const velocityHistory = computeVelocityHistory(allTickets, store.get('sprintInfo'), team);
    const currentSprintEntry = computeCurrentSprintEntry(allTickets, store.get('sprintInfo'), team);
    // sprintInfoAll = objet global avec teamSprints[] (pour la liste des sprints du PI)
    // sprintInfo    = sprint actif de l'équipe sélectionnée (pour la card principale)
    const sprintInfoAll = store.get('sprintInfo');
    const sprintInfo = getSprintForTeam(team, sprintInfoAll);
    const piInfo = store.get('piInfo');

    // Atteinte des PI Objectives (SAFe predictability score)
    // Score = Σ BV livrés (commits done) / Σ BV planifiés (commits)
    // Stretch livré = bonus au numérateur (peut dépasser 100%)
    const piObjs = (piInfo?.objectives || []).filter(o => (o.text || '').trim());
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

    const total = tickets.length;
    const done = tickets.filter(t => t.status === 'done').length;
    const inprog = tickets.filter(t => t.status === 'inprog').length;
    const blocked = tickets.filter(t => t.status === 'blocked').length;
    const totalPts = sumBy(tickets, t => t.points);
    const donePts = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const completion = pct(done, total);
    const ptsPct = pct(donePts, totalPts);

    // Status counts
    const statusCounts = {};
    for (const t of tickets) statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

    // Recent changes — délégué au composant activity.js

    // Team breakdown
    const byTeam = groupBy(allTickets, t => t.team);

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

    // ── Météo équipe : score global basé sur mood + blockers + scope creep + vélocité vs cible ──
    const sprintStart = sprintInfo?.startDate ? new Date(sprintInfo.startDate).getTime() : 0;
    const scopeCreep = tickets.filter(t => t.createdAt && new Date(t.createdAt).getTime() > sprintStart && t.status !== 'done').length;
    const velRatio = piInfo?.velocityTarget ? donePts / piInfo.velocityTarget : null;
    let weather = '☀️', weatherLbl = 'Tout va bien', weatherCls = 'mc-done';
    let score = 100;
    // Détail du calcul accumulé dans un tableau pour tooltip transparent
    const weatherBreakdown = [`Score de base : 100`];
    // Blockers : -25 si > 3, -10 si > 0
    if (blocked > 3) { score -= 25; weatherBreakdown.push(`🚫 Blockers : ${blocked} (> 3)  →  -25`); }
    else if (blocked > 0) { score -= 10; weatherBreakdown.push(`🚫 Blockers : ${blocked} (> 0)  →  -10`); }
    else weatherBreakdown.push(`✅ Blockers : 0  →  ±0`);
    // Scope creep : -20 si > 5, -10 si > 2 (tickets ajoutés après le début du sprint)
    if (scopeCreep > 5) { score -= 20; weatherBreakdown.push(`📈 Scope creep : ${scopeCreep} (> 5)  →  -20`); }
    else if (scopeCreep > 2) { score -= 10; weatherBreakdown.push(`📈 Scope creep : ${scopeCreep} (> 2)  →  -10`); }
    else weatherBreakdown.push(`✅ Scope creep : ${scopeCreep}  →  ±0`);
    // Mood : -25 si < 3, -10 si < 3.5
    if (moodSt && moodSt.avg < 3) { score -= 25; weatherBreakdown.push(`🎭 Mood : ${moodSt.avg}/5 (< 3)  →  -25`); }
    else if (moodSt && moodSt.avg < 3.5) { score -= 10; weatherBreakdown.push(`🎭 Mood : ${moodSt.avg}/5 (< 3.5)  →  -10`); }
    else if (moodSt) weatherBreakdown.push(`✅ Mood : ${moodSt.avg}/5  →  ±0`);
    else weatherBreakdown.push(`🎭 Mood : pas de vote  →  ±0`);
    // Vélocité vs cible PI : -15 si < 50% de la cible (sprint actif uniquement)
    if (velRatio != null && velRatio < 0.5) { score -= 15; weatherBreakdown.push(`🎯 Vélocité : ${donePts}/${piInfo.velocityTarget} pts (< 50% cible)  →  -15`); }
    else if (velRatio != null) weatherBreakdown.push(`✅ Vélocité : ${donePts}/${piInfo.velocityTarget} pts (${Math.round(velRatio * 100)}% cible)  →  ±0`);
    else weatherBreakdown.push(`🎯 Vélocité : pas de cible PI définie  →  ±0`);

    if (score >= 85) { weather='☀️'; weatherLbl='Tout va bien'; weatherCls='mc-done'; }
    else if (score >= 65) { weather='⛅'; weatherLbl='Quelques nuages'; weatherCls='mc-info'; }
    else if (score >= 45) { weather='🌧️'; weatherLbl='Pluie battante'; weatherCls='mc-warning'; }
    else { weather='⛈️'; weatherLbl='Orage'; weatherCls='mc-danger'; }

    const weatherTooltip = [
        `MÉTÉO ÉQUIPE — ${score}/100  (${weatherLbl})`,
        ``,
        ...weatherBreakdown,
        ``,
        `Seuils : ☀️ ≥85  ·  ⛅ ≥65  ·  🌧️ ≥45  ·  ⛈️ <45`,
    ].join('\n');

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
        <!-- Metrics row -->
        <div class="dashboard-metrics">
            <div class="metric-card mc-primary">
                <span class="metric-icon">📋</span>
                <span class="metric-label">Tickets sprint</span>
                <span class="metric-value">${total}</span>
                <span class="metric-sub">${done} termines (${completion}%)</span>
            </div>
            <div class="metric-card ${ptsPct >= 80 ? 'mc-done' : ptsPct >= 50 ? 'mc-warning' : 'mc-danger'}">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Story Points</span>
                <span class="metric-value">${donePts}<span class="metric-value-sub">/${totalPts}</span></span>
                <span class="metric-sub">${ptsPct}% realises</span>
            </div>
            <div class="metric-card mc-inprog">
                <span class="metric-icon">🔄</span>
                <span class="metric-label">En cours</span>
                <span class="metric-value text-status-inprog">${inprog}</span>
                <span class="metric-sub">tickets actifs</span>
            </div>
            <div class="metric-card ${blocked > 0 ? 'mc-danger' : 'mc-done'}">
                <span class="metric-icon">${blocked > 0 ? '🚫' : '✅'}</span>
                <span class="metric-label">Bloques</span>
                <span class="metric-value ${blocked > 0 ? 'text-danger' : 'text-status-done'}">${blocked}</span>
                <span class="metric-sub">${blocked > 0 ? 'attention requise' : 'aucun impediment'}</span>
            </div>
            <div class="metric-card ${weatherCls}" title="${esc(weatherTooltip)}">
                <span class="metric-icon" style="font-size: 28px;">${weather}</span>
                <span class="metric-label">Météo équipe</span>
                <span class="metric-value">${score}<span class="metric-value-sub">/100</span></span>
                <span class="metric-sub">${weatherLbl}</span>
            </div>
        </div>

        ${sprintInfo ? (() => {
            // Calcul positionnel du sprint : où en est-on dans la durée ?
            const _parse = s => { const d = String(s || '').slice(0,10); return d ? new Date(`${d}T00:00:00`).getTime() : NaN; };
            const sStart = _parse(sprintInfo.startDate);
            const sEnd   = _parse(sprintInfo.endDate);
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
            ${_renderPiSprintsStrip(sprintInfoAll, sprintInfo, team, allTickets)}
        </div>`;
        })() : ''}

        <!-- Cette semaine (5 derniers jours) -->
        <div class="this-week mb-4" title="Activité quotidienne sur les 5 derniers jours ouvrés">
            <h3 class="section-title">📅 Cette semaine</h3>
            <div class="this-week-grid">
                ${wkDays.map(d => {
                    const intensity = Math.min(1, d.doneCount / 4);
                    const bg = d.doneCount === 0 ? 'var(--bg-alt)'
                             : `color-mix(in srgb, var(--success) ${Math.round(15 + intensity * 35)}%, transparent)`;
                    return `<div class="this-week-day${d.isToday ? ' is-today' : ''}" style="background:${bg}" title="${d.dayLbl} : ${d.doneCount} tickets terminés${d.donePts ? ' · ' + d.donePts + ' pts' : ''}">
                        <span class="this-week-day-lbl">${d.dayLbl}</span>
                        <span class="this-week-day-val">${d.doneCount}</span>
                        <span class="this-week-day-sub">${d.donePts ? d.donePts + ' pts' : 'tickets'}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>

        <!-- Team Cards -->
        <h3 class="section-title">Equipes</h3>
        <div class="team-cards mb-4">
            ${teams.map((t, i) => {
                const tt = byTeam.get(t) || [];
                const d  = tt.filter(x => x.status === 'done').length;
                const ip = tt.filter(x => x.status === 'inprog').length;
                const b  = tt.filter(x => x.status === 'blocked').length;
                const todo = tt.filter(x => x.status === 'todo').length;
                const pts = sumBy(tt, x => x.points);
                const dPts = sumBy(tt.filter(x => x.status === 'done'), x => x.points);
                const tPct = pct(d, tt.length);
                const pPct = pct(dPts, pts);
                const tObj = teamObjects.find(o => o.name === t);
                const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];
                return `
                    <div class="team-card" style="--team-card-color:${color}">
                        <div class="team-card-header">
                            <span class="team-card-name inline-flex-center"><span class="team-dot" style="background:${color}"></span> ${esc(t)}</span>
                            <span class="badge badge-points" title="Story points livrés / total">${dPts}/${pts} pts</span>
                        </div>
                        <div class="team-card-progress">
                            <div class="team-card-progress-row" title="Tickets : ${d}/${tt.length} terminés (${tPct}%)">
                                <span class="team-card-progress-label">Tickets</span>
                                <div class="progress progress-sm"><div class="progress-bar ${progressColor(tPct)}" style="width:${tPct}%"></div></div>
                                <span class="team-card-progress-pct">${tPct}%</span>
                            </div>
                            <div class="team-card-progress-row" title="Story points : ${dPts}/${pts} livrés (${pPct}%)">
                                <span class="team-card-progress-label">Points</span>
                                <div class="progress progress-sm"><div class="progress-bar ${progressColor(pPct)}" style="width:${pPct}%"></div></div>
                                <span class="team-card-progress-pct">${pPct}%</span>
                            </div>
                        </div>
                        <div class="team-card-stats">
                            <span class="team-card-stat" title="Total tickets">📋 ${tt.length}</span>
                            <span class="team-card-stat team-card-stat--done" title="Tickets terminés">✓ ${d}</span>
                            ${ip > 0 ? `<span class="team-card-stat team-card-stat--inprog" title="En cours">▶ ${ip}</span>` : ''}
                            ${todo > 0 ? `<span class="team-card-stat team-card-stat--todo" title="À faire">○ ${todo}</span>` : ''}
                            ${b > 0 ? `<span class="team-card-stat team-card-stat--blocked" title="Bloqués">⚠ ${b}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        ${teamObjs.length ? `
        <!-- PI Objectives — atteinte (Predictability score SAFe) -->
        <h3 class="section-title">Objectifs PI${piInfo?.number ? ' #' + piInfo.number : ''}${team && team !== 'all' ? ` — ${esc(team)}` : ''}</h3>
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
                ${teamObjs
                    .slice()
                    .sort((a, b) => (a.committed === b.committed ? 0 : a.committed ? -1 : 1) || _bv(b) - _bv(a))
                    .map(o => {
                        const stCls = o.status === 'done' ? 'done' : o.status === 'inprog' ? 'inprog' : o.status === 'blocked' ? 'blocked' : 'todo';
                        const icon = o.status === 'done' ? '✓' : o.status === 'inprog' ? '◐' : o.status === 'blocked' ? '⚠' : '○';
                        const kind = o.committed ? `<span class="pi-obj-kind pi-obj-kind--commit">Commis</span>` : `<span class="pi-obj-kind pi-obj-kind--stretch">Stretch</span>`;
                        return `<div class="pi-obj-attain-item pi-obj-attain-item--${stCls}" title="${esc(o.text || '')}${o.team ? ' · ' + esc(o.team) : ''}">
                            <span class="pi-obj-attain-icon">${icon}</span>
                            <span class="pi-obj-attain-text">${esc(o.text || 'Sans titre')}</span>
                            ${o.team && (!team || team === 'all') ? `<span class="pi-obj-attain-team">${esc(o.team)}</span>` : ''}
                            ${kind}
                            <span class="pi-obj-attain-bv" title="Business Value">BV ${_bv(o)}</span>
                        </div>`;
                    }).join('')}
            </div>
        </div>` : ''}

        <!-- Charts row -->
        <div class="dashboard-grid">
            <div class="card">
                <div class="card-header"><span class="card-title">Repartition par statut</span></div>
                <div class="chart-container chart-h-md"><canvas id="chart-status"></canvas></div>
            </div>
            ${(() => {
                // ── Vélocité — card riche avec KPIs ───────────────────────────────
                // vh = sprints clos (stats) ; cur = sprint actif (rendu en bout de chart, exclu stats)
                const vh = velocityHistory || [];
                const cur = currentSprintEntry;
                if (!vh.length && !cur) {
                    return `
                    <div class="card velocity-card velocity-card--empty">
                        <div class="card-header"><span class="card-title">📈 Vélocité</span></div>
                        <div class="chart-container chart-h-md velocity-empty">
                            <div class="velocity-empty-inner">
                                <span class="velocity-empty-icon">📊</span>
                                <p class="text-muted text-sm">Pas encore d'historique de vélocité</p>
                                <small class="text-muted">Les sprints clôturés alimenteront ce graphique</small>
                            </div>
                        </div>
                    </div>`;
                }
                const target = piInfo?.velocityTarget || null;
                // Stats — calculées sur SPRINTS CLOS uniquement (vh), pas le current
                const vals = vh.map(v => v.velocity || 0);
                const last = vals.length ? vals[vals.length - 1] : 0;
                const lastName = vh.length ? vh[vh.length - 1].name : '—';
                const last3 = vals.slice(-3);
                const avg3 = last3.length ? Math.round(last3.reduce((s, v) => s + v, 0) / last3.length) : 0;
                const prev3 = vals.slice(-6, -3);
                const prevAvg = prev3.length ? Math.round(prev3.reduce((s, v) => s + v, 0) / prev3.length) : null;
                const trend = (prevAvg && prevAvg > 0) ? Math.round(((avg3 - prevAvg) / prevAvg) * 100) : null;
                const best = vals.length ? Math.max(...vals) : 0;
                const worst = vals.length ? Math.min(...vals) : 0;
                // Stabilité = coefficient de variation (écart-type / moyenne)
                const overallAvg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
                const variance = vals.length ? vals.reduce((s, v) => s + Math.pow(v - overallAvg, 2), 0) / vals.length : 0;
                const stdDev = Math.sqrt(variance);
                const cv = overallAvg > 0 ? Math.round((stdDev / overallAvg) * 100) : 0;
                const stabilityLabel = cv < 15 ? 'Très stable' : cv < 30 ? 'Stable' : cv < 50 ? 'Variable' : 'Instable';
                const stabilityCls = cv < 15 ? 'velocity-kpi--good' : cv < 30 ? 'velocity-kpi--ok' : cv < 50 ? 'velocity-kpi--warn' : 'velocity-kpi--danger';
                // Couleur d'accent global selon la tendance
                const accentCls = trend == null ? 'velocity-card--neutral'
                                : trend >= 10 ? 'velocity-card--up'
                                : trend <= -10 ? 'velocity-card--down'
                                : 'velocity-card--neutral';
                // % vs objectif (sprint le plus récent)
                const targetPct = target ? Math.round((last / target) * 100) : null;
                const targetCls = targetPct == null ? ''
                                : targetPct >= 100 ? 'velocity-kpi--good'
                                : targetPct >= 80 ? 'velocity-kpi--ok'
                                : 'velocity-kpi--warn';
                // Sparkline mini-bars
                const sparkMax = Math.max(...vals, target || 0, 1);
                return `
                <div class="card velocity-card ${accentCls}">
                    <div class="velocity-card-hdr">
                        <div class="velocity-card-title">
                            <span class="card-title">📈 Vélocité</span>
                            <span class="velocity-card-sub">${vh.length} sprint${vh.length > 1 ? 's' : ''} clos${cur ? ` + 1 en cours <small>(non comptés)</small>` : ''} · moy. ${avg3} pts/sprint</span>
                        </div>
                        <div class="velocity-kpis">
                            <div class="velocity-kpi velocity-kpi--primary" title="Moyenne des 3 derniers sprints">
                                <span class="velocity-kpi-val">${avg3}</span>
                                <span class="velocity-kpi-lbl">moy. 3 derniers</span>
                            </div>
                            ${trend != null ? `
                            <div class="velocity-kpi ${trend >= 0 ? 'velocity-kpi--good' : 'velocity-kpi--warn'}" title="Tendance : ${avg3} vs ${prevAvg} pts (3 sprints précédents)">
                                <span class="velocity-kpi-val">${trend >= 0 ? '↗' : '↘'} ${trend >= 0 ? '+' : ''}${trend}%</span>
                                <span class="velocity-kpi-lbl">tendance</span>
                            </div>` : ''}
                            <div class="velocity-kpi" title="Sprint clôturé le plus récent : ${esc(lastName)} (le sprint en cours n'est pas compté)">
                                <span class="velocity-kpi-val">${last}</span>
                                <span class="velocity-kpi-lbl">dernier clos</span>
                            </div>
                            <div class="velocity-kpi" title="Meilleure vélocité observée">
                                <span class="velocity-kpi-val">⭐ ${best}</span>
                                <span class="velocity-kpi-lbl">record</span>
                            </div>
                            <div class="velocity-kpi ${stabilityCls}" title="Coefficient de variation : ${cv}% — plus c'est bas, plus l'équipe est prédictible">
                                <span class="velocity-kpi-val">${stabilityLabel}</span>
                                <span class="velocity-kpi-lbl">cv ${cv}%</span>
                            </div>
                            ${target ? `
                            <div class="velocity-kpi ${targetCls}" title="Dernier sprint vs objectif : ${last}/${target} pts">
                                <span class="velocity-kpi-val">🎯 ${targetPct}%</span>
                                <span class="velocity-kpi-lbl">vs cible ${target}</span>
                            </div>` : ''}
                        </div>
                    </div>
                    <div class="chart-container chart-h-md"><canvas id="chart-velocity"></canvas></div>
                    <div class="velocity-spark" title="Aperçu : ${vh.length} sprints clos${cur ? ' + 1 en cours' : ''}, min ${worst} · max ${best}">
                        ${[...vh, ...(cur ? [cur] : [])].map((v, i, arr) => {
                            const h = sparkMax > 0 ? Math.max(6, Math.round((v.velocity / sparkMax) * 100)) : 6;
                            const isLast = i === arr.length - 1;
                            const isBest = !v.isCurrent && v.velocity === best;
                            const cls = v.isCurrent ? 'velocity-spark-bar--current'
                                     : isLast ? 'velocity-spark-bar--last'
                                     : isBest ? 'velocity-spark-bar--best' : '';
                            const lbl = v.isCurrent ? `${esc(v.name)} · ${v.velocity}/${v.estimated} pts (en cours)`
                                                    : `${esc(v.name)} · ${v.velocity} pts`;
                            return `<span class="velocity-spark-bar ${cls}" style="height:${h}%" title="${lbl}"></span>`;
                        }).join('')}
                    </div>
                </div>`;
            })()}
        </div>

        <!-- Recent Activity -->
        <div class="card mt-4">
            <div class="card-header"><span class="card-title">Activité récente</span></div>
            ${renderActivityList(tickets, { max: 15, scope: 'dashboard' })}
        </div>
    `;

    // Render charts after DOM is ready
    requestAnimationFrame(() => {
        renderStatusChart('chart-status', statusCounts);
        const _chartData = currentSprintEntry ? [...velocityHistory, currentSprintEntry] : velocityHistory;
        if (_chartData.length) {
            renderVelocityChart('chart-velocity', _chartData, {
                target: piInfo?.velocityTarget || null,
            });
        }
        bindActivityClicks(container);
    });
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
function _renderPiSprintsStrip(sprintInfoAll, currentSprint, team, allTickets) {
    const ts = Array.isArray(sprintInfoAll?.teamSprints) ? sprintInfoAll.teamSprints : [];
    if (!ts.length) return '';
    // Extraction du PI courant (regex `(\d+)\.\d+` ou `PI\s*#?\s*(\d+)` sur le nom)
    const _extractPi = (name) => {
        if (!name) return 0;
        const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    // Détection du PI courant : on prend le sprint actif de l'équipe d'abord,
    // sinon le sprintInfo global, sinon le premier sprint "active" de la liste.
    const referenceName = currentSprint?.name || sprintInfoAll?.name
        || (ts.find(s => s.state === 'active')?.name) || '';
    const curPi = _extractPi(referenceName);
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
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
    };
    const today = new Date().toISOString().slice(0, 10);
    const _stateIcon = st => st === 'closed' ? '✓' : st === 'active' ? '▶' : '○';

    const _stateLabel = st => st === 'closed' ? 'Terminé' : st === 'active' ? 'En cours' : 'À venir';

    const cards = piSprints.map(s => {
        const st = s.state || (s.endDate && s.endDate < today ? 'closed' : (s.startDate && s.startDate > today ? 'future' : 'active'));
        // Compteur de points pour ce sprint (filtré par équipe si sélectionnée)
        let pts = 0, donePts = 0;
        if (allTickets && s.name) {
            const ts2 = allTickets.filter(t =>
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
            ? `<div class="pi-sprint-card-goal">🎯 ${esc(goalText)}</div>`
            : `<div class="pi-sprint-card-goal pi-sprint-card-goal--empty">Aucun objectif défini</div>`;

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
