/**
 * Composants HTML communs aux quatre directions — balisage seulement, le style vit dans
 * `_shared/ui.css` (tokens `--ui-*` : chaque direction les habille via son pont de tokens).
 * Couleurs de DONNÉES (équipe, niveau, appétence) portées par des CLASSES (`t-alpha`, `lvl--3`,
 * `ap--forte`) : jamais de couleur en dur dans le balisage.
 */
const D = require('./data.cjs');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const tc = team => `t-${slug(team)}`;

/** Avatar (initiales, couleur d'équipe). size : xs | sm | md | lg | xl */
const av = (p, size = 'sm', extra = '') =>
    `<span class="av av--${size} ${tc(p.team)}${extra ? ' ' + extra : ''}" title="${esc(p.name)} · ${esc(p.team)}">${esc(p.initials)}</span>`;

/** Pastille de niveau 0–4 (0 = non évalué). */
const lvl = (v, label = false) =>
    `<span class="lvl lvl--${v}" title="${esc(D.LEVELS[v].label)}">${D.LEVELS[v].short}${label ? ` <small>${esc(D.LEVELS[v].label)}</small>` : ''}</span>`;

/** Point d'appétence. */
const ap = a => `<i class="ap ap--${a}" title="Appétence ${a}"></i>`;

const chip = (txt, mod = '') => `<span class="chip${mod ? ' chip--' + mod : ''}">${txt}</span>`;
const btn = (txt, mod = '') => `<button class="btn${mod ? ' ' + mod.split(' ').map(m => 'btn--' + m).join(' ') : ''}">${txt}</button>`;
const teamDot = team => `<span class="tdot ${tc(team)}"></span>`;

/** Barre de progression (0–100) ; mod : ok | warn | danger */
const bar = (pct, mod = '') => `<span class="bar${mod ? ' bar--' + mod : ''}"><i style="width:${pct}%"></i></span>`;

