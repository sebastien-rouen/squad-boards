/* ════════════════════════════════════════════════════════════════════════════
   Carte « Calendrier de l'équipe » — visible, exportable, remaniable.
   Fonctionne pour les 13 équipes : chacune a son itération, son roster et sa
   cadence (cf. data-teams.js). Les exports vivent dans exports.js.
   Script classique, pour rester ouvrable en file://.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const { KINDS, esc, dayIdx, dayName, ddmm, workDays, startsWeek, durLabel, DAY_LONG } = window.MK;
    const { hrs, WEEK_MINUTES } = window.MKParts;
    const X = window.TCALX;

    const TEAMS = window.TEAMS_MOCK;
    const LS_TEAM = 'sb-mockup-team-cal:team';
    const lsKey = t => `sb-mockup-team-cal:${t}`;

    const H_START = 9 * 60, H_END = 18.5 * 60;
    const PX_PER_MIN = 0.62;
    const GRID_H = (H_END - H_START) * PX_PER_MIN;
    const SNAP = 15;

    const FREQS = ['tous les jours', '1x/sem.', '1x/ité.', '1x/mois'];
    const perWeek = f => f === 'tous les jours' ? 5 : f === '1x/sem.' ? 1
        : f === '1x/ité.' ? 0.5 : f === '1x/mois' ? 0.23 : 0;
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const hFr = X.hFr;

    // ── État ────────────────────────────────────────────────────────────────
    let T = null;            // équipe courante (entrée de TEAMS_MOCK)
    let days = [];           // jours ouvrés de son itération
    let model = [];
    let selectedId = null;
    let view = 'iteration';

    /** Rituels récurrents d'une équipe, dédupliqués par (titre, jour, heure).
     *  Même règle que `recurringRituals` du socle agenda, mais paramétrée par
     *  l'équipe : ici chaque équipe a ses propres évènements et son itération. */
    function ritualsOf(events) {
        const map = new Map();
        for (const ev of events) {
            if (!ev.freq) continue;
            const key = `${ev.title}|${ev.freq === 'tous les jours' ? '*' : dayIdx(ev.day)}|${ev.start}`;
            if (!map.has(key)) map.set(key, { ...ev, days: [] });
            map.get(key).days.push(ev.day);
        }
        const rank = { 'tous les jours': 0, '1x/sem.': 1, '1x/ité.': 2, '1x/mois': 3 };
        return [...map.values()].sort((a, b) => (rank[a.freq] ?? 9) - (rank[b.freq] ?? 9)
            || dayIdx(a.days[0]) - dayIdx(b.days[0]) || a.startMin - b.startMin);
    }

    /** Transforme les rituels détectés en RÈGLES modifiables — le bon niveau
     *  pour remanier : on édite le rituel, pas chacune de ses occurrences.
     *  Les rituels SAFe arrivent verrouillés : c'est le train qui les impose. */
    function baseline() {
        return ritualsOf(T.events).map((r, i) => ({
            id: `r${i}`,
            title: r.title,
            kind: r.kind,
            dow: r.freq === 'tous les jours' ? 0 : dayIdx(r.days[0]),
            startMin: r.startMin,
            durMin: r.durMin,
            freq: r.freq,
            enabled: true,
            locked: r.kind === 'safe',
            // Jours de semaine systématiquement sautés (le daily de Fuego saute le
            // lundi). Dédupliqué : l'itération compte deux lundis, la règle un seul.
            skipDays: r.freq === 'tous les jours'
                ? [...new Set(days.filter(d => !r.days.includes(d)).map(dayIdx))]
                : [],
        }));
    }

    function loadModel() {
        try {
            const saved = JSON.parse(localStorage.getItem(lsKey(T.team)) || 'null');
            if (saved && Array.isArray(saved.model) && saved.model.length) return saved.model;
        } catch { /* stockage illisible : on repart de la détection */ }
        return baseline();
    }
    const save = () => localStorage.setItem(lsKey(T.team), JSON.stringify({ model }));

    // ── Différences avec la détection d'origine ─────────────────────────────
    function diff() {
        const base = new Map(baseline().map(r => [r.id, r]));
        const out = [];
        for (const r of model) {
            const b = base.get(r.id);
            if (!b) { out.push(`➕ ${r.title} — ajouté`); continue; }
            if (!r.enabled) { out.push(`⏸️ ${r.title} — désactivé`); continue; }
            const ch = [];
            if (r.title !== b.title) ch.push(`renommé « ${b.title} »`);
            if (r.dow !== b.dow) ch.push(`${b.dow ? DAY_LONG[b.dow] : 'tous les jours'} → ${r.dow ? DAY_LONG[r.dow] : 'tous les jours'}`);
            if (r.startMin !== b.startMin) ch.push(`${hFr(b.startMin)} → ${hFr(r.startMin)}`);
            if (r.durMin !== b.durMin) ch.push(`${durLabel(b.durMin)} → ${durLabel(r.durMin)}`);
            if (r.freq !== b.freq) ch.push(`${b.freq} → ${r.freq}`);
            if (r.kind !== b.kind) ch.push(`${KINDS[b.kind].short} → ${KINDS[r.kind].short}`);
            if (r.locked !== b.locked) ch.push(r.locked ? 'verrouillé' : '🔓 déverrouillé');
            if (ch.length) out.push(`✏️ ${r.title} — ${ch.join(', ')}`);
        }
        for (const b of base.values()) {
            if (!model.some(r => r.id === b.id)) out.push(`🗑️ ${b.title} — supprimé`);
        }
        return out;
    }

    /** Quels jours de l'itération porte ce rituel, compte tenu de sa cadence. */
    function occurrences(r) {
        if (!r.enabled) return [];
        if (r.freq === 'tous les jours') return days.filter(d => !r.skipDays.includes(dayIdx(d)));
        const hits = days.filter(d => dayIdx(d) === r.dow);
        if (r.freq === '1x/sem.') return hits;
        if (r.freq === '1x/ité.') return hits.filter((_, i) => i % 2 === 0);
        return hits.slice(0, 1);
    }

    const ctx = () => ({
        team: T.team, iteration: T.iteration, days, occurrences, perWeek,
        slug: T.team.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-'),
    });

    // ── Rendu ───────────────────────────────────────────────────────────────
    function cols() {
        return view === 'iteration'
            ? days.map(d => ({ key: d, label: dayName(d), sub: ddmm(d), dow: dayIdx(d) }))
            : [1, 2, 3, 4, 5].map(i => ({ key: `w${i}`, label: DAY_LONG[i], sub: '', dow: i }));
    }

    function blocksFor(col) {
        return model.filter(r => view === 'week'
            ? (r.freq === 'tous les jours' ? !r.skipDays.includes(col.dow) : r.dow === col.dow)
            : occurrences(r).includes(col.key));
    }

    function layout(list) {
        const sorted = [...list].sort((a, b) => a.startMin - b.startMin || b.durMin - a.durMin);
        const lanes = [];
        for (const r of sorted) {
            let c = lanes.findIndex(l => l[l.length - 1].startMin + l[l.length - 1].durMin <= r.startMin);
            if (c === -1) { lanes.push([r]); c = lanes.length - 1; } else lanes[c].push(r);
            r._lane = c;
        }
        for (const r of sorted) r._lanes = lanes.length;
        return sorted;
    }

    function renderGrid() {
        const C = cols();
        const N = C.length;
        const pct = i => i / N * 100;
        const grid = document.getElementById('tcal-grid');
        grid.style.setProperty('--cols', N);

        let html = '<div></div><div class="wgrid-heads">';
        C.forEach((c, i) => {
            const wk = view === 'iteration' && startsWeek(c.key, i);
            html += `<div class="wgrid-head ${wk ? 'wgrid-head--week' : ''}">
                ${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}
            </div>`;
        });
        html += '</div>';

        html += `<div class="wgrid-hours" style="height:${GRID_H}px">`;
        for (let h = 9; h <= 18; h++) {
            html += `<span class="wgrid-hour" style="top:${(h * 60 - H_START) * PX_PER_MIN}px">${h}h</span>`;
        }
        html += '</div>';

        html += `<div class="wgrid-body" id="tcal-body" style="height:${GRID_H}px">`;
        C.forEach((c, i) => {
            const wk = view === 'iteration' && startsWeek(c.key, i);
            html += `<div class="wgrid-col ${wk ? 'wgrid-col--week' : ''}" data-col="${i}"
                          style="--hour-h:${60 * PX_PER_MIN}px"></div>`;
        });
        C.forEach((c, i) => {
            for (const r of layout(blocksFor(c))) {
                const top = Math.max(0, (r.startMin - H_START) * PX_PER_MIN);
                const h = Math.max(20, Math.min(r.durMin, H_END - r.startMin) * PX_PER_MIN);
                const w = pct(1) / r._lanes;
                const cls = ['rit', KINDS[r.kind].cls,
                    r.id === selectedId ? 'rit--selected' : '',
                    r.enabled ? '' : 'rit--off',
                    r.locked ? 'rit--locked' : ''].filter(Boolean).join(' ');
                html += `<div class="${cls}" tabindex="0" role="button" data-id="${esc(r.id)}"
                              aria-label="${esc(r.title)}, ${esc(hFr(r.startMin))}, ${esc(durLabel(r.durMin))}${r.locked ? ', imposé par le train' : ''}"
                              style="top:${top}px;height:${h}px;left:calc(${pct(i) + r._lane * w}% + 3px);width:calc(${w}% - 6px)"
                              title="${esc(r.title)} — ${esc(hFr(r.startMin))} · ${esc(durLabel(r.durMin))} · ${esc(r.freq)}${r.locked ? ' · 🔒 imposé par le train' : ''}">
                    <span class="rit-title">${r.locked ? '<span class="rit-lock">🔒</span> ' : ''}${esc(r.title)}</span>
                    <span class="rit-meta">${esc(hFr(r.startMin))} · ${esc(r.freq)}</span>
                </div>`;
            }
        });
        html += '</div>';
        grid.innerHTML = html;
    }

    function renderList() {
        document.getElementById('tcal-list').innerHTML = [...model]
            .sort((a, b) => a.dow - b.dow || a.startMin - b.startMin)
            .map(r => `<div class="tcal-list-item ${KINDS[r.kind].cls} ${r.enabled ? '' : 'tcal-list-item--off'}"
                            data-id="${esc(r.id)}" role="button" tabindex="0"
                            aria-selected="${r.id === selectedId}">
                <b>${r.locked ? '🔒 ' : ''}${esc(r.title)}</b>
                <small>${esc(X.whenLabel(r))} · ${esc(r.freq)}</small>
            </div>`).join('');
    }

    function renderLoadBar() {
        const by = { scrum: 0, safe: 0, ops: 0 };
        for (const r of model) if (r.enabled) by[r.kind] += r.durMin * perWeek(r.freq);
        const busy = by.scrum + by.safe + by.ops;
        const free = Math.max(0, WEEK_MINUTES - busy);
        const pc = v => Math.round(v / WEEK_MINUTES * 100);
        const seg = (cls, v, label) => v <= 0 ? '' :
            `<span class="${cls}" style="width:${v / WEEK_MINUTES * 100}%" title="${esc(label)} : ${esc(hrs(v))}"></span>`;
        const over = busy > WEEK_MINUTES;
        document.getElementById('tcal-load').innerHTML = `
            <div class="load-label">Charge de rituels — ${esc(T.team)}</div>
            <div class="load-value">${esc(hrs(busy))} <small>/ semaine · ${over ? 'plus de créneaux que d’heures ouvrées' : `${esc(hrs(free))} de libre`}</small></div>
            <div class="load-bar">
                ${seg(KINDS.scrum.cls, by.scrum, KINDS.scrum.label)}
                ${seg(KINDS.safe.cls, by.safe, KINDS.safe.label)}
                ${seg(KINDS.ops.cls, by.ops, KINDS.ops.label)}
                ${seg('k-free', free, 'Temps libre')}
            </div>
            <div class="load-split">
                <span>🔵 Scrum <b>${pc(by.scrum)} %</b></span>
                <span>🟣 SAFe <b>${pc(by.safe)} %</b></span>
                <span>⚪ Ops <b>${pc(by.ops)} %</b></span>
                <span class="${over ? 'is-over' : 'is-free'}">${over ? '🔴 Dépassement' : '🟢 Libre'} <b>${over ? pc(busy - WEEK_MINUTES) : pc(free)} %</b></span>
            </div>`;
    }

    function renderStatus() {
        const d = diff();
        const el = document.getElementById('tcal-status');
        const locked = model.filter(r => r.locked).length;
        el.className = `tcal-status ${d.length ? 'tcal-status--dirty' : ''}`;
        el.innerHTML = d.length
            ? `<div>
                   <strong>${d.length} modification${d.length > 1 ? 's' : ''}</strong> par rapport aux calendriers détectés
                   <ul class="tcal-diff">${d.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
               </div>
               <span class="tcal-status-actions">
                   <button class="btn btn-secondary btn-sm" id="tcal-reset">↺ Rétablir la détection</button>
               </span>`
            : `<span>Calendrier conforme aux invitations détectées — glisse un rituel pour le remanier.
                 ${locked ? `<strong>${locked} rituels 🔒</strong> imposés par le train (déverrouillables au cas par cas).` : ''}</span>`;
    }

    function renderEdit() {
        const el = document.getElementById('tcal-edit');
        const r = model.find(x => x.id === selectedId);
        if (!r) { el.hidden = true; return; }
        el.hidden = false;
        el.className = `tcal-edit ${KINDS[r.kind].cls} ${r.locked ? 'tcal-edit--locked' : ''}`;
        const dis = r.locked ? 'disabled' : '';
        el.innerHTML = `
            ${r.locked ? `<p class="tcal-locked-note">🔒 <strong>Imposé par le train ERPC.</strong>
                La cadence de l’ART ne se décide pas dans l’équipe — déverrouille si tu sais ce que tu fais.</p>` : ''}
            <div class="tcal-edit-row">
                <div class="tcal-field tcal-field--title">
                    <label for="e-title">Rituel</label>
                    <input id="e-title" type="text" value="${esc(r.title)}" ${dis}>
                </div>
                <div class="tcal-field">
                    <label for="e-kind">Famille</label>
                    <select id="e-kind" ${dis}>
                        ${Object.entries(KINDS).map(([k, m]) =>
                            `<option value="${k}" ${k === r.kind ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
                    </select>
                </div>
                <div class="tcal-field">
                    <label for="e-freq">Cadence</label>
                    <select id="e-freq" ${dis}>
                        ${FREQS.map(f => `<option value="${esc(f)}" ${f === r.freq ? 'selected' : ''}>${esc(f)}</option>`).join('')}
                    </select>
                </div>
                <div class="tcal-field">
                    <label for="e-dow">Jour</label>
                    <select id="e-dow" ${r.freq === 'tous les jours' || r.locked ? 'disabled' : ''}>
                        ${[1, 2, 3, 4, 5].map(i => `<option value="${i}" ${i === r.dow ? 'selected' : ''}>${esc(DAY_LONG[i])}</option>`).join('')}
                    </select>
                </div>
                <div class="tcal-field">
                    <label for="e-start">Heure</label>
                    <input id="e-start" type="time" step="300" value="${hhmm(r.startMin)}" ${dis}>
                </div>
                <div class="tcal-field">
                    <label for="e-dur">Durée (min)</label>
                    <input id="e-dur" type="number" min="15" max="480" step="15" value="${r.durMin}" style="width:88px" ${dis}>
                </div>
                <span class="tcal-edit-actions">
                    <button class="btn ${r.locked ? 'btn-primary' : 'btn-secondary'} btn-sm" id="e-lock">
                        ${r.locked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}
                    </button>
                    <button class="btn btn-secondary btn-sm" id="e-toggle" ${dis}>${r.enabled ? '⏸️ Désactiver' : '▶️ Réactiver'}</button>
                    <button class="btn btn-secondary btn-sm" id="e-dup">⧉ Dupliquer</button>
                    <button class="btn btn-danger btn-sm" id="e-del" ${dis}>🗑️ Supprimer</button>
                </span>
            </div>
            <p class="tcal-hint">
                ${r.locked
                    ? 'Rituel verrouillé : ni glisser ni éditer. Le cadenas reste réversible.'
                    : 'Glisse le bloc pour le déplacer, ou au clavier : <kbd>←</kbd> <kbd>→</kbd> changent de jour, <kbd>↑</kbd> <kbd>↓</kbd> décalent de 15 min, <kbd>Suppr</kbd> retire le rituel.'}
            </p>`;

        const upd = fn => { fn(); save(); render(); };
        // Le cadenas reste actif même verrouillé — c'est lui qui rend la main
        el.querySelector('#e-lock').addEventListener('click', () => upd(() => { r.locked = !r.locked; }));
        el.querySelector('#e-dup').addEventListener('click', () => upd(() => {
            const copy = { ...r, id: `n${Date.now()}`, title: `${r.title} (copie)`, locked: false };
            model.push(copy);
            selectedId = copy.id;
        }));
        if (r.locked) return;

        el.querySelector('#e-title').addEventListener('input', e => {
            r.title = e.target.value; save(); renderGrid(); renderList(); renderStatus();
        });
        el.querySelector('#e-kind').addEventListener('change', e => upd(() => { r.kind = e.target.value; }));
        el.querySelector('#e-freq').addEventListener('change', e => upd(() => {
            r.freq = e.target.value;
            if (r.freq === 'tous les jours') r.dow = 0;
            else if (!r.dow) r.dow = 1;
        }));
        el.querySelector('#e-dow').addEventListener('change', e => upd(() => { r.dow = +e.target.value; }));
        el.querySelector('#e-start').addEventListener('change', e => upd(() => {
            const [h, m] = e.target.value.split(':').map(Number);
            r.startMin = h * 60 + m;
        }));
        el.querySelector('#e-dur').addEventListener('change', e => upd(() => { r.durMin = Math.max(15, +e.target.value || 15); }));
        el.querySelector('#e-toggle').addEventListener('click', () => upd(() => { r.enabled = !r.enabled; }));
        el.querySelector('#e-del').addEventListener('click', () => upd(() => {
            model = model.filter(x => x.id !== r.id);
            selectedId = null;
        }));
    }

    function renderHeader() {
        const it = T.iteration;
        document.getElementById('tcal-view-ite').textContent =
            it.fallback ? 'Fenêtre de référence' : `Itération ${it.short}`;
        document.getElementById('tcal-sub').innerHTML = it.fallback
            ? `<span class="tcal-warn">Aucun sprint actif pour ${esc(T.team)}</span> — fenêtre de référence du ${esc(ddmm(it.start))} au ${esc(ddmm(it.end))}, ${days.length} jours ouvrés.`
            : `${esc(it.name)} — du ${esc(ddmm(it.start))} au ${esc(ddmm(it.end))}, ${days.length} jours ouvrés.`;
    }

    function render() {
        renderHeader();
        renderGrid();
        renderList();
        renderLoadBar();
        renderStatus();
        renderEdit();
    }

    // ── Interactions ────────────────────────────────────────────────────────
    function colFromX(bodyEl, clientX) {
        const rect = bodyEl.getBoundingClientRect();
        const N = cols().length;
        return Math.max(0, Math.min(N - 1, Math.floor((clientX - rect.left) / rect.width * N)));
    }

    function bindGrid() {
        const wrap = document.getElementById('tcal-grid');

        wrap.addEventListener('pointerdown', e => {
            const block = e.target.closest('.rit');
            if (!block) return;
            const r = model.find(x => x.id === block.dataset.id);
            if (!r) return;
            selectedId = r.id;
            renderEdit();
            wrap.querySelectorAll('.rit--selected').forEach(el => el.classList.remove('rit--selected'));
            block.classList.add('rit--selected');
            if (r.locked) return;                       // verrouillé : sélection seule

            const body = document.getElementById('tcal-body');
            const startY = e.clientY;
            const originMin = r.startMin;
            let moved = false;

            block.setPointerCapture(e.pointerId);
            block.classList.add('rit--dragging');

            const onMove = ev => {
                moved = true;
                const dMin = (ev.clientY - startY) / PX_PER_MIN;
                r.startMin = Math.max(H_START, Math.min(H_END - r.durMin,
                    Math.round((originMin + dMin) / SNAP) * SNAP));
                const ci = colFromX(body, ev.clientX);
                const col = cols()[ci];
                if (col && r.freq !== 'tous les jours') r.dow = col.dow;
                body.querySelectorAll('.wgrid-col').forEach((c, i) =>
                    c.classList.toggle('wgrid-col--drop', i === ci));
                block.style.top = `${(r.startMin - H_START) * PX_PER_MIN}px`;
                block.querySelector('.rit-meta').textContent = `${hFr(r.startMin)} · ${r.freq}`;
            };
            const onUp = () => {
                block.releasePointerCapture(e.pointerId);
                block.removeEventListener('pointermove', onMove);
                block.removeEventListener('pointerup', onUp);
                block.classList.remove('rit--dragging');
                if (moved) { save(); render(); }
            };
            block.addEventListener('pointermove', onMove);
            block.addEventListener('pointerup', onUp);
        });

        wrap.addEventListener('keydown', e => {
            const block = e.target.closest('.rit');
            if (!block) return;
            const r = model.find(x => x.id === block.dataset.id);
            if (!r) return;
            selectedId = r.id;
            if (r.locked) { renderEdit(); return; }
            const step = { ArrowUp: -SNAP, ArrowDown: SNAP }[e.key];
            if (step !== undefined) {
                r.startMin = Math.max(H_START, Math.min(H_END - r.durMin, r.startMin + step));
            } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && r.freq !== 'tous les jours') {
                r.dow = Math.max(1, Math.min(5, r.dow + (e.key === 'ArrowRight' ? 1 : -1)));
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                model = model.filter(x => x.id !== r.id);
                selectedId = null;
            } else if (e.key !== 'Enter' && e.key !== ' ') {
                return;
            }
            e.preventDefault();
            save();
            render();
            document.querySelector(`.rit[data-id="${r.id}"]`)?.focus();
        });

        document.getElementById('tcal-list').addEventListener('click', e => {
            const item = e.target.closest('.tcal-list-item');
            if (!item) return;
            selectedId = item.dataset.id;
            render();
        });
    }

    function bindTools() {
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', () => {
                view = btn.dataset.view;
                document.querySelectorAll('[data-view]').forEach(b =>
                    b.setAttribute('aria-pressed', String(b.dataset.view === view)));
                render();
            });
        });

        const menu = document.getElementById('tcal-export-menu');
        document.getElementById('tcal-export-btn').addEventListener('click', e => {
            e.stopPropagation();
            menu.hidden = !menu.hidden;
        });
        document.addEventListener('click', () => { menu.hidden = true; });
        menu.addEventListener('click', e => e.stopPropagation());

        menu.querySelector('#exp-ics').addEventListener('click', () =>
            X.download(`calendrier-${ctx().slug}.ics`, X.icsText(model, ctx()), 'text/calendar'));
        menu.querySelector('#exp-csv').addEventListener('click', () =>
            X.download(`calendrier-${ctx().slug}.csv`, X.csvText(model, ctx()), 'text/csv'));
        menu.querySelector('#exp-slack').addEventListener('click', async () => {
            const btn = menu.querySelector('#exp-slack');
            try {
                await navigator.clipboard.writeText(X.slackText(model, ctx()));
                const old = btn.innerHTML;
                btn.innerHTML = '✓ Copié dans le presse-papiers';
                setTimeout(() => { btn.innerHTML = old; }, 1600);
            } catch { /* presse-papiers refusé */ }
        });
        menu.querySelector('#exp-print').addEventListener('click', () => window.print());

        document.getElementById('tcal-add').addEventListener('click', () => {
            const r = { id: `n${Date.now()}`, title: 'Nouveau rituel', kind: 'scrum', dow: 1,
                        startMin: 10 * 60, durMin: 30, freq: '1x/sem.', enabled: true,
                        locked: false, skipDays: [] };
            model.push(r);
            selectedId = r.id;
            save();
            render();
            document.getElementById('e-title')?.focus();
        });

        document.getElementById('tcal-status').addEventListener('click', e => {
            if (!e.target.closest('#tcal-reset')) return;
            localStorage.removeItem(lsKey(T.team));
            model = baseline();
            selectedId = null;
            render();
        });

        document.getElementById('tcal-team').addEventListener('change', e => {
            selectTeam(e.target.value);
            render();
        });
    }

    // ── Sélection d'équipe ──────────────────────────────────────────────────
    function selectTeam(name) {
        T = TEAMS.find(t => t.team === name) || TEAMS[0];
        days = workDays(T.iteration.start, T.iteration.end);
        model = loadModel();
        selectedId = null;
        localStorage.setItem(LS_TEAM, T.team);
        // L'en-tête de la page suit l'équipe choisie
        window.renderTeamHeader?.(T);
    }

    function mountTeamPicker() {
        const sel = document.getElementById('tcal-team');
        sel.innerHTML = TEAMS.map(t => {
            const n = t.events.filter(e => e.freq).length;
            return `<option value="${esc(t.team)}">${esc(t.team)} — ${n} rituels${t.iteration.fallback ? ' (pas de sprint actif)' : ''}</option>`;
        }).join('');
        const saved = localStorage.getItem(LS_TEAM);
        sel.value = TEAMS.some(t => t.team === saved) ? saved : 'Fuego';
        selectTeam(sel.value);
    }

    mountTeamPicker();
    bindGrid();
    bindTools();
    render();

    window.TCAL = {
        occurrences, diff, ctx, baseline, selectTeam, render,
        icsText: () => X.icsText(model, ctx()),
        csvText: () => X.csvText(model, ctx()),
        slackText: () => X.slackText(model, ctx()),
        get model() { return model; },
        get team() { return T.team; },
        get days() { return days; },
    };
})();
