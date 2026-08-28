/**
 * Section « PI Planning » du rapport (#reports/<équipe>/pi).
 *
 * Deux contenus, tous deux DYNAMIQUES sur l'équipe et le PI sélectionnés :
 *   1. les PI Objectifs (engagés / extension, BV, score de prédictibilité SAFe) ;
 *   2. le détail sprint par sprint — User Stories et Buffer, titre + story points.
 *
 * ⚠️ Périmètre d'un sprint : source unique `sprintScope()` (utils/sprint-scope.js), qui
 * porte la règle engagement (`belongedToSprint`) / réalisé (`isInSprint` + done). On part
 * donc de `teamTickets` (TOUS les tickets de l'équipe) et jamais des tickets déjà réduits
 * au PI affiché : un ticket reporté porte le sprint d'ARRIVÉE, souvent d'un autre PI, et
 * disparaîtrait de son sprint d'engagement.
 * ⚠️ Le matching se fait par clé « NN.N » : elle ne distingue pas les équipes entre elles.
 * C'est volontaire ici — `teamTickets` est déjà filtré en amont, et sur « Toutes équipes »
 * l'agrégation par sprint est justement ce que l'on veut montrer.
 *
 * Résolution des objectifs : `resolvePiObjectives()` (utils.js), la même que pi.js et
 * dashboard.js — un PI passé/à venir lit son snapshot `piObjectives[<PI>]`.
 */

import {
    esc, sumBy, pct, isBufferItem, sprintScope, carriedOverTo,
    extractSprintLabel, resolvePiObjectives, breathIdxOf, sprintNamesOf, getStatusLabel,
} from '../utils.js';
import { STATUS_LABELS } from '../config.js';
import { B, E, SB, CS } from './reports-fmt.js';

const ST_ICON = { done: '✓', inprog: '●', review: '◑', test: '◕', blocked: '✗', todo: '○' };
const OBJ_ICON = { done: '✅', inprog: '🔄', todo: '⬜', blocked: '🚫' };
/** Business Value SAFe : entier borné 0-10 (même normalisation que le Dashboard). */
const bv = o => Math.max(0, Math.min(10, parseInt(o.bv, 10) || 0));
const clr = p => (p >= 80 ? 'green' : p >= 50 ? 'yellow' : 'red');
const plural = (n, s = 's') => (n > 1 ? s : '');

/**
 * Prépare tout ce qu'affichent les 4 formats — un seul calcul, pas de divergence possible.
 * @param {object} ctx contexte de rendu de reports.js
 */
