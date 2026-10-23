/**
 * Paramètres → Membres (liste filtrable, import CSV) et capacité dev par rôle.
 * Le CSV des congés fait foi pour l'effectif : cf. `deriveMembersFromAbsences`.
 */

import { _memberAbsenceInfo } from './settings-absences-csv.js';
import { esc, deriveMembersFromAbsences, toast, confirmDanger } from '../utils.js';
import * as api from '../api.js';

/** Section « Membres ». */
export function membersSectionHtml(ctx) {
    const { members, absences, teamNames } = ctx;
    return `
        <!-- ═══ Members ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Membres (${members.length})</h3><p>Le CSV fait foi. L'équipe peut être modifiée directement dans la liste.</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="abs-filter-row mb-2">
                    <input class="input input-sm abs-filter-input" id="member-filter" placeholder="Filtrer par nom, équipe, rôle…" autocomplete="off">
                    <span class="abs-filter-count" id="member-filter-count"></span>
                </div>
                <div class="item-list" id="member-list">
                    ${members.map(m => {
                        const memberAbs = _memberAbsenceInfo(m.name, absences);
                        return `
                        <div class="item-row${memberAbs.todayCount > 0 ? ' item-row--absent-today' : ''}" data-id="${esc(m.id)}"
                             data-search="${esc((m.name + ' ' + (m.team || '') + ' ' + (m.role || '') + ' ' + (m.entity || '')).toLowerCase())}">
                            <span class="item-name">
                                ${esc(m.name)}
                                ${memberAbs.todayCount > 0 ? `<span class="member-abs-chip member-abs-chip--today" title="En congé aujourd'hui">🌴 Aujourd'hui</span>` : ''}
                                ${memberAbs.nextStart && !memberAbs.todayCount ? `<span class="member-abs-chip member-abs-chip--upcoming" title="Prochain congé : ${memberAbs.nextStart} (${memberAbs.nextDays}j)">📅 ${memberAbs.nextStart}</span>` : ''}
                            </span>
                            <select class="select select-sm member-team-select" data-id="${esc(m.id)}" title="Equipe">
                                <option value="">- equipe -</option>
                                ${teamNames.map(t => `<option value="${esc(t)}"${m.team === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}
                            </select>
                            <span class="item-meta">${esc(m.role || '-')}</span>
                            ${m.entity ? `<span class="item-meta item-entity">${esc(m.entity)}</span>` : '<span class="item-meta text-muted">-</span>'}
                            <span class="member-abs-strip" title="${memberAbs.tooltip}">${memberAbs.stripHtml}</span>
                            <div class="item-actions">
                                <button aria-label="Supprimer" class="btn-icon btn-del-member" data-id="${esc(m.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <div class="add-inline mt-2">
                    <input class="input" id="new-member-name" placeholder="Nom">
                    <select class="select" id="new-member-team">
                        <option value="">Equipe</option>
                        ${teamNames.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                    </select>
                    <input class="input input-narrow" id="new-member-role" placeholder="Role">
                    <input class="input input-narrow" id="new-member-entity" placeholder="Entite (societe)">
                    <button class="btn btn-primary btn-sm" id="btn-add-member">Ajouter</button>
                </div>

                <h4 class="text-sm font-semibold mt-4 mb-1">Import CSV membres</h4>
                <p class="text-xs text-muted mb-2">Format : <code>Nom;Equipe;Entite;Role</code> — une ligne par membre. Colonnes supplémentaires ignorées. Écrase toute la liste existante.</p>
                <textarea class="input" id="member-csv-input" rows="5" placeholder="Alice;Fuego;Accenture;Dev&#10;Bob;Gabbiano;Capgemini;PO&#10;Claire;Fuego;Accenture;SM"></textarea>
                <div class="flex gap-2 mt-2">
                    <button class="btn btn-primary btn-sm" id="btn-import-member-csv">Importer le CSV</button>
                    <button class="btn btn-danger btn-sm" id="btn-clear-members">Tout supprimer</button>
                </div>
            </div>
        </div>`;
}

/** Section « Capacité dev — % de travail par rôle » (vide sans rôle connu). */
export function capRolesSectionHtml(ctx) {
    const { members, absences, piInfo } = ctx;
    const effMembers = deriveMembersFromAbsences(absences, members);
    const roles = [...new Set(effMembers.map(m => m.role).filter(Boolean))].sort();
    const rolePctMap = piInfo?.roleCapacity || {};
    if (!roles.length) return '';
    return `
<div class="settings-section collapsed" id="section-cap-roles">
    <div class="settings-section-header" data-stg-toggle>
        <div>
            <h3>Capacité dev — % de travail par rôle</h3>
            <p>Pondère la contribution de chaque rôle au calcul de capacité. 100% = dev full-time, 0% = exclu.</p>
        </div>
        <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
    </div>
    <div class="settings-section-body">
        <div class="cap-roles-grid" id="cap-roles-settings-grid">
            ${roles.map(r => {
                const pct = rolePctMap[r] !== undefined ? rolePctMap[r] : 100;
                const roleMembers = effMembers.filter(m => m.role === r)
                    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
                const count = roleMembers.length;
                const copyText = roleMembers.map(m => `${m.name} (${m.team})`).join('\n');
                return `
                <div class="cap-role-row">
                    <span class="cap-role-name">${esc(r)}</span>
                    <span class="cap-role-count cap-role-count--tip" data-copy="${esc(copyText)}" tabindex="0">
                        ${count} membre${count > 1 ? 's' : ''}
                        <span class="cap-role-tip">
                            ${roleMembers.map(m => `<span class="cap-role-tip-member">
                                <span class="cap-role-tip-name">${esc(m.name)}</span>
                                <span class="cap-role-tip-team">${esc(m.team)}</span>
                            </span>`).join('')}
                            <span class="cap-role-tip-hint">Clic pour copier</span>
                        </span>
                    </span>
                    <div class="cap-role-slider-wrap">
                        <input type="range" class="cap-role-slider" min="0" max="100" step="10"
                            value="${pct}" data-role="${esc(r)}">
                        <span class="cap-role-pct-val${pct === 0 ? ' cap-role-pct-zero' : pct < 100 ? ' cap-role-pct-partial' : ''}">${pct}%</span>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>
</div>`;
}

/** Câblage des Membres : ajout, équipe, suppression, CSV, filtre live. */
export function wireMembersSection(container, ctx) {
    const { members } = ctx;
    // ── Members ───────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-member')?.addEventListener('click', async () => {
        const name   = container.querySelector('#new-member-name')?.value.trim();
        const team   = container.querySelector('#new-member-team')?.value;
        const role   = container.querySelector('#new-member-role')?.value.trim();
        const entity = container.querySelector('#new-member-entity')?.value.trim();
        if (!name) return;
        try { await api.createMember({ name, team, role, entity }); toast(`Membre "${name}" ajoute`, 'success'); await ctx.reload(); } catch (e) { toast(e.message, 'error'); }
    });
    // Inline team edit - auto-save on change
    container.querySelectorAll('.member-team-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            try { await api.updateMember(sel.dataset.id, { team: sel.value }); } catch (e) { toast(e.message, 'error'); }
        });
    });
    container.querySelectorAll('.btn-del-member').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!(await confirmDanger('Supprimer le membre', 'Supprimer ce membre ?', { confirmLabel: 'Supprimer' }))) return;
            try {
                await api.deleteMember(btn.dataset.id);
                btn.closest('.item-row')?.remove();
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // CSV import - always replaces all members (CSV is source of truth)
    container.querySelector('#btn-import-member-csv')?.addEventListener('click', async () => {
        const raw = container.querySelector('#member-csv-input')?.value.trim();
        if (!raw) { toast('Collez des donnees CSV d\'abord', 'warning'); return; }
        const parsed = raw.split('\n')
            .map(l => l.split(/[;\t]/).map(c => c.trim()))
            .filter(cols => cols[0])
            .map(cols => ({ name: cols[0], team: cols[1] || '', entity: cols[2] || '', role: cols[3] || '' }));
        if (!parsed.length) { toast('Aucune donnee valide', 'warning'); return; }
        if (!(await confirmDanger('Remplacer tous les membres', `Remplacer les ${members.length} membres actuels par ${parsed.length} membres du CSV ?`, { confirmLabel: 'Remplacer', danger: false }))) return;
        try {
            await api.bulkMergeMembers(parsed, true);
            toast(`${parsed.length} membres importes`, 'success');
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); }
    });
    container.querySelector('#btn-clear-members')?.addEventListener('click', async () => {
        if (!(await confirmDanger('Supprimer tous les membres', 'Supprimer TOUS les membres ?', { confirmLabel: 'Supprimer' }))) return;
        try {
            await Promise.all(members.map(m => api.deleteMember(m.id)));
            toast('Tous les membres supprimes', 'success');
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Filtre live Membres ───────────────────────────────────────────────────
    const memberFilterInput = container.querySelector('#member-filter');
    const memberFilterCount = container.querySelector('#member-filter-count');
    const _memberFilterRows = () => {
        const q = memberFilterInput?.value.trim().toLowerCase() || '';
        let visible = 0;
        container.querySelectorAll('#member-list .item-row').forEach(row => {
            const match = !q || (row.dataset.search || '').includes(q);
            row.style.display = match ? '' : 'none';
            if (match) visible++;
        });
        if (memberFilterCount) memberFilterCount.textContent = q ? `${visible} résultat${visible > 1 ? 's' : ''}` : '';
    };
    memberFilterInput?.addEventListener('input', _memberFilterRows);
}
