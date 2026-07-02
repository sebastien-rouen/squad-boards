/**
 * Roadmap view - feature timeline, velocity breakdown, backlog health, team allocation,
 * drag-and-drop ranking, dependency graph.
 */

import { store } from '../state.js';
import { esc, pct, progressColor, filterByTeam, groupBy, sumBy, deriveMembersFromAbsences, rollupStatus, computeVelocityHistory, getCurrentPi, extractPiNum, computeVelocityBreakdown, statusBadge, typeBadge } from '../utils.js';
import { STATUS_LABELS, TEAM_COLORS, TYPE_ICONS } from '../config.js';
import { renderVelocityChart } from '../components/charts.js';
import { renderItemDepGraph, extractDependencyEdges } from '../components/dep_graph.js';
import * as api from '../api.js';
import { toast } from '../utils.js';

export function renderRoadmap(container) {
    const team = store.get('team');
    const allTickets = store.get('tickets') || [];
    const tickets = filterByTeam(allTickets, team);
    const allFeatures = store.get('features') || [];
    const features = filterByTeam(allFeatures, team);  // respect team/group filter
    const epics = store.get('epics') || [];
    const teams = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    // Vélocité dérivée des sprints clôturés + tickets done (cf. utils.computeVelocityHistory)
    const velocityHistory = computeVelocityHistory(allTickets, store.get('sprintInfo'), team);
    const piInfo = store.get('piInfo');

    // PI context — décalé par le sélecteur topbar (piOffset)
    // PI courant = SOURCE UNIQUE getCurrentPi (sprint actif > piInfo.number) — ne jamais
    // réimplémenter la regex localement (bugs historiques, cf. CLAUDE.md du site).
    const _sprintInfo = store.get('sprintInfo');
    const _basePi = getCurrentPi({ sprintInfo: _sprintInfo, piInfo });
    const _piOffset = store.get('piOffset') || 0;
    const currentPiNum = _basePi ? Math.max(1, _basePi + _piOffset) : 0;
    // Sub-mode cards/list pour la vue "PI futur" — préservé via roadmapTab
    const _tab = store.get('roadmapTab') || 'current';
    // Mode "PI futur" activé dès que piOffset > 0 (le PI affiché est dans le futur)
    const isNextPi = _piOffset > 0;
    const viewMode = isNextPi ? (_tab === 'next-list' ? 'next-list' : 'next') : 'current';
    // Tag du PI sélectionné (utilisé pour filtrer features/tickets via leur champ Sprint)
    // Convention : extractPI() renvoie "PI#30" depuis "Fuego - Ite 30.3" ou "PI30" ou Labels
    const currentPiTag = currentPiNum ? `PI#${currentPiNum}` : null;
    const nextPiNum = currentPiNum;
    const nextPiTag  = currentPiTag;
    const piLabel = currentPiNum ? `PI${currentPiNum}` : 'PI courant';
    const nextPiLabel = `PI${currentPiNum}`;

    // Filtre les features par le PI sélectionné. Source du PI :
    //   1. f.piSprint déjà extrait par sync.js (extractPI sur le nom de sprint JIRA)
    //   2. Fallback : extraction directe depuis f.sprintName (au cas où le snapshot DB serait incomplet)
    //   3. Fallback : labels (pattern PI29 / PI#29)
    // Extraction du n° de PI déléguée à extractPiNum (source unique) — gère `PI#29`, `PI29`,
    // `pi 29`, `29.1`, `Fuego - Ite 29.3` de façon cohérente avec getCurrentPi.
    const _matchPi = (raw) => !!currentPiNum && extractPiNum(raw) === currentPiNum;
    const _matchFeaturePi = (f) => {
        if (_matchPi(f.piSprint)) return true;
        if (_matchPi(f.sprintName)) return true;  // au cas où piSprint serait null mais sprintName présent
        if (Array.isArray(f.labels)) {
            for (const lbl of f.labels) if (_matchPi(lbl)) return true;
        }
        return false;
    };
    const piFilteredFeatures = features.filter(_matchFeaturePi);

    // Sort features by rank then by creation date
    const sortedFeatures = [...piFilteredFeatures].sort((a, b) => {
        if ((a.rank || 0) !== (b.rank || 0)) return (a.rank || 0) - (b.rank || 0);
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    // Pre-index for O(1) lookups — avoids O(features × tickets × epics) nested loops
    const ticketsByEpicId = new Map();
    for (const t of tickets) {
        if (!t.epic) continue;
        if (!ticketsByEpicId.has(t.epic)) ticketsByEpicId.set(t.epic, []);
        ticketsByEpicId.get(t.epic).push(t);
    }
    const epicsByFeatureId = new Map();
    for (const e of epics) {
        if (!e.feature) continue;
        if (!epicsByFeatureId.has(e.feature)) epicsByFeatureId.set(e.feature, []);
        epicsByFeatureId.get(e.feature).push(e);
    }
    const ticketsByTeam = new Map();
    for (const t of tickets) {
        if (!ticketsByTeam.has(t.team)) ticketsByTeam.set(t.team, []);
        ticketsByTeam.get(t.team).push(t);
    }

    // Feature progress (current PI view)
    const featureData = sortedFeatures.map(f => {
        const featEpics = epicsByFeatureId.get(f.id) || [];
        const children = featEpics.flatMap(e => ticketsByEpicId.get(e.id) || []);
        const all = children.length ? children : (ticketsByTeam.get(f.team) || []);
        const total = all.length || 1;
        const done = all.filter(t => t.status === 'done').length;
        const childPts = sumBy(all, t => t.points);
        const donePts = sumBy(all.filter(t => t.status === 'done'), t => t.points);
        const pts = f.points || childPts || 0;
        // Statut dérivé : reflète l'avancée réelle via les enfants. Fallback sur le statut propre JIRA.
        const rolledStatus = rollupStatus(children, f.status);
        return { ...f, progress: pct(done, total), ptsPct: pct(donePts, pts || 1), childCount: all.length, pts, donePts, rolledStatus };
    });

    // Next PI features — filtered by selected team/group, searches feature + ticket stores
    const nextPiFeatureData = nextPiTag ? (() => {
        // Pre-index allTickets by piSprint for the nextPi lookups below
        const allTicketsByEpicId = new Map();
        const nextPiTickets = [];
        for (const t of allTickets) {
            if (t.epic) {
                if (!allTicketsByEpicId.has(t.epic)) allTicketsByEpicId.set(t.epic, []);
                allTicketsByEpicId.get(t.epic).push(t);
            }
            if (t.piSprint === nextPiTag) nextPiTickets.push(t);
        }
        const epicById = new Map(epics.map(e => [e.id, e]));

        const fromFeatureStore = features.filter(f => f.piSprint === nextPiTag);
        const fromFeatureIds = new Set(fromFeatureStore.map(f => f.id));
        const fromTicketStore = tickets.filter(t =>
            t.piSprint === nextPiTag && t.type === 'feature' && !fromFeatureIds.has(t.id)
        );

        // Inherited features: feature is labelled in an earlier PI but has child tickets in nextPi.
        // Common case: a feature spans multiple PIs (started in PI#29, work continues in PI#30).
        // Chain: ticket → epic.id → epic.feature → feature.id
        const alreadyIncluded = new Set([
            ...fromFeatureStore.map(f => f.id),
            ...fromTicketStore.map(t => t.id),
        ]);
        const inheritedFeatureIds = new Set();
        for (const t of nextPiTickets) {
            if (!t.epic) continue;
            const ep = epicById.get(t.epic);
            if (ep?.feature) inheritedFeatureIds.add(ep.feature);
        }
        const fromInherited = features
            .filter(f => !alreadyIncluded.has(f.id) && inheritedFeatureIds.has(f.id))
            .map(f => ({ ...f, _piInherited: true }));

        // Option B — orphan epics: epics with PI#X tickets but no feature parent (or feature absent).
        // Used as proxy-features for projects that plan at the epic level (e.g. GCOM).
        const featureIds = new Set(features.map(f => f.id));
        const epicsForTeam = filterByTeam(epics, team);
        const nextPiEpicIds = new Set(nextPiTickets.map(t => t.epic).filter(Boolean));
        const fromOrphanEpics = epicsForTeam
            .filter(ep => (!ep.feature || !featureIds.has(ep.feature)) && nextPiEpicIds.has(ep.id))
            .map(ep => ({ ...ep, _piProxy: 'epic', piSprint: ep.piSprint || nextPiTag }));

        return [...fromFeatureStore, ...fromTicketStore, ...fromInherited, ...fromOrphanEpics]
            .sort((a, b) => (a.rank || 0) - (b.rank || 0))
            .map(f => {
                // Chaîne enfant : pour un proxy-epic, enfants = tickets directement parentés à f
                // Sinon : tickets via la chaîne epic → feature, fallback direct ticket → feature
                let children;
                if (f._piProxy === 'epic') {
                    children = (allTicketsByEpicId.get(f.id) || []).filter(t => t.piSprint === nextPiTag);
                } else {
                    const featEpics = epicsByFeatureId.get(f.id) || [];
                    const epicIdSet = new Set(featEpics.map(e => e.id));
                    children = nextPiTickets.filter(t => t.epic && epicIdSet.has(t.epic));
                    if (!children.length) {
                        children = (allTicketsByEpicId.get(f.id) || []).filter(t => t.piSprint === nextPiTag);
                    }
                }
                const childPts     = sumBy(children, t => t.points);
                const donePts      = sumBy(children.filter(t => t.status === 'done'), t => t.points);
                // Affichage des SP : priorité au champ Story Points de la feature elle-même (JIRA),
                // fallback sur la somme des enfants pour les features sans SP propre.
                const totalPts = f.points || childPts || 0;
                // Statut dérivé depuis les enfants — reflète l'avancée réelle. Fallback : statut JIRA propre.
                const rolledStatus = rollupStatus(children, f.status);
                return {
                    ...f,
                    progress:   pct(children.filter(t => t.status === 'done').length, children.length || 1),
                    ptsPct:     pct(donePts, totalPts || 1),
                    childCount: children.length,
                    pts:        totalPts,
                    donePts,
                    rolledStatus,
                };
            });
    })() : [];

    // Velocity breakdown (80/20) — source unique computeVelocityBreakdown
    const { totalPts, donePts, bufferPts, featurePts } = computeVelocityBreakdown(tickets);

    // Prédictibilité — moyenne livraison 2 derniers PI + capacité brute/nette pour le PI courant.
    // Membres dérivés des absences (CSV RH = source de vérité), pas de la table members (artefacts JIRA).
    const absences = store.get('absences') || [];
    const members  = deriveMembersFromAbsences(absences, store.get('members') || []);
    const sprintInfo = store.get('sprintInfo');
    const predict = _computePredictability(allTickets, members, absences, piInfo, sprintInfo, team);

    // Backlog health KPIs
    const noEpicTickets = tickets.filter(t => !t.epic && t.status !== 'done');
    const noPointsTickets = tickets.filter(t => !t.points && t.status !== 'done');
    const noPriorityTickets = tickets.filter(t => (!t.priority || t.priority === 'medium') && t.status !== 'done');

    // Team allocation (features per team)
    const teamAlloc = teams.map((t, i) => {
        const tObj = teamObjects.find(o => o.name === t);
        const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];
        const tt = tickets.filter(x => x.team === t);
        const pts = sumBy(tt, x => x.points);
        const feats = features.filter(f => f.team === t);
        return { name: t, color, ticketCount: tt.length, pts, featureCount: feats.length };
    });

    container.innerHTML = `
        <!-- Velocity Breakdown -->
        <div class="dashboard-metrics mb-4">
            <div class="metric-card ${pct(donePts, totalPts) >= 80 ? 'mc-done' : pct(donePts, totalPts) >= 50 ? 'mc-warning' : 'mc-danger'}">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Points totaux</span>
                <span class="metric-value">${totalPts}</span>
                <span class="metric-sub">${donePts} realises (${pct(donePts, totalPts)}%)</span>
            </div>
            <div class="metric-card mc-primary">
                <span class="metric-icon">📦</span>
                <span class="metric-label">Features</span>
                <span class="metric-value">${featurePts}</span>
                <span class="metric-sub">${pct(featurePts, totalPts)}% du total</span>
            </div>
            <div class="metric-card mc-warning">
                <span class="metric-icon">🛡️</span>
                <span class="metric-label">Buffer</span>
                <span class="metric-value">${bufferPts}</span>
                <span class="metric-sub">${pct(bufferPts, totalPts)}% du total</span>
            </div>
            <div class="metric-card mc-info">
                <span class="metric-icon">🗺️</span>
                <span class="metric-label">Features PI</span>
                <span class="metric-value">${features.length}</span>
                <span class="metric-sub">${features.filter(f => f.status === 'done').length} terminees</span>
            </div>
            <div class="metric-card mc-primary" style="cursor: help" title="${esc(_predictTooltip(predict, team))}">
                <span class="metric-icon">📊</span>
                <span class="metric-label">Prédictibilité</span>
                <span class="metric-value">${predict.avgDelivered}<small style="font-size:11px;color:var(--text-muted);font-weight:400"> pts</small></span>
                <span class="metric-sub">${predict.netCapacity} j-h ce PI${predict.absenceDays > 0 ? ` · -${predict.absenceDays} j abs` : ''}</span>
            </div>
        </div>

        ${_multiPiTimelineHtml(features, _basePi, _piOffset, teamObjects)}

        ${isNextPi
            ? _nextPiSectionHtml(nextPiFeatureData, nextPiTag, nextPiLabel, _buildDiag(allFeatures, allTickets, nextPiTag, nextPiFeatureData.length, nextPiFeatureData.filter(f => f._piInherited).length), viewMode, allTickets, epics, teamObjects, store.get('jiraUrl') || null, _basePi)
            : _currentPiSectionHtml(featureData, noEpicTickets, noPointsTickets, noPriorityTickets, teamAlloc, totalPts, velocityHistory)
        }
    `;

    // ── Timeline multi-PI : clic en-tête PI → sélection (piOffset), clic carte → modal ──
    container.querySelectorAll('.rm-tl-hd[data-pi-offset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const o = parseInt(btn.dataset.piOffset, 10);
            if (!Number.isNaN(o)) store.set('piOffset', o);
        });
    });
    container.querySelectorAll('.rm-tl-card[data-feature-id]').forEach(el => {
        el.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(el.dataset.featureId));
    });

    // ── Sub-view toggle (Cartes / Liste) — au sein de la section "PI suivant" ──
    container.querySelectorAll('[data-npi-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            store.set('roadmapTab', btn.dataset.npiView);
            window.__squadBoard?.pushHash?.();
            renderRoadmap(container);
        });
    });

    // ── Badge "héritée" → saute au PI d'origine de la feature ──────────────────
    container.querySelectorAll('[data-jump-pi]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const o = parseInt(btn.dataset.jumpPi, 10);
            if (!Number.isNaN(o)) store.set('piOffset', o);
        });
    });

    if (isNextPi) {
        if (viewMode === 'next-list') {
            // List view: expand/collapse feature accordions (skip clic sur drag-handle / badge héritée)
            container.querySelectorAll('.npi-feat-hd').forEach(hd => {
                hd.addEventListener('click', e => {
                    if (e.target.closest('.drag-handle') || e.target.closest('[data-jump-pi]')) return;
                    const feat = hd.closest('.npi-feat');
                    feat.classList.toggle('expanded');
                    feat.querySelector('.npi-children')?.classList.toggle('hidden');
                });
            });
            // Child ticket click → modal
            container.querySelectorAll('.npi-child[data-ticket-id]').forEach(el => {
                el.addEventListener('click', e => {
                    e.stopPropagation();
                    window.__squadBoard?.openTicketModal?.(el.dataset.ticketId);
                });
            });
        } else {
            // Card view: card click → modal (skip clic sur drag-handle / drill-down / badge héritée)
            container.querySelectorAll('.next-pi-card').forEach(el => {
                el.addEventListener('click', e => {
                    if (e.target.closest('.drag-handle') || e.target.closest('[data-drill-toggle]') || e.target.closest('.npi-child') || e.target.closest('[data-jump-pi]')) return;
                    window.__squadBoard?.openTicketModal?.(el.dataset.featureId);
                });
            });
            // Card view: drill-down toggle → déplie/replie les tickets enfants sans ouvrir la modal
            container.querySelectorAll('.next-pi-card [data-drill-toggle]').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const card = btn.closest('.next-pi-card');
                    card.classList.toggle('expanded');
                    card.querySelector('.npi-children')?.classList.toggle('hidden');
                });
            });
            container.querySelectorAll('.next-pi-card .npi-child[data-ticket-id]').forEach(el => {
                el.addEventListener('click', e => {
                    e.stopPropagation();
                    window.__squadBoard?.openTicketModal?.(el.dataset.ticketId);
                });
            });
        }
        // Drag-and-drop wiring happens after this block (below)
    }

    // ── Current PI: feature click → modal ─────────────────────────────────────
    container.querySelectorAll('.feature-row').forEach(el => {
        el.addEventListener('click', e => {
            if (e.target.closest('.drag-handle')) return;
            window.__squadBoard?.openTicketModal?.(el.dataset.ticketId);
        });
    });

    // ── Backlog health : KPI cliquable → déplie la liste des tickets concernés ──
    container.querySelectorAll('.rm-health-kpi-btn[data-health-kpi]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.healthKpi;
            const detail = container.querySelector(`.rm-health-detail[data-health-detail="${key}"]`);
            if (!detail) return;
            const willOpen = detail.classList.contains('hidden');
            container.querySelectorAll('.rm-health-detail').forEach(d => d.classList.add('hidden'));
            container.querySelectorAll('.rm-health-kpi-btn').forEach(b => b.classList.remove('active'));
            if (willOpen) { detail.classList.remove('hidden'); btn.classList.add('active'); }
        });
    });
    container.querySelectorAll('.rm-health-ticket[data-ticket-id]').forEach(el => {
        el.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(el.dataset.ticketId));
    });

    // ── Allocation par équipe : clic sur une ligne → filtre la page sur cette équipe ──
    container.querySelectorAll('.rm-team-row[data-team-name]').forEach(el => {
        el.addEventListener('click', () => store.set('team', el.dataset.teamName));
    });

    // ── Drag & drop ranking (factorisé pour PI courant + PI suivant cartes + liste) ─
    _wireFeatureDrag(container, '#feature-drag-list', '.feature-draggable');
    _wireFeatureDrag(container, '.next-pi-grid',     '.next-pi-card');
    _wireFeatureDrag(container, '.npi-list',         '.npi-feat');

    // ── Dependency graph + velocity chart ─────────────────────────────────────
    requestAnimationFrame(() => {
        const svg = container.querySelector('#dep-graph');
        if (svg) renderItemDepGraph(svg, featureData, teamObjects);
        const svgNext = container.querySelector('#dep-graph-next');
        if (svgNext) renderItemDepGraph(svgNext, nextPiFeatureData, teamObjects);
        if (velocityHistory.length) renderVelocityChart('chart-rm-velocity', velocityHistory);
    });
}

