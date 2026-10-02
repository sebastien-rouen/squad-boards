/**
 * Frise « Couloirs du temps » : un axe horizontal A → B, une ligne par thème, alignées — pour voir
 * les CORRÉLATIONS d'un coup d'œil (incidents pendant les congés, arrivées au changement de PI).
 * Mini-carte de toute la fenêtre en dessous, fenêtre A → B à faire glisser. Mobile : piste défilante.
 *
 * `target(item)` (fourni par la coquille team_timeline.js) enregistre une cible cliquable → fiche.
 */

import { esc } from '../utils.js';
import { CATS, FACT_TYPES, addDays, diff, fmt, fmtY, fmtShort, monthName, mondayOf, shortName, presenceLevel, overview, timelineWindow, timelineToday, prodOpsByDay, STALE_WEEKS, mepFollowUps, LANE_TRAIN_FIELDS } from './team_timeline_model.js';

const pct = (A, B, d) => Math.max(0, Math.min(100, diff(A, d) / Math.max(1, diff(A, B)) * 100));
const span = (A, B, s, e) => { const l = pct(A, B, s < A ? A : s), r = pct(A, B, e > B ? B : e); return `left:${l}%;width:${Math.max(0.6, r - l)}%`; };
// Écart minimal (en % de la piste) entre deux repères d'opérations sur une même rangée (repère de 18 px)
const OPS_GAP = 2.6;
const MOVE = {
    in:         { sym: '▲', cls: 'is-in',   label: 'Arrivée' },
    out:        { sym: '▼', cls: 'is-out',  label: 'Départ' },
    'move-in':  { sym: '⇄', cls: 'is-move', label: 'Mobilité (arrivée)' },
    'move-out': { sym: '⇄', cls: 'is-move', label: 'Mobilité (départ)' },
};

/** Libellé de mois : l'ANNÉE sur le premier repère et sur chaque janvier (« avril 2026 … janvier 2027 »). */
const monthLabel = (d, first) => first || d.slice(5, 7) === '01' ? `<b>${monthName(d)} ${d.slice(0, 4)}</b>` : monthName(d);

function axis(A, B) {
    const ticks = [];
    for (let d = `${A.slice(0, 7)}-01`; d <= B; d = addDays(`${d.slice(0, 7)}-01`, 32).slice(0, 7) + '-01') {
        if (d >= A) ticks.push(`<span class="tll-month" style="left:${pct(A, B, d)}%">${monthLabel(d, !ticks.length)}</span>`);
    }
    return `<div class="tll-axis">${ticks.join('')}</div>`;
}

/** Regroupe les marqueurs trop proches À CETTE ÉCHELLE (les 3 jalons des 31/08, 01/09 et 03/09
 *  se couvraient sur 6 mois — mesuré en maquette). Au zoom, ils se séparent d'eux-mêmes. */
function cluster(list, A, B, gap = 2.2) {
    const out = [];
    for (const it of list) {
        const x = pct(A, B, it.day), last = out[out.length - 1];
        if (last && x - last.x0 < gap) { last.items.push(it); last.lastDay = it.day; }
        else out.push({ x0: x, x, day: it.day, lastDay: it.day, items: [it] });
    }
    out.forEach(g => { g.x = (g.x0 + pct(A, B, g.lastDay)) / 2; });
    return out;
}
const when = g => g.day === g.lastDay ? fmt(g.day) : `${fmt(g.day)} → ${fmt(g.lastDay)}`;

/** Étale des marqueurs proches sur plusieurs rangées (sinon les prénoms se chevauchent). */
function rows(items, A, B, gap = 7) {
    const last = [];
    return items.map(it => {
        const x = pct(A, B, it.day);
        let r = last.findIndex(v => x - v >= gap);
        if (r < 0) { r = last.length; last.push(x); } else last[r] = x;
        return { ...it, x, row: Math.min(r, 3) };
    });
}

