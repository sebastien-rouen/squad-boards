/**
 * Squad Board - Application bootstrap.
 * Self-contained board - JIRA is an optional import plugin.
 */

import { store } from './state.js';
import * as api from './api.js';
import { toast } from './utils.js';
import { seedDemoData } from './demo.js';
import { importFromJira } from './sync.js';

// ── Notification helpers ──────────────────────────────────────────────────────
const LAST_VISIT_KEY = 'squad-board-lastVisit';

function _computeNewCount(tickets) {
    const prev = localStorage.getItem(LAST_VISIT_KEY);
    if (!prev) return 0;
    return tickets.filter(t => t.updatedAt && t.updatedAt > prev).length;
}
import { initSidebar } from './components/sidebar.js';
import { initTopbar } from './components/topbar.js';
import { initModal } from './components/modal.js';
import { initCmdPalette } from './components/cmdpalette.js';
import { initTeamSwitcher, openTeamSwitcher } from './components/team_switcher.js';
import { openCurrentSprintReview, openCurrentSprintDemo } from './components/sprint_tickets_modal.js';
import { destroyAllCharts } from './components/charts.js';
import { updateInfoPanel } from './components/infopanel.js';

import { renderDashboard } from './views/dashboard.js';
import { renderSprint } from './views/sprint.js';
import { renderKanban } from './views/kanban.js';
import { renderPI } from './views/pi.js';
import { renderRoadmap } from './views/roadmap.js';
import { renderRetro } from './views/retro.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { renderSupport } from './views/support.js';
import { renderRoam } from './views/roam.js';
import { renderPICalendar } from './views/picalendar.js';
import { renderAgenda } from './views/agenda.js';
import { renderHealth } from './views/health.js';

const VIEW_RENDERERS = {
    dashboard: renderDashboard,
    sprint: renderSprint,
    kanban: renderKanban,
    pi: renderPI,
    picalendar: renderPICalendar,
    roadmap: renderRoadmap,
    health: renderHealth,
    retro: renderRetro,
    support: renderSupport,
    roam: renderRoam,
    agenda: renderAgenda,
    reports: renderReports,
    settings: renderSettings,
};

const content = document.getElementById('content');

// ── Hash navigation ───────────────────────────────────────────────────────────
// Format : #vue[/group:GID | équipe][/tab]
// Exemples : #sprint/Alpha  #kanban/group:prod  #pi/Gabbiano/mood  #dashboard

let _applyingHash = false;

function pushHash() {
    if (_applyingHash) return;
    const view  = store.get('view') || 'dashboard';
    const team  = store.get('team');
    const group = store.get('group');
    const teamPart = group
        ? 'group:' + encodeURIComponent(group)
        : encodeURIComponent(team || 'all');

    let hash = view;
    if (view === 'pi') {
        // PI : pi/équipe/tab[/piOffset] — piOffset omis si 0
        const tab      = store.get('piTab') || 'objectives';
        const piOffset = store.get('piOffset') || 0;
        hash = `pi/${teamPart}/${tab}${piOffset !== 0 ? '/' + piOffset : ''}`;
    } else if (view === 'roadmap') {
        // Format : roadmap/<team|all|group:X>/<tab>  — tab toujours présent pour éviter ambiguïté
        const tab = store.get('roadmapTab') || 'current';
        hash = `roadmap/${teamPart}/${tab}`;
    } else if (view === 'settings') {
        // Settings : pas de team, mais on inclut le slug de la tab active si défini
        const sec = store.get('settingsSection');
        if (sec) hash = `settings/${sec}`;
    } else if (view === 'sprint') {
        // Sprint : team/sprintPick (le sprint sélectionné si différent du sprint actif)
        if (group || (team && team !== 'all')) hash += '/' + teamPart;
        const pick = store.get('sprintPick');
        if (pick) {
            // Si pas de team préfixé, on met 'all' pour préserver la position du sprint
            if (!group && (!team || team === 'all')) hash += '/all';
            hash += '/' + encodeURIComponent(pick);
        }
    } else {
        if (group) hash += '/' + teamPart;
        else if (team && team !== 'all') hash += '/' + teamPart;
    }
    const newHash = '#' + hash;
    if (location.hash !== newHash) history.pushState(null, '', newHash);
}

