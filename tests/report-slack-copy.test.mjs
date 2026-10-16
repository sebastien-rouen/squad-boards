/**
 * Rapports, format Slack → copie (3.228.0) : l'aperçu HTML des sections (primitives de reports-fmt.js) est traduit
 * en mrkdwn puis copié en texte enrichi. La copie prenait le `textContent` : gras et adresses des liens perdus.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let fmt, rc;
before(async () => {
    fmt = await import('../static/js/views/reports-fmt.js');
    rc = await import('../static/js/utils/rich-copy.js');
});

describe('previewToMrkdwn', () => {
    test('en-tête, gras, emoji, séparateur, texte atténué et badge', () => {
        const { B, E, SB } = fmt;
        const html = `<div class="s-header">${E('🗺️')} Roadmap · Fuego</div><hr class="s-divider">${B('Sprint 31.3')} : 12 pts ${SB('OK', 'green')}\n<span class="s-muted">fin le 17/10</span>`;
        assert.equal(fmt.previewToMrkdwn(html), '*🗺️ Roadmap · Fuego*\n\n*Sprint 31.3* : 12 pts OK\nfin le 17/10');
    });
    test('liens conservés (adresse + texte), y compris sous un gras ; entités gardées pour le convertisseur', () => {
        const html = '<span class="s-bold"><a class="s-link" href="https://jira/browse/G-1?a=1&amp;b=2" target="_blank">G-1</a></span> Titre &lt;x&gt; &amp; co';
        const md = fmt.previewToMrkdwn(html);
        assert.equal(md, '*<https://jira/browse/G-1?a=1&b=2|G-1>* Titre &lt;x&gt; &amp; co');
        assert.equal(rc.mrkdwnToPlain(md), 'G-1 Titre <x> & co');
        assert.equal(rc.mrkdwnToHtml(md), '<div><b><a href="https://jira/browse/G-1?a=1&amp;b=2">G-1</a></b> Titre &lt;x&gt; &amp; co</div>');
    });
    test('lien dont le texte est l\'adresse : forme courte', () => {
        assert.equal(fmt.previewToMrkdwn('<a class="s-link" href="https://x.fr/p">https://x.fr/p</a>'), '<https://x.fr/p>');
    });
    test('espaces en bordure sortis du gras ; lignes vides multiples resserrées', () => {
        assert.equal(fmt.previewToMrkdwn('a<span class="s-bold"> gras </span>b\n\n\n\nc'), 'a *gras* b\n\nc');
    });
});

describe('TK — numéro de ticket lié dans les listes Slack des rapports', () => {
    test('lien JIRA devant le titre, survit à la copie (texte brut : le numéro ; HTML : le lien)', () => {
        const tk = fmt.TK({ id: 'GCOM-4323' }, 'https://jira.exemple/');
        assert.equal(tk, '<a class="s-link" href="https://jira.exemple/browse/GCOM-4323" target="_blank" rel="noopener">GCOM-4323</a> ');
        const md = fmt.previewToMrkdwn(`✅ ${tk}Passage Postgres 16 -&gt; 17 <span class="s-muted">[5 pts]</span>`);
        assert.equal(rc.mrkdwnToPlain(md), '✅ GCOM-4323 Passage Postgres 16 -> 17 [5 pts]');
        assert.match(rc.mrkdwnToHtml(md), /<a href="https:\/\/jira\.exemple\/browse\/GCOM-4323">GCOM-4323<\/a> Passage/);
    });
    test('sans base JIRA : le numéro seul ; sans id : rien', () => {
        assert.equal(fmt.TK({ id: 'G-1' }), 'G-1 ');
        assert.equal(fmt.TK({ key: 'G-2' }, 'https://j'), '<a class="s-link" href="https://j/browse/G-2" target="_blank" rel="noopener">G-2</a> ');
        assert.equal(fmt.TK({}, 'https://j'), '');
    });
});
