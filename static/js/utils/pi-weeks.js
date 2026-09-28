/**
 * Semaines d'un PI — SOURCE UNIQUE pour la grille « Paramètres → Rotation » et la page Support.
 *
 * Historique : ces deux écrans avaient chacun leur calcul. Ils divergeaient sur 25 des 27
 * configurations testées (jusqu'à plusieurs mois d'écart), parce que la page Support partait de
 * `piInfo.startDate` — la valeur en base, qui pointe souvent vers un PI précédent — au lieu de la
 * date JIRA du sprint `<PI>.1`. Les trois bugs de semaines corrigés en 3.141.1 → 3.141.4 venaient
 * tous de cette duplication. L'agenda et le panneau latéral, eux, apparient les rotations par
 * RECOUVREMENT de dates (`weekStart <= jour <= weekEnd`) : ils sont insensibles à l'ancrage et
 * n'ont rien à consommer d'ici.
 *
 * ⚠️ `weekStart` est la clé d'appariement des rotations enregistrées : le changer rend invisibles
 * celles déjà en base. D'où l'ordre de résolution ci-dessous — JIRA fait foi par défaut, et la
 * config locale ne prend le dessus que si l'utilisateur l'a explicitement voulu
 * (`manual.startDate`, posé par la saisie « Sprint & PI » ou par « Recaler ce PI sur les Congés »).
 * Et quel que soit le PI (courant ou épinglé), `weekStart` tombe sur le jour de bascule du mode
 * de semaine (`snapToWeekMode`) : c'est ce qui rend « Jeu → Mer » effectif, et ce qui garantit
 * qu'un PI écrit depuis PI+1 se relit à l'identique une fois devenu courant (3.162.1).
 * Toutes les branches fabriquent leurs semaines via `makePiWeeks` (support.js), qui ajoute la
 * SEMAINE DE TRANSITION quand le recul laisse la fin du PI — le PIP — à découvert (3.163.0).
 */

import { buildSupportPiWeeks, makePiWeeks, snapToWeekMode, SUPPORT_WEEK_MODE_DEFAULT } from './support.js';
import { loadPiCfg, listPiCfgNumbers } from './pi-config.js';

const _fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const _addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return _fmt(d); };

/** Numéro de PI porté par le nom d'un sprint ("Team A - Itération 30.6" → 30, "PI #31" → 31). */
export function piNumFromSprintName(name) {
    const s = String(name || '');
    const m = s.match(/\b(\d{2,})\.(\d+)/) || s.match(/(\d+)\.\d+/) || s.match(/PI\s*#?\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
}

/**
 * Date de début du sprint `.1` d'un PI = date MAJORITAIRE parmi les équipes.
 * Évite qu'un sprint JIRA mal daté d'un jour (jeudi au lieu de vendredi) décale le calcul
 * d'une semaine entière. À égalité, la date la plus tardive gagne (le vrai vendredi).
 */
export function jiraSprint1Start(sprintInfo, piNum) {
    if (!piNum) return '';
    const counts = {};
    for (const s of (sprintInfo?.teamSprints || [])) {
        const m = String(s.name || '').match(/\b(\d{2,})\.(\d+)/);
        if (m && parseInt(m[1], 10) === piNum && parseInt(m[2], 10) === 1 && s.startDate) {
            const d = String(s.startDate).slice(0, 10);
            counts[d] = (counts[d] || 0) + 1;
        }
    }
    const entries = Object.entries(counts);
    if (!entries.length) return '';
    return entries.sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0];
}

/**
 * Nombre d'itérations d'un PI. Ordre : saisie « Sprint & PI » > sprints JIRA DE CE PI >
 * déduction de l'import Congés > valeur héritée > repli.
 * ⚠️ JAMAIS `Math.max(indiceJira, repli)` : le repli vient souvent d'un AUTRE PI (le courant).
 * JIRA connaît 30.1→30.6 et 31.1→31.5 ; le max donnait 6 itérations au PI 31, soit deux
 * semaines fantômes débordant sur le PI 32.
 */
