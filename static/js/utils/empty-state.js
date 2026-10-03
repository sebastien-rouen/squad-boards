/**
 * État vide commun (3.197.0) — icône, titre, phrase, action : le même ton partout où « il n'y a
 * rien à afficher » (TV, Paramètres, frise…). Avant, chaque écran avait le sien (`tv-clear`,
 * `tl-state`, `jira-panel-empty`…), avec ses tailles et ses tournures.
 *
 * Rend la classe historique `.empty-state` (base-overlays.css) enrichie de `.es` : les écrans qui
 * l'utilisaient déjà gardent leur rendu. Tout le texte est échappé ; seul `action.attrs` est posé tel
 * quel (attributs fixes de l'appelant, ex. `data-act="reset"`).
 *
 * @param {object} o
 * @param {string} o.icon            emoji
 * @param {string} o.title           phrase principale (« Aucun sprint en cours »)
 * @param {string} [o.text]          précision / quoi faire
 * @param {{label: string, attrs?: string, href?: string}} [o.action]  bouton (ou lien si `href`)
 * @param {'card'|'tv'} [o.size]     'tv' : lisible à trois mètres
 * @param {'ok'|'warn'} [o.tone]     teinte de l'icône (succès, alerte)
 */
import { esc } from './dom.js';

export function emptyStateHtml({ icon = '🌤️', title = '', text = '', action = null, size = 'card', tone = '' } = {}) {
    const act = !action ? '' : action.href
        ? `<a class="btn btn-secondary btn-sm es-action" href="${esc(action.href)}">${esc(action.label)}</a>`
        : `<button type="button" class="btn btn-secondary btn-sm es-action" ${action.attrs || ''}>${esc(action.label)}</button>`;
    return `<div class="empty-state es es--${size}${tone ? ` es--${tone}` : ''}" role="status">
        <span class="es-ico" aria-hidden="true">${esc(icon)}</span>
        ${title ? `<h3 class="es-title">${esc(title)}</h3>` : ''}
        ${text ? `<p class="es-text">${esc(text)}</p>` : ''}
        ${act}
    </div>`;
}
