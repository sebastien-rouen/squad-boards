/**
 * Atlas — vue de pilotage humain (coaching / RH / onboarding).
 *
 * 2 onglets :
 *   1. Carte unFIX  : visualisation zoomable Programme → Groupes → Équipes → Membres
 *   2. Skills Matrix : grille compétences/appétences éditable (scope membre OU équipe)
 *
 * Source de vérité des personnes = absences (CSV RH) via deriveMembersFromAbsences.
 * Compétences/appétences stockées côté backend (tables dédiées).
 */

import { store } from '../state.js';
import { esc, deriveMembersFromAbsences, initials, hashColor } from '../utils.js';
import * as api from '../api.js';

// ── Référentiels métier ───────────────────────────────────────────────────────
export const SKILL_LEVELS = [
    { v: 0, label: 'Non évalué',            short: '–', color: 'var(--border)', desc: 'Compétence non encore évaluée pour cette personne / équipe.' },
    { v: 1, label: 'Exécutant spécialisé',  short: '1', color: '#94a3b8', desc: 'Réalise des tâches cadrées sous supervision. Maîtrise un périmètre restreint.' },
    { v: 2, label: 'Opérationnel structuré',short: '2', color: '#38bdf8', desc: 'Autonome sur les cas courants. Applique les standards sans assistance.' },
    { v: 3, label: 'Ingénieur cloud ready', short: '3', color: '#22c55e', desc: 'Conçoit des solutions robustes, gère la complexité, accompagne les autres.' },
    { v: 4, label: 'Référent / architecte', short: '4', color: '#a855f7', desc: 'Référence sur le sujet. Définit les standards, forme et arbitre.' },
];
export const APPETENCE_VALUES = [
    { v: 'faible', label: 'Faible', color: '#94a3b8', icon: '○' },
    { v: 'neutre', label: 'Neutre', color: '#cbd5e1', icon: '◐' },
    { v: 'forte',  label: 'Forte',  color: '#f59e0b', icon: '●' },
];

const _levelMeta = v => SKILL_LEVELS.find(l => l.v === v) || SKILL_LEVELS[0];
const _appMeta   = v => APPETENCE_VALUES.find(a => a.v === v) || APPETENCE_VALUES[1];

// État local de la vue (persiste en session)
let _tab    = localStorage.getItem('sb-atlas-tab') || 'map';
let _matrixScope = localStorage.getItem('sb-atlas-scope') || 'member'; // member | team
let _matrixQuery = '';        // recherche par nom d'entité (membre/équipe)
let _matrixHideEmpty = false; // masquer les colonnes/lignes sans aucune évaluation
let _dashboardVisible = localStorage.getItem('sb-atlas-dashboard') === '1';
let _objPiOffset = 0;               // 0 = PI courant, -1 = PI-1, etc.
const _objUnlockedOffsets = new Set(); // PI passés déverrouillés pour édition

// ── Helpers données ────────────────────────────────────────────────────────────
function _allMembers() {
    return deriveMembersFromAbsences(store.get('absences') || [], store.get('members') || []);
}

/** Construit la hiérarchie Programme → Groupes → Équipes → Membres filtrée par topbar. */
function _buildHierarchy() {
    const groups      = store.get('groups') || [];
    const teamObjects = store.get('teamObjects') || [];
    const baseMembers = _allMembers();
    const selTeam     = store.get('team');
    const selGroup    = store.get('group');

    // Applique les simulations de staffing (#7) : déplace les membres simulés
    const allMembers = _simMoves.size
        ? baseMembers.map(m => _simMoves.has(m.name) ? { ...m, team: _simMoves.get(m.name) } : m)
        : baseMembers;

    const teamColor = name => teamObjects.find(t => t.name === name)?.color || hashColor(name);
    const membersOf = team => allMembers.filter(m => m.team === team);

    // Équipes rattachées à un groupe (les autres = "Hors groupe")
    const grouped = new Set();
    const groupNodes = groups.map(g => {
        const teams = (g.teams || []).filter(Boolean);
        teams.forEach(t => grouped.add(t));
        return {
            id: g.id, name: g.name, color: g.color || '#6366f1', kind: 'group',
            teams: teams.map(t => ({
                name: t, color: teamColor(t), kind: 'team',
                members: membersOf(t),
            })),
        };
    });

    const ungroupedTeams = (store.get('teams') || [])
        .filter(t => !grouped.has(t))
        .map(t => ({ name: t, color: teamColor(t), kind: 'team', members: membersOf(t) }));

    let nodes = [...groupNodes];
    if (ungroupedTeams.length) {
        nodes.push({ id: '_ungrouped', name: 'Hors ligne produit', color: '#64748b', kind: 'group', teams: ungroupedTeams });
    }

    // Filtre topbar : groupe sélectionné OU équipe spécifique
    if (selGroup) {
        nodes = nodes.filter(g => g.id === selGroup);
    } else if (selTeam && selTeam !== 'all') {
        nodes = nodes
            .map(g => ({ ...g, teams: g.teams.filter(t => t.name === selTeam) }))
            .filter(g => g.teams.length);
    }
    return nodes;
}

// ── Rendu principal ────────────────────────────────────────────────────────────
export function renderAtlas(container) {
    container.innerHTML = `
        <div class="atlas">
            <div class="atlas-tabs" role="tablist">
                <button class="atlas-tab${_tab === 'map' ? ' active' : ''}" data-tab="map" role="tab">🗺️ Carte unFIX</button>
                <button class="atlas-tab${_tab === 'matrix' ? ' active' : ''}" data-tab="matrix" role="tab">🎯 Skills Matrix</button>
            </div>
            <div class="atlas-body" id="atlas-body"></div>
        </div>`;

    container.querySelectorAll('.atlas-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            _tab = btn.dataset.tab;
            localStorage.setItem('sb-atlas-tab', _tab);
            container.querySelectorAll('.atlas-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _tab));
            _renderBody(container.querySelector('#atlas-body'));
        });
    });

    _renderBody(container.querySelector('#atlas-body'));

    // Re-render sur changement de filtre topbar / données
    if (!container._atlasSubs) {
        const rerender = () => { if (container.isConnected) _renderBody(container.querySelector('#atlas-body')); };
        container._atlasSubs = [
            store.on('team', rerender), store.on('group', rerender),
            store.on('memberSkills', rerender), store.on('memberAppetences', rerender),
            store.on('skills', rerender), store.on('appetences', rerender),
        ];
    }
}

function _renderBody(el) {
    if (!el) return;
    if (_tab === 'map') _renderMap(el);
    else _renderMatrix(el);
}

// ══════════════════════════════════════════════════════════════════════════════
// Onglet 1 — Carte unFIX zoomable (SVG)
// ══════════════════════════════════════════════════════════════════════════════
// Niveaux de zoom : 0=programme (groupes), 1=groupe (équipes), 2=équipe (membres)
let _zoom = { level: 0, groupId: null, team: null };

// ── Simulation staffing drag & drop (#7) ──────────────────────────────────────
let _simMoves = new Map(); // memberName → targetTeam (simulation uniquement)
let _simMode  = false;     // mode simulation actif

function _simReset() { _simMoves.clear(); _simMode = false; }

/** Résout l'équipe effective d'un membre (prend en compte les simulations). */
function _simTeam(memberName, realTeam) {
    return _simMoves.has(memberName) ? _simMoves.get(memberName) : realTeam;
}

/** Calcule l'impact de la simulation sur une équipe (delta membres). */
function _simImpact(nodes) {
    if (!_simMoves.size) return [];
    const impacts = [];
    for (const [member, newTeam] of _simMoves) {
        const oldTeamNode = nodes.flatMap(g => g.teams).find(t => t.members.some(m => m.name === member));
        if (oldTeamNode && oldTeamNode.name !== newTeam) {
            impacts.push({ member, from: oldTeamNode.name, to: newTeam });
        }
    }
    return impacts;
}

// ── Recherche de compétence "qui sait faire X ?" (#8) ─────────────────────────
let _skillSearch = localStorage.getItem('sb-atlas-skill-search') || '';
let _skillHitSet = new Set(); // noms de membres matchant la recherche

/** Reconstruit le set de membres correspondant à la recherche de compétence. */
function _buildSkillHitSet(query) {
    _skillHitSet.clear();
    if (!query) return;
    const q = query.trim().toLowerCase();
    const skills = store.get('skills') || [];
    const matched = skills.filter(s => s.name.toLowerCase().includes(q));
    if (!matched.length) return;
    const ms = store.get('memberSkills') || [];
    for (const row of ms) {
        if (row.scope !== 'member') continue;
        if (row.level < 2) continue;
        if (matched.some(s => s.id === row.skillId)) _skillHitSet.add(row.scopeKey);
    }
}

function _renderMap(el) {
    const nodes = _buildHierarchy();
    if (!nodes.length) {
        el.innerHTML = `<div class="atlas-empty">Aucune équipe à afficher. Configurez des équipes et importez les absences (CSV RH).</div>`;
        return;
    }

    // Réinitialise le zoom si le contexte n'existe plus
    if (_zoom.level >= 1 && !nodes.find(g => g.id === _zoom.groupId)) _zoom = { level: 0, groupId: null, team: null };

    // Calcule les hits avant de rendre les chips
    _buildSkillHitSet(_skillSearch);

    const hitCount = _skillSearch ? _skillHitSet.size : 0;

    el.innerHTML = `
        <div class="atlas-map${_skillSearch ? ' atlas-map--search-active' : ''}">
            <div class="atlas-map-bar">
                ${_breadcrumbHtml(nodes)}
                <div class="atlas-skill-search">
                    <input class="input input-sm atlas-skill-search-input" id="atlas-skill-q"
                        placeholder="🔍 Qui sait faire…?" value="${esc(_skillSearch)}" autocomplete="off"
                        title="Chercher une compétence — highlight des membres niveau ≥ 2">
                    ${_skillSearch ? `<span class="atlas-skill-hit-count">${hitCount} pers.</span>` : ''}
                    ${_skillSearch ? `<button class="btn-icon atlas-skill-clear" id="atlas-skill-clear" title="Effacer la recherche">✕</button>` : ''}
                </div>
                <div class="atlas-map-zoom">
                    <button class="btn-icon" id="atlas-zoom-out" title="Dézoomer"><svg class="icon icon-sm"><use href="#i-minus"/></svg></button>
                    <button class="btn-icon" id="atlas-zoom-reset" title="Vue programme"><svg class="icon icon-sm"><use href="#i-grid"/></svg></button>
                    <button class="btn-icon" id="atlas-tour" title="Visite guidée automatique (onboarding)"><svg class="icon icon-sm"><use href="#i-play"/></svg></button>
                    <button class="btn-icon" id="atlas-export-png" title="Exporter la carte en image (PNG)"><svg class="icon icon-sm"><use href="#i-download"/></svg></button>
                    <button class="btn-icon" id="atlas-present" title="Mode présentation / onboarding (plein écran)"><svg class="icon icon-sm"><use href="#i-maximize"/></svg></button>
                    <button class="btn-icon${_simMode ? ' is-active' : ''}" id="atlas-sim-toggle" title="${_simMode ? 'Quitter la simulation de staffing' : 'Simuler un transfert de membre (drag & drop)'}">🔄</button>
                    <button class="btn-icon" id="atlas-compare" title="Comparer des équipes côte à côte (Skills Matrix + radars)">⚖️</button>
                </div>
            </div>
            ${_simMode && _simMoves.size ? `<div class="atlas-sim-banner">
                <span class="atlas-sim-icon">🔄</span>
                <span class="atlas-sim-label">Simulation staffing — ${_simMoves.size} déplacement(s)</span>
                <span class="atlas-sim-moves">${[..._simMoves.entries()].map(([m, t]) => `<span class="atlas-sim-move">${esc(m)} → ${esc(t)}</span>`).join('')}</span>
                <button class="btn btn-sm btn-secondary" id="atlas-sim-cancel">Annuler</button>
            </div>` : ''}
            <div class="atlas-map-stage${_simMode ? ' atlas-map-stage--sim' : ''}" id="atlas-stage">
                ${_mapStageHtml(nodes)}
            </div>
            <div class="atlas-map-legend">${_mapLegendHtml()}</div>
        </div>`;

    // Wire skill search
    const searchEl = el.querySelector('#atlas-skill-q');
    if (searchEl) {
        let _ssTimer;
        searchEl.addEventListener('input', () => {
            clearTimeout(_ssTimer);
            _ssTimer = setTimeout(() => {
                _skillSearch = searchEl.value;
                localStorage.setItem('sb-atlas-skill-search', _skillSearch);
                _renderMap(el);
                el.querySelector('#atlas-skill-q')?.focus();
            }, 200);
        });
        searchEl.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                _skillSearch = '';
                localStorage.removeItem('sb-atlas-skill-search');
                _renderMap(el);
            }
        });
    }
    el.querySelector('#atlas-skill-clear')?.addEventListener('click', () => {
        _skillSearch = '';
        localStorage.removeItem('sb-atlas-skill-search');
        _renderMap(el);
    });

    // Toggle simulation staffing (#7)
    el.querySelector('#atlas-sim-toggle')?.addEventListener('click', () => {
        _simMode = !_simMode;
        if (!_simMode) _simReset();
        _renderMap(el);
    });
    el.querySelector('#atlas-sim-cancel')?.addEventListener('click', () => {
        _simReset();
        _renderMap(el);
    });

    // Comparateur d'équipes (#1)
    el.querySelector('#atlas-compare')?.addEventListener('click', () => _openCompareModal());

    _wireMap(el, nodes);
}

