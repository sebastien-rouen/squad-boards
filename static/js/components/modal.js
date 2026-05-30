/**
 * Modal component - rich ticket detail, create/edit forms.
 * Wide layout, 2-column meta, reporter, links, ADF description.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, fmtDate, fmtDateLong, fmtRelative, initials, hashColor, toast, parseWikiMarkup, copyToClipboard, confirmDanger, fieldLabelFr } from '../utils.js';
import { STATUS_LABELS, STATUS_ORDER, TYPE_LABELS } from '../config.js';

const overlay = () => document.getElementById('modal-overlay');
const titleEl = () => document.getElementById('modal-title');

// ── Epic picker : récents (localStorage) + autocomplete + tri alpha ─────────
const _RECENT_EPICS_KEY = 'sb-recent-epics';
const _RECENT_EPICS_MAX = 8;
function _getRecentEpics() {
    try { return JSON.parse(localStorage.getItem(_RECENT_EPICS_KEY) || '[]'); }
    catch { return []; }
}
function _pushRecentEpic(id) {
    if (!id) return;
    const cur = _getRecentEpics().filter(x => x !== id);
    cur.unshift(id);
    localStorage.setItem(_RECENT_EPICS_KEY, JSON.stringify(cur.slice(0, _RECENT_EPICS_MAX)));
}

/**
 * Combobox personnalisé pour sélectionner un Epic.
 * - Input text avec filter live (sur clé + titre)
 * - Section "Récents" en haut (8 derniers utilisés sur cet appareil, localStorage)
 * - Section "Tous (A-Z)" triée alphabétiquement par titre
 * - Option "— Aucun" pour détacher
 * - Enter : commit la première option visible
 * - Esc : cancel
 * @returns {{wrap: HTMLElement, input: HTMLInputElement}}
 */
function _makeEpicPicker(allEpics, currentId, onCommit, onCancel) {
    const wrap = document.createElement('div');
    wrap.className = 'epic-picker';
    const recentIds = _getRecentEpics();
    const recentSet = new Set(recentIds);
    const recentEpics = recentIds
        .map(id => allEpics.find(e => e.id === id))
        .filter(Boolean);
    const otherEpics = allEpics
        .filter(e => !recentSet.has(e.id))
        .sort((a, b) => {
            const ka = (a.title || a.id || '').toLowerCase();
            const kb = (b.title || b.id || '').toLowerCase();
            return ka.localeCompare(kb, 'fr');
        });

    const optHtml = (e) => {
        const isCurrent = e.id === currentId;
        const searchKey = `${e.id} ${e.title || ''}`.toLowerCase();
        return `<div class="epic-picker-opt${isCurrent ? ' is-current' : ''}"
                    data-epic-id="${esc(e.id)}" data-search="${esc(searchKey)}" role="option">
            <span class="epic-picker-key">${esc(e.id)}</span>
            <span class="epic-picker-title">${esc(e.title || '(sans titre)')}</span>
        </div>`;
    };

    wrap.innerHTML = `
        <input type="text" class="epic-picker-input" placeholder="🔍 Filtrer par clé ou titre…" autocomplete="off" />
        <div class="epic-picker-list" role="listbox">
            <div class="epic-picker-opt epic-picker-opt--clear${!currentId ? ' is-current' : ''}"
                 data-epic-id="" data-search="aucun retirer" role="option">
                <span class="epic-picker-key">—</span>
                <span class="epic-picker-title">Aucun (retirer l'Epic)</span>
            </div>
            ${recentEpics.length ? `
                <div class="epic-picker-sec">⏱ Récents</div>
                ${recentEpics.map(optHtml).join('')}
                <div class="epic-picker-sep"></div>
            ` : ''}
            <div class="epic-picker-sec">${otherEpics.length} Epic${otherEpics.length > 1 ? 's' : ''} (A → Z)</div>
            ${otherEpics.length
                ? otherEpics.map(optHtml).join('')
                : '<div class="epic-picker-empty">Aucun autre Epic disponible</div>'}
        </div>
    `;

    const input = wrap.querySelector('.epic-picker-input');
    const list  = wrap.querySelector('.epic-picker-list');

    const _allOpts = () => list.querySelectorAll('.epic-picker-opt');
    const _firstVisible = () => {
        for (const o of _allOpts()) if (o.style.display !== 'none') return o;
        return null;
    };

    // Filter live
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        _allOpts().forEach(o => {
            // Toujours montrer "Aucun"
            if (o.classList.contains('epic-picker-opt--clear')) { o.style.display = ''; return; }
            const match = !q || o.dataset.search.includes(q);
            o.style.display = match ? '' : 'none';
        });
        // Masque les section headers si rien dessous n'est visible
        ['.epic-picker-sec', '.epic-picker-sep', '.epic-picker-empty'].forEach(sel => {
            wrap.querySelectorAll(sel).forEach(s => {
                let next = s.nextElementSibling;
                let hasVisible = false;
                while (next && next.classList.contains('epic-picker-opt') && !next.classList.contains('epic-picker-opt--clear')) {
                    if (next.style.display !== 'none') { hasVisible = true; break; }
                    next = next.nextElementSibling;
                }
                s.style.display = hasVisible ? '' : 'none';
            });
        });
    });

    // Click sur option
    list.addEventListener('click', (e) => {
        const opt = e.target.closest('.epic-picker-opt');
        if (opt) onCommit(opt.dataset.epicId);
    });

    // Hover highlight via classe
    list.addEventListener('mouseover', (e) => {
        const opt = e.target.closest('.epic-picker-opt');
        if (!opt) return;
        list.querySelectorAll('.is-hover').forEach(o => o.classList.remove('is-hover'));
        opt.classList.add('is-hover');
    });

    // Keyboard nav
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const hovered = list.querySelector('.is-hover');
            const target = (hovered && hovered.style.display !== 'none') ? hovered : _firstVisible();
            if (target) onCommit(target.dataset.epicId);
        }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const opts = [..._allOpts()].filter(o => o.style.display !== 'none');
            if (!opts.length) return;
            const cur = list.querySelector('.is-hover');
            let idx = cur ? opts.indexOf(cur) : -1;
            idx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
            opts.forEach(o => o.classList.remove('is-hover'));
            opts[idx].classList.add('is-hover');
            opts[idx].scrollIntoView({ block: 'nearest' });
        }
    });

    return { wrap, input };
}