export function buildPiData(ctx) {
    const { piInfo, team, teamTickets = [], displayPiNum = 0, isCurrentPi = true } = ctx;

    // ── Objectifs du PI affiché, filtrés sur l'équipe ────────────────────────
    const allObjs = resolvePiObjectives({ piInfo, piNum: displayPiNum, isCurrentPi })
        .filter(o => String(o.text || '').trim());
    const scoped = team && team !== 'all';
    // Égalité stricte, comme pi.js et dashboard.js : les compteurs des 3 vues doivent
    // rester identiques. Les objectifs SANS équipe ne sont pas jetés en silence — ils
    // sont montrés à part comme transverses.
    const objectives = scoped ? allObjs.filter(o => (o.team || '') === team) : allObjs;
    const crossTeam = scoped ? allObjs.filter(o => !String(o.team || '').trim()) : [];

    const committed = objectives.filter(o => o.committed);
    const stretch = objectives.filter(o => !o.committed);
    const objDone = objectives.filter(o => o.status === 'done').length;
    // Prédictibilité SAFe = BV des engagements livrés / BV engagé ; le stretch livré est un
    // bonus au numérateur (le score peut donc dépasser 100 %).
    const bvCommitted = sumBy(committed, bv);
    const bvDone = sumBy(committed.filter(o => o.status === 'done'), bv);
    const bvStretch = sumBy(stretch.filter(o => o.status === 'done'), bv);
    const score = bvCommitted > 0 ? Math.round(((bvDone + bvStretch) / bvCommitted) * 100) : null;

    // ── Sprints du PI ────────────────────────────────────────────────────────
    // Nombre de sprints = configuration du PI, élargie au plus grand index RÉELLEMENT
    // observé (un PI peut compter un sprint de plus que la config). breathIdxOf porte
    // ce max : c'est aussi l'index du sprint de respiration.
    const perPi = piInfo?.sprintsPerPI || 5;
    const observed = [];
    if (displayPiNum) {
        for (const t of teamTickets) {
            for (const name of sprintNamesOf(t)) {
                const key = extractSprintLabel(name);
                if (key && key.split('.')[0] === String(displayPiNum)) observed.push(key);
            }
        }
    }
    const breathIdx = breathIdxOf(observed, perPi);
    const labels = displayPiNum
        ? Array.from({ length: Math.max(perPi, breathIdx) }, (_, i) => `${displayPiNum}.${i + 1}`)
        : [];

    const sprints = labels.map((label, i) => {
        const { engaged, done } = sprintScope(teamTickets, label);
        const doneIds = new Set(done.map(t => t.id));
        const split = kind => {
            const items = engaged.filter(kind === 'buffer' ? isBufferItem : t => !isBufferItem(t));
            const doneItems = items.filter(t => doneIds.has(t.id));
            return {
                items,
                pts: sumBy(items, t => t.points || 0),
                donePts: sumBy(doneItems, t => t.points || 0),
                done: doneItems.length,
            };
        };
        const us = split('us');
        const buffer = split('buffer');
        return {
            label, i,
            isBreath: breathIdx > 0 && i + 1 === breathIdx,
            us, buffer, doneIds,
            pts: us.pts + buffer.pts,
            donePts: us.donePts + buffer.donePts,
            count: engaged.length,
        };
    });

    const piPts = sumBy(sprints, s => s.pts);
    const piDonePts = sumBy(sprints, s => s.donePts);

    return {
        piNum: displayPiNum, isCurrentPi,
        teamLabel: scoped ? team : 'Toutes équipes',
        objectives, crossTeam, committed, stretch, objDone,
        bvCommitted, bvDone, bvStretch, score,
        sprints, piPts, piDonePts,
        piName: piInfo?.name && String(piInfo.name).includes(String(displayPiNum)) ? piInfo.name : null,
    };
}

// ── Rendu riche (format « Texte » de la vue) ─────────────────────────────────

/** Une ligne de ticket : icône de statut, titre, points, badge, chip de report. */
function ticketRow(t, sprintLabel, isDone) {
    const st = t.status || 'todo';
    const lbl = STATUS_LABELS[st] || st;
    const dest = carriedOverTo(t, sprintLabel);
    const chip = dest
        ? `<span class="rpt-pi-carry" title="Reporté vers ${esc(dest)}">↪ ${esc(extractSprintLabel(dest) || dest)}</span>`
        : '';
    return `<div class="rpt-ti rpt-ti--${esc(st)}${isDone ? '' : ' rpt-pi-ti--open'}">
        <span class="rpt-ti-st rpt-pi-st-${esc(st)}">${ST_ICON[st] || '○'}</span>
        <span class="rpt-ti-title" title="${esc(getStatusLabel(t))}">${esc(t.title || t.key || 'Sans titre')}</span>
        ${chip}
        ${t.points ? `<span class="rpt-ti-pts">${t.points} pts</span>` : ''}
        <span class="rpt-ti-badge rpt-ti-s-${esc(st)}">${esc(lbl)}</span>
    </div>`;
}

/** Groupe « User Stories » ou « Buffer » d'un sprint. */
function groupHtml(grp, icon, label, sprintLabel, doneIds) {
    if (!grp.items.length) return '';
    return `<div class="rpt-ticket-group">
        <div class="rpt-tg-hdr">
            <span class="rpt-tg-icon">${icon}</span>
            <span class="rpt-tg-label">${label}</span>
            <span class="rpt-tg-count">${grp.items.length} ticket${plural(grp.items.length)}</span>
            <span class="rpt-tg-done-ratio">${grp.done}/${grp.items.length} terminé${plural(grp.done)}</span>
            <span class="rpt-tg-pts"><span class="rpt-tg-pts-done">${grp.donePts}</span>/<span class="rpt-tg-pts-total">${grp.pts}</span> pts</span>
        </div>
        <div class="rpt-tg-items">${grp.items.map(t => ticketRow(t, sprintLabel, doneIds.has(t.id))).join('')}</div>
    </div>`;
}

