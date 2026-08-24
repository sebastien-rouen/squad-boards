/**
 * Jeux de données des tests — SYNTHÉTIQUES, mais calqués sur les pièges rencontrés en vrai
 * (données réelles anonymisées : aucun nom de collaborateur ici).
 *
 * Chaque particularité ci-dessous a causé un bug réel, ne pas « simplifier » :
 *   • une équipe nommée **« O »** : une seule lettre, contenue dans « Fuego », « Gabbiano »,
 *     « Lion », « Caméléon » → l'ancien matching par sous-chaîne l'aspirait dans ces équipes ;
 *   • le PI 30 a **6** itérations, le PI 31 en a **5** → un repli sur le compte du PI courant
 *     donnait 6 itérations au PI 31, soit deux semaines fantômes ;
 *   • le sprint `31.1` de JIRA démarre un **dimanche** → l'en-tête de colonne annonçait la
 *     veille du premier jour ouvré ;
 *   • des boards `PI#32`/`PI#33` existent **sans aucun sprint** → ils occupaient les dernières
 *     places du récapitulatif et en chassaient les PI réellement importés ;
 *   • `piInfo.startDate` pointe vers un PI **antérieur** → la page Support affichait les
 *     semaines d'un autre PI.
 */

export const EQUIPES = ['Fuego', 'Gabbiano', 'Lion', 'Caméléon', 'O'];

export const TEAM_OBJECTS = EQUIPES.map((name, i) => ({ name, color: ['#e11', '#1a3', '#36c', '#f80', '#849'][i] }));

/** Sprints JIRA : PI 30 = 6 itérations (vendredi), PI 31 = 5 (dimanche), PI 32/33 = boards nus. */
export const SPRINT_INFO = {
    name: 'Fuego - Ité 30.6',
    startDate: '2026-08-21',
    endDate: '2026-09-04',
    teamSprints: [
        ...[1, 2, 3, 4, 5, 6].flatMap(n => {
            const debut = ['2026-06-12', '2026-06-26', '2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21'][n - 1];
            return ['Fuego', 'Gabbiano', 'Lion'].map(t => ({ team: t, name: `${t} - Ité 30.${n}`, startDate: debut }));
        }),
        // PI 31 : 5 itérations, et un sprint .1 majoritairement daté du DIMANCHE 6 septembre
        { team: 'Fuego',    name: 'Fuego - Ité 31.1',    startDate: '2026-09-06' },
        { team: 'Gabbiano', name: 'Gabbiano - Ité 31.1', startDate: '2026-09-06' },
        { team: 'Lion',     name: 'Lion - Ité 31.1',     startDate: '2026-09-07' },   // un jour d'écart : minoritaire
        ...[2, 3, 4, 5].map(n => ({ team: 'Fuego', name: `Fuego - Ité 31.${n}`, startDate: '' })),
        // Boards de features des PI à venir : connus de JIRA, sans aucun sprint daté
        { team: 'PI Board', name: 'PI#32', startDate: '' },
        { team: 'PI Board', name: 'PI#33', startDate: '' },
    ],
};

/** Config PI en base — `startDate` volontairement périmée (début du PI 29). */
export const PI_INFO = {
    number: 0,               // jamais renseigné en base : le PI courant se déduit du sprint actif
    name: '',
    sprintsPerPI: 5,
    sprintDuration: 14,
    startDate: '2026-04-02',
    objectives: [
        { text: 'Environnement PreProd pour DATA', team: 'Fuego', status: 'todo', bv: 10, committed: true },
        { text: 'Stockage des traces métier', team: 'Fuego', status: 'inprog', bv: 9, committed: true },
        { text: 'Bannette personnelle agent', team: 'Gabbiano', status: 'inprog', bv: 10, committed: true },
    ],
    piObjectives: {},
    piMembers: {
        // Snapshot du PI 31 : 4 membres Fuego (turnover — MARTIN n'y est plus)
        31: [
            { name: 'DUPONT, Alice', team: 'Team Fuego', role: 'Ops', entity: 'Alpha' },
            { name: 'BERNARD, Bruno', team: 'Team Fuego', role: 'Ops', entity: 'Alpha' },
            { name: 'PETIT, Chloé', team: 'Team Fuego', role: 'Ops', entity: 'Beta' },
            { name: 'ROUX, David', team: 'Team Fuego', role: 'Scrum Master', entity: 'Beta' },
            { name: 'MOREAU, Émile', team: 'Team O', role: 'Dev', entity: 'Alpha' },
        ],
    },
    piBaselines: {},
};

/** Membres bruts (table member) — MARTIN est parti après le PI 30, il reste ici. */
export const MEMBRES = [
    { name: 'DUPONT, Alice', team: 'Fuego', role: 'Ops' },
    { name: 'BERNARD, Bruno', team: 'Fuego', role: 'Ops' },
    { name: 'PETIT, Chloé', team: 'Fuego', role: 'Ops' },
    { name: 'ROUX, David', team: 'Fuego', role: 'Scrum Master' },
    { name: 'MARTIN, Eva', team: 'Fuego', role: 'Ops' },        // hors snapshot PI 31
    { name: 'MOREAU, Émile', team: 'O', role: 'Dev' },          // équipe « O » — piège du matching
    { name: 'GARCIA, Farid', team: 'O', role: 'PMO' },
    { name: 'LEROY, Gaëlle', team: 'Gabbiano', role: 'Ops' },
];

/** Absences (source de vérité des équipes, dérivée du CSV RH). */
export const ABSENCES = MEMBRES.map((m, i) => ({
    memberName: m.name, team: m.team,
    startDate: `2026-09-${String(7 + i).padStart(2, '0')}`,
    endDate: `2026-09-${String(7 + i).padStart(2, '0')}`,
    days: 1, type: 'conge',
}));

/** Charge le store avec ce jeu de données (à appeler après `installerEnv`). */
export function chargerStore(store, { piOffset = 0, team = 'Fuego' } = {}) {
    store.set('teams', EQUIPES);
    store.set('teamObjects', TEAM_OBJECTS);
    store.set('team', team);
    store.set('piInfo', structuredClone(PI_INFO));
    store.set('sprintInfo', structuredClone(SPRINT_INFO));
    store.set('members', structuredClone(MEMBRES));
    store.set('absences', structuredClone(ABSENCES));
    store.set('support', []);
    store.set('tickets', []); store.set('features', []); store.set('epics', []);
    store.set('piOffset', piOffset);
    return store;
}