const empty = msg => `<span class="tll-empty">${esc(msg)}</span>`;
/** Libellé de couloir. Vue Équipe : pour les couloirs dont le contenu change avec la portée, c'est un
 *  bouton qui bascule CE couloir sur tout le train (pastille 👥 / 🚂) ; Opérations = agenda commun (🚂 fixe). */
function laneLabel(st, cat) {
    const txt = `${CATS[cat].emoji} ${esc(CATS[cat].label)}`;
    if (st.scope === 'team' && LANE_TRAIN_FIELDS[cat]) {
        const train = st.laneTrain?.has(cat);
        return `<button type="button" class="tll-label tll-label-btn" data-lane-scope="${cat}" aria-pressed="${!!train}"
            title="${esc(train ? `${CATS[cat].label} : tout le train — cliquer pour revenir à ${st.team}` : `${CATS[cat].label} : ${st.team} — cliquer pour voir tout le train`)}">${txt}<span class="tll-scope">${train ? '🚂' : '👥'}</span></button>`;
    }
    if (cat === 'operations') return `<div class="tll-label">${txt}<span class="tll-scope is-fixed" title="Agenda commun « ERPC - Opérations » : le même pour toutes les équipes et pour le train">🚂</span></div>`;
    return `<div class="tll-label">${txt}</div>`;
}
const lane = (st, cat, inner, extra = '') => `<div class="tll-row ${extra}${st.laneTrain?.has(cat) && st.scope === 'team' ? ' is-train' : ''}" data-c="${cat}">
    ${laneLabel(st, cat)}<div class="tll-track" role="group" aria-label="${esc(`${CATS[cat].label} — flèches gauche et droite pour parcourir`)}">${inner}</div></div>`;
const icsEmpty = (c, B, none) => empty(c.icsFrom && B < c.icsFrom ? `Agendas ICS disponibles à partir du ${fmt(c.icsFrom)}` : none);

function fact(target, f, A, B) {
    const t = FACT_TYPES[f.type] || FACT_TYPES.other;
    return `<button class="tll-fact tll-fact--${f.type}" style="${span(A, B, f.start, f.end)}" ${target({ kind: 'fact', cat: f.type === 'incident' ? 'production' : 'fait', fact: f, title: `${t.emoji} ${f.title}`, when: f.start === f.end ? fmt(f.start) : `${fmt(f.start)} → ${fmt(f.end)}` })} title="${esc(f.title)}"><span>${t.emoji} ${esc(f.title)}</span></button>`;
}

