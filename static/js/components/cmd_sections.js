/**
 * Catalogue des BLOCS navigables depuis la palette Ctrl+K.
 *
 * La palette proposait des vues entières ("Dashboard") mais pas leurs blocs
 * ("Temps par colonne", "Prévision de fin", "Vélocité"…). Ce module déclare ces
 * blocs, les résout dans le DOM APRÈS navigation, puis scrolle dessus avec un flash.
 *
 * Résolution d'un bloc (dans l'ordre) :
 *   1. `sel`   — sélecteur CSS d'un conteneur à l'id stable (#charts-section, #report-sec-sprint…)
 *   2. `anchor` — texte du titre affiché, retrouvé sans tenir compte des accents, emojis
 *                ni compteurs "(N)". C'est volontairement le LIBELLÉ VISIBLE qui sert
 *                d'ancre : pas d'id à poser dans 20 vues, et un titre renommé se corrige ici.
 *
 * Vues à sous-navigation (PI, Roadmap, Paramètres) : `tab` porte le segment de hash
 * (#pi/<équipe>/<tab>). On passe par le routeur d'app.js — il sait poser piTab,
 * settingsSection, etc. — en conservant l'équipe courante.
 */

import { store } from '../state.js';
import { toast } from '../utils.js';
import { NAV_ITEMS } from '../config.js';

const VIEW_LABELS = Object.fromEntries(NAV_ITEMS.map(n => [n.id, n.label]));

// Délai max d'attente de l'apparition du bloc (rendu de vue lazy + import dynamique)
const REVEAL_TIMEOUT_MS = 3000;
const FLASH_MS = 2200;

// Éléments susceptibles de porter un titre de bloc, tous types de vues confondus
const TITLE_SEL = [
    '.card-title', '.section-title', '.pi-section-title', '.report-section-title',
    '.health-matrix-title', '.htl-section-lbl', '.pi-burnup-title', '.metric-label',
    '.settings-section-header h3', '.dash-stream-hd h2', 'summary', 'h2', 'h3',
].join(', ');

// Conteneur de bloc à mettre en avant — à défaut, le titre lui-même (plus précis
// qu'une grande section qui déborderait de l'écran)
const CONTAINER_SEL = '.card, .metric-card, .report-section, .pi-section, .settings-section, .health-velo-host';

// Un titre reste court : au-delà, c'est un bloc de texte qui contient le mot par hasard
const MAX_TITLE_LEN = 120;

const _norm = s => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const _slug = s => _norm(s).replace(/\s+/g, '-');

