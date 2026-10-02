/**
 * Météo des équipes — la MATRICE équipes × domaines du Dashboard, et la rangée de
 * pastilles d'une équipe seule.
 *
 * Cinq domaines par équipe, chacun rattaché à une mesure QUI EXISTE DÉJÀ dans le site :
 *   🏃 Sprint  — points réalisés / engagés vs temps écoulé   (sprint-scope.js : engagement = belongedToSprint)
 *   🗓️ PI      — points réalisés / périmètre du PI vs temps   (belongedToPi)
 *   🛡️ Santé   — score 0–100                                  (business_rules.js : healthScore, même formule que health.js)
 *   🎧 SLA     — % de tickets terminés sous le seuil            (sla_review_card.js : slaModel)
 *   😊 Mood    — moyenne des votes du sprint × 20              (store.moodVotes)
 *
 * L'échelle (seuils, relatif/absolu, tolérance de démarrage) vit dans utils/meteo.js.
 * Le niveau d'une équipe est le PIRE de ses domaines ; ⚪ « pas de donnée » n'est jamais
 * un mauvais signe et n'entre pas dans le calcul.
 */

import { store } from '../state.js';
import { esc, pct as pctOf, sumBy, getSprintForTeam, extractPiNum, belongedToSprint, isInSprint, belongedToPi, countBlocked, teamCapacity, wipThreshold, countWip, weatherOf, weatherRel, worstLevel, elapsedPct, METEO_GLYPH, METEO_LABEL, METEO_DOMAINS, meteoThresholds } from '../utils.js';
import { ANOMALY_RULES, healthScore } from '../business_rules.js';
import { slaModel } from './sla_review_card.js';
import { helpIconHtml } from './help_popover.js';
import { TEAM_COLORS } from '../config.js';

// Les domaines vivent dans utils/meteo.js (partagés avec l'aide « ? ») ; on ne garde ici
// que ce qu'il faut pour rendre une cellule.
const DOMAINS = METEO_DOMAINS.map(({ key, icon, label, hint }) => ({ key, icon, label, hint }));

const _sprintLabel = name => (String(name || '').match(/(\d+\.\d+)/) || [])[1] || '';

/**
 * Calcule les cinq domaines d'une équipe.
 * @returns {{ team, color, level, blocked, domains: Array<{key, icon, label, level, value, sub, title}> }}
 */