const _isWikiMarkup = s => /(?:^|\n)h[1-6]\. |(?:^|\n)[*#]+ |\{code[\s:{]/.test(s);

function _renderCommentBody(body) {
    if (!body) return '<em class="text-muted text-xs">—</em>';
    if (typeof body === 'object') return _adfToHtml(body);
    if (typeof body === 'string') {
        if (body.startsWith('<')) return body;
        if (body.startsWith('{')) { try { return _adfToHtml(JSON.parse(body)); } catch { /* not JSON */ } }
        if (_isWikiMarkup(body)) return parseWikiMarkup(body);
        return esc(body).replace(/\n/g, '<br>');
    }
    return esc(String(body));
}

function _adfToHtml(doc) {
    if (!doc) return '';
    const render = (node) => {
        if (!node) return '';
        const kids = () => (node.content || []).map(render).join('');
        switch (node.type) {
            case 'doc': return kids();
            case 'paragraph': return `<p>${kids()}</p>`;
            case 'text': {
                let t = esc(node.text || '');
                for (const m of (node.marks || [])) {
                    if (m.type === 'strong') t = `<strong>${t}</strong>`;
                    else if (m.type === 'em') t = `<em>${t}</em>`;
                    else if (m.type === 'code') t = `<code>${t}</code>`;
                    else if (m.type === 'link') t = `<a href="${esc(m.attrs?.href||'#')}" target="_blank" rel="noopener">${t}</a>`;
                }
                return t;
            }
            case 'hardBreak': return '<br>';
            case 'bulletList': return `<ul>${kids()}</ul>`;
            case 'orderedList': return `<ol>${kids()}</ol>`;
            case 'listItem': return `<li>${kids()}</li>`;
            case 'blockquote': return `<blockquote>${kids()}</blockquote>`;
            case 'codeBlock': return `<pre><code>${kids()}</code></pre>`;
            case 'mention': return `<strong>@${esc((node.attrs?.text || node.attrs?.displayName || '').replace(/^@/, ''))}</strong>`;
            case 'emoji': return node.attrs?.text || node.attrs?.shortName || '';
            default: return kids();
        }
    };
    if (doc.type === 'doc' && doc.content) return doc.content.map(render).join('');
    return render(doc);
}
const bodyEl = () => document.getElementById('modal-body');

export function initModal() {
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    overlay()?.addEventListener('click', e => { if (e.target === overlay()) closeModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !overlay().classList.contains('hidden')) closeModal();
    });
    window.__squadBoard = window.__squadBoard || {};
    window.__squadBoard.openTicketModal = openTicketModal;
    window.__squadBoard.openCreateModal = openCreateModal;
    window.__squadBoard.openEditModal = openEditModal;
}

let _modalList = [];
let _modalIdx = -1;

export function closeModal() {
    overlay().classList.add('hidden');
    // Nettoyage de la sidebar enfants (features) — sinon elle persiste sur la prochaine ouverture
    document.getElementById('mdl-children-side')?.remove();
    document.getElementById('mdl-children-toggle')?.remove();
    document.getElementById('modal')?.classList.remove('has-children-sidebar');
    if (/\/ticket\//.test(location.hash)) {
        const base = location.hash.replace(/\/ticket\/[^/]+$/, '');
        history.pushState(null, '', base || `#${store.get('view') || 'dashboard'}`);
    }
}
function showModal() { overlay().classList.remove('hidden'); }

function getMemberNames() {
    return (store.get('members') || []).map(m => m.name || m);
}

function avatar(name, isLeader = false, size = 24) {
    if (!name) return '';
    return `<span class="assignee-avatar${isLeader ? ' leader' : ''}" style="background:${hashColor(name)};color:white;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px" title="${esc(name)}">${esc(initials(name))}</span>`;
}

