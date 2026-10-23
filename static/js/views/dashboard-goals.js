/**
 * Dashboard — bande « Cap de l'équipe » : objectif du sprint ⟷ objectifs du PI (score d'atteinte SAFe,
 * liste éditable en place sur le PI courant).
 */

import { esc, toast } from '../utils.js';
import { store } from '../state.js';
import * as api from '../api.js';

/** Colonne « Objectif du sprint » (identité, points, écart, votes). */
function _sprintGoalColHtml(m) {
    const { _sg, donePts, totalPts, moodSt, _vColor, _face, fistSt } = m;
    // Colonne gauche : identité + objectif du sprint. Reprend les éléments de sprint-header-top
    // (nom, jour restant, stats pts/écart/mood/fist) qui ont été retirés du bandeau sprint.
    const _sprintGoalCol = _sg ? `
        <article class="card gb-goal-card gb-goal-card--sprint">
            <header class="gb-hd">
                <span class="gb-eyebrow"><span class="gb-em">🎯</span>Objectif du sprint</span>
                <span class="gb-hd-sp"></span>
                <span class="gb-sprint-name" title="${esc(_sg.name)}">📌 ${esc(_sg.name)}</span>
                ${_sg.dayLabel ? `<span class="gb-pill${_sg.delta != null && _sg.delta < 0 ? ' gb-pill--warn' : ''}">${esc(_sg.dayLabel)}</span>` : ''}
            </header>
            <div class="gb-stats">
                <span class="gb-stat" title="Story points livrés / total"><strong>${donePts}</strong><span class="sep">/</span>${totalPts} <small>pts</small></span>
                ${_sg.deltaTxt ? `<span class="gb-stat gb-stat--${_sg.delta >= 0 ? 'ahead' : 'behind'}" title="Écart entre l'avancement points et le temps écoulé">${_sg.deltaTxt}</span>` : ''}
                ${moodSt ? `<span class="gb-stat gb-stat--vote" title="Mood Meter — ${moodSt.count} ${moodSt.count > 1 ? 'votes' : 'vote'}" style="border-color:${_vColor(moodSt.avg)}">🎭 ${_face(moodSt.avg)} <strong>${moodSt.avg}</strong><small>/5</small></span>` : ''}
                ${fistSt ? `<span class="gb-stat gb-stat--vote" title="Fist of Five — ${fistSt.count} ${fistSt.count > 1 ? 'votes' : 'vote'}" style="border-color:${_vColor(fistSt.avg)}">✊ <strong>${fistSt.avg}</strong><small>/5</small></span>` : ''}
            </div>
            <div class="gb-body">
                ${_sg.goal ? `<p class="gb-goal-text">${esc(_sg.goal)}</p>` : `<p class="gb-goal-empty">Aucun objectif de sprint défini pour cette itération.</p>`}
            </div>
        </article>` : '';
    return _sprintGoalCol;
}