export function computeTeamMeteo(team, {
    tickets, sprintInfoAll, piNum, members = [], absences = [], moodVotes = [], color = null, thresholds = null,
} = {}) {
    // `thresholds` : surcharge ponctuelle (aperçu des Paramètres), sinon les seuils effectifs.
    const th = thresholds || meteoThresholds();
    const tt = (tickets || []).filter(t => t.team === team);
    const active = tt.filter(t => t.status !== 'done');
    const sprint = getSprintForTeam(team, sprintInfoAll);
    const d = {};

    // 🏃 Sprint — engagement = belongedToSprint (reports compris), réalisé = done ET encore dans le sprint.
    if (sprint?.name) {
        const engaged = tt.filter(t => belongedToSprint(t, sprint.name, null));
        const donePts = sumBy(engaged.filter(t => t.status === 'done' && isInSprint(t, sprint.name, null)), t => t.points);
        const allPts = sumBy(engaged, t => t.points);
        const p = allPts ? pctOf(donePts, allPts) : null;
        const time = elapsedPct(sprint.startDate, sprint.endDate);
        d.sprint = { level: weatherRel(p, time), value: p == null ? '—' : `${p} %`, sub: allPts ? `${donePts}/${allPts} pts · ${time ?? '?'} % du temps` : 'aucun point engagé',
            viz: p != null && time != null ? { type: 'rel', p, time } : null,
            meta: allPts ? [['✅', `${donePts}/${allPts} pts faits`], ['⏱️', `${time ?? '?'} % du sprint écoulé`]] : [['∅', 'aucun point engagé']] };
    } else {
        d.sprint = { level: 'none', value: '—', sub: 'aucun sprint actif' };
    }

    // 🗓️ PI — périmètre = belongedToPi, fenêtre = sprints de l'équipe dans ce PI.
    const piSprints = (sprintInfoAll?.teamSprints || []).filter(s => s.team === team && extractPiNum(s.name) === piNum);
    if (piNum && piSprints.length) {
        const scope = tt.filter(t => belongedToPi(t, piNum));
        const scopePts = sumBy(scope, t => t.points);
        const donePts = sumBy(scope.filter(t => t.status === 'done' && extractPiNum(t.sprintName || '') === piNum), t => t.points);
        const p = scopePts ? pctOf(donePts, scopePts) : null;
        const start = piSprints.map(s => s.startDate).filter(Boolean).sort()[0];
        const end = piSprints.map(s => s.endDate).filter(Boolean).sort().at(-1);
        const time = elapsedPct(start, end);
        d.pi = { level: weatherRel(p, time), value: p == null ? '—' : `${p} %`, sub: scopePts ? `${donePts}/${scopePts} pts · ${time ?? '?'} % du PI` : 'périmètre vide',
            viz: p != null && time != null ? { type: 'rel', p, time } : null,
            meta: scopePts ? [['✅', `${donePts}/${scopePts} pts faits`], ['⏱️', `${time ?? '?'} % du PI écoulé`]] : [['∅', 'périmètre vide']] };
    } else {
        d.pi = { level: 'none', value: '—', sub: piNum ? 'aucun sprint dans ce PI' : 'PI inconnu' };
    }

    // 🛡️ Santé — même contexte que health.js (WIP vs capacité du jour, début de sprint).
    // Les anomalies détaillées (règle, effectif, responsables) alimentent le plan d'action.
    let anomalies = [];
    if (tt.length) {
        const sprintStartMs = sprint?.startDate ? new Date(String(sprint.startDate).slice(0, 10)).getTime() : 0;
        const wipMax = wipThreshold(teamCapacity(team, members, absences));
        const ctx = { sprintStartMs, wipExceededTeams: countWip(tt) > wipMax ? new Set([team]) : new Set(), curPi: piNum };
        const counts = {};
        anomalies = ANOMALY_RULES.map(a => {
            const hits = tt.filter(t => a.match(t, ctx));
            counts[a.key] = hits.length;
            const leaders = [...new Set(hits.map(t => t.leader || t.assignee).filter(Boolean))];
            // `ids` : tickets concernés (détail d'une cellule au mode TV), du plus ancien au plus récent.
            return { key: a.key, icon: a.icon, label: a.label, title: a.title, intro: a.intro, sev: a.sev, n: hits.length, leaders, ids: hits.map(t => t.id) };
        });
        const score = healthScore(counts, active.length);
        const total = anomalies.reduce((s, a) => s + a.n, 0);
        d.health = { level: weatherOf(score, th), value: String(score), sub: `${total} anomalie${total > 1 ? 's' : ''} · ${active.length} actif${active.length > 1 ? 's' : ''}`,
            viz: { type: 'gauge', score },
            meta: [['⚠️', `${total} anomalie${total > 1 ? 's' : ''}`], ['🎫', `sur ${active.length} ticket${active.length > 1 ? 's' : ''} actif${active.length > 1 ? 's' : ''}`]] };
    } else {
        d.health = { level: 'none', value: '—', sub: 'aucun ticket' };
    }

    // 🎧 SLA — le modèle de la card SLA Review, sur les tickets de l'équipe.
    const sla = slaModel(tt);
    d.sla = sla.done.length
        ? { level: weatherOf(sla.pct, th), value: `${sla.pct} %`, sub: `${sla.conform}/${sla.done.length} ≤ ${Math.round(sla.target * 10) / 10} j${sla.isProvisional ? ' (provisoire)' : ''}`,
            viz: { type: 'gauge', score: sla.pct },
            meta: [['🎯', `${sla.conform}/${sla.done.length} livrés en ≤ ${Math.round(sla.target * 10) / 10} j`], ...(sla.breaches.length ? [['🐢', `${sla.breaches.length} hors délai`]] : [])] }
        : { level: 'none', value: '—', sub: 'aucun ticket terminé mesurable' };

    // 😊 Mood — votes du sprint actif de l'équipe.
    const lbl = _sprintLabel(sprint?.name);
    const votes = (moodVotes || []).filter(v => v.team === team && (!lbl || (v.piSprint && (v.piSprint === lbl || v.piSprint.includes(lbl)))));
    const vals = votes.map(v => parseInt(v.value, 10)).filter(n => n >= 1 && n <= 5);
    if (vals.length) {
        const avg = Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10;
        d.mood = { level: weatherOf(avg * 20, th), value: avg.toFixed(1), sub: `/5 · ${vals.length} vote${vals.length > 1 ? 's' : ''}`,
            viz: { type: 'gauge', score: avg * 20 },
            meta: [['🗳️', `${vals.length} vote${vals.length > 1 ? 's' : ''} · sur 5`]] };
    } else {
        d.mood = { level: 'none', value: '—', sub: 'aucun vote' };
    }

    const domains = DOMAINS.map(dom => ({ ...dom, ...d[dom.key], title: `${dom.icon} ${dom.label} — ${METEO_LABEL[d[dom.key].level]} · ${dom.hint}` }));
    return { team, color, level: worstLevel(domains.map(x => x.level)), blocked: countBlocked(active), domains, anomalies };
}

