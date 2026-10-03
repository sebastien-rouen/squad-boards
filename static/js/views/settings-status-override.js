/**
 * Paramètres → JIRA : « 🎯 Statuts forcés dans une colonne » — édition de la règle des statuts forcés
 * (utils/status-override.js), un onglet par colonne cible : ✅ Terminé, 🔄 En cours, 📦 À faire.
 * Les statuts JIRA d'un onglet vont dans sa colonne (statut, et à la synchro dates de début / fin et
 * cycle time) pour toutes les équipes sauf les exemptées de cet onglet, quoi qu'en dise le board.
 *
 * Réglage PARTAGÉ (en base, `piInfo.statusOverride`, route PUT /api/pi/status-override) : il vaut pour
 * le poste qui synchronise, l'écran TV et chaque navigateur — pas de localStorage ici.
 * Édition sur une copie de travail ; un statut ne vit que dans un onglet (l'ajouter ailleurs l'y
 * déplace) ; l'aperçu se recalcule à chaque changement ; l'enregistrement s'applique aussitôt.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast } from '../utils.js';
import { STATUS_OVERRIDE_DEFAULTS, STATUS_OVERRIDE_TARGETS } from '../config.js';
import { overrideRules, isCustomOverride, forcedStatus, rawStatus } from '../utils/status-override.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const TAB = Object.fromEntries(STATUS_OVERRIDE_TARGETS.map(t => [t.key, t]));
const HELP = {
    done: 'Livré ou abandonné : compte dans la vélocité, sort des blockers et du travail en cours.',
    inprog: 'Travail réellement entamé : démarre le cycle time, compte dans le WIP.',
    todo: 'Pas encore commencé (prêt, à affiner…) : hors WIP, sans cycle time.',
};
let _work = null;   // copie de travail { done, inprog, todo }
let _tab = 'done';
let _note = '';     // message éphémère (statut déplacé d'un onglet à l'autre)

/** Statuts JIRA rencontrés dans les tickets, avec leur effectif (libellé le plus fréquent par forme normalisée). */
function knownStatuses() {
    const by = new Map();
    for (const t of store.get('tickets') || []) {
        const k = norm(t.jiraStatus);
        if (!k) continue;
        const e = by.get(k) || by.set(k, { n: 0, labels: new Map() }).get(k);
        e.n++;
        e.labels.set(t.jiraStatus, (e.labels.get(t.jiraStatus) || 0) + 1);
    }
    return [...by.entries()].map(([k, e]) => ({ k, n: e.n, label: [...e.labels].sort((a, b) => b[1] - a[1])[0][0] }))
        .sort((a, b) => b.n - a.n);
}

/** Effet de la règle de travail pour une colonne : tickets dans ses statuts (`per`) et ceux qu'elle fait
 *  CHANGER de colonne (`gain`, `gainPer` — leur statut d'origine était autre), équipes concernées. */
function effect(key) {
    const per = new Map(), gainPer = new Map(), teams = new Set();
    let gain = 0;
    for (const t of store.get('tickets') || []) {
        if (forcedStatus(t.team, t.jiraStatus, _work) !== key) continue;
        const k = norm(t.jiraStatus);
        per.set(k, (per.get(k) || 0) + 1);
        if (rawStatus(t) === key) continue;
        gain++; teams.add(t.team);
        gainPer.set(k, (gainPer.get(k) || 0) + 1);
    }
    return { gain, gainPer, per, teams: [...teams].sort((a, b) => a.localeCompare(b, 'fr')) };
}

