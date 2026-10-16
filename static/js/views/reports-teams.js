/**
 * Section « Équipes » du rapport (#reports/<équipe>/teams), sur le SPRINT AFFICHÉ (`ctx.sprint`,
 * `ctx.tickets` = périmètre `sprintScope`, cf reports.js).
 *
 * Avant 3.215.0 : une ligne « done/total, points » pour CHACUNE des 30 équipes connues, quel que
 * soit le filtre — sur #reports/Fuego/teams, 29 lignes « 0/0 tickets » et celle de Fuego.
 *
 *   • Une équipe → son EFFECTIF du PI (`effectiveRosterForPi`, roster du PI et non l'historique des
 *     congés), pondéré par rôle (`teamEtp`, Paramètres → capacité par rôle) ; la PRÉSENCE de chacun
 *     sur le sprint (bande `presenceStripHtml`, la même que la carte roster de la météo), la
 *     présence en j/h et la CAPACITÉ PROJETÉE en story points (`sprintPointsProjection`, même calcul
 *     que la carte roster et la Base capacité de Santé) ; les RESPONSABLES des tickets (`t.leader || t.assignee`).
 *     ⚠️ Rapprocher responsables JIRA (« Fabien Gazelot ») et roster RH (« GAZELOT, Fabien ») serait
 *     une heuristique : les deux listes restent séparées. La part de tickets SANS responsable est
 *     dite (Fuego, sprint 31.3 : 27 sur 33) — c'est elle qui rend une répartition par personne vide.
 *   • Toutes équipes / groupe → une ligne par équipe : avancement du sprint, bloqués, j/h, présence.
 *   ⚠️ Jamais « ETP » à l'écran ni dans les exports (choix utilisateur) : j/h et story points.
 *     Les équipes sans ticket ni membre sont écartées (boards fantômes « B », « C »…).
 */

import { esc, pct, sumBy, effectiveRosterForPi, teamEtp, teamNameMatches } from '../utils.js';
import { store } from '../state.js';
import { presenceStripHtml, presenceLevel, sprintWorkDays, sprintPointsProjection } from '../components/meteo_fiche.js';
import { B, E, SB, CS } from './reports-fmt.js';
import { displayName } from './reports-support.js';
import { num } from './reports-scope.js';

const plural = (n, s = 's') => (n > 1 ? s : '');
const clr = p => (p == null ? 'gray' : p >= 80 ? 'green' : p >= 50 ? 'yellow' : 'red');
const round1 = v => Math.round(v * 10) / 10;
const jhTxt = v => num(round1(v));

/** Présence d'un ensemble de membres sur les jours du sprint, pondérée par la capacité du rôle. */
function presence(members, it, absences, roleCapacity) {
    const cap = teamEtp(members, roleCapacity || {});
    let theo = 0, avail = 0, awayDays = 0;
    const people = cap.members.map(m => {
        const lv = it ? it.days.map(iso => presenceLevel(m.name, iso, absences)) : [];
        const work = lv.filter(l => l !== 'off').length;
        const away = lv.filter(l => l === 'out').length + 0.5 * lv.filter(l => l === 'half').length;
        theo += (work * m.pct) / 100;
        avail += ((work - away) * m.pct) / 100;
        awayDays += away;
        return { ...m, away };
    });
    return { etp: cap.etp, people, theo, avail, awayDays, rate: theo ? Math.round((avail / theo) * 100) : null };
}

