/**
 * Section « Support » du rapport (#reports/<équipe>/support).
 *
 *   1. Rotation EN VIGUEUR et suivante — UNIQUEMENT `currentSupportRows` (règle CLAUDE.md
 *      3.164.0), réduite au filtre équipe / groupe (`filterByTeam`). Avant 3.212.0 la section
 *      listait toutes les équipes quel que soit le filtre. La semaine suivante = rotation en
 *      vigueur le lendemain de la fin de semaine de CHAQUE équipe (les modes diffèrent).
 *      Absences : `supportAbsenceDays` + `isSupportAbsent` (≥ 3 j ouvrés, règle métier n°1),
 *      jours partiels : `supportPartialDaysLabel` — même lecture que la grille.
 *   2. Tickets de type `support` sur la période du rapport (`ctx.period`) : entrés (création),
 *      résolus (résolution), délai de résolution médian (lead time) ; et, sur le PI courant,
 *      le STOCK ouvert aujourd'hui, du plus ancien au plus récent.
 *      Avant 3.212.0 : « Tickets support : 133 » = un an d'historique, sans période.
 */

import {
    esc, percentile, filterByTeam, currentSupportRows, supportAbsenceDays, isSupportAbsent,
    supportPartialDaysLabel, emptyStateHtml,
} from '../utils.js';
import { STATUS_LABELS } from '../config.js';
import { B, E, SB, CS } from './reports-fmt.js';
import { jiraMs, inWindow, ageDays, windowLabel, num, idleReason } from './reports-scope.js';
import { isSupportTracker } from '../components/team_timeline_support.js';

const MAX_OPEN = 8;
const plural = (n, s = 's') => (n > 1 ? s : '');

/** Jour ISO suivant (AAAA-MM-JJ), en heure locale. */
const nextDayIso = iso => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Membres d'une ligne de rotation, avec absences et jours partiels. */
function people(row, absences) {
    return (row?.members || []).map(name => {
        const abs = supportAbsenceDays(name, row.weekStart, row.weekEnd, absences);
        return { name, abs, absent: isSupportAbsent(abs), partial: supportPartialDaysLabel(row, name) };
    });
}

/** Un seul calcul pour les quatre formats. */
export function buildSupportData(ctx) {
    const { teamTickets = [], team, support = [], absences = [], period, isCurrentPi } = ctx;

    // ── Rotation ─────────────────────────────────────────────────────────────
    const rotation = isCurrentPi
        ? filterByTeam(currentSupportRows(support), team).sort((a, b) => a.team.localeCompare(b.team)).map(row => {
            const next = row.weekEnd
                ? currentSupportRows(support, nextDayIso(row.weekEnd)).find(r => r.team === row.team)
                : null;
            return {
                team: row.team, week: (row.weekLabels || []).join(' · ') || row.weekLabel || '',
                members: people(row, absences),
                next: next ? { week: (next.weekLabels || []).join(' · '), members: people(next, absences) } : null,
            };
        })
        : [];

    // ── Tickets de support ───────────────────────────────────────────────────
    // Le ticket de SUIVI du PI (« Paillettes support - PI31 ») n'est pas une demande : il vit tout
    // le PI et serait toujours « le plus ancien ouvert ». Montré à part, hors compteurs.
    const all = teamTickets.filter(t => t.type === 'support');
    const trackers = isCurrentPi ? all.filter(t => isSupportTracker(t) && t.status !== 'done') : [];
    const sup = all.filter(t => !isSupportTracker(t));
    const entered = period ? sup.filter(t => inWindow(jiraMs(t.createdAt), period)) : [];
    const resolved = period ? sup.filter(t => t.status === 'done' && inWindow(jiraMs(t.resolvedDate), period)) : [];
    const leads = resolved.map(t => t.leadTimeDays).filter(v => v > 0);
    const open = isCurrentPi
        ? sup.filter(t => t.status !== 'done').map(t => ({ t, age: ageDays(t.createdAt) })).sort((a, b) => b.age - a.age)
        : null;

    return {
        period, teamLabel: team && team !== 'all' ? team : 'Toutes équipes',
        rotation, entered: entered.length, resolved: resolved.length,
        leadP50: leads.length ? percentile(leads, 50) : null,
        open, trackers,
    };
}

/** « Prénom NOM » lisible depuis « NOM, Prénom » (format de l'import RH). */
const displayName = n => (String(n).includes(',') ? String(n).split(',').map(s => s.trim()).reverse().join(' ') : String(n));
const personTxt = p => `${displayName(p.name)}${p.partial ? ` (${p.partial})` : ''}${p.absent ? ` ⚠️ absent ${p.abs} j` : ''}`;
const statusLbl = t => STATUS_LABELS[t.status] || t.status || '';
/** Solde de la période : plus de résolus que d'entrés = le stock baisse. */
const balance = d => d.resolved - d.entered;

