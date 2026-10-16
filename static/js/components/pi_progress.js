/**
 * « 📈 Avancement du PI » — tête du flux « 👥 Équipe & risques » du Dashboard.
 *
 *   • périmètre = tickets ENGAGÉS dans le PI affiché (`engagedInPi` + `sprintStartsOf`, cf. CLAUDE.md :
 *     un reporté reste dans le PI, un ticket juste passé par la préparation n'y est pas) ;
 *   • trois états, en TICKETS : à faire (gris) · en cours (bleu, bloqués compris et signalés) · terminé (vert) ;
 *     points en infobulle ; repère « aujourd'hui » = part du PI écoulée en jours OUVRÉS (PI courant seulement) ;
 *   • une ligne par équipe quand le périmètre en compte plusieurs ;
 *   • « 📋 Copier les tickets à risque » : bloqués, sans mouvement depuis ≥ N j, autres en cours (âge en
 *     jours ouvrés) — texte Slack pour expliquer où en est l'équipe et ce qui traîne ;
 *   • CLIQUABLE : un segment, une légende ou la barre d'une équipe déplie la liste de ces tickets sous la
 *     barre (re-cliquer = replier) ; chaque ligne ouvre la modale du ticket.
 */
import { esc, pct, sumBy, engagedInPi, getStatusLabel, wipAgeDays, workdaysBetween, copyToClipboard, todayIsoLocal } from '../utils.js';
import { TYPE_ICONS } from '../config.js';

const _fmtDay = iso => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const WIP = new Set(['inprog', 'review', 'test', 'blocked']);
const _bucket = t => (t.status === 'done' ? 'done' : WIP.has(t.status) ? 'wip' : 'todo');

function _split(list) {
    const by = { todo: [], wip: [], done: [] };
    for (const t of list) by[_bucket(t)].push(t);
    return {
        total: list.length, by,
        blocked: by.wip.filter(t => t.status === 'blocked').length,
        pts: { all: sumBy(list, t => t.points), done: sumBy(by.done, t => t.points) },
    };
}

/** Part du PI écoulée (jours ouvrés), null hors PI courant ou sans bornes. */
function _elapsedPct(bounds) {
    if (!bounds?.startIso || !bounds?.endIso) return null;
    const today = todayIsoLocal();
    if (today < bounds.startIso) return 0;
    if (today > bounds.endIso) return 100;
    const all = workdaysBetween(bounds.startIso, bounds.endIso);
    const gone = workdaysBetween(bounds.startIso, today);
    return all > 0 ? Math.max(0, Math.min(100, Math.round(gone / all * 100))) : null;
}

function _barHtml(sp, elapsed, { big = false, team = '' } = {}) {
    const seg = (k, cls, lbl) => {
        const n = sp.by[k].length;
        if (!n) return '';
        const w = sp.total ? n / sp.total * 100 : 0;
        return `<button type="button" class="pip-seg pip-seg--${cls}" style="width:${w}%" data-pip-bucket="${k}" data-pip-team="${esc(team)}" title="${esc(lbl)} : ${n} ticket${n > 1 ? 's' : ''} (${Math.round(w)} %) — cliquer pour la liste">${big && w >= 9 ? n : ''}</button>`;
    };
    return `<div class="pip-bar${big ? ' pip-bar--big' : ''}" role="group" aria-label="${sp.by.done.length} terminés, ${sp.by.wip.length} en cours, ${sp.by.todo.length} à faire sur ${sp.total}">
        ${seg('done', 'done', 'Terminés')}${seg('wip', 'wip', `En cours${sp.blocked ? ` (dont ${sp.blocked} bloqué${sp.blocked > 1 ? 's' : ''})` : ''}`)}${seg('todo', 'todo', 'À faire')}
        ${elapsed != null ? `<span class="pip-now" style="left:${elapsed}%" title="Aujourd'hui : ${elapsed} % du PI écoulé (jours ouvrés)"></span>` : ''}
    </div>`;
}

