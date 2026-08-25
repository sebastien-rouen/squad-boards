/**
 * Colonnes de flux — `STAGE_FLOW_GROUPS` (utils.js), socle des cards « Temps par colonne »,
 * « Ancienneté du travail en cours » et du périmètre de durée du Dashboard / PI Planning.
 *
 * Le piège que ces tests verrouillent : ces regex s'appliquent au LIBELLÉ JIRA BRUT (minuscules,
 * trim — cf sync.js), et un libellé qui ne matche aucune colonne **disparaît en silence**. Aucun
 * écran ne le signale : la colonne affiche simplement moins de tickets, avec une médiane plus
 * courte. Constaté en prod : « a livrer en qual » (sans le « if ») = 156 tickets invisibles, dont
 * 37 sans aucun autre statut de qualif.
 *
 * D'où le golden dataset ci-dessous : les libellés de workflow réellement observés en base, avec
 * la colonne attendue — `null` pour ceux qui doivent RESTER hors flux (files d'attente, backlog,
 * états terminaux). Il attrape les deux sens de l'erreur : une colonne qui perd un statut, et une
 * regex trop large qui avale une file d'attente et fait passer du temps mort pour du travail.
 *
 * Y ajouter un libellé dès qu'une équipe en introduit un (relevé :
 * `SELECT DISTINCT json_each.key FROM ticket, json_each(ticket.stage_durations)`).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let u;
before(async () => { u = await import('../static/js/utils.js'); });

/** Libellés JIRA réellement rencontrés → colonne attendue (`null` = volontairement hors flux). */
const STATUTS_OBSERVES = [
    // ── Travail effectif, doit tomber dans une colonne ──────────────────────────
    ['en cours de développement',      'dev'],
    ['en cours de revue',              'review'],
    ['en cours de relecture',          'review'],
    ['en cours de relecture tech',     'review'],
    ['en cours de test dev',           'test'],
    ['en cours de test préprod',       'test'],
    ['en cours de test recette',       'test'],
    ['en cours de recette',            'test'],
    ['en cours de qualification',      'qualif'],
    ['en cours de qualif (mi)',        'qualif'],
    ['a livrer en qualif (mi)',        'qualif'],
    ['a livrer en qual',               'qualif'],   // ⚠️ sans le « if » — 156 tickets perdus en 3.143.0
    ['a livrer en prod',               'prod'],
    ['en prod',                        'prod'],

    // ── Files d'attente et états hors flux : ne doivent JAMAIS être comptés ──────
    ['à faire',                        null],
    ['a faire',                        null],
    ['prêt',                           null],
    ['prêt à développer',              null],   // file d'attente, pas du dév
    ['en attente',                     null],
    ['a estimer',                      null],
    ['a spécifier',                    null],
    ['en cours de spécification',      null],
    ['en cours de spécification tech', null],
    ['en cours d\'analyse',            null],
    ['retour au demandeur',            null],
    ['requête/demande envoyée',        null],
    ['terminé',                        null],
    ['clos sans suite',                null],
];

/** Colonne(s) dans lesquelles tombe un libellé — plusieurs = ambiguïté à trancher. */
const colonnesDe = k => u.STAGE_FLOW_GROUPS.filter(g => g.test(k)).map(g => g.key);

