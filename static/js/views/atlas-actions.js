/**
 * Atlas — actions (3.263.0) : 🚀 ticket de montée en compétence et 🧭 « Qui affecter ? ».
 *
 * Montée en compétence : ticket prérempli (titre, niveau visé, binôme), étiquettes `skill-up` + slug de la
 * compétence — le binôme proposé est le meilleur sachant NON absent dans les 14 jours.
 * Qui affecter : classement `atlasModel.suggest` (niveau, charge, absence, envie sur LA compétence), puis
 * affectation comme porteur d'un ticket actif de son équipe (`PUT /api/tickets/:id`, leader).
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast } from '../utils.js';
import * as M from './atlas-model.js';
import { avatarHtml, levelHtml, appetenceHtml, openAtlasModal } from './atlas-ui.js';

const slug = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const skillOpts = (ctx, cur) => ctx.skills.map(s => `<option value="${esc(s.id)}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('');

/** Ticket de montée en compétence. `who` / `team` / `skillId` facultatifs (préremplissage). */
export function openSkillUp(who, team, skillId) {
    const ctx = M.atlasCtx();
    if (!ctx.skills.length) { toast('Le catalogue est vide', 'info'); return; }
    const sid = skillId || ctx.skills[0].id;
    const person = ctx.people.find(p => p.name === who);
    const t = person?.team || team || ctx.teams[0] || '';
    const lvl = who ? M.levelOf(ctx, who, sid) : 0;
    const mentor = M.suggest(ctx, sid, { skipAway: true }).find(x => x.level >= M.EXPERT_MIN && x.p.name !== who)?.p;
    const skill = ctx.skills.find(s => s.id === sid);
    const body = `<form class="atl-form" data-form>
        <div class="atl-form2"><label class="atl-field"><span>Compétence</span><select class="input" name="skill" data-skill-sel>${skillOpts(ctx, sid)}</select></label>
        <label class="atl-field"><span>Pour</span><select class="input" name="leader"><option value="">— à désigner —</option>${ctx.people.filter(p => !t || p.team === t).map(p => `<option value="${esc(p.name)}"${p.name === who ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="atl-field"><span>Board (équipe)</span><select class="input" name="team">${ctx.allTeams.map(x => `<option value="${esc(x)}"${x === t ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
        <label class="atl-field"><span>Titre</span><input class="input" name="title" required value="Monter en compétence ${esc(skill.name)}${who ? ' — ' + esc(M.firstName(who)) : ''}"></label>
        <label class="atl-field"><span>Objectif / plan</span><textarea class="input" name="description" rows="4">Passer du niveau ${lvl} à ${Math.min(4, Math.max(2, lvl + 1))} sur « ${esc(skill.name)} ».${mentor ? `\nBinôme proposé : ${esc(mentor.name)} (niveau ${M.levelOf(ctx, mentor.name, sid)}).` : '\nAucun sachant disponible : formation externe à prévoir.'}</textarea></label>
        ${mentor ? `<p class="atl-muted">🤝 Binôme proposé : ${avatarHtml(mentor.name, { size: 'xs', color: ctx.teamColor(mentor.team) })} <b>${esc(mentor.name)}</b> — meilleur sachant non absent dans les 14 jours.</p>` : ''}
    </form>`;
    const { el, close } = openAtlasModal({ id: 'atlas-skillup-overlay', title: '🚀 Ticket de montée en compétence', body,
        foot: '<button type="button" class="btn btn-ghost btn-sm" data-cancel>Annuler</button><button type="button" class="btn btn-primary btn-sm" data-create>Créer le ticket</button>' });
    el.querySelector('[data-skill-sel]').addEventListener('change', e => { close(); openSkillUp(who, team, e.target.value); });
    el.addEventListener('click', async e => {
        if (e.target.closest('[data-cancel]')) { close(); return; }
        if (!e.target.closest('[data-create]')) return;
        const fd = new FormData(el.querySelector('[data-form]'));
        if (!String(fd.get('title')).trim()) { toast('Titre requis', 'warning'); return; }
        try {
            const ticket = await api.createTicket({ title: fd.get('title'), team: fd.get('team'), leader: fd.get('leader') || null, description: fd.get('description'),
                type: 'task', priority: 'medium', labels: ['skill-up', slug(ctx.skills.find(s => s.id === fd.get('skill'))?.name)] });
            store.set('tickets', [...(store.get('tickets') || []), ticket]);
            toast(`Ticket ${ticket.id || ''} créé`, 'success');
            close();
        } catch (err) { toast('Création impossible : ' + (err.message || err), 'error'); }
    });
}

function _results(ctx, sid, team) {
    const list = M.suggest(ctx, sid, { team }).slice(0, 8);
    if (!list.length) return `<p class="atl-muted">Personne n'est évalué ni n'a d'envie forte sur cette compétence${team ? ' dans ' + esc(team) : ''}.</p><button type="button" class="btn btn-secondary btn-sm" data-to-skillup>🚀 Créer une montée en compétence</button>`;
    return list.map((x, i) => `<div class="atl-cand${i === 0 ? ' is-top' : ''}"><span class="atl-cand__rank">${i + 1}</span>${avatarHtml(x.p.name, { color: ctx.teamColor(x.p.team), away: !!x.away })}<span class="atl-row__main"><b>${esc(x.p.name)}</b><small>${esc(x.p.team)} · ${x.load} ticket${x.load > 1 ? 's' : ''} actif${x.load > 1 ? 's' : ''}${x.away ? ' · 🌴 bientôt absent' : ''}</small></span>${appetenceHtml(x.want)}${levelHtml(x.level)}<button type="button" class="btn btn-xs btn-secondary" data-assign="${esc(x.p.name)}" data-team="${esc(x.p.team)}">Affecter…</button></div>`).join('');
}

/** « Qui affecter ? » — `skillId` / `team` facultatifs. */
export function openSuggest(skillId, team) {
    const ctx = M.atlasCtx();
    if (!ctx.skills.length) { toast('Le catalogue est vide', 'info'); return; }
    const st = { sid: skillId || ctx.skills[0].id, team: team || null };
    const body = `<div class="atl-form2"><label class="atl-field"><span>Compétence</span><select class="input" data-sg-skill>${skillOpts(ctx, st.sid)}</select></label>
        <label class="atl-field"><span>Équipe</span><select class="input" data-sg-team><option value="">Tout le train</option>${ctx.allTeams.map(t => `<option value="${esc(t)}"${t === st.team ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
        <p class="atl-muted">Classement : niveau, puis charge, absence dans les 14 jours, envie sur la compétence.</p><div data-sg-res>${_results(ctx, st.sid, st.team)}</div>`;
    const { el, close } = openAtlasModal({ id: 'atlas-suggest-overlay', title: '🧭 Qui affecter ?', body, wide: true });
    const refresh = () => { el.querySelector('[data-sg-res]').innerHTML = _results(ctx, st.sid, st.team); };
    el.querySelector('[data-sg-skill]').addEventListener('change', e => { st.sid = e.target.value; refresh(); });
    el.querySelector('[data-sg-team]').addEventListener('change', e => { st.team = e.target.value || null; refresh(); });
    el.addEventListener('click', e => {
        if (e.target.closest('[data-to-skillup]')) { close(); openSkillUp(null, st.team, st.sid); return; }
        const a = e.target.closest('[data-assign]');
        if (a) _assignList(el, a.dataset.assign, a.dataset.team, close);
    });
}

/** Liste des tickets actifs de l'équipe (sans porteur d'abord) pour affecter la personne. */
function _assignList(el, name, team, closeAll) {
    const tickets = (store.get('tickets') || []).filter(t => t.status !== 'done' && t.team === team)
        .sort((a, b) => (a.leader ? 1 : 0) - (b.leader ? 1 : 0)).slice(0, 60);
    const res = el.querySelector('[data-sg-res]');
    res.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-back>‹ Retour</button><h4 class="atl-sec">Affecter ${esc(name)} comme porteur de…</h4>`
        + `<input class="input input-sm" type="search" placeholder="🔍 Ticket…" data-tq aria-label="Rechercher un ticket"><div class="atl-picklist">`
        + (tickets.map(t => `<button type="button" class="atl-row" data-tk="${esc(t.id)}"><span class="atl-row__main"><b>${esc(t.id)} · ${esc(t.title)}</b><small>${t.leader ? 'porteur : ' + esc(t.leader) : 'sans porteur'}</small></span></button>`).join('') || '<p class="atl-muted">Aucun ticket actif dans cette équipe.</p>') + '</div>';
    res.querySelector('[data-tq]')?.addEventListener('input', e => { const q = e.target.value.toLowerCase(); res.querySelectorAll('[data-tk]').forEach(b => { b.hidden = !b.textContent.toLowerCase().includes(q); }); });
    res.onclick = async e => {
        if (e.target.closest('[data-back]')) { el.querySelector('[data-sg-skill]').dispatchEvent(new Event('change')); res.onclick = null; return; }
        const b = e.target.closest('[data-tk]');
        if (!b) return;
        try {
            await api.updateTicket(b.dataset.tk, { leader: name });
            store.set('tickets', (store.get('tickets') || []).map(t => t.id === b.dataset.tk ? { ...t, leader: name } : t));
            toast(`${name} porte désormais ${b.dataset.tk}`, 'success');
            closeAll();
        } catch { toast('Affectation impossible', 'error'); }
    };
}
