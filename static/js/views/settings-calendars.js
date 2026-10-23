/**
 * Paramètres → Calendriers ICS : ajout, édition, rafraîchissement (concurrence bornée
 * côté cal_banner) et équipes rattachées.
 */

import { esc, toast, confirmDanger } from '../utils.js';
import { calDetectHtml } from './settings-cal-detect.js';
import { store } from '../state.js';
import * as api from '../api.js';

/** Recharge calendriers + évènements depuis l'API, puis re-rend la vue. */
async function _reloadCalendars(ctx) {
    const [calendars, calendarEvents] = await Promise.all([
        api.getCalendars().catch(() => []),
        api.getCalendarEvents().catch(() => []),
    ]);
    store.set('calendars', calendars);
    store.set('calendarEvents', calendarEvents);
    ctx.rerender();
}

/** Section « Calendriers ICS ». */
export function calendarsSectionHtml(ctx) {
    const { calendars, teamNames } = ctx;
    return `
        <!-- ═══ Calendriers ICS ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Calendriers ICS (${calendars.length})</h3><p>Liens publics Google Calendar ou ICS par équipe — affichage dans la bannière Sprint/Kanban</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                ${calendars.length ? `
                    <div class="item-list mb-4" id="cal-list">
                        ${calendars.map(c => {
                            const teamsArr = (c.team || '').split(',').map(s => s.trim()).filter(Boolean);
                            const teamsChip = teamsArr.length === 0
                                ? '<span class="item-meta text-muted">toutes équipes</span>'
                                : teamsArr.length === 1
                                    ? `<span class="chip chip-sm">${esc(teamsArr[0])}</span>`
                                    : `<span class="chip chip-sm" title="${esc(teamsArr.join(', '))}">${teamsArr.length} équipes</span>`;
                            return `
                            <div class="item-row" data-id="${esc(c.id)}" data-cal-name="${esc(c.name)}" data-cal-url="${esc(c.icalUrl || '')}" data-cal-team="${esc(c.team || '')}">
                                <span class="cal-dot" style="background:var(--primary)">📅</span>
                                <span class="item-name">${esc(c.name)}</span>
                                ${teamsChip}
                                <span class="item-meta text-muted">${c.lastFetched ? 'Sync : ' + new Date(c.lastFetched).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Jamais synchronisé'}</span>
                                <div class="item-actions">
                                    <button aria-label="Modifier" class="btn-icon btn-cal-edit" data-id="${esc(c.id)}" title="Modifier">✏️</button>
                                    <button class="btn btn-sm btn-secondary btn-cal-refresh" data-id="${esc(c.id)}" title="Synchroniser">🔄</button>
                                    <button aria-label="Supprimer" class="btn-icon btn-del-cal" data-id="${esc(c.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="flex gap-2 mb-4">
                        <button class="btn btn-secondary btn-sm" id="btn-cal-refresh-all">🔄 Rafraichir tous</button>
                    </div>
                ` : '<p class="text-muted text-sm mb-4">Aucun calendrier configuré</p>'}

                ${calendars.length ? calDetectHtml() : ''}

                <h4 class="text-sm font-semibold mb-2">Ajouter un calendrier</h4>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Nom *</label>
                        <input class="input" id="cal-name" placeholder="Réunions Alpha">
                    </div>
                    <div class="form-group">
                        <label class="label">Équipes (aucune = toutes)</label>
                        <div class="cal-teams-picker" id="cal-teams-picker" data-selected="">
                            <button type="button" class="team-pill is-active" data-team="">Toutes</button>
                            ${teamNames.map(t => `<button type="button" class="team-pill" data-team="${esc(t)}">${esc(t)}</button>`).join('')}
                        </div>
                        <p class="text-xs text-muted mt-1">Clic pour ajouter/retirer — plusieurs équipes possibles</p>
                    </div>
                </div>
                <div class="form-group mb-3">
                    <label class="label">URL ICS *</label>
                    <input class="input" id="cal-url" placeholder="https://calendar.google.com/calendar/ical/...">
                    <p class="text-xs text-muted mt-1">Google Calendar : Paramètres du calendrier → Intégrations → Adresse publique au format ICAL</p>
                </div>
                <button class="btn btn-primary btn-sm" id="btn-add-cal">Ajouter et synchroniser</button>
            </div>
        </div>`;
}

/** Câblage des calendriers ICS. */
export function wireCalendarsSection(container, ctx) {
    const { calendars, teamNames } = ctx;
    // ── Calendriers ICS ───────────────────────────────────────────────────────
    // Picker équipes en pills (mono ou multi-sélection — CSV en sortie via getter)
    const _wireTeamsPicker = (root, currentCsv = '') => {
        if (!root) return;
        const current = new Set((currentCsv || '').split(',').map(s => s.trim()).filter(Boolean));
        root.querySelectorAll('.team-pill').forEach(p => {
            const team = p.dataset.team;
            // État initial : "Toutes" actif si current vide
            if (!team && current.size === 0) p.classList.add('is-active');
            else if (team && current.has(team)) p.classList.add('is-active');
            else p.classList.remove('is-active');
        });
        root.addEventListener('click', e => {
            const pill = e.target.closest('.team-pill');
            if (!pill || !root.contains(pill)) return;
            const team = pill.dataset.team;
            if (!team) {
                // "Toutes" → reset
                root.querySelectorAll('.team-pill').forEach(p => p.classList.toggle('is-active', p.dataset.team === ''));
            } else {
                root.querySelector('.team-pill[data-team=""]')?.classList.remove('is-active');
                pill.classList.toggle('is-active');
                // Si plus rien d'actif → réactive "Toutes"
                const anyActive = root.querySelectorAll('.team-pill[data-team]:not([data-team=""]).is-active').length > 0;
                if (!anyActive) root.querySelector('.team-pill[data-team=""]')?.classList.add('is-active');
            }
        });
    };
    const _readTeamsPicker = (root) => {
        if (!root) return '';
        return [...root.querySelectorAll('.team-pill.is-active')]
            .map(p => p.dataset.team).filter(Boolean).join(',');
    };

    // Init picker ajout
    _wireTeamsPicker(container.querySelector('#cal-teams-picker'));

    container.querySelector('#btn-add-cal')?.addEventListener('click', async () => {
        const name = container.querySelector('#cal-name')?.value.trim();
        const team = _readTeamsPicker(container.querySelector('#cal-teams-picker'));
        const url  = container.querySelector('#cal-url')?.value.trim();
        if (!name || !url) { toast('Nom et URL requis', 'warning'); return; }
        try {
            const cal = await api.createCalendar({ name, team, icalUrl: url });
            toast(`Calendrier "${name}" ajouté, synchronisation...`, 'info');
            try {
                await api.refreshCalendar(cal.id);
                toast('Synchronisation réussie', 'success');
            } catch (re) { toast(`Ajout OK mais sync échouée : ${re.message}`, 'warning'); }
            await _reloadCalendars(ctx);
        } catch (e) { toast(e.message, 'error'); }
    });

    // Délégation sur la liste des calendriers : edit / refresh / delete
    // (permet au cancel d'édition de juste remettre l'HTML sans re-bind individuel)
    const _openEdit = (row) => {
        if (!row || row.classList.contains('item-row--editing')) return;
        const id      = row.dataset.id;
        const curName = row.dataset.calName || '';
        const curUrl  = row.dataset.calUrl || '';
        const curTeam = row.dataset.calTeam || '';
        const origHtml = row.innerHTML;
        row.classList.add('item-row--editing');
        row.innerHTML = `
            <form class="cal-edit-form" data-id="${esc(id)}">
                <div class="cal-edit-fields">
                    <input class="input input-sm" name="name" value="${esc(curName)}" placeholder="Nom *" required>
                    <input class="input input-sm" name="url"  value="${esc(curUrl)}"  placeholder="URL ICS *" required>
                    <div class="cal-teams-picker cal-teams-picker--inline" data-edit-picker>
                        <button type="button" class="team-pill" data-team="">Toutes</button>
                        ${teamNames.map(t => `<button type="button" class="team-pill" data-team="${esc(t)}">${esc(t)}</button>`).join('')}
                    </div>
                </div>
                <div class="cal-edit-actions">
                    <button type="submit" class="btn btn-primary btn-sm" title="Enregistrer (Entrée)">✓</button>
                    <button type="button" class="btn btn-secondary btn-sm cal-edit-cancel" title="Annuler (Échap)">✗</button>
                </div>
            </form>`;
        const picker = row.querySelector('[data-edit-picker]');
        _wireTeamsPicker(picker, curTeam);
        const form = row.querySelector('.cal-edit-form');
        const nameInp = form.querySelector('input[name="name"]');
        nameInp.focus(); nameInp.select();
        const cancel = () => { row.classList.remove('item-row--editing'); row.innerHTML = origHtml; };
        form.querySelector('.cal-edit-cancel').addEventListener('click', cancel);
        form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = form.querySelector('input[name="name"]').value.trim();
            const newUrl  = form.querySelector('input[name="url"]').value.trim();
            const newTeam = _readTeamsPicker(picker);
            if (!newName || !newUrl) { toast('Nom et URL requis', 'warning'); return; }
            try {
                await api.updateCalendar(id, { name: newName, icalUrl: newUrl, team: newTeam });
                toast('Calendrier mis à jour', 'success');
                await _reloadCalendars(ctx);
            } catch (err) { toast(err.message, 'error'); }
        });
    };

    container.querySelector('#cal-list')?.addEventListener('click', async (e) => {
        const edit = e.target.closest('.btn-cal-edit');
        if (edit) { _openEdit(edit.closest('.item-row')); return; }
        const refresh = e.target.closest('.btn-cal-refresh');
        if (refresh) {
            refresh.disabled = true; refresh.textContent = '⏳';
            try { await api.refreshCalendar(refresh.dataset.id); toast('Synchronisé', 'success'); await _reloadCalendars(ctx); }
            catch (err) { toast(err.message, 'error'); refresh.disabled = false; refresh.textContent = '🔄'; }
            return;
        }
        const del = e.target.closest('.btn-del-cal');
        if (del) {
            if (!(await confirmDanger('Supprimer le calendrier', 'Supprimer ce calendrier ?', { confirmLabel: 'Supprimer' }))) return;
            try { await api.deleteCalendar(del.dataset.id); await _reloadCalendars(ctx); }
            catch (err) { toast(err.message, 'error'); }
        }
    });

    container.querySelector('#btn-cal-refresh-all')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-cal-refresh-all');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Synchronisation...'; }
        try {
            // Réutilise la synchro globale (même carte de progression que le bouton du header) :
            // pilote store.syncType/syncProgress/… + rafraichit calendars/events + toast récap.
            const { syncCalendars } = await import('../components/cal_banner.js');
            await syncCalendars('all');
            await _reloadCalendars(ctx);
        } catch (e) { toast(e.message, 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Rafraichir tous'; }
    });

    // (delete + refresh sont gérés par la délégation sur #cal-list ci-dessus)
}
