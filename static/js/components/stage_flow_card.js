/**
 * Card "Temps par colonne" (flux inter-étapes) — réutilisable Dashboard + PI Planning.
 *
 * Affiche la durée moyenne (jours) réellement passée par les tickets dans chaque étape
 * du workflow suivie (En cours de dév, En cours de test, Revue, À livrer en qualif,
 * À livrer en prod — ordre chronologique), calculée depuis ticket.stageDurations
 * (cf computeStageFlow / sync.js). Ne s'affiche que pour les colonnes réellement
 * présentes dans le workflow de l'équipe.
 *
 * Reprend le style visuel du schéma "Lead time & Cycle time" (classes .lct-*). Chaque
 * segment est cliquable : ouvre une modale de détail qui reprend la charte des tickets
 * (icône de type, couleur de statut, pastille buffer) et la liste `.stuck-row` déjà
 * utilisée par la card "Tickets bloqués ou stagnants" (cf bindStageFlowCard).
 *
 * Exclusion du calcul : un ticket peut être exclu individuellement (bouton 🚫 par ligne)
 * ou via un motif regex appliqué au titre (ex: "mouf-mouf" exclut tout ticket recréé
 * chaque PI avec ce texte dans le titre, même avec un nouvel ID). Persisté en localStorage
 * (utils.js), la card se rafraîchit immédiatement après chaque changement.
 */

import { esc, toast, promptModal, computeStageFlow, computeStageFlowDetail, isBufferItem, getStatusLabel, isFlowTicketExcluded, setFlowTicketExcluded, getExcludedFlowPatterns, addExcludedFlowPattern, removeExcludedFlowPattern, extractPiNum } from '../utils.js';
import { TYPE_ICONS } from '../config.js';
import { helpIconHtml } from './help_popover.js';

const STAGE_ICONS = {
    dev: '💻',
    review: '👀',
    test: '🧪',
    qualif: '📦',
    prod: '🚀',
};

// Couleur d'accent par étape — reprend les variables de statut déjà utilisées ailleurs
// (board, badges) pour rester cohérent : dev↔en cours, test↔test, review↔revue,
// qualif/prod↔terminé (fin de flux).
const STAGE_COLORS = {
    dev: 'var(--status-inprog)',
    test: 'var(--status-test, #06b6d4)',
    review: 'var(--status-review, #8b5cf6)',
    qualif: 'var(--status-done)',
    prod: 'var(--status-done)',
};

const STAGE_LABELS = {
    dev: 'En cours de dév', test: 'En cours de test', review: 'Revue',
    qualif: 'À livrer en qualif', prod: 'À livrer en prod',
};

export function stageFlowCardHtml(tickets) {
    const groups = computeStageFlow(tickets);
    if (!groups.length) return '';
    return `
        <div class="card stage-flow-card">
            <div class="card-header">
                <div>
                    <span class="card-title">⏳ Temps par colonne ${helpIconHtml({ key: 'stage-flow', label: 'Comprendre le temps par colonne' })}</span>
                    <span class="card-subtitle">Durée moyenne passée dans chaque étape — cliquer pour le détail</span>
                </div>
                <button type="button" class="btn btn-ghost btn-xs stage-flow-copy-all" title="Copier le détail de toutes les colonnes (Slack)">📋 Copier</button>
            </div>
            <div class="lct-schema">
                <div class="lct-flow">
                    ${groups.map(g => `
                    <button type="button" class="lct-seg stage-flow-seg stage-flow-seg--${g.key}" data-stage-key="${g.key}" title="${g.count} ticket${g.count > 1 ? 's' : ''} concerné${g.count > 1 ? 's' : ''} — cliquer pour le détail">
                        <span class="lct-seg-lbl">${STAGE_ICONS[g.key] || ''} ${esc(g.label)}</span>
                        <span class="lct-seg-val">${g.avgDays} j</span>
                        <span class="stage-flow-count">${g.count} ticket${g.count > 1 ? 's' : ''}</span>
                    </button>`).join('')}
                </div>
            </div>
        </div>`;
}

