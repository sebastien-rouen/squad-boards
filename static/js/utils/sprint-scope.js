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
 *              — et, pour l'engagement AU LANCEMENT (colonnes « prévu » de Health),
 *              `plannedAtSprintStart()`, qui écarte les ajouts en cours de sprint
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

// Date JIRA → ms. Le changelog écrit « 2026-10-05T09:36:16.463+0200 » quand les sprints
// portent « 2026-10-05T08:05:16.000Z » : comparer les CHAÎNES classerait 09:36+02 (07:36 Z)
// APRÈS 08:05 Z. On normalise le décalage sans deux-points avant de parser.
export const jiraDateMs = d => {
    if (!d) return NaN;
    return Date.parse(String(d).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
};

/**
 * Le ticket était-il dans ce sprint À L'INSTANT `at` ? On rejoue l'historique du champ
 * Sprint : le `to` du dernier changement antérieur, à défaut le `from` du premier
 * postérieur, à défaut (aucun historique) le sprint actuel. Un ticket créé APRÈS `at`
 * n'y était pas — même si son premier changement part de ce sprint (créé directement
 * dedans en cours de sprint, puis reporté à la clôture : GDEM-4761 sur la 31.1).
 * ⚠️ Le `to` JIRA est CUMULATIF pour les sprints clos (« 31.1 → 31.1, 31.2 » au report) :
 * un sprint clos reste dans la liste, donc « maintenant » = périmètre à la clôture.
 */
export function inSprintAt(t, sprintName, at, spk = extractSprintLabel(sprintName)) {
    const atMs = typeof at === 'number' ? at : jiraDateMs(at);
    if (!Number.isFinite(atMs)) return false;
    const created = jiraDateMs(t.createdAt || t.created_at);
    if (Number.isFinite(created) && created > atMs) return false;
    const changes = (t.recentChanges || t.recent_changes || [])
        .filter(ch => String(ch.field || '').toLowerCase() === 'sprint')
        .map(ch => ({ ch, ms: jiraDateMs(ch.date) }))
        .filter(x => Number.isFinite(x.ms))
        .sort((a, b) => a.ms - b.ms);
    let list;
    if (!changes.length) list = t.sprintName || t.sprint_name || '';
    else {
        const before = changes.filter(x => x.ms <= atMs).pop();
        list = before ? before.ch.to : changes[0].ch.from;
    }
    return String(list || '').split(',').some(part => {
        const n = part.trim();
        return !!n && (n === sprintName || (!!spk && extractSprintLabel(n) === spk));
    });
}

/**
 * Le ticket était-il dans ce sprint À SON LANCEMENT ? — l'engagement au sens strict.
 * `belongedToSprint()` répond « y est-il passé un jour », donc compte aussi les tickets
 * AJOUTÉS en cours de sprint (et ceux retirés avant le démarrage).
 * Même règle que le rapport de sprint JIRA (« ajouté après le démarrage » = hors engagement).
 * Sans date de lancement (sprint à venir) : le périmètre courant, faute de mieux.
 */
export function plannedAtSprintStart(t, sprintName, sprintStart, spk = extractSprintLabel(sprintName)) {
    if (!belongedToSprint(t, sprintName, spk)) return false;
    if (!Number.isFinite(jiraDateMs(sprintStart))) return true;
    return inSprintAt(t, sprintName, sprintStart, spk);
}

/**
 * Périmètre ACTUEL du sprint (« nb actuel » de Health) : en cours = ce qu'il contient ;
 * clos = ce qu'il contenait À LA CLÔTURE, reports compris (grâce au `to` cumulatif) —
 * sinon un sprint clos ne montrerait que ses réussites et des « retraits » fantômes.
 */
export const inSprintNow = (t, sprintName, spk = extractSprintLabel(sprintName)) =>
    belongedToSprint(t, sprintName, spk) && inSprintAt(t, sprintName, Date.now(), spk);

/**
 * Écart de périmètre d'UN sprint entre son lancement et maintenant (ou sa clôture).
 * Source unique des colonnes « nb début » / « nb actuel » de Health ET du domaine
 * 📐 Périmètre de la Météo — deux calculs diviseraient les chiffres à l'écran.
 * @param {object[]} tickets  tickets d'UNE équipe (le matching par clé NN.N l'exige)
 * @param {{name: string, startDate?: string}} sprint
 * @returns {{engaged, plan, cur, added, removed}} listes de tickets
 *   `engaged` = passés un jour par le sprint · `plan` = présents au lancement ·
 *   `cur` = présents maintenant / à la clôture · `added` = cur hors plan · `removed` = plan hors cur
 */
export function sprintScopeDelta(tickets, sprint, spk = extractSprintLabel(sprint?.name)) {
    const name = sprint?.name || '';
    const engaged = (tickets || []).filter(t => belongedToSprint(t, name, spk));
    const plan = engaged.filter(t => plannedAtSprintStart(t, name, sprint?.startDate, spk));
    const cur = engaged.filter(t => inSprintNow(t, name, spk));
    const planIds = new Set(plan.map(t => t.id)), curIds = new Set(cur.map(t => t.id));
    return {
        engaged, plan, cur,
        added: cur.filter(t => !planIds.has(t.id)),
        removed: plan.filter(t => !curIds.has(t.id)),
    };
}

/**
 * Stabilité du périmètre sur plusieurs sprints (un PI) — sprints DÉMARRÉS seulement
 * (actif ou clos, avec une date de lancement) : un sprint à venir n'a pas d'engagement.
 * `churnPct` = (ajouts + retraits) ÷ engagés au lancement ; `stablePct` = engagés restés.
 * Un report à la clôture n'est PAS un retrait (le ticket est resté jusqu'au bout).
 * @returns {{plan, added, removed, sprints, churnPct: number|null, stablePct: number|null, bySprint}}
 */
export function scopeStability(tickets, sprints) {
    const bySprint = [];
    let plan = 0, added = 0, removed = 0;
    for (const sp of sprints || []) {
        if (!(sp?.state === 'active' || sp?.state === 'closed') || !sp.startDate) continue;
        const d = sprintScopeDelta(tickets, sp);
        bySprint.push({ sprint: sp, ...d });
        plan += d.plan.length; added += d.added.length; removed += d.removed.length;
    }
    const pctOf = v => plan ? Math.round(v / plan * 100) : null;
    return { plan, added, removed, sprints: bySprint.length, churnPct: pctOf(added + removed), stablePct: pctOf(plan - removed), bySprint };
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
