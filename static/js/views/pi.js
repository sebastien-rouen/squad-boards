/**
 * PI Planning view - tabs: Objectifs, Features, Capacite, Equipes.
 *
 * Découpé en 3.258.0 : un module par onglet (pi-objectives, pi-features, pi-capacity +
 * pi-capacity-model, pi-teams, pi-burnup, pi-votes). Ici : coquille, onglets, indicateurs, dépendances.
 */

import { store } from '../state.js';
import { esc, pct, filterByTeam, sumBy, deriveMembersFromAbsences, rollupStatus, belongedToPi, isBufferItem, computeVelocityBreakdown, isAbandoned, engagedInPi, cycleDays, leadDays } from '../utils.js';
import { TEAM_COLORS } from '../config.js';
import { piBounds } from '../utils/pi-weeks.js';
import { renderPICalendar } from './picalendar.js';
import { renderTeamDepBoard, bindTeamDepBoard, computeTeamDependencies } from '../components/dep_graph.js';
import { renderCycleTime, renderPiFlow } from '../components/charts.js';
import { piStageFlowModel, piFlowCardHtml, bindPiFlowCards, piFlowUnit, piFlowView, piFlowPct, piFlowLate, bufferTest, lineProductScope } from '../components/pi_stage_flow.js';
import { METEO_GLYPH, effectiveRosterForPi, teamNameMatches, isWorkday, percentile } from '../utils.js';
import { meteoSummary, METEO_MC } from '../components/meteo_report.js';
import { meteoContext } from '../components/meteo_matrix.js';
import { stageFlowCardHtml, bindStageFlowCard } from '../components/stage_flow_card.js';
import { agingWipCardHtml, bindAgingWipCard } from '../components/aging_wip_card.js';
import { helpIconHtml } from '../components/help_popover.js';
import { _extractPi, renderBurnup } from './pi-burnup.js';
import { renderCapacity } from './pi-capacity.js';
import { _capAbsDaysInWindow, _capAvgVelocity, _capGetExcludedRoles, _capGetHistoryCount, _capGetHistoryMode, _capGetRolePct, _capNominalWorkdays, _capRolePct, _capSprintWindows, _withRealizedVelocity, _workdays } from './pi-capacity-model.js';
import { renderFeatures } from './pi-features.js';
import { renderObjectives, syncObjectivesLock } from './pi-objectives.js';
import { renderSupportRota, renderTeams } from './pi-teams.js';
import { renderFist, renderMood } from './pi-votes.js';

// API publique inchangée (tests) : ré-export
export { renderObjectives } from './pi-objectives.js';

let _activeTab = 'objectives';

