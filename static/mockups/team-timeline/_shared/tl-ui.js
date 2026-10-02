/* Coquille commune des deux frises : période A → B (présélections + dates), portée Équipe / Train,
 * filtres, bandeau de chiffres clés, fiche au clic, formulaire « + Fait marquant », états.
 * Le corps est délégué à TLViews[dir] (lanes = frise horizontale, story = récit vertical).
 */
(function () {
    'use strict';
    const T = window.TL, esc = T.esc;

    function render(el, st) {
        const team = st.scope === 'train' ? '*' : st.team;
        const c = T.collect(team, st.A, st.B, st.seed);
        const s = T.summary(c);
        st._items = [];                                        // registre des cibles cliquables (fiche)
        const view = window.TLViews[st.dir];
        const counts = {
            rythme: c.pis.length + c.milestones.length, production: s.incidents, livraison: s.releases,
            presence: c.low.length, equipe: c.moves.length, fait: c.facts.length, oneonone: s.ones,
        };
        const body = st.state === 'loading' ? skeleton()
            : st.state === 'empty' ? stateHtml('🌤️', 'Rien de marquant sur cette période', 'Aucun évènement ne correspond aux filtres. Élargissez la période ou réactivez des catégories.', '<button class="btn btn-secondary" data-act="reset">Réinitialiser</button>')
            : view.html(st, c);
        const preset = T.presets().find(p => p.A === st.A && p.B === st.B);
        el.innerHTML = `
        <section class="card tl-card tl-dir-${st.dir}" style="--team:${T.teamColor(st.team)}" aria-label="Frise des faits marquants">
            <header class="tl-head">
                <div class="tl-title">
                    <strong>🕰️ Faits marquants</strong>
                    <span class="tl-sub">${st.scope === 'train' ? 'Tout le train' : esc(st.team)} · du ${T.fmt(st.A)} au ${T.fmt(st.B)} (${Math.round(T.diff(st.A, st.B) / 7)} semaines)</span>
                </div>
                <div class="tl-seg" role="group" aria-label="Portée">
                    <button data-scope="team" aria-pressed="${st.scope === 'team'}">👥 ${esc(st.team)}</button>
                    <button data-scope="train" aria-pressed="${st.scope === 'train'}">🚂 Train</button>
                </div>
                <button class="btn btn-primary btn-sm tl-add" data-act="add">＋ Fait marquant</button>
            </header>
            <div class="tl-range" role="group" aria-label="Période">
                <div class="tl-presets">${T.presets().map(p => `<button class="tl-preset" data-preset="${p.key}" aria-pressed="${preset?.key === p.key}">${esc(p.label)}</button>`).join('')}</div>
                <label class="tl-date"><span>Du</span><input type="date" data-date="A" value="${st.A}" min="${T.D.window[0]}" max="${st.B}"></label>
                <span class="tl-arrow" aria-hidden="true">→</span>
                <label class="tl-date"><span>au</span><input type="date" data-date="B" value="${st.B}" min="${st.A}" max="${T.D.window[1]}"></label>
            </div>
            <div class="tl-kpis" aria-label="Résumé de la période">
                ${kpi('in', `+${s.arrivals}`, 'arrivée' + (s.arrivals > 1 ? 's' : ''))}
                ${kpi('out', `−${s.departures}`, 'départ' + (s.departures > 1 ? 's' : ''))}
                ${s.movesIn + s.movesOut ? kpi('move', `⇄ ${s.movesIn + s.movesOut}`, 'mobilité' + (s.movesIn + s.movesOut > 1 ? 's' : '')) : ''}
                ${kpi('prod', s.incidents, 'incident' + (s.incidents > 1 ? 's' : '') + ' prod')}
                ${kpi('rel', s.releases, 'jour' + (s.releases > 1 ? 's' : '') + ' de MEP')}
                ${s.ones ? kpi('one', s.ones, `1v1 (${s.onePeople} personne${s.onePeople > 1 ? 's' : ''})`) : ''}
                ${s.peak && s.peak.pct !== null ? kpi('abs', `${s.peak.pct} %`, `pic d'absence (sem. du ${T.fmt(s.peak.week)})`) : ''}
            </div>
            <div class="tl-filters" role="group" aria-label="Catégories">
                ${Object.entries(T.CATS).map(([k, v]) => `<button class="tl-chip" data-c="${k}" data-cat="${k}" aria-pressed="${st.cats.has(k)}">${v.emoji} ${esc(v.label)} <b>${counts[k]}</b></button>`).join('')}
            </div>
            ${c.icsFrom && st.A < c.icsFrom && (st.cats.has('livraison') || st.cats.has('rythme')) ? `<p class="tl-note">ℹ️ Les MEP et jalons viennent des agendas ICS, disponibles à partir du ${T.fmt(c.icsFrom)} : leur absence avant cette date ne veut pas dire « aucune MEP ».</p>` : ''}
            ${st.cats.has('presence') ? `<p class="tl-legend" aria-label="Légende de la présence"><span data-l="ok"></span>100 % présents <span data-l="mid"></span>75 à 99 % <span data-l="low"></span>moins de 75 %</p>` : ''}
            <div class="tl-body">${body}${detailHtml(st)}${st.adding ? formHtml(st) : ''}</div>
        </section>`;
        if (view.after && !['loading', 'empty'].includes(st.state)) view.after(el, st, c);
        wire(el, st);
    }

    const kpi = (k, v, l) => `<div class="tl-kpi" data-kpi="${k}"><b>${v}</b><span>${esc(l)}</span></div>`;
    const stateHtml = (i, h, p, a) => `<div class="tl-state"><div class="tl-state-ico">${i}</div><h5>${h}</h5><p>${p}</p>${a}</div>`;
    const skeleton = () => `<div class="tl-skel-wrap" aria-busy="true">${Array.from({ length: 5 }, (_, i) => `<div class="tl-skel" style="width:${90 - i * 12}%"></div>`).join('')}</div>`;

    /** Enregistre une cible cliquable et renvoie ses attributs (index dans st._items). */
    function target(st, item) { st._items.push(item); return `data-i="${st._items.length - 1}"`; }

    // ── Fiche ──────────────────────────────────────────────────────────────────
    function detailHtml(st) {
        const it = st.selectedItem;
        if (!it) return '';
        let rows = '';
        if (it.kind === 'incidents') rows = it.items.map(i => `<li><b>${T.fmtShort(i.day)}</b> ${esc(i.title)} <span class="tl-tag">${esc(i.status)}</span></li>`).join('');
        else if (it.kind === 'releases') rows = it.items.map(r => `<li>${esc(r.title)} <span class="tl-tag">${esc(r.cal.replace('ERPC - ', ''))}</span></li>`).join('');
        else if (it.kind === 'move') {
            const m = it.move;
            const what = { in: 'Arrivée', out: 'Départ', 'move-in': `Mobilité : vient de ${m.from}`, 'move-out': `Mobilité : part vers ${m.to}` }[m.kind];
            rows = `<li><b>${esc(what)}</b></li>
                <li>${m.precise ? `📋 Check-list ${m.kind.endsWith('in') ? 'd’onboarding' : 'd’offboarding'} du ${T.fmt(m.checklist)}` : `🗓️ Constaté au changement de PI (début du PI ${m.pi}) — date exacte inconnue`}</li>
                ${m.onlyChecklist ? '<li>Absent des rosters de PI : personne hors des équipes suivies, ou roster à compléter</li>' : ''}
                ${m.conflict ? '<li class="tl-warn">⚠️ À vérifier : une entrée et une sortie de cette personne à moins de 45 jours</li>' : ''}`;
        } else if (it.kind === 'moves') {
            // Mouvements regroupés (vue Train) : la liste des personnes, colorée par sens
            const K = { in: ['in', '▲ Arrivée'], out: ['out', '▼ Départ'], 'move-in': ['move', '⇄ Mobilité'], 'move-out': ['move', '⇄ Mobilité'] };
            rows = it.moves.map(m => `<li><b class="tl-k-${K[m.kind][0]}">${K[m.kind][1]}</b> ${esc(m.who)}${m.team ? ` <span class="tl-tag">${esc(m.kind.startsWith('move') ? `${m.from} → ${m.to}` : m.team)}</span>` : ''} <span class="tl-muted">${T.fmtShort(m.day)}${m.precise ? '' : ' (PI)'}</span></li>`).join('');
        } else if (it.kind === 'ones') {
            rows = it.items.map(o => `<li><b>${T.fmtShort(o.day)}</b> ${esc(o.pair)}</li>`).join('');
        } else if (it.kind === 'low') rows = `<li>${it.low.weeks} semaines à ${it.low.avg} % d’absence en moyenne</li><li>Pic : <b>${it.low.peak} %</b> la semaine du ${T.fmt(it.low.peakWeek)}</li>`;
        else if (it.kind === 'fact') rows = `<li>${esc(it.fact.note || '')}</li>${it.fact.seed ? '<li class="tl-muted">Exemple fondé sur de vrais tickets (maquette)</li>' : ''}`;
        else if (it.kind === 'milestone') rows = `<li>${esc(it.title)}</li>`;
        return `<div class="tl-detail" role="dialog" aria-label="${esc(it.title)}" style="${st.detailPos || 'top:12px;right:12px'}">
            <div class="tl-detail-band" data-c="${it.cat}"></div>
            <button class="tl-close" data-act="close" aria-label="Fermer">✕</button>
            <div class="tl-detail-body"><h4>${esc(it.title)}</h4><p class="tl-muted">${esc(it.when)}</p><ul>${rows}</ul></div>
        </div>`;
    }

    // ── Formulaire « + Fait marquant » ──────────────────────────────────────────
    function formHtml(st) {
        const f = st.draft || { type: 'incident', title: '', start: T.D.today, end: T.D.today, note: '' };
        return `<form class="tl-form" data-form aria-label="Ajouter un fait marquant">
            <h4>＋ Fait marquant</h4>
            <div class="tl-form-types" role="radiogroup" aria-label="Type">${Object.entries(T.FACT_TYPES).map(([k, v]) => `
                <label><input type="radio" name="type" value="${k}" ${f.type === k ? 'checked' : ''}><span>${v.emoji} ${esc(v.label)}</span></label>`).join('')}</div>
            <label class="tl-field"><span>Titre</span><input name="title" required maxlength="120" value="${esc(f.title)}" placeholder="Ex. : Panne INES SPD — désynchronisations PGA"></label>
            <div class="tl-form-row">
                <label class="tl-field"><span>Du</span><input type="date" name="start" value="${f.start}"></label>
                <label class="tl-field"><span>au</span><input type="date" name="end" value="${f.end}"></label>
            </div>
            <label class="tl-field"><span>Pour</span><select name="teams"><option value="${esc(st.team)}">${esc(st.team)}</option><option value="*">Tout le train</option></select></label>
            <label class="tl-field"><span>Détail (facultatif)</span><textarea name="note" rows="2" maxlength="400">${esc(f.note)}</textarea></label>
            <div class="tl-form-actions"><button type="button" class="btn btn-secondary btn-sm" data-act="cancel">Annuler</button><button class="btn btn-primary btn-sm">Ajouter à la frise</button></div>
        </form>`;
    }

    // ── Interactions ───────────────────────────────────────────────────────────
    function wire(el, st) {
        const again = () => render(el, st);
        el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => {
            const a = b.dataset.act;
            if (a === 'close') st.selectedItem = null;
            else if (a === 'add') { st.adding = true; st.selectedItem = null; }
            else if (a === 'cancel') st.adding = false;
            else if (a === 'reset') { st.cats = new Set(Object.keys(T.CATS)); st.state = 'nominal'; }
            else return;
            e.preventDefault(); again();
        }));
        el.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { st.scope = b.dataset.scope; st.selectedItem = null; again(); }));
        el.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { const p = T.presets().find(x => x.key === b.dataset.preset); st.A = p.A; st.B = p.B; again(); }));
        el.querySelectorAll('[data-date]').forEach(i => i.addEventListener('change', () => {
            if (!i.value) return;
            st[i.dataset.date] = i.value;
            if (st.A > st.B) [st.A, st.B] = [st.B, st.A];
            again();
        }));
        el.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { st.cats.has(b.dataset.cat) ? st.cats.delete(b.dataset.cat) : st.cats.add(b.dataset.cat); again(); }));
        // Cibles non-<button> (cartes du récit, qui contiennent des listes) : Entrée / Espace = clic
        el.querySelectorAll('[data-i][role="button"]').forEach(b => b.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
        }));
        el.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
            st.selectedItem = st._items[+b.dataset.i];
            const r = b.getBoundingClientRect(), host = el.querySelector('.tl-body').getBoundingClientRect();
            const left = Math.min(Math.max(8, r.left - host.left), host.width - 340);
            st.detailPos = `top:${Math.max(8, r.bottom - host.top + 6)}px;left:${Math.max(8, left)}px`;
            again();
        }));
        el.querySelector('[data-form]')?.addEventListener('submit', e => {
            e.preventDefault();
            const f = new FormData(e.target);
            const fact = { id: `f${Date.now()}`, type: f.get('type'), title: String(f.get('title')).trim(), start: f.get('start'), end: f.get('end') || f.get('start'), teams: [f.get('teams')], note: String(f.get('note') || '').trim() };
            if (!fact.title) return;
            if (fact.end < fact.start) [fact.start, fact.end] = [fact.end, fact.start];
            T.saveFacts([...T.facts(), fact]);
            st.adding = false; st.cats.add('fait');
            again();
        });
    }

    function mount(el, o) {
        const p = T.presets().find(x => x.key === (o.preset || '6m')) || T.presets()[0];
        const st = {
            dir: o.dir || 'lanes', team: o.team || 'Initiale', scope: o.scope || 'team', A: o.from || p.A, B: o.to || p.B,
            state: o.state || 'nominal', seed: !!o.seed, adding: !!o.add, cats: new Set(o.cats || Object.keys(T.CATS)),
            selectedItem: null, detailPos: null, _items: [],
        };
        render(el, st);
        if (o.select) {                                          // ouvre une fiche : index de cible
            const b = el.querySelector(`[data-i="${o.select}"]`) || el.querySelector(o.select);
            b?.click();
        }
        // Fermeture standard : clic extérieur, Échap
        document.addEventListener('click', e => { if (st.selectedItem && !e.target.closest('.tl-detail, [data-i]')) { st.selectedItem = null; render(el, st); } });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && (st.selectedItem || st.adding)) { st.selectedItem = null; st.adding = false; render(el, st); } });
        return st;
    }

    window.TLApp = { mount, render, target };
    window.TLViews = window.TLViews || {};
})();
