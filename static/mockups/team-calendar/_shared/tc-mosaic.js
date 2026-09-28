/* Direction C — « Mosaïque » : l'itération en cases (Apple Calendrier / Notion) + agenda du jour.
 * Parti pris : le coup d'œil. Une case par jour ouvré ; le détail vit dans le panneau latéral.
 * En comparaison, chaque case montre une ligne par équipe (pastilles de nature).
 * Mobile (≤ 640 px) : cases à pastilles seules, agenda du jour dessous.
 */
(function () {
    'use strict';
    const T = window.TC, C = T.C, esc = T.esc;
    const mobile = () => window.matchMedia('(max-width: 640px)').matches;
    const MAX_LINES = 4;
    // Jalons qui méritent d'être vus dans la case même quand elle déborde
    const MILESTONE = new Set(['planning', 'demo', 'retro', 'train']);

    const line = e => `<button class="tc-ev tcm-line${e.corrected ? ' is-corrected' : ''}" data-id="${esc(e.id)}" data-k="${e.kind}" title="${esc(e.title)}">
        <i></i><span class="tcm-t">${T.hhmm(e.startMin)}</span><span class="tcm-n">${esc(e.title)}</span></button>`;
    const avatar = e => `<span class="tcm-av" data-k="${e.kind}" title="${esc(e.title)}">${esc((e.person || e.title).slice(0, 2).toUpperCase())}</span>`;

    function dayEvents(evs, d) {
        return {
            all: evs.filter(e => T.covers(e, d)),
            timed: evs.filter(e => !e.allDay && e.day === d).sort((a, b) => a.startMin - b.startMin),
        };
    }

    /** Case d'un jour : seule équipe → lignes (jalons en premier si ça déborde) ; comparaison → une rangée de pastilles par équipe. */
    function cellBody(d, lanes, byLane, compact) {
        if (lanes.length === 1) {
            const { all, timed } = dayEvents(byLane[lanes[0].key] || [], d);
            if (compact) return `<div class="tcm-dots">${timed.map(e => `<i data-k="${e.kind}"></i>`).join('')}</div>`;
            const shown = timed.length > MAX_LINES
                ? [...timed.filter(e => MILESTONE.has(e.kind)), ...timed.filter(e => !MILESTONE.has(e.kind))].slice(0, MAX_LINES - 1).sort((a, b) => a.startMin - b.startMin)
                : timed;
            return `${all.length ? `<div class="tcm-avs">${all.map(avatar).join('')}</div>` : ''}
                ${shown.map(line).join('')}
                ${timed.length > shown.length ? `<span class="tcm-more">+ ${timed.length - shown.length} autres</span>` : ''}`;
        }
        return lanes.map(l => {
            const { timed } = dayEvents(byLane[l.key] || [], d);
            return `<div class="tcm-teamrow" style="--team:${l.color}" title="${esc(l.label)} · ${timed.length} évènement(s)">
                <b>${esc(l.common ? 'Commun' : l.label.slice(0, 3))}</b><span>${timed.map(e => `<i data-k="${e.kind}" title="${esc(e.title)}"></i>`).join('')}</span></div>`;
        }).join('');
    }

    function agenda(st, d, lanes, byLane) {
        const groups = lanes.map(l => {
            const { all, timed } = dayEvents(byLane[l.key] || [], d);
            if (!all.length && !timed.length) return '';
            return `<div class="tcm-group" style="--team:${l.color}">
                ${lanes.length > 1 ? `<h6>${esc(l.label)}</h6>` : ''}
                ${all.length ? `<div class="tc-allday">${all.map(e => `<button class="tc-tag tc-ev" data-id="${esc(e.id)}" data-k="${e.kind}">${C.NATURES[e.kind].emoji} ${esc(e.person || e.title)}</button>`).join('')}</div>` : ''}
                ${timed.map(e => `<button class="tc-ev tcm-item" data-id="${esc(e.id)}" data-k="${e.kind}">
                    <span class="tcm-when">${T.hhmm(e.startMin)}<small>${T.durLabel(e.endMin - e.startMin)}</small></span>
                    <span class="tcm-what"><b>${C.NATURES[e.kind].emoji} ${esc(e.title)}</b><small>${esc(C.NATURES[e.kind].label)} · ${esc(C.SCOPES[e.scope].label)}</small></span>
                </button>`).join('')}
            </div>`;
        }).join('');
        return `<aside class="tcm-agenda" aria-label="Agenda du ${esc(T.fmtLong(d))}">
            <header><b>${esc(T.fmtLong(d))}</b>${d === T.D.today ? '<span>Aujourd’hui</span>' : ''}</header>
            ${groups || '<p class="tcm-free">🌤️ Aucune réunion ce jour-là.</p>'}
        </aside>`;
    }

    function html(st, p, lanes, byLane) {
        const compact = mobile();
        const day = p.days.includes(st.cDay) ? st.cDay : (p.days.includes(T.D.today) ? T.D.today : p.days[0]);
        st.cDay = day;
        // Case = cellule focalisable, PAS un <button> : elle contient des évènements qui en sont
        // (boutons imbriqués = HTML invalide, le navigateur casse la structure)
        const cells = p.days.map(d => `<div class="tcm-cell${d === day ? ' is-on' : ''}${d === T.D.today ? ' is-today' : ''}" data-cday="${d}"
            role="gridcell" tabindex="0" aria-selected="${d === day}" aria-label="${esc(T.fmtLong(d))}">
            <span class="tcm-date"><span>${T.DAY[T.dow(d)]}</span><b>${+d.slice(8, 10)}</b></span>
            ${cellBody(d, lanes, byLane, compact)}
        </div>`).join('');
        return `<div class="tcm${compact ? ' tcm--compact' : ''}">
            <div class="tcm-grid" role="grid">${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.'].map(n => `<div class="tcm-colhead">${n}</div>`).join('')}${padFirst(p.days)}${cells}</div>
            ${agenda(st, day, lanes, byLane)}
        </div>`;
    }

    /** Cases vides avant le premier jour si l'itération ne commence pas un lundi. */
    function padFirst(days) {
        const lead = (T.dow(days[0]) + 6) % 7;
        return '<span class="tcm-pad"></span>'.repeat(Math.min(lead, 4));
    }

    window.TCViews = window.TCViews || {};
    window.TCViews.mosaic = {
        html,
        after(el, st) {
            const pick = d => { st.cDay = d; window.TCApp.render(el, st); el.querySelector(`[data-cday="${d}"]`)?.focus(); };
            el.querySelectorAll('[data-cday]').forEach(b => {
                b.addEventListener('click', e => { if (!e.target.closest('.tc-ev')) pick(b.dataset.cday); });  // un évènement ouvre sa fiche
                b.addEventListener('keydown', e => {
                    const days = [...el.querySelectorAll('[data-cday]')].map(x => x.dataset.cday);
                    const i = days.indexOf(b.dataset.cday);
                    const to = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[e.key];
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(b.dataset.cday); }
                    else if (to && days[i + to]) { e.preventDefault(); pick(days[i + to]); }
                });
            });
        },
    };
})();
