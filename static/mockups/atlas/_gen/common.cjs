/**
 * Contenu MÉTIER commun aux quatre directions (même plan de contenu partout, seule l'identité change) :
 * signaux, fiche membre, évaluation, montée en compétence, « Qui affecter ? », catalogue, atelier de
 * simulation, mobilité. Les directions composent ces blocs autour de leur écran signature.
 */
const U = require('./ui.cjs');
const { D, av, lvl, ap, chip, btn, bar, radar, esc, tc, teamDot, field, levelPicker, appPicker, empty } = U;

const P = name => D.person(name);
const noah = P('Noah Roux'), hugo = P('Hugo Bernard'), lina = P('Lina Fournier'), theo = P('Théo Lefèvre'), manon = P('Manon Lambert');

/** Signaux du programme, du plus urgent au moins urgent — même liste pour toutes les directions. */
const SIGNALS = [
    { sev: 'danger', icon: '🚌', title: 'Kafka : un seul sachant', team: 'Cobalt',
      text: `${esc(noah.first)} (niv. 4) porte seul Kafka — absent ${D.AWAY[noah.name]}`,
      who: [noah], actions: ['🤝 Binôme avec Hugo', '📝 Documenter'] },
    { sev: 'danger', icon: '🕳️', title: 'Delta : Kubernetes non couvert', team: 'Delta',
      text: 'Requis par l\'équipe, personne au-dessus du niveau 1.',
      who: [manon], actions: ['🎓 Former Manon (appétence forte)', '🔀 Prêt de Théo (Éole)'] },
    { sev: 'warn', icon: '🛡️', title: 'Sécurité : 2 sachants sur 26', team: null,
      text: 'Niveau moyen 1,4 — aucun référent dans le train.',
      who: [P('Inès Petit'), P('Camille Muller')], actions: ['📚 Plan de formation'] },
    { sev: 'info', icon: '✨', title: 'Lina : envie d\'animer', team: 'Cobalt',
      text: 'Appétence forte « Animation », niveau 2 — trajectoire Scrum Master ouverte.',
      who: [lina], actions: ['🧭 Voir la trajectoire'] },
    { sev: 'ok', icon: '📈', title: 'Hugo : Kafka 1 → 2', team: 'Alpha',
      text: 'Montée en compétence en cours, binôme avec Noah (ticket TRN-412).',
      who: [hugo], actions: ['👀 Suivre'] },
];

const signalCard = (s, compact = false) =>
    `<article class="sig sig--${s.sev}"><span class="sig__icon">${s.icon}</span><div class="sig__main"><b>${s.title}</b>`
    + `${compact ? '' : `<span>${s.text}</span>`}<div class="inline">${s.who.map(p => U.av(p, 'xs')).join('')}${s.team ? U.chip(U.teamDot(s.team) + ' ' + s.team, 'team ' + U.tc(s.team)) : ''}</div>`
    + `${compact ? '' : `<div class="sig__acts">${s.actions.map(a => btn(a, 'sm')).join('')}</div>`}</div></article>`;

/** Compétences les plus fortes d'une personne (niveau puis appétence). */
const topSkills = (p, n = 4) => D.SKILLS.filter(s => p.levels[s.id] > 0)
    .sort((a, b) => p.levels[b.id] - p.levels[a.id] || (p.app[b.id] === 'forte') - (p.app[a.id] === 'forte')).slice(0, n);

const skillLine = (p, s) => `<div class="row"><span class="row__main"><b>${esc(s.label)}</b><span class="row__meta">${esc(s.cat)}</span></span>${ap(p.app[s.id])}${lvl(p.levels[s.id])}</div>`;

/** Contenu de la fiche membre (mobile = feuille, desktop = modale large). */
function memberBody(p, wide = false) {
    const head = `<div class="mfiche__head">${av(p, 'xl', D.AWAY[p.name] ? 'av--away' : '')}<div class="stack"><b class="mfiche__name">${esc(p.name)}</b>`
        + `<span class="inline">${chip(teamDot(p.team) + ' ' + esc(p.team), 'team ' + tc(p.team))}${chip(esc(p.role))}</span>`
        + `${D.AWAY[p.name] ? chip('🌴 Absent ' + D.AWAY[p.name], 'warn') : chip('✓ Disponible', 'ok')}</div></div>`;
    const rad = `<div class="mfiche__radar">${radar(p.levels, { size: wide ? 240 : 220, compare: U.teamLevels(p.team) })}<small>— trait plein : ${esc(p.first)} · pointillé : moyenne ${esc(p.team)}</small></div>`;
    const skills = `<div class="stack"><h4 class="sec-title">Compétences</h4>${topSkills(p, wide ? 6 : 4).map(s => skillLine(p, s)).join('')}</div>`;
    const hist = `<div class="stack"><h4 class="sec-title">Historique</h4><div class="steps">`
        + `<div class="step step--done"><span class="step__dot">✓</span><div class="step__body"><b>Kafka 1 → 2</b><span>12 sept. · évalué par Noah</span></div></div>`
        + `<div class="step step--done"><span class="step__dot">✓</span><div class="step__body"><b>Test auto 2 → 3</b><span>3 juin · entretien annuel</span></div></div></div></div>`;
    const acts = `<div class="inline">${btn('✏️ Évaluer', 'primary')}${btn('🚀 Monter en compétence')}${btn('🧭 Mobilité')}</div>`;
    return wide ? `<div class="mfiche mfiche--wide"><div class="stack">${head}${rad}</div><div class="stack">${skills}${hist}${acts}</div></div>`
        : `<div class="mfiche">${head}${rad}${skills}${acts}</div>`;
}

