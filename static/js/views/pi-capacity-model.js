/**
 * 🧮 Page PI → Capacité : réglages (rôles exclus, historique), vélocité moyenne, jours ouvrés et fenêtres des sprints.
 *
 * Extrait de pi.js (3.258.0), code déplacé à l'identique. N'importe jamais pi.js (pas de cycle).
 */
import { store } from '../state.js';
import { pct, sumBy, roleCapacityPct, breathIdxByPi, isBreathSprint, sprintRealizedVelocity } from '../utils.js';

// ── Capacity tab ──────────────────────────────────────────────────────────────

// Rôles exclus du calcul de capacité (non-devs). Persisté en localStorage.
export const CAP_EXCLUDED_ROLES_KEY = 'cap-excluded-roles';
const CAP_EXCLUDED_ROLES_DEFAULT = [
    'Product Owner', 'Scrum Master', 'Product Manager',
    'Release Train Engineer', 'Business Owner',
    'RTE', 'BO', 'TRV', 'PO', 'SM', 'PM',
];
export const CAP_HISTORY_MODE_KEY  = 'cap-history-mode';   // 'pi' | 'sprint'
export const CAP_HISTORY_COUNT_KEY = 'cap-history-count';  // number
const CAP_ROLE_PCT_KEY      = 'cap-role-pct';       // { role: pct 0-100 }

export function _capGetExcludedRoles() {
    try {
        const v = localStorage.getItem(CAP_EXCLUDED_ROLES_KEY);
        return v ? JSON.parse(v) : CAP_EXCLUDED_ROLES_DEFAULT;
    } catch { return CAP_EXCLUDED_ROLES_DEFAULT; }
}
export function _capGetHistoryMode()  { return localStorage.getItem(CAP_HISTORY_MODE_KEY)  || 'pi'; }
export function _capGetHistoryCount() { return parseInt(localStorage.getItem(CAP_HISTORY_COUNT_KEY) || '2', 10) || 2; }
// Retourne la map rôle → % de travail (0-100) depuis piInfo.roleCapacity (persisté serveur).
export function _capGetRolePct() {
    return store.get('piInfo')?.roleCapacity || {};
}
// % effectif d'un rôle (100 si non configuré) — règle partagée avec la Base capacité de
// Health, d'où la source unique dans utils/capacity-base.js : deux copies divergeraient.
export const _capRolePct = roleCapacityPct;

