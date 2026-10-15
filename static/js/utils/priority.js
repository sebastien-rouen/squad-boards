/**
 * Priorité d'un ticket — SOURCE UNIQUE de la normalisation et du badge.
 *
 * La base mélange deux vocabulaires : les libellés JIRA bruts posés par la synchro
 * (« 2. haute », « 3. moyenne », « 4. basse »…) et les clés internes écrites par l'édition
 * inline (`critical` / `high` / `medium` / `low`). Un lookup exact sur les clés internes
 * faisait tomber TOUS les tickets JIRA en « medium » (bleu) — d'où `priorityKey()`.
 */
import { esc } from './dom.js';

/** Ordre d'affichage (du plus urgent au moins urgent), niveau de barres, libellé FR. */
export const PRIORITY_META = {
    critical: { label: 'Critique', lvl: 4 },
    high:     { label: 'Haute',    lvl: 3 },
    medium:   { label: 'Moyenne',  lvl: 2 },
    low:      { label: 'Basse',    lvl: 1 },
};

/**
 * Clé interne d'une priorité, quel que soit son vocabulaire. Repli `medium` (même défaut
 * que l'édition) pour une valeur vide ; une valeur non reconnue est AUSSI `medium` mais
 * `priorityBadge` affiche alors le libellé brut, pour ne rien masquer.
 * @returns {'critical'|'high'|'medium'|'low'}
 */
export function priorityKey(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (!s) return 'medium';
    if (PRIORITY_META[s]) return s;
    if (/^[01]\b|critique|bloquant|blocker|highest|urgent/.test(s)) return 'critical';
    if (/^2\b|haute|high|majeur/.test(s)) return 'high';
    if (/^[45]\b|basse|low|mineur|trivial/.test(s)) return 'low';
    return 'medium';
}

/** Valeur reconnue (clé interne ou libellé JIRA connu) ? Sert à afficher le brut sinon. */
const _known = raw => {
    const s = String(raw || '').toLowerCase().trim();
    return !s || !!PRIORITY_META[s] || /^[0-5]\b|critique|bloquant|blocker|highest|urgent|haute|high|majeur|moyenne|medium|normal|basse|low|mineur|trivial/.test(s);
};

/**
 * Badge de PRIORITÉ — même famille visuelle que `typeBadge` (fond lavé + barres de niveau).
 * Classes `.badge .badge-prio .badge-prio--<clé>` (base-components.css).
 * @param {string} raw  priorité telle qu'en base
 * @param {object} [opts]  `extra` (classes), `attrs` (HTML déjà échappé), `size` ('2xs' | 'sm')
 */
export function priorityBadge(raw, opts = {}) {
    const key   = priorityKey(raw);
    const label = _known(raw) ? PRIORITY_META[key].label : String(raw);
    const size  = opts.size ? ` badge-${opts.size}` : '';
    const extra = opts.extra ? ` ${opts.extra}` : '';
    const attrs = opts.attrs ? ` ${opts.attrs}` : '';
    const bars  = '<i></i><i></i><i></i>';
    return `<span class="badge badge-prio badge-prio--${key}${size}${extra}"${attrs}><span class="badge-prio-bars" data-lvl="${PRIORITY_META[key].lvl}" aria-hidden="true">${bars}</span>${esc(label)}</span>`;
}
