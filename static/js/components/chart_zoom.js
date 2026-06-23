/**
 * Chart zoom — agrandit n'importe quel graphique du board dans une popin plein écran.
 *
 * Principe :
 *  - Un bouton « agrandir » (icône) est injecté automatiquement dans chaque
 *    `.chart-container` qui contient un `<canvas>` enregistré dans le registre de
 *    `charts.js` (via getChartMeta).
 *  - Au clic, une popin alignée en haut de l'écran s'ouvre (fondu + léger zoom),
 *    redessine le graphique en grand dans un canvas dédié, et affiche une légende
 *    enrichie + une explication contextuelle selon le type de graphique.
 *  - Navigation précédent/suivant entre tous les graphiques zoomables de la page,
 *    SANS animation de transition (changement instantané, conformément à la demande).
 *
 * Aucune dépendance npm : Vanilla JS, réutilise Chart.js déjà chargé.
 */

import { getChartMeta, rerenderChart, getChartControls } from './charts.js';

// ── Explications contextuelles par type de graphique ───────────────────────────
// `read` : comment lire le graphique. `tip` : interprétation / signal d'alerte.
const _EXPLAIN = {
    burndown: {
        read: 'La courbe <strong>idéale</strong> (pointillés gris) descend linéairement jusqu’à 0. La courbe <strong>réelle</strong> (bleu) suit les points réellement terminés ; la ligne <strong>tickets</strong> (orange) compte le nombre de tickets restants.',
        tip: 'Si le réel reste <em>au-dessus</em> de l’idéal, le sprint prend du retard. Une chute brutale en fin de sprint trahit souvent des tickets clôturés en masse au dernier moment.',
    },
    burnup: {
        read: 'La ligne <strong>Scope</strong> (pointillés) matérialise le total de points engagés ; la zone <strong>Terminé</strong> (vert) monte vers ce scope.',
        tip: 'Un Scope qui grimpe en cours de sprint signale un <em>scope creep</em> (ajout de travail). L’écart entre les deux courbes = ce qu’il reste à livrer.',
    },
    cfd: {
        read: 'Chaque bande colorée représente un statut. L’<strong>épaisseur</strong> d’une bande = nombre de tickets dans ce statut à un instant donné.',
        tip: 'Une bande qui s’élargit (ex. « En cours » ou « Revue ») révèle un <em>goulot d’étranglement</em>. Un flux sain montre des bandes parallèles et régulières.',
    },
    throughput: {
        read: 'Nombre de tickets <strong>terminés par jour</strong>. Les barres grises sont les week-ends ; la courbe bleue est la moyenne glissante sur 3 jours.',
        tip: 'Un débit régulier est meilleur qu’un pic isolé. Des jours à zéro répétés en milieu de sprint annoncent un retard de livraison.',
    },
    cycletime: {
        read: 'Mode <strong>Barres</strong> : un ticket par ligne (attente + cycle time empilés, largeur = lead time). Mode <strong>Nuage</strong> : chaque point est un ticket positionné par sa date de résolution → révèle la tendance dans le temps. Filtres (type/lead) et tri disponibles en haut.',
        tip: {
            intro: 'couleur selon le percentile de cycle time ; ⚠ = lead time au-delà du 85ᵉ percentile (point de douleur à creuser en rétro).',
            items: [
                '🟢 ≤ médiane',
                '🟡 médiane → 85ᵉ percentile',
                '🔴 au-delà du 85ᵉ percentile',
                '⚠ outlier : lead time > P85',
                'le footer indique la part d’attente dans le lead time (souvent le vrai problème)',
            ],
        },
    },
    wipage: {
        read: 'Âge (en jours) de chaque ticket <strong>encore en cours</strong>, depuis sa mise en travail. La ligne rouge est le seuil p85 (85% des tickets terminés l’ont été en moins de X jours).',
        tip: {
            intro: 'un ticket bien au-dessus du p85 est probablement bloqué.',
            items: [
                '🟢 sain',
                '🟡 attention (≥70% du p85)',
                '🔴 critique (≥p85, à débloquer en priorité)',
            ],
        },
    },
    velocity: {
        read: 'Vélocité (points livrés) par sprint. La barre violette est le <strong>buffer engagé</strong>, la courbe cyan la moyenne glissante (3 sprints), les pointillés la moyenne globale et l’objectif.',
        tip: {
            items: [
                'Couleur des barres = performance vs moyenne',
                'le dernier sprint est mis en avant',
                'le sprint en cours (gris) n’entre pas dans les stats',
                'Shift+clic pour comparer plusieurs sprints',
            ],
        },
    },
    pivelocity: {
        read: 'Pour chaque sprint du PI : <strong>Estimé</strong> (gris), <strong>Buffer</strong> (violet) et <strong>Réalisé</strong> (vert). La ligne orange est l’objectif de vélocité.',
        tip: 'Comparer Réalisé vs Estimé donne le taux d’avancement du PI. Un buffer systématiquement non consommé suggère une sur-estimation.',
    },
    piburnup: {
        read: 'Cumul des Story Points <strong>livrés</strong> au fil des sprints du PI : une ligne par équipe, la ligne épaisse étant le total. Les pointillés gris matérialisent l’<strong>engagement</strong> du PI.',
        tip: 'La courbe totale doit rejoindre la ligne d’engagement en fin de PI. Un écart qui se creuse en milieu de PI annonce un objectif difficilement atteignable.',
    },
    status: {
        read: 'Répartition des tickets par statut. Le centre affiche le <strong>pourcentage terminé</strong> et le ratio terminés / total.',
        tip: 'Une part importante en « Bloqué » ou « Revue » concentre le risque. Idéalement la majorité bascule progressivement vers « Terminé ».',
    },
    type: {
        read: 'Nombre de tickets par <strong>type</strong> (story, bug, tâche, support…).',
        tip: 'Une forte proportion de bugs ou de support rogne la capacité disponible pour la valeur produit. À surveiller PI après PI.',
    },
};

