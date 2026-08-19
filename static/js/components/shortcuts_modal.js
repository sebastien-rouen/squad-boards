/**
 * Modale « ? » — récapitulatif des raccourcis clavier + astuces.
 * Ouverte par la touche `?` (hors champ de saisie) ou l'entrée « Aide » du kebab topbar.
 * Les raccourcis de navigation sont dérivés de NAV_ITEMS (source unique).
 */

import { NAV_ITEMS } from '../config.js';
import { esc, trapFocus } from '../utils.js';

let _releaseTrap = null;

function _close() {
    if (_releaseTrap) { _releaseTrap(); _releaseTrap = null; }
    const ov = document.getElementById('shortcuts-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    ov.addEventListener('transitionend', () => ov.remove(), { once: true });
}

export function openShortcutsModal() {
    if (document.getElementById('shortcuts-overlay')) { _close(); return; }

    const navRows = NAV_ITEMS.filter(n => n.shortcut).map(n =>
        `<div class="sc-row"><span>${esc(n.label)}</span><kbd>${esc(n.shortcut)}</kbd></div>`
    ).join('');

    const ov = document.createElement('div');
    ov.id = 'shortcuts-overlay';
    ov.className = 'confirm-overlay';
    ov.innerHTML = `
        <div class="confirm-modal sc-modal" role="dialog" aria-modal="true" aria-labelledby="sc-title">
            <div class="sc-head">
                <h2 id="sc-title">⌨️ Raccourcis clavier</h2>
                <button class="btn-icon" id="sc-close" aria-label="Fermer"><svg class="icon"><use href="#i-x"/></svg></button>
            </div>
            <div class="sc-grid">
                <div>
                    <div class="sc-group">Navigation</div>
                    ${navRows}
                    <div class="sc-row"><span>Palette de commandes</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd></span></div>
                    <div class="sc-row"><span>Changer d'équipe</span><span><kbd>Ctrl</kbd>+<kbd>E</kbd></span></div>
                    <div class="sc-row"><span>Cette aide</span><kbd>?</kbd></div>
                </div>
                <div>
                    <div class="sc-group">Actions</div>
                    <div class="sc-row"><span>Nouveau ticket</span><kbd>N</kbd></div>
                    <div class="sc-row"><span>Ouvrir la carte focusée (Board)</span><kbd>Entrée</kbd></div>
                    <div class="sc-row"><span>Déplacer la carte de colonne</span><span><kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd></span></div>
                    <div class="sc-row"><span>Fermer modale / palette</span><kbd>Échap</kbd></div>
                    <div class="sc-group">Sur PI Planning</div>
                    <div class="sc-row"><span>Onglets PI</span><span><kbd>1</kbd>–<kbd>9</kbd></span></div>
                    <div class="sc-group">Filtres de la palette (Ctrl+K)</div>
                    <div class="sc-row"><span>Par assigné·e</span><kbd>@nom</kbd></div>
                    <div class="sc-row"><span>Par équipe / statut / type</span><span><kbd>team:</kbd> <kbd>status:</kbd> <kbd>type:</kbd></span></div>
                </div>
            </div>
            <div class="sc-foot">💡 Astuce : la palette <kbd>Ctrl</kbd>+<kbd>K</kbd> contient aussi les templates Slack des rituels (daily, rétro, démo…), le mode présentation TV et les alertes actionnables. Guides détaillés dans <code>docs/guide-scrum-master.md</code> du dépôt.</div>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));
    _releaseTrap = trapFocus(ov.querySelector('.sc-modal'));
    ov.querySelector('#sc-close').focus();

    ov.querySelector('#sc-close').addEventListener('click', _close);
    ov.addEventListener('click', e => { if (e.target === ov) _close(); });
}

export function initShortcutsModal() {
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('shortcuts-overlay')) { _close(); return; }
        if (e.key !== '?') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
        e.preventDefault();
        openShortcutsModal();
    });
    document.getElementById('more-help')?.addEventListener('click', openShortcutsModal);
}
