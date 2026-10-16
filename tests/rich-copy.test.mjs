/**
 * Copies « pour Slack » — `utils/rich-copy.js` (3.227.0) : mrkdwn → HTML enrichi + texte brut.
 * Collé dans le compositeur Slack, le mrkdwn s'affichait tel quel (« *Support · 20/10* », « <https://…|GCOM-1> »).
 * Ces tests verrouillent : AUCUN marqueur dans le texte brut, liens cliquables dans le HTML, et aucun faux positif
 * (snake_case, codes emoji, multiplication) qui abîmerait un message.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let rc;
before(async () => { rc = await import('../static/js/utils/rich-copy.js'); });

describe('mrkdwn → texte brut', () => {
    test('gras, italique, barré, code : marqueurs retirés', () => {
        assert.equal(rc.mrkdwnToPlain('🎧 *Support · 20/10* : _Alice_, ~Bob~ et `npm test`'), '🎧 Support · 20/10 : Alice, Bob et npm test');
        assert.equal(rc.mrkdwnToPlain('**Gras markdown** fin'), 'Gras markdown fin');
    });
    test('liens : leur texte seul ; mentions spéciales lisibles ; entités décodées', () => {
        assert.equal(rc.mrkdwnToPlain('• <https://jira/browse/GCOM-1|GCOM-1> Titre &lt;b&gt; &amp; co'), '• GCOM-1 Titre <b> & co');
        assert.equal(rc.mrkdwnToPlain('<https://exemple.fr> <!here> <#C12|equipe>'), 'https://exemple.fr @here #equipe');
    });
    test('pas de faux positif : snake_case, codes emoji, multiplication, astérisque isolé', () => {
        assert.equal(rc.mrkdwnToPlain('mon_fichier_test :white_check_mark: 3 * 4 = 12 *note'), 'mon_fichier_test :white_check_mark: 3 * 4 = 12 *note');
    });
    test('lignes, indentation et lignes vides conservées', () => {
        assert.equal(rc.mrkdwnToPlain('*Titre*\n\n    • _a_\n    • b'), 'Titre\n\n    • a\n    • b');
    });
});

describe('mrkdwn → HTML', () => {
    test('balises et liens cliquables, texte échappé', () => {
        const h = rc.mrkdwnToHtml('*Epic <x>* — <https://jira/browse/G-1|G-1> _Prêt_');
        assert.equal(h, '<div><b>Epic &lt;x&gt;</b> — <a href="https://jira/browse/G-1">G-1</a> <i>Prêt</i></div>');
    });
    test('imbrication et lignes vides', () => {
        assert.equal(rc.mrkdwnToHtml('*gras _et italique_*\n\nfin'), '<div><b>gras <i>et italique</i></b></div><div><br></div><div>fin</div>');
    });
    test('indentation de tête en espaces insécables', () => {
        assert.equal(rc.mrkdwnToHtml('  • ligne'), '<div>&nbsp;&nbsp;• ligne</div>');
    });
});
