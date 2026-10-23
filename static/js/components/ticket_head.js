/**
 * En-tête de la popin ticket : fil d'Ariane, tuiles de propriétés (statut, points, sprint, flux), présence des personnes (congés).
 *
 * Extrait de modal.js (3.253.0, > 2 900 lignes) — code déplacé à l'identique. Les dépendances vers
 * modal.js sont CIRCULAIRES mais sans effet au chargement (appelées dans des fonctions seulement) :
 * ne jamais utiliser un import de ./modal.js au niveau racine du module.
 */
import { store } from '../state.js';
import { esc, fmtDate, fmtDateLong, fmtRelative, hashColor, typeBadge, statusBadge, priorityBadge, priorityKey, cycleDays, leadDays, wipAgeDays, workdaysBetween, workdaysLeft, pointsTone, teamPointsMedian, labelChipHtml, findPerson, todayIsoLocal, getSprintForTeam } from '../utils.js';
import { presenceStripHtml, sprintWorkDays, nextAbsence } from './meteo_fiche.js';
import { _sprintsHistoryOfTicket } from './modal.js';

// ══════════════════════════════════════════════════════════════════════════════
// En-tête du ticket : fil d'Ariane (équipe › parent › ticket) + tuiles de propriétés
// ══════════════════════════════════════════════════════════════════════════════

/** Date du dernier changement d'un champ du changelog (`to` non vide si `needTo`), ou null. */
function _lastChangeDate(ticket, field, needTo = false) {
    const f = field.toLowerCase();
    const hit = (ticket.recentChanges || [])
        .filter(c => String(c.field || '').toLowerCase() === f && (!needTo || String(c.to || '').trim()))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    return hit?.date || null;
}

/** « aujourd'hui » / « 1 j » / « 4 j » — jours OUVRÉS écoulés depuis `d` (cf. utils/workdays.js). */
function _sinceTxt(d) {
    const n = workdaysBetween(d, new Date());
    if (n == null) return '';
    return n < 1 ? "aujourd'hui" : `${n} j`;
}

/**
 * Sprint DU TICKET (pas le sprint global de `sprintInfo`, qui est celui d'une autre équipe) :
 * appariement exact sur `sprintName` parmi les sprints connus de toutes les équipes.
 */
function _ticketSprint(ticket) {
    const name = (ticket.sprintName || '').trim();
    if (!name) return null;
    return (store.get('sprintInfo')?.teamSprints || []).find(s => s.name === name) || { name };
}

/** Tuile Sprint : nom, échéance en jours ouvrés, mini-frise avec début / fin du travail. */
function _sprintTileHtml(ticket) {
    const sp = _ticketSprint(ticket);
    const pi = ticket.piSprint ? esc(ticket.piSprint) : '';
    if (!sp) {
        return `<div class="mdl-prop mdl-prop--link mdl-prop--sprint" id="sprint-field" data-field="sprint" data-value="" title="Planifier dans un sprint">
            <span class="mdl-prop-label">Sprint</span>
            <span class="mdl-prop-value text-muted">Hors sprint</span>
            <span class="mdl-prop-sub">${pi || 'Backlog'}</span>
        </div>`;
    }
    const s0 = new Date(sp.startDate).getTime(), s1 = new Date(sp.endDate).getTime();
    const dated = Number.isFinite(s0) && Number.isFinite(s1) && s1 > s0;
    const now = Date.now();
    const pctOf = d => Math.max(0, Math.min(100, ((new Date(d).getTime() - s0) / (s1 - s0)) * 100));
    let when = '', tone = '';
    if (dated) {
        if (sp.state === 'closed' || now > s1) { when = 'Clos'; tone = 'is-closed'; }
        else if (now < s0) { when = `Démarre le ${fmtDate(sp.startDate)}`; tone = 'is-future'; }
        else {
            const left = workdaysLeft(sp.endDate);
            when = left > 0 ? `J-${left}` : 'Dernier jour';
            tone = left <= 2 ? 'is-urgent' : 'is-active';
        }
    }
    const bar = dated ? `<span class="mdl-prop-track ${tone}" title="${esc(fmtDate(sp.startDate))} → ${esc(fmtDate(sp.endDate))}">
            <span class="mdl-prop-track-fill" style="width:${pctOf(now)}%"></span>
            ${ticket.startedDate ? `<span class="mdl-prop-track-mark is-start" style="left:${pctOf(ticket.startedDate)}%" title="Début du travail · ${esc(fmtDate(ticket.startedDate))}"></span>` : ''}
            ${ticket.resolvedDate ? `<span class="mdl-prop-track-mark is-done" style="left:${pctOf(ticket.resolvedDate)}%" title="Résolu · ${esc(fmtDate(ticket.resolvedDate))}"></span>` : ''}
        </span>` : '';
    return `<div class="mdl-prop mdl-prop--link mdl-prop--sprint" id="sprint-field" data-field="sprint" data-value="${esc(sp.name)}" title="${esc(sp.name)} — cliquer pour changer de sprint">
        <span class="mdl-prop-label">Sprint</span>
        <span class="mdl-prop-value mdl-prop-ellipsis">${esc(sp.name)}</span>
        <span class="mdl-prop-sub">${[when && `<span class="mdl-prop-when ${tone}"${when.startsWith('J-') ? ' title="Jours ouvrés restants, aujourd\'hui compris"' : ''}>${esc(when)}</span>`, pi].filter(Boolean).join(' · ')}</span>
        ${bar}
    </div>`;
}