// ── Comparateur d'équipes (#1) ────────────────────────────────────────────────
function _openCompareModal() {
    document.getElementById('atlas-compare-overlay')?.remove();

    const allTeams  = store.get('teams') || [];
    const skills    = [...(store.get('skills') || [])].sort(_bySort);
    const allMem    = _allMembers();
    const groups    = store.get('groups') || [];
    const teamObjs  = store.get('teamObjects') || [];

    const overlay = document.createElement('div');
    overlay.id = 'atlas-compare-overlay';
    overlay.className = 'atlas-mobility-overlay';

    const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899'];

    overlay.innerHTML = `
        <div class="atlas-compare-modal">
            <div class="atlas-mobility-hdr">
                <h3>⚖️ Comparer des équipes</h3>
                <button class="btn-icon" id="atlas-cmp-close"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
            <div class="atlas-cmp-selectors">
                ${[0, 1, 2].map(i => `
                    <select class="select" id="atlas-cmp-t${i}">
                        <option value="">— Équipe ${i + 1} —</option>
                        ${allTeams.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                    </select>`).join('')}
            </div>
            <div id="atlas-cmp-body" class="atlas-cmp-body">
                <p class="atlas-empty-sm">Sélectionnez au moins 2 équipes pour comparer.</p>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => {
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#atlas-cmp-close').addEventListener('click', close);

    let _cmpChart = null;

    function _renderCompare() {
        const selTeams = [0, 1, 2]
            .map(i => overlay.querySelector(`#atlas-cmp-t${i}`)?.value)
            .filter(Boolean);

        const body = overlay.querySelector('#atlas-cmp-body');
        if (!body) return;
        if (selTeams.length < 2) {
            body.innerHTML = '<p class="atlas-empty-sm">Sélectionnez au moins 2 équipes pour comparer.</p>';
            return;
        }
        if (_cmpChart) { try { _cmpChart.destroy(); } catch {} _cmpChart = null; }

        // Calcule score moyen par compétence par équipe
        const datasets = selTeams.map((team, idx) => {
            const members = allMem.filter(m => m.team === team);
            const data = skills.map(s => {
                const levels = members.map(m => {
                    const row = (store.get('memberSkills') || []).find(x => x.scope === 'member' && x.scopeKey === m.name && x.skillId === s.id);
                    return row ? row.level : 0;
                }).filter(l => l > 0);
                return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length * 10) / 10 : 0;
            });
            const col = teamObjs.find(t => t.name === team)?.color || CHART_COLORS[idx % CHART_COLORS.length];
            return { label: team, data, borderColor: col, backgroundColor: col.replace('hsl', 'hsla').replace(')', ', 0.08)').replace('#', '') || `${col}22`, pointBackgroundColor: col, borderWidth: 2 };
        });

        // Compte des membres par équipe
        const memberCounts = selTeams.map(t => allMem.filter(m => m.team === t).length);

        body.innerHTML = `
            <div class="atlas-cmp-meta">
                ${selTeams.map((t, i) => {
                    const col = teamObjs.find(o => o.name === t)?.color || CHART_COLORS[i % CHART_COLORS.length];
                    return `<span class="atlas-cmp-team-chip" style="--tc:${col}"><span class="atlas-cmp-dot" style="background:${col}"></span>${esc(t)} · ${memberCounts[i]} membres</span>`;
                }).join('')}
            </div>
            <div class="atlas-cmp-chart-wrap">
                ${skills.length >= 3 ? `<canvas id="atlas-cmp-radar" height="340"></canvas>` : '<p class="atlas-empty-sm">Au moins 3 compétences nécessaires pour le radar.</p>'}
            </div>
            <div class="atlas-cmp-table-wrap">
                <table class="atlas-cmp-table">
                    <thead>
                        <tr>
                            <th>Compétence</th>
                            ${selTeams.map(t => `<th>${esc(t)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${skills.map((s, si) => {
                            const vals = datasets.map(d => d.data[si]);
                            const maxVal = Math.max(...vals);
                            return `<tr>
                                <td class="atlas-cmp-skill-name">${esc(s.name)}</td>
                                ${vals.map((v, vi) => {
                                    const col = teamObjs.find(t => t.name === selTeams[vi])?.color || CHART_COLORS[vi % CHART_COLORS.length];
                                    const isBest = v > 0 && v === maxVal;
                                    return `<td class="atlas-cmp-cell${isBest ? ' atlas-cmp-cell--best' : ''}" title="${v}/4" style="--lc:${v > 0 ? _levelMeta(Math.round(v)).color : 'var(--border)'}">
                                        ${v > 0 ? `<span class="atlas-cmp-bar" style="width:${v / 4 * 100}%;background:${_levelMeta(Math.round(v)).color}"></span><b>${v}</b>` : '<span class="atlas-cmp-empty">—</span>'}
                                    </td>`;
                                }).join('')}
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;

        if (skills.length >= 3 && window.Chart) {
            const ctx = body.querySelector('#atlas-cmp-radar');
            if (ctx) {
                _cmpChart = new window.Chart(ctx, {
                    type: 'radar',
                    data: { labels: skills.map(s => s.name), datasets },
                    options: {
                        responsive: true,
                        scales: { r: { min: 0, max: 4, ticks: { stepSize: 1, display: false }, pointLabels: { font: { size: 10 } } } },
                        plugins: { legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } } },
                    },
                });
            }
        }
    }

    [0, 1, 2].forEach(i => overlay.querySelector(`#atlas-cmp-t${i}`)?.addEventListener('change', _renderCompare));
    _renderCompare();
}

function _breadcrumbHtml(nodes) {
    const crumbs = [`<button class="atlas-crumb" data-crumb="0">🏛️ Programme</button>`];
    if (_zoom.level >= 1) {
        const g = nodes.find(n => n.id === _zoom.groupId);
        if (g) crumbs.push(`<span class="atlas-crumb-sep">›</span><button class="atlas-crumb" data-crumb="1" style="--c:${g.color}">${esc(g.name)}</button>`);
    }
    if (_zoom.level >= 2 && _zoom.team) {
        crumbs.push(`<span class="atlas-crumb-sep">›</span><button class="atlas-crumb" data-crumb="2">👥 ${esc(_zoom.team)}</button>`);
    }
    return `<nav class="atlas-breadcrumb">${crumbs.join('')}</nav>`;
}

/** Pastille membre colorée par appétence dominante (style unFIX crew). */
function _memberChipHtml(m) {
    const app = _dominantAppetence('member', m.name);
    const appColor = app ? _appMeta(app).color : 'transparent';
    const role = (m.role || '').trim();
    const tip  = `${m.name}${role ? ' · ' + role : ''}`;
    const hit  = _skillSearch && _skillHitSet.has(m.name);
    const miss = _skillSearch && !hit;
    const moved = _simMoves.has(m.name);
    return `<button class="atlas-chip${hit ? ' atlas-chip--hit' : ''}${miss ? ' atlas-chip--miss' : ''}${moved ? ' atlas-chip--moved' : ''}"
        draggable="true" data-member="${esc(m.name)}" title="${esc(tip)}${moved ? ' (simulé → ' + esc(_simMoves.get(m.name)) + ')' : ''}"
        style="--chip:${hashColor(m.name)}; --app:${appColor}">
        <span class="atlas-chip-ini">${esc(initials(m.name))}</span>
        ${app ? `<span class="atlas-chip-app" title="Appétence ${app}"></span>` : ''}
        ${hit ? `<span class="atlas-chip-skill-dot" title="Compétence matchée"></span>` : ''}
    </button>`;
}

function _mapStageHtml(nodes) {
    // Niveau 2 : membres d'une équipe (carte détaillée)
    if (_zoom.level === 2 && _zoom.team) {
        const g = nodes.find(n => n.id === _zoom.groupId);
        const t = g?.teams.find(x => x.name === _zoom.team);
        if (!t) { _zoom = { level: 0, groupId: null, team: null }; return _mapStageHtml(nodes); }
        const byRole = _groupByRole(t.members);
        return `<div class="atlas-crew atlas-crew--detail" style="--crew:${t.color}">
            <div class="atlas-crew-hdr">
                <span class="atlas-crew-dot" style="background:${t.color}"></span>
                <span class="atlas-crew-name">${esc(t.name)}</span>
                <span class="atlas-crew-count">${t.members.length} membre${t.members.length > 1 ? 's' : ''}</span>
            </div>
            ${t.members.length ? _rolesRowHtml(byRole, rg =>
                `<div class="atlas-role-members">
                    ${rg.members.map(m => `
                        <div class="atlas-member-card" data-member="${esc(m.name)}">
                            ${_memberChipHtml(m)}
                            <div class="atlas-member-info">
                                <span class="atlas-member-name">${esc(m.name)}</span>
                            </div>
                            ${_memberSkillBadgesHtml(m.name)}
                        </div>`).join('')}
                </div>`
            ) : '<div class="atlas-empty-sm">Aucun membre (absences non importées ?)</div>'}
        </div>`;
    }

    // Niveau 1 : équipes d'un groupe (crews)
    if (_zoom.level === 1 && _zoom.groupId) {
        const g = nodes.find(n => n.id === _zoom.groupId);
        if (!g) { _zoom = { level: 0, groupId: null, team: null }; return _mapStageHtml(nodes); }
        return `<div class="atlas-base" style="--base:${g.color}">
            ${g.teams.map(t => _crewBlockHtml(g, t)).join('')}
        </div>`;
    }

    // Niveau 0 : programme (toutes les bases/groupes)
    return `<div class="atlas-program">
        ${nodes.map(g => `
            <div class="atlas-base atlas-base--card" data-group="${esc(g.id)}" style="--base:${g.color}">
                <div class="atlas-base-hdr">
                    <span class="atlas-base-name">${esc(g.name)}</span>
                    <span class="atlas-base-meta">${g.teams.length} équipe${g.teams.length > 1 ? 's' : ''} · ${g.teams.reduce((s, t) => s + t.members.length, 0)} pers.</span>
                </div>
                <div class="atlas-base-crews">
                    ${g.teams.map(t => _crewBlockHtml(g, t, true)).join('')}
                </div>
            </div>`).join('')}
    </div>`;
}

// Palette de couleurs et icônes par mot-clé de rôle
const _ROLE_PALETTE = [
    { match: /\b(SM|scrum\s*master|coach)\b/i,   color: '#8b5cf6', icon: '🔄' },
    { match: /\b(PO|product\s*owner|product)\b/i, color: '#f59e0b', icon: '🎯' },
    { match: /\b(lead|tech\s*lead|architect)\b/i, color: '#ef4444', icon: '⚡' },
    { match: /\b(dev|developer|fullstack|front|back|mobile)\b/i, color: '#3b82f6', icon: '💻' },
    { match: /\b(qa|test|qualit|recette)\b/i,     color: '#10b981', icon: '✅' },
    { match: /\b(data|analyst|bi|analyst)\b/i,    color: '#06b6d4', icon: '📊' },
    { match: /\b(design|ux|ui)\b/i,               color: '#ec4899', icon: '🎨' },
    { match: /\b(devops|ops|infra|sre|cloud)\b/i, color: '#f97316', icon: '⚙️' },
];
function _roleStyle(role) {
    if (!role || role === '—') return { color: '#94a3b8', icon: '👤' };
    for (const p of _ROLE_PALETTE) {
        if (p.match.test(role)) return { color: p.color, icon: p.icon };
    }
    return { color: '#6366f1', icon: '👥' };
}

/** Regroupe les membres par rôle, rôles vides en dernier. */
function _groupByRole(members) {
    const map = new Map();
    for (const m of members) {
        const role = (m.role || '').trim() || '—';
        if (!map.has(role)) map.set(role, []);
        map.get(role).push(m);
    }
    return [...map.entries()]
        .sort(([a], [b]) => {
            if (a === '—') return 1;
            if (b === '—') return -1;
            return a.localeCompare(b, 'fr', { sensitivity: 'base' });
        })
        .map(([role, members]) => ({ role, members, ..._roleStyle(role) }));
}

function _roleGroupHtml({ role, members, color, icon }, contentHtml) {
    return `<div class="atlas-role-group">
        <div class="atlas-role-label" style="color:${color}">
            <span class="atlas-role-label-icon">${icon}</span>
            ${esc(role)}
            <span class="atlas-role-label-count">${members.length}</span>
        </div>
        ${contentHtml}
    </div>`;
}

function _rolesRowHtml(byRole, makeContent) {
    return `<div class="atlas-roles-row">${byRole.map(rg => _roleGroupHtml(rg, makeContent(rg))).join('')}</div>`;
}

/** Bloc "crew" (équipe) : pastilles membres groupées par rôle. compact=true pour la vue programme. */
function _crewBlockHtml(g, t, compact = false) {
    const byRole = _groupByRole(t.members);
    const chipsHtml = _rolesRowHtml(byRole, rg =>
        `<div class="atlas-crew-grid--compact-role">
            ${rg.members.slice(0, compact ? 8 : 99).map(m => _memberChipHtml(m)).join('')}
            ${compact && rg.members.length > 8 ? `<span class="atlas-chip-more">+${rg.members.length - 8}</span>` : ''}
        </div>`
    );
    return `<div class="atlas-crew${compact ? ' atlas-crew--compact' : ''}" data-group="${esc(g.id)}" data-team="${esc(t.name)}" style="--crew:${t.color}">
        <div class="atlas-crew-hdr">
            <span class="atlas-crew-dot" style="background:${t.color}"></span>
            <span class="atlas-crew-name">${esc(t.name)}</span>
            <span class="atlas-crew-count">${t.members.length}</span>
        </div>
        ${!compact ? _teamAppetenceTagsHtml(t.name) : ''}
        ${chipsHtml}
    </div>`;
}

/** Tags d'appétences au niveau ÉQUIPE (saisies dans la matrix scope=team).
 *  Fortes en plein, faibles en atténué/barré. Les neutres sont masquées. */
function _teamAppetenceTagsHtml(teamName) {
    const apps = store.get('appetences') || [];
    const rows = (store.get('memberAppetences') || [])
        .filter(a => a.scope === 'team' && a.scopeKey === teamName && a.value !== 'neutre');
    if (!rows.length) return '';
    // Fortes d'abord, puis faibles
    const ordered = rows.sort((a, b) => (a.value === 'forte' ? 0 : 1) - (b.value === 'forte' ? 0 : 1));
    return `<div class="atlas-crew-apps">${ordered.map(r => {
        const a = apps.find(x => x.id === r.appetenceId);
        if (!a) return '';
        const weak = r.value === 'faible';
        return `<span class="atlas-crew-app-tag${weak ? ' atlas-crew-app-tag--weak' : ''}" style="--ac:${a.color}" title="Appétence ${weak ? 'faible' : 'forte'} de l'équipe">${weak ? '↓ ' : ''}${esc(a.name)}</span>`;
    }).join('')}</div>`;
}

/** Mini-badges des 3 meilleures compétences d'un membre (vue détaillée). */
function _memberSkillBadgesHtml(name) {
    const skills = store.get('skills') || [];
    const ms = (store.get('memberSkills') || []).filter(x => x.scope === 'member' && x.scopeKey === name && x.level > 0);
    if (!ms.length) return '';
    const top = ms.sort((a, b) => b.level - a.level).slice(0, 3);
    return `<div class="atlas-member-skills">${top.map(x => {
        const sk = skills.find(s => s.id === x.skillId);
        const lm = _levelMeta(x.level);
        return sk ? `<span class="atlas-skill-badge" style="--lvl:${lm.color}" title="${esc(sk.name)} · ${lm.label}">${esc(sk.name)} <b>${lm.short}</b></span>` : '';
    }).join('')}</div>`;
}

/** Appétence dominante (la plus forte) d'un scope. */
function _dominantAppetence(scope, key) {
    const list = (store.get('memberAppetences') || []).filter(a => a.scope === scope && a.scopeKey === key);
    if (list.some(a => a.value === 'forte')) return 'forte';
    if (list.some(a => a.value === 'faible')) return 'faible';
    return list.length ? 'neutre' : null;
}

function _mapLegendHtml() {
    return `
        <span class="atlas-legend-title">Appétence</span>
        ${APPETENCE_VALUES.map(a => `<span class="atlas-legend-item"><span class="atlas-legend-dot" style="background:${a.color}"></span>${a.label}</span>`).join('')}
        <span class="atlas-legend-hint">Cliquez une base pour zoomer · un membre pour sa fiche</span>`;
}

function _wireMap(el, nodes) {
    // Breadcrumb
    el.querySelectorAll('.atlas-crumb').forEach(btn => {
        btn.addEventListener('click', () => {
            const lvl = parseInt(btn.dataset.crumb, 10);
            if (lvl === 0) _zoom = { level: 0, groupId: null, team: null };
            else if (lvl === 1) _zoom = { level: 1, groupId: _zoom.groupId, team: null };
            _renderMap(el);
        });
    });
    el.querySelector('#atlas-zoom-out')?.addEventListener('click', () => {
        if (_zoom.level === 2) _zoom = { level: 1, groupId: _zoom.groupId, team: null };
        else if (_zoom.level === 1) _zoom = { level: 0, groupId: null, team: null };
        _renderMap(el);
    });
    el.querySelector('#atlas-zoom-reset')?.addEventListener('click', () => {
        _zoom = { level: 0, groupId: null, team: null };
        _renderMap(el);
    });
    el.querySelector('#atlas-present')?.addEventListener('click', () => _togglePresent(el));
    el.querySelector('#atlas-export-png')?.addEventListener('click', e => _exportMapPng(e.currentTarget, el));
    el.querySelector('#atlas-tour')?.addEventListener('click', () => _startTour(el, nodes));

    _wireStage(el);
}

/** Câble uniquement les interactions du stage (clics base/équipe/membre).
 *  Séparé de _wireMap pour pouvoir ré-attacher sans dupliquer les listeners de la barre. */
function _wireStage(el) {
    // Zoom dans une base (niveau 0 → 1)
    el.querySelectorAll('.atlas-base--card').forEach(base => {
        base.addEventListener('click', e => {
            if (e.target.closest('.atlas-chip') || e.target.closest('.atlas-crew[data-team]')) return;
            _zoom = { level: 1, groupId: base.dataset.group, team: null };
            _renderMap(el);
        });
    });

    // Zoom dans une équipe (→ niveau 2)
    el.querySelectorAll('.atlas-crew[data-team]').forEach(crew => {
        crew.addEventListener('click', e => {
            if (e.target.closest('.atlas-chip')) return;
            if (_simMode) return; // en sim mode, le clic ne zoome pas
            _zoom = { level: 2, groupId: crew.dataset.group, team: crew.dataset.team };
            _renderMap(el);
        });
    });

    // Clic membre → ouvre la fiche membre
    el.querySelectorAll('[data-member]').forEach(node => {
        node.addEventListener('click', e => {
            if (_simMode) return; // en sim mode, le clic ne zoome pas
            const name = node.dataset.member || node.closest('[data-member]')?.dataset.member;
            if (!name) return;
            e.stopPropagation();
            _openMemberFocus(name);
        });
    });

    // ── Drag & drop simulation staffing (#7) ─────────────────────────────────
    if (_simMode) {
        // Chips membres : source du drag
        el.querySelectorAll('.atlas-chip[data-member]').forEach(chip => {
            chip.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', chip.dataset.member);
                e.dataTransfer.effectAllowed = 'move';
                chip.classList.add('atlas-chip--dragging');
            });
            chip.addEventListener('dragend', () => chip.classList.remove('atlas-chip--dragging'));
        });

        // Crew blocks : cibles du drop
        el.querySelectorAll('.atlas-crew[data-team]').forEach(crew => {
            crew.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                crew.classList.add('atlas-crew--dropzone');
            });
            crew.addEventListener('dragleave', () => crew.classList.remove('atlas-crew--dropzone'));
            crew.addEventListener('drop', e => {
                e.preventDefault();
                crew.classList.remove('atlas-crew--dropzone');
                const member = e.dataTransfer.getData('text/plain');
                const targetTeam = crew.dataset.team;
                if (!member || !targetTeam) return;
                // Trouver l'équipe actuelle réelle
                const allMembers = _allMembers();
                const m = allMembers.find(x => x.name === member);
                const realTeam = m?.team || '';
                if (realTeam === targetTeam) {
                    // Retour à l'original
                    _simMoves.delete(member);
                } else {
                    _simMoves.set(member, targetTeam);
                }
                _simMode = true;
                _renderMap(el);
            });
        });
    }
}

