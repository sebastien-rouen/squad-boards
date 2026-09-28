/**
 * Paramètres → Calendriers ICS : tableau du DÉTECTEUR d'évènements (utils/cal-classify.js).
 *   - couverture par équipe (part rangée, répartition des natures) ;
 *   - alertes par agenda : détails masqués (« disponibilités seulement »), agenda d'équipe déclaré
 *     partagé avec d'autres équipes, équipes sans agenda relié ;
 *   - file « À positionner » : titres non reconnus, rangés en un choix (règle `calendar_rule`,
 *     partagée par toutes les équipes) ; règles existantes, supprimables (« revenir à la détection »).
 * Rendu dans un hôte propre, redessiné à chaque changement de règles — settings.js n'appelle que
 * `calDetectHtml()` et `wireCalDetect()` (même motif que settings-jira.js).
 */

import { store } from '../state.js';
import { esc, CAL_NATURES, calNorm, calNatureWithRules } from '../utils.js';
import { eventsFor, teamColor, saveRule, dropRule } from '../components/team_calendar.js';

const KINDS = Object.keys(CAL_NATURES);
const QUEUE_MAX = 40;               // au-delà, la file devient un mur : les plus fréquents d'abord

/** Chiffres d'une équipe : évènements propres (équipe + groupe), répartition, part rangée. */
function teamStats(team) {
    const evs = eventsFor(team).filter(e => e.scope === 'team' || e.scope === 'group');
    const by = Object.fromEntries(KINDS.map(k => [k, 0]));
    evs.forEach(e => { by[e.kind]++; });
    const denom = evs.length - by.busy;
    return { team, n: evs.length, by, masked: by.busy, pct: denom ? Math.round((denom - by.other) / denom * 100) : null };
}

function alertsHtml() {
    const cals = store.get('calendars') || [];
    const events = store.get('calendarEvents') || [];
    const teams = (store.get('teamObjects') || []).map(t => t.name);
    const perCal = new Map();
    for (const e of events) {
        const c = perCal.get(e.calendarId) || { n: 0, busy: 0 };
        c.n++; if (calNatureWithRules(e.title, []).nature === 'busy') c.busy++;
        perCal.set(e.calendarId, c);
    }
    const out = [];
    for (const c of cals) {
        const list = String(c.team || '').split(',').map(s => s.trim()).filter(Boolean);
        const st = perCal.get(c.id) || { n: 0, busy: 0 };
        if (st.n && st.busy === st.n) out.push(`🔒 <b>${esc(c.name)}</b> est partagé en « disponibilités seulement » : ${st.n} créneaux sans titre, impossibles à ranger. Le repartager avec <b>tous les détails</b>.`);
        const named = teams.find(t => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(c.name));
        if (named && list.length > 1 && list.includes(named)) out.push(`⚠️ <b>${esc(c.name)}</b> est déclaré partagé avec ${esc(list.filter(t => t !== named).join(', '))} : ses rituels s'affichent aussi chez eux. Vérifier le champ « équipes » de cet agenda.`);
    }
    const covered = new Set(cals.flatMap(c => String(c.team || '').split(',').map(s => s.trim()).filter(Boolean)));
    const orphans = teams.filter(t => !covered.has(t));
    if (orphans.length) out.push(`📭 <b>Sans agenda relié</b> : ${orphans.map(esc).join(', ')} — leur page Équipe affiche « Relier un agenda ».`);
    return out.length ? `<ul class="tcd-alerts">${out.map(a => `<li>${a}</li>`).join('')}</ul>` : '<p class="text-sm text-muted">✓ Aucune alerte sur les agendas.</p>';
}

function teamsHtml() {
    const stats = (store.get('teamObjects') || []).map(t => teamStats(t.name)).sort((a, b) => b.n - a.n);
    return `<table class="tcd-table"><thead><tr><th>Équipe</th><th class="num">Évts</th><th class="num">Rangés</th><th>Natures</th></tr></thead><tbody>
        ${stats.map(s => `<tr><td><span class="tcd-sw" style="background:${teamColor(s.team)}"></span>${esc(s.team)}</td>
            <td class="num">${s.n || '—'}</td>
            <td class="num">${!s.n ? '—' : s.masked === s.n ? '🔒 masqué' : `<b>${s.pct} %</b>`}</td>
            <td>${s.n ? `<div class="tcd-bar">${KINDS.filter(k => s.by[k]).map(k => `<span data-k="${k}" style="flex:${s.by[k]}" title="${esc(CAL_NATURES[k].label)} : ${s.by[k]}"></span>`).join('')}</div>` : '<span class="text-muted text-sm">sans agenda</span>'}</td>
        </tr>`).join('')}
    </tbody></table>`;
}

