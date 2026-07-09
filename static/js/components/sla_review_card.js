/**
 * Card "SLA Review" (respect du délai de cycle) — Dashboard.
 *
 * Fixe une attente de service (SLE, Service Level Expectation) sur le cycle time :
 * « 85% des tickets terminés en ≤ X jours ». On mesure le **taux de conformité** réel et on liste les
 * tickets qui dépassent le seuil — la version chiffrée et actionnable de « ça met trop de temps ».
 *
 * Le seuil X est éditable (champ discret, persisté en localStorage). Par défaut il vaut le **P85
 * actuel** (mode « auto ») : la SLE reflète alors la réalité observée tant que l'utilisateur n'a pas
 * fixé un objectif volontaire. Basé sur les tickets terminés (cycleTimeDays), exclusions de flux
 * respectées (cohérent avec les autres cards de flux).
 */

import { esc, isTicketExcludedFromFlow, getStatusLabel, extractPiNum } from '../utils.js';
import { TYPE_ICONS } from '../config.js';
import { helpIconHtml } from './help_popover.js';

const LS_KEY = 'sb-sla-target-days';
const MAX_ROWS = 15;
// En dessous de ce nombre de tickets terminés, un P85 n'est pas fiable comme référence.
const MIN_REF_SAMPLE = 5;

function _pctl(sortedAsc, p) {
    if (!sortedAsc.length) return null;
    const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
    return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))];
}
const _fmt = n => (n == null ? '—' : Math.round(n * 10) / 10);
const _p85 = arr => _pctl(arr.slice().sort((a, b) => a - b), 85);

/**
 * Modèle SLA/SLE non-tautologique.
 * On mesure le respect du délai sur les tickets terminés du **PI courant** (le plus récent
 * présent dans les données) contre une **référence externe** = P85 du **PI précédent**. Comparer
 * un échantillon à SON PROPRE P85 donnerait toujours ~85% de conformité (tautologie) : la
 * référence doit venir d'ailleurs (l'historique). Faute d'un PI précédent suffisamment fourni,
 * on retombe sur le P85 global en signalant que la mesure est provisoire.
 */
function _model(tickets) {
    const allDone = (tickets || []).filter(t => t.status === 'done' && t.cycleTimeDays > 0 && !isTicketExcludedFromFlow(t).excluded);
    // Regroupe par PI (dérivé du nom de sprint). PI 0 = non rattachable.
    const byPi = new Map();
    for (const t of allDone) {
        const pi = extractPiNum(t.sprintName);
        if (!pi) continue;
        (byPi.get(pi) || byPi.set(pi, []).get(pi)).push(t);
    }
    const pisDesc = [...byPi.keys()].sort((a, b) => b - a);
    const curPi = pisDesc[0] || 0;
    const refPi = pisDesc.find(p => p < curPi && (byPi.get(p) || []).length >= MIN_REF_SAMPLE) || 0;

    // Périmètre mesuré : PI courant si identifiable, sinon tout l'historique (dégradé).
    const measured = curPi ? (byPi.get(curPi) || []) : allDone;
    const measCts = measured.map(t => t.cycleTimeDays);
    const p50 = _pctl(measCts.slice().sort((a, b) => a - b), 50);
    const p85 = _p85(measCts);

    // Cible : manuelle (localStorage) > P85 du PI précédent > P85 global (provisoire).
    const raw = parseFloat(localStorage.getItem(LS_KEY));
    const isManual = raw > 0;
    const refP85 = refPi ? _p85((byPi.get(refPi) || []).map(t => t.cycleTimeDays)) : null;
    const isProvisional = !isManual && !refPi;               // pas de référence externe fiable
    const target = isManual ? raw : (refP85 != null ? refP85 : (_p85(allDone.map(t => t.cycleTimeDays)) || 0));

    const conform = measured.filter(t => t.cycleTimeDays <= target).length;
    const pct = measured.length ? Math.round((conform / measured.length) * 100) : 0;
    const breaches = measured.filter(t => t.cycleTimeDays > target).sort((a, b) => b.cycleTimeDays - a.cycleTimeDays);
    return {
        done: measured, allDoneCount: allDone.length, p50, p85, target,
        isManual, isProvisional, curPi, refPi, conform, pct, breaches,
    };
}