export function detectSprintsPerPI(sprintInfo, piNum, fallback) {
    if (!piNum) return fallback;
    const cfg = loadPiCfg(piNum);
    if (cfg?.manual?.sprintsPerPI && cfg.sprintsPerPI) return cfg.sprintsPerPI;
    let maxIdx = 0;
    for (const s of (sprintInfo?.teamSprints || [])) {
        const m = String(s.name || '').match(/\b(\d{2,})\.(\d+)/);
        if (m && parseInt(m[1], 10) === piNum) maxIdx = Math.max(maxIdx, parseInt(m[2], 10));
    }
    if (maxIdx > 0) return maxIdx;
    if (cfg?.sprintsPerPIFromCsv) return cfg.sprintsPerPIFromCsv;
    return cfg?.sprintsPerPI || fallback;
}

/** Date de début d'un PI : recalage explicite de l'utilisateur > JIRA > config > rien. */
export function piStartDate(sprintInfo, piNum) {
    const cfg = loadPiCfg(piNum);
    if (cfg?.manual?.startDate && cfg.startDate) return cfg.startDate;
    return jiraSprint1Start(sprintInfo, piNum) || cfg?.startDate || '';
}

/**
 * Semaines du PI visé par `piOffset` (0 = PI courant), pour un mode de semaine donné.
 *
 * @param {object}  o.piInfo      config PI en base (peut être périmée — jamais utilisée seule)
 * @param {object}  o.sprintInfo  sprints JIRA (source du numéro de PI courant et des dates)
 * @param {number}  [o.piOffset]  décalage de PI
 * @param {string}  [o.weekMode]  jour de début de semaine de l'équipe
 * @returns {{weeks: Array, piNum: number, basePiNum: number, base: object}}
 *          `base` = sortie brute de buildSupportPiWeeks (curWeeks/nextWeeks/nextPiNum).
 */
