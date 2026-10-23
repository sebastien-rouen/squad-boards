/**
 * Direction A — 🌌 CONSTELLATION : l'organisation d'abord.
 * Le programme au centre, les lignes produit en secteurs, les équipes en astres, les personnes en
 * satellites colorés par leur niveau sur la compétence cherchée. On voit QUI sait QUOI et OÙ d'un regard.
 */
const U = require('./ui.cjs');
const C = require('./common.cjs');
const PC = require('./pages-common.cjs');
const { D, av, lvl, chip, btn, bar, radar, esc, tc, teamDot, screen, topbar, tabbar, seg, sheet, desk, deskTop } = U;

const dir = {
    key: 'a-constellation', num: 1, name: 'Constellation', nextName: 'Matrice', mod: 'constellation', icon: '🌌', retained: true,
    pitch: 'L\'organisation d\'abord : une carte orbitale du train où les sachants s\'allument quand on cherche une compétence.',
    traits: ['Carte orbitale', 'Recherche qui allume', 'Halo rouge = trou', 'Ciel des compétences', 'Simulation sur la carte'],
    plus: 'Vision d\'ensemble immédiate et mémorable ; idéale pour présenter le train, l\'onboarding, une revue de PI. Le bus factor se VOIT (une seule lumière).',
    minus: 'Une compétence à la fois sur la carte ; la lecture fine passe par d\'autres sections. La plus coûteuse à coder (SVG, géométrie).',
    moment: 'PI Planning, onboarding, présentation au management.',
};

const ANGLE = { Alpha: 205, Borée: 255, Cobalt: 318, Delta: 20, Éole: 112 };
const SECTORS = [['com', 'Commerce', 180, 280], ['log', 'Logistique', 292, 405], ['pla', 'Plateforme', 85, 140]];

const rad = a => a * Math.PI / 180;
const at = (cx, cy, r, a) => [cx + Math.cos(rad(a)) * r, cy + Math.sin(rad(a)) * r];
const f = n => n.toFixed(1);

/** Secteur annulaire (fond d'une ligne produit). */
function sector(cx, cy, r1, r2, a1, a2) {
    const [x1, y1] = at(cx, cy, r2, a1), [x2, y2] = at(cx, cy, r2, a2), [x3, y3] = at(cx, cy, r1, a2), [x4, y4] = at(cx, cy, r1, a1);
    const big = a2 - a1 > 180 ? 1 : 0;
    return `M${f(x1)},${f(y1)} A${r2},${r2} 0 ${big} 1 ${f(x2)},${f(y2)} L${f(x3)},${f(y3)} A${r1},${r1} 0 ${big} 0 ${f(x4)},${f(y4)}Z`;
}

/**
 * Carte orbitale. skill : compétence surlignée (satellites colorés par niveau, sachants nommés).
 * select : équipe sélectionnée ; sim : déplacement simulé { who, to } ; zoom : facteur sur une ligne.
 */
