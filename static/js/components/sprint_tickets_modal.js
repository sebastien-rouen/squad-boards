/**
 * Sprint tickets modal — liste détaillée des tickets d'un sprint,
 * ouverte au clic sur une barre du chart vélocité.
 *
 * Pour les sprints clos anciens, les tickets ne sont pas dans la base locale
 * (la sync ne charge que sprint actif + futurs + PI-named). On l'indique
 * clairement à l'utilisateur avec un message d'aide.
 *
 * Découpé en 3.254.0 : rapports (sprint_reports.js), mode Démo (sprint_demo.js), Sprint Review
 * (sprint_review.js, style dans sprint_review_css.js). Ici : ouverture, liste des tickets, chargement JIRA, utilitaires.
 */

import { store } from '../state.js';
import { esc, pct, sumBy, toast, ticketModalOnTop, copySlack, getSprintForTeam, isBufferItem, trapFocus, engagedInSprint, sprintStartsOf, carriedOverTo, extractSprintLabel } from '../utils.js';
import { STATUS_LABELS, STATUS_ORDER, STATUS_MAP, TYPE_ICONS } from '../config.js';
import * as api from '../api.js';
import { openDemoMode } from './sprint_demo.js';
import { _buildSprintReport, _buildSprintReportHtml, _buildSprintReportMd, _canRenderBurndown, _maybeInjectBurndown, _maybeRenderBurndown } from './sprint_reports.js';
import { _buildSprintReviewHtml } from './sprint_review.js';
// API publique inchangée : ré-export
export { openDemoMode } from './sprint_demo.js';

/**
 * Helpers d'entrée pour ouvrir directement Review/Demo sur le sprint sélectionné.
 * Utilisé par : boutons header Sprint/Kanban, command palette Ctrl+K.
 * Pour un sprint passé non présent en base locale, fetch JIRA à la demande.
 */
export async function openCurrentSprintReview() {
    const sprint = _resolveCurrentSprint();
    if (!sprint) { toast('Aucun sprint actif détecté', 'warning'); return; }
    const tickets = await getSprintTicketsAsync(sprint);
    const html = _buildSprintReviewHtml(sprint, tickets);
    _openInNewTab(html);
}
export async function openCurrentSprintDemo() {
    const sprint = _resolveCurrentSprint();
    if (!sprint) { toast('Aucun sprint actif détecté', 'warning'); return; }
    const tickets = await getSprintTicketsAsync(sprint);
    openDemoMode(sprint, tickets);
}

/**
 * Cache des fetchs JIRA pour les sprints clos / non présents en base locale.
 * Clé = `${team || 'all'}::${jiraIds joined}`.
 * Singleton de module (partagé entre modal Sprint Tickets, Sprint Review, Demo
 * et la page Sprint quand on sélectionne un sprint passé).
 */
const _jiraSprintTicketsCache = new Map();

/**
 * Récupère les tickets d'un sprint, depuis la base locale en priorité,
 * sinon fetch JIRA à la demande (sprint clos non synchronisé).
 *
 * - Retourne immédiatement les tickets locaux s'ils existent (sprint actif/récent).
 * - Sinon, si JIRA configuré et sprint a des jiraIds → fetch + cache.
 * - Sinon → tableau vide.
 *
 * Toast informatif au premier fetch (silencieux ensuite via cache).
 * @param {object} sprint  `{ name, team, jiraId, jiraIds, isCurrent, ... }`
 */
