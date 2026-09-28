/* Direction B — « Couloirs » : frise ressources (une ligne par équipe × une colonne par jour).
 * Parti pris : la comparaison d'abord — les cérémonies s'alignent verticalement d'une équipe
 * à l'autre. Survoler un évènement met en évidence la même nature dans toutes les équipes.
 * Mobile (≤ 640 px) : jour par jour, une section par équipe.
 */
(function () {
    'use strict';
    const T = window.TC, C = T.C, esc = T.esc;
    const mobile = () => window.matchMedia('(max-width: 640px)').matches;

    // Nom AU-DESSUS (toute la largeur de la colonne, 2 lignes au besoin), heure dessous en petit.
    // L'ancienne disposition « heure + emoji + titre » sur une ligne laissait ~3 caractères (mesuré).
    const pill = e => `<button class="tc-ev tcl-pill${e.corrected ? ' is-corrected' : ''}" data-id="${esc(e.id)}" data-k="${e.kind}" title="${esc(`${C.NATURES[e.kind].emoji} ${e.title} · ${T.hhmm(e.startMin)}–${T.hhmm(e.endMin)}`)}">
        <span class="tcl-name">${esc(T.shortTitle(e.title, e.team))}</span><span class="tcl-time">${T.hhmm(e.startMin)}</span></button>`;
    const tag = e => `<button class="tc-tag tc-ev" data-id="${esc(e.id)}" data-k="${e.kind}" title="${esc(e.title)}">${C.NATURES[e.kind].emoji} ${esc(e.person || e.title)}</button>`;

    // Priorité d'affichage quand une case est plafonnée : les jalons d'abord
    const RANK = { planning: 0, demo: 1, retro: 2, train: 3, affinage: 4, support: 5, community: 6, daily: 7, release: 8, sync: 9, focus: 10, other: 11, busy: 12, off: 13 };

    /** Contenu d'une cellule (équipe × jour) : journées entières puis réunions dans l'ordre.
     *  `cap` (comparaison) : au plus N évènements, les plus importants, puis « + N autres » qui
     *  déplie la case — titres lisibles EN ENTIER sans que 3 équipes fassent 2 200 px de haut. */
    function cell(evs, day, cap, key, open) {
        const all = evs.filter(e => T.covers(e, day));
        let timed = evs.filter(e => !e.allDay && e.day === day).sort((a, b) => a.startMin - b.startMin);
        let more = '';
        if (cap && !open && timed.length > cap + 1) {
            const keep = new Set([...timed].sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || a.startMin - b.startMin).slice(0, cap));
            more = `<button class="tcl-more" data-expand="${esc(key)}" aria-expanded="false">+ ${timed.length - cap} autres</button>`;
            timed = timed.filter(e => keep.has(e));
        } else if (cap && open) {
            more = `<button class="tcl-more" data-expand="${esc(key)}" aria-expanded="true">Replier</button>`;
        }
        return `${all.length ? `<div class="tc-allday">${all.map(tag).join('')}</div>` : ''}${timed.map(pill).join('')}${more}`;
    }

    function meetingMin(evs, days) { return T.load(evs, days).total; }

    /** Rituels quotidiens (même titre court, même heure, ≥ 60 % des jours et au moins 3) : affichés
     *  UNE fois dans l'en-tête de ligne au lieu d'occuper une ligne dans chaque case — « Daily ·
     *  9h45 · 9/10 j » plutôt que dix fois « Daily ». Les autres évènements restent dans les cases. */
    function splitRecurring(evs, days) {
        const groups = new Map();
        for (const e of evs) {
            if (e.allDay) continue;
            const k = `${T.C.norm(T.shortTitle(e.title, e.team))}|${e.startMin}|${e.endMin}`;
            (groups.get(k) || groups.set(k, []).get(k)).push(e);
        }
        const min = Math.max(3, Math.ceil(days.length * 0.6));
        const recurring = [], drop = new Set();
        for (const g of groups.values()) {
            const n = new Set(g.map(e => e.day)).size;
            if (n >= min) { recurring.push({ first: g[0], days: n }); g.forEach(e => drop.add(e)); }
        }
        recurring.sort((a, b) => a.first.startMin - b.first.startMin);
        return { recurring, rest: evs.filter(e => !drop.has(e)) };
    }

    function desktop(st, p, lanes, byLane) {
        const weeks = new Set();
        // Synthèse (D) : l'en-tête d'un jour ouvre SA semaine en grille horaire ; la semaine de
        // l'ancre est encadrée — on voit d'avance ce que le zoom va montrer.
        const zoom = st.dir === 'hybrid';
        const focusMon = T.mondayOf(st.anchor);
        const head = p.days.map((d, i) => {
            const newWeek = i > 0 && T.mondayOf(d) !== T.mondayOf(p.days[i - 1]);
            if (newWeek) weeks.add(d);
            const cls = `tcl-dayhead${d === T.D.today ? ' is-today' : ''}${newWeek ? ' is-week' : ''}${zoom && T.mondayOf(d) === focusMon ? ' is-focus' : ''}`;
            const inner = `<span>${T.DAY[T.dow(d)]}</span><b>${+d.slice(8, 10)}</b>`;
            return zoom
                ? `<button class="${cls}" data-zoom="${d}" title="Ouvrir la semaine du ${T.fmtDate(T.mondayOf(d))} en grille horaire">${inner}<i aria-hidden="true">🔍</i></button>`
                : `<div class="${cls}">${inner}</div>`;
        }).join('');
        const rows = lanes.map(l => {
            const all = byLane[l.key] || [];
            const m = l.common ? null : meetingMin(all, p.days);
            const { recurring, rest } = splitRecurring(all, p.days);
            return `<div class="tcl-rowhead${l.me ? ' is-me' : ''}${l.common ? ' is-common' : ''}" style="--team:${l.color}">
                    <b>${esc(l.label)}</b>${m !== null ? `<span>${T.durLabel(Math.round(m))} de réunions</span>` : '<span>une seule fois pour toutes</span>'}
                    ${recurring.map(r => `<button class="tc-ev tcl-rec" data-id="${esc(r.first.id)}" data-k="${r.first.kind}" title="${esc(`${r.first.title} — ${r.days} jours sur ${p.days.length}, retiré des cases`)}">
                        <span class="tcl-name">${esc(T.shortTitle(r.first.title, r.first.team))}</span><span class="tcl-time">${T.hhmm(r.first.startMin)} · ${r.days}/${p.days.length} j</span></button>`).join('')}
                </div>
                ${p.days.map(d => `<div class="tcl-cell${d === T.D.today ? ' is-today' : ''}${weeks.has(d) ? ' is-week' : ''}${l.common ? ' is-common' : ''}${zoom && T.mondayOf(d) === focusMon ? ' is-focus' : ''}" style="--team:${l.color}">${cell(rest, d, lanes.length > 2 ? 3 : 0, `${l.key}|${d}`, (st.expanded || new Set()).has(`${l.key}|${d}`))}</div>`).join('')}`;
        }).join('');
        return `<div class="tcl-scroll"><div class="tcl" style="--days:${p.days.length}">
            <div class="tcl-corner"></div>${head}${rows}
        </div></div>`;
    }

    /** Mobile : UN jour à la fois (sélecteur de jours), une section par équipe. La liste de tous
     *  les jours faisait 3 713 px de haut seule, 9 689 px en comparant 3 équipes (mesuré). */
    function phone(st, p, lanes, byLane) {
        const d = p.days.includes(st.mDay) ? st.mDay : (p.days.includes(T.D.today) ? T.D.today : p.days[0]);
        st.mDay = d;
        const strip = p.days.map(x => `<button class="tc-pick${x === d ? ' is-on' : ''}${x === T.D.today ? ' is-today' : ''}" data-mday="${x}">
            <span>${T.DAY[T.dow(x)]}</span><b>${+x.slice(8, 10)}</b></button>`).join('');
        const sections = lanes.map(l => {
            const html = cell(byLane[l.key] || [], d);
            return html ? `<div class="tcl-msec" style="--team:${l.color}"><h6>${esc(l.label)}</h6>${html}</div>` : '';
        }).join('');
        return `<div class="tcl-list">
            <div class="tc-strip" style="--n:${p.days.length}">${strip}</div>
            <section class="tcl-mday${d === T.D.today ? ' is-today' : ''}">
                <header><b>${T.fmtLong(d)}</b>${d === T.D.today ? '<span>Aujourd’hui</span>' : ''}</header>
                ${sections || '<p class="tcl-free">Journée sans réunion</p>'}
            </section>
        </div>`;
    }

    window.TCViews = window.TCViews || {};
    window.TCViews.lanes = {
        html: (st, p, lanes, byLane) => (mobile() ? phone : desktop)(st, p, lanes, byLane),
        after(el, st) {
            el.querySelectorAll('[data-mday]').forEach(b => b.addEventListener('click', () => { st.mDay = b.dataset.mday; window.TCApp.render(el, st); }));
            el.querySelectorAll('[data-expand]').forEach(b => b.addEventListener('click', () => {
                st.expanded = st.expanded || new Set();
                const k = b.dataset.expand;
                st.expanded.has(k) ? st.expanded.delete(k) : st.expanded.add(k);
                window.TCApp.render(el, st);
                el.querySelector(`[data-expand="${CSS.escape(k)}"]`)?.focus();
            }));
            // Survol d'un évènement : même nature mise en évidence dans toutes les équipes
            const grid = el.querySelector('.tcl');
            if (!grid) return;
            grid.addEventListener('mouseover', e => { const b = e.target.closest('.tc-ev'); grid.dataset.hl = b ? b.dataset.k : ''; });
            grid.addEventListener('mouseleave', () => { grid.dataset.hl = ''; });
        },
    };
})();