function bodyHtml() {
    const part = _work[_tab], tab = TAB[_tab], fx = effect(_tab);
    const used = new Set(STATUS_OVERRIDE_TARGETS.flatMap(t => _work[t.key].statuses.map(norm)));
    const known = knownStatuses();
    const suggest = known.filter(s => !used.has(s.k)).slice(0, 14);
    const teams = [...new Set([...(store.get('teams') || []), ...part.exceptTeams])].sort((a, b) => a.localeCompare(b, 'fr'));
    const exempt = new Set(part.exceptTeams.map(norm));
    const tabs = STATUS_OVERRIDE_TARGETS.map(t => `<button type="button" role="tab" class="dov-tab" data-dov-tab="${t.key}" aria-selected="${t.key === _tab}">${t.icon} ${esc(t.label)} <small>${_work[t.key].statuses.length}</small></button>`).join('');
    return `
        <div class="dov-tabs" role="tablist" aria-label="Colonne cible">${tabs}</div>
        <p class="dov-tab-help">${tab.icon} <b>${esc(tab.label)}</b> — ${esc(HELP[_tab])}</p>
        ${_note ? `<p class="dov-note" role="status">${esc(_note)}</p>` : ''}
        <div class="dov-body">
            <div class="dov-col">
                <h4>Statuts JIRA → ${esc(tab.label)} <small>${part.statuses.length}</small></h4>
                <ul class="dov-list" data-tone="${_tab}">${part.statuses.map((s, i) => `<li><span>${esc(s)}</span><small title="tickets dans ce statut (hors équipes exemptées)">${fx.per.get(norm(s)) || 0}${fx.gainPer.get(norm(s)) ? ` <em class="dov-gain" title="dont ${fx.gainPer.get(norm(s))} que la règle fait changer de colonne">+${fx.gainPer.get(norm(s))}</em>` : ''}</small><button type="button" class="dov-x" data-dov-del="${i}" aria-label="Retirer ${esc(s)}">✕</button></li>`).join('') || `<li class="dov-empty">Aucun statut forcé en ${esc(tab.label)} : le board de chaque équipe décide.</li>`}</ul>
                <div class="dov-add">
                    <input type="text" class="input" id="dov-new" list="dov-known" placeholder="Ajouter un statut JIRA…" maxlength="80" autocomplete="off">
                    <datalist id="dov-known">${known.filter(s => !used.has(s.k)).map(s => `<option value="${esc(s.label)}">`).join('')}</datalist>
                    <button type="button" class="btn btn-secondary btn-sm" data-dov-add>Ajouter</button>
                </div>
                ${suggest.length ? `<div class="dov-suggest"><small>Statuts rencontrés :</small>${suggest.map(s => `<button type="button" class="chip dov-chip" data-dov-pick="${esc(s.label)}" title="${s.n} tickets dans ce statut">+ ${esc(s.label)} <b>${s.n}</b></button>`).join('')}</div>` : ''}
            </div>
            <div class="dov-col">
                <h4>Équipes exemptées <small>${part.exceptTeams.length}</small></h4>
                <p class="dov-help">Pour la colonne ${esc(tab.label)}, elles gardent le rangement de leur board JIRA (ex. Fuego : la recette reste en Test).</p>
                <div class="dov-teams">${teams.map(t => `<button type="button" class="dov-team" data-dov-team="${esc(t)}" aria-pressed="${exempt.has(norm(t))}">${exempt.has(norm(t)) ? '🛡️ ' : ''}${esc(t)}</button>`).join('')}</div>
            </div>
        </div>
        <p class="dov-preview" data-tone="${_tab}" aria-live="polite">${fx.gain
            ? `Effet : <b>+${fx.gain} ticket${fx.gain > 1 ? 's' : ''}</b> passe${fx.gain > 1 ? 'nt' : ''} en ${esc(tab.label)} grâce à cet onglet (leur board les rangeait ailleurs) · ${fx.teams.length} équipe${fx.teams.length > 1 ? 's' : ''} : ${esc(fx.teams.slice(0, 8).join(', '))}${fx.teams.length > 8 ? '…' : ''}`
            : `Effet : aucun ticket ne change de colonne — ces statuts sont déjà rangés en ${esc(tab.label)} par les boards.`}</p>`;
}

/** HTML du bloc — à interpoler dans la section JIRA. */
export function statusOverrideHtml() {
    _work = overrideRules();
    _note = '';
    const custom = isCustomOverride();
    const defaults = STATUS_OVERRIDE_TARGETS.map(t => `${t.label} : ${STATUS_OVERRIDE_DEFAULTS[t.key].statuses.length} statut(s)`).join(' · ');
    return `
        <div class="sync-cfg-block mt-4 dov" id="dov">
            <div class="sync-cfg-title">🎯 Statuts forcés dans une colonne <span class="dov-badge${custom ? ' is-custom' : ''}">${custom ? 'Réglage enregistré' : 'Valeurs par défaut'}</span></div>
            <div class="sync-cfg-hint">Pour toutes les équipes <strong>sauf les exemptées</strong>, les statuts JIRA d'un onglet rangent le ticket dans sa colonne — <strong>Terminé</strong>, <strong>En cours</strong> ou <strong>À faire</strong> — quoi qu'en dise le board. Un statut ne figure que dans un onglet. Réglage <strong>partagé</strong> (en base) : il vaut pour tous les navigateurs et l'écran TV. Effet immédiat à l'affichage ; dates de début / fin et cycle times recalculés à la prochaine <strong>synchro complète</strong>.</div>
            <div id="dov-dyn">${bodyHtml()}</div>
            <div class="sync-cfg-actions">
                <button type="button" class="btn btn-primary btn-sm" data-dov-save>Enregistrer</button>
                <button type="button" class="btn btn-ghost btn-sm" data-dov-reset title="${esc(defaults)}">Rétablir les valeurs par défaut</button>
            </div>
        </div>`;
}

