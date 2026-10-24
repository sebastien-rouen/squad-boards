/**
 * Atlas — 🎯 Skills Matrix (heatmap, 3.263.0) : personnes × compétences groupées par équipe. Une case =
 * niveau (couleur + chiffre), point ambre = envie forte, case cerclée = compétence REQUISE par l'équipe
 * de la personne. Le bandeau d'équipe sert de ligne des exigences : ⭐ cliquable, enregistrée en base.
 * Pied de colonne : nombre de sachants, 🚌 quand il n'y en a qu'un. Mobile : une liste PAR COMPÉTENCE.
 *
 * Vue « Équipes » : niveau MOYEN par compétence (lecture seule), trou en rouge, comparaison en panneau.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast } from '../utils.js';
import * as M from './atlas-model.js';
import { avatarHtml, levelHtml, appetenceHtml, dotHtml, radarHtml } from './atlas-ui.js';

/** Colonnes de compétences selon les filtres (requises seulement / masquer les vides). */
function _columns(ctx, st) {
    let cols = ctx.skills;
    if (st.reqOnly) { const req = new Set(ctx.teams.flatMap(t => [...M.requiredOf(ctx, t)])); cols = cols.filter(s => req.has(s.id)); }
    if (st.hideEmpty) { const act = new Set(M.activeSkills(ctx).map(s => s.id)); cols = cols.filter(s => act.has(s.id)); }
    return cols;
}

const _histo = (ctx, id, people) => {
    const n = [1, 2, 3, 4].map(v => people.filter(p => M.levelOf(ctx, p.name, id) === v).length);
    const tot = n.reduce((a, b) => a + b, 0);
    return `<span class="atl-histo">${tot ? n.map((k, i) => k ? `<i class="c-${i + 1}" style="flex:${k}" title="Niveau ${i + 1} : ${k}">${k}</i>` : '').join('') : '<i class="c-0" style="flex:1">aucune évaluation</i>'}</span>`;
};

function _personRows(ctx, st, cols, apps) {
    const q = (st.query || '').toLowerCase();
    return ctx.teams.map(team => {
        const crew = M.membersOf(ctx, team).filter(p => !q || p.name.toLowerCase().includes(q));
        if (!crew.length && q) return '';
        const req = M.requiredOf(ctx, team);
        const cov = M.coverage(ctx, team);
        const band = `<tr class="atl-hm__team" style="--c:${esc(ctx.teamColor(team))}"><th class="atl-hm__who">${dotHtml(ctx.teamColor(team))} ${esc(team)} <small>${crew.length} pers.${cov.pct != null ? ` · ${cov.pct} %` : ''}${cov.missing.length ? ` · ✗ ${esc(cov.missing.map(id => ctx.skills.find(s => s.id === id)?.name).join(', '))}` : ''}</small></th>`
            + cols.map(s => `<td><button type="button" class="atl-req${req.has(s.id) ? ' is-on' : ''}" data-req="${esc(s.id)}" data-team="${esc(team)}" title="${req.has(s.id) ? 'Requise par' : 'Marquer requise pour'} ${esc(team)} : ${esc(s.name)}" aria-pressed="${req.has(s.id)}">⭐</button></td>`).join('')
            + (apps.length ? `<td colspan="${apps.length}"></td>` : '') + '</tr>';
        return band + crew.map(p => {
            const away = M.absentSoon(ctx, p.name);
            return `<tr class="atl-hm__row${st.focus === p.name ? ' is-focus' : ''}"><th class="atl-hm__who"><button type="button" class="atl-hm__name" data-member="${esc(p.name)}">${avatarHtml(p.name, { size: 'xs', color: ctx.teamColor(team), away: !!away })}<span>${esc(p.name)}</span>${away ? '<em title="Absent prochainement">🌴</em>' : ''}</button></th>`
                + cols.map(s => {
                    const v = M.levelOf(ctx, p.name, s.id), w = M.wantOf(ctx, p.name, s.id);
                    return `<td class="atl-hm__c c-${v}${req.has(s.id) ? ' is-req' : ''}${req.has(s.id) && cov.missing.includes(s.id) ? ' is-gap' : ''}" data-eval="${esc(p.name)}" data-skill="${esc(s.id)}" tabindex="0" title="${esc(p.name)} · ${esc(s.name)} : ${esc(M.levelMeta(v).label)}${w === 'forte' ? ' · envie forte' : ''}">${v || ''}${w === 'forte' ? '<i class="atl-hm__ap"></i>' : ''}</td>`;
                }).join('')
                + apps.map(a => { const w = M.catalogWantOf(ctx, p.name, a.id); return `<td class="atl-hm__app" data-app="${esc(a.id)}" data-who="${esc(p.name)}" data-team="${esc(team)}" tabindex="0" title="${esc(a.name)} : envie ${w} — cliquer pour changer">${appetenceHtml(w)}</td>`; }).join('')
                + '</tr>';
        }).join('');
    }).join('');
}