const _ZOOM_CANVAS_ID = 'zoom-chart-canvas';
let _overlay = null;
let _ids = [];        // liste ordonnée des canvasId zoomables présents dans la page
let _idx = -1;        // index courant dans _ids
let _opts = {};       // état des contrôles (mode/tri/filtres) du graphique courant
let _explainOpen = true; // légende explicative dépliée par défaut (persiste entre navigations)

// ── Décoration : injecte le bouton « agrandir » dans chaque .chart-container ────
const _MAXIMIZE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>';

function _decorateContainer(container) {
    if (container.dataset.zoomReady === '1') return;
    const canvas = container.querySelector('canvas');
    if (!canvas || !canvas.id) return;
    container.dataset.zoomReady = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chart-zoom-btn';
    btn.title = 'Agrandir le graphique';
    btn.setAttribute('aria-label', 'Agrandir le graphique');
    btn.dataset.zoomTarget = canvas.id;
    btn.innerHTML = _MAXIMIZE_SVG;
    container.appendChild(btn);
}

/** Décore tous les conteneurs de graphique de la page (idempotent). */
export function decorateChartZoom(root = document) {
    root.querySelectorAll('.chart-container').forEach(_decorateContainer);
}

// ── Construction / ouverture de la popin ───────────────────────────────────────
function _buildOverlay() {
    const ov = document.createElement('div');
    ov.id = 'chart-zoom-overlay';
    ov.className = 'chart-zoom-overlay hidden';
    ov.innerHTML = `
        <div class="chart-zoom-backdrop" data-zoom-close></div>
        <div class="chart-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby="chart-zoom-title">
            <header class="chart-zoom-header">
                <button class="chart-zoom-nav" id="chart-zoom-prev" title="Graphique précédent (←)" aria-label="Précédent">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <h2 class="chart-zoom-title" id="chart-zoom-title"></h2>
                <span class="chart-zoom-count" id="chart-zoom-count"></span>
                <button class="chart-zoom-nav" id="chart-zoom-next" title="Graphique suivant (→)" aria-label="Suivant">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <button class="chart-zoom-nav chart-zoom-export" id="chart-zoom-export" title="Exporter en PNG" aria-label="Exporter en PNG">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button class="chart-zoom-close" id="chart-zoom-close" title="Fermer (Échap)" aria-label="Fermer" data-zoom-close>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </header>
            <div class="chart-zoom-toolbar" id="chart-zoom-toolbar" hidden></div>
            <div class="chart-zoom-canvas-wrap">
                <canvas id="${_ZOOM_CANVAS_ID}"></canvas>
            </div>
            <footer class="chart-zoom-explain" id="chart-zoom-explain"></footer>
        </div>`;
    document.body.appendChild(ov);

    ov.querySelectorAll('[data-zoom-close]').forEach(el =>
        el.addEventListener('click', closeChartZoom));
    ov.querySelector('#chart-zoom-prev').addEventListener('click', () => _navigate(-1));
    ov.querySelector('#chart-zoom-next').addEventListener('click', () => _navigate(1));
    ov.querySelector('#chart-zoom-export').addEventListener('click', _exportPng);
    return ov;
}

