/**
 * Dashboard — modèle : tout ce que la page affiche, calculé UNE fois par rendu (`dashboardModel()`).
 * Quatre phases courtes, chacune reçoit les sorties des précédentes : périmètre (équipe, sprint, PI,
 * objectifs), flux (cycle / lead time, débit, efficience), signaux (stagnation, avancement du PI, votes,
 * position dans le sprint). Aucun HTML ici.
 */

import { store } from '../state.js';
import { filterByTeam, computeVelocityHistory, computeCurrentSprintEntry, esc, getSprintForTeam, getCurrentPi, resolvePiObjectives, sumBy, extractPiNum, belongedToSprint, belongedToPi, extractSprintLabel, countBlocked, pct, cycleDays, leadDays, throughputSince, sprintStartsOf, groupBy } from '../utils.js';
import { forecastCardHtml } from '../components/forecast_card.js';
import { piProgressModel } from '../components/pi_progress.js';
import { piBounds } from '../utils/pi-weeks.js';
import { TEAM_COLORS } from '../config.js';
import { lineProductScope, piStageFlowModel, bufferTest, piFlowRowsHtml } from '../components/pi_stage_flow.js';

/** Modèle complet du Dashboard (phases dans l'ordre : chacune lit les sorties des précédentes). */
export function dashboardModel() {
    const m = _scopeModel();
    Object.assign(m, _flowModel(m));
    Object.assign(m, _signalsModel(m));
    return m;
}

/** Périmètre : équipes, vélocité, sprint et PI affichés, objectifs, compteurs du sprint. */
function _scopeModel() {
    const team = store.get('team');
    const groupId = store.get('group');
    const allTickets = store.get('tickets') || [];
    const tickets = filterByTeam(allTickets, team);
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
    return { team, groupId, allTickets, tickets, allTeams, teamObjects, groups, teams, _veloMax, velocityHistory, currentSprintEntry, _veloTeamChips, sprintInfoAll, sprintInfo, piInfo, piOffset, displayPiNum, teamObjs, _bv, commitObjs, stretchObjs, commitTotal, commitDone, stretchDone, piScore, piScoreColor, isCurrentPi, _scopeTickets, displayTickets, metricScope };
}