function lanes(st, c, target) {
    const { A, B } = st, on = k => st.cats.has(k), out = [];
    if (on('rythme')) {
        const pis = c.pis.map(p => `<div class="tll-pi" style="${span(A, B, p.start, p.end)}"><span>PI ${p.n}</span></div>`).join('');
        // Libellé seulement si la part VISIBLE du sprint est assez large (« 28.5 », rogné par le début de
        // période, recouvrait « 29.1 ») ; le survol garde le détail
        const spr = c.sprints.map(s => { const w = pct(A, B, s.end > B ? B : s.end) - pct(A, B, s.start < A ? A : s.start);
            return `<div class="tll-sprint" style="${span(A, B, s.start, s.end)}" title="Sprint ${esc(s.label)} · ${fmtY(s.start)} → ${fmtY(s.end)}">${w >= 2.5 ? `<span>${esc(s.label)}</span>` : ''}</div>`; }).join('');
        const mil = cluster(c.milestones, A, B).map(g => `<button class="tll-flag" style="left:${g.x}%" ${target({ kind: 'milestone', cat: 'rythme', items: g.items, title: g.items.length > 1 ? `${g.items.length} jalons du train` : g.items[0].title.replace(/^ERPC - /, ''), when: when(g) })} title="${esc(g.items.map(m => `${fmtShort(m.day)} ${m.title}`).join(' · '))}">🚩${g.items.length > 1 ? `<small>${g.items.length}</small>` : ''}</button>`).join('');
        out.push(lane(st, 'rythme', `${pis}<div class="tll-sprints">${spr}</div>${mil}`));
    }
    if (on('presence')) {
        // Vert = 100 % présents, orange = 75 à 99 %, rouge = moins de 75 % (presenceLevel)
        const cells = c.presence.filter(s => s.pct !== null).map(s => `<div class="tll-heat" data-l="${presenceLevel(s.pct)}" style="${span(A, B, s.week, addDays(s.week, 6))}" title="${esc(`Semaine du ${fmtY(s.week)} : ${100 - s.pct} % présents (${s.pct} % de congés)${s.holidays?.length ? ` · 🎌 ${s.holidays.map(h => h.name).join(', ')}` : ''}`)}"></div>`).join('');
        // Libellé raccourci quand la période est étroite à cette échelle (jamais coupé : fiche au clic)
        const low = c.low.map(p => { const w = pct(A, B, p.end) - pct(A, B, p.start);
            return `<button class="tll-low" style="${span(A, B, p.start, p.end)}" ${target({ kind: 'low', cat: 'presence', low: p, title: `${p.label} — pic ${p.peak} %`, when: `${fmt(p.start)} → ${fmt(p.end)}` })} title="${esc(`${p.label} · pic ${p.peak} %`)}"><span>🏖️ ${w > 17 ? `${esc(p.label)} · pic ${p.peak} %` : w > 8 ? `pic ${p.peak} %` : `${p.peak} %`}</span></button>`; }).join('');
        // Jours fériés : repère sur la bande (ils ne comptent PAS comme des congés)
        const hol = c.holidays.map(h => `<span class="tll-hol" style="left:${pct(A, B, h.day)}%" title="${esc(`🎌 ${h.name} — ${fmtY(h.day)} (férié, non compté en congés)`)}"></span>`).join('');
        out.push(lane(st, 'presence', cells || low ? `<div class="tll-heats">${cells}${hol}</div>${low}` : empty('Pas de roster importé pour cette période (import Congés)')));
    }
    // Opération EN PRODUCTION le même jour qu'un incident ou une MEP : repère cerclé ⚠️ + ligne dans la fiche
    const prodOps = prodOpsByDay(c);
    // MEP suivie d'un incident dans les 48 h (vue Équipe) : repère ◆ marqué, lien dans les deux fiches
    // MEP ou incidents vus à l'échelle du train : pas de lien MEP → incident (équipes différentes)
    const follow = mepFollowUps(c, st.scope === 'train' || c.trainLanes?.has('production') || c.trainLanes?.has('livraison') ? 'train' : 'team');
    const clashOf = days => [...new Set(days)].flatMap(d => (prodOps.get(d) || []).map(title => ({ day: d, title })));
    const clashTip = cl => cl.length ? ` · ⚠️ ${cl.length} opération(s) en production le même jour` : '';
    if (on('production')) {
        const dots = cluster(c.incidents, A, B, 1.8).map(g => { const items = g.items.flatMap(x => x.items), n = items.length, clash = clashOf(items.map(i => i.day));
            const afterMep = items.filter(i => follow.byIncident.has(i.id)).map(i => ({ ...i, mep: follow.byIncident.get(i.id) }));
            return `<button class="tll-inc${clash.length ? ' is-clash' : ''}" style="left:${g.x}%;--n:${Math.min(n, 8)}" ${target({ kind: 'incidents', cat: 'production', items, clash, afterMep, title: `${n} incident${n > 1 ? 's' : ''} de production`, when: when(g) })} title="${esc(`${n} incident(s) — ${when(g)}${clashTip(clash)}`)}">${n > 1 ? n : ''}</button>`; }).join('');
        const fx = c.facts.filter(f => f.type === 'incident').map(f => fact(target, f, A, B)).join('');
        out.push(lane(st, 'production', dots + fx || empty('Aucun incident de production sur la période')));
    }
    if (on('livraison')) {
        const dia = cluster(c.releases, A, B, 1.8).map(g => { const items = g.items.flatMap(r => r.items), clash = clashOf(g.items.map(r => r.day));
            // Un incident suivant plusieurs MEP du groupe : rattaché à la PLUS PROCHE (J+0 plutôt que J+1)
            const followed = [...g.items.flatMap(r => (follow.byRelease.get(r.day) || []).map(i => ({ ...i, mep: r.day })))
                .reduce((m, i) => (!m.has(i.id) || i.mep > m.get(i.id).mep ? m.set(i.id, i) : m), new Map()).values()];
            return `<button class="tll-rel${clash.length ? ' is-clash' : ''}${followed.length ? ' is-followed' : ''}" style="left:${g.x}%" ${target({ kind: 'releases', cat: 'livraison', items, clash, followed, title: `Mises en production — ${items.length} créneau${items.length > 1 ? 'x' : ''}`, when: when(g) })} title="${esc(`${items.length} MEP · ${when(g)}${clashTip(clash)}${followed.length ? ` · 🚨 ${followed.length} incident(s) dans les 48 h` : ''}`)}">◆${items.length > 1 ? `<small>${items.length}</small>` : ''}</button>`; }).join('');
        out.push(lane(st, 'livraison', dia || icsEmpty(c, B, 'Aucune MEP sur la période')));
    }
    if (on('operations')) {
        // Opérations d'infrastructure : UN repère par SEMAINE, jamais fusionnées (la fusion « en chaîne »
        // avalait 5 semaines consécutives en un seul repère de 24 opérations) ; nombre DANS le repère ;
        // rouge si au moins une touche la PRODUCTION. Semaines trop proches à cette échelle : 2e rangée.
        const lastX = [-Infinity, -Infinity];
        const weeksOps = [...c.operations.reduce((m, o) => { const w = mondayOf(o.day); (m.get(w) || m.set(w, []).get(w)).push(o); return m; }, new Map())]
            .map(([w, items]) => {
                const x = pct(A, B, addDays(w, 2));
                const row = x - lastX[0] >= OPS_GAP ? 0 : x - lastX[1] >= OPS_GAP ? 1 : 0;
                lastX[row] = x;
                return { w, items, x, row };
            });
        const oneRow = weeksOps.every(o => !o.row);                 // une seule rangée utile : centrée (--row 0.5)
        const ops = weeksOps.map(({ w, items, x, row }) => {
                const n = items.length, prod = items.filter(o => o.prod).length;
                if (oneRow) row = 0.5;
                const when = `semaine du ${fmt(w)}`;
                return `<button class="tll-ops${prod ? ' is-prod' : ''}" style="left:${x}%;--row:${row}" ${target({ kind: 'ops', cat: 'operations', items, title: `${n} ${n > 1 ? 'opérations' : 'opération'}${prod ? ` dont ${prod} en production` : ''}`, when: `Semaine du ${fmtY(w)}` })} title="${esc(`${n} opération(s)${prod ? `, ${prod} en production` : ''} — ${when}`)}">${n > 1 ? n : '⚙'}</button>`;
            }).join('');
        out.push(lane(st, 'operations', ops || icsEmpty(c, B, st.sources?.has('ops') === false ? 'Source « Opérations » masquée (Sources d’agenda)' : 'Aucune opération planifiée sur la période')));
    }
    if (on('equipe') && c.moves.length > 14) {
        // Beaucoup de mouvements (vue Train) : comptes regroupés — 56 prénoms se chevauchaient 289 fois
        const mk = rows(cluster(c.moves, A, B, 3.2), A, B, 11).map(g => {
            const n = k => g.items.filter(m => k.includes(m.kind)).length;
            const [i, o, v] = [n(['in']), n(['out']), n(['move-in', 'move-out'])];
            return `<button class="tll-mgroup" style="left:${g.x}%;--row:${g.row}" ${target({ kind: 'moves', cat: 'equipe', moves: g.items, title: `${g.items.length} mouvement${g.items.length > 1 ? 's' : ''}`, when: when(g) })}
                title="${esc(`${when(g)} : ${i} arrivée(s), ${o} départ(s), ${v} mobilité(s)`)}">${i ? `<b class="is-in">▲ ${i}</b>` : ''}${o ? `<b class="is-out">▼ ${o}</b>` : ''}${v ? `<b class="is-move">⇄ ${v}</b>` : ''}</button>`;
        }).join('');
        out.push(lane(st, 'equipe', mk, 'tll-lane--tall'));
    } else if (on('equipe')) {
        const mk = rows(c.moves, A, B).map(m => {
            const k = MOVE[m.kind];
            const sub = m.kind === 'move-in' ? ` ← ${m.from}` : m.kind === 'move-out' ? ` → ${m.to}` : '';
            return `<button class="tll-move ${k.cls}${m.precise ? '' : ' is-approx'}${m.conflict ? ' is-conflict' : ''}" style="left:${m.x}%;--row:${m.row}"
                ${target({ kind: 'move', cat: 'equipe', move: m, title: `${k.label} — ${m.who}`, when: m.precise ? fmt(m.day) : `Début du PI ${m.pi} (${fmt(m.day)})` })}
                title="${esc(`${k.label} : ${m.who}${sub}${m.precise ? '' : ' — au changement de PI'}`)}"><i>${k.sym}</i><span>${esc(shortName(m.who))}${esc(sub)}</span></button>`;
        }).join('');
        out.push(lane(st, 'equipe', mk || empty('Aucune arrivée ni départ sur la période'), 'tll-lane--tall'));
    }
    if (on('oneonone')) {
        // 1v1 regroupés selon l'échelle (Fuego : une vingtaine par mois) ; la fiche liste les binômes
        // Passés (pleins) et planifiés (creux) regroupés séparément : un groupe ne mélange jamais les deux
        const today = timelineToday();
        const dot = (g, planned) => `<button class="tll-one${planned ? ' is-planned' : ''}" style="left:${g.x}%;--n:${Math.min(g.items.length, 8)}" ${target({ kind: 'ones', cat: 'oneonone', items: g.items, title: `${g.items.length} 1v1${planned ? ' planifié' + (g.items.length > 1 ? 's' : '') : ''}`, when: when(g) })} title="${esc(`${g.items.length} 1v1${planned ? ' planifié(s)' : ''} — ${when(g)}`)}">${g.items.length > 1 ? g.items.length : ''}</button>`;
        const dots = cluster(c.ones.filter(o => o.day <= today), A, B, 1.6).map(g => dot(g, false)).join('')
            + cluster(c.ones.filter(o => o.day > today), A, B, 1.6).map(g => dot(g, true)).join('');
        out.push(lane(st, 'oneonone', dots || icsEmpty(c, B, 'Aucun 1v1 dans l’agenda de l’équipe sur la période')));
    }
    if (on('charge')) {
        // Charge support : une barre par semaine, hauteur ∝ au maximum de la période ; plein = tickets
        // Support créés, hachuré = tâches du ticket de suivi du PI (« Paillettes support »)
        const max = Math.max(1, ...c.support.map(w => w.tickets.length + w.tasks.length));
        const bars = c.support.filter(w => w.tickets.length + w.tasks.length).map(w => {
            const n = w.tickets.length + w.tasks.length, brd = w.tickets.filter(t => t.boarding).length;
            // Point rouge : au moins une tâche du suivi traîne depuis 3 semaines ou plus
            const stale = w.tasks.filter(k => k.streak >= STALE_WEEKS);
            return `<button class="tll-sup${stale.length ? ' is-stale' : ''}" style="${span(A, B, w.week, addDays(w.week, 5))};--h:${Math.round(n / max * 100)}" ${target({ kind: 'support', cat: 'charge', week: w, title: `Support — ${n} élément${n > 1 ? 's' : ''}`, when: `Semaine du ${fmtY(w.week)}` })}
                title="${esc(`Semaine du ${fmtY(w.week)} : ${w.tickets.length - brd} demande(s) Support, ${brd} check-list(s) on/offboarding, ${w.tasks.length} tâche(s) du suivi${w.tasks.some(k => k.streak > 1) ? ` dont ${w.tasks.filter(k => k.streak > 1).length} reportée(s)` : ''}${stale.length ? ` — ⚠️ ${stale.length} depuis ${STALE_WEEKS} semaines ou plus` : ''}`)}"><small>${stale.length ? '<i class="tll-sup-dot" aria-hidden="true"></i>' : ''}${n}</small><span class="tll-sup-bar"><i class="tll-sup-tasks" style="flex:${w.tasks.length}"></i><b class="tll-sup-brd" style="flex:${brd}"></b><b class="tll-sup-tix" style="flex:${w.tickets.length - brd}"></b></span></button>`;
        }).join('');
        out.push(lane(st, 'charge', bars || empty('Aucun ticket Support sur la période')));
    }
    if (on('fait')) {
        const fx = c.facts.filter(f => f.type !== 'incident').map(f => fact(target, f, A, B)).join('');
        out.push(lane(st, 'fait', fx || empty('Aucun fait saisi — « ＋ Fait marquant » en haut à droite')));
    }
    return out.join('');
}

