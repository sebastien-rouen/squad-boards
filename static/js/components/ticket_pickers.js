/**
 * Sélecteurs de la popin ticket : epic (récents + autocomplétion), personne, chips (statut, priorité…), étiquettes.
 *
 * Extrait de modal.js (3.253.0, > 2 900 lignes) — code déplacé à l'identique. Les dépendances vers
 * modal.js sont CIRCULAIRES mais sans effet au chargement (appelées dans des fonctions seulement) :
 * ne jamais utiliser un import de ./modal.js au niveau racine du module.
 */
import { store } from '../state.js';
import { esc, labelChipHtml, labelColor } from '../utils.js';
import { avatar } from './modal.js';

// ── Epic picker : récents (localStorage) + autocomplete + tri alpha ─────────
const _RECENT_EPICS_KEY = 'sb-recent-epics';
const _RECENT_EPICS_MAX = 8;
function _getRecentEpics() {
    try { return JSON.parse(localStorage.getItem(_RECENT_EPICS_KEY) || '[]'); }
    catch { return []; }
}
export function _pushRecentEpic(id) {
    if (!id) return;
    const cur = _getRecentEpics().filter(x => x !== id);
    cur.unshift(id);
    localStorage.setItem(_RECENT_EPICS_KEY, JSON.stringify(cur.slice(0, _RECENT_EPICS_MAX)));
}

/**
 * Combobox personnalisé pour sélectionner un Epic.
 * - Input text avec filter live (sur clé + titre)
 * - Section "Récents" en haut (8 derniers utilisés sur cet appareil, localStorage)
 * - Section "Tous (A-Z)" triée alphabétiquement par titre
 * - Option "— Aucun" pour détacher
 * - Enter : commit la première option visible
 * - Esc : cancel
 * @returns {{wrap: HTMLElement, input: HTMLInputElement}}
 */
export function _makeEpicPicker(allEpics, currentId, onCommit, onCancel) {
    const wrap = document.createElement('div');
    wrap.className = 'epic-picker';
    const recentIds = _getRecentEpics();
    const recentSet = new Set(recentIds);
    const recentEpics = recentIds
        .map(id => allEpics.find(e => e.id === id))
        .filter(Boolean);
    const otherEpics = allEpics
        .filter(e => !recentSet.has(e.id))
        .sort((a, b) => {
            const ka = (a.title || a.id || '').toLowerCase();
            const kb = (b.title || b.id || '').toLowerCase();
            return ka.localeCompare(kb, 'fr');
        });

    const optHtml = (e) => {
        const isCurrent = e.id === currentId;
        const searchKey = `${e.id} ${e.title || ''}`.toLowerCase();
        return `<div class="epic-picker-opt${isCurrent ? ' is-current' : ''}"
                    data-epic-id="${esc(e.id)}" data-search="${esc(searchKey)}" role="option">
            <span class="epic-picker-key">${esc(e.id)}</span>
            <span class="epic-picker-title">${esc(e.title || '(sans titre)')}</span>
        </div>`;
    };

    wrap.innerHTML = `
        <input type="text" class="epic-picker-input" placeholder="🔍 Filtrer par clé ou titre…" autocomplete="off" />
        <div class="epic-picker-list" role="listbox">
            <div class="epic-picker-opt epic-picker-opt--clear${!currentId ? ' is-current' : ''}"
                 data-epic-id="" data-search="aucun retirer" role="option">
                <span class="epic-picker-key">—</span>
                <span class="epic-picker-title">Aucun (retirer l'Epic)</span>
            </div>
            ${recentEpics.length ? `
                <div class="epic-picker-sec">⏱ Récents</div>
                ${recentEpics.map(optHtml).join('')}
                <div class="epic-picker-sep"></div>
            ` : ''}
            <div class="epic-picker-sec">${otherEpics.length} Epic${otherEpics.length > 1 ? 's' : ''} (A → Z)</div>
            ${otherEpics.length
                ? otherEpics.map(optHtml).join('')
                : '<div class="epic-picker-empty">Aucun autre Epic disponible</div>'}
        </div>
    `;

    const input = wrap.querySelector('.epic-picker-input');
    const list  = wrap.querySelector('.epic-picker-list');

    const _allOpts = () => list.querySelectorAll('.epic-picker-opt');
    const _firstVisible = () => {
        for (const o of _allOpts()) if (o.style.display !== 'none') return o;
        return null;
    };

    // Filter live
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        _allOpts().forEach(o => {
            // Toujours montrer "Aucun"
            if (o.classList.contains('epic-picker-opt--clear')) { o.style.display = ''; return; }
            const match = !q || o.dataset.search.includes(q);
            o.style.display = match ? '' : 'none';
        });
        // Masque les section headers si rien dessous n'est visible
        ['.epic-picker-sec', '.epic-picker-sep', '.epic-picker-empty'].forEach(sel => {
            wrap.querySelectorAll(sel).forEach(s => {
                let next = s.nextElementSibling;
                let hasVisible = false;
                while (next && next.classList.contains('epic-picker-opt') && !next.classList.contains('epic-picker-opt--clear')) {
                    if (next.style.display !== 'none') { hasVisible = true; break; }
                    next = next.nextElementSibling;
                }
                s.style.display = hasVisible ? '' : 'none';
            });
        });
    });

    // Click sur option
    list.addEventListener('click', (e) => {
        const opt = e.target.closest('.epic-picker-opt');
        if (opt) onCommit(opt.dataset.epicId);
    });

    // Hover highlight via classe
    list.addEventListener('mouseover', (e) => {
        const opt = e.target.closest('.epic-picker-opt');
        if (!opt) return;
        list.querySelectorAll('.is-hover').forEach(o => o.classList.remove('is-hover'));
        opt.classList.add('is-hover');
    });

    // Keyboard nav
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const hovered = list.querySelector('.is-hover');
            const target = (hovered && hovered.style.display !== 'none') ? hovered : _firstVisible();
            if (target) onCommit(target.dataset.epicId);
        }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const opts = [..._allOpts()].filter(o => o.style.display !== 'none');
            if (!opts.length) return;
            const cur = list.querySelector('.is-hover');
            let idx = cur ? opts.indexOf(cur) : -1;
            idx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
            opts.forEach(o => o.classList.remove('is-hover'));
            opts[idx].classList.add('is-hover');
            opts[idx].scrollIntoView({ block: 'nearest' });
        }
    });

    return { wrap, input };
}

