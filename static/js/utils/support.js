/**
 * Rotation support : semaines d'un PI, jours ouvrés, absences bloquantes, membres
 * éligibles et règles de tirage (generateSupportRotation). Consommé par la grille
 * Paramètres → Rotation, la page Support, l'agenda et le panneau latéral.
 *
 * Extrait de utils.js (v3.141.5) — utils.js reste le point d'entrée et ré-exporte tout,
 * aucun import des vues n'a changé.
 */

// ── Rotation Support : règles métier centralisées ───────────────────────────
/**
 * Jours d'absence d'un membre DANS la semaine [weekStart, weekEnd] : somme, sur les jours ouvrés
 * de la semaine, du niveau du jour (journée = 1, demi-journée = 0,5 — supportAbsenceDayLevel).
 * Source = table absences (CSV RH, vérité).
 * ⚠️ Jamais la durée TOTALE (`a.days`) d'une absence qui chevauche la semaine : un congé de
 * 10 jours qui ne mord que sur le vendredi comptait 10 → « absent ≥ 3j » (Kevin, semaine du
 * 16/10, congé 05→16/10), et le tirage l'excluait d'une semaine où il est présent 4 jours sur 5.
 */
export function supportAbsenceDays(memberName, weekStart, weekEnd, absences) {
    let total = 0;
    for (const d of supportWorkingDays(weekStart)) {
        if (weekEnd && d.iso > weekEnd) break;
        const lvl = supportAbsenceDayLevel(memberName, d.iso, absences);
        total += lvl === 'full' ? 1 : lvl === 'half' ? 0.5 : 0;
    }
    return total;
}

/**
 * Règle métier n°1 (docs/regles-metier.md) : absent ≥ 3 jours ouvrés dans la semaine → exclu du
 * tirage ET affiché « absent ». SOURCE UNIQUE du seuil : la grille, le récap du pool et l'onglet
 * Rotation du PI marquaient « absent » dès 2,5 j pendant que le tirage et la page Support
 * attendaient 3 — un membre à 2,5 j était grisé dans la grille mais tiré au sort.
 */
export const SUPPORT_ABSENT_MIN_DAYS = 3;
/** @param {number} absDays  résultat de supportAbsenceDays */
export const isSupportAbsent = absDays => absDays >= SUPPORT_ABSENT_MIN_DAYS;

/** Jours OUVRÉS (lun → ven) entre deux dates ISO incluses, au moins 1. */
function _workingDaysSpan(startIso, endIso) {
    const d = new Date(startIso + 'T00:00:00'), end = new Date(endIso + 'T00:00:00');
    let n = 0;
    for (; d <= end; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++;
    return Math.max(1, n);
}

/**
 * Niveau d'absence d'un membre pour un jour ouvré précis (ISO YYYY-MM-DD).
 * Cherche dans les absences qui couvrent ce jour ; une absence couvre le jour
 * si startDate ≤ iso ≤ endDate. La durée `days` est la durée **totale** de
 * l'absence (peut couvrir plusieurs jours). Pour un jour donné on la ramène
 * à une demi-journée si days/nbJoursCoverts < 1.
 * @returns {'full'|'half'|null}
 */
export function supportAbsenceDayLevel(memberName, iso, absences) {
    const hits = (absences || []).filter(a =>
        a.memberName === memberName && a.startDate <= iso && a.endDate >= iso
    );
    if (!hits.length) return null;
    // Somme les fractions de jours d'absence qui tombent sur ce jour précis. La durée `days` est
    // en jours OUVRÉS : la répartir sur les jours calendaires (week-ends compris) sous-estimait
    // chaque jour — 10 jours du lun. 05 au ven. 16/10 donnaient 10/12 = 0,83 → « ½ journée ».
    let total = 0;
    for (const a of hits) total += (a.days || 1) / _workingDaysSpan(a.startDate, a.endDate);
    if (total >= 0.9) return 'full';
    if (total >= 0.4) return 'half';
    return null;
}

// Jour de la semaine ISO → index getDay() (0 = dim, 1 = lun, …, 5 = ven).
// Un des 5 jours ouvrés — chaque équipe peut démarrer sa semaine de support un jour différent
// (`week_mode`, string libre côté backend, cf. app/models/people.py).
export const SUPPORT_WEEK_MODES = {
    monday:    { dow: 1, label: 'Lun → Dim' },
    tuesday:   { dow: 2, label: 'Mar → Lun' },
    wednesday: { dow: 3, label: 'Mer → Mar' },
    thursday:  { dow: 4, label: 'Jeu → Mer' },
    friday:    { dow: 5, label: 'Ven → Jeu' },
};
export const SUPPORT_WEEK_MODE_DEFAULT = 'friday';   // 1er jour de sprint sur la plupart des équipes

/**
 * Recule une date ISO jusqu'au jour de bascule du mode (6 jours max) : c'est ce qui donne son
 * sens à « Jeu → Mer » — la semaine de support COMMENCE ce jour-là, et `supportWorkingDays()`
 * en déduit les pastilles (J V L M M).
 * SOURCE UNIQUE du snap : buildSupportPiWeeks (PI courant) ET buildPiWeeks (PI épinglé)
 * doivent produire les mêmes `weekStart` pour un même PI — c'est la clé d'appariement des
 * rotations en base, une divergence rend invisible ce que l'autre branche a écrit.
 * @param {string} iso       YYYY-MM-DD (ou ISO complet, tronqué)
 * @param {string} weekMode  clé de SUPPORT_WEEK_MODES (repli : mode par défaut)
 */
// Date locale → YYYY-MM-DD sans passer par l'UTC (évite le décalage de fuseau), décalage en
// jours et écart en jours entre deux ISO.
const _isoFmt  = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _isoAdd  = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); d.setDate(d.getDate() + n); return _isoFmt(d); };
const _isoDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);

