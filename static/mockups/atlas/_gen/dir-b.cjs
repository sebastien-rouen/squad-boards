/**
 * Direction B — 🟩 MATRICE : le diagnostic d'abord.
 * Une heatmap dense personnes × compétences, groupée par équipe, compétences REQUISES cerclées,
 * ligne « sachants » avec bus factor. Sur mobile, la grille devient une liste PAR COMPÉTENCE
 * (histogramme des niveaux + sachants) : une grille 2D ne se lit pas au pouce.
 */
const U = require('./ui.cjs');
const C = require('./common.cjs');
const PC = require('./pages-common.cjs');
const { D, av, lvl, ap, chip, btn, esc, tc, teamDot, screen, topbar, tabbar, seg, sheet, desk, deskTop } = U;

const dir = {
    key: 'b-matrice', num: 2, name: 'Matrice', nextName: 'Profils', mod: '', icon: '🟩',
    pitch: 'Le diagnostic d\'abord : toute la Skills Matrix sur un écran, compétences requises cerclées, bus factor en pied de colonne.',
    traits: ['Heatmap 26 × 10', 'Requises cerclées', 'Envie en ambre', 'Bus factor 🚌', 'Mobile par compétence'],
    plus: 'Densité et précision : tout se compare sans défiler ; la plus proche de l\'Atlas actuel (migration douce) et la plus simple à coder.',
    minus: 'Froide et chiffrée ; l\'organisation et les personnes passent au second plan. Sur mobile, la grille doit changer d\'axe.',
    moment: 'Revue des compétences par un manager, campagne d\'évaluation.',
};

const TEAMS = Object.keys(D.REQUIRED);
const head = (focus = 'kafka') => `<thead><tr><th class="hm__who">Personne</th>${D.SKILLS.map(s => `<th class="hm__sk${s.id === focus ? ' is-focus' : ''}"><span>${esc(s.label)}</span></th>`).join('')}</tr></thead>`;

/** Une cellule : niveau en couleur, point d'appétence forte, cercle si requis par l'équipe. */
const cell = (p, s, focus, extra = '') => {
    const v = p.levels[s.id];
    const req = D.REQUIRED[p.team].includes(s.id);
    return `<td class="hm__c c-${v}${req ? ' is-req' : ''}${s.id === focus ? ' is-focus' : ''}${extra}">${v || ''}${p.app[s.id] === 'forte' ? '<i class="hm__ap"></i>' : ''}</td>`;
};

/** Heatmap complète ; sim : { who, from, to } ajoute la ligne simulée et grise l'ancienne. */
function heatmap({ teams = TEAMS, focus = 'kafka', sim = null, compact = false } = {}) {
    let rows = '';
    for (const team of teams) {
        const people = D.byTeam(team).slice();
        if (sim && sim.to === team) people.push(sim.who);
        const base = D.coverage(team);
        const miss = sim && sim.to === team ? base.missing.filter(id => sim.who.levels[id] < 2) : base.missing;
        const pct = Math.round((base.total - miss.length) / base.total * 100);
        rows += `<tr class="hm__team ${tc(team)}"><th colspan="${D.SKILLS.length + 1}">${teamDot(team)} ${esc(team)} <small>${people.length} pers. · couverture ${pct} %${miss.length ? ` · ✗ ${miss.map(id => D.skill(id).label).join(', ')}` : ''}</small></th></tr>`;
        for (const p of people) {
            const ghost = sim && p.name === sim.who.name && team === sim.from;
            const moved = sim && p.name === sim.who.name && team === sim.to;
            rows += `<tr class="hm__row${ghost ? ' is-ghost' : ''}${moved ? ' is-moved' : ''}"><th class="hm__who">${av(p, 'xs', D.AWAY[p.name] ? 'av--away' : '')}<span>${esc(p.name)}</span>${moved ? chip('simulé', 'warn') : ''}${D.AWAY[p.name] ? '<em title="Absent prochainement">🌴</em>' : ''}</th>${D.SKILLS.map(s => cell(p, s, focus)).join('')}</tr>`;
        }
    }
    const foot = `<tfoot><tr><th class="hm__who">Sachants (≥ 2)</th>${D.SKILLS.map(s => { const n = D.experts(s.id).length; return `<td class="hm__n${n <= 1 ? ' is-bus' : n <= 3 ? ' is-thin' : ''}">${n}${n <= 1 ? ' 🚌' : ''}</td>`; }).join('')}</tr></tfoot>`;
    return `<div class="hm-wrap${compact ? ' hm-wrap--compact' : ''}"><table class="hm">${head(focus)}<tbody>${rows}</tbody>${foot}</table></div>`;
}

