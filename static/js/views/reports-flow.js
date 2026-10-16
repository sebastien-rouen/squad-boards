/**
 * Section « Kanban / Flow » du rapport (#reports/<équipe>/kanban).
 *
 * Quatre questions, sur la période du rapport (`ctx.period`, cf reports-scope.js) :
 *   1. Combien a-t-on livré ? débit de la période, comparé à la période précédente de même durée ;
 *   2. En combien de temps ? cycle time P50 / P85 des livrés, et conformité à la cible SLA
 *      (`slaModel`, la même que la card SLA Review et la météo). ⚠️ Le modèle est nourri des seuls
 *      tickets des PI ≤ PI affiché : sa cible est alors le P85 du PI PRÉCÉDENT celui qu'on regarde.
 *      Sans ce filtre, un PI passé se mesurait contre son propre P85 (≈ 85 % par construction) ;
 *   3. Où est le travail en cours ? WIP par colonne (`currentStageGroupKey`), contre la limite
 *      de l'équipe (`wipThreshold`, même calcul que la météo) ;
 *   4. Qu'est-ce qui traîne ? tickets au-delà du P85 de leur colonne (`computeStageAgeRefs`, la
 *      référence de la card Aging WIP) et bloqués nommés.
 *
 * ⚠️ WIP, bloqués et vieillissement sont un INSTANTANÉ d'aujourd'hui : montrés seulement sur le PI
 * courant. Les reliquats d'un PI révolu en sont écartés (`isPastPi`, même règle que la TV).
 * ⚠️ Les tickets exclus du flux (`isTicketExcludedFromFlow`) sont ignorés partout, comme dans les
 * cards de flux du Dashboard.
 */

import {
    esc, pct, percentile, isTicketExcludedFromFlow, STAGE_FLOW_GROUPS, currentStageGroupKey,
    computeStageAgeRefs, teamCapacity, rosterCtx, wipThreshold, getStatusLabel, extractPiNum, emptyStateHtml, cycleDays } from '../utils.js';
import { WIP_STATUSES } from '../config.js';
import { isPastPi } from '../business_rules.js';
import { slaModel } from '../components/sla_review_card.js';
import { store } from '../state.js';
import { B, E, SB, CS, TK } from './reports-fmt.js';
import { jiraMs, inWindow, ageDays, windowLabel, num, idleReason } from './reports-scope.js';

const DAY_MS = 86_400_000;
const MAX_AGING = 6;
const STAGE_ICON = { dev: '💻', test: '🧪', review: '👀', qualif: '📦', prod: '🚀', other: '⚙️' };
const plural = (n, s = 's') => (n > 1 ? s : '');
const round1 = v => Math.round(v * 10) / 10;

/** Jours passés par un ticket dans une colonne (somme des statuts JIRA bruts qu'elle regroupe). */
function daysInGroup(t, group) {
    let sum = 0;
    for (const [raw, d] of Object.entries(t.stageDurations || {})) if (group.test(raw)) sum += d;
    return round1(sum);
}