/** Câble le bloc. `onReload` : re-rendu de la page Paramètres après enregistrement. */
export function wireStatusOverride(container, onReload = () => {}) {
    const root = container.querySelector('#dov');
    if (!root) return;
    const redraw = () => { root.querySelector('#dov-dyn').innerHTML = bodyHtml(); _note = ''; };
    const add = label => {
        const typed = String(label || '').trim().slice(0, 80);
        // Statut connu (même aux accents / à la casse près) : on garde le libellé JIRA exact.
        const v = knownStatuses().find(s => s.k === norm(typed))?.label || typed;
        if (!v || _work[_tab].statuses.some(s => norm(s) === norm(v))) return;
        // Un statut ne vit que dans un onglet : l'ajouter ici le retire d'ailleurs (et le dit).
        for (const t of STATUS_OVERRIDE_TARGETS) {
            if (t.key === _tab) continue;
            const i = _work[t.key].statuses.findIndex(s => norm(s) === norm(v));
            if (i >= 0) { _work[t.key].statuses.splice(i, 1); _note = `« ${v} » retiré de ${t.label} et placé en ${TAB[_tab].label}.`; }
        }
        _work[_tab].statuses.push(v);
        redraw();
        root.querySelector('#dov-new')?.focus();
    };
    const save = async (payload, msg) => {
        try {
            const res = await api.setStatusOverride(payload);
            store.set('piInfo', { ...(store.get('piInfo') || {}), statusOverride: res?.statusOverride || {} });
            await window.__squadBoard?.reloadData?.();   // tickets relus : la règle s'applique tout de suite
            _work = overrideRules();
            const moved = STATUS_OVERRIDE_TARGETS.map(t => [t, effect(t.key).gain]).filter(([, n]) => n);
            toast(`${msg}${moved.length ? ` — ${moved.map(([t, n]) => `+${n} en ${t.label}`).join(', ')}` : ''}. Synchro complète pour recalculer dates et cycle times.`, 'success', 6000);
            onReload();
        } catch (e) {
            toast(`Enregistrement impossible : ${e.message || e}`, 'error');
        }
    };
    root.addEventListener('click', e => {
        const tab = e.target.closest('[data-dov-tab]');
        if (tab) { _tab = tab.dataset.dovTab; redraw(); root.querySelector(`[data-dov-tab="${_tab}"]`)?.focus(); return; }
        const del = e.target.closest('[data-dov-del]');
        if (del) { _work[_tab].statuses.splice(+del.dataset.dovDel, 1); redraw(); return; }
        const pick = e.target.closest('[data-dov-pick]');
        if (pick) { add(pick.dataset.dovPick); return; }
        if (e.target.closest('[data-dov-add]')) { add(root.querySelector('#dov-new')?.value); return; }
        const team = e.target.closest('[data-dov-team]');
        if (team) {
            const list = _work[_tab].exceptTeams, t = team.dataset.dovTeam, i = list.findIndex(x => norm(x) === norm(t));
            if (i >= 0) list.splice(i, 1); else list.push(t);
            redraw();
            return;
        }
        if (e.target.closest('[data-dov-save]')) {
            if (!STATUS_OVERRIDE_TARGETS.some(t => _work[t.key].statuses.length)) { toast('Ajoutez au moins un statut (ou « Rétablir les valeurs par défaut »).', 'warning'); return; }
            save(_work, 'Règle enregistrée');
            return;
        }
        if (e.target.closest('[data-dov-reset]')) save({}, 'Valeurs par défaut rétablies');
    });
    root.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.id === 'dov-new') { e.preventDefault(); add(e.target.value); }
        // Onglets au clavier : ← → passent d'une colonne à l'autre
        if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.dataset?.dovTab) {
            const keys = STATUS_OVERRIDE_TARGETS.map(t => t.key), i = keys.indexOf(_tab);
            _tab = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
            redraw();
            root.querySelector(`[data-dov-tab="${_tab}"]`)?.focus();
        }
    });
}