// ── Catalogue ────────────────────────────────────────────────────────────────
// { view, label, icon, keywords, anchor? | sel?, tab? }
const RAW = [
    // ── Dashboard ──────────────────────────────────────────────────────────
    { view: 'dashboard', icon: '🎯', label: 'Cap de l’équipe',        anchor: 'Cap de l’équipe',            keywords: 'objectif goal sprint pi cap equipe engagement' },
    { view: 'dashboard', icon: '📋', label: 'Indicateurs clés',        sel: '.dashboard-metrics',           keywords: 'kpi cles metriques tickets story points en cours bloques synthese' },
    { view: 'dashboard', icon: '🚀', label: 'Débit (7j)',              anchor: 'Débit (7j)',                 keywords: 'throughput debit semaine tickets termines tendance' },
    { view: 'dashboard', icon: '⏱️', label: 'Cycle time médian',       anchor: 'Cycle time méd.',            keywords: 'cycle time median duree traversee' },
    { view: 'dashboard', icon: '⚡', label: 'Flow efficiency',          anchor: 'Flow efficiency',            keywords: 'flow efficiency efficacite attente file' },
    { view: 'dashboard', icon: '📝', label: 'Sans estimation',         anchor: 'Sans estimation',            keywords: 'sans estimation story points non estimes hygiene' },
    { view: 'dashboard', icon: '👤', label: 'Sans assigné',            anchor: 'Sans assigné',               keywords: 'sans assigne unassigned responsable lead hygiene' },
    { view: 'dashboard', icon: '📉', label: 'Lead time & Cycle time',  anchor: 'Lead time & Cycle time',     keywords: 'lead time cycle time attente traversee schema' },
    { view: 'dashboard', icon: '⏳', label: 'Temps par colonne',        anchor: 'Temps par colonne',          keywords: 'temps colonne stage flow etape workflow duree dev test revue qualif prod' },
    { view: 'dashboard', icon: '📈', label: 'Vélocité',                anchor: 'Vélocité',                   keywords: 'velocity velocite points livres sprint moyenne objectif' },
    { view: 'dashboard', icon: '⌛', label: 'Ancienneté du travail en cours', anchor: 'Ancienneté du travail en cours', keywords: 'aging wip anciennete travail en cours vieillissement' },
    { view: 'dashboard', icon: '🔮', label: 'Prévision de fin',        anchor: 'Prévision de fin',           keywords: 'prevision fin forecast monte carlo probabilite terminer sprint' },
    { view: 'dashboard', icon: '🎯', label: 'SLA Review',              anchor: 'SLA Review',                 keywords: 'sla sle delai respect cycle time seuil' },
    { view: 'dashboard', icon: '👥', label: 'Équipes (cartes)',        anchor: 'Équipes',                    keywords: 'equipes teams cartes repartition' },
    { view: 'dashboard', icon: '🚫', label: 'Tickets bloqués ou stagnants', anchor: 'Tickets bloqués ou stagnants', keywords: 'bloques stagnants stale impediment sans mouvement' },
    { view: 'dashboard', icon: '🚀', label: 'Flux « Pilotage & flux »', anchor: 'Pilotage & flux',           keywords: 'pilotage flux rythme traversee colonne gauche' },
    { view: 'dashboard', icon: '👥', label: 'Flux « Équipe & risques »', anchor: 'Équipe & risques',         keywords: 'equipe risques sante signaux colonne droite' },

    // ── Board (sprint) ─────────────────────────────────────────────────────
    { view: 'sprint', icon: '📊', label: 'Métriques sprint (graphiques)', sel: '#charts-section',           keywords: 'metriques graphiques charts sprint burndown burnup cfd' },
    { view: 'sprint', icon: '📉', label: 'Burndown',                  anchor: 'Burndown',                    keywords: 'burndown reste a faire courbe ideale' },
    { view: 'sprint', icon: '📈', label: 'Burnup',                    anchor: 'Burnup',                      keywords: 'burnup perimetre realise' },
    { view: 'sprint', icon: '🗂️', label: 'CFD',                       anchor: 'CFD',                         keywords: 'cfd cumulative flow diagram flux cumule' },
    { view: 'sprint', icon: '🚀', label: 'Throughput',                anchor: 'Throughput',                  keywords: 'throughput debit tickets par jour' },
    { view: 'sprint', icon: '⏱️', label: 'Cycle Time (graphique)',    anchor: 'Cycle Time',                  keywords: 'cycle time scatter dispersion' },
    { view: 'sprint', icon: '⌛', label: 'WIP Age',                    anchor: 'WIP Age',                     keywords: 'wip age anciennete en cours' },

    // ── PI Planning (onglets) ──────────────────────────────────────────────
    { view: 'pi', icon: '🎯', label: 'Objectifs du PI',      tab: 'objectives', sel: '#pi-tabs', keywords: 'objectifs pi committed stretch atteinte' },
    { view: 'pi', icon: '📊', label: 'Indicateurs du PI',    tab: 'indicators', sel: '#pi-tabs', keywords: 'indicateurs metriques pi lead time temps par colonne' },
    { view: 'pi', icon: '📦', label: 'Features du PI',       tab: 'features',   sel: '#pi-tabs', keywords: 'features epics perimetre pi' },
    { view: 'pi', icon: '⚡', label: 'Capacité du PI',        tab: 'capacity',   sel: '#pi-tabs', keywords: 'capacite charge prevue etp absences base' },
    { view: 'pi', icon: '📈', label: 'Burnup du PI',         tab: 'burnup',     sel: '#pi-tabs', keywords: 'burnup pi avancement points' },
    { view: 'pi', icon: '⚠️', label: 'ROAM du PI',           tab: 'roam',       sel: '#pi-tabs', keywords: 'roam risques resolved owned accepted mitigated' },
    { view: 'pi', icon: '🔗', label: 'Dépendances inter-équipes', tab: 'deps',  sel: '#pi-tabs', keywords: 'dependances inter equipes liens graphe' },
    { view: 'pi', icon: '👥', label: 'Équipes du PI',        tab: 'teams',      sel: '#pi-tabs', keywords: 'equipes teams pi repartition' },
    { view: 'pi', icon: '🛡️', label: 'Support du PI',        tab: 'support',    sel: '#pi-tabs', keywords: 'support rotation astreinte pi' },
    { view: 'pi', icon: '😊', label: 'Mood / ROTI',          tab: 'mood',       sel: '#pi-tabs', keywords: 'mood meter roti humeur vote sondage' },
    { view: 'pi', icon: '✊', label: 'Fist of Five',          tab: 'fist',       sel: '#pi-tabs', keywords: 'fist of five confiance vote pi' },
    { view: 'pi', icon: '📅', label: 'Calendrier du PI',     tab: 'calendar',   sel: '#pi-tabs', keywords: 'calendrier pi sprints dates jalons' },

    // ── Rapports (sections ancrées) ────────────────────────────────────────
    { view: 'reports', icon: '📊', label: 'Métriques sprint',      sel: '#report-sec-metriques', keywords: 'metriques sprint kpi completion points buffer graphiques' },
    { view: 'reports', icon: '📋', label: 'Rapport Sprint',        sel: '#report-sec-sprint',    keywords: 'rapport sprint compte rendu export' },
    { view: 'reports', icon: '🗂️', label: 'Rapport Kanban / Flow', sel: '#report-sec-kanban',    keywords: 'kanban flow wip debit rapport' },
    { view: 'reports', icon: '🛡️', label: 'Rapport Support',       sel: '#report-sec-support',   keywords: 'support rotation rapport' },
    { view: 'reports', icon: '🗺️', label: 'Rapport Roadmap / PI',  sel: '#report-sec-roadmap',   keywords: 'roadmap pi rapport features' },
    { view: 'reports', icon: '📉', label: 'Epic Burndown',         sel: '#report-sec-epicburn',  keywords: 'epic burndown avancement epics' },
    { view: 'reports', icon: '😊', label: 'Mood Meter / ROTI',     sel: '#report-sec-sondage',   keywords: 'mood meter roti sondage humeur vote' },
    { view: 'reports', icon: '✊', label: 'Vote de confiance PI',   sel: '#report-sec-pifist',    keywords: 'fist of five confiance vote pi' },
    { view: 'reports', icon: '📅', label: 'Calendrier (rapport)',  sel: '#report-sec-calendar',  keywords: 'calendrier agenda rapport' },
    { view: 'reports', icon: '👥', label: 'Rapport Équipes',       sel: '#report-sec-teams',     keywords: 'equipes teams repartition rapport' },
    { view: 'reports', icon: '🗓️', label: 'Rapport PI Planning',   sel: '#report-sec-pi',        keywords: 'pi planning rapport objectifs' },
    { view: 'reports', icon: '📄', label: 'Rapport complet',       sel: '#report-sec-full',      keywords: 'rapport complet tout export confluence' },

    // ── Santé ──────────────────────────────────────────────────────────────
    { view: 'health', icon: '🩺', label: 'Health Check',                anchor: 'Health Check',                 keywords: 'health check sante score anomalies' },
    { view: 'health', icon: '🧮', label: 'Matrice équipes × anomalies',  anchor: 'Matrice équipes',              keywords: 'matrice equipes anomalies grille croisee' },
    { view: 'health', icon: '🗓️', label: 'Sprints du PI (tableau)',      anchor: 'Sprints du PI',                keywords: 'sprints pi tableau charge mood confiance velocite' },

    // ── Roadmap ────────────────────────────────────────────────────────────
    { view: 'roadmap', icon: '🩺', label: 'Santé du backlog',        anchor: 'Sante du backlog',        keywords: 'sante backlog qualite raffinement' },
    { view: 'roadmap', icon: '🔗', label: 'Graphe de dépendances',    anchor: 'Graphe de dépendances',   keywords: 'graphe dependances liens inter equipes' },
    { view: 'roadmap', icon: '📈', label: 'Historique de vélocité',   anchor: 'Historique de velocite',  keywords: 'historique velocite tendance sprints' },
    { view: 'roadmap', icon: '⚖️', label: 'Allocation par équipe',    anchor: 'Allocation par equipe',   keywords: 'allocation equipe repartition charge' },
    { view: 'roadmap', icon: '🗺️', label: 'Timeline multi-PI',        anchor: 'Timeline multi-PI',       keywords: 'timeline multi pi frise long terme' },

    // ── Support ────────────────────────────────────────────────────────────
    { view: 'support', icon: '🛎️', label: 'Rotation cette semaine',  anchor: 'Rotation cette semaine',  keywords: 'rotation semaine astreinte de garde' },
    { view: 'support', icon: '⚖️', label: 'Répartition par équipe',   anchor: 'Repartition par equipe',  keywords: 'repartition equipe support charge' },
    { view: 'support', icon: '🎫', label: 'Tickets ouverts (support)', anchor: 'Tickets ouverts',        keywords: 'tickets ouverts support incidents' },
    { view: 'support', icon: '📆', label: 'Rotation du PI',           anchor: 'Rotation du PI',          keywords: 'rotation pi semaines planning support' },

    // ── Équipe ─────────────────────────────────────────────────────────────
    { view: 'team', icon: '🪪', label: 'Fiche d’identité',  anchor: 'Fiche d’identité',        keywords: 'fiche identite equipe presentation valeurs' },
    { view: 'team', icon: '✨', label: 'Ateliers',           sel: '#team-workshops-section',   keywords: 'ateliers workshops animation team building' },

    // ── Atlas ──────────────────────────────────────────────────────────────
    { view: 'atlas', icon: '🧭', label: 'Carte des compétences', sel: '#atlas-stage',          keywords: 'carte competences skills map programme zoom' },

    // ── Paramètres (onglets) ───────────────────────────────────────────────
    { view: 'settings', icon: '🏷️', label: 'Lignes produit / Groupes', tab: 'lignes-produit-groupes', sel: '#section-lignes-produit-groupes', anchor: 'Lignes produit / Groupes', keywords: 'lignes produit groupes regroupement equipes' },
    { view: 'settings', icon: '👥', label: 'Équipes (paramètres)',      tab: 'equipes', sel: '#section-equipes', anchor: 'Équipes',                 keywords: 'equipes teams parametres creation' },
    { view: 'settings', icon: '🧑', label: 'Membres',                   tab: 'membres', sel: '#section-membres', anchor: 'Membres',                 keywords: 'membres personnes roster csv' },
    { view: 'settings', icon: '⚡', label: 'Capacité dev par rôle',      tab: 'cap-roles', sel: '#section-cap-roles', anchor: 'Capacité dev', keywords: 'capacite role dev tech lead po sm pourcentage etp' },
    { view: 'settings', icon: '🏖️', label: 'Absences / Congés',         tab: 'absences-conges', sel: '#section-absences-conges', anchor: 'Absences / Congés',         keywords: 'absences conges csv import rh' },
    { view: 'settings', icon: '🗓️', label: 'Sprint & PI',               tab: 'sprint-pi', sel: '#section-sprint-pi', anchor: 'Sprint & PI',               keywords: 'sprint pi iteration duree dates configuration' },
    { view: 'settings', icon: '🔁', label: 'Rotation Support',          tab: 'rotation', sel: '#section-rotation', anchor: 'Rotation Support',                keywords: 'rotation support grille shuffle semaines' },
    { view: 'settings', icon: '📌', label: 'Faits marquants',           tab: 'faits-marquants', sel: '#section-faits-marquants', anchor: 'Faits marquants',         keywords: 'faits marquants incidents gel code jalons' },
    { view: 'settings', icon: '🔔', label: 'Rappels & Cérémonies',      tab: 'rappels-ceremonies', sel: '#section-rappels-ceremonies', anchor: 'Rappels & Cérémonies',      keywords: 'rappels ceremonies daily retro demo notifications' },
    { view: 'settings', icon: '📅', label: 'Calendriers ICS',           tab: 'calendriers-ics', sel: '#section-calendriers-ics', anchor: 'Calendriers ICS',         keywords: 'calendriers ics google agenda flux' },
    { view: 'settings', icon: '🔌', label: 'Plugin JIRA',               tab: 'plugin-jira-optionnel', sel: '#section-plugin-jira-optionnel', anchor: 'Plugin JIRA',   keywords: 'jira plugin import synchronisation token' },
    { view: 'settings', icon: '💬', label: 'Slack',                     tab: 'slack-optionnel', sel: '#section-slack-optionnel', anchor: 'Slack (optionnel)',         keywords: 'slack webhook canal notifications' },
    { view: 'settings', icon: '💾', label: 'Données (import / export)', tab: 'donnees', sel: '#section-donnees', anchor: 'Données',                 keywords: 'donnees import export sauvegarde reset' },
    { view: 'settings', icon: 'ℹ️', label: 'À propos',                  tab: 'a-propos', sel: '#section-a-propos', anchor: 'A propos',                keywords: 'a propos version changelog aide' },
];