/** Mini-carte de toute la fenêtre + fenêtre A → B déplaçable / redimensionnable. */
function brush(st) {
    const [W0, W1] = timelineWindow();
    const all = overview(st.scope === 'train' ? '*' : st.team);
    const heat = all.presence.filter(s => s.pct !== null).map(s => `<i data-l="${presenceLevel(s.pct)}" style="${span(W0, W1, s.week, addDays(s.week, 6))}"></i>`).join('');
    const inc = all.incidents.map(x => `<b style="left:${pct(W0, W1, x.day)}%"></b>`).join('');
    const l = pct(W0, W1, st.A), r = pct(W0, W1, st.B);
    const months = [];
    // Un mois tous les deux ; pas trop près du bord droit (« novembre » débordait de 4 px à 390 px)
    for (let d = `${W0.slice(0, 7)}-01`; d <= W1; d = addDays(`${d.slice(0, 7)}-01`, 62).slice(0, 7) + '-01') if (d >= W0 && pct(W0, W1, d) <= 88) months.push(d);
    return `<div class="tll-brush" data-brush aria-label="Choisir la période en faisant glisser la fenêtre">
        <div class="tll-brush-heat">${heat}</div><div class="tll-brush-inc">${inc}</div>
        <div class="tll-brush-win" data-win style="left:${l}%;width:${r - l}%">
            <span class="tll-handle" data-h="A" role="slider" aria-label="Début de la période" aria-valuetext="${fmt(st.A)}" tabindex="0"></span>
            <span class="tll-handle" data-h="B" role="slider" aria-label="Fin de la période" aria-valuetext="${fmt(st.B)}" tabindex="0"></span>
        </div>
        <div class="tll-brush-axis">${months.map((d, i) => `<span style="left:${pct(W0, W1, d)}%">${monthLabel(d, !i)}</span>`).join('')}</div>
    </div>`;
}

