/**
 * Atlas — 📋 campagne d'évaluation (3.265.0) : allumer l'Atlas une équipe à la fois.
 *
 * Trois temps dans la même fenêtre :
 *   1. ⭐ compétences requises de l'équipe — ce qui doit être couvert (déjà posées → on peut passer) ;
 *   2. une personne à la fois : requises d'abord, autres repliées. Changer de personne ENREGISTRE les
 *      lignes modifiées (saveEvaluations) ; « Passer » n'écrit rien ;
 *   3. bilan : personnes évaluées, requises encore sans sachant, accès à la carte et à la matrice.
 * La progression n'est pas stockée : elle se relit dans les évaluations (au moins une ligne = évaluée).
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast } from '../utils.js';
import * as M from './atlas-model.js';
import { avatarHtml, barHtml, dotHtml, openAtlasModal } from './atlas-ui.js';
import { evalRowHtml, handleEvalClick, evalChanges, saveEvaluations } from './atlas-member.js';

const isEvaluated = (ctx, name) => ctx.skills.some(s => M.levelOf(ctx, name, s.id) > 0 || M.wantOf(ctx, name, s.id) !== 'neutre');

/** Ouvre la campagne sur `team` (sinon la 1ʳᵉ équipe visible qui a des personnes non évaluées). */
export function openCampaign(team, act = {}) {
    const ctx0 = M.atlasCtx();
    if (!ctx0.skills.length) { toast('Le catalogue est vide : créez les compétences d\'abord', 'info'); act.goto?.('catalog'); return; }
    const teams = ctx0.teams.filter(t => M.membersOf(ctx0, t).length);
    if (!teams.length) { toast('Aucune personne dans les équipes visibles', 'info'); return; }
    const first = teams.find(t => M.membersOf(ctx0, t).some(p => !isEvaluated(ctx0, p.name))) || teams[0];
    const cp = { team: teams.includes(team) ? team : first, step: 'req', i: 0, state: null, initial: null, req: null };

    const { el, close } = openAtlasModal({ id: 'atlas-campaign-overlay', title: '📋 Campagne d\'évaluation', body: '', foot: '<span></span>', wide: true });
    const bodyEl = el.querySelector('.atl-modal__body'), footEl = el.querySelector('.atl-modal__foot');

    // Personne courante : état éditable + copie pour ne renvoyer que les lignes modifiées
    const loadPerson = ctx => {
        const p = M.membersOf(ctx, cp.team)[cp.i];
        cp.state = Object.fromEntries(ctx.skills.map(s => [s.id, { level: M.levelOf(ctx, p.name, s.id), appetence: M.wantOf(ctx, p.name, s.id) }]));
        cp.initial = JSON.parse(JSON.stringify(cp.state));
    };
    const startTeam = t => {
        const ctx = M.atlasCtx();
        cp.team = t;
        cp.req = new Set(M.requiredOf(ctx, t));
        cp.step = 'req';
        cp.i = Math.max(0, M.membersOf(ctx, t).findIndex(p => !isEvaluated(ctx, p.name)));
    };

    const paint = () => {
        const ctx = M.atlasCtx();
        const people = M.membersOf(ctx, cp.team);
        const done = people.filter(p => isEvaluated(ctx, p.name)).length;
        const head = `<div class="atl-cp-head"><label class="atl-field"><span>Équipe</span><select class="input input-sm" data-cp-team>${teams.map(t => `<option value="${esc(t)}"${t === cp.team ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
            + `<div class="atl-cp-prog"><small>${done} / ${people.length} personne${people.length > 1 ? 's' : ''} évaluée${done > 1 ? 's' : ''}</small>${barHtml(people.length ? done / people.length * 100 : 0, done === people.length ? 'ok' : '')}</div></div>`
            + `<ol class="atl-cp-steps">${[['req', '⭐ Requises'], ['member', '✏️ Personnes'], ['done', '✅ Bilan']].map(([k, l]) => `<li class="${k === cp.step ? 'is-cur' : ''}">${l}</li>`).join('')}</ol>`;
        if (cp.step === 'req') {
            bodyEl.innerHTML = head + `<p class="atl-muted">Quelles compétences l'équipe <b>${esc(cp.team)}</b> doit-elle couvrir ? Elles passent en tête de l'évaluation et alimentent la couverture et le bus factor.</p>`
                + `<div class="atl-chips atl-cp-reqs">${ctx.skills.map(s => `<button type="button" class="atl-chip${cp.req.has(s.id) ? ' atl-chip--on' : ''}" aria-pressed="${cp.req.has(s.id)}" data-cp-req="${esc(s.id)}">${dotHtml(s.color)} ${esc(s.name)}</button>`).join('')}</div>`;
            footEl.innerHTML = `<small class="atl-muted">${cp.req.size} requise${cp.req.size > 1 ? 's' : ''}</small><span class="spacer"></span><button type="button" class="btn btn-primary btn-sm" data-cp-next-req>Évaluer les personnes →</button>`;
        } else if (cp.step === 'member') {
            const p = people[cp.i];
            const req = M.requiredOf(ctx, cp.team);
            const reqSkills = ctx.skills.filter(s => req.has(s.id)), other = ctx.skills.filter(s => !req.has(s.id));
            const rows = list => list.map(s => evalRowHtml(s, cp.state[s.id], { required: req.has(s.id) })).join('');
            bodyEl.innerHTML = head
                + `<div class="atl-cp-people" role="list">${people.map((x, i) => `<button type="button" role="listitem" class="atl-cp-pchip${i === cp.i ? ' is-cur' : ''}${isEvaluated(ctx, x.name) ? ' is-done' : ''}" data-cp-go="${i}" title="${esc(x.name)}">${avatarHtml(x.name, { size: 'xs', color: ctx.teamColor(x.team) })}${esc(M.firstName(x.name))}</button>`).join('')}</div>`
                + `<div class="atl-cp-who">${avatarHtml(p.name, { color: ctx.teamColor(p.team), away: !!M.absentSoon(ctx, p.name) })}<b>${esc(p.name)}</b>${p.role ? `<span class="atl-chip">${esc(p.role)}</span>` : ''}<span class="spacer"></span><small class="atl-muted">${cp.i + 1} / ${people.length}</small></div>`
                + (reqSkills.length ? rows(reqSkills) + (other.length ? `<details class="atl-cp-more"><summary>Autres compétences (${other.length})</summary>${rows(other)}</details>` : '') : rows(other))
                + '<p class="atl-muted atl-cp-hint">Niveau 0 à 4 et envie (clic sur l\'icône). Passer à une autre personne enregistre les lignes modifiées.</p>';
            const last = cp.i >= people.length - 1;
            footEl.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-cp-prev>‹ ${cp.i ? 'Précédent' : 'Requises'}</button><span class="spacer"></span>`
                + `<button type="button" class="btn btn-secondary btn-sm" data-cp-skip>Passer</button><button type="button" class="btn btn-primary btn-sm" data-cp-save>${last ? 'Enregistrer et terminer' : 'Enregistrer et suivant →'}</button>`;
        } else {
            const cov = M.coverage(ctx, cp.team);
            const missing = cov.missing.map(id => ctx.skills.find(s => s.id === id)).filter(Boolean);
            const next = teams.find(t => t !== cp.team && M.membersOf(ctx, t).some(x => !isEvaluated(ctx, x.name)));
            bodyEl.innerHTML = head + `<div class="atl-cp-done"><p><b>${done} / ${people.length}</b> personne${people.length > 1 ? 's' : ''} évaluée${done > 1 ? 's' : ''} dans ${esc(cp.team)}.</p>`
                + (cov.total ? `<p>Couverture des requises : <b>${cov.ok} / ${cov.total}</b> avec au moins un sachant (niveau ≥ ${M.EXPERT_MIN}).</p>`
                    + (missing.length ? `<div class="atl-chips">${missing.map(s => `<span class="atl-chip atl-chip--danger">🚌 ${esc(s.name)}</span>`).join('')}</div>` : '<div class="atl-chips"><span class="atl-chip atl-chip--ok">✅ Toutes les requises ont un sachant</span></div>')
                    : '<p class="atl-muted">Aucune compétence requise posée : la couverture ne peut pas être calculée.</p>')
                + '</div>';
            footEl.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-cp-back>‹ Personnes</button><span class="spacer"></span>`
                + (next ? `<button type="button" class="btn btn-secondary btn-sm" data-cp-team-next="${esc(next)}">Équipe suivante : ${esc(next)} →</button>` : '')
                + '<button type="button" class="btn btn-secondary btn-sm" data-cp-goto="matrix">🎯 Matrice</button><button type="button" class="btn btn-primary btn-sm" data-cp-goto="map">🗺️ Voir la carte</button>';
        }
    };

    // Enregistre la personne courante si elle a changé ; false = échec (on reste sur place)
    const flush = async () => {
        if (cp.step !== 'member') return true;
        const changes = evalChanges(cp.state, cp.initial);
        if (!changes.length) return true;
        const p = M.membersOf(M.atlasCtx(), cp.team)[cp.i];
        const ok = await saveEvaluations(p, changes, { quiet: true });
        if (ok) toast(`${M.firstName(p.name)} : ${changes.length} ligne${changes.length > 1 ? 's' : ''} enregistrée${changes.length > 1 ? 's' : ''}`, 'success');
        return ok;
    };
    const goPerson = async (i, save = true) => {
        if (save && !(await flush())) return;
        const n = M.membersOf(M.atlasCtx(), cp.team).length;
        if (i >= n) { cp.step = 'done'; act.onSaved?.(); }
        else { cp.step = 'member'; cp.i = Math.max(0, i); loadPerson(M.atlasCtx()); }
        paint();
    };

    // Requises : seules les bascules sont envoyées ; le store suit (optimiste), restauré si l'appel échoue
    const saveReqs = async () => {
        const list = store.get('teamSkillRequirements') || [];
        const cur = new Set(list.filter(r => r.team === cp.team).map(r => r.skillId));
        const diff = [...new Set([...cur, ...cp.req])].filter(id => cur.has(id) !== cp.req.has(id));
        if (!diff.length) return true;
        store.set('teamSkillRequirements', [...list.filter(r => r.team !== cp.team), ...[...cp.req].map(skillId => ({ team: cp.team, skillId }))]);
        try {
            for (const id of diff) await api.setTeamSkillRequirement(cp.team, id, cp.req.has(id));
            return true;
        } catch {
            store.set('teamSkillRequirements', list);
            toast('Compétences requises non enregistrées', 'error');
            return false;
        }
    };

    el.addEventListener('change', async e => {
        if (!e.target.matches('[data-cp-team]')) return;
        if (!(await flush())) { e.target.value = cp.team; return; }
        startTeam(e.target.value);
        paint();
    });
    el.addEventListener('click', async e => {
        if (cp.step === 'member' && handleEvalClick(e, bodyEl, cp.state)) return;
        const b = sel => e.target.closest(sel);
        if (b('[data-cp-req]')) {
            const x = b('[data-cp-req]'), id = x.dataset.cpReq;
            cp.req.has(id) ? cp.req.delete(id) : cp.req.add(id);
            x.classList.toggle('atl-chip--on', cp.req.has(id));
            x.setAttribute('aria-pressed', cp.req.has(id));
            footEl.querySelector('small').textContent = `${cp.req.size} requise${cp.req.size > 1 ? 's' : ''}`;
        } else if (b('[data-cp-next-req]')) { if (await saveReqs()) goPerson(cp.i, false); }
        else if (b('[data-cp-go]')) goPerson(Number(b('[data-cp-go]').dataset.cpGo));
        else if (b('[data-cp-save]')) goPerson(cp.i + 1);
        else if (b('[data-cp-skip]')) goPerson(cp.i + 1, false);
        else if (b('[data-cp-prev]')) {
            if (cp.i) goPerson(cp.i - 1);
            else if (await flush()) { cp.req = new Set(M.requiredOf(M.atlasCtx(), cp.team)); cp.step = 'req'; paint(); }
        } else if (b('[data-cp-back]')) goPerson(Math.min(cp.i, M.membersOf(M.atlasCtx(), cp.team).length - 1), false);
        else if (b('[data-cp-team-next]')) { startTeam(b('[data-cp-team-next]').dataset.cpTeamNext); paint(); }
        else if (b('[data-cp-goto]')) { const tab = b('[data-cp-goto]').dataset.cpGoto; close(); act.goto?.(tab, tab === 'map' ? { team: cp.team } : {}); }
    });

    startTeam(cp.team);
    paint();
}