// ── Mode présentation / onboarding (plein écran de la carte) ───────────────────
function _togglePresent(el) {
    const map = el.querySelector('.atlas-map');
    if (!map) return;
    const fsEl = document.fullscreenElement;
    if (fsEl) {
        document.exitFullscreen?.();
    } else if (map.requestFullscreen) {
        map.classList.add('atlas-map--present');
        map.requestFullscreen().catch(() => {
            // Fallback si Fullscreen indisponible : mode pseudo-plein-écran via classe
            map.classList.toggle('atlas-map--present-fallback');
        });
    } else {
        map.classList.toggle('atlas-map--present-fallback');
        map.classList.toggle('atlas-map--present');
    }
}

// Retire la classe présentation à la sortie du plein écran (Échap ou bouton)
if (typeof document !== 'undefined' && !document._atlasFsBound) {
    document._atlasFsBound = true;
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            document.querySelectorAll('.atlas-map--present').forEach(m => m.classList.remove('atlas-map--present'));
        }
    });
}

// ── Export de la carte en PNG (html2canvas chargé à la demande depuis CDN) ─────
async function _exportMapPng(btn, el) {
    const stage = el.querySelector('.atlas-map-stage');
    if (!stage) return;
    const { toast } = await import('../utils.js');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳';
    try {
        if (!window.html2canvas) {
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                s.onload = res; s.onerror = rej;
                document.head.appendChild(s);
            });
        }
        // Fond cohérent avec le thème (clair/sombre)
        const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#ffffff';
        const canvas = await window.html2canvas(stage, { backgroundColor: bg, scale: 2, useCORS: true });
        const ctx = _zoom.team || _zoom.groupId || 'programme';
        const link = document.createElement('a');
        link.download = `atlas-${String(ctx).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('Carte exportée en PNG', 'success');
    } catch (e) {
        toast('Erreur lors de l\'export', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Visite guidée automatique (onboarding) — séquence Programme → équipes
// ══════════════════════════════════════════════════════════════════════════════
let _tourState = null; // { steps, idx, timer, paused }

function _buildTourSteps(nodes) {
    const steps = [];
    // 1. Vue d'ensemble du programme
    const totalTeams = nodes.reduce((s, g) => s + g.teams.length, 0);
    const totalPeople = nodes.reduce((s, g) => s + g.teams.reduce((a, t) => a + t.members.length, 0), 0);
    steps.push({
        zoom: { level: 0, groupId: null, team: null },
        title: '🏛️ Vue d\'ensemble du programme',
        text: `${nodes.length} ligne(s) produit · ${totalTeams} équipe(s) · ${totalPeople} personnes.`,
    });
    // 2. Chaque groupe (base)
    for (const g of nodes) {
        const people = g.teams.reduce((a, t) => a + t.members.length, 0);
        steps.push({
            zoom: { level: 1, groupId: g.id, team: null },
            title: `📦 ${g.name}`,
            text: `${g.teams.length} équipe(s) · ${people} personnes.`,
            color: g.color,
        });
        // 3. Chaque équipe du groupe (niveau membres)
        for (const t of g.teams) {
            if (!t.members.length) continue;
            const apps = (store.get('memberAppetences') || []).filter(a => a.scope === 'team' && a.scopeKey === t.name && a.value === 'forte');
            const appNames = apps.map(a => (store.get('appetences') || []).find(x => x.id === a.appetenceId)?.name).filter(Boolean);
            steps.push({
                zoom: { level: 2, groupId: g.id, team: t.name },
                title: `👥 ${t.name}`,
                text: `${t.members.length} membre(s)${appNames.length ? ` · appétences : ${appNames.join(', ')}` : ''}.`,
                color: t.color,
            });
        }
    }
    return steps;
}

function _startTour(el, nodes) {
    if (_tourState) { _stopTour(el); return; }
    const steps = _buildTourSteps(nodes);
    if (steps.length < 2) return;
    _tourState = { steps, idx: 0, timer: null, paused: false, el };

    // Overlay de contrôle
    const ctl = document.createElement('div');
    ctl.className = 'atlas-tour-ctl';
    ctl.innerHTML = `
        <div class="atlas-tour-info">
            <div class="atlas-tour-title" id="atlas-tour-title"></div>
            <div class="atlas-tour-text" id="atlas-tour-text"></div>
        </div>
        <div class="atlas-tour-progress"><div class="atlas-tour-bar" id="atlas-tour-bar"></div></div>
        <div class="atlas-tour-btns">
            <button class="btn-icon" id="atlas-tour-prev" title="Précédent">‹</button>
            <button class="btn-icon" id="atlas-tour-pause" title="Pause/Reprendre">⏸</button>
            <button class="btn-icon" id="atlas-tour-next" title="Suivant">›</button>
            <button class="btn-icon" id="atlas-tour-stop" title="Arrêter (Échap)">✕</button>
        </div>`;
    el.querySelector('.atlas-map')?.appendChild(ctl);

    ctl.querySelector('#atlas-tour-prev').addEventListener('click', () => _tourGo(el, -1));
    ctl.querySelector('#atlas-tour-next').addEventListener('click', () => _tourGo(el, +1));
    ctl.querySelector('#atlas-tour-stop').addEventListener('click', () => _stopTour(el));
    ctl.querySelector('#atlas-tour-pause').addEventListener('click', e => _tourTogglePause(e.currentTarget));

    document.addEventListener('keydown', _tourKeyHandler);
    _tourShow(el);
}

function _tourKeyHandler(e) {
    if (!_tourState) return;
    if (e.key === 'Escape') _stopTour(_tourState.el);
    else if (e.key === 'ArrowRight') _tourGo(_tourState.el, +1);
    else if (e.key === 'ArrowLeft') _tourGo(_tourState.el, -1);
}

function _tourShow(el) {
    if (!_tourState) return;
    const step = _tourState.steps[_tourState.idx];
    _zoom = { ...step.zoom };
    // Re-render la carte (préserve l'overlay tour qu'on ré-attache après)
    const nodes = _buildHierarchy();
    const stage = el.querySelector('#atlas-stage');
    if (stage) stage.innerHTML = _mapStageHtml(nodes);
    _wireStage(el);                      // rebind clics du stage uniquement
    el.querySelector('#atlas-tour')?.classList.add('is-active');

    // Met à jour l'overlay (toujours présent dans .atlas-map)
    const ctl = el.querySelector('.atlas-tour-ctl');
    if (ctl) {
        ctl.querySelector('#atlas-tour-title').textContent = step.title;
        ctl.querySelector('#atlas-tour-text').textContent = step.text;
        if (step.color) ctl.style.setProperty('--tour-color', step.color);
        const pct = ((_tourState.idx + 1) / _tourState.steps.length) * 100;
        ctl.querySelector('#atlas-tour-bar').style.width = `${pct}%`;
    }
    _tourScheduleNext(el);
}

function _tourScheduleNext(el) {
    if (!_tourState || _tourState.paused) return;
    clearTimeout(_tourState.timer);
    _tourState.timer = setTimeout(() => {
        if (_tourState.idx < _tourState.steps.length - 1) _tourGo(el, +1);
        else _stopTour(el); // fin de la visite
    }, 4200);
}

function _tourGo(el, delta) {
    if (!_tourState) return;
    clearTimeout(_tourState.timer);
    _tourState.idx = Math.max(0, Math.min(_tourState.steps.length - 1, _tourState.idx + delta));
    _tourShow(el);
}

function _tourTogglePause(btn) {
    if (!_tourState) return;
    _tourState.paused = !_tourState.paused;
    btn.textContent = _tourState.paused ? '▶' : '⏸';
    if (_tourState.paused) clearTimeout(_tourState.timer);
    else _tourScheduleNext(_tourState.el);
}

function _stopTour(el) {
    if (!_tourState) return;
    clearTimeout(_tourState.timer);
    document.removeEventListener('keydown', _tourKeyHandler);
    el.querySelector('.atlas-tour-ctl')?.remove();
    el.querySelector('#atlas-tour')?.classList.remove('is-active');
    _tourState = null;
}

// Clic membre dans la carte → ouvre la fiche membre (radar compétences)
function _openMemberFocus(name) {
    _openMemberCard(name);
}

// Bascule vers la Skills Matrix focalisée sur un membre
function _gotoMatrixForMember(name) {
    _tab = 'matrix';
    _matrixScope = 'member';
    _matrixFocus = name;
    localStorage.setItem('sb-atlas-tab', 'matrix');
    localStorage.setItem('sb-atlas-scope', 'member');
    document.querySelectorAll('.atlas-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'matrix'));
    const body = document.getElementById('atlas-body');
    if (body) _renderMatrix(body);
}

// ── Fiche membre : radar compétences + appétences + mobilité ───────────────────
function _openMemberCard(name) {
    const member = _allMembers().find(m => m.name === name) || { name, team: '', role: '' };
    const skills = [...(store.get('skills') || [])].sort(_bySort);
    const apps   = [...(store.get('appetences') || [])].sort(_bySort);
    const evaluated = skills.map(s => ({ s, lvl: _skillLevel('member', name, s.id) })).filter(x => x.lvl > 0);
    const appForte  = apps.filter(a => _appValue('member', name, a.id) === 'forte');
    const mob = (store.get('mobility') || []).find(m => m.memberName === name);

    document.getElementById('atlas-membercard-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'atlas-membercard-overlay';
    overlay.className = 'atlas-mobility-overlay';
    overlay.innerHTML = `
        <div class="atlas-membercard">
            <div class="atlas-mobility-hdr">
                <div class="atlas-mc-id">
                    <span class="atlas-chip atlas-chip--lg" style="--chip:${hashColor(name)}"><span class="atlas-chip-ini">${esc(initials(name))}</span></span>
                    <div>
                        <h3>${esc(name)}</h3>
                        <span class="atlas-mc-sub">${esc(member.team || '—')}${member.role ? ' · ' + esc(member.role) : ''}</span>
                    </div>
                </div>
                <button class="btn-icon" id="atlas-mc-close"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
            <div class="atlas-mc-body">
                <div class="atlas-mc-radar-wrap">
                    ${evaluated.length >= 3
                        ? `<canvas id="atlas-mc-radar" width="320" height="320"></canvas>`
                        : `<div class="atlas-empty-sm">Au moins 3 compétences évaluées sont nécessaires pour le radar.<br>${evaluated.length} évaluée(s).</div>`}
                </div>
                <div class="atlas-mc-side">
                    <div class="atlas-mc-block">
                        <div class="atlas-mc-block-title">Compétences évaluées</div>
                        ${evaluated.length ? evaluated.sort((a, b) => b.lvl - a.lvl).map(x => {
                            const lm = _levelMeta(x.lvl);
                            return `<div class="atlas-mc-skill"><span class="atlas-mc-skill-name">${esc(x.s.name)}</span>
                                <span class="atlas-mc-skill-bar"><span style="width:${x.lvl / 4 * 100}%;background:${lm.color}"></span></span>
                                <b style="color:${lm.color}">${x.lvl}</b></div>`;
                        }).join('') : '<div class="atlas-empty-sm">Aucune compétence évaluée.</div>'}
                    </div>
                    ${appForte.length ? `<div class="atlas-mc-block">
                        <div class="atlas-mc-block-title">Appétences fortes</div>
                        <div class="atlas-mc-apps">${appForte.map(a => `<span class="atlas-crew-app-tag" style="--ac:${a.color}">${esc(a.name)}</span>`).join('')}</div>
                    </div>` : ''}
                    ${mob && (mob.targetRole || mob.targetTeam) ? `<div class="atlas-mc-block atlas-mc-block--mob">
                        <div class="atlas-mc-block-title">Trajectoire</div>
                        <div class="atlas-mc-mob">
                            ${mob.targetRole ? `<span>🎯 ${esc(mob.targetRole)}</span>` : ''}
                            ${mob.targetTeam ? `<span>→ ${esc(mob.targetTeam)}</span>` : ''}
                            ${mob.risk && mob.risk !== 'aucun' ? `<span class="atlas-mc-risk atlas-mc-risk--${mob.risk}">Risque : ${mob.risk}</span>` : ''}
                        </div>
                    </div>` : ''}
                </div>
            </div>
            <div class="atlas-mobility-foot">
                <button class="btn btn-secondary btn-sm" id="atlas-mc-matrix">Voir dans la matrice →</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => { overlay.classList.remove('visible'); overlay.addEventListener('transitionend', () => overlay.remove(), { once: true }); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#atlas-mc-close').addEventListener('click', close);
    overlay.querySelector('#atlas-mc-matrix').addEventListener('click', () => { close(); _gotoMatrixForMember(name); });

    // Radar Chart.js
    if (evaluated.length >= 3 && window.Chart) {
        const ctx = overlay.querySelector('#atlas-mc-radar');
        const labels = evaluated.map(x => x.s.name);
        const data   = evaluated.map(x => x.lvl);
        new window.Chart(ctx, {
            type: 'radar',
            data: { labels, datasets: [{
                data, label: name,
                backgroundColor: hashColor(name).replace('hsl', 'hsla').replace(')', ', 0.2)'),
                borderColor: hashColor(name), pointBackgroundColor: hashColor(name), borderWidth: 2,
            }] },
            options: {
                responsive: false,
                scales: { r: { min: 0, max: 4, ticks: { stepSize: 1, display: false }, pointLabels: { font: { size: 11 } } } },
                plugins: { legend: { display: false } },
            },
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Onglet 2 — Skills Matrix (compétences × entités, niveaux + appétences éditables)
// ══════════════════════════════════════════════════════════════════════════════
let _matrixFocus = null; // membre ciblé (si on vient d'un clic sur la carte)

/** Liste les entités (lignes de la matrice) selon le scope + filtre topbar. */
function _matrixEntities() {
    const selTeam  = store.get('team');
    const selGroup = store.get('group');
    const groups   = store.get('groups') || [];

    // Équipes visibles selon le filtre topbar
    let teams = store.get('teams') || [];
    if (selGroup) {
        const g = groups.find(x => x.id === selGroup);
        teams = (g?.teams || []);
    } else if (selTeam && selTeam !== 'all') {
        teams = [selTeam];
    }

    if (_matrixScope === 'team') {
        return teams.map(t => ({ key: t, label: t, team: t, kind: 'team' }));
    }
    // scope membre
    return _allMembers()
        .filter(m => teams.includes(m.team))
        .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))
        .map(m => ({ key: m.name, label: m.name, team: m.team, role: m.role, kind: 'member' }));
}

function _skillLevel(scope, key, skillId) {
    const row = (store.get('memberSkills') || []).find(x => x.scope === scope && x.scopeKey === key && x.skillId === skillId);
    return row ? row.level : 0;
}
function _appValue(scope, key, appId) {
    const row = (store.get('memberAppetences') || []).find(x => x.scope === scope && x.scopeKey === key && x.appetenceId === appId);
    return row ? row.value : 'neutre';
}

/** Niveau global d'un membre dérivé de ses compétences (moyenne des skills évaluées, arrondi).
 *  Retourne { avg, max, n } — utilisé comme suggestion dans le tableau de mobilité. */
function _memberGlobalLevel(name) {
    const levels = (store.get('memberSkills') || [])
        .filter(x => x.scope === 'member' && x.scopeKey === name && x.level > 0)
        .map(x => x.level);
    if (!levels.length) return { avg: 0, max: 0, n: 0 };
    return {
        avg: Math.round(levels.reduce((a, b) => a + b, 0) / levels.length),
        max: Math.max(...levels),
        n: levels.length,
    };
}

// Tri d'affichage des items catalogue : par sort puis nom (cohérent avec le backend)
const _bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.name || '').localeCompare(b.name || '');

// ── Compétences requises/favoris par équipe (localStorage) ───────────────────
function _teamReqKey(teamName) { return `sb-team-req-${teamName}`; }
function _getTeamReq(teamName) {
    try { const v = localStorage.getItem(_teamReqKey(teamName)); return v ? new Set(JSON.parse(v)) : new Set(); }
    catch { return new Set(); }
}
function _toggleTeamReq(teamName, skillId) {
    const req = _getTeamReq(teamName);
    if (req.has(skillId)) req.delete(skillId); else req.add(skillId);
    if (req.size) localStorage.setItem(_teamReqKey(teamName), JSON.stringify([...req]));
    else localStorage.removeItem(_teamReqKey(teamName));
    return req.has(skillId);
}

// ── Sélection de compétences par équipe (localStorage) ───────────────────────
function _teamSkillsKey(teamName) { return `sb-team-skills-${teamName}`; }
function _getTeamSkills(teamName) {
    try { const v = localStorage.getItem(_teamSkillsKey(teamName)); return v ? new Set(JSON.parse(v)) : null; }
    catch { return null; }
}
function _setTeamSkills(teamName, ids) {
    if (!ids || ids.size === 0) localStorage.removeItem(_teamSkillsKey(teamName));
    else localStorage.setItem(_teamSkillsKey(teamName), JSON.stringify([...ids]));
}
function _applyTeamSkillFilter(skills, teamName) {
    if (!teamName || teamName === 'all') return skills;
    const sel = _getTeamSkills(teamName);
    return sel ? skills.filter(s => sel.has(s.id)) : skills;
}

function _openTeamSkillPicker(el, teamName, skills) {
    document.getElementById('atlas-tsp-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'atlas-tsp-overlay';
    overlay.className = 'atlas-mobility-overlay';
    const sel = _getTeamSkills(teamName) || new Set(skills.map(s => s.id));
    const cats = [...new Set(skills.map(s => s.category || 'Autres'))].sort((a, b) => a.localeCompare(b, 'fr'));

    overlay.innerHTML = `
        <div class="atlas-catalog-modal atlas-tsp-modal">
            <div class="atlas-mobility-hdr">
                <h3>Compétences visibles — ${esc(teamName)}</h3>
                <div style="display:flex;gap:8px;align-items:center">
                    <button class="btn btn-sm btn-secondary" id="atlas-tsp-all">Tout cocher</button>
                    <button class="btn btn-sm btn-secondary" id="atlas-tsp-none">Tout décocher</button>
                    <button class="btn-icon" id="atlas-tsp-close"><svg class="icon"><use href="#i-x"/></svg></button>
                </div>
            </div>
            <div class="atlas-tsp-body">
                ${cats.map(cat => {
                    const catSkills = skills.filter(s => (s.category || 'Autres') === cat).sort(_bySort);
                    return `<div class="atlas-tsp-cat">
                        <div class="atlas-tsp-cat-hdr">
                            <label class="atlas-tsp-cat-check">
                                <input type="checkbox" class="atlas-tsp-cat-cb" data-cat="${esc(cat)}"
                                    ${catSkills.every(s => sel.has(s.id)) ? 'checked' : ''}>
                                <strong>${esc(cat)}</strong>
                                <span class="atlas-cat-n">${catSkills.length}</span>
                            </label>
                        </div>
                        <div class="atlas-tsp-items">
                            ${catSkills.map(s => `
                                <label class="atlas-tsp-item">
                                    <input type="checkbox" class="atlas-tsp-cb" data-id="${esc(s.id)}" data-cat="${esc(cat)}"
                                        ${sel.has(s.id) ? 'checked' : ''}>
                                    <span class="atlas-cat-dot" style="background:${s.color}"></span>
                                    ${esc(s.name)}
                                </label>`).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div class="atlas-tsp-footer">
                <span class="atlas-tsp-count" id="atlas-tsp-count"></span>
                <button class="btn btn-primary" id="atlas-tsp-save">Appliquer</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const updateCount = () => {
        const n = overlay.querySelectorAll('.atlas-tsp-cb:checked').length;
        overlay.querySelector('#atlas-tsp-count').textContent = `${n} / ${skills.length} compétences sélectionnées`;
    };
    updateCount();

    // Cocher/décocher une catégorie entière
    overlay.querySelectorAll('.atlas-tsp-cat-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            overlay.querySelectorAll(`.atlas-tsp-cb[data-cat="${cb.dataset.cat}"]`).forEach(c => { c.checked = cb.checked; });
            updateCount();
        });
    });
    overlay.querySelectorAll('.atlas-tsp-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const cat = cb.dataset.cat;
            const catCbs = [...overlay.querySelectorAll(`.atlas-tsp-cb[data-cat="${cat}"]`)];
            const catCb  = overlay.querySelector(`.atlas-tsp-cat-cb[data-cat="${cat}"]`);
            if (catCb) catCb.checked = catCbs.every(c => c.checked);
            updateCount();
        });
    });

    overlay.querySelector('#atlas-tsp-all').addEventListener('click', () => {
        overlay.querySelectorAll('.atlas-tsp-cb, .atlas-tsp-cat-cb').forEach(c => { c.checked = true; });
        updateCount();
    });
    overlay.querySelector('#atlas-tsp-none').addEventListener('click', () => {
        overlay.querySelectorAll('.atlas-tsp-cb, .atlas-tsp-cat-cb').forEach(c => { c.checked = false; });
        updateCount();
    });

    const close = () => {
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#atlas-tsp-close').addEventListener('click', close);

    overlay.querySelector('#atlas-tsp-save').addEventListener('click', () => {
        const checked = new Set([...overlay.querySelectorAll('.atlas-tsp-cb:checked')].map(c => c.dataset.id));
        // Si tout est coché → pas de filtre (null = tout afficher)
        _setTeamSkills(teamName, checked.size === skills.length ? null : checked);
        close();
        _renderMatrix(el);
    });
}

