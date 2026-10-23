/**
 * 🗳 Page PI → onglets Mood / Fist : votes de l'équipe par sprint, confettis du consensus.
 *
 * Extrait de pi.js (3.258.0), code déplacé à l'identique. N'importe jamais pi.js (pas de cycle).
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, confirmDanger, getCurrentPi } from '../utils.js';
import { buildMoodSlackRaw, buildFistSlackRaw, wireSlackCopy, FIST_SCALE, SONDAGE_INTRO } from '../components/sondage.js';
import { VOTE_KINDS, toastUndo } from '../utils.js';
import { updateInfoPanel } from '../components/infopanel.js';

// ── Confettis consensus parfait (#11) ─────────────────────────────────────────
function _launchConfetti(anchor) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const rect = anchor?.getBoundingClientRect?.() || { left: canvas.width / 2, top: canvas.height / 2, width: 0, height: 0 };
    const ox = rect.left + rect.width / 2;
    const oy = rect.top + rect.height / 2;

    const COLORS = ['#f59e0b', '#22c55e', '#6366f1', '#ec4899', '#38bdf8', '#a855f7'];
    const particles = Array.from({ length: 80 }, () => ({
        x: ox, y: oy,
        vx: (Math.random() - 0.5) * 10,
        vy: -(Math.random() * 8 + 4),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        r: Math.random() * 5 + 3,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.2,
        gravity: 0.25,
        alpha: 1,
    }));

    const start = performance.now();
    function frame(now) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const elapsed = now - start;
        for (const p of particles) {
            p.x  += p.vx;  p.y += p.vy;  p.vy += p.gravity;
            p.rot += p.rotV;
            p.alpha = Math.max(0, 1 - elapsed / 2200);
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
            ctx.restore();
        }
        if (elapsed < 2500) requestAnimationFrame(frame);
        else canvas.remove();
    }
    requestAnimationFrame(frame);
}

// ── Mood / ROTI et Fist of Five : échelles = VOTE_KINDS (utils/vote-kinds.js), les MÊMES emojis que la
// Santé et le vote rapide de l'info-panel (la page PI avait sa propre échelle Mood 😡😟😐🙂😄).
const _voteScale = kind => VOTE_KINDS[kind].emojis.map((label, i) => ({ value: i + 1, label, desc: VOTE_KINDS[kind].scale[i] }));

export function renderMood(el, { teams }) {
    renderVotingPanel(el, 'mood', 'Mood / ROTI', teams, _voteScale('mood'));
}

export function renderFist(el, { teams, objectives = [] }) {
    renderVotingPanel(el, 'fist', 'Fist of Five (confiance)', teams, _voteScale('fist'), objectives);
}

// Re-synchronise le store global (moodVotes/fistVotes) après un vote/suppression dans le
// panneau de vote — sinon seule la vue locale (refreshResults, re-fetch direct) est à jour ;
// le panneau latéral (infopanel.js) et les cellules mood de Health restent sur l'instantané
// chargé au démarrage et affichent "Aucun vote" malgré des votes existants.
async function _syncGlobalVoteStore(type) {
    if (type !== 'mood' && type !== 'fist') return; // seuls ces 2 types sont mis en store
    try {
        const all = await api.getMood({ type });
        store.set(type === 'fist' ? 'fistVotes' : 'moodVotes', all);
        // store.set seul ne réaffiche pas le panneau latéral (pas d'abonnement dédié) — on
        // rafraîchit juste l'info panel, pas toute la vue PI (sinon on perdrait l'état du
        // panneau de vote qu'on vient d'utiliser).
        updateInfoPanel();
    } catch { /* best-effort — la vue locale reste correcte via refreshResults() */ }
}

