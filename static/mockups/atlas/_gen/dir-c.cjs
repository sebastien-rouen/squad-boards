/**
 * Direction C — 🧑‍🤝‍🧑 PROFILS : les personnes d'abord.
 * Un trombinoscope de cartes de profil (forces, envie, disponibilité, prochain jalon) : l'Atlas comme
 * outil de coaching et d'entretien. L'équipe se lit en visages ; les compétences sont un attribut des gens.
 */
const U = require('./ui.cjs');
const C = require('./common.cjs');
const PC = require('./pages-common.cjs');
const { D, av, lvl, ap, chip, btn, radar, esc, tc, teamDot, screen, topbar, tabbar, sheet, desk, deskTop } = U;

const dir = {
    key: 'c-profils', num: 3, name: 'Profils', nextName: 'Signaux', mod: '', icon: '🧑‍🤝‍🧑',
    pitch: 'Les personnes d\'abord : un trombinoscope de cartes (forces, envie, prochain jalon) qui prépare les entretiens et les trajectoires.',
    traits: ['Cartes de profil', 'Envie visible', 'Prochain jalon', 'Préparation d\'entretien', 'Atelier en colonnes'],
    plus: 'Humaine et engageante ; met la mobilité et le coaching au centre. Les envies deviennent un levier visible pour combler les manques.',
    minus: '26 cartes ne se comparent pas d\'un regard ; la vue programme (couverture globale) est faible.',
    moment: 'Entretiens individuels, coaching, plans de développement.',
};

/** Jalon le plus proche d'une personne (entretien, montée, trajectoire, absence). */
const NEXT = {
    'Lina Fournier': '🧭 Rétro animée le 14 nov.', 'Hugo Bernard': '📈 Kafka 2 visé · sprint 32.2', 'Noah Roux': '🌴 Absent du 2 au 13 nov.',
    'Théo Lefèvre': '🧭 Expert Kubernetes · étape 3/4', 'Manon Lambert': '🎓 Formation Kubernetes proposée', 'Inès Petit': '🌴 Absente le 6 nov.',
};
const wants = p => D.SKILLS.filter(s => p.app[s.id] === 'forte');

/** Carte de profil. size : 'm' (grille desktop) | 's' (liste mobile). */
const pcard = (p, { sel = false, sim = '' } = {}) => {
    const top = C.topSkills(p, 3);
    const w = wants(p);
    return `<article class="pc ${tc(p.team)}${sel ? ' pc--sel' : ''}${sim ? ' pc--' + sim : ''}${D.AWAY[p.name] ? ' pc--away' : ''}">`
        + `<div class="pc__top">${av(p, 'lg', D.AWAY[p.name] ? 'av--away' : '')}<div class="pc__id"><b>${esc(p.name)}</b><span>${esc(p.role)} · ${esc(p.team)}</span></div>${sim === 'moved' ? chip('simulé', 'warn') : ''}</div>`
        + `<div class="pc__skills">${top.map(s => `<span class="pc__sk">${lvl(p.levels[s.id])}${esc(s.label)}</span>`).join('')}</div>`
        + `<div class="pc__foot">${w.length ? `<span class="pc__want">${ap('forte')} envie : ${w.map(s => esc(s.label)).join(', ')}</span>` : '<span class="pc__want pc__want--none">pas d\'envie exprimée</span>'}`
        + `${NEXT[p.name] ? `<span class="pc__next">${NEXT[p.name]}</span>` : ''}</div></article>`;
};

const teamFilter = on => `<div class="toolbar"><span class="search">🔍 Personne, compétence…</span>${['Toutes', ...Object.keys(D.REQUIRED)].map(t => chip(t === 'Toutes' ? t : teamDot(t) + ' ' + t, t === on ? 'on' : '')).join('')}<span class="spacer"></span>${btn('↕ Trier : envie', 'sm ghost')}</div>`;