export async function getSprintTicketsAsync(sprint) {
    if (!sprint) return [];
    const local = _ticketsOfSprint(sprint);

    // Sprint clos : la base locale ne contient que les tickets DONE qui sont restés taggés
    // avec ce sprint (les "à reporter" ont été retaggés sur le sprint suivant côté JIRA).
    // → On préfère le snapshot JIRA pour avoir la photo complète à la clôture (Done + reportés).
    // Sprint actif/futur : la base locale est à jour, on l'utilise directement si non-vide.
    const isClosed = sprint.state === 'closed' || (sprint.isCurrent === false && sprint.state !== 'future');
    if (!isClosed && local.length > 0) return local;

    const jiraIds = (sprint.jiraIds && sprint.jiraIds.length)
        ? sprint.jiraIds
        : (sprint.jiraId ? [sprint.jiraId] : []);
    if (!jiraIds.length || !store.get('jiraConfigured')) return local;

    const key = `${sprint.team || 'all'}::${[...jiraIds].sort().join('|')}`;
    if (_jiraSprintTicketsCache.has(key)) return _jiraSprintTicketsCache.get(key);

    toast(`Chargement des tickets de ${sprint.name} depuis JIRA…`, 'info');
    try {
        const results = await Promise.allSettled(jiraIds.map(sid => _fetchAllIssuesForSprint(sid)));
        const all = [];
        const seen = new Set();
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const t of r.value) {
                if (seen.has(t.id)) continue;
                seen.add(t.id);
                // Injecte sprintName/team pour cohérence avec les filtres internes
                all.push({ ...t, sprintName: sprint.name, team: sprint.team || t.team || null });
            }
        }
        _jiraSprintTicketsCache.set(key, all);
        return all;
    } catch (e) {
        console.warn('[Squad-Board] getSprintTicketsAsync échec :', e?.message || e);
        return local;
    }
}
function _resolveCurrentSprint() {
    const team = store.get('team');
    const all = store.get('sprintInfo');
    // Priorité 1 : sprint sélectionné via le picker de la page Sprint (store.sprintPick).
    // Permet d'ouvrir une Sprint Review / Démo sur un sprint passé ou futur depuis le picker.
    const pick = store.get('sprintPick');
    if (pick) {
        const arr = Array.isArray(all?.teamSprints) ? all.teamSprints : [];
        const filtered = (team && team !== 'all') ? arr.filter(s => s.team === team) : arr;
        const chosen = filtered.find(s => s.name === pick);
        if (chosen) {
            return {
                ...chosen,
                team: chosen.team || (team !== 'all' ? team : null),
                isCurrent: chosen.state === 'active',
            };
        }
    }
    // Fallback : sprint actif de l'équipe sélectionnée
    const s = getSprintForTeam(team, all);
    if (!s?.name) return null;
    return { ...s, isCurrent: true };
}
/**
 * Périmètre local d'un sprint — reports compris.
 *
 * Sur un sprint clos, `t.sprintName` ne montre que les tickets RESTÉS, donc uniquement ses
 * réussites : JIRA déplace les non-finis vers le sprint suivant. On reconstitue le périmètre
 * engagé depuis l'historique du champ Sprint (utils/sprint-scope.js) — ce que le snapshot
 * JIRA apportait déjà, mais qui manquait dès que JIRA n'est pas configuré ou joignable.
 *
 * Les reportés sont annotés `_carriedOverTo` (sur une COPIE — jamais de mutation du store) :
 * ils comptent dans l'engagement, mais surtout pas dans le réalisé (voir _sprintStats).
 * Matching sur le nom EXACT (`null`) : sans filtre d'équipe, la tolérance par clé NN.N
 * ferait entrer le sprint homonyme des autres équipes.
 */
function _ticketsOfSprint(sprint) {
    const all = store.get('tickets') || [];
    const teamFilter = sprint.team && sprint.team !== 'all';
    const starts = sprintStartsOf(store.get('sprintInfo'));
    const out = [];
    for (const t of all) {
        if (teamFilter && t.team !== sprint.team) continue;
        if (!engagedInSprint(t, sprint.name, starts, null)) continue;
        const moved = carriedOverTo(t, sprint.name, null);
        out.push(moved ? { ...t, _carriedOverTo: moved } : t);
    }
    return out;
}

/**
 * Statistiques dérivées d'un sprint, SOURCE UNIQUE partagée par la modale et tous ses
 * exports (texte, Markdown, HTML, Demo). Sémantique alignée sur la vue Health :
 *  - `veloPts`   = points des tickets Done locaux en priorité, snapshot JIRA `velocity` en fallback.
 *  - `estimated` = engagement JIRA (Greenhopper `estimated`) ; `engageDistinct` vrai seulement s'il
 *                  diffère du périmètre courant `ptsTotal` (sinon la carte « Engagé » ferait doublon).
 *  - `bufferRealised` = Buffer *réalisé* = points des tickets Buffer Done, fallback snapshot
 *                  `bufferPoints` — même mesure que la colonne 🛡 Buffer de Health.
 *
 * @param {object} sprint
 * @param {Array}  tickets
 */