function orbitMap({ w = 860, h = 660, skill = 'kafka', select = 'Cobalt', sim = null, scale = 1, labels = true } = {}) {
    const cx = w / 2, cy = h / 2, R = 215 * scale, rT = 38 * scale, rM = 64 * scale;
    let s = `<svg class="orbit" viewBox="0 0 ${w} ${h}" role="img" aria-label="Carte du programme">`;
    s += `<circle class="orbit__ring" cx="${cx}" cy="${cy}" r="${R}"/><circle class="orbit__ring orbit__ring--in" cx="${cx}" cy="${cy}" r="${R - 110 * scale}"/>`;
    for (const [id, name, a1, a2] of SECTORS) {
        s += `<path class="orbit__sector l-${id}" d="${sector(cx, cy, R - 92 * scale, R + 104 * scale, a1, a2)}"/>`;
        if (labels) { const [lx, ly] = at(cx, cy, R + 122 * scale, (a1 + a2) / 2); s += `<text class="orbit__line l-${id}" x="${f(lx)}" y="${f(ly)}">${esc(name)}</text>`; }
    }
    s += `<circle class="orbit__core" cx="${cx}" cy="${cy}" r="${48 * scale}"/><text class="orbit__corelbl" x="${cx}" y="${cy - 4}">Train</text><text class="orbit__corelbl orbit__corelbl--b" x="${cx}" y="${cy + 12 * scale}">Horizon</text>`;
    for (const team of Object.keys(ANGLE)) {
        const [tx, ty] = at(cx, cy, R, ANGLE[team]);
        // Simulation : le déplacé reste en FANTÔME à son ancienne place, arrive plein dans l'équipe cible,
        // dont la couverture est recalculée avec lui.
        const members = D.byTeam(team).slice();
        if (sim && sim.to === team) members.push(sim.who);
        const base = D.coverage(team);
        const missing = sim && sim.to === team ? base.missing.filter(id => sim.who.levels[id] < 2) : base.missing;
        const cov = { missing, pct: Math.round((base.total - missing.length) / base.total * 100) };
        s += `<line class="orbit__link" x1="${cx}" y1="${cy}" x2="${f(tx)}" y2="${f(ty)}"/>`;
        s += `<g class="orbit__team ${tc(team)}${team === select ? ' is-sel' : ''}">`;
        members.forEach((p, i) => {
            const [mx, my] = at(tx, ty, rM, ANGLE[team] + 180 + (i - (members.length - 1) / 2) * 34);
            const v = skill ? p.levels[skill] : 3;
            const ghost = sim && p.name === sim.who.name && team === sim.from;
            s += `<line class="orbit__tie" x1="${f(tx)}" y1="${f(ty)}" x2="${f(mx)}" y2="${f(my)}"/>`;
            s += `<circle class="orbit__member m-lvl-${v}${skill && v >= 2 ? ' is-hit' : ''}${ghost ? ' is-ghost' : ''}" cx="${f(mx)}" cy="${f(my)}" r="${(v >= 2 ? 11 : 8) * scale}"><title>${esc(p.name)} · ${skill ? D.skill(skill).label + ' ' + v : ''}</title></circle>`;
            if (labels && skill && v >= 2) s += `<text class="orbit__tag" x="${f(mx)}" y="${f(my - 16 * scale)}">${esc(p.first)} · ${v}</text>`;
        });
        s += `<circle class="orbit__body" cx="${f(tx)}" cy="${f(ty)}" r="${rT}"/>`;
        if (cov.missing.length) s += `<circle class="orbit__gap" cx="${f(tx)}" cy="${f(ty)}" r="${rT + 7 * scale}"/>`;
        s += `<text class="orbit__teamlbl" x="${f(tx)}" y="${f(ty + (labels ? -2 : 5))}">${esc(team)}</text><text class="orbit__teamsub" x="${f(tx)}" y="${f(ty + 13 * scale)}">${cov.pct} %</text></g>`;
    }
    if (sim) {
        const [ax, ay] = at(cx, cy, R, ANGLE[sim.from]), [bx, by] = at(cx, cy, R, ANGLE[sim.to]);
        s += `<path class="orbit__move" d="M${f(ax)},${f(ay)} Q${cx},${cy} ${f(bx)},${f(by)}"/>`;
    }
    return s + '</svg>';
}

/** Carte cadrée pour un écran de 390 px (libellés lisibles, rayons réduits). */
const mobileMap = (opts = {}) => orbitMap({ w: 560, h: 470, scale: 0.66, labels: false, ...opts });

const legend = (skill = 'kafka') => `<div class="orbit-legend"><b>${esc(D.skill(skill).label)}</b>${[1, 2, 3, 4].map(v => `<span class="inline">${lvl(v)}<small>${esc(D.LEVELS[v].label)}</small></span>`).join('')}<span class="inline"><i class="legend-gap"></i><small>compétence requise non couverte</small></span></div>`;

