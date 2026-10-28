/**
 * Atlas — ⚙️ Catalogue (3.263.0) : compétences par catégorie et catalogue d'envies séparé (Management,
 * Coaching…). Édition en place (nom, catégorie, couleur), ordre par ▲▼ (l'ordre du catalogue est celui
 * des colonnes de la matrice et des axes des radars), suppression ANNULABLE (`toastUndo`) : l'élément
 * disparaît tout de suite, l'appel DELETE — qui emporte les évaluations — ne part qu'à l'expiration.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, toastUndo, emptyStateHtml } from '../utils.js';
import * as M from './atlas-model.js';
import { projectStorage } from '../project-settings.js';

const DEFAULT_CATALOG = [
    ['Frontend', '#3b82f6', ['React / JS', 'CSS / Design System', 'Accessibilité']],
    ['Backend',  '#8b5cf6', ['API REST', 'SQL / Données', 'Sécurité']],
    ['DevOps',   '#06b6d4', ['CI/CD', 'Cloud / Infra', 'Observabilité']],
    ['Agile',    '#22c55e', ['Facilitation', 'Craft / Tests', 'Product']],
];
const KINDS = {
    skill: { key: 'skills', label: 'compétence', create: api.createSkill, update: api.updateSkill, remove: api.deleteSkill, links: 'memberSkills', linkKey: 'skillId' },
    app:   { key: 'appetences', label: 'envie', create: api.createAppetence, update: api.updateAppetence, remove: api.deleteAppetence, links: 'memberAppetences', linkKey: 'appetenceId' },
};

const _item = (kind, it, i, n, uses) => `<div class="atl-cat__row" data-kind="${kind}" data-id="${esc(it.id)}">
    <input type="color" class="atl-cat__color" value="${esc(it.color || '#6366f1')}" data-field="color" aria-label="Couleur de ${esc(it.name)}">
    <input class="input input-sm atl-cat__name" value="${esc(it.name)}" data-field="name" aria-label="Nom">
    <input class="input input-sm atl-cat__catg" value="${esc(it.category || '')}" data-field="category" list="atl-cat-cats" placeholder="Catégorie" aria-label="Catégorie">
    <small class="atl-muted">${uses} éval.</small>
    <button type="button" class="btn-icon" data-move="-1" aria-label="Monter"${i === 0 ? ' disabled' : ''}>▲</button>
    <button type="button" class="btn-icon" data-move="1" aria-label="Descendre"${i === n - 1 ? ' disabled' : ''}>▼</button>
    <button type="button" class="btn-icon atl-cat__del" data-del aria-label="Supprimer ${esc(it.name)}">🗑</button>
</div>`;

function _section(ctx, kind, list, title, hint) {
    const k = KINDS[kind];
    const uses = id => (store.get(k.links) || []).filter(r => r[k.linkKey] === id).length;
    const cats = [...new Set(list.map(it => it.category || 'Autres'))];
    return `<section class="atl-card"><h3>${title} <small>${list.length} · ${hint}</small></h3>`
        + cats.map(c => { const items = list.filter(it => (it.category || 'Autres') === c); return `<h4 class="atl-sec">${esc(c)}</h4>${items.map(it => _item(kind, it, list.indexOf(it), list.length, uses(it.id))).join('')}`; }).join('')
        + `<form class="atl-cat__add" data-add="${kind}"><input class="input input-sm" name="name" placeholder="Nouvelle ${k.label}" required aria-label="Nom"><input class="input input-sm" name="category" list="atl-cat-cats" placeholder="Catégorie" aria-label="Catégorie"><input type="color" name="color" value="${kind === 'skill' ? '#6366f1' : '#f59e0b'}" aria-label="Couleur"><button type="submit" class="btn btn-primary btn-sm">＋ Ajouter</button></form></section>`;
}

/** 🎚️ Référentiel des niveaux (libellés du projet ; l'échelle 0-4 reste fixe). */
function _levelsSection() {
    const custom = !!projectStorage.getItem(M.LEVELS_KEY);
    return `<section class="atl-card atl-lvref"><h3>🎚️ Référentiel des niveaux <small>partagé · échelle 1 à 4 fixe, sachant = niveau ≥ ${M.EXPERT_MIN}</small></h3>
        ${M.SKILL_LEVELS.filter(l => l.v).map(l => `<div class="atl-lvref__row"><span class="atl-lvl atl-lvl--${l.v}">${l.v}</span>
            <input class="input input-sm" data-lvl="${l.v}" data-lvl-field="label" value="${esc(l.label)}" placeholder="${esc(M.DEFAULT_LEVELS[l.v].label)}" maxlength="40" aria-label="Libellé du niveau ${l.v}">
            <input class="input input-sm" data-lvl="${l.v}" data-lvl-field="desc" value="${esc(l.desc)}" placeholder="${esc(M.DEFAULT_LEVELS[l.v].desc)}" maxlength="200" aria-label="Description du niveau ${l.v}"></div>`).join('')}
        ${custom ? '<button type="button" class="btn btn-ghost btn-sm" data-lvl-reset>Rétablir le référentiel par défaut</button>' : ''}</section>`;
}