function _renderMatrix(el) {
    // Preserve scroll position across re-renders
    const _scrollEl = el?.querySelector('.atlas-matrix-scroll');
    const _scrollLeft = _scrollEl?.scrollLeft ?? 0;
    const _scrollTop  = _scrollEl?.scrollTop  ?? 0;
    const skills     = [...(store.get('skills') || [])].sort(_bySort);
    const appetences = [...(store.get('appetences') || [])].sort(_bySort);
    const entities   = _matrixEntities();
    const scope      = _matrixScope;

    if (!entities.length) {
        el.innerHTML = `<div class="atlas-empty">Aucune ${scope === 'team' ? 'équipe' : 'personne'} à afficher pour ce filtre.</div>`;
        return;
    }
    if (!skills.length) {
        el.innerHTML = `
            <div class="atlas-matrix">
                <div class="atlas-matrix-bar">
                    <div class="atlas-scope-switch" role="tablist">
                        <button class="atlas-scope-btn${scope === 'member' ? ' active' : ''}" data-scope="member">👤 Par membre</button>
                        <button class="atlas-scope-btn${scope === 'team' ? ' active' : ''}" data-scope="team">👥 Par équipe</button>
                    </div>
                    <div class="atlas-matrix-actions">
                        <button class="btn btn-secondary btn-sm" id="atlas-catalog-btn" title="Gérer le catalogue complet">⚙️ Catalogue</button>
                    </div>
                </div>
                <div class="atlas-empty atlas-empty--cta">
                    <span class="atlas-empty-icon">🎯</span>
                    <h3>Construisez votre Skills Matrix</h3>
                    <p>Ajoutez vos premières compétences pour évaluer ${scope === 'team' ? 'vos équipes' : 'vos collaborateurs'}.</p>
                    <form class="atlas-quickadd" id="atlas-quickadd">
                        <input class="input" name="name" placeholder="Ex : React, Cloud, Facilitation…" autocomplete="off" required>
                        <input class="input atlas-quickadd-cat" name="category" placeholder="Catégorie (ex: Frontend)" autocomplete="off">
                        <button type="submit" class="btn btn-primary">＋ Ajouter</button>
                    </form>
                    <button class="atlas-empty-link" id="atlas-seed-defaults">⚡ Démarrer avec un catalogue type</button>
                </div>
            </div>`;
        // Switch scope
        el.querySelectorAll('.atlas-scope-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _matrixScope = btn.dataset.scope;
                localStorage.setItem('sb-atlas-scope', _matrixScope);
                _renderMatrix(el);
            });
        });
        el.querySelector('#atlas-catalog-btn')?.addEventListener('click', () => _openCatalogModal(el));
        // Ajout rapide inline
        el.querySelector('#atlas-quickadd')?.addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const name = (fd.get('name') || '').trim();
            if (!name) return;
            const category = (fd.get('category') || '').trim() || 'Général';
            try {
                const created = await api.createSkill({ name, category, color: _SKILL_COLORS[0], sort: 0 });
                store.set('skills', [...(store.get('skills') || []), created]);
                _renderMatrix(el); // re-render → affiche la grille dès la 1ère compétence
            } catch (err) {
                const { toast } = await import('../utils.js');
                toast('Erreur création compétence', 'error');
            }
        });
        // Seed catalogue type
        el.querySelector('#atlas-seed-defaults')?.addEventListener('click', () => _seedDefaultCatalog(el));
        return;
    }

    // ── Filtres : recherche par nom + masquer les non-évalués + filtre équipe ──
    const q = _matrixQuery.trim().toLowerCase();
    const selTeamName = store.get('team');
    const teamHasFilter = selTeamName && selTeamName !== 'all';
    let fEntities = entities;
    if (q) fEntities = entities.filter(e => e.label.toLowerCase().includes(q) || (e.team || '').toLowerCase().includes(q));
    // Filtre skills par équipe (sélection configurée par équipe)
    let fSkills = _applyTeamSkillFilter(skills, teamHasFilter ? selTeamName : null);
    const teamSkillsActive = teamHasFilter && _getTeamSkills(selTeamName) !== null;
    if (_matrixHideEmpty) {
        fEntities = fEntities.filter(e => fSkills.some(s => _skillLevel(scope, e.key, s.id) > 0)
            || appetences.some(a => _appValue(scope, e.key, a.id) !== 'neutre'));
        fSkills = fSkills.filter(s => fEntities.some(e => _skillLevel(scope, e.key, s.id) > 0));
    }
    const entityCount = entities.length, shownCount = fEntities.length;

    // Regroupe les compétences (filtrées) par catégorie pour l'en-tête
    const cats = [...new Set(fSkills.map(s => s.category || 'Autres'))];

    el.innerHTML = `
        <div class="atlas-matrix">
            <div class="atlas-matrix-bar">
                <div class="atlas-scope-switch" role="tablist">
                    <button class="atlas-scope-btn${scope === 'member' ? ' active' : ''}" data-scope="member">👤 Par membre</button>
                    <button class="atlas-scope-btn${scope === 'team' ? ' active' : ''}" data-scope="team">👥 Par équipe</button>
                </div>
                <div class="atlas-matrix-filter">
                    <input class="input input-sm atlas-matrix-search" id="atlas-search" placeholder="🔍 Filtrer ${scope === 'team' ? 'une équipe' : 'une personne'}…" value="${esc(_matrixQuery)}" autocomplete="off">
                    <label class="atlas-matrix-hide" title="Masquer les lignes/colonnes sans aucune évaluation">
                        <input type="checkbox" id="atlas-hide-empty" ${_matrixHideEmpty ? 'checked' : ''}> non-évalués
                    </label>
                </div>
                <span class="atlas-matrix-count">${shownCount === entityCount ? `${entityCount}` : `${shownCount}/${entityCount}`} ${scope === 'team' ? 'équipe(s)' : 'pers.'} · ${fSkills.length} comp.</span>
                <div class="atlas-matrix-actions">
                    <button class="btn btn-secondary btn-sm" id="atlas-suggest-btn" title="Suggérer qui affecter selon les compétences et la disponibilité">🧭 Affectation</button>
                    ${teamHasFilter ? `<button class="btn btn-sm ${teamSkillsActive ? 'btn-primary' : 'btn-secondary'}" id="atlas-tsp-btn" title="Sélectionner les compétences visibles pour cette équipe">
                        🎯 Compétences équipe${teamSkillsActive ? ` <span style="font-size:10px;opacity:.8">(${fSkills.length}/${skills.length})</span>` : ''}
                    </button>` : ''}
                    <button class="btn btn-secondary btn-sm" id="atlas-catalog-btn" title="Ajouter / modifier les compétences et appétences">⚙️ Catalogue</button>
                    <button class="btn btn-secondary btn-sm" id="atlas-mobility-btn" title="Tableau de suivi de mobilité">📋 Suivi mobilité</button>
                    <button class="btn btn-sm ${_dashboardVisible ? 'btn-primary' : 'btn-secondary'}" id="atlas-dashboard-btn" title="Tableau de bord : bus factor, KPIs, répartition, plans de dev">📊 Dashboard</button>
                </div>
            </div>

            ${_dashboardVisible ? `<div class="atlas-dashboard-panel">${_dashboardHtml(fEntities, fSkills, appetences, scope, selTeamName)}</div>` : ''}

            <div class="atlas-matrix-scroll">
                <table class="atlas-grid">
                    <thead>
                        <tr class="atlas-grid-cats">
                            <th class="atlas-grid-corner" rowspan="2">
                                <span class="atlas-corner-lbl">${scope === 'team' ? 'Équipe' : 'Collaborateur'}</span>
                                <button class="atlas-grid-add" id="atlas-add-skill" title="Ajouter une compétence">＋</button>
                            </th>
                            ${cats.map(c => {
                                const n = fSkills.filter(s => (s.category || 'Autres') === c).length;
                                return `<th class="atlas-grid-cat" colspan="${n}">${esc(c)}</th>`;
                            }).join('')}
                            <th class="atlas-grid-appsep" rowspan="2"></th>
                            ${appetences.length ? `<th class="atlas-grid-cat atlas-grid-cat--app" colspan="${appetences.length}">Appétences</th>` : ''}
                        </tr>
                        <tr class="atlas-grid-skills">
                            <th class="atlas-grid-rowhdr" style="background:var(--bg)"></th>
                            ${cats.flatMap(c => fSkills.filter(s => (s.category || 'Autres') === c)).map(s => {
                                const isReq = teamHasFilter && _getTeamReq(selTeamName).has(s.id);
                                const isEmpty = !fEntities.some(e => _skillLevel(scope, e.key, s.id) > 0);
                                return `<th class="atlas-grid-skill atlas-grid-skill--edit${isReq ? ' atlas-skill-req' : ''}" style="--sc:${s.color}" data-skill-hdr="${esc(s.id)}" title="${esc(s.name)} · clic = modifier">
                                    <span>${esc(s.name)}</span>
                                    ${teamHasFilter ? `<button class="atlas-skill-fav${isReq ? ' is-req' : ''}" data-fav-skill="${esc(s.id)}" title="${isReq ? 'Retirer des compétences requises' : 'Marquer comme requise pour l\'équipe'}">${isReq ? '⭐' : '☆'}</button>` : ''}
                                    ${isReq && isEmpty ? `<span class="atlas-skill-warn" title="Compétence requise mais aucun membre évalué — action nécessaire !">⚠️</span>` : ''}
                                </th>`;
                            }).join('')}
                            ${appetences.map(a => `<th class="atlas-grid-skill atlas-grid-skill--app atlas-grid-skill--edit" style="--sc:${a.color}" data-app-hdr="${esc(a.id)}" title="${esc(a.name)} · clic = modifier"><span>${esc(a.name)}</span></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${fEntities.length ? fEntities.map(ent => _matrixRowHtml(ent, fSkills, appetences, cats, scope)).join('') : `<tr><td class="atlas-grid-rowhdr">—</td><td colspan="99" class="atlas-empty-sm" style="text-align:left">Aucun résultat pour ce filtre.</td></tr>`}
                    </tbody>
                    <tfoot>
                        ${_matrixCoverageRowHtml(fEntities, fSkills, appetences, cats, scope)}
                    </tfoot>
                </table>
            </div>

            <div class="atlas-matrix-legend">
                <span class="atlas-legend-title">Niveau</span>
                ${SKILL_LEVELS.filter(l => l.v > 0).map(l => `<span class="atlas-legend-item atlas-legend-item--tip" tabindex="0" title="${esc(l.label)} — ${esc(l.desc)}"><span class="atlas-legend-sq" style="background:${l.color}"></span><b>${l.short}</b> ${l.label}</span>`).join('')}
                <span class="atlas-legend-hint">Clic cellule = +1 · clic droit = -1 · double-clic faible = ticket skill-up</span>
            </div>
        </div>`;

    _wireMatrix(el);
    // Restore scroll position after re-render
    if (_scrollLeft || _scrollTop) {
        const newScrollEl = el.querySelector('.atlas-matrix-scroll');
        if (newScrollEl) { newScrollEl.scrollLeft = _scrollLeft; newScrollEl.scrollTop = _scrollTop; }
    }
    // Scroll vers le membre ciblé si on vient de la carte
    if (_matrixFocus && scope === 'member') {
        const row = el.querySelector(`tr[data-ent="${CSS.escape(_matrixFocus)}"]`);
        if (row) { row.classList.add('atlas-row-focus'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        _matrixFocus = null;
    }
}

function _matrixRowHtml(ent, skills, appetences, cats, scope) {
    const orderedSkills = cats.flatMap(c => skills.filter(s => (s.category || 'Autres') === c));
    return `<tr data-ent="${esc(ent.key)}">
        <th class="atlas-grid-rowhdr">
            <span class="atlas-rowhdr-name">${esc(ent.label)}</span>
            ${ent.kind === 'member' ? `<span class="atlas-rowhdr-sub">${esc(ent.team)}${ent.role ? ' · ' + esc(ent.role) : ''}</span>` : ''}
        </th>
        ${orderedSkills.map(s => {
            const lvl = _skillLevel(scope, ent.key, s.id);
            const lm  = _levelMeta(lvl);
            return `<td class="atlas-cell" data-skill="${esc(s.id)}" data-team="${esc(ent.team)}" style="--lvl:${lm.color}" title="${esc(s.name)} · ${lm.label}\nClic = +1 niveau, clic droit = -1">
                <span class="atlas-cell-v">${lvl > 0 ? lm.short : ''}</span>
            </td>`;
        }).join('')}
        <td class="atlas-grid-appsep"></td>
        ${appetences.map(a => {
            const v  = _appValue(scope, ent.key, a.id);
            const am = _appMeta(v);
            return `<td class="atlas-cell atlas-cell--app" data-app="${esc(a.id)}" data-team="${esc(ent.team)}" style="--av:${am.color}" title="${esc(a.name)} · ${am.label}">
                <span class="atlas-cell-app">${am.icon}</span>
            </td>`;
        }).join('')}
    </tr>`;
}

/** Ligne de couverture : moyenne / max par compétence (heatmap d'équipe). */
function _matrixCoverageRowHtml(entities, skills, appetences, cats, scope) {
    const orderedSkills = cats.flatMap(c => skills.filter(s => (s.category || 'Autres') === c));
    const cov = s => {
        const levels = entities.map(e => _skillLevel(scope, e.key, s.id)).filter(l => l > 0);
        if (!levels.length) return { avg: 0, n: 0 };
        return { avg: levels.reduce((a, b) => a + b, 0) / levels.length, n: levels.length };
    };
    return `<tr class="atlas-grid-cov">
        <th class="atlas-grid-rowhdr">Couverture</th>
        ${orderedSkills.map(s => {
            const c = cov(s);
            const pct = Math.round((c.avg / 4) * 100);
            const warn = c.n === 0 || (scope === 'member' && c.n < 2); // lacune potentielle
            return `<td class="atlas-cov-cell${warn ? ' atlas-cov-warn' : ''}" title="${c.n} évalué(s) · moyenne ${c.avg.toFixed(1)}/4">
                <span class="atlas-cov-bar"><span class="atlas-cov-fill" style="width:${pct}%;background:${_levelMeta(Math.round(c.avg)).color}"></span></span>
                <span class="atlas-cov-n">${c.n || '·'}</span>
            </td>`;
        }).join('')}
        <td class="atlas-grid-appsep"></td>
        ${appetences.map(() => '<td class="atlas-cov-cell"></td>').join('')}
    </tr>`;
}

// ── Dashboard interne Skills Matrix ────────────────────────────────────────────
function _dashboardHtml(entities, fSkills, appetences, scope, selTeamName) {
    const teamHasReq = !!(selTeamName && selTeamName !== 'all');

    // Compétences à afficher : évaluées OU requises par l'équipe
    const dashSkills = fSkills.filter(s =>
        entities.some(e => _skillLevel(scope, e.key, s.id) > 0) ||
        (teamHasReq && _getTeamReq(selTeamName).has(s.id))
    );

    // Statistiques par compétence
    const skillStats = dashSkills.map(s => {
        const experts  = entities.filter(e => _skillLevel(scope, e.key, s.id) >= 2);
        const progress = entities.filter(e => _skillLevel(scope, e.key, s.id) === 1);
        return { skill: s, experts, progress, bf: experts.length };
    });

    // KPIs
    const allLevels = dashSkills.flatMap(s =>
        entities.map(e => _skillLevel(scope, e.key, s.id)).filter(l => l > 0)
    );
    const avgLevelGlobal = allLevels.length
        ? (allLevels.reduce((a, b) => a + b, 0) / allLevels.length).toFixed(1)
        : '–';
    const coveredSkills = skillStats.filter(st => st.experts.length + st.progress.length > 0);
    const coveragePct   = dashSkills.length ? Math.round(coveredSkills.length / dashSkills.length * 100) : 0;
    const atRiskCount   = skillStats.filter(st => st.bf < 2).length;
    const critCount     = skillStats.filter(st => st.bf === 0 && st.progress.length === 0).length;
    const membersWithProg = scope === 'member'
        ? new Set(dashSkills.flatMap(s => entities.filter(e => _skillLevel(scope, e.key, s.id) === 1).map(e => e.key))).size
        : 0;

    // Objectifs d'équipe (localStorage) — scopés par PI si disponible
    const piInfo       = store.get('piInfo');
    const currentPiNum = piInfo?.number || 0;
    const displayPiNum = currentPiNum ? currentPiNum + _objPiOffset : 0;
    const isPastPi     = currentPiNum > 0 && _objPiOffset < 0;
    const isObjReadOnly = isPastPi && !_objUnlockedOffsets.has(_objPiOffset);
    const objKey       = 'sb-team-objectives-' + (selTeamName || 'all') + (displayPiNum > 0 ? '-PI' + displayPiNum : '');
    const objPiLabel   = displayPiNum > 0 ? 'PI' + displayPiNum : 'PI courant';
    const objRaw       = localStorage.getItem(objKey) || '';
    const objLines     = objRaw.split('\n').filter(l => l.trim());

    // Catégories (uniquement sur les compétences à afficher)
    const cats = [...new Set(dashSkills.map(s => s.category || 'Autres'))];

    // Plans de développement (scope membre uniquement)
    const memberApps = store.get('memberAppetences') || [];
    const appList    = store.get('appetences') || [];
    const devPlans   = scope === 'member' ? entities.map(e => {
        const progSkills = dashSkills.filter(s => _skillLevel(scope, e.key, s.id) === 1);
        const missingReq = teamHasReq
            ? dashSkills.filter(s => _getTeamReq(selTeamName).has(s.id) && _skillLevel(scope, e.key, s.id) === 0)
            : [];
        const forteApps  = memberApps
            .filter(ma => ma.scope === scope && ma.scopeKey === e.key && ma.value === 'forte')
            .map(ma => appList.find(a => a.id === ma.appetenceId)?.name)
            .filter(Boolean);
        return { entity: e, progSkills, missingReq, forteApps };
    }).filter(p => p.progSkills.length > 0 || p.missingReq.length > 0) : [];

    // Bus factor
    const showBF       = entities.length >= 2;
    const atRiskSkills = showBF ? skillStats.filter(st => st.bf < 2).sort((a, b) => a.bf - b.bf) : [];
    const okSkills     = skillStats.filter(st => st.bf >= 2);

    return `
    <div class="ad-kpis">
        <div class="ad-kpi ${coveragePct < 40 ? 'ad-kpi--danger' : coveragePct < 70 ? 'ad-kpi--warn' : 'ad-kpi--ok'}">
            <div class="ad-kpi-v">${coveragePct}%</div>
            <div class="ad-kpi-lbl">Couverture</div>
            <div class="ad-kpi-sub">${coveredSkills.length}/${dashSkills.length} comp. évaluées</div>
        </div>
        <div class="ad-kpi ${atRiskCount > 3 ? 'ad-kpi--danger' : atRiskCount > 0 ? 'ad-kpi--warn' : 'ad-kpi--ok'}">
            <div class="ad-kpi-v">${atRiskCount}</div>
            <div class="ad-kpi-lbl">Risques bus factor</div>
            <div class="ad-kpi-sub">${critCount > 0 ? critCount + ' sans expert · ' : ''}${atRiskCount - critCount} 1 seul expert</div>
        </div>
        <div class="ad-kpi">
            <div class="ad-kpi-v">${avgLevelGlobal}</div>
            <div class="ad-kpi-lbl">Score moyen</div>
            <div class="ad-kpi-sub">Niveaux évalués / 4</div>
        </div>
        <div class="ad-kpi ${membersWithProg > 0 ? 'ad-kpi--info' : ''}">
            <div class="ad-kpi-v">${membersWithProg}</div>
            <div class="ad-kpi-lbl">En progression</div>
            <div class="ad-kpi-sub">Membres au niveau 1 (→2)</div>
        </div>
    </div>

    <div class="ad-mid">
        <div class="ad-bus">
            <div class="ad-block-hdr">
                <span class="ad-block-ttl">🚌 Bus Factor</span>
                <span class="ad-block-hint">Sachants ≥ niv.2 · Apprenants potentiels niv.1</span>
            </div>
            ${!showBF
                ? '<div class="ad-empty">Bus factor applicable avec ≥ 2 membres.</div>'
                : atRiskSkills.length === 0
                    ? '<div class="ad-empty">✅ Toutes les compétences ont au moins 2 experts.</div>'
                    : `<div class="ad-bus-rows">
                        ${atRiskSkills.map(({ skill, experts, progress }) => `
                        <div class="ad-bus-row ${experts.length === 0 ? 'ad-bus-row--crit' : 'ad-bus-row--warn'}">
                            <div class="ad-bus-left">
                                <span class="ad-bus-dot" style="background:${skill.color}"></span>
                                <span class="ad-bus-name" title="${esc(skill.name)}">${esc(skill.name)}</span>
                            </div>
                            <div class="ad-bus-center">
                                ${experts.length
                                    ? experts.map(e => `<span class="ad-bus-chip ad-bus-chip--exp" title="Sachant — niveau ≥ 2">🎓 ${esc(e.label)}</span>`).join('')
                                    : '<span class="ad-bus-noexp">aucun sachant</span>'}
                                ${progress.map(e => `<span class="ad-bus-chip ad-bus-chip--prog" title="En progression niveau 1 — candidat à la montée">📈 ${esc(e.label)}</span>`).join('')}
                            </div>
                            <div class="ad-bus-ind ${experts.length === 0 ? 'ad-bus-ind--crit' : 'ad-bus-ind--warn'}">
                                <span class="ad-bus-ind-n">${experts.length}</span>
                                <span class="ad-bus-ind-lbl">sachant${experts.length > 1 ? 's' : ''}</span>
                            </div>
                        </div>`).join('')}
                    </div>`}
            ${okSkills.length > 0 ? `<details class="ad-bus-ok-det">
                <summary>✅ ${okSkills.length} comp. bien couvertes (BF ≥ 2)</summary>
                <div class="ad-bus-ok-list">
                    ${okSkills.map(st =>
                        `<span class="ad-bus-ok-chip" title="${esc(st.experts.map(e => e.label).join(', '))}">
                            <span class="ad-bus-ok-dot" style="background:${st.skill.color}"></span>
                            ${esc(st.skill.name)} <small>${st.bf}</small>
                        </span>`
                    ).join('')}
                </div>
            </details>` : ''}
        </div>

        <div class="ad-obj">
            <div class="ad-block-hdr">
                <span class="ad-block-ttl">🎯 Objectifs équipe</span>
                ${currentPiNum ? `<div class="ad-obj-pi-nav">
                    <button class="btn btn-xs btn-ghost ad-obj-pi-prev" title="PI précédent">‹</button>
                    <span class="ad-obj-pi-lbl${isPastPi ? ' ad-obj-pi-lbl--past' : ''}">${esc(objPiLabel)}</span>
                    <button class="btn btn-xs btn-ghost ad-obj-pi-next"${_objPiOffset >= 0 ? ' disabled' : ''} title="PI suivant">›</button>
                </div>` : ''}
                ${isObjReadOnly
                    ? `<button class="btn btn-xs btn-secondary ad-obj-unlock-btn" title="Déverrouiller pour éditer ce PI passé">🔓</button>`
                    : `<button class="btn btn-xs btn-secondary ad-obj-edit-btn" data-obj-key="${esc(objKey)}" title="Modifier les objectifs">✏️</button>`
                }
            </div>
            ${isObjReadOnly ? `<p class="ad-obj-readonly-hint">— lecture seule (les objectifs s'éditent uniquement sur le PI courant).</p>` : ''}
            <div class="ad-obj-body" id="ad-obj-body">
                ${objLines.length === 0
                    ? `<p class="ad-empty ad-empty--sm">Aucun objectif défini.${isObjReadOnly ? '' : '<br><small>Cliquez ✏️ pour ajouter.</small>'}</p>`
                    : `<ul class="ad-obj-list">
                        ${objLines.map((line, i) => {
                            const done = /^\[(x|X)\] /.test(line);
                            const text = line.replace(/^\[[ xX]\] /, '');
                            return `<li class="ad-obj-item${done ? ' ad-obj-done' : ''}">
                                <label><input type="checkbox" class="ad-obj-chk" data-obj-idx="${i}" data-obj-key="${esc(objKey)}" ${done ? 'checked' : ''} ${isObjReadOnly ? 'disabled' : ''}> ${esc(text)}</label>
                            </li>`;
                        }).join('')}
                    </ul>`}
            </div>
        </div>
    </div>

    <details class="ad-section-det" open>
        <summary class="ad-section-sum">📊 Répartition par compétence</summary>
        <div class="ad-distrib">
            ${cats.map(cat => {
                const catSkills = dashSkills.filter(s => (s.category || 'Autres') === cat);
                const total = Math.max(entities.length, 1);
                return `<details class="ad-distrib-cat" open>
                    <summary class="ad-distrib-cat-sum">
                        ${esc(cat)} <span class="ad-distrib-cat-n">${catSkills.length}</span>
                    </summary>
                    <div class="ad-distrib-rows">
                        ${catSkills.map(s => {
                            const dist = [0,1,2,3,4].map(v =>
                                entities.filter(e => _skillLevel(scope, e.key, s.id) === v).length
                            );
                            const req = teamHasReq && _getTeamReq(selTeamName).has(s.id);
                            return `<div class="ad-distrib-row">
                                <span class="ad-distrib-name${req ? ' ad-distrib-req' : ''}">
                                    <span class="ad-distrib-dot" style="background:${s.color}"></span>${req ? '⭐ ' : ''}${esc(s.name)}
                                </span>
                                <div class="ad-distrib-bar" title="${SKILL_LEVELS.map((l, i) => l.label + ': ' + dist[i]).join(' · ')}">
                                    ${SKILL_LEVELS.slice(1).map((l, i) => dist[i+1] > 0
                                        ? `<span class="ad-distrib-seg" style="width:${dist[i+1]/total*100}%;background:${l.color}"></span>`
                                        : '').join('')}
                                    ${dist[0] > 0 ? `<span class="ad-distrib-seg ad-distrib-seg--none" style="width:${dist[0]/total*100}%"></span>` : ''}
                                </div>
                                <span class="ad-distrib-stat">
                                    ${SKILL_LEVELS.slice(1).map((l, i) => dist[i+1] > 0
                                        ? `<span style="color:${l.color}">${dist[i+1]}×${l.short}</span>`
                                        : '').filter(Boolean).join(' ')}
                                </span>
                            </div>`;
                        }).join('')}
                    </div>
                </details>`;
            }).join('')}
        </div>
    </details>

    <details class="ad-section-det" open>
        <summary class="ad-section-sum">🌱 Plan de développement individuel</summary>
        ${devPlans.length === 0
            ? `<div class="ad-empty">${scope !== 'member' ? 'Plan de développement disponible en scope membre.' : 'Aucun plan identifié — évaluez les membres à niveau 1 pour démarrer.'}</div>`
            : `<div class="ad-devplan-grid">
                ${devPlans.map(({ entity, progSkills, missingReq, forteApps }) => `
                <div class="ad-devplan-card">
                    <div class="ad-devplan-hdr">
                        <span class="ad-devplan-name">${esc(entity.label)}</span>
                        ${entity.team ? `<span class="ad-devplan-sub">${esc(entity.team)}${entity.role ? ' · ' + esc(entity.role) : ''}</span>` : ''}
                        ${forteApps.length ? `<span class="ad-devplan-apps" title="Appétences fortes : ${esc(forteApps.join(', '))}">● ${forteApps.slice(0, 3).map(a => esc(a)).join(', ')}${forteApps.length > 3 ? '…' : ''}</span>` : ''}
                    </div>
                    ${missingReq.length > 0 ? `<div class="ad-devplan-block ad-devplan-block--req">
                        <span class="ad-devplan-sec-lbl">⛔ Manquantes (requises équipe)</span>
                        ${missingReq.map(s => `<span class="ad-stag ad-stag--req" style="--sc:${s.color}">${esc(s.name)}</span>`).join('')}
                    </div>` : ''}
                    ${progSkills.length > 0 ? `<div class="ad-devplan-block">
                        <span class="ad-devplan-sec-lbl">📈 En progression niv.1 → 2+</span>
                        ${progSkills.map(s => `<span class="ad-stag ad-stag--prog" style="--sc:${s.color}">${esc(s.name)}</span>`).join('')}
                    </div>` : ''}
                </div>`).join('')}
            </div>`}
    </details>`;
}

function _wireMatrix(el) {
    // Switch scope membre/équipe
    el.querySelectorAll('.atlas-scope-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _matrixScope = btn.dataset.scope;
            localStorage.setItem('sb-atlas-scope', _matrixScope);
            _renderMatrix(el);
        });
    });

    // Filtres : recherche (debounce léger via input) + masquer non-évalués
    const searchEl = el.querySelector('#atlas-search');
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            _matrixQuery = searchEl.value;
            const pos = searchEl.selectionStart;
            _renderMatrix(el);
            // Restaure le focus + curseur après re-render
            const s2 = el.querySelector('#atlas-search');
            if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); }
        });
    }
    el.querySelector('#atlas-hide-empty')?.addEventListener('change', e => {
        _matrixHideEmpty = e.target.checked;
        _renderMatrix(el);
    });

    // Cellule compétence : clic = +1 (cycle 0→4→0), clic droit = -1
    el.querySelectorAll('.atlas-cell[data-skill]').forEach(cell => {
        const apply = async (delta) => {
            const row = cell.closest('tr');
            const key = row.dataset.ent;
            const skillId = cell.dataset.skill;
            const cur = _skillLevel(_matrixScope, key, skillId);
            let next = cur + delta;
            if (next > 4) next = 0;
            if (next < 0) next = 4;
            await _saveSkill(key, cell.dataset.team, skillId, next);
        };
        cell.addEventListener('click', () => apply(+1));
        cell.addEventListener('contextmenu', e => { e.preventDefault(); apply(-1); });
    });

    // Cellule appétence : clic cycle faible→neutre→forte
    el.querySelectorAll('.atlas-cell--app[data-app]').forEach(cell => {
        cell.addEventListener('click', async () => {
            const row = cell.closest('tr');
            const key = row.dataset.ent;
            const appId = cell.dataset.app;
            const cur = _appValue(_matrixScope, key, appId);
            const order = ['neutre', 'forte', 'faible'];
            const next = order[(order.indexOf(cur) + 1) % order.length];
            await _saveAppetence(key, cell.dataset.team, appId, next);
        });
    });

    el.querySelector('#atlas-catalog-btn')?.addEventListener('click', () => _openCatalogModal(el));
    el.querySelector('#atlas-mobility-btn')?.addEventListener('click', () => _openMobilityModal());
    el.querySelector('#atlas-suggest-btn')?.addEventListener('click', () => _openSuggestModal());
    el.querySelector('#atlas-tsp-btn')?.addEventListener('click', () => _openTeamSkillPicker(el, store.get('team'), store.get('skills') || []));

    // Dashboard toggle
    el.querySelector('#atlas-dashboard-btn')?.addEventListener('click', () => {
        _dashboardVisible = !_dashboardVisible;
        localStorage.setItem('sb-atlas-dashboard', _dashboardVisible ? '1' : '0');
        _renderMatrix(el);
    });

    // Objectifs — navigation PI
    el.querySelector('.ad-obj-pi-prev')?.addEventListener('click', () => {
        _objPiOffset--;
        _renderMatrix(el);
    });
    el.querySelector('.ad-obj-pi-next')?.addEventListener('click', () => {
        if (_objPiOffset < 0) { _objPiOffset++; _renderMatrix(el); }
    });
    // Objectifs — déverrouillage PI passé
    el.querySelector('.ad-obj-unlock-btn')?.addEventListener('click', () => {
        _objUnlockedOffsets.add(_objPiOffset);
        _renderMatrix(el);
    });

    // Objectifs équipe — édition inline
    el.querySelector('.ad-obj-edit-btn')?.addEventListener('click', () => {
        const key  = el.querySelector('.ad-obj-edit-btn')?.dataset.objKey;
        const body = el.querySelector('#ad-obj-body');
        if (!body || !key) return;
        const current = localStorage.getItem(key) || '';
        body.innerHTML = `<textarea class="ad-obj-edit-area" placeholder="Un objectif par ligne.\n[ ] Objectif à faire\n[x] Objectif accompli">${esc(current)}</textarea>
            <div class="ad-obj-edit-btns">
                <button class="btn btn-primary btn-sm ad-obj-save-btn">💾 Sauvegarder</button>
                <button class="btn btn-secondary btn-sm ad-obj-cancel-btn">Annuler</button>
            </div>`;
        body.querySelector('textarea')?.focus();
        body.querySelector('.ad-obj-save-btn')?.addEventListener('click', () => {
            const val = (body.querySelector('textarea')?.value ?? '').trim();
            if (val) localStorage.setItem(key, val); else localStorage.removeItem(key);
            _renderMatrix(el);
        });
        body.querySelector('.ad-obj-cancel-btn')?.addEventListener('click', () => _renderMatrix(el));
    });

    // Objectifs — toggle checkbox
    el.querySelectorAll('.ad-obj-chk').forEach(chk => {
        chk.addEventListener('change', () => {
            const key = chk.dataset.objKey;
            const idx = parseInt(chk.dataset.objIdx, 10);
            const raw = localStorage.getItem(key) || '';
            const lines = raw.split('\n').filter(l => l.trim());
            if (idx < lines.length) {
                const line = lines[idx].replace(/^\[[ xX]\] /, '');
                lines[idx] = chk.checked ? `[x] ${line}` : `[ ] ${line}`;
                localStorage.setItem(key, lines.join('\n'));
            }
            chk.closest('li')?.classList.toggle('ad-obj-done', chk.checked);
        });
    });

    // Bouton ＋ dans le coin : ajout rapide d'une compétence (popover inline)
    el.querySelector('#atlas-add-skill')?.addEventListener('click', e => {
        e.stopPropagation();
        _openQuickAddSkill(e.currentTarget, el);
    });

    // Bouton favori/requis sur les en-têtes skill (intercepté avant le clic edit)
    el.querySelectorAll('.atlas-skill-fav').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const skillId  = btn.dataset.favSkill;
            const teamName = store.get('team');
            if (!teamName || teamName === 'all') return;
            _toggleTeamReq(teamName, skillId);
            _renderMatrix(el);
        });
    });

    // Clic en-tête compétence/appétence → édition rapide (renommer / catégorie / supprimer)
    el.querySelectorAll('[data-skill-hdr]').forEach(th => {
        th.addEventListener('click', () => _openItemEditPopover(th, 'skill', th.dataset.skillHdr, el));
    });
    el.querySelectorAll('[data-app-hdr]').forEach(th => {
        th.addEventListener('click', () => _openItemEditPopover(th, 'appetence', th.dataset.appHdr, el));
    });

    // Lacune → bouton créer ticket montée en compétence (sur les cellules faibles)
    el.querySelectorAll('.atlas-cov-warn').forEach((cell, i) => {
        cell.style.cursor = 'pointer';
        cell.title += '\nClic = créer un ticket de montée en compétence';
    });
    el.querySelectorAll('.atlas-cell[data-skill]').forEach(cell => {
        // Long press (600ms) → propose ticket skill-up, avec loader circulaire visuel
        let _pressTimer = null;
        const PRESS_MS = 600;
        const _startPress = e => {
            if (e.button !== undefined && e.button !== 0) return;
            const row = cell.closest('tr');
            const key = row.dataset.ent;
            const skillId = cell.dataset.skill;
            const lvl = _skillLevel(_matrixScope, key, skillId);
            if (lvl > 2) return;

            // SVG circle progress — calcul à partir de la taille réelle de la cellule
            const W = cell.offsetWidth || 38;
            const H = cell.offsetHeight || 34;
            const cx = W / 2, cy = H / 2;
            const r = Math.min(cx, cy) - 3;
            const circ = +(2 * Math.PI * r).toFixed(2);
            // Couleur de la compétence (lue depuis --lvl via getComputedStyle)
            const color = getComputedStyle(cell).getPropertyValue('--lvl').trim() || '#6366f1';
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('class', 'atlas-press-svg');
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            // Piste grise
            const track = document.createElementNS(svgNS, 'circle');
            track.setAttribute('class', 'atlas-press-track');
            track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
            track.setAttribute('stroke', 'rgba(0,0,0,.1)'); track.setAttribute('stroke-width', '2.5');
            // Arc coloré
            const arc = document.createElementNS(svgNS, 'circle');
            arc.setAttribute('class', 'atlas-press-arc');
            arc.setAttribute('cx', cx); arc.setAttribute('cy', cy); arc.setAttribute('r', r);
            arc.setAttribute('stroke', color); arc.setAttribute('stroke-width', '3');
            arc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
            arc.style.setProperty('--circ', circ);
            arc.style.setProperty('--press-ms', `${PRESS_MS}ms`);
            svg.appendChild(track);
            svg.appendChild(arc);
            cell.appendChild(svg);

            cell.classList.add('atlas-cell--pressing');
            cell.style.setProperty('--press-ms', `${PRESS_MS}ms`);
            _pressTimer = setTimeout(() => {
                svg.remove();
                cell.classList.remove('atlas-cell--pressing');
                _openSkillUpModal(key, cell.dataset.team, skillId);
            }, PRESS_MS);
        };
        const _cancelPress = () => {
            clearTimeout(_pressTimer);
            cell.classList.remove('atlas-cell--pressing');
            cell.querySelector('.atlas-press-svg')?.remove();
        };
        cell.addEventListener('mousedown', _startPress);
        cell.addEventListener('mouseup', _cancelPress);
        cell.addEventListener('mouseleave', _cancelPress);
        cell.addEventListener('touchstart', _startPress, { passive: true });
        cell.addEventListener('touchend', _cancelPress);
        cell.addEventListener('touchcancel', _cancelPress);
    });
}

// ── Persistance optimiste (met à jour le store puis l'API) ──────────────────────
async function _saveSkill(key, team, skillId, level) {
    const list = (store.get('memberSkills') || []).filter(x => !(x.scope === _matrixScope && x.scopeKey === key && x.skillId === skillId));
    if (level > 0) list.push({ scope: _matrixScope, scopeKey: key, team, skillId, level });
    store.set('memberSkills', list); // déclenche re-render via subscription
    try {
        await api.upsertMemberSkill({ scope: _matrixScope, scopeKey: key, team, skillId, level });
    } catch (e) {
        const { toast } = await import('../utils.js');
        toast('Erreur sauvegarde compétence', 'error');
    }
}

async function _saveAppetence(key, team, appId, value) {
    const list = (store.get('memberAppetences') || []).filter(x => !(x.scope === _matrixScope && x.scopeKey === key && x.appetenceId === appId));
    if (value !== 'neutre') list.push({ scope: _matrixScope, scopeKey: key, team, appetenceId: appId, value });
    store.set('memberAppetences', list);
    try {
        await api.upsertMemberAppetence({ scope: _matrixScope, scopeKey: key, team, appetenceId: appId, value });
    } catch (e) {
        const { toast } = await import('../utils.js');
        toast('Erreur sauvegarde appétence', 'error');
    }
}

// ── Tableau de suivi de mobilité (modal, lecture + édition rapide) ──────────────
function _openMobilityModal() {
    document.getElementById('atlas-mobility-overlay')?.remove();
    const members  = _allMembers();
    const mobility = store.get('mobility') || [];
    const teams    = store.get('teams') || [];
    const byMember = Object.fromEntries(mobility.map(m => [m.memberName, m]));
    // Orphelins : lignes de mobilité dont le membre n'existe plus (renommé/supprimé du CSV RH)
    const memberNames = new Set(members.map(m => m.name));
    const orphans = mobility.filter(m => !memberNames.has(m.memberName) &&
        (m.targetRole || m.targetTeam || m.plan || m.currentLevel)); // ignore les lignes vides

    const POT  = ['faible', 'moyen', 'fort'];
    const APP  = ['faible', 'neutre', 'forte'];
    const RISK = ['aucun', 'moyen', 'critique'];

    const overlay = document.createElement('div');
    overlay.id = 'atlas-mobility-overlay';
    overlay.className = 'atlas-mobility-overlay';
    overlay.innerHTML = `
        <div class="atlas-mobility-modal">
            <div class="atlas-mobility-hdr">
                <h3>📋 Suivi de mobilité & trajectoires</h3>
                <button class="btn-icon" id="atlas-mob-close"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
            <div class="atlas-mobility-body">
                <table class="atlas-mob-table">
                    <thead><tr>
                        <th>Collaborateur</th><th>Équipe actuelle</th><th>Équipe cible</th>
                        <th>Rôle cible</th><th>Niveau (1-4)</th><th>Potentiel</th>
                        <th>Appétence</th><th>Risque</th><th>Plan d'accompagnement</th><th>Transition</th>
                    </tr></thead>
                    <tbody>
                        ${members.map(m => {
                            const d = byMember[m.name] || {};
                            const sel = (name, opts, cur, cls='') => `<select class="atlas-mob-input ${cls}" data-field="${name}" data-member="${esc(m.name)}">
                                ${opts.map(o => `<option value="${o}"${(cur||'') === o ? ' selected' : ''}>${o}</option>`).join('')}
                            </select>`;
                            return `<tr data-member="${esc(m.name)}">
                                <td class="atlas-mob-name">${esc(m.name)}</td>
                                <td>${esc(m.team || '—')}</td>
                                <td><select class="atlas-mob-input" data-field="targetTeam" data-member="${esc(m.name)}"><option value="">—</option>${teams.map(t => `<option value="${esc(t)}"${d.targetTeam === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
                                <td><input class="atlas-mob-input" data-field="targetRole" data-member="${esc(m.name)}" value="${esc(d.targetRole || '')}" placeholder="ex: Tech Lead"></td>
                                <td class="atlas-mob-lvl-cell">
                                    <select class="atlas-mob-input atlas-mob-lvl" data-field="currentLevel" data-member="${esc(m.name)}">${[0,1,2,3,4].map(n => `<option value="${n}"${(d.currentLevel||0) === n ? ' selected' : ''}>${n || '–'}</option>`).join('')}</select>
                                    ${(() => {
                                        const g = _memberGlobalLevel(m.name);
                                        if (!g.n) return '';
                                        const diff = (d.currentLevel || 0) !== g.avg;
                                        return `<button type="button" class="atlas-mob-derive${diff ? ' atlas-mob-derive--diff' : ''}" data-member="${esc(m.name)}" data-derived="${g.avg}" title="Niveau dérivé de ${g.n} compétence(s) — moyenne ${g.avg}/4, max ${g.max}/4. Cliquer pour reprendre.">≈${g.avg}</button>`;
                                    })()}
                                </td>
                                <td>${sel('potential', POT, d.potential, 'atlas-mob-pot')}</td>
                                <td>${sel('appetence', APP, d.appetence, 'atlas-mob-app')}</td>
                                <td>${sel('risk', RISK, d.risk, 'atlas-mob-risk')}</td>
                                <td><input class="atlas-mob-input atlas-mob-plan" data-field="plan" data-member="${esc(m.name)}" value="${esc(d.plan || '')}" placeholder="Mentorat, formation…"></td>
                                <td><input class="atlas-mob-input atlas-mob-dur" data-field="transitionDuration" data-member="${esc(m.name)}" value="${esc(d.transitionDuration || '')}" placeholder="3 mois"></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="atlas-mobility-foot">
                ${orphans.length
                    ? `<span class="atlas-mob-orphans" title="${esc(orphans.map(o => o.memberName).join(', '))}">⚠ ${orphans.length} ligne(s) orpheline(s) (membre absent du CSV RH) <button class="btn btn-ghost btn-xs" id="atlas-mob-clean">Nettoyer</button></span>`
                    : `<span class="text-xs text-muted">Modifications enregistrées automatiquement.</span>`}
                <button class="btn btn-secondary btn-sm" id="atlas-mob-export">⬇ Exporter CSV</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => { overlay.classList.remove('visible'); overlay.addEventListener('transitionend', () => overlay.remove(), { once: true }); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#atlas-mob-close').addEventListener('click', close);

    // Nettoyage des lignes orphelines
    overlay.querySelector('#atlas-mob-clean')?.addEventListener('click', async () => {
        if (!confirm(`Supprimer ${orphans.length} ligne(s) de mobilité dont le membre n'existe plus ?\n\n${orphans.map(o => '· ' + o.memberName).join('\n')}`)) return;
        const { toast } = await import('../utils.js');
        try {
            await Promise.all(orphans.filter(o => o.id).map(o => api.deleteMobility(o.id)));
            store.set('mobility', mobility.filter(m => !orphans.includes(m)));
            toast(`${orphans.length} ligne(s) orpheline(s) supprimée(s)`, 'success');
            close();
        } catch (err) { toast('Erreur lors du nettoyage', 'error'); }
    });

    // Sauvegarde au change/blur
    overlay.querySelectorAll('.atlas-mob-input').forEach(inp => {
        const save = async () => {
            const name  = inp.dataset.member;
            const field = inp.dataset.field;
            let val = inp.value;
            if (field === 'currentLevel') val = parseInt(val, 10) || 0;
            const member = members.find(m => m.name === name);
            const payload = { memberName: name, team: member?.team || '', [field]: val };
            // Mise à jour optimiste du store
            const list = (store.get('mobility') || []).filter(x => x.memberName !== name);
            const prev = (store.get('mobility') || []).find(x => x.memberName === name) || {};
            list.push({ ...prev, memberName: name, team: member?.team || '', [field]: val });
            store.set('mobility', list);
            try { await api.upsertMobility(payload); } catch {}
            _applyMobColors(inp);
        };
        inp.addEventListener('change', save);
        _applyMobColors(inp);
    });

    // Bouton "reprendre le niveau dérivé" → applique la moyenne des compétences
    overlay.querySelectorAll('.atlas-mob-derive').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.dataset.member;
            const derived = parseInt(btn.dataset.derived, 10) || 0;
            const sel = overlay.querySelector(`.atlas-mob-lvl[data-member="${CSS.escape(name)}"]`);
            if (sel) { sel.value = String(derived); sel.dispatchEvent(new Event('change')); }
            btn.classList.remove('atlas-mob-derive--diff');
        });
    });

    overlay.querySelector('#atlas-mob-export').addEventListener('click', () => _exportMobilityCsv(members, store.get('mobility') || []));
}

