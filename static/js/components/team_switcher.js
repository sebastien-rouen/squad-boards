/**
 * Team Switcher — palette légère pour changer rapidement d'équipe.
 *
 * Ouvert via :
 * - Ctrl/Cmd + E (raccourci global)
 * - Click sur le bouton 🔍 dans la sidebar
 *
 * Fuzzy search + section Récents (localStorage) + tri alphabétique.
 * Adapté aux setups avec beaucoup d'équipes (10+) où le panneau de pastilles
 * compactes devient peu lisible.
 */

import { store } from '../state.js';
import { esc } from '../utils.js';
import { TEAM_COLORS } from '../config.js';

const RECENT_KEY = 'sb-recent-teams';
const RECENT_MAX = 6;

let _ovEl = null;
let _docKeyHandler = null;

function _recents() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
}
function _pushRecent(name) {
    if (!name || name === 'all') return;
    const cur = _recents().filter(x => x !== name);
    cur.unshift(name);
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
}

function _color(name) {
    const teams = store.get('teams') || [];
    const objs  = store.get('teamObjects') || [];
    const obj = objs.find(o => o.name === name);
    if (obj?.color) return obj.color;
    const idx = teams.indexOf(name);
    return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0];
}

function _renderList(teams, query, recents, currentTeam, currentGroup) {
    const groups = store.get('groups') || [];
    const q = (query || '').toLowerCase().trim();
    const _match = (s) => !q || (s || '').toLowerCase().includes(q);

    // Construit les sections : Toutes / Récents / Groupes / Toutes les équipes (A-Z)
    const allItem = `
        <div class="ts-opt${(!currentGroup && (!currentTeam || currentTeam === 'all')) ? ' is-current' : ''}"
             data-action="all" tabindex="-1">
            <span class="ts-opt-swatch ts-opt-swatch--all">⋯</span>
            <span class="ts-opt-name">Toutes les équipes</span>
            <span class="ts-opt-hint">Aucun filtre</span>
        </div>`;

    const groupItems = groups
        .filter(g => _match(g.name) || (g.teams || []).some(t => _match(t)))
        .map(g => `
            <div class="ts-opt ts-opt--group${currentGroup === g.id ? ' is-current' : ''}"
                 data-action="group" data-id="${esc(g.id)}" tabindex="-1">
                <span class="ts-opt-swatch" style="background:${g.color || '#64748b'}">${esc(g.name.slice(0, 2).toUpperCase())}</span>
                <span class="ts-opt-name">${esc(g.name)}</span>
                <span class="ts-opt-hint">${(g.teams || []).length} équipes</span>
            </div>`).join('');

    const recentList = recents
        .filter(t => teams.includes(t) && _match(t))
        .map(t => `
            <div class="ts-opt${(!currentGroup && currentTeam === t) ? ' is-current' : ''}"
                 data-action="team" data-name="${esc(t)}" tabindex="-1">
                <span class="ts-opt-swatch" style="background:${_color(t)}">${esc(t.slice(0, 2).toUpperCase())}</span>
                <span class="ts-opt-name">${esc(t)}</span>
            </div>`).join('');

    const recentSet = new Set(recents);
    const otherTeams = teams.filter(t => !recentSet.has(t) && _match(t))
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const otherList = otherTeams.map(t => `
        <div class="ts-opt${(!currentGroup && currentTeam === t) ? ' is-current' : ''}"
             data-action="team" data-name="${esc(t)}" tabindex="-1">
            <span class="ts-opt-swatch" style="background:${_color(t)}">${esc(t.slice(0, 2).toUpperCase())}</span>
            <span class="ts-opt-name">${esc(t)}</span>
        </div>`).join('');

    let html = '';
    if (!q) html += allItem;
    if (recentList) html += `<div class="ts-sec">⏱ Récents</div>${recentList}`;
    if (groupItems) html += `<div class="ts-sec">📦 Groupes</div>${groupItems}`;
    if (otherList) html += `<div class="ts-sec">Équipes (A → Z)</div>${otherList}`;
    if (q && !recentList && !groupItems && !otherList && !html.includes('ts-opt'))
        html += '<div class="ts-empty">Aucune équipe correspondante</div>';
    return html;
}