/** Carte d'un PI Objectif. */
function objectiveHtml(o) {
    const st = o.status || 'todo';
    const b = bv(o);
    return `<article class="rpt-pi-obj rpt-pi-obj--${esc(st)}">
        <span class="rpt-pi-obj-icon">${OBJ_ICON[st] || '⬜'}</span>
        <div class="rpt-pi-obj-main">
            <p class="rpt-pi-obj-text">${esc(o.text)}</p>
            <div class="rpt-pi-obj-meta">
                <span class="rpt-pi-chip rpt-pi-chip--${o.committed ? 'commit' : 'stretch'}">${o.committed ? 'Engagé' : 'Extension'}</span>
                ${b ? `<span class="rpt-pi-chip rpt-pi-chip--bv" title="Business Value">💰 BV ${b}</span>` : ''}
                ${o.team ? `<span class="rpt-pi-chip">${esc(o.team)}</span>` : ''}
            </div>
        </div>
        <span class="rpt-ti-badge rpt-ti-s-${esc(st)}">${esc(STATUS_LABELS[st] || st)}</span>
    </article>`;
}

/** Bloc dépliable d'un sprint. */
function sprintHtml(s) {
    const p = pct(s.donePts, s.pts);
    if (!s.count) {
        return `<div class="rpt-pi-sprint rpt-pi-sprint--empty">
            <span class="rpt-pi-sprint-lbl">${esc(s.label)}${s.isBreath ? ' 🍃' : ''}</span>
            <span class="rpt-pi-sprint-none">Aucun ticket engagé</span>
        </div>`;
    }
    return `<details class="rpt-pi-sprint"${s.donePts < s.pts ? ' open' : ''}>
        <summary class="rpt-pi-sprint-hdr">
            <span class="rpt-pi-sprint-lbl">${esc(s.label)}${s.isBreath ? ' <span class="rpt-pi-breath" title="Sprint de respiration">🍃</span>' : ''}</span>
            <span class="rpt-pi-sprint-sub">${s.us.items.length} US${s.buffer.items.length ? ` · ${s.buffer.items.length} buffer` : ''}</span>
            <span class="rpt-pi-sprint-bar"><i class="rpt-pi-bar-fill rpt-pi-bar--${clr(p)}" style="width:${p}%"></i></span>
            <span class="rpt-pi-sprint-pts"><b>${s.donePts}</b>/${s.pts} pts</span>
            <span class="rpt-pi-sprint-pct rpt-pi-pct--${clr(p)}">${p}%</span>
        </summary>
        <div class="rpt-pi-sprint-body">
            ${groupHtml(s.us, '📝', 'User Stories', s.label, s.doneIds)}
            ${groupHtml(s.buffer, '🔄', 'Buffer', s.label, s.doneIds)}
        </div>
    </details>`;
}

