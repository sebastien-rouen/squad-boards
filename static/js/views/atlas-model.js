/**
 * Atlas — modèle (3.263.0) : SOURCE UNIQUE des calculs de compétences, pour la carte, la matrice, le
 * tableau de bord, la fiche et l'atelier. `atlasCtx()` lit le store UNE fois ; les autres fonctions sont
 * pures (elles ne lisent que le contexte) — deux vues qui comptent les sachants doivent dire le même chiffre.
 *
 * Données : niveau ET envie par compétence = `memberSkills` (scope « member » ; envie = `appetence`,
 * 3.262.0) ; catalogue d'appétences séparé (Management, Coaching…) = `memberAppetences` ; compétences
 * requises par équipe = `teamSkillRequirements` (en base). Sachant = niveau ≥ 2.
 */

import { store } from '../state.js';
import { deriveMembersFromAbsences, hashColor } from '../utils.js';
import { projectStorage } from '../project-settings.js';

export const SKILL_LEVELS = [
    { v: 0, label: 'Non évalué',             short: '–', color: 'var(--border)', desc: 'Compétence non encore évaluée pour cette personne / équipe.' },
    { v: 1, label: 'Exécutant spécialisé',   short: '1', color: '#94a3b8', desc: 'Réalise des tâches cadrées sous supervision. Maîtrise un périmètre restreint.' },
    { v: 2, label: 'Opérationnel structuré', short: '2', color: '#38bdf8', desc: 'Autonome sur les cas courants. Applique les standards sans assistance.' },
    { v: 3, label: 'Ingénieur cloud ready',  short: '3', color: '#22c55e', desc: 'Conçoit des solutions robustes, gère la complexité, accompagne les autres.' },
    { v: 4, label: 'Référent / architecte',  short: '4', color: '#a855f7', desc: 'Référence sur le sujet. Définit les standards, forme et arbitre.' },
];
export const APPETENCE_VALUES = [
    { v: 'faible', label: 'Faible', color: '#94a3b8', icon: '○' },
    { v: 'neutre', label: 'Neutre', color: '#cbd5e1', icon: '◐' },
    { v: 'forte',  label: 'Forte',  color: '#f59e0b', icon: '●' },
];
/** Prénom d'un nom RH « NOM, Prénom » ou JIRA « Prénom Nom ». */
export const firstName = n => { const s = String(n || ''); const i = s.indexOf(','); return (i >= 0 ? s.slice(i + 1) : s).trim().split(/\s+/)[0] || s; };
export const levelMeta = v => SKILL_LEVELS.find(l => l.v === v) || SKILL_LEVELS[0];

/**
 * Référentiel PROPRE AU PROJET (3.271.0) : libellé et description des niveaux 1 à 4, réglage de projet
 * `sb-atlas-levels` = { 1: { label, desc }, … }, édité dans ⚙️ Catalogue. L'ÉCHELLE (0-4, sachant ≥ 2) ne change
 * pas : les calculs en dépendent. Appliqué EN PLACE sur SKILL_LEVELS (même tableau pour la TV, la fiche, la
 * frise) ; champ vide = libellé par défaut ci-dessus.
 */
export const LEVELS_KEY = 'sb-atlas-levels';
export const DEFAULT_LEVELS = Object.freeze(SKILL_LEVELS.map(l => Object.freeze({ ...l })));
export function applyLevelLabels() {
    let custom = {};
    try { custom = JSON.parse(projectStorage.getItem(LEVELS_KEY) || '{}') || {}; } catch { /* réglage illisible : défauts */ }
    for (const l of SKILL_LEVELS) {
        const d = DEFAULT_LEVELS[l.v], c = l.v ? custom[l.v] : null;
        l.label = String(c?.label || '').trim() || d.label;
        l.desc = String(c?.desc || '').trim() || d.desc;
    }
}
applyLevelLabels();
export const EXPERT_MIN = 2;

const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.name || '').localeCompare(b.name || '', 'fr');

