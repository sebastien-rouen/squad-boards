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
 *   • fil « Par où commencer ? » (components/refinement_steps.js) : compléter → estimer → cadrer → partager ;
 *   • 🧭 volet Cadrage : tickets `Cadrage_PI<N>` du périmètre de l'équipe, vus en SA / PO-PM /
 *     contributeur (`cadrageModel`, utils/cadrage.js ; rendu components/refinement_cadrage.js).
 *
 * Rafraîchie quand les tickets changent (enregistrement d'un tour) et toutes les 8 s (votes et
 * enregistrements faits sur un autre poste). Timers / écouteurs libérés au changement de vue.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import {
    esc, hashColor, initials, fmtRelative, typeBadge, copySlack, priorityBadge, pointsTone, emptyStateHtml,
    estimationQueue, sprintProximity, extractSprintLabel, getSprintForTeam, workdaysBetween, parseWikiMarkup,
    cadrageModel, scrollWithin, getCurrentPi, extractPiNum, effectiveRosterForPi, teamNameMatches,
} from '../utils.js';
import { refinementRecapModel, recapSlack, recapHtml, copyRecapRich, downloadRecapCsv, toCompleteSlack } from '../components/refinement_recap.js';
import { cadrageSectionHtml } from '../components/refinement_cadrage.js';
import { refinementStepsHtml } from '../components/refinement_steps.js';
import { acceptanceStatus } from '../components/desc_sections.js';
import { readyChecks, armReadyGuide } from '../components/ticket_ready.js';

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
// « Prêt à estimer ? » d'un ticket de la file : `readyChecks` (ticket_ready.js, même calcul que la fiche) SANS
// l'estimation (toute la file est à estimer) — SOURCE du badge ✨, du compteur / filtre « à compléter », du tri
// « moins prêts d'abord » et de la copie Slack. Caché par objet ticket, comme `_acceptance`.
const _readyCache = new WeakMap();
function _readyOf(t) {
    if (_readyCache.has(t)) return _readyCache.get(t);
    const checks = readyChecks(t, _acceptance(t)).filter(c => c.key !== 'points');
    const v = { checks, done: checks.filter(c => c.done).length, total: checks.length, missing: checks.filter(c => !c.done) };
    _readyCache.set(t, v);
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
    const age = workdaysBetween(t.createdAt, new Date());
    const lead = t.leader || t.assignee || '';
    return `<li class="rf-row" data-rf-row="${esc(t.id)}" tabindex="0" aria-label="Ouvrir ${esc(t.id)} — ${esc(t.title || '')}">
        <span class="rf-rank">${i + 1}</span>
        ${typeBadge(t.type, { size: '2xs' })}
        <button type="button" class="rf-id" data-rf-open="${esc(t.id)}" title="Ouvrir le ticket">${esc(t.id)}</button>
        <span class="rf-title">${esc(t.title || '')}</span>
        <span class="rf-meta">
            ${lead ? `<span class="rf-av" style="--av:${hashColor(lead)}" title="Porteur : ${esc(lead)}">${esc(initials(lead))}</span>` : ''}
            ${_readyBadge(t)}
            ${live ? `<span class="rf-live" title="${live.votes} vote${live.votes > 1 ? 's' : ''} déjà posé${live.votes > 1 ? 's' : ''}${live.revealed ? ' (révélés)' : ''}">🗳 ${live.votes}</span>` : ''}
            ${priorityBadge(t.priority, { size: '2xs' })}
            ${showSprint && t.sprintName ? `<span class="rf-sprint" title="${esc(t.sprintName)}">${esc(t.sprintName)}</span>` : ''}
            ${age != null ? `<span class="rf-age" title="Jours ouvrés depuis la création">${age} j</span>` : ''}
        </span>
        <button type="button" class="btn btn-secondary btn-sm rf-go" data-rf-poker="${esc(t.id)}" aria-label="Estimer ${esc(t.id)}">🃏<span class="rf-go-lbl"> Estimer</span></button>
    </li>`;
}

