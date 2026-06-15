/**
 * Demo data seeder - populates the database with sample data.
 * seedDemoData()    : first-run minimal seed (auto)
 * seedFullDemoData(): rich demo for presentations (manual, via Settings > Données)
 */

import * as api from './api.js';

// ── Shared helpers ────────────────────────────────────────────────────────────
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().slice(0, 10);
}
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

// ── Minimal first-run seed ────────────────────────────────────────────────────
const _TEAMS = [
    { name: 'Alpha', color: '#3b82f6' },
    { name: 'Beta',  color: '#10b981' },
    { name: 'Gamma', color: '#f59e0b' },
    { name: 'Delta', color: '#ef4444' },
];
const _MEMBERS = [
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
const _STATUSES = ['todo', 'todo', 'inprog', 'inprog', 'inprog', 'review', 'test', 'done', 'done', 'done', 'done'];
const _TYPES    = ['story', 'story', 'story', 'bug', 'task', 'debt', 'ops'];
const _STORIES  = [
    'Ajouter la page de profil utilisateur','Implementer le filtre de recherche avance',
    'Creer le composant de notification','Refactorer le module d\'authentification',
    'Optimiser les requetes de la page d\'accueil','Ajouter l\'export CSV des rapports',
    'Corriger le bug d\'affichage mobile','Mettre en place le cache Redis',
    'Migrer vers la nouvelle API v3','Ajouter les tests d\'integration',
    'Implementer le dark mode','Creer le dashboard analytics',
    'Corriger la fuite memoire du worker','Ajouter la validation des formulaires',
    'Implementer le SSO SAML','Optimiser le bundle webpack',
    'Creer le microservice de notification','Ajouter la pagination du catalogue',
    'Corriger le calcul des permissions','Implementer le websocket temps reel',
    'Mettre a jour les dependances securite','Ajouter le support multi-langue',
    'Creer l\'API de reporting','Corriger le bug de session timeout',
    'Implementer l\'upload de fichiers','Optimiser les images du CDN',
    'Ajouter les metriques Prometheus','Creer le formulaire de feedback',
    'Corriger la synchro des donnees','Implementer la gestion des roles',
    'Ajouter le changelog automatique','Creer le module d\'import Excel',
    'Corriger l\'encodage UTF-8 des exports','Implementer le systeme de tags',
    'Optimiser la requete de recherche','Ajouter la double authentification',
    'Creer le template email','Corriger l\'affichage du graphe',
    'Implementer le retry automatique','Ajouter la compression gzip',
];

export async function seedDemoData() {
    const existing = await api.getTickets();
    if (existing.length > 0) return false;
    for (const t of _TEAMS)   await api.createTeam(t);
    for (const m of _MEMBERS) await api.createMember(m);
    const featureIds = [];
    const FEAT_T = ['Refonte du portail utilisateur','Systeme de notification intelligent','Migration infrastructure cloud','Module analytics avance','Securisation des acces'];
    const EPIC_T  = ['Portail - Interface utilisateur','Portail - API Backend','Notifications - Push & Email','Notifications - Preferences','Cloud - Migration BDD','Cloud - CI/CD Pipeline','Analytics - Collecte de donnees','Analytics - Tableaux de bord','Securite - SSO & MFA','Securite - Audit & Logs'];
    for (let i = 0; i < FEAT_T.length; i++) {
        const f = await api.createFeature({ id: `FEAT-${i+1}`, title: FEAT_T[i], status: i<2?'inprog':i<4?'todo':'done', team: _TEAMS[i%_TEAMS.length].name, piSprint: 'PI#29' });
        featureIds.push(f.id);
    }
    const NEXT_PI = [
        { title: 'Plateforme de donnees unifiee',     team:'Alpha', leader:'Alice Martin',  status:'todo' },
        { title: 'Refonte du moteur de recherche',    team:'Beta',  leader:'Bruno Garcia',   status:'todo' },
        { title: 'API Gateway v2 & rate-limiting',    team:'Gamma', leader:'Camille Simon',  status:'todo' },
        { title: 'Observabilite & tracing distribue', team:'Delta', leader:'Damien Girard',  status:'todo' },
    ];
    for (let i = 0; i < NEXT_PI.length; i++) {
        const nf = NEXT_PI[i];
        await api.createFeature({ id:`FEAT-N${i+1}`, ...nf, piSprint:'PI#30', rank:i });
    }
    const epicIds = [];
    for (let i = 0; i < EPIC_T.length; i++) {
        const e = await api.createEpic({ id:`EPIC-${i+1}`, title:EPIC_T[i], status:i<4?'inprog':i<7?'todo':'done', team:_TEAMS[i%_TEAMS.length].name, feature:featureIds[Math.floor(i/2)]||null, piSprint:'PI#29' });
        epicIds.push(e.id);
    }
    const piNum = 29;
    for (let i = 0; i < _STORIES.length; i++) {
        const team = _TEAMS[i%_TEAMS.length];
        const teamMembers = _MEMBERS.filter(m=>m.team===team.name);
        const status = rand(_STATUSES);
        const type   = rand(_TYPES);
        const flagged = status==='inprog' && Math.random()<0.1;
        const leader = status==='todo' && Math.random()>0.5 ? null : rand(teamMembers).name;
        const others = teamMembers.filter(m=>m.name!==leader);
        const contributors = Math.random()<0.3 && others.length ? others.slice(0,randInt(1,Math.min(2,others.length))).map(m=>m.name) : [];
        await api.createTicket({
            id:`TICK-${100+i}`, title:_STORIES[i], type, status:flagged?'blocked':status,
            team:team.name, leader, contributors, points:[1,2,3,5,8,13][randInt(0,5)],
            priority:rand(['low','medium','medium','high','critical']),
            sprintName:`${team.name} - Ite ${piNum}.3`, piSprint:`PI#${piNum}`,
            flagged, labels:Math.random()<0.2?['tech-debt']:[],
            epic:epicIds[i%epicIds.length]||null, description:'',
            comments: Math.random()<0.3?[{id:Math.random().toString(36).slice(2,10),author:leader||rand(teamMembers).name,body:'En cours de traitement, RAS pour le moment.',date:daysAgo(randInt(0,3))}]:[],
            recentChanges: status!=='todo'?[{date:daysAgo(randInt(0,3)),author:leader||rand(teamMembers).name,field:'status',from:'A faire',to:status==='done'?'Termine':'En cours'}]:[],
            updatedAt:daysAgo(randInt(0,5)),
        });
    }
    const RETRO_X=[
        {title:'Raccourcir le daily standup a 12 min max',labels:['retro'],status:'todo',team:'Alpha',priority:'medium'},
        {title:'Clarifier la definition of done avec le PO',labels:['retro'],status:'inprog',team:'Beta',priority:'high'},
        {title:'Post-mortem : incident production du 10/04',labels:['postmortem'],status:'todo',team:'Gamma',priority:'critical'},
        {title:'Post-mortem : degradation perf API v2',labels:['postmortem'],status:'done',team:'Delta',priority:'high'},
        {title:'CoP Dev - bonnes pratiques TypeScript',labels:['cop'],status:'inprog',team:'Alpha',priority:'low'},
        {title:'CoP Methodo - retour REX SAFe PI29',labels:['cop'],status:'todo',team:'Beta',priority:'medium'},
        {title:'Adapter le process de review pour PI30',labels:['adapt'],status:'todo',team:'Gamma',priority:'medium'},
        {title:'Reduire le WIP limit sur le board Kanban',labels:['adapt'],status:'inprog',team:'Delta',priority:'low'},
    ];
    for (let i=0;i<RETRO_X.length;i++){
        const rx=RETRO_X[i]; const tm=_MEMBERS.filter(m=>m.team===rx.team);
        await api.createTicket({id:`RETRO-${i+1}`,title:rx.title,type:'task',status:rx.status,team:rx.team,leader:rand(tm).name,contributors:[],points:2,priority:rx.priority,sprintName:`${rx.team} - Ite ${piNum}.3`,piSprint:`PI#${piNum}`,flagged:false,labels:rx.labels,description:'',comments:[],recentChanges:[],updatedAt:daysAgo(randInt(1,10))});
    }
    const SUPP_X=[
        {title:'Erreur 500 sur la page de login',priority:'critical',team:'Alpha',status:'todo'},
        {title:'Probleme de synchro des donnees utilisateur',priority:'high',team:'Beta',status:'inprog'},
        {title:'Timeout sur l\'export CSV',priority:'medium',team:'Gamma',status:'todo'},
        {title:'Bug d\'affichage mobile (Safari 17)',priority:'low',team:'Delta',status:'done'},
        {title:'Acces refuse pour le role Manager',priority:'high',team:'Alpha',status:'inprog'},
    ];
    for (let i=0;i<SUPP_X.length;i++){
        const sx=SUPP_X[i]; const tm=_MEMBERS.filter(m=>m.team===sx.team);
        await api.createTicket({id:`SUPP-${i+1}`,title:sx.title,type:'support',status:sx.status,team:sx.team,leader:rand(tm).name,contributors:[],points:1,priority:sx.priority,sprintName:'',piSprint:`PI#${piNum}`,flagged:false,labels:['support'],description:'',comments:[],recentChanges:[],updatedAt:daysAgo(randInt(0,7))});
    }
    const ss=new Date(); ss.setDate(ss.getDate()-8);
    const se=new Date(); se.setDate(se.getDate()+6);
    await api.updateSprint({ name:`Sprint ${piNum}.3`, startDate:ss.toISOString(), endDate:se.toISOString(), goal:'Finaliser le portail utilisateur et corriger les bugs critiques' });
    await api.updatePI({ number:piNum, name:`PI#${piNum}`, objectives:[] });
    return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// FULL DEMO SEED — données riches pour présentation
// ══════════════════════════════════════════════════════════════════════════════

const PI = 5;
const TODAY = new Date();

const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();
const add  = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

// ── 1. Teams & Groups ─────────────────────────────────────────────────────────
const TEAMS = [
    { name: 'Vega',   color: '#3b82f6' },
    { name: 'Lyra',   color: '#0d9488' },
    { name: 'Orion',  color: '#f59e0b' },
    { name: 'Sirius', color: '#8b5cf6' },
];
const GROUPS = [
    { name: 'Constellation Produit',    color: '#3b82f6', teams: ['Vega', 'Lyra']    },
    { name: 'Constellation Plateforme', color: '#8b5cf6', teams: ['Orion', 'Sirius'] },
];

// ── 2. Members ────────────────────────────────────────────────────────────────
const MEMBERS = [
    { name: 'Chloé Mercier',   team: 'Vega',   role: 'Scrum Master'   },
    { name: 'Théo Vasseur',    team: 'Vega',   role: 'Dev'            },
    { name: 'Lucie Arnaud',    team: 'Vega',   role: 'Dev'            },
    { name: 'Maxime Giraud',   team: 'Vega',   role: 'Dev'            },
    { name: 'Florian Lebas',   team: 'Lyra',   role: 'Tech Lead'      },
    { name: 'Manon Cros',      team: 'Lyra',   role: 'Dev'            },
    { name: 'Baptiste Ferry',  team: 'Lyra',   role: 'Dev'            },
    { name: 'Inès Dupré',      team: 'Lyra',   role: 'Ops'            },
    { name: 'Romain Fabre',    team: 'Orion',  role: 'Data Lead'      },
    { name: 'Camille Huet',    team: 'Orion',  role: 'Data Engineer'  },
    { name: 'Tom Petit',       team: 'Orion',  role: 'Data Analyst'   },
    { name: 'Élise Morin',     team: 'Orion',  role: 'Dev'            },
    { name: 'Nathan Brun',     team: 'Sirius', role: 'SecOps'         },
    { name: 'Julie Gros',      team: 'Sirius', role: 'Dev'            },
    { name: 'Paul Renaud',     team: 'Sirius', role: 'Dev'            },
    { name: 'Adèle Blanc',     team: 'Sirius', role: 'Scrum Master'   },
];

// ── 3. Skills & Appetences ────────────────────────────────────────────────────
const SKILLS = [
    { id: 'react',        name: 'React / TypeScript',       category: 'Frontend',      sort: 1 },
    { id: 'nodejs',       name: 'Node.js / Express',        category: 'Backend',       sort: 2 },
    { id: 'python',       name: 'Python',                   category: 'Backend',       sort: 3 },
    { id: 'java',         name: 'Java / Spring Boot',       category: 'Backend',       sort: 4 },
    { id: 'sql',          name: 'SQL / PostgreSQL',         category: 'Data',          sort: 5 },
    { id: 'spark',        name: 'Spark / Databricks',       category: 'Data',          sort: 6 },
    { id: 'kubernetes',   name: 'Kubernetes / Helm',        category: 'Infra',         sort: 7 },
    { id: 'terraform',    name: 'Terraform / IaC',          category: 'Infra',         sort: 8 },
    { id: 'security',     name: 'Sécurité applicative',     category: 'Sécurité',      sort: 9 },
    { id: 'architecture', name: 'Architecture logicielle',  category: 'Architecture',  sort: 10 },
];
const APPETENCES = [
    { id: 'ia',       name: 'Intelligence Artificielle',  sort: 1 },
    { id: 'cloud',    name: 'Cloud Native & SRE',         sort: 2 },
    { id: 'data',     name: 'Data Engineering',           sort: 3 },
    { id: 'frontend', name: 'Développement Frontend',     sort: 4 },
    { id: 'devops',   name: 'DevOps / Platform Eng.',     sort: 5 },
    { id: 'security', name: 'Cybersécurité',              sort: 6 },
];

// member_skills: [{ memberName, team, skillId, level (1-4) }]
const MEMBER_SKILLS = [
    { memberName: 'Théo Vasseur',    team: 'Vega',   skillId: 'react',        level: 4 },
    { memberName: 'Théo Vasseur',    team: 'Vega',   skillId: 'nodejs',       level: 3 },
    { memberName: 'Théo Vasseur',    team: 'Vega',   skillId: 'architecture', level: 3 },
    { memberName: 'Lucie Arnaud',    team: 'Vega',   skillId: 'react',        level: 4 },
    { memberName: 'Lucie Arnaud',    team: 'Vega',   skillId: 'nodejs',       level: 2 },
    { memberName: 'Maxime Giraud',   team: 'Vega',   skillId: 'react',        level: 3 },
    { memberName: 'Chloé Mercier',   team: 'Vega',   skillId: 'react',        level: 2 },
    { memberName: 'Chloé Mercier',   team: 'Vega',   skillId: 'architecture', level: 2 },
    { memberName: 'Florian Lebas',   team: 'Lyra',   skillId: 'nodejs',       level: 4 },
    { memberName: 'Florian Lebas',   team: 'Lyra',   skillId: 'java',         level: 3 },
    { memberName: 'Florian Lebas',   team: 'Lyra',   skillId: 'kubernetes',   level: 3 },
    { memberName: 'Florian Lebas',   team: 'Lyra',   skillId: 'architecture', level: 4 },
    { memberName: 'Manon Cros',      team: 'Lyra',   skillId: 'java',         level: 4 },
    { memberName: 'Manon Cros',      team: 'Lyra',   skillId: 'nodejs',       level: 3 },
    { memberName: 'Manon Cros',      team: 'Lyra',   skillId: 'sql',          level: 2 },
    { memberName: 'Baptiste Ferry',  team: 'Lyra',   skillId: 'kubernetes',   level: 4 },
    { memberName: 'Baptiste Ferry',  team: 'Lyra',   skillId: 'terraform',    level: 4 },
    { memberName: 'Baptiste Ferry',  team: 'Lyra',   skillId: 'python',       level: 2 },
    { memberName: 'Inès Dupré',      team: 'Lyra',   skillId: 'kubernetes',   level: 3 },
    { memberName: 'Inès Dupré',      team: 'Lyra',   skillId: 'terraform',    level: 3 },
    { memberName: 'Romain Fabre',    team: 'Orion',  skillId: 'python',       level: 4 },
    { memberName: 'Romain Fabre',    team: 'Orion',  skillId: 'spark',        level: 4 },
    { memberName: 'Romain Fabre',    team: 'Orion',  skillId: 'sql',          level: 4 },
    { memberName: 'Romain Fabre',    team: 'Orion',  skillId: 'architecture', level: 3 },
    { memberName: 'Camille Huet',    team: 'Orion',  skillId: 'python',       level: 4 },
    { memberName: 'Camille Huet',    team: 'Orion',  skillId: 'spark',        level: 3 },
    { memberName: 'Camille Huet',    team: 'Orion',  skillId: 'sql',          level: 4 },
    { memberName: 'Tom Petit',       team: 'Orion',  skillId: 'sql',          level: 3 },
    { memberName: 'Tom Petit',       team: 'Orion',  skillId: 'python',       level: 2 },
    { memberName: 'Élise Morin',     team: 'Orion',  skillId: 'python',       level: 3 },
    { memberName: 'Élise Morin',     team: 'Orion',  skillId: 'nodejs',       level: 2 },
    { memberName: 'Élise Morin',     team: 'Orion',  skillId: 'sql',          level: 2 },
    { memberName: 'Nathan Brun',     team: 'Sirius', skillId: 'security',     level: 4 },
    { memberName: 'Nathan Brun',     team: 'Sirius', skillId: 'kubernetes',   level: 3 },
    { memberName: 'Nathan Brun',     team: 'Sirius', skillId: 'python',       level: 3 },
    { memberName: 'Julie Gros',      team: 'Sirius', skillId: 'security',     level: 3 },
    { memberName: 'Julie Gros',      team: 'Sirius', skillId: 'java',         level: 3 },
    { memberName: 'Julie Gros',      team: 'Sirius', skillId: 'nodejs',       level: 2 },
    { memberName: 'Paul Renaud',     team: 'Sirius', skillId: 'java',         level: 3 },
    { memberName: 'Paul Renaud',     team: 'Sirius', skillId: 'python',       level: 2 },
    { memberName: 'Paul Renaud',     team: 'Sirius', skillId: 'security',     level: 2 },
    { memberName: 'Adèle Blanc',     team: 'Sirius', skillId: 'architecture', level: 2 },
    { memberName: 'Adèle Blanc',     team: 'Sirius', skillId: 'java',         level: 2 },
];

// member_appetences: [{ memberName, team, appetenceId, value: forte|faible|neutre }]
const MEMBER_APPETENCES = [
    { memberName: 'Théo Vasseur',    team: 'Vega',   appetenceId: 'ia',       value: 'forte'  },
    { memberName: 'Théo Vasseur',    team: 'Vega',   appetenceId: 'frontend', value: 'forte'  },
    { memberName: 'Lucie Arnaud',    team: 'Vega',   appetenceId: 'frontend', value: 'forte'  },
    { memberName: 'Lucie Arnaud',    team: 'Vega',   appetenceId: 'cloud',    value: 'faible' },
    { memberName: 'Maxime Giraud',   team: 'Vega',   appetenceId: 'frontend', value: 'forte'  },
    { memberName: 'Maxime Giraud',   team: 'Vega',   appetenceId: 'ia',       value: 'forte'  },
    { memberName: 'Chloé Mercier',   team: 'Vega',   appetenceId: 'devops',   value: 'faible' },
    { memberName: 'Florian Lebas',   team: 'Lyra',   appetenceId: 'cloud',    value: 'forte'  },
    { memberName: 'Florian Lebas',   team: 'Lyra',   appetenceId: 'devops',   value: 'forte'  },
    { memberName: 'Manon Cros',      team: 'Lyra',   appetenceId: 'cloud',    value: 'forte'  },
    { memberName: 'Manon Cros',      team: 'Lyra',   appetenceId: 'data',     value: 'forte'  },
    { memberName: 'Baptiste Ferry',  team: 'Lyra',   appetenceId: 'devops',   value: 'forte'  },
    { memberName: 'Baptiste Ferry',  team: 'Lyra',   appetenceId: 'cloud',    value: 'forte'  },
    { memberName: 'Inès Dupré',      team: 'Lyra',   appetenceId: 'devops',   value: 'forte'  },
    { memberName: 'Romain Fabre',    team: 'Orion',  appetenceId: 'data',     value: 'forte'  },
    { memberName: 'Romain Fabre',    team: 'Orion',  appetenceId: 'ia',       value: 'forte'  },
    { memberName: 'Camille Huet',    team: 'Orion',  appetenceId: 'data',     value: 'forte'  },
    { memberName: 'Camille Huet',    team: 'Orion',  appetenceId: 'cloud',    value: 'forte'  },
    { memberName: 'Tom Petit',       team: 'Orion',  appetenceId: 'data',     value: 'forte'  },
    { memberName: 'Tom Petit',       team: 'Orion',  appetenceId: 'ia',       value: 'forte'  },
    { memberName: 'Élise Morin',     team: 'Orion',  appetenceId: 'ia',       value: 'forte'  },
    { memberName: 'Nathan Brun',     team: 'Sirius', appetenceId: 'security', value: 'forte'  },
    { memberName: 'Nathan Brun',     team: 'Sirius', appetenceId: 'cloud',    value: 'forte'  },
    { memberName: 'Julie Gros',      team: 'Sirius', appetenceId: 'security', value: 'forte'  },
    { memberName: 'Julie Gros',      team: 'Sirius', appetenceId: 'devops',   value: 'forte'  },
    { memberName: 'Paul Renaud',     team: 'Sirius', appetenceId: 'security', value: 'forte'  },
    { memberName: 'Paul Renaud',     team: 'Sirius', appetenceId: 'cloud',    value: 'faible' },
    { memberName: 'Adèle Blanc',     team: 'Sirius', appetenceId: 'devops',   value: 'faible' },
];

// mobility: [{ memberName, targetTeam, targetRole, currentLevel, potential, appetence, risk, plan, transitionDuration }]
const MOBILITY = [
    { memberName: 'Théo Vasseur',   targetRole: 'Tech Lead',      currentLevel: 3, potential: 'fort',   appetence: 'forte',  risk: 'moyen',    plan: 'Mentorat avec Florian Lebas',        transitionDuration: '6 mois'  },
    { memberName: 'Baptiste Ferry', targetRole: 'Platform Lead',  currentLevel: 4, potential: 'fort',   appetence: 'forte',  risk: 'aucun',    plan: 'Formation CKS + certif Terraform',   transitionDuration: '3 mois'  },
    { memberName: 'Romain Fabre',   targetTeam: 'Orion',          targetRole: 'Data Architect', currentLevel: 4, potential: 'fort', appetence: 'forte', risk: 'aucun', plan: '',           transitionDuration: ''        },
    { memberName: 'Tom Petit',      targetRole: 'Data Engineer',  currentLevel: 2, potential: 'moyen',  appetence: 'forte',  risk: 'moyen',    plan: 'Formation Spark + dbt',              transitionDuration: '9 mois'  },
    { memberName: 'Paul Renaud',    targetRole: 'SecOps Lead',    currentLevel: 2, potential: 'moyen',  appetence: 'forte',  risk: 'moyen',    plan: 'Certification OSCP, shadow de Nathan', transitionDuration: '12 mois' },
    { memberName: 'Maxime Giraud',  targetRole: 'Lead Frontend',  currentLevel: 3, potential: 'fort',   appetence: 'forte',  risk: 'faible',   plan: 'Prise de lead sur un Epic complet',  transitionDuration: '4 mois'  },
];

// ── 4. Features ───────────────────────────────────────────────────────────────
const FEATURES = [
    // PI#5
    { id:'FEAT-1',  title:'Refonte expérience client',          team:'Vega',   status:'inprog', piSprint:'PI#5', rank:0 },
    { id:'FEAT-2',  title:'API Gateway unifiée v2',             team:'Lyra',   status:'inprog', piSprint:'PI#5', rank:1 },
    { id:'FEAT-3',  title:'Observabilité & tracing distribué',  team:'Lyra',   status:'todo',   piSprint:'PI#5', rank:2 },
    { id:'FEAT-4',  title:'Catalogue data self-service',         team:'Orion',  status:'inprog', piSprint:'PI#5', rank:3 },
    { id:'FEAT-5',  title:'Conformité RGPD & data lineage',     team:'Sirius', status:'inprog', piSprint:'PI#5', rank:4 },
    { id:'FEAT-6',  title:'SSO & gestion des identités',        team:'Sirius', status:'todo',   piSprint:'PI#5', rank:5 },
    // PI#6
    { id:'FEAT-N1', title:'Copilote IA intégré',                team:'Vega',   status:'todo',   piSprint:'PI#6', rank:0 },
    { id:'FEAT-N2', title:'Architecture event-driven',          team:'Lyra',   status:'todo',   piSprint:'PI#6', rank:1 },
    { id:'FEAT-N3', title:'ML Pipeline temps réel',             team:'Orion',  status:'todo',   piSprint:'PI#6', rank:2 },
    { id:'FEAT-N4', title:'Zero Trust Security',                team:'Sirius', status:'todo',   piSprint:'PI#6', rank:3 },
];

// ── 5. Epics ──────────────────────────────────────────────────────────────────
const EPICS = [
    { id:'EPIC-1',  title:'UX — Design System v3',             team:'Vega',   feature:'FEAT-1', status:'inprog', piSprint:'PI#5' },
    { id:'EPIC-2',  title:'UX — Onboarding personnalisé',      team:'Vega',   feature:'FEAT-1', status:'todo',   piSprint:'PI#5' },
    { id:'EPIC-3',  title:'API GW — Routing & load balancing', team:'Lyra',   feature:'FEAT-2', status:'inprog', piSprint:'PI#5' },
    { id:'EPIC-4',  title:'API GW — Auth & token management',  team:'Lyra',   feature:'FEAT-2', status:'inprog', piSprint:'PI#5' },
    { id:'EPIC-5',  title:'Observability — Métriques SLO/SLI', team:'Lyra',   feature:'FEAT-3', status:'todo',   piSprint:'PI#5' },
    { id:'EPIC-6',  title:'Data — Indexation & recherche',     team:'Orion',  feature:'FEAT-4', status:'inprog', piSprint:'PI#5' },
    { id:'EPIC-7',  title:'Data — Gouvernance & qualité',      team:'Orion',  feature:'FEAT-4', status:'todo',   piSprint:'PI#5' },
    { id:'EPIC-8',  title:'RGPD — Purge & consentement',       team:'Sirius', feature:'FEAT-5', status:'inprog', piSprint:'PI#5' },
    { id:'EPIC-9',  title:'SSO — SAML 2.0 / OIDC',            team:'Sirius', feature:'FEAT-6', status:'inprog', piSprint:'PI#5' },
    { id:'EPIC-10', title:'SSO — MFA & device trust',          team:'Sirius', feature:'FEAT-6', status:'todo',   piSprint:'PI#5' },
];

// ── 6. Tickets ────────────────────────────────────────────────────────────────
function mkTicket(id, title, type, status, team, leader, points, priority, epic, extra = {}) {
    const sn = `${team} - Ite ${PI}.3`;
    const flagged = extra.flagged || false;
    const comments = extra.comments || [];
    const labels   = extra.labels   || [];
    const noPoints = extra.noPoints || false;
    return {
        id, title, type,
        status: flagged ? 'blocked' : status,
        team, leader: leader || null,
        contributors: extra.contributors || [],
        points: noPoints ? 0 : (points || 0),
        priority: priority || 'medium',
        sprintName: sn,
        piSprint: `PI#${PI}`,
        flagged,
        labels,
        epic: epic || null,
        description: extra.description || '',
        comments,
        recentChanges: status !== 'todo' ? [{
            date: daysAgo(randInt(0, 4)),
            author: leader || 'Équipe',
            field: 'status',
            from: 'todo',
            to: status === 'done' ? 'done' : 'inprog',
        }] : [],
        updatedAt: daysAgo(randInt(0, 6)),
    };
}

const TICKETS = [
    // ── Vega ───────────────────────────────────────────────────────────────────
    mkTicket('VEG-101','Refactorer le composant Header vers Design System v3','story','inprog','Vega','Théo Vasseur',5,'high','EPIC-1',{description:'<p>Le Header doit utiliser les tokens de couleur et typographie du DS v3. Supprimer les overrides inline.</p>'}),
    mkTicket('VEG-102','Page d\'accueil responsive mobile-first','story','inprog','Vega','Lucie Arnaud',8,'high','EPIC-1',{comments:[{id:'c1',author:'Chloé Mercier',body:'Maquettes validées par le PO hier.',date:daysAgo(2)}]}),
    mkTicket('VEG-103','Intégrer la font Inter dans le Design System','task','done','Vega','Maxime Giraud',2,'low','EPIC-1'),
    mkTicket('VEG-104','Bug — scroll infini sur la liste produit (Chrome 120)','bug','done','Vega','Lucie Arnaud',3,'high','EPIC-1'),
    mkTicket('VEG-105','Composant Notification Toast avec file d\'attente','story','review','Vega','Théo Vasseur',3,'medium','EPIC-1'),
    mkTicket('VEG-106','Wizard d\'onboarding 3 étapes (Welcome / Config / Démo)','story','todo','Vega',null,5,'medium','EPIC-2',{noPoints:false}),
    mkTicket('VEG-107','A/B test — variante page de connexion simplifiée','story','todo','Vega','Maxime Giraud',3,'low','EPIC-2'),
    mkTicket('VEG-108','Audit accessibilité WCAG 2.1 AA + corrections','task','inprog','Vega','Lucie Arnaud',5,'high','EPIC-1'),
    mkTicket('VEG-109','Perf — Réduire FCP sous 1.2s (lazy load, code splitting)','debt','done','Vega','Théo Vasseur',8,'high','EPIC-1'),
    mkTicket('VEG-110','Upgrade Storybook v8 + migrer les stories existantes','task','done','Vega','Maxime Giraud',2,'low','EPIC-1'),
    mkTicket('VEG-111','Datepicker localisé fr/en avec sélection plage','story','inprog','Vega','Théo Vasseur',5,'medium','EPIC-2',{flagged:true}),
    mkTicket('VEG-112','Bug — timezone incorrect dans le calendrier des rendez-vous','bug','todo','Vega',null,2,'medium','EPIC-2',{noPoints:true}),
    mkTicket('VEG-113','Tests Playwright e2e — parcours principal','task','test','Vega','Lucie Arnaud',3,'medium','EPIC-1'),
    mkTicket('VEG-114','Tech Debt — Migrer de Create React App vers Vite','debt','todo','Vega','Théo Vasseur',8,'low','EPIC-1',{labels:['tech-debt']}),

    // ── Lyra ───────────────────────────────────────────────────────────────────
    mkTicket('LYR-101','Circuit breaker sur l\'API Gateway (Hystrix → Resilience4j)','story','inprog','Lyra','Florian Lebas',5,'high','EPIC-3'),
    mkTicket('LYR-102','Rate limiting par clé API (Token Bucket, Redis)','story','done','Lyra','Manon Cros',3,'high','EPIC-3'),
    mkTicket('LYR-103','Proxy inverse pour les services d\'authentification','story','inprog','Lyra','Baptiste Ferry',8,'high','EPIC-4',{contributors:['Inès Dupré']}),
    mkTicket('LYR-104','Logging centralisé Loki + Grafana pour tous les services','task','done','Lyra','Inès Dupré',3,'medium','EPIC-5'),
    mkTicket('LYR-105','Refresh token automatique avec rotation (RFC 6749)','story','review','Lyra','Manon Cros',5,'high','EPIC-4'),
    mkTicket('LYR-106','Bug — latence P95 > 800ms sur /api/search en charge','bug','inprog','Lyra','Florian Lebas',5,'critical','EPIC-3',{flagged:true,comments:[{id:'c2',author:'Florian Lebas',body:'Tracé côté BDD : index manquant sur `created_at`. Correctif en cours.',date:daysAgo(1)}]}),
    mkTicket('LYR-107','Déploiement service auth sur k3s staging (canary)','ops','done','Lyra','Baptiste Ferry',2,'medium','EPIC-4'),
    mkTicket('LYR-108','Métriques Prometheus custom (latence, error rate, saturation)','task','todo','Lyra','Inès Dupré',3,'medium','EPIC-5'),
    mkTicket('LYR-109','Documentation API Gateway avec OpenAPI 3.1 + Redoc','task','todo','Lyra','Manon Cros',2,'low','EPIC-3',{noPoints:true}),
    mkTicket('LYR-110','Bug — session coupée après 15min idle (JWT exp trop court)','bug','done','Lyra','Florian Lebas',3,'high','EPIC-4'),
    mkTicket('LYR-111','Migration routage NGINX Ingress v1.10 + cert-manager','ops','inprog','Lyra','Baptiste Ferry',5,'medium','EPIC-3'),
    mkTicket('LYR-112','Tests de contrat Pact (consumer-driven) entre services','task','todo','Lyra','Manon Cros',3,'medium','EPIC-3'),
    mkTicket('LYR-113','Alertes PagerDuty — SLO error budget burn rate','ops','done','Lyra','Inès Dupré',2,'medium','EPIC-5'),
    mkTicket('LYR-114','Perf — Activer le connection pooling PgBouncer','debt','todo','Lyra','Florian Lebas',5,'medium','EPIC-3',{labels:['tech-debt']}),

    // ── Orion ──────────────────────────────────────────────────────────────────
    mkTicket('ORI-101','Connecteur Snowflake v3 avec partitionnement par tenant','story','inprog','Orion','Romain Fabre',8,'high','EPIC-6'),
    mkTicket('ORI-102','API de recherche full-text dans le catalogue (Elasticsearch)','story','inprog','Orion','Camille Huet',5,'high','EPIC-6',{contributors:['Élise Morin']}),
    mkTicket('ORI-103','Détection automatique des PII (NLP + regex)','story','todo','Orion','Élise Morin',5,'high','EPIC-7'),
    mkTicket('ORI-104','Bug — crash sur l\'export CSV > 1M lignes (OOM)','bug','done','Orion','Camille Huet',3,'critical','EPIC-6'),
    mkTicket('ORI-105','Tags de classification des données (sensitivity levels)','task','review','Orion','Tom Petit',3,'medium','EPIC-7'),
    mkTicket('ORI-106','Dashboard qualité des données (completeness, freshness)','story','inprog','Orion','Romain Fabre',8,'high','EPIC-7'),
    mkTicket('ORI-107','Bug — requêtes lentes sur la table events (> 50s)','bug','inprog','Orion','Camille Huet',5,'critical','EPIC-6',{flagged:true,comments:[{id:'c3',author:'Camille Huet',body:'EXPLAIN ANALYZE montre un seq scan sur 200M lignes. Besoin d\'un index partitionné.',date:daysAgo(0)}]}),
    mkTicket('ORI-108','Migration pipeline dbt vers dbt Cloud (orchestration)','ops','done','Orion','Élise Morin',3,'medium','EPIC-6'),
    mkTicket('ORI-109','Charte de gouvernance data (documentation interne)','task','done','Orion','Tom Petit',2,'low','EPIC-7'),
    mkTicket('ORI-110','Lineage automatique des datasets via Open Lineage','story','todo','Orion','Romain Fabre',8,'medium','EPIC-7'),
    mkTicket('ORI-111','Optimisation des partitions Iceberg (z-ordering)','debt','todo','Orion','Camille Huet',5,'medium','EPIC-6',{labels:['tech-debt']}),
    mkTicket('ORI-112','Alertes qualité temps réel (Great Expectations + Airflow)','story','test','Orion','Élise Morin',3,'medium','EPIC-7'),
    mkTicket('ORI-113','Bug — encoding UTF-8 corrompu dans les exports Parquet','bug','done','Orion','Camille Huet',2,'high','EPIC-6'),
    mkTicket('ORI-114','Indexation des métadonnées catalogue (batch nocturne)','debt','todo','Orion',null,5,'medium','EPIC-6',{noPoints:true}),

    // ── Sirius ─────────────────────────────────────────────────────────────────
    mkTicket('SIR-101','Configuration provider SAML 2.0 — Azure AD & Okta','story','inprog','Sirius','Nathan Brun',8,'high','EPIC-9',{contributors:['Paul Renaud']}),
    mkTicket('SIR-102','JWT avec rotation automatique des signing keys','story','inprog','Sirius','Julie Gros',5,'high','EPIC-9'),
    mkTicket('SIR-103','MFA TOTP sur le portail admin (authenticator app)','story','done','Sirius','Paul Renaud',5,'high','EPIC-10'),
    mkTicket('SIR-104','Bug — fuite de tokens dans les logs d\'erreur (masquage)','bug','done','Sirius','Nathan Brun',3,'critical','EPIC-9',{comments:[{id:'c4',author:'Nathan Brun',body:'Regex ajoutée dans le log formatter. Déployé en prod le 05/06.',date:daysAgo(4)}]}),
    mkTicket('SIR-105','Politique de purge RGPD automatique (90j / 1an / à la demande)','story','inprog','Sirius','Julie Gros',8,'high','EPIC-8'),
    mkTicket('SIR-106','Consentement granulaire des cookies (banner + préférences)','story','todo','Sirius','Paul Renaud',5,'high','EPIC-8'),
    mkTicket('SIR-107','Audit sécurité OWASP Top 10 — rapport + remédiation','task','review','Sirius','Nathan Brun',5,'high','EPIC-8'),
    mkTicket('SIR-108','Bug — XSS stocké dans le formulaire de recherche avancée','bug','done','Sirius','Julie Gros',3,'critical','EPIC-9'),
    mkTicket('SIR-109','Déploiement WAF (ModSecurity) sur tous les endpoints publics','ops','todo','Sirius','Nathan Brun',3,'high','EPIC-8'),
    mkTicket('SIR-110','Mise à jour des dépendances critiques (SBOM + Dependabot)','task','done','Sirius','Paul Renaud',2,'high','EPIC-9'),
    mkTicket('SIR-111','SIEM Splunk — alertes auth suspectes + correlation rules','ops','inprog','Sirius','Nathan Brun',5,'high','EPIC-9'),
    mkTicket('SIR-112','Bug — non-conformité RGPD sur l\'export utilisateurs (email en clair)','bug','todo','Sirius',null,3,'critical','EPIC-8',{noPoints:true}),
    mkTicket('SIR-113','Test de pénétration automatisé DAST (OWASP ZAP)','task','todo','Sirius','Paul Renaud',5,'medium','EPIC-8'),
    mkTicket('SIR-114','Tech Debt — Remplacer MD5 par bcrypt dans l\'auth legacy','debt','inprog','Sirius','Julie Gros',5,'critical','EPIC-9',{labels:['tech-debt']}),

    // ── Retro / Amélioration continue ──────────────────────────────────────────
    mkTicket('RET-1','Daily standup — limiter à 15min avec un timebox visible','task','inprog','Vega','Chloé Mercier',1,'low',null,{labels:['retro']}),
    mkTicket('RET-2','Clarifier les critères d\'acceptance avec le PO avant sprint','task','todo','Lyra','Florian Lebas',2,'medium',null,{labels:['retro']}),
    mkTicket('RET-3','Post-mortem — incident API payment du 14/05 (RCA complet)','task','done','Lyra','Inès Dupré',3,'high',null,{labels:['postmortem']}),
    mkTicket('RET-4','CoP Dev — bonnes pratiques Kubernetes & GitOps','task','inprog','Orion','Romain Fabre',2,'low',null,{labels:['cop']}),
    mkTicket('RET-5','Adapter la DoD : inclure tests de performance (k6)','task','todo','Sirius','Adèle Blanc',2,'medium',null,{labels:['adapt']}),
    mkTicket('RET-6','CoP Architecture — Event Sourcing vs CQRS : REX PI#4','task','todo','Vega','Théo Vasseur',2,'low',null,{labels:['cop']}),
    mkTicket('RET-7','Améliorer le processus de code review (checklist + SLA)','task','inprog','Lyra','Manon Cros',1,'medium',null,{labels:['retro']}),
    mkTicket('RET-8','Post-mortem — dégradation perf API catalogue du 22/05','task','todo','Orion','Camille Huet',2,'high',null,{labels:['postmortem']}),

    // ── Support ────────────────────────────────────────────────────────────────
    mkTicket('SUP-1','Erreur 500 sur /api/checkout en production (gateway timeout)','bug','inprog','Lyra','Florian Lebas',0,'critical',null,{labels:['support']}),
    mkTicket('SUP-2','Fuite mémoire sur le worker data-export (OOM après 4h)','bug','todo','Orion','Camille Huet',0,'high',null,{labels:['support']}),
    mkTicket('SUP-3','Accès refusé pour le rôle Manager sur le dashboard analytique','bug','inprog','Sirius','Nathan Brun',0,'high',null,{labels:['support']}),
    mkTicket('SUP-4','Timeout sur l\'export CSV > 500k lignes (> 30s)','bug','done','Orion','Élise Morin',0,'medium',null,{labels:['support']}),
    mkTicket('SUP-5','Bug affichage Safari 17.2 — menu déroulant coupé','bug','done','Vega','Lucie Arnaud',0,'low',null,{labels:['support']}),
];

// ── 7. PI Objectives ──────────────────────────────────────────────────────────
const PI_OBJECTIVES = [
    { id:'obj-1', text:'Réduire le TTI de la page d\'accueil de 40%',              status:'todo', team:'Vega',   bv:8  },
    { id:'obj-2', text:'Migrer 5 services critiques vers l\'API Gateway v2',        status:'todo', team:'Lyra',   bv:10 },
    { id:'obj-3', text:'Atteindre 99.5% de disponibilité sur le catalogue data',   status:'done', team:'Orion',  bv:6  },
    { id:'obj-4', text:'Passer l\'audit RGPD interne avec 0 point bloquant',       status:'todo', team:'Sirius', bv:12 },
    { id:'obj-5', text:'Déployer le SSO sur les 4 applications core',              status:'todo', team:'Sirius', bv:9  },
    { id:'obj-6', text:'Former 75% des devs aux pratiques SLO/SLI (observabilité)', status:'todo', team:'',      bv:5  },
];

// ── 8. ROAM Risks ─────────────────────────────────────────────────────────────
const RISKS = [
    { title:'API Paiement tierce non livrée avant sprint 5.4',            quadrant:'mitigate',  impact:'critical', probability:'high',   team:'Lyra',   owner:'Florian Lebas',  description:'Le fournisseur a pris du retard. Blocage potentiel sur FEAT-2.',       mitigation:'Plan B : développer un wrapper interne en mode dégradé' },
    { title:'Saturation BDD prod à 87% — risque downtime sous 3 semaines', quadrant:'mitigate', impact:'high',    probability:'medium', team:'Orion',  owner:'Camille Huet',   description:'Le volume de données catalogue dépasse les prévisions × 3.',          mitigation:'Extension stockage planifiée semaine 5.4, migration vers Iceberg' },
    { title:'Scope creep sur la Feature Copilote IA (PI#6)',               quadrant:'owned',     impact:'medium',  probability:'high',   team:'Vega',   owner:'Chloé Mercier',  description:'Les demandes métier s\'élargissent semaine après semaine.',            mitigation:'Backlog formalisé, pas de nouvelles stories acceptées sans validation PO' },
    { title:'Audit RGPD externe décalé de 2 semaines côté prestataire',    quadrant:'accepted',  impact:'medium',  probability:'medium', team:'Sirius', owner:'Adèle Blanc',    description:'L\'auditeur externe a repoussé la date. Impact léger sur FEAT-5.',     mitigation:'Buffer prévu dans l\'IP sprint — suivi hebdomadaire' },
    { title:'Migration DNS sans fenêtre de maintenance validée',            quadrant:'resolved',  impact:'high',    probability:'low',    team:'Lyra',   owner:'Baptiste Ferry', description:'Initialement sans coupure. Résolu via déploiement blue-green.',        mitigation:'Migration découpée en blue-green avec bascule progressive' },
];

// ── 9. Events (Faits marquants) ───────────────────────────────────────────────
const EVENTS = [
    { title:'Gel de code PI#5',                    date: addDays(TODAY, 3),   type:'freeze',   team:'' },
    { title:'Sprint Review & Démo PI#5 Sprint 3',  date: addDays(TODAY, 8),   type:'demo',     team:'' },
    { title:'Début Sprint 5.4',                    date: addDays(TODAY, 7),   type:'sprint',   team:'' },
    { title:'Release v3.1 en production',           date: addDays(TODAY, -7), type:'release',  team:'' },
    { title:'Incident prod — timeout API gateway',  date: addDays(TODAY,-14), type:'incident', team:'Lyra' },
    { title:'Formation Cloud Native — équipe Vega', date: addDays(TODAY,-3),  type:'training', team:'Vega' },
];

// ── 10. Absences ──────────────────────────────────────────────────────────────
const ABSENCES = [
    { member_name:'Chloé Mercier',  team:'Vega',   start_date:addDays(TODAY,-5),  end_date:addDays(TODAY,-5),  type:'conge',    days:1,  note:'Pont' },
    { member_name:'Théo Vasseur',   team:'Vega',   start_date:addDays(TODAY,9),   end_date:addDays(TODAY,13),  type:'conge',    days:5,  note:'Congés annuels' },
    { member_name:'Lucie Arnaud',   team:'Vega',   start_date:addDays(TODAY,1),   end_date:addDays(TODAY,2),   type:'formation',days:2,  note:'Formation Cloud Native LKD' },
    { member_name:'Maxime Giraud',  team:'Vega',   start_date:addDays(TODAY,-3),  end_date:addDays(TODAY,-1),  type:'maladie',  days:3,  note:'' },
    { member_name:'Florian Lebas',  team:'Lyra',   start_date:addDays(TODAY,9),   end_date:addDays(TODAY,18),  type:'conge',    days:8,  note:'Vacances' },
    { member_name:'Manon Cros',     team:'Lyra',   start_date:addDays(TODAY,3),   end_date:addDays(TODAY,3),   type:'formation',days:1,  note:'Kubernetes CKA prep' },
    { member_name:'Baptiste Ferry', team:'Lyra',   start_date:addDays(TODAY,-7),  end_date:addDays(TODAY,-5),  type:'conge',    days:3,  note:'' },
    { member_name:'Romain Fabre',   team:'Orion',  start_date:addDays(TODAY,16),  end_date:addDays(TODAY,20),  type:'conge',    days:5,  note:'Été' },
    { member_name:'Camille Huet',   team:'Orion',  start_date:addDays(TODAY,1),   end_date:addDays(TODAY,1),   type:'formation',days:1,  note:'dbt Fundamentals' },
    { member_name:'Tom Petit',      team:'Orion',  start_date:addDays(TODAY,-14), end_date:addDays(TODAY,-10), type:'conge',    days:5,  note:'' },
    { member_name:'Nathan Brun',    team:'Sirius', start_date:addDays(TODAY,3),   end_date:addDays(TODAY,7),   type:'conge',    days:5,  note:'Congés' },
    { member_name:'Paul Renaud',    team:'Sirius', start_date:addDays(TODAY,-2),  end_date:addDays(TODAY,-1),  type:'maladie',  days:2,  note:'' },
    { member_name:'Julie Gros',     team:'Sirius', start_date:addDays(TODAY,16),  end_date:addDays(TODAY,18),  type:'formation',days:3,  note:'ISO 27001 Lead Auditor' },
];

// ── 11. Support Rotation ──────────────────────────────────────────────────────
function mkRot(team, weekStart, members, locked = false) {
    const ws = new Date(weekStart);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const label = `S${ws.toISOString().slice(0,10).replace(/-/g,'').slice(4,8)}`;
    return { team, week_label: label, week_start: ws.toISOString().slice(0,10), week_end: we.toISOString().slice(0,10), members, locked };
}

function buildRotations() {
    const rotations = [];
    const teamData = {
        Vega:   ['Chloé Mercier','Théo Vasseur','Lucie Arnaud','Maxime Giraud'],
        Lyra:   ['Florian Lebas','Manon Cros','Baptiste Ferry','Inès Dupré'],
        Orion:  ['Romain Fabre','Camille Huet','Tom Petit','Élise Morin'],
        Sirius: ['Nathan Brun','Julie Gros','Paul Renaud','Adèle Blanc'],
    };
    for (const [team, members] of Object.entries(teamData)) {
        for (let w = -4; w <= 6; w++) {
            const ws = add(w * 7 - ((TODAY.getDay() + 6) % 7)); // lundi de la semaine w
            const pair = [members[(w + 8) % members.length], members[(w + 9) % members.length]];
            rotations.push(mkRot(team, ws.toISOString().slice(0,10), pair, w < 0));
        }
    }
    return rotations;
}

// ── 12. Sprint & PI info ──────────────────────────────────────────────────────
const SPRINT_INFO = {
    name: `Sprint ${PI}.3`,
    startDate: add(-8).toISOString(),
    endDate:   add(6).toISOString(),
    goal: 'Consolider l\'API Gateway, avancer sur le catalogue data et préparer l\'audit RGPD',
    teamSprints: TEAMS.map(t => ({
        name: `${t.name} - Ite ${PI}.3`,
        team: t.name,
        state: 'active',
        startDate: add(-8).toISOString().slice(0,10),
        endDate:   add(6).toISOString().slice(0,10),
    })),
};

const PI_START = add(-8 - 28); // sprint 29.1 started 36 days ago
const PI_INFO  = {
    number: PI,
    name: `PI#${PI}`,
    startDate: PI_START.toISOString().slice(0,10),
    sprintsPerPI: 5,
    sprintDuration: 14,
    objectives: PI_OBJECTIVES,
};

// ══════════════════════════════════════════════════════════════════════════════
// Main export
// ══════════════════════════════════════════════════════════════════════════════
export async function seedFullDemoData(onProgress) {
    const report = (msg) => { if (onProgress) onProgress(msg); };

    // ── Clear core entities via importAll (replace) ───────────────────────────
    report('Nettoyage des données existantes…');
    await api.importAll({
        tickets:  [],
        features: [],
        epics:    [],
        members:  [],
        teams:    [],
        groups:   [],
        absences: [],
        support:  [],
    }, 'replace');

    // ── Clear extra entities ───────────────────────────────────────────────────
    report('Suppression des données annexes…');
    const [existingRisks, existingEvents, existingSkills, existingAppetences] = await Promise.all([
        api.getRisks().catch(() => []),
        api.getEvents().catch(() => []),
        api.getSkills().catch(() => []),
        api.getAppetences().catch(() => []),
    ]);
    await Promise.all([
        ...existingRisks.map(r   => api.deleteRisk(r.id).catch(() => {})),
        ...existingEvents.map(e  => api.deleteEvent(e.id).catch(() => {})),
        ...existingSkills.map(s  => api.deleteSkill(s.id).catch(() => {})),
        ...existingAppetences.map(a => api.deleteAppetence(a.id).catch(() => {})),
    ]);

    // ── Teams & Groups ─────────────────────────────────────────────────────────
    report('Création des équipes et groupes…');
    for (const t of TEAMS)  await api.createTeam(t);
    for (const g of GROUPS) await api.createGroup(g);

    // ── Members ────────────────────────────────────────────────────────────────
    report('Création des membres…');
    for (const m of MEMBERS) await api.createMember(m);

    // ── Features ──────────────────────────────────────────────────────────────
    report('Création des features…');
    for (const f of FEATURES) await api.createFeature(f);

    // ── Epics ──────────────────────────────────────────────────────────────────
    report('Création des epics…');
    for (const e of EPICS) await api.createEpic(e);

    // ── Tickets ────────────────────────────────────────────────────────────────
    report('Création des tickets…');
    for (const t of TICKETS) await api.createTicket(t);

    // ── Sprint & PI ────────────────────────────────────────────────────────────
    report('Configuration sprint & PI…');
    await api.updateSprint(SPRINT_INFO);
    await api.updatePI(PI_INFO);

    // ── Absences ───────────────────────────────────────────────────────────────
    report('Création des absences…');
    await api.bulkCreateAbsences(ABSENCES, true);

    // ── Support rotation ───────────────────────────────────────────────────────
    report('Génération des rotations support…');
    const rotations = buildRotations();
    for (const team of TEAMS.map(t => t.name)) {
        const teamRots = rotations.filter(r => r.team === team);
        await api.bulkCreateSupport(team, teamRots);
    }

    // ── Events ─────────────────────────────────────────────────────────────────
    report('Création des faits marquants…');
    for (const e of EVENTS) await api.createEvent(e);

    // ── ROAM Risks ─────────────────────────────────────────────────────────────
    report('Création des risques ROAM…');
    for (const r of RISKS) await api.createRisk(r);

    // ── Atlas : Skills & Appetences ────────────────────────────────────────────
    report('Création des compétences…');
    for (const s of SKILLS)     await api.createSkill(s);
    for (const a of APPETENCES) await api.createAppetence(a);

    report('Renseignement de la matrice de compétences…');
    for (const ms of MEMBER_SKILLS) {
        await api.upsertMemberSkill({ scope: 'member', scopeKey: ms.memberName, team: ms.team, skillId: ms.skillId, level: ms.level });
    }
    for (const ma of MEMBER_APPETENCES) {
        await api.upsertMemberAppetence({ scope: 'member', scopeKey: ma.memberName, team: ma.team, appetenceId: ma.appetenceId, value: ma.value });
    }

    report('Renseignement de la mobilité…');
    for (const mob of MOBILITY) {
        await api.upsertMobility({ memberName: mob.memberName, ...mob });
    }

    report('✅ Données démo chargées avec succès !');
    return true;
}
