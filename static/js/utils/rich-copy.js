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

/** Une ligne mrkdwn → { html, plain } : liens d'abord (leur texte peut contenir des marqueurs), puis le reste. */
function _line(src) {
    let html = '', plain = '', last = 0;
    const text = s => { const r = _inline(_decode(s)); html += r.html; plain += r.plain; };
    for (const mt of src.matchAll(_LINK)) {
        text(src.slice(last, mt.index));
        const [, url, label, special, channel] = mt;
        if (url) {
            const shown = _decode(label || url.replace(/^mailto:/, ''));
            html += `<a href="${_h(url)}">${_inline(shown).html}</a>`;
            plain += _inline(shown).plain;
        } else {
            const t = special ? `@${special}` : channel ? `#${channel}` : '@…';
            html += _h(t); plain += t;
        }
        last = mt.index + mt[0].length;
    }
    text(src.slice(last));
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