/** Flux : périmètre des durées, compteurs, cycle / lead time, débit, efficience, prévision. */
function _flowModel(m) {
    const { isCurrentPi, sprintInfo, tickets, displayPiNum, displayTickets, metricScope } = m;
    // ── Périmètre des DURÉES (card « Temps par colonne ») ───────────────────────
    // Volontairement DISTINCT de `displayTickets` : celui-ci alimente les compteurs et le
    // réalisé (règle engagement/réalisé, cf CLAUDE.md) et doit rester sur le sprint courant.
    // Une mesure de durée, elle, doit voir TOUT ce qui a été travaillé dans le PI — reports
    // compris, sinon on ne mesure que les tickets finis à temps et les durées rapetissent.
    const _flowScopeTickets = isCurrentPi && sprintInfo
        ? tickets.filter(t => belongedToSprint(t, sprintInfo.name))
        : (displayPiNum ? tickets.filter(t => belongedToPi(t, displayPiNum)) : tickets);
    const _flowScopeBadge = isCurrentPi
        ? (sprintInfo ? `${sprintInfo.name} · périmètre engagé` : 'historique équipe')
        : (displayPiNum ? `PI #${displayPiNum} · périmètre engagé` : 'historique équipe');
    // Sélecteur de la card : sprint en cours / PI affiché / PI précédent, chacun comparé à une
    // référence (sprint → son PI, PI → le précédent) — même règle de périmètre (durées, reports compris).
    const _flowSk = extractSprintLabel(sprintInfo?.name || '');
    const _flowCardOpts = {
        scopeLabel: _flowScopeBadge,
        storageKey: 'sb-dash-flow-scope',
        scopes: [
            isCurrentPi && sprintInfo ? { key: 'sprint', label: `Sprint ${_flowSk || ''}`.trim(), badge: `${sprintInfo.name} · périmètre engagé`, tickets: _flowScopeTickets } : null,
            displayPiNum ? { key: 'pi', label: `PI ${displayPiNum}`, badge: `PI #${displayPiNum} · périmètre engagé`, tickets: tickets.filter(t => belongedToPi(t, displayPiNum)) } : null,
            displayPiNum > 1 ? { key: 'prev', label: `PI ${displayPiNum - 1}`, badge: `PI #${displayPiNum - 1} · périmètre engagé`, tickets: tickets.filter(t => belongedToPi(t, displayPiNum - 1)) } : null,
        ].filter(Boolean),
        compareOf: k => (k === 'sprint' ? 'pi' : k === 'pi' ? 'prev' : 'pi'),
    };

    const total = displayTickets.length;
    const done = displayTickets.filter(t => t.status === 'done').length;
    const inprog = displayTickets.filter(t => t.status === 'inprog').length;
    const blocked = countBlocked(displayTickets);
    const totalPts = sumBy(displayTickets, t => t.points);
    const donePts = sumBy(displayTickets.filter(t => t.status === 'done'), t => t.points);
    const completion = pct(done, total);
    const ptsPct = pct(donePts, totalPts);

    // ── Indicateurs de flux (cycle/lead time, débit, flow efficiency) — scopés au PI affiché ──
    // (toutes les sprints du PI, pas seulement le sprint courant, pour garder un échantillon
    // suffisant) plutôt que sur tout l'historique équipe, pour rester cohérent avec le sélecteur
    // de PI de la topbar — avant ce changement ces cards ne bougeaient jamais selon le PI choisi.
    const _nowMs = Date.now();
    const DAY_MS = 86400000;
    const _median = arr => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2 * 10) / 10;
    };
    // Même périmètre que la card « Temps par colonne » : `_ticketPiNum` lit le sprint OÙ LE
    // TICKET SE TROUVE, donc rate ceux que JIRA a déplacés à la clôture — les plus lents, ceux
    // qui font justement le lead time. Mesures de durée → `belongedToPi` (cf CLAUDE.md).
    const _flowTickets = displayPiNum ? tickets.filter(t => belongedToPi(t, displayPiNum)) : tickets;
    const _flowScopeLabel = displayPiNum ? `PI #${displayPiNum} · périmètre engagé` : 'historique équipe';
    const _doneAll = _flowTickets.filter(t => t.status === 'done');
    const _doneCT = _flowTickets.filter(t => t.status === 'done' && cycleDays(t) > 0);
    const _ltVals = _doneCT.map(t => leadDays(t) > 0 ? leadDays(t) : cycleDays(t));
    const ctMedian = _median(_doneCT.map(t => cycleDays(t)));
    const ltMedian = _median(_ltVals);
    const medWait = Math.max(0, Math.round((ltMedian - ctMedian) * 10) / 10);

    // Débit (throughput) : tickets terminés sur les 7 derniers jours, scopé au PI affiché — helper
    // unique. Tendance : semaine écoulée (J-7→J0) vs semaine précédente (J-14→J-7) pour un ↗/↘.
    const throughput7 = throughputSince(_flowTickets, 7);
    const throughputPrev7 = Math.max(0, throughputSince(_flowTickets, 14) - throughput7);
    const throughputTrend = throughput7 - throughputPrev7;
    // Flow efficiency = part du lead time réellement passée à travailler (cycle) vs en file d'attente.
    // Repère métier : ~15% est courant, 40%+ est bon. Faible ⇒ les tickets attendent plus qu'ils
    // n'avancent (files, dépendances, priorisation).
    // Calcul par ticket (cycle/lead) puis MÉDIANE — un ratio de moyennes (avgCT/avgLT) est biaisé
    // par les gros tickets et ne représente pas le ticket typique.
    const _effPerTicket = _doneCT
        .filter(t => leadDays(t) > 0 && cycleDays(t) > 0 && cycleDays(t) <= leadDays(t))
        .map(t => cycleDays(t) / leadDays(t));
    const flowEff = _effPerTicket.length ? Math.round(_median(_effPerTicket.map(v => v * 100))) : null;
    const flowEffCls = flowEff == null ? 'mc-info'
        : flowEff >= 40 ? 'mc-done' : flowEff >= 25 ? 'mc-info' : 'mc-warning';
    // Hygiène backlog (périmètre courant) : actifs non estimés / non assignés
    const noEstimate = displayTickets.filter(t => t.status !== 'done' && !(t.points > 0)).length;
    const noAssignee = displayTickets.filter(t => t.status !== 'done' && !t.leader).length;

    // Prévision Monte-Carlo « finit-on à temps ? » — uniquement pour le PI courant (le rétrospectif
    // n'a pas de sens sur un PI passé). Débit = historique équipe complet ; reste = périmètre affiché.
    const _forecastCard = (isCurrentPi) ? forecastCardHtml({
        historyTickets: tickets,
        remaining: displayTickets.filter(t => t.status !== 'done').length,
        scopeLabel: sprintInfo ? (String(sprintInfo.name || '').match(/(\d+\.\d+)/) || [])[1] || metricScope : metricScope,
        targetDateIso: sprintInfo?.endDate || null,
        targetLabel: 'sprint',
    }) : '';
    return { _flowScopeTickets, _flowCardOpts, total, done, inprog, blocked, totalPts, donePts, completion, ptsPct, _nowMs, DAY_MS, _flowTickets, _flowScopeLabel, _doneAll, _doneCT, ctMedian, ltMedian, medWait, throughput7, throughputPrev7, throughputTrend, flowEff, flowEffCls, noEstimate, noAssignee, _forecastCard };
}