/** Enregistre les 4 niveaux depuis les champs ; identiques aux défauts → réglage supprimé. */
function _saveLevels(root) {
    const out = {};
    for (const l of M.SKILL_LEVELS.filter(x => x.v)) {
        const d = M.DEFAULT_LEVELS[l.v];
        const label = root.querySelector(`[data-lvl="${l.v}"][data-lvl-field="label"]`)?.value.trim() || '';
        const desc = root.querySelector(`[data-lvl="${l.v}"][data-lvl-field="desc"]`)?.value.trim() || '';
        if ((label && label !== d.label) || (desc && desc !== d.desc)) out[l.v] = { label: label === d.label ? '' : label, desc: desc === d.desc ? '' : desc };
    }
    if (Object.keys(out).length) projectStorage.setItem(M.LEVELS_KEY, JSON.stringify(out)); else projectStorage.removeItem(M.LEVELS_KEY);
    M.applyLevelLabels();
}

export function catalogHtml(ctx) {
    const cats = [...new Set([...ctx.skills, ...ctx.appetences].map(x => x.category).filter(Boolean))];
    const empty = !ctx.skills.length
        ? emptyStateHtml({ icon: '⚙️', title: 'Catalogue vide', text: 'Partez d\'un catalogue type (12 compétences en 4 catégories) ou ajoutez les vôtres ci-dessous.', action: { label: '⚙️ Catalogue par défaut', attrs: 'data-seed' } })
        : '';
    return `${empty}<datalist id="atl-cat-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        <div class="atl-cat">${_section(ctx, 'skill', ctx.skills, '🧭 Compétences', 'ordre = colonnes de la matrice et axes des radars')}${_section(ctx, 'app', ctx.appetences, '💡 Envies (hors compétences)', 'Management, Coaching… — l\'envie PAR compétence se note dans l\'évaluation')}${_levelsSection()}</div>`;
}

async function _seed() {
    try {
        const created = [];
        let sort = 0;
        for (const [category, color, names] of DEFAULT_CATALOG) for (const name of names) created.push(await api.createSkill({ name, category, color, sort: sort++ }));
        store.set('skills', [...(store.get('skills') || []), ...created]);
        toast(`${created.length} compétences ajoutées`, 'success');
    } catch { toast('Erreur lors de la création du catalogue', 'error'); }
}

/** Échange l'ordre de deux éléments voisins (renumérote toute la liste : des `sort` égaux ne s'ordonnent pas). */
async function _move(kind, id, dir) {
    const k = KINDS[kind];
    const ctx = M.atlasCtx();
    const list = kind === 'skill' ? ctx.skills : ctx.appetences;
    const i = list.findIndex(x => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const order = list.slice();
    [order[i], order[j]] = [order[j], order[i]];
    const next = order.map((x, n) => ({ ...x, sort: n }));
    store.set(k.key, next);
    try { await Promise.all(next.filter((x, n) => list.find(o => o.id === x.id).sort !== n).map(x => k.update(x.id, { sort: x.sort }))); }
    catch { toast('Ordre non enregistré', 'error'); }
}

function _delete(kind, id) {
    const k = KINDS[kind];
    const before = store.get(k.key) || [];
    const it = before.find(x => x.id === id);
    if (!it) return;
    store.set(k.key, before.filter(x => x.id !== id));
    toastUndo(`« ${it.name} » retirée du catalogue`, {
        onUndo: () => store.set(k.key, before),
        onCommit: async () => {
            try { await k.remove(id); store.set(k.links, (store.get(k.links) || []).filter(r => r[k.linkKey] !== id)); if (kind === 'skill') store.set('teamSkillRequirements', (store.get('teamSkillRequirements') || []).filter(r => r.skillId !== id)); }
            catch { store.set(k.key, before); toast('Suppression impossible', 'error'); }
        },
    });
}

export function bindCatalog(root) {
    root.addEventListener('click', e => {
        if (e.target.closest('[data-seed]')) { _seed(); return; }
        if (e.target.closest('[data-lvl-reset]')) { projectStorage.removeItem(M.LEVELS_KEY); M.applyLevelLabels(); toast('Référentiel par défaut rétabli', 'success'); return; }
        const row = e.target.closest('.atl-cat__row');
        if (!row) return;
        const mv = e.target.closest('[data-move]');
        if (mv) _move(row.dataset.kind, row.dataset.id, Number(mv.dataset.move));
        else if (e.target.closest('[data-del]')) _delete(row.dataset.kind, row.dataset.id);
    });
    root.addEventListener('change', async e => {
        if (e.target.closest('[data-lvl]')) { _saveLevels(root); return; }   // projectSettings → l'Atlas se re-rend
        const f = e.target.closest('[data-field]');
        const row = e.target.closest('.atl-cat__row');
        if (!f || !row) return;
        const k = KINDS[row.dataset.kind];
        const val = f.value.trim();
        if (f.dataset.field === 'name' && !val) { toast('Le nom est requis', 'warning'); return; }
        try {
            const upd = await k.update(row.dataset.id, { [f.dataset.field]: val });
            store.set(k.key, (store.get(k.key) || []).map(x => x.id === upd.id ? upd : x));
        } catch { toast('Modification non enregistrée', 'error'); }
    });
    root.addEventListener('submit', async e => {
        const form = e.target.closest('[data-add]');
        if (!form) return;
        e.preventDefault();
        const k = KINDS[form.dataset.add];
        const fd = new FormData(form);
        const list = store.get(k.key) || [];
        try {
            const it = await k.create({ name: String(fd.get('name')).trim(), category: String(fd.get('category') || '').trim(), color: fd.get('color'), sort: list.length });
            store.set(k.key, [...list, it]);
            toast(`« ${it.name} » ajoutée`, 'success');
        } catch { toast('Ajout impossible', 'error'); }
    });
}
