/**
 * Paramètres → JIRA → « 🗂️ Correspondance » (3.268.0) : dans quelle colonne va chaque STATUT JIRA, dans quel
 * type chaque TYPE JIRA — propre au projet, sans toucher au code (utils/jira-mapping.js).
 *
 *   ⚠️ À ranger  : libellés qu'aucune source n'a su ranger à la dernière synchro (avant : « À faire » en silence).
 *   Statuts vus  : tous les statuts JIRA présents dans les tickets, avec leur colonne actuelle — modifiable.
 *   Du projet    : les correspondances saisies, retirables (retour à la carte générique / au board).
 *   Équipes      : alias « nom JIRA (board, sprint, Team[Team]) → équipe » quand le nommage échappe aux règles
 *                  automatiques d'`extractTeam` (3.277.0).
 * Réglage PARTAGÉ (réglages de projet) ; un statut s'applique tout de suite, un type à la prochaine synchro.
 */

import { store } from '../state.js';
import { esc } from '../utils.js';
import { STATUS_LABELS, TYPE_LABELS, STATUS_ORDER } from '../config.js';
import { forcedStatus } from '../utils/status-override.js';
import { customStatusMap, customTypeMap, setCustomMapping, readUnmapped, normLabel, STATUS_KEYS, TYPE_KEYS, teamAliases, setTeamAlias } from '../utils/jira-mapping.js';

let _query = '';

