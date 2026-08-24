/**
 * Briques DOM de base : échappement HTML, piège à focus, notifications toast.
 * Aucune dépendance — c'est la feuille du graphe d'imports.
 *
 * Extrait de utils.js (v3.141.5) — utils.js reste le point d'entrée et ré-exporte tout,
 * aucun import des vues n'a changé.
 */

/** Escape HTML to prevent XSS. */
export function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

// ── Piège à focus (modales) ───────────────────────────────────────────────────
const _FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
    + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Piège le focus clavier dans `root` (modale) : Tab/Shift+Tab bouclent à l'intérieur,
 * et le focus est restauré sur l'élément actif au moment de l'appel quand on libère.
 * @returns {() => void} release — à appeler à la fermeture de la modale.
 */
export function trapFocus(root) {
    const prev = document.activeElement;
    const onKey = (e) => {
        if (e.key !== 'Tab' || !root.isConnected) return;
        const els = [...root.querySelectorAll(_FOCUSABLE_SEL)]
            .filter(el => el.offsetParent !== null || el === document.activeElement);
        if (!els.length) { e.preventDefault(); return; }
        const first = els[0], last = els[els.length - 1];
        const inside = root.contains(document.activeElement);
        if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
        document.removeEventListener('keydown', onKey, true);
        if (prev && document.contains(prev) && typeof prev.focus === 'function') prev.focus();
    };
}

/** Show a toast notification. */
export function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    // Les erreurs sont annoncées immédiatement aux lecteurs d'écran (le conteneur est
    // role="status" aria-live="polite" pour les autres types — cf index.html).
    if (type === 'error') el.setAttribute('role', 'alert');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-out');
        el.addEventListener('animationend', () => el.remove());
    }, duration);
}
