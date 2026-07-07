/**
 * Popover d'aide réutilisable — icône « ? » cliquable qui ouvre une petite bulle explicative
 * (desktop : positionnée près de l'ancre ; mobile : feuille centrée avec fond assombri) contenant
 * un schéma SVG pédagogique thémé clair/sombre.
 *
 * Auto-câblage : chaque icône porte `data-help-key` (cf helpIconHtml). Un unique écouteur délégué
 * (initHelpPopovers, appelé une fois au démarrage) ouvre le bon schéma → aucune logique à rebrancher
 * dans chaque vue/composant. Pour documenter une nouvelle card : ajouter une entrée à HELP_REGISTRY
 * et poser `helpIconHtml({ key })` dans son en-tête.
 *
 * Clic (pas survol) → fonctionne au doigt sur mobile. Fermeture : clic extérieur / Échap / scroll.
 */

import { esc } from '../utils.js';

/** Bouton icône « ? » à insérer dans un card-header. `key` référence une entrée de HELP_REGISTRY. */
export function helpIconHtml({ key = '', label = 'Explication', extraClass = '' } = {}) {
    return `<button type="button" class="card-help-btn ${esc(extraClass)}" data-role="help-btn" data-help-key="${esc(key)}" aria-label="${esc(label)}" title="${esc(label)}">?</button>`;
}

/** Ouvre le popover ancré sur `anchor`. Retourne une fonction de fermeture. */
export function openHelpPopover(anchor, { title = '', bodyHtml = '' } = {}) {
    document.querySelector('.help-popover')?.remove();
    document.querySelector('.help-popover-backdrop')?.remove();

    const mobile = window.innerWidth <= 560;
    const pop = document.createElement('div');
    pop.className = 'help-popover' + (mobile ? ' help-popover--sheet' : '');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.innerHTML = `
        <div class="help-popover-hdr">
            ${title ? `<span class="help-popover-title">${esc(title)}</span>` : '<span></span>'}
            <button type="button" class="help-popover-close" aria-label="Fermer">×</button>
        </div>
        <div class="help-popover-body">${bodyHtml}</div>`;

    let backdrop = null;
    if (mobile) {
        backdrop = document.createElement('div');
        backdrop.className = 'help-popover-backdrop';
        document.body.appendChild(backdrop);
    }
    pop.style.position = 'fixed';
    pop.style.visibility = 'hidden';
    document.body.appendChild(pop);

    const place = () => {
        if (mobile) { pop.style.visibility = 'visible'; return; }
        const r = anchor.getBoundingClientRect();
        const gap = 8;
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        let left = r.left + r.width / 2 - pw / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
        let top = r.bottom + gap;
        if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - gap);
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
        pop.style.visibility = 'visible';
    };
    requestAnimationFrame(place);

    const close = () => {
        pop.remove();
        backdrop?.remove();
        document.removeEventListener('click', onDoc, true);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', close);
        window.removeEventListener('scroll', onScroll, true);
    };
    const onDoc = ev => {
        if (!pop.contains(ev.target) && ev.target !== anchor && !anchor.contains?.(ev.target)) close();
    };
    const onKey = ev => { if (ev.key === 'Escape') close(); };
    const onScroll = () => { if (!mobile) close(); };

    pop.addEventListener('click', ev => { if (ev.target.closest('.help-popover-close')) close(); });
    backdrop?.addEventListener('click', close);
    requestAnimationFrame(() => {
        document.addEventListener('click', onDoc, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', onScroll, true);
    });
    return close;
}

/** Écouteur délégué unique — à appeler une fois au démarrage (cf app.js, comme initTooltips). */
export function initHelpPopovers() {
    if (window.__helpPopoversInit) return;
    window.__helpPopoversInit = true;
    document.addEventListener('click', e => {
        const btn = e.target.closest?.('.card-help-btn[data-help-key]');
        if (!btn) return;
        e.stopPropagation();
        const entry = HELP_REGISTRY[btn.dataset.helpKey];
        if (entry) openHelpPopover(btn, { title: entry.title, bodyHtml: entry.build() });
    });
}

