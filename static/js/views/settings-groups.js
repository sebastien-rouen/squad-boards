/**
 * Paramètres → Lignes produit / Groupes : cartes de groupe (renommer, couleur,
 * équipes, déplacement) et création depuis les projets JIRA.
 */

import { esc, confirmDanger, toast } from '../utils.js';
import * as api from '../api.js';
import { store } from '../state.js';

/** Section « Lignes produit / Groupes ». */
export function groupsSectionHtml(ctx) {
    const { groups, jiraProjectTeams, teamNames } = ctx;
    return `
        <!-- ═══ Groups (Lignes produit) ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Lignes produit / Groupes (${groups.length})</h3><p>Regroupez des équipes pour filtrer par ligne produit</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                ${(() => {
                    const projects = Object.entries(jiraProjectTeams);
                    if (!projects.length) return '';
                    const existingTeamSets = groups.map(g => new Set((g.teams || []).map(t => t.toLowerCase())));
                    const missing = projects.filter(([, teams]) => {
                        const teamsLower = teams.map(t => t.toLowerCase());
                        return !existingTeamSets.some(s => teamsLower.every(t => s.has(t)));
                    });
                    if (!missing.length) return '';
                    const preview = missing.map(([pk, ts]) =>
                        `<span class="jira-project-chip" data-project="${esc(pk)}" data-teams="${esc(ts.join(','))}"><strong>${esc(pk)}</strong> <span class="chip-teams">${ts.map(t => esc(t)).join(', ')}</span></span>`
                    ).join('');
                    return `<div class="jira-group-suggest">
                        <svg class="icon icon-sm" style="flex-shrink:0"><use href="#i-jira"/></svg>
                        <div class="jira-group-suggest-body">
                            <strong>Regroupement automatique par projet JIRA</strong>
                            <span>Cliquez sur "Creer les groupes" pour creer un groupe par projet avec les equipes detectees :</span>
                            <div class="jira-project-chips">${preview}</div>
                        </div>
                        <button class="btn btn-sm btn-primary" id="btn-create-groups-from-jira">Creer les groupes</button>
                    </div>`;
                })()}
                <div class="grp-cards" id="group-list">
                    ${groups.length ? groups.map(g => {
                        const n = (g.teams || []).length;
                        const avail = teamNames.filter(t => !(g.teams || []).includes(t));
                        return `
                        <div class="grp-card" data-gid="${esc(g.id)}">
                            <div class="grp-card-hdr">
                                <input type="color" value="${esc(g.color || '#64748b')}" class="input-color-swatch grp-color-input" data-gid="${esc(g.id)}" title="Couleur du groupe">
                                <input type="text" class="grp-name-input" value="${esc(g.name)}" data-gid="${esc(g.id)}" data-orig="${esc(g.name)}" title="Cliquer pour renommer — Entrée ou perte de focus pour sauvegarder">
                                <span class="grp-count text-xs text-muted">${n} équipe${n !== 1 ? 's' : ''}</span>
                                <button aria-label="Supprimer ce groupe" class="btn-icon btn-del-group" data-id="${esc(g.id)}" title="Supprimer ce groupe" style="margin-left:auto">
                                    <svg class="icon icon-sm text-danger"><use href="#i-x"/></svg>
                                </button>
                            </div>
                            <div class="grp-chips-row">
                                ${(g.teams || []).map(t => `
                                    <span class="grp-team-chip">
                                        <span class="grp-chip-name">${esc(t)}</span>
                                        <span class="grp-chip-btns">
                                            <button type="button" class="grp-chip-move" data-team="${esc(t)}" data-from="${esc(g.id)}" title="Déplacer vers un autre groupe">⇄</button>
                                            <button type="button" class="grp-chip-rm" data-team="${esc(t)}" data-gid="${esc(g.id)}" title="Retirer de ce groupe">✕</button>
                                        </span>
                                    </span>
                                `).join('')}
                                ${avail.length ? `
                                <select class="grp-add-sel" data-gid="${esc(g.id)}" title="Ajouter une équipe dans ce groupe">
                                    <option value="">+ Ajouter une équipe…</option>
                                    ${avail.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                                </select>` : ''}
                                ${!n ? `<span class="text-xs text-muted" style="font-style:italic">Aucune équipe</span>` : ''}
                            </div>
                        </div>`;
                    }).join('') : `<p class="text-muted" style="font-size:var(--fs-sm);padding:var(--sp-2) 0">Aucun groupe — utilisez la suggestion ci-dessus ou ajoutez manuellement.</p>`}
                </div>
                <div class="add-inline mt-2">
                    <input class="input" id="new-group-name" placeholder="Nom du nouveau groupe">
                    <input class="input" id="new-group-teams" placeholder="Équipes (Alpha, Beta)" style="flex:2;">
                    <button class="btn btn-primary btn-sm" id="btn-add-group">Ajouter</button>
                </div>
            </div>
        </div>`;
}

