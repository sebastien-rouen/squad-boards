/**
 * Mode TV — détail d'une cellule de la Météo du train (équipe × domaine), ouvert au clic.
 *
 * Trois temps, pour comprendre d'un coup d'œil « ce qui ne va pas » :
 *   1. **Où on en est** — Sprint / PI (relatif) : deux barres « réalisé » vs « temps écoulé » et
 *      l'écart en points ; Santé / SLA / Mood (absolu) : une jauge 0–100 avec les seuils ☀️ ⛅ 🌧️.
 *   2. **Ce qui coince** — tickets ouverts par état (bloqués d'abord), anomalies de santé, tickets
 *      hors délai, répartition des votes : chaque clé de ticket ouvre sa popin.
 *   3. **💡 Que faire** — une phrase d'action tirée du domaine et de ses chiffres.
 * Mêmes calculs que la matrice (computeTeamMeteo) : le détail ne contredit jamais la cellule.
 */

import { store } from '../state.js';
import { esc, getCurrentPi, sumBy, getSprintForTeam, belongedToSprint, isInSprint, belongedToPi, extractPiNum, elapsedPct, meteoThresholds,
    METEO_GLYPH, METEO_LABEL, METEO_REL_BAND } from '../utils.js';
import { computeTeamMeteo, meteoContext } from '../components/meteo_matrix.js';
import { slaModel } from '../components/sla_review_card.js';
import { tkAttrs } from './tv-screens.js';

const tk = id => `<code ${tkAttrs(id)}>${esc(id)}</code>`;
const ids = (list, max = 6) => list.slice(0, max).map(t => tk(t.id || t)).join(' ') + (list.length > max ? ` <small>+${list.length - max}</small>` : '');
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const STATES = [
    ['blocked', '🚧', 'Bloqués'], ['inprog', '🔄', 'En cours'], ['review', '👀', 'En revue'], ['test', '🧪', 'En test'], ['todo', '📦', 'Pas commencés'],
];

/** Deux barres : réalisé vs temps écoulé (domaines relatifs). */
function relBars(p, time) {
    const delta = p - time;
    const verdict = delta >= METEO_REL_BAND ? `en avance de ${delta} points sur le temps`
        : delta >= -METEO_REL_BAND ? 'au rythme du temps qui passe'
        : `${-delta} points de retard sur le temps (🌧️ au-delà de ${METEO_REL_BAND}, ⛈️ au-delà de ${2 * METEO_REL_BAND})`;
    return `<div class="tvd-bars">
        <div class="tvd-bar"><span>Réalisé</span><i><b style="width:${Math.min(100, p)}%"></b></i><strong>${p} %</strong></div>
        <div class="tvd-bar is-time"><span>Temps écoulé</span><i><b style="width:${Math.min(100, time)}%"></b></i><strong>${time} %</strong></div>
        <p class="tvd-verdict">${esc(verdict)}</p>
    </div>`;
}

/** Jauge 0–100 avec les seuils (domaines absolus). */
function gauge(score) {
    const th = meteoThresholds();
    return `<div class="tvd-gauge">
        <i><b data-z="storm" style="width:${th.rain}%"></b><b data-z="rain" style="width:${th.cloud - th.rain}%"></b><b data-z="cloud" style="width:${th.sun - th.cloud}%"></b><b data-z="sun" style="width:${100 - th.sun}%"></b>
           <em style="left:${Math.max(0, Math.min(100, score))}%"></em></i>
        <small><span style="left:${th.rain}%">${th.rain}</span><span style="left:${th.cloud}%">${th.cloud}</span><span style="left:${th.sun}%">${th.sun}</span></small>
    </div>`;
}

