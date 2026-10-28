/**
 * Atlas — 📊 Tableau de bord (3.263.0) : couverture par équipe (anneaux), ciel des compétences (un point
 * par personne, couleur = niveau), signaux, bus factor (sachants + relève), personnes à accompagner,
 * objectifs d'équipe par PI. Tous les chiffres viennent d'atlas-model.js (mêmes règles que la carte).
 *
 * Objectifs d'équipe : localStorage `sb-team-objectives-<équipe|all>[-PI<n>]` — MÊME clé que l'Atlas
 * d'avant la refonte, pour garder ce qui a déjà été saisi. Une ligne « [x] texte » = objectif atteint.
 */

import { store } from '../state.js';
import { esc, getCurrentPi, emptyStateHtml } from '../utils.js';
import * as M from './atlas-model.js';
import { avatarHtml, dotHtml } from './atlas-ui.js';
import { signalHtml } from './atlas-map.js';
import { projectStorage } from '../project-settings.js';

const _ring = (ctx, team) => {
    const c = M.coverage(ctx, team);
    const pct = c.pct ?? 0;
    return `<button type="button" class="atl-ring${c.missing.length ? ' is-gap' : ''}${c.pct == null ? ' is-none' : ''}" style="--c:${esc(ctx.teamColor(team))}" data-ring="${esc(team)}">`
        + `<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="atl-ring__bg" cx="32" cy="32" r="27"/><circle class="atl-ring__val" cx="32" cy="32" r="27" stroke-dasharray="${(pct / 100 * 169.6).toFixed(1)} 169.6"/></svg>`
        + `<b>${c.pct == null ? '—' : c.pct + ' %'}</b><span>${esc(team)}</span>`
        + (c.missing.length ? `<small>✗ ${esc(c.missing.map(id => ctx.skills.find(s => s.id === id)?.name).join(', '))}</small>` : c.pct == null ? '<small>aucune requise</small>' : '') + '</button>';
};

const _sky = (ctx, s) => {
    const people = ctx.visiblePeople.filter(p => M.levelOf(ctx, p.name, s.id)).sort((a, b) => M.levelOf(ctx, b.name, s.id) - M.levelOf(ctx, a.name, s.id));
    const n = M.expertsOf(ctx, s.id).length;
    return `<div class="atl-sky"><b>${esc(s.name)}</b><span class="atl-sky__dots">${people.map(p => `<i class="atl-sky__dot m-lvl-${M.levelOf(ctx, p.name, s.id)}" title="${esc(p.name)} · ${M.levelOf(ctx, p.name, s.id)}"></i>`).join('') || '<small class="atl-muted">—</small>'}</span><small class="${n <= 1 ? 'is-bus' : ''}">${n} sachant${n > 1 ? 's' : ''}${n <= 1 ? ' 🚌' : ''}</small></div>`;
};

function _kpis(ctx) {
    const act = M.activeSkills(ctx);
    const covs = ctx.teams.map(t => M.coverage(ctx, t)).filter(c => c.pct != null);
    const cov = covs.length ? Math.round(covs.reduce((a, c) => a + c.pct, 0) / covs.length) : null;
    const bus = act.filter(s => M.expertsOf(ctx, s.id).length <= 1).length;
    const levels = ctx.visiblePeople.flatMap(p => act.map(s => M.levelOf(ctx, p.name, s.id)).filter(Boolean));
    const avg = levels.length ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1).replace('.', ',') : '–';
    const learners = new Set(act.flatMap(s => M.learnersOf(ctx, s.id).map(p => p.name))).size;
    const k = (v, l, mod = '') => `<div class="atl-kpi${mod ? ' atl-kpi--' + mod : ''}"><span class="atl-kpi__v">${v}</span><span class="atl-kpi__l">${l}</span></div>`;
    return `<div class="atl-kpis">${k(cov == null ? '—' : cov + ' %', 'couverture des requises', cov == null ? '' : cov < 70 ? 'danger' : cov < 100 ? 'warn' : 'ok')}${k(bus, 'compétences à 1 sachant ou moins', bus ? 'danger' : 'ok')}${k(avg, 'niveau moyen évalué / 4')}${k(learners, 'personnes en progression ou en envie', learners ? 'info' : '')}</div>`;
}