export const SECTIONS = RAW.map(s => ({
    ...s,
    id: `${s.view}:${_slug(s.label)}`,
    viewLabel: VIEW_LABELS[s.view] || s.view,
}));

const _byId = Object.fromEntries(SECTIONS.map(s => [s.id, s]));
export const getSection = id => _byId[id] || null;

// ── Résolution dans le DOM ───────────────────────────────────────────────────
// Un bloc masqué (onglet Paramètres pas encore activé, section repliée) ne peut pas
// être scrollé : on l'ignore tant qu'on a du temps devant nous.
const _visible = el => el.offsetParent !== null || el.getClientRects().length > 0;

function _findEl(sec, { visibleOnly = true } = {}) {
    if (sec.sel) {
        const el = document.querySelector(sec.sel);
        if (el && (!visibleOnly || _visible(el))) return el;
    }
    if (!sec.anchor) return null;
    const needle = _norm(sec.anchor);
    for (const el of document.querySelectorAll(TITLE_SEL)) {
        const txt = _norm(el.textContent);
        if (txt.length > MAX_TITLE_LEN || !txt.includes(needle)) continue;
        const target = el.closest(CONTAINER_SEL) || el;
        if (visibleOnly && !_visible(target)) continue;
        return target;
    }
    return null;
}

