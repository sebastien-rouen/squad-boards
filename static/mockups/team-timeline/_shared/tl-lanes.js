/* Frise 1 — « Couloirs du temps » : un axe horizontal A → B, une ligne par thème, alignées.
 * Parti pris : voir les CORRÉLATIONS d'un coup d'œil (un pic d'incidents pendant les congés d'été,
 * une vague d'arrivées au changement de PI). Mini-carte de toute l'année en dessous, fenêtre A → B
 * à faire glisser (motif des outils de supervision). Mobile : piste défilante, libellés collants.
 */
(function () {
    'use strict';
    const T = window.TL, esc = T.esc;
    const target = (st, it) => window.TLApp.target(st, it);
    const pct = (A, B, d) => Math.max(0, Math.min(100, T.diff(A, d) / Math.max(1, T.diff(A, B)) * 100));
    const span = (A, B, s, e) => { const l = pct(A, B, s < A ? A : s), r = pct(A, B, e > B ? B : e); return `left:${l}%;width:${Math.max(0.6, r - l)}%`; };
    const MOVE = {
        in:         { sym: '▲', cls: 'is-in',   label: 'Arrivée' },
        out:        { sym: '▼', cls: 'is-out',  label: 'Départ' },
        'move-in':  { sym: '⇄', cls: 'is-move', label: 'Mobilité (arrivée)' },
        'move-out': { sym: '⇄', cls: 'is-move', label: 'Mobilité (départ)' },
    };

    function axis(A, B) {
        const ticks = [];
        for (let d = `${A.slice(0, 7)}-01`; d <= B; d = T.addDays(`${d.slice(0, 7)}-01`, 32).slice(0, 7) + '-01') {
            if (d >= A) ticks.push(`<span class="tll-month" style="left:${pct(A, B, d)}%">${T.monthName(d).split(' ')[0]}</span>`);
        }
        return `<div class="tll-axis">${ticks.join('')}</div>`;
    }

    /** Regroupe les marqueurs trop proches À CETTE ÉCHELLE (sinon ils se couvrent : les 3 jalons des
     *  31/08, 01/09 et 03/09 n'étaient plus cliquables sur 6 mois — mesuré). Seuil relatif à la
     *  période : au zoom (Été, un PI), ils se séparent d'eux-mêmes. */
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
    const when = g => g.day === g.lastDay ? T.fmt(g.day) : `${T.fmt(g.day)} → ${T.fmt(g.lastDay)}`;

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

    function lanes(st, c) {
        const { A, B } = st, on = k => st.cats.has(k), out = [];
        if (on('rythme')) {
            const pis = c.pis.map(p => `<div class="tll-pi" style="${span(A, B, p.start, p.end)}"><span>PI ${p.n}</span></div>`).join('');
            const spr = c.sprints.map(s => `<div class="tll-sprint" style="${span(A, B, s.start, s.end)}" title="Sprint ${esc(s.label)} · ${T.fmt(s.start)} → ${T.fmt(s.end)}"><span>${esc(s.label)}</span></div>`).join('');
            const mil = cluster(c.milestones, A, B).map(g => `<button class="tll-flag" style="left:${g.x}%" ${target(st, { kind: 'milestone', cat: 'rythme', title: g.items.map(m => m.title.replace(/^ERPC - /, '')).join(' · '), when: when(g) })} title="${esc(g.items.map(m => `${T.fmtShort(m.day)} ${m.title}`).join(' · '))}">🚩${g.items.length > 1 ? `<small>${g.items.length}</small>` : ''}</button>`).join('');
            out.push(lane('rythme', `${pis}<div class="tll-sprints">${spr}</div>${mil}`));
        }
        if (on('presence')) {
            // Vert = 100 % présents, orange = 75 à 99 %, rouge = moins de 75 % (TL.presenceLevel)
            const cells = c.presence.filter(s => s.pct !== null).map(s => `<div class="tll-heat" data-l="${T.presenceLevel(s.pct)}" style="${span(A, B, s.week, T.addDays(s.week, 6))}" title="Semaine du ${T.fmt(s.week)} : ${100 - s.pct} % présents (${s.pct} % d'absence)"></div>`).join('');
            // Libellé court quand la période est étroite à cette échelle (jamais coupé : fiche au clic)
            const low = c.low.map(p => { const w = pct(A, B, p.end) - pct(A, B, p.start);
                return `<button class="tll-low" style="${span(A, B, p.start, p.end)}" ${target(st, { kind: 'low', cat: 'presence', low: p, title: `${p.label} — pic ${p.peak} %`, when: `${T.fmt(p.start)} → ${T.fmt(p.end)}` })} title="${esc(`${p.label} · pic ${p.peak} %`)}"><span>🏖️ ${w > 17 ? `${esc(p.label)} · pic ${p.peak} %` : w > 8 ? `pic ${p.peak} %` : `${p.peak} %`}</span></button>`; }).join('');
            out.push(lane('presence', `<div class="tll-heats">${cells}</div>${low}`));
        }
        if (on('production')) {
            const dots = cluster(c.incidents, A, B, 1.8).map(g => { const items = g.items.flatMap(x => x.items), n = items.length;
                return `<button class="tll-inc" style="left:${g.x}%;--n:${Math.min(n, 8)}" ${target(st, { kind: 'incidents', cat: 'production', items, title: `${n} incident${n > 1 ? 's' : ''} de production`, when: when(g) })} title="${n} incident(s) — ${when(g)}">${n > 1 ? n : ''}</button>`; }).join('');
            const fx = c.facts.filter(f => f.type === 'incident').map(f => fact(st, f, A, B)).join('');
            out.push(lane('production', dots + fx || empty('Aucun incident de production sur la période')));
        }
        if (on('livraison')) {
            const dia = cluster(c.releases, A, B, 1.8).map(g => { const items = g.items.flatMap(r => r.items);
                return `<button class="tll-rel" style="left:${g.x}%" ${target(st, { kind: 'releases', cat: 'livraison', items, title: `Mises en production — ${items.length} créneau${items.length > 1 ? 'x' : ''}`, when: when(g) })} title="${items.length} MEP · ${when(g)}">◆${items.length > 1 ? `<small>${items.length}</small>` : ''}</button>`; }).join('');
            out.push(lane('livraison', dia || empty(c.icsFrom && B < c.icsFrom ? 'Agendas ICS disponibles à partir du ' + T.fmt(c.icsFrom) : 'Aucune MEP sur la période')));
        }
        if (on('equipe') && c.moves.length > 14) {
            // Beaucoup de mouvements (vue Train) : comptes regroupés par proximité — 56 prénoms
            // se chevauchaient 289 fois (mesuré) ; les noms sont dans la fiche
            const mk = rows(cluster(c.moves, A, B, 3.2), A, B, 11).map(g => {   // + étalement en rangées
                const n = k => g.items.filter(m => k.includes(m.kind)).length;
                const [i, o, v] = [n(['in']), n(['out']), n(['move-in', 'move-out'])];
                return `<button class="tll-mgroup" style="left:${g.x}%;--row:${g.row}" ${target(st, { kind: 'moves', cat: 'equipe', moves: g.items, title: `${g.items.length} mouvement${g.items.length > 1 ? 's' : ''}`, when: when(g) })}
                    title="${esc(`${when(g)} : ${i} arrivée(s), ${o} départ(s), ${v} mobilité(s)`)}">${i ? `<b class="is-in">▲ ${i}</b>` : ''}${o ? `<b class="is-out">▼ ${o}</b>` : ''}${v ? `<b class="is-move">⇄ ${v}</b>` : ''}</button>`;
            }).join('');
            out.push(lane('equipe', mk, 'tll-lane--tall'));
        } else if (on('equipe')) {
            const mk = rows(c.moves, A, B).map(m => {
                const k = MOVE[m.kind];
                const who = T.shortName(m.who);
                const sub = m.kind === 'move-in' ? ` ← ${m.from}` : m.kind === 'move-out' ? ` → ${m.to}` : '';
                return `<button class="tll-move ${k.cls}${m.precise ? '' : ' is-approx'}${m.conflict ? ' is-conflict' : ''}" style="left:${m.x}%;--row:${m.row}"
                    ${target(st, { kind: 'move', cat: 'equipe', move: m, title: `${k.label} — ${m.who}`, when: m.precise ? T.fmt(m.day) : `Début du PI ${m.pi} (${T.fmt(m.day)})` })}
                    title="${esc(`${k.label} : ${m.who}${sub}${m.precise ? '' : ' — au changement de PI'}`)}"><i>${k.sym}</i><span>${esc(who)}${esc(sub)}</span></button>`;
            }).join('');
            out.push(lane('equipe', mk || empty('Aucune arrivée ni départ sur la période'), 'tll-lane--tall'));
        }
        if (on('oneonone')) {
            // 1v1 regroupés selon l'échelle (Fuego : 68 en 3 mois) ; la fiche liste les binômes
            const dots = cluster(c.ones, A, B, 1.6).map(g => `<button class="tll-one" style="left:${g.x}%;--n:${Math.min(g.items.length, 8)}" ${target(st, { kind: 'ones', cat: 'oneonone', items: g.items, title: `${g.items.length} 1v1`, when: when(g) })} title="${esc(`${g.items.length} 1v1 — ${when(g)}`)}">${g.items.length > 1 ? g.items.length : ''}</button>`).join('');
            out.push(lane('oneonone', dots || empty(c.icsFrom && B < c.icsFrom ? 'Agendas ICS disponibles à partir du ' + T.fmt(c.icsFrom) : 'Aucun 1v1 dans l’agenda de l’équipe sur la période')));
        }
        if (on('fait')) {
            const fx = c.facts.filter(f => f.type !== 'incident').map(f => fact(st, f, A, B)).join('');
            out.push(lane('fait', fx || empty('Aucun fait saisi — « ＋ Fait marquant » en haut à droite')));
        }
        return out.join('');
    }

    function fact(st, f, A, B) {
        const t = T.FACT_TYPES[f.type] || T.FACT_TYPES.autre;
        return `<button class="tll-fact tll-fact--${f.type}" style="${span(A, B, f.start, f.end)}" ${target(st, { kind: 'fact', cat: f.type === 'incident' ? 'production' : 'fait', fact: f, title: `${t.emoji} ${f.title}`, when: f.start === f.end ? T.fmt(f.start) : `${T.fmt(f.start)} → ${T.fmt(f.end)}` })} title="${esc(f.title)}"><span>${t.emoji} ${esc(f.title)}</span></button>`;
    }
    const empty = msg => `<span class="tll-empty">${esc(msg)}</span>`;
    const lane = (cat, inner, extra = '') => `<div class="tll-row ${extra}" data-c="${cat}">
        <div class="tll-label">${T.CATS[cat].emoji} ${esc(T.CATS[cat].label)}</div><div class="tll-track">${inner}</div></div>`;

    /** Mini-carte de toute la fenêtre de données + fenêtre A → B déplaçable/redimensionnable. */
    function brush(st) {
        const [W0, W1] = T.D.window;
        const team = st.scope === 'train' ? '*' : st.team;
        const all = T.collect(team, W0, W1, st.seed);
        const heat = all.presence.filter(s => s.pct !== null).map(s => `<i data-l="${T.presenceLevel(s.pct)}" style="${span(W0, W1, s.week, T.addDays(s.week, 6))}"></i>`).join('');
        const inc = all.incidents.map(x => `<b style="left:${pct(W0, W1, x.day)}%"></b>`).join('');
        const l = pct(W0, W1, st.A), r = pct(W0, W1, st.B);
        return `<div class="tll-brush" data-brush aria-label="Choisir la période en faisant glisser la fenêtre">
            <div class="tll-brush-heat">${heat}</div><div class="tll-brush-inc">${inc}</div>
            <div class="tll-brush-win" data-win style="left:${l}%;width:${r - l}%">
                <span class="tll-handle" data-h="A" role="slider" aria-label="Début" aria-valuetext="${T.fmt(st.A)}" tabindex="0"></span>
                <span class="tll-handle" data-h="B" role="slider" aria-label="Fin" aria-valuetext="${T.fmt(st.B)}" tabindex="0"></span>
            </div>
            <div class="tll-brush-axis">${['2026-04-01', '2026-06-01', '2026-08-01', '2026-10-01'].map(d => `<span style="left:${pct(W0, W1, d)}%">${T.monthName(d).split(' ')[0]}</span>`).join('')}</div>
        </div>`;
    }

    function html(st, c) {
        const today = T.D.today >= st.A && T.D.today <= st.B ? `<div class="tll-today" style="left:${pct(st.A, st.B, T.D.today)}%"><span>aujourd’hui</span></div>` : '';
        return `<div class="tll">
            <div class="tll-scroll"><div class="tll-grid">
                <div class="tll-row tll-row--axis"><div class="tll-label"></div><div class="tll-track">${axis(st.A, st.B)}${today}</div></div>
                ${lanes(st, c)}
            </div></div>
            ${brush(st)}
        </div>`;
    }

    /** Glisser la fenêtre (déplacer) ou une poignée (redimensionner) ; clavier : ← → sur les poignées. */
    function after(el, st) {
        const b = el.querySelector('[data-brush]'), win = el.querySelector('[data-win]');
        if (!b) return;
        const [W0, W1] = T.D.window, total = T.diff(W0, W1);
        const dayAt = x => T.addDays(W0, Math.round(Math.max(0, Math.min(1, x)) * total));
        let drag = null;
        b.addEventListener('pointerdown', e => {
            const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
            const h = e.target.closest('[data-h]')?.dataset.h;
            drag = { h: h || (e.target.closest('[data-win]') ? 'move' : 'jump'), x0: x, A: st.A, B: st.B, r };
            if (drag.h === 'jump') {                                   // clic hors fenêtre : on la centre là
                const half = Math.round(T.diff(st.A, st.B) / 2), mid = dayAt(x);
                st.A = T.addDays(mid, -half); st.B = T.addDays(mid, half); drag.A = st.A; drag.B = st.B; drag.h = 'move';
            }
            b.setPointerCapture(e.pointerId); e.preventDefault();
        });
        b.addEventListener('pointermove', e => {
            if (!drag) return;
            const x = (e.clientX - drag.r.left) / drag.r.width, dd = Math.round((x - drag.x0) * total);
            if (drag.h === 'A') st.A = [dayAt(x), T.addDays(st.B, -7)].sort()[0];
            else if (drag.h === 'B') st.B = [dayAt(x), T.addDays(st.A, 7)].sort()[1];
            else { const len = T.diff(drag.A, drag.B); let a = T.addDays(drag.A, dd); if (a < W0) a = W0; if (T.addDays(a, len) > W1) a = T.addDays(W1, -len); st.A = a; st.B = T.addDays(a, len); }
            win.style.left = `${pct(W0, W1, st.A)}%`; win.style.width = `${pct(W0, W1, st.B) - pct(W0, W1, st.A)}%`;
        });
        const end = () => { if (drag) { drag = null; window.TLApp.render(el, st); } };
        b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
        el.querySelectorAll('[data-h]').forEach(h => h.addEventListener('keydown', e => {
            const step = { ArrowLeft: -7, ArrowRight: 7 }[e.key];
            if (!step) return;
            e.preventDefault();
            if (h.dataset.h === 'A') st.A = [T.addDays(st.A, step), T.addDays(st.B, -7)].sort()[0];
            else st.B = [T.addDays(st.B, step), T.addDays(st.A, 7)].sort()[1];
            window.TLApp.render(el, st); el.querySelector(`[data-h="${h.dataset.h}"]`)?.focus();
        }));
    }

    window.TLViews = window.TLViews || {};
    window.TLViews.lanes = { html, after };
})();
