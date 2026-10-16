/**
 * 🗳 Votes du sprint dans l'info-panel : Mood et Fist of Five (Confiance) de l'équipe, saisis en UN clic.
 *
 *   • moyenne + nombre de votes de l'équipe sur le sprint en cours (`piSprint` = « NN.N », même clé que la
 *     page PI et la Santé) ; échelles = VOTE_KINDS (utils/vote-kinds.js) ;
 *   • CHAQUE CLIC AJOUTE UN VOTE (comme les .vote-btns de la page PI) : on recueille les votes de toute
 *     l'équipe, par exemple en rétro depuis un seul poste — pas de notion de « mon vote » ;
 *   • RETIRER = le × au survol d'un emoji qui a des votes : retire le DERNIER vote de cette valeur (équipe +
 *     sprint), tout de suite à l'écran, en base après quelques secondes sauf « Annuler » (`toastUndo`) ;
 *   • vote seulement pour UNE équipe et sur le sprint EN COURS (PI épinglé / « Toutes » = lecture seule).
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, toastUndo, VOTE_KINDS } from '../utils.js';

const _clr = avg => (avg >= 4 ? 'var(--status-done)' : avg >= 3 ? 'var(--warning)' : 'var(--danger)');
const _votesOf = (kind, team, sprint) =>
    (store.get(VOTE_KINDS[kind].storeKey) || []).filter(v => v.team === team && v.piSprint === sprint);

/**
 * @param {object} o
 * @param {string}   o.team       équipe sélectionnée ('all' possible)
 * @param {string}   o.curLabel   sprint en cours « NN.N » (null si PI épinglé)
 * @param {string}   o.voteLabel  libellé de la portée affichée (« 31.3 » ou « PI 30 »)
 * @param {(v) => boolean} o.inScope  filtre des votes de la portée
 */
export function panelVotesHtml({ team, curLabel, voteLabel, inScope }) {
    const canVote = !!(team && team !== 'all' && curLabel);
    const rows = Object.entries(VOTE_KINDS).map(([kind, k]) => {
        const votes = (store.get(k.storeKey) || []).filter(v => (team === 'all' || v.team === team) && inScope(v));
        const avg = votes.length ? Math.round(votes.reduce((s, v) => s + v.value, 0) / votes.length * 10) / 10 : null;
        return `<div class="pv-row" data-pv-kind="${kind}">
            <div class="pv-head">
                <span class="pv-label">${k.icon} ${esc(k.label)}</span>
                ${avg != null
                    ? `<span class="pv-avg" style="color:${_clr(avg)}" title="Moyenne de l'équipe">${k.emojis[Math.round(avg) - 1] || ''} ${String(avg).replace('.', ',')}<small>/5</small></span>
                       <span class="pv-count">${votes.length} vote${votes.length > 1 ? 's' : ''}</span>`
                    : '<span class="pv-count">aucun vote</span>'}
            </div>
            <div class="pv-btns" aria-label="${esc(k.label)} — ajouter un vote">
                ${k.emojis.map((e, i) => {
                    const v = i + 1;
                    const n = votes.filter(x => x.value === v).length;
                    return `<span class="pv-cell${n ? ' has-votes' : ''}">
                        <button type="button" class="pv-btn" data-pv-value="${v}"${canVote ? '' : ' disabled'}
                            title="${esc(k.scale[i])} (${v})${n ? ` — ${n} vote${n > 1 ? 's' : ''}` : ''}${canVote ? ' · clic = +1 vote' : ''}">
                            <span class="pv-emo">${e}</span>${n ? `<span class="pv-n">${n}</span>` : ''}
                        </button>
                        ${canVote && n ? `<button type="button" class="pv-del" data-pv-del="${v}" aria-label="Retirer un vote ${esc(k.scale[i])}" title="Retirer le dernier vote ${e}">×</button>` : ''}
                    </span>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');
    const hint = canVote ? 'Chaque clic ajoute un vote · × retire le dernier de cette valeur'
        : team === 'all' ? 'Choisissez une équipe pour voter' : 'Vote sur le sprint en cours seulement';
    return `<div class="panel-card pv-card">
        <div class="panel-card-header">
            <div class="panel-title">🗳️ Votes du sprint${voteLabel ? ` · ${esc(voteLabel)}` : ''}</div>
        </div>
        ${rows}
        <div class="pv-hint">${esc(hint)}</div>
    </div>`;
}

/** Câble les boutons (le rendu est remplacé à chaque mise à jour du panneau). */
export function bindPanelVotes(el, { team, curLabel, onChanged }) {
    if (!team || team === 'all' || !curLabel) return;
    el.querySelectorAll('.pv-row').forEach(row => {
        row.addEventListener('click', async e => {
            const kind = row.dataset.pvKind, k = VOTE_KINDS[kind];
            const del = e.target.closest('[data-pv-del]');
            if (del) {
                e.stopPropagation();
                const value = Number(del.dataset.pvDel);
                // Dernier vote de cette valeur pour l'équipe et le sprint
                const last = _votesOf(kind, team, curLabel).filter(v => v.value === value)
                    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
                if (!last) return;
                const before = store.get(k.storeKey) || [];
                store.set(k.storeKey, before.filter(v => v.id !== last.id));   // retiré tout de suite à l'écran
                onChanged?.();
                toastUndo(`${k.label} : un vote ${k.emojis[value - 1]} retiré`, {
                    seconds: 6,
                    onUndo: () => { store.set(k.storeKey, before); onChanged?.(); },
                    onCommit: async () => {
                        try { await api.deleteMood(last.id); }
                        catch (err) { toast(err.message, 'error'); }
                        try { store.set(k.storeKey, await api.getMood({ type: kind })); } catch { /* garde l'état local */ }
                        onChanged?.();
                    },
                });
                return;
            }
            const btn = e.target.closest('.pv-btn');
            if (!btn || btn.disabled) return;
            e.stopPropagation();
            const value = Number(btn.dataset.pvValue);
            btn.classList.add('is-pop');
            try {
                await api.createMood({ type: kind, team, value, piSprint: curLabel, note: '' });
                store.set(k.storeKey, await api.getMood({ type: kind }));
                const n = _votesOf(kind, team, curLabel).length;
                toast(`${k.label} : +1 ${k.emojis[value - 1]} ${k.scale[value - 1]} (${n} vote${n > 1 ? 's' : ''})`, 'success', 1800);
            } catch (err) {
                toast(err.message, 'error');
            }
            onChanged?.();
        });
    });
}
