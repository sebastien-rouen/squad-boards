/**
 * Sidebar navigation + team filter as colored squares.
 */

import { store } from '../state.js';
import { NAV_ITEMS, TEAM_COLORS } from '../config.js';
import { esc } from '../utils.js';
import { redrawAllCharts } from './charts.js';

export function initSidebar() {
    const nav = document.getElementById('sidebar-nav');
    const sidebar = document.getElementById('sidebar');
    const btnMenu = document.getElementById('btn-menu');
    const btnTheme = document.getElementById('btn-theme');

    // ── Nav order persistence (groupe Pilotage uniquement) ─────────────────────
    const _LS_NAV = 'sb-nav-order';
    const _LS_TEAM_COLLAPSED = 'sb-nav-team-collapsed';
    const _MAIN_ITEMS   = NAV_ITEMS.filter(n => n.section === 'main');
    const _TEAM_ITEMS   = NAV_ITEMS.filter(n => n.section === 'team');
    const _FOOTER_ITEMS = NAV_ITEMS.filter(n => n.section === 'footer');

    function _loadOrder() {
        try {
            const saved = JSON.parse(localStorage.getItem(_LS_NAV) || 'null');
            if (!Array.isArray(saved) || !saved.length) return _MAIN_ITEMS;
            const ordered = saved.map(id => _MAIN_ITEMS.find(n => n.id === id)).filter(Boolean);
            const extra   = _MAIN_ITEMS.filter(n => !saved.includes(n.id));
            return [...ordered, ...extra];
        } catch { return _MAIN_ITEMS; }
    }

    function _saveOrder() {
        // Seuls les items du groupe Pilotage (.nav-main) sont réordonnables.
        const ids = [...nav.querySelectorAll('.nav-main .nav-item')].map(el => el.dataset.view);
        localStorage.setItem(_LS_NAV, JSON.stringify(ids));
    }

    // ── Drag state (declared before renderNav to avoid TDZ) ──────────────────
    let _holdTimer  = null;
    let _holdEl     = null;
    let _holdX = 0, _holdY = 0;
    let _dragSource = null;

    // ── Nav items ─────────────────────────────────────────────────────────────
    const NOTIF_VIEWS = new Set(['dashboard', 'sprint', 'kanban']);

    function _navItemHtml(item, newCount, curView) {
        const showBadge = newCount > 0 && NOTIF_VIEWS.has(item.id);
        const reorderable = item.section === 'main';
        const trailing = showBadge
            ? `<span class="nav-badge">${newCount}</span>`
            : (item.shortcut ? `<span class="nav-shortcut">${item.shortcut}</span>` : '');
        // Poignée de réordonnancement (visible au survol) — découvrabilité du glisser-déposer.
        const grip = reorderable
            ? `<span class="nav-grip" aria-hidden="true" title="Maintenir puis glisser pour réordonner">⠿</span>`
            : '';
        const isActive = curView === item.id;
        return `
            <a href="#" class="nav-item${isActive ? ' active' : ''}" data-view="${item.id}"${isActive ? ' aria-current="page"' : ''}>
                <svg class="icon"><use href="#${item.icon}"/></svg>
                <span>${item.label}</span>
                ${grip}${trailing}
            </a>`;
    }

    function renderNav() {
        if (_dragSource) return;
        const newCount = store.get('newCount') || 0;
        const curView  = store.get('view');
        // Le groupe "Équipe & RH" s'auto-déplie si la vue courante en fait partie.
        const curInTeam = _TEAM_ITEMS.some(n => n.id === curView);
        // Replié par défaut (déclutter) ; seul '0' explicite force le déploiement persistant.
        const collapsed = curInTeam ? false : localStorage.getItem(_LS_TEAM_COLLAPSED) !== '0';
        const mainHtml   = _loadOrder().map(i => _navItemHtml(i, newCount, curView)).join('');
        const teamHtml   = _TEAM_ITEMS.map(i => _navItemHtml(i, newCount, curView)).join('');
        const footerHtml = _FOOTER_ITEMS.map(i => _navItemHtml(i, newCount, curView)).join('');
        nav.innerHTML = `
            <div class="nav-main">${mainHtml}</div>
            <button class="nav-group-toggle${collapsed ? '' : ' is-open'}" id="nav-team-toggle"
                    aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="nav-secondary">
                <svg class="icon icon-xs nav-group-chevron"><use href="#i-chevron-right"/></svg>
                <span class="nav-group-label-txt">Équipe &amp; RH</span>
            </button>
            <div class="nav-secondary${collapsed ? ' hidden' : ''}" id="nav-secondary">${teamHtml}</div>
            <div class="nav-footer-group">${footerHtml}</div>`;
    }

    renderNav();

    // ── Drag-and-drop (hold 1s to activate) ──────────────────────────────────

    function _cancelHold() {
        if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
        if (_holdEl) {
            _holdEl.classList.remove('nav-item--holding', 'nav-item--drag-ready');
            if (_holdEl !== _dragSource) _holdEl.removeAttribute('draggable');
            _holdEl = null;
        }
    }

    function _clearDropIndicators() {
        nav.querySelectorAll('.nav-item--drop-before,.nav-item--drop-after').forEach(el => {
            el.classList.remove('nav-item--drop-before', 'nav-item--drop-after');
        });
    }

    nav.addEventListener('pointerdown', e => {
        // Seuls les items du groupe Pilotage sont réordonnables par glisser.
        const item = e.target.closest('.nav-main .nav-item');
        if (!item) return;
        _holdEl = item;
        _holdX  = e.clientX;
        _holdY  = e.clientY;
        item.classList.add('nav-item--holding');
        _holdTimer = setTimeout(() => {
            _holdTimer = null;
            item.setAttribute('draggable', 'true');
            item.classList.remove('nav-item--holding');
            item.classList.add('nav-item--drag-ready');
            navigator.vibrate?.(30);
        }, 1000);
    });

    nav.addEventListener('pointermove', e => {
        if (!_holdTimer) return;
        if (Math.hypot(e.clientX - _holdX, e.clientY - _holdY) > 8) _cancelHold();
    });

    nav.addEventListener('pointerup',     () => { if (!_dragSource) _cancelHold(); });
    nav.addEventListener('pointercancel', () => { if (!_dragSource) _cancelHold(); });

    nav.addEventListener('dragstart', e => {
        const item = e.target.closest('.nav-main .nav-item[draggable]');
        if (!item) { e.preventDefault(); return; }
        _dragSource = item;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.view);
        item.classList.remove('nav-item--drag-ready');
        requestAnimationFrame(() => item.classList.add('nav-item--dragging'));
    });

    nav.addEventListener('dragover', e => {
        if (!_dragSource) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.nav-main .nav-item');
        if (!target || target === _dragSource) return;
        _clearDropIndicators();
        const { top, height } = target.getBoundingClientRect();
        target.classList.add(e.clientY < top + height / 2 ? 'nav-item--drop-before' : 'nav-item--drop-after');
    });

    nav.addEventListener('dragleave', e => {
        if (!e.relatedTarget?.closest('#sidebar-nav')) _clearDropIndicators();
    });

    nav.addEventListener('drop', e => {
        e.preventDefault();
        if (!_dragSource) return;
        const target = e.target.closest('.nav-main .nav-item');
        const mainEl = nav.querySelector('.nav-main');
        if (target && target !== _dragSource && mainEl) {
            const { top, height } = target.getBoundingClientRect();
            if (e.clientY < top + height / 2) {
                mainEl.insertBefore(_dragSource, target);
            } else {
                mainEl.insertBefore(_dragSource, target.nextSibling);
            }
        }
        _clearDropIndicators();
    });

    nav.addEventListener('dragend', () => {
        _clearDropIndicators();
        if (_dragSource) {
            _dragSource.classList.remove('nav-item--dragging');
            _dragSource.removeAttribute('draggable');
            _dragSource = null;
        }
        _cancelHold();
        _saveOrder();
    });

    nav.addEventListener('click', e => {
        // Toggle du groupe repliable "Équipe & RH"
        const toggle = e.target.closest('#nav-team-toggle');
        if (toggle) {
            const collapsed = localStorage.getItem(_LS_TEAM_COLLAPSED) === '1';
            localStorage.setItem(_LS_TEAM_COLLAPSED, collapsed ? '0' : '1');
            renderNav();
            return;
        }
        const item = e.target.closest('.nav-item');
        if (!item) return;
        e.preventDefault();
        // Clear badges when visiting a notified view
        if (NOTIF_VIEWS.has(item.dataset.view)) store.set('newCount', 0);
        store.set('view', item.dataset.view);
        sidebar.classList.remove('open');
    });

    // Re-render complet au changement de vue : gère l'état actif ET l'auto-déploiement
    // du groupe "Équipe & RH" quand on navigue vers une de ses vues (raccourci clavier inclus).
    store.on('view', renderNav);
    store.on('newCount', renderNav);

    // ── Team buttons ──────────────────────────────────────────────────────────
    function renderTeamBtns() {
        const teams = store.get('teams') || [];
        const teamObjects = store.get('teamObjects') || [];
        const groups = store.get('groups') || [];
        const currentTeam = store.get('team');
        const currentGroup = store.get('group');

        const container = document.getElementById('team-btns');
        if (!container) return;

        let html = '';
        const allActive = !currentGroup && (!currentTeam || currentTeam === 'all');
        const hasPicker = groups.length > 0;
        html += `<div class="team-btn-all-wrap${hasPicker ? ' has-picker' : ''}">
            <button class="team-btn team-btn-all${allActive ? ' active' : ''}" data-team="all" title="Toutes les equipes">Tous</button>
            ${hasPicker ? `<div class="team-btn-picker">
                <button class="team-btn-picker-item${allActive ? ' active' : ''}" data-team="all">Toutes les équipes</button>
                ${groups.map(g => {
                    const gActive = currentGroup === g.id;
                    return `<button class="team-btn-picker-item${gActive ? ' active' : ''}" data-group="${esc(g.id)}" style="--pc:${g.color}">
                        <span class="team-btn-picker-dot"></span>${esc(g.name)}
                    </button>`;
                }).join('')}
            </div>` : ''}
        </div>`;

        const activeGroupTeams = currentGroup
            ? (groups.find(g => g.id === currentGroup)?.teams || [])
            : null;

        // Track which teams belong to a group
        const groupedTeams = new Set();

        // Render teams grouped (group-btn supprimé — doublon avec le picker "Tous")
        for (const g of groups) {
            for (const tName of (g.teams || [])) {
                groupedTeams.add(tName);
                const idx = teams.indexOf(tName);
                if (idx < 0) continue;
                const tObj = teamObjects.find(o => o.name === tName);
                const color = tObj?.color || TEAM_COLORS[idx % TEAM_COLORS.length];
                const active = (!currentGroup && currentTeam === tName) || (activeGroupTeams && activeGroupTeams.includes(tName));
                html += `<button class="team-btn${active ? ' active' : ''}" data-team="${esc(tName)}" title="${esc(tName)}" style="background:${color}">${esc(tName.slice(0, 2).toUpperCase())}</button>`;
            }
        }

        // Ungrouped teams
        const ungrouped = teams.filter(t => !groupedTeams.has(t));
        for (let i = 0; i < ungrouped.length; i++) {
            const t = ungrouped[i];
            const tObj = teamObjects.find(o => o.name === t);
            const color = tObj?.color || TEAM_COLORS[teams.indexOf(t) % TEAM_COLORS.length];
            const active = (!currentGroup && currentTeam === t) || (activeGroupTeams && activeGroupTeams.includes(t));
            html += `<button class="team-btn${active ? ' active' : ''}" data-team="${esc(t)}" title="${esc(t)}" style="background:${color}">${esc(t.slice(0, 2).toUpperCase())}</button>`;
        }

        container.innerHTML = html;
    }

    store.on('teams', renderTeamBtns);
    store.on('groups', renderTeamBtns);
    store.on('team', renderTeamBtns);
    store.on('group', renderTeamBtns);
    renderTeamBtns();

    // Click handler for team/group buttons
    document.getElementById('team-btns')?.addEventListener('click', e => {
        // Picker items
        const pickerItem = e.target.closest('.team-btn-picker-item');
        if (pickerItem) {
            if (pickerItem.dataset.group) {
                store.set('group', pickerItem.dataset.group);
                store.set('team', 'all');
            } else {
                store.set('group', null);
                store.set('team', 'all');
            }
            return;
        }
        const btn = e.target.closest('.team-btn');
        if (!btn) return;

        if (btn.dataset.action === 'search') {
            window.__squadBoard?.openTeamSwitcher?.();
            return;
        }
        if (btn.dataset.group) {
            const gid = btn.dataset.group;
            if (store.get('group') === gid) {
                store.set('group', null);
                store.set('team', 'all');
            } else {
                store.set('group', gid);
                store.set('team', 'all');
            }
        } else if (btn.dataset.team) {
            store.set('group', null);
            store.set('team', btn.dataset.team);
        }
    });

    // ── Mobile menu ───────────────────────────────────────────────────────────
    btnMenu?.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
        if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== btnMenu) {
            sidebar.classList.remove('open');
        }
    });

    // ── Theme ─────────────────────────────────────────────────────────────────
    btnTheme.addEventListener('click', () => {
        store.set('theme', store.get('theme') === 'light' ? 'dark' : 'light');
    });
    store.on('theme', theme => {
        document.documentElement.setAttribute('data-theme', theme);
        btnTheme.querySelector('use').setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
        btnTheme.querySelector('span').textContent = theme === 'dark' ? 'Clair' : 'Sombre';
        redrawAllCharts();
    });
    const savedTheme = store.get('theme');
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (savedTheme === 'dark') {
        btnTheme.querySelector('use').setAttribute('href', '#i-sun');
        btnTheme.querySelector('span').textContent = 'Clair';
    }

    // ── Keyboard shortcuts (chiffres 1-8 → vues Pilotage) ──────────────────────
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.target.isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // La vue PI Planning possède ses propres raccourcis 1-9 (onglets) : on lui cède les chiffres.
        if (store.get('view') === 'pi' && /^[0-9]$/.test(e.key)) return;
        const item = NAV_ITEMS.find(n => n.shortcut && n.shortcut === e.key);
        if (item) { e.preventDefault(); store.set('view', item.id); }
    });
}
