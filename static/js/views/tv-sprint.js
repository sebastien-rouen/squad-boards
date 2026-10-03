/**
 * Mode TV — 🏃 Sprint en cours : un burndown RÉEL par équipe, lisible à trois mètres.
 *
 *   - grand format : BURNDOWN (reste à faire, points finis chaque jour, ajouts au périmètre) puis
 *     BURNUP (fait cumulé vs périmètre) l'un sous l'autre ; compact : le burndown seul ;
 *   - graphiques SVG avec axes gradués (points en ordonnée, jours ouvrés en abscisse),
 *     rythme idéal, reste à faire réel (d'après les dates de résolution — le graphique du Dashboard
 *     interpole une droite), repère « aujourd'hui » et PROJECTION au rythme actuel jusqu'à la fin ;
 *   - chiffres clés : réalisé, reste, rythme actuel vs rythme nécessaire ;
 *   - 💡 conseils tirés des données (blocages, revue engorgée, sur-engagement, périmètre ajouté…),
 *     les deux plus urgents ; ✨ faits marquants du sprint (dernier terminé, plus gros reste…).
 *
 * Une seule équipe : grand graphique + panneau. Plusieurs : une carte compacte par équipe, paginée.
 *
 * 👻 Fantôme (3.196.0) : le burndown du sprint CLOS précédent de l'équipe, en pointillé clair, ramené
 * en % de son périmètre et étiré sur la durée du sprint en cours — on voit d'un coup d'œil si l'équipe
 * fait mieux (courbe sous le fantôme) ou moins bien.
 */

import { store } from '../state.js';
import { esc, sprintScope, sumBy, burnSeries, resolvedDay, createdDay, emptyStateHtml } from '../utils.js';
import { tkAttrs, pagedHtml, dayKey } from './tv-screens.js';

const atNoon = k => new Date(`${k}T12:00:00`);
const plusDays = (k, n) => { const d = atNoon(k); d.setDate(d.getDate() + n); return dayKey(d); };
const isWeekend = k => [0, 6].includes(atNoon(k).getDay());
const colorOf = (teamObjects, tm) => (teamObjects || []).find(o => o.name === tm)?.color || 'var(--primary)';
const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
const relDay = (k, today) => {
    const d = Math.round((atNoon(today) - atNoon(k)) / 864e5);
    return d === 0 ? 'aujourd\'hui' : d === 1 ? 'hier' : `il y a ${d} j`;
};

/** Jours ouvrés d'un sprint (AAAA-MM-JJ). */
function workdays(s) {
    const start = dayKey(new Date(s.startDate)), end = dayKey(new Date(s.endDate)), days = [];
    for (let d = start; d <= end; d = plusDays(d, 1)) if (!isWeekend(d)) days.push(d);
    return days;
}

/**
 * 👻 Burndown du sprint clos précédent de l'équipe : [{ f, r }] — f = avancement dans le sprint
 * (0 → 1), r = part du périmètre restant (1 → 0). null sans sprint clos estimable.
 */
function ghostOf(s, teamTickets, usePts) {
    const prev = (store.get('sprintInfo')?.teamSprints || [])
        .filter(x => x.team === s.team && x.state === 'closed' && x.startDate && x.endDate && String(x.endDate) <= String(s.startDate))
        .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0];
    if (!prev) return null;
    const days = workdays(prev);
    if (days.length < 2) return null;
    const scope = sprintScope(teamTickets, prev.name);
    const val = t => (usePts ? (t.points || 0) : 1);
    const g = burnSeries({ engaged: scope.engaged, done: scope.done, days, today: days.at(-1), val });
    if (!g.total) return null;
    return { name: prev.name, pts: g.real.map((v, i) => ({ f: i / (days.length - 1), r: v / g.total })), endPct: Math.round((g.done / g.total) * 100) };
}