function _buildPiWeeksRaw({ piInfo: piInfoRaw, sprintInfo, piOffset = 0, weekMode = null }) {
    const mode = weekMode || SUPPORT_WEEK_MODE_DEFAULT;
    const basePiNum = piNumFromSprintName(sprintInfo?.name) || piInfoRaw?.number || 0;
    const baseCfg = loadPiCfg(basePiNum);
    const baseSprintsCnt = detectSprintsPerPI(sprintInfo, basePiNum, baseCfg?.sprintsPerPI || piInfoRaw?.sprintsPerPI || 5);
    const resolvedStart = piStartDate(sprintInfo, basePiNum) || piInfoRaw?.startDate;

    const piInfo = {
        ...piInfoRaw,
        number: basePiNum || piInfoRaw?.number,
        sprintsPerPI: baseSprintsCnt,
        ...(resolvedStart ? { startDate: resolvedStart } : {}),
    };
    const sprintDur = piInfo?.sprintDuration || 14;

    const base = buildSupportPiWeeks(piInfo, sprintInfo, mode);

    // buildSupportPiWeeks applique un seul compteur de sprints à curWeeks ET nextWeeks : si le PI
    // suivant en compte davantage (PI 29 → 30 passe de 5 à 6), nextWeeks est tronqué. On le
    // reconstruit à la bonne longueur avant de le rendre.
    const nextPi = base.nextPiNum;
    const nextSprintCnt = nextPi ? detectSprintsPerPI(sprintInfo, nextPi, baseSprintsCnt) : baseSprintsCnt;
    if (nextPi && nextSprintCnt > baseSprintsCnt && base.nextWeeks.length > 0 && base.piStartRaw) {
        base.nextWeeks = makePiWeeks({
            piNum: nextPi, rawStart: _addDays(base.piStartRaw, baseSprintsCnt * sprintDur),
            weekMode: mode, sprintCnt: nextSprintCnt, sprintDur,
        });
    }

    if (piOffset === 0) return { weeks: base.curWeeks, piNum: base.curPiNum, basePiNum, base };

    const targetPiNum = basePiNum ? Math.max(1, basePiNum + piOffset) : base.curPiNum;
    const sprintCnt = detectSprintsPerPI(sprintInfo, basePiNum ? Math.max(1, basePiNum + piOffset) : 0, piInfo?.sprintsPerPI || 5);
    // Date de début BRUTE du PI visé, confiée à makePiWeeks (support.js) — la même fabrique
    // que pour le PI courant : recul sur le jour de bascule du mode + semaine de transition.
    // Jusqu'en 3.162.0 cette branche gardait la date brute (dimanche/lundi JIRA) : le mode
    // « Jeu → Mer » n'avait aucun effet sur un PI épinglé (pastilles L→V), et les clés
    // `weekStart` écrites depuis PI+1 ne correspondaient plus à celles du même PI devenu
    // courant — rotation entière invisible au changement de PI (lignes recalées par
    // app/migrations.py).
    const targetRaw = piStartDate(sprintInfo, targetPiNum);
    if (targetRaw) {
        const weeks = makePiWeeks({ piNum: targetPiNum, rawStart: targetRaw, weekMode: mode, sprintCnt, sprintDur });
        return { weeks, piNum: targetPiNum, basePiNum, base };
    }

    // Aucune date propre au PI visé : on prolonge la cadence depuis le PI daté le plus proche,
    // en additionnant le nombre de sprints de CHAQUE PI intermédiaire. L'ancien pas uniforme
    // `offset × sprints du PI visé` plaçait PI 32 deux semaines trop tard (PI 30 en a 6, PI 31
    // en a 5) : sa première semaine ne coïncidait plus avec la transition du PI 31.
    if (!base.piStartRaw || !basePiNum) return { weeks: base.curWeeks, piNum: base.curPiNum, basePiNum, base };
    const rawStart = _chainedStart(sprintInfo, basePiNum, base.piStartRaw, targetPiNum, sprintDur, piInfo?.sprintsPerPI || 5);
    const weeks = makePiWeeks({ piNum: targetPiNum, rawStart, weekMode: mode, sprintCnt, sprintDur });
    return { weeks, piNum: targetPiNum, basePiNum, base };
}

/**
 * Date de début brute d'un PI sans date propre : depuis le PI daté le plus proche de la cible
 * (au pire le PI courant), PI par PI, avec le nombre de sprints de chacun.
 */
function _chainedStart(sprintInfo, basePiNum, baseRaw, targetPiNum, sprintDur, fallbackCnt) {
    const step = targetPiNum > basePiNum ? 1 : -1;
    let pi = basePiNum, raw = baseRaw;
    for (let k = targetPiNum - step; k !== basePiNum; k -= step) {
        const known = piStartDate(sprintInfo, k);
        if (known) { pi = k; raw = known; break; }
    }
    while (pi !== targetPiNum) {
        if (step > 0) { raw = _addDays(raw, detectSprintsPerPI(sprintInfo, pi, fallbackCnt) * sprintDur); pi += 1; }
        else { pi -= 1; raw = _addDays(raw, -detectSprintsPerPI(sprintInfo, pi, fallbackCnt) * sprintDur); }
    }
    return raw;
}

/**
 * Semaines du PI visé (cf. _buildPiWeeksRaw), avec la semaine PARTAGÉE annotée : la transition
 * d'un PI est la première semaine du suivant (même `weekStart`, même rotation en base).
 * `sharedWith` porte l'autre libellé — « 31.5.3 · 32.1.1 » dans l'en-tête, des deux côtés —
 * et n'est posé que si les deux calculs coïncident vraiment : un PI suivant daté ailleurs
 * (trou entre deux PI) ne reçoit aucune annotation mensongère.
 */
