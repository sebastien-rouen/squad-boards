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

import { esc, isTicketExcludedFromFlow, getStatusLabel } from '../utils.js';
import { TYPE_ICONS } from '../config.js';
import { helpIconHtml } from './help_popover.js';

const LS_KEY = 'sb-sla-target-days';
const MAX_ROWS = 15;

function _pctl(sortedAsc, p) {
    if (!sortedAsc.length) return null;
    const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
    return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))];
}
const _fmt = n => (n == null ? '—' : Math.round(n * 10) / 10);

function _model(tickets) {
    const done = (tickets || []).filter(t => t.status === 'done' && t.cycleTimeDays > 0 && !isTicketExcludedFromFlow(t).excluded);
    const cts = done.map(t => t.cycleTimeDays).sort((a, b) => a - b);
    const p50 = _pctl(cts, 50), p85 = _pctl(cts, 85);
    const raw = parseFloat(localStorage.getItem(LS_KEY));
    const isAuto = !(raw > 0);
    const target = isAuto ? (p85 || 0) : raw;
    const conform = done.filter(t => t.cycleTimeDays <= target).length;
    const pct = done.length ? Math.round((conform / done.length) * 100) : 0;
    const breaches = done.filter(t => t.cycleTimeDays > target).sort((a, b) => b.cycleTimeDays - a.cycleTimeDays);
    return { done, p50, p85, target, isAuto, conform, pct, breaches };
}

export function slaReviewCardHtml(tickets) {
    const m = _model(tickets);
    if (!m.done.length) return '';
    // Cible de conformité = 85% ; RAG selon le taux réel.
    const rag = m.pct >= 85 ? 'ok' : m.pct >= 70 ? 'warn' : 'crit';
    const targetTxt = _fmt(m.target);
    const visible = m.breaches.slice(0, MAX_ROWS);
    const hidden = m.breaches.length - visible.length;
    return `
        <div class="card sla-card mt-4">
            <div class="card-header">
                <div>
                    <span class="card-title">🎯 SLA Review — respect du délai ${helpIconHtml({ key: 'sla', label: 'Comprendre la SLA / SLE de cycle time' })}</span>
                    <span class="card-subtitle">Objectif : 85% des tickets terminés en ≤
                        <input type="number" class="inline-num-edit sla-target-input" min="1" max="365" step="0.5"
                            value="${targetTxt}" title="Seuil de cycle time (jours) — modifiable" aria-label="Seuil SLA en jours"> j
                        ${m.isAuto
                            ? '<span class="sla-auto-tag" title="Seuil calculé automatiquement sur le P85 observé — saisir une valeur pour fixer un objectif">auto · P85</span>'
                            : '<button type="button" class="sla-target-auto" title="Revenir au seuil automatique (P85 observé)">↺ auto</button>'}
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