/** `opts.brush === false` : sans mini-carte (export image). */
export function lanesHtml(st, c, target, opts = {}) {
    const today = timelineToday();
    const now = today >= st.A && today <= st.B ? `<div class="tll-today" style="left:${pct(st.A, st.B, today)}%"><span>aujourd’hui</span></div>` : '';
    return `<div class="tll">
        <div class="tll-scroll"><div class="tll-grid">
            <div class="tll-row tll-row--axis"><div class="tll-label"></div><div class="tll-track">${axis(st.A, st.B)}${now}</div></div>
            ${lanes(st, c, target)}
        </div></div>
        ${opts.brush === false ? '' : brush(st)}
    </div>`;
}

/** Glisser la fenêtre (déplacer) ou une poignée (redimensionner) ; clavier : ← → sur les poignées. */
/** Clavier : UN arrêt Tab par couloir (« roving tabindex », ARIA APG), puis ← → entre ses repères dans
 *  l'ordre du temps, Début / Fin pour le premier / le dernier. Sans ça, un PI chargé imposait des
 *  dizaines de Tab pour traverser la frise. */
function wireRoving(el) {
    el.querySelectorAll('.tll-row[data-c] .tll-track').forEach(track => {
        const items = [...track.querySelectorAll('[data-i]')]
            .sort((a, b) => (parseFloat(a.style.left) || 0) - (parseFloat(b.style.left) || 0));
        if (!items.length) return;
        items.forEach((x, i) => { x.tabIndex = i ? -1 : 0; });
        track.addEventListener('keydown', e => {
            const i = items.indexOf(document.activeElement);
            if (i < 0) return;
            const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
            if (j === undefined || j < 0 || j >= items.length) return;
            e.preventDefault();
            items[i].tabIndex = -1; items[j].tabIndex = 0; items[j].focus();
        });
    });
}