/** Ouvre les <details> repliés qui masquent le bloc (les graphiques du Board
 *  s'y montent justement sur l'événement `toggle`). */
function _openAncestors(el) {
    let node = el;
    while (node) {
        const det = node.closest('details');
        if (!det) break;
        if (!det.open) det.open = true;
        node = det.parentElement;
    }
}

function _scrollTo(el) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tall = el.getBoundingClientRect().height > window.innerHeight * 0.8;
    el.classList.add('cmd-section-flash');
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: tall ? 'start' : 'center' });
    setTimeout(() => el.classList.remove('cmd-section-flash'), FLASH_MS);
}

/** Attend l'apparition du bloc (rendu de vue asynchrone) puis le met en avant. */
function _reveal(sec) {
    const t0 = performance.now();
    const tick = () => {
        const el = _findEl(sec);
        if (el) {
            _openAncestors(el);
            // Un <details> qui vient de s'ouvrir change la position : on scrolle au tour suivant
            requestAnimationFrame(() => _scrollTo(el));
            return;
        }
        if (performance.now() - t0 < REVEAL_TIMEOUT_MS) { requestAnimationFrame(tick); return; }
        // Dernière chance : le bloc existe peut-être, masqué (section repliée sans <details>)
        const hidden = _findEl(sec, { visibleOnly: false });
        if (hidden) { _openAncestors(hidden); requestAnimationFrame(() => _scrollTo(hidden)); return; }
        toast(`Bloc « ${sec.label} » introuvable sur cette vue`, 'warning');
    };
    requestAnimationFrame(tick);
}

// ── Navigation ───────────────────────────────────────────────────────────────
function _teamPart() {
    const group = store.get('group');
    return group ? 'group:' + encodeURIComponent(group) : encodeURIComponent(store.get('team') || 'all');
}

/** Va sur la vue du bloc, puis scrolle dessus. */
export function gotoSection(sec) {
    if (!sec) return;
    if (sec.tab) {
        // Hash construit AVEC l'équipe courante : un hash nu la réinitialiserait (cf app.js)
        const target = sec.view === 'settings'
            ? `#settings/${sec.tab}`
            : `#${sec.view}/${_teamPart()}/${sec.tab}`;
        if (location.hash !== target) {
            const sameView = store.get('view') === sec.view;
            history.pushState(null, '', target);
            window.__squadBoard?.applyHash?.();
            // applyHash ne re-rend que sur changement de VUE (et gère seul le cas Settings) :
            // un simple changement d'onglet dans la vue courante reste à rendre.
            if (sameView && sec.view !== 'settings') window.__squadBoard?.rerenderView?.();
        }
    } else if (store.get('view') !== sec.view) {
        store.set('view', sec.view);
    }
    _reveal(sec);
}
