/**
 * 🎯 Page PI → onglet Objectifs : engagement du PI, objectifs par équipe, verrou d'édition d'un PI passé.
 *
 * Extrait de pi.js (3.258.0), code déplacé à l'identique. N'importe jamais pi.js (pas de cycle).
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, pct, toast, resolvePiObjectives, computeCommitment, confirmDanger } from '../utils.js';

// ── Verrou d'édition des objectifs d'un PI passé ─────────────────────────────
let _objUnlocked  = false; // déverrouillage manuel des objectifs sur PI passé
let _lastPiOffset = null;  // détecte le changement de PI pour réinitialiser le verrou

/** Relâche le déverrouillage manuel quand le PI affiché change. */
export function syncObjectivesLock(piOffset) {
    if (_lastPiOffset !== null && _lastPiOffset !== piOffset) _objUnlocked = false;
    _lastPiOffset = piOffset;
}

// Panneau "Engagement du PI" (commitment baseline #12) — affiché en tête de l'onglet Objectifs.
function _commitmentPanelHtml(commit, baseline, canCapture) {
    const captureBtn = canCapture
        ? `<button class="btn btn-xs ${baseline ? 'btn-secondary' : 'btn-primary'}" id="pi-baseline-capture" title="${baseline ? 'Re-figer la baseline (remplace la précédente)' : 'Figer la liste des features engagées comme baseline du PI'}">📌 ${baseline ? 'Re-figer' : 'Figer la baseline'}</button>`
        : '';
    if (!baseline) {
        if (!canCapture) return '';
        return `<div class="pi-commit pi-commit--empty">
            <span class="pi-commit-empty-txt"><strong>Engagement non figé</strong> — figez la baseline en début de PI pour suivre « engagé vs livré » et le scope creep.</span>
            ${captureBtn}
        </div>`;
    }
    const c = commit;
    const delivPct = c.engagedPts > 0 ? Math.min(100, Math.round(c.deliveredPts / c.engagedPts * 100)) : 0;
    const sayDoCol = c.sayDo == null ? 'var(--text-muted)' : c.sayDo >= 80 ? 'var(--success)' : c.sayDo >= 50 ? 'var(--warning)' : 'var(--danger)';
    const when = c.capturedAt ? new Date(c.capturedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
    return `<div class="pi-commit">
        <div class="pi-commit-hd">
            <span class="pi-commit-title">📌 Engagement du PI${when ? ` <span class="pi-commit-when">figé le ${esc(when)}</span>` : ''}</span>
            ${captureBtn}
        </div>
        <div class="pi-commit-bar" title="${c.deliveredPts} / ${c.engagedPts} SP engagés livrés">
            <div class="pi-commit-bar-fill" style="width:${delivPct}%"></div>
        </div>
        <div class="pi-commit-stats">
            <span class="pi-commit-stat"><strong>${c.engagedPts}</strong> engagés</span>
            <span class="pi-commit-stat pi-commit-stat--ok"><strong>${c.deliveredPts}</strong> livrés</span>
            ${c.addedPts ? `<span class="pi-commit-stat pi-commit-stat--add" title="${c.addedCount} ${c.addedCount > 1 ? 'features' : 'feature'} ${c.addedCount > 1 ? 'ajoutées' : 'ajoutée'} après la baseline">+${c.addedPts} ajoutés (${c.addedCount})</span>` : ''}
            ${c.removedPts ? `<span class="pi-commit-stat pi-commit-stat--rm" title="${c.removedCount} ${c.removedCount > 1 ? 'features' : 'feature'} ${c.removedCount > 1 ? 'retirées' : 'retirée'} depuis la baseline">−${c.removedPts} retirés (${c.removedCount})</span>` : ''}
            <span class="pi-commit-saydo" style="color:${sayDoCol}" title="Say/Do = SP livrés ÷ SP engagés">Say/Do ${c.sayDo == null ? '—' : c.sayDo + '%'}</span>
        </div>
    </div>`;
}

// ── Objectives tab ────────────────────────────────────────────────────────────
export function renderObjectives(el, { objectives, piInfo, teams, teamObjects, isCurrentPi, piNum, featureList = [], tickets = [] }) {
    // Délégation posée AVANT le rendu, une seule fois par conteneur : le bouton Enregistrer
    // reste actif même si une erreur survient plus loin dans CE rendu. Avec le seul bind
    // direct en fin de fonction, un échec intermédiaire laissait un bouton visible mais MORT
    // — clic sans requête ni toast, donc « j'enregistre, j'actualise, rien n'a changé ».
    if (!el._piObjWired) {
        el._piObjWired = true;
        el.addEventListener('click', e => {
            if (e.target.closest?.('#pi-obj-save')) el._piObjPersist?.();
        });
    }
    const allTeams   = teams || store.get('teams') || [];
    const allTObjs   = teamObjects || store.get('teamObjects') || [];
    const team       = store.get('team');
    const showAll    = !team || team === 'all';

    // Clé localStorage legacy (objectifs saisis avant la migration vers pi_objectives) —
    // utilisée pour le fallback de lecture ET le nettoyage au save.
    const _lsKey = piNum ? `sb-pi-obj-PI${piNum}` : null;

    // Résolution courant-vs-snapshot déléguée à resolvePiObjectives (source unique partagée
    // avec le Dashboard) — supprime le footgun « doit rester cohérent entre les 2 vues ».
    const isEditable          = isCurrentPi !== false || _objUnlocked;
    const effectiveObjectives = resolvePiObjectives({ piInfo, piNum, isCurrentPi, legacyLsKey: _lsKey });

    const filtered   = showAll
        ? effectiveObjectives
        : effectiveObjectives.filter(o => (o.team || '') === team);

    // Progression rollup par équipe depuis les features (#5)
    const _teamFeatures = t => featureList.filter(f => f.team === t);
    const _teamProgress = t => {
        const fs = _teamFeatures(t);
        if (!fs.length) return null;
        const done = fs.filter(f => (f.rolledStatus || f.status) === 'done').length;
        return { done, total: fs.length, pct: Math.round(done / fs.length * 100) };
    };

    // Jauge globale : objectifs done / total parmi les visibles
    const globalDone  = filtered.filter(o => (o.status || 'todo') === 'done').length;
    const globalTotal = filtered.length;

    const globalPct   = globalTotal ? Math.round(globalDone / globalTotal * 100) : 0;
    const globalCol   = globalPct >= 80 ? 'var(--success)' : globalPct >= 40 ? 'var(--warning)' : 'var(--danger)';

    // ── Commitment baseline (#12) ─────────────────────────────────────────────
    // Features du PI normalisées (forme partagée {id,title,team,points,status}). En vue
    // "toutes équipes" featureList couvre tout le PI ; filtrée sinon.
    const piFeats = (featureList || []).map(f => ({
        id: f.id, title: f.title || '', team: f.team || 'Autre',
        points: f.childPts || f.points || 0, status: f.rolledStatus || f.status,
    }));
    const _baselineRaw = (piInfo?.piBaselines || {})[String(piNum)] || null;
    // Comparaison filtrée par équipe à l'affichage (la baseline est figée au niveau PI).
    const _baseFeats = _baselineRaw
        ? (showAll ? (_baselineRaw.features || []) : (_baselineRaw.features || []).filter(f => f.team === team))
        : null;
    const _commit = _baselineRaw ? computeCommitment({ ...(_baselineRaw), features: _baseFeats }, piFeats) : null;
    // Capture autorisée uniquement sur le PI courant en vue "toutes équipes" (baseline = niveau PI).
    const _canCapture = isCurrentPi !== false && showAll;

    const STATUS_OPT = [
        { v: 'todo',   l: 'À faire',  col: 'var(--status-todo)'   },
        { v: 'inprog', l: 'En cours', col: 'var(--status-inprog)' },
        { v: 'done',   l: 'Terminé',  col: 'var(--status-done)'   },
    ];

    function objRow(o, idx, isNew = false) {
        const st = STATUS_OPT.find(s => s.v === (o.status || 'todo')) || STATUS_OPT[0];
        const prog = o.team ? _teamProgress(o.team) : null;
        const progHtml = prog
            ? `<span class="pi-obj-prog" title="${prog.done}/${prog.total} features terminées pour ${esc(o.team)}">
                <span class="pi-obj-prog-bar"><span style="width:${prog.pct}%;background:${prog.pct >= 80 ? 'var(--success)' : prog.pct >= 40 ? 'var(--warning)' : 'var(--danger)'}"></span></span>
                <span class="pi-obj-prog-val">${prog.pct}%</span>
               </span>`
            : '';

        if (!isEditable) {
            return `
            <div class="pi-obj-row pi-obj-row--ro" data-obj-idx="${idx}">
                <span class="pi-obj-dot" style="background:${st.col}"></span>
                <span class="pi-obj-ro-text">${esc(o.text || '—')}</span>
                ${o.team ? `<span class="chip pi-obj-ro-team">${esc(o.team)}</span>` : ''}
                ${o.bv ? `<span class="pi-obj-ro-bv" title="Business Value">${o.bv} BV</span>` : ''}
                ${o.committed ? `<span class="pi-obj-ro-committed">Commis</span>` : ''}
                <span class="pi-obj-ro-status" style="color:${st.col}">${st.l}</span>
                ${progHtml}
            </div>`;
        }

        const teamOpts = allTeams.map(t =>
            `<option value="${esc(t)}"${t === (o.team || team) ? ' selected' : ''}>${esc(t)}</option>`
        ).join('');
        return `
        <div class="pi-obj-row${isNew ? ' pi-obj-row--new' : ''}" data-obj-idx="${idx}">
            <span class="pi-obj-dot" style="background:${st.col}"></span>
            <input class="input pi-obj-text" placeholder="Objectif…" value="${esc(o.text || '')}">
            <select class="select pi-obj-team" style="min-width:110px">
                <option value="">- Équipe -</option>
                ${teamOpts}
            </select>
            <label class="pi-obj-bv-wrap" title="Business Value (0–10)">
                BV <input class="pi-obj-bv" type="number" min="0" max="10" value="${o.bv ?? ''}">
            </label>
            <label class="pi-obj-committed-wrap" title="Objectif commis (vs stretch)">
                <input type="checkbox" class="pi-obj-committed"${o.committed ? ' checked' : ''}> Commis
            </label>
            <select class="select pi-obj-status" style="min-width:100px">
                ${STATUS_OPT.map(s =>
                    `<option value="${s.v}"${s.v === (o.status || 'todo') ? ' selected' : ''}>${s.l}</option>`
                ).join('')}
            </select>
            ${progHtml}
            <button aria-label="Supprimer" class="btn-icon pi-obj-del" title="Supprimer">
                <svg class="icon icon-sm text-danger"><use href="#i-x"/></svg>
            </button>
        </div>`;
    }

    function listHtml() {
        if (!filtered.length) return `
            <div class="pi-obj-empty">
                <svg class="icon pi-obj-empty-icon"><use href="#i-check"/></svg>
                <p class="pi-obj-empty-title">Aucun objectif${!showAll ? ` pour ${esc(team)}` : ''}</p>
                <p class="pi-obj-empty-hint">Clique sur « + Ajouter un objectif » pour commencer</p>
            </div>`;

        if (!showAll) return filtered.map(o => objRow(o, effectiveObjectives.indexOf(o))).join('');

        // Mode "toutes les équipes" → grouper par équipe
        const byTeam = new Map();
        for (const o of filtered) {
            const key = o.team || '';
            if (!byTeam.has(key)) byTeam.set(key, []);
            byTeam.get(key).push(o);
        }
        // Respecte l'ordre des équipes connues, met les sans-équipe en dernier
        const order = [...allTeams.filter(t => byTeam.has(t)), ...(byTeam.has('') ? [''] : [])];
        return order.map(key => {
            const objs  = byTeam.get(key) || [];
            const tObj  = allTObjs.find(o => o.name === key);
            const color = tObj?.color || 'var(--border)';
            const label = key ? esc(key) : '<em class="text-muted">Sans équipe</em>';
            const teamProg = key ? _teamProgress(key) : null;
            return `
            <div class="pi-obj-group">
                <div class="pi-obj-group-header">
                    <span class="pi-obj-group-dot" style="background:${color}"></span>
                    <span class="pi-obj-group-name">${label}</span>
                    <span class="pi-obj-group-count">${objs.length}</span>
                    ${teamProg ? `<span class="pi-obj-team-prog" title="${teamProg.done}/${teamProg.total} features">
                        <span class="pi-obj-prog-bar pi-obj-prog-bar--sm"><span style="width:${teamProg.pct}%;background:${teamProg.pct >= 80 ? 'var(--success)' : teamProg.pct >= 40 ? 'var(--warning)' : 'var(--danger)'}"></span></span>
                        <span class="pi-obj-prog-val pi-obj-prog-val--sm">${teamProg.pct}% feat.</span>
                    </span>` : ''}
                </div>
                ${objs.map(o => objRow(o, effectiveObjectives.indexOf(o))).join('')}
            </div>`;
        }).join('');
    }

    el.innerHTML = `
        ${isCurrentPi === false && !_objUnlocked ? `<div class="pi-offset-notice">
            <svg class="icon icon-sm" style="color:var(--info)"><use href="#i-alert"/></svg>
            Objectifs du <strong>PI#${piNum}</strong> — lecture seule (les objectifs s'éditent uniquement sur le PI courant).
            <button class="btn btn-xs btn-secondary pi-obj-unlock-btn" title="Déverrouiller l'édition">🔓 Déverrouiller</button>
        </div>` : ''}
        ${isCurrentPi === false && _objUnlocked ? `<div class="pi-offset-notice pi-offset-notice--unlocked">
            <svg class="icon icon-sm" style="color:var(--warning)"><use href="#i-alert"/></svg>
            <strong>PI#${piNum}</strong> déverrouillé — modifications enregistrées localement pour ce PI.
        </div>` : ''}
        ${globalTotal > 0 ? `<div class="pi-obj-gauge">
            <span class="pi-obj-gauge-lbl">Avancement objectifs</span>
            <div class="pi-obj-gauge-bar"><div class="pi-obj-gauge-fill" style="width:${globalPct}%;background:${globalCol}"></div></div>
            <span class="pi-obj-gauge-pct" style="color:${globalCol}">${globalDone}/${globalTotal} · ${globalPct}%</span>
        </div>` : ''}
        ${_commitmentPanelHtml(_commit, _baselineRaw, _canCapture)}
        <div class="pi-card">
            <div class="pi-card-head">
                <span class="pi-card-ico" aria-hidden="true">🎯</span>
                <div class="pi-card-title"><b>Objectifs du PI${piNum ? ` #${piNum}` : ''}</b>
                    <small>${!showAll ? `Équipe ${esc(team)}` : 'Toutes les équipes'}${globalTotal ? ` · ${globalDone}/${globalTotal} atteint${globalDone > 1 ? 's' : ''}` : ''}${isEditable ? '' : ' · lecture seule'}</small></div>
                <div class="pi-card-actions">
                    ${!showAll ? `<span class="chip" style="background:var(--primary-bg);color:var(--primary)">${esc(team)}</span>` : ''}
                    ${isEditable ? `<button class="btn btn-primary btn-sm" id="pi-obj-save">Enregistrer</button>` : ''}
                </div>
            </div>
            <div class="pi-card-body">
                <div id="pi-obj-list">
                    ${listHtml()}
                </div>
                ${isEditable ? `<div class="pi-obj-add-row mt-3">
                    <button class="btn btn-secondary btn-sm" id="pi-obj-add">+ Ajouter un objectif</button>
                </div>` : ''}
            </div>
        </div>
    `;

    // ── Déverrouillage PI passé ───────────────────────────────────────────────
    el.querySelector('.pi-obj-unlock-btn')?.addEventListener('click', () => {
        _objUnlocked = true;
        renderObjectives(el, { objectives, piInfo, teams: allTeams, teamObjects: allTObjs, isCurrentPi, piNum, featureList, tickets });
    });

    // ── Capture de la baseline de commitment (#12) ────────────────────────────
    el.querySelector('#pi-baseline-capture')?.addEventListener('click', async () => {
        const committedPts = piFeats.reduce((s, f) => s + (f.points || 0), 0);
        if (_baselineRaw) {
            const ok = await confirmDanger('Re-figer la baseline ?',
                `La baseline actuelle du PI#${piNum} (${(_baselineRaw.features || []).length} features) sera remplacée par l'état courant (${piFeats.length} features, ${committedPts} SP).`,
                { confirmLabel: 'Re-figer', danger: true });
            if (!ok) return;
        }
        try {
            await api.setPiBaseline(piNum, { features: piFeats, committedPts });
            const pi = { ...(store.get('piInfo') || {}) };
            pi.piBaselines = { ...(pi.piBaselines || {}),
                [String(piNum)]: { capturedAt: new Date().toISOString(), committedPts, features: piFeats } };
            store.set('piInfo', pi);
            toast(`Baseline figée — ${piFeats.length} features, ${committedPts} SP`, 'success');
            renderObjectives(el, { objectives, piInfo: pi, teams: allTeams, teamObjects: allTObjs, isCurrentPi, piNum, featureList, tickets });
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Persistance des objectifs (partagée par « Enregistrer » et la suppression) ──
    // Lit toutes les lignes visibles, fusionne avec les objectifs des autres équipes
    // (non affichés quand un filtre équipe est actif), puis sauvegarde en base.
    async function persist(successMsg) {
        const rows = el.querySelectorAll('.pi-obj-row');
        const editedObjs = Array.from(rows).map(row => ({
            text:      row.querySelector('.pi-obj-text')?.value.trim() || '',
            team:      row.querySelector('.pi-obj-team')?.value || '',
            status:    row.querySelector('.pi-obj-status')?.value || 'todo',
            bv:        parseInt(row.querySelector('.pi-obj-bv')?.value) || 0,
            committed: row.querySelector('.pi-obj-committed')?.checked || false,
        })).filter(o => o.text);
        const msg = successMsg || `${editedObjs.length} ${editedObjs.length > 1 ? 'objectifs' : 'objectif'} ${editedObjs.length > 1 ? 'enregistrés' : 'enregistré'}`;

        if (isCurrentPi) {
            // PI courant → sauvegarde via API.
            const piRaw = store.get('piInfo') || {};
            const currentObjs = piRaw.objectives || [];
            const hiddenObjs  = (team && team !== 'all') ? currentObjs.filter(o => (o.team || '') !== team) : [];
            const newObjs = [...hiddenObjs, ...editedObjs];
            // ⚠ Le backend auto-snapshot sous `pi_objectives[piInfo.number]`, mais la lecture
            // (renderObjectives / Dashboard) utilise `piNum` dérivé du sprint actif. Ces deux
            // valeurs peuvent diverger (ex : piInfo.number=29 mais sprint actif=PI30) → on
            // écrivait sous une clé et on lisait une autre (snapshot périmé) ⇒ objectifs invisibles.
            // On force donc le snapshot sous la MÊME clé que la lecture (piNum).
            const piObjectives = piNum
                ? { ...(piRaw.piObjectives || {}), [String(piNum)]: newObjs }
                : piRaw.piObjectives;
            try {
                const updated = await api.updatePI({ ...piRaw, objectives: newObjs, piObjectives });
                store.set('piInfo', updated);
                toast(msg, 'success');
                renderObjectives(el, { objectives: updated.objectives || [], piInfo: updated, teams: allTeams, teamObjects: allTObjs, isCurrentPi, piNum, featureList });
            } catch (e) { toast(e.message, 'error'); }
        } else {
            // Autre PI → snapshot en base via /api/pi/objectives/{piNum} (partagé, plus de localStorage)
            const snap = (store.get('piInfo')?.piObjectives || {})[String(piNum)] || [];
            const hiddenObjs  = (team && team !== 'all') ? snap.filter(o => (o.team || '') !== team) : [];
            const newObjs = [...hiddenObjs, ...editedObjs];
            try {
                await api.setPiObjectives(piNum, newObjs);
                // Rafraîchit le piObjectives local sans recharger toute la config
                const pi = { ...(store.get('piInfo') || {}) };
                pi.piObjectives = { ...(pi.piObjectives || {}), [String(piNum)]: newObjs };
                store.set('piInfo', pi);
                if (_lsKey) localStorage.removeItem(_lsKey);   // nettoie l'ancien stockage legacy
                toast(msg, 'success');
                renderObjectives(el, { objectives, piInfo: pi, teams: allTeams, teamObjects: allTObjs, isCurrentPi, piNum, featureList });
            } catch (e) { toast(e.message, 'error'); }
        }
    }

    el._piObjPersist = persist;   // cible de la délégation posée en haut de fonction

    // ── Sync dot color on status change ───────────────────────────────────────
    function bindRow(row) {
        row.querySelector('.pi-obj-status')?.addEventListener('change', e => {
            const st = STATUS_OPT.find(s => s.v === e.target.value) || STATUS_OPT[0];
            row.querySelector('.pi-obj-dot').style.background = st.col;
        });
        // Suppression = retrait de la ligne PUIS persistance immédiate (sinon réapparaît au refresh).
        // Une ligne « nouvelle » non encore enregistrée (sans texte) est juste retirée du DOM.
        row.querySelector('.pi-obj-del')?.addEventListener('click', () => {
            const isUnsavedEmpty = row.classList.contains('pi-obj-row--new')
                && !(row.querySelector('.pi-obj-text')?.value.trim());
            row.remove();
            if (!isUnsavedEmpty) persist('Objectif supprimé');
        });
    }
    el.querySelectorAll('.pi-obj-row').forEach(bindRow);

    // ── Ajouter une ligne vide ─────────────────────────────────────────────────
    el.querySelector('#pi-obj-add')?.addEventListener('click', () => {
        const list = el.querySelector('#pi-obj-list');
        const idx  = effectiveObjectives.length + list.querySelectorAll('.pi-obj-row').length;
        const div  = document.createElement('div');
        div.innerHTML = objRow({ text: '', team: team !== 'all' ? team : '', status: 'todo' }, idx, true);
        const row = div.firstElementChild;
        list.appendChild(row);
        bindRow(row);
        row.querySelector('.pi-obj-text')?.focus();
    });

    // ── Enregistrer ───────────────────────────────────────────────────────────
    // Câblé par délégation en haut de fonction (el._piObjPersist) — surtout ne PAS rebinder
    // ici, chaque re-render ajouterait un listener et enregistrerait N fois.
}
