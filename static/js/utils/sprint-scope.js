/**
 * Périmètre d'un sprint — quels tickets en ont fait partie, et lesquels y sont restés.
 *
 * ⚠️ FOOTGUN CENTRAL : `t.sprintName` ne dit PAS de quel sprint un ticket a fait partie,
 * seulement où il se trouve MAINTENANT. À la clôture d'un sprint, JIRA DÉPLACE les tickets
 * non terminés vers le suivant. Un sprint passé ne « contient » donc plus que ses réussites,
 * et les engagements non tenus disparaissent d'eux-mêmes des compteurs.
 * Mesuré sur le PI 30 : 1050 tickets reportés contre 878 restés — 54 % du périmètre engagé.
 *
 * L'historique le conserve : chaque changement de champ « Sprint » porte dans son `to` la
 * liste CUMULATIVE des sprints d'appartenance. `sprintNamesOf()` en fait l'union.
 *
 * (Le champ `t.allSprints` que lisent plusieurs vues n'a jamais été produit — ni colonne en
 * base, ni écriture nulle part. Ces lectures sont donc toujours fausses ; ce module fournit
 * la donnée qu'elles attendaient.)
 *
 * ── RÈGLE À NE JAMAIS INVERSER ────────────────────────────────────────────────
 *   ENGAGEMENT (périmètre prévu, « combien on s'était engagé ») → `belongedToSprint()`
 *   RÉALISÉ    (vélocité, points faits, « combien on a livré ») → `isInSprint()` EN PLUS
 *              du statut `done`.
 * Compter comme réalisé un ticket reporté puis terminé plus tard créditerait un sprint de
 * travail fait APRÈS sa clôture — sa vélocité gonflerait rétroactivement.
 * ──────────────────────────────────────────────────────────────────────────────
 */

/**
 * Extrait le label complet "NN.N" d'un nom de sprint (ex: "Team G - Ité 30.1" → "30.1").
 * À utiliser pour matcher `v.piSprint` (votes mood/fist) — NE JAMAIS reconstruire ce label à
 * la main depuis `piInfo.number` + index de sprint : si `piInfo.number` est vide/obsolète, la
 * reconstruction produit un label tronqué (ex: ".1") qui ne matche plus aucun vote (footgun
 * constaté : panneau latéral "Aucun vote · .1" alors que des votes existaient bien sur 30.1).
 * @returns {string} le label "NN.N", ou '' si non extractible.
 */
export function extractSprintLabel(name) {
    const m = String(name || '').match(/(\d+\.\d+)/);
    return m ? m[1] : '';
}

// Union des sprints d'appartenance, mémoïsée par ticket : reparser ce JSON pour chaque
// couple (équipe, sprint) coûterait bien trop cher sur plusieurs milliers de tickets.
const _cache = new WeakMap();

function _scopeOf(t) {
    let h = _cache.get(t);
    if (h) return h;
    const names = new Set(), keys = new Set();
    const add = n => {
        const s = String(n || '').trim();
        if (!s) return;
        names.add(s);
        const k = extractSprintLabel(s);
        if (k) keys.add(k);
    };
    add(t.sprintName || t.sprint_name);
    // `allSprints` reste lu au cas où une future sync le renseignerait vraiment.
    for (const n of (Array.isArray(t.allSprints) ? t.allSprints : [])) add(n);
    for (const ch of (t.recentChanges || t.recent_changes || [])) {
        if (String(ch.field || '').toLowerCase() !== 'sprint') continue;
        for (const part of String(ch.to || '').split(',')) add(part);
    }
    h = { names, keys };
    _cache.set(t, h);
    return h;
}

/** Tous les sprints par lesquels le ticket est passé (noms bruts) — l'`allSprints` attendu. */
export const sprintNamesOf = t => [..._scopeOf(t).names];

/**
 * ⚠️ Le 3ᵉ paramètre `spk` des fonctions ci-dessous décide du matching :
 *   - par défaut, la clé NN.N du sprint est acceptée EN PLUS du nom exact, car le nom du
 *     sprint JIRA et celui porté par les tickets peuvent différer ("Team G - Ité 29.3" ↔
 *     "GCOM 29.3"). Une clé ne distingue PAS le 30.1 d'une équipe de celui d'une autre :
 *     ce mode EXIGE un filtre par équipe en amont ;
 *   - passer `null` (ou '') exige le nom exact — le bon choix dès que les tickets comparés
 *     peuvent venir de plusieurs équipes.
 */

