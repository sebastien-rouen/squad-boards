/**
 * Données FICTIVES de la galerie Atlas — aucun nom réel (règle des fixtures du site).
 * Les situations utiles sont plantées exprès, pour que chaque direction ait quelque chose à dire :
 *   - Kafka : un seul « sachant » (Noah, niv. 4) → bus factor 1, et il part en congés la semaine prochaine ;
 *   - Kubernetes : requis chez Delta, personne au-dessus du niveau 1 ;
 *   - Sécurité : faible partout (niveau moyen < 2) ;
 *   - Lina (Cobalt) : appétence forte « Animation » → trajectoire vers Scrum Master ;
 *   - Hugo (Alpha) : en progression Kafka 1 → 2 (binôme avec Noah).
 */

const SKILLS = [
    { id: 'java', label: 'Java', cat: 'Tech' },
    { id: 'angular', label: 'Angular', cat: 'Tech' },
    { id: 'k8s', label: 'Kubernetes', cat: 'Tech' },
    { id: 'kafka', label: 'Kafka', cat: 'Tech' },
    { id: 'sql', label: 'SQL', cat: 'Tech' },
    { id: 'secu', label: 'Sécurité', cat: 'Tech' },
    { id: 'factu', label: 'Facturation', cat: 'Métier' },
    { id: 'stock', label: 'Stock', cat: 'Métier' },
    { id: 'test', label: 'Test auto', cat: 'Pratiques' },
    { id: 'anim', label: 'Animation', cat: 'Pratiques' },
];

const LEVELS = [
    { v: 0, label: 'Non évalué', short: '–' },
    { v: 1, label: 'Exécutant spécialisé', short: '1' },
    { v: 2, label: 'Opérationnel structuré', short: '2' },
    { v: 3, label: 'Ingénieur cloud ready', short: '3' },
    { v: 4, label: 'Référent / architecte', short: '4' },
];

const LINES = [
    { id: 'com', name: 'Commerce', color: '#38bdf8', teams: ['Alpha', 'Borée'] },
    { id: 'log', name: 'Logistique', color: '#f59e0b', teams: ['Cobalt', 'Delta'] },
    { id: 'pla', name: 'Plateforme', color: '#a78bfa', teams: ['Éole'] },
];

const TEAM_COLORS = { Alpha: '#38bdf8', Borée: '#22d3ee', Cobalt: '#f59e0b', Delta: '#fb923c', Éole: '#a78bfa' };

// Niveaux par compétence, dans l'ordre de SKILLS : java angular k8s kafka sql secu factu stock test anim
// Appétences fortes (+) / faibles (-) : liste d'ids.
const PEOPLE = [
    ['Léa Martin', 'Alpha', 'Dev', '3300212020', ['angular'], []],
    ['Hugo Bernard', 'Alpha', 'Dev', '3201201020', ['kafka'], ['anim']],
    ['Inès Petit', 'Alpha', 'Tech Lead', '4310332033', ['secu'], []],
    ['Yanis Robert', 'Alpha', 'Dev', '2300101010', [], ['sql']],
    ['Chloé Durand', 'Alpha', 'PO', '0000103024', ['factu'], []],
    ['Malo Richard', 'Alpha', 'Dev', '2200210030', ['test'], []],
    ['Sarah Moreau', 'Borée', 'Dev', '3300202010', [], []],
    ['Nathan Simon', 'Borée', 'Tech Lead', '4230311042', ['k8s'], []],
    ['Jade Laurent', 'Borée', 'Dev', '2300101020', ['angular'], ['secu']],
    ['Lucas Michel', 'Borée', 'Dev', '3210301020', [], []],
    ['Emma Garcia', 'Borée', 'PO', '0000103014', [], []],
    ['Noah Roux', 'Cobalt', 'Tech Lead', '4024310223', ['kafka'], []],
    ['Lina Fournier', 'Cobalt', 'Dev', '2200200122', ['anim'], ['k8s']],
    ['Adam Girard', 'Cobalt', 'Dev', '3100200130', [], []],
    ['Zoé Bonnet', 'Cobalt', 'Dev', '2201300310', ['sql'], []],
    ['Rayan Dupont', 'Cobalt', 'PO', '0000100403', [], []],
    ['Manon Lambert', 'Delta', 'Dev', '3110200210', ['k8s'], []],
    ['Tom Fontaine', 'Delta', 'Tech Lead', '3210310321', [], ['anim']],
    ['Léna Rousseau', 'Delta', 'Dev', '2100200130', ['test'], []],
    ['Enzo Vincent', 'Delta', 'Dev', '2200100210', [], []],
    ['Camille Muller', 'Éole', 'Tech Lead', '3040320021', ['secu'], []],
    ['Théo Lefèvre', 'Éole', 'Dev', '2030310010', ['k8s'], ['factu']],
    ['Alice Faure', 'Éole', 'Dev', '2020200020', [], []],
    ['Paul André', 'Éole', 'Dev', '1021300010', ['kafka'], []],
    ['Jules Blanc', 'Éole', 'Dev', '1020200010', [], []],
    ['Sofia Henry', 'Delta', 'PO', '0000100304', [], []],
].map(([name, team, role, lv, plus, minus]) => ({
    name, team, role,
    first: name.split(' ')[0],
    initials: name.split(' ').map(w => w[0]).join(''),
    levels: Object.fromEntries(SKILLS.map((s, i) => [s.id, Number(lv[i])])),
    app: Object.fromEntries(SKILLS.map(s => [s.id, plus.includes(s.id) ? 'forte' : minus.includes(s.id) ? 'faible' : 'neutre'])),
}));

/** Compétences exigées par équipe (ce qu'elle doit couvrir à niveau ≥ 2). */
const REQUIRED = {
    Alpha: ['java', 'angular', 'sql', 'factu', 'test'],
    Borée: ['java', 'angular', 'k8s', 'factu'],
    Cobalt: ['java', 'kafka', 'sql', 'stock'],
    Delta: ['java', 'k8s', 'stock', 'test'],
    Éole: ['k8s', 'sql', 'secu'],
};

/** Absences proches (signal « absent prochainement »). */
const AWAY = { 'Noah Roux': 'du 2 au 13 nov.', 'Inès Petit': 'le 6 nov.' };

const byTeam = team => PEOPLE.filter(p => p.team === team);
const person = name => PEOPLE.find(p => p.name === name);
const skill = id => SKILLS.find(s => s.id === id);
/** Sachants (niveau ≥ 2) d'une compétence, éventuellement dans une équipe. */
const experts = (id, team) => PEOPLE.filter(p => p.levels[id] >= 2 && (!team || p.team === team));
/** Niveau moyen évalué (0 exclus). */
const avgLevel = (id, people = PEOPLE) => {
    const v = people.map(p => p.levels[id]).filter(Boolean);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : 0;
};
/** Couverture d'une équipe : part de ses compétences requises ayant au moins un sachant. */
const coverage = team => {
    const req = REQUIRED[team];
    const ok = req.filter(id => experts(id, team).length);
    return { ok: ok.length, total: req.length, pct: Math.round(ok.length / req.length * 100), missing: req.filter(id => !ok.includes(id)) };
};

module.exports = { SKILLS, LEVELS, LINES, TEAM_COLORS, PEOPLE, REQUIRED, AWAY, byTeam, person, skill, experts, avgLevel, coverage };
