/**
 * Copier l'image d'un graphique (Chart.js) — ou d'une section entière — dans le presse-papiers.
 *
 * Le canvas Chart.js est TRANSPARENT : collé tel quel, un graphique du thème sombre (texte clair) devient
 * illisible sur le fond blanc de Teams / Slack / Confluence. L'image est donc composée sur le fond
 * RÉEL de sa carte (couleur calculée, donc celle du thème actif, clair ou sombre), titre en tête —
 * l'image collée se comprend seule. Les couleurs du graphique sont déjà celles du thème (lues au rendu,
 * cf. `redrawAllCharts`).
 *
 * Trois points d'entrée, tous en DÉLÉGATION (`initChartCopy`, une fois au démarrage) — un bouton injecté
 * n'importe où (vue re-rendue, popin) fonctionne sans câblage :
 *   - `[data-chart-copy="<id canvas>"]`   : un graphique (en-tête de carte, bouton flottant de chart_zoom.js) ;
 *   - vue agrandie (chart_zoom.js)        : `copyChartImage(id, titre, { bgEl, explain })` — encadré d'explication ;
 *   - `[data-section-copy="<sélecteur>"]` : une section entière (indicateurs + graphiques en grille).
 * Refus du navigateur (permissions, Firefox ancien) → téléchargement du PNG, annoncé.
 */
import { toast } from '../utils.js';

/** Fond effectif d'un élément : première couleur non transparente en remontant le DOM. */
function _bgOf(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c;
    }
    return getComputedStyle(document.body).backgroundColor || '#fff';
}

/** Découpe `text` en lignes de largeur ≤ `max` (police courante de `g`). */
function _wrap(g, text, max) {
    const out = [];
    for (const para of String(text).split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const next = line ? `${line} ${word}` : word;
            if (line && g.measureText(next).width > max) { out.push(line); line = word; }
            else line = next;
        }
        out.push(line);
    }
    return out;
}

const _dprOf = canvas => canvas.width / (canvas.clientWidth || canvas.width) || 1;

/** Tuile = titre + graphique. */
function _tile(canvas, title, { dpr, font, color }) {
    const titleH = title ? Math.round(26 * dpr) : 0;
    return {
        w: canvas.width,
        h: titleH + canvas.height,
        draw(g, x, y) {
            g.textBaseline = 'top';
            g.fillStyle = color;
            if (title) { g.font = `600 ${Math.round(14 * dpr)}px ${font}`; g.fillText(title, x, y); }
            g.drawImage(canvas, x, y + titleH);
        },
    };
}

// ── Explication en encadré (image de la vue agrandie) ──────────────────────────
// Avant : des lignes de texte brut sous le graphique, sans hiérarchie (retour utilisateur). Désormais
// un encadré teinté, une COLONNE par section (« 👁 Lecture », « 💡 Interprétation »), titres, puces à
// retrait suspendu, et le GRAS des repères (<strong>) conservé comme à l'écran.

/** HTML (<strong>, <em>) → segments { t, b } ; le reste devient du texte simple. */
function _runs(html) {
    const d = document.createElement('div');
    d.innerHTML = String(html || '');
    const out = [];
    const walk = (node, bold) => node.childNodes.forEach(n => {
        if (n.nodeType === 3) out.push({ t: n.textContent, b: bold });
        else if (n.nodeType === 1) walk(n, bold || /^(STRONG|B)$/.test(n.tagName));
    });
    walk(d, false);
    return out;
}

/** Lignes d'un texte enrichi : [[{ t, b, x }]] — coupure au mot, chaque mot mesuré dans SA graisse. */
function _richLines(g, runs, max, fontOf) {
    const lines = [[]];
    let x = 0;
    for (const r of runs) {
        for (const tok of r.t.split(/(\s+)/)) {
            if (!tok) continue;
            const space = /^\s+$/.test(tok);
            if (space && x === 0) continue;                       // pas d'espace en début de ligne
            g.font = fontOf(r.b);
            const w = g.measureText(space ? ' ' : tok).width;
            if (!space && x > 0 && x + w > max) { lines.push([]); x = 0; }
            lines.at(-1).push({ t: space ? ' ' : tok, b: r.b, x });
            x += w;
        }
    }
    return lines;
}