/** Colore les selects potentiel/appétence/risque selon leur valeur. */
function _applyMobColors(inp) {
    const f = inp.dataset.field, v = inp.value;
    const RISK_COL = { aucun: '#22c55e', moyen: '#f59e0b', critique: '#ef4444' };
    const POT_COL  = { faible: '#94a3b8', moyen: '#38bdf8', fort: '#22c55e' };
    const APP_COL  = { faible: '#94a3b8', neutre: '#cbd5e1', forte: '#f59e0b' };
    let col = '';
    if (f === 'risk') col = RISK_COL[v];
    else if (f === 'potential') col = POT_COL[v];
    else if (f === 'appetence') col = APP_COL[v];
    if (col) inp.style.setProperty('--mob-col', col);
}

function _exportMobilityCsv(members, mobility) {
    const byMember = Object.fromEntries(mobility.map(m => [m.memberName, m]));
    const head = ['Collaborateur', 'Équipe actuelle', 'Équipe cible', 'Rôle cible', 'Niveau (1-4)', 'Potentiel', 'Appétence', 'Risque', 'Plan accompagnement', 'Transition'];
    const rows = members.map(m => {
        const d = byMember[m.name] || {};
        return [m.name, m.team || '', d.targetTeam || '', d.targetRole || '', d.currentLevel || '', d.potential || '', d.appetence || '', d.risk || '', (d.plan || '').replace(/[\n;]/g, ' '), d.transitionDuration || ''];
    });
    const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mobilite-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal — Gestion du catalogue (compétences + appétences)
// ══════════════════════════════════════════════════════════════════════════════
const _SKILL_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#ef4444', '#14b8a6'];

// Catalogue type pour démarrage rapide (cohérent avec le seed backend)
const _DEFAULT_CATALOG = [
    ['Frontend', '#3b82f6', ['React / JS', 'CSS / Design System', 'Accessibilité']],
    ['Backend',  '#8b5cf6', ['API REST', 'SQL / Données', 'Sécurité']],
    ['DevOps',   '#06b6d4', ['CI/CD', 'Cloud / Infra', 'Observabilité']],
    ['Agile',    '#22c55e', ['Facilitation', 'Craft / Tests', 'Product']],
];

async function _seedDefaultCatalog(matrixEl) {
    const { toast } = await import('../utils.js');
    try {
        const created = [];
        let sort = 0;
        for (const [cat, color, names] of _DEFAULT_CATALOG) {
            for (const name of names) {
                created.push(await api.createSkill({ name, category: cat, color, sort: sort++ }));
            }
        }
        store.set('skills', [...(store.get('skills') || []), ...created]);
        toast(`${created.length} compétences ajoutées`, 'success');
        if (matrixEl) _renderMatrix(matrixEl);
    } catch (err) {
        toast('Erreur lors de la création du catalogue', 'error');
    }
}

// ── Popover ajout rapide d'une compétence (depuis le bouton ＋ de la grille) ──
function _closePopovers() {
    document.querySelectorAll('.atlas-popover').forEach(p => p.remove());
    if (_popoverDocHandler) { document.removeEventListener('mousedown', _popoverDocHandler, true); _popoverDocHandler = null; }
}
let _popoverDocHandler = null;

function _positionPopover(pop, anchor) {
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth || 240;
    pop.style.position = 'fixed';
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, r.left))}px`;
    pop.style.zIndex = '10002';
    _popoverDocHandler = ev => { if (!pop.contains(ev.target) && ev.target !== anchor) _closePopovers(); };
    setTimeout(() => document.addEventListener('mousedown', _popoverDocHandler, true), 0);
}

function _openQuickAddSkill(anchor, matrixEl) {
    _closePopovers();
    const cats = [...new Set((store.get('skills') || []).map(s => s.category || 'Général'))];
    const pop = document.createElement('div');
    pop.className = 'atlas-popover';
    pop.innerHTML = `
        <div class="atlas-popover-title">Nouvelle compétence</div>
        <form class="atlas-popover-form" id="atlas-qa-form">
            <input class="input input-sm" name="name" placeholder="Nom (ex: Kubernetes)" autocomplete="off" required>
            <input class="input input-sm" name="category" placeholder="Catégorie" list="atlas-qa-cats" autocomplete="off">
            <datalist id="atlas-qa-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
            <div class="atlas-popover-colors">
                ${_SKILL_COLORS.map((c, i) => `<button type="button" class="atlas-color-dot${i === 0 ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Ajouter</button>
        </form>`;
    _positionPopover(pop, anchor);
    const nameInput = pop.querySelector('input[name="name"]');
    nameInput.focus();

    let color = _SKILL_COLORS[0];
    pop.querySelectorAll('.atlas-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            color = dot.dataset.color;
            pop.querySelectorAll('.atlas-color-dot').forEach(d => d.classList.toggle('active', d === dot));
        });
    });

    pop.querySelector('#atlas-qa-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = (fd.get('name') || '').trim();
        if (!name) return;
        const category = (fd.get('category') || '').trim() || 'Général';
        const skills = store.get('skills') || [];
        try {
            const created = await api.createSkill({ name, category, color, sort: skills.length });
            store.set('skills', [...skills, created]);
            _closePopovers();
            if (matrixEl) _renderMatrix(matrixEl);
        } catch (err) {
            const { toast } = await import('../utils.js');
            toast('Erreur création compétence', 'error');
        }
    });
}

