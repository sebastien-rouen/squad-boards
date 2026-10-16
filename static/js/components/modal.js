/**
 * Modal component - rich ticket detail, create/edit forms.
 * Wide layout, 2-column meta, reporter, links, ADF description.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, fmtDate, fmtDateLong, fmtRelative, initials, hashColor, toast, toastUndo, parseWikiMarkup, copyToClipboard, confirmDanger, fieldLabelFr, promptModal, typeBadge, statusBadge, priorityBadge, priorityKey, PRIORITY_META, trapFocus, cycleDays, leadDays, wipAgeDays, workdaysBetween, workdaysLeft, pointsTone, teamPointsMedian, estimationQueue, labelChipHtml, labelColor, findPerson, todayIsoLocal, getSprintForTeam, emptyStateHtml } from '../utils.js';
import { ticketFlowModel, ticketFlowHtml, bindTicketFlow } from './ticket_flow.js';
import { presenceStripHtml, sprintWorkDays, nextAbsence } from './meteo_fiche.js';
import { pokerSoundOn, setPokerSound, playPokerSound } from './poker_sound.js';
import { descSections, descSectionsHtml } from './desc_sections.js';
import { STATUS_LABELS, STATUS_ORDER, TYPE_LABELS, TYPE_ICONS } from '../config.js';

const overlay = () => document.getElementById('modal-overlay');
const titleEl = () => document.getElementById('modal-title');

// Icônes des statuts — même esprit que TYPE_ICONS (création de ticket), pour une chip-sel-group
// homogène entre la modale de création (type) et le sélecteur de statut de la modale détail.
const STATUS_ICONS = { todo: '📋', inprog: '🔄', review: '👀', test: '🧪', blocked: '🚫', done: '✅' };

// ── Epic picker : récents (localStorage) + autocomplete + tri alpha ─────────
const _RECENT_EPICS_KEY = 'sb-recent-epics';
const _RECENT_EPICS_MAX = 8;
function _getRecentEpics() {
    try { return JSON.parse(localStorage.getItem(_RECENT_EPICS_KEY) || '[]'); }
    catch { return []; }
}
function _pushRecentEpic(id) {
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
function _makeEpicPicker(allEpics, currentId, onCommit, onCancel) {
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

function _makePersonPicker(allNames, currentName, onCommit, onCancel) {
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
function _makeChipPicker(options, currentValue, onCommit) {
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

function _openChipPicker(el, options, currentValue, onCommit) {
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
function _openChipDropdown(el, items, currentValue, onCommit) {
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
function _labelChipEl(label) {
    const tpl = document.createElement('template');
    tpl.innerHTML = labelChipHtml(label, { removable: true });
    return tpl.content.firstElementChild;
}

// Autocomplete pour les labels — suggestions depuis les labels existants du store + frappe libre
function _makeLabelPicker(currentLabels, onAdd, onCancel) {
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

const _isWikiMarkup = s => /(?:^|\n)h[1-6]\. |(?:^|\n)[*#]+ |\{code[\s:{]/.test(s);

function _renderCommentBody(body) {
    if (!body) return '<em class="text-muted text-xs">—</em>';
    if (typeof body === 'object') return _adfToHtml(body);
    if (typeof body === 'string') {
        if (body.startsWith('<')) return body;
        if (body.startsWith('{')) { try { return _adfToHtml(JSON.parse(body)); } catch { /* not JSON */ } }
        if (_isWikiMarkup(body)) return parseWikiMarkup(body);
        return esc(body).replace(/\n/g, '<br>');
    }
    return esc(String(body));
}

function _adfToHtml(doc) {
    if (!doc) return '';
    const render = (node) => {
        if (!node) return '';
        const kids = () => (node.content || []).map(render).join('');
        switch (node.type) {
            case 'doc': return kids();
            case 'paragraph': return `<p>${kids()}</p>`;
            case 'text': {
                let t = esc(node.text || '');
                for (const m of (node.marks || [])) {
                    if (m.type === 'strong') t = `<strong>${t}</strong>`;
                    else if (m.type === 'em') t = `<em>${t}</em>`;
                    else if (m.type === 'code') t = `<code>${t}</code>`;
                    else if (m.type === 'link') t = `<a href="${esc(m.attrs?.href||'#')}" target="_blank" rel="noopener">${t}</a>`;
                }
                return t;
            }
            case 'hardBreak': return '<br>';
            case 'bulletList': return `<ul>${kids()}</ul>`;
            case 'orderedList': return `<ol>${kids()}</ol>`;
            case 'listItem': return `<li>${kids()}</li>`;
            case 'blockquote': return `<blockquote>${kids()}</blockquote>`;
            case 'codeBlock': return `<pre><code>${kids()}</code></pre>`;
            case 'mention': return `<strong>@${esc((node.attrs?.text || node.attrs?.displayName || '').replace(/^@/, ''))}</strong>`;
            case 'emoji': return node.attrs?.text || node.attrs?.shortName || '';
            default: return kids();
        }
    };
    if (doc.type === 'doc' && doc.content) return doc.content.map(render).join('');
    return render(doc);
}
const bodyEl = () => document.getElementById('modal-body');

export function initModal() {
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-fullpage')?.addEventListener('click', () => {
        const isFs = document.getElementById('modal')?.classList.toggle('modal--fullscreen');
        document.getElementById('modal-overlay')?.classList.toggle('modal-overlay--fullscreen', isFs);
        // Met à jour l'icône : expand ↔ compress
        const btn = document.getElementById('modal-fullpage');
        if (btn) btn.title = isFs ? 'Réduire' : 'Pleine page';
        // Modale TICKET : la pleine page n'est pas qu'un agrandissement — elle re-rend une vue
        // détaillée (voyage ouvert, deux colonnes, historique complet).
        const cur = _modalList[_modalIdx];
        if (cur && bodyEl()?.querySelector('.mdl-head')) openTicketModal(cur.id);
    });
    overlay()?.addEventListener('click', e => { if (e.target === overlay()) closeModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !overlay().classList.contains('hidden')) closeModal();
    });
    window.__squadBoard = window.__squadBoard || {};
    window.__squadBoard.openTicketModal = openTicketModal;
    window.__squadBoard.openCreateModal = openCreateModal;
    window.__squadBoard.openEditModal = openEditModal;
}

let _modalList = [];
let _modalIdx = -1;
let _releaseFocusTrap = null; // piège à focus actif (cf utils.trapFocus)

export function closeModal() {
    overlay().classList.add('hidden');
    // Libère le piège à focus + restaure le focus sur l'élément déclencheur
    if (_releaseFocusTrap) { _releaseFocusTrap(); _releaseFocusTrap = null; }
    // .above-demo (bump z-index au-dessus d'une Demo/alert ouverte) ne doit pas survivre à la
    // fermeture — sinon il reste collé et passe devant le Planning Poker (z-index 2000) sur les
    // ouvertures suivantes, même hors contexte Demo.
    overlay().classList.remove('above-demo');
    // Nettoyage de la sidebar enfants (features) — sinon elle persiste sur la prochaine ouverture
    document.getElementById('mdl-children-side')?.remove();
    document.getElementById('mdl-children-toggle')?.remove();
    document.getElementById('modal')?.classList.remove('has-children-sidebar');
    document.getElementById('modal')?.removeAttribute('data-status');
    // B : retour navigateur propre — évite de laisser le hash /ticket/XXX dans l'historique
    if (/\/ticket\//.test(location.hash)) {
        history.back();
    }
}
function showModal() {
    const wasHidden = overlay().classList.contains('hidden');
    overlay().classList.remove('hidden');
    // Piège à focus : Tab boucle dans la modale, focus restauré à la fermeture.
    // (Uniquement à la 1re ouverture — les navigations précédent/suivant réutilisent le piège.)
    if (wasHidden && !_releaseFocusTrap) {
        _releaseFocusTrap = trapFocus(document.getElementById('modal'));
    }
}

function getMemberNames() {
    return (store.get('members') || []).map(m => m.name || m);
}

function avatar(name, isLeader = false, size = 24) {
    if (!name) return '';
    return `<span class="assignee-avatar${isLeader ? ' leader' : ''}" style="background:${hashColor(name)};color:white;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px" title="${esc(name)}">${esc(initials(name))}</span>`;
}

function personChip(name, role = '') {
    if (!name) return `<span class="mdl-empty">+ Assigner</span>`;
    return `<span class="inline-flex-center">${avatar(name, role === 'leader', 22)} <span>${esc(name)}</span></span>`;
}

/**
 * Liste des sprints associés à un ticket :
 * - `sprintName` (sprint courant côté JIRA, source de vérité).
 * - Sprints historiques extraits de `recentChanges` (changelog JIRA field=Sprint).
 *   JIRA stocke `from`/`to` en liste comma-separated de noms — on union.
 *
 * Retourne `[{ name, isCurrent }]`, sprint courant en premier.
 */
function _sprintsHistoryOfTicket(ticket) {
    const current = (ticket?.sprintName || '').trim();
    const names = new Set();
    if (current) names.add(current);

    const changes = ticket?.recentChanges || ticket?.recent_changes || [];
    for (const c of changes) {
        const f = (c.field || '').toLowerCase().trim();
        if (f !== 'sprint') continue;
        for (const raw of [c.from, c.to]) {
            if (!raw) continue;
            String(raw).split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
        }
    }
    const out = [...names].map(n => ({ name: n, isCurrent: n === current }));
    out.sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
    return out;
}

/** Date+heure complète FR pour le survol de l'historique : "mer. 17 juin, 14:32". */
function _fmtHistDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

/**
 * Historique du ticket regroupé : les modifications CONSÉCUTIVES d'un même auteur
 * forment une seule ligne (nom non répété), chaque changement portant sa date au survol.
 * Reçoit les changements déjà ordonnés (plus récent en premier).
 */
