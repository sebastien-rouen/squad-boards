/**
 * Paramètres → Équipes : création, couleur, suppression, et import CSV des objectifs de PI.
 */

import { esc, getCurrentPi, toast, choiceModal, confirmDanger } from '../utils.js';
import * as api from '../api.js';
import { addExcludedTeam } from '../sync.js';
import { store } from '../state.js';

/** Section « Équipes » (+ import des objectifs de PI). */
export function teamsSectionHtml(ctx) {
    const { teams, tickets, sprintInfo, piInfo } = ctx;
    return `
        <!-- ═══ Teams ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <h3>Équipes (${teams.length})</h3>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="team-grid" id="team-list">
                    ${teams.map(t => `
                        <div class="team-grid-item" data-id="${esc(t.id)}">
                            <input type="color" value="${t.color || '#3b82f6'}" data-team-id="${esc(t.id)}" class="input-color-swatch">
                            <span class="item-name">${esc(t.name)}</span>
                            <span class="item-meta">${tickets.filter(x => x.team === t.name).length}</span>
                            <button aria-label="Supprimer" class="btn-icon btn-del-team" data-id="${esc(t.id)}" data-name="${esc(t.name)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                        </div>
                    `).join('')}
                </div>
                <div class="add-inline mt-2">
                    <input class="input" id="new-team-name" placeholder="Nom de l'equipe">
                    <button class="btn btn-primary btn-sm" id="btn-add-team">Ajouter</button>
                </div>

                <!-- ── Import objectifs PI ── -->
                <div class="obj-import-card">
                    <div class="obj-import-card-header">
                        <span class="obj-import-card-title">📋 Import d'objectifs PI</span>
                    </div>
                    <p class="text-xs text-muted mb-2">
                        Format : <code>Equipe;Objectif;BV;Committed;Statut</code> — une ligne par objectif.<br>
                        <span style="font-size:10px">BV = Business Value 0–10 (défaut : 5) · Committed : <code>oui</code> / <code>non</code> (défaut : oui) · Statut : <code>a faire</code> / <code>en cours</code> / <code>terminé</code> (défaut : à faire)</span>
                    </p>
                    <div class="flex gap-3 mb-2 items-center flex-wrap">
                        <label class="text-xs text-muted" style="white-space:nowrap">PI cible :</label>
                        <div class="obj-pi-btns" id="obj-pi-btns">
                            ${(() => {
                                const base = getCurrentPi({ sprintInfo, piInfo }) || 0;
                                return [-1, 0, 1].map(o => {
                                    const piNum = base + o;
                                    if (piNum < 1) return '';
                                    const label = o === 0 ? 'PI ' + piNum + ' ★' : 'PI ' + piNum;
                                    const active = o === 0 ? ' is-active' : '';
                                    return '<button class="obj-pi-btn' + active + '" data-pi="' + piNum + '">' + esc(label) + '</button>';
                                }).join('');
                            })()}
                        </div>
                        <input class="input" type="number" id="obj-csv-pi"
                            value="${getCurrentPi({ sprintInfo, piInfo }) || ''}"
                            placeholder="PI#" min="1" max="99" style="width:72px"
                            title="Numéro du PI cible (modifiable manuellement)">
                    </div>
                    <div class="obj-preset-bar">
                        <span class="text-xs text-muted">Preset :</span>
                        <button class="obj-preset-btn" id="btn-obj-preset-teams" title="4 objectifs par équipe (BV 10/9/8/5, committed sauf le 4e)">
                            🗂 Toutes les équipes
                        </button>
                    </div>
                    <textarea class="input" id="obj-csv-input" rows="6"
                        placeholder="Fuego;Livrer la feature Auth;8;oui&#10;Gabbiano;Stabiliser la prod;6;oui;en cours&#10;Fuego;Réduire la dette technique;4;non;terminé"></textarea>
                    <div class="obj-csv-preview" id="obj-csv-preview" hidden></div>
                    <div class="flex gap-2 mt-2">
                        <button class="btn btn-secondary btn-sm" id="btn-preview-obj-csv">👁 Aperçu</button>
                        <button class="btn btn-primary btn-sm" id="btn-import-obj-csv">📥 Importer</button>
                    </div>
                </div>
            </div>
        </div>`;
}