export function makePersonPicker(allNames, currentName, onCommit, onCancel) {
    return _makePersonPicker(allNames, currentName, onCommit, onCancel);
}

export function _makePersonPicker(allNames, currentName, onCommit, onCancel) {
    const _initials = (n) => n ? n.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') : '?';
    const _color = (n) => {
        let h = 0; for (const c of (n || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
        return `hsl(${h % 360},55%,48%)`;
    };
    const _avatarHtml = (n) => `<span class="person-picker-avatar" style="background:${_color(n)}">${_initials(n)}</span>`;

    // Wrapper positionné — seul l'input est dans le flux, la liste est en absolute
    const wrap = document.createElement('div');
    wrap.className = 'person-picker';

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'person-picker-input';
    input.placeholder = '🔍 Filtrer…'; input.autocomplete = 'off';
    input.value = currentName || '';

    const list = document.createElement('div');
    list.className = 'person-picker-list'; list.role = 'listbox';

    // Normalise les entrées : string "Nom" OU objet { name, sub } (sub = équipe affichée à droite)
    const _entries = (allNames || []).map(n => typeof n === 'string' ? { name: n, sub: '' } : { name: n.name, sub: n.sub || '' });

    const _buildList = (q = '') => {
        const lq = q.toLowerCase();
        const items = [];
        // Option "Non assigné" (uniquement si demandé par l'appelant — géré via CSS .person-picker--no-clear)
        if (!wrap.classList.contains('person-picker--no-clear')) {
            items.push(`<div class="person-picker-opt person-picker-opt--clear${!currentName ? ' is-current' : ''}" data-name="" role="option">
                <span class="person-picker-avatar person-picker-avatar--none">—</span>
                <span class="person-picker-name">Non assigné</span>
            </div>`);
        }
        _entries.filter(e => !lq || e.name.toLowerCase().includes(lq) || (e.sub && e.sub.toLowerCase().includes(lq))).forEach(e => {
            items.push(`<div class="person-picker-opt${e.name === currentName ? ' is-current' : ''}" data-name="${esc(e.name)}" role="option">
                ${_avatarHtml(e.name)}
                <span class="person-picker-name">${esc(e.name)}</span>
                ${e.sub ? `<span class="person-picker-sub">${esc(e.sub)}</span>` : ''}
            </div>`);
        });
        list.innerHTML = items.join('');
        list.hidden = items.length === 0;
    };

    wrap.appendChild(input);
    wrap.appendChild(list);
    _buildList();

    const _allOpts = () => [...list.querySelectorAll('.person-picker-opt')];

    input.addEventListener('input', () => _buildList(input.value));
    input.addEventListener('focus',  () => { input.select(); _buildList(input.value); list.hidden = false; });

    list.addEventListener('mousedown', e => {
        // mousedown pour éviter que blur sur l'input ne ferme avant le click
        const opt = e.target.closest('.person-picker-opt');
        if (opt) { e.preventDefault(); onCommit(opt.dataset.name); }
    });
    list.addEventListener('mouseover', e => {
        const opt = e.target.closest('.person-picker-opt');
        if (opt) { _allOpts().forEach(o => o.classList.remove('is-hover')); opt.classList.add('is-hover'); }
    });

    // Options réelles = hors "Non assigné" (data-name vide)
    const _realOpts = () => _allOpts().filter(o => o.dataset.name !== '');

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            const real = _realOpts();
            // Priorité : option survolée. Sinon, si la recherche est filtrée à 1 résultat (ou texte
            // saisi → on prend le 1er), on le valide. Sinon l'option courante.
            const hovered = list.querySelector('.is-hover');
            const target = hovered
                || (input.value.trim() && real.length ? real[0] : null)
                || list.querySelector('.is-current');
            if (target) onCommit(target.dataset.name);
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const opts = _allOpts();
            const cur = list.querySelector('.is-hover');
            let idx = cur ? opts.indexOf(cur) : -1;
            idx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
            _allOpts().forEach(o => o.classList.remove('is-hover'));
            if (opts[idx]) { opts[idx].classList.add('is-hover'); opts[idx].scrollIntoView({ block: 'nearest' }); }
        }
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (!list.matches(':hover')) onCancel(); }, 120); });

    return { wrap, input };
}