export function _sprintStats(sprint, tickets) {
    // RÉALISÉ vs ENGAGÉ : un ticket reporté vers un autre sprint (`_carriedOverTo`) reste dans
    // le périmètre engagé, mais n'a PAS été livré ici — même s'il est `done` aujourd'hui, il
    // l'a été ailleurs, après la clôture. L'y compter gonflerait la vélocité rétroactivement.
    const _doneHere = t => t.status === 'done' && !t._carriedOverTo;
    const total     = tickets.length;
    const ptsTotal  = sumBy(tickets, t => t.points);
    const ptsDone   = sumBy(tickets.filter(_doneHere), t => t.points);
    const doneCount = tickets.filter(_doneHere).length;
    const carried      = tickets.filter(t => t._carriedOverTo);
    const carriedCount = carried.length;
    const carriedPts   = sumBy(carried, t => t.points);
    const estimated = sprint.estimated || 0;

    const veloPts        = doneCount ? ptsDone : (sprint.velocity || 0);
    const engagePct      = estimated > 0 ? Math.round((veloPts / estimated) * 100) : null;
    const engageDistinct = estimated > 0 && estimated !== ptsTotal;

    const bufferTickets  = tickets.filter(isBufferItem);
    const bufferPts      = sumBy(bufferTickets, t => t.points);
    const bufDonePts     = sumBy(bufferTickets.filter(_doneHere), t => t.points);
    const bufferRealised = bufDonePts > 0 ? bufDonePts : (sprint.bufferPoints || 0);
    const bufferRealShare = estimated > 0 ? Math.round((bufferRealised / estimated) * 100) : 0;

    return {
        total, ptsTotal, ptsDone, doneCount,
        completionPct: pct(doneCount, total),
        ptsPct: pct(ptsDone, ptsTotal),
        estimated, veloPts, engagePct, engageDistinct,
        bufferTickets, bufferPts, bufferRealised, bufferRealShare,
        carriedCount, carriedPts,
    };
}

/**
 * Complète un objet sprint issu du chart vélocité (`computeVelocityHistory` /
 * `computeCurrentSprintEntry`) avec les champs présents uniquement dans les
 * `teamSprints` bruts — notamment `goal` et `startDate`. Sans ça, la Sprint Review /
 * le mode Demo ouverts depuis la modale affichaient « Aucun objectif explicite… »
 * alors que le chemin palette (`_resolveCurrentSprint`) livre le teamSprint complet.
 * Les champs déjà calculés côté modale (velocity/estimated live) ne sont pas écrasés.
 */
function _enrichSprintMeta(sprint) {
    if (!sprint?.name || (sprint.goal != null && sprint.startDate)) return sprint;
    const arr = store.get('sprintInfo')?.teamSprints;
    if (!Array.isArray(arr)) return sprint;
    const teamOk = s => !sprint.team || sprint.team === 'all' || s.team === sprint.team;
    const match = arr.find(s => s.name === sprint.name && teamOk(s)) || arr.find(s => s.name === sprint.name);
    if (!match) return sprint;
    return {
        goal: match.goal,
        startDate: match.startDate,
        plannedEndDate: match.plannedEndDate,
        completeDate: match.completeDate,
        jiraBoardId: match.jiraBoardId,
        ...sprint,
        endDate: sprint.endDate || match.endDate,
    };
}

/**
 * Ouvre la modal pour un sprint donné.
 *
 * @param {object} sprint  `{ name, team, velocity, estimated, endDate, isCurrent, jiraId, jiraIds }`
 */
export function openSprintTicketsModal(sprint) {
    if (!sprint?.name) return;
    sprint = _enrichSprintMeta(sprint);
    _closeModal();

    // Même périmètre que partout ailleurs (reports compris) — ce filtre était dupliqué ici,
    // et restait donc aveugle aux tickets déplacés par JIRA à la clôture du sprint.
    const tickets = _ticketsOfSprint(sprint);

    // Si pas de tickets en base ET on a un sprint ID JIRA → fetch à la demande
    const jiraIds = (sprint.jiraIds && sprint.jiraIds.length) ? sprint.jiraIds : (sprint.jiraId ? [sprint.jiraId] : []);
    const canFetchFromJira = tickets.length === 0 && jiraIds.length > 0 && store.get('jiraConfigured');
    if (canFetchFromJira) {
        _renderShell(sprint, [], { loading: true });
        _fetchAndRenderFromJira(sprint, jiraIds);
        return;
    }
    _renderShell(sprint, tickets);
}