const _select = (kind, label, cur, { placeholder = '— à ranger —' } = {}) => {
    const keys = kind === 'type' ? TYPE_KEYS : STATUS_KEYS, labels = kind === 'type' ? TYPE_LABELS : STATUS_LABELS;
    return `<select class="input input-sm jmap-sel" data-jmap="${kind}" data-label="${esc(label)}" aria-label="${esc(`Ranger « ${label} »`)}">
        <option value="">${placeholder}</option>${keys.map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(labels[k] || k)}</option>`).join('')}</select>`;
};

/** Statuts JIRA des tickets en mémoire : libellé exact → { n, cols: Set(colonne actuelle) }. */
function _seenStatuses() {
    const seen = new Map();
    for (const t of store.get('tickets') || []) {
        if (!t.jiraStatus) continue;
        const e = seen.get(t.jiraStatus) || { n: 0, cols: new Set() };
        e.n++;
        e.cols.add(t.status);
        seen.set(t.jiraStatus, e);
    }
    return seen;
}

function _bodyHtml() {
    const unmapped = readUnmapped();
    const sMap = customStatusMap(), tMap = customTypeMap();
    const todo = [...Object.entries(unmapped.statuses).map(([l, n]) => ['status', l, n]), ...Object.entries(unmapped.types).map(([l, n]) => ['type', l, n])];
    const q = normLabel(_query);
    const seen = [..._seenStatuses()].filter(([l]) => !q || normLabel(l).includes(q))
        .sort((a, b) => STATUS_ORDER.indexOf([...a[1].cols][0]) - STATUS_ORDER.indexOf([...b[1].cols][0]) || a[0].localeCompare(b[0], 'fr'));
    const custom = [...Object.entries(sMap).map(([l, k]) => ['status', l, k]), ...Object.entries(tMap).map(([l, k]) => ['type', l, k])];
    const when = unmapped.at ? new Date(unmapped.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null;
    return `
        <h4 class="jmap-h">⚠️ À ranger${todo.length ? ` <span class="jmap-count">${todo.length}</span>` : ''}</h4>
        ${todo.length
            ? `<p class="sync-cfg-hint">Vus à la synchro${when ? ` du ${esc(when)}` : ''}, connus ni du board JIRA ni de la carte générique : ils tombaient en « ${esc(STATUS_LABELS.todo)} » / « ${esc(TYPE_LABELS.task)} » sans le dire.</p>
               <div class="jmap-list">${todo.map(([kind, l, n]) => `<div class="jmap-row is-todo"><span class="jmap-kind">${kind === 'type' ? 'Type' : 'Statut'}</span><b class="jmap-label">${esc(l)}</b><small>${n} ticket${n > 1 ? 's' : ''}</small>${_select(kind, l, '')}</div>`).join('')}</div>`
            : `<p class="sync-cfg-hint">✅ Rien à ranger${when ? ` à la synchro du ${esc(when)}` : ' (la liste se remplit à la prochaine synchro)'}.</p>`}

        <h4 class="jmap-h">Statuts vus dans les tickets</h4>
        <p class="sync-cfg-hint">Colonne actuelle de chaque statut JIRA. La changer s'applique tout de suite, à toutes les équipes (un <strong>statut forcé</strong> garde la priorité).</p>
        <input class="input input-sm jmap-q" type="search" placeholder="🔍 Filtrer les statuts…" value="${esc(_query)}" data-jmap-q aria-label="Filtrer les statuts">
        <div class="jmap-list">${seen.map(([l, e]) => {
            const own = sMap[normLabel(l)];
            const cur = own || (e.cols.size === 1 ? [...e.cols][0] : '');
            // Statut forcé (onglet 🎯) : il prime, la correspondance ne vaut que pour les équipes exemptées
            const forced = forcedStatus('', l);
            return `<div class="jmap-row${own ? ' is-own' : ''}"><b class="jmap-label">${esc(l)}</b><small>${e.n} ticket${e.n > 1 ? 's' : ''}${e.cols.size > 1 ? ` · ${e.cols.size} colonnes selon le board` : ''}${forced ? ` · <span title="Statut forcé en « ${esc(STATUS_LABELS[forced] || forced)} » (onglet 🎯) : il prime sauf pour les équipes exemptées">🎯 forcé</span>` : ''}</small>${_select('status', l, cur, { placeholder: e.cols.size > 1 ? '— selon le board —' : '— à ranger —' })}</div>`;
        }).join('') || '<p class="sync-cfg-hint">Aucun ticket avec un statut JIRA (synchronise d\'abord).</p>'}</div>

        <h4 class="jmap-h">Correspondances du projet${custom.length ? ` <span class="jmap-count">${custom.length}</span>` : ''}</h4>
        ${custom.length
            ? `<div class="jmap-list">${custom.map(([kind, l, k]) => `<div class="jmap-row is-own"><span class="jmap-kind">${kind === 'type' ? 'Type' : 'Statut'}</span><b class="jmap-label">${esc(l)}</b><small>→ ${esc((kind === 'type' ? TYPE_LABELS : STATUS_LABELS)[k] || k)}</small><button type="button" class="btn btn-ghost btn-xs" data-jmap-del="${kind}" data-label="${esc(l)}" aria-label="${esc(`Retirer la correspondance de « ${l} »`)}">✕ Retirer</button></div>`).join('')}</div>`
            : '<p class="sync-cfg-hint">Aucune : la carte générique et les colonnes des boards JIRA suffisent.</p>'}
        <form class="jmap-add" data-jmap-add>
            <select class="input input-sm" name="kind" aria-label="Statut ou type"><option value="status">Statut</option><option value="type">Type</option></select>
            <input class="input input-sm" name="label" placeholder="Libellé JIRA exact (ex. « Recette client »)" maxlength="80" required aria-label="Libellé JIRA">
            <select class="input input-sm" name="value" aria-label="Rangé en">${STATUS_KEYS.map(k => `<option value="${k}">${esc(STATUS_LABELS[k])}</option>`).join('')}</select>
            <button type="submit" class="btn btn-secondary btn-sm">Ajouter</button>
        </form>
        ${_teamsHtml()}`;
}

/** 👥 Noms d'équipe : alias explicites, avant les règles automatiques (« Sprint X », « X - Ité 31.2 »…). */
function _teamsHtml() {
    const aliases = Object.entries(teamAliases());
    const teams = store.get('teams') || [];
    return `<h4 class="jmap-h">👥 Noms d'équipe${aliases.length ? ` <span class="jmap-count">${aliases.length}</span>` : ''}</h4>
        <p class="sync-cfg-hint">Un board, un sprint ou un champ Team[Team] nommé autrement que l'équipe (« Squad Paiement 2024 », « PAY-Ops ») ? Donne son nom JIRA exact et l'équipe visée. Pris en compte à la prochaine synchro ; les absences RH le suivent tout de suite.</p>
        ${aliases.length ? `<div class="jmap-list">${aliases.map(([raw, t]) => `<div class="jmap-row is-own"><span class="jmap-kind">JIRA</span><b class="jmap-label">${esc(raw)}</b><small>→ ${esc(t)}</small><button type="button" class="btn btn-ghost btn-xs" data-jmap-team-del="${esc(raw)}" aria-label="${esc(`Retirer l'alias « ${raw} »`)}">✕ Retirer</button></div>`).join('')}</div>` : ''}
        <form class="jmap-add" data-jmap-team-add>
            <input class="input input-sm" name="raw" placeholder="Nom JIRA exact (ex. « Squad Paiement 2024 »)" maxlength="80" required aria-label="Nom JIRA">
            <input class="input input-sm" name="team" list="jmap-teams" placeholder="Équipe" maxlength="60" required aria-label="Équipe">
            <datalist id="jmap-teams">${teams.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
            <button type="submit" class="btn btn-secondary btn-sm">Ajouter</button>
        </form>`;
}

/** HTML de l'onglet — à interpoler dans la section JIRA. */
export function jiraMappingHtml() {
    return `<div class="sync-cfg-block mt-4 jmap" id="jmap">
        <div class="sync-cfg-title">🗂️ Correspondance des statuts et types JIRA</div>
        <div class="sync-cfg-hint">Ordre de décision : statut forcé → <strong>correspondance du projet</strong> → colonne du board JIRA → carte générique. Réglage partagé par tous les postes.</div>
        <div id="jmap-dyn">${_bodyHtml()}</div></div>`;
}

export function wireJiraMapping(container) {
    const root = container.querySelector('#jmap');
    if (!root) return;
    const redraw = () => {
        const focusQ = document.activeElement?.matches?.('[data-jmap-q]');
        root.querySelector('#jmap-dyn').innerHTML = _bodyHtml();
        if (focusQ) { const q = root.querySelector('[data-jmap-q]'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    };
    root.addEventListener('change', e => {
        const s = e.target.closest('[data-jmap]');
        if (!s) return;
        setCustomMapping(s.dataset.jmap, s.dataset.label, s.value);
        redraw();
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-jmap-q]')) { _query = e.target.value; redraw(); } });
    root.addEventListener('click', e => {
        const d = e.target.closest('[data-jmap-del]');
        if (d) { setCustomMapping(d.dataset.jmapDel, d.dataset.label, ''); redraw(); return; }
        const td = e.target.closest('[data-jmap-team-del]');
        if (td) { setTeamAlias(td.dataset.jmapTeamDel, ''); redraw(); }
    });
    root.addEventListener('submit', e => {
        if (e.target.matches('[data-jmap-team-add]')) {
            e.preventDefault();
            setTeamAlias(e.target.elements.raw.value, e.target.elements.team.value);
            redraw();
            return;
        }
        if (!e.target.matches('[data-jmap-add]')) return;
        e.preventDefault();
        const fd = new FormData(e.target);
        const label = String(fd.get('label') || '').trim();
        if (!label) return;
        setCustomMapping(fd.get('kind'), label, String(fd.get('value')));
        redraw();
    });
    // Le menu « Rangé en » du formulaire suit le choix Statut / Type
    root.addEventListener('change', e => {
        if (e.target.name !== 'kind') return;
        const sel = e.target.form.elements.value;
        const keys = e.target.value === 'type' ? TYPE_KEYS : STATUS_KEYS, labels = e.target.value === 'type' ? TYPE_LABELS : STATUS_LABELS;
        sel.innerHTML = keys.map(k => `<option value="${k}">${esc(labels[k] || k)}</option>`).join('');
    });
}