function applyHash() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return;

    // Extract optional alert fragment: #view[/team[/tab]]/alert/<actionable>
    const am = raw.match(/^(.*?)\/alert\/([^/]+)$/);
    const alertId = am ? decodeURIComponent(am[2]) : null;
    let rest = am ? am[1] : raw;

    // Extract optional ticket fragment: #view[/team[/tab]]/ticket/ID
    const tm = rest.match(/^(.*?)\/ticket\/([^/]+)$/);
    const ticketId = tm ? decodeURIComponent(tm[2]) : null;
    const h = tm ? tm[1] : rest;

    if (h) {
        const parts = h.split('/');
        const view = parts[0];
        if (view && VIEW_RENDERERS[view]) {
            _applyingHash = true;
            store.set('view', view);
            if (view === 'settings') {
                // Settings n'a pas de team — parts[1] = section à ouvrir (#settings/rotation)
                const alreadyOnSettings = store.get('view') === 'settings';
                if (parts[1]) store.set('settingsSection', decodeURIComponent(parts[1]));
                // Si on est DÉJÀ sur settings, le set('view','settings') ne notifie pas (Store dédup)
                // → on force un re-render pour appliquer l'auto-ouverture de la section ciblée.
                if (alreadyOnSettings && parts[1]) {
                    queueMicrotask(() => window.__squadBoard?.rerenderView?.());
                }
            } else {
                const ctx = parts[1] || '';
                if (ctx.startsWith('group:')) {
                    store.set('group', decodeURIComponent(ctx.slice(6)));
                    store.set('team', 'all');
                } else if (ctx && ctx !== 'all') {
                    store.set('group', null);
                    store.set('team', decodeURIComponent(ctx));
                } else {
                    store.set('group', null);
                    store.set('team', 'all');
                }
                if (parts[2]) {
                    if (view === 'pi') {
                        store.set('piTab', decodeURIComponent(parts[2]));
                        // parts[3] = piOffset si présent
                        const off = parts[3] !== undefined ? parseInt(parts[3], 10) : 0;
                        store.set('piOffset', isNaN(off) ? 0 : off);
                    } else if (view === 'roadmap') store.set('roadmapTab', decodeURIComponent(parts[2]));
                    else if (view === 'sprint') store.set('sprintPick', decodeURIComponent(parts[2]));
                }
                // Si pas de parts[2] sur sprint → reset le sprint pick (au cas où on était sur un autre sprint)
                if (view === 'sprint' && !parts[2]) store.set('sprintPick', null);
            }
            _applyingHash = false;
        }
    }

    if (ticketId) {
        requestAnimationFrame(() => window.__squadBoard?.openTicketModal?.(ticketId));
    } else {
        // Back navigation removed ticket from hash — close modal if open
        const mo = document.getElementById('modal-overlay');
        if (mo && !mo.classList.contains('hidden')) mo.classList.add('hidden');
    }

    // Alert modal — ouvert si fragment présent, fermé sinon
    if (alertId) {
        requestAnimationFrame(() => {
            import('./components/alert_modal.js').then(m => m.openAlertModal(alertId, { updateHash: false }));
        });
    } else {
        // Back navigation removed alert from hash — close alert modal if open
        const ao = document.getElementById('alert-modal-overlay');
        if (ao) ao.remove();
    }
}

// ── Render active view ────────────────────────────────────────────────────────
function renderView() {
    const view = store.get('view');
    destroyAllCharts();
    const renderer = VIEW_RENDERERS[view];
    if (renderer) {
        renderer(content);
    } else {
        content.innerHTML = `<div class="empty-state"><h3>Vue inconnue</h3></div>`;
    }
    updateInfoPanel();
    checkSyncStale();
}