/** Tout ce que l'écran affiche d'un sprint, calculé une fois. */
function analyse(s, today) {
    const teamTickets = (store.get('tickets') || []).filter(t => t.team === s.team);
    const scope = sprintScope(teamTickets, s.name);
    const start = dayKey(new Date(s.startDate)), end = dayKey(new Date(s.endDate));
    const days = [];
    for (let d = start; d <= end; d = plusDays(d, 1)) if (!isWeekend(d)) days.push(d);
    const usePts = sumBy(scope.engaged, t => t.points) > 0;   // sans points : on compte les tickets
    const val = t => (usePts ? (t.points || 0) : 1);
    const unit = usePts ? 'pts' : 'tickets';
    // Série réelle (source unique utils/burn.js, partagée avec le Board) : un ticket résolu le week-end
    // compte pour le jour ouvré suivant ; avant le sprint, pour le 1er jour.
    const { slot, doneSlot, total, real, doneDay, scopeAt, addedDay, remaining, done } = burnSeries({ engaged: scope.engaged, done: scope.done, days, today, val });
    const elapsed = real.length, left = days.filter(d => d > today).length;
    const ideal = i => (days.length > 1 ? total * (1 - i / (days.length - 1)) : 0);
    const gap = total && elapsed ? Math.round(((ideal(elapsed - 1) - remaining) / total) * 100) : 0;   // > 0 : en avance
    const pace = elapsed ? done / elapsed : 0;                  // par jour ouvré écoulé
    const need = left ? remaining / left : 0;
    const projected = Math.max(0, remaining - pace * left);     // reste à la fin, au rythme actuel

    const open = scope.engaged.filter(t => t.status !== 'done' && !scope.carried.includes(t));
    const blocked = open.filter(t => t.status === 'blocked');
    const waiting = open.filter(t => ['review', 'test'].includes(t.status));
    const todo = open.filter(t => t.status === 'todo');
    const added = scope.engaged.filter(t => createdDay(t) > start);
    const lastDone = [...scope.done].filter(resolvedDay).sort((a, b) => resolvedDay(b).localeCompare(resolvedDay(a)))[0];
    const biggest = [...open].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
    // Vélocité de référence : moyenne des 3 derniers sprints clos de l'équipe (champ JIRA velocity).
    const past = (store.get('sprintInfo')?.teamSprints || []).filter(x => x.team === s.team && x.state === 'closed' && x.estimated > 0)
        .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))).slice(0, 3);
    const velocity = usePts && past.length ? sumBy(past, x => x.velocity) / past.length : null;   // en points seulement
    return { s, scope, days, start, end, unit, usePts, val, slot, doneSlot, total, real, doneDay, scopeAt, addedDay, elapsed, left, remaining, done, ideal, gap, pace, need, projected,
        open, blocked, waiting, todo, added, lastDone, biggest, velocity, pastN: past.length, ghost: ghostOf(s, teamTickets, usePts) };
}

const level = a => (a.gap >= 10 ? 'ahead' : a.gap >= -10 ? 'ok' : a.gap >= -25 ? 'warn' : 'late');
const LEVEL = { ahead: '🚀 En avance', ok: '✅ Dans les clous', warn: '⚠️ À surveiller', late: '🔥 En retard' };
const tk = t => `<code ${tkAttrs(t.id)}>${esc(t.id)}</code>`;

/** 💡 Conseils, du plus urgent au plus anodin : on en garde `max`. */
function advice(a, max) {
    const out = [];
    const pts = list => fmtNum(sumBy(list, a.val));
    if (a.blocked.length) out.push(`🚧 <b>Débloquer d'abord</b> : ${a.blocked.length} ticket${a.blocked.length > 1 ? 's' : ''} bloqué${a.blocked.length > 1 ? 's' : ''} (${pts(a.blocked)} ${a.unit}) — ${a.blocked.slice(0, 3).map(tk).join(' ')}`);
    if (a.left && a.need > Math.max(a.pace, 0.1) * 1.5 && a.remaining > 0) out.push(`✂️ <b>Rythme intenable</b> : ${fmtNum(a.need)} ${a.unit}/jour nécessaires contre ${fmtNum(a.pace)} actuellement — revoir le périmètre avec le PO (~${fmtNum(a.projected)} ${a.unit} à sortir)`);
    if (a.waiting.length >= 3) out.push(`👀 <b>Finir avant de commencer</b> : ${a.waiting.length} tickets attendent une revue ou un test — les faire passer avant d'en ouvrir d'autres`);
    if (a.left <= 2 && a.todo.length >= 2) out.push(`📦 <b>${a.todo.length} tickets pas commencés</b> à ${a.left ? `J-${a.left}` : 'la fin'} : les sortir du sprint plutôt que les démarrer`);
    if (a.velocity && a.total > a.velocity * 1.5) out.push(`⚖️ <b>Engagement ${fmtNum(a.total / a.velocity)}× la vélocité</b> (${fmtNum(a.velocity)} ${a.unit} en moyenne sur ${a.pastN} sprints) : s'engager sur moins au prochain planning`);
    if (a.added.length && sumBy(a.added, a.val) > a.total * 0.15) out.push(`📈 <b>Périmètre élargi</b> : ${a.added.length} ticket${a.added.length > 1 ? 's' : ''} créé${a.added.length > 1 ? 's' : ''} pendant le sprint (${pts(a.added)} ${a.unit}) — qu'est-ce qui sort en échange ?`);
    if (!a.usePts) out.push('📊 <b>Estimer les tickets</b> : sans points, le burndown compte les tickets et ne voit pas leur taille');
    if (!out.length) out.push(a.remaining ? '✅ <b>Garder le cap</b> : le rythme suffit, préparer la démo et le prochain planning' : '🎉 <b>Tout est livré</b> : préparer la démo, et pourquoi pas attaquer le prochain sprint');
    return out.slice(0, max);
}

