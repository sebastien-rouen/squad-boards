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

import { esc, meteoThresholds, METEO_REL_BAND, METEO_START_TOLERANCE, METEO_DOMAINS, trapFocus } from '../utils.js';

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
        // Liens en pied de popover : un autre sujet (glossaire…) ou le mode apprentissage.
        const link = e.target.closest?.('[data-help-open], [data-help-learn]');
        if (link) {
            e.preventDefault(); e.stopPropagation();
            if (link.dataset.helpLearn !== undefined) { openLearnMode(link.dataset.helpLearn || ''); return; }
            const anchor = document.querySelector('.card-help-btn[data-help-key]') || link;
            const entry = HELP_REGISTRY[link.dataset.helpOpen];
            if (entry) openHelpPopover(anchor, { title: entry.title, bodyHtml: entry.build() });
            return;
        }
        const btn = e.target.closest?.('.card-help-btn[data-help-key]');
        if (!btn) return;
        e.stopPropagation();
        const entry = HELP_REGISTRY[btn.dataset.helpKey];
        if (entry) openHelpPopover(btn, { title: entry.title, bodyHtml: entry.build() });
    });
}

/** Pied commun des popovers : vers le glossaire et vers « tout comprendre ». */
function _helpLinks(except = '') {
    return `<div class="help-popover-links">
        ${except === 'glossaire' ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-help-open="glossaire">📖 Glossaire</button>'}
        <button type="button" class="btn btn-secondary btn-sm" data-help-learn="">🎓 Tout comprendre</button>
    </div>`;
}

/**
 * MODE APPRENTISSAGE — toutes les explications d'un coup, en accordéon. C'est ce qu'on montre à
 * un nouveau Scrum Master la première fois ; ensuite chaque « ? » suffit. `openKey` = entrée à
 * déplier en premier (sinon la première).
 */
