/**
 * Atlas — 🌌 Carte (constellation, 3.263.0) : le train au centre, les lignes produit en secteurs, les
 * équipes en astres, les personnes en satellites. Une compétence cherchée colore les satellites par
 * niveau et NOMME les sachants ; une compétence requise sans sachant entoure l'équipe d'un halo rouge.
 *
 * Mode atelier (simulation) : un satellite touché propose « Déplacer vers… », le déplacé reste en
 * fantôme à son ancienne place, l'impact (atlasModel.simImpact) s'affiche dans le panneau. Rien n'est
 * enregistré : la sortie est un résumé copié pour le PI Planning.
 */

import { esc, toast, copyToClipboard } from '../utils.js';
import * as M from './atlas-model.js';
import { avatarHtml, levelHtml, appetenceHtml, dotHtml, radarHtml, emptyHtml } from './atlas-ui.js';

const rad = a => a * Math.PI / 180;
const at = (cx, cy, r, a) => [cx + Math.cos(rad(a)) * r, cy + Math.sin(rad(a)) * r];
const f = n => n.toFixed(1);

/** Lignes produit (groupes) → équipes visibles, + « Hors ligne produit » ; `zoom` = un seul groupe. */
function _lines(ctx, zoom) {
    const seen = new Set();
    const lines = ctx.groups.map(g => {
        const teams = (g.teams || []).filter(t => ctx.teams.includes(t) && !seen.has(t));
        teams.forEach(t => seen.add(t));
        return { id: g.id, name: g.name, color: g.color || '#6366f1', teams };
    }).filter(l => l.teams.length);
    const rest = ctx.teams.filter(t => !seen.has(t));
    if (rest.length) lines.push({ id: '_none', name: 'Hors ligne produit', color: '#64748b', teams: rest });
    return zoom ? lines.filter(l => l.id === zoom) : lines;
}

function _sector(cx, cy, r1, r2, a1, a2) {
    const [x1, y1] = at(cx, cy, r2, a1), [x2, y2] = at(cx, cy, r2, a2), [x3, y3] = at(cx, cy, r1, a2), [x4, y4] = at(cx, cy, r1, a1);
    const big = a2 - a1 > 180 ? 1 : 0;
    return `M${f(x1)},${f(y1)} A${r2},${r2} 0 ${big} 1 ${f(x2)},${f(y2)} L${f(x3)},${f(y3)} A${r1},${r1} 0 ${big} 0 ${f(x4)},${f(y4)}Z`;
}

/** Membres d'une équipe sur la carte, simulation comprise (le déplacé arrive dans sa cible). */
function _crew(ctx, team, sim) {
    const list = M.membersOf(ctx, team).map(p => ({ ...p, ghost: !!(sim && sim.who === p.name) }));
    if (sim && sim.to === team) { const p = ctx.people.find(x => x.name === sim.who); if (p) list.push({ ...p, team, moved: true }); }
    return list;
}