/** Histogramme empilé des niveaux d'une compétence (mobile + panneau). */
const histo = id => {
    const n = [1, 2, 3, 4].map(v => D.PEOPLE.filter(p => p.levels[id] === v).length);
    const tot = n.reduce((a, b) => a + b, 0) || 1;
    return `<span class="histo">${n.map((k, i) => k ? `<i class="c-${i + 1}" style="flex:${k}" title="Niveau ${i + 1} : ${k}">${k}</i>` : '').join('')}</span><small>${tot} évalué${tot > 1 ? 's' : ''} / 26</small>`;
};

const skillCard = (s, open = false) => {
    const ex = D.experts(s.id);
    return `<article class="skc${open ? ' skc--open' : ''}${ex.length <= 1 ? ' skc--bus' : ''}"><div class="skc__head"><b>${esc(s.label)}</b><small>${esc(s.cat)}</small><span class="spacer"></span>${ex.length <= 1 ? chip('🚌 ' + ex.length, 'danger') : chip(ex.length + ' sachants')}</div>${histo(s.id)}`
        + (open ? `<div class="skc__people">${D.PEOPLE.filter(p => p.levels[s.id]).sort((a, b) => b.levels[s.id] - a.levels[s.id]).map(p => `<span class="pchip">${av(p, 'xs')}${esc(p.first)}${lvl(p.levels[s.id])}</span>`).join('')}</div>` : '') + '</article>';
};

const tools = (focus = 'Kafka') => `<div class="toolbar">${seg(['Personnes', 'Équipes'], 'Personnes')}<span class="search">🔍 Rechercher</span>${chip('Requises')}${chip('Masquer vides')}<span class="spacer"></span><span class="hm-legend">${[1, 2, 3, 4].map(v => lvl(v)).join('')}<i class="hm__ap"></i><small>envie</small><i class="hm-req"></i><small>requise</small></span></div>`;

const colPanel = id => `<div class="card__head"><h3>🎯 ${esc(D.skill(id).label)}</h3><span class="spacer"></span>${chip('🚌 bus factor 1', 'danger')}</div><div class="histo-lg">${histo(id)}</div>`
    + `<h4 class="sec-title">Qui sait</h4>${D.PEOPLE.filter(p => p.levels[id]).sort((a, b) => b.levels[id] - a.levels[id]).map(p => `<div class="row">${av(p, 'sm', D.AWAY[p.name] ? 'av--away' : '')}<span class="row__main"><b>${esc(p.name)}</b><span class="row__meta">${esc(p.team)}${D.AWAY[p.name] ? ' · 🌴 ' + D.AWAY[p.name] : ''}</span></span>${ap(p.app[id])}${lvl(p.levels[id])}</div>`).join('')}`
    + `<h4 class="sec-title">Requise par</h4><div class="inline">${TEAMS.filter(t => D.REQUIRED[t].includes(id)).map(t => chip(teamDot(t) + ' ' + t, 'team ' + tc(t))).join('')}</div>`
    + `<div class="inline">${btn('🧭 Qui affecter ?', 'primary sm')}${btn('🚀 Monter en compétence', 'sm')}</div>`;

/* ── 01 ─ */
function p01() {
    return {
        key: '01-atlas', title: 'Écran principal',
        sub: 'Toute la matrice sur un écran : 26 personnes × 10 compétences, groupées par équipe. Les compétences requises sont cerclées, la ligne du bas compte les sachants.',
        deskNote: 'heatmap dense + colonne sélectionnée en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('skills matrix', '🎯 Matrice'), body: tools() + heatmap({ compact: true }), side: colPanel('kafka') }),
        solo: screen({ solo: true, top: topbar('Matrice', { sub: '10 compétences · 26 personnes', actions: btn('🔍', 'icon ghost') }),
            body: `${seg(['Compétences', 'Personnes', 'Équipes'], 'Compétences')}<div class="inline">${chip('Trier : risque', 'on')}${chip('Requises')}</div>${D.SKILLS.slice().sort((a, b) => D.experts(a.id).length - D.experts(b.id).length).map(s => skillCard(s, s.id === 'kafka')).join('')}`,
            tabbar: tabbar('matrice') }),
        notes: [
            '<strong>Tout tient sans défiler</strong> en 1280 × 820 : lignes de 18 px, chiffres dans les cases, équipes en bandeaux. C\'est la vue « revue des compétences » d\'un manager.',
            '<strong>Ce qui compte est marqué, pas déduit</strong> : case cerclée = compétence requise par l\'équipe de la personne ; point ambre = envie ; 🚌 en pied de colonne = un seul sachant.',
            '<strong>Mobile : on change d\'axe</strong>. La grille devient une liste de compétences triée par risque, chacune avec son histogramme de niveaux — et les personnes au toucher.',
            '<strong>Limite</strong> : dense et froid ; l\'organisation (lignes produit) n\'apparaît que par les bandeaux d\'équipe.',
        ],
    };
}

