/**
 * Météo des équipes — l'ÉCHELLE, et rien d'autre.
 *
 * Cinq niveaux (☀️ ⛅ 🌧️ ⛈️ ⚪) et deux façons d'y arriver :
 *   - `weatherOf(score)`         — un score ABSOLU 0–100 (santé, SLA, mood × 20) ;
 *   - `weatherRel(pct, timePct)` — un avancement RELATIF au temps écoulé (sprint, PI) :
 *                                  c'est l'écart en points qui décide, pas le pourcentage.
 *
 * Les seuils sont GLOBAUX : une équipe ne se choisit pas une météo plus clémente, sinon
 * deux ⛅ ne veulent plus dire la même chose et la matrice cesse d'être lisible en cinq
 * secondes — sa seule raison d'exister. Surcharge possible via `sb-meteo-thresholds`
 * (JSON `{sun, cloud, rain}`), pour toute l'organisation.
 *
 * Module PUR (aucune dépendance) : exporté par le barrel `utils.js`, testable tel quel.
 */

export const METEO_DEFAULT_THRESHOLDS = Object.freeze({ sun: 80, cloud: 60, rain: 40 });

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
      formula: 'points réalisés ÷ points engagés, comparé au temps écoulé', source: 'engagement = belongedToSprint (reports compris), réalisé = terminé ET encore dans le sprint' },
    { key: 'pi', icon: '🗓️', label: 'PI', kind: 'rel', hint: 'points réalisés / périmètre du PI, comparé au temps écoulé du PI',
      formula: 'points réalisés ÷ périmètre du PI, comparé au temps écoulé du PI', source: 'belongedToPi, fenêtre = sprints de l\'équipe dans le PI' },
    { key: 'health', icon: '🛡️', label: 'Santé', kind: 'abs', hint: 'score de santé 0–100 (anomalies pondérées, normalisées par tickets actifs)',
      formula: '100 − (anomalies pondérées ÷ tickets actifs) × 35', source: 'les 7 anomalies de Santé — même formule que le score de la vue' },
    { key: 'sla', icon: '🎧', label: 'SLA', kind: 'abs', hint: 'part des tickets terminés sous le seuil de cycle time',
      formula: 'tickets terminés sous le seuil ÷ tickets terminés', source: 'card SLA Review (seuil = P85 du PI précédent, ou manuel)' },
    { key: 'mood', icon: '😊', label: 'Mood', kind: 'abs', hint: 'moyenne des votes Mood du sprint (1 → 5)',
      formula: 'moyenne des votes du sprint × 20', source: 'votes Mood / ROTI du sprint actif (Santé → Sprints du PI)' },
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