/** SVG de la carte. Géométrie calculée depuis le nombre d'équipes et la taille des équipes. */
export function orbitSvg(ctx, st) {
    const lines = _lines(ctx, st.zoom);
    const teams = lines.flatMap(l => l.teams);
    if (!teams.length) return '';
    const maxCrew = Math.max(1, ...teams.map(t => M.membersOf(ctx, t).length + 1));
    const rT = 30, rM = 52 + Math.max(0, maxCrew - 8) * 2;
    const step = 360 / teams.length;
    const R = Math.max(teams.length === 1 ? 0 : 150, teams.length * (2 * rM + 26) / (2 * Math.PI));
    const half = R + rM + 120, cx = half, cy = half;
    const angle = t => -90 + teams.indexOf(t) * step;
    const skill = st.mode === 'skill' ? st.skill : null;
    let s = `<svg class="atl-orbit" viewBox="0 0 ${half * 2} ${half * 2}" role="img" aria-label="Carte du programme">`;
    if (teams.length > 1) {
        s += `<circle class="atl-orbit__ring" cx="${cx}" cy="${cy}" r="${f(R)}"/>`;
        for (const l of lines) {
            const a1 = angle(l.teams[0]) - step / 2 + 2, a2 = angle(l.teams.at(-1)) + step / 2 - 2;
            s += `<path class="atl-orbit__sector" style="--c:${esc(l.color)}" d="${_sector(cx, cy, Math.max(40, R - rM - 18), R + rM + 18, a1, a2)}"/>`;
            const [lx, ly] = at(cx, cy, R + rM + 46, (a1 + a2) / 2);
            s += `<text class="atl-orbit__line" style="--c:${esc(l.color)}" x="${f(lx)}" y="${f(ly)}" data-zoom="${esc(l.id)}">${esc(l.name)}</text>`;
        }
        s += `<circle class="atl-orbit__core" cx="${cx}" cy="${cy}" r="44"/><text class="atl-orbit__corelbl" x="${cx}" y="${cy + 5}">${st.zoom ? esc(lines[0]?.name || '') : 'Programme'}</text>`;
    }
    for (const team of teams) {
        const a = angle(team);
        const [tx, ty] = teams.length === 1 ? [cx, cy] : at(cx, cy, R, a);
        const crew = _crew(ctx, team, st.sim);
        const cov = M.coverage(ctx, team, crew.filter(p => !p.ghost));
        const color = ctx.teamColor(team);
        if (teams.length > 1) s += `<line class="atl-orbit__link" x1="${cx}" y1="${cy}" x2="${f(tx)}" y2="${f(ty)}"/>`;
        s += `<g class="atl-orbit__team${team === st.team ? ' is-sel' : ''}" style="--c:${esc(color)}" data-team="${esc(team)}">`;
        crew.forEach((p, i) => {
            const spread = Math.min(34, 300 / Math.max(1, crew.length));
            const [mx, my] = at(tx, ty, rM, a + 180 + (i - (crew.length - 1) / 2) * spread);
            const v = skill ? M.levelOf(ctx, p.name, skill) : -1;
            const hit = v >= M.EXPERT_MIN;
            s += `<line class="atl-orbit__tie" x1="${f(tx)}" y1="${f(ty)}" x2="${f(mx)}" y2="${f(my)}"/>`;
            s += `<circle class="atl-orbit__member${v >= 0 ? ' m-lvl-' + v : ''}${hit ? ' is-hit' : ''}${p.ghost ? ' is-ghost' : ''}${p.moved ? ' is-moved' : ''}" cx="${f(mx)}" cy="${f(my)}" r="${hit ? 10 : 7}" data-member="${esc(p.name)}" tabindex="0"><title>${esc(p.name)}${skill ? ` · ${esc(ctx.skills.find(x => x.id === skill)?.name || '')} ${v || '–'}` : ''}</title></circle>`;
            if (hit) s += `<text class="atl-orbit__tag" x="${f(mx)}" y="${f(my - 15)}">${esc(p.name.split(' ')[0])} · ${v}</text>`;
        });
        s += `<circle class="atl-orbit__body" cx="${f(tx)}" cy="${f(ty)}" r="${rT}" tabindex="0"/>`;
        if (cov.missing.length) s += `<circle class="atl-orbit__gap" cx="${f(tx)}" cy="${f(ty)}" r="${rT + 7}"><title>Requis non couvert : ${esc(cov.missing.map(id => ctx.skills.find(x => x.id === id)?.name).join(', '))}</title></circle>`;
        s += `<text class="atl-orbit__teamlbl" x="${f(tx)}" y="${f(ty - 1)}">${esc(team.length > 11 ? team.slice(0, 10) + '…' : team)}</text>`;
        if (cov.pct != null) s += `<text class="atl-orbit__teamsub" x="${f(tx)}" y="${f(ty + 13)}">${cov.pct} %</text>`;
        s += '</g>';
    }
    if (st.sim) {
        const from = ctx.people.find(p => p.name === st.sim.who)?.team;
        if (from && teams.includes(from) && teams.includes(st.sim.to) && teams.length > 1) {
            const [ax, ay] = at(cx, cy, R, angle(from)), [bx, by] = at(cx, cy, R, angle(st.sim.to));
            s += `<path class="atl-orbit__move" d="M${f(ax)},${f(ay)} Q${cx},${cy} ${f(bx)},${f(by)}"/>`;
        }
    }
    return s + '</svg>';
}

