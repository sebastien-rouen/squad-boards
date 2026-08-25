# Tests

Suites `node:test` sur les modules front, sans navigateur ni dépendance : un environnement DOM
minimal suffit à exercer la logique métier (semaines de PI, rotation, config PI, parsing CSV,
rendu HTML des sections).

```bash
npm test                          # toutes les suites
node --test "tests/rotation.test.mjs"   # une seule
node --test --test-name-pattern "itérations" "tests/*.test.mjs"
```

> ⚠️ `node --test tests/` (un dossier en argument) **échoue** sur Node 22 : il tente de charger
> `tests` comme un fichier. Toujours passer un motif de fichiers, d'où le `"tests/*.test.mjs"`
> du script npm.

## Organisation

| Fichier | Couvre |
|---|---|
| `rotation.test.mjs` | matching d'équipe, roster du shuffle, en-tête de colonne, itérations |
| `pi-weeks.test.mjs` | égalité Rotation ↔ Support, ancrage, régularité des semaines |
| `pi-config.test.mjs` | priorité des sources `pi-cfg-<N>`, fusion, écart PI ↔ Congés |
| `recalage.test.mjs` | bandeau « Recaler ce PI sur les Congés », effet et retour arrière |
| `objectifs-pi.test.mjs` | rendu des objectifs et envoi réel de l'enregistrement |
| `stage-flow.test.mjs` | colonnes de flux : golden dataset des libellés JIRA, agrégation, `belongedToPi` |
| `status-map.test.mjs` | catégorie des statuts JIRA : golden dataset, déclencheurs du cycle time |
| `csv-conges.test.mjs` | parser pivot RH, consolidation, replis |
| `jira-section.test.mjs` | rendu de la section JIRA, échappement XSS, câblage |
| `sprint-scope.test.mjs` | périmètre d'un sprint : engagement (reports compris) vs réalisé |
| `capacity-base.test.mjs` | base de capacité PI : ETP par rôle, absences pondérées, respiration, roster |
| `health-render.test.mjs` | rendu Health : matrice, modale, charge suggérée, reports barrés |
| `cap-roles.test.mjs` | câblage `/#settings/cap-roles` : un listener par compteur, repli de copie |
| `jira-errors.test.mjs` | messages du proxy JIRA : un 401 ne se raconte pas en « aucun résultat » |
| `sync-incidents.test.mjs` | échecs partiels d'import : regroupement, refus d'auth nommé, résumé court |
| `sync-report.test.mjs` | rapport d'incidents dans la carte de sync : rendu, aide 401, fermeture manuelle |

`helpers/env.mjs` installe les globales (`document`, `localStorage`, `fetch`…),
`helpers/fixtures.mjs` fournit un jeu de données **synthétique** — aucun nom réel — mais calqué
sur les pièges rencontrés en production.

## Deux règles pour ne pas se faire piéger

1. **Importer `helpers/env.mjs` avant tout module applicatif.** `state.js` lit `localStorage` dès
   son chargement : les tests utilisent `await import()` dans un `before()` pour garantir l'ordre.

2. **Ne pas simplifier le faux élément DOM.** `esc()` passe par
   `document.createElement` + `textContent` → `innerHTML`. Un stub qui n'échappe pas fait renvoyer
   une chaîne **vide** à `esc()` : tout le contenu interpolé disparaît des rendus testés, sans
   aucune erreur. Un test « la valeur ne s'affiche pas » a déjà été pris pour un bug du code alors
   que seul le harnais était en cause.

## Ce que ces tests ne couvrent pas

Pas de rendu navigateur réel (mise en page, CSS, événements natifs), pas d'appel HTTP au backend :
`fetch` est capturé et les requêtes sont inspectées. Pour un test de bout en bout, les pages de
`static/tests/*.html` restent les outils de diagnostic manuels.
