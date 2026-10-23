/**
 * Description et commentaires de la popin ticket : rendu ADF / wiki / HTML des commentaires, éditeur WYSIWYG en place de la description.
 *
 * Extrait de modal.js (3.253.0, > 2 900 lignes) — code déplacé à l'identique. Les dépendances vers
 * modal.js sont CIRCULAIRES mais sans effet au chargement (appelées dans des fonctions seulement) :
 * ne jamais utiliser un import de ./modal.js au niveau racine du module.
 */
import * as api from '../api.js';
import { esc, toast, parseWikiMarkup, promptModal } from '../utils.js';
import { refreshData } from './modal.js';

const _isWikiMarkup = s => /(?:^|\n)h[1-6]\. |(?:^|\n)[*#]+ |\{code[\s:{]/.test(s);

export function _renderCommentBody(body) {
    if (!body) return '<em class="text-muted text-xs">—</em>';
    if (typeof body === 'object') return _adfToHtml(body);
    if (typeof body === 'string') {
        if (body.startsWith('<')) return body;
        if (body.startsWith('{')) { try { return _adfToHtml(JSON.parse(body)); } catch { /* not JSON */ } }
        if (_isWikiMarkup(body)) return parseWikiMarkup(body);
        return esc(body).replace(/\n/g, '<br>');
    }
    return esc(String(body));
}

function _adfToHtml(doc) {
    if (!doc) return '';
    const render = (node) => {
        if (!node) return '';
        const kids = () => (node.content || []).map(render).join('');
        switch (node.type) {
            case 'doc': return kids();
            case 'paragraph': return `<p>${kids()}</p>`;
            case 'text': {
                let t = esc(node.text || '');
                for (const m of (node.marks || [])) {
                    if (m.type === 'strong') t = `<strong>${t}</strong>`;
                    else if (m.type === 'em') t = `<em>${t}</em>`;
                    else if (m.type === 'code') t = `<code>${t}</code>`;
                    else if (m.type === 'link') t = `<a href="${esc(m.attrs?.href||'#')}" target="_blank" rel="noopener">${t}</a>`;
                }
                return t;
            }
            case 'hardBreak': return '<br>';
            case 'bulletList': return `<ul>${kids()}</ul>`;
            case 'orderedList': return `<ol>${kids()}</ol>`;
            case 'listItem': return `<li>${kids()}</li>`;
            case 'blockquote': return `<blockquote>${kids()}</blockquote>`;
            case 'codeBlock': return `<pre><code>${kids()}</code></pre>`;
            case 'mention': return `<strong>@${esc((node.attrs?.text || node.attrs?.displayName || '').replace(/^@/, ''))}</strong>`;
            case 'emoji': return node.attrs?.text || node.attrs?.shortName || '';
            default: return kids();
        }
    };
    if (doc.type === 'doc' && doc.content) return doc.content.map(render).join('');
    return render(doc);
}
// ══════════════════════════════════════════════════════════════════════════════
// Description WYSIWYG inline editor
// ══════════════════════════════════════════════════════════════════════════════
export function _bindDescriptionEditor(container, ticket) {
    const viewEl    = container.querySelector('#desc-view');
    const editorEl  = container.querySelector('#desc-editor');
    const contentEl = container.querySelector('#desc-content');
    const toolbar   = container.querySelector('#desc-toolbar');
    if (!viewEl || !editorEl || !contentEl) return;

    const PLACEHOLDER = '<p class="text-muted text-sm desc-placeholder">Aucune description. Cliquez pour ajouter.</p>';
    let _html = _renderCommentBody(ticket.description) || '';

    const enterEdit = () => {
        contentEl.innerHTML = _html;
        viewEl.classList.add('hidden');
        editorEl.classList.remove('hidden');
        contentEl.focus();
        const range = document.createRange();
        range.selectNodeContents(contentEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };

    const exitEdit = () => {
        editorEl.classList.add('hidden');
        viewEl.classList.remove('hidden');
    };

    const save = async () => {
        const empty = !contentEl.textContent.trim();
        const html  = empty ? '' : contentEl.innerHTML;
        try {
            const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
            await fn(ticket.id, { description: html });
            _html = html;
            viewEl.innerHTML = html || PLACEHOLDER;
            exitEdit();
            await refreshData();
            toast('Description mise à jour', 'success');
        } catch (err) { toast(err.message, 'error'); }
    };

    container.querySelector('#desc-edit-btn')?.addEventListener('click', enterEdit);
    viewEl.addEventListener('click', enterEdit);
    container.querySelector('#desc-save')?.addEventListener('click', save);
    container.querySelector('#desc-cancel')?.addEventListener('click', () => {
        contentEl.innerHTML = _html;
        exitEdit();
    });
    contentEl.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); contentEl.innerHTML = _html; exitEdit(); }
    });
    toolbar?.addEventListener('mousedown', async e => {
        const btn = e.target.closest('.desc-tb-btn');
        if (!btn) return;
        e.preventDefault();
        if (btn.id === 'desc-tb-link' || btn.id === 'desc-tb-img') {
            // La modale (async) prend le focus → on sauve la sélection AVANT, on la restaure APRÈS.
            const sel = window.getSelection();
            const savedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
            const isImg = btn.id === 'desc-tb-img';
            const url = await promptModal(isImg ? 'URL de l\'image' : 'URL du lien', {
                type: 'url', placeholder: 'https://…', confirmLabel: 'Insérer', required: true,
            });
            contentEl.focus();
            if (savedRange) {
                const s = window.getSelection();
                s.removeAllRanges();
                s.addRange(savedRange);
            }
            if (url) document.execCommand(isImg ? 'insertImage' : 'createLink', false, url);
            return;
        }
        const cmd = btn.dataset.cmd, val = btn.dataset.val || null;
        if (cmd) document.execCommand(cmd, false, val);
        contentEl.focus();
    });
}