/** Panneau d'une équipe : couverture, radar, membres sur la compétence cherchée. */
function _teamPanel(ctx, st, team) {
    const crew = M.membersOf(ctx, team);
    const cov = M.coverage(ctx, team);
    const skill = ctx.skills.find(s => s.id === st.skill);
    const axes = M.activeSkills(ctx).map(s => ({ id: s.id, label: s.name }));
    const req = [...M.requiredOf(ctx, team)].map(id => ctx.skills.find(s => s.id === id)).filter(Boolean);
    return `<div class="atl-panel__head">${dotHtml(ctx.teamColor(team))}<h3>${esc(team)}</h3><span class="spacer"></span>`
        + (cov.pct == null ? '<span class="atl-chip">aucune compétence requise</span>' : `<span class="atl-chip atl-chip--${cov.missing.length ? 'danger' : 'ok'}">${cov.pct} % couvert</span>`) + '</div>'
        + (axes.length >= 3 ? `<div class="atl-panel__radar">${radarHtml(axes, M.teamLevels(ctx, team))}</div>` : '')
        + `<h4 class="atl-sec">⭐ Requises</h4><div class="atl-chips">${req.length ? req.map(s => `<span class="atl-chip${cov.missing.includes(s.id) ? ' atl-chip--danger' : ''}">${cov.missing.includes(s.id) ? '✗ ' : ''}${esc(s.name)}</span>`).join('') : '<small class="atl-muted">Posez-les dans la matrice (⭐ en tête de colonne).</small>'}</div>`
        + `<h4 class="atl-sec">Membres${skill ? ' · ' + esc(skill.name) : ''}</h4>`
        + crew.map(p => `<button type="button" class="atl-row" data-member="${esc(p.name)}">${avatarHtml(p.name, { color: ctx.teamColor(team), away: !!M.absentSoon(ctx, p.name) })}<span class="atl-row__main"><b>${esc(p.name)}</b><small>${esc(p.role || '')}${M.absentSoon(ctx, p.name) ? ' · 🌴 bientôt absent' : ''}</small></span>${skill ? appetenceHtml(M.wantOf(ctx, p.name, skill.id)) + levelHtml(M.levelOf(ctx, p.name, skill.id)) : ''}</button>`).join('');
}

/** Panneau programme (aucune équipe choisie) : signaux du périmètre. */
function _programPanel(ctx) {
    const sig = M.signals(ctx).slice(0, 6);
    return `<div class="atl-panel__head"><h3>🚨 Signaux</h3><span class="spacer"></span><span class="atl-chip">${ctx.teams.length} équipes · ${ctx.visiblePeople.length} personnes</span></div>`
        + (sig.length ? sig.map(signalHtml).join('') : '<p class="atl-muted">Aucun signal : pas de trou de couverture ni de sachant unique dans le périmètre.</p>')
        + '<p class="atl-muted atl-hint">Touchez une équipe pour son détail, un satellite pour la fiche d\'une personne.</p>';
}

/** Carte d'un signal (partagée avec le tableau de bord). */
export const signalHtml = s => `<article class="atl-sig atl-sig--${s.sev}"><span class="atl-sig__icon">${s.icon}</span><div class="atl-sig__main"><b>${esc(s.title)}</b><span>${esc(s.text)}</span>`
    + `<div class="atl-sig__acts">${s.kind === 'trou' || s.kind === 'bus' ? `<button type="button" class="btn btn-xs btn-secondary" data-suggest="${esc(s.skillId)}" data-team="${esc(s.team || '')}">🧭 Qui affecter ?</button>` : ''}`
    + `${s.who[0] ? `<button type="button" class="btn btn-xs btn-secondary" data-skillup="${esc(s.skillId)}" data-who="${esc(s.kind === 'bus' ? '' : s.who[0])}" data-team="${esc(s.team || '')}">🚀 Monter en compétence</button>` : ''}</div></div></article>`;

/** Panneau de simulation : déplacement en cours et impact chiffré. */
function _simPanel(ctx, st) {
    const imp = st.sim && M.simImpact(ctx, st.sim);
    if (!imp) return `<div class="atl-panel__head"><h3>🔀 Atelier de staffing</h3></div><p class="atl-muted">Touchez un satellite pour simuler le déplacement d'une personne vers une autre équipe. Rien n'est enregistré.</p>`;
    const pct = c => c.pct == null ? '—' : `${c.pct} %`;
    const row = (title, sub, val, mod = '') => `<div class="atl-imp"><span class="atl-row__main"><b>${title}</b><small>${sub}</small></span><span class="atl-delta${mod ? ' atl-delta--' + mod : ''}">${val}</span></div>`;
    return `<div class="atl-panel__head"><h3>🔀 Impact de la simulation</h3></div>`
        + `<div class="atl-sim__move">${avatarHtml(imp.who.name, { size: 'md', color: ctx.teamColor(imp.from) })}<span class="atl-row__main"><b>${esc(imp.who.name)}</b><small>${esc(imp.from)} → ${esc(imp.to)}</small></span></div>`
        + row(`${esc(imp.to)} · couverture`, imp.toCov[1].missing.length ? 'toujours à couvrir : ' + esc(imp.toCov[1].missing.map(id => ctx.skills.find(s => s.id === id)?.name).join(', ')) : 'compétences requises couvertes', `${pct(imp.toCov[0])} → ${pct(imp.toCov[1])}`, (imp.toCov[1].pct ?? 0) > (imp.toCov[0].pct ?? 0) ? 'up' : '')
        + row(`${esc(imp.from)} · couverture`, imp.lost.length ? 'perd son seul sachant : ' + esc(imp.lost.map(s => s.name).join(', ')) : 'rien de requis n\'est perdu', `${pct(imp.fromCov[0])} → ${pct(imp.fromCov[1])}`, (imp.fromCov[1].pct ?? 100) < (imp.fromCov[0].pct ?? 100) ? 'down' : '')
        + row(`${esc(imp.from)} · effectif`, `${imp.fromSize[0]} → ${imp.fromSize[1]} personnes`, '−1', 'down')
        + row(`Charge de ${esc(imp.who.name.split(' ')[0])}`, 'tickets actifs à réattribuer', String(imp.load), imp.load ? 'warn' : '')
        + `<div class="atl-acts"><button type="button" class="btn btn-primary btn-sm" data-sim-copy>📋 Copier la proposition</button><button type="button" class="btn btn-ghost btn-sm" data-sim-reset>↺ Annuler</button></div>`;
}

