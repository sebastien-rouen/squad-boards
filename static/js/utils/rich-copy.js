/**
 * Messages « Copier pour Slack » : mrkdwn → HTML enrichi + texte brut (3.227.0).
 *
 * Collé dans le compositeur Slack, du mrkdwn s'affiche TEL QUEL (« *Support · 20/10* », « <https://…|GCOM-1> ») :
 * Slack ne l'interprète qu'à l'envoi par l'API, pas au collage. Le presse-papiers porte donc les deux formats —
 * `text/html` (gras, italique, barré, code, liens cliquables : Slack, Teams et les mails les gardent) et
 * `text/plain` SANS AUCUN balisage en secours. Les générateurs de messages restent écrits en mrkdwn (une seule
 * source, lisible) ; seule la copie passe par ici (`copySlack`, utils.js).
 *
 * Reconnu : `*gras*` / `**gras**`, `_italique_`, `~barré~`, `` `code` ``, `<url|texte>`, `<url>`, `<!here>`,
 * `<#C123|canal>`, entités `&amp; &lt; &gt;`. Les marqueurs n'agissent qu'en bordure de mot : `snake_case`,
 * `:white_check_mark:` ou « 3 * 4 » restent du texte. Pur : aucun DOM.
 */

const _decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const _h = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const _LINK = /<((?:https?|mailto):[^|>\s]+)(?:\|([^>]*))?>|<!(here|channel|everyone)>|<#[A-Z0-9]+\|([^>]+)>|<@([A-Z0-9]+)>/g;
const _B = '(?<=^|[\\s([{"\'«—–\\-:,;.!?/])';         // avant un marqueur : début ou séparateur
const _A = '(?=$|[\\s)\\]}"\'»—–\\-:,;.!?/])';           // après : fin ou séparateur
const _INLINE = new RegExp([
    '`([^`\\n]+)`',
    `\\*\\*(\\S(?:[^*\\n]*?\\S)?)\\*\\*`,
    `${_B}\\*(\\S(?:[^*\\n]*?\\S)?)\\*${_A}`,
    `${_B}_(\\S(?:[^_\\n]*?\\S)?)_${_A}`,
    `${_B}~(\\S(?:[^~\\n]*?\\S)?)~${_A}`,
].join('|'), 'g');

/** Texte (déjà décodé) → { html, plain } avec le formatage en ligne, récursif (`*_gras italique_*`). */
function _inline(raw) {
    let html = '', plain = '', last = 0;
    for (const mt of raw.matchAll(_INLINE)) {
        html += _h(raw.slice(last, mt.index));
        plain += raw.slice(last, mt.index);
        const [, code, b2, b1, it, st] = mt;
        if (code != null) { html += `<code>${_h(code)}</code>`; plain += code; }
        else {
            const inner = _inline(b2 ?? b1 ?? it ?? st);
            const tag = b2 != null || b1 != null ? 'b' : it != null ? 'i' : 's';
            html += `<${tag}>${inner.html}</${tag}>`;
            plain += inner.plain;
        }
        last = mt.index + mt[0].length;
    }
    return { html: html + _h(raw.slice(last)), plain: plain + raw.slice(last) };
}

/**
 * Une ligne mrkdwn → { html, plain }. Les liens sont MIS DE CÔTÉ (jeton `\0n\0`) le temps du formatage en ligne,
 * puis réinsérés : un gras AUTOUR d'un lien (`*<url|GCOM-1>*`, Rapports) reste un gras.
 */
function _line(src) {
    const links = [];
    const masked = src.replace(_LINK, (...mt) => { links.push(mt); return `\u0000${links.length - 1}\u0000`; });
    const r = _inline(_decode(masked));
    const link = (mt, kind) => {
        const [, url, label, special, channel] = mt;
        if (url) {
            const shown = _inline(_decode(label || url.replace(/^mailto:/, '')));
            return kind === 'html' ? `<a href="${_h(url)}">${shown.html}</a>` : shown.plain;
        }
        const t = special ? `@${special}` : channel ? `#${channel}` : '@…';
        return kind === 'html' ? _h(t) : t;
    };
    const unmask = (str, kind) => str.replace(/\u0000(\d+)\u0000/g, (_, k) => link(links[+k], kind));
    const html = unmask(r.html, 'html'), plain = unmask(r.plain, 'plain');
    // Indentation conservée dans le HTML (un collage riche écrase les espaces de tête).
    const lead = (src.match(/^ +/) || [''])[0].length;
    return { html: lead ? '&nbsp;'.repeat(lead) + html.replace(/^ +/, '') : html, plain };
}

/** mrkdwn → texte brut sans balisage (liens : leur texte seul). */
export function mrkdwnToPlain(md) {
    return String(md ?? '').split('\n').map(l => _line(l).plain).join('\n');
}

/** mrkdwn → HTML (une `<div>` par ligne, lignes vides conservées). */
export function mrkdwnToHtml(md) {
    return String(md ?? '').split('\n')
        .map(l => { const h = _line(l).html; return h.trim() ? `<div>${h}</div>` : '<div><br></div>'; })
        .join('');
}