export function snapToWeekMode(iso, weekMode = SUPPORT_WEEK_MODE_DEFAULT) {
    if (!iso) return iso;
    const targetDow = (SUPPORT_WEEK_MODES[weekMode] || SUPPORT_WEEK_MODES[SUPPORT_WEEK_MODE_DEFAULT]).dow;
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() - targetDow + 7) % 7));
    return _isoFmt(d);
}

/**
 * Semaines d'un PI pour un mode de semaine : `sprintCnt × (sprintDur / 7)` semaines depuis la
 * date de début RECULÉE sur le jour de bascule (`snapToWeekMode`), plus la SEMAINE DE TRANSITION
 * dès que ce recul laisse la fin du PI à découvert.
 * Ex. PI 31 du lundi 07/09 au dimanche 15/11 en « Jeu → Mer » : dix semaines du jeudi 03/09 au
 * mercredi 11/11 — le PIP (jeudi 12, vendredi 13/11) puis lundi 16 → mercredi 18 n'auraient
 * aucune colonne : trois jours de support invisibles. La 11ᵉ semaine (`31.5.3`,
 * `transition: true`) commence le jeudi 12/11. C'est aussi la première du PI 32 (même
 * `weekStart`, donc même rotation en base) : les deux grilles montrent et modifient la même
 * semaine.
 * Le premier jour laissé à découvert est TOUJOURS le jour de bascule — un jour ouvré — donc la
 * semaine est ajoutée dès que le recul est non nul ; un PI qui commence le jour de bascule
 * (PI 30, vendredi 12/06, en « Ven → Jeu ») n'en a pas.
 * SEULE fabrique de semaines : buildSupportPiWeeks, buildPiWeeks et pi.js passent par ici.
 * @param {number|string} o.piNum
 * @param {string} o.rawStart   date de début BRUTE du PI (JIRA, saisie ou CSV), jamais snappée
 * @returns {Array<{label:string, weekStart:string, weekEnd:string, transition?:true}>}
 */
export function makePiWeeks({ piNum, rawStart, weekMode = SUPPORT_WEEK_MODE_DEFAULT, sprintCnt = 5, sprintDur = 14 }) {
    if (!rawStart) return [];
    const raw   = String(rawStart).slice(0, 10);
    const wps   = Math.max(1, Math.floor(sprintDur / 7));
    const start = snapToWeekMode(raw, weekMode);
    const weeks = [];
    for (let s = 0; s < sprintCnt; s++) {
        for (let w = 0; w < wps; w++) {
            const ws = _isoAdd(start, s * sprintDur + w * 7);
            weeks.push({ label: `${piNum}.${s + 1}.${w + 1}`, weekStart: ws, weekEnd: _isoAdd(ws, 6) });
        }
    }
    if (weeks.length && _isoDiff(raw, start) > 0) {
        const ws = _isoAdd(weeks[weeks.length - 1].weekEnd, 1);
        weeks.push({ label: `${piNum}.${sprintCnt}.${wps + 1}`, weekStart: ws, weekEnd: _isoAdd(ws, 6), transition: true });
    }
    return weeks;
}

/**
 * En-tête d'une semaine — texte, infobulle et classe — identique dans la grille par équipe, le
 * récap du pool, la page Support et l'onglet Rotation du PI. Une semaine partagée entre deux PI
 * (`sharedWith`, posé par buildPiWeeks) affiche ses DEUX libellés : « ↪ 31.5.3 · 32.1.1 » côté
 * transition, « 32.1.1 · 31.5.3 » côté première semaine — c'est la même semaine en base, autant
 * le dire des deux côtés.
 * @returns {{text:string, title:string, cls:string}}
 */
export function supportWeekHead(w) {
    const shared = w.sharedWith ? ` · ${w.sharedWith}` : '';
    const text = `${w.transition ? '↪ ' : ''}${w.label}${shared}`;
    const title = w.transition
        ? `Semaine de transition : fin du PI (PIP) et premiers jours du PI suivant${w.sharedWith ? ` — c’est sa semaine ${w.sharedWith}` : ''}, même semaine en base des deux côtés`
        : w.sharedWith
            ? `Semaine partagée avec le PI précédent : c’est sa semaine de transition ${w.sharedWith} (fin de PI + PIP), même semaine en base des deux côtés`
            : '';
    const cls = (w.transition || w.sharedWith) ? ' rot-wk-transition' : '';
    return { text, title, cls };
}