function _renderShell(sprint, tickets, opts = {}) {
    const fromJira = !!opts.fromJira;
    const loading = !!opts.loading;
    const teamFilter = sprint.team && sprint.team !== 'all';

    // Stats — source unique partagée avec les exports (voir _sprintStats)
    const {
        total, ptsTotal, ptsDone, doneCount, completionPct, ptsPct,
        veloPts, engagePct, engageDistinct, carriedCount, carriedPts,
        bufferTickets, bufferRealised, bufferRealShare,
    } = _sprintStats(sprint, tickets);

    // Groupé par statut, ordre STATUS_ORDER
    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));

    const stateBadge = sprint.isCurrent
        ? '<span class="sb-modal-state sb-modal-state--active">● En cours</span>'
        : '<span class="sb-modal-state sb-modal-state--closed">○ Clôturé</span>';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';

    const overlay = document.createElement('div');
    overlay.id = 'sprint-tickets-overlay';
    overlay.className = 'modal-overlay sb-modal-overlay';
    overlay.innerHTML = `
        <div class="modal sb-modal" role="dialog" aria-modal="true" aria-labelledby="sb-modal-title">
            <div class="modal-header sb-modal-header">
                <h2 id="sb-modal-title">
                    <span class="sb-modal-icon">📊</span>
                    <span class="truncate">${esc(sprint.name)}</span>
                    ${stateBadge}
                </h2>
                <div class="sb-modal-actions">
                    <button class="mdl-nav-btn" id="sb-modal-copy" title="Copier un rapport texte (Slack-friendly)">
                        <svg><use href="#i-copy"/></svg>
                    </button>
                    <button class="mdl-nav-btn sb-modal-dl" id="sb-modal-dl-md" title="Télécharger le rapport en Markdown (.md)">
                        <span class="sb-dl-label">MD</span>
                    </button>
                    <button class="mdl-nav-btn sb-modal-dl" id="sb-modal-dl-html" title="Télécharger le rapport en HTML autonome (.html)">
                        <span class="sb-dl-label">HTML</span>
                    </button>
                    <button class="mdl-nav-btn sb-modal-dl sb-modal-review" id="sb-modal-review" title="Ouvrir le compte-rendu Sprint Review (Confluence-ready) dans un nouvel onglet">
                        <span class="sb-dl-label">📋 Review</span>
                    </button>
                    <button class="mdl-nav-btn sb-modal-dl sb-modal-demo" id="sb-modal-demo" title="Mode Demo fullscreen (présentation TV / Sprint Review)">
                        <span class="sb-dl-label">📺 Demo</span>
                    </button>
                    <button class="mdl-nav-btn" id="sb-modal-close" title="Fermer (Esc)">
                        <svg><use href="#i-x"/></svg>
                    </button>
                </div>
            </div>
            <div class="sb-modal-hdr-meta">
                ${sprint.team ? `<span class="sb-modal-chip">👥 ${esc(sprint.team)}</span>` : ''}
                ${endLabel ? `<span class="sb-modal-chip">📅 fin ${endLabel}</span>` : ''}
                ${sprint.isCurrent ? '<span class="sb-modal-chip sb-modal-chip--warn">Non compté dans les KPIs</span>' : ''}
                ${fromJira ? '<span class="sb-modal-chip sb-modal-chip--info">⚡ Chargé depuis JIRA</span>' : ''}
            </div>
            <div class="sb-modal-stats">
                <div class="sb-stat-card sb-stat-card--primary">
                    <span class="sb-stat-lbl">Vélocité</span>
                    <span class="sb-stat-val">${veloPts}<small>pts</small></span>
                    <span class="sb-stat-sub">${engageDistinct ? `livré / ${sprint.estimated} engagés` : 'livré'}</span>
                </div>
                <div class="sb-stat-card"${carriedCount ? ` title="${esc(`${carriedCount} ticket${carriedCount > 1 ? 's' : ''} (${carriedPts} pts) engagé${carriedCount > 1 ? 's' : ''} sur ce sprint puis reporté${carriedCount > 1 ? 's' : ''} ailleurs — ils comptent dans l'engagement, pas dans le livré`)}"` : ''}>
                    <span class="sb-stat-lbl">Tickets</span>
                    <span class="sb-stat-val">${doneCount}<small>/${total || '—'}</small></span>
                    <span class="sb-stat-sub">${completionPct}% terminés${carriedCount ? ` <span class="sb-stat-carried">↪ ${carriedCount} reporté${carriedCount > 1 ? 's' : ''}</span>` : ''}</span>
                </div>
                <div class="sb-stat-card">
                    <span class="sb-stat-lbl">Story Points</span>
                    <span class="sb-stat-val">${ptsDone}<small>/${ptsTotal || '—'}</small></span>
                    <span class="sb-stat-sub">${ptsPct}% livrés</span>
                </div>
                ${engageDistinct ? `
                <div class="sb-stat-card" title="Story Points engagés en début de sprint (snapshot JIRA Velocity « estimated ») — distinct du périmètre actuel de ${ptsTotal} pts">
                    <span class="sb-stat-lbl">Engagé (estimé)</span>
                    <span class="sb-stat-val">${sprint.estimated}<small>pts</small></span>
                    <span class="sb-stat-sub">${engagePct != null ? `${engagePct}% réalisé` : 'engagement sprint'}</span>
                </div>` : ''}
                <div class="sb-stat-card sb-stat-card--buffer" title="Points des tickets label Buffer terminés (capacité réservée réalisée) — même mesure que la colonne 🛡 Buffer de la vue Health">
                    <span class="sb-stat-lbl">🛡 Buffer</span>
                    <span class="sb-stat-val">${bufferRealised}<small>pts</small></span>
                    <span class="sb-stat-sub">${bufferRealised === 0 ? 'aucun buffer' : `${bufferTickets.length ? `${bufferTickets.length} ticket${bufferTickets.length > 1 ? 's' : ''}` : 'snapshot JIRA'}${bufferRealShare ? ` · ${bufferRealShare}% de l'engagé` : ''}`}</span>
                </div>
            </div>
            ${_canRenderBurndown(sprint, tickets) ? `
            <div class="sb-modal-burndown">
                <div class="sb-modal-burndown-title">📉 Burndown ${sprint.isCurrent ? '(temps réel)' : '(rétrospectif)'}</div>
                <div class="chart-container chart-h-sm"><canvas id="sb-modal-burndown-canvas"></canvas></div>
            </div>` : ''}
            <div class="modal-body sb-modal-body">
                ${loading ? _loadingHtml() : (total === 0 ? _emptyHelpHtml(sprint, opts) : _ticketsListHtml(orderedStatuses, byStatus, fromJira))}
            </div>
        </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
        _maybeRenderBurndown(sprint, tickets);
    });
    _releaseTrap = trapFocus(overlay.querySelector('.sb-modal') || overlay);

    // Events
    overlay.querySelector('#sb-modal-close')?.addEventListener('click', _closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(); });
    // Boutons copier + télécharger — initial render. Re-bindés après fetch JIRA.
    overlay.querySelector('#sb-modal-copy')?.addEventListener('click', () => {
        const txt = _buildSprintReport(sprint, tickets);
        copySlack(txt, 'Rapport sprint');
    });
    overlay.querySelector('#sb-modal-dl-md')?.addEventListener('click', () => {
        const md = _buildSprintReportMd(sprint, tickets);
        _downloadFile(`sprint-${_slug(sprint.name)}-${_today()}.md`, md, 'text/markdown');
    });
    overlay.querySelector('#sb-modal-dl-html')?.addEventListener('click', () => {
        const html = _buildSprintReportHtml(sprint, tickets);
        _downloadFile(`sprint-${_slug(sprint.name)}-${_today()}.html`, html, 'text/html');
    });
    overlay.querySelector('#sb-modal-review')?.addEventListener('click', () => {
        const html = _buildSprintReviewHtml(sprint, tickets);
        _openInNewTab(html);
    });
    overlay.querySelector('#sb-modal-demo')?.addEventListener('click', () => openDemoMode(sprint, tickets));
    overlay.querySelectorAll('[data-ticket-id]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.ticketId;
            const jiraOnly = el.dataset.jiraOnly === '1';
            if (jiraOnly) {
                const base = store.get('jiraUrl');
                if (base) window.open(`${base.replace(/\/$/, '')}/browse/${id}`, '_blank', 'noopener');
                return;
            }
            _closeModal();
            requestAnimationFrame(() => window.__squadBoard?.openTicketModal?.(id));
        });
    });

    const onKey = e => {
        if (e.key === 'Escape' && !ticketModalOnTop()) { _closeModal(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

let _releaseTrap = null; // piège à focus (cf utils.trapFocus)

function _closeModal() {
    if (_releaseTrap) { _releaseTrap(); _releaseTrap = null; }
    const ov = document.getElementById('sprint-tickets-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    ov.addEventListener('transitionend', () => ov.remove(), { once: true });
}

function _ticketsListHtml(orderedStatuses, byStatus, fromJira = false) {
    return `
        <div class="sb-ticket-groups">
            ${orderedStatuses.map(status => {
                const list = byStatus.get(status);
                const label = STATUS_LABELS[status] || status;
                const ptsGroup = sumBy(list, t => t.points);
                return `
                <section class="sb-ticket-group sb-ticket-group--${status}">
                    <header class="sb-group-hdr">
                        <span class="sb-group-dot"></span>
                        <span class="sb-group-name">${esc(label)}</span>
                        <span class="sb-group-count">${list.length}</span>
                        ${ptsGroup > 0 ? `<span class="sb-group-pts">${ptsGroup} pts</span>` : ''}
                    </header>
                    <ul class="sb-ticket-list">
                        ${list.map(t => _ticketRowHtml(t, fromJira)).join('')}
                    </ul>
                </section>`;
            }).join('')}
        </div>`;
}

function _ticketRowHtml(t, fromJira = false) {
    const typeIcon = _typeIcon(t.type, t.labels);
    const priority = t.priority || '';
    const prioCls  = priority ? `sb-ticket-prio sb-ticket-prio--${String(priority).toLowerCase()}` : '';
    const leader   = t.leader || t.assignee || '';
    const title    = fromJira ? `Ouvrir ${esc(t.id)} dans JIRA ↗` : `Ouvrir ${esc(t.id)}`;

    // Flags par label (détection unique → classes CSS + tooltip)
    const lbls = Array.isArray(t.labels) ? t.labels : [];
    const isBuffer = lbls.some(l => /^Buffer$/i.test(l));
    const isRetro  = lbls.some(l => /^ActionRetro$/i.test(l));
    // Reporté vers un autre sprint : engagé ici, livré ailleurs (ou pas encore).
    const moved = t._carriedOverTo || '';
    const rowExtra = [
        isBuffer ? 'sb-ticket-row--buffer' : '',
        isRetro  ? 'sb-ticket-row--retro'  : '',
        moved    ? 'sb-ticket-row--carried' : '',
    ].filter(Boolean).join(' ');
    const iconTip = [
        esc(t.type || 'task'),
        isBuffer ? 'Buffer · capacité réservée' : '',
        isRetro  ? 'Action Retro' : '',
    ].filter(Boolean).join(' · ');

    return `
        <li class="sb-ticket-row ${rowExtra}" data-ticket-id="${esc(t.id)}"${fromJira ? ' data-jira-only="1"' : ''} title="${title}">
            <span class="sb-ticket-icon" title="${iconTip}">${typeIcon}</span>
            <span class="sb-ticket-key">${esc(t.id)}</span>
            <span class="sb-ticket-title">${esc(t.title || '(sans titre)')}</span>
            <div class="sb-ticket-meta">
                ${moved ? `<span class="sb-ticket-tag sb-ticket-tag--carried" title="${esc(`Engagé sur ce sprint puis reporté vers « ${moved} » — non livré ici`)}">↪ ${esc(extractSprintLabel(moved) || moved)}</span>` : ''}
                ${isBuffer ? '<span class="sb-ticket-tag sb-ticket-tag--buffer">Buffer</span>' : ''}
                ${leader ? `<span class="sb-ticket-leader" title="${esc(leader)}">${esc(_initials(leader))}</span>` : ''}
                ${priority ? `<span class="${prioCls}">${esc(priority)}</span>` : ''}
                ${t.points ? `<span class="sb-ticket-pts">${t.points} <small>pts</small></span>` : ''}
            </div>
        </li>`;
}

function _emptyHelpHtml(sprint, opts = {}) {
    if (opts.fetchError) {
        return `
            <div class="sb-modal-empty">
                <span class="sb-modal-empty-icon">⚠️</span>
                <p class="sb-modal-empty-title">Erreur de chargement</p>
                <p class="sb-modal-empty-help">${esc(opts.fetchError)}</p>
            </div>`;
    }
    if (opts.fromJira) {
        return `
            <div class="sb-modal-empty">
                <span class="sb-modal-empty-icon">🫥</span>
                <p class="sb-modal-empty-title">Sprint vide côté JIRA</p>
                <p class="sb-modal-empty-help">L'endpoint JIRA n'a retourné aucune issue pour ce sprint.</p>
            </div>`;
    }
    const isClosed = !sprint.isCurrent;
    return `
        <div class="sb-modal-empty">
            <span class="sb-modal-empty-icon">${isClosed ? '🗄️' : '📭'}</span>
            <p class="sb-modal-empty-title">Aucun ticket en base pour ce sprint</p>
            ${isClosed ? `
            <p class="sb-modal-empty-help">
                La synchronisation ne charge que les tickets du <strong>sprint actif</strong>,
                des <strong>sprints futurs</strong> et des <strong>sprints PI-named</strong>
                (PI28, PI#29…) pour préserver les performances.<br>
                ${store.get('jiraConfigured') ? 'Configure JIRA pour activer le chargement à la demande des tickets des sprints clos.' : ''}
            </p>` : `
            <p class="sb-modal-empty-help">
                Aucun ticket trouvé en base avec <code>sprintName = "${esc(sprint.name)}"</code>${sprint.team ? ` pour l'équipe <strong>${esc(sprint.team)}</strong>` : ''}.
                Relancer une synchronisation peut aider.
            </p>`}
        </div>`;
}

