/**
 * Écran d'attente du board — chargement initial ET synchro JIRA (remplace les skeletons, 3.231.0).
 *
 * Une mini-scène : un board de trois colonnes où une carte voyage « À faire → En cours → Fait », puis
 * un titre, une barre (indéterminée au chargement, en % réel pendant une synchro : `updateBoardLoader`)
 * et des astuces qui défilent. Animation 100 % CSS (css/board-loader.css) :
 * aucun timer à libérer quand la vue remplace l'écran. Apparition différée de 150 ms : un chargement
 * rapide ne clignote pas. `prefers-reduced-motion` → scène figée, astuces fixes.
 */
import { esc } from '../utils.js';

const _TIPS = {
    load: [
        'Ctrl+K retrouve une vue, une équipe ou un bloc en quelques lettres',
        'Touches 1 à 8 : passer d\'une vue de pilotage à l\'autre',
        'La virgule « , » ouvre les Paramètres',
        'Le mode TV (#tv) affiche la météo des équipes en continu',
    ],
    sync: [
        'Les sprints clos déjà en base ne sont pas retéléchargés',
        'Un appel JIRA en échec est signalé à la fin, jamais passé sous silence',
        'La pastille du bouton JIRA indique la fraîcheur de la dernière synchro',
        'Sync rapide : seuls les tickets modifiés récemment sont relus',
    ],
};

/**
 * @param {object} [o]
 * @param {'load'|'sync'|'full'} [o.mode]
 * @param {string} [o.title]
 * @param {string} [o.sub]
 */
export function boardLoaderHtml({ mode = 'load', title = '', sub = '' } = {}) {
    const tips = _TIPS[mode === 'load' ? 'load' : 'sync'];
    const t = title || (mode === 'full' ? 'Synchronisation complète' : mode === 'sync' ? 'Synchronisation rapide' : 'Chargement du board');
    const s = sub || (mode === 'full' ? 'Cela peut prendre quelques minutes sur un gros JIRA.'
        : mode === 'sync' ? 'Le contenu se rafraîchira tout seul à la fin.' : 'Récupération des données locales.');
    return `<div class="ldr" data-mode="${mode}" role="status" aria-live="polite" aria-busy="true">
        <div class="ldr-scene" aria-hidden="true">
            <span class="ldr-glow"></span>
            <div class="ldr-board">
                <span class="ldr-col ldr-col--todo"><i class="ldr-head"></i><i class="ldr-card"></i><i class="ldr-card ldr-card--s"></i></span>
                <span class="ldr-col ldr-col--wip"><i class="ldr-head"></i><i class="ldr-card ldr-card--s"></i></span>
                <span class="ldr-col ldr-col--done"><i class="ldr-head"></i><i class="ldr-card"></i><i class="ldr-card ldr-card--s"></i></span>
                <span class="ldr-runner"><i></i><b>✓</b></span>
            </div>
            <span class="ldr-spark ldr-spark--1"></span><span class="ldr-spark ldr-spark--2"></span><span class="ldr-spark ldr-spark--3"></span>
        </div>
        <p class="ldr-title">${esc(t.replace(/…$/, ''))}<span class="ldr-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>
        <p class="ldr-sub">${esc(s)}</p>
        <span class="ldr-bar" aria-hidden="true"><i></i></span>
        ${mode === 'load' ? '' : '<p class="ldr-step"><b class="ldr-pct"></b><span class="ldr-step-label"></span></p>'}
        <p class="ldr-tips" aria-hidden="true">${tips.map(x => `<span>💡 ${esc(x)}</span>`).join('')}</p>
    </div>`;
}

/**
 * Synchro JIRA : la barre devient DÉTERMINÉE et l'étape en cours s'affiche (store `syncProgress` /
 * `syncLabel` / `syncDetail`, posés par sync-report.js). Mise à jour EN PLACE : la scène continue de jouer.
 * Sans écran d'attente de synchro à l'écran, ne fait rien.
 */
export function updateBoardLoader(root, { pct, label = '', detail = '' } = {}) {
    const bl = root?.querySelector('.ldr[data-mode="sync"], .ldr[data-mode="full"]');
    if (!bl || pct == null) return;
    const bar = bl.querySelector('.ldr-bar');
    bar.classList.add('is-determinate');
    bar.style.setProperty('--p', `${Math.round(pct)}%`);
    bl.querySelector('.ldr-pct').textContent = `${Math.round(pct)} %`;
    bl.querySelector('.ldr-step-label').textContent = [label, detail].filter(Boolean).join(' · ');
}
