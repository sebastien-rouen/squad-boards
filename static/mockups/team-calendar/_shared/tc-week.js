/* Direction A — « Semaine » : grille horaire standard (Google Agenda / Outlook).
 * Comparaison = sous-colonnes par équipe dans chaque jour (vue « ressources »).
 * Mobile (≤ 640 px) = vue Jour + sélecteur de jours, le standard des applis d'agenda.
 */
(function () {
    'use strict';
    const T = window.TC, C = T.C, esc = T.esc;
    const H0 = 8, H1 = 19;                              // plage horaire affichée
    const mobile = () => window.matchMedia('(max-width: 640px)').matches;

    // Titre COURT (sans emoji ni nom d'équipe : la couleur et la colonne le disent déjà), sur 1 à 3
    // lignes selon la hauteur du bloc ; l'heure seulement s'il reste la place. Titre complet en infobulle.
    const evBtn = (e, style) => {
        const dur = e.endMin - e.startMin;
        // Lignes selon la hauteur RÉELLE du bloc (52 px/h, 14 px/ligne) — miroir du site (team_calendar_views.js)
        const room = Math.max(1, Math.floor((dur / 60 * 52 - 10) / 14));
        const withTime = room >= 4, lines = withTime ? room - 1 : room;
        return `<button class="tc-ev ${lines > 1 ? 'tc-ev--multi' : 'tc-ev--l1'}${e.corrected ? ' is-corrected' : ''}" data-id="${esc(e.id)}" data-k="${e.kind}" style="${style};--lines:${lines}"
        title="${esc(`${C.NATURES[e.kind].emoji} ${e.title} · ${T.hhmm(e.startMin)}–${T.hhmm(e.endMin)}`)}">
        <span class="tc-ev-t">${esc(T.shortTitle(e.title, e.team))}</span>
        ${withTime ? `<span class="tc-ev-h">${T.hhmm(e.startMin)} – ${T.hhmm(e.endMin)}</span>` : ''}
    </button>`;
    };

    /** Blocs positionnés d'un couloir pour un jour. Jusqu'à 2 chevauchements : côte à côte ;
     *  au-delà (ou colonne étroite en comparaison) : cascade décalée façon Google Agenda — diviser
     *  la largeur donnait 31 blocs de moins de 28 px en comparant 3 équipes (mesuré). */
    function column(evs, narrow) {
        return T.layoutDay(evs.filter(e => !e.allDay)).map(e => {
            const top = (Math.max(e.startMin, H0 * 60) - H0 * 60) / 60;
            const h = Math.max(0.3, (Math.min(e.endMin, H1 * 60) - Math.max(e.startMin, H0 * 60)) / 60);
            const cascade = e._lanes > 2 || (narrow && e._lanes > 1);
            const w = 100 / e._lanes;
            const x = cascade ? `left:calc(${e._lane * 10}px + 1px);width:calc(100% - ${e._lane * 10}px - 3px);z-index:${1 + e._lane}`
                              : `left:calc(${e._lane * w}% + 1px);width:calc(${w}% - 3px)`;
            return evBtn(e, `position:absolute;top:calc(${top} * var(--tc-hour));height:calc(${h} * var(--tc-hour) - 2px);${x}`);
        }).join('');
    }

    /** Bandeau journée : support et absences deviennent des étiquettes à prénom. */
    function alldayTags(evs, day) {
        return evs.filter(e => T.covers(e, day)).map(e => {
            const label = e.person || e.title;
            return `<button class="tc-tag tc-ev" data-id="${esc(e.id)}" data-k="${e.kind}" title="${esc(e.title)}">${C.NATURES[e.kind].emoji} ${esc(label)}</button>`;
        }).join('');
    }

    function hours() {
        let h = '';
        for (let i = H0; i < H1; i++) h += `<div class="tcw-hour"><span>${i}h</span></div>`;
        return h;
    }

    function nowLine(day) {
        if (day !== window.TC.D.today) return '';
        const m = 10 * 60 + 15;   // maquette : « maintenant » figé à 10 h 15
        return `<div class="tcw-now" style="top:calc(${(m - H0 * 60) / 60} * var(--tc-hour))"></div>`;
    }

    function desktop(st, p, lanes, byLane) {
        const multi = lanes.length > 1;
        const head = p.days.map(d => `<div class="tcw-dayhead${d === T.D.today ? ' is-today' : ''}">
            <span class="tcw-dow">${T.DAY[T.dow(d)]}</span><span class="tcw-num">${+d.slice(8, 10)}</span>
            ${multi ? `<div class="tcw-sublabels">${lanes.map(l => `<span style="--team:${l.color}" title="${esc(l.label)}">${esc(l.common ? 'Commun' : l.label)}</span>`).join('')}</div>` : ''}
        </div>`).join('');
        const allday = p.days.map(d => `<div class="tcw-allday-cell">${lanes.map(l => `<div class="tc-allday" style="--team:${l.color}">${alldayTags(byLane[l.key] || [], d)}</div>`).join('')}</div>`).join('');
        const cols = p.days.map(d => `<div class="tcw-day${d === T.D.today ? ' is-today' : ''}">
            ${lanes.map(l => `<div class="tcw-lane${l.common ? ' is-common' : ''}" style="--team:${l.color}">${column((byLane[l.key] || []).filter(e => e.day === d), lanes.length > 1)}</div>`).join('')}
            ${nowLine(d)}
        </div>`).join('');
        return `<div class="tcw" style="--days:${p.days.length};--lanes:${lanes.length}">
            <div class="tcw-corner"></div>${head}
            <div class="tcw-corner tcw-corner--allday">Journée</div>${allday}
            <div class="tcw-gutter">${hours()}</div>
            <div class="tcw-cols">${cols}</div>
        </div>`;
    }

    function phone(st, p, lanes, byLane) {
        const day = p.days.includes(st.mDay) ? st.mDay : (p.days.includes(T.D.today) ? T.D.today : p.days[0]);
        st.mDay = day;
        const strip = p.days.map(d => `<button class="tc-pick${d === day ? ' is-on' : ''}${d === T.D.today ? ' is-today' : ''}" data-mday="${d}">
            <span>${T.DAY[T.dow(d)]}</span><b>${+d.slice(8, 10)}</b>
            <i>${lanes.map(l => (byLane[l.key] || []).some(e => e.day === d && !e.allDay) ? `<em style="--team:${l.color}"></em>` : '').join('')}</i>
        </button>`).join('');
        const tags = lanes.map(l => alldayTags(byLane[l.key] || [], day)).join('');
        return `<div class="tcw-phone">
            <div class="tc-strip" role="tablist" aria-label="Jour">${strip}</div>
            ${tags ? `<div class="tc-allday tcw-mtags">${tags}</div>` : ''}
            <div class="tcw tcw--one" style="--days:1;--lanes:${lanes.length}">
                ${lanes.length > 1 ? `<div class="tcw-corner"></div><div class="tcw-dayhead"><div class="tcw-sublabels">${lanes.map(l => `<span style="--team:${l.color}">${esc(l.common ? 'Commun' : l.label)}</span>`).join('')}</div></div>` : ''}
                <div class="tcw-gutter">${hours()}</div>
                <div class="tcw-cols"><div class="tcw-day${day === T.D.today ? ' is-today' : ''}">
                    ${lanes.map(l => `<div class="tcw-lane${l.common ? ' is-common' : ''}" style="--team:${l.color}">${column((byLane[l.key] || []).filter(e => e.day === day), lanes.length > 2)}</div>`).join('')}
                    ${nowLine(day)}
                </div></div>
            </div>
        </div>`;
    }

    window.TCViews = window.TCViews || {};
    window.TCViews.week = {
        html: (st, p, lanes, byLane) => (mobile() ? phone : desktop)(st, p, lanes, byLane),
        after(el, st) {
            el.querySelectorAll('[data-mday]').forEach(b => b.addEventListener('click', () => { st.mDay = b.dataset.mday; window.TCApp.render(el, st); }));
        },
    };
})();