// Children = tickets ENFANTS d'une feature/epic dans le PI cible.
// - Proxy-epic (f est un epic) : tickets directement parentés à f.id
// - Feature normale : tickets via la chaîne epic → feature, avec fallback direct
//   (cas où le ticket pointe directement la feature sans passer par un epic)
function _childrenForFeature(f, allTickets, epics, piTag) {
    if (f._piProxy === 'epic') {
        return allTickets.filter(t => t.piSprint === piTag && t.epic === f.id);
    }
    const featEpics = epics.filter(e => e.feature === f.id);
    let children = allTickets.filter(t =>
        t.piSprint === piTag && t.epic && featEpics.some(e => e.id === t.epic)
    );
    if (!children.length) {
        // Cas où certaines équipes parente directement le ticket à la feature
        children = allTickets.filter(t => t.piSprint === piTag && t.epic === f.id);
    }
    return children;
}

// ── Next PI section HTML ──────────────────────────────────────────────────────
function _nextPiSectionHtml(features, piTag, piLabel, diag, viewMode, allTickets, epics, teamObjects, jiraUrl = null, basePi = null) {
    const heading   = esc(piTag || piLabel);
    const count     = features.length;
    const countLabel = `${count} feature${count !== 1 ? 's' : ''} planifie${count !== 1 ? 'es' : 'e'}`;
    const missingPtsCount = features.reduce(
        (n, f) => n + _childrenForFeature(f, allTickets, epics, piTag).filter(t => !t.points).length,
        0
    );
    const missingPtsChip = missingPtsCount
        ? `<span class="missing-pts-chip" title="Tickets sans story points, à chiffrer">⚠ ${missingPtsCount} sans points</span>`
        : '';
    const isListView = viewMode === 'next-list';

    const subToggle = `
        <div class="npi-sub-toggle">
            <button class="npi-sub-btn${!isListView ? ' active' : ''}" data-npi-view="next">
                <svg class="icon" style="width:14px;height:14px"><use href="#i-grid"/></svg> Cartes
            </button>
            <button class="npi-sub-btn${isListView ? ' active' : ''}" data-npi-view="next-list">
                <svg class="icon" style="width:14px;height:14px"><use href="#i-list"/></svg> Liste
            </button>
        </div>`;

    const cardsHtml = features.map(f => {
        const ptsPct = f.ptsPct || 0;
        const children = _childrenForFeature(f, allTickets, epics, piTag);
        const childCount = children.length;
        return `
        <div class="next-pi-card${f._piInherited ? ' next-pi-card-inherited' : ''}${f._piProxy ? ' next-pi-card-proxy' : ''}"
             data-feature-id="${esc(f.id)}"${f._piProxy ? ' data-proxy="1"' : ' draggable="true"'}>
            <div class="next-pi-card-hd">
                ${!f._piProxy ? '<span class="drag-handle" title="Glisser pour réordonner">⠿</span>' : ''}
                ${typeBadge(f.type, { size: '2xs' })}
                <span class="next-pi-badge">${esc(f.piSprint || piTag || piLabel)}</span>
                ${(() => {
                    const s = f.rolledStatus || f.status;
                    const tip = f.rolledStatus && f.rolledStatus !== f.status
                        ? `Statut dérivé des ${f.childCount} enfants (JIRA propre: ${STATUS_LABELS[f.status] || f.status})`
                        : `Statut JIRA`;
                    return `<span class="badge badge-${esc(s)}" title="${esc(tip)}">${esc(STATUS_LABELS[s] || s)}</span>`;
                })()}
                ${f._piInherited ? _inheritedBadgeHtml(f, piTag, basePi) : ''}
                ${f._piProxy === 'epic' ? `<span class="badge badge-proxy" title="Epic affiche comme proxy-feature (pas de Feature JIRA parente)">epic</span>` : ''}
            </div>
            <div class="next-pi-card-title">${esc(f.title)}</div>
            <div class="next-pi-card-meta">
                <div class="next-pi-meta-row">
                    <span class="next-pi-meta-key">Equipe</span>
                    <span class="next-pi-meta-val">${esc(f.team || '—')}</span>
                </div>
                <div class="next-pi-meta-row">
                    <span class="next-pi-meta-key">Responsable</span>
                    <span class="next-pi-meta-val">${esc(f.leader || '—')}</span>
                </div>
            </div>
            <div class="next-pi-pts-row">
                <span class="next-pi-pts-label">${f.donePts} / ${f.pts} pts</span>
                <span class="text-xs text-muted">${ptsPct}%</span>
            </div>
            <div class="progress progress-xs" style="margin-top:var(--sp-1)">
                <div class="progress-bar ${progressColor(ptsPct)}" style="width:${ptsPct}%"></div>
            </div>
            <button type="button" class="next-pi-card-drill" data-drill-toggle>
                <svg class="npi-chevron icon icon-xs"><use href="#i-chevron-right"/></svg>
                ${childCount} ticket${childCount !== 1 ? 's' : ''}
            </button>
            <div class="npi-children hidden">
                ${childCount ? _childRowsHtml(children) : `<div class="npi-child-empty">Aucun ticket enfant rattaché à cette feature.</div>`}
            </div>
        </div>`;
    }).join('');

    const teamFilterActive = diag && diag.featuresNextPiFiltered === 0 && diag.featuresNextPi > 0;
    const body = count
        ? (isListView
            ? _nextPiListHtml(features, allTickets, epics, teamObjects, piTag, jiraUrl, basePi)
            : `<div class="next-pi-grid">${cardsHtml}</div>`)
        : teamFilterActive
            ? `<div class="empty-state">
                <p>Les ${diag.featuresNextPi} features <code>${esc(piTag || '')}</code> sont masquees par le filtre equipe.</p>
                ${diag.teamDistribution.length ? `
                <p class="text-xs text-muted mt-2"><strong>Equipes presentes</strong> sur ces ${diag.featuresNextPi} features :
                ${diag.teamDistribution.map(([t, n]) => `<code>${esc(t)}</code> (${n})`).join(', ')}.</p>
                <p class="text-xs text-muted mt-1">Si ces noms ne correspondent pas a vos equipes locales (ex : <code>GDC - Cameleon</code> vs <code>Cameleon</code>),
                ajoutez-les a votre <strong>groupe</strong> dans Parametres → Groupes, ou retirez le filtre groupe.</p>` : ''}
               </div>`
            : `<div class="empty-state">
                <p>Aucune feature trouvee pour ${heading}.</p>
                ${diag && diag.ticketsNextPi > 0 ? `
                <p class="text-xs text-muted mt-2"><strong>${diag.ticketsNextPi} tickets</strong> sont planifies pour ${heading} mais aucune feature parente n'est detectee.<br>
                Causes possibles : (1) vos features sont etiquetees d'un PI anterieur (le badge <em>héritée</em> s'affichera apres re-synchronisation grace au correctif epic→feature) ; (2) les tickets PI suivant n'ont pas d'epic JIRA parent.</p>` : ''}
               </div>`;

    const _depEdges = extractDependencyEdges(features);
    const depGraphSection = _depEdges.length ? `
        <div class="pi-section">
            <h3 class="pi-section-title">Graphe de dépendances ${heading} <span class="text-xs text-muted">(liens inter-équipes en rouge)</span></h3>
            <div class="card" style="overflow:auto">
                <svg id="dep-graph-next" class="dep-graph-svg"></svg>
            </div>
        </div>` : '';

    return `
        <div class="pi-section">
            <div class="pi-section-hdr">
                <h3 class="pi-section-title">Features ${heading}</h3>
                <div class="flex items-center gap-3">
                    ${subToggle}
                    <span class="text-xs text-muted">${countLabel}</span>
                    ${missingPtsChip}
                </div>
            </div>
            ${body}
        </div>
        ${depGraphSection}`;
}