function _roundRowHtml(r) {
    const nums = (r.votes || []).map(v => Number(v.value)).filter(Number.isFinite);
    const split = r.spread != null && r.spread >= 4;
    const t = (store.get('tickets') || []).find(x => x.id === r.ticketId);
    return `<li class="rf-done" data-rf-row="${esc(r.ticketId)}" tabindex="0" title="Ouvrir ${esc(r.ticketId)}${t?.title ? ` — ${esc(t.title)}` : ''}">
        <span class="rf-done-time">${esc(_hhmm(r.createdAt))}</span>
        <button type="button" class="rf-id" data-rf-open="${esc(r.ticketId)}">${esc(r.ticketId)}</button>
        <span class="rf-title">${esc(t?.title || '')}</span>
        <span class="rf-done-votes" title="${esc((r.votes || []).map(v => `${v.voter} : ${v.value}`).join(' · '))}">${(r.votes || []).map(v => esc(v.value)).join(' · ')}</span>
        <span class="mdl-points pts-tone--${pointsTone(r.value).key}">${r.value}<small>pts</small></span>
        ${split ? `<span class="rf-flag" title="Écart-type ${_fmt1(r.spread)}">⚠️ ${Math.min(...nums)} ↔ ${Math.max(...nums)}</span>` : r.spread === 0 && r.voters > 1 ? '<span class="rf-flag rf-flag--ok">🎯</span>' : ''}
        <span class="rf-done-dur">${r.minutes != null ? `⏱ ${r.minutes < 1 ? '< 1' : Math.round(r.minutes)} min` : ''}</span>
    </li>`;
}