function checkSyncStale() {
    const lastSync = store.get('lastSync');
    const topbar = document.querySelector('.topbar');
    let banner = document.getElementById('stale-banner');
    if (!lastSync || !topbar) { banner?.remove(); return; }

    const age = Date.now() - new Date(lastSync).getTime();
    const hours = Math.floor(age / 3600000);
    if (hours >= 2) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'stale-banner';
            banner.className = 'stale-banner';
            topbar.insertAdjacentElement('afterend', banner);
        }
        banner.innerHTML = `<span>Derniere synchro il y a ${hours}h - les donnees peuvent etre obsoletes</span>
            <div class="stale-banner-actions"><button class="btn btn-secondary btn-sm" onclick="document.getElementById('btn-sync')?.click()">Synchroniser</button><button class="btn-icon" onclick="this.closest('.stale-banner').remove()"><svg class="icon icon-sm"><use href="#i-x"/></svg></button></div>`;
    } else {
        banner?.remove();
    }
}

// Expose for modal/utils to trigger re-render and access store
window.__squadBoard = window.__squadBoard || {};
window.__squadBoard.rerenderView = renderView;
window.__squadBoard.store = store;
window.__squadBoard.pushHash = pushHash;
window.__squadBoard.openCurrentSprintReview = openCurrentSprintReview;
window.__squadBoard.openCurrentSprintDemo   = openCurrentSprintDemo;

// ── Load all data from backend ────────────────────────────────────────────────
async function loadAllData() {
    const [tickets, features, epics, members, teams, groups, absences, support, events, retroItems, sprint, pi, risks, moodVotes, fistVotes, calendars, calendarEvents] = await Promise.all([
        api.getTickets(),
        api.getFeatures(),
        api.getEpics(),
        api.getMembers(),
        api.getTeams(),
        api.getGroups(),
        api.getAbsences(),
        api.getSupport(),
        api.getEvents(),
        api.getRetro(),
        api.getSprint().catch(() => null),
        api.getPI().catch(() => null),
        api.getRisks().catch(() => []),
        api.getMood({ type: 'mood' }).catch(() => []),
        api.getMood({ type: 'fist' }).catch(() => []),
        api.getCalendars().catch(() => []),
        api.getCalendarEvents().catch(() => []),
    ]);
    store.set('tickets', tickets);
    store.set('features', features);
    store.set('epics', epics);
    store.set('members', members);
    store.set('teams', teams.map(t => typeof t === 'string' ? t : t.name));
    store.set('teamObjects', teams);
    store.set('groups', groups);
    store.set('absences', absences);
    store.set('support', support);
    store.set('events', events);
    store.set('retroItems', retroItems);
    store.set('sprintInfo', sprint);
    store.set('piInfo', pi);
    store.set('risks', risks);
    store.set('moodVotes', moodVotes);
    store.set('fistVotes', fistVotes);
    store.set('calendars', calendars);
    store.set('calendarEvents', calendarEvents);
    // Board column labels (persisted from last sync)
    try {
        const saved = localStorage.getItem('sb-boardColumns');
        if (saved) store.set('boardColumns', JSON.parse(saved));
    } catch { /* ignore */ }
    // Notifications: count tickets modified since last visit
    store.set('newCount', _computeNewCount(tickets));
}