/** Tickets ouverts par état (bloqués d'abord), avec leurs points. */
function byState(open) {
    const rows = STATES.map(([st, ico, lbl]) => [ico, lbl, open.filter(t => t.status === st)]).filter(([, , l]) => l.length);
    return rows.length ? `<ul class="tvd-list">${rows.map(([ico, lbl, l]) => `<li${lbl === 'Bloqués' ? ' class="is-bad"' : ''}><span aria-hidden="true">${ico}</span><b>${l.length}</b><span>${lbl}${sumBy(l, t => t.points) ? ` · ${sumBy(l, t => t.points)} pts` : ''}</span><span class="tvd-ids">${ids(l)}</span></li>`).join('')}</ul>` : '';
}

function detailSprint(team, ctx, tt) {
    const sprint = getSprintForTeam(team, ctx.sprintInfoAll);
    if (!sprint?.name) return { body: '<p class="tv-muted">Aucun sprint actif dans JIRA.</p>', tip: 'Démarrer le sprint dans JIRA pour que la météo le suive.' };
    const engaged = tt.filter(t => belongedToSprint(t, sprint.name, null));
    const done = engaged.filter(t => t.status === 'done' && isInSprint(t, sprint.name, null));
    const all = sumBy(engaged, t => t.points), dp = sumBy(done, t => t.points);
    const p = all ? Math.round((dp / all) * 100) : null, time = elapsedPct(sprint.startDate, sprint.endDate);
    const open = engaged.filter(t => t.status !== 'done' && isInSprint(t, sprint.name, null));
    const blocked = open.filter(t => t.status === 'blocked');
    const tip = blocked.length ? `Lever les ${plural(blocked.length, 'blocage')} d'abord : c'est ce qui fait le plus reculer le sprint.`
        : p != null && time != null && p < time - METEO_REL_BAND ? `Finir les tickets commencés avant d'en ouvrir d'autres, et revoir avec le PO ce qui sort du sprint (${all - dp} pts restants).`
        : 'Garder le cap : le réalisé suit le temps.';
    return { head: `${esc(sprint.name)} · ${dp}/${all} pts`, body: `${p != null && time != null ? relBars(p, time) : ''}${byState(open)}`, tip };
}

function detailPi(team, ctx, tt) {
    const piNum = ctx.piNum;
    const scope = tt.filter(t => belongedToPi(t, piNum));
    const all = sumBy(scope, t => t.points), dp = sumBy(scope.filter(t => t.status === 'done' && extractPiNum(t.sprintName || '') === piNum), t => t.points);
    const sprints = (ctx.sprintInfoAll?.teamSprints || []).filter(s => s.team === team && extractPiNum(s.name) === piNum);
    if (!sprints.length || !all) return { body: '<p class="tv-muted">Pas de périmètre PI mesurable (aucun point estimé dans ce PI).</p>', tip: 'Estimer les tickets du PI pour suivre sa trajectoire.' };
    const time = elapsedPct(sprints.map(s => s.startDate).filter(Boolean).sort()[0], sprints.map(s => s.endDate).filter(Boolean).sort().at(-1));
    const p = Math.round((dp / all) * 100);
    const left = sprints.filter(s => s.state !== 'closed').length;
    const open = scope.filter(t => t.status !== 'done').sort((a, b) => (b.points || 0) - (a.points || 0));
    return {
        head: `PI ${piNum} · ${dp}/${all} pts · ${plural(left, 'sprint')} restant${left > 1 ? 's' : ''}`,
        body: `${time != null ? relBars(p, time) : ''}<ul class="tvd-list"><li><span aria-hidden="true">🐘</span><b>${open.length}</b><span>tickets ouverts · ${all - dp} pts</span><span class="tvd-ids">${ids(open)}</span></li></ul>`,
        tip: p < (time ?? 0) - METEO_REL_BAND ? `Il reste ${all - dp} pts sur ${plural(left, 'sprint')} : arbitrer les objectifs du PI (committed d'abord) avant le prochain planning.` : 'Trajectoire du PI tenue.',
    };
}

