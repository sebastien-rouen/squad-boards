/**
 * Rapprochement JIRA « Prénom Nom » ↔ import RH « NOM, Prénom » (utils/person-name.js).
 *
 * Piège verrouillé : l'égalité stricte n'appariait qu'1 leader sur 86 avec les absences — la
 * présence (congés) d'un leader restait donc introuvable. Fixtures synthétiques, mêmes formes
 * que la prod (accents, nom composé, nom collé d'un seul côté, casse).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let u;
before(async () => { u = await import('../static/js/utils.js'); });

describe('samePerson / findPerson', () => {
    const RH = ['DUPONT, Jean', 'DE LA TOUR, Éloïse', 'BEN SALAH, Inès', 'MARTIN, Paul'];
    for (const [jira, attendu] of [
        ['Jean Dupont', 'DUPONT, Jean'],
        ['Eloise de la Tour', 'DE LA TOUR, Éloïse'],
        ['Ines BENSALAH', 'BEN SALAH, Inès'],      // nom composé collé côté JIRA
        ['PAUL MARTIN', 'MARTIN, Paul'],
        ['Paul Martinez', null],
        ['', null],
    ]) {
        test(`${JSON.stringify(jira)} → ${attendu}`, () => assert.equal(u.findPerson(jira, RH), attendu));
    }
    test('une correspondance saisie l\'emporte ; "" = pas dans l\'import', () => {
        assert.equal(u.findPerson('Arnaud m', [...RH, 'MARTIN, Arnaud'], { 'Arnaud m': 'MARTIN, Arnaud' }), 'MARTIN, Arnaud');
        assert.equal(u.findPerson('Jean Dupont', RH, { 'Jean Dupont': '' }), null);
        assert.equal(u.findPerson('Jean Dupont', RH, { 'Autre': 'MARTIN, Paul' }), 'DUPONT, Jean');
    });
    test('comptes techniques reconnus', () => {
        assert.ok(u.isBotName('Automation for Jira'));
        assert.ok(!u.isBotName('Jean Dupont'));
    });
    test('clé indépendante de l\'ordre, de la casse et des accents', () => {
        assert.equal(u.personKey('DE LA TOUR, Éloïse'), u.personKey('eloise de la tour'));
    });
});

describe('labelColor', () => {
    test('stable et insensible à la casse', () => {
        assert.equal(u.labelColor('PI30'), u.labelColor(' pi30 '));
        assert.notEqual(u.labelColor('PI30'), u.labelColor('incident-prod'));
    });
});
