/**
 * Flux cumulé du PI par état JIRA — `utils/jira-stages.js` + `components/pi_stage_flow.js` (3.225.0).
 *
 * Ce que ces tests verrouillent, chaque cas venant du PI 31 :
 *   • le rangement des libellés JIRA dans les six états du rapport du train (Bellier : « À livrer pour
 *     validation » = 05, sinon 37 pts ne tombent pas juste) — ≠ STATUS_MAP, qui range la qualif en `done` ;
 *   • RIEN d'interpolé : chaque jour rejoue sprint, statut et points du ticket À CETTE DATE ;
 *   • un ticket retiré du PI sort de la pile le jour du retrait, un « Clos sans suite » aussi ;
 *   • historique de statut ABSENT (sprints clos archivés : 7 tickets Fuego « En Prod » comptés terminés dès
 *     le 07/09) → reconstruit par startedDate / resolvedDate ;
 *   • sprint renommé (« PI#31 » devenu « PI#30.6 ») : le nom actuel fait foi.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let js, F;
before(async () => {
    js = await import('../static/js/utils/jira-stages.js');
    F = await import('../static/js/components/pi_stage_flow.js');
});

const S1 = 'Equipe O - Ité 31.1', S32 = 'Equipe O - Ité 32.1';
const ch = (field, date, from, to) => ({ field, date, from, to });
const BOUNDS = { startIso: '2025-12-22', endIso: '2026-01-09' };
const TODAY = '2026-01-02';
const tk = (id, extra) => ({ id, team: 'O', points: 0, sprintName: S1, createdAt: '2025-12-01T00:00:00Z', recentChanges: [], ...extra });

describe('stageOfLabel — états du rapport JIRA', () => {
    test('les libellés de la base tombent dans le bon état, sans casse ni accents', () => {
        const k = l => js.stageOfLabel(l).key;
        assert.equal(k('À Faire'), 'todo');
        assert.equal(k('a faire'), 'todo');
        assert.equal(k('En cours de spécification'), 'scoping');
        assert.equal(k('Prêt'), 'ready');
        assert.equal(k('En cours de revue'), 'dev');
        assert.equal(k('En cours de qualification'), 'testing', 'STATUS_MAP dit done : pas le rapport du train');
        assert.equal(k('À livrer pour validation'), 'done');
        assert.equal(k('A livrer en Prod'), 'done');
    });
    test('« Clos sans suite » = hors périmètre (null)', () => {
        assert.equal(js.stageOfLabel('Clos sans suite').key, null);
    });
    test('libellé inconnu : repli sur le statut interne, signalé', () => {
        const s = js.stageOfLabel('Statut exotique', () => 'test');
        assert.deepEqual(s, { key: 'testing', guessed: true });
    });
});

describe('piStageFlowModel — flux jour par jour', () => {
    const fixtures = () => [
        tk('A', { points: 3, jiraStatus: 'En Prod', recentChanges: [
            ch('Sprint', '2025-12-10T10:00:00.000+0100', '', S1),
            ch('status', '2025-12-23T10:00:00.000+0100', 'À Faire', 'En cours de développement'),
            ch('status', '2025-12-30T10:00:00.000+0100', 'En cours de développement', 'En Prod')] }),
        tk('B', { points: 5, jiraStatus: 'À Faire', sprintName: S32, recentChanges: [
            ch('Sprint', '2025-12-10T10:00:00.000+0100', '', S1),
            ch('Sprint', '2025-12-24T10:00:00.000+0100', S1, S32)] }),
        tk('C', { points: 2, jiraStatus: 'Clos sans suite', recentChanges: [
            ch('status', '2025-12-29T10:00:00.000+0100', 'À Faire', 'Clos sans suite')] }),
        tk('D', { points: 1, jiraStatus: 'En Prod', startedDate: '2025-12-23T09:00:00.000+0100', resolvedDate: '2025-12-29T09:00:00.000+0100' }),
        tk('E', { points: 8, jiraStatus: 'À Faire', sprintName: 'PI#30.6', recentChanges: [
            ch('Sprint', '2025-11-05T10:00:00.000+0100', '', 'PI#31')] }),
        tk('F', { team: 'X', points: 2, jiraStatus: 'Prêt', recentChanges: [
            ch('Story Points', '2025-12-26T10:00:00.000+0100', '1', '2')] }),
    ];
    const model = (o = {}) => F.piStageFlowModel({ tickets: fixtures(), piNum: 31, bounds: BOUNDS, today: TODAY, ...o });
    const at = (m, day, key) => m.series[key][m.days.indexOf(day)];

    test('axe en jours OUVRÉS (Noël et le 1ᵉʳ janvier retirés), arrêté à aujourd\'hui', () => {
        const m = model();
        assert.equal(m.days.includes('2025-12-25'), false);
        assert.equal(m.days.includes('2026-01-01'), false);
        assert.equal(m.days.includes('2025-12-27'), false, 'samedi');
        assert.equal(m.labels[0], '22/12');
        assert.equal(m.days[m.shownN - 1], TODAY);
        assert.equal(m.series.done[m.shownN], null, 'jours futurs vides');
        assert.equal(m.todayIndex, m.shownN - 1);
    });
    test('statut REJOUÉ : à faire → en dév → terminé aux dates du changelog', () => {
        const m = model({ teams: [] });
        assert.equal(at(m, '2025-12-22', 'todo'), 3 + 5 + 2 + 1, 'A, B, C, D à faire le premier jour ; E (renommé) absent');
        assert.equal(at(m, '2025-12-23', 'dev'), 3 + 1, 'A passe en dév, D démarre (startedDate)');
        assert.equal(at(m, '2025-12-30', 'done'), 3 + 1);
    });
    test('retiré du PI : sort de la pile le jour du retrait', () => {
        const m = model();
        assert.equal(at(m, '2025-12-23', 'todo'), 5 + 2);
        assert.equal(at(m, '2025-12-24', 'todo'), 2, 'B renvoyé en 32.1 le 24');
    });
    test('« Clos sans suite » : compté avant, plus après', () => {
        const m = model();
        assert.equal(at(m, '2025-12-26', 'todo'), 2);
        assert.equal(at(m, '2025-12-29', 'todo'), 0);
    });
    test('historique de statut absent : reconstruit par startedDate / resolvedDate', () => {
        const m = model({ tickets: [fixtures()[3]] });
        assert.equal(at(m, '2025-12-22', 'todo'), 1);
        assert.equal(at(m, '2025-12-26', 'dev'), 1);
        assert.equal(at(m, '2025-12-29', 'done'), 1);
        assert.equal(at(m, '2025-12-22', 'done'), 0, 'pas terminé dès le premier jour');
    });
    test('story points rejoués ; unité tickets', () => {
        const m = model({ tickets: [fixtures()[5]] });
        assert.equal(at(m, '2025-12-22', 'ready'), 1);
        assert.equal(at(m, '2025-12-29', 'ready'), 2);
        const n = model({ unit: 'tickets' });
        assert.equal(at(n, '2025-12-22', 'todo'), 4);
    });
    test('tableau du jour : une ligne par équipe + total, TSV au format du rapport JIRA', () => {
        const m = model({ teams: ['O', 'X'] });
        assert.deepEqual(m.rows.map(r => [r.label, r.total]), [['O', 4], ['X', 2]]);
        assert.equal(m.total.total, 6);
        assert.equal(m.total.by.done, 4);
        const tsv = F.piFlowTsv(m, { title: 'GCOM', prefix: 'GCOM - ' }).split('\n');
        assert.equal(tsv[1], '\tTOTAL\t00.TODO\t01.SCOPING\t02.READY_TO_DEV\t03.IN_DEVELOPMENT\t04.IN_TESTING\t05.DEVELOPMENT_DONE');
        assert.equal(tsv[2], 'GCOM - O\t4\t0\t0\t0\t0\t0\t4');
        assert.equal(tsv.at(-1), 'Total\t6\t0\t0\t2\t0\t0\t4');
    });
    test('bande cliquée : les tickets de cet état CE JOUR-LÀ, avec le statut JIRA du jour', () => {
        const m = model({ teams: ['O', 'X'] });
        const d23 = m.days.indexOf('2025-12-23');
        assert.deepEqual(F.piFlowPick(m, { key: 'dev', i: d23 }).map(x => x.t.id), ['A', 'D'], 'trié par points décroissants');
        const a = F.piFlowPick(m, { key: 'dev', i: d23 })[0];
        assert.equal(a.snap.label, 'En cours de développement');
        assert.equal(F.piFlowPick(m, { key: 'dev', i: d23 })[1].snap.label, '', 'D : reconstruit par les dates');
        assert.deepEqual(F.piFlowPick(m, { key: 'todo', i: 0 }).map(x => x.t.id), ['B', 'A', 'C', 'D']);
        assert.deepEqual(F.piFlowPick(m, { key: 'todo', i: m.days.indexOf('2025-12-24') }).map(x => x.t.id), ['C'], 'B retiré le 24');
    });
    test('segment d\'une barre / cellule du tableau : une équipe, aujourd\'hui ; clé vide = tous les états', () => {
        const m = model({ teams: ['O', 'X'] });
        assert.deepEqual(F.piFlowPick(m, { key: 'done', team: 'O' }).map(x => x.t.id), ['A', 'D']);
        assert.deepEqual(F.piFlowPick(m, { key: 'ready', team: 'X' }).map(x => x.t.id), ['F']);
        assert.deepEqual(F.piFlowPick(m, { team: 'X' }).map(x => x.t.id), ['F']);
        assert.equal(F.piFlowPick(m, {}).length, 3, 'tous les tickets du jour, toutes équipes');
    });
    test('temps écoulé du PI (jours ouvrés, comme l\'Avancement du PI) et part terminée par équipe', () => {
        const m = model({ teams: ['O', 'X'] });
        assert.equal(m.elapsed, 58, '7 jours ouvrés écoulés sur 12 (Noël et 1ᵉʳ janvier exclus)');
        assert.deepEqual(m.rows.map(r => r.donePct), [100, 0]);
        assert.equal(m.total.donePct, 67);
        assert.equal(model({ today: '2025-12-01' }).elapsed, 0);
        assert.equal(model({ today: '2026-02-01' }).elapsed, 100);
    });
    test('en retard = moins terminé que le temps écoulé, marge de 10 points, rien avant 15 %', () => {
        assert.equal(F.piFlowLate(30, 59), true);
        assert.equal(F.piFlowLate(50, 59), false);
        assert.equal(F.piFlowLate(0, 10), false, 'démarrage du PI');
    });
    test('PI sans bornes : pas de modèle', () => {
        assert.equal(F.piStageFlowModel({ tickets: [], piNum: 31, bounds: null }), null);
    });
});