/** Un seul calcul pour les quatre formats (et le « En bref » du rapport complet). */
export function buildTeamsData(ctx) {
    const { team, teams = [], tickets = [], sprint, piInfo, displayPiNum, absences = [] } = ctx;
    const roster = effectiveRosterForPi(piInfo, displayPiNum, absences, store.get('members') || []);
    const it = sprintWorkDays(sprint);
    const roleCap = piInfo?.roleCapacity || {};
    const scoped = team && team !== 'all';

    if (scoped) {
        const pres = presence(roster.filter(m => teamNameMatches(m.team, team)), it, absences, roleCap);
        // Vélocité de référence = TOUS les tickets (PI passés), pas `tickets` (périmètre du sprint).
        const capPts = it ? sprintPointsProjection(team, sprint, { members: pres.people, etp: pres.etp },
            { sprintInfoAll: store.get('sprintInfo'), piInfo, absences, tickets: store.get('tickets') || [] }) : null;
        const byOwner = new Map();
        let unassigned = 0;
        for (const t of tickets) {
            const who = t.leader || t.assignee;
            if (!who) { unassigned++; continue; }
            const o = byOwner.get(who) || byOwner.set(who, { name: who, n: 0, done: 0, pts: 0 }).get(who);
            o.n++; o.pts += t.points || 0;
            if (t.status === 'done') o.done++;
        }
        return {
            mode: 'team', teamLabel: team, it, pres, capPts, unassigned, total: tickets.length,
            owners: [...byOwner.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'fr')),
        };
    }

    // Toutes équipes, ou les équipes du groupe sélectionné (même règle que filterByTeam).
    const groupId = store.get('group');
    const g = groupId ? (store.get('groups') || []).find(x => x.id === groupId) : null;
    const scope = g?.teams?.length ? teams.filter(t => g.teams.includes(t)) : teams;
    const rows = scope.map(name => {
        const tt = tickets.filter(t => t.team === name);
        const members = roster.filter(m => teamNameMatches(m.team, name));
        if (!tt.length && !members.length) return null;
        const done = tt.filter(t => t.status === 'done');
        return {
            name, n: tt.length, done: done.length, pts: sumBy(tt, t => t.points), donePts: sumBy(done, t => t.points),
            blocked: tt.filter(t => t.status === 'blocked').length, pres: presence(members, it, absences, roleCap),
        };
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { mode: 'train', teamLabel: g ? g.name || 'Groupe' : 'Toutes équipes', it, rows };
}

const sprintTxt = d => (d.it ? `Sprint ${d.it.label} · ${d.it.days.length} jours ouvrés` : 'sprint inconnu');
const presTxt = p => (p.rate == null ? 'présence inconnue' : `présence ${p.rate} % (${jhTxt(p.avail)}/${jhTxt(p.theo)} j/h)`);
/** Capacité projetée en clair (exports) — `null` si aucune vélocité de référence. */
const capTxt = c => (!c ? null : c.breath ? '🍃 sprint de respiration, rien n’y est engagé'
    : `≈ ${c.points} pts (${num(round1(c.avg))} pts/sprint − ${Math.round(c.ratio * 100)} % d’absences)${c.capped ? ' ⚠ congés connus partiellement' : ''}`);

// ── Rendu riche (format « Texte » de la vue) ─────────────────────────────────

function teamHtml(d) {
    const p = d.pres;
    const unPct = pct(d.unassigned, d.total);
    return `
    <div class="rpt-pi-card">
        <p class="rpt-flow-period">👥 ${esc(d.teamLabel)} · ${esc(sprintTxt(d))}</p>
        <div class="rpt-metrics-row rpt-flow-metrics">
            <div class="rpt-metric"><span class="rpt-metric-label">Effectif</span><span class="rpt-metric-val">${p.people.length}</span>
                <span class="rpt-metric-pct">${jhTxt(p.theo)} j/h sur le sprint</span></div>
            ${d.capPts ? `<div class="rpt-metric" title="${esc(d.capPts.breath ? 'Sprint de respiration : rien n’y est engagé'
                : `Vélocité moyenne des 2 PI précédents (${num(round1(d.capPts.avg))} pts/sprint) − ${Math.round(d.capPts.ratio * 100)} % d’absences sur le sprint, pondérées par rôle — même calcul que la Base capacité de Santé`
                + (d.capPts.capped ? '\n⚠ Congés connus seulement en partie : projection optimiste' : ''))}">
                <span class="rpt-metric-label">Capacité projetée</span>
                <span class="rpt-metric-val">${d.capPts.breath ? '🍃' : `≈ ${d.capPts.points}${d.capPts.capped ? ' ⚠' : ''}`}</span>
                <span class="rpt-metric-pct">${d.capPts.breath ? 'respiration' : 'story points'}</span></div>` : ''}
            <div class="rpt-metric"><span class="rpt-metric-label">Présence sprint</span>
                <span class="rpt-metric-val rpt-pi-pct--${clr(p.rate)}">${p.rate == null ? '—' : `${p.rate}%`}</span>
                <span class="rpt-metric-pct">${jhTxt(p.avail)}/${jhTxt(p.theo)} j/h</span></div>
            <div class="rpt-metric"><span class="rpt-metric-label">Absences</span><span class="rpt-metric-val">${num(p.awayDays)} j</span></div>
            <div class="rpt-metric${unPct > 50 ? ' rpt-metric--alert' : ''}"><span class="rpt-metric-label">Sans responsable</span>
                <span class="rpt-metric-val">${d.unassigned}/${d.total}</span></div>
        </div>

        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">🗓️ Présence sur le sprint<span class="rpt-pi-h-count">${p.people.length}</span></h4>
            ${p.people.length ? `<div class="rpt-tm-wrap"><table class="rpt-tm-table">
                <caption class="meteo-sr">Membres de ${esc(d.teamLabel)}, rôle, capacité et présence jour par jour</caption>
                <thead><tr><th scope="col">Membre</th><th scope="col">Rôle</th><th scope="col">Capacité</th><th scope="col">Jours du sprint</th><th scope="col">Absent</th></tr></thead>
                <tbody>${p.people.map(m => `<tr>
                    <td>${esc(displayName(m.name))}</td>
                    <td>${m.role ? esc(m.role) : '<span class="rpt-flow-muted">rôle ?</span>'}</td>
                    <td>${m.pct} %</td>
                    <td>${d.it ? presenceStripHtml(m.name, d.it, store.get('absences') || []) : '—'}</td>
                    <td class="${m.away ? 'rpt-tm-away' : ''}">${m.away ? `${num(m.away)} j` : '—'}</td>
                </tr>`).join('')}</tbody>
            </table></div>
            <p class="rpt-flow-muted">Présence = jours ouvrés hors fériés, pondérés par la capacité du rôle (Paramètres → capacité par rôle).</p>`
            : `<p class="rpt-flow-muted">Aucun membre connu pour ${esc(d.teamLabel)} — le roster vient du CSV des absences ou du snapshot du PI.</p>`}
        </section>

        <section class="rpt-pi-section">
            <h4 class="rpt-pi-h">🎯 Responsables des tickets du sprint<span class="rpt-pi-h-count">${d.owners.length}</span></h4>
            ${d.owners.length ? `<div class="rpt-flow-stages">${d.owners.map(o => `
                <span class="rpt-flow-stage">${esc(o.name)} <b>${o.done}/${o.n}</b>${o.pts ? ` · ${o.pts} pts` : ''}</span>`).join('')}</div>` : ''}
            ${d.unassigned ? `<p class="rpt-flow-muted">${d.unassigned} ticket${plural(d.unassigned)} sur ${d.total} sans responsable dans JIRA${unPct > 50 ? ' — la répartition par personne n’est pas représentative' : ''}.</p>` : ''}
        </section>
    </div>`;
}

