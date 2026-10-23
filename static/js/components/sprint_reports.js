/**
 * 📊 Rapports d'un sprint depuis sa modale : burndown intégré, rapport texte / Markdown / HTML autonome, mini-burndown SVG, flux par étape.
 *
 * Extrait de sprint_tickets_modal.js (3.254.0) — code déplacé à l'identique. Dépendances CIRCULAIRES vers sprint_tickets_modal.js
 * assumées : jamais utilisées au niveau racine du module (seulement dans des fonctions / écouteurs).
 */
import { store } from '../state.js';
import { esc, pct, sumBy, isBufferItem, computeStageFlow } from '../utils.js';
import { STATUS_LABELS, STATUS_ORDER } from '../config.js';
import { renderBurndown } from './charts.js';
import { STAGE_ICONS } from './stage_flow_card.js';
import { _fmtDate, _sprintStats, _typeIcon } from './sprint_tickets_modal.js';

// ── Burndown du sprint dans la modale ────────────────────────────────────────
// Reprend `renderBurndown` du composant charts : courbe idéale + réelle + tickets.
// Pour un sprint clos, le today marker n'apparaît pas (todayIdx < 0) — on voit
// l'avancement vs idéal de manière rétrospective.
export function _canRenderBurndown(sprint, tickets) {
    if (!sprint?.startDate || !sprint?.endDate) return false;
    if (!tickets?.length) return false;
    // Doit avoir au moins quelques points pour que la courbe ait du sens
    return tickets.some(t => (t.points || 0) > 0);
}

