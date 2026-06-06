/**
 * Topbar component - search, create, sync.
 * Team/group filter moved to sidebar.
 */

import { store } from '../state.js';
import { NAV_ITEMS } from '../config.js';
import { esc, debounce, getStatusLabel, getCurrentPi } from '../utils.js';
import { toggleFavoritesDropdown } from './favorites.js';

let _topbarInited = false;
export function initTopbar() {
    if (_topbarInited) return;
    _topbarInited = true;
    const viewTitle = document.getElementById('view-title');
    const searchInput = document.getElementById('search-input');
    const searchBox = document.getElementById('search-box');

    // Title → Breadcrumb cliquable : View > Team/Group > Context (sprint name si dispo)
    function updateTitle() {
        const view = store.get('view');
        const item = NAV_ITEMS.find(n => n.id === view);
        const viewLabel = item ? item.label : 'Squad Board';
        const viewIcon = item ? `<svg class="bc-icon"><use href="#${item.icon}"/></svg>` : '';
        const team = store.get('team');
        const groupId = store.get('group');
        const groups = store.get('groups') || [];
        const sprintInfo = store.get('sprintInfo');

        const segments = [];
        // 1. Vue (cliquable → home/dashboard)
        segments.push(`<button class="bc-seg bc-seg--view" data-bc-action="view" title="Vue actuelle">${viewIcon}<span>${esc(viewLabel)}</span></button>`);

        // 2. Groupe ou équipe
        if (groupId) {
            const g = groups.find(x => x.id === groupId);
            if (g) segments.push(`<button class="bc-seg bc-seg--group" data-bc-action="clear-group" title="Cliquer pour retirer le filtre" style="--bc-color:${g.color || 'var(--primary)'}"><span class="bc-dot"></span>${esc(g.name)}</button>`);
        } else if (team && team !== 'all') {
            segments.push(`<button class="bc-seg bc-seg--team" data-bc-action="clear-team" title="Cliquer pour voir toutes les équipes"><span class="bc-dot"></span>${esc(team)}</button>`);
        }

        // 3. Sprint name (uniquement sur Sprint/Kanban/Dashboard avec team spécifique)
        if (sprintInfo?.name && ['sprint', 'dashboard'].includes(view) && team && team !== 'all') {
            segments.push(`<span class="bc-seg bc-seg--ctx" title="Sprint actif">📌 ${esc(sprintInfo.name)}</span>`);
        }

        viewTitle.innerHTML = segments.join('<span class="bc-sep" aria-hidden="true">›</span>');
        viewTitle.classList.add('topbar-breadcrumb');

        // Wire bouton cliquables
        viewTitle.querySelectorAll('[data-bc-action]').forEach(b => {
            b.addEventListener('click', () => {
                const act = b.dataset.bcAction;
                if (act === 'clear-team')  { store.set('team', 'all'); }
                if (act === 'clear-group') { store.set('group', null); store.set('team', 'all'); }
                if (act === 'view')        { window.__squadBoard?.openTeamSwitcher?.(); }
            });
        });
    }
    store.on('view', updateTitle);
    store.on('team', updateTitle);
    store.on('group', updateTitle);
    store.on('sprintInfo', updateTitle);
    updateTitle();

    // ── Toggle Scrum / Kanban — visible uniquement sur la vue Board (sprint) ─────
    const boardModeHost = document.getElementById('board-mode-host');
    function updateBoardModeToggle() {
        if (!boardModeHost) return;
        const view = store.get('view');
        if (view !== 'sprint') { boardModeHost.hidden = true; boardModeHost.innerHTML = ''; return; }
        const mode = store.get('boardMode') || 'scrum';
        boardModeHost.hidden = false;
        boardModeHost.innerHTML = `<div class="board-mode-toggle" role="group" aria-label="Vue Board">
            <button class="board-mode-btn${mode === 'scrum' ? ' is-active' : ''}" data-mode="scrum" title="Vue Scrum — liste par sprint">
                <svg class="icon icon-sm"><use href="#i-zap"/></svg> Scrum
            </button>
            <button class="board-mode-btn${mode === 'kanban' ? ' is-active' : ''}" data-mode="kanban" title="Vue Kanban — colonnes par statut">
                <svg class="icon icon-sm"><use href="#i-columns"/></svg> Kanban
            </button>
        </div>`;
        boardModeHost.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => store.set('boardMode', btn.dataset.mode));
        });
    }
    store.on('view',      updateBoardModeToggle);
    store.on('boardMode', updateBoardModeToggle);
    updateBoardModeToggle();

    // ── Sélecteur PI dans le topbar (PI-2..PI+2) — visible uniquement sur pi/roadmap/…
    const PI_VIEWS = new Set(['pi', 'roadmap', 'settings', 'support', 'dashboard']);
    const piHost = document.getElementById('pi-selector-host');
    function updatePiSelector() {
        if (!piHost) return;
        const view = store.get('view');
        // PI courant = source unique getCurrentPi (sprint actif > piInfo.number)
        const basePi = getCurrentPi();
        const visible = PI_VIEWS.has(view) && basePi;
        piHost.hidden = !visible;
        if (!visible) { piHost.innerHTML = ''; return; }
        const offset = store.get('piOffset') || 0;
        // 5 offsets : -2, -1, 0 (courant), +1, +2 — désactivés si PI <= 0
        const offsets = [-2, -1, 0, 1, 2].filter(o => (basePi + o) >= 1);
        piHost.innerHTML = `<div class="pi-selector" role="tablist" aria-label="Choix du PI">
            ${offsets.map(o => {
                const piN = basePi + o;
                const isActive = o === offset;
                const label = o === 0 ? `PI${piN} <small>courant</small>` : `PI${piN}`;
                const cls = `pi-selector-btn${isActive ? ' active' : ''}${o === 0 ? ' pi-selector-btn--current' : ''}`;
                return `<button class="${cls}" role="tab" aria-selected="${isActive}" data-offset="${o}" title="${o === 0 ? 'PI courant' : (o > 0 ? `PI+${o}` : `PI${o}`)}">${label}</button>`;
            }).join('')}
        </div>`;
        piHost.querySelectorAll('[data-offset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const o = parseInt(btn.dataset.offset, 10);
                if (!Number.isNaN(o)) store.set('piOffset', o);
            });
        });
    }
    store.on('view',       updatePiSelector);
    store.on('piInfo',     updatePiSelector);
    store.on('piOffset',   updatePiSelector);
    store.on('sprintInfo', updatePiSelector);
    updatePiSelector();

    // Search
    const doSearch = debounce(query => {
        store.set('searchQuery', query);
        renderSearchResults(query);
    }, 200);

    searchInput.addEventListener('input', () => doSearch(searchInput.value.trim()));
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) renderSearchResults(searchInput.value.trim());
    });

    document.addEventListener('click', e => {
        if (!searchBox.contains(e.target)) {
            searchBox.querySelector('.search-results')?.remove();
        }
    });

    // Create button
    document.getElementById('btn-create')?.addEventListener('click', () => {
        const { openCreateModal } = window.__squadBoard || {};
        if (openCreateModal) openCreateModal({ team: store.get('team') !== 'all' ? store.get('team') : '' });
    });

    // Favorites button
    const btnFav = document.getElementById('btn-favorites');
    btnFav?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavoritesDropdown(btnFav);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const { openCreateModal } = window.__squadBoard || {};
            if (openCreateModal) openCreateModal({ team: store.get('team') !== 'all' ? store.get('team') : '' });
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.blur();
            searchInput.value = '';
            store.set('searchQuery', '');
            searchBox.querySelector('.search-results')?.remove();
        }
    });
}

function renderSearchResults(query) {
    const searchBox = document.getElementById('search-box');
    let panel = searchBox.querySelector('.search-results');
    if (!query) { panel?.remove(); return; }

    const tickets = store.get('tickets') || [];
    const q = query.toLowerCase();
    const matches = tickets.filter(t =>
        t.id?.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        (t.leader || t.assignee || '').toLowerCase().includes(q)
    ).slice(0, 10);

    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'search-results';
        searchBox.style.position = 'relative';
        searchBox.appendChild(panel);
    }

    if (!matches.length) {
        panel.innerHTML = '<div class="search-result-item text-muted">Aucun resultat</div>';
        return;
    }

    panel.innerHTML = matches.map(t => `
        <div class="search-result-item" data-id="${esc(t.id)}">
            <span class="ticket-id">${esc(t.id)}</span>
            <span class="truncate">${esc(t.title)}</span>
            <span class="badge badge-${t.status} badge-status">${esc(getStatusLabel(t))}</span>
        </div>
    `).join('');

    panel.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
            window.__squadBoard?.openTicketModal?.(el.dataset.id);
            panel.remove();
            searchInput.value = '';
        });
    });
}
