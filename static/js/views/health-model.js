/**
 * Health — modèle : tout ce que la page affiche, calculé UNE fois par rendu (`healthModel()`).
 * Phases dans l'ordre, chacune lit les sorties des précédentes : périmètre (PI, roster, base capacité),
 * vélocité (équipe / ligne produit affichée), anomalies et score, historique du score, métadonnées de
 * sprint par équipe (prévu / réalisé / buffer / capacité — les mêmes chiffres que la modale).
 * Aucun HTML de page ici ; l'état partagé avec la modale est posé par renderHealth, pas par le modèle.
 */

import { store } from '../state.js';
import { getCurrentPi, lastKnownAbsenceDate, effectiveRosterForPi, sprintRealizedVelocity, extractPiNum, piCapacityBase, teamNameMatches, isBreathSprint, computeVelocityHistory, computeCurrentSprintEntry, esc, teamCapacity, rosterCtx, wipThreshold, countWip, engagedInSprint, sprintStartsOf, isInSprint, isBufferItem, plannedAtSprintStart, inSprintNow, sprintScopeDelta, sprintCapacityBase } from '../utils.js';
import { projectedPiSprints } from '../utils/pi-weeks.js';
import { ANOMALY_RULES, healthScore } from '../business_rules.js';
import { sparkline, trendChip } from '../components/sparkline.js';
import { _spKey, _pointsAtLaunch } from './health-shared.js';
import { TEAM_COLORS } from '../config.js';

// Historique local du score Health (snapshot à chaque visite, max 30 entrées)
const HEALTH_HIST_KEY = 'sb-health-history';
const HEALTH_HIST_MAX = 90;   // 3 mois (1 snapshot par jour)
function _loadHealthHistory() {
    try { return JSON.parse(localStorage.getItem(HEALTH_HIST_KEY) || '[]'); }
    catch { return []; }
}
function _pushHealthSnapshot(score, byKey) {
    const today = new Date().toISOString().slice(0, 10);
    const list = _loadHealthHistory();
    // Remplace l'entrée du jour si elle existe, sinon ajoute
    const idx = list.findIndex(s => s.date === today);
    const entry = { date: today, score, byKey };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    localStorage.setItem(HEALTH_HIST_KEY, JSON.stringify(list.slice(-HEALTH_HIST_MAX)));
    return list;
}

/** Modèle complet de la page Health (phases dans l'ordre : chacune lit les sorties des précédentes). */
export function healthModel() {
    const m = _scopeModel();
    for (const phase of [_veloModel, _anomalyModel, _historyModel, _sprintMetaModel]) Object.assign(m, phase(m));
    return m;
}