/** Colonne « Objectifs du PI » : score d'atteinte et liste, ou état vide explicite. */
function _piObjColHtml(m) {
    const { teamObjs, displayPiNum, team, groupId, piScoreColor, piScore, commitDone, commitTotal, stretchDone, commitObjs, stretchObjs, isCurrentPi, _bv, teamObjects } = m;
    // Colonne droite : objectifs du PI — carte existante (score/barre/liste, édition inline conservée)
    // ou état vide explicite quand l'équipe n'a aucun objectif sur le PI.
    const _piObjCol = (!teamObjs.length && displayPiNum) ? `
        <article class="card pi-obj-attain mc-info gb-goal-card gb-goal-card--pi gb-goal-card--empty">
            <header class="gb-hd">
                <span class="gb-eyebrow"><span class="gb-em">🏔️</span>Objectifs du PI${displayPiNum ? ' #' + displayPiNum : ''}${team && team !== 'all' ? ` — ${esc(team)}` : ''}</span>
            </header>
            <div class="gb-empty">
                <span class="gb-empty-em">🗺️</span>
                <p class="gb-empty-title">Aucun objectif PI pour ${team && team !== 'all' ? esc(team) : 'votre équipe'}</p>
                <p class="gb-empty-sub">Rien d'enregistré ${team && team !== 'all' ? `pour ${esc(team)} ` : ''}sur le PI #${displayPiNum}. Sans objectif, pas de score d'atteinte à suivre.</p>
                <a class="btn btn-primary btn-sm" id="pi-obj-add" href="#pi/${groupId ? 'group:' + encodeURIComponent(groupId) : encodeURIComponent(team || 'all')}/objectives">+ Définir dans PI Planning</a>
            </div>
        </article>` : teamObjs.length ? `
        <article class="card pi-obj-attain gb-goal-card gb-goal-card--pi ${piScoreColor}">
            <header class="gb-hd">
                <span class="gb-eyebrow"><span class="gb-em">🏔️</span>Objectifs du PI${displayPiNum ? ' #' + displayPiNum : ''}${team && team !== 'all' ? ` — ${esc(team)}` : ''}</span>
            </header>
            <div class="pi-obj-attain-hdr">
                <div class="pi-obj-attain-score">
                    <span class="pi-obj-attain-num">${piScore == null ? '—' : piScore + '%'}</span>
                    <span class="pi-obj-attain-label">Atteinte ${commitDone}/${commitTotal} BV commis${stretchDone > 0 ? ` <small>+${stretchDone} BV stretch</small>` : ''}</span>
                </div>
                <div class="pi-obj-attain-summary">
                    <span class="pi-obj-summary-item">📌 <strong>${commitObjs.length}</strong> commis</span>
                    <span class="pi-obj-summary-item">🎯 <strong>${stretchObjs.length}</strong> stretch</span>
                    <span class="pi-obj-summary-item pi-obj-summary-item--done">✓ <strong>${teamObjs.filter(o => o.status === 'done').length}</strong> atteints</span>
                    <span class="pi-obj-summary-item pi-obj-summary-item--inprog">▶ <strong>${teamObjs.filter(o => o.status === 'inprog').length}</strong> en cours</span>
                    <span class="pi-obj-summary-item pi-obj-summary-item--todo">○ <strong>${teamObjs.filter(o => o.status === 'todo' || !o.status).length}</strong> à faire</span>
                </div>
            </div>
            ${piScore != null ? `
            <div class="pi-obj-attain-bar" title="Atteinte = (BV commis livrés + BV stretch livrés) / BV commis total">
                <div class="pi-obj-attain-bar-track">
                    <div class="pi-obj-attain-bar-fill" style="width:${Math.min(100, piScore)}%"></div>
                    ${piScore > 100 ? `<div class="pi-obj-attain-bar-bonus" style="left:100%; width:${Math.min(20, piScore - 100)}%" title="Stretch livré au-delà des commits"></div>` : ''}
                    <div class="pi-obj-attain-bar-target" style="left:80%" title="Cible SAFe : 80%"></div>
                </div>
                <div class="pi-obj-attain-bar-scale">
                    <span>0</span><span>80% <small>cible</small></span><span>100%</span>
                </div>
            </div>` : '<div class="text-sm text-muted">Aucun objectif commis défini — ajouter via PI Planning → Objectifs</div>'}
            <div class="pi-obj-attain-list">
                ${(() => {
                    const _stCls = o => o.status === 'done' ? 'done' : o.status === 'inprog' ? 'inprog' : o.status === 'blocked' ? 'blocked' : 'todo';
                    const _icon  = o => o.status === 'done' ? '✓' : o.status === 'inprog' ? '◐' : o.status === 'blocked' ? '⚠' : '○';
                    const _row   = o => {
                        // Commis/Stretch : bouton cliquable sur le PI courant, simple badge sinon.
                        const kind = isCurrentPi
                            ? `<button type="button" class="pi-obj-kind pi-obj-kind--${o.committed ? 'commit' : 'stretch'}" data-obj-toggle-committed title="Cliquer pour basculer Commis/Stretch">${o.committed ? 'Commis' : 'Stretch'}</button>`
                            : (o.committed
                                ? `<span class="pi-obj-kind pi-obj-kind--commit">Commis</span>`
                                : `<span class="pi-obj-kind pi-obj-kind--stretch">Stretch</span>`);
                        // Édition inline (texte, statut, commis, BV) uniquement sur le PI courant — pour un PI
                        // passé les objectifs sont un snapshot figé, édités via PI Planning si déverrouillé.
                        return `<div class="pi-obj-attain-item pi-obj-attain-item--${_stCls(o)}${isCurrentPi ? ' pi-obj-attain-item--editable' : ''}" data-obj-idx="${o._idx}" title="${esc(o.text || '')}">
                            <span class="pi-obj-attain-icon"${isCurrentPi ? ' data-obj-cycle-status title="Cliquer pour changer le statut"' : ''}>${_icon(o)}</span>
                            <span class="pi-obj-attain-text"${isCurrentPi ? ' data-obj-edit-text contenteditable="true" spellcheck="false" title="Cliquer pour modifier"' : ''}>${esc(o.text || 'Sans titre')}</span>
                            ${kind}
                            <span class="pi-obj-attain-bv" title="Business Value">BV <span${isCurrentPi ? ' data-obj-edit-bv contenteditable="true" spellcheck="false" title="Cliquer pour modifier (0–10)"' : ''}>${_bv(o)}</span></span>
                        </div>`;
                    };
                    const _sortObjs = list => list.slice().sort((a, b) =>
                        (a.committed === b.committed ? 0 : a.committed ? -1 : 1) || _bv(b) - _bv(a)
                    );

                    // Vue équipe unique : pas de groupement
                    if (team && team !== 'all') {
                        return _sortObjs(teamObjs).map(_row).join('');
                    }

                    // Vue globale : grouper par équipe, triées alphabétiquement
                    const byTeamMap = new Map();
                    for (const o of teamObjs) {
                        const k = o.team || '—';
                        if (!byTeamMap.has(k)) byTeamMap.set(k, []);
                        byTeamMap.get(k).push(o);
                    }
                    return [...byTeamMap.entries()]
                        .sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
                        .map(([teamName, objs]) => {
                            const tObj  = teamObjects.find(o => o.name === teamName);
                            const color = tObj?.color || 'var(--border)';
                            const done  = objs.filter(o => o.status === 'done').length;
                            return `
                            <div class="pi-obj-team-group">
                                <div class="pi-obj-team-hdr">
                                    <span class="pi-obj-team-dot" style="background:${color}"></span>
                                    <span class="pi-obj-team-name">${esc(teamName)}</span>
                                    <span class="pi-obj-team-count">${done}/${objs.length}</span>
                                </div>
                                ${_sortObjs(objs).map(_row).join('')}
                            </div>`;
                        }).join('');
                })()}
            </div>
        </article>` : '';
    return _piObjCol;
}

