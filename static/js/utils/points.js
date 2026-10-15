/**
 * Taille d'un ticket d'après ses story points — SOURCE UNIQUE de l'échelle de couleur.
 *
 * Paliers sur la suite de Fibonacci utilisée au Poker (1 2 3 5 8 13 21) : l'échelle est ABSOLUE
 * (même couleur pour 8 pts quelle que soit l'équipe) ; la comparaison à l'équipe se fait à côté,
 * en texte, avec `teamPointsMedian`. Classes `.pts-tone--<key>` (base-components.css), à poser
 * sur n'importe quel `.badge-points` ou pastille de points.
 */
export const POINTS_TONES = [
    { key: 'xs', max: 2,        label: 'Petit',      hint: '' },
    { key: 's',  max: 5,        label: 'Moyen',      hint: '' },
    { key: 'm',  max: 8,        label: 'Gros',       hint: 'à surveiller' },
    { key: 'l',  max: 13,       label: 'Très gros',  hint: 'à découper ?' },
    { key: 'xl', max: Infinity, label: 'Énorme',     hint: 'à découper' },
];

/** Palier d'un nombre de points ; `{ key: 'none' }` si non estimé. */
export function pointsTone(points) {
    const n = Number(points) || 0;
    if (n <= 0) return { key: 'none', label: 'Non estimé', hint: '' };
    return POINTS_TONES.find(t => n <= t.max);
}

/** Médiane des points > 0 d'une liste de tickets (null si aucun) — repère « taille habituelle ». */
export function teamPointsMedian(tickets) {
    const v = (tickets || []).map(t => Number(t.points) || 0).filter(n => n > 0).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
