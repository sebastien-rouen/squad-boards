/**
 * Section « Rapport complet » (#reports/<équipe>/full) : un DOCUMENT, pas une concaténation.
 *
 *   1. En-tête : équipe, sprint affiché et ses dates, PI, date de génération ;
 *   2. 🧭 En bref : une ligne par section, tirée des MÊMES calculs que les sections (build*Data) —
 *      le résumé ne peut pas contredire le détail ;
 *   3. les sections dans l'ordre du sommaire, chacune au format choisi.
 * Le rendu « Texte » de la vue montre l'en-tête et l'En bref ; le bouton Copier emporte le tout.
 *
 * Avant 3.215.0 : six textes bout à bout, sans en-tête ni résumé, aux styles mêlés
 * (« === Sprint === » à côté des sections à puces), et une section Équipes de 30 lignes.
 *
 * `makeFullGenerator(GENERATORS)` reçoit les générateurs de reports.js : les importer d'ici créerait
 * un cycle (reports.js importe ce module), et leurs `const` fléchées seraient en TDZ.
 */

import { esc, pct, fmtDate } from '../utils.js';
import { B, E } from './reports-fmt.js';
import { buildFlowData } from './reports-flow.js';
import { buildSupportData, displayName } from './reports-support.js';
import { buildRoadmapData, buildBurnupData } from './reports-roadmap.js';
import { buildPiData } from './reports-pi.js';
import { buildTeamsData } from './reports-teams.js';
import { idleReason, num, shortDate } from './reports-scope.js';

/** Sections reprises, dans l'ordre du sommaire (les interactives — burnup, votes… — n'ont pas d'export). */
const ORDER = ['sprint', 'kanban', 'support', 'roadmap', 'teams', 'pi'];
const SEP = '\n\n────────────────────\n\n';

/** En-tête commun : « Fuego · Sprint 31.3 (05/10 → 18/10) · PI 31 ». */
function heading(ctx) {
    const team = ctx.team && ctx.team !== 'all' ? ctx.team : 'Toutes équipes';
    const sp = ctx.sprint;
    const key = (String(sp?.name || '').match(/(\d+\.\d+)/) || [])[1];
    const dates = sp?.startDate && sp?.endDate ? ` (${shortDate(Date.parse(String(sp.startDate).slice(0, 10) + 'T12:00:00'))} → ${shortDate(Date.parse(String(sp.endDate).slice(0, 10) + 'T12:00:00'))})` : '';
    return { team, sprint: key ? `Sprint ${key}${dates}` : 'Sprint inconnu', pi: ctx.displayPiNum ? `PI ${ctx.displayPiNum}` : '', date: fmtDate(new Date()) };
}

/**
 * Lignes « En bref » : [icône, titre, texte]. Chaque ligne relit le calcul de SA section ; une
 * section sans donnée (PI à venir…) le dit au lieu d'afficher des zéros.
 */
function briefLines(ctx) {
    const lines = [];
    const sp = pct(ctx.done, ctx.total), pp = pct(ctx.donePts, ctx.totalPts);
    const blocked = (ctx.tickets || []).filter(t => t.status === 'blocked').length;
    lines.push(['📋', 'Sprint', ctx.total
        ? `${ctx.done}/${ctx.total} tickets (${sp} %) · ${ctx.donePts}/${ctx.totalPts} pts (${pp} %)${blocked ? ` · 🚫 ${blocked} bloqué${blocked > 1 ? 's' : ''}` : ''}`
        : 'aucun ticket engagé']);
    if (ctx.meteo?.text) lines.push(['🌤️', 'Météo', ctx.meteo.text]);

    const idle = idleReason(ctx.period);
    const f = buildFlowData(ctx);
    lines.push(['🗂️', 'Flow', idle ? idle.title
        : `${f.delivered} livré${f.delivered > 1 ? 's' : ''}${f.p50 != null ? ` · cycle time ${num(f.p50)} j (P85 ${num(f.p85)} j)` : ''}`
          + `${f.now ? ` · WIP ${f.now.wip}${f.now.limit != null ? `/${f.now.limit}` : ''}` : ''}${f.now?.aging.length ? ` · 🐢 ${f.now.aging.length} qui traînent` : ''}`]);

    const s = buildSupportData(ctx);
    lines.push(['🛡️', 'Support', idle ? idle.title
        : `${s.entered} entré${s.entered > 1 ? 's' : ''} · ${s.resolved} résolu${s.resolved > 1 ? 's' : ''}${s.open ? ` · ${s.open.length} ouvert${s.open.length > 1 ? 's' : ''}` : ''}`
          + `${s.rotation.length ? ` · astreinte : ${s.rotation.map(r => r.members.map(m => displayName(m.name)).join(', ')).join(' ; ')}` : ''}`]);

    const r = buildRoadmapData(ctx);
    if (r.piNum) {
        lines.push(['🗺️', 'Roadmap', r.total
            ? `${r.delivered}/${r.total} features livrées · ${r.inProgress} en cours${r.atRisk ? ` (dont ${r.atRisk} en retard)` : ''} · ${r.notStarted} pas démarrée${r.notStarted > 1 ? 's' : ''}`
            : 'aucune feature rattachée au PI']);
    }

    const b = buildBurnupData(ctx);
    if (b?.total) {
        lines.push(['📈', `PI ${ctx.displayPiNum}`, `${b.done}/${b.total} pts (${pct(b.done, b.total)} %) · ${b.w.elapsed} % du temps écoulé · +${b.added} pts ajoutés depuis le début`]);
    }

    const pi = buildPiData(ctx);
    if (pi.piNum && pi.objectives.length) {
        lines.push(['🎯', 'Objectifs', `${pi.objDone}/${pi.objectives.length} atteint${pi.objDone > 1 ? 's' : ''}${pi.score != null ? ` · prédictibilité ${pi.score} %` : ''}`]);
    }

    const t = buildTeamsData(ctx);
    if (t.mode === 'team' && t.pres.people.length) {
        lines.push(['👥', 'Équipe', `${t.pres.people.length} personnes (${num(Math.round(t.pres.etp * 10) / 10)} ETP)`
            + `${t.pres.rate != null ? ` · présence ${t.pres.rate} %` : ''}${t.unassigned ? ` · ${t.unassigned}/${t.total} tickets sans responsable` : ''}`]);
    } else if (t.mode === 'train') {
        lines.push(['👥', 'Équipes', `${t.rows.length} équipe${t.rows.length > 1 ? 's' : ''} sur le sprint`]);
    }
    return lines;
}