export function renderPI(container) {
    const team       = store.get('team');
    const piInfo     = store.get('piInfo');
    const sprintInfo = store.get('sprintInfo');
    const absences   = store.get('absences') || [];
    const jiraUrl    = store.get('jiraUrl') || null;
    const teams      = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const epics      = store.get('epics') || [];

    // PI sélectionné (sélecteur topbar piOffset)
    const basePiNum  = _extractPi(sprintInfo?.name) || piInfo?.number || 0;
    const piOffset   = store.get('piOffset') || 0;
    const piNum      = basePiNum ? Math.max(1, basePiNum + piOffset) : 0;
    const piTag      = piNum ? `PI#${piNum}` : null;

    // Helper : est-ce que ce ticket/feature appartient au PI sélectionné ?
    const _normPi = v => v == null ? '' : String(v).toUpperCase().replace(/\s+/g, '');
    const _inPi = (raw) => {
        if (!raw || !piTag) return !piOffset; // pas de tag → on garde tout si PI courant
        const s = _normPi(raw);
        if (s === _normPi(piTag)) return true;
        if (s === `PI${piNum}`) return true;
        const m = s.match(/^(\d+)\.\d+$/);
        return !!(m && parseInt(m[1], 10) === piNum);
    };
    // Tickets du PI = `engagedInPi`, MÊME source que le Dashboard et la Météo, alignée sur le rapport JIRA
    // du train (3.224.0) : présents dans un sprint du PI (reports à la clôture compris), sans les retirés ni
    // les « Clos sans suite ».
    const _ticketInPi = (t) => engagedInPi(t, piNum);
    const _featureInPi = (f) => _inPi(f.piSprint) || _inPi(f.sprintName) ||
        (f.labels || []).some(l => _inPi(l));

    // Filtre par équipe puis par PI
    const allTeamTickets   = filterByTeam(store.get('tickets') || [], team);
    const allTeamFeatures  = filterByTeam(store.get('features') || [], team);
    const tickets  = piTag ? allTeamTickets.filter(_ticketInPi)  : allTeamTickets.filter(t => !isAbandoned(t));
    // Périmètre des mesures de DURÉE (card « Temps par colonne ») : `belongedToPi`, retirés compris —
    // un ticket travaillé puis sorti du PI a bien passé ce temps dans les colonnes. Les compteurs
    // gardent `tickets` (périmètre aligné sur JIRA).
    const flowTickets = piNum ? allTeamTickets.filter(t => belongedToPi(t, piNum)) : allTeamTickets;
    const features = piTag ? allTeamFeatures.filter(_featureInPi) : allTeamFeatures;

    // Items du PI TOUTES équipes (pas de filtre équipe) — pour le programme board inter-équipes (#14).
    // Filtrer par l'équipe sélectionnée masquerait l'autre bout d'un lien inter-équipes.
    const _epicInPi = (e) => _inPi(e.piSprint) || _inPi(e.sprintName) || (e.labels || []).some(l => _inPi(l));
    const depItems = piTag
        ? [...(store.get('tickets') || []).filter(_ticketInPi),
           ...(store.get('features') || []).filter(_featureInPi),
           ...epics.filter(_epicInPi)]
        : [...(store.get('tickets') || []), ...(store.get('features') || []), ...epics];
    const depCross = computeTeamDependencies(depItems).crossCount;

    syncObjectivesLock(piOffset);   // verrou des objectifs relâché au changement de PI

    // Label et objectifs du PI sélectionné
    // Les objectifs sont stockés dans piInfo (PI courant) — si on affiche un autre PI, on le signale
    const isCurrentPi = piOffset === 0;
    // piInfo.name peut être "PI#30" alors que basePiNum=29 (extrait du sprint actif) — on utilise
    // toujours piNum (source de vérité calculée) pour le titre, piInfo.name en suffixe seulement si cohérent.
    const piInfoName = piInfo?.name && piInfo.name.includes(String(piNum)) ? piInfo.name : null;
    const piLabel = piNum
        ? (isCurrentPi ? (piInfoName || `PI#${piNum}`) : `PI#${piNum}`)
        : 'PI en cours';
    const objectives = isCurrentPi ? (piInfo?.objectives || []) : [];

    // Buffer & Velocity metrics — source unique computeVelocityBreakdown / isBufferItem
    const bufTickets = tickets.filter(isBufferItem);
    const { bufferPts: bufPts, bufferDonePts: bufDonePts,
            featurePts: velPts, featureDonePts: velDonePts } = computeVelocityBreakdown(tickets);
    const velRatio   = velPts ? pct(velDonePts, velPts) : 0;
    const bufRatio   = bufPts ? pct(bufDonePts, bufPts) : 0;

    const _stC = { done:'var(--success)', inprog:'var(--primary)', review:'#6366f1', test:'var(--warning)', blocked:'var(--danger)', todo:'var(--text-muted)' };
    const _stI = { done:'✓', inprog:'●', review:'◑', test:'◕', blocked:'✗', todo:'○' };
    const _stL = { done:'Terminé', inprog:'En cours', review:'Review', test:'Test', blocked:'Bloqué', todo:'À faire' };
    const nonBufTickets = tickets.filter(t => !isBufferItem(t));
    const velRows = ['done','inprog','review','test','blocked','todo']
        .map(s => ({ s, pts: sumBy(nonBufTickets.filter(t => t.status === s), t => t.points || 0), count: nonBufTickets.filter(t => t.status === s).length }))
        .filter(x => x.count > 0);

    // Blockers — pour la metric-card de remplacement
    const blockedTickets = tickets.filter(t => t.status === 'blocked');
    const blockedPts     = sumBy(blockedTickets, t => t.points || 0);

    // Feature progress + statut dérivé depuis les enfants (avancée réelle)
    // Chaîne de résolution : ticket.epic → epic.id + epic.feature === feature.id
    // Fallback : ticket.epic === feature.id (tickets liés directement à la feature sans epic intermédiaire)
    const featureList = features.map(f => {
        const viaEpic    = tickets.filter(t => t.epic && epics.find(e => e.id === t.epic && e.feature === f.id));
        const viaDirect  = tickets.filter(t => t.epic === f.id || t.featureId === f.id || t.feature === f.id);
        const children   = viaEpic.length > 0 ? viaEpic : viaDirect;
        const total = children.length;
        const done  = children.filter(t => t.status === 'done').length;
        const rolledStatus = rollupStatus(children, f.status);
        const childPts     = sumBy(children, t => t.points || 0);
        const childPtsDone = sumBy(children.filter(t => t.status === 'done'), t => t.points || 0);
        // SP affichés : enfants trouvés > champ points JIRA de la feature (jamais fallback tous tickets équipe)
        const displayPts = childPts > 0 ? childPts : (f.points || 0);
        // Progress : % tickets enfants done, ou 100/50/0 selon statut JIRA si pas d'enfants
        const progress = total > 0 ? pct(done, total)
            : f.status === 'done'   ? 100
            : f.status === 'inprog' ? 50
            : 0;
        return { ...f, progress, childCount: children.length, allCount: children.length, rolledStatus, childPts: displayPts, childPtsDone };
    });

    // Team capacity — onglet Équipes. Roster = celui DU PI affiché (`effectiveRosterForPi`, partis
    // exclus) et absences BORNÉES au PI (`piBounds`) : l'ancien calcul sommait tout l'historique des
    // congés (« 381 j d'absence ») et comptait les membres partis.
    // `effectiveMembers` reste utilisé par `_computeCapByTeam` (Capacité) : ne pas le retirer.
    const effectiveMembers = deriveMembersFromAbsences(absences, store.get('members') || []);
    const _roster   = piNum ? effectiveRosterForPi(piInfo, piNum, absences, store.get('members') || []) : effectiveMembers;
    const _piWin    = piNum ? piBounds({ sprintInfo: store.get('sprintInfo'), piInfo, piNum }) : null;
    const _wdCount  = (a, b) => { let n = 0; for (const d = new Date(`${a}T12:00:00`); d <= new Date(`${b}T12:00:00`); d.setDate(d.getDate() + 1)) if (isWorkday(d)) n++; return n; };
    const _absInPi  = a => {   // jours d'absence DANS la fenêtre du PI, au prorata des jours ouvrés recouverts
        if (!_piWin) return a.days || 0;
        const s0 = String(a.startDate || '').slice(0, 10), e0 = String(a.endDate || a.startDate || '').slice(0, 10);
        const s1 = s0 > _piWin.startIso ? s0 : _piWin.startIso, e1 = e0 < _piWin.endIso ? e0 : _piWin.endIso;
        if (!s0 || s1 > e1) return 0;
        const full = _wdCount(s0, e0);
        return full ? (a.days || 0) * _wdCount(s1, e1) / full : 0;
    };
    const teamCap = teams.map((t, i) => {
        const tObj = teamObjects.find(o => o.name === t);
        const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];
        // Filtre par équipe ET par PI sélectionné
        const tt = (piTag
            ? filterByTeam(store.get('tickets') || [], t).filter(_ticketInPi)
            : filterByTeam(store.get('tickets') || [], t).filter(x => !isAbandoned(x)));
        const total = tt.length;
        const done = tt.filter(x => x.status === 'done').length;
        const pts = sumBy(tt, x => x.points);
        const donePts = sumBy(tt.filter(x => x.status === 'done'), x => x.points);
        const members = _roster.filter(m => teamNameMatches(m.team, t));
        const names = new Set(members.map(m => m.name));
        const absDays = Math.round(absences.filter(a => names.has(a.memberName)).reduce((s, a) => s + _absInPi(a), 0) * 2) / 2;
        // Statuts calculés sur les tickets DE L'ÉQUIPE (l'onglet les relisait dans les tickets filtrés sur
        // l'équipe sélectionnée : « 0 tickets » partout sauf chez elle).
        const statusCounts = {};
        for (const x of tt) statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
        return { name: t, color, total, done, pts, donePts, memberCount: members.length, absDays, statusCounts, blocked: statusCounts.blocked || 0 };
    });

    // Capacité nette estimée par équipe sur le PI entier (pour la ligne séparatrice dans Features)
    // Config locale du PI affiché (stockée par settings.js)
    const _piCfgLocal2 = (() => { try { return JSON.parse(localStorage.getItem(`pi-cfg-${piNum}`) || 'null'); } catch { return null; } })();
    const absenceTeamNames2 = new Set(absences.map(a => a.team));
    const _absAlias2 = tn => absenceTeamNames2.has(tn) ? tn : (absenceTeamNames2.has('Team ' + tn) ? 'Team ' + tn : tn);

    const _computeCapByTeam = () => {
        const _rolePctMap   = _capGetRolePct();
        const _excluded     = _capGetExcludedRoles();
        const _histMode     = _capGetHistoryMode();
        const _histCount    = _capGetHistoryCount();
        const _piCfgLoc     = (() => { try { return JSON.parse(localStorage.getItem(`pi-cfg-${piNum}`) || 'null'); } catch { return null; } })();
        const _spDur        = _piCfgLoc?.sprintDuration || piInfo?.sprintDuration || 14;
        const _spCnt        = _piCfgLoc?.sprintsPerPI   || piInfo?.sprintsPerPI   || 5;
        const _piStart      = piOffset === 0
            ? (_piCfgLoc?.startDate || piInfo?.startDate || null)
            : (_piCfgLoc?.startDate || null);
        const _absTeamNames = new Set(absences.map(a => a.team));
        const _absAlias     = tn => _absTeamNames.has(tn) ? tn : (_absTeamNames.has('Team ' + tn) ? 'Team ' + tn : tn);
        const _sprintInfo2  = store.get('sprintInfo');
        const _allTeamSpr   = (_sprintInfo2?.teamSprints || []).map(s => _withRealizedVelocity(s, store.get('tickets') || []));
        const _wins = _capSprintWindows({ ...piInfo, number: piNum, sprintsPerPI: _spCnt, sprintDuration: _spDur, startDate: _piStart }, _allTeamSpr);
        const result = {};
        teams.forEach(teamName => {
            const tObj  = teamObjects.find(o => o.name === teamName);
            const color = tObj?.color || '#64748b';
            const absTeam = _absAlias(teamName);
            const mems = effectiveMembers.filter(m => {
                if (m.team !== absTeam) return false;
                return !_excluded.some(r => r.toLowerCase() === (m.role || '').toLowerCase());
            });
            const memberEtp = mems.reduce((s, m) => s + _capRolePct(m.role, _rolePctMap) / 100, 0);
            if (memberEtp === 0) { result[teamName] = { spNet: 0, spEst: 0, spBuf: 0, color }; return; }
            const baseCapRaw = localStorage.getItem(`cap-base-${piNum}-${teamName}`);
            const baseCapacity = baseCapRaw && baseCapRaw !== '' ? parseInt(baseCapRaw, 10) : null;
            const avgVel = _capAvgVelocity(_allTeamSpr, teamName, piNum, _histMode, _histCount);
            const capMult = (baseCapacity !== null && baseCapacity > 0) ? baseCapacity : avgVel;
            let totalSpEst = 0;
            for (let idx = 0; idx < _spCnt; idx++) {
                const win = _wins?.[idx] || null;
                if (win?.isIP) continue;
                // Jours OUVRÉS de la fenêtre — même règle que renderCapacity (plus `× _spDur` calendaires).
                const totalDays = memberEtp * (win ? _workdays(win.from, win.to) : _capNominalWorkdays(_spDur));
                const absDays = win
                    ? Math.round(mems.reduce((s, m) => {
                        const p2 = _capRolePct(m.role, _rolePctMap) / 100;
                        if (p2 === 0) return s;
                        const raw = _capAbsDaysInWindow(absences.filter(a => a.memberName === m.name), absTeam, win.from, win.to);
                        return s + raw * p2;
                    }, 0) * 10) / 10
                    : 0;
                const availPct = totalDays > 0 ? Math.round(((totalDays - absDays) / totalDays) * 100) : 100;
                totalSpEst += Math.ceil(capMult * (availPct / 100));
            }
            const spBuf = Math.round(totalSpEst * 0.2);
            result[teamName] = { spEst: totalSpEst, spBuf, spNet: totalSpEst - spBuf, color };
        });
        return result;
    };

    const capByTeam = _computeCapByTeam();

    // Objectifs filtrés par équipe pour le compteur du tab
    const objectivesFiltered = (!team || team === 'all')
        ? objectives
        : objectives.filter(o => (o.team || '') === team);

    const tabs = [
        { id: 'objectives', label: `🎯 Objectifs (${objectivesFiltered.length})` },
        { id: 'indicators', label: '📊 Indicateurs' },
        { id: 'features',   label: `📦 Features (${features.length})` },
        { id: 'capacity',   label: '⚡ Capacité' },
        { id: 'burnup',     label: '📈 Burnup' },
        { id: 'deps',       label: `🔗 Dépendances${depCross ? ` (${depCross})` : ''}` },
        { id: 'teams',      label: '👥 Équipes' },
        { id: 'support',    label: '🛡️ Support' },
        { id: 'mood',       label: '😊 Mood / ROTI' },
        { id: 'fist',       label: '✊ Fist of Five' },
        { id: 'calendar',   label: '📅 Calendrier' },
    ];
    const validTabIds = new Set(tabs.map(t => t.id));
    // Hash format : #pi/équipe/tab - le tab est en 3ème segment
    const hashParts = window.location.hash.replace(/^#/, '').split('/');
    const hashTab   = hashParts[2] || store.get('piTab') || '';
    if (validTabIds.has(hashTab)) _activeTab = hashTab;

    // Epics filtrés par PI
    const piEpics = piTag ? epics.filter(e => _inPi(e.piSprint) || _inPi(e.sprintName)) : epics;

    container.innerHTML = `
        <div class="pi-header">
            <h2>${esc(piLabel)}${!isCurrentPi ? ` <span class="chip chip-pi" style="font-size:12px;vertical-align:middle">PI#${piNum}</span>` : ''}</h2>
            <button aria-label="Mode présentation (plein écran)" class="btn-icon pi-present-btn" id="pi-present-btn" title="Mode présentation (plein écran)"><svg class="icon"><use href="#i-maximize"/></svg></button>
        </div>

        <!-- PI Metrics -->
        <div class="pi-overview mb-4">
            <div class="metric-card mc-primary mc-has-tooltip" data-mc-tt="mc-tt-features">
                <span class="metric-icon">📦</span>
                <span class="metric-label">Features</span>
                <span class="metric-value">${features.length}</span>
                <span class="metric-sub">${features.filter(f => f.status === 'done').length} terminées</span>
            </div>
            <div class="metric-card mc-info mc-has-tooltip" data-mc-tt="mc-tt-epics">
                <span class="metric-icon">🏗️</span>
                <span class="metric-label">Epics</span>
                <span class="metric-value">${piEpics.length}</span>
                <span class="metric-sub">${piEpics.filter(e => e.status === 'done').length} terminés</span>
            </div>
            ${(() => {
                // Météo du PI (domaine 🗓️ de la matrice) — PI courant seulement, même calcul que le Dashboard.
                if (!isCurrentPi) return '';
                const _t = store.get('team');
                const m = meteoSummary((_t && _t !== 'all') ? teams.filter(x => x === _t) : teams, meteoContext(piNum));
                if (!m) return '';
                return `<div class="metric-card ${METEO_MC[m.pi.level]} meteo-metric" title="${esc(m.text)}">
                    <span class="metric-icon">${m.glyph}</span>
                    <span class="metric-label">Météo du PI</span>
                    <span class="metric-value">${METEO_GLYPH[m.pi.level]} <span class="metric-denom">${esc(m.pi.value)}</span></span>
                    <span class="metric-sub">${esc(m.pi.sub || m.label)}</span>
                </div>`;
            })()}
            <div class="metric-card ${objectivesFiltered.filter(o => o.status === 'done').length === objectivesFiltered.length && objectivesFiltered.length ? 'mc-done' : 'mc-warning'} mc-has-tooltip" data-mc-tt="mc-tt-obj">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Objectifs</span>
                <span class="metric-value">${objectivesFiltered.length}</span>
                <span class="metric-sub">${objectivesFiltered.filter(o => o.status === 'done').length} atteints</span>
            </div>
            <div class="metric-card ${blockedTickets.length > 0 ? 'mc-danger' : 'mc-done'} mc-has-tooltip" data-mc-tt="mc-tt-blocked">
                <span class="metric-icon">🚫</span>
                <span class="metric-label">Bloqués</span>
                <span class="metric-value">${blockedTickets.length}</span>
                <span class="metric-sub">${blockedPts} pts impactés</span>
            </div>
            <div class="metric-card ${velRatio >= 80 ? 'mc-done' : velRatio >= 40 ? 'mc-inprog' : 'mc-warning'} mc-has-tooltip" data-mc-tt="mc-tt-vel">
                <span class="metric-icon">⚡</span>
                <span class="metric-label">Vélocité</span>
                <span class="metric-value">${velDonePts}<span class="metric-denom"> / ${velPts}</span></span>
                <span class="metric-sub">${velRatio}% · planifié ${velPts} pts</span>
            </div>
            <div class="metric-card ${bufPts === 0 ? 'mc-info' : bufRatio >= 80 ? 'mc-done' : 'mc-info'} mc-has-tooltip" data-mc-tt="mc-tt-buf">
                <span class="metric-icon">🔄</span>
                <span class="metric-label">Buffer</span>
                <span class="metric-value">${bufDonePts}<span class="metric-denom"> / ${bufPts}</span></span>
                <span class="metric-sub">${bufRatio}% · ${bufTickets.length} ticket${bufTickets.length !== 1 ? 's' : ''}</span>
            </div>

            <!-- Tooltips détail (position:fixed via JS) -->
            <div class="mc-tt" id="mc-tt-features">
                <div class="mc-tt-head">📦 Features · détail</div>
                ${['done','inprog','blocked','todo'].map(s => {
                    const n = features.filter(f => f.status === s).length;
                    if (!n) return '';
                    return `<div class="mc-tt-row"><span><span style="color:${_stC[s]}">${_stI[s]}</span> ${_stL[s]}</span><strong>${n}</strong></div>`;
                }).join('')}
            </div>
            <div class="mc-tt" id="mc-tt-epics">
                <div class="mc-tt-head">🏗️ Epics · détail</div>
                ${['done','inprog','blocked','todo'].map(s => {
                    const n = piEpics.filter(e => e.status === s).length;
                    if (!n) return '';
                    return `<div class="mc-tt-row"><span><span style="color:${_stC[s]}">${_stI[s]}</span> ${_stL[s]}</span><strong>${n}</strong></div>`;
                }).join('')}
                ${piEpics.length === 0 ? '<div class="mc-tt-empty">Aucun epic</div>' : ''}
            </div>
            <div class="mc-tt" id="mc-tt-obj">
                <div class="mc-tt-head">🎯 Objectifs · détail</div>
                ${objectivesFiltered.length ? objectivesFiltered.map(o => `
                <div class="mc-tt-row">
                    <span><span style="color:${o.status === 'done' ? 'var(--success)' : 'var(--text-muted)'}">${o.status === 'done' ? '✓' : '○'}</span> ${esc(o.text || '—')}</span>
                    <strong style="color:${o.bv ? 'var(--warning)' : 'var(--text-muted)'}">${o.bv ? o.bv + ' BV' : '—'}</strong>
                </div>`).join('') : '<div class="mc-tt-empty">Aucun objectif</div>'}
            </div>
            <div class="mc-tt" id="mc-tt-blocked">
                <div class="mc-tt-head">🚫 Tickets bloqués</div>
                ${blockedTickets.length ? blockedTickets.slice(0, 8).map(t => `
                <div class="mc-tt-row mc-tt-ticket-row" data-ticket-id="${esc(t.id)}">
                    <span>
                        ${jiraUrl
                            ? `<a class="mc-tt-jira" href="${esc(jiraUrl)}/browse/${esc(t.id)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(t.id)}</a>`
                            : `<span class="mc-tt-key">${esc(t.id)}</span>`}
                        ${esc(t.title)}
                    </span>
                    <strong>${t.points ? `${t.points} <span class="mc-tt-pts-unit">pts</span>` : '—'}</strong>
                </div>`).join('') : '<div class="mc-tt-empty">Aucun ticket bloqué 🎉</div>'}
                ${blockedTickets.length > 8 ? `<div class="mc-tt-row" style="color:var(--text-muted);font-size:10px">… et ${blockedTickets.length - 8} autres</div>` : ''}
            </div>
            <div class="mc-tt" id="mc-tt-vel">
                <div class="mc-tt-head">⚡ Vélocité · détail</div>
                <div class="mc-tt-row mc-tt-row--total">
                    <span>Planifié</span><strong>${velPts} pts · ${nonBufTickets.length} tickets</strong>
                </div>
                ${velRows.map(r => `
                <div class="mc-tt-row">
                    <span><span style="color:${_stC[r.s]}">${_stI[r.s]}</span> ${_stL[r.s]}</span>
                    <strong>${r.pts} pts<span class="mc-tt-count"> · ${r.count}</span></strong>
                </div>`).join('')}
                <div class="mc-tt-bar-wrap">
                    <div class="mc-tt-bar-fill" style="width:${velRatio}%"></div>
                </div>
                <div class="mc-tt-pct">${velDonePts} pts réalisés sur ${velPts} · <strong>${velRatio}%</strong></div>
            </div>
            <div class="mc-tt" id="mc-tt-buf">
                <div class="mc-tt-head">🔄 Buffer · détail</div>
                ${bufTickets.length ? bufTickets.map(t => `
                <div class="mc-tt-row mc-tt-ticket-row" data-ticket-id="${esc(t.id)}" title="Voir le détail">
                    <span>
                        <span style="color:${_stC[t.status] || _stC.todo}">${_stI[t.status] || '○'}</span>
                        ${jiraUrl
                            ? `<a class="mc-tt-jira" href="${esc(jiraUrl)}/browse/${esc(t.id)}" target="_blank" rel="noopener" title="Ouvrir dans JIRA" onclick="event.stopPropagation()">${esc(t.id)}</a>`
                            : `<span class="mc-tt-key">${esc(t.id)}</span>`}
                        ${esc(t.title)}
                    </span>
                    <strong>${t.points ? `${t.points} <span class="mc-tt-pts-unit">pts</span>` : '<span style="color:var(--text-muted)">—</span>'}</strong>
                </div>`).join('') : '<div class="mc-tt-empty">Aucun ticket buffer</div>'}
                ${bufTickets.length ? `
                <div class="mc-tt-bar-wrap">
                    <div class="mc-tt-bar-fill" style="width:${bufRatio}%"></div>
                </div>
                <div class="mc-tt-pct">${bufDonePts} pts réalisés sur ${bufPts} · <strong>${bufRatio}%</strong></div>` : ''}
            </div>
        </div>

        <!-- Tabs -->
        <div class="tabs" id="pi-tabs">
            ${tabs.map(t => `<button class="tab${t.id === _activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>

        <!-- Mini-heatmap capacité par équipe (#2) -->
        ${(() => {
            const heatItems = [...teams].sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' })).map(t => {
                const cap = capByTeam[t] || {};
                const tc  = teamCap.find(x => x.name === t);
                const spNet = cap.spNet || 0;
                const spPlan = tc?.pts || 0;
                const tObj = teamObjects.find(o => o.name === t);
                const col = tObj?.color || '#64748b';
                let dot = 'var(--success)';
                if (spNet > 0) {
                    const ratio = spPlan / spNet;
                    dot = ratio > 1 ? 'var(--danger)' : ratio > 0.8 ? 'var(--warning)' : 'var(--success)';
                } else if (tc?.memberCount === 0) {
                    dot = 'var(--border)';
                }
                const _capTxt = spNet > 0
                    ? `${spPlan} SP planifiés / ${spNet} SP nets (${Math.round(spPlan / spNet * 100)}%)`
                    : `capacité non configurée`;
                const tip = `${esc(t)} — ${_capTxt}\nCliquer pour filtrer sur cette équipe`;
                const isActive = store.get('team') === t;
                return `<button class="pi-cap-dot${isActive ? ' pi-cap-dot--active' : ''}" data-team="${esc(t)}" style="--tc:${col};--dot:${dot}" title="${tip}">
                    <span class="pi-cap-dot-dot" style="background:${dot}"></span>
                    <span class="pi-cap-dot-name">${esc(t)}</span>
                    ${spNet > 0 ? `<span class="pi-cap-dot-val">${spPlan}/${spNet}</span>` : ''}
                </button>`;
            }).join('');
            return heatItems ? `<div class="pi-cap-strip" id="pi-cap-strip">${heatItems}</div>` : '';
        })()}

        <!-- Tab content -->
        <div id="pi-tab-content"></div>
    `;

    // Metric card tooltips sticky (cursor peut entrer dans la tooltip)
    container.querySelectorAll('.mc-has-tooltip').forEach(card => {
        const tt = document.getElementById(card.dataset.mcTt);
        if (!tt) return;
        let hide;
        const show = () => {
            clearTimeout(hide);
            const r = card.getBoundingClientRect();
            const w = 280;
            const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
            const below = r.bottom + 8 + 320 < window.innerHeight;
            tt.style.left = `${left}px`;
            tt.style.top  = below ? `${r.bottom + 6}px` : `${r.top - 6}px`;
            tt.style.transform = below ? 'translateY(0)' : 'translateY(-100%)';
            tt.classList.add('mc-tt--on');
        };
        const startHide = () => { hide = setTimeout(() => tt.classList.remove('mc-tt--on'), 200); };
        card.addEventListener('mouseenter', show);
        card.addEventListener('mouseleave', startHide);
        tt.addEventListener('mouseenter', () => clearTimeout(hide));
        tt.addEventListener('mouseleave', startHide);
    });

    // Lignes de tickets dans le tooltip Buffer → ouvre le modal au clic
    container.querySelectorAll('.mc-tt-ticket-row').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('a')) return;
            window.__squadBoard?.openTicketModal?.(row.dataset.ticketId);
        });
    });

    // Tab switching
    const _tabData = { objectives, featureList, teamCap, tickets, flowTickets, teams, teamObjects, piInfo, absences, epics: piEpics, isCurrentPi, piNum, capByTeam, _computeCapByTeam, depItems };
    function _switchTab(id) {
        if (!tabs.find(t => t.id === id)) return;
        _activeTab = id;
        store.set('piTab', _activeTab);
        window.__squadBoard?.pushHash?.();
        container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _activeTab));
        // piInfo a pu changer depuis le rendu de la vue (enregistrement des objectifs) : on
        // relit le store, sinon revenir sur l'onglet réaffiche l'état figé au premier rendu.
        _tabData.piInfo = store.get('piInfo') || _tabData.piInfo;
        _tabData.objectives = isCurrentPi ? (_tabData.piInfo?.objectives || []) : [];
        renderTabContent(container.querySelector('#pi-tab-content'), _activeTab, _tabData);
    }

    container.querySelector('#pi-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('.tab');
        if (btn) _switchTab(btn.dataset.tab);
    });

    // Mini-heatmap : clic sur une pastille équipe → filtre l'équipe SANS changer d'onglet.
    // (store.set('team') déclenche un re-render complet de la vue sur l'onglet courant.)
    container.querySelector('#pi-cap-strip')?.addEventListener('click', e => {
        const btn = e.target.closest('.pi-cap-dot');
        if (!btn) return;
        const teamName = btn.dataset.team;
        if (!teamName) return;
        // Re-clic sur l'équipe déjà active → on revient à « toutes les équipes » (toggle).
        store.set('team', store.get('team') === teamName ? 'all' : teamName);
    });

    // Raccourcis clavier 1-9 → onglets (désactivés si focus sur un champ)
    if (!container._piKbCleanup) {
        const _piKbHandler = e => {
            if (!container.isConnected) { document.removeEventListener('keydown', _piKbHandler); return; }
            if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const idx = parseInt(e.key, 10);
            if (idx >= 1 && idx <= 9) {
                const t = tabs[idx - 1];
                if (t) { e.preventDefault(); _switchTab(t.id); }
            }
        };
        document.addEventListener('keydown', _piKbHandler);
        container._piKbCleanup = () => document.removeEventListener('keydown', _piKbHandler);
        // Nettoyage à la navigation hors de la vue (unsub utilise la valeur retournée par store.on)
        let _kbViewUnsub;
        const _kbViewCb = () => { container._piKbCleanup?.(); container._piKbCleanup = null; _kbViewUnsub?.(); };
        _kbViewUnsub = store.on('view', _kbViewCb);
    }

    renderTabContent(container.querySelector('#pi-tab-content'), _activeTab, _tabData);

    // Mode présentation PI plein écran (#10)
    container.querySelector('#pi-present-btn')?.addEventListener('click', () => {
        const fsEl = document.fullscreenElement;
        if (fsEl) {
            document.exitFullscreen?.();
        } else if (container.requestFullscreen) {
            container.classList.add('pi--present');
            container.requestFullscreen().catch(() => container.classList.toggle('pi--present-fallback'));
        } else {
            container.classList.toggle('pi--present-fallback');
        }
    });
    if (!document._piPresentFsBound) {
        document._piPresentFsBound = true;
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.querySelectorAll('.pi--present').forEach(el => el.classList.remove('pi--present'));
            }
        });
    }
}

// ── Dépendances tab (programme board inter-équipes #14) ─────────────────────────
function renderDeps(el, { depItems = [], teamObjects = [] }) {
    el.innerHTML = `
        <div class="pi-card">
            <div class="pi-card-head">
                <span class="pi-card-ico" aria-hidden="true">🔗</span>
                <div class="pi-card-title"><b>Dépendances inter-équipes</b>
                    <small>Liens JIRA « bloque / est bloqué par / dépend de » sur le périmètre du PI — ligne = l'équipe qui dépend, colonne = celle dont elle dépend</small></div>
            </div>
            <div class="pi-card-body">${renderTeamDepBoard(depItems, teamObjects)}</div>
        </div>`;
    bindTeamDepBoard(el, depItems);
}

// ── Onglet Indicateurs : métriques de flux du PI (Lead/Cycle time, Temps par colonne, Aging WIP) ──
/**
 * « 🌊 Flux cumulé » de l'onglet Indicateurs (`pi_stage_flow.js`) : UNE carte, la ligne produit de l'équipe filtrée
 * (groupe de Paramètres, une ligne par équipe, détail par epic ouvert sur l'équipe) ; sans équipe, le groupe du
 * topbar ou tout le train. La carte de l'équipe seule ne sert plus que si elle n'a pas de ligne produit (3.226.0 :
 * la ligne produit montre tout, la carte équipe faisait doublon).
 */
function _piFlowCards(piNum) {
    const cards = new Map();
    if (!piNum) return { html: '', cards, draw() {} };
    const team = store.get('team'), groupId = store.get('group');
    const groups = store.get('groups') || [], all = store.get('tickets') || [];
    const sprintInfo = store.get('sprintInfo'), piInfo = store.get('piInfo');
    const unit = piFlowUnit();
    const isBuffer = bufferTest(store.get('features') || []);
    const line = lineProductScope({ team, groupId, groups, tickets: all, teams: store.get('teams') || [] });
    // Titre d'epic : `t.epic` porte l'id de la FEATURE parente (repli : epic du store).
    const titles = new Map([...(store.get('epics') || []), ...(store.get('features') || [])].map(x => [x.id, x.title]));
    const epicTitle = id => titles.get(id) || id;
    const isTeam = team && team !== 'all';
    const fromLine = l => ({ id: l.group ? 'group' : 'all', title: l.title, prefix: l.prefix, boundsTeam: 'all', tickets: l.tickets, teams: l.teams,
        epics: { teams: l.teams, team: isTeam && l.teams.includes(team) ? team : '', epicTitle, jiraUrl: store.get('jiraUrl') || '' } });
    const specs = [];
    if (isTeam && !line) {
        specs.push({ id: 'team', title: team, prefix: '', boundsTeam: team, tickets: all.filter(t => t.team === team), teams: [],
            epics: { teams: [], team: '', epicTitle, jiraUrl: store.get('jiraUrl') || '' },
            note: `${esc(team)} n'est rattachée à aucune ligne produit : <a href="#settings">Paramètres → Lignes produit / Groupes</a>.` });
    } else {
        specs.push(fromLine(line));
    }
    for (const sp of specs) {
        const bounds = piBounds({ team: sp.boundsTeam, sprintInfo, piInfo, piNum });
        const m = piStageFlowModel({ tickets: sp.tickets, piNum, bounds, unit, teams: sp.teams, isBuffer });
        // Puces du détail par epic : les seules équipes qui ont des tickets dans le PI.
        if (m && sp.epics.teams.length) sp.epics.teams = m.rows.filter(r => r.n).map(r => r.label);
        cards.set(sp.id, { ...sp, m });
    }
    const wide = cards.size === 1 ? ' psf--wide' : '';
    return {
        cards,
        html: [...cards.values()].map(c => piFlowCardHtml(c.m, c).replace('class="card psf"', `class="card psf${wide}"`)).join(''),
        // `ctl` = contrôleur de `bindPiFlowCards` : un clic sur une bande / un segment déplie la liste.
        draw(ctl) {
            for (const c of cards.values()) {
                if (!c.m?.shownN) continue;
                renderPiFlow(`psf-chart-${c.id}`, c.m, `Flux cumulé — ${c.title}`,
                    { view: piFlowView(), pct: piFlowPct(), isLate: piFlowLate, barLabel: c.title, onPick: sel => ctl.pick(c.id, sel) });
            }
        },
    };
}

