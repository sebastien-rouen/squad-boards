/**
 * Modales applicatives — confirmation, choix, export, import/export par onglets, saisie.
 * Toutes posent role="dialog" aria-modal + trapFocus et rendent un release à la fermeture.
 *
 * Extrait de utils.js (v3.141.5) — utils.js reste le point d'entrée et ré-exporte tout,
 * aucun import des vues n'a changé.
 */

import { esc, trapFocus } from './dom.js';

/**
 * Confirmation destructrice avec modale stylée (vs `confirm()` natif).
 * Retourne Promise<boolean>.
 *
 * options : { confirmLabel?, cancelLabel?, danger? }
 */
export function confirmDanger(title, message, options = {}) {
    return new Promise(resolve => {
        const {
            confirmLabel = 'Supprimer',
            cancelLabel = 'Annuler',
            danger = true,
        } = options;
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        ov.innerHTML = `
            <div class="confirm-modal" role="dialog" aria-modal="true">
                <div class="confirm-icon ${danger ? 'confirm-icon--danger' : 'confirm-icon--warn'}">${danger ? '⚠' : '?'}</div>
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message).replace(/\n/g, '<br>')}</div>` : ''}
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-act="cancel">${esc(cancelLabel)}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-act="ok">${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const onKey = e => {
            if (e.key === 'Escape') cleanup(false);
            else if (e.key === 'Enter') cleanup(true);
        };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => {
            if (e.target === ov) cleanup(false);
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'ok')     cleanup(true);
            if (act === 'cancel') cleanup(false);
        });
        setTimeout(() => ov.querySelector('[data-act="ok"]')?.focus(), 50);
    });
}

/**
 * Modale à choix multiples (≥2 actions + annulation). Réutilise `.confirm-overlay`/`.confirm-modal`.
 * @param {string} title
 * @param {string} message  (sauts de ligne `\n` autorisés)
 * @param {Array<{key:string,label:string,variant?:string}>} buttons  variant: 'primary'|'danger'|'secondary'
 * @returns {Promise<string|null>} la `key` choisie, ou `null` si annulé (Échap / clic hors modale / Annuler).
 */
export function choiceModal(title, message, buttons = []) {
    return new Promise(resolve => {
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        const btnHtml = buttons.map(b =>
            `<button class="btn btn-${b.variant || 'primary'} btn-sm" data-key="${esc(b.key)}">${esc(b.label)}</button>`
        ).join('');
        ov.innerHTML = `
            <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message).replace(/\n/g, '<br>')}</div>` : ''}
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-key="">Annuler</button>
                    ${btnHtml}
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val || null);
        };
        const onKey = e => { if (e.key === 'Escape') cleanup(null); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => {
            if (e.target === ov) return cleanup(null);
            const btn = e.target.closest('[data-key]');
            if (btn) cleanup(btn.dataset.key);
        });
        // Focus la 1re action métier (pas "Annuler")
        setTimeout(() => ov.querySelector('.confirm-actions [data-key]:not([data-key=""])')?.focus(), 50);
    });
}

/**
 * Modale de sélection multiple façon "gros boutons carrés" (ex: choisir les
 * données à exporter). Chaque bouton bascule sélectionné/désélectionné avec un
 * visuel "enfoncé" (bordure + fond teintés, légèrement réduit, ombre interne).
 * Tout est présélectionné par défaut (sauf `initialSelected`). Propose en option
 * un choix de format (pills façon `.board-modes`, réutilisé depuis Reports) et
 * un raccourci tout sélectionner/désélectionner.
 * @param {string} title
 * @param {Array<{key:string,label:string,icon?:string,count?:number}>} items
 * @param {object} [opts] { message?, confirmLabel?, formats?:Array<{key:string,label:string}>,
 *   initialSelected?:string[], initialFormat?:string }
 * @returns {Promise<{keys:string[],format:string}|null>} sélection + format choisi, ou `null` si annulé.
 */