/** Jours ouvrés de la semaine courante (repli quand l'équipe n'a pas de sprint daté). */
function _currentWeek() {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // lundi
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { label: 'cette semaine', days: Array.from({ length: 5 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return iso(x); }) };
}

/**
 * Congés d'une personne sur l'itération EN COURS de l'équipe du ticket : bande « fill » du roster
 * du Dashboard (`presenceStripHtml`, une case par jour ouvré) + prochaine absence. Le nom JIRA
 * (« Prénom Nom ») est rapproché du nom RH (« NOM, Prénom ») par `findPerson`.
 * @returns {{ html: string, absentNow: boolean }}
 */
export function _presenceOf(name, ticket) {
    if (!name) return { html: '', absentNow: false };
    const absences = store.get('absences') || [];
    const absName = findPerson(name, absences.map(a => a.memberName), store.get('piInfo')?.personAliases);
    if (!absName) {
        return { html: `<span class="mdl-presence is-unknown" title="${esc(name)} n'est pas rapproché de l'import Congés — à associer dans Paramètres → Absences → Correspondances">congés : non trouvés</span>`, absentNow: false };
    }
    const today = todayIsoLocal();
    const it = sprintWorkDays(getSprintForTeam(ticket.team)) || _currentWeek();
    const next = nextAbsence(absName, absences, today);
    const txt = next
        ? (next.now ? `🌴 absent · ${next.label}` : `prochain congé : ${next.label}`)
        : 'aucun congé prévu';
    return {
        absentNow: !!next?.now,
        html: `<span class="mdl-presence${next?.now ? ' is-now' : ''}" title="Présence de ${esc(absName)} — itération ${esc(it.label)} (import Congés)">${presenceStripHtml(absName, it, absences, today)}<span class="mdl-presence-txt">${esc(txt)}</span></span>`,
    };
}

/** Panneau « voyage du ticket » ouvert ? Mémorisé le temps de la session : la modale se re-rend
 *  après chaque édition, et passer d'un ticket à l'autre pour comparer doit garder le panneau. */
export let _flowPref = { normal: false, full: true };   // pleine page : le voyage est ouvert d'office
export const _isFull = () => !!document.getElementById('modal')?.classList.contains('modal--fullscreen');
const _flowOpenNow = () => _flowPref[_isFull() ? 'full' : 'normal'];

/** Tuile Flux : la mesure qui compte selon l'avancement (livré / en cours / pas démarré). */
function _flowTileHtml(ticket) {
    const ct = cycleDays(ticket), lt = leadDays(ticket);
    let value, sub, tip;
    if (ticket.status === 'done') {
        value = ct ? `Cycle ${ct} j` : 'Livré';
        sub = lt ? `Lead ${lt} j` : (ticket.resolvedDate ? `le ${esc(fmtDate(ticket.resolvedDate))}` : '');
        tip = 'Cycle = mise en cours → livraison · Lead = création → livraison (jours ouvrés)';
    } else if (ticket.startedDate) {
        value = `${wipAgeDays(ticket.startedDate)} j en cours`;
        sub = `depuis le ${esc(fmtDate(ticket.startedDate))}`;
        tip = 'Âge du travail en cours, en jours ouvrés';
    } else {
        value = 'Pas démarré';
        const wait = workdaysBetween(ticket.createdAt, new Date());
        sub = wait != null ? `en attente ${wait < 1 ? "depuis aujourd'hui" : `depuis ${wait} j`}` : '';
        tip = 'Jours ouvrés écoulés depuis la création';
    }
    const open = _flowOpenNow();
    return `<div class="mdl-prop mdl-prop--more${open ? ' is-open' : ''}" id="mdl-flow-tile" role="button" tabindex="0" aria-expanded="${open}" aria-controls="mdl-flow-panel" title="${esc(tip)} — cliquer pour le détail du parcours">
        <span class="mdl-prop-label">Flux <span class="mdl-prop-more" aria-hidden="true">🧭 détail</span></span>
        <span class="mdl-prop-value">${value}</span>
        <span class="mdl-prop-sub">${sub}</span>
    </div>`;
}