/** Contexte commun à toutes les équipes, lu une seule fois dans le store. */
export function meteoContext(piNum) {
    return {
        tickets: store.get('tickets') || [],
        sprintInfoAll: store.get('sprintInfo'),
        piNum,
        piInfo: store.get('piInfo') || null,
        members: store.get('members') || [],
        absences: store.get('absences') || [],
        moodVotes: store.get('moodVotes') || [],
        fistVotes: store.get('fistVotes') || [],
    };
}

const _teamColor = (team, teamObjects, i) => (teamObjects || []).find(o => o.name === team)?.color || TEAM_COLORS[i % TEAM_COLORS.length];

/** Visuel d'une cellule riche : réalisé vs temps (2 barres) ou jauge 0–100. */
const _viz = v => !v ? '' : v.type === 'rel'
    ? `<span class="meteo-mini" aria-hidden="true"><i style="width:${Math.min(100, v.p)}%"></i></span><span class="meteo-mini is-time" aria-hidden="true"><i style="width:${Math.min(100, v.time)}%"></i></span>`
    : `<span class="meteo-mini is-gauge" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round(v.score)))}%"></i></span>`;

// data-meteo-* : clic → détail de la cellule (équipe × domaine), au mode TV et au Dashboard.
const _cell = (dom, team, rich) => `<td class="meteo-cell meteo-cell--${dom.level}" title="${esc(dom.title)}" data-meteo-team="${esc(team)}" data-meteo-dom="${esc(dom.key)}">
    <span class="meteo-glyph" aria-hidden="true">${METEO_GLYPH[dom.level]}</span>
    <strong class="meteo-val">${esc(dom.value)}</strong>
    ${rich && dom.meta ? `${_viz(dom.viz)}<span class="meteo-meta">${dom.meta.map(([i, t]) => `<span><span aria-hidden="true">${i}</span> ${esc(t)}</span>`).join('')}</span>` : `<small class="meteo-sub">${esc(dom.sub)}</small>`}
    <span class="meteo-sr">${esc(METEO_LABEL[dom.level])}</span>
</td>`;

/** Légende de l'échelle — toujours visible, jamais dans une infobulle. */
export function meteoScaleHtml(thresholds = null) {
    const th = thresholds || meteoThresholds();
    const items = [['sun', `≥ ${th.sun}`], ['cloud', `${th.cloud}–${th.sun - 1}`], ['rain', `${th.rain}–${th.cloud - 1}`], ['storm', `< ${th.rain}`], ['none', '']];
    return `<div class="meteo-scale" aria-label="Échelle de la météo">${items.map(([lv, r]) => `<span class="meteo-scale-it meteo-cell--${lv}"><span aria-hidden="true">${METEO_GLYPH[lv]}</span> ${METEO_LABEL[lv]}${r ? ` <small>${r}</small>` : ''}</span>`).join('')}</div>`;
}

