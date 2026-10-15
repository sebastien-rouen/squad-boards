/**
 * Jours ouvrés — `static/js/utils/workdays.js`, source unique du Cycle Time, du Lead Time et de
 * l'âge du WIP (3.216.0). Les champs `cycleTimeDays` / `leadTimeDays` restent CALENDAIRES en base :
 * ces tests verrouillent le recalcul depuis les dates, et le repli quand elles manquent.
 * Dates en heure LOCALE (les jours ouvrés se comptent au calendrier de l'équipe).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { workdaysBetween, cycleDays, leadDays, wipAgeDays, isWorkday, workdaysLeft, workdayDurationDays } from '../static/js/utils/workdays.js';

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h);

describe('workdaysBetween', () => {
    test('vendredi → lundi = 1 jour ouvré (et non 3)', () => {
        assert.equal(workdaysBetween(at(2026, 10, 9), at(2026, 10, 12)), 1);
    });
    test('même jour = 0 ; lundi → vendredi = 4', () => {
        assert.equal(workdaysBetween(at(2026, 10, 12, 9), at(2026, 10, 12, 18)), 0);
        assert.equal(workdaysBetween(at(2026, 10, 12), at(2026, 10, 16)), 4);
    });
    test('un jour férié ne compte pas (11 novembre 2026, un mercredi)', () => {
        assert.equal(isWorkday(at(2026, 11, 11)), false);
        assert.equal(workdaysBetween(at(2026, 11, 10), at(2026, 11, 12)), 1);
    });
    test('passage à l\'heure d\'hiver (25/10/2026) : aucun jour sauté ni doublé', () => {
        assert.equal(workdaysBetween(at(2026, 10, 23), at(2026, 10, 26)), 1);
    });
    test('fuseau compact JIRA (+0200) accepté ; date illisible → null', () => {
        assert.equal(workdaysBetween('2026-10-09T17:00:00.000+0200', '2026-10-12T09:00:00.000+0200'), 1);
        assert.equal(workdaysBetween('n/a', at(2026, 10, 12)), null);
    });
});

describe('cycleDays / leadDays', () => {
    test('recalculés en jours ouvrés depuis les dates stockées', () => {
        const t = { cycleTimeDays: 3, leadTimeDays: 10,
            createdAt: at(2026, 10, 2).toISOString(), startedDate: at(2026, 10, 9).toISOString(), resolvedDate: at(2026, 10, 12).toISOString() };
        assert.equal(cycleDays(t), 1);
        assert.equal(leadDays(t), 6);
    });
    test('plancher à 1 jour, comme le calcul de la synchro', () => {
        const t = { cycleTimeDays: 1, startedDate: at(2026, 10, 12, 9).toISOString(), resolvedDate: at(2026, 10, 12, 17).toISOString() };
        assert.equal(cycleDays(t), 1);
    });
    test('0 reste 0 (ticket hors des métriques de flux)', () => {
        const t = { cycleTimeDays: 0, leadTimeDays: 0, startedDate: at(2026, 10, 9).toISOString(), resolvedDate: at(2026, 10, 12).toISOString() };
        assert.equal(cycleDays(t), 0);
        assert.equal(leadDays(t), 0);
    });
    test('sans dates : la valeur stockée sert de repli', () => {
        assert.equal(cycleDays({ cycleTimeDays: 5 }), 5);
        assert.equal(cycleDays(null), 0);
    });
});

describe('wipAgeDays', () => {
    test('commencé vendredi, vu lundi = 1 ; plancher 1', () => {
        assert.equal(wipAgeDays(at(2026, 10, 9), at(2026, 10, 12)), 1);
        assert.equal(wipAgeDays(at(2026, 10, 12, 9), at(2026, 10, 12, 18)), 1);
    });
});

describe('workdaysLeft — « Jours restants » du rapport', () => {
    test('jeudi → clôture le lundi suivant : jeudi, vendredi, lundi = 3 (et non 4 avec le week-end)', () => {
        assert.equal(workdaysLeft(at(2026, 10, 19, 9), at(2026, 10, 15, 11)), 3);
    });
    test('dernier jour = 1 ; période finie = 0', () => {
        assert.equal(workdaysLeft(at(2026, 10, 19, 18), at(2026, 10, 19, 11)), 1);
        assert.equal(workdaysLeft(at(2026, 10, 12), at(2026, 10, 15)), 0);
    });
});

describe('workdayDurationDays — durées par colonne (stageDurations, à la synchro)', () => {
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
    test('vendredi 17 h → lundi 9 h = 16 h, le week-end ne compte pas', () => {
        near(workdayDurationDays(at(2026, 10, 9, 17), at(2026, 10, 12, 9)), 16 / 24);
    });
    test('dans la journée : 9 h → 17 h = 8 h', () => {
        near(workdayDurationDays(at(2026, 10, 12, 9), at(2026, 10, 12, 17)), 8 / 24);
    });
    test('un férié au milieu est retiré (mardi midi → jeudi midi autour du 11/11)', () => {
        near(workdayDurationDays(at(2026, 11, 10, 12), at(2026, 11, 12, 12)), 1);
    });
    test('millisecondes acceptées (appel de sync-parse.js) ; fin ≤ début = 0', () => {
        near(workdayDurationDays(at(2026, 10, 12, 9).getTime(), at(2026, 10, 12, 21).getTime()), 0.5);
        assert.equal(workdayDurationDays(at(2026, 10, 12), at(2026, 10, 9)), 0);
    });
});
