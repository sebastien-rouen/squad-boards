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

// ── Helpers données ────────────────────────────────────────────────────────────
function _allMembers() {
    return deriveMembersFromAbsences(store.get('absences') || [], store.get('members') || []);
}

/** Construit la hiérarchie Programme → Groupes → Équipes → Membres filtrée par topbar. */
function _buildHierarchy() {
    const groups      = store.get('groups') || [];
    const teamObjects = store.get('teamObjects') || [];
    const allMembers  = _allMembers();
    const selTeam     = store.get('team');
    const selGroup    = store.get('group');

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

function _renderMap(el) {
    const nodes = _buildHierarchy();
    if (!nodes.length) {
        el.innerHTML = `<div class="atlas-empty">Aucune équipe à afficher. Configurez des équipes et importez les absences (CSV RH).</div>`;
        return;
    }

    // Réinitialise le zoom si le contexte n'existe plus
    if (_zoom.level >= 1 && !nodes.find(g => g.id === _zoom.groupId)) _zoom = { level: 0, groupId: null, team: null };

    el.innerHTML = `
        <div class="atlas-map">
            <div class="atlas-map-bar">
                ${_breadcrumbHtml(nodes)}
                <div class="atlas-map-zoom">
                    <button class="btn-icon" id="atlas-zoom-out" title="Dézoomer"><svg class="icon icon-sm"><use href="#i-minus"/></svg></button>
                    <button class="btn-icon" id="atlas-zoom-reset" title="Vue programme"><svg class="icon icon-sm"><use href="#i-grid"/></svg></button>
                    <button class="btn-icon" id="atlas-tour" title="Visite guidée automatique (onboarding)"><svg class="icon icon-sm"><use href="#i-play"/></svg></button>
                    <button class="btn-icon" id="atlas-export-png" title="Exporter la carte en image (PNG)"><svg class="icon icon-sm"><use href="#i-download"/></svg></button>
                    <button class="btn-icon" id="atlas-present" title="Mode présentation / onboarding (plein écran)"><svg class="icon icon-sm"><use href="#i-maximize"/></svg></button>
                </div>
            </div>
            <div class="atlas-map-stage" id="atlas-stage">
                ${_mapStageHtml(nodes)}
            </div>
            <div class="atlas-map-legend">${_mapLegendHtml()}</div>
        </div>`;

    _wireMap(el, nodes);
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
    return `<button class="atlas-chip" data-member="${esc(m.name)}" title="${esc(tip)}" style="--chip:${hashColor(m.name)}; --app:${appColor}">
        <span class="atlas-chip-ini">${esc(initials(m.name))}</span>
        ${app ? `<span class="atlas-chip-app" title="Appétence ${app}"></span>` : ''}
    </button>`;
}

function _mapStageHtml(nodes) {
    // Niveau 2 : membres d'une équipe (carte détaillée)
    if (_zoom.level === 2 && _zoom.team) {
        const g = nodes.find(n => n.id === _zoom.groupId);
        const t = g?.teams.find(x => x.name === _zoom.team);
        if (!t) { _zoom = { level: 0, groupId: null, team: null }; return _mapStageHtml(nodes); }
        return `<div class="atlas-crew atlas-crew--detail" style="--crew:${t.color}">
            <div class="atlas-crew-hdr">
                <span class="atlas-crew-dot" style="background:${t.color}"></span>
                <span class="atlas-crew-name">${esc(t.name)}</span>
                <span class="atlas-crew-count">${t.members.length} membre${t.members.length > 1 ? 's' : ''}</span>
            </div>
            <div class="atlas-crew-grid atlas-crew-grid--lg">
                ${t.members.length ? t.members.map(m => `
                    <div class="atlas-member-card" data-member="${esc(m.name)}">
                        ${_memberChipHtml(m)}
                        <div class="atlas-member-info">
                            <span class="atlas-member-name">${esc(m.name)}</span>
                            <span class="atlas-member-role">${esc(m.role || '—')}</span>
                        </div>
                        ${_memberSkillBadgesHtml(m.name)}
                    </div>`).join('') : '<div class="atlas-empty-sm">Aucun membre (absences non importées ?)</div>'}
            </div>
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

/** Bloc "crew" (équipe) : pastilles membres en grille. compact=true pour la vue programme. */
function _crewBlockHtml(g, t, compact = false) {
    return `<div class="atlas-crew${compact ? ' atlas-crew--compact' : ''}" data-group="${esc(g.id)}" data-team="${esc(t.name)}" style="--crew:${t.color}">
        <div class="atlas-crew-hdr">
            <span class="atlas-crew-dot" style="background:${t.color}"></span>
            <span class="atlas-crew-name">${esc(t.name)}</span>
            <span class="atlas-crew-count">${t.members.length}</span>
        </div>
        ${!compact ? _teamAppetenceTagsHtml(t.name) : ''}
        <div class="atlas-crew-grid">
            ${t.members.slice(0, compact ? 12 : 99).map(m => _memberChipHtml(m)).join('')}
            ${compact && t.members.length > 12 ? `<span class="atlas-chip-more">+${t.members.length - 12}</span>` : ''}
        </div>
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
            _zoom = { level: 2, groupId: crew.dataset.group, team: crew.dataset.team };
            _renderMap(el);
        });
    });

    // Clic membre → ouvre la fiche membre
    el.querySelectorAll('[data-member]').forEach(node => {
        node.addEventListener('click', e => {
            const name = node.dataset.member || node.closest('[data-member]')?.dataset.member;
            if (!name) return;
            e.stopPropagation();
            _openMemberFocus(name);
        });
    });
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