const NPI_STATUS_DOT_COLORS = {
    done:   'var(--success)',
    inprog: 'var(--primary)',
    review: '#f59e0b',
    test:   '#06b6d4',
    blocked:'var(--danger)',
    todo:   'var(--border)',
};
// Badge "héritée" — cliquable pour sauter au PI d'origine de la feature quand celui-ci est
// calculable (basePi connu + piSprint parsable), sinon simple badge informatif.
function _inheritedBadgeHtml(f, piTag, basePi, sizeCls = '') {
    const tip = `Cette feature est etiquetee ${esc(f.piSprint || '')} mais a des tickets en ${esc(piTag || '')}`;
    const originPiNum = basePi ? extractPiNum(f.piSprint) : null;
    if (!originPiNum) return `<span class="badge badge-inherited${sizeCls}" title="${tip}">héritée</span>`;
    const offset = originPiNum - basePi;
    return `<button type="button" class="badge badge-inherited${sizeCls} badge-link" data-jump-pi="${offset}" title="${tip} — cliquer pour ouvrir ${esc(f.piSprint)}">héritée ↗</button>`;
}

// Rendu des lignes "ticket enfant" — réutilisé par la vue liste ET la vue cartes (drill-down).
function _childRowsHtml(children) {
    return children.map(t => {
        const dotColor = NPI_STATUS_DOT_COLORS[t.status] || NPI_STATUS_DOT_COLORS.todo;
        const typeIcon = TYPE_ICONS[t.type] || '✦';
        const hasPts = !!t.points;
        const pts = hasPts ? `${t.points} pt${t.points > 1 ? 's' : ''}` : '⚠ à chiffrer';
        return `
        <div class="npi-child" data-ticket-id="${esc(t.id)}">
            <span class="npi-status-dot" style="background:${dotColor}"></span>
            <span class="npi-child-type" title="${esc(t.type)}">${typeIcon}</span>
            <span class="npi-child-key">${esc(t.id)}</span>
            <span class="npi-child-title">${esc(t.title)}</span>
            <span class="npi-child-leader">${esc(t.leader || '—')}</span>
            <span class="npi-child-pts${hasPts ? '' : ' npi-child-pts-missing'}" title="${hasPts ? '' : 'Story points manquants sur ce ticket'}">${pts}</span>
        </div>`;
    }).join('');
}

