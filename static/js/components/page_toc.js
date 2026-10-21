/**
 * Sommaire collant d'une page longue (3.236.0) — Dashboard d'abord (≈ 7 écrans en desktop, 14 en mobile).
 *
 * Une barre en tête de page : une pastille par section PRÉSENTE (les sections absentes — fiche équipe en vue
 * multi-équipes, fin de PI hors dernier sprint… — ne sont pas proposées). Clic → défilement jusqu'à la section
 * + bref halo ; au défilement, la pastille de la section lue s'allume (IntersectionObserver sur le scrollport
 * `#content`, aucun calcul au pixel). Style : css/views/page-toc.css.
 *
 * À rappeler après CHAQUE rendu de la vue : l'observateur précédent est libéré (nœuds remplacés par innerHTML).
 */
import { esc, scrollWithin } from '../utils.js';

let _obs = null;


/**
 * @param {HTMLElement} container  scrollport de la vue (`#content`)
 * @param {{ sel: string, icon: string, label: string }[]} entries  dans l'ordre d'affichage voulu
 */
export function mountPageToc(container, entries) {
    _obs?.disconnect();
    _obs = null;
    container.querySelector(':scope > .ptoc')?.remove();
    const found = entries
        .map(e => ({ ...e, el: container.querySelector(e.sel) }))
        .filter(e => e.el);
    if (found.length < 3) return;   // une page courte n'a pas besoin de sommaire

    found.forEach((e, i) => { e.el.classList.add('ptoc-target'); e.el.dataset.ptoc = String(i); });
    const nav = document.createElement('nav');
    nav.className = 'ptoc';
    nav.setAttribute('aria-label', 'Sommaire de la page');
    nav.innerHTML = `<span class="ptoc-lbl" aria-hidden="true">Aller à</span>${found.map((e, i) =>
        `<button type="button" class="ptoc-chip" data-ptoc-go="${i}"><span aria-hidden="true">${e.icon}</span> ${esc(e.label)}</button>`).join('')}`;
    container.prepend(nav);

    nav.addEventListener('click', ev => {
        const b = ev.target.closest('[data-ptoc-go]');
        if (!b) return;
        const el = found[+b.dataset.ptocGo]?.el;
        if (!el) return;
        scrollWithin(container, el, { offset: nav.offsetHeight + 8 });
        el.classList.remove('ptoc-flash'); void el.offsetWidth; el.classList.add('ptoc-flash');
    });

    // Section « lue » = la plus haute visible dans le tiers haut du scrollport.
    const visible = new Set();
    const chips = [...nav.querySelectorAll('.ptoc-chip')];
    const paint = () => {
        const cur = [...visible].sort((a, b) => a - b)[0];
        chips.forEach((c, i) => { const on = i === cur; c.classList.toggle('is-on', on); if (on) c.setAttribute('aria-current', 'location'); else c.removeAttribute('aria-current'); });
        // Mobile : la pastille reste visible dans la barre. scrollLeft et PAS scrollIntoView — ce dernier remonte
        // aux ancêtres et interromprait le défilement fluide de la page lancé par un clic.
        const c = chips[cur];
        if (c && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = c.offsetLeft - (nav.clientWidth - c.offsetWidth) / 2;
    };
    _obs = new IntersectionObserver(list => {
        list.forEach(en => { const i = +en.target.dataset.ptoc; if (en.isIntersecting) visible.add(i); else visible.delete(i); });
        paint();
    }, { root: container, rootMargin: '-60px 0px -65% 0px' });
    found.forEach(e => _obs.observe(e.el));
}