/** Périmètre : PI affiché, roster du PI, base capacité (`_capBaseFor`), équipes du filtre. */
function _scopeModel() {
    const allTickets  = store.get('tickets')   || [];
    const allTeams    = store.get('teams')     || [];
    const teamObjects = store.get('teamObjects') || [];
    const sprintInfo  = store.get('sprintInfo') || {};
    const teamFilter  = store.get('team');
    const groupId     = store.get('group');
    const groups      = store.get('groups')    || [];
    const absences    = store.get('absences')  || [];
    const members     = store.get('members')   || [];
    const piInfo      = store.get('piInfo');
    const piOffset    = store.get('piOffset')  || 0;
    const currentPiNum = getCurrentPi({ sprintInfo, piInfo });
    const targetPiNum  = currentPiNum ? currentPiNum + piOffset : 0;
    // Contexte du sprint mesuré par les colonnes Vélo/Buffer (dépend du sélecteur PI)
    const _sprintCtxLabel = piOffset === 0
        ? 'sprint courant'
        : `dernier sprint du PI#${targetPiNum}`;
    const _sprintCtxShort = piOffset === 0 ? 'sprint courant' : `PI#${targetPiNum}`;
    // Base de capacité : projection, elle n'a de sens que sur un PI qui n'a pas encore eu
    // lieu. Sur un PI passé ou courant, les colonnes mesurées disent la vérité — une
    // estimation à côté d'elles ne ferait que du bruit.
    const _showCapacity = !!targetPiNum && targetPiNum > currentPiNum;
    const _lastAbsence  = lastKnownAbsenceDate(absences);
    // Rôles : la capacité se compte en ETP, pas en têtes. `roleCapacity` vient des
    // Paramètres → « Capacité dev — % de travail par rôle » (/#settings/cap-roles) ;
    // l'appartenance à une équipe vient des absences (CSV RH), le rôle de la table members.
    const _rolePctMap   = piInfo?.roleCapacity || {};
    // Roster du PI VISÉ — `effectiveRosterForPi` lit le snapshot `piInfo.piMembers[<PI>]`,
    // qui est la composition réellement validée pour ce PI. Ne PAS partir des absences seules :
    // les congés d'une personne SORTIE de l'équipe y restent, et elle continuerait donc de
    // peser dans la capacité d'un PI où elle n'est plus (constaté sur Gabbiano au PI 31).
    // Repli sur les absences quand aucun snapshot n'existe pour ce PI.
    // `teamNameMatches` : le snapshot peut porter « Team Gabbiano » là où l'équipe est « Gabbiano ».
    const _roleAnywhere = new Map();
    for (const m of members) if (m.name && m.role) _roleAnywhere.set(m.name, m.role);
    const _rosterPi = effectiveRosterForPi(piInfo, targetPiNum, absences, members)
        .map(m => m.role ? m : { ...m, role: _roleAnywhere.get(m.name) || '' });
    // Même pondération par rôle pour le PI et pour chaque sprint : sans elle, les congés
    // d'un Product Owner (0 %) rogneraient une capacité à laquelle il ne contribue pas.
    const _pctOfFor = cap => {
        const byName = new Map((cap?.staff?.members || []).map(m => [m.name, m.pct]));
        // Hors roster du PI → 0 : voir utils/capacity-base.js, même règle des deux côtés.
        return name => (byName.has(name) ? byName.get(name) : 0);
    };
    // 🎯 Base capacité d'une équipe pour UN PI — SOURCE UNIQUE de la colonne de la matrice
    // ET de la carte « Capacité prévisionnelle » (avant, la carte faisait son propre calcul :
    // têtes au lieu d'ETP, partis compris, respiration comptée, et toujours « PI courant + 1 »
    // via `piInfo.number` quel que soit le PI sélectionné).
    // Sprints JIRA du PI s'ils existent, sinon PROJETÉS (cadence de pi-weeks.js) : un PI à
    // venir n'a souvent encore aucun sprint créé, et la base resterait vide.
    // Roster = celui du PI demandé (≠ `_rosterPi` quand la carte vise PI+1 depuis le PI courant).
    // Vélocité RÉALISÉE d'un sprint : `sprintRealizedVelocity` (capacity-base.js), source
    // unique partagée avec la page PI — `null` = aucune mesure, écarté des moyennes.
    const _sprintVelo = (tm, sp) => sprintRealizedVelocity(allTickets, sp.team ? sp : { ...sp, team: tm });
    const _capBaseFor = (tm, piNum) => {
        if (!piNum) return null;
        const known = (sprintInfo?.teamSprints || []).filter(s => s.team === tm && extractPiNum(s.name || '') === piNum)
            .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        const sprints = known.length ? known : projectedPiSprints(sprintInfo, piInfo, piNum);
        if (!sprints.length) return null;
        const roster = piNum === targetPiNum ? _rosterPi
            : effectiveRosterForPi(piInfo, piNum, absences, members).map(m => m.role ? m : { ...m, role: _roleAnywhere.get(m.name) || '' });
        const cap = piCapacityBase({
            teamSprints: sprintInfo?.teamSprints || [],
            piSprints: sprints, team: tm, absences, targetPiNum: piNum, lastAbsenceDate: _lastAbsence,
            teamMembers: roster.filter(m => teamNameMatches(m.team, tm)),
            rolePctMap: _rolePctMap,
            sprintsPerPI: piInfo?.sprintsPerPI || 0,
            velocityOf: sp => _sprintVelo(tm, sp),
        });
        if (!cap) return null;
        const plan = sprints.filter(sp => !isBreathSprint(sp.name, cap.breathIdx));
        return { ...cap, piNum, projected: !known.length, planSprints: plan,
            windowStart: plan[0]?.startDate || null, windowEnd: plan.at(-1)?.endDate || null };
    };

    // La colonne ✊ Confiance porte sur le PI entier, pas sur le sprint mesuré à côté :
    // son sous-titre nomme donc toujours le PI, y compris à l'offset 0.
    const _piColLabel = targetPiNum ? `PI#${targetPiNum}` : '';

    // Périmètre : équipes selon filtre topbar (groupe / équipe / toutes)
    let teamsScope = allTeams;
    if (groupId) {
        const g = groups.find(x => x.id === groupId);
        if (g?.teams?.length) teamsScope = allTeams.filter(t => g.teams.includes(t));
    } else if (teamFilter && teamFilter !== 'all') {
        teamsScope = allTeams.filter(t => t === teamFilter);
    }
    teamsScope = teamsScope.slice().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    return { allTickets, allTeams, teamObjects, sprintInfo, teamFilter, groups, absences, members, piInfo, piOffset, currentPiNum, targetPiNum, _sprintCtxLabel, _sprintCtxShort, _showCapacity, _lastAbsence, _pctOfFor, _sprintVelo, _capBaseFor, _piColLabel, teamsScope };
}