function htmlReport(ctx) {
    const d = buildPiData(ctx);
    if (!d.piNum) return `<div class="empty-state">Aucun PI identifié — configurer « Sprint &amp; PI » dans les Paramètres.</div>`;

    const objPct = pct(d.objDone, d.objectives.length);
    const ptsPct = pct(d.piDonePts, d.piPts);
    const objList = list => list.map(objectiveHtml).join('');

    return `
    <div class="rpt-pi-card">
        <header class="rpt-pi-head">
            <div class="rpt-pi-title-row">
                <span class="rpt-pi-num">PI #${d.piNum}</span>
                <span class="rpt-pi-team">${esc(d.teamLabel)}</span>
                <span class="rpt-pi-badge rpt-pi-badge--${d.isCurrentPi ? 'current' : 'other'}">${d.isCurrentPi ? 'PI courant' : 'PI archivé / à venir'}</span>
                ${d.piName ? `<span class="rpt-pi-name">${esc(d.piName)}</span>` : ''}
            </div>
            ${d.score != null ? `
            <div class="rpt-pi-score rpt-pi-pct--${clr(d.score)}" title="Prédictibilité SAFe : BV des engagements livrés (stretch en bonus) / BV engagé">
                <span class="rpt-pi-score-val">${d.score}%</span>
                <span class="rpt-pi-score-lbl">Prédictibilité</span>
            </div>` : ''}
        </header>

        <div class="rpt-metrics-row">
            <div class="rpt-metric">
                <span class="rpt-metric-label">Objectifs</span>
                <span class="rpt-metric-val">${d.objDone}/${d.objectives.length}</span>
                <div class="rpt-metric-bar"><div class="rpt-pi-bar--${clr(objPct)}" style="width:${objPct}%"></div></div>
                <span class="rpt-metric-pct rpt-pi-pct--${clr(objPct)}">${objPct}%</span>
            </div>
            <div class="rpt-metric">
                <span class="rpt-metric-label">Business Value</span>
                <span class="rpt-metric-val">${d.bvDone}/${d.bvCommitted}</span>
                <span class="rpt-metric-pct">${d.bvStretch ? `+${d.bvStretch} extension` : 'engagé'}</span>
            </div>
            <div class="rpt-metric">
                <span class="rpt-metric-label">Story Points PI</span>
                <span class="rpt-metric-val">${d.piDonePts}/${d.piPts}</span>
                <div class="rpt-metric-bar"><div class="rpt-pi-bar--${clr(ptsPct)}" style="width:${ptsPct}%"></div></div>
                <span class="rpt-metric-pct rpt-pi-pct--${clr(ptsPct)}">${ptsPct}%</span>
            </div>
        </div>

        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">🎯 PI Objectifs<span class="rpt-pi-h-count">${d.objectives.length}</span></h4>
            ${d.objectives.length ? `
                ${d.committed.length ? `<div class="rpt-pi-obj-grp"><span class="rpt-pi-obj-grp-lbl">Engagements${d.bvCommitted ? ` · ${d.bvCommitted} BV` : ''}</span>${objList(d.committed)}</div>` : ''}
                ${d.stretch.length ? `<div class="rpt-pi-obj-grp"><span class="rpt-pi-obj-grp-lbl">Extension (stretch)</span>${objList(d.stretch)}</div>` : ''}
            ` : `<div class="empty-state rpt-pi-empty">Aucun objectif défini pour ${esc(d.teamLabel)} sur le PI ${d.piNum}.</div>`}
            ${d.crossTeam.length ? `<details class="rpt-pi-obj-grp rpt-pi-obj-grp--cross">
                <summary class="rpt-pi-obj-grp-lbl">Objectifs sans équipe (transverses) · ${d.crossTeam.length}</summary>
                ${objList(d.crossTeam)}
            </details>` : ''}
        </section>

        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">🗂️ Détail par sprint<span class="rpt-pi-h-count">${d.sprints.length}</span></h4>
            <div class="rpt-pi-sprints">${d.sprints.map(sprintHtml).join('')}</div>
        </section>
    </div>`;
}

// ── Formats d'export ─────────────────────────────────────────────────────────

function textReport(ctx) {
    const d = buildPiData(ctx);
    if (!d.piNum) return '=== PI ===\nAucun PI identifie';
    let r = `=== PI #${d.piNum} - ${d.teamLabel} ===\n`;
    r += `Objectifs: ${d.objDone}/${d.objectives.length}`;
    if (d.score != null) r += ` | Predictibilite: ${d.score}%`;
    r += `\nStory points: ${d.piDonePts}/${d.piPts} (${pct(d.piDonePts, d.piPts)}%)\n`;
    if (d.objectives.length) {
        r += `\n-- PI Objectifs --\n`;
        for (const o of d.objectives) {
            const mark = o.status === 'done' ? '[x]' : o.status === 'inprog' ? '[~]' : '[ ]';
            r += `  ${mark} ${o.text}${bv(o) ? ` (BV ${bv(o)})` : ''}${o.committed ? ' [engage]' : ' [stretch]'}\n`;
        }
    }
    for (const s of d.sprints) {
        if (!s.count) continue;
        r += `\n-- Sprint ${s.label}${s.isBreath ? ' (respiration)' : ''} : ${s.donePts}/${s.pts} pts --\n`;
        for (const [grp, name] of [[s.us, 'User Stories'], [s.buffer, 'Buffer']]) {
            if (!grp.items.length) continue;
            r += `  ${name} (${grp.done}/${grp.items.length}, ${grp.donePts}/${grp.pts} pts)\n`;
            for (const t of grp.items) {
                r += `    ${s.doneIds.has(t.id) ? '[x]' : '[ ]'} ${t.title || t.key || '?'}${t.points ? ` (${t.points} pts)` : ''}\n`;
            }
        }
    }
    return r;
}