/**
 * @param {object} o
 * @param {object[]} o.tickets   tickets du périmètre équipe / groupe (NON réduits au PI)
 * @param {number}   o.piNum     PI affiché
 * @param {Map}      o.starts    `sprintStartsOf(sprintInfo)`
 * @param {object}   [o.bounds]  `piBounds(...)` — repère « aujourd'hui » si fourni
 * @param {{name, color}[]} [o.teams]  une ligne par équipe si ≥ 2
 */
export function piProgressModel({ tickets, piNum, starts, bounds = null, teams = [] }) {
    if (!piNum) return null;
    const scope = (tickets || []).filter(t => engagedInPi(t, piNum, starts));
    const sp = _split(scope);
    return {
        piNum, scope, sp,
        elapsed: _elapsedPct(bounds),
        teams: teams.length > 1
            ? teams.map(tm => ({ ...tm, sp: _split(scope.filter(t => t.team === tm.name)) })).filter(x => x.sp.total)
            : [],
    };
}

export function piProgressHtml(m) {
    if (!m) return '';
    const { sp } = m;
    if (!sp.total) {
        return `<div class="card pip-card"><div class="pip-head"><span class="card-title">📈 Avancement du PI ${m.piNum}</span></div>
            <p class="text-muted text-sm">Aucun ticket engagé dans le PI ${m.piNum} pour ce périmètre.</p></div>`;
    }
    const donePct = pct(sp.by.done.length, sp.total);
    const ptsPct = pct(sp.pts.done, sp.pts.all);
    const late = m.elapsed != null && m.elapsed >= 15 && donePct + 10 < m.elapsed;
    const riskN = sp.by.wip.length;
    return `
    <div class="card pip-card">
        <div class="pip-head">
            <div>
                <span class="card-title">📈 Avancement du PI ${m.piNum}</span>
                <span class="card-subtitle">${sp.total} ticket${sp.total > 1 ? 's' : ''} engagé${sp.total > 1 ? 's' : ''} · ${sp.pts.done}/${sp.pts.all} pts livrés (${ptsPct} %)</span>
            </div>
            <button type="button" class="btn btn-ghost btn-xs pip-copy" data-pip-copy ${riskN ? '' : 'disabled'} title="Copier pour Slack : bloqués, sans mouvement, en cours (avec leur âge)">📋 Copier les tickets à risque${riskN ? ` <span class="pip-copy-n">${riskN}</span>` : ''}</button>
        </div>
        <div class="pip-main">
            <span class="pip-pct${late ? ' is-late' : ''}" title="${late ? 'En retard sur le temps écoulé' : 'Part des tickets terminés'}">${donePct}<small>%</small></span>
            <div class="pip-main-bar">
                ${_barHtml(sp, m.elapsed, { big: true })}
                <div class="pip-legend">
                    <button type="button" class="pip-lg pip-lg--done" data-pip-bucket="done"><i></i>Terminés <b>${sp.by.done.length}</b></button>
                    <button type="button" class="pip-lg pip-lg--wip" data-pip-bucket="wip"><i></i>En cours <b>${sp.by.wip.length}</b></button>
                    ${sp.blocked ? `<button type="button" class="pip-lg pip-lg--blocked" data-pip-bucket="blocked">🚫 dont <b>${sp.blocked}</b> bloqué${sp.blocked > 1 ? 's' : ''}</button>` : ''}
                    <button type="button" class="pip-lg pip-lg--todo" data-pip-bucket="todo"><i></i>À faire <b>${sp.by.todo.length}</b></button>
                    ${m.elapsed != null ? `<span class="pip-lg pip-lg--now"><i></i>${m.elapsed} % du PI écoulé</span>` : ''}
                </div>
            </div>
        </div>
        ${m.teams.length ? `<div class="pip-teams">
            ${m.teams.map(tm => `<div class="pip-team">
                <span class="pip-team-name" title="${esc(tm.name)}"><span class="team-dot" style="background:${esc(tm.color)}"></span>${esc(tm.name)}</span>
                ${_barHtml(tm.sp, m.elapsed, { team: tm.name })}
                <span class="pip-team-val" title="${tm.sp.by.done.length} terminés sur ${tm.sp.total}">${pct(tm.sp.by.done.length, tm.sp.total)} %</span>
            </div>`).join('')}
        </div>` : ''}
        <div class="pip-list" data-pip-list hidden></div>
    </div>`;
}

