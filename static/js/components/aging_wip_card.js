/**
 * Card "Aging WIP" (ancienneté du travail en cours) — réutilisable Dashboard + PI Planning.
 *
 * Répond à la question actionnable : « parmi les tickets EN COURS aujourd'hui, lesquels traînent
 * anormalement dans leur colonne ? » — la version proactive de la card "Tickets bloqués/stagnants"
 * (qui, elle, est réactive : elle attend qu'un ticket soit déjà en retard).
 *
 * Principe (flow metrics / Kanban) : chaque ticket en cours est positionné dans SA colonne actuelle
 * (dev, test, revue, qualif, prod — cf STAGE_FLOW_GROUPS) avec son âge = temps déjà passé dans cette
 * colonne (issu de ticket.stageDurations, cumulé au sync depuis le changelog — cf sync.js). Cet âge
 * est comparé à la distribution des tickets DÉJÀ TERMINÉS dans la même colonne :
 *   • < P50   → dans les temps (vert)
 *   • P50–P85 → à surveiller (ambre)
 *   • ≥ P85   → aging, sort de la zone habituelle (rouge) → à débloquer en priorité
 *
 * Les percentiles servent de "Service Level Expectation" implicite, cohérent avec le P50/P85 déjà
 * utilisé par le scatter cycle time (charts.js). Les tickets exclus du flux (isTicketExcludedFromFlow)
 * sont ignorés, comme dans computeStageFlow, pour rester cohérent avec la card "Temps par colonne".
 */

import { esc, STAGE_FLOW_GROUPS, isTicketExcludedFromFlow, getStatusLabel } from '../utils.js';
import { TYPE_ICONS } from '../config.js';
import { helpIconHtml } from './help_popover.js';
import { metricScopeHtml } from './metric_scope.js';

const STAGE_ICONS = { dev: '💻', test: '🧪', review: '👀', qualif: '📦', prod: '🚀' };

// Percentile (méthode "nearest-rank") sur un tableau trié croissant. Renvoie null si vide.
function _pctl(sortedAsc, p) {
    if (!sortedAsc.length) return null;
    const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
    return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))];
}

// Somme des durées (jours) de stageDurations dont la clé JIRA brute matche le groupe.
function _daysInGroup(t, group) {
    const sd = t.stageDurations || t.stage_durations || {};
    let sum = 0;
    for (const [rawKey, days] of Object.entries(sd)) {
        if (group.test(rawKey)) sum += days;
    }
    return sum;
}

// Groupe de flux correspondant au statut ACTUEL du ticket (colonne où il se trouve maintenant).
// Priorité au libellé JIRA brut du statut courant ; null si le statut n'est pas une colonne suivie
// (backlog, à faire, terminé…).
function _currentGroup(t) {
    const raw = String(t.jiraStatus || t._jiraStatus || '').toLowerCase().trim();
    if (!raw) return null;
    return STAGE_FLOW_GROUPS.find(g => g.test(raw)) || null;
}

/**
 * Construit le modèle de la card : pour chaque colonne suivie contenant du WIP, la liste des tickets
 * en cours triés par âge décroissant, avec leur bande de risque (P50/P85 issus des tickets terminés).
 */
function _buildModel(tickets) {
    const all = (tickets || []).filter(t => !isTicketExcludedFromFlow(t).excluded);

    // Référence par colonne : distribution des durées des tickets TERMINÉS dans cette colonne.
    const refs = {};
    for (const g of STAGE_FLOW_GROUPS) {
        const vals = all
            .filter(t => t.status === 'done')
            .map(t => _daysInGroup(t, g))
            .filter(d => d > 0)
            .sort((a, b) => a - b);
        refs[g.key] = { p50: _pctl(vals, 50), p85: _pctl(vals, 85), n: vals.length };
    }

    // Tickets actifs (ni terminés ni exclus) = candidats au positionnement dans une colonne.
    const activeTotal = all.filter(t => t.status !== 'done').length;
    const cols = [];
    let totalWip = 0, atRisk = 0;
    for (const g of STAGE_FLOW_GROUPS) {
        const ref = refs[g.key];
        const rows = [];
        for (const t of all) {
            if (t.status === 'done') continue;
            if (_currentGroup(t) !== g) continue;
            const age = Math.round(_daysInGroup(t, g) * 10) / 10;
            const band = (ref.p85 != null && age >= ref.p85) ? 'crit'
                       : (ref.p50 != null && age >= ref.p50) ? 'warn'
                       : 'ok';
            rows.push({ ticket: t, age, band, blocked: t.status === 'blocked' });
        }
        if (!rows.length) continue;
        rows.sort((a, b) => b.age - a.age);
        totalWip += rows.length;
        atRisk += rows.filter(r => r.band === 'crit').length;
        cols.push({ key: g.key, label: g.label, ref, rows });
    }
    return { cols, totalWip, atRisk, activeTotal };
}