// Flèche (tête de triangle) réutilisable dans les schémas : direction 'down' | 'right'.
function _arrowHead(x, y, dir, cls) {
    return dir === 'right'
        ? `<path d="M${x} ${y} l-7 -4 v8 z" class="${cls}"/>`
        : `<path d="M${x} ${y} l-4 -7 h8 z" class="${cls}"/>`;
}

// ── Schémas SVG ──────────────────────────────────────────────────────────────

/** Lead time / Cycle time : bande à 4 étapes + accolades Lead / Change Lead / Cycle Time. */
export function lctDiagramSvg() {
    return `
    <svg class="help-diagram" viewBox="0 0 720 210" role="img" aria-label="Schéma Lead time et Cycle time" width="100%">
        <text x="360" y="20" text-anchor="middle" class="hd-metric">Lead Time</text>
        <path d="M10 40 V32 H710 V40" class="hd-bracket"/>
        <text x="300" y="60" text-anchor="middle" class="hd-strong hd-red">First Commit</text>
        <text x="510" y="60" text-anchor="middle" class="hd-metric-sm">Change Lead Time</text>
        <path d="M300 80 V72 H710 V80" class="hd-bracket"/>
        <rect x="10"  y="95" width="240" height="60" rx="6" class="hd-seg hd-seg--backlog"/>
        <rect x="250" y="95" width="150" height="60" rx="6" class="hd-seg hd-seg--dev"/>
        <rect x="400" y="95" width="160" height="60" rx="6" class="hd-seg hd-seg--review"/>
        <rect x="560" y="95" width="150" height="60" rx="6" class="hd-seg hd-seg--deploy"/>
        <text x="130" y="130" text-anchor="middle" class="hd-lbl">Backlog</text>
        <text x="325" y="130" text-anchor="middle" class="hd-lbl">Développement</text>
        <text x="480" y="130" text-anchor="middle" class="hd-lbl">Revue de code</text>
        <text x="635" y="130" text-anchor="middle" class="hd-lbl">Déploiement</text>
        <line x1="300" y1="82" x2="300" y2="93" class="hd-red-stroke"/>
        ${_arrowHead(300, 96, 'down', 'hd-red')}
        <path d="M250 165 V173 H710 V165" class="hd-bracket"/>
        <text x="480" y="195" text-anchor="middle" class="hd-metric">Cycle Time</text>
    </svg>
    <p class="help-popover-note">
        <strong>Lead time</strong> = de la création à la livraison (attente comprise).
        <strong>Cycle time</strong> = du démarrage effectif à la fin (ce que l'équipe maîtrise).
        L'écart entre les deux = le temps passé <em>en file d'attente</em> dans le backlog.
    </p>`;
}

/** Ancienneté du travail en cours (Aging WIP) : bandes P50/P85 + ticket exemple dans la zone rouge. */
export function agingWipDiagramSvg() {
    return `
    <svg class="help-diagram" viewBox="0 0 720 190" role="img" aria-label="Schéma ancienneté du travail en cours" width="100%">
        <text x="360" y="20" text-anchor="middle" class="hd-sub">Âge d'un ticket dans sa colonne, comparé aux tickets déjà terminés</text>
        <text x="600" y="46" text-anchor="middle" class="hd-strong hd-red">ticket en cours</text>
        <line x1="600" y1="52" x2="600" y2="78" class="hd-red-stroke"/>
        ${_arrowHead(600, 81, 'down', 'hd-red')}
        <text x="300" y="60" text-anchor="middle" class="hd-sub">P50</text>
        <line x1="300" y1="66" x2="300" y2="138" class="hd-marker"/>
        <text x="500" y="60" text-anchor="middle" class="hd-sub">P85</text>
        <line x1="500" y1="66" x2="500" y2="138" class="hd-marker"/>
        <rect x="40"  y="82" width="260" height="46" rx="6" class="hd-band-ok"/>
        <rect x="300" y="82" width="200" height="46" rx="6" class="hd-band-warn"/>
        <rect x="500" y="82" width="180" height="46" rx="6" class="hd-band-crit"/>
        <text x="170" y="110" text-anchor="middle" class="hd-lbl">Dans les temps</text>
        <text x="400" y="110" text-anchor="middle" class="hd-lbl">À surveiller</text>
        <text x="590" y="110" text-anchor="middle" class="hd-lbl">En retard</text>
        <line x1="40" y1="150" x2="690" y2="150" class="hd-axis"/>
        ${_arrowHead(693, 150, 'right', 'hd-axis-head')}
        <text x="688" y="172" text-anchor="end" class="hd-sub">âge (jours) →</text>
    </svg>
    <p class="help-popover-note">
        Chaque ticket <strong>en cours</strong> est comparé aux tickets déjà terminés dans la même
        colonne : <strong>vert</strong> sous la médiane (P50), <strong>ambre</strong> entre P50 et P85,
        <strong>rouge</strong> au-delà du P85 — il sort de la zone habituelle, à débloquer en priorité.
    </p>`;
}

