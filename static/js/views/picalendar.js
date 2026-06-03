/**
 * PI Calendar - vue calendrier des sprints du PI avec events, rotations et jalons.
 */

import { store } from '../state.js';
import { esc, filterByTeam } from '../utils.js';
import { TEAM_COLORS } from '../config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function _initials(name) {
    const p = name.trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function _addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

function _diffDays(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function _fmtShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function _isoWeekLabel(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
    return `S${week}`;
}

export function renderPICalendar(container) {
    const piInfo      = store.get('piInfo');
    const sprint      = store.get('sprintInfo');
    const events      = store.get('events') || [];
    const support     = store.get('support') || [];
    const teams       = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const team        = store.get('team');
    const absences    = store.get('absences') || [];
    const tickets     = store.get('tickets') || [];

    // ── Build sprint list ──────────────────────────────────────────────────────
    // Use piInfo to compute sprint dates if sprint config is available
    const sprintCnt = piInfo?.sprintsPerPI || 5;
    const sprintDur = piInfo?.sprintDuration || 14;
    // PI affiché décalé par le sélecteur topbar (piOffset)
    // Fallback : si piInfo.number n'est pas configuré, on déduit depuis le sprint actif
    const _extractPiNum = (name) => {
        if (!name) return 0;
        const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    const _basePi   = _extractPiNum(sprint?.name) || piInfo?.number || 0;
    const _piOff    = store.get('piOffset') || 0;
    const piNum     = _basePi ? Math.max(1, _basePi + _piOff) : '';

    // Anchor: use current sprint start date if available
    const anchorDate = sprint?.startDate || new Date().toISOString().slice(0, 10);

    // Find which sprint index is "current" from sprint name
    let curIdx = -1;
    if (sprint?.name && piNum) {
        const m = sprint.name.match(/(\d+)\.(\d+)/);
        if (m && parseInt(m[1]) === piNum) curIdx = parseInt(m[2]) - 1;
    }

    // Compute start of PI (sprint 1 starts at anchorDate - curIdx * sprintDur)
    const piStartDate = curIdx >= 0 ? _addDays(anchorDate, -curIdx * sprintDur) : anchorDate;

    const sprints = Array.from({ length: sprintCnt }, (_, i) => {
        const start = _addDays(piStartDate, i * sprintDur);
        const end   = _addDays(start, sprintDur - 1);
        const label = piNum ? `${piNum}.${i + 1}` : `Sprint ${i + 1}`;
        const isIP  = i === sprintCnt - 1;
        const isCur = i === curIdx;
        const isDone = curIdx >= 0 && i < curIdx;
        return { idx: i, label, start, end, isIP, isCur, isDone };
    });

    const piEnd   = sprints[sprints.length - 1]?.end || piStartDate;
    const today   = new Date().toISOString().slice(0, 10);

    const EV_ICONS  = { incident:'💥', freeze:'🧊', milestone:'🚩', period:'📅', other:'ℹ️' };
    const ABS_COL   = { conge:'#93c5fd', maladie:'#fca5a5', formation:'#86efac', autre:'#d1d5db' };
    const piEvents  = events.filter(ev => ev.startDate <= piEnd && (ev.endDate || ev.startDate) >= piStartDate);
    const allObjs   = piInfo?.objectives || [];

    // ── Build week columns for header ─────────────────────────────────────────
    const totalDays = _diffDays(piStartDate, piEnd) + 1;

    // ── Filtered teams ────────────────────────────────────────────────────────
    const visTeams = (team && team !== 'all') ? [team] : teams;

    container.innerHTML = `
        <div class="pical-container">
            <!-- Header info -->
            <div class="pical-header">
                <div>
                    <h2 class="pical-title">PI ${piNum ? `#${piNum}` : 'Planning'}${(() => { const n = piInfo?.name || ''; const clean = n.replace(/^\s*PI\s*#?\s*\d+\s*[-–]?\s*/i, '').trim(); return clean ? ` - ${esc(clean)}` : ''; })()}</h2>
                    <span class="text-sm text-muted">${_fmtShort(piStartDate)} → ${_fmtShort(piEnd)} · ${sprintCnt} sprints · ${totalDays} jours</span>
                </div>
                <div class="flex gap-2">
                    <span class="pi-sprint-pill current">▶ Sprint actuel</span>
                    <span class="pi-sprint-pill done">✓ Terminé</span>
                    <span class="pi-sprint-pill ip">IP</span>
                </div>
            </div>

            <!-- Calendar grid -->
            <div class="pical-grid-wrap">
                <div class="pical-grid" style="--sprint-cnt:${sprintCnt};--sprint-dur:${sprintDur}">

                    <!-- Sprint headers -->
                    <div class="pical-row pical-sprint-row">
                        <div class="pical-row-label"></div>
                        ${sprints.map(s => {
                            const cls = s.isIP ? 'ip' : s.isCur ? 'current' : s.isDone ? 'done' : '';
                            return `<div class="pical-sprint-hdr ${cls}" style="--col-span:${sprintDur}">${esc(s.label)}<br><small>${_fmtShort(s.start)}</small></div>`;
                        }).join('')}
                    </div>

                    <!-- Today marker row -->
                    ${today >= piStartDate && today <= piEnd ? (() => {
                        const dayOffset = _diffDays(piStartDate, today);
                        const pct = Math.round(dayOffset / totalDays * 100);
                        return `<div class="pical-today-row"><div class="pical-row-label"></div><div class="pical-today-track"><div class="pical-today-marker" style="left:${pct}%"><span>Aujourd'hui</span></div></div></div>`;
                    })() : ''}

                    <!-- Events row -->
                    ${piEvents.length ? `
                    <div class="pical-row pical-events-row">
                        <div class="pical-row-label pical-row-label-sm">Évènements</div>
                        <div class="pical-row-track">
                            ${piEvents.map(ev => {
                                const startOff  = Math.max(0, _diffDays(piStartDate, ev.startDate));
                                const endOff    = Math.max(0, _diffDays(piStartDate, ev.endDate || ev.startDate));
                                const left      = Math.round(startOff / totalDays * 100);
                                const dur       = Math.max(1, endOff - startOff + 1);
                                const width     = Math.round(dur / totalDays * 100);
                                const icon      = EV_ICONS[ev.type] || 'ℹ️';
                                const evCls     = `pical-event-${ev.type || 'other'}`;
                                const startLbl  = _fmtShort(ev.startDate);
                                const endLbl    = ev.endDate && ev.endDate !== ev.startDate ? _fmtShort(ev.endDate) : '';
                                const dateStr   = endLbl ? `${startLbl} → ${endLbl} · ${dur}j` : startLbl;
                                const descHtml  = ev.description ? `<div class="pical-ev-tt-desc">${esc(ev.description)}</div>` : '';
                                const tipHtml = `<div class="pical-ev-tt-head">${icon} <strong>${esc(ev.title)}</strong></div><div class="pical-ev-tt-dates">📅 ${esc(dateStr)}</div>${descHtml}`;
                                const tipAttr = tipHtml.replace(/"/g, '&quot;');
                                if (ev.type === 'milestone') {
                                    return `<div class="pical-milestone-pin" style="left:${left}%" data-tip="${tipAttr}">${icon}<span class="pical-milestone-label">${esc(ev.title)}</span></div>`;
                                }
                                return `<div class="pical-event-block ${evCls}" style="left:${left}%;width:${Math.max(width, 0.5)}%"><div class="pical-ev-chip" data-tip="${tipAttr}">${icon} ${esc(ev.title)}</div></div>`;
                            }).join('')}
                        </div>
                    </div>` : ''}

                    <!-- Team rows -->
                    ${visTeams.map((t, i) => {
                        const tObj        = teamObjects.find(o => o.name === t);
                        const color       = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];
                        const teamRot     = support.filter(s => s.team === t);
                        const teamTickets = tickets.filter(tk => tk.team === t);
                        const teamAbs     = absences.filter(a => a.team === t && a.startDate <= piEnd && (a.endDate || a.startDate) >= piStartDate);
                        const teamObjs    = allObjs.filter(o => (o.team || '') === t);

                        // ── Objectives badge ──────────────────────────────────
                        const objDone   = teamObjs.filter(o => o.status === 'done').length;
                        const objInprog = teamObjs.filter(o => o.status === 'inprog').length;
                        const objBadge  = teamObjs.length ? (() => {
                            const allDone = objDone === teamObjs.length;
                            const c = allDone ? 'var(--success)' : (objDone + objInprog) > 0 ? 'var(--warning)' : 'var(--text-muted)';
                            const tip = teamObjs.map(o => `${o.status === 'done' ? '✓' : '○'} ${o.title}`).join('\n');
                            return `<span class="pical-obj-badge" style="color:${c}" title="${esc(tip)}">${allDone ? '✅' : objDone > 0 ? '🔄' : '○'} ${objDone}/${teamObjs.length} obj.</span>`;
                        })() : '';

                        // ── Absence strips ────────────────────────────────────
                        const absStrips = teamAbs.map(a => {
                            const s0 = _diffDays(piStartDate, a.startDate < piStartDate ? piStartDate : a.startDate);
                            const e0 = _diffDays(piStartDate, (a.endDate || a.startDate) > piEnd ? piEnd : (a.endDate || a.startDate));
                            if (e0 < s0) return '';
                            const left  = Math.round(Math.max(0, s0) / totalDays * 100);
                            const width = Math.round((e0 - Math.max(0, s0) + 1) / totalDays * 100);
                            const bg = ABS_COL[a.type] || ABS_COL.autre;
                            return `<div class="pical-abs-strip" style="left:${left}%;width:${Math.max(width, 0.3)}%;background:${bg}" title="${esc(a.memberName)} · ${esc(a.type)}${a.days ? ` (${a.days}j)` : ''}"></div>`;
                        }).join('');

                        // ── Sprint blocks with velocity fill + tooltip ────────
                        const sprintBlocks = sprints.map(s => {
                            const cls    = s.isIP ? 'pical-block-ip' : s.isCur ? 'pical-block-cur' : s.isDone ? 'pical-block-done' : 'pical-block-future';
                            const offset = _diffDays(piStartDate, s.start);
                            const left   = Math.round(offset / totalDays * 100);
                            const width  = Math.round(sprintDur / totalDays * 100);

                            const spTk    = teamTickets.filter(tk => tk.sprintName?.includes(s.label));
                            const ptsDone = spTk.filter(tk => tk.status === 'done').reduce((n, tk) => n + (tk.points || 0), 0);
                            const ptsAll  = spTk.reduce((n, tk) => n + (tk.points || 0), 0);
                            const tkDone  = spTk.filter(tk => tk.status === 'done').length;
                            const tkBlk   = spTk.filter(tk => tk.status === 'blocked').length;
                            const velPct  = ptsAll > 0 ? Math.round(ptsDone / ptsAll * 100) : -1;

                            const velBar = velPct >= 0
                                ? `<div class="pical-block-vel" style="width:${velPct}%;background:${color}"></div>`
                                : '';
                            const tip = [
                                `<strong>${esc(s.label)}</strong> · ${_fmtShort(s.start)} → ${_fmtShort(s.end)}`,
                                spTk.length ? `${tkDone}/${spTk.length} tickets · <strong>${ptsDone}/${ptsAll} pts</strong>` : '<em>Aucun ticket</em>',
                                tkBlk ? `🚫 ${tkBlk} bloqué${tkBlk > 1 ? 's' : ''}` : '',
                                s.isIP ? '<em>Innovation &amp; Planning</em>' : '',
                            ].filter(Boolean).join('<br>');

                            return `<div class="pical-block ${cls}" style="left:${left}%;width:calc(${width}% - 4px);--team-color:${color}" data-tip="${tip.replace(/"/g, '&quot;')}">
                                ${velBar}
                            </div>`;
                        }).join('');

                        // ── Support badges ────────────────────────────────────
                        const rotBadges = sprints.map(s => {
                            const spRot = teamRot.filter(r => r.weekStart >= s.start && r.weekStart <= s.end);
                            const allM  = [...new Set(spRot.flatMap(r => r.members || []))];
                            if (!allM.length) return '';
                            const offset = _diffDays(piStartDate, s.start);
                            const bleft  = Math.round(offset / totalDays * 100);
                            const bwidth = Math.round(sprintDur / totalDays * 100);
                            const tip    = spRot.map(r => `${r.weekLabel ? r.weekLabel + ': ' : ''}${(r.members||[]).join(', ')}`).join(' | ');
                            const avs    = allM.map(m => `<span class="pical-rot-av" style="background:${color}" title="${esc(m)}">${esc(_initials(m))}</span>`).join('');
                            return `<div class="pical-rot-badge" style="left:${bleft}%;width:calc(${bwidth}% - 6px)" title="🎧 ${esc(tip)}">🎧 ${avs}</div>`;
                        }).join('');

                        return `
                        <div class="pical-row pical-team-row">
                            <div class="pical-row-label pical-row-label-team" style="border-left:3px solid ${color}">
                                <span class="pical-team-name">${esc(t)}</span>
                                ${objBadge}
                            </div>
                            <div class="pical-row-track">
                                ${absStrips}
                                ${sprintBlocks}
                                ${rotBadges}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

        </div>
    `;
    _bindBlockTooltips(container);
}

function _bindBlockTooltips(container) {
    let tip = document.getElementById('pical-floating-tip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'pical-floating-tip';
        tip.className = 'pical-block-tooltip';
        document.body.appendChild(tip);
    }
    tip.style.display = 'none';

    container.querySelectorAll('[data-tip]').forEach(el => {
        el.addEventListener('mouseenter', e => {
            tip.innerHTML = el.dataset.tip;
            tip.style.display = 'block';
            _posTip(tip, e);
        });
        el.addEventListener('mousemove', e => _posTip(tip, e));
        el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
}

function _posTip(tip, e) {
    const m = 14, tw = tip.offsetWidth || 230, th = tip.offsetHeight || 80;
    let x = e.clientX + m, y = e.clientY + m;
    if (x + tw > window.innerWidth  - m) x = e.clientX - tw - m;
    if (y + th > window.innerHeight - m) y = e.clientY - th - m;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
}
