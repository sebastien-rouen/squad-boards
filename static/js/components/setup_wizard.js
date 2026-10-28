/**
 * 🧭 Assistant de mise en route d'un projet (3.275.0) — réunit les réglages « projet » en 5 étapes :
 *   1. Projet : nom, durée d'un sprint, sprints par PI (`PUT /api/pi`, réglage `sb-project-name`)
 *   2. Équipes : une par ligne, les nouvelles sont créées (`POST /api/teams`)
 *   3. Modules : vues proposées au projet (utils/modules.js)
 *   4. Calendrier : pays des jours fériés (utils/holidays.js)
 *   5. Et ensuite : personnes, JIRA, règles métier, campagne de l'Atlas
 * Rien n'est écrit avant « Terminer » ; tout est ensuite modifiable dans Paramètres. Entrées : premier
 * lancement (« Créer à la main »), Paramètres → Modules & menu, palette Ctrl+K.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, trapFocus } from '../utils.js';
import { NAV_ITEMS } from '../config.js';
import { projectStorage } from '../project-settings.js';
import { modulesConfig, saveModulesConfig, defaultLabel, ALWAYS_ON } from '../utils/modules.js';
import { HOLIDAY_COUNTRIES, holidayConfig } from '../utils/holidays.js';

const STEPS = ['🏷️ Projet', '👥 Équipes', '🧩 Modules', '📅 Calendrier', '✅ Et ensuite'];
const NEXT = [
    ['#settings/membres', '🧑‍🤝‍🧑 Personnes', 'saisir les membres ou importer un CSV (avec en-tête), ou les congés RH'],
    ['#settings/plugin-jira-optionnel', '🔌 JIRA', 'connexion partagée, puis une synchro complète remplit tickets et sprints'],
    ['#settings/regles-metier', '⚖️ Règles métier', 'stagnation, sachants, cartes du planning poker'],
    ['#atlas/all/catalog', '🧬 Atlas', 'catalogue des compétences, puis 📋 campagne d\'évaluation'],
];

function _stepHtml(w) {
    const teams = store.get('teams') || [];
    switch (w.step) {
        case 0: return `<label class="sw-field"><span>Nom du projet</span><input class="input" data-w="name" value="${esc(w.name)}" placeholder="ex. Train Paiement" maxlength="60"></label>
            <div class="sw-row"><label class="sw-field"><span>Durée d'un sprint</span><select class="input" data-w="sprintDuration">${[7, 14, 21, 28].map(d => `<option value="${d}"${d === w.sprintDuration ? ' selected' : ''}>${d / 7} semaine${d > 7 ? 's' : ''}</option>`).join('')}</select></label>
            <label class="sw-field"><span>Sprints par PI</span><input type="number" class="input" data-w="sprintsPerPI" value="${w.sprintsPerPI}" min="1" max="12"></label></div>
            <p class="sw-hint">Pas de PI (Scrum seul) ? Masque « PI Planning » à l'étape Modules ; la cadence des sprints reste utile partout.</p>`;
        case 1: return `<label class="sw-field"><span>Équipes — une par ligne</span><textarea class="input" rows="7" data-w="teamsText" placeholder="Alpha&#10;Beta&#10;Gamma">${esc(w.teamsText)}</textarea></label>
            <p class="sw-hint">${teams.length ? `Déjà là : ${teams.map(esc).join(', ')} — seules les nouvelles seront créées.` : 'Aucune équipe pour l\'instant.'} Une synchro JIRA crée aussi les équipes de ses boards.</p>`;
        case 2: return `<p class="sw-hint">Décoche ce que ton projet n'utilise pas : tout reste réactivable (Paramètres → Modules & menu), aucune donnée n'est supprimée.</p>
            <div class="sw-mods">${NAV_ITEMS.filter(n => !ALWAYS_ON.includes(n.id)).map(n => `<label class="sw-mod"><input type="checkbox" data-mod="${n.id}"${w.off.includes(n.id) ? '' : ' checked'}> ${esc(defaultLabel(n.id))}</label>`).join('')}</div>`;
        case 3: return `<label class="sw-field"><span>Jours fériés</span><select class="input" data-w="country">${HOLIDAY_COUNTRIES.map(c => `<option value="${c.key}"${c.key === w.country ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
            <p class="sw-hint">Ils comptent comme non ouvrés partout (capacité, durées, calendrier). Les ponts se règlent dans Paramètres → Calendrier de travail.</p>`;
        default: return `<p>Tout est prêt à enregistrer. Ensuite :</p><div class="sw-next">${NEXT.map(([href, t, d]) => `<a class="sw-next__item" href="${href}" data-sw-go><b>${t}</b><small>${esc(d)}</small></a>`).join('')}</div>`;
    }
}

/** Enregistre tout ; renvoie le nombre d'équipes créées. */
async function _apply(w) {
    if (w.name.trim()) projectStorage.setItem('sb-project-name', w.name.trim()); else projectStorage.removeItem('sb-project-name');
    await api.updatePI({ sprintDuration: w.sprintDuration, sprintsPerPI: w.sprintsPerPI });
    const have = new Set((store.get('teams') || []).map(t => t.toLowerCase()));
    const fresh = [...new Set(w.teamsText.split('\n').map(s => s.trim()).filter(Boolean))].filter(t => !have.has(t.toLowerCase()));
    for (const name of fresh) await api.createTeam({ name });
    saveModulesConfig({ off: w.off, labels: modulesConfig().labels });
    const { closures } = holidayConfig();
    if (w.country === 'FR' && !closures.size) projectStorage.removeItem('sb-holidays');
    else projectStorage.setItem('sb-holidays', JSON.stringify({ country: w.country, closures: [...closures] }));
    return fresh.length;
}