function _renderMatrix(el) {
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

    // ── Filtres : recherche par nom + masquer les non-évalués ──────────────────
    const q = _matrixQuery.trim().toLowerCase();
    let fEntities = entities;
    if (q) fEntities = entities.filter(e => e.label.toLowerCase().includes(q) || (e.team || '').toLowerCase().includes(q));
    let fSkills = skills;
    if (_matrixHideEmpty) {
        // Lignes : au moins une compétence évaluée
        fEntities = fEntities.filter(e => skills.some(s => _skillLevel(scope, e.key, s.id) > 0)
            || appetences.some(a => _appValue(scope, e.key, a.id) !== 'neutre'));
        // Colonnes : au moins une entité (parmi les visibles) l'a évaluée
        fSkills = skills.filter(s => fEntities.some(e => _skillLevel(scope, e.key, s.id) > 0));
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
                    <button class="btn btn-secondary btn-sm" id="atlas-catalog-btn" title="Ajouter / modifier les compétences et appétences">⚙️ Catalogue</button>
                    <button class="btn btn-secondary btn-sm" id="atlas-mobility-btn" title="Tableau de suivi de mobilité">📋 Suivi mobilité</button>
                </div>
            </div>

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
                            ${cats.flatMap(c => fSkills.filter(s => (s.category || 'Autres') === c)).map(s =>
                                `<th class="atlas-grid-skill atlas-grid-skill--edit" style="--sc:${s.color}" data-skill-hdr="${esc(s.id)}" title="${esc(s.name)} · clic = modifier"><span>${esc(s.name)}</span></th>`).join('')}
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

    // Bouton ＋ dans le coin : ajout rapide d'une compétence (popover inline)
    el.querySelector('#atlas-add-skill')?.addEventListener('click', e => {
        e.stopPropagation();
        _openQuickAddSkill(e.currentTarget, el);
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
        // double-clic sur une cellule faible (niveau 0-1) → propose ticket skill-up
        cell.addEventListener('dblclick', e => {
            e.preventDefault();
            const row = cell.closest('tr');
            const key = row.dataset.ent;
            const skillId = cell.dataset.skill;
            const lvl = _skillLevel(_matrixScope, key, skillId);
            if (lvl <= 2) _openSkillUpModal(key, cell.dataset.team, skillId);
        });
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
}

function _renderCatalogList(overlay, kind) {
    const isSkill = kind === 'skill';
    const items = (store.get(isSkill ? 'skills' : 'appetences') || []);
    const col = overlay.querySelector(isSkill ? '#atlas-cat-skills' : '#atlas-cat-apps');
    const cats = [...new Set(items.map(i => i.category || 'Autres'))];
    const title = isSkill ? '🎯 Compétences' : '🔥 Appétences';

    col.innerHTML = `
        <div class="atlas-cat-hdr">${title} <span class="atlas-cat-n">${items.length}</span></div>
        <div class="atlas-cat-list">
            ${cats.map(c => `
                <div class="atlas-cat-group">
                    <div class="atlas-cat-group-name">${esc(c)}</div>
                    ${items.filter(i => (i.category || 'Autres') === c).map(i => `
                        <div class="atlas-cat-item" data-id="${esc(i.id)}">
                            <span class="atlas-cat-dot" style="background:${i.color}"></span>
                            <span class="atlas-cat-item-name">${esc(i.name)}</span>
                            <button class="atlas-cat-del btn-icon btn-icon-sm" data-id="${esc(i.id)}" title="Supprimer"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>
                        </div>`).join('')}
                </div>`).join('')}
        </div>
        <form class="atlas-cat-add" data-kind="${kind}">
            <input class="input input-sm" name="name" placeholder="Nouvelle ${isSkill ? 'compétence' : 'appétence'}…" required>
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
                        ${skills.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
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
