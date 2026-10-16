/**
 * Météo des équipes — l'ÉCHELLE, et rien d'autre.
 *
 * Cinq niveaux (☀️ ⛅ 🌧️ ⛈️ ⚪) et trois façons d'y arriver :
 *   - `weatherOf(score)`         — un score ABSOLU 0–100 (santé, SLA, mood × 20) ;
 *   - `weatherRel(pct, timePct)` — un avancement RELATIF au temps écoulé (sprint, PI) :
 *                                  c'est l'écart en points qui décide, pas le pourcentage ;
 *   - `weatherChurn(pct)`        — un taux de MOUVEMENT (périmètre) : plus c'est bas, mieux
 *                                  c'est — seuils propres (`sb-meteo-scope`), eux aussi globaux.
 *
 * Les seuils sont GLOBAUX : une équipe ne se choisit pas une météo plus clémente, sinon
 * deux ⛅ ne veulent plus dire la même chose et la matrice cesse d'être lisible en cinq
 * secondes — sa seule raison d'exister. Surcharge possible via `sb-meteo-thresholds`
 * (JSON `{sun, cloud, rain}`), pour toute l'organisation.
 *
 * Module PUR (aucune dépendance) : exporté par le barrel `utils.js`, testable tel quel.
 */

export const METEO_DEFAULT_THRESHOLDS = Object.freeze({ sun: 80, cloud: 60, rain: 40 });

/**
 * 📐 Périmètre — plafonds de mouvement (% d'ajouts + retraits rapportés à l'engagement au
 * lancement) : ≤ sun ☀️ · ≤ cloud ⛅ · ≤ rain 🌧️ · au-delà ⛈️. Échelle INVERSE des scores
 * (un taux bas est bon), d'où des seuils à part plutôt qu'un « 100 − x » illisible.
 */
export const METEO_SCOPE_DEFAULT_THRESHOLDS = Object.freeze({ sun: 10, cloud: 25, rain: 40 });

/** Écart d'avancement (points de %) toléré autour du temps écoulé avant de changer de niveau. */
export const METEO_REL_BAND = 10;

/**
 * Tolérance de démarrage : sous ce pourcentage de temps écoulé, un avancement à 0 % est normal
 * (le sprint vient de commencer) — on affiche ⛅, jamais 🌧️. Sans elle, J1 était toujours un
 * orage (réserve notée dans static/mockups/refonte/README.md).
 */
export const METEO_START_TOLERANCE = 15;

/**
 * Les cinq domaines de la matrice — libellé, formule et source. Lus par la matrice
 * (meteo_matrix.js) ET par l'aide « ? » (help_popover.js) : une seule définition, jamais deux
 * textes qui divergent. `kind` : 'rel' = comparé au temps écoulé, 'abs' = score sur 100.
 */
export const METEO_DOMAINS = Object.freeze([
    { key: 'sprint', icon: '🏃', label: 'Sprint', kind: 'rel', hint: 'points réalisés / engagés, comparé au temps écoulé du sprint',
      formula: 'points réalisés ÷ points engagés, comparé au temps écoulé', source: 'engagement = engagedInSprint (reports compris, retraits d\'avant-lancement exclus), réalisé = terminé ET encore dans le sprint' },
    { key: 'pi', icon: '🗓️', label: 'PI', kind: 'rel', hint: 'points réalisés / périmètre du PI, comparé au temps écoulé du PI',
      formula: 'points réalisés ÷ périmètre du PI, comparé au temps écoulé du PI', source: 'engagedInPi (tickets dans un sprint du PI, reports compris, sans retirés ni « Clos sans suite » — comme le rapport JIRA), fenêtre = sprints de l\'équipe dans le PI' },
    { key: 'health', icon: '🛡️', label: 'Santé', kind: 'abs', hint: 'score de santé 0–100 (anomalies pondérées, normalisées par tickets actifs)',
      formula: '100 − (anomalies pondérées ÷ tickets actifs) × 35', source: 'les 7 anomalies de Santé — même formule que le score de la vue' },
    { key: 'sla', icon: '🎧', label: 'SLA', kind: 'abs', hint: 'part des tickets terminés sous le seuil de cycle time',
      formula: 'tickets terminés sous le seuil ÷ tickets terminés', source: 'card SLA Review (seuil = P85 du PI précédent, ou manuel)' },
    { key: 'mood', icon: '😊', label: 'Mood', kind: 'abs', hint: 'moyenne des votes Mood du sprint (1 → 5)',
      formula: 'moyenne des votes du sprint × 20', source: 'votes Mood / ROTI du sprint actif (Santé → Sprints du PI)' },
    // `inLevel: false` — INDICATIF : affiché, mais hors du niveau global de l'équipe (le pire
    // des domaines). Mesuré sur le PI 31 : 10 équipes sur 13 en 🌧️/⛈️ (sprints remplis APRÈS
    // leur démarrage dans JIRA) — l'inclure aurait mis le Dashboard et la TV à l'orage.
    { key: 'scope', icon: '📐', label: 'Périmètre', kind: 'churn', inLevel: false, hint: 'tickets ajoutés + retirés en cours de sprint, rapportés à l\'engagement au lancement (sprints démarrés du PI)',
      formula: '(ajouts + retraits en cours de sprint) ÷ tickets engagés au lancement', source: 'scopeStability (sprint-scope.js) — mêmes chiffres que « nb début / nb actuel » de Santé ; un report à la clôture n\'est pas un retrait' },
]);

