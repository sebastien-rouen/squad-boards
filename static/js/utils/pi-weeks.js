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
 */

import { buildSupportPiWeeks, SUPPORT_WEEK_MODE_DEFAULT } from './support.js';
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
export function buildPiWeeks({ piInfo: piInfoRaw, sprintInfo, piOffset = 0, weekMode = null }) {
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
    const wps = Math.max(1, Math.floor(sprintDur / 7));

    const base = buildSupportPiWeeks(piInfo, sprintInfo, mode);

    // buildSupportPiWeeks applique un seul compteur de sprints à curWeeks ET nextWeeks : si le PI
    // suivant en compte davantage (PI 29 → 30 passe de 5 à 6), nextWeeks est tronqué. On le
    // reconstruit à la bonne longueur avant de le rendre.
    const nextPi = base.nextPiNum;
    const nextSprintCnt = nextPi ? detectSprintsPerPI(sprintInfo, nextPi, baseSprintsCnt) : baseSprintsCnt;
    if (nextPi && nextSprintCnt > baseSprintsCnt && base.nextWeeks.length > 0) {
        const nextStart = base.nextWeeks[0].weekStart;
        const fixed = [];
        for (let s = 0; s < nextSprintCnt; s++) {
            for (let w = 0; w < wps; w++) {
                const ws = _addDays(nextStart, s * sprintDur + w * 7);
                fixed.push({ label: `${nextPi}.${s + 1}.${w + 1}`, weekStart: ws, weekEnd: _addDays(ws, 6) });
            }
        }
        base.nextWeeks = fixed;
    }

    if (piOffset === 0) return { weeks: base.curWeeks, piNum: base.curPiNum, basePiNum, base };

    const targetPiNum = basePiNum ? Math.max(1, basePiNum + piOffset) : base.curPiNum;
    const sprintCnt = detectSprintsPerPI(sprintInfo, basePiNum ? Math.max(1, basePiNum + piOffset) : 0, piInfo?.sprintsPerPI || 5);
    // Date de début propre au PI visé. ⚠️ Volontairement NON snappée sur le mode de semaine :
    // les rotations déjà enregistrées sont appariées sur ces `weekStart`. L'en-tête de colonne
    // affiche, lui, le premier jour ouvré (cf. _rotFirstWorkday) pour rester lisible.
    const targetStart = piStartDate(sprintInfo, targetPiNum);

    const weeks = [];
    if (targetStart) {
        for (let s = 0; s < sprintCnt; s++) {
            for (let w = 0; w < wps; w++) {
                const ws = _addDays(targetStart, s * sprintDur + w * 7);
                weeks.push({ label: `${targetPiNum}.${s + 1}.${w + 1}`, weekStart: ws, weekEnd: _addDays(ws, 6) });
            }
        }
        return { weeks, piNum: targetPiNum, basePiNum, base };
    }

    // Aucune date propre au PI visé : on prolonge la cadence depuis le PI courant.
    const curStart = base.curWeeks[0]?.weekStart;
    if (!curStart) return { weeks: base.curWeeks, piNum: base.curPiNum, basePiNum, base };
    for (let s = 0; s < sprintCnt; s++) {
        for (let w = 0; w < wps; w++) {
            const ws = _addDays(curStart, piOffset * sprintCnt * sprintDur + s * sprintDur + w * 7);
            weeks.push({ label: `${targetPiNum}.${s + 1}.${w + 1}`, weekStart: ws, weekEnd: _addDays(ws, 6) });
        }
    }
    return { weeks, piNum: targetPiNum, basePiNum, base };
}

/**
 * Écart entre ce qu'utilise la grille pour un PI et ce que disent les Congés importés.
 * Source unique du bandeau « Recaler ce PI sur les Congés » (Paramètres → Rotation) et du
 * récapitulatif multi-PI (Paramètres → Sprint & PI).
 * @returns {{piNum, startUsed, sprintsUsed, startCsv, sprintsCsv, source, cale, ecartDate, ecartCnt, ecart}}
 */
export function piCongesDiff(sprintInfo, piNum, piInfo = null) {
    const cfg = loadPiCfg(piNum);
    const startUsed = piStartDate(sprintInfo, piNum);
    const sprintsUsed = detectSprintsPerPI(sprintInfo, piNum, piInfo?.sprintsPerPI || 5);
    const startCsv = cfg?.startDateFromCsv || '';
    const sprintsCsv = cfg?.sprintsPerPIFromCsv || 0;
    const source = cfg?.manual?.startDate && cfg.startDate === startUsed ? 'saisie'
        : jiraSprint1Start(sprintInfo, piNum) === startUsed && startUsed ? 'jira'
        : startUsed ? 'config' : 'aucune';
    const cale = !!startCsv && !!cfg?.manual?.startDate && cfg.startDate === startCsv;
    const ecartDate = !!startCsv && startCsv !== startUsed;
    const ecartCnt  = !!sprintsCsv && sprintsCsv !== sprintsUsed;
    return { piNum, startUsed, sprintsUsed, startCsv, sprintsCsv, source, cale, ecartDate, ecartCnt, ecart: ecartDate || ecartCnt };
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