function _busFactor(ctx) {
    const rows = M.activeSkills(ctx).map(s => ({ s, ex: M.expertsOf(ctx, s.id), le: M.learnersOf(ctx, s.id) })).filter(r => r.ex.length <= 1).sort((a, b) => a.ex.length - b.ex.length);
    if (!rows.length) return '<p class="atl-muted">✅ Chaque compétence évaluée a au moins deux sachants.</p>';
    return rows.map(({ s, ex, le }) => `<div class="atl-bus${ex.length ? '' : ' is-crit'}"><span class="atl-bus__name">${dotHtml(s.color)}${esc(s.name)}</span><span class="atl-bus__who">`
        + (ex.length ? ex.map(p => `<button type="button" class="atl-tag atl-tag--exp" data-member="${esc(p.name)}">🎓 ${esc(p.name)}</button>`).join('') : '<em>aucun sachant</em>')
        + le.map(p => `<button type="button" class="atl-tag atl-tag--learn" data-member="${esc(p.name)}">📈 ${esc(p.name)}</button>`).join('')
        + `</span><button type="button" class="btn btn-xs btn-secondary" data-suggest="${esc(s.id)}">🧭</button></div>`).join('');
}

/** Personnes à accompagner : progressions (niveau 1), envies fortes, compétences requises manquantes à l'équipe. */
function _toCoach(ctx) {
    const list = ctx.visiblePeople.map(p => {
        const missing = M.coverage(ctx, p.team).missing.filter(id => M.levelOf(ctx, p.name, id) < M.EXPERT_MIN && M.wantOf(ctx, p.name, id) === 'forte');
        const prog = ctx.skills.filter(s => M.levelOf(ctx, p.name, s.id) === 1);
        const wants = ctx.skills.filter(s => M.wantOf(ctx, p.name, s.id) === 'forte' && M.levelOf(ctx, p.name, s.id) < M.EXPERT_MIN);
        return { p, missing, prog, wants };
    }).filter(x => x.missing.length || x.prog.length || x.wants.length);
    if (!list.length) return '<p class="atl-muted">Personne en progression ni en envie pour l\'instant — évaluez au niveau 1 ou notez les envies fortes pour démarrer.</p>';
    const tag = (s, cls) => `<span class="atl-tag atl-tag--${cls}">${esc(s.name)}</span>`;
    return `<div class="atl-coach">${list.map(({ p, missing, prog, wants }) => `<button type="button" class="atl-coach__card" data-member="${esc(p.name)}">`
        + `<span class="atl-coach__who">${avatarHtml(p.name, { color: ctx.teamColor(p.team) })}<span><b>${esc(p.name)}</b><small>${esc(p.team)}${p.role ? ' · ' + esc(p.role) : ''}</small></span></span>`
        + (missing.length ? `<span class="atl-coach__line">⛔ Relève possible : ${missing.map(id => tag(ctx.skills.find(s => s.id === id), 'req')).join('')}</span>` : '')
        + (prog.length ? `<span class="atl-coach__line">📈 Niveau 1 → 2 : ${prog.map(s => tag(s, 'learn')).join('')}</span>` : '')
        + (wants.length ? `<span class="atl-coach__line">✨ Envie : ${wants.map(s => tag(s, 'want')).join('')}</span>` : '') + '</button>').join('')}</div>`;
}

/** Objectifs d'équipe (check-list par PI, localStorage). */
function _objectives(st) {
    const team = store.get('team');
    const cur = getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') }) || 0;
    const pi = cur ? cur + (st.objOffset || 0) : 0;
    const key = 'sb-team-objectives-' + (team && team !== 'all' ? team : 'all') + (pi > 0 ? '-PI' + pi : '');
    let raw = '';
    try { raw = projectStorage.getItem(key) || ''; } catch { /* stockage indisponible */ }
    const lines = raw.split('\n').filter(l => l.trim());
    const locked = (st.objOffset || 0) < 0 && !st.objUnlocked;
    return `<div class="atl-panel__head"><h3>🎯 Objectifs ${team && team !== 'all' ? esc(team) : 'du périmètre'}</h3><span class="spacer"></span>`
        + (cur ? `<button type="button" class="btn-icon" data-obj-pi="-1" aria-label="PI précédent">‹</button><span class="atl-chip">PI ${pi}</span><button type="button" class="btn-icon" data-obj-pi="1" aria-label="PI suivant"${(st.objOffset || 0) >= 0 ? ' disabled' : ''}>›</button>` : '')
        + (locked ? '<button type="button" class="btn btn-xs btn-secondary" data-obj-unlock title="Déverrouiller ce PI passé">🔓</button>' : `<button type="button" class="btn btn-xs btn-secondary" data-obj-edit="${esc(key)}">✏️</button>`) + '</div>'
        + (st.objEditing === key
            ? `<textarea class="input atl-obj-ta" rows="6" data-obj-text="${esc(key)}" placeholder="Un objectif par ligne ; « [x] » devant = atteint">${esc(raw)}</textarea><div class="atl-acts"><button type="button" class="btn btn-primary btn-sm" data-obj-save="${esc(key)}">Enregistrer</button></div>`
            : lines.length ? `<ul class="atl-obj">${lines.map((l, i) => { const done = /^\[(x|X)\] /.test(l); return `<li class="${done ? 'is-done' : ''}"><label><input type="checkbox" data-obj-chk="${i}" data-key="${esc(key)}"${done ? ' checked' : ''}${locked ? ' disabled' : ''}> ${esc(l.replace(/^\[[ xX]\] /, ''))}</label></li>`; }).join('')}</ul>`
                : `<p class="atl-muted">Aucun objectif défini${locked ? '' : ' — ✏️ pour en ajouter'}.</p>`);
}

