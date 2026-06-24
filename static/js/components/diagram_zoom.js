/**
 * Diagram zoom — agrandit une image (ex. diagrammes SVG) dans une popin plein écran
 * avec pan & zoom : molette pour zoomer (centré sur le curseur), glisser pour déplacer,
 * pincement à deux doigts au tactile, boutons +/−/réinitialiser, double-clic pour reset.
 *
 * Décore tout `.diagram-frame` contenant une `img` : injecte le bouton « agrandir ».
 * Aucune dépendance npm : Vanilla JS + Pointer Events.
 */

const MIN_SCALE = 0.3;
const MAX_SCALE = 8;
const _MAXIMIZE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>';

let _overlay = null;
let _img = null;
let _stage = null;
let _state = { scale: 1, x: 0, y: 0 };
let _naturalW = 0;
let _naturalH = 0;
const _pointers = new Map();   // pointerId -> {x, y} — actifs sur le stage (drag / pinch)
let _pinchStartDist = 0;
let _pinchStartScale = 1;

function _clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function _apply() {
    _img.style.transform = `translate(${_state.x}px, ${_state.y}px) scale(${_state.scale})`;
    const pct = _overlay.querySelector('#dz-zoom-pct');
    if (pct) pct.textContent = `${Math.round(_state.scale * 100)}%`;
}

/** Zoom centré sur un point (coordonnées relatives au stage), facteur multiplicatif. */
function _zoomAt(cx, cy, factor) {
    const newScale = _clamp(_state.scale * factor, MIN_SCALE, MAX_SCALE);
    const ratio = newScale / _state.scale;
    _state.x = cx - (cx - _state.x) * ratio;
    _state.y = cy - (cy - _state.y) * ratio;
    _state.scale = newScale;
    _apply();
}

/** Ajuste l'image pour qu'elle tienne entièrement dans le stage, centrée. */
function _fit() {
    const rect = _stage.getBoundingClientRect();
    _state.scale = Math.min(rect.width / _naturalW, rect.height / _naturalH);
    _state.x = (rect.width - _naturalW * _state.scale) / 2;
    _state.y = (rect.height - _naturalH * _state.scale) / 2;
    _apply();
}

function _buildOverlay() {
    const ov = document.createElement('div');
    ov.id = 'diagram-zoom-overlay';
    ov.className = 'diagram-zoom-overlay hidden';
    ov.innerHTML = `
        <div class="diagram-zoom-backdrop" data-dz-close></div>
        <div class="diagram-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby="diagram-zoom-title">
            <header class="diagram-zoom-header">
                <h2 class="diagram-zoom-title" id="diagram-zoom-title"></h2>
                <div class="diagram-zoom-actions">
                    <button type="button" id="dz-zoom-out" title="Réduire (-)" aria-label="Réduire">−</button>
                    <span class="diagram-zoom-pct" id="dz-zoom-pct">100%</span>
                    <button type="button" id="dz-zoom-in" title="Agrandir (+)" aria-label="Agrandir">+</button>
                    <button type="button" id="dz-zoom-reset" title="Ajuster (0)" aria-label="Ajuster à l'écran">Ajuster</button>
                    <button type="button" class="diagram-zoom-close" id="dz-close" title="Fermer (Échap)" aria-label="Fermer" data-dz-close>✕</button>
                </div>
            </header>
            <div class="diagram-zoom-stage" id="dz-stage">
                <img id="dz-img" alt="" draggable="false">
            </div>
            <p class="diagram-zoom-hint">Molette pour zoomer · glisser pour déplacer · double-clic ou « Ajuster » pour réinitialiser</p>
        </div>`;
    document.body.appendChild(ov);

    _img = ov.querySelector('#dz-img');
    _stage = ov.querySelector('#dz-stage');

    ov.querySelectorAll('[data-dz-close]').forEach(el => el.addEventListener('click', closeDiagramZoom));
    ov.querySelector('#dz-zoom-in').addEventListener('click', () => {
        const r = _stage.getBoundingClientRect();
        _zoomAt(r.width / 2, r.height / 2, 1.3);
    });
    ov.querySelector('#dz-zoom-out').addEventListener('click', () => {
        const r = _stage.getBoundingClientRect();
        _zoomAt(r.width / 2, r.height / 2, 1 / 1.3);
    });
    ov.querySelector('#dz-zoom-reset').addEventListener('click', _fit);
    _stage.addEventListener('dblclick', _fit);

    _stage.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = _stage.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        _zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    }, { passive: false });

    // Pan (souris/tactile) + pincement (2 doigts) via Pointer Events unifiés.
    _stage.addEventListener('pointerdown', e => {
        _stage.setPointerCapture(e.pointerId);
        _pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (_pointers.size === 1) _stage.classList.add('is-dragging');
        if (_pointers.size === 2) {
            const [a, b] = [..._pointers.values()];
            _pinchStartDist = Math.hypot(b.x - a.x, b.y - a.y);
            _pinchStartScale = _state.scale;
        }
    });
    _stage.addEventListener('pointermove', e => {
        if (!_pointers.has(e.pointerId)) return;
        const prev = _pointers.get(e.pointerId);
        const cur = { x: e.clientX, y: e.clientY };
        _pointers.set(e.pointerId, cur);

        if (_pointers.size === 2) {
            const [a, b] = [..._pointers.values()];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const rect = _stage.getBoundingClientRect();
            const midX = (a.x + b.x) / 2 - rect.left;
            const midY = (a.y + b.y) / 2 - rect.top;
            const targetScale = _clamp(_pinchStartScale * (dist / _pinchStartDist), MIN_SCALE, MAX_SCALE);
            _zoomAt(midX, midY, targetScale / _state.scale);
        } else if (_pointers.size === 1) {
            _state.x += cur.x - prev.x;
            _state.y += cur.y - prev.y;
            _apply();
        }
    });
    const _release = e => {
        _pointers.delete(e.pointerId);
        if (_pointers.size === 0) _stage.classList.remove('is-dragging');
    };
    _stage.addEventListener('pointerup', _release);
    _stage.addEventListener('pointercancel', _release);

    return ov;
}

