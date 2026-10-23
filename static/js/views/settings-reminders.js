/**
 * Paramètres → Rappels & Cérémonies (définitions dans reminders.js) et seuil des
 * tickets périmés du Backlog.
 */

import { loadReminders, REMINDER_DEFS, saveReminders as _saveReminders } from '../reminders.js';
import { esc, toast } from '../utils.js';

/** Section « Rappels & Cérémonies ». */
export function remindersSectionHtml(_ctx) {
    const reminders = loadReminders();
    return `
<div class="settings-section collapsed">
    <div class="settings-section-header" data-stg-toggle>
        <div><h3>Rappels &amp; Cérémonies</h3><p>Configurez quand afficher les rappels dans le panneau latéral</p></div>
        <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
    </div>
    <div class="settings-section-body">
        <p class="text-xs text-muted mb-3">J-0 = dernier jour du sprint &nbsp;·&nbsp; J-2 = 2 jours avant la fin du sprint</p>
        <div class="reminder-grid" id="reminder-grid">
            ${REMINDER_DEFS.map(def => {
                const cfg = reminders[def.id];
                return `
                <div class="reminder-card ${cfg.enabled ? '' : 'reminder-card--off'}" data-rid="${def.id}">
                    <div class="reminder-card-top">
                        <span class="reminder-icon">${def.icon}</span>
                        <span class="reminder-label">${esc(def.label)}</span>
                        <label class="toggle-switch" title="${cfg.enabled ? 'Désactiver' : 'Activer'}">
                            <input type="checkbox" class="reminder-toggle" data-rid="${esc(def.id)}" ${cfg.enabled ? 'checked' : ''}>
                            <span class="toggle-track"></span>
                        </label>
                    </div>
                    <div class="reminder-card-body">
                        <label class="abs-label">Afficher à J−</label>
                        <div class="reminder-days-row">
                            <input type="number" class="input reminder-days-input" data-rid="${esc(def.id)}"
                                value="${cfg.dBefore}" min="0" max="13" step="1" ${cfg.enabled ? '' : 'disabled'}>
                            <span class="reminder-days-unit">jours avant fin de sprint</span>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
        <p class="text-sm font-semibold mb-1">Backlog — tickets potentiellement périmés</p>
        <p class="text-xs text-muted mb-3">Affiche un séparateur dans le Backlog pour les tickets non mis à jour depuis plus de X mois, pour se poser la question de leur pertinence.</p>
        <div class="flex gap-2 items-center">
            <label class="label" style="margin:0;white-space:nowrap">Seuil :</label>
            <input type="number" class="input" id="bl-stale-months-input"
                   value="${parseInt(localStorage.getItem('sb-backlog-stale-months') || '3', 10) || 3}"
                   min="1" max="24" step="1" style="width:72px">
            <span class="text-xs text-muted">mois</span>
        </div>
    </div>
</div>`;
}

/** Câblage des rappels et du seuil Backlog. */
export function wireRemindersSection(container, _ctx) {
    // ── Reminders ─────────────────────────────────────────────────────────────
    container.querySelectorAll('.reminder-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const rid  = toggle.dataset.rid;
            const saved = loadReminders();
            saved[rid] = { ...saved[rid], enabled: toggle.checked };
            _saveReminders(saved);
            const card  = container.querySelector(`.reminder-card[data-rid="${rid}"]`);
            const input = card?.querySelector('.reminder-days-input');
            card?.classList.toggle('reminder-card--off', !toggle.checked);
            if (input) input.disabled = !toggle.checked;
        });
    });
    container.querySelectorAll('.reminder-days-input').forEach(input => {
        input.addEventListener('change', () => {
            const rid  = input.dataset.rid;
            const saved = loadReminders();
            saved[rid] = { ...saved[rid], dBefore: Math.max(0, parseInt(input.value) || 0) };
            _saveReminders(saved);
        });
    });

    // Backlog stale threshold
    container.querySelector('#bl-stale-months-input')?.addEventListener('change', e => {
        const val = Math.max(1, parseInt(e.target.value) || 3);
        e.target.value = val;
        localStorage.setItem('sb-backlog-stale-months', String(val));
        toast('Seuil périmés sauvegardé', 'success');
    });
}