export function agingWipCardHtml(tickets) {
    const { cols, totalWip, atRisk, activeTotal } = _buildModel(tickets);
    if (!cols.length) return '';
    const sub = `${totalWip} ticket${totalWip > 1 ? 's' : ''} en cours`
        + (atRisk > 0 ? ` · <strong class="aging-wip-atrisk">${atRisk} au-delà du P85</strong>` : ' · tous dans les temps');
    const scopeBadge = metricScopeHtml({ scope: 'WIP actuel', measured: totalWip, total: activeTotal, unit: 'tickets actifs', excludedReason: 'statut hors colonnes suivies' });
    return `
        <div class="card aging-wip-card">
            <div class="card-header">
                <div>
                    <span class="card-title">⏳ Ancienneté du travail en cours ${helpIconHtml({ key: 'aging-wip', label: 'Comprendre l\'ancienneté du travail en cours (Aging WIP)' })}</span>
                    <span class="card-subtitle">${sub} · comparé au P50/P85 des tickets terminés</span>
                    ${scopeBadge}
                </div>
                <span class="aging-wip-legend">
                    <span class="aging-wip-key aging-wip-key--ok">&lt; P50</span>
                    <span class="aging-wip-key aging-wip-key--warn">P50–P85</span>
                    <span class="aging-wip-key aging-wip-key--crit">≥ P85</span>
                </span>
            </div>
            <div class="aging-wip-cols">
                ${cols.map(col => {
                    const refTxt = col.ref.p85 != null
                        ? `P50 ${col.ref.p50} j · P85 ${col.ref.p85} j`
                        : 'pas d\'historique';
                    return `
                    <div class="aging-wip-col">
                        <div class="aging-wip-col-hdr">
                            <span class="aging-wip-col-name">${STAGE_ICONS[col.key] || ''} ${esc(col.label)}</span>
                            <span class="aging-wip-col-count">${col.rows.length}</span>
                        </div>
                        <div class="aging-wip-col-ref" title="Repères issus des tickets déjà terminés dans cette colonne (${col.ref.n} ticket${col.ref.n > 1 ? 's' : ''})">${refTxt}</div>
                        <div class="aging-wip-list">
                            ${col.rows.map(({ ticket: t, age, band, blocked }) => {
                                const typeIcon = TYPE_ICONS[t.type] ? `${TYPE_ICONS[t.type]} ` : '';
                                const bandTip = band === 'crit' ? 'Au-delà du P85 — sort de la zone habituelle, à débloquer'
                                              : band === 'warn' ? 'Entre P50 et P85 — à surveiller'
                                              : 'Dans les temps (< P50)';
                                return `
                                <button type="button" class="aging-wip-ticket aging-wip-ticket--${band}${blocked ? ' is-blocked' : ''}" data-ticket-id="${esc(t.id)}" title="${blocked ? '🚫 Bloqué — ' : ''}${bandTip} — ouvrir ${esc(t.id)} (${esc(t.jiraStatus || getStatusLabel(t))})">
                                    <span class="aging-wip-age">${age} j</span>
                                    <span class="aging-wip-tk">
                                        <span class="aging-wip-id">${blocked ? '🚫 ' : ''}${esc(t.id)}</span>
                                        <span class="aging-wip-title">${typeIcon}${esc(t.title || '(sans titre)')}</span>
                                    </span>
                                </button>`;
                            }).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

/** Wire les clics tickets (à appeler après insertion dans le DOM). */
export function bindAgingWipCard(container) {
    container.querySelectorAll('.aging-wip-ticket[data-ticket-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            window.__squadBoard?.openTicketModal?.(btn.dataset.ticketId);
        });
    });
}