function _loadingHtml() {
    return `
        <div class="sb-modal-loading">
            <div class="sb-modal-spinner"></div>
            <p class="sb-modal-loading-txt">Chargement des tickets depuis JIRA…</p>
        </div>`;
}

// ── Fetch JIRA à la demande pour les sprints clos ─────────────────────────────
async function _fetchAndRenderFromJira(sprint, jiraIds) {
    const overlay = document.getElementById('sprint-tickets-overlay');
    if (!overlay) return;
    // Affiche un loader dans le body
    const body = overlay.querySelector('.sb-modal-body');
    if (body) body.innerHTML = _loadingHtml();

    try {
        // Parallélise les appels (1 par sprint board)
        const results = await Promise.allSettled(
            jiraIds.map(sid => _fetchAllIssuesForSprint(sid))
        );
        const all = [];
        const seen = new Set();
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const t of r.value) {
                if (seen.has(t.id)) continue;
                seen.add(t.id);
                all.push(t);
            }
        }
        // Pas de filtrage côté ticket : sprint board ⇒ équipe déjà résolue par
        // computeVelocityHistory (les jiraIds passés sont déjà filtrés par équipe).
        _rerenderBody(overlay, sprint, all, { fromJira: true });
    } catch (e) {
        _rerenderBody(overlay, sprint, [], { fetchError: e.message || String(e) });
    }
}