export function wireLanes(el, st, rerender) {
    wireRoving(el);
    const b = el.querySelector('[data-brush]'), win = el.querySelector('[data-win]');
    if (!b) return;
    const [W0, W1] = timelineWindow(), total = diff(W0, W1);
    const dayAt = x => addDays(W0, Math.round(Math.max(0, Math.min(1, x)) * total));
    let drag = null;
    b.addEventListener('pointerdown', e => {
        const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
        const h = e.target.closest('[data-h]')?.dataset.h;
        drag = { h: h || (e.target.closest('[data-win]') ? 'move' : 'jump'), x0: x, A: st.A, B: st.B, r };
        if (drag.h === 'jump') {                                   // clic hors fenêtre : on la centre là
            const half = Math.round(diff(st.A, st.B) / 2), mid = dayAt(x);
            st.A = addDays(mid, -half); st.B = addDays(mid, half); drag.A = st.A; drag.B = st.B; drag.h = 'move';
        }
        b.setPointerCapture(e.pointerId); e.preventDefault();
    });
    b.addEventListener('pointermove', e => {
        if (!drag) return;
        const x = (e.clientX - drag.r.left) / drag.r.width, dd = Math.round((x - drag.x0) * total);
        if (drag.h === 'A') st.A = [dayAt(x), addDays(st.B, -7)].sort()[0];
        else if (drag.h === 'B') st.B = [dayAt(x), addDays(st.A, 7)].sort()[1];
        else {
            const len = diff(drag.A, drag.B);
            let a = addDays(drag.A, dd);
            if (a < W0) a = W0;
            if (addDays(a, len) > W1) a = addDays(W1, -len);
            st.A = a; st.B = addDays(a, len);
        }
        win.style.left = `${pct(W0, W1, st.A)}%`; win.style.width = `${pct(W0, W1, st.B) - pct(W0, W1, st.A)}%`;
    });
    const end = () => { if (drag) { drag = null; rerender(); } };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    el.querySelectorAll('[data-h]').forEach(h => h.addEventListener('keydown', e => {
        const step = { ArrowLeft: -7, ArrowRight: 7 }[e.key];
        if (!step) return;
        e.preventDefault();
        if (h.dataset.h === 'A') st.A = [addDays(st.A, step), addDays(st.B, -7)].sort()[0];
        else st.B = [addDays(st.B, step), addDays(st.A, 7)].sort()[1];
        rerender();
        el.querySelector(`[data-h="${h.dataset.h}"]`)?.focus();
    }));
}
