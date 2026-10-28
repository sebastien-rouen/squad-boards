/**
 * Planning Poker d'un ticket : table de jeu, votes, références 1 → 21, tours conclus, file / série « ⏭ Suivant ».
 *
 * Extrait de modal.js (3.253.0, > 2 900 lignes) — code déplacé à l'identique. Les dépendances vers
 * modal.js sont CIRCULAIRES mais sans effet au chargement (appelées dans des fonctions seulement) :
 * ne jamais utiliser un import de ./modal.js au niveau racine du module.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, fmtRelative, initials, toast, typeBadge, priorityBadge, cycleDays, pointsTone, estimationQueue, labelChipHtml, emptyStateHtml } from '../utils.js';
import { pokerSoundOn, setPokerSound, playPokerSound } from './poker_sound.js';
import { playlistFor, playlistNext, clearPokerPlaylist } from '../utils/poker-playlist.js';
import { flyPokerChip } from './poker_chip_fly.js';
import { descSections, descSectionsHtml } from './desc_sections.js';
import { _fmtHistDate, _modalIdx, _modalList, avatar, openTicketModal, overlay } from './modal.js';
import { _renderCommentBody } from './ticket_desc.js';
import { rule } from '../rules.js';

// ══════════════════════════════════════════════════════════════════════════════
// Planning Poker — vote collectif Story Points
// ══════════════════════════════════════════════════════════════════════════════
// Cartes du PROJET (Paramètres → Règles métier, 3.272.0 ; défaut Fibonacci 1 → 21 + « ? ») : nombres entiers,
// « ? » et « ☕ ». `_pokerNums()` = les seules valeurs enregistrables comme story points.
const _pokerCards = () => rule('sb-poker-scale').map(v => (/^\d+$/.test(v) ? Number(v) : v));
const _pokerNums = () => _pokerCards().filter(v => typeof v === 'number');
// Couleurs des cartes : décor CYCLIQUE par rang, d'une seule encre (poker-table.css) — aucun lien avec la valeur,
// les cartes de vote restent neutres.
const _POKER_SUITS = ['♠', '♥', '♣', '♦'];

/** Échelle « animale » des tailles : un repère ludique qui parle à tout le monde. */
const POKER_ANIMALS = { 1: '🐭', 2: '🐇', 3: '🦊', 5: '🐶', 8: '🐴', 13: '🐘', 21: '🐋' };

/**
 * Tickets de RÉFÉRENCE du Poker : pour chaque taille 1 → 21, le ticket livré le plus TYPIQUE
 * (Cycle Time le plus proche de la médiane de cette taille), de l'équipe du ticket — sinon du
 * train, signalé. Calculé une fois à l'ouverture : la popin se re-rend à chaque rafraîchissement
 * des votes. Durées en jours ouvrés (`cycleDays`).
 */
