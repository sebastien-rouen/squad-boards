/**
 * Alert action modal — au clic sur une alerte proactive du panel aside,
 * ouvre un tableau éditable des tickets concernés.
 *
 * Permet d'éditer en batch : assigné·e + story points (les deux champs les plus
 * souvent en cause dans les alertes proactives). Sauvegarde via api.updateTicket.
 *
 * Le hash de l'URL est mis à jour avec `/alert/<id>` pour permettre back/forward
 * et le partage de l'état.
 */

import { store } from '../state.js';
import { esc, sumBy, toast, deriveMembersFromAbsences, getStatusLabel } from '../utils.js';
import { STATUS_LABELS, STATUS_ORDER } from '../config.js';
import * as api from '../api.js';
import { ANOMALY_BY_KEY } from '../business_rules.js';

/**
 * Ouvre la modal pour une alerte donnée. Met à jour le hash de l'URL.
 *
 * @param {string} actionable    Identifiant (cf. _ACTIONABLES)
 * @param {object} opts          { updateHash: bool (defaut true) }
 */
export function openAlertModal(actionable, opts = {}) {
    const meta = ANOMALY_BY_KEY[actionable];
    if (!meta) return;
    _closeAlertModal();

    const team = store.get('team');
    const teamFilter = team && team !== 'all';
    const allTickets = store.get('tickets') || [];
    const sprintInfo = store.get('sprintInfo');
    const sprintStartMs = sprintInfo?.startDate
        ? new Date(String(sprintInfo.startDate).slice(0, 10)).getTime() : 0;
    const ctx = { sprintStartMs };
    const tickets = allTickets
        .filter(t => !teamFilter || t.team === team)
        .filter(t => meta.match(t, ctx));

    const overlay = document.createElement('div');
    overlay.id = 'alert-modal-overlay';
    overlay.className = 'modal-overlay alert-modal-overlay';
    overlay.innerHTML = _renderModalHtml(actionable, meta, tickets);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // État local des modifications (id → {field: newValue})
    const dirty = new Map();
    _bindModalEvents(overlay, actionable, tickets, dirty);

    // Hash routing
    if (opts.updateHash !== false) _setAlertInHash(actionable);
}