/**
 * La matrice — une ligne par équipe, cliquable (→ filtre équipe).
 * @param {string[]} teams  équipes du périmètre affiché
 */
/** Ligne de la matrice pour une équipe. */
const _rowHtml = (r, preview, rich) => `
                <tr class="meteo-row" ${preview ? '' : `data-team="${esc(r.team)}" tabindex="0" role="button" aria-label="Ouvrir l'équipe ${esc(r.team)} — ${esc(METEO_LABEL[r.level])}"`} style="--team-color:${r.color}">
                    <th scope="row"><span class="meteo-team"><span class="team-dot" style="background:${r.color}"></span>${esc(r.team)}${r.blocked ? `<span class="team-card-stat team-card-stat--blocked" title="${r.blocked} bloqué${r.blocked > 1 ? 's' : ''}">⚠ ${r.blocked}</span>` : ''}</span></th>
                    ${r.domains.map(dm => _cell(dm, r.team, rich)).join('')}
                </tr>`;

/**
 * Lignes groupées par ligne produit : un en-tête par groupe portant le PIRE niveau de ses
 * équipes (jamais une moyenne — elle cacherait un orage), puis « Autres équipes ».
 */
const _groupedRows = (rows, groups, preview, rich) => {
    const byName = new Map(rows.map(r => [r.team, r]));
    const placed = new Set();
    const block = (label, color, list) => {
        if (!list.length) return '';
        const worst = worstLevel(list.map(r => r.level));
        return `<tr class="meteo-grp-row" style="--grp-color:${color || 'var(--border)'}"><th scope="rowgroup" colspan="${1 + DOMAINS.length}"><span aria-hidden="true">${METEO_GLYPH[worst]}</span> ${esc(label)}<small>${list.length} équipe${list.length > 1 ? 's' : ''} · ${esc(METEO_LABEL[worst].toLowerCase())}</small></th></tr>${list.map(r => _rowHtml(r, preview, rich)).join('')}`;
    };
    let html = '';
    for (const g of groups) {
        const list = (g.teams || []).map(t => byName.get(t)).filter(Boolean);
        list.forEach(r => placed.add(r.team));
        html += block(g.name, g.color, list);
    }
    html += block('Autres équipes', null, rows.filter(r => !placed.has(r.team)));
    return html;
};

/**
 * @param {object} [opts]
 * @param {boolean} [opts.preview]  aperçu (Paramètres, TV) : lignes non cliquables, sans « ? »
 * @param {string}  [opts.title]    titre de la card
 * @param {Array}   [opts.groups]   lignes produit (`store.groups`) : en-têtes de groupe si ≥ 2 groupes
 * @param {boolean} [opts.rich]     cellules riches (TV) : barres / jauge + libellés explicites
 */
