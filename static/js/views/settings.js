/**
 * Paramètres — coquille de la vue : lit le store UNE fois (`_settingsCtx`), assemble les
 * sections, les câble, puis cible la section / l'équipe demandée par le hash.
 *
 * Chaque section vit dans son module `settings-<section>.js`, sur le même contrat :
 *   `<section>SectionHtml(ctx)` → HTML (lecture seule du contexte)
 *   `wire<Section>Section(container, ctx)` → écouteurs ; rechargement via `ctx.reload()`
 * Un module de section n'importe JAMAIS settings.js (cycle) : tout passe par `ctx`.
 * L'ordre d'assemblage fait l'ordre des onglets (`_settingsApplyTabs`).
 */

import { store } from '../state.js';
import { esc, deriveMembersFromAbsences, scrollToEl } from '../utils.js';
import * as api from '../api.js';
import { mountNavRail } from '../components/nav-rail.js';
import { _rotRenderPanels, _rotSetCollapsed } from './settings-rotation.js';
import { jiraSectionHtml, wireJiraSection } from './settings-jira.js';
import { wirePersonAliases } from './settings-person-aliases.js';
import { wireBackup } from './settings-backup.js';
import { wireCalDetect } from './settings-cal-detect.js';
import { meteoSectionHtml, wireMeteoSection } from './settings-meteo.js';
import { groupsSectionHtml, wireGroupsSection } from './settings-groups.js';
import { teamsSectionHtml, wireTeamsSection } from './settings-teams.js';
import { membersSectionHtml, capRolesSectionHtml, wireMembersSection } from './settings-members.js';
import { absencesSectionHtml, wireAbsencesSection } from './settings-absences.js';
import { eventsSectionHtml, wireEventsSection } from './settings-events.js';
import { rotationSectionHtml, wireRotationSection } from './settings-support.js';
import { wireSupportIo } from './settings-support-io.js';
import { sprintPiSectionHtml } from './settings-sprint-pi-html.js';
import { wireSprintPiSection } from './settings-sprint-pi.js';
import { remindersSectionHtml, wireRemindersSection } from './settings-reminders.js';
import { workcalSectionHtml, wireWorkcalSection } from './settings-workcal.js';
import { rulesSectionHtml, wireRulesSection } from './settings-rules.js';
import { modulesSectionHtml, wireModulesSection } from './settings-modules.js';
import { identitySectionHtml, wireIdentitySection } from './settings-identity.js';
import { calendarsSectionHtml, wireCalendarsSection } from './settings-calendars.js';
import { slackSectionHtml, wireSlackSection } from './settings-slack.js';
import { dataSectionHtml, aboutSectionHtml, wireDataSection } from './settings-data.js';

// Rappels de cérémonies : vivent dans reminders.js (lus par l'info-panel sans charger cette
// vue) — ré-exportés ici pour compatibilité.
export { REMINDER_DEFS, loadReminders } from '../reminders.js';

/** Instantané du store partagé par toutes les sections d'un rendu. */
function _settingsCtx(container) {
    const groups = store.get('groups') || [];
    const members = store.get('members') || [];
    const absences = store.get('absences') || [];
    const teamNames = (store.get('teams') || []).slice().sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
    // Groupe du topbar : la rotation se restreint à ses équipes
    const selGroup = groups.find(g => g.id === store.get('group')) || null;
    return {
        project: store.get('project'),
        jiraUrl: store.get('jiraUrl'),
        teams: store.get('teamObjects') || [],
        teamNames, groups, members, absences, selGroup,
        jiraProjectTeams: store.get('jiraProjectTeams') || {},
        // Rotation : membres dérivés des absences (le CSV RH fait foi)
        rotMembers: deriveMembersFromAbsences(absences, members),
        rotTeamNames: selGroup?.teams?.length ? teamNames.filter(t => selGroup.teams.includes(t)) : teamNames,
        support: store.get('support') || [],
        tickets: store.get('tickets') || [],
        events: store.get('events') || [],
        sprintInfo: store.get('sprintInfo'),
        piInfo: store.get('piInfo'),
        calendars: store.get('calendars') || [],
        reload: () => reloadAndRender(container),   // tout l'état depuis l'API, puis re-rendu
        rerender: () => renderSettings(container),   // re-rendu seul (store déjà à jour)
    };
}