export const METEO_GLYPH = Object.freeze({ sun: '☀️', cloud: '⛅', rain: '🌧️', storm: '⛈️', none: '⚪' });
export const METEO_LABEL = Object.freeze({ sun: 'Beau', cloud: 'Variable', rain: 'Attention', storm: 'Critique', none: 'Pas de donnée' });

/** Du pire au meilleur — `none` n'entre jamais dans un classement. */
const ORDER = ['storm', 'rain', 'cloud', 'sun'];

/** Seuils effectifs : surcharge localStorage (validée) sinon défauts. */
export function meteoThresholds(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    try {
        const raw = storage?.getItem('sb-meteo-thresholds');
        if (!raw) return METEO_DEFAULT_THRESHOLDS;
        const t = JSON.parse(raw);
        const ok = ['sun', 'cloud', 'rain'].every(k => Number.isFinite(t?.[k]))
            && t.sun > t.cloud && t.cloud > t.rain && t.rain > 0 && t.sun <= 100;
        return ok ? { sun: t.sun, cloud: t.cloud, rain: t.rain } : METEO_DEFAULT_THRESHOLDS;
    } catch {
        return METEO_DEFAULT_THRESHOLDS;
    }
}

/** Plafonds du domaine 📐 Périmètre : surcharge `sb-meteo-scope` (validée) sinon défauts. */
export function meteoScopeThresholds(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    try {
        const raw = storage?.getItem('sb-meteo-scope');
        if (!raw) return METEO_SCOPE_DEFAULT_THRESHOLDS;
        const t = JSON.parse(raw);
        const ok = ['sun', 'cloud', 'rain'].every(k => Number.isFinite(t?.[k]))
            && t.sun >= 0 && t.sun < t.cloud && t.cloud < t.rain && t.rain <= 200;
        return ok ? { sun: t.sun, cloud: t.cloud, rain: t.rain } : METEO_SCOPE_DEFAULT_THRESHOLDS;
    } catch {
        return METEO_SCOPE_DEFAULT_THRESHOLDS;
    }
}

/** Taux de mouvement (%) → niveau : plus c'est bas, mieux c'est. `null` = pas de donnée. */
export function weatherChurn(pct, thresholds = meteoScopeThresholds()) {
    if (pct == null || !Number.isFinite(pct)) return 'none';
    if (pct <= thresholds.sun) return 'sun';
    if (pct <= thresholds.cloud) return 'cloud';
    if (pct <= thresholds.rain) return 'rain';
    return 'storm';
}

/**
 * Tendance d'un taux de mouvement d'un PI à l'autre. Plus bas = mieux, donc ↘ est une
 * AMÉLIORATION. Sous `tolerance` points d'écart : stable (→) — un ticket de plus ou de moins
 * sur un petit périmètre ne fait pas une tendance.
 * @returns {null|{ delta, arrow, label, better: boolean|null }}
 */
export function churnTrend(cur, prev, tolerance = 3) {
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
    const delta = cur - prev;
    if (Math.abs(delta) < tolerance) return { delta, arrow: '→', label: 'stable', better: null };
    return delta < 0
        ? { delta, arrow: '↘', label: 'en baisse — mieux', better: true }
        : { delta, arrow: '↗', label: 'en hausse — moins bien', better: false };
}

/** Score absolu (0–100) → niveau. `null`/`undefined`/NaN = pas de donnée. */
export function weatherOf(score, thresholds = meteoThresholds()) {
    if (score == null || !Number.isFinite(score)) return 'none';
    if (score >= thresholds.sun) return 'sun';
    if (score >= thresholds.cloud) return 'cloud';
    if (score >= thresholds.rain) return 'rain';
    return 'storm';
}

/**
 * Avancement relatif au temps écoulé → niveau.
 * écart = pct − timePct : ≥ +band ☀️ · dans ±band ⛅ · jusqu'à −2·band 🌧️ · au-delà ⛈️.
 * Sous `startTolerance` % de temps écoulé, on ne juge pas encore (⛅ au minimum).
 */
export function weatherRel(pct, timePct, { band = METEO_REL_BAND, startTolerance = METEO_START_TOLERANCE } = {}) {
    if (pct == null || timePct == null || !Number.isFinite(pct) || !Number.isFinite(timePct)) return 'none';
    const delta = pct - timePct;
    if (delta >= band) return 'sun';
    if (timePct < startTolerance) return 'cloud';
    if (delta >= -band) return 'cloud';
    if (delta >= -2 * band) return 'rain';
    return 'storm';
}

/** Le niveau d'un ensemble = le PIRE de ses niveaux — une moyenne cacherait un orage. */
export function worstLevel(levels) {
    const known = (levels || []).filter(l => ORDER.includes(l));
    if (!known.length) return 'none';
    return known.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
}

/** Pourcentage de temps écoulé entre deux dates ISO (borné 0–100), `null` si dates inconnues. */
export function elapsedPct(startIso, endIso, now = Date.now()) {
    const p = s => { const d = String(s || '').slice(0, 10); return d ? new Date(`${d}T00:00:00`).getTime() : NaN; };
    const a = p(startIso), b = p(endIso);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    return Math.round((Math.max(0, Math.min(b - a, now - a)) / (b - a)) * 100);
}