/** Le ticket est-il ACTUELLEMENT dans ce sprint ? */
export function isInSprint(t, sprintName, spk = extractSprintLabel(sprintName)) {
    const tn = t.sprintName || t.sprint_name || '';
    return tn === sprintName || (!!spk && extractSprintLabel(tn) === spk);
}

/** Le ticket a-t-il appartenu à ce sprint, maintenant ou par le passé ? */
export function belongedToSprint(t, sprintName, spk = extractSprintLabel(sprintName)) {
    const h = _scopeOf(t);
    return h.names.has(sprintName) || (!!spk && h.keys.has(spk));
}

/**
 * Sprint vers lequel le ticket a été REPORTÉ, '' s'il y est resté.
 * Un report est un engagement non tenu dans le sprint d'origine — même si le ticket a été
 * terminé plus tard ailleurs : son statut actuel ne dit rien de ce qui s'est passé DANS ce
 * sprint-là.
 */
export const carriedOverTo = (t, sprintName, spk = extractSprintLabel(sprintName)) =>
    isInSprint(t, sprintName, spk) ? '' : (t.sprintName || t.sprint_name || '');

/**
 * Découpe une liste selon le périmètre d'un sprint. Un seul passage, et surtout un seul
 * endroit où la règle engagement/réalisé est écrite.
 * @returns {{engaged: object[], done: object[], carried: object[]}}
 *   `engaged` = tout ce qui a été engagé (reports compris) ;
 *   `done`    = terminé DANS le sprint (le seul ensemble qui compte pour la vélocité) ;
 *   `carried` = engagé puis reporté ailleurs, quel que soit son statut actuel.
 */
export function sprintScope(tickets, sprintName) {
    const spk = extractSprintLabel(sprintName);
    const engaged = [], done = [], carried = [];
    for (const t of tickets) {
        if (!belongedToSprint(t, sprintName, spk)) continue;
        engaged.push(t);
        if (isInSprint(t, sprintName, spk)) {
            if (t.status === 'done') done.push(t);
        } else {
            carried.push(t);
        }
    }
    return { engaged, done, carried };
}

// ── Sprint ACTIF d'une équipe dont le board JIRA est mal rattaché ─────────────────────────
// La synchro range parfois le sprint sous le nom du board au lieu de l'équipe : le sprint actif
// de Fuego est stocké avec `team: 'F - itération 31.2'` (idem Ami, Bellier, Océane…). Filtrer
// `teamSprints` sur `s.team === 'Fuego'` ne trouvait alors que des sprints clos, et
// getSprintForTeam retombait sur le plus VIEUX (« Team K - Ité 20.4 », 2024) : panneau latéral,
// fil d'Ariane et PI courant (20 au lieu de 31) faux pour toute l'équipe.
// Les tickets, eux, portent la bonne équipe ET le bon sprint : on prend le sprint actif que
// les tickets de l'équipe référencent le plus. Comptage mémoïsé par tableau de tickets.
const _refCounts = new WeakMap();

/**
 * @param {string} team
 * @param {Array} teamSprints  `sprintInfo.teamSprints`
 * @param {Array} tickets      `store.get('tickets')`
 * @returns {object|null} le sprint actif le plus référencé par les tickets de l'équipe
 */
export function activeSprintFromTickets(team, teamSprints, tickets) {
    if (!team || !Array.isArray(tickets) || !tickets.length) return null;
    let byTeam = _refCounts.get(tickets);
    if (!byTeam) {
        byTeam = new Map();
        for (const t of tickets) {
            if (!t.team || !t.sprintName) continue;
            const m = byTeam.get(t.team) || new Map();
            m.set(t.sprintName, (m.get(t.sprintName) || 0) + 1);
            byTeam.set(t.team, m);
        }
        _refCounts.set(tickets, byTeam);
    }
    const counts = byTeam.get(team);
    if (!counts) return null;
    let best = null, bestN = 0;
    for (const s of teamSprints || []) {
        const n = s.state === 'active' ? (counts.get(s.name) || 0) : 0;
        if (n > bestN) { best = s; bestN = n; }
    }
    return best;
}