// ── JIRA Import handler ───────────────────────────────────────────────────────
// mode = 'full' (replace, lent mais propre) | nombre de jours (sync rapide en merge)
async function handleJiraImport(mode = 14) {
    if (store.get('syncing')) return;
    if (!store.get('jiraConfigured')) {
        toast('JIRA non configure - editez .env et redemarrez', 'warning');
        return;
    }
    const isFull = mode === 'full';
    if (isFull) {
        const { confirmDanger } = await import('./utils.js');
        const ok = await confirmDanger(
            'Sync JIRA complète ?',
            'Tous les tickets/features/epics locaux seront supprimés puis ré-importés. Cette opération peut prendre plusieurs minutes sur de gros JIRA.\n\nPour un refresh léger des changements récents, préférez la "Sync rapide".',
            { confirmLabel: 'Sync complète', danger: true }
        );
        if (!ok) return;
    }

    store.set('syncing', true);
    const btn = document.getElementById('btn-sync');
    btn?.classList.add('syncing');

    // Skeleton sur la vue courante pendant la sync (feedback immédiat)
    _showSyncSkeleton(isFull);

    try {
        const result = await importFromJira(isFull ? {} : { sinceDays: mode });
        if (result.boardColumns && Object.keys(result.boardColumns).length) {
            localStorage.setItem('sb-boardColumns', JSON.stringify(result.boardColumns));
            store.set('boardColumns', result.boardColumns);
        }
        await loadAllData();
        const label = isFull ? 'Sync complète' : `Sync rapide ${mode}j`;
        toast(`${label} terminée — ${result.ticketCount} tickets, ${result.featureCount} features`, 'success');
        renderView();
    } catch (e) {
        console.error('JIRA import error:', e);
        toast(`Erreur import JIRA: ${e.message}`, 'error', 5000);
    } finally {
        store.set('syncing', false);
        btn?.classList.remove('syncing');
    }
}

/** Affiche un skeleton sur la vue courante pendant la sync JIRA — feedback immédiat
 *  pour éviter "écran figé". Remplacé automatiquement par le re-render au succès. */