/** Temps par colonne : durée moyenne passée dans chaque étape du workflow (barres). */
export function stageFlowDiagramSvg() {
    const cols = [
        { x: 110, h: 96, v: '6.6 j', lbl: 'Dév',    cls: 'dev' },
        { x: 230, h: 58, v: '3.1 j', lbl: 'Test',   cls: 'test' },
        { x: 350, h: 46, v: '2.4 j', lbl: 'Revue',  cls: 'review' },
        { x: 470, h: 30, v: '1.2 j', lbl: 'Qualif', cls: 'qualif' },
        { x: 590, h: 22, v: '0.8 j', lbl: 'Prod',   cls: 'prod' },
    ];
    const base = 150, bw = 64;
    return `
    <svg class="help-diagram" viewBox="0 0 720 190" role="img" aria-label="Schéma temps par colonne" width="100%">
        <text x="360" y="20" text-anchor="middle" class="hd-sub">⏱️ Durée moyenne passée dans chaque colonne du workflow</text>
        <line x1="40" y1="${base}" x2="680" y2="${base}" class="hd-axis"/>
        ${cols.map(c => `
            <rect x="${c.x - bw / 2}" y="${base - c.h}" width="${bw}" height="${c.h}" rx="4" class="hd-bar hd-bar--${c.cls}"/>
            <text x="${c.x}" y="${base - c.h - 6}" text-anchor="middle" class="hd-val">${c.v}</text>
            <text x="${c.x}" y="${base + 16}" text-anchor="middle" class="hd-lbl">${c.lbl}</text>`).join('')}
    </svg>
    <p class="help-popover-note">
        Pour chaque étape, le temps réellement passé par les tickets (issu de leur historique de statut).
        Repérer d'un coup d'œil <strong>où le flux ralentit</strong> — souvent la revue ou la qualif.
        Cliquer une colonne ouvre le détail ticket par ticket.
    </p>`;
}

