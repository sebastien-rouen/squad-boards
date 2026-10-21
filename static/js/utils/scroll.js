/**
 * Défilement programmé SANS `scrollIntoView` (3.237.0) — SOURCE UNIQUE.
 *
 * `scrollIntoView` fait défiler TOUS les ancêtres, document compris : si la page dépasse d'un pixel la fenêtre
 * (élément `absolute` sans ancêtre positionné…), toute l'application glisse et la barre du haut disparaît (vécu en
 * 3.236.0). Ici, seul le conteneur qui défile est bougé.
 *
 * Décalage par défaut = `scroll-padding-top` du conteneur + `scroll-margin-top` de la cible : les réglages CSS
 * existants (barre d'onglets collante de Paramètres, sommaire du Dashboard) sont respectés tels quels.
 */

const _reduce = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Plus proche ancêtre qui défile verticalement (repli : l'élément de défilement du document). */
export function scrollParentOf(el) {
    for (let a = el?.parentElement; a && a !== document.body; a = a.parentElement) {
        const oy = getComputedStyle(a).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && a.scrollHeight > a.clientHeight) return a;
    }
    return document.scrollingElement || document.documentElement;
}

/**
 * Fait défiler `container` (et lui seul) jusqu'à `el`.
 * @param {HTMLElement} container
 * @param {HTMLElement} el
 * @param {{ offset?: number, block?: 'start'|'center', smooth?: boolean }} [o]
 */
export function scrollWithin(container, el, { offset, block = 'start', smooth = true } = {}) {
    if (!container || !el) return;
    const cr = container.getBoundingClientRect(), er = el.getBoundingClientRect();
    const off = offset ?? ((parseFloat(getComputedStyle(container).scrollPaddingTop) || 0) + (parseFloat(getComputedStyle(el).scrollMarginTop) || 0));
    const delta = block === 'center' ? (er.top - cr.top) - (container.clientHeight - er.height) / 2 : (er.top - cr.top) - off;
    container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior: smooth && !_reduce() ? 'smooth' : 'auto' });
}

/** Équivalent sûr de `el.scrollIntoView({ block })` : défile le seul conteneur de `el`. */
export function scrollToEl(el, o = {}) {
    if (el) scrollWithin(scrollParentOf(el), el, o);
}