/** Ouvre la popin de zoom pour une image donnée. */
export function openDiagramZoom(src, title) {
    _overlay = _overlay || _buildOverlay();
    _overlay.querySelector('#diagram-zoom-title').textContent = title || '';
    _img.alt = title || '';
    _pointers.clear();

    _overlay.classList.remove('hidden');
    void _overlay.offsetWidth;
    _overlay.classList.add('diagram-zoom-overlay--open');
    document.body.classList.add('diagram-zoom-lock');

    _img.onload = () => {
        _naturalW = _img.naturalWidth;
        _naturalH = _img.naturalHeight;
        _fit();
    };
    _img.src = src;
}

export function closeDiagramZoom() {
    if (!_overlay) return;
    _overlay.classList.remove('diagram-zoom-overlay--open');
    document.body.classList.remove('diagram-zoom-lock');
    setTimeout(() => { _overlay.classList.add('hidden'); _img.src = ''; }, 200);
}

function _decorateFrame(frame) {
    if (frame.dataset.dzReady === '1') return;
    const img = frame.querySelector('img');
    if (!img) return;
    frame.dataset.dzReady = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diagram-zoom-btn';
    btn.title = 'Agrandir';
    btn.setAttribute('aria-label', 'Agrandir le diagramme');
    btn.innerHTML = _MAXIMIZE_SVG;
    frame.appendChild(btn);
}

/** Décore tous les `.diagram-frame` de la page (idempotent) et câble les clics. */
export function initDiagramZoom() {
    document.addEventListener('click', e => {
        const frame = e.target.closest('.diagram-frame');
        if (!frame) return;
        const img = frame.querySelector('img');
        if (!img) return;
        e.preventDefault();
        openDiagramZoom(img.src, img.alt);
    });

    document.addEventListener('keydown', e => {
        if (!_overlay || _overlay.classList.contains('hidden')) return;
        if (e.key === 'Escape') { e.preventDefault(); closeDiagramZoom(); }
        else if (e.key === '+' || e.key === '=') { _overlay.querySelector('#dz-zoom-in')?.click(); }
        else if (e.key === '-') { _overlay.querySelector('#dz-zoom-out')?.click(); }
        else if (e.key === '0') { _fit(); }
    });

    const decorate = () => document.querySelectorAll('.diagram-frame').forEach(_decorateFrame);
    const content = document.getElementById('content') || document.body;
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; decorate(); });
    });
    observer.observe(content, { childList: true, subtree: true });
    decorate();
}