const teamPanel = (team, skill = 'kafka') => {
    const cov = D.coverage(team);
    return `<div class="card__head">${teamDot(team)}<h3>${esc(team)}</h3><span class="spacer"></span>${chip(cov.pct + ' % couvert', cov.missing.length ? 'warn' : 'ok')}</div>`
        + `<div class="mfiche__radar">${radar(U.teamLevels(team), { size: 220 })}</div>`
        + `<h4 class="sec-title">Membres · ${esc(D.skill(skill).label)}</h4>`
        + D.byTeam(team).map(p => `<div class="row">${av(p, 'sm', D.AWAY[p.name] ? 'av--away' : '')}<span class="row__main"><b>${esc(p.name)}</b><span class="row__meta">${esc(p.role)}${D.AWAY[p.name] ? ' · 🌴 ' + D.AWAY[p.name] : ''}</span></span>${U.ap(p.app[skill])}${lvl(p.levels[skill])}</div>`).join('');
};

const mapTools = `<div class="toolbar"><span class="search">🔍 Kafka</span>${chip('Surligné : Kafka ✕', 'on')}${seg(['Organisation', 'Compétence'], 'Compétence')}<span class="spacer"></span>${btn('▶ Visite', 'sm ghost')}${btn('⛶', 'sm ghost')}${btn('📤', 'sm ghost')}</div>`;

/* ── 01 — écran principal ─ */
function p01() {
    const solo = screen({ solo: true,
        top: topbar('Atlas', { sub: 'Train Horizon · 5 équipes · 26 personnes', actions: btn('🔍', 'icon ghost') }),
        body: `<div class="inline">${chip('Surligné : Kafka ✕', 'on')}${chip('1 sachant', 'danger')}</div><div class="orbit-frame orbit-frame--m">${mobileMap({ })}</div>`
            + `<section class="card">${teamPanel('Cobalt').replace(/<div class="mfiche__radar">[\s\S]*?<\/svg><\/div>/, '')}</section>`,
        tabbar: tabbar('carte') });
    return {
        key: '01-atlas', title: 'Écran principal',
        sub: 'La carte du train en orbites : on cherche une compétence, les sachants s\'allument — et les trous se voient (halo rouge).',
        deskNote: 'carte orbitale + équipe sélectionnée en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('carte du programme', '🗺️ Carte'), body: `${mapTools}<div class="orbit-frame">${orbitMap()}</div>${legend()}`, side: teamPanel('Cobalt') + C.signalCard(C.SIGNALS[0]) }),
        solo,
        notes: [
            '<strong>La recherche pilote la carte</strong> : « Kafka » allume les sachants (niveau ≥ 2, nommés) et éteint les autres. Une seule lumière chez Cobalt suffit à raconter le bus factor.',
            '<strong>Les trous sont visibles sans lire</strong> : halo pointillé rouge autour d\'une équipe dont une compétence requise n\'a aucun sachant (Delta, Kubernetes).',
            '<strong>Mobile : la carte en tête, le détail dessous</strong>, pas de zoom à deux doigts obligatoire — toucher une équipe met son panneau à jour.',
            '<strong>Limite assumée</strong> : la carte ne montre qu\'une compétence à la fois ; la lecture fine (10 compétences × 26 personnes) reste dans l\'onglet Matrice.',
        ],
    };
}

/* ── 02 — sections ─ */
const skySkill = s => `<div class="sky"><b>${esc(s.label)}</b><span class="sky__dots">${D.PEOPLE.filter(p => p.levels[s.id]).sort((a, b) => b.levels[s.id] - a.levels[s.id]).map(p => `<i class="sky__dot m-lvl-${p.levels[s.id]}" title="${esc(p.name)} · ${p.levels[s.id]}"></i>`).join('')}</span><small>${D.experts(s.id).length} sachant${D.experts(s.id).length > 1 ? 's' : ''}</small></div>`;
const coverRing = team => { const c = D.coverage(team); return `<div class="cring ${tc(team)}${c.missing.length ? ' cring--gap' : ''}"><svg viewBox="0 0 64 64"><circle class="cring__bg" cx="32" cy="32" r="27"/><circle class="cring__val" cx="32" cy="32" r="27" stroke-dasharray="${(c.pct / 100 * 169.6).toFixed(1)} 169.6"/></svg><b>${c.pct} %</b><span>${esc(team)}</span>${c.missing.length ? `<small>✗ ${c.missing.map(id => D.skill(id).label).join(', ')}</small>` : ''}</div>`; };