// Jour + mois (+ année si ce n'est pas l'année en cours : « clos le 26 déc. 2025 »)
const _dm = d => { if (!d) return ''; const x = new Date(d); return x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(x.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };

/**
 * Sections de la file, du plus proche au plus loin : sprint en cours, chaque autre sprint (ordre
 * `sprintProximity`, le même que la file), backlog. `items` = tickets AFFICHÉS (filtre « à compléter » compris).
 */
function _queueSections(shown, queue, sprintName, teamSprints) {
    const out = [];
    const res = _sections(shown, queue, sprintName, teamSprints, out);
    for (const g of res) g.name = g.key === 'sprint' || g.key === 'backlog' ? g.key : g.items[0]?.t.sprintName || g.key;
    // Tri « moins prêts d'abord » : DANS chaque groupe (l'ordre des sprints ne bouge pas), part remplie croissante,
    // puis le plus de manques, puis le rang de la file. Le n° de rang affiché reste celui de la file.
    if (_st?.sort === 'ready') for (const g of res) g.items = [...g.items].sort((a, b) => {
        const ra = _readyOf(a.t), rb = _readyOf(b.t);
        return ra.done / ra.total - rb.done / rb.total || rb.missing.length - ra.missing.length || queue.indexOf(a) - queue.indexOf(b);
    });
    return res;
}

function _sections(shown, queue, sprintName, teamSprints, out) {
    const cur = shown.filter(x => x.group === 'sprint');
    if (cur.length) out.push({ key: 'sprint', kind: 'sprint', items: cur, chip: `▶ ${extractSprintLabel(sprintName) || 'En cours'}`,
        tip: `Sprint en cours · ${sprintName}`, titleHtml: `<span class="rf-gt-state rf-gt-state--active">en cours</span> ${esc(sprintName || 'Sprint en cours')}` });
    const others = shown.filter(x => x.group === 'other');
    const prox = sprintProximity(queue.filter(x => x.group === 'other').map(x => x.t.sprintName), teamSprints);
    [...new Set(others.map(x => x.t.sprintName))].sort((a, b) => prox.get(a).rank - prox.get(b).rank).forEach((name, i) => {
        const p = prox.get(name);
        const when = p.state === 'future' && p.startDate ? `démarre le ${_dm(p.startDate)}`
            : p.state === 'future' ? 'à venir' : p.state === 'active' ? 'en cours' : p.state === 'closed' ? `clos${p.endDate ? ` le ${_dm(p.endDate)}` : ''}` : 'dates inconnues';
        out.push({ key: `s${i}`, kind: p.state, items: others.filter(x => x.t.sprintName === name),
            chip: extractSprintLabel(name) || name, tip: `${name} · ${when}`,
            titleHtml: `<span class="rf-gt-state rf-gt-state--${p.state}">${esc(when)}</span> ${esc(name)}` });
    });
    const bl = shown.filter(x => x.group === 'backlog');
    if (bl.length) out.push({ key: 'backlog', kind: 'backlog', items: bl, chip: 'Backlog', tip: 'Sans sprint',
        titleHtml: '<span class="rf-gt-state rf-gt-state--backlog">sans sprint</span> Backlog' });
    return out;
}

/**
 * Groupe déplié ? Choix explicite de l'utilisateur (par équipe, `sb-refinement-groups`) sinon : sprints clos et
 * backlog REPLIÉS dès qu'un sprint en cours / à venir existe (sinon on replierait tout ce qu'il y a à estimer).
 */
function _groupOpen(g, near) {
    const v = _st?.groupOpen?.[g.name];
    return v != null ? v : !(near && (g.kind === 'closed' || g.kind === 'backlog'));
}
function _setGroupOpen(name, open) {
    _st.groupOpen = { ..._st.groupOpen, [name]: open };
    try {
        const all = JSON.parse(localStorage.getItem('sb-refinement-groups') || '{}') || {};
        all[_st.team] = _st.groupOpen;
        localStorage.setItem('sb-refinement-groups', JSON.stringify(all));
    } catch { /* préférence non retenue */ }
}

/**
 * Badge ✨ « prêt à estimer » d'une ligne : MÊME calcul que la bande de la fiche (`readyChecks`, ticket_ready.js),
 * estimation exclue (toute la file est à estimer). Teinte : rouge sans description, ambre s'il manque autre chose.
 */
function _readyBadge(t) {
    const r = _readyOf(t);
    const tone = !r.missing.length ? 'ok' : _acceptance(t) === 'empty' ? 'crit' : 'warn';
    return `<span class="rf-ready rf-ready--${tone}" data-rf-ready="${esc(t.id)}" tabindex="-1"
        aria-label="${esc(r.missing.length ? `Prêt à estimer : ${r.done} sur ${r.total} — manque ${r.missing.map(c => c.label.toLowerCase()).join(', ')}` : 'Prêt à estimer')}">${r.missing.length
        ? `<span class="rf-ready-n">✨ ${r.done}/${r.total}</span><i aria-hidden="true">${r.missing.map(c => c.icon).join('')}</i>` : '✓ <span class="rf-ready-n">prêt</span>'}</span>`;
}

/** Titre complet au survol d'un titre tronqué, avec sprint, ancienneté et rapporteur. */
function _titlePopHtml(t) {
    const age = workdaysBetween(t.createdAt, new Date());
    return `<span class="rf-pop-id">${esc(t.id)}</span><b class="rf-pop-full">${esc(t.title || '')}</b>
        <span class="rf-pop-meta">${[t.sprintName ? `🏃 ${esc(t.sprintName)}` : '📦 Backlog', age != null ? `créé il y a ${age} j ouvrés` : '', t.reporter ? `✍️ ${esc(t.reporter)}` : ''].filter(Boolean).join(' · ')}</span>`;
}

/** Détail au survol du badge ✨ : chaque point de contrôle, coché ou non (calque unique `.rf-pop`, position fixe). */
function _readyPopHtml(t) {
    const r = _readyOf(t);
    return `<b class="rf-pop-title">${r.missing.length ? `✨ Prêt à estimer : ${r.done}/${r.total}` : '✓ Prêt à estimer'}</b>
        <span class="rf-pop-bar" aria-hidden="true"><i style="width:${Math.round(r.done / r.total * 100)}%"></i></span>
        <ul class="rf-pop-list">${r.checks.map(c => `<li class="${c.done ? 'is-done' : ''}"><span aria-hidden="true">${c.done ? '✓' : c.icon}</span>${esc(c.label)}</li>`).join('')}</ul>
        ${r.missing.length ? '<span class="rf-pop-hint">Clic : fiche + guide pour compléter</span>' : ''}`;
}

/** File, tours du jour et sprint en cours de l'équipe — partagés par le rendu et le récap. */
function _data(team) {
    const tickets = store.get('tickets') || [];
    const sprint = getSprintForTeam(team);
    const sprintName = sprint?.state === 'active' ? sprint.name : '';
    const teamSprints = store.get('sprintInfo')?.teamSprints || [];
    return { tickets, sprintName, teamSprints, queue: estimationQueue(tickets, team, { sprintName, teamSprints }), rounds: _sessionRounds(_st.rounds) };
}

/** 🧭 Tickets de cadrage du PI courant (SA / PO-PM / contributeur) — sélection : `cadrageModel`. */
function _cadrage(team, tickets) {
    const piInfo = store.get('piInfo');
    // PI du sprint DE L'ÉQUIPE d'abord (le sprint global est celui d'une autre équipe, qui peut
    // avoir changé de PI avant elle) : la cible du cadrage est le PI suivant.
    const piNum = extractPiNum(getSprintForTeam(team)?.name) || getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo });
    const roster = effectiveRosterForPi(piInfo, piNum, store.get('absences') || [], store.get('members') || [])
        .filter(m => teamNameMatches(m.team, team)).map(m => m.name);
    return cadrageModel({
        tickets, team, piNum, roster, groups: store.get('groups') || [],
        aliases: piInfo?.personAliases || null, sameTeam: teamNameMatches,
    });
}

