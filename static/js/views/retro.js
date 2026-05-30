/**
 * Retro board - 4 swimlanes: Retro, Post-mortem, CoP, Adapt.
 * Affiche les RetroItems (actions creees ici) ET les tickets ordinaires
 * categorises par leurs labels (retro, postmortem, cop, adapt).
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, filterByTeam, fmtRelative, toast } from '../utils.js';

const SRC_COLOR = {
    retro:      'var(--status-inprog)',
    postmortem: 'var(--danger)',
    cop:        'var(--info)',
    adapt:      'var(--warning)',
};

const PRI_COLOR = {
    critical: 'var(--danger)',
    high:     'var(--warning)',
    medium:   'var(--info)',
    low:      'var(--success)',
};

const SOURCES = [
    { id: 'retro',      label: 'Retrospective', icon: '🔄', color: 'var(--status-inprog)' },
    { id: 'postmortem', label: 'Post-mortem',    icon: '💥', color: 'var(--danger)' },
    { id: 'cop',        label: 'CoP',            icon: '🎓', color: 'var(--info)' },
    { id: 'adapt',      label: 'Adapt / PI',     icon: '🎯', color: 'var(--warning)' },
];

const STATUSES = [
    { id: 'todo',   label: 'A faire' },
    { id: 'inprog', label: 'En cours' },
    { id: 'done',   label: 'Termine' },
];

const PRIORITY_CSS = { critical: 'danger', high: 'warning', medium: 'info', low: 'success' };

/** Normalise : minuscules + suppression des accents (ex: "Rétro" → "retro") */
function _norm(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Catégorise un ticket ordinaire selon ses labels/titre → id swimlane ou null */
function _retroCategory(ticket) {
    const labels = (ticket.labels || []).map(l => _norm(l));
    const title  = _norm(ticket.title || '');
    if (labels.some(l => ['postmortem', 'post-mortem'].includes(l)) || /post-?mortem/.test(title)) return 'postmortem';
    if (labels.some(l => ['cop', 'cop-methodo', 'cop-dev', 'methodo'].includes(l)) || /\bcop\b/.test(title)) return 'cop';
    if (labels.some(l => ['adapt', 'adaptation', 'amelioration'].includes(l))) return 'adapt';
    if (labels.some(l => ['retro', 'retrospective', 'actionretro', 'retroffonc', 'retro-tech'].includes(l)) || /retro/.test(title)) return 'retro';
    return null;
}

/** Mappe un statut ticket (todo/inprog/done/backlog…) vers un statut retro */
function _ticketStatus(status) {
    if (!status) return 'todo';
    const s = status.toLowerCase();
    if (['done', 'closed', 'resolved'].includes(s)) return 'done';
    if (['inprog', 'in_progress', 'in-progress', 'doing', 'review'].includes(s)) return 'inprog';
    return 'todo';
}

export function renderRetro(container) {
    const team     = store.get('team');
    const items    = store.get('retroItems') || [];
    const allTickets = store.get('tickets') || [];
    const members  = store.get('members') || [];
    const teamNames = store.get('teams') || [];

    // RetroItems filtrés par équipe
    const filteredItems = team && team !== 'all'
        ? items.filter(i => !i.team || i.team === team)
        : items;

    // Tickets ordinaires catégorisés
    const filteredTickets = filterByTeam(allTickets, team);
    const ticketItems = filteredTickets
        .map(t => {
            const src = _retroCategory(t);
            if (!src) return null;
            return {
                id:          t.id,
                title:       t.title,
                source:      src,
                status:      _ticketStatus(t.status),
                team:        t.team,
                owner:       t.leader,
                createdAt:   t.createdAt,
                priority:    t.priority,
                isTicket:    true,
            };
        })
        .filter(Boolean);

    // Union des deux sources
    const allItems = [
        ...filteredItems.map(i => ({ ...i, isTicket: false })),
        ...ticketItems,
    ];

    const total = allItems.length;
    const done  = allItems.filter(i => i.status === 'done').length;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <span class="text-sm text-muted">${total} elements, ${done} termines</span>
                ${ticketItems.length ? `<span class="text-xs text-muted ml-2">(${filteredItems.length} actions + ${ticketItems.length} tickets)</span>` : ''}
            </div>
            <button class="btn btn-primary btn-sm" id="btn-add-retro">+ Action</button>
        </div>

        <div class="board-swimlanes compact">
            ${SOURCES.map(src => {
                const srcItems = allItems.filter(i => i.source === src.id);
                return `
                    <div class="swimlane">
                        <div class="swimlane-header" data-lane="${src.id}">
                            <span class="inline-flex-center">
                                <span>${src.icon}</span>
                                <strong>${src.label}</strong>
                                <span class="text-xs text-muted">(${srcItems.length})</span>
                            </span>
                            <svg class="icon icon-sm"><use href="#i-chevron-down"/></svg>
                        </div>
                        <div class="swimlane-body">
                            <div class="board">
                                ${STATUSES.map(st => {
                                    const stItems = srcItems.filter(i => i.status === st.id);
                                    return `
                                        <div class="board-column">
                                            <div class="column-header col-${st.id}">
                                                <span>${st.label}</span>
                                                <span class="column-count">${stItems.length}</span>
                                            </div>
                                            <div class="column-cards">
                                                ${stItems.map(i => i.isTicket ? _ticketCard(i) : _retroCard(i)).join('')}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        <!-- Add form (hidden by default) -->
        <div id="retro-form" class="card mt-4 hidden">
            <div class="card-header"><span class="card-title">Nouvelle action</span></div>
            <div class="form-group"><label class="label">Titre *</label><input class="input" id="retro-title"></div>
            <div class="form-row">
                <div class="form-group"><label class="label">Source</label>
                    <select class="select w-full" id="retro-source">
                        ${SOURCES.map(s => `<option value="${s.id}">${s.icon} ${s.label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label class="label">Equipe</label>
                    <select class="select w-full" id="retro-team">
                        <option value="">-</option>
                        ${teamNames.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group"><label class="label">Responsable</label>
                <select class="select w-full" id="retro-owner">
                    <option value="">-</option>
                    ${members.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}
                </select>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary btn-sm" id="retro-cancel">Annuler</button>
                <button class="btn btn-primary btn-sm" id="retro-save">Creer</button>
            </div>
        </div>
    `;

    // Toggle form
    container.querySelector('#btn-add-retro')?.addEventListener('click', () => {
        container.querySelector('#retro-form')?.classList.toggle('hidden');
    });
    container.querySelector('#retro-cancel')?.addEventListener('click', () => {
        container.querySelector('#retro-form')?.classList.add('hidden');
    });

    // Save
    container.querySelector('#retro-save')?.addEventListener('click', async () => {
        const title = container.querySelector('#retro-title')?.value.trim();
        if (!title) { toast('Titre requis', 'warning'); return; }
        try {
            await api.createRetro({
                title,
                source: container.querySelector('#retro-source')?.value || 'retro',
                team:   container.querySelector('#retro-team')?.value || '',
                owner:  container.querySelector('#retro-owner')?.value || null,
            });
            await _reloadRetro();
            toast('Action creee', 'success');
            renderRetro(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    // Status change on RetroItem cards
    container.querySelectorAll('.retro-status-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            try {
                await api.updateRetro(sel.dataset.id, { status: sel.value });
                await _reloadRetro();
                renderRetro(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // Delete RetroItem
    container.querySelectorAll('.retro-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Supprimer ?')) return;
            try {
                await api.deleteRetro(btn.dataset.id);
                await _reloadRetro();
                renderRetro(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // Ticket rows → open modal
    container.querySelectorAll('.retro-ticket-row').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticketId));
    });

    // Swimlane collapse
    container.querySelectorAll('.swimlane-header').forEach(h => {
        h.addEventListener('click', () => {
            const body = h.nextElementSibling;
            body?.classList.toggle('collapsed');
        });
    });
}

/** Carte pour un RetroItem (action crée dans squad-board) */
function _retroCard(item) {
    const age = Math.round((Date.now() - new Date(item.createdAt).getTime()) / 86400000);
    const ageClass = age > 30 ? 'text-danger' : age > 14 ? 'text-warning' : 'text-muted';
    return `
        <div class="ticket-card">
            <div class="ticket-card-top">
                <span class="text-xs ${ageClass}">${age}j</span>
                <select class="status-select retro-status-select badge-2xs" data-id="${esc(item.id)}">
                    ${STATUSES.map(s => `<option value="${s.id}"${s.id === item.status ? ' selected' : ''}>${s.label}</option>`).join('')}
                </select>
            </div>
            <div class="ticket-title">${esc(item.title)}</div>
            <div class="ticket-card-bottom">
                <span class="text-xs text-muted">${esc(item.owner || '-')}</span>
                <span class="text-xs text-muted">${esc(item.team || '-')}</span>
                <button class="btn-icon retro-del" data-id="${esc(item.id)}"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
            </div>
        </div>
    `;
}

/** Normalise une priorité vers critical/high/medium/low (gère les priorités JIRA françaises) */
function _priKey(p) {
    if (!p) return 'medium';
    const s = p.toLowerCase();
    if (s.includes('crit') || s === '1') return 'critical';
    if (s.includes('haut') || s.includes('high') || s === '2') return 'high';
    if (s.includes('bass') || s.includes('low') || s === '4') return 'low';
    return 'medium';
}

/** Initiales depuis un nom complet */
function _initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
}

/** Carte pour un ticket ordinaire catégorisé (read-only, cliquable) */
function _ticketCard(item) {
    const age      = item.createdAt ? Math.round((Date.now() - new Date(item.createdAt).getTime()) / 86400000) : 0;
    const ageCls   = age > 30 ? 'rtc-age-stale' : age > 14 ? 'rtc-age-warn' : 'rtc-age-ok';
    const priKey   = _priKey(item.priority);
    const priColor = PRI_COLOR[priKey];
    const srcColor = SRC_COLOR[item.source] || 'var(--info)';
    const initials = _initials(item.owner);

    return `
        <div class="rtc retro-ticket-row" style="--rtc-src:${srcColor}" data-ticket-id="${esc(item.id)}">
            <div class="rtc-head">
                <span class="rtc-key">${esc(item.id)}</span>
                <div class="rtc-tags">
                    <span class="rtc-age ${ageCls}">${age}j</span>
                    <span class="rtc-dot" style="background:${priColor}" title="${esc(item.priority || '')}"></span>
                </div>
            </div>
            <div class="rtc-title">${esc(item.title)}</div>
            <div class="rtc-foot">
                ${item.owner ? `<div class="rtc-av">${esc(initials)}</div><span class="rtc-who">${esc(item.owner)}</span>` : ''}
                ${item.team ? `<span class="rtc-team">${esc(item.team)}</span>` : ''}
            </div>
        </div>
    `;
}

async function _reloadRetro() {
    const items = await api.getRetro();
    store.set('retroItems', items);
}