export function mapHtml(ctx, st) {
    if (!ctx.teams.length) return emptyHtml('🌌', 'Aucune équipe dans le périmètre', 'Le filtre du haut ne laisse aucune équipe : élargissez-le à une ligne produit ou à tout le train.');
    const opts = M.activeSkills(ctx).concat(ctx.skills.filter(s => !M.activeSkills(ctx).includes(s)));
    const zoomName = st.zoom ? _lines(ctx, null).find(l => l.id === st.zoom)?.name : '';
    const panel = st.simOn ? _simPanel(ctx, st) : st.team && ctx.teams.includes(st.team) ? _teamPanel(ctx, st, st.team) : _programPanel(ctx);
    return `<div class="atl-tools">
            <label class="atl-search">🔍<select data-map-skill aria-label="Compétence cherchée"><option value="">Chercher une compétence…</option>${opts.map(s => `<option value="${esc(s.id)}"${s.id === st.skill ? ' selected' : ''}>${esc(s.name)} · ${M.expertsOf(ctx, s.id).length} sachant(s)</option>`).join('')}</select></label>
            ${st.zoom ? `<button type="button" class="atl-chip atl-chip--on" data-zoom="">‹ Programme · ${esc(zoomName || '')}</button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn btn-sm ${st.simOn ? 'btn-primary' : 'btn-secondary'}" data-sim-toggle aria-pressed="${!!st.simOn}">🔀 Atelier</button>
            <button type="button" class="btn btn-sm btn-ghost" data-tour title="Visite guidée (Échap pour arrêter)">▶ Visite</button>
            <button type="button" class="btn btn-sm btn-ghost" data-present title="Présentation plein écran">⛶</button>
            <button type="button" class="btn btn-sm btn-ghost" data-png title="Exporter la carte en PNG">📤</button>
        </div>
        ${st.simOn ? '<div class="atl-simbar"><span class="atl-live"></span><b>Simulation</b><span>rien n\'est enregistré</span></div>' : ''}
        <div class="atl-mapgrid">
            <div class="atl-stage" id="atlas-stage">${orbitSvg(ctx, st)}<div class="atl-legend">${st.skill ? [1, 2, 3, 4].map(v => levelHtml(v)).join('') + '<small>niveau sur la compétence cherchée</small>' : '<small>Cherchez une compétence pour allumer ses sachants</small>'}<span class="atl-legend__gap"></span><small>requise non couverte</small></div></div>
            <aside class="atl-panel">${panel}</aside>
        </div>`;
}

/** Choix de l'équipe cible d'un déplacement simulé (feuille sous le satellite). */
function _pickTarget(ctx, st, who, rerender) {
    const p = ctx.people.find(x => x.name === who);
    if (!p) return;
    document.getElementById('atl-sim-pick')?.remove();
    const pop = document.createElement('div');
    pop.id = 'atl-sim-pick';
    pop.className = 'atl-pop';
    pop.innerHTML = `<b>🔀 Déplacer ${esc(who.split(' ')[0])} vers…</b>` + ctx.teams.filter(t => t !== p.team).map(t => {
        const imp = M.simImpact(ctx, { who, to: t });
        const gain = (imp.toCov[1].pct ?? 0) - (imp.toCov[0].pct ?? 0);
        return `<button type="button" class="atl-row" data-to="${esc(t)}">${dotHtml(ctx.teamColor(t))}<span class="atl-row__main"><b>${esc(t)}</b><small>couverture ${imp.toCov[0].pct ?? '—'} %</small></span>${gain > 0 ? `<span class="atl-chip atl-chip--ok">+${gain} %</span>` : ''}</button>`;
    }).join('');
    document.body.appendChild(pop);
    const close = () => { pop.remove(); document.removeEventListener('click', outside, true); };
    const outside = e => { if (!pop.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('click', outside, true));
    pop.addEventListener('click', e => {
        const b = e.target.closest('[data-to]');
        if (!b) return;
        st.sim = { who, to: b.dataset.to };
        close();
        rerender();
    });
}

async function _exportPng(stage, btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳';
    try {
        if (!window.html2canvas) {
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                s.onload = res; s.onerror = rej;
                document.head.appendChild(s);
            });
        }
        const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#0f172a';
        const canvas = await window.html2canvas(stage, { backgroundColor: bg, scale: 2 });
        const a = document.createElement('a');
        a.download = `atlas-carte-${new Date().toISOString().slice(0, 10)}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        toast('Carte exportée en PNG', 'success');
    } catch { toast('Erreur lors de l\'export', 'error'); }
    finally { btn.disabled = false; btn.textContent = orig; }
}