export function slaReviewCardHtml(tickets) {
    const m = _model(tickets);
    if (!m.done.length) return '';
    // Cible de conformité = 85% ; RAG selon le taux réel.
    const rag = m.pct >= 85 ? 'ok' : m.pct >= 70 ? 'warn' : 'crit';
    const targetTxt = _fmt(m.target);
    const visible = m.breaches.slice(0, MAX_ROWS);
    const hidden = m.breaches.length - visible.length;
    // Origine de la cible (auto) : PI précédent (référence externe) ou fallback provisoire.
    const refTag = m.isManual
        ? '<button type="button" class="sla-target-auto" title="Revenir au seuil automatique (référence historique)">↺ auto</button>'
        : m.isProvisional
            ? '<span class="sla-auto-tag sla-auto-tag--warn" title="Pas encore de PI précédent suffisamment fourni pour servir de référence — seuil provisoire basé sur tout l\'historique. La conformité sera fiable dès qu\'un PI de référence existera.">auto · provisoire</span>'
            : `<span class="sla-auto-tag" title="Seuil = P85 du PI ${m.refPi} (référence externe) — la conformité mesure si le PI courant fait aussi bien ou mieux que le précédent. Saisir une valeur pour fixer un objectif volontaire.">auto · réf. PI ${m.refPi}</span>`;
    const scopeTxt = m.curPi ? `PI ${m.curPi}` : 'tout l\'historique';
    return `
        <div class="card sla-card mt-4">
            <div class="card-header">
                <div>
                    <span class="card-title">🎯 SLA Review — respect du délai ${helpIconHtml({ key: 'sla', label: 'Comprendre la SLA / SLE de cycle time' })}</span>
                    <span class="card-subtitle">Objectif : 85% des tickets terminés en ≤
                        <input type="number" class="inline-num-edit sla-target-input" min="1" max="365" step="0.5"
                            value="${targetTxt}" title="Seuil de cycle time (jours) — modifiable" aria-label="Seuil SLA en jours"> j
                        ${refTag}
                    </span>
                </div>
                <div class="sla-score sla-score--${rag}">
                    <span class="sla-score-val">${m.pct}%</span>
                    <span class="sla-score-lbl">conformes</span>
                </div>
            </div>
            <div class="sla-bar" title="${m.conform}/${m.done.length} tickets sous le seuil — cible 85%">
                <span class="sla-bar-fill sla-bar-fill--${rag}" style="width:${m.pct}%"></span>
                <span class="sla-bar-goal" style="left:85%"></span>
            </div>
            <div class="sla-scope" title="Périmètre mesuré : ${m.done.length} ticket(s) terminé(s) du ${scopeTxt} sur ${m.allDoneCount} au total dans l'historique">📐 Mesuré sur <strong>${scopeTxt}</strong> · ${m.done.length}/${m.allDoneCount} tickets terminés</div>
            <div class="sla-meta">
                <span><strong>${m.conform}/${m.done.length}</strong> tickets ≤ ${targetTxt} j</span>
                <span>P50 <strong>${_fmt(m.p50)} j</strong> · P85 <strong>${_fmt(m.p85)} j</strong></span>
                <span class="${m.breaches.length ? 'sla-meta-breach' : ''}">${m.breaches.length} hors cible</span>
            </div>
            <div class="stuck-list">
                ${visible.length ? visible.map(t => `
                    <button class="stuck-row" data-ticket="${esc(t.id)}" title="Ouvrir ${esc(t.id)} — ${esc(t.jiraStatus || getStatusLabel(t))}">
                        <span class="stuck-dot" style="background:var(--danger)"></span>
                        <span class="stuck-id">${esc(t.id)}</span>
                        <span class="stuck-title">${TYPE_ICONS[t.type] ? TYPE_ICONS[t.type] + ' ' : ''}${esc(t.title || '')}</span>
                        <span class="stuck-lead${t.leader ? '' : ' stuck-lead--none'}">${esc(t.leader || 'Non assigné')}</span>
                        <span class="stuck-age is-danger" title="Cycle time — dépasse le seuil de ${targetTxt} j">${_fmt(t.cycleTimeDays)} j</span>
                    </button>`).join('')
                    + (hidden > 0 ? `<div class="stage-detail-more">+${hidden} autre${hidden > 1 ? 's' : ''}</div>` : '')
                : '<p class="text-muted text-sm" style="padding:var(--sp-3)">Tous les tickets terminés respectent le seuil 🎉</p>'}
            </div>
        </div>`;
}

/** Wire l'édition du seuil (persiste + re-render la card) et les clics tickets. */
export function bindSlaReviewCard(container, tickets) {
    const rebind = () => {
        const card = container.querySelector('.sla-card');
        if (!card) return;
        const html = slaReviewCardHtml(tickets);
        if (!html) { card.remove(); return; }
        card.outerHTML = html;
        bindSlaReviewCard(container, tickets);
    };
    const input = container.querySelector('.sla-target-input');
    input?.addEventListener('change', () => {
        const n = parseFloat(input.value);
        if (isNaN(n) || n <= 0 || n > 365) { rebind(); return; }
        localStorage.setItem(LS_KEY, String(n));
        rebind();
    });
    container.querySelector('.sla-target-auto')?.addEventListener('click', () => {
        localStorage.removeItem(LS_KEY);
        rebind();
    });
    container.querySelectorAll('.sla-card .stuck-row[data-ticket]').forEach(row => {
        row.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(row.dataset.ticket));
    });
}