/** Câblage de la section Groupes. */
export function wireGroupsSection(container, ctx) {
    // ── Groups — création depuis projets JIRA ─────────────────────────────────
    container.querySelector('#btn-create-groups-from-jira')?.addEventListener('click', async () => {
        const chips = container.querySelectorAll('.jira-project-chip');
        if (!chips.length) return;
        const toCreate = [...chips].map(c => ({ project: c.dataset.project, teams: c.dataset.teams.split(',').filter(Boolean) }));
        const names = toCreate.map(x => `${x.project} (${x.teams.join(', ')})`).join('\n');
        if (!(await confirmDanger('Créer groupes', `Créer ${toCreate.length} ${toCreate.length > 1 ? 'groupes' : 'groupe'} :\n${names}`, { confirmLabel: 'Créer' }))) return;
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
        try {
            for (let i = 0; i < toCreate.length; i++) {
                const { project, teams: groupTeams } = toCreate[i];
                await api.createGroup({ name: project, teams: groupTeams, color: colors[i % colors.length] });
            }
            toast(`${toCreate.length} ${toCreate.length > 1 ? 'groupes' : 'groupe'} ${toCreate.length > 1 ? 'créés' : 'créé'}`, 'success');
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Groups ────────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-group')?.addEventListener('click', async () => {
        const name = container.querySelector('#new-group-name')?.value.trim();
        const teamsStr = container.querySelector('#new-group-teams')?.value.trim();
        if (!name) return;
        const groupTeams = teamsStr.split(',').map(t => t.trim()).filter(Boolean);
        try {
            await api.createGroup({ name, teams: groupTeams });
            toast(`Groupe "${name}" cree`, 'success');
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Groups : helper loader par carte ────────────────────────────────────
    const _grpSetSaving = (card, on) => {
        if (!card) return;
        card.classList.toggle('grp-card--saving', on);
    };

    // ── Groups : renommer inline ─────────────────────────────────────────────
    container.querySelectorAll('.grp-name-input').forEach(inp => {
        const save = async () => {
            const newName = inp.value.trim();
            if (!newName || newName === inp.dataset.orig) return;
            const g    = (store.get('groups') || []).find(x => x.id === inp.dataset.gid);
            if (!g) return;
            const card = inp.closest('.grp-card');
            _grpSetSaving(card, true);
            try {
                await api.updateGroup(g.id, { name: newName, teams: g.teams, color: g.color });
                inp.dataset.orig = newName;
                toast('Groupe renommé', 'success');
                await ctx.reload();
            } catch (e) {
                inp.value = inp.dataset.orig;
                toast(e.message, 'error');
            } finally { _grpSetSaving(card, false); }
        };
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    });

    // ── Groups : couleur inline ──────────────────────────────────────────────
    container.querySelectorAll('.grp-color-input').forEach(inp => {
        inp.addEventListener('change', async () => {
            const g    = (store.get('groups') || []).find(x => x.id === inp.dataset.gid);
            if (!g) return;
            const card = inp.closest('.grp-card');
            _grpSetSaving(card, true);
            try {
                await api.updateGroup(g.id, { name: g.name, teams: g.teams, color: inp.value });
                await ctx.reload();
            } catch (e) {
                toast(e.message, 'error');
            } finally { _grpSetSaving(card, false); }
        });
    });

    // ── Groups : retirer une équipe ──────────────────────────────────────────
    container.querySelectorAll('.grp-chip-rm').forEach(btn => {
        btn.addEventListener('click', async () => {
            const team = btn.dataset.team;
            const g    = (store.get('groups') || []).find(x => x.id === btn.dataset.gid);
            if (!g) return;
            const card = btn.closest('.grp-card');
            _grpSetSaving(card, true);
            try {
                await api.updateGroup(g.id, { name: g.name, color: g.color, teams: (g.teams || []).filter(t => t !== team) });
                await ctx.reload();
            } catch (e) {
                toast(e.message, 'error');
            } finally { _grpSetSaving(card, false); }
        });
    });

    // ── Groups : ajouter une équipe ──────────────────────────────────────────
    container.querySelectorAll('.grp-add-sel').forEach(sel => {
        sel.addEventListener('change', async () => {
            const team = sel.value;
            if (!team) return;
            sel.value = '';
            const g    = (store.get('groups') || []).find(x => x.id === sel.dataset.gid);
            if (!g) return;
            const card = sel.closest('.grp-card');
            _grpSetSaving(card, true);
            try {
                await api.updateGroup(g.id, { name: g.name, color: g.color, teams: [...(g.teams || []), team] });
                await ctx.reload();
            } catch (e) {
                toast(e.message, 'error');
            } finally { _grpSetSaving(card, false); }
        });
    });

    // ── Groups : déplacer une équipe (popover) ───────────────────────────────
    {
        const pop = document.createElement('div');
        pop.className = 'grp-move-popover';
        pop.style.display = 'none';
        pop.style.position = 'fixed';
        document.body.appendChild(pop);

        let _activeMoveBtn = null;
        const closePopover = () => {
            pop.style.display = 'none';
            _activeMoveBtn = null;
        };
        document.addEventListener('mousedown', e => {
            if (!pop.contains(e.target) && e.target !== _activeMoveBtn) closePopover();
        }, true);

        container.querySelectorAll('.grp-chip-move').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (_activeMoveBtn === btn) { closePopover(); return; }
                _activeMoveBtn = btn;

                const team    = btn.dataset.team;
                const fromId  = btn.dataset.from;
                const allGrps = store.get('groups') || [];
                const targets = allGrps.filter(g => g.id !== fromId);

                pop.innerHTML = targets.length
                    ? `<div class="grp-move-popover-label">Déplacer <strong>${esc(team)}</strong> vers :</div>
                       ${targets.map(g => `
                           <button type="button" class="grp-move-popover-item" data-target="${esc(g.id)}" data-team="${esc(team)}" data-from="${esc(fromId)}">
                               <span style="width:8px;height:8px;border-radius:50%;background:${g.color};display:inline-block;flex-shrink:0"></span>
                               ${esc(g.name)}
                           </button>`).join('')}`
                    : `<span class="grp-move-popover-empty">Aucun autre groupe disponible.</span>`;

                const rect = btn.getBoundingClientRect();
                pop.style.top  = `${rect.bottom + 4}px`;
                pop.style.left = `${rect.left}px`;
                pop.style.display = 'flex';

                pop.querySelectorAll('.grp-move-popover-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        closePopover();
                        const tTeam   = item.dataset.team;
                        const fromGrp = allGrps.find(g => g.id === item.dataset.from);
                        const toGrp   = allGrps.find(g => g.id === item.dataset.target);
                        if (!fromGrp || !toGrp) return;
                        // Loader sur la carte source
                        const srcCard = container.querySelector(`.grp-card[data-gid="${CSS.escape(fromGrp.id)}"]`);
                        const dstCard = container.querySelector(`.grp-card[data-gid="${CSS.escape(toGrp.id)}"]`);
                        _grpSetSaving(srcCard, true);
                        _grpSetSaving(dstCard, true);
                        try {
                            await api.updateGroup(fromGrp.id, { name: fromGrp.name, color: fromGrp.color, teams: (fromGrp.teams || []).filter(t => t !== tTeam) });
                            await api.updateGroup(toGrp.id,   { name: toGrp.name,   color: toGrp.color,   teams: [...(toGrp.teams || []), tTeam] });
                            toast(`${tTeam} déplacée vers ${toGrp.name}`, 'success');
                            await ctx.reload();
                        } catch (err) {
                            toast(err.message, 'error');
                        } finally {
                            _grpSetSaving(srcCard, false);
                            _grpSetSaving(dstCard, false);
                        }
                    });
                });

                requestAnimationFrame(() => {
                    const pr = pop.getBoundingClientRect();
                    if (pr.right > window.innerWidth) pop.style.left = `${window.innerWidth - pr.width - 8}px`;
                });
            });
        });
    }

    container.querySelectorAll('.btn-del-group').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!(await confirmDanger('Supprimer le groupe', 'Supprimer ce groupe ?', { confirmLabel: 'Supprimer' }))) return;
            const card = btn.closest('.grp-card');
            _grpSetSaving(card, true);
            try {
                await api.deleteGroup(btn.dataset.id);
                await ctx.reload();
            } catch (e) {
                toast(e.message, 'error');
            } finally { _grpSetSaving(card, false); }
        });
    });
}