function personChip(name, role = '') {
    if (!name) return `<span class="text-muted">Non assigne</span>`;
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
function _sprintsHistoryOfTicket(ticket) {
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

// ══════════════════════════════════════════════════════════════════════════════
// Ticket Detail - rich layout
// ══════════════════════════════════════════════════════════════════════════════
export function openTicketModal(ticketId) {
    const tickets = store.get('tickets') || [];
    const epics = store.get('epics') || [];
    const features = store.get('features') || [];
    const all = [...tickets, ...epics, ...features];
    const ticket = all.find(t => t.id === ticketId);
    if (!ticket) return;

    // Track navigation context
    _modalList = all;
    _modalIdx = all.findIndex(t => t.id === ticketId);

    const jiraUrl = store.get('jiraUrl');
    const typeLabel = TYPE_LABELS[ticket.type] || ticket.type;
    const jiraLink = jiraUrl ? `${jiraUrl}/browse/${ticket.id}` : null;

    const leader = ticket.leader || ticket.assignee;
    const reporter = ticket.reporter || null;
    const contributors = (ticket.contributors || []).filter(c => c && c !== leader);
    const comments = ticket.comments || [];
    const links = ticket.links || [];
    const description = ticket.description || '';

    // Cycle / Lead time
    const ct = ticket.cycleTimeDays;
    const lt = ticket.leadTimeDays;

    // Sprint progress bar data
    const sprintInfo = store.get('sprintInfo');
    let sprintBarHtml = '';
    if (sprintInfo?.startDate && sprintInfo?.endDate) {
        const sStart = new Date(sprintInfo.startDate).getTime();
        const sEnd = new Date(sprintInfo.endDate).getTime();
        const sTotal = sEnd - sStart;
        const now = Date.now();
        const sprintPct = Math.max(0, Math.min(100, ((now - sStart) / sTotal) * 100));
        const remaining = Math.max(0, Math.ceil((sEnd - now) / 86400000));
        sprintBarHtml = `
            <div class="mb-3">
                <div class="mdl-sprint-bar">
                    <div class="mdl-sprint-fill" style="width:${sprintPct}%"></div>
                    ${ticket.startedDate ? `<div class="mdl-sprint-marker" style="left:${Math.max(0, Math.min(100, ((new Date(ticket.startedDate).getTime() - sStart) / sTotal) * 100))}%;background:var(--status-inprog)" title="Debut travail"></div>` : ''}
                    ${ticket.resolvedDate ? `<div class="mdl-sprint-marker" style="left:${Math.max(0, Math.min(100, ((new Date(ticket.resolvedDate).getTime() - sStart) / sTotal) * 100))}%;background:var(--status-done)" title="Resolu"></div>` : ''}
                </div>
                <div class="mdl-sprint-dates">
                    <span>${fmtDate(sprintInfo.startDate)}</span>
                    <span>${remaining > 0 ? `J-${remaining}` : 'Termine'}</span>
                    <span>${fmtDate(sprintInfo.endDate)}</span>
                </div>
            </div>
        `;
    }

    // ── Title bar with prev/next ──────────────────────────────────────────────
    titleEl().innerHTML = `
        <button class="mdl-nav-btn${_modalIdx <= 0 ? ' disabled' : ''}" id="mdl-prev" title="Precedent (←)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="badge badge-type badge-${ticket.type}">${esc(typeLabel)}</span>
        ${jiraLink
            ? `<a class="mdl-ticket-link" href="${esc(jiraLink)}" target="_blank" rel="noopener" title="Ouvrir dans JIRA">${esc(ticket.id)}</a>`
            : `<span class="mdl-ticket-id">${esc(ticket.id)}</span>`
        }
        <button class="copy-btn copy-btn--always" id="mdl-copy-key" data-copy-key="${esc(ticket.id)}" data-copy-title="${esc(ticket.title)}" title="Copier '${esc(ticket.id)} - ${esc(ticket.title)}'">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <span class="truncate flex-1 mdl-title-span" id="mdl-title-span" title="Cliquer pour modifier">${esc(ticket.title)}</span>
        <button class="mdl-nav-btn${_modalIdx >= all.length - 1 ? ' disabled' : ''}" id="mdl-next" title="Suivant (→)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
    `;

    // ── Body ──────────────────────────────────────────────────────────────────
    bodyEl().innerHTML = `
        <!-- Meta row -->
        <div class="mdl-meta">
            <select class="status-select" id="detail-status" style="background:var(--status-${ticket.status}-bg);color:var(--status-${ticket.status})">
                ${STATUS_ORDER.map(s => `<option value="${s}"${s === ticket.status ? ' selected' : ''}>${esc(STATUS_LABELS[s])}</option>`).join('')}
            </select>
            ${(() => {
                const p = ticket.priority || 'medium';
                const pc = p === 'critical' ? 'var(--danger)' : p === 'high' ? 'var(--warning)' : p === 'low' ? 'var(--text-muted)' : 'var(--info)';
                const pb = p === 'critical' ? 'var(--danger-bg)' : p === 'high' ? 'var(--warning-bg)' : p === 'low' ? 'var(--bg-alt)' : 'var(--info-bg)';
                const pi = p === 'critical' ? '🔴' : p === 'high' ? '🟠' : p === 'low' ? '⚪' : '🔵';
                return `<span class="chip editable-field" data-field="priority" data-value="${p}" style="background:${pb};color:${pc};border-color:${pc}30">${pi} ${esc(p)}</span>`;
            })()}
            <span class="badge badge-points editable-field" data-field="points" data-value="${ticket.points || 0}">${ticket.points ? `${ticket.points} pts` : '— pts'}</span>
            <span class="chip editable-field" data-field="flagged" data-value="${ticket.flagged ? 'true' : 'false'}" style="${ticket.flagged ? 'background:var(--danger-bg);color:var(--danger);border-color:var(--danger)30' : 'opacity:0.35'}" title="${ticket.flagged ? 'Cliquer pour débloquer' : 'Cliquer pour bloquer'}">🚫 Bloqué</span>
            ${ct ? `<span class="chip" title="Cycle time">⏱ ${ct}j cycle</span>` : ''}
            ${lt ? `<span class="chip" title="Lead time">📅 ${lt}j lead</span>` : ''}
            <div class="mdl-meta-right">
                <span class="chip editable-field" data-field="team" data-value="${esc(ticket.team || '')}" style="${ticket.team ? '' : 'opacity:0.5'}">${ticket.team ? esc(ticket.team) : '— Équipe'}</span>
                ${ticket.piSprint ? `<span class="chip">${esc(ticket.piSprint)}</span>` : ''}
                ${ticket.sprintName ? `<span class="text-xs text-muted">${esc(ticket.sprintName)}</span>` : ''}
            </div>
        </div>

        ${sprintBarHtml}

        <!-- Fields grid (3 colonnes compactes) -->
        <div class="mdl-grid mdl-grid--3">
            <div class="mdl-field">
                <span class="mdl-field-label">Leader</span>
                <span class="mdl-field-value editable-field" data-field="leader" data-value="${esc(leader || '')}">${personChip(leader, 'leader')}</span>
            </div>
            <div class="mdl-field">
                <span class="mdl-field-label">Rapporteur</span>
                <span class="mdl-field-value">${personChip(reporter)}</span>
            </div>
            <div class="mdl-field" title="${esc(fmtDateLong(ticket.createdAt))} · maj ${esc(fmtRelative(ticket.updatedAt))}">
                <span class="mdl-field-label">Créé · maj</span>
                <span class="mdl-field-value text-sm">
                    ${esc(fmtDateLong(ticket.createdAt))}
                    <small class="text-muted">· ${esc(fmtRelative(ticket.updatedAt))}</small>
                </span>
            </div>
            ${(() => {
                const sprints = _sprintsHistoryOfTicket(ticket);
                const piTag = ticket.piSprint ? `<span class="chip chip-pi" title="PI dérivé">${esc(ticket.piSprint)}</span>` : '';
                if (!sprints.length && !piTag) {
                    return `<div class="mdl-field mdl-field--full">
                        <span class="mdl-field-label">Sprint(s)</span>
                        <span class="mdl-field-value text-muted text-xs">— Aucun sprint</span>
                    </div>`;
                }
                const chips = sprints.map(s =>
                    `<span class="chip chip-sprint${s.isCurrent ? ' chip-sprint--current' : ' chip-sprint--past'}" title="${s.isCurrent ? 'Sprint courant côté JIRA' : 'Sprint historique (extrait du changelog)'}">${s.isCurrent ? '● ' : '○ '}${esc(s.name)}</span>`
                ).join('');
                return `<div class="mdl-field mdl-field--full">
                    <span class="mdl-field-label">Sprint(s)</span>
                    <span class="mdl-field-value flex-wrap">${chips}${piTag}</span>
                </div>`;
            })()}
            <div class="mdl-field mdl-field--full">
                <span class="mdl-field-label">Contributors</span>
                <span class="mdl-field-value flex-wrap" id="contrib-inline-wrap">
                    ${contributors.map(c => `<span class="chip chip-gap">${avatar(c, false, 18)} ${esc(c)} <button type="button" class="contrib-rm" data-name="${esc(c)}" title="Retirer">×</button></span>`).join('')}
                    <select class="mdl-inline-select" id="contrib-add-select">
                        <option value="">+ Ajouter</option>
                        ${getMemberNames().filter(m => !contributors.includes(m) && m !== leader).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
                    </select>
                </span>
            </div>
            ${(() => {
                const epicObj = ticket.epic ? all.find(t => t.id === ticket.epic) : null;
                const epicTitle = epicObj?.title || '';
                return `<div class="mdl-field mdl-field--full">
                    <span class="mdl-field-label">Epic</span>
                    <div class="mdl-field-with-open">
                        <span class="mdl-field-value editable-field" data-field="epic" data-value="${esc(ticket.epic || '')}">
                            ${ticket.epic
                                ? `<span class="mdl-link-id" data-ticket-id="${esc(ticket.epic)}">${esc(ticket.epic)}</span>${epicTitle ? ` <span class="text-muted text-xs">– ${esc(epicTitle)}</span>` : ''}`
                                : '<span class="text-muted text-xs">— Aucun</span>'}
                        </span>
                        ${ticket.epic
                            ? `<button class="btn-open-linked" data-ticket-id="${esc(ticket.epic)}" title="Ouvrir ${esc(ticket.epic)}"><svg class="icon icon-xs"><use href="#i-external"/></svg></button>`
                            : ''}
                    </div>
                </div>`;
            })()}
            <div class="mdl-field mdl-field--full">
                <span class="mdl-field-label">Labels</span>
                <span class="mdl-field-value flex-wrap" id="labels-inline-wrap">
                    ${(ticket.labels || []).map(l => `<span class="chip chip-gap">${esc(l)} <button type="button" class="label-rm" data-label="${esc(l)}" title="Retirer">×</button></span>`).join('')}
                    <input type="text" class="mdl-inline-input" id="label-add-input" placeholder="+ label (Entrée)">
                </span>
            </div>
        </div>

        <!-- Description (wysiwyg inline) -->
        <div class="mdl-desc-wrap" id="desc-wrap">
            <div class="mdl-desc-header">
                <span class="mdl-section-label">Description</span>
                <button type="button" class="btn-icon mdl-desc-edit-btn" id="desc-edit-btn" title="Modifier la description">
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

        <!-- History -->
        ${ticket.recentChanges?.length ? `
            <details class="mb-4">
                <summary class="text-xs font-semibold text-muted mb-2">Historique (${ticket.recentChanges.length})</summary>
                <div class="activity-list">
                    ${ticket.recentChanges.slice(-8).reverse().map(c => `
                        <div class="activity-item">
                            <span class="activity-time">${fmtRelative(c.date)}</span>
                            <span class="activity-text"><strong>${esc(c.author)}</strong> a modifié <em>${esc(fieldLabelFr(c.field))}</em> : ${esc(c.from || '—')} &rarr; ${esc(c.to || '—')}</span>
                        </div>
                    `).join('')}
                </div>
            </details>
        ` : ''}

        <!-- Comments -->
        <details open class="mb-4">
            <summary class="text-xs font-semibold text-muted mb-2">Commentaires (${comments.length})</summary>
            <div class="comment-list" id="comment-list">
                ${comments.length ? comments.map(c => `
                    <div class="comment-item">
                        <span class="comment-avatar" style="background:${hashColor(c.author)}">${esc(initials(c.author))}</span>
                        <div class="comment-content">
                            <div class="comment-header">
                                <span class="comment-author">${esc(c.author)}</span>
                                <span class="comment-date">${fmtRelative(c.date)}</span>
                                <button class="btn-icon comment-delete" data-comment-id="${esc(c.id)}" title="Supprimer"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>
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
    bodyEl().querySelector('#detail-status')?.addEventListener('change', async (e) => {
        try {
            const col = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
            await col(ticket.id, { status: e.target.value });
            await refreshData();
            toast(`Statut → ${STATUS_LABELS[e.target.value]}`, 'success');
        } catch (err) { toast(err.message, 'error'); }
    });

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

    bodyEl().querySelector('#btn-edit-ticket')?.addEventListener('click', () => { closeModal(); openEditModal(ticket); });

    bodyEl().querySelector('#btn-delete-ticket')?.addEventListener('click', async () => {
        const ok = await confirmDanger(
            `Supprimer ${ticket.id} ?`,
            `${ticket.title}\n\nCette action est irréversible. Le ticket sera retiré de la base locale (la sync JIRA suivante peut le réimporter si la source contient encore l'issue).`
        );
        if (!ok) return;
        try {
            const del = ticket.type === 'feature' ? api.deleteFeature : ticket.type === 'epic' ? api.deleteEpic : api.deleteTicket;
            await del(ticket.id); await refreshData(); closeModal();
            toast('Supprime', 'info');
            window.__squadBoard.rerenderView?.();
        } catch (err) { toast(err.message, 'error'); }
    });

    // Bouton copier (clé + titre)
    document.getElementById('mdl-copy-key')?.addEventListener('click', e => {
        const btn = e.currentTarget;
        const key = btn.dataset.copyKey || '';
        const title = btn.dataset.copyTitle || '';
        copyToClipboard(`${key} - ${title}`, 'Copié');
    });

    _bindDescriptionEditor(bodyEl(), ticket);
    _bindInlineEditors(bodyEl(), ticket);

    // Prev/Next buttons
    document.getElementById('mdl-prev')?.addEventListener('click', () => {
        if (_modalIdx > 0) openTicketModal(_modalList[_modalIdx - 1].id);
    });
    document.getElementById('mdl-next')?.addEventListener('click', () => {
        if (_modalIdx < _modalList.length - 1) openTicketModal(_modalList[_modalIdx + 1].id);
    });

    // Sync URL hash
    const baseHash = location.hash.replace(/^#/, '').replace(/\/ticket\/[^/]+$/, '') || store.get('view') || 'dashboard';
    const targetHash = `#${baseHash}/ticket/${encodeURIComponent(ticketId)}`;
    if (location.hash !== targetHash) history.pushState(null, '', targetHash);

    showModal();
}

// ══════════════════════════════════════════════════════════════════════════════
// Description WYSIWYG inline editor
// ══════════════════════════════════════════════════════════════════════════════
function _bindDescriptionEditor(container, ticket) {
    const viewEl    = container.querySelector('#desc-view');
    const editorEl  = container.querySelector('#desc-editor');
    const contentEl = container.querySelector('#desc-content');
    const toolbar   = container.querySelector('#desc-toolbar');
    if (!viewEl || !editorEl || !contentEl) return;

    const PLACEHOLDER = '<p class="text-muted text-sm desc-placeholder">Aucune description. Cliquez pour ajouter.</p>';
    let _html = _renderCommentBody(ticket.description) || '';

    const enterEdit = () => {
        contentEl.innerHTML = _html;
        viewEl.classList.add('hidden');
        editorEl.classList.remove('hidden');
        contentEl.focus();
        const range = document.createRange();
        range.selectNodeContents(contentEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };

    const exitEdit = () => {
        editorEl.classList.add('hidden');
        viewEl.classList.remove('hidden');
    };

    const save = async () => {
        const empty = !contentEl.textContent.trim();
        const html  = empty ? '' : contentEl.innerHTML;
        try {
            const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
            await fn(ticket.id, { description: html });
            _html = html;
            viewEl.innerHTML = html || PLACEHOLDER;
            exitEdit();
            await refreshData();
            toast('Description mise à jour', 'success');
        } catch (err) { toast(err.message, 'error'); }
    };

    container.querySelector('#desc-edit-btn')?.addEventListener('click', enterEdit);
    viewEl.addEventListener('click', enterEdit);
    container.querySelector('#desc-save')?.addEventListener('click', save);
    container.querySelector('#desc-cancel')?.addEventListener('click', () => {
        contentEl.innerHTML = _html;
        exitEdit();
    });
    contentEl.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); contentEl.innerHTML = _html; exitEdit(); }
    });
    toolbar?.addEventListener('mousedown', e => {
        const btn = e.target.closest('.desc-tb-btn');
        if (!btn) return;
        e.preventDefault();
        if (btn.id === 'desc-tb-link') {
            const url = prompt('URL du lien :');
            if (url) document.execCommand('createLink', false, url);
        } else if (btn.id === 'desc-tb-img') {
            const url = prompt('URL de l\'image :');
            if (url) document.execCommand('insertImage', false, url);
        } else {
            const cmd = btn.dataset.cmd, val = btn.dataset.val || null;
            if (cmd) document.execCommand(cmd, false, val);
        }
        contentEl.focus();
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Inline field editors
// ══════════════════════════════════════════════════════════════════════════════
function _bindInlineEditors(container, ticket) {
    const apiSave = async (fields) => {
        const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
        await fn(ticket.id, fields);
        await refreshData();
    };

    // ── Title ─────────────────────────────────────────────────────────────────
    const titleSpan = document.getElementById('mdl-title-span');
    if (titleSpan) {
        titleSpan.addEventListener('click', () => {
            if (titleSpan.querySelector('input')) return;
            const orig = ticket.title;
            const inp = document.createElement('input');
            inp.type = 'text'; inp.value = orig; inp.className = 'mdl-title-input';
            titleSpan.innerHTML = ''; titleSpan.appendChild(inp);
            inp.focus(); inp.select();
            let done = false;
            const commit = async () => {
                if (done) return; done = true;
                const val = inp.value.trim() || orig;
                if (val === orig) { titleSpan.textContent = orig; return; }
                try { await apiSave({ title: val }); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); titleSpan.textContent = orig; }
            };
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
                if (e.key === 'Escape') { done = true; titleSpan.textContent = orig; }
            });
        });
    }

    // ── Single-value select/toggle fields ────────────────────────────────────
    const PI = { critical: '🔴', high: '🟠', medium: '🔵', low: '⚪' };
    const priorities = ['critical', 'high', 'medium', 'low'].map(p => [p, `${PI[p]} ${p}`]);
    const points = [0,1,2,3,5,8,13,21].map(p => [String(p), p ? `${p} pts` : '—']);
    const teams = (store.get('teams') || []).map(t => [t.name || t, t.name || t]);
    const members = getMemberNames().map(m => [m, m]);

    const OPTIONS = {
        priority: priorities,
        points,
        team:     [['', '— Aucune'], ...teams],
        leader:   [['', '— Non assigné'], ...members],
        // epic : picker custom avec autocomplete (cf. _makeEpicPicker) — pas dans OPTIONS
    };

    const makeSelect = (options, current) => {
        const sel = document.createElement('select');
        sel.className = 'mdl-inline-select';
        options.forEach(([v, l]) => { const o = new Option(l, v); if (v === current) o.selected = true; sel.appendChild(o); });
        return sel;
    };

    container.querySelectorAll('[data-field]').forEach(el => {
        const field = el.dataset.field;

        if (field === 'flagged') {
            el.addEventListener('click', async () => {
                try { await apiSave({ flagged: el.dataset.value !== 'true' }); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            });
            return;
        }

        // Epic : picker custom autocomplete (récents + tri alpha) — pas dans OPTIONS
        if (field === 'epic') {
            el.addEventListener('click', e => {
                if (e.target.closest('.mdl-link-id')) return;
                if (el.querySelector('.epic-picker')) return;
                const orig = el.innerHTML;
                const current = el.dataset.value || '';
                const allEpics = store.get('epics') || [];
                const onCommit = async (id) => {
                    cleanup();
                    if (id) _pushRecentEpic(id);
                    try { await apiSave({ epic: id || null }); openTicketModal(ticket.id); }
                    catch (err) { toast(err.message, 'error'); el.innerHTML = orig; }
                };
                const onCancel = () => { cleanup(); el.innerHTML = orig; };
                const { wrap, input } = _makeEpicPicker(allEpics, current, onCommit, onCancel);
                el.innerHTML = '';
                el.appendChild(wrap);
                requestAnimationFrame(() => input.focus());
                const onDocClick = (ev) => { if (!wrap.contains(ev.target)) onCancel(); };
                const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
                setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
            });
            return;
        }

        const options = OPTIONS[field];
        if (!options) return;

        el.addEventListener('click', e => {
            if (el.querySelector('select')) return;
            const current = el.dataset.value || '';
            const sel = makeSelect(options, current);
            const orig = el.innerHTML;
            el.innerHTML = ''; el.appendChild(sel); sel.focus();
            let done = false;
            const commit = async () => {
                if (done) return; done = true;
                const val = sel.value;
                try {
                    const payload = field === 'points'
                        ? { points: parseInt(val) || 0 }
                        : { [field]: val || null };
                    await apiSave(payload);
                    openTicketModal(ticket.id);
                } catch (err) { toast(err.message, 'error'); el.innerHTML = orig; }
            };
            sel.addEventListener('change', commit);
            sel.addEventListener('blur', commit);
            sel.addEventListener('keydown', e => { if (e.key === 'Escape') { done = true; el.innerHTML = orig; } });
        });
    });

    // ── Contributors inline ───────────────────────────────────────────────────
    const contribWrap = container.querySelector('#contrib-inline-wrap');
    if (contribWrap) {
        const getNames = () => Array.from(contribWrap.querySelectorAll('.contrib-rm')).map(b => b.dataset.name);
        const saveC = async () => { try { await apiSave({ contributors: getNames() }); } catch (err) { toast(err.message, 'error'); } };
        contribWrap.addEventListener('click', async e => {
            const btn = e.target.closest('.contrib-rm'); if (!btn) return;
            const name = btn.dataset.name;
            btn.closest('.chip').remove();
            const sel = contribWrap.querySelector('#contrib-add-select');
            if (sel) sel.appendChild(new Option(name, name));
            await saveC();
        });
        contribWrap.querySelector('#contrib-add-select')?.addEventListener('change', async e => {
            const name = e.target.value; if (!name) return;
            const chip = document.createElement('span');
            chip.className = 'chip chip-gap';
            chip.innerHTML = `${avatar(name, false, 18)} ${esc(name)} <button type="button" class="contrib-rm" data-name="${esc(name)}" title="Retirer">×</button>`;
            contribWrap.insertBefore(chip, e.target);
            e.target.querySelector(`option[value="${CSS.escape(name)}"]`)?.remove();
            e.target.value = '';
            await saveC();
        });
    }

    // ── Labels inline ─────────────────────────────────────────────────────────
    const labelsWrap = container.querySelector('#labels-inline-wrap');
    if (labelsWrap) {
        const getLabels = () => Array.from(labelsWrap.querySelectorAll('.label-rm')).map(b => b.dataset.label);
        const saveL = async () => { try { await apiSave({ labels: getLabels() }); } catch (err) { toast(err.message, 'error'); } };
        labelsWrap.addEventListener('click', async e => {
            const btn = e.target.closest('.label-rm'); if (!btn) return;
            btn.closest('.chip').remove(); await saveL();
        });
        labelsWrap.querySelector('#label-add-input')?.addEventListener('keydown', async e => {
            if (e.key !== 'Enter' && e.key !== ',') return;
            e.preventDefault();
            const val = e.target.value.trim(); if (!val) return;
            const chip = document.createElement('span');
            chip.className = 'chip chip-gap';
            chip.innerHTML = `${esc(val)} <button type="button" class="label-rm" data-label="${esc(val)}" title="Retirer">×</button>`;
            labelsWrap.insertBefore(chip, e.target);
            e.target.value = ''; await saveL();
        });
    }
}

// Arrow keys for modal navigation
document.addEventListener('keydown', e => {
    if (overlay()?.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft' && _modalIdx > 0) { e.preventDefault(); openTicketModal(_modalList[_modalIdx - 1].id); }
    if (e.key === 'ArrowRight' && _modalIdx < _modalList.length - 1) { e.preventDefault(); openTicketModal(_modalList[_modalIdx + 1].id); }
});

// ══════════════════════════════════════════════════════════════════════════════
// Contributors multi-select
// ══════════════════════════════════════════════════════════════════════════════
function contribFieldHtml(selected = []) {
    const members = getMemberNames();
    return `
        <div id="contributors-field">
            <div class="flex gap-1 flex-wrap mb-1" id="contrib-chips">
                ${selected.map(c => `<span class="chip chip-gap">${esc(c)} <button type="button" class="contrib-remove-btn" data-name="${esc(c)}">&times;</button></span>`).join('')}
            </div>
            <select class="select" id="contrib-add-select">
                <option value="">+ Contributeur</option>
                ${members.filter(m => !selected.includes(m)).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
            </select>
            <input type="hidden" name="contributors" value='${JSON.stringify(selected)}'>
        </div>
    `;
}

function wireContrib(container) {
    const field = container.querySelector('#contributors-field');
    if (!field) return;
    const getS = () => JSON.parse(field.querySelector('input[name="contributors"]').value || '[]');
    const setS = list => field.querySelector('input[name="contributors"]').value = JSON.stringify(list);

    field.addEventListener('click', e => {
        const btn = e.target.closest('.contrib-remove-btn');
        if (!btn) return;
        e.preventDefault();
        setS(getS().filter(c => c !== btn.dataset.name));
        btn.closest('.chip')?.remove();
        const sel = field.querySelector('#contrib-add-select');
        const opt = document.createElement('option'); opt.value = btn.dataset.name; opt.textContent = btn.dataset.name;
        sel.appendChild(opt);
    });

    field.querySelector('#contrib-add-select')?.addEventListener('change', e => {
        const name = e.target.value; if (!name) return;
        const s = getS(); if (!s.includes(name)) { s.push(name); setS(s);
            const chip = document.createElement('span'); chip.className = 'chip chip-gap';
            chip.innerHTML = `${esc(name)} <button type="button" class="contrib-remove-btn" data-name="${esc(name)}">&times;</button>`;
            field.querySelector('#contrib-chips').appendChild(chip);
        }
        e.target.querySelector(`option[value="${CSS.escape(name)}"]`)?.remove();
        e.target.value = '';
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Create Ticket
// ══════════════════════════════════════════════════════════════════════════════
export function openCreateModal(defaults = {}) {
    const teamNames = store.get('teams') || [];
    const memberNames = getMemberNames();
    const epics = store.get('epics') || [];

    titleEl().textContent = 'Nouveau ticket';
    bodyEl().innerHTML = `
        <form id="create-form">
            <div class="edit-section">
                <div class="edit-section-title">Titre</div>
                <div class="form-group"><label class="label">Intitulé *</label><input class="input" name="title" required placeholder="Titre du ticket" autofocus></div>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Statut &amp; Type</div>
                <div class="form-row">
                    <div class="form-group"><label class="label">Type</label><select class="select w-full" name="type">${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}"${k===(defaults.type||'story')?' selected':''}>${v}</option>`).join('')}</select></div>
                    <div class="form-group"><label class="label">Statut</label><select class="select w-full" name="status">${STATUS_ORDER.map(s => `<option value="${s}"${s===(defaults.status||'todo')?' selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="label">Points</label><select class="select w-full" name="points">${[0,1,2,3,5,8,13,21].map(p => `<option value="${p}">${p||'-'}</option>`).join('')}</select></div>
                    <div class="form-group"><label class="label">Priorité</label><select class="select w-full" name="priority">${['low','medium','high','critical'].map(p => `<option value="${p}"${p==='medium'?' selected':''}>${p}</option>`).join('')}</select></div>
                </div>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Assignation</div>
                <div class="form-row">
                    <div class="form-group"><label class="label">Équipe</label><select class="select w-full" name="team"><option value="">-</option>${teamNames.map(t => `<option value="${esc(t)}"${t===defaults.team?' selected':''}>${esc(t)}</option>`).join('')}</select></div>
                    <div class="form-group"><label class="label">Leader</label><select class="select w-full" name="leader"><option value="">Non assigné</option>${memberNames.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label class="label">Contributors</label>${contribFieldHtml([])}</div>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Liens</div>
                <div class="form-group"><label class="label">Epic</label><select class="select w-full" name="epic"><option value="">Aucun</option>${epics.map(e => `<option value="${esc(e.id)}">${esc(e.id)} - ${esc(e.title)}</option>`).join('')}</select></div>
                <div class="form-group"><label class="label">Labels</label><input class="input" name="labels" placeholder="tech-debt, urgent"></div>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Description</div>
                <div class="form-group"><textarea class="input" name="description" rows="4" placeholder="Description du ticket..."></textarea></div>
            </div>
            <div class="form-actions"><button type="button" class="btn btn-secondary" id="btn-cancel-create">Annuler</button><button type="submit" class="btn btn-primary">Créer</button></div>
        </form>
    `;
    wireContrib(bodyEl());
    bodyEl().querySelector('#btn-cancel-create')?.addEventListener('click', closeModal);
    bodyEl().querySelector('#create-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            title: fd.get('title'), type: fd.get('type'), status: fd.get('status'),
            team: fd.get('team'), leader: fd.get('leader') || null,
            contributors: JSON.parse(fd.get('contributors') || '[]'),
            points: parseInt(fd.get('points')) || 0, priority: fd.get('priority'),
            epic: fd.get('epic') || null,
            labels: (fd.get('labels')||'').split(',').map(l=>l.trim()).filter(Boolean),
            description: fd.get('description'),
        };
        try {
            const fn = data.type === 'feature' ? api.createFeature : data.type === 'epic' ? api.createEpic : api.createTicket;
            await fn(data); await refreshData(); closeModal();
            toast('Cree', 'success'); window.__squadBoard.rerenderView?.();
        } catch (err) { toast(err.message, 'error'); }
    });
    showModal();
}

// ══════════════════════════════════════════════════════════════════════════════
// Edit Ticket
// ══════════════════════════════════════════════════════════════════════════════
export function openEditModal(ticket) {
    const teamNames = store.get('teams') || [];
    const memberNames = getMemberNames();
    const epics = store.get('epics') || [];
    const leader = ticket.leader || ticket.assignee || '';
    const contributors = (ticket.contributors || []).filter(c => c && c !== leader);

    titleEl().textContent = `Modifier ${ticket.id}`;
    bodyEl().innerHTML = `
        <form id="edit-form">
            <div class="edit-section">
                <div class="edit-section-title">Titre</div>
                <div class="form-group"><label class="label">Intitulé *</label><input class="input" name="title" required value="${esc(ticket.title)}" autofocus></div>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Statut &amp; Type</div>
                <div class="form-row">
                    <div class="form-group"><label class="label">Type</label><select class="select w-full" name="type">${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}"${k===ticket.type?' selected':''}>${v}</option>`).join('')}</select></div>
                    <div class="form-group"><label class="label">Statut</label><select class="select w-full" name="status">${STATUS_ORDER.map(s => `<option value="${s}"${s===ticket.status?' selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="label">Points</label><select class="select w-full" name="points">${[0,1,2,3,5,8,13,21].map(p => `<option value="${p}"${p===(ticket.points||0)?' selected':''}>${p||'-'}</option>`).join('')}</select></div>
                    <div class="form-group"><label class="label">Priorité</label><select class="select w-full" name="priority">${['low','medium','high','critical'].map(p => `<option value="${p}"${p===ticket.priority?' selected':''}>${p}</option>`).join('')}</select></div>
                </div>
                <label class="edit-checkbox-label"><input type="checkbox" name="flagged" ${ticket.flagged?'checked':''}> 🚫 Bloqué / impédiment</label>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Assignation</div>
                <div class="form-row">
                    <div class="form-group"><label class="label">Équipe</label><select class="select w-full" name="team"><option value="">-</option>${teamNames.map(t => `<option value="${esc(t)}"${t===ticket.team?' selected':''}>${esc(t)}</option>`).join('')}</select></div>
                    <div class="form-group"><label class="label">Leader</label><select class="select w-full" name="leader"><option value="">Non assigné</option>${memberNames.map(m => `<option value="${esc(m)}"${m===leader?' selected':''}>${esc(m)}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label class="label">Contributors</label>${contribFieldHtml(contributors)}</div>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Liens</div>
                <div class="form-group"><label class="label">Epic</label><select class="select w-full" name="epic"><option value="">Aucun</option>${epics.map(e => `<option value="${esc(e.id)}"${e.id===ticket.epic?' selected':''}>${esc(e.id)} - ${esc(e.title)}</option>`).join('')}</select></div>
                <div class="form-group"><label class="label">Labels</label><input class="input" name="labels" value="${esc((ticket.labels||[]).join(', '))}" placeholder="tech-debt, urgent"></div>
            </div>
            <div class="edit-section">
                <div class="edit-section-title">Description</div>
                <div class="form-group"><textarea class="input" name="description" rows="5" placeholder="Description du ticket...">${esc(ticket.description||'')}</textarea></div>
            </div>
            <div class="form-actions"><button type="button" class="btn btn-secondary" id="btn-cancel-edit">Annuler</button><button type="submit" class="btn btn-primary">Enregistrer</button></div>
        </form>
    `;
    wireContrib(bodyEl());
    bodyEl().querySelector('#btn-cancel-edit')?.addEventListener('click', closeModal);
    bodyEl().querySelector('#edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            title: fd.get('title'), type: fd.get('type'), status: fd.get('status'),
            team: fd.get('team'), leader: fd.get('leader') || null,
            contributors: JSON.parse(fd.get('contributors') || '[]'),
            points: parseInt(fd.get('points')) || 0, priority: fd.get('priority'),
            epic: fd.get('epic') || null,
            labels: (fd.get('labels')||'').split(',').map(l=>l.trim()).filter(Boolean),
            flagged: !!fd.get('flagged'), description: fd.get('description'),
        };
        try {
            const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
            await fn(ticket.id, data); await refreshData(); closeModal();
            toast('Mis a jour', 'success'); window.__squadBoard.rerenderView?.();
        } catch (err) { toast(err.message, 'error'); }
    });
    showModal();
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refreshData() {
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

// ── Sidebar "Tickets enfants" pour les features ─────────────────────────────
// Affichée à droite de la modal quand on ouvre une feature. Liste :
//   1. Les epics enfants (epic.feature === feature.id)
//   2. Les tickets passant par ces epics (ticket.epic === epic.id)
//   3. Les tickets directement reliés à la feature (ticket.epic === feature.id)
//      — cas réel cf. roadmap.js:147, certains projets sautent l'epic intermédiaire.
// Toggle via bouton dans le titlebar — état persisté en localStorage.
function _renderChildrenSidebar(feature) {
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
    console.info(`[ChildrenSidebar] Feature ${feature.id} : ${childEpics.length} epic(s) + ${childTickets.length} ticket(s) (via epic: ${ticketsViaEpic.length}, direct: ${ticketsDirect.length})`);

    // Toggle button injecté dans le titre (avant le bouton next)
    const titleH2 = document.getElementById('modal-title');
    const nextBtn = document.getElementById('mdl-next');
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'mdl-children-toggle';
    toggleBtn.className = 'mdl-nav-btn mdl-children-toggle';
    toggleBtn.title = `Tickets enfants (${total}) — cliquer pour afficher/masquer`;
    toggleBtn.innerHTML = `🌿<span class="mdl-children-toggle-count">${total}</span>`;
    if (nextBtn) titleH2.insertBefore(toggleBtn, nextBtn);
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
            <span class="badge badge-${esc(t.status)} badge-status badge-2xs">${esc(STATUS_LABELS[t.status] || t.status)}</span>
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
        console.info(`[ChildrenSidebar] Feature ${feature.id} : +${remoteOnly.length} ticket(s) récupérés depuis JIRA (non en base locale)`);
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
