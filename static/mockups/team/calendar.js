/* ════════════════════════════════════════════════════════════════════════════
   Carte « Calendrier de l'équipe » — visible, exportable, remaniable.
   S'appuie sur le socle des maquettes agenda (../agenda/shell.js + parts.js)
   pour le typage Scrum/SAFe/Ops, la déduction de cadence et les dates.
   Script classique, pour rester ouvrable en file://.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const { D, KINDS, esc, dayIdx, dayName, ddmm, workDays, startsWeek, durLabel,
            recurringRituals, visible, DAY_LONG } = window.MK;
    const { hrs, WEEK_MINUTES } = window.MKParts;

    const T = window.TEAM_MOCK;
    const LS = 'sb-mockup-team-cal';

    const H_START = 9 * 60, H_END = 18.5 * 60;
    const PX_PER_MIN = 0.62;
    const GRID_H = (H_END - H_START) * PX_PER_MIN;
    const SNAP = 15;                                  // minutes

    const days = workDays(D.iteration.start, D.iteration.end);
    const FREQS = ['tous les jours', '1x/sem.', '1x/ité.', '1x/mois'];
    const perWeek = f => f === 'tous les jours' ? 5 : f === '1x/sem.' ? 1
        : f === '1x/ité.' ? 0.5 : f === '1x/mois' ? 0.23 : 0;

    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const hFr  = m => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;

    // ── Modèle éditable ─────────────────────────────────────────────────────
    /** Part des rituels réellement détectés dans les calendriers de l'équipe et
     *  les transforme en RÈGLES modifiables (jour de semaine + heure + cadence),
     *  ce qui est le bon niveau pour remanier : on édite le rituel, pas chacune
     *  de ses occurrences. */
    function baseline() {
        return recurringRituals(visible()).map((r, i) => ({
            id: `r${i}`,
            title: r.title,
            kind: r.kind,
            dow: r.freq === 'tous les jours' ? 0 : dayIdx(r.days[0]),   // 0 = tous les jours ouvrés
            startMin: r.startMin,
            durMin: r.durMin,
            freq: r.freq,
            enabled: true,
            // Jours de SEMAINE systématiquement sautés (le daily de Fuego saute le lundi).
            // Dédupliqué : l'itération compte deux lundis, la règle n'en retient qu'un.
            skipDays: r.freq === 'tous les jours'
                ? [...new Set(days.filter(d => !r.days.includes(d)).map(dayIdx))]
                : [],
        }));
    }

    let model = [];
    let selectedId = null;
    let view = 'iteration';      // iteration | week

    function load() {
        const base = baseline();
        try {
            const saved = JSON.parse(localStorage.getItem(LS) || 'null');
            if (saved && Array.isArray(saved.model) && saved.model.length) return saved.model;
        } catch { /* stockage illisible : on repart de la détection */ }
        return base;
    }
    const save = () => localStorage.setItem(LS, JSON.stringify({ model }));

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
            if (ch.length) out.push(`✏️ ${r.title} — ${ch.join(', ')}`);
        }
        for (const b of base.values()) {
            if (!model.some(r => r.id === b.id)) out.push(`🗑️ ${b.title} — supprimé`);
        }
        return out;
    }

    // ── Projection sur les jours réels de l'itération ───────────────────────
    /** Quels jours de l'itération porte ce rituel, compte tenu de sa cadence. */
    function occurrences(r) {
        if (!r.enabled) return [];
        if (r.freq === 'tous les jours') return days.filter(d => !r.skipDays.includes(dayIdx(d)));
        const hits = days.filter(d => dayIdx(d) === r.dow);
        if (r.freq === '1x/sem.') return hits;
        if (r.freq === '1x/ité.') return hits.filter((_, i) => i % 2 === 0);
        return hits.slice(0, 1);                                        // 1x/mois
    }

    const load7 = () => model.filter(r => r.enabled)
        .reduce((s, r) => s + r.durMin * perWeek(r.freq), 0);

    // ── Rendu de la grille ──────────────────────────────────────────────────
    function cols() {
        return view === 'iteration'
            ? days.map(d => ({ key: d, label: dayName(d), sub: ddmm(d), dow: dayIdx(d) }))
            : [1, 2, 3, 4, 5].map(i => ({ key: `w${i}`, label: DAY_LONG[i], sub: '', dow: i }));
    }

    /** Blocs à poser dans chaque colonne, selon la vue. */
    function blocksFor(col) {
        return model.filter(r => {
            if (view === 'week') {
                return r.freq === 'tous les jours'
                    ? !r.skipDays.includes(col.dow)
                    : r.dow === col.dow;
            }
            return occurrences(r).includes(col.key);
        });
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
            const week = view === 'iteration' && startsWeek(c.key, i);
            html += `<div class="wgrid-head ${week ? 'wgrid-head--week' : ''} ${c.key === D.today ? 'wgrid-head--today' : ''}">
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
            const week = view === 'iteration' && startsWeek(c.key, i);
            html += `<div class="wgrid-col ${week ? 'wgrid-col--week' : ''} ${c.key === D.today ? 'wgrid-col--today' : ''}"
                          data-col="${i}" style="--hour-h:${60 * PX_PER_MIN}px"></div>`;
        });
        C.forEach((c, i) => {
            for (const r of layout(blocksFor(c))) {
                const top = Math.max(0, (r.startMin - H_START) * PX_PER_MIN);
                const h = Math.max(20, Math.min(r.durMin, H_END - r.startMin) * PX_PER_MIN);
                const w = pct(1) / r._lanes;
                html += `<div class="rit ${KINDS[r.kind].cls} ${r.id === selectedId ? 'rit--selected' : ''} ${r.enabled ? '' : 'rit--off'}"
                              tabindex="0" role="button" data-id="${esc(r.id)}" data-col="${i}"
                              aria-label="${esc(r.title)}, ${esc(hFr(r.startMin))}, ${esc(durLabel(r.durMin))}"
                              style="top:${top}px;height:${h}px;left:calc(${pct(i) + r._lane * w}% + 3px);width:calc(${w}% - 6px)"
                              title="${esc(r.title)} — ${esc(hFr(r.startMin))} · ${esc(durLabel(r.durMin))} · ${esc(r.freq)}">
                    <span class="rit-title">${esc(r.title)}</span>
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
                <b>${esc(r.title)}</b>
                <small>${esc(r.dow ? DAY_LONG[r.dow] : 'tous les jours')} ${esc(hFr(r.startMin))} · ${esc(r.freq)}</small>
            </div>`).join('');
    }

    // ── Charge et état ──────────────────────────────────────────────────────
    function renderLoadBar() {
        const by = { scrum: 0, safe: 0, ops: 0 };
        for (const r of model) if (r.enabled) by[r.kind] += r.durMin * perWeek(r.freq);
        const busy = by.scrum + by.safe + by.ops;
        const free = Math.max(0, WEEK_MINUTES - busy);
        const pc = v => Math.round(v / WEEK_MINUTES * 100);
        const seg = (cls, v, label) => v <= 0 ? '' :
            `<span class="${cls}" style="width:${v / WEEK_MINUTES * 100}%" title="${esc(label)} : ${esc(hrs(v))}"></span>`;
        document.getElementById('tcal-load').innerHTML = `
            <div class="load-label">Charge de rituels</div>
            <div class="load-value">${esc(hrs(busy))} <small>/ semaine · ${esc(hrs(free))} de libre</small></div>
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
                <span class="is-free">🟢 Libre <b>${pc(free)} %</b></span>
            </div>`;
    }

    function renderStatus() {
        const d = diff();
        const el = document.getElementById('tcal-status');
        el.className = `tcal-status ${d.length ? 'tcal-status--dirty' : ''}`;
        el.innerHTML = d.length
            ? `<div>
                   <strong>${d.length} modification${d.length > 1 ? 's' : ''}</strong> par rapport aux calendriers détectés
                   <ul class="tcal-diff">${d.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
               </div>
               <span class="tcal-status-actions">
                   <button class="btn btn-secondary btn-sm" id="tcal-reset">↺ Rétablir la détection</button>
               </span>`
            : `<span>Calendrier conforme aux invitations détectées — glisse un rituel pour le remanier.</span>`;
    }

    // ── Panneau d'édition ───────────────────────────────────────────────────
    function renderEdit() {
        const el = document.getElementById('tcal-edit');
        const r = model.find(x => x.id === selectedId);
        if (!r) { el.hidden = true; return; }
        el.hidden = false;
        el.className = `tcal-edit ${KINDS[r.kind].cls}`;
        el.innerHTML = `
            <div class="tcal-edit-row">
                <div class="tcal-field tcal-field--title">
                    <label for="e-title">Rituel</label>
                    <input id="e-title" type="text" value="${esc(r.title)}">
                </div>
                <div class="tcal-field">
                    <label for="e-kind">Famille</label>
                    <select id="e-kind">
                        ${Object.entries(KINDS).map(([k, m]) =>
                            `<option value="${k}" ${k === r.kind ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
                    </select>
                </div>
                <div class="tcal-field">
                    <label for="e-freq">Cadence</label>
                    <select id="e-freq">
                        ${FREQS.map(f => `<option value="${esc(f)}" ${f === r.freq ? 'selected' : ''}>${esc(f)}</option>`).join('')}
                    </select>
                </div>
                <div class="tcal-field">
                    <label for="e-dow">Jour</label>
                    <select id="e-dow" ${r.freq === 'tous les jours' ? 'disabled' : ''}>
                        ${[1, 2, 3, 4, 5].map(i => `<option value="${i}" ${i === r.dow ? 'selected' : ''}>${esc(DAY_LONG[i])}</option>`).join('')}
                    </select>
                </div>
                <div class="tcal-field">
                    <label for="e-start">Heure</label>
                    <input id="e-start" type="time" step="300" value="${hhmm(r.startMin)}">
                </div>
                <div class="tcal-field">
                    <label for="e-dur">Durée (min)</label>
                    <input id="e-dur" type="number" min="15" max="480" step="15" value="${r.durMin}" style="width:88px">
                </div>
                <span class="tcal-edit-actions">
                    <button class="btn btn-secondary btn-sm" id="e-toggle">${r.enabled ? '⏸️ Désactiver' : '▶️ Réactiver'}</button>
                    <button class="btn btn-secondary btn-sm" id="e-dup">⧉ Dupliquer</button>
                    <button class="btn btn-danger btn-sm" id="e-del">🗑️ Supprimer</button>
                </span>
            </div>
            <p class="tcal-hint">
                Glisse le bloc pour le déplacer, ou au clavier : <kbd>←</kbd> <kbd>→</kbd> changent de jour,
                <kbd>↑</kbd> <kbd>↓</kbd> décalent de 15 min, <kbd>Suppr</kbd> retire le rituel.
            </p>`;

        const upd = (fn) => { fn(); save(); render(); };
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
        el.querySelector('#e-dup').addEventListener('click', () => upd(() => {
            const copy = { ...r, id: `n${Date.now()}`, title: `${r.title} (copie)` };
            model.push(copy);
            selectedId = copy.id;
        }));
        el.querySelector('#e-del').addEventListener('click', () => upd(() => {
            model = model.filter(x => x.id !== r.id);
            selectedId = null;
        }));
    }

    function render() {
        renderGrid();
        renderList();
        renderLoadBar();
        renderStatus();
        renderEdit();
    }

    // ── Sélection, glisser-déposer, clavier ─────────────────────────────────
    function colFromX(bodyEl, clientX) {
        const rect = bodyEl.getBoundingClientRect();
        const N = cols().length;
        const i = Math.floor((clientX - rect.left) / rect.width * N);
        return Math.max(0, Math.min(N - 1, i));
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

            const body = document.getElementById('tcal-body');
            const rect = body.getBoundingClientRect();
            const startY = e.clientY;
            const originMin = r.startMin;
            let moved = false;

            block.setPointerCapture(e.pointerId);
            block.classList.add('rit--dragging');

            const onMove = ev => {
                moved = true;
                // Heure : position verticale, arrondie au quart d'heure
                const dMin = (ev.clientY - startY) / PX_PER_MIN;
                let min = Math.round((originMin + dMin) / SNAP) * SNAP;
                min = Math.max(H_START, Math.min(H_END - r.durMin, min));
                r.startMin = min;
                // Jour : colonne survolée
                const ci = colFromX(body, ev.clientX);
                const col = cols()[ci];
                if (col && r.freq !== 'tous les jours') r.dow = col.dow;
                body.querySelectorAll('.wgrid-col').forEach((c, i) =>
                    c.classList.toggle('wgrid-col--drop', i === ci));
                // Retour visuel immédiat sans re-rendre toute la grille
                block.style.top = `${(r.startMin - H_START) * PX_PER_MIN}px`;
                block.querySelector('.rit-meta').textContent = `${hFr(r.startMin)} · ${r.freq}`;
                void rect;
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

    // ── Exports ─────────────────────────────────────────────────────────────
    const pad = n => String(n).padStart(2, '0');
    const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

    /** Première date de l'itération portant ce rituel — sert de DTSTART. */
    function firstDate(r) {
        const occ = occurrences(r);
        return occ[0] || days[0];
    }

    function icsText() {
        const stamp = `${D.iteration.start.replace(/-/g, '')}T090000`;
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
                       `PRODID:-//Squad Board//Calendrier ${T.team}//FR`, 'CALSCALE:GREGORIAN'];
        for (const r of model) {
            if (!r.enabled) continue;
            const d = firstDate(r).replace(/-/g, '');
            const st = `${d}T${pad(Math.floor(r.startMin / 60))}${pad(r.startMin % 60)}00`;
            const endMin = r.startMin + r.durMin;
            const en = `${d}T${pad(Math.floor(endMin / 60))}${pad(endMin % 60)}00`;
            // Un « quotidien » qui saute des jours doit les exclure du BYDAY, sinon
            // l'export réintroduit dans l'agenda des occurrences qui n'existent pas :
            // chez Fuego le daily ne se tient pas le lundi (remplacé par le weekly).
            const byday = [1, 2, 3, 4, 5].filter(i => !(r.skipDays || []).includes(i))
                .map(i => ICS_DAY[i]).join(',');
            const rule = r.freq === 'tous les jours' ? `FREQ=WEEKLY;BYDAY=${byday || 'MO,TU,WE,TH,FR'}`
                : r.freq === '1x/sem.' ? `FREQ=WEEKLY;BYDAY=${ICS_DAY[r.dow]}`
                : r.freq === '1x/ité.' ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${ICS_DAY[r.dow]}`
                : `FREQ=MONTHLY;BYDAY=1${ICS_DAY[r.dow]}`;
            lines.push('BEGIN:VEVENT',
                `UID:${r.id}-${T.team.toLowerCase()}@squad-board`,
                `DTSTAMP:${stamp}`,
                `DTSTART;TZID=Europe/Paris:${st}`,
                `DTEND;TZID=Europe/Paris:${en}`,
                `RRULE:${rule}`,
                `SUMMARY:${r.title.replace(/[,;\\]/g, m => '\\' + m)}`,
                `CATEGORIES:${KINDS[r.kind].short}`,
                'END:VEVENT');
        }
        lines.push('END:VCALENDAR');
        // RFC 5545 : les lignes se terminent par CRLF
        return lines.join('\r\n') + '\r\n';
    }

    function csvText() {
        const rows = [['Rituel', 'Famille', 'Cadence', 'Jour', 'Heure', 'Durée (min)', 'Occurrences sur l’itération', 'Actif']];
        for (const r of model) {
            const skipped = (r.skipDays || []).filter(i => i >= 1 && i <= 5).map(i => DAY_LONG[i]);
            const jour = r.dow ? DAY_LONG[r.dow]
                : skipped.length ? `tous les jours sauf ${skipped.join(', ')}` : 'tous les jours';
            rows.push([r.title, KINDS[r.kind].short, r.freq, jour, hFr(r.startMin),
                       r.durMin, occurrences(r).length, r.enabled ? 'oui' : 'non']);
        }
        // Point-virgule + BOM : Excel francophone ouvre le fichier sans assistant d'import
        return '﻿' + rows.map(r => r.map(v => {
            const s = String(v);
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(';')).join('\r\n');
    }

    function slackText() {
        const lines = [`:calendar: *Calendrier de l’équipe ${T.team}* — cadence des rituels`, ''];
        const order = ['tous les jours', '1x/sem.', '1x/ité.', '1x/mois'];
        for (const f of order) {
            const list = model.filter(r => r.enabled && r.freq === f)
                .sort((a, b) => a.dow - b.dow || a.startMin - b.startMin);
            if (!list.length) continue;
            lines.push(`*${f}*`);
            for (const r of list) {
                const skipped = (r.skipDays || []).filter(i => i >= 1 && i <= 5).map(i => DAY_LONG[i]);
                const when = r.dow ? `${DAY_LONG[r.dow]} ${hFr(r.startMin)}`
                    : `${hFr(r.startMin)}${skipped.length ? ` (sauf ${skipped.join(', ')})` : ''}`;
                lines.push(`  ${KINDS[r.kind].dot} ${r.title} — ${when} (${durLabel(r.durMin)})`);
            }
            lines.push('');
        }
        const busy = load7();
        lines.push(`_${hrs(busy)} de rituels par semaine — reste ${hrs(Math.max(0, WEEK_MINUTES - busy))} sur une base de ${hrs(WEEK_MINUTES)}._`);
        return lines.join('\n');
    }

    function download(name, text, mime) {
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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

        const slug = T.team.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        menu.querySelector('#exp-ics').addEventListener('click', () =>
            download(`calendrier-${slug}.ics`, icsText(), 'text/calendar'));
        menu.querySelector('#exp-csv').addEventListener('click', () =>
            download(`calendrier-${slug}.csv`, csvText(), 'text/csv'));
        menu.querySelector('#exp-slack').addEventListener('click', async () => {
            const btn = menu.querySelector('#exp-slack');
            try {
                await navigator.clipboard.writeText(slackText());
                const old = btn.innerHTML;
                btn.innerHTML = '✓ Copié dans le presse-papiers';
                setTimeout(() => { btn.innerHTML = old; }, 1600);
            } catch { /* presse-papiers refusé */ }
        });
        menu.querySelector('#exp-print').addEventListener('click', () => window.print());

        document.getElementById('tcal-add').addEventListener('click', () => {
            const r = { id: `n${Date.now()}`, title: 'Nouveau rituel', kind: 'scrum', dow: 1,
                        startMin: 10 * 60, durMin: 30, freq: '1x/sem.', enabled: true, skipDays: [] };
            model.push(r);
            selectedId = r.id;
            save();
            render();
            document.getElementById('e-title')?.focus();
        });

        document.getElementById('tcal-status').addEventListener('click', e => {
            if (!e.target.closest('#tcal-reset')) return;
            localStorage.removeItem(LS);
            model = baseline();
            selectedId = null;
            render();
        });
    }

    // ── Démarrage ───────────────────────────────────────────────────────────
    model = load();
    bindGrid();
    bindTools();
    render();

    window.TCAL = { icsText, csvText, slackText, occurrences, diff, get model() { return model; } };
})();