/** ✨ À savoir : des tuiles « icône · intitulé · contenu » plutôt que des phrases en vrac. */
function facts(a, today, max) {
    const out = [];
    const tile = (ico, lbl, html, tone = '') => ({ ico, lbl, html, tone });
    if (a.s.goal) out.push(tile('🎯', 'Objectif du sprint', esc(String(a.s.goal).split('\n').map(x => x.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).slice(0, 2).join(' · '))));
    if (a.lastDone) out.push(tile('✅', `Dernier terminé · ${relDay(resolvedDay(a.lastDone), today)}`, `${tk(a.lastDone)} ${esc(String(a.lastDone.title || '').slice(0, 80))}`, 'ok'));
    if (a.biggest && (a.biggest.points || 0) > 0) out.push(tile('🐘', 'Plus gros reste', `${tk(a.biggest)} <b>${a.biggest.points} pts</b>${a.biggest.leader ? ` · ${esc(a.biggest.leader)}` : ''}`));
    if (a.velocity) {
        const pct = Math.min(100, Math.round((a.velocity / Math.max(1, a.total)) * 100));
        out.push(tile('📏', `Vélocité · ${a.pastN} derniers sprints`, `<b>${fmtNum(a.velocity)}</b> ${a.unit} en moyenne pour <b>${fmtNum(a.total)}</b> engagés<span class="tvs-cmp" title="vélocité / engagement"><i style="width:${pct}%"></i></span>`, a.total > a.velocity * 1.5 ? 'warn' : ''));
    }
    if (a.scope.carried.length) out.push(tile('↪️', `${a.scope.carried.length} reporté${a.scope.carried.length > 1 ? 's' : ''} ailleurs`, a.scope.carried.slice(0, 4).map(tk).join(' '), 'warn'));
    return out.slice(0, max);
}
const factsHtml = list => `<ul class="tvs-facts">${list.map(f => `<li class="tvs-fact${f.tone ? ` is-${f.tone}` : ''}"><span class="tvs-fact-ico" aria-hidden="true">${f.ico}</span><div><small>${esc(f.lbl)}</small><p>${f.html}</p></div></li>`).join('')}</ul>`;

/** Cadre commun (axes gradués, grille, jours) d'un graphique de sprint. viewBox ≈ taille rendue :
 *  en compact le graphique ne fait que 230 à 300 px de large → viewBox étroit, police plus grande. */