/* ── 02 ─ */
const teamMatrix = () => `<div class="hm-wrap"><table class="hm hm--teams"><thead><tr><th class="hm__who">Équipe</th>${D.SKILLS.map(s => `<th class="hm__sk"><span>${esc(s.label)}</span></th>`).join('')}<th>Couv.</th></tr></thead><tbody>`
    + TEAMS.map(t => { const c = D.coverage(t); return `<tr class="hm__row"><th class="hm__who">${teamDot(t)}<span>${esc(t)}</span></th>${D.SKILLS.map(s => { const a = D.avgLevel(s.id, D.byTeam(t)); const req = D.REQUIRED[t].includes(s.id); const gap = c.missing.includes(s.id); return `<td class="hm__c c-${Math.round(a)}${req ? ' is-req' : ''}${gap ? ' is-gap' : ''}">${a ? String(a).replace('.', ',') : ''}</td>`; }).join('')}<td class="hm__n${c.missing.length ? ' is-bus' : ''}">${c.pct} %</td></tr>`; }).join('')
    + '</tbody></table></div>';

function p02() {
    const people = D.byTeam('Cobalt');
    const scroll = `<div class="hm-scroll"><table class="hm hm--m"><thead><tr><th class="hm__who">Cobalt</th>${D.SKILLS.map(s => `<th class="hm__sk"><span>${esc(s.label)}</span></th>`).join('')}</tr></thead><tbody>${people.map(p => `<tr class="hm__row"><th class="hm__who">${av(p, 'xs')}<span>${esc(p.first)}</span></th>${D.SKILLS.map(s => cell(p, s, null)).join('')}</tr>`).join('')}</tbody></table></div>`;
    return {
        key: '02-sections', title: 'Sections',
        sub: 'La matrice décline tout en tableaux : équipes × compétences (niveau moyen), registre par personne, tableau de bord chiffré.',
        deskNote: 'vue Équipes : niveau moyen par compétence, trous en rouge, comparaison en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('équipes × compétences', '🎯 Matrice'), body: `<div class="toolbar">${seg(['Personnes', 'Équipes'], 'Équipes')}<span class="spacer"></span>${btn('⚖️ Comparer', 'sm')}</div>${teamMatrix()}<div class="kpis kpis--5">${[['26', 'personnes'], ['10', 'compétences'], ['1', 'trou de couverture', 'danger'], ['2', 'bus factor 1', 'danger'], ['74 %', 'évaluations < 6 mois', 'warn']].map(([v, l, m]) => `<div class="kpi${m ? ' kpi--' + m : ''}"><span class="kpi__v">${v}</span><span class="kpi__l">${l}</span></div>`).join('')}</div>`,
            side: `<h3>⚖️ Comparer Delta et Éole</h3><div class="mfiche__radar">${U.radar(U.teamLevels('Delta'), { size: 230, compare: U.teamLevels('Éole') })}<small>trait plein : Delta · pointillé : Éole</small></div><div class="callout">Éole a 4 personnes ≥ 2 en Kubernetes, Delta aucune : le prêt d'un Éolien est l'option la plus rapide.</div>` }),
        phones: [
            { tag: 'Carte', cap: 'Organisation en liste', why: 'La carte devient une arborescence ligne → équipe, avec une bande de couleur par équipe qui résume ses niveaux.',
              html: screen({ top: topbar('Organisation'), body: D.LINES.map(l => `<h4 class="sec-title">${esc(l.name)}</h4>` + l.teams.map(t => `<div class="row">${teamDot(t)}<span class="row__main"><b>${esc(t)}</b><span class="row__meta">${D.byTeam(t).length} pers. · couverture ${D.coverage(t).pct} %</span></span><span class="strip">${D.SKILLS.map(s => `<i class="c-${Math.round(D.avgLevel(s.id, D.byTeam(t)))}"></i>`).join('')}</span></div>`).join('')).join(''), tabbar: tabbar('carte') }) },
            { tag: 'Matrice', cap: 'Grille d\'une équipe', why: 'Quand on veut vraiment la grille : une équipe à la fois, première colonne collante, défilement horizontal.',
              html: screen({ top: topbar('Cobalt', { back: true, sub: 'défiler → pour les compétences' }), body: scroll, tabbar: tabbar('matrice') }) },
            { tag: 'Tableau de bord', cap: 'Les chiffres qui comptent', why: 'Cinq chiffres, puis les compétences classées par risque : le tableau de bord est un tri, pas une galerie de graphiques.',
              html: screen({ top: topbar('Tableau de bord'), body: `<div class="kpis">${[['1', 'trou', 'danger'], ['2', 'bus factor 1', 'danger'], ['74 %', 'à jour', 'warn']].map(([v, l, m]) => `<div class="kpi kpi--${m}"><span class="kpi__v">${v}</span><span class="kpi__l">${l}</span></div>`).join('')}</div>${['kafka', 'secu', 'factu'].map(id => skillCard(D.skill(id))).join('')}`, tabbar: tabbar('bord') }) },
            { tag: 'Mobilité', cap: 'Trajectoires', why: 'Section commune, en liste.', html: screen({ top: topbar('Mobilité'), body: C.MOBILITY.map(C.mobCard).join(''), tabbar: tabbar('mobilite') }) },
            { tag: 'Catalogue', cap: 'Compétences', why: 'L\'ordre du catalogue est l\'ordre des colonnes de la matrice.', html: screen({ top: topbar('Catalogue', { actions: btn('＋', 'icon primary') }), body: C.catalogBody(), tabbar: tabbar('catalogue') }) },
        ],
        notes: [
            '<strong>Vue Équipes = niveau MOYEN</strong> par compétence, case rouge pour une compétence requise sans sachant : on lit le trou de Delta en Kubernetes sans ouvrir l\'équipe.',
            '<strong>Comparer</strong> passe dans le panneau (radars superposés) au lieu d\'une modale : on garde la grille sous les yeux.',
            '<strong>Mobile : une équipe à la fois</strong> pour la grille, première colonne collante — jamais 26 lignes × 10 colonnes au pouce.',
        ],
    };
}

