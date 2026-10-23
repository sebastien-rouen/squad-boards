/**
 * Volet « Tickets enfants » d'une feature dans la popin (epics, tickets, enfants JIRA à la demande).
 *
 * Extrait de modal.js (3.253.0, > 2 900 lignes) — code déplacé à l'identique. Les dépendances vers
 * modal.js sont CIRCULAIRES mais sans effet au chargement (appelées dans des fonctions seulement) :
 * ne jamais utiliser un import de ./modal.js au niveau racine du module.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, statusBadge } from '../utils.js';
import { STATUS_LABELS } from '../config.js';
import { openTicketModal } from './modal.js';

// ── Sidebar "Tickets enfants" pour les features ─────────────────────────────
// Affichée à droite de la modal quand on ouvre une feature. Liste :
//   1. Les epics enfants (epic.feature === feature.id)
//   2. Les tickets passant par ces epics (ticket.epic === epic.id)
//   3. Les tickets directement reliés à la feature (ticket.epic === feature.id)
//      — cas réel cf. roadmap.js:147, certains projets sautent l'epic intermédiaire.
// Toggle via bouton dans le titlebar — état persisté en localStorage.
export function _renderChildrenSidebar(feature) {
    // Nettoyage des éléments précédents (cas re-render via comment add, status change, etc.)
    document.getElementById('mdl-children-side')?.remove();
    document.getElementById('mdl-children-toggle')?.remove();
    document.getElementById('modal')?.classList.remove('has-children-sidebar');

    if (feature.type !== 'feature') return;

    const allTickets = store.get('tickets') || [];
    const allEpics = store.get('epics') || [];
    const childEpics = allEpics.filter(e => e.feature === feature.id);
    const childEpicIds = new Set(childEpics.map(e => e.id));
    const ticketsViaEpic = allTickets.filter(t => t.epic && childEpicIds.has(t.epic));
    const ticketsDirect = allTickets.filter(t => t.epic === feature.id);
    // Dédup (un ticket pourrait théoriquement matcher les 2 listes)
    const seen = new Set(ticketsViaEpic.map(t => t.id));
    const childTickets = [...ticketsViaEpic, ...ticketsDirect.filter(t => !seen.has(t.id))];
    const total = childEpics.length + childTickets.length;
    // Sur une feature, on affiche TOUJOURS le bouton/sidebar même si 0 enfant —
    // permet à l'utilisateur de confirmer qu'il n'y a rien (au lieu de chercher).
    console.info(`[ChildrenSidebar] Feature ${feature.id} : ${childEpics.length} ${childEpics.length > 1 ? 'epics' : 'epic'} + ${childTickets.length} ${childTickets.length > 1 ? 'tickets' : 'ticket'} (via epic: ${ticketsViaEpic.length}, direct: ${ticketsDirect.length})`);

    // Toggle button injecté dans le titre (avant le bouton next)
    const titleH2 = document.getElementById('modal-title');
    const nextBtn = document.getElementById('mdl-next');
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'mdl-children-toggle';
    toggleBtn.className = 'mdl-nav-btn mdl-children-toggle';
    toggleBtn.title = `Tickets enfants (${total}) — cliquer pour afficher/masquer`;
    toggleBtn.innerHTML = `🌿<span class="mdl-children-toggle-count">${total}</span>`;
    // #mdl-next vit dans .mdl-nav-group (barre de titre en deux lignes) : insertBefore(…, nextBtn) sur le
    // titre lèverait NotFoundError — le bouton va dans la grappe de droite de la ligne de repères.
    const topBar = titleH2.querySelector('.mdl-titlebar-top');
    const spacer = topBar?.querySelector('.mdl-titlebar-spacer');
    if (spacer) spacer.after(toggleBtn);
    else if (nextBtn) nextBtn.after(toggleBtn);
    else titleH2.appendChild(toggleBtn);

    // Sidebar (sibling de #modal pour déborder sur la droite)
    const modalEl = document.getElementById('modal');
    const side = document.createElement('aside');
    side.id = 'mdl-children-side';
    side.className = 'mdl-children-side';
    const _row = (t, type) => `
        <div class="mdl-cs-row" data-ticket-id="${esc(t.id)}" title="${esc(t.title || '')}">
            <span class="badge badge-${esc(type)} badge-2xs">${esc(type)}</span>
            <span class="mdl-cs-id">${esc(t.id)}</span>
            <span class="mdl-cs-title truncate">${esc(t.title || '(sans titre)')}</span>
            ${statusBadge(t, { size: '2xs', label: STATUS_LABELS[t.status] || t.status })}
            <span class="mdl-cs-pts">${t.points ? t.points : '—'}</span>
        </div>`;
    side.innerHTML = `
        <div class="mdl-cs-hdr">
            <span class="mdl-cs-hdr-title">🌿 Enfants <small>(${total})</small></span>
            <button class="mdl-nav-btn" id="mdl-cs-close" title="Masquer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <div class="mdl-cs-body">
            ${total === 0 ? `
                <div class="mdl-cs-empty">
                    <p>Aucun enfant rattaché à cette feature.</p>
                    <p class="text-xs text-muted">Vérifié : <code>epic.feature === ${esc(feature.id)}</code> et <code>ticket.epic === ${esc(feature.id)}</code>.</p>
                </div>` : ''}
            ${childEpics.length ? `
                <div class="mdl-cs-sec-label">Epics (${childEpics.length})</div>
                ${childEpics.map(e => _row(e, 'epic')).join('')}` : ''}
            ${childTickets.length ? `
                <div class="mdl-cs-sec-label">Tickets (${childTickets.length})</div>
                ${childTickets.map(t => _row(t, t.type || 'task')).join('')}` : ''}
        </div>`;
    modalEl.appendChild(side);
    modalEl.classList.add('has-children-sidebar');

    // État ouvert/fermé persisté
    const KEY = 'sb-mdl-children-visible';
    let visible = localStorage.getItem(KEY) !== 'false';
    const apply = () => {
        side.classList.toggle('is-visible', visible);
        toggleBtn.classList.toggle('is-active', visible);
        localStorage.setItem(KEY, visible ? 'true' : 'false');
    };
    apply();

    toggleBtn.addEventListener('click', () => { visible = !visible; apply(); });
    side.querySelector('#mdl-cs-close')?.addEventListener('click', () => { visible = false; apply(); });
    const _wireRows = (root) => root.querySelectorAll('.mdl-cs-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.ticketId;
            const jiraOnly = row.dataset.jiraOnly === '1';
            if (!id) return;
            if (jiraOnly) {
                // Ticket non importé en base — ouvre dans JIRA externe (sinon ouverture modale vide)
                const base = store.get('jiraUrl');
                if (base) window.open(`${base}/browse/${id}`, '_blank', 'noopener');
            } else {
                openTicketModal(id);
            }
        });
    });
    _wireRows(side);

    // Lazy-fetch JIRA : récupère les enfants directs (parent + Epic Link) et ajoute
    // ceux qui ne sont pas en base locale. Permet de voir un cas réel comme GCOM-2457
    // dont les enfants sont en JIRA mais hors périmètre de sync (status=done historique).
    _fetchJiraChildren(feature.id).then(remote => {
        if (!remote || !remote.length) return;
        const localIds = new Set([
            ...childEpics.map(e => e.id),
            ...childTickets.map(t => t.id),
        ]);
        const remoteOnly = remote.filter(t => !localIds.has(t.id));
        if (!remoteOnly.length) return;

        // Append nouvelle section dans le body
        const body = side.querySelector('.mdl-cs-body');
        if (!body) return;
        // Retire le message "Aucun enfant" si présent (on a maintenant du contenu)
        body.querySelector('.mdl-cs-empty')?.remove();
        const sec = document.createElement('div');
        sec.innerHTML = `
            <div class="mdl-cs-sec-label">📡 Présents dans JIRA, non en base (${remoteOnly.length})</div>
            ${remoteOnly.map(t => `
                <div class="mdl-cs-row mdl-cs-row--jira" data-ticket-id="${esc(t.id)}" data-jira-only="1" title="${esc(t.title || '')} — clic pour ouvrir dans JIRA">
                    <span class="badge badge-${esc((t.type || 'task').toLowerCase())} badge-2xs">${esc((t.type || 'task').toLowerCase())}</span>
                    <span class="mdl-cs-id">${esc(t.id)}</span>
                    <span class="mdl-cs-title truncate">${esc(t.title || '(sans titre)')}</span>
                    <span class="badge badge-jira-only badge-2xs" title="Ticket non importé en base locale">JIRA</span>
                </div>
            `).join('')}
        `;
        body.appendChild(sec);
        _wireRows(sec);

        // Mets à jour le compteur du bouton toggle
        const newTotal = total + remoteOnly.length;
        const countSpan = toggleBtn.querySelector('.mdl-children-toggle-count');
        if (countSpan) countSpan.textContent = newTotal;
        toggleBtn.title = `Tickets enfants (${newTotal}, dont ${remoteOnly.length} hors base) — cliquer pour afficher/masquer`;
        // Mets à jour le compteur dans le header de la sidebar
        const hdrTitle = side.querySelector('.mdl-cs-hdr-title');
        if (hdrTitle) hdrTitle.innerHTML = `🌿 Enfants <small>(${newTotal})</small>`;
        console.info(`[ChildrenSidebar] Feature ${feature.id} : +${remoteOnly.length} ${remoteOnly.length > 1 ? 'tickets' : 'ticket'} récupérés depuis JIRA (non en base locale)`);
    });
}

// Fetch direct via le proxy JIRA local — enfants d'une feature (Feature parent ou Epic Link).
// Renvoie une liste simplifiée { id, title, type, status }. Silencieux si proxy KO.
async function _fetchJiraChildren(featureId) {
    if (!featureId) return [];
    try {
        const res = await fetch('/jira/rest/api/3/search/jql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jql: `parent = ${featureId} OR "Epic Link" = ${featureId}`,
                fields: ['summary', 'issuetype', 'status'],
                maxResults: 100,
            }),
        });
        if (!res.ok) return [];
        const j = await res.json();
        return (j.issues || []).map(i => ({
            id: i.key,
            title: i.fields?.summary || '',
            type: i.fields?.issuetype?.name || 'task',
            status: i.fields?.status?.name || '',
        }));
    } catch { return []; }
}