async function renderVotingPanel(el, type, title, teams, scale, objectives = []) {
    // ── Config centralisée Sprint + PI (voir <!-- ═══ Sprint + PI Config ═══ -->) ──
    const sprintInfo    = store.get('sprintInfo');
    const piInfo        = store.get('piInfo');
    // getCurrentPi (sprint actif > piInfo.number) — évite un piSprint enregistré en "S1"
    // générique qui ne matchera plus jamais le label "NN.N" affiché ailleurs (panneau
    // latéral, résultats du sondage).
    const _basePiNum    = getCurrentPi({ sprintInfo, piInfo }) || 0;
    const _piOff        = store.get('piOffset') || 0;
    const piNum         = _basePiNum ? Math.max(1, _basePiNum + _piOff) : '';
    const _piCfgLocalBu = (() => { try { return JSON.parse(localStorage.getItem(`pi-cfg-${piNum}`) || 'null'); } catch { return null; } })();
    const sprintsCnt    = _piCfgLocalBu?.sprintsPerPI || piInfo?.sprintsPerPI || 0;
    const defaultSprint = (sprintInfo?.name || '').match(/(\d+\.\d+)/)?.[1] || '';
    const currentTeam   = store.get('team');
    const teamObjects   = store.get('teamObjects') || [];

    // Génère la liste des sprints depuis la config PI (même logique que settings.js)
    const piSprints = sprintsCnt > 0
        ? [...Array(sprintsCnt)].map((_, i) => piNum ? `${piNum}.${i + 1}` : `S${i + 1}`)
        : [];

    // ── Formulaire (rendu une seule fois) ─────────────────────────────────────
    // Même grammaire que le vote rapide de l'info-panel (components/panel_votes.js) : chaque clic AJOUTE
    // un vote (recueil de toute l'équipe depuis un poste), compteur par valeur pour l'équipe choisie,
    // × au survol = retire le DERNIER vote de cette valeur (suppression différée, « Annuler »).
    const kindDef = VOTE_KINDS[type] || { icon: '🗳️', what: '' };
    el.innerHTML = `
        <div class="card vp-card mb-4">
            <div class="vp-head">
                <div class="vp-title">
                    <span class="vp-ico" aria-hidden="true">${kindDef.icon}</span>
                    <div><b>${esc(title)}</b>${kindDef.what ? `<small>${esc(kindDef.what)}</small>` : ''}</div>
                </div>
                <div class="vp-actions">
                    <button class="btn btn-secondary btn-xs btn-copy-vote-slack" title="Copier l'invitation au vote pour Slack">📋 Copier Slack</button>
                    <button aria-label="À quoi sert ce vote ?" class="btn btn-icon btn-xs btn-vote-help" title="À quoi sert ce vote ?">❓</button>
                </div>
            </div>
            <div class="vp-ctx">
                <label class="vp-field">
                    <span class="vp-field-lbl">Équipe</span>
                    <select class="select" id="vote-team">
                        ${teams.map(t => `<option value="${esc(t)}"${t === currentTeam ? ' selected' : ''}>${esc(t)}</option>`).join('')}
                    </select>
                </label>
                <div class="vp-field">
                    <span class="vp-field-lbl">Sprint</span>
                    ${piSprints.length
                        ? `<div class="vp-sprints" role="radiogroup" aria-label="Sprint">
                               ${['', ...piSprints].map(sp => `<button type="button" role="radio" class="vp-sprint${sp === defaultSprint ? ' is-on' : ''}" data-vp-sprint="${esc(sp)}" aria-checked="${sp === defaultSprint}">${sp ? esc(sp) : 'Tous'}</button>`).join('')}
                           </div>
                           <input type="hidden" id="vote-sprint" value="${esc(defaultSprint)}">`
                        : `<input class="input" id="vote-sprint" value="${esc(defaultSprint)}" placeholder="Sprint…">`}
                </div>
                <label class="vp-field vp-field--note">
                    <span class="vp-field-lbl">Note <small>(optionnel)</small></span>
                    <input class="input" id="vote-note" placeholder="Commentaire…">
                </label>
            </div>
            <div class="vp-btns" aria-label="Ajouter un vote">
                ${scale.map(s => `<span class="vp-cell">
                    <button type="button" class="vote-btn vp-btn" data-value="${s.value}" title="${esc(s.desc)} (${s.value}) · clic = +1 vote">
                        <span class="vp-emo">${s.label}</span>
                        <span class="vp-lbl">${esc(s.desc)}</span>
                        <span class="vp-val">${s.value}</span>
                        <span class="vp-n" hidden></span>
                    </button>
                    <button type="button" class="vp-del" data-vp-del="${s.value}" title="Retirer le dernier vote ${s.label}" aria-label="Retirer un vote ${esc(s.desc)}" hidden>×</button>
                </span>`).join('')}
            </div>
            <p class="vp-hint">Chaque clic ajoute un vote pour l'équipe et le sprint choisis · × retire le dernier de cette valeur</p>
        </div>

        <!-- Résultats (zone rafraîchie indépendamment) -->
        <div id="vote-results"></div>
    `;

    // Suppressions en attente (« Annuler » possible) : exclues des résultats tant qu'elles ne sont pas confirmées
    const _pendingDel = new Set();
    let lastFiltered = [];

    // Compteurs par valeur de l'équipe choisie, sur les cartes de vote (et × si au moins un vote)
    function paintBtnCounts() {
        const teamSel = el.querySelector('#vote-team')?.value;
        el.querySelectorAll('.vp-cell').forEach(cell => {
            const v = Number(cell.querySelector('.vp-btn').dataset.value);
            const n = lastFiltered.filter(x => x.team === teamSel && x.value === v).length;
            const badge = cell.querySelector('.vp-n'), del = cell.querySelector('.vp-del');
            badge.hidden = !n; badge.textContent = n || '';
            cell.classList.toggle('has-votes', !!n);
            del.hidden = !n || !(el.querySelector('#vote-sprint')?.value.trim());
        });
    }

    let lastResults = null;

    // Rafraîchit uniquement la zone résultats selon le sprint sélectionné
    async function refreshResults() {
        const sprint  = el.querySelector('#vote-sprint')?.value.trim() || '';
        const allVotes = await api.getMood({ type });
        const live = allVotes.filter(v => !_pendingDel.has(v.id));
        const filtered = sprint ? live.filter(v => (v.piSprint || '') === sprint) : live;
        lastFiltered = filtered;
        paintBtnCounts();

        const byTeam = {};
        for (const v of filtered) {
            if (!byTeam[v.team]) byTeam[v.team] = [];
            byTeam[v.team].push(v);
        }
        const teamAvgs = teams.map(t => {
            const votes = byTeam[t] || [];
            const avg = votes.length ? votes.reduce((s, v) => s + v.value, 0) / votes.length : 0;
            const color = teamObjects.find(o => (o.name || o) === t)?.color || 'var(--primary)';
            return { name: t, avg: Math.round(avg * 10) / 10, count: votes.length, votes, color };
        });
        const globalVotes = filtered.length;
        const globalAvg   = globalVotes
            ? Math.round(filtered.reduce((s, v) => s + v.value, 0) / globalVotes * 10) / 10
            : 0;

        lastResults = { teamAvgs, globalVotes, globalAvg, sprint };

        const resultsEl = el.querySelector('#vote-results');
        if (!resultsEl) return;

        const tone  = avg => (avg >= 4 ? 'var(--success)' : avg >= 3 ? 'var(--warning)' : avg ? 'var(--danger)' : 'var(--text-muted)');
        const face  = avg => (scale.find(s => s.value === Math.round(avg)) || scale[scale.length - 1]).label;
        const segBg = v => (v >= 4 ? 'var(--success)' : v >= 3 ? 'var(--warning)' : 'var(--danger)');
        const distrib = votes => scale.map(s => {
            const cnt = votes.filter(v => v.value === s.value).length;
            return cnt ? `<span class="vr-seg" style="flex:${cnt};background:${segBg(s.value)}" title="${esc(s.label)} ${esc(s.desc)} : ${cnt}"></span>` : '';
        }).join('');
        const teamSel = el.querySelector('#vote-team')?.value;
        const voted = teamAvgs.filter(t => t.count), empty = teamAvgs.filter(t => !t.count);
        resultsEl.innerHTML = `
            <div class="card vr-card">
                <div class="vr-top">
                    ${globalVotes
                        ? `<div class="vr-global">
                               <span class="vr-global-emo">${face(globalAvg)}</span>
                               <span class="vr-global-score" style="color:${tone(globalAvg)}">${String(globalAvg).replace('.', ',')}<small>/5</small></span>
                           </div>
                           <div class="vr-global-meta">
                               <b>Moyenne du train</b>
                               <span>${globalVotes} vote${globalVotes !== 1 ? 's' : ''} · ${voted.length} équipe${voted.length > 1 ? 's' : ''}${sprint ? ` · sprint ${esc(sprint)}` : ' · tous les sprints'}</span>
                               <span class="vr-distrib vr-distrib--global">${distrib(filtered)}</span>
                           </div>`
                        : `<div class="vr-global-meta"><b>Aucun vote</b><span>${sprint ? `pour le sprint ${esc(sprint)}` : 'sur ce PI'} — le premier clic lance le recueil.</span></div>`}
                </div>
                ${voted.length ? `<div class="vr-grid">
                    ${voted.map(t => `
                    <div class="vr-team${t.name === teamSel ? ' is-current' : ''}" data-vr-team="${esc(t.name)}" title="Cliquer pour voter pour ${esc(t.name)}">
                        <div class="vr-team-head">
                            <span class="vr-dot" style="background:${t.color}"></span>
                            <span class="vr-name">${esc(t.name)}</span>
                            <button class="vr-del vote-del-team" data-team="${esc(t.name)}" title="Supprimer les votes de ${esc(t.name)}${sprint ? ` (sprint ${esc(sprint)})` : ''}">🗑</button>
                        </div>
                        <div class="vr-team-score">
                            <span class="vr-emoji">${face(t.avg)}</span>
                            <span class="vr-val" style="color:${tone(t.avg)}">${String(t.avg).replace('.', ',')}</span><span class="vr-unit">/5</span>
                            <span class="vr-count">${t.count} vote${t.count > 1 ? 's' : ''}</span>
                        </div>
                        <div class="vr-distrib">${distrib(t.votes)}</div>
                    </div>`).join('')}
                </div>` : ''}
                ${empty.length ? `<div class="vr-empty">
                    <span class="vr-empty-lbl">Sans vote${sprint ? ` en ${esc(sprint)}` : ''} :</span>
                    ${empty.map(t => `<button type="button" class="vr-empty-team${t.name === teamSel ? ' is-current' : ''}" data-vr-team="${esc(t.name)}" title="Voter pour ${esc(t.name)}"><span class="vr-dot" style="background:${t.color}"></span>${esc(t.name)}</button>`).join('')}
                </div>` : ''}
            </div>
        `;

        // Clic sur une équipe (carte ou pastille « sans vote ») → la sélectionner pour voter
        resultsEl.querySelectorAll('[data-vr-team]').forEach(card => {
            card.addEventListener('click', e => {
                if (e.target.closest('.vote-del-team')) return;
                const sel = el.querySelector('#vote-team');
                if (sel) { sel.value = card.dataset.vrTeam; sel.dispatchEvent(new Event('change')); }
                el.querySelector('.vp-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });

        // Boutons suppression par équipe
        resultsEl.querySelectorAll('.vote-del-team').forEach(btn => {
            btn.addEventListener('click', async () => {
                const teamName = btn.dataset.team;
                const sprint   = el.querySelector('#vote-sprint')?.value.trim() || '';
                const allV     = await api.getMood({ type });
                const toDelete = allV.filter(v =>
                    v.team === teamName && (sprint ? (v.piSprint || '') === sprint : true)
                );
                if (!toDelete.length) { toast('Aucun vote à supprimer', 'info'); return; }
                const label = sprint ? `${teamName} / ${sprint}` : teamName;
                if (!(await confirmDanger('Supprimer les votes', `Supprimer ${toDelete.length} ${toDelete.length > 1 ? 'votes' : 'vote'} pour ${label} ?`, { confirmLabel: 'Supprimer' }))) return;
                await Promise.all(toDelete.map(v => api.deleteMood(v.id)));
                toast(`${toDelete.length} ${toDelete.length > 1 ? 'votes' : 'vote'} ${toDelete.length > 1 ? 'supprimés' : 'supprimé'}`, 'success');
                refreshResults();
                _syncGlobalVoteStore(type);
            });
        });

        // Confettis sur consensus parfait (#11)
        if (globalVotes >= 2 && filtered.length >= 2) {
            const vals = filtered.map(v => v.value);
            const allSame = vals.every(v => v === vals[0]);
            const isPositive = vals[0] >= 4;
            if (allSame && isPositive) _launchConfetti(resultsEl);
        }
    }

    // Active / désactive les boutons de vote selon le sprint sélectionné
    function syncVoteBtns() {
        const sprint = el.querySelector('#vote-sprint')?.value.trim() || '';
        const noSprint = !sprint;
        el.querySelectorAll('.vote-btn').forEach(btn => { btn.disabled = noSprint; });
        paintBtnCounts();
        let hint = el.querySelector('.vote-sprint-hint');
        if (noSprint) {
            if (!hint) {
                hint = document.createElement('p');
                hint.className = 'vote-sprint-hint vp-hint vp-hint--warn';
                el.querySelector('.vp-btns')?.insertAdjacentElement('afterend', hint);
            }
            hint.textContent = 'Sélectionnez un sprint pour pouvoir voter.';
        } else {
            hint?.remove();
        }
    }

    // ── Listeners formulaire ───────────────────────────────────────────────────

    // Vote : ne pas réinitialiser les champs, juste rafraîchir les résultats
    el.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const sprint  = el.querySelector('#vote-sprint')?.value.trim() || '';
            if (!sprint) return; // garde (bouton devrait déjà être disabled)
            const teamVal = el.querySelector('#vote-team')?.value;
            const note    = el.querySelector('#vote-note')?.value || '';
            if (!teamVal) { toast('Sélectionnez une équipe', 'warning'); return; }
            btn.disabled = true;
            btn.classList.remove('is-pop'); void btn.offsetWidth; btn.classList.add('is-pop');
            try {
                const val = parseInt(btn.dataset.value);
                await api.createMood({ type, team: teamVal, value: val, piSprint: sprint, note });
                await refreshResults();
                const n = lastFiltered.filter(v => v.team === teamVal).length;
                const sc = scale.find(x => x.value === val);
                toast(`${teamVal} : +1 ${sc?.label || ''} ${sc?.desc || ''} (${n} vote${n > 1 ? 's' : ''})`, 'success', 1800);
                await _syncGlobalVoteStore(type);
            } catch (e) {
                toast(e.message, 'error');
            } finally {
                syncVoteBtns(); // restaure l'état disabled correct
            }
        });
    });

    // Changement de sprint → sync boutons + rafraîchir les résultats (champ libre OU pastilles)
    el.querySelector('#vote-sprint')?.addEventListener('change', () => { syncVoteBtns(); refreshResults(); });
    el.querySelector('.vp-sprints')?.addEventListener('click', e => {
        const chip = e.target.closest('[data-vp-sprint]');
        if (!chip) return;
        el.querySelector('#vote-sprint').value = chip.dataset.vpSprint;
        el.querySelectorAll('.vp-sprint').forEach(c => { const on = c === chip; c.classList.toggle('is-on', on); c.setAttribute('aria-checked', String(on)); });
        syncVoteBtns(); refreshResults();
    });
    // Changement d'équipe → compteurs des cartes de vote + équipe mise en avant dans les résultats
    el.querySelector('#vote-team')?.addEventListener('change', () => refreshResults());

    // × au survol d'une carte de vote : retire le DERNIER vote de cette valeur (équipe + sprint choisis),
    // tout de suite à l'écran, en base après 6 s sauf « Annuler » — même geste que l'info-panel.
    el.querySelector('.vp-btns')?.addEventListener('click', e => {
        const del = e.target.closest('[data-vp-del]');
        if (!del) return;
        e.stopPropagation();
        const value = Number(del.dataset.vpDel);
        const teamVal = el.querySelector('#vote-team')?.value;
        const last = lastFiltered.filter(v => v.team === teamVal && v.value === value)
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
        if (!last) return;
        _pendingDel.add(last.id);
        refreshResults();
        const sc = scale.find(x => x.value === value);
        toastUndo(`${teamVal} : un vote ${sc?.label || ''} retiré`, {
            seconds: 6,
            onUndo: () => { _pendingDel.delete(last.id); refreshResults(); },
            onCommit: async () => {
                try { await api.deleteMood(last.id); } catch (err) { toast(err.message, 'error'); }
                _pendingDel.delete(last.id);
                await refreshResults();
                _syncGlobalVoteStore(type);
            },
        });
    });

    // Copie le message d'invitation au sondage (template fun pour Mood, structuré pour Fist)
    // Helper partagé wireSlackCopy : le texte est recalculé au clic depuis le sprint courant.
    wireSlackCopy(
        el.querySelector('.btn-copy-vote-slack'),
        () => {
            const sprintVal = el.querySelector('#vote-sprint')?.value.trim() || store.get('sprintInfo')?.name || '';
            return type === 'fist' ? buildFistSlackRaw(sprintVal) : buildMoodSlackRaw(sprintVal);
        },
        '📋 Copier Slack'
    );

    // Petit rappel de l'utilité du vote (popover) — texte court + échelle détaillée pour le
    // Fist of Five (mêmes données que le guide affiché dans les rapports, voir sondage.js).
    el.querySelector('.btn-vote-help')?.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelector('.vote-help-popover')?.remove();
        const pop = document.createElement('div');
        pop.className = 'vote-help-popover';
        const scaleHtml = type === 'fist'
            ? `<div class="fist-scale-guide">
                ${FIST_SCALE.map(r => `
                <div class="fist-scale-row">
                    <span class="fist-scale-emoji">${r.emoji}</span>
                    <div class="fist-scale-text">
                        <span class="fist-scale-label">${esc(r.label)}</span>
                        <span class="fist-scale-desc">${esc(r.text)}</span>
                    </div>
                </div>`).join('')}
               </div>`
            : '';
        pop.innerHTML = `
            <p class="vote-help-intro">${esc(SONDAGE_INTRO[type] || '')}</p>
            ${scaleHtml}`;
        pop.style.position = 'fixed';
        pop.style.visibility = 'hidden';
        document.body.appendChild(pop);
        const btn  = e.currentTarget;
        const r    = btn.getBoundingClientRect();
        const gap  = 8;
        const pw   = pop.offsetWidth;
        const ph   = pop.offsetHeight;
        // Placement sur le côté du bouton (droite par défaut, gauche si pas assez de place) —
        // pas en dessous, sinon ça déborde en bas de page quand le bouton est bas dans la vue.
        const spaceRight = window.innerWidth - r.right;
        const onLeft = spaceRight < pw + gap && r.left > pw + gap;
        const left = onLeft ? (r.left - pw - gap) : Math.min(r.right + gap, window.innerWidth - pw - 4);
        const top  = Math.max(4, Math.min(r.top, window.innerHeight - ph - 4));
        pop.style.left = `${Math.max(4, left)}px`;
        pop.style.top  = `${top}px`;
        pop.style.visibility = 'visible';
        const _close = ev => {
            if (!pop.contains(ev.target) && ev.target !== btn) {
                pop.remove();
                document.removeEventListener('click', _close);
            }
        };
        requestAnimationFrame(() => document.addEventListener('click', _close));
    });

    // État initial
    syncVoteBtns();
    await refreshResults();

}