/** Wire les clics sur les segments de la card (à appeler après insertion dans le DOM). */
export function bindStageFlowCard(container, tickets) {
    const refresh = () => {
        const card = container.querySelector('.stage-flow-card');
        if (!card) return;
        const html = stageFlowCardHtml(tickets);
        if (!html) { card.remove(); return; }
        card.outerHTML = html;
        bindStageFlowCard(container, tickets);
    };
    container.querySelectorAll('.stage-flow-seg[data-stage-key]').forEach(seg => {
        seg.addEventListener('click', () => _openStageFlowDetail(seg.dataset.stageKey, tickets, refresh));
    });
    container.querySelector('.stage-flow-copy-all')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(_buildAllStagesCopyText(tickets));
            toast('Résumé de toutes les colonnes copié — collable dans Slack', 'success');
        } catch (err) { toast('Copie impossible : ' + err.message, 'error'); }
    });
}

const MAX_ROWS = 25;

function _renderPatternsBar() {
    const patterns = getExcludedFlowPatterns();
    return `
        <div class="stage-detail-patterns">
            <span class="stage-detail-patterns-lbl">Motifs exclus (titre) :</span>
            ${patterns.map(p => `
                <span class="stage-detail-pattern-chip">${esc(p)}
                    <button type="button" class="stage-detail-pattern-rm" data-remove-pattern="${esc(p)}" title="Retirer ce motif">×</button>
                </span>`).join('')}
            <button type="button" class="btn btn-ghost btn-sm" data-act="add-pattern">+ motif</button>
        </div>`;
}

function _renderStageDetailBody(groupKey, tickets, color) {
    const { byRawStatus, tickets: rows } = computeStageFlowDetail(groupKey, tickets);
    const activeCount = rows.filter(r => !r.excluded).length;
    const excludedCount = rows.length - activeCount;
    const visible = rows.slice(0, MAX_ROWS);
    const hiddenCount = rows.length - visible.length;
    const countLabel = `${activeCount} ticket${activeCount > 1 ? 's' : ''} concerné${activeCount > 1 ? 's' : ''}`
        + (excludedCount > 0 ? ` · ${excludedCount} exclu${excludedCount > 1 ? 's' : ''} du calcul` : '');
    return { rows, countLabel, html: `
        ${_renderPatternsBar()}
        <div class="stage-detail-breakdown">
            ${byRawStatus.map(r => `
                <div class="stage-detail-row" style="border-left-color:${color}">
                    <span class="stage-detail-status">${esc(r.rawStatus)}</span>
                    <span class="stage-detail-count">${r.count} ticket${r.count > 1 ? 's' : ''}</span>
                    <span class="stage-detail-avg" style="color:${color}">${r.avgDays} j moy.</span>
                </div>`).join('')}
            ${!byRawStatus.length ? '<p class="text-muted text-sm">Tous les tickets de cette colonne sont exclus du calcul.</p>' : ''}
        </div>
        <div class="stage-detail-tickets">
            ${visible.map(({ ticket: t, days, jiraStatus, excluded, excludedPattern }) => {
                const typeIcon = TYPE_ICONS[t.type] ? `${TYPE_ICONS[t.type]} ` : '';
                const bufferTag = isBufferItem(t) ? ' <span title="Buffer" style="color:#8B5CF6">🛡️</span>' : '';
                const toggleHtml = excludedPattern
                    ? `<span class="stage-flow-exclude-btn stage-flow-exclude-btn--tag is-excluded" title="Exclu via le motif «${esc(excludedPattern)}» — retirer le motif ci-dessus pour le réinclure">🏷️</span>`
                    : `<button type="button" class="stage-flow-exclude-btn${excluded ? ' is-excluded' : ''}" data-toggle-ticket="${esc(t.id)}" title="${excluded ? 'Réinclure dans le calcul' : 'Exclure ce ticket du calcul (ex: ticket récurrent qui fausse la moyenne)'}">${excluded ? '↩' : '🚫'}</button>`;
                return `
                <div class="stuck-row${excluded ? ' stuck-row--excluded' : ''}" data-ticket-id="${esc(t.id)}" title="${excluded ? 'Exclu du calcul — ' : ''}Ouvrir ${esc(t.id)}">
                    <span class="stuck-dot" style="background:var(--status-${esc(t.status)}, var(--text-muted))"></span>
                    <span class="stuck-id">${esc(t.id)}</span>
                    <span class="stuck-title">${typeIcon}${esc(t.title || '')}${bufferTag}</span>
                    <span class="stuck-state stuck-state--${esc(t.status)}">${esc(jiraStatus || getStatusLabel(t))}</span>
                    <span class="stuck-lead${t.leader ? '' : ' stuck-lead--none'}">${esc(t.leader || 'Non assigné')}</span>
                    <span class="stuck-age" style="${excluded ? '' : `color:${color};border-color:color-mix(in srgb, ${color} 35%, transparent);background:color-mix(in srgb, ${color} 12%, transparent)`}">${days} j</span>
                    ${toggleHtml}
                </div>`;
            }).join('')}
            ${hiddenCount > 0 ? `<div class="stage-detail-more">+${hiddenCount} autre${hiddenCount > 1 ? 's' : ''}</div>` : ''}
        </div>` };
}

