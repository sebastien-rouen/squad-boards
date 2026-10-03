/**
 * Réglages du mode TV — propres à l'écran qui les affiche (localStorage `sb-tv-*` : un mur d'écrans
 * n'a pas les mêmes besoins qu'un portable), modifiables depuis le panneau ⚙ de l'en-tête TV.
 * Chaque changement s'applique tout de suite (rappel `onChange`).
 */

import { esc } from '../utils.js';

const KEYS = { screen: 'sb-tv-seconds', page: 'sb-tv-page-seconds', night: 'sb-tv-night', theme: 'sb-tv-theme' };
const _get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const _set = (k, v) => { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch { /* stockage indisponible : réglage non retenu */ } };

/** Durée imposée à chaque écran (s), ou null = durée propre à chaque écran (20 à 30 s).
 *  ⚠ Sans réglage, `Math.max(5, NaN || 0)` donnait 5 s : chaque écran filait en 5 s. */
export function screenSeconds() { const n = parseInt(_get(KEYS.screen) || '', 10); return n > 0 ? Math.max(5, n) : null; }
/** Durée d'une page des listes paginées (s) — 10 s par défaut. */
export function pageSeconds() { const n = parseInt(_get(KEYS.page) || '', 10); return n > 0 ? Math.max(4, n) : 10; }
/** Mode nuit (19 h → 8 h : bilan du jour seul, tamisé) — actif par défaut. */
export function nightEnabled() { return _get(KEYS.night) !== '0'; }
/** Thème de l'écran : 'dark' (défaut — un mur en thème clair éblouit), 'light', ou 'site' (celui du site). */
export function tvTheme() { const v = _get(KEYS.theme); return v === 'light' || v === 'site' ? v : 'dark'; }

/**
 * Réglages passés dans l'URL — pour configurer un écran mural à distance, sans clavier ni souris :
 * `#tv/all~tv=page:8,ecran:30,nuit:non,theme:clair` (ecran:auto = durée propre à chaque écran ;
 * theme : sombre | clair | site). Ils sont
 * ENREGISTRÉS sur l'écran (comme depuis le panneau ⚙), la TV redémarrant souvent sur son URL.
 * Valeur sans « / » ni « ~ » : un « /ticket/ID » ajouté par la popin reste intact (cf. app.js).
 */
export function applyUrlSettings(hash = location.hash) {
    const m = String(hash).match(/(?:~|%7E)tv=([^~/]*)/i);
    if (!m) return false;
    for (const pair of decodeURIComponent(m[1]).split(',')) {
        const [k, v = ''] = pair.split(':').map(x => x.trim().toLowerCase());
        if (k === 'page' && parseInt(v, 10) > 0) _set(KEYS.page, Math.max(4, parseInt(v, 10)));
        else if (k === 'ecran') _set(KEYS.screen, parseInt(v, 10) > 0 ? Math.max(5, parseInt(v, 10)) : null);
        else if (k === 'nuit') _set(KEYS.night, /^(non|off|0|false)$/.test(v) ? '0' : null);
        else if (k === 'theme') _set(KEYS.theme, /^(clair|light)$/.test(v) ? 'light' : /^(site|auto)$/.test(v) ? 'site' : null);
    }
    return true;
}

const SCREEN_OPTS =[['', 'Selon l\'écran'], ['10', '10 s'], ['20', '20 s'], ['30', '30 s'], ['45', '45 s'], ['60', '1 min']];
const PAGE_OPTS = ['6', '8', '10', '15', '20'];
const THEME_OPTS = [['dark', 'Sombre'], ['light', 'Clair'], ['site', 'Comme le site']];

const _opts = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');

/** Bouton ⚙ + panneau (fermé), à poser dans l'en-tête TV. */
export function settingsHtml() {
    const sc = screenSeconds(), pg = String(pageSeconds());
    return `<button class="btn-icon tv-btn" id="tv-set-btn" type="button" data-tooltip="Réglages" aria-label="Réglages du mode TV" aria-expanded="false" aria-controls="tv-settings">⚙</button>
    <div class="tv-settings" id="tv-settings" role="dialog" aria-label="Réglages du mode TV" hidden>
        <label>Durée d'un écran <select data-k="screen">${_opts(SCREEN_OPTS, sc ? String(sc) : '')}</select></label>
        <label>Durée d'une page <select data-k="page">${_opts(PAGE_OPTS.map(v => [v, `${v} s`]), pg)}</select></label>
        <label>Thème <select data-k="theme">${_opts(THEME_OPTS, tvTheme())}</select></label>
        <label class="tv-settings-check"><input type="checkbox" data-k="night"${nightEnabled() ? ' checked' : ''}> Mode nuit <small>19 h → 8 h : bilan du jour seul</small></label>
        <p class="tv-settings-note">Réglages propres à cet écran.</p>
    </div>`;
}

/** Branche le panneau. Renvoie `isOpen()` et `close()` pour le clavier de la TV (Échap ferme d'abord le panneau). */
export function wireSettings(root, onChange) {
    const btn = root.querySelector('#tv-set-btn'), panel = root.querySelector('#tv-settings');
    const isOpen = () => !panel.hidden;
    const toggle = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) panel.querySelector('select')?.focus(); };
    btn.addEventListener('click', e => { e.stopPropagation(); toggle(!isOpen()); });
    panel.addEventListener('click', e => e.stopPropagation());
    root.addEventListener('click', () => { if (isOpen()) toggle(false); });
    panel.addEventListener('change', e => {
        const k = e.target.dataset.k;
        if (k === 'night') _set(KEYS.night, e.target.checked ? null : '0');
        else if (k === 'theme') _set(KEYS.theme, e.target.value === 'dark' ? null : e.target.value);
        else if (k) _set(KEYS[k], e.target.value);
        onChange();
    });
    return { isOpen, close: () => { toggle(false); btn.focus(); } };
}