export function openSetupWizard() {
    document.getElementById('setup-wizard')?.remove();
    const pi = store.get('piInfo') || {};
    const w = {
        step: 0, name: projectStorage.getItem('sb-project-name') || '',
        sprintDuration: parseInt(pi.sprintDuration, 10) || 14, sprintsPerPI: parseInt(pi.sprintsPerPI, 10) || 5,
        teamsText: (store.get('teams') || []).join('\n'), off: [...modulesConfig().off], country: holidayConfig().country,
    };
    const ov = document.createElement('div');
    ov.id = 'setup-wizard';
    ov.className = 'sw-overlay';
    document.body.appendChild(ov);
    let release = null;
    const close = () => { release?.(); document.removeEventListener('keydown', onKey, true); ov.remove(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const paint = () => {
        const last = w.step === STEPS.length - 1;
        ov.innerHTML = `<section class="sw-modal" role="dialog" aria-modal="true" aria-labelledby="sw-title">
            <header class="sw-head"><h3 id="sw-title">🧭 Mise en route du projet</h3><button type="button" class="btn-icon" data-sw-close aria-label="Fermer"><svg class="icon"><use href="#i-x"/></svg></button></header>
            <ol class="sw-steps">${STEPS.map((s, i) => `<li class="${i === w.step ? 'is-cur' : i < w.step ? 'is-done' : ''}">${s}</li>`).join('')}</ol>
            <div class="sw-body">${_stepHtml(w)}</div>
            <footer class="sw-foot"><button type="button" class="btn btn-ghost btn-sm" data-sw-prev${w.step ? '' : ' disabled'}>‹ Précédent</button><span class="spacer"></span>
                <button type="button" class="btn btn-primary btn-sm" data-sw-next>${last ? 'Terminer et enregistrer' : 'Suivant →'}</button></footer></section>`;
        release?.();
        release = trapFocus(ov.querySelector('.sw-modal'));
    };
    // Les saisies vont dans l'état au fil de l'eau (un retour en arrière les retrouve)
    ov.addEventListener('input', e => {
        const k = e.target.dataset.w;
        if (k) w[k] = ['sprintDuration', 'sprintsPerPI'].includes(k) ? Math.max(1, Math.min(k === 'sprintsPerPI' ? 12 : 28, parseInt(e.target.value, 10) || 1)) : e.target.value;
        if (e.target.dataset.mod) w.off = e.target.checked ? w.off.filter(id => id !== e.target.dataset.mod) : [...w.off, e.target.dataset.mod];
    });
    ov.addEventListener('click', async e => {
        if (e.target === ov || e.target.closest('[data-sw-close]')) { close(); return; }
        if (e.target.closest('[data-sw-go]')) { close(); return; }   // le lien navigue lui-même
        if (e.target.closest('[data-sw-prev]') && w.step) { w.step--; paint(); return; }
        if (!e.target.closest('[data-sw-next]')) return;
        if (w.step < STEPS.length - 1) { w.step++; paint(); return; }
        const btn = e.target.closest('[data-sw-next]');
        btn.disabled = true;
        try {
            const created = await _apply(w);
            await window.__squadBoard?.loadAllData?.();
            toast(`Projet enregistré${created ? ` · ${created} équipe${created > 1 ? 's' : ''} créée${created > 1 ? 's' : ''}` : ''}`, 'success', 4000);
            close();
            window.__squadBoard?.rerenderView?.();
        } catch (err) { btn.disabled = false; toast('Enregistrement impossible : ' + (err.message || err), 'error'); }
    });
    document.addEventListener('keydown', onKey, true);
    paint();
}
