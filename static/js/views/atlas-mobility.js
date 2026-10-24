/**
 * Atlas — 🧭 Mobilité & trajectoires (3.263.0) : souhait → plan → en cours → bilan, une trajectoire par
 * personne (`PUT /api/mobility`, upsert par nom). Étapes datées et accompagnant (3.262.0) ; les champs RH
 * d'origine (potentiel, risque, plan, transition) restent éditables dans « Détails RH ».
 * L'effet sur l'équipe est CALCULÉ : compétences dont la personne est le dernier sachant de son équipe.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, confirmDanger, arrayToCsv } from '../utils.js';
import * as M from './atlas-model.js';
import { avatarHtml, barHtml, dotHtml, openAtlasModal, emptyHtml } from './atlas-ui.js';

export const STAGES = [['souhait', 'Souhait'], ['plan', 'Plan'], ['en_cours', 'En cours'], ['bilan', 'Bilan']];
const stageIdx = s => Math.max(0, STAGES.findIndex(([k]) => k === s));

/** Compétences dont `name` est le seul sachant de son équipe — ce que l'équipe perdrait. */
function _teamCost(ctx, name) {
    const p = ctx.people.find(x => x.name === name);
    if (!p) return [];
    const others = M.membersOf(ctx, p.team).filter(x => x.name !== name);
    return ctx.skills.filter(s => M.levelOf(ctx, name, s.id) >= M.EXPERT_MIN && !M.expertsOf(ctx, s.id, others).length);
}

const _card = (ctx, m) => {
    const steps = m.steps || [];
    const done = steps.filter(s => s.done).length;
    const p = ctx.people.find(x => x.name === m.memberName);
    return `<button type="button" class="atl-mob" data-open="${esc(m.memberName)}">
        <span class="atl-mob__who">${avatarHtml(m.memberName, { color: ctx.teamColor(p?.team || m.team) })}<span><b>${esc(m.memberName)}</b><small>${esc(p?.role || '')} → <b>${esc(m.targetRole || m.targetTeam || '?')}</b></small></span></span>
        ${barHtml(steps.length ? done / steps.length * 100 : (stageIdx(m.stage) + 1) * 25, m.stage === 'bilan' ? 'ok' : '')}
        <small class="atl-muted">${steps.length ? `${done}/${steps.length} étapes` : 'aucune étape'}${m.mentor ? ` · avec ${esc(m.mentor)}` : ''}${p ? '' : ' · ⚠ hors effectif'}</small></button>`;
};

export function mobilityHtml(ctx) {
    const rows = ctx.mobility.filter(m => m.targetRole || m.targetTeam || (m.steps || []).length || m.plan);
    const head = `<div class="atl-tools"><b>${rows.length} trajectoire${rows.length > 1 ? 's' : ''}</b><span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-mob-csv>📥 CSV</button><button type="button" class="btn btn-primary btn-sm" data-mob-new>＋ Nouvelle trajectoire</button></div>`;
    if (!rows.length) return head + emptyHtml('🧭', 'Aucune trajectoire', 'Une envie d\'évoluer (Scrum Master, Tech Lead, expertise…) se suit ici : souhait, plan d\'étapes datées, bilan — avec son effet sur l\'équipe.', '<button type="button" class="btn btn-primary btn-sm" data-mob-new>＋ Nouvelle trajectoire</button>');
    return head + `<div class="atl-kanban">${STAGES.map(([k, l]) => { const list = rows.filter(m => (m.stage || 'souhait') === k); return `<section class="atl-kanban__col"><h4>${l} <span class="atl-chip">${list.length}</span></h4>${list.map(m => _card(ctx, m)).join('') || '<small class="atl-muted">—</small>'}</section>`; }).join('')}</div>`;
}

const _stepRow = (s, i) => `<div class="atl-step${s.done ? ' is-done' : ''}" data-step="${i}"><input type="checkbox" data-step-done${s.done ? ' checked' : ''} aria-label="Étape faite"><input class="input input-sm" data-step-label value="${esc(s.label || '')}" placeholder="Action (animer une rétro, formation…)" aria-label="Action"><input class="input input-sm" type="date" data-step-when value="${esc(s.when || '')}" aria-label="Date"><button type="button" class="btn-icon" data-step-del aria-label="Retirer l'étape">✕</button></div>`;