const sidePerson = p => `<div class="mfiche__head">${av(p, 'xl')}<div class="stack"><b class="mfiche__name">${esc(p.name)}</b>${chip(teamDot(p.team) + ' ' + p.team + ' · ' + p.role, 'team ' + tc(p.team))}</div></div>`
    + `<div class="mfiche__radar">${radar(p.levels, { size: 220, compare: U.teamLevels(p.team) })}</div>`
    + `<h4 class="sec-title">Prochain entretien · 18 nov.</h4><div class="stack prep"><span>✅ Rétro Cobalt animée (1/2)</span><span>💬 Parler de la formation PSM I</span><span>⚖️ Relève Angular : Zoé ?</span></div>`
    + `<div class="inline">${btn('🧭 Trajectoire', 'primary sm')}${btn('✏️ Évaluer', 'sm')}</div>`;

/* ── 01 ─ */
function p01() {
    const people = [...D.byTeam('Cobalt'), ...D.byTeam('Delta')];
    return {
        key: '01-atlas', title: 'Écran principal',
        sub: 'Un trombinoscope : chaque carte dit les forces, l\'envie et le prochain jalon de la personne. L\'Atlas sert d\'abord le coaching et les entretiens.',
        deskNote: 'cartes de profil de la ligne Logistique + préparation d\'entretien en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('les personnes', '🗺️ Carte'), body: teamFilter('Toutes') + `<div class="pc-groups"><h4 class="sec-title">${teamDot('Cobalt')} Cobalt · 5</h4><div class="pc-grid">${D.byTeam('Cobalt').map(p => pcard(p, { sel: p.name === 'Lina Fournier' })).join('')}</div><h4 class="sec-title">${teamDot('Delta')} Delta · 5 <span class="gap-tag">✗ Kubernetes non couvert</span></h4><div class="pc-grid">${D.byTeam('Delta').map(p => pcard(p)).join('')}</div></div>`, side: sidePerson(C.lina) }),
        solo: screen({ solo: true, top: topbar('Les personnes', { sub: 'Logistique · 10 personnes', actions: btn('🔍', 'icon ghost') }),
            body: `<div class="chips-row">${['Toutes', 'Cobalt', 'Delta', 'Alpha'].map(t => chip(t, t === 'Cobalt' ? 'on' : '')).join('')}</div>${people.slice(0, 5).map(p => pcard(p, { sel: p.name === 'Lina Fournier' })).join('')}`,
            tabbar: tabbar('carte') }),
        notes: [
            '<strong>Une personne = une carte</strong> : trois forces (niveau + compétence), l\'envie en ambre, le prochain jalon (absence, montée, trajectoire). On prépare un entretien en lisant une carte.',
            '<strong>Le panneau prépare l\'entretien</strong> : radar comparé à l\'équipe, et une check-list tirée de la trajectoire en cours.',
            '<strong>L\'équipe se lit en visages</strong>, avec son trou de couverture écrit dans l\'en-tête du groupe — jamais un pourcentage seul.',
            '<strong>Limite</strong> : 26 cartes ne se comparent pas d\'un coup d\'œil ; la vue programme se fait par filtre d\'équipe, pas par carte globale.',
        ],
    };
}

