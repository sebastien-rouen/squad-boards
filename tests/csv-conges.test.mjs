/**
 * Parser du CSV Congés (format pivot RH) — module sans aucune dépendance, donc testable
 * directement. C'est lui qui alimente les absences, le snapshot des membres d'un PI et les
 * bornes `startDateFromCsv` / `sprintsPerPIFromCsv`.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

let parser;
before(async () => { parser = await import('../static/js/views/settings-absences-csv.js'); });

/** Le CSV RH se découpe sur TAB ou `;` — JAMAIS sur la virgule : les noms sont « NOM, Prénom ». */
const L = (...cells) => cells.join('\t');
const CSV = [
    L('NOMS, Prénom', 'Équipes', 'Entité', 'Rôles', '07/09', '08/09', '09/09', '10/09', '11/09'),
    L('DUPONT, Alice', 'Fuego', 'Alpha', 'Ops', '1', '1', '', '', ''),
    L('BERNARD, Bruno', 'Fuego', 'Beta', 'Ops', '', '', '0,5', '', ''),
    L('PETIT, Chloé', 'TRV', 'Beta', 'PMO', '', '', '', '1', '1'),
].join('\n');

describe('format pivot', () => {
    test('reconnaît le format et extrait les membres avec entité et rôle', () => {
        const r = parser._parsePivotAbsencesCsv(CSV, 2026, 0);
        assert.ok(r, 'format reconnu');
        assert.equal(r.members.length, 3);
        assert.equal(r.members[0].entity, 'Alpha');
        assert.equal(r.members[0].role, 'Ops');
    });

    test('déduit les bornes du PI depuis la 1re et la dernière colonne date', () => {
        const r = parser._parsePivotAbsencesCsv(CSV, 2026, 0);
        assert.equal(r.piStartDate, '2026-09-07');
        assert.equal(r.piEndDate, '2026-09-11');
        assert.equal(r.dayCount, 5);
    });

    test('la virgule ne sert jamais de séparateur (noms « NOM, Prénom » intacts)', () => {
        const r = parser._parsePivotAbsencesCsv(CSV, 2026, 0);
        assert.ok(r.members.some(m => m.name === 'DUPONT, Alice'));
    });
});

describe('consolidation', () => {
    test('les jours contigus deviennent une seule absence', () => {
        const r = parser._parsePivotAbsencesCsv(CSV, 2026, 0);
        const alice = r.absences.filter(a => a.memberName === 'DUPONT, Alice');
        assert.equal(alice.length, 1);
        assert.equal(alice[0].startDate, '2026-09-07');
        assert.equal(alice[0].endDate, '2026-09-08');
        assert.equal(alice[0].days, 2);
    });

    test('la demi-journée à virgule décimale est lue', () => {
        const r = parser._parsePivotAbsencesCsv(CSV, 2026, 0);
        assert.equal(r.absences.find(a => a.memberName === 'BERNARD, Bruno').days, 0.5);
    });

    test('vendredi + lundi comptent comme contigus (le week-end ne coupe pas)', () => {
        const csv = [
            L('NOMS, Prénom', 'Équipes', 'Entité', 'Rôles', '11/09', '14/09', '15/09'),
            L('ROUX, David', 'Fuego', 'Alpha', 'Ops', '1', '1', ''),
        ].join('\n');
        const r = parser._parsePivotAbsencesCsv(csv, 2026, 0);
        assert.equal(r.absences.length, 1);
        assert.equal(r.absences[0].startDate, '2026-09-11');
        assert.equal(r.absences[0].endDate, '2026-09-14');
    });

    test('deux jours éloignés restent deux absences', () => {
        const abs = parser._consolidateConsecutive([
            { memberName: 'A', team: 'T', startDate: '2026-09-07', endDate: '2026-09-07', days: 1, type: 'conge' },
            { memberName: 'A', team: 'T', startDate: '2026-09-21', endDate: '2026-09-21', days: 1, type: 'conge' },
        ]);
        assert.equal(abs.length, 2);
    });
});

describe('repli vers le format ligne', () => {
    for (const [libelle, contenu] of [
        ['un CSV « une ligne par absence »', 'Nom;Equipe;Debut;Fin\nX;Y;2026-01-01;2026-01-02'],
        ['une seule ligne', 'a;b;c'],
        ['moins de 3 colonnes date', [L('Nom', 'Eq', 'Ent', 'Role', '11/09', '14/09'), L('A', 'T', 'E', 'R', '1', '1')].join('\n')],
    ]) {
        test(`${libelle} → null`, () => {
            assert.equal(parser._parsePivotAbsencesCsv(contenu, 2026, 0), null);
        });
    }
});

describe('équipes transverses', () => {
    test('reconnues pour être enregistrées telles quelles, hors équipes agiles', () => {
        assert.equal(parser._isTransverseTeam('TRV'), true);
        assert.equal(parser._isTransverseTeam('Team X'), true);
        assert.equal(parser._isTransverseTeam('Fuego'), false);
    });
});