function trainHtml(d) {
    if (!d.rows.length) return '<p class="rpt-flow-muted">Aucune équipe avec des tickets ou des membres sur ce sprint.</p>';
    return `
    <div class="rpt-pi-card">
        <p class="rpt-flow-period">👥 ${esc(d.teamLabel)} · ${esc(sprintTxt(d))}</p>
        <div class="rpt-tm-wrap"><table class="rpt-tm-table">
            <caption class="meteo-sr">Avancement du sprint, bloqués, effectif et présence par équipe</caption>
            <thead><tr><th scope="col">Équipe</th><th scope="col">Avancement</th><th scope="col">Points</th><th scope="col">Bloqués</th><th scope="col" title="Jours/homme présents / possibles sur le sprint (capacité du rôle, congés et fériés déduits)">j/h</th><th scope="col">Présence</th></tr></thead>
            <tbody>${d.rows.map(r => {
                const p = pct(r.done, r.n);
                return `<tr>
                    <td><b>${esc(r.name)}</b></td>
                    <td>${r.n ? `<span class="rpt-rm-bar" aria-hidden="true"><i class="rpt-pi-bar-fill rpt-pi-bar--${clr(p)}" style="width:${p}%"></i></span> ${r.done}/${r.n}` : '—'}</td>
                    <td>${r.pts ? `${r.donePts}/${r.pts}` : '—'}</td>
                    <td class="${r.blocked ? 'rpt-tm-away' : ''}">${r.blocked || '—'}</td>
                    <td>${r.pres.people.length && r.pres.theo ? `${jhTxt(r.pres.avail)}/${jhTxt(r.pres.theo)}` : '—'}</td>
                    <td class="rpt-pi-pct--${clr(r.pres.rate)}">${r.pres.rate == null ? '—' : `${r.pres.rate} %`}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>
    </div>`;
}

const htmlReport = ctx => { const d = buildTeamsData(ctx); return d.mode === 'team' ? teamHtml(d) : trainHtml(d); };

// ── Formats d'export ─────────────────────────────────────────────────────────

function textReport(ctx) {
    const d = buildTeamsData(ctx);
    let r = `👥 Équipe — ${d.teamLabel} — ${sprintTxt(d)}\n\n`;
    if (d.mode === 'team') {
        const p = d.pres;
        r += `- 👤 Effectif : ${p.people.length} personne${plural(p.people.length)}, ${jhTxt(p.theo)} j/h sur le sprint\n`;
        r += `- 🗓️ ${presTxt(p).replace(/^p/, 'P')}\n`;
        if (capTxt(d.capPts)) r += `- 🎯 Capacité projetée : ${capTxt(d.capPts)}\n`;
        const away = p.people.filter(m => m.away);
        if (away.length) r += `- 🌴 Absents : ${away.map(m => `${displayName(m.name)} (${num(m.away)} j)`).join(', ')}\n`;
        if (d.owners.length) r += `\n🎯 Responsables\n${d.owners.map(o => `- ${o.name} — ${o.done}/${o.n} ticket${plural(o.n)}${o.pts ? `, ${o.pts} pts` : ''}\n`).join('')}`;
        if (d.unassigned) r += `- ❔ Sans responsable : ${d.unassigned}/${d.total}\n`;
        return r;
    }
    for (const row of d.rows) {
        r += `- ${row.name} — ${row.done}/${row.n} tickets${row.pts ? `, ${row.donePts}/${row.pts} pts` : ''}`;
        r += `${row.blocked ? `, 🚫 ${row.blocked} bloqué${plural(row.blocked)}` : ''}${row.pres.rate != null ? `, présence ${row.pres.rate} %` : ''}\n`;
    }
    return r;
}

function slackReport(ctx) {
    const d = buildTeamsData(ctx);
    let r = `<div class="s-header">${E('👥')} Équipe · ${esc(d.teamLabel)}</div><hr class="s-divider"><span class="s-muted">${esc(sprintTxt(d))}</span>\n`;
    if (d.mode === 'team') {
        const p = d.pres;
        r += `${E('👤')} ${B('Effectif')} : ${p.people.length} · ${jhTxt(p.theo)} j/h sur le sprint\n`;
        r += `${E('🗓️')} ${B('Présence')} : ${p.rate == null ? '—' : SB(`${p.rate}%`, clr(p.rate))} <span class="s-muted">${jhTxt(p.avail)}/${jhTxt(p.theo)} j/h</span>\n`;
        if (capTxt(d.capPts)) r += `${E('🎯')} ${B('Capacité projetée')} : ${esc(capTxt(d.capPts))}\n`;
        const away = p.people.filter(m => m.away);
        if (away.length) r += `${E('🌴')} ${B('Absents')} : ${esc(away.map(m => `${displayName(m.name)} (${num(m.away)} j)`).join(', '))}\n`;
        if (d.owners.length) r += `${E('🎯')} ${B('Responsables')} : ${esc(d.owners.map(o => `${o.name} ${o.done}/${o.n}`).join(' · '))}\n`;
        if (d.unassigned) r += `${E('❔')} ${B('Sans responsable')} : ${d.unassigned}/${d.total}\n`;
        return r;
    }
    for (const row of d.rows) {
        const p = pct(row.done, row.n);
        r += `${B(esc(row.name))} : ${row.done}/${row.n} ${SB(`${p}%`, clr(p))}${row.blocked ? ` ${E('🚫')} ${row.blocked}` : ''}`;
        r += `${row.pres.rate != null ? ` <span class="s-muted">présence ${row.pres.rate} %</span>` : ''}\n`;
    }
    return r;
}

function confluenceReport(ctx) {
    const d = buildTeamsData(ctx);
    let r = `<h2>Équipe — ${esc(d.teamLabel)}</h2><p><em>${esc(sprintTxt(d))}</em></p>`;
    if (d.mode === 'team') {
        const p = d.pres;
        r += `<p><strong>Effectif :</strong> ${p.people.length} (${jhTxt(p.theo)} j/h sur le sprint) — <strong>Présence :</strong> ${p.rate == null ? '—' : CS(`${p.rate}%`, clr(p.rate))}`;
        if (capTxt(d.capPts)) r += ` — <strong>Capacité projetée :</strong> ${esc(capTxt(d.capPts))}`;
        r += ` — <strong>Sans responsable :</strong> ${d.unassigned}/${d.total}</p>`;
        r += `<table><tr><th>Membre</th><th>Rôle</th><th>Capacité</th><th>Absent (j)</th></tr>`;
        r += p.people.map(m => `<tr><td>${esc(displayName(m.name))}</td><td>${esc(m.role || '-')}</td><td>${m.pct} %</td><td>${m.away ? num(m.away) : '-'}</td></tr>`).join('');
        r += `</table>`;
        if (d.owners.length) r += `<h3>Responsables</h3><table><tr><th>Personne</th><th>Tickets faits</th><th>Points</th></tr>${d.owners.map(o => `<tr><td>${esc(o.name)}</td><td>${o.done}/${o.n}</td><td>${o.pts || '-'}</td></tr>`).join('')}</table>`;
        return r;
    }
    r += `<table><tr><th>Équipe</th><th>Tickets</th><th>Points</th><th>Bloqués</th><th>j/h</th><th>Présence</th></tr>`;
    r += d.rows.map(row => `<tr><td>${esc(row.name)}</td><td>${CS(`${row.done}/${row.n}`, clr(pct(row.done, row.n)))}</td><td>${row.donePts}/${row.pts}</td>`
        + `<td>${row.blocked ? CS(row.blocked, 'red') : '-'}</td><td>${row.pres.people.length && row.pres.theo ? `${jhTxt(row.pres.avail)}/${jhTxt(row.pres.theo)}` : '-'}</td><td>${row.pres.rate == null ? '-' : `${row.pres.rate} %`}</td></tr>`).join('');
    return `${r}</table>`;
}

/** Générateur consommé par reports.js (`GENERATORS.teams`). */
export const TEAMS_GENERATOR = { text: textReport, slack: slackReport, confluence: confluenceReport, html: htmlReport };