// ── Popover édition d'une compétence/appétence (clic sur l'en-tête de colonne) ──
function _openItemEditPopover(anchor, kind, id, matrixEl) {
    _closePopovers();
    const isSkill = kind === 'skill';
    const items = store.get(isSkill ? 'skills' : 'appetences') || [];
    const item = items.find(i => i.id === id);
    if (!item) return;
    const cats = [...new Set(items.map(i => i.category || 'Général'))];

    const pop = document.createElement('div');
    pop.className = 'atlas-popover';
    pop.innerHTML = `
        <div class="atlas-popover-title">Modifier · ${esc(item.name)}</div>
        <form class="atlas-popover-form" id="atlas-edit-form">
            <input class="input input-sm" name="name" value="${esc(item.name)}" autocomplete="off" required>
            <input class="input input-sm" name="category" value="${esc(item.category || '')}" list="atlas-edit-cats" autocomplete="off">
            <datalist id="atlas-edit-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
            <div class="atlas-popover-colors">
                ${_SKILL_COLORS.map(c => `<button type="button" class="atlas-color-dot${c === item.color ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
            </div>
            <div class="atlas-popover-order">
                <span class="atlas-popover-order-lbl">Position</span>
                <button type="button" class="atlas-order-btn" id="atlas-move-left" title="Déplacer à gauche">←</button>
                <button type="button" class="atlas-order-btn" id="atlas-move-right" title="Déplacer à droite">→</button>
            </div>
            <div class="atlas-popover-actions">
                <button type="button" class="btn btn-ghost btn-sm atlas-popover-del" id="atlas-edit-del">🗑 Supprimer</button>
                <button type="submit" class="btn btn-primary btn-sm">Enregistrer</button>
            </div>
        </form>`;
    _positionPopover(pop, anchor);

    let color = item.color;
    pop.querySelectorAll('.atlas-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            color = dot.dataset.color;
            pop.querySelectorAll('.atlas-color-dot').forEach(d => d.classList.toggle('active', d === dot));
        });
    });

    // Réordonnancement : échange le `sort` avec le voisin dans la même catégorie
    const _move = async (dir) => {
        // Tri courant par catégorie puis sort, on travaille dans la catégorie de l'item
        const sameCat = items.filter(i => (i.category || 'Général') === (item.category || 'Général'))
            .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
        const idx = sameCat.findIndex(i => i.id === id);
        const swapWith = sameCat[idx + dir];
        if (!swapWith) return;
        const { toast } = await import('../utils.js');
        try {
            const s1 = item.sort ?? 0, s2 = swapWith.sort ?? 0;
            const upd = isSkill ? api.updateSkill : api.updateAppetence;
            const [u1, u2] = await Promise.all([upd(id, { sort: s2 }), upd(swapWith.id, { sort: s1 })]);
            store.set(isSkill ? 'skills' : 'appetences', items.map(i => i.id === u1.id ? u1 : i.id === u2.id ? u2 : i));
            _closePopovers();
            if (matrixEl) _renderMatrix(matrixEl);
        } catch (err) { toast('Erreur réordonnancement', 'error'); }
    };
    pop.querySelector('#atlas-move-left').addEventListener('click', () => _move(-1));
    pop.querySelector('#atlas-move-right').addEventListener('click', () => _move(+1));

    pop.querySelector('#atlas-edit-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = (fd.get('name') || '').trim();
        if (!name) return;
        const category = (fd.get('category') || '').trim() || 'Général';
        const { toast } = await import('../utils.js');
        try {
            const updated = isSkill
                ? await api.updateSkill(id, { name, category, color })
                : await api.updateAppetence(id, { name, category, color });
            store.set(isSkill ? 'skills' : 'appetences', items.map(i => i.id === id ? updated : i));
            _closePopovers();
            if (matrixEl) _renderMatrix(matrixEl);
        } catch (err) { toast('Erreur modification', 'error'); }
    });

    pop.querySelector('#atlas-edit-del').addEventListener('click', async () => {
        if (!confirm(`Supprimer « ${item.name} » ? Les niveaux associés seront perdus.`)) return;
        const { toast } = await import('../utils.js');
        try {
            if (isSkill) await api.deleteSkill(id); else await api.deleteAppetence(id);
            store.set(isSkill ? 'skills' : 'appetences', items.filter(i => i.id !== id));
            if (isSkill) store.set('memberSkills', (store.get('memberSkills') || []).filter(x => x.skillId !== id));
            else store.set('memberAppetences', (store.get('memberAppetences') || []).filter(x => x.appetenceId !== id));
            _closePopovers();
            if (matrixEl) _renderMatrix(matrixEl);
        } catch (err) { toast('Erreur suppression', 'error'); }
    });
}

function _openCatalogModal(matrixEl) {
    document.getElementById('atlas-catalog-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'atlas-catalog-overlay';
    overlay.className = 'atlas-mobility-overlay';
    overlay.innerHTML = `
        <div class="atlas-catalog-modal">
            <div class="atlas-mobility-hdr">
                <h3>⚙️ Catalogue — compétences & appétences</h3>
                <button class="btn-icon" id="atlas-cat-close"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
            <div class="atlas-catalog-body">
                <div class="atlas-catalog-col" id="atlas-cat-skills"></div>
                <div class="atlas-catalog-col" id="atlas-cat-apps"></div>
            </div>
            <details class="atlas-cat-import">
                <summary class="atlas-cat-import-hdr">
                    <span class="atlas-cat-import-title">Import</span>
                    <span class="atlas-cat-import-hint">JSON ou CSV <code>nom;catégorie;couleur</code></span>
                    <span class="atlas-cat-import-status" id="atlas-cat-import-status"></span>
                </summary>
                <div class="atlas-cat-import-row">
                    <textarea class="input atlas-cat-import-ta" id="atlas-cat-import-ta" rows="2" placeholder='[{"name":"React","category":"Frontend"},{"name":"API REST","category":"Backend"}]'></textarea>
                    <div class="atlas-cat-import-controls">
                        <label class="atlas-cat-import-kind-lbl"><input type="radio" name="atlas-import-kind" value="skill" checked> Compétences</label>
                        <label class="atlas-cat-import-kind-lbl"><input type="radio" name="atlas-import-kind" value="appetence"> Appétences</label>
                        <button class="btn btn-primary btn-sm" id="atlas-cat-import-btn" disabled>Importer</button>
                    </div>
                </div>
            </details>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => {
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        if (matrixEl) _renderMatrix(matrixEl);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#atlas-cat-close').addEventListener('click', close);

    _renderCatalogList(overlay, 'skill');
    _renderCatalogList(overlay, 'appetence');

    // ── Import
    const ta     = overlay.querySelector('#atlas-cat-import-ta');
    const status = overlay.querySelector('#atlas-cat-import-status');
    const btn    = overlay.querySelector('#atlas-cat-import-btn');

    const _parseCatalogImport = raw => {
        raw = (raw || '').trim();
        if (!raw) return null;
        // Tentative JSON
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) {
                const valid = parsed.filter(x => x && typeof x.name === 'string' && x.name.trim());
                if (valid.length) return { items: valid, ok: valid.length === parsed.length };
            }
        } catch { /* try CSV */ }
        // Tentative CSV  nom;catégorie;couleur
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const items = lines.map(l => {
            const [name, category = 'Autres', color = ''] = l.split(';').map(s => s.trim());
            return name ? { name, category, color: color || null } : null;
        }).filter(Boolean);
        if (items.length) return { items, ok: items.length === lines.length };
        return { items: [], ok: false };
    };

    const _updateStatus = () => {
        const result = _parseCatalogImport(ta.value);
        if (!result || !ta.value.trim()) {
            status.textContent = '';
            status.className = 'atlas-cat-import-status';
            btn.disabled = true;
            return;
        }
        if (!result.items.length) {
            status.innerHTML = '● Format non reconnu';
            status.className = 'atlas-cat-import-status atlas-cat-import-status--red';
            btn.disabled = true;
        } else if (!result.ok) {
            status.innerHTML = `● ${result.items.length} entrée(s) valides (lignes ignorées)`;
            status.className = 'atlas-cat-import-status atlas-cat-import-status--orange';
            btn.disabled = false;
        } else {
            status.innerHTML = `● ${result.items.length} entrée(s) prêtes`;
            status.className = 'atlas-cat-import-status atlas-cat-import-status--green';
            btn.disabled = false;
        }
    };

    ta.addEventListener('input', _updateStatus);

    btn.addEventListener('click', async () => {
        const result = _parseCatalogImport(ta.value);
        if (!result?.items?.length) return;
        const kind = overlay.querySelector('input[name="atlas-import-kind"]:checked')?.value || 'skill';
        const isSkill = kind === 'skill';
        const existing = store.get(isSkill ? 'skills' : 'appetences') || [];
        const existingNames = new Set(existing.map(x => x.name.toLowerCase()));
        const toCreate = result.items.filter(x => !existingNames.has(x.name.toLowerCase()));
        if (!toCreate.length) {
            status.innerHTML = '● Toutes les entrées existent déjà';
            status.className = 'atlas-cat-import-status atlas-cat-import-status--orange';
            return;
        }
        btn.disabled = true;
        btn.textContent = '…';
        const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#ec4899'];
        let created = [...existing];
        try {
            for (let i = 0; i < toCreate.length; i++) {
                const { name, category = 'Autres', color } = toCreate[i];
                const c = color || colors[(existing.length + i) % colors.length];
                const item = isSkill
                    ? await api.createSkill({ name, category, color: c, sort: existing.length + i })
                    : await api.createAppetence({ name, category, color: c, sort: existing.length + i });
                created.push(item);
            }
            store.set(isSkill ? 'skills' : 'appetences', created);
            _renderCatalogList(overlay, kind);
            ta.value = '';
            status.innerHTML = `● ${toCreate.length} entrée(s) importées`;
            status.className = 'atlas-cat-import-status atlas-cat-import-status--green';
            btn.textContent = 'Importer';
            btn.disabled = true;
        } catch {
            const { toast } = await import('../utils.js');
            toast('Erreur import catalogue', 'error');
            btn.textContent = 'Importer';
            btn.disabled = false;
        }
    });
}