/**
 * Mode de semaine d'une équipe. Source de vérité : la BASE (`piInfo.supportWeekModes`, partagée
 * par tous les navigateurs, 3.165.0). Repli : `localStorage` `rot-mode-<team>` (réglages d'avant,
 * hors ligne, tests Node sans store), puis le mode par défaut.
 * Écriture : UNIQUEMENT `saveSupportWeekMode()` (support-week-mode.js), jamais setItem à la main.
 */
export function getSupportWeekMode(team) {
    if (!team) return SUPPORT_WEEK_MODE_DEFAULT;
    const fromDb = (typeof window !== 'undefined')
        ? window.__squadBoard?.store?.get('piInfo')?.supportWeekModes?.[team] : null;
    if (fromDb && SUPPORT_WEEK_MODES[fromDb]) return fromDb;
    const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(`rot-mode-${team}`) : null;
    return (stored && SUPPORT_WEEK_MODES[stored]) ? stored : SUPPORT_WEEK_MODE_DEFAULT;
}

// ── Granularité jour (variante mini-strip) ──────────────────────────────────
// getDay() (0=dim … 6=sam) → lettre FR. Un membre couvre 5 jours ouvrés max/semaine.
const _DOW_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/**
 * Jours ouvrés (Lun→Ven) contenus dans la fenêtre 7 jours [weekStart, weekStart+6].
 * Toute fenêtre de 7 jours consécutifs contient exactement 5 jours ouvrés, quel que
 * soit le jour de bascule de l'équipe. L'index (0-4) = position chronologique et sert
 * de clé stable dans `memberDays` (indépendant du weekMode).
 * @param {string} weekStart  ISO YYYY-MM-DD
 * @returns {Array<{index:number, iso:string, letter:string}>}
 */
export function supportWorkingDays(weekStart) {
    if (!weekStart) return [];
    const base = new Date(weekStart + 'T00:00:00');
    const out = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;               // saute samedi/dimanche
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        out.push({ index: out.length, iso, letter: _DOW_LETTER[dow] });
    }
    return out;
}

/**
 * Jours effectifs d'un membre pour une semaine donnée.
 * Fallback rétro-compatible : un membre présent dans `members` mais absent de
 * `memberDays` = semaine pleine (les 5 jours ouvrés).
 * @returns {number[]} indices de jours ouvrés (0-4), triés
 */
export function supportDaysForMember(entry, memberName) {
    if (!entry) return [];
    const md = entry.memberDays || entry.member_days || {};
    if (Object.prototype.hasOwnProperty.call(md, memberName)) {
        return [...(md[memberName] || [])].sort((a, b) => a - b);
    }
    return (entry.members || []).includes(memberName) ? [0, 1, 2, 3, 4] : [];
}

/** Date LOCALE du jour (YYYY-MM-DD). Jamais `toISOString()` : UTC, donc la veille entre minuit
 *  et 2 h en été — la rotation de la semaine précédente restait affichée le jour de bascule. */
export function todayIsoLocal() {
    return _isoFmt(new Date());
}

/**
 * Rotations EN VIGUEUR un jour donné — une par équipe, exactement celle que la grille
 * « Paramètres → Rotation » affiche et modifie. SOURCE UNIQUE pour la page Support (hero-cards),
 * le panneau « Support cette semaine » et le bandeau « Support aujourd'hui » du Dashboard.
 *  1. La semaine est celle qui COMMENCE au jour de bascule du mode ACTUEL de l'équipe
 *     (`snapToWeekMode(jour, getSupportWeekMode(équipe))`), comme les colonnes de la grille.
 *     Un recouvrement de dates (`weekStart <= jour <= weekEnd`) ramassait aussi les lignes d'un
 *     ANCIEN mode restées en base : Gabbiano et Helica, passées de « Ven → Jeu » à « Jeu → Mer »,
 *     avaient deux cartes et mêlaient les membres de l'ancienne grille à ceux de la nouvelle.
 *  2. Doublons (même équipe, même `weekStart` — la semaine de transition 31.5.3 / 32.1.1 créée
 *     deux ou trois fois par un double clic) : fusionnés en UNE entrée. Les membres sont ceux de
 *     la PREMIÈRE ligne, celle du `find` de la grille — une union ressusciterait un membre retiré
 *     depuis dans la grille — et les libellés distincts sont réunis dans `weekLabels`.
 * @param {Array} support  lignes `store.get('support')`
 * @param {string} [dayIso] YYYY-MM-DD, par défaut aujourd'hui (heure locale)
 * @returns {Array} lignes copiées, enrichies de `weekLabels: string[]`
 */
export function currentSupportRows(support, dayIso = todayIsoLocal()) {
    const byTeam = new Map();
    for (const s of support || []) {
        if (!s?.team || s.weekStart !== snapToWeekMode(dayIso, getSupportWeekMode(s.team))) continue;
        const cur = byTeam.get(s.team);
        if (!cur) byTeam.set(s.team, { ...s, weekLabels: s.weekLabel ? [s.weekLabel] : [] });
        else if (s.weekLabel && !cur.weekLabels.includes(s.weekLabel)) cur.weekLabels.push(s.weekLabel);
    }
    return [...byTeam.values()];
}