/** Visite guidée : sélectionne chaque équipe tour à tour (4 s), Échap ou un clic l'arrête. */
function _tour(ctx, st, rerender) {
    let i = 0;
    const step = () => { st.team = ctx.teams[i % ctx.teams.length]; i++; rerender(); };
    const stop = () => { clearInterval(timer); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', stop); toast('Visite arrêtée', 'info'); };
    const onKey = e => { if (e.key === 'Escape') stop(); };
    step();
    const timer = setInterval(step, 4000);
    document.addEventListener('keydown', onKey);
    setTimeout(() => document.addEventListener('pointerdown', stop, { once: true }), 300);
}

export function bindMap(root, ctx, st, rerender, act) {
    root.querySelector('[data-map-skill]')?.addEventListener('change', e => { st.skill = e.target.value || null; st.mode = st.skill ? 'skill' : 'org'; rerender(); });
    root.addEventListener('click', e => {
        const t = e.target;
        const z = t.closest('[data-zoom]');
        if (z) { st.zoom = z.dataset.zoom || null; rerender(); return; }
        const m = t.closest('[data-member]');
        if (m) {
            if (st.simOn && m.tagName === 'circle') _pickTarget(ctx, st, m.dataset.member, rerender);
            else act.openMember(m.dataset.member);
            return;
        }
        const team = t.closest('.atl-orbit__team');
        if (team) { st.team = st.team === team.dataset.team ? null : team.dataset.team; rerender(); return; }
        if (t.closest('[data-sim-toggle]')) { st.simOn = !st.simOn; st.sim = null; rerender(); return; }
        if (t.closest('[data-sim-reset]')) { st.sim = null; rerender(); return; }
        if (t.closest('[data-sim-copy]')) {
            const imp = M.simImpact(ctx, st.sim);
            if (!imp) return;
            const pct = c => c.pct == null ? '—' : `${c.pct} %`;
            copyToClipboard(`Proposition de staffing : ${imp.who.name}, ${imp.from} → ${imp.to}\n`
                + `• ${imp.to} : couverture ${pct(imp.toCov[0])} → ${pct(imp.toCov[1])}\n`
                + `• ${imp.from} : couverture ${pct(imp.fromCov[0])} → ${pct(imp.fromCov[1])}, effectif ${imp.fromSize[0]} → ${imp.fromSize[1]}${imp.lost.length ? `, perd son seul sachant ${imp.lost.map(s => s.name).join(', ')}` : ''}\n`
                + `• ${imp.load} ticket(s) actif(s) à réattribuer`);
            toast('Proposition copiée — à présenter au PI Planning', 'success');
            return;
        }
        if (t.closest('[data-tour]')) { _tour(ctx, st, rerender); return; }
        if (t.closest('[data-present]')) { root.querySelector('#atlas-stage')?.requestFullscreen?.(); return; }
        const png = t.closest('[data-png]');
        if (png) { _exportPng(root.querySelector('#atlas-stage'), png); return; }
        const sg = t.closest('[data-suggest]');
        if (sg) { act.openSuggest(sg.dataset.suggest, sg.dataset.team || null); return; }
        const su = t.closest('[data-skillup]');
        if (su) act.openSkillUp(su.dataset.who || null, su.dataset.team || null, su.dataset.skillup);
    });
    // Clavier : Entrée sur un astre ou un satellite = clic
    root.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const n = e.target.closest('.atl-orbit__member, .atl-orbit__body');
        if (!n) return;
        e.preventDefault();
        n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}