async function _fetchAllIssuesForSprint(sprintId) {
    const tickets = [];
    // Champs story points DÉTECTÉS sur l'instance (avant 3.266.0 : ids du client en dur, 10023 / 10026)
    const spIds = await import('../sync-fields.js').then(m => m.storyPointFieldIds()).catch(() => []);
    let startAt = 0;
    for (let i = 0; i < 20; i++) { // hard cap 20 pages × 100 = 2000 tickets
        const resp = await api.jiraGet(`rest/agile/1.0/sprint/${sprintId}/issue`, {
            maxResults: 100,
            startAt,
            fields: ['summary,status,issuetype,priority,assignee,labels,resolutiondate,created,updated', ...spIds].join(','),
        });
        const issues = resp?.issues || [];
        if (!issues.length) break;
        for (const issue of issues) tickets.push(_transformLite(issue, spIds));
        if (issues.length < 100) break;
        startAt += issues.length;
    }
    return tickets;
}

function _transformLite(issue, spIds = []) {
    const f = issue.fields || {};
    const jiraStatus = f.status?.name || '';
    const status = STATUS_MAP[jiraStatus.toLowerCase().trim()] || 'todo';
    return {
        id: issue.key,
        title: f.summary || '',
        type: (f.issuetype?.name || 'task').toLowerCase(),
        status,
        priority: f.priority?.name || '',
        leader: f.assignee?.displayName || '',
        labels: f.labels || [],
        points: spIds.map(id => f[id]).find(v => v != null) || 0,
        team: null, // pas évalué ici (le sprint définit l'équipe)
        // Pour les charts rétrospectifs (burndown, throughput, cycle time)
        resolvedDate: f.resolutiondate || null,
        createdAt:    f.created || null,
        updatedAt:    f.updated || null,
    };
}

