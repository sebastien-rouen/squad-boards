/**
 * Dashboard — rangée « Sprints du PI » (clos / actif / futurs) sous la frise du sprint.
 */

import { isBufferItem, engagedInSprint, sprintStartsOf, isInSprint, progressColor, esc, carriedOverTo, sumBy, extractSprintLabel } from '../utils.js';
import { store } from '../state.js';

// ── Strip "Sprints du PI courant" ───────────────────────────────────────────
// Affiche une rangée de mini-pills sous le sprint-progress avec tous les sprints
// du PI courant (closed/active/future).
//
// @param sprintInfoAll   Objet store.sprintInfo GLOBAL avec teamSprints[]
// @param currentSprint   Sprint actif de l'équipe sélectionnée (résultat de
//                        getSprintForTeam) — utilisé pour déduire le PI courant
// @param team            Équipe sélectionnée ('all' ou nom)
// @param allTickets      Pour le compteur points par sprint
export function piSprintsStripHtml(sprintInfoAll, currentSprint, team, allTickets, displayPiNum = 0) {
    const ts = Array.isArray(sprintInfoAll?.teamSprints) ? sprintInfoAll.teamSprints : [];
    if (!ts.length) return '';
    // Extraction du PI courant (regex `(\d+)\.\d+` ou `PI\s*#?\s*(\d+)` sur le nom)
    const _extractPi = (name) => {
        if (!name) return 0;
        const m = String(name).match(/(\d+)\.\d+/) || String(name).match(/PI\s*#?\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    // PI à afficher : displayPiNum (du sélecteur) en priorité, sinon dérivé du sprint actif.
    const referenceName = currentSprint?.name || sprintInfoAll?.name
        || (ts.find(s => s.state === 'active')?.name) || '';
    const curPi = displayPiNum || _extractPi(referenceName);
    if (!curPi) return '';

    // Filtre les sprints du PI courant (selon le nom)
    let piSprints = ts.filter(s => _extractPi(s.name) === curPi);
    if (team && team !== 'all') {
        piSprints = piSprints.filter(s => s.team === team);
    } else {
        // Dédup par nom (plusieurs équipes peuvent avoir le même nom de sprint)
        const seen = new Map();
        for (const s of piSprints) {
            const k = (s.name || '').toLowerCase();
            if (!seen.has(k) || (s.state === 'active' && seen.get(k).state !== 'active')) {
                seen.set(k, s);
            }
        }
        piSprints = [...seen.values()];
    }
    if (!piSprints.length) return '';
    // Tri chronologique
    piSprints.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

    const _fmtShort = iso => {
        if (!iso) return '';
        // iso peut être 'YYYY-MM-DD' OU un ISO complet JIRA ('...T08:00:00+02:00',
        // ex. completeDate des sprints clos) → on ne garde que la partie date.
        const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
        if (isNaN(d)) return '';
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
    };
    const today = new Date().toISOString().slice(0, 10);
    const _stateIcon = st => st === 'closed' ? '✓' : st === 'active' ? '▶' : '○';

    const _stateLabel = st => st === 'closed' ? 'Terminé' : st === 'active' ? 'En cours' : 'À venir';

    // Groupes affichés dans le détail de chaque carte sprint — ordre : US, Buffer, Action
    // (Action = tout ticket qui n'est ni une US ni un item taggé "buffer", ex. task/bug/ops/debt).
    const _GROUPS = [
        { key: 'us',     label: 'US',     icon: '📗', test: t => !isBufferItem(t) && t.type === 'story' },
        { key: 'buffer', label: 'Buffer', icon: '🧯', test: t => isBufferItem(t) },
        { key: 'action', label: 'Action', icon: '🛠️', test: t => !isBufferItem(t) && t.type !== 'story' },
    ];
    const _byRank = (a, b) => (a.rank ?? 9999) - (b.rank ?? 9999);

    const cards = piSprints.map(s => {
        const st = s.state || (s.endDate && s.endDate < today ? 'closed' : (s.startDate && s.startDate > today ? 'future' : 'active'));
        // Compteur de points pour ce sprint (filtré par équipe si sélectionnée)
        let pts = 0, donePts = 0;
        let ts2 = [];
        if (allTickets && s.name) {
            // Périmètre ENGAGÉ : reports compris. `t.sprintName` seul ne montrerait que les
            // tickets restés — donc, sur un sprint clos, uniquement ses réussites.
            // `null` = matching sur le nom EXACT : sans filtre d'équipe (team === 'all'),
            // la tolérance par clé NN.N ferait entrer le sprint 30.1 des autres équipes.
            ts2 = allTickets.filter(t =>
                engagedInSprint(t, s.name, sprintStartsOf(store.get('sprintInfo')), null) && (team === 'all' || !team || t.team === team)
            );
            for (const t of ts2) {
                pts += (t.points || 0);
                // RÉALISÉ : seulement ce qui a été fini DANS le sprint. Un ticket reporté puis
                // terminé ailleurs créditerait ce sprint de travail fait après sa clôture.
                if (t.status === 'done' && isInSprint(t, s.name, null)) donePts += (t.points || 0);
            }
        }
        const ratio = pts ? Math.round(donePts / pts * 100) : 0;
        const ratioBar = pts
            ? `<div class="pi-sprint-card-bar"><div class="pi-sprint-card-bar-fill ${progressColor(ratio)}" style="width:${ratio}%"></div></div>`
            : '';
        const dates = `${_fmtShort(s.startDate)} → ${_fmtShort(s.endDate)}`;
        const goalText = (s.goal || '').trim();
        const goalHtml = goalText
            ? `<div class="pi-sprint-card-goal">${esc(goalText)}</div>`
            : `<div class="pi-sprint-card-goal pi-sprint-card-goal--empty">Aucun objectif défini</div>`;

        // Tickets "glissés" — engagés ici, pas livrés ici. Deux cas : le ticket a été REPORTÉ
        // vers un autre sprint (JIRA le déplace à la clôture) — et cela compte même s'il est
        // `done` aujourd'hui, car il l'a été ailleurs ; ou il est resté sans être terminé.
        // `undefined` = non concerné · `null` = resté non fini · sinon le sprint d'arrivée.
        const _slippedTo = t => {
            const moved = carriedOverTo(t, s.name, null);
            if (moved) return moved;
            return (st === 'closed' && t.status !== 'done') ? null : undefined;
        };
        const slippedCount = ts2.filter(t => _slippedTo(t) !== undefined).length;

        // Détail des tickets : groupés par catégorie (US / Buffer / Action), triés par rank.
        const groupsHtml = _GROUPS.map(g => {
            const items = ts2.filter(g.test).sort(_byRank);
            if (!items.length) return '';
            const planned  = sumBy(items, t => t.points);
            const inProg   = sumBy(items.filter(t => t.status === 'inprog'), t => t.points);
            const groupDone = sumBy(items.filter(t => t.status === 'done'), t => t.points);
            return `<div class="pi-sprint-card-group">
                <div class="pi-sprint-card-group-hd">
                    <span class="pi-sprint-card-group-label">${g.icon} ${g.label} <span class="pi-sprint-card-group-count">(${items.length})</span></span>
                    <span class="pi-sprint-card-group-pts">${planned} pts<span class="sep">·</span>${inProg} en cours<span class="sep">·</span>${groupDone} fait</span>
                </div>
                <div class="pi-sprint-card-group-list">
                    ${items.map(t => {
                        const to = _slippedTo(t);
                        const slipped = to !== undefined;
                        return `<div class="pi-sprint-card-ticket${slipped ? ' pi-sprint-card-ticket--slipped' : ''}" data-ticket="${esc(t.id)}" title="${esc(t.title || '')}${slipped ? (to ? ` · Glissé vers ${esc(to)}` : ' · Non terminé à la clôture') : ''}">
                        <span class="status-dot-sm" style="background:var(--status-${t.status || 'todo'})"></span>
                        <span class="pi-sprint-card-ticket-id">${esc(t.id)}</span>
                        <span class="pi-sprint-card-ticket-title">${esc(t.title || '')}</span>
                        ${slipped ? `<span class="pi-sprint-card-ticket-slip">↪${to ? esc(extractSprintLabel(to) || to) : ''}</span>` : ''}
                        <span class="pi-sprint-card-ticket-pts">${t.points || '—'}</span>
                    </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
        const ticketsHtml = ts2.length
            // Plusieurs équipes (vue « toutes ») : listes FERMÉES — ouvertes, elles cumulaient les tickets de 13 équipes
            // (bloc Sprint de 16 872 px ≈ 19 écrans, 3.236.0). Compteur et « ⚠ glissés » restent dans le résumé.
            ? `<details class="pi-sprint-card-tickets"${!(team && team !== 'all') ? '' : (st === 'future' || st === 'active' || slippedCount) ? ' open' : ''}>
                <summary>Tickets <span class="pi-sprint-card-tickets-count">(${ts2.length})</span>${slippedCount ? ` <span class="pi-sprint-card-slip-count">⚠ ${slippedCount} glissé${slippedCount > 1 ? 's' : ''}</span>` : ''}</summary>
                ${groupsHtml}
            </details>`
            : '';

        return `<div class="pi-sprint-card pi-sprint-card--${st}" title="${esc(s.name)} · ${dates}">
            <div class="pi-sprint-card-hdr">
                <span class="pi-sprint-card-state pi-sprint-card-state--${st}">${_stateIcon(st)} ${_stateLabel(st)}</span>
                ${st === 'active' ? '<span class="pi-sprint-card-now">● MAINTENANT</span>' : ''}
            </div>
            <div class="pi-sprint-card-name">${esc(s.name)}</div>
            <div class="pi-sprint-card-dates">${dates}</div>
            ${goalHtml}
            ${pts ? `<div class="pi-sprint-card-pts">
                <span><strong>${donePts}</strong><span class="sep">/</span>${pts} <small>pts</small></span>
                <span class="pi-sprint-card-pct">${ratio}%</span>
            </div>${ratioBar}` : ''}
            ${ticketsHtml}
        </div>`;
    }).join('');

    return `<div class="pi-sprints-strip">
        <div class="pi-sprints-strip-head">
            <span class="pi-sprints-strip-title">Sprints du PI ${curPi}</span>
            <span class="pi-sprints-strip-count">${piSprints.length} sprint${piSprints.length > 1 ? 's' : ''}</span>
        </div>
        <div class="pi-sprints-strip-cards">${cards}</div>
    </div>`;
}