function slackReport(ctx) {
    const d = buildPiData(ctx);
    if (!d.piNum) return `<div class="s-header">${E('🗓️')} PI</div><hr class="s-divider">Aucun PI identifié`;
    const ptsPct = pct(d.piDonePts, d.piPts);
    let r = `<div class="s-header">${E('🗓️')} PI #${d.piNum} · ${esc(d.teamLabel)}</div><hr class="s-divider">`;
    r += `${E('🎯')} ${B('Objectifs')}: ${d.objDone}/${d.objectives.length}`;
    if (d.score != null) r += ` · ${B('Prédictibilité')} ${SB(d.score + '%', clr(d.score))}`;
    r += `\n${E('💎')} ${B('Story points')}: ${d.piDonePts}/${d.piPts} ${SB(ptsPct + '%', clr(ptsPct))}\n`;

    for (const [list, label] of [[d.committed, 'ENGAGEMENTS'], [d.stretch, 'EXTENSION (STRETCH)']]) {
        if (!list.length) continue;
        r += `\n${B(label)}\n`;
        for (const o of list) {
            r += `${E(OBJ_ICON[o.status] || '⬜')} ${esc(o.text)}${bv(o) ? ` <span class="s-muted">(💰${bv(o)})</span>` : ''}\n`;
        }
    }

    for (const s of d.sprints) {
        if (!s.count) continue;
        const p = pct(s.donePts, s.pts);
        r += `\n${E(s.isBreath ? '🍃' : '📆')} ${B(`Sprint ${s.label}`)} — ${B(`${s.donePts}/${s.pts} pts`)} ${SB(p + '%', clr(p))}\n`;
        for (const [grp, icon, name] of [[s.us, '📝', 'User Stories'], [s.buffer, '🔄', 'Buffer']]) {
            if (!grp.items.length) continue;
            r += `${E(icon)} ${B(name)} <span class="s-muted">(${grp.done}/${grp.items.length} · ${grp.donePts}/${grp.pts} pts)</span>\n`;
            for (const t of grp.items) {
                const pts = t.points ? ` <span class="s-muted">[${t.points} pts]</span>` : '';
                r += `${E(s.doneIds.has(t.id) ? '✅' : '⬜')} ${esc(t.title || t.key || '?')}${pts}\n`;
            }
        }
    }
    return r;
}

function confluenceReport(ctx) {
    const d = buildPiData(ctx);
    if (!d.piNum) return `<h2>PI</h2><p>Aucun PI identifié</p>`;
    let r = `<h2>PI #${d.piNum} — ${esc(d.teamLabel)}</h2>`;
    r += `<p><strong>Objectifs :</strong> ${d.objDone}/${d.objectives.length}`;
    if (d.score != null) r += ` — <strong>Prédictibilité :</strong> ${CS(d.score + '%', clr(d.score))}`;
    r += ` — <strong>Story points :</strong> ${d.piDonePts}/${d.piPts}</p>`;

    if (d.objectives.length) {
        r += `<h3>PI Objectifs</h3><table><tr><th>Objectif</th><th>Engagement</th><th>BV</th><th>Statut</th></tr>`;
        r += d.objectives.map(o => `<tr><td>${esc(o.text)}</td><td>${o.committed ? 'Engagé' : 'Extension'}</td><td>${bv(o) || '-'}</td>`
            + `<td>${CS(STATUS_LABELS[o.status] || o.status || '-', o.status === 'done' ? 'green' : o.status === 'inprog' ? 'blue' : 'gray')}</td></tr>`).join('');
        r += `</table>`;
    }

    for (const s of d.sprints) {
        if (!s.count) continue;
        r += `<h3>Sprint ${esc(s.label)}${s.isBreath ? ' 🍃' : ''} — ${s.donePts}/${s.pts} pts</h3>`;
        r += `<table><tr><th>Type</th><th>Titre</th><th>Points</th><th>Statut</th></tr>`;
        for (const [grp, name] of [[s.us, 'US'], [s.buffer, 'Buffer']]) {
            r += grp.items.map(t => `<tr><td>${name}</td><td>${esc(t.title || t.key || '?')}</td><td>${t.points || '-'}</td>`
                + `<td>${CS(STATUS_LABELS[t.status] || t.status || '-', s.doneIds.has(t.id) ? 'green' : t.status === 'blocked' ? 'red' : 'gray')}</td></tr>`).join('');
        }
        r += `</table>`;
    }
    return r;
}

/** Générateur consommé par reports.js (`GENERATORS.pi`). */
export const PI_GENERATOR = {
    text: textReport,
    slack: slackReport,
    confluence: confluenceReport,
    html: htmlReport,
};