// Déduit les PI/sprints concernés à partir d'un ensemble de tickets (source unique extractPiNum).
function _piSprintLines(ticketList) {
    const sprintNames = [...new Set(ticketList.flatMap(t =>
        [t.sprintName || t.piSprint, ...(Array.isArray(t.allSprints) ? t.allSprints : [])].filter(Boolean)
    ))].sort();
    const piNums = [...new Set(sprintNames.map(extractPiNum).filter(Boolean))].sort((a, b) => a - b);
    return [
        piNums.length ? `PI concerné${piNums.length > 1 ? 's' : ''} : ${piNums.join(', ')}` : '',
        sprintNames.length ? `Sprint${sprintNames.length > 1 ? 's' : ''} : ${sprintNames.join(', ')}` : '',
    ].filter(Boolean);
}

// Bloc texte d'une seule colonne : titre + moyenne, puis liste des tickets actifs (id, titre,
// durée) triés du plus long au plus court pour repérer d'un coup d'œil ce qui traîne.
function _buildStageBlockText(groupKey, rows) {
    const label = STAGE_LABELS[groupKey] || groupKey;
    const icon = STAGE_ICONS[groupKey] || '';
    const active = rows.filter(r => !r.excluded);
    const avg = active.length ? active.reduce((sum, r) => sum + r.days, 0) / active.length : 0;
    return [
        `${icon} ${label} — ${active.length} ticket${active.length > 1 ? 's' : ''}, ${avg.toFixed(1)} j en moyenne`,
        ...active
            .slice()
            .sort((a, b) => b.days - a.days)
            .map(({ ticket: t, days }) => `- ${t.id} (🕰️ ${days.toFixed(1)} j) ${t.title || '(sans titre)'}`),
    ].join('\n');
}

// Texte Slack-friendly pour UNE colonne (détail ouvert au clic sur un segment) : préfixe
// [CYCLE TIME] (chaque colonne suivie est une tranche du cycle time, entre "Démarré" et
// "Terminé" — cf schéma Lead time & Cycle time du Dashboard), PI/sprints concernés, explication
// du calcul, puis le bloc de la colonne.
function _buildStageFlowCopyText(groupKey, rows) {
    const active = rows.filter(r => !r.excluded);
    return [
        '📣 [CYCLE TIME]',
        ..._piSprintLines(active.map(r => r.ticket)),
        '',
        'Calcul : durée moyenne (en jours) passée par chaque ticket dans cette colonne, de son entrée à sa sortie.',
        '',
        _buildStageBlockText(groupKey, rows),
    ].join('\n');
}

// Texte Slack-friendly pour TOUTES les colonnes de la card (bouton "Copier" du header) : même
// préfixe/PI-sprints une seule fois en tête, puis un bloc par colonne dans l'ordre chronologique.
function _buildAllStagesCopyText(tickets) {
    const groups = computeStageFlow(tickets);
    const allActiveTickets = [];
    const blocks = groups.map(g => {
        const { tickets: rows } = computeStageFlowDetail(g.key, tickets);
        allActiveTickets.push(...rows.filter(r => !r.excluded).map(r => r.ticket));
        return _buildStageBlockText(g.key, rows);
    });
    return [
        '📣 [CYCLE TIME]',
        ..._piSprintLines(allActiveTickets),
        '',
        'Calcul : durée moyenne (en jours) passée par chaque ticket dans chaque colonne du workflow, de son entrée à sa sortie.',
        '',
        blocks.join('\n\n'),
    ].join('\n');
}