function _rerenderBody(overlay, sprint, tickets, opts = {}) {
    // Recalcule stats + groupes et remplace juste le body (préserve l'animation/header).
    // Les stats passent par _sprintStats — les recompter ici les ferait diverger du shell,
    // notamment sur la règle « un ticket reporté ne compte pas dans le livré ».
    const { total, ptsTotal, ptsDone, doneCount, completionPct, ptsPct, carriedCount } =
        _sprintStats(sprint, tickets);
    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));

    // Maj du body
    const body = overlay.querySelector('.sb-modal-body');
    if (body) {
        body.innerHTML = total === 0
            ? _emptyHelpHtml(sprint, opts)
            : _ticketsListHtml(orderedStatuses, byStatus, !!opts.fromJira);
    }

    // Ajoute la chip "Chargé depuis JIRA" si pas déjà là
    if (opts.fromJira) {
        const meta = overlay.querySelector('.sb-modal-hdr-meta');
        if (meta && !meta.querySelector('.sb-modal-chip--info')) {
            meta.insertAdjacentHTML('beforeend',
                '<span class="sb-modal-chip sb-modal-chip--info">⚡ Chargé depuis JIRA</span>');
        }
    }

    // Maj des stats Tickets / SP
    const statCards = overlay.querySelectorAll('.sb-stat-card');
    if (statCards.length >= 3) {
        const tCard = statCards[1];
        const spCard = statCards[2];
        if (tCard) {
            tCard.querySelector('.sb-stat-val').innerHTML = `${doneCount}<small>/${total || '—'}</small>`;
            // innerHTML et non textContent : la mention « ↪ N reportés » doit survivre au
            // rafraîchissement, sinon elle disparaît dès le premier rendu depuis JIRA.
            tCard.querySelector('.sb-stat-sub').innerHTML = `${completionPct}% terminés`
                + (carriedCount ? ` <span class="sb-stat-carried">↪ ${carriedCount} reporté${carriedCount > 1 ? 's' : ''}</span>` : '');
        }
        if (spCard) {
            spCard.querySelector('.sb-stat-val').innerHTML = `${ptsDone}<small>/${ptsTotal || '—'}</small>`;
            spCard.querySelector('.sb-stat-sub').textContent = `${ptsPct}% livrés`;
        }
    }

    // Injecte/rerend le burndown si possible (au cas où il n'était pas dans le shell initial)
    _maybeInjectBurndown(overlay, sprint, tickets);

    // Re-binde les boutons copier + télécharger avec les tickets fraîchement fetchés
    const rebind = (id, handler) => {
        const btn = overlay.querySelector(`#${id}`);
        if (!btn) return;
        const fresh = btn.cloneNode(true);
        btn.replaceWith(fresh);
        fresh.addEventListener('click', handler);
    };
    rebind('sb-modal-copy', () => {
        const txt = _buildSprintReport(sprint, tickets);
        copySlack(txt, 'Rapport sprint');
    });
    rebind('sb-modal-dl-md', () => {
        const md = _buildSprintReportMd(sprint, tickets);
        _downloadFile(`sprint-${_slug(sprint.name)}-${_today()}.md`, md, 'text/markdown');
    });
    rebind('sb-modal-dl-html', () => {
        const html = _buildSprintReportHtml(sprint, tickets);
        _downloadFile(`sprint-${_slug(sprint.name)}-${_today()}.html`, html, 'text/html');
    });
    rebind('sb-modal-review', () => {
        const html = _buildSprintReviewHtml(sprint, tickets);
        _openInNewTab(html);
    });
    rebind('sb-modal-demo', () => openDemoMode(sprint, tickets));

    // Rebrancher les clics tickets (le innerHTML a remplacé les listeners)
    overlay.querySelectorAll('[data-ticket-id]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.ticketId;
            const jiraOnly = el.dataset.jiraOnly === '1';
            if (jiraOnly) {
                const base = store.get('jiraUrl');
                if (base) window.open(`${base.replace(/\/$/, '')}/browse/${id}`, '_blank', 'noopener');
                return;
            }
            _closeModal();
            requestAnimationFrame(() => window.__squadBoard?.openTicketModal?.(id));
        });
    });
}