// ── Picker générique dropdown (chips cliquables) ───────────────────────────
// options : [{ value, label, color?, bg?, dot? }]
// currentValue : string | string[] — valeur(s) courante(s) marquées ✓
export function _makeChipPicker(options, currentValue, onCommit) {
    const currentSet = new Set(Array.isArray(currentValue) ? currentValue : [currentValue]);
    const wrap = document.createElement('div');
    wrap.className = 'chip-picker';
    wrap.innerHTML = options.map(o => {
        const isCur = o.value !== '' && currentSet.has(o.value);
        return `<button type="button" class="chip-picker-opt${o.cls ? ` ${o.cls}` : ''}${isCur ? ' is-current' : ''}"
            data-value="${esc(o.value)}"${o.title ? ` title="${esc(o.title)}"` : ''}
            style="${o.bg ? `background:${o.bg};` : ''}${o.color ? `color:${o.color};border-color:${o.color}40` : ''}">
            ${o.dot ? `<span class="chip-picker-dot" style="background:${o.dot}"></span>` : ''}
            ${esc(o.label)}
            ${isCur ? '<span class="chip-picker-check">✓</span>' : ''}
        </button>`;
    }).join('');
    wrap.querySelectorAll('.chip-picker-opt').forEach(btn => {
        btn.addEventListener('click', () => onCommit(btn.dataset.value));
    });
    return wrap;
}

export function _openChipPicker(el, options, currentValue, onCommit) {
    if (document.querySelector('.chip-picker--open')) return;
    const wrap = _makeChipPicker(options, currentValue, async (val) => {
        cleanup();
        if (val !== currentValue) onCommit(val);
    });
    wrap.classList.add('chip-picker--open');
    // Positionne la popin juste sous l'élément déclencheur
    const rect = el.getBoundingClientRect();
    wrap.style.position = 'fixed';
    wrap.style.top  = `${rect.bottom + 6}px`;
    wrap.style.left = `${rect.left}px`;
    document.body.appendChild(wrap);
    const onDocClick = (ev) => { if (!wrap.contains(ev.target) && ev.target !== el) cleanup(); };
    const cleanup = () => {
        wrap.remove();
        document.removeEventListener('mousedown', onDocClick, true);
    };
    setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}