/** Vélocité : équipe ou ligne produit affichée, sélecteurs. */
function _veloModel(m) {
    const { groups, teamsScope, teamFilter, allTickets, sprintInfo } = m;
    // Vélocité (même graphe que le Dashboard) — dérivée des sprints clôturés.
    // Périmètre large (plusieurs équipes) → on affiche UNE équipe à la fois via un sélecteur,
    // sinon le graphe agrège les sprints de toutes les équipes et devient illisible.
    // Filtrer sur une ligne produit (groupe) affiche à la place une carte par équipe du groupe.
    const _VELO_GROUP_KEY = 'sb-health-velo-group';
    let _veloGroupSel = localStorage.getItem(_VELO_GROUP_KEY) || null;
    // Le groupe n'existe plus (supprimé) → on nettoie la préférence. S'il existe mais qu'on est
    // momentanément sur un périmètre à 1 équipe (filtre topbar), on garde la préférence en
    // localStorage sans l'appliquer ici — elle redeviendra active dès qu'on repasse en vue large.
    if (_veloGroupSel && !groups.some(g => g.id === _veloGroupSel)) {
        localStorage.removeItem(_VELO_GROUP_KEY);
        _veloGroupSel = null;
    }
    const _activeGroup = (_veloGroupSel && teamsScope.length > 1)
        ? groups.find(g => g.id === _veloGroupSel && (g.teams || []).some(t => teamsScope.includes(t)))
        : null;
    const _groupTeams = _activeGroup ? teamsScope.filter(t => _activeGroup.teams.includes(t)) : [];

    let _veloSel = (teamFilter && teamFilter !== 'all' && teamsScope.includes(teamFilter)) ? teamFilter : null;
    if (!_veloSel) {
        const _saved = localStorage.getItem('sb-health-velo-team');
        _veloSel = (_saved && teamsScope.includes(_saved)) ? _saved : (teamsScope[0] || null);
    }
    const _veloMax = 16;   // n'affiche que les derniers sprints (lisibilité)
    const velocityHistory    = computeVelocityHistory(allTickets, sprintInfo, _veloSel || teamFilter);
    const currentSprintEntry = computeCurrentSprintEntry(allTickets, sprintInfo, _veloSel || teamFilter);
    // Une entrée {team, vh, cur} par équipe de la ligne produit sélectionnée — calculé une seule
    // fois, réutilisé pour le HTML des cartes et pour monter les graphes Chart.js associés.
    const _groupVeloData = _groupTeams.map(tm => ({
        team: tm,
        vh:  computeVelocityHistory(allTickets, sprintInfo, tm),
        cur: computeCurrentSprintEntry(allTickets, sprintInfo, tm),
    }));
    const _veloCanvasId = tm => `chart-velocity-${tm.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Chips équipe, regroupées sous leur ligne produit (groupe) — + "Autres équipes" pour le reste.
    const _groupedTeamIds = new Set(groups.flatMap(g => g.teams || []));
    const _ungroupedTeams = teamsScope.filter(t => !_groupedTeamIds.has(t));
    const _teamChip = tm => `<button class="health-velo-team-chip${!_activeGroup && tm === _veloSel ? ' is-active' : ''}" data-velo-team="${esc(tm)}">${esc(tm)}</button>`;
    const _groupChipBlock = g => {
        const gTeams = (g.teams || []).filter(t => teamsScope.includes(t));
        if (!gTeams.length) return '';
        return `<div class="health-velo-group">
            <button class="health-velo-group-chip${_activeGroup?.id === g.id ? ' is-active' : ''}" data-velo-group="${esc(g.id)}" style="--gc:${esc(g.color || '#6366f1')}" title="Afficher la vélocité de toutes les équipes de la ligne produit « ${esc(g.name)} »">🗂️ ${esc(g.name)}</button>
            ${gTeams.map(_teamChip).join('')}
        </div>`;
    };
    const _veloTeamChips = teamsScope.length > 1
        ? `<div class="health-velo-teams">
            <span class="health-velo-teams-lbl">Vélocité par équipe :</span>
            ${groups.map(_groupChipBlock).join('')}
            ${_ungroupedTeams.length ? `<div class="health-velo-group health-velo-group--none">${_ungroupedTeams.map(_teamChip).join('')}</div>` : ''}
        </div>`
        : '';
    return { _activeGroup, _veloMax, velocityHistory, currentSprintEntry, _groupVeloData, _veloCanvasId, _veloTeamChips };
}

/** Anomalies par équipe (règles de business_rules.js) et score global de santé. */
function _anomalyModel(m) {
    const { piOffset, targetPiNum, allTickets, teamsScope, sprintInfo, members, absences } = m;
    // Filtre PI : si offset ≠ 0, on ne garde que les tickets du PI cible
    const piTickets = (piOffset !== 0 && targetPiNum)
        ? allTickets.filter(t => extractPiNum(t.sprintName || t.sprint_name || '') === targetPiNum)
        : allTickets;

    // Compute : pour chaque équipe → contexte d'anomalie (sprint + capacité/WIP)
    const ctxByTeam = {};
    for (const tm of teamsScope) {
        const ts = sprintInfo.teamSprints || [];
        const teamSprint = ts.find(s => s.team === tm && s.state === 'active') || ts.find(s => s.team === tm);
        const sprintStartMs = teamSprint?.startDate
            ? new Date(String(teamSprint.startDate).slice(0, 10)).getTime() : 0;
        // Capacité du jour (membres présents, congés déduits) → seuil de WIP "élevé"
        const wipCapacity = teamCapacity(tm, members, absences, undefined, rosterCtx(store.get('piInfo'), store.get('sprintInfo')));
        const wipMax       = wipThreshold(wipCapacity);
        const wipCount     = countWip(piTickets.filter(t => t.team === tm));
        const wipExceededTeams = wipCount > wipMax ? new Set([tm]) : new Set();
        ctxByTeam[tm] = { sprintStartMs, wipCapacity, wipMax, wipCount, wipExceededTeams, curPi: targetPiNum };
    }

    const matrix = {}; // matrix[team][anomalyKey] = count
    const totals = {}; // totals[anomalyKey] = sum across teams
    for (const a of ANOMALY_RULES) totals[a.key] = 0;
    for (const tm of teamsScope) {
        matrix[tm] = {};
        const tickets = piTickets.filter(t => t.team === tm);
        for (const a of ANOMALY_RULES) {
            const n = tickets.filter(t => a.match(t, ctxByTeam[tm])).length;
            matrix[tm][a.key] = n;
            totals[a.key] += n;
        }
    }

    // Score global de santé : formule UNIQUE dans business_rules.js (healthScore), partagée avec
    // la météo des équipes du Dashboard — pondération danger ×3, warning ×1.5, info ×0.5,
    // normalisée par les tickets actifs.
    const totalActiveTickets = allTickets.filter(t => teamsScope.includes(t.team) && t.status !== 'done').length || 1;
    const score = healthScore(totals, totalActiveTickets);
    const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Correct' : score >= 40 ? 'Attention' : 'Critique';
    const scoreCls   = score >= 80 ? 'health-score--good' : score >= 60 ? 'health-score--ok' : score >= 40 ? 'health-score--warn' : 'health-score--bad';
    return { piTickets, matrix, totals, totalActiveTickets, score, scoreLabel, scoreCls };
}

/** Historique local du score : instantané du jour, sparkline et tendance. */
function _historyModel(m) {
    const { score, totals } = m;
    // Snapshot du jour → historique → sparkline tendance
    const history = _pushHealthSnapshot(score, { ...totals });
    const scoreSeries = history.map(s => s.score);
    const scoreSparkline = scoreSeries.length >= 2
        ? sparkline(scoreSeries, { width: 120, height: 32, color: 'var(--health-color, #3b82f6)', areaFill: true, showLast: true, showMinMax: true })
        : '';
    const scoreTrend = scoreSeries.length >= 2 ? trendChip(scoreSeries, { invertGood: false, unit: ' pts' }) : '';

    // Helpers pour series par anomalie
    const seriesFor = (key) => history.map(s => s.byKey?.[key] ?? 0);
    return { scoreSparkline, scoreTrend, seriesFor };
}

/** Métadonnées de sprint par équipe : prévu / réalisé / buffer, sprints du PI, base capacité. */
function _sprintMetaModel(m) {
    const { teamsScope, teamObjects, allTeams } = m;
    const moodVotes = store.get('moodVotes') || [];
    const sprintMetaByTeam = Object.fromEntries(teamsScope.map(tm => [tm, _teamSprintMeta(tm, m, moodVotes)]));

    const teamColor = (name) => {
        const tObj = teamObjects.find(o => o.name === name);
        if (tObj?.color) return tObj.color;
        const idx = allTeams.indexOf(name);
        return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0];
    };
    return { sprintMetaByTeam, teamColor };
}

/**
 * Métadonnées de sprint d'UNE équipe — sprint de référence (actif, ou dernier du PI visé), périmètre
 * engagé / au lancement / actuel, réalisé, buffer, votes, détail par sprint du PI et base capacité.
 * Lues telles quelles par la matrice ET la modale : un seul calcul, mêmes chiffres.
 */
function _teamSprintMeta(tm, m, moodVotes) {
    const { sprintInfo, piOffset, targetPiNum, allTickets, piTickets, teamObjects, allTeams, currentPiNum, _showCapacity, _capBaseFor, absences, _pctOfFor, _lastAbsence } = m;
    const ts = (sprintInfo.teamSprints || []).filter(s => s.team === tm);
    // Sprint de référence : actif ou dernier fermé (du PI cible si offset)
    let ref;
    if (piOffset === 0 || !targetPiNum) {
        ref = ts.find(s => s.state === 'active')
           || ts.slice().sort((a, b) => (b.endDate||'').localeCompare(a.endDate||''))[0];
    } else {
        ref = ts.filter(s => extractPiNum(s.name||'') === targetPiNum)
                .sort((a, b) => (b.endDate||'').localeCompare(a.endDate||''))[0];
    }

    // Périmètre du sprint de référence. `spTickets` = tout ce qui a été ENGAGÉ, reports
    // compris (voir utils/sprint-scope.js) ; `done` = ce qui a réellement été fini DANS le
    // sprint, donc les seuls tickets qui y sont restés.
    const spName    = ref?.name || '';
    const _refKey   = _spKey(spName);
    const spTickets = spName
        ? allTickets.filter(t => t.team === tm && engagedInSprint(t, spName, sprintStartsOf(sprintInfo), _refKey))
        : piTickets.filter(t => t.team === tm);
    const done    = spTickets.filter(t => t.status === 'done'
        && (!spName || isInSprint(t, spName, _refKey)));
    const bufDone = done.filter(t => isBufferItem(t));

    // Vélocité : calculé depuis les tickets Done locaux dès qu'on en a (source la plus à
    // jour — JIRA ne fige sa stat de vélocité qu'à la clôture du sprint, elle peut rester à
    // 0/stale en cours de sprint). JIRA en fallback seulement si aucun Done connu localement.
    const vPts = done.length    ? done.reduce((s, t) => s + (t.points||0), 0)    : (ref?.velocity     != null ? ref.velocity     : 0);
    const bPts = bufDone.length ? bufDone.reduce((s, t) => s + (t.points||0), 0) : (ref?.bufferPoints != null ? ref.bufferPoints : 0);

    // Périmètre engagé "au lancement du sprint" : les tickets présents dans le sprint À SON
    // DÉMARRAGE (historique du champ Sprint rejoué jusqu'à `startDate`, done ou non) — les
    // ajouts en cours de sprint n'en font pas partie (plannedAtSprintStart, sprint-scope.js).
    // Vélocité planifiée = estimation JIRA au démarrage (Greenhopper `estimated`) si dispo,
    // sinon somme des points reconstitués au lancement (_pointsAtLaunch, via l'historique
    // JIRA du champ Story Points) — sinon une réestimation en cours de sprint fausserait
    // la vélocité planifiée.
    const planned    = spName
        ? spTickets.filter(t => plannedAtSprintStart(t, spName, ref?.startDate, _refKey))
        : spTickets;
    const bufPlanned = planned.filter(t => isBufferItem(t));
    const _refCur    = spName ? spTickets.filter(t => inSprintNow(t, spName, _refKey)) : spTickets;
    const planTk     = planned.length;
    const planPts    = (ref?.estimated != null && ref.estimated > 0)
        ? ref.estimated
        : planned.reduce((s, t) => s + _pointsAtLaunch(t, ref?.startDate), 0);
    const bufPlanTk  = bufPlanned.length;
    const bufPlanPts = bufPlanned.reduce((s, t) => s + _pointsAtLaunch(t, ref?.startDate), 0);

    // Mood du sprint (piSprint = "29.3" extrait du nom de sprint)
    const spKey   = _spKey(spName);
    const moods   = moodVotes.filter(v => v.team === tm && (!spKey || v.piSprint === spKey)).map(v => parseInt(v.value)||0).filter(Boolean);
    const avgMood = moods.length ? Math.round((moods.reduce((a,b)=>a+b,0)/moods.length)*10)/10 : null;

    // Tous les sprints du PI pour ce team (tableau PI)
    const piSprints = ts
        .filter(s => !targetPiNum || extractPiNum(s.name||'') === targetPiNum)
        .sort((a, b) => (a.startDate||'').localeCompare(b.startDate||''));

    // Tickets Done / Buffer Done par sprint (pour le clic sur les cellules Vélo/Buffer).
    // Matching tolérant : nom exact OU même clé de sprint NN.N (ex: "Team G - Ité 29.3"
    // ↔ "GCOM 29.3" → "29.3"), car le nom du sprint JIRA et celui porté par les tickets
    // peuvent différer légèrement.
    const sprintTickets = {};
    for (const sp of piSprints) {
        const spk  = _spKey(sp.name);
        // Périmètre ENGAGÉ : on part de `allTickets` et non de `piTickets`, car un ticket
        // reporté porte le sprint d'ARRIVÉE — souvent d'un autre PI — et le filtre PI le
        // ferait disparaître du sprint où il avait pourtant été engagé. Le sprint étant
        // ici nommé explicitement, ce filtre est de toute façon redondant.
        // Engagé / au lancement / actuel : sprintScopeDelta (sprint-scope.js), source unique
        // partagée avec le domaine 📐 Périmètre de la Météo.
        const _delta = sprintScopeDelta(allTickets.filter(t => t.team === tm), sp, spk);
        const spTk = _delta.engaged;
        // Vélocité RÉALISÉE : uniquement les tickets restés dans le sprint. Compter les
        // reportés terminés ailleurs gonflerait la vélocité d'un sprint avec du travail
        // fait après sa clôture — le contraire de ce qu'elle mesure.
        const spDone = spTk.filter(t => t.status === 'done' && isInSprint(t, sp.name, spk));
        // ENGAGÉ AU LANCEMENT : présents dans le sprint à son démarrage — un ticket ajouté
        // en cours de sprint n'était pas planifié et ne gonfle ni le « prévu » ni sa liste.
        const spPlan   = _delta.plan;
        const spBufAll = spPlan.filter(t => isBufferItem(t));
        const spCur    = _delta.cur;
        sprintTickets[sp.name] = {
            done:    spDone,
            bufDone: spDone.filter(t => isBufferItem(t)),
            all:     spPlan,
            bufAll:  spBufAll,
            added:   spTk.length - spPlan.length,
            // ACTUEL : ce que le sprint contient maintenant ; sprint clos = son contenu À
            // LA CLÔTURE, reportés compris (inSprintNow). `plannedIds` repère les ajouts.
            cur:     spCur,
            bufCur:  spCur.filter(t => isBufferItem(t)),
            plannedIds: new Set(spPlan.map(t => t.id)),
            startDate:  sp.startDate,
            planTk:     spPlan.length,
            planPts:    (sp.estimated != null && sp.estimated > 0) ? sp.estimated : spPlan.reduce((s, t) => s + _pointsAtLaunch(t, sp.startDate), 0),
            bufPlanTk:  spBufAll.length,
            bufPlanPts: spBufAll.reduce((s, t) => s + _pointsAtLaunch(t, sp.startDate), 0),
        };
    }

    const tObj = teamObjects.find(o => o.name === tm);
    const teamColor = tObj?.color || TEAM_COLORS[allTeams.indexOf(tm) % TEAM_COLORS.length] || '#6366f1';

    const metaObj = {
        ref,
        done, bufDone,
        all: planned, bufAll: bufPlanned,
        cur: _refCur, bufCur: _refCur.filter(t => isBufferItem(t)),
        plannedIds: new Set(planned.map(t => t.id)),
        spName, spKey,
        vPts, bPts,
        planTk, planPts, bufPlanTk, bufPlanPts,
        estimated:    ref?.estimated    ?? null,
        velocity:     ref?.velocity     ?? null,
        bufferPoints: ref?.bufferPoints ?? null,
        startDate:    ref?.startDate    ?? null,
        endDate:      ref?.endDate      ?? null,
        state:        ref?.state        ?? null,
        avgMood, moods,
        piSprints, teamColor, sprintTickets,
        piNum: targetPiNum || currentPiNum,
        // 🎯 Base de capacité du PI visé + sa ventilation par sprint. Calculée ICI, une
        // seule fois : la matrice et la modale doivent afficher exactement le même
        // chiffre, et deux calculs finiraient toujours par diverger.
        ...(() => {
            if (!_showCapacity) return { capBase: null, capBySprint: {} };
            const capBase = _capBaseFor(tm, targetPiNum);
            const capBySprint = {};
            if (capBase) {
                for (const sp of piSprints) {
                    // Pas de charge suggérée sur la respiration : on n'y engage rien.
                    if (isBreathSprint(sp.name, capBase.breathIdx)) continue;
                    const b = sprintCapacityBase({
                        avg: capBase.avg, sprint: sp, absences, team: tm,
                        etp: capBase.etp, pctOf: _pctOfFor(capBase),
                        lastAbsenceDate: _lastAbsence,
                    });
                    if (b) capBySprint[sp.name] = b;
                }
            }
            return { capBase, capBySprint };
        })(),
    };
    return metaObj;
}