/** Un seul calcul pour les quatre formats. */
export function buildFlowData(ctx) {
    const { teamTickets = [], team, period, isCurrentPi, displayPiNum, piInfo, sprintInfo, absences = [] } = ctx;
    const all = teamTickets.filter(t => !isTicketExcludedFromFlow(t).excluded);
    const scoped = team && team !== 'all';

    // ── Débit et délais sur la période ───────────────────────────────────────
    const delivered = period ? all.filter(t => t.status === 'done' && inWindow(jiraMs(t.resolvedDate), period)) : [];
    const len = period ? period.measuredEnd - period.start : 0;
    const prevWin = period && len > 0 ? { start: period.start - len, measuredEnd: period.start - 1 } : null;
    const prevCount = prevWin ? all.filter(t => t.status === 'done' && inWindow(jiraMs(t.resolvedDate), prevWin)).length : null;
    const weeks = len / (7 * DAY_MS);
    const perWeek = weeks >= 0.5 ? round1(delivered.length / weeks) : null;

    const cts = delivered.map(t => cycleDays(t)).filter(v => v > 0);
    const sla = slaModel(displayPiNum ? teamTickets.filter(t => extractPiNum(t.sprintName || '') <= displayPiNum) : teamTickets);
    const target = sla.target ? round1(sla.target) : null;
    const conform = target ? cts.filter(v => v <= target).length : 0;

    // ── Instantané d'aujourd'hui (PI courant seulement) ──────────────────────
    let now = null;
    if (isCurrentPi) {
        const live = all.filter(t => !isPastPi(t, displayPiNum));
        const wip = live.filter(t => WIP_STATUSES.includes(t.status));
        const refs = computeStageAgeRefs(all);
        const stages = [...STAGE_FLOW_GROUPS.map(g => ({ key: g.key, label: g.label, n: 0 })), { key: 'other', label: 'Autre colonne', n: 0 }];
        const aging = [];
        for (const t of wip) {
            const key = currentStageGroupKey(t) || 'other';
            stages.find(s => s.key === key).n++;
            const g = STAGE_FLOW_GROUPS.find(x => x.key === key);
            const p85 = refs[key]?.p85;
            if (!g || p85 == null) continue;
            const age = daysInGroup(t, g);
            if (age >= p85) aging.push({ t, age, p85: round1(p85), stage: g.label, key });
        }
        aging.sort((a, b) => b.age - a.age);
        // Limite de WIP : capacité du jour de l'équipe (roster du PI), comme la météo.
        const limit = scoped
            ? wipThreshold(teamCapacity(team, store.get('members') || [], absences, undefined, rosterCtx(piInfo, sprintInfo)))
            : null;
        now = {
            wip: wip.length, limit, stages: stages.filter(s => s.n),
            blocked: live.filter(t => t.status === 'blocked')
                .map(t => ({ t, age: ageDays(t.updatedAt) }))
                .sort((a, b) => b.age - a.age),
            aging, leftovers: all.filter(t => t.status !== 'done' && isPastPi(t, displayPiNum)).length,
        };
    }

    return {
        period, teamLabel: scoped ? team : 'Toutes équipes',
        delivered: delivered.length, prevCount, perWeek,
        p50: cts.length ? percentile(cts, 50) : null, p85: cts.length ? percentile(cts, 85) : null,
        measured: cts.length, target, conform, slaPct: cts.length && target ? pct(conform, cts.length) : null,
        targetSrc: sla.isManual ? 'cible fixée' : sla.refPi ? `P85 du PI ${sla.refPi}` : 'provisoire',
        now,
    };
}