// Liste déroulante générique (type, statut, …) — chips colorées par valeur (même style que la
// modale de création), ancrée sous le badge déclencheur plutôt qu'affichée en permanence.
// `items` : [{ val, label }] — label déjà échappé/préparé par l'appelant (icône + libellé).
export function _openChipDropdown(el, items, currentValue, onCommit) {
    document.querySelector('.chip-dropdown')?.remove();
    const wrap = document.createElement('div');
    wrap.className = 'chip-sel-group chip-dropdown';
    wrap.setAttribute('role', 'radiogroup');
    wrap.innerHTML = items.map(({ val, label }) => `<button type="button" role="radio" aria-checked="${val === currentValue}" class="chip-sel chip-sel--${val}${val === currentValue ? ' is-active' : ''}" data-val="${val}">${label}</button>`).join('');
    const rect = el.getBoundingClientRect();
    wrap.style.position = 'fixed';
    wrap.style.top  = `${rect.bottom + 6}px`;
    wrap.style.left = `${rect.left}px`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => {
        const btn = e.target.closest('.chip-sel');
        if (!btn) return;
        cleanup();
        if (btn.dataset.val !== currentValue) onCommit(btn.dataset.val);
    });
    const onDocClick = (ev) => { if (!wrap.contains(ev.target) && ev.target !== el) cleanup(); };
    const cleanup = () => {
        wrap.remove();
        document.removeEventListener('mousedown', onDocClick, true);
    };
    setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}

/** Chip de label retirable, en nœud DOM (ajout à chaud) — même rendu que `labelChipHtml`. */
export function _labelChipEl(label) {
    const tpl = document.createElement('template');
    tpl.innerHTML = labelChipHtml(label, { removable: true });
    return tpl.content.firstElementChild;
}

// Autocomplete pour les labels — suggestions depuis les labels existants du store + frappe libre
export function _makeLabelPicker(currentLabels, onAdd, onCancel) {
    const allTickets  = [...(store.get('tickets') || []), ...(store.get('features') || []), ...(store.get('epics') || [])];
    const suggestions = [...new Set(allTickets.flatMap(t => t.labels || []))]
        .filter(l => !currentLabels.includes(l))
        .sort();

    const wrap  = document.createElement('div');
    wrap.className = 'person-picker label-picker';
    wrap.classList.add('person-picker--no-clear');

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'person-picker-input';
    input.placeholder = '+ label (Entrée ou clic)'; input.autocomplete = 'off';

    const list = document.createElement('div');
    list.className = 'person-picker-list'; list.role = 'listbox';

    const _buildList = (q = '') => {
        if (!q) { list.hidden = true; list.innerHTML = ''; return; }
        const lq = q.toLowerCase();
        const matches = suggestions.filter(s => s.toLowerCase().includes(lq));
        list.innerHTML = matches.map(s =>
            `<div class="person-picker-opt label-picker-opt" data-label="${esc(s)}" role="option">
                <span class="label-picker-dot" style="background:${labelColor(s)}"></span>
                <span class="person-picker-name">${esc(s)}</span>
            </div>`
        ).join('');
        if (!matches.some(s => s.toLowerCase() === lq)) {
            list.innerHTML += `<div class="person-picker-opt label-picker-opt label-picker-new" data-label="${esc(q)}" role="option">
                <span class="person-picker-name">Créer <strong>"${esc(q)}"</strong></span>
            </div>`;
        }
        list.hidden = false;
    };

    wrap.appendChild(input);
    wrap.appendChild(list);
    list.hidden = true;

    input.addEventListener('input', () => _buildList(input.value));
    input.addEventListener('focus', () => { _buildList(input.value); });

    list.addEventListener('mousedown', e => {
        const opt = e.target.closest('.person-picker-opt');
        if (opt) { e.preventDefault(); onAdd(opt.dataset.label); input.value = ''; _buildList(); }
    });
    list.addEventListener('mouseover', e => {
        const opt = e.target.closest('.person-picker-opt');
        const all = [...list.querySelectorAll('.person-picker-opt')];
        if (opt) { all.forEach(o => o.classList.remove('is-hover')); opt.classList.add('is-hover'); }
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return; }
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const hovered = list.querySelector('.is-hover');
            const val = hovered ? hovered.dataset.label : input.value.trim();
            if (val) { onAdd(val); input.value = ''; _buildList(); }
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const opts = [...list.querySelectorAll('.person-picker-opt')];
            const cur = list.querySelector('.is-hover');
            let idx = cur ? opts.indexOf(cur) : -1;
            idx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
            opts.forEach(o => o.classList.remove('is-hover'));
            if (opts[idx]) opts[idx].classList.add('is-hover');
        }
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (!list.matches(':hover')) onCancel(); }, 120); });

    return { wrap, input };
}