function p02() {
    return {
        key: '02-sections', title: 'Sections',
        sub: 'Carte, matrice, tableau de bord, mobilité, catalogue — chaque section garde le vocabulaire du ciel : astres, satellites, constellations de compétences.',
        deskNote: 'tableau de bord : couverture par équipe, ciel des compétences, signaux',
        desk: desk({ mod: dir.mod, top: deskTop('tableau de bord', '📊 Tableau de bord'),
            body: `<div class="cring-grid">${Object.keys(D.REQUIRED).map(coverRing).join('')}</div><section class="card"><div class="card__head"><h3>✨ Ciel des compétences</h3><small>un point = une personne, couleur = niveau</small></div>${D.SKILLS.map(skySkill).join('')}</section>`,
            side: `<h3>🚨 Signaux</h3>${C.SIGNALS.slice(0, 4).map(s => C.signalCard(s, true)).join('')}` }),
        phones: [
            { tag: 'Carte', cap: 'Zoom sur une ligne', why: 'Toucher un secteur zoome sur la ligne produit : ses équipes grossissent, les autres s\'effacent.',
              html: screen({ top: topbar('Logistique', { back: true, sub: 'Cobalt · Delta' }), body: `<div class="orbit-frame orbit-frame--m orbit-frame--zoom">${mobileMap({ select: 'Delta', skill: 'k8s' })}</div>${C.signalCard(C.SIGNALS[1])}`, tabbar: tabbar('carte') }) },
            { tag: 'Matrice', cap: 'Ciel des compétences', why: 'La matrice devient une ligne de points par compétence : la densité (ou le vide) se voit avant les chiffres.',
              html: screen({ top: topbar('Matrice', { sub: '10 compétences' }), body: D.SKILLS.map(skySkill).join(''), tabbar: tabbar('matrice') }) },
            { tag: 'Tableau de bord', cap: 'Couverture par équipe', why: 'Un anneau par équipe, la compétence manquante écrite dessous : le trou est nommé, pas seulement compté.',
              html: screen({ top: topbar('Tableau de bord'), body: `<div class="cring-grid cring-grid--m">${Object.keys(D.REQUIRED).map(coverRing).join('')}</div>${C.SIGNALS.slice(0, 2).map(s => C.signalCard(s, true)).join('')}`, tabbar: tabbar('bord') }) },
            { tag: 'Mobilité', cap: 'Trajectoires', why: 'Mêmes cartes que la page dédiée : la mobilité est une section, pas une modale.',
              html: screen({ top: topbar('Mobilité'), body: C.MOBILITY.map(C.mobCard).join(''), tabbar: tabbar('mobilite') }) },
            { tag: 'Catalogue', cap: 'Compétences du train', why: 'Groupées par catégorie, réordonnables : l\'ordre du catalogue est l\'ordre des axes du radar.',
              html: screen({ top: topbar('Catalogue', { actions: btn('＋', 'icon primary') }), body: C.catalogBody(), tabbar: tabbar('catalogue') }) },
        ],
        notes: [
            '<strong>Tableau de bord en anneaux</strong> : la couverture des compétences requises par équipe, avec la compétence manquante nommée sous l\'anneau.',
            '<strong>« Ciel des compétences »</strong> remplace un tableau pour la vue d\'ensemble : une rangée de points par compétence, colorés par niveau — Sécurité et Kafka se voient pauvres sans un chiffre.',
            '<strong>Le zoom suit la hiérarchie</strong> (programme → ligne → équipe) au lieu d\'un zoom libre : on ne se perd jamais dans la carte.',
        ],
    };
}

