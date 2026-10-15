/**
 * Paramètres → Absences → « Correspondances JIRA ↔ Congés ».
 *
 * Les congés (import RH, « NOM, Prénom ») sont rapprochés automatiquement des noms JIRA
 * (« Prénom Nom ») par `findPerson` (utils/person-name.js). Ce qui reste introuvable — pseudo
 * JIRA (« Arnaud m »), nom d'usage, prénom composé — s'associe ici, À LA MAIN, une fois pour
 * toute l'équipe : `piInfo.personAliases` en base (PUT /api/pi/person-alias, fusion clé par clé).
 * Sert partout où l'on croise JIRA et les congés (modale ticket : présence du leader, etc.).
 *
 * Même découpage que settings-jira.js : HTML + câblage, rafraîchissement injecté (`onReload`) —
 * importer `reloadAndRender` depuis settings.js créerait un cycle.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, findPerson, personKey, isBotName } from '../utils.js';

/** Fenêtre des tickets dont on cherche les personnes : en cours, ou touchés depuis 6 mois. */
const _RECENT_MS = 183 * 86_400_000;

/** Personnes JIRA (leader, rapporteur, contributeurs) des tickets récents → nb de tickets. */
function _jiraPeople() {
    const since = Date.now() - _RECENT_MS;
    const count = new Map();
    for (const t of store.get('tickets') || []) {
        const recent = t.status !== 'done' || Date.parse(t.updatedAt || '') >= since;
        if (!recent) continue;
        for (const n of new Set([t.leader || t.assignee, t.reporter, ...(t.contributors || [])])) {
            if (n && !isBotName(n)) count.set(n, (count.get(n) || 0) + 1);
        }
    }
    return count;
}

/** Noms RH les plus proches d'abord (mots en commun, puis début de mot commun). */
function _suggestions(name, rhNames) {
    const toks = personKey(name).split(' ').filter(t => t.length >= 2);
    const score = rh => {
        const r = personKey(rh).split(' ');
        return toks.reduce((s, t) => s + (r.includes(t) ? 3 : r.some(x => x.startsWith(t) || t.startsWith(x)) ? 1 : 0), 0);
    };
    const ranked = rhNames.map(rh => ({ rh, s: score(rh) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    // Présélection seulement si UN seul nom partage un mot entier (score max ≥ 3, sans ex-aequo) :
    // « Elsa » face à trois « …, Elsa » ne présélectionne rien. L'association reste un clic explicite.
    const best = ranked[0] && ranked[0].s >= 3 && (!ranked[1] || ranked[1].s < ranked[0].s) ? ranked[0].rh : '';
    return { list: ranked.slice(0, 5).map(x => x.rh), best };
}

/** Modèle de la carte : à rapprocher (non trouvés, sans correspondance) + correspondances saisies. */
export function personAliasesModel() {
    const aliases = store.get('piInfo')?.personAliases || {};
    const rhNames = [...new Set((store.get('absences') || []).map(a => a.memberName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const todo = [...(_jiraPeople())]
        .filter(([n]) => !Object.prototype.hasOwnProperty.call(aliases, n) && !findPerson(n, rhNames))
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => { const sg = _suggestions(name, rhNames); return { name, n, suggestions: sg.list, best: sg.best }; });
    const saved = Object.entries(aliases).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
    return { todo, saved, rhNames };
}

export function personAliasesHtml() {
    const { todo, saved, rhNames } = personAliasesModel();
    if (!rhNames.length) return '';
    const opts = (m) => `<option value="">— choisir le nom dans les Congés —</option>
        ${m.suggestions.length ? `<optgroup label="Suggestions">${m.suggestions.map(r => `<option value="${esc(r)}"${r === m.best ? ' selected' : ''}>${esc(r)}</option>`).join('')}</optgroup>` : ''}
        <optgroup label="Tous (${rhNames.length})">${rhNames.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</optgroup>`;
    return `
    <details class="abs-list-details pa-card" id="pa-card"${todo.length ? ' open' : ''}>
        <summary class="abs-list-summary">
            <span class="abs-list-summary-label">🔗 Correspondances JIRA ↔ Congés</span>
            <span class="abs-list-summary-count${todo.length ? ' pa-count--todo' : ''}">${todo.length ? `${todo.length} à rapprocher` : 'tout est rapproché ✓'}${saved.length ? ` · ${saved.length} saisie${saved.length > 1 ? 's' : ''}` : ''}</span>
        </summary>
        <div class="abs-list-body">
            <p class="pa-help">Les congés sont retrouvés automatiquement depuis le nom JIRA (« Prénom Nom » ↔ « NOM, Prénom »).
                Associez ici ceux qui restent introuvables — pseudo, nom d'usage… — pour afficher leur présence
                (modale ticket) : c'est enregistré pour toute l'équipe.</p>
            ${todo.length ? `<table class="pa-table">
                <thead><tr><th>Nom dans JIRA</th><th>Nom dans les Congés</th><th></th></tr></thead>
                <tbody>${todo.map(m => `<tr data-pa-jira="${esc(m.name)}">
                    <td><b>${esc(m.name)}</b> <small class="text-muted">${m.n} ticket${m.n > 1 ? 's' : ''}</small></td>
                    <td><select class="select select-sm pa-select">${opts(m)}</select></td>
                    <td class="pa-actions">
                        <button type="button" class="btn btn-primary btn-sm" data-pa-save>Associer</button>
                        <button type="button" class="btn btn-ghost btn-sm" data-pa-none title="Cette personne n'est pas dans l'import Congés (prestataire, compte externe…) : ne plus la proposer">Pas dans l'import</button>
                    </td>
                </tr>`).join('')}</tbody>
            </table>` : '<p class="pa-empty">✓ Toutes les personnes des tickets récents sont rapprochées de l\'import Congés.</p>'}
            ${saved.length ? `<div class="pa-saved">
                <span class="pa-saved-title">Correspondances enregistrées</span>
                ${saved.map(([jira, rh]) => `<span class="chip pa-chip${rh ? '' : ' pa-chip--none'}" data-pa-jira="${esc(jira)}">
                    ${esc(jira)} <span aria-hidden="true">→</span> ${rh ? esc(rh) : '<i>pas dans l\'import</i>'}
                    <button type="button" class="label-rm" data-pa-del title="Supprimer cette correspondance">×</button>
                </span>`).join('')}
            </div>` : ''}
        </div>
    </details>`;
}

export function wirePersonAliases(container, onReload) {
    const card = container.querySelector('#pa-card');
    if (!card) return;
    const save = async (jira, rh, msg) => {
        try {
            const res = await api.setPersonAlias(jira, rh);
            const pi = store.get('piInfo');
            if (pi) pi.personAliases = res.personAliases || {};
            toast(msg, 'success');
            await onReload?.();
        } catch (e) { toast(e.message, 'error'); }
    };
    card.addEventListener('click', e => {
        const row = e.target.closest('[data-pa-jira]');
        if (!row) return;
        const jira = row.dataset.paJira;
        if (e.target.closest('[data-pa-save]')) {
            const rh = row.querySelector('.pa-select')?.value;
            if (!rh) { toast('Choisissez le nom correspondant dans les Congés', 'warning'); return; }
            save(jira, rh, `${jira} → ${rh}`);
        } else if (e.target.closest('[data-pa-none]')) {
            save(jira, '', `${jira} : marqué « pas dans l'import »`);
        } else if (e.target.closest('[data-pa-del]')) {
            save(jira, null, `Correspondance de ${jira} supprimée`);
        }
    });
}