/** Signaux : stagnation, avancement du PI, répartition par équipe, votes, position dans le sprint. */
function _signalsModel(m) {
    const { _nowMs, DAY_MS, tickets, displayPiNum, sprintInfoAll, isCurrentPi, team, piInfo, teams, teamObjects, groupId, groups, allTickets, _scopeTickets, sprintInfo, piOffset, ptsPct } = m;
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
        .sort((a, b) => (b.stag ?? 0) - (a.stag ?? 0));   // tous : la carte gère l'aperçu (« Voir les N autres »)

    // ── Avancement du PI (tête du flux « Équipe & risques ») : tickets ENGAGÉS dans le PI affiché ──
    const _pipModel = piProgressModel({
        tickets, piNum: displayPiNum, starts: sprintStartsOf(sprintInfoAll),
        bounds: isCurrentPi ? piBounds({ team, sprintInfo: sprintInfoAll, piInfo, piNum: displayPiNum }) : null,
        teams: teams.map((name, i) => ({ name, color: teamObjects.find(o => o.name === name)?.color || TEAM_COLORS[i % TEAM_COLORS.length] })),
    });
    // États JIRA de la ligne produit (une ligne par équipe), sous la barre : même modèle que la page PI → Indicateurs,
    // état du jour seul (`snapshotOnly`) — pas de rejeu du PI jour par jour sur la page d'accueil.
    const _psrLine = displayPiNum ? lineProductScope({ team, groupId, groups, tickets: allTickets, teams }) : null;
    const _psrModel = _psrLine ? piStageFlowModel({
        tickets: _psrLine.tickets, piNum: displayPiNum, teams: _psrLine.teams, snapshotOnly: true,
        bounds: piBounds({ team: 'all', sprintInfo: sprintInfoAll, piInfo, piNum: displayPiNum }),
        isBuffer: bufferTest(store.get('features') || []),
    }) : null;
    // « 📋 Détail par epic » : même message Slack que la page PI, sur l'équipe filtrée (sinon toute la ligne produit).
    const _psrTeam = team && team !== 'all' && _psrLine?.teams.includes(team) ? team : '';
    const _epicTitles = new Map([...(store.get('epics') || []), ...(store.get('features') || [])].map(x => [x.id, x.title]));
    const _psrCopy = _psrLine ? { title: _psrTeam ? `${_psrLine.prefix}${_psrTeam}` : _psrLine.title, team: _psrTeam,
        epicTitle: id => _epicTitles.get(id) || id, jiraUrl: store.get('jiraUrl') || '' } : null;
    const _psrHtml = _psrModel ? piFlowRowsHtml(_psrModel, { title: _psrLine.title, highlight: team, copyLabel: _psrCopy?.title || '',
        href: `#pi/${groupId && (!team || team === 'all') ? `group:${encodeURIComponent(groupId)}` : encodeURIComponent(team || 'all')}/indicators` }) : '';
    const _pipOpts = {
        label: team && team !== 'all' ? team : (groups.find(g => g.id === groupId)?.name || 'Toutes les équipes'),
        staleDays: STALE_DAYS, stagDays: _stagDays,
        lastMove: t => [t.startedDate, _lastStatusChange(t)].filter(Boolean).sort().at(-1) || null,
    };

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
    // Résumé positionnel du sprint courant (même logique que le bandeau) — uniquement sur le PI courant.
    const _sg = (piOffset === 0 && sprintInfo) ? (() => {
        const _p = s => { const d = String(s || '').slice(0, 10); return d ? new Date(`${d}T00:00:00`).getTime() : NaN; };
        const sStart = _p(sprintInfo.startDate), sEnd = _p(sprintInfo.endDate), now = Date.now();
        const totalMs = (!isNaN(sStart) && !isNaN(sEnd) && sEnd > sStart) ? sEnd - sStart : 0;
        const timePct = totalMs ? Math.round((Math.max(0, Math.min(totalMs, now - sStart)) / totalMs) * 100) : null;
        const delta = (timePct != null) ? ptsPct - timePct : null;
        const deltaTxt = delta == null ? '' : delta >= 0 ? `↗ +${delta}% d'avance` : `↘ ${delta}% de retard`;
        const dayLabel = !isNaN(sEnd) && now > sEnd ? 'Terminé'
            : !isNaN(sEnd) && now < sStart ? `Démarre dans ${Math.ceil((sStart - now) / 86400000)}j`
            : !isNaN(sEnd) ? (() => { const d = Math.ceil((sEnd - now) / 86400000); return d <= 0 ? 'Dernier jour' : d === 1 ? 'J-1' : `J-${d}`; })() : '';
        const short = (String(sprintInfo.name || '').match(/(\d+\.\d+)/) || [])[1] || '';
        return { name: sprintInfo.name, goal: sprintInfo.goal, timePct, delta, deltaTxt, dayLabel, short };
    })() : null;
    return { STALE_DAYS, stuckTickets, _pipModel, _psrModel, _psrCopy, _psrHtml, _pipOpts, byTeam, moodSt, fistSt, _face, _vColor, _sg };
}