export function openLearnMode(openKey = '') {
    document.querySelector('.learn-backdrop')?.remove();
    document.querySelector('.help-popover')?.remove();
    const keys = Object.keys(HELP_REGISTRY);
    const first = keys.includes(openKey) ? openKey : keys[0];
    const wrap = document.createElement('div');
    wrap.className = 'learn-backdrop';
    wrap.innerHTML = `
        <div class="learn-modal" role="dialog" aria-modal="true" aria-labelledby="learn-title">
            <div class="learn-hd">
                <div><h2 id="learn-title">🎓 Comprendre les indicateurs</h2><p>Chaque carte du site a son « ? » ; ici, toutes les explications d'un coup — à lire une fois, puis à oublier.</p></div>
                <button type="button" class="btn-icon" data-learn-close aria-label="Fermer">✕</button>
            </div>
            <div class="learn-bd">
                ${keys.map(k => `<details class="learn-item"${k === first ? ' open' : ''}><summary>${esc(HELP_REGISTRY[k].title)}</summary><div class="learn-item-bd">${HELP_REGISTRY[k].build()}</div></details>`).join('')}
            </div>
            <div class="learn-ft"><kbd>Échap</kbd> fermer · les mêmes textes que les « ? » des cartes — une seule source (<code>HELP_REGISTRY</code>)</div>
        </div>`;
    document.body.appendChild(wrap);
    const modal = wrap.querySelector('.learn-modal');
    const release = trapFocus(modal);
    const close = () => { release?.(); wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = ev => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', ev => { if (ev.target === wrap || ev.target.closest('[data-learn-close]')) close(); });
    wrap.querySelector('.learn-item[open] > summary')?.focus();
    return close;
}

/** GLOSSAIRE — les mots du site, avec leur règle. Les schémas existants sont réutilisés, jamais redessinés. */
export function glossaryHtml() {
    const items = [
        { icon: '📌', term: 'Engagement vs réalisé', text: 'L\'<strong>engagement</strong> d\'un sprint compte tout ce qui en a fait partie, reports compris (<code>belongedToSprint</code>). Le <strong>réalisé</strong> exige d\'être terminé <strong>et</strong> encore dans le sprint : un ticket fini ailleurs ne crédite pas le sprint qu\'il a quitté.' },
        { icon: '↪', term: 'Ticket glissé', text: 'Engagé dans 30.1, livré dans 30.2 : JIRA le déplace à la clôture. Il reste dans l\'engagement de 30.1 (chip <code>↪ 30.2</code>) et n\'entre jamais dans son réalisé.' },
        { icon: '🍃', term: 'Sprint de respiration', text: 'Le dernier sprint du PI : dette, Inspect &amp; Adapt, préparation du PI suivant. Il ne compte <strong>ni</strong> dans la vélocité moyenne, <strong>ni</strong> dans la capacité, <strong>ni</strong> comme charge suggérée.', svg: velocityDiagramSvg },
        { icon: '⚠', term: 'Capacité plafonnée', text: 'Quand la fenêtre dépasse la dernière absence connue, le taux d\'absence est un <strong>plancher</strong> et la base de capacité un <strong>plafond</strong>. Le chiffre est toujours montré avec cette réserve (cellule orange, ⚠).' },
        { icon: '⚡', term: 'Flow efficiency', text: 'Part du lead time réellement passée à travailler le ticket (cycle ÷ lead). ~15 % est courant, 40 %+ est bon : réduire l\'attente en file vaut plus que travailler plus vite.', svg: lctDiagramSvg },
        { icon: '🎯', term: 'Objectif commis / extension', text: '<strong>Commis</strong> = engagement ferme, <strong>extension</strong> (stretch) = si le temps le permet. La progression d\'un objectif est un rollup de ses features, jamais saisie à la main.' },
        { icon: '🌤️', term: 'Météo des équipes', text: 'Cinq domaines, une échelle (☀️ ⛅ 🌧️ ⛈️ ⚪). Le niveau d\'une équipe est le <strong>pire</strong> de ses domaines ; ⚪ pas de donnée n\'est jamais un mauvais signe.' },
    ];
    return `<div class="gloss-list">${items.map(g => `<div class="gloss-item"><b>${g.icon} ${esc(g.term)}</b><p>${g.text}</p>${g.svg ? g.svg() : ''}</div>`).join('')}</div>${_helpLinks('glossaire')}`;
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
    </p>
    <p class="help-popover-note">
        ⚠️ <strong>Traversée complète, pas découpée par PI</strong> : la durée d'un ticket est comptée
        de son entrée à sa sortie de la colonne, même si cela couvre plusieurs PI (18&nbsp;% des tickets
        d'un PI en traversent au moins deux). Le sélecteur de PI choisit <em>quels tickets</em> sont
        mesurés — tous ceux qui ont appartenu au PI, reports compris — pas la <em>fenêtre de temps</em> :
        un ticket qui a traversé trois PI apparaît dans les trois, avec sa durée totale à chaque fois.
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
        <br><strong>Seuil auto</strong> = P85 du <strong>PI précédent</strong> (référence externe) : on
        mesure si le PI courant fait aussi bien ou mieux. Se comparer à son propre P85 donnerait
        toujours ~85% — c'est pourquoi la référence vient de l'historique, pas du PI mesuré.
    </p>`;
}

/** Météo des équipes : l'échelle en une barre, les deux calculs, la règle du pire. */
export function meteoDiagramHtml() {
    const th = meteoThresholds();
    const seg = (lv, glyph, txt, flex) => `<span class="meteo-cell--${lv}" style="flex:${flex}">${glyph} ${txt}</span>`;
    return `
    <div class="meteo-help-bar" role="img" aria-label="Échelle : critique sous ${th.rain}, attention jusqu'à ${th.cloud}, variable jusqu'à ${th.sun}, beau au-delà">
        ${seg('storm', '⛈️', `< ${th.rain}`, th.rain)}${seg('rain', '🌧️', `${th.rain}–${th.cloud - 1}`, th.cloud - th.rain)}${seg('cloud', '⛅', `${th.cloud}–${th.sun - 1}`, th.sun - th.cloud)}${seg('sun', '☀️', `≥ ${th.sun}`, 100 - th.sun)}
    </div>
    <p class="help-popover-note">
        Chaque case vient d'une mesure <strong>qui existe déjà</strong> dans le site, traduite en couleur
        par <strong>une seule échelle</strong>. Rien n'est un jugement : ce sont les chiffres du Dashboard,
        de Santé, de SLA Review et des votes, lus d'un coup.
    </p>
    <ul class="meteo-help-list">
        <li><strong>Santé, SLA, Mood × 20</strong> — score absolu sur 100, seuils ci-dessus.</li>
        <li><strong>Sprint, PI</strong> — avancement <em>comparé au temps écoulé</em> : ±${METEO_REL_BAND} points = ⛅,
            jusqu'à −${2 * METEO_REL_BAND} = 🌧️, au-delà = ⛈️. Sous ${METEO_START_TOLERANCE} % du temps, on ne juge pas encore.</li>
        <li><strong>Le niveau d'une équipe</strong> = le <em>pire</em> de ses domaines — une moyenne cacherait un orage.</li>
        <li><strong>⚪ Pas de donnée</strong> (aucun vote, aucun sprint) n'est jamais une mauvaise nouvelle et ne compte pas.</li>
    </ul>
    <table class="meteo-help-table" aria-label="Formule et source de chaque domaine">
        <thead><tr><th>Domaine</th><th>Formule</th><th>Source dans le site</th></tr></thead>
        <tbody>${METEO_DOMAINS.map(d => `<tr><th scope="row">${d.icon} ${esc(d.label)} <small>${d.kind === 'rel' ? 'relatif' : 'absolu'}</small></th><td>${esc(d.formula)}</td><td>${esc(d.source)}</td></tr>`).join('')}</tbody>
    </table>${_helpLinks()}`;
}

// Registre des schémas — clé = data-help-key posé par helpIconHtml.
const HELP_REGISTRY = {
    'meteo':      { title: 'Météo des équipes',                 build: meteoDiagramHtml },
    'glossaire':  { title: 'Glossaire',                         build: glossaryHtml },
    'lct':        { title: 'Lead time & Cycle time',            build: lctDiagramSvg },
    'aging-wip':  { title: 'Ancienneté du travail en cours',    build: agingWipDiagramSvg },
    'stage-flow': { title: 'Temps par colonne',                 build: stageFlowDiagramSvg },
    'velocity':   { title: 'Vélocité',                          build: velocityDiagramSvg },
    'sla':        { title: 'SLA Review',                        build: slaDiagramSvg },
};
