/**
 * Carte « Tickets bloqués ou stagnants » du Dashboard (3.239.0, sortie de dashboard.js et restylée).
 *
 * Deux groupes — 🚫 bloqués, puis 🐌 stagnants (même état depuis ≥ seuil) — triés du plus ancien au plus récent.
 * Chaque ligne : clé + titre, puis statut JIRA · porteur (avatar) ; à droite l'âge et une jauge relative au plus
 * ancien. Liseré : rouge = bloqué ou ≥ 14 j, ambre = au-delà du seuil. Les lignes gardent `.stuck-row` +
 * `data-ticket` (clic → modale, câblé par dashboard.js) ; le seuil reste l'input `#stuck-stale-days`.
 */
import { esc, initials, hashColor, emptyStateHtml } from '../utils.js';
import { helpIconHtml } from './help_popover.js';

const _STATUS = { todo: 'À faire', inprog: 'En cours', review: 'Revue', test: 'Test', blocked: 'Bloqué', done: 'Terminé' };
const _PREVIEW = 8;
const _OLD = 14;   // au-delà : rouge, quel que soit le seuil

function _rowHtml({ t, stag }, maxAge, staleDays) {
    const sev = t.status === 'blocked' || (stag != null && stag >= _OLD) ? 'crit' : stag != null && stag >= staleDays ? 'warn' : 'info';
    const state = t.jiraStatus || _STATUS[t.status] || t.status;
    const lead = t.leader || '';
    const pct = stag == null || !maxAge ? 0 : Math.max(6, Math.round(stag / maxAge * 100));
    return `<button type="button" class="stuck-row stk-row stk-row--${sev}" data-ticket="${esc(t.id)}" title="Ouvrir ${esc(t.id)} — ${esc(state)}">
        <span class="stk-main">
            <span class="stk-line"><span class="stk-id">${esc(t.id)}</span><span class="stk-title">${esc(t.title || '')}</span></span>
            <span class="stk-meta">
                <span class="stuck-state stuck-state--${esc(t.status)}">${esc(state)}</span>
                ${lead ? `<span class="stk-lead"><span class="stk-av" style="--av:${hashColor(lead)}" aria-hidden="true">${esc(initials(lead))}</span>${esc(lead)}</span>`
                    : '<span class="stk-lead stk-lead--none">Non assigné</span>'}
            </span>
        </span>
        <span class="stk-age" title="${esc(stag == null ? 'Ancienneté inconnue (pas de date de mise en cours)' : `En l'état depuis ${stag} jour${stag > 1 ? 's' : ''}`)}">
            <b>${stag == null ? '—' : `${stag}<small> j</small>`}</b>
            <span class="stk-age-bar" aria-hidden="true"><i style="--p:${pct}%"></i></span>
        </span>
    </button>`;
}

function _groupHtml(key, icon, label, items, maxAge, staleDays) {
    if (!items.length) return '';
    const head = items.slice(0, _PREVIEW), rest = items.slice(_PREVIEW);
    return `<section class="stk-group stk-group--${key}">
        <h4 class="stk-group-title"><span aria-hidden="true">${icon}</span> ${esc(label)} <span class="stk-count">${items.length}</span></h4>
        <div class="stk-list">${head.map(x => _rowHtml(x, maxAge, staleDays)).join('')}</div>
        ${rest.length ? `<details class="stk-more"><summary>Voir les ${rest.length} autres</summary>
            <div class="stk-list">${rest.map(x => _rowHtml(x, maxAge, staleDays)).join('')}</div></details>` : ''}
    </section>`;
}

/**
 * @param {object} o
 * @param {{ t: object, stag: number|null }[]} o.items  tickets non terminés bloqués OU stagnants (non tronqués)
 * @param {number} o.staleDays  seuil de stagnation (jours)
 */
export function stuckCardHtml({ items = [], staleDays = 5 }) {
    const byAge = (a, b) => (b.stag ?? -1) - (a.stag ?? -1);
    const blocked = items.filter(x => x.t.status === 'blocked').sort(byAge);
    const stale = items.filter(x => x.t.status !== 'blocked').sort(byAge);
    const old = items.filter(x => x.stag != null && x.stag >= _OLD).length;
    const maxAge = Math.max(0, ...items.map(x => x.stag ?? 0));
    return `<div class="card mt-4 stk-card">
        <div class="card-header stk-head">
            <span class="card-title">🧊 Tickets bloqués ou stagnants ${helpIconHtml({ key: 'stuck', label: 'Comprendre bloqués et stagnants' })}</span>
            <span class="stk-threshold">sans mouvement depuis ≥
                <input type="number" id="stuck-stale-days" class="inline-num-edit" min="1" max="365" step="1"
                    value="${staleDays}" title="Seuil de stagnation (jours) — modifiable" aria-label="Seuil de stagnation en jours"> j</span>
        </div>
        ${items.length ? `<div class="stk-summary">
            <span class="stk-chip stk-chip--crit${blocked.length ? '' : ' is-zero'}">🚫 <b>${blocked.length}</b> bloqué${blocked.length > 1 ? 's' : ''}</span>
            <span class="stk-chip stk-chip--warn${stale.length ? '' : ' is-zero'}">🐌 <b>${stale.length}</b> stagnant${stale.length > 1 ? 's' : ''}</span>
            <span class="stk-chip stk-chip--old${old ? '' : ' is-zero'}" title="En l'état depuis ${_OLD} jours ou plus">⏳ <b>${old}</b> depuis ≥ ${_OLD} j</span>
        </div>
        ${_groupHtml('blocked', '🚫', 'Bloqués', blocked, maxAge, staleDays)}
        ${_groupHtml('stale', '🐌', `Stagnants — même état depuis ≥ ${staleDays} j`, stale, maxAge, staleDays)}`
        : emptyStateHtml({ icon: '🎉', title: 'Aucun ticket bloqué ou stagnant', text: `Tout a bougé depuis moins de ${staleDays} jours.`, tone: 'ok' })}
    </div>`;
}