/**
 * Encadré d'explication : mesure puis dessin. `sections` = [{ icon, title, intro (HTML), items: [HTML] }].
 * @returns {{ h: number, draw: (g, x, y) => void }}
 */
function _explainPanel(sections, width, dpr, font, colors) {
    const pad = Math.round(14 * dpr), gap = Math.round(18 * dpr), px = Math.round(12.5 * dpr);
    const lineH = Math.round(18 * dpr), titleH = Math.round(24 * dpr), itemGap = Math.round(4 * dpr), bullet = Math.round(14 * dpr);
    const fontOf = b => `${b ? 600 : 400} ${px}px ${font}`;
    const cols = sections.length;
    // Colonnes : la 1re (Lecture, plus longue) un peu plus large.
    const inner = width - pad * 2 - gap * (cols - 1);
    const colW = cols === 2 ? [Math.round(inner * 0.56), inner - Math.round(inner * 0.56)] : Array(cols).fill(inner / cols);
    const probe = document.createElement('canvas').getContext('2d');
    const laid = sections.map((s, i) => {
        const intro = s.intro ? _richLines(probe, _runs(s.intro), colW[i], fontOf) : [];
        const items = (s.items || []).map(it => _richLines(probe, _runs(it), colW[i] - bullet, fontOf));
        const h = titleH + intro.length * lineH + (intro.length && items.length ? itemGap * 2 : 0)
            + items.reduce((a, l) => a + l.length * lineH + itemGap, 0);
        return { s, intro, items, h };
    });
    const h = pad * 2 + Math.max(...laid.map(c => c.h));
    return {
        h,
        draw(g, x0, y0) {
            g.save();
            g.fillStyle = colors.panel;
            if (g.roundRect) { g.beginPath(); g.roundRect(x0, y0, width, h, Math.round(10 * dpr)); g.fill(); }
            else g.fillRect(x0, y0, width, h);
            g.textBaseline = 'top';
            const text = (line, x, y) => line.forEach(w => { g.font = fontOf(w.b); g.fillStyle = w.b ? colors.strong : colors.text; g.fillText(w.t, x + w.x, y); });
            let cx = x0 + pad;
            laid.forEach((c, i) => {
                let y = y0 + pad;
                g.font = `700 ${Math.round(14 * dpr)}px ${font}`;
                g.fillStyle = colors.strong;
                g.fillText(`${c.s.icon} ${c.s.title}`, cx, y);
                y += titleH;
                c.intro.forEach(l => { text(l, cx, y); y += lineH; });
                if (c.intro.length && c.items.length) y += itemGap * 2;
                c.items.forEach(lines => {
                    g.font = fontOf(false); g.fillStyle = colors.muted;
                    g.fillText('•', cx + Math.round(3 * dpr), y);
                    lines.forEach(l => { text(l, cx + bullet, y); y += lineH; });
                    y += itemGap;
                });
                // Filet vertical entre les colonnes.
                if (i < laid.length - 1) {
                    g.fillStyle = colors.rule;
                    g.fillRect(cx + colW[i] + gap / 2, y0 + pad, Math.max(1, Math.round(dpr)), h - pad * 2);
                }
                cx += colW[i] + gap;
            });
            g.restore();
        },
    };
}

const _toBlob = out => new Promise((resolve, reject) => out.toBlob(b => (b ? resolve(b) : reject(new Error('PNG vide'))), 'image/png'));
const _cssVar = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

/**
 * PNG (Blob) d'un graphique sur le fond de sa carte, titre compris.
 * @param {{ bgEl?: Element, explain?: Array<{ icon: string, title: string, intro?: string, items?: string[] }> }} [o]
 *   `bgEl` : élément dont on prend le fond et la couleur du texte (défaut : la `.card` du canvas) ;
 *   `explain` : sections d'explication (HTML léger) dessinées en ENCADRÉ sous le graphique.
 */