/** Contexte d'un rendu : personnes, équipes visibles (filtre topbar), catalogues, index des évaluations. */
export function atlasCtx() {
    applyLevelLabels();   // le référentiel a pu changer (autre poste, Catalogue)
    const groups = store.get('groups') || [];
    const allTeams = store.get('teams') || [];
    const selGroup = store.get('group');
    const selTeam = store.get('team');
    let teams = allTeams;
    if (selGroup) teams = groups.find(g => g.id === selGroup)?.teams || [];
    else if (selTeam && selTeam !== 'all') teams = allTeams.filter(t => t === selTeam);

    const teamObjects = store.get('teamObjects') || [];
    const people = deriveMembersFromAbsences(store.get('absences') || [], store.get('members') || [])
        .filter(m => m.name && m.team)
        .sort((a, b) => a.team.localeCompare(b.team, 'fr') || a.name.localeCompare(b.name, 'fr'));

    const idx = new Map();      // `${nom}|${skillId}` → { level, appetence }
    for (const r of store.get('memberSkills') || []) if (r.scope === 'member') idx.set(`${r.scopeKey}|${r.skillId}`, r);
    const appIdx = new Map();   // `${nom}|${appetenceId}` → valeur (catalogue d'appétences)
    for (const r of store.get('memberAppetences') || []) if (r.scope === 'member') appIdx.set(`${r.scopeKey}|${r.appetenceId}`, r.value);
    const reqs = new Map();     // équipe → Set(skillId)
    for (const r of store.get('teamSkillRequirements') || []) (reqs.get(r.team) || reqs.set(r.team, new Set()).get(r.team)).add(r.skillId);

    return {
        groups, allTeams, teams, people,
        visiblePeople: people.filter(p => teams.includes(p.team)),
        skills: [...(store.get('skills') || [])].sort(bySort),
        appetences: [...(store.get('appetences') || [])].sort(bySort),
        mobility: store.get('mobility') || [],
        absences: store.get('absences') || [],
        tickets: store.get('tickets') || [],
        idx, appIdx, reqs,
        teamColor: name => teamObjects.find(t => t.name === name)?.color || hashColor(name),
    };
}

export const levelOf = (ctx, name, skillId) => ctx.idx.get(`${name}|${skillId}`)?.level || 0;
export const wantOf = (ctx, name, skillId) => ctx.idx.get(`${name}|${skillId}`)?.appetence || 'neutre';
export const catalogWantOf = (ctx, name, appId) => ctx.appIdx.get(`${name}|${appId}`) || 'neutre';
export const requiredOf = (ctx, team) => ctx.reqs.get(team) || new Set();
export const membersOf = (ctx, team) => ctx.people.filter(p => p.team === team);
export const hasEvaluations = ctx => ctx.idx.size > 0;

/** Sachants (niveau ≥ 2) d'une compétence, parmi `people`. */
export const expertsOf = (ctx, skillId, people = ctx.visiblePeople) => people.filter(p => levelOf(ctx, p.name, skillId) >= EXPERT_MIN);
/** Apprenants : niveau 1, ou envie forte sans être encore sachant — la relève possible. */
export const learnersOf = (ctx, skillId, people = ctx.visiblePeople) =>
    people.filter(p => { const l = levelOf(ctx, p.name, skillId); return l === 1 || (l < EXPERT_MIN && wantOf(ctx, p.name, skillId) === 'forte'); });

/** Niveau moyen d'une compétence sur des personnes (évaluées seulement), arrondi au dixième ; 0 = aucune. */
export function avgLevel(ctx, skillId, people = ctx.visiblePeople) {
    const v = people.map(p => levelOf(ctx, p.name, skillId)).filter(Boolean);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : 0;
}

/** Niveaux moyens d'une équipe, par compétence (radar d'équipe). */
export const teamLevels = (ctx, team, people = membersOf(ctx, team)) =>
    Object.fromEntries(ctx.skills.map(s => [s.id, avgLevel(ctx, s.id, people)]));

/**
 * Couverture des compétences REQUISES d'une équipe : part de celles qui ont au moins un sachant.
 * `people` permet de simuler un effectif différent (atelier). total = 0 → aucune exigence posée.
 */
export function coverage(ctx, team, people = membersOf(ctx, team)) {
    const req = [...requiredOf(ctx, team)].filter(id => ctx.skills.some(s => s.id === id));
    const missing = req.filter(id => !expertsOf(ctx, id, people).length);
    return { total: req.length, ok: req.length - missing.length, missing, pct: req.length ? Math.round((req.length - missing.length) / req.length * 100) : null };
}

/** Compétences évaluées ou requises dans le périmètre (le reste du catalogue n'a encore rien à dire). */
export const activeSkills = ctx => ctx.skills.filter(s =>
    ctx.visiblePeople.some(p => levelOf(ctx, p.name, s.id) > 0 || wantOf(ctx, p.name, s.id) === 'forte')
    || ctx.teams.some(t => requiredOf(ctx, t).has(s.id)));