export function renderSettings(container) {
    const ctx = _settingsCtx(container);

    container.innerHTML = `
        <!-- Barre de tabs PLEINE LARGEUR (hors du settings-layout qui est cappé à 800px) -->
        <nav id="settings-tabs" class="settings-tabs" aria-label="Sections Paramètres"></nav>
        <div class="settings-layout">
            ${groupsSectionHtml(ctx)}
            ${teamsSectionHtml(ctx)}
            ${membersSectionHtml(ctx)}
            ${capRolesSectionHtml(ctx)}
            ${absencesSectionHtml(ctx)}
            ${eventsSectionHtml(ctx)}
            ${rotationSectionHtml(ctx)}
            ${sprintPiSectionHtml(ctx)}
            ${remindersSectionHtml(ctx)}
            ${workcalSectionHtml()}
            ${calendarsSectionHtml(ctx)}
            ${jiraSectionHtml()}
            ${slackSectionHtml(ctx)}
            ${meteoSectionHtml()}
            ${rulesSectionHtml()}
            ${identitySectionHtml()}
            ${modulesSectionHtml()}
            ${dataSectionHtml(ctx)}
            ${aboutSectionHtml(ctx)}
        </div>`;

    // Sections repliables
    container.querySelectorAll('[data-stg-toggle]').forEach(header => {
        header.addEventListener('click', () => header.closest('.settings-section')?.classList.toggle('collapsed'));
    });

    wireJiraSection(container, ctx.reload);      // connexion, synchro, équipes masquées
    wirePersonAliases(container, ctx.reload);
    wireBackup(container, ctx.reload);           // 💾 sauvegarde & restauration (Données)
    wireCalDetect(container);
    wireMeteoSection(container);
    wireWorkcalSection(container);
    wireRulesSection(container);
    wireModulesSection(container);
    wireIdentitySection(container);
    wireSlackSection(container, ctx);
    wireGroupsSection(container, ctx);
    wireTeamsSection(container, ctx);
    wireMembersSection(container, ctx);
    wireAbsencesSection(container, ctx);
    wireEventsSection(container, ctx);
    wireCalendarsSection(container, ctx);
    wireRotationSection(container, ctx);
    wireSupportIo(container, ctx);
    wireSprintPiSection(container, ctx);
    wireRemindersSection(container, ctx);
    wireDataSection(container, ctx);

    _applyIncomingTarget(container);
    // Activation des onglets (post-rendu : titres → slugs, nav, affichage)
    store.set('settingsSection', null);   // consommé ; _settingsApplyTabs relit location.hash
    _settingsApplyTabs(container);
}

