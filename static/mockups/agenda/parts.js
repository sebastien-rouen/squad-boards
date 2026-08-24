/* ════════════════════════════════════════════════════════════════════════════
   Briques de rendu partagées par les options B, C et D.
   Même raison d'être que parts.css : une seule implémentation de la tuile de
   charge, de la grille du rythme et de l'agenda dense, pour que les trois
   options restent cohérentes.
   Charger APRÈS shell.js.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const { D, KINDS, esc, dayIdx, dayName, dayFull, ddmm, durLabel, isFullDay,
            cadence, absentNames, supportOn, byDay, stripEmoji, weekGroups,
            startsWeek, state, shiftImpact } = window.MK;

    /** Base hebdomadaire de référence : 5 jours × 7 h. C'est l'hypothèse qui rend
     *  le « temps libre » lisible — elle est affichée, pas cachée. */
    const WEEK_MINUTES = 5 * 7 * 60;

    /** Combien de fois par semaine ce rituel tombe — pour la charge hebdo. */
    const perWeek = f => f === 'tous les jours' ? 5
        : f === '1x/sem.' ? 1
        : f === '1x/ité.' ? 0.5
        : f === '1x/mois' ? 0.23 : 0;

    const hrs = m => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;

    /** Un rituel compte dans la charge s'il tombe un jour ouvré — même règle que la
     *  grille du rythme, qui n'a que cinq colonnes. Sans ce garde, un décalage qui
     *  pousse le planning au samedi le retirait de la grille mais le laissait dans
     *  la barre de charge : deux chiffres qui se contredisent à l'écran. */
    const onWorkDay = r => {
        if (r.freq === 'tous les jours') return true;
        const wd = dayIdx(r.days[0]);
        return wd >= 1 && wd <= 5;
    };

    /** Minutes hebdomadaires par famille + le reste non réuni. */
    function weeklyLoad(rituals) {
        const by = { scrum: 0, safe: 0, ops: 0 };
        for (const r of rituals) {
            if (!onWorkDay(r)) continue;
            by[r.kind] += r.durMin * perWeek(r.freq);
        }
        const busy = by.scrum + by.safe + by.ops;
        return { ...by, busy, free: Math.max(0, WEEK_MINUTES - busy), base: WEEK_MINUTES };
    }

    // ── 1. Tuiles de charge ─────────────────────────────────────────────────
    /** La barre se lit sur la semaine entière : les trois familles PUIS le temps
     *  qui reste. Sans ce quatrième segment, 100 % de la barre = 100 % de réunions,
     *  ce qui donne une impression fausse de saturation. */
    function renderLoad(el, rituals, milestones) {
        const L = weeklyLoad(rituals);
        const pct = v => Math.round(v / L.base * 100);
        const seg = (k, v, label) => v <= 0 ? '' :
            `<span class="${KINDS[k]?.cls || 'k-free'}" style="width:${v / L.base * 100}%"
                   title="${esc(label)} : ${esc(hrs(v))}"></span>`;

        el.innerHTML = `
            <div class="load-tile">
                <div class="load-label">Rituels récurrents</div>
                <div class="load-value">${esc(hrs(L.busy))} <small>/ semaine</small></div>
                <div class="load-sub">Créneaux ouverts, en assistant à tout — les CoP et les syncs
                    du train ne concernent pas tout le monde. Base : ${esc(hrs(L.base))} par semaine.</div>
                <div class="load-bar">
                    ${seg('scrum', L.scrum, KINDS.scrum.label)}
                    ${seg('safe', L.safe, KINDS.safe.label)}
                    ${seg('ops', L.ops, KINDS.ops.label)}
                    ${seg('free', L.free, 'Temps libre')}
                </div>
                <div class="load-split">
                    <span>🔵 Scrum <b>${pct(L.scrum)} %</b></span>
                    <span>🟣 SAFe <b>${pct(L.safe)} %</b></span>
                    <span>⚪ Ops <b>${pct(L.ops)} %</b></span>
                    <span class="is-free">🟢 Libre <b>${pct(L.free)} %</b></span>
                </div>
            </div>
            <div class="load-tile">
                <div class="load-label">Temps libre</div>
                <div class="load-value">${esc(hrs(L.free))} <small>/ semaine</small></div>
                <div class="load-sub">Ce qui reste pour produire une fois les rituels posés,
                    hors absences et hors interruptions — un plafond, jamais un acquis.</div>
            </div>
            <div class="load-tile">
                <div class="load-label">Cadence du train</div>
                <div class="load-value">${rituals.filter(r => r.kind === 'safe').length} <small>rituels SAFe</small></div>
                <div class="load-sub">${esc(hrs(L.safe))} par semaine imposés par le train ERPC.
                    ${milestones.filter(m => m.kind === 'safe').length} jalons ponctuels en plus
                    (I&amp;A, PI Planning, journées Innovation).</div>
            </div>`;
    }

    // ── 2. Grille du rythme, sur toute l'itération ──────────────────────────
    const H_START = 9 * 60, H_END = 18.5 * 60;
    const PX_PER_MIN = 0.62;
    const GRID_H = (H_END - H_START) * PX_PER_MIN;

    /** Répartit en colonnes les rituels qui se chevauchent le MÊME jour, façon agenda. */
    function layout(list) {
        const sorted = [...list].sort((a, b) => a.startMin - b.startMin || b.durMin - a.durMin);
        const cols = [];
        for (const r of sorted) {
            let c = cols.findIndex(col => col[col.length - 1].startMin + col[col.length - 1].durMin <= r.startMin);
            if (c === -1) { cols.push([r]); c = cols.length - 1; } else cols[c].push(r);
            r._col = c;
        }
        for (const r of sorted) r._cols = cols.length;
        return sorted;
    }

    /** Plages d'index de jours CONSÉCUTIFS où le rituel a effectivement lieu.
     *  Une bande par plage : les trous restent visibles, et ils veulent dire
     *  quelque chose (le daily de Fuego saute le lundi, jour du weekly). */
    function segments(ritual, days) {
        const has = new Set(ritual.days);
        const out = [];
        let start = -1;
        days.forEach((d, i) => {
            if (has.has(d)) { if (start < 0) start = i; }
            else if (start >= 0) { out.push([start, i - 1]); start = -1; }
        });
        if (start >= 0) out.push([start, days.length - 1]);
        return out;
    }

    /** Un rituel se dessine en bande continue s'il revient presque chaque jour. */
    const isDaily = r => r.freq === 'tous les jours';

    function renderRhythm(gridEl, listEl, rituals, days) {
        const N = days.length;
        const pct = i => i / N * 100;

        // En-têtes : les vrais jours de l'itération, pas une semaine abstraite
        let html = '<div></div><div class="wgrid-heads">';
        days.forEach((d, i) => {
            html += `<div class="wgrid-head ${startsWeek(d, i) ? 'wgrid-head--week' : ''} ${d === D.today ? 'wgrid-head--today' : ''}">
                ${esc(dayName(d))}<small>${esc(ddmm(d))}</small>
            </div>`;
        });
        html += '</div>';

        html += `<div class="wgrid-hours" style="height:${GRID_H}px">`;
        for (let h = 9; h <= 18; h++) {
            html += `<span class="wgrid-hour" style="top:${(h * 60 - H_START) * PX_PER_MIN}px">${h}h</span>`;
        }
        html += '</div>';

        html += `<div class="wgrid-body" style="height:${GRID_H}px">`;
        days.forEach((d, i) => {
            html += `<div class="wgrid-col ${startsWeek(d, i) ? 'wgrid-col--week' : ''} ${d === D.today ? 'wgrid-col--today' : ''}"
                          style="--hour-h:${60 * PX_PER_MIN}px"></div>`;
        });

        // Bandes continues — dessinées d'abord, elles passent sous les blocs ponctuels
        for (const r of rituals.filter(isDaily)) {
            const top = Math.max(0, (r.startMin - H_START) * PX_PER_MIN);
            const h = Math.max(18, Math.min(r.durMin, H_END - r.startMin) * PX_PER_MIN);
            const missing = N - r.days.length;
            const title = `${r.title} — ${cadence(r)} (${durLabel(r.durMin)})`
                + (missing > 0 ? ` — absent ${missing} jour${missing > 1 ? 's' : ''} de l’itération` : '');
            for (const [a, b] of segments(r, days)) {
                html += `<div class="rit-band ${KINDS[r.kind].cls}"
                              style="top:${top}px;height:${h}px;left:calc(${pct(a)}% + 3px);width:calc(${pct(b - a + 1)}% - 6px)"
                              title="${esc(title)}">
                    <span class="rit-band-title">${esc(stripEmoji(r.title))}</span>
                    <span class="rit-band-meta">${esc(r.start)}</span>
                </div>`;
            }
        }

        // Blocs ponctuels — une occurrence par jour réel, empilés si chevauchement
        const perDay = days.map(() => []);
        for (const r of rituals.filter(x => !isDaily(x))) {
            for (const d of r.days) {
                const i = days.indexOf(d);
                if (i >= 0) perDay[i].push({ ...r, _day: d });
            }
        }
        perDay.forEach((list, i) => {
            for (const r of layout(list)) {
                const top = Math.max(0, (r.startMin - H_START) * PX_PER_MIN);
                const h = Math.max(20, Math.min(r.durMin, H_END - r.startMin) * PX_PER_MIN);
                const w = pct(1) / r._cols;
                html += `<div class="rit ${KINDS[r.kind].cls}"
                              style="top:${top}px;height:${h}px;left:calc(${pct(i) + r._col * w}% + 3px);width:calc(${w}% - 6px)"
                              title="${esc(r.title)} — ${esc(cadence(r))} (${esc(durLabel(r.durMin))})">
                    <span class="rit-title">${esc(stripEmoji(r.title))}</span>
                    <span class="rit-meta">${esc(r.start)} · ${esc(r.freq)}</span>
                </div>`;
            }
        });
        html += '</div>';

        gridEl.style.setProperty('--cols', N);
        gridEl.innerHTML = html;

        // Repli petit écran : la même information en liste, groupée par cadence
        const order = ['tous les jours', '1x/sem.', '1x/ité.', '1x/mois'];
        const groups = new Map();
        for (const r of rituals) {
            const g = order.includes(r.freq) ? r.freq : 'autre cadence';
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(r);
        }
        listEl.innerHTML = [...groups.entries()]
            .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
            .map(([g, list]) => `<div class="rit-group">
                <h4>${esc(g)} · ${list.length}</h4>
                ${list.map(r => {
                    // Un quotidien qui saute des jours doit le dire : sur petit écran,
                    // la liste est la seule vue disponible, pas de bande à interpréter.
                    const gaps = isDaily(r) ? days.length - r.days.length : 0;
                    const when = isDaily(r)
                        ? `${r.start}${gaps > 0 ? ` · ${r.days.length}/${days.length} jours` : ''}`
                        : `${dayName(r.days[0])} ${r.start}`;
                    return `<div class="rit-item ${KINDS[r.kind].cls}" title="${esc(cadence(r))}">
                        <b>${esc(stripEmoji(r.title))}</b>
                        <small>${esc(when)} · ${esc(durLabel(r.durMin))}</small>
                    </div>`;
                }).join('')}
            </div>`).join('');
    }

    // ── 3. Sommaire de densité ──────────────────────────────────────────────
    function renderSpark(el, days, map) {
        const max = Math.max(1, ...days.map(d => (map.get(d) || []).length));
        el.innerHTML = days.map((d, i) => {
            const list = map.get(d) || [];
            const segs = ['scrum', 'safe', 'ops'].map(k => {
                const n = list.filter(e => e.kind === k).length;
                if (!n) return '';
                return `<span class="spark-seg ${KINDS[k].cls}" style="height:${n / max * 56}px"
                              title="${n} ${esc(KINDS[k].short)}"></span>`;
            }).join('');
            return `${startsWeek(d, i) ? '<span class="spark-sep"></span>' : ''}
                <button class="spark-day ${d === D.today ? 'spark-day--today' : ''}" data-day="${esc(d)}"
                        title="${list.length} évènement${list.length > 1 ? 's' : ''} — aller à ce jour">
                    <span class="spark-stack">${segs}</span>
                    <span class="spark-label">${esc(dayName(d))}<br>${esc(ddmm(d))}</span>
                </button>`;
        }).join('');
    }

    // ── 4. Agenda dense, jour par jour ──────────────────────────────────────
    function evRow(ev) {
        const cls = ['ev-row', KINDS[ev.kind].cls, isFullDay(ev) ? 'ev-row--fullday' : ''].filter(Boolean).join(' ');
        return `<div class="${cls}">
            <span class="ev-time">${isFullDay(ev) ? 'jour' : esc(ev.start)}</span>
            <span class="ev-title">${esc(ev.title)}
                ${ev.dupe ? '<span class="ev-dupe" title="Ce créneau existe aussi dans un autre calendrier ce jour-là">⚠︎</span>' : ''}
                <span class="ev-dur">${esc(durLabel(ev.durMin))} · ${esc(ev.cal)}</span>
            </span>
            <span class="freq ${ev.freq ? '' : 'freq--once'}">${esc(ev.freq || 'ponctuel')}</span>
        </div>`;
    }

    function dayCard(d, map) {
        const list = map.get(d) || [];
        const abs = absentNames(d);
        const sup = supportOn(d);
        return `<article class="day-card ${d === D.today ? 'day-card--today' : ''} ${list.length ? '' : 'day-card--empty'}" id="day-${esc(d)}">
            <header class="day-head">
                <span class="day-name">${esc(dayFull(d))}</span>
                <span class="day-date">${esc(ddmm(d))}</span>
                ${d === D.today ? '<span class="day-today-tag">aujourd’hui</span>' : ''}
                <span class="day-meta">
                    ${list.length ? `${list.length} évt` : ''}
                    <button class="day-copy" data-day="${esc(d)}" title="Copier l’agenda de ce jour">📋</button>
                </span>
            </header>
            ${list.length ? list.map(evRow).join('') : '<p class="day-empty">Aucun évènement</p>'}
            ${(abs.length || sup.length) ? `<footer class="day-foot">
                ${sup.length ? `<span>🎧 Support : ${esc(sup.join(', '))}</span>` : ''}
                ${abs.length ? `<span>🏖️ Absents : ${esc(abs.join(', '))}</span>` : ''}
            </footer>` : ''}
        </article>`;
    }

    function renderWeeks(el, days, map) {
        el.innerHTML = weekGroups(days).map(g => `
            <section class="week-col">
                <h3>${esc(g.label)} <span>· ${g.days.length} jour${g.days.length > 1 ? 's' : ''}</span></h3>
                ${g.days.map(d => dayCard(d, map)).join('')}
            </section>`).join('');
    }

    /** Copie d'un seul jour — même format que « AGENDA DU JOUR » déjà en place. */
    function dayCopyText(d, map) {
        const lines = [`:date: *${dayFull(d)} ${ddmm(d)}* — ${D.team}`, ''];
        for (const ev of map.get(d) || []) {
            lines.push(`  ${KINDS[ev.kind].dot} ${isFullDay(ev) ? 'journée' : ev.start} · ${ev.title}${ev.freq ? `  _(${ev.freq})_` : ''}`);
        }
        const abs = absentNames(d);
        if (abs.length) lines.push('', `🏖️ *Absents* : ${abs.join(', ')}`);
        return lines.join('\n');
    }

    /** Branche les deux interactions de l'agenda dense : aller au jour, copier le jour. */
    function bindDense(sparkEl, weeksEl, getMap) {
        sparkEl.addEventListener('click', e => {
            const btn = e.target.closest('.spark-day');
            if (btn) document.getElementById(`day-${btn.dataset.day}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        weeksEl.addEventListener('click', async e => {
            const btn = e.target.closest('.day-copy');
            if (!btn) return;
            try {
                await navigator.clipboard.writeText(dayCopyText(btn.dataset.day, getMap()));
                btn.textContent = '✓';
                setTimeout(() => { btn.textContent = '📋'; }, 1400);
            } catch { /* presse-papiers refusé — rien à faire dans une maquette */ }
        });
    }

    // ── 5. Contrôle de décalage ─────────────────────────────────────────────
    /** Décale toute l'itération de N jours pour éprouver la vue : un férié inséré,
     *  une itération repoussée, et l'on voit immédiatement ce qui bascule sur un
     *  week-end ou sort des bornes. Aucune donnée n'est modifiée — c'est une lecture. */
    function mountShift(el, onChange) {
        function paint() {
            const s = state.shift;
            const imp = shiftImpact();
            const warn = [];
            if (imp.weekend) warn.push(`${imp.weekend} sur un week-end`);
            if (imp.outside) warn.push(`${imp.outside} hors itération`);
            el.innerHTML = `
                <span class="shift-bar-label">🧪 Décalage</span>
                <button class="btn btn-secondary btn-sm" data-shift="-1" title="Reculer d’un jour">− 1 j</button>
                <span class="shift-value ${s ? 'shift-value--on' : ''}">${s > 0 ? '+' : ''}${s} j</span>
                <button class="btn btn-secondary btn-sm" data-shift="1" title="Avancer d’un jour">+ 1 j</button>
                ${s ? '<button class="btn btn-ghost btn-sm" data-shift="0">Rétablir</button>' : ''}
                <span class="shift-bar-hint">déplace tous les évènements — la vue se recalcule</span>
                ${warn.length ? `<span class="shift-warn">⚠️ ${esc(warn.join(' · '))} — non affichés</span>` : ''}`;
        }
        el.addEventListener('click', e => {
            const btn = e.target.closest('[data-shift]');
            if (!btn) return;
            const v = parseInt(btn.dataset.shift, 10);
            state.shift = v === 0 ? 0 : state.shift + v;
            onChange();
            paint();
        });
        paint();
        return paint;
    }

    window.MKParts = {
        WEEK_MINUTES, perWeek, hrs, weeklyLoad,
        renderLoad, renderRhythm, renderSpark, renderWeeks, evRow, dayCard,
        dayCopyText, bindDense, mountShift,
    };
})();