function _pokerReferences(ticket) {
    const all = store.get('tickets') || [];
    const done = all.filter(t => t.id !== ticket.id && t.status === 'done' && cycleDays(t) > 0);
    // Références ÉPINGLÉES par l'équipe (piInfo.pokerReferences) : priment sur le choix automatique.
    const saved = (ticket.team && store.get('piInfo')?.pokerReferences?.[ticket.team]) || {};
    const team = ticket.team ? done.filter(t => t.team === ticket.team) : [];
    const median = arr => { const v = [...arr].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
    const rows = _pokerNums().map(v => {
        let src = 'team', pool = team.filter(t => Number(t.points) === v);
        if (!pool.length) { src = 'train'; pool = done.filter(t => Number(t.points) === v); }
        const pinned = saved[String(v)] ? all.find(t => t.id === saved[String(v)]) : null;
        if (!pool.length) return { v, ref: pinned, n: 0, median: null, src: null, chosen: !!pinned, candidates: [] };
        const med = median(pool.map(cycleDays));
        // Candidats = les plus typiques d'abord (Cycle Time le plus proche de la médiane), puis récents.
        const candidates = [...pool].sort((a, b) => Math.abs(cycleDays(a) - med) - Math.abs(cycleDays(b) - med)
            || String(b.resolvedDate || '').localeCompare(String(a.resolvedDate || ''))).slice(0, 6);
        return { v, ref: pinned || candidates[0], n: pool.length, median: med, src, chosen: !!pinned, candidates };
    });
    const max = Math.max(1, ...rows.map(r => r.median || 0));
    return { rows, max, team: ticket.team || '' };
}

/** Tableau des tickets de référence (bas de la popin Poker). `mine` = ma carte, `nearest` = consensus. */
function _pokerRefsHtml(refs, { open, mine, nearest, current, picking }) {
    const jiraUrl = store.get('jiraUrl');
    const fmtJ = d => `${String(Math.round(d * 10) / 10).replace('.', ',')} j`;
    return `<div class="poker-refs${open ? ' is-open' : ''}">
        <button type="button" class="poker-refs-toggle" id="poker-refs-toggle" aria-expanded="${open}">
            <span>📏 Tickets de référence${refs.team ? ` — ${esc(refs.team)}` : ''}</span>
            <small>le ticket livré « typique » de chaque taille</small>
            <span class="poker-refs-chev" aria-hidden="true">${open ? '▾' : '▸'}</span>
        </button>
        ${open ? `<table class="poker-refs-table">
            <thead><tr><th>Taille</th><th>Ticket de référence</th><th title="Cycle Time médian des tickets livrés de cette taille (jours ouvrés)">Durée typique</th><th>Tickets</th>${refs.team ? '<th></th>' : ''}</tr></thead>
            <tbody>${refs.rows.map(r => {
                const tone = pointsTone(r.v).key;
                const cls = [r.v === mine ? 'is-mine' : '', r.v === nearest ? 'is-nearest' : '', r.v === current ? 'is-current' : ''].filter(Boolean).join(' ');
                const ref = r.ref;
                const refHtml = ref
                    ? `${jiraUrl ? `<a class="poker-ref-id" href="${esc(`${jiraUrl}/browse/${ref.id}`)}" target="_blank" rel="noopener">${esc(ref.id)}</a>` : `<span class="poker-ref-id">${esc(ref.id)}</span>`}
                       <span class="poker-ref-title" title="${esc(ref.title || '')}">${esc(ref.title || '')}</span>
                       ${r.chosen ? `<span class="poker-ref-pin" title="Référence choisie par l'équipe ${esc(refs.team)}">📌 équipe</span>` : r.src === 'train' ? '<span class="poker-ref-src" title="Aucun ticket livré de cette taille dans l\'équipe : référence prise dans le train">train</span>' : ''}`
                    : '<span class="poker-ref-none">aucun ticket livré de cette taille</span>';
                return `<tr class="${cls}">
                    <td><span class="poker-ref-size"><span class="poker-ref-animal" aria-hidden="true">${POKER_ANIMALS[r.v] || '🃏'}</span><span class="mdl-points pts-tone--${tone}">${r.v}<small>pts</small></span></span></td>
                    <td class="poker-ref-cell"><div class="poker-ref-line">${refHtml}${r.v === current ? '<span class="poker-ref-tag">ce ticket</span>' : ''}${r.v === nearest ? '<span class="poker-ref-tag poker-ref-tag--star">★ consensus</span>' : ''}</div></td>
                    <td>${r.median != null ? `<span class="poker-ref-bar"><i class="pts-tone--${tone}" style="width:${Math.max(6, r.median / refs.max * 100)}%"></i></span><b>${fmtJ(r.median)}</b>` : '—'}</td>
                    <td class="poker-ref-n">${r.n || '—'}</td>
                    ${refs.team ? `<td class="poker-ref-act">${r.candidates.length || r.chosen
                        ? `<button type="button" class="poker-ref-btn${picking === r.v ? ' is-on' : ''}" data-ref-pick="${r.v}" title="Choisir le ticket de référence de l'équipe pour ${r.v} pts">${picking === r.v ? 'Fermer' : r.chosen ? 'Changer' : '📌 Choisir'}</button>` : ''}</td>` : ''}
                </tr>${picking === r.v ? `<tr class="poker-ref-cands"><td colspan="5">
                    <span class="poker-ref-cands-title">Quel ticket représente le mieux « ${r.v} pts » pour ${esc(refs.team)} ? <small>(les plus typiques d'abord)</small></span>
                    <div class="poker-ref-cands-list">${r.candidates.map((c, i) => `<button type="button" class="poker-ref-cand${r.chosen && r.ref?.id === c.id ? ' is-chosen' : ''}" data-ref-choose="${r.v}" data-ref-id="${esc(c.id)}" title="${esc(c.title || '')}">
                        <span class="poker-ref-id">${esc(c.id)}</span><span class="poker-ref-title">${esc(c.title || '')}</span><span class="poker-ref-cand-d">${fmtJ(cycleDays(c))}${i === 0 ? ' · ★ typique' : ''}</span>
                    </button>`).join('')}</div>
                    ${r.chosen ? `<button type="button" class="poker-ref-reset" data-ref-unpin="${r.v}">↺ Revenir au choix automatique</button>` : ''}
                </td></tr>` : ''}`;
            }).join('')}</tbody>
        </table>` : ''}
    </div>`;
}

// Génère une couleur HSL stable à partir d'un nom
const _pokerColor = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFF;
    return `hsl(${h % 360}, 60%, 48%)`;
};
const _initials = (name) => name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
// Adapte un vote serveur {voter,value,revealed} → forme front {name,val,me,revealed}.
/** Tickets à estimer APRÈS celui-ci : file partagée avec la page « Séance d'affinage »
 *  (`estimationQueue`, utils/estimation-queue.js), son sprint en tête. Relue à chaque clic. */
const _nextToEstimate = ticket => playlistFor(ticket.id)
    ? playlistNext(store.get('tickets') || [], ticket.id)   // liste de jeu (cadrage…) : elle seule, cf. utils/poker-playlist.js
    : estimationQueue(store.get('tickets') || [], ticket.team, { sprintName: ticket.sprintName, exclude: ticket.id, teamSprints: store.get('sprintInfo')?.teamSprints }).map(x => x.t);

/** Historique des tours de Poker CONCLUS d'un ticket (section de la modale, chargée à la demande). */
export function _pokerRoundsHtml(rounds) {
    const fmt = d => String(Math.round(d * 10) / 10).replace('.', ',');
    return rounds.map(r => {
        const nums = (r.votes || []).map(v => Number(v.value)).filter(Number.isFinite);
        const min = nums.length ? Math.min(...nums) : null, max = nums.length ? Math.max(...nums) : null;
        const split = r.spread != null && r.spread >= 4;
        return `<div class="mdl-pr">
            <div class="mdl-pr-head">
                <span class="mdl-pr-date" title="${esc(_fmtHistDate(r.createdAt))}">${esc(fmtRelative(r.createdAt))}</span>
                <span class="mdl-pr-who">${r.voters} votant${r.voters > 1 ? 's' : ''}${r.author ? ` · enregistré par ${esc(r.author)}` : ''}</span>
                ${split ? `<span class="mdl-pr-flag" title="Écart-type ${fmt(r.spread)} — à revoir en rétro ?">⚠️ fort désaccord ${min} ↔ ${max}</span>`
                    : r.spread === 0 && r.voters > 1 ? '<span class="mdl-pr-flag mdl-pr-flag--ok">🎯 unanimité</span>' : ''}
            </div>
            <div class="mdl-pr-body">
                <span class="mdl-pr-votes">${(r.votes || []).map(v => `<span class="mdl-pr-vote" title="${esc(v.voter)} : ${esc(v.value)}">${esc(v.value)}<small>${esc(initials(v.voter))}</small></span>`).join('')}</span>
                <span class="mdl-pr-arrow" aria-hidden="true">→</span>
                <span class="mdl-points pts-tone--${pointsTone(r.value).key}" title="Valeur retenue">${r.value}<small>pts</small></span>
                ${r.avg != null ? `<span class="mdl-pr-avg">moy. ${fmt(r.avg)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

const _adaptVote = (v, myName) => ({
    name: v.voter,
    val: v.value === '?' || v.value === '☕' ? v.value : (v.value === '' || v.value == null ? null : parseInt(v.value)),
    me: v.voter === myName,
    revealed: !!v.revealed,
});

export function _openPokerModal(ticket, apiSave, openTicketModal) {
    document.getElementById('poker-overlay')?.remove();

    const ov = document.createElement('div');
    ov.id = 'poker-overlay';
    ov.className = 'poker-overlay';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));

    // Tickets de référence : calculés UNE fois (la popin se re-rend à chaque rafraîchissement)
    let _refs = _pokerReferences(ticket);
    let _refsOpen = localStorage.getItem('sb-poker-refs') !== 'closed';
    let _refsPick = null;   // taille dont on choisit la référence (liste des candidats dépliée)
    // Volet « Description » à droite de la popin : rendu calculé UNE fois (la popin se re-rend toutes
    // les 3 s), ouvert / fermé EN PLACE (sans re-rendu, donc sans rejouer d'animation), état mémorisé.
    let _descOpen = (() => { try { return localStorage.getItem('sb-poker-desc') === 'open'; } catch { return false; } })();
    // `_renderCommentBody('')` rend un tiret « — » (non vide) : tester la description BRUTE, sinon le volet
    // n'affichait jamais « Pas de description ».
    const _descHtml = String(ticket.description || '').trim() ? (_renderCommentBody(ticket.description) || '') : '';
    // Sections utiles pour estimer (critères d'acceptation, règles de gestion, DoD, points d'attention)
    // épinglées en tête ; la description complète passe dessous, repliée s'il y en a.
    const _descPinned = descSections(_descHtml);
    const _descHasAccept = _descPinned.some(x => x.key === 'accept');
    const _pdClosed = new Set();   // sections repliées par l'utilisateur (survit aux re-rendus de 3 s)
    let _pdFullOpen = false;       // « Description complète » dépliée ?
    const _descParent = ticket.epic ? [...(store.get('features') || []), ...(store.get('epics') || [])].find(x => x.id === ticket.epic) : null;
    const _descMeta = [
        typeBadge(ticket.type, { size: '2xs' }),
        priorityBadge(ticket.priority, { size: '2xs' }),
        Number(ticket.points) > 0 ? `<span class="mdl-points pts-tone--${pointsTone(ticket.points).key}">${Number(ticket.points)}<small>pts</small></span>` : '<span class="poker-desc-nopts">non estimé</span>',
    ].join('');
    const _descExtra = [
        ticket.epic ? `<span class="poker-desc-parent" title="${esc(_descParent?.title || '')}">↳ <b>${esc(ticket.epic)}</b> ${esc(_descParent?.title || '')}</span>` : '',
        (ticket.labels || []).length ? `<span class="poker-desc-labels">${ticket.labels.map(l => labelChipHtml(l)).join('')}</span>` : '',
    ].filter(Boolean).join('');
    // Animations des cartes : la « distribution » ne se rejoue qu'au CHANGEMENT de phase (pas à chaque
    // rafraîchissement de 3 s) ; le « pop » ne vaut que pour le rendu qui suit un clic.
    let _dealtFor = null, _dealUntil = 0;
    let _justPicked = null;
    // Révélation animée : seulement au PASSAGE caché → révélé observé par CE navigateur (clic local
    // ou rafraîchissement) — `null` à l'ouverture, pour ne pas rejouer un tour déjà révélé.
    let _wasRevealed = null, _revealUntil = 0, _loaded = false;
    // Valeur à enregistrer choisie parmi la suite (null = consensus). Gardée ici : la popin se
    // re-rend toutes les 3 s et un choix porté par le DOM seul sauterait.
    let _savePick = null;

    // État des votes (source = serveur, rafraîchi par polling pour le live multi-utilisateurs)
    let _serverVotes = [];
    let _pollTimer = null;

    const close = () => {
        clearInterval(_pollTimer);
        if (location.hash.endsWith('/poker'))
            history.replaceState(null, '', location.hash.replace(/\/poker$/, ''));
        ov.classList.remove('visible');
        ov.addEventListener('transitionend', () => ov.remove(), { once: true });
    };

    // Rafraîchit l'état depuis le serveur puis re-render (sans casser la saisie en cours).
    const refresh = async (rerender = true) => {
        try { _serverVotes = await api.getPoker(ticket.id); _loaded = true; }
        catch { /* réseau : on garde le dernier état connu */ }
        if (rerender) render();
    };

    const render = () => {
        const myName  = localStorage.getItem('sb-poker-myname') || '';
        const votes   = _serverVotes.map(v => _adaptVote(v, myName));
        const meVote  = votes.find(v => v.me);
        const hasVoted = votes.filter(v => v.val !== null).length;
        const revealed = votes.length > 0 && votes.every(v => v.revealed);
        const numVotes = votes.filter(v => typeof v.val === 'number');
        const avg   = numVotes.length ? numVotes.reduce((s, v) => s + v.val, 0) / numVotes.length : null;
        const min   = numVotes.length ? Math.min(...numVotes.map(v => v.val)) : null;
        const max   = numVotes.length ? Math.max(...numVotes.map(v => v.val)) : null;
        const std   = numVotes.length > 1
            ? Math.sqrt(numVotes.reduce((s, v) => s + Math.pow(v.val - avg, 2), 0) / numVotes.length) : 0;
        const nearest = avg !== null
            ? _pokerNums().reduce((a, b) => Math.abs(b - avg) < Math.abs(a - avg) ? b : a) : null;

        // Phase : 'identity' | 'vote' | 'revealed'
        const phase = !myName ? 'identity' : revealed ? 'revealed' : 'vote';
        // Fenêtre de 700 ms : l'ouverture enchaîne deux rendus (état vide, puis 1er fetch des votes)
        // qui couperaient l'animation ; les rafraîchissements de 3 s, eux, tombent hors fenêtre.
        if (_dealtFor !== phase) { _dealtFor = phase; _dealUntil = Date.now() + 700; }
        const deal = Date.now() < _dealUntil;
        const shown = votes.filter(v => v.val !== null).length;
        // Le 1er rendu (avant tout fetch) voit 0 vote, donc « non révélé » : n'observer la transition
        // qu'une fois les votes chargés, sinon ouvrir un tour déjà révélé rejouerait l'animation.
        if (_loaded) {
            if (_wasRevealed === false && revealed) {
                _revealUntil = Date.now() + shown * 140 + 1600;
                playPokerSound('reveal', { count: shown });
            }
            _wasRevealed = revealed;
        }
        const revealAnim = revealed && Date.now() < _revealUntil;
        // Délai après lequel stats, répartition et consensus apparaissent (tous les avatars retournés).
        const revealDelay = `${shown * 140 + 250}ms`;

        // Lien de partage : doit TOUJOURS pointer vers la modale de ré-estimation poker
        // (ex. .../#health/Gabbiano/ticket/GDEM-4117/poker). On normalise en retirant un
        // éventuel /poker final puis en le rajoutant — qu'on soit déjà sur /poker ou non.
        const shareUrl = location.href.replace(/\/poker$/, '') + '/poker';
        const queue = _nextToEstimate(ticket);
        if (!revealed) _savePick = null;   // nouveau tour : on repart du consensus
        const picked = _savePick ?? nearest;

        const descScroll = ov.querySelector('.poker-desc-body')?.scrollTop || 0;
        ov.innerHTML = `
        <div class="poker-stage">
        <div class="poker-modal poker-phase--${phase}">

            <!-- Header -->
            <div class="poker-hdr">
                <div class="poker-hdr-left">
                    <span class="poker-hdr-icon">🃏</span>
                    <div>
                        <div class="poker-ticket-ref">${esc(ticket.id)}</div>
                        <div class="poker-ticket-title">${esc(ticket.title)}</div>
                        ${playlistFor(ticket.id) ? `<div class="poker-playlist" title="« Suivant » n'enchaîne que sur cette série">
                            <span>${esc(playlistFor(ticket.id).label)} · <b>${queue.length}</b> restant${queue.length > 1 ? 's' : ''} après celui-ci</span>
                            <button type="button" class="poker-playlist-x" id="poker-playlist-x" aria-label="Quitter la série (revenir à la file d'estimation)" title="Quitter la série">✕</button></div>` : ''}
                    </div>
                </div>
                <div class="poker-hdr-right">
                    <button class="poker-sound-btn${pokerSoundOn() ? ' is-on' : ''}" id="poker-sound" aria-pressed="${pokerSoundOn()}"
                            title="${pokerSoundOn() ? 'Sons activés — cliquer pour couper' : 'Activer les sons (choix d\'une carte, révélation) — pratique en visio'}">${pokerSoundOn() ? '🔊' : '🔇'}</button>
                    ${queue.length ? `<button class="poker-next-btn" id="poker-next" title="Ticket suivant à estimer : ${esc(queue[0].id)} — ${esc(queue[0].title || '')}">⏭ Suivant <span class="poker-next-n">${queue.length}</span></button>` : ''}
                    <button class="poker-share-btn" id="poker-share" title="Copier le lien pour inviter des collègues">
                        <svg class="icon icon-sm"><use href="#i-copy"/></svg>
                        Partager
                    </button>
                    <button class="btn-icon" id="poker-close" aria-label="Fermer le Poker"><svg class="icon"><use href="#i-x"/></svg></button>
                </div>
            </div>

            <!-- Bandeau identité -->
            <div class="poker-identity-bar">
                ${myName ? `
                <div class="poker-identity-me">
                    <span class="poker-avatar" style="background:${_pokerColor(myName)}">${_initials(myName)}</span>
                    <span class="poker-identity-name">${esc(myName)}</span>
                    <button class="poker-identity-change" id="poker-change-name" title="Changer de nom">✏️</button>
                </div>` : `
                <form class="poker-identity-form" id="poker-identity-form">
                    <span class="poker-identity-prompt">Qui êtes-vous ?</span>
                    <input class="input input-sm poker-name-input" id="poker-voter-name"
                           placeholder="Votre prénom…" autocomplete="off"
                           value="${esc(myName)}" autofocus>
                    <button class="btn btn-sm btn-primary" type="submit">Rejoindre →</button>
                </form>`}
            </div>

            <!-- Corps -->
            <div class="poker-body">

                <!-- Colonne gauche : cartes -->
                <div class="poker-vote-section">
                    <div class="poker-vote-label">Votre estimation</div>
                    <div class="poker-cards${deal ? ' poker-cards--deal' : ''}">
                        ${_pokerCards().map((v, i) => {
                            const isSelected = meVote?.val === v;
                            // Après révélation : carte inactive (un nouveau tour est nécessaire pour revoter).
                            // Sans prénom : carte CLIQUABLE qui amène au champ prénom (plus de bouton mort).
                            const disabled   = phase === 'revealed';
                            const locked     = !myName;
                            const pop        = isSelected && _justPicked === v;
                            return `<button type="button" class="poker-card${isSelected ? ' poker-card--selected' : ''}${disabled ? ' poker-card--disabled' : ''}${locked ? ' poker-card--locked' : ''}${pop ? ' poker-card--pop' : ''}"
                                        data-val="${v}" style="--i:${i}" ${disabled ? 'disabled' : ''}${locked ? ' aria-disabled="true"' : ''}
                                        title="${locked ? 'Indiquez d\'abord votre prénom pour voter' : disabled ? 'Votes révélés — « Nouveau tour » pour revoter' : `${v} SP${v === '?' ? ' — valeur inconnue' : ''}`}">
                                <span class="poker-card-pip" aria-hidden="true">${v}<i>${_POKER_SUITS[i % 4]}</i></span>
                                <span class="poker-card-val">${v}</span>
                                <span class="poker-card-pip poker-card-pip--end" aria-hidden="true">${v}<i>${_POKER_SUITS[i % 4]}</i></span>
                                ${isSelected ? '<span class="poker-card-check">✓</span>' : ''}
                            </button>`;
                        }).join('')}
                    </div>

                    <!-- Compteur + actions -->
                    <div class="poker-progress-row">
                        <div class="poker-progress-bar-wrap">
                            <div class="poker-progress-bar" style="width:${votes.length ? Math.round(hasVoted / votes.length * 100) : 0}%"></div>
                        </div>
                        <span class="poker-progress-label">${hasVoted}/${votes.length} ont voté</span>
                    </div>

                    <div class="poker-actions-row">
                        <button class="btn btn-sm ${revealed ? 'btn-secondary' : 'btn-primary'}" id="poker-reveal"
                                ${votes.length === 0 ? 'disabled' : ''}
                                title="${revealed ? 'Relancer un tour' : hasVoted < votes.length ? 'Tout le monde n\'a pas voté — révéler quand même ?' : 'Révéler tous les votes'}">
                            ${revealed ? '🔄 Nouveau tour' : '👁 Révéler'}
                            ${!revealed && hasVoted > 0 && hasVoted < votes.length ? `<span class="poker-reveal-warn">⚠ ${votes.length - hasVoted} manquant${votes.length - hasVoted > 1 ? 's' : ''}</span>` : ''}
                        </button>
                        <button class="btn btn-sm btn-ghost" id="poker-reset" title="Remettre à zéro">🗑</button>
                    </div>
                </div>

                <!-- Colonne droite : participants + résultats -->
                <div class="poker-results-section">
                    <div class="poker-voters-label">
                        Participants
                        ${votes.length === 0 ? '' : `<span class="poker-voters-count">${votes.length}</span>`}
                    </div>

                    <!-- Avatars participants -->
                    <div class="poker-avatars">
                        ${votes.length === 0
                            ? `<div class="poker-empty">Personne n'a encore rejoint…</div>`
                            : votes.map((v, vi) => {
                                const hasVal = v.val !== null;
                                const color  = _pokerColor(v.name);
                                const showVal = revealed && hasVal;
                                return `<div class="poker-voter${v.me ? ' poker-voter--me' : ''}${!hasVal ? ' poker-voter--waiting' : ''}${revealAnim && showVal ? ' poker-voter--flip' : ''}" style="--i:${votes.slice(0, vi).filter(x => x.val !== null).length}">
                                    <div class="poker-voter-avatar" style="background:${color}">
                                        ${showVal
                                            ? `<span class="poker-voter-val">${v.val}</span>`
                                            : hasVal
                                                ? `<span class="poker-voter-voted">✓</span>`
                                                : `<span class="poker-voter-waiting">…</span>`}
                                    </div>
                                    <span class="poker-voter-name">${esc(v.name)}${v.me ? ' (moi)' : ''}</span>
                                    ${v.me ? `<button class="poker-vote-rm" title="Quitter">×</button>` : ''}
                                </div>`;
                            }).join('')}
                    </div>

                    <!-- Stats + distribution + consensus (après révélation) -->
                    ${revealed && numVotes.length >= 2 ? `
                    <div class="poker-stats${revealAnim ? ' poker-reveal-in' : ''}" style="--reveal-delay:${revealDelay}">
                        <div class="poker-stat">
                            <span class="poker-stat-lbl">Moy.</span>
                            <span class="poker-stat-val">${avg.toFixed(1)}</span>
                        </div>
                        <div class="poker-stat">
                            <span class="poker-stat-lbl">Min</span>
                            <span class="poker-stat-val poker-stat--low">${min}</span>
                        </div>
                        <div class="poker-stat">
                            <span class="poker-stat-lbl">Max</span>
                            <span class="poker-stat-val poker-stat--high">${max}</span>
                        </div>
                        <div class="poker-stat${std >= 4 ? ' poker-stat-block--warn' : ''}">
                            <span class="poker-stat-lbl">Écart</span>
                            <span class="poker-stat-val${std >= 4 ? ' poker-stat--warn' : ''}"
                                  title="${std >= 4 ? 'Fort désaccord — discussion recommandée !' : 'Écart-type'}">
                                ${std.toFixed(1)}${std >= 4 ? '⚠️' : ''}
                            </span>
                        </div>
                    </div>
                    <div class="poker-distrib${revealAnim ? ' poker-reveal-in' : ''}" style="--reveal-delay:${revealDelay}">
                        ${_pokerNums().filter(f => numVotes.some(v => v.val === f)).map(f => {
                            const count = numVotes.filter(v => v.val === f).length;
                            const pct   = Math.round(count / numVotes.length * 100);
                            const isNearest = f === nearest;
                            return `<div class="poker-distrib-row${isNearest ? ' poker-distrib-row--nearest' : ''}">
                                <span class="poker-distrib-lbl">${f}</span>
                                <div class="poker-distrib-bar-wrap">
                                    <div class="poker-distrib-bar" style="width:${pct}%"></div>
                                </div>
                                <span class="poker-distrib-n">${count}×</span>
                                ${isNearest ? '<span class="poker-distrib-star">★</span>' : ''}
                            </div>`;
                        }).join('')}
                    </div>` : revealed && numVotes.length === 1 ? `
                    <div class="poker-empty">1 seul vote numérique — attendez les autres.</div>` : ''}
                </div>
            </div>

            <!-- Footer : sauvegarde -->
            ${revealed && nearest !== null ? `
            <div class="poker-footer${revealAnim ? ' poker-reveal-in' : ''}" style="--reveal-delay:${revealDelay}">
                <!-- Valeur à enregistrer : la suite de Fibonacci SEULEMENT (plus de saisie libre « 4 » ou « 7 ») -->
                <div class="poker-save-row">
                    <div class="poker-save-head">
                        <span class="poker-save-label">Valeur à enregistrer</span>
                        <span class="poker-save-hint">★ consensus <b>${nearest}</b>${Number(ticket.points) > 0 ? ` · actuellement ${Number(ticket.points)} pts` : ' · pas encore estimé'}</span>
                    </div>
                    <div class="poker-save-pick" role="radiogroup" aria-label="Valeur à enregistrer">
                        ${_pokerNums().map(f => {
                            const n = numVotes.filter(v => v.val === f).length;
                            return `<button type="button" role="radio" aria-checked="${f === picked}" data-save-pts="${f}"
                                    class="poker-save-chip pts-tone--${pointsTone(f).key}${f === picked ? ' is-on' : ''}${f === nearest ? ' is-nearest' : ''}"
                                    title="${f} pts${n ? ` — ${n} vote${n > 1 ? 's' : ''}` : ''}${f === nearest ? ' · consensus' : ''}">
                                <span class="poker-save-chip-val">${f}</span>
                                <span class="poker-save-chip-n" aria-hidden="true">${'•'.repeat(Math.min(n, 5))}</span>
                                ${f === nearest ? '<span class="poker-save-chip-star" aria-hidden="true">★</span>' : ''}
                            </button>`;
                        }).join('')}
                    </div>
                    <div class="poker-save-actions">
                        <button class="btn btn-primary poker-save-btn" id="poker-save">
                            <svg class="icon icon-sm"><use href="#i-check"/></svg>
                            Enregistrer <b class="poker-save-val">${picked} pts</b>
                        </button>
                        ${queue.length ? `<button class="btn btn-secondary poker-save-next" id="poker-save-next" title="Enregistrer puis estimer ${esc(queue[0].id)}">Enregistrer &amp; suivant ⏭</button>` : ''}
                    </div>
                </div>
                ${std >= 4 ? `<div class="poker-save-warn">⚠️ Fort désaccord (σ ${std.toFixed(1)}) — pensez à en discuter d'abord.</div>` : ''}
            </div>` : ''}

            <!-- Tickets de référence : un ticket livré typique par taille, pour se caler -->
            ${_pokerRefsHtml(_refs, { open: _refsOpen, mine: typeof meVote?.val === 'number' ? meVote.val : null, nearest: revealed ? nearest : null, current: Number(ticket.points) || null, picking: _refsPick })}
        </div>

        <!-- Volet latéral « Description » : onglet vertical replié, panneau condensé déplié -->
        <aside class="poker-desc${_descOpen ? ' is-open' : ''}" aria-label="Description du ticket">
            <button type="button" class="poker-desc-tab" id="poker-desc-toggle" aria-expanded="${_descOpen}" aria-controls="poker-desc-panel"
                    title="${_descOpen ? 'Replier la description' : 'Afficher la description du ticket'}">
                <span class="poker-desc-tab-chev" aria-hidden="true">${_descOpen ? '›' : '‹'}</span>
                <span class="poker-desc-tab-lbl">📄 Description${!_descHtml ? ' · vide' : _descHasAccept ? ' · ✅' : ''}</span>
            </button>
            <div class="poker-desc-panel" id="poker-desc-panel">
                <div class="poker-desc-head">
                    <span class="poker-desc-title">📄 Description</span>
                    <span class="poker-desc-meta">${_descMeta}</span>
                    ${_descExtra ? `<div class="poker-desc-extra">${_descExtra}</div>` : ''}
                </div>
                <div class="poker-desc-body adf-body">${!_descHtml
                    ? emptyStateHtml({ icon: '📝', title: 'Pas de description', text: 'Le ticket n\'a pas de description dans JIRA — à préciser avant d\'estimer ?' })
                    : _descPinned.length
                        ? `${descSectionsHtml(_descPinned, esc, _pdClosed)}
                           <details class="pd-full"${_pdFullOpen ? ' open' : ''}><summary>📄 Description complète</summary><div class="pd-full-body">${_descHtml}</div></details>`
                        : `${!_descHasAccept ? '<p class="pd-hint">ℹ️ Aucun critère d\'acceptation repéré dans la description.</p>' : ''}${_descHtml}`}</div>
            </div>
        </aside>
        </div>`;
        const descBody = ov.querySelector('.poker-desc-body');
        if (descBody && descScroll) descBody.scrollTop = descScroll;

        // ── Listeners ───────────────────────────────────────────────────────
        ov.querySelector('#poker-close').addEventListener('click', close);
        // État replié / déplié des sections, gardé entre deux re-rendus (« toggle » ne remonte pas : capture)
        ov.querySelector('.poker-desc-body')?.addEventListener('toggle', e => {
            const d = e.target;
            if (d.matches?.('[data-pd-sec]')) { const i = Number(d.dataset.pdSec); if (d.open) _pdClosed.delete(i); else _pdClosed.add(i); }
            else if (d.matches?.('.pd-full')) _pdFullOpen = d.open;
        }, true);

        // Puces « L'essentiel » : déplier la section visée et y défiler (dans le volet seulement)
        ov.querySelector('.pd-nav')?.addEventListener('click', e => {
            const chip = e.target.closest('[data-pd-go]');
            const sec = chip && ov.querySelector(`[data-pd-sec="${chip.dataset.pdGo}"]`);
            if (!sec) return;
            sec.open = true;
            const body = ov.querySelector('.poker-desc-body');
            body.scrollTo({ top: sec.offsetTop - body.offsetTop - 8, behavior: 'smooth' });
        });
        ov.querySelector('#poker-desc-toggle')?.addEventListener('click', e => {
            _descOpen = !_descOpen;
            try { localStorage.setItem('sb-poker-desc', _descOpen ? 'open' : 'closed'); } catch { /* navigation privée */ }
            const aside = ov.querySelector('.poker-desc'), btn = e.currentTarget;
            aside.classList.toggle('is-open', _descOpen);
            btn.setAttribute('aria-expanded', String(_descOpen));
            btn.title = _descOpen ? 'Replier la description' : 'Afficher la description du ticket';
            btn.querySelector('.poker-desc-tab-chev').textContent = _descOpen ? '›' : '‹';
        });
        ov.querySelector('#poker-refs-toggle')?.addEventListener('click', () => {
            _refsOpen = !_refsOpen;
            try { localStorage.setItem('sb-poker-refs', _refsOpen ? 'open' : 'closed'); } catch { /* navigation privée */ }
            render();
        });
        // Référence d'équipe : déplier les candidats d'une taille, en choisir un, ou revenir à l'auto.
        ov.querySelector('.poker-refs-table')?.addEventListener('click', async e => {
            const pick = e.target.closest('[data-ref-pick]');
            if (pick) { const v = Number(pick.dataset.refPick); _refsPick = _refsPick === v ? null : v; render(); return; }
            const choose = e.target.closest('[data-ref-choose]'), unpin = e.target.closest('[data-ref-unpin]');
            if (!choose && !unpin) return;
            const v = Number((choose || unpin).dataset.refChoose || unpin?.dataset.refUnpin);
            try {
                const res = await api.setPokerReference(ticket.team, v, choose ? choose.dataset.refId : null);
                const pi = store.get('piInfo');
                if (pi) pi.pokerReferences = res.pokerReferences || {};
                _refs = _pokerReferences(ticket);
                _refsPick = null;
                toast(choose ? `📌 ${choose.dataset.refId} = référence ${v} pts pour ${ticket.team}` : `${v} pts : retour au choix automatique`, 'success');
                render();
            } catch (err) { toast(err.message, 'error'); }
        });
        ov.addEventListener('click', e => { if (e.target === ov) close(); });

        // Partager le lien
        ov.querySelector('#poker-share')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(shareUrl);
                const btn = ov.querySelector('#poker-share');
                btn.innerHTML = `<svg class="icon icon-sm"><use href="#i-check"/></svg> Copié !`;
                setTimeout(() => {
                    btn.innerHTML = `<svg class="icon icon-sm"><use href="#i-copy"/></svg> Partager`;
                }, 1800);
            } catch { toast('Copie impossible', 'error'); }
        });

        // Formulaire identité — purement local (on n'apparaît côté serveur qu'au 1er vote)
        ov.querySelector('#poker-identity-form')?.addEventListener('submit', e => {
            e.preventDefault();
            const name = ov.querySelector('#poker-voter-name')?.value.trim();
            if (!name) return;
            localStorage.setItem('sb-poker-myname', name);
            render();
        });

        // Sons : bascule (le clic est le geste qui autorise l'audio) + aperçu à l'activation
        ov.querySelector('#poker-sound')?.addEventListener('click', () => {
            const on = !pokerSoundOn();
            setPokerSound(on);
            if (on) playPokerSound('flip');
            render();
        });

        // Changer de nom
        ov.querySelector('#poker-change-name')?.addEventListener('click', () => {
            localStorage.removeItem('sb-poker-myname');
            render();
        });

        _justPicked = null;   // le « pop » ne vaut que pour CE rendu

        // Sélection carte → vote serveur (upsert), puis refresh. Retour visuel IMMÉDIAT (carte levée)
        // sans attendre le réseau. Sans prénom : amène au champ prénom, avec un petit coup de coude.
        ov.querySelectorAll('.poker-card:not([disabled])').forEach(card => {
            card.addEventListener('click', async () => {
                const name = localStorage.getItem('sb-poker-myname');
                if (!name) {
                    const form = ov.querySelector('#poker-identity-form');
                    form?.classList.remove('is-nudge'); void form?.offsetWidth; form?.classList.add('is-nudge');
                    ov.querySelector('#poker-voter-name')?.focus();
                    return;
                }
                ov.querySelectorAll('.poker-card--pending').forEach(c => c.classList.remove('poker-card--pending'));
                card.classList.add('poker-card--pending');
                const raw = card.dataset.val;
                _justPicked = raw === '?' || raw === '☕' ? raw : Number(raw);
                playPokerSound('flip');
                try { await api.pokerVote(ticket.id, name, String(raw)); await refresh(); }
                catch (e) { _justPicked = null; card.classList.remove('poker-card--pending'); toast(e.message, 'error'); }
            });
        });

        // Révéler / Nouveau tour
        ov.querySelector('#poker-reveal')?.addEventListener('click', async () => {
            const allRevealed = votes.length > 0 && votes.every(v => v.revealed);
            try {
                // Nouveau tour (déjà révélé) = reset des votes ; sinon on révèle tout.
                if (allRevealed) await api.pokerReset(ticket.id);
                else await api.pokerReveal(ticket.id);
                await refresh();
            } catch (e) { toast(e.message, 'error'); }
        });

        // Reset complet
        ov.querySelector('#poker-reset')?.addEventListener('click', async () => {
            try { await api.pokerReset(ticket.id); await refresh(); }
            catch (e) { toast(e.message, 'error'); }
        });

        // Quitter : retire mon vote côté serveur + oublie mon identité locale.
        ov.querySelectorAll('.poker-vote-rm').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = localStorage.getItem('sb-poker-myname');
                localStorage.removeItem('sb-poker-myname');
                try { if (name) await api.pokerLeave(ticket.id, name); await refresh(); }
                catch (e) { toast(e.message, 'error'); render(); }
            });
        });

        // Passer à un autre ticket sans quitter le Poker : rouvre la modale du ticket puis SA popin
        // (le bouton 🃏 de la modale porte le bon `apiSave` et pose /poker dans l'URL).
        const goTo = id => {
            clearInterval(_pollTimer);
            if (location.hash.endsWith('/poker')) history.replaceState(null, '', location.hash.replace(/\/poker$/, ''));
            ov.remove();
            openTicketModal(id);
            requestAnimationFrame(() => document.getElementById('mdl-poker-btn')?.click());
        };
        ov.querySelector('#poker-playlist-x')?.addEventListener('click', () => { clearPokerPlaylist(); render(); });
        ov.querySelector('#poker-next')?.addEventListener('click', () => {
            const nx = _nextToEstimate(ticket)[0];
            if (nx) goTo(nx.id);
        });

        // Sauvegarder la valeur retenue : trace du tour (historique du ticket), points, puis reset
        // de la session de vote. La trace ne bloque pas : un échec est signalé, les points passent.
        // Choix de la valeur : mise à jour EN PLACE (un re-rendu rejouerait la révélation animée)
        ov.querySelector('.poker-save-pick')?.addEventListener('click', e => {
            const chip = e.target.closest('[data-save-pts]');
            if (!chip) return;
            _savePick = Number(chip.dataset.savePts);
            ov.querySelectorAll('[data-save-pts]').forEach(c => {
                const on = c === chip;
                c.classList.toggle('is-on', on);
                c.setAttribute('aria-checked', String(on));
            });
            const lbl = ov.querySelector('.poker-save-val');
            if (lbl) lbl.textContent = `${_savePick} pts`;
        });

        const saveRound = async (goNext) => {
            const pts = _savePick ?? nearest;
            if (!_pokerNums().includes(pts)) return;
            const btn = ov.querySelector(goNext ? '#poker-save-next' : '#poker-save');
            ov.querySelectorAll('#poker-save, #poker-save-next').forEach(b => { b.disabled = true; });
            flyPokerChip(ov, pts);   // le jeton part au pot DÈS le clic (clone sur body : survit à la suite)
            try {
                const cast = votes.filter(v => v.val !== null).map(v => ({ voter: v.name, value: String(v.val) }));
                await api.savePokerRound(ticket.id, { value: pts, votes: cast, author: myName, team: ticket.team || '' })
                    .catch(e => toast((e?.status === 404 || e?.status === 405)
                        ? 'Tour non archivé : le serveur tourne sur une version plus ancienne que la page — redémarrez-le (Ctrl+C puis python main.py). Les points, eux, sont enregistrés.'
                        : `Tour non archivé dans l'historique : ${e.message}`, 'warning', 9000));
                await apiSave({ points: pts });
                await api.pokerReset(ticket.id);
                btn.innerHTML = `<svg class="icon icon-sm"><use href="#i-check"/></svg> Enregistré !`;
                toast(`Story Points mis à jour : ${pts} SP`, 'success');
                const nx = goNext ? _nextToEstimate(ticket)[0] : null;
                setTimeout(() => {
                    if (nx) goTo(nx.id);
                    else { close(); openTicketModal(ticket.id); }
                }, 900);   // laisse le jeton se poser au centre de la table
            } catch (e) {
                toast(e.message, 'error');
                ov.querySelectorAll('#poker-save, #poker-save-next').forEach(b => { b.disabled = false; });
            }
        };
        ov.querySelector('#poker-save')?.addEventListener('click', () => saveRound(false));
        ov.querySelector('#poker-save-next')?.addEventListener('click', () => saveRound(true));
    };

    // Rendu initial immédiat (état vide) puis 1er fetch, enfin polling live (~3 s).
    render();
    refresh();
    _pollTimer = setInterval(() => {
        // Ne pas ré-écraser pendant que l'utilisateur saisit (nom ou valeur à enregistrer)
        const ae = document.activeElement;
        // Pendant une animation (distribution des cartes, révélation), PAS de re-rendu : le DOM serait
        // reconstruit et l'animation rejouée (la révélation paraissait arriver deux fois). Les données
        // sont tout de même mises à jour ; le rendu suivant, hors fenêtre, retombe sur l'état final.
        const animating = Date.now() < Math.max(_revealUntil, _dealUntil);
        if (animating || (ae && ov.contains(ae) && ae.id === 'poker-voter-name')) {
            refresh(false);   // met à jour les données sans re-render
        } else {
            refresh();
        }
    }, 3000);
}

// Arrow keys for modal navigation
document.addEventListener('keydown', e => {
    if (overlay()?.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft' && _modalIdx > 0) { e.preventDefault(); openTicketModal(_modalList[_modalIdx - 1].id); }
    if (e.key === 'ArrowRight' && _modalIdx < _modalList.length - 1) { e.preventDefault(); openTicketModal(_modalList[_modalIdx + 1].id); }
});
