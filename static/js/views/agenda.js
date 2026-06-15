/**
 * Agenda - Weekly calendar view of team members with absences.
 * Guests from other teams, support highlight, keyboard autocomplete.
 */

import { store } from '../state.js';
import { esc, deriveMembersFromAbsences, getCurrentPi, extractTeam } from '../utils.js';

const ABSENCE_CONFIG = {
    conge:     { label: 'Congé',     color: '#991b1b', bg: '#fecaca' },
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

// supportDays     : Set<isoDate> — jours de la semaine affichée où ce membre est de support
// nextWeekSupport : true si de support la semaine suivante (tri uniquement, pas de badge)
// supportPal      : palette couleur du segment ({row, cell, …}) — cohérence banner ↔ table
function _memberRow(member, color, absences, dayIsos, today, { removable = false, supportDays = null, nextWeekSupport = false, supportPal = null } = {}) {
    const onSupport = !!(supportDays?.size);
    const _DA = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    const supIdx = dayIsos.map((iso, i) => supportDays?.has(iso) ? i : -1).filter(i => i >= 0);
    const supTitle = !onSupport ? '' :
        supIdx.length === dayIsos.length ? 'Support toute la semaine' :
        supIdx.length === 1 ? `Support ${_DA[supIdx[0]]}` :
        `Support ${_DA[supIdx[0]]}–${_DA[supIdx[supIdx.length - 1]]}`;

    const cells = dayIsos.map((dayIso, di) => {
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
        if (supportDays?.has(dayIso)) {
            const cellBg = supportPal?.cell || 'rgba(254,249,195,.82)';
            return `<td class="agenda-cell agenda-cell--support${todayCls}" style="background:${cellBg}" title="${esc(supTitle)}"><span class="agenda-present">✓</span></td>`;
        }
        return `<td class="agenda-cell${todayCls}"><span class="agenda-present">✓</span></td>`;
    }).join('');

    const supportBadge = onSupport
        ? `<span class="agenda-support-badge${supIdx.length < dayIsos.length ? ' agenda-support-badge--partial' : ''}" title="${esc(supTitle)}">🎧</span>`
        : '';
    const guestTeam    = removable && member.team
        ? `<span class="agenda-guest-team" style="color:${color}">${esc(member.team)}</span>` : '';
    const entityBadge  = member.entity
        ? `<span class="agenda-entity-badge">${esc(member.entity)}</span>` : '';

    return `<tr class="agenda-member-row${onSupport ? ' agenda-support-row' : ''}"${onSupport && supportPal ? ` style="--support-row-bg:${supportPal.row}"` : ''} data-member="${esc(member.name)}">
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
            <button class="agenda-off-copy-btn" id="agenda-off-copy-btn" title="Copier pour Slack">📋</button>
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
    const support        = store.get('support') || [];
    const calendarEvents = store.get('calendarEvents') || [];
    const currentTeam    = store.get('team');
    const today          = _iso(new Date());

    // Membres effectifs : aligne sur la page Rotation (snapshot PI en priorité → turnover inter-PI).
    // Fallback sur deriveMembersFromAbsences si aucun snapshot disponible pour ce PI.
    const piInfo       = store.get('piInfo') || {};
    const sprintInfo   = store.get('sprintInfo');
    const piOffset     = store.get('piOffset') || 0;
    const _basePiNum   = getCurrentPi({ sprintInfo, piInfo });
    const displayPiNum = _basePiNum ? Math.max(1, _basePiNum + piOffset) : (piInfo.number || 0);
    const _piSnapshot  = displayPiNum ? ((piInfo.piMembers || {})[String(displayPiNum)] || null) : null;
    const members = (_piSnapshot && _piSnapshot.length)
        ? _piSnapshot.map(m => ({ ...m, team: extractTeam(m.team) }))
        : deriveMembersFromAbsences(absences, store.get('members') || []);

    // Support per day — la frontière de semaine peut tomber en milieu de semaine agenda
    // (ex. mode 'friday' : ven→jeu, donc lun–jeu et ven peuvent avoir des binômes différents)
    const _earlyDayIsos = Array.from({ length: 5 }, (_, i) => _iso(_addDays(_weekStart, i)));
    const _supportForDay = dayIso => new Set(
        support.filter(r => {
            if (currentTeam && currentTeam !== 'all' && r.team !== currentTeam) return false;
            return r.weekStart <= dayIso && r.weekEnd >= dayIso;
        }).flatMap(r => r.members || [])
    );
    const _setsEq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
    const _supportSegs = [];
    for (const dIso of _earlyDayIsos) {
        const mems = _supportForDay(dIso);
        const last = _supportSegs[_supportSegs.length - 1];
        if (last && _setsEq(last.members, mems)) last.days.push(dIso);
        else _supportSegs.push({ days: [dIso], members: mems });
    }
    // Union — le badge Support sur un membre s'affiche s'il est de support un jour quelconque de la semaine
    const supportThisWeek = new Set(_supportSegs.flatMap(s => [...s.members]));

    // Map membre → Set<isoDate> des jours de support dans la semaine affichée
    const _supportDaysByMember = new Map();
    for (const seg of _supportSegs) {
        for (const name of seg.members) {
            if (!_supportDaysByMember.has(name)) _supportDaysByMember.set(name, new Set());
            for (const dIso of seg.days) _supportDaysByMember.get(name).add(dIso);
        }
    }

    // Support semaine suivante — pour le tri 3 niveaux (cette semaine → semaine d'après → reste)
    const _nextDayIsos    = Array.from({ length: 5 }, (_, i) => _iso(_addDays(_weekStart, 7 + i)));
    const supportNextWeek = new Set(_nextDayIsos.flatMap(dIso => [..._supportForDay(dIso)]));

    // Palette de couleurs par segment — amber / orange pastel / vert (extensible)
    // Propagée au banner ET aux lignes membres pour cohérence visuelle
    const _SEG_PAL = [
        { row: 'rgba(254,249,195,.50)', cell: 'rgba(254,249,195,.82)', chipBg: '#fef9c3', chipBorder: '#fde68a', chipColor: '#92400e', rangeColor: '#b45309' },
        { row: 'rgba(255,237,213,.50)', cell: 'rgba(255,237,213,.82)', chipBg: '#ffedd5', chipBorder: '#fed7aa', chipColor: '#9a3412', rangeColor: '#c2410c' },
        { row: 'rgba(209,250,229,.50)', cell: 'rgba(209,250,229,.82)', chipBg: '#d1fae5', chipBorder: '#a7f3d0', chipColor: '#065f46', rangeColor: '#059669' },
    ];
    let _palIdx = 0;
    for (const seg of _supportSegs) {
        seg.pal = seg.members.size > 0 ? _SEG_PAL[_palIdx++ % _SEG_PAL.length] : null;
    }
    // Map nom → palette du segment (premier segment rencontré si chevauchement)
    const _memberSegPal = new Map();
    for (const seg of _supportSegs) {
        if (!seg.pal) continue;
        for (const name of seg.members) {
            if (!_memberSegPal.has(name)) _memberSegPal.set(name, seg.pal);
        }
    }

    // Matching tolérant équipe (même logique que la page Rotation) :
    // "GCOM - Fuego".includes("fuego") → match, évite les membres manquants après snapshot
    const _nm = s => (s || '').toLowerCase().trim();
    const _teamMatch = (mTeam, target) => {
        const t = _nm(mTeam); const tgt = _nm(target);
        return t === tgt || (tgt && t && (t.includes(tgt) || tgt.includes(t)));
    };
    // Normalise le nom d'équipe pour que buildTeamRows() et _teamColor() retrouvent le bon groupe.
    // Sans ça, un snapshot avec "GCOM - Fuego" crée un sous-groupe fantôme sans couleur.
    const filteredMembers = (() => {
        const base = (currentTeam && currentTeam !== 'all')
            ? members
                .filter(m => _teamMatch(m.team, currentTeam))
                .map(m => ({ ...m, team: currentTeam }))
            : members.map(m => {
                const hit = teamObjects.find(t => _teamMatch(m.team, typeof t === 'object' ? t.name : t));
                return hit ? { ...m, team: typeof hit === 'object' ? hit.name : hit } : m;
            });
        const baseNames = new Set(base.map(m => m.name));
        // Tout membre dans le support (cette semaine ou la suivante) doit apparaître dans le tableau.
        // Cas typique : rotation générée avant un import CSV → nom dans r.members mais absent du snapshot.
        const missing = [...new Set([...supportThisWeek, ...supportNextWeek])]
            .filter(name => !baseNames.has(name))
            .map(name => {
                const rotRecord = support.find(r => (r.members || []).includes(name));
                const team = currentTeam && currentTeam !== 'all'
                    ? currentTeam
                    : (rotRecord?.team || '');
                return { name, team, role: '' };
            });
        return [...base, ...missing];
    })();

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
                // Tri par segment de palette (amber=0, bleu=1, …), puis semaine suivante, puis reste
                const _rank = n => {
                    const palIdx = _memberSegPal.has(n) ? _SEG_PAL.indexOf(_memberSegPal.get(n)) : -1;
                    if (palIdx >= 0) return palIdx;
                    if (supportNextWeek.has(n)) return _SEG_PAL.length;
                    return _SEG_PAL.length + 1;
                };
                const rk = _rank(a.name) - _rank(b.name);
                if (rk !== 0) return rk;
                const rDiff = _roleRank(a.role) - _roleRank(b.role);
                if (rDiff !== 0) return rDiff;
                return _firstName(a.name).localeCompare(_firstName(b.name), 'fr', { sensitivity: 'base' });
            });

            const visibleCount = sorted.filter(m => !_hiddenNames.has(m.name)).length;
            if (visibleCount === 0) return '';

            const rows = sorted
                .filter(m => !_hiddenNames.has(m.name))
                .map(m => _memberRow(m, color, absences, dayIsos, today, {
                    supportDays: _supportDaysByMember.get(m.name) || null,
                    nextWeekSupport: !supportThisWeek.has(m.name) && supportNextWeek.has(m.name),
                    supportPal: _memberSegPal.get(m.name) || null,
                }))
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
                supportDays: _supportDaysByMember.get(m.name) || null,
                nextWeekSupport: !supportThisWeek.has(m.name) && supportNextWeek.has(m.name),
                supportPal: _memberSegPal.get(m.name) || null,
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

    // Banner support — segmenté quand le support change en milieu de semaine agenda
    const _DAY_ABBR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    const _segLabel = seg => {
        const fi = _earlyDayIsos.indexOf(seg.days[0]);
        const li = _earlyDayIsos.indexOf(seg.days[seg.days.length - 1]);
        return fi === li ? _DAY_ABBR[fi] : `${_DAY_ABBR[fi]}–${_DAY_ABBR[li]}`;
    };
    const _activeSegs = _supportSegs.filter(s => s.members.size > 0);
    const _multiSeg = _activeSegs.length > 1;
    const supportBannerHtml = !supportThisWeek.size ? '' :
        `<div class="agenda-support-bar">
            <span class="agenda-support-bar-icon">🎧</span>
            <span class="agenda-support-bar-label">Support</span>
            ${_activeSegs.map((seg, i) =>
                `${i > 0 ? '<span class="agenda-support-seg-div">·</span>' : ''}` +
                `<span class="agenda-support-seg"${seg.pal ? ` style="--seg-chip-bg:${seg.pal.chipBg};--seg-chip-border:${seg.pal.chipBorder};--seg-chip-color:${seg.pal.chipColor};--seg-range-color:${seg.pal.rangeColor}"` : ''}>` +
                (_multiSeg ? `<span class="agenda-support-seg-range">${_segLabel(seg)}</span>` : '') +
                [...seg.members].map(n => `<span class="agenda-support-bar-chip">${esc(n)}</span>`).join('') +
                `</span>`
            ).join('')}
            <button class="btn btn-secondary btn-xs" id="agenda-support-copy-btn" title="Copier les membres de support">📋 Copier</button>
        </div>`;

    container.innerHTML = `
    <div class="agenda-wrap">
        <div class="agenda-toolbar">
            <div class="agenda-nav">
                <button class="btn btn-secondary btn-sm" id="agenda-prev" title="Semaine précédente">&#8249;</button>
                <button class="btn btn-secondary btn-sm" id="agenda-today">Aujourd'hui</button>
                <button class="btn btn-secondary btn-sm" id="agenda-next" title="Semaine suivante">&#8250;</button>
                <span class="agenda-week-label">${esc(startFmt)} – ${esc(endFmt)}</span>
                <button class="btn btn-secondary btn-xs agenda-week-copy-btn" id="agenda-week-copy-btn" title="Copier l'agenda de la semaine pour Slack">📋 Semaine</button>
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

        ${supportBannerHtml}

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

    // ── Helpers Slack partagés ────────────────────────────────────────────────
    const _buildDateRange = () => {
        const _fmtM = d => d.toLocaleDateString('fr-FR', { month: 'long' });
        const weekEnd = new Date(_weekStart); weekEnd.setDate(_weekStart.getDate() + 4);
        return _weekStart.getMonth() === weekEnd.getMonth()
            ? `${_weekStart.getDate()}–${weekEnd.getDate()} ${_fmtM(_weekStart)}`
            : `${_weekStart.getDate()} ${_fmtM(_weekStart)} – ${weekEnd.getDate()} ${_fmtM(weekEnd)}`;
    };
    // "@Prenom NOM" — premier mot tel quel, reste en MAJUSCULES
    const _slackName = name => {
        const parts = name.trim().split(/\s+/);
        return parts.length < 2 ? `@${name}` : `@${parts[0]} ${parts.slice(1).join(' ').toUpperCase()}`;
    };
    const _atNames = names => [...names].map(_slackName).join(', ');
    // Même emojis que le bloc AGENDA DU JOUR de cal_banner.js
    const _ABS_EMOJI = { conge: '🏖️', maladie: '🤒', formation: '📚', autre: '📌' };
    const _SDA = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    const _dayRange = (from, to) => from === to ? _SDA[from] : `${_SDA[from]}–${_SDA[to]}`;

    const _copyDone = (btn, label) => {
        btn.textContent = '✓ Copié !';
        setTimeout(() => { btn.textContent = label; }, 1600);
    };

    // ── Support copy ─────────────────────────────────────────────────────────
    document.getElementById('agenda-support-copy-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('agenda-support-copy-btn');
        const dateRange = _buildDateRange();
        const _nextOnly = [...supportNextWeek].filter(n => !supportThisWeek.has(n));
        let msg;
        if (_multiSeg) {
            const lines = [`🎧 *Support · ${dateRange}*`];
            for (const seg of _activeSegs) lines.push(`  • ${_segLabel(seg)} : ${_atNames(seg.members)}`);
            if (_nextOnly.length) lines.push(`  → Semaine prochaine : ${_atNames(_nextOnly)}`);
            msg = lines.join('\n');
        } else if (_nextOnly.length) {
            msg = `🎧 *Support · ${dateRange}* : ${_atNames(supportThisWeek)}\n  → Semaine prochaine : ${_atNames(_nextOnly)}`;
        } else {
            msg = `🎧 *Support · ${dateRange}* : ${_atNames(supportThisWeek)}`;
        }
        try {
            await navigator.clipboard.writeText(msg);
            if (btn) _copyDone(btn, '📋 Copier');
        } catch {}
    });

    // ── OFF copy ─────────────────────────────────────────────────────────────
    document.getElementById('agenda-off-copy-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('agenda-off-copy-btn');
        const dateRange = _buildDateRange();
        const personDays = new Map();
        for (let i = 0; i < dayIsos.length; i++) {
            for (const name of (offByDay[dayIsos[i]] || [])) {
                if (!personDays.has(name)) personDays.set(name, []);
                personDays.get(name).push(i);
            }
        }
        if (!personDays.size) return;
        const lines = [`🏖️ *OFF · ${dateRange}*`];
        for (const [name, idxs] of personDays) {
            lines.push(`  • ${_slackName(name)} (${_dayRange(idxs[0], idxs[idxs.length - 1])})`);
        }
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '📋'; }, 1600); }
        } catch {}
    });

    // ── Full week copy ────────────────────────────────────────────────────────
    document.getElementById('agenda-week-copy-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('agenda-week-copy-btn');
        const dateRange = _buildDateRange();
        const teamLabel = currentTeam && currentTeam !== 'all' ? ` ${currentTeam}` : '';
        const lines = [`:date: *AGENDA${teamLabel} — ${dateRange}*`, ''];

        // Support
        if (supportThisWeek.size) {
            const _nextOnly = [...supportNextWeek].filter(n => !supportThisWeek.has(n));
            if (_multiSeg) {
                lines.push('🎧 *Support*');
                for (const seg of _activeSegs) lines.push(`  • ${_segLabel(seg)} : ${_atNames(seg.members)}`);
            } else {
                lines.push(`🎧 *Support* : ${_atNames(supportThisWeek)}`);
            }
            if (_nextOnly.length) lines.push(`  → Semaine prochaine : ${_atNames(_nextOnly)}`);
            lines.push('');
        }

        // Absences store (congé, maladie, formation…) — une ligne par personne·absence·plage
        const _offPeople = new Map();
        for (let i = 0; i < dayIsos.length; i++) {
            for (const name of (offByDay[dayIsos[i]] || [])) {
                if (!_offPeople.has(name)) _offPeople.set(name, []);
                _offPeople.get(name).push(i);
            }
        }

        const _absLines = [];
        for (const m of filteredMembers) {
            const memberAbs = [];
            let cur = null;
            for (let i = 0; i < dayIsos.length; i++) {
                const abs = _absOnDay(absences, m.name, dayIsos[i]);
                if (abs) {
                    if (cur && cur.type === abs.type) { cur.to = i; }
                    else { cur = { type: abs.type, from: i, to: i }; memberAbs.push(cur); }
                } else { cur = null; }
            }
            for (const a of memberAbs) {
                const emoji = _ABS_EMOJI[a.type] || '📌';
                const cfg   = ABSENCE_CONFIG[a.type] || ABSENCE_CONFIG.autre;
                _absLines.push(`${emoji} ${_slackName(m.name)} — ${cfg.label} ${_dayRange(a.from, a.to)}`);
            }
        }
        // OFF calendrier — même emoji 🏖️ que cal_banner
        for (const [name, idxs] of _offPeople) {
            _absLines.push(`🏖️ ${_slackName(name)} — OFF ${_dayRange(idxs[0], idxs[idxs.length - 1])}`);
        }
        if (_absLines.length) { lines.push(..._absLines); lines.push(''); }

        // Disponibles toute la semaine
        const _absentSet = new Set([
            ...filteredMembers.filter(m => dayIsos.some(iso => _absOnDay(absences, m.name, iso))).map(m => m.name),
            ..._offPeople.keys(),
        ]);
        const _presentNames = filteredMembers.filter(m => !_absentSet.has(m.name)).map(m => _slackName(m.name));
        if (_presentNames.length) lines.push(`✅ *Dispo* : ${_presentNames.join(', ')}`);

        try {
            await navigator.clipboard.writeText(lines.join('\n').trimEnd());
            if (btn) _copyDone(btn, '📋 Semaine');
        } catch {}
    });

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
