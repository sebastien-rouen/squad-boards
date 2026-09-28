/* Direction D — « Synthèse » : la clarté de A pour la semaine, le sprint entier de B pour l'itération.
 * Le sélecteur Semaine / Itération choisit à la fois la PÉRIODE et la REPRÉSENTATION, comme la
 * bascule Jour / Semaine / Mois des agendas standard. Filtres, comparaison et fiche sont conservés.
 * Zoom : un en-tête de jour de l'itération ouvre sa semaine en grille horaire ; « Tout le sprint »
 * en revient. Dépend de tc-week.js et tc-lanes.js (aucun rendu propre : pas de 3ᵉ implémentation).
 */
(function () {
    'use strict';
    const T = window.TC, esc = T.esc;
    const V = () => window.TCViews;
    const inner = st => (st.period === 'iteration' ? V().lanes : V().week);

    /** Fil d'Ariane de zoom au-dessus de la grille horaire : on sait d'où l'on vient et comment y revenir. */
    function backBar(st) {
        const it = T.iterationOf(st.team, st.anchor);
        if (st.period !== 'week' || !it) return '';
        const mon = T.mondayOf(st.anchor);
        const n = T.workdays(it.start, T.addDays(it.end, -1)).findIndex(d => d >= mon);
        const wk = n < 0 ? '' : ` · semaine ${Math.floor(n / 5) + 1} sur ${Math.ceil(T.workdays(it.start, T.addDays(it.end, -1)).length / 5)}`;
        return `<div class="tch-crumb">
            <button class="tch-back" data-period-to="iteration">↩ Tout le sprint ${esc(it.label)}</button>
            <span>Semaine du ${esc(T.fmtDate(mon))}${esc(wk)}</span>
        </div>`;
    }

    /** 3 équipes en grille horaire = 4 sous-colonnes par jour : trop étroit pour lire un titre (mesuré).
     *  Plutôt qu'une grille illisible, on propose la représentation qui tient : l'itération. */
    function crowdHint(st) {
        if (st.period !== 'week' || st.compare.length < 2) return '';
        return `<div class="tch-hint">💡 ${st.compare.length + 1} équipes en semaine, c'est serré — les titres se lisent en entier
            <button class="tch-back" data-period-to="iteration">sur l'itération</button> ou au survol d'un bloc.</div>`;
    }

    window.TCViews = window.TCViews || {};
    window.TCViews.hybrid = {
        html: (st, p, lanes, byLane) => `<div class="tch tch--${st.period}">${backBar(st)}${crowdHint(st)}${inner(st).html(st, p, lanes, byLane)}</div>`,
        after(el, st) {
            const v = inner(st);
            if (v.after) v.after(el, st);
            el.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
                st.period = 'week'; st.anchor = b.dataset.zoom; st.mDay = b.dataset.zoom; window.TCApp.render(el, st);
            }));
            el.querySelectorAll('[data-period-to]').forEach(b => b.addEventListener('click', () => {
                st.period = b.dataset.periodTo; window.TCApp.render(el, st);
            }));
        },
    };
})();