/* ── 04 — atelier de staffing ─ */
function p04() {
    const sim = C.SIM;
    return {
        key: '04-atelier', title: 'Atelier de staffing',
        sub: 'En séance (PI Planning, revue d\'effectif) : on déplace une personne sur la carte, l\'impact s\'affiche avant toute décision. Rien n\'est enregistré.',
        deskNote: 'déplacement simulé sur la carte, impact dans le panneau',
        desk: desk({ mod: dir.mod, top: deskTop('atelier de staffing', '🗺️ Carte'), body: `${C.simBanner()}<div class="orbit-frame">${orbitMap({ skill: 'k8s', select: 'Delta', sim })}</div>`, side: `<h3>🔀 Impact de la simulation</h3>${C.simImpact()}` }),
        phones: [
            { tag: 'Déplacer', cap: 'Glisser Théo vers Delta', why: 'Appui long sur un satellite, puis choix de l\'équipe : le geste de la carte, sans glisser-déposer au doigt (imprécis).',
              html: screen({ top: topbar('Atelier', { sub: 'Simulation' }), body: `<div class="orbit-frame orbit-frame--m">${mobileMap({ skill: 'k8s', select: 'Éole' })}</div>` + sheet(`🔀 Déplacer ${esc(sim.who.first)} vers…`, Object.keys(D.REQUIRED).filter(t => t !== 'Éole').map(t => `<div class="row">${teamDot(t)}<span class="row__main"><b>${esc(t)}</b><span class="row__meta">couverture ${D.coverage(t).pct} %</span></span>${t === 'Delta' ? chip('+25 %', 'ok') : ''}</div>`).join('')) }) },
            { tag: 'Impact', cap: 'Avant / après', why: 'Chaque effet est daté et chiffré, y compris ce qu\'on perd (Éole −1, 3 tickets à réattribuer).',
              html: screen({ top: topbar('Atelier', { sub: 'Simulation' }), body: C.simBanner() + `<div class="orbit-frame orbit-frame--m">${mobileMap({ skill: 'k8s', select: 'Delta', sim })}</div>` + C.simImpact() }) },
            PC.phoneAlert(),
            PC.phoneEmpty(),
        ],
        notes: [
            '<strong>La simulation est un mode, pas une action</strong> : bandeau rouge permanent, satellite fantôme à l\'ancienne place, trajectoire pointillée — impossible de la confondre avec l\'état réel.',
            '<strong>L\'impact compte ce qu\'on perd</strong> autant que ce qu\'on gagne : couverture des deux équipes, effectif, tickets à réattribuer.',
            '<strong>« Proposer au PI Planning »</strong> plutôt qu\'« Appliquer » : l\'Atlas éclaire une décision d\'équipe, il ne la prend pas.',
        ],
    };
}

const backdrop = () => `${mapTools}<div class="orbit-frame">${orbitMap()}</div>`;
const backdropMobile = () => `<div class="orbit-frame orbit-frame--m">${mobileMap()}</div>`;

module.exports = {
    dir,
    pages: () => [p01(), p02(),
        PC.p03(dir, { backdrop, backdropMobile, notes: ['<strong>Les modales naissent de la carte</strong> : toucher un satellite ouvre la fiche, la carte reste visible dessous (contexte conservé).', '<strong>Feuilles du bas sur mobile</strong>, modale large sur desktop — mêmes contenus, mêmes boutons.', '<strong>Suppression sans confirmation</strong> mais annulable : le catalogue ne perd rien pendant 30 jours.'] }),
        p04(),
        PC.p05(dir, { notes: ['<strong>La mobilité a sa page</strong> : souhait, plan, suivi, bilan — un cycle de vie complet, pas un champ « appétence ».', '<strong>Chaque trajectoire dit son coût pour l\'équipe</strong> et propose une relève : la carte et la mobilité se répondent.'] })],
};