/**
 * Exporte le graphique agrandi en PNG. On dessine le canvas sur un fond opaque
 * (le canvas Chart.js est transparent) pour un rendu lisible hors de l'app.
 */
function _exportPng() {
    const canvas = _overlay?.querySelector('.chart-zoom-canvas-wrap canvas');
    if (!canvas) return;
    const meta = getChartMeta(_ids[_idx]);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';

    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const cx = out.getContext('2d');
    cx.fillStyle = bg;
    cx.fillRect(0, 0, out.width, out.height);
    cx.drawImage(canvas, 0, 0);

    // Slug de nom de fichier : décompose les accents (NFD) puis ne garde que
    // [a-z0-9], le reste (accents combinants, espaces, ponctuation) devient `-`.
    const slug = (meta?.title || 'graphique')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `squad-board-${slug}-${date}.png`;
    a.click();
}

// Rend une partie d'explication. `val` est soit une string (un paragraphe),
// soit { intro, items: [...] } → l'intro en paragraphe + les items en liste
// (une ligne par item, plus propre qu'un texte à rallonge avec des puces).
function _part(label, val) {
    if (typeof val === 'string') {
        return `<p><strong>${label} -</strong> ${val}</p>`;
    }
    const intro = val.intro ? `<p><strong>${label} -</strong> ${val.intro}</p>` : `<p><strong>${label}</strong></p>`;
    const list = (val.items || []).map(it => `<li>${it}</li>`).join('');
    return `${intro}<ul class="chart-zoom-explain-list">${list}</ul>`;
}

function _explainHtml(kind) {
    const e = _EXPLAIN[kind];
    if (!e) return '';
    // <details> natif : pliable/dépliable et accessible. `_explainOpen` mémorise
    // l'état entre les navigations (déplié par défaut).
    return `
        <details class="chart-zoom-explain-details"${_explainOpen ? ' open' : ''}>
            <summary class="chart-zoom-explain-summary">
                <svg class="chart-zoom-explain-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
                Comment lire ce graphique
            </summary>
            <div class="chart-zoom-explain-body">
                <div class="chart-zoom-explain-row">
                    <span class="chart-zoom-explain-ico" aria-hidden="true">👁</span>
                    <div>${_part('Lecture', e.read)}</div>
                </div>
                <div class="chart-zoom-explain-row">
                    <span class="chart-zoom-explain-ico" aria-hidden="true">💡</span>
                    <div>${_part('Interprétation', e.tip)}</div>
                </div>
            </div>
        </details>`;
}

