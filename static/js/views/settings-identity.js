/**
 * Paramètres → « Identité du projet » (3.276.0) : nom affiché (barre latérale, logo, titre d'onglet) et couleur
 * principale de l'instance — utile quand plusieurs projets tournent côte à côte (utils/identity.js). Partagé.
 */

import { esc, toast } from '../utils.js';
import { projectStorage } from '../project-settings.js';
import { NAME_KEY, COLOR_KEY, APP_NAME, projectName, projectInitials, brandColor } from '../utils/identity.js';

function _bodyHtml() {
    const name = projectStorage.getItem(NAME_KEY) || '', color = brandColor();
    return `<div class="sync-cfg-block">
        <div class="sync-cfg-row"><div class="sync-cfg-label"><span class="sync-cfg-icon">🏷️</span><div><div class="sync-cfg-name">Nom du projet</div>
            <div class="sync-cfg-desc">Barre latérale, logo (initiales « ${esc(projectInitials())} ») et titre de l'onglet. Vide = « ${APP_NAME} ».</div></div></div>
            <div class="sync-cfg-input-wrap"><input class="input sync-cfg-input sync-cfg-input--wide" data-id="name" value="${esc(name)}" placeholder="${APP_NAME}" maxlength="60" aria-label="Nom du projet"></div></div>
        <div class="sync-cfg-row"><div class="sync-cfg-label"><span class="sync-cfg-icon">🎨</span><div><div class="sync-cfg-name">Couleur principale</div>
            <div class="sync-cfg-desc">Boutons, liens, onglet actif — thèmes clair et sombre.${color ? '' : ' Actuellement : bleu par défaut.'}</div></div></div>
            <div class="sync-cfg-input-wrap"><input type="color" data-id="color" value="${esc(color || '#2563eb')}" aria-label="Couleur principale">
                ${color ? '<button type="button" class="btn btn-ghost btn-sm" data-id-reset>Couleur par défaut</button>' : ''}</div></div>
        <p class="sync-cfg-hint">Aperçu : <strong>${esc(projectName())}</strong> — le nom de l'outil (« ${APP_NAME} ») reste dans les exports et comptes rendus.</p></div>`;
}

export function identitySectionHtml() {
    return `
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Identité du projet</h3><p>Nom et couleur de cette instance — pour tous</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body" id="ident">${_bodyHtml()}</div>
        </div>`;
}

export function wireIdentitySection(container) {
    const root = container.querySelector('#ident');
    if (!root) return;
    root.addEventListener('change', e => {
        const k = e.target.dataset.id;
        if (!k) return;
        const v = e.target.value.trim();
        if (k === 'name') { if (v) projectStorage.setItem(NAME_KEY, v); else projectStorage.removeItem(NAME_KEY); }
        else if (/^#[0-9a-f]{6}$/i.test(v)) projectStorage.setItem(COLOR_KEY, v);
        toast(k === 'name' ? 'Nom du projet enregistré' : 'Couleur enregistrée', 'success');
        root.innerHTML = _bodyHtml();
    });
    root.addEventListener('click', e => {
        if (!e.target.closest('[data-id-reset]')) return;
        projectStorage.removeItem(COLOR_KEY);
        root.innerHTML = _bodyHtml();
    });
}
