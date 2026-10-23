/**
 * 🌳 Support de la LIGNE PRODUIT — page Support (3.249.0).
 *
 * La page Support montrait l'équipe filtrée seule : impossible de voir qui, dans les équipes
 * sœurs de la ligne produit, tient le support la même semaine — alors que c'est la vraie
 * question quand une ligne se partage les sujets (ou une astreinte mutualisée ⧉).
 * Cette section reprend la grammaire du récapitulatif de la rotation mutualisée
 * (settings-rotation-pool-recap.js), en LECTURE seule, sur l'état EN BASE :
 *   - 📅 Par équipe   : semaines × équipes de la ligne — « qui couvre quoi cette semaine ? » ;
 *   - 🧩 Par poste    : semaines × postes (Dev + Tech Lead, PO…) — la ligne a-t-elle un PO
 *                       d'astreinte chaque semaine ? Quotas du pool rappelés s'il existe ;
 *   - 👥 Par personne : une ligne par membre, y compris ceux à ZÉRO passage — c'est le vide
 *                       qui révèle un déséquilibre (même parti pris que la vue « par poste » du pool).
 *
 * Ligne produit retenue : celle de l'équipe filtrée, sinon le groupe du topbar ; aucune → rien.
 * Semaines : `buildPiWeeks` (source unique) avec le mode de l'équipe filtrée (sinon du pool,
 * sinon de la 1ʳᵉ équipe). Les équipes sœurs peuvent avoir un autre mode : leur entrée est
 * retrouvée sur LEURS propres semaines (appariement exact `weekStart`/`weekEnd`, comme le
 * panneau d'équipe), rattachées à la ligne par le plus grand recouvrement de dates.
 * Roster = `effectiveRosterForPi` du PI affiché (les partis ne réapparaissent pas).
 * Styles : css/views/support-line.css.
 */

import { store } from '../state.js';
import {
    esc, teamNameMatches, effectiveRosterForPi, getSupportWeekMode, isMemberSupportActive,
    supportWeekHead, supportWorkingDays, supportDaysForMember, supportAbsenceDays, isSupportAbsent,
    getSupportPool, posteOfRole, remapQuotasToPostes, SUPPORT_ABSENT_MIN_DAYS, todayIsoLocal,
} from '../utils.js';
import { buildPiWeeks } from '../utils/pi-weeks.js';
import { fmtMemberName, fmtShortDate } from './settings-rotation-pool-recap.js';

export const LINE_VIEWS = {
    teams:  { label: '📅 Par équipe',   hint: 'Qui tient le support de chaque équipe, semaine par semaine' },
    postes: { label: '🧩 Par poste',    hint: 'La ligne a-t-elle chaque poste couvert chaque semaine ?' },
    people: { label: '👥 Par personne', hint: 'Comment la charge se répartit entre les membres de la ligne' },
};
const _VIEW_KEY = 'sup-line-view';

function _view() {
    let v = null;
    try { v = localStorage.getItem(_VIEW_KEY); } catch { /* sans gravité */ }
    return LINE_VIEWS[v] ? v : 'teams';
}

const _ms = iso => new Date(iso + 'T00:00:00').getTime();
/** Recouvrement (ms) de deux semaines — négatif si disjointes. */
const _overlap = (a, b) => Math.min(_ms(a.weekEnd), _ms(b.weekEnd)) - Math.max(_ms(a.weekStart), _ms(b.weekStart));

/** Ligne produit de l'équipe filtrée, sinon groupe du topbar. */
function _lineOf(team) {
    const groups = store.get('groups') || [];
    if (team && team !== 'all') {
        return groups.find(g => (g.teams || []).some(t => t === team || teamNameMatches(t, team))) || null;
    }
    const id = store.get('group');
    return id ? groups.find(g => g.id === id) || null : null;
}

function _teamColor(name) {
    const o = (store.get('teamObjects') || []).find(t => t?.name === name);
    return o?.color || '#64748b';
}

/**
 * Modèle de la section : semaines de la ligne, et pour chaque semaine × équipe les personnes
 * affectées (roster du PI, absence, jours partiels). Aucun rendu ici.
 */