/** Détail d'une trajectoire (création si la personne n'en a pas). */
export function openMobility(name, onSaved = () => {}) {
    const ctx = M.atlasCtx();
    const cur = ctx.mobility.find(m => m.memberName === name) || { memberName: name, stage: 'souhait', steps: [] };
    const p = ctx.people.find(x => x.name === name) || { name, team: cur.team || '' };
    const st = { stage: cur.stage || 'souhait', steps: (cur.steps || []).map(s => ({ ...s })) };
    const cost = _teamCost(ctx, name);
    const opt = (list, val) => list.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const body = `<div class="atl-fiche__id">${avatarHtml(name, { size: 'lg', color: ctx.teamColor(p.team) })}<div><b class="atl-fiche__name">${esc(name)}</b><small class="atl-muted">${esc(p.team || '')}${p.role ? ' · ' + esc(p.role) : ''}</small></div></div>
        <div class="atl-form2">
            <label class="atl-field"><span>Rôle visé</span><input class="input" data-f="targetRole" value="${esc(cur.targetRole || '')}" placeholder="Scrum Master, Tech Lead, expert…"></label>
            <label class="atl-field"><span>Équipe visée</span><select class="input" data-f="targetTeam"><option value="">— la même —</option>${opt(ctx.allTeams.map(t => [t, t]), cur.targetTeam)}</select></label>
            <label class="atl-field"><span>Accompagné·e par</span><select class="input" data-f="mentor"><option value="">—</option>${opt(ctx.people.filter(x => x.name !== name).map(x => [x.name, `${x.name} (${x.team})`]), cur.mentor)}</select></label>
        </div>
        <div class="atl-field"><span>Étape</span><div class="seg" role="group">${STAGES.map(([k, l]) => `<button type="button" class="seg__item${k === st.stage ? ' seg__item--on' : ''}" data-stage="${k}">${l}</button>`).join('')}</div></div>
        <h4 class="atl-sec">Plan d'actions</h4><div class="atl-steps" data-steps>${st.steps.map(_stepRow).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-step-add>＋ Ajouter une étape</button>
        ${cost.length ? `<div class="atl-callout">⚖️ Si ${esc(name.split(' ')[0])} évolue, ${esc(p.team)} perd son seul sachant : <b>${esc(cost.map(s => s.name).join(', '))}</b>. Prévoir une relève (📈 dans la matrice).</div>` : ''}
        <details class="atl-details"><summary>Détails RH</summary><div class="atl-form2">
            <label class="atl-field"><span>Potentiel</span><select class="input" data-f="potential">${opt([['faible', 'faible'], ['moyen', 'moyen'], ['fort', 'fort']], cur.potential || 'moyen')}</select></label>
            <label class="atl-field"><span>Risque</span><select class="input" data-f="risk">${opt([['aucun', 'aucun'], ['moyen', 'moyen'], ['critique', 'critique']], cur.risk || 'aucun')}</select></label>
            <label class="atl-field"><span>Transition</span><input class="input" data-f="transitionDuration" value="${esc(cur.transitionDuration || '')}" placeholder="ex. 3 mois"></label>
        </div><label class="atl-field"><span>Plan d'accompagnement</span><textarea class="input" rows="3" data-f="plan">${esc(cur.plan || '')}</textarea></label></details>`;
    const foot = `${cur.id ? '<button type="button" class="btn btn-ghost btn-sm atl-danger" data-mob-del>Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-cancel>Annuler</button><button type="button" class="btn btn-primary btn-sm" data-mob-save>Enregistrer</button>`;
    const { el, close } = openAtlasModal({ id: 'atlas-mobility-overlay', title: `🧭 Trajectoire de ${esc(name)}`, body, foot, wide: true });
    const readSteps = () => [...el.querySelectorAll('[data-step]')].map(r => ({ label: r.querySelector('[data-step-label]').value.trim(), when: r.querySelector('[data-step-when]').value, done: r.querySelector('[data-step-done]').checked })).filter(s => s.label);
    el.addEventListener('click', async e => {
        const b = sel => e.target.closest(sel);
        if (b('[data-stage]')) { st.stage = b('[data-stage]').dataset.stage; el.querySelectorAll('[data-stage]').forEach(x => x.classList.toggle('seg__item--on', x.dataset.stage === st.stage)); }
        else if (b('[data-step-add]')) { el.querySelector('[data-steps]').insertAdjacentHTML('beforeend', _stepRow({}, el.querySelectorAll('[data-step]').length)); el.querySelector('[data-step]:last-child [data-step-label]')?.focus(); }
        else if (b('[data-step-del]')) b('[data-step]').remove();
        else if (b('[data-cancel]')) close();
        else if (b('[data-mob-del]')) {
            if (!(await confirmDanger('Supprimer la trajectoire', `Supprimer la trajectoire de ${name} ?`, { confirmLabel: 'Supprimer' }))) return;
            try { await api.deleteMobility(cur.id); store.set('mobility', (store.get('mobility') || []).filter(m => m.id !== cur.id)); close(); onSaved(); }
            catch { toast('Suppression impossible', 'error'); }
        } else if (b('[data-mob-save]')) {
            const data = { memberName: name, team: p.team || '', stage: st.stage, steps: readSteps() };
            el.querySelectorAll('[data-f]').forEach(f => { data[f.dataset.f] = f.value.trim(); });
            try {
                const saved = await api.upsertMobility(data);
                store.set('mobility', [...(store.get('mobility') || []).filter(m => m.memberName !== name), saved]);
                toast('Trajectoire enregistrée', 'success');
                close(); onSaved();
            } catch { toast('Trajectoire non enregistrée', 'error'); }
        }
    });
}

