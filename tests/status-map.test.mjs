/**
 * Mapping des statuts JIRA — `STATUS_MAP` / `mapStatus()`, socle du cycle time et du lead time.
 *
 * Le piège que ces tests verrouillent : `mapStatus()` est un lookup EXACT avec **repli silencieux
 * sur 'todo'**. Un libellé absent de la table ne lève rien, ne s'affiche nulle part — il rend
 * simplement le ticket invisible aux métriques de flux :
 *
 *   • statut de TRAVAIL non reconnu   → `startedDate` jamais posé (ou posé trop tard)
 *                                        → cycle time nul, ou raccourci sans qu'on le sache ;
 *   • statut de LIVRAISON non reconnu → `resolvedDate` jamais posé → cycle ET lead time nuls,
 *                                        et le ticket reste affiché « à faire » alors qu'il est livré.
 *
 * Constaté en base : « en cours de qualification » et « a livrer en qual » (le libellé de plusieurs
 * équipes) tombaient dans le repli — 19 tickets livrés comptés comme non commencés.
 *
 * Golden dataset des libellés réellement observés, avec la catégorie attendue. Le relever avec :
 *   SELECT DISTINCT lower(trim(jira_status)) FROM ticket
 *   SELECT DISTINCT json_each.key FROM ticket, json_each(ticket.stage_durations)
 *
 * ⚠️ Ne PAS confondre avec `tests/stage-flow.test.mjs` : là-bas les regex de colonnes de flux
 * (où passe le temps), ici la catégorie d'un statut (où en est le ticket). Un même libellé peut
 * légitimement être « colonne qualif » ET « catégorie done ».
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installerEnv } from './helpers/env.mjs';

installerEnv();
let u, cfg;
before(async () => {
    u = await import('../static/js/utils.js');
    cfg = await import('../static/js/config.js');
});

/** Libellés JIRA observés en base → catégorie attendue. */
const STATUTS_OBSERVES = [
    // ── Travail en cours : datent le DÉMARRAGE (startedDate) ────────────────────
    ['en cours',                       'inprog'],
    ['en cours de développement',      'inprog'],
    ['correction en cours',            'inprog'],
    ['wireframes en cours',            'inprog'],
    ['maquettes en cours de finalisation', 'inprog'],
    ['en cours de revue',              'review'],
    ['en cours de relecture',          'review'],
    ['en cours de relecture tech',     'review'],
    ['en cours de recette',            'test'],
    ['en cours de test dev',           'test'],
    ['en cours de test recette',       'test'],
    ['a livrer en recette',            'test'],

    // ── Livraison : datent la CLÔTURE (resolvedDate) ────────────────────────────
    ['terminé',                        'done'],
    ['clos sans suite',                'done'],
    ['en prod',                        'done'],
    ['a livrer en prod',               'done'],
    ['a livrer en préprod',            'done'],
    ['en cours de test préprod',       'done'],
    ['en cours de qualif (mi)',        'done'],
    ['a livrer en qualif (mi)',        'done'],
    ['en cours de qualification',      'done'],   // ⚠️ tombait dans le repli avant 3.145.x
    ['a livrer en qual',               'done'],   // ⚠️ idem — libellé de plusieurs équipes

    // ── Amont : ni démarrage ni clôture ─────────────────────────────────────────
    ['à faire',                        'todo'],
    ['a faire',                        'todo'],
    ['prêt',                           'todo'],
    ['prêt à développer',              'todo'],
    ['en attente',                     'todo'],
    ['a estimer',                      'todo'],
    ['a spécifier',                    'todo'],
    ['a livrer en dev',                'todo'],
    ['en cours de spécification',      'todo'],
    ['en cours de spécification tech', 'todo'],
    ['en cours d\'analyse',            'todo'],
    ['en cours de recherche u',        'todo'],
    ['point ux/ui',                    'todo'],
    ['3 amigos',                       'todo'],
    ['requête/demande envoyée',        'todo'],

    // ── Blocage ─────────────────────────────────────────────────────────────────
    ['retour au demandeur',            'blocked'],
];

describe('mapStatus — catégorie des libellés JIRA observés', () => {
    for (const [libelle, attendue] of STATUTS_OBSERVES) {
        test(`« ${libelle} » → ${attendue}`, () => {
            assert.equal(u.mapStatus(libelle), attendue);
        });
    }

    test('chaque libellé de travail ou de livraison est DÉCLARÉ, jamais laissé au repli', () => {
        // Le cœur du garde-fou : un libellé qui n'existe pas dans la table renvoie 'todo'
        // exactement comme un vrai 'todo'. Seule la présence de la CLÉ distingue les deux.
        const manquants = STATUTS_OBSERVES
            .filter(([, cat]) => cat !== 'todo')
            .map(([k]) => k)
            .filter(k => !(k in cfg.STATUS_MAP));
        assert.deepEqual(manquants, [], 'ces libellés ne doivent pas dépendre du repli silencieux sur « todo »');
    });
});

describe('Déclencheurs du cycle time', () => {
    const demarre  = k => cfg.CYCLE_START_STATUSES.includes(u.mapStatus(k));
    const cloture  = k => u.mapStatus(k) === cfg.CYCLE_END_STATUS;

    test('un passage en développement, revue ou test date le démarrage', () => {
        for (const k of ['en cours de développement', 'en cours de relecture tech', 'en cours de test dev']) {
            assert.ok(demarre(k), `« ${k} » devrait dater le démarrage`);
        }
    });

    test('une file d\'attente amont ne date PAS le démarrage', () => {
        // Sinon le cycle time inclurait le temps d'attente et perdrait tout son sens.
        for (const k of ['à faire', 'prêt', 'prêt à développer', 'a estimer', 'a livrer en dev']) {
            assert.ok(!demarre(k), `« ${k} » est une file d'attente, pas du travail`);
        }
    });

    test('les statuts de livraison datent la clôture', () => {
        for (const k of ['terminé', 'en prod', 'a livrer en qual', 'en cours de qualification', 'clos sans suite']) {
            assert.ok(cloture(k), `« ${k} » devrait dater la clôture`);
        }
    });

    test('un statut de travail ne date jamais la clôture, et réciproquement', () => {
        const ambigus = STATUTS_OBSERVES.map(([k]) => k).filter(k => demarre(k) && cloture(k));
        assert.deepEqual(ambigus, [], 'un statut ne peut pas être à la fois le début et la fin du cycle');
    });

    test('un libellé inconnu retombe sur « todo » — et ne déclenche donc rien', () => {
        // Comportement volontaire (aucune exception à l'import), mais c'est LUI qui rend le
        // golden dataset ci-dessus nécessaire : rien d'autre ne signalera un statut oublié.
        assert.equal(u.mapStatus('statut inventé par une équipe'), 'todo');
        assert.ok(!demarre('statut inventé par une équipe'));
        assert.ok(!cloture('statut inventé par une équipe'));
    });

    test('la casse et les espaces n\'ont pas d\'importance', () => {
        assert.equal(u.mapStatus('  En Cours De Développement  '), 'inprog');
    });
});