// ── Rendu riche (format « Texte » de la vue) ─────────────────────────────────

function personHtml(p) {
    return `<span class="rpt-sup-person${p.absent ? ' rpt-sup-person--absent' : ''}"${p.absent ? ` title="Absent ${p.abs} jour${plural(p.abs)} ouvré${plural(p.abs)} cette semaine"` : ''}>
        ${esc(displayName(p.name))}${p.partial ? ` <small>${esc(p.partial)}</small>` : ''}${p.absent ? ' <span aria-label="absent">⚠️</span>' : ''}
    </span>`;
}

function htmlReport(ctx) {
    const d = buildSupportData(ctx);
    const idle = idleReason(d.period);
    if (idle) return emptyStateHtml(idle);
    const bal = balance(d);
    return `
    <div class="rpt-pi-card">
        ${d.period ? `<p class="rpt-flow-period">📆 ${esc(windowLabel(d.period))}</p>` : ''}
        <div class="rpt-metrics-row rpt-flow-metrics">
            <div class="rpt-metric"><span class="rpt-metric-label">Entrés</span><span class="rpt-metric-val">${d.entered}</span></div>
            <div class="rpt-metric"><span class="rpt-metric-label">Résolus</span><span class="rpt-metric-val">${d.resolved}</span>
                <span class="rpt-metric-pct rpt-pi-pct--${bal >= 0 ? 'green' : 'red'}" title="Résolus − entrés sur la période">${bal > 0 ? '+' : ''}${bal}</span></div>
            ${d.leadP50 != null ? `<div class="rpt-metric"><span class="rpt-metric-label">Délai médian</span><span class="rpt-metric-val">${num(d.leadP50)} j</span></div>` : ''}
            ${d.open ? `<div class="rpt-metric"><span class="rpt-metric-label">Ouverts</span><span class="rpt-metric-val">${d.open.length}</span>
                ${d.open.length ? `<span class="rpt-metric-pct">le plus ancien : ${d.open[0].age} j</span>` : ''}</div>` : ''}
        </div>

        ${ctx.isCurrentPi ? `
        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">🛡️ Astreinte<span class="rpt-pi-h-count">${d.rotation.length}</span></h4>
            ${d.rotation.length ? `<div class="rpt-sup-rot">${d.rotation.map(r => `
                <div class="rpt-sup-row">
                    <span class="rpt-sup-team">${esc(r.team)}</span>
                    <div class="rpt-sup-week">
                        <span class="rpt-sup-lbl">Cette semaine${r.week ? ` · ${esc(r.week)}` : ''}</span>
                        <div class="rpt-sup-people">${r.members.length ? r.members.map(personHtml).join('') : '<span class="rpt-flow-muted">personne</span>'}</div>
                    </div>
                    <div class="rpt-sup-week rpt-sup-week--next">
                        <span class="rpt-sup-lbl">Ensuite${r.next?.week ? ` · ${esc(r.next.week)}` : ''}</span>
                        <div class="rpt-sup-people">${r.next?.members.length ? r.next.members.map(personHtml).join('') : '<span class="rpt-flow-muted">non planifié</span>'}</div>
                    </div>
                </div>`).join('')}
            </div>` : `<p class="rpt-flow-muted">Aucune rotation en vigueur pour ${esc(d.teamLabel)} — Paramètres → Rotation.</p>`}
        </section>` : ''}

        ${d.open?.length ? `
        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">📥 Tickets ouverts<span class="rpt-pi-h-count">${d.open.length}</span></h4>
            <div class="rpt-ticket-group rpt-flow-list"><div class="rpt-tg-items">
                ${d.open.slice(0, MAX_OPEN).map(({ t, age }) => `<div class="rpt-ti rpt-ti--${esc(t.status)}">
                    <span class="rpt-ti-title">${esc(t.title || t.id)}</span>
                    ${t.leader || t.assignee ? `<span class="rpt-ti-pts">${esc(t.leader || t.assignee)}</span>` : ''}
                    <span class="rpt-ti-pts">${age} j</span>
                    <span class="rpt-ti-badge rpt-ti-s-${esc(t.status)}">${esc(statusLbl(t))}</span>
                </div>`).join('')}
            </div></div>
            ${d.open.length > MAX_OPEN ? `<p class="rpt-flow-muted">… et ${d.open.length - MAX_OPEN} autre${plural(d.open.length - MAX_OPEN)}.</p>` : ''}
        </section>` : ''}
        ${d.trackers.length ? `<p class="rpt-flow-muted">📋 Suivi : ${d.trackers.map(t => esc(t.title)).join(' · ')} (hors compteurs)</p>` : ''}
    </div>`;
}

// ── Formats d'export ─────────────────────────────────────────────────────────