export function openTeamSwitcher() {
    if (_ovEl) { _close(); return; }
    const teams = (store.get('teams') || []).slice().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    if (!teams.length) return;
    const currentTeam = store.get('team');
    const currentGroup = store.get('group');
    const recents = _recents().filter(t => teams.includes(t));

    _ovEl = document.createElement('div');
    _ovEl.className = 'ts-overlay';
    _ovEl.innerHTML = `
        <div class="ts-panel" role="dialog" aria-label="Changer d'équipe">
            <div class="ts-hdr">
                <span class="ts-hdr-icon">🔍</span>
                <input class="ts-input" id="ts-input" placeholder="Filtrer une équipe ou un groupe…" autocomplete="off" />
                <kbd class="ts-kbd">Esc</kbd>
            </div>
            <div class="ts-list" id="ts-list" role="listbox">${_renderList(teams, '', recents, currentTeam, currentGroup)}</div>
            <div class="ts-foot">
                <span><kbd>↑↓</kbd> naviguer · <kbd>Enter</kbd> valider · <kbd>Esc</kbd> fermer</span>
                <span>${teams.length} équipe${teams.length > 1 ? 's' : ''}</span>
            </div>
        </div>`;
    document.body.appendChild(_ovEl);
    requestAnimationFrame(() => _ovEl.classList.add('visible'));

    const input = _ovEl.querySelector('#ts-input');
    const list  = _ovEl.querySelector('#ts-list');
    input.focus();

    // Sélectionne la première option par défaut
    const _setHover = (el) => {
        list.querySelectorAll('.ts-opt.is-hover').forEach(o => o.classList.remove('is-hover'));
        if (el) { el.classList.add('is-hover'); el.scrollIntoView({ block: 'nearest' }); }
    };
    _setHover(list.querySelector('.ts-opt'));

    input.addEventListener('input', () => {
        list.innerHTML = _renderList(teams, input.value, recents, currentTeam, currentGroup);
        _setHover(list.querySelector('.ts-opt'));
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); _close(); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            const target = list.querySelector('.ts-opt.is-hover') || list.querySelector('.ts-opt');
            if (target) _select(target);
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const opts = [...list.querySelectorAll('.ts-opt')];
            if (!opts.length) return;
            let idx = opts.indexOf(list.querySelector('.ts-opt.is-hover'));
            idx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
            _setHover(opts[idx]);
        }
    });

    list.addEventListener('mouseover', (e) => {
        const opt = e.target.closest('.ts-opt'); if (opt) _setHover(opt);
    });
    list.addEventListener('click', (e) => {
        const opt = e.target.closest('.ts-opt'); if (opt) _select(opt);
    });

    _ovEl.addEventListener('click', (e) => { if (e.target === _ovEl) _close(); });
}

function _select(opt) {
    const action = opt.dataset.action;
    if (action === 'all') {
        store.set('group', null);
        store.set('team', 'all');
    } else if (action === 'group') {
        store.set('group', opt.dataset.id);
        store.set('team', 'all');
    } else if (action === 'team') {
        const name = opt.dataset.name;
        store.set('group', null);
        store.set('team', name);
        _pushRecent(name);
    }
    _close();
}

function _close() {
    if (!_ovEl) return;
    _ovEl.classList.remove('visible');
    const el = _ovEl;
    _ovEl = null;
    el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// ── Init (raccourcis globaux) ────────────────────────────────────────────────
export function initTeamSwitcher() {
    document.addEventListener('keydown', (e) => {
        // Ignore si on tape dans un champ
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            openTeamSwitcher();
        }
    });
}
