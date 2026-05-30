/**
 * Demo data seeder - populates the database with sample data.
 * Only seeds if no tickets exist yet.
 */

import * as api from './api.js';

const TEAMS = [
    { name: 'Alpha', color: '#3b82f6' },
    { name: 'Beta',  color: '#10b981' },
    { name: 'Gamma', color: '#f59e0b' },
    { name: 'Delta', color: '#ef4444' },
];

const MEMBERS = [
    { name: 'Alice Martin',    team: 'Alpha', role: 'Dev' },
    { name: 'Antoine Dupont',  team: 'Alpha', role: 'Dev' },
    { name: 'Anna Bernard',    team: 'Alpha', role: 'Scrum Master' },
    { name: 'Bruno Garcia',    team: 'Beta',  role: 'Dev' },
    { name: 'Beatrice Petit',  team: 'Beta',  role: 'Dev' },
    { name: 'Baptiste Roux',   team: 'Beta',  role: 'PO' },
    { name: 'Claire Moreau',   team: 'Gamma', role: 'Dev' },
    { name: 'Cedric Laurent',  team: 'Gamma', role: 'Dev' },
    { name: 'Camille Simon',   team: 'Gamma', role: 'Tech Lead' },
    { name: 'David Michel',    team: 'Delta', role: 'Dev' },
    { name: 'Diane Leroy',     team: 'Delta', role: 'Dev' },
    { name: 'Damien Girard',   team: 'Delta', role: 'Ops' },
];

const STATUSES = ['todo', 'todo', 'inprog', 'inprog', 'inprog', 'review', 'test', 'done', 'done', 'done', 'done'];
const TYPES = ['story', 'story', 'story', 'bug', 'task', 'debt', 'ops'];
const PRIORITIES = ['low', 'medium', 'medium', 'high', 'critical'];

const STORIES = [
    'Ajouter la page de profil utilisateur',
    'Implementer le filtre de recherche avance',
    'Creer le composant de notification',
    'Refactorer le module d\'authentification',
    'Optimiser les requetes de la page d\'accueil',
    'Ajouter l\'export CSV des rapports',
    'Corriger le bug d\'affichage mobile',
    'Mettre en place le cache Redis',
    'Migrer vers la nouvelle API v3',
    'Ajouter les tests d\'integration',
    'Implementer le dark mode',
    'Creer le dashboard analytics',
    'Corriger la fuite memoire du worker',
    'Ajouter la validation des formulaires',
    'Implementer le SSO SAML',
    'Optimiser le bundle webpack',
    'Creer le microservice de notification',
    'Ajouter la pagination du catalogue',
    'Corriger le calcul des permissions',
    'Implementer le websocket temps reel',
    'Mettre a jour les dependances securite',
    'Ajouter le support multi-langue',
    'Creer l\'API de reporting',
    'Corriger le bug de session timeout',
    'Implementer l\'upload de fichiers',
    'Optimiser les images du CDN',
    'Ajouter les metriques Prometheus',
    'Creer le formulaire de feedback',
    'Corriger la synchro des donnees',
    'Implementer la gestion des roles',
    'Ajouter le changelog automatique',
    'Creer le module d\'import Excel',
    'Corriger l\'encodage UTF-8 des exports',
    'Implementer le systeme de tags',
    'Optimiser la requete de recherche',
    'Ajouter la double authentification',
    'Creer le template email',
    'Corriger l\'affichage du graphe',
    'Implementer le retry automatique',
    'Ajouter la compression gzip',
];

const FEATURE_TITLES = [
    'Refonte du portail utilisateur',
    'Systeme de notification intelligent',
    'Migration infrastructure cloud',
    'Module analytics avance',
    'Securisation des acces',
];

