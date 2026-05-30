/**
 * Sprint tickets modal — liste détaillée des tickets d'un sprint,
 * ouverte au clic sur une barre du chart vélocité.
 *
 * Pour les sprints clos anciens, les tickets ne sont pas dans la base locale
 * (la sync ne charge que sprint actif + futurs + PI-named). On l'indique
 * clairement à l'utilisateur avec un message d'aide.
 */

import { store } from '../state.js';
import { esc, pct, sumBy, toast, copyToClipboard, getSprintForTeam } from '../utils.js';
import { STATUS_LABELS, STATUS_ORDER, STATUS_MAP } from '../config.js';
import * as api from '../api.js';
import { renderBurndown, renderBurnup } from './charts.js';

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
function _ticketsOfSprint(sprint) {
    const all = store.get('tickets') || [];
    const teamFilter = sprint.team && sprint.team !== 'all';
    return all.filter(t => {
        const sn = t.sprintName || t.sprint_name;
        if (sn !== sprint.name) return false;
        if (teamFilter && t.team !== sprint.team) return false;
        return true;
    });
}

/**
 * Ouvre la modal pour un sprint donné.
 *
 * @param {object} sprint  `{ name, team, velocity, estimated, endDate, isCurrent, jiraId, jiraIds }`
 */
export function openSprintTicketsModal(sprint) {
    if (!sprint?.name) return;
    _closeModal();

    const allTickets = store.get('tickets') || [];
    const teamFilter = sprint.team && sprint.team !== 'all';
    const tickets = allTickets.filter(t => {
        const sn = t.sprintName || t.sprint_name;
        if (sn !== sprint.name) return false;
        if (teamFilter && t.team !== sprint.team) return false;
        return true;
    });

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

    // Stats
    const total = tickets.length;
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const doneCount = tickets.filter(t => t.status === 'done').length;
    const completionPct = pct(doneCount, total);
    const ptsPct = pct(ptsDone, ptsTotal);

    // Buffer label : somme des points des tickets ayant le label "Buffer"
    const bufferTickets = tickets.filter(t => (t.labels || []).some(l => /^Buffer$/i.test(l)));
    const bufferPts = sumBy(bufferTickets, t => t.points);
    const bufferShare = sprint.estimated > 0 ? Math.round((bufferPts / sprint.estimated) * 100) : 0;

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
        <div class="modal sb-modal" role="dialog" aria-labelledby="sb-modal-title">
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
                    <span class="sb-stat-val">${sprint.velocity || ptsDone}<small>pts</small></span>
                    <span class="sb-stat-sub">livré${sprint.estimated ? ` / ${sprint.estimated} estimés` : ''}</span>
                </div>
                <div class="sb-stat-card">
                    <span class="sb-stat-lbl">Tickets</span>
                    <span class="sb-stat-val">${doneCount}<small>/${total || '—'}</small></span>
                    <span class="sb-stat-sub">${completionPct}% terminés</span>
                </div>
                <div class="sb-stat-card">
                    <span class="sb-stat-lbl">Story Points</span>
                    <span class="sb-stat-val">${ptsDone}<small>/${ptsTotal || '—'}</small></span>
                    <span class="sb-stat-sub">${ptsPct}% livrés</span>
                </div>
                ${sprint.estimated && sprint.velocity ? `
                <div class="sb-stat-card sb-stat-card--buffer" title="Total des Story Points engagés en début de sprint (snapshot JIRA Velocity)">
                    <span class="sb-stat-lbl">Buffer (estimé)</span>
                    <span class="sb-stat-val">${sprint.estimated}<small>pts</small></span>
                    <span class="sb-stat-sub">${Math.round((sprint.velocity / sprint.estimated) * 100)}% réalisé</span>
                </div>` : ''}
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

    // Events
    overlay.querySelector('#sb-modal-close')?.addEventListener('click', _closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(); });
    // Boutons copier + télécharger — initial render. Re-bindés après fetch JIRA.
    overlay.querySelector('#sb-modal-copy')?.addEventListener('click', () => {
        const txt = _buildSprintReport(sprint, tickets);
        copyToClipboard(txt, 'Rapport sprint');
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
        if (e.key === 'Escape') { _closeModal(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

function _closeModal() {
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
    const rowExtra = [
        isBuffer ? 'sb-ticket-row--buffer' : '',
        isRetro  ? 'sb-ticket-row--retro'  : '',
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
    let startAt = 0;
    for (let i = 0; i < 20; i++) { // hard cap 20 pages × 100 = 2000 tickets
        const resp = await api.jiraGet(`rest/agile/1.0/sprint/${sprintId}/issue`, {
            maxResults: 100,
            startAt,
            fields: 'summary,status,issuetype,priority,assignee,labels,resolutiondate,created,updated,customfield_10023,customfield_10026',
        });
        const issues = resp?.issues || [];
        if (!issues.length) break;
        for (const issue of issues) tickets.push(_transformLite(issue));
        if (issues.length < 100) break;
        startAt += issues.length;
    }
    return tickets;
}

function _transformLite(issue) {
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
        points: f.customfield_10023 || f.customfield_10026 || 0,
        team: null, // pas évalué ici (le sprint définit l'équipe)
        // Pour les charts rétrospectifs (burndown, throughput, cycle time)
        resolvedDate: f.resolutiondate || null,
        createdAt:    f.created || null,
        updatedAt:    f.updated || null,
    };
}

function _rerenderBody(overlay, sprint, tickets, opts = {}) {
    // Recalcule stats + groupes et remplace juste le body (préserve l'animation/header)
    const total = tickets.length;
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const doneCount = tickets.filter(t => t.status === 'done').length;
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
            tCard.querySelector('.sb-stat-sub').textContent = `${pct(doneCount, total)}% terminés`;
        }
        if (spCard) {
            spCard.querySelector('.sb-stat-val').innerHTML = `${ptsDone}<small>/${ptsTotal || '—'}</small>`;
            spCard.querySelector('.sb-stat-sub').textContent = `${pct(ptsDone, ptsTotal)}% livrés`;
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
        copyToClipboard(txt, 'Rapport sprint');
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
function _fmtDate(iso) {
    const d = String(iso).slice(0, 10);
    const [y, m, day] = d.split('-').map(Number);
    if (!y) return '';
    return `${day} ${_MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`;
}

function _initials(name) {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
}

// ── Burndown du sprint dans la modale ────────────────────────────────────────
// Reprend `renderBurndown` du composant charts : courbe idéale + réelle + tickets.
// Pour un sprint clos, le today marker n'apparaît pas (todayIdx < 0) — on voit
// l'avancement vs idéal de manière rétrospective.
function _canRenderBurndown(sprint, tickets) {
    if (!sprint?.startDate || !sprint?.endDate) return false;
    if (!tickets?.length) return false;
    // Doit avoir au moins quelques points pour que la courbe ait du sens
    return tickets.some(t => (t.points || 0) > 0);
}

function _sprintDurationDays(sprint) {
    if (!sprint?.startDate || !sprint?.endDate) return 14;
    const start = new Date(String(sprint.startDate).slice(0, 10)).getTime();
    const end   = new Date(String(sprint.endDate).slice(0, 10)).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return 14;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function _maybeRenderBurndown(sprint, tickets) {
    if (!_canRenderBurndown(sprint, tickets)) return;
    const sprintArg = {
        startDate: sprint.startDate,
        endDate:   sprint.endDate,
        durationDays: _sprintDurationDays(sprint),
    };
    try { renderBurndown('sb-modal-burndown-canvas', tickets, sprintArg); }
    catch (e) { console.warn('[Squad-Board] Burndown modal : échec', e.message); }
}

function _maybeInjectBurndown(overlay, sprint, tickets) {
    if (!_canRenderBurndown(sprint, tickets)) return;
    // Si le canvas existe déjà (shell initial avait des tickets) → juste re-render
    let canvas = overlay.querySelector('#sb-modal-burndown-canvas');
    if (!canvas) {
        // Injecte le bloc burndown avant le body
        const body = overlay.querySelector('.sb-modal-body');
        if (!body) return;
        const html = `
            <div class="sb-modal-burndown">
                <div class="sb-modal-burndown-title">📉 Burndown ${sprint.isCurrent ? '(temps réel)' : '(rétrospectif)'}</div>
                <div class="chart-container chart-h-sm"><canvas id="sb-modal-burndown-canvas"></canvas></div>
            </div>`;
        body.insertAdjacentHTML('beforebegin', html);
    }
    _maybeRenderBurndown(sprint, tickets);
}

// ── Rapport texte simple (compatible Slack/Teams/mail sans dépendre du mrkdwn) ──
// Pas de `*` ni `_` ni `<URL|TEXT>` : ces formats apparaissent en littéral si
// l'option "Format messages with markup" est désactivée côté Slack, et l'URL
// avec `|` est encodée en `%7C` à la copie → format cassé. On utilise donc des
// URL brutes (auto-linkifiées par Slack) et des séparateurs visuels.
function _buildSprintReport(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'en cours' : 'clôturé';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const teamLabel = sprint.team ? ` · ${sprint.team}` : '';
    const jiraBase = store.get('jiraUrl');
    const jiraUrl = (key) => {
        if (!key) return '';
        if (!jiraBase) return key;
        return `${jiraBase.replace(/\/$/, '')}/browse/${key}`;
    };

    const total = tickets.length;
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const doneCount = tickets.filter(t => t.status === 'done').length;

    const bufferTickets = tickets.filter(t => (t.labels || []).some(l => /^Buffer$/i.test(l)));
    const bufferPts = sumBy(bufferTickets, t => t.points);
    const bufferShare = sprint.estimated > 0 ? Math.round((bufferPts / sprint.estimated) * 100) : 0;
    const realisedPct = sprint.estimated > 0 ? Math.round(((sprint.velocity || ptsDone) / sprint.estimated) * 100) : null;

    const lines = [];
    // Entête
    lines.push(`📊 ${sprint.name} — ${stateLabel}${teamLabel}${endLabel ? ` · fin ${endLabel}` : ''}`);
    lines.push('');
    // Stats sur une seule ligne
    const statRow = [];
    if (sprint.estimated > 0) statRow.push(`Buffer (estimé) : ${sprint.estimated} pts`);
    statRow.push(`Vélocité : ${sprint.velocity || ptsDone} pts${realisedPct != null ? ` (${realisedPct}% réalisé)` : ''}`);
    if (bufferPts > 0) statRow.push(`🛡️ Tickets Buffer : ${bufferPts} pts${bufferShare ? ` (${bufferShare}% du buffer estimé)` : ''}`);
    lines.push('• ' + statRow.join('  ·  '));
    lines.push(`• Tickets : ${doneCount}/${total || '—'} terminés  ·  Story Points : ${ptsDone}/${ptsTotal || '—'}`);
    lines.push('');

    // Groupes par statut
    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));
    const statusEmoji = { todo: '◻️', inprog: '🔄', review: '🔍', test: '🧪', blocked: '⛔', done: '✅' };

    for (const status of orderedStatuses) {
        const group = byStatus.get(status);
        const ptsGroup = sumBy(group, t => t.points);
        const label = STATUS_LABELS[status] || status;
        const emoji = statusEmoji[status] || '◇';
        const ticketStr = `${group.length} ticket${group.length > 1 ? 's' : ''}`;
        lines.push(`${emoji} ${label} — ${ticketStr}${ptsGroup > 0 ? ` · ${ptsGroup} pts` : ''}`);
        for (const t of group) {
            const typeIcon = _typeIcon(t.type, t.labels);
            const ptsStr = t.points ? ` · ${t.points} pts` : '';
            const leader = (t.leader || t.assignee) ? ` · ${t.leader || t.assignee}` : '';
            const url = jiraUrl(t.id);
            // URL brute → Slack auto-link. Titre tronqué pour éviter la surcharge.
            const titleTrunc = (t.title || '(sans titre)').length > 70
                ? (t.title || '').slice(0, 70).trim() + '…'
                : (t.title || '(sans titre)');
            lines.push(`  • ${typeIcon} ${url} — ${titleTrunc}${ptsStr}${leader}`);
        }
        lines.push('');
    }

    if (total === 0) {
        lines.push('(Aucun ticket en base — relancer une synchro ou ouvrir la modal pour fetcher depuis JIRA.)');
    }
    return lines.join('\n').trim();
}

// ── Rapport Markdown enrichi (GitHub/GitLab/Confluence/VSCode-friendly) ─────
function _buildSprintReportMd(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'en cours' : 'clôturé';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const teamLabel = sprint.team ? ` · **${sprint.team}**` : '';
    const jiraBase = store.get('jiraUrl');
    const jiraLink = (key) => !jiraBase || !key ? `\`${key}\`` :
        `[\`${key}\`](${jiraBase.replace(/\/$/, '')}/browse/${key})`;

    const total = tickets.length;
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const doneCount = tickets.filter(t => t.status === 'done').length;
    const bufferTickets = tickets.filter(t => (t.labels || []).some(l => /^Buffer$/i.test(l)));
    const bufferPts = sumBy(bufferTickets, t => t.points);
    const bufferShare = sprint.estimated > 0 ? Math.round((bufferPts / sprint.estimated) * 100) : 0;
    const realisedPct = sprint.estimated > 0 ? Math.round(((sprint.velocity || ptsDone) / sprint.estimated) * 100) : null;

    const lines = [];
    lines.push(`# 📊 ${sprint.name}`);
    lines.push('');
    lines.push(`> **État :** ${stateLabel}${teamLabel}${endLabel ? ` · *fin ${endLabel}*` : ''}`);
    lines.push('');
    lines.push('## Indicateurs');
    lines.push('');
    lines.push('| Métrique | Valeur |');
    lines.push('|---|---|');
    if (sprint.estimated > 0) lines.push(`| Buffer (estimé) | **${sprint.estimated} pts** |`);
    lines.push(`| Vélocité (livré) | **${sprint.velocity || ptsDone} pts**${realisedPct != null ? ` *(${realisedPct}% réalisé)*` : ''} |`);
    if (bufferPts > 0) lines.push(`| 🛡️ Tickets Buffer | **${bufferPts} pts**${bufferShare ? ` *(${bufferShare}% du buffer estimé)*` : ''} |`);
    lines.push(`| Tickets terminés | **${doneCount}/${total || '—'}** |`);
    lines.push(`| Story Points livrés | **${ptsDone}/${ptsTotal || '—'}** |`);
    lines.push('');

    // Groupes par statut sous forme de sections + tableaux
    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));
    const statusEmoji = { todo: '◻️', inprog: '🔄', review: '🔍', test: '🧪', blocked: '⛔', done: '✅' };

    for (const status of orderedStatuses) {
        const group = byStatus.get(status);
        const ptsGroup = sumBy(group, t => t.points);
        const label = STATUS_LABELS[status] || status;
        const emoji = statusEmoji[status] || '◇';
        lines.push(`## ${emoji} ${label} — ${group.length} ticket${group.length > 1 ? 's' : ''}${ptsGroup > 0 ? ` · ${ptsGroup} pts` : ''}`);
        lines.push('');
        lines.push('| Type | Ticket | Titre | Points | Assigné·e |');
        lines.push('|---|---|---|---|---|');
        for (const t of group) {
            const tIcon = _typeIcon(t.type, t.labels);
            const title = (t.title || '(sans titre)').replace(/\|/g, '\\|');
            const pts = t.points || '—';
            const leader = (t.leader || t.assignee) || '—';
            lines.push(`| ${tIcon} | ${jiraLink(t.id)} | ${title} | ${pts} | ${leader} |`);
        }
        lines.push('');
    }

    if (total === 0) {
        lines.push('> *Aucun ticket en base — relancer une synchro ou ouvrir la modale pour fetcher depuis JIRA.*');
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Généré le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} via Squad Board*`);
    return lines.join('\n');
}

// ── Rapport HTML autonome (ouvrable navigateur, imprimable, Confluence-ready) ──
function _buildSprintReportHtml(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'en cours' : 'clôturé';
    const stateColor = sprint.isCurrent ? '#10b981' : '#94a3b8';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const jiraBase = store.get('jiraUrl');
    const link = (key) => !jiraBase || !key
        ? `<span class="key">${esc(key)}</span>`
        : `<a class="key" href="${jiraBase.replace(/\/$/, '')}/browse/${esc(key)}" target="_blank" rel="noopener">${esc(key)}</a>`;

    const total = tickets.length;
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const doneCount = tickets.filter(t => t.status === 'done').length;
    const bufferTickets = tickets.filter(t => (t.labels || []).some(l => /^Buffer$/i.test(l)));
    const bufferPts = sumBy(bufferTickets, t => t.points);
    const bufferShare = sprint.estimated > 0 ? Math.round((bufferPts / sprint.estimated) * 100) : 0;
    const realisedPct = sprint.estimated > 0 ? Math.round(((sprint.velocity || ptsDone) / sprint.estimated) * 100) : null;

    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));
    const statusEmoji = { todo: '◻️', inprog: '🔄', review: '🔍', test: '🧪', blocked: '⛔', done: '✅' };
    const statusColor = { todo: '#94a3b8', inprog: '#3b82f6', review: '#8b5cf6', test: '#06b6d4', blocked: '#ef4444', done: '#10b981' };

    const burndownSvg = _miniBurndownSvg(sprint, tickets);

    const groupsHtml = orderedStatuses.map(status => {
        const group = byStatus.get(status);
        const ptsGroup = sumBy(group, t => t.points);
        const label = STATUS_LABELS[status] || status;
        const emoji = statusEmoji[status] || '◇';
        const color = statusColor[status] || '#94a3b8';
        const rows = group.map(t => {
            const tIcon = _typeIcon(t.type, t.labels);
            const bufferTag = (t.labels || []).some(l => /^Buffer$/i.test(l)) ? ' <span class="tag tag-buffer">🛡️ Buffer</span>' : '';
            const retroTag = (t.labels || []).some(l => /^ActionRetro$/i.test(l)) ? ' <span class="tag tag-retro">🔁 Retro</span>' : '';
            return `<tr>
                <td class="ic">${tIcon}</td>
                <td>${link(t.id)}${bufferTag}${retroTag}</td>
                <td>${esc(t.title || '(sans titre)')}</td>
                <td class="num">${t.points || '—'}</td>
                <td>${esc((t.leader || t.assignee) || '—')}</td>
            </tr>`;
        }).join('');
        return `
            <section class="g">
                <h2 style="border-left-color:${color}">
                    ${emoji} ${esc(label)} <small>— ${group.length} ticket${group.length > 1 ? 's' : ''}${ptsGroup > 0 ? ` · ${ptsGroup} pts` : ''}</small>
                </h2>
                <table>
                    <thead><tr><th>Type</th><th>Clé</th><th>Titre</th><th>Pts</th><th>Assigné·e</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport sprint — ${esc(sprint.name)}</title>
<style>
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 980px; margin: 24px auto; padding: 0 20px; color: #0f172a; line-height: 1.5; }
header.hdr { border-left: 4px solid #3b82f6; padding: 8px 16px 8px 18px; background: linear-gradient(90deg, #f1f5f9, #fff); margin-bottom: 24px; border-radius: 0 8px 8px 0; }
h1 { margin: 0 0 6px; font-size: 22px; }
.state { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; color: #fff; background: ${stateColor}; text-transform: uppercase; letter-spacing: .04em; margin-right: 8px; vertical-align: 2px; }
.meta { color: #64748b; font-size: 13px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 18px 0 28px; }
.stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.stat .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
.stat .val { font-size: 22px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.stat .val small { font-size: 11px; font-weight: 500; color: #94a3b8; margin-left: 3px; }
.stat .sub { font-size: 10px; color: #94a3b8; }
.stat--primary { background: linear-gradient(135deg, #dbeafe, #fff); border-color: #93c5fd; }
.stat--primary .val { color: #1d4ed8; }
.stat--engagement { background: linear-gradient(135deg, #f1f5f9, #fff); border-color: #cbd5e1; }
.stat--engagement .val { color: #475569; }
.stat--buffer { background: repeating-linear-gradient(135deg, rgba(139,92,246,.16) 0 6px, rgba(139,92,246,.06) 6px 12px); border-color: #c4b5fd; }
.stat--buffer .val { color: #6d28d9; }
.burndown { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 0 0 28px; }
.burndown h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
section.g { margin-bottom: 24px; }
section.g h2 { font-size: 15px; padding: 6px 12px; border-left: 4px solid; background: #f8fafc; border-radius: 0 6px 6px 0; margin: 0 0 8px; }
section.g h2 small { color: #64748b; font-weight: 400; font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 7px 10px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
tr:hover td { background: #f8fafc; }
.ic { width: 28px; text-align: center; font-size: 14px; }
.key { font-family: ui-monospace, "SF Mono", monospace; font-size: 12px; color: #1d4ed8; text-decoration: none; }
.key:hover { text-decoration: underline; }
.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.tag { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; margin-left: 4px; }
.tag-buffer { background: rgba(139,92,246,.16); color: #6d28d9; }
.tag-retro { background: rgba(245,158,11,.16); color: #b45309; }
footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
@media print {
    body { margin: 0; padding: 12px; }
    section.g { page-break-inside: avoid; }
    a.key { color: #1d4ed8; text-decoration: underline; }
}
</style>
</head>
<body>
<header class="hdr">
    <h1><span class="state">${esc(stateLabel)}</span>📊 ${esc(sprint.name)}</h1>
    <div class="meta">
        ${sprint.team ? `👥 <strong>${esc(sprint.team)}</strong>` : ''}
        ${endLabel ? ` · 📅 fin ${esc(endLabel)}` : ''}
    </div>
</header>

<div class="stats">
    <div class="stat stat--primary">
        <div class="lbl">Vélocité</div>
        <div class="val">${sprint.velocity || ptsDone}<small>pts</small></div>
        <div class="sub">livré${sprint.estimated ? ` · ${realisedPct}% du plan` : ''}</div>
    </div>
    ${sprint.estimated ? `
    <div class="stat stat--buffer">
        <div class="lbl">▮ Buffer (estimé)</div>
        <div class="val">${sprint.estimated}<small>pts</small></div>
        <div class="sub">snapshot JIRA</div>
    </div>` : ''}
    ${bufferPts > 0 ? `
    <div class="stat stat--buffer-label">
        <div class="lbl">🛡️ Tickets Buffer</div>
        <div class="val">${bufferPts}<small>pts</small></div>
        <div class="sub">${bufferTickets.length} ticket${bufferTickets.length > 1 ? 's' : ''}${bufferShare ? ` · ${bufferShare}% du buffer estimé` : ''}</div>
    </div>` : ''}
    <div class="stat">
        <div class="lbl">Tickets</div>
        <div class="val">${doneCount}<small>/${total || '—'}</small></div>
        <div class="sub">${pct(doneCount, total)}% terminés</div>
    </div>
    <div class="stat">
        <div class="lbl">Story Points</div>
        <div class="val">${ptsDone}<small>/${ptsTotal || '—'}</small></div>
        <div class="sub">${pct(ptsDone, ptsTotal)}% livrés</div>
    </div>
</div>

${burndownSvg ? `<div class="burndown"><h3>📉 Burndown</h3>${burndownSvg}</div>` : ''}

${total === 0 ? '<p style="text-align:center;color:#94a3b8;font-style:italic;padding:40px 0">Aucun ticket à afficher.</p>' : groupsHtml}

<footer>Généré le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} via <strong>Squad Board</strong></footer>
</body>
</html>`;
}

// SVG burndown mini autonome (idéale vs réelle linéaire)
function _miniBurndownSvg(sprint, tickets) {
    if (!sprint?.startDate || !sprint?.endDate || !tickets?.length) return '';
    const start = new Date(String(sprint.startDate).slice(0, 10)).getTime();
    const end   = new Date(String(sprint.endDate).slice(0, 10)).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return '';
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    if (ptsTotal === 0) return '';

    const W = 880, H = 200, PAD = 30;
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    const xAt = i => PAD + (i / (days - 1)) * innerW;
    const yAt = v => PAD + (1 - v / ptsTotal) * innerH;

    // Idéale : ligne droite de ptsTotal à 0
    const idealPath = `M ${xAt(0)} ${yAt(ptsTotal)} L ${xAt(days - 1)} ${yAt(0)}`;
    // Réelle : approximation linéaire jusqu'à aujourd'hui (cd = current day, cap clamp)
    const now = Date.now();
    const cd = Math.max(0, Math.min(days - 1, Math.floor((now - start) / 86400000)));
    const points = [];
    for (let i = 0; i <= cd; i++) {
        const remaining = Math.round(ptsTotal - (ptsDone * i / Math.max(1, cd)));
        points.push(`${xAt(i)},${yAt(remaining)}`);
    }
    const realPath = `M ${points.join(' L ')}`;

    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:200px" xmlns="http://www.w3.org/2000/svg">
        <rect x="${PAD}" y="${PAD}" width="${innerW}" height="${innerH}" fill="#fff" stroke="#e2e8f0"/>
        <line x1="${PAD}" y1="${yAt(ptsTotal / 2)}" x2="${W - PAD}" y2="${yAt(ptsTotal / 2)}" stroke="#f1f5f9"/>
        <path d="${idealPath}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 5" fill="none"/>
        <path d="${realPath}" stroke="#0284c7" stroke-width="2.5" fill="none"/>
        <text x="${PAD}" y="${PAD - 8}" font-size="10" fill="#64748b">${ptsTotal} pts</text>
        <text x="${PAD}" y="${H - 8}" font-size="10" fill="#64748b">J1</text>
        <text x="${W - PAD}" y="${H - 8}" font-size="10" fill="#64748b" text-anchor="end">J${days}</text>
        <text x="${W - PAD}" y="${PAD - 8}" font-size="10" fill="#0284c7" text-anchor="end" font-weight="600">Réel · ${ptsDone}/${ptsTotal} pts</text>
    </svg>`;
}

// ── Mode Demo fullscreen — présentation TV pour Sprint Review ─────────────
// Affiche en plein écran les wins du sprint en gros pour une démo en salle.
// Auto-scroll des tickets, navigation flèches, ESC pour quitter.
export function openDemoMode(sprint, tickets) {
    const existing = document.getElementById('demo-mode-overlay');
    if (existing) existing.remove();

    const total = tickets.length;
    const doneTickets = tickets.filter(t => t.status === 'done')
        .sort((a, b) => (b.points || 0) - (a.points || 0));
    const ptsDone = sumBy(doneTickets, t => t.points);
    const ptsTotal = sumBy(tickets, t => t.points);
    const realisedPct = sprint.estimated > 0
        ? Math.round(((sprint.velocity || ptsDone) / sprint.estimated) * 100)
        : pct(ptsDone, ptsTotal);
    const stateLabel = sprint.isCurrent ? 'En cours' : 'Clôturé';

    // PI Objectives — filtrés par équipe si sprint.team défini, sinon tous
    const piInfo = store.get('piInfo');
    const piObjs = (piInfo?.objectives || [])
        .filter(o => (o.text || '').trim())
        .filter(o => !sprint.team || sprint.team === 'all' || !o.team || o.team === sprint.team);
    const _bv = o => Math.max(0, Math.min(10, parseInt(o.bv) || 0));
    const commitObjs   = piObjs.filter(o => o.committed);
    const stretchObjs  = piObjs.filter(o => !o.committed);
    const commitTotal  = sumBy(commitObjs, _bv);
    const commitDone   = sumBy(commitObjs.filter(o => o.status === 'done'), _bv);
    const stretchDone  = sumBy(stretchObjs.filter(o => o.status === 'done'), _bv);
    const piScore      = commitTotal > 0 ? Math.round(((commitDone + stretchDone) / commitTotal) * 100) : null;

    // Sous-totaux Buffer / Retro pour les badges du header Réalisations
    const _hasLbl = (t, rx) => (t.labels || []).some(l => rx.test(l));
    const bufferTicketsDemo = tickets.filter(t => _hasLbl(t, /^Buffer$/i));
    const doneBufferDemo    = bufferTicketsDemo.filter(t => t.status === 'done');
    const bufferPtsTotalDemo = sumBy(bufferTicketsDemo, t => t.points);
    const bufferPtsDoneDemo  = sumBy(doneBufferDemo, t => t.points);
    const doneActionRetroDemo = doneTickets.filter(t => _hasLbl(t, /^ActionRetro$/i));

    // Mood + Fist of Five (filtrés par sprint + équipe) — match tolérant sur piSprint
    const _sprintLabelDemo = (String(sprint.name || '').match(/(\d+\.\d+)/) || [])[1] || '';
    const _matchDemoVoteSprint = (vps) => {
        if (!vps) return false;
        if (vps === sprint.name) return true;
        if (_sprintLabelDemo && (vps === _sprintLabelDemo || vps.includes(_sprintLabelDemo))) return true;
        return sprint.name && (vps.includes(sprint.name) || sprint.name.includes(vps));
    };
    const _voteFilterDemo = (v) => (!sprint.team || sprint.team === 'all' || v.team === sprint.team)
                                && _matchDemoVoteSprint(v.piSprint);
    const _voteStatsDemo = (arr) => {
        if (!arr.length) return null;
        const dist = [0, 0, 0, 0, 0, 0];
        let sum = 0;
        for (const v of arr) {
            const n = parseInt(v.value) || 0;
            if (n >= 1 && n <= 5) { dist[n]++; sum += n; }
        }
        return { avg: Math.round((sum / arr.length) * 10) / 10, count: arr.length, dist };
    };
    const moodStatsDemo = _voteStatsDemo((store.get('moodVotes') || []).filter(_voteFilterDemo));
    const fistStatsDemo = _voteStatsDemo((store.get('fistVotes') || []).filter(_voteFilterDemo));
    const _voteFaceDemo = (n) => ({ 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }[Math.round(n)] || '❓');
    const _voteColorDemo = (n) => n >= 4 ? '#10b981' : n >= 3 ? '#f59e0b' : '#ef4444';

    // Events du sprint (faits marquants) pour annoter le burnup
    const allEvents = store.get('events') || [];
    const sStart = sprint.startDate ? new Date(sprint.startDate).getTime() : null;
    const sEnd   = sprint.endDate ? new Date(sprint.endDate).getTime() : null;
    const sprintEvents = (sStart && sEnd)
        ? allEvents.filter(e => {
            const t = e.startDate ? new Date(e.startDate).getTime() : null;
            return t && t >= sStart && t <= sEnd;
          })
        : [];

    const overlay = document.createElement('div');
    overlay.id = 'demo-mode-overlay';
    overlay.className = 'demo-mode-overlay';
    overlay.innerHTML = `
        <button class="demo-mode-close" title="Quitter (Esc)" aria-label="Fermer">✕</button>
        <div class="demo-mode-content">
            <div class="demo-mode-bg"></div>
            <header class="demo-hdr">
                <div class="demo-hdr-left">
                    <div class="demo-state">${esc(stateLabel)}</div>
                    <h1 class="demo-title">${esc(sprint.name)}</h1>
                    ${sprint.team ? `<div class="demo-team">👥 ${esc(sprint.team)}</div>` : ''}
                </div>
                ${(sprint.goal || moodStatsDemo) ? `
                <div class="demo-goal-card" title="Sprint Goal">
                    ${sprint.goal ? `
                    <div class="demo-goal-card-label">🎯 Sprint Goal</div>
                    <div class="demo-goal-card-text">${esc(sprint.goal)}</div>
                    ` : '<div class="demo-goal-card-label demo-goal-card-label--empty">Aucun objectif explicite</div>'}
                    ${moodStatsDemo ? `
                    <div class="demo-mood-inline" title="Mood Meter — ${moodStatsDemo.count} vote${moodStatsDemo.count > 1 ? 's' : ''}">
                        <span class="demo-mood-inline-icon">🎭</span>
                        <span class="demo-mood-inline-face">${_voteFaceDemo(moodStatsDemo.avg)}</span>
                        <span class="demo-mood-inline-val" style="color:${_voteColorDemo(moodStatsDemo.avg)}">${moodStatsDemo.avg}<small>/5</small></span>
                        <span class="demo-mood-inline-bars">${(() => {
                            const maxC = Math.max(...[1,2,3,4,5].map(n => moodStatsDemo.dist[n]), 1);
                            return [1,2,3,4,5].map(n => {
                                const c = moodStatsDemo.dist[n];
                                const h = Math.max(15, Math.round((c / maxC) * 100));
                                return `<span class="demo-mood-inline-bar" style="height:${h}%;background:${_voteColorDemo(n)}" title="${_voteFaceDemo(n)} ${n}/5 : ${c}"></span>`;
                            }).join('');
                        })()}</span>
                        <span class="demo-mood-inline-count">${moodStatsDemo.count}</span>
                    </div>` : ''}
                </div>` : ''}
            </header>

            <div class="demo-stats">
                <div class="demo-stat demo-stat--big">
                    <div class="demo-stat-val">${sprint.velocity || ptsDone}</div>
                    <div class="demo-stat-lbl">Story Points livrés</div>
                </div>
                <div class="demo-stat">
                    <div class="demo-stat-val">${doneTickets.length}<span class="demo-stat-sub">/${total || '—'}</span></div>
                    <div class="demo-stat-lbl">Tickets terminés</div>
                </div>
                ${sprint.estimated ? `
                <div class="demo-stat">
                    <div class="demo-stat-val">${realisedPct}%</div>
                    <div class="demo-stat-lbl">de l'engagement</div>
                </div>` : ''}
                ${bufferTicketsDemo.length ? `
                <div class="demo-stat demo-stat--buffer" title="Tickets portant le label Buffer — capacité réservée. ${doneBufferDemo.length}/${bufferTicketsDemo.length} terminés, ${bufferPtsDoneDemo}/${bufferPtsTotalDemo} pts livrés.">
                    <div class="demo-stat-val">${doneBufferDemo.length}<span class="demo-stat-sub">/${bufferTicketsDemo.length}</span></div>
                    <div class="demo-stat-lbl">🛡️ Buffer · ${bufferPtsDoneDemo}/${bufferPtsTotalDemo} pts</div>
                </div>` : ''}
                ${piScore != null ? `
                <div class="demo-stat demo-stat--pi">
                    <div class="demo-stat-val">${piScore}%</div>
                    <div class="demo-stat-lbl">PI Predictabilité</div>
                </div>` : ''}
            </div>

            ${piObjs.length ? `
            <section class="demo-pi-objectives">
                <h2>🎯 PI Objectives ${piInfo?.number ? `<small>PI ${piInfo.number}</small>` : ''}
                    <small class="demo-pi-summary">
                        ✓ ${piObjs.filter(o => o.status === 'done').length}/${piObjs.length}
                        ${commitTotal > 0 ? ` · BV livrée ${commitDone + stretchDone}/${commitTotal}` : ''}
                    </small>
                    ${fistStatsDemo ? `
                    <span class="demo-fist-inline" title="Fist of Five — confiance PI · ${fistStatsDemo.count} vote${fistStatsDemo.count > 1 ? 's' : ''}">
                        <span class="demo-fist-inline-icon">✊</span>
                        <span class="demo-fist-inline-val" style="color:${_voteColorDemo(fistStatsDemo.avg)}">${fistStatsDemo.avg}<small>/5</small></span>
                        <span class="demo-fist-inline-bars">${(() => {
                            const maxC = Math.max(...[1,2,3,4,5].map(n => fistStatsDemo.dist[n]), 1);
                            return [1,2,3,4,5].map(n => {
                                const c = fistStatsDemo.dist[n];
                                const h = Math.max(15, Math.round((c / maxC) * 100));
                                const lbl = ['', 'Pas confiance', 'Inquiet', 'Mitigé', 'Confiant', 'Très confiant'][n];
                                return `<span class="demo-fist-inline-bar" style="height:${h}%;background:${_voteColorDemo(n)}" title="${n}/5 (${lbl}) : ${c}"></span>`;
                            }).join('');
                        })()}</span>
                        <span class="demo-fist-inline-count">${fistStatsDemo.count}</span>
                    </span>` : ''}
                </h2>
                <div class="demo-pi-grid">
                    ${piObjs.slice(0, 8).map(o => {
                        const stCls = o.status === 'done' ? 'is-done' : o.status === 'blocked' ? 'is-blocked' : o.status === 'inprog' ? 'is-inprog' : 'is-todo';
                        const stIcon = o.status === 'done' ? '✓' : o.status === 'blocked' ? '✗' : o.status === 'inprog' ? '●' : '○';
                        return `<div class="demo-pi-obj ${stCls}${o.committed ? ' is-commit' : ' is-stretch'}">
                            ${o.status === 'done' ? '<span class="demo-pi-obj-shine" aria-hidden="true"></span>' : ''}
                            <span class="demo-pi-obj-state" aria-hidden="true">${stIcon}</span>
                            <span class="demo-pi-obj-text">${esc(o.text || '').slice(0, 80)}${(o.text || '').length > 80 ? '…' : ''}</span>
                            <span class="demo-pi-obj-bv" title="Business Value">${_bv(o)}</span>
                        </div>`;
                    }).join('')}
                </div>
            </section>` : ''}

            <div class="demo-2col">
                <section class="demo-burnup">
                    <h2>📈 Burnup ${sprintEvents.length ? `<small class="demo-burnup-hint">${sprintEvents.length} fait${sprintEvents.length > 1 ? 's' : ''} marquant${sprintEvents.length > 1 ? 's' : ''}</small>` : ''}</h2>
                    <div class="demo-burnup-chart"><canvas id="demo-burnup-canvas"></canvas></div>
                    ${(() => {
                        // Mini velocity-card du PI (inspirée du dashboard `velocity-card`, adaptée dark).
                        // Le dernier sprint du PI = sprint de respiration 🍃 (IP sprint SAFe).
                        const allSprints = Array.isArray(store.get('sprintInfo')?.teamSprints) ? store.get('sprintInfo').teamSprints : [];
                        if (!allSprints.length) return '';
                        const _extractPi = (name) => {
                            if (!name) return 0;
                            const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
                            return m ? parseInt(m[1], 10) : 0;
                        };
                        const _extractIdx = (name) => {
                            const m = String(name || '').match(/\d+\.(\d+)/);
                            return m ? parseInt(m[1], 10) : 0;
                        };
                        const refPi = _extractPi(sprint.name);
                        if (!refPi) return '';
                        let piSprints = allSprints.filter(s => _extractPi(s.name) === refPi);
                        if (sprint.team && sprint.team !== 'all') {
                            piSprints = piSprints.filter(s => s.team === sprint.team);
                        } else {
                            const seen = new Map();
                            for (const s of piSprints) {
                                const k = (s.name || '').toLowerCase();
                                if (!seen.has(k) || s.state === 'active') seen.set(k, s);
                            }
                            piSprints = [...seen.values()];
                        }
                        if (!piSprints.length) return '';
                        piSprints.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
                        // Vélocité LIVE pour sprints actifs (JIRA Greenhopper ne renseigne velocity qu'à la clôture).
                        // Pour chaque sprint sans vélocité, on calcule depuis les tickets locaux `status==='done'`.
                        const allTickets = store.get('tickets') || [];
                        piSprints = piSprints.map(s => {
                            if (s.velocity && s.velocity > 0) return s;   // déjà fourni par JIRA → on garde
                            const liveDone = allTickets
                                .filter(t => (t.sprintName === s.name || (Array.isArray(t.allSprints) && t.allSprints.includes(s.name)))
                                          && t.status === 'done'
                                          && (!s.team || t.team === s.team))
                                .reduce((sum, t) => sum + (t.points || 0), 0);
                            return liveDone > 0 ? { ...s, velocity: liveDone, _live: true } : s;
                        });
                        // Identification du sprint de respiration : le dernier du PI (idx max OU dernier chronologique).
                        const sprintsPerPi = store.get('piInfo')?.sprintsPerPI || piSprints.length;
                        const lastIdx = Math.max(sprintsPerPi, ...piSprints.map(s => _extractIdx(s.name)));
                        // Stats sur sprints CLOS uniquement (exclut current et future)
                        const closed = piSprints.filter(s => s.state === 'closed');
                        const vals = closed.map(s => s.velocity || 0);
                        const totalDone   = vals.reduce((a, b) => a + b, 0);
                        const avgClosed   = vals.length ? Math.round(totalDone / vals.length) : 0;
                        const bestSprint  = closed.length ? closed.reduce((a, b) => (a.velocity || 0) > (b.velocity || 0) ? a : b) : null;
                        const best        = bestSprint?.velocity || 0;
                        const target      = store.get('piInfo')?.velocityTarget || null;
                        const targetPct   = target && vals.length ? Math.round((avgClosed / target) * 100) : null;
                        const targetCls   = targetPct == null ? '' : targetPct >= 100 ? 'demo-vel-kpi--good' : targetPct >= 80 ? 'demo-vel-kpi--ok' : 'demo-vel-kpi--warn';
                        // Tendance : moyenne 3 derniers vs 3 précédents
                        const last3 = vals.slice(-3);
                        const prev3 = vals.slice(-6, -3);
                        const last3Avg = last3.length ? Math.round(last3.reduce((a, b) => a + b, 0) / last3.length) : 0;
                        const prev3Avg = prev3.length ? Math.round(prev3.reduce((a, b) => a + b, 0) / prev3.length) : null;
                        const trend = (prev3Avg && prev3Avg > 0) ? Math.round(((last3Avg - prev3Avg) / prev3Avg) * 100) : null;
                        // Stabilité (coefficient de variation)
                        const stdDev = vals.length ? Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - avgClosed, 2), 0) / vals.length) : 0;
                        const cv = avgClosed > 0 ? Math.round((stdDev / avgClosed) * 100) : 0;
                        const cvLabel = cv < 15 ? 'Très stable' : cv < 30 ? 'Stable' : cv < 50 ? 'Variable' : 'Instable';
                        const cvCls = cv < 15 ? 'demo-vel-kpi--good' : cv < 30 ? 'demo-vel-kpi--ok' : cv < 50 ? 'demo-vel-kpi--warn' : 'demo-vel-kpi--danger';
                        const sparkMax = Math.max(...piSprints.map(s => s.velocity || 0), target || 0, 1);
                        const bars = piSprints.map(s => {
                            const v = s.velocity || 0;
                            const h = Math.max(12, Math.round((v / sparkMax) * 100));
                            const isCur = s.state === 'active' || s.name === sprint.name;
                            const isClosed = s.state === 'closed';
                            const isBreath = _extractIdx(s.name) === lastIdx;
                            const isBest = bestSprint && s.name === bestSprint.name && !isCur && !isBreath;
                            const cls = isBreath ? 'demo-spark-bar--breath'
                                      : isCur    ? 'demo-spark-bar--current'
                                      : isBest   ? 'demo-spark-bar--best'
                                      : isClosed ? 'demo-spark-bar--closed'
                                                 : 'demo-spark-bar--future';
                            const stateLbl = isBreath ? '🍃 Sprint de respiration (IP)'
                                           : isCur    ? 'en cours'
                                           : isClosed ? 'clôturé'
                                                      : 'à venir';
                            const liveSuffix = s._live ? ' (calculé live depuis les tickets)' : '';
                            const goalLine = s.goal ? `\n🎯 ${s.goal}` : '';
                            const ttl = `${s.name || ''} · ${v} pts${liveSuffix} · ${stateLbl}${goalLine}`;
                            const breathBadge = isBreath ? '<span class="demo-spark-breath-badge" aria-hidden="true">🍃</span>' : '';
                            // Vélocité affichée DANS la barre si la hauteur le permet (≥ 22%), sinon au-dessus
                            const ptsInside = h >= 22 && v > 0;
                            return `<span class="demo-spark-bar-wrap" title="${esc(ttl)}">
                                ${breathBadge}
                                ${(!ptsInside && v > 0) ? `<span class="demo-spark-bar-pts demo-spark-bar-pts--above">${v}</span>` : ''}
                                <span class="demo-spark-bar ${cls}" style="height:${h}%">
                                    ${ptsInside ? `<span class="demo-spark-bar-pts demo-spark-bar-pts--inside">${v}</span>` : ''}
                                </span>
                                <span class="demo-spark-bar-name">${esc((s.name || '').match(/\d+\.\d+/)?.[0] || s.name || '')}</span>
                            </span>`;
                        }).join('');
                        return `<div class="demo-vel-card">
                            <div class="demo-vel-hdr">
                                <div class="demo-vel-title">
                                    <span class="demo-vel-emoji">📈</span>
                                    <span>Vélocité PI ${refPi}</span>
                                    <small class="demo-vel-sub">${closed.length} sprint${closed.length > 1 ? 's' : ''} clos · total ${totalDone} pts</small>
                                </div>
                                <div class="demo-vel-kpis">
                                    <div class="demo-vel-kpi demo-vel-kpi--primary" title="Moyenne des sprints clôturés">
                                        <span class="demo-vel-kpi-val">${avgClosed}</span>
                                        <span class="demo-vel-kpi-lbl">moy. clos</span>
                                    </div>
                                    ${trend != null ? `
                                    <div class="demo-vel-kpi ${trend >= 0 ? 'demo-vel-kpi--good' : 'demo-vel-kpi--warn'}" title="Moyenne 3 derniers vs 3 précédents : ${last3Avg} vs ${prev3Avg}">
                                        <span class="demo-vel-kpi-val">${trend >= 0 ? '↗' : '↘'} ${trend >= 0 ? '+' : ''}${trend}%</span>
                                        <span class="demo-vel-kpi-lbl">tendance</span>
                                    </div>` : ''}
                                    ${best ? `
                                    <div class="demo-vel-kpi" title="Meilleur sprint clos : ${esc(bestSprint?.name || '')}">
                                        <span class="demo-vel-kpi-val">⭐ ${best}</span>
                                        <span class="demo-vel-kpi-lbl">record</span>
                                    </div>` : ''}
                                    ${vals.length ? `
                                    <div class="demo-vel-kpi ${cvCls}" title="Coefficient de variation : ${cv}% — plus bas = plus prédictible">
                                        <span class="demo-vel-kpi-val">${cvLabel}</span>
                                        <span class="demo-vel-kpi-lbl">cv ${cv}%</span>
                                    </div>` : ''}
                                    ${targetPct != null ? `
                                    <div class="demo-vel-kpi ${targetCls}" title="Moy. clos vs cible : ${avgClosed}/${target}">
                                        <span class="demo-vel-kpi-val">🎯 ${targetPct}%</span>
                                        <span class="demo-vel-kpi-lbl">vs cible</span>
                                    </div>` : ''}
                                </div>
                            </div>
                            <div class="demo-vel-spark">${bars}</div>
                            <div class="demo-vel-legend">
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--closed"></span>Clôturé</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--current"></span>En cours</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--best"></span>Record</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--breath"></span>🍃 Respiration (IP)</span>
                                <span class="demo-vel-legend-item"><span class="demo-spark-legend demo-spark-legend--future"></span>À venir</span>
                            </div>
                        </div>`;
                    })()}
                </section>

                <section class="demo-wins">
                    <h2>🏆 Réalisations du sprint
                        <small class="demo-wins-count">${doneTickets.length}</small>
                        ${bufferTicketsDemo.length > 0 ? `<small class="demo-wins-sub" title="Buffer réalisé">🛡️ ${doneBufferDemo.length}/${bufferTicketsDemo.length}</small>` : ''}
                        ${doneActionRetroDemo.length > 0 ? `<small class="demo-wins-sub" title="Actions rétro terminées">🔁 ${doneActionRetroDemo.length}</small>` : ''}
                    </h2>
                    <div class="demo-wins-grid" id="demo-wins-grid">
                        ${doneTickets.length === 0
                            ? `<div class="demo-empty">Aucun ticket terminé sur ce sprint.</div>`
                            : (() => {
                                // Résolution feature parente
                                const allEpics = store.get('epics') || [];
                                const allFeatures = store.get('features') || [];
                                const epicById    = new Map(allEpics.map(e => [e.id, e]));
                                const featureById = new Map(allFeatures.map(f => [f.id, f]));
                                const _parentFeature = t => {
                                    if (!t.epic) return null;
                                    const ep = epicById.get(t.epic);
                                    if (!ep) return null;
                                    const f = ep.feature ? featureById.get(ep.feature) : (ep.type === 'feature' ? ep : null);
                                    if (f) return { id: f.id, title: f.title || f.id };
                                    return { id: ep.id, title: ep.title || ep.id };
                                };
                                // Tri par feature (alpha), sans-parent à la fin
                                const sorted = doneTickets.slice().sort((a, b) => {
                                    const fa = _parentFeature(a)?.title || '';
                                    const fb = _parentFeature(b)?.title || '';
                                    if (!fa && fb) return 1;
                                    if (fa && !fb) return -1;
                                    return fa.localeCompare(fb, 'fr', { sensitivity: 'base' });
                                });
                                const _has = (t, rx) => (t.labels || []).some(l => rx.test(l));
                                const _badge = t => {
                                    if (_has(t, /^ActionRetro$/i)) return '<span class="demo-win-tag demo-win-tag--retro" title="Action rétro">🔁</span>';
                                    if (_has(t, /^Buffer$/i))      return '<span class="demo-win-tag demo-win-tag--buffer" title="Buffer">🛡️</span>';
                                    return '';
                                };
                                return sorted.map(t => {
                                    const pf = _parentFeature(t);
                                    return `<div class="demo-win-card">
                                        <div class="demo-win-top">
                                            <span class="demo-win-icon">${_typeIcon(t.type, t.labels)}</span>
                                            <button class="demo-win-key demo-win-key--clickable" data-ticket-id="${esc(t.id)}" title="Ouvrir ${esc(t.id)}">${esc(t.id)}</button>
                                            ${_badge(t)}
                                            ${t.points ? `<span class="demo-win-pts">${t.points} <small>pts</small></span>` : ''}
                                        </div>
                                        <div class="demo-win-title">${esc(t.title || '(sans titre)')}</div>
                                        ${pf ? `<button class="demo-win-parent-chip" data-ticket-id="${esc(pf.id)}" title="Ouvrir ${esc(pf.id)} - ${esc(pf.title)}">
                                            <span class="demo-win-parent-icon">🧭</span>
                                            <span class="demo-win-parent-label">${esc(pf.title)}</span>
                                        </button>` : ''}
                                    </div>`;
                                }).join('');
                            })()}
                    </div>
                </section>
            </div>

            <footer class="demo-footer">
                <span class="demo-kbd">⌨️ <kbd>Esc</kbd> quitter · <kbd>F</kbd> fullscreen · <kbd>Espace</kbd> pause auto-scroll</span>
            </footer>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Burnup avec events (annotations sur la timeline du sprint)
    if (sStart && sEnd) {
        const durationDays = Math.max(1, Math.round((sEnd - sStart) / 86400000) + 1);
        const sprintCtx = { startDate: sprint.startDate, endDate: sprint.endDate, durationDays };
        // Différer pour laisser le DOM se peindre, sinon Chart.js mesure 0×0
        setTimeout(() => renderBurnup('demo-burnup-canvas', tickets, sprintCtx, sprintEvents, { theme: 'dark' }), 80);
    }

    // Clics : clés de tickets + chips de feature parente → ouverture de la modal détaillée.
    // La modal Demo est à z-index 10000 ; on force la modal-overlay détail au-dessus (≥ 11000).
    overlay.querySelectorAll('[data-ticket-id]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const id = el.dataset.ticketId;
            if (!id) return;
            const mo = document.getElementById('modal-overlay');
            if (mo) mo.classList.add('above-demo');   // CSS bump z-index au-dessus de la Demo
            window.__squadBoard?.openTicketModal?.(id);
        });
    });

    // Auto-scroll lent du grid si beaucoup de cards
    let autoScrollTimer = null;
    let isPaused = false;
    const grid = overlay.querySelector('#demo-wins-grid');
    const startAutoScroll = () => {
        if (!grid || grid.scrollHeight <= grid.clientHeight) return;
        autoScrollTimer = setInterval(() => {
            if (isPaused) return;
            const atBottom = grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 5;
            if (atBottom) grid.scrollTop = 0;
            else grid.scrollTop += 1;
        }, 60);
    };
    setTimeout(startAutoScroll, 2000); // start après affichage

    // Close handlers
    const cleanup = () => {
        clearInterval(autoScrollTimer);
        document.removeEventListener('keydown', onKey);
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    };
    const closeDemo = () => {
        cleanup();
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    };
    overlay.querySelector('.demo-mode-close')?.addEventListener('click', closeDemo);

    const onKey = e => {
        if (e.key === 'Escape') closeDemo();
        else if (e.key === ' ') { e.preventDefault(); isPaused = !isPaused; }
        else if (e.key === 'f' || e.key === 'F') {
            if (document.fullscreenElement) document.exitFullscreen();
            else overlay.requestFullscreen?.().catch(() => {});
        }
    };
    document.addEventListener('keydown', onKey);
}

// ── Sprint Review template (Confluence-ready) — ouvre dans un nouvel onglet ──
// Format orienté COMMUNICATION : objectif, réalisations, métriques, points
// d'attention pour la rétro, à reporter au prochain sprint, next steps (vide à
// remplir en live pendant la review).
function _buildSprintReviewHtml(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'EN COURS' : 'CLÔTURÉ';
    const stateColor = sprint.isCurrent ? '#10b981' : '#64748b';
    const startLabel = sprint.startDate ? _fmtDate(sprint.startDate) : '';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const jiraBase = store.get('jiraUrl');
    const link = (key) => !jiraBase || !key
        ? `<strong>${esc(key)}</strong>`
        : `<a href="${jiraBase.replace(/\/$/, '')}/browse/${esc(key)}" target="_blank">${esc(key)}</a>`;

    const total = tickets.length;
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone  = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    const doneCount = tickets.filter(t => t.status === 'done').length;
    const realisedPct = sprint.estimated > 0 ? Math.round(((sprint.velocity || ptsDone) / sprint.estimated) * 100) : null;
    const bufferTickets = tickets.filter(t => (t.labels || []).some(l => /^Buffer$/i.test(l)));
    const bufferPts = sumBy(bufferTickets, t => t.points);

    // ── Résolution feature parente (chaîne ticket → epic → feature) ─────────
    const allEpics    = store.get('epics') || [];
    const allFeatures = store.get('features') || [];
    const epicById    = new Map(allEpics.map(e => [e.id, e]));
    const featureById = new Map(allFeatures.map(f => [f.id, f]));
    const _parentFeature = (t) => {
        if (!t.epic) return null;
        const ep = epicById.get(t.epic);
        if (!ep) return null;
        const f = ep.feature ? featureById.get(ep.feature) : (ep.type === 'feature' ? ep : null);
        if (f) return { id: f.id, title: f.title || f.id };
        return { id: ep.id, title: ep.title || ep.id };
    };

    // ── Tickets done : tri par feature puis regroupement Tickets/Buffer/Retro
    const doneTickets = tickets.filter(t => t.status === 'done')
        .sort((a, b) => {
            const fa = _parentFeature(a)?.title || '';
            const fb = _parentFeature(b)?.title || '';
            if (!fa && fb) return 1;
            if (fa && !fb) return -1;
            const cmp = fa.localeCompare(fb, 'fr', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            return (b.points || 0) - (a.points || 0);
        });
    const _has = (t, rx) => (t.labels || []).some(l => rx.test(l));
    const doneActionRetro = doneTickets.filter(t => _has(t, /^ActionRetro$/i));
    const doneBuffer      = doneTickets.filter(t => !_has(t, /^ActionRetro$/i) && _has(t, /^Buffer$/i));
    const doneNormal      = doneTickets.filter(t => !_has(t, /^ActionRetro$/i) && !_has(t, /^Buffer$/i));

    // Toutes les ActionRetro du sprint (peu importe le statut) — pour faire le tour en review
    const allActionRetro = tickets.filter(t => _has(t, /^ActionRetro$/i))
        .sort((a, b) => {
            // done en dernier (on parle d'abord des en cours / bloquées / à reporter)
            const sa = a.status === 'done' ? 1 : 0;
            const sb = b.status === 'done' ? 1 : 0;
            if (sa !== sb) return sa - sb;
            return (a.id || '').localeCompare(b.id || '');
        });

    // Tickets non done = à reporter
    // Tri "À reporter" : statut prioritaire (blocked → inprog → review/test → todo) puis
    // par feature parente (alpha) puis par points décroissants.
    const _statusRank = (s) => ({ blocked: 0, inprog: 1, review: 2, test: 3, todo: 4 })[s] ?? 5;
    const notDone = tickets.filter(t => t.status !== 'done').sort((a, b) => {
        const rs = _statusRank(a.status) - _statusRank(b.status);
        if (rs !== 0) return rs;
        const fa = _parentFeature(a)?.title || '';
        const fb = _parentFeature(b)?.title || '';
        if (!fa && fb) return 1;
        if (fa && !fb) return -1;
        const cmp = fa.localeCompare(fb, 'fr', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return (b.points || 0) - (a.points || 0);
    });
    const blocked = notDone.filter(t => t.status === 'blocked');

    // Périmètre élargi : tickets ajoutés après début sprint
    const sprintStart = sprint.startDate ? new Date(String(sprint.startDate).slice(0, 10)).getTime() : 0;
    const scopeCreep = tickets.filter(t => t.createdAt && new Date(t.createdAt).getTime() > sprintStart);

    // ── Mood + Fist of Five (filtrés par sprint + équipe) ────────────────────
    // piSprint en base peut être : "29.3", "Fuego - Ite 29.3", "PI#29"… match tolérant.
    const _sprintLabel = (String(sprint.name || '').match(/(\d+\.\d+)/) || [])[1] || '';
    const _matchVoteSprint = (vps) => {
        if (!vps) return false;
        if (vps === sprint.name) return true;
        if (_sprintLabel && (vps === _sprintLabel || vps.includes(_sprintLabel))) return true;
        return sprint.name && (vps.includes(sprint.name) || sprint.name.includes(vps));
    };
    const _voteFilter = (v) => (!sprint.team || sprint.team === 'all' || v.team === sprint.team)
                            && _matchVoteSprint(v.piSprint);
    const moodVotes = (store.get('moodVotes') || []).filter(_voteFilter);
    const fistVotes = (store.get('fistVotes') || []).filter(_voteFilter);
    console.info(`[SprintReview] mood=${moodVotes.length} fist=${fistVotes.length} sprint="${sprint.name}" label="${_sprintLabel}" team="${sprint.team || 'all'}"`);
    const _voteStats = (votes) => {
        if (!votes.length) return null;
        const dist = [0, 0, 0, 0, 0, 0]; // index 1..5
        let sum = 0;
        for (const v of votes) {
            const n = parseInt(v.value) || 0;
            if (n >= 1 && n <= 5) { dist[n]++; sum += n; }
        }
        return { avg: Math.round((sum / votes.length) * 10) / 10, count: votes.length, dist };
    };
    const moodStats = _voteStats(moodVotes);
    const fistStats = _voteStats(fistVotes);
    const _voteFace = (n) => ({ 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }[Math.round(n)] || '❓');
    const _voteColor = (n) => n >= 4 ? '#10b981' : n >= 3 ? '#f59e0b' : '#ef4444';

    // ── PI Objectives (filtré par équipe si applicable) ─────────────────────
    const piInfo = store.get('piInfo');
    const piObjs = (piInfo?.objectives || [])
        .filter(o => (o.text || '').trim())
        .filter(o => !sprint.team || sprint.team === 'all' || !o.team || o.team === sprint.team);
    const _bv = o => Math.max(0, Math.min(10, parseInt(o.bv) || 0));
    const piCommit  = piObjs.filter(o => o.committed);
    const piStretch = piObjs.filter(o => !o.committed);
    const piDoneCt  = piObjs.filter(o => o.status === 'done').length;
    const piCommitTotal = sumBy(piCommit, _bv);
    const piCommitDone  = sumBy(piCommit.filter(o => o.status === 'done'), _bv);
    const piStretchDone = sumBy(piStretch.filter(o => o.status === 'done'), _bv);
    const piScore = piCommitTotal > 0 ? Math.round(((piCommitDone + piStretchDone) / piCommitTotal) * 100) : null;

    // ── Sparkline PI : sprints du PI courant + vélocité (live pour actifs) ──
    const _extractPi  = (name) => { const m = String(name || '').match(/(\d+)\.\d+/) || String(name || '').match(/PI\s*#?\s*(\d+)/i); return m ? parseInt(m[1], 10) : 0; };
    const _extractIdx = (name) => { const m = String(name || '').match(/\d+\.(\d+)/); return m ? parseInt(m[1], 10) : 0; };
    const refPi = _extractPi(sprint.name);
    const teamSprints = Array.isArray(store.get('sprintInfo')?.teamSprints) ? store.get('sprintInfo').teamSprints : [];
    let piSprints = refPi ? teamSprints.filter(s => _extractPi(s.name) === refPi) : [];
    if (piSprints.length) {
        if (sprint.team && sprint.team !== 'all') {
            piSprints = piSprints.filter(s => s.team === sprint.team);
        } else {
            const seen = new Map();
            for (const s of piSprints) {
                const k = (s.name || '').toLowerCase();
                if (!seen.has(k) || s.state === 'active') seen.set(k, s);
            }
            piSprints = [...seen.values()];
        }
        piSprints.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
        const allTks = store.get('tickets') || [];
        piSprints = piSprints.map(s => {
            if (s.velocity && s.velocity > 0) return s;
            const live = allTks
                .filter(t => (t.sprintName === s.name || (Array.isArray(t.allSprints) && t.allSprints.includes(s.name)))
                          && t.status === 'done'
                          && (!s.team || t.team === s.team))
                .reduce((sum, t) => sum + (t.points || 0), 0);
            return live > 0 ? { ...s, velocity: live, _live: true } : s;
        });
    }
    const sprintsPerPi = piInfo?.sprintsPerPI || piSprints.length;
    const breathIdx = Math.max(sprintsPerPi, ...piSprints.map(s => _extractIdx(s.name)));
    const closedSprints = piSprints.filter(s => s.state === 'closed');
    const closedVals = closedSprints.map(s => s.velocity || 0);
    const piTotal = closedVals.reduce((a, b) => a + b, 0);
    const piAvg   = closedVals.length ? Math.round(piTotal / closedVals.length) : 0;
    const piBest  = closedVals.length ? Math.max(...closedVals) : 0;
    const piTarget = piInfo?.velocityTarget || null;
    const piTargetPct = piTarget && closedVals.length ? Math.round((piAvg / piTarget) * 100) : null;

    // ── Helper rendu d'une ligne ticket (avec feature parente) ──────────────
    const renderRow = (t) => {
        const tIcon = _typeIcon(t.type, t.labels);
        const pts = t.points ? ` <span class="pill pill-pts">${t.points} pts</span>` : '';
        const pf = _parentFeature(t);
        const parentChip = pf
            ? ` <span class="parent-chip" title="Feature parente ${esc(pf.id)}">🧭 ${esc(pf.title)}</span>`
            : '';
        return `<li>${tIcon} ${link(t.id)} — ${esc(t.title || '(sans titre)')}${pts}${parentChip}</li>`;
    };

    // ── Rendu d'un groupe de réalisations (Tickets / Buffer / Actions rétro)
    const renderWinsGroup = (label, icon, list, color) => list.length === 0 ? '' : `
        <div class="wins-group" style="border-left-color:${color}">
            <h3 class="wins-group-title">
                <span class="wins-group-icon">${icon}</span>
                <span>${label}</span>
                <span class="wins-group-count">${list.length}</span>
                ${list.some(t => t.points) ? `<span class="wins-group-pts">${sumBy(list, t => t.points)} pts</span>` : ''}
            </h3>
            <ul class="cr-tickets">${list.map(renderRow).join('')}</ul>
        </div>`;

    // ── Génération du texte Slack-friendly (PUR TEXTE, sans mrkdwn) ──────────
    // Slack n'interprète PAS *gras* / _italique_ / `code` au paste, mais interprète
    // les liens `<URL|texte>` (cliquables même au paste). On en profite pour les tickets.
    const jiraBaseClean = (jiraBase || '').replace(/\/$/, '');
    const _slackKey = (id) => jiraBaseClean && id ? `<${jiraBaseClean}/browse/${id}|${id}>` : id || '';
    const _slackList = (arr, max = 5) => {
        const top = arr.slice(0, max).map(t => `   • ${_slackKey(t.id)} - ${t.title || '(sans titre)'}${t.points ? ` (${t.points} pts)` : ''}`).join('\n');
        const rest = arr.length > max ? `\n   ...et ${arr.length - max} autre${arr.length - max > 1 ? 's' : ''}` : '';
        return top + rest;
    };
    const slackParts = [];
    slackParts.push(`🏆 Sprint Review - ${sprint.name}${sprint.team ? `   👥 ${sprint.team}` : ''}`);
    if (startLabel || endLabel) slackParts.push(`📅 ${startLabel} -> ${endLabel}`);
    if (sprint.goal) {
        const goalLines = String(sprint.goal).split('\n').map(l => `   ${l}`).join('\n');
        slackParts.push(`\n🎯 Objectif du sprint\n${goalLines}`);
    }
    slackParts.push(
        `\n📊 Métriques\n` +
        `   • Vélocité : ${sprint.velocity || ptsDone} pts${realisedPct != null ? ` (${realisedPct}% du buffer)` : ''}\n` +
        `   • Tickets : ${doneCount}/${total || '-'} (${pct(doneCount, total)}% terminés)` +
        (bufferPts > 0 ? `\n   • 🛡️ Buffer : ${bufferPts} pts sur ${bufferTickets.length} ticket${bufferTickets.length > 1 ? 's' : ''}` : '')
    );
    if (piObjs.length) {
        slackParts.push(
            `\n🎯 PI Objectives - ${piDoneCt}/${piObjs.length} livré${piDoneCt > 1 ? 's' : ''}` +
            (piCommitTotal > 0 ? ` · BV ${piCommitDone + piStretchDone}/${piCommitTotal}` : '') +
            (piScore != null ? ` · Predictability ${piScore}%` : '')
        );
    }
    if (piSprints.length) {
        slackParts.push(
            `\n📈 Vélocité PI ${refPi} - moy. ${piAvg} pts` +
            (piBest ? ` · record ⭐${piBest}` : '') +
            (piTargetPct != null ? ` · vs cible 🎯 ${piTargetPct}%` : '')
        );
    }
    // Réalisations fusionnées : un seul bloc tous types confondus, badges récap Buffer/Retro.
    const realisationsHdr = `\n🏆 Réalisations (${doneTickets.length} tickets · ${ptsDone} pts)`
        + (bufferTickets.length > 0 ? ` · 🛡️ Buffer ${doneBuffer.length}/${bufferTickets.length}` : '')
        + (doneActionRetro.length > 0 ? ` · 🔁 Retro ${doneActionRetro.length}` : '');
    if (doneTickets.length) {
        slackParts.push(`${realisationsHdr}\n${_slackList(doneTickets, 15)}`);
    } else {
        slackParts.push(`${realisationsHdr}\n   (aucun ticket terminé)`);
    }
    // Climat équipe (mood + fist)
    if (moodStats || fistStats) {
        const climLines = ['\n🎭 Climat équipe'];
        if (moodStats) climLines.push(`   • Mood : ${_voteFace(moodStats.avg)} ${moodStats.avg}/5 (${moodStats.count} vote${moodStats.count > 1 ? 's' : ''})`);
        if (fistStats) climLines.push(`   • Fist of Five (confiance PI) : ${fistStats.avg}/5 (${fistStats.count} vote${fistStats.count > 1 ? 's' : ''})`);
        slackParts.push(climLines.join('\n'));
    }
    if (allActionRetro.length) {
        const openRetro = allActionRetro.filter(t => t.status !== 'done');
        if (openRetro.length) slackParts.push(`\n🔁 Actions rétro à passer en revue (${openRetro.length} non clôturée${openRetro.length > 1 ? 's' : ''})\n${_slackList(openRetro, 10)}`);
    }
    if (notDone.length) {
        slackParts.push(`\n🔄 À reporter - ${notDone.length} ticket${notDone.length > 1 ? 's' : ''}${blocked.length ? ` (dont ${blocked.length} bloqué${blocked.length > 1 ? 's' : ''} 🚨)` : ''}`);
    }
    if (blocked.length > 0 || scopeCreep.length >= 2) {
        const pts = [];
        if (blocked.length > 0) pts.push(`${blocked.length} blocker${blocked.length > 1 ? 's' : ''} non résolu${blocked.length > 1 ? 's' : ''}`);
        if (scopeCreep.length >= 2) pts.push(`périmètre élargi (${scopeCreep.length} tickets ajoutés)`);
        slackParts.push(`\n⚠️ À discuter en rétro : ${pts.join(' · ')}`);
    } else {
        slackParts.push(`\n👍 Sprint propre - pas de blocker non résolu`);
    }
    const slackText = slackParts.join('\n');
    // JSON.stringify → string JS échappée safe à injecter dans le <script>
    const slackTextJsLit = JSON.stringify(slackText);

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Sprint Review — ${esc(sprint.name)}</title>
<style>
* { box-sizing: border-box; }
body { font-family: Georgia, "Iowan Old Style", Palatino, serif; max-width: 920px; margin: 32px auto; padding: 0 28px; color: #1a202c; line-height: 1.65; }
/* Toolbar sticky avec bouton Slack */
.cr-toolbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    justify-content: flex-end;
    padding: 12px 0 14px;
    margin: -12px -28px 18px;
    padding-right: 28px;
    background: linear-gradient(to bottom, #fff 0%, #fff 75%, rgba(255,255,255,0.9) 100%);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid #f1f5f9;
}
.slack-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #4A154B 0%, #611f64 100%);
    color: #fff;
    border: 1px solid #4A154B;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(74,21,75,0.25);
    transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.slack-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(74,21,75,0.35); }
.slack-btn:active { transform: translateY(0); box-shadow: 0 1px 3px rgba(74,21,75,0.4); }
.slack-btn.is-ok { background: linear-gradient(135deg,#047857,#10b981); border-color: #10b981; box-shadow: 0 4px 14px rgba(16,185,129,0.35); }
.slack-btn.is-err { background: linear-gradient(135deg,#b91c1c,#ef4444); border-color: #ef4444; }
.slack-btn-icon { font-size: 15px; line-height: 1; }
@media print { .cr-toolbar { display: none; } }

.cr-header { border-bottom: 3px double #cbd5e1; padding-bottom: 18px; margin-bottom: 28px; }
.cr-title { margin: 0; font-size: 26px; color: #0f172a; }
.cr-state { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; background: ${stateColor}; text-transform: uppercase; letter-spacing: .08em; margin-left: 8px; vertical-align: 4px; font-family: system-ui, sans-serif; }
.cr-meta { color: #475569; font-size: 14px; margin-top: 8px; }
.cr-meta strong { color: #1a202c; }

h2 { font-size: 18px; color: #0f172a; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
h2 .badge { display: inline-block; margin-left: 8px; padding: 1px 9px; border-radius: 999px; background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; font-family: system-ui, sans-serif; vertical-align: 3px; }

.goal {
    background: linear-gradient(135deg, #fef3c7, #fffbeb);
    border-left: 4px solid #f59e0b;
    padding: 12px 18px;
    border-radius: 0 8px 8px 0;
    margin: 12px 0;
    font-size: 15px;
    font-style: italic;
}
.goal--empty { background: #f8fafc; border-left-color: #cbd5e1; color: #94a3b8; }

.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 12px 0; font-family: system-ui, sans-serif; }
.metric { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; text-align: center; }
.metric .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
.metric .val { font-size: 24px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.metric .sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.metric--ok .val { color: #047857; }
.metric--warn .val { color: #b45309; }

ul.cr-tickets { list-style: none; padding: 0; margin: 8px 0; font-family: system-ui, sans-serif; }
ul.cr-tickets li { padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13.5px; }
ul.cr-tickets li:last-child { border-bottom: none; }
ul.cr-tickets a { color: #1d4ed8; text-decoration: none; font-family: ui-monospace, monospace; font-size: 12px; }
ul.cr-tickets a:hover { text-decoration: underline; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; font-family: system-ui, sans-serif; }
.pill-pts { background: #dbeafe; color: #1d4ed8; }
.leader { color: #64748b; font-size: 11.5px; font-family: system-ui, sans-serif; }

.attention { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 18px; border-radius: 0 8px 8px 0; margin: 12px 0; }
.attention strong { color: #b91c1c; }
.attention--ok { background: #ecfdf5; border-left-color: #10b981; }
.attention--ok strong { color: #047857; }

.empty { color: #94a3b8; font-style: italic; padding: 8px 4px; }

.notes-zone {
    border: 2px dashed #cbd5e1;
    border-radius: 12px;
    padding: 18px;
    background: #fafafa;
    min-height: 120px;
    color: #1a202c;
    font-style: normal;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s, background 0.15s;
}
.notes-zone:focus {
    border-color: #4A154B;
    border-style: solid;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(74,21,75,0.12);
}
.notes-zone:empty::before {
    content: attr(placeholder);
    color: #94a3b8;
    font-style: italic;
}
.cr-edit-hint { color: #94a3b8; font-size: 11px; font-weight: 500; margin-left: 8px; font-style: italic; }

/* Boutons toolbar (PNG, PDF, lien PI) */
.tb-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 7px 12px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
}
.tb-btn:hover { background: #fff; border-color: #94a3b8; color: #0f172a; transform: translateY(-1px); }

.cr-footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; font-family: system-ui, sans-serif; }

/* ── PI Objectives ─────────────────────────────────────────────────────── */
.pi-summary {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 10px;
    border-radius: 999px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #047857;
    font-size: 12px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    vertical-align: 3px;
}
.pi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; margin: 10px 0; font-family: system-ui, sans-serif; }
.pi-obj {
    position: relative;
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    border-left: 3px solid #cbd5e1;
    background: #f8fafc;
    font-size: 13px;
}
.pi-obj.is-done    { background: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 70%); border-left-color: #10b981; box-shadow: 0 1px 4px rgba(16,185,129,0.15); }
.pi-obj.is-inprog  { background: #eff6ff; border-left-color: #3b82f6; }
.pi-obj.is-blocked { background: #fef2f2; border-left-color: #ef4444; }
.pi-obj.is-stretch { border-style: dashed; opacity: 0.85; }
.pi-obj-state {
    flex-shrink: 0;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%; font-size: 12px; font-weight: 700;
    background: #e2e8f0; color: #475569;
}
.pi-obj.is-done .pi-obj-state    { background: linear-gradient(135deg,#10b981,#34d399); color: #fff; box-shadow: 0 0 0 3px rgba(16,185,129,0.18); }
.pi-obj.is-inprog .pi-obj-state  { background: #3b82f6; color: #fff; }
.pi-obj.is-blocked .pi-obj-state { background: #ef4444; color: #fff; }
.pi-obj-text { flex: 1; line-height: 1.3; }
.pi-obj-bv {
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 999px;
    background: #fef3c7;
    color: #b45309;
    font-weight: 700;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}
.pi-obj.is-done .pi-obj-bv { background: linear-gradient(135deg,#fbbf24,#f97316); color: #fff; }

/* ── Vélocité PI (mini-card + sparkline horizontal) ────────────────────── */
.vel-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin: 10px 0; font-family: system-ui, sans-serif; }
.vel-hdr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.vel-title { font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; }
.vel-title small { font-weight: 500; color: #64748b; text-transform: none; letter-spacing: 0; font-size: 11px; margin-left: 6px; }
.vel-kpis { display: flex; flex-wrap: wrap; gap: 6px; }
.vel-kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 10px; display: flex; flex-direction: column; align-items: flex-end; min-width: 64px; }
.vel-kpi-val { font-size: 14px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.1; }
.vel-kpi-lbl { font-size: 9.5px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
.vel-kpi--good { border-color: #a7f3d0; }
.vel-kpi--good .vel-kpi-val { color: #047857; }
.vel-kpi--warn { border-color: #fde68a; }
.vel-kpi--warn .vel-kpi-val { color: #b45309; }

.vel-spark { display: flex; align-items: flex-end; gap: 8px; height: 80px; padding: 8px 4px 0; }
.vel-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; min-width: 26px; }
.vel-bar { width: 100%; border-radius: 4px 4px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 3px; }
.vel-bar-pts { font-size: 10px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.25); font-variant-numeric: tabular-nums; }
.vel-bar-name { font-size: 9.5px; color: #475569; margin-top: 4px; font-weight: 600; font-variant-numeric: tabular-nums; }
.vel-bar--closed  { background: linear-gradient(to top, #6ee7b7, #047857); }
.vel-bar--current { background: linear-gradient(to top, #93c5fd, #1d4ed8); box-shadow: 0 0 0 1px #3b82f6; }
.vel-bar--best    { background: linear-gradient(to top, #fcd34d, #b45309); box-shadow: 0 0 6px rgba(251,191,36,0.45); }
.vel-bar--breath  { background: linear-gradient(to top, #bbf7d0, #4ade80); border: 1px solid #34d399; }
.vel-bar--future  { background: #f1f5f9; border: 1px dashed #cbd5e1; }
.vel-breath-badge { position: absolute; top: -3px; font-size: 12px; }
.vel-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 10.5px; color: #64748b; }
.vel-legend-item { display: inline-flex; align-items: center; gap: 4px; }
.vel-legend-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }

/* ── Réalisations regroupées ───────────────────────────────────────────── */
.wins-group { background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1; border-radius: 8px; padding: 8px 14px; margin: 8px 0; }
.wins-group-title { margin: 0 0 6px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; font-family: system-ui, sans-serif; border: none; padding: 0; }
.wins-group-icon { font-size: 13px; }
.wins-group-count { background: #e2e8f0; color: #1a202c; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: none; }
.wins-group-pts { margin-left: auto; color: #b45309; font-weight: 700; font-size: 11px; }
.wins-group .cr-tickets { margin: 4px 0; }

/* Chip feature parente discrète dans la ligne ticket */
.parent-chip { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #f1f5f9; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; font-style: italic; font-family: system-ui, sans-serif; }

/* ── Climat équipe (Mood + Fist) ─────────────────────────────────────── */
.vote-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 10px 0; font-family: system-ui, sans-serif; }
@media (max-width: 700px) { .vote-grid { grid-template-columns: 1fr; } }
.vote-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
.vote-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vote-card-icon { font-size: 18px; }
.vote-card-title { font-weight: 700; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
.vote-card-count { margin-left: auto; font-size: 11px; color: #64748b; padding: 1px 8px; border-radius: 999px; background: #e2e8f0; }
.vote-card-score { text-align: center; font-size: 32px; padding: 8px 0; }
.vote-card-score strong { font-weight: 800; font-variant-numeric: tabular-nums; }
.vote-card-score small { font-size: 14px; color: #94a3b8; margin-left: 2px; }
.vote-dist { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.vote-dist-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.vote-dist-face { width: 22px; text-align: center; font-size: 14px; }
.vote-dist-fist { width: 22px; text-align: center; font-weight: 700; color: #475569; }
.vote-dist-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
.vote-dist-fill { height: 100%; transition: width 0.2s; }
.vote-dist-label { color: #64748b; font-size: 11px; flex-shrink: 0; min-width: 92px; }
.vote-dist-count { width: 22px; text-align: right; font-weight: 600; color: #1a202c; font-variant-numeric: tabular-nums; }

/* ── Actions rétro à passer en revue ───────────────────────────────────── */
.retro-intro { color: #64748b; font-size: 13px; font-style: italic; margin: 6px 0 12px; font-family: system-ui, sans-serif; }
.retro-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; font-family: system-ui, sans-serif; }
.retro-item {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-left: 4px solid #f59e0b;
    border-radius: 8px;
    padding: 10px 14px;
}
.retro-item.is-done { background: #ecfdf5; border-color: #a7f3d0; border-left-color: #10b981; }
.retro-item.is-blocked { background: #fef2f2; border-color: #fecaca; border-left-color: #ef4444; }
.retro-item.is-inprog { background: #eff6ff; border-color: #bfdbfe; border-left-color: #3b82f6; }
.retro-item-hdr { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.retro-item-hdr a { font-family: ui-monospace, monospace; font-size: 12px; color: #1d4ed8; text-decoration: none; }
.retro-item-hdr a:hover { text-decoration: underline; }
.retro-status {
    flex-shrink: 0;
    padding: 2px 9px;
    border-radius: 999px;
    background: #e2e8f0;
    color: #1a202c;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.retro-item.is-done .retro-status    { background: linear-gradient(135deg,#10b981,#34d399); color: #fff; }
.retro-item.is-blocked .retro-status { background: #ef4444; color: #fff; }
.retro-item.is-inprog .retro-status  { background: #3b82f6; color: #fff; }
.retro-title { color: #0f172a; font-weight: 500; }
.retro-owner { color: #64748b; font-size: 12px; font-style: italic; }

/* Description dépliable */
.retro-desc { margin-top: 8px; border-top: 1px dashed rgba(0,0,0,0.08); padding-top: 6px; }
.retro-desc summary {
    cursor: pointer;
    font-size: 11.5px;
    color: #475569;
    padding: 4px 0;
    user-select: none;
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.retro-desc summary::-webkit-details-marker { display: none; }
.retro-desc summary::before {
    content: '▸';
    display: inline-block;
    transition: transform 0.15s;
    color: #94a3b8;
}
.retro-desc[open] summary::before { transform: rotate(90deg); }
.retro-desc summary:hover { color: #0f172a; }
.retro-desc-body {
    margin-top: 8px;
    padding: 10px 12px;
    background: #fff;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    font-size: 13px;
    color: #334155;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: Georgia, "Iowan Old Style", Palatino, serif;
}
.retro-desc-body p { margin: 0.6em 0; }
.retro-desc-body ul, .retro-desc-body ol { padding-left: 1.4em; margin: 0.6em 0; }
.retro-desc-body code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 0.9em; }
.retro-desc-body a { color: #1d4ed8; }

@media print {
    body { margin: 0; padding: 16px; max-width: none; }
    h2 { break-after: avoid; }
    .notes-zone { background: #fff; min-height: 60px; }
    .pi-obj, .wins-group, .vel-card { break-inside: avoid; }
}
</style>
</head>
<body>

<div class="cr-toolbar">
    <button id="copy-slack-btn" class="slack-btn" title="Copier un résumé aéré dans le presse-papier (Slack-friendly)">
        <span class="slack-btn-icon">💬</span>
        <span class="slack-btn-label">Copier pour Slack</span>
    </button>
    <button id="png-btn" class="tb-btn" title="Télécharger en image PNG">📷 PNG</button>
    <button id="print-btn" class="tb-btn" title="Imprimer / PDF (Ctrl+P)">🖨 PDF</button>
    ${piInfo?.number ? (() => {
        const nextPi = piInfo.number + 1;
        // JQL : sprint IN ("PI#30") — encode pour URL (espaces, parenthèses, guillemets)
        const jql = `sprint IN ("PI#${nextPi}")`;
        const url = jiraBaseClean
            ? `${jiraBaseClean}/issues/?jql=${encodeURIComponent(jql)}`
            : '#';
        return `<a class="tb-btn" href="${url}" target="_blank" title="Préparer le PI Planning suivant&#10;JQL : ${jql}">🚀 PI ${nextPi}</a>`;
    })() : ''}
</div>

<header class="cr-header">
    <h1 class="cr-title">📋 Sprint Review<span class="cr-state">${stateLabel}</span></h1>
    <div class="cr-meta">
        <strong>${esc(sprint.name)}</strong>
        ${sprint.team ? ` · 👥 <strong>${esc(sprint.team)}</strong>` : ''}
        ${startLabel || endLabel ? ` · 📅 ${esc(startLabel)} → ${esc(endLabel)}` : ''}
    </div>
</header>

<script>
(function(){
    const SLACK_TEXT = ${slackTextJsLit};
    const SPRINT_NAME = ${JSON.stringify(sprint.name || 'sprint')};
    // ── Copier Slack ──
    const btn = document.getElementById('copy-slack-btn');
    const lbl = btn?.querySelector('.slack-btn-label');
    const icn = btn?.querySelector('.slack-btn-icon');
    btn?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(SLACK_TEXT);
            btn.classList.add('is-ok');
            if (lbl) lbl.textContent = 'Copié !';
            if (icn) icn.textContent = '✓';
            setTimeout(() => { btn.classList.remove('is-ok'); if (lbl) lbl.textContent = 'Copier pour Slack'; if (icn) icn.textContent = '💬'; }, 2400);
        } catch (e) {
            btn.classList.add('is-err');
            if (lbl) lbl.textContent = 'Copie impossible';
            setTimeout(() => { btn.classList.remove('is-err'); if (lbl) lbl.textContent = 'Copier pour Slack'; }, 2400);
        }
    });
    // ── Décisions éditable + persistence localStorage ──
    const dec = document.getElementById('cr-decisions');
    if (dec) {
        const key = dec.dataset.storageKey;
        try { const saved = localStorage.getItem(key); if (saved) dec.innerHTML = saved; } catch {}
        let saveT = null;
        dec.addEventListener('input', () => {
            clearTimeout(saveT);
            saveT = setTimeout(() => { try { localStorage.setItem(key, dec.innerHTML); } catch {} }, 400);
        });
    }
    // ── PDF (impression / Save as PDF) ──
    document.getElementById('print-btn')?.addEventListener('click', () => window.print());
    // ── PNG via html2canvas (chargé à la demande depuis CDN) ──
    document.getElementById('png-btn')?.addEventListener('click', async () => {
        const pngBtn = document.getElementById('png-btn');
        pngBtn.textContent = '⏳ Génération…';
        try {
            if (!window.html2canvas) {
                await new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                    s.onload = res; s.onerror = rej;
                    document.head.appendChild(s);
                });
            }
            const canvas = await window.html2canvas(document.body, { backgroundColor: '#fff', scale: 2, useCORS: true });
            const link = document.createElement('a');
            link.download = 'sprint-review-' + SPRINT_NAME.replace(/[^a-z0-9]+/gi, '-') + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            pngBtn.textContent = '✓ PNG';
            setTimeout(() => { pngBtn.textContent = '📷 PNG'; }, 1800);
        } catch (e) {
            console.error(e);
            pngBtn.textContent = '❌ Erreur';
            setTimeout(() => { pngBtn.textContent = '📷 PNG'; }, 2400);
        }
    });
})();
</script>

<h2>🎯 Objectif du sprint</h2>
${sprint.goal
    ? `<div class="goal">${esc(sprint.goal)}</div>`
    : '<div class="goal goal--empty">Aucun objectif explicite n\'a été défini pour ce sprint.</div>'}

<h2>📊 Métriques</h2>
<div class="metrics">
    <div class="metric metric--ok">
        <div class="lbl">Vélocité</div>
        <div class="val">${sprint.velocity || ptsDone}<small style="font-size:11px"> pts</small></div>
        ${realisedPct != null ? `<div class="sub">${realisedPct}% du buffer</div>` : ''}
    </div>
    ${sprint.estimated ? `
    <div class="metric">
        <div class="lbl">Buffer (estimé)</div>
        <div class="val">${sprint.estimated}<small style="font-size:11px"> pts</small></div>
        <div class="sub">snapshot JIRA</div>
    </div>` : ''}
    ${bufferPts > 0 ? `
    <div class="metric">
        <div class="lbl">🛡️ Tickets Buffer</div>
        <div class="val">${bufferPts}<small style="font-size:11px"> pts</small></div>
        <div class="sub">${bufferTickets.length} ticket${bufferTickets.length > 1 ? 's' : ''}</div>
    </div>` : ''}
    <div class="metric ${doneCount === total ? 'metric--ok' : ''}">
        <div class="lbl">Tickets</div>
        <div class="val">${doneCount}<small style="font-size:14px">/${total || '—'}</small></div>
        <div class="sub">${pct(doneCount, total)}% terminés</div>
    </div>
</div>

${piObjs.length ? `
<h2>🎯 PI Objectives ${piInfo?.number ? `<span class="badge">PI ${piInfo.number}</span>` : ''}
    <span class="pi-summary">✓ ${piDoneCt}/${piObjs.length}${piCommitTotal > 0 ? ` · BV livrée ${piCommitDone + piStretchDone}/${piCommitTotal}` : ''}${piScore != null ? ` · Predictability ${piScore}%` : ''}</span>
</h2>
<div class="pi-grid">
    ${piObjs.map(o => {
        const stCls = o.status === 'done' ? 'is-done' : o.status === 'blocked' ? 'is-blocked' : o.status === 'inprog' ? 'is-inprog' : 'is-todo';
        const stIcon = o.status === 'done' ? '✓' : o.status === 'blocked' ? '✗' : o.status === 'inprog' ? '●' : '○';
        return `<div class="pi-obj ${stCls}${o.committed ? ' is-commit' : ' is-stretch'}">
            <span class="pi-obj-state" aria-hidden="true">${stIcon}</span>
            <span class="pi-obj-text">${esc(o.text || '')}</span>
            <span class="pi-obj-bv" title="Business Value">${_bv(o)}</span>
        </div>`;
    }).join('')}
</div>` : ''}

${piSprints.length ? (() => {
    const sparkMax = Math.max(...piSprints.map(s => s.velocity || 0), piTarget || 0, 1);
    const bestSprint = closedSprints.length ? closedSprints.reduce((a, b) => (a.velocity || 0) > (b.velocity || 0) ? a : b) : null;
    const bars = piSprints.map(s => {
        const v = s.velocity || 0;
        const h = Math.max(12, Math.round((v / sparkMax) * 100));
        const isCur = s.state === 'active' || s.name === sprint.name;
        const isClosed = s.state === 'closed';
        const isBreath = _extractIdx(s.name) === breathIdx;
        const isBest = bestSprint && s.name === bestSprint.name && !isCur && !isBreath;
        const cls = isBreath ? 'vel-bar--breath' : isCur ? 'vel-bar--current' : isBest ? 'vel-bar--best' : isClosed ? 'vel-bar--closed' : 'vel-bar--future';
        const stateLbl = isBreath ? '🍃 Sprint de respiration (IP)' : isCur ? 'en cours' : isClosed ? 'clôturé' : 'à venir';
        const liveSuffix = s._live ? ' (calculé live)' : '';
        const goalLine = s.goal ? '\n🎯 ' + s.goal : '';
        const tt = `${s.name} · ${v} pts${liveSuffix} · ${stateLbl}${goalLine}`;
        const ptsInside = h >= 22 && v > 0;
        const breathBadge = isBreath ? '<span class="vel-breath-badge">🍃</span>' : '';
        const name = (s.name || '').match(/\d+\.\d+/)?.[0] || s.name || '';
        return `<div class="vel-bar-wrap" title="${esc(tt)}">
            ${breathBadge}
            <div class="vel-bar ${cls}" style="height:${h}%">${ptsInside ? `<span class="vel-bar-pts">${v}</span>` : ''}</div>
            <div class="vel-bar-name">${esc(name)}</div>
        </div>`;
    }).join('');
    return `
<h2>📈 Vélocité PI ${refPi || ''}</h2>
<div class="vel-card">
    <div class="vel-hdr">
        <div class="vel-title">Vélocité PI ${refPi} <small>${closedSprints.length} sprint${closedSprints.length > 1 ? 's' : ''} clos · ${piTotal} pts livrés</small></div>
        <div class="vel-kpis">
            <div class="vel-kpi vel-kpi--good" title="Moyenne des sprints clôturés"><span class="vel-kpi-val">${piAvg}</span><span class="vel-kpi-lbl">moy. clos</span></div>
            ${piBest ? `<div class="vel-kpi" title="Meilleur sprint clos"><span class="vel-kpi-val">⭐ ${piBest}</span><span class="vel-kpi-lbl">record</span></div>` : ''}
            ${piTargetPct != null ? `<div class="vel-kpi ${piTargetPct >= 100 ? 'vel-kpi--good' : 'vel-kpi--warn'}" title="Moy. clos vs cible : ${piAvg}/${piTarget}"><span class="vel-kpi-val">🎯 ${piTargetPct}%</span><span class="vel-kpi-lbl">vs cible</span></div>` : ''}
        </div>
    </div>
    <div class="vel-spark">${bars}</div>
    <div class="vel-legend">
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#047857"></span>Clôturé</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#1d4ed8"></span>En cours</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#b45309"></span>Record</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#4ade80;border:1px solid #34d399"></span>🍃 Respiration (IP)</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#f1f5f9;border:1px dashed #cbd5e1"></span>À venir</span>
    </div>
</div>` ;
})() : ''}

<h2>🏆 Réalisations <span class="badge">${doneTickets.length} ticket${doneTickets.length > 1 ? 's' : ''} · ${ptsDone} pts</span>${bufferTickets.length > 0 ? ` <span class="badge">🛡️ Buffer : ${doneBuffer.length}/${bufferTickets.length} · ${sumBy(doneBuffer, t => t.points)} pts</span>` : ''}${doneActionRetro.length > 0 ? ` <span class="badge">🔁 Retro : ${doneActionRetro.length}</span>` : ''}</h2>
${doneTickets.length === 0
    ? '<p class="empty">Aucun ticket terminé sur ce sprint.</p>'
    : `<ul class="cr-tickets cr-tickets-merged">${doneTickets.map(renderRow).join('')}</ul>`}

${(moodStats || fistStats) ? `
<h2>🎭 Climat de l'équipe</h2>
<div class="vote-grid">
    ${moodStats ? `
    <div class="vote-card">
        <div class="vote-card-head">
            <span class="vote-card-icon">🎭</span>
            <span class="vote-card-title">Mood Meter</span>
            <span class="vote-card-count">${moodStats.count} vote${moodStats.count > 1 ? 's' : ''}</span>
        </div>
        <div class="vote-card-score" style="color:${_voteColor(moodStats.avg)}">
            ${_voteFace(moodStats.avg)} <strong>${moodStats.avg}</strong><small>/5</small>
        </div>
        <div class="vote-dist">
            ${[1, 2, 3, 4, 5].map(n => {
                const c = moodStats.dist[n];
                const w = moodStats.count ? Math.round((c / moodStats.count) * 100) : 0;
                return `<div class="vote-dist-row"><span class="vote-dist-face">${_voteFace(n)}</span><div class="vote-dist-bar"><div class="vote-dist-fill" style="width:${w}%;background:${_voteColor(n)}"></div></div><span class="vote-dist-count">${c}</span></div>`;
            }).join('')}
        </div>
    </div>` : ''}
    ${fistStats ? `
    <div class="vote-card">
        <div class="vote-card-head">
            <span class="vote-card-icon">✊</span>
            <span class="vote-card-title">Fist of Five — confiance PI</span>
            <span class="vote-card-count">${fistStats.count} vote${fistStats.count > 1 ? 's' : ''}</span>
        </div>
        <div class="vote-card-score" style="color:${_voteColor(fistStats.avg)}">
            <strong>${fistStats.avg}</strong><small>/5</small>
        </div>
        <div class="vote-dist">
            ${[1, 2, 3, 4, 5].map(n => {
                const c = fistStats.dist[n];
                const w = fistStats.count ? Math.round((c / fistStats.count) * 100) : 0;
                const lbl = ['', 'Pas confiant', 'Inquiet', 'Mitigé', 'Confiant', 'Très confiant'][n];
                return `<div class="vote-dist-row"><span class="vote-dist-fist">${n}</span><div class="vote-dist-bar"><div class="vote-dist-fill" style="width:${w}%;background:${_voteColor(n)}"></div></div><span class="vote-dist-label">${lbl}</span><span class="vote-dist-count">${c}</span></div>`;
            }).join('')}
        </div>
    </div>` : ''}
</div>` : ''}

${allActionRetro.length ? `
<h2>🔁 Actions rétro à passer en revue <span class="badge">${allActionRetro.length}</span></h2>
<p class="retro-intro">Tour de table : où en est-on sur chaque action issue des rétros précédentes ?</p>
<div class="retro-list">
    ${allActionRetro.map(t => {
        const pf = _parentFeature(t);
        const stCls = t.status === 'done' ? 'is-done' : t.status === 'blocked' ? 'is-blocked' : t.status === 'inprog' ? 'is-inprog' : 'is-todo';
        const stLbl = t.status === 'done' ? '✓ Terminée' : t.status === 'blocked' ? '✗ Bloquée' : t.status === 'inprog' ? '● En cours' : '○ À faire';
        const leader = t.leader || t.assignee || '';
        // Description : peut être HTML (parseWikiMarkup JIRA → HTML) ou texte brut. On affiche tel quel
        // dans un <details> dépliable pour ne pas alourdir la lecture du tour de table.
        const desc = (t.description || '').trim();
        return `
        <div class="retro-item ${stCls}">
            <div class="retro-item-hdr">
                <span class="retro-status">${stLbl}</span>
                ${link(t.id)}
                <span class="retro-title">${esc(t.title || '(sans titre)')}</span>
                ${leader ? `<span class="retro-owner">— ${esc(leader)}</span>` : ''}
                ${pf ? `<span class="parent-chip">🧭 ${esc(pf.title)}</span>` : ''}
            </div>
            ${desc ? `
            <details class="retro-desc">
                <summary>📝 Voir la description</summary>
                <div class="retro-desc-body">${desc}</div>
            </details>` : ''}
        </div>`;
    }).join('')}
</div>` : ''}

<h2>🔄 À reporter au prochain sprint <span class="badge">${notDone.length} ticket${notDone.length > 1 ? 's' : ''}</span></h2>
${notDone.length === 0
    ? '<p class="empty">🎉 Tous les tickets ont été livrés !</p>'
    : (() => {
        // Groupes par statut dans l'ordre du tri (blocked → inprog → review → test → todo)
        const groups = [
            { key: 'blocked', label: '🚫 Bloqués',   color: '#ef4444' },
            { key: 'inprog',  label: '🔄 En cours',  color: '#3b82f6' },
            { key: 'review',  label: '👁 En review', color: '#8b5cf6' },
            { key: 'test',    label: '🧪 En test',   color: '#f59e0b' },
            { key: 'todo',    label: '⏸ À faire',    color: '#64748b' },
        ];
        const other = notDone.filter(t => !groups.find(g => g.key === t.status));
        return groups.map(g => {
            const list = notDone.filter(t => t.status === g.key);
            if (!list.length) return '';
            return `<div class="wins-group" style="border-left-color:${g.color}">
                <h3 class="wins-group-title"><span>${g.label}</span><span class="wins-group-count">${list.length}</span></h3>
                <ul class="cr-tickets">${list.map(renderRow).join('')}</ul>
            </div>`;
        }).join('') + (other.length ? `<div class="wins-group" style="border-left-color:#94a3b8">
            <h3 class="wins-group-title"><span>Autres</span><span class="wins-group-count">${other.length}</span></h3>
            <ul class="cr-tickets">${other.map(renderRow).join('')}</ul>
        </div>` : '');
    })()}

<h2>⚠️ Points d'attention pour la rétro</h2>
${blocked.length > 0 || scopeCreep.length >= 2
    ? `<div class="attention">
        ${blocked.length > 0 ? `<p><strong>${blocked.length} blocker(s)</strong> non résolu(s) — analyser les causes racines.</p>` : ''}
        ${scopeCreep.length >= 2 ? `<p><strong>Périmètre élargi :</strong> ${scopeCreep.length} ticket(s) ajouté(s) après le début — discuter du processus de priorisation.</p>` : ''}
    </div>`
    : '<div class="attention attention--ok"><strong>👍 Sprint propre :</strong> pas de blocker non résolu ni d\'ajout significatif après début.</div>'}

<h2>🚀 Décisions & prochaines étapes <small class="cr-edit-hint">(éditable — sauvegardé localement)</small></h2>
<div id="cr-decisions" class="notes-zone" contenteditable="true" data-storage-key="${esc('cr-decisions-' + (sprint.name || 'sprint'))}" placeholder="Saisissez ici les décisions prises en réunion…"></div>

<footer class="cr-footer">
    Compte-rendu auto-généré par <strong>Squad Board</strong> le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}<br>
    <small>Tip : Ctrl+P pour imprimer · Ctrl+A puis Ctrl+C pour copier dans Confluence</small>
</footer>

</body>
</html>`;
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

function _typeIcon(type, labels = []) {
    // Labels prioritaires (Amélioration continue, transverses)
    if (Array.isArray(labels)) {
        if (labels.some(l => /^Buffer$/i.test(l)))            return '🛡️';  // buffer / capacité réservée
        if (labels.some(l => /^ActionRetro$/i.test(l)))       return '🔁';  // action de rétro
        if (labels.some(l => /^(Postmortem|PostMortem)$/i.test(l))) return '🩺';
        if (labels.some(l => /^(CoP|CommunityOfPractice)$/i.test(l))) return '🤝';
        if (labels.some(l => /^Adapt$/i.test(l)))             return '🔧';
    }
    switch ((type || '').toLowerCase()) {
        case 'bug':      return '🐛';
        case 'story':    return '📖';
        case 'task':     return '✓';
        case 'spike':    return '🔬';
        case 'epic':     return '🧭';
        case 'feature':  return '✨';
        case 'ops':      return '⚙️';
        case 'debt':     return '💸';
        case 'support':  return '🆘';  // support / incident
        case 'incident': return '🆘';
        default:         return '◇';
    }
}
