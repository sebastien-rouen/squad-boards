/**
 * Atlas — vue de pilotage des compétences (refonte 3.263.0 : directions « Constellation » + « Matrice »,
 * galerie static/mockups/atlas/).
 *
 * Coquille : onglets, état de chaque vue, actions partagées, abonnements au store. Chaque onglet vit dans
 * son module, sur le même contrat : `xxxHtml(ctx, st)` rend, `bindXxx(root, ctx, st, rerender, act)` câble.
 *   🗺️ Carte          atlas-map.js       constellation, recherche de sachants, atelier de staffing
 *   🎯 Matrice        atlas-matrix.js    heatmap, compétences requises (⭐), vue Équipes + comparaison
 *   📊 Tableau de bord atlas-board.js    couverture, ciel, bus factor, à accompagner, objectifs
 *   🧭 Mobilité       atlas-mobility.js  trajectoires souhait → bilan
 *   ⚙️ Catalogue      atlas-catalog.js   compétences + envies, ordre, suppression annulable
 * Calculs : atlas-model.js (source unique). Fiche + évaluation : atlas-member.js. Actions : atlas-actions.js.
 * Le conteneur des onglets est RECRÉÉ à chaque rendu : les écouteurs délégués ne s'empilent jamais.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { atlasCtx, hasEvaluations } from './atlas-model.js';
import { mapHtml, bindMap } from './atlas-map.js';
import { matrixHtml, bindMatrix } from './atlas-matrix.js';
import { boardHtml, bindBoard } from './atlas-board.js';
import { mobilityHtml, bindMobility, openMobility } from './atlas-mobility.js';
import { catalogHtml, bindCatalog } from './atlas-catalog.js';
import { openMemberCard as _openMemberCard, openEval } from './atlas-member.js';
import { openSkillUp, openSuggest } from './atlas-actions.js';

// API publique inchangée (team.js, tv.js, app.js, atlas_history.js)
export { SKILL_LEVELS, APPETENCE_VALUES } from './atlas-model.js';

const TABS = [
    ['map', '🗺️ Carte'], ['matrix', '🎯 Skills Matrix'], ['board', '📊 Tableau de bord'],
    ['mobility', '🧭 Mobilité'], ['catalog', '⚙️ Catalogue'],
];
const _ls = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };

// État de la vue, gardé d'un rendu à l'autre (session) ; onglet et portée de la matrice mémorisés.
const _validTab = k => TABS.some(([t]) => t === k);
const st = {
    tab: _validTab(_ls('sb-atlas-tab', 'map')) ? _ls('sb-atlas-tab', 'map') : 'map',
    // Carte
    skill: null, mode: 'org', team: null, zoom: null, simOn: false, sim: null,
    // Matrice
    scope: _ls('sb-atlas-scope', 'member') === 'team' ? 'team' : 'member', query: '', reqOnly: false, hideEmpty: false, colSkill: null, cmpA: null, cmpB: null, focus: null,
    // Tableau de bord
    objOffset: 0, objUnlocked: false, objEditing: null,
};

let _container = null;
const rerender = () => { if (_container?.isConnected) _render(_container); };

/** Actions partagées par les onglets et les modales. */
const act = {
    openMember: name => _openMemberCard(name, act),
    openEval: (name, skillId) => openEval(name, skillId, act),
    openSuggest, openSkillUp,
    openMobility: name => openMobility(name, rerender),
    onSaved: rerender,
    goto(tab, opts = {}) {
        st.tab = tab;
        try { localStorage.setItem('sb-atlas-tab', tab); } catch { /* stockage indisponible */ }
        store.set('atlasTab', tab);   // → hash #atlas/<équipe>/<onglet> (lien partageable, palette Ctrl+K)
        if (opts.team) st.team = opts.team;
        if (opts.focus) { st.focus = opts.focus; st.scope = 'member'; st.query = opts.focus; }
        rerender();
    },
};

/** Fiche d'une personne, ouvrable depuis n'importe quelle vue (team.js, TV, marqueur `~membre=`). */
export const openMemberCard = name => _openMemberCard(name, act);

const VIEWS = {
    map: [mapHtml, bindMap],
    matrix: [matrixHtml, bindMatrix],
    board: [boardHtml, bindBoard],
    mobility: [mobilityHtml, (root, ctx) => bindMobility(root, ctx, rerender)],
    catalog: [catalogHtml, root => bindCatalog(root)],
};