function frame(a, big, max, title, H) {
    const W = big ? 920 : 400;
    const L = big ? 52 : 40, R = 12, T = 22, B = big ? 40 : 32;
    const n = Math.max(1, a.days.length - 1);
    const x = i => L + (i / n) * (W - L - R), y = v => T + (1 - v / Math.max(1, max)) * (H - T - B);
    const fs = big ? 15 : 16;
    const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f)))];
    const step = big || a.days.length <= 8 ? 1 : 2;
    const today = dayKey(new Date());
    const svgHead = `${ticks.map(v => `<line class="tvs-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tvs-ax" x="${L - 8}" y="${y(v) + fs / 3}" text-anchor="end" font-size="${fs}">${v}</text>`).join('')}
        <line class="tvs-axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/><line class="tvs-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
        <text class="tvs-ax tvs-ax-title" x="${L}" y="${T - 6}" font-size="${fs - 1}">${esc(title)}</text>
        ${a.days.map((d, i) => (i % step && i !== n ? '' : `<text class="tvs-ax${d === today ? ' is-today' : ''}" x="${x(i)}" y="${H - B + fs + 6}" text-anchor="middle" font-size="${fs}">${WD[atNoon(d).getDay()]} ${+d.slice(8)}</text>`)).join('')}`;
    const last = a.real.length - 1;
    const live = last >= 0 && last < n;
    const now = live ? `<line class="tvs-now" x1="${x(last)}" x2="${x(last)}" y1="${T}" y2="${H - B}"/>` : '';
    // Libellés posés sans chevauchement : le titre d'axe est réservé d'office, « aujourd'hui » passe
    // en premier (haut, puis à droite / à gauche de la ligne, puis dans le graphique).
    const lp = labelPlacer(W, H);
    lp.block({ x: L, y: T - 6, anchor: 'start', fs: fs - 1, text: title });
    const nowCands = live ? [[x(last), T - 6, 'middle'], [x(last) + 4, T - 6, 'start'], [x(last) - 4, T - 6, 'end'], [x(last) + 4, T + fs, 'start'], [x(last) - 4, T + fs, 'end']] : [];
    return { W, H, L, R, T, B, n, x, y, fs, svgHead, now, last, live, lp, nowCands };
}

/**
 * Placement de libellés SANS chevauchement (« aujourd'hui », « périmètre 37 », « ≈ 19,4 restants à la
 * fin », valeur du jour…) : chaque libellé essaie ses positions candidates dans l'ordre et prend la
 * première qui reste dans le cadre et ne touche aucun libellé déjà posé ; sinon la première. Largeur
 * ESTIMÉE (≈ 0,56 em par caractère) : un SVG rendu en chaîne ne se mesure pas avant d'être affiché.
 */
function labelPlacer(W, H) {
    const placed = [];
    const box = c => {
        const w = [...c.text].length * c.fs * 0.56;
        const x0 = c.anchor === 'end' ? c.x - w : c.anchor === 'middle' ? c.x - w / 2 : c.x;
        return { x0, x1: x0 + w, y0: c.y - c.fs * 0.85, y1: c.y + c.fs * 0.25 };
    };
    const free = b => b.x0 >= 0 && b.x1 <= W && b.y0 >= 0 && b.y1 <= H
        && !placed.some(p => b.x0 < p.x1 && p.x0 < b.x1 && b.y0 < p.y1 && p.y0 < b.y1);
    return {
        /** Réserve une zone (titre d'axe, repères ▲, barres « +N ») sans rien rendre. */
        block: c => placed.push(box(c)),
        /** `cands` = [[x, y, anchor], …] ; renvoie le <text> rendu à la première position libre. */
        text: (cands, { cls, fs, text }) => {
            if (!cands.length) return '';
            const all = cands.map(([x, y, anchor]) => ({ x, y, anchor, fs, text }));
            const c = all.find(k => free(box(k))) || all[0];
            placed.push(box(c));
            return `<text class="${cls}" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="${c.anchor}" font-size="${fs}">${esc(text)}</text>`;
        },
    };
}

/** Attributs d'un repère cliquable (barre du jour, ▲) → liste des tickets de ce jour (tv.js). */
const hitAttrs = (a, i, kind, lbl) => `class="tvs-hit" data-burn-team="${esc(a.s.team)}" data-burn-day="${a.days[i]}" data-burn-kind="${kind}" tabindex="0" role="button" aria-label="${esc(lbl)} le ${+a.days[i].slice(8)}/${+a.days[i].slice(5, 7)} — voir les tickets"`;
const addMark = (a, i, cx, cy, fs, v) => `<g ${hitAttrs(a, i, 'added', `${fmtNum(v)} ${a.unit} ajoutés`)}><rect class="tvs-hit-area" x="${(cx - 26).toFixed(1)}" y="${(cy - fs - 4).toFixed(1)}" width="52" height="${fs + 12}"/><text class="tvs-add" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" font-size="${fs - 1}">▲+${fmtNum(v)}</text></g>`;

/** 📉 Burndown : reste à faire réel vs idéal, projection, points faits chaque jour (barres « +N »)
 *  et ajouts au périmètre (▲ « +N », la courbe remonte d'autant). */
