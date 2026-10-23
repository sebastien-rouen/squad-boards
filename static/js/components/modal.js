/**
 * Modal component - rich ticket detail, create/edit forms.
 * Wide layout, 2-column meta, reporter, links, ADF description.
 *
 * Découpé en 3.253.0 : sélecteurs (ticket_pickers.js), description & commentaires (ticket_desc.js),
 * en-tête (ticket_head.js), édition en place (ticket_inline_edit.js), Poker (poker_modal.js),
 * formulaires (ticket_forms.js), volet enfants (ticket_children.js). Ici : ouverture, rendu du corps, navigation.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, fmtRelative, initials, hashColor, toast, toastUndo, copyToClipboard, confirmDanger, typeBadge, trapFocus, scrollToEl, rememberTicket } from '../utils.js';
import { ticketFlowModel, ticketFlowHtml, bindTicketFlow } from './ticket_flow.js';
import { mountReadyGuide } from './ticket_ready.js';
import { ticketHistoryHtml, bindTicketHistory } from './ticket_history.js';
import { STATUS_LABELS, STATUS_ORDER, TYPE_LABELS, TYPE_ICONS } from '../config.js';
import { _pokerRoundsHtml } from './poker_modal.js';
import { _renderChildrenSidebar } from './ticket_children.js';
import { _bindDescriptionEditor, _renderCommentBody } from './ticket_desc.js';
import { openCreateModal, openEditModal } from './ticket_forms.js';
import { _flowPref, _isFull, _presenceOf, _ticketHeadHtml } from './ticket_head.js';
import { _bindInlineEditors } from './ticket_inline_edit.js';
import { _openChipDropdown } from './ticket_pickers.js';
// API publique inchangée (app.js, settings.js, backlog.js) : ré-exports des modules extraits
export { makePersonPicker } from './ticket_pickers.js';
export { openCreateModal, openEditModal } from './ticket_forms.js';


export const overlay = () => document.getElementById('modal-overlay');
export const titleEl = () => document.getElementById('modal-title');

// Icônes des statuts — même esprit que TYPE_ICONS (création de ticket), pour une chip-sel-group
// homogène entre la modale de création (type) et le sélecteur de statut de la modale détail.
const STATUS_ICONS = { todo: '📋', inprog: '🔄', review: '👀', test: '🧪', blocked: '🚫', done: '✅' };

/** Prénom affiché devant une bande de présence : « NOM, Prénom » (import RH) → Prénom ; « Prénom Nom » (JIRA) → Prénom. */
const _firstName = n => { const s = String(n || ''); const i = s.indexOf(','); return (i >= 0 ? s.slice(i + 1) : s).trim().split(/\s+/)[0] || s; };

export const bodyEl = () => document.getElementById('modal-body');

export function initModal() {
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-fullpage')?.addEventListener('click', () => {
        const isFs = document.getElementById('modal')?.classList.toggle('modal--fullscreen');
        document.getElementById('modal-overlay')?.classList.toggle('modal-overlay--fullscreen', isFs);
        // Met à jour l'icône : expand ↔ compress
        const btn = document.getElementById('modal-fullpage');
        if (btn) btn.title = isFs ? 'Réduire' : 'Pleine page';
        // Modale TICKET : la pleine page n'est pas qu'un agrandissement — elle re-rend une vue
        // détaillée (voyage ouvert, deux colonnes, historique complet).
        const cur = _modalList[_modalIdx];
        if (cur && bodyEl()?.querySelector('.mdl-head')) openTicketModal(cur.id);
    });
    overlay()?.addEventListener('click', e => { if (e.target === overlay()) closeModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !overlay().classList.contains('hidden')) {
            // Popin au-dessus d'une autre couche (vue agrandie, Démo, alertes) : Échap ne ferme QU'ELLE —
            // sans stopImmediatePropagation, l'écouteur de la couche dessous, appelé juste après, voyait la
            // popin déjà fermée et se fermait aussi.
            const onTop = overlay().classList.contains('above-demo');
            closeModal();
            if (onTop) e.stopImmediatePropagation();
        }
    });
    window.__squadBoard = window.__squadBoard || {};
    window.__squadBoard.openTicketModal = openTicketModal;
    window.__squadBoard.openCreateModal = openCreateModal;
    window.__squadBoard.openEditModal = openEditModal;
}