function _teamRows(ctx, cols) {
    return ctx.teams.map(team => {
        const cov = M.coverage(ctx, team), req = M.requiredOf(ctx, team);
        return `<tr class="atl-hm__row"><th class="atl-hm__who"><button type="button" class="atl-hm__name" data-pick-team="${esc(team)}">${dotHtml(ctx.teamColor(team))}<span>${esc(team)}</span></button></th>`
            + cols.map(s => { const a = M.avgLevel(ctx, s.id, M.membersOf(ctx, team)); return `<td class="atl-hm__c c-${Math.round(a)}${req.has(s.id) ? ' is-req' : ''}${cov.missing.includes(s.id) ? ' is-gap' : ''}">${a ? String(a).replace('.', ',') : ''}</td>`; }).join('')
            + `<td class="atl-hm__n${cov.missing.length ? ' is-bus' : ''}">${cov.pct == null ? '—' : cov.pct + ' %'}</td></tr>`;
    }).join('');
}

/** Panneau d'une compétence (en-tête de colonne touché). */
function _skillPanel(ctx, id) {
    const s = ctx.skills.find(x => x.id === id);
    if (!s) return '';
    const ex = M.expertsOf(ctx, id), people = ctx.visiblePeople.filter(p => M.levelOf(ctx, p.name, id) || M.wantOf(ctx, p.name, id) === 'forte')
        .sort((a, b) => M.levelOf(ctx, b.name, id) - M.levelOf(ctx, a.name, id));
    return `<div class="atl-panel__head"><h3>🎯 ${esc(s.name)}</h3><span class="spacer"></span>${ex.length <= 1 ? `<span class="atl-chip atl-chip--danger">🚌 ${ex.length} sachant</span>` : `<span class="atl-chip">${ex.length} sachants</span>`}</div>`
        + `<div class="atl-histo-lg">${_histo(ctx, id, ctx.visiblePeople)}</div>`
        + `<h4 class="atl-sec">Qui sait · qui veut</h4>`
        + (people.length ? people.map(p => `<button type="button" class="atl-row" data-member="${esc(p.name)}">${avatarHtml(p.name, { color: ctx.teamColor(p.team), away: !!M.absentSoon(ctx, p.name) })}<span class="atl-row__main"><b>${esc(p.name)}</b><small>${esc(p.team)}</small></span>${appetenceHtml(M.wantOf(ctx, p.name, id))}${levelHtml(M.levelOf(ctx, p.name, id))}</button>`).join('') : '<p class="atl-muted">Personne n\'est évalué ni n\'a exprimé d\'envie.</p>')
        + `<h4 class="atl-sec">Requise par</h4><div class="atl-chips">${ctx.teams.filter(t => M.requiredOf(ctx, t).has(id)).map(t => `<span class="atl-chip">${dotHtml(ctx.teamColor(t))} ${esc(t)}</span>`).join('') || '<small class="atl-muted">aucune équipe</small>'}</div>`
        + `<div class="atl-acts"><button type="button" class="btn btn-primary btn-sm" data-suggest="${esc(id)}">🧭 Qui affecter ?</button><button type="button" class="btn btn-secondary btn-sm" data-skillup="${esc(id)}">🚀 Monter en compétence</button></div>`;
}