/* ── 02 ─ */
function p02() {
    const cobalt = D.byTeam('Cobalt');
    return {
        key: '02-sections', title: 'Sections',
        sub: 'Chaque section parle de gens : l\'organigramme est un mur de visages, la matrice une fiche par personne, le tableau de bord une liste de qui accompagner.',
        deskNote: 'vue d\'une équipe : visages, forces et faiblesses collectives, envies',
        desk: desk({ mod: dir.mod, top: deskTop('équipe Cobalt', '📊 Tableau de bord'),
            body: `<div class="team-hero ${tc('Cobalt')}"><div class="faces">${cobalt.map(p => av(p, 'lg', D.AWAY[p.name] ? 'av--away' : '')).join('')}</div><div class="stack"><b>Cobalt</b><small>Logistique · 5 personnes · couverture 100 %</small></div><span class="spacer"></span>${btn('⚖️ Comparer', 'sm')}</div>`
                + `<div class="grid2"><section class="card"><h3>💪 Forces collectives</h3>${['java', 'stock', 'sql'].map(id => `<div class="row"><span class="row__main"><b>${D.skill(id).label}</b><span class="row__meta">${D.experts(id, 'Cobalt').map(p => p.first).join(', ')}</span></span>${lvl(Math.round(D.avgLevel(id, cobalt)))}</div>`).join('')}</section>`
                + `<section class="card"><h3>🌱 À développer</h3>${['kafka', 'secu', 'angular'].map(id => `<div class="row"><span class="row__main"><b>${D.skill(id).label}</b><span class="row__meta">${D.experts(id, 'Cobalt').length} sachant(s) · ${D.PEOPLE.filter(p => p.team === 'Cobalt' && p.app[id] === 'forte').map(p => p.first).join(', ') || 'aucune envie'}</span></span>${chip(D.experts(id, 'Cobalt').length <= 1 ? 'fragile' : 'ok', D.experts(id, 'Cobalt').length <= 1 ? 'danger' : 'ok')}</div>`).join('')}</section></div>`
                + `<section class="card"><h3>✨ Envies dans l'équipe</h3><div class="inline">${cobalt.flatMap(p => wants(p).map(s => `<span class="want-chip">${av(p, 'xs')}${esc(p.first)} → ${esc(s.label)}</span>`)).join('')}</div></section>`,
            side: `<h3>📋 À accompagner</h3>${[['Hugo Bernard', 'Montée Kafka en cours'], ['Lina Fournier', 'Trajectoire Scrum Master'], ['Manon Lambert', 'Envie Kubernetes, non évaluée depuis 8 mois']].map(([n, t]) => `<div class="row">${av(D.person(n), 'sm')}<span class="row__main"><b>${esc(n)}</b><span class="row__meta">${t}</span></span></div>`).join('')}` }),
        phones: [
            { tag: 'Carte', cap: 'Mur de visages', why: 'L\'organigramme en visages par équipe : on reconnaît avant de lire.',
              html: screen({ top: topbar('Organisation'), body: Object.keys(D.REQUIRED).map(t => `<section class="face-team ${tc(t)}"><div class="inline"><b>${esc(t)}</b><small>${D.coverage(t).pct} %</small></div><div class="faces faces--sm">${D.byTeam(t).map(p => av(p, 'md', D.AWAY[p.name] ? 'av--away' : '')).join('')}</div></section>`).join(''), tabbar: tabbar('carte') }) },
            { tag: 'Matrice', cap: 'Une personne à la fois', why: 'La matrice en fiche : toutes les compétences d\'une personne en barres, on fait défiler les personnes (‹ ›).',
              html: screen({ top: topbar('Hugo Bernard', { back: true, sub: '‹ 2 / 26 ›' }), body: D.SKILLS.map(s => `<div class="skbar"><span>${esc(s.label)}</span><span class="skbar__track"><i class="c-${C.hugo.levels[s.id]}" style="width:${C.hugo.levels[s.id] * 25}%"></i></span>${ap(C.hugo.app[s.id])}${lvl(C.hugo.levels[s.id])}</div>`).join(''), tabbar: tabbar('matrice') }) },
            { tag: 'Tableau de bord', cap: 'Qui accompagner', why: 'Le tableau de bord d\'un manager : des noms et une raison, pas des jauges.',
              html: screen({ top: topbar('À accompagner'), body: [['Hugo Bernard', 'Montée Kafka en cours'], ['Lina Fournier', 'Trajectoire Scrum Master'], ['Manon Lambert', 'Envie Kubernetes · non évaluée depuis 8 mois'], ['Jade Laurent', 'Envie Sécurité, sans plan']].map(([n, t]) => `<div class="row">${av(D.person(n), 'md')}<span class="row__main"><b>${esc(n)}</b><span class="row__meta">${t}</span></span>›</div>`).join(''), tabbar: tabbar('bord') }) },
            { tag: 'Mobilité', cap: 'Trajectoires', why: 'Section commune.', html: screen({ top: topbar('Mobilité'), body: C.MOBILITY.map(C.mobCard).join(''), tabbar: tabbar('mobilite') }) },
            { tag: 'Catalogue', cap: 'Compétences', why: 'Section commune.', html: screen({ top: topbar('Catalogue', { actions: btn('＋', 'icon primary') }), body: C.catalogBody(), tabbar: tabbar('catalogue') }) },
        ],
        notes: [
            '<strong>Forces et « à développer » d\'une équipe</strong> nommées avec les gens qui les portent — et les envies qui pourraient combler un manque (personne chez Cobalt n\'a envie de Kafka : c\'est le vrai risque).',
            '<strong>« À accompagner »</strong> remplace les KPI : une liste de personnes et la raison (montée en cours, trajectoire, envie sans plan, évaluation ancienne).',
        ],
    };
}