const EPIC_TITLES = [
    'Portail - Interface utilisateur',
    'Portail - API Backend',
    'Notifications - Push & Email',
    'Notifications - Preferences',
    'Cloud - Migration BDD',
    'Cloud - CI/CD Pipeline',
    'Analytics - Collecte de donnees',
    'Analytics - Tableaux de bord',
    'Securite - SSO & MFA',
    'Securite - Audit & Logs',
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

/**
 * Seed the database with demo data.
 * Returns true if seeded, false if data already exists.
 */
export async function seedDemoData() {
    // Check if data already exists
    const existing = await api.getTickets();
    if (existing.length > 0) return false;

    // Seed teams
    for (const t of TEAMS) {
        await api.createTeam(t);
    }

    // Seed members
    for (const m of MEMBERS) {
        await api.createMember(m);
    }

    // Seed features (PI#29 — courant)
    const featureIds = [];
    for (let i = 0; i < FEATURE_TITLES.length; i++) {
        const f = await api.createFeature({
            id: `FEAT-${i + 1}`,
            title: FEATURE_TITLES[i],
            status: i < 2 ? 'inprog' : i < 4 ? 'todo' : 'done',
            team: TEAMS[i % TEAMS.length].name,
            piSprint: 'PI#29',
        });
        featureIds.push(f.id);
    }

    // Seed features (PI#30 — suivant)
    const NEXT_PI_FEATURES = [
        { title: 'Plateforme de donnees unifiee',        team: 'Alpha', leader: 'Alice Martin',   status: 'todo' },
        { title: 'Refonte du moteur de recherche',       team: 'Beta',  leader: 'Bruno Garcia',    status: 'todo' },
        { title: 'API Gateway v2 & rate-limiting',       team: 'Gamma', leader: 'Camille Simon',   status: 'todo' },
        { title: 'Observabilite & tracing distribue',    team: 'Delta', leader: 'Damien Girard',   status: 'todo' },
    ];
    for (let i = 0; i < NEXT_PI_FEATURES.length; i++) {
        const nf = NEXT_PI_FEATURES[i];
        await api.createFeature({
            id: `FEAT-N${i + 1}`,
            title: nf.title,
            status: nf.status,
            team: nf.team,
            leader: nf.leader,
            piSprint: 'PI#30',
            rank: i,
        });
    }

    // Seed epics
    const epicIds = [];
    for (let i = 0; i < EPIC_TITLES.length; i++) {
        const e = await api.createEpic({
            id: `EPIC-${i + 1}`,
            title: EPIC_TITLES[i],
            status: i < 4 ? 'inprog' : i < 7 ? 'todo' : 'done',
            team: TEAMS[i % TEAMS.length].name,
            feature: featureIds[Math.floor(i / 2)] || null,
            piSprint: 'PI#29',
        });
        epicIds.push(e.id);
    }

    // Seed tickets
    const piNum = 29;
    for (let i = 0; i < STORIES.length; i++) {
        const team = TEAMS[i % TEAMS.length];
        const teamMembers = MEMBERS.filter(m => m.team === team.name);
        const status = rand(STATUSES);
        const type = rand(TYPES);
        const flagged = status === 'inprog' && Math.random() < 0.1;
        const leader = status === 'todo' && Math.random() > 0.5 ? null : rand(teamMembers).name;
        // 30% chance to have 1-2 contributors
        const otherMembers = teamMembers.filter(m => m.name !== leader);
        const contributors = Math.random() < 0.3 && otherMembers.length
            ? otherMembers.slice(0, randInt(1, Math.min(2, otherMembers.length))).map(m => m.name)
            : [];

        await api.createTicket({
            id: `TICK-${100 + i}`,
            title: STORIES[i],
            type,
            status: flagged ? 'blocked' : status,
            team: team.name,
            leader,
            contributors,
            points: [1, 2, 3, 5, 8, 13][randInt(0, 5)],
            priority: rand(PRIORITIES),
            sprintName: `${team.name} - Ite ${piNum}.3`,
            piSprint: `PI#${piNum}`,
            flagged,
            labels: Math.random() < 0.2 ? ['tech-debt'] : [],
            epic: epicIds[i % epicIds.length] || null,
            description: '',
            comments: Math.random() < 0.3 ? [{
                id: Math.random().toString(36).slice(2, 10),
                author: leader || rand(teamMembers).name,
                body: 'En cours de traitement, RAS pour le moment.',
                date: daysAgo(randInt(0, 3)),
            }] : [],
            recentChanges: status !== 'todo' ? [{
                date: daysAgo(randInt(0, 3)),
                author: leader || rand(teamMembers).name,
                field: 'status',
                from: 'A faire',
                to: status === 'done' ? 'Termine' : 'En cours',
            }] : [],
            updatedAt: daysAgo(randInt(0, 5)),
        });
    }

    // Seed retro-tagged tickets (pour la vue Amélioration)
    const RETRO_EXTRAS = [
        { title: 'Raccourcir le daily standup a 12 min max',        labels: ['retro'],      status: 'todo',   team: 'Alpha', priority: 'medium' },
        { title: 'Clarifier la definition of done avec le PO',       labels: ['retro'],      status: 'inprog', team: 'Beta',  priority: 'high'   },
        { title: 'Post-mortem : incident production du 10/04',       labels: ['postmortem'], status: 'todo',   team: 'Gamma', priority: 'critical'},
        { title: 'Post-mortem : degradation perf API v2',            labels: ['postmortem'], status: 'done',   team: 'Delta', priority: 'high'   },
        { title: 'CoP Dev - bonnes pratiques TypeScript',            labels: ['cop'],        status: 'inprog', team: 'Alpha', priority: 'low'    },
        { title: 'CoP Methodo - retour REX SAFe PI29',               labels: ['cop'],        status: 'todo',   team: 'Beta',  priority: 'medium' },
        { title: 'Adapter le process de review pour PI30',           labels: ['adapt'],      status: 'todo',   team: 'Gamma', priority: 'medium' },
        { title: 'Reduire le WIP limit sur le board Kanban',         labels: ['adapt'],      status: 'inprog', team: 'Delta', priority: 'low'    },
    ];
    for (let i = 0; i < RETRO_EXTRAS.length; i++) {
        const rx = RETRO_EXTRAS[i];
        const teamMembers = MEMBERS.filter(m => m.team === rx.team);
        await api.createTicket({
            id: `RETRO-${i + 1}`,
            title: rx.title,
            type: 'task',
            status: rx.status,
            team: rx.team,
            leader: rand(teamMembers).name,
            contributors: [],
            points: 2,
            priority: rx.priority,
            sprintName: `${rx.team} - Ite ${piNum}.3`,
            piSprint: `PI#${piNum}`,
            flagged: false,
            labels: rx.labels,
            description: '',
            comments: [],
            recentChanges: [],
            updatedAt: daysAgo(randInt(1, 10)),
        });
    }

    // Seed support tickets (pour la vue Support)
    const SUPPORT_EXTRAS = [
        { title: 'Erreur 500 sur la page de login',               priority: 'critical', team: 'Alpha', status: 'todo'   },
        { title: 'Probleme de synchro des donnees utilisateur',   priority: 'high',     team: 'Beta',  status: 'inprog' },
        { title: 'Timeout sur l\'export CSV',                      priority: 'medium',   team: 'Gamma', status: 'todo'   },
        { title: 'Bug d\'affichage mobile (Safari 17)',            priority: 'low',      team: 'Delta', status: 'done'   },
        { title: 'Acces refuse pour le role Manager',             priority: 'high',     team: 'Alpha', status: 'inprog' },
    ];
    for (let i = 0; i < SUPPORT_EXTRAS.length; i++) {
        const sx = SUPPORT_EXTRAS[i];
        const teamMembers = MEMBERS.filter(m => m.team === sx.team);
        await api.createTicket({
            id: `SUPP-${i + 1}`,
            title: sx.title,
            type: 'support',
            status: sx.status,
            team: sx.team,
            leader: rand(teamMembers).name,
            contributors: [],
            points: 1,
            priority: sx.priority,
            sprintName: '',
            piSprint: `PI#${piNum}`,
            flagged: false,
            labels: ['support'],
            description: '',
            comments: [],
            recentChanges: [],
            updatedAt: daysAgo(randInt(0, 7)),
        });
    }

    // Seed sprint info
    const sprintStart = new Date();
    sprintStart.setDate(sprintStart.getDate() - 8);
    const sprintEnd = new Date();
    sprintEnd.setDate(sprintEnd.getDate() + 6);
    await api.updateSprint({
        name: `Sprint ${piNum}.3`,
        startDate: sprintStart.toISOString(),
        endDate: sprintEnd.toISOString(),
        goal: 'Finaliser le portail utilisateur et corriger les bugs critiques',
    });

    // Seed PI info
    await api.updatePI({
        number: piNum,
        name: `PI#${piNum}`,
        objectives: [],
    });

    return true;
}