/** Remplit un filtre de liste et déclenche son écouteur `input` (même chemin que la saisie). */
function _prefillFilter(container, selector, value) {
    const input = container.querySelector(selector);
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

/**
 * Ciblage à l'arrivée selon la section du hash : panneau de rotation d'une équipe, ou
 * filtres Membres / Absences préremplis avec l'équipe du topbar.
 */
function _applyIncomingTarget(container) {
    const incoming = store.get('settingsSection') ||
        (location.hash.startsWith('#settings/') ? location.hash.slice(10) : null);
    const activeTeam = store.get('team');
    const hasTeam = activeTeam && activeTeam !== 'all';

    // Slugs complets → alias courts
    const key = {
        'rotation-support': 'rotation', 'rotation': 'rotation',
        'absences-conges': 'absences',  'absences': 'absences',
        'slack-optionnel': 'slack',
        'plugin-jira-optionnel': 'jira',
    }[incoming] || incoming;

    // Équipe ciblée : segment explicite du hash (#settings/rotation/Gabbiano, posé par le
    // bouton « ⚙ Édition » de la page Support) > filtre actif du topbar. Le segment est
    // indispensable quand le topbar est sur « toutes les équipes » : chaque panneau Support
    // a son propre bouton et doit ouvrir SON équipe.
    const targetTeam = store.get('settingsTeam') || (hasTeam ? activeTeam : null);

    if (key === 'rotation' && targetTeam) {
        // Déplier le panneau de l'équipe. Les panneaux sont déjà rendus (repliés) : sans ce
        // re-rendu, l'état ne s'appliquait qu'à la visite SUIVANTE et le défilement visait un
        // panneau fermé — vu de l'utilisateur, « Édition » ne faisait rien.
        _rotSetCollapsed(targetTeam, false);
        _rotRenderPanels(container, store.get('support') || []);
        requestAnimationFrame(() => {
            const panel = container.querySelector(`#rot-panel-${CSS.escape(targetTeam)}`);
            if (!panel) return;
            scrollToEl(panel);   // arrivée sous la nav collante : scroll-padding-top du scrollport
            // Halo bref : sur une page à N équipes, un défilement silencieux ne dit pas où
            // l'on a atterri. Retiré à la fin de l'animation CSS.
            panel.classList.add('rot-panel--targeted');
            panel.addEventListener('animationend', () => panel.classList.remove('rot-panel--targeted'), { once: true });
            // Ciblage à usage unique : un retour ultérieur via la sidebar ne doit pas rouvrir
            // cette équipe. Le hash a déjà été réécrit par _settingsApplyTabs : le lien reste
            // rechargeable.
            store.set('settingsTeam', null);
        });
    }

    if (key === 'membres' && hasTeam) _prefillFilter(container, '#member-filter', activeTeam);

    if ((key === 'absences' || incoming?.startsWith('absences')) && hasTeam) {
        container.querySelector('#abs-list-details')?.setAttribute('open', '');
        _prefillFilter(container, '#abs-filter', activeTeam);
    }
}

// ── Ancrage des scrolls sous la nav sticky ──────────────────────────────────
// `.settings-tabs` colle en haut de `#content` (= le scrollport) et recouvrait la cible de
// tout `scrollIntoView` de la vue. Le décalage vit en CSS (`scroll-padding-top` sur
// `.content:has(.settings-tabs)`, settings.css) ; ici on ne publie que la MESURE : la nav
// wrappe selon la largeur, sa hauteur n'est pas constante. `container` EST `#content`
// (app.js appelle `renderer(content)`), donc la variable atterrit bien sur le scrollport.
// Rail de la barre d'onglets — un seul à la fois, comme `_tabsResizeObs` : la vue est
// re-rendue à chaque navigation, et empiler les instances empilerait leurs listeners.
let _navRail = null;
let _tabsResizeObs = null;
function _publishTabsHeight(container, nav) {
    const apply = () => {
        // ⚠️ Mesurer l'élément COLLANT, pas la barre : depuis le passage en rail
        // (3.146.0), c'est le wrapper posé par `mountNavRail` qui porte le padding, le
        // bord et le `position: sticky`. Mesurer la barre seule sous-estimerait la
        // hauteur réellement recouvrante, et `scrollIntoView` viserait trop haut.
        const cible = nav.closest('.nav-rail-wrap') || nav;
        const h = cible.offsetHeight;
        if (h) container.style.setProperty('--stg-tabs-h', `${h}px`);
    };
    apply();
    // Suit le re-wrap des groupes de tabs (redimensionnement, ouverture de l'info-panel).
    // Un seul observer à la fois : la vue est re-rendue à chaque navigation.
    _tabsResizeObs?.disconnect();
    if (typeof ResizeObserver === 'function') {
        _tabsResizeObs = new ResizeObserver(apply);
        _tabsResizeObs.observe(nav.closest('.nav-rail-wrap') || nav);
    }
}

// ── Système de tabs Settings ────────────────────────────────────────────────
// Transforme les .settings-section empilées en navigation par tabs (1 visible à la fois).
// Source de la tab active (priorité) : hash #settings/<slug> > store.settingsSection > localStorage > 1re.
function _settingsApplyTabs(container) {
    const sections = [...container.querySelectorAll('.settings-section')];
    if (!sections.length) return;
    const _slug = s => s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const tabs = sections.map((sec, i) => {
        const h3 = sec.querySelector('.settings-section-header h3');
        const rawTitle = (h3?.textContent || `Section ${i + 1}`).trim();
        // Strip suffixe "(N)" et autres compteurs entre parenthèses du titre affiché en tab.
        const title = rawTitle.replace(/\s*\(\d+\)\s*$/, '').trim();
        // Conserve un id stable (existant ou dérivé du titre — section-rotation, section-sprint-pi, etc.)
        let id = sec.id;
        if (!id) { id = 'section-' + _slug(title); sec.id = id; }
        const slug = id.replace(/^section-/, '');
        // En mode tabs : on retire le toggle individuel des headers (ils ne doivent plus collapser)
        sec.querySelectorAll('[data-stg-toggle]').forEach(h => h.removeAttribute('data-stg-toggle'));
        return { sec, id, slug, title, icon: _settingsTabIcon(title), color: _settingsTabColor(i) };
    });

    const nav = container.querySelector('#settings-tabs');
    if (!nav) return;

    // Groupes de tabs — l'ordre et les slugs doivent correspondre aux titres h3 des sections
    const TAB_GROUPS = [
        { label: 'Équipe',        slugs: ['lignes-produit-groupes', 'equipes', 'membres', 'capacite-dev-de-travail-par-role', 'absences-conges'] },
        { label: 'Planning',      slugs: ['sprint-pi', 'rotation', 'faits-marquants', 'rappels-ceremonies', 'calendrier-de-travail'] },
        { label: 'Règles',        slugs: ['seuils-meteo', 'regles-metier'] },
        { label: 'Intégrations',  slugs: ['calendriers-ics', 'plugin-jira-optionnel', 'slack-optionnel'] },
        { label: 'Système',       slugs: ['identite-du-projet', 'modules-menu', 'donnees', 'a-propos'] },
    ];

    const _tabBtn = t =>
        `<button class="stg-tab" data-stg-tab="${esc(t.slug)}" style="--tab-color:${t.color}" title="${esc(t.title)}">
            <span class="stg-tab-icon">${t.icon}</span>
            <span class="stg-tab-label">${esc(t.title)}</span>
        </button>`;

    // Construit les groupes — les tabs non matchées tombent dans "Autres"
    const assignedSlugs = new Set(TAB_GROUPS.flatMap(g => g.slugs));
    const unassigned = tabs.filter(t => !assignedSlugs.has(t.slug));

    const groupsHtml = TAB_GROUPS.map(g => {
        const groupTabs = tabs.filter(t => g.slugs.includes(t.slug))
            .sort((a, b) => g.slugs.indexOf(a.slug) - g.slugs.indexOf(b.slug));
        if (!groupTabs.length) return '';
        return `<div class="stg-tab-group">
            <span class="stg-tab-group-label">${esc(g.label)}</span>
            <div class="stg-tab-group-items">${groupTabs.map(_tabBtn).join('')}</div>
        </div>`;
    }).join('');

    const othersHtml = unassigned.length
        ? `<div class="stg-tab-group"><span class="stg-tab-group-label">Autres</span><div class="stg-tab-group-items">${unassigned.map(_tabBtn).join('')}</div></div>`
        : '';

    nav.innerHTML = groupsHtml + othersHtml;
    // Rail défilant : la barre tenait 8 lignes et 227 px sur un iPhone 14 (mesuré), soit
    // plus de la moitié de l'écran pour une nav collante. Monté APRÈS le remplissage —
    // le composant a besoin du contenu pour savoir s'il déborde.
    _navRail?.destroy();
    _navRail = mountNavRail(nav, {
        labelPrev: 'Sections précédentes',
        labelNext: 'Sections suivantes',
    });
    _publishTabsHeight(container, nav);

    const activate = (slug, { syncHash = true } = {}) => {
        const found = tabs.find(t => t.slug === slug) || tabs[0];
        if (!found) return;
        // Recentrer l'onglet dans le rail : sélectionné depuis un hash ou la palette, il
        // peut être hors champ, et rien n'indiquerait alors où l'on se trouve.
        // `requestAnimationFrame` : appelé avant que la classe active soit posée, le
        // navigateur centrerait la position d'AVANT le changement de style.
        requestAnimationFrame(() =>
            _navRail?.center(nav.querySelector(`[data-stg-tab="${CSS.escape(found.slug)}"]`)));
        tabs.forEach(t => {
            const isActive = t === found;
            t.sec.style.display = isActive ? '' : 'none';
            // Tab active : on s'assure que le contenu est déplié (ignore l'état 'collapsed')
            if (isActive) t.sec.classList.remove('collapsed');
        });
        nav.querySelectorAll('[data-stg-tab]').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.stgTab === found.slug);
        });
        localStorage.setItem('sb-settings-tab', found.slug);
        // Sync URL : on stocke dans le store (consommé par pushHash → #settings/<slug>) sans
        // re-déclencher le re-render. replaceState pour ne pas polluer l'historique à chaque clic.
        if (syncHash) {
            // Changement de tab à la main → l'équipe ciblée par le hash d'arrivée ne vaut
            // plus pour la nouvelle section : on la libère avant de réécrire l'URL.
            store.set('settingsTeam', null);
            store.set('settingsSection', found.slug);
            const target = `#settings/${found.slug}`;
            if (location.hash !== target) history.replaceState(null, '', target);
        }
    };

    // Détermination de la tab initiale (sans sync hash : on lit l'état existant)
    const _hashParts = location.hash.replace(/^#/, '').split('/');
    const fromHash  = (_hashParts[0] === 'settings' && _hashParts[1]) ? decodeURIComponent(_hashParts[1]) : null;
    const fromStore = store.get('settingsSection');
    const fromLS    = localStorage.getItem('sb-settings-tab');
    activate(fromHash || fromStore || fromLS || tabs[0]?.slug, { syncHash: false });
    // Sync hash initial : si on a déterminé une tab et que le hash n'est pas déjà settings/<slug>, on le pose
    if (tabs.length) {
        const activeSlug = (nav.querySelector('.stg-tab.is-active')?.dataset.stgTab) || tabs[0].slug;
        store.set('settingsSection', activeSlug);
        // Conserve le segment équipe (#settings/rotation/Gabbiano) : le supprimer ici rendait
        // le lien non rechargeable — un F5 revenait sur la section sans cibler l'équipe.
        const _tm = store.get('settingsTeam');
        const target = `#settings/${activeSlug}${_tm ? '/' + encodeURIComponent(_tm) : ''}`;
        if (location.hash !== target) history.replaceState(null, '', target);
    }

    nav.querySelectorAll('[data-stg-tab]').forEach(btn => {
        btn.addEventListener('click', () => activate(btn.dataset.stgTab));
    });
}