/** En-tête complet du corps de la modale (remplace les anciennes lignes Epic + Meta + barre de sprint). */
export function _ticketHeadHtml(ticket, all) {
    const team = ticket.team || '';
    const teamCol = team ? ((store.get('teamObjects') || []).find(o => o.name === team)?.color || hashColor(team)) : '';
    const parent = ticket.epic ? all.find(t => t.id === ticket.epic) : null;
    const pKey = priorityKey(ticket.priority);

    // Statut : depuis quand (dernier changement de statut, sinon début du travail).
    const statusSince = _lastChangeDate(ticket, 'status') || (ticket.status !== 'todo' ? ticket.startedDate : null) || ticket.createdAt;
    const statusSub = ticket.status === 'done' && ticket.resolvedDate
        ? `le ${esc(fmtDate(ticket.resolvedDate))}`
        : (statusSince ? `depuis ${esc(_sinceTxt(statusSince))}` : '');

    const blockedSince = ticket.flagged ? _lastChangeDate(ticket, 'flagged', true) : null;
    // Sprint COURANT = tuile Sprint (affichage + édition) ; les AUTRES vont dans la bande du bas.
    const otherSprints = _sprintsHistoryOfTicket(ticket).filter(sp => !sp.isCurrent);

    // Points : palier ABSOLU (couleur) + repère RELATIF à l'équipe (texte).
    const pts = pointsTone(ticket.points);
    const median = team ? teamPointsMedian((store.get('tickets') || []).filter(x => x.team === team)) : null;
    // Ratio à la médiane de l'équipe : « ≈ méd. » entre 0,8× et 1,25×, sinon « ×1,6 » (tuile étroite).
    const ratio = median && ticket.points ? ticket.points / median : null;
    const medTxt = ratio == null ? '' : (ratio >= 0.8 && ratio <= 1.25 ? '≈ méd.' : `×${String(Math.round(ratio * 10) / 10).replace('.', ',')} méd.`);
    const ptsSub = ticket.points
        ? [pts.hint ? `<span class="pts-hint pts-tone--${pts.key}">${esc(pts.hint)}</span>` : esc(pts.label), esc(medTxt)].filter(Boolean).join(' · ')
        : 'non estimé';
    const ptsTip = ticket.points
        ? `${pts.label} (${ticket.points} pts)${median ? ` — médiane des tickets estimés de ${team} : ${median} pts` : ''} · cliquer pour changer`
        : 'Non estimé — cliquer pour estimer, ou lancer un Poker';

    return `<section class="mdl-head" aria-label="Propriétés du ticket">
        ${ticket.flagged ? `<div class="mdl-head-alert" role="status">
            <span class="mdl-head-alert-ico" aria-hidden="true">🚫</span>
            <span class="mdl-head-alert-txt"><strong>Bloqué</strong>${blockedSince ? ` depuis ${esc(_sinceTxt(blockedSince))} <span class="text-muted">· ${esc(fmtDate(blockedSince))}</span>` : ''}</span>
        </div>` : ''}

        <!-- Fil d'Ariane : équipe › parent › ticket -->
        <div class="mdl-crumbs">
            <span class="mdl-crumb mdl-crumb--team editable-field" data-field="team" data-value="${esc(team)}" title="Équipe — cliquer pour changer">
                ${team ? `<span class="mdl-crumb-dot" style="background:${esc(teamCol)}"></span>${esc(team)}` : '<span class="text-muted">Sans équipe</span>'}
            </span>
            <span class="mdl-crumb-sep" aria-hidden="true">›</span>
            <span class="mdl-crumb mdl-crumb--parent">
                <span class="mdl-crumb-parent editable-field" data-field="epic" data-value="${esc(ticket.epic || '')}" title="Parent — cliquer pour changer">
                    ${ticket.epic
                        ? `${typeBadge(parent?.type || 'feature', { size: '2xs', label: parent ? null : 'Parent' })}<span class="mdl-link-id" data-ticket-id="${esc(ticket.epic)}">${esc(ticket.epic)}</span>${parent?.title ? `<span class="mdl-crumb-title">${esc(parent.title)}</span>` : ''}`
                        : '<span class="mdl-crumb-empty">+ Rattacher à une feature</span>'}
                </span>
                ${ticket.epic ? `<button class="btn-open-linked" data-ticket-id="${esc(ticket.epic)}" title="Ouvrir ${esc(ticket.epic)}"><svg class="icon icon-xs"><use href="#i-external"/></svg></button>` : ''}
            </span>
            <span class="mdl-crumb-sep" aria-hidden="true">›</span>
            <span class="mdl-crumb mdl-crumb--self">${esc(ticket.id)}</span>
            <span class="mdl-crumbs-spacer"></span>
            <label class="toggle-switch toggle-switch--danger mdl-block-toggle${ticket.flagged ? ' is-on' : ''}" title="${ticket.flagged ? 'Lever le blocage' : 'Signaler un blocage'}">
                <input type="checkbox" role="switch" class="editable-field" data-field="flagged" data-value="${ticket.flagged ? 'true' : 'false'}" ${ticket.flagged ? 'checked' : ''} aria-label="Ticket bloqué">
                <span class="toggle-track"></span>
                <span class="mdl-block-toggle-txt">${ticket.flagged ? '🚫 Bloqué' : 'Bloqué'}</span>
            </label>
            <span class="mdl-crumbs-dates" title="Créé le ${esc(fmtDateLong(ticket.createdAt))} · mis à jour le ${esc(fmtDateLong(ticket.updatedAt))}">
                Créé le ${esc(fmtDate(ticket.createdAt))} · maj ${esc(fmtRelative(ticket.updatedAt))}
            </span>
        </div>

        <!-- Propriétés clés : ce qu'on regarde d'abord -->
        <div class="mdl-props">
            <div class="mdl-prop mdl-prop--link mdl-prop--status" data-proxy="mdl-status-badge-link">
                <span class="mdl-prop-label">Statut</span>
                <span class="mdl-prop-value">${statusBadge(ticket, { extra: 'mdl-type-badge', attrs: 'id="mdl-status-badge-link" title="Cliquer pour modifier le statut"', title: false })}</span>
                <span class="mdl-prop-sub">${statusSub}</span>
            </div>
            <div class="mdl-prop mdl-prop--edit editable-field" data-field="priority" data-value="${pKey}" title="Priorité — cliquer pour changer">
                <span class="mdl-prop-label">Priorité</span>
                <span class="mdl-prop-value">${priorityBadge(ticket.priority)}</span>
            </div>
            <div class="mdl-prop mdl-prop--link mdl-prop--points" data-proxy="mdl-points" title="${esc(ptsTip)}">
                <span class="mdl-prop-label">Estimation</span>
                <span class="mdl-prop-value">
                    <span class="mdl-points pts-tone--${pts.key} editable-field" id="mdl-points" data-field="points" data-value="${ticket.points || 0}">${ticket.points ? `${ticket.points}<small>pts</small>` : '—<small>pts</small>'}</span>
                    <button class="mdl-poker-btn" id="mdl-poker-btn" data-ticket-id="${esc(ticket.id)}" title="Planning Poker — voter collectivement sur les Story Points">🃏 Poker</button>
                </span>
                <span class="mdl-prop-sub">${ptsSub}</span>
            </div>
            ${_sprintTileHtml(ticket)}
            ${_flowTileHtml(ticket)}
        </div>

        <!-- Classement : labels (éditables) + sprints déjà traversés (historique JIRA) -->
        <div class="mdl-head-tags">
            <span class="mdl-prop-label">Labels</span>
            <span class="mdl-head-tags-list" id="labels-inline-wrap">
                ${(ticket.labels || []).map(l => labelChipHtml(l, { removable: true })).join('')}
                <input type="text" class="mdl-inline-input" id="label-add-input" placeholder="+ label (Entrée)">
            </span>
            ${otherSprints.length ? `<span class="mdl-head-hist" title="Sprints par lesquels le ticket est passé ou a été planifié (historique JIRA)">
                <span class="mdl-prop-label">Passé par</span>
                ${otherSprints.map(sp => `<span class="chip chip-sprint chip-sprint--past">○ ${esc(sp.name)}</span>`).join('')}
            </span>` : ''}
        </div>
        <div class="mdl-flow-panel" id="mdl-flow-panel"${_flowOpenNow() ? '' : ' hidden'}></div>
    </section>`;
}