/** Évaluer une compétence : niveau + appétence + note, avec l'ancien niveau rappelé. */
const evalBody = (p, id) => `<div class="inline">${av(p, 'md')}<div class="stack"><b>${esc(p.name)} · ${esc(D.skill(id).label)}</b><small>Actuel : niveau ${p.levels[id]} · évalué le 12 sept.</small></div></div>`
    + field('Niveau', levelPicker(Math.min(4, p.levels[id] + 1)))
    + field('Appétence', appPicker(p.app[id]))
    + field('Note (facultative)', `<span class="input input--area">Autonome sur la consommation, pas encore sur le partitionnement.</span>`, 'Visible dans l\'historique de la fiche.');

/** Ticket de montée en compétence, prérempli depuis une lacune. */
const skillUpBody = (p, id, mentor) => field('Titre', `<span class="input input--focus">Monter en compétence ${esc(D.skill(id).label)} — ${esc(p.first)}</span>`)
    + `<div class="grid2">${field('Niveau visé', `<span class="input">${lvl(p.levels[id] + 1, true)}</span>`)}${field('Échéance', `<span class="input">📅 Sprint 32.2</span>`)}</div>`
    + field('Binôme (sachant)', `<span class="input">${av(mentor, 'xs')} ${esc(mentor.name)} · niv. ${mentor.levels[id]}</span>`, 'Proposé : seul sachant disponible avant son absence.')
    + field('Créer aussi dans JIRA', `<span class="input">☑ Story « Montée en compétence » · équipe ${esc(p.team)}</span>`);

/** « Qui affecter ? » : candidats classés par niveau, charge, disponibilité, appétence. */
function suggestBody(id, team, { skipAway = false } = {}) {
    const cand = D.PEOPLE.filter(p => p.levels[id] >= 1 && !(skipAway && D.AWAY[p.name])).sort((a, b) => b.levels[id] - a.levels[id] || (b.app[id] === 'forte') - (a.app[id] === 'forte')).slice(0, 5);
    const load = { 'Noah Roux': 7, 'Théo Lefèvre': 3, 'Camille Muller': 6, 'Nathan Simon': 5, 'Alice Faure': 2, 'Manon Lambert': 4, 'Tom Fontaine': 5, 'Paul André': 2, 'Jules Blanc': 1, 'Hugo Bernard': 3 };
    return `<div class="inline">${chip('🎯 ' + esc(D.skill(id).label), 'on')}${team ? chip(teamDot(team) + ' pour ' + team, 'team ' + tc(team)) : ''}${chip('Trier : pertinence')}</div>`
        + cand.map((p, i) => `<div class="row cand"><span class="cand__rank">${i + 1}</span>${av(p, 'sm', D.AWAY[p.name] ? 'av--away' : '')}<span class="row__main"><b>${esc(p.name)}</b>`
            + `<span class="row__meta">${esc(p.team)} · ${load[p.name] ?? 3} tickets actifs${D.AWAY[p.name] ? ' · 🌴 ' + D.AWAY[p.name] : ''}</span></span>${ap(p.app[id])}${lvl(p.levels[id])}</div>`).join('');
}

/** Catalogue : compétences par catégorie, nombre d'évaluations, glisser pour réordonner. */
const catalogBody = () => ['Tech', 'Métier', 'Pratiques'].map(cat => `<h4 class="sec-title">${cat}</h4>`
    + D.SKILLS.filter(s => s.cat === cat).map(s => `<div class="row"><span class="grip" title="Glisser pour réordonner">⋮⋮</span><span class="row__main"><b>${esc(s.label)}</b><span class="row__meta">${D.PEOPLE.filter(p => p.levels[s.id]).length} évaluations · moy. ${String(D.avgLevel(s.id)).replace('.', ',')}</span></span>${btn('✏️', 'icon ghost')}</div>`).join('')).join('');

