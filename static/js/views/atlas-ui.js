/**
 * Atlas — briques d'interface communes (3.263.0) : avatar, niveau, envie, radar SVG, modale.
 *
 * Couleurs de DONNÉES portées par des classes (`atl-lvl--3`, `atl-ap--forte`) ou par `--c` (équipe) :
 * même code couleur dans la carte, la matrice, la fiche et le tableau de bord. Styles : css/views/atlas-*.css.
 */

import { esc, initials, hashColor, trapFocus } from '../utils.js';
import { SKILL_LEVELS, APPETENCE_VALUES } from './atlas-model.js';

/** Avatar (initiales), cerclé de la couleur d'équipe. size : xs | sm | md | lg | xl */
export const avatarHtml = (name, { size = 'sm', color = hashColor(name), away = false, extra = '' } = {}) =>
    `<span class="atl-av atl-av--${size}${away ? ' is-away' : ''}${extra ? ' ' + extra : ''}" style="--c:${esc(color)}" title="${esc(name)}">${esc(initials(name))}</span>`;

/** Pastille de niveau 0–4 (0 = non évalué), libellé complet en infobulle. */
export const levelHtml = (v, { label = false } = {}) => {
    const l = SKILL_LEVELS[v] || SKILL_LEVELS[0];
    return `<span class="atl-lvl atl-lvl--${l.v}" title="${esc(l.label)}">${l.short}${label ? ` <small>${esc(l.label)}</small>` : ''}</span>`;
};

/** Point d'envie (faible | neutre | forte). */
export const appetenceHtml = a => {
    const m = APPETENCE_VALUES.find(x => x.v === a) || APPETENCE_VALUES[1];
    return `<i class="atl-ap atl-ap--${m.v}" title="Envie ${esc(m.label.toLowerCase())}"></i>`;
};

/** Point de couleur (équipe, ligne produit, catégorie). */
export const dotHtml = color => `<span class="atl-dot" style="--c:${esc(color)}"></span>`;

/** Barre 0–100 ; mod : ok | warn | danger */
export const barHtml = (pct, mod = '') => `<span class="atl-bar${mod ? ' atl-bar--' + mod : ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`;

/**
 * Radar SVG des niveaux (0–4). `axes` = [{ id, label }] ; `values` / `compare` = { id: niveau }.
 * Moins de 3 axes : pas de radar (une forme à 2 sommets ne dit rien), l'appelant affiche une liste.
 */
export function radarHtml(axes, values, { size = 220, compare = null, labels = true } = {}) {
    const n = axes.length;
    if (n < 3) return '';
    const c = size / 2, r = size / 2 - (labels ? 30 : 6);
    const pt = (i, v) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / n;
        return [c + Math.cos(a) * r * v / 4, c + Math.sin(a) * r * v / 4];
    };
    const poly = lv => axes.map((ax, i) => pt(i, lv[ax.id] || 0).map(x => x.toFixed(1)).join(',')).join(' ');
    const ring = v => `<polygon class="atl-radar__ring" points="${axes.map((_, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ')}"/>`;
    const lbl = labels ? axes.map((ax, i) => {
        const [x, y] = pt(i, 5.2);
        return `<text class="atl-radar__lbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(ax.label.length > 14 ? ax.label.slice(0, 13) + '…' : ax.label)}</text>`;
    }).join('') : '';
    return `<svg class="atl-radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Radar des compétences">`
        + [1, 2, 3, 4].map(ring).join('')
        + axes.map((_, i) => { const [x, y] = pt(i, 4); return `<line class="atl-radar__axis" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')
        + (compare ? `<polygon class="atl-radar__cmp" points="${poly(compare)}"/>` : '')
        + `<polygon class="atl-radar__val" points="${poly(values)}"/>${lbl}</svg>`;
}

/**
 * Ouvre une modale accessible (role=dialog, focus piégé, Échap / clic hors de la carte = fermer).
 * Retourne { el, close }. `id` : identifiant stable de la couche (ex. `atlas-membercard-overlay`, lu par la TV).
 */
export function openAtlasModal({ id, title, body, foot = '', wide = false, onClose = null }) {
    document.getElementById(id)?.remove();
    const ov = document.createElement('div');
    ov.id = id;
    ov.className = 'atl-overlay';
    ov.innerHTML = `<section class="atl-modal${wide ? ' atl-modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <header class="atl-modal__head"><h3 id="${id}-title">${title}</h3><button type="button" class="btn-icon atl-modal__x" aria-label="Fermer"><svg class="icon"><use href="#i-x"/></svg></button></header>
        <div class="atl-modal__body">${body}</div>${foot ? `<footer class="atl-modal__foot">${foot}</footer>` : ''}</section>`;
    document.body.appendChild(ov);
    const release = trapFocus(ov.querySelector('.atl-modal'));
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const close = () => {
        document.removeEventListener('keydown', onKey, true);
        release?.();
        ov.remove();
        onClose?.();
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('.atl-modal__x').addEventListener('click', close);
    return { el: ov, close };
}
