/**
 * Conversion Atlassian Wiki Markup → HTML (descriptions JIRA).
 *
 * Extrait de utils.js (v3.141.5) — utils.js reste le point d'entrée et ré-exporte tout,
 * aucun import des vues n'a changé.
 */

import { esc } from './dom.js';

// ── Atlassian Wiki Markup → HTML ──────────────────────────────────────────────

export function parseWikiMarkup(text) {
    if (!text || typeof text !== 'string') return '';

    const blocks = [];
    const ph = i => `\x02B${i}\x02`;

    // {code[:attrs]} … {code}
    text = text.replace(/\{code(?::([^}]*))?\}([\s\S]*?)\{code\}/gi, (_, attrs, body) => {
        const lang = (attrs || '').match(/(?:^|language=)([a-z]+)/i)?.[1] || '';
        const idx = blocks.length;
        blocks.push(`<pre><code class="lang-${esc(lang)}">${esc(body.replace(/^\n/, ''))}</code></pre>`);
        return ph(idx);
    });
    // {noformat} … {noformat}
    text = text.replace(/\{noformat[^}]*\}([\s\S]*?)\{noformat\}/gi, (_, body) => {
        const idx = blocks.length;
        blocks.push(`<pre>${esc(body.replace(/^\n/, ''))}</pre>`);
        return ph(idx);
    });
    // {quote} … {quote}
    text = text.replace(/\{quote\}([\s\S]*?)\{quote\}/gi, (_, body) => {
        const idx = blocks.length;
        blocks.push(`<blockquote>${parseWikiMarkup(body.trim())}</blockquote>`);
        return ph(idx);
    });
    // Panel macros: {info}, {note}, {warning}, {tip}, {panel}
    text = text.replace(/\{(info|note|warning|tip|panel)(?::[^}]*)?\}([\s\S]*?)\{\/?\1\}/gi, (_, type, body) => {
        const cls = type === 'warning' ? 'warning' : 'info';
        const idx = blocks.length;
        blocks.push(`<div class="adf-panel adf-panel-${cls}">${parseWikiMarkup(body.trim())}</div>`);
        return ph(idx);
    });

    const lines = text.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.indexOf('\x02') >= 0) { out.push(line); i++; continue; }
        if (/^----+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

        const hm = line.match(/^h([1-6])\.\s+(.*)/);
        if (hm) { out.push(`<h${hm[1]}>${_wikiInline(hm[2])}</h${hm[1]}>`); i++; continue; }

        if (/^[*#]/.test(line)) {
            const chunk = [];
            while (i < lines.length && /^[*#]/.test(lines[i]) && lines[i].indexOf('\x02') < 0) chunk.push(lines[i++]);
            out.push(_wikiList(chunk));
            continue;
        }

        if (/^\|/.test(line)) {
            const chunk = [];
            while (i < lines.length && /^\|/.test(lines[i])) chunk.push(lines[i++]);
            out.push(_wikiTable(chunk));
            continue;
        }

        if (!line.trim()) { i++; continue; }

        out.push(`<p>${_wikiInline(line)}</p>`);
        i++;
    }

    let result = out.join('');
    // eslint-disable-next-line no-control-regex -- \x02 = sentinelle interne (placeholders de blocs)
    result = result.replace(/\x02B(\d+)\x02/g, (_, n) => blocks[+n] || '');
    return result;
}

function _wikiInline(text) {
    if (!text) return '';
    let s = esc(text);
    s = s.replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '<strong>$1</strong>');
    s = s.replace(/_(\S(?:[^_\n]*\S)?)_/g, '<em>$1</em>');
    s = s.replace(/\+(\S(?:[^+\n]*\S)?)\+/g, '<u>$1</u>');
    s = s.replace(/(?<![a-zA-Z0-9])-(\S(?:[^-\n]*?\S)?)-(?![a-zA-Z0-9])/g, '<s>$1</s>');
    s = s.replace(/\{\{([^}\n]+)\}\}/g, '<code>$1</code>');
    s = s.replace(/\{color:([^}]+)\}(.*?)\{color\}/g, '<span style="color:$1">$2</span>');
    s = s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\[([^\]]+)\]/g, (_, inner) =>
        inner.startsWith('~') ? `<strong>@${inner.slice(1)}</strong>`
            : `<a href="${inner}" target="_blank" rel="noopener">${inner}</a>`
    );
    s = s.replace(/!([^!\n|]+)(?:\|[^!]*)?\!/g, '<img src="$1" style="max-width:100%" alt="">');
    s = s.replace(/\\\\/g, '<br>');
    return s;
}

function _wikiList(lines) {
    const items = lines.map(l => {
        const m = l.match(/^([*#]+)\s+(.*)/);
        return m ? { depth: m[1].length, tag: m[1][m[1].length - 1] === '#' ? 'ol' : 'ul', text: m[2] } : null;
    }).filter(Boolean);
    if (!items.length) return '';
    let html = '';
    const stack = [];
    for (const item of items) {
        while (stack.length && stack[stack.length - 1].depth >= item.depth) html += `</${stack.pop().tag}>`;
        if (!stack.length || stack[stack.length - 1].depth < item.depth) {
            html += `<${item.tag}>`;
            stack.push({ tag: item.tag, depth: item.depth });
        }
        html += `<li>${_wikiInline(item.text)}</li>`;
    }
    while (stack.length) html += `</${stack.pop().tag}>`;
    return html;
}

function _wikiTable(lines) {
    let html = '<table>';
    for (const line of lines) {
        const isHeader = line.startsWith('||');
        const clean = line.replace(/^\|+/, '').replace(/\|+\s*$/, '');
        const cells = isHeader ? clean.split('||') : clean.split('|');
        const tag = isHeader ? 'th' : 'td';
        html += '<tr>' + cells.map(c => `<${tag}>${_wikiInline(c.trim())}</${tag}>`).join('') + '</tr>';
    }
    return html + '</table>';
}
