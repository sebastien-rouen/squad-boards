/**
 * Rail de navigation — une barre d'onglets qui DÉFILE au lieu de passer à la ligne.
 *
 * Le problème qu'il règle, mesuré sur la vue Paramètres (14 onglets, Edge, viewports
 * réels) : une barre en `flex-wrap: wrap` occupait 8 lignes et 227 px sur un iPhone 14,
 * soit plus de la moitié de l'écran, en permanence puisqu'elle est collante. Le contenu
 * n'en voyait que 48 %.
 *
 * Le composant ne fait qu'une chose : rendre la coupe LISIBLE. Un rail qui défile sans le
 * dire est pire qu'une barre qui wrappe — rien ne signale qu'il reste des onglets. D'où
 * les dégradés de bord et les chevrons, qui ne sont pas décoratifs.
 *
 * ⚠️ Le wrapper est créé PAR le composant et c'est LUI qui doit porter `position: sticky`,
 * le fond et les marges négatives : un élément collant placé dans un conteneur à sa taille
 * exacte ne colle pas. Voir `.nav-rail-wrap:has(.settings-tabs)` dans settings.css.
 *
 * Usage :
 *   import { mountNavRail } from '../components/nav-rail.js';
 *   const rail = mountNavRail(nav, { labelPrev: 'Sections précédentes' });
 *   rail.center(nav.querySelector('.is-active'));   // recentrer l'onglet actif
 *   rail.destroy();                                 // avant de re-rendre la vue
 *
 * L'état des chevrons se met à jour tout seul au défilement, au redimensionnement ET au
 * changement de contenu — `refresh()` n'est là que pour les cas qu'aucun observateur ne
 * couvre (une largeur modifiée en JS sans reflow observable, par exemple).
 */

/** Marge de tolérance : sous 2 px, un arrondi de sous-pixel ferait clignoter une flèche. */
const EPS = 2;

/**
 * Transforme une barre en rail défilant.
 * @param {HTMLElement} nav  la barre elle-même (elle reçoit le défilement)
 * @param {object} [opts]
 * @param {string} [opts.labelPrev]  aria-label du chevron gauche
 * @param {string} [opts.labelNext]  aria-label du chevron droit
 * @returns {{wrap: HTMLElement, center: Function, refresh: Function, destroy: Function}|null}
 */
export function mountNavRail(nav, opts = {}) {
    if (!nav) return null;
    const { labelPrev = 'Précédent', labelNext = 'Suivant' } = opts;

    // Idempotent : la vue est re-rendue à chaque navigation, et ré-envelopper à chaque
    // fois empilerait les wrappers (et les listeners) sans que rien ne le signale.
    let wrap = nav.parentElement?.classList.contains('nav-rail-wrap') ? nav.parentElement : null;
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'nav-rail-wrap';
        nav.parentNode.insertBefore(wrap, nav);
        wrap.appendChild(nav);
        wrap.insertAdjacentHTML('afterbegin', `
            <span class="nav-rail-fade nav-rail-fade--l" aria-hidden="true"></span>
            <span class="nav-rail-fade nav-rail-fade--r" aria-hidden="true"></span>
            <button type="button" class="nav-rail-arrow nav-rail-arrow--l" aria-label="${labelPrev}">‹</button>
            <button type="button" class="nav-rail-arrow nav-rail-arrow--r" aria-label="${labelNext}">›</button>`);
    }
    nav.classList.add('nav-rail');

    const arrowL = wrap.querySelector('.nav-rail-arrow--l');
    const arrowR = wrap.querySelector('.nav-rail-arrow--r');

    /**
     * Quel côté a encore des onglets ? Source UNIQUE des chevrons ET des dégradés : deux
     * calculs séparés finiraient par diverger d'un pixel et faire clignoter l'un des deux.
     */
    const refresh = () => {
        const max = nav.scrollWidth - nav.clientWidth;
        // Rien ne dépasse → ni flèches ni dégradés : sur un écran large, le rail doit se
        // comporter exactement comme la barre d'avant.
        wrap.dataset.l = nav.scrollLeft > EPS ? '1' : '0';
        wrap.dataset.r = nav.scrollLeft < max - EPS ? '1' : '0';
    };

    /** Défile d'environ 80 % de la largeur visible : garder un onglet commun entre deux
     *  « pages » évite de perdre le fil. */
    const page = (dir) => nav.scrollBy({ left: dir * nav.clientWidth * 0.8, behavior: 'smooth' });

    /**
     * Recentre un onglet. Indispensable après une activation : sélectionner un onglet situé
     * au bord le laisse sinon à moitié sous le dégradé, et on ne sait plus où on est.
     * `block: 'nearest'` : sans lui, le scrollport de la VUE défile aussi et la page saute.
     */
    const center = (el) => {
        if (!el || !nav.contains(el)) return;
        el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    };

    const onScroll = () => refresh();
    nav.addEventListener('scroll', onScroll, { passive: true });
    arrowL.addEventListener('click', () => page(-1));
    arrowR.addEventListener('click', () => page(1));

    // Le débordement dépend de la largeur disponible : elle change au redimensionnement,
    // mais aussi à l'ouverture de l'info-panel, qui ne déclenche aucun `resize` de fenêtre.
    let ro = null;
    if (typeof ResizeObserver === 'function') {
        ro = new ResizeObserver(refresh);
        ro.observe(nav);
    }
    // ⚠️ …et il dépend AUSSI du contenu, que le ResizeObserver ne voit pas : retirer ou
    // ajouter des onglets change `scrollWidth` sans changer la taille du rail, qui occupe
    // toute la largeur disponible. Mesuré : après retrait de 3 groupes sur 4, `scrollWidth`
    // retombait à `clientWidth` — plus rien ne débordait — mais le chevron droit restait
    // affiché, prêt à faire défiler vers du vide. Le cas n'est pas théorique : les barres
    // à contenu dynamique (chips d'équipe, projets JIRA, personnes d'astreinte) se
    // re-remplissent sans jamais changer de largeur.
    let mo = null;
    if (typeof MutationObserver === 'function') {
        mo = new MutationObserver(refresh);
        // `childList` seul : le composant n'écrit que dans le WRAPPER (fades, chevrons),
        // jamais dans le rail — aucun risque de boucle avec `refresh`, qui ne touche
        // qu'aux `data-*` du wrapper.
        mo.observe(nav, { childList: true, subtree: true });
    }
    refresh();

    return {
        wrap,
        center,
        refresh,
        destroy() {
            nav.removeEventListener('scroll', onScroll);
            ro?.disconnect();
            mo?.disconnect();
        },
    };
}