/** Choix de la personne d'une nouvelle trajectoire. */
function _pickPerson(ctx, onSaved) {
    const has = new Set(ctx.mobility.map(m => m.memberName));
    const { el, close } = openAtlasModal({ id: 'atlas-mobpick-overlay', title: '🧭 Nouvelle trajectoire — pour qui ?',
        body: `<input class="input" type="search" placeholder="🔍 Rechercher…" data-q aria-label="Rechercher une personne"><div class="atl-picklist">${ctx.visiblePeople.filter(p => !has.has(p.name)).map(p => `<button type="button" class="atl-row" data-pick="${esc(p.name)}">${avatarHtml(p.name, { color: ctx.teamColor(p.team) })}<span class="atl-row__main"><b>${esc(p.name)}</b><small>${dotHtml(ctx.teamColor(p.team))} ${esc(p.team)}${p.role ? ' · ' + esc(p.role) : ''}</small></span></button>`).join('')}</div>` });
    el.querySelector('[data-q]').addEventListener('input', e => { const q = e.target.value.toLowerCase(); el.querySelectorAll('[data-pick]').forEach(b => { b.hidden = !b.dataset.pick.toLowerCase().includes(q); }); });
    el.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { close(); openMobility(b.dataset.pick, onSaved); } });
}

export function bindMobility(root, ctx, rerender) {
    root.addEventListener('click', e => {
        const b = sel => e.target.closest(sel);
        if (b('[data-open]')) openMobility(b('[data-open]').dataset.open, rerender);
        else if (b('[data-mob-new]')) _pickPerson(ctx, rerender);
        else if (b('[data-mob-csv]')) {
            const cols = ['memberName', 'team', 'targetRole', 'targetTeam', 'stage', 'mentor', 'potential', 'risk', 'transitionDuration', 'plan'];
            const csv = arrayToCsv(ctx.mobility.map(m => ({ ...Object.fromEntries(cols.map(c => [c, m[c] ?? ''])),
                steps: (m.steps || []).map(s => `${s.done ? '✓' : '○'} ${s.label}${s.when ? ' (' + s.when + ')' : ''}`).join(' | ') })));
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
            a.download = `atlas-mobilite-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
        }
    });
}
