/**
 * Paramètres → Membres (liste filtrable, import CSV) et capacité dev par rôle.
 * Le CSV des congés fait foi pour l'effectif : cf. `deriveMembersFromAbsences`.
 */

import { _memberAbsenceInfo } from './settings-absences-csv.js';
import { esc, deriveMembersFromAbsences, toast, confirmDanger } from '../utils.js';
import * as api from '../api.js';
import { DEFAULT_ROLE_ALIASES, projectRoleAliases, setRoleAlias } from '../utils/roles.js';

/** Section « Membres ». */
/** Membres rangés par équipe (alphabétique, « sans équipe » en dernier), noms triés dans chaque équipe (3.284.0). */
function _byTeam(members) {
    const by = new Map();
    for (const m of members) { const k = m.team || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
    const cmp = (a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' });
    return [...by.entries()].sort(([a], [b]) => (!a) - (!b) || cmp(a, b)).map(([k, l]) => [k, l.sort((x, y) => cmp(x.name, y.name))]);
}

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
                    ${_byTeam(members).map(([team, list]) => {
                        const rows = list.map(m => ({ m, abs: _memberAbsenceInfo(m.name, absences) }));
                        const off = rows.filter(r => r.abs.todayCount > 0).length;
                        return `<details class="mbr-team" data-team="${esc(team)}">
                        <summary class="mbr-team__head"><b>${esc(team || 'Sans équipe')}</b>
                            <span class="mbr-team__meta">${rows.length} personne${rows.length > 1 ? 's' : ''}${off ? ` · 🌴 ${off} absent${off > 1 ? 's' : ''} aujourd'hui` : ''}</span></summary>
                        ${rows.map(({ m, abs: memberAbs }) => `
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
                        </div>`).join('')}
                        </details>`;
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

                <details class="mbr-import mt-4"><summary class="text-sm font-semibold">📥 Import CSV membres</summary>
                <p class="text-xs text-muted mb-2">Format : <code>Nom;Equipe;Entite;Role</code> — une ligne par membre. Une ligne d'en-tête (<code>Nom</code>, <code>Équipe</code>, <code>Rôle</code>, <code>Entité</code>, en français ou en anglais) permet n'importe quel ordre de colonnes. Colonnes supplémentaires ignorées. Écrase toute la liste existante.</p>
                ${absences.some(a => a.memberName && a.team) ? '' : '<p class="text-xs mb-2">🧑‍🤝‍🧑 <strong>Aucun export RH importé</strong> : cette liste fait foi pour tout le site (Atlas, capacité, rotation, météo). Importer des congés RH la remplacera comme source.</p>'}
                <textarea class="input" id="member-csv-input" rows="5" placeholder="Alice;Fuego;Accenture;Dev&#10;Bob;Gabbiano;Capgemini;PO&#10;Claire;Fuego;Accenture;SM"></textarea>
                <div class="flex gap-2 mt-2">
                    <button class="btn btn-primary btn-sm" id="btn-import-member-csv">Importer le CSV</button>
                    <button class="btn btn-danger btn-sm" id="btn-clear-members">Tout supprimer</button>
                </div>
                </details>
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
            <p class="text-xs text-muted">Libellés regroupés d'office : majuscules et accents ignorés, abréviations ${Object.entries(DEFAULT_ROLE_ALIASES).map(([k, v]) => `${k.toUpperCase()} → ${esc(v)}`).join(', ')}${Object.keys(projectRoleAliases()).length ? ` ; regroupés par le projet : ${Object.entries(projectRoleAliases()).map(([k, v]) => `${esc(k)} → ${esc(v)} <button type="button" class="btn-link cap-role-unalias" data-role="${esc(k)}" title="Séparer à nouveau">✕</button>`).join(', ')}` : ''}.</p>
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
                    <select class="select select-sm cap-role-alias" data-role="${esc(r)}" title="Ce libellé désigne-t-il un autre rôle ? Il sera alors affiché et compté sous ce rôle, partout" aria-label="Même rôle que">
                        <option value="">= rôle distinct</option>
                        ${roles.filter(o => o !== r).map(o => `<option value="${esc(o)}">= ${esc(o)}</option>`).join('')}
                    </select>
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
    // Rôles regroupés (3.286.0) : « Design = Designer » → affiché et compté sous Designer, partout ; données rechargées
    const capRoles = container.querySelector('#section-cap-roles');
    capRoles?.addEventListener('change', async e => {
        const sel = e.target.closest('.cap-role-alias');
        if (!sel?.value) return;
        setRoleAlias(sel.dataset.role, sel.value);
        toast(`« ${sel.dataset.role} » compté comme « ${sel.value} »`, 'success');
        await ctx.reload();
    });
    capRoles?.addEventListener('click', async e => {
        const b = e.target.closest('.cap-role-unalias');
        if (!b) return;
        setRoleAlias(b.dataset.role, '');
        toast(`« ${b.dataset.role} » redevient un rôle distinct — rechargement`, 'info');
        location.reload();   // la séparation exige de relire les libellés bruts (déjà fusionnés en mémoire)
    });
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
        const parsed = parseMembersCsv(raw);
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
        // Équipes repliées (3.284.0) : une recherche ouvre celles qui ont un résultat et masque les autres
        container.querySelectorAll('#member-list .mbr-team').forEach(g => {
            const hits = [...g.querySelectorAll('.item-row')].some(r => r.style.display !== 'none');
            g.hidden = !!q && !hits;
            g.open = !!q && hits;
        });
        if (memberFilterCount) memberFilterCount.textContent = q ? `${visible} résultat${visible > 1 ? 's' : ''}` : '';
    };
    memberFilterInput?.addEventListener('input', _memberFilterRows);
}

const _HEAD = { name: /^(nom|name|noms?, ?pr[ée]nom|membre|personne)$/i, team: /^([ée]quipes?|team)$/i, entity: /^(entit[ée]|soci[ée]t[ée]|company|entity)$/i, role: /^(r[ôo]les?|role|fonction)$/i };
/**
 * CSV membres → [{ name, team, entity, role }]. Ligne d'en-tête reconnue (FR / EN, accents facultatifs) → colonnes
 * dans n'importe quel ordre ; sinon ordre fixe Nom;Equipe;Entite;Role (3.274.0).
 */
export function parseMembersCsv(raw) {
    const rows = String(raw || '').split('\n').map(l => l.split(/[;\t]/).map(c => c.trim())).filter(cols => cols[0]);
    if (!rows.length) return [];
    const idx = { name: 0, team: 1, entity: 2, role: 3 };
    const head = rows[0].map(c => Object.keys(_HEAD).find(k => _HEAD[k].test(c)) || null);
    if (head.includes('name')) {
        for (const k of Object.keys(idx)) idx[k] = head.indexOf(k);
        rows.shift();
    }
    const at = (cols, k) => (idx[k] >= 0 ? cols[idx[k]] || '' : '');
    return rows.map(cols => ({ name: at(cols, 'name'), team: at(cols, 'team'), entity: at(cols, 'entity'), role: at(cols, 'role') })).filter(m => m.name);
}
