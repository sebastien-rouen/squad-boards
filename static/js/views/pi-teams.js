/**
 * 👥 Page PI → onglets Équipes et Support : roster du PI affiché et grille de rotation en lecture seule.
 *
 * Extrait de pi.js (3.258.0), code déplacé à l'identique. N'importe jamais pi.js (pas de cycle).
 */
import { store } from '../state.js';
import { esc, pct, progressColor, getSupportWeekMode, supportWeekHead, isMemberSupportActive, supportWorkingDays, supportDaysForMember, supportAbsenceDayLevel, isSupportAbsent } from '../utils.js';
import { STATUS_LABELS } from '../config.js';
import { buildPiWeeks } from '../utils/pi-weeks.js';
import { effectiveRosterForPi, teamNameMatches, copySlack } from '../utils.js';
import { _extractPi } from './pi-burnup.js';

export function _rotFmtCapDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ── Teams tab ─────────────────────────────────────────────────────────────────
export function renderTeams(el, { teamCap }) {
    // Une carte par équipe : avancement en points, répartition des statuts (barre empilée + légende),
    // effectif du PI et absences sur le PI. Équipe sélectionnée dans le topbar mise en avant.
    const ST = ['done', 'test', 'review', 'inprog', 'blocked', 'todo'];
    const ST_CLR = { done: 'var(--status-done)', test: 'var(--status-test, var(--warning))', review: 'var(--status-review, #8b5cf6)', inprog: 'var(--status-inprog)', blocked: 'var(--status-blocked)', todo: 'var(--status-todo, var(--text-muted))' };
    const sel = store.get('team');
    const cards = [...teamCap].sort((x, y) => (y.name === sel) - (x.name === sel)).map(t => {
        const p = pct(t.donePts, t.pts);
        const total = t.total || 0;
        const bar = total ? ST.map(s => { const c = t.statusCounts?.[s] || 0; return c ? `<span style="flex:${c};background:${ST_CLR[s]}" title="${esc(STATUS_LABELS[s] || s)} : ${c}"></span>` : ''; }).join('') : '';
        return `<div class="pit-card${t.name === sel ? ' is-current' : ''}" style="--tc:${t.color}">
            <div class="pit-head">
                <span class="pit-dot"></span>
                <span class="pit-name">${esc(t.name)}</span>
                ${t.blocked ? `<span class="pit-blocked" title="${t.blocked} ${t.blocked > 1 ? 'tickets' : 'ticket'} ${t.blocked > 1 ? 'bloqués' : 'bloqué'}">🚫 ${t.blocked}</span>` : ''}
            </div>
            <div class="pit-pts">
                <span class="pit-pct" style="color:${p >= 80 ? 'var(--success)' : p >= 50 ? 'var(--primary)' : 'var(--warning)'}">${p}%</span>
                <span class="pit-pts-txt">des points livrés</span>
            </div>
            <div class="pit-lbl" title="Points des tickets terminés ÷ points de tous les tickets de l'équipe sur le PI">📈 Avancement en points <span>${t.donePts} / ${t.pts} pts</span></div>
            <div class="progress progress-thin"><div class="progress-bar ${progressColor(p)}" style="width:${p}%"></div></div>
            <div class="pit-lbl" title="Chaque segment = part des tickets de l'équipe dans ce statut">🎫 Tickets par statut <span>${total} ticket${total > 1 ? 's' : ''}</span></div>
            <div class="pit-status" aria-label="Répartition des statuts">${bar || '<span class="pit-status-empty"></span>'}</div>
            <div class="pit-legend">
                ${ST.filter(s => t.statusCounts?.[s]).map(s => `<span><i style="background:${ST_CLR[s]}"></i>${esc(STATUS_LABELS[s] || s)} ${t.statusCounts[s]}</span>`).join('') || '<span class="text-muted">Aucun ticket sur ce PI</span>'}
            </div>
            <div class="pit-foot">
                <span title="Tickets de l'équipe sur le PI">🎫 ${total} ticket${total > 1 ? 's' : ''} · ${t.done} terminé${t.done > 1 ? 's' : ''}</span>
                <span title="Membres du roster du PI">👥 ${t.memberCount}</span>
                ${t.absDays > 0 ? `<span class="pit-abs" title="Jours d'absence du roster sur la durée du PI">🌴 ${String(t.absDays).replace('.', ',')} j</span>` : ''}
            </div>
        </div>`;
    }).join('');
    el.innerHTML = `
        <div class="pi-card">
            <div class="pi-card-head">
                <span class="pi-card-ico" aria-hidden="true">👥</span>
                <div class="pi-card-title"><b>Équipes du PI</b><small>Points livrés, statuts des tickets, effectif et absences sur le PI</small></div>
            </div>
            <div class="pi-card-body"><div class="pit-grid">${cards}</div></div>
        </div>`;
}