/** Tendance du débit : ▲ / ▼ / = face à la période précédente. */
function trend(d) {
    if (d.prevCount == null) return null;
    const diff = d.delivered - d.prevCount;
    return { diff, icon: diff > 0 ? '▲' : diff < 0 ? '▼' : '=', cls: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}
const slaClr = p => (p == null ? 'gray' : p >= 85 ? 'green' : p >= 70 ? 'yellow' : 'red');
const wipClr = n => (n.limit == null ? 'blue' : n.wip > n.limit ? 'red' : 'green');

// ── Rendu riche (format « Texte » de la vue) ─────────────────────────────────

function ticketRow(t, right, badgeCls = '') {
    const st = t.status || 'todo';
    return `<div class="rpt-ti rpt-ti--${esc(st)}">
        <span class="rpt-ti-title" title="${esc(getStatusLabel(t))}">${esc(t.title || t.id || 'Sans titre')}</span>
        ${t.leader || t.assignee ? `<span class="rpt-ti-pts">${esc(t.leader || t.assignee)}</span>` : ''}
        <span class="rpt-ti-badge ${badgeCls}">${right}</span>
    </div>`;
}

function htmlReport(ctx) {
    const d = buildFlowData(ctx);
    const idle = idleReason(d.period);
    if (idle) return emptyStateHtml(idle);
    const tr = trend(d);
    const n = d.now;
    const metric = (label, val, sub = '', cls = '') => `<div class="rpt-metric ${cls}">
        <span class="rpt-metric-label">${label}</span>
        <span class="rpt-metric-val">${val}</span>
        ${sub ? `<span class="rpt-metric-pct">${sub}</span>` : ''}
    </div>`;

    return `
    <div class="rpt-pi-card">
        <p class="rpt-flow-period">📆 ${esc(windowLabel(d.period))}</p>

        <div class="rpt-metrics-row rpt-flow-metrics">
            ${metric('Livrés', d.delivered,
                tr ? `<span class="rpt-flow-trend rpt-flow-trend--${tr.cls}" title="Période précédente de même durée : ${d.prevCount}">${tr.icon} ${tr.diff > 0 ? '+' : ''}${tr.diff}</span>` : '')}
            ${d.perWeek != null ? metric('Débit', `${num(d.perWeek)}<small> /sem.</small>`) : ''}
            ${d.p50 != null ? metric('Cycle time', `${num(d.p50)} j`, `P85 ${num(d.p85)} j`) : ''}
            ${d.slaPct != null ? metric('SLA', `<span class="rpt-pi-pct--${slaClr(d.slaPct)}">${d.slaPct}%</span>`,
                `≤ ${num(d.target)} j <span class="rpt-flow-muted">(${esc(d.targetSrc)})</span>`) : ''}
            ${n ? metric('WIP', `<span class="rpt-flow-wip--${wipClr(n)}">${n.wip}</span>${n.limit != null ? `<small> / ${n.limit}</small>` : ''}`,
                n.limit != null ? (n.wip > n.limit ? 'au-dessus de la limite' : 'sous la limite') : '') : ''}
        </div>

        ${n ? `
        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">⚙️ Travail en cours par colonne<span class="rpt-pi-h-count">${n.wip}</span></h4>
            ${n.stages.length ? `<div class="rpt-flow-stages">${n.stages.map(s => `
                <span class="rpt-flow-stage"><span aria-hidden="true">${STAGE_ICON[s.key]}</span> ${esc(s.label)} <b>${s.n}</b></span>`).join('')}
            </div>` : `<p class="rpt-flow-muted">Aucun ticket en cours.</p>`}
        </section>

        ${n.aging.length ? `
        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">🐢 Ça traîne — au-delà du P85 de la colonne<span class="rpt-pi-h-count">${n.aging.length}</span></h4>
            <div class="rpt-ticket-group rpt-flow-list"><div class="rpt-tg-items">
                ${n.aging.slice(0, MAX_AGING).map(a => ticketRow(a.t, `${num(a.age)} j · ${esc(a.stage)} (P85 ${num(a.p85)} j)`, 'rpt-ti-s-test')).join('')}
            </div></div>
            ${n.aging.length > MAX_AGING ? `<p class="rpt-flow-muted">… et ${n.aging.length - MAX_AGING} autre${plural(n.aging.length - MAX_AGING)}.</p>` : ''}
        </section>` : ''}

        ${n.blocked.length ? `
        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">🚫 Bloqués<span class="rpt-pi-h-count">${n.blocked.length}</span></h4>
            <div class="rpt-ticket-group rpt-flow-list"><div class="rpt-tg-items">
                ${n.blocked.map(b => ticketRow(b.t, `bloqué · maj il y a ${b.age} j`, 'rpt-ti-s-blocked')).join('')}
            </div></div>
        </section>` : ''}
        ${n.leftovers ? `<p class="rpt-flow-muted">${n.leftovers} reliquat${plural(n.leftovers)} d'anciens PI non terminé${plural(n.leftovers)}, hors WIP.</p>` : ''}
        ` : `<p class="rpt-flow-muted">WIP, bloqués et tickets qui traînent : instantané du jour, affiché sur le PI courant uniquement.</p>`}
    </div>`;
}

// ── Formats d'export ─────────────────────────────────────────────────────────

/** Copie « Texte » : puces « - » que Confluence convertit en liste (cf reports-pi.js). */
function textReport(ctx) {
    const d = buildFlowData(ctx);
    const idle = idleReason(d.period);
    if (idle) return `🗂️ Flow — ${d.teamLabel}\n\n${idle.title}. ${idle.text}`;
    const tr = trend(d);
    let r = `🗂️ Flow — ${d.teamLabel} — ${windowLabel(d.period)}\n\n`;
    r += `- ✅ Livrés : ${d.delivered}${tr ? ` (${tr.diff > 0 ? '+' : ''}${tr.diff} vs période précédente)` : ''}\n`;
    if (d.perWeek != null) r += `- 📈 Débit : ${num(d.perWeek)} ticket${plural(d.perWeek)} / semaine\n`;
    if (d.p50 != null) r += `- ⏱️ Cycle time : ${num(d.p50)} j (P50), ${num(d.p85)} j (P85)\n`;
    if (d.slaPct != null) r += `- 🎯 SLA : ${d.slaPct} % livrés en ≤ ${num(d.target)} j (${d.targetSrc})\n`;
    const n = d.now;
    if (!n) return r;
    r += `- ⚙️ WIP : ${n.wip}${n.limit != null ? ` / limite ${n.limit}` : ''}`;
    r += n.stages.length ? ` — ${n.stages.map(s => `${s.label} ${s.n}`).join(', ')}\n` : '\n';
    if (n.aging.length) {
        r += `\n🐢 Ça traîne (au-delà du P85 de la colonne)\n`;
        for (const a of n.aging.slice(0, MAX_AGING)) r += `- ${a.t.title} — ${num(a.age)} j · ${a.stage} (P85 ${num(a.p85)} j)\n`;
    }
    if (n.blocked.length) {
        r += `\n🚫 Bloqués\n`;
        for (const b of n.blocked) r += `- ${b.t.title}${b.t.leader ? ` — ${b.t.leader}` : ''}\n`;
    }
    return r;
}

function slackReport(ctx) {
    const d = buildFlowData(ctx);
    let r = `<div class="s-header">${E('🗂️')} Flow · ${esc(d.teamLabel)}</div><hr class="s-divider">`;
    const idle = idleReason(d.period);
    if (idle) return `${r}${esc(idle.title)}`;
    const tr = trend(d);
    r += `<span class="s-muted">${esc(windowLabel(d.period))}</span>\n`;
    r += `${E('✅')} ${B('Livrés')} : ${SB(d.delivered, 'green')}${tr ? ` <span class="s-muted">(${tr.icon} ${tr.diff > 0 ? '+' : ''}${tr.diff})</span>` : ''}`;
    if (d.perWeek != null) r += ` · ${num(d.perWeek)}/sem.`;
    r += '\n';
    if (d.p50 != null) r += `${E('⏱️')} ${B('Cycle time')} : ${num(d.p50)} j <span class="s-muted">(P85 ${num(d.p85)} j)</span>\n`;
    if (d.slaPct != null) r += `${E('🎯')} ${B('SLA')} : ${SB(d.slaPct + '%', slaClr(d.slaPct))} en ≤ ${num(d.target)} j\n`;
    const n = d.now;
    if (!n) return r;
    r += `${E('⚙️')} ${B('WIP')} : ${SB(n.limit != null ? `${n.wip}/${n.limit}` : n.wip, wipClr(n))}`;
    if (n.stages.length) r += ` <span class="s-muted">${n.stages.map(s => `${esc(s.label)} ${s.n}`).join(' · ')}</span>`;
    r += '\n';
    if (n.aging.length) {
        r += `\n${E('🐢')} ${B('Ça traîne')}\n`;
        for (const a of n.aging.slice(0, MAX_AGING)) r += `• ${TK(a.t, ctx.jiraUrl)}${esc(a.t.title)} <span class="s-muted">${num(a.age)} j · ${esc(a.stage)}</span>\n`;
    }
    if (n.blocked.length) {
        r += `\n${E('🚫')} ${B('Bloqués')} ${SB(n.blocked.length, 'red')}\n`;
        for (const b of n.blocked) r += `• ${TK(b.t, ctx.jiraUrl)}${esc(b.t.title)}${b.t.leader ? ` <span class="s-muted">${esc(b.t.leader)}</span>` : ''}\n`;
    }
    return r;
}

function confluenceReport(ctx) {
    const d = buildFlowData(ctx);
    let r = `<h2>Flow — ${esc(d.teamLabel)}</h2>`;
    const idle = idleReason(d.period);
    if (idle) return `${r}<p>${esc(idle.title)}</p>`;
    const tr = trend(d);
    r += `<p><em>${esc(windowLabel(d.period))}</em></p><table><tr><th>Indicateur</th><th>Valeur</th></tr>`;
    r += `<tr><td>Livrés</td><td>${CS(d.delivered, 'green')}${tr ? ` (${tr.diff > 0 ? '+' : ''}${tr.diff} vs période précédente)` : ''}</td></tr>`;
    if (d.perWeek != null) r += `<tr><td>Débit</td><td>${num(d.perWeek)} / semaine</td></tr>`;
    if (d.p50 != null) r += `<tr><td>Cycle time</td><td>${num(d.p50)} j (P50) · ${num(d.p85)} j (P85)</td></tr>`;
    if (d.slaPct != null) r += `<tr><td>SLA (≤ ${num(d.target)} j)</td><td>${CS(d.slaPct + '%', slaClr(d.slaPct))}</td></tr>`;
    const n = d.now;
    if (n) r += `<tr><td>WIP</td><td>${CS(n.limit != null ? `${n.wip} / ${n.limit}` : n.wip, wipClr(n))} ${n.stages.map(s => `${esc(s.label)} ${s.n}`).join(', ')}</td></tr>`;
    r += `</table>`;
    if (n?.aging.length) {
        r += `<h3>Ça traîne</h3><table><tr><th>Ticket</th><th>Colonne</th><th>Âge</th><th>P85</th></tr>`;
        r += n.aging.slice(0, MAX_AGING).map(a => `<tr><td>${TK(a.t, ctx.jiraUrl)}${esc(a.t.title)}</td><td>${esc(a.stage)}</td><td>${num(a.age)} j</td><td>${num(a.p85)} j</td></tr>`).join('');
        r += `</table>`;
    }
    if (n?.blocked.length) {
        r += `<h3>Bloqués</h3><table><tr><th>Ticket</th><th>Responsable</th></tr>`;
        r += n.blocked.map(b => `<tr><td>${TK(b.t, ctx.jiraUrl)}${esc(b.t.title)}</td><td>${esc(b.t.leader || b.t.assignee || '-')}</td></tr>`).join('');
        r += `</table>`;
    }
    return r;
}

/** Générateur consommé par reports.js (`GENERATORS.kanban`). */
export const FLOW_GENERATOR = { text: textReport, slack: slackReport, confluence: confluenceReport, html: htmlReport };