/**
 * Toutes les lignes que la grille peut afficher, sur n'importe quelle période : `weekStart` sur
 * le jour de bascule du mode ACTUEL de l'équipe, une seule par (équipe, `weekStart`) — la
 * première, celle du `find` de la grille. Pour les vues qui couvrent un sprint ou un PI
 * (Calendrier PI) ; pour « aujourd'hui », `currentSupportRows`.
 */
export function gridSupportRows(support) {
    const seen = new Set();
    return (support || []).filter(s => {
        if (!s?.team || s.weekStart !== snapToWeekMode(s.weekStart, getSupportWeekMode(s.team))) return false;
        const key = `${s.team}|${s.weekStart}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Qui est de support un JOUR donné : rotations en vigueur (`currentSupportRows`) × jours cochés
 * dans la grille (`memberDays`, repli semaine pleine). SOURCE UNIQUE du « par jour » : bandeau
 * du Dashboard, barre support et message Slack du bandeau calendrier, Agenda.
 * Un samedi ou un dimanche ne compte personne (aucun jour ouvré à couvrir).
 * @returns {Array<{name:string, team:string}>}
 */
export function supportMembersOnDay(support, dayIso) {
    return currentSupportRows(support, dayIso).flatMap(entry => {
        const wd = supportWorkingDays(entry.weekStart).find(d => d.iso === dayIso);
        if (!wd) return [];
        return (entry.members || [])
            .filter(m => supportDaysForMember(entry, m).includes(wd.index))
            .map(name => ({ name, team: entry.team }));
    });
}

/** Jour ouvré précédent (YYYY-MM-DD) : le lundi renvoie le vendredi. */
export function previousWorkingDayIso(dayIso) {
    let d = _isoAdd(dayIso, -1);
    while ([0, 6].includes(new Date(d + 'T00:00:00').getDay())) d = _isoAdd(d, -1);
    return d;
}

/** Lettres des jours couverts par un membre (« J V »), ou '' s'il couvre toute la semaine —
 *  même lecture que les pastilles de la grille (`memberDays`, repli semaine pleine). */
export function supportPartialDaysLabel(entry, memberName) {
    const days = supportDaysForMember(entry, memberName);
    if (!days.length || days.length >= 5) return '';
    const wd = supportWorkingDays(entry.weekStart);
    return days.map(i => wd[i]?.letter).filter(Boolean).join(' ');
}

// ── Membres exclus du support (rôles non éligibles : Manager, RTE, PO, …) ──
// Stockage : localStorage `rot-inactive` = JSON array de noms. Global (pas par équipe).
// Un membre marqué inactif est exclu du shuffle ET affiché grisé dans la grille.
const _ROT_INACTIVE_KEY = 'rot-inactive';
export function getInactiveSupportMembers() {
    try { return JSON.parse(localStorage.getItem(_ROT_INACTIVE_KEY) || '[]'); }
    catch { return []; }
}
export function isMemberSupportActive(name) {
    if (!name) return false;
    return !getInactiveSupportMembers().includes(name);
}
export function setMemberSupportActive(name, active) {
    if (!name) return;
    const list = getInactiveSupportMembers();
    const idx = list.indexOf(name);
    if (active) { if (idx >= 0) list.splice(idx, 1); }
    else        { if (idx < 0)  list.push(name); }
    localStorage.setItem(_ROT_INACTIVE_KEY, JSON.stringify(list));
}

/**
 * Construit les semaines du PI courant et du PI suivant.
 * Une "semaine" = { label, weekStart, weekEnd } (ISO YYYY-MM-DD).
 *
 * **Sources d'ancrage temporel** (par priorité) :
 *   1. `piInfo.startDate` — source de vérité absolue (saisie utilisateur dans Settings → PI).
 *      Ex: PI 30 = "2026-06-12" (vendredi). Évite toute dérivation fragile.
 *   2. Fallback : dérivation depuis `sprintInfo.startDate - (sprintIdx) × sprintDuration`.
 *      Marche si le sprint actif est correctement aligné mais sensible aux décalages.
 *
 * @param {{number?, sprintsPerPI?, sprintDuration?, startDate?}} piInfo
 * @param {{name?, startDate?}} sprintInfo  Sprint actif (fallback d'ancrage)
 * @param {string} [weekMode='friday']  monday | tuesday | wednesday | thursday | friday — 1er jour de chaque semaine
 */
export function buildSupportPiWeeks(piInfo, sprintInfo, weekMode = SUPPORT_WEEK_MODE_DEFAULT) {
    const sprintCnt = piInfo?.sprintsPerPI  || 5;
    const sprintDur = piInfo?.sprintDuration || 14;
    const piNum     = piInfo?.number || '';

    // Ancrage BRUT du PI — jamais snappé ici : makePiWeeks recule lui-même sur le jour du mode
    // et ajoute la semaine de transition si ce recul laisse la fin du PI à découvert.
    // Priorité 1 : piInfo.startDate (saisie « Sprint & PI », ou date JIRA résolue par buildPiWeeks).
    let piStartRaw;
    if (piInfo?.startDate) {
        piStartRaw = piInfo.startDate.slice(0, 10);
    } else {
        // Fallback : dérivation depuis sprintInfo
        const anchor = (sprintInfo?.startDate || new Date().toISOString()).slice(0, 10);
        let curIdx = -1;
        if (sprintInfo?.name && piNum) {
            const m = sprintInfo.name.match(/(\d+)\.(\d+)/);
            if (m && parseInt(m[1]) === piNum) curIdx = parseInt(m[2]) - 1;
        }
        piStartRaw = curIdx >= 0 ? _isoAdd(anchor, -curIdx * sprintDur) : anchor;
    }

    const nextPiNum = piNum ? piNum + 1 : '';
    const nextPiRaw = _isoAdd(piStartRaw, sprintCnt * sprintDur);
    return {
        curWeeks:  makePiWeeks({ piNum, rawStart: piStartRaw, weekMode, sprintCnt, sprintDur }),
        nextWeeks: makePiWeeks({ piNum: nextPiNum, rawStart: nextPiRaw, weekMode, sprintCnt, sprintDur }),
        curPiNum:  piNum,
        nextPiNum,
        piStartRaw,          // ancrage brut — buildPiWeeks en dérive les PI voisins
        weekMode,
        anchorSource: piInfo?.startDate ? 'config' : 'derived',  // pour diagnostic
    };
}

/**
 * Génère une rotation support pour une équipe sur un ensemble de semaines.
 *
 * RÈGLES MÉTIER (cf. CLAUDE.md, guide-support.md) :
 *   1. **Absence ≥ 3 jours dans la semaine → membre exclu** de cette semaine.
 *   2. **Pas 2 semaines consécutives** : un membre affecté en semaine N est exclu
 *      de la semaine N+1 — sauf si pas assez de monde dispo (contrainte relâchée).
 *   3. **Verrouillage auto du passé** : toute semaine dont `weekEnd < today` est
 *      préservée telle quelle (jamais réécrite par un shuffle).
 *   4. **Verrouillage manuel** : une rotation marquée `locked: true` est préservée.
 *   5. **Équité** : on priorise les membres avec le moins d'affectations cumulées
 *      sur l'ensemble de la rotation (passé inclus). Random pour les ex-aequos.
 *   6. **Tirage final** : `membersPerWeek` membres sélectionnés (ou moins si pool insuffisant).
 *
 * @param {Object} opts
 * @param {string} opts.team
 * @param {Array<{label, weekStart, weekEnd}>} opts.weeks  Semaines à planifier (chronologique)
 * @param {Array<string>} opts.memberNames  Noms des candidats (déjà filtrés par équipe)
 * @param {Array} opts.absences
 * @param {Array} [opts.existingSupport=[]]  Rotations existantes (pour préserver passé/locked)
 * @param {number} [opts.membersPerWeek=2]
 * @param {string} [opts.weekMode='monday']
 * @param {string} [opts.today]  ISO date (override pour tests) — par défaut aujourd'hui
 * @returns {Array} Liste complète { team, weekLabel, weekStart, weekEnd, members, weekMode, membersPerWeek, locked? }
 */
export function generateSupportRotation(opts) {
    const {
        team, weeks, memberNames, absences = [], existingSupport = [],
        membersPerWeek = 2, weekMode = 'monday',
        today = new Date().toISOString().slice(0, 10),
    } = opts;

    const counts = Object.fromEntries(memberNames.map(m => [m, 0]));
    const result = [];
    let lastPicks = [];

    const _findExisting = (w) => existingSupport.find(
        s => s.team === team && s.weekStart === w.weekStart && s.weekEnd === w.weekEnd
    );

    for (const w of weeks) {
        const existing = _findExisting(w);
        const isPast = w.weekEnd < today;
        const isLocked = !!existing?.locked;
        const isPastUnlocked = !!existing?.unlocked;  // déverrou exceptionnel du passé

        // Règle 3 : VERROUILLAGE DUR du passé — une semaine dont weekEnd < today
        // n'est JAMAIS shuffle/réécrite, même si elle n'a pas d'entrée existante.
        // EXCEPTION : si `unlocked: true`, l'utilisateur a déverrouillé exceptionnellement → shuffle autorisé.
        if (isPast && !isPastUnlocked) {
            const preserved = existing || {
                team, weekLabel: w.label, weekStart: w.weekStart, weekEnd: w.weekEnd,
                members: [], weekMode, membersPerWeek,
            };
            result.push({ ...preserved, _autoLocked: true, locked: existing?.locked || false });
            (preserved.members || []).forEach(m => { if (m in counts) counts[m]++; });
            lastPicks = preserved.members || [];
            continue;
        }

        // Règle 4 : verrouillage manuel (locked: true) — préservé même dans le futur
        if (existing && isLocked) {
            result.push({ ...existing, _autoLocked: false });
            (existing.members || []).forEach(m => { if (m in counts) counts[m]++; });
            lastPicks = existing.members || [];
            continue;
        }

        // Règle 1 : exclure les absents ≥ 3j
        const available = memberNames.filter(m => !isSupportAbsent(supportAbsenceDays(m, w.weekStart, w.weekEnd, absences)));

        // Règle 2 : pas 2 sem consécutives (relâché si pool insuffisant)
        let pool = available.filter(m => !lastPicks.includes(m));
        if (pool.length < membersPerWeek) pool = available;

        // Règle 5 : tri équité asc + random pour ex-aequo
        pool.sort((a, b) => counts[a] !== counts[b] ? counts[a] - counts[b] : Math.random() - 0.5);
        const picked = pool.slice(0, Math.min(membersPerWeek, pool.length));
        picked.forEach(m => counts[m]++);
        lastPicks = picked;

        result.push({
            team,
            weekLabel: w.label,
            weekStart: w.weekStart,
            weekEnd: w.weekEnd,
            members: picked,
            weekMode,
            membersPerWeek,
            locked: false,
        });
    }

    return result;
}

// ── Rotation mutualisée : un pool de plusieurs équipes ──────────────────────
// Cas d'usage : trois équipes d'une même ligne produit assurent UNE seule astreinte
// commune, avec une composition par POSTE (ex: 2 Dev + 1 Product Owner chaque semaine)
// plutôt qu'un effectif brut par équipe.
//
// Stockage : localStorage `rot-pools` = { <clé>: pool }, la clé étant l'id du groupe
// sélectionné dans le topbar (ou POOL_ALL_KEY hors groupe) — on édite ainsi le pool de
// la ligne produit qu'on regarde, sans écraser celui d'une autre.
// Forme d'un pool : { enabled, teams: [...], quotas: { '<rôle>': n }, weekMode }
const _ROT_POOLS_KEY = 'rot-pools';
export const POOL_ALL_KEY = '__all__';

/** Tous les pools enregistrés, indexés par clé. */
export function loadSupportPools() {
    try { return JSON.parse(localStorage.getItem(_ROT_POOLS_KEY) || '{}') || {}; }
    catch { return {}; }
}

/**
 * Postes équivalents pour l'astreinte, groupés par défaut : un Tech Lead tient le créneau
 * d'un Dev. Sans ce regroupement, demander « 2 Dev » écarte les Tech Lead du tirage alors
 * qu'ils assurent le même support — et deux quotas séparés (`2 Dev` + `1 Tech Lead`) ne
 * disent PAS la même chose : ils imposent la composition au lieu de la laisser libre.
 *
 * C'est un DÉFAUT, pas une règle : dès que le pool enregistre ses propres fusions,
 * `pool.roleGroups` prime — y compris `{}` pour ne rien grouper du tout.
 * Clé = libellé du poste (les rôles joints par « + »), valeur = rôles couverts.
 */
export const DEFAULT_ROLE_GROUPS = {
    'Dev + Tech Lead': ['Dev', 'Tech Lead'],
    'Testeur.se + Test Lead': ['Testeur.se', 'Test Lead'],
};

/** Libellé canonique d'un poste groupé — construit depuis ses rôles, jamais saisi. */
export const posteLabel = roles => [...new Set(roles)].join(' + ');

/** Poste auquel appartient un rôle (lui-même s'il n'est dans aucun groupe). */
export function posteOfRole(role, roleGroups) {
    for (const [label, roles] of Object.entries(roleGroups || {})) {
        if ((roles || []).includes(role)) return label;
    }
    return role;
}

/** Rôles couverts par un poste (le poste lui-même s'il n'est pas groupé). */
export function posteRoles(label, roleGroups) {
    const g = (roleGroups || {})[label];
    return (g && g.length) ? [...g] : [label];
}

/**
 * Reporte des quotas exprimés sur des RÔLES vers les POSTES qui les couvrent, en sommant.
 * Un pool enregistré avant une fusion garde `{ Dev: 2, 'Tech Lead': 1 }` : sans ce report,
 * les deux lignes deviendraient orphelines (« 0 dispo ») et le pool viserait 0 personne.
 */
export function remapQuotasToPostes(quotas, roleGroups) {
    const out = {};
    for (const [key, n] of Object.entries(quotas || {})) {
        const v = parseInt(n, 10) || 0;
        if (!v) continue;
        // Une clé déjà égale à un libellé de poste est conservée telle quelle.
        const label = (roleGroups || {})[key] ? key : posteOfRole(key, roleGroups);
        out[label] = (out[label] || 0) + v;
    }
    return out;
}

/** Pool d'une clé donnée, normalisé (tous les champs toujours présents). */
export function getSupportPool(key) {
    const p = loadSupportPools()[key || POOL_ALL_KEY] || {};
    // `roleGroups` ABSENT ⇒ défaut ; présent mais vide ⇒ choix explicite de ne rien grouper.
    const roleGroups = (p.roleGroups && typeof p.roleGroups === 'object')
        ? p.roleGroups
        : { ...DEFAULT_ROLE_GROUPS };
    return {
        enabled: !!p.enabled,
        teams: Array.isArray(p.teams) ? p.teams : [],
        quotas: (p.quotas && typeof p.quotas === 'object') ? p.quotas : {},
        roleGroups,
        weekMode: SUPPORT_WEEK_MODES[p.weekMode] ? p.weekMode : SUPPORT_WEEK_MODE_DEFAULT,
    };
}

/** Enregistre (ou remplace) le pool d'une clé. */
export function saveSupportPool(key, pool) {
    const all = loadSupportPools();
    const next = {
        enabled: !!pool.enabled,
        teams: [...new Set(pool.teams || [])],
        quotas: Object.fromEntries(
            Object.entries(pool.quotas || {})
                .map(([r, n]) => [r, parseInt(n, 10) || 0])
                .filter(([, n]) => n > 0)
        ),
        weekMode: SUPPORT_WEEK_MODES[pool.weekMode] ? pool.weekMode : SUPPORT_WEEK_MODE_DEFAULT,
    };
    // `roleGroups` n'est écrit que si l'appelant en fournit un : écrire `{}` par défaut
    // signifierait « l'utilisateur a choisi de ne rien grouper » et supprimerait
    // DEFAULT_ROLE_GROUPS au premier enregistrement venu. Un groupe d'un seul rôle n'est
    // pas un groupe et retombe sur le rôle brut.
    if (pool.roleGroups) {
        next.roleGroups = Object.fromEntries(
            Object.entries(pool.roleGroups)
                .map(([label, roles]) => [label, [...new Set(roles || [])]])
                .filter(([, roles]) => roles.length > 1)
        );
    }
    all[key || POOL_ALL_KEY] = next;
    localStorage.setItem(_ROT_POOLS_KEY, JSON.stringify(all));
}

/** Nombre de personnes visées chaque semaine par un pool (somme des quotas). */
export function poolQuotaTotal(pool) {
    return Object.values(pool?.quotas || {}).reduce((s, n) => s + (parseInt(n, 10) || 0), 0);
}

/**
 * Premier pool ACTIF couvrant une équipe (comparaison stricte : `pool.teams` contient
 * des noms d'équipe de la config, comme la grille). Sert à signaler dans la grille par
 * équipe que la semaine est pilotée par le pool — l'effectif cible n'y est plus celui
 * de l'équipe mais celui du pool.
 * @returns {null|{key, pool}}
 */
export function supportPoolForTeam(team) {
    if (!team) return null;
    const all = loadSupportPools();
    for (const [key, p] of Object.entries(all)) {
        if (p?.enabled && (p.teams || []).includes(team) && poolQuotaTotal(p) > 0) {
            return { key, pool: getSupportPool(key) };
        }
    }
    return null;
}

/**
 * Lignes de rotation d'une équipe à RÉINJECTER lors d'un `bulk` : celles qui tombent
 * HORS de la fenêtre de semaines régénérée.
 *
 * `POST /api/support/bulk` purge TOUTES les lignes de l'équipe avant d'insérer. Sans ce
 * report, générer le PI 31 effaçait la rotation du PI 30 — silencieusement, puisque la
 * grille n'affiche qu'un PI à la fois. L'`id` est volontairement omis : le bulk recrée.
 *
 * @param {Array} existingSupport  Rotations connues (toutes équipes)
 * @param {string} team            Équipe régénérée
 * @param {Array<{weekStart}>} weeks  Fenêtre régénérée
 */
export function carrySupportRowsOutside(existingSupport, team, weeks) {
    const inWindow = new Set((weeks || []).map(w => w.weekStart));
    return (existingSupport || [])
        .filter(s => s.team === team && !inWindow.has(s.weekStart))
        .map(s => ({
            team,
            weekLabel: s.weekLabel || '',
            weekStart: s.weekStart,
            weekEnd: s.weekEnd,
            members: s.members || [],
            memberDays: s.memberDays || {},
            locked: !!s.locked,
            unlocked: !!s.unlocked,
            weekMode: s.weekMode || SUPPORT_WEEK_MODE_DEFAULT,
            membersPerWeek: s.membersPerWeek || 2,
        }));
}

/**
 * Génère UNE rotation commune à plusieurs équipes, composée par poste.
 *
 * Mêmes garde-fous que `generateSupportRotation`, transposés au pool :
 *   1. **Absence ≥ 3 jours** dans la semaine → membre écarté de cette semaine.
 *   2. **Pas 2 semaines consécutives** pour une même personne — contrainte relâchée
 *      si le vivier d'un poste devient trop court.
 *   3. **Passé verrouillé** : une semaine dont `weekEnd < today` est préservée telle
 *      quelle, équipe par équipe (sauf `unlocked: true`).
 *   4. **Verrou manuel** (`locked: true`) : préservé, y compris dans le futur. Une équipe
 *      verrouillée reste figée pendant que le reste du pool se complète — les membres
 *      ainsi conservés **décomptent** le quota de leur poste, sinon la semaine finirait
 *      à 4 personnes au lieu de 3.
 *   5. **Équité par personne** : le moins affecté d'abord, sur toute la rotation.
 *   6. **Équité par équipe** : à égalité de personnes, on pioche dans l'équipe la moins
 *      sollicitée — sinon la plus grosse équipe du pool assure toute l'astreinte.
 *   7. **Composition** : `quotas[poste]` personnes de chaque poste, ou moins si le vivier
 *      ne suit pas. Le manque est remonté dans `shortfalls`, JAMAIS comblé par un autre
 *      poste : « 2 Dev + 1 PO » ne doit pas se transformer en 3 Dev en silence.
 *
 * @param {Object} opts
 * @param {Array<string>} opts.teams  Équipes du pool (noms de la config)
 * @param {Array<{label, weekStart, weekEnd}>} opts.weeks  Semaines à planifier
 * @param {Array<{name, team, role}>} opts.members  Candidats, `team` DÉJÀ normalisé sur les
 *   noms de `teams` (le matching tolérant est fait par l'appelant) et inactifs déjà écartés
 * @param {Object<string, number>} opts.quotas  { 'Dev': 2, 'Product Owner': 1 }
 * @param {Array} [opts.absences=[]]
 * @param {Array} [opts.existingSupport=[]]  Rotations existantes des équipes du pool
 * @param {string} [opts.weekMode]
 * @param {string} [opts.today]  ISO (override pour tests)
 * @returns {{rotationsByTeam: Object<string, Array>, shortfalls: Array<{week, role, missing}>}}
 */
export function generatePooledSupportRotation(opts) {
    const {
        teams = [], weeks = [], members = [], quotas = {},
        absences = [], existingSupport = [],
        weekMode = SUPPORT_WEEK_MODE_DEFAULT,
        today = new Date().toISOString().slice(0, 10),
    } = opts;

    // Postes servis du vivier le plus étroit au plus large : avec un seul Product Owner
    // disponible, le servir APRÈS les Dev suffirait à le rater si un dev polyvalent avait
    // déjà consommé sa place. L'ordre de saisie des quotas ne doit rien décider.
    const roleSupply = role => members.filter(m => (m.role || '') === role).length;
    const wantedRoles = Object.entries(quotas)
        .map(([role, n]) => [role, parseInt(n, 10) || 0])
        .filter(([, n]) => n > 0)
        .sort((a, b) => roleSupply(a[0]) - roleSupply(b[0]));

    const roleOf   = new Map(members.map(m => [m.name, m.role || '']));
    const counts   = Object.fromEntries(members.map(m => [m.name, 0]));
    const teamLoad = Object.fromEntries(teams.map(t => [t, 0]));
    const rotationsByTeam = Object.fromEntries(teams.map(t => [t, []]));
    const poolSize = poolQuotaTotal({ quotas });
    const shortfalls = [];
    let lastPicks = [];

    const _existing = (team, w) => existingSupport.find(
        s => s.team === team && s.weekStart === w.weekStart && s.weekEnd === w.weekEnd
    );

    for (const w of weeks) {
        const isPast = w.weekEnd < today;
        const frozenTeams = new Set();
        const kept = [];

        // Règles 3 & 4 — figer d'abord, pour savoir ce qu'il reste à pourvoir
        for (const t of teams) {
            const ex = _existing(t, w);
            const autoLocked = isPast && !ex?.unlocked;
            if (!autoLocked && !ex?.locked) continue;
            frozenTeams.add(t);
            const preserved = ex || {
                team: t, weekLabel: w.label, weekStart: w.weekStart, weekEnd: w.weekEnd,
                members: [], weekMode, membersPerWeek: poolSize,
            };
            rotationsByTeam[t].push({ ...preserved, _autoLocked: autoLocked, locked: ex?.locked || false });
            for (const m of (preserved.members || [])) {
                kept.push(m);
                if (m in counts) counts[m]++;
                if (t in teamLoad) teamLoad[t]++;
            }
        }

        const picksByTeam = Object.fromEntries(teams.map(t => [t, []]));
        const weekPicks = [];

        for (const [role, want] of wantedRoles) {
            const already = kept.filter(m => roleOf.get(m) === role).length;
            const need = Math.max(0, want - already);
            if (!need) continue;

            const eligible = members.filter(m =>
                (m.role || '') === role &&
                !frozenTeams.has(m.team) &&
                !weekPicks.includes(m.name) &&
                !isSupportAbsent(supportAbsenceDays(m.name, w.weekStart, w.weekEnd, absences))
            );
            // Règle 2 : éviter la semaine consécutive tant que le vivier le permet
            let pool = eligible.filter(m => !lastPicks.includes(m.name));
            if (pool.length < need) pool = eligible;

            // Règles 5 & 6 : équité personne, puis équipe, puis hasard pour les ex-aequo
            pool = pool.slice().sort((a, b) =>
                (counts[a.name] - counts[b.name]) ||
                ((teamLoad[a.team] || 0) - (teamLoad[b.team] || 0)) ||
                (Math.random() - 0.5)
            );

            const picked = pool.slice(0, Math.min(need, pool.length));
            if (picked.length < need) {
                shortfalls.push({ week: w.label, role, missing: need - picked.length });
            }
            for (const m of picked) {
                counts[m.name]++;
                teamLoad[m.team] = (teamLoad[m.team] || 0) + 1;
                picksByTeam[m.team].push(m.name);
                weekPicks.push(m.name);
            }
        }

        lastPicks = [...kept, ...weekPicks];

        for (const t of teams) {
            if (frozenTeams.has(t)) continue;
            rotationsByTeam[t].push({
                team: t, weekLabel: w.label, weekStart: w.weekStart, weekEnd: w.weekEnd,
                members: picksByTeam[t], weekMode,
                // Cible du POOL, pas de l'équipe : une équipe peut légitimement ne fournir
                // personne une semaine donnée.
                membersPerWeek: poolSize,
                locked: false,
            });
        }
    }

    return { rotationsByTeam, shortfalls };
}