function burndownSvg(a, big) {
    const f = frame(a, big, a.total, `${a.unit} restants`, 250);
    const { x, y, n, fs, last } = f;
    const pts = a.real.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = a.real.length ? `${x(0)},${y(0)} ${pts} ${x(last).toFixed(1)},${y(0)}` : '';
    const dots = a.real.map((v, i) => `<circle class="tvs-dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${big ? 4.5 : 3.5}"/>`).join('');
    // Points faits chaque jour : barres au pied du graphique, échelle à part (le plus gros jour = 22 % de la hauteur).
    const bw = Math.max(6, ((f.W - f.L - f.R) / Math.max(1, n)) * 0.36), dMax = Math.max(1, ...a.doneDay), bH = (f.H - f.T - f.B) * 0.22;
    const bars = a.doneDay.map((v, i) => {
        if (!v) return '';
        const h = (v / dMax) * bH, hit = Math.max(h + (big ? 22 : 6), 26);
        return `<g ${hitAttrs(a, i, 'done', `${fmtNum(v)} ${a.unit} terminés`)}><rect class="tvs-hit-area" x="${(x(i) - bw).toFixed(1)}" y="${(y(0) - hit).toFixed(1)}" width="${(bw * 2).toFixed(1)}" height="${hit.toFixed(1)}"/>`
            + `<rect class="tvs-daybar" x="${(x(i) - bw / 2).toFixed(1)}" y="${(y(0) - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`
            + `${big ? `<text class="tvs-daybar-lbl" x="${x(i).toFixed(1)}" y="${(y(0) - h - 5).toFixed(1)}" text-anchor="middle" font-size="${fs - 2}">+${fmtNum(v)}</text>` : ''}</g>`;
    }).join('');
    const adds = a.addedDay.map((v, i) => (v ? addMark(a, i, x(i), y(a.real[i]) - 12, fs, v) : '')).join('');
    // 👻 Sprint précédent, ramené au périmètre actuel (en %) et étiré sur la durée de celui-ci.
    const ghost = a.ghost ? `<polyline class="tvs-ghost" points="${a.ghost.pts.map(p => `${x(p.f * n).toFixed(1)},${y(p.r * a.total).toFixed(1)}`).join(' ')}"><title>Sprint précédent (${esc(a.ghost.name)}) : ${a.ghost.endPct} % du périmètre fait à la fin</title></polyline>` : '';
    // Libellés : les repères (barres « +N », ▲) sont réservés, puis « aujourd'hui », la valeur du jour, la projection.
    const { lp } = f;
    a.doneDay.forEach((v, i) => { if (v && big) lp.block({ x: x(i), y: y(0) - (v / dMax) * bH - 5, anchor: 'middle', fs: fs - 2, text: `+${fmtNum(v)}` }); });
    a.addedDay.forEach((v, i) => { if (v) lp.block({ x: x(i), y: y(a.real[i]) - 12, anchor: 'middle', fs: fs - 1, text: `▲+${fmtNum(v)}` }); });
    const nowLbl = lp.text(f.nowCands, { cls: 'tvs-now-lbl', fs: fs - 1, text: 'aujourd\'hui' });
    const xl = x(last), yr = y(a.remaining);
    const val = last >= 0 ? lp.text([[xl + 8, yr - 8, 'start'], [xl + 8, yr + fs + 10, 'start'], [xl - 8, yr - 8, 'end'], [xl - 8, yr + fs + 10, 'end']], { cls: 'tvs-val', fs: fs + 3, text: fmtNum(a.remaining) }) : '';
    const yp = y(a.projected);
    const proj = f.live ? `<line class="tvs-proj" x1="${xl}" y1="${yr}" x2="${x(n)}" y2="${yp}"/>`
        + lp.text([[x(n) - 4, yp - 8, 'end'], [x(n) - 4, yp + fs + 6, 'end'], [x(n) - 4, yp - fs - 14, 'end'], [x(n) - 4, f.T + fs + 4, 'end']],
            { cls: 'tvs-proj-lbl', fs, text: a.projected > 0 ? `≈ ${fmtNum(a.projected)} restants à la fin` : 'fini à temps' }) : '';
    return `<svg class="tvs-chart" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="Burndown : reste ${fmtNum(a.remaining)} ${a.unit} sur ${fmtNum(a.total)}, ${a.left} jours ouvrés restants">
        ${f.svgHead}
        <line class="tvs-ideal" x1="${x(0)}" y1="${y(a.total)}" x2="${x(n)}" y2="${y(0)}"/>
        ${ghost}
        ${area ? `<polygon class="tvs-area" points="${area}"/><polyline class="tvs-real" points="${pts}"/>${dots}` : ''}
        ${proj}${f.now}${nowLbl}${val}${bars}${adds}
    </svg>`;
}