function _openStageFlowDetail(groupKey, tickets, refreshCard) {
    const label = STAGE_LABELS[groupKey] || groupKey;
    const icon = STAGE_ICONS[groupKey] || '';
    const color = STAGE_COLORS[groupKey] || 'var(--text-muted)';
    const first = _renderStageDetailBody(groupKey, tickets, color);
    if (!first.rows.length) return;

    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `
        <div class="confirm-modal confirm-modal--export stage-detail-modal" role="dialog" aria-modal="true" aria-label="Détail ${esc(label)}">
            <div class="confirm-body">
                <div class="stage-detail-hdr">
                    <span class="confirm-icon stage-detail-icon" style="background:color-mix(in srgb, ${color} 16%, transparent);color:${color}">${icon}</span>
                    <div>
                        <div class="confirm-title">${esc(label)}</div>
                        <span class="text-xs text-muted" data-role="count-label">${esc(first.countLabel)}</span>
                    </div>
                </div>
                <div data-role="content">${first.html}</div>
            </div>
            <div class="confirm-actions">
                <button class="btn btn-secondary btn-sm" data-act="copy">📋 Copier</button>
                <button class="btn btn-ghost btn-sm" data-act="close">Fermer</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));

    let currentRows = first.rows;
    const rerender = () => {
        const { rows, countLabel, html } = _renderStageDetailBody(groupKey, tickets, color);
        if (!rows.length) { close(); return; }
        currentRows = rows;
        ov.querySelector('[data-role="count-label"]').textContent = countLabel;
        ov.querySelector('[data-role="content"]').innerHTML = html;
    };

    const close = () => {
        ov.classList.remove('visible');
        ov.addEventListener('transitionend', () => ov.remove(), { once: true });
        document.removeEventListener('keydown', onKey);
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', async e => {
        if (e.target === ov || e.target.closest('[data-act="close"]')) return close();

        const copyBtn = e.target.closest('[data-act="copy"]');
        if (copyBtn) {
            try {
                await navigator.clipboard.writeText(_buildStageFlowCopyText(groupKey, currentRows));
                toast('Résumé copié — collable dans Slack', 'success');
            } catch (err) { toast('Copie impossible : ' + err.message, 'error'); }
            return;
        }

        if (e.target.closest('[data-act="add-pattern"]')) {
            promptModal('Exclure par motif', {
                message: 'Tout ticket dont le titre contient ce texte (regex, insensible à la casse) sera exclu du calcul de flux — utile pour un ticket récurrent recréé à chaque PI avec un nouvel ID.',
                placeholder: 'ex: mouf-mouf',
            }).then(pattern => {
                if (!pattern) return;
                addExcludedFlowPattern(pattern);
                toast(`Motif « ${pattern} » ajouté — tickets correspondants exclus`, 'info');
                rerender();
                refreshCard();
            });
            return;
        }
        const rmPattern = e.target.closest('[data-remove-pattern]');
        if (rmPattern) {
            removeExcludedFlowPattern(rmPattern.dataset.removePattern);
            toast('Motif retiré', 'info');
            rerender();
            refreshCard();
            return;
        }
        const toggleBtn = e.target.closest('[data-toggle-ticket]');
        if (toggleBtn) {
            const id = toggleBtn.dataset.toggleTicket;
            const nowExcluded = !isFlowTicketExcluded(id);
            setFlowTicketExcluded(id, nowExcluded);
            toast(nowExcluded ? `${id} exclu du calcul de flux` : `${id} réinclus dans le calcul`, 'info');
            rerender();
            refreshCard();
            return;
        }
        const ticketRow = e.target.closest('.stuck-row[data-ticket-id]');
        if (ticketRow) {
            close();
            window.__squadBoard?.openTicketModal?.(ticketRow.dataset.ticketId);
        }
    });
}
