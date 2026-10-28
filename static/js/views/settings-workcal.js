/**
 * Paramètres → « Calendrier de travail » (3.270.0) : pays des jours fériés + jours de fermeture de l'entreprise
 * (ponts). Réglage de projet partagé `sb-holidays` (utils/holidays.js) — il change les jours OUVRÉS partout :
 * capacité, durées, bandeau calendrier, frise, TV. Enregistré à chaque changement.
 */

import { esc, toast } from '../utils.js';
import { projectStorage } from '../project-settings.js';
import { HOLIDAY_COUNTRIES, holidayConfig, holidaysOf } from '../utils/holidays.js';

const KEY = 'sb-holidays';
const fmt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function _save(country, closures) {
    const list = [...new Set(closures)].sort();
    if (country === 'FR' && !list.length) projectStorage.removeItem(KEY);   // = défaut
    else projectStorage.setItem(KEY, JSON.stringify({ country, closures: list }));
}

function _bodyHtml() {
    const { country, closures } = holidayConfig();
    const today = new Date().toISOString().slice(0, 10), y = +today.slice(0, 4);
    const next = Object.entries({ ...holidaysOf(country, y), ...holidaysOf(country, y + 1) })
        .filter(([d]) => d >= today).sort().slice(0, 6);
    return `
        <div class="sync-cfg-row">
            <div class="sync-cfg-label"><span class="sync-cfg-icon">🗓️</span><div><div class="sync-cfg-name">Jours fériés</div>
                <div class="sync-cfg-desc">Non ouvrés pour toutes les équipes (capacité, durées, calendrier).</div></div></div>
            <div class="sync-cfg-input-wrap"><select class="input" id="wc-country" aria-label="Pays des jours fériés">${HOLIDAY_COUNTRIES.map(c => `<option value="${c.key}"${c.key === country ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
        </div>
        ${next.length ? `<p class="sync-cfg-hint">Prochains : ${next.map(([d, n]) => `<span class="wc-chip">${esc(n)} · ${esc(fmt(d))}</span>`).join(' ')}</p>` : ''}
        <div class="sync-cfg-row">
            <div class="sync-cfg-label"><span class="sync-cfg-icon">🏢</span><div><div class="sync-cfg-name">Fermetures de l'entreprise</div>
                <div class="sync-cfg-desc">Ponts, fermeture de fin d'année… comptés comme fériés.</div></div></div>
            <form class="sync-cfg-input-wrap wc-add" data-wc-add><input type="date" class="input" name="d" required aria-label="Jour de fermeture"><button type="submit" class="btn btn-secondary btn-sm">Ajouter</button></form>
        </div>
        <div class="wc-list">${[...closures].sort().map(d => `<span class="wc-chip${d < today ? ' is-past' : ''}">${esc(fmt(d))}<button type="button" class="wc-del" data-wc-del="${esc(d)}" aria-label="${esc(`Retirer le ${fmt(d)}`)}">✕</button></span>`).join('') || '<small class="text-muted">Aucune fermeture.</small>'}</div>`;
}

export function workcalSectionHtml() {
    return `
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Calendrier de travail</h3><p>Jours fériés du pays et fermetures de l'entreprise — partagés par tous</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body"><div class="sync-cfg-block" id="wc">${_bodyHtml()}</div></div>
        </div>`;
}

export function wireWorkcalSection(container) {
    const root = container.querySelector('#wc');
    if (!root) return;
    const redraw = () => { root.innerHTML = _bodyHtml(); };
    root.addEventListener('change', e => {
        if (e.target.id !== 'wc-country') return;
        _save(e.target.value, holidayConfig().closures);
        toast('Jours fériés : ' + (HOLIDAY_COUNTRIES.find(c => c.key === e.target.value)?.label || e.target.value), 'success');
        redraw();
    });
    root.addEventListener('submit', e => {
        if (!e.target.matches('[data-wc-add]')) return;
        e.preventDefault();
        const d = e.target.elements.d.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        const { country, closures } = holidayConfig();
        _save(country, [...closures, d]);
        redraw();
    });
    root.addEventListener('click', e => {
        const b = e.target.closest('[data-wc-del]');
        if (!b) return;
        const { country, closures } = holidayConfig();
        _save(country, [...closures].filter(x => x !== b.dataset.wcDel));
        redraw();
    });
}