/** Atelier de staffing : une simulation (Théo → Delta) et son impact, avant / après. */
const SIM = { who: theo, from: 'Éole', to: 'Delta' };
const simImpact = () => `<div class="sim"><div class="sim__move">${av(theo, 'md')}<div class="stack"><b>${esc(theo.name)}</b><span class="inline">${chip(teamDot('Éole') + ' Éole', 'team t-eole')} → ${chip(teamDot('Delta') + ' Delta', 'team t-delta')}</span></div></div>`
    + `<div class="sim__rows">`
    + `<div class="row"><span class="row__main"><b>Delta · couverture</b><span class="row__meta">Kubernetes couvert par Théo (niv. 3)</span></span><span class="delta delta--up">75 % → 100 %</span></div>`
    + `<div class="row"><span class="row__main"><b>Éole · couverture</b><span class="row__meta">Kubernetes reste couvert (Camille 4, Alice 2)</span></span><span class="delta">100 % → 100 %</span></div>`
    + `<div class="row"><span class="row__main"><b>Éole · effectif</b><span class="row__meta">5 → 4 personnes, dont 1 Tech Lead</span></span><span class="delta delta--down">−1</span></div>`
    + `<div class="row"><span class="row__main"><b>Charge de Théo</b><span class="row__meta">3 tickets actifs à réattribuer chez Éole</span></span><span class="delta delta--warn">⚠ 3</span></div>`
    + `</div><div class="inline">${btn('✓ Proposer au PI Planning', 'primary')}${btn('↺ Annuler la simulation', 'ghost')}</div></div>`;

const simBanner = () => `<div class="simbar"><span class="live-dot"></span><b>Simulation en cours</b><span>1 déplacement · rien n'est enregistré</span><span class="spacer"></span>${btn('↺ Tout annuler', 'sm ghost')}${btn('Proposer', 'sm primary')}</div>`;

/** Mobilité : souhaits par étape (Souhait → Plan → En cours → Bilan). */
const MOBILITY = [
    { p: lina, target: 'Scrum Master', stage: 'Plan', step: 2, from: 'Dev' },
    { p: hugo, target: 'Tech Lead', stage: 'Souhait', step: 1, from: 'Dev' },
    { p: theo, target: 'Expert Kubernetes', stage: 'En cours', step: 3, from: 'Dev' },
    { p: P('Jade Laurent'), target: 'Sécurité applicative', stage: 'Souhait', step: 1, from: 'Dev' },
    { p: P('Tom Fontaine'), target: 'Coach agile', stage: 'Bilan', step: 4, from: 'Tech Lead' },
];
const STAGES = ['Souhait', 'Plan', 'En cours', 'Bilan'];
const mobCard = m => `<article class="mob"><div class="inline">${av(m.p, 'sm')}<div class="stack mob__who"><b>${esc(m.p.name)}</b><small>${esc(m.from)} → <b>${esc(m.target)}</b></small></div></div>${bar(m.step * 25, m.step === 4 ? 'ok' : '')}<small>Étape ${m.step}/4 · ${esc(m.stage)}</small></article>`;

/** Trajectoire de Lina vers Scrum Master : écart de profil et plan d'actions. */
const SM_PROFILE = { java: 1, angular: 1, k8s: 0, kafka: 0, sql: 1, secu: 0, factu: 2, stock: 2, test: 2, anim: 4 };
const trajectory = (wide = false) => `<div class="inline">${av(lina, 'lg')}<div class="stack"><b>${esc(lina.name)} → Scrum Master</b><small>Souhait exprimé le 4 sept. · référente : Chloé Durand (PO)</small></div></div>`
    + `<div class="${wide ? 'traj traj--wide' : 'traj'}"><div class="traj__radar">${radar(lina.levels, { size: wide ? 230 : 210, compare: SM_PROFILE })}<small>trait plein : Lina · pointillé : profil Scrum Master</small></div>`
    + `<div class="steps"><div class="step step--done"><span class="step__dot">✓</span><div class="step__body"><b>Souhait exprimé</b><span>Entretien du 4 sept.</span></div></div>`
    + `<div class="step step--now"><span class="step__dot">2</span><div class="step__body"><b>Plan : animer 2 rétros de Cobalt</b><span>1/2 faite · prochaine le 14 nov.</span></div></div>`
    + `<div class="step"><span class="step__dot">3</span><div class="step__body"><b>Formation PSM I</b><span>Inscription demandée · PI 32</span></div></div>`
    + `<div class="step"><span class="step__dot">4</span><div class="step__body"><b>Bilan et décision</b><span>Fin du PI 32</span></div></div></div></div>`
    + `<div class="callout">⚖️ Si Lina évolue, Cobalt perd une Dev (2 → 1 sur Angular). Relève proposée : <b>Zoé</b> (niv. 2, appétence neutre).</div>`;

const emptyMatrix = () => empty('🧬', 'Construisez votre Skills Matrix', 'Aucune compétence évaluée pour l\'instant. Partez du catalogue par défaut (10 compétences) ou importez un CSV.', `<div class="inline">${btn('⚙️ Catalogue par défaut', 'primary')}${btn('📥 Importer')}</div>`);

module.exports = { SIGNALS, signalCard, topSkills, skillLine, memberBody, evalBody, skillUpBody, suggestBody, catalogBody, SIM, simImpact, simBanner, MOBILITY, STAGES, mobCard, trajectory, emptyMatrix, P, noah, hugo, lina, theo, manon };
