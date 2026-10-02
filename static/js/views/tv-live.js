/**
 * Mode TV — ce qui garde l'écran mural VIVANT, sans personne devant :
 *
 *   - **rechargement** : l'écran ne synchronise jamais JIRA lui-même. Toutes les 5 min, il demande
 *     l'heure du dernier import au serveur (`/api/sync-stamp`, quelques octets) et ne recharge
 *     `/api/all` (~15 Mo) que si elle a changé ; une fois par heure quoi qu'il arrive (absences,
 *     faits, agendas bougent sans synchro JIRA) ;
 *   - **écran allumé** : Screen Wake Lock, redemandé au retour de l'onglet (le navigateur le rend
 *     dès que la page passe en arrière-plan) ;
 *   - **tickets terminés salués** : un bandeau « 🎉 Terminé » par ticket passé à « done » entre deux
 *     chargements (file d'attente, 6 s chacun), cliquable vers la popin du ticket.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc } from '../utils.js';

const POLL_MS = 5 * 60 * 1000;
const FULL_MS = 60 * 60 * 1000;
const CHEER_MS = 6000;
const CHEER_MAX = 6;   // au-delà : un seul « + N autres » (une synchro du matin en livre parfois 30)

/** Rechargement des données quand une synchro a eu lieu ailleurs. Renvoie l'arrêt. */
function startRefresh() {
    let busy = false, lastFull = Date.now();
    const tick = async () => {
        if (busy || document.hidden) return;
        busy = true;
        try {
            const { updatedAt } = await api.getSyncStamp() || {};
            const known = store.get('sprintInfo')?.updatedAt;
            if ((updatedAt && updatedAt !== known) || Date.now() - lastFull > FULL_MS) {
                await window.__squadBoard?.reloadData?.();
                lastFull = Date.now();
            }
        } catch { /* serveur injoignable : on retentera au prochain tour, l'écran garde ses données */ }
        busy = false;
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
}

/** Garde l'écran allumé tant que la TV est affichée. Renvoie la libération. */
function startWakeLock() {
    let lock = null, stopped = false;
    const ask = async () => {
        if (stopped || document.hidden || !navigator.wakeLock || (lock && !lock.released)) return;
        try { lock = await navigator.wakeLock.request('screen'); } catch { /* refusé (batterie faible, contexte non sécurisé) */ }
    };
    const onVis = () => { if (!document.hidden) ask(); };
    document.addEventListener('visibilitychange', onVis);
    ask();
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
}

/** Tickets passés à « terminé » entre deux chargements → bandeaux de félicitation dans `host`. */
function startCheers(host, scopeTeams) {
    const doneIds = () => new Set((store.get('tickets') || []).filter(t => t.status === 'done').map(t => t.id));
    let known = doneIds();
    const queue = [];
    let timer = null;
    const next = () => {
        timer = null;
        const t = queue.shift();
        host.innerHTML = '';
        host.hidden = !t;
        if (!t) return;
        host.innerHTML = t.more
            ? `<div class="tv-cheer"><span aria-hidden="true">🎉</span><div><b>+ ${t.more} autres tickets terminés</b></div></div>`
            : `<div class="tv-cheer" data-ticket="${esc(t.id)}" tabindex="0" role="button" aria-label="Ouvrir ${esc(t.id)}"><span aria-hidden="true">🎉</span><div><small>Terminé · ${esc(t.team)}${t.leader ? ` · ${esc(t.leader)}` : ''}</small><b><code>${esc(t.id)}</code> ${esc(t.title || '')}</b></div></div>`;
        timer = setTimeout(next, CHEER_MS);
    };
    const unsub = store.on('tickets', tickets => {
        const teams = scopeTeams(), first = !known.size;
        // Résolu depuis moins de 3 jours : une synchro complète peut ramener de VIEUX tickets terminés
        // (archive, équipe réintégrée) — on ne salue que ce qui vient vraiment de se terminer.
        const recent = t => t.resolvedDate && Date.now() - new Date(String(t.resolvedDate).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime() < 3 * 864e5;
        const fresh = first ? [] : (tickets || []).filter(t => t.status === 'done' && !known.has(t.id) && teams.includes(t.team) && recent(t));
        known = doneIds();
        if (!fresh.length) return;
        fresh.slice(0, CHEER_MAX).forEach(t => queue.push(t));
        if (fresh.length > CHEER_MAX) queue.push({ more: fresh.length - CHEER_MAX });
        if (!timer) next();
    });
    return () => { unsub?.(); clearTimeout(timer); host.innerHTML = ''; host.hidden = true; };
}

/** Démarre les trois mécanismes ; renvoie une fonction d'arrêt unique (appelée au nettoyage de la TV). */
export function startLive({ cheerHost, scopeTeams }) {
    const stops = [startRefresh(), startWakeLock(), startCheers(cheerHost, scopeTeams)];
    return () => stops.forEach(s => s());
}