/** Point du burnup d'un jour où des tickets ont été terminés : cliquable (→ tickets du jour), avec sa
 *  date et « +N » au survol — le point dit QUAND la courbe a monté et grâce à QUOI. */
const upDot = (a, i, cx, cy, v, fs, big) => {
    const d = a.days[i], date = `${['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][atNoon(d).getDay()]} ${+d.slice(8)}/${+d.slice(5, 7)}`;
    return `<g ${hitAttrs(a, i, 'done', `${fmtNum(a.doneDay[i])} ${a.unit} terminés`)}><title>${esc(date)} — ${fmtNum(v)} ${a.unit} faits (+${fmtNum(a.doneDay[i])} ce jour-là)</title>`
        + `<circle class="tvs-hit-area" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${big ? 16 : 13}"/>`
        + `<circle class="tvs-dot is-hit" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${big ? 6 : 4.5}"/>`
        + `<text class="tvs-dot-lbl" x="${cx.toFixed(1)}" y="${(cy - 14).toFixed(1)}" text-anchor="middle" font-size="${fs - 1}">${esc(date)} · +${fmtNum(a.doneDay[i])}</text></g>`;
};

/** 📈 Burnup : fait cumulé vs périmètre (marche quand des tickets entrent), idéal, projection. */
function burnupSvg(a, big) {
    const top = Math.max(a.total, ...a.scopeAt, 1);
    const f = frame(a, big, top, `${a.unit} faits / périmètre`, 250);
    const { x, y, n, fs, last } = f;
    const done = a.real.map(v => a.total - v);
    const pts = done.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = done.length ? `${x(0)},${y(0)} ${pts} ${x(last).toFixed(1)},${y(0)}` : '';
    // Périmètre : en marches jusqu'à aujourd'hui, puis tenu jusqu'à la fin (pointillé).
    const scope = a.scopeAt.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}${i < a.scopeAt.length - 1 ? ` ${x(i + 1).toFixed(1)},${y(v).toFixed(1)}` : ''}`).join(' ');
    const scopeEnd = last >= 0 && last < n ? `<line class="tvs-scope is-future" x1="${x(last)}" y1="${y(a.total)}" x2="${x(n)}" y2="${y(a.total)}"/>` : '';
    const projDone = Math.min(top, a.done + a.pace * a.left);
    const proj = last >= 0 && last < n ? `<line class="tvs-proj" x1="${x(last)}" y1="${y(a.done)}" x2="${x(n)}" y2="${y(projDone)}"/>` : '';
    const { lp } = f;
    a.addedDay.forEach((v, i) => { if (v) lp.block({ x: x(i), y: y(a.scopeAt[i]) - 10, anchor: 'middle', fs: fs - 1, text: `▲+${fmtNum(v)}` }); });
    const nowLbl = lp.text(f.nowCands, { cls: 'tvs-now-lbl', fs: fs - 1, text: 'aujourd\'hui' });
    const ys = y(a.total), yd = y(a.done), xl = x(last);
    const scopeLbl = lp.text([[x(n) - 4, ys - 8, 'end'], [x(n) - 4, ys + fs + 6, 'end'], [x(n) - 4, ys + 2 * fs + 12, 'end']], { cls: 'tvs-scope-lbl', fs, text: `périmètre ${fmtNum(a.total)}` });
    const doneLbl = last >= 0 ? lp.text([[xl + 8, yd + fs + 10, 'start'], [xl + 8, yd - 8, 'start'], [xl - 8, yd + fs + 10, 'end'], [xl - 8, yd - 8, 'end']], { cls: 'tvs-val', fs: fs + 3, text: `${fmtNum(a.done)} faits` }) : '';
    return `<svg class="tvs-chart" viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="Burnup : ${fmtNum(a.done)} ${a.unit} faits sur un périmètre de ${fmtNum(a.total)}">
        ${f.svgHead}
        <line class="tvs-ideal" x1="${x(0)}" y1="${y(0)}" x2="${x(n)}" y2="${y(a.total)}"/>
        ${scope ? `<polyline class="tvs-scope" points="${scope}"/>` : ''}${scopeEnd}
        ${scopeLbl}
        ${a.addedDay.map((v, i) => (v ? addMark(a, i, x(i), y(a.scopeAt[i]) - 10, fs, v) : '')).join('')}
        ${area ? `<polygon class="tvs-area" points="${area}"/><polyline class="tvs-real" points="${pts}"/>${done.map((v, i) => (a.doneDay[i] ? '' : `<circle class="tvs-dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${big ? 4.5 : 3.5}"/>`)).join('')}` : ''}
        ${proj}${f.now}${nowLbl}
        ${doneLbl}
        ${done.map((v, i) => (a.doneDay[i] ? upDot(a, i, x(i), y(v), v, fs, big) : '')).join('')}
    </svg>`;
}

function card(a, teamObjects, today, big) {
    const lvl = level(a);
    const when = a.end < today ? 'terminé' : a.left ? `J-${a.left}` : 'dernier jour';
    const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
    const kpi = (lbl, v, sub, cls = '') => `<div class="tvs-kpi ${cls}"><small>${lbl}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    const color = colorOf(teamObjects, a.s.team);
    // Carte compacte cliquable → grand format de l'équipe (conseils et faits complets).
    return `<li class="tv-sprint${big ? ' is-big' : ' is-zoomable'}" style="--team-color:${color}"${big ? '' : ` data-sprint-team="${esc(a.s.team)}" title="Voir le sprint de ${esc(a.s.team)} en grand"`}>
        <div class="tvs-hd"><span class="team-dot" style="background:${color}"></span><b>${esc(a.s.team)}</b><small>${esc(a.s.name)}</small>
            <span class="tvs-when">${esc(when)}</span><span class="tv-sprint-lvl" data-l="${lvl}">${LEVEL[lvl]}${a.gap ? ` ${a.gap > 0 ? '+' : ''}${a.gap} %` : ''}</span></div>
        <div class="tvs-body">
            <div class="tvs-charts">
                ${big ? '<h4 class="tvs-chart-title">📉 Burndown <small>reste à faire · barres = points finis chaque jour</small></h4>' : ''}
                ${burndownSvg(a, big)}
                ${big ? `<h4 class="tvs-chart-title">📈 Burnup <small>fait vs périmètre${sumBy(a.addedDay, v => v) ? ` · +${fmtNum(sumBy(a.addedDay, v => v))} ${a.unit} ajoutés en cours de sprint` : ''}</small></h4>${burnupSvg(a, big)}` : ''}
            </div>
            <div class="tvs-side">
                <div class="tvs-kpis">
                    ${kpi('Réalisé', `${fmtNum(a.done)}<small> / ${fmtNum(a.total)}</small>`, `${pct} % · ${a.unit}`)}
                    ${kpi('Rythme', fmtNum(a.pace), `${a.unit}/jour · requis ${a.left ? fmtNum(a.need) : '—'}`, a.left && a.need > a.pace * 1.5 ? 'is-bad' : '')}
                    ${big ? kpi('En cours', a.open.length - a.todo.length, `${a.blocked.length} bloqué${a.blocked.length > 1 ? 's' : ''} · ${a.waiting.length} en revue/test`, a.blocked.length ? 'is-bad' : '') : ''}
                </div>
                ${big ? '<h4 class="tvs-sec">💡 Conseils</h4>' : ''}
                <ul class="tvs-tips">${advice(a, big ? 2 : 1).map(x => `<li>${x}</li>`).join('')}</ul>
                ${big ? '' : factsHtml(facts(a, today, 2))}
            </div>
        </div>
        ${big ? `<div class="tvs-know"><h4 class="tvs-sec">✨ À savoir</h4>${factsHtml(facts(a, today, 5))}</div>` : ''}
    </li>`;
}

