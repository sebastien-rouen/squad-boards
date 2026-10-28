/**
 * Atlas — 🧑 fiche d'une personne et ✏️ évaluation (3.263.0).
 *
 * Fiche : radar comparé à la moyenne de son équipe, compétences (niveau + envie), envies du catalogue
 * séparé, trajectoire de mobilité, historique des niveaux (components/atlas_history.js). La couche porte
 * l'id `atlas-membercard-overlay` — la TV le teste pour savoir si une fiche est ouverte.
 *
 * Évaluation : une compétence (case de la matrice) ou toutes (bouton de la fiche). Mise à jour optimiste
 * du store, puis `PUT /api/member-skills` (niveau ET envie ; l'historique est écrit par le serveur) ;
 * le store est restauré si l'appel échoue.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast } from '../utils.js';
import { mountSkillHistory } from '../components/atlas_history.js';
import * as M from './atlas-model.js';
import { avatarHtml, levelHtml, appetenceHtml, dotHtml, radarHtml, openAtlasModal } from './atlas-ui.js';

const STAGE_LABEL = { souhait: 'Souhait', plan: 'Plan', en_cours: 'En cours', bilan: 'Bilan' };

export function openMemberCard(name, act = {}) {
    const ctx = M.atlasCtx();
    const p = ctx.people.find(x => x.name === name) || { name, team: '', role: '' };
    const away = M.absentSoon(ctx, name);
    const rows = ctx.skills.map(s => ({ s, v: M.levelOf(ctx, name, s.id), w: M.wantOf(ctx, name, s.id) }))
        .filter(x => x.v || x.w === 'forte').sort((a, b) => b.v - a.v || (b.w === 'forte') - (a.w === 'forte'));
    const axes = M.activeSkills(ctx).map(s => ({ id: s.id, label: s.name }));
    const wants = ctx.appetences.filter(a => M.catalogWantOf(ctx, name, a.id) === 'forte');
    const mob = ctx.mobility.find(m => m.memberName === name && (m.targetRole || m.targetTeam));
    const body = `<div class="atl-fiche">
        <div class="atl-fiche__side">
            <div class="atl-fiche__id">${avatarHtml(name, { size: 'xl', color: ctx.teamColor(p.team), away: !!away })}<div><b class="atl-fiche__name">${esc(name)}</b>
                <div class="atl-chips">${p.team ? `<span class="atl-chip">${dotHtml(ctx.teamColor(p.team))} ${esc(p.team)}</span>` : ''}${p.role ? `<span class="atl-chip">${esc(p.role)}</span>` : ''}</div>
                ${away ? `<span class="atl-chip atl-chip--warn">🌴 Absent du ${esc(away.startDate)} au ${esc(away.endDate)}</span>` : ''}</div></div>
            ${axes.length >= 3 ? `<div class="atl-panel__radar">${radarHtml(axes, Object.fromEntries(axes.map(a => [a.id, M.levelOf(ctx, name, a.id)])), { compare: p.team ? M.teamLevels(ctx, p.team) : null })}<small class="atl-muted">trait plein : ${esc(M.firstName(name))} · pointillé : moyenne ${esc(p.team || '')}</small></div>` : ''}
            ${wants.length ? `<h4 class="atl-sec">💡 Envies</h4><div class="atl-chips">${wants.map(a => `<span class="atl-chip">${dotHtml(a.color)} ${esc(a.name)}</span>`).join('')}</div>` : ''}
            ${mob ? `<h4 class="atl-sec">🧭 Trajectoire</h4><button type="button" class="atl-row" data-mob="${esc(name)}"><span class="atl-row__main"><b>${esc(mob.targetRole || mob.targetTeam)}</b><small>${esc(STAGE_LABEL[mob.stage] || '')}${mob.mentor ? ' · avec ' + esc(mob.mentor) : ''}</small></span>›</button>` : ''}
        </div>
        <div class="atl-fiche__main">
            <h4 class="atl-sec">Compétences</h4>
            ${rows.length ? rows.map(({ s, v, w }) => `<button type="button" class="atl-row" data-eval-one="${esc(s.id)}"><span class="atl-row__main"><b>${esc(s.name)}</b><small>${esc(s.category || '')}</small></span>${appetenceHtml(w)}${levelHtml(v)}</button>`).join('') : '<p class="atl-muted">Aucune compétence évaluée ni envie exprimée.</p>'}
            <div class="atl-hist" id="atlas-mc-history"><h4 class="atl-sec">📈 Évolution des niveaux</h4><div class="atlas-hist-body"><p class="atl-muted">Chargement…</p></div></div>
        </div></div>`;
    const foot = `<button type="button" class="btn btn-ghost btn-sm" data-goto-matrix>Voir dans la matrice →</button><span class="spacer"></span>`
        + `<button type="button" class="btn btn-secondary btn-sm" data-mob="${esc(name)}">🧭 Mobilité</button><button type="button" class="btn btn-secondary btn-sm" data-skillup-p>🚀 Monter en compétence</button><button type="button" class="btn btn-primary btn-sm" data-eval-all>✏️ Évaluer</button>`;
    const { el, close } = openAtlasModal({ id: 'atlas-membercard-overlay', title: `🧑 ${esc(name)}`, body, foot, wide: true });
    mountSkillHistory(el.querySelector('#atlas-mc-history'), name, { skills: ctx.skills, levelMeta: M.levelMeta });
    el.addEventListener('click', e => {
        const b = sel => e.target.closest(sel);
        if (b('[data-eval-one]')) { close(); openEval(name, b('[data-eval-one]').dataset.evalOne, act); }
        else if (b('[data-eval-all]')) { close(); openEval(name, null, act); }
        else if (b('[data-mob]')) { close(); act.openMobility?.(name); }
        else if (b('[data-skillup-p]')) { close(); act.openSkillUp?.(name, p.team, null); }
        else if (b('[data-goto-matrix]')) { close(); act.goto?.('matrix', { focus: name }); }
    });
}

/** Enregistre un lot de changements { skillId, level, appetence } pour une personne (optimiste). Renvoie true si tout est écrit. */
export async function saveEvaluations(person, changes, { quiet = false } = {}) {
    const before = store.get('memberSkills') || [];
    let next = before;
    for (const c of changes) {
        const old = next.find(r => r.scope === 'member' && r.scopeKey === person.name && r.skillId === c.skillId);
        next = next.filter(r => r !== old);
        if (c.level > 0 || c.appetence !== 'neutre') next = [...next, { ...(old || {}), scope: 'member', scopeKey: person.name, team: person.team, skillId: c.skillId, level: c.level, appetence: c.appetence }];
    }
    store.set('memberSkills', next);
    try {
        for (const c of changes) await api.upsertMemberSkill({ scope: 'member', scopeKey: person.name, team: person.team, skillId: c.skillId, level: c.level, appetence: c.appetence });
        if (!quiet) toast(changes.length > 1 ? `${changes.length} évaluations enregistrées` : 'Évaluation enregistrée', 'success');
        return true;
    } catch {
        store.set('memberSkills', before);
        toast('Évaluation non enregistrée', 'error');
        return false;
    }
}

