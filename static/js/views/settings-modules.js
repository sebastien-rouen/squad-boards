/**
 * Paramètres → « Modules & menu » (3.273.0) : activer / désactiver une vue et renommer son entrée de menu, pour
 * TOUT le projet (utils/modules.js, réglage `sb-modules`). Désactiver ne supprime aucune donnée. Dashboard et
 * Paramètres restent toujours actifs. Enregistré au changement.
 */

import { esc, toast } from '../utils.js';
import { NAV_ITEMS } from '../config.js';
import { modulesConfig, saveModulesConfig, defaultLabel, ALWAYS_ON } from '../utils/modules.js';

const GROUP = { main: 'Pilotage', team: 'Équipe & RH', footer: 'Administration' };

function _bodyHtml() {
    const { off, labels } = modulesConfig();
    return Object.entries(GROUP).map(([sec, title]) => `<div class="sync-cfg-block"><div class="sync-cfg-title">${esc(title)}</div>
        ${NAV_ITEMS.filter(n => n.section === sec).map(n => {
            const locked = ALWAYS_ON.includes(n.id), on = !off.includes(n.id);
            return `<div class="mods-row${on ? '' : ' is-off'}">
                <label class="mods-toggle"><input type="checkbox" data-mod-on="${n.id}"${on ? ' checked' : ''}${locked ? ' disabled' : ''}> <span>${on ? 'Actif' : 'Masqué'}</span></label>
                <input class="input input-sm" data-mod-label="${n.id}" value="${esc(labels[n.id] || '')}" placeholder="${esc(defaultLabel(n.id))}" maxlength="30" aria-label="${esc(`Libellé du menu pour ${defaultLabel(n.id)}`)}">
                ${locked ? '<small class="text-muted">toujours actif</small>' : ''}</div>`;
        }).join('')}</div>`).join('');
}

export function modulesSectionHtml() {
    return `
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Modules & menu</h3><p>Vues proposées au projet et libellés du menu (ex. « PI Planning » → « Release ») — pour tous</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body"><p class="sync-cfg-hint">Un module masqué disparaît du menu, des raccourcis et de la palette Ctrl+K ; ses données restent intactes et il revient tel quel une fois réactivé.</p><div id="mods">${_bodyHtml()}</div></div>
        </div>`;
}

export function wireModulesSection(container) {
    const root = container.querySelector('#mods');
    if (!root) return;
    root.addEventListener('change', e => {
        const t = e.target;
        if (!t.matches('[data-mod-on], [data-mod-label]')) return;
        const cfg = modulesConfig();
        if (t.dataset.modOn) cfg.off = t.checked ? cfg.off.filter(id => id !== t.dataset.modOn) : [...cfg.off, t.dataset.modOn];
        else cfg.labels = { ...cfg.labels, [t.dataset.modLabel]: t.value };
        saveModulesConfig(cfg);
        toast(t.dataset.modOn ? `${defaultLabel(t.dataset.modOn)} : ${t.checked ? 'réactivé' : 'masqué'} pour tous` : 'Libellé du menu enregistré', 'success');
        root.innerHTML = _bodyHtml();
    });
}