/** `focus` = une équipe choisie (clic sur sa carte) : son sprint en grand, avec retour à toutes. */
export function screenSprint({ teams, teamObjects, ctx }, focus = null) {
    const today = dayKey(new Date());
    const all = (ctx.sprintInfoAll?.teamSprints || []).filter(s => teams.includes(s.team) && s.state === 'active' && s.startDate && s.endDate);
    if (!all.length) return emptyStateHtml({ size: 'tv', icon: '🏃', title: 'Aucun sprint en cours', text: 'Rien d\'actif dans JIRA pour ce périmètre.' });
    const sprints = focus && all.some(s => s.team === focus) ? all.filter(s => s.team === focus) : all;
    const big = sprints.length === 1;
    const back = sprints.length < all.length ? `<button type="button" class="tv-chip-btn tvs-back" data-sprint-team="">← Toutes les équipes (${all.length})</button>` : '';
    // Les équipes les plus en retard d'abord : c'est là que l'écran sert.
    const list = sprints.map(s => analyse(s, today)).sort((a, b) => a.gap - b.gap);
    return `<div class="tv-sprints">
        ${back}
        ${pagedHtml(list.map(a => card(a, teamObjects, today, big)).join(''), { cls: `tv-sprint-grid${big ? ' is-single' : ''}`, unit: 'sprints' })}
        <p class="tv-muted tv-sprint-legend"><i class="tv-burn-key is-real"></i>réel (tickets résolus) <i class="tv-burn-key is-ideal"></i>rythme idéal <i class="tv-burn-key is-proj"></i>projection au rythme actuel ${list.some(a => a.ghost) ? '<i class="tv-burn-key is-ghost"></i>sprint précédent (en % du périmètre) ' : ''}<i class="tv-burn-key is-day"></i>points finis le jour <i class="tv-burn-key is-scope"></i>périmètre · écart = avance (+) ou retard (−) sur l'idéal</p>
    </div>`;
}