// Échappe un texte destiné à un attribut HTML (valeurs de filtre issues des données).
function _esc(s) {
    return String(s).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/**
 * Construit la barre d'outils (mode / tri / filtres) pour les graphiques qui la
 * déclarent (cf. getChartControls). Affichée uniquement en vue zoom. Les sélections
 * vivent dans `_opts` et déclenchent un re-render via `_renderCurrent`.
 */
function _renderToolbar(sourceId) {
    const tb = _overlay.querySelector('#chart-zoom-toolbar');
    const ctrls = getChartControls(sourceId);
    if (!ctrls) { tb.hidden = true; tb.innerHTML = ''; return; }
    tb.hidden = false;

    const mode = _opts.mode || (ctrls.modes?.[0]?.value ?? 'bars');
    const sortBy = _opts.sortBy || (ctrls.sorts?.[0]?.value ?? 'date');
    const isScatter = mode === 'scatter';

    // Groupe de chips de filtre (un seul actif à la fois, "Tous" = aucun filtre).
    const filterGroup = (key, optKey, label, values) => {
        if (!values?.length) return '';
        const active = _opts[optKey] || '';
        const chip = (val, txt) =>
            `<button type="button" class="chart-zoom-chip${active === val ? ' is-active' : ''}" data-filter="${optKey}" data-value="${_esc(val)}">${_esc(txt)}</button>`;
        return `<div class="chart-zoom-tb-group" role="group" aria-label="${label}">
            <span class="chart-zoom-tb-label">${label}</span>
            ${chip('', 'Tous')}
            ${values.map(v => chip(v, v)).join('')}
        </div>`;
    };

    const modeBtns = (ctrls.modes || []).map(m =>
        `<button type="button" class="chart-zoom-seg${m.value === mode ? ' is-active' : ''}" data-mode="${m.value}">${m.label}</button>`
    ).join('');

    // Le tri ne concerne que le mode barres.
    const sortSel = (!isScatter && ctrls.sorts?.length)
        ? `<div class="chart-zoom-tb-group">
                <span class="chart-zoom-tb-label">Tri</span>
                <select class="chart-zoom-select" id="chart-zoom-sort">
                    ${ctrls.sorts.map(s => `<option value="${s.value}"${s.value === sortBy ? ' selected' : ''}>${_esc(s.label)}</option>`).join('')}
                </select>
           </div>`
        : '';

    tb.innerHTML = `
        ${ctrls.modes?.length ? `<div class="chart-zoom-tb-group"><span class="chart-zoom-tb-label">Vue</span><div class="chart-zoom-seg-group">${modeBtns}</div></div>` : ''}
        ${sortSel}
        ${filterGroup('type', 'filterType', 'Type', ctrls.filters?.type)}
        ${filterGroup('leader', 'filterLeader', 'Lead', ctrls.filters?.leader)}`;

    // Wiring : mode (segmenté)
    tb.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        _opts.mode = b.dataset.mode;
        _renderCurrent();
    }));
    // Tri
    tb.querySelector('#chart-zoom-sort')?.addEventListener('change', e => {
        _opts.sortBy = e.target.value;
        _renderCurrent();
    });
    // Filtres (toggle : recliquer la valeur active la retire)
    tb.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
        const { filter, value } = b.dataset;
        _opts[filter] = (_opts[filter] === value) ? '' : value;
        _renderCurrent();
    }));
}