/** Bande « Cap de l'équipe » (Sprint | PI), une seule colonne si l'une manque. */
export function goalsBandHtml(m) {
    const { displayPiNum, _sg } = m;
    const _sprintGoalCol = _sprintGoalColHtml(m);
    const _piObjCol = _piObjColHtml(m);
    // Assemblage de la bande 2 colonnes (Sprint | PI). Grille sur une seule colonne si l'une manque.
    const _goalsBandHtml = (_sprintGoalCol || _piObjCol) ? `
        <section class="goals-band">
            <div class="goals-head">
                <h2>Cap de l'équipe</h2>
                ${(displayPiNum || (_sg && _sg.short)) ? `<span class="goals-flow">${displayPiNum ? `<b>PI #${displayPiNum}</b>` : ''}${displayPiNum && _sg && _sg.short ? ' → ' : ''}${_sg && _sg.short ? `<b>Ité ${esc(_sg.short)}</b>` : ''}</span>` : ''}
            </div>
            <div class="goals-grid${_sprintGoalCol && _piObjCol ? '' : ' goals-grid--single'}">
                ${_sprintGoalCol}
                ${_piObjCol}
            </div>
        </section>` : '';
    return _goalsBandHtml;
}

/** Édition en place des objectifs du PI courant (statut, texte, commis / stretch, BV). */
export function bindObjectivesEdit(container, m) {
    const { isCurrentPi, displayPiNum } = m;
    // ── Édition inline des objectifs PI (pi-obj-attain-list) ───────────────────
    // Permet de corriger un texte ou faire avancer un statut directement depuis le Dashboard,
    // sans repasser par PI Planning → Objectifs. Réécrit l'objectif à son index d'origine
    // (`_idx`, posé lors du calcul de piObjs) dans piInfo.objectives puis sauvegarde via l'API.
    if (isCurrentPi) {
        const STATUS_CYCLE = ['todo', 'inprog', 'done', 'blocked'];

        async function saveObjectiveField(idx, patch) {
            const piRaw = store.get('piInfo') || {};
            const liveObjs = [...(piRaw.objectives || [])];
            if (!liveObjs[idx]) return;
            liveObjs[idx] = { ...liveObjs[idx], ...patch };
            const piObjectives = displayPiNum
                ? { ...(piRaw.piObjectives || {}), [String(displayPiNum)]: liveObjs }
                : piRaw.piObjectives;
            try {
                const updated = await api.updatePI({ ...piRaw, objectives: liveObjs, piObjectives });
                store.set('piInfo', updated);
            } catch (e) { toast(e.message, 'error'); }
            m.rerender();
        }

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-cycle-status]').forEach(icon => {
            icon.addEventListener('click', () => {
                const idx = parseInt(icon.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                if (isNaN(idx)) return;
                const cur  = (store.get('piInfo')?.objectives || [])[idx]?.status || 'todo';
                const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
                saveObjectiveField(idx, { status: next });
            });
        });

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-edit-text]').forEach(textEl => {
            textEl.dataset.orig = textEl.textContent;
            textEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
                else if (e.key === 'Escape') { e.preventDefault(); textEl.textContent = textEl.dataset.orig; textEl.blur(); }
            });
            textEl.addEventListener('blur', () => {
                const idx = parseInt(textEl.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                const val = textEl.textContent.trim();
                if (isNaN(idx) || !val || val === textEl.dataset.orig) { textEl.textContent = textEl.dataset.orig; return; }
                saveObjectiveField(idx, { text: val });
            });
        });

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-toggle-committed]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                if (isNaN(idx)) return;
                const cur = (store.get('piInfo')?.objectives || [])[idx]?.committed || false;
                saveObjectiveField(idx, { committed: !cur });
            });
        });

        container.querySelectorAll('.pi-obj-attain-item--editable [data-obj-edit-bv]').forEach(bvEl => {
            bvEl.dataset.orig = bvEl.textContent;
            bvEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); bvEl.blur(); }
                else if (e.key === 'Escape') { e.preventDefault(); bvEl.textContent = bvEl.dataset.orig; bvEl.blur(); }
            });
            bvEl.addEventListener('blur', () => {
                const idx = parseInt(bvEl.closest('.pi-obj-attain-item')?.dataset.objIdx, 10);
                const n = Math.max(0, Math.min(10, parseInt(bvEl.textContent, 10) || 0));
                if (isNaN(idx) || String(n) === bvEl.dataset.orig) { bvEl.textContent = bvEl.dataset.orig; return; }
                bvEl.textContent = String(n);
                saveObjectiveField(idx, { bv: n });
            });
        });
    }
}
