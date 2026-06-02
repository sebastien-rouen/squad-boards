/**
 * PI Planning view - tabs: Objectifs, Features, Capacite, ROAM, Equipes.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, pct, progressColor, filterByTeam, groupBy, sumBy, toast, deriveMembersFromAbsences, rollupStatus, buildSupportPiWeeks, getSupportWeekMode, isMemberSupportActive } from '../utils.js';
import { STATUS_LABELS, TEAM_COLORS } from '../config.js';
import { buildMoodSlackRaw, buildFistSlackRaw } from '../components/sondage.js';

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
    const basePiNum  = piInfo?.number || _extractPi(sprintInfo?.name) || 0;
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
    const _ticketInPi = (t) => _inPi(t.piSprint) || _inPi(t.sprintName) ||
        (t.labels || []).some(l => _inPi(l));
    const _featureInPi = (f) => _inPi(f.piSprint) || _inPi(f.sprintName) ||
        (f.labels || []).some(l => _inPi(l));

    // Filtre par équipe puis par PI
    const allTeamTickets   = filterByTeam(store.get('tickets') || [], team);
    const allTeamFeatures  = filterByTeam(store.get('features') || [], team);
    const tickets  = piTag ? allTeamTickets.filter(_ticketInPi)  : allTeamTickets;
    const features = piTag ? allTeamFeatures.filter(_featureInPi) : allTeamFeatures;

    // Label et objectifs du PI sélectionné
    // Les objectifs sont stockés dans piInfo (PI courant) — si on affiche un autre PI, on le signale
    const isCurrentPi = piOffset === 0;
    const piLabel = piNum
        ? (isCurrentPi ? (piInfo?.name || `PI#${piNum}`) : `PI#${piNum}`)
        : 'PI en cours';
    const objectives = isCurrentPi ? (piInfo?.objectives || []) : [];

    // Buffer & Velocity metrics
    const _isBuf     = t => (t.labels || []).some(l => /buffer/i.test(l));
    const bufTickets = tickets.filter(_isBuf);
    const totalPts   = sumBy(tickets, t => t.points || 0);
    const donePts    = sumBy(tickets.filter(t => t.status === 'done'), t => t.points || 0);
    const bufPts     = sumBy(bufTickets, t => t.points || 0);
    const bufDonePts = sumBy(bufTickets.filter(t => t.status === 'done'), t => t.points || 0);
    const velPts     = totalPts - bufPts;
    const velDonePts = donePts - bufDonePts;
    const velRatio   = velPts ? pct(velDonePts, velPts) : 0;
    const bufRatio   = bufPts ? pct(bufDonePts, bufPts) : 0;

    const _stC = { done:'var(--success)', inprog:'var(--primary)', review:'#6366f1', test:'var(--warning)', blocked:'var(--danger)', todo:'var(--text-muted)' };
    const _stI = { done:'✓', inprog:'●', review:'◑', test:'◕', blocked:'✗', todo:'○' };
    const _stL = { done:'Terminé', inprog:'En cours', review:'Review', test:'Test', blocked:'Bloqué', todo:'À faire' };
    const nonBufTickets = tickets.filter(t => !_isBuf(t));
    const velRows = ['done','inprog','review','test','blocked','todo']
        .map(s => ({ s, pts: sumBy(nonBufTickets.filter(t => t.status === s), t => t.points || 0), count: nonBufTickets.filter(t => t.status === s).length }))
        .filter(x => x.count > 0);

    // Feature progress + statut dérivé depuis les enfants (avancée réelle)
    const featureList = features.map(f => {
        const children = tickets.filter(t => t.epic && epics.find(e => e.id === t.epic && e.feature === f.id));
        const all = children.length ? children : tickets.filter(t => t.team === f.team);
        const total = all.length || 1;
        const done = all.filter(t => t.status === 'done').length;
        const rolledStatus = rollupStatus(children, f.status);
        const childPts = sumBy(children, t => t.points || 0);
        const childPtsDone = sumBy(children.filter(t => t.status === 'done'), t => t.points || 0);
        return { ...f, progress: pct(done, total), childCount: children.length, allCount: all.length, rolledStatus, childPts, childPtsDone };
    });

    // Team capacity — membres dérivés des absences (source de vérité CSV RH)
    const effectiveMembers = deriveMembersFromAbsences(absences, store.get('members') || []);
    const teamCap = teams.map((t, i) => {
        const tObj = teamObjects.find(o => o.name === t);
        const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];
        // Filtre par équipe ET par PI sélectionné
        const tt = (piTag
            ? filterByTeam(store.get('tickets') || [], t).filter(_ticketInPi)
            : filterByTeam(store.get('tickets') || [], t));
        const total = tt.length;
        const done = tt.filter(x => x.status === 'done').length;
        const pts = sumBy(tt, x => x.points);
        const donePts = sumBy(tt.filter(x => x.status === 'done'), x => x.points);
        const members = effectiveMembers.filter(m => m.team === t);
        const teamAbsences = absences.filter(a => a.team === t);
        const absDays = teamAbsences.reduce((s, a) => s + (a.days || 0), 0);
        return { name: t, color, total, done, pts, donePts, memberCount: members.length, absDays };
    });

    // Capacité nette estimée par équipe sur le PI entier (pour la ligne séparatrice dans Features)
    const sprintInfo2  = store.get('sprintInfo');
    const allTeamSprints = sprintInfo2?.teamSprints || [];
    const rolePctMap   = _capGetRolePct();
    const excludedRolesForCap = _capGetExcludedRoles();
    const historyMode2 = _capGetHistoryMode();
    const historyCount2 = _capGetHistoryCount();
    const sprintDur2   = piInfo?.sprintDuration || 14;
    const sprintCnt2   = piInfo?.sprintsPerPI   || 5;
    const absenceTeamNames2 = new Set(absences.map(a => a.team));
    const _absAlias2 = tn => absenceTeamNames2.has(tn) ? tn : (absenceTeamNames2.has('Team ' + tn) ? 'Team ' + tn : tn);
    const sprintWindows2 = _capSprintWindows({ ...piInfo, number: piNum, startDate: piOffset === 0 ? piInfo?.startDate : null }, allTeamSprints);

    const capByTeam = {};  // { teamName: { spNet, spEst, spBuf, color } }
    teams.forEach(teamName => {
        const tObj  = teamObjects.find(o => o.name === teamName);
        const color = tObj?.color || '#64748b';
        const absTeam = _absAlias2(teamName);
        const mems = effectiveMembers.filter(m => {
            if (m.team !== absTeam) return false;
            return !excludedRolesForCap.some(r => r.toLowerCase() === (m.role || '').toLowerCase());
        });
        const memberEtp = mems.reduce((s, m) => s + _capRolePct(m.role, rolePctMap) / 100, 0);
        if (memberEtp === 0) { capByTeam[teamName] = { spNet: 0, spEst: 0, spBuf: 0, color }; return; }
        const baseCapRaw = localStorage.getItem(`cap-base-${piNum}-${teamName}`);
        const baseCapacity = baseCapRaw && baseCapRaw !== '' ? parseInt(baseCapRaw, 10) : null;
        const avgVel = _capAvgVelocity(allTeamSprints, teamName, piNum, historyMode2, historyCount2);
        const capMult = (baseCapacity !== null && baseCapacity > 0) ? baseCapacity : avgVel;
        let totalSpEst = 0;
        for (let idx = 0; idx < sprintCnt2; idx++) {
            const win = sprintWindows2?.[idx] || null;
            const totalDays = memberEtp * sprintDur2;
            const absDays = win
                ? Math.round(mems.reduce((s, m) => {
                    const pct2 = _capRolePct(m.role, rolePctMap) / 100;
                    if (pct2 === 0) return s;
                    const raw = _capAbsDaysInWindow(absences.filter(a => a.memberName === m.name), absTeam, win.from, win.to);
                    return s + raw * pct2;
                }, 0) * 10) / 10
                : 0;
            const availPct = totalDays > 0 ? Math.round(((totalDays - absDays) / totalDays) * 100) : 100;
            totalSpEst += Math.ceil(capMult * (availPct / 100));
        }
        const spBuf = Math.round(totalSpEst * 0.2);
        capByTeam[teamName] = { spEst: totalSpEst, spBuf, spNet: totalSpEst - spBuf, color };
    });

    // Objectifs filtrés par équipe pour le compteur du tab
    const objectivesFiltered = (!team || team === 'all')
        ? objectives
        : objectives.filter(o => (o.team || '') === team);

    const tabs = [
        { id: 'objectives', label: `Objectifs (${objectivesFiltered.length})` },
        { id: 'features', label: `Features (${features.length})` },
        { id: 'capacity', label: 'Capacité' },
        { id: 'burnup', label: '📈 Burnup' },
        { id: 'teams', label: 'Équipes' },
        { id: 'support', label: '🛡️ Support' },
        { id: 'mood', label: 'Mood / ROTI' },
        { id: 'fist', label: 'Fist of Five' },
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
        </div>

        <!-- PI Metrics -->
        <div class="pi-overview mb-4">
            <div class="metric-card mc-primary">
                <span class="metric-icon">📦</span>
                <span class="metric-label">Features</span>
                <span class="metric-value">${features.length}</span>
                <span class="metric-sub">${features.filter(f => f.status === 'done').length} terminees</span>
            </div>
            <div class="metric-card mc-info">
                <span class="metric-icon">🏗️</span>
                <span class="metric-label">Epics</span>
                <span class="metric-value">${piEpics.length}</span>
            </div>
            <div class="metric-card ${objectivesFiltered.filter(o => o.status === 'done').length === objectivesFiltered.length && objectivesFiltered.length ? 'mc-done' : 'mc-warning'}">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Objectifs</span>
                <span class="metric-value">${objectivesFiltered.length}</span>
                <span class="metric-sub">${objectivesFiltered.filter(o => o.status === 'done').length} atteints</span>
            </div>
            <div class="metric-card mc-inprog">
                <span class="metric-label">Equipes</span>
                <span class="metric-value">${teams.length}</span>
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
    container.querySelector('#pi-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('.tab');
        if (!btn) return;
        _activeTab = btn.dataset.tab;
        store.set('piTab', _activeTab);
        window.__squadBoard?.pushHash?.();
        container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _activeTab));
        renderTabContent(container.querySelector('#pi-tab-content'), _activeTab, { objectives, featureList, teamCap, tickets, teams, teamObjects, piInfo, absences, epics: piEpics, isCurrentPi, piNum, capByTeam });
    });

    renderTabContent(container.querySelector('#pi-tab-content'), _activeTab, { objectives, featureList, teamCap, tickets, teams, teamObjects, piInfo, absences, epics: piEpics, isCurrentPi, piNum, capByTeam });
}

function renderTabContent(el, tab, data) {
    switch (tab) {
        case 'objectives': return renderObjectives(el, data);
        case 'features': return renderFeatures(el, data);
        case 'capacity': return renderCapacity(el, data);
        case 'burnup': return renderBurnup(el, data);
        case 'teams': return renderTeams(el, data);
        case 'support': return renderSupportRota(el, data);
        case 'mood': return renderMood(el, data);
        case 'fist': return renderFist(el, data);
    }
}

// ── Objectives tab ────────────────────────────────────────────────────────────
function renderObjectives(el, { objectives, piInfo, teams, teamObjects, isCurrentPi, piNum }) {
    const allTeams   = teams || store.get('teams') || [];
    const allTObjs   = teamObjects || store.get('teamObjects') || [];
    const team       = store.get('team');
    const showAll    = !team || team === 'all';
    const filtered   = showAll
        ? objectives
        : objectives.filter(o => (o.team || '') === team);

    const STATUS_OPT = [
        { v: 'todo',   l: 'À faire',  col: 'var(--status-todo)'   },
        { v: 'inprog', l: 'En cours', col: 'var(--status-inprog)' },
        { v: 'done',   l: 'Terminé',  col: 'var(--status-done)'   },
    ];

    function objRow(o, idx, isNew = false) {
        const st = STATUS_OPT.find(s => s.v === (o.status || 'todo')) || STATUS_OPT[0];
        const teamOpts = allTeams.map(t =>
            `<option value="${esc(t)}"${t === (o.team || team) ? ' selected' : ''}>${esc(t)}</option>`
        ).join('');
        return `
        <div class="pi-obj-row${isNew ? ' pi-obj-row--new' : ''}" data-obj-idx="${idx}">
            <span class="pi-obj-dot" style="background:${st.col}"></span>
            <input class="input pi-obj-text" placeholder="Objectif…" value="${esc(o.text || '')}">
            <select class="select pi-obj-team" style="min-width:110px">
                <option value="">- Équipe -</option>
                ${teamOpts}
            </select>
            <label class="pi-obj-bv-wrap" title="Business Value (0–10)">
                BV <input class="pi-obj-bv" type="number" min="0" max="10" value="${o.bv ?? ''}">
            </label>
            <label class="pi-obj-committed-wrap" title="Objectif commis (vs stretch)">
                <input type="checkbox" class="pi-obj-committed"${o.committed ? ' checked' : ''}> Commis
            </label>
            <select class="select pi-obj-status" style="min-width:100px">
                ${STATUS_OPT.map(s =>
                    `<option value="${s.v}"${s.v === (o.status || 'todo') ? ' selected' : ''}>${s.l}</option>`
                ).join('')}
            </select>
            <button class="btn-icon pi-obj-del" title="Supprimer">
                <svg class="icon icon-sm text-danger"><use href="#i-x"/></svg>
            </button>
        </div>`;
    }

    function listHtml() {
        if (!filtered.length) return `
            <div class="pi-obj-empty">
                <svg class="icon pi-obj-empty-icon"><use href="#i-check"/></svg>
                <p class="pi-obj-empty-title">Aucun objectif${!showAll ? ` pour ${esc(team)}` : ''}</p>
                <p class="pi-obj-empty-hint">Clique sur « + Ajouter un objectif » pour commencer</p>
            </div>`;

        if (!showAll) return filtered.map(o => objRow(o, objectives.indexOf(o))).join('');

        // Mode "toutes les équipes" → grouper par équipe
        const byTeam = new Map();
        for (const o of filtered) {
            const key = o.team || '';
            if (!byTeam.has(key)) byTeam.set(key, []);
            byTeam.get(key).push(o);
        }
        // Respecte l'ordre des équipes connues, met les sans-équipe en dernier
        const order = [...allTeams.filter(t => byTeam.has(t)), ...(byTeam.has('') ? [''] : [])];
        return order.map(key => {
            const objs  = byTeam.get(key) || [];
            const tObj  = allTObjs.find(o => o.name === key);
            const color = tObj?.color || 'var(--border)';
            const label = key ? esc(key) : '<em class="text-muted">Sans équipe</em>';
            return `
            <div class="pi-obj-group">
                <div class="pi-obj-group-header">
                    <span class="pi-obj-group-dot" style="background:${color}"></span>
                    <span class="pi-obj-group-name">${label}</span>
                    <span class="pi-obj-group-count">${objs.length}</span>
                </div>
                ${objs.map(o => objRow(o, objectives.indexOf(o))).join('')}
            </div>`;
        }).join('');
    }

    el.innerHTML = `
        ${isCurrentPi === false ? `<div class="pi-offset-notice">
            <svg class="icon icon-sm" style="color:var(--info)"><use href="#i-alert"/></svg>
            Objectifs du <strong>PI#${piNum}</strong> — lecture seule (les objectifs s'éditent uniquement sur le PI courant).
        </div>` : ''}
        <div class="pi-obj-toolbar">
            ${!showAll
                ? `<span class="chip" style="background:var(--primary-bg);color:var(--primary)">${esc(team)}</span>`
                : `<span class="text-sm text-muted">Toutes les équipes</span>`}
            ${isCurrentPi !== false ? `<button class="btn btn-primary btn-sm" id="pi-obj-save">Enregistrer</button>` : ''}
        </div>

        <div id="pi-obj-list">
            ${listHtml()}
        </div>

        <div class="pi-obj-add-row mt-3">
            <button class="btn btn-secondary btn-sm" id="pi-obj-add">+ Ajouter un objectif</button>
        </div>
    `;

    // ── Sync dot color on status change ───────────────────────────────────────
    function bindRow(row) {
        row.querySelector('.pi-obj-status')?.addEventListener('change', e => {
            const st = STATUS_OPT.find(s => s.v === e.target.value) || STATUS_OPT[0];
            row.querySelector('.pi-obj-dot').style.background = st.col;
        });
        row.querySelector('.pi-obj-del')?.addEventListener('click', () => row.remove());
    }
    el.querySelectorAll('.pi-obj-row').forEach(bindRow);

    // ── Ajouter une ligne vide ─────────────────────────────────────────────────
    el.querySelector('#pi-obj-add')?.addEventListener('click', () => {
        const list = el.querySelector('#pi-obj-list');
        const idx  = (store.get('piInfo')?.objectives || []).length + list.querySelectorAll('.pi-obj-row').length;
        const div  = document.createElement('div');
        div.innerHTML = objRow({ text: '', team: team !== 'all' ? team : '', status: 'todo' }, idx, true);
        const row = div.firstElementChild;
        list.appendChild(row);
        bindRow(row);
        row.querySelector('.pi-obj-text')?.focus();
    });

    // ── Enregistrer ───────────────────────────────────────────────────────────
    el.querySelector('#pi-obj-save')?.addEventListener('click', async () => {
        // Lire toutes les lignes visibles + lignes hors filtre (équipes différentes)
        const currentObjs = store.get('piInfo')?.objectives || [];
        const hiddenObjs  = (team && team !== 'all')
            ? currentObjs.filter(o => (o.team || '') !== team)
            : [];

        const rows = el.querySelectorAll('.pi-obj-row');
        const editedObjs = Array.from(rows).map(row => ({
            text:      row.querySelector('.pi-obj-text')?.value.trim() || '',
            team:      row.querySelector('.pi-obj-team')?.value || '',
            status:    row.querySelector('.pi-obj-status')?.value || 'todo',
            bv:        parseInt(row.querySelector('.pi-obj-bv')?.value) || 0,
            committed: row.querySelector('.pi-obj-committed')?.checked || false,
        })).filter(o => o.text);

        const newObjs = [...hiddenObjs, ...editedObjs];
        try {
            const current = store.get('piInfo') || {};
            const updated = await api.updatePI({ ...current, objectives: newObjs });
            store.set('piInfo', updated);
            toast(`${editedObjs.length} objectif(s) enregistré(s)`, 'success');
            renderObjectives(el, { objectives: updated.objectives || [], piInfo: updated, teams: allTeams });
        } catch (e) { toast(e.message, 'error'); }
    });
}

// ── Features tab ──────────────────────────────────────────────────────────────
function renderFeatures(el, { featureList, capByTeam = {} }) {
    if (!featureList.length) {
        el.innerHTML = '<div class="empty-state"><p>Aucune feature</p></div>';
        return;
    }

    // Groupe les features par équipe pour insérer les séparateurs de capacité
    const byTeam = new Map();
    for (const f of featureList) {
        const key = f.team || '—';
        if (!byTeam.has(key)) byTeam.set(key, []);
        byTeam.get(key).push(f);
    }

    // Couleurs statut
    const STATUS_COLOR = {
        done:   { bg: 'var(--status-done-bg,#dcfce7)',   text: 'var(--status-done,#16a34a)',   dot: '#16a34a' },
        inprog: { bg: 'var(--status-inprog-bg,#dbeafe)', text: 'var(--status-inprog,#2563eb)', dot: '#2563eb' },
        review: { bg: '#ede9fe',                          text: '#7c3aed',                      dot: '#7c3aed' },
        test:   { bg: 'var(--warning-bg,#fef9c3)',        text: 'var(--warning,#ca8a04)',        dot: '#ca8a04' },
        blocked:{ bg: 'var(--danger-bg,#fee2e2)',         text: 'var(--danger,#dc2626)',         dot: '#dc2626' },
        todo:   { bg: 'var(--bg-alt)',                    text: 'var(--text-muted)',             dot: '#94a3b8' },
    };

    const _featureRow = (f) => {
        const s   = f.rolledStatus || f.status || 'todo';
        const sc  = STATUS_COLOR[s] || STATUS_COLOR.todo;
        const tip = f.rolledStatus && f.rolledStatus !== f.status
            ? `Dérivé des ${f.childCount} enfants (JIRA: ${STATUS_LABELS[f.status] || f.status})`
            : 'Statut JIRA';
        const spLabel = f.childPts > 0
            ? `${f.childPtsDone}/${f.childPts}`
            : (f.points ? String(f.points) : '—');
        const spDonePct = f.childPts > 0 ? Math.round(f.childPtsDone / f.childPts * 100) : 0;
        return `
        <div class="feature-row2" data-ticket-id="${esc(f.id)}" style="--feat-color:${sc.dot}">
            <span class="feat-dot" style="background:${sc.dot}"></span>
            <span class="feat-id">${esc(f.id)}</span>
            <span class="feat-title">${esc(f.title)}</span>
            <span class="feat-status" style="background:${sc.bg};color:${sc.text}" title="${esc(tip)}">${esc(STATUS_LABELS[s] || s)}</span>
            <span class="feat-bar-wrap" title="${f.progress}% complété">
                <span class="feat-bar"><span class="feat-bar-fill ${progressColor(f.progress)}" style="width:${f.progress}%"></span></span>
                <span class="feat-pct">${f.progress}%</span>
            </span>
            <span class="feat-sp" title="SP${f.childPts > 0 ? ` · ${spDonePct}% livrés` : ''}">
                ${spLabel}<span class="feat-sp-unit"> SP</span>
            </span>
            <span class="feat-tickets">${f.childCount}<span class="feat-sp-unit"> tkts</span></span>
            <span class="feat-team">${esc(f.team || '—')}</span>
        </div>`;
    };

    // Construit le HTML par équipe avec séparateur capacité
    let html = '<div class="feature-list2">';
    for (const [teamName, tFeatures] of byTeam) {
        const cap = capByTeam[teamName];
        const tObj = store.get('teamObjects')?.find(o => o.name === teamName);
        const color = tObj?.color || '#64748b';
        const totalSpPlanned = sumBy(tFeatures, f => f.childPts || f.points || 0);

        html += `<div class="feat-team-group">`;

        // En-tête équipe
        html += `<div class="feat-team-hdr">
            <span class="team-dot" style="background:${color}"></span>
            <span class="feat-team-name">${esc(teamName)}</span>
            <span class="feat-team-count">${tFeatures.length} feature${tFeatures.length > 1 ? 's' : ''}</span>
            <span class="feat-team-sp-planned">${totalSpPlanned} SP planifiés</span>
        </div>`;

        // Lignes features
        html += tFeatures.map(_featureRow).join('');

        // Séparateur capacité
        if (cap && (cap.spNet > 0 || cap.spEst > 0)) {
            const overload = totalSpPlanned > cap.spNet;
            const ratio    = cap.spNet > 0 ? Math.min(100, Math.round(totalSpPlanned / cap.spNet * 100)) : 0;
            const capColor = overload ? 'var(--danger)' : ratio > 80 ? 'var(--warning)' : 'var(--success)';
            html += `<div class="feat-cap-separator" style="--cap-color:${capColor}">
                <div class="feat-cap-line"></div>
                <div class="feat-cap-info">
                    <span class="feat-cap-label">Capacité ${esc(teamName)}</span>
                    <span class="feat-cap-net" style="color:${capColor}">
                        ${cap.spNet} SP nets
                    </span>
                    <span class="feat-cap-buf">+ ${cap.spBuf} buffer</span>
                    <span class="feat-cap-gauge">
                        <span class="feat-cap-gauge-fill" style="width:${ratio}%;background:${capColor}"></span>
                    </span>
                    <span class="feat-cap-ratio" style="color:${capColor}">${totalSpPlanned}/${cap.spNet} SP (${ratio}%)</span>
                    ${overload ? `<span class="feat-cap-warn">⚠ surcharge</span>` : ''}
                </div>
            </div>`;
        }

        html += '</div>';
    }
    html += '</div>';

    el.innerHTML = html;
    el.querySelectorAll('.feature-row2').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticketId));
    });
}

// ── Capacity tab ──────────────────────────────────────────────────────────────

// Rôles exclus du calcul de capacité (non-devs). Persisté en localStorage.
const CAP_EXCLUDED_ROLES_KEY = 'cap-excluded-roles';
const CAP_EXCLUDED_ROLES_DEFAULT = [
    'Product Owner', 'Scrum Master', 'Product Manager',
    'Release Train Engineer', 'Business Owner',
    'RTE', 'BO', 'TRV', 'PO', 'SM', 'PM',
];
const CAP_HISTORY_MODE_KEY  = 'cap-history-mode';   // 'pi' | 'sprint'
const CAP_HISTORY_COUNT_KEY = 'cap-history-count';  // number
const CAP_ROLE_PCT_KEY      = 'cap-role-pct';       // { role: pct 0-100 }

function _capGetExcludedRoles() {
    try {
        const v = localStorage.getItem(CAP_EXCLUDED_ROLES_KEY);
        return v ? JSON.parse(v) : CAP_EXCLUDED_ROLES_DEFAULT;
    } catch { return CAP_EXCLUDED_ROLES_DEFAULT; }
}
function _capGetHistoryMode()  { return localStorage.getItem(CAP_HISTORY_MODE_KEY)  || 'pi'; }
function _capGetHistoryCount() { return parseInt(localStorage.getItem(CAP_HISTORY_COUNT_KEY) || '2', 10) || 2; }
// Retourne la map rôle → % de travail (0-100) depuis piInfo.roleCapacity (persisté serveur).
function _capGetRolePct() {
    return store.get('piInfo')?.roleCapacity || {};
}
// % effectif d'un rôle (100 si non configuré)
function _capRolePct(role, rolePctMap) {
    if (!role) return 100;
    const v = rolePctMap[role];
    return (v !== undefined && v !== null) ? v : 100;
}

// Extrait le numéro de PI depuis un nom de sprint ("Fuego - Ité 28.3" → 28)
function _capPiFromSprint(name) {
    const m = String(name || '').match(/\b(\d{2,})\.\d+/);
    return m ? parseInt(m[1], 10) : null;
}
// Extrait le numéro de sprint dans le PI ("Fuego - Ité 28.3" → 3)
function _capSprintIdx(name) {
    const m = String(name || '').match(/\b\d{2,}\.(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

// Calcule la vélocité moyenne historique par équipe
// mode='pi' → moyenne sur les X PI précédents (tous sprints confondus)
// mode='sprint' → moyenne sur les X derniers sprints
function _capAvgVelocity(teamSprints, teamName, curPiNum, mode, count) {
    const closed = teamSprints.filter(s =>
        s.team === teamName && s.state === 'closed' && (s.velocity || 0) > 0
    );
    if (!closed.length) return 0;

    let pool;
    if (mode === 'sprint') {
        // Exclut les sprints du PI sélectionné lui-même
        pool = [...closed]
            .filter(s => _capPiFromSprint(s.name) !== curPiNum)
            .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
            .slice(0, count);
    } else {
        // mode 'pi' : garde les N PI précédents
        const prevPis = new Set();
        for (const s of closed) {
            const pi = _capPiFromSprint(s.name);
            if (pi && pi < curPiNum) prevPis.add(pi);
        }
        const sortedPis = [...prevPis].sort((a, b) => b - a).slice(0, count);
        pool = closed.filter(s => sortedPis.includes(_capPiFromSprint(s.name)));
    }
    if (!pool.length) return 0;
    return Math.round(sumBy(pool, s => s.velocity) / pool.length);
}

// Calcule les jours d'absence d'une équipe sur une fenêtre de dates [from, to] (ISO strings)
function _capAbsDaysInWindow(absences, teamName, from, to) {
    return absences
        .filter(a => a.team === teamName && a.startDate <= to && a.endDate >= from)
        .reduce((s, a) => {
            // Intersection de la plage d'absence avec la fenêtre
            const start = a.startDate > from ? a.startDate : from;
            const end   = a.endDate   < to   ? a.endDate   : to;
            // Proportion des jours dans la fenêtre vs durée totale de l'absence
            const absDur  = Math.max(1, Math.round((new Date(a.endDate) - new Date(a.startDate)) / 86400000) + 1);
            const winDur  = Math.max(0, Math.round((new Date(end)       - new Date(start))       / 86400000) + 1);
            return s + (a.days || 0) * (winDur / absDur);
        }, 0);
}

// Retourne la dispo de chaque membre sur la fenêtre : [{ name, role, absDays, availDays, availPct }]
function _capMemberAvail(members, absences, absTeamName, from, to, sprintDur) {
    return members.map(m => {
        const mAbs = absences.filter(a =>
            a.memberName === m.name && a.team === absTeamName &&
            a.startDate <= to && a.endDate >= from
        );
        const absDays = mAbs.reduce((s, a) => {
            const start  = a.startDate > from ? a.startDate : from;
            const end    = a.endDate   < to   ? a.endDate   : to;
            const absDur = Math.max(1, Math.round((new Date(a.endDate) - new Date(a.startDate)) / 86400000) + 1);
            const winDur = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
            return s + (a.days || 0) * (winDur / absDur);
        }, 0);
        const roundedAbs = Math.round(absDays * 10) / 10;
        const availDays  = Math.max(0, sprintDur - roundedAbs);
        const availPct   = Math.round((availDays / sprintDur) * 100);
        return { name: m.name, role: m.role || '', absDays: roundedAbs, availDays, availPct };
    }).sort((a, b) => a.availPct - b.availPct); // plus absents en premier
}

// Génère les dates de début/fin de chaque sprint du PI courant.
// Priorité 1 : piInfo.startDate (config manuelle).
// Priorité 2 : dates réelles issues de teamSprints (JIRA) — union de toutes les équipes,
//              couvre sprints clôturés ET futurs déjà créés dans JIRA.
function _capSprintWindows(piInfo, teamSprints) {
    const sprintCnt = piInfo?.sprintsPerPI  || 5;
    const sprintDur = piInfo?.sprintDuration || 14;
    const piNum     = piInfo?.number || 0;

    const fmt = (dt) => {
        const y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,'0'), d = String(dt.getDate()).padStart(2,'0');
        return `${y}-${m}-${d}`;
    };
    const add = (iso, n) => { const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return fmt(d); };

    // Priorité 1 : date de début configurée manuellement
    if (piInfo?.startDate) {
        const startDate = piInfo.startDate;
        return Array.from({ length: sprintCnt }, (_, i) => ({
            label: `${piNum || '?'}.${i+1}`,
            from:  add(startDate, i * sprintDur),
            to:    add(startDate, (i + 1) * sprintDur - 1),
            source: 'config',
        }));
    }

    // Priorité 2 : dériver depuis les teamSprints du PI courant (toutes équipes confondues).
    // Pour chaque numéro de sprint dans le PI, on prend la startDate la plus ancienne
    // et la endDate la plus récente parmi toutes les équipes.
    if (!piNum || !teamSprints?.length) return null;

    const byIdx = new Map(); // sprintIdx → { from, to }
    for (const s of teamSprints) {
        if (_capPiFromSprint(s.name) !== piNum) continue;
        const idx = _capSprintIdx(s.name);
        if (!idx || !s.startDate) continue;
        const from = String(s.startDate).slice(0, 10);
        const to   = s.endDate ? String(s.endDate).slice(0, 10) : add(from, sprintDur - 1);
        const cur  = byIdx.get(idx);
        if (!cur) { byIdx.set(idx, { from, to }); continue; }
        if (from < cur.from) cur.from = from;
        if (to   > cur.to)   cur.to   = to;
    }
    if (!byIdx.size) return null;

    return Array.from({ length: sprintCnt }, (_, i) => {
        const idx  = i + 1;
        const win  = byIdx.get(idx);
        return win
            ? { label: `${piNum}.${idx}`, from: win.from, to: win.to, source: 'jira' }
            : null; // sprint non encore créé dans JIRA
    });
}

function renderCapacity(el, { piInfo, absences, teams, teamObjects }) {
    const sprintInfo    = store.get('sprintInfo');
    const allMembers    = store.get('members') || [];
    const allTeamSprints = sprintInfo?.teamSprints || [];
    const effectiveMembers = deriveMembersFromAbsences(absences, allMembers);
    const rolePctMap    = _capGetRolePct();

    const excludedRoles = _capGetExcludedRoles();
    const historyMode   = _capGetHistoryMode();
    const historyCount  = _capGetHistoryCount();
    const sprintDur     = piInfo?.sprintDuration || 14;
    const basePiNum     = piInfo?.number || _extractPi(sprintInfo?.name) || 0;
    const piOffset      = store.get('piOffset') || 0;
    const curPiNum      = basePiNum ? Math.max(1, basePiNum + piOffset) : 0;
    // Pour un PI autre que le courant, startDate ne s'applique pas → on force la dérivation JIRA
    const piInfoForWindows = (piOffset === 0)
        ? piInfo
        : { ...piInfo, number: curPiNum, startDate: null };
    const sprintWindows = _capSprintWindows(piInfoForWindows, allTeamSprints);

    // Toutes les équipes visibles (filtre topbar)
    const teamFilter = store.get('team');
    const visibleTeams = (!teamFilter || teamFilter === 'all') ? teams : teams.filter(t => t === teamFilter);

    // Rôles uniques issus des membres dérivés des absences (source de vérité RH)
    const allRoles = [...new Set(
        effectiveMembers.map(m => m.role).filter(Boolean)
    )].sort();

    // Les absences utilisent parfois "Team Fuego" là où la table teams dit "Fuego".
    // On construit un ensemble d'alias par nom d'équipe pour matcher les deux formes.
    const absenceTeamNames = new Set(absences.map(a => a.team));
    const _absTeamAlias = (teamName) => {
        if (absenceTeamNames.has(teamName)) return teamName;
        const prefixed = 'Team ' + teamName;
        if (absenceTeamNames.has(prefixed)) return prefixed;
        return teamName; // fallback sans alias
    };

    // Calcul par équipe
    const teamData = visibleTeams.map((teamName, i) => {
        const tObj  = teamObjects.find(o => o.name === teamName);
        const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];

        // Résout l'alias d'équipe pour les absences (ex: "Fuego" → "Team Fuego")
        const absTeamName = _absTeamAlias(teamName);

        // Membres de l'équipe (source de vérité absences), rôles exclus filtrés
        const members = effectiveMembers.filter(m => {
            if (m.team !== absTeamName) return false;
            return !excludedRoles.some(r => r.toLowerCase() === (m.role || '').toLowerCase());
        });
        // ETP pondéré : somme des ratios (ex: Ops=1.0, Tech Lead=0.4, Co-BO=0.0)
        const memberEtp   = members.reduce((s, m) => s + _capRolePct(m.role, rolePctMap) / 100, 0);
        const memberCount = members.length; // nb brut (affiché dans l'UI)

        // Vélocité moyenne historique (par sprint)
        const avgVelPerSprint = _capAvgVelocity(allTeamSprints, teamName, curPiNum, historyMode, historyCount);

        // Base Capacité manuelle (override de la vélocité historique, par équipe)
        const baseCapRaw = localStorage.getItem(`cap-base-${curPiNum}-${teamName}`);
        const baseCapacity = baseCapRaw !== null && baseCapRaw !== '' ? parseInt(baseCapRaw, 10) : null;
        // Multiplicateur effectif : base manuelle si renseignée, sinon vélocité historique
        const capMultiplier = (baseCapacity !== null && baseCapacity > 0) ? baseCapacity : avgVelPerSprint;
        const capSource     = (baseCapacity !== null && baseCapacity > 0) ? 'manual' : 'history';

        // Sprints du PI courant issus de teamSprints (pour vérifier les données réelles)
        const piTeamSprints = allTeamSprints
            .filter(s => s.team === teamName && _capPiFromSprint(s.name) === curPiNum)
            .sort((a, b) => (_capSprintIdx(a.name)||0) - (_capSprintIdx(b.name)||0));

        // Capacité par sprint
        const sprintCount = piInfo?.sprintsPerPI || 5;
        const sprints = Array.from({ length: sprintCount }, (_, idx) => {
            const sprintNum = idx + 1;
            const label     = `${curPiNum || '?'}.${sprintNum}`;
            const window    = sprintWindows?.[idx] || null;

            // Jours théoriques disponibles (pondérés par ETP rôle)
            const totalDays = memberEtp * sprintDur;

            // Absences sur la fenêtre de ce sprint — pondérées par le ratio rôle de chaque membre
            const absDays = window
                ? Math.round(members.reduce((s, m) => {
                    const pct = _capRolePct(m.role, rolePctMap) / 100;
                    if (pct === 0) return s;
                    const raw = _capAbsDaysInWindow(
                        absences.filter(a => a.memberName === m.name),
                        absTeamName, window.from, window.to
                    );
                    return s + raw * pct;
                }, 0) * 10) / 10
                : 0;

            const availDays = Math.max(0, totalDays - absDays);
            const availPct  = totalDays > 0 ? Math.round((availDays / totalDays) * 100) : 100;

            // SP estimés = base capacité × % dispo (arrondi au supérieur)
            const spEst   = memberEtp > 0 ? Math.ceil(capMultiplier * (availPct / 100)) : 0;
            const spBuf   = Math.round(spEst * 0.2);
            const spNet   = spEst - spBuf;

            // Disponibilité par membre (pour la tooltip détail)
            const memberAvail = window
                ? _capMemberAvail(members, absences, absTeamName, window.from, window.to, sprintDur)
                : members.map(m => ({ name: m.name, role: m.role || '', absDays: 0, availDays: sprintDur, availPct: 100 }));

            // Données réelles du sprint (si déjà clôturé)
            const real = piTeamSprints.find(s => _capSprintIdx(s.name) === sprintNum);
            const realVel   = real?.velocity  || null;
            const realState = real?.state     || null;

            return { label, totalDays, absDays, availDays, availPct, spEst, spBuf, spNet, realVel, realState, window, memberAvail };
        });

        const totalSpEst = sumBy(sprints, s => s.spEst);
        const totalBuf   = sumBy(sprints, s => s.spBuf);
        const totalAbs   = Math.round(sumBy(sprints, s => s.absDays) * 10) / 10;

        return { teamName, color, memberCount, avgVelPerSprint, capMultiplier, capSource, baseCapacity, sprints, totalSpEst, totalBuf, totalAbs };
    });

    // ── HTML ──────────────────────────────────────────────────────────────────

    const modeLabel = historyMode === 'pi'
        ? `${historyCount} PI précédent${historyCount > 1 ? 's' : ''}`
        : `${historyCount} dernier${historyCount > 1 ? 's' : ''} sprint${historyCount > 1 ? 's' : ''}`;

    const hasWindows   = !!sprintWindows;
    // Détermine la source des fenêtres (pour le badge info dans le bandeau)
    const windowSource = !sprintWindows ? 'none'
        : piInfo?.startDate ? 'config'
        : 'jira';
    // Compte les sprints avec fenêtre connue vs manquants
    const knownWindows  = sprintWindows ? sprintWindows.filter(Boolean).length : 0;
    const totalSprints  = piInfo?.sprintsPerPI || 5;

    el.innerHTML = `
    <div class="picap">

        <!-- ── Bandeau paramètres ── -->
        <div class="picap-params">
            <!-- Ligne 1 : vélocité + lien + badge source -->
            <div class="picap-params-row1">
                <span class="picap-params-label">Vélocité</span>
                <select class="select select-sm" id="cap-history-mode">
                    <option value="pi"     ${historyMode==='pi'     ? 'selected' : ''}>Par PI</option>
                    <option value="sprint" ${historyMode==='sprint' ? 'selected' : ''}>Par sprint</option>
                </select>
                <input class="input input-sm" id="cap-history-count" type="number" min="1" max="20" value="${historyCount}" style="width:48px" title="Nombre de PI ou sprints">
                <span class="picap-params-hint">${esc(modeLabel)}</span>
                <span class="picap-params-sep"></span>
                ${windowSource === 'jira' ? `<span class="picap-source-info">
                    <svg class="icon icon-sm" style="color:var(--success)"><use href="#i-check"/></svg>
                    Dates JIRA${knownWindows < totalSprints ? ` · <span class="text-warning">${totalSprints - knownWindows} sprint${totalSprints - knownWindows > 1 ? 's' : ''} manquant${totalSprints - knownWindows > 1 ? 's' : ''}</span>` : ''}
                </span>` : windowSource === 'none' ? `<span class="picap-warn">
                    <svg class="icon icon-sm" style="color:var(--warning)"><use href="#i-alert"/></svg>
                    Aucun sprint PI trouvé
                </span>` : ''}
                <a class="picap-settings-link" id="cap-goto-settings" href="#settings">
                    <svg class="icon icon-sm"><use href="#i-settings"/></svg>
                    % par rôle
                </a>
            </div>
            <!-- Ligne 2 : rôles exclus sur toute la largeur -->
            <div class="picap-params-row2">
                <span class="picap-params-label">Exclus</span>
                <div class="picap-role-select" id="cap-role-select">
                    <div class="picap-role-tags">
                        ${excludedRoles.filter(r => allRoles.includes(r)).map(r => {
                            const pct = _capRolePct(r, rolePctMap);
                            return `<span class="picap-role-tag" data-role="${esc(r)}">
                                ${esc(r)}${pct < 100 ? ` <em>${pct}%</em>` : ''}
                                <button class="picap-role-tag-rm" data-role="${esc(r)}" tabindex="-1">×</button>
                            </span>`;
                        }).join('')}
                        <input class="picap-role-input" id="cap-role-input" placeholder="Ajouter un rôle à exclure…" autocomplete="off">
                    </div>
                    <ul class="picap-role-dropdown" id="cap-role-dropdown" hidden></ul>
                </div>
            </div>
        </div>

        <!-- ── Grille sprints ── -->
        <div class="picap-grid">
            ${teamData.map(td => {
                if (!td.memberCount) return `
                    <div class="picap-team-block">
                        <div class="picap-team-hdr">
                            <span class="team-dot" style="background:${td.color}"></span>
                            <span class="picap-team-name">${esc(td.teamName)}</span>
                            <span class="picap-team-empty">Aucun membre dev</span>
                        </div>
                    </div>`;

                return `
                <div class="picap-team-block">
                    <div class="picap-team-hdr">
                        <span class="team-dot" style="background:${td.color}"></span>
                        <span class="picap-team-name">${esc(td.teamName)}</span>
                        <span class="picap-team-meta">${td.memberCount} dev · vél. moy. <strong>${td.avgVelPerSprint}</strong> SP/sprint</span>
                        <label class="picap-base-wrap" title="Base Capacité : remplace la vélocité historique pour l'estimation. Vide = vélocité historique (${td.avgVelPerSprint} SP).">
                            <span class="picap-base-label">Base</span>
                            <input class="picap-base-input"
                                type="number" min="1" max="999"
                                placeholder="${td.avgVelPerSprint}"
                                value="${td.baseCapacity !== null ? td.baseCapacity : ''}"
                                data-team="${esc(td.teamName)}"
                                data-pi="${curPiNum}">
                            <span class="picap-base-unit">SP</span>
                            ${td.capSource === 'manual' ? `<span class="picap-base-badge">perso</span>` : ''}
                        </label>
                        <span class="picap-team-totals">
                            <span class="picap-total-sp">${td.totalSpEst} SP estimés</span>
                            <span class="picap-total-buf">${td.totalBuf} buffer</span>
                        </span>
                    </div>
                    <div class="picap-sprints">
                        ${td.sprints.map(s => {
                            const isDone = s.realState === 'closed';
                            const isActive = s.realState === 'active';
                            const barW = Math.min(100, s.availPct);
                            const netPct = s.spEst > 0 ? Math.round((s.spNet / s.spEst) * 100) : 80;
                            return `
                            <div class="picap-sprint${isDone ? ' picap-sprint--done' : isActive ? ' picap-sprint--active' : ''}">
                                <div class="picap-sprint-hdr">
                                    <span class="picap-sprint-label">Sprint ${s.label}</span>
                                    ${s.window ? `<span class="picap-sprint-dates">${_rotFmtCapDate(s.window.from)} → ${_rotFmtCapDate(s.window.to)}</span>` : ''}
                                    ${isDone && s.realVel != null ? `<span class="picap-sprint-real">Réalisé : <strong>${s.realVel} SP</strong></span>` : ''}
                                    ${isActive ? `<span class="picap-sprint-badge-active">En cours</span>` : ''}
                                </div>

                                <!-- Barre dispo + absences -->
                                <div class="picap-avail-bar-wrap picap-has-tt">
                                    <div class="picap-avail-bar">
                                        <div class="picap-avail-fill" style="width:${barW}%"></div>
                                        ${s.absDays > 0 ? `<div class="picap-avail-abs" style="width:${100-barW}%"></div>` : ''}
                                    </div>
                                    <span class="picap-avail-pct">${s.availPct}% dispo${s.absDays > 0 ? ` · <span class="text-warning">${s.absDays}j abs</span>` : ''}</span>
                                    <div class="picap-tt">
                                        <div class="picap-tt-row picap-tt-row--head">
                                            <span>Disponibilité sprint ${s.label}</span>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>Membres dev</span>
                                            <strong>${td.memberCount}</strong>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>Durée sprint</span>
                                            <strong>${sprintDur} j</strong>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>Jours théoriques</span>
                                            <strong>${s.totalDays} j</strong>
                                        </div>
                                        ${s.absDays > 0 ? `
                                        <div class="picap-tt-row picap-tt-row--warn">
                                            <span>Congés / absences</span>
                                            <strong>− ${s.absDays} j</strong>
                                        </div>` : ''}
                                        <div class="picap-tt-row picap-tt-row--total">
                                            <span>Jours disponibles</span>
                                            <strong>${s.availDays} j (${s.availPct}%)</strong>
                                        </div>
                                    </div>
                                </div>

                                <!-- SP : net + buffer -->
                                <div class="picap-sp-row picap-has-tt">
                                    <div class="picap-sp-bars">
                                        <div class="picap-sp-net" style="flex:${s.spNet}">
                                            <span class="picap-sp-val">${s.spNet}</span>
                                            <span class="picap-sp-lbl">SP</span>
                                        </div>
                                        <div class="picap-sp-buf" style="flex:${s.spBuf}">
                                            <span class="picap-sp-val">${s.spBuf}</span>
                                            <span class="picap-sp-lbl">buf</span>
                                        </div>
                                    </div>
                                    <span class="picap-sp-total">≈&thinsp;${s.spEst} SP</span>
                                    <div class="picap-tt picap-tt--wide">
                                        <div class="picap-tt-row picap-tt-row--head">
                                            <span>Membres disponibles — sprint ${s.label}</span>
                                        </div>
                                        ${s.memberAvail.map(m => `
                                        <div class="picap-tt-row picap-tt-member">
                                            <span class="picap-tt-member-name">${esc(m.name)}</span>
                                            <span class="picap-tt-member-bar-wrap">
                                                <span class="picap-tt-member-bar">
                                                    <span class="picap-tt-member-fill" style="width:${m.availPct}%"></span>
                                                </span>
                                            </span>
                                            <strong class="${m.availPct < 70 ? 'picap-tt-low' : m.availPct < 100 ? 'picap-tt-mid' : ''}">${m.availPct}%${m.absDays > 0 ? ` <span class="picap-tt-abs">−${m.absDays}j</span>` : ''}</strong>
                                        </div>`).join('')}
                                        <div class="picap-tt-sep"></div>
                                        <div class="picap-tt-row picap-tt-row--head">
                                            <span>Calcul estimation</span>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>${td.capSource === 'manual' ? 'Base Capacité <em>(perso)</em>' : `Vél. moy. (${historyCount} ${historyMode === 'pi' ? 'PI' : 'sprints'})`}</span>
                                            <strong>${td.capMultiplier} SP</strong>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>× disponibilité équipe</span>
                                            <strong>${s.availPct}%</strong>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--formula">
                                            <span>${td.capMultiplier} × ${s.availPct}% = <strong>${(td.capMultiplier * s.availPct / 100).toFixed(1)}</strong> → ⌈ ${s.spEst} SP ⌉</span>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--total">
                                            <span>SP estimés</span>
                                            <strong>${s.spEst} SP</strong>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--buf">
                                            <span>Buffer (20%)</span>
                                            <strong>− ${s.spBuf} SP</strong>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--total">
                                            <span>SP nets</span>
                                            <strong>${s.spNet} SP</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }).join('')}
        </div>

        <!-- ── Récap PI ── -->
        <div class="picap-recap">
            <div class="picap-recap-title">Récap PI#${curPiNum || '?'}</div>
            <div class="picap-recap-kpis">
                ${teamData.filter(td => td.memberCount > 0).map(td => `
                    <div class="picap-recap-kpi">
                        <span class="picap-recap-dot" style="background:${td.color}"></span>
                        <span class="picap-recap-team">${esc(td.teamName)}</span>
                        <span class="picap-recap-val">${td.totalSpEst} SP</span>
                        <span class="picap-recap-buf">+ ${td.totalBuf} buf</span>
                    </div>`).join('')}
                <div class="picap-recap-kpi picap-recap-kpi--total">
                    <span class="picap-recap-team">Total</span>
                    <span class="picap-recap-val">${sumBy(teamData, td => td.totalSpEst)} SP</span>
                    <span class="picap-recap-buf">+ ${sumBy(teamData, td => td.totalBuf)} buf</span>
                </div>
            </div>
        </div>

    </div>`;

    // ── Interactions ──────────────────────────────────────────────────────────
    const _rerender = () => renderCapacity(el, { piInfo, absences, teams, teamObjects });

    el.querySelector('#cap-history-mode')?.addEventListener('change', e => {
        localStorage.setItem(CAP_HISTORY_MODE_KEY, e.target.value);
        _rerender();
    });
    el.querySelector('#cap-history-count')?.addEventListener('change', e => {
        const v = Math.max(1, Math.min(20, parseInt(e.target.value) || 2));
        localStorage.setItem(CAP_HISTORY_COUNT_KEY, String(v));
        _rerender();
    });
    // ── Autocomplete rôles exclus ─────────────────────────────────────────────
    const _saveExcluded = (list) => {
        localStorage.setItem(CAP_EXCLUDED_ROLES_KEY, JSON.stringify(list));
        _rerender();
    };
    const input    = el.querySelector('#cap-role-input');
    const dropdown = el.querySelector('#cap-role-dropdown');

    const _showDropdown = (query) => {
        const current = _capGetExcludedRoles();
        const matches = allRoles.filter(r =>
            !current.includes(r) &&
            r.toLowerCase().includes(query.toLowerCase())
        );
        if (!matches.length) { dropdown.hidden = true; return; }
        dropdown.innerHTML = matches.map(r => {
            const pct = _capRolePct(r, rolePctMap);
            return `<li class="picap-role-opt" data-role="${esc(r)}">${esc(r)}${pct < 100 ? ` <em>${pct}%</em>` : ''}</li>`;
        }).join('');
        dropdown.hidden = false;
    };

    input?.addEventListener('focus',  () => _showDropdown(input.value));
    input?.addEventListener('input',  () => _showDropdown(input.value));
    input?.addEventListener('keydown', e => {
        if (e.key === 'Escape') { dropdown.hidden = true; input.blur(); }
        if (e.key === 'Backspace' && !input.value) {
            // Supprime le dernier tag
            const current = _capGetExcludedRoles().filter(r => allRoles.includes(r));
            if (current.length) _saveExcluded(current.slice(0, -1));
        }
    });
    dropdown?.addEventListener('mousedown', e => {
        const li = e.target.closest('.picap-role-opt');
        if (!li) return;
        e.preventDefault();
        const role = li.dataset.role;
        const current = _capGetExcludedRoles();
        if (!current.includes(role)) _saveExcluded([...current, role]);
    });
    // Clic sur × d'un tag
    el.querySelector('#cap-role-select')?.addEventListener('click', e => {
        const btn = e.target.closest('.picap-role-tag-rm');
        if (!btn) return;
        const role = btn.dataset.role;
        _saveExcluded(_capGetExcludedRoles().filter(r => r !== role));
    });
    // Ferme le dropdown au clic extérieur
    document.addEventListener('click', function _outsideClick(e) {
        if (!el.querySelector('#cap-role-select')?.contains(e.target)) {
            if (dropdown) dropdown.hidden = true;
            document.removeEventListener('click', _outsideClick);
        }
    });
    el.querySelectorAll('.picap-base-input').forEach(inp => {
        const _save = (target) => {
            const team = target.dataset.team;
            const pi   = target.dataset.pi;
            const key  = `cap-base-${pi}-${team}`;
            const v    = target.value.trim();
            if (v === '' || isNaN(parseInt(v))) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, String(Math.max(1, parseInt(v))));
            }
            _rerender();
        };
        // Sauvegarde uniquement sur blur ou Enter — pas à chaque frappe ni flèche
        inp.addEventListener('blur',    e => _save(e.target));
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _save(e.target); e.target.blur(); } });
        inp.addEventListener('click',   e => e.stopPropagation());
    });

    el.querySelector('#cap-goto-settings')?.addEventListener('click', e => {
        e.preventDefault();
        const sb = window.__squadBoard;
        if (!sb) return;
        // Positionne la tab cible avant de changer de vue (consommé par _settingsApplyTabs)
        sb.store.set('settingsSection', 'cap-roles');
        sb.store.set('view', 'settings');
    });
}

function _rotFmtCapDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ── Teams tab ─────────────────────────────────────────────────────────────────
function renderTeams(el, { teamCap, tickets, teams }) {
    const byTeam = groupBy(tickets, t => t.team);

    el.innerHTML = `
        <div class="team-cards">
            ${teamCap.map(t => {
                const tt = byTeam.get(t.name) || [];
                const blocked = tt.filter(x => x.status === 'blocked').length;
                const p = pct(t.donePts, t.pts);
                const statusCounts = {};
                for (const x of tt) statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
                return `
                    <div class="team-card">
                        <div class="team-card-header">
                            <span class="team-card-name inline-flex-center"><span class="team-dot" style="background:${t.color}"></span> ${esc(t.name)}</span>
                            <span class="badge badge-points">${t.donePts}/${t.pts} pts</span>
                        </div>
                        <div class="progress progress-thin"><div class="progress-bar ${progressColor(p)}" style="width:${p}%"></div></div>
                        <div class="team-card-stats">
                            <span>${tt.length} tickets</span>
                            <span>${t.done} done</span>
                            ${blocked > 0 ? `<span class="text-danger">${blocked} bloques</span>` : ''}
                            ${t.absDays > 0 ? `<span class="text-warning">${t.absDays}j abs</span>` : ''}
                        </div>
                        <div class="flex gap-1 mt-2 flex-wrap">
                            ${['todo', 'inprog', 'review', 'test', 'blocked', 'done'].map(s => {
                                const c = statusCounts[s] || 0;
                                return c ? `<span class="badge badge-${s} badge-status">${STATUS_LABELS[s]} ${c}</span>` : '';
                            }).join('')}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ── Support Rotation (lecture seule) ─────────────────────────────────────────
function renderSupportRota(el, { teams, teamObjects }) {
    const support    = store.get('support') || [];
    const absences   = store.get('absences') || [];
    const members    = store.get('members') || [];
    const allMembers = deriveMembersFromAbsences(absences, members);
    const piInfo     = store.get('piInfo');
    const sprintInfo = store.get('sprintInfo');
    const today      = new Date().toISOString().slice(0, 10);

    // Match tolérant équipe app ↔ CSV RH (même logique que settings.js)
    const _norm = s => (s || '').toLowerCase().trim();
    const _matchTeam = (mt, tgt) => { const t = _norm(mt), g = _norm(tgt); return t === g || (t && g && (t.includes(g) || g.includes(t))); };

    // Filtre par équipe sélectionnée dans le topbar
    const activeTeam = store.get('team');
    const filteredTeams = (!activeTeam || activeTeam === 'all') ? teams : teams.filter(t => t === activeTeam);
    const teamNames = [...filteredTeams].sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));

    // Switch PI courant / suivant — état local persisté
    const LS_KEY = 'pi-tab-support-next';
    let showNext = localStorage.getItem(LS_KEY) === '1';

    const _render = () => {
        const panels = teamNames.map(teamName => {
            const tObj  = teamObjects.find(o => o.name === teamName);
            const color = tObj?.color || '#64748b';
            const mode  = getSupportWeekMode(teamName);
            const { curWeeks, nextWeeks, curPiNum, nextPiNum } = buildSupportPiWeeks(piInfo, sprintInfo, mode);
            const allWeeks   = showNext ? nextWeeks : curWeeks;
            const panelPiNum = showNext ? nextPiNum : curPiNum;
            const teamMembers = allMembers.filter(m => _matchTeam(m.team, teamName));
            if (!teamMembers.length) return '';
            const teamSupport = support.filter(s => _matchTeam(s.team, teamName));
            const mpw = parseInt(localStorage.getItem(`rot-mpw-${teamName}`)) || 2;

            // Résumé
            const filledWeeks = allWeeks.filter(w => {
                const e = teamSupport.find(s => s.weekStart === w.weekStart);
                return e && (e.members || []).length > 0;
            }).length;
            const summaryColor = filledWeeks === allWeeks.length ? 'var(--success)' : filledWeeks > 0 ? 'var(--warning)' : 'var(--danger)';

            // En-têtes semaines
            const weekRow = allWeeks.map(w => {
                const isCur = today >= w.weekStart && today <= w.weekEnd;
                return `<th class="rot-wk-th${isCur ? ' rot-wk-current' : ''}${showNext ? ' rot-wk-next-pi' : ''}">
                    <span class="rot-wk-label">${w.label}</span>
                    <span class="rot-wk-dates">${_rotFmtCapDate(w.weekStart)}</span>
                </th>`;
            }).join('');

            // Lignes membres — cellules en lecture seule
            const memberRows = teamMembers.map(m => {
                const active = isMemberSupportActive(m.name);
                const cells = allWeeks.map(w => {
                    const entry  = teamSupport.find(s => s.weekStart === w.weekStart);
                    const sel    = entry && (entry.members || []).includes(m.name);
                    const absDays = absences.filter(a =>
                        a.memberName === m.name && _matchTeam(a.team, teamName) &&
                        a.startDate <= w.weekEnd && a.endDate >= w.weekStart
                    ).reduce((s, a) => {
                        const st = a.startDate > w.weekStart ? a.startDate : w.weekStart;
                        const en = a.endDate   < w.weekEnd   ? a.endDate   : w.weekEnd;
                        const ad = Math.max(1, Math.round((new Date(a.endDate) - new Date(a.startDate)) / 86400000) + 1);
                        const wd = Math.max(0, Math.round((new Date(en) - new Date(st)) / 86400000) + 1);
                        return s + (a.days || 0) * (wd / ad);
                    }, 0);
                    const absent  = absDays >= 2.5;
                    const partial = absDays > 0 && !absent;
                    const isCur   = today >= w.weekStart && today <= w.weekEnd;
                    const absBadge = absDays > 0
                        ? `<span class="rot-abs-badge${absent ? ' rot-abs-full' : ''}">${absDays % 1 ? absDays.toFixed(1) : absDays}j</span>`
                        : '';
                    const cls = ['rot-cell', absent ? 'rot-cell-absent' : '', partial ? 'rot-cell-partial' : '', isCur ? 'rot-cell-current' : '', showNext ? 'rot-cell-next-pi' : ''].filter(Boolean).join(' ');
                    // Cellule figée : span au lieu de button
                    return `<td class="${cls}">
                        ${absBadge}
                        <span class="rot-chip${sel ? ' rot-chip-on' : ''}"
                            style="${sel ? `background:${color}22;color:${color};border-color:${color}` : ''}">
                            ${sel ? '✓' : ''}
                        </span>
                    </td>`;
                }).join('');
                return `<tr class="${active ? '' : 'rot-row-inactive'}">
                    <td class="rot-member-td">
                        <span class="rot-member-name${active ? '' : ' is-inactive'}">${esc(m.name)}</span>
                    </td>
                    ${cells}
                </tr>`;
            }).join('');

            // Ligne totaux
            const countRow = allWeeks.map(w => {
                const entry = teamSupport.find(s => s.weekStart === w.weekStart);
                const cnt   = entry ? (entry.members || []).length : 0;
                const isCur = today >= w.weekStart && today <= w.weekEnd;
                const cls   = cnt === mpw ? 'rot-count-ok' : cnt > 0 ? 'rot-count-partial' : '';
                return `<td class="rot-cell rot-count-cell ${cls}${isCur ? ' rot-cell-current' : ''}${showNext ? ' rot-cell-next-pi' : ''}">${cnt}/${mpw}</td>`;
            }).join('');

            return `<div class="rot-panel" style="border-left:3px solid ${color}">
                <div class="rot-panel-hdr">
                    <span class="rot-dot" style="background:${color}"></span>
                    <span class="rot-name">${esc(teamName)}</span>
                    <span class="rot-sum">${teamMembers.length} membres · <span style="color:${summaryColor}">${filledWeeks}/${allWeeks.length} sem.</span></span>
                </div>
                <div class="rot-panel-body">
                    <div class="table-wrap">
                        <table class="rot-grid">
                            <thead>
                                <tr>
                                    <th class="rot-member-th" rowspan="2">Membre</th>
                                    <th colspan="${allWeeks.length}" class="rot-pi-group-th${showNext ? ' rot-pi-group-next' : ''}">PI ${panelPiNum || '?'}</th>
                                </tr>
                                <tr>${weekRow}</tr>
                            </thead>
                            <tbody>
                                ${memberRows}
                                <tr class="rot-count-row">
                                    <td class="rot-member-th">Total</td>
                                    ${countRow}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        }).filter(Boolean).join('');

        el.innerHTML = `
            <div class="pi-support-rota">
                <div class="pi-support-rota-hdr">
                    <div class="rot-pi-switch">
                        <button class="rot-pi-switch-btn${!showNext ? ' is-active' : ''}" id="pir-cur">📆 PI courant</button>
                        <button class="rot-pi-switch-btn${showNext ? ' is-active' : ''}" id="pir-next">📅 PI suivant</button>
                    </div>
                    <a class="picap-settings-link" id="pir-goto-settings" href="#settings">
                        <svg class="icon icon-sm"><use href="#i-settings"/></svg>
                        Modifier dans Paramètres
                    </a>
                </div>
                ${panels || '<p class="text-muted text-sm">Aucune rotation configurée.</p>'}
            </div>`;

        el.querySelector('#pir-cur')?.addEventListener('click', () => { showNext = false; localStorage.setItem(LS_KEY, '0'); _render(); });
        el.querySelector('#pir-next')?.addEventListener('click', () => { showNext = true; localStorage.setItem(LS_KEY, '1'); _render(); });
        el.querySelector('#pir-goto-settings')?.addEventListener('click', e => {
            e.preventDefault();
            window.__squadBoard?.store.set('settingsSection', 'rotation');
            window.__squadBoard?.store.set('view', 'settings');
        });
    };

    _render();
}

// ── Burnup PI multi-équipes ──────────────────────────────────────────────────
// Cumule les Story Points livrés par sprint du PI courant, agrégé par équipe.
// Référentiel : `sprintInfo.teamSprints[]` (sprints clos + actif) filtrés par PI.
// Le commitment = somme des engagements (estimated) des sprints du PI ; fallback
// sur la velocité historique moyenne × nb sprints si pas d'estimated.
function renderBurnup(el, { piInfo, teams, teamObjects }) {
    const sprintInfo = store.get('sprintInfo');
    const allTeamSprints = sprintInfo?.teamSprints || [];
    const tickets = store.get('tickets') || [];
    const team = store.get('team');
    const teamFilter = team && team !== 'all';
    // PI courant décalé par le sélecteur topbar (piOffset = -2..+2)
    const _basePi = piInfo?.number || _extractPi(sprintInfo?.name);
    const _piOffset = store.get('piOffset') || 0;
    const piNumber = _basePi ? Math.max(1, _basePi + _piOffset) : 0;

    if (!piNumber) {
        el.innerHTML = `<div class="empty-state"><p class="text-muted">Numéro de PI introuvable — configure le PI dans Paramètres ou synchronise.</p></div>`;
        return;
    }

    // 1. Filtre les sprints du PI courant (nom contient PI{n} ou {n}.x)
    const piSprints = allTeamSprints.filter(s =>
        _sprintInPi(s.name, piNumber) && (!teamFilter || s.team === team)
    );
    if (!piSprints.length) {
        el.innerHTML = `<div class="empty-state">
            <p class="text-muted">Aucun sprint trouvé pour le PI#${piNumber}${teamFilter ? ` côté ${esc(team)}` : ''}.</p>
        </div>`;
        return;
    }

    // 2. Groupe par sprint name (le même PI sprint peut exister pour plusieurs équipes)
    const sprintNames = [...new Set(piSprints.map(s => s.name))]
        .sort((a, b) => _sprintOrder(a) - _sprintOrder(b));
    const teamsInPi = [...new Set(piSprints.map(s => s.team))];

    // 3. Pour chaque (sprint, équipe) : récupère vélocité (priorité JIRA, fallback tickets)
    const velMatrix = {}; // { team: { sprintName: velocity } }
    for (const s of piSprints) {
        if (!velMatrix[s.team]) velMatrix[s.team] = {};
        let v = s.velocity || 0;
        if (v === 0) {
            // Fallback : somme des points done des tickets dans ce sprint pour cette équipe
            v = sumBy(
                tickets.filter(t =>
                    t.status === 'done' && t.team === s.team &&
                    (t.sprintName || t.sprint_name) === s.name
                ),
                t => t.points
            );
        }
        velMatrix[s.team][s.name] = v;
    }

    // 4. Cumul par équipe
    const cumByTeam = {}; // { team: [cumul_after_sprint_0, cumul_after_sprint_1, ...] }
    for (const tm of teamsInPi) {
        let cum = 0;
        cumByTeam[tm] = sprintNames.map(n => {
            cum += velMatrix[tm][n] || 0;
            return cum;
        });
    }
    // Cumul total cross-team
    const cumTotal = sprintNames.map((_, i) =>
        teamsInPi.reduce((s, tm) => s + (cumByTeam[tm][i] || 0), 0));

    // 5. Engagement total = somme des estimated des sprints du PI (par équipe)
    const commitmentTotal = sumBy(piSprints, s => s.estimated || 0);

    // 6. Couleurs équipes
    const teamColor = (name) => {
        const obj = (teamObjects || []).find(o => o.name === name);
        if (obj?.color) return obj.color;
        const idx = (teams || []).indexOf(name);
        return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0];
    };

    el.innerHTML = `
        <div class="pi-burnup">
            <div class="pi-burnup-hdr">
                <div>
                    <h3 class="pi-burnup-title">PI#${piNumber} Burnup ${teamFilter ? `— ${esc(team)}` : '— toutes équipes'}</h3>
                    <p class="pi-burnup-sub">${sprintNames.length} sprint${sprintNames.length > 1 ? 's' : ''} · ${teamsInPi.length} équipe${teamsInPi.length > 1 ? 's' : ''} · cumul SP livrés vs engagement</p>
                </div>
                <div class="pi-burnup-kpis">
                    ${commitmentTotal > 0 ? `<span class="pi-burnup-kpi"><span class="lbl">Engagement</span><strong>${commitmentTotal} pts</strong></span>` : ''}
                    <span class="pi-burnup-kpi pi-burnup-kpi--accent"><span class="lbl">Livré (à date)</span><strong>${cumTotal[cumTotal.length - 1] || 0} pts</strong></span>
                    ${commitmentTotal > 0 ? `<span class="pi-burnup-kpi"><span class="lbl">% atteint</span><strong>${Math.round((cumTotal[cumTotal.length - 1] / commitmentTotal) * 100)}%</strong></span>` : ''}
                </div>
            </div>
            <div class="chart-container chart-h-md"><canvas id="pi-burnup-chart"></canvas></div>
            <div class="pi-burnup-legend">
                ${teamsInPi.map(tm => `
                    <span class="pi-burnup-leg-item">
                        <span class="pi-burnup-leg-dot" style="background:${teamColor(tm)}"></span>
                        ${esc(tm)}
                        <span class="pi-burnup-leg-pts">${velMatrix[tm] ? sumBy(sprintNames, n => velMatrix[tm][n] || 0) : 0} pts</span>
                    </span>
                `).join('')}
            </div>
        </div>`;

    requestAnimationFrame(() => {
        if (!window.Chart) return;
        const ctx = document.getElementById('pi-burnup-chart')?.getContext('2d');
        if (!ctx) return;

        // Datasets : une ligne par équipe (cumul) + ligne totale (gras) + commitment horizontal
        const teamDatasets = teamsInPi.map(tm => ({
            label: tm,
            data: cumByTeam[tm],
            borderColor: teamColor(tm),
            backgroundColor: teamColor(tm) + '15',
            borderWidth: 1.5,
            pointRadius: 3,
            tension: 0.25,
            fill: false,
        }));
        const totalDataset = {
            label: 'Total livré',
            data: cumTotal,
            borderColor: '#0f172a',
            backgroundColor: 'rgba(15,23,42,0.08)',
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.25,
            fill: true,
            order: -1,
        };
        const datasets = [totalDataset, ...teamDatasets];
        if (commitmentTotal > 0) {
            datasets.push({
                label: `Engagement (${commitmentTotal} pts)`,
                data: sprintNames.map(() => commitmentTotal),
                borderColor: '#94a3b8',
                borderDash: [5, 5],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
            });
        }

        new window.Chart(ctx, {
            type: 'line',
            data: { labels: sprintNames, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false }, // on a notre propre legend HTML
                    tooltip: { mode: 'index' },
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Story Points (cumulé)' } },
                    x: { title: { display: true, text: 'Sprints du PI' } },
                },
            },
        });
    });
}

function _extractPi(name) {
    if (!name) return null;
    const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}
function _sprintInPi(sprintName, piNumber) {
    if (!sprintName || !piNumber) return false;
    const s = String(sprintName);
    // Matche {pi}.{x} ou PI{pi} ou PI#{pi}
    return new RegExp(`(^|\\b)${piNumber}\\.\\d+`).test(s) ||
           new RegExp(`PI\\s*#?\\s*${piNumber}(?!\\d)`, 'i').test(s);
}
function _sprintOrder(name) {
    // Tri par numéro de sprint dans le PI (e.g. "Ité 29.4" → 4)
    const m = String(name).match(/\.(\d+)/);
    return m ? parseInt(m[1], 10) : 999;
}

// ── Mood / ROTI tab ──────────────────────────────────────────────────────────
function renderMood(el, { teams }) {
    renderVotingPanel(el, 'mood', 'Mood / ROTI', teams, [
        { value: 1, label: '😡', desc: 'Tres mal' },
        { value: 2, label: '😟', desc: 'Mal' },
        { value: 3, label: '😐', desc: 'Neutre' },
        { value: 4, label: '🙂', desc: 'Bien' },
        { value: 5, label: '😄', desc: 'Excellent' },
    ]);
}

// ── Fist of Five tab ─────────────────────────────────────────────────────────
function renderFist(el, { teams }) {
    renderVotingPanel(el, 'fist', 'Fist of Five (confiance)', teams, [
        { value: 1, label: '✊', desc: 'Pas du tout' },
        { value: 2, label: '✌️', desc: 'Peu confiant' },
        { value: 3, label: '🤟', desc: 'Moyen' },
        { value: 4, label: '🖖', desc: 'Confiant' },
        { value: 5, label: '🖐️', desc: 'Tres confiant' },
    ]);
}

async function renderVotingPanel(el, type, title, teams, scale) {
    // ── Config centralisée Sprint + PI (voir <!-- ═══ Sprint + PI Config ═══ -->) ──
    const sprintInfo    = store.get('sprintInfo');
    const piInfo        = store.get('piInfo');
    const _basePiNum    = piInfo?.number || 0;
    const _piOff        = store.get('piOffset') || 0;
    const piNum         = _basePiNum ? Math.max(1, _basePiNum + _piOff) : '';
    const sprintsCnt    = piInfo?.sprintsPerPI || 0;
    const defaultSprint = (sprintInfo?.name || '').match(/(\d+\.\d+)/)?.[1] || '';
    const currentTeam   = store.get('team');
    const teamObjects   = store.get('teamObjects') || [];

    // Génère la liste des sprints depuis la config PI (même logique que settings.js)
    const piSprints = sprintsCnt > 0
        ? [...Array(sprintsCnt)].map((_, i) => piNum ? `${piNum}.${i + 1}` : `S${i + 1}`)
        : [];

    // ── Formulaire (rendu une seule fois) ─────────────────────────────────────
    el.innerHTML = `
        <div class="card mb-4">
            <div class="card-header">
                <span class="card-title">Voter</span>
                <button class="btn btn-secondary btn-xs btn-copy-vote-slack" title="Copier les résultats pour Slack">📋 Copier Slack</button>
            </div>
            <div class="vote-layout">
                <div class="vote-fields">
                    <div class="form-group mb-2">
                        <label class="label">Equipe</label>
                        <select class="select w-full" id="vote-team">
                            ${teams.map(t => `<option value="${esc(t)}"${t === currentTeam ? ' selected' : ''}>${esc(t)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group mb-2">
                        <label class="label">Sprint</label>
                        ${piSprints.length
                            ? `<select class="select w-full" id="vote-sprint">
                                   <option value="">- Tous -</option>
                                   ${piSprints.map(s => `<option value="${esc(s)}"${s === defaultSprint ? ' selected' : ''}>${esc(s)}</option>`).join('')}
                               </select>`
                            : `<input class="input" id="vote-sprint" value="${esc(defaultSprint)}" placeholder="Sprint...">`
                        }
                    </div>
                    <div class="form-group">
                        <label class="label">Note (optionnel)</label>
                        <input class="input" id="vote-note" placeholder="Commentaire...">
                    </div>
                </div>
                <div class="vote-btns">
                    ${scale.map(s => `
                        <button class="vote-btn" data-value="${s.value}" title="${s.desc}">
                            <span style="font-size:22px">${s.label}</span>
                            <span class="text-xs text-muted">${s.value}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- Résultats (zone rafraîchie indépendamment) -->
        <div id="vote-results"></div>
    `;

    let lastResults = null;

    // Rafraîchit uniquement la zone résultats selon le sprint sélectionné
    async function refreshResults() {
        const sprint  = el.querySelector('#vote-sprint')?.value.trim() || '';
        const allVotes = await api.getMood({ type });
        const filtered = sprint ? allVotes.filter(v => (v.piSprint || '') === sprint) : allVotes;

        const byTeam = {};
        for (const v of filtered) {
            if (!byTeam[v.team]) byTeam[v.team] = [];
            byTeam[v.team].push(v);
        }
        const teamAvgs = teams.map(t => {
            const votes = byTeam[t] || [];
            const avg = votes.length ? votes.reduce((s, v) => s + v.value, 0) / votes.length : 0;
            const color = teamObjects.find(o => (o.name || o) === t)?.color || 'var(--primary)';
            return { name: t, avg: Math.round(avg * 10) / 10, count: votes.length, votes, color };
        });
        const globalVotes = filtered.length;
        const globalAvg   = globalVotes
            ? Math.round(filtered.reduce((s, v) => s + v.value, 0) / globalVotes * 10) / 10
            : 0;

        lastResults = { teamAvgs, globalVotes, globalAvg, sprint };

        const resultsEl = el.querySelector('#vote-results');
        if (!resultsEl) return;

        const gColor = globalAvg >= 4 ? 'var(--success)' : globalAvg >= 3 ? 'var(--warning)' : globalAvg ? 'var(--danger)' : 'var(--text-muted)';
        resultsEl.innerHTML = `
            <div class="vr-header">
                ${globalVotes
                    ? `<span class="vr-global-score" style="color:${gColor}">${globalAvg}<span class="vr-global-unit">/5</span></span>
                       <span class="vr-global-label">moyenne · ${globalVotes} vote${globalVotes !== 1 ? 's' : ''}${sprint ? ` · sprint <strong>${esc(sprint)}</strong>` : ''}</span>`
                    : `<span class="vr-global-label text-muted">Aucun vote${sprint ? ` pour le sprint <strong>${esc(sprint)}</strong>` : ''}</span>`
                }
            </div>
            <div class="vr-list">
                ${teamAvgs.map(t => {
                    const sc = t.avg >= 4 ? 'var(--success)' : t.avg >= 3 ? 'var(--warning)' : t.avg ? 'var(--danger)' : 'var(--text-muted)';
                    const emoji = t.count ? (scale.find(s => s.value === Math.round(t.avg)) || scale[scale.length - 1]).label : '';
                    const bars = scale.map(s => {
                        const cnt = t.votes.filter(v => v.value === s.value).length;
                        const flex = t.count ? cnt / t.count : 0;
                        if (!flex) return '';
                        const bg = s.value >= 4 ? 'var(--success)' : s.value >= 3 ? 'var(--warning)' : 'var(--danger)';
                        return `<span class="vr-seg" style="flex:${flex};background:${bg}" title="${esc(s.label)}: ${cnt}"></span>`;
                    }).join('');
                    return `
                    <div class="vr-row${t.count ? '' : ' vr-row--empty'}">
                        <div class="vr-team">
                            <span class="vr-dot" style="background:${t.color}"></span>
                            <span class="vr-name">${esc(t.name)}</span>
                        </div>
                        <div class="vr-score" style="color:${sc}">
                            ${t.count ? `<span class="vr-emoji">${emoji}</span><span class="vr-val">${t.avg}</span><span class="vr-unit">/5</span>` : '<span class="vr-val" style="color:var(--text-muted)">—</span>'}
                        </div>
                        <div class="vr-distrib">${bars || '<span class="vr-distrib-empty"></span>'}</div>
                        <span class="vr-count">${t.count ? `${t.count} vote${t.count > 1 ? 's' : ''}` : ''}</span>
                        ${t.count ? `<button class="vr-del vote-del-team" data-team="${esc(t.name)}" title="Supprimer les votes">🗑</button>` : '<span></span>'}
                    </div>`;
                }).join('')}
            </div>
        `;

        // Boutons suppression par équipe
        resultsEl.querySelectorAll('.vote-del-team').forEach(btn => {
            btn.addEventListener('click', async () => {
                const teamName = btn.dataset.team;
                const sprint   = el.querySelector('#vote-sprint')?.value.trim() || '';
                const allV     = await api.getMood({ type });
                const toDelete = allV.filter(v =>
                    v.team === teamName && (sprint ? (v.piSprint || '') === sprint : true)
                );
                if (!toDelete.length) { toast('Aucun vote à supprimer', 'info'); return; }
                const label = sprint ? `${teamName} / ${sprint}` : teamName;
                if (!confirm(`Supprimer ${toDelete.length} vote(s) pour ${label} ?`)) return;
                await Promise.all(toDelete.map(v => api.deleteMood(v.id)));
                toast(`${toDelete.length} vote(s) supprimé(s)`, 'success');
                refreshResults();
            });
        });
    }

    // Active / désactive les boutons de vote selon le sprint sélectionné
    function syncVoteBtns() {
        const sprint = el.querySelector('#vote-sprint')?.value.trim() || '';
        const noSprint = !sprint;
        el.querySelectorAll('.vote-btn').forEach(btn => { btn.disabled = noSprint; });
        let hint = el.querySelector('.vote-sprint-hint');
        if (noSprint) {
            if (!hint) {
                hint = document.createElement('p');
                hint.className = 'vote-sprint-hint text-xs text-muted text-center mt-2';
                el.querySelector('.vote-btn')?.closest('.flex')?.insertAdjacentElement('afterend', hint);
            }
            hint.textContent = 'Sélectionnez un sprint pour pouvoir voter.';
        } else {
            hint?.remove();
        }
    }

    // ── Listeners formulaire ───────────────────────────────────────────────────

    // Vote : ne pas réinitialiser les champs, juste rafraîchir les résultats
    el.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const sprint  = el.querySelector('#vote-sprint')?.value.trim() || '';
            if (!sprint) return; // garde (bouton devrait déjà être disabled)
            const teamVal = el.querySelector('#vote-team')?.value;
            const note    = el.querySelector('#vote-note')?.value || '';
            if (!teamVal) { toast('Sélectionnez une équipe', 'warning'); return; }
            btn.disabled = true;
            try {
                await api.createMood({ type, team: teamVal, value: parseInt(btn.dataset.value), piSprint: sprint, note });
                toast(`Vote enregistré : ${btn.title}`, 'success');
                await refreshResults();
            } catch (e) {
                toast(e.message, 'error');
            } finally {
                syncVoteBtns(); // restaure l'état disabled correct
            }
        });
    });

    // Changement de sprint → sync boutons + rafraîchir les résultats
    el.querySelector('#vote-sprint')?.addEventListener('change', () => { syncVoteBtns(); refreshResults(); });

    // Copie le message d'invitation au sondage (template fun pour Mood, structuré pour Fist)
    el.querySelector('.btn-copy-vote-slack')?.addEventListener('click', async () => {
        const btn = el.querySelector('.btn-copy-vote-slack');
        const sprintVal = el.querySelector('#vote-sprint')?.value.trim() || store.get('sprintInfo')?.name || '';
        const raw = type === 'fist' ? buildFistSlackRaw(sprintVal) : buildMoodSlackRaw(sprintVal);
        try {
            await navigator.clipboard.writeText(raw);
            btn.textContent = '✓ Copié !';
            setTimeout(() => { btn.textContent = '📋 Copier Slack'; }, 1500);
        } catch { toast('Impossible de copier', 'error'); }
    });

    // État initial
    syncVoteBtns();
    await refreshResults();
}