export let _modalList = [];
export let _modalIdx = -1;
let _releaseFocusTrap = null; // piège à focus actif (cf utils.trapFocus)

export function closeModal() {
    overlay().classList.add('hidden');
    // Libère le piège à focus + restaure le focus sur l'élément déclencheur
    if (_releaseFocusTrap) { _releaseFocusTrap(); _releaseFocusTrap = null; }
    // .above-demo (bump z-index au-dessus d'une Demo/alert ouverte) ne doit pas survivre à la
    // fermeture — sinon il reste collé et passe devant le Planning Poker (z-index 2000) sur les
    // ouvertures suivantes, même hors contexte Demo.
    overlay().classList.remove('above-demo');
    // Nettoyage de la sidebar enfants (features) — sinon elle persiste sur la prochaine ouverture
    document.getElementById('mdl-children-side')?.remove();
    document.getElementById('mdl-children-toggle')?.remove();
    document.getElementById('modal')?.classList.remove('has-children-sidebar');
    document.getElementById('modal')?.removeAttribute('data-status');
    // B : retour navigateur propre — évite de laisser le hash /ticket/XXX dans l'historique
    if (/\/ticket\//.test(location.hash)) {
        history.back();
    }
}
export function showModal() {
    const wasHidden = overlay().classList.contains('hidden');
    overlay().classList.remove('hidden');
    // Piège à focus : Tab boucle dans la modale, focus restauré à la fermeture.
    // (Uniquement à la 1re ouverture — les navigations précédent/suivant réutilisent le piège.)
    if (wasHidden && !_releaseFocusTrap) {
        _releaseFocusTrap = trapFocus(document.getElementById('modal'));
    }
}

export function getMemberNames() {
    return (store.get('members') || []).map(m => m.name || m);
}

export function avatar(name, isLeader = false, size = 24) {
    if (!name) return '';
    return `<span class="assignee-avatar${isLeader ? ' leader' : ''}" style="background:${hashColor(name)};color:white;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px" title="${esc(name)}">${esc(initials(name))}</span>`;
}

export function personChip(name, role = '') {
    if (!name) return `<span class="mdl-empty">+ Assigner</span>`;
    return `<span class="inline-flex-center">${avatar(name, role === 'leader', 22)} <span>${esc(name)}</span></span>`;
}

/**
 * Liste des sprints associés à un ticket :
 * - `sprintName` (sprint courant côté JIRA, source de vérité).
 * - Sprints historiques extraits de `recentChanges` (changelog JIRA field=Sprint).
 *   JIRA stocke `from`/`to` en liste comma-separated de noms — on union.
 *
 * Retourne `[{ name, isCurrent }]`, sprint courant en premier.
 */
export function _sprintsHistoryOfTicket(ticket) {
    const current = (ticket?.sprintName || '').trim();
    const names = new Set();
    if (current) names.add(current);

    const changes = ticket?.recentChanges || ticket?.recent_changes || [];
    for (const c of changes) {
        const f = (c.field || '').toLowerCase().trim();
        if (f !== 'sprint') continue;
        for (const raw of [c.from, c.to]) {
            if (!raw) continue;
            String(raw).split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
        }
    }
    const out = [...names].map(n => ({ name: n, isCurrent: n === current }));
    out.sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
    return out;
}

