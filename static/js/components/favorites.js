/**
 * Favoris de vue — sauvegarder un état (vue + équipe/groupe + filtres) et y
 * revenir en 1 clic. Persistance localStorage `sb-favorites`.
 *
 * Une "vue favorite" capture :
 * - view (dashboard/sprint/kanban/...)
 * - team (string, ou 'all')
 * - group (id ou null)
 * - filtres sessionStorage (sprint-qfText, kanban-search) — optionnel
 * - name (saisi par l'utilisateur)
 */

import { store } from '../state.js';
import { esc, toast } from '../utils.js';

const KEY = 'sb-favorites';
const MAX = 12;

function _load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
}
function _save(list) {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function getFavorites() { return _load(); }

/** Capture l'état courant et retourne un objet favori (sans id). */
function _captureCurrent() {
    return {
        view:   store.get('view') || 'dashboard',
        team:   store.get('team') || 'all',
        group:  store.get('group') || null,
        qfText: sessionStorage.getItem('sprint-qfText') || '',
    };
}

/** Restore un favori : applique view/team/group + restaure les filtres. */
export function applyFavorite(fav) {
    if (!fav) return;
    if (fav.qfText !== undefined) {
        if (fav.qfText) sessionStorage.setItem('sprint-qfText', fav.qfText);
        else sessionStorage.removeItem('sprint-qfText');
    }
    if (fav.group)        { store.set('group', fav.group); store.set('team', 'all'); }
    else if (fav.team)    { store.set('group', null); store.set('team', fav.team); }
    else                  { store.set('group', null); store.set('team', 'all'); }
    if (fav.view)         store.set('view', fav.view);
}

/** Ajoute un favori avec un nom auto (ou prompt) — retourne l'objet créé. */
export function addCurrentAsFavorite(name) {
    const cur = _captureCurrent();
    if (!name) {
        const teamPart = cur.group ? `groupe ${cur.group}` : (cur.team && cur.team !== 'all' ? cur.team : 'tous');
        name = `${cur.view} · ${teamPart}${cur.qfText ? ` · "${cur.qfText}"` : ''}`;
    }
    const list = _load();
    const fav = { id: 'fav-' + Date.now() + '-' + Math.floor(Math.random() * 999), name, ...cur, createdAt: new Date().toISOString() };
    list.unshift(fav);
    _save(list);
    return fav;
}

export function deleteFavorite(id) {
    _save(_load().filter(f => f.id !== id));
}

export function renameFavorite(id, name) {
    const list = _load();
    const f = list.find(x => x.id === id);
    if (!f) return;
    f.name = name;
    _save(list);
}

// ── UI dropdown ───────────────────────────────────────────────────────────────
let _dropdown = null;
function _closeDropdown() { _dropdown?.remove(); _dropdown = null; }

export function toggleFavoritesDropdown(anchor) {
    if (_dropdown) { _closeDropdown(); return; }
    const favs = _load();
    _dropdown = document.createElement('div');
    _dropdown.className = 'fav-dropdown';
    const itemsHtml = favs.length
        ? favs.map(f => `
            <div class="fav-item" data-id="${esc(f.id)}" role="button" tabindex="0" title="${esc(_favTooltip(f))}">
                <span class="fav-item-star">★</span>
                <span class="fav-item-name">${esc(f.name)}</span>
                <button type="button" class="fav-item-del" data-id="${esc(f.id)}" title="Supprimer ce favori" aria-label="Supprimer">×</button>
            </div>`).join('')
        : '<div class="fav-empty">Aucun favori — sauve la vue courante ↓</div>';

    _dropdown.innerHTML = `
        <div class="fav-hdr">★ Favoris <small>(${favs.length}/${MAX})</small></div>
        <div class="fav-list">${itemsHtml}</div>
        <button type="button" class="fav-add-btn" id="fav-add">＋ Sauver la vue courante</button>
    `;
    document.body.appendChild(_dropdown);
    const r = anchor.getBoundingClientRect();
    _dropdown.style.position = 'fixed';
    _dropdown.style.top  = `${r.bottom + 6}px`;
    _dropdown.style.right = `${window.innerWidth - r.right}px`;
    _dropdown.style.zIndex = '9000';

    _dropdown.addEventListener('click', (e) => {
        const del = e.target.closest('.fav-item-del');
        if (del) { e.stopPropagation(); deleteFavorite(del.dataset.id); _closeDropdown(); toggleFavoritesDropdown(anchor); return; }
        const item = e.target.closest('.fav-item');
        if (item) {
            const fav = _load().find(f => f.id === item.dataset.id);
            if (fav) { applyFavorite(fav); _closeDropdown(); toast(`Vue "${fav.name}" restaurée`, 'success', 1500); }
            return;
        }
        if (e.target.closest('#fav-add')) {
            const name = prompt('Nom du favori :', _suggestName());
            if (name && name.trim()) {
                addCurrentAsFavorite(name.trim());
                toast('Favori ajouté ★', 'success', 1500);
                _closeDropdown(); toggleFavoritesDropdown(anchor);
            }
        }
    });

    setTimeout(() => {
        const onOut = (e) => {
            if (_dropdown && !_dropdown.contains(e.target) && !anchor.contains(e.target)) {
                _closeDropdown();
                document.removeEventListener('mousedown', onOut, true);
            }
        };
        document.addEventListener('mousedown', onOut, true);
    }, 0);
}

function _favTooltip(f) {
    const parts = [`${f.view}`];
    if (f.group) parts.push(`groupe ${f.group}`);
    else if (f.team && f.team !== 'all') parts.push(f.team);
    if (f.qfText) parts.push(`filtre "${f.qfText}"`);
    return parts.join(' · ');
}
function _suggestName() {
    const cur = _captureCurrent();
    const teamPart = cur.group ? `Groupe ${cur.group}` : (cur.team && cur.team !== 'all' ? cur.team : 'Toutes');
    return `${cur.view[0].toUpperCase()}${cur.view.slice(1)} · ${teamPart}`;
}