function _showSyncSkeleton(isFull) {
    if (!content) return;
    const blocks = isFull ? 8 : 4;
    const label = isFull ? 'Synchronisation complète en cours…' : 'Synchronisation rapide en cours…';
    content.innerHTML = `
        <div class="sync-skeleton" role="status" aria-live="polite">
            <div class="sync-skeleton-hdr">
                <div class="sync-skeleton-spinner"></div>
                <div>
                    <div class="sync-skeleton-title">${label}</div>
                    <div class="sync-skeleton-sub">Le contenu se rafraîchira automatiquement à la fin.</div>
                </div>
            </div>
            <div class="sync-skeleton-grid">
                ${Array.from({ length: blocks }, () => `
                    <div class="sync-skeleton-card">
                        <div class="skel skel-line skel-w-30"></div>
                        <div class="skel skel-line skel-w-80"></div>
                        <div class="skel skel-line skel-w-60"></div>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    initSidebar();
    initTopbar();
    initModal();
    initCmdPalette();
    initTeamSwitcher();
    window.__squadBoard = window.__squadBoard || {};
    window.__squadBoard.openTeamSwitcher = openTeamSwitcher;

    // Theme listener (indépendant des données)
    store.on('theme', () => setTimeout(renderView, 50));

    // Helper : durée de sync rapide configurée dans Paramètres (default 14)
    const _getQuickDays = () => {
        const raw = (localStorage.getItem('sb-sync-quickDays') || '').trim();
        const n = parseInt(raw, 10);
        return (!isNaN(n) && n >= 1 && n <= 365) ? n : 14;
    };
    // Met à jour le label du bouton JIRA topbar + l'item "current" du menu
    const refreshSyncButtonLabel = () => {
        const days = _getQuickDays();
        const lbl = document.querySelector('#btn-sync .btn-label');
        if (lbl) lbl.innerHTML = `JIRA <small>${days}j</small>`;
        const btn = document.getElementById('btn-sync');
        if (btn) btn.title = `Sync rapide depuis JIRA (derniers ${days} jours, merge)`;
        // Highlight l'item courant si présent dans le menu, sinon marque le 14 par défaut
        document.querySelectorAll('#sync-menu .sync-menu-item').forEach(i => {
            i.classList.toggle('sync-menu-item--current', i.dataset.sync === String(days));
        });
    };
    if (window.__squadBoard) window.__squadBoard.refreshSyncButtonLabel = refreshSyncButtonLabel;
    refreshSyncButtonLabel();

    // JIRA import — clic direct = sync rapide selon paramètre (mode merge, recommandé)
    document.getElementById('btn-sync')?.addEventListener('click', () => handleJiraImport(_getQuickDays()));

    // Dropdown des options de sync (7j / 14j / 30j / complète)
    const syncMenuBtn = document.getElementById('btn-sync-menu');
    const syncMenu = document.getElementById('sync-menu');
    syncMenuBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const open = !syncMenu.hidden;
        syncMenu.hidden = open;
        syncMenuBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    document.addEventListener('click', e => {
        if (!syncMenu || syncMenu.hidden) return;
        if (!e.target.closest('.btn-split')) {
            syncMenu.hidden = true;
            syncMenuBtn?.setAttribute('aria-expanded', 'false');
        }
    });
    syncMenu?.addEventListener('click', e => {
        const item = e.target.closest('[data-sync]');
        if (!item) return;
        syncMenu.hidden = true;
        syncMenuBtn?.setAttribute('aria-expanded', 'false');
        const v = item.dataset.sync;
        handleJiraImport(v === 'full' ? 'full' : parseInt(v, 10));
    });

    // "Mes tickets" toggle — filtre global par leader === currentUser
    const _MY_KEY = 'sb-my-tickets-on';
    const _USER_KEY = 'sb-my-name';
    const myBtn = document.getElementById('btn-my-tickets');
    const updateMyBtn = () => {
        const on = localStorage.getItem(_MY_KEY) === '1';
        const name = localStorage.getItem(_USER_KEY) || '';
        store.set('myFilterOn', on);
        store.set('myName', name);
        if (myBtn) {
            myBtn.classList.toggle('btn-toggle--on', on);
            myBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            myBtn.title = name
                ? (on ? `Filtre actif : tickets de ${name}` : `Voir uniquement mes tickets (${name})`)
                : 'Définir votre nom dans Paramètres → À propos';
            myBtn.style.display = name ? '' : 'none';  // caché si pas configuré
        }
    };
    myBtn?.addEventListener('click', () => {
        if (!localStorage.getItem(_USER_KEY)) {
            const name = prompt('Votre nom (tel qu\'il apparaît dans JIRA comme assignee) :');
            if (!name) return;
            localStorage.setItem(_USER_KEY, name.trim());
        }
        const on = localStorage.getItem(_MY_KEY) === '1';
        localStorage.setItem(_MY_KEY, on ? '0' : '1');
        updateMyBtn();
        renderView();
    });
    updateMyBtn();

    // Load server config
    try {
        const config = await api.getConfig();
        store.set('jiraConfigured', config.jiraConfigured);
        store.set('project', config.project);
        store.set('jiraUrl', config.jiraUrl);
    } catch {
        store.set('jiraConfigured', false);
    }

    // Load data from database
    await loadAllData();

    // Update lastVisit AFTER computing newCount (so next visit sees these as "old")
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());

    // If database is empty, seed with demo data
    if ((store.get('tickets') || []).length === 0) {
        toast('Premier lancement - creation des donnees de demo...', 'info', 3000);
        const seeded = await seedDemoData();
        if (seeded) {
            await loadAllData();
            toast('Donnees de demo creees ! Modifiez-les librement.', 'success', 4000);
        }
    }

    // Restaure la vue/équipe depuis l'URL (avant d'enregistrer les listeners)
    applyHash();

    // Navigation listeners : re-render + mise à jour du hash
    // Reset du piOffset au changement de vue (pour repartir sur le PI courant à chaque navigation)
    store.on('view',  () => { if (!_applyingHash) store.set('piOffset', 0); renderView(); pushHash(); });
    store.on('team',  () => { renderView(); pushHash(); });
    store.on('group', () => { renderView(); pushHash(); });
    store.on('piOffset', () => { renderView(); pushHash(); });

    // Boutons retour/avant du navigateur + liens <a href="#...">
    window.addEventListener('popstate', applyHash);
    window.addEventListener('hashchange', applyHash);

    // Rendu initial
    renderView();
    pushHash(); // initialise le hash si l'URL en était dépourvue
}

init().catch(e => {
    console.error('Init error:', e);
    content.innerHTML = `
        <div class="empty-state">
            <svg class="icon" style="width:48px;height:48px;color:var(--danger)"><use href="#i-alert"/></svg>
            <h3>Erreur d'initialisation</h3>
            <p>${e.message}</p>
        </div>
    `;
});
