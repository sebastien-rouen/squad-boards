/**
 * Roadmap view - feature timeline, velocity breakdown, backlog health, team allocation,
 * drag-and-drop ranking, dependency graph.
 */

import { store } from '../state.js';
import { esc, pct, progressColor, filterByTeam, groupBy, sumBy, deriveMembersFromAbsences, rollupStatus, computeVelocityHistory } from '../utils.js';
import { STATUS_LABELS, TEAM_COLORS } from '../config.js';
import { renderVelocityChart } from '../components/charts.js';
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
    // Fallback : si piInfo.number n'est pas configuré dans Settings, on déduit
    // depuis le nom du sprint actif (ex: "Fuego - Ite 29.3" → 29)
    const _sprintInfo = store.get('sprintInfo');
    const _extractPiNum = (name) => {
        if (!name) return 0;
        const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    const _basePi = _extractPiNum(_sprintInfo?.name) || piInfo?.number || 0;
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
    // Tolérance large : `PI#29`, `PI29`, `pi 29`, `29` (dans un label PI-prefix), case-insensitive, espaces ignorés.
    const _normPi = (v) => v == null ? '' : String(v).toUpperCase().replace(/\s+/g, '');
    const _matchPi = (raw) => {
        if (!raw || !currentPiTag) return false;
        const s = _normPi(raw);
        if (s === _normPi(currentPiTag)) return true;
        if (s === `PI${currentPiNum}`) return true;
        // Sprint nommé "29.1" / "29.3" → match PI 29
        const m = s.match(/^(\d+)\.\d+$/);
        return !!(m && parseInt(m[1], 10) === currentPiNum);
    };
    const _matchFeaturePi = (f) => {
        if (_matchPi(f.piSprint)) return true;
        if (_matchPi(f.sprintName)) return true;  // au cas où piSprint serait null mais sprintName présent
        if (Array.isArray(f.labels)) {
            for (const lbl of f.labels) if (_matchPi(lbl)) return true;
        }
        return false;
    };
    const piFilteredFeatures = features.filter(_matchFeaturePi);

    // Diagnostic (visible en console) — utile quand l'utilisateur ne voit pas de features
    if (currentPiTag && features.length > 0) {
        const _byPi = {};
        for (const f of features) {
            const k = f.piSprint || '(null)';
            _byPi[k] = (_byPi[k] || 0) + 1;
        }
        console.log(`[Roadmap] Filtre PI ${currentPiTag} (team=${team || 'all'}) : ${piFilteredFeatures.length}/${features.length} features`, _byPi);
    }

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

    // Velocity breakdown (80/20)
    const totalPts = sumBy(tickets, t => t.points);
    const donePts = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const bufferTickets = tickets.filter(t => (t.labels || []).some(l => l.toLowerCase().includes('buffer')));
    const bufferPts = sumBy(bufferTickets, t => t.points);
    const featurePts = totalPts - bufferPts;

    // Prédictibilité — moyenne livraison 2 derniers PI + capacité brute/nette pour le PI courant.
    // Membres dérivés des absences (CSV RH = source de vérité), pas de la table members (artefacts JIRA).
    const absences = store.get('absences') || [];
    const members  = deriveMembersFromAbsences(absences, store.get('members') || []);
    const sprintInfo = store.get('sprintInfo');
    const predict = _computePredictability(allTickets, members, absences, piInfo, sprintInfo, team);

    // Backlog health KPIs
    const noEpic = tickets.filter(t => !t.epic && t.status !== 'done').length;
    const noPoints = tickets.filter(t => !t.points && t.status !== 'done').length;
    const noPriority = tickets.filter(t => (!t.priority || t.priority === 'medium') && t.status !== 'done').length;

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

        ${isNextPi
            ? _nextPiSectionHtml(nextPiFeatureData, nextPiTag, nextPiLabel, _buildDiag(allFeatures, allTickets, nextPiTag, nextPiFeatureData.length, nextPiFeatureData.filter(f => f._piInherited).length), viewMode, allTickets, epics, teamObjects, store.get('jiraUrl') || null)
            : _currentPiSectionHtml(featureData, noEpic, noPoints, noPriority, teamAlloc, totalPts, velocityHistory)
        }
    `;

    // ── Sub-view toggle (Cartes / Liste) — au sein de la section "PI suivant" ──
    container.querySelectorAll('[data-npi-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            store.set('roadmapTab', btn.dataset.npiView);
            window.__squadBoard?.pushHash?.();
            renderRoadmap(container);
        });
    });

    if (isNextPi) {
        if (viewMode === 'next-list') {
            // List view: expand/collapse feature accordions (skip clic sur drag-handle)
            container.querySelectorAll('.npi-feat-hd').forEach(hd => {
                hd.addEventListener('click', e => {
                    if (e.target.closest('.drag-handle')) return;
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
            // Card view: card click → modal (skip clic sur drag-handle)
            container.querySelectorAll('.next-pi-card').forEach(el => {
                el.addEventListener('click', e => {
                    if (e.target.closest('.drag-handle')) return;
                    window.__squadBoard?.openTicketModal?.(el.dataset.featureId);
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

    // ── Drag & drop ranking (factorisé pour PI courant + PI suivant cartes + liste) ─
    _wireFeatureDrag(container, '#feature-drag-list', '.feature-draggable');
    _wireFeatureDrag(container, '.next-pi-grid',     '.next-pi-card');
    _wireFeatureDrag(container, '.npi-list',         '.npi-feat');

    // ── Dependency graph + velocity chart ─────────────────────────────────────
    requestAnimationFrame(() => {
        const svg = container.querySelector('#dep-graph');
        if (svg) _renderDepGraph(svg, featureData);
        if (velocityHistory.length) renderVelocityChart('chart-rm-velocity', velocityHistory);
    });
}

// ── Next PI section HTML ──────────────────────────────────────────────────────
function _nextPiSectionHtml(features, piTag, piLabel, diag, viewMode, allTickets, epics, teamObjects, jiraUrl = null) {
    const heading   = esc(piTag || piLabel);
    const count     = features.length;
    const countLabel = `${count} feature${count !== 1 ? 's' : ''} planifie${count !== 1 ? 'es' : 'e'}`;
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

    const diagHtml = diag ? `
        <details class="next-pi-diag mt-3">
            <summary>Diagnostic base de donnees</summary>
            <div class="next-pi-diag-body">
                <div class="next-pi-diag-row">
                    <span>Features en base (total)</span><strong>${diag.totalFeatures}</strong>
                </div>
                <div class="next-pi-diag-row ${diag.featuresNextPi === 0 ? 'diag-warn' : 'diag-ok'}">
                    <span>Features avec piSprint = <code>${esc(piTag || '?')}</code> (total base)</span><strong>${diag.featuresNextPi}</strong>
                </div>
                ${diag.featuresNextPiFiltered !== null ? `
                <div class="next-pi-diag-row ${diag.featuresNextPiFiltered === 0 && diag.featuresNextPi > 0 ? 'diag-warn' : ''}">
                    <span>Features visibles (après filtre équipe)</span><strong>${diag.featuresNextPiFiltered}</strong>
                </div>` : ''}
                ${diag.featuresInherited > 0 ? `
                <div class="next-pi-diag-row diag-ok">
                    <span>dont features héritées (children en <code>${esc(piTag || '?')}</code>)</span><strong>${diag.featuresInherited}</strong>
                </div>` : ''}
                ${diag.teamDistribution.length ? `
                <div class="next-pi-diag-row ${diag.featuresNextPiFiltered === 0 && diag.featuresNextPi > 0 ? 'diag-warn' : ''}">
                    <span>Equipes des features ${esc(piTag || '')} (champ <code>team</code>)</span>
                    <strong>${diag.teamDistribution.map(([t, n]) => `<code>${esc(t)}</code> (${n})`).join(' ')}</strong>
                </div>` : ''}
                <div class="next-pi-diag-row ${diag.featuresNullPi > 0 ? 'diag-warn' : ''}">
                    <span>Features sans piSprint (null)</span><strong>${diag.featuresNullPi}</strong>
                </div>
                <div class="next-pi-diag-row">
                    <span>PI values distinctes</span>
                    <strong>${diag.piValues.length ? diag.piValues.map(v => `<code>${esc(v)}</code>`).join(' ') : '—'}</strong>
                </div>
                <div class="next-pi-diag-row">
                    <span>Tickets avec piSprint = <code>${esc(piTag || '?')}</code></span><strong>${diag.ticketsNextPi}</strong>
                </div>
                ${diag.ticketTypesNextPi.length ? `<div class="next-pi-diag-row">
                    <span>Types</span>
                    <strong>${diag.ticketTypesNextPi.map(([t, n]) => `${esc(t)}: ${n}`).join(', ')}</strong>
                </div>` : ''}
                <div class="next-pi-diag-hint">Si "Features sans piSprint" est eleve, verifiez le champ Sprint dans Parametres → Plugin JIRA.</div>
            </div>
        </details>` : '';

    const cardsHtml = features.map(f => {
        const ptsPct = f.ptsPct || 0;
        return `
        <div class="next-pi-card${f._piInherited ? ' next-pi-card-inherited' : ''}${f._piProxy ? ' next-pi-card-proxy' : ''}"
             data-feature-id="${esc(f.id)}"${f._piProxy ? ' data-proxy="1"' : ' draggable="true"'}>
            <div class="next-pi-card-hd">
                ${!f._piProxy ? '<span class="drag-handle" title="Glisser pour réordonner">⠿</span>' : ''}
                <span class="next-pi-badge">${esc(f.piSprint || piTag || piLabel)}</span>
                ${(() => {
                    const s = f.rolledStatus || f.status;
                    const tip = f.rolledStatus && f.rolledStatus !== f.status
                        ? `Statut dérivé des ${f.childCount} enfants (JIRA propre: ${STATUS_LABELS[f.status] || f.status})`
                        : `Statut JIRA`;
                    return `<span class="badge badge-${esc(s)}" title="${esc(tip)}">${esc(STATUS_LABELS[s] || s)}</span>`;
                })()}
                ${f._piInherited ? `<span class="badge badge-inherited" title="Cette feature est etiquetee ${esc(f.piSprint || '')} mais a des tickets en ${esc(piTag || '')}">héritée</span>` : ''}
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
        </div>`;
    }).join('');

    const teamFilterActive = diag && diag.featuresNextPiFiltered === 0 && diag.featuresNextPi > 0;
    const body = count
        ? (isListView
            ? _nextPiListHtml(features, allTickets, epics, teamObjects, piTag, jiraUrl)
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

    return `
        <div class="pi-section">
            <div class="pi-section-hdr">
                <h3 class="pi-section-title">Features ${heading}</h3>
                <div class="flex items-center gap-3">
                    ${subToggle}
                    <span class="text-xs text-muted">${countLabel}</span>
                </div>
            </div>
            ${body}
            ${diagHtml}
        </div>`;
}

// ── Next PI list view HTML ────────────────────────────────────────────────────
function _nextPiListHtml(features, allTickets, epics, teamObjects, piTag, jiraUrl = null) {
    const STATUS_DOT_COLORS = {
        done:   'var(--success)',
        inprog: 'var(--primary)',
        review: '#f59e0b',
        test:   '#06b6d4',
        blocked:'var(--danger)',
        todo:   'var(--border)',
    };
    const TYPE_ICONS = { bug: '🐛', task: '✦', story: '◈', feature: '★', epic: '⬡' };

    const rows = features.map(f => {
        const tObj = teamObjects.find(t => t.name === f.team);
        const teamColor = tObj?.color || 'var(--text-muted)';
        const ptsPct = f.ptsPct || 0;

        // Children = tickets ENFANTS de cette feature/epic dans le PI cible.
        // - Proxy-epic (f est un epic) : tickets directement parentés à f.id
        // - Feature normale : tickets via la chaîne epic → feature, avec fallback direct
        //   (cas où le ticket pointe directement la feature sans passer par un epic)
        let children;
        if (f._piProxy === 'epic') {
            children = allTickets.filter(t => t.piSprint === piTag && t.epic === f.id);
        } else {
            const featEpics = epics.filter(e => e.feature === f.id);
            children = allTickets.filter(t =>
                t.piSprint === piTag && t.epic && featEpics.some(e => e.id === t.epic)
            );
            if (!children.length) {
                // Cas où certaines équipes parente directement le ticket à la feature
                children = allTickets.filter(t => t.piSprint === piTag && t.epic === f.id);
            }
        }
        const childCount = children.length;

        const childRows = children.map(t => {
            const dotColor = STATUS_DOT_COLORS[t.status] || STATUS_DOT_COLORS.todo;
            const typeIcon = TYPE_ICONS[t.type] || '✦';
            const pts = t.points ? `${t.points} pt${t.points > 1 ? 's' : ''}` : '—';
            return `
            <div class="npi-child" data-ticket-id="${esc(t.id)}">
                <span class="npi-status-dot" style="background:${dotColor}"></span>
                <span class="npi-child-type" title="${esc(t.type)}">${typeIcon}</span>
                <span class="npi-child-key">${esc(t.id)}</span>
                <span class="npi-child-title">${esc(t.title)}</span>
                <span class="npi-child-leader">${esc(t.leader || '—')}</span>
                <span class="npi-child-pts">${pts}</span>
            </div>`;
        }).join('');

        return `
        <div class="npi-feat${f._piInherited ? ' npi-feat-inherited' : ''}${f._piProxy ? ' npi-feat-proxy' : ''}"
             style="--npi-team-color:${teamColor}"
             data-feature-id="${esc(f.id)}"${f._piProxy ? ' data-proxy="1"' : ' draggable="true"'}>
            <div class="npi-feat-hd">
                <svg class="npi-chevron icon icon-xs"><use href="#i-chevron-right"/></svg>
                ${!f._piProxy ? '<span class="drag-handle" title="Glisser pour réordonner">⠿</span>' : ''}
                ${(() => {
                    const s = f.rolledStatus || f.status;
                    const tip = f.rolledStatus && f.rolledStatus !== f.status
                        ? `Statut dérivé des ${f.childCount} enfants (JIRA propre: ${STATUS_LABELS[f.status] || f.status})`
                        : `Statut JIRA`;
                    return `<span class="badge badge-${esc(s)} badge-sm" title="${esc(tip)}">${esc(STATUS_LABELS[s] || s)}</span>`;
                })()}
                ${f._piInherited ? `<span class="badge badge-inherited badge-sm" title="Etiquetee ${esc(f.piSprint || '')} mais a des tickets en ${esc(piTag || '')}">héritée</span>` : ''}
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
            ${childCount ? `<div class="npi-children hidden">${childRows}</div>` : ''}
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
function _currentPiSectionHtml(featureData, noEpic, noPoints, noPriority, teamAlloc, totalPts, velocityHistory) {
    const featureRows = featureData.length
        ? featureData.map(f => `
            <div class="feature-row feature-draggable" draggable="true" data-feature-id="${esc(f.id)}" data-ticket-id="${esc(f.id)}">
                <span class="drag-handle" title="Glisser">⠿</span>
                <span class="feature-id">${esc(f.id)}</span>
                <span class="feature-title truncate">${esc(f.title)}</span>
                ${(() => {
                    const s = f.rolledStatus || f.status;
                    const tip = f.rolledStatus && f.rolledStatus !== f.status
                        ? `Statut dérivé des ${f.childCount} enfants (JIRA propre: ${STATUS_LABELS[f.status] || f.status})`
                        : `Statut JIRA`;
                    return `<span class="badge badge-${s} badge-status" title="${esc(tip)}">${esc(STATUS_LABELS[s] || s)}</span>`;
                })()}
                <div class="feature-progress">
                    <div class="progress progress-xs"><div class="progress-bar ${progressColor(f.progress)}" style="width:${f.progress}%"></div></div>
                </div>
                <span class="text-xs text-muted">${f.donePts}/${f.pts} pts</span>
                <span class="feature-team">${esc(f.team || '-')}</span>
                ${(f.dependencies || []).length ? `<span class="dep-badge" title="Dependances: ${esc((f.dependencies||[]).join(', '))}">⇒ ${(f.dependencies||[]).length}</span>` : ''}
            </div>`).join('')
        : '<div class="empty-state"><p>Aucune feature</p></div>';

    const depGraphSection = featureData.some(f => (f.dependencies || []).length > 0) ? `
        <div class="pi-section">
            <h3 class="pi-section-title">Graphe de dependances</h3>
            <div class="card" style="overflow:auto">
                <svg id="dep-graph" class="dep-graph-svg"></svg>
            </div>
        </div>` : '';

    const teamRows = teamAlloc.map(t => `
        <tr>
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
                <div class="flex items-center gap-2">
                    <span class="health-kpi" style="color:${noEpic > 5 ? 'var(--danger)' : noEpic > 0 ? 'var(--warning)' : 'var(--success)'}">${noEpic}</span>
                    <span class="text-sm text-muted">sans epic</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="health-kpi" style="color:${noPoints > 5 ? 'var(--danger)' : noPoints > 0 ? 'var(--warning)' : 'var(--success)'}">${noPoints}</span>
                    <span class="text-sm text-muted">sans estimation</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="health-kpi" style="color:${noPriority > 10 ? 'var(--warning)' : 'var(--text)'}">${noPriority}</span>
                    <span class="text-sm text-muted">priorite par defaut</span>
                </div>
            </div>
        </div>

        <!-- Feature Timeline (draggable for ranking) -->
        <div class="pi-section">
            <div class="pi-section-hdr">
                <h3 class="pi-section-title">Features</h3>
                <span class="text-xs text-muted">Glisser pour reordonner</span>
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

// ── Dependency graph SVG ──────────────────────────────────────────────────────
function _renderDepGraph(svg, features) {
    const withDeps = features.filter(f => (f.dependencies || []).length > 0);
    const mentioned = new Set([...withDeps.map(f => f.id), ...withDeps.flatMap(f => f.dependencies || [])]);
    const nodes = features.filter(f => mentioned.has(f.id));
    if (!nodes.length) return;

    const W = 160, H = 48, PAD = 24, GAPX = 60, GAPY = 16;
    const cols = {};
    nodes.forEach(f => {
        const col = f.piSprint || 'no-sprint';
        if (!cols[col]) cols[col] = [];
        cols[col].push(f);
    });
    const colKeys = Object.keys(cols).sort();
    const positions = {};
    let cx = PAD;
    for (const col of colKeys) {
        let cy = PAD;
        for (const f of cols[col]) {
            positions[f.id] = { x: cx, y: cy };
            cy += H + GAPY;
        }
        cx += W + GAPX;
    }
    const totalW = cx + PAD;
    const totalH = Math.max(...Object.values(positions).map(p => p.y + H)) + PAD;
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);
    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

    let html = '<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--primary)"/></marker></defs>';
    for (const f of withDeps) {
        const from = positions[f.id];
        if (!from) continue;
        for (const depId of (f.dependencies || [])) {
            const to = positions[depId];
            if (!to) continue;
            const x1 = from.x + W, y1 = from.y + H / 2;
            const x2 = to.x, y2 = to.y + H / 2;
            const mx = (x1 + x2) / 2;
            html += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="var(--primary)" stroke-width="1.5" marker-end="url(#arrowhead)" opacity="0.7"/>`;
        }
    }
    for (const f of nodes) {
        const { x, y } = positions[f.id];
        const hasDeps = withDeps.some(fd => fd.id === f.id);
        html += `<g class="dep-node" data-feature-id="${esc(f.id)}">
            <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" fill="${hasDeps ? 'var(--primary-bg)' : 'var(--card-bg)'}" stroke="var(--primary)" stroke-width="${hasDeps ? 2 : 1}" opacity="0.9"/>
            <text x="${x + W/2}" y="${y + 16}" text-anchor="middle" font-size="10" fill="var(--text)" font-weight="600" class="dep-node-id">${esc(f.id)}</text>
            <text x="${x + W/2}" y="${y + 32}" text-anchor="middle" font-size="9" fill="var(--text-muted)" class="dep-node-title">${esc(f.title.slice(0, 22))}${f.title.length > 22 ? '…' : ''}</text>
        </g>`;
    }
    svg.innerHTML = html;

    svg.querySelectorAll('.dep-node').forEach(node => {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(node.dataset.featureId));
    });
}