// Extrait le numéro de PI depuis un nom de sprint ("Fuego - Ité 28.3" → 28)
export function _capPiFromSprint(name) {
    const m = String(name || '').match(/\b(\d{2,})\.\d+/);
    return m ? parseInt(m[1], 10) : null;
}
// Extrait le numéro de sprint dans le PI ("Fuego - Ité 28.3" → 3)
export function _capSprintIdx(name) {
    const m = String(name || '').match(/\b\d{2,}\.(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}
// Sprint de respiration (IP) : le DERNIER sprint de son PI. Règle partagée avec la Base
// capacité de Health — source unique dans utils/capacity-base.js.
// Auparavant : « dernier sprint ET PI d'au moins 6 sprints », comparé au `sprintsPerPI`
// CONFIGURÉ. Deux défauts : un PI de 5 sprints n'avait aucune respiration, et un PI de 6
// voyait son 5e sprint exclu au lieu du 6e. `breathIdxByPi` retient, PI par PI,
// max(sprintsPerPI, plus grand index réellement observé).

// Sprint enrichi de sa vélocité RÉALISÉE (sprintRealizedVelocity, source unique partagée avec
// Santé) : Done locaux restés dans le sprint, repli JIRA, `_velMeasured: false` si aucune
// mesure — un tel sprint est écarté des moyennes au lieu de compter zéro. Avant (3.199),
// chaque endroit préférait la vélocité JIRA puis les tickets par nom EXACT : les moyennes
// différaient de celles de Santé pour la même équipe.
export function _withRealizedVelocity(s, tickets) {
    const v = sprintRealizedVelocity(tickets, s);
    const jira = s.velocity || 0;
    return { ...s, velocity: v ?? 0, _velMeasured: v != null, _velFromTickets: v != null && v !== jira };
}

// Calcule la vélocité moyenne historique par équipe
// mode='pi' → moyenne sur les X PI précédents (tous sprints confondus)
// mode='sprint' → moyenne sur les X derniers sprints
export function _capAvgVelocity(teamSprints, teamName, curPiNum, mode, count) {
    // Exclut la respiration de chaque PI : on n'y planifie rien, sa vélocité n'est pas un
    // repère de capacité. L'index est calculé sur TOUS les sprints de l'équipe (clos ou non),
    // sinon un PI dont le dernier sprint n'est pas encore clos verrait l'avant-dernier promu.
    const sprintsPerPI = store.get('piInfo')?.sprintsPerPI || 5;
    const mine = teamSprints.filter(s => s.team === teamName && s.name);
    const breathByPi = breathIdxByPi(mine, sprintsPerPI);
    const closed = mine.filter(s =>
        s.state === 'closed' && (s._velMeasured ?? (s.velocity || 0) > 0)
        && !isBreathSprint(s.name, breathByPi.get(_capPiFromSprint(s.name)))
    );
    if (!closed.length) return 0;

    let pool;
    if (mode === 'sprint') {
        // Exclut les sprints du PI sélectionné lui-même
        pool = [...closed]
            .filter(s => _capPiFromSprint(s.name) !== curPiNum)
            .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
            .slice(0, count);
    } else {
        // mode 'pi' : garde les N PI précédents
        const prevPis = new Set();
        for (const s of closed) {
            const pi = _capPiFromSprint(s.name);
            if (pi && pi < curPiNum) prevPis.add(pi);
        }
        const sortedPis = [...prevPis].sort((a, b) => b - a).slice(0, count);
        pool = closed.filter(s => sortedPis.includes(_capPiFromSprint(s.name)));
    }
    if (!pool.length) return 0;
    return Math.round(sumBy(pool, s => s.velocity) / pool.length);
}

// Normalise un nom d'équipe pour le matching (mojibake, accents, casse)
function _normTeamName(s) {
    if (!s) return '';
    try {
        const bytes = new Uint8Array([...s].map(c => c.charCodeAt(0) & 0xFF));
        s = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch { /* keep as-is */ }
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Calcule les jours d'absence sur une fenêtre [from, to] (les deux bornes inclusives)
export function _capAbsDaysInWindow(absences, teamName, from, to) {
    const normT = _normTeamName(teamName);
    return absences
        .filter(a => (_normTeamName(a.team) === normT || _normTeamName(a.team) === _normTeamName('Team ' + teamName)) && a.startDate <= to && a.endDate >= from)
        .reduce((s, a) => {
            const wFrom = a.startDate > from ? a.startDate : from;
            const wTo   = a.endDate   < to   ? a.endDate   : to;
            const absDur = Math.max(1, _workdays(a.startDate, a.endDate));
            const winDur = Math.max(0, _workdays(wFrom, wTo));
            return s + (a.days || 0) * (winDur / absDur);
        }, 0);
}

// Retourne la dispo de chaque membre sur la fenêtre : [{ name, role, absDays, availDays, availPct }]
// Retourne la dispo de chaque membre sur la fenêtre [from, to] (les deux bornes inclusives)
// Compte les jours ouvrés (lun-ven) entre deux dates ISO inclusives
export function _workdays(isoFrom, isoTo) {
    let count = 0;
    const cur = new Date(isoFrom + 'T00:00:00');
    const end = new Date(isoTo   + 'T00:00:00');
    while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

/** Jours ouvrés d'un sprint SANS fenêtre datée : `sprintDur` calendaires ramenés aux jours ouvrés (14 → 10). */
export const _capNominalWorkdays = sprintDur => Math.round(sprintDur * 5 / 7);

export function _capMemberAvail(members, absences, absTeamName, from, to, sprintDur, rolePctMap = {}) {
    // Jours ouvrés réels du sprint (base pour le % dispo) — plus précis que sprintDur configuré
    const sprintWorkdays = _workdays(from, to);
    const effectiveDur   = sprintWorkdays || sprintDur;

    return members
        .map(m => {
            const rolePct = _capRolePct(m.role, rolePctMap);
            const normAbs = _normTeamName(absTeamName);
            const mAbs = absences.filter(a =>
                a.memberName === m.name && _normTeamName(a.team) === normAbs &&
                a.startDate <= to && a.endDate >= from
            );
            const absDays = mAbs.reduce((s, a) => {
                // Fenêtre intersection absence ∩ sprint
                const wFrom = a.startDate > from ? a.startDate : from;
                const wTo   = a.endDate   < to   ? a.endDate   : to;
                // Proportion en jours ouvrés (évite le biais calendaire week-end)
                const absDur = Math.max(1, _workdays(a.startDate, a.endDate));
                const winDur = Math.max(0, _workdays(wFrom, wTo));
                return s + (a.days || 0) * (winDur / absDur);
            }, 0);
            const roundedAbs = Math.round(absDays * 10) / 10;
            const availDays  = Math.max(0, effectiveDur - roundedAbs);
            const availPct   = Math.round((availDays / effectiveDur) * 100);
            return { name: m.name, role: m.role || '', rolePct, absDays: roundedAbs, availDays, availPct };
        })
        .filter(m => m.rolePct > 0)
        .sort((a, b) => a.availPct - b.availPct);
}

// Soustrait N jours à une date ISO (pour convertir borne exclusive → inclusive pour l'affichage)
function _isoAddDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Génère les dates de début/fin de chaque sprint du PI courant.
// Priorité 1 : piInfo.startDate (config manuelle).
// Priorité 2 : dates réelles issues de teamSprints (JIRA) — union de toutes les équipes,
//              couvre sprints clôturés ET futurs déjà créés dans JIRA.
export function _capSprintWindows(piInfo, teamSprints) {
    const sprintCnt = piInfo?.sprintsPerPI  || 5;
    const sprintDur = piInfo?.sprintDuration || 14;
    const piNum     = piInfo?.number || 0;

    const fmt = (dt) => {
        const y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,'0'), d = String(dt.getDate()).padStart(2,'0');
        return `${y}-${m}-${d}`;
    };
    const add = (iso, n) => { const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return fmt(d); };

    // Le dernier sprint d'un PI ≥ 6 sprints est un sprint IP (Innovation & Planning)
    const isIpIdx = sprintCnt >= 6 ? sprintCnt : null;

    // Priorité 1 : date de début configurée manuellement
    // `to` est exclusif (premier jour du sprint suivant) — les calculs d'absences utilisent [from, to[
    if (piInfo?.startDate) {
        const startDate = piInfo.startDate;
        return Array.from({ length: sprintCnt }, (_, i) => ({
            label: `${piNum || '?'}.${i+1}`,
            from:  add(startDate, i * sprintDur),
            to:    add(startDate, (i + 1) * sprintDur - 1),  // inclusif (dernier jour du sprint)
            source: 'config',
            isIP:  isIpIdx !== null && (i + 1) === isIpIdx,
        }));
    }

    // Priorité 2 : dériver depuis les teamSprints du PI courant (toutes équipes confondues).
    // Pour chaque numéro de sprint dans le PI, on prend la startDate la plus ancienne
    // et la endDate la plus récente parmi toutes les équipes.
    if (!piNum || !teamSprints?.length) return null;

    const byIdx = new Map(); // sprintIdx → { from, to }
    for (const s of teamSprints) {
        if (_capPiFromSprint(s.name) !== piNum) continue;
        const idx = _capSprintIdx(s.name);
        if (!idx || !s.startDate) continue;
        const from = String(s.startDate).slice(0, 10);
        // JIRA endDate est exclusif (le dernier jour = premier jour du sprint suivant)
        // → on soustrait 1 jour pour obtenir la borne inclusive réelle
        const rawTo = s.endDate ? String(s.endDate).slice(0, 10) : add(from, sprintDur - 1);
        const to = add(rawTo, -1);
        const cur  = byIdx.get(idx);
        if (!cur) { byIdx.set(idx, { from, to }); continue; }
        if (from < cur.from) cur.from = from;
        if (to   > cur.to)   cur.to   = to;
    }
    if (!byIdx.size) return null;

    return Array.from({ length: sprintCnt }, (_, i) => {
        const idx  = i + 1;
        const win  = byIdx.get(idx);
        return win
            ? { label: `${piNum}.${idx}`, from: win.from, to: win.to, source: 'jira', isIP: isIpIdx !== null && idx === isIpIdx }
            : null; // sprint non encore créé dans JIRA
    });
}
