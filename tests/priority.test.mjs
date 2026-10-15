/**
 * Priorité d'un ticket — `priorityKey()` / `priorityBadge()` (utils/priority.js).
 *
 * Le piège verrouillé : la base mélange les libellés JIRA bruts (« 2. haute », « 3. moyenne »,
 * « 4. basse ») et les clés internes posées par l'édition (`high`…). L'ancien lookup exact sur les
 * clés internes affichait TOUT ticket synchronisé en « medium » bleu, sans erreur.
 * Relever les libellés : SELECT priority, count(*) FROM ticket GROUP BY 1
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let u;
before(async () => { u = await import('../static/js/utils.js'); });

const CAS = [
    ['1. critique', 'critical'], ['1. Bloquante', 'critical'], ['Highest', 'critical'],
    ['2. haute', 'high'], ['high', 'high'],
    ['3. moyenne', 'medium'], ['medium', 'medium'], ['', 'medium'], [null, 'medium'],
    ['4. basse', 'low'], ['5. mineure', 'low'], ['Lowest', 'low'], ['low', 'low'],
];

describe('priorityKey', () => {
    for (const [brut, attendu] of CAS) {
        test(`${JSON.stringify(brut)} → ${attendu}`, () => assert.equal(u.priorityKey(brut), attendu));
    }
});

describe('priorityBadge', () => {
    test('libellé JIRA connu → libellé FR normalisé + classe de la clé', () => {
        const html = u.priorityBadge('2. haute');
        assert.match(html, /badge-prio--high/);
        assert.match(html, />Haute</);
    });
    test('valeur inconnue → affichée brute (rien n\'est masqué)', () => {
        assert.match(u.priorityBadge('bizarre'), />bizarre</);
    });
});
