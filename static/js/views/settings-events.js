/**
 * Paramètres → Faits marquants : incidents, gels, jalons, périodes (table `event`).
 */

import { fmtDate, esc, friendlyDateField, toast, confirmDanger } from '../utils.js';
import * as api from '../api.js';

/** Types de fait marquant : icône + libellé. */
const EVENT_TYPES = {
    incident:  { icon: '💥', label: 'Incident' },
    freeze:    { icon: '🧊', label: 'Gel' },
    milestone: { icon: '🚩', label: 'Jalon' },
    period:    { icon: '📅', label: 'Periode' },
    other:     { icon: 'ℹ️',  label: 'Info' },
};

/** Section « Faits marquants ». */
export function eventsSectionHtml(ctx) {
    const { events } = ctx;
    return `
        <!-- ═══ Faits marquants (Events) ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Faits marquants (${events.length})</h3><p>Incidents, gels de code, jalons, périodes clés</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                ${events.length ? (() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const upcoming = events.filter(ev => (ev.endDate || ev.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
                    const past     = events.filter(ev => (ev.endDate || ev.startDate) <  today).sort((a, b) => b.startDate.localeCompare(a.startDate));

                    const _evRow = ev => {
                        const et = EVENT_TYPES[ev.type] || EVENT_TYPES.other;
                        const hasDesc = ev.description && ev.description.trim();
                        const dateStr = fmtDate(ev.startDate) + (ev.endDate && ev.endDate !== ev.startDate ? ' → ' + fmtDate(ev.endDate) : '');
                        const teamsStr = (ev.teams || []).length ? ev.teams.map(t => esc(t)).join(', ') : '';
                        return `<div class="item-row evt-item-row${hasDesc ? ' evt-has-desc' : ''}">
                            <span class="text-lg">${et.icon}</span>
                            <div class="evt-item-main">
                                ${hasDesc ? `
                                <details class="evt-details">
                                    <summary class="evt-summary">
                                        <span class="item-name">${esc(ev.title)}</span>
                                        <span class="item-meta">${esc(et.label)}</span>
                                        <span class="item-meta">${esc(dateStr)}</span>
                                        ${teamsStr ? `<span class="item-meta">${teamsStr}</span>` : ''}
                                    </summary>
                                    <div class="evt-desc-body">${esc(ev.description)}</div>
                                </details>` : `
                                <span class="item-name">${esc(ev.title)}</span>
                                <span class="item-meta">${esc(et.label)}</span>
                                <span class="item-meta">${esc(dateStr)}</span>
                                ${teamsStr ? `<span class="item-meta">${teamsStr}</span>` : ''}`}
                            </div>
                            <div class="item-actions">
                                <button aria-label="Supprimer" class="btn-icon btn-del-event" data-id="${esc(ev.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                            </div>
                        </div>`;
                    };

                    const _section = (label, items, collapsed = false) => items.length ? `
                        <details class="evt-group-details"${collapsed ? '' : ' open'}>
                            <summary class="evt-group-label">
                                <span>${label}</span>
                                <span class="evt-group-count">${items.length}</span>
                            </summary>
                            <div class="item-list mb-3 mt-2">${items.map(_evRow).join('')}</div>
                        </details>` : '';

                    return `<div class="mb-4">
                        ${_section('À venir', upcoming)}
                        ${_section('Passés',  past, true)}
                    </div>`;
                })() : '<p class="text-muted text-sm mb-4">Aucun fait marquant</p>'}

                <h4 class="text-sm font-semibold mb-2">Ajouter un fait marquant</h4>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Type</label>
                        <select class="select w-full" id="evt-type">
                            ${Object.entries(EVENT_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="label">Titre *</label>
                        <input class="input" id="evt-title" placeholder="Incident prod, Gel de code...">
                    </div>
                </div>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Date début *</label>
                        ${friendlyDateField({ id: 'evt-start', name: 'evt-start', placeholder: 'Début' })}
                    </div>
                    <div class="form-group">
                        <label class="label">Date fin (optionnelle)</label>
                        ${friendlyDateField({ id: 'evt-end', name: 'evt-end', placeholder: 'Fin (optionnel)' })}
                    </div>
                </div>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Equipes (vide = toutes)</label>
                        <input class="input" id="evt-teams" placeholder="Alpha, Beta">
                    </div>
                    <div class="form-group">
                        <label class="label">Description</label>
                        <input class="input" id="evt-desc" placeholder="Contexte, impact...">
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" id="btn-add-event">Ajouter</button>
            </div>
        </div>`;
}

/** Câblage des Faits marquants : ajout et suppression. */
export function wireEventsSection(container, ctx) {
    // ── Events ────────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-event')?.addEventListener('click', async () => {
        const title = container.querySelector('#evt-title')?.value.trim();
        const startDate = container.querySelector('#evt-start')?.value;
        if (!title || !startDate) { toast('Titre et date requis', 'warning'); return; }
        try {
            await api.createEvent({
                type: container.querySelector('#evt-type')?.value || 'other',
                title,
                description: container.querySelector('#evt-desc')?.value.trim() || '',
                startDate,
                endDate: container.querySelector('#evt-end')?.value || startDate,
                teams: (container.querySelector('#evt-teams')?.value || '').split(',').map(t => t.trim()).filter(Boolean),
            });
            toast('Fait marquant ajoute', 'success');
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); }
    });
    container.querySelectorAll('.btn-del-event').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!(await confirmDanger('Supprimer le fait marquant', 'Supprimer ce fait marquant ?', { confirmLabel: 'Supprimer' }))) return;
            try { await api.deleteEvent(btn.dataset.id); await ctx.reload(); } catch (e) { toast(e.message, 'error'); }
        });
    });
}