function _html(team) {
    const { tickets, sprintName, teamSprints, queue, rounds } = _data(team);
    const timed = rounds.filter(r => r.minutes != null);
    const avgMin = timed.length ? timed.reduce((s, r) => s + r.minutes, 0) / timed.length : null;
    const splits = rounds.filter(r => r.spread != null && r.spread >= 4).length;
    const inSprint = queue.filter(x => x.group === 'sprint').length;
    const doneSprint = rounds.filter(r => (tickets.find(x => x.id === r.ticketId)?.sprintName || '') === sprintName && sprintName).length;
    const pct = inSprint + doneSprint ? Math.round(doneSprint / (inSprint + doneSprint) * 100) : null;
    const first = queue[0]?.t;

    const toFix = queue.filter(x => _readyOf(x.t).missing.length).length;
    const cadrage = _cadrage(team, tickets);   // calculé une fois : fil d'étapes ET volet
    // 🧭 Cadrage : replié par défaut tant qu'il reste à estimer (son en-tête garde anneau et compteurs) ;
    // file vide → déplié ET remonté au-dessus de la file, c'est alors le travail du moment. Le choix
    // explicite de l'utilisateur (chevron, en-tête, fil d'étapes) prime : `_st.cadOpen` non nul.
    const cadFirst = !queue.length && cadrage.total > 0;
    const cadHtml = cadrageSectionHtml(cadrage, { open: _st.cadOpen ?? cadFirst, hideDone: _st.cadHideDone, expanded: _st.cadExpanded, acceptance: _acceptance });
    const shown = _st.onlyMissing ? queue.filter(x => _readyOf(x.t).missing.length) : queue;
    const groups = _queueSections(shown, queue, sprintName, teamSprints);
    const near = groups.some(g => ['sprint', 'active', 'future'].includes(g.kind));
    const groupsHtml = groups.map(g => {
        const limit = g.key === 'backlog' && !_st.showAllBacklog ? _BACKLOG_PREVIEW : Infinity;
        const open = _groupOpen(g, near);
        const toFixHere = g.items.filter(x => _readyOf(x.t).missing.length).length;
        return `<section class="rf-group rf-group--${g.kind}${open ? '' : ' is-collapsed'}" id="rf-g-${g.key}">
            <h3 class="rf-group-title"><button type="button" class="rf-group-tog" data-rf-gtoggle="${esc(g.name)}" aria-expanded="${open}" title="${open ? 'Replier' : 'Déplier'} ce groupe">
                <svg class="icon icon-xs rf-group-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg>${g.titleHtml} <span class="rf-count">${g.items.length}</span>
                ${open ? '' : `<span class="rf-group-peek">${toFixHere ? `✨ ${toFixHere} à compléter` : '✓ prêts'}</span>`}</button></h3>
            ${open ? `<ol class="rf-list">${g.items.slice(0, limit).map(x => _queueRowHtml(x, queue.indexOf(x), _st.sessions, false)).join('')}</ol>
            ${g.items.length > limit ? `<button type="button" class="rf-more" data-rf-more>Afficher les ${g.items.length - limit} autres</button>` : ''}` : ''}
        </section>`;
    }).join('');
    // Navigation : une puce par groupe, du plus proche au plus loin (masquée s'il n'y a qu'un groupe)
    const navHtml = groups.length > 1 ? `<nav class="rf-qnav" aria-label="Aller à un sprint de la file">${groups.map(g =>
        `<button type="button" class="rf-qnav-chip rf-qnav-chip--${g.kind}${_groupOpen(g, near) ? '' : ' is-folded'}" data-rf-goto="rf-g-${g.key}" data-rf-gname="${esc(g.name)}" title="${esc(g.tip)}${_groupOpen(g, near) ? '' : ' · replié : un clic le déplie'}">${esc(g.chip)}<b>${g.items.length}</b></button>`).join('')}</nav>` : '';

    return `<div class="rf${_st.dense ? ' rf--dense' : ''}">
        ${_st.apiMissing ? `<div class="rf-api-warn" role="alert">
            <b>⚠️ Le serveur ne connaît pas encore la séance d'affinage.</b>
            Il tourne sur une version plus ancienne que la page (lancé avant la mise à jour, sans rechargement auto) :
            les estimations enregistrées n'ont pas été archivées. <b>Redémarrez-le</b> (Ctrl+C puis <code>python main.py</code>).
        </div>` : ''}
        ${refinementStepsHtml({ toFix, toEstimate: queue.length, inSprint, cadrage, rounds: rounds.length, visited: _visitedSteps(team), startId: first?.id })}
        <header class="card rf-hero">
            <h2 class="rf-hero-title">🃏 Séance d'affinage — ${esc(team)}</h2>
            <span class="rf-kline">
                <span class="rf-k"><b>${queue.length}</b> à estimer</span>
                <span class="rf-k rf-k--ok"><b>${rounds.length}</b> estimé${rounds.length > 1 ? 's' : ''} aujourd'hui</span>
                <span class="rf-k" title="Temps moyen par ticket estimé aujourd'hui"><b>${avgMin != null ? `${avgMin < 1 ? '< 1' : Math.round(avgMin)} min` : '—'}</b> / ticket</span>
                <span class="rf-k${splits ? ' rf-k--warn' : ''}" title="Tours où l'écart-type des votes dépasse 4"><b>${splits}</b> désaccord${splits > 1 ? 's' : ''} fort${splits > 1 ? 's' : ''}</span>
                ${pct != null ? `<span class="rf-k rf-k--prog" title="Sprint en cours : ${doneSprint} ${doneSprint > 1 ? 'estimés' : 'estimé'} aujourd'hui, ${inSprint} ${inSprint > 1 ? 'restants' : 'restant'}">
                    Sprint <span class="rf-progress-bar"><i style="width:${pct}%"></i></span><b>${doneSprint}/${inSprint + doneSprint}</b></span>` : ''}
            </span>
            ${first ? `<button type="button" class="btn btn-primary rf-start" data-rf-poker="${esc(first.id)}"
                title="Estimez la file dans l'ordre : chaque « Enregistrer &amp; suivant » du Poker passe au ticket d'après">▶ Démarrer le Poker <span class="rf-start-id">${esc(first.id)}</span></button>` : ''}
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
        ${cadFirst ? cadHtml : ''}
        <div class="rf-cols">
            <div class="card rf-queue">
                <div class="card-header">
                    <span class="card-title">📋 File d'attente</span>
                    ${toFix ? `<span class="rf-fix-actions">
                        <button type="button" class="rf-fix-copy" data-rf-copy-fix title="Copier pour Slack la liste des tickets à compléter, regroupés par rapporteur">📋 Copier pour Slack</button>
                        <button type="button" class="rf-fix-toggle${_st.onlyMissing ? ' is-on' : ''}" data-rf-only-missing aria-pressed="${!!_st.onlyMissing}"
                        title="Tickets à compléter avant la séance : description, critères d'acceptation (story), feature parente ou porteur — même calcul que le badge ✨">⚠️ ${toFix} à compléter${_st.onlyMissing ? ' · voir tout' : ''}</button>
                    </span>`
                        : '<span class="card-subtitle">même équipe · sans points · hors epics / features</span>'}
                </div>
                ${queue.length ? `<div class="rf-qtools">
                    <span class="rf-seg" role="group" aria-label="Tri de la file">
                        <span class="rf-seg-lbl">Tri</span>
                        <button type="button" class="rf-seg-btn${_st.sort === 'rank' ? ' is-on' : ''}" data-rf-sort="rank" aria-pressed="${_st.sort === 'rank'}" title="Ordre de la file : celui du « ⏭ Suivant » du Poker (priorité, puis ancienneté)">🔢 Rang</button>
                        <button type="button" class="rf-seg-btn${_st.sort === 'ready' ? ' is-on' : ''}" data-rf-sort="ready" aria-pressed="${_st.sort === 'ready'}" title="Dans chaque sprint, les tickets les moins prêts d'abord (badge ✨) : à compléter avant la séance">✨ Moins prêts d'abord</button>
                    </span>
                    <span class="rf-seg" role="group" aria-label="Densité de la file">
                        <button type="button" class="rf-seg-btn${!_st.dense ? ' is-on' : ''}" data-rf-dense="0" aria-pressed="${!_st.dense}" title="Lignes aérées">☰ Confort</button>
                        <button type="button" class="rf-seg-btn${_st.dense ? ' is-on' : ''}" data-rf-dense="1" aria-pressed="${!!_st.dense}" title="Lignes serrées : plus de tickets à l'écran">≡ Compact</button>
                    </span>
                </div>` : ''}
                ${navHtml}
                ${groupsHtml || emptyStateHtml({ icon: '🎉', title: 'Rien à estimer', text: `Tous les tickets en cours de ${team} ont des points.`, tone: 'ok' })}
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
                    : '<p class="rf-session-empty"><span aria-hidden="true">🃏</span><span><b>La séance n\'a pas commencé.</b> Les tickets estimés s\'afficheront ici.</span></p>'}
            </div>
        </div>
        ${cadFirst ? '' : cadHtml}
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
    // Hauteur du fil collant → décalage des éléments collés dessous (colonne séance, en-tête du cadrage)
    const steps = container.querySelector('.rf-steps');
    if (steps) container.querySelector('.rf')?.style.setProperty('--rf-sticky', `${steps.offsetHeight}px`);
}

/** Fil « Par où commencer ? » : met la section dans le bon état (filtre, dépliage), puis y amène l'œil. */
const _STEP_TARGET = { fix: '.rf-queue', estimate: '.rf-queue', cadrage: '.rf-cad', recap: '.rf-recap' };

// Étapes ouvertes AUJOURD'HUI, par équipe (localStorage `sb-refinement-steps` = { day, teams: { équipe: [clés] } }) :
// confort de l'écran seulement — une autre journée repart de zéro, un autre poste aussi.
const _STEPS_KEY = 'sb-refinement-steps';
const _today = () => new Date().toLocaleDateString('sv-SE');   // AAAA-MM-JJ, heure locale
function _readSteps() {
    try {
        const v = JSON.parse(localStorage.getItem(_STEPS_KEY) || 'null');
        return v?.day === _today() && v.teams ? v : { day: _today(), teams: {} };
    } catch { return { day: _today(), teams: {} }; }
}
const _visitedSteps = team => new Set(_readSteps().teams[team] || []);
function _markStep(team, key) {
    const v = _readSteps();
    v.teams[team] = [...new Set([...(v.teams[team] || []), key])];
    try { localStorage.setItem(_STEPS_KEY, JSON.stringify(v)); } catch { /* stockage indisponible : non retenu */ }
}

function _goStep(container, key) {
    _markStep(_st.team, key);
    if (key === 'fix') _st.onlyMissing = true;
    if (key === 'estimate') _st.onlyMissing = false;
    if (key === 'cadrage') _st.cadOpen = true;
    if (key === 'recap') _st.recapOpen = true;
    _paint(container);
    const el = container.querySelector(_STEP_TARGET[key]);
    if (!el) return;
    // le seul scrollport #content (cf. page_toc.js) ; décalage = fil collant + respiration
    scrollWithin(container, el, { offset: (container.querySelector('.rf-steps')?.offsetHeight || 0) + 12 });
    el.classList.remove('rf-flash'); void el.offsetWidth; el.classList.add('rf-flash');   // repère visuel bref
}

/**
 * Ligne cliquée → fiche du ticket. Guide « Prêt à estimer ? » lancé d'office si l'on est à l'étape « 📝 Compléter »
 * (filtre « à compléter »), ou par un clic sur le badge ✨ lui-même (pas sur tout clic : il surgirait presque partout).
 */
function _openRow(row, viaBadge = false) {
    if (_st?.onlyMissing || viaBadge) armReadyGuide(row.dataset.rfRow);
    window.__squadBoard?.openTicketModal?.(row.dataset.rfRow);
}

/** Déplie / replie le volet Cadrage ; le choix devient explicite et mémorisé (fin du mode automatique). */
function _toggleCadrage(container) {
    _st.cadOpen = !container.querySelector('.rf-cad')?.classList.contains('is-open');
    try { localStorage.setItem('sb-refinement-cadrage', _st.cadOpen ? '1' : '0'); } catch { /* préférence perdue, sans gravité */ }
    _paint(container);
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
    let cadOpen = null;   // null = automatique (déplié seulement quand la file est vide)
    try { const v = localStorage.getItem('sb-refinement-cadrage'); if (v === '0' || v === '1') cadOpen = v === '1'; } catch { /* stockage indisponible : automatique */ }
    let sort = 'rank', dense = false, groupOpen = {};   // préférences d'affichage de la file (confort d'écran seulement)
    try { sort = localStorage.getItem('sb-refinement-sort') === 'ready' ? 'ready' : 'rank'; dense = localStorage.getItem('sb-refinement-density') === 'compact';
        groupOpen = (JSON.parse(localStorage.getItem('sb-refinement-groups') || '{}') || {})[team] || {}; } catch { /* défauts */ }
    _st = { team, rounds: [], sessions: {}, timer: null, unsubs: [], showAllBacklog: false, recapOpen: false, onlyMissing: false, cadOpen, cadHideDone: false, cadExpanded: new Set(), sort, dense, groupOpen };
    _paint(container);
    await _load();
    _paint(container);

    container.onclick = e => {
        const poker = e.target.closest('[data-rf-poker]');
        if (poker) { _openPoker(poker.dataset.rfPoker); return; }
        const open = e.target.closest('[data-rf-open]');
        if (open) { window.__squadBoard?.openTicketModal?.(open.dataset.rfOpen); return; }
        const sortBtn = e.target.closest('[data-rf-sort]');
        if (sortBtn && _st) { _st.sort = sortBtn.dataset.rfSort; try { localStorage.setItem('sb-refinement-sort', _st.sort); } catch { /* non retenu */ } _paint(container); return; }
        const denseBtn = e.target.closest('[data-rf-dense]');
        if (denseBtn && _st) { _st.dense = denseBtn.dataset.rfDense === '1'; try { localStorage.setItem('sb-refinement-density', _st.dense ? 'compact' : 'confort'); } catch { /* non retenu */ } _paint(container); return; }
        const gt = e.target.closest('[data-rf-gtoggle]');
        if (gt && _st) { _setGroupOpen(gt.dataset.rfGtoggle, gt.getAttribute('aria-expanded') !== 'true'); _paint(container); return; }
        const go = e.target.closest('[data-rf-goto]');
        if (go && _st && go.classList.contains('is-folded')) { _setGroupOpen(go.dataset.rfGname, true); _paint(container); }   // puce d'un groupe replié : on le déplie d'abord
        if (go) {
            const el = container.querySelector(`#${go.dataset.rfGoto}`);
            if (el) scrollWithin(container, el, { offset: (container.querySelector('.rf-steps')?.offsetHeight || 0) + 12 });
            return;
        }
        if (e.target.closest('[data-rf-more]') && _st) { _st.showAllBacklog = true; _paint(container); return; }
        if (e.target.closest('[data-rf-copy-fix]') && _st) {
            const { queue } = _data(_st.team);
            const items = queue.map(x => ({ ...x, status: _acceptance(x.t), missing: _readyOf(x.t).missing })).filter(x => x.missing.length);
            if (items.length) copySlack(toCompleteSlack(_st.team, items), 'Liste à compléter copiée');
            return;
        }
        if (e.target.closest('[data-rf-only-missing]') && _st) { _st.onlyMissing = !_st.onlyMissing; _paint(container); return; }
        if (e.target.closest('[data-rf-recap]') && _st) { _st.recapOpen = !_st.recapOpen; _paint(container); return; }
        if (e.target.closest('[data-rf-cad-toggle]') && _st) { _toggleCadrage(container); return; }
        if (e.target.closest('[data-rf-cad-done]') && _st) { _st.cadHideDone = !_st.cadHideDone; _paint(container); return; }
        const step = e.target.closest('[data-rf-step]');
        if (step && _st) { _goStep(container, step.dataset.rfStep); return; }
        const cadMore = e.target.closest('[data-rf-cad-more]');
        if (cadMore && _st) { _st.cadExpanded.add(cadMore.dataset.rfCadMore); _paint(container); return; }
        const copy = e.target.closest('[data-rf-copy]');
        if (copy && _st) {
            const { queue, rounds } = _data(_st.team);
            const m = refinementRecapModel({ team: _st.team, rounds, queue });
            if (copy.dataset.rfCopy === 'slack') copySlack(recapSlack(m), 'Récap Slack copié');
            else if (copy.dataset.rfCopy === 'rich') copyRecapRich(m);
            else downloadRecapCsv(m);
            return;
        }
        // Clic ailleurs que sur un contrôle : la ligne entière ouvre le ticket, l'en-tête du cadrage le (dé)plie
        if (!_st || e.target.closest('button, a, input, select, summary, label')) return;
        const row = e.target.closest('[data-rf-row]');
        if (row) { _openRow(row, !!e.target.closest('.rf-ready:not(.rf-ready--ok)')); return; }
        if (e.target.closest('.rf-cad-head')) _toggleCadrage(container);
    };
    // Survol / focus du badge ✨ → détail des points de contrôle (un seul calque, recréé au besoin après un repaint)
    const pop = () => container.querySelector('.rf-pop') || container.appendChild(Object.assign(document.createElement('div'), { className: 'rf-pop', role: 'tooltip', hidden: true }));
    const showPop = e => {
        // Badge ✨ → détail des points de contrôle ; titre TRONQUÉ → titre complet + repères
        const tt = e.target.closest?.('.rf-title');
        const b = e.target.closest?.('[data-rf-ready]') || (tt && tt.scrollWidth > tt.clientWidth + 1 ? tt : null);
        const id = b?.dataset.rfReady || b?.closest('[data-rf-row]')?.dataset.rfRow;
        const t = id && (store.get('tickets') || []).find(x => x.id === id);
        const el = pop();
        if (!t) { el.hidden = true; return; }
        el.classList.toggle('rf-pop--title', b === tt);
        el.innerHTML = b === tt ? _titlePopHtml(t) : _readyPopHtml(t);
        el.hidden = false;
        const r = b.getBoundingClientRect(), below = r.bottom + el.offsetHeight + 12 < innerHeight;
        el.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - el.offsetWidth / 2, innerWidth - el.offsetWidth - 8))}px`;
        el.style.top = `${below ? r.bottom + 8 : r.top - el.offsetHeight - 8}px`;
    };
    container.onmouseover = showPop;
    container.onmouseleave = () => { const el = container.querySelector('.rf-pop'); if (el) el.hidden = true; };
    const hidePop = () => { const el = container.querySelector('.rf-pop'); if (el) el.hidden = true; };
    container.addEventListener('scroll', hidePop, { passive: true });
    _st.unsubs.push(() => container.removeEventListener('scroll', hidePop));   // libéré par _cleanup
    // Clavier : Entrée / Espace sur une ligne focalisée = clic
    container.onkeydown = e => {
        if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches?.('[data-rf-row]')) return;
        e.preventDefault();
        _openRow(e.target);
    };
    // Un tour enregistré met à jour les tickets (points) : la file et la séance suivent.
    let pending = null;
    const refresh = () => { clearTimeout(pending); pending = setTimeout(async () => { await _load(); _paint(container); }, 250); };
    _st.unsubs.push(store.on('tickets', refresh));
    _st.timer = setInterval(refresh, 8000);
    _st.unsubs.push(store.on('view', v => { if (v !== 'refinement') { container.onclick = null; container.onkeydown = null; container.onmouseover = null; container.onmouseleave = null; _cleanup(); } }));
}