function detailHealth(r) {
    const rows = (r.anomalies || []).filter(a => a.n > 0).sort((a, b) => ({ danger: 0, warning: 1, info: 2 }[a.sev] - { danger: 0, warning: 1, info: 2 }[b.sev]) || b.n - a.n);
    const dom = r.domains.find(d => d.key === 'health');
    return {
        head: `Score ${esc(dom.value)} / 100 · ${esc(dom.sub)}`,
        body: `${dom.value !== '—' ? gauge(+dom.value) : ''}${rows.length ? `<ul class="tvd-list">${rows.map(a => `<li class="is-${esc(a.sev)}"><span aria-hidden="true">${a.icon}</span><b>${a.n}</b><span>${esc(a.label)}${a.leaders.length ? ` · ${esc(a.leaders.slice(0, 2).join(', '))}${a.leaders.length > 2 ? '…' : ''}` : ''}</span><span class="tvd-ids">${ids(a.ids || [], 5)}</span></li>`).join('')}</ul>` : '<p class="tv-muted">Aucune anomalie.</p>'}`,
        tip: rows[0] ? `${rows[0].icon} ${esc(rows[0].intro)}` : 'Rien à corriger.',
    };
}

function detailSla(tt) {
    const m = slaModel(tt);
    if (!m.done.length) return { body: '<p class="tv-muted">Aucun ticket terminé mesurable.</p>', tip: 'La SLA se mesure sur les tickets terminés avec un temps de cycle.' };
    const target = Math.round(m.target * 10) / 10;
    return {
        head: `${m.conform}/${m.done.length} tickets terminés en ≤ ${target} j · P50 ${Math.round(m.p50 * 10) / 10} j · P85 ${Math.round(m.p85 * 10) / 10} j`,
        body: `${gauge(m.pct)}${m.breaches.length ? `<ul class="tvd-list"><li class="is-bad"><span aria-hidden="true">🐢</span><b>${m.breaches.length}</b><span>hors délai</span><span class="tvd-ids">${m.breaches.slice(0, 6).map(t => `${tk(t.id)}<small> ${Math.round(t.cycleTimeDays)} j</small>`).join(' ')}</span></li></ul>` : ''}`,
        tip: m.breaches.length ? `Les tickets les plus longs (${Math.round(m.breaches[0].cycleTimeDays)} j pour ${esc(m.breaches[0].id)}) : découper plus fin, limiter le travail en cours.` : 'Délais tenus.',
    };
}

function detailMood(team, ctx) {
    const sprint = getSprintForTeam(team, ctx.sprintInfoAll);
    const lbl = (String(sprint?.name || '').match(/(\d+\.\d+)/) || [])[1] || '';
    const vals = (ctx.moodVotes || []).filter(v => v.team === team && (!lbl || (v.piSprint && (v.piSprint === lbl || v.piSprint.includes(lbl)))))
        .map(v => parseInt(v.value, 10)).filter(n => n >= 1 && n <= 5);
    if (!vals.length) return { body: '<p class="tv-muted">Aucun vote sur ce sprint.</p>', tip: 'Lancer le vote d\'humeur en rétro (Mood).' };
    const dist = [1, 2, 3, 4, 5].map(n => vals.filter(v => v === n).length), max = Math.max(...dist);
    const avg = vals.reduce((s, n) => s + n, 0) / vals.length;
    return {
        head: `Moyenne ${avg.toFixed(1)} / 5 · ${plural(vals.length, 'vote')}${lbl ? ` · sprint ${esc(lbl)}` : ''}`,
        body: `${gauge(avg * 20)}<div class="tvd-votes">${dist.map((n, i) => `<div><i style="height:${max ? (n / max) * 100 : 0}%"></i><b>${n}</b><span>${['😫', '🙁', '😐', '🙂', '😄'][i]}</span></div>`).join('')}</div>`,
        tip: avg < 3 ? 'Humeur basse : en parler en rétro, chercher ce qui pèse (charge, blocages, interruptions).' : 'Humeur correcte.',
    };
}

