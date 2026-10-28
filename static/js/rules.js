/**
 * Règles métier réglables (3.272.0) — SOURCE UNIQUE des seuils partagés, éditées dans Paramètres → Règles métier.
 * Chaque règle est un réglage de projet (project-settings.js) ; `rule(key)` renvoie la valeur effective
 * (saisie valide, sinon défaut). Ajouter une règle ici suffit à l'afficher dans l'écran.
 */
import { projectStorage } from './project-settings.js';

export const RULES = Object.freeze([
    { key: 'sb-dash-stale-days', group: '🐌 Flux', label: 'Ticket stagnant après', unit: 'jours', def: 5, min: 1, max: 60,
        desc: 'En cours sans mouvement depuis ce délai : Dashboard, alerte de l\'info-panel, Santé, TV.' },
    { key: 'sb-atlas-expert-min', group: '🧬 Atlas', label: 'Sachant à partir du niveau', unit: '', def: 2, min: 1, max: 4,
        desc: 'Niveau d\'une compétence qui fait d\'une personne un « sachant » (couverture, bus factor, binômes).' },
    { key: 'sb-atlas-away-days', group: '🧬 Atlas', label: 'Absence « bientôt »', unit: 'jours', def: 14, min: 1, max: 90,
        desc: 'Fenêtre où une absence prévue signale un sachant bientôt indisponible (🌴).' },
    { key: 'sb-poker-scale', group: '🃏 Planning poker', label: 'Cartes', unit: '', def: '1, 2, 3, 5, 8, 13, 21, ?', text: true,
        desc: 'Valeurs séparées par des virgules : nombres entiers (ils deviennent des story points), « ? » et « ☕ ». 3 à 15 cartes.' },
]);
const BY_KEY = Object.fromEntries(RULES.map(r => [r.key, r]));

// Carte de poker acceptée (même motif que le serveur, app/routers/poker.py)
export const POKER_CARD_RE = /^(\d{1,3}|\?|☕)$/;
export const parsePokerScale = txt => [...new Set(String(txt || '').split(',').map(s => s.trim()).filter(s => POKER_CARD_RE.test(s)))];

/** Valeur effective d'une règle : nombre borné, ou texte (cartes de poker) validé ; sinon le défaut. */
export function rule(key) {
    const r = BY_KEY[key];
    if (!r) return undefined;
    const raw = (projectStorage.getItem(key) || '').trim();
    if (r.text) {
        const cards = parsePokerScale(raw);
        return cards.length >= 3 && cards.length <= 15 ? cards : parsePokerScale(r.def);
    }
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n >= r.min && n <= r.max ? n : r.def;
}
