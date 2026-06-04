/**
 * Agenda - Weekly calendar view of team members with absences.
 * Guests from other teams, support highlight, keyboard autocomplete.
 */

import { store } from '../state.js';
import { esc, deriveMembersFromAbsences } from '../utils.js';

const ABSENCE_CONFIG = {
    conge:     { label: 'Congé',     color: '#6366f1', bg: '#e0e7ff' },
    maladie:   { label: 'Maladie',   color: '#ef4444', bg: '#fee2e2' },
    formation: { label: 'Formation', color: '#16a34a', bg: '#dcfce7' },
    autre:     { label: 'Autre',     color: '#64748b', bg: '#f1f5f9' },
};

const LS_EXTRAS = 'sb-agenda-extras';
const LS_HIDDEN = 'sb-agenda-hidden';

function _loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function _saveSet(key, set) {
    localStorage.setItem(key, JSON.stringify([...set]));
}

let _weekStart   = null;
let _extraNames  = _loadSet(LS_EXTRAS);
let _hiddenNames = _loadSet(LS_HIDDEN);
let _popstateAttached = false;

function _weekFromHash() {
    const m = window.location.hash.match(/\/(\d{4}-\d{2}-\d{2})$/);
    return m ? _monday(new Date(m[1])) : null;
}