function _renderCatalogList(overlay, kind) {
    const isSkill = kind === 'skill';
    const storeKey = isSkill ? 'skills' : 'appetences';
    const items = [...(store.get(storeKey) || [])].sort(_bySort);
    const col = overlay.querySelector(isSkill ? '#atlas-cat-skills' : '#atlas-cat-apps');
    const cats = [...new Set(items.map(i => i.category || 'Autres'))];
    const title = isSkill ? '🎯 Compétences' : '🔥 Appétences';

    col.innerHTML = `
        <div class="atlas-cat-hdr">${title} <span class="atlas-cat-n">${items.length}</span></div>
        <div class="atlas-cat-list" id="atlas-cat-list-${kind}">
            ${cats.map(c => `
                <div class="atlas-cat-group" data-cat="${esc(c)}">
                    <div class="atlas-cat-group-name">${esc(c)}</div>
                    ${items.filter(i => (i.category || 'Autres') === c).map(i => `
                        <div class="atlas-cat-item" draggable="true" data-id="${esc(i.id)}" data-cat="${esc(i.category || 'Autres')}">
                            <span class="atlas-cat-drag" title="Glisser pour réordonner">⠿</span>
                            <span class="atlas-cat-dot" style="background:${i.color}"></span>
                            <span class="atlas-cat-item-name">${esc(i.name)}</span>
                            <button class="atlas-cat-del btn-icon btn-icon-sm" data-id="${esc(i.id)}" title="Supprimer"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>
                        </div>`).join('')}
                </div>`).join('')}
        </div>
        <form class="atlas-cat-add" data-kind="${kind}">
            <input class="input input-sm" name="name" placeholder="${isSkill ? 'Compétence…' : 'Appétence…'}" required>
            <input class="input input-sm" name="category" placeholder="Catégorie" list="atlas-cat-${kind}-cats">
            <datalist id="atlas-cat-${kind}-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
            <button type="submit" class="btn btn-primary btn-sm">＋</button>
        </form>`;

    // Ajout
    col.querySelector('.atlas-cat-add').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = (fd.get('name') || '').trim();
        if (!name) return;
        const category = (fd.get('category') || '').trim() || 'Autres';
        const color = _SKILL_COLORS[items.length % _SKILL_COLORS.length];
        try {
            const created = isSkill
                ? await api.createSkill({ name, category, color, sort: items.length })
                : await api.createAppetence({ name, category, color, sort: items.length });
            store.set(isSkill ? 'skills' : 'appetences', [...items, created]);
            _renderCatalogList(overlay, kind);
        } catch (err) {
            const { toast } = await import('../utils.js');
            toast('Erreur création', 'error');
        }
    });

    // Suppression
    col.querySelectorAll('.atlas-cat-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Supprimer du catalogue ? Les niveaux associés seront perdus.')) return;
            try {
                if (isSkill) await api.deleteSkill(id); else await api.deleteAppetence(id);
                store.set(isSkill ? 'skills' : 'appetences', items.filter(i => i.id !== id));
                // Nettoie les niveaux liés du store
                if (isSkill) store.set('memberSkills', (store.get('memberSkills') || []).filter(x => x.skillId !== id));
                else store.set('memberAppetences', (store.get('memberAppetences') || []).filter(x => x.appetenceId !== id));
                _renderCatalogList(overlay, kind);
            } catch (err) {
                const { toast } = await import('../utils.js');
                toast('Erreur suppression', 'error');
            }
        });
    });

    // ── Drag & drop pour réordonner ──────────────────────────────────────────
    const list = col.querySelector(`#atlas-cat-list-${kind}`);
    let _dragId = null, _dragEl = null;

    col.querySelectorAll('.atlas-cat-item[draggable]').forEach(row => {
        row.addEventListener('dragstart', e => {
            _dragId = row.dataset.id;
            _dragEl = row;
            row.classList.add('atlas-cat-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
            _dragEl?.classList.remove('atlas-cat-dragging');
            list.querySelectorAll('.atlas-cat-drop-over').forEach(el => el.classList.remove('atlas-cat-drop-over'));
            _dragId = null; _dragEl = null;
        });
        row.addEventListener('dragover', e => {
            if (!_dragId || row.dataset.id === _dragId) return;
            e.preventDefault();
            list.querySelectorAll('.atlas-cat-drop-over').forEach(el => el.classList.remove('atlas-cat-drop-over'));
            row.classList.add('atlas-cat-drop-over');
        });
        row.addEventListener('drop', async e => {
            e.preventDefault();
            if (!_dragId || row.dataset.id === _dragId) return;
            row.classList.remove('atlas-cat-drop-over');

            // Reconstruit l'ordre depuis le DOM après drop
            const allRows = [...list.querySelectorAll('.atlas-cat-item[data-id]')];
            const domOrder = allRows.map(r => r.dataset.id);
            // Insère _dragId avant la cible dans domOrder
            const fromIdx = domOrder.indexOf(_dragId);
            const toIdx   = domOrder.indexOf(row.dataset.id);
            if (fromIdx === -1 || toIdx === -1) return;
            domOrder.splice(fromIdx, 1);
            domOrder.splice(toIdx, 0, _dragId);

            // Assigne les nouveaux sort values et sauvegarde
            const currentItems = store.get(storeKey) || [];
            const updated = domOrder.map((id, idx) => {
                const item = currentItems.find(x => x.id === id);
                return item ? { ...item, sort: idx } : null;
            }).filter(Boolean);

            store.set(storeKey, updated);
            _renderCatalogList(overlay, kind);

            // Persistance API en arrière-plan (fire & forget)
            for (const item of updated) {
                try {
                    if (isSkill) await api.updateSkill(item.id, { sort: item.sort });
                    else await api.updateAppetence(item.id, { sort: item.sort });
                } catch { /* ignore */ }
            }
        });
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Action A — Créer un ticket "montée en compétence" depuis une lacune
// ══════════════════════════════════════════════════════════════════════════════
function _openSkillUpModal(scopeKey, team, skillId) {
    const skill = (store.get('skills') || []).find(s => s.id === skillId);
    if (!skill) return;
    const isTeam = _matrixScope === 'team';
    const target = isTeam ? `équipe ${scopeKey}` : scopeKey;
    const teams  = store.get('teams') || [];
    const members = _allMembers().filter(m => m.team === team);
    const curLvl = _skillLevel(_matrixScope, scopeKey, skillId);

    document.getElementById('atlas-skillup-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'atlas-skillup-overlay';
    overlay.className = 'atlas-mobility-overlay';
    overlay.innerHTML = `
        <div class="atlas-action-modal">
            <div class="atlas-mobility-hdr">
                <h3>🚀 Ticket de montée en compétence</h3>
                <button class="btn-icon" id="atlas-su-close"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
            <form class="atlas-action-body" id="atlas-su-form">
                <p class="atlas-action-ctx">
                    <span class="atlas-skill-badge" style="--lvl:${skill.color}">${esc(skill.name)}</span>
                    pour <strong>${esc(target)}</strong> · niveau actuel <strong>${curLvl || '—'}/4</strong>
                </p>
                <label class="atlas-field"><span>Titre</span>
                    <input class="input" name="title" value="[Skill-up] ${esc(skill.name)} — ${esc(scopeKey)}" required></label>
                <label class="atlas-field"><span>Board cible (équipe)</span>
                    <select class="input" name="team">
                        ${teams.map(t => `<option value="${esc(t)}"${t === team ? ' selected' : ''}>${esc(t)}</option>`).join('')}
                    </select></label>
                <label class="atlas-field"><span>Responsable (leader)</span>
                    <select class="input" name="leader">
                        <option value="">— aucun —</option>
                        ${members.map(m => `<option value="${esc(m.name)}"${(!isTeam && m.name === scopeKey) ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}
                    </select></label>
                <label class="atlas-field"><span>Objectif / plan</span>
                    <textarea class="input" name="description" rows="3" placeholder="Pairing, formation, mission concrète…">Monter de niveau ${curLvl || 0} à ${Math.min(4, (curLvl || 0) + 1)} sur « ${esc(skill.name)} ».</textarea></label>
                <div class="atlas-action-foot">
                    <button type="button" class="btn btn-secondary btn-sm" id="atlas-su-cancel">Annuler</button>
                    <button type="submit" class="btn btn-primary btn-sm">Créer le ticket</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => { overlay.classList.remove('visible'); overlay.addEventListener('transitionend', () => overlay.remove(), { once: true }); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#atlas-su-close').addEventListener('click', close);
    overlay.querySelector('#atlas-su-cancel').addEventListener('click', close);

    overlay.querySelector('#atlas-su-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const { toast } = await import('../utils.js');
        try {
            const ticket = await api.createTicket({
                title: fd.get('title'),
                team: fd.get('team'),
                leader: fd.get('leader') || null,
                description: fd.get('description'),
                type: 'task',
                priority: 'medium',
                labels: ['skill-up', _slug(skill.name)],
            });
            store.set('tickets', [...(store.get('tickets') || []), ticket]);
            toast('Ticket de montée en compétence créé', 'success');
            close();
        } catch (err) {
            toast('Erreur création ticket : ' + (err.message || err), 'error');
        }
    });
}

function _slug(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ══════════════════════════════════════════════════════════════════════════════
// Action B — Suggestions d'affectation (matching skill × disponibilité)
// ══════════════════════════════════════════════════════════════════════════════
function _memberLoad(name) {
    // Charge = nb de tickets actifs (non done) où le membre est leader ou contributeur
    const tickets = store.get('tickets') || [];
    return tickets.filter(t => t.status !== 'done' &&
        (t.leader === name || (t.contributors || []).includes(name))).length;
}
function _memberAbsentSoon(name) {
    // Absent dans les 14 prochains jours ?
    const today = new Date().toISOString().slice(0, 10);
    const in2w = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    return (store.get('absences') || []).some(a => a.memberName === name && a.startDate <= in2w && a.endDate >= today);
}

function _openSuggestModal() {
    const skills = store.get('skills') || [];
    document.getElementById('atlas-suggest-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'atlas-suggest-overlay';
    overlay.className = 'atlas-mobility-overlay';
    overlay.innerHTML = `
        <div class="atlas-action-modal">
            <div class="atlas-mobility-hdr">
                <h3>🧭 Qui affecter ?</h3>
                <button class="btn-icon" id="atlas-sg-close"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
            <div class="atlas-action-body">
                <label class="atlas-field"><span>Compétence requise</span>
                    <select class="input" id="atlas-sg-skill">
                        ${[...skills].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
                    </select></label>
                <label class="atlas-field atlas-field--inline">
                    <input type="checkbox" id="atlas-sg-team-only"> <span>Limiter à l'équipe filtrée</span></label>
                <div class="atlas-suggest-results" id="atlas-sg-results"></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => { overlay.classList.remove('visible'); overlay.addEventListener('transitionend', () => overlay.remove(), { once: true }); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#atlas-sg-close').addEventListener('click', close);

    const compute = () => {
        const skillId = overlay.querySelector('#atlas-sg-skill').value;
        const teamOnly = overlay.querySelector('#atlas-sg-team-only').checked;
        const selTeam = store.get('team');
        let members = _allMembers();
        if (teamOnly && selTeam && selTeam !== 'all') members = members.filter(m => m.team === selTeam);

        // Score = niveau skill (×25) − charge (×8) − pénalité absence (15) + appétence forte (+10)
        const scored = members.map(m => {
            const lvl = _skillLevel('member', m.name, skillId);
            const load = _memberLoad(m.name);
            const absent = _memberAbsentSoon(m.name);
            const appForte = (store.get('memberAppetences') || []).some(a => a.scope === 'member' && a.scopeKey === m.name && a.value === 'forte');
            const score = lvl * 25 - load * 8 - (absent ? 15 : 0) + (appForte ? 10 : 0);
            return { m, lvl, load, absent, score };
        }).filter(x => x.lvl > 0).sort((a, b) => b.score - a.score);

        const res = overlay.querySelector('#atlas-sg-results');
        if (!scored.length) {
            res.innerHTML = `<div class="atlas-empty-sm">Personne n'a cette compétence évaluée. <br>Pensez à créer un ticket de montée en compétence.</div>`;
            return;
        }
        res.innerHTML = scored.slice(0, 8).map((x, i) => {
            const lm = _levelMeta(x.lvl);
            return `<div class="atlas-suggest-row${i === 0 ? ' atlas-suggest-top' : ''}">
                <span class="atlas-suggest-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}</span>
                <span class="atlas-chip" style="--chip:${hashColor(x.m.name)}"><span class="atlas-chip-ini">${esc(initials(x.m.name))}</span></span>
                <div class="atlas-suggest-info">
                    <span class="atlas-suggest-name">${esc(x.m.name)}</span>
                    <span class="atlas-suggest-sub">${esc(x.m.team)}${x.m.role ? ' · ' + esc(x.m.role) : ''}</span>
                </div>
                <span class="atlas-suggest-badges">
                    <span class="atlas-skill-badge" style="--lvl:${lm.color}" title="Niveau">niv. ${x.lvl}</span>
                    <span class="atlas-suggest-load" title="Tickets actifs">${x.load} tkt</span>
                    ${x.absent ? '<span class="atlas-suggest-abs" title="Absent prochainement">🌴</span>' : ''}
                </span>
                <button class="btn btn-secondary btn-xs atlas-suggest-assign" data-member="${esc(x.m.name)}" data-team="${esc(x.m.team)}" title="Assigner à un ticket">Assigner</button>
            </div>`;
        }).join('');

        // Bouton Assigner → ouvre le sélecteur de ticket
        res.querySelectorAll('.atlas-suggest-assign').forEach(btn => {
            btn.addEventListener('click', () => _openAssignPicker(btn, btn.dataset.member, btn.dataset.team));
        });
    };

    overlay.querySelector('#atlas-sg-skill').addEventListener('change', compute);
    overlay.querySelector('#atlas-sg-team-only').addEventListener('change', compute);
    compute();
}

// Sélecteur de ticket pour assigner un membre comme leader (popover)
function _openAssignPicker(anchor, memberName, team) {
    _closePopovers();
    const tickets = (store.get('tickets') || [])
        .filter(t => t.status !== 'done' && (!team || t.team === team))
        .sort((a, b) => (a.leader ? 1 : 0) - (b.leader ? 1 : 0)); // non-assignés d'abord

    const pop = document.createElement('div');
    pop.className = 'atlas-popover atlas-popover--assign';
    pop.innerHTML = `
        <div class="atlas-popover-title">Assigner ${esc(memberName)} à…</div>
        ${tickets.length ? `
        <input class="input input-sm atlas-assign-search" placeholder="Rechercher un ticket…" autocomplete="off">
        <div class="atlas-assign-list">
            ${tickets.slice(0, 50).map(t => `
                <button type="button" class="atlas-assign-item" data-id="${esc(t.id)}" title="${esc(t.title)}">
                    <span class="atlas-assign-item-id">${esc(t.id)}</span>
                    <span class="atlas-assign-item-title">${esc(t.title)}</span>
                    ${t.leader ? `<span class="atlas-assign-item-cur">${esc(t.leader)}</span>` : '<span class="atlas-assign-item-free">libre</span>'}
                </button>`).join('')}
        </div>` : '<div class="atlas-empty-sm">Aucun ticket actif pour cette équipe.</div>'}`;
    _positionPopover(pop, anchor);

    const search = pop.querySelector('.atlas-assign-search');
    search?.focus();
    search?.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        pop.querySelectorAll('.atlas-assign-item').forEach(it => {
            const txt = it.textContent.toLowerCase();
            it.style.display = txt.includes(q) ? '' : 'none';
        });
    });

    pop.querySelectorAll('.atlas-assign-item').forEach(it => {
        it.addEventListener('click', async () => {
            const id = it.dataset.id;
            const { toast } = await import('../utils.js');
            try {
                const updated = await api.updateTicket(id, { leader: memberName });
                store.set('tickets', (store.get('tickets') || []).map(t => t.id === id ? { ...t, leader: memberName } : t));
                toast(`${memberName} assigné à ${id}`, 'success');
                _closePopovers();
            } catch (err) { toast('Erreur assignation', 'error'); }
        });
    });
}