function _closeAlertModal() {
    const ov = document.getElementById('alert-modal-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    ov.addEventListener('transitionend', () => ov.remove(), { once: true });
    _clearAlertFromHash();
}

// ── Hash routing ─────────────────────────────────────────────────────────────
// Format : on AJOUTE `/alert/<id>` à la fin du hash existant ; au close on le retire.
// Coordonné avec app.js qui parse `/alert/<id>` au load.
function _setAlertInHash(actionable) {
    const cur = location.hash.replace(/^#/, '');
    if (cur.includes('/alert/')) return; // déjà présent
    const newHash = '#' + cur + (cur ? '/' : '') + 'alert/' + encodeURIComponent(actionable);
    if (location.hash !== newHash) history.pushState(null, '', newHash);
}
function _clearAlertFromHash() {
    const cur = location.hash.replace(/^#/, '');
    if (!cur.includes('/alert/')) return;
    const cleaned = cur.replace(/\/?alert\/[^/]+$/, '');
    history.replaceState(null, '', '#' + cleaned);
}

// ── HTML ─────────────────────────────────────────────────────────────────────
function _renderModalHtml(actionable, meta, tickets) {
    const teamLabel = store.get('team');
    const teamChip = teamLabel && teamLabel !== 'all'
        ? `<span class="alert-modal-chip">👥 ${esc(teamLabel)}</span>` : '';
    return `
        <div class="modal alert-modal" role="dialog" aria-labelledby="alert-modal-title">
            <div class="modal-header alert-modal-header">
                <h2 id="alert-modal-title">
                    <span class="alert-modal-icon">${meta.icon}</span>
                    <span class="truncate">${esc(meta.title)}</span>
                    <span class="alert-modal-count">${tickets.length}</span>
                </h2>
                <div class="alert-modal-actions">
                    <button class="btn btn-primary btn-sm" id="alert-modal-save" disabled title="Aucune modification">
                        Enregistrer <span class="alert-modal-dirty">0</span>
                    </button>
                    <button class="mdl-nav-btn" id="alert-modal-close" title="Fermer (Esc)">
                        <svg><use href="#i-x"/></svg>
                    </button>
                </div>
            </div>
            <div class="alert-modal-meta">
                ${teamChip}
                <span class="alert-modal-intro">${esc(meta.intro)}</span>
            </div>
            <div class="modal-body alert-modal-body">
                ${tickets.length === 0 ? `
                    <div class="alert-modal-empty">
                        <span class="alert-modal-empty-icon">✅</span>
                        <p>Plus aucun ticket ne correspond à cette alerte !</p>
                    </div>
                ` : _renderTableHtml(tickets)}
            </div>
        </div>`;
}

function _renderTableHtml(tickets) {
    // Plus de datalist HTML5 — autocomplete custom JS plus riche (cf. _bindLeaderAutocomplete)
    return `
        <table class="alert-modal-table">
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Ticket</th>
                    <th>Statut</th>
                    <th class="alert-edit-col">Assigné·e</th>
                    <th class="alert-edit-col" style="width:90px">Points</th>
                </tr>
            </thead>
            <tbody>
                ${tickets.map(t => _renderRowHtml(t)).join('')}
            </tbody>
        </table>`;
}

function _renderRowHtml(t) {
    const typeIcon = _typeIcon(t.type);
    const leader = t.leader || t.assignee || '';
    const points = t.points || '';
    const statusLbl = getStatusLabel(t);
    return `
        <tr class="alert-row" data-id="${esc(t.id)}">
            <td class="alert-cell-type" title="${esc(t.type || 'task')}">${typeIcon}</td>
            <td class="alert-cell-ticket">
                <a class="alert-ticket-key" data-open-ticket="${esc(t.id)}" title="Ouvrir le détail">${esc(t.id)}</a>
                <span class="alert-ticket-title">${esc(t.title || '(sans titre)')}</span>
            </td>
            <td>
                <span class="badge badge-${t.status} badge-status badge-2xs">${esc(statusLbl)}</span>
            </td>
            <td class="alert-edit-col">
                <div class="alert-leader-ac">
                    <input type="text" class="alert-input alert-input--leader"
                           data-id="${esc(t.id)}" data-field="leader"
                           value="${esc(leader)}" placeholder="—" autocomplete="off" />
                </div>
            </td>
            <td class="alert-edit-col">
                <input type="number" min="0" max="99" step="1"
                       class="alert-input alert-input--points"
                       data-id="${esc(t.id)}" data-field="points"
                       value="${esc(points)}" placeholder="—" />
            </td>
        </tr>`;
}

// ── Events ───────────────────────────────────────────────────────────────────
function _bindModalEvents(overlay, actionable, tickets, dirty) {
    overlay.querySelector('#alert-modal-close')?.addEventListener('click', _closeAlertModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeAlertModal(); });

    // Esc to close
    const onKey = e => {
        if (e.key === 'Escape') { _closeAlertModal(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    // Lien ticket → modal de détail. L'alert-modal et le modal-overlay détail partagent z-index 200
    // (.modal-overlay), donc on force le détail au-dessus via la classe .above-demo (déjà à z 11000).
    overlay.querySelectorAll('[data-open-ticket]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.openTicket;
            if (!id) return;
            const mo = document.getElementById('modal-overlay');
            if (mo) mo.classList.add('above-demo');
            window.__squadBoard?.openTicketModal?.(id);
        });
    });

    // Autocomplete custom sur les inputs leader (dropdown avec fuzzy + récents)
    _bindLeaderAutocompletes(overlay);

    // Tracking des modifications
    const ticketsById = new Map(tickets.map(t => [t.id, t]));
    overlay.querySelectorAll('.alert-input').forEach(inp => {
        inp.addEventListener('input', () => {
            const id = inp.dataset.id;
            const field = inp.dataset.field;
            const original = ticketsById.get(id);
            const orig = original?.[field] || (field === 'leader' ? (original?.assignee || '') : '');
            let newVal = inp.value.trim();
            if (field === 'points') newVal = newVal === '' ? 0 : parseInt(newVal, 10) || 0;
            // Compare normalisé
            const origNorm = field === 'points' ? (parseInt(orig, 10) || 0) : String(orig);
            const newNorm = field === 'points' ? newVal : String(newVal);
            if (origNorm !== newNorm) {
                if (!dirty.has(id)) dirty.set(id, {});
                dirty.get(id)[field] = newVal;
                inp.closest('tr').classList.add('alert-row--dirty');
            } else {
                if (dirty.has(id)) {
                    delete dirty.get(id)[field];
                    if (Object.keys(dirty.get(id)).length === 0) dirty.delete(id);
                }
                // S'il n'y a plus aucun champ dirty pour cette ligne, on retire le marker
                const tr = inp.closest('tr');
                if (tr) {
                    const stillDirty = [...tr.querySelectorAll('.alert-input')]
                        .some(i => dirty.get(i.dataset.id)?.[i.dataset.field] !== undefined);
                    if (!stillDirty) tr.classList.remove('alert-row--dirty');
                }
            }
            _updateSaveButton(overlay, dirty);
        });
    });

    // Bouton enregistrer (batch update via api.updateTicket)
    overlay.querySelector('#alert-modal-save')?.addEventListener('click', () =>
        _saveDirty(overlay, dirty));
}

function _updateSaveButton(overlay, dirty) {
    const btn = overlay.querySelector('#alert-modal-save');
    if (!btn) return;
    const total = [...dirty.values()].reduce((s, fields) => s + Object.keys(fields).length, 0);
    btn.disabled = total === 0;
    const counter = btn.querySelector('.alert-modal-dirty');
    if (counter) counter.textContent = total;
    btn.title = total === 0 ? 'Aucune modification' : `${total} modification(s) à enregistrer`;
}

async function _saveDirty(overlay, dirty) {
    if (dirty.size === 0) return;
    const btn = overlay.querySelector('#alert-modal-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

    const tasks = [...dirty.entries()].map(([id, fields]) =>
        api.updateTicket(id, fields)
            .then(() => ({ id, ok: true }))
            .catch(err => ({ id, ok: false, err: err.message || String(err) }))
    );
    const results = await Promise.all(tasks);
    const okCount = results.filter(r => r.ok).length;
    const koCount = results.length - okCount;

    if (koCount === 0) {
        toast(`${okCount} ticket(s) mis à jour`, 'success');
        // Recharge les tickets globaux (les nouvelles valeurs apparaissent dans la liste)
        try {
            const fresh = await api.getTickets();
            store.set('tickets', fresh);
        } catch { /* ignore */ }
        _closeAlertModal();
    } else {
        toast(`${okCount} OK · ${koCount} en échec — voir console`, 'warning');
        results.filter(r => !r.ok).forEach(r => console.error(`update ${r.id}:`, r.err));
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `Réessayer <span class="alert-modal-dirty">${koCount}</span>`;
        }
    }
}

// ── Autocomplete custom sur input leader (singleton popover) ────────────────
let _acPopover = null;
let _acAnchor  = null;
let _acHover   = -1;
let _acItems   = [];
function _closeAcPopover() {
    _acPopover?.remove();
    _acPopover = null;
    _acAnchor  = null;
    _acHover   = -1;
    _acItems   = [];
}
function _showAcPopover(input, members) {
    _closeAcPopover();
    if (!members.length) return;
    _acAnchor = input;
    _acItems  = members;
    _acPopover = document.createElement('div');
    _acPopover.className = 'alert-ac-popover';
    _acPopover.innerHTML = members.map((m, i) =>
        `<div class="alert-ac-opt" data-idx="${i}" role="option">
            <span class="alert-ac-name">${esc(m.name)}</span>
            ${m.team ? `<span class="alert-ac-team">${esc(m.team)}</span>` : ''}
        </div>`).join('');
    document.body.appendChild(_acPopover);
    const r = input.getBoundingClientRect();
    _acPopover.style.position = 'fixed';
    _acPopover.style.left = `${Math.round(r.left)}px`;
    _acPopover.style.top  = `${Math.round(r.bottom + 4)}px`;
    _acPopover.style.minWidth = `${Math.max(180, r.width)}px`;
    _acHover = 0;
    _highlightAc();
    _acPopover.addEventListener('mousedown', (e) => {
        // mousedown au lieu de click pour devancer le blur de l'input
        const opt = e.target.closest('.alert-ac-opt');
        if (!opt) return;
        e.preventDefault();
        const idx = parseInt(opt.dataset.idx, 10);
        _commitAc(idx);
    });
    _acPopover.addEventListener('mouseover', (e) => {
        const opt = e.target.closest('.alert-ac-opt');
        if (!opt) return;
        _acHover = parseInt(opt.dataset.idx, 10);
        _highlightAc();
    });
}
function _highlightAc() {
    if (!_acPopover) return;
    _acPopover.querySelectorAll('.alert-ac-opt').forEach((o, i) => {
        o.classList.toggle('is-hover', i === _acHover);
    });
    const cur = _acPopover.querySelector('.alert-ac-opt.is-hover');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
}
function _commitAc(idx) {
    if (!_acAnchor || !_acItems[idx]) return;
    const name = _acItems[idx].name;
    _acAnchor.value = name;
    _acAnchor.dispatchEvent(new Event('input', { bubbles: true }));
    _closeAcPopover();
}

function _bindLeaderAutocompletes(overlay) {
    // Source de vérité = table absences (CSV RH à jour). store.members peut contenir
    // des artefacts JIRA (assignees/reporters d'autres équipes) à exclure.
    const derived = deriveMembersFromAbsences(store.get('absences') || [], store.get('members') || []);
    if (!derived.length) return;
    const teamFilter = store.get('team');
    const ticketsById = new Map((store.get('tickets') || []).map(t => [t.id, t]));
    overlay.querySelectorAll('.alert-input--leader').forEach(input => {
        // Si une équipe est sélectionnée dans le topbar, on l'impose. Sinon (team='all'),
        // on suggère les membres de l'équipe du ticket courant — utile quand la modal
        // liste des tickets de plusieurs équipes.
        const ticket = ticketsById.get(input.dataset.id);
        const scope = (teamFilter && teamFilter !== 'all') ? teamFilter : ticket?.team;
        // Filtre tolérant : match exact, ou contient l'un l'autre (gère "Fuego" vs
        // "GCOM - Fuego" et variantes de préfixes/suffixes entre table absences et tickets).
        const _norm = s => (s || '').toLowerCase().trim();
        const ns = _norm(scope);
        let members = scope
            ? derived.filter(m => {
                const nm = _norm(m.team);
                return nm === ns || (ns && (nm.includes(ns) || ns.includes(nm)));
            })
            : derived;
        // Fallback ultime : si rien ne matche, suggérer toute la liste dérivée
        // plutôt que de ne rien proposer. Évite l'autocomplete muet.
        if (!members.length) members = derived;
        const _filter = () => {
            // Multi-tokens : chaque mot doit être présent dans le nom (ordre libre).
            // Ex: "martin david" matche "David Martin" ; "dav" matche "David Lefebvre".
            const tokens = (input.value || '').toLowerCase().split(/\s+/).filter(Boolean);
            const matches = members
                .filter(m => {
                    const name = (m.name || '').toLowerCase();
                    return tokens.every(tk => name.includes(tk));
                })
                .slice(0, 10);
            _showAcPopover(input, matches);
        };
        input.addEventListener('focus', _filter);
        input.addEventListener('input', _filter);
        input.addEventListener('blur', () => {
            // Délai pour laisser le mousedown sur popover faire effet
            setTimeout(() => { if (document.activeElement !== input) _closeAcPopover(); }, 120);
        });
        input.addEventListener('keydown', (e) => {
            if (!_acPopover || _acAnchor !== input) return;
            const len = _acItems.length;
            if (e.key === 'ArrowDown') { e.preventDefault(); _acHover = Math.min(len - 1, _acHover + 1); _highlightAc(); }
            else if (e.key === 'ArrowUp')   { e.preventDefault(); _acHover = Math.max(0, _acHover - 1); _highlightAc(); }
            else if (e.key === 'Enter')     { if (len) { e.preventDefault(); _commitAc(_acHover); } }
            else if (e.key === 'Escape')    { _closeAcPopover(); }
            else if (e.key === 'Tab')       { _closeAcPopover(); }
        });
    });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _typeIcon(type) {
    switch ((type || '').toLowerCase()) {
        case 'bug':      return '🐛';
        case 'story':    return '📖';
        case 'task':     return '✓';
        case 'spike':    return '🔬';
        case 'epic':     return '🧭';
        case 'feature':  return '✨';
        case 'ops':      return '⚙️';
        case 'debt':     return '💸';
        case 'support':  return '🆘';
        case 'incident': return '🆘';
        default:         return '◇';
    }
}
