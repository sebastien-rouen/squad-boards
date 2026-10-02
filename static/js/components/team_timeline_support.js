/**
 * Frise des faits marquants — charge Support (extrait de team_timeline_model.js, 3.178.0) :
 * tickets de type « support » par semaine + ticket de suivi du PI découpé par « Itération X.Y.Z »,
 * tâches reportées d'une semaine à l'autre (`streak`) et tâches qui traînent (STALE_WEEKS).
 * `M` = modèle construit par team_timeline_model.js (sprints, PI, canon des équipes, mémo).
 */

import { store } from '../state.js';
import { teamNameMatches } from '../utils.js';
import { addDays, mondayOf, localDay, norm, per } from './team_timeline_base.js';

// ── Support : tickets de type « support » + ticket de suivi du PI découpé par semaine ─────────────
// Fuego tient UN ticket de suivi par PI (« Paillettes support - PI31 », GCOM-4785) : sa description
// liste les tâches sous des titres « 🟦 Itération 31.1.1 » (itération 31.1, semaine 1).
const TRACKER = /paillettes|suivi.*support|support\s*-\s*(pi|it[ée])/i;
const WEEK_HEAD = /it[ée]ration\s+(\d+)\.(\d+)(?:\.(\d+))?/i;
const DONE = /✅|☑/u;
/** Une tâche du suivi « traîne » à partir de 3 semaines d'affilée (rouge dans la fiche, point sur la barre). */
export const STALE_WEEKS = 3;

/** « 31.1.2 » = PI 31, itération 1, semaine 2 (itérations Scrum de 2 semaines). Début de l'itération :
 *  sprint JIRA de l'équipe, sinon début du PI + 2 semaines par itération. Calé sur le LUNDI LE PLUS
 *  PROCHE : les itérations du PI 30 de Fuego démarrent le VENDREDI (12/06) — le lundi de la semaine de
 *  début (08/06) décalait tout d'une semaine. */
function trackerWeek(M, team, pi, iter, week) {
    const spr = (M.sprints[team] || []).find(s => s.label === `${pi}.${iter}`);
    const piStart = M.pis.find(p => p.n === pi)?.start;
    const start = spr?.start || (piStart && addDays(piStart, 14 * (iter - 1)));
    if (!start) return null;
    return { label: `${pi}.${iter}.${week}`, week: mondayOf(addDays(start, 3 + 7 * (week - 1))), seen: new Set() };
}

/** Tâches du ticket de suivi, rangées par semaine (lundi). Titres = <strong> / <h*> (y compris les
 *  blocs repliables JIRA, voir sync.js `expand`) ; tâches = <li> qui suivent, dédoublonnées par semaine
 *  (JIRA recopie les tâches reportées d'une semaine à l'autre). */
function trackerTasks(M, t, team) {
    const doc = new DOMParser().parseFromString(t.description || '', 'text/html');   // n'exécute rien
    const out = [];
    let cur = null;
    for (const el of doc.body.querySelectorAll('strong, h1, h2, h3, h4, h5, h6, p, li')) {
        // Sous-titre : <strong>/<h*>, ou un paragraphe COURT qui n'est que le titre (pas une phrase qui
        // mentionne une itération)
        const head = el.tagName !== 'LI' && !el.closest('li') && (el.tagName !== 'P' || el.textContent.trim().length <= 40);
        const m = head && el.textContent.match(WEEK_HEAD);
        if (m) { cur = trackerWeek(M, team, +m[1], +m[2], +(m[3] || 1)); continue; }
        // Tâche = puce de PREMIER niveau sous le sous-titre (une sous-puce détaille sa tâche)
        // Sous-puce = sa liste est DANS une autre liste : <li> parent (ADF) ou <ul> imbriqué directement
        // dans <ul> (sortie du wiki markup « ** détail »)
        if (el.tagName !== 'LI' || !cur || el.parentElement?.parentElement?.closest('ul, ol, li')) continue;
        // Texte PROPRE de la puce : sans ses sous-puces (« MDV loki » et non « MDV lokisous-puce : … »)
        const own = el.cloneNode(true);
        own.querySelectorAll('ul, ol').forEach(l => l.remove());
        const text = own.textContent.replace(DONE, '').replace(/\s+/g, ' ').trim();
        const key = norm(text);
        if (!text || cur.seen.has(key)) continue;
        cur.seen.add(key);
        out.push({ week: cur.week, label: cur.label, text: text.slice(0, 200), done: DONE.test(own.textContent), ticket: t.id });
    }
    return out;
}

/** Charge support par semaine : [{ week, tickets: [...], tasks: [...] }]. */
export function supportLoad(M, team) {
    return per(M, 'support', team, () => {
        const by = new Map();
        const at = w => by.get(w) || by.set(w, { week: w, tickets: [], tasks: [] }).get(w);
        for (const t of store.get('tickets') || []) {
            if (t.type !== 'support') continue;
            const tt = M.canon(t.team || '');
            if (!tt || (team !== '*' && tt !== team)) continue;
            if (TRACKER.test(t.title || '')) { trackerTasks(M, t, tt).forEach(k => at(k.week).tasks.push(k)); continue; }
            const day = localDay(t.createdAt);
            // Check-lists on/offboarding : de la vraie charge pour l'équipe qui les traite (Fuego : 7 sur 10 au
            // PI 31) — comptées, mais distinguées (`boarding`) des demandes de support
            const boarding = (t.labels || []).some(l => /boarding/i.test(l)) || /check-?list\s+(on|off)boarding/i.test(t.title || '');
            at(mondayOf(day)).tickets.push({ id: t.id, day, title: String(t.title || '').slice(0, 160), status: t.jiraStatus || t.status || '', team: tt, boarding });
        }
        const weeks = [...by.values()].sort((a, b) => a.week.localeCompare(b.week));
        // Tâches REPORTÉES : la même tâche (même ticket de suivi, texte proche) la semaine précédente →
        // la série continue. `streak` = n-ième semaine d'affilée, `since` = semaine de départ.
        // Ordre chronologique : la semaine précédente est toujours traitée avant.
        for (const w of weeks) for (const k of w.tasks) {
            const hit = by.get(addDays(w.week, -7))?.tasks.find(p => p.ticket === k.ticket && sameTask(p.text, k.text));
            k.streak = hit ? hit.streak + 1 : 1;
            k.since = hit ? hit.since : w.week;
        }
        return weeks;
    });
}

/** Même tâche d'une semaine à l'autre, malgré un texte retouché : « Reboot des vm pour le reste
 *  (tooling, data, etc) » puis « Reboot des vm pour le reste (Attendre la prod…) » (GCOM-4785).
 *  Mêmes 4 premiers mots significatifs, ou au moins 60 % de mots en commun. */
const taskWords = s => norm(s).split(/[^a-z0-9]+/).filter(x => x.length > 2);
function sameTask(a, b) {
    const A = taskWords(a), B = taskWords(b);
    if (!A.length || !B.length) return false;
    if (A.length >= 3 && B.length >= 3 && A.slice(0, 4).join(' ') === B.slice(0, 4).join(' ')) return true;
    const SB = new Set(B), inter = new Set(A.filter(x => SB.has(x))).size;
    return inter / new Set([...A, ...B]).size >= 0.6;
}
/** Tickets de suivi (lien vers la description) de l'équipe — pour la fiche et l'export. */
export const supportTrackers = team => (store.get('tickets') || [])
    .filter(t => t.type === 'support' && TRACKER.test(t.title || '') && (team === '*' || t.team === team || teamNameMatches(t.team, team)))
    .map(t => ({ id: t.id, title: t.title, pi: t.piSprint || '' }));
