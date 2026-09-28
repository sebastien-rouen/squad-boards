/* Coquille interactive de la carte « Agenda de l'équipe » — commune aux trois directions.
 * En-tête (navigation, période, comparer), filtres, pied (charge, détection, fraîcheur),
 * fiche d'évènement avec « Classer comme… », états. Le corps est délégué à TCViews[dir].
 * Dépend de tc-core.js. Script classique.
 */
(function () {
    'use strict';
    const T = window.TC, C = T.C, esc = T.esc;
    const COMMON = '__common__';                       // couloir « Train & commun » en comparaison
    const DEFAULT_SCOPES = ['team', 'group', 'train'];  // « Opérations » masqué par défaut : bruyant

    /** Période affichée : semaine ouvrée de l'ancre, ou itération JIRA de l'équipe. */
    function period(st) {
        if (st.period === 'iteration') {
            const it = T.iterationOf(st.team, st.anchor);
            if (it) return { label: `Itération ${it.label}`, days: T.workdays(it.start, T.addDays(it.end, -1)), it };
        }
        const mon = T.mondayOf(st.anchor);
        return { label: `Semaine du ${T.fmtDate(mon)}`, days: T.workdays(mon, T.addDays(mon, 4)), it: T.iterationOf(st.team, st.anchor) };
    }

    /** Colonnes/couloirs affichés : l'équipe, les équipes cochées, et « Commun » dès qu'on compare. */
    function lanes(st) {
        const teams = [st.team, ...st.compare];
        const out = teams.map(t => ({ key: t, label: t, color: T.teamColor(t), me: t === st.team }));
        if (st.compare.length) out.push({ key: COMMON, label: 'Train & commun', color: 'var(--text-muted)', common: true });
        return out;
    }

    /** Évènements visibles, rangés par couloir. En comparaison, train/ops ne sont dessinés qu'UNE fois. */
    function visible(st, days) {
        const first = days[0], last = days[days.length - 1];
        const inRange = e => e.allDay ? (e.day <= last && e.end.slice(0, 10) > first) : (e.day >= first && e.day <= last);
        const keep = e => st.kinds.has(e.kind) && st.scopes.has(e.scope) && inRange(e);
        const byLane = {};
        const shared = new Map();
        for (const t of [st.team, ...st.compare]) {
            byLane[t] = [];
            for (const e of T.eventsFor(t)) {
                if (!keep(e)) continue;
                if (st.compare.length && (e.scope === 'train' || e.scope === 'ops')) {
                    shared.set(`${e.title}|${e.start}`, { ...e, team: COMMON });
                } else byLane[t].push(e);
            }
        }
        if (st.compare.length) byLane[COMMON] = [...shared.values()];
        return byLane;
    }

    // ── Rendu de la carte ───────────────────────────────────────────────────────
    function render(el, st) {
        const p = period(st);
        const byLane = visible(st, p.days);
        const mine = T.eventsFor(st.team);
        const counts = {};
        for (const e of mine) if (p.days.includes(e.day)) counts[e.kind] = (counts[e.kind] || 0) + 1;
        const view = window.TCViews[st.dir];
        // « périmé » n'est PAS un état bloquant : on montre ce qu'on a, avec un bandeau
        const blocking = ['noical', 'empty', 'error', 'loading'].includes(st.state);
        const body = blocking ? stateHtml(st) : view.html(st, p, lanes(st), byLane);

        el.innerHTML = `
        <section class="card tc-card tc-dir-${st.dir}" style="--team:${T.teamColor(st.team)}">
            <header class="tc-head">
                <div class="tc-title">
                    <strong>📅 Agenda de l'équipe</strong>
                    <span class="tc-sub">${esc(p.label)}${p.it ? ` · ${esc(p.it.label)} du ${T.fmtDate(p.it.start)} au ${T.fmtDate(T.addDays(p.it.end, -1))}` : ''}</span>
                </div>
                <div class="tc-nav" role="group" aria-label="Naviguer">
                    <button class="tc-iconbtn" data-act="prev" aria-label="Période précédente">‹</button>
                    <button class="tc-today" data-act="today">Aujourd'hui</button>
                    <button class="tc-iconbtn" data-act="next" aria-label="Période suivante">›</button>
                </div>
                <div class="tc-seg" role="group" aria-label="Période">
                    <button data-period="week" aria-pressed="${st.period === 'week'}">Semaine</button>
                    <button data-period="iteration" aria-pressed="${st.period === 'iteration'}">Itération</button>
                </div>
                <div class="tc-compare">
                    <button data-act="compare" aria-haspopup="true" aria-expanded="${!!st.popOpen}">
                        ⇄ Comparer ${st.compare.length ? `<span class="tc-count">${st.compare.length}</span>` : ''}
                    </button>
                    ${comparePop(st)}
                </div>
            </header>
            ${st.compare.length ? `<div class="tc-compared">${lanes(st).filter(l => !l.common).map(l => `
                <span class="tc-team-pill${l.me ? ' tc-team-pill--me' : ''}" style="--team:${l.color}">${esc(l.label)}${l.me ? '' : `<button data-remove="${esc(l.key)}" aria-label="Retirer ${esc(l.label)}">×</button>`}</span>`).join('')}</div>` : ''}
            ${st.banner ? bannerHtml(st) : ''}
            <div class="tc-filters" role="group" aria-label="Filtrer">
                ${Object.entries(C.NATURES).filter(([k]) => counts[k] || !st.kinds.has(k)).map(([k, n]) => `
                    <button class="tc-chip" data-k="${k}" data-kind="${k}" aria-pressed="${st.kinds.has(k)}" title="${esc(n.label)}">${n.emoji} ${esc(n.label)} <b>${counts[k] || 0}</b></button>`).join('')}
                <span class="tc-sep" aria-hidden="true"></span>
                ${Object.entries(C.SCOPES).map(([k, s]) => `
                    <button class="tc-chip tc-chip--scope" data-scope="${k}" aria-pressed="${st.scopes.has(k)}">${s.icon} ${esc(s.label)}</button>`).join('')}
            </div>
            <div class="tc-body">${body}${detailHtml(st)}</div>
            ${footHtml(st, p, mine)}
        </section>`;
        if (view.after) view.after(el, st);
        wire(el, st);
    }

    function comparePop(st) {
        const others = T.D.teams.filter(t => t.name !== st.team);
        return `<div class="tc-pop" ${st.popOpen ? '' : 'hidden'} role="dialog" aria-label="Comparer avec d'autres équipes">
            <div class="tc-pop-title">Comparer avec</div>
            <input class="tc-pop-search" type="search" placeholder="Filtrer les équipes…" aria-label="Filtrer les équipes">
            ${others.map(t => {
                const on = st.compare.includes(t.name);
                const full = !on && st.compare.length >= 3;
                const n = T.eventsFor(t.name).filter(e => e.scope === 'team').length;
                return `<label class="tc-check" style="--team:${t.color}"${full ? ' aria-disabled="true" title="3 équipes au plus : au-delà, la grille devient illisible"' : ''}>
                    <input type="checkbox" data-cmp="${esc(t.name)}" ${on ? 'checked' : ''} ${full ? 'disabled' : ''}>
                    <span class="tc-box" aria-hidden="true"></span>${esc(t.name)}<span class="tc-meta">${n ? `${n} évts` : 'sans agenda'}</span>
                </label>`;
            }).join('')}
        </div>`;
    }

    function footHtml(st, p, mine) {
        const inP = mine.filter(e => p.days.includes(e.day));
        const L = T.load(inP.filter(e => st.scopes.has(e.scope)), p.days);
        const detectable = inP.filter(e => e.kind !== 'busy');
        const known = detectable.filter(e => e.kind !== 'other').length;
        const pct = detectable.length ? Math.round(known / detectable.length * 100) : 100;
        const hidden = inP.filter(e => e.kind === 'busy').length;
        const base = p.days.length * 7 * 60;   // base 7 h par jour ouvré, affichée
        const ratio = base ? Math.min(100, Math.round(L.total / base * 100)) : 0;
        return `<footer class="tc-foot">
            <span class="tc-meter" title="Réunions hors absences, support, détails masqués et temps protégé — base 7 h/jour">
                ⏱️ <strong>${T.durLabel(Math.round(L.total))}</strong> de réunions
                <span class="tc-meter-bar"><span style="width:${ratio}%"></span></span> ${ratio} %
            </span>
            <span title="Évènements rangés automatiquement dans une nature">🧭 <strong>${pct} %</strong> détectés${hidden ? ` · ${hidden} masqués` : ''}</span>
            <span class="tc-fresh"><span class="tc-dot${st.state === 'stale' ? ' tc-dot--warn' : ''}"></span>${st.state === 'stale' ? 'Agenda non synchronisé depuis 3 jours' : 'Synchronisé ce matin à 8 h 40'}</span>
        </footer>`;
    }

    function bannerHtml(st) {
        const B = {
            masked: `<div class="tc-banner">🔒 <div><b>Agenda partagé en « disponibilités seulement ».</b> Google masque les titres : 155 créneaux « Busy » ne peuvent pas être rangés. Partager l'agenda avec <b>tous les détails</b> au compte de synchronisation règle le problème.</div></div>`,
            stale:  `<div class="tc-banner">⏳ <div><b>Dernière synchronisation : jeudi 25 sept. à 8 h 40.</b> Les évènements ajoutés depuis n'apparaissent pas. <a href="#" data-act="noop">Synchroniser maintenant</a></div></div>`,
            learned: `<div class="tc-banner tc-banner--info">✎ <div><b>« Bastions ! » est maintenant rangé en Communauté & formation</b> — pour les 3 évènements de ce titre, dans toutes les équipes. <a href="#" data-act="undo">Annuler</a></div></div>`,
        };
        return B[st.banner] || '';
    }

    function stateHtml(st) {
        const S = {
            noical: ['📭', 'Aucun agenda relié à cette équipe', "Reliez l'agenda Google de l'équipe (adresse iCal secrète) : les cérémonies, le support et les absences apparaîtront ici, rangés automatiquement.", '<button class="btn btn-primary">＋ Relier un agenda</button>'],
            empty:  ['🌤️', 'Rien de prévu sur cette période', 'Aucun évènement ne correspond aux filtres. Réactivez des natures ou élargissez à l’itération.', '<button class="btn btn-secondary" data-act="reset">Réinitialiser les filtres</button>'],
            error:  ['⚠️', "L'agenda n'a pas pu être lu", 'Google a répondu 404 : l’adresse iCal a probablement été régénérée. Collez la nouvelle adresse dans Paramètres → Agendas.', '<button class="btn btn-secondary">Ouvrir Paramètres → Agendas</button>'],
        };
        if (st.state === 'loading') return skeleton();
        const s = S[st.state];
        return s ? `<div class="tc-state"><div class="tc-state-ico">${s[0]}</div><h5>${s[1]}</h5><p>${s[2]}</p>${s[3]}</div>` : '';
    }

    function skeleton() {
        const col = () => `<div style="display:grid;gap:8px;padding:8px">${[40, 70, 28, 90, 50].map(h => `<div class="tc-skel" style="height:${h}px"></div>`).join('')}</div>`;
        return `<div style="display:grid;grid-template-columns:repeat(5,1fr);padding:var(--sp-3) var(--sp-5)" aria-busy="true" aria-label="Chargement de l'agenda">${Array.from({ length: 5 }, col).join('')}</div>`;
    }

    // ── Fiche d'évènement ───────────────────────────────────────────────────────
    function findEvent(st, id) {
        for (const t of [st.team, ...st.compare]) { const e = T.eventsFor(t).find(x => x.id === id); if (e) return e; }
        return null;
    }
    function detailHtml(st) {
        if (!st.selected) return '';
        const e = findEvent(st, st.selected);
        if (!e) return '';
        const n = C.NATURES[e.kind], sc = C.SCOPES[e.scope];
        const same = T.D.events.filter(x => C.norm(x[1]) === C.norm(e.title)).length;
        const when = e.allDay ? `${T.fmtLong(e.day)} · journée entière` : `${T.fmtLong(e.day)} · ${T.hhmm(e.startMin)} → ${T.hhmm(e.endMin)} (${T.durLabel(e.endMin - e.startMin)})`;
        return `<div class="tc-detail" data-k="${e.kind}" role="dialog" aria-label="${esc(e.title)}" style="${st.detailPos || 'top:60px;right:24px'}">
            <div class="tc-detail-band"></div>
            <button class="tc-close" data-act="close" aria-label="Fermer">✕</button>
            <div class="tc-detail-body">
                <h4>${esc(e.title)}</h4>
                <div class="tc-detail-row"><span>🕘</span><span>${esc(when)}</span></div>
                <div class="tc-detail-row"><span>🗓️</span><span>${esc(e.cal)}</span></div>
                ${e.person ? `<div class="tc-detail-row"><span>👤</span><span>${esc(e.person)}</span></div>` : ''}
                <div class="tc-badges">
                    <span class="tc-badge tc-badge--k">${n.emoji} ${esc(n.label)}</span>
                    <span class="tc-badge">${sc.icon} ${esc(sc.label)}</span>
                    <span class="tc-badge">${e.corrected ? '✎ rangé à la main' : '🧭 détecté automatiquement'}</span>
                </div>
            </div>
            <div class="tc-reclass">
                <label for="tc-reclass-sel">Classer comme</label>
                <select id="tc-reclass-sel" data-reclass="${esc(e.title)}">
                    ${Object.entries(C.NATURES).map(([k, v]) => `<option value="${k}" ${k === e.kind ? 'selected' : ''}>${v.emoji} ${esc(v.label)}</option>`).join('')}
                </select>
                <p>S'applique aux <b>${same}</b> évènements « ${esc(e.title)} », dans toutes les équipes.${e.corrected ? ` <a href="#" data-unclass="${esc(e.title)}">Revenir à la détection</a>` : ''}</p>
            </div>
        </div>`;
    }

    // ── Interactions ────────────────────────────────────────────────────────────
    function wire(el, st) {
        const again = () => render(el, st);
        const step = st.period === 'iteration' ? 14 : 7;
        el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => {
            const a = b.dataset.act;
            if (a === 'prev' || a === 'next') st.anchor = T.addDays(st.anchor, a === 'prev' ? -step : step);
            else if (a === 'today') st.anchor = T.D.today;
            else if (a === 'compare') st.popOpen = !st.popOpen;
            else if (a === 'close') st.selected = null;
            else if (a === 'reset') { st.kinds = new Set(Object.keys(C.NATURES)); st.scopes = new Set(DEFAULT_SCOPES); st.state = 'nominal'; }
            else { ev.preventDefault(); if (a === 'undo') st.banner = null; }
            again();
        }));
        el.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { st.period = b.dataset.period; again(); }));
        el.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { st.kinds.has(b.dataset.kind) ? st.kinds.delete(b.dataset.kind) : st.kinds.add(b.dataset.kind); again(); }));
        el.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { st.scopes.has(b.dataset.scope) ? st.scopes.delete(b.dataset.scope) : st.scopes.add(b.dataset.scope); again(); }));
        el.querySelectorAll('[data-cmp]').forEach(i => i.addEventListener('change', () => {
            st.compare = i.checked ? [...st.compare, i.dataset.cmp] : st.compare.filter(t => t !== i.dataset.cmp); again();
        }));
        el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { st.compare = st.compare.filter(t => t !== b.dataset.remove); again(); }));
        el.querySelectorAll('.tc-ev[data-id]').forEach(b => b.addEventListener('click', () => {
            st.selected = st.selected === b.dataset.id ? null : b.dataset.id;
            const r = b.getBoundingClientRect(), host = el.querySelector('.tc-body').getBoundingClientRect();
            const left = Math.min(Math.max(8, r.right - host.left + 8), host.width - 330);
            st.detailPos = `top:${Math.max(8, r.top - host.top)}px;left:${left > 8 ? left : Math.max(8, r.left - host.left - 330)}px`;
            again();
        }));
        el.querySelector('[data-reclass]')?.addEventListener('change', e => { T.setOverride(e.target.dataset.reclass, e.target.value); again(); });
        el.querySelector('[data-unclass]')?.addEventListener('click', e => { e.preventDefault(); T.setOverride(e.target.dataset.unclass, null); again(); });
        const search = el.querySelector('.tc-pop-search');
        search?.addEventListener('input', () => el.querySelectorAll('.tc-check').forEach(l => { l.hidden = !l.textContent.toLowerCase().includes(search.value.toLowerCase()); }));
    }

    function mount(el, opts) {
        const st = {
            dir: opts.dir || 'week', team: opts.team || 'Gabbiano', compare: opts.compare || [],
            period: opts.period || 'week', anchor: opts.anchor || T.D.today, state: opts.state || 'nominal',
            banner: opts.banner || null, popOpen: !!opts.popOpen, selected: null, detailPos: null,
            kinds: new Set(opts.kinds || Object.keys(T.C.NATURES)), scopes: new Set(opts.scopes || DEFAULT_SCOPES),
        };
        if (opts.select) {   // ouvre une fiche : « titre@jour » → premier évènement correspondant
            const [title, day] = opts.select.split('@');
            const e = T.eventsFor(st.team).find(x => x.title === title && (!day || x.day === day));
            if (e) st.selected = e.id;
        }
        render(el, st);
        // Miroir du site : popover et fiche fermés au clic extérieur et sur Échap
        document.addEventListener('click', e => {
            let changed = false;
            if (st.popOpen && !e.target.closest('.tc-compare')) { st.popOpen = false; changed = true; }
            if (st.selected && !e.target.closest('.tc-detail, .tc-ev')) { st.selected = null; changed = true; }
            if (changed) render(el, st);
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && (st.popOpen || st.selected)) { st.popOpen = false; st.selected = null; render(el, st); }
        });
        return st;
    }

    window.TCApp = { mount, render, period, lanes, visible, COMMON };
    window.TCViews = window.TCViews || {};
})();