/** (Re)dessine le graphique courant dans la popin — SANS animation de transition. */
function _renderCurrent() {
    const sourceId = _ids[_idx];
    const meta = getChartMeta(sourceId);
    if (!meta) return;

    // Détruit l'éventuelle instance Chart.js précédente avant de recréer le canvas
    // (Chart.js attache le contexte au canvas — sinon fuite mémoire à la navigation).
    const wrap = _overlay.querySelector('.chart-zoom-canvas-wrap');
    const old = wrap.querySelector('canvas');
    if (old && window.Chart?.getChart) window.Chart.getChart(old)?.destroy();
    wrap.innerHTML = `<canvas id="${_ZOOM_CANVAS_ID}"></canvas>`;
    rerenderChart(sourceId, _ZOOM_CANVAS_ID, _opts);

    _overlay.querySelector('#chart-zoom-title').textContent = meta.title || 'Graphique';
    _overlay.querySelector('#chart-zoom-count').textContent =
        _ids.length > 1 ? `${_idx + 1} / ${_ids.length}` : '';
    const explainEl = _overlay.querySelector('#chart-zoom-explain');
    explainEl.innerHTML = _explainHtml(meta.kind);
    // Mémorise l'état plié/déplié de la légende pour le conserver d'un graphique à l'autre.
    explainEl.querySelector('.chart-zoom-explain-details')
        ?.addEventListener('toggle', e => { _explainOpen = e.target.open; });
    _renderToolbar(sourceId);

    const prev = _overlay.querySelector('#chart-zoom-prev');
    const next = _overlay.querySelector('#chart-zoom-next');
    const multi = _ids.length > 1;
    prev.hidden = !multi;
    next.hidden = !multi;
}

function _navigate(dir) {
    if (_ids.length < 2) return;
    _idx = (_idx + dir + _ids.length) % _ids.length;
    _opts = {};        // réinitialise les contrôles en changeant de graphique
    _renderCurrent(); // pas d'animation : on remplace directement
}

/** Recense, dans l'ordre du DOM, tous les canvas zoomables actuellement présents. */
function _collectIds() {
    const ids = [];
    document.querySelectorAll('.chart-container canvas[id]').forEach(c => {
        if (getChartMeta(c.id)) ids.push(c.id);
    });
    return ids;
}

export function openChartZoom(canvasId) {
    if (!getChartMeta(canvasId)) return;
    _overlay = _overlay || _buildOverlay();
    _ids = _collectIds();
    _idx = _ids.indexOf(canvasId);
    if (_idx < 0) { _ids = [canvasId]; _idx = 0; }
    _opts = {};        // démarre sans surcharge de contrôles

    _overlay.classList.remove('hidden');
    // Force le reflow puis active la classe d'entrée → transition fondu + zoom.
    void _overlay.offsetWidth;
    _overlay.classList.add('chart-zoom-overlay--open');
    document.body.classList.add('chart-zoom-lock');
    _renderCurrent();
}

export function closeChartZoom() {
    if (!_overlay) return;
    _overlay.classList.remove('chart-zoom-overlay--open');
    document.body.classList.remove('chart-zoom-lock');
    // Laisse la transition de sortie se jouer avant de masquer + purger le canvas.
    const ov = _overlay;
    setTimeout(() => {
        ov.classList.add('hidden');
        const wrap = ov.querySelector('.chart-zoom-canvas-wrap');
        const old = wrap?.querySelector('canvas');
        if (old && window.Chart?.getChart) window.Chart.getChart(old)?.destroy();
        if (wrap) wrap.innerHTML = `<canvas id="${_ZOOM_CANVAS_ID}"></canvas>`;
    }, 200);
}

// ── Initialisation : délégation des clics + observation du DOM ──────────────────
export function initChartZoom() {
    // Clic sur un bouton « agrandir » (délégation : survit aux re-renders de vue).
    document.addEventListener('click', e => {
        const btn = e.target.closest('.chart-zoom-btn');
        if (btn) { e.preventDefault(); openChartZoom(btn.dataset.zoomTarget); }
    });

    // Raccourcis clavier quand la popin est ouverte.
    document.addEventListener('keydown', e => {
        if (!_overlay || _overlay.classList.contains('hidden')) return;
        if (e.key === 'Escape') { e.preventDefault(); closeChartZoom(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); _navigate(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); _navigate(1); }
    });

    // Les vues sont re-rendues dynamiquement dans #content : on (re)décore à chaque
    // mutation. Throttle via rAF pour éviter les passes redondantes.
    const content = document.getElementById('content') || document.body;
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; decorateChartZoom(); });
    });
    observer.observe(content, { childList: true, subtree: true });

    // Décoration initiale.
    decorateChartZoom();
}