/** Radar SVG des compétences d'une personne (ou d'une équipe : niveaux moyens). */
function radar(levels, { size = 180, ids = D.SKILLS.map(s => s.id), compare = null, labels = true } = {}) {
    const c = size / 2, r = size / 2 - (labels ? 26 : 6), n = ids.length;
    const pt = (i, v) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / n;
        return [c + Math.cos(a) * r * v / 4, c + Math.sin(a) * r * v / 4];
    };
    const poly = lv => ids.map((id, i) => pt(i, lv[id] || 0).map(x => x.toFixed(1)).join(',')).join(' ');
    const rings = [1, 2, 3, 4].map(v => `<polygon class="radar__ring" points="${ids.map((_, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ')}"/>`).join('');
    const axes = ids.map((_, i) => { const [x, y] = pt(i, 4); return `<line class="radar__axis" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
    const lbl = labels ? ids.map((id, i) => { const [x, y] = pt(i, 5.1); return `<text class="radar__lbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(D.skill(id).label)}</text>`; }).join('') : '';
    return `<svg class="radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Radar des compétences">${rings}${axes}`
        + (compare ? `<polygon class="radar__cmp" points="${poly(compare)}"/>` : '')
        + `<polygon class="radar__val" points="${poly(levels)}"/>${lbl}</svg>`;
}

/** Niveaux moyens d'une équipe, par compétence (pour un radar d'équipe). */
const teamLevels = team => Object.fromEntries(D.SKILLS.map(s => [s.id, D.avgLevel(s.id, D.byTeam(team))]));

/** Écran mobile : barre haute + contenu + barre d'onglets (cadre téléphone ou écran isolé). */
const screen = ({ top = '', body, tabbar = '', solo = false, cls = '' }) =>
    `<div class="screen${solo ? ' screen--solo' : ''}${cls ? ' ' + cls : ''}"><div class="scr-clip"><div class="app">${top}<main class="app__body">${body}</main>${tabbar}</div></div></div>`;

const topbar = (title, { back = false, actions = '' , sub = '' } = {}) =>
    `<header class="topbar">${back ? '<button class="btn btn--icon btn--ghost" title="Retour">←</button>' : '<span class="topbar__logo">🧬</span>'}`
    + `<div class="topbar__title"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${actions}</header>`;

const TABS = [['carte', '🗺️', 'Carte'], ['matrice', '🎯', 'Matrice'], ['bord', '📊', 'Bord'], ['mobilite', '🧭', 'Mobilité'], ['catalogue', '⚙️', 'Catalogue']];
const tabbar = on => `<nav class="tabbar">${TABS.map(([k, i, l]) => `<button class="tabbar__item${k === on ? ' tabbar__item--on' : ''}"><i>${i}</i>${l}</button>`).join('')}</nav>`;

/** Onglets horizontaux (dans la page). */
const tabs = (list, on) => `<div class="tabs" role="tablist">${list.map(t => `<button class="tabs__item${t === on ? ' tabs__item--on' : ''}" role="tab">${t}</button>`).join('')}</div>`;
const seg = (list, on) => `<div class="seg">${list.map(t => `<button class="seg__item${t === on ? ' seg__item--on' : ''}">${t}</button>`).join('')}</div>`;

/** Feuille du bas (mobile) / modale (desktop). */
const sheet = (title, body, foot = '') => `<div class="scrim"></div><section class="sheet"><span class="sheet__grip"></span><h3 class="sheet__title">${title}</h3><div class="sheet__body">${body}</div>${foot ? `<footer class="sheet__foot">${foot}</footer>` : ''}</section>`;
const modal = (title, body, foot = '', mod = '') => `<div class="scrim"></div><section class="modal${mod ? ' modal--' + mod : ''}" role="dialog" aria-modal="true"><header class="modal__head"><h3>${title}</h3><button class="btn btn--icon btn--ghost" title="Fermer">✕</button></header><div class="modal__body">${body}</div>${foot ? `<footer class="modal__foot">${foot}</footer>` : ''}</section>`;
const toast = (txt, action = 'Annuler') => `<div class="toast"><span>${txt}</span><button class="toast__btn">${action}</button></div>`;
const empty = (icon, title, text, action = '') => `<div class="empty"><span class="empty__icon">${icon}</span><b>${title}</b><p>${text}</p>${action}</div>`;
const field = (label, input, hint = '') => `<label class="field"><span class="field__lbl">${label}</span>${input}${hint ? `<small class="field__hint">${hint}</small>` : ''}</label>`;

/** Sélecteur de niveau 1–4 (+ non évalué), la valeur courante marquée. */
const levelPicker = cur => `<div class="lvlpick">${D.LEVELS.map(l => `<button class="lvlpick__opt lvl--${l.v}${l.v === cur ? ' lvlpick__opt--on' : ''}"><b>${l.short}</b><span>${esc(l.label)}</span></button>`).join('')}</div>`;
const appPicker = cur => `<div class="seg seg--app">${['faible', 'neutre', 'forte'].map(a => `<button class="seg__item${a === cur ? ' seg__item--on' : ''}">${ap(a)} ${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>`;

/** Rail de l'application (barre latérale réduite de Squad Board, Atlas actif). */
const appRail = () => `<nav class="rail"><span class="rail__logo">⚡</span>${[['📊', 'Dashboard'], ['🗂️', 'Board'], ['📅', 'PI'], ['🛟', 'Support'], ['🧬', 'Atlas', 1], ['📈', 'Rapports'], ['⚙️', 'Paramètres']].map(([i, t, on]) => `<button class="rail__item${on ? ' rail__item--on' : ''}" title="${t}">${i}</button>`).join('')}</nav>`;

/** Coquille desktop : rail | principal (barre + corps) | panneau latéral optionnel. */
const desk = ({ mod = '', top, body, side = '' }) =>
    `<div class="desk${mod ? ' desk--' + mod : ''}${side ? '' : ' desk--noside'}">${appRail()}<div class="desk__main"><div class="desk__top">${top}</div><div class="desk__body">${body}</div></div>${side ? `<aside class="desk__side">${side}</aside>` : ''}</div>`;

const deskTop = (title, on, extra = '') =>
    `<h1>🧬 Atlas <small>${title}</small></h1>${tabs(['🗺️ Carte', '🎯 Matrice', '📊 Tableau de bord', '🧭 Mobilité', '⚙️ Catalogue'], on)}<span class="spacer"></span>${extra}`;

module.exports = { D, esc, slug, tc, av, lvl, ap, chip, btn, teamDot, bar, radar, teamLevels, screen, topbar, tabbar, tabs, seg, sheet, modal, toast, empty, field, levelPicker, appPicker, appRail, desk, deskTop };