function queueHtml() {
    const rules = store.get('calendarRules') || [];
    const groups = new Map();
    for (const e of store.get('calendarEvents') || []) {
        if (calNatureWithRules(e.title, rules).nature !== 'other') continue;
        const k = calNorm(e.title);
        const g = groups.get(k) || { title: e.title, n: 0, cals: new Set() };
        g.n++; g.cals.add(String(e.calendarName || '').replace(/^ERPC - /, ''));
        groups.set(k, g);
    }
    const todo = [...groups.values()].sort((a, b) => b.n - a.n);
    const opts = KINDS.filter(k => k !== 'other').map(k => `<option value="${k}">${CAL_NATURES[k].emoji} ${esc(CAL_NATURES[k].label)}</option>`).join('');
    return `
        <p class="text-sm text-muted mb-2">${todo.length ? `<b>${todo.length}</b> titres non reconnus` : 'Tous les titres sont rangés.'} — un choix vaut pour toutes les occurrences, dans toutes les équipes.</p>
        <div class="tcd-queue">${todo.slice(0, QUEUE_MAX).map(g => `<div class="tcd-q">
            <div><b>${esc(g.title)}</b><small>${g.n} occurrence${g.n > 1 ? 's' : ''} · ${esc([...g.cals].join(', '))}</small></div>
            <select class="select select-sm" data-cal-classify="${esc(g.title)}" aria-label="Classer « ${esc(g.title)} »"><option value="">— Classer comme —</option>${opts}</select>
        </div>`).join('')}${todo.length > QUEUE_MAX ? `<p class="text-sm text-muted">… et ${todo.length - QUEUE_MAX} titres plus rares.</p>` : ''}</div>
        ${rules.length ? `<h5 class="tcd-h5">Rangés à la main (${rules.length})</h5>
        <div class="tcd-queue">${rules.map(r => `<div class="tcd-q is-done">
            <div><b>${esc(r.titleExample || r.titleNorm)}</b><small>${CAL_NATURES[r.nature]?.emoji || ''} ${esc(CAL_NATURES[r.nature]?.label || r.nature)}</small></div>
            <button class="btn btn-sm btn-secondary" data-cal-unrule="${esc(r.id)}">Revenir à la détection</button>
        </div>`).join('')}</div>` : ''}`;
}

function body() {
    if (!store.get('calendarEvents')) return '<p class="text-sm text-muted">Chargement des agendas…</p>';
    return `<h5 class="tcd-h5">Alertes</h5>${alertsHtml()}
        <h5 class="tcd-h5">Couverture par équipe</h5>${teamsHtml()}
        <h5 class="tcd-h5">À positionner</h5>${queueHtml()}`;
}

/** Bloc à insérer dans la section « Calendriers ICS ». */
export function calDetectHtml() {
    return `<div class="tcd" id="tcd-host" aria-label="Détecteur d'évènements">
        <h4 class="text-sm font-semibold mb-2">🧭 Détecteur d'évènements</h4>
        <p class="text-sm text-muted mb-3">Chaque évènement reçoit une <b>nature</b> (depuis son titre) et une <b>portée</b> (depuis son agenda). Utilisé par la carte « Agenda de l'équipe » et le bandeau calendrier.</p>
        <div data-tcd-body>${body()}</div>
    </div>`;
}

let _listening = false;
/** Câblage : choix de nature, suppression de règle, redessin à chaque changement de règles. */
export function wireCalDetect(container) {
    const host = container.querySelector('#tcd-host');
    if (!host) return;
    const draw = () => {
        const h = document.querySelector('#tcd-host [data-tcd-body]');
        if (!h) return;
        h.innerHTML = body();
        h.querySelectorAll('[data-cal-classify]').forEach(s => s.addEventListener('change', () => { if (s.value) saveRule(s.dataset.calClassify, s.value); }));
        h.querySelectorAll('[data-cal-unrule]').forEach(b => b.addEventListener('click', () => dropRule(b.dataset.calUnrule)));
    };
    draw();
    if (!_listening) { _listening = true; store.on('calendarRules', draw); store.on('calendarEvents', draw); }
}