function _pushWeekHash(weekStart) {
    const team = store.get('team');
    const teamSeg = team && team !== 'all' ? `/${team}` : '';
    const dateSeg = `/${_iso(weekStart)}`;
    const hash = `#agenda${teamSeg}${dateSeg}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
}

function _monday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function _addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function _iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _dayHeader(d) {
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function _absOnDay(absences, memberName, dayIso) {
    return absences.find(a =>
        a.memberName === memberName &&
        a.startDate <= dayIso &&
        a.endDate >= dayIso
    );
}

function _teamColor(teamObjects, teamName) {
    const t = teamObjects.find(o => (typeof o === 'object' ? o.name : o) === teamName);
    return (t && t.color) ? t.color : '#94a3b8';
}

function _hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function _memberRow(member, color, absences, dayIsos, today, { removable = false, onSupport = false } = {}) {
    const cells = dayIsos.map(dayIso => {
        const abs      = _absOnDay(absences, member.name, dayIso);
        const todayCls = dayIso === today ? ' agenda-today' : '';
        if (abs) {
            const cfg    = ABSENCE_CONFIG[abs.type] || ABSENCE_CONFIG.autre;
            const isHalf = abs.days === 0.5;
            const note   = abs.note ? ` title="${esc(abs.note)}"` : '';
            const label  = isHalf ? `½ ${cfg.label}` : cfg.label;
            return `<td class="agenda-cell${todayCls}">
                <span class="agenda-pill${isHalf ? ' agenda-pill--half' : ''}"${note} style="background:${cfg.bg};color:${cfg.color}">${esc(label)}</span>
            </td>`;
        }
        return `<td class="agenda-cell${todayCls}"><span class="agenda-present">✓</span></td>`;
    }).join('');

    const supportBadge = onSupport ? `<span class="agenda-support-badge" title="Support cette semaine">🎧</span>` : '';
    const guestTeam    = removable && member.team
        ? `<span class="agenda-guest-team" style="color:${color}">${esc(member.team)}</span>` : '';
    const entityBadge  = member.entity
        ? `<span class="agenda-entity-badge">${esc(member.entity)}</span>` : '';

    return `<tr class="agenda-member-row${onSupport ? ' agenda-support-row' : ''}" data-member="${esc(member.name)}">
        <td class="agenda-member-name">
            <span class="agenda-dot" style="background:${color}"></span>
            <span class="agenda-name-text">${esc(member.name)}</span>
            ${supportBadge}
            ${member.role ? `<span class="agenda-role">${esc(member.role)}</span>` : ''}
            ${entityBadge}
            ${guestTeam}
            <button class="agenda-hide-btn" data-name="${esc(member.name)}" data-removable="${removable}" title="Masquer">×</button>
        </td>
        ${cells}
    </tr>`;
}

// Extrait le nom avant " - OFF" (insensible à la casse).
// "Alice - OFF" → "Alice", "OFF" → null
function _parseOffName(title) {
    const m = title.match(/^(.+?)\s*-\s*OFF\s*$/i);
    return m ? m[1].trim() : null;
}

function _buildOffByDay(calendarEvents, dayIsos, teamFilter) {
    const filtered = (teamFilter && teamFilter !== 'all')
        ? calendarEvents.filter(e => !e.team || e.team === teamFilter)
        : calendarEvents;
    const map = {};
    for (const e of filtered) {
        const name = _parseOffName(e.title || '');
        if (!name) continue;
        const dk = new Date(e.start).toISOString().slice(0, 10);
        if (!dayIsos.includes(dk)) continue;
        if (!map[dk]) map[dk] = [];
        if (!map[dk].includes(name)) map[dk].push(name);
    }
    return map;
}

function _offBannerRow(dayIsos, offByDay, today) {
    const hasAny = dayIsos.some(dk => (offByDay[dk] || []).length > 0);
    if (!hasAny) return '';
    const cells = dayIsos.map(dk => {
        const names = offByDay[dk] || [];
        const todayCls = dk === today ? ' agenda-today' : '';
        if (!names.length) return `<td class="agenda-off-cell${todayCls}"></td>`;
        return `<td class="agenda-off-cell agenda-off-cell--active${todayCls}">
            ${names.map(n => `<span class="agenda-off-chip">${esc(n)}</span>`).join('')}
        </td>`;
    }).join('');
    return `<tr class="agenda-off-row">
        <td class="agenda-off-label">
            <span class="agenda-off-icon">🚫</span> OFF
        </td>
        ${cells}
    </tr>`;
}

export function renderAgenda(container) {
    // Lire le hash en priorité (navigation back/forward), sinon garder l'état en mémoire
    const fromHash = _weekFromHash();
    if (fromHash) _weekStart = fromHash;
    if (!_weekStart) _weekStart = _monday(new Date());
    _pushWeekHash(_weekStart);

    const teamObjects    = store.get('teamObjects') || [];
    const absences       = store.get('absences') || [];
    // Source de vérité = absences (CSV RH). La table members peut contenir des artefacts JIRA.
    const members        = deriveMembersFromAbsences(absences, store.get('members') || []);
    const support        = store.get('support') || [];
    const calendarEvents = store.get('calendarEvents') || [];
    const currentTeam    = store.get('team');
    const today          = _iso(new Date());

    // Support members this week
    const supportThisWeek = new Set(
        support
            .filter(r => r.weekStart <= today && r.weekEnd >= today)
            .flatMap(r => r.members || [])
    );

    const filteredMembers = (currentTeam && currentTeam !== 'all')
        ? members.filter(m => m.team === currentTeam)
        : members;

    const visibleNames   = new Set(filteredMembers.map(m => m.name));
    const extraMembers   = members.filter(m => _extraNames.has(m.name) && !visibleNames.has(m.name));
    const days           = Array.from({ length: 5 }, (_, i) => _addDays(_weekStart, i));
    const dayIsos        = days.map(_iso);

    const startFmt = days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const endFmt   = days[4].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    const memberTeams       = [...new Set(filteredMembers.map(m => m.team).filter(Boolean))];
    const addableCandidates = members.filter(m => !visibleNames.has(m.name) && !_extraNames.has(m.name));
    const offByDay          = _buildOffByDay(calendarEvents, dayIsos, currentTeam);

    function buildTeamRows() {
        return memberTeams.map(teamName => {
            const color       = _teamColor(teamObjects, teamName);
            const teamMembers = filteredMembers.filter(m => m.team === teamName);
            const teamBg      = _hexAlpha(color, 0.1);

            // Tri : support en premier, puis par rôle, puis par prénom nom
            const _roleRank = role => {
                const r = (role || '').toLowerCase();
                if (/scrum.master|sm\b|coach/i.test(r))           return 0;
                if (/product.owner|po\b/i.test(r))                 return 1;
                if (/tech.lead|lead|architect/i.test(r))           return 2;
                if (/dev|fullstack|front|back|mobile/i.test(r))    return 3;
                if (/qa|test|qualit/i.test(r))                     return 4;
                if (/design|ux|ui/i.test(r))                       return 5;
                if (/data|analyst/i.test(r))                       return 6;
                if (/devops|ops|infra|cloud/i.test(r))             return 7;
                return 8;
            };
            const _firstName = name => (name || '').trim().split(/\s+/)[0] || name;
            const sorted = [...teamMembers].sort((a, b) => {
                const aSupp = supportThisWeek.has(a.name) ? 0 : 1;
                const bSupp = supportThisWeek.has(b.name) ? 0 : 1;
                if (aSupp !== bSupp) return aSupp - bSupp;
                const rDiff = _roleRank(a.role) - _roleRank(b.role);
                if (rDiff !== 0) return rDiff;
                return _firstName(a.name).localeCompare(_firstName(b.name), 'fr', { sensitivity: 'base' });
            });

            const visibleCount = sorted.filter(m => !_hiddenNames.has(m.name)).length;
            if (visibleCount === 0) return '';

            const rows = sorted
                .filter(m => !_hiddenNames.has(m.name))
                .map(m => _memberRow(m, color, absences, dayIsos, today, { onSupport: supportThisWeek.has(m.name) }))
                .join('');

            return `<tr class="agenda-team-row" style="--team-color:${color};--team-bg:${teamBg}">
                <td colspan="6" class="agenda-team-header">
                    <span class="agenda-dot" style="background:${color}"></span>
                    ${esc(teamName)}
                    <span class="agenda-team-count">${visibleCount} membre${visibleCount > 1 ? 's' : ''}</span>
                </td>
            </tr>${rows}`;
        }).join('');
    }

    function buildGuestRows() {
        const visible = extraMembers.filter(m => !_hiddenNames.has(m.name));
        if (!visible.length) return '';
        const rows = visible.map(m => {
            const color = _teamColor(teamObjects, m.team);
            return _memberRow(m, color, absences, dayIsos, today, {
                removable: true,
                onSupport: supportThisWeek.has(m.name),
            });
        }).join('');
        return `<tr class="agenda-team-row agenda-guests-row">
            <td colspan="6" class="agenda-team-header">
                <svg style="width:14px;height:14px;margin-right:4px;opacity:.6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Invités pour ce point
                <span class="agenda-team-count">${visible.length} personne${visible.length > 1 ? 's' : ''}</span>
            </td>
        </tr>${rows}`;
    }

    function buildGuestChips() {
        if (!_extraNames.size) return '';
        return [..._extraNames].map(name => {
            const m     = members.find(x => x.name === name);
            const color = m ? _teamColor(teamObjects, m.team) : '#94a3b8';
            return `<span class="agenda-guest-chip" style="border-color:${color};color:${color}">
                <span class="agenda-dot" style="background:${color}"></span>
                ${esc(name)}
                <button class="agenda-chip-remove" data-name="${esc(name)}">×</button>
            </span>`;
        }).join('');
    }

    const hiddenCount = _hiddenNames.size;

    container.innerHTML = `
    <div class="agenda-wrap">
        <div class="agenda-toolbar">
            <div class="agenda-nav">
                <button class="btn btn-secondary btn-sm" id="agenda-prev" title="Semaine précédente">&#8249;</button>
                <button class="btn btn-secondary btn-sm" id="agenda-today">Aujourd'hui</button>
                <button class="btn btn-secondary btn-sm" id="agenda-next" title="Semaine suivante">&#8250;</button>
                <span class="agenda-week-label">${esc(startFmt)} – ${esc(endFmt)}</span>
            </div>
            <div class="agenda-toolbar-right">
                ${hiddenCount ? `<button class="btn btn-secondary btn-sm agenda-unhide-btn" id="agenda-unhide">
                    ${hiddenCount} masqué${hiddenCount > 1 ? 's' : ''} · Tout afficher
                </button>` : ''}
                <div class="agenda-search-wrap">
                    <svg class="icon icon-sm"><use href="#i-search"/></svg>
                    <input type="text" id="agenda-search" class="agenda-search" placeholder="Filtrer…" autocomplete="off">
                </div>
                <div class="agenda-add-wrap" id="agenda-add-wrap">
                    <svg class="icon icon-sm"><use href="#i-users"/></svg>
                    <input type="text" id="agenda-add-input" class="agenda-search" placeholder="Ajouter d'une autre équipe…" autocomplete="off">
                    <ul class="agenda-add-dropdown" id="agenda-add-dropdown" hidden></ul>
                </div>
            </div>
        </div>

        ${_extraNames.size ? `<div class="agenda-guests-bar">${buildGuestChips()}</div>` : ''}

        <div class="agenda-table-wrap">
            <table class="agenda-table">
                <thead>
                    <tr>
                        <th class="agenda-member-col">Membre</th>
                        ${days.map((d, i) => `
                            <th class="agenda-day-col${dayIsos[i] === today ? ' agenda-today' : ''}">
                                ${_dayHeader(d)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody id="agenda-tbody">
                    ${_offBannerRow(dayIsos, offByDay, today)}
                    ${buildTeamRows()}
                    ${buildGuestRows()}
                </tbody>
            </table>
        </div>

        <div class="agenda-legend">
            ${Object.entries(ABSENCE_CONFIG).map(([, cfg]) =>
                `<span class="agenda-legend-pill" style="background:${cfg.bg};color:${cfg.color}">${esc(cfg.label)}</span>`
            ).join('')}
            <span class="agenda-legend-pill agenda-legend-present">✓ Présent</span>
            ${supportThisWeek.size ? `<span class="agenda-legend-pill agenda-legend-support">🎧 Support</span>` : ''}
        </div>
    </div>`;

    // ── Week navigation ──────────────────────────────────────────────────────
    document.getElementById('agenda-prev')?.addEventListener('click', () => {
        _weekStart = _addDays(_weekStart, -7);
        _pushWeekHash(_weekStart);
        renderAgenda(container);
    });
    document.getElementById('agenda-next')?.addEventListener('click', () => {
        _weekStart = _addDays(_weekStart, 7);
        _pushWeekHash(_weekStart);
        renderAgenda(container);
    });
    document.getElementById('agenda-today')?.addEventListener('click', () => {
        _weekStart = _monday(new Date());
        _pushWeekHash(_weekStart);
        renderAgenda(container);
    });

    // Retour / avant navigateur
    if (!_popstateAttached) {
        _popstateAttached = true;
        window.addEventListener('popstate', () => {
            if (store.get('view') === 'agenda') renderAgenda(container);
        });
    }

    // ── Unhide all ───────────────────────────────────────────────────────────
    document.getElementById('agenda-unhide')?.addEventListener('click', () => {
        _hiddenNames.clear();
        _saveSet(LS_HIDDEN, _hiddenNames);
        renderAgenda(container);
    });

    // ── Filter search ────────────────────────────────────────────────────────
    const searchInput = document.getElementById('agenda-search');
    searchInput?.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        container.querySelectorAll('.agenda-member-row').forEach(row => {
            const name = (row.dataset.member || '').toLowerCase();
            row.style.display = q && !name.includes(q) ? 'none' : '';
        });
        container.querySelectorAll('.agenda-team-row').forEach(teamRow => {
            let sibling = teamRow.nextElementSibling;
            let anyVisible = false;
            while (sibling && sibling.classList.contains('agenda-member-row')) {
                if (sibling.style.display !== 'none') anyVisible = true;
                sibling = sibling.nextElementSibling;
            }
            teamRow.style.display = anyVisible || !q ? '' : 'none';
        });
    });

    // ── × hide / remove buttons ──────────────────────────────────────────────
    container.querySelectorAll('.agenda-hide-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const name      = btn.dataset.name;
            const removable = btn.dataset.removable === 'true';
            if (removable) {
                _extraNames.delete(name);
                _saveSet(LS_EXTRAS, _extraNames);
            } else {
                _hiddenNames.add(name);
                _saveSet(LS_HIDDEN, _hiddenNames);
            }
            renderAgenda(container);
        });
    });

    // Remove guest via chip × button
    container.querySelectorAll('.agenda-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            _extraNames.delete(btn.dataset.name);
            _saveSet(LS_EXTRAS, _extraNames);
            renderAgenda(container);
        });
    });

    // ── Custom autocomplete for "add guest" ──────────────────────────────────
    const addInput    = document.getElementById('agenda-add-input');
    const dropdown    = document.getElementById('agenda-add-dropdown');
    let _acIndex      = -1; // highlighted index

    function _acCandidates(q) {
        const lower = q.toLowerCase();
        return addableCandidates.filter(m =>
            m.name.toLowerCase().includes(lower) ||
            (m.team || '').toLowerCase().includes(lower)
        );
    }

    function _acRender(candidates) {
        if (!candidates.length) { dropdown.hidden = true; return; }
        dropdown.innerHTML = candidates.map((m, i) => {
            const color = _teamColor(teamObjects, m.team);
            return `<li class="agenda-ac-item" data-index="${i}" data-name="${esc(m.name)}">
                <span class="agenda-dot" style="background:${color}"></span>
                <span class="agenda-ac-name">${esc(m.name)}</span>
                <span class="agenda-ac-team" style="color:${color}">${esc(m.team || '')}</span>
                ${m.entity ? `<span class="agenda-ac-entity">${esc(m.entity)}</span>` : ''}
            </li>`;
        }).join('');
        dropdown.hidden = false;
        _acHighlight(0);
    }

    function _acHighlight(idx) {
        const items = dropdown.querySelectorAll('.agenda-ac-item');
        items.forEach((el, i) => el.classList.toggle('agenda-ac-active', i === idx));
        _acIndex = idx;
    }

    function _acSelect(name) {
        const match = members.find(m => m.name === name);
        if (!match || visibleNames.has(name)) { addInput.value = ''; dropdown.hidden = true; return; }
        _extraNames.add(name);
        _saveSet(LS_EXTRAS, _extraNames);
        addInput.value = '';
        dropdown.hidden = true;
        renderAgenda(container);
    }

    addInput?.addEventListener('input', () => {
        const q = addInput.value.trim();
        if (!q) { dropdown.hidden = true; _acIndex = -1; return; }
        _acRender(_acCandidates(q));
    });

    addInput?.addEventListener('keydown', e => {
        if (dropdown.hidden) return;
        const items = dropdown.querySelectorAll('.agenda-ac-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _acHighlight(Math.min(_acIndex + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _acHighlight(Math.max(_acIndex - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const active = dropdown.querySelector('.agenda-ac-active');
            if (active) _acSelect(active.dataset.name);
        } else if (e.key === 'Escape') {
            dropdown.hidden = true;
        }
    });

    addInput?.addEventListener('blur', () => {
        // Delay to allow click on dropdown item
        setTimeout(() => { dropdown.hidden = true; }, 150);
    });

    dropdown?.addEventListener('mousedown', e => {
        const item = e.target.closest('.agenda-ac-item');
        if (item) _acSelect(item.dataset.name);
    });
}