function _model(group, team) {
    const piInfo = store.get('piInfo');
    const sprintInfo = store.get('sprintInfo');
    const piOffset = store.get('piOffset') || 0;
    const known = store.get('teams') || [];
    const teams = (group.teams || []).filter(t => known.includes(t));
    if (!teams.length) return null;

    const pool = getSupportPool(group.id);
    const poolOn = pool.enabled && pool.teams.some(t => teams.includes(t));
    const mine = teams.includes(team) ? team : null;
    const refMode = mine ? getSupportWeekMode(mine) : poolOn ? pool.weekMode : getSupportWeekMode(teams[0]);
    const { weeks, piNum } = buildPiWeeks({ piInfo, sprintInfo, piOffset, weekMode: refMode });
    if (!weeks?.length) return null;

    // Semaines propres à chaque équipe (son mode) — une par mode, pas une par équipe
    const byMode = new Map();
    const weeksOf = t => {
        const mode = getSupportWeekMode(t);
        if (!byMode.has(mode)) byMode.set(mode, buildPiWeeks({ piInfo, sprintInfo, piOffset, weekMode: mode }).weeks || []);
        return byMode.get(mode);
    };

    const absences = store.get('absences') || [];
    const roster = effectiveRosterForPi(piInfo, piNum, absences, store.get('members') || []);
    const people = [];
    for (const t of teams) {
        for (const m of roster) {
            if (!teamNameMatches(m.team, t)) continue;
            people.push({ name: m.name, team: t, realRole: m.role || '', poste: posteOfRole(m.role || '', pool.roleGroups),
                          active: isMemberSupportActive(m.name) });
        }
    }
    const personOf = new Map(people.map(p => [`${p.team}|${p.name}`, p]));
    const support = store.get('support') || [];

    const rows = weeks.map(w => {
        const cells = teams.map(t => {
            const tw = weeksOf(t).reduce((best, x) =>
                (_overlap(x, w) >= 0 && (!best || _overlap(x, w) > _overlap(best, w))) ? x : best, null);
            const entry = tw ? support.find(s => teamNameMatches(s.team, t) && s.weekStart === tw.weekStart && s.weekEnd === tw.weekEnd) : null;
            const wd = tw ? supportWorkingDays(tw.weekStart) : [];
            const on = (entry?.members || []).filter(n => personOf.has(`${t}|${n}`)).map(n => {
                const days = supportDaysForMember(entry, n);
                return {
                    ...personOf.get(`${t}|${n}`),
                    absent: isSupportAbsent(supportAbsenceDays(n, tw.weekStart, tw.weekEnd, absences)),
                    days: (days.length && days.length < 5) ? days.map(i => wd[i]?.letter || '').join('') : '',
                };
            });
            return { team: t, on };
        });
        return { w, cells, all: cells.flatMap(c => c.on) };
    });

    // Postes : ceux du pool (avec quota) s'il est actif, sinon ceux présents dans le roster actif
    let postes;
    if (poolOn) {
        postes = Object.entries(remapQuotasToPostes(pool.quotas, pool.roleGroups)).filter(([, n]) => n > 0)
            .map(([poste, want]) => ({ poste, want }));
    } else {
        // Sans quota, seuls les postes réellement mobilisés sur le PI : six colonnes de « — »
        // pour des rôles qui ne font jamais de support noieraient les autres
        const cnt = new Map();
        for (const r of rows) for (const p of r.all) if (p.poste) cnt.set(p.poste, (cnt.get(p.poste) || 0) + 1);
        postes = [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
            .map(([poste]) => ({ poste, want: 0 }));
    }
    // Équipes sans AUCUNE rotation sur le PI : signalées une fois, pas ligne à ligne
    const idle = new Set(teams.filter((t, i) => !rows.some(r => r.cells[i].on.length)));

    return { group, teams, mine, weeks, rows, piNum, people, postes, pool, poolOn, idle };
}

// ── Rendu ───────────────────────────────────────────────────────────────────

function _chip(p, { showTeam = false, showRole = false } = {}) {
    const tip = `${p.name} — ${p.team}${p.realRole ? ` · ${p.realRole}` : ''}${p.absent ? ` · absent ≥ ${SUPPORT_ABSENT_MIN_DAYS}j` : ''}${p.days ? ` · jours : ${p.days}` : ''}`;
    return `<span class="rot-pool-chip sl-chip${p.absent ? ' is-absent' : ''}" style="--chip:${_teamColor(p.team)}" title="${esc(tip)}">${esc(fmtMemberName(p.name))}${
        showRole && p.realRole ? `<em class="rot-pool-chip-role">${esc(p.realRole)}</em>` : ''}${
        showTeam ? `<em class="sl-chip-team">${esc(p.team.replace(/^(team|équipe)\s+/i, '').slice(0, 3))}</em>` : ''}${
        p.days ? `<b class="sl-chip-days">${esc(p.days)}</b>` : ''}</span>`;
}

function _weekTh(w, today) {
    const wh = supportWeekHead(w);
    return `<th class="sl-wk"${wh.title ? ` title="${wh.title}"` : ''}><span class="${wh.cls.trim()}">${esc(wh.text)}</span><small>${fmtShortDate(w.weekStart)} → ${fmtShortDate(w.weekEnd)}</small></th>`;
}

const _rowCls = (w, today) => w.weekStart <= today && w.weekEnd >= today ? 'is-current' : w.weekEnd < today ? 'is-past' : '';

function _teamsTable(m, rows, today) {
    const head = m.teams.map(t => `<th class="${t === m.mine ? 'is-mine' : ''}" style="--chip:${_teamColor(t)}"><span class="sl-dot"></span>${esc(t)}${
        m.idle.has(t) ? '<small class="sl-norot" title="Aucune rotation enregistrée pour cette équipe sur ce PI">aucune rotation</small>' : ''}</th>`).join('');
    const body = rows.map(r => `<tr class="${_rowCls(r.w, today)}">
        ${_weekTh(r.w, today)}
        ${r.cells.map(c => `<td class="${c.team === m.mine ? 'is-mine' : ''}${c.on.length ? '' : ' is-empty'}">${
            c.on.length ? c.on.map(p => _chip(p, { showRole: true })).join('') : '<span class="sl-hole" title="Personne au support pour cette équipe">—</span>'}</td>`).join('')}
        <td class="sl-tot">${r.all.length}</td>
    </tr>`).join('');
    return `<table class="sl-table"><thead><tr><th class="sl-wk">Semaine</th>${head}<th class="sl-tot" title="Personnes au support sur la ligne">Total</th></tr></thead><tbody>${body}</tbody></table>`;
}

function _postesTable(m, rows, today) {
    if (!m.postes.length) return '<p class="text-xs text-muted">Aucun passage avec un rôle renseigné sur ce PI — rôles dans Paramètres → Membres.</p>';
    const head = m.postes.map(p => `<th>${esc(p.poste)}${p.want ? ` <span class="rot-pool-q">×${p.want}</span>` : ''}</th>`).join('');
    // Colonne « Autres » (rôle absent ou hors quotas du pool) seulement si quelqu'un y tombe
    const hasExtra = rows.some(r => r.all.some(p => !m.postes.some(x => x.poste === p.poste)));
    const body = rows.map(r => {
        const cells = m.postes.map(({ poste, want }) => {
            const hit = r.all.filter(p => p.poste === poste);
            const short = want > 0 && hit.length < want;   // sans quota, pas de « manque »
            return `<td class="${short ? 'is-short' : ''}">${hit.length ? hit.map(p => _chip(p, { showTeam: true })).join('') : '<span class="sl-hole">—</span>'}${
                want && hit.length < want ? `<span class="rot-pool-miss">${hit.length}/${want}</span>` : ''}</td>`;
        }).join('');
        const extra = r.all.filter(p => !m.postes.some(x => x.poste === p.poste));
        return `<tr class="${_rowCls(r.w, today)}">${_weekTh(r.w, today)}${cells}${hasExtra ? `<td class="sl-extra">${extra.map(p => _chip(p, { showTeam: true })).join('')}</td>` : ''}</tr>`;
    }).join('');
    return `<table class="sl-table"><thead><tr><th class="sl-wk">Semaine</th>${head}${hasExtra ? '<th class="sl-extra" title="Rôle hors des postes listés">Autres</th>' : ''}</tr></thead><tbody>${body}</tbody></table>`;
}

function _peopleTable(m, rows, today) {
    const head = rows.map(r => `<th class="sl-pw ${_rowCls(r.w, today)}" title="${esc(fmtShortDate(r.w.weekStart))} → ${esc(fmtShortDate(r.w.weekEnd))}">${esc(supportWeekHead(r.w).text)}</th>`).join('');
    const body = m.teams.map(t => {
        const ppl = m.people.filter(p => p.team === t && p.active)
            .map(p => ({ ...p, n: rows.reduce((s, r) => s + (r.cells.find(c => c.team === t).on.some(x => x.name === p.name) ? 1 : 0), 0) }))
            .sort((a, b) => fmtMemberName(a.name).localeCompare(fmtMemberName(b.name), 'fr', { sensitivity: 'base' }));
        if (!ppl.length) return '';
        const tot = ppl.reduce((s, p) => s + p.n, 0);
        if (!tot) {
            return `<tr class="sl-team-sep is-norot${t === m.mine ? ' is-mine' : ''}" style="--chip:${_teamColor(t)}"><th colspan="${rows.length + 2}"><span class="sl-dot"></span>${esc(t)}
                <span class="text-xs text-muted">${ppl.length} personne${ppl.length > 1 ? 's' : ''} · aucune rotation enregistrée sur le PI</span></th></tr>`;
        }
        const sep = `<tr class="sl-team-sep${t === m.mine ? ' is-mine' : ''}" style="--chip:${_teamColor(t)}"><th colspan="${rows.length + 2}"><span class="sl-dot"></span>${esc(t)}
            <span class="text-xs text-muted">${ppl.length} personne${ppl.length > 1 ? 's' : ''} · ${tot} passage${tot > 1 ? 's' : ''}</span></th></tr>`;
        return sep + ppl.map(p => `<tr class="${p.n ? '' : 'is-idle'}" style="--chip:${_teamColor(t)}">
            <td class="sl-person" title="${esc(p.name)}${p.realRole ? ` · ${esc(p.realRole)}` : ''}">${esc(fmtMemberName(p.name))}${p.realRole ? `<em class="rot-pool-chip-role">${esc(p.realRole)}</em>` : ''}</td>
            ${rows.map(r => {
                const hit = r.cells.find(c => c.team === t).on.find(x => x.name === p.name);
                return `<td class="sl-pc ${_rowCls(r.w, today)}">${hit ? `<span class="sl-on${hit.absent ? ' is-absent' : ''}" title="${esc(hit.days ? `Jours : ${hit.days}` : 'Semaine entière')}${hit.absent ? ' · absent' : ''}">${hit.days ? esc(hit.days) : '●'}</span>` : ''}</td>`;
            }).join('')}
            <td class="sl-tot${p.n ? '' : ' is-zero'}">${p.n}</td>
        </tr>`).join('');
    }).join('');
    return `<table class="sl-table sl-table--people"><thead><tr><th class="sl-person">Membre</th>${head}<th class="sl-tot" title="Semaines de support sur le PI">Tot.</th></tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Section complète, ou '' sans ligne produit.
 * @param {string} team      équipe du topbar ('all' possible)
 * @param {boolean} showPast semaines passées affichées (même bascule que la timeline)
 */
export function supportLineHtml(team, showPast = false) {
    const group = _lineOf(team);
    if (!group) return '';
    const m = _model(group, team);
    if (!m) return '';
    const today = todayIsoLocal();
    const view = _view();
    // « Par personne » compte tout le PI (équité) ; les deux autres suivent la bascule du passé
    const rows = (view === 'people' || showPast) ? m.rows : m.rows.filter(r => r.w.weekEnd >= today);
    const cur = m.rows.find(r => r.w.weekStart <= today && r.w.weekEnd >= today);
    const color = group.color || '#64748b';

    const teamChips = m.teams.map(t => {
        const n = cur ? cur.cells.find(c => c.team === t).on.length : 0;
        return `<span class="sl-team${t === m.mine ? ' is-mine' : ''}${cur && !n ? ' is-uncovered' : ''}" style="--chip:${_teamColor(t)}"
            title="${esc(t)} — ${cur ? `${n} personne${n > 1 ? 's' : ''} au support cette semaine` : 'semaine hors PI affiché'}"><span class="sl-dot"></span>${esc(t)}${cur ? `<b>${n}</b>` : ''}</span>`;
    }).join('');
    const quota = m.poolOn ? m.postes.map(p => `${p.want} ${p.poste}`).join(' + ') : '';
    const views = Object.entries(LINE_VIEWS).map(([k, v]) =>
        `<button type="button" class="sup-view-btn${k === view ? ' is-active' : ''}" data-sl-view="${k}" title="${esc(v.hint)}" aria-pressed="${k === view}">${v.label}</button>`).join('');
    const table = view === 'postes' ? _postesTable(m, rows, today) : view === 'people' ? _peopleTable(m, rows, today) : _teamsTable(m, rows, today);

    return `<section class="pi-section mb-4 sl" style="--line-color:${color}" aria-label="Support de la ligne produit ${esc(group.name)}">
        <div class="sl-hdr">
            <h3 class="pi-section-title"><span class="sl-line-dot"></span>Ligne produit ${esc(group.name)} <span class="sl-sub">· support du PI ${m.piNum || '?'}</span></h3>
            ${m.poolOn ? `<span class="sl-pool" title="Astreinte mutualisée sur ${esc(m.pool.teams.join(', '))} — composition visée chaque semaine">⧉ Rotation mutualisée${quota ? ` · ${esc(quota)} /sem.` : ''}</span>` : ''}
            <div class="sup-view-toggle sl-views" role="group" aria-label="Lecture de la ligne produit">${views}</div>
        </div>
        <div class="sl-teams">${cur ? `<span class="sl-now">Cette semaine · <b>${cur.all.length}</b> au support</span>` : ''}${teamChips}</div>
        <div class="table-wrap sl-wrap">${table}</div>
        <a class="sl-edit text-xs" href="#settings/rotation">⚙ Éditer dans Paramètres → Rotation${m.poolOn ? ' (rotation mutualisée)' : ''}</a>
    </section>`;
}

/** Bascule de lecture (re-rendu de la vue). */
export function wireSupportLine(container, rerender) {
    container.querySelectorAll('[data-sl-view]').forEach(btn => btn.addEventListener('click', () => {
        try { localStorage.setItem(_VIEW_KEY, btn.dataset.slView); } catch { /* sans gravité */ }
        rerender();
    }));
}