export function buildPiWeeks(o) {
    const res = _buildPiWeeksRaw(o);
    const off = o.piOffset || 0;
    const voisin = (d) => _buildPiWeeksRaw({ ...o, piOffset: off + d }).weeks;
    const weeks = res.weeks || [];
    const last = weeks[weeks.length - 1];
    if (last?.transition) {
        const next = voisin(+1)[0];
        if (next && next.weekStart === last.weekStart) last.sharedWith = next.label;
    }
    const first = weeks[0];
    if (first && res.basePiNum && res.basePiNum + off - 1 >= 1) {
        const prev = voisin(-1);
        const pl = prev[prev.length - 1];
        if (pl?.transition && pl.weekStart === first.weekStart) first.sharedWith = pl.label;
    }
    return res;
}

/**
 * Écart entre ce qu'utilise la grille pour un PI et ce que disent les Congés importés.
 * Source unique du bandeau « Recaler ce PI sur les Congés » (Paramètres → Rotation) et du
 * récapitulatif multi-PI (Paramètres → Sprint & PI).
 *
 * L'écart de DATE s'évalue après recul sur le jour de bascule (`snapToWeekMode`), pour chacun
 * des `weekModes` fournis — ceux des équipes affichées ; à défaut, le mode par défaut. JIRA
 * dimanche 06/09 et CSV lundi 07/09 reculent tous deux au vendredi 04/09 : recaler ne
 * déplacerait aucune clé `weekStart`, le bandeau n'a rien à proposer (`memeSemaine`). Le même
 * couple pour une équipe en « Lun → Dim » donne 31/08 et 07/09 : là, l'écart est réel.
 * @param {string[]} [weekModes]  modes de semaine des équipes concernées
 * @returns {{piNum, startUsed, sprintsUsed, startCsv, sprintsCsv, source, cale, ecartDate, ecartCnt, ecart, memeSemaine}}
 */
export function piCongesDiff(sprintInfo, piNum, piInfo = null, weekModes = null) {
    const cfg = loadPiCfg(piNum);
    const startUsed = piStartDate(sprintInfo, piNum);
    const sprintsUsed = detectSprintsPerPI(sprintInfo, piNum, piInfo?.sprintsPerPI || 5);
    const startCsv = cfg?.startDateFromCsv || '';
    const sprintsCsv = cfg?.sprintsPerPIFromCsv || 0;
    const source = cfg?.manual?.startDate && cfg.startDate === startUsed ? 'saisie'
        : jiraSprint1Start(sprintInfo, piNum) === startUsed && startUsed ? 'jira'
        : startUsed ? 'config' : 'aucune';
    const cale = !!startCsv && !!cfg?.manual?.startDate && cfg.startDate === startCsv;
    const modes = (weekModes && weekModes.length) ? weekModes : [SUPPORT_WEEK_MODE_DEFAULT];
    const ecartDate = !!startCsv && (!startUsed
        || modes.some(m => snapToWeekMode(startCsv, m) !== snapToWeekMode(startUsed, m)));
    // Dates brutes différentes mais même semaine de bascule partout : rien à recaler.
    const memeSemaine = !!startCsv && !!startUsed && startCsv !== startUsed && !ecartDate;
    const ecartCnt  = !!sprintsCsv && sprintsCsv !== sprintsUsed;
    return { piNum, startUsed, sprintsUsed, startCsv, sprintsCsv, source, cale, ecartDate, ecartCnt, ecart: ecartDate || ecartCnt, memeSemaine };
}

/** Tous les PI connus (config locale + sprints JIRA), triés croissant. */
export function knownPiNumbers(sprintInfo) {
    const nums = new Set(listPiCfgNumbers());
    for (const s of (sprintInfo?.teamSprints || [])) {
        const n = piNumFromSprintName(s.name);
        if (n) nums.add(n);
    }
    return [...nums].sort((a, b) => a - b);
}