export function boardHtml(ctx, st) {
    if (!M.hasEvaluations(ctx)) return emptyStateHtml({ icon: '🧬', title: 'Construisez votre Skills Matrix', text: 'Aucune compétence évaluée pour l\'instant : le tableau de bord se remplit dès les premières évaluations et compétences requises.', action: { label: '🎯 Ouvrir la matrice', attrs: 'data-goto="matrix"' } });
    const sig = M.signals(ctx);
    return `${_kpis(ctx)}
        <div class="atl-mapgrid">
            <div class="atl-board">
                <section class="atl-card"><h3>🛡️ Couverture des compétences requises</h3><div class="atl-rings">${ctx.teams.map(t => _ring(ctx, t)).join('')}</div></section>
                <section class="atl-card"><h3>✨ Ciel des compétences <small>un point = une personne, couleur = niveau</small></h3>${M.activeSkills(ctx).map(s => _sky(ctx, s)).join('')}</section>
                <section class="atl-card"><h3>🚌 Bus factor <small>sachants ≥ 2 · 📈 relève (niveau 1 ou envie forte)</small></h3>${_busFactor(ctx)}</section>
                <section class="atl-card"><h3>🌱 À accompagner</h3>${_toCoach(ctx)}</section>
            </div>
            <aside class="atl-panel">
                <div class="atl-panel__head"><h3>🚨 Signaux</h3><span class="spacer"></span><span class="atl-chip">${sig.length}</span></div>
                ${sig.length ? sig.map(signalHtml).join('') : '<p class="atl-muted">Aucun signal.</p>'}
                <div class="atl-sep"></div>
                ${_objectives(st)}
            </aside>
        </div>`;
}

export function bindBoard(root, ctx, st, rerender, act) {
    root.addEventListener('click', e => {
        const t = e.target;
        const b = sel => t.closest(sel);
        if (b('[data-goto]')) { act.goto(b('[data-goto]').dataset.goto); return; }
        if (b('[data-ring]')) { act.goto('map', { team: b('[data-ring]').dataset.ring }); return; }
        if (b('[data-member]')) { act.openMember(b('[data-member]').dataset.member); return; }
        if (b('[data-suggest]')) { act.openSuggest(b('[data-suggest]').dataset.suggest, b('[data-suggest]').dataset.team || null); return; }
        if (b('[data-skillup]')) { const s = b('[data-skillup]'); act.openSkillUp(s.dataset.who || null, s.dataset.team || null, s.dataset.skillup); return; }
        if (b('[data-obj-pi]')) { st.objOffset = Math.min(0, (st.objOffset || 0) + Number(b('[data-obj-pi]').dataset.objPi)); st.objUnlocked = false; st.objEditing = null; rerender(); return; }
        if (b('[data-obj-unlock]')) { st.objUnlocked = true; rerender(); return; }
        if (b('[data-obj-edit]')) { st.objEditing = b('[data-obj-edit]').dataset.objEdit; rerender(); return; }
        if (b('[data-obj-save]')) {
            const key = b('[data-obj-save]').dataset.objSave;
            const val = root.querySelector('[data-obj-text]')?.value || '';
            try { val.trim() ? projectStorage.setItem(key, val.trim()) : projectStorage.removeItem(key); } catch { /* stockage indisponible */ }
            st.objEditing = null; rerender();
        }
    });
    root.addEventListener('change', e => {
        const c = e.target.closest('[data-obj-chk]');
        if (!c) return;
        try {
            const lines = (projectStorage.getItem(c.dataset.key) || '').split('\n').filter(l => l.trim());
            const i = Number(c.dataset.objChk);
            const text = lines[i].replace(/^\[[ xX]\] /, '');
            lines[i] = (c.checked ? '[x] ' : '') + text;
            projectStorage.setItem(c.dataset.key, lines.join('\n'));
        } catch { /* stockage indisponible */ }
        rerender();
    });
}
