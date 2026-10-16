/**
 * 🃏 Séance d'affinage — la file des tickets à estimer d'une équipe, et l'avancement de la séance.
 *
 *   • file d'attente : `estimationQueue` (utils/estimation-queue.js, MÊME ordre que le bouton
 *     « ⏭ Suivant » de la popin Poker) — sprint en cours, autres sprints, backlog ;
 *   • « ▶ Démarrer » / « 🃏 Estimer » ouvrent la modale du ticket puis SA popin Poker (le bouton 🃏
 *     de la modale porte le bon `apiSave`), qui enchaîne ensuite tout seule (« Enregistrer & suivant ») ;
 *   • séance = tours CONCLUS aujourd'hui (`pokerround`), avec le temps passé par ticket (écart entre
 *     deux enregistrements, plafonné : au-delà de 45 min ce n'est plus la même séance) ;
 *   • 🗳 = une session de vote est ouverte sur ce ticket (`/api/poker-sessions`).
 *
 * Rafraîchie quand les tickets changent (enregistrement d'un tour) et toutes les 8 s (votes et
 * enregistrements faits sur un autre poste). Timers / écouteurs libérés au changement de vue.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import {
    esc, fmtRelative, typeBadge, copyToClipboard, priorityBadge, pointsTone, emptyStateHtml,
    estimationQueue, ESTIMATION_GROUPS, getSprintForTeam, workdaysBetween, parseWikiMarkup,
} from '../utils.js';
import { refinementRecapModel, recapSlack, recapHtml, copyRecapRich, downloadRecapCsv, toCompleteSlack } from '../components/refinement_recap.js';
import { acceptanceStatus } from '../components/desc_sections.js';

const _BACKLOG_PREVIEW = 12;

// Critères d'acceptation : même repérage que le volet du Poker (desc_sections.js), mis en cache par
// objet ticket (la page se repeint toutes les 8 s ; le store remplace les objets à chaque rechargement).
const _accCache = new WeakMap();
// Critères attendus sur les STORIES seulement (une tâche technique sans critère est normale) ; une
// description VIDE se signale pour tous les types.
function _acceptance(t) {
    if (_accCache.has(t)) return _accCache.get(t);
    const raw = String(t.description || '');
    let v = acceptanceStatus(raw.trim().startsWith('<') ? raw : parseWikiMarkup(raw));
    if (v === 'missing' && t.type !== 'story') v = 'ok';
    _accCache.set(t, v);
    return v;
}
const _SESSION_GAP_MIN = 45;
let _st = null;   // { team, rounds, sessions, timer, unsubs, showAllBacklog, recapOpen }

function _cleanup() {
    if (!_st) return;
    clearInterval(_st.timer);
    _st.unsubs.forEach(u => u?.());
    _st = null;
}

const _todayStartIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const _hhmm = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const _fmt1 = n => String(Math.round(n * 10) / 10).replace('.', ',');

/** Tours du jour, du plus ancien au plus récent, avec la durée passée sur chacun (null = 1ᵉʳ de la séance). */
function _sessionRounds(rounds) {
    const asc = [...(rounds || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return asc.map((r, i) => {
        const prev = asc[i - 1];
        const min = prev ? (Date.parse(r.createdAt) - Date.parse(prev.createdAt)) / 60000 : null;
        return { ...r, minutes: min != null && min <= _SESSION_GAP_MIN ? min : null };
    });
}

function _queueRowHtml({ t }, i, sessions, showSprint) {
    const live = sessions?.[t.id];
    const acc = _acceptance(t);
    const age = workdaysBetween(t.createdAt, new Date());
    return `<li class="rf-row">
        <span class="rf-rank">${i + 1}</span>
        ${typeBadge(t.type, { size: '2xs' })}
        <button type="button" class="rf-id" data-rf-open="${esc(t.id)}" title="Ouvrir le ticket">${esc(t.id)}</button>
        <span class="rf-title" title="${esc(t.title || '')}">${esc(t.title || '')}</span>
        <span class="rf-meta">
            ${acc === 'empty' ? '<span class="rf-warn rf-warn--empty" title="Pas de description dans JIRA : à rédiger avant d\'estimer" aria-label="Sans description">📝</span>'
                : acc === 'missing' ? '<span class="rf-warn" title="Story sans critère d\'acceptation repéré dans la description : à compléter avant d\'estimer" aria-label="Sans critères d\'acceptation">⚠️</span>' : ''}
            ${live ? `<span class="rf-live" title="${live.votes} vote${live.votes > 1 ? 's' : ''} déjà posé${live.votes > 1 ? 's' : ''}${live.revealed ? ' (révélés)' : ''}">🗳 ${live.votes}</span>` : ''}
            ${priorityBadge(t.priority, { size: '2xs' })}
            ${showSprint && t.sprintName ? `<span class="rf-sprint" title="${esc(t.sprintName)}">${esc(t.sprintName)}</span>` : ''}
            ${age != null ? `<span class="rf-age" title="Jours ouvrés depuis la création">${age} j</span>` : ''}
        </span>
        <button type="button" class="btn btn-secondary btn-sm rf-go" data-rf-poker="${esc(t.id)}">🃏 Estimer</button>
    </li>`;
}

function _roundRowHtml(r) {
    const nums = (r.votes || []).map(v => Number(v.value)).filter(Number.isFinite);
    const split = r.spread != null && r.spread >= 4;
    const t = (store.get('tickets') || []).find(x => x.id === r.ticketId);
    return `<li class="rf-done">
        <span class="rf-done-time">${esc(_hhmm(r.createdAt))}</span>
        <button type="button" class="rf-id" data-rf-open="${esc(r.ticketId)}">${esc(r.ticketId)}</button>
        <span class="rf-title" title="${esc(t?.title || '')}">${esc(t?.title || '')}</span>
        <span class="rf-done-votes" title="${esc((r.votes || []).map(v => `${v.voter} : ${v.value}`).join(' · '))}">${(r.votes || []).map(v => esc(v.value)).join(' · ')}</span>
        <span class="mdl-points pts-tone--${pointsTone(r.value).key}">${r.value}<small>pts</small></span>
        ${split ? `<span class="rf-flag" title="Écart-type ${_fmt1(r.spread)}">⚠️ ${Math.min(...nums)} ↔ ${Math.max(...nums)}</span>` : r.spread === 0 && r.voters > 1 ? '<span class="rf-flag rf-flag--ok">🎯</span>' : ''}
        <span class="rf-done-dur">${r.minutes != null ? `⏱ ${r.minutes < 1 ? '< 1' : Math.round(r.minutes)} min` : ''}</span>
    </li>`;
}

/** File, tours du jour et sprint en cours de l'équipe — partagés par le rendu et le récap. */
function _data(team) {
    const tickets = store.get('tickets') || [];
    const sprint = getSprintForTeam(team);
    const sprintName = sprint?.state === 'active' ? sprint.name : '';
    return { tickets, sprintName, queue: estimationQueue(tickets, team, { sprintName }), rounds: _sessionRounds(_st.rounds) };
}

function _html(team) {
    const { tickets, sprintName, queue, rounds } = _data(team);
    const timed = rounds.filter(r => r.minutes != null);
    const avgMin = timed.length ? timed.reduce((s, r) => s + r.minutes, 0) / timed.length : null;
    const splits = rounds.filter(r => r.spread != null && r.spread >= 4).length;
    const inSprint = queue.filter(x => x.group === 'sprint').length;
    const doneSprint = rounds.filter(r => (tickets.find(x => x.id === r.ticketId)?.sprintName || '') === sprintName && sprintName).length;
    const pct = inSprint + doneSprint ? Math.round(doneSprint / (inSprint + doneSprint) * 100) : null;
    const first = queue[0]?.t;

    const toFix = queue.filter(x => _acceptance(x.t) !== 'ok').length;
    const shown = _st.onlyMissing ? queue.filter(x => _acceptance(x.t) !== 'ok') : queue;
    const groups = ESTIMATION_GROUPS.map(g => {
        const items = shown.filter(x => x.group === g.key);
        if (!items.length) return '';
        const limit = g.key === 'backlog' && !_st.showAllBacklog ? _BACKLOG_PREVIEW : Infinity;
        const offset = queue.indexOf(items[0]);   // rang dans la file COMPLÈTE, même filtrée
        return `<section class="rf-group">
            <h3 class="rf-group-title">${esc(g.key === 'sprint' && sprintName ? `${g.label} · ${sprintName}` : g.label)} <span class="rf-count">${items.length}</span></h3>
            <ol class="rf-list">${items.slice(0, limit).map((x, i) => _queueRowHtml(x, offset + i, _st.sessions, g.key === 'other')).join('')}</ol>
            ${items.length > limit ? `<button type="button" class="rf-more" data-rf-more>Afficher les ${items.length - limit} autres</button>` : ''}
        </section>`;
    }).join('');

    return `<div class="rf">
        ${_st.apiMissing ? `<div class="rf-api-warn" role="alert">
            <b>⚠️ Le serveur ne connaît pas encore la séance d'affinage.</b>
            Il tourne sur une version plus ancienne que la page (lancé avant la mise à jour, sans rechargement auto) :
            les estimations enregistrées n'ont pas été archivées. <b>Redémarrez-le</b> (Ctrl+C puis <code>python main.py</code>).
        </div>` : ''}
        <header class="card rf-hero">
            <div class="rf-hero-main">
                <h2 class="rf-hero-title">🃏 Séance d'affinage — ${esc(team)}</h2>
                <p class="rf-hero-sub">Estimez la file dans l'ordre : chaque « Enregistrer &amp; suivant » du Poker passe au ticket d'après.</p>
                ${first ? `<button type="button" class="btn btn-primary rf-start" data-rf-poker="${esc(first.id)}">▶ Démarrer le Poker <span class="rf-start-id">${esc(first.id)}</span></button>` : ''}
            </div>
            <div class="rf-kpis">
                <div class="rf-kpi"><span class="rf-kpi-val">${queue.length}</span><span class="rf-kpi-lbl">à estimer</span></div>
                <div class="rf-kpi rf-kpi--ok"><span class="rf-kpi-val">${rounds.length}</span><span class="rf-kpi-lbl">estimé${rounds.length > 1 ? 's' : ''} aujourd'hui</span></div>
                <div class="rf-kpi"><span class="rf-kpi-val">${avgMin != null ? `${avgMin < 1 ? '< 1' : Math.round(avgMin)} min` : '—'}</span><span class="rf-kpi-lbl">par ticket</span></div>
                <div class="rf-kpi${splits ? ' rf-kpi--warn' : ''}"><span class="rf-kpi-val">${splits}</span><span class="rf-kpi-lbl">désaccord${splits > 1 ? 's' : ''} fort${splits > 1 ? 's' : ''}</span></div>
            </div>
            ${pct != null ? `<div class="rf-progress" title="Sprint en cours : ${doneSprint} estimé(s) aujourd'hui, ${inSprint} restant(s)">
                <span class="rf-progress-lbl">Sprint en cours</span>
                <span class="rf-progress-bar"><i style="width:${pct}%"></i></span>
                <b>${doneSprint} / ${inSprint + doneSprint}</b>
            </div>` : ''}
        </header>
        ${rounds.length && _st.recapOpen ? `<section class="card rf-recap" aria-label="Récapitulatif de la séance">
            <div class="rf-recap-actions">
                <span class="rf-recap-lbl">📤 Partager à l'équipe</span>
                <button type="button" class="btn btn-primary btn-sm" data-rf-copy="slack" title="Texte au format Slack (gras, liens JIRA)">💬 Copier pour Slack</button>
                <button type="button" class="btn btn-secondary btn-sm" data-rf-copy="rich" title="Mise en forme conservée au collage dans Teams, Outlook, Gmail">📝 Copier pour Teams / mail</button>
                <button type="button" class="btn btn-secondary btn-sm" data-rf-copy="csv" title="Un ticket par ligne (Excel)">⬇ CSV</button>
                <button type="button" class="btn-icon rf-recap-close" data-rf-recap aria-label="Fermer le récap"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>
            </div>
            <div class="rf-recap-preview" aria-label="Aperçu du récapitulatif">${recapHtml(refinementRecapModel({ team, rounds, queue }))}</div>
        </section>` : ''}
        <div class="rf-cols">
            <div class="card rf-queue">
                <div class="card-header">
                    <span class="card-title">📋 File d'attente</span>
                    ${toFix ? `<span class="rf-fix-actions">
                        <button type="button" class="rf-fix-copy" data-rf-copy-fix title="Copier pour Slack la liste des tickets à compléter, regroupés par rapporteur">📋 Copier pour Slack</button>
                        <button type="button" class="rf-fix-toggle${_st.onlyMissing ? ' is-on' : ''}" data-rf-only-missing aria-pressed="${!!_st.onlyMissing}"
                        title="Tickets sans description (📝), ou stories sans critère d'acceptation repéré (⚠️) — à compléter avant la séance">⚠️ ${toFix} à compléter${_st.onlyMissing ? ' · voir tout' : ''}</button>
                    </span>`
                        : '<span class="card-subtitle">même équipe · sans points · hors epics / features</span>'}
                </div>
                ${groups || emptyStateHtml({ icon: '🎉', title: 'Rien à estimer', text: `Tous les tickets en cours de ${team} ont des points.`, tone: 'ok' })}
            </div>
            <div class="card rf-session">
                <div class="card-header">
                    <span class="card-title">✅ Estimés aujourd'hui</span>
                    <span class="rf-session-head">
                        <span class="card-subtitle">${rounds.length ? `depuis ${esc(_hhmm(rounds[0].createdAt))}` : ''}</span>
                        ${rounds.length ? `<button type="button" class="btn btn-secondary btn-sm rf-recap-btn${_st.recapOpen ? ' is-on' : ''}" data-rf-recap aria-expanded="${!!_st.recapOpen}" title="Récapitulatif à partager à l'équipe (Slack, Teams / mail, CSV)">📤 Récap</button>` : ''}
                    </span>
                </div>

                ${rounds.length
                    ? `<ol class="rf-done-list">${[...rounds].reverse().map(_roundRowHtml).join('')}</ol>`
                    : emptyStateHtml({ icon: '🃏', title: 'La séance n\'a pas commencé', text: 'Les tickets apparaissent ici dès qu\'un Poker est enregistré.' })}
            </div>
        </div>
    </div>`;
}

async function _load() {
    if (!_st) return;
    // 404 / 405 = le serveur tourne sur un code plus ancien que le front (lancé sans --reload, ou pas
    // relancé) : la route n'existe pas. Le dire, plutôt qu'afficher « la séance n'a pas commencé ».
    const missing = e => { if ((e?.status === 404 || e?.status === 405) && _st) _st.apiMissing = true; };
    const [rounds, sessions] = await Promise.all([
        api.getTeamPokerRounds(_st.team, _todayStartIso()).then(r => { if (_st) _st.apiMissing = false; return r; })
            .catch(e => { missing(e); return _st?.rounds || []; }),
        api.getPokerSessions().catch(e => { missing(e); return _st?.sessions || {}; }),
    ]);
    if (!_st) return;
    _st.rounds = rounds; _st.sessions = sessions;
}

function _paint(container) {
    if (!_st || !container.isConnected) return;
    const y = container.scrollTop;
    container.innerHTML = _html(_st.team);
    container.scrollTop = y;
}

function _openPoker(id) {
    window.__squadBoard?.openTicketModal?.(id);
    requestAnimationFrame(() => document.getElementById('mdl-poker-btn')?.click());
}

export async function renderRefinement(container) {
    _cleanup();
    const team = store.get('team');
    if (!team || team === 'all' || store.get('group')) {
        container.innerHTML = emptyStateHtml({
            icon: '🃏', title: 'Choisissez une équipe',
            text: 'La séance d\'affinage se prépare équipe par équipe : sélectionnez-en une dans la barre latérale.',
        });
        return;
    }
    _st = { team, rounds: [], sessions: {}, timer: null, unsubs: [], showAllBacklog: false, recapOpen: false, onlyMissing: false };
    _paint(container);
    await _load();
    _paint(container);

    container.onclick = e => {
        const poker = e.target.closest('[data-rf-poker]');
        if (poker) { _openPoker(poker.dataset.rfPoker); return; }
        const open = e.target.closest('[data-rf-open]');
        if (open) { window.__squadBoard?.openTicketModal?.(open.dataset.rfOpen); return; }
        if (e.target.closest('[data-rf-more]') && _st) { _st.showAllBacklog = true; _paint(container); return; }
        if (e.target.closest('[data-rf-copy-fix]') && _st) {
            const { queue } = _data(_st.team);
            const items = queue.map(x => ({ ...x, status: _acceptance(x.t) })).filter(x => x.status !== 'ok');
            if (items.length) copyToClipboard(toCompleteSlack(_st.team, items), 'Liste à compléter copiée');
            return;
        }
        if (e.target.closest('[data-rf-only-missing]') && _st) { _st.onlyMissing = !_st.onlyMissing; _paint(container); return; }
        if (e.target.closest('[data-rf-recap]') && _st) { _st.recapOpen = !_st.recapOpen; _paint(container); return; }
        const copy = e.target.closest('[data-rf-copy]');
        if (copy && _st) {
            const { queue, rounds } = _data(_st.team);
            const m = refinementRecapModel({ team: _st.team, rounds, queue });
            if (copy.dataset.rfCopy === 'slack') copyToClipboard(recapSlack(m), 'Récap Slack copié');
            else if (copy.dataset.rfCopy === 'rich') copyRecapRich(m);
            else downloadRecapCsv(m);
        }
    };
    // Un tour enregistré met à jour les tickets (points) : la file et la séance suivent.
    let pending = null;
    const refresh = () => { clearTimeout(pending); pending = setTimeout(async () => { await _load(); _paint(container); }, 250); };
    _st.unsubs.push(store.on('tickets', refresh));
    _st.timer = setInterval(refresh, 8000);
    _st.unsubs.push(store.on('view', v => { if (v !== 'refinement') { container.onclick = null; _cleanup(); } }));
}