/** Ligne compacte d'évaluation (niveau 0-4 + envie) — partagée avec la campagne (atlas-campaign.js). */
export const evalRowHtml = (s, cur, { required = false } = {}) => `<div class="atl-evrow"><span class="atl-evrow__name">${dotHtml(s.color)}<b>${esc(s.name)}</b>${required ? ' <span title="Requise pour l\'équipe">⭐</span>' : ''}</span><span class="atl-evrow__lv" role="radiogroup" aria-label="${esc(s.name)}">${M.SKILL_LEVELS.map(l => `<button type="button" role="radio" class="atl-lvbtn atl-lvl--${l.v}${l.v === cur.level ? ' is-on' : ''}" aria-checked="${l.v === cur.level}" data-lvl-set="${l.v}" data-skill="${esc(s.id)}" title="${esc(l.label)}">${l.short}</button>`).join('')}</span><button type="button" class="atl-apbtn" data-app-cycle="${esc(s.id)}" title="Envie : ${cur.appetence}">${appetenceHtml(cur.appetence)}</button></div>`;

/** Met à jour l'affichage d'une compétence après un clic. */
function _paint(el, state, id) {
    el.querySelectorAll(`[data-lvl-set][data-skill="${CSS.escape(id)}"]`).forEach(b => { const on = Number(b.dataset.lvlSet) === state[id].level; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    el.querySelectorAll(`[data-app-set][data-skill="${CSS.escape(id)}"]`).forEach(b => b.classList.toggle('seg__item--on', b.dataset.appSet === state[id].appetence));
    const cyc = el.querySelector(`[data-app-cycle="${CSS.escape(id)}"]`);
    if (cyc) { cyc.innerHTML = appetenceHtml(state[id].appetence); cyc.title = `Envie : ${state[id].appetence}`; }
}

/** Clic dans un formulaire d'évaluation : niveau, envie (segment ou cycle). Renvoie true si traité. */
export function handleEvalClick(e, el, state) {
    const x = e.target.closest('[data-lvl-set], [data-app-set], [data-app-cycle]');
    if (!x || !el.contains(x)) return false;
    if (x.dataset.lvlSet !== undefined) { const id = x.dataset.skill; state[id].level = Number(x.dataset.lvlSet); _paint(el, state, id); }
    else if (x.dataset.appSet !== undefined) { const id = x.dataset.skill; state[id].appetence = x.dataset.appSet; _paint(el, state, id); }
    else { const id = x.dataset.appCycle; const o = ['faible', 'neutre', 'forte']; state[id].appetence = o[(o.indexOf(state[id].appetence) + 1) % 3]; _paint(el, state, id); }
    return true;
}

/** Changements entre deux états { skillId: { level, appetence } }. */
export const evalChanges = (state, was) => Object.entries(state)
    .filter(([id, v]) => v.level !== was[id].level || v.appetence !== was[id].appetence).map(([id, v]) => ({ skillId: id, ...v }));

const _appSeg = (id, cur) => `<div class="seg atl-seg-app" role="group" aria-label="Envie">${M.APPETENCE_VALUES.map(a => `<button type="button" class="seg__item${a.v === cur ? ' seg__item--on' : ''}" data-app-set="${a.v}" data-skill="${esc(id)}">${appetenceHtml(a.v)} ${a.label}</button>`).join('')}</div>`;

/** Évaluation : `skillId` = une compétence (sélecteur détaillé) ; null = toutes (lignes compactes). */
export function openEval(name, skillId, act = {}) {
    const ctx = M.atlasCtx();
    const person = ctx.people.find(x => x.name === name) || { name, team: '' };
    const skills = skillId ? ctx.skills.filter(s => s.id === skillId) : ctx.skills;
    if (!skills.length) { toast('Le catalogue est vide : ajoutez des compétences d\'abord', 'info'); return; }
    const state = Object.fromEntries(skills.map(s => [s.id, { level: M.levelOf(ctx, name, s.id), appetence: M.wantOf(ctx, name, s.id) }]));
    const initial = JSON.stringify(state);
    const one = skills.length === 1 ? skills[0] : null;
    const body = one
        ? `<p class="atl-muted">${avatarHtml(name, { color: ctx.teamColor(person.team) })} <b>${esc(name)}</b> · ${esc(one.name)} — actuel : ${esc(M.levelMeta(state[one.id].level).label)}</p>
           <div class="atl-lvlpick" role="radiogroup" aria-label="Niveau">${M.SKILL_LEVELS.map(l => `<button type="button" role="radio" class="atl-lvlpick__opt${l.v === state[one.id].level ? ' is-on' : ''}" aria-checked="${l.v === state[one.id].level}" data-lvl-set="${l.v}" data-skill="${esc(one.id)}">${levelHtml(l.v)}<span><b>${esc(l.label)}</b><small>${esc(l.desc)}</small></span></button>`).join('')}</div>
           <h4 class="atl-sec">Envie de progresser</h4>${_appSeg(one.id, state[one.id].appetence)}`
        : `<p class="atl-muted">Niveau 0 à 4 et envie pour chaque compétence du catalogue. Seules les lignes modifiées sont enregistrées.</p>
           ${skills.map(s => evalRowHtml(s, state[s.id])).join('')}`;
    const { el, close } = openAtlasModal({
        id: 'atlas-eval-overlay', wide: !one,
        title: `✏️ ${one ? 'Évaluer' : 'Évaluer toutes les compétences de'} ${one ? esc(one.name) : esc(name)}`,
        body, foot: '<button type="button" class="btn btn-ghost btn-sm" data-cancel>Annuler</button><button type="button" class="btn btn-primary btn-sm" data-save>Enregistrer</button>',
    });
    el.addEventListener('click', e => {
        if (handleEvalClick(e, el, state)) return;
        if (e.target.closest('[data-cancel]')) close();
        else if (e.target.closest('[data-save]')) {
            const changes = evalChanges(state, JSON.parse(initial));
            close();
            if (changes.length) saveEvaluations(person, changes).then(() => act.onSaved?.());
        }
    });
}
