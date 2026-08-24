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
 * Compte les jours d'absence d'un membre dans une plage [weekStart, weekEnd].
 * Source = table absences (CSV RH, vérité).
 */
export function supportAbsenceDays(memberName, weekStart, weekEnd, absences) {
    return (absences || [])
        .filter(a => a.memberName === memberName && a.startDate <= weekEnd && a.endDate >= weekStart)
        .reduce((sum, a) => sum + (a.days || 0), 0);
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
    const dayMs = 86400000;
    const hits = (absences || []).filter(a =>
        a.memberName === memberName && a.startDate <= iso && a.endDate >= iso
    );
    if (!hits.length) return null;
    // Somme les fractions de jours d'absence qui tombent sur ce jour précis
    let total = 0;
    for (const a of hits) {
        const start = new Date(a.startDate + 'T00:00:00');
        const end   = new Date(a.endDate   + 'T00:00:00');
        const span  = Math.max(1, Math.round((end - start) / dayMs) + 1);
        total += (a.days || 1) / span;
    }
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

/** Récupère le mode semaine d'une équipe depuis localStorage (clé `rot-mode-<team>`). */
export function getSupportWeekMode(team) {
    const stored = (typeof localStorage !== 'undefined' && team) ? localStorage.getItem(`rot-mode-${team}`) : null;
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
 * @param {string} [weekMode='friday']  monday | wednesday | friday — 1er jour de chaque semaine
 */
export function buildSupportPiWeeks(piInfo, sprintInfo, weekMode = SUPPORT_WEEK_MODE_DEFAULT) {
    const sprintCnt = piInfo?.sprintsPerPI  || 5;
    const sprintDur = piInfo?.sprintDuration || 14;
    const piNum     = piInfo?.number || '';
    const wps       = Math.max(1, Math.floor(sprintDur / 7));
    const targetDow = (SUPPORT_WEEK_MODES[weekMode] || SUPPORT_WEEK_MODES[SUPPORT_WEEK_MODE_DEFAULT]).dow;

    // Formate une Date locale en YYYY-MM-DD sans conversion UTC (évite le décalage timezone).
    const _fmt = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    const _add = (d, n) => {
        const dt = new Date(d + 'T00:00:00');
        dt.setDate(dt.getDate() + n);
        return _fmt(dt);
    };
    // Snap au jour de semaine ciblé (recul jusqu'à 6j max).
    const _snap = (iso) => {
        const d = new Date(iso + 'T00:00:00');
        const back = (d.getDay() - targetDow + 7) % 7;
        d.setDate(d.getDate() - back);
        return _fmt(d);
    };

    // Priorité 1 : piInfo.startDate si saisi explicitement par l'utilisateur.
    // Cette date n'est PAS snappée — on respecte le choix utilisateur (qui sait que son PI commence un vendredi).
    // Si jamais l'utilisateur a saisi une date qui ne correspond pas au weekMode actuel, on snappe quand même
    // pour aligner avec les semaines (sinon les rotations seraient désynchronisées du sprint).
    let piStartSnapped;
    if (piInfo?.startDate) {
        piStartSnapped = _snap(piInfo.startDate.slice(0, 10));
    } else {
        // Fallback : dérivation depuis sprintInfo
        const anchor = (sprintInfo?.startDate || new Date().toISOString()).slice(0, 10);
        let curIdx = -1;
        if (sprintInfo?.name && piNum) {
            const m = sprintInfo.name.match(/(\d+)\.(\d+)/);
            if (m && parseInt(m[1]) === piNum) curIdx = parseInt(m[2]) - 1;
        }
        const piStart = curIdx >= 0 ? _add(anchor, -curIdx * sprintDur) : anchor;
        piStartSnapped = _snap(piStart);
    }

    const makeWeeks = (pn, ps) => {
        const ws = [];
        for (let s = 0; s < sprintCnt; s++) {
            const ss = _add(ps, s * sprintDur);
            for (let w = 0; w < wps; w++) {
                const wStart = _add(ss, w * 7);
                const wEnd   = _add(wStart, 6);
                ws.push({ label: `${pn}.${s + 1}.${w + 1}`, weekStart: wStart, weekEnd: wEnd });
            }
        }
        return ws;
    };

    const nextPiNum   = piNum ? piNum + 1 : '';
    const nextPiStart = _add(piStartSnapped, sprintCnt * sprintDur);
    return {
        curWeeks:  makeWeeks(piNum,     piStartSnapped),
        nextWeeks: makeWeeks(nextPiNum, nextPiStart),
        curPiNum:  piNum,
        nextPiNum,
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
        const available = memberNames.filter(m => supportAbsenceDays(m, w.weekStart, w.weekEnd, absences) < 3);

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
