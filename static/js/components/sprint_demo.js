/**
 * 🎬 Mode Démo plein écran d'un sprint (présentation TV pour la Sprint Review) : réalisations défilantes, chiffres clés.
 *
 * Extrait de sprint_tickets_modal.js (3.254.0) — code déplacé à l'identique. Dépendances CIRCULAIRES vers sprint_tickets_modal.js
 * assumées : jamais utilisées au niveau racine du module (seulement dans des fonctions / écouteurs).
 */
import { store } from '../state.js';
import { esc, pct, sumBy, ticketModalOnTop, isInSprint } from '../utils.js';
import { renderBurnup } from './charts.js';
import { _sprintStats, _typeIcon } from './sprint_tickets_modal.js';
import { _demoStageFlowHtml } from './sprint_reports.js';

// ── Mode Demo fullscreen — présentation TV pour Sprint Review ─────────────
// Affiche en plein écran les wins du sprint en gros pour une démo en salle.
// Auto-scroll des tickets, navigation flèches, ESC pour quitter.
export function openDemoMode(sprint, tickets) {
    const existing = document.getElementById('demo-mode-overlay');
    if (existing) existing.remove();

    const total = tickets.length;
    const doneTickets = tickets.filter(t => t.status === 'done')
        .sort((a, b) => (b.points || 0) - (a.points || 0));
    const ptsDone = sumBy(doneTickets, t => t.points);
    const ptsTotal = sumBy(tickets, t => t.points);
    const { veloPts, engagePct } = _sprintStats(sprint, tickets);
    const realisedPct = engagePct != null ? engagePct : pct(ptsDone, ptsTotal);
    const stateLabel = sprint.isCurrent ? 'En cours' : 'Clôturé';

    // PI Objectives — filtrés par équipe si sprint.team défini, sinon tous
    const piInfo = store.get('piInfo');
    const piObjs = (piInfo?.objectives || [])
        .filter(o => (o.text || '').trim())
        .filter(o => !sprint.team || sprint.team === 'all' || !o.team || o.team === sprint.team);
    const _bv = o => Math.max(0, Math.min(10, parseInt(o.bv) || 0));
    const commitObjs   = piObjs.filter(o => o.committed);
    const stretchObjs  = piObjs.filter(o => !o.committed);
    const commitTotal  = sumBy(commitObjs, _bv);
    const commitDone   = sumBy(commitObjs.filter(o => o.status === 'done'), _bv);
    const stretchDone  = sumBy(stretchObjs.filter(o => o.status === 'done'), _bv);
    const piScore      = commitTotal > 0 ? Math.round(((commitDone + stretchDone) / commitTotal) * 100) : null;

    // Sous-totaux Buffer / Retro pour les badges du header Réalisations
    const _hasLbl = (t, rx) => (t.labels || []).some(l => rx.test(l));
    const bufferTicketsDemo = tickets.filter(t => _hasLbl(t, /^Buffer$/i));
    const doneBufferDemo    = bufferTicketsDemo.filter(t => t.status === 'done');
    const bufferPtsTotalDemo = sumBy(bufferTicketsDemo, t => t.points);
    const bufferPtsDoneDemo  = sumBy(doneBufferDemo, t => t.points);
    const doneActionRetroDemo = doneTickets.filter(t => _hasLbl(t, /^ActionRetro$/i));

    // Mood + Fist of Five (filtrés par sprint + équipe) — match tolérant sur piSprint
    const _sprintLabelDemo = (String(sprint.name || '').match(/(\d+\.\d+)/) || [])[1] || '';
    const _matchDemoVoteSprint = (vps) => {
        if (!vps) return false;
        if (vps === sprint.name) return true;
        if (_sprintLabelDemo && (vps === _sprintLabelDemo || vps.includes(_sprintLabelDemo))) return true;
        return sprint.name && (vps.includes(sprint.name) || sprint.name.includes(vps));
    };
    const _voteFilterDemo = (v) => (!sprint.team || sprint.team === 'all' || v.team === sprint.team)
                                && _matchDemoVoteSprint(v.piSprint);
    const _voteStatsDemo = (arr) => {
        if (!arr.length) return null;
        const dist = [0, 0, 0, 0, 0, 0];
        let sum = 0;
        for (const v of arr) {
            const n = parseInt(v.value) || 0;
            if (n >= 1 && n <= 5) { dist[n]++; sum += n; }
        }
        return { avg: Math.round((sum / arr.length) * 10) / 10, count: arr.length, dist };
    };
    const moodStatsDemo = _voteStatsDemo((store.get('moodVotes') || []).filter(_voteFilterDemo));
    const fistStatsDemo = _voteStatsDemo((store.get('fistVotes') || []).filter(_voteFilterDemo));
    const _voteFaceDemo = (n) => ({ 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }[Math.round(n)] || '❓');
    const _voteColorDemo = (n) => n >= 4 ? '#10b981' : n >= 3 ? '#f59e0b' : '#ef4444';

    // Events du sprint (faits marquants) pour annoter le burnup
    const allEvents = store.get('events') || [];
    const sStart = sprint.startDate ? new Date(sprint.startDate).getTime() : null;
    const sEnd   = sprint.endDate ? new Date(sprint.endDate).getTime() : null;
    const sprintEvents = (sStart && sEnd)
        ? allEvents.filter(e => {
            const t = e.startDate ? new Date(e.startDate).getTime() : null;
            return t && t >= sStart && t <= sEnd;
          })
        : [];

    const overlay = document.createElement('div');
    overlay.id = 'demo-mode-overlay';
    overlay.className = 'demo-mode-overlay';
    overlay.innerHTML = `
        <button class="demo-mode-close" title="Quitter (Esc)" aria-label="Fermer">✕</button>
        <div class="demo-mode-content">
            <div class="demo-mode-bg"></div>
            <header class="demo-hdr">
                <div class="demo-hdr-left">
                    <div class="demo-state">${esc(stateLabel)}</div>
                    <h1 class="demo-title">${esc(sprint.name)}</h1>
                    ${sprint.team ? `<div class="demo-team">👥 ${esc(sprint.team)}</div>` : ''}
                </div>
                ${(sprint.goal || moodStatsDemo) ? `
                <div class="demo-goal-card" title="Sprint Goal">
                    ${sprint.goal ? `
                    <div class="demo-goal-card-label">🎯 Sprint Goal</div>
                    <div class="demo-goal-card-text">${esc(sprint.goal)}</div>
                    ` : '<div class="demo-goal-card-label demo-goal-card-label--empty">Aucun objectif explicite</div>'}
                    ${moodStatsDemo ? `
                    <div class="demo-mood-inline" title="Mood Meter — ${moodStatsDemo.count} vote${moodStatsDemo.count > 1 ? 's' : ''}">
                        <span class="demo-mood-inline-icon">🎭</span>
                        <span class="demo-mood-inline-face">${_voteFaceDemo(moodStatsDemo.avg)}</span>
                        <span class="demo-mood-inline-val" style="color:${_voteColorDemo(moodStatsDemo.avg)}">${moodStatsDemo.avg}<small>/5</small></span>
                        <span class="demo-mood-inline-bars">${(() => {
                            const maxC = Math.max(...[1,2,3,4,5].map(n => moodStatsDemo.dist[n]), 1);
                            return [1,2,3,4,5].map(n => {
                                const c = moodStatsDemo.dist[n];
                                const h = Math.max(15, Math.round((c / maxC) * 100));
                                return `<span class="demo-mood-inline-bar" style="height:${h}%;background:${_voteColorDemo(n)}" title="${_voteFaceDemo(n)} ${n}/5 : ${c}"></span>`;
                            }).join('');
                        })()}</span>
                        <span class="demo-mood-inline-count">${moodStatsDemo.count}</span>
                    </div>` : ''}
                </div>` : ''}
            </header>

            <div class="demo-stats">
                <div class="demo-stat demo-stat--big">
                    <div class="demo-stat-val">${veloPts}</div>
                    <div class="demo-stat-lbl">Story Points livrés</div>
                </div>
                <div class="demo-stat">
                    <div class="demo-stat-val">${doneTickets.length}<span class="demo-stat-sub">/${total || '—'}</span></div>
                    <div class="demo-stat-lbl">Tickets terminés</div>
                </div>
                ${sprint.estimated ? `
                <div class="demo-stat">
                    <div class="demo-stat-val">${realisedPct}%</div>
                    <div class="demo-stat-lbl">de l'engagement</div>
                </div>` : ''}
                ${bufferTicketsDemo.length ? `
                <div class="demo-stat demo-stat--buffer" title="Tickets portant le label Buffer — capacité réservée. ${doneBufferDemo.length}/${bufferTicketsDemo.length} terminés, ${bufferPtsDoneDemo}/${bufferPtsTotalDemo} pts livrés.">
                    <div class="demo-stat-val">${doneBufferDemo.length}<span class="demo-stat-sub">/${bufferTicketsDemo.length}</span></div>
                    <div class="demo-stat-lbl">🛡️ Buffer · ${bufferPtsDoneDemo}/${bufferPtsTotalDemo} pts</div>
                </div>` : ''}
                ${piScore > 0 ? `
                <div class="demo-stat demo-stat--pi">
                    <div class="demo-stat-val">${piScore}%</div>
                    <div class="demo-stat-lbl">PI Predictabilité</div>
                </div>` : ''}
            </div>

            ${piObjs.length ? `
            <section class="demo-pi-objectives">
                <h2>🎯 PI Objectives ${piInfo?.number ? `<small>PI ${piInfo.number}</small>` : ''}
                    <small class="demo-pi-summary">
                        ✓ ${piObjs.filter(o => o.status === 'done').length}/${piObjs.length}
                        ${commitTotal > 0 ? ` · BV livrée ${commitDone + stretchDone}/${commitTotal}` : ''}
                    </small>
                    ${fistStatsDemo ? `
                    <span class="demo-fist-inline" title="Fist of Five — confiance PI · ${fistStatsDemo.count} vote${fistStatsDemo.count > 1 ? 's' : ''}">
                        <span class="demo-fist-inline-icon">✊</span>
                        <span class="demo-fist-inline-val" style="color:${_voteColorDemo(fistStatsDemo.avg)}">${fistStatsDemo.avg}<small>/5</small></span>
                        <span class="demo-fist-inline-bars">${(() => {
                            const maxC = Math.max(...[1,2,3,4,5].map(n => fistStatsDemo.dist[n]), 1);
                            return [1,2,3,4,5].map(n => {
                                const c = fistStatsDemo.dist[n];
                                const h = Math.max(15, Math.round((c / maxC) * 100));
                                const lbl = ['', 'Pas confiance', 'Inquiet', 'Mitigé', 'Confiant', 'Très confiant'][n];
                                return `<span class="demo-fist-inline-bar" style="height:${h}%;background:${_voteColorDemo(n)}" title="${n}/5 (${lbl}) : ${c}"></span>`;
                            }).join('');
                        })()}</span>
                        <span class="demo-fist-inline-count">${fistStatsDemo.count}</span>
                    </span>` : ''}
                </h2>
                <div class="demo-pi-grid">
                    ${piObjs.slice(0, 8).map(o => {
                        const stCls = o.status === 'done' ? 'is-done' : o.status === 'blocked' ? 'is-blocked' : o.status === 'inprog' ? 'is-inprog' : 'is-todo';
                        const stIcon = o.status === 'done' ? '✓' : o.status === 'blocked' ? '✗' : o.status === 'inprog' ? '●' : '○';
                        return `<div class="demo-pi-obj ${stCls}${o.committed ? ' is-commit' : ' is-stretch'}">
                            ${o.status === 'done' ? '<span class="demo-pi-obj-shine" aria-hidden="true"></span>' : ''}
                            <span class="demo-pi-obj-state" aria-hidden="true">${stIcon}</span>
                            <span class="demo-pi-obj-text">${esc(o.text || '').slice(0, 80)}${(o.text || '').length > 80 ? '…' : ''}</span>
                            <span class="demo-pi-obj-bv" title="Business Value">${_bv(o)}</span>
                        </div>`;
                    }).join('')}
                </div>
            </section>` : ''}

            <div class="demo-2col">
                <section class="demo-burnup">
                    <h2>📈 Burnup ${sprintEvents.length ? `<small class="demo-burnup-hint">${sprintEvents.length} fait${sprintEvents.length > 1 ? 's' : ''} marquant${sprintEvents.length > 1 ? 's' : ''}</small>` : ''}</h2>
                    <div class="demo-burnup-chart"><canvas id="demo-burnup-canvas"></canvas></div>
                    ${(() => {
                        // Mini velocity-card du PI (inspirée du dashboard `velocity-card`, adaptée dark).
                        // Le dernier sprint du PI = sprint de respiration 🍃 (IP sprint SAFe).
                        const allSprints = Array.isArray(store.get('sprintInfo')?.teamSprints) ? store.get('sprintInfo').teamSprints : [];
                        if (!allSprints.length) return '';
                        const _extractPi = (name) => {
                            if (!name) return 0;
                            const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
                            return m ? parseInt(m[1], 10) : 0;
                        };
                        const _extractIdx = (name) => {
                            const m = String(name || '').match(/\d+\.(\d+)/);
                            return m ? parseInt(m[1], 10) : 0;
                        };
                        const refPi = _extractPi(sprint.name);
                        if (!refPi) return '';
                        let piSprints = allSprints.filter(s => _extractPi(s.name) === refPi);
                        if (sprint.team && sprint.team !== 'all') {
                            piSprints = piSprints.filter(s => s.team === sprint.team);
                        } else {
                            const seen = new Map();
                            for (const s of piSprints) {
                                const k = (s.name || '').toLowerCase();
                                if (!seen.has(k) || s.state === 'active') seen.set(k, s);
                            }
                            piSprints = [...seen.values()];
                        }
                        if (!piSprints.length) return '';
                        piSprints.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
                        // Vélocité LIVE pour sprints actifs (JIRA Greenhopper ne renseigne velocity qu'à la clôture).
                        // Pour chaque sprint sans vélocité, on calcule depuis les tickets locaux `status==='done'`.
                        const allTickets = store.get('tickets') || [];
                        piSprints = piSprints.map(s => {
                            if (s.velocity && s.velocity > 0) return s;   // déjà fourni par JIRA → on garde
                            const liveDone = allTickets
                                // Vélocité = RÉALISÉ : uniquement les tickets restés dans le
                                // sprint. Un reporté terminé ailleurs créditerait ce sprint de
                                // travail fait après sa clôture (voir utils/sprint-scope.js).
                                .filter(t => isInSprint(t, s.name, null)
                                          && t.status === 'done'
                                          && (!s.team || t.team === s.team))
                                .reduce((sum, t) => sum + (t.points || 0), 0);
                            return liveDone > 0 ? { ...s, velocity: liveDone, _live: true } : s;
                        });
                        // Identification du sprint de respiration : le dernier du PI (idx max OU dernier chronologique).
                        const sprintsPerPi = store.get('piInfo')?.sprintsPerPI || piSprints.length;
                        const lastIdx = Math.max(sprintsPerPi, ...piSprints.map(s => _extractIdx(s.name)));
                        // Stats sur sprints CLOS uniquement (exclut current et future)
                        const closed = piSprints.filter(s => s.state === 'closed');
                        const vals = closed.map(s => s.velocity || 0);
                        const totalDone   = vals.reduce((a, b) => a + b, 0);
                        const avgClosed   = vals.length ? Math.round(totalDone / vals.length) : 0;
                        const bestSprint  = closed.length ? closed.reduce((a, b) => (a.velocity || 0) > (b.velocity || 0) ? a : b) : null;
                        const best        = bestSprint?.velocity || 0;
                        const target      = store.get('piInfo')?.velocityTarget || null;
                        const targetPct   = target && vals.length ? Math.round((avgClosed / target) * 100) : null;
                        const targetCls   = targetPct == null ? '' : targetPct >= 100 ? 'demo-vel-kpi--good' : targetPct >= 80 ? 'demo-vel-kpi--ok' : 'demo-vel-kpi--warn';
                        // Tendance : moyenne 3 derniers vs 3 précédents
                        const last3 = vals.slice(-3);
                        const prev3 = vals.slice(-6, -3);
                        const last3Avg = last3.length ? Math.round(last3.reduce((a, b) => a + b, 0) / last3.length) : 0;
                        const prev3Avg = prev3.length ? Math.round(prev3.reduce((a, b) => a + b, 0) / prev3.length) : null;
                        const trend = (prev3Avg && prev3Avg > 0) ? Math.round(((last3Avg - prev3Avg) / prev3Avg) * 100) : null;
                        // Stabilité (coefficient de variation)
                        const stdDev = vals.length ? Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - avgClosed, 2), 0) / vals.length) : 0;
                        const cv = avgClosed > 0 ? Math.round((stdDev / avgClosed) * 100) : 0;
                        const cvLabel = cv < 15 ? 'Très stable' : cv < 30 ? 'Stable' : cv < 50 ? 'Variable' : 'Instable';
                        const cvCls = cv < 15 ? 'demo-vel-kpi--good' : cv < 30 ? 'demo-vel-kpi--ok' : cv < 50 ? 'demo-vel-kpi--warn' : 'demo-vel-kpi--danger';
                        const sparkMax = Math.max(...piSprints.map(s => s.velocity || 0), target || 0, 1);
                        const bars = piSprints.map(s => {
                            const v = s.velocity || 0;
                            const h = Math.max(12, Math.round((v / sparkMax) * 100));
                            const isCur = s.state === 'active' || s.name === sprint.name;
                            const isClosed = s.state === 'closed';
                            const isBreath = _extractIdx(s.name) === lastIdx;
                            const isBest = bestSprint && s.name === bestSprint.name && !isCur && !isBreath;
                            const cls = isBreath ? 'demo-spark-bar--breath'
                                      : isCur    ? 'demo-spark-bar--current'
                                      : isBest   ? 'demo-spark-bar--best'
                                      : isClosed ? 'demo-spark-bar--closed'
                                                 : 'demo-spark-bar--future';
                            const stateLbl = isBreath ? '🍃 Sprint de respiration (IP)'
                                           : isCur    ? 'en cours'
                                           : isClosed ? 'clôturé'
                                                      : 'à venir';
                            const liveSuffix = s._live ? ' (calculé live depuis les tickets)' : '';
                            const goalLine = s.goal ? `\n🎯 ${s.goal}` : '';
                            const ttl = `${s.name || ''} · ${v} pts${liveSuffix} · ${stateLbl}${goalLine}`;
                            const breathBadge = isBreath ? '<span class="demo-spark-breath-badge" aria-hidden="true">🍃</span>' : '';
                            // Vélocité affichée DANS la barre si la hauteur le permet (≥ 22%), sinon au-dessus
                            const ptsInside = h >= 22 && v > 0;
                            return `<span class="demo-spark-bar-wrap" title="${esc(ttl)}">
                                ${breathBadge}
                                ${(!ptsInside && v > 0) ? `<span class="demo-spark-bar-pts demo-spark-bar-pts--above">${v}</span>` : ''}
                                <span class="demo-spark-bar ${cls}" style="height:${h}%">
                                    ${ptsInside ? `<span class="demo-spark-bar-pts demo-spark-bar-pts--inside">${v}</span>` : ''}
                                </span>
                                <span class="demo-spark-bar-name">${esc((s.name || '').match(/\d+\.\d+/)?.[0] || s.name || '')}</span>
                            </span>`;
                        }).join('');
                        return `<div class="demo-vel-card">
                            <div class="demo-vel-hdr">
                                <div class="demo-vel-title">
                                    <span class="demo-vel-emoji">📈</span>
                                    <span>Vélocité PI ${refPi}</span>
                                    <small class="demo-vel-sub">${closed.length} sprint${closed.length > 1 ? 's' : ''} clos · total ${totalDone} pts</small>
                                </div>
                                <div class="demo-vel-kpis">
                                    <div class="demo-vel-kpi demo-vel-kpi--primary" title="Moyenne des sprints clôturés">
                                        <span class="demo-vel-kpi-val">${avgClosed}</span>
                                        <span class="demo-vel-kpi-lbl">moy. clos</span>
                                    </div>
                                    ${trend != null ? `
                                    <div class="demo-vel-kpi ${trend >= 0 ? 'demo-vel-kpi--good' : 'demo-vel-kpi--warn'}" title="Moyenne 3 derniers vs 3 précédents : ${last3Avg} vs ${prev3Avg}">
                                        <span class="demo-vel-kpi-val">${trend >= 0 ? '↗' : '↘'} ${trend >= 0 ? '+' : ''}${trend}%</span>
                                        <span class="demo-vel-kpi-lbl">tendance</span>
                                    </div>` : ''}
                                    ${best ? `
                                    <div class="demo-vel-kpi" title="Meilleur sprint clos : ${esc(bestSprint?.name || '')}">
                                        <span class="demo-vel-kpi-val">⭐ ${best}</span>
                                        <span class="demo-vel-kpi-lbl">record</span>
                                    </div>` : ''}
                                    ${vals.length ? `
                                    <div class="demo-vel-kpi ${cvCls}" title="Coefficient de variation : ${cv}% — plus bas = plus prédictible">
                                        <span class="demo-vel-kpi-val">${cvLabel}</span>
                                        <span class="demo-vel-kpi-lbl">cv ${cv}%</span>
                                    </div>` : ''}
                                    ${targetPct != null ? `
                                    <div class="demo-vel-kpi ${targetCls}" title="Moy. clos vs cible : ${avgClosed}/${target}">
                                        <span class="demo-vel-kpi-val">🎯 ${targetPct}%</span>
                                        <span class="demo-vel-kpi-lbl">vs cible</span>
                                    </div>` : ''}
                                </div>
                            </div>
                            <div class="demo-vel-spark">${bars}</div>
                            <div class="demo-vel-legend">
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--closed"></span>Clôturé</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--current"></span>En cours</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--best"></span>Record</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--breath"></span>🍃 Respiration (IP)</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--future"></span>À venir</span>
                            </div>
                        </div>`;
                    })()}
                    ${_demoStageFlowHtml(tickets)}
                </section>

                <section class="demo-wins">
                    <h2>🏆 Réalisations du sprint
                        <small class="demo-wins-count">${doneTickets.length}</small>
                        ${bufferTicketsDemo.length > 0 ? `<small class="demo-wins-sub" title="Buffer réalisé">🛡️ ${doneBufferDemo.length}/${bufferTicketsDemo.length}</small>` : ''}
                        ${doneActionRetroDemo.length > 0 ? `<small class="demo-wins-sub" title="Actions rétro terminées">🔁 ${doneActionRetroDemo.length}</small>` : ''}
                    </h2>
                    <div class="demo-wins-grid" id="demo-wins-grid">
                        ${doneTickets.length === 0
                            ? `<div class="demo-empty">Aucun ticket terminé sur ce sprint.</div>`
                            : (() => {
                                // Résolution feature parente
                                const allEpics = store.get('epics') || [];
                                const allFeatures = store.get('features') || [];
                                const epicById    = new Map(allEpics.map(e => [e.id, e]));
                                const featureById = new Map(allFeatures.map(f => [f.id, f]));
                                const _parentFeature = t => {
                                    if (!t.epic) return null;
                                    const ep = epicById.get(t.epic);
                                    if (!ep) return null;
                                    const f = ep.feature ? featureById.get(ep.feature) : (ep.type === 'feature' ? ep : null);
                                    if (f) return { id: f.id, title: f.title || f.id };
                                    return { id: ep.id, title: ep.title || ep.id };
                                };
                                // Tri par feature (alpha), sans-parent à la fin
                                const sorted = doneTickets.slice().sort((a, b) => {
                                    const fa = _parentFeature(a)?.title || '';
                                    const fb = _parentFeature(b)?.title || '';
                                    if (!fa && fb) return 1;
                                    if (fa && !fb) return -1;
                                    return fa.localeCompare(fb, 'fr', { sensitivity: 'base' });
                                });
                                const _has = (t, rx) => (t.labels || []).some(l => rx.test(l));
                                const _badge = t => {
                                    if (_has(t, /^ActionRetro$/i)) return '<span class="demo-win-tag demo-win-tag--retro" title="Action rétro">🔁</span>';
                                    if (_has(t, /^Buffer$/i))      return '<span class="demo-win-tag demo-win-tag--buffer" title="Buffer">🛡️</span>';
                                    return '';
                                };
                                return sorted.map(t => {
                                    const pf = _parentFeature(t);
                                    return `<div class="demo-win-card">
                                        <div class="demo-win-top">
                                            <span class="demo-win-icon">${_typeIcon(t.type, t.labels)}</span>
                                            <button class="demo-win-key demo-win-key--clickable" data-ticket-id="${esc(t.id)}" title="Ouvrir ${esc(t.id)}">${esc(t.id)}</button>
                                            ${_badge(t)}
                                            ${t.points ? `<span class="demo-win-pts">${t.points} <small>pts</small></span>` : ''}
                                        </div>
                                        <div class="demo-win-title">${esc(t.title || '(sans titre)')}</div>
                                        ${pf ? `<button class="demo-win-parent-chip" data-ticket-id="${esc(pf.id)}" title="Ouvrir ${esc(pf.id)} - ${esc(pf.title)}">
                                            <span class="demo-win-parent-icon">🧭</span>
                                            <span class="demo-win-parent-label">${esc(pf.title)}</span>
                                        </button>` : ''}
                                    </div>`;
                                }).join('');
                            })()}
                    </div>
                </section>
            </div>

            <footer class="demo-footer">
                <span class="demo-kbd">⌨️ <kbd>Esc</kbd> quitter · <kbd>F</kbd> fullscreen · <kbd>Espace</kbd> pause auto-scroll</span>
            </footer>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Burnup avec events (annotations sur la timeline du sprint)
    if (sStart && sEnd) {
        const durationDays = Math.max(1, Math.round((sEnd - sStart) / 86400000) + 1);
        const sprintCtx = { startDate: sprint.startDate, endDate: sprint.endDate, durationDays };
        // Différer pour laisser le DOM se peindre, sinon Chart.js mesure 0×0
        setTimeout(() => renderBurnup('demo-burnup-canvas', tickets, sprintCtx, sprintEvents, { theme: 'dark' }), 80);
    }

    // Clics : clés de tickets + chips de feature parente → ouverture de la modal détaillée.
    // La modal Demo est à z-index 10000 ; on force la modal-overlay détail au-dessus (≥ 11000).
    overlay.querySelectorAll('[data-ticket-id]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const id = el.dataset.ticketId;
            if (!id) return;
            const mo = document.getElementById('modal-overlay');
            if (mo) mo.classList.add('above-demo');   // CSS bump z-index au-dessus de la Demo
            window.__squadBoard?.openTicketModal?.(id);
        });
    });

    // Auto-scroll lent du grid si beaucoup de cards
    let autoScrollTimer = null;
    let isPaused = false;
    const grid = overlay.querySelector('#demo-wins-grid');
    const startAutoScroll = () => {
        if (!grid || grid.scrollHeight <= grid.clientHeight) return;
        autoScrollTimer = setInterval(() => {
            if (isPaused) return;
            const atBottom = grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 5;
            if (atBottom) grid.scrollTop = 0;
            else grid.scrollTop += 1;
        }, 60);
    };
    setTimeout(startAutoScroll, 2000); // start après affichage

    // Close handlers
    const cleanup = () => {
        clearInterval(autoScrollTimer);
        document.removeEventListener('keydown', onKey);
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    };
    const closeDemo = () => {
        cleanup();
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    };
    overlay.querySelector('.demo-mode-close')?.addEventListener('click', closeDemo);

    const onKey = e => {
        if (ticketModalOnTop()) return;   // ticket ouvert par-dessus la Démo : il a la main sur le clavier
        if (e.key === 'Escape') closeDemo();
        else if (e.key === ' ') { e.preventDefault(); isPaused = !isPaused; }
        else if (e.key === 'f' || e.key === 'F') {
            if (document.fullscreenElement) document.exitFullscreen();
            else overlay.requestFullscreen?.().catch(() => {});
        }
    };
    document.addEventListener('keydown', onKey);
}