/** Câblage de la section Équipes et de l'import des objectifs. */
export function wireTeamsSection(container, ctx) {
    const { teams, sprintInfo, piInfo } = ctx;
    // ── Teams ─────────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-team')?.addEventListener('click', async () => {
        const name = container.querySelector('#new-team-name')?.value.trim();
        if (!name) return;
        try { await api.createTeam({ name }); toast(`Equipe "${name}" creee`, 'success'); await ctx.reload(); } catch (e) { toast(e.message, 'error'); }
    });
    container.querySelectorAll('.btn-del-team').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.dataset.name || '';
            const ok = await choiceModal(
                'Supprimer cette équipe ?',
                name
                    ? `« ${name} » sera supprimée et ajoutée aux équipes masquées : la sync JIRA ne la recréera plus (sauf "Tout réimporter").`
                    : 'Cette équipe sera supprimée.',
                [{ key: 'del', label: 'Supprimer', variant: 'danger' }]
            );
            if (ok !== 'del') return;
            try {
                await api.deleteTeam(btn.dataset.id);
                if (name) addExcludedTeam(name);  // mémorise le retrait pour la sync JIRA
                await ctx.reload();
            } catch (e) { toast(e.message, 'error'); }
        });
    });
    container.querySelectorAll('input[type="color"][data-team-id]').forEach(input => {
        input.addEventListener('change', async () => {
            try { await api.updateTeam(input.dataset.teamId, { color: input.value }); } catch { /* silent */ }
        });
    });

    // ── Import objectifs PI ───────────────────────────────────────────────────
    const _parseObjCsv = () => {
        const raw = container.querySelector('#obj-csv-input')?.value.trim();
        if (!raw) return null;
        const _parseStatus = s => {
            const v = (s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (['inprog', 'en cours', 'encours', 'wip', 'in progress'].includes(v)) return 'inprog';
            if (['done', 'termine', 'fini', 'fait', 'closed', 'close'].includes(v)) return 'done';
            return 'todo';
        };
        const objectives = [];
        for (const line of raw.split('\n').filter(l => l.trim())) {
            const cols = line.split(/[;\t]/).map(c => c.trim());
            if (!cols[0] || !cols[1]) continue;
            const bvRaw = parseFloat((cols[2] || '').replace(',', '.'));
            const bv = isNaN(bvRaw) ? 5 : Math.min(10, Math.max(0, bvRaw));
            const committedStr = (cols[3] || '').toLowerCase().trim();
            const committed = !['non', 'no', 'false', '0'].includes(committedStr);
            const status = _parseStatus(cols[4]);
            objectives.push({ team: cols[0], text: cols[1], bv, committed, status });
        }
        return objectives.length ? objectives : null;
    };

    container.querySelector('#btn-obj-preset-teams')?.addEventListener('click', () => {
        const teamList = (store.get('teamObjects') || []).map(t => t.name);
        if (!teamList.length) { toast('Aucune équipe configurée', 'warning'); return; }
        const bvs = [10, 9, 8, 5];
        const committed = ['oui', 'oui', 'oui', 'non'];
        const lines = teamList.flatMap(team =>
            bvs.map((bv, i) => team + ';Objectif ' + (i + 1) + ';' + bv + ';' + committed[i] + ';a faire')
        );
        const ta = container.querySelector('#obj-csv-input');
        if (ta) { ta.value = lines.join('\n'); ta.focus(); }
    });

    container.querySelectorAll('#obj-pi-btns .obj-pi-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('#obj-pi-btns .obj-pi-btn').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            const piInput = container.querySelector('#obj-csv-pi');
            if (piInput) piInput.value = btn.dataset.pi;
        });
    });
    container.querySelector('#obj-csv-pi')?.addEventListener('input', () => {
        const val = container.querySelector('#obj-csv-pi')?.value;
        container.querySelectorAll('#obj-pi-btns .obj-pi-btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset.pi === val);
        });
    });

    container.querySelector('#btn-preview-obj-csv')?.addEventListener('click', () => {
        const box = container.querySelector('#obj-csv-preview');
        const parsed = _parseObjCsv();
        if (!parsed) {
            if (box) { box.hidden = false; box.innerHTML = '<span class="text-danger text-xs">Aucune donnée valide (format : Equipe;Objectif;BV;Committed).</span>'; }
            return;
        }
        const piNum = parseInt(container.querySelector('#obj-csv-pi')?.value) || 0;
        const currentPiNum = getCurrentPi({ sprintInfo, piInfo }) || 0;
        const isCurrentPi = piNum === currentPiNum;
        const existingObjs = isCurrentPi
            ? (piInfo?.objectives || [])
            : (piInfo?.piObjectives?.[String(piNum)] || []);
        const existingTeams = new Set(existingObjs.map(o => o.team).filter(Boolean));

        const byTeam = {};
        for (const obj of parsed) {
            if (!byTeam[obj.team]) byTeam[obj.team] = [];
            byTeam[obj.team].push(obj);
        }
        const teamColorMap = Object.fromEntries((store.get('teamObjects') || []).map(t => [t.name, t.color]));
        const conflictTeams = Object.keys(byTeam).filter(t => existingTeams.has(t));

        const teamCards = Object.entries(byTeam).map(([team, objs]) => {
            const color = teamColorMap[team] || '#6366f1';
            const hasConflict = existingTeams.has(team);
            const existingCount = existingObjs.filter(o => o.team === team).length;
            const _statusLabel = s => s === 'inprog' ? { icon: '⏳', label: 'En cours', cls: 'inprog' } : s === 'done' ? { icon: '✅', label: 'Terminé', cls: 'done' } : { icon: '○', label: 'À faire', cls: 'todo' };
            const objRows = objs.map(o => {
                const st = _statusLabel(o.status);
                return '<div class="obj-preview-obj-row">'
                + '<span class="obj-preview-bv">BV ' + o.bv + '</span>'
                + '<span class="obj-preview-committed' + (o.committed ? ' is-committed' : '') + '">' + (o.committed ? '✦' : '◇') + '</span>'
                + '<span class="obj-preview-status obj-preview-status--' + st.cls + '">' + st.icon + ' ' + st.label + '</span>'
                + '<span class="obj-preview-text">' + esc(o.text) + '</span>'
                + '</div>';
            }).join('');
            const conflictChip = hasConflict
                ? '<span class="obj-conflict-chip">⚠ ' + existingCount + ' existant' + (existingCount > 1 ? 's' : '') + '</span>'
                : '';
            return '<div class="obj-preview-team-card' + (hasConflict ? ' has-conflict' : '') + '">'
                + '<div class="obj-preview-team-header">'
                + '<span class="team-dot" style="background:' + esc(color) + '"></span>'
                + '<strong>' + esc(team) + '</strong>'
                + '<span class="obj-preview-team-count">' + objs.length + ' objectif' + (objs.length > 1 ? 's' : '') + '</span>'
                + conflictChip
                + '</div>'
                + '<div class="obj-preview-obj-list">' + objRows + '</div>'
                + '</div>';
        }).join('');

        const conflictNote = conflictTeams.length
            ? '<span class="obj-preview-conflict-note">⚠ ' + conflictTeams.length + (conflictTeams.length > 1 ? ' équipes' : ' équipe') + ' avec objectifs existants</span>'
            : '';

        if (box) {
            box.hidden = false;
            box.innerHTML = '<div class="obj-csv-preview-hdr">'
                + '<span class="abs-csv-preview-badge">PI ' + (piNum || '?') + '</span>'
                + '<span>' + parsed.length + ' objectif' + (parsed.length > 1 ? 's' : '') + ' · ' + Object.keys(byTeam).length + ' équipe' + (Object.keys(byTeam).length > 1 ? 's' : '') + '</span>'
                + conflictNote
                + '</div>'
                + '<div class="obj-preview-teams">' + teamCards + '</div>';
        }
    });

    container.querySelector('#btn-import-obj-csv')?.addEventListener('click', async () => {
        const parsed = _parseObjCsv();
        if (!parsed) { toast('Collez des données CSV d\'abord', 'warning'); return; }

        const piNum = parseInt(container.querySelector('#obj-csv-pi')?.value) || 0;
        if (!piNum) { toast('Sélectionnez un PI cible', 'warning'); return; }

        const currentPiNum = getCurrentPi({ sprintInfo, piInfo }) || 0;
        const isCurrentPi = piNum === currentPiNum;
        const existingObjs = isCurrentPi
            ? (piInfo?.objectives || [])
            : (piInfo?.piObjectives?.[String(piNum)] || []);

        const importedByTeam = {};
        for (const obj of parsed) {
            if (!importedByTeam[obj.team]) importedByTeam[obj.team] = [];
            importedByTeam[obj.team].push(obj);
        }
        const existingTeams = new Set(existingObjs.map(o => o.team).filter(Boolean));
        const conflictTeams = Object.keys(importedByTeam).filter(t => existingTeams.has(t));

        let replaceConflicts = false;
        if (conflictTeams.length) {
            const conflictDetails = conflictTeams.map(t => {
                const n = existingObjs.filter(o => o.team === t).length;
                return '  · ' + t + ' (' + n + ' existant' + (n > 1 ? 's' : '') + ')';
            }).join('\n');
            const allConflict = Object.keys(importedByTeam).length === conflictTeams.length;
            const choice = await confirmDanger(
                'Conflits d\'objectifs',
                conflictTeams.length + (conflictTeams.length > 1 ? ' équipes ont' : ' équipe a') + ' déjà des objectifs pour PI ' + piNum + ' :\n' + conflictDetails + '\n\n'
                + 'Remplacer → Remplacer leurs objectifs existants\n'
                + 'Annuler → ' + (allConflict ? 'Annuler l\'import' : 'Ignorer ces équipes (n\'importer que les nouvelles)'),
                { confirmLabel: 'Remplacer', danger: false }
            );
            replaceConflicts = choice;
            if (!choice && allConflict) {
                toast('Import annulé — choisissez OK pour remplacer les objectifs existants', 'info');
                return;
            }
        } else {
            const teamList = Object.keys(importedByTeam).join(', ');
            if (!(await confirmDanger('Importer objectifs', 'Importer ' + parsed.length + (parsed.length > 1 ? ' objectifs' : ' objectif') + ' pour PI ' + piNum + ' ?\n' + Object.keys(importedByTeam).length + (Object.keys(importedByTeam).length > 1 ? ' équipes : ' : ' équipe : ') + teamList, { confirmLabel: 'Importer', danger: false }))) return;
        }

        let finalObjs;
        if (conflictTeams.length && replaceConflicts) {
            const toReplace = new Set(Object.keys(importedByTeam));
            finalObjs = [...existingObjs.filter(o => !toReplace.has(o.team)), ...parsed];
        } else if (conflictTeams.length && !replaceConflicts) {
            const conflictSet = new Set(conflictTeams);
            finalObjs = [...existingObjs, ...parsed.filter(o => !conflictSet.has(o.team))];
        } else {
            finalObjs = [...existingObjs, ...parsed];
        }

        try {
            await api.setPiObjectives(piNum, finalObjs);
            // Rafraîchir piInfo dans le store pour que Dashboard et PI Planning lisent les nouveaux objectifs
            const freshPi = await api.getPI();
            store.set('piInfo', freshPi);
            const added = finalObjs.length - existingObjs.length;
            const replaced = replaceConflicts ? conflictTeams.reduce((acc, t) => acc + importedByTeam[t].length, 0) : 0;
            const parts = [];
            if (added > 0) parts.push('+' + added + ' objectif' + (added > 1 ? 's' : ''));
            if (replaced > 0) parts.push(replaced + ' remplacé' + (replaced > 1 ? 's' : ''));
            toast((parts.join(' · ') || 'Objectifs mis à jour') + ' · PI ' + piNum, 'success');
        } catch (e) { toast(e.message, 'error'); }
    });
}