/** Absent dans les 14 prochains jours (période qui chevauche aujourd'hui → J+14). */
export function absentSoon(ctx, name) {
    const today = new Date().toISOString().slice(0, 10);
    const in2w = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    return ctx.absences.find(a => a.memberName === name && a.startDate <= in2w && a.endDate >= today) || null;
}
/** Charge = tickets actifs dont la personne est porteuse ou contributrice. */
export const memberLoad = (ctx, name) =>
    ctx.tickets.filter(t => t.status !== 'done' && (t.leader === name || (t.contributors || []).includes(name))).length;

/**
 * Signaux du périmètre, du plus urgent au moins urgent — même liste pour la carte, le tableau de bord
 * et l'alerte d'absence. Chaque signal nomme QUOI, QUI, OÙ : un pourcentage seul n'aide pas à agir.
 */
export function signals(ctx) {
    const out = [];
    const name = id => ctx.skills.find(s => s.id === id)?.name || '?';
    for (const team of ctx.teams) {
        for (const id of coverage(ctx, team).missing) {
            const learners = learnersOf(ctx, id, membersOf(ctx, team));
            out.push({ sev: 'danger', kind: 'trou', icon: '🕳️', team, skillId: id, who: learners.map(p => p.name),
                title: `${team} : ${name(id)} non couvert`, text: `Requis par l'équipe, aucun sachant (niveau ≥ 2).${learners.length ? ` Relève possible : ${learners.map(p => firstName(p.name)).join(', ')}.` : ''}` });
        }
    }
    for (const s of activeSkills(ctx)) {
        const ex = expertsOf(ctx, s.id);
        if (ex.length === 1) {
            const away = absentSoon(ctx, ex[0].name);
            out.push({ sev: away ? 'danger' : 'warn', kind: 'bus', icon: '🚌', team: ex[0].team, skillId: s.id, who: [ex[0].name],
                title: `${s.name} : un seul sachant`, text: `${ex[0].name} porte seul ${s.name}${away ? ` — absent du ${away.startDate.slice(8, 10)}/${away.startDate.slice(5, 7)} au ${away.endDate.slice(8, 10)}/${away.endDate.slice(5, 7)}` : ''}.` });
        }
    }
    for (const p of ctx.visiblePeople) {
        const wants = ctx.skills.filter(s => wantOf(ctx, p.name, s.id) === 'forte' && levelOf(ctx, p.name, s.id) < EXPERT_MIN);
        if (wants.length) out.push({ sev: 'info', kind: 'envie', icon: '✨', team: p.team, skillId: wants[0].id, who: [p.name],
            title: `${firstName(p.name)} : envie de ${wants.map(s => s.name).join(', ')}`, text: 'Envie forte, pas encore sachant : une montée en compétence à proposer.' });
    }
    const rank = { danger: 0, warn: 1, info: 2, ok: 3 };
    return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

/**
 * « Qui affecter ? » — score = niveau × 25 − charge × 8 − absence proche 15 + envie forte 10
 * (formule de l'Atlas d'origine, l'envie est désormais celle de la compétence demandée).
 */
export function suggest(ctx, skillId, { team = null, skipAway = false } = {}) {
    return ctx.people
        .filter(p => !team || p.team === team)
        .map(p => {
            const level = levelOf(ctx, p.name, skillId), load = memberLoad(ctx, p.name), away = absentSoon(ctx, p.name);
            const want = wantOf(ctx, p.name, skillId);
            return { p, level, load, away, want, score: level * 25 - load * 8 - (away ? 15 : 0) + (want === 'forte' ? 10 : 0) };
        })
        .filter(x => (x.level > 0 || x.want === 'forte') && !(skipAway && x.away))
        .sort((a, b) => b.score - a.score);
}

/** Impact d'un déplacement simulé : couverture avant / après des deux équipes, effectif, charge. */
export function simImpact(ctx, { who, to }) {
    const p = ctx.people.find(x => x.name === who);
    if (!p || p.team === to) return null;
    const from = p.team;
    const fromAfter = membersOf(ctx, from).filter(x => x.name !== who);
    const toAfter = [...membersOf(ctx, to), { ...p, team: to }];
    return {
        who: p, from, to,
        fromCov: [coverage(ctx, from), coverage(ctx, from, fromAfter)],
        toCov: [coverage(ctx, to), coverage(ctx, to, toAfter)],
        fromSize: [membersOf(ctx, from).length, fromAfter.length],
        load: memberLoad(ctx, who),
        // Compétences dont il est le DERNIER sachant de son équipe d'origine
        lost: ctx.skills.filter(s => levelOf(ctx, who, s.id) >= EXPERT_MIN && !expertsOf(ctx, s.id, fromAfter).length),
    };
}