/* ── 04 ─ */
function p04() {
    const sim = C.SIM;
    return {
        key: '04-atelier', title: 'Atelier de staffing',
        sub: 'La simulation se fait DANS la grille : la ligne de Théo apparaît chez Delta (simulée), grisée chez Éole ; les bandeaux recalculent la couverture.',
        deskNote: 'ligne simulée dans la grille, impact en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('atelier de staffing', '🎯 Matrice'), body: C.simBanner() + heatmap({ teams: ['Delta', 'Éole'], focus: 'k8s', sim }), side: `<h3>🔀 Impact de la simulation</h3>${C.simImpact()}` }),
        phones: [
            { tag: 'Déplacer', cap: 'Depuis la ligne de Théo', why: 'Le geste part de la personne (⋯ → Déplacer), la cible affiche son gain de couverture.',
              html: screen({ top: topbar('Éole', { back: true }), body: heatmap({ teams: ['Éole'], focus: 'k8s', compact: true }) + sheet(`🔀 Déplacer ${esc(sim.who.first)} vers…`, TEAMS.filter(t => t !== 'Éole').map(t => `<div class="row">${teamDot(t)}<span class="row__main"><b>${esc(t)}</b><span class="row__meta">couverture ${D.coverage(t).pct} %</span></span>${t === 'Delta' ? chip('+25 %', 'ok') : ''}</div>`).join('')) }) },
            { tag: 'Impact', cap: 'Avant / après', why: 'Mêmes chiffres que sur desktop ; la grille simulée est à un toucher.', html: screen({ top: topbar('Atelier', { sub: 'Simulation' }), body: C.simBanner() + C.simImpact() }) },
            PC.phoneAlert(),
            PC.phoneEmpty(),
        ],
        notes: [
            '<strong>La grille est l\'outil de l\'atelier</strong> : on voit case par case ce que Théo apporte à Delta (Kubernetes 3) et ce qu\'Éole garde.',
            '<strong>Ligne fantôme hachurée</strong> à l\'ancienne place, badge « simulé » à la nouvelle : l\'état réel n\'est jamais ambigu.',
        ],
    };
}

const backdrop = () => tools() + heatmap({ compact: true });
const backdropMobile = () => D.SKILLS.slice(0, 4).map(s => skillCard(s)).join('');

module.exports = {
    dir,
    pages: () => [p01(), p02(),
        PC.p03(dir, { backdrop, backdropMobile, notes: ['<strong>Toucher une case ouvre l\'évaluation</strong> de cette personne sur cette compétence — le geste le plus fréquent de la matrice.', '<strong>Toucher un nom ouvre la fiche</strong> ; toucher un en-tête de colonne, le panneau de la compétence.', '<strong>Suppression annulable</strong> : la colonne disparaît, « Annuler » la rétablit.'] }),
        p04(),
        PC.p05(dir, { notes: ['<strong>La trajectoire se lit comme un écart de profil</strong> (radar Lina vs Scrum Master) — cohérent avec la lecture chiffrée de la matrice.', '<strong>L\'effet sur l\'équipe est chiffré</strong> : Angular passe à 1 sachant chez Cobalt si Lina évolue.'] })],
};