// ── Next PI list view HTML ────────────────────────────────────────────────────
function _nextPiListHtml(features, allTickets, epics, teamObjects, piTag, jiraUrl = null, basePi = null) {

    const rows = features.map(f => {
        const tObj = teamObjects.find(t => t.name === f.team);
        const teamColor = tObj?.color || 'var(--text-muted)';
        const ptsPct = f.ptsPct || 0;

        const children = _childrenForFeature(f, allTickets, epics, piTag);
        const childCount = children.length;
        const childRows = _childRowsHtml(children);

        return `
        <div class="npi-feat${f._piInherited ? ' npi-feat-inherited' : ''}${f._piProxy ? ' npi-feat-proxy' : ''}"
             style="--npi-team-color:${teamColor}"
             data-feature-id="${esc(f.id)}"${f._piProxy ? ' data-proxy="1"' : ' draggable="true"'}>
            <div class="npi-feat-hd">
                <svg class="npi-chevron icon icon-xs"><use href="#i-chevron-right"/></svg>
                ${!f._piProxy ? '<span class="drag-handle" title="Glisser pour réordonner">⠿</span>' : ''}
                ${typeBadge(f.type, { size: '2xs' })}
                ${(() => {
                    const s = f.rolledStatus || f.status;
                    const tip = f.rolledStatus && f.rolledStatus !== f.status
                        ? `Statut dérivé des ${f.childCount} enfants (JIRA propre: ${STATUS_LABELS[f.status] || f.status})`
                        : `Statut JIRA`;
                    return `<span class="badge badge-${esc(s)} badge-sm" title="${esc(tip)}">${esc(STATUS_LABELS[s] || s)}</span>`;
                })()}
                ${f._piInherited ? _inheritedBadgeHtml(f, piTag, basePi, ' badge-sm') : ''}
                ${f._piProxy === 'epic' ? `<span class="badge badge-proxy badge-sm" title="Epic affiche comme proxy-feature">epic</span>` : ''}
                ${jiraUrl
                    ? `<a class="npi-feat-key npi-feat-key-link" href="${esc(jiraUrl)}/browse/${esc(f.id)}" target="_blank" rel="noopener" title="Ouvrir ${esc(f.id)} dans JIRA" onclick="event.stopPropagation()">${esc(f.id)}<svg class="npi-feat-key-ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
                    : `<span class="npi-feat-key">${esc(f.id)}</span>`}
                <span class="npi-feat-title">${esc(f.title)}</span>
                <span class="npi-feat-team-chip">${esc(f.team || '—')}</span>
                <span class="npi-feat-leader">${esc(f.leader || '—')}</span>
                <span class="npi-feat-pts">${f.donePts}/${f.pts} pts</span>
                <div class="npi-feat-bar">
                    <div class="progress progress-xs">
                        <div class="progress-bar ${progressColor(ptsPct)}" style="width:${ptsPct}%"></div>
                    </div>
                </div>
            </div>
            ${childCount
                ? `<div class="npi-children hidden">${childRows}</div>`
                : `<div class="npi-children hidden"><div class="npi-child-empty">Aucun ticket enfant rattaché à cette feature.</div></div>`}
        </div>`;
    }).join('');

    return `<div class="npi-list">${rows}</div>`;
}

// ── Build diagnostic data for next PI view ────────────────────────────────────
/**
 * Calcule l'indicateur de prédictibilité d'une équipe :
 *   - Moyenne des story points livrés sur les 2 PI précédents
 *   - Capacité jours-homme pour le PI courant (membres × jours ouvrés) MINUS absences planifiées
 */
function _computePredictability(allTickets, members, absences, piInfo, sprintInfo, team) {
    const curPi = piInfo?.number;
    // Filtrage cohérent avec filterByTeam (gère 'all' + groupes via window.__squadBoard.store)
    const filteredTickets  = filterByTeam(allTickets || [], team);
    const filteredMembers  = filterByTeam(members || [],     team);
    const filteredAbsences = filterByTeam(absences || [],    team);

    // 1. Story points livrés sur les 2 PI précédents
    const ptsInPi = piTag => filteredTickets
        .filter(t => t.piSprint === piTag && t.status === 'done')
        .reduce((s, t) => s + (t.points || 0), 0);
    const prev1Tag = curPi ? `PI#${curPi - 1}` : null;
    const prev2Tag = curPi ? `PI#${curPi - 2}` : null;
    const donePrev1 = prev1Tag ? ptsInPi(prev1Tag) : 0;
    const donePrev2 = prev2Tag ? ptsInPi(prev2Tag) : 0;
    let avgDelivered;
    if (donePrev1 > 0 && donePrev2 > 0) avgDelivered = Math.round((donePrev1 + donePrev2) / 2);
    else if (donePrev1 > 0)              avgDelivered = donePrev1;
    else if (donePrev2 > 0)              avgDelivered = donePrev2;
    else                                 avgDelivered = 0;

    // 2. Capacité jours-homme brute (équipe filtrée)
    const teamMembers = filteredMembers;
    const sprintsPerPi  = piInfo?.sprintsPerPI    || 5;
    const sprintDur     = piInfo?.sprintDuration  || 14;
    const workDaysPerSprint = Math.round(sprintDur * 5 / 7);  // approx jours ouvrés
    const piDurDays = sprintsPerPi * sprintDur;
    const baseCapacity = teamMembers.length * sprintsPerPi * workDaysPerSprint;

    // 3. Absences sur la période du PI courant (estimée depuis sprintInfo)
    let piStart = null, piEnd = null;
    if (sprintInfo?.startDate) {
        piStart = sprintInfo.startDate;
        const d = new Date(piStart);
        d.setDate(d.getDate() + piDurDays);
        piEnd = d.toISOString().slice(0, 10);
    }
    let absencesInPi = [];
    let absenceDays = 0;
    if (piStart && piEnd) {
        absencesInPi = filteredAbsences.filter(a =>
            a.startDate <= piEnd && (a.endDate || a.startDate) >= piStart
        );
        absenceDays = absencesInPi.reduce((s, a) => s + (a.days || 1), 0);
    }
    const netCapacity = Math.max(0, baseCapacity - absenceDays);

    return {
        avgDelivered, donePrev1, donePrev2, prev1Tag, prev2Tag,
        teamMemberCount: teamMembers.length, teamMembers,
        sprintsPerPi, sprintDur, workDaysPerSprint,
        baseCapacity, absenceDays, netCapacity,
        absencesInPi, piStart, piEnd,
    };
}

/** Texte tooltip multi-lignes pour la carte Prédictibilité. */
function _predictTooltip(p, team) {
    const lines = [];
    const teamLabel = team && team !== 'all' ? `équipe ${team}` : 'toutes équipes';
    lines.push(`Prédictibilité — ${teamLabel}`);
    lines.push('');
    lines.push(`📦 Livraison story points (PI précédents) :`);
    lines.push(`  • ${p.prev1Tag || 'PI-1'}: ${p.donePrev1} pts`);
    lines.push(`  • ${p.prev2Tag || 'PI-2'}: ${p.donePrev2} pts`);
    lines.push(`  → Moyenne: ${p.avgDelivered} pts/PI`);
    lines.push('');
    lines.push(`👥 Capacité PI courant :`);
    lines.push(`  • ${p.teamMemberCount} membre${p.teamMemberCount > 1 ? 's' : ''} × ${p.sprintsPerPi} sprints × ${p.workDaysPerSprint} jours ouvrés`);
    lines.push(`  • Brut: ${p.baseCapacity} j-h`);
    if (p.absenceDays > 0) {
        lines.push(`  • Absences planifiées: -${p.absenceDays} j`);
    }
    lines.push(`  → Net: ${p.netCapacity} j-h disponibles`);
    if (p.baseCapacity > 0 && p.avgDelivered > 0) {
        const ptsPerDay = (p.avgDelivered / p.netCapacity).toFixed(2);
        lines.push('');
        lines.push(`⚡ Vélocité observée: ${ptsPerDay} pts/jour-homme`);
    }
    return lines.join('\n');
}

/**
 * Drag-and-drop pour réordonner des features.
 * Items avec data-proxy="1" (proxy-epic dans la vue PI suivant) ne sont pas draggables
 * — l'API /api/features/rank n'accepte que des feature IDs, pas des epic IDs.
 */
function _wireFeatureDrag(container, listSelector, itemSelector) {
    const list = container.querySelector(listSelector);
    if (!list) return;
    let _src = null;
    list.addEventListener('dragstart', e => {
        const item = e.target.closest(itemSelector);
        if (!item || item.dataset.proxy === '1') { e.preventDefault(); return; }
        _src = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    list.addEventListener('dragend', () => {
        _src?.classList.remove('dragging');
        list.querySelectorAll('.drop-over').forEach(el => el.classList.remove('drop-over'));
        _src = null;
    });
    list.addEventListener('dragover', e => {
        if (!_src) return;
        e.preventDefault();
        const item = e.target.closest(itemSelector);
        if (item && item !== _src && item.dataset.proxy !== '1') {
            list.querySelectorAll('.drop-over').forEach(el => el.classList.remove('drop-over'));
            item.classList.add('drop-over');
        }
    });
    list.addEventListener('drop', async e => {
        e.preventDefault();
        if (!_src) return;
        const target = e.target.closest(itemSelector);
        if (!target || target === _src) return;
        const items = [...list.querySelectorAll(itemSelector)];
        const srcIdx = items.indexOf(_src);
        const tgtIdx = items.indexOf(target);
        if (srcIdx < tgtIdx) target.after(_src);
        else target.before(_src);
        target.classList.remove('drop-over');
        // Compute new order excluding proxy items; rank sequentially 0,1,2…
        let r = 0;
        const newOrder = [...list.querySelectorAll(itemSelector)]
            .filter(el => el.dataset.proxy !== '1' && el.dataset.featureId)
            .map(el => ({ id: el.dataset.featureId, rank: r++ }));
        try {
            await api.rankFeatures(newOrder);
            const updated = (store.get('features') || []).map(f => {
                const entry = newOrder.find(e => e.id === f.id);
                return entry ? { ...f, rank: entry.rank } : f;
            });
            store.set('features', updated);
        } catch (err) { toast(err.message, 'error'); }
    });
}

function _buildDiag(features, allTickets, nextPiTag, filteredCount = null, inheritedCount = 0) {
    if (!nextPiTag) return null;
    const ticketsNextPi = allTickets.filter(t => t.piSprint === nextPiTag);
    const typeCounts = ticketsNextPi.reduce((acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
    }, {});
    const featsNextPi = features.filter(f => f.piSprint === nextPiTag);
    const teamCounts = featsNextPi.reduce((acc, f) => {
        const k = f.team || '— (aucune)';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
    return {
        totalFeatures:          features.length,
        featuresNextPi:         featsNextPi.length,
        featuresNextPiFiltered: filteredCount,
        featuresInherited:      inheritedCount,
        featuresNullPi:         features.filter(f => !f.piSprint).length,
        piValues:               [...new Set(features.map(f => f.piSprint).filter(Boolean))].sort(),
        ticketsNextPi:          ticketsNextPi.length,
        ticketTypesNextPi:      Object.entries(typeCounts),
        teamDistribution:       Object.entries(teamCounts).sort((a, b) => b[1] - a[1]),
    };
}

// ── Current PI section HTML ───────────────────────────────────────────────────
function _currentPiSectionHtml(featureData, noEpicTickets, noPointsTickets, noPriorityTickets, teamAlloc, totalPts, velocityHistory) {
    const noEpic = noEpicTickets.length;
    const noPoints = noPointsTickets.length;
    const noPriority = noPriorityTickets.length;
    // Dépendances réelles (liens JIRA bloquants) entre les features du PI — out-degree par feature.
    const _depEdges = extractDependencyEdges(featureData);
    const _depOut = {};
    _depEdges.forEach(e => { _depOut[e.from] = (_depOut[e.from] || 0) + 1; });
    const featuresMissingPts = featureData.filter(f => !f.pts).length;
    const missingPtsChip = featuresMissingPts
        ? `<span class="missing-pts-chip" title="Features sans story points, à chiffrer">⚠ ${featuresMissingPts} sans points</span>`
        : '';
    const featureRows = featureData.length
        ? featureData.map(f => `
            <div class="feature-row feature-draggable" draggable="true" data-feature-id="${esc(f.id)}" data-ticket-id="${esc(f.id)}">
                <span class="drag-handle" title="Glisser">⠿</span>
                <span class="feature-id">${esc(f.id)}</span>
                <span class="feature-title truncate">${esc(f.title)}</span>
                ${typeBadge(f.type, { size: '2xs' })}
                ${(() => {
                    const s = f.rolledStatus || f.status;
                    const tip = f.rolledStatus && f.rolledStatus !== f.status
                        ? `Statut dérivé des ${f.childCount} enfants (JIRA propre: ${STATUS_LABELS[f.status] || f.status})`
                        : `Statut JIRA`;
                    return statusBadge({ status: s }, { label: STATUS_LABELS[s] || s, attrs: `title="${esc(tip)}"`, title: false });
                })()}
                <div class="feature-progress">
                    <div class="progress progress-xs"><div class="progress-bar ${progressColor(f.progress)}" style="width:${f.progress}%"></div></div>
                </div>
                <span class="text-xs${f.pts ? ' text-muted' : ' missing-pts-inline'}" title="${f.pts ? '' : 'Story points manquants sur cette feature'}">${f.donePts}/${f.pts} pts</span>
                <span class="feature-team">${esc(f.team || '-')}</span>
                ${_depOut[f.id] ? `<span class="dep-badge" title="Dépend de ${_depOut[f.id]} autre(s) feature(s) (liens JIRA bloquants)">⇒ ${_depOut[f.id]}</span>` : ''}
            </div>`).join('')
        : '<div class="empty-state"><p>Aucune feature</p></div>';

    // Liste dépliable des tickets concernés par un KPI de santé backlog — clic sur le KPI
    // pour dérouler, clic sur un ticket → modal (cohérent avec les autres listes de la page).
    const _healthTicketRows = (list) => list.map(t => `
        <div class="rm-health-ticket" data-ticket-id="${esc(t.id)}">
            <span class="npi-child-key">${esc(t.id)}</span>
            <span class="npi-child-title">${esc(t.title)}</span>
            <span class="npi-child-leader">${esc(t.leader || t.assignee || '—')}</span>
        </div>`).join('');

    const depGraphSection = _depEdges.length ? `
        <div class="pi-section">
            <h3 class="pi-section-title">Graphe de dépendances <span class="text-xs text-muted">(liens inter-équipes en rouge)</span></h3>
            <div class="card" style="overflow:auto">
                <svg id="dep-graph" class="dep-graph-svg"></svg>
            </div>
        </div>` : '';

    const teamRows = teamAlloc.map(t => `
        <tr class="rm-team-row" data-team-name="${esc(t.name)}" title="Filtrer sur ${esc(t.name)}">
            <td><span class="inline-flex-center"><span class="team-dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span></td>
            <td>${t.ticketCount}</td>
            <td>${t.pts}</td>
            <td>${t.featureCount}</td>
            <td>
                <div class="progress progress-inline"><div class="progress-bar" style="width:${pct(t.pts, totalPts)}%"></div></div>
            </td>
        </tr>`).join('');

    const velocitySection = velocityHistory.length ? `
        <div class="pi-section">
            <h3 class="pi-section-title">Historique de velocite</h3>
            <div class="card"><div class="chart-container chart-h-md"><canvas id="chart-rm-velocity"></canvas></div></div>
        </div>` : '';

    return `
        <!-- Backlog Health -->
        <div class="card mb-4" style="padding:var(--sp-3) var(--sp-4)">
            <div class="card-header" style="margin-bottom:var(--sp-2)"><span class="card-title">Sante du backlog</span></div>
            <div class="flex gap-4 flex-wrap">
                <button type="button" class="rm-health-kpi-btn" data-health-kpi="epic" ${noEpic ? '' : 'disabled'}>
                    <span class="health-kpi" style="color:${noEpic > 5 ? 'var(--danger)' : noEpic > 0 ? 'var(--warning)' : 'var(--success)'}">${noEpic}</span>
                    <span class="text-sm text-muted">sans epic</span>
                </button>
                <button type="button" class="rm-health-kpi-btn" data-health-kpi="points" ${noPoints ? '' : 'disabled'}>
                    <span class="health-kpi" style="color:${noPoints > 5 ? 'var(--danger)' : noPoints > 0 ? 'var(--warning)' : 'var(--success)'}">${noPoints}</span>
                    <span class="text-sm text-muted">sans estimation</span>
                </button>
                <button type="button" class="rm-health-kpi-btn" data-health-kpi="priority" ${noPriority ? '' : 'disabled'}>
                    <span class="health-kpi" style="color:${noPriority > 10 ? 'var(--warning)' : 'var(--text)'}">${noPriority}</span>
                    <span class="text-sm text-muted">priorite par defaut</span>
                </button>
            </div>
            <div class="rm-health-detail hidden" data-health-detail="epic">${_healthTicketRows(noEpicTickets)}</div>
            <div class="rm-health-detail hidden" data-health-detail="points">${_healthTicketRows(noPointsTickets)}</div>
            <div class="rm-health-detail hidden" data-health-detail="priority">${_healthTicketRows(noPriorityTickets)}</div>
        </div>

        <!-- Feature Timeline (draggable for ranking) -->
        <div class="pi-section">
            <div class="pi-section-hdr">
                <h3 class="pi-section-title">Features</h3>
                <div class="flex items-center gap-3">
                    <span class="text-xs text-muted">Glisser pour reordonner</span>
                    ${missingPtsChip}
                </div>
            </div>
            <div class="card card-flush" id="feature-drag-list">
                ${featureRows}
            </div>
        </div>

        ${depGraphSection}

        <!-- Team Allocation -->
        <div class="pi-section">
            <h3 class="pi-section-title">Allocation par equipe</h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Equipe</th><th>Tickets</th><th>Points</th><th>Features</th><th>Charge</th></tr></thead>
                    <tbody>${teamRows}</tbody>
                </table>
            </div>
        </div>

        ${velocitySection}`;
}

// ── Timeline multi-PI (vue long terme #27) ────────────────────────────────────
/**
 * Survol horizontal des PI (centre = PI courant réel `basePi`, ±2). Chaque colonne liste
 * les features de ce PI ; un clic sur l'en-tête sélectionne le PI (pilote `piOffset` → le
 * détail mono-PI sous la timeline s'actualise), un clic sur une carte ouvre la feature.
 */
function _multiPiTimelineHtml(features, basePi, piOffset, teamObjects) {
    if (!basePi) return '';
    const range = [-2, -1, 0, 1, 2].map(o => basePi + o).filter(n => n >= 1);
    const selectedPi = Math.max(1, basePi + (piOffset || 0));
    const _featPi = f => extractPiNum(f.piSprint) || extractPiNum(f.sprintName)
        || (f.labels || []).reduce((acc, l) => acc || extractPiNum(l), 0);
    const byPi = new Map(range.map(n => [n, []]));
    for (const f of features) {
        const n = _featPi(f);
        if (byPi.has(n)) byPi.get(n).push(f);
    }
    const tcol = t => teamObjects.find(o => o.name === t)?.color || 'var(--text-muted)';

    const cols = range.map(n => {
        const list = (byPi.get(n) || []).sort((a, b) => (a.rank || 0) - (b.rank || 0));
        const isCurrent = n === basePi;
        const isSelected = n === selectedPi;
        // Etat temporel de la colonne — même code couleur que pi-sprint-card (support.js/dashboard.js) :
        // passé = success/vert, courant = primary, futur = muted.
        const temporalState = isCurrent ? 'current' : (n < basePi ? 'past' : 'future');
        const done = list.filter(f => f.status === 'done').length;
        const pts = sumBy(list, f => f.points);
        const cards = list.length
            ? list.slice(0, 40).map(f => `
                <button class="rm-tl-card" data-feature-id="${esc(f.id)}" style="--tcol:${esc(tcol(f.team))}" title="${esc(f.title || '')}${f.team ? ' · ' + esc(f.team) : ''}">
                    <span class="rm-tl-card-id">${esc(f.id)}</span>
                    <span class="rm-tl-card-title">${esc((f.title || '').slice(0, 48))}</span>
                    <div class="rm-tl-card-foot">
                        ${typeBadge(f.type, { size: '2xs' })}
                        <span class="badge badge-${esc(f.status)} badge-sm">${esc(STATUS_LABELS[f.status] || f.status)}</span>
                    </div>
                </button>`).join('')
                + (list.length > 40 ? `<div class="rm-tl-more">+${list.length - 40} autres…</div>` : '')
            : '<div class="rm-tl-empty">Aucune feature</div>';
        return `
        <div class="rm-tl-col rm-tl-col--${temporalState}${isSelected ? ' rm-tl-col--selected' : ''}">
            <button class="rm-tl-hd" data-pi-offset="${n - basePi}" title="Voir le détail de PI${n} ci-dessous">
                <span class="rm-tl-hd-state rm-tl-hd-state--${temporalState}">${temporalState === 'past' ? '✓ passé' : temporalState === 'current' ? '● courant' : '○ futur'}</span>
                <span class="rm-tl-hd-pi">PI${n}</span>
                <span class="rm-tl-hd-count">${list.length} feat.${done ? ` · ${done} ✓` : ''}${pts ? ` · ${pts} pts` : ''}</span>
            </button>
            <div class="rm-tl-cards">${cards}</div>
        </div>`;
    }).join('');

    return `
        <div class="pi-section rm-timeline-section">
            <div class="pi-section-hdr">
                <h3 class="pi-section-title">Timeline multi-PI</h3>
                <span class="text-xs text-muted">Vue long terme — cliquez un PI pour afficher son détail ci-dessous</span>
            </div>
            <div class="rm-timeline">${cols}</div>
        </div>`;
}

// Graphe de dépendances : composant partagé components/dep_graph.js (renderItemDepGraph).