function textReport(ctx) {
    const d = buildSupportData(ctx);
    const idle = idleReason(d.period);
    if (idle) return `🛡️ Support — ${d.teamLabel}\n\n${idle.title}. ${idle.text}`;
    let r = `🛡️ Support — ${d.teamLabel}${d.period ? ` — ${windowLabel(d.period)}` : ''}\n\n`;
    for (const row of d.rotation) {
        r += `- ${row.team} : ${row.members.map(personTxt).join(', ') || 'personne'}`;
        r += row.next?.members.length ? ` — ensuite ${row.next.members.map(personTxt).join(', ')}\n` : '\n';
    }
    if (d.rotation.length) r += '\n';
    const bal = balance(d);
    r += `- 📥 Entrés : ${d.entered} · ✅ Résolus : ${d.resolved} (${bal > 0 ? '+' : ''}${bal})\n`;
    if (d.leadP50 != null) r += `- ⏱️ Délai de résolution médian : ${num(d.leadP50)} j\n`;
    if (d.open) {
        r += `- 📂 Ouverts aujourd'hui : ${d.open.length}\n`;
        for (const { t, age } of d.open.slice(0, MAX_OPEN)) r += `- ${t.title} — ${age} j, ${statusLbl(t)}\n`;
    }
    for (const t of d.trackers) r += `- 📋 Suivi : ${t.title}\n`;
    return r;
}

function slackReport(ctx) {
    const d = buildSupportData(ctx);
    let r = `<div class="s-header">${E('🛡️')} Support · ${esc(d.teamLabel)}</div><hr class="s-divider">`;
    const idle = idleReason(d.period);
    if (idle) return `${r}${esc(idle.title)}`;
    if (d.period) r += `<span class="s-muted">${esc(windowLabel(d.period))}</span>\n`;
    for (const row of d.rotation) {
        r += `${B(esc(row.team))} : ${esc(row.members.map(personTxt).join(', ') || 'personne')}`;
        r += row.next?.members.length ? ` <span class="s-muted">→ ${esc(row.next.members.map(personTxt).join(', '))}</span>\n` : '\n';
    }
    if (d.rotation.length) r += '\n';
    const bal = balance(d);
    r += `${E('📥')} ${B('Entrés')} : ${d.entered} · ${E('✅')} ${B('Résolus')} : ${d.resolved} ${SB((bal > 0 ? '+' : '') + bal, bal >= 0 ? 'green' : 'red')}\n`;
    if (d.leadP50 != null) r += `${E('⏱️')} ${B('Délai médian')} : ${num(d.leadP50)} j\n`;
    if (d.open) {
        r += `${E('📂')} ${B('Ouverts')} : ${SB(d.open.length, d.open.length ? 'yellow' : 'green')}\n`;
        for (const { t, age } of d.open.slice(0, MAX_OPEN)) r += `• ${esc(t.title)} <span class="s-muted">${age} j</span>\n`;
    }
    return r;
}

function confluenceReport(ctx) {
    const d = buildSupportData(ctx);
    let r = `<h2>Support — ${esc(d.teamLabel)}</h2>`;
    const idle = idleReason(d.period);
    if (idle) return `${r}<p>${esc(idle.title)}</p>`;
    if (d.period) r += `<p><em>${esc(windowLabel(d.period))}</em></p>`;
    if (d.rotation.length) {
        r += `<h3>Astreinte</h3><table><tr><th>Équipe</th><th>Cette semaine</th><th>Ensuite</th></tr>`;
        r += d.rotation.map(row => `<tr><td>${esc(row.team)}</td><td>${esc(row.members.map(personTxt).join(', ') || '-')}</td>`
            + `<td>${esc(row.next?.members.map(personTxt).join(', ') || '-')}</td></tr>`).join('');
        r += `</table>`;
    }
    const bal = balance(d);
    r += `<p><strong>Entrés :</strong> ${d.entered} — <strong>Résolus :</strong> ${d.resolved} ${CS((bal > 0 ? '+' : '') + bal, bal >= 0 ? 'green' : 'red')}`;
    if (d.leadP50 != null) r += ` — <strong>Délai médian :</strong> ${num(d.leadP50)} j`;
    r += `</p>`;
    if (d.open?.length) {
        r += `<h3>Tickets ouverts (${d.open.length})</h3><table><tr><th>Ticket</th><th>Âge</th><th>Statut</th></tr>`;
        r += d.open.slice(0, MAX_OPEN).map(({ t, age }) => `<tr><td>${esc(t.title)}</td><td>${age} j</td><td>${esc(statusLbl(t))}</td></tr>`).join('');
        r += `</table>`;
    }
    return r;
}

/** Générateur consommé par reports.js (`GENERATORS.support`). */
export const SUPPORT_GENERATOR = { text: textReport, slack: slackReport, confluence: confluenceReport, html: htmlReport };
