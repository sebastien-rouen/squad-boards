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

const _escH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/**
 * Numéro de ticket Slack, lien JIRA si la base est connue (`ctx.jiraUrl`), suivi d'une espace — à poser devant le
 * titre (3.228.0 : les listes de tickets des rapports ne montraient que les titres, sans numéro ni lien).
 * '' sans id : rien n'est ajouté.
 */
export const TK = (t, base = '') => {
    const id = t?.id || t?.key;
    if (!id) return '';
    return base ? `<a class="s-link" href="${_escH(`${base.replace(/\/$/, '')}/browse/${id}`)}" target="_blank" rel="noopener">${_escH(id)}</a> ` : `${_escH(id)} `;
};

/**
 * Aperçu Slack d'une section (HTML des primitives ci-dessus) → mrkdwn, pour `copySlack` (3.228.0).
 * La copie prenait le `textContent` de l'aperçu : gras et adresses des liens perdus. Désormais l'aperçu est
 * traduit en mrkdwn (`s-header` / `s-bold` → *gras*, `s-link` / `<a>` → <url|texte>, `s-code` → `code`,
 * `s-divider` / `<br>` → saut de ligne, autres balises → leur texte), puis copié en texte enrichi + texte brut.
 * Les retours à la ligne de l'aperçu (`white-space: pre-wrap`) sont conservés tels quels. Pur : chaîne → chaîne.
 */
export function previewToMrkdwn(html) {
    const attr = v => String(v).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    // *gras* / `code` exigent un contenu sans espace en bordure : les espaces sortent du marqueur.
    const wrap = (mk, inner) => {
        const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
        return m[2] ? `${m[1]}${mk}${m[2]}${mk}${m[3]}` : inner;
    };
    let s = String(html ?? '')
        .replace(/<hr\b[^>]*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n');
    // Des balises les plus internes vers l'extérieur, jusqu'à stabilité (spans imbriqués).
    // Contenu : texte, ou liens DÉJÀ traduits (`<https://…|…>`) — sinon un gras autour d'un lien resterait en HTML.
    const INNER = /<(span|div|a|b|strong|code|i|em)\b([^>]*)>((?:[^<]|<(?:https?|mailto):[^>]*>)*)<\/\1>/i;
    for (let guard = 0; guard < 500 && INNER.test(s); guard++) {
        s = s.replace(INNER, (_, tag, attrs, inner) => {
            const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
            const href = (attrs.match(/href="([^"]*)"/) || [])[1];
            const t = tag.toLowerCase();
            if (t === 'a' && href) return `<${attr(href)}|${inner.trim() || attr(href)}>`.replace(/^<([^|]+)\|\1>$/, '<$1>');
            if (/\bs-header\b/.test(cls)) return `${wrap('*', inner)}\n`;
            if (/\bs-bold\b/.test(cls) || t === 'b' || t === 'strong') return wrap('*', inner);
            if (/\bs-code\b/.test(cls) || t === 'code') return wrap('`', inner);
            if (t === 'i' || t === 'em') return wrap('_', inner);
            return inner;   // s-emoji, s-muted, s-badge, s-quote… : leur texte
        });
    }
    // Liens déjà traduits : `<https://…|…>` doivent survivre au retrait des balises restantes.
    s = s.replace(/<(?!(?:https?|mailto):)[^>]*>/gi, '');
    return s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n').trim();
}

// Statuts Confluence (`CS`) : leurs couleurs vivent dans le CSS de l'aperçu, perdu au collage → styles en ligne.
const _CS_STYLE = {
    green: 'background:#e3fcef;color:#006644', red: 'background:#ffebe6;color:#bf2600', blue: 'background:#deebff;color:#0747a6',
    yellow: 'background:#fffae6;color:#ff8b00', gray: 'background:#f4f5f7;color:#5e6c84',
};

/**
 * Aperçu Confluence d'une section → HTML à coller dans Confluence (3.228.0). La copie prenait le `textContent` :
 * titres, tableaux, statuts colorés et liens disparaissaient. Ici : statuts `CS` en styles EN LIGNE (pastille),
 * attributs propres à l'aperçu retirés (`class`, `target`, `rel`), le reste (h2 / h3 / table / a / b) tel quel —
 * l'éditeur Confluence le convertit en titres, tableaux et liens. Pur : chaîne → chaîne.
 */
export function confluenceClipboardHtml(html) {
    return String(html ?? '')
        .replace(/<span class="c-status c-(green|red|blue|yellow|gray)">/g, (_, c) =>
            `<span style="${_CS_STYLE[c]};font-weight:600;font-size:0.85em;padding:1px 6px;border-radius:3px;text-transform:uppercase">`)
        .replace(/\s(?:class|target|rel)="[^"]*"/g, '');
}
