/**
 * Paramètres → « Règles métier » (3.272.0) : les seuils partagés réunis en un écran (registre `RULES`, rules.js).
 * Chaque champ est un réglage de projet : enregistré au changement, vide ou invalide = défaut affiché en
 * filigrane. Les seuils météo ont leur propre section (aperçu de la matrice) ; le backlog dormant est réglé
 * dans « Rappels & cérémonies » ; la cible SLA, dans sa carte.
 */

import { esc, toast } from '../utils.js';
import { projectStorage } from '../project-settings.js';
import { RULES, rule, parsePokerScale } from '../rules.js';

function _fieldHtml(r) {
    const raw = projectStorage.getItem(r.key) || '';
    const input = r.text
        ? `<input class="input sync-cfg-input sync-cfg-input--wide" data-rule="${r.key}" value="${esc(raw)}" placeholder="${esc(r.def)}" aria-label="${esc(r.label)}">`
        : `<input type="number" class="input sync-cfg-input" data-rule="${r.key}" value="${esc(raw)}" min="${r.min}" max="${r.max}" placeholder="${r.def}" aria-label="${esc(r.label)}">${r.unit ? ` <span class="text-muted">${esc(r.unit)}</span>` : ''}`;
    const eff = r.text ? rule(r.key).join(' · ') : rule(r.key);
    return `<div class="sync-cfg-row">
        <div class="sync-cfg-label"><div><div class="sync-cfg-name">${esc(r.label)}</div>
            <div class="sync-cfg-desc">${esc(r.desc)} <span class="rules-eff">Effectif : <b>${esc(String(eff))}</b>${raw ? '' : ' (défaut)'}</span></div></div></div>
        <div class="sync-cfg-input-wrap">${input}</div></div>`;
}

function _bodyHtml() {
    const groups = [...new Set(RULES.map(r => r.group))];
    return groups.map(g => `<div class="sync-cfg-block"><div class="sync-cfg-title">${esc(g)}</div>${RULES.filter(r => r.group === g).map(_fieldHtml).join('')}</div>`).join('');
}

export function rulesSectionHtml() {
    return `
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Règles métier</h3><p>Seuils partagés par tous : stagnation, sachants de l'Atlas, cartes du planning poker</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body" id="rules">${_bodyHtml()}</div>
        </div>`;
}

export function wireRulesSection(container) {
    const root = container.querySelector('#rules');
    if (!root) return;
    root.addEventListener('change', e => {
        const input = e.target.closest('[data-rule]');
        if (!input) return;
        const r = RULES.find(x => x.key === input.dataset.rule);
        const v = input.value.trim();
        if (!v) projectStorage.removeItem(r.key);
        else if (r.text) {
            const cards = parsePokerScale(v);
            if (cards.length < 3 || cards.length > 15) { toast('3 à 15 cartes valides attendues (entiers, « ? », « ☕ »)', 'warning'); return; }
            projectStorage.setItem(r.key, cards.join(', '));
        } else {
            const n = parseInt(v, 10);
            if (!(n >= r.min && n <= r.max)) { toast(`${r.label} : entre ${r.min} et ${r.max}`, 'warning'); return; }
            projectStorage.setItem(r.key, String(n));
        }
        toast(`${r.label} : enregistré pour tous`, 'success');
        root.innerHTML = _bodyHtml();
    });
}
