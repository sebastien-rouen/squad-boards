/**
 * Primitives de formatage partagées par les sections de rapport (Slack / Confluence).
 *
 * Extraites de reports.js pour que les sections vivant dans leur propre module
 * (reports-pi.js…) les réutilisent SANS importer reports.js — un import croisé
 * créerait un cycle, et ces helpers étant des `const` fléchées, la TDZ le ferait
 * planter à l'exécution plutôt qu'au chargement.
 */

/** Gras Slack. */
export const B = t => `<span class="s-bold">${t}</span>`;
/** Emoji Slack (taille/alignement homogènes). */
export const E = t => `<span class="s-emoji">${t}</span>`;
/** Badge Slack coloré — c = green | yellow | red | blue | gray. */
export const SB = (t, c) => `<span class="s-badge s-badge-${c}">${t}</span>`;
/** Statut Confluence coloré — mêmes couleurs que SB. */
export const CS = (t, c) => `<span class="c-status c-${c}">${t}</span>`;