/** Panneau de détail (équipe × domaine). */
export function meteoDetailHtml(team, domKey, ctx, teamObjects) {
    const color = (teamObjects || []).find(o => o.name === team)?.color || 'var(--primary)';
    const r = computeTeamMeteo(team, { ...ctx, color });
    const dom = r.domains.find(d => d.key === domKey);
    if (!dom) return '';
    const tt = (ctx.tickets || store.get('tickets') || []).filter(t => t.team === team);
    const d = domKey === 'sprint' ? detailSprint(team, ctx, tt) : domKey === 'pi' ? detailPi(team, ctx, tt)
        : domKey === 'health' ? detailHealth(r) : domKey === 'sla' ? detailSla(tt) : detailMood(team, ctx);
    // Les autres domaines de l'équipe, en pastilles : un clic bascule le panneau sur l'un d'eux.
    const others = r.domains.map(x => `<button type="button" class="tvd-dom meteo-cell--${x.level}${x.key === domKey ? ' is-on' : ''}" data-meteo-team="${esc(team)}" data-meteo-dom="${esc(x.key)}" aria-pressed="${x.key === domKey}">${METEO_GLYPH[x.level]} ${x.icon} ${esc(x.label)}</button>`).join('');
    return `<div class="tvd-panel" data-l="${dom.level}" style="--team-color:${color}" role="dialog" aria-modal="true" aria-label="Météo ${esc(team)} — ${esc(dom.label)}">
        <header class="tvd-hd">
            <span class="team-dot" style="background:${color}"></span><b>${esc(team)}</b>
            <span class="tvd-big"><span aria-hidden="true">${METEO_GLYPH[dom.level]}</span> ${dom.icon} ${esc(dom.label)} · ${esc(METEO_LABEL[dom.level])}</span>
            <button type="button" class="btn-icon tvd-close" data-tvd-close aria-label="Fermer">✕</button>
        </header>
        <div class="tvd-doms">${others}</div>
        <div class="tvd-value"><strong>${esc(dom.value)}</strong><span>${d.head || esc(dom.sub)}</span></div>
        ${d.body}
        <p class="tvd-tip">💡 ${d.tip}</p>
    </div>`;
}

// ── Hors TV (Dashboard, Santé) : le même panneau, dans sa propre couche ─────────

let _open = null;

/** Ouvre le détail d'une cellule hors TV. Sous la popin ticket (z 200), au-dessus de la barre (100). */
export function openMeteoDetail(team, dom) {
    closeMeteoDetail();
    const host = document.createElement('div');
    host.className = 'tv-detail is-standalone';
    const render = (tm, d) => {
        const ctx = meteoContext(getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') }));
        host.innerHTML = meteoDetailHtml(tm, d, ctx, store.get('teamObjects') || []);
        host.querySelector('.tvd-close')?.focus();
    };
    host.addEventListener('click', e => {
        if (e.target === host || e.target.closest('[data-tvd-close]')) { closeMeteoDetail(); return; }
        const d = e.target.closest('[data-meteo-dom]');
        if (d) { render(d.dataset.meteoTeam, d.dataset.meteoDom); return; }
        const t = e.target.closest('[data-ticket]');
        if (t) window.__squadBoard?.openTicketModal?.(t.dataset.ticket);
    });
    // En capture, et seulement si la popin ticket n'est pas ouverte par-dessus (elle garde son Échap).
    const onKey = e => {
        const mo = document.getElementById('modal-overlay');
        if (mo && !mo.classList.contains('hidden')) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMeteoDetail(); }
        else if (e.key === 'Enter' && e.target.dataset?.ticket) { e.preventDefault(); window.__squadBoard?.openTicketModal?.(e.target.dataset.ticket); }
    };
    document.addEventListener('keydown', onKey, true);
    _open = { host, onKey, back: document.activeElement };
    document.body.append(host);
    render(team, dom);
}

export function closeMeteoDetail() {
    if (!_open) return;
    document.removeEventListener('keydown', _open.onKey, true);
    _open.host.remove();
    _open.back?.focus?.();
    _open = null;
}
