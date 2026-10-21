/**
 * 🪙 « Le jeton part au pot » (3.241.0) — à l'enregistrement d'une estimation Poker, le jeton choisi quitte le
 * rail et glisse en arc jusqu'au centre de la table, s'y pose (onde dorée + « 5 pts »), puis s'efface.
 *
 * Purement visuel : un CLONE posé sur `document.body` (la popin se re-rend toutes les 3 s et peut se fermer /
 * passer au ticket suivant pendant le vol — le clone y survit). Web Animations API, rien à libérer : tout est
 * retiré à la fin (`finished`). Styles : `.pk-fly*` (css/views/poker-table.css). Sans effet si l'utilisateur
 * réduit les animations.
 */
const _reduce = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} ov    overlay de la popin Poker
 * @param {number}      pts   valeur enregistrée
 */
export function flyPokerChip(ov, pts) {
    if (_reduce()) return;
    const from = ov.querySelector('.poker-save-chip.is-on');
    const table = ov.querySelector('.poker-body');
    if (!from || !table) return;
    const a = from.getBoundingClientRect(), t = table.getBoundingClientRect();
    const size = a.width;
    const cx = t.left + t.width / 2 - size / 2, cy = t.top + t.height / 2 - size / 2;

    const chip = from.cloneNode(true);
    chip.removeAttribute('id');
    chip.setAttribute('aria-hidden', 'true');
    chip.classList.add('pk-fly');
    chip.style.left = `${a.left}px`; chip.style.top = `${a.top}px`; chip.style.width = chip.style.height = `${size}px`;
    document.body.appendChild(chip);

    // Arc : montée au-dessus de la ligne droite, deux tours de toupie, posé un peu plus gros
    const dx = cx - a.left, dy = cy - a.top, lift = Math.min(160, Math.abs(dx) * .35 + 60);
    const fly = chip.animate([
        { transform: 'translate(0, 0) rotate(0) scale(1)', offset: 0 },
        { transform: `translate(${dx * .5}px, ${dy * .5 - lift}px) rotate(380deg) scale(1.35)`, offset: .5 },
        { transform: `translate(${dx}px, ${dy}px) rotate(720deg) scale(1.6)`, offset: .86 },
        { transform: `translate(${dx}px, ${dy}px) rotate(720deg) scale(1.45)`, offset: 1 },
    ], { duration: 760, easing: 'cubic-bezier(.45, .05, .3, 1)', fill: 'forwards' });

    fly.finished.then(() => {
        // Onde dorée + étiquette « +N pts » au point d'impact
        const ring = document.createElement('span');
        ring.className = 'pk-fly-ring';
        ring.style.left = `${cx + size / 2}px`; ring.style.top = `${cy + size / 2}px`;
        const tag = document.createElement('span');
        tag.className = 'pk-fly-tag';
        tag.textContent = `${pts} pts`;
        tag.style.left = `${cx + size / 2}px`; tag.style.top = `${cy - 6}px`;
        document.body.append(ring, tag);
        const done = Promise.all([
            ring.animate([{ transform: 'translate(-50%, -50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(2.6)', opacity: 0 }],
                { duration: 700, easing: 'ease-out', fill: 'forwards' }).finished,
            tag.animate([{ transform: 'translate(-50%, 0)', opacity: 0 }, { transform: 'translate(-50%, -22px)', opacity: 1, offset: .3 }, { transform: 'translate(-50%, -40px)', opacity: 0 }],
                { duration: 1100, easing: 'ease-out', fill: 'forwards' }).finished,
            chip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 450, fill: 'forwards' }).finished,
        ]);
        done.finally(() => { chip.remove(); ring.remove(); tag.remove(); });
    }).catch(() => chip.remove());
}