export function meteoMatrixHtml(teams, ctx, teamObjects = [], { preview = false, title = 'Météo des équipes', groups = [], rich = false } = {}) {
    const rows = teams.map((t, i) => computeTeamMeteo(t, { ...ctx, color: _teamColor(t, teamObjects, i) }));
    const worst = worstLevel(rows.map(r => r.level));
    const storms = rows.filter(r => r.level === 'storm').length;
    const sub = storms ? `${storms} équipe${storms > 1 ? 's' : ''} en ⛈️` : `${rows.length} équipes · ${METEO_LABEL[worst].toLowerCase()}`;
    const relevantGroups = (groups || []).filter(g => (g.teams || []).some(t => teams.includes(t)));
    const body = relevantGroups.length >= 2 ? _groupedRows(rows, relevantGroups, preview, rich) : rows.map(r => _rowHtml(r, preview, rich)).join('');
    return `
    <section class="card meteo-card${preview ? ' meteo-card--preview' : ''}" aria-labelledby="meteo-title">
        <div class="card-header meteo-header">
            <span class="card-title" id="meteo-title">${METEO_GLYPH[worst]} ${esc(title)} ${preview ? '' : helpIconHtml({ key: 'meteo', label: 'Comprendre la météo des équipes' })}</span>
            <span class="card-subtitle">${esc(sub)}${preview ? '' : ' — cliquer une ligne ouvre l\'équipe'}</span>
        </div>
        ${meteoScaleHtml(ctx.thresholds || null)}
        <div class="meteo-wrap">
            <table class="meteo-matrix${rich ? ' is-rich' : ''}">
                <caption class="meteo-sr">Météo par équipe et par domaine</caption>
                <thead><tr><th scope="col">Équipe</th>${DOMAINS.map(dm => `<th scope="col" title="${esc(dm.hint)}"><span aria-hidden="true">${dm.icon}</span> ${dm.label}</th>`).join('')}</tr></thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    </section>`;
}

/** Les cinq pastilles d'une équipe seule (en tête du Dashboard filtré). */
export function meteoPillsHtml(team, ctx, teamObjects = []) {
    const r = computeTeamMeteo(team, { ...ctx, color: _teamColor(team, teamObjects, 0) });
    // Santé et PI mènent à leur vue ; Sprint et SLA font défiler jusqu'à leur card du Dashboard.
    const links = { health: `#health/${encodeURIComponent(team)}`, pi: `#pi/${encodeURIComponent(team)}/objectives` };
    const scrolls = { sprint: '.sprint-header', sla: '.sla-card' };
    return `
    <nav class="meteo-pills" aria-label="Météo de ${esc(team)}">
        <span class="meteo-pills-lead" title="${esc(METEO_LABEL[r.level])}"><span aria-hidden="true">${METEO_GLYPH[r.level]}</span> ${esc(METEO_LABEL[r.level])} ${helpIconHtml({ key: 'meteo', label: 'Comprendre la météo des équipes' })}</span>
        ${r.domains.map(dm => {
            const inner = `<span class="meteo-glyph" aria-hidden="true">${METEO_GLYPH[dm.level]}</span><span class="meteo-pill-lbl">${dm.icon} ${dm.label}</span><strong class="meteo-val">${esc(dm.value)}</strong><span class="meteo-sr">${esc(METEO_LABEL[dm.level])}</span>`;
            if (links[dm.key]) return `<a class="meteo-pill meteo-cell--${dm.level}" href="${links[dm.key]}" title="${esc(dm.title)}">${inner}</a>`;
            if (scrolls[dm.key]) return `<button type="button" class="meteo-pill meteo-cell--${dm.level}" data-scroll="${scrolls[dm.key]}" title="${esc(dm.title)}">${inner}</button>`;
            return `<span class="meteo-pill meteo-cell--${dm.level}" title="${esc(dm.title)}">${inner}</span>`;
        }).join('')}
    </nav>`;
}

/** Une ligne de la matrice → filtre équipe (souris et clavier), une cellule → son détail ; une pastille → sa card. */
export function bindMeteoMatrix(container) {
    const open = row => { const t = row?.dataset?.team; if (t) store.set('team', t); };
    container.querySelectorAll('.meteo-row').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('a, button')) return;
            // Clic sur une cellule → son détail (pourquoi ce temps, ce qui coince, que faire) ;
            // ailleurs dans la ligne (nom d'équipe) → l'équipe, comme avant.
            const cell = e.target.closest('.meteo-cell[data-meteo-team]');
            if (cell) { import('../views/tv-meteo-detail.js').then(m => m.openMeteoDetail(cell.dataset.meteoTeam, cell.dataset.meteoDom)); return; }
            open(row);
        });
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(row); } });
    });
    container.querySelectorAll('.meteo-pill[data-scroll]').forEach(btn => {
        btn.addEventListener('click', () => container.querySelector(btn.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
}