/** Vélocité : points livrés par sprint + ligne de moyenne + objectif + sprint en cours (non compté). */
export function velocityDiagramSvg() {
    const bars = [
        { x: 90,  h: 60 }, { x: 190, h: 82 }, { x: 290, h: 70 },
        { x: 390, h: 96 }, { x: 490, h: 84 },
    ];
    const base = 150, bw = 58, avgY = 88, targetY = 72;
    return `
    <svg class="help-diagram" viewBox="0 0 720 190" role="img" aria-label="Schéma vélocité" width="100%">
        <text x="360" y="20" text-anchor="middle" class="hd-sub">Points livrés par sprint clos — moyenne, objectif et tendance</text>
        <line x1="40" y1="${base}" x2="680" y2="${base}" class="hd-axis"/>
        ${bars.map((b, i) => `
            <rect x="${b.x - bw / 2}" y="${base - b.h}" width="${bw}" height="${b.h}" rx="4" class="hd-bar hd-bar--velo"/>
            <text x="${b.x}" y="${base + 16}" text-anchor="middle" class="hd-sub">S${i + 1}</text>`).join('')}
        <!-- sprint en cours : barre creuse, non comptée -->
        <rect x="${590 - bw / 2}" y="${base - 44}" width="${bw}" height="44" rx="4" class="hd-bar--current"/>
        <text x="590" y="${base + 16}" text-anchor="middle" class="hd-sub">en cours</text>
        <line x1="40" y1="${targetY}" x2="680" y2="${targetY}" class="hd-target"/>
        <text x="46" y="${targetY - 5}" class="hd-sub">🎯 objectif</text>
        <line x1="40" y1="${avgY}" x2="680" y2="${avgY}" class="hd-avg"/>
        <text x="674" y="${avgY - 5}" text-anchor="end" class="hd-sub">moyenne</text>
    </svg>
    <p class="help-popover-note">
        La vélocité mesure la <strong>capacité de livraison</strong> (points/sprint) sur les sprints
        <strong>clôturés</strong>. Le sprint en cours n'est jamais compté. Plus les barres sont
        régulières, plus l'équipe est <strong>prévisible</strong> (coefficient de variation faible).
    </p>`;
}

/** SLA Review : distribution des cycle times + seuil de conformité « 85% ≤ X j ». */
export function slaDiagramSvg() {
    // Petite distribution (histogramme) avec seuil SLE : la part sous le seuil = conforme.
    const bins = [
        { x: 90,  h: 40, ok: true }, { x: 160, h: 70, ok: true }, { x: 230, h: 92, ok: true },
        { x: 300, h: 78, ok: true }, { x: 370, h: 54, ok: true }, { x: 440, h: 34, ok: false },
        { x: 510, h: 22, ok: false }, { x: 580, h: 14, ok: false },
    ];
    const base = 150, bw = 52, sleX = 405;
    return `
    <svg class="help-diagram" viewBox="0 0 720 190" role="img" aria-label="Schéma SLA Review" width="100%">
        <text x="360" y="20" text-anchor="middle" class="hd-sub">Cible de service : « 85% des tickets terminés en ≤ X jours »</text>
        <line x1="40" y1="${base}" x2="680" y2="${base}" class="hd-axis"/>
        ${_arrowHead(693, base, 'right', 'hd-axis-head')}
        <text x="688" y="${base + 18}" text-anchor="end" class="hd-sub">cycle time (jours) →</text>
        ${bins.map(b => `<rect x="${b.x - bw / 2}" y="${base - b.h}" width="${bw}" height="${b.h}" rx="3" class="${b.ok ? 'hd-band-ok' : 'hd-band-crit'}"/>`).join('')}
        <line x1="${sleX}" y1="40" x2="${sleX}" y2="${base}" class="hd-marker"/>
        <text x="${sleX + 6}" y="52" class="hd-strong">SLE = P85</text>
        <text x="200" y="40" text-anchor="middle" class="hd-sub">✅ conforme (85%)</text>
        <text x="530" y="80" text-anchor="middle" class="hd-sub">⚠ hors cible</text>
    </svg>
    <p class="help-popover-note">
        La <strong>SLA/SLE</strong> (Service Level Expectation) fixe un objectif de flux : « 85% des
        tickets terminés en ≤ X jours ». On suit le <strong>taux de conformité</strong> et on liste les
        tickets qui dépassent le seuil — la version chiffrée de « ça met trop de temps ».
    </p>`;
}

// Registre des schémas — clé = data-help-key posé par helpIconHtml.
const HELP_REGISTRY = {
    'lct':        { title: 'Lead time & Cycle time',            build: lctDiagramSvg },
    'aging-wip':  { title: 'Ancienneté du travail en cours',    build: agingWipDiagramSvg },
    'stage-flow': { title: 'Temps par colonne',                 build: stageFlowDiagramSvg },
    'velocity':   { title: 'Vélocité',                          build: velocityDiagramSvg },
    'sla':        { title: 'SLA Review',                        build: slaDiagramSvg },
};