const _BUCKETS = {
    done: { icon: '✅', label: 'Terminés' }, wip: { icon: '🔄', label: 'En cours' },
    blocked: { icon: '🚫', label: 'Bloqués' }, todo: { icon: '⏳', label: 'À faire' },
};
const _MAX_ROWS = 30;

/** Tickets d'un état (et d'une équipe), triés : en cours = plus anciens d'abord, terminés = plus récents. */
function _ticketsOf(m, bucket, team) {
    const list = (bucket === 'blocked' ? m.sp.by.wip.filter(t => t.status === 'blocked') : m.sp.by[bucket] || [])
        .filter(t => !team || t.team === team);
    const age = t => (t.startedDate ? wipAgeDays(t.startedDate) : -1);
    if (bucket === 'done') return [...list].sort((a, b) => String(b.resolvedDate || '').localeCompare(String(a.resolvedDate || '')));
    if (bucket === 'todo') return [...list].sort((a, b) => (b.points || 0) - (a.points || 0));
    return [...list].sort((a, b) => age(b) - age(a));
}

function _listHtml(m, bucket, team) {
    const list = _ticketsOf(m, bucket, team);
    const b = _BUCKETS[bucket];
    const rows = list.slice(0, _MAX_ROWS).map(t => {
        const meta = bucket === 'done'
            ? (t.resolvedDate ? `✓ ${_fmtDay(t.resolvedDate)}` : '✓')
            : bucket === 'todo' ? (t.points > 0 ? `${t.points} pts` : '— pts')
            : (t.startedDate ? `${wipAgeDays(t.startedDate)} j` : '—');
        const tip = bucket === 'done' ? 'Date de livraison' : bucket === 'todo' ? 'Estimation' : 'En cours depuis (jours ouvrés)';
        return `<button type="button" class="stuck-row pip-row" data-ticket="${esc(t.id)}" title="Ouvrir ${esc(t.id)}">
            <span class="stuck-dot" style="background:var(--status-${esc(t.status)}, var(--text-muted))"></span>
            <span class="stuck-id">${esc(t.id)}</span>
            <span class="stuck-title">${TYPE_ICONS[t.type] ? `${TYPE_ICONS[t.type]} ` : ''}${esc(t.title || '')}</span>
            <span class="stuck-state stuck-state--${esc(t.status)}">${esc(getStatusLabel(t))}</span>
            <span class="stuck-lead${t.leader || t.assignee ? '' : ' stuck-lead--none'}">${esc(t.leader || t.assignee || 'Non assigné')}</span>
            <span class="stuck-age" title="${tip}">${esc(meta)}</span>
        </button>`;
    }).join('');
    return `<div class="pip-list-head">
            <b>${b.icon} ${b.label}${team ? ` · ${esc(team)}` : ''}</b><span class="text-muted">${list.length} ticket${list.length > 1 ? 's' : ''}</span>
            <button type="button" class="btn-icon pip-list-close" data-pip-close aria-label="Replier la liste" title="Replier">×</button>
        </div>
        <div class="stuck-list pip-list-rows">${rows || '<p class="text-muted text-sm">Aucun ticket.</p>'}</div>
        ${list.length > _MAX_ROWS ? `<p class="pip-list-more text-muted text-xs">+${list.length - _MAX_ROWS} autres — voir le Board pour la liste complète</p>` : ''}`;
}

/**
 * Texte Slack des tickets à risque.
 * @param {object} m          modèle `piProgressModel`
 * @param {object} o
 * @param {string} o.label    périmètre (« Fuego », « Toutes les équipes »)
 * @param {number} o.staleDays  seuil « sans mouvement » (celui de la card Bloqués / stagnants)
 * @param {(t) => number|null} o.stagDays  jours depuis le dernier mouvement de statut
 * @param {(t) => string|null} [o.lastMove]  date ISO de ce dernier mouvement
 */