/* ── 04 ─ */
function p04() {
    const sim = C.SIM;
    const col = (team, people, extra = '') => `<section class="ws-col ${tc(team)}"><header>${teamDot(team)} <b>${esc(team)}</b>${extra}</header>${people}</section>`;
    return {
        key: '04-atelier', title: 'Atelier de staffing',
        sub: 'L\'atelier pose les équipes côte à côte en colonnes de cartes : on glisse la carte de Théo d\'Éole vers Delta, les en-têtes recalculent.',
        deskNote: 'colonnes d\'équipes, carte glissée, impact en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('atelier de staffing', '🗺️ Carte'), body: C.simBanner() + `<div class="ws">${col('Éole', D.byTeam('Éole').map(p => pcard(p, { sim: p.name === sim.who.name ? 'ghost' : '' })).join(''), ' <small>100 % · 4 pers.</small>')}${col('Delta', [...D.byTeam('Delta').map(p => pcard(p)), pcard(sim.who, { sim: 'moved' })].join(''), ' <small class="up">75 → 100 %</small>')}</div>`, side: `<h3>🔀 Impact de la simulation</h3>${C.simImpact()}` }),
        phones: [
            { tag: 'Déplacer', cap: 'Depuis la carte de Théo', why: 'Menu ⋯ de la carte → « Déplacer vers… » : au doigt, un choix dans une liste vaut mieux qu\'un glisser.',
              html: screen({ top: topbar('Éole', { back: true }), body: D.byTeam('Éole').slice(0, 3).map(p => pcard(p)).join('') + sheet(`🔀 Déplacer ${esc(sim.who.first)} vers…`, Object.keys(D.REQUIRED).filter(t => t !== 'Éole').map(t => `<div class="row">${teamDot(t)}<span class="row__main"><b>${esc(t)}</b><span class="row__meta">couverture ${D.coverage(t).pct} %</span></span>${t === 'Delta' ? chip('+25 %', 'ok') : ''}</div>`).join('')) }) },
            { tag: 'Impact', cap: 'Avant / après', why: 'Mêmes chiffres partout.', html: screen({ top: topbar('Atelier', { sub: 'Simulation' }), body: C.simBanner() + pcard(sim.who, { sim: 'moved' }) + C.simImpact() }) },
            PC.phoneAlert(),
            PC.phoneEmpty(),
        ],
        notes: [
            '<strong>Colonnes d\'équipes, cartes de personnes</strong> : l\'atelier ressemble à un tableau d\'affectation physique — on déplace des gens, pas des lignes.',
            '<strong>La carte fantôme reste à sa place d\'origine</strong>, la carte simulée porte un badge : on garde la trace du mouvement.',
        ],
    };
}

const backdrop = () => teamFilter('Cobalt') + `<div class="pc-grid">${D.byTeam('Cobalt').map(p => pcard(p)).join('')}</div>`;
const backdropMobile = () => D.byTeam('Cobalt').slice(0, 3).map(p => pcard(p)).join('');

module.exports = {
    dir,
    pages: () => [p01(), p02(),
        PC.p03(dir, { backdrop, backdropMobile, notes: ['<strong>La fiche prolonge la carte</strong> : même avatar, mêmes forces, plus le radar et l\'historique.', '<strong>Évaluer depuis la fiche</strong> : on évalue une personne, dans le contexte d\'un entretien.', '<strong>Suppression annulable</strong> dans le catalogue.'] }),
        p04(),
        PC.p05(dir, { notes: ['<strong>La mobilité est le cœur de cette direction</strong> : chaque carte de profil y mène (jalon « 🧭 »), la trajectoire prépare le prochain entretien.', '<strong>L\'effet sur l\'équipe</strong> est dit avec un nom : la relève proposée.'] })],
};