const STATUS = { todo: '📦 À faire', inprog: '🔄 En cours', review: '👀 En revue', test: '🧪 En test', blocked: '🚧 Bloqué', done: '✅ Terminé' };

/** Panneau « tickets du jour » : terminés (barre +N du burndown) ou ajoutés au sprint (▲+N). */
export function sprintDayHtml(team, day, kind, teamObjects) {
    const s = (store.get('sprintInfo')?.teamSprints || []).find(x => x.team === team && x.state === 'active');
    if (!s) return '';
    const a = analyse(s, dayKey(new Date()));
    const list = kind === 'done'
        ? a.scope.done.filter(t => a.doneSlot(t) === day)
        : a.scope.engaged.filter(t => createdDay(t) && createdDay(t) > a.start && a.slot(createdDay(t)) === day);
    const color = colorOf(teamObjects, team);
    const sum = sumBy(list, a.val);
    const when = atNoon(day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const head = kind === 'done' ? `✅ ${list.length} ticket${list.length > 1 ? 's' : ''} terminé${list.length > 1 ? 's' : ''} · +${fmtNum(sum)} ${a.unit}`
        : `▲ ${list.length} ticket${list.length > 1 ? 's' : ''} ajouté${list.length > 1 ? 's' : ''} au sprint · +${fmtNum(sum)} ${a.unit}`;
    const note = kind === 'done' ? 'Un ticket résolu le week-end compte pour le jour ouvré suivant.'
        : 'Créés pendant le sprint : ils font remonter le reste à faire (burndown) et le périmètre (burnup).';
    return `<div class="tvd-panel" data-l="${kind === 'done' ? 'sun' : 'rain'}" style="--team-color:${color}" role="dialog" aria-modal="true" aria-label="${esc(head)}">
        <header class="tvd-hd"><span class="team-dot" style="background:${color}"></span><b>${esc(team)}</b>
            <span class="tvd-big">${esc(when)} · ${esc(a.s.name)}</span>
            <button type="button" class="btn-icon tvd-close" data-tvd-close aria-label="Fermer">✕</button></header>
        <div class="tvd-value"><strong>${list.length}</strong><span>${esc(head)}</span></div>
        <ul class="tvs-daylist">${list.map(t => `<li ${tkAttrs(t.id)}><code>${esc(t.id)}</code><span>${esc(t.title || '')}</span><small>${kind === 'added' ? `${STATUS[t.status] || ''} · ` : ''}${t.points ? `${t.points} pts` : 'sans points'}${t.leader ? ` · ${esc(t.leader)}` : ''}</small></li>`).join('') || '<li class="tv-muted">Aucun ticket retrouvé.</li>'}</ul>
        <p class="tv-muted">${esc(note)}</p>
    </div>`;
}
