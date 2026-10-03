/**
 * « Statuts forcés » — certains statuts JIRA vont dans une colonne donnée (Terminé, En cours, À faire)
 * pour toutes les équipes sauf quelques-unes. Règle en base (Paramètres → JIRA,
 * `piInfo.statusOverride`), à défaut config.js → STATUS_OVERRIDE_DEFAULTS. Source unique, utilisée par :
 *   - la synchro (sync-parse.js) : statut du ticket ET rejeu du changelog (startedDate, resolvedDate) ;
 *   - la synchro (sync.js) : colonnes du board — les statuts passent dans la colonne cible ;
 *   - le store (state.js → transform) : TOUTE écriture de `tickets` passe par la règle ;
 *   - Paramètres → JIRA (settings-status-override.js) : édition et aperçu de l'effet.
 * Chaque fonction accepte la règle en dernier argument (sinon : celle du store).
 */

import { store } from '../state.js';
import { STATUS_OVERRIDE_DEFAULTS, STATUS_OVERRIDE_TARGETS } from '../config.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const TARGETS = STATUS_OVERRIDE_TARGETS.map(t => t.key);   // priorité : done > inprog > todo

/** Ancienne forme {statuses, exceptTeams} (Terminé seul, 3.193.0) → {done: …}. */
const upgrade = c => (c && Array.isArray(c.statuses) ? { done: c } : c || {});
const hasAny = c => TARGETS.some(k => c?.[k]?.statuses?.length);

/** Règle effective { done, inprog, todo } : celle de la base dès qu'elle contient un statut, sinon les défauts. */
export function overrideRules(custom = store.get('piInfo')?.statusOverride) {
    const c = upgrade(custom);
    const src = hasAny(c) ? c : STATUS_OVERRIDE_DEFAULTS;
    return Object.fromEntries(TARGETS.map(k => [k, { statuses: [...(src[k]?.statuses || [])], exceptTeams: [...(src[k]?.exceptTeams || [])] }]));
}
export const isCustomOverride = (custom = store.get('piInfo')?.statusOverride) => hasAny(upgrade(custom));

let _cache = { key: null };
function compiled(custom) {
    const r = overrideRules(custom);
    const key = JSON.stringify(r);
    if (_cache.key === key) return _cache;
    const target = new Map(), except = {};
    for (const k of TARGETS) {   // dans l'ordre de priorité : le 1er qui réclame un statut le garde
        for (const s of r[k].statuses) if (!target.has(norm(s))) target.set(norm(s), k);
        except[k] = r[k].exceptTeams.map(norm);
    }
    _cache = { key, target, except };
    return _cache;
}

/** Équipe exemptée pour cette colonne ? Reconnaît « Fuego » comme « GCOM - Fuego » (Team[Team] brut). */
const exempt = (team, list) => { const t = norm(team); return list.some(x => t === x || t.split(/\s*-\s*/).pop() === x); };

/** Colonne forcée ('done' | 'inprog' | 'todo') de ce statut JIRA pour cette équipe, ou null. */
export function forcedStatus(team, jiraStatus, rules) {
    const c = compiled(rules), k = c.target.get(norm(jiraStatus));
    return k && !exempt(team, c.except[k]) ? k : null;
}
/** Compatibilité : ce statut compte-t-il comme Terminé ? */
export const isForcedDone = (team, jiraStatus, rules) => forcedStatus(team, jiraStatus, rules) === 'done';

/**
 * Colonnes d'un board ({ key, label, jiraStatuses }) : chaque statut forcé quitte sa colonne pour la
 * colonne cible (Terminé : la DERNIÈRE de clé done ; En cours / À faire : la PREMIÈRE de leur clé) ;
 * une colonne qui ne portait que des statuts déplacés disparaît (vide), de même qu'une colonne vide dont
 * le libellé est un statut déplacé — sinon la vue Sprint, qui range d'abord un ticket dans la colonne de
 * même libellé, l'y garderait. Sans colonne cible : la colonne change simplement de catégorie.
 */
export function forceColumns(team, cols, rules) {
    if (!Array.isArray(cols)) return cols;
    const out = cols.map(c => ({ ...c, jiraStatuses: [...(c.jiraStatuses || [])] }));
    const dest = k => (k === 'done' ? [...out].reverse() : out).find(c => c.key === k);
    const emptied = new Set();
    for (const c of out) {
        const keep = [];
        for (const st of c.jiraStatuses) {
            const k = forcedStatus(team, st, rules), to = k && dest(k);
            if (!k || to === c) { keep.push(st); continue; }
            if (!to) { keep.push(st); continue; }   // pas de colonne cible : traité par le libellé ci-dessous
            if (!to.jiraStatuses.includes(st)) to.jiraStatuses.push(st);
        }
        if (c.jiraStatuses.length && !keep.length) emptied.add(c);
        c.jiraStatuses = keep;
    }
    return out
        .map(c => { const k = forcedStatus(team, c.label, rules); return k && !dest(k) ? { ...c, key: k } : c; })
        .filter(c => !(emptied.has(c) || (forcedStatus(team, c.label, rules) && c.key !== forcedStatus(team, c.label, rules) && !c.jiraStatuses.length)));
}

/** Statut du ticket AVANT la règle (`_preOverride`, posé quand la règle l'a changé). */
export const rawStatus = t => t._preOverride ?? t.status;

/**
 * Tickets : statut remplacé par la colonne forcée. Un ticket signalé (drapeau JIRA) envoyé en En cours
 * ou À faire reste Bloqué, comme à la synchro ; envoyé en Terminé, il ne l'est plus. Le statut d'origine
 * est gardé dans `_preOverride` : la règle se REJOUE (statut retiré, équipe exemptée → le ticket
 * retrouve son statut) et l'aperçu des Paramètres mesure le vrai gain. Idempotente ; renvoie le même
 * tableau si rien ne change.
 */
export function applyStatusOverride(tickets, rules) {
    if (!Array.isArray(tickets)) return tickets;
    let changed = false;
    const out = tickets.map(t => {
        const raw = rawStatus(t), k = forcedStatus(t.team, t.jiraStatus, rules);
        const target = k && k !== 'done' && t.flagged ? 'blocked' : k;
        if (target && target !== raw) {
            if (t.status === target && t._preOverride !== undefined) return t;
            changed = true;
            return { ...t, status: target, _preOverride: raw };
        }
        if (t._preOverride !== undefined) {                 // la règle ne s'applique plus : statut d'origine
            changed = true;
            const { _preOverride, ...rest } = t;
            return { ...rest, status: _preOverride };
        }
        return t;
    });
    return changed ? out : tickets;
}

/** Colonnes de tous les boards ({ équipe: [colonnes] }). */
export const forceAllColumns = (byTeam, rules) => Object.fromEntries(
    Object.entries(byTeam || {}).map(([team, cols]) => [team, forceColumns(team, cols, rules)]));

// Branchée sur le store : toute écriture de `tickets` (chargement, Paramètres, board, modales…) passe
// par la règle ; un changement de règle (piInfo.statusOverride) la rejoue sur les tickets en mémoire.
store.transform('tickets', ts => applyStatusOverride(ts));
store.on('piInfo', (v, old) => {
    if (JSON.stringify(v?.statusOverride || {}) !== JSON.stringify(old?.statusOverride || {})) store.set('tickets', store.get('tickets'));
});
