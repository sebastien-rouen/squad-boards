/**
 * Paramètres → « Vue d'ensemble » (3.283.0) — page d'arrivée de `#settings` : l'état de chaque domaine en une ligne,
 * ✅ configuré · ⚠️ à faire · · facultatif, cliquable vers son onglet. Lecture seule : chaque état relit la source
 * déjà utilisée par l'onglet (store, réglages de projet) — aucun calcul propre ici.
 * Contrat de section : `overviewSectionHtml(ctx)` + `wireOverviewSection(container)`.
 */

import { store } from '../state.js';
import { esc, getCurrentPi, currentSupportRows, lastKnownAbsenceDate } from '../utils.js';
import { projectName, APP_NAME } from '../utils/identity.js';
import { holidayConfig, HOLIDAY_COUNTRIES } from '../utils/holidays.js';
import { readUnmapped } from '../utils/jira-mapping.js';
import { isModuleOn, modulesConfig } from '../utils/modules.js';
import { SETTINGS_NAV, NAV_BY_SLUG } from './settings-nav.js';

const OK = 'ok', TODO = 'todo', OPT = 'opt';
const _fmt = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const _plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Une ligne par onglet qui a un état à dire : [slug, niveau, texte]. */
function _checks(ctx) {
    const pi = ctx.piInfo || {};
    const out = {};
    const name = projectName();
    out['identite-du-projet'] = name !== APP_NAME ? [OK, name] : [OPT, 'nom par défaut « Squad Board »'];
    const off = modulesConfig().off.length;
    out['modules-menu'] = [OK, off ? `${_plural(off, 'module')} masqué${off > 1 ? 's' : ''}` : 'toutes les vues actives'];
    out['sprint-pi'] = pi.startDate
        ? [OK, `PI ${getCurrentPi({ sprintInfo: ctx.sprintInfo, piInfo: pi }) || pi.number || '?'} · sprints de ${pi.sprintDuration || 14} j · ${pi.sprintsPerPI || '?'} par PI`]
        : [TODO, 'date de début du PI à saisir (ou synchro JIRA)'];
    const hc = holidayConfig();
    out['calendrier-de-travail'] = [OK, `fériés : ${HOLIDAY_COUNTRIES.find(c => c.key === hc.country)?.label || hc.country}${hc.closures.size ? ` · ${_plural(hc.closures.size, 'fermeture')}` : ''}`];

    out['lignes-produit-groupes'] = ctx.groups.length ? [OK, _plural(ctx.groups.length, 'ligne')] : [OPT, 'aucune — utile au-delà de 3 équipes'];
    out.equipes = ctx.teamNames.length ? [OK, _plural(ctx.teamNames.length, 'équipe')] : [TODO, 'aucune équipe'];
    out.membres = ctx.members.length ? [OK, _plural(ctx.members.length, 'personne')] : [TODO, 'aucun membre (saisie, CSV ou import RH)'];
    const roles = [...new Set(ctx.members.map(m => m.role).filter(Boolean))];
    const unweighted = roles.filter(r => !(r in (pi.roleCapacity || {})));
    out['cap-roles'] = !roles.length ? [OPT, 'pas encore de rôles connus']
        : unweighted.length ? [TODO, `${_plural(unweighted.length, 'rôle')} compté${unweighted.length > 1 ? 's' : ''} à 100 % par défaut : ${unweighted.slice(0, 3).join(', ')}${unweighted.length > 3 ? '…' : ''}`]
            : [OK, `${_plural(roles.length, 'rôle')} pondéré${roles.length > 1 ? 's' : ''}`];
    const last = lastKnownAbsenceDate(ctx.absences);
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    out['absences-conges'] = !ctx.absences.length ? [TODO, 'aucun congé importé — la capacité suppose tout le monde présent']
        : last && last < soon ? [TODO, `congés connus jusqu'au ${_fmt(last)} seulement — réimporter l'export RH`]
            : [OK, `${_plural(ctx.absences.length, 'absence')}${last ? ` · jusqu'au ${_fmt(last)}` : ''}`];

    if (isModuleOn('support')) {
        const now = currentSupportRows(ctx.support).length;
        out.rotation = now ? [OK, `${_plural(now, 'équipe')} d'astreinte cette semaine`] : [TODO, 'personne d\'astreinte cette semaine'];
    }
    const jira = store.get('jiraEnv') || {};
    const synced = ctx.sprintInfo?.updatedAt;
    out['plugin-jira-optionnel'] = !jira.tokenSet ? [OPT, 'non connecté — le board fonctionne sans']
        : [OK, `connecté (${jira.source === 'env' ? '.env' : 'compte partagé'})${synced ? ` · synchro du ${_fmt(synced)}` : ' · jamais synchronisé'}`];
    const um = Object.keys(readUnmapped().statuses).length;
    if (jira.tokenSet && um) out['plugin-jira-optionnel'] = [TODO, `${_plural(um, 'statut')} JIRA non classé${um > 1 ? 's' : ''} (onglet 🗂️ Correspondance)`];
    out['calendriers-ics'] = ctx.calendars.length ? [OK, _plural(ctx.calendars.length, 'agenda')] : [OPT, 'aucun agenda branché'];
    out['slack-optionnel'] = store.get('slackConfigured') ? [OK, 'webhook enregistré'] : [OPT, 'non branché'];
    return out;
}

export function overviewSectionHtml(ctx) {
    const checks = _checks(ctx);
    const todo = Object.values(checks).filter(c => c[0] === TODO).length;
    const groups = SETTINGS_NAV.map(g => {
        const rows = g.items.filter(it => checks[it.slug]).map(it => {
            const [lvl, txt] = checks[it.slug];
            return `<a class="stg-ov-row stg-ov-row--${lvl}" href="#settings/${it.slug}" data-stg-go="${it.slug}">
                <span class="stg-ov-ico" aria-hidden="true">${it.icon}</span>
                <span class="stg-ov-name">${esc(it.label)}</span>
                <span class="stg-ov-state" aria-label="${lvl === OK ? 'configuré' : lvl === TODO ? 'à faire' : 'facultatif'}">${lvl === OK ? '✅' : lvl === TODO ? '⚠️' : '·'}</span>
                <span class="stg-ov-txt">${esc(txt)}</span></a>`;
        }).join('');
        return rows ? `<div class="stg-ov-group"><h4>${g.icon} ${esc(g.group)}</h4>${rows}</div>` : '';
    }).join('');
    return `
        <div class="settings-section" id="section-vue-d-ensemble">
            <div class="settings-section-header"><div><h3>Vue d'ensemble</h3>
                <p>${todo ? `${_plural(todo, 'point')} à compléter` : 'Tout est en place'} — clique une ligne pour ouvrir son réglage</p></div></div>
            <div class="settings-section-body">
                <div class="stg-ov-head">
                    <button type="button" class="btn btn-secondary btn-sm" id="stg-ov-wizard">🧭 Assistant de mise en route</button>
                </div>
                <div class="stg-ov-grid">${groups}</div>
            </div>
        </div>`;
}

/** @param {(slug: string) => void} goTab bascule d'onglet (posée par la coquille) */
export function wireOverviewSection(container, goTab) {
    const root = container.querySelector('#section-vue-d-ensemble');
    if (!root) return;
    root.addEventListener('click', async e => {
        const row = e.target.closest('[data-stg-go]');
        if (row && NAV_BY_SLUG[row.dataset.stgGo]) { e.preventDefault(); goTab(row.dataset.stgGo); return; }
        if (e.target.closest('#stg-ov-wizard')) (await import('../components/setup_wizard.js')).openSetupWizard();
    });
}