export function riskTicketsText(m, { label, staleDays, stagDays, lastMove }) {
    const { sp } = m;
    const age = t => (t.startedDate ? wipAgeDays(t.startedDate) : null);
    const line = t => {
        const a = age(t), s = stagDays(t);
        const bits = [getStatusLabel(t), t.leader || t.assignee || 'non assigné',
            a != null ? `en cours depuis ${a} j ouvré${a > 1 ? 's' : ''}` : null,
            // Date plutôt qu'un 2ᵉ nombre de jours : la stagnation se compte en jours CALENDAIRES (seuil
            // de la card Bloqués / stagnants), l'âge en jours OUVRÉS — deux unités côte à côte se contredisaient.
            s != null && s >= staleDays && lastMove?.(t) ? `dernier mouvement le ${_fmtDay(lastMove(t))}` : null,
            t.points > 0 ? `${t.points} pts` : null].filter(Boolean);
        return `• ${t.id} — ${t.title || '(sans titre)'} · ${bits.join(' · ')}`;
    };
    const byAge = (a, b) => (age(b) ?? -1) - (age(a) ?? -1);
    const blocked = sp.by.wip.filter(t => t.status === 'blocked').sort(byAge);
    const stale = sp.by.wip.filter(t => t.status !== 'blocked' && (stagDays(t) ?? -1) >= staleDays).sort(byAge);
    const seen = new Set([...blocked, ...stale].map(t => t.id));
    const others = sp.by.wip.filter(t => !seen.has(t.id)).sort(byAge);
    const block = (title, list) => (list.length ? [``, `${title} (${list.length})`, ...list.map(line)] : []);
    const d = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return [
        `⚠️ *Tickets à risque — ${label} · PI ${m.piNum}* (${d})`,
        `Avancement : ${pct(sp.by.done.length, sp.total)} % des tickets terminés (${sp.by.done.length}/${sp.total}) · ${sp.by.wip.length} en cours · ${sp.by.todo.length} à faire`
            + (m.elapsed != null ? ` · ${m.elapsed} % du PI écoulé` : ''),
        ...block('🚫 Bloqués', blocked),
        ...block(`🐢 Sans mouvement depuis ≥ ${staleDays} j`, stale),
        ...block('🔄 Autres en cours', others),
    ].join('\n');
}

export function bindPiProgress(container, m, opts) {
    const card = container.querySelector('.pip-card');
    if (!card || !m) return;
    const panel = card.querySelector('[data-pip-list]');
    let open = null;   // « bucket|équipe » affiché
    const show = (bucket, team) => {
        const key = `${bucket}|${team}`;
        card.querySelectorAll('[data-pip-bucket]').forEach(el => el.classList.toggle('is-active',
            key !== open && el.dataset.pipBucket === bucket && (el.dataset.pipTeam || '') === team));
        if (key === open || !panel) { open = null; if (panel) panel.hidden = true; return; }
        open = key;
        panel.innerHTML = _listHtml(m, bucket, team);
        panel.hidden = false;
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    card.addEventListener('click', e => {
        if (e.target.closest('[data-pip-copy]')) {
            if (m.sp.by.wip.length) copyToClipboard(riskTicketsText(m, opts), 'Tickets à risque copiés');
            return;
        }
        if (e.target.closest('[data-pip-close]')) { open = null; panel.hidden = true; card.querySelectorAll('.is-active[data-pip-bucket]').forEach(el => el.classList.remove('is-active')); return; }
        const row = e.target.closest('.pip-row[data-ticket]');
        if (row) { window.__squadBoard?.openTicketModal?.(row.dataset.ticket); return; }
        const seg = e.target.closest('[data-pip-bucket]');
        if (seg) show(seg.dataset.pipBucket, seg.dataset.pipTeam || '');
    });
}
