/**
 * Poignée de repli du panneau de droite (#info-panel) — desktop (> 1200 px, en dessous le panneau est déjà masqué).
 * Rend ses 260 px aux pages chargées (Dashboard, Rapports…). État retenu par écran (localStorage
 * `sb-info-panel-closed`) ; en mode TV le panneau est masqué d'office (tv.css). 3.237.0.
 */
const KEY = 'sb-info-panel-closed';

export function initPanelToggle() {
    const btn = document.getElementById('info-panel-toggle');
    const layout = btn?.closest('.content-layout');
    if (!btn || !layout) return;
    const apply = closed => {
        layout.classList.toggle('is-panel-closed', closed);
        btn.setAttribute('aria-expanded', String(!closed));
        const lbl = closed ? 'Déplier le panneau latéral' : 'Replier le panneau latéral';
        btn.setAttribute('aria-label', lbl);
        btn.dataset.tooltip = lbl;
    };
    let closed = false;
    try { closed = localStorage.getItem(KEY) === '1'; } catch { /* stockage indisponible : ouvert */ }
    apply(closed);
    btn.addEventListener('click', () => {
        closed = !layout.classList.contains('is-panel-closed');
        apply(closed);
        try { localStorage.setItem(KEY, closed ? '1' : '0'); } catch { /* non retenu */ }
    });
}
