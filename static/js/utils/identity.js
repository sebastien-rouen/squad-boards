/**
 * Identité de l'INSTANCE (3.276.0) — nom du projet, initiales du logo, couleur principale, pour distinguer deux
 * instances ouvertes côte à côte. Réglages de projet `sb-project-name` (aussi posé par l'assistant de mise en
 * route) et `sb-brand-color`. « Squad Board » reste le nom de l'OUTIL (exports, comptes rendus).
 * La couleur ne fait que poser `--brand` : les variantes (survol, fond, clair / sombre) se dérivent dans
 * css/identity.css.
 */
import { store } from '../state.js';
import { projectStorage } from '../project-settings.js';

export const APP_NAME = 'Squad Board';
export const NAME_KEY = 'sb-project-name';
export const COLOR_KEY = 'sb-brand-color';

export const projectName = () => (projectStorage.getItem(NAME_KEY) || '').trim() || APP_NAME;
export const projectInitials = (name = projectName()) =>
    name.split(/[\s\-_]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'SB';
export const brandColor = () => { const c = (projectStorage.getItem(COLOR_KEY) || '').trim(); return /^#[0-9a-f]{6}$/i.test(c) ? c : ''; };

/** Applique nom, logo et couleur à la page (barre latérale + racine) — le titre d'onglet relit `projectName()`. */
export function applyIdentity() {
    if (typeof document === 'undefined') return;
    const name = projectName();
    const title = document.querySelector('.sidebar-title');
    if (title) title.textContent = name;
    const logo = document.querySelector('.sidebar-logo');
    if (logo) { logo.textContent = projectInitials(name); logo.title = name; }
    const root = document.documentElement, c = brandColor();
    if (c) { root.style.setProperty('--brand', c); root.dataset.brand = ''; }
    else { root.style.removeProperty('--brand'); delete root.dataset.brand; }
}

store.on('projectSettings', (v, old) => {
    if ((v?.[NAME_KEY] || '') !== (old?.[NAME_KEY] || '') || (v?.[COLOR_KEY] || '') !== (old?.[COLOR_KEY] || '')) {
        applyIdentity();
        store.set('navVersion', (store.get('navVersion') || 0) + 1);   // titre d'onglet et menu se redessinent
    }
});