const _MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
export function _fmtDate(iso) {
    const d = String(iso).slice(0, 10);
    const [y, m, day] = d.split('-').map(Number);
    if (!y) return '';
    return `${day} ${_MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`;
}

function _initials(name) {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
}

// Ouvre du HTML brut dans un nouvel onglet via blob URL
function _openInNewTab(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000); // libère après 1 min
    if (!w) toast('Le navigateur a bloqué l\'ouverture — autorise les popups', 'warning');
    else toast('Sprint Review ouverte dans un nouvel onglet', 'success', 1800);
}

// ── Utilities download ───────────────────────────────────────────────────────
function _downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Téléchargé : ${filename}`, 'success', 1800);
}
function _slug(s) {
    return String(s || 'sprint').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprint';
}
function _today() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function _typeIcon(type, labels = []) {
    // Labels prioritaires (Amélioration continue, transverses)
    if (Array.isArray(labels)) {
        if (labels.some(l => /^Buffer$/i.test(l)))            return '🛡️';  // buffer / capacité réservée
        if (labels.some(l => /^ActionRetro$/i.test(l)))       return '🔁';  // action de rétro
        if (labels.some(l => /^(Postmortem|PostMortem)$/i.test(l))) return '🩺';
        if (labels.some(l => /^(CoP|CommunityOfPractice)$/i.test(l))) return '🤝';
        if (labels.some(l => /^Adapt$/i.test(l)))             return '🔧';
    }
    return TYPE_ICONS[(type || '').toLowerCase()] || '◇';
}
