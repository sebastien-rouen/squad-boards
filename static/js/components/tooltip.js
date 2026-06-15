/**
 * Tooltip global léger — affiche le texte de [data-tooltip] dans un singleton thémé,
 * en remplacement du title="" natif (délai ~1s, non thémé, illisible en dense).
 *
 * Délégué sur document → fonctionne aussi pour les éléments rendus dynamiquement,
 * sans ré-attacher d'écouteurs. Attribut DISTINCT de `data-tip` (tooltip riche calendrier).
 * Accessibilité : garder un aria-label/texte sur les boutons icône (le tooltip est visuel).
 */
let _tip = null;
let _timer = null;

function _ensure() {
    if (_tip) return _tip;
    _tip = document.createElement('div');
    _tip.className = 'app-tooltip';
    _tip.setAttribute('role', 'tooltip');
    document.body.appendChild(_tip);
    return _tip;
}

function _position(target) {
    const t = _ensure();
    const r = target.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const gap = 8;
    let top = r.top - tr.height - gap;
    const below = top < 4;
    if (below) top = r.bottom + gap;
    let left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tr.width - 4));
    t.style.top = `${Math.round(top)}px`;
    t.style.left = `${Math.round(left)}px`;
    t.classList.toggle('app-tooltip--below', below);
}

function _show(el) {
    const text = el.getAttribute('data-tooltip');
    if (!text) return;
    const t = _ensure();
    t.textContent = text;
    t.classList.add('visible');
    _position(el);
}

function _hide() {
    clearTimeout(_timer);
    if (_tip) _tip.classList.remove('visible');
}

export function initTooltips() {
    if (window.__tooltipsInit) return;
    window.__tooltipsInit = true;

    document.addEventListener('mouseover', e => {
        const el = e.target.closest?.('[data-tooltip]');
        if (!el) return;
        clearTimeout(_timer);
        _timer = setTimeout(() => _show(el), 350);
    });
    document.addEventListener('mouseout', e => {
        if (e.target.closest?.('[data-tooltip]')) _hide();
    });
    // Clavier : focus = affiche immédiatement (a11y), blur = masque
    document.addEventListener('focusin', e => {
        const el = e.target.closest?.('[data-tooltip]');
        if (el) _show(el);
    });
    document.addEventListener('focusout', _hide);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') _hide(); });
    // Scroll/resize : la position fixe se périme → on masque
    window.addEventListener('scroll', _hide, true);
    window.addEventListener('resize', _hide);
}