export function chartImageBlob(canvas, title = '', { bgEl = null, explain = [] } = {}) {
    const host = bgEl || canvas.closest('.card') || canvas.parentElement;
    const cs = getComputedStyle(host.querySelector('.card-title, .chart-zoom-title') || host);
    const font = cs.fontFamily || 'system-ui, sans-serif';
    const dpr = _dprOf(canvas), pad = Math.round(16 * dpr);
    const t = _tile(canvas, title, { dpr, font, color: cs.color });
    const panel = explain.length ? _explainPanel(explain, t.w, dpr, font, {
        panel: _cssVar('--bg-alt', 'rgba(148,163,184,0.12)'), strong: cs.color,
        text: _cssVar('--text-secondary', cs.color), muted: _cssVar('--text-muted', cs.color), rule: _cssVar('--border', 'rgba(148,163,184,0.4)'),
    }) : null;
    const gapPanel = panel ? Math.round(14 * dpr) : 0;
    const out = document.createElement('canvas');
    out.width = t.w + pad * 2;
    out.height = t.h + pad * 2 + (panel ? gapPanel + panel.h : 0);
    const g = out.getContext('2d');
    g.fillStyle = _bgOf(host);
    g.fillRect(0, 0, out.width, out.height);
    t.draw(g, pad, pad);
    panel?.draw(g, pad, pad + t.h + gapPanel);
    return _toBlob(out);
}

/**
 * PNG (Blob) d'une SECTION : en-tête, ligne d'indicateurs, puis ses graphiques en grille (titre de
 * chaque carte compris). Les graphiques vides (pas de canvas dessiné) sont sautés.
 * @param {Element} root   la section
 * @param {string} heading en-tête de l'image
 */
export function sectionImageBlob(root, heading = '', { cols = 2 } = {}) {
    const canvases = [...root.querySelectorAll('.chart-container canvas')].filter(c => c.width && c.height && c.offsetParent);
    if (!canvases.length) return Promise.reject(new Error('aucun graphique affiché'));
    const cs = getComputedStyle(root.querySelector('.card-title') || root);
    const dpr = _dprOf(canvases[0]), pad = Math.round(16 * dpr), gap = Math.round(14 * dpr);
    const font = cs.fontFamily || 'system-ui, sans-serif', color = cs.color;
    const tiles = canvases.map(c => _tile(c, c.closest('.card')?.querySelector('.card-title')?.textContent.trim() || '', { dpr, font, color }));
    // Indicateurs (chips HTML du rapport) → une ligne de texte : « Complétion 60 % (6/10 tickets) · … »
    const kpis = [...root.querySelectorAll('.rpt-kpi-chip')].map(ch =>
        [...ch.querySelectorAll('.rpt-kpi-label, .rpt-kpi-value, .rpt-kpi-sub')].map(x => x.textContent.trim()).filter(Boolean).join(' ')).join('  ·  ');
    const colW = Array.from({ length: cols }, (_, i) => Math.max(0, ...tiles.filter((_, k) => k % cols === i).map(t => t.w)));
    const rows = Math.ceil(tiles.length / cols);
    const rowH = Array.from({ length: rows }, (_, r) => Math.max(...tiles.slice(r * cols, r * cols + cols).map(t => t.h)));
    const width = colW.reduce((a, b) => a + b, 0) + gap * (cols - 1) + pad * 2;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `400 ${Math.round(13 * dpr)}px ${font}`;
    const kpiLines = kpis ? _wrap(probe, kpis, width - pad * 2) : [];
    const headH = (heading ? Math.round(30 * dpr) : 0) + kpiLines.length * Math.round(19 * dpr) + (heading || kpiLines.length ? Math.round(10 * dpr) : 0);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = pad * 2 + headH + rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1);
    const g = out.getContext('2d');
    g.fillStyle = _bgOf(root.querySelector('.card') || root);
    g.fillRect(0, 0, out.width, out.height);
    g.textBaseline = 'top';
    g.fillStyle = color;
    let y = pad;
    if (heading) { g.font = `700 ${Math.round(17 * dpr)}px ${font}`; g.fillText(heading, pad, y); y += Math.round(30 * dpr); }
    g.font = `400 ${Math.round(13 * dpr)}px ${font}`;
    for (const l of kpiLines) { g.fillText(l, pad, y); y += Math.round(19 * dpr); }
    if (heading || kpiLines.length) y += Math.round(10 * dpr);
    tiles.forEach((t, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const x = pad + colW.slice(0, c).reduce((a, b) => a + b, 0) + gap * c;
        const ty = y + rowH.slice(0, r).reduce((a, b) => a + b, 0) + gap * r;
        t.draw(g, x, ty);
    });
    return _toBlob(out);
}