describe('STAGE_FLOW_GROUPS — classement des libellés JIRA observés', () => {
    for (const [libelle, attendue] of STATUTS_OBSERVES) {
        test(`« ${libelle} » → ${attendue || 'hors flux'}`, () => {
            const cols = colonnesDe(libelle);
            if (attendue === null) {
                assert.deepEqual(cols, [], `« ${libelle} » est une file d'attente : son temps ne doit pas être compté comme du travail`);
            } else {
                assert.ok(cols.includes(attendue), `« ${libelle} » devrait tomber dans « ${attendue} », or il tombe dans [${cols.join(', ') || 'aucune colonne'}]`);
            }
        });
    }

    test('aucun libellé ne tombe dans deux colonnes à la fois', () => {
        const ambigus = STATUTS_OBSERVES
            .map(([k]) => [k, colonnesDe(k)])
            .filter(([, cols]) => cols.length > 1);
        assert.deepEqual(ambigus, [], 'un libellé compté deux fois gonfle les deux colonnes');
    });

    test('« préprod » ne compte pas comme de la prod', () => {
        // Le piège inverse : `includes('prod')` seul avalerait toute la préprod.
        assert.ok(!colonnesDe('a livrer en préprod').includes('prod'));
        assert.ok(!colonnesDe('a livrer en preprod').includes('prod'));
    });
});

describe('computeStageFlow — agrégation', () => {
    const tk = (id, stageDurations) => ({ id, status: 'done', stageDurations });

    test('somme les statuts d\'une même colonne et rend médiane et P85', () => {
        const groups = u.computeStageFlow([
            tk('A-1', { 'en cours de développement': 2, 'en cours de revue': 1 }),
            tk('A-2', { 'en cours de développement': 4, 'en cours de revue': 3 }),
            tk('A-3', { 'en cours de développement': 6 }),
        ]);
        const dev = groups.find(g => g.key === 'dev');
        assert.equal(dev.count, 3);
        assert.equal(dev.medDays, 4);
        const review = groups.find(g => g.key === 'review');
        assert.equal(review.count, 2, 'seuls les tickets réellement passés en revue comptent');
    });

    test('un ticket passé deux fois par la même colonne cumule ses durées', () => {
        // JIRA renvoie un libellé par statut : deux statuts d'une même colonne s'additionnent.
        const [dev] = u.computeStageFlow([tk('A-1', { 'en cours de développement': 3, 'en cours de test dev': 2 })])
            .filter(g => g.key === 'dev');
        assert.equal(dev.medDays, 3);
    });

    test('une colonne sans aucune durée n\'est pas affichée', () => {
        const keys = u.computeStageFlow([tk('A-1', { 'en cours de développement': 2 })]).map(g => g.key);
        assert.deepEqual(keys, ['dev'], 'afficher une colonne vide laisserait croire à une traversée instantanée');
    });
});

describe('belongedToPi — périmètre des mesures de durée', () => {
    /** Ticket dont l'historique du champ Sprint est cumulatif, comme JIRA l'écrit. */
    const tk = (id, sprintName, traverses = []) => ({
        id, sprintName, status: 'done',
        recentChanges: traverses.map((_, i) => ({
            field: 'Sprint', date: `2026-0${i + 1}-01`,
            from: traverses.slice(0, i).join(', '),
            to:   traverses.slice(0, i + 1).join(', '),
        })),
    });

    test('retient un ticket déplacé au PI suivant à la clôture', () => {
        // Le cas qui faisait perdre 43 % du périmètre du PI29 : travaillé en 29.x, non fini,
        // donc déplacé — son sprintName ne dit plus rien du PI où il a coûté du temps.
        const reporte = tk('A-1', 'Equipe O - Ité 30.1', ['Equipe O - Ité 29.4', 'Equipe O - Ité 30.1']);
        assert.equal(u.extractPiNum(reporte.sprintName), 30, 'son sprint actuel est bien du PI30');
        assert.ok(u.belongedToPi(reporte, 29), 'il a pourtant été travaillé dans le PI29');
        assert.ok(u.belongedToPi(reporte, 30));
    });

    test('n\'invente pas d\'appartenance', () => {
        assert.ok(!u.belongedToPi(tk('A-2', 'Equipe O - Ité 30.1'), 29));
    });

    test('sans numéro de PI, ne filtre rien', () => {
        // Repli des vues quand le PI n'est pas déterminé : tout garder plutôt que tout perdre.
        assert.ok(u.belongedToPi(tk('A-3', 'Equipe O - Ité 30.1'), 0));
    });
});
