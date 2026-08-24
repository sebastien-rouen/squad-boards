/**
 * Config PI locale (`localStorage` `pi-cfg-<N>`) — une entrée par PI.
 *
 * Deux sources l'alimentent et ne pèsent pas le même poids :
 *   • **Paramètres → Sprint & PI** : saisie explicite de l'utilisateur → `manual.<champ> = true`.
 *     Elle fait foi et n'est jamais recouverte.
 *   • **Import CSV Congés** : valeurs déduites du fichier RH (1re et dernière colonne date) →
 *     `startDateFromCsv` / `sprintsPerPIFromCsv`. L'import COMPLÈTE (il ne remplit les clés
 *     effectives que si elles sont vides), il n'écrase jamais un PI déjà configuré : l'ancrage
 *     d'un PI dont la rotation est planifiée ne doit pas bouger dans le dos de l'utilisateur.
 *
 * Forme : { number, name, startDate, sprintsPerPI, sprintDuration, pipDates,
 *           startDateFromCsv, sprintsPerPIFromCsv, manual: { startDate, sprintsPerPI, … } }
 */

export const piCfgKey = (piNum) => `pi-cfg-${piNum}`;

/** Config d'un PI, ou null si absente / illisible. */
export function loadPiCfg(piNum) {
    if (!piNum) return null;
    try { return JSON.parse(localStorage.getItem(piCfgKey(piNum)) || 'null'); } catch { return null; }
}

/**
 * Écrit en FUSIONNANT avec l'existant — ne jamais remplacer l'objet : il porte aussi les
 * valeurs déduites du CSV et les jours PIP qu'un enregistrement du formulaire effacerait.
 * @param {object}  patch            champs à écrire
 * @param {boolean} [opts.manual]    marque les champs fournis comme saisis à la main
 */
export function savePiCfg(piNum, patch, { manual = false } = {}) {
    if (!piNum) return null;
    const cur = loadPiCfg(piNum) || {};
    const cfg = { ...cur, ...patch };
    if (manual) {
        cfg.manual = { ...(cur.manual || {}) };
        for (const champ of ['startDate', 'sprintsPerPI', 'sprintDuration']) {
            if (patch[champ]) cfg.manual[champ] = true;
        }
    }
    localStorage.setItem(piCfgKey(piNum), JSON.stringify(cfg));
    return cfg;
}

/**
 * Nombre d'itérations d'un PI selon la config locale seule (hors JIRA).
 * @returns {{value: number, source: 'manuel'|'csv'|'heritee'}|null}
 */
export function piSprintCount(piNum) {
    const cfg = loadPiCfg(piNum);
    if (!cfg) return null;
    if (cfg.manual?.sprintsPerPI && cfg.sprintsPerPI) return { value: cfg.sprintsPerPI, source: 'manuel' };
    if (cfg.sprintsPerPIFromCsv) return { value: cfg.sprintsPerPIFromCsv, source: 'csv' };
    if (cfg.sprintsPerPI) return { value: cfg.sprintsPerPI, source: 'heritee' };
    return null;
}

/** Numéros de PI ayant une config locale, triés croissant. */
export function listPiCfgNumbers() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        const m = k.match(/^pi-cfg-(\d+)$/);
        if (m) out.push(parseInt(m[1], 10));
    }
    return out.sort((a, b) => a - b);
}