function renderIndicators(el, data) {
    const { tickets = [], flowTickets = null, piNum = 0 } = data;
    const _pf = _piFlowCards(piNum);
    // Toutes les mesures de DURÉE de cet onglet partagent `flowTickets` (`belongedToPi`, retirés compris) :
    // `tickets` écarte les retirés et les « Clos sans suite », qui ont pourtant passé du temps en colonne.
    const _flow = flowTickets || tickets;
    // Lead time & Cycle time — même calcul et rendu que la card du Dashboard (schéma + graphe).
    const _doneCT = _flow.filter(t => t.status === 'done' && cycleDays(t) > 0);
    const _ltVals = _doneCT.map(t => leadDays(t) > 0 ? leadDays(t) : cycleDays(t));
    const avgCT = _doneCT.length ? Math.round(_doneCT.reduce((s, t) => s + cycleDays(t), 0) / _doneCT.length * 10) / 10 : 0;
    const avgLT = _ltVals.length ? Math.round(_ltVals.reduce((s, v) => s + v, 0) / _ltVals.length * 10) / 10 : 0;
    const avgWait = Math.max(0, Math.round((avgLT - avgCT) * 10) / 10);
    const flowEff = avgLT > 0 ? Math.round((avgCT / avgLT) * 100) : null;
    const _ctVals = _doneCT.map(t => cycleDays(t));
    const p50CT = _ctVals.length ? percentile(_ctVals, 50) : 0, p85CT = _ctVals.length ? percentile(_ctVals, 85) : 0;
    const f1 = n => String(Math.round(n * 10) / 10).replace('.', ',');
    const effTone = flowEff == null ? '' : flowEff >= 40 ? 'is-good' : flowEff >= 25 ? 'is-ok' : 'is-low';
    // Frise PROPORTIONNELLE (attente | cycle) : l'ancien schéma donnait la même largeur à 48 j d'attente
    // et 8 j de cycle — le déséquilibre, qui est le message, ne se voyait pas.
    const waitPct = avgLT > 0 ? Math.max(6, Math.min(94, (avgWait / avgLT) * 100)) : 50;

    el.innerHTML = `
        <div class="pi-card pi-card--flat">
            <div class="pi-card-head">
                <span class="pi-card-ico" aria-hidden="true">📊</span>
                <div class="pi-card-title"><b>Indicateurs de flux</b>
                    <small>Flux cumulé par état JIRA (équipe et ligne produit), Lead / Cycle time, temps par colonne et âge du WIP — ${piNum ? `périmètre engagé du PI #${piNum} (reports compris)` : 'historique de l\'équipe'} · jours ouvrés</small></div>
            </div>
        </div>
        <div class="pi-indicators">
            ${_pf.html}
            <div class="card pi-lct">
                <div class="card-header">
                    <span class="card-title">⏱ Lead time &amp; Cycle time ${helpIconHtml({ key: 'lct', label: 'Comprendre lead time vs cycle time' })}</span>
                    <span class="card-subtitle">${_doneCT.length} ticket${_doneCT.length !== 1 ? 's' : ''} terminé${_doneCT.length !== 1 ? 's' : ''} sur le PI</span>
                </div>
                ${_doneCT.length ? `
                <div class="pi-lct-kpis">
                    <div class="pi-lct-kpi"><span class="pi-lct-kpi-lbl">📥 Lead time moyen</span><span class="pi-lct-kpi-val">${f1(avgLT)}<small> j</small></span><span class="pi-lct-kpi-sub">de la création à la livraison</span></div>
                    <div class="pi-lct-kpi pi-lct-kpi--cycle"><span class="pi-lct-kpi-lbl">🛠 Cycle time</span><span class="pi-lct-kpi-val">${f1(avgCT)}<small> j</small></span><span class="pi-lct-kpi-sub">médiane ${f1(p50CT)} j · P85 ${f1(p85CT)} j</span></div>
                    <div class="pi-lct-kpi pi-lct-kpi--wait"><span class="pi-lct-kpi-lbl">⏸ Attente moyenne</span><span class="pi-lct-kpi-val">${f1(avgWait)}<small> j</small></span><span class="pi-lct-kpi-sub">avant d'être démarré</span></div>
                    ${flowEff != null ? `<div class="pi-lct-kpi pi-lct-kpi--eff ${effTone}" title="Flow efficiency = cycle time ÷ lead time : part du lead time passée à travailler le ticket (le reste = attente en file). Repère : ~15 % courant, 40 % et plus = bon.">
                        <span class="pi-lct-kpi-lbl">⚡ Flow efficiency</span><span class="pi-lct-kpi-val">${flowEff}<small> %</small></span>
                        <span class="pi-lct-gauge"><i style="width:${Math.min(100, flowEff)}%"></i><b style="left:40%" title="Repère 40 %"></b></span></div>` : ''}
                </div>
                <div class="pi-lct-track" aria-label="Lead time moyen ${f1(avgLT)} jours : ${f1(avgWait)} d'attente puis ${f1(avgCT)} de cycle">
                    <div class="pi-lct-ends"><span>📥 Créé</span><span>▶️ Démarré</span><span>✅ Livré</span></div>
                    <div class="pi-lct-bar">
                        <span class="pi-lct-seg pi-lct-seg--wait" style="flex-basis:${waitPct}%">⏸ Attente ${f1(avgWait)} j</span>
                        <span class="pi-lct-seg pi-lct-seg--cycle" style="flex-basis:${100 - waitPct}%">🛠 ${f1(avgCT)} j</span>
                    </div>
                    <div class="pi-lct-lead">⟵ Lead time moyen <b>${f1(avgLT)} j</b> ⟶</div>
                </div>` : `<p class="pi-lct-empty">Aucun ticket terminé avec des dates de cycle sur ce périmètre.</p>`}
                <div class="chart-container pi-lct-chart"><canvas id="pi-chart-cycletime"></canvas></div>
            </div>
            ${stageFlowCardHtml(_flow, { scopeLabel: piNum ? `PI #${piNum} · périmètre engagé` : 'historique équipe' })}
            ${agingWipCardHtml(_flow)}
        </div>`;

    const _pfCtl = bindPiFlowCards(el, _pf.cards, () => renderIndicators(el, data));
    requestAnimationFrame(() => { renderCycleTime('pi-chart-cycletime', _flow); _pf.draw(_pfCtl); });
    bindStageFlowCard(el, _flow, { scopeLabel: piNum ? `PI #${piNum} · périmètre engagé` : 'historique équipe' });
    bindAgingWipCard(el);
}

function renderTabContent(el, tab, data) {
    switch (tab) {
        case 'objectives': return renderObjectives(el, data);
        case 'indicators': return renderIndicators(el, data);
        case 'features': return renderFeatures(el, data);
        case 'capacity': return renderCapacity(el, data);
        case 'burnup': return renderBurnup(el, data);
        case 'teams': return renderTeams(el, data);
        case 'support': return renderSupportRota(el, data);
        case 'deps': return renderDeps(el, data);
        case 'mood': return renderMood(el, data);
        case 'fist': return renderFist(el, data);
        case 'calendar': return renderPICalendar(el);
    }
}