export function makeFullGenerator(G) {
    const sections = (ctx, fmt) => ORDER.map(id => G[id][fmt](ctx));
    return {
        text: ctx => {
            const h = heading(ctx);
            const head = `📄 Rapport — ${h.team} — ${h.sprint}${h.pi ? ` · ${h.pi}` : ''}\nGénéré le ${h.date}`;
            const brief = `🧭 En bref\n${briefLines(ctx).map(([i, l, v]) => `- ${i} ${l} : ${v}`).join('\n')}`;
            return [`${head}\n\n${brief}`, ...sections(ctx, 'text')].join(SEP);
        },
        slack: ctx => {
            const h = heading(ctx);
            const head = `<div class="s-header">${E('📄')} Rapport · ${esc(h.team)} · ${esc(h.sprint)}${h.pi ? ` · ${esc(h.pi)}` : ''}</div><span class="s-muted">Généré le ${esc(h.date)}</span>\n`;
            const brief = `\n${E('🧭')} ${B('EN BREF')}\n${briefLines(ctx).map(([i, l, v]) => `${E(i)} ${B(esc(l))} : ${esc(v)}`).join('\n')}`;
            return [head + brief, ...sections(ctx, 'slack')].join('\n\n<hr class="s-divider">\n');
        },
        confluence: ctx => {
            const h = heading(ctx);
            const head = `<h1>Rapport — ${esc(h.team)} — ${esc(h.sprint)}${h.pi ? ` · ${esc(h.pi)}` : ''}</h1><p><em>Généré le ${esc(h.date)}</em></p>`;
            const brief = `<h2>En bref</h2><table>${briefLines(ctx).map(([i, l, v]) => `<tr><th>${i} ${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
            return [head + brief, ...sections(ctx, 'confluence')].join('<hr/>');
        },
        // Vue « Texte » : en-tête + En bref ; le détail est dans les sections au-dessus, et le bouton
        // Copier (data-plain = `text`) emporte le document entier.
        html: ctx => {
            const h = heading(ctx);
            return `
            <div class="rpt-pi-card">
                <header class="rpt-pi-head">
                    <div class="rpt-pi-title-row">
                        <span class="rpt-pi-num">📄 Rapport</span>
                        <span class="rpt-pi-team">${esc(h.team)}</span>
                        <span class="rpt-pi-name">${esc(h.sprint)}${h.pi ? ` · ${esc(h.pi)}` : ''} · généré le ${esc(h.date)}</span>
                    </div>
                </header>
                <section class="rpt-pi-section">
                    <h4 class="rpt-pi-h">🧭 En bref</h4>
                    <dl class="rpt-full-brief">${briefLines(ctx).map(([i, l, v]) => `
                        <div class="rpt-full-row"><dt><span aria-hidden="true">${i}</span> ${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}
                    </dl>
                </section>
                <p class="rpt-flow-muted">📋 Le bouton Copier emporte le rapport entier : cet en-tête, l'En bref puis Sprint, Kanban / Flow,
                    Support, Roadmap, Équipe et PI Planning, au format choisi (Texte, Slack ou Confluence).</p>
            </div>`;
        },
    };
}