function _sprintDurationDays(sprint) {
    if (!sprint?.startDate || !sprint?.endDate) return 14;
    const start = new Date(String(sprint.startDate).slice(0, 10)).getTime();
    const end   = new Date(String(sprint.endDate).slice(0, 10)).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return 14;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function _maybeRenderBurndown(sprint, tickets) {
    if (!_canRenderBurndown(sprint, tickets)) return;
    const sprintArg = {
        startDate: sprint.startDate,
        endDate:   sprint.endDate,
        durationDays: _sprintDurationDays(sprint),
    };
    try { renderBurndown('sb-modal-burndown-canvas', tickets, sprintArg); }
    catch (e) { console.warn('[Squad-Board] Burndown modal : échec', e.message); }
}

export function _maybeInjectBurndown(overlay, sprint, tickets) {
    if (!_canRenderBurndown(sprint, tickets)) return;
    // Si le canvas existe déjà (shell initial avait des tickets) → juste re-render
    let canvas = overlay.querySelector('#sb-modal-burndown-canvas');
    if (!canvas) {
        // Injecte le bloc burndown avant le body
        const body = overlay.querySelector('.sb-modal-body');
        if (!body) return;
        const html = `
            <div class="sb-modal-burndown">
                <div class="sb-modal-burndown-title">📉 Burndown ${sprint.isCurrent ? '(temps réel)' : '(rétrospectif)'}</div>
                <div class="chart-container chart-h-sm"><canvas id="sb-modal-burndown-canvas"></canvas></div>
            </div>`;
        body.insertAdjacentHTML('beforebegin', html);
    }
    _maybeRenderBurndown(sprint, tickets);
}

// ── Rapport texte simple (compatible Slack/Teams/mail sans dépendre du mrkdwn) ──
// Pas de `*` ni `_` ni `<URL|TEXT>` : ces formats apparaissent en littéral si
// l'option "Format messages with markup" est désactivée côté Slack, et l'URL
// avec `|` est encodée en `%7C` à la copie → format cassé. On utilise donc des
// URL brutes (auto-linkifiées par Slack) et des séparateurs visuels.
export function _buildSprintReport(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'en cours' : 'clôturé';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const teamLabel = sprint.team ? ` · ${sprint.team}` : '';
    const jiraBase = store.get('jiraUrl');
    const jiraUrl = (key) => {
        if (!key) return '';
        if (!jiraBase) return key;
        return `${jiraBase.replace(/\/$/, '')}/browse/${key}`;
    };

    const {
        total, ptsTotal, ptsDone, doneCount, veloPts, engagePct, engageDistinct,
        estimated, bufferRealised, bufferRealShare,
    } = _sprintStats(sprint, tickets);

    const lines = [];
    // Entête
    lines.push(`📊 ${sprint.name} — ${stateLabel}${teamLabel}${endLabel ? ` · fin ${endLabel}` : ''}`);
    lines.push('');
    // Stats sur une seule ligne
    const statRow = [];
    statRow.push(`Vélocité : ${veloPts} pts${engageDistinct ? ` / ${estimated} engagés (${engagePct}% réalisé)` : ''}`);
    if (engageDistinct) statRow.push(`Engagé (estimé) : ${estimated} pts`);
    statRow.push(`🛡️ Buffer : ${bufferRealised} pts${bufferRealShare ? ` (${bufferRealShare}% de l'engagé)` : ''}`);
    lines.push('• ' + statRow.join('  ·  '));
    lines.push(`• Tickets : ${doneCount}/${total || '—'} terminés  ·  Story Points : ${ptsDone}/${ptsTotal || '—'}`);
    lines.push('');

    // Groupes par statut
    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));
    const statusEmoji = { todo: '◻️', inprog: '🔄', review: '🔍', test: '🧪', blocked: '⛔', done: '✅' };

    for (const status of orderedStatuses) {
        const group = byStatus.get(status);
        const ptsGroup = sumBy(group, t => t.points);
        const label = STATUS_LABELS[status] || status;
        const emoji = statusEmoji[status] || '◇';
        const ticketStr = `${group.length} ticket${group.length > 1 ? 's' : ''}`;
        lines.push(`${emoji} ${label} — ${ticketStr}${ptsGroup > 0 ? ` · ${ptsGroup} pts` : ''}`);
        for (const t of group) {
            const typeIcon = _typeIcon(t.type, t.labels);
            const ptsStr = t.points ? ` · ${t.points} pts` : '';
            const leader = (t.leader || t.assignee) ? ` · ${t.leader || t.assignee}` : '';
            const url = jiraUrl(t.id);
            // URL brute → Slack auto-link. Titre tronqué pour éviter la surcharge.
            const titleTrunc = (t.title || '(sans titre)').length > 70
                ? (t.title || '').slice(0, 70).trim() + '…'
                : (t.title || '(sans titre)');
            lines.push(`  • ${typeIcon} ${url} — ${titleTrunc}${ptsStr}${leader}`);
        }
        lines.push('');
    }

    if (total === 0) {
        lines.push('(Aucun ticket en base — relancer une synchro ou ouvrir la modal pour fetcher depuis JIRA.)');
    }
    return lines.join('\n').trim();
}

// ── Rapport Markdown enrichi (GitHub/GitLab/Confluence/VSCode-friendly) ─────
export function _buildSprintReportMd(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'en cours' : 'clôturé';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const teamLabel = sprint.team ? ` · **${sprint.team}**` : '';
    const jiraBase = store.get('jiraUrl');
    const jiraLink = (key) => !jiraBase || !key ? `\`${key}\`` :
        `[\`${key}\`](${jiraBase.replace(/\/$/, '')}/browse/${key})`;

    const {
        total, ptsTotal, ptsDone, doneCount, veloPts, engagePct, engageDistinct,
        estimated, bufferRealised, bufferRealShare,
    } = _sprintStats(sprint, tickets);

    const lines = [];
    lines.push(`# 📊 ${sprint.name}`);
    lines.push('');
    lines.push(`> **État :** ${stateLabel}${teamLabel}${endLabel ? ` · *fin ${endLabel}*` : ''}`);
    lines.push('');
    lines.push('## Indicateurs');
    lines.push('');
    lines.push('| Métrique | Valeur |');
    lines.push('|---|---|');
    lines.push(`| Vélocité (livré) | **${veloPts} pts**${engageDistinct ? ` *(${engagePct}% de l'engagé)*` : ''} |`);
    if (engageDistinct) lines.push(`| Engagé (estimé) | **${estimated} pts** |`);
    lines.push(`| 🛡️ Buffer | **${bufferRealised} pts**${bufferRealShare ? ` *(${bufferRealShare}% de l'engagé)*` : ''} |`);
    lines.push(`| Tickets terminés | **${doneCount}/${total || '—'}** |`);
    lines.push(`| Story Points livrés | **${ptsDone}/${ptsTotal || '—'}** |`);
    lines.push('');

    // Groupes par statut sous forme de sections + tableaux
    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));
    const statusEmoji = { todo: '◻️', inprog: '🔄', review: '🔍', test: '🧪', blocked: '⛔', done: '✅' };

    for (const status of orderedStatuses) {
        const group = byStatus.get(status);
        const ptsGroup = sumBy(group, t => t.points);
        const label = STATUS_LABELS[status] || status;
        const emoji = statusEmoji[status] || '◇';
        lines.push(`## ${emoji} ${label} — ${group.length} ticket${group.length > 1 ? 's' : ''}${ptsGroup > 0 ? ` · ${ptsGroup} pts` : ''}`);
        lines.push('');
        lines.push('| Type | Ticket | Titre | Points | Assigné·e |');
        lines.push('|---|---|---|---|---|');
        for (const t of group) {
            const tIcon = _typeIcon(t.type, t.labels);
            const title = (t.title || '(sans titre)').replace(/\|/g, '\\|');
            const pts = t.points || '—';
            const leader = (t.leader || t.assignee) || '—';
            lines.push(`| ${tIcon} | ${jiraLink(t.id)} | ${title} | ${pts} | ${leader} |`);
        }
        lines.push('');
    }

    if (total === 0) {
        lines.push('> *Aucun ticket en base — relancer une synchro ou ouvrir la modale pour fetcher depuis JIRA.*');
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Généré le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} via Squad Board*`);
    return lines.join('\n');
}

// ── Rapport HTML autonome (ouvrable navigateur, imprimable, Confluence-ready) ──
export function _buildSprintReportHtml(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'en cours' : 'clôturé';
    const stateColor = sprint.isCurrent ? '#10b981' : '#94a3b8';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const jiraBase = store.get('jiraUrl');
    const link = (key) => !jiraBase || !key
        ? `<span class="key">${esc(key)}</span>`
        : `<a class="key" href="${jiraBase.replace(/\/$/, '')}/browse/${esc(key)}" target="_blank" rel="noopener">${esc(key)}</a>`;

    const {
        total, ptsTotal, ptsDone, doneCount, veloPts, engagePct, engageDistinct,
        estimated, bufferTickets, bufferRealised, bufferRealShare,
    } = _sprintStats(sprint, tickets);

    const byStatus = new Map();
    for (const t of tickets) {
        if (!byStatus.has(t.status)) byStatus.set(t.status, []);
        byStatus.get(t.status).push(t);
    }
    const orderedStatuses = STATUS_ORDER.filter(s => byStatus.has(s));
    const statusEmoji = { todo: '◻️', inprog: '🔄', review: '🔍', test: '🧪', blocked: '⛔', done: '✅' };
    const statusColor = { todo: '#94a3b8', inprog: '#3b82f6', review: '#8b5cf6', test: '#06b6d4', blocked: '#ef4444', done: '#10b981' };

    const burndownSvg = _miniBurndownSvg(sprint, tickets);

    const groupsHtml = orderedStatuses.map(status => {
        const group = byStatus.get(status);
        const ptsGroup = sumBy(group, t => t.points);
        const label = STATUS_LABELS[status] || status;
        const emoji = statusEmoji[status] || '◇';
        const color = statusColor[status] || '#94a3b8';
        const rows = group.map(t => {
            const tIcon = _typeIcon(t.type, t.labels);
            const bufferTag = isBufferItem(t) ? ' <span class="tag tag-buffer">🛡️ Buffer</span>' : '';
            const retroTag = (t.labels || []).some(l => /^ActionRetro$/i.test(l)) ? ' <span class="tag tag-retro">🔁 Retro</span>' : '';
            return `<tr>
                <td class="ic">${tIcon}</td>
                <td>${link(t.id)}${bufferTag}${retroTag}</td>
                <td>${esc(t.title || '(sans titre)')}</td>
                <td class="num">${t.points || '—'}</td>
                <td>${esc((t.leader || t.assignee) || '—')}</td>
            </tr>`;
        }).join('');
        return `
            <section class="g">
                <h2 style="border-left-color:${color}">
                    ${emoji} ${esc(label)} <small>— ${group.length} ticket${group.length > 1 ? 's' : ''}${ptsGroup > 0 ? ` · ${ptsGroup} pts` : ''}</small>
                </h2>
                <table>
                    <thead><tr><th>Type</th><th>Clé</th><th>Titre</th><th>Pts</th><th>Assigné·e</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport sprint — ${esc(sprint.name)}</title>
<style>
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 980px; margin: 24px auto; padding: 0 20px; color: #0f172a; line-height: 1.5; }
header.hdr { border-left: 4px solid #3b82f6; padding: 8px 16px 8px 18px; background: linear-gradient(90deg, #f1f5f9, #fff); margin-bottom: 24px; border-radius: 0 8px 8px 0; }
h1 { margin: 0 0 6px; font-size: 22px; }
.state { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; color: #fff; background: ${stateColor}; text-transform: uppercase; letter-spacing: .04em; margin-right: 8px; vertical-align: 2px; }
.meta { color: #64748b; font-size: 13px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 18px 0 28px; }
.stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.stat .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
.stat .val { font-size: 22px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.stat .val small { font-size: 11px; font-weight: 500; color: #94a3b8; margin-left: 3px; }
.stat .sub { font-size: 10px; color: #94a3b8; }
.stat--primary { background: linear-gradient(135deg, #dbeafe, #fff); border-color: #93c5fd; }
.stat--primary .val { color: #1d4ed8; }
.stat--engagement { background: linear-gradient(135deg, #f1f5f9, #fff); border-color: #cbd5e1; }
.stat--engagement .val { color: #475569; }
.stat--buffer { background: repeating-linear-gradient(135deg, rgba(139,92,246,.16) 0 6px, rgba(139,92,246,.06) 6px 12px); border-color: #c4b5fd; }
.stat--buffer .val { color: #6d28d9; }
.burndown { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 0 0 28px; }
.burndown h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
section.g { margin-bottom: 24px; }
section.g h2 { font-size: 15px; padding: 6px 12px; border-left: 4px solid; background: #f8fafc; border-radius: 0 6px 6px 0; margin: 0 0 8px; }
section.g h2 small { color: #64748b; font-weight: 400; font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 7px 10px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
tr:hover td { background: #f8fafc; }
.ic { width: 28px; text-align: center; font-size: 14px; }
.key { font-family: ui-monospace, "SF Mono", monospace; font-size: 12px; color: #1d4ed8; text-decoration: none; }
.key:hover { text-decoration: underline; }
.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.tag { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; margin-left: 4px; }
.tag-buffer { background: rgba(139,92,246,.16); color: #6d28d9; }
.tag-retro { background: rgba(245,158,11,.16); color: #b45309; }
footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
@media print {
    body { margin: 0; padding: 12px; }
    section.g { page-break-inside: avoid; }
    a.key { color: #1d4ed8; text-decoration: underline; }
}
</style>
</head>
<body>
<header class="hdr">
    <h1><span class="state">${esc(stateLabel)}</span>📊 ${esc(sprint.name)}</h1>
    <div class="meta">
        ${sprint.team ? `👥 <strong>${esc(sprint.team)}</strong>` : ''}
        ${endLabel ? ` · 📅 fin ${esc(endLabel)}` : ''}
    </div>
</header>

<div class="stats">
    <div class="stat stat--primary">
        <div class="lbl">Vélocité</div>
        <div class="val">${veloPts}<small>pts</small></div>
        <div class="sub">${engageDistinct ? `livré · ${engagePct}% de l'engagé` : 'livré'}</div>
    </div>
    <div class="stat">
        <div class="lbl">Tickets</div>
        <div class="val">${doneCount}<small>/${total || '—'}</small></div>
        <div class="sub">${pct(doneCount, total)}% terminés</div>
    </div>
    <div class="stat">
        <div class="lbl">Story Points</div>
        <div class="val">${ptsDone}<small>/${ptsTotal || '—'}</small></div>
        <div class="sub">${pct(ptsDone, ptsTotal)}% livrés</div>
    </div>
    ${engageDistinct ? `
    <div class="stat">
        <div class="lbl">Engagé (estimé)</div>
        <div class="val">${estimated}<small>pts</small></div>
        <div class="sub">${engagePct}% réalisé</div>
    </div>` : ''}
    <div class="stat stat--buffer-label">
        <div class="lbl">🛡️ Buffer</div>
        <div class="val">${bufferRealised}<small>pts</small></div>
        <div class="sub">${bufferRealised === 0 ? 'aucun buffer' : `${bufferTickets.length ? `${bufferTickets.length} ticket${bufferTickets.length > 1 ? 's' : ''}` : 'snapshot JIRA'}${bufferRealShare ? ` · ${bufferRealShare}% de l'engagé` : ''}`}</div>
    </div>
</div>

${burndownSvg ? `<div class="burndown"><h3>📉 Burndown</h3>${burndownSvg}</div>` : ''}

${total === 0 ? '<p style="text-align:center;color:#94a3b8;font-style:italic;padding:40px 0">Aucun ticket à afficher.</p>' : groupsHtml}

<footer>Généré le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} via <strong>Squad Board</strong></footer>
</body>
</html>`;
}

// SVG burndown mini autonome (idéale vs réelle linéaire)
function _miniBurndownSvg(sprint, tickets) {
    if (!sprint?.startDate || !sprint?.endDate || !tickets?.length) return '';
    const start = new Date(String(sprint.startDate).slice(0, 10)).getTime();
    const end   = new Date(String(sprint.endDate).slice(0, 10)).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return '';
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const ptsTotal = sumBy(tickets, t => t.points);
    const ptsDone = sumBy(tickets.filter(t => t.status === 'done'), t => t.points);
    if (ptsTotal === 0) return '';

    const W = 880, H = 200, PAD = 30;
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    const xAt = i => PAD + (i / (days - 1)) * innerW;
    const yAt = v => PAD + (1 - v / ptsTotal) * innerH;

    // Idéale : ligne droite de ptsTotal à 0
    const idealPath = `M ${xAt(0)} ${yAt(ptsTotal)} L ${xAt(days - 1)} ${yAt(0)}`;
    // Réelle : approximation linéaire jusqu'à aujourd'hui (cd = current day, cap clamp)
    const now = Date.now();
    const cd = Math.max(0, Math.min(days - 1, Math.floor((now - start) / 86400000)));
    const points = [];
    for (let i = 0; i <= cd; i++) {
        const remaining = Math.round(ptsTotal - (ptsDone * i / Math.max(1, cd)));
        points.push(`${xAt(i)},${yAt(remaining)}`);
    }
    const realPath = `M ${points.join(' L ')}`;

    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:200px" xmlns="http://www.w3.org/2000/svg">
        <rect x="${PAD}" y="${PAD}" width="${innerW}" height="${innerH}" fill="#fff" stroke="#e2e8f0"/>
        <line x1="${PAD}" y1="${yAt(ptsTotal / 2)}" x2="${W - PAD}" y2="${yAt(ptsTotal / 2)}" stroke="#f1f5f9"/>
        <path d="${idealPath}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 5" fill="none"/>
        <path d="${realPath}" stroke="#0284c7" stroke-width="2.5" fill="none"/>
        <text x="${PAD}" y="${PAD - 8}" font-size="10" fill="#64748b">${ptsTotal} pts</text>
        <text x="${PAD}" y="${H - 8}" font-size="10" fill="#64748b">J1</text>
        <text x="${W - PAD}" y="${H - 8}" font-size="10" fill="#64748b" text-anchor="end">J${days}</text>
        <text x="${W - PAD}" y="${PAD - 8}" font-size="10" fill="#0284c7" text-anchor="end" font-weight="600">Réel · ${ptsDone}/${ptsTotal} pts</text>
    </svg>`;
}

// Version compacte dark de la card "Temps par colonne" du Dashboard (cf stage_flow_card.js),
// pour l'insérer dans la présentation TV du Mode Demo (colonne burnup, sous la vélocité).
export function _demoStageFlowHtml(tickets) {
    const groups = computeStageFlow(tickets);
    if (!groups.length) return '';
    return `<div class="demo-stageflow-card">
        <div class="demo-stageflow-hdr">
            <span class="demo-stageflow-title">⏳ Temps par colonne</span>
            <span class="demo-stageflow-sub">médiane (P50) par étape</span>
        </div>
        <div class="demo-stageflow-row">
            ${groups.map(g => `
            <div class="demo-stageflow-seg" title="${g.count} ticket${g.count > 1 ? 's' : ''} concerné${g.count > 1 ? 's' : ''} — médiane ${g.medDays} j · P85 ${g.p85Days} j · moyenne ${g.avgDays} j">
                <span class="demo-stageflow-lbl">${STAGE_ICONS[g.key] || ''} ${esc(g.label)}</span>
                <span class="demo-stageflow-val">${g.medDays}<small> j</small></span>
                <span class="demo-stageflow-count">${g.count} tk</span>
            </div>`).join('')}
        </div>
    </div>`;
}