// Formate "NOM, Prénom" → "Prénom NOM" pour l'affichage
function _fmtMemberName(n) {
    const comma = n.indexOf(',');
    if (comma < 0) return n;
    return `${n.slice(comma + 1).trim()} ${n.slice(0, comma).trim()}`;
}

// Trie les membres support : actifs en premier, puis prénom puis nom
function _sortSupportMembers(names) {
    const _parse = n => {
        const comma = n.indexOf(',');
        if (comma > 0) return { first: n.slice(comma + 1).trim(), last: n.slice(0, comma).trim() };
        const parts = n.trim().split(/\s+/);
        return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] || '' };
    };
    return [...names].sort((a, b) => {
        const diff = (isMemberSupportActive(a) ? 0 : 1) - (isMemberSupportActive(b) ? 0 : 1);
        if (diff !== 0) return diff;
        const pa = _parse(a), pb = _parse(b);
        const fc = pa.first.localeCompare(pb.first, 'fr', { sensitivity: 'base' });
        return fc !== 0 ? fc : pa.last.localeCompare(pb.last, 'fr', { sensitivity: 'base' });
    });
}

// ── Support Rotation (lecture seule) ─────────────────────────────────────────
// Panneaux dépliés de l'onglet Support (localStorage `sb-pi-rot-open`) : une équipe sélectionnée est
// toujours dépliée ; en « Toutes équipes », seules celles que l'utilisateur a ouvertes le sont.
const _PI_ROT_OPEN = 'sb-pi-rot-open';
const _piRotOpenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(_PI_ROT_OPEN) || '[]')); } catch { return new Set(); } };
function _piRotIsOpen(team) {
    const sel = store.get('team');
    if (sel && sel !== 'all') return !_piRotOpenSet().has(`-${team}`);   // équipe filtrée : ouverte sauf repli explicite
    return _piRotOpenSet().has(team);
}
function _piRotToggle(team) {
    const set = _piRotOpenSet(), sel = store.get('team'), filtered = sel && sel !== 'all';
    const key = filtered ? `-${team}` : team;
    if (set.has(key)) set.delete(key); else set.add(key);
    try { localStorage.setItem(_PI_ROT_OPEN, JSON.stringify([...set])); } catch { /* navigation privée */ }
}
export function renderSupportRota(el, { teams, teamObjects }) {
    const support    = store.get('support') || [];
    const absences   = store.get('absences') || [];
    const members    = store.get('members') || [];
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

    // Sélecteur PI — utilise piOffset du store (même logique que topbar)
    const basePiNum = _extractPi(sprintInfo?.name) || piInfo?.number || 0;

    const _render = () => {
        const piOffset   = store.get('piOffset') || 0;
        const showNext   = piOffset > 0; // pour les classes CSS existantes
        // Panneaux calqués sur Paramètres → Rotation (settings-rotation.js, `_rotTeamPanelHtml`), en LECTURE
        // SEULE : roster DU PI affiché (`effectiveRosterForPi`, partis exclus — l'ancienne version prenait tout
        // l'historique des congés), bande des 5 jours dans chaque cellule, semaines passées 🔒 grisées,
        // membres hors support grisés 🚫, total compté sur le roster seulement, panneaux repliables.
        const panels = teamNames.map(teamName => {
            const tObj  = teamObjects.find(o => o.name === teamName);
            const color = tObj?.color || '#64748b';
            const mode  = getSupportWeekMode(teamName);
            // Semaines du PI sélectionné — source unique utils/pi-weeks.js (même calcul que Paramètres et Support).
            const { weeks: allWeeks, piNum: panelPiNum } = buildPiWeeks({ piInfo, sprintInfo, piOffset, weekMode: mode });
            const roster = effectiveRosterForPi(piInfo, panelPiNum, absences, members).filter(m => teamNameMatches(m.team, teamName));
            if (!roster.length) return '';
            const teamMembers = _sortSupportMembers(roster.map(m => m.name));
            const rosterSet = new Set(teamMembers);
            const teamSupport = support.filter(s => _matchTeam(s.team, teamName));
            const mpw = parseInt(localStorage.getItem(`rot-mpw-${teamName}`)) || 2;
            const weekCount = w => (teamSupport.find(s => s.weekStart === w.weekStart)?.members || []).filter(m => rosterSet.has(m)).length;
            const filledWeeks = allWeeks.filter(w => weekCount(w) > 0).length;
            const fullWeeks = allWeeks.filter(w => weekCount(w) === mpw).length;
            const summaryColor = fullWeeks === allWeeks.length ? 'var(--success)' : filledWeeks > 0 ? 'var(--warning)' : 'var(--danger)';
            const activeCount = teamMembers.filter(isMemberSupportActive).length;
            const inactive = teamMembers.length - activeCount;
            const memberSummary = inactive ? `${activeCount}/${teamMembers.length} actif${activeCount > 1 ? 's' : ''} <small class="rot-sum-inactive">(${inactive} hors support)</small>` : `${teamMembers.length} membre${teamMembers.length > 1 ? 's' : ''}`;
            const summary = `<span class="rot-sum">${memberSummary}${panelPiNum ? ` · PI ${panelPiNum}` : ''} · <span style="color:${summaryColor}">${filledWeeks}/${allWeeks.length} sem.</span></span>`;
            const open = _piRotIsOpen(teamName);
            if (!open) {
                return `<div class="rot-panel" style="border-left:3px solid ${color}">
                    <div class="rot-panel-hdr" data-pirot-toggle="${esc(teamName)}" role="button" tabindex="0" aria-expanded="false">
                        <span class="rot-chevron">▶</span><span class="rot-dot" style="background:${color}"></span>
                        <span class="rot-name">${esc(teamName)}</span>${summary}
                    </div>
                </div>`;
            }
            const weekRow = allWeeks.map(w => {
                const isCur = today >= w.weekStart && today <= w.weekEnd, isPast = w.weekEnd < today;
                const wh = supportWeekHead(w);
                return `<th class="rot-wk-th${isCur ? ' rot-wk-current' : ''}${showNext ? ' rot-wk-next-pi' : ''}${isPast ? ' rot-wk-past' : ''}${wh.cls}">
                    <span class="rot-wk-label"${wh.title ? ` title="${wh.title}"` : ''}>${wh.text}</span>
                    <span class="rot-wk-dates">${_rotFmtCapDate(w.weekStart)}</span>
                    ${isPast ? '<span class="rot-wk-lock rot-wk-lock--past pirot-lock" title="Semaine passée">🔒</span>' : ''}
                </th>`;
            }).join('');
            const memberRows = teamMembers.map(name => {
                const active = isMemberSupportActive(name);
                const cells = allWeeks.map(w => {
                    const entry = teamSupport.find(s => s.weekStart === w.weekStart);
                    const sel = entry && (entry.members || []).includes(name);
                    const isCur = today >= w.weekStart && today <= w.weekEnd, isPast = w.weekEnd < today;
                    const wdList = supportWorkingDays(w.weekStart);
                    const dayLevels = wdList.map(d => supportAbsenceDayLevel(name, d.iso, absences));
                    const absCount = dayLevels.filter(l => l === 'full').length + dayLevels.filter(l => l === 'half').length * 0.5;
                    const absent = isSupportAbsent(absCount);   // même seuil que le tirage (règle n°1)
                    const days = sel ? supportDaysForMember(entry, name) : [];
                    const cls = ['rot-cell', absent ? 'rot-cell-absent' : '', absCount > 0 && !absent ? 'rot-cell-partial' : '',
                        isCur ? 'rot-cell-current' : '', showNext ? 'rot-cell-next-pi' : '', isPast ? 'rot-cell-locked' : ''].filter(Boolean).join(' ');
                    const strip = wdList.map((d, i) => {
                        const abs = dayLevels[i];
                        return `<span class="rot-day${days.includes(d.index) ? ' on' : ''}${abs ? ` rot-day-abs-${abs}` : ''}${isPast ? ' rot-day-locked' : ''}"
                            title="${d.letter}${days.includes(d.index) ? ' — de support' : ''}${abs === 'full' ? ' (absent)' : abs === 'half' ? ' (½j congé)' : ''}">${d.letter}</span>`;
                    }).join('');
                    return `<td class="${cls}"><span class="rot-strip rot-strip-ro">${strip}</span></td>`;
                }).join('');
                return `<tr class="${active ? '' : 'rot-row-inactive'}">
                    <td class="rot-member-td">
                        <span class="rot-active-toggle pirot-active${active ? ' is-on' : ''}" title="${active ? 'Actif en support' : 'Hors support'}" aria-hidden="true">${active ? '🛎️' : '🚫'}</span>
                        <span class="rot-member-name${active ? '' : ' is-inactive'}" title="${esc(name)}">${esc(_fmtMemberName(name))}</span>
                    </td>
                    ${cells}
                </tr>`;
            }).join('');
            const countRow = allWeeks.map(w => {
                const cnt = weekCount(w);
                const isCur = today >= w.weekStart && today <= w.weekEnd;
                const cls = cnt === mpw ? 'rot-count-ok' : cnt > 0 ? 'rot-count-partial' : '';
                return `<td class="rot-cell rot-count-cell ${cls}${isCur ? ' rot-cell-current' : ''}${showNext ? ' rot-cell-next-pi' : ''}">${cnt}/${mpw}</td>`;
            }).join('');
            return `<div class="rot-panel" style="border-left:3px solid ${color}">
                <div class="rot-panel-hdr" data-pirot-toggle="${esc(teamName)}" role="button" tabindex="0" aria-expanded="true">
                    <span class="rot-chevron">▼</span><span class="rot-dot" style="background:${color}"></span>
                    <span class="rot-name">${esc(teamName)}</span>${summary}
                    <div class="rot-panel-actions" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-secondary rot-btn" data-rot-copy="${esc(teamName)}" title="Copier un message de rotation prêt à coller (Slack/Teams)">📋 Copier</button>
                        <button class="btn btn-sm btn-secondary rot-btn" data-pirot-edit="${esc(teamName)}" title="Modifier la rotation de ${esc(teamName)} dans Paramètres">⚙ Éditer</button>
                    </div>
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
                                <tr class="rot-count-row"><td class="rot-member-th">Total</td>${countRow}</tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        }).filter(Boolean).join('');

        const offsets  = [-2, -1, 0, 1, 2].filter(o => basePiNum ? (basePiNum + o) >= 1 : o >= 0);
        const piSelectorHtml = basePiNum ? `
            <div class="pi-selector" role="tablist" aria-label="Choix du PI">
                ${offsets.map(o => {
                    const piN = basePiNum + o;
                    const isActive = o === piOffset;
                    const label = o === 0 ? `PI${piN} <small>courant</small>` : `PI${piN}`;
                    const cls = `pi-selector-btn${isActive ? ' active' : ''}${o === 0 ? ' pi-selector-btn--current' : ''}`;
                    return `<button class="${cls}" role="tab" aria-selected="${isActive}" data-offset="${o}">${label}</button>`;
                }).join('')}
            </div>` : '';

        el.innerHTML = `
            <div class="pi-support-rota">
                <div class="pi-support-rota-hdr">
                    <div class="pi-card-title"><b>🛎️ Rotation support</b><small>Lecture seule — même grille que Paramètres → Rotation</small></div>
                    ${piSelectorHtml}
                    <a class="picap-settings-link" id="pir-goto-settings" href="#settings">
                        <svg class="icon icon-sm"><use href="#i-settings"/></svg>
                        Modifier dans Paramètres
                    </a>
                </div>
                ${panels || '<p class="text-muted text-sm">Aucune rotation configurée.</p>'}
            </div>`;

        el.querySelectorAll('.pi-selector-btn[data-offset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const o = parseInt(btn.dataset.offset, 10);
                if (!Number.isNaN(o)) store.set('piOffset', o);
            });
        });
        el.querySelectorAll('[data-pirot-toggle]').forEach(hdr => {
            const go = () => { _piRotToggle(hdr.dataset.pirotToggle); _render(); };
            hdr.addEventListener('click', e => { if (!e.target.closest('button, a')) go(); });
            hdr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
        // ⚙ Éditer : ouvre Paramètres → Rotation sur CETTE équipe (store.settingsTeam, cf. page Support)
        el.querySelectorAll('[data-pirot-edit]').forEach(btn => btn.addEventListener('click', e => {
            e.stopPropagation();
            const sb = window.__squadBoard?.store;
            sb?.set('settingsTeam', btn.dataset.pirotEdit);
            sb?.set('settingsSection', 'rotation');
            sb?.set('view', 'settings');
        }));
        el.querySelector('#pir-goto-settings')?.addEventListener('click', e => {
            e.preventDefault();
            window.__squadBoard?.store.set('settingsSection', 'rotation');
            window.__squadBoard?.store.set('view', 'settings');
        });

        el.querySelectorAll('[data-rot-copy]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const teamName = btn.dataset.rotCopy;
                const piOffset = store.get('piOffset') || 0;
                // Mêmes semaines que la grille affichée (source unique utils/pi-weeks.js).
                const { weeks: piWeeks, piNum: targetPiNum } = buildPiWeeks({ piInfo, sprintInfo, piOffset, weekMode: getSupportWeekMode(teamName) });
                const teamSup = (store.get('support') || []).filter(s => _matchTeam(s.team, teamName));
                const roleLabel = localStorage.getItem(`rot-label-${teamName}`) || 'Support N3 OPS';
                const _fmtD = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
                const _sn = n => { const nm = _fmtMemberName(n); const p = nm.trim().split(/\s+/); return p.length < 2 ? `@${nm}` : `@${p[0]} ${p.slice(1).join(' ').toUpperCase()}`; };
                const _dowFull = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
                const lines = [`🎧 *${roleLabel} — PI${targetPiNum || '?'}*`, ''];
                for (const w of piWeeks) {
                    const entry = teamSup.find(s => s.weekStart === w.weekStart);
                    const wd = supportWorkingDays(w.weekStart);
                    const members = (entry?.members || []).map(n => {
                        const days = supportDaysForMember(entry, n);
                        // Semaine pleine → juste le nom ; couverture partielle → précise les jours.
                        if (days.length && days.length < 5) {
                            const labels = days.map(di => { const iso = wd[di]?.iso; return iso ? _dowFull[new Date(iso + 'T00:00:00').getDay()] : ''; }).filter(Boolean).join('/');
                            return `${_sn(n)} (${labels})`;
                        }
                        return _sn(n);
                    }).join(', ');
                    lines.push(`  • ${w.label} (${_fmtD(w.weekStart)} → ${_fmtD(w.weekEnd)}) : ${members || '—'}`);
                }
                copySlack(lines.join('\n'), 'Rotation copiée')
                    .then(ok => { if (ok) { btn.textContent = '✓ Copié !'; setTimeout(() => { btn.textContent = '📋 Copier'; }, 1500); } });
            });
        });
    };

    _render();
}

// ── Burnup PI multi-équipes ──────────────────────────────────────────────────