export function exportChoiceModal(title, items, opts = {}) {
    const { message = '', confirmLabel = 'Exporter', formats = null, initialSelected = null, initialFormat = null } = opts;
    return new Promise(resolve => {
        const validKeys = new Set(items.map(i => i.key));
        const initial = initialSelected?.filter(k => validKeys.has(k));
        const selected = new Set(initial?.length ? initial : items.map(i => i.key));
        let format = (initialFormat && formats?.some(f => f.key === initialFormat)) ? initialFormat : (formats?.[0]?.key || null);
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        const toggleAllLabel = () => selected.size === items.length ? 'Tout désélectionner' : 'Tout sélectionner';
        const gridHtml = items.map(i => `
            <button type="button" class="export-choice-btn${selected.has(i.key) ? ' export-choice-btn--on' : ''}" data-key="${esc(i.key)}">
                ${i.count != null ? `<span class="export-choice-count">${i.count}</span>` : ''}
                <span class="export-choice-icon">${i.icon || '📦'}</span>
                <span class="export-choice-label">${esc(i.label)}</span>
            </button>`).join('');
        const formatsHtml = formats
            ? `<div class="export-choice-formats">
                   <span class="export-choice-formats-lbl">Format</span>
                   <div class="board-modes">
                       ${formats.map(f => `<button type="button" class="board-mode-btn${f.key === format ? ' active' : ''}" data-format="${esc(f.key)}">${esc(f.label)}</button>`).join('')}
                   </div>
               </div>`
            : '';
        ov.innerHTML = `
            <div class="confirm-modal confirm-modal--export" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message)}</div>` : ''}
                    ${formatsHtml}
                    <div class="export-choice-toolbar">
                        <button type="button" class="btn btn-ghost btn-xs" id="export-choice-toggle-all">${toggleAllLabel()}</button>
                    </div>
                    <div class="export-choice-grid">${gridHtml}</div>
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-act="cancel">Annuler</button>
                    <button class="btn btn-primary btn-sm" data-act="ok">${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const onKey = e => { if (e.key === 'Escape') cleanup(null); };
        document.addEventListener('keydown', onKey);
        const toggleAllBtn = ov.querySelector('#export-choice-toggle-all');
        ov.querySelector('.export-choice-grid').addEventListener('click', e => {
            const btn = e.target.closest('.export-choice-btn');
            if (!btn) return;
            const key = btn.dataset.key;
            if (selected.has(key)) selected.delete(key); else selected.add(key);
            btn.classList.toggle('export-choice-btn--on', selected.has(key));
            toggleAllBtn.textContent = toggleAllLabel();
        });
        toggleAllBtn?.addEventListener('click', () => {
            const selectAll = selected.size !== items.length;
            selected.clear();
            if (selectAll) items.forEach(i => selected.add(i.key));
            ov.querySelectorAll('.export-choice-btn').forEach(btn =>
                btn.classList.toggle('export-choice-btn--on', selected.has(btn.dataset.key)));
            toggleAllBtn.textContent = toggleAllLabel();
        });
        ov.querySelector('.export-choice-formats')?.addEventListener('click', e => {
            const btn = e.target.closest('[data-format]');
            if (!btn) return;
            format = btn.dataset.format;
            ov.querySelectorAll('.export-choice-formats .board-mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.format === format));
        });
        ov.addEventListener('click', e => {
            if (e.target === ov) return cleanup(null);
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'ok') cleanup({ keys: [...selected], format });
            if (act === 'cancel') cleanup(null);
        });
    });
}

/**
 * Modale à 2 onglets (Import / Export) — réutilise `.confirm-overlay`/`.confirm-modal` mais reste
 * ouverte tant que l'utilisateur ne la ferme pas explicitement (pas de `Promise` résolue à la
 * fermeture comme les autres modales de cette famille) : le contenu HTML des onglets et toute la
 * logique métier (parsing, validation, appels API) restent à la charge de l'appelant, qui câble ses
 * propres listeners sur les éléments de `overlay` juste après l'ouverture.
 * @param {string} title
 * @param {object} opts { importHtml, exportHtml, initialTab? }
 * @returns {{overlay: HTMLElement, close: () => void}}
 */
export function ioTabModal(title, opts = {}) {
    const { importHtml = '', exportHtml = '', initialTab = 'import' } = opts;
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `
        <div class="confirm-modal confirm-modal--io" role="dialog" aria-modal="true" aria-label="${esc(title)}">
            <div class="confirm-body">
                <div class="confirm-title">${esc(title)}</div>
                <div class="tabs io-modal-tabs">
                    <button type="button" class="tab${initialTab === 'import' ? ' active' : ''}" data-io-tab="import">📥 Import</button>
                    <button type="button" class="tab${initialTab === 'export' ? ' active' : ''}" data-io-tab="export">📤 Export</button>
                </div>
                <div class="io-modal-pane" data-io-pane="import"${initialTab !== 'import' ? ' hidden' : ''}>${importHtml}</div>
                <div class="io-modal-pane" data-io-pane="export"${initialTab !== 'export' ? ' hidden' : ''}>${exportHtml}</div>
            </div>
            <div class="confirm-actions">
                <button class="btn btn-ghost btn-sm" data-act="close">Fermer</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));
    const close = () => {
        ov.classList.remove('visible');
        ov.addEventListener('transitionend', () => ov.remove(), { once: true });
        document.removeEventListener('keydown', onKey);
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => {
        if (e.target === ov) return close();
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'close') return close();
        const tabBtn = e.target.closest('[data-io-tab]');
        if (tabBtn) {
            const tab = tabBtn.dataset.ioTab;
            ov.querySelectorAll('[data-io-tab]').forEach(b => b.classList.toggle('active', b.dataset.ioTab === tab));
            ov.querySelectorAll('[data-io-pane]').forEach(p => { p.hidden = p.dataset.ioPane !== tab; });
        }
    });
    return { overlay: ov, close };
}

/**
 * Saisie texte modale (remplace `prompt()` natif : thémée, dark-mode, validation, Échap/Entrée).
 * @param {string} title
 * @param {object} [opts] { message?, value?, placeholder?, confirmLabel?, cancelLabel?, type?, required? }
 * @returns {Promise<string|null>} valeur saisie (trim) ou `null` si annulé.
 */
export function promptModal(title, opts = {}) {
    const {
        message = '', value = '', placeholder = '',
        confirmLabel = 'Valider', cancelLabel = 'Annuler',
        type = 'text', required = false,
    } = opts;
    return new Promise(resolve => {
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        ov.innerHTML = `
            <div class="confirm-modal confirm-modal--prompt" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message).replace(/\n/g, '<br>')}</div>` : ''}
                    <input class="input confirm-input" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}">
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-act="cancel">${esc(cancelLabel)}</button>
                    <button class="btn btn-primary btn-sm" data-act="ok">${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const input = ov.querySelector('.confirm-input');
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const submit = () => {
            const v = input.value.trim();
            if (required && !v) { input.classList.add('confirm-input--error'); input.focus(); return; }
            cleanup(v);
        };
        const onKey = e => {
            if (e.key === 'Escape') cleanup(null);
            else if (e.key === 'Enter') submit();
        };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => {
            if (e.target === ov) return cleanup(null);
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'ok') submit();
            if (act === 'cancel') cleanup(null);
        });
        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}