const _slug = s => String(s || 'graphique').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

function _download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Presse-papiers (promesse passée à ClipboardItem : le geste utilisateur reste valide, Safari l'exige). */
async function _toClipboard(blobPromise, filename, okMsg) {
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
        toast(okMsg, 'success');
    } catch {
        try {
            _download(await blobPromise, filename);
            toast('Copie d’image refusée par le navigateur : image téléchargée', 'warning');
        } catch (e) { toast(`Copie impossible : ${e.message}`, 'error'); }
    }
}

/** Copie l'image du graphique `canvasId` ; `o` : cf. chartImageBlob. */
export function copyChartImage(canvasId, title = '', o = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return Promise.resolve();
    return _toClipboard(chartImageBlob(canvas, title, o), `${_slug(title || canvasId)}.png`, 'Graphique copié — colle-le avec Ctrl+V');
}

/** Copie l'image d'une section entière (indicateurs + graphiques). */
export function copySectionImage(root, heading = '') {
    if (!root) return Promise.resolve();
    return _toClipboard(sectionImageBlob(root, heading), `${_slug(heading || 'section')}.png`, 'Section copiée — colle-la avec Ctrl+V');
}

const _COPY_SVG = '<svg class="icon icon-sm"><use href="#i-copy"/></svg>';

/** Bouton d'en-tête de carte (le titre de la carte part avec l'image). */
export const chartCopyBtnHtml = canvasId => `<button type="button" class="btn-icon chart-copy-btn" data-chart-copy="${canvasId}"
    title="Copier l'image du graphique (thème affiché)" aria-label="Copier l'image du graphique">${_COPY_SVG}</button>`;

/** Bouton « copier la section » : `target` = sélecteur de la section, `heading` = en-tête de l'image. */
export const sectionCopyBtnHtml = (target, heading) => `<button type="button" class="btn btn-secondary btn-xs section-copy-btn"
    data-section-copy="${target}" data-heading="${String(heading).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
    title="Copier une image de toute la section : indicateurs et graphiques (thème affiché)">${_COPY_SVG} Copier la section</button>`;

/** Titre d'un graphique pour l'image : titre de sa carte, sinon son libellé accessible. */
const _titleOf = canvas => canvas?.closest('.card')?.querySelector('.card-title')?.textContent.trim()
    || canvas?.getAttribute('aria-label') || '';

let _ready = false;
/** Délégation des clics (une fois, au démarrage — cf. app.js). */
export function initChartCopy() {
    if (_ready) return;
    _ready = true;
    document.addEventListener('click', e => {
        const one = e.target.closest('[data-chart-copy]');
        if (one) {
            e.preventDefault(); e.stopPropagation();   // dans un <summary>, ne replie pas la section
            copyChartImage(one.dataset.chartCopy, _titleOf(document.getElementById(one.dataset.chartCopy)));
            return;
        }
        const sec = e.target.closest('[data-section-copy]');
        if (sec) {
            e.preventDefault(); e.stopPropagation();
            copySectionImage(document.querySelector(sec.dataset.sectionCopy), sec.dataset.heading || '');
        }
    });
}
