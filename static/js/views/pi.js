/**
 * PI Planning view - tabs: Objectifs, Features, Capacite, ROAM, Equipes.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, pct, progressColor, filterByTeam, groupBy, sumBy, toast, deriveMembersFromAbsences, rollupStatus } from '../utils.js';
import { STATUS_LABELS, TEAM_COLORS } from '../config.js';
import { buildMoodSlackRaw, buildFistSlackRaw } from '../components/sondage.js';

let _activeTab = 'objectives';

export function renderPI(container) {
    const team = store.get('team');
    const tickets = filterByTeam(store.get('tickets') || [], team);
    // Features filtrées par équipe (champ team = Team[Team] JIRA, équipe responsable SAFe).
    // Si team='all' sans groupe → toutes les features (vue globale RTE).
    const features = filterByTeam(store.get('features') || [], team);
    const epics = store.get('epics') || [];
    const teams = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const piInfo = store.get('piInfo');
    const absences = store.get('absences') || [];
    const jiraUrl = store.get('jiraUrl') || null;

    const piLabel = piInfo?.name || 'PI en cours';
    const objectives = piInfo?.objectives || [];

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
        return { ...f, progress: pct(done, total), childCount: all.length, rolledStatus };
    });

    // Team capacity — membres dérivés des absences (source de vérité CSV RH)
    const effectiveMembers = deriveMembersFromAbsences(absences, store.get('members') || []);
    const teamCap = teams.map((t, i) => {
        const tObj = teamObjects.find(o => o.name === t);
        const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];
        const tt = filterByTeam(store.get('tickets') || [], t);
        const total = tt.length;
        const done = tt.filter(x => x.status === 'done').length;
        const pts = sumBy(tt, x => x.points);
        const donePts = sumBy(tt.filter(x => x.status === 'done'), x => x.points);
        const members = effectiveMembers.filter(m => m.team === t);
        const teamAbsences = absences.filter(a => a.team === t);
        const absDays = teamAbsences.reduce((s, a) => s + (a.days || 0), 0);
        return { name: t, color, total, done, pts, donePts, memberCount: members.length, absDays };
    });

    const tabs = [
        { id: 'objectives', label: `Objectifs (${objectives.length})` },
        { id: 'features', label: `Features (${features.length})` },
        { id: 'capacity', label: 'Capacite' },
        { id: 'burnup', label: '📈 Burnup' },
        { id: 'teams', label: 'Equipes' },
        { id: 'mood', label: 'Mood / ROTI' },
        { id: 'fist', label: 'Fist of Five' },
    ];
    const validTabIds = new Set(tabs.map(t => t.id));
    // Hash format : #pi/équipe/tab - le tab est en 3ème segment
    const hashParts = window.location.hash.replace(/^#/, '').split('/');
    const hashTab   = hashParts[2] || store.get('piTab') || '';
    if (validTabIds.has(hashTab)) _activeTab = hashTab;

    container.innerHTML = `
        <div class="pi-header">
            <h2>${esc(piLabel)}</h2>
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
                <span class="metric-value">${epics.length}</span>
            </div>
            <div class="metric-card ${objectives.filter(o => o.status === 'done').length === objectives.length && objectives.length ? 'mc-done' : 'mc-warning'}">
                <span class="metric-icon">🎯</span>
                <span class="metric-label">Objectifs</span>
                <span class="metric-value">${objectives.length}</span>
                <span class="metric-sub">${objectives.filter(o => o.status === 'done').length} atteints</span>
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
        renderTabContent(container.querySelector('#pi-tab-content'), _activeTab, { objectives, featureList, teamCap, tickets, teams, teamObjects, piInfo, absences });
    });

    renderTabContent(container.querySelector('#pi-tab-content'), _activeTab, { objectives, featureList, teamCap, tickets, teams, teamObjects, piInfo, absences });
}

function renderTabContent(el, tab, data) {
    switch (tab) {
        case 'objectives': return renderObjectives(el, data);
        case 'features': return renderFeatures(el, data);
        case 'capacity': return renderCapacity(el, data);
        case 'burnup': return renderBurnup(el, data);
        case 'teams': return renderTeams(el, data);
        case 'mood': return renderMood(el, data);
        case 'fist': return renderFist(el, data);
    }
}

// ── Objectives tab ────────────────────────────────────────────────────────────
function renderObjectives(el, { objectives, piInfo, teams, teamObjects }) {
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
        <div class="pi-obj-toolbar">
            ${!showAll
                ? `<span class="chip" style="background:var(--primary-bg);color:var(--primary)">${esc(team)}</span>`
                : `<span class="text-sm text-muted">Toutes les équipes</span>`}
            <button class="btn btn-primary btn-sm" id="pi-obj-save">Enregistrer</button>
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
function renderFeatures(el, { featureList }) {
    el.innerHTML = `
        <div class="card card-flush">
            ${featureList.length ? featureList.map(f => `
                <div class="feature-row" data-ticket-id="${esc(f.id)}">
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
                    <span class="text-xs text-muted">${f.childCount} tickets</span>
                    <span class="feature-team">${esc(f.team || '-')}</span>
                </div>
            `).join('') : '<div class="empty-state"><p>Aucune feature</p></div>'}
        </div>
    `;
    el.querySelectorAll('.feature-row').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticketId));
    });
}

// ── Capacity tab ──────────────────────────────────────────────────────────────
function renderCapacity(el, { teamCap }) {
    const totalPts = teamCap.reduce((s, t) => s + t.pts, 0);
    el.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr><th>Equipe</th><th>Membres</th><th>Tickets</th><th>Done</th><th>Points</th><th>Done pts</th><th>Abs (j)</th><th>Charge</th></tr>
                </thead>
                <tbody>
                    ${teamCap.map(t => {
                        const p = pct(t.donePts, t.pts);
                        return `<tr>
                            <td><span class="inline-flex-center"><span class="team-dot" style="background:${t.color}"></span>${esc(t.name)}</span></td>
                            <td>${t.memberCount}</td>
                            <td>${t.total}</td>
                            <td>${t.done}</td>
                            <td>${t.pts}</td>
                            <td>${t.donePts}</td>
                            <td>${t.absDays > 0 ? `<span class="text-warning">${t.absDays}</span>` : '0'}</td>
                            <td><div class="inline-flex-center"><div class="progress progress-inline-sm"><div class="progress-bar ${progressColor(p)}" style="width:${p}%"></div></div><span class="text-xs">${p}%</span></div></td>
                        </tr>`;
                    }).join('')}
                </tbody>
                <tfoot>
                    <tr style="font-weight:var(--fw-semibold)">
                        <td>Total</td>
                        <td>${teamCap.reduce((s, t) => s + t.memberCount, 0)}</td>
                        <td>${teamCap.reduce((s, t) => s + t.total, 0)}</td>
                        <td>${teamCap.reduce((s, t) => s + t.done, 0)}</td>
                        <td>${totalPts}</td>
                        <td>${teamCap.reduce((s, t) => s + t.donePts, 0)}</td>
                        <td>${teamCap.reduce((s, t) => s + t.absDays, 0)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
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