/** Date+heure complète FR pour le survol de l'historique : "mer. 17 juin, 14:32". */
export function _fmtHistDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Ticket Detail - rich layout
// ══════════════════════════════════════════════════════════════════════════════
export function openTicketModal(ticketId) {
    const tickets = store.get('tickets') || [];
    const epics = store.get('epics') || [];
    const features = store.get('features') || [];
    const all = [...tickets, ...epics, ...features];
    const ticket = all.find(t => t.id === ticketId);
    if (ticket) rememberTicket(ticketId);   // palette Ctrl+K : « 🎫 Tickets récents »
    if (!ticket) return;

    // Track navigation context
    _modalList = all;
    _modalIdx = all.findIndex(t => t.id === ticketId);

    const jiraUrl = store.get('jiraUrl');
    const jiraLink = jiraUrl ? `${jiraUrl}/browse/${ticket.id}` : null;

    const leader = ticket.leader || ticket.assignee;
    const reporter = ticket.reporter || null;
    const contributors = (ticket.contributors || []).filter(c => c && c !== leader);
    // Présence calculée UNE fois par contributeur : chip (🌴 si absent) ET bande sous la liste
    const contribPres = contributors.map(c => ({ c, pres: _presenceOf(c, ticket) }));
    const comments = ticket.comments || [];
    const links = ticket.links || [];
    const description = ticket.description || '';

    // ── G : bordure statut sur la modale ─────────────────────────────────────
    const modalEl = document.getElementById('modal');
    if (modalEl) {
        modalEl.dataset.status = ticket.status;
    }

    // ── Title bar : repères du ticket (ligne 1) + titre complet sur 2 lignes max (ligne 2) ──
    // Le style vit sous `.mdl-titlebar` / `#modal:has(.mdl-titlebar)` : #modal est partagé
    // par toutes les modales, les autres gardent l'en-tête d'origine.
    const _svgCopy = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const _svgLink = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
    const _svgSync = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
    titleEl().innerHTML = `
        <span class="mdl-titlebar">
            <span class="mdl-titlebar-top">
                <span class="mdl-nav-group" role="group" aria-label="Navigation entre tickets">
                    <button class="mdl-nav-btn${_modalIdx <= 0 ? ' disabled' : ''}" id="mdl-prev" title="Précédent (←)" aria-label="Ticket précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
                    <button class="mdl-nav-btn${_modalIdx >= all.length - 1 ? ' disabled' : ''}" id="mdl-next" title="Suivant (→)" aria-label="Ticket suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
                </span>
                <!-- D : badge type — clic = liste déroulante des types -->
                ${typeBadge(ticket.type, { extra: 'mdl-type-badge', attrs: 'id="mdl-type-badge-link" title="Cliquer pour modifier le type"', title: false })}
                <span class="mdl-key">
                    ${jiraLink
                        ? `<a class="mdl-ticket-link" href="${esc(jiraLink)}" target="_blank" rel="noopener" title="Ouvrir dans JIRA">${esc(ticket.id)}</a>`
                        : `<span class="mdl-ticket-id">${esc(ticket.id)}</span>`}
                    <button class="copy-btn copy-btn--always" id="mdl-copy-key" data-copy-key="${esc(ticket.id)}" data-copy-title="${esc(ticket.title)}" title="Copier '${esc(ticket.id)} - ${esc(ticket.title)}'">${_svgCopy}</button>
                    <!-- E : copie URL JIRA -->
                    ${jiraLink ? `<button class="copy-btn copy-btn--always" id="mdl-copy-url" title="Copier le lien JIRA">${_svgLink}</button>` : ''}
                    <!-- Synchro JIRA (3.248.0, jira_ticket_sync.js) : tickets, features et epics -->
                    ${jiraLink ? `<button class="copy-btn copy-btn--always mdl-jira-sync" id="mdl-jira-sync" title="Comparer avec JIRA : mettre à jour ou pousser" aria-label="Synchroniser avec JIRA">${_svgSync}</button>` : ''}
                </span>
                <span class="mdl-titlebar-spacer"></span>
                <!-- C : badge commentaires -->
                ${comments.length ? `<button class="mdl-comments-badge" id="mdl-scroll-comments" title="Voir les commentaires">💬 ${comments.length}</button>` : ''}
                <!-- H : avatar leader -->
                ${leader ? `<span class="mdl-header-avatar" style="background:${hashColor(leader)}" title="Leader : ${esc(leader)}">${esc(initials(leader))}</span>` : ''}
            </span>
            <span class="mdl-title-span" id="mdl-title-span" title="${esc(ticket.title)} — cliquer pour modifier">${esc(ticket.title)}</span>
        </span>
    `;

    // ── Body ──────────────────────────────────────────────────────────────────
    const isFull = _isFull();
    bodyEl().innerHTML = `
        ${_ticketHeadHtml(ticket, all)}

        <!-- Mise en page : en modale, une seule colonne dans l'ordre historique (CSS « order », les deux
             conteneurs en display:contents) ; en PLEINE PAGE, description à gauche, activité à droite. -->
        <div class="mdl-layout">
        <aside class="mdl-aside" aria-label="Personnes et activité">
        <!-- Personnes : une rangée de trois cellules (labels et historique de sprint = bas de l'en-tête) -->
        <section class="mdl-panel mdl-people" aria-label="Personnes">
            <div class="mdl-field" data-role="leader">
                <span class="mdl-field-label">Leader</span>
                <span class="mdl-field-value editable-field" data-field="leader" data-value="${esc(leader || '')}">${personChip(leader, 'leader')}</span>
                ${_presenceOf(leader, ticket).html}
            </div>
            <div class="mdl-field" data-role="reporter">
                <span class="mdl-field-label">Rapporteur</span>
                <span class="mdl-field-value editable-field" data-field="reporter" data-value="${esc(reporter || '')}">${personChip(reporter)}</span>
                ${_presenceOf(reporter, ticket).html}
            </div>
            <div class="mdl-field" data-role="contrib">
                <span class="mdl-field-label">Contributeurs</span>
                <span class="mdl-field-value flex-wrap" id="contrib-inline-wrap">
                    ${contribPres.map(({ c, pres }) => {
                        const away = pres.absentNow;
                        return `<span class="chip chip-gap${away ? ' chip--away' : ''}"${away ? ` title="${esc(c)} est absent·e aujourd'hui"` : ''}>${avatar(c, false, 18)} ${esc(c)}${away ? ' 🌴' : ''} <button type="button" class="contrib-rm" data-name="${esc(c)}" title="Retirer">×</button></span>`;
                    }).join('')}
                    <button type="button" class="contrib-add-btn" id="contrib-add-btn" title="Ajouter un contributeur">+ Ajouter</button>
                </span>
                <!-- Présence de chaque contributeur (même bande que Leader / Rapporteur), hors du conteneur des chips :
                     le câblage ajout / retrait lit les .contrib-rm de #contrib-inline-wrap -->
                ${contribPres.length ? `<div class="mdl-contrib-pres-list">${contribPres.map(({ c, pres }) =>
                    `<div class="mdl-contrib-pres" data-name="${esc(c)}"><span class="mdl-contrib-pres-name" title="${esc(c)}">${esc(_firstName(c))}</span>${pres.html}</div>`).join('')}</div>` : ''}
            </div>
        </section>

        </aside>
        <div class="mdl-main">
        <!-- Description (wysiwyg inline) -->
        <div class="mdl-desc-wrap" id="desc-wrap">
            <div class="mdl-desc-header">
                <span class="mdl-section-label">Description</span>
                <button aria-label="Modifier la description" type="button" class="btn-icon mdl-desc-edit-btn" id="desc-edit-btn" title="Modifier la description">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
            </div>
            <div class="mdl-description mdl-desc-view" id="desc-view">
                ${_renderCommentBody(ticket.description) || '<p class="text-muted text-sm desc-placeholder">Aucune description. Cliquez pour ajouter.</p>'}
            </div>
            <div class="mdl-desc-editor hidden" id="desc-editor">
                <div class="desc-toolbar" id="desc-toolbar">
                    <button type="button" class="desc-tb-btn" data-cmd="bold" title="Gras (Ctrl+B)"><b>B</b></button>
                    <button type="button" class="desc-tb-btn" data-cmd="italic" title="Italique (Ctrl+I)"><i>I</i></button>
                    <button type="button" class="desc-tb-btn" data-cmd="underline" title="Souligné (Ctrl+U)"><u>U</u></button>
                    <button type="button" class="desc-tb-btn" data-cmd="strikeThrough" title="Barré"><s>S</s></button>
                    <span class="desc-tb-sep"></span>
                    <button type="button" class="desc-tb-btn" data-cmd="formatBlock" data-val="h2" title="Titre H2">H2</button>
                    <button type="button" class="desc-tb-btn" data-cmd="formatBlock" data-val="h3" title="Sous-titre H3">H3</button>
                    <button type="button" class="desc-tb-btn" data-cmd="formatBlock" data-val="p" title="Paragraphe">¶</button>
                    <span class="desc-tb-sep"></span>
                    <button type="button" class="desc-tb-btn" data-cmd="insertUnorderedList" title="Liste à puces">• UL</button>
                    <button type="button" class="desc-tb-btn" data-cmd="insertOrderedList" title="Liste numérotée">1. OL</button>
                    <span class="desc-tb-sep"></span>
                    <button type="button" class="desc-tb-btn" id="desc-tb-link" title="Insérer un lien">🔗</button>
                    <button type="button" class="desc-tb-btn" data-cmd="unlink" title="Retirer le lien">⛓</button>
                    <button type="button" class="desc-tb-btn" id="desc-tb-img" title="Insérer une image">🖼</button>
                    <button type="button" class="desc-tb-btn" data-cmd="removeFormat" title="Effacer le formatage">Aa×</button>
                </div>
                <div contenteditable="true" class="mdl-description desc-editable" id="desc-content"></div>
                <div class="desc-editor-actions">
                    <span class="text-xs text-muted">Ctrl+Entrée · Échap pour annuler</span>
                    <button class="btn btn-secondary btn-sm" type="button" id="desc-cancel">Annuler</button>
                    <button class="btn btn-primary btn-sm" type="button" id="desc-save">Enregistrer</button>
                </div>
            </div>
        </div>

        <!-- Issue Links -->
        ${links.length ? `
            <div class="mdl-links">
                <div class="mdl-links-title">Liens (${links.length})</div>
                ${links.map(l => `
                    <div class="mdl-link-row">
                        <span class="mdl-link-type">${esc(l.type || 'lie a')}</span>
                        <span class="mdl-link-id" data-ticket-id="${esc(l.id)}">${esc(l.id)}</span>
                        <span class="mdl-link-title">${esc(l.title)}</span>
                        ${l.status ? `<span class="badge badge-status badge-2xs">${esc(l.status)}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : ''}

        </div>
        <div class="mdl-aside-tail">
        <!-- Tours de Planning Poker conclus — chargés à la demande (hors /api/all), cachés s'il n'y en a pas -->
        <details open class="mb-4 mdl-poker-rounds" id="mdl-poker-rounds" data-ticket="${esc(ticket.id)}" hidden>
            <summary class="text-xs font-semibold text-muted mb-2">🃏 Estimations en équipe (<span data-pr-count>0</span>)</summary>
            <div class="mdl-pr-list"></div>
        </details>
        <!-- Historique : frise colorée par jour / auteur / catégorie (ticket_history.js) — pleine page : déplié et
             COMPLET ; en modale : les 12 plus récents -->
        ${ticketHistoryHtml(ticket, { full: isFull })}

        <!-- Comments -->
        <details open class="mb-4 mdl-comments">
            <summary class="text-xs font-semibold text-muted mb-2">Commentaires (${comments.length})</summary>
            <div class="comment-list" id="comment-list">
                ${comments.length ? comments.map(c => `
                    <div class="comment-item">
                        <span class="comment-avatar" style="background:${hashColor(c.author)}">${esc(initials(c.author))}</span>
                        <div class="comment-content">
                            <div class="comment-header">
                                <span class="comment-author">${esc(c.author)}</span>
                                <span class="comment-date">${fmtRelative(c.date)}</span>
                                <button aria-label="Supprimer" class="btn-icon comment-delete" data-comment-id="${esc(c.id)}" title="Supprimer"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>
                            </div>
                            <div class="comment-body adf-body">${_renderCommentBody(c.body)}</div>
                        </div>
                    </div>
                `).join('') : '<p class="text-muted text-sm">Aucun commentaire</p>'}
            </div>
            <div class="comment-form">
                <textarea class="input" id="comment-text" placeholder="Ajouter un commentaire..." rows="2"></textarea>
                <button class="btn btn-primary btn-sm self-end" id="btn-add-comment">Envoyer</button>
            </div>
        </details>

        </div>
        </div>

        <!-- Actions -->
        <div class="form-actions">
            ${jiraLink ? `<a href="${esc(jiraLink)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><svg class="icon icon-sm"><use href="#i-external"/></svg> JIRA</a>` : ''}
            <button class="btn btn-secondary btn-sm" id="btn-edit-ticket"><svg class="icon icon-sm"><use href="#i-settings"/></svg> Modifier</button>
            <button class="btn btn-danger btn-sm" id="btn-delete-ticket"><svg class="icon icon-sm"><use href="#i-x"/></svg> Supprimer</button>
        </div>
    `;

    // Sidebar latérale "Tickets enfants" — uniquement si ticket.type === 'feature'
    _renderChildrenSidebar(ticket);

    // ── Wire events ───────────────────────────────────────────────────────────
    bodyEl().querySelector('#btn-add-comment')?.addEventListener('click', async () => {
        const text = bodyEl().querySelector('#comment-text')?.value?.trim();
        if (!text) return;
        try {
            await api.addComment(ticket.id, { body: text, author: 'Utilisateur' });
            await refreshData();
            openTicketModal(ticketId);
        } catch (err) { toast(err.message, 'error'); }
    });

    bodyEl().querySelectorAll('.comment-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await confirmDanger('Supprimer ce commentaire ?', 'Cette action est irréversible.');
            if (!ok) return;
            try { await api.deleteComment(ticket.id, btn.dataset.commentId); await refreshData(); openTicketModal(ticketId); }
            catch (err) { toast(err.message, 'error'); }
        });
    });

    // Click on linked ticket IDs
    bodyEl().querySelectorAll('.mdl-link-id[data-ticket-id]').forEach(el => {
        el.addEventListener('click', () => openTicketModal(el.dataset.ticketId));
    });

    // Open linked epic/feature in a new modal
    bodyEl().querySelectorAll('.btn-open-linked[data-ticket-id]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            openTicketModal(el.dataset.ticketId);
        });
    });

    // Tuiles de l'en-tête : un clic sur la tuile (hors bouton / champ éditable) relaie vers son
    // éditeur — statut (badge), points. (La tuile Sprint EST l'éditeur du sprint : #sprint-field.)
    bodyEl().querySelectorAll('.mdl-prop[data-proxy]').forEach(tile => {
        tile.addEventListener('click', e => {
            const target = document.getElementById(tile.dataset.proxy);
            if (!target || target.contains(e.target) || e.target.closest('button, .editable-field')) return;
            target.click();
        });
    });

    // Tours de Poker conclus : chargés après le rendu (garde : la modale a pu changer de ticket entre-temps)
    api.getPokerRounds(ticket.id).then(rounds => {
        const box = bodyEl()?.querySelector('#mdl-poker-rounds');
        if (!box || box.dataset.ticket !== ticket.id || !rounds?.length) return;
        box.querySelector('[data-pr-count]').textContent = rounds.length;
        box.querySelector('.mdl-pr-list').innerHTML = _pokerRoundsHtml(rounds);
        box.hidden = false;
    }).catch(() => { /* historique facultatif : la modale reste utilisable sans */ });

    // Tuile Flux → panneau « Le voyage du ticket » (rendu à la demande : le modèle relit l'équipe).
    const flowTile = bodyEl().querySelector('#mdl-flow-tile');
    const flowPanel = bodyEl().querySelector('#mdl-flow-panel');
    if (flowTile && flowPanel) {
        const renderFlow = () => {
            const model = ticketFlowModel(ticket, tickets.filter(x => x.team && x.team === ticket.team));
            flowPanel.innerHTML = ticketFlowHtml(model);
            bindTicketFlow(flowPanel, model);
        };
        const toggleFlow = () => {
            const open = flowPanel.hidden;
            _flowPref[_isFull() ? 'full' : 'normal'] = open;
            flowTile.classList.toggle('is-open', open);
            flowTile.setAttribute('aria-expanded', String(open));
            flowPanel.hidden = !open;
            if (open) renderFlow();
        };
        flowTile.addEventListener('click', toggleFlow);
        flowTile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFlow(); } });
        if (!flowPanel.hidden) renderFlow();
    }

    bodyEl().querySelector('#btn-edit-ticket')?.addEventListener('click', () => { closeModal(); openEditModal(ticket); });

    // Suppression ANNULABLE : le ticket disparaît tout de suite de l'écran, l'API n'est appelée
    // qu'après 8 s sans « Annuler » — plus de confirmation bloquante pour un geste réversible
    // (`confirmDanger` reste réservé à l'irréversible, ex. régénérer une rotation).
    bodyEl().querySelector('#btn-delete-ticket')?.addEventListener('click', () => {
        const key = ticket.type === 'feature' ? 'features' : ticket.type === 'epic' ? 'epics' : 'tickets';
        const del = ticket.type === 'feature' ? api.deleteFeature : ticket.type === 'epic' ? api.deleteEpic : api.deleteTicket;
        const before = store.get(key) || [];
        store.set(key, before.filter(t => t.id !== ticket.id));
        closeModal();
        window.__squadBoard.rerenderView?.();
        toastUndo(`${ticket.id} supprimé`, {
            onUndo: () => { store.set(key, before); window.__squadBoard.rerenderView?.(); },
            onCommit: async () => {
                try { await del(ticket.id); await refreshData(); }
                catch (err) { toast(err.message, 'error'); store.set(key, before); }
                window.__squadBoard.rerenderView?.();
            },
        });
    });

    // E : copie URL JIRA
    document.getElementById('mdl-copy-url')?.addEventListener('click', () => {
        if (jiraLink) copyToClipboard(jiraLink, 'Lien JIRA copié');
    });

    // Synchro JIRA du ticket : module chargé à la demande (il tire sync-parse.js).
    document.getElementById('mdl-jira-sync')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.classList.add('is-busy');
        btn.disabled = true;
        try {
            const { openJiraTicketSync } = await import('./jira_ticket_sync.js');
            await openJiraTicketSync(ticket, {
                host: bodyEl(),
                onApplied: () => { openTicketModal(ticket.id); window.__squadBoard?.rerenderView?.(); },
            });
        } catch (err) { toast(err.message, 'error'); }
        finally { btn.classList.remove('is-busy'); btn.disabled = false; }
    });


    // C : scroll vers les commentaires
    document.getElementById('mdl-scroll-comments')?.addEventListener('click', () => {
        const commentList = bodyEl().querySelector('#comment-list') || bodyEl().querySelector('details');
        if (commentList) {
            const details = commentList.closest('details') || commentList.querySelector('details');
            if (details) details.open = true;
            scrollToEl(commentList);   // défile la modale seule (utils/scroll.js)
        }
    });

    // D : badge de type → liste déroulante de chips (même style que la modale de création)
    // ancrée juste sous le badge, plutôt qu'une chip-sel-group permanente dans la ligne meta.
    document.getElementById('mdl-type-badge-link')?.addEventListener('click', e => {
        const items = Object.entries(TYPE_LABELS)
            .filter(([v]) => !['epic', 'feature'].includes(v))
            .map(([v, l]) => ({ val: v, label: `${TYPE_ICONS[v] || ''} ${esc(l)}` }));
        _openChipDropdown(e.currentTarget, items, ticket.type, async (val) => {
            try {
                const col = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
                await col(ticket.id, { type: val });
                await refreshData();
                openTicketModal(ticket.id);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Badge de statut → même mécanisme de liste déroulante que le type.
    document.getElementById('mdl-status-badge-link')?.addEventListener('click', e => {
        const items = STATUS_ORDER.map(s => ({ val: s, label: `${STATUS_ICONS[s] || ''} ${esc(STATUS_LABELS[s])}` }));
        _openChipDropdown(e.currentTarget, items, ticket.status, async (val) => {
            try {
                const col = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
                await col(ticket.id, { status: val });
                await refreshData();
                toast(`Statut → ${STATUS_LABELS[val]}`, 'success');
                openTicketModal(ticket.id);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Bouton copier (clé + titre)
    document.getElementById('mdl-copy-key')?.addEventListener('click', e => {
        const btn = e.currentTarget;
        const key = btn.dataset.copyKey || '';
        const title = btn.dataset.copyTitle || '';
        copyToClipboard(`${key} - ${title}`, 'Copié');
    });

    _bindDescriptionEditor(bodyEl(), ticket);
    // Le badge de type ([data-field="type"]) vit dans la barre de titre (titleEl()), pas dans
    // le corps — binder sur #modal (ancêtre commun titre+corps) au lieu de bodyEl() seul,
    // sinon son clic ne déclenche jamais le picker (footgun : "je ne vois pas pour modifier le type").
    _bindInlineEditors(document.getElementById('modal') || bodyEl(), ticket);
    bindTicketHistory(bodyEl());         // 🕘 filtres de l'historique
    mountReadyGuide(bodyEl(), ticket);   // ✨ « Prêt à estimer ? » : champs requis + guide animé (ticket_ready.js)

    // Prev/Next buttons
    document.getElementById('mdl-prev')?.addEventListener('click', () => {
        if (_modalIdx > 0) openTicketModal(_modalList[_modalIdx - 1].id);
    });
    document.getElementById('mdl-next')?.addEventListener('click', () => {
        if (_modalIdx < _modalList.length - 1) openTicketModal(_modalList[_modalIdx + 1].id);
    });

    // Ouverte depuis un graphique AGRANDI (clic sur un ticket du Lead time…) : la vue agrandie est au même
    // niveau (`--z-modal`) et, ajoutée plus tard au DOM, passait DEVANT la popin. `.above-demo` (z 11000)
    // la remet au premier plan ; closeModal la retire.
    if (document.querySelector('.chart-zoom-overlay--open')) overlay().classList.add('above-demo');

    // Sync URL hash — replaceState si la modale est déjà ouverte (navigation prev/next)
    // pour éviter d'empiler des entrées qui forcent plusieurs "retours" à la fermeture.
    // `/poker` final compris : ouvrir un ticket depuis la popin (« Suivant à estimer ») empilait sinon
    // « …/ticket/A/poker/ticket/B ».
    const baseHash = location.hash.replace(/^#/, '').replace(/\/ticket\/[^/]+(\/poker)?$/, '') || store.get('view') || 'dashboard';
    const targetHash = `#${baseHash}/ticket/${encodeURIComponent(ticketId)}`;
    if (location.hash !== targetHash) {
        if (!overlay().classList.contains('hidden')) history.replaceState(null, '', targetHash);
        else history.pushState(null, '', targetHash);
    }

    showModal();
}

// ── Refresh ───────────────────────────────────────────────────────────────────
export async function refreshData() {
    try {
        const [tickets, features, epics, members, teams] = await Promise.all([
            api.getTickets(), api.getFeatures(), api.getEpics(), api.getMembers(), api.getTeams(),
        ]);
        store.set('tickets', tickets); store.set('features', features); store.set('epics', epics);
        store.set('members', members);
        store.set('teams', teams.map(t => typeof t === 'string' ? t : t.name));
        store.set('teamObjects', teams);
    } catch { /* silent */ }
}
