/**
 * Etats d'AFFICHAGE de la grille Rotation Support : panneaux plies, PI epingle, mode
 * « Conges seuls ». Aucun de ces reglages ne touche la base — ils vivent en localStorage
 * comme le reste des preferences de la grille (`rot-mpw-*`, `rot-mode-*`, `rot-inactive`).
 *
 * Extrait de settings-rotation.js (3.162.0), qui depassait les 800 lignes.
 */

import { store } from '../state.js';

/** État collapse par équipe (localStorage) */
function _rotIsCollapsed(team) {
    try { const s = JSON.parse(localStorage.getItem('rot-collapsed') || '{}'); return s[team] !== false; } catch { return true; }
}
function _rotSetCollapsed(team, val) {
    try { const s = JSON.parse(localStorage.getItem('rot-collapsed') || '{}'); s[team] = val; localStorage.setItem('rot-collapsed', JSON.stringify(s)); } catch {}
}

// L'offset PI de la rotation lit directement store.get('piOffset') — piloté par le topbar.
const _rotPiOff = () => store.get('piOffset') || 0;

// ── Mode « Congés seuls » ───────────────────────────────────────────────────
// Masque les marques d'affectation support de la grille pour ne laisser lire que les
// congés des membres. Purement visuel (classe CSS sur #rot-panels) : rien n'est modifié
// en base, et les cellules deviennent non cliquables tant que le mode est actif — un clic
// sur une case dont on ne voit plus l'état affecterait quelqu'un à l'aveugle.
const ROT_HIDE_KEY = 'rot-hide-support';
const _rotSupportHidden = () => localStorage.getItem(ROT_HIDE_KEY) === 'true';

/** Barre d'outils au-dessus des panneaux — rendue par settings.js, câblée une seule fois. */
function _rotToolbarHtml() {
    const off = _rotSupportHidden();
    return `<div class="rot-toolbar">
        <button type="button" class="btn btn-sm ${off ? 'btn-primary' : 'btn-secondary'} rot-hide-btn"
                id="rot-toggle-support" aria-pressed="${off}"
                title="${off ? 'Réafficher les affectations support dans la grille' : 'Masquer les affectations support pour ne lire que les congés'}">
            ${off ? '🛎️ Afficher le support' : '🌴 Congés seuls'}
        </button>
        <span class="rot-toolbar-hint text-xs text-muted">${off
            ? 'Support masqué — la grille ne montre que les congés (🟥 journée, 🟧 demi-journée). Grille non modifiable.'
            : 'Masque les affectations support pour lire d’un coup d’œil les congés de l’équipe.'}</span>
    </div>`;
}

/** Câble le toggle « Congés seuls ». À appeler UNE fois au montage de la vue Paramètres :
 *  la barre vit hors de #rot-panels, elle n'est donc pas recâblée par _rotRenderPanels. */
function _rotWireToolbar(container) {
    const btn = container.querySelector('#rot-toggle-support');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const next = !_rotSupportHidden();
        localStorage.setItem(ROT_HIDE_KEY, String(next));
        container.querySelector('#rot-panels')?.classList.toggle('rot-hide-support', next);
        // Ré-étiquette le bouton et son aide sans re-rendre la grille (coûteux et inutile :
        // le masquage est entièrement CSS).
        const bar = btn.closest('.rot-toolbar');
        if (bar) {
            bar.outerHTML = _rotToolbarHtml();
            _rotWireToolbar(container);
        }
    });
}

export {
    _rotIsCollapsed, _rotSetCollapsed, _rotPiOff,
    _rotSupportHidden, _rotToolbarHtml, _rotWireToolbar,
};