function _settingsTabIcon(title) {
    const t = title.toLowerCase();
    if (t.includes('météo') || t.includes('meteo')) return '🌤️';
    if (t.includes('groupe') || t.includes('ligne')) return '🌳';
    if (t.includes('equipe') || t.includes('équipe')) return '👥';
    if (t.includes('membre')) return '🧑';
    if (t.includes('absence') || t.includes('conge') || t.includes('congé')) return '🌴';
    if (t.includes('sprint') || t.includes('pi')) return '🚀';
    if (t.includes('rotation') || t.includes('support')) return '🛎️';
    if (t.includes('fait') || t.includes('event')) return '⚡';
    if (t.includes('calend')) return '📅';
    if (t.includes('jira')) return '🔗';
    if (t.includes('rappel') || t.includes('reminder')) return '⏰';
    if (t.includes('donn') || t.includes('export') || t.includes('import')) return '📦';
    return '⚙️';
}
function _settingsTabColor(i) {
    const palette = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#a855f7','#22c55e','#f97316','#3b82f6','#ec4899','#14b8a6'];
    return palette[i % palette.length];
}


async function reloadAndRender(container) {
    const [tickets, features, epics, members, teams, groups, absences, support, events, sprint, pi, calendars, calendarEvents] = await Promise.all([
        api.getTickets(), api.getFeatures(), api.getEpics(),
        api.getMembers(), api.getTeams(), api.getGroups(),
        api.getAbsences(), api.getSupport(), api.getEvents(),
        api.getSprint().catch(() => null), api.getPI().catch(() => null),
        api.getCalendars().catch(() => []), api.getCalendarEvents().catch(() => []),
    ]);
    store.set('tickets', tickets); store.set('features', features); store.set('epics', epics);
    store.set('members', members);
    store.set('teams', teams.map(t => typeof t === 'string' ? t : t.name));
    store.set('teamObjects', teams);
    store.set('groups', groups); store.set('absences', absences); store.set('support', support);
    store.set('events', events);
    store.set('sprintInfo', sprint); store.set('piInfo', pi);
    store.set('calendars', calendars);
    store.set('calendarEvents', calendarEvents);
    renderSettings(container);
}