function _render(container) {
    const ctx = atlasCtx();
    const [html, bind] = VIEWS[st.tab];
    const nudge = ctx.skills.length && !hasEvaluations(ctx) && st.tab !== 'catalog' && st.tab !== 'matrix'
        ? '<div class="atl-nudge">🧬 Aucune compétence évaluée : la carte et le tableau de bord s\'allumeront avec les premières évaluations. <button type="button" class="btn btn-primary btn-xs" data-nudge>🎯 Évaluer dans la matrice</button></div>'
        : !ctx.skills.length && st.tab !== 'catalog'
            ? '<div class="atl-nudge">⚙️ Le catalogue de compétences est vide. <button type="button" class="btn btn-primary btn-xs" data-nudge-cat>Créer le catalogue</button></div>' : '';
    const body = document.createElement('div');
    body.className = `atl-body atl-body--${st.tab}`;
    body.innerHTML = nudge + html(ctx, st);
    const old = container.querySelector('.atl-body');
    if (old) old.replaceWith(body); else container.querySelector('.atlas')?.appendChild(body);
    container.querySelectorAll('[data-atl-tab]').forEach(b => { const on = b.dataset.atlTab === st.tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    body.querySelector('[data-nudge]')?.addEventListener('click', () => act.goto('matrix'));
    body.querySelector('[data-nudge-cat]')?.addEventListener('click', () => act.goto('catalog'));
    bind(body, ctx, st, rerender, act);
}

/**
 * Migration unique (3.263.0) : les compétences requises étaient en localStorage `sb-team-req-<équipe>`,
 * propres à chaque navigateur. On pousse celles qui manquent en base, puis on retire les clés locales.
 */
async function _migrateLocalRequirements() {
    let keys = [];
    try { keys = Object.keys(localStorage).filter(k => k.startsWith('sb-team-req-')); } catch { return; }
    if (!keys.length) return;
    const known = new Set((store.get('skills') || []).map(s => s.id));
    const have = new Set((store.get('teamSkillRequirements') || []).map(r => `${r.team}|${r.skillId}`));
    const added = [];
    for (const k of keys) {
        const team = k.slice('sb-team-req-'.length);
        let ids = [];
        try { ids = JSON.parse(localStorage.getItem(k) || '[]'); } catch { /* clé illisible : ignorée */ }
        for (const id of ids) {
            if (!known.has(id) || have.has(`${team}|${id}`)) continue;
            try { await api.setTeamSkillRequirement(team, id, true); added.push({ team, skillId: id }); } catch { return; }
        }
        localStorage.removeItem(k);
    }
    if (added.length) store.set('teamSkillRequirements', [...(store.get('teamSkillRequirements') || []), ...added]);
}

export function renderAtlas(container) {
    _container = container;
    // Onglet demandé par le hash (#atlas/<équipe>/<onglet>, palette Ctrl+K) > dernier onglet ouvert
    const fromHash = store.get('atlasTab');
    if (_validTab(fromHash)) st.tab = fromHash;
    container.innerHTML = `<div class="atlas atl">
        <nav class="atl-tabs" role="tablist" aria-label="Sections de l'Atlas">${TABS.map(([k, l]) => `<button type="button" class="atl-tab" role="tab" data-atl-tab="${k}">${l}</button>`).join('')}</nav>
        <div class="atl-body"></div></div>`;
    container.querySelector('.atl-tabs').addEventListener('click', e => {
        const b = e.target.closest('[data-atl-tab]');
        if (b) act.goto(b.dataset.atlTab);
    });
    _render(container);
    if (!container._atlasSubs) {
        container._atlasSubs = ['team', 'group', 'skills', 'appetences', 'memberSkills', 'memberAppetences', 'mobility', 'teamSkillRequirements', 'absences']
            .map(k => store.on(k, () => { if (container.isConnected && _container === container) rerender(); }));
        // Onglet changé par le hash (lien, palette, retour arrière) alors que l'Atlas est déjà affiché
        container._atlasSubs.push(store.on('atlasTab', t => {
            if (!_validTab(t) || t === st.tab || _container !== container || !container.isConnected) return;
            st.tab = t;
            rerender();
        }));
    }
    if ((store.get('skills') || []).length) _migrateLocalRequirements();
}
