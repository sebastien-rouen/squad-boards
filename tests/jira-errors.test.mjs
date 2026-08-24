/**
 * Messages d'erreur du proxy `/jira/*` — `api.jiraErrorMessage`.
 *
 * Constaté en console : un HTTP 401 sur `rest/agile/1.0/board` remontait à l'utilisateur en
 * « Aucun board scrum pour GCOM, GDEM, GEX, GDC, TRV ». Le pas de côté est coûteux : on va
 * vérifier sa liste de projets alors que JIRA a simplement refusé la connexion.
 * Le `status` HTTP est donc porté par l'erreur (api.js `request`) et traduit ici.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let api;
before(async () => { api = await import('../static/js/api.js'); });

const err = (status, message = 'Unauthorized') => Object.assign(new Error(message), { status });

describe('jiraErrorMessage', () => {
    test('401 parle d’authentification, jamais d’absence de données', () => {
        const m = api.jiraErrorMessage(err(401), 'la liste des boards');
        assert.match(m, /refusé la connexion/);
        assert.match(m, /401/);
        assert.match(m, /Plugin JIRA/, 'et dit où corriger');
        assert.doesNotMatch(m, /[Aa]ucun/, 'surtout pas « aucun board »');
    });

    test('403 est traité comme 401 — c’est aussi un refus', () => {
        assert.match(api.jiraErrorMessage(err(403, 'Forbidden')), /refusé la connexion \(HTTP 403\)/);
    });

    test('404 pointe l’URL de l’instance', () => {
        assert.match(api.jiraErrorMessage(err(404, 'Not Found')), /introuvable.*URL/s);
    });

    test('5xx annonce une indisponibilité temporaire', () => {
        assert.match(api.jiraErrorMessage(err(503, 'Unavailable')), /indisponible.*réessayer/s);
    });

    test('sans statut, le message d’origine est conservé', () => {
        const m = api.jiraErrorMessage(new Error('NetworkError when attempting to fetch'), 'les sprints');
        assert.match(m, /les sprints/);
        assert.match(m, /NetworkError/);
    });

    test('le contexte demandé apparaît dans le message', () => {
        assert.match(api.jiraErrorMessage(err(401), 'les tickets de ce sprint'), /les tickets de ce sprint/);
    });
});