/** Panneau de comparaison (vue Équipes) : radar d'une équipe contre une autre ou le programme. */
function _comparePanel(ctx, st) {
    const a = st.cmpA && ctx.teams.includes(st.cmpA) ? st.cmpA : ctx.teams[0];
    const b = st.cmpB && ctx.teams.includes(st.cmpB) ? st.cmpB : '';
    const axes = M.activeSkills(ctx).map(s => ({ id: s.id, label: s.name }));
    const sel = (key, cur, withAll) => `<select class="input input-sm" data-cmp="${key}">${withAll ? '<option value="">Moyenne du programme</option>' : ''}${ctx.teams.map(t => `<option value="${esc(t)}"${t === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const cmp = b ? M.teamLevels(ctx, b) : Object.fromEntries(ctx.skills.map(s => [s.id, M.avgLevel(ctx, s.id)]));
    return `<div class="atl-panel__head"><h3>⚖️ Comparer</h3></div><div class="atl-cmp">${sel('A', a, false)}<span>vs</span>${sel('B', b, true)}</div>`
        + (axes.length >= 3 ? `<div class="atl-panel__radar">${radarHtml(axes, M.teamLevels(ctx, a), { compare: cmp })}<small class="atl-muted">trait plein : ${esc(a)} · pointillé : ${esc(b || 'programme')}</small></div>` : '<p class="atl-muted">Le radar demande au moins 3 compétences évaluées.</p>');
}

/** Liste mobile : une carte par compétence, triée du plus fragile au plus solide. */
function _mobileList(ctx, cols) {
    return cols.slice().sort((a, b) => M.expertsOf(ctx, a.id).length - M.expertsOf(ctx, b.id).length).map(s => {
        const ex = M.expertsOf(ctx, s.id);
        const people = ctx.visiblePeople.filter(p => M.levelOf(ctx, p.name, s.id)).sort((a, b) => M.levelOf(ctx, b.name, s.id) - M.levelOf(ctx, a.name, s.id));
        return `<details class="atl-skc${ex.length <= 1 ? ' is-bus' : ''}"><summary><b>${esc(s.name)}</b><small>${esc(s.category || '')}</small><span class="spacer"></span><span class="atl-chip${ex.length <= 1 ? ' atl-chip--danger' : ''}">${ex.length <= 1 ? '🚌 ' : ''}${ex.length} sachant${ex.length > 1 ? 's' : ''}</span></summary>${_histo(ctx, s.id, ctx.visiblePeople)}`
            + `<div class="atl-pchips">${people.map(p => `<button type="button" class="atl-pchip" data-eval="${esc(p.name)}" data-skill="${esc(s.id)}">${avatarHtml(p.name, { size: 'xs', color: ctx.teamColor(p.team) })}${esc(p.name.split(' ')[0])}${levelHtml(M.levelOf(ctx, p.name, s.id))}</button>`).join('') || '<small class="atl-muted">aucune évaluation</small>'}</div></details>`;
    }).join('');
}

export function matrixHtml(ctx, st) {
    const cols = _columns(ctx, st);
    const apps = st.scope === 'team' ? [] : ctx.appetences;
    const head = `<thead><tr><th class="atl-hm__who">${st.scope === 'team' ? 'Équipe' : 'Personne'}</th>${cols.map(s => `<th class="atl-hm__sk${s.id === st.colSkill ? ' is-focus' : ''}"><button type="button" data-col="${esc(s.id)}" title="${esc(s.category || '')}">${esc(s.name)}</button></th>`).join('')}`
        + (st.scope === 'team' ? '<th class="atl-hm__sk">Couv.</th>' : apps.map((a, i) => `<th class="atl-hm__sk atl-hm__sk--app${i === 0 ? ' is-first' : ''}" title="Envie (catalogue d'appétences)">💡 ${esc(a.name)}</th>`).join('')) + '</tr></thead>';
    const foot = st.scope === 'team' ? '' : `<tfoot><tr><th class="atl-hm__who">Sachants (≥ 2)</th>${cols.map(s => { const n = M.expertsOf(ctx, s.id).length; return `<td class="atl-hm__n${n <= 1 ? ' is-bus' : n <= 2 ? ' is-thin' : ''}">${n}${n <= 1 ? ' 🚌' : ''}</td>`; }).join('')}${apps.length ? `<td colspan="${apps.length}"></td>` : ''}</tr></tfoot>`;
    const body = st.scope === 'team' ? _teamRows(ctx, cols) : _personRows(ctx, st, cols, apps);
    const panel = st.scope === 'team' ? _comparePanel(ctx, st) : st.colSkill ? _skillPanel(ctx, st.colSkill)
        : `<div class="atl-panel__head"><h3>Lire la matrice</h3></div><p class="atl-muted">Touchez une case pour évaluer, un nom pour la fiche, un en-tête pour le détail d'une compétence. ⭐ dans le bandeau d'une équipe : compétence requise (partagée par tous).</p><div class="atl-legend">${[1, 2, 3, 4].map(v => levelHtml(v, { label: true })).join('')}</div><p class="atl-muted"><i class="atl-hm__ap atl-hm__ap--inline"></i> envie forte · <span class="atl-legend__req"></span> requise par l'équipe · <span class="atl-legend__gapcell"></span> requise sans sachant</p>`;
    return `<div class="atl-tools">
            <div class="seg" role="group" aria-label="Lignes">${[['member', 'Personnes'], ['team', 'Équipes']].map(([k, l]) => `<button type="button" class="seg__item${st.scope === k ? ' seg__item--on' : ''}" data-scope="${k}">${l}</button>`).join('')}</div>
            ${st.scope === 'member' ? `<input class="input input-sm atl-q" type="search" placeholder="🔍 Personne…" value="${esc(st.query || '')}" data-query aria-label="Filtrer les personnes">` : ''}
            <button type="button" class="atl-chip${st.reqOnly ? ' atl-chip--on' : ''}" data-flag="reqOnly" aria-pressed="${!!st.reqOnly}">⭐ Requises seulement</button>
            <button type="button" class="atl-chip${st.hideEmpty ? ' atl-chip--on' : ''}" data-flag="hideEmpty" aria-pressed="${!!st.hideEmpty}">Masquer les vides</button>
            <span class="spacer"></span>
            <button type="button" class="btn btn-sm btn-secondary" data-suggest="">🧭 Qui affecter ?</button>
        </div>
        <div class="atl-mapgrid atl-mapgrid--matrix">
            <div class="atl-hm-wrap">${cols.length ? `<table class="atl-hm${st.scope === 'team' ? ' atl-hm--teams' : ''}">${head}<tbody>${body}</tbody>${foot}</table>` : '<p class="atl-muted atl-pad">Aucune colonne avec ces filtres.</p>'}</div>
            <div class="atl-mlist">${_mobileList(ctx, cols)}</div>
            <aside class="atl-panel">${panel}</aside>
        </div>`;
}

/** Bascule ⭐ requise (optimiste, puis serveur ; annulée si l'appel échoue). */
async function _toggleReq(team, skillId, rerender) {
    const list = store.get('teamSkillRequirements') || [];
    const on = list.some(r => r.team === team && r.skillId === skillId);
    store.set('teamSkillRequirements', on ? list.filter(r => !(r.team === team && r.skillId === skillId)) : [...list, { team, skillId }]);
    rerender();
    try { await api.setTeamSkillRequirement(team, skillId, !on); }
    catch { store.set('teamSkillRequirements', list); rerender(); toast('Compétence requise non enregistrée', 'error'); }
}

/** Envie du catalogue séparé : faible → neutre → forte → faible. */
async function _cycleApp(cell) {
    const order = ['faible', 'neutre', 'forte'];
    const { app, who, team } = cell.dataset;
    const list = store.get('memberAppetences') || [];
    const cur = list.find(r => r.scope === 'member' && r.scopeKey === who && r.appetenceId === app)?.value || 'neutre';
    const value = order[(order.indexOf(cur) + 1) % 3];
    const next = list.filter(r => !(r.scope === 'member' && r.scopeKey === who && r.appetenceId === app));
    if (value !== 'neutre') next.push({ scope: 'member', scopeKey: who, team, appetenceId: app, value });
    store.set('memberAppetences', next);
    try { await api.upsertMemberAppetence({ scope: 'member', scopeKey: who, team, appetenceId: app, value }); }
    catch { store.set('memberAppetences', list); toast('Envie non enregistrée', 'error'); }
}

export function bindMatrix(root, ctx, st, rerender, act) {
    root.querySelector('[data-query]')?.addEventListener('input', e => {
        st.query = e.target.value;
        const pos = e.target.selectionStart;
        rerender();
        const q = document.querySelector('.atl-q');
        if (q) { q.focus(); q.setSelectionRange(pos, pos); }
    });
    root.querySelectorAll('[data-cmp]').forEach(s => s.addEventListener('change', () => { st['cmp' + s.dataset.cmp] = s.value; rerender(); }));
    root.addEventListener('click', e => {
        const t = e.target;
        const b = sel => t.closest(sel);
        if (b('[data-scope]')) { st.scope = b('[data-scope]').dataset.scope; rerender(); return; }
        if (b('[data-flag]')) { const k = b('[data-flag]').dataset.flag; st[k] = !st[k]; rerender(); return; }
        if (b('[data-req]')) { const r = b('[data-req]'); _toggleReq(r.dataset.team, r.dataset.req, rerender); return; }
        if (b('[data-col]')) { const id = b('[data-col]').dataset.col; st.colSkill = st.colSkill === id ? null : id; rerender(); return; }
        if (b('[data-app]')) { _cycleApp(b('[data-app]')); return; }
        if (b('[data-eval]')) { const c = b('[data-eval]'); act.openEval(c.dataset.eval, c.dataset.skill); return; }
        if (b('[data-member]')) { act.openMember(b('[data-member]').dataset.member); return; }
        if (b('[data-pick-team]')) { st.cmpA = b('[data-pick-team]').dataset.pickTeam; rerender(); return; }
        if (b('[data-suggest]')) { act.openSuggest(b('[data-suggest]').dataset.suggest || null, null); return; }
        if (b('[data-skillup]')) act.openSkillUp(null, null, b('[data-skillup]').dataset.skillup);
    });
    root.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const c = e.target.closest('[data-eval], [data-app]');
        if (!c) return;
        e.preventDefault();
        c.click();
    });
}