function _renderTicketHistory(changes) {
    const groups = [];
    for (const c of changes) {
        const last = groups[groups.length - 1];
        if (last && last.author === c.author) last.changes.push(c);
        else groups.push({ author: c.author, date: c.date, changes: [c] });
    }
    const _change = c => `<span class="hist-change" title="${esc(_fmtHistDate(c.date))}"><em>${esc(fieldLabelFr(c.field))}</em> : ${esc(c.from || '—')} &rarr; ${esc(c.to || '—')}</span>`;
    return groups.map(g => {
        if (g.changes.length === 1) {
            return `<div class="activity-item">
                <span class="activity-time" title="${esc(_fmtHistDate(g.changes[0].date))}">${fmtRelative(g.changes[0].date)}</span>
                <span class="activity-text"><strong>${esc(g.author)}</strong> a modifié ${_change(g.changes[0])}</span>
            </div>`;
        }
        return `<div class="activity-item">
            <span class="activity-time" title="${esc(_fmtHistDate(g.date))}">${fmtRelative(g.date)}</span>
            <div class="activity-text hist-grouped">
                <span><strong>${esc(g.author)}</strong> a modifié <span class="hist-count">${g.changes.length}</span> champs :</span>
                <div class="hist-changes">${g.changes.map(_change).join('')}</div>
            </div>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// En-tête du ticket : fil d'Ariane (équipe › parent › ticket) + tuiles de propriétés
// ══════════════════════════════════════════════════════════════════════════════

/** Date du dernier changement d'un champ du changelog (`to` non vide si `needTo`), ou null. */
function _lastChangeDate(ticket, field, needTo = false) {
    const f = field.toLowerCase();
    const hit = (ticket.recentChanges || [])
        .filter(c => String(c.field || '').toLowerCase() === f && (!needTo || String(c.to || '').trim()))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    return hit?.date || null;
}

/** « aujourd'hui » / « 1 j » / « 4 j » — jours OUVRÉS écoulés depuis `d` (cf. utils/workdays.js). */
function _sinceTxt(d) {
    const n = workdaysBetween(d, new Date());
    if (n == null) return '';
    return n < 1 ? "aujourd'hui" : `${n} j`;
}

/**
 * Sprint DU TICKET (pas le sprint global de `sprintInfo`, qui est celui d'une autre équipe) :
 * appariement exact sur `sprintName` parmi les sprints connus de toutes les équipes.
 */
function _ticketSprint(ticket) {
    const name = (ticket.sprintName || '').trim();
    if (!name) return null;
    return (store.get('sprintInfo')?.teamSprints || []).find(s => s.name === name) || { name };
}

/** Tuile Sprint : nom, échéance en jours ouvrés, mini-frise avec début / fin du travail. */
function _sprintTileHtml(ticket) {
    const sp = _ticketSprint(ticket);
    const pi = ticket.piSprint ? esc(ticket.piSprint) : '';
    if (!sp) {
        return `<div class="mdl-prop mdl-prop--link mdl-prop--sprint" id="sprint-field" data-field="sprint" data-value="" title="Planifier dans un sprint">
            <span class="mdl-prop-label">Sprint</span>
            <span class="mdl-prop-value text-muted">Hors sprint</span>
            <span class="mdl-prop-sub">${pi || 'Backlog'}</span>
        </div>`;
    }
    const s0 = new Date(sp.startDate).getTime(), s1 = new Date(sp.endDate).getTime();
    const dated = Number.isFinite(s0) && Number.isFinite(s1) && s1 > s0;
    const now = Date.now();
    const pctOf = d => Math.max(0, Math.min(100, ((new Date(d).getTime() - s0) / (s1 - s0)) * 100));
    let when = '', tone = '';
    if (dated) {
        if (sp.state === 'closed' || now > s1) { when = 'Clos'; tone = 'is-closed'; }
        else if (now < s0) { when = `Démarre le ${fmtDate(sp.startDate)}`; tone = 'is-future'; }
        else {
            const left = workdaysLeft(sp.endDate);
            when = left > 0 ? `J-${left}` : 'Dernier jour';
            tone = left <= 2 ? 'is-urgent' : 'is-active';
        }
    }
    const bar = dated ? `<span class="mdl-prop-track ${tone}" title="${esc(fmtDate(sp.startDate))} → ${esc(fmtDate(sp.endDate))}">
            <span class="mdl-prop-track-fill" style="width:${pctOf(now)}%"></span>
            ${ticket.startedDate ? `<span class="mdl-prop-track-mark is-start" style="left:${pctOf(ticket.startedDate)}%" title="Début du travail · ${esc(fmtDate(ticket.startedDate))}"></span>` : ''}
            ${ticket.resolvedDate ? `<span class="mdl-prop-track-mark is-done" style="left:${pctOf(ticket.resolvedDate)}%" title="Résolu · ${esc(fmtDate(ticket.resolvedDate))}"></span>` : ''}
        </span>` : '';
    return `<div class="mdl-prop mdl-prop--link mdl-prop--sprint" id="sprint-field" data-field="sprint" data-value="${esc(sp.name)}" title="${esc(sp.name)} — cliquer pour changer de sprint">
        <span class="mdl-prop-label">Sprint</span>
        <span class="mdl-prop-value mdl-prop-ellipsis">${esc(sp.name)}</span>
        <span class="mdl-prop-sub">${[when && `<span class="mdl-prop-when ${tone}"${when.startsWith('J-') ? ' title="Jours ouvrés restants, aujourd\'hui compris"' : ''}>${esc(when)}</span>`, pi].filter(Boolean).join(' · ')}</span>
        ${bar}
    </div>`;
}

/** Jours ouvrés de la semaine courante (repli quand l'équipe n'a pas de sprint daté). */
function _currentWeek() {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // lundi
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { label: 'cette semaine', days: Array.from({ length: 5 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return iso(x); }) };
}

/**
 * Congés d'une personne sur l'itération EN COURS de l'équipe du ticket : bande « fill » du roster
 * du Dashboard (`presenceStripHtml`, une case par jour ouvré) + prochaine absence. Le nom JIRA
 * (« Prénom Nom ») est rapproché du nom RH (« NOM, Prénom ») par `findPerson`.
 * @returns {{ html: string, absentNow: boolean }}
 */
function _presenceOf(name, ticket) {
    if (!name) return { html: '', absentNow: false };
    const absences = store.get('absences') || [];
    const absName = findPerson(name, absences.map(a => a.memberName), store.get('piInfo')?.personAliases);
    if (!absName) {
        return { html: `<span class="mdl-presence is-unknown" title="${esc(name)} n'est pas rapproché de l'import Congés — à associer dans Paramètres → Absences → Correspondances">congés : non trouvés</span>`, absentNow: false };
    }
    const today = todayIsoLocal();
    const it = sprintWorkDays(getSprintForTeam(ticket.team)) || _currentWeek();
    const next = nextAbsence(absName, absences, today);
    const txt = next
        ? (next.now ? `🌴 absent · ${next.label}` : `prochain congé : ${next.label}`)
        : 'aucun congé prévu';
    return {
        absentNow: !!next?.now,
        html: `<span class="mdl-presence${next?.now ? ' is-now' : ''}" title="Présence de ${esc(absName)} — itération ${esc(it.label)} (import Congés)">${presenceStripHtml(absName, it, absences, today)}<span class="mdl-presence-txt">${esc(txt)}</span></span>`,
    };
}

/** Panneau « voyage du ticket » ouvert ? Mémorisé le temps de la session : la modale se re-rend
 *  après chaque édition, et passer d'un ticket à l'autre pour comparer doit garder le panneau. */
let _flowPref = { normal: false, full: true };   // pleine page : le voyage est ouvert d'office
const _isFull = () => !!document.getElementById('modal')?.classList.contains('modal--fullscreen');
const _flowOpenNow = () => _flowPref[_isFull() ? 'full' : 'normal'];

/** Tuile Flux : la mesure qui compte selon l'avancement (livré / en cours / pas démarré). */
function _flowTileHtml(ticket) {
    const ct = cycleDays(ticket), lt = leadDays(ticket);
    let value, sub, tip;
    if (ticket.status === 'done') {
        value = ct ? `Cycle ${ct} j` : 'Livré';
        sub = lt ? `Lead ${lt} j` : (ticket.resolvedDate ? `le ${esc(fmtDate(ticket.resolvedDate))}` : '');
        tip = 'Cycle = mise en cours → livraison · Lead = création → livraison (jours ouvrés)';
    } else if (ticket.startedDate) {
        value = `${wipAgeDays(ticket.startedDate)} j en cours`;
        sub = `depuis le ${esc(fmtDate(ticket.startedDate))}`;
        tip = 'Âge du travail en cours, en jours ouvrés';
    } else {
        value = 'Pas démarré';
        const wait = workdaysBetween(ticket.createdAt, new Date());
        sub = wait != null ? `en attente ${wait < 1 ? "depuis aujourd'hui" : `depuis ${wait} j`}` : '';
        tip = 'Jours ouvrés écoulés depuis la création';
    }
    const open = _flowOpenNow();
    return `<div class="mdl-prop mdl-prop--more${open ? ' is-open' : ''}" id="mdl-flow-tile" role="button" tabindex="0" aria-expanded="${open}" aria-controls="mdl-flow-panel" title="${esc(tip)} — cliquer pour le détail du parcours">
        <span class="mdl-prop-label">Flux <span class="mdl-prop-more" aria-hidden="true">🧭 détail</span></span>
        <span class="mdl-prop-value">${value}</span>
        <span class="mdl-prop-sub">${sub}</span>
    </div>`;
}

/** En-tête complet du corps de la modale (remplace les anciennes lignes Epic + Meta + barre de sprint). */
function _ticketHeadHtml(ticket, all) {
    const team = ticket.team || '';
    const teamCol = team ? ((store.get('teamObjects') || []).find(o => o.name === team)?.color || hashColor(team)) : '';
    const parent = ticket.epic ? all.find(t => t.id === ticket.epic) : null;
    const pKey = priorityKey(ticket.priority);

    // Statut : depuis quand (dernier changement de statut, sinon début du travail).
    const statusSince = _lastChangeDate(ticket, 'status') || (ticket.status !== 'todo' ? ticket.startedDate : null) || ticket.createdAt;
    const statusSub = ticket.status === 'done' && ticket.resolvedDate
        ? `le ${esc(fmtDate(ticket.resolvedDate))}`
        : (statusSince ? `depuis ${esc(_sinceTxt(statusSince))}` : '');

    const blockedSince = ticket.flagged ? _lastChangeDate(ticket, 'flagged', true) : null;
    // Sprint COURANT = tuile Sprint (affichage + édition) ; les AUTRES vont dans la bande du bas.
    const otherSprints = _sprintsHistoryOfTicket(ticket).filter(sp => !sp.isCurrent);

    // Points : palier ABSOLU (couleur) + repère RELATIF à l'équipe (texte).
    const pts = pointsTone(ticket.points);
    const median = team ? teamPointsMedian((store.get('tickets') || []).filter(x => x.team === team)) : null;
    // Ratio à la médiane de l'équipe : « ≈ méd. » entre 0,8× et 1,25×, sinon « ×1,6 » (tuile étroite).
    const ratio = median && ticket.points ? ticket.points / median : null;
    const medTxt = ratio == null ? '' : (ratio >= 0.8 && ratio <= 1.25 ? '≈ méd.' : `×${String(Math.round(ratio * 10) / 10).replace('.', ',')} méd.`);
    const ptsSub = ticket.points
        ? [pts.hint ? `<span class="pts-hint pts-tone--${pts.key}">${esc(pts.hint)}</span>` : esc(pts.label), esc(medTxt)].filter(Boolean).join(' · ')
        : 'non estimé';
    const ptsTip = ticket.points
        ? `${pts.label} (${ticket.points} pts)${median ? ` — médiane des tickets estimés de ${team} : ${median} pts` : ''} · cliquer pour changer`
        : 'Non estimé — cliquer pour estimer, ou lancer un Poker';

    return `<section class="mdl-head" aria-label="Propriétés du ticket">
        ${ticket.flagged ? `<div class="mdl-head-alert" role="status">
            <span class="mdl-head-alert-ico" aria-hidden="true">🚫</span>
            <span class="mdl-head-alert-txt"><strong>Bloqué</strong>${blockedSince ? ` depuis ${esc(_sinceTxt(blockedSince))} <span class="text-muted">· ${esc(fmtDate(blockedSince))}</span>` : ''}</span>
        </div>` : ''}

        <!-- Fil d'Ariane : équipe › parent › ticket -->
        <div class="mdl-crumbs">
            <span class="mdl-crumb mdl-crumb--team editable-field" data-field="team" data-value="${esc(team)}" title="Équipe — cliquer pour changer">
                ${team ? `<span class="mdl-crumb-dot" style="background:${esc(teamCol)}"></span>${esc(team)}` : '<span class="text-muted">Sans équipe</span>'}
            </span>
            <span class="mdl-crumb-sep" aria-hidden="true">›</span>
            <span class="mdl-crumb mdl-crumb--parent">
                <span class="mdl-crumb-parent editable-field" data-field="epic" data-value="${esc(ticket.epic || '')}" title="Parent — cliquer pour changer">
                    ${ticket.epic
                        ? `${typeBadge(parent?.type || 'feature', { size: '2xs', label: parent ? null : 'Parent' })}<span class="mdl-link-id" data-ticket-id="${esc(ticket.epic)}">${esc(ticket.epic)}</span>${parent?.title ? `<span class="mdl-crumb-title">${esc(parent.title)}</span>` : ''}`
                        : '<span class="mdl-crumb-empty">+ Rattacher à une feature</span>'}
                </span>
                ${ticket.epic ? `<button class="btn-open-linked" data-ticket-id="${esc(ticket.epic)}" title="Ouvrir ${esc(ticket.epic)}"><svg class="icon icon-xs"><use href="#i-external"/></svg></button>` : ''}
            </span>
            <span class="mdl-crumb-sep" aria-hidden="true">›</span>
            <span class="mdl-crumb mdl-crumb--self">${esc(ticket.id)}</span>
            <span class="mdl-crumbs-spacer"></span>
            <label class="toggle-switch toggle-switch--danger mdl-block-toggle${ticket.flagged ? ' is-on' : ''}" title="${ticket.flagged ? 'Lever le blocage' : 'Signaler un blocage'}">
                <input type="checkbox" role="switch" class="editable-field" data-field="flagged" data-value="${ticket.flagged ? 'true' : 'false'}" ${ticket.flagged ? 'checked' : ''} aria-label="Ticket bloqué">
                <span class="toggle-track"></span>
                <span class="mdl-block-toggle-txt">${ticket.flagged ? '🚫 Bloqué' : 'Bloqué'}</span>
            </label>
            <span class="mdl-crumbs-dates" title="Créé le ${esc(fmtDateLong(ticket.createdAt))} · mis à jour le ${esc(fmtDateLong(ticket.updatedAt))}">
                Créé le ${esc(fmtDate(ticket.createdAt))} · maj ${esc(fmtRelative(ticket.updatedAt))}
            </span>
        </div>

        <!-- Propriétés clés : ce qu'on regarde d'abord -->
        <div class="mdl-props">
            <div class="mdl-prop mdl-prop--link mdl-prop--status" data-proxy="mdl-status-badge-link">
                <span class="mdl-prop-label">Statut</span>
                <span class="mdl-prop-value">${statusBadge(ticket, { extra: 'mdl-type-badge', attrs: 'id="mdl-status-badge-link" title="Cliquer pour modifier le statut"', title: false })}</span>
                <span class="mdl-prop-sub">${statusSub}</span>
            </div>
            <div class="mdl-prop mdl-prop--edit editable-field" data-field="priority" data-value="${pKey}" title="Priorité — cliquer pour changer">
                <span class="mdl-prop-label">Priorité</span>
                <span class="mdl-prop-value">${priorityBadge(ticket.priority)}</span>
            </div>
            <div class="mdl-prop mdl-prop--link mdl-prop--points" data-proxy="mdl-points" title="${esc(ptsTip)}">
                <span class="mdl-prop-label">Estimation</span>
                <span class="mdl-prop-value">
                    <span class="mdl-points pts-tone--${pts.key} editable-field" id="mdl-points" data-field="points" data-value="${ticket.points || 0}">${ticket.points ? `${ticket.points}<small>pts</small>` : '—<small>pts</small>'}</span>
                    <button class="mdl-poker-btn" id="mdl-poker-btn" data-ticket-id="${esc(ticket.id)}" title="Planning Poker — voter collectivement sur les Story Points">🃏 Poker</button>
                </span>
                <span class="mdl-prop-sub">${ptsSub}</span>
            </div>
            ${_sprintTileHtml(ticket)}
            ${_flowTileHtml(ticket)}
        </div>

        <!-- Classement : labels (éditables) + sprints déjà traversés (historique JIRA) -->
        <div class="mdl-head-tags">
            <span class="mdl-prop-label">Labels</span>
            <span class="mdl-head-tags-list" id="labels-inline-wrap">
                ${(ticket.labels || []).map(l => labelChipHtml(l, { removable: true })).join('')}
                <input type="text" class="mdl-inline-input" id="label-add-input" placeholder="+ label (Entrée)">
            </span>
            ${otherSprints.length ? `<span class="mdl-head-hist" title="Sprints par lesquels le ticket est passé ou a été planifié (historique JIRA)">
                <span class="mdl-prop-label">Passé par</span>
                ${otherSprints.map(sp => `<span class="chip chip-sprint chip-sprint--past">○ ${esc(sp.name)}</span>`).join('')}
            </span>` : ''}
        </div>
        <div class="mdl-flow-panel" id="mdl-flow-panel"${_flowOpenNow() ? '' : ' hidden'}></div>
    </section>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Ticket Detail - rich layout
// ══════════════════════════════════════════════════════════════════════════════
export function openTicketModal(ticketId) {
    const tickets = store.get('tickets') || [];
    const epics = store.get('epics') || [];
    const features = store.get('features') || [];
    const all = [...tickets, ...epics, ...features];
    const ticket = all.find(t => t.id === ticketId);
    if (!ticket) return;

    // Track navigation context
    _modalList = all;
    _modalIdx = all.findIndex(t => t.id === ticketId);

    const jiraUrl = store.get('jiraUrl');
    const jiraLink = jiraUrl ? `${jiraUrl}/browse/${ticket.id}` : null;

    const leader = ticket.leader || ticket.assignee;
    const reporter = ticket.reporter || null;
    const contributors = (ticket.contributors || []).filter(c => c && c !== leader);
    const comments = ticket.comments || [];
    const links = ticket.links || [];
    const description = ticket.description || '';

    // ── G : bordure statut sur la modale ─────────────────────────────────────
    const modalEl = document.getElementById('modal');
    if (modalEl) {
        modalEl.dataset.status = ticket.status;
    }

    // ── Title bar : repères du ticket (ligne 1) + titre complet sur 2 lignes max (ligne 2) ──
    // Le style vit sous `.mdl-titlebar` / `#modal:has(.mdl-titlebar)` : #modal est partagé
    // par toutes les modales, les autres gardent l'en-tête d'origine.
    const _svgCopy = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const _svgLink = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
    titleEl().innerHTML = `
        <span class="mdl-titlebar">
            <span class="mdl-titlebar-top">
                <span class="mdl-nav-group" role="group" aria-label="Navigation entre tickets">
                    <button class="mdl-nav-btn${_modalIdx <= 0 ? ' disabled' : ''}" id="mdl-prev" title="Précédent (←)" aria-label="Ticket précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
                    <button class="mdl-nav-btn${_modalIdx >= all.length - 1 ? ' disabled' : ''}" id="mdl-next" title="Suivant (→)" aria-label="Ticket suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
                </span>
                <!-- D : badge type — clic = liste déroulante des types -->
                ${typeBadge(ticket.type, { extra: 'mdl-type-badge', attrs: 'id="mdl-type-badge-link" title="Cliquer pour modifier le type"', title: false })}
                <span class="mdl-key">
                    ${jiraLink
                        ? `<a class="mdl-ticket-link" href="${esc(jiraLink)}" target="_blank" rel="noopener" title="Ouvrir dans JIRA">${esc(ticket.id)}</a>`
                        : `<span class="mdl-ticket-id">${esc(ticket.id)}</span>`}
                    <button class="copy-btn copy-btn--always" id="mdl-copy-key" data-copy-key="${esc(ticket.id)}" data-copy-title="${esc(ticket.title)}" title="Copier '${esc(ticket.id)} - ${esc(ticket.title)}'">${_svgCopy}</button>
                    <!-- E : copie URL JIRA -->
                    ${jiraLink ? `<button class="copy-btn copy-btn--always" id="mdl-copy-url" title="Copier le lien JIRA">${_svgLink}</button>` : ''}
                </span>
                <span class="mdl-titlebar-spacer"></span>
                <!-- C : badge commentaires -->
                ${comments.length ? `<button class="mdl-comments-badge" id="mdl-scroll-comments" title="Voir les commentaires">💬 ${comments.length}</button>` : ''}
                <!-- H : avatar leader -->
                ${leader ? `<span class="mdl-header-avatar" style="background:${hashColor(leader)}" title="Leader : ${esc(leader)}">${esc(initials(leader))}</span>` : ''}
            </span>
            <span class="mdl-title-span" id="mdl-title-span" title="${esc(ticket.title)} — cliquer pour modifier">${esc(ticket.title)}</span>
        </span>
    `;

    // ── Body ──────────────────────────────────────────────────────────────────
    const isFull = _isFull();
    bodyEl().innerHTML = `
        ${_ticketHeadHtml(ticket, all)}

        <!-- Mise en page : en modale, une seule colonne dans l'ordre historique (CSS « order », les deux
             conteneurs en display:contents) ; en PLEINE PAGE, description à gauche, activité à droite. -->
        <div class="mdl-layout">
        <aside class="mdl-aside" aria-label="Personnes et activité">
        <!-- Personnes : une rangée de trois cellules (labels et historique de sprint = bas de l'en-tête) -->
        <section class="mdl-panel mdl-people" aria-label="Personnes">
            <div class="mdl-field">
                <span class="mdl-field-label">Leader</span>
                <span class="mdl-field-value editable-field" data-field="leader" data-value="${esc(leader || '')}">${personChip(leader, 'leader')}</span>
                ${_presenceOf(leader, ticket).html}
            </div>
            <div class="mdl-field">
                <span class="mdl-field-label">Rapporteur</span>
                <span class="mdl-field-value editable-field" data-field="reporter" data-value="${esc(reporter || '')}">${personChip(reporter)}</span>
                ${_presenceOf(reporter, ticket).html}
            </div>
            <div class="mdl-field">
                <span class="mdl-field-label">Contributeurs</span>
                <span class="mdl-field-value flex-wrap" id="contrib-inline-wrap">
                    ${contributors.map(c => {
                        const away = _presenceOf(c, ticket).absentNow;
                        return `<span class="chip chip-gap${away ? ' chip--away' : ''}"${away ? ` title="${esc(c)} est absent·e aujourd'hui"` : ''}>${avatar(c, false, 18)} ${esc(c)}${away ? ' 🌴' : ''} <button type="button" class="contrib-rm" data-name="${esc(c)}" title="Retirer">×</button></span>`;
                    }).join('')}
                    <button type="button" class="contrib-add-btn" id="contrib-add-btn" title="Ajouter un contributeur">+ Ajouter</button>
                </span>
            </div>
        </section>

        </aside>
        <div class="mdl-main">
        <!-- Description (wysiwyg inline) -->
        <div class="mdl-desc-wrap" id="desc-wrap">
            <div class="mdl-desc-header">
                <span class="mdl-section-label">Description</span>
                <button type="button" class="btn-icon mdl-desc-edit-btn" id="desc-edit-btn" title="Modifier la description">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
            </div>
            <div class="mdl-description mdl-desc-view" id="desc-view">
                ${_renderCommentBody(ticket.description) || '<p class="text-muted text-sm desc-placeholder">Aucune description. Cliquez pour ajouter.</p>'}
            </div>
            <div class="mdl-desc-editor hidden" id="desc-editor">
                <div class="desc-toolbar" id="desc-toolbar">
                    <button type="button" class="desc-tb-btn" data-cmd="bold" title="Gras (Ctrl+B)"><b>B</b></button>
                    <button type="button" class="desc-tb-btn" data-cmd="italic" title="Italique (Ctrl+I)"><i>I</i></button>
                    <button type="button" class="desc-tb-btn" data-cmd="underline" title="Souligné (Ctrl+U)"><u>U</u></button>
                    <button type="button" class="desc-tb-btn" data-cmd="strikeThrough" title="Barré"><s>S</s></button>
                    <span class="desc-tb-sep"></span>
                    <button type="button" class="desc-tb-btn" data-cmd="formatBlock" data-val="h2" title="Titre H2">H2</button>
                    <button type="button" class="desc-tb-btn" data-cmd="formatBlock" data-val="h3" title="Sous-titre H3">H3</button>
                    <button type="button" class="desc-tb-btn" data-cmd="formatBlock" data-val="p" title="Paragraphe">¶</button>
                    <span class="desc-tb-sep"></span>
                    <button type="button" class="desc-tb-btn" data-cmd="insertUnorderedList" title="Liste à puces">• UL</button>
                    <button type="button" class="desc-tb-btn" data-cmd="insertOrderedList" title="Liste numérotée">1. OL</button>
                    <span class="desc-tb-sep"></span>
                    <button type="button" class="desc-tb-btn" id="desc-tb-link" title="Insérer un lien">🔗</button>
                    <button type="button" class="desc-tb-btn" data-cmd="unlink" title="Retirer le lien">⛓</button>
                    <button type="button" class="desc-tb-btn" id="desc-tb-img" title="Insérer une image">🖼</button>
                    <button type="button" class="desc-tb-btn" data-cmd="removeFormat" title="Effacer le formatage">Aa×</button>
                </div>
                <div contenteditable="true" class="mdl-description desc-editable" id="desc-content"></div>
                <div class="desc-editor-actions">
                    <span class="text-xs text-muted">Ctrl+Entrée · Échap pour annuler</span>
                    <button class="btn btn-secondary btn-sm" type="button" id="desc-cancel">Annuler</button>
                    <button class="btn btn-primary btn-sm" type="button" id="desc-save">Enregistrer</button>
                </div>
            </div>
        </div>

        <!-- Issue Links -->
        ${links.length ? `
            <div class="mdl-links">
                <div class="mdl-links-title">Liens (${links.length})</div>
                ${links.map(l => `
                    <div class="mdl-link-row">
                        <span class="mdl-link-type">${esc(l.type || 'lie a')}</span>
                        <span class="mdl-link-id" data-ticket-id="${esc(l.id)}">${esc(l.id)}</span>
                        <span class="mdl-link-title">${esc(l.title)}</span>
                        ${l.status ? `<span class="badge badge-status badge-2xs">${esc(l.status)}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : ''}

        </div>
        <div class="mdl-aside-tail">
        <!-- Tours de Planning Poker conclus — chargés à la demande (hors /api/all), cachés s'il n'y en a pas -->
        <details open class="mb-4 mdl-poker-rounds" id="mdl-poker-rounds" data-ticket="${esc(ticket.id)}" hidden>
            <summary class="text-xs font-semibold text-muted mb-2">🃏 Estimations en équipe (<span data-pr-count>0</span>)</summary>
            <div class="mdl-pr-list"></div>
        </details>
        <!-- History — pleine page : déplié et COMPLET (en modale : les 12 plus récents) -->
        ${ticket.recentChanges?.length ? `
            <details class="mb-4 mdl-history"${isFull ? ' open' : ''}>
                <summary class="text-xs font-semibold text-muted mb-2">Historique (${ticket.recentChanges.length})</summary>
                <div class="activity-list">
                    ${/* Les 12 PLUS RÉCENTS, affichés du plus ancien au plus récent. Avant : slice(-12) sur une liste
                       triée du plus récent au plus ancien = les 12 plus ANCIENS — invisible tant que l'historique
                       tenait en 8 lignes, faux depuis qu'il garde tous les statuts (3.216.0). */
                      _renderTicketHistory([...ticket.recentChanges].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, isFull ? undefined : 12).reverse())}
                </div>
            </details>
        ` : ''}

        <!-- Comments -->
        <details open class="mb-4 mdl-comments">
            <summary class="text-xs font-semibold text-muted mb-2">Commentaires (${comments.length})</summary>
            <div class="comment-list" id="comment-list">
                ${comments.length ? comments.map(c => `
                    <div class="comment-item">
                        <span class="comment-avatar" style="background:${hashColor(c.author)}">${esc(initials(c.author))}</span>
                        <div class="comment-content">
                            <div class="comment-header">
                                <span class="comment-author">${esc(c.author)}</span>
                                <span class="comment-date">${fmtRelative(c.date)}</span>
                                <button class="btn-icon comment-delete" data-comment-id="${esc(c.id)}" title="Supprimer"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>
                            </div>
                            <div class="comment-body adf-body">${_renderCommentBody(c.body)}</div>
                        </div>
                    </div>
                `).join('') : '<p class="text-muted text-sm">Aucun commentaire</p>'}
            </div>
            <div class="comment-form">
                <textarea class="input" id="comment-text" placeholder="Ajouter un commentaire..." rows="2"></textarea>
                <button class="btn btn-primary btn-sm self-end" id="btn-add-comment">Envoyer</button>
            </div>
        </details>

        </div>
        </div>

        <!-- Actions -->
        <div class="form-actions">
            ${jiraLink ? `<a href="${esc(jiraLink)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><svg class="icon icon-sm"><use href="#i-external"/></svg> JIRA</a>` : ''}
            <button class="btn btn-secondary btn-sm" id="btn-edit-ticket"><svg class="icon icon-sm"><use href="#i-settings"/></svg> Modifier</button>
            <button class="btn btn-danger btn-sm" id="btn-delete-ticket"><svg class="icon icon-sm"><use href="#i-x"/></svg> Supprimer</button>
        </div>
    `;

    // Sidebar latérale "Tickets enfants" — uniquement si ticket.type === 'feature'
    _renderChildrenSidebar(ticket);

    // ── Wire events ───────────────────────────────────────────────────────────
    bodyEl().querySelector('#btn-add-comment')?.addEventListener('click', async () => {
        const text = bodyEl().querySelector('#comment-text')?.value?.trim();
        if (!text) return;
        try {
            await api.addComment(ticket.id, { body: text, author: 'Utilisateur' });
            await refreshData();
            openTicketModal(ticketId);
        } catch (err) { toast(err.message, 'error'); }
    });

    bodyEl().querySelectorAll('.comment-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await confirmDanger('Supprimer ce commentaire ?', 'Cette action est irréversible.');
            if (!ok) return;
            try { await api.deleteComment(ticket.id, btn.dataset.commentId); await refreshData(); openTicketModal(ticketId); }
            catch (err) { toast(err.message, 'error'); }
        });
    });

    // Click on linked ticket IDs
    bodyEl().querySelectorAll('.mdl-link-id[data-ticket-id]').forEach(el => {
        el.addEventListener('click', () => openTicketModal(el.dataset.ticketId));
    });

    // Open linked epic/feature in a new modal
    bodyEl().querySelectorAll('.btn-open-linked[data-ticket-id]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            openTicketModal(el.dataset.ticketId);
        });
    });

    // Tuiles de l'en-tête : un clic sur la tuile (hors bouton / champ éditable) relaie vers son
    // éditeur — statut (badge), points. (La tuile Sprint EST l'éditeur du sprint : #sprint-field.)
    bodyEl().querySelectorAll('.mdl-prop[data-proxy]').forEach(tile => {
        tile.addEventListener('click', e => {
            const target = document.getElementById(tile.dataset.proxy);
            if (!target || target.contains(e.target) || e.target.closest('button, .editable-field')) return;
            target.click();
        });
    });

    // Tours de Poker conclus : chargés après le rendu (garde : la modale a pu changer de ticket entre-temps)
    api.getPokerRounds(ticket.id).then(rounds => {
        const box = bodyEl()?.querySelector('#mdl-poker-rounds');
        if (!box || box.dataset.ticket !== ticket.id || !rounds?.length) return;
        box.querySelector('[data-pr-count]').textContent = rounds.length;
        box.querySelector('.mdl-pr-list').innerHTML = _pokerRoundsHtml(rounds);
        box.hidden = false;
    }).catch(() => { /* historique facultatif : la modale reste utilisable sans */ });

    // Tuile Flux → panneau « Le voyage du ticket » (rendu à la demande : le modèle relit l'équipe).
    const flowTile = bodyEl().querySelector('#mdl-flow-tile');
    const flowPanel = bodyEl().querySelector('#mdl-flow-panel');
    if (flowTile && flowPanel) {
        const renderFlow = () => {
            const model = ticketFlowModel(ticket, tickets.filter(x => x.team && x.team === ticket.team));
            flowPanel.innerHTML = ticketFlowHtml(model);
            bindTicketFlow(flowPanel, model);
        };
        const toggleFlow = () => {
            const open = flowPanel.hidden;
            _flowPref[_isFull() ? 'full' : 'normal'] = open;
            flowTile.classList.toggle('is-open', open);
            flowTile.setAttribute('aria-expanded', String(open));
            flowPanel.hidden = !open;
            if (open) renderFlow();
        };
        flowTile.addEventListener('click', toggleFlow);
        flowTile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFlow(); } });
        if (!flowPanel.hidden) renderFlow();
    }

    bodyEl().querySelector('#btn-edit-ticket')?.addEventListener('click', () => { closeModal(); openEditModal(ticket); });

    // Suppression ANNULABLE : le ticket disparaît tout de suite de l'écran, l'API n'est appelée
    // qu'après 8 s sans « Annuler » — plus de confirmation bloquante pour un geste réversible
    // (`confirmDanger` reste réservé à l'irréversible, ex. régénérer une rotation).
    bodyEl().querySelector('#btn-delete-ticket')?.addEventListener('click', () => {
        const key = ticket.type === 'feature' ? 'features' : ticket.type === 'epic' ? 'epics' : 'tickets';
        const del = ticket.type === 'feature' ? api.deleteFeature : ticket.type === 'epic' ? api.deleteEpic : api.deleteTicket;
        const before = store.get(key) || [];
        store.set(key, before.filter(t => t.id !== ticket.id));
        closeModal();
        window.__squadBoard.rerenderView?.();
        toastUndo(`${ticket.id} supprimé`, {
            onUndo: () => { store.set(key, before); window.__squadBoard.rerenderView?.(); },
            onCommit: async () => {
                try { await del(ticket.id); await refreshData(); }
                catch (err) { toast(err.message, 'error'); store.set(key, before); }
                window.__squadBoard.rerenderView?.();
            },
        });
    });

    // E : copie URL JIRA
    document.getElementById('mdl-copy-url')?.addEventListener('click', () => {
        if (jiraLink) copyToClipboard(jiraLink, 'Lien JIRA copié');
    });


    // C : scroll vers les commentaires
    document.getElementById('mdl-scroll-comments')?.addEventListener('click', () => {
        const commentList = bodyEl().querySelector('#comment-list') || bodyEl().querySelector('details');
        if (commentList) {
            const details = commentList.closest('details') || commentList.querySelector('details');
            if (details) details.open = true;
            commentList.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    // D : badge de type → liste déroulante de chips (même style que la modale de création)
    // ancrée juste sous le badge, plutôt qu'une chip-sel-group permanente dans la ligne meta.
    document.getElementById('mdl-type-badge-link')?.addEventListener('click', e => {
        const items = Object.entries(TYPE_LABELS)
            .filter(([v]) => !['epic', 'feature'].includes(v))
            .map(([v, l]) => ({ val: v, label: `${TYPE_ICONS[v] || ''} ${esc(l)}` }));
        _openChipDropdown(e.currentTarget, items, ticket.type, async (val) => {
            try {
                const col = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
                await col(ticket.id, { type: val });
                await refreshData();
                openTicketModal(ticket.id);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Badge de statut → même mécanisme de liste déroulante que le type.
    document.getElementById('mdl-status-badge-link')?.addEventListener('click', e => {
        const items = STATUS_ORDER.map(s => ({ val: s, label: `${STATUS_ICONS[s] || ''} ${esc(STATUS_LABELS[s])}` }));
        _openChipDropdown(e.currentTarget, items, ticket.status, async (val) => {
            try {
                const col = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
                await col(ticket.id, { status: val });
                await refreshData();
                toast(`Statut → ${STATUS_LABELS[val]}`, 'success');
                openTicketModal(ticket.id);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Bouton copier (clé + titre)
    document.getElementById('mdl-copy-key')?.addEventListener('click', e => {
        const btn = e.currentTarget;
        const key = btn.dataset.copyKey || '';
        const title = btn.dataset.copyTitle || '';
        copyToClipboard(`${key} - ${title}`, 'Copié');
    });

    _bindDescriptionEditor(bodyEl(), ticket);
    // Le badge de type ([data-field="type"]) vit dans la barre de titre (titleEl()), pas dans
    // le corps — binder sur #modal (ancêtre commun titre+corps) au lieu de bodyEl() seul,
    // sinon son clic ne déclenche jamais le picker (footgun : "je ne vois pas pour modifier le type").
    _bindInlineEditors(document.getElementById('modal') || bodyEl(), ticket);

    // Prev/Next buttons
    document.getElementById('mdl-prev')?.addEventListener('click', () => {
        if (_modalIdx > 0) openTicketModal(_modalList[_modalIdx - 1].id);
    });
    document.getElementById('mdl-next')?.addEventListener('click', () => {
        if (_modalIdx < _modalList.length - 1) openTicketModal(_modalList[_modalIdx + 1].id);
    });

    // Sync URL hash — replaceState si la modale est déjà ouverte (navigation prev/next)
    // pour éviter d'empiler des entrées qui forcent plusieurs "retours" à la fermeture.
    // `/poker` final compris : ouvrir un ticket depuis la popin (« Suivant à estimer ») empilait sinon
    // « …/ticket/A/poker/ticket/B ».
    const baseHash = location.hash.replace(/^#/, '').replace(/\/ticket\/[^/]+(\/poker)?$/, '') || store.get('view') || 'dashboard';
    const targetHash = `#${baseHash}/ticket/${encodeURIComponent(ticketId)}`;
    if (location.hash !== targetHash) {
        if (!overlay().classList.contains('hidden')) history.replaceState(null, '', targetHash);
        else history.pushState(null, '', targetHash);
    }

    showModal();
}

// ══════════════════════════════════════════════════════════════════════════════
// Description WYSIWYG inline editor
// ══════════════════════════════════════════════════════════════════════════════
function _bindDescriptionEditor(container, ticket) {
    const viewEl    = container.querySelector('#desc-view');
    const editorEl  = container.querySelector('#desc-editor');
    const contentEl = container.querySelector('#desc-content');
    const toolbar   = container.querySelector('#desc-toolbar');
    if (!viewEl || !editorEl || !contentEl) return;

    const PLACEHOLDER = '<p class="text-muted text-sm desc-placeholder">Aucune description. Cliquez pour ajouter.</p>';
    let _html = _renderCommentBody(ticket.description) || '';

    const enterEdit = () => {
        contentEl.innerHTML = _html;
        viewEl.classList.add('hidden');
        editorEl.classList.remove('hidden');
        contentEl.focus();
        const range = document.createRange();
        range.selectNodeContents(contentEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };

    const exitEdit = () => {
        editorEl.classList.add('hidden');
        viewEl.classList.remove('hidden');
    };

    const save = async () => {
        const empty = !contentEl.textContent.trim();
        const html  = empty ? '' : contentEl.innerHTML;
        try {
            const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
            await fn(ticket.id, { description: html });
            _html = html;
            viewEl.innerHTML = html || PLACEHOLDER;
            exitEdit();
            await refreshData();
            toast('Description mise à jour', 'success');
        } catch (err) { toast(err.message, 'error'); }
    };

    container.querySelector('#desc-edit-btn')?.addEventListener('click', enterEdit);
    viewEl.addEventListener('click', enterEdit);
    container.querySelector('#desc-save')?.addEventListener('click', save);
    container.querySelector('#desc-cancel')?.addEventListener('click', () => {
        contentEl.innerHTML = _html;
        exitEdit();
    });
    contentEl.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); contentEl.innerHTML = _html; exitEdit(); }
    });
    toolbar?.addEventListener('mousedown', async e => {
        const btn = e.target.closest('.desc-tb-btn');
        if (!btn) return;
        e.preventDefault();
        if (btn.id === 'desc-tb-link' || btn.id === 'desc-tb-img') {
            // La modale (async) prend le focus → on sauve la sélection AVANT, on la restaure APRÈS.
            const sel = window.getSelection();
            const savedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
            const isImg = btn.id === 'desc-tb-img';
            const url = await promptModal(isImg ? 'URL de l\'image' : 'URL du lien', {
                type: 'url', placeholder: 'https://…', confirmLabel: 'Insérer', required: true,
            });
            contentEl.focus();
            if (savedRange) {
                const s = window.getSelection();
                s.removeAllRanges();
                s.addRange(savedRange);
            }
            if (url) document.execCommand(isImg ? 'insertImage' : 'createLink', false, url);
            return;
        }
        const cmd = btn.dataset.cmd, val = btn.dataset.val || null;
        if (cmd) document.execCommand(cmd, false, val);
        contentEl.focus();
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Inline field editors
// ══════════════════════════════════════════════════════════════════════════════
// Flash vert discret sur un élément après sauvegarde réussie
function _flashSaved(el) {
    if (!el) return;
    el.classList.add('mdl-field-saved');
    setTimeout(() => el?.classList.remove('mdl-field-saved'), 900);
}

function _bindInlineEditors(container, ticket) {
    const apiSave = async (fields, flashEl) => {
        const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
        await fn(ticket.id, fields);
        if (flashEl) _flashSaved(flashEl);
        await refreshData();
    };

    // ── Title ─────────────────────────────────────────────────────────────────
    const titleSpan = document.getElementById('mdl-title-span');
    if (titleSpan) {
        titleSpan.addEventListener('click', () => {
            if (titleSpan.querySelector('input')) return;
            const orig = ticket.title;
            const inp = document.createElement('input');
            inp.type = 'text'; inp.value = orig; inp.className = 'mdl-title-input';
            titleSpan.innerHTML = ''; titleSpan.appendChild(inp);
            inp.focus(); inp.select();
            let done = false;
            const commit = async () => {
                if (done) return; done = true;
                const val = inp.value.trim() || orig;
                if (val === orig) { titleSpan.textContent = orig; return; }
                try { await apiSave({ title: val }); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); titleSpan.textContent = orig; }
            };
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
                if (e.key === 'Escape') { done = true; titleSpan.textContent = orig; }
            });
        });
    }

    // ── Chip pickers : priorité, points, équipe ──────────────────────────────
    // Libellés / niveaux : PRIORITY_META (utils/priority.js), même source que le badge de l'en-tête.
    const PRIO_COLORS = { critical: ['var(--danger)', 'var(--danger-bg)'], high: ['var(--warning)', 'var(--warning-bg)'], medium: ['var(--info)', 'var(--info-bg)'], low: ['var(--text-muted)', 'var(--bg-alt)'] };
    const PRIO_CFG = Object.fromEntries(Object.entries(PRIORITY_META).map(([k, m]) => [k, { label: m.label, color: PRIO_COLORS[k][0], bg: PRIO_COLORS[k][1] }]));
    const prioOptions = Object.entries(PRIO_CFG).map(([v, c]) => ({ value: v, label: c.label, color: c.color, bg: c.bg }));
    // Points : même palier de couleur que la pastille de l'en-tête (pointsTone → .pts-tone--*).
    const ptOptions   = [0,1,2,3,5,8,13,21].map(p => {
        const tone = pointsTone(p);
        return { value: String(p), label: p ? `${p}` : '—', cls: `chip-picker-opt--pts pts-tone--${tone.key}`, title: p ? `${tone.label}${tone.hint ? ` — ${tone.hint}` : ''}` : 'Non estimé' };
    });
    const teamObjs    = store.get('teamObjects') || [];
    const teamOptions = [
        { value: '', label: '— Aucune' },
        ...teamObjs.map(t => ({ value: t.name, label: t.name, dot: t.color })),
    ];

    container.querySelectorAll('[data-field]').forEach(el => {
        const field = el.dataset.field;

        // Type : géré via _openChipDropdown (clic sur le badge titre), câblé plus haut.

        if (field === 'flagged') {
            el.addEventListener('click', async () => {
                try { await apiSave({ flagged: el.dataset.value !== 'true' }); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            });
            return;
        }

        if (field === 'priority') {
            el.addEventListener('click', () => _openChipPicker(el, prioOptions, el.dataset.value, async (val) => {
                try { await apiSave({ priority: val }, el); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            }));
            return;
        }

        if (field === 'points') {
            el.addEventListener('click', () => {
                _openChipPicker(el, ptOptions, String(el.dataset.value || '0'), async (val) => {
                    try { await apiSave({ points: parseInt(val) || 0 }, el); openTicketModal(ticket.id); }
                    catch (err) { toast(err.message, 'error'); }
                });
                document.querySelector('.chip-picker--open')?.classList.add('chip-picker--nowrap');
            });
            return;
        }

        if (field === 'team') {
            el.addEventListener('click', () => _openChipPicker(el, teamOptions, el.dataset.value || '', async (val) => {
                try { await apiSave({ team: val || null }, el); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            }));
            return;
        }

        // Epic : picker custom autocomplete (récents + tri alpha) — pas dans OPTIONS
        if (field === 'epic') {
            el.addEventListener('click', e => {
                if (e.target.closest('.mdl-link-id')) return;
                if (el.querySelector('.epic-picker')) return;
                const orig = el.innerHTML;
                const current = el.dataset.value || '';
                const allEpics = store.get('epics') || [];
                const onCommit = async (id) => {
                    cleanup();
                    if (id) _pushRecentEpic(id);
                    try { await apiSave({ epic: id || null }); openTicketModal(ticket.id); }
                    catch (err) { toast(err.message, 'error'); el.innerHTML = orig; }
                };
                const onCancel = () => { cleanup(); el.innerHTML = orig; };
                const { wrap, input } = _makeEpicPicker(allEpics, current, onCommit, onCancel);
                el.innerHTML = '';
                el.appendChild(wrap);
                requestAnimationFrame(() => input.focus());
                const onDocClick = (ev) => { if (!wrap.contains(ev.target)) onCancel(); };
                const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
                setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
            });
            return;
        }

        // Leader / Reporter : picker autocomplete avec avatars
        if (field === 'leader' || field === 'reporter') {
            el.addEventListener('click', () => {
                if (el.querySelector('.person-picker')) return;
                const orig = el.innerHTML;
                const current = el.dataset.value || '';
                const allNames = getMemberNames();
                const fieldEl = el.closest('.mdl-field');
                const onCommit = async (name) => {
                    cleanup();
                    try { await apiSave({ [field]: name || null }, fieldEl); openTicketModal(ticket.id); }
                    catch (err) { toast(err.message, 'error'); el.innerHTML = orig; }
                };
                const onCancel = () => { cleanup(); el.innerHTML = orig; };
                const { wrap, input } = _makePersonPicker(allNames, current, onCommit, onCancel);
                el.innerHTML = '';
                el.appendChild(wrap);
                requestAnimationFrame(() => input.focus());
                const onDocClick = (ev) => { if (!wrap.contains(ev.target)) onCancel(); };
                const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
                setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
            });
            return;
        }

    });

    // ── Sprint éditable ───────────────────────────────────────────────────────
    const sprintEl = container.querySelector('#sprint-field');
    if (sprintEl) {
        sprintEl.addEventListener('click', () => {
            if (document.querySelector('.chip-picker--open')) return;
            // Sprints JIRA de l'équipe
            const allTeamSprints = (store.get('sprintInfo')?.teamSprints || [])
                .filter(s => s.team === ticket.team)
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
            // Sprints historiques du ticket (changelog) — pas nécessairement dans teamSprints
            const historicalSprints = _sprintsHistoryOfTicket(ticket).map(s => s.name);
            // Union des deux sources, dédupliquée
            const seen = new Set();
            const allNames = [
                ...allTeamSprints.map(s => ({ name: s.name, state: s.state })),
                ...historicalSprints.map(n => ({ name: n, state: 'closed' })),
            ].filter(s => { if (seen.has(s.name)) return false; seen.add(s.name); return true; })
             .slice(0, 14);
            const sprintOptions = [
                { value: '', label: '— Aucun sprint' },
                ...allNames.map(s => ({
                    value: s.name,
                    label: s.name,
                    color: s.state === 'active' ? 'var(--success)' : s.state === 'future' ? 'var(--primary)' : undefined,
                    bg:    s.state === 'active' ? 'color-mix(in srgb, var(--success) 10%, var(--surface))' : s.state === 'future' ? 'var(--primary-bg)' : undefined,
                })),
            ];
            // Toutes les valeurs courantes (sprint actif JIRA + sprints historiques)
            const currentValues = [...new Set([ticket.sprintName, ...historicalSprints].filter(Boolean))];
            const fieldEl = sprintEl.closest('.mdl-field, .mdl-prop');
            _openChipPicker(sprintEl, sprintOptions, currentValues, async (val) => {
                try { await apiSave({ sprintName: val || null }, fieldEl); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            });
        });
    }

    // ── Contributors inline ───────────────────────────────────────────────────
    const contribWrap = container.querySelector('#contrib-inline-wrap');
    if (contribWrap) {
        const getNames = () => Array.from(contribWrap.querySelectorAll('.contrib-rm')).map(b => b.dataset.name);
        const saveC = async () => { try { await apiSave({ contributors: getNames() }); } catch (err) { toast(err.message, 'error'); } };

        // Retrait d'un contributeur
        contribWrap.addEventListener('click', async e => {
            const btn = e.target.closest('.contrib-rm'); if (!btn) return;
            btn.closest('.chip').remove();
            await saveC();
        });

        // Bouton + Ajouter → ouvre le person picker. Se rouvre après chaque ajout
        // pour enchaîner la saisie de plusieurs contributeurs (comme la rotation support).
        const addBtn = contribWrap.querySelector('#contrib-add-btn');
        if (addBtn) {
            const _openContribPicker = () => {
                if (contribWrap.querySelector('.person-picker')) return;
                const current = getNames();
                const allNames = getMemberNames().filter(m => !current.includes(m) && m !== (ticket.leader || ticket.assignee));
                if (!allNames.length) return;
                const onCommit = async (name) => {
                    cleanup();
                    if (!name) return;
                    const chip = document.createElement('span');
                    chip.className = 'chip chip-gap';
                    chip.innerHTML = `${avatar(name, false, 18)} ${esc(name)} <button type="button" class="contrib-rm" data-name="${esc(name)}" title="Retirer">×</button>`;
                    contribWrap.insertBefore(chip, addBtn);
                    await saveC();
                    requestAnimationFrame(() => _openContribPicker());  // enchaîne
                };
                const onCancel = () => { cleanup(); pickerWrap.remove(); };
                const { wrap: pickerWrap, input } = _makePersonPicker(allNames, '', onCommit, onCancel);
                pickerWrap.classList.add('person-picker--no-clear');
                contribWrap.insertBefore(pickerWrap, addBtn);
                requestAnimationFrame(() => input.focus());
                const onDocClick = (ev) => { if (!pickerWrap.contains(ev.target) && ev.target !== addBtn) onCancel(); };
                const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
                setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
            };
            addBtn.addEventListener('click', _openContribPicker);
        }
    }

    // ── Labels inline — autocomplete ──────────────────────────────────────────
    const labelsWrap = container.querySelector('#labels-inline-wrap');
    if (labelsWrap) {
        const getLabels = () => Array.from(labelsWrap.querySelectorAll('.label-rm')).map(b => b.dataset.label);
        const saveL = async () => { try { await apiSave({ labels: getLabels() }); } catch (err) { toast(err.message, 'error'); } };

        // Retrait d'un label
        labelsWrap.addEventListener('click', async e => {
            const btn = e.target.closest('.label-rm'); if (!btn) return;
            btn.closest('.chip').remove(); await saveL();
        });

        // Remplace l'input texte par le label picker
        const oldInput = labelsWrap.querySelector('#label-add-input');
        const { wrap: labelPickerWrap, input: labelInput } = _makeLabelPicker(
            getLabels(),
            async (val) => {
                if (!val || getLabels().includes(val)) return;
                labelsWrap.insertBefore(_labelChipEl(val), labelPickerWrap);
                await saveL();
            },
            () => { labelInput.value = ''; }
        );
        if (oldInput) oldInput.replaceWith(labelPickerWrap);
        else labelsWrap.appendChild(labelPickerWrap);
    }

    // ── Planning Poker ────────────────────────────────────────────────────────
    container.querySelector('#mdl-poker-btn')?.addEventListener('click', () => {
        // Ajoute /poker au hash pour permettre le partage direct du lien
        const cur = location.hash;
        if (!cur.endsWith('/poker')) {
            history.replaceState(null, '', cur.replace(/\/poker$/, '') + '/poker');
        }
        _openPokerModal(ticket, apiSave, openTicketModal);
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Planning Poker — vote collectif Story Points
// ══════════════════════════════════════════════════════════════════════════════
const POKER_FIB  = [1, 2, 3, 5, 8, 13, 21, '?'];
const POKER_FIBS = [1, 2, 3, 5, 8, 13, 21];

/** Échelle « animale » des tailles : un repère ludique qui parle à tout le monde. */
const POKER_ANIMALS = { 1: '🐭', 2: '🐇', 3: '🦊', 5: '🐶', 8: '🐴', 13: '🐘', 21: '🐋' };

/**
 * Tickets de RÉFÉRENCE du Poker : pour chaque taille 1 → 21, le ticket livré le plus TYPIQUE
 * (Cycle Time le plus proche de la médiane de cette taille), de l'équipe du ticket — sinon du
 * train, signalé. Calculé une fois à l'ouverture : la popin se re-rend à chaque rafraîchissement
 * des votes. Durées en jours ouvrés (`cycleDays`).
 */
function _pokerReferences(ticket) {
    const all = store.get('tickets') || [];
    const done = all.filter(t => t.id !== ticket.id && t.status === 'done' && cycleDays(t) > 0);
    // Références ÉPINGLÉES par l'équipe (piInfo.pokerReferences) : priment sur le choix automatique.
    const saved = (ticket.team && store.get('piInfo')?.pokerReferences?.[ticket.team]) || {};
    const team = ticket.team ? done.filter(t => t.team === ticket.team) : [];
    const median = arr => { const v = [...arr].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
    const rows = POKER_FIBS.map(v => {
        let src = 'team', pool = team.filter(t => Number(t.points) === v);
        if (!pool.length) { src = 'train'; pool = done.filter(t => Number(t.points) === v); }
        const pinned = saved[String(v)] ? all.find(t => t.id === saved[String(v)]) : null;
        if (!pool.length) return { v, ref: pinned, n: 0, median: null, src: null, chosen: !!pinned, candidates: [] };
        const med = median(pool.map(cycleDays));
        // Candidats = les plus typiques d'abord (Cycle Time le plus proche de la médiane), puis récents.
        const candidates = [...pool].sort((a, b) => Math.abs(cycleDays(a) - med) - Math.abs(cycleDays(b) - med)
            || String(b.resolvedDate || '').localeCompare(String(a.resolvedDate || ''))).slice(0, 6);
        return { v, ref: pinned || candidates[0], n: pool.length, median: med, src, chosen: !!pinned, candidates };
    });
    const max = Math.max(1, ...rows.map(r => r.median || 0));
    return { rows, max, team: ticket.team || '' };
}

/** Tableau des tickets de référence (bas de la popin Poker). `mine` = ma carte, `nearest` = consensus. */
function _pokerRefsHtml(refs, { open, mine, nearest, current, picking }) {
    const jiraUrl = store.get('jiraUrl');
    const fmtJ = d => `${String(Math.round(d * 10) / 10).replace('.', ',')} j`;
    return `<div class="poker-refs${open ? ' is-open' : ''}">
        <button type="button" class="poker-refs-toggle" id="poker-refs-toggle" aria-expanded="${open}">
            <span>📏 Tickets de référence${refs.team ? ` — ${esc(refs.team)}` : ''}</span>
            <small>le ticket livré « typique » de chaque taille</small>
            <span class="poker-refs-chev" aria-hidden="true">${open ? '▾' : '▸'}</span>
        </button>
        ${open ? `<table class="poker-refs-table">
            <thead><tr><th>Taille</th><th>Ticket de référence</th><th title="Cycle Time médian des tickets livrés de cette taille (jours ouvrés)">Durée typique</th><th>Tickets</th>${refs.team ? '<th></th>' : ''}</tr></thead>
            <tbody>${refs.rows.map(r => {
                const tone = pointsTone(r.v).key;
                const cls = [r.v === mine ? 'is-mine' : '', r.v === nearest ? 'is-nearest' : '', r.v === current ? 'is-current' : ''].filter(Boolean).join(' ');
                const ref = r.ref;
                const refHtml = ref
                    ? `${jiraUrl ? `<a class="poker-ref-id" href="${esc(`${jiraUrl}/browse/${ref.id}`)}" target="_blank" rel="noopener">${esc(ref.id)}</a>` : `<span class="poker-ref-id">${esc(ref.id)}</span>`}
                       <span class="poker-ref-title" title="${esc(ref.title || '')}">${esc(ref.title || '')}</span>
                       ${r.chosen ? `<span class="poker-ref-pin" title="Référence choisie par l'équipe ${esc(refs.team)}">📌 équipe</span>` : r.src === 'train' ? '<span class="poker-ref-src" title="Aucun ticket livré de cette taille dans l\'équipe : référence prise dans le train">train</span>' : ''}`
                    : '<span class="poker-ref-none">aucun ticket livré de cette taille</span>';
                return `<tr class="${cls}">
                    <td><span class="poker-ref-size"><span class="poker-ref-animal" aria-hidden="true">${POKER_ANIMALS[r.v]}</span><span class="mdl-points pts-tone--${tone}">${r.v}<small>pts</small></span></span></td>
                    <td class="poker-ref-cell"><div class="poker-ref-line">${refHtml}${r.v === current ? '<span class="poker-ref-tag">ce ticket</span>' : ''}${r.v === nearest ? '<span class="poker-ref-tag poker-ref-tag--star">★ consensus</span>' : ''}</div></td>
                    <td>${r.median != null ? `<span class="poker-ref-bar"><i class="pts-tone--${tone}" style="width:${Math.max(6, r.median / refs.max * 100)}%"></i></span><b>${fmtJ(r.median)}</b>` : '—'}</td>
                    <td class="poker-ref-n">${r.n || '—'}</td>
                    ${refs.team ? `<td class="poker-ref-act">${r.candidates.length || r.chosen
                        ? `<button type="button" class="poker-ref-btn${picking === r.v ? ' is-on' : ''}" data-ref-pick="${r.v}" title="Choisir le ticket de référence de l'équipe pour ${r.v} pts">${picking === r.v ? 'Fermer' : r.chosen ? 'Changer' : '📌 Choisir'}</button>` : ''}</td>` : ''}
                </tr>${picking === r.v ? `<tr class="poker-ref-cands"><td colspan="5">
                    <span class="poker-ref-cands-title">Quel ticket représente le mieux « ${r.v} pts » pour ${esc(refs.team)} ? <small>(les plus typiques d'abord)</small></span>
                    <div class="poker-ref-cands-list">${r.candidates.map((c, i) => `<button type="button" class="poker-ref-cand${r.chosen && r.ref?.id === c.id ? ' is-chosen' : ''}" data-ref-choose="${r.v}" data-ref-id="${esc(c.id)}" title="${esc(c.title || '')}">
                        <span class="poker-ref-id">${esc(c.id)}</span><span class="poker-ref-title">${esc(c.title || '')}</span><span class="poker-ref-cand-d">${fmtJ(cycleDays(c))}${i === 0 ? ' · ★ typique' : ''}</span>
                    </button>`).join('')}</div>
                    ${r.chosen ? `<button type="button" class="poker-ref-reset" data-ref-unpin="${r.v}">↺ Revenir au choix automatique</button>` : ''}
                </td></tr>` : ''}`;
            }).join('')}</tbody>
        </table>` : ''}
    </div>`;
}

// Génère une couleur HSL stable à partir d'un nom
const _pokerColor = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFF;
    return `hsl(${h % 360}, 60%, 48%)`;
};
const _initials = (name) => name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
// Adapte un vote serveur {voter,value,revealed} → forme front {name,val,me,revealed}.
/** Tickets à estimer APRÈS celui-ci : file partagée avec la page « Séance d'affinage »
 *  (`estimationQueue`, utils/estimation-queue.js), son sprint en tête. Relue à chaque clic. */
const _nextToEstimate = ticket =>
    estimationQueue(store.get('tickets') || [], ticket.team, { sprintName: ticket.sprintName, exclude: ticket.id }).map(x => x.t);

/** Historique des tours de Poker CONCLUS d'un ticket (section de la modale, chargée à la demande). */
function _pokerRoundsHtml(rounds) {
    const fmt = d => String(Math.round(d * 10) / 10).replace('.', ',');
    return rounds.map(r => {
        const nums = (r.votes || []).map(v => Number(v.value)).filter(Number.isFinite);
        const min = nums.length ? Math.min(...nums) : null, max = nums.length ? Math.max(...nums) : null;
        const split = r.spread != null && r.spread >= 4;
        return `<div class="mdl-pr">
            <div class="mdl-pr-head">
                <span class="mdl-pr-date" title="${esc(_fmtHistDate(r.createdAt))}">${esc(fmtRelative(r.createdAt))}</span>
                <span class="mdl-pr-who">${r.voters} votant${r.voters > 1 ? 's' : ''}${r.author ? ` · enregistré par ${esc(r.author)}` : ''}</span>
                ${split ? `<span class="mdl-pr-flag" title="Écart-type ${fmt(r.spread)} — à revoir en rétro ?">⚠️ fort désaccord ${min} ↔ ${max}</span>`
                    : r.spread === 0 && r.voters > 1 ? '<span class="mdl-pr-flag mdl-pr-flag--ok">🎯 unanimité</span>' : ''}
            </div>
            <div class="mdl-pr-body">
                <span class="mdl-pr-votes">${(r.votes || []).map(v => `<span class="mdl-pr-vote" title="${esc(v.voter)} : ${esc(v.value)}">${esc(v.value)}<small>${esc(initials(v.voter))}</small></span>`).join('')}</span>
                <span class="mdl-pr-arrow" aria-hidden="true">→</span>
                <span class="mdl-points pts-tone--${pointsTone(r.value).key}" title="Valeur retenue">${r.value}<small>pts</small></span>
                ${r.avg != null ? `<span class="mdl-pr-avg">moy. ${fmt(r.avg)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

const _adaptVote = (v, myName) => ({
    name: v.voter,
    val: v.value === '?' ? '?' : (v.value === '' || v.value == null ? null : parseInt(v.value)),
    me: v.voter === myName,
    revealed: !!v.revealed,
});

function _openPokerModal(ticket, apiSave, openTicketModal) {
    document.getElementById('poker-overlay')?.remove();

    const ov = document.createElement('div');
    ov.id = 'poker-overlay';
    ov.className = 'poker-overlay';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));

    // Tickets de référence : calculés UNE fois (la popin se re-rend à chaque rafraîchissement)
    let _refs = _pokerReferences(ticket);
    let _refsOpen = localStorage.getItem('sb-poker-refs') !== 'closed';
    let _refsPick = null;   // taille dont on choisit la référence (liste des candidats dépliée)
    // Volet « Description » à droite de la popin : rendu calculé UNE fois (la popin se re-rend toutes
    // les 3 s), ouvert / fermé EN PLACE (sans re-rendu, donc sans rejouer d'animation), état mémorisé.
    let _descOpen = (() => { try { return localStorage.getItem('sb-poker-desc') === 'open'; } catch { return false; } })();
    // `_renderCommentBody('')` rend un tiret « — » (non vide) : tester la description BRUTE, sinon le volet
    // n'affichait jamais « Pas de description ».
    const _descHtml = String(ticket.description || '').trim() ? (_renderCommentBody(ticket.description) || '') : '';
    // Sections utiles pour estimer (critères d'acceptation, règles de gestion, DoD, points d'attention)
    // épinglées en tête ; la description complète passe dessous, repliée s'il y en a.
    const _descPinned = descSections(_descHtml);
    const _descHasAccept = _descPinned.some(x => x.key === 'accept');
    const _pdClosed = new Set();   // sections repliées par l'utilisateur (survit aux re-rendus de 3 s)
    let _pdFullOpen = false;       // « Description complète » dépliée ?
    const _descParent = ticket.epic ? [...(store.get('features') || []), ...(store.get('epics') || [])].find(x => x.id === ticket.epic) : null;
    const _descMeta = [
        typeBadge(ticket.type, { size: '2xs' }),
        priorityBadge(ticket.priority, { size: '2xs' }),
        Number(ticket.points) > 0 ? `<span class="mdl-points pts-tone--${pointsTone(ticket.points).key}">${Number(ticket.points)}<small>pts</small></span>` : '<span class="poker-desc-nopts">non estimé</span>',
    ].join('');
    const _descExtra = [
        ticket.epic ? `<span class="poker-desc-parent" title="${esc(_descParent?.title || '')}">↳ <b>${esc(ticket.epic)}</b> ${esc(_descParent?.title || '')}</span>` : '',
        (ticket.labels || []).length ? `<span class="poker-desc-labels">${ticket.labels.map(l => labelChipHtml(l)).join('')}</span>` : '',
    ].filter(Boolean).join('');
    // Animations des cartes : la « distribution » ne se rejoue qu'au CHANGEMENT de phase (pas à chaque
    // rafraîchissement de 3 s) ; le « pop » ne vaut que pour le rendu qui suit un clic.
    let _dealtFor = null, _dealUntil = 0;
    let _justPicked = null;
    // Révélation animée : seulement au PASSAGE caché → révélé observé par CE navigateur (clic local
    // ou rafraîchissement) — `null` à l'ouverture, pour ne pas rejouer un tour déjà révélé.
    let _wasRevealed = null, _revealUntil = 0, _loaded = false;
    // Valeur à enregistrer choisie parmi la suite (null = consensus). Gardée ici : la popin se
    // re-rend toutes les 3 s et un choix porté par le DOM seul sauterait.
    let _savePick = null;

    // État des votes (source = serveur, rafraîchi par polling pour le live multi-utilisateurs)
    let _serverVotes = [];
    let _pollTimer = null;

    const close = () => {
        clearInterval(_pollTimer);
        if (location.hash.endsWith('/poker'))
            history.replaceState(null, '', location.hash.replace(/\/poker$/, ''));
        ov.classList.remove('visible');
        ov.addEventListener('transitionend', () => ov.remove(), { once: true });
    };

    // Rafraîchit l'état depuis le serveur puis re-render (sans casser la saisie en cours).
    const refresh = async (rerender = true) => {
        try { _serverVotes = await api.getPoker(ticket.id); _loaded = true; }
        catch { /* réseau : on garde le dernier état connu */ }
        if (rerender) render();
    };

    const render = () => {
        const myName  = localStorage.getItem('sb-poker-myname') || '';
        const votes   = _serverVotes.map(v => _adaptVote(v, myName));
        const meVote  = votes.find(v => v.me);
        const hasVoted = votes.filter(v => v.val !== null).length;
        const revealed = votes.length > 0 && votes.every(v => v.revealed);
        const numVotes = votes.filter(v => typeof v.val === 'number');
        const avg   = numVotes.length ? numVotes.reduce((s, v) => s + v.val, 0) / numVotes.length : null;
        const min   = numVotes.length ? Math.min(...numVotes.map(v => v.val)) : null;
        const max   = numVotes.length ? Math.max(...numVotes.map(v => v.val)) : null;
        const std   = numVotes.length > 1
            ? Math.sqrt(numVotes.reduce((s, v) => s + Math.pow(v.val - avg, 2), 0) / numVotes.length) : 0;
        const nearest = avg !== null
            ? POKER_FIBS.reduce((a, b) => Math.abs(b - avg) < Math.abs(a - avg) ? b : a) : null;

        // Phase : 'identity' | 'vote' | 'revealed'
        const phase = !myName ? 'identity' : revealed ? 'revealed' : 'vote';
        // Fenêtre de 700 ms : l'ouverture enchaîne deux rendus (état vide, puis 1er fetch des votes)
        // qui couperaient l'animation ; les rafraîchissements de 3 s, eux, tombent hors fenêtre.
        if (_dealtFor !== phase) { _dealtFor = phase; _dealUntil = Date.now() + 700; }
        const deal = Date.now() < _dealUntil;
        const shown = votes.filter(v => v.val !== null).length;
        // Le 1er rendu (avant tout fetch) voit 0 vote, donc « non révélé » : n'observer la transition
        // qu'une fois les votes chargés, sinon ouvrir un tour déjà révélé rejouerait l'animation.
        if (_loaded) {
            if (_wasRevealed === false && revealed) {
                _revealUntil = Date.now() + shown * 140 + 1600;
                playPokerSound('reveal', { count: shown });
            }
            _wasRevealed = revealed;
        }
        const revealAnim = revealed && Date.now() < _revealUntil;
        // Délai après lequel stats, répartition et consensus apparaissent (tous les avatars retournés).
        const revealDelay = `${shown * 140 + 250}ms`;

        // Lien de partage : doit TOUJOURS pointer vers la modale de ré-estimation poker
        // (ex. .../#health/Gabbiano/ticket/GDEM-4117/poker). On normalise en retirant un
        // éventuel /poker final puis en le rajoutant — qu'on soit déjà sur /poker ou non.
        const shareUrl = location.href.replace(/\/poker$/, '') + '/poker';
        const queue = _nextToEstimate(ticket);
        if (!revealed) _savePick = null;   // nouveau tour : on repart du consensus
        const picked = _savePick ?? nearest;

        const descScroll = ov.querySelector('.poker-desc-body')?.scrollTop || 0;
        ov.innerHTML = `
        <div class="poker-stage">
        <div class="poker-modal poker-phase--${phase}">

            <!-- Header -->
            <div class="poker-hdr">
                <div class="poker-hdr-left">
                    <span class="poker-hdr-icon">🃏</span>
                    <div>
                        <div class="poker-ticket-ref">${esc(ticket.id)}</div>
                        <div class="poker-ticket-title">${esc(ticket.title)}</div>
                    </div>
                </div>
                <div class="poker-hdr-right">
                    <button class="poker-sound-btn${pokerSoundOn() ? ' is-on' : ''}" id="poker-sound" aria-pressed="${pokerSoundOn()}"
                            title="${pokerSoundOn() ? 'Sons activés — cliquer pour couper' : 'Activer les sons (choix d\'une carte, révélation) — pratique en visio'}">${pokerSoundOn() ? '🔊' : '🔇'}</button>
                    ${queue.length ? `<button class="poker-next-btn" id="poker-next" title="Ticket suivant à estimer : ${esc(queue[0].id)} — ${esc(queue[0].title || '')}">⏭ Suivant <span class="poker-next-n">${queue.length}</span></button>` : ''}
                    <button class="poker-share-btn" id="poker-share" title="Copier le lien pour inviter des collègues">
                        <svg class="icon icon-sm"><use href="#i-copy"/></svg>
                        Partager
                    </button>
                    <button class="btn-icon" id="poker-close"><svg class="icon"><use href="#i-x"/></svg></button>
                </div>
            </div>

            <!-- Bandeau identité -->
            <div class="poker-identity-bar">
                ${myName ? `
                <div class="poker-identity-me">
                    <span class="poker-avatar" style="background:${_pokerColor(myName)}">${_initials(myName)}</span>
                    <span class="poker-identity-name">${esc(myName)}</span>
                    <button class="poker-identity-change" id="poker-change-name" title="Changer de nom">✏️</button>
                </div>` : `
                <form class="poker-identity-form" id="poker-identity-form">
                    <span class="poker-identity-prompt">Qui êtes-vous ?</span>
                    <input class="input input-sm poker-name-input" id="poker-voter-name"
                           placeholder="Votre prénom…" autocomplete="off"
                           value="${esc(myName)}" autofocus>
                    <button class="btn btn-sm btn-primary" type="submit">Rejoindre →</button>
                </form>`}
            </div>

            <!-- Corps -->
            <div class="poker-body">

                <!-- Colonne gauche : cartes -->
                <div class="poker-vote-section">
                    <div class="poker-vote-label">Votre estimation</div>
                    <div class="poker-cards${deal ? ' poker-cards--deal' : ''}">
                        ${POKER_FIB.map((v, i) => {
                            const isSelected = meVote?.val === v;
                            // Après révélation : carte inactive (un nouveau tour est nécessaire pour revoter).
                            // Sans prénom : carte CLIQUABLE qui amène au champ prénom (plus de bouton mort).
                            const disabled   = phase === 'revealed';
                            const locked     = !myName;
                            const pop        = isSelected && _justPicked === v;
                            return `<button type="button" class="poker-card${isSelected ? ' poker-card--selected' : ''}${disabled ? ' poker-card--disabled' : ''}${locked ? ' poker-card--locked' : ''}${pop ? ' poker-card--pop' : ''}"
                                        data-val="${v}" style="--i:${i}" ${disabled ? 'disabled' : ''}${locked ? ' aria-disabled="true"' : ''}
                                        title="${locked ? 'Indiquez d\'abord votre prénom pour voter' : disabled ? 'Votes révélés — « Nouveau tour » pour revoter' : `${v} SP${v === '?' ? ' — valeur inconnue' : ''}`}">
                                <span class="poker-card-val">${v}</span>
                                ${isSelected ? '<span class="poker-card-check">✓</span>' : ''}
                            </button>`;
                        }).join('')}
                    </div>

                    <!-- Compteur + actions -->
                    <div class="poker-progress-row">
                        <div class="poker-progress-bar-wrap">
                            <div class="poker-progress-bar" style="width:${votes.length ? Math.round(hasVoted / votes.length * 100) : 0}%"></div>
                        </div>
                        <span class="poker-progress-label">${hasVoted}/${votes.length} ont voté</span>
                    </div>

                    <div class="poker-actions-row">
                        <button class="btn btn-sm ${revealed ? 'btn-secondary' : 'btn-primary'}" id="poker-reveal"
                                ${votes.length === 0 ? 'disabled' : ''}
                                title="${revealed ? 'Relancer un tour' : hasVoted < votes.length ? 'Tout le monde n\'a pas voté — révéler quand même ?' : 'Révéler tous les votes'}">
                            ${revealed ? '🔄 Nouveau tour' : '👁 Révéler'}
                            ${!revealed && hasVoted > 0 && hasVoted < votes.length ? `<span class="poker-reveal-warn">⚠ ${votes.length - hasVoted} manquant${votes.length - hasVoted > 1 ? 's' : ''}</span>` : ''}
                        </button>
                        <button class="btn btn-sm btn-ghost" id="poker-reset" title="Remettre à zéro">🗑</button>
                    </div>
                </div>

                <!-- Colonne droite : participants + résultats -->
                <div class="poker-results-section">
                    <div class="poker-voters-label">
                        Participants
                        ${votes.length === 0 ? '' : `<span class="poker-voters-count">${votes.length}</span>`}
                    </div>

                    <!-- Avatars participants -->
                    <div class="poker-avatars">
                        ${votes.length === 0
                            ? `<div class="poker-empty">Personne n'a encore rejoint…</div>`
                            : votes.map((v, vi) => {
                                const hasVal = v.val !== null;
                                const color  = _pokerColor(v.name);
                                const showVal = revealed && hasVal;
                                return `<div class="poker-voter${v.me ? ' poker-voter--me' : ''}${!hasVal ? ' poker-voter--waiting' : ''}${revealAnim && showVal ? ' poker-voter--flip' : ''}" style="--i:${votes.slice(0, vi).filter(x => x.val !== null).length}">
                                    <div class="poker-voter-avatar" style="background:${color}">
                                        ${showVal
                                            ? `<span class="poker-voter-val">${v.val}</span>`
                                            : hasVal
                                                ? `<span class="poker-voter-voted">✓</span>`
                                                : `<span class="poker-voter-waiting">…</span>`}
                                    </div>
                                    <span class="poker-voter-name">${esc(v.name)}${v.me ? ' (moi)' : ''}</span>
                                    ${v.me ? `<button class="poker-vote-rm" title="Quitter">×</button>` : ''}
                                </div>`;
                            }).join('')}
                    </div>

                    <!-- Stats + distribution + consensus (après révélation) -->
                    ${revealed && numVotes.length >= 2 ? `
                    <div class="poker-stats${revealAnim ? ' poker-reveal-in' : ''}" style="--reveal-delay:${revealDelay}">
                        <div class="poker-stat">
                            <span class="poker-stat-lbl">Moy.</span>
                            <span class="poker-stat-val">${avg.toFixed(1)}</span>
                        </div>
                        <div class="poker-stat">
                            <span class="poker-stat-lbl">Min</span>
                            <span class="poker-stat-val poker-stat--low">${min}</span>
                        </div>
                        <div class="poker-stat">
                            <span class="poker-stat-lbl">Max</span>
                            <span class="poker-stat-val poker-stat--high">${max}</span>
                        </div>
                        <div class="poker-stat${std >= 4 ? ' poker-stat-block--warn' : ''}">
                            <span class="poker-stat-lbl">Écart</span>
                            <span class="poker-stat-val${std >= 4 ? ' poker-stat--warn' : ''}"
                                  title="${std >= 4 ? 'Fort désaccord — discussion recommandée !' : 'Écart-type'}">
                                ${std.toFixed(1)}${std >= 4 ? '⚠️' : ''}
                            </span>
                        </div>
                    </div>
                    <div class="poker-distrib${revealAnim ? ' poker-reveal-in' : ''}" style="--reveal-delay:${revealDelay}">
                        ${POKER_FIBS.filter(f => numVotes.some(v => v.val === f)).map(f => {
                            const count = numVotes.filter(v => v.val === f).length;
                            const pct   = Math.round(count / numVotes.length * 100);
                            const isNearest = f === nearest;
                            return `<div class="poker-distrib-row${isNearest ? ' poker-distrib-row--nearest' : ''}">
                                <span class="poker-distrib-lbl">${f}</span>
                                <div class="poker-distrib-bar-wrap">
                                    <div class="poker-distrib-bar" style="width:${pct}%"></div>
                                </div>
                                <span class="poker-distrib-n">${count}×</span>
                                ${isNearest ? '<span class="poker-distrib-star">★</span>' : ''}
                            </div>`;
                        }).join('')}
                    </div>` : revealed && numVotes.length === 1 ? `
                    <div class="poker-empty">1 seul vote numérique — attendez les autres.</div>` : ''}
                </div>
            </div>

            <!-- Footer : sauvegarde -->
            ${revealed && nearest !== null ? `
            <div class="poker-footer${revealAnim ? ' poker-reveal-in' : ''}" style="--reveal-delay:${revealDelay}">
                <!-- Valeur à enregistrer : la suite de Fibonacci SEULEMENT (plus de saisie libre « 4 » ou « 7 ») -->
                <div class="poker-save-row">
                    <div class="poker-save-head">
                        <span class="poker-save-label">Valeur à enregistrer</span>
                        <span class="poker-save-hint">★ consensus <b>${nearest}</b>${Number(ticket.points) > 0 ? ` · actuellement ${Number(ticket.points)} pts` : ' · pas encore estimé'}</span>
                    </div>
                    <div class="poker-save-pick" role="radiogroup" aria-label="Valeur à enregistrer">
                        ${POKER_FIBS.map(f => {
                            const n = numVotes.filter(v => v.val === f).length;
                            return `<button type="button" role="radio" aria-checked="${f === picked}" data-save-pts="${f}"
                                    class="poker-save-chip pts-tone--${pointsTone(f).key}${f === picked ? ' is-on' : ''}${f === nearest ? ' is-nearest' : ''}"
                                    title="${f} pts${n ? ` — ${n} vote${n > 1 ? 's' : ''}` : ''}${f === nearest ? ' · consensus' : ''}">
                                <span class="poker-save-chip-val">${f}</span>
                                <span class="poker-save-chip-n" aria-hidden="true">${'•'.repeat(Math.min(n, 5))}</span>
                                ${f === nearest ? '<span class="poker-save-chip-star" aria-hidden="true">★</span>' : ''}
                            </button>`;
                        }).join('')}
                    </div>
                    <div class="poker-save-actions">
                        <button class="btn btn-primary poker-save-btn" id="poker-save">
                            <svg class="icon icon-sm"><use href="#i-check"/></svg>
                            Enregistrer <b class="poker-save-val">${picked} pts</b>
                        </button>
                        ${queue.length ? `<button class="btn btn-secondary poker-save-next" id="poker-save-next" title="Enregistrer puis estimer ${esc(queue[0].id)}">Enregistrer &amp; suivant ⏭</button>` : ''}
                    </div>
                </div>
                ${std >= 4 ? `<div class="poker-save-warn">⚠️ Fort désaccord (σ ${std.toFixed(1)}) — pensez à en discuter d'abord.</div>` : ''}
            </div>` : ''}

            <!-- Tickets de référence : un ticket livré typique par taille, pour se caler -->
            ${_pokerRefsHtml(_refs, { open: _refsOpen, mine: typeof meVote?.val === 'number' ? meVote.val : null, nearest: revealed ? nearest : null, current: Number(ticket.points) || null, picking: _refsPick })}
        </div>

        <!-- Volet latéral « Description » : onglet vertical replié, panneau condensé déplié -->
        <aside class="poker-desc${_descOpen ? ' is-open' : ''}" aria-label="Description du ticket">
            <button type="button" class="poker-desc-tab" id="poker-desc-toggle" aria-expanded="${_descOpen}" aria-controls="poker-desc-panel"
                    title="${_descOpen ? 'Replier la description' : 'Afficher la description du ticket'}">
                <span class="poker-desc-tab-chev" aria-hidden="true">${_descOpen ? '›' : '‹'}</span>
                <span class="poker-desc-tab-lbl">📄 Description${!_descHtml ? ' · vide' : _descHasAccept ? ' · ✅' : ''}</span>
            </button>
            <div class="poker-desc-panel" id="poker-desc-panel">
                <div class="poker-desc-head">
                    <span class="poker-desc-title">📄 Description</span>
                    <span class="poker-desc-meta">${_descMeta}</span>
                    ${_descExtra ? `<div class="poker-desc-extra">${_descExtra}</div>` : ''}
                </div>
                <div class="poker-desc-body adf-body">${!_descHtml
                    ? emptyStateHtml({ icon: '📝', title: 'Pas de description', text: 'Le ticket n\'a pas de description dans JIRA — à préciser avant d\'estimer ?' })
                    : _descPinned.length
                        ? `${descSectionsHtml(_descPinned, esc, _pdClosed)}
                           <details class="pd-full"${_pdFullOpen ? ' open' : ''}><summary>📄 Description complète</summary><div class="pd-full-body">${_descHtml}</div></details>`
                        : `${!_descHasAccept ? '<p class="pd-hint">ℹ️ Aucun critère d\'acceptation repéré dans la description.</p>' : ''}${_descHtml}`}</div>
            </div>
        </aside>
        </div>`;
        const descBody = ov.querySelector('.poker-desc-body');
        if (descBody && descScroll) descBody.scrollTop = descScroll;

        // ── Listeners ───────────────────────────────────────────────────────
        ov.querySelector('#poker-close').addEventListener('click', close);
        // État replié / déplié des sections, gardé entre deux re-rendus (« toggle » ne remonte pas : capture)
        ov.querySelector('.poker-desc-body')?.addEventListener('toggle', e => {
            const d = e.target;
            if (d.matches?.('[data-pd-sec]')) { const i = Number(d.dataset.pdSec); if (d.open) _pdClosed.delete(i); else _pdClosed.add(i); }
            else if (d.matches?.('.pd-full')) _pdFullOpen = d.open;
        }, true);

        // Puces « L'essentiel » : déplier la section visée et y défiler (dans le volet seulement)
        ov.querySelector('.pd-nav')?.addEventListener('click', e => {
            const chip = e.target.closest('[data-pd-go]');
            const sec = chip && ov.querySelector(`[data-pd-sec="${chip.dataset.pdGo}"]`);
            if (!sec) return;
            sec.open = true;
            const body = ov.querySelector('.poker-desc-body');
            body.scrollTo({ top: sec.offsetTop - body.offsetTop - 8, behavior: 'smooth' });
        });
        ov.querySelector('#poker-desc-toggle')?.addEventListener('click', e => {
            _descOpen = !_descOpen;
            try { localStorage.setItem('sb-poker-desc', _descOpen ? 'open' : 'closed'); } catch { /* navigation privée */ }
            const aside = ov.querySelector('.poker-desc'), btn = e.currentTarget;
            aside.classList.toggle('is-open', _descOpen);
            btn.setAttribute('aria-expanded', String(_descOpen));
            btn.title = _descOpen ? 'Replier la description' : 'Afficher la description du ticket';
            btn.querySelector('.poker-desc-tab-chev').textContent = _descOpen ? '›' : '‹';
        });
        ov.querySelector('#poker-refs-toggle')?.addEventListener('click', () => {
            _refsOpen = !_refsOpen;
            try { localStorage.setItem('sb-poker-refs', _refsOpen ? 'open' : 'closed'); } catch { /* navigation privée */ }
            render();
        });
        // Référence d'équipe : déplier les candidats d'une taille, en choisir un, ou revenir à l'auto.
        ov.querySelector('.poker-refs-table')?.addEventListener('click', async e => {
            const pick = e.target.closest('[data-ref-pick]');
            if (pick) { const v = Number(pick.dataset.refPick); _refsPick = _refsPick === v ? null : v; render(); return; }
            const choose = e.target.closest('[data-ref-choose]'), unpin = e.target.closest('[data-ref-unpin]');
            if (!choose && !unpin) return;
            const v = Number((choose || unpin).dataset.refChoose || unpin?.dataset.refUnpin);
            try {
                const res = await api.setPokerReference(ticket.team, v, choose ? choose.dataset.refId : null);
                const pi = store.get('piInfo');
                if (pi) pi.pokerReferences = res.pokerReferences || {};
                _refs = _pokerReferences(ticket);
                _refsPick = null;
                toast(choose ? `📌 ${choose.dataset.refId} = référence ${v} pts pour ${ticket.team}` : `${v} pts : retour au choix automatique`, 'success');
                render();
            } catch (err) { toast(err.message, 'error'); }
        });
        ov.addEventListener('click', e => { if (e.target === ov) close(); });

        // Partager le lien
        ov.querySelector('#poker-share')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(shareUrl);
                const btn = ov.querySelector('#poker-share');
                btn.innerHTML = `<svg class="icon icon-sm"><use href="#i-check"/></svg> Copié !`;
                setTimeout(() => {
                    btn.innerHTML = `<svg class="icon icon-sm"><use href="#i-copy"/></svg> Partager`;
                }, 1800);
            } catch { toast('Copie impossible', 'error'); }
        });

        // Formulaire identité — purement local (on n'apparaît côté serveur qu'au 1er vote)
        ov.querySelector('#poker-identity-form')?.addEventListener('submit', e => {
            e.preventDefault();
            const name = ov.querySelector('#poker-voter-name')?.value.trim();
            if (!name) return;
            localStorage.setItem('sb-poker-myname', name);
            render();
        });

        // Sons : bascule (le clic est le geste qui autorise l'audio) + aperçu à l'activation
        ov.querySelector('#poker-sound')?.addEventListener('click', () => {
            const on = !pokerSoundOn();
            setPokerSound(on);
            if (on) playPokerSound('flip');
            render();
        });

        // Changer de nom
        ov.querySelector('#poker-change-name')?.addEventListener('click', () => {
            localStorage.removeItem('sb-poker-myname');
            render();
        });

        _justPicked = null;   // le « pop » ne vaut que pour CE rendu

        // Sélection carte → vote serveur (upsert), puis refresh. Retour visuel IMMÉDIAT (carte levée)
        // sans attendre le réseau. Sans prénom : amène au champ prénom, avec un petit coup de coude.
        ov.querySelectorAll('.poker-card:not([disabled])').forEach(card => {
            card.addEventListener('click', async () => {
                const name = localStorage.getItem('sb-poker-myname');
                if (!name) {
                    const form = ov.querySelector('#poker-identity-form');
                    form?.classList.remove('is-nudge'); void form?.offsetWidth; form?.classList.add('is-nudge');
                    ov.querySelector('#poker-voter-name')?.focus();
                    return;
                }
                ov.querySelectorAll('.poker-card--pending').forEach(c => c.classList.remove('poker-card--pending'));
                card.classList.add('poker-card--pending');
                const raw = card.dataset.val;
                _justPicked = raw === '?' ? '?' : Number(raw);
                playPokerSound('flip');
                try { await api.pokerVote(ticket.id, name, String(raw)); await refresh(); }
                catch (e) { _justPicked = null; card.classList.remove('poker-card--pending'); toast(e.message, 'error'); }
            });
        });

        // Révéler / Nouveau tour
        ov.querySelector('#poker-reveal')?.addEventListener('click', async () => {
            const allRevealed = votes.length > 0 && votes.every(v => v.revealed);
            try {
                // Nouveau tour (déjà révélé) = reset des votes ; sinon on révèle tout.
                if (allRevealed) await api.pokerReset(ticket.id);
                else await api.pokerReveal(ticket.id);
                await refresh();
            } catch (e) { toast(e.message, 'error'); }
        });

        // Reset complet
        ov.querySelector('#poker-reset')?.addEventListener('click', async () => {
            try { await api.pokerReset(ticket.id); await refresh(); }
            catch (e) { toast(e.message, 'error'); }
        });

        // Quitter : retire mon vote côté serveur + oublie mon identité locale.
        ov.querySelectorAll('.poker-vote-rm').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = localStorage.getItem('sb-poker-myname');
                localStorage.removeItem('sb-poker-myname');
                try { if (name) await api.pokerLeave(ticket.id, name); await refresh(); }
                catch (e) { toast(e.message, 'error'); render(); }
            });
        });

        // Passer à un autre ticket sans quitter le Poker : rouvre la modale du ticket puis SA popin
        // (le bouton 🃏 de la modale porte le bon `apiSave` et pose /poker dans l'URL).
        const goTo = id => {
            clearInterval(_pollTimer);
            if (location.hash.endsWith('/poker')) history.replaceState(null, '', location.hash.replace(/\/poker$/, ''));
            ov.remove();
            openTicketModal(id);
            requestAnimationFrame(() => document.getElementById('mdl-poker-btn')?.click());
        };
        ov.querySelector('#poker-next')?.addEventListener('click', () => {
            const nx = _nextToEstimate(ticket)[0];
            if (nx) goTo(nx.id);
        });

        // Sauvegarder la valeur retenue : trace du tour (historique du ticket), points, puis reset
        // de la session de vote. La trace ne bloque pas : un échec est signalé, les points passent.
        // Choix de la valeur : mise à jour EN PLACE (un re-rendu rejouerait la révélation animée)
        ov.querySelector('.poker-save-pick')?.addEventListener('click', e => {
            const chip = e.target.closest('[data-save-pts]');
            if (!chip) return;
            _savePick = Number(chip.dataset.savePts);
            ov.querySelectorAll('[data-save-pts]').forEach(c => {
                const on = c === chip;
                c.classList.toggle('is-on', on);
                c.setAttribute('aria-checked', String(on));
            });
            const lbl = ov.querySelector('.poker-save-val');
            if (lbl) lbl.textContent = `${_savePick} pts`;
        });

        const saveRound = async (goNext) => {
            const pts = _savePick ?? nearest;
            if (!POKER_FIBS.includes(pts)) return;
            const btn = ov.querySelector(goNext ? '#poker-save-next' : '#poker-save');
            ov.querySelectorAll('#poker-save, #poker-save-next').forEach(b => { b.disabled = true; });
            try {
                const cast = votes.filter(v => v.val !== null).map(v => ({ voter: v.name, value: String(v.val) }));
                await api.savePokerRound(ticket.id, { value: pts, votes: cast, author: myName, team: ticket.team || '' })
                    .catch(e => toast((e?.status === 404 || e?.status === 405)
                        ? 'Tour non archivé : le serveur tourne sur une version plus ancienne que la page — redémarrez-le (Ctrl+C puis python main.py). Les points, eux, sont enregistrés.'
                        : `Tour non archivé dans l'historique : ${e.message}`, 'warning', 9000));
                await apiSave({ points: pts });
                await api.pokerReset(ticket.id);
                btn.innerHTML = `<svg class="icon icon-sm"><use href="#i-check"/></svg> Enregistré !`;
                toast(`Story Points mis à jour : ${pts} SP`, 'success');
                const nx = goNext ? _nextToEstimate(ticket)[0] : null;
                setTimeout(() => {
                    if (nx) goTo(nx.id);
                    else { close(); openTicketModal(ticket.id); }
                }, 600);
            } catch (e) {
                toast(e.message, 'error');
                ov.querySelectorAll('#poker-save, #poker-save-next').forEach(b => { b.disabled = false; });
            }
        };
        ov.querySelector('#poker-save')?.addEventListener('click', () => saveRound(false));
        ov.querySelector('#poker-save-next')?.addEventListener('click', () => saveRound(true));
    };

    // Rendu initial immédiat (état vide) puis 1er fetch, enfin polling live (~3 s).
    render();
    refresh();
    _pollTimer = setInterval(() => {
        // Ne pas ré-écraser pendant que l'utilisateur saisit (nom ou valeur à enregistrer)
        const ae = document.activeElement;
        // Pendant une animation (distribution des cartes, révélation), PAS de re-rendu : le DOM serait
        // reconstruit et l'animation rejouée (la révélation paraissait arriver deux fois). Les données
        // sont tout de même mises à jour ; le rendu suivant, hors fenêtre, retombe sur l'état final.
        const animating = Date.now() < Math.max(_revealUntil, _dealUntil);
        if (animating || (ae && ov.contains(ae) && ae.id === 'poker-voter-name')) {
            refresh(false);   // met à jour les données sans re-render
        } else {
            refresh();
        }
    }, 3000);
}

// Arrow keys for modal navigation
document.addEventListener('keydown', e => {
    if (overlay()?.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft' && _modalIdx > 0) { e.preventDefault(); openTicketModal(_modalList[_modalIdx - 1].id); }
    if (e.key === 'ArrowRight' && _modalIdx < _modalList.length - 1) { e.preventDefault(); openTicketModal(_modalList[_modalIdx + 1].id); }
});

// ══════════════════════════════════════════════════════════════════════════════
// Contributors multi-select
// ══════════════════════════════════════════════════════════════════════════════
function contribFieldHtml(selected = []) {
    const members = getMemberNames();
    return `
        <div id="contributors-field">
            <div class="flex gap-1 flex-wrap mb-1" id="contrib-chips">
                ${selected.map(c => `<span class="chip chip-gap">${esc(c)} <button type="button" class="contrib-remove-btn" data-name="${esc(c)}">&times;</button></span>`).join('')}
            </div>
            <select class="select" id="contrib-add-select">
                <option value="">+ Contributeur</option>
                ${members.filter(m => !selected.includes(m)).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
            </select>
            <input type="hidden" name="contributors" value='${JSON.stringify(selected)}'>
        </div>
    `;
}

function wireContrib(container) {
    const field = container.querySelector('#contributors-field');
    if (!field) return;
    const getS = () => JSON.parse(field.querySelector('input[name="contributors"]').value || '[]');
    const setS = list => field.querySelector('input[name="contributors"]').value = JSON.stringify(list);

    field.addEventListener('click', e => {
        const btn = e.target.closest('.contrib-remove-btn');
        if (!btn) return;
        e.preventDefault();
        setS(getS().filter(c => c !== btn.dataset.name));
        btn.closest('.chip')?.remove();
        const sel = field.querySelector('#contrib-add-select');
        const opt = document.createElement('option'); opt.value = btn.dataset.name; opt.textContent = btn.dataset.name;
        sel.appendChild(opt);
    });

    field.querySelector('#contrib-add-select')?.addEventListener('change', e => {
        const name = e.target.value; if (!name) return;
        const s = getS(); if (!s.includes(name)) { s.push(name); setS(s);
            const chip = document.createElement('span'); chip.className = 'chip chip-gap';
            chip.innerHTML = `${esc(name)} <button type="button" class="contrib-remove-btn" data-name="${esc(name)}">&times;</button>`;
            field.querySelector('#contrib-chips').appendChild(chip);
        }
        e.target.querySelector(`option[value="${CSS.escape(name)}"]`)?.remove();
        e.target.value = '';
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Create Ticket
// ══════════════════════════════════════════════════════════════════════════════

const PRIORITY_CFG = [
    { val:'low',      label:'↓ Faible'   },
    { val:'medium',   label:'○ Moyen'    },
    { val:'high',     label:'↑ Élevé'    },
    { val:'critical', label:'⚡ Critique' },
];
const PRESET_LABELS = ['tech-debt','retro','postmortem','cop','adapt','support','skill-up','urgent'];

function _chipSelGroup(name, items, defaultVal, extra = '', multi = false) {
    const itemRole = multi ? 'checkbox' : 'radio';
    const chips = items.map(({ val, label, cls }) => {
        const active = val === defaultVal;
        return `<button type="button" role="${itemRole}" aria-checked="${active}" class="chip-sel ${cls || `chip-sel--${val}`}${active ? ' is-active' : ''}" data-val="${val}">${label}</button>`;
    }).join('');
    const groupRole = multi ? 'group' : 'radiogroup';
    return `<div class="chip-sel-group" role="${groupRole}" data-name="${name}">${chips}</div><input type="hidden" name="${name}" value="${defaultVal}">${extra}`;
}

function _wireChipGroup(container, name, single = true, onChange) {
    const group  = container.querySelector(`.chip-sel-group[data-name="${name}"]`);
    const hidden = container.querySelector(`input[name="${name}"]`);
    if (!group) return;
    group.querySelectorAll('.chip-sel').forEach(chip => {
        chip.addEventListener('click', () => {
            if (single) {
                group.querySelectorAll('.chip-sel').forEach(c => { c.classList.remove('is-active'); c.setAttribute('aria-checked', 'false'); });
                chip.classList.add('is-active');
            } else {
                chip.classList.toggle('is-active');
            }
            chip.setAttribute('aria-checked', chip.classList.contains('is-active'));
            if (hidden && single) hidden.value = chip.dataset.val;
            if (onChange) onChange(chip.dataset.val, chip.classList.contains('is-active'));
        });
    });
}

/**
 * Ouvre un picker inline dans un conteneur de champ de formulaire (création).
 * Réutilise les pickers de l'édition (avatars, autocomplete, couleurs d'équipe)
 * mais SANS sauvegarde API : la valeur est tenue dans un input caché jusqu'au submit.
 *
 * @param trigger  élément cliquable affichant la valeur courante (.form-picker-trigger)
 * @param hidden   input[type=hidden] mis à jour à la sélection
 * @param makePicker (current, onCommit, onCancel) → { wrap, input } | wrap
 * @param renderDisplay (value) → HTML affiché dans le trigger
 * @param onChange  callback optionnel (value) après commit
 */
function _wireFormPicker(trigger, hidden, makePicker, renderDisplay, onChange) {
    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
    });
    trigger.addEventListener('click', () => {
        if (trigger.querySelector('.person-picker, .epic-picker, .chip-picker')) return;
        const orig = trigger.innerHTML;
        const restore = () => { trigger.innerHTML = orig; };
        const onCommit = (val) => {
            cleanup();
            hidden.value = val == null ? '' : val;
            trigger.innerHTML = renderDisplay(hidden.value);
            if (onChange) onChange(hidden.value);
        };
        const onCancel = () => { cleanup(); restore(); };
        const built = makePicker(hidden.value, onCommit, onCancel);
        const wrap  = built.wrap || built;
        const input = built.input;
        trigger.innerHTML = '';
        trigger.appendChild(wrap);
        if (input) requestAnimationFrame(() => input.focus());
        const onDocClick = (ev) => { if (!wrap.contains(ev.target)) onCancel(); };
        const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    });
}

export function openCreateModal(defaults = {}) {
    const epics   = store.get('epics') || [];
    // Source des équipes avec couleur : teamObjects si dispo, sinon noms bruts (fallback)
    let teamObjs = store.get('teamObjects') || [];
    if (!teamObjs.length) {
        teamObjs = (store.get('teams') || []).map(t => (typeof t === 'string' ? { name: t } : t));
    }
    const defaultType   = defaults.type   || 'story';
    const defaultStatus = defaults.status || 'todo';
    const defaultTeam   = defaults.team   || '';

    // Options d'équipe avec pastille de couleur (comme l'édition)
    const teamOptions = [
        { value: '', label: '— Aucune' },
        ...teamObjs.map(t => ({ value: t.name, label: t.name, dot: t.color })),
    ];
    const _teamColor = (name) => teamObjs.find(t => t.name === name)?.color || 'var(--text-muted)';
    // Rendus d'affichage des triggers
    const teamDisplay = (val) => val
        ? `<span class="inline-flex-center"><span class="form-picker-dot" style="background:${esc(_teamColor(val))}"></span><span>${esc(val)}</span></span>`
        : `<span class="text-muted">— Choisir une équipe</span>`;
    const personDisplay = (val) => val
        ? personChip(val, 'leader')
        : `<span class="text-muted">Non assigné</span>`;
    const epicDisplay = (val) => {
        if (!val) return `<span class="text-muted">Aucun</span>`;
        const e = epics.find(x => x.id === val);
        return `<span class="inline-flex-center"><span class="epic-picker-key">${esc(val)}</span> <span>${esc(e?.title || '')}</span></span>`;
    };

    const typeItems     = Object.entries(TYPE_LABELS).map(([val, label]) => ({ val, label: `${TYPE_ICONS[val] || ''} ${label}` }));
    const priorityItems = PRIORITY_CFG.map(p => ({ val: p.val, label: p.label }));
    const pointsItems   = [0,1,2,3,5,8,13,21].map(p => ({ val: String(p), label: p === 0 ? '–' : String(p), cls: 'chip-sel chip-sel--pts' }));
    const statusItems   = STATUS_ORDER.map(s => ({ val: s, label: STATUS_LABELS[s] }));

    titleEl().textContent = 'Nouveau ticket';
    bodyEl().innerHTML = `
        <form id="create-form" autocomplete="off">

            <div class="form-group" style="margin-bottom:var(--sp-3)">
                <input class="input" name="title" required placeholder="Intitulé du ticket…" autofocus
                       style="font-size:var(--fs-md);font-weight:var(--fw-medium);padding:10px 14px">
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Type</div>
                ${_chipSelGroup('type', typeItems, defaultType)}
            </div>

            <div class="form-row" style="gap:var(--sp-3);margin-bottom:var(--sp-3)">
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Priorité</div>
                    ${_chipSelGroup('priority', priorityItems, 'medium')}
                </div>
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Points (SP)</div>
                    ${_chipSelGroup('points', pointsItems, '0')}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Statut</div>
                ${_chipSelGroup('status', statusItems, defaultStatus)}
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Assignation</div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="label">Équipe</label>
                        <div class="form-picker-trigger" id="cs-team-trigger" tabindex="0" role="button">${teamDisplay(defaultTeam)}</div>
                        <input type="hidden" name="team" value="${esc(defaultTeam)}">
                    </div>
                    <div class="form-group">
                        <label class="label">Leader</label>
                        <div class="form-picker-trigger" id="cs-leader-trigger" tabindex="0" role="button">${personDisplay('')}</div>
                        <input type="hidden" name="leader" value="">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Contributors</label>
                    <div class="contrib-inline-wrap" id="cs-contrib-wrap">
                        <button type="button" class="btn btn-sm btn-secondary" id="cs-contrib-add-btn">+ Ajouter</button>
                    </div>
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Liens</div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Epic</label>
                    <div class="form-picker-trigger" id="cs-epic-trigger" tabindex="0" role="button">${epicDisplay('')}</div>
                    <input type="hidden" name="epic" value="">
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Labels</div>
                <div class="labels-inline-wrap" id="cs-labels-wrap"></div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Description</div>
                <div style="margin:0"><textarea class="input" name="description" rows="3" placeholder="Description optionnelle…"></textarea></div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="btn-cancel-create">Annuler</button>
                <button type="submit" class="btn btn-primary">Créer le ticket</button>
            </div>
        </form>
    `;

    // Wire radio chip groups
    ['type','priority','points','status'].forEach(name => _wireChipGroup(bodyEl(), name, true));

    const body       = bodyEl();
    const teamHidden = body.querySelector('input[name="team"]');
    const leadHidden = body.querySelector('input[name="leader"]');

    // ── Équipe : chip-picker avec pastilles de couleur ──────────────────────────
    _wireFormPicker(
        body.querySelector('#cs-team-trigger'),
        teamHidden,
        (current, onCommit) => _makeChipPicker(teamOptions, current, onCommit),
        teamDisplay
    );

    // ── Leader : person-picker (avatars) — même source que l'édition ────────────
    _wireFormPicker(
        body.querySelector('#cs-leader-trigger'),
        leadHidden,
        (current, onCommit, onCancel) => _makePersonPicker(getMemberNames(), current, onCommit, onCancel),
        personDisplay
    );

    // ── Epic : autocomplete (récents + tri alpha) ───────────────────────────────
    _wireFormPicker(
        body.querySelector('#cs-epic-trigger'),
        body.querySelector('input[name="epic"]'),
        (current, onCommit, onCancel) => _makeEpicPicker(epics, current, (id) => { if (id) _pushRecentEpic(id); onCommit(id); }, onCancel),
        epicDisplay
    );

    // ── Contributors : person-picker enchaîné (avatars), comme l'édition ────────
    const contribWrap = body.querySelector('#cs-contrib-wrap');
    const addBtn = body.querySelector('#cs-contrib-add-btn');
    const getContribs = () => Array.from(contribWrap.querySelectorAll('.contrib-rm')).map(b => b.dataset.name);
    contribWrap.addEventListener('click', e => {
        const rm = e.target.closest('.contrib-rm'); if (!rm) return;
        rm.closest('.chip')?.remove();
    });
    const _openContribPicker = () => {
        if (contribWrap.querySelector('.person-picker')) return;
        const current = getContribs();
        const allNames = getMemberNames().filter(m => !current.includes(m) && m !== leadHidden.value);
        if (!allNames.length) return;
        const onCommit = (name) => {
            cleanup();
            if (!name) return;
            const chip = document.createElement('span');
            chip.className = 'chip chip-gap';
            chip.innerHTML = `${avatar(name, false, 18)} ${esc(name)} <button type="button" class="contrib-rm" data-name="${esc(name)}" title="Retirer">×</button>`;
            contribWrap.insertBefore(chip, addBtn);
            requestAnimationFrame(_openContribPicker);  // enchaîne
        };
        const onCancel = () => { cleanup(); pickerWrap.remove(); };
        const { wrap: pickerWrap, input } = _makePersonPicker(allNames, '', onCommit, onCancel);
        pickerWrap.classList.add('person-picker--no-clear');
        contribWrap.insertBefore(pickerWrap, addBtn);
        requestAnimationFrame(() => input.focus());
        const onDocClick = (ev) => { if (!pickerWrap.contains(ev.target) && ev.target !== addBtn) onCancel(); };
        const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    };
    addBtn.addEventListener('click', _openContribPicker);

    // ── Labels : autocomplete (suggestions du store + frappe libre) ─────────────
    const labelsWrap = body.querySelector('#cs-labels-wrap');
    const getLabels = () => Array.from(labelsWrap.querySelectorAll('.label-rm')).map(b => b.dataset.label);
    labelsWrap.addEventListener('click', e => {
        const rm = e.target.closest('.label-rm'); if (!rm) return;
        rm.closest('.chip')?.remove();
    });
    const { wrap: labelPickerWrap } = _makeLabelPicker(
        getLabels(),
        (val) => {
            if (!val || getLabels().includes(val)) return;
            labelsWrap.insertBefore(_labelChipEl(val), labelPickerWrap);
        },
        () => {}
    );
    labelsWrap.appendChild(labelPickerWrap);

    body.querySelector('#btn-cancel-create')?.addEventListener('click', closeModal);

    body.querySelector('#create-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            title:        fd.get('title'),
            type:         fd.get('type'),
            status:       fd.get('status'),
            team:         fd.get('team'),
            leader:       fd.get('leader') || null,
            contributors: getContribs(),
            points:       parseInt(fd.get('points')) || 0,
            priority:     fd.get('priority'),
            epic:         fd.get('epic') || null,
            labels:       getLabels(),
            description:  fd.get('description'),
        };
        try {
            const fn = data.type === 'feature' ? api.createFeature : data.type === 'epic' ? api.createEpic : api.createTicket;
            await fn(data); await refreshData(); closeModal();
            toast('Créé', 'success'); window.__squadBoard.rerenderView?.();
        } catch (err) { toast(err.message, 'error'); }
    });
    showModal();
}

// ══════════════════════════════════════════════════════════════════════════════
// Edit Ticket
// ══════════════════════════════════════════════════════════════════════════════
export function openEditModal(ticket) {
    const teams        = store.get('teams') || [];
    const members      = store.get('members') || [];
    const epics        = store.get('epics') || [];
    const leader       = ticket.leader || ticket.assignee || '';
    const contributors = (ticket.contributors || []).filter(c => c && c !== leader);
    const ticketLabels = new Set(ticket.labels || []);

    const teamNames    = teams.map(t => (typeof t === 'string' ? t : t.name));
    const memberNames  = getMemberNames();

    const typeItems     = Object.entries(TYPE_LABELS).map(([val, label]) => ({ val, label: `${TYPE_ICONS[val] || ''} ${label}` }));
    const priorityItems = PRIORITY_CFG.map(p => ({ val: p.val, label: p.label }));
    const pointsItems   = [0,1,2,3,5,8,13,21].map(p => ({ val: String(p), label: p === 0 ? '–' : String(p), cls: 'chip-sel chip-sel--pts' }));
    const statusItems   = STATUS_ORDER.map(s => ({ val: s, label: STATUS_LABELS[s] }));

    // Build label chips (preset ∪ current ticket labels)
    const allLabelVals  = [...new Set([...PRESET_LABELS, ...ticketLabels])];
    const labelChipsHtml = allLabelVals.map(l =>
        `<button type="button" class="chip-sel chip-sel--label${ticketLabels.has(l) ? ' is-active' : ''}" data-val="${l}">${l}</button>`
    ).join('');

    titleEl().textContent = `Modifier ${ticket.id}`;
    bodyEl().innerHTML = `
        <form id="edit-form" autocomplete="off">

            <div class="form-group" style="margin-bottom:var(--sp-3)">
                <input class="input" name="title" required value="${esc(ticket.title)}" autofocus
                       style="font-size:var(--fs-md);font-weight:var(--fw-medium);padding:10px 14px">
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Type</div>
                ${_chipSelGroup('type', typeItems, ticket.type || 'story')}
            </div>

            <div class="form-row" style="gap:var(--sp-3);margin-bottom:var(--sp-3)">
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Priorité</div>
                    ${_chipSelGroup('priority', priorityItems, ticket.priority || 'medium')}
                </div>
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Points (SP)</div>
                    ${_chipSelGroup('points', pointsItems, String(ticket.points || 0))}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Statut</div>
                ${_chipSelGroup('status', statusItems, ticket.flagged ? 'blocked' : (ticket.status || 'todo'))}
                <label class="edit-checkbox-label" style="margin-top:var(--sp-2)">
                    <input type="checkbox" name="flagged" ${ticket.flagged?'checked':''}> 🚫 Marquer comme impédiment (bloqué)
                </label>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Assignation</div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="label">Équipe</label>
                        <select class="select w-full" name="team">
                            <option value="">—</option>
                            ${teamNames.map(t => `<option value="${esc(t)}"${t===ticket.team?' selected':''}>${esc(t)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="label">Leader</label>
                        <select class="select w-full" name="leader">
                            <option value="">Non assigné</option>
                            ${memberNames.map(m => `<option value="${esc(m)}"${m===leader?' selected':''}>${esc(m)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Contributors</label>
                    ${contribFieldHtml(contributors)}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Liens</div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Epic</label>
                    <select class="select w-full" name="epic">
                        <option value="">Aucun</option>
                        ${epics.map(e => `<option value="${esc(e.id)}"${e.id===ticket.epic?' selected':''}>${esc(e.id)} — ${esc(e.title)}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Labels</div>
                <div class="chip-sel-group" data-name="_labels_ui">${labelChipsHtml}</div>
                <div style="margin-top:var(--sp-2);display:flex;gap:var(--sp-2);align-items:center">
                    <input class="input" id="es-label-input" placeholder="+ Label personnalisé…" style="font-size:var(--fs-xs);flex:1">
                    <span class="text-xs text-muted">↵ pour ajouter</span>
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Description</div>
                <div style="margin:0"><textarea class="input" name="description" rows="4" placeholder="Description du ticket...">${esc(ticket.description||'')}</textarea></div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Annuler</button>
                <button type="submit" class="btn btn-primary">Enregistrer</button>
            </div>
        </form>
    `;

    // Wire radio chip groups
    ['type','priority','points','status'].forEach(name => _wireChipGroup(bodyEl(), name, true));

    // Wire label chips (multi-select)
    _wireChipGroup(bodyEl(), '_labels_ui', false);

    // Custom label input
    const labelGroup = bodyEl().querySelector('.chip-sel-group[data-name="_labels_ui"]');
    bodyEl().querySelector('#es-label-input')?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const raw = e.target.value.trim().replace(/\s+/g, '-').toLowerCase();
        if (!raw) return;
        const existing = labelGroup?.querySelector(`.chip-sel[data-val="${CSS.escape(raw)}"]`);
        if (existing) { existing.classList.add('is-active'); }
        else if (labelGroup) {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'chip-sel chip-sel--label is-active'; btn.dataset.val = raw; btn.textContent = raw;
            btn.setAttribute('role', 'checkbox'); btn.setAttribute('aria-checked', 'true');
            btn.addEventListener('click', () => { const on = btn.classList.toggle('is-active'); btn.setAttribute('aria-checked', on); });
            labelGroup.appendChild(btn);
        }
        e.target.value = '';
    });

    wireContrib(bodyEl());
    bodyEl().querySelector('#btn-cancel-edit')?.addEventListener('click', closeModal);

    bodyEl().querySelector('#edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const selectedLabels = [...(labelGroup?.querySelectorAll('.chip-sel.is-active') || [])].map(c => c.dataset.val);
        const data = {
            title:        fd.get('title'),
            type:         fd.get('type'),
            status:       fd.get('status'),
            team:         fd.get('team'),
            leader:       fd.get('leader') || null,
            contributors: JSON.parse(fd.get('contributors') || '[]'),
            points:       parseInt(fd.get('points')) || 0,
            priority:     fd.get('priority'),
            epic:         fd.get('epic') || null,
            labels:       selectedLabels,
            flagged:      !!fd.get('flagged'),
            description:  fd.get('description'),
        };
        try {
            const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
            await fn(ticket.id, data); await refreshData(); closeModal();
            toast('Mis à jour', 'success'); window.__squadBoard.rerenderView?.();
        } catch (err) { toast(err.message, 'error'); }
    });
    showModal();
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refreshData() {
    try {
        const [tickets, features, epics, members, teams] = await Promise.all([
            api.getTickets(), api.getFeatures(), api.getEpics(), api.getMembers(), api.getTeams(),
        ]);
        store.set('tickets', tickets); store.set('features', features); store.set('epics', epics);
        store.set('members', members);
        store.set('teams', teams.map(t => typeof t === 'string' ? t : t.name));
        store.set('teamObjects', teams);
    } catch { /* silent */ }
}

// ── Sidebar "Tickets enfants" pour les features ─────────────────────────────
// Affichée à droite de la modal quand on ouvre une feature. Liste :
//   1. Les epics enfants (epic.feature === feature.id)
//   2. Les tickets passant par ces epics (ticket.epic === epic.id)
//   3. Les tickets directement reliés à la feature (ticket.epic === feature.id)
//      — cas réel cf. roadmap.js:147, certains projets sautent l'epic intermédiaire.
// Toggle via bouton dans le titlebar — état persisté en localStorage.
function _renderChildrenSidebar(feature) {
    // Nettoyage des éléments précédents (cas re-render via comment add, status change, etc.)
    document.getElementById('mdl-children-side')?.remove();
    document.getElementById('mdl-children-toggle')?.remove();
    document.getElementById('modal')?.classList.remove('has-children-sidebar');

    if (feature.type !== 'feature') return;

    const allTickets = store.get('tickets') || [];
    const allEpics = store.get('epics') || [];
    const childEpics = allEpics.filter(e => e.feature === feature.id);
    const childEpicIds = new Set(childEpics.map(e => e.id));
    const ticketsViaEpic = allTickets.filter(t => t.epic && childEpicIds.has(t.epic));
    const ticketsDirect = allTickets.filter(t => t.epic === feature.id);
    // Dédup (un ticket pourrait théoriquement matcher les 2 listes)
    const seen = new Set(ticketsViaEpic.map(t => t.id));
    const childTickets = [...ticketsViaEpic, ...ticketsDirect.filter(t => !seen.has(t.id))];
    const total = childEpics.length + childTickets.length;
    // Sur une feature, on affiche TOUJOURS le bouton/sidebar même si 0 enfant —
    // permet à l'utilisateur de confirmer qu'il n'y a rien (au lieu de chercher).
    console.info(`[ChildrenSidebar] Feature ${feature.id} : ${childEpics.length} epic(s) + ${childTickets.length} ticket(s) (via epic: ${ticketsViaEpic.length}, direct: ${ticketsDirect.length})`);

    // Toggle button injecté dans le titre (avant le bouton next)
    const titleH2 = document.getElementById('modal-title');
    const nextBtn = document.getElementById('mdl-next');
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'mdl-children-toggle';
    toggleBtn.className = 'mdl-nav-btn mdl-children-toggle';
    toggleBtn.title = `Tickets enfants (${total}) — cliquer pour afficher/masquer`;
    toggleBtn.innerHTML = `🌿<span class="mdl-children-toggle-count">${total}</span>`;
    // #mdl-next vit dans .mdl-nav-group (barre de titre en deux lignes) : insertBefore(…, nextBtn) sur le
    // titre lèverait NotFoundError — le bouton va dans la grappe de droite de la ligne de repères.
    const topBar = titleH2.querySelector('.mdl-titlebar-top');
    const spacer = topBar?.querySelector('.mdl-titlebar-spacer');
    if (spacer) spacer.after(toggleBtn);
    else if (nextBtn) nextBtn.after(toggleBtn);
    else titleH2.appendChild(toggleBtn);

    // Sidebar (sibling de #modal pour déborder sur la droite)
    const modalEl = document.getElementById('modal');
    const side = document.createElement('aside');
    side.id = 'mdl-children-side';
    side.className = 'mdl-children-side';
    const _row = (t, type) => `
        <div class="mdl-cs-row" data-ticket-id="${esc(t.id)}" title="${esc(t.title || '')}">
            <span class="badge badge-${esc(type)} badge-2xs">${esc(type)}</span>
            <span class="mdl-cs-id">${esc(t.id)}</span>
            <span class="mdl-cs-title truncate">${esc(t.title || '(sans titre)')}</span>
            ${statusBadge(t, { size: '2xs', label: STATUS_LABELS[t.status] || t.status })}
            <span class="mdl-cs-pts">${t.points ? t.points : '—'}</span>
        </div>`;
    side.innerHTML = `
        <div class="mdl-cs-hdr">
            <span class="mdl-cs-hdr-title">🌿 Enfants <small>(${total})</small></span>
            <button class="mdl-nav-btn" id="mdl-cs-close" title="Masquer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <div class="mdl-cs-body">
            ${total === 0 ? `
                <div class="mdl-cs-empty">
                    <p>Aucun enfant rattaché à cette feature.</p>
                    <p class="text-xs text-muted">Vérifié : <code>epic.feature === ${esc(feature.id)}</code> et <code>ticket.epic === ${esc(feature.id)}</code>.</p>
                </div>` : ''}
            ${childEpics.length ? `
                <div class="mdl-cs-sec-label">Epics (${childEpics.length})</div>
                ${childEpics.map(e => _row(e, 'epic')).join('')}` : ''}
            ${childTickets.length ? `
                <div class="mdl-cs-sec-label">Tickets (${childTickets.length})</div>
                ${childTickets.map(t => _row(t, t.type || 'task')).join('')}` : ''}
        </div>`;
    modalEl.appendChild(side);
    modalEl.classList.add('has-children-sidebar');

    // État ouvert/fermé persisté
    const KEY = 'sb-mdl-children-visible';
    let visible = localStorage.getItem(KEY) !== 'false';
    const apply = () => {
        side.classList.toggle('is-visible', visible);
        toggleBtn.classList.toggle('is-active', visible);
        localStorage.setItem(KEY, visible ? 'true' : 'false');
    };
    apply();

    toggleBtn.addEventListener('click', () => { visible = !visible; apply(); });
    side.querySelector('#mdl-cs-close')?.addEventListener('click', () => { visible = false; apply(); });
    const _wireRows = (root) => root.querySelectorAll('.mdl-cs-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.ticketId;
            const jiraOnly = row.dataset.jiraOnly === '1';
            if (!id) return;
            if (jiraOnly) {
                // Ticket non importé en base — ouvre dans JIRA externe (sinon ouverture modale vide)
                const base = store.get('jiraUrl');
                if (base) window.open(`${base}/browse/${id}`, '_blank', 'noopener');
            } else {
                openTicketModal(id);
            }
        });
    });
    _wireRows(side);

    // Lazy-fetch JIRA : récupère les enfants directs (parent + Epic Link) et ajoute
    // ceux qui ne sont pas en base locale. Permet de voir un cas réel comme GCOM-2457
    // dont les enfants sont en JIRA mais hors périmètre de sync (status=done historique).
    _fetchJiraChildren(feature.id).then(remote => {
        if (!remote || !remote.length) return;
        const localIds = new Set([
            ...childEpics.map(e => e.id),
            ...childTickets.map(t => t.id),
        ]);
        const remoteOnly = remote.filter(t => !localIds.has(t.id));
        if (!remoteOnly.length) return;

        // Append nouvelle section dans le body
        const body = side.querySelector('.mdl-cs-body');
        if (!body) return;
        // Retire le message "Aucun enfant" si présent (on a maintenant du contenu)
        body.querySelector('.mdl-cs-empty')?.remove();
        const sec = document.createElement('div');
        sec.innerHTML = `
            <div class="mdl-cs-sec-label">📡 Présents dans JIRA, non en base (${remoteOnly.length})</div>
            ${remoteOnly.map(t => `
                <div class="mdl-cs-row mdl-cs-row--jira" data-ticket-id="${esc(t.id)}" data-jira-only="1" title="${esc(t.title || '')} — clic pour ouvrir dans JIRA">
                    <span class="badge badge-${esc((t.type || 'task').toLowerCase())} badge-2xs">${esc((t.type || 'task').toLowerCase())}</span>
                    <span class="mdl-cs-id">${esc(t.id)}</span>
                    <span class="mdl-cs-title truncate">${esc(t.title || '(sans titre)')}</span>
                    <span class="badge badge-jira-only badge-2xs" title="Ticket non importé en base locale">JIRA</span>
                </div>
            `).join('')}
        `;
        body.appendChild(sec);
        _wireRows(sec);

        // Mets à jour le compteur du bouton toggle
        const newTotal = total + remoteOnly.length;
        const countSpan = toggleBtn.querySelector('.mdl-children-toggle-count');
        if (countSpan) countSpan.textContent = newTotal;
        toggleBtn.title = `Tickets enfants (${newTotal}, dont ${remoteOnly.length} hors base) — cliquer pour afficher/masquer`;
        // Mets à jour le compteur dans le header de la sidebar
        const hdrTitle = side.querySelector('.mdl-cs-hdr-title');
        if (hdrTitle) hdrTitle.innerHTML = `🌿 Enfants <small>(${newTotal})</small>`;
        console.info(`[ChildrenSidebar] Feature ${feature.id} : +${remoteOnly.length} ticket(s) récupérés depuis JIRA (non en base locale)`);
    });
}

// Fetch direct via le proxy JIRA local — enfants d'une feature (Feature parent ou Epic Link).
// Renvoie une liste simplifiée { id, title, type, status }. Silencieux si proxy KO.
async function _fetchJiraChildren(featureId) {
    if (!featureId) return [];
    try {
        const res = await fetch('/jira/rest/api/3/search/jql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jql: `parent = ${featureId} OR "Epic Link" = ${featureId}`,
                fields: ['summary', 'issuetype', 'status'],
                maxResults: 100,
            }),
        });
        if (!res.ok) return [];
        const j = await res.json();
        return (j.issues || []).map(i => ({
            id: i.key,
            title: i.fields?.summary || '',
            type: i.fields?.issuetype?.name || 'task',
            status: i.fields?.status?.name || '',
        }));
    } catch { return []; }
}
