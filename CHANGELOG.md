## [3.158.0] - 2026-08-30

### 🌤️ La météo dans Santé, Rapports et PI Planning (maquette `02-sections`)

La direction Météo arrive sur les trois autres vues de pilotage, avec **le même calcul**
(`computeTeamMeteo`) — l'écran dit partout la même chose :

- **Santé** — la matrice équipes × domaines (ou les pastilles si une équipe est filtrée)
  s'affiche **sous le score**, avant les anomalies : c'est cette vue qui la nourrit (score
  normalisé, anomalies), autant qu'elle la montre. Groupée par ligne produit quand il y en a
  plusieurs ; une ligne cliquée filtre Santé sur l'équipe.
- **Rapports** — une ligne **🌤️ Météo** dans le rapport de sprint, dans les trois formats
  (texte, Slack, Confluence), juste après l'objectif : une équipe → ses cinq domaines
  (« ⛅ Variable — 🏃 Sprint ⛅ 65 % · 🗓️ PI ☀️ 56 % · … »), plusieurs → le pire niveau et les
  équipes en 🌧️ / ⛈️ nommées. Le rapport complet l'hérite. PI courant seulement.
- **PI Planning** — une tuile **« Météo du PI »** dans l'en-tête (le domaine 🗓️ de la matrice :
  avancement rapporté au temps écoulé) ; pour plusieurs équipes, le compte de celles en avance.
  L'infobulle porte la ligne complète.

Nouveau composant [meteo_report.js](static/js/components/meteo_report.js) (`meteoSummary`,
`METEO_MC`) — pas de nouvelle règle, seulement une mise en forme.

## [3.157.0] - 2026-08-29

### 🔭 Prévisions multi-PI, lignes produit dans la matrice, fin de journée TV

Trois compléments de la Météo des équipes, dans le prolongement des maquettes (`07`, `10`, `12`).

**🔭 Prévisions — la météo à cinq PI** ([meteo_previsions.js](static/js/components/meteo_previsions.js)),
en tête de la **Roadmap**, autour du PI *courant* (pas du PI affiché par le sélecteur) :

| PI | Mesure | Échelle |
|---|---|---|
| passé | Σ `velocity` / Σ `estimated` des sprints JIRA (repli : tickets terminés) | absolue — la même que la prédictibilité SAFe |
| en cours | % du périmètre `belongedToPi` réalisé, comparé au temps écoulé du PI | relative |
| à venir | engagement (Σ `estimated` des sprints, sinon Σ points des features du PI) rapporté à la **base de capacité** (`piCapacityBase`, celle de Santé) | ≤ 100 % ☀️ · ≤ 115 % ⛅ · ≤ 130 % 🌧️ · au-delà ⛈️ |
| inconnu | — | ⚪ à planifier |

Un PI peut donc être 🌧️ **avant d'avoir commencé** — et c'est le moment de le dire, au PI
Planning plutôt qu'à la revue (le sous-titre le formule ainsi). Une phrase de prédictibilité
suit : livré en moyenne sur les PI passés, base du PI suivant (⚠ plafond si les absences ne
sont pas connues jusqu'au bout), engagement prévu en % du livré habituel.

**🧩 Lignes produit dans la matrice** : quand le périmètre couvre au moins deux lignes produit,
la matrice se groupe — un en-tête par ligne portant le **pire niveau** de ses équipes (jamais une
moyenne : elle cacherait un orage), puis « Autres équipes ». Dashboard et écran TV.

**🌙 Fin de journée sur la TV** : de 19 h à 8 h, plus de rotation — le bilan du jour seul,
tamisé, 2 min par tour, l'alerte ⛈️ toujours en tête si un blocker > 48 h subsiste.
`sb-tv-night=0` désactive.

Vérifié en chargeant réellement les modules : PI 28 ☀️ 90 %, PI 29 ⛅ 70 %, PI 30 relatif,
PI 31 surchargé (414 % d'une base de 87 pts sur le jeu synthétique), PI 32 ⚪ ; en-têtes de
groupe (2), un seul groupe = pas d'en-tête, équipe hors groupe → « Autres équipes » ; suite
existante au vert (242).

## [3.156.0] - 2026-08-29

### 📺 Mode TV : la météo du train en rotation, et l'alerte qui l'interrompt

Nouvelle vue `#tv` ([tv.js](static/js/views/tv.js), hors `NAV_ITEMS` : bouton **📺 TV** du
topbar, ou l'URL) — ce que l'écran mural affiche seul, sans sidebar ni topbar, agrandi
(`zoom` réglable par `--tv-zoom`) :

| Écran | Contenu | Durée |
|---|---|---|
| 🌤️ Météo du train | la matrice équipes × domaines en grand | 30 s |
| 🧭 Plans d'action | les équipes en 🌧️ / ⛈️ (3 max) avec leur plan ; « ☀️ Rien à débloquer » sinon | 25 s |
| 📅 Aujourd'hui | terminés du jour, en cours, bloqués (dont > 48 h), équipes à surveiller | 20 s |
| ⛈️ **Alerte** | **en tête de chaque tour tant qu'un blocker > 48 h existe** : ticket, équipe, responsable, depuis quand (3 max) | 20 s |

L'alerte est la règle `oldBlockers` de Santé (`ANOMALY_BY_KEY`), pas une réécriture. Elle ne
bloque pas la rotation indéfiniment : elle la **précède à chaque tour** jusqu'à ce que le ticket
bouge, et un bandeau rouge la rappelle sur les autres écrans. Périmètre = celui du topbar
(toutes les équipes, une ligne produit, ou une équipe).

Clavier : ← → écran, Espace pause (le survol aussi), F plein écran, Échap quitter. `#tv/all/meteo`
fige un écran ; `sb-tv-seconds` force une durée unique. La vue se redessine à chaque sync
(`store.on('tickets')`) sans repartir du premier écran, et se nettoie (timers, écouteurs, classe
`tv-mode`) dès qu'on la quitte — vérifié.

## [3.155.0] - 2026-08-29

### 🌤️ Paramètres → Seuils météo, avec aperçu vivant

Nouvel onglet **Météo** dans Paramètres ([settings-meteo.js](static/js/views/settings-meteo.js),
même découpage que `settings-jira.js`) : les trois seuils de l'échelle absolue (attention /
variable / beau, défauts 40 / 60 / 80), **identiques pour toutes les équipes** — une équipe ne se
choisit pas une météo plus clémente, sinon deux ⛅ ne veulent plus dire la même chose.

- **Aperçu vivant** : chaque saisie recalcule la vraie matrice avec le brouillon (mode
  `preview` de `meteoMatrixHtml` : lignes inertes, sans « ? ») — on voit qui change de couleur
  **avant** d'enregistrer.
- Validation : entiers 1–100, croissants ; un refus s'explique dans la section, pas dans un toast.
- Enregistrement dans `sb-meteo-thresholds` (local à ce navigateur, comme les autres `sb-*`) ;
  « Valeurs par défaut » l'efface. Les bandes de l'échelle relative (±10, tolérance 15 %) sont
  rappelées mais ne se règlent pas ici — ce sont des constantes de `utils/meteo.js`.
- Alias `#settings/meteo` (app.js).

## [3.154.0] - 2026-08-29

### 😊👥 Fiche équipe : tendance du mood et roster du PI

Sous le plan d'action du Dashboard filtré, une rangée de plus
([meteo_fiche.js](static/js/components/meteo_fiche.js)) :

- **Tendance Mood & confiance** — la moyenne des votes de chaque sprint de l'équipe (clos + actif,
  8 derniers), en sparkline puis case par case avec le ✊ Fist of Five en dessous et le sprint en
  cours mis en avant. Appariement par clé `NN.N` comme `health-votes.js`. Répond au **#13 du
  BACKLOG** (courbe de confiance) sans nouvelle table : les votes existent déjà par sprint. Sous
  deux sprints votés, la card dit ce qu'il manque au lieu d'afficher une courbe vide.
- **L'équipe — roster du PI** — `effectiveRosterForPi` (snapshot du PI, sinon dérivation des
  absences), capacité pondérée par rôle (`teamEtp`, Paramètres → capacité par rôle : un PO à 0 %
  est listé mais ne compte pas), rôle inconnu signalé, **prochaine absence** de chacun (« 2 → 3 sept.
  (2 j) », « 🌴 absent » si en cours). Le sous-titre donne l'ETP réel, pas le nombre de têtes.

`meteoContext()` porte désormais `piInfo` et `fistVotes`.

## [3.153.0] - 2026-08-29

### 🧭 Fiche équipe : le plan d'action — la météo qui propose

Deuxième brique de la Météo des équipes, sur le Dashboard **filtré sur une équipe** :

- **Plan d'action** ([meteo_plan.js](static/js/components/meteo_plan.js)) sous les pastilles :
  une ligne par anomalie détectée (`ANOMALY_RULES`), triée par gravité puis effectif, avec
  l'effectif, les **responsables concernés** (initiales, `+n` au-delà de deux, « non assigné »
  quand c'est l'action elle-même) et une **échéance dérivée de la gravité** — aujourd'hui /
  cette semaine / avant le prochain sprint. Une liste sans « qui » ni « quand » n'est pas un plan.
  Chaque ligne ouvre la **modale d'action existante** (`openAlertModal`, celle de Santé), qui
  liste les tickets et permet de les corriger en ligne — rien n'est réinventé.
  La card est teintée par le niveau de l'équipe (⛈️ / 🌧️ : « Ce qui ferait revenir le soleil »,
  sinon « À garder à l'œil ») et **disparaît** quand il n'y a aucune anomalie.
- Les pastilles **Sprint** et **SLA** font défiler jusqu'à leur card du Dashboard ; Santé et PI
  mènent toujours à leur vue.
- `computeTeamMeteo()` expose désormais `anomalies[]` (règle, effectif, responsables) —
  même contexte que `health.js` (WIP vs capacité du jour, début de sprint).

Vérifié en chargeant réellement les modules : Orion ⛈️ (bloqués en premier, 3 responsables,
`+1`, échéances), Vega sans card, XSS échappé ; suite existante au vert (242).

## [3.152.0] - 2026-08-29

### 🌤️ Dashboard : la météo des équipes, portée depuis les maquettes

Première brique de la direction « Météo des équipes » (préférée dans
[static/mockups/refonte/](static/mockups/refonte/)) dans le vrai Dashboard, sur le PI courant :

| Périmètre affiché | Ce qui apparaît en tête du Dashboard |
|---|---|
| Plusieurs équipes (« Tous » ou une ligne produit) | la **matrice équipes × domaines** — une ligne par équipe, cliquable (→ filtre équipe), clavier compris |
| Une équipe | la **rangée de cinq pastilles** de l'équipe ; Santé et PI sont des liens vers leurs vues |

Cinq domaines, chacun rattaché à une mesure **qui existait déjà** — rien n'est inventé :
🏃 Sprint (engagement `belongedToSprint`, réalisé `done` ∧ `isInSprint`, vs temps écoulé),
🗓️ PI (`belongedToPi` vs fenêtre des sprints du PI), 🛡️ Santé (score de `health.js`),
🎧 SLA (modèle de la card SLA Review), 😊 Mood (votes du sprint × 20).

**Une seule échelle**, cinq niveaux ☀️ ⛅ 🌧️ ⛈️ **⚪**, dans [utils/meteo.js](static/js/utils/meteo.js)
(module pur, exporté par le barrel) :
- **absolu** (Santé, SLA, Mood) : seuils 80 / 60 / 40, surchargeables pour toute l'organisation
  via `sb-meteo-thresholds` — jamais par équipe, sinon deux ⛅ ne veulent plus dire la même chose ;
- **relatif au temps écoulé** (Sprint, PI) : ±10 points = ⛅, jusqu'à −20 = 🌧️, au-delà = ⛈️ ;
  **tolérance de démarrage** sous 15 % du temps (J1 n'est plus un orage — réserve du README, levée) ;
- **niveau d'une équipe = le pire de ses domaines** ; **⚪ pas de donnée n'est jamais un mauvais
  signe** (aucun vote, aucun sprint) et n'entre pas dans le calcul.

⚠️ **Le score de santé a désormais une source unique** : `healthScore(counts, activeCount)` dans
[business_rules.js](static/js/business_rules.js), **normalisé par tickets actifs** — `health.js`
l'utilise (même résultat qu'avant, vérifié), la météo aussi. Un compte brut d'anomalies ne doit
jamais être présenté comme un score. `sla_review_card.js` exporte son modèle (`slaModel`) pour
la même raison.

Le « ? » de la matrice ouvre une explication à schéma (échelle en barre, les deux calculs, la règle
du pire) ; la légende de l'échelle est toujours visible, jamais dans une infobulle. Glyphes doublés
d'un libellé pour lecteur d'écran ; la matrice défile sur mobile, les pastilles s'empilent par deux.

Fichiers : `utils/meteo.js`, `components/meteo_matrix.js`, `css/views/meteo.css` (nouveaux) ;
`dashboard.js` (+5 lignes), `health.js`, `business_rules.js`, `sla_review_card.js`,
`help_popover.js`, `index.html`. Vérifié en chargeant réellement les modules (faux DOM des tests)
et par la suite existante (242 tests) — pas de nouveau test, à la demande.

## [3.151.0] - 2026-08-29

### 🌤️ Maquettes de refonte — la Météo des équipes, approfondie

Direction préférée après la première revue ([static/mockups/refonte/](static/mockups/refonte/)) :
**sept pages de plus** dans `mockup-3/`, là où une direction se juge — les écrans secondaires
et les cas limites. 28 pages au total, panneau 🎛️ et index à jour (badge « Préférée »).

| Page | Ce qu'elle a révélé |
|---|---|
| Fiche équipe (Vega ☀️, Orion ⛈️) | La fiche est le Dashboard d'équipe ; pour une ⛈️, la météo **propose** un plan d'action (anomalies pondérées → responsable + échéance) |
| Prévisions (5 PI, prédictibilité, roadmap) | Le PI 31 est 🌧️ avant d'avoir commencé : engagement à 132 % de la base |
| Board & backlog | La météo du sprint dans le titre du Board ; le vieillissement colore la carte entière |
| Paramètres & **seuils météo** | Seuils réglables mais **globaux**, aperçu de la matrice avant d'enregistrer |
| États limites (12 équipes, 1, 0, fin de PI, sans JIRA) | Niveau d'un groupe = le **pire** de ses équipes ; **⚪ pas de donnée ≠ ⛈️** |
| Comprendre la météo | Une carte par domaine (formule, source, seuils, exemple), glossaire visuel, mode apprentissage |
| TV · rotation & alerte | L'alerte ⛈️ plein écran (blocker > 48 h) nomme le ticket, la chaîne bloquée et qui peut lever |

Le socle a bougé pour ça : cinquième niveau **⚪ pas de donnée**, calcul **absolu** (Santé,
Support, Mood) ou **relatif au temps écoulé** (Sprint, PI : ±10 points = variable), niveau
d'une équipe = pire de ses domaines, seuils à un seul endroit (`_gen/data-meteo.js`,
`_gen/meteo-matrix.js`). Composants génériques nouveaux — board, backlog, paramètres, roster,
rotation, glossaire — dans `_shared/ui-pages.css`, réutilisables par toute direction.

Contrôles verts : `verify.js` (5 contrôles) et sonde Edge sur les 28 pages (aucune erreur,
aucun débordement). Deux réserves écrites dans le README avant de coder : une **tolérance
de démarrage** pour le calcul relatif (J1 ne doit pas être 🌧️), et lire le score de santé
**normalisé** par tickets actifs, jamais un compte brut.

## [3.150.0] - 2026-08-29

### 🎨 Maquettes de refonte visuelle — quatre directions, desktop & TV

Nouvelle galerie [static/mockups/refonte/](static/mockups/refonte/) pour choisir le parti
pris d'une refonte : un Dashboard plus simple, le PI Planning, les rapports de sprint et la
santé des équipes **en un coup d'œil**, coloré, avec des explications visuelles à la
demande. Rien du site n'est touché.

| | Parti pris | Point fort | Limite |
|---|---|---|---|
| 🧭 1 · Cockpit | Bento 12 colonnes, grands chiffres, une couleur par domaine | Tout tient sur un écran, TV = desktop | Peu de texte |
| 📖 2 · Journal de bord | Chapitres, une phrase de synthèse par indicateur, serif | Compréhensible sans explication | Long à parcourir |
| 🌤️ 3 · Météo des équipes | Matrice équipes × domaines ☀️⛅🌧️⛈️ + panneau de détail | Toutes les équipes d'un regard | Réducteur |
| 🛤️ 4 · Frise du PI | Une colonne par sprint, curseur « aujourd'hui » | PI, sprint et rapport = une seule vue | Exige la largeur |

Chaque direction est déclinée sur cinq pages — Dashboard (desktop + mobile + état vide),
PI Planning / Rapports / Santé, modales & aide « ? » à schéma, mode « en séance » (daily,
vote live, import JIRA, jeton expiré, hors ligne, sprint clos) et mode TV 1920 × 1080 —
soit 21 pages et 120 écrans. Un panneau 🎛️ flottant permet de changer de direction **sur le
même écran**, de basculer le thème et d'afficher des pastilles numérotées qui expliquent
chaque zone. L'avis argumenté est dans le README du dossier (Météo pour le mur, Cockpit
pour le poste, les phrases du Journal comme composant).

Ce qui rend la comparaison honnête : même jeu de données synthétique, mêmes composants
(`_shared/ui*.css` sur des tokens `--ui-*`), et les **vrais tokens du site**
(`css/tokens.css`) derrière chaque direction — seul le pont et la mise en page changent.
La bande des sprints du PI (US / Buffer / Action, glissés) est reprise telle quelle.

Généré par `_gen/build.js` (idempotent, CommonJS — d'où le `package.json` local, le
`package.json` racine étant en `"type": "module"`) et vérifié par `_gen/verify.js` :
balises, liens, variables orphelines, classes **par page**, zéro requête média, ≤ 800 lignes.

⚠️ Mesuré dans Edge plutôt que jugé à l'œil : un débordement de 26 px sur mobile venait de
**texte** sortant de sa piste de grille (`34/52` dans une colonne de 13 px) — invisible pour
`getBoundingClientRect`, qui mesure la boîte et non le texte. Seul `scrollWidth >
clientWidth` sur un élément non défilant le voit. Corrigé (anneau et liste empilés sur
mobile) et retenu pour toute sonde de maquette.

## [3.149.0] - 2026-08-28

### ✨ Rapport « PI Planning » : enfin dynamique, et lisible sprint par sprint

`#reports/<équipe>/pi` ignorait purement et simplement **l'équipe ET le PI sélectionnés** :
`GENERATORS.pi` lisait `ctx.piInfo.objectives` — le tableau brut du PI *courant*, toutes
équipes confondues — puis le regroupait par équipe. Sur `#reports/Gabbiano/pi` on lisait donc
les objectifs de Fuego, Helica et les autres ; sur un PI passé, on lisait ceux du PI en cours.

| | Avant | Après |
|---|---|---|
| Objectifs | tous, toutes équipes | ceux de l'équipe du hash, via `resolvePiObjectives()` |
| PI passé / à venir | objectifs du PI courant | snapshot `piObjectives[<PI>]` |
| Objectif sans équipe | noyé dans le groupe `-` | bloc « transverses » à part, jamais masqué |
| Détail | aucun | **par sprint : User Stories et Buffer, titre + story points** |

La section vit désormais dans son propre module [reports-pi.js](static/js/views/reports-pi.js)
(+ [reports-pi.css](static/css/views/reports-pi.css)) : en-tête avec score de prédictibilité
SAFe, objectifs séparés **Engagements / Extension** avec leur BV, puis un bloc dépliable par
sprint — barre de progression, `N US · M buffer`, et chaque ticket avec son titre, ses points
et son statut. Les sprints incomplets s'ouvrent seuls, les sprints soldés restent repliés.

⚠️ **Le périmètre d'un sprint passe par `sprintScope()`**, pas par `sprintName` : la section
part de `teamTickets` (tous les tickets de l'équipe, `ctx` enrichi) et non des tickets déjà
réduits au PI affiché — un ticket reporté porte le sprint d'**arrivée**, souvent d'un autre
PI, et disparaîtrait de son sprint d'engagement. L'engagement compte donc les reportés
(chip `↪ 30.2`), le réalisé exige d'être encore dans le sprint. Corollaire visuel :
`.rpt-ti--done.rpt-pi-ti--open` **annule** le grisé/barré hérité de `reports.css` — un ticket
`done` ailleurs présenté comme tenu dans le sprint où il ne l'a pas été serait un mensonge.

Le sprint de respiration est marqué 🍃 (`breathIdxOf`, source unique).

**Le bouton « Copier » rend un texte prêt à coller** (Confluence, Slack, mail) : emoji en
tête de ligne et puces `- ` que l'éditeur Confluence convertit en vraie liste — plus de
`=== TITRE ===` ni de `[x]`, qui ne survivaient à aucun collage.

```
🗓️ PI #30 — Gabbiano (PI courant)

- 🎯 Objectifs : 1/3 atteint
- 🏆 Prédictibilité : 62 %
- 💎 Story points : 15/36 (42 %)
- 💰 Business Value : 8/13 engagés

📆 Sprint 30.1 — 13/18 pts (72 %)

📝 User Stories — 1/3 terminé, 5/10 pts
- ✅ Refonte de la page de connexion — 5 pts
- ↪️ Correctif calcul de TVA — 2 pts (reporté en 30.2)
```

⚠️ Une puce ne commence JAMAIS par un emoji : Confluence n'auto-formate que si la ligne
débute par `- `. Et l'icône d'un ticket suit `doneIds` (réalisé dans CE sprint), pas
`t.status` — un reporté terminé ailleurs porte ↪️ et sa destination, jamais ✅.

Les helpers Slack/Confluence `B` / `E` / `SB` / `CS` sortent dans
[reports-fmt.js](static/js/views/reports-fmt.js) : `reports-pi.js` les partage **sans**
importer `reports.js`, un cycle mettrait ces `const` fléchées en TDZ. `reports.js` perd 51
lignes au passage.

### 🐛 « Rafraichir tous » (calendriers) échouait là où un par un fonctionnait

Cause mesurée dans `logs/squad-boards-drafts-error-46.log`, pas devinée :

```
sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached,
connection timed out, timeout 30.00
  File "app/routers/calendars.py", line 63, in refresh_calendar
```

`refresh_calendar` gardait sa session SQLite ouverte **pendant le fetch ICS**, soit jusqu'à
30 s par calendrier. Le bouton lançant les 16 calendriers de front, le pool (5 + 10 overflow)
était épuisé dès le 16ᵉ. Un par un, la même route n'a jamais posé de problème : la
concurrence était le seul facteur. Symptôme visible en base — 8 calendriers figés au
2026-06-29.

Deux corrections :
- **backend** : la connexion est **rendue au pool avant l'appel réseau** (`session.close()`)
  et reprise après (l'objet détaché est rechargé par un second `session.get()`). Une
  connexion n'est plus tenue que quelques millisecondes ;
- **frontend** : `_refreshPooled()` ([cal_banner.js](static/js/components/cal_banner.js))
  borne la concurrence à 4 — garde-fou quel que soit le nombre de calendriers, et ménage
  aussi le serveur ICS distant. `syncCalendars()` et la synchro depuis la modale semaine
  passent toutes deux par lui.

Le toast ne dit plus seulement « 2 en échec » : il **nomme** les calendriers fautifs et la
première cause. Un ICS cassé (URL révoquée, 404) restait sinon invisible derrière un compteur.

## [3.148.0] - 2026-08-25

### 🐛 Mode « Ajouter » : une absence corrigée n'était pas reprise

La clé de déduplication est `(nom, début, fin)` — **elle ne contient pas la durée**. Trois
comportements, tous silencieux, mesurés en rejouant la logique de `bulk_create_absences` :

| Cas | Avant | Après |
|---|---|---|
| Durée corrigée 0,5 j → 1 j | **ignorée** — la correction se perdait, l'absence gardait ses 0,5 j | **mise à jour** (`updated`) |
| Équipe ou type modifié | ignoré de même | mis à jour |
| Consolidation différente (`09→09` puis `09→10`) | deux enregistrements créés, **le 09 compté deux fois** | créé **et signalé** (`overlaps`) |
| Absence identique | ignorée | ignorée (inchangé — pas de bruit) |

⚠️ Le premier cas était le plus coûteux et le moins visible : réimporter pour corriger une
demi-journée ne changeait **rien**, sans le moindre message. Le compte rendu disait
« 1 doublon » — mot trompeur, remplacé par « inchangée(s) ».

**Les chevauchements ne sont pas fusionnés automatiquement** : décider qu'un `09→09` et un
`09→10` n'en font qu'un est un arbitrage métier. Ils sont créés comme avant, mais un second
toast (`warning`, 9 s) les nomme et rappelle que « Écraser la période » repart propre — le
silence, lui, laissait la capacité fausse sans que rien ne l'indique.

Comparaison de durées tolérante (`1e-6`) : `0.5` et `0.50` ne déclenchent pas de fausse
mise à jour après un aller-retour JSON.

## [3.147.1] - 2026-08-25

### 🐛 « Écraser le PI » laissait passer les jours PIP

Question posée : *« l'écrasement retire-t-il bien tout du PI avant de pousser ? »* — **non**,
et la mesure l'a confirmé.

`rangeEnd` valait `piEndDate`, qui **exclut par construction** les `pipDays` dernières
colonnes (le PI Planning du PI suivant, 2 par défaut). Or les absences de ces jours-là
**sont importées**. La fenêtre de suppression s'arrêtait donc avant elles :

```
Colonnes CSV   : 03/04 04/04 07/04 08/04 | 09/04 10/04   ← PIP
Fenêtre AVANT  : 03/04 ─────────────► 08/04              ← s'arrête ici
Fenêtre APRÈS  : 03/04 ─────────────────────────► 10/04
```

Conséquence : une absence PIP d'un import précédent **survivait**. Et comme la
déduplication backend porte sur `(nom, début, fin)`, une ancienne entrée `09→09` ne
dédoublonnait pas une nouvelle `09→10` consolidée — **deux absences pour les mêmes jours**.

La fenêtre couvre désormais **tout ce que le fichier décrit**, PIP compris : le fichier fait
autorité sur toutes les dates qu'il liste. `piEndDate` reste inchangé par ailleurs (il sert
au calcul des dates du PI et de `sprintsPerPIFromCsv`).

⚠️ **Second comportement, celui-ci volontaire mais désormais écrit dans la modale** : la
suppression porte sur le **chevauchement**, pas l'inclusion. Un congé du 30/03 au 06/04 est
supprimé *en entier* quand on écrase un PI commençant le 03/04 — sa part de mars comprise —
puis seuls les jours listés par le CSV sont réimportés. Le libellé du bouton le dit
maintenant explicitement, au lieu de laisser la surprise à l'utilisateur.

### 📥 Import CSV — les deux suites

**Détail des cellules ignorées.** Le bandeau donnait un compte et cinq exemples : de quoi
savoir qu'il y a un problème, pas de quoi corriger le fichier. Un `<details>` replié liste
désormais **ligne, personne, jour et valeur** (borné à 60 entrées, hauteur limitée à 220 px
pour ne pas repousser le bouton « Importer » hors de l'écran). Le numéro de ligne est celui
du fichier, en-tête compris — celui qu'on cherche dans Excel.

**Conversion du séparateur sur place.** Le diagnostic « colonnes séparées par des virgules »
renvoyait vers un ré-export Excel. Un bouton **↔ Convertir les virgules en point-virgules**
le fait directement.
⚠️ `convertCommasToSemicolons()` ne peut pas être un `replace(/,/g, ';')` : il casserait
chaque nom « NOM, Prénom » en deux colonnes et décalerait toutes les dates. Il ignore donc
les virgules entre guillemets, **et** celles suivies d'une espace + majuscule après une
lettre — le format RH le plus courant. Vérifié : `DUPONT, Jean,Fuego,ACME,Dev,1,1,0.5`
devient `DUPONT, Jean;Fuego;ACME;Dev;1;1;0.5`, le CSV redevient parsable et le nom est
intact.

## [3.147.0] - 2026-08-25

### 📥 Import CSV des absences : l'échec cesse d'être silencieux

Diagnostic du parser sur des exports RH réalistes — trois silences, dont un coûteux.

**🔥 Le pire : des codes au lieu de nombres.** Un export écrivant `CP` ou `RTT` dans les
cellules plutôt que `1` / `0.5` produisait un import **parfaitement silencieux** : membres
créés, **zéro absence**, aucun message. L'aperçu affichait « 0 absence(s) · 1 membre(s) »
et rien ne disait que quatre cellules avaient été jetées. Le parser les compte désormais et
l'aperçu les nomme : *« 3 cellule(s) ignorée(s) (« CP », « RTT ») — le format attend un
nombre de jours »*. Les lignes sans nom sont comptées de la même façon.

⚠️ La règle ne change pas : seul un nombre vaut absence. C'est le **silence** qui est
corrigé, pas l'interprétation.

**Format non reconnu : dire lequel.** « Aucune donnée valide détectée » recouvrait quatre
causes distinctes sans en nommer aucune — chercher à la main dans un export de cinquante
colonnes est décourageant. `diagnosePivotCsv()` rend un titre et un indice actionnable :

| Cas | Message |
|---|---|
| Séparateur virgule | « Seuls la tabulation et le point-virgule sont acceptés — la virgule fait partie des noms (« NOM, Prénom ») » |
| Dates `03-04` | « Le format attendu est jj/mm — un remplacement « - » → « / » suffit » |
| < 3 colonnes de date | « Vérifiez que la ligne d'en-tête est bien la PREMIÈRE ligne collée » |
| Une seule ligne / vide | message dédié |

**Dépôt de fichier.** La zone accepte un `.csv` / `.tsv` / `.txt` glissé — passer par Excel
pour copier-coller était une étape de trop. Un `.xlsx` déposé est refusé avec la marche à
suivre, plutôt qu'ignoré : le lire demanderait une dépendance npm, interdite côté frontend.

**Aperçu automatique.** Il se rejoue au collage et au dépôt (et reste sur le bouton) : une
erreur de format se voit **avant** de cliquer « Importer », pas après.
⚠️ `setTimeout(…, 0)` sur l'événement `paste` : au moment où il se déclenche, la valeur du
champ est encore l'ancienne.

**Accessibilité.** Le champ n'avait qu'un `placeholder` en guise de nom — anti-pattern
connu : il disparaît à la saisie et n'est pas fiablement annoncé. Il a maintenant un vrai
`<label for>` et un `aria-describedby`. Le placeholder retrouve au passage ses accents
(« données », pas « donnees »), conformément à la convention « UI en français ».

## [3.146.2] - 2026-08-25

### ↔️ Rail appliqué aux barres qui le méritent — et seulement à celles-là

⚠️ **Ma liste initiale de huit barres candidates venait d'un `grep flex-wrap: wrap`** : elle
mélangeait navigations, barres d'outils et aperçus. À l'examen, deux seulement sont des
barres de navigation à contenu variable :

| Barre | Verdict |
|---|---|
| `.activity-filters` | ✅ migrée — chips par champ ET par auteur, nombre non borné |
| `.db-oncall-chips` | ✅ migrée — astreintes du jour, suit le périmètre, en tête de dashboard |
| `.quick-filters` | ❌ contient un `<input>` de recherche : le focus clavier ferait défiler le rail de façon imprévisible |
| `.bl-flt-chips` | ❌ vit dans un popover — largeur libre, grandir en hauteur n'y coûte rien |
| `.agenda-toolbar`, `.rot-toolbar` | ❌ barres d'outils avec libellés et hints : le texte doit passer à la ligne, pas défiler |
| `.jira-project-chips` | ❌ aperçu statique dans une bannière, pas une navigation |
| `.grp-chips-row` | ❌ liste éditable dans une carte : le wrap n'y coûte pas d'écran permanent |

Le `MutationObserver` du composant (3.146.0) sert précisément aux deux barres retenues :
leur contenu se re-remplit sans que leur largeur change.

## [3.146.1] - 2026-08-25

### 🗑 Retrait de ROAM (front)

Fonctionnalité inutilisée — **0 risque en base**. Deux points d'entrée supprimés : la vue
« Risques ROAM » de la barre latérale, et l'onglet ⚠️ ROAM de PI Planning. Partent avec
eux `views/roam.js`, `css/views/roam.css`, les trois entrées de la palette de commandes,
la case « Risques ROAM » de l'export, le bloc du jeu de démonstration, et la ligne
« 📌 Les risques identifiés (ROAM) » du message type de PI Planning.

⚠️ **Le backend est CONSERVÉ** : routes `/api/risks`, modèle `Risk`, colonne, serializer.
Rien n'est perdu et le front se restaure d'un `git revert`. Les helpers `getRisks` /
`createRisk` / `updateRisk` / `deleteRisk` d'`api.js` n'ont donc plus d'appelant — un
commentaire le dit sur place, pour qu'ils ne passent pas pour du code vivant.

⚠️ Piège évité au passage : `demo.js` porte des champs `risk:` sur la **mobilité Atlas**
(risque de départ d'une personne) qui n'ont rien à voir avec ROAM. Un retrait au grep les
aurait emportés.

## [3.146.0] - 2026-08-25

### ↔️ La barre d'onglets de Paramètres devient un rail défilant

Nouveau composant [nav-rail.js](static/js/components/nav-rail.js) + sa feuille : une barre
qui **défile** au lieu de passer à la ligne. Chevrons affichés du seul côté où il reste des
onglets, dégradés de bord pour signaler la coupe, recentrage de l'onglet actif à
l'activation. Appliqué à `.settings-tabs` (14 onglets), maquettes et arbitrage dans
[mockups/nav-scroll](static/mockups/nav-scroll/README.md).

Mesuré dans Edge, avant → après :

| Appareil | Lignes | Barre | Main visible |
|---|---|---|---|
| Fold fermé · 344 | 9 → **1** | 259 → **60 px** | 43 % → **91 %** |
| iPhone SE · 375 | 8 → **1** | 227 → **60 px** | 44 % → **91 %** |
| iPhone 14 · 390 | 8 → **1** | 227 → **60 px** | 48 % → **91 %** |
| Pixel 7 · 412 | 7 → **1** | 227 → **60 px** | 54 % → **91 %** |
| iPad mini · 768 | 3 → **1** | 157 → **60 px** | 71 % → **91 %** |

Le regroupement Équipe / Planning / Intégrations / Système est **préservé** : les
`.stg-tab-group` restent des colonnes, alignées horizontalement dans le rail. C'est mieux
que la maquette A, qui les aplatissait.

#### Trois pièges rencontrés, tous mesurés

⚠️ **Ordre de chargement des feuilles.** `.nav-rail { flex-wrap: nowrap }` et
`.settings-tabs { flex-wrap: wrap }` portent sur le même élément avec la **même
spécificité** : à égalité, c'est l'ordre du `<link>` qui tranche. Chargé avant
`settings.css`, le composant perdait — le rail continuait de wrapper sur 4 lignes.
`nav-rail.css` est donc chargé **en dernier**, commentaire à l'appui dans `index.html`.

⚠️ **C'est le WRAPPER qui colle.** `position: sticky`, le fond et les marges négatives ont
migré de `.settings-tabs` vers `.nav-rail-wrap` : un élément collant placé dans un
conteneur à sa taille exacte ne colle pas. `_publishTabsHeight` mesure donc le wrapper —
mesurer la barre seule sous-estimerait la hauteur recouvrante et `scrollIntoView` viserait
trop haut. `--stg-tabs-h` et le `scroll-padding-top` restent en place (repli 104 → 56 px).

⚠️ **Un ResizeObserver ne voit pas un changement de CONTENU.** Retirer des onglets change
`scrollWidth` sans changer la taille du rail, qui occupe toute la largeur : le chevron
droit restait affiché, prêt à faire défiler vers du vide. Constaté en mesure, corrigé par
un `MutationObserver` sur `childList`. Le cas n'est pas théorique — les barres à contenu
dynamique (chips d'équipe, projets JIRA, astreintes) se re-remplissent sans jamais changer
de largeur.

`flex-wrap: wrap` reste écrit sur `.settings-tabs` : sans JS, on retombe sur l'ancien
comportement, dégradé mais utilisable, plutôt que sur une barre tronquée sans moyen de
défiler.

## [3.145.2] - 2026-08-25

### Statuts JIRA non déclarés : 19 tickets livrés comptés comme non commencés

Dernier endroit où un renommage JIRA faussait une métrique en silence. `mapStatus()` est un
lookup **exact** dans `STATUS_MAP`, avec **repli muet sur `todo`** : un libellé absent de la
table ne lève rien, ne s'affiche nulle part, et prive le ticket de ses dates de cycle.

- Statut de **travail** non reconnu → `startedDate` jamais posé, ou posé **trop tard** si un
  autre statut reconnu suit — cycle time nul, ou raccourci sans que rien ne le signale.
- Statut de **livraison** non reconnu → `resolvedDate` jamais posé → cycle **et** lead time
  nuls, et le ticket reste affiché « à faire » alors qu'il est livré.

Relevé sur la base : **19 tickets livrés** (« en cours de qualification », « a livrer en qual »)
étaient dans ce cas, et **22 tickets** gagnent un démarrage donc un cycle time calculable.
`STATUS_MAP` passe à 112 libellés : statuts de travail manquants (relecture, relecture tech,
test dev, test recette, correction en cours, wireframes/maquettes — du design, mais du travail),
statuts de livraison manquants, et **les files d'attente amont déclarées EXPLICITEMENT** (a
estimer, a spécifier, a livrer en dev, prêt à développer, 3 amigos…). Elles valaient déjà
`todo` par repli : les écrire ne change rien au comportement, mais distingue « classé amont »
de « oublié » — c'est précisément ce que le test vérifie.

⚠️ **Effet après la prochaine sync seulement** : `status`, `started_date`, `resolved_date` et
`cycle_time_days` sont figés en base à l'import.

**Ce que l'audit a corrigé dans mon diagnostic** : les 728 tickets « done » sans cycle time
(31 %) ne viennent PAS de là. 475 d'entre eux n'ont traversé **aucun** statut de travail —
« à faire » → « terminé / clos sans suite » : annulations, doublons, cadrages fermés. Un
cycle time nul y est la bonne réponse, pas un bug.

#### 🧪 Garde-fou : `tests/status-map.test.mjs` (45 tests, suite à 242)

Golden dataset des libellés observés → catégorie attendue, plus un test qui exige que **tout
libellé de travail ou de livraison soit une CLÉ déclarée** — sans lui, un statut oublié rend
`'todo'` exactement comme un vrai `'todo'` et passe inaperçu. Les déclencheurs du cycle time
sortent dans `CYCLE_START_STATUSES` / `CYCLE_END_STATUS` (config.js), lus par `sync.js` : la
règle est testée là où elle est écrite, plus enfouie dans une condition de `transformIssue`.

**Vérifié par mutation**, code restauré à l'identique ensuite (`diff`) : libellés de livraison
retirés → 4 échecs ; « a livrer en dev » basculé en travail → 2 échecs ; `CYCLE_START_STATUSES`
réduit à `['inprog']` → 1 échec.

ℹ️ À ne pas confondre avec `stage-flow.test.mjs` : là-bas les colonnes de flux (**où passe le
temps**), ici la catégorie d'un statut (**où en est le ticket**). Un même libellé peut
légitimement être « colonne qualif » et « catégorie done ».

## [3.145.1] - 2026-08-25

### 🎨 Maquettes « navigation qui déborde » (mockups/nav-scroll)

La barre d'onglets de Paramètres (14 sections, `flex-wrap: wrap` + `sticky`) passe à la
ligne sur téléphone. Mesuré dans Edge sur des viewports réels — la barre occupe **plus de
la moitié de l'écran** :

| Appareil | Aujourd'hui | Option A | Option B |
|---|---|---|---|
| Fold fermé · 344 | **43 %** (9 lignes) | 86 % (1) | 86 % (1) |
| iPhone SE · 375 | **44 %** (8 lignes) | 85 % (1) | 85 % (1) |
| iPhone 14 · 390 | **48 %** (8 lignes) | 86 % (1) | 86 % (1) |
| Pixel 7 · 412 | **54 %** (7 lignes) | 87 % (1) | 86 % (1) |
| iPad mini · 768 | 71 % (3 lignes) | 87 % (1) | 87 % (1) |

*(« % » = part de la hauteur d'écran restant au contenu.)*

Deux directions maquettées dans `static/mockups/nav-scroll/` — **rien du site n'est
modifié** :

- **A · Rail défilant** — une seule ligne, défilement horizontal, chevrons affichés du seul
  côté où il reste des onglets, dégradés de bord, recentrage de l'onglet actif.
- **B · Déclencheur + feuille** — la bande disparaît au profit d'un bouton « section
  courante » ouvrant une feuille en deux colonnes, groupée.

Chaque maquette embarque une **sonde** qui parcourt six appareils et rend des chiffres
(lignes, hauteur de barre, main visible, hors champ) : les options se comparent sur des
mesures, pas sur une impression.

⚠️ **Le résultat contredit l'intuition de départ** : A et B rendent le *même* espace (39 px
de barre contre 42 px). Le pari de B — payer un tap pour gagner de la place — n'a donc rien
à gagner. Avis détaillé et piste de synthèse dans
[le README](static/mockups/nav-scroll/README.md).

⚠️ La barre de référence reproduit la **vraie** structure (4 groupes en colonne avec leur
label 9 px). Une première version à plat annonçait 7 lignes là où il y en a 8 — corrigée :
une maquette qui exagère le problème ne sert à rien.

`settings-tabs` est le cas le plus visible, mais 173 conteneurs du site sont en
`flex-wrap: wrap` ; les autres barres concernées sont listées dans le README.

## [3.145.1] - 2026-08-25

### Le même biais de périmètre sur Lead time, Cycle time et le débit — et un garde-fou

Suite de 3.143.1 : les cards voisines lisaient elles aussi `sprintName`, donc ne mesuraient que
les tickets **finis à temps**. Passage à `belongedToPi()` pour toutes les mesures de durée du
Dashboard (lead/cycle time, débit 7 j, flow efficiency) et de l'onglet Indicateurs du PI
Planning (lead/cycle time, scatter, Aging WIP).

| PI29 — Lead time & Cycle time | tickets mesurés | cycle time | lead time |
|---|---|---|---|
| avant | 107 | 9 j | 54 j |
| après | **214** | **13 j** | **65,5 j** |

⚠️ **Les rétrospectives sur PI passés étaient donc toutes optimistes** — +44 % sur le cycle
time du PI29. Le PI courant, lui, bouge à peine (576 → 580 tickets mesurés) : JIRA n'a pas
encore déplacé ses tickets. Le biais grandit avec l'âge du PI, ce qui fausse surtout les
comparaisons de tendance d'un PI à l'autre.

**Aging WIP du Dashboard garde volontairement l'historique équipe complet** (commentaire posé
dans le code) : le WIP est actuel par nature et ses P50/P85 de référence viennent des tickets
terminés — les restreindre au PI rétrécirait l'échantillon sans rien gagner. Dans le PI
Planning en revanche la référence était déjà filtrée par PI : elle reçoit le périmètre engagé.

#### 🧪 Garde-fou : `tests/stage-flow.test.mjs` (36 tests)

Un libellé JIRA qui ne matche aucune colonne **disparaît en silence** — c'est ainsi que
156 tickets étaient invisibles. Golden dataset des libellés de workflow réellement observés en
base, chacun avec sa colonne attendue, **`null` compris** pour ceux qui doivent rester hors flux
(files d'attente, backlog, états terminaux). Il attrape les deux sens de l'erreur : la colonne
qui perd un statut, et la regex trop large qui compte du temps mort comme du travail.

Couvre aussi l'agrégation (`computeStageFlow`) et le périmètre (`belongedToPi`). **Vérifié par
mutation** — les trois régressions correspondantes ont été rejouées, le test tombe à chaque
fois : ancienne regex `includes('qualif')` → échec sur « a livrer en qual » ; garde des files
d'attente retirée → échec sur « prêt à développer » ; `belongedToPi` retombé sur `sprintName`
→ échec sur le ticket reporté. Code restauré à l'identique après chaque mutation (`diff`).

💡 Piège rencontré dans ce lot : **un backtick dans un commentaire HTML ferme la template
literal qui l'entoure**. Charger vraiment les modules dans Node reste la seule vérification qui
attrape ce genre de chose — une relecture ne le voit pas.

## [3.145.0] - 2026-08-25

### Mémoire des sprints clos vides + fenêtre de tickets portée à 1 an

#### 🕳 Les sprints vides, angle mort de l'archive

`_buildClosedArchive` ne peut retenir qu'un sprint ayant laissé des tickets en base. Un sprint
clos **réellement vide** n'y entrait donc jamais et se faisait réinterroger à chaque sync, pour
rien — et c'était la **totalité** des appels que l'archive laissait passer : 85 des 254 sprints
de la fenêtre, soit 33 %.

`sb-sync-emptyClosed` (localStorage, borné à 800 entrées) mémorise les sprints clos constatés
sans aucun ticket.

- ⚠️ **Inscrit uniquement sur un appel RÉUSSI renvoyant zéro issue.** Un 401 ou un timeout rend
  aussi « aucun ticket » : les confondre graverait une panne passagère dans la mémoire, et le
  sprint ne serait plus jamais redemandé. D'où le compteur `recus` posé dans le `try`, jamais
  dans le `catch`.
- Même contrepartie que l'archive, donc même interrupteur (`archiveClosed`) et même
  contournement — « Tout réimporter depuis JIRA » purge la liste (`clearEmptyClosedMemory`).

#### 🎫 `closedTicketSprints` : 13 → 26 (~1 an)

Le palier n'est atteignable que parce que les deux mécanismes le portent. Appels
`/sprint/{id}/issue` par sync complète, mesurés sur les 20 boards du parc :

| Fenêtre | Sans rien | Archive seule | + mémoire des vides |
|---|---|---|---|
| 13 sprints (~6 mois) | 254 | 85 | **0** |
| 26 sprints (~1 an) | 450 | 272 | **~28** |

Autrement dit : à un an d'historique, une sync complète coûte moins d'appels qu'elle n'en
coûtait à trois mois avant ces deux changements.

⚠️ **La prochaine sync complète paiera ~272 appels** — le passage de 13 à 26 sprints, une fois.
Les suivantes retomberont à ~28 (les sprints nouvellement clos). Progression complète du
réglage, chaque palier mesuré : 6 (~3 mois) → 13 (~6 mois, +1031 tickets, 11→14 Mo) → 26.

⚠️ Ces valeurs sont des **défauts** : une saisie existante dans Paramètres → Plugin JIRA prime.

## [3.144.2] - 2026-08-25

### 🐛 Couverture : le seuil de « résidu » sous-estimait la profondeur

Le bandeau ne comptait un sprint clos comme exploitable qu'à partir de 5 tickets. Ce seuil
avait du sens avec une fenêtre de 6 — au-delà, ce qui restait en base venait des passes
features/epics/labels, donc des tickets encore ouverts. Avec la fenêtre à 13 (3.144.1), il
sous-estimait : un sprint DANS la fenêtre a été demandé à JIRA pour lui-même, et il est
souvent maigre puisque JIRA en déplace les non-finis à la clôture.

Mesuré après la sync : **28 % des sprints clos portant des tickets tombaient sous les 5**
(médiane réelle 8/sprint, P25 à 4) alors qu'ils avaient bien été rapatriés.

Le seuil ne s'applique donc plus qu'**au-delà** de `closedTicketSprints` — deux régimes, deux
règles. Effet : la profondeur ticket annoncée passe de **7 à 12 sprints** (médiane), et la
colonne « Résiduels » retombe de 2-9 à 0-5 par équipe, ne désignant plus que de vrais résidus.

### 📊 État après la sync complète

| | Avant | Après |
|---|---|---|
| Tickets en base | 2 231 | **3 262** |
| Sprints clos | 722 | **987** |
| Poids | 11 Mo | **14 Mo** |
| Profondeur vélocité | ~18 mois | **~24 mois** (depuis août 2024) |
| Profondeur tickets | ~3 mois | **~6 mois** (depuis février 2026) |
| Équipes au plafond `closedKeep` | 10/17 | **5/20** |

Les quinze autres équipes sont désormais bornées par ce que JIRA contient, plus par le
réglage — l'objectif du passage à 60.

**Archive** : 212 sprints clos / 2 081 tickets déjà couverts. La prochaine sync complète
n'appellera plus que **85 fois** `/sprint/{id}/issue` au lieu de 260 — **67 % évités**.

⚠️ Un sprint clos **sans aucun ticket** n'entre jamais dans l'archive et sera donc réinterrogé
à chaque sync. Marginal, mais c'est ce qui explique l'écart avec le régime stationnaire
théorique (~1 appel par board).

## [3.144.1] - 2026-08-25

### Profondeur par défaut : 60 sprints de vélocité, 13 de tickets

Deux défauts relevés dans `SYNC_DEFAULTS` ([config.js](static/js/config.js)), maintenant que
le mode archive (3.144.0) rend le second soutenable.

**`closedKeep` : 40 → 60** — toujours **aucun appel JIRA supplémentaire** (la passe pagine déjà
tout le board avant de trancher, la vélocité Greenhopper arrive en un appel). Historique du
réglage, mesuré sur le parc : à 20, dix équipes sur treize butaient sur le plafond (~9 mois) ;
à 40, dix sur dix-sept y butaient encore (37-41 sprints, ~18 mois, toutes démarrant au même
mois — la signature d'une coupe). 60 vise ~27 mois, au-delà de ce que les boards semblent
contenir : c'est alors JIRA qui borne, plus le réglage.

**`closedTicketSprints` : 6 → 13** (~6 mois) — celui-ci coûte vraiment, un appel par sprint et
par board avec changelog. Bascule mesurée : **~135 sprints à télécharger une seule fois
(~1080 tickets, base ~11 → ~16 Mo), puis ~17 appels par sync** — les sprints nouvellement clos.
Sans `archiveClosed`, ces 13 sprints se repayaient intégralement à chaque sync complète (221
appels) ; c'est bien l'archive qui rend cette profondeur tenable, pas un pari sur la patience.

⚠️ La prochaine sync complète sera plus longue que d'habitude — c'est le coût unique ci-dessus.
Les suivantes seront plus rapides qu'avant le mode archive.

⚠️ Ces valeurs sont des **défauts** : une saisie existante dans Paramètres → Plugin JIRA prime
et n'est pas touchée.

## [3.144.0] - 2026-08-25

### Mode archive : les sprints clos ne sont plus retéléchargés

La sync complète est en mode `replace` — elle efface puis ré-importe. L'historique ne
s'accumule donc **jamais**, et comme `closedTicketSprints` coûte un appel par sprint **et**
par board, une fenêtre d'un an sur dix-sept boards se repayait intégralement à chaque sync.
C'est ce qui rendait tout élargissement durable impraticable.

Or un sprint **clos ne bouge plus** : périmètre, points et dates sont figés. `_buildClosedArchive()`
([sync.js](static/js/sync.js)) relit donc ses tickets depuis la base et les réinjecte dans le
payload au lieu de les redemander à JIRA. Mesuré sur le parc — **104 sprints clos, 1040
tickets** déjà couverts :

| Fenêtre | Sans archive | 1ʳᵉ sync | Syncs suivantes |
|---|---|---|---|
| 6 sprints/board | 102 appels | 22 | **~17** |
| 13 (~6 mois) | 221 appels | 135 | **~17** |
| 26 (~1 an) | 442 appels | 315 | **~17** |

Le coût récurrent devient **constant** — un sprint nouvellement clos par board — au lieu de
croître avec la profondeur demandée.

- Réglage `sb-sync-archiveClosed` (Paramètres → Plugin JIRA), **actif par défaut**. « Tout
  réimporter depuis JIRA » le contourne, et la confirmation de sync complète annonce ce qui
  sera archivé.
- ⚠️ **Contrepartie assumée** : une correction faite dans JIRA sur un sprint *déjà clos*
  (points réajustés, statut rectifié) ne redescend plus. D'où le réglage désactivable.
- ⚠️ Repose sur l'aller-retour exact entre `_ticket_dict` ([serializers.py](app/serializers.py))
  et le contrat lu par `import_all` ([data.py](app/routers/data.py)) : les objets du store
  repartent tels quels. **Y compris `createdAt`** — sans le correctif 3.143.0 qui le persiste,
  chaque archivage aurait re-daté les tickets à l'heure de la sync, soit exactement le bug
  qu'on venait de corriger.
- `seenTicketIds` fait foi à la réinjection : un ticket archivé déjà rapatrié par une passe
  fraîche (un reporté, qui porte désormais le sprint actif) garde sa version à jour.
- Les équipes retirées sont écartées de l'archive — sans ce filtre elles revenaient par la bande.
- Features et epics ne sont jamais archivés : leurs passes JQL tournent de toute façon.

### 🐛 Détecteur de plafond : faux négatif corrigé

`capped` comparait la médiane au cap. Le compte par équipe n'atteint presque jamais le chiffre
rond — le cap s'applique par **board** (une équipe peut en avoir deux) et les sprints sans date
sont écartés en amont. Relevé après la sync : dix équipes sur dix-sept entre 37 et 41 pour un
cap à 40, médiane 39 → le bandeau répondait « pas plafonné » alors que la troncature était
manifeste (toutes les équipes démarrant au même mois quelle que soit leur ancienneté réelle).

`_isCapped()` applique désormais une marge proportionnelle (10 %, au moins 1) et un vote à la
majorité des équipes.

### 📊 Effet mesuré du correctif de dates (3.143.0)

Après la première sync complète, sur les données réelles :

- `created_at` s'étale de **2020-03-04** à aujourd'hui, au lieu d'une seconde unique.
- Sprints clos en base : **375 → 722** (`closedKeep` 20 → 40), profondeur de vélocité
  **~9 mois → ~18 mois**, pour zéro appel JIRA supplémentaire.
- Anomalie « Périmètre élargi » : **360 faux positifs → 20 cas réels**. La règle comparait la
  date d'import au début du sprint et se déclenchait donc sur tout ticket non terminé.

## [3.143.1] - 2026-08-25

### « Temps par colonne » mesurait le mauvais périmètre (et perdait un statut JIRA)

Audit de la card sur le PI29, rejoué sur `data/board.db` : elle sous-estimait les durées.

**1. Le périmètre ratait 43 % des tickets.** Le filtre lisait `sprintName` — le sprint où le
ticket *se trouve* — alors que JIRA **déplace les non-finis à la clôture** : 187 tickets
travaillés en 29.x portent aujourd'hui un sprint du PI30. Ce sont justement ceux qui ont
traîné : le biais raccourcissait systématiquement les durées (survivorship bias).

| PI29 | tickets | médiane dév | médiane revue |
|---|---|---|---|
| avant | 246 | 7,0 j | 4,0 j |
| après | **452** | **8,0 j** | **4,2 j** |

Nouvelle brique `belongedToPi(t, piNum)` ([utils.js](static/js/utils.js)) — version « PI » de
`belongedToSprint()`, même source d'historique. ⚠️ **La règle engagement/réalisé n'est PAS
touchée** : `displayTickets` (dashboard) et `tickets` (vue PI) alimentent les compteurs et le
réalisé, ils restent tels quels. Seule la mesure de DURÉE reçoit le périmètre élargi, par une
variable dédiée (`_flowScopeTickets` / `flowTickets`). Dans `retro.js` le filtre reposait sur
`t.allSprints` — champ **jamais produit**, condition morte — remplacé par `belongedToSprint()`.

**2. Un statut JIRA échappait au filtre.** `« a livrer en qual »` (sans le « if ») est le
libellé de plusieurs équipes : **156 tickets**, dont 37 sans aucun autre statut de qualif,
étaient invisibles. Test porté à `/qualif|qual/` — vérifié sur les 4 libellés « qual » de
la base, zéro faux positif ; la colonne du PI30 passe à 271 tickets. Symétriquement,
`« prêt à développer »` était compté comme du dév alors que c'est une file d'attente — exclu
par une garde `!/^(pr[eê]t|[àa] faire)/`. Ces tests portent sur le **libellé JIRA brut** : un
statut oublié n'est pas signalé, sa durée disparaît simplement — vérifier contre la base avant
d'y toucher.

**3. Le badge de périmètre mentait.** « historique équipe » était écrit en dur alors que le
Dashboard passait déjà des tickets filtrés par PI. `stageFlowCardHtml(tickets, { scopeLabel })`
affiche désormais « PI #29 · périmètre engagé ». ⚠️ `bindStageFlowCard` reçoit le **même**
`opts` : il re-rend la card après chaque exclusion de ticket, l'oublier ferait retomber le badge.

**Limite assumée, écrite dans l'aide (ⓘ de la card)** : les durées ne sont pas découpées par PI.
`stageDurations` rejoue tout le changelog, de l'entrée à la sortie de colonne — or 18 % des
tickets d'un PI en traversent au moins deux (un jusqu'à 14). Le sélecteur de PI choisit *quels
tickets* sont mesurés, pas la *fenêtre de temps* : élargir le périmètre **amplifie** ce point —
un ticket qui a traversé trois PI apparaît dans les trois, avec sa durée totale à chaque fois.
Le corriger imposerait de stocker les intervalles datés dans `stage_durations` (schéma +
re-sync complet).

ℹ️ Sans rapport avec le bandeau « Couverture de l'historique » (3.143.0), qui compte
délibérément la présence actuelle : il répond à « ce sprint a-t-il été importé ? », pas à
« qu'a-t-on travaillé dans ce PI ? ».

## [3.143.0] - 2026-08-25

### Historique JIRA : dire ce qu'on a, réparer les dates, ouvrir le réglage

Question de départ : « quelle est l'ancienneté des tickets ? ». Elle n'avait pas de réponse
dans l'écran — et la donnée qui aurait dû la porter était fausse. Quatre changements liés.

#### 📅 Bandeau « Couverture de l'historique » (page Health)

Nouveau [health-coverage.js](static/js/views/health-coverage.js) + son CSS, replié par défaut
(état retenu). Il annonce les **deux** profondeurs, qui n'ont jamais été la même :

- ⚡ **Vélocité & tendances** — métadonnées de sprint, 1 appel JIRA par board ;
- 🎫 **Détail des tickets** — cycle time, engagement, scope creep ; 1 appel par sprint **et**
  par board, changelog compris.

Relevé sur le parc : 20 sprints (~9 mois) contre 6 (~3 mois). Le bandeau nomme la date à
partir de laquelle les stats ticket par ticket sont représentatives, signale le maillon faible
(l'équipe la moins couverte borne toute comparaison) et marque « ⚠ plafonné » quand la
profondeur bute sur le **réglage** et non sur ce que JIRA contient.

⚠️ **Il compte la présence actuelle (`sprintName`), PAS le périmètre engagé** — l'inverse de
la règle de [sprint-scope.js](static/js/utils/sprint-scope.js), et c'est délibéré : la question
est « ce sprint a-t-il été rapatrié ? », or l'import interroge `/sprint/{id}/issue`, qui ne rend
que les tickets s'y trouvant. Passer par `sprintNamesOf()` créditait des sprints que rien
n'avait importés — un ticket reporté quinze fois les valide tous. Mesuré : **101 sprints
annoncés contre 60 réels, et 19 contre 6 sur Initiale**. Un bandeau qui promet trois fois la
profondeur disponible est pire que pas de bandeau.

#### 🐛 Les dates JIRA étaient perdues à l'import

`Ticket(...)`, `Feature(...)` et `Epic(...)` ne recevaient ni `created_at` ni `updated_at` :
`default_factory=_now` prenait la main et **tous les tickets d'un import portaient la même
seconde**, celle de la sync. Le `updatedAt` que `sync.js` envoyait déjà était jeté, et la date
de création JIRA n'était même pas demandée.

Ce n'était pas qu'un affichage faux : `createdAt` alimente l'anomalie **« ajouté en cours de
sprint »** ([business_rules.js](static/js/business_rules.js), `infopanel.js`,
`sprint_tickets_modal.js`) et sert de repli au burndown ([charts.js](static/js/components/charts.js)).
Comparée au début du sprint, une date d'import se déclenchait sur **tout ticket non terminé** —
852 au dernier relevé.

- `transformIssue` émet `createdAt` ; les **5 passes JQL** qui ne demandaient pas le champ
  `created` (futurs, features, epics, sprints nommés PI, enfants) le demandent désormais.
- `_jira_dates()` pose les deux dates : date JIRA, sinon celle déjà en base (un ticket créé
  dans l'app ne doit pas rajeunir à chaque sync), sinon le défaut du modèle.
- `_iso_utc()` normalise le fuseau compact de JIRA (`+0200`) vers l'ISO UTC de la base.
  Nécessaire, pas cosmétique : [roadmap.js](static/js/views/roadmap.js) trie `createdAt` par
  **comparaison de chaînes**, et deux formats mêlés y produisent un ordre faux sans erreur.

#### 🎫 Le réglage de profondeur des tickets devient accessible

`sb-sync-closedTicketSprints` existait mais n'était écrit **nulle part** dans l'interface :
seule la console permettait de le changer. Il est maintenant dans Paramètres → Plugin JIRA,
avec des raccourcis exprimés en **PI** (l'unité dans laquelle se raisonne un historique SAFe —
un PI coupé en deux donne une vélocité fausse, pas partielle) et l'équivalence en mois
recalculée depuis la cadence déclarée dans « Sprint & PI ». Son coût y est écrit noir sur
blanc. `0` désactive la passe et est désormais une saisie conservée, non plus effacée.

#### ⚡ Défaut `closedKeep` : 20 → 40

Dix des treize équipes butaient sur le plafond de 20 et perdaient leur historique au-delà de
~9 mois. **Ce plafond ne faisait économiser aucun appel JIRA** : la passe pagine déjà tous les
sprints clos du board avant de trancher, et le rapport de vélocité Greenhopper arrive en un
appel pour le board entier. Le coût du changement se limite à quelques Ko de `teamSprints`.

#### 🔧 Source unique des réglages de sync

`SYNC_DEFAULTS` + `syncSetting()` dans [config.js](static/js/config.js) : les défauts vivaient
en dur dans `sync.js`, ce qui interdisait à la page Health de dire « tu es au plafond » sans les
recopier. `app.js` garde sa propre lecture de `quickDays` — il charge `sync.js` en import
**dynamique**, et partager la constante depuis la vue casserait ce lazy.

⚠️ **Après mise à jour : une sync complète est nécessaire.** Les dates et la profondeur élargie
ne concernent que les données réimportées ; une sync rapide (merge) laisse l'existant en l'état.

## [3.142.1] - 2026-08-25

### « Temps par colonne » : résumé en fin de copie Slack

Le bouton « 📋 Copier » de la card produisait un message dont chaque colonne déroule ses
tickets : sur un sprint chargé, le chiffre qui intéresse (« combien de jours en revue ? »)
se perdait dans la liste. Le message se termine désormais par un récapitulatif :

```
📊 En résumé — médiane par colonne
💻 En cours de dév : 4,8 j
👀 Revue : 4 j
📦 À livrer en qualif : 2 j
```

- **Médiane** (P50), le chiffre que porte déjà la card — pas la moyenne.
- Durées en **français** (`4,8 j`, `4 j` sans « ,0 ») via un helper unique `_jours()`, appliqué
  aussi aux blocs par colonne : deux formats de nombre dans un même message Slack se voyaient.
- Une colonne dont tous les tickets sont exclus affiche `—`, **jamais `0 j`** : `percentile()`
  renvoie 0 sur un tableau vide, ce qui se lirait comme une traversée instantanée.

## [3.142.0] - 2026-08-25

### Ctrl+K trouve les BLOCS de page, pas seulement les vues

La palette proposait les vues entières (« Dashboard ») mais aucun de leurs blocs : chercher
« Temps par colonne », « Prévision de fin » ou « Vélocité » ne renvoyait rien. Nouveau groupe
de résultats **🧩 Blocs de page** — 77 blocs sur 11 vues — qui navigue jusqu'au bloc, le scrolle
à l'écran et le fait clignoter deux secondes.

- **Catalogue** : [cmd_sections.js](static/js/components/cmd_sections.js). Chaque bloc déclare
  sa vue, son libellé, ses mots-clés (**désaccentués** : `_score()` compare des chaînes brutes,
  « velocite » ne matcherait jamais « Vélocité ») et son ancre.
- **Ancrage par LIBELLÉ VISIBLE** (`anchor`), pas par id posé dans les vues : le titre affiché
  est retrouvé sans tenir compte des accents, emojis ni compteurs « (N) ». Aucune des 20 vues
  n'a été modifiée ; un titre renommé se corrige dans le seul catalogue. `sel` prend le relais
  quand un id stable existe (`#charts-section`, `#report-sec-*`, `#section-*`).
- **Vues à onglets** (PI, Paramètres) : `tab` porte le segment de hash, posé **avec l'équipe
  courante** (`#pi/<équipe>/<tab>`) — un hash nu la réinitialiserait. Le routage passe par
  `applyHash`, seul à savoir écrire `piTab` / `settingsSection` ; un changement d'onglet **sans**
  changement de vue ne déclenche aucun listener, d'où le `rerenderView()` explicite.
- **Blocs masqués** : les `<details>` ancêtres sont ouverts avant le scroll — c'est justement
  sur leur événement `toggle` que les graphiques du Board se montent. Un bloc encore invisible
  est ignoré tant que dure l'attente (3 s), et le rendu de vue étant asynchrone (lazy loading),
  la cible est cherchée à chaque frame plutôt qu'une seule fois.
- **Paramètres** : `scroll-margin-top` neutralisé sur la vue (le décalage sticky y est déjà
  porté par `scroll-padding-top` — les deux s'additionneraient), cf
  [cmd-section.css](static/css/views/cmd-section.css).
- Un bloc introuvable au bout de 3 s le dit par un toast au lieu de ne rien faire.

**À l'ouverture de la palette**, avant même de taper : groupe « 🧩 Blocs de cette page »
(6 max) listant les blocs de la vue affichée — le cas le plus courant est de sauter dans la page
qu'on a déjà sous les yeux. ⚠️ `.map(_sectionItemHtml)` est un piège ici : l'index arrive en
2ᵉ argument et sert de terme à surligner (« 1 » surligné dans les libellés).

**Lien partageable vers un bloc** : `Ctrl`+clic (ou le badge 🔗 de la ligne) copie
`#<vue>/<équipe>[/<onglet>]~bloc=<slug>` — même geste que le `Ctrl`+clic qui ouvre un ticket
dans JIRA, et la palette reste ouverte pour enchaîner. Le marqueur `~bloc=` est retiré en tête
d'`applyHash` (avant le `~` des filtres backlog), ne route rien de lui-même — le hash porte déjà
vue/équipe/onglet — et ne fait que révéler une fois la vue rendue. Un slug inconnu (lien
obsolète) laisse simplement la vue s'ouvrir, sans message d'erreur.

- Catalogue porté à **87 blocs** : Backlog, Amélioration, Risques ROAM et Agenda en ont aussi.
- Geste documenté dans la modale des raccourcis (`?`).

## [3.141.22] - 2026-08-25

### Rotation — mode « Congés seuls », ciblage d'équipe depuis Support, doublon de génération

**Paramètres → Rotation : bouton « 🌴 Congés seuls »** (barre au-dessus des panneaux). Il masque
les marques d'affectation support de la grille pour ne laisser lire que les congés de l'équipe
(🟥 journée, 🟧 demi-journée) — le cas d'usage courant « qui est absent la semaine du 12 ? »
n'obligeait plus qu'à lire une grille où le vert du support couvrait le rouge des congés.

- **Purement visuel** : classe `rot-hide-support` sur `#rot-panels`, rien n'est écrit en base.
  État mémorisé (`localStorage`, clé `rot-hide-support`).
- La grille passe **non cliquable** tant que le mode est actif : un clic sur une case dont
  l'état n'est plus visible affecterait un membre à l'aveugle. Totaux, cadenas et actions du
  panneau (Copier / Slack / Shuffle / ✕) sont masqués avec lui.
- Un jour à la fois « en support » et en congé rend **exactement** comme un congé seul —
  les variantes `.rot-day.on.rot-day-abs-*` portent un `!important` explicitement surchargé.
- Le HTML (`_rotToolbarHtml`) et le câblage (`_rotWireToolbar`) vivent dans
  [settings-rotation.js](static/js/views/settings-rotation.js), pas dans `settings.js`.
  La barre étant **hors** de `#rot-panels`, elle n'est pas recâblée par `_rotRenderPanels`.

### « ⚙ Édition » de la page Support ouvre vraiment l'équipe

Le bouton d'un panneau `#support/<équipe>` pointait sur `#settings/rotation` et retombait sur
le filtre du topbar. Deux défauts : en vue « toutes les équipes » il n'ouvrait rien, et même
avec une équipe active le panneau restait **replié**.

- Le lien porte maintenant l'équipe : **`#settings/rotation/<équipe>`**, lue par `applyHash`
  dans `store.settingsTeam`. Volontairement **pas** `store.team` : le filtre du topbar ne doit
  pas basculer au passage sur les Paramètres. Le segment survit à la résolution des alias de
  section, à `pushHash` et à `_settingsApplyTabs` — le lien est rechargeable (F5).
- `_rotSetCollapsed(team, false)` est suivi d'un **`_rotRenderPanels`** : les panneaux sont
  déjà dans le HTML rendu (repliés), l'état ne s'appliquait donc qu'à la visite suivante et le
  `scrollIntoView` visait un panneau fermé. Vu de l'utilisateur : « Édition ne fait rien ».
- **Ancrage sous la nav sticky** : `.settings-tabs` est `position:sticky` (`top:-24px`) et
  recouvrait l'en-tête du panneau visé — nom d'équipe et actions cachés.

### Paramètres — tous les scrolls de la vue s'arrêtent sous la barre d'onglets

Le correctif ci-dessus vaut pour **toute** la vue, pas seulement la rotation : le décalage est
porté par le **scrollport** (`scroll-padding-top` sur `.content:has(.settings-tabs)`,
[settings.css](static/css/views/settings.css)) et non par chaque cible.

- Couvre les trois `scrollIntoView` de la vue : panneau d'équipe visé par
  `#settings/rotation/<équipe>`, carte de sprint imbriquée (`.sprint-nested-card`) et
  navigation clavier dans la grille de rotation — ces deux derniers en `block:'nearest'`,
  qui respecte lui aussi le `scroll-padding`.
- ⚠️ **Ne jamais y superposer un `scroll-margin-top` sur les cibles** : les deux
  s'additionnent et le scroll dépasse d'autant.
- `--stg-tabs-h` est **mesurée** au rendu (`_publishTabsHeight`, appelée par
  `_settingsApplyTabs`) et suivie par `ResizeObserver` : les groupes d'onglets passent à la
  ligne selon la largeur, une valeur figée serait fausse dès le premier redimensionnement.
  Un seul observer à la fois, et garde `typeof ResizeObserver` (absent sous `node --test`).
  `container` **est** `#content`, le scrollport lui-même (`app.js` appelle `renderer(content)`) :
  la variable atterrit donc au bon endroit — posée sur un descendant, elle n'aurait pas été
  héritée par le scrollport. Le repli CSS couvre une nav sur deux lignes.
- Halo bref (`rot-panel--targeted`, retiré à `animationend`, neutralisé sous
  `prefers-reduced-motion`) : sur une page à N équipes, un scroll silencieux ne dit pas où l'on
  a atterri.
- Ciblage à **usage unique** — libéré après le scroll, sinon un retour ultérieur sur Paramètres
  via la sidebar rouvrait cette équipe sans que rien ne l'ait demandé.

### Support — plus de doublon « Générer PI31 » / « PI31 », et confirmation avant tirage

- Le bouton « PI suivant » ne s'affiche que s'il vise **un autre PI** que le bouton principal.
  Dès que le topbar épingle le PI+1, `displayPiNum === _base.nextPiNum` et la barre montrait
  deux fois le même PI.
- Les deux boutons passent par **`confirmDanger`** (jamais `confirm()` natif) : le tirage
  RÉÉCRIT les semaines du PI ciblé, un clic accidentel effaçait une rotation déjà négociée avec
  l'équipe, sans retour arrière. La modale rappelle le nombre de semaines, la préservation du
  passé et des semaines verrouillées 🔒, et **compte les semaines déjà remplies** qui seront
  réécrites (elle passe alors en rouge). La confirmation arrive après les gardes existantes
  (semaines calculables, roster non vide, membres actifs) : pas de modale pour un tirage qui
  n'aurait de toute façon rien produit.

## [3.141.21] - 2026-08-25

### Import JIRA — le rapport d'échecs s'affiche dans la carte de sync

Le détail des incidents n'existait qu'en `console.warn`, où personne ne va le chercher, et le
toast de bilan disparaît en quelques secondes. La **carte de synchronisation** de la topbar
reste désormais ouverte quand l'import s'est terminé avec des trous :

```
⚠ Synchronisation JIRA                                   100%
  Import terminé — 8 appels JIRA en échec
  Des données peuvent manquer.
  ─────────────────────────────────────────────────────────
  JIRA a refusé la connexion. Vérifier l'URL, l'utilisateur
  et le jeton dans Paramètres → Plugin JIRA (un jeton expire).
    sprints clos (historique de vélocité)      HTTP 401 · ×3
    features (requête JQL)                     HTTP 401 · ×1
```

- `hideProgress(incidents)` **n'efface plus la carte** s'il y a des incidents : c'est
  l'utilisateur qui la ferme (`dismissSyncReport`, croix dédiée). Un import incomplet mérite
  d'être lu, pas entrevu.
- Le refus d'authentification est expliqué **en tête** avec le chemin de réglage : tant que le
  jeton est refusé, tout le reste en découle. Une panne serveur (5xx) n'évoque pas le jeton.
- Le message brut de chaque erreur reste en infobulle de sa ligne.
- Sur **exception**, la carte se referme normalement : l'erreur est déjà remontée en toast
  rouge. Le rapport ne sert qu'aux imports qui aboutissent avec des trous — les seuls que
  rien ne signalait.
- Rendu en `textContent` (jamais `innerHTML`) : les libellés d'incident viennent de messages
  d'erreur JIRA.

### Tests — 161 au total (44 suites)

`sync-report.test.mjs` : détail rendu et non plus seulement loggé, aide 401 présente,
5xx sans mention du jeton, fermeture uniquement sur action de l'utilisateur.

⚠️ Piège du harnais, noté dans le fichier : le DOM factice doit être construit **une seule
fois**. `initTopbar` capture ses éléments par id au câblage — le recréer entre les tests
laisse le composant écrire dans des noeuds orphelins, et les assertions lisent une carte que
plus personne ne met à jour.

## [3.141.20] - 2026-08-25

### Import JIRA — les échecs partiels ne sont plus avalés

Un import parcourt des dizaines de boards et de sprints ; qu'un appel échoue ne doit pas tout
interrompre. Mais les `catch` muets choisissaient l'excès inverse : l'import se concluait sur
un **toast vert** alors que l'historique de vélocité était amputé et que des sprints n'avaient
aucun ticket. Un jeton expiré produisait un import « réussi » et silencieusement creux.

- `makeIncidents()` (sync.js) collecte les échecs, **groupés par (statut HTTP, opération)** et
  comptés : trois lignes de résumé valent mieux que deux cents lignes de console — et mieux
  que le silence.
- **13 sites** y sont branchés, dont les 4 qui étaient totalement muets (`sprints active/future`,
  `sprints clos`, `rapport de vélocité`, `tickets d'un sprint clos`) et 9 qui ne parlaient qu'à
  la console (`tickets d'un board`, `features JQL`, `epics`, `sprints de cadrage`, `buffer
  historique`, `améliorations`, `configuration de board`…). Les `console.warn` existants sont
  conservés.
- Un **404 sur le rapport de vélocité reste silencieux** : c'est le cas nominal d'un board sans
  estimation, pas un incident.
- `importFromJira()` retourne `incidentCount`, `incidentSummary` et le détail ; `app.js`
  affiche alors un toast **`warning`** (9 s) au lieu du toast de succès.
- Restent volontairement muets : le parsing du localStorage des équipes exclues et la détection
  du champ Team, qui ont leurs propres valeurs de repli et leur propre avertissement.

Exercé de bout en bout avec un JIRA répondant 401 après la liste des boards — 8 incidents
collectés, résumé :

```
8 appels JIRA en échec — sprints active (HTTP 401) ×1, configuration de board (colonnes)
(HTTP 401) ×1, sprints future (HTTP 401) ×1… · JIRA a refusé la connexion : vérifier le
jeton (Paramètres → Plugin JIRA)
```

### Toasts multi-lignes

`.toast` passe en `white-space: pre-line` : un bilan de sync suivi de son avertissement se lit
sur deux lignes au lieu d'être aplati sur une (le message est posé via `textContent`).

### Tests — 154 au total (43 suites)

`sync-incidents.test.mjs` : regroupement par statut, refus d'authentification nommé
explicitement, panne serveur **non** présentée comme un problème de jeton, résumé borné à
trois groupes pour tenir dans un toast, pluriel suivant le nombre d'appels et non de groupes.

## [3.141.19] - 2026-08-24

### Sprint de respiration — une seule définition pour toute l'application

`pi.js::_isIpSprint` appliquait sa propre règle et avait **deux défauts** :

- « respiration seulement si le PI compte ≥ 6 sprints » : avec `sprintsPerPI = 5` en
  configuration, **aucune** respiration n'était jamais détectée — l'exclusion annoncée par le
  commentaire ne s'appliquait donc pas du tout ;
- la comparaison portait sur le `sprintsPerPI` **configuré** : un PI de 6 sprints voyait son
  **5ᵉ** exclu au lieu du 6ᵉ.

`breathIdxByPi()` (utils/capacity-base.js) devient la source unique : PI par PI,
`max(sprintsPerPI, plus grand index réellement observé)`. `_capAvgVelocity` (page Capacité)
s'y branche.

⚠️ **Les moyennes de la page Capacité changent** — c'était le but : la respiration, à
vélocité volontairement basse, les tirait vers le bas. Mesuré sur les données réelles :
Fuego PI 29 **14 → 16** pts/sprint, Lion PI 29 **20 → 24**, Juke PI 29 **9 → 10**.

### Console — un HTTP 401 ne se raconte plus en « aucun résultat »

Relevé en console : `GET /jira/rest/agile/1.0/board → 401`, suivi de
`JIRA import error: Aucun board scrum pour GCOM, GDEM, GEX, GDC, TRV`. Le message envoyait
vérifier la liste des projets alors que JIRA avait refusé la connexion.

- **Cause** : `catch { hasMore = false; }` (sync.js) avalait l'erreur de pagination des
  boards ; la liste vide était ensuite interprétée comme « aucun board scrum ».
- `request()` (api.js) porte désormais `e.status`, et `api.jiraErrorMessage(e, quoi)` traduit :
  401/403 → « JIRA a refusé la connexion… vérifier l'URL, l'utilisateur et le jeton dans
  Paramètres → Plugin JIRA (un jeton API expire) », 404 → URL d'instance, 5xx → indisponible.
- Le lazy-fetch des sprints clos de Health (même symptôme, « JIRA indisponible ou non
  configuré ») utilise le même message.
- Helper placé dans `api.js` et non `sync.js` : l'erreur y naît, et Health n'a pas à importer
  tout le plugin JIRA pour formater un message.

### Console — `-webkit-text-size-adjust` (base.css)

`Erreur d'analyse de la valeur pour « -webkit-text-size-adjust ». Déclaration abandonnée.`
Firefox reconnaît l'alias mais n'en accepte que `none | auto` : le `100%` était rejeté à
chaque chargement. Les deux formes (standard et préfixée) sont désormais réservées aux
moteurs qui en ont besoin, via `@supports selector(::-webkit-scrollbar)`.

⚠️ Détection à ne pas refaire autrement : `-webkit-hyphens` et `-webkit-appearance` sont
**supportés par Firefox** en alias — un `@supports` bâti dessus s'y applique quand même
(première tentative, qui ajoutait un second avertissement « Propriété text-size-adjust
inconnue » au lieu d'en retirer un). `::-webkit-scrollbar`, lui, n'existe pas chez Firefox.

### Tests — 145 au total (42 suites)

- `cap-roles.test.mjs` : le correctif de 3.141.17 (« Copie impossible » en rafale) était le
  seul vérifié par un script jetable. Vérifie qu'avec **23 rôles** un compteur ne reçoit
  qu'**un** listener, que les sliders gardent le leur, et que la copie aboutit **sans**
  `navigator.clipboard` (repli `execCommand`).
- `jira-errors.test.mjs` : un 401 parle d'authentification et **jamais** d'absence de données.
- `capacity-base` : trois cas sur `breathIdxByPi`, dont un PI plus long que la configuration.

### Non traité

`La mise en page a été forcée avant le chargement complet de la page` : avertissement de
performance dû aux **29 feuilles CSS chargées en série** dans le `<head>`. Le remède est un
regroupement des CSS — chantier à part entière, avec un risque réel sur l'ordre de cascade.

## [3.141.18] - 2026-08-24

### Base capacité — le sprint de respiration ne compte pas

Signalé en revue : la modale du PI 31 comptait son dernier sprint. Le **sprint de respiration**
(IP sprint SAFe, 🍃) ne se planifie pas — l'inclure ajoutait une itération entière de capacité
fictive, et sa vélocité volontairement basse tirait la moyenne des PI passés vers le bas.

- `breathIdxOf()` / `isBreathSprint()` (utils/capacity-base.js) : la respiration est le
  **dernier** sprint du PI, identifié par `max(sprintsPerPI configuré, plus grand index
  observé)`. Ce `max` importe : sur un PI dont tous les sprints ne sont pas encore créés
  (2 connus sur 5), le dernier connu n'est PAS la respiration, et l'exclure amputerait la base
  d'un sprint réel.
- Elle est écartée **des deux côtés** : de la moyenne de vélocité des PI passés, et du décompte
  des sprints du PI visé. La modale affiche la ligne, marquée 🍃 et atténuée, sans charge
  suggérée — le sprint existe, il n'est simplement pas planifié.
- ⚠️ `pi.js::_isIpSprint` garde une règle **différente** (respiration seulement si le PI compte
  ≥ 6 sprints). Les deux coexistent volontairement : celle retenue ici suit l'affichage 🍃 de
  la Sprint Review, qui traite toujours le dernier sprint en respiration. Divergence signalée
  en commentaire dans les deux fichiers.

### Base capacité — le roster du PI fait foi, pas les congés

Signalé en revue : un membre retiré de Gabbiano pour le PI 31 continuait d'y être compté.

**Cause** : l'effectif était dérivé de la table `absence`, où les congés d'une personne
**sortie de l'équipe** restent bien après son départ.

- L'effectif vient désormais de `effectiveRosterForPi()` → snapshot `piInfo.piMembers[<PI>]`,
  la composition réellement validée pour ce PI (repli sur les absences si aucun snapshot).
  Appariement d'équipe par `teamNameMatches` : le snapshot peut porter « Team Gabbiano ».
- **Les absences hors roster sont ignorées** (`pctOf` → 0) : sans cela, les congés de l'ex-membre
  auraient continué de réduire la capacité d'un PI auquel il ne participe plus.
- Gabbiano PI#31 : **6 personnes / 5,00 ETP → 5 personnes / 4,00 ETP**, base **46 → 35 pts**
  (cumul des deux corrections de cette version). Le roster porte aussi les rôles, ce qui fait
  disparaître l'avertissement « rôle inconnu » qui subsistait.

### Tests — rendu de la vue Health (129 tests au total)

`health-render.test.mjs` couvre la dernière partie non testée du chemin, celle où les erreurs
ne se voient qu'à l'écran (une variable oubliée dans une déstructuration passe `node --check`
sans broncher, comme `carriedCount is not defined` rencontré en développement). Verrouillé :

- le total « Charge prévue » de la modale **égale** la Base capacité de la matrice ;
- la respiration n'est ni comptée, ni suggérée, et porte son 🍃 ;
- une saisie manuelle prime sur la suggestion et perd son marquage ;
- un ticket reporté est barré et ne gonfle pas la vélocité réalisée ;
- la colonne Base capacité n'apparaît que sur un PI à venir.

## [3.141.17] - 2026-08-24

### Base capacité — l'effectif se compte en ETP, pas en têtes

Doute soulevé en revue : « comptes-tu des membres que tu ne devrais pas, des rôles autres que
développeurs ? » **Oui.** `piCapacityBase` comptait toutes les personnes ayant un congé dans
l'équipe, à égalité — Product Owner et Scrum Master compris.

- Le calcul suit désormais `piInfo.roleCapacity` (Paramètres → **Capacité dev — % de travail
  par rôle**, `/#settings/cap-roles`), déjà réglé et déjà utilisé par la page PI : Dev 100 %,
  **Tech Lead 70 %**, PO / SM / Designer / System Architect **0 %**.
- **Les absences sont pondérées elles aussi** : les congés d'un rôle à 0 % ne retirent plus
  rien à une capacité à laquelle il ne contribue pas.
- Sur les données réelles : Gabbiano passe de **6 personnes à 4,70 ETP**, Fuego de **15 à
  13,00 ETP**, Lion de **6 à 4,70 ETP**.
- `_capRolePct` (pi.js) pointe maintenant sur `roleCapacityPct` (utils/capacity-base.js) :
  une règle métier, un seul endroit.
- Un membre présent dans les congés d'une équipe mais non déclaré dans `member` pour
  celle-ci sortait **sans rôle**, donc compté à 100 % : son rôle connu ailleurs sert
  désormais de repli (cas réel : « BASSO, Lucas », Ops chez Fuego, vu dans les congés de Lion).

### Base capacité — infobulle de détail du calcul

L'infobulle de **🎯 Base capacité** déroule les trois étapes et, surtout, la liste
**nominative** des personnes comptées avec leur rôle et leur % — « qui as-tu compté ? » étant
la première question devant un chiffre de capacité :

```
2. Effectif compté : 4.70 ETP (et non 6 personnes)
   • COLSENET, Guillaume — Dev 100 %
   • GOMIS, Tanisha — Tech Lead 70 %
   · SZTYKMAN, Elsa — Product Owner 0 % ✗ exclu
```

Les rôles inconnus (comptés à 100 % par défaut) sont signalés par un ⚠ plutôt qu'écartés en
silence, tout comme la fenêtre dépassant les congés connus.

### Tests — `sprint-scope` et `capacity-base` (44 tests)

Ces deux modules sont devenus le socle de quatre vues, et leurs règles sont exactement du
genre qu'un refactor réinverse sans bruit. Verrouillé en particulier :
- un ticket reporté puis terminé ailleurs **ne gonfle jamais** la vélocité ;
- `spk = null` exige le nom exact (sans quoi le « 30.1 » des autres équipes entre) ;
- la base d'un PI **égale la somme** des bases par sprint ;
- les congés d'un rôle à 0 % ne réduisent pas la base, ceux d'un dev si.

Suite complète : **112 tests, 33 suites**.

### Correctif — `/#settings/cap-roles` : « Copie impossible » en rafale

Le clic sur « N membres » déclenchait autant de copies — et de toasts — qu'il y a de rôles
configurés (**23** en production).

- **Cause** : le câblage `.cap-role-count--tip` était imbriqué **dans** le `forEach` des
  sliders, si bien que chaque rôle réattachait un listener à *tous* les compteurs. Sorti du
  bloc : 1 listener par élément (vérifié : 23 rôles → 1 listener).
- La copie passe par `copyToClipboard()` (utils) et son repli `execCommand` : hors contexte
  sécurisé (accès en http par IP LAN) `navigator.clipboard` est absent, et l'appeler nu y
  lève une `TypeError` **synchrone** qu'aucun `.catch()` ne rattrape — d'où l'échec.
- Même correction sur « Copier un message de rotation », qui avait le même appel nu.

## [3.141.16] - 2026-08-24

### Health — 🎯 Base capacité du PI à venir (congés + vélocité des 2 derniers PI)

Nouveau calcul partagé, [utils/capacity-base.js](static/js/utils/capacity-base.js) :

```
base = vélocité moyenne/sprint (2 derniers PI) × nb de sprints × (1 − taux d'absence)
```

Deux PI plutôt qu'un pour lisser un PI accidenté (congés d'été, incident, renfort), et le
taux d'absence déduit des congés RH réellement saisis sur la fenêtre visée.

- **Matrice équipes × anomalies** — colonne **🎯 Base capacité**, affichée uniquement quand le
  PI sélectionné est **à venir** : sur un PI passé ou courant, les colonnes mesurées disent la
  vérité, une estimation à côté d'elles ne serait que du bruit. L'infobulle détaille tout le
  calcul (moyenne, sprints utilisés, jours-personne absents, ratio).
- **Modale « Sprints du PI » → Charge prévue** — pré-remplie par la base **de ce sprint**
  (congés de sa propre fenêtre), en *italique pointillé* : c'est une **suggestion**, pas une
  saisie, et elle n'est **pas** écrite en localStorage tant que l'utilisateur n'y a pas touché.
  Ordre de priorité : saisie de l'équipe → engagement JIRA (`estimated > 0`) → base calculée.
- La base du PI est la **somme des bases par sprint**, pas un ratio global appliqué au total :
  c'est ce qui garantit que le total de la modale égale la valeur de la matrice. Vérifié sur
  Gabbiano PI#31 : `7+10+9+8+10 = 44` des deux côtés.
- ⚠️ **Fenêtre au-delà des congés connus** : l'import RH s'arrête au 13/11 alors que le PI#31
  court jusqu'au 30/11. Le taux d'absence est alors un **plancher**, donc la base un
  **plafond** — la cellule passe en orange avec un ⚠ et le dit dans l'infobulle, plutôt que
  d'afficher un chiffre optimiste sans réserve.
- Un sprint sans engagement JIRA affiche désormais une charge **vide** au lieu de `0` :
  `estimated = 0` signifie « pas encore planifié », pas « capacité nulle » (le total, lui, est
  inchangé — il ignorait déjà les valeurs vides).

Relevé sur les données réelles, PI#31 : Fuego **70 pts** (−9 % ⚠), Gabbiano **44 pts** (−9 % ⚠),
Lion **32 pts** (−20 %). Lion n'a que 2 sprints connus pour ce PI : la base ne porte que sur eux,
et l'infobulle nomme le nombre de sprints réellement pris en compte.

## [3.141.15] - 2026-08-24

### Sprint Review & Dashboard — même angle mort que Health, même correction

Le périmètre reconstitué en 3.141.14 est désormais partagé : `utils/sprint-scope.js`
(`belongedToSprint`, `isInSprint`, `carriedOverTo`, `sprintScope`, `sprintNamesOf`),
ré-exporté par le barrel `utils.js`. `extractSprintLabel` y déménage — même famille, et le
dupliquer était interdit. Health n'a plus de copie locale.

**`t.allSprints` n'a jamais existé.** Six vues le lisaient
(`Array.isArray(t.allSprints) && …`) pour gérer les tickets reportés — mais rien ne l'a
jamais produit : ni colonne en base, ni écriture nulle part. Ces branches étaient donc
toujours fausses, et ces vues croyaient gérer un cas qu'elles ne voyaient pas.

- **Sprint Review** — `_ticketsOfSprint()` reconstitue le périmètre engagé, les reportés
  sont annotés `_carriedOverTo` (sur une copie, jamais de mutation du store), affichés
  barrés avec un chip `↪ 30.2`, et comptés dans un `↪ N reportés` sous la tuile Tickets.
  Sur `Team G - Ité 30.1` : **6 → 11 tickets**, « Vélocité 3 pts livré / 11 engagés »,
  « 6/11 · 55 % terminés ↪ 5 reportés » — là où l'écran affichait **6/6 · 100 %**, une
  perfection de façade. Le module savait déjà tout cela (commentaire de
  `getSprintTicketsAsync`) mais ne le corrigeait qu'en appelant JIRA : la reconstitution
  locale devient le repli quand JIRA n'est pas configuré ou joignable.
- **Dashboard** — les cartes « Sprints du PI » comptent le périmètre engagé et marquent les
  glissés. Le CSS `--slipped` / `↪` / `⚠ N glissés` existait déjà, inerte faute de donnée.
  Gabbiano PI 30 : 30.1 → 11 tk / 5 glissés, 30.2 → 11 tk / 7, 30.3 → 11 tk / 6.
- **Trois calculs dupliqués supprimés** : `openSprintTicketsModal` et `_rerenderBody`
  refaisaient leur propre filtrage et leur propre comptage, hors de la « source unique »
  `_sprintStats` que le fichier revendiquait — ils ignoraient donc la règle.
- ⚠️ **La règle est inscrite en tête de `sprint-scope.js`** : l'ENGAGEMENT utilise
  `belongedToSprint()`, le RÉALISÉ exige `isInSprint()` en plus du statut `done`. Les deux
  calculs de vélocité LIVE du Sprint Review passaient par la branche `allSprints` : si elle
  avait un jour été alimentée, la vélocité aurait gonflé rétroactivement. Ils sont
  désormais explicitement stricts.
- Le 3ᵉ argument `spk` choisit le matching : `null` = nom exact, requis dès que les tickets
  comparés peuvent venir de plusieurs équipes (la clé `NN.N` ne distingue pas le 30.1 d'une
  équipe de celui d'une autre).

**Non traité, volontairement** : `infopanel.js`, `retro.js` et `dashboard.js` (`_scopeTickets`)
lisent encore `t.allSprints` mais ciblent le sprint **actif**, qui n'a pas encore de reports —
aucun gain, et un risque réel de matching inter-équipes. `stage_flow_card.js` s'en sert pour un
libellé indicatif : l'élargir produirait des tooltips à rallonge (un ticket peut avoir traversé
15 sprints).

## [3.141.14] - 2026-08-24

### Health — le périmètre engagé d'un sprint passé était amputé de moitié

**Symptôme** : « 📋 Tickets engagés au lancement » n'affichait aucun ticket non réalisé sur
les sprints passés. Exemple relevé — `Team G - Ité 30.1` : 6 tickets, tous `done`.

**Cause** : à la clôture d'un sprint, JIRA **déplace** les tickets non terminés vers le
suivant — leur `sprintName` change. Un sprint passé ne conservait donc, localement, que les
tickets qui y avaient été finis : les engagements non tenus s'effaçaient d'eux-mêmes.
Mesuré sur le PI 30 : **1050 tickets reportés invisibles contre 878 affichés, soit 54 % du
périmètre engagé manquant**.

**Correction** : le périmètre d'un sprint est reconstitué depuis `recentChanges` — chaque
changement de champ `Sprint` porte dans son `to` la liste cumulative des sprints
d'appartenance (`_sprintsOfTicket`, mémoïsé par WeakMap). Aucun appel JIRA ni changement
backend : la donnée était déjà exposée par `serializers.py`.

- `Team G - Ité 30.1` passe de **6 à 11 tickets**, dont 5 reportés signalés avec leur sprint
  d'arrivée (`↪ 30.2`, `↪ 30.4`, `↪ 30.5`).
- Un report compte comme non tenu **même si le ticket est `done` aujourd'hui** : il l'a été
  ailleurs, après coup — son statut actuel ne dit rien de ce qui s'est passé dans ce sprint.
  Son chip de points perd d'ailleurs le vert, qui affirmerait le contraire.
- ⚠️ **La vélocité réalisée ne bouge pas** : elle ne compte que les tickets restés dans le
  sprint. Y agréger des reportés terminés plus tard créditerait un sprint de travail fait
  après sa clôture. Vérifié sur `Team G - Ité 30.1` : réalisée = 3 avant comme après.
- Les colonnes « nb engagés » et « planifié » recomptent en revanche le périmètre complet —
  elles étaient jusqu'ici mécaniquement alignées sur le réalisé pour tout sprint passé, ce
  qui rendait la comparaison prévu/réalisé sans objet.
- Le périmètre part de `allTickets` et non de `piTickets` : un ticket reporté porte le sprint
  d'**arrivée**, souvent d'un autre PI, et le filtre PI le faisait disparaître du sprint où il
  avait pourtant été engagé.
- Coût mesuré : `renderHealth` à **31 ms** sur 2142 tickets et 30 équipes.

## [3.141.13] - 2026-08-24

### Health — ✊ Confiance dans la matrice équipes × anomalies

- Nouvelle colonne **✊ Confiance** dans la matrice, juste après le Σ des anomalies : moyenne
  de tous les votes Fist of Five de l'équipe **sur le PI**, avec la distribution en infobulle.
  Elle est posée là parce que c'est le même usage que le Σ — repérer une squad à risque d'un
  coup d'œil — mais ce signal-là ne sort d'aucune règle automatique : seule l'équipe le donne.
- La cellule est cliquable **même sans aucun vote** (elle affiche alors « + voter ») et ouvre
  la modale du sprint, seule surface de saisie : une équipe qui n'a pas voté est précisément
  celle qu'on veut y emmener.

### Health — tickets engagés mais non réalisés

- Dans « 📋 Tickets engagés au lancement » et « 🛡 Buffer engagé au lancement », un ticket
  **non terminé** est désormais signalé comme engagement non tenu : ligne **orange**, ✗ dans
  la colonne ✓, liseré orange, et **titre barré si le sprint est clos**. Sur un sprint en
  cours on s'arrête à l'orange — barrer condamnerait un ticket encore rattrapable.
- Compteur **✗ N non réalisés** dans l'en-tête de section et sur chaque groupe de parent.
  Il n'apparaît que s'il y a un manque : sa présence seule est le signal.
- Marquage limité aux listes d'engagement : dans « Tickets Done » un non-done n'existe pas,
  et ailleurs ce serait du bruit.

## [3.141.12] - 2026-08-24

### Health — vote de confiance (Fist of Five) dans « Sprints du PI »

- Nouvelle colonne **✊ Confiance** dans le tableau « Sprints du PI » de la modale Health,
  à côté de 🎭 Mood : moyenne des votes du sprint, nombre de votants, distribution complète
  en infobulle, et **saisie au clic** (picker inline ✊ ✌️ 🤟 🖖 🖐️, même échelle que le
  panneau de vote PI). La ligne de total affiche la **moyenne du PI**, pondérée par le
  nombre de votes.
- Aucun changement backend : les votes partent sur `POST /api/mood` avec `type: "fist"`,
  déjà géré et déjà exposé par `/api/all` sous `fistVotes`. Un vote saisi ici est donc
  immédiatement visible en Sprint Review, sur le Dashboard et dans le panneau latéral.
- La **teinte de la ligne de total reste celle du Mood** : elle signale le climat d'équipe,
  pas la confiance dans le plan — deux verdicts distincts qui se contrediraient sur une
  seule ligne.

### Refactoring — `views/health-votes.js`

- Mood et Confiance ont exactement la même mécanique (échelle 1→5, moyenne pondérée,
  distribution, picker) : les helpers jumeaux de `health.js` sont remplacés par un module
  unique paramétré par le type de vote. `health.js` **perd 56 lignes** malgré la nouvelle
  colonne, et une correction de calcul profite désormais aux deux votes d'un coup.
- Classes CSS renommées `.htl-mood-*` → `.htl-vote-*` (elles servent les deux colonnes),
  et cellules `.htl-spr-mood` → `.htl-spr-vote`. Aucun autre fichier ne les référençait.
- Le picker reste **dans le flux** de la cellule : `.htl-sprint-table-wrap` scrolle en x,
  ce qui clipperait un positionnement absolu.

## [3.141.11] - 2026-08-24

### Tests — suite `node:test` durable (`npm test`)

- Les vérifications écrites au fil de la journée vivaient dans un dossier temporaire : elles sont
  désormais dans [tests/](tests/) — **68 tests, 21 suites, ~1 s**, sans dépendance ni navigateur.

  | Suite | Couvre |
  |---|---|
  | `rotation.test.mjs` | matching d'équipe, roster du shuffle, en-tête de colonne, itérations |
  | `pi-weeks.test.mjs` | égalité Rotation ↔ Support sur 9 configurations, ancrage, régularité |
  | `pi-config.test.mjs` | priorité des sources `pi-cfg-<N>`, fusion, écart PI ↔ Congés |
  | `recalage.test.mjs` | bandeau « Recaler ce PI sur les Congés », effet et retour arrière |
  | `objectifs-pi.test.mjs` | rendu des objectifs et envoi réel de l'enregistrement |
  | `csv-conges.test.mjs` | parser pivot RH, consolidation, replis |
  | `jira-section.test.mjs` | rendu de la section JIRA, échappement XSS, câblage |

- `helpers/fixtures.mjs` : jeu de données **synthétique** (aucun nom réel) mais calqué sur les
  pièges de production — équipe « **O** » d'une lettre, PI 30 à 6 itérations / PI 31 à 5, sprint
  `31.1` démarrant un **dimanche**, boards `PI#32`/`PI#33` sans sprint, `piInfo.startDate` périmée.
  Chaque particularité a causé un bug réel ; le fichier le documente.
- `helpers/env.mjs` : environnement DOM minimal, factorisé (il était dupliqué dans chaque test).
  Son faux élément **échappe réellement** — `esc()` passant par `createElement` + `textContent`,
  un stub naïf lui fait renvoyer une chaîne vide et efface silencieusement tout le contenu
  interpolé des rendus testés.
- ⚠️ `node --test tests/` échoue sur Node 22 (il charge `tests` comme un fichier) : le script npm
  passe un motif — `node --test "tests/*.test.mjs"`.

### Refactorisation — exports pour les tests

- `_detectSprintsPerPI` et `_rotFirstWorkday` (settings-rotation.js), `_supPiWeeks` (support.js) et
  `renderObjectives` (pi.js) sont exportés. Les suites importent les modules directement, au lieu
  d'en fabriquer une copie « sonde » à chaque exécution.

---

## [3.141.11] - 2026-08-24

### Health — ligne de total dans la modale des sprints du PI

- **`.htl-sprint-table` gagne un `<tfoot>`** qui totalise les 7 colonnes chiffrées : charge
  prévue, ⚡ vélocité (nb / planifié / réalisée) et 🛡 buffer (nb / planifié / réalisée).
  Le libellé rappelle le nombre de sprints du PI, et les infobulles des colonnes « réalisée »
  donnent le **ratio réalisé / planifié** sur l'ensemble du PI.
- **Un total vide s'affiche « — », pas « 0 ».** Sur un PI qui n'a pas commencé — Gabbiano
  PI 31, dont les 5 sprints sont `future` — toutes les cellules affichent déjà `—` ; des
  totaux à 0 y auraient ressemblé à un échec mesuré plutôt qu'à une absence de mesure. La
  ligne suit donc la même règle que les cellules : on compte les valeurs réellement
  mesurées, et un `0` d'un sprint clos reste bien un `0`.
- **Le total de la charge prévue se recalcule à la saisie** (`input` + `change`) : la colonne
  est éditable, un total figé serait devenu faux dès la première modification.
- **Mood moyen du PI** dans la colonne Mood du pied — même rendu que les cellules
  (visage + note + nombre de votes), avec en infobulle la distribution 1→5 et le nombre de
  sprints ayant reçu au moins un vote (`2 sprints / 5`).
  - **Moyenne pondérée par le nombre de votes**, recalculée depuis les votes bruts, et non
    moyenne des moyennes : 12 votes à 4 et 2 votes à 2 donnent **3,7** — la moyenne des
    moyennes aurait affiché 3,0 et fait passer un PI plutôt bon pour un PI moyen.
  - Non cliquable, contrairement aux cellules par sprint : on vote sur un sprint, pas sur un
    total. `—` quand aucun vote n'a été enregistré.
  - Recalculé après chaque vote, sinon le total aurait contredit la ligne modifiée juste
    au-dessus.
- **La ligne de total prend la teinte du mood** — vert ≥ 4, ambre ≥ 3, rouge en dessous —
  sur le fond et le filet supérieur : le climat du PI se lit sans lire les chiffres. Teinte
  volontairement pâle (12 %) : c'est un total, pas une alerte. Les couleurs de texte des
  colonnes (vert vélocité, violet buffer) gardent la main, seul le fond change.
  - Aucune classe sans vote : pas de teinte, donc pas de verdict rendu sur un PI qui n'a
    rien à dire.
  - Le seuil est calculé une seule fois (`_moodTotalStats`) et partagé par la ligne et la
    cellule : elles ne peuvent pas diverger. Teinte remise à jour après chaque vote.
- Le pied reprend les teintes de colonne (vert vélocité, violet buffer) et les liserés de
  groupe, pour rester aligné avec le corps du tableau — vérifié colonne par colonne.

---

## [3.141.10] - 2026-08-24

### Maquette #team — verrou des rituels imposés + les 13 équipes

- **Rituels SAFe verrouillés par défaut** 🔒 (ART Sync, Coach Sync, I&A, PI Planning, CoP) :
  ni glisser, ni éditer, ni supprimer — leur cadence est imposée par le train, pas décidée
  dans l'équipe. **Le cadenas est réversible** : un bouton rend la main et le déverrouillage
  est tracé dans la liste des modifications (`🔓 déverrouillé`). Les exports le portent :
  `CATEGORIES:…,Imposé ART` en ICS, colonne dédiée en CSV, 🔒 dans le récap Slack.
  7 verrouillés sur 21 pour Fuego, de 6 à 13 selon l'équipe.
- **Sélecteur d'équipe — les 13 équipes**, chacune avec son itération (7 ont un sprint actif,
  les 6 autres tombent sur une fenêtre de référence signalée en clair), son roster et sa
  cadence. L'en-tête de page suit. Un remaniement est isolé par équipe
  (`sb-mockup-team-cal:{équipe}`).
- **Deux chiffres faux corrigés**, révélés en passant à l'échelle : Estafette affichait
  **56 h 36 de réunions par semaine**, plus que la semaine ouvrée.
  - « Livraison en prod » dure 1440 min — c'est une **journée entière**, pas une réunion de
    24 h. Les créneaux journée sortent de la charge, s'affichent en bandeau sous l'en-tête
    (au lieu de recouvrir la colonne) et s'exportent en `DTSTART;VALUE=DATE`.
  - « Deep work — pas de réunion » comptait 8 h de réunion, alors que c'en est l'**inverse** :
    du temps protégé. Catégorie à part, hors charge.
  - Après correction : **24 h 36 de réunions, + 8 h protégées, + 1 journée bloquée**. Le
    chevauchement maximal tombe de 12 à 7 blocs, la grille redevient lisible.
- **Lisibilité de la grille** : au-delà de 4 voies, les blocs simultanés s'empilent en cascade
  décalée au lieu de rétrécir à l'infini ; le survol ramène au premier plan.
- Le harnais de vérification couvre les 13 équipes et **refuse toute charge > 40 h/semaine** —
  garde-fou contre le retour silencieux de ce genre d'agrégat.
- `exports.js` extrait de `calendar.js` : la validité d'un fichier exporté se teste sans
  l'interface.

---

## [3.141.9] - 2026-08-24

### Maquette — carte « Calendrier de l'équipe » sur #team (rien d'implémenté — à valider)

- **[static/mockups/team/](static/mockups/team/)** : la page `#team/Fuego` en miroir (vrais
  `team.css` et vraies données — 15 membres, couleur `#ec4899`, fiche d'identité vide comme
  en base), avec une carte 📅 ajoutée. Elle rend le rythme de l'équipe **visible**,
  **exportable** et **remaniable** au même endroit que sa fiche.
- **Visible** : grille horaire en deux lectures — *Itération 30.6* (les 11 jours ouvrés réels)
  et *Semaine type* (le bon niveau pour décider d'une cadence). Barre de charge au-dessus,
  recalculée à chaque modification : 13 h 44 de rituels par semaine, 21 h 16 de libre.
- **Exportable** : `.ics` (un `VEVENT` par rituel, `RRULE`, `CRLF` RFC 5545, `TZID=Europe/Paris`
  — relisible par `services/ics.py`, la boucle est fermée), `.csv` (point-virgule + BOM pour
  Excel FR), copie Slack groupée par cadence, et impression via `@media print`.
- **Remaniable** : glisser-déposer (colonne = jour, position verticale = heure au quart d'heure
  près), équivalents clavier (`←→` jour, `↑↓` 15 min, `Suppr`), panneau d'édition (titre,
  famille, cadence, jour, heure, durée), ajout / duplication / désactivation. Une barre d'état
  liste les écarts avec les calendriers détectés et permet de rétablir la détection. Rien n'est
  écrit en base : le brouillon vit en `localStorage`.
- **Défaut trouvé en produisant le fichier** : le daily de Fuego ne se tient pas le lundi
  (remplacé par le Weekly), soit 9 jours sur 11. L'export ICS produisait pourtant
  `BYDAY=MO,TU,WE,TH,FR` — réimporté dans Google Agenda, il aurait **recréé deux dailies
  fantômes par itération**. Les jours systématiquement sautés sont désormais retirés du `BYDAY`,
  et les trois exports le disent (`tous les jours sauf lundi` en CSV, `(sauf lundi)` en Slack).
- Le [README](static/mockups/team/README.md) pose 5 points à trancher, dont le plus structurant :
  **où vit la cadence** — une table `team_ritual` (deuxième référentiel, qui divergera de Google)
  ou un export seul (Squad Board aide à préparer, Google reste la source). Sans réponse au sens
  de la synchro, l'édition écrase ou se fait écraser.

---

## [3.141.8] - 2026-08-24

### Refactorisation — section Plugin JIRA extraite de settings.js

- Nouveau [settings-jira.js](static/js/views/settings-jira.js) (291 lignes) : `jiraSectionHtml()`
  (connexion URL/email/token, paramètres de sync, équipes masquées) et `wireJiraSection()`.
- Le HTML relit tout depuis le `store` et `api.getJiraCreds()` — **aucune donnée à lui passer**.
  Seul le rafraîchissement de la vue est injecté (`onReload`), comme pour `settings-io.js` :
  importer `reloadAndRender` depuis settings.js créerait un cycle.
- Le bloc **Slack** était intercalé au milieu du câblage JIRA : déplacé pour rendre le bloc JIRA
  contigu avant extraction (aucun effet fonctionnel, l'ordre de câblage est indifférent).
- Le handler du bouton **« Créer les groupes »** est resté dans settings.js : le bouton est rendu
  par la section *Groups*, pas par la section JIRA — le câbler depuis le module JIRA aurait
  couplé deux sections sans raison.
- `settings.js` : **3 698 → 3 450 lignes**. Bilan de la journée : **5 096 → 3 450** (−32 %),
  répartis en 4 modules de vue (`settings-rotation`, `settings-io`, `settings-absences-csv`,
  `settings-jira`) et 6 modules `utils/`.
- Nouveau `test-jira-section` (17 assertions) : rendu configuré / non configuré, échappement XSS
  des valeurs du store, présence des handlers, écriture et suppression des plafonds de sync.
  Au passage, le harnais de test échappe désormais réellement dans son faux DOM — `esc()` passe
  par `document.createElement`, un stub trop simple lui faisait renvoyer une chaîne vide et
  masquait silencieusement tout le contenu interpolé.

---

## [3.141.7] - 2026-08-24

### Fonctionnalité — Récapitulatif « PI vs Congés » dans Sprint & PI

- Nouveau tableau sous la carte PI : pour chaque PI dont les Congés ont été importés, le **début
  utilisé** (avec son origine : JIRA, saisi, config), le **début déduit du CSV**, les **itérations**
  et l'**état** — ✓ aligné, ⚠ écart, 🔒 calé sur Congés. Un lien mène à la grille Rotation quand
  au moins un PI diverge.
- Le filtrage se fait **avant** la troncature à 6 lignes : un PI dont les Congés sont importés
  reste listé même si JIRA connaît des boards plus récents — vérifié sur les données réelles, où
  `PI#32`, `PI#33` et `PI#34` existent déjà comme boards de features sans aucun sprint.
- Logique d'écart factorisée dans `piCongesDiff()` ([utils/pi-weeks.js](static/js/utils/pi-weeks.js)) :
  **même source** pour ce récapitulatif et pour le bandeau de recalage de la grille Rotation.
  Ajout de `listPiCfgNumbers()` et `knownPiNumbers()`.

### Refactorisation — settings.js : import/export et parsing CSV extraits

| Module | Contenu | Lignes |
|---|---|---|
| [settings-io.js](static/js/views/settings-io.js) | Catégories exportables, écriture de fichier, lecture CSV/ZIP, modale d'import | 407 |
| [settings-absences-csv.js](static/js/views/settings-absences-csv.js) | Parser pivot RH, consolidation des jours consécutifs, résumé par membre | 211 |

- `settings.js` : **4 279 → 3 698 lignes** (2 017 → 3 698 avec le reste de la journée, soit −28 %
  depuis ce matin, hors modules extraits).
- `_openImportModal(container, onImported)` reçoit son rafraîchissement par **injection** :
  importer `reloadAndRender` depuis settings.js aurait créé un cycle d'imports.
- Le parser CSV n'ayant **aucune dépendance**, il devient testable : nouveau `test-csv-conges`
  (16 assertions) couvrant le format pivot, les demi-journées à virgule décimale, la contiguïté
  vendredi→lundi, les bornes de PI déduites et les cas de repli.

---

## [3.141.6] - 2026-08-24

### Correctif majeur — la page Support affichait les semaines d'un autre PI

- Mesuré avant refonte : sur **27 configurations** testées (3 configs × 3 offsets × 3 modes de
  semaine), la page Support et la grille « Paramètres → Rotation » divergeaient sur **25**, avec
  jusqu'à **plusieurs mois d'écart** — Support annonçait `30.1.1 = 27/03` là où la grille (et les
  rotations en base) disent `12/06`. Cause : `_supPiWeeks()` partait de `piInfo.startDate`, la
  valeur stockée en base qui pointe vers un PI précédent, au lieu de la date JIRA du sprint
  `<PI>.1`. Aucune rotation aberrante en base : la génération n'avait jamais été lancée depuis
  cet écran.
- Nouvelle **source unique** [utils/pi-weeks.js](static/js/utils/pi-weeks.js) —
  `buildPiWeeks()`, `detectSprintsPerPI()`, `jiraSprint1Start()`, `piStartDate()`. Les deux
  écrans y délèguent ; le double snap qui subsistait côté Support est supprimé.
- Après refonte : **0/27 divergence**, et la grille Rotation est **inchangée sur 24/27** — les
  3 seules différences sont les cas `manual.startDate`, c'est-à-dire le nouveau recalage explicite.
- L'agenda et le panneau latéral apparient les rotations par **recouvrement de dates**
  (`weekStart <= jour <= weekEnd`) et non par clé : ils sont insensibles à l'ancrage, rien à y
  changer, et ils bénéficient automatiquement de tout recalage.

### Fonctionnalité — « Recaler ce PI sur les Congés »

- Bandeau dans **Paramètres → Rotation** dès que le CSV Congés importé pour le PI affiché
  contredit la grille (date de début et/ou nombre d'itérations), avec les deux valeurs en regard.
- Le recalage est **explicite, PI par PI** : `weekStart` étant la clé d'appariement des rotations
  enregistrées, rien ne bouge tant que l'utilisateur ne clique pas. La confirmation annonce le
  nombre de semaines déjà remplies qui décrocheront de la grille — **rien n'est supprimé**, un
  Shuffle les régénère.
- **Réversible** : une fois calé, le bandeau propose « ↩ Revenir aux dates JIRA ». Les valeurs
  déduites du CSV restent mémorisées dans les deux sens.
- Styles dans [support-rotation.css](static/css/views/support-rotation.css) (`.rot-conges-banner`).

---

## [3.141.5] - 2026-08-24

### Refactorisation — utils.js découpé (barrel de compatibilité)

- `utils.js` **2 017 → 1 250 lignes**. Quatre modules extraits dans
  [static/js/utils/](static/js/utils/) :

  | Module | Contenu | Lignes |
  |---|---|---|
  | `utils/dom.js` | `esc`, `trapFocus`, `toast` — feuille du graphe, aucune dépendance | 60 |
  | `utils/wiki.js` | Atlassian Wiki Markup → HTML | 133 |
  | `utils/modals.js` | `confirmDanger`, `choiceModal`, `exportChoiceModal`, `ioTabModal`, `promptModal` | 308 |
  | `utils/support.js` | Semaines de PI, jours ouvrés, absences bloquantes, `generateSupportRotation` | 307 |

- **`utils.js` reste le point d'entrée** et ré-exporte tout (`export * from`) : aucun import des
  17 vues n'a été modifié. Vérifié : les **88 exports** publics répondent toujours depuis
  `utils.js`, et les 17 vues se chargent réellement dans Node.
- Nouveau [utils/pi-config.js](static/js/utils/pi-config.js) : `loadPiCfg` / `savePiCfg` /
  `piSprintCount`, qui remplacent les **deux lecteurs concurrents** de `pi-cfg-<N>`
  (`_piCfgLoad` dans settings.js, `_lsPiCfg` dans settings-rotation.js).

### Correctif — Config PI : la saisie « Sprint & PI » n'est plus écrasée

- **`_piCfgSave()` remplaçait tout l'objet** : enregistrer le formulaire Sprint & PI effaçait les
  clés posées par l'import Congés (jours PIP notamment), et un ré-import effaçait la saisie.
  L'écriture **fusionne** désormais, et marque d'un flag `manual` les champs saisis à la main.
- **L'import Congés complète, il n'écrase plus** : les valeurs déduites du CSV vont dans
  `startDateFromCsv` / `sprintsPerPIFromCsv` ; les clés effectives ne sont remplies que si elles
  sont vides. L'ancrage d'un PI déjà planifié ne bouge donc plus dans le dos de l'utilisateur.
- **Plus de snap au vendredi à l'import** : le premier jour du PI est la 1ʳᵉ colonne date du CSV,
  telle quelle — c'est le jour où les équipes démarrent réellement.
- **Nombre d'itérations d'un PI**, ordre de résolution :
  1. saisie « Sprint & PI » (`manual.sprintsPerPI`) — fait foi ;
  2. sprints JIRA **de ce PI** (31.1→31.5 ⇒ 5) ;
  3. déduction de l'import Congés (`sprintsPerPIFromCsv`, estimation par amplitude) ;
  4. valeur héritée d'un ancien import, puis repli.
  Effet : un `pi-cfg-31.sprintsPerPI = 6` posé par un ancien import **ne s'impose plus** — JIRA
  reprend la main et le PI 31 affiche ses 10 semaines sans ressaisie.

---

## [3.141.4] - 2026-08-24

### Correctif — Rotation : en-tête de semaine décalé et itération de trop

- **En-tête `rot-wk-th` incohérent avec la colonne** : `31.1.1` annonçait *6 septembre* alors que
  la première pastille de la colonne est le **lundi 7**. La date de début du PI 31 vient de JIRA
  (`2026-09-06`, un **dimanche**) et n'est pas snappée sur le mode de semaine, tandis que les
  cellules affichent `supportWorkingDays()` qui saute samedi et dimanche. L'en-tête montre
  désormais le **premier jour ouvré** de la semaine (`_rotFirstWorkday`), avec la plage complète
  en infobulle. `weekStart` est inchangé : c'est la clé d'appariement des rotations en base, la
  toucher rendrait invisibles les rotations déjà enregistrées.
- **6 itérations affichées pour un PI 31 qui n'en a que 5** : `_detectSprintsPerPI()` renvoyait
  `Math.max(indiceMaxJIRA, fallback)`, or le `fallback` vient du **PI courant** (PI 30 = 6
  itérations dans JIRA) — le PI 31 héritait donc de 6, soit deux semaines fantômes `31.6.1` /
  `31.6.2` débordant sur le PI 32. Nouvel ordre de priorité :
  1. `sprintsPerPI` de **Paramètres → Sprint & PI** (`pi-cfg-<N>`) — la config saisie fait foi ;
  2. sinon, plus grand indice de sprint JIRA **de ce PI** (31.1→31.5 ⇒ 5) ;
  3. sinon, valeur de repli.
- ⚠️ Conséquence : la grille du PI 31 passe de 12 à **10 semaines**. Les rotations déjà écrites
  pour `31.6.1` et `31.6.2` restent en base sans être affichées — relancer un 🎲 Shuffle
  régénère les 10 bonnes semaines.

### Refactorisation — Rotation Support extraite de settings.js

- Nouveau module [settings-rotation.js](static/js/views/settings-rotation.js) (892 lignes) :
  grille membre×semaine, shuffle par équipe et par groupe, message de rotation, résolution des
  semaines d'un PI. Bloc **contigu et sans dépendance** vers le reste de la vue Paramètres.
- [settings.js](static/js/views/settings.js) : **5 096 → 4 228 lignes**, et 11 imports devenus
  inutiles retirés. Toujours au-dessus de la limite de 800 lignes, mais un gros morceau autonome
  en est sorti.
- Vérification : les 17 vues se chargent réellement dans Node (DOM simulé), et la suite de tests
  du jour (matching d'équipe, semaines Support, enregistrement des objectifs, grille PI 31)
  repasse au vert après extraction.

---

## [3.141.3] - 2026-08-24

### Correctif — Shuffle de la page Support généré sur des semaines non affichées

- Même défaut que la v3.141.1, resté côté **page Support** : sa grille affiche
  `_weeksForOffset(piOffset)` (PI épinglé dans le topbar) tandis que `_shuffle()` générait sur
  `curWeeks`/`nextWeeks` de `buildSupportPiWeeks()` — ancre différente, donc rotation écrite en
  base sur des semaines que la grille n'affiche jamais.
- Extraction de `_supPiWeeks(piInfo, sprintInfo, offset, teamMode)` + `_supSnapWeeks()` au niveau
  module : **source unique** pour la grille et pour les deux boutons de génération. Le bouton
  principal vise le PI épinglé, le bouton « PI suivant » vise base+1 ; le snap sur le mode de
  semaine de l'équipe (vendredi/mercredi/lundi) est appliqué des deux côtés.
- Le toast nomme désormais le PI généré, et un garde-fou remplace le succès silencieux quand
  aucune semaine n'est calculée.

### Correctif — Objectifs PI : enregistrement invisible après rafraîchissement

- **`PIConfig.number` vaut `0` en base** : le PI courant n'y est jamais écrit, il est dérivé du
  sprint JIRA actif côté front (`"Team A - Itération 30.6"` → 30). Les deux gardes `if p.number`
  de [planning.py](app/routers/planning.py) étaient donc **toujours fausses** :
  - `PUT /api/pi/objectives/{n}` ne synchronisait jamais `objectives` (le jeu vivant) ;
  - `PUT /api/pi` ne prenait jamais le snapshot `pi_objectives[n]`.
  Or la lecture du PI courant privilégie `objectives` sur le snapshot (`resolvePiObjectives`) :
  tout enregistrement passé par `/api/pi/objectives/{n}` — import d'objectifs des Paramètres,
  vue PI sur un PI épinglé puis déverrouillé — restait **invisible après rafraîchissement**.
- Nouveau helper `_current_pi_number(session, p)` : même dérivation que le front (regex sur
  `SprintConfig.name`, repli sur `PIConfig.number`). Les deux routes gardent maintenant
  `objectives` et `pi_objectives[PI courant]` synchronisés dans les deux sens.
- [pi.js](static/js/views/pi.js) — le bouton **Enregistrer** est câblé par **délégation posée
  avant le rendu** : une erreur survenant plus loin dans le rendu laissait un bouton visible mais
  mort (clic sans requête ni toast). Le bind direct est supprimé pour ne pas enregistrer N fois
  après N re-render.
- [pi.js](static/js/views/pi.js) — `_tabData` figeait `piInfo` au premier rendu de la vue :
  quitter puis revenir sur l'onglet Objectifs réaffichait l'état d'avant l'enregistrement. Le
  store est relu à chaque changement d'onglet.

---

## [3.141.2] - 2026-08-24

### Correctif — Rotation : des membres d'une autre équipe tirés par le Shuffle

- **`#settings/rotation` → 🎲 Shuffle avec « Eff./sem » = 3 : certaines semaines n'affichaient
  que 2 personnes (voire 1), alors que la ligne Total indiquait bien `3/3`.** Cause racine :
  `teamNameMatches()` comparait les noms d'équipe **par sous-chaîne**. L'équipe **« O »** existe
  réellement (`AIT LHADJ, KABA, DENANTE, GANDON, WANG…`) et `"fuego".includes("o")` est vrai →
  ses membres entraient dans le pool de Fuego. Ayant 0 tour de garde, la règle d'équité les
  faisait passer **en priorité**. Le shuffle écrivait donc bien 3 noms en base (d'où `3/3`), mais
  ceux de l'équipe « O » n'ont aucune ligne dans la grille : invisibles. Sur le PI 31 de Fuego,
  6 des 12 semaines étaient touchées (jusqu'à 3 noms fantômes sur la semaine `31.6.2`).
  Équipes également polluées : **Gabbiano, Lion, Caméléon, Team Burton, PI Board Features ERPC**.
- `teamNameMatches()` compare maintenant par **mots entiers** après `extractTeam()` +
  normalisation des accents. `"Team Fuego"`, `"GCOM - Fuego"` et `"FUEGO"` matchent toujours
  `"Fuego"` ; `"O"` ne matche plus que `"O"` / `"Team O"`.
- Les deux boutons Shuffle (`settings.js` `_shuffleOneTeam`, `support.js` `_shuffle`) piochaient
  dans le roster **global** via une copie locale du matching, alors que la grille affiche le
  roster du **PI** (`effectiveRosterForPi`, snapshot figé à l'import CSV). Ils utilisent
  désormais la même source que l'affichage — un membre parti de l'équipe entre deux PI
  (ex. `BENHABBOUR, Selim`, hors snapshot PI 31) n'est plus tiré.
- Troisième copie du matching supprimée dans `agenda.js` : `teamNameMatches` est la source unique.
- Garde-fou d'affichage : la ligne **Total** et le résumé du panneau ne comptent plus que les
  membres **ayant une ligne dans la grille**. Une rotation héritée avec un nom hors roster
  affiche donc `2/3` en orange (signal « relancer le Shuffle ») au lieu d'un `3/3` mensonger.
- ⚠️ Les rotations **déjà enregistrées** conservent leurs noms fantômes : relancer un 🎲 Shuffle
  par équipe pour les régénérer (le passé reste verrouillé).

---

## [3.141.1] - 2026-08-24

### Correctif — Shuffle de rotation sans effet sur un PI épinglé

- **`#settings/rotation` → 🎲 Shuffle ne remplissait pas la grille dès qu'un PI autre que
  le courant était sélectionné** (ex. PI 31 pour Fuego) : toast « Rotation générée », grille
  inchangée. `_shuffleOneTeam()` générait sur `curWeeks`/`nextWeeks` alors que la grille
  affiche `selectedWeeks`, et **les deux séries n'ont pas la même ancre** :
  `buildSupportPiWeeks()` snappe la date de début sur le jour de la semaine du mode, tandis
  que la branche `_targetStart` de `_rotBuildPiWeeks()` prend la date JIRA brute du sprint
  `<PI>.1`. Sur PI 31 (JIRA : **dimanche 2026-09-06**) la grille listait 06/09, 13/09… quand
  le shuffle écrivait 04/09, 11/09… — **zéro `weekStart` commun dans les trois modes de
  semaine**. La rotation était bien créée en base, mais sur des semaines jamais affichées,
  l'appariement se faisant sur `s.weekStart === w.weekStart`.
- Le shuffle utilise désormais `selectedWeeks` — la même source que l'affichage. Corrige
  aussi deux effets de bord de `nextWeeks` : il ne connaît que PI+1 (donc un offset de +2
  visait le mauvais PI) et hérite du nombre de sprints du PI courant (PI 30 en a 6, PI 31
  en a 5 → 12 semaines générées au lieu de 10, débordant sur le PI suivant).
- Garde-fou : si aucune semaine n'est calculée, message explicite au lieu d'un succès
  silencieux. Le toast nomme le PI visé (`Rotation générée pour Fuego — PI 31 (10 semaines)`).
- Même correction pour le **Shuffle de groupe**, qui passe par la même fonction.
- ⚠️ Non traité (décision produit) : les semaines d'un PI dont la `startDate` vient de JIRA
  ne sont pas snappées sur le mode de semaine — d'où des semaines qui démarrent un dimanche
  sur PI 31. Snapper changerait l'ancrage des rotations déjà enregistrées.

---

## [3.141.0] - 2026-08-24

### Maquettes — vue itération de l'agenda (rien d'implémenté — à valider)

- **[static/mockups/agenda/](static/mockups/agenda/)** : 4 directions pour visualiser une
  itération dans `/agenda` quand une équipe est sélectionnée — évènements **Scrum** et **SAFe**
  différenciés par couleur, récurrences affichées (`1x/sem.`, `1x/ité.`…), bouton **Copier pour
  Slack** avec aperçu avant copie.
  - **A — frise en couloirs** : jours en colonnes, un couloir par famille (Scrum / SAFe / Ops),
    bande absences + support, panneau de détail au clic.
  - **B — agenda dense** : sparkline de densité cliquable, puis les semaines côte à côte jour
    par jour ; rituels quotidiens/hebdo sortis en préambule du récap Slack.
  - **C — cadence & jalons** : le rythme des rituels récurrents + frise des évènements
    ponctuels + coût hebdomadaire des cérémonies.
  - **D — synthèse (recommandée)** : tuiles de charge, puis « ⏱️ Le rythme » repliable, puis
    l'agenda dense chronologique. Son récap Slack est le plus court à information égale (le
    daily y apparaît une fois, contre dix dans celui de A).
- **« ⏱️ Le rythme » déroulé sur l'itération** (C et D) au lieu d'une semaine type : les
  11 jours ouvrés de la 30.6 en colonnes, l'heure en ordonnée. Le sprint planning en
  ouverture et la rétro en clôture apparaissent d'eux-mêmes, sans règle câblée — une équipe
  organisée autrement produira une autre forme.
  - Le **daily est tracé en bande continue** plutôt qu'en onze pastilles, mais **segmentée** :
    chez Fuego il n'a pas lieu le lundi (remplacé par le Weekly de 9h30), soit 9 jours sur 11.
    Une ligne pleine aurait été plus jolie et fausse ; les trous renseignent sur l'organisation
    de l'équipe. En repli mobile, la mention `9/11 jours` porte la même information.
  - Les hachures « une semaine sur deux » disparaissent : chaque occurrence est désormais à sa
    date réelle, la convention n'a plus d'objet.
- **Temps libre** dans la barre de charge (B, C, D) : la barre se lit sur la semaine entière,
  base explicite de 35 h — sur l'Ité 30.6 de Fuego, 13 h 44 de rituels et 21 h 16 de libre.
  Sans ce quatrième segment, 100 % de la barre valait 100 % de réunions, ce qui donnait une
  impression fausse de saturation.
- **Décalage d'itération** (option D) : `− 1 j` / `+ 1 j` déplace tous les évènements et
  recalcule charge, semaine type, agenda et récap. Bac à sable pour éprouver la vue ; un
  bandeau annonce ce qui sort du cadre (`⚠️ 15 sur un week-end`). Aucune donnée modifiée.
- **Fix scroll** : `base.css` pose `body { overflow:hidden; height:100vh }` (dans le site,
  c'est `.main` qui défile). Neutraliser `display:flex` ne suffisait pas — rien ne pouvait
  défiler et le bas des options longues restait inatteignable. Le mode 📱 simule désormais un
  vrai viewport 390 × 780 avec son propre défilement, et la frise de A borne sa hauteur pour
  que ses en-têtes `sticky` fonctionnent.
- **Briques factorisées** dans `parts.css` / `parts.js` (tuiles de charge, grille du rythme,
  agenda dense) : partagées par B, C et D plutôt que recopiées trois fois.
- **Alimentées par des données réelles** extraites de `data/board.db` (équipe Fuego, Ité 30.6 —
  51 évènements, 3 semaines calendaires), doublons inter-calendriers compris : ils sont signalés,
  pas masqués.
- Le [README](static/mockups/agenda/README.md) tranche 7 points d'implémentation, dont :
  la classification Scrum/SAFe déduite du titre puis du calendrier d'origine (pas de source de
  vérité aujourd'hui), la fréquence déduite de l'écart médian entre occurrences faute de RRULE
  dans le payload de `services/ics.py`, et le découpage par **semaine calendaire** — une itération
  démarre rarement un lundi (30.6 : vendredi → vendredi, 11 jours ouvrés sur 3 semaines).

---

## [3.140.0] - 2026-08-22

### Documentation

- **Le BACKLOG redevient une liste de travail** : les 33 items cochés partent
  dans `docs/BACKLOG-ARCHIVE.md`, `BACKLOG.md` ne garde que l'ouvert
  (246 → 153 lignes, 13 items à faire). Découpe **par blocs** —
  puce + lignes de suite — et contrôle de non-perte avant écriture : un
  `grep -v '[x]'` aurait laissé des paragraphes orphelins sans leur titre.
  Outillé et rejouable : `/backlog-clean squad-boards`.
- La section « 📦 Historique livré (archives) » rejoint l'archive : son nom
  disait déjà qu'elle n'était plus du travail.

## [3.139.0] - 2026-08-12

### Refonte UX/UI — lots 1-5 de l'audit du 11/08

- **PI épinglé** : plus de reset au changement de vue, persistant (`sb-piOffset`), badge 📌 + miroir kebab mobile.
- **Bouton « ▶ Daily » permanent en topbar** (+ kebab) — Board + graphes repliés + timer 15 min.
- **Navigation source unique `NAV_ITEMS`** : Ctrl+K aligné sur le menu (vues manquantes/fantômes corrigées), ROAM au menu, Rétro en Pilotage (raccourci `8`), Paramètres en pied de sidebar (`,`). Fix : Ctrl+K ne réinitialise plus l'équipe.
- **Persistance** : Scrum/Kanban retenu (`sb-boardMode`), filtres rapides Board en sessionStorage, filtres backlog réinitialisés au changement d'équipe.
- **Badges WCAG AA** : tokens `--status-*-text` (≥ 4,5:1 light/dark), 10 px → 11 px ; `--danger-hover`.
- **A11y** : cartes ticket focusables (`Entrée` = ouvrir, `Alt+←/→` = déplacer — logique mutualisée `_moveTicketTo`), `trapFocus()` ([utils.js](static/js/utils.js)) sur les 3 familles de modales + restauration focus, `role="dialog"` sur la modale principale, `aria-current` sidebar, toasts `aria-live`, garde `isContentEditable` sur `N`, 5 `outline:none` compensés, 21 `confirm()` → `confirmDanger()`.
- **Perf** : lazy loading des 16 vues (`VIEW_LOADERS` + jeton anti-course, [app.js](static/js/app.js)) ; rappels extraits dans [reminders.js](static/js/reminders.js) (l'info-panel ne tire plus settings.js ~300 KB) ; demo/sync/sprint_tickets_modal en imports dynamiques ; 15 `await import('../utils.js')` supprimés d'atlas.js ; skeleton au premier chargement.
- **Mobile** : kebab complété (Daily, Scrum/Kanban, PI, Aide) ; cibles tactiles 36-44 px via `(hover:none)`.
- **Aide** : modale « ? » raccourcis ([shortcuts_modal.js](static/js/components/shortcuts_modal.js)) ; empty state Backlog avec « Effacer les filtres ».
- Fix préexistant : action Ctrl+K « Sync complète » (handleJiraImport jamais exposé).
- Reste au backlog : migration couleurs→tokens (dont séries charts.js), `title=`→tooltip.js, autres empty states, refonte Dashboard direction F.

---

## [3.138.0] - 2026-08-11

### Audit UX/UI complet + mockup de propositions (rien d'implémenté — à valider)

- **[docs/audit-ux-2026-08-11.md](docs/audit-ux-2026-08-11.md)** : audit croisé navigation/workflows
  scrum master + design system/accessibilité/performance. 6 bloquants P1 (reset `piOffset` à chaque
  changement de vue, « Aller au Daily » invisible ≤ 1200 px, cartes ticket inaccessibles au clavier,
  absence de focus trap dans les 4 familles de modales, contrastes badges 2,3:1 en 10 px, conflit
  raccourcis chiffres sur PI), 8 frictions P2, plan en 5 lots (~6-7 j).
- **[static/mockups/ux-optimisations.html](static/mockups/ux-optimisations.html)** : mockup autonome
  interactif (7 onglets, thème clair/sombre) — avant/après topbar (bouton ▶ Daily, PI épinglé),
  sidebar réorganisée (ROAM au menu, Paramètres en pied, source unique NAV_ITEMS ↔ Ctrl+K), modale
  « ? » raccourcis fonctionnelle, badges WCAG AA, démo carte focusable clavier (Entrée = ouvrir,
  Alt+←→ = déplacer), skeletons/empty states, plan d'implémentation.

---

## [3.137.0] - 2026-07-30

### Dashboard : Lead time/Cycle time, débit et flow efficiency scopés au PI sélectionné

- **[dashboard.js](static/js/views/dashboard.js)** : ces cards étaient calculées sur `tickets`
  (tout l'historique équipe, filtré uniquement par équipe) — donc identiques quel que soit le PI
  choisi via le sélecteur de la topbar (`piOffset`), contrairement au reste du dashboard. Nouveau
  `_flowTickets` = tickets du PI affiché (`_ticketPiNum(t) === displayPiNum`, toutes les sprints du
  PI — pas seulement le sprint courant, pour garder un échantillon suffisant), utilisé pour
  `_doneAll`/`_doneCT`/`ctMedian`/`ltMedian`/`medWait`/`throughput7`/`flowEff` et le graphe Cycle
  Time (`renderCycleTime`). Le badge `metric-scope` affiche maintenant `PI #NN` au lieu de
  "historique équipe" (fallback conservé si `displayPiNum` est indisponible).
- Effet de bord attendu : sur un PI peu actif, l'échantillon peut redevenir trop faible (mêmes
  messages "pas assez de tickets terminés" / cases exclues) — c'est le compromis assumé pour rester
  cohérent avec le sélecteur de PI plutôt que de figer ces cards sur l'historique complet.

---

## [3.136.0] - 2026-07-30

### Fix : Lead time & Cycle time quasi vides (dates de cycle manquantes) sur l'historique équipe

- **[sync.js](static/js/sync.js)** : la passe "sprints clos récents" (`CLOSED_TICKET_SPRINTS`, jusqu'à
  6 sprints par défaut) — qui fournit la quasi-totalité des tickets "done" utilisés par la card
  Lead time & Cycle time et le graphe Cycle Time — récupérait les issues **sans** `expand: 'changelog'`,
  contrairement à la passe "sprint actif" qui l'inclut déjà. Sans changelog, `transformIssue` ne peut
  pas déterminer `startedDate`/`resolvedDate` (basés sur les transitions de statut) → `cycleTimeDays`
  restait à 0 pour tous les tickets clos, sauf ceux déjà vus dans le sprint actif (dédoublonnage
  `seenTicketIds`). D'où le "1/111 tickets, 110 exclus" observé sur Fuego : seul le ticket partagé
  entre sprint actif et historique avait un changelog exploitable. Ajout de `expand: 'changelog'` à
  cet appel. Une resynchro complète (non "quick mode", qui saute cette passe) est nécessaire pour que
  l'historique déjà en base récupère les dates de cycle.

---

## [3.135.0] - 2026-07-30

### Dashboard : sprint-progress-meta détaillé (tickets, jours restants, avance/retard, bloqués)

- **[dashboard.js](static/js/views/dashboard.js)** : la ligne meta au-dessus des carrés jour du
  sprint passe d'un simple "X% pts · Y% temps" à une rangée de chips : `%` pts (coloré
  vert/jaune/rouge), tickets terminés/total (`🎫`), `%` temps écoulé (`⏱️`), écart avance/retard
  points vs temps si ≥ 5 points d'écart (`▲`/`▼`), jours restants avant la fin du sprint (`📆`), et
  ticket(s) bloqué(s) le cas échéant (`🚫`). Donne un jugement direct ("on tient le rythme ?") sans
  avoir à lire la rangée de carrés.
- **[sprint.css](static/css/views/sprint.css)** : nouvelle classe `.sprint-progress-chip` (même
  esprit visuel que `.sprint-ev-chip`) avec variantes `--ahead`/`--behind`/`--blocked` ; suppression
  de `.sprint-progress-stats*` (remplacée).

---

## [3.134.0] - 2026-07-30

### Dashboard : carrés jour du sprint colorisés passé / en cours / futur

- **[dashboard.js](static/js/views/dashboard.js)** : chaque case `.sprint-day-sq` porte maintenant
  systématiquement un état temporel (`is-past`/`is-today`/`is-future`), en plus de `is-filled` pour
  la couleur d'avancement (points réalisés) qui vient en overlay par-dessus.
- **[sprint.css](static/css/views/sprint.css)** : 3 traitements visuels distincts — passé (fond
  neutre marqué = jour révolu non couvert = retard visible), aujourd'hui (teinte + anneau accent
  primary), futur (pointillé discret atténué). La couleur d'avancement (vert/jaune/rouge) reste
  toujours prioritaire par spécificité CSS sur ces 3 états de base.

---

## [3.133.0] - 2026-07-30

### Dashboard : progression du sprint en carrés jour par jour

- **[dashboard.js](static/js/views/dashboard.js)** : refonte de `.sprint-progress-wrap`. L'ancien
  fill en dégradé continu (2 barres superposées temps/points + marqueur "aujourd'hui" + label %
  flottant) devient une rangée de **carrés, un par jour calendaire du sprint** (`.sprint-day-sq`) :
  case colorée (vert/jaune/rouge selon `progressColor(ptsPct)`) si couverte par le % de points
  réalisés, grisée si le jour est passé sans être couverte (retard visible), anneau distinct sur la
  case du jour, texture atténuée sur les week-ends. Le % pts / % temps écoulé migre en texte lisible
  dans la ligne meta (`.sprint-progress-stats`) au lieu d'un label flottant sur la barre.
- **[sprint.css](static/css/views/sprint.css)** : `.sprint-progress-wrap` devient une mini-carte
  détachée (fond `--surface-2`, bordure, padding) au lieu de se fondre dans le `.sprint-header` ;
  nouvelles classes `.sprint-progress-days`/`.sprint-day-sq`/`.sprint-progress-stats*` ; suppression
  de `.sprint-progress-bar`/`.sprint-progress-time`/`.sprint-progress-pts`/`.sprint-progress-today`
  (plus référencées).

---

## [3.132.0] - 2026-07-30

### Agenda du jour (copie Slack) : détection de transition support par comparaison veille/jour

- **[cal_banner.js](static/js/components/cal_banner.js) `_buildDaySlack`** : la détection de jour de
  transition support ne se base plus sur les bornes `weekStart`/`weekEnd` des rotations (pas fiable
  — une charnière de rotation ne tombe pas toujours pile sur le jour où la personne change
  réellement). Compare désormais directement les membres support du jour copié à ceux de la veille
  (`_supForDayKey`) : s'ils diffèrent, affiche `Sortant(s) --> Entrant(s)`, sinon la liste simple.

---

## [3.131.0] - 2026-07-30

### Agenda du jour (copie Slack) : prénom seul pour le support + affichage des jours de transition

- **[cal_banner.js](static/js/components/cal_banner.js) `_buildDaySlack`** : la ligne `:shield:
  Support` n'affiche plus que le prénom. Noms RH stockés au format `"NOM, Prénom"`
  ([regles-metier.md](docs/regles-metier.md)) — `_firstName` prenait initialement le 1er mot
  (`"NOM,"`) au lieu du prénom après la virgule ; corrigé pour découper sur la virgule d'abord, avec
  repli sur le 1er mot si jamais un nom sans virgule traîne. Sur un jour charnière entre deux
  rotations (`weekEnd` de l'une == `weekStart` de l'autre == jour copié), le format bascule sur
  `Sortant --> Entrant` (ex : `Mattéo --> Tanisha`) au lieu de lister les deux personnes côte à côte
  sans distinction.

---

## [3.130.0] - 2026-07-30

### Agenda du jour (copie Slack) : ajout du support 🛡️ au-dessus des absents

- **[cal_banner.js](static/js/components/cal_banner.js) `_buildDaySlack`** : le texte copié par le
  bouton 📋 "Copier l'agenda du jour" liste maintenant la/les personne(s) de support (`:shield:`) du
  jour copié, pour l'équipe sélectionnée — même source de données (`store.get('support')`, rotations
  `weekStart`/`weekEnd`/`members`) que la barre support 🎧 de la vue semaine. Ligne insérée juste
  au-dessus de `:beach_with_umbrella: Absents`.

---

## [3.129.0] - 2026-07-30

### Fix : barre de progression du sprint figée au clic sur une pill PI

- **[settings.js](static/js/views/settings.js) `_fillSprintForm`** : le `%` écoulé
  (`.sprint-nested-bar`/`.sprint-nested-fill`/`.sprint-nested-pct`) n'était calculé qu'au chargement
  de la page, pour le sprint actif JIRA — cliquer sur une autre pill (`data-sprint-idx`) changeait
  bien les dates du formulaire mais laissait l'ancienne barre/pourcentage affichés. Recalcul depuis
  les dates du sprint sélectionné (`startEl`/`endEl`) à chaque clic, avec création à la volée de la
  barre/pastille si le sprint initial n'en affichait pas (ex : sprint futur, 0% au chargement).

---

## [3.128.0] - 2026-07-30

### Fix : dates Début/Fin du sprint pas alignées côte à côte

- **[pi-config.css](static/css/views/pi-config.css) `.sprint-nested-grid`** : dans la grille 2 colonnes
  (Nom du sprint / Début / Fin / Objectif), les champs `--full` (Nom, Objectif) ne spannaient les 2
  colonnes qu'en dessous de 640px — au-dessus, l'auto-placement grid alignait "Nom du sprint" avec
  "Début" sur la même ligne, puis "Fin" avec "Objectif" sur la suivante (diagonale, pas côte à côte).
  Ajout de `.sprint-nested-grid .pi-cfg-field--full { grid-column: 1 / -1 }` à toutes les largeurs
  (retrait de la règle devenue redondante dans le breakpoint 640px) pour que Début et Fin atterrissent
  ensemble sur leur propre ligne.

---

## [3.127.0] - 2026-07-30

### Fix : champ "Début" du sprint figé au clic sur une pill PI

- **[settings.js](static/js/views/settings.js) `_fillSprintForm`** : le champ visible d'une date
  "friendly" ([utils.js](static/js/utils.js) `friendlyDateField`) est en réalité le `<span
  class="fdate-display">` — l'`<input type="date">` réel (`#spr-start`/`#spr-end`) est rendu
  transparent par-dessus (`pi-config.css`) et ne sert qu'à capter le clic/la saisie. Poser
  `startEl.value = ...` en JS ne déclenche ni `input` ni `change`, donc `wireFriendlyDates()` (qui
  resynchronise l'affichage sur ces events) ne se réveillait jamais : cliquer sur une pill
  (`data-sprint-idx`) mettait bien à jour la valeur réelle de l'input, mais le texte affiché restait
  sur l'ancienne date. Ajout d'un `dispatchEvent(new Event('input', {bubbles:true}))` après
  affectation, comme le fait déjà `_piFormFill` pour le formulaire PI. Même correctif dans
  `_syncDateConstraints` pour la correction auto fin < début.

---

## [3.126.0] - 2026-07-30

### Health Check : capacité prévisionnelle intégrée au hero + fix copie agenda du jour

- **[health.js](static/js/views/health.js)** : la card "Capacité prévisionnelle" quitte son bloc dédié
  sous le hero et rejoint le `health-hero` (3ᵉ colonne, à côté du score et de l'intro). Version condensée
  (`capacity-mini`) : un seul chiffre net mis en avant (capacité nette PI), sous-titre équipe/fenêtre de
  dates, et une ligne secondaire compacte vélocité moyenne / % absences — le détail brut vs net reste
  disponible en tooltip plutôt qu'en grille de 4 métriques, pour désencombrer le hero.
- **[health.css](static/css/views/health.css)** : `.health-hero` passe en grille `auto 1fr auto` (repli en
  colonne unique sous 960px) ; remplacement des classes `.capacity-card`/`.capacity-metrics`/... par
  `.capacity-mini` et ses sous-éléments.
- **[cal_banner.js](static/js/components/cal_banner.js)** : le bouton "Copier l'agenda du jour" (📋) filtrait
  les événements par `_dayKey(ev.start) === dk`, ratant les absences OFF multi-jours démarrées la veille
  mais couvrant toujours le jour copié (elles restaient visibles dans la colonne du jour, qui utilise
  `_eventCoversDay`). Alignement sur `_eventCoversDay` pour que le texte copié corresponde à ce qui est affiché.

---

## [3.125.0] - 2026-07-09

### Card "Temps par colonne" étendue à la Rétrospective et au Mode Demo

- **[retro.js](static/js/views/retro.js)** : ajout de la card `⏳ Temps par colonne` (réutilisation du
  composant Dashboard `stageFlowCardHtml`/`bindStageFlowCard`) en tête de la page Rétrospective, calculée
  sur les tickets du **sprint courant** de l'équipe sélectionnée (`getSprintForTeam`).
- **[stage_flow_card.js](static/js/components/stage_flow_card.js)** : `STAGE_ICONS`/`STAGE_LABELS` exportés
  pour être réutilisés hors du composant (Mode Demo).
- **[sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js)** : nouvelle section
  `_demoStageFlowHtml` (médiane P50 par étape) insérée dans le Mode Demo fullscreen (`openDemoMode`), sous
  la card Vélocité PI — rendu compact dédié en dark (les variables CSS du composant Dashboard ne
  s'appliquent pas sur cet overlay fixe).
- **[sprint-tickets-modal.css](static/css/views/sprint-tickets-modal.css)** : classes `.demo-stageflow-*`
  (même style que `.demo-vel-card`) + agrandissement des textes Burnup/Vélocité PI/Temps par colonne dans
  le Mode Demo pour la lisibilité en présentation TV.

---

## [3.124.0] - 2026-07-09

### Métriques de flux : justesse, confiance, aging board & prévision Monte-Carlo (4 axes)

Refonte challengeante des métriques temps/colonnes/cycle time/review/dashboard/board, en 4 axes.

#### Axe 2 — Aging sur les cartes du board (P85 par colonne)

- **[card.js](static/js/components/card.js) `_dwellChip`** : la pastille « jours dans la colonne » se
  colore désormais selon un **repère data-driven** — ambre entre P50 et P85, rouge au-delà du P85 des
  tickets **déjà terminés dans la même colonne** (le ticket sort de la zone habituelle de SA colonne),
  au lieu de seuils fixes 4 j / 7 j. Fallback sur les seuils fixes si le repère n'est pas fiable (< 5
  tickets terminés dans la colonne). Le risque devient visible là où on travaille, pas seulement dans un graphe.
- Nouveaux helpers partagés [utils.js](static/js/utils.js) : `currentStageGroupKey(ticket)` (colonne de
  flux du statut courant) et `computeStageAgeRefs(tickets)` (P50/P85 par colonne depuis l'historique
  terminé). [sprint.js](static/js/views/sprint.js) calcule les repères sur l'**historique équipe complet**
  (`_boardAgeRefs`) et les passe à `renderCard(t, { ageRefs })` (vues colonnes + swimlane).

#### Axe 3 — Confiance des chiffres (périmètre + couverture)

- Nouveau composant **[metric_scope.js](static/js/components/metric_scope.js)** (`metricScopeHtml`) : badge
  « 📐 Mesuré sur *périmètre* · X/Y tickets · N exclus (raison) », coloré selon la couverture (vert/ambre/rouge).
  Câblé sur **Lead/Cycle time**, **Temps par colonne** et **Aging WIP** (Dashboard + onglet Indicateurs PI
  par héritage des composants). On sait enfin sur combien de tickets — et malgré combien d'exclusions — un
  chiffre est calculé.

#### Axe 4 — Prévision Monte-Carlo « finit-on à temps ? »

- Nouvelle card **[forecast_card.js](static/js/components/forecast_card.js)** (Dashboard, PI courant
  uniquement) : simule des milliers de scénarios en tirant au sort le **débit hebdomadaire** dans
  l'historique réel de l'équipe jusqu'à écouler les tickets restants → prévision **P50 / P85** (dates) et,
  si la fin de sprint est connue, **probabilité de tenir l'échéance** (verte ≥ 85%, ambre ≥ 50%, rouge sinon).
  Comptage de tickets (pas de story points) pour rester robuste quand l'estimation est partielle. Run chart
  du débit en barres inline (autonome, sans Chart.js). Indicateur de confiance selon la profondeur d'historique.

### Justesse statistique des métriques de flux (axe 1/4 « corriger les 3 faux »)

- **Flow efficiency par ticket puis médiane** ([dashboard.js](static/js/views/dashboard.js)) : le taux était
  calculé en `moyenne(cycle) / moyenne(lead)` — un **ratio de moyennes** biaisé par les gros tickets et ne
  représentant pas le ticket typique. Il est désormais calculé **par ticket** (`cycle/lead`, borné aux tickets
  où `cycle ≤ lead`) puis on prend la **médiane**. Le schéma Lead/Cycle et le KPI passent aussi en médianes
  (attente médiane, cycle médian, lead médian) pour rester cohérents.
- **« Temps par colonne » en médiane (P50) + P85** ([utils.js](static/js/utils.js) `computeStageFlow`,
  [stage_flow_card.js](static/js/components/stage_flow_card.js)) : on affichait une **moyenne**, sensible aux
  tickets restés bloqués très longtemps dans une étape et incohérente avec les percentiles utilisés ailleurs.
  `computeStageFlow` expose désormais `medDays` + `p85Days` (nouveau helper exporté `percentile(arr, p)` à
  interpolation linéaire) ; la card montre la **médiane** en valeur principale et le **P85** en repère, et le
  texte de copie Slack liste médiane + P85 par colonne.
- **SLA/SLE non-tautologique** ([sla_review_card.js](static/js/components/sla_review_card.js)) : le seuil « auto »
  valait le **P85 de l'échantillon mesuré**, donc la conformité tombait mécaniquement à ~85% (on se comparait à
  soi-même). Le seuil auto est maintenant le **P85 du PI précédent** (référence externe, ≥ 5 tickets terminés
  requis) et la conformité est mesurée sur les tickets terminés du **PI courant** → elle répond vraiment à
  « fait-on aussi bien ou mieux que le PI d'avant ? ». Périmètre explicite affiché (`📐 Mesuré sur PI N ·
  x/y tickets`), tag de source (`auto · réf. PI N`) et mode **provisoire** signalé tant qu'aucun PI de référence
  n'est assez fourni. Aide SLA mise à jour.

## [3.123.0] - 2026-07-09

### Fix : « Rafraichir tous » (calendriers, Paramètres) utilise le même loader que la synchro du header

- **[settings.js](static/js/views/settings.js)** : le bouton `#btn-cal-refresh-all` déléguait à une boucle
  maison `Promise.all(refreshCalendar)` sans piloter la carte de progression globale. Il réutilise désormais
  **`syncCalendars('all')`** ([cal_banner.js](static/js/components/cal_banner.js)) — exactement comme le
  bouton `#btn-cal-sync` du header : même **carte de progression détaillée** (`store.syncType='calendar'`,
  avancement `n / N calendriers`, libellés), rafraîchissement `calendars`/`calendarEvents` et toast récap
  unifiés.

## [3.122.1] - 2026-07-09

### Sprint Review : barres Lead/Cycle par ticket + fix objectif manquant

- **Barre de progression par ticket réalisé** (section Lead Time & Cycle Time,
  [sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js) `_leadCycleSectionHtml`) : pour chaque
  ticket terminé mesurable, une barre horizontale = son Lead Time, dont le **remplissage vert = Cycle Time**
  (travail effectif) et le reste **ambre hachuré = attente en backlog**. Triées du Lead le plus long au plus
  court, **clé JIRA cliquable + titre du ticket** (tronqué avec ellipsis, titre complet au survol), valeurs
  `Lead / Cycle` à droite. Échelle **robuste** (3× le Lead médian) pour qu'un ticket resté des mois en backlog
  n'écrase pas les autres ; les tickets hors échelle sont marqués d'une pastille lisible « hors échelle ›› »
  en conservant leur valeur exacte. Légende Cycle / Attente.
- **Fix — objectif de sprint manquant dans la Review/Demo ouvertes depuis la modale** : le bouton 📋 Review (et
  📺 Demo) de la modale sprint affichait « Aucun objectif explicite… » alors que le même compte-rendu ouvert
  via la palette (`open-sprint-review`) fonctionnait. Cause : l'objet `sprint` fourni par le chart vélocité
  (`computeVelocityHistory` / `computeCurrentSprintEntry`) ne porte ni `goal` ni `startDate`, contrairement au
  teamSprint résolu par `_resolveCurrentSprint`. Ajout d'un helper `_enrichSprintMeta(sprint)` appelé à
  l'ouverture de la modale : complète `goal`, `startDate`, `plannedEndDate`, `completeDate`, `jiraBoardId`
  depuis `store.sprintInfo.teamSprints` (match nom + équipe) sans écraser les champs déjà calculés. Bénéficie à
  tous les exports (Review, Demo, texte, MD, HTML).
- **Fix — « PI Predictabilité 0 % » trompeur** : le score de prédictibilité (BV livrée ÷ BV engagée) s'affichait
  à 0 % en plein PI, quand tous les objectifs sont encore `inprog`/`todo`. Or la prédictibilité SAFe n'a de sens
  qu'à la clôture du PI. Le score n'est désormais affiché que s'il est **> 0** (mode Demo, résumé Slack et
  en-tête HTML de la Review). Tant que rien n'est livré, seule la ligne honnête « BV livrée 0/27 » subsiste.

## [3.122.0] - 2026-07-09

### Sprint Review : nouvelle section « ⏱️ Lead Time & Cycle Time »

Ajout d'une section pédagogique dans le compte-rendu Sprint Review Confluence-ready
([sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js), `_leadCycleSectionHtml`), insérée juste
après les Métriques.

- **Schéma explicatif autonome** : réplique le diagramme de la tooltip d'aide
  ([help_popover.js](static/js/components/help_popover.js) `lctDiagramSvg`) — bande à 4 étapes (Backlog →
  Développement → Revue → Déploiement) avec les accolades *Lead Time* / *Change Lead Time* / *Cycle Time* et le
  repère rouge *First Commit*. Couleurs inline (aucune dépendance CSS externe) pour rester valide dans le HTML
  exporté. Le schéma est **annoté avec les valeurs réelles du sprint** (Lead/Cycle médians, temps d'attente
  backlog).
- **4 cartes de métriques** : Lead Time médian, Cycle Time médian, Temps d'attente (Lead − Cycle) et Flow
  efficiency (Cycle ÷ Lead, code couleur : vert ≥ 40 %, orange < 25 %). Source `t.leadTimeDays` /
  `t.cycleTimeDays`, mêmes champs que la card Lead/Cycle du Dashboard.
- **Médianes** (et non moyennes) pour être robuste aux tickets exceptionnellement anciens en backlog (un seul
  ticket resté ~500 j fausserait la moyenne du Lead Time).
- Note explicative Lead vs Cycle vs Flow efficiency, avec repères métier. Si le sprint n'a aucun ticket terminé
  avec délai mesurable, le schéma reste affiché (documentation) et les cartes sont remplacées par un message.

## [3.121.1] - 2026-07-08

### Fix : stats de la modale sprint (`sb-modal-stats`) alignées sur la vue Health

Incohérence entre les cellules Vélo/Buffer de [health.js](static/js/views/health.js) et les cartes de la
modale [sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js) pour un même sprint/équipe.
Vérifié sur 25 sprints Gabbiano (avant : jusqu'à 3 écarts par sprint ; après : 0).

- **Vélocité** : la carte faisait `sprint.velocity || ptsDone` → la snapshot JIRA figée à la clôture
  primait, et pouvait contredire la carte « Story Points » de la même modale (ex Ité 29.4 : Vélocité 9
  vs Story Points 11/11). Passe à `doneCount ? ptsDone : (sprint.velocity || 0)` — **priorité aux
  tickets Done locaux**, snapshot JIRA en fallback, exactement comme Health (`vPts`).
- **« Buffer (estimé) »** : la carte affichait `sprint.estimated` (= **engagement total** Greenhopper),
  pas les points des tickets label Buffer → nombre sans rapport avec la colonne 🛡 Buffer de Health, et
  « % réalisé » aberrant (ex Ité 28.4 : 200 %). Découpée en **deux cartes** :
  - **« Engagé (estimé) »** = `sprint.estimated`, `% réalisé` recalculé sur `veloPts` (plus sur la
    snapshot brute).
  - **« 🛡 Buffer »** = Buffer *réalisé* = points des tickets Buffer Done locaux, fallback snapshot JIRA
    `sprint.bufferPoints` — même mesure que la colonne Buffer de Health (`bPts`).
- **Suppression des doublons** : la carte « Engagé (estimé) » n'est affichée que si l'engagement diffère
  du périmètre courant (`sprint.estimated !== ptsTotal`). Sur un sprint actif, où `estimated` est
  reconstitué = somme des tickets, elle répétait à l'identique le dénominateur de « Story Points » et
  les nombres de la Vélocité (ex Ité 30.2 : trois cartes autour de 19/21/90 %). Le sous-titre de la
  carte Vélocité n'affiche « / N engagés » que dans ce même cas distinct. Sprint actif : 3 cartes nettes.
- **Carte 🛡 Buffer toujours visible** (y compris « 0 pts · aucun buffer »), comme la colonne Buffer de Health.
- **Cohérence des exports** : extraction d'un helper unique `_sprintStats(sprint, tickets)` (source
  partagée). Les 5 sorties de la modale — rapport texte Slack, Markdown, HTML autonome, mode Demo et
  Sprint Review Confluence — utilisent désormais la **même** sémantique (Vélocité = Done local prioritaire,
  « Engagé (estimé) » conditionnel, « 🛡 Buffer » = Buffer réalisé). Auparavant elles reproduisaient les
  anciens bugs (`sprint.velocity || ptsDone`, « Buffer (estimé) » = engagement, « Tickets Buffer » = tous
  les tickets Buffer). Ajout d'une colonne « Story Points » à la Sprint Review (texte + HTML).

## [3.121.0] - 2026-07-08

### UX : refonte Dashboard en deux flux thématiques (direction F)

Réorganisation du Dashboard suivant la maquette retenue ([static/mockups/dashboard-directions.html](static/mockups/dashboard-directions.html), direction **F · Deux flux**).

- **[dashboard.js](static/js/views/dashboard.js)** : sous les blocs pleine largeur conservés tels quels
  (support du jour, bande « Cap de l'équipe », **timeline + `pi-sprints-strip` riche**), le reste passe en
  **deux colonnes-flux** :
  - **🚀 Pilotage & flux** (gauche) : KPI primaires + secondaires, Lead/Cycle time, Temps par colonne,
    Vélocité, Ancienneté du WIP.
  - **👥 Équipe & risques** (droite) : cards Équipes, SLA Review, Bloqués/stagnants, Activité récente.
  - Cards « Équipes » extraites en const `_teamsCards` pour placement dans le flux droit.
- **[dashboard.css](static/css/views/dashboard.css)** : `.dash-streams` / `.dash-stream*` — **aéré entre
  les deux flux** (`gap` large), **resserré entre les cards** d'un flux (gap serré, marges propres
  neutralisées). Empilement en une colonne < 1024 px. En-têtes de flux à liseré coloré.
- **Ajustements** : les 2 rangées de KPI (primaires + secondaires) repassent en **pleine largeur
  au-dessus des deux flux** (évite l'orphelin/le blanc quand elles s'empilaient en demi-colonne, et
  rééquilibre le flux gauche = 4 charts vs droite = 4 blocs). Bande « Cap de l'équipe » **compactée**
  (paddings, score PI, liste d'objectifs, carte sprint) pour se rapprocher du mockup.

## [3.120.0] - 2026-07-08

### UX : copie d'événements agenda en liste compacte (1 ligne / event, triée)

- **[cmdpalette.js](static/js/components/cmdpalette.js)** : la copie d'événements agenda passe d'un
  bloc multi-lignes par événement à **une seule ligne par événement**, format
  `• 🗓️ 09/06/2026 à 14h00 - Titre 🔗 https://…` (date en `JJ/MM/AAAA`, heure omise si journée entière,
  **URL de visio en clair et cliquable** au collage — sans parenthèses pour ne pas casser le lien). La
  copie est **toujours triée par ordre chronologique croissant** (avant, le
  tri suivait l'affichage « à venir d'abord »). Description et participants retirés de la copie pour
  rester compact (participants toujours visibles via le badge `👥 N` dans la liste).

## [3.119.1] - 2026-07-08

### Fix : recherche agenda (Ctrl+K) désormais non scopée à l'équipe

- **[cmdpalette.js](static/js/components/cmdpalette.js)** : `_searchEvents` filtrait les événements
  par l'équipe courante — or les événements portent l'équipe de leur **calendrier** (ex. les 14
  « [School OPS] » sont tagués `Fuego`). Résultat : aucun résultat si l'utilisateur n'était pas sur
  cette équipe. La recherche agenda parcourt désormais **tous** les calendriers (le badge équipe garde
  le contexte), et fonctionne aussi quand des filtres tickets (`team:`…) sont présents.

## [3.119.0] - 2026-07-08

### Feat : recherche d'événements agenda dans la command palette (Ctrl+K) + copie

- **[cmdpalette.js](static/js/components/cmdpalette.js)** : la recherche `Ctrl+K` inspecte désormais
  les **événements calendrier** (ICS) par titre, scopés à l'équipe courante. Un groupe **📅 Agenda**
  liste les occurrences correspondantes (à venir d'abord, puis passées), avec l'heure et un badge
  **🔗 visio** quand un lien de visioconférence est détecté.
  - **Clic sur un événement** → copie son détail dans le presse-papier (titre, date/heure, lien visio,
    lieu, description/participants). La palette **reste ouverte** pour enchaîner les copies.
  - Ligne **« Copier les N événements »** → copie toutes les correspondances d'un coup (ex. tous les
    « School »), même au-delà des 40 affichées.
- **[ics.py](app/services/ics.py)** : parsing du champ **`ATTENDEE`** des VEVENT (nom `CN` si présent,
  sinon email sans `mailto:`, dédupliqué, max 50) exposé en `attendees[]` sur chaque événement.
  → un **badge `👥 N`** apparaît sur les lignes de résultat et une ligne **`👥 Participants : …`** est
  ajoutée à la copie. *(⚠️ nécessite une re-synchro des calendriers ICS pour peupler les événements
  existants.)*
- **[base.css](static/css/base.css)** : styles du groupe Agenda (`.cmd-ev-when`, `.cmd-ev-visio`,
  `.cmd-ev-att`, `.cmd-ev-copy`, `.cmd-ev-copyall`, `.cmd-ev-more`).

## [3.118.0] - 2026-07-07

### UX : roster « Membres » de la fiche équipe compacté (équipes nombreuses)

- **[team.js](static/js/views/team.js)** : les chips membres n'affichent plus le rôle en inline
  (avatar + nom seulement) ; le rôle passe en **tooltip enrichie** (`Nom — Rôle`) et un `data-role`
  est exposé.
- **[team.css](static/css/views/team.css)** : chips plus petits (padding/gap/avatar réduits, `fs-xs`),
  roster **sans plafond de largeur** (`max-width: none`) pour tenir ~5-6 membres par ligne au lieu de 2
  — hauteur visuelle fortement réduite pour une équipe de 14. Ajout d'un **point discret** sur les
  membres ayant un rôle défini et d'un léger `translateY` au survol.

## [3.117.0] - 2026-07-07

### UX : topbar épurée — actions secondaires déléguées à la command palette + kebab

- **[cmdpalette.js](static/js/components/cmdpalette.js)** : 3 nouvelles actions rapides —
  **Nouveau ticket** ➕, **Basculer « Mes tickets »** ◉, **Ouvrir les vues favorites** ★ (le dropdown
  s'ancre sur le kebab). La palette devient le point d'entrée unique de ces actions.
- **[base.css](static/css/base.css)** :
  - **Sync JIRA en icône seule** (label `JIRA 14j` masqué à toutes les tailles) — la sync complète
    reste joignable via la flèche du split *et* la palette. Gros gain de largeur dans `topbar-right`.
  - **Kebab visible à toutes les tailles** : Favoris + Mes tickets vivent désormais dans son menu (et
    dans la palette) en permanence ; les boutons autonomes `#btn-favorites` / `#btn-my-tickets` sont
    masqués. Les règles dupliquées de la media query < 1024px sont supprimées.

## [3.116.0] - 2026-07-07

### UX : bande « Cap de l'équipe » — Objectif de sprint ⟷ Objectifs du PI (2 colonnes)

- **[dashboard.js](static/js/views/dashboard.js)** : les Objectifs PI sont désormais présentés dans une
  bande **« Cap de l'équipe »** en **2 colonnes responsives** (Objectif du sprint | Objectifs du PI, PI
  plus large en `1.2fr`, empilées < 720 px) pour montrer le parallèle itération ⟷ trimestre. Les deux
  colonnes partagent le même langage visuel (accent haut + en-tête « eyebrow »). La colonne PI bascule
  en **état vide explicite** quand l'équipe du user n'a aucun objectif sur le PI (« Aucun objectif PI
  pour {équipe} » + action « Définir dans PI Planning »). Édition inline des objectifs conservée.
- **Fusion sprint-header** : la `sprint-goal-line` est supprimée et les éléments de `sprint-header-top`
  (nom du sprint, jour restant, stats pts/écart/mood/fist) sont **déplacés dans la carte « Objectif du
  sprint »**. Le bandeau sprint ne conserve que la timeline (barre de progression + événements) et les
  sprints du PI (`.sprint-header--timeline`).
- **[dashboard.css](static/css/views/dashboard.css)** : styles `.goals-band` / `.goals-grid` / `.gb-*`
  (dont `.gb-sprint-name`, `.gb-stats` / `.gb-stat`).
- **[static/mockups/goals-parallel-mockup.html](static/mockups/goals-parallel-mockup.html)** *(nouveau)* :
  maquette autonome interactive ayant servi à valider la proposition (états plein / vide, thème).

## [3.115.0] - 2026-07-07

### UX : topbar allégée — la search-box devient un bouton qui ouvre la command palette

- **[index.html](static/index.html)** : suppression de la `search-box` (champ + résultats inline,
  redondants avec la command palette) au profit d'un **bouton `#btn-search`** (icône loupe + label +
  hint `Ctrl K`) qui ouvre directement la palette.
- **[cmdpalette.js](static/js/components/cmdpalette.js)** : expose `openCmdPalette()` (API publique).
- **[topbar.js](static/js/components/topbar.js)** : retrait de toute la logique de recherche inline
  (`doSearch`, `renderSearchResults`, raccourci `Ctrl+K` local, gestion `Escape`/blur) ; le bouton
  câble `openCmdPalette()`. Le `Ctrl+K` reste géré globalement par la palette.
- **[base.css](static/css/base.css)** : styles `.search-trigger` (+ variante compacte tablette/mobile)
  remplaçant `.search-box`.
- **[state.js](static/js/state.js)** : suppression de l'état `searchQuery` devenu orphelin.

## [3.114.0] - 2026-07-07

### UX : schémas d'aide plus lisibles + Objectifs PI remontés et compactés

- **[base.css](static/css/base.css)** : textes des schémas SVG d'aide agrandis (`.hd-*`, +3/4 px) et
  popover élargi (440→520 px) pour une meilleure lisibilité.
- **[dashboard.js](static/js/views/dashboard.js)** : le bloc **Objectifs PI** (atteinte /
  Predictability score SAFe) est extrait en const et **remonté au-dessus du bandeau sprint** (au lieu
  d'être sous les métriques).
- **[dashboard.css](static/css/views/dashboard.css)** : card Objectifs PI **compactée** (paddings,
  marges, score 32→26 px, gaps de liste et d'items réduits, titre de section resserré) pour prendre
  moins de place.

## [3.113.0] - 2026-07-07

### Feat : card "SLA Review" (respect du délai de cycle time)

- **[sla_review_card.js](static/js/components/sla_review_card.js)** *(nouveau)* : nouvelle card
  Dashboard qui fixe une **attente de service (SLE)** sur le cycle time — « 85% des tickets terminés en
  ≤ X jours » — et affiche le **taux de conformité** réel en RAG (vert ≥85% / ambre ≥70% / rouge),
  une barre avec le repère de cible à 85%, les percentiles P50/P85, et la **liste des tickets hors
  cible** (clic → ouverture). Le seuil X est **éditable** (champ discret persisté en localStorage) ;
  par défaut il vaut le **P85 observé** (mode « auto ») tant qu'aucun objectif volontaire n'est saisi.
  Exclusions de flux respectées. Icône d'aide « ? » (schéma SLA déjà préparé en 3.112.0).
- **[dashboard.js](static/js/views/dashboard.js)** : montage de la card entre le schéma Lead/Cycle et
  la liste des tickets bloqués/stagnants.
- **[dashboard.css](static/css/views/dashboard.css)** : styles `.sla-*`.

## [3.112.0] - 2026-07-07

### Feat : icônes d'aide « ? » généralisées (Aging WIP, Temps par colonne, Vélocité) + repositionnement

- **[help_popover.js](static/js/components/help_popover.js)** : le helper devient **auto-câblé** via un
  registre par clé (`data-help-key`) et un écouteur délégué unique `initHelpPopovers()` (appelé une fois
  dans [app.js](static/js/app.js), comme `initTooltips`) — plus aucun wiring par vue. Nouveaux schémas
  SVG thémés : **Ancienneté du travail en cours** (bandes P50/P85), **Temps par colonne** (durée par
  étape), **Vélocité** (points/sprint + moyenne + objectif + sprint en cours non compté) et **SLA
  Review** (distribution + seuil SLE, prêt pour une future card). Classes SVG génériques `.hd-*`.
- **[aging_wip_card.js](static/js/components/aging_wip_card.js)** : card renommée en français
  **« Ancienneté du travail en cours »** (au lieu de « Aging WIP »), avec icône « ? ».
- **[stage_flow_card.js](static/js/components/stage_flow_card.js)**, **[velocity_card.js](static/js/components/velocity_card.js)** :
  icône « ? » ajoutée aux titres.
- **[dashboard.js](static/js/views/dashboard.js)** : la card Ancienneté du travail en cours est
  déplacée **à côté du graphique Vélocité** (dans la grille des charts) au lieu d'être en pleine largeur.

## [3.111.0] - 2026-07-07

### Feat : icône d'aide « ? » + schéma SVG Lead time / Cycle time (popover pédagogique)

**Constat** : la card "Lead time & Cycle time" affichait les chiffres sans expliquer la différence
entre les deux métriques (source fréquente de confusion : lead time inclut l'attente en backlog, pas
le cycle time).

- **[help_popover.js](static/js/components/help_popover.js)** *(nouveau)* : composant réutilisable —
  `helpIconHtml()` (petite icône « ? »), `openHelpPopover()` (bulle cliquable, positionnée près de
  l'ancre sur desktop, **feuille centrée avec fond assombri sur mobile** ; fermeture clic extérieur /
  Échap / scroll), et `lctDiagramSvg()` : schéma SVG coloré **thémé clair/sombre** (Backlog →
  Développement → Revue → Déploiement) avec les accolades Lead Time / Change Lead Time / Cycle Time et
  le repère « First Commit ».
- **[dashboard.js](static/js/views/dashboard.js)** : icône « ? » ajoutée au titre de la card, ouvrant
  le schéma au clic (desktop + mobile).
- **[base.css](static/css/base.css)** : styles `.card-help-btn`, `.help-popover*` et `.lctd-*`
  (réutilisables pour d'autres cards). Fond soigné du popover : léger dégradé teinté + halos radiaux
  diffus + liséré lumineux en haut + animation d'apparition, le tout thémé clair/sombre via
  `color-mix`. Le schéma repose sur un panneau discret pour le détacher du fond.

## [3.110.0] - 2026-07-07

### Feat : flow efficiency, tendance de débit et card "Aging WIP" (métriques de flux)

**Constat** : le Dashboard affichait déjà lead/cycle time, débit 7j, vélocité et temps par colonne,
mais tout en **moyenne** et de façon **descriptive** — aucun indicateur du gaspillage (temps d'attente
vs travail réel), ni de vision **proactive** du travail en cours qui vieillit anormalement (la card
"Tickets bloqués/stagnants" est réactive : elle attend qu'un ticket soit déjà en retard).

- **[dashboard.js](static/js/views/dashboard.js)** : nouveau KPI **Flow efficiency** = cycle time /
  lead time (part du temps réellement passée à travailler le ticket plutôt qu'à attendre en file ;
  repère : ~15% courant, 40%+ bon), affiché à la fois en metric-card colorée (RAG) et en barre dans le
  schéma Lead/Cycle time. La metric-card **Débit (7j)** gagne une **tendance ↗/↘** vs la semaine
  précédente.
- **[aging_wip_card.js](static/js/components/aging_wip_card.js)** *(nouveau)* : card **Aging WIP** —
  chaque ticket en cours est positionné dans sa colonne actuelle (dev, test, revue, qualif, prod) avec
  son âge (issu de `stageDurations`), comparé au **P50/P85 des tickets déjà terminés** dans la même
  colonne : vert `< P50`, ambre `P50–P85`, rouge `≥ P85` (sort de la zone habituelle → à débloquer).
  Tickets bloqués marqués 🚫, clic → ouverture du ticket. Exclusions de flux respectées (cohérent avec
  "Temps par colonne"). Montée sur le Dashboard et la vue PI Planning ([pi.js](static/js/views/pi.js)).
- **[dashboard.css](static/css/views/dashboard.css)** : styles `.metric-trend`, `.lct-floweff*` et
  `.aging-wip-*` (chargés globalement, donc valides aussi côté PI Planning).

## [3.109.0] - 2026-07-03

### Feat : bouton copie Slack par jour dans l'entête agenda-table

**Constat** : la page Agenda proposait déjà une copie Slack pour le support, les absences et la semaine complète, mais aucun moyen de copier le récap d'un seul jour — pattern déjà en place dans la modale Calendrier ([cal_banner.js](static/js/components/cal_banner.js#L773)) via `.cal-day-copy-btn`.

- **[agenda.js](static/js/views/agenda.js)** : bouton `.agenda-day-copy-btn` (📋) ajouté dans chaque `<th class="agenda-day-col">`, sur le même modèle visuel/comportemental que `.cal-day-copy-btn` (icône discrète, visible au survol de la colonne, `✓` puis retour à `📋` après copie). Le message Slack généré reprend le support et les absences (store + OFF calendrier) du jour, filtrés sur l'équipe active — mêmes emojis/format que le récap semaine existant.
- **Complément** : ajout des invitations de l'agenda du jour (réunions calendrier hors OFF), groupées Matin/Après-midi avec horaires et lien visio détecté — même format que `_buildDaySlack()` dans [cal_banner.js](static/js/components/cal_banner.js#L978), pour un contenu réellement équivalent au bouton de la modale Calendrier.
- **Complément** : les congés/absences du jour sont désormais regroupés par type (une ligne `emoji *Type* : @A, @B, @C` par type au lieu d'une ligne par personne) — même principe de concaténation que la ligne `🎧 *Support*`.

## [3.108.0] - 2026-07-03

### Fix : agenda-table — fond support étalé sur toute la ligne au lieu des seuls jours concernés

**Constat** : dans la page Agenda, une personne de support jeudi-vendredi voyait aussi ses cellules lundi-mercredi colorées, car la règle CSS `.agenda-support-row td` appliquait le fond à **toutes** les cellules de la ligne dès qu'un membre était support au moins un jour de la semaine — alors que le JS ([agenda.js](static/js/views/agenda.js#L111-L113)) ne pose déjà l'inline `background` que sur les `<td class="agenda-cell--support">` correspondant aux jours réels.

- **[agenda.css](static/css/views/agenda.css)** : sélecteur restreint à `.agenda-support-row td.agenda-cell--support` — le fond ne s'applique plus qu'aux jours effectivement en support.

## [3.107.0] - 2026-07-03

### Feat : import/export en masse de la rotation support (par PI)

**Constat** : l'affectation de la rotation support se faisait uniquement semaine par semaine (carte
"Affecter rapidement") ou jour par jour dans la grille — aucun moyen de saisir/relire d'un coup toute
la rotation d'un PI (plusieurs équipes × plusieurs semaines).

- **[utils.js](static/js/utils.js)** : nouvelle modale générique à 2 onglets `ioTabModal()` (famille
  `.confirm-overlay`) ; `SUPPORT_WEEK_MODES` étend les jours de démarrage de semaine supportés à
  Lundi/Mardi/Mercredi/Jeudi/Vendredi (auparavant seuls Lundi/Mercredi/Vendredi étaient disponibles,
  ce qui forçait certaines équipes sur une approximation à ±1-3 jours de leur vrai jour de rotation).
- **[settings.js](static/js/views/settings.js)** : bouton "🔄 Import / Export" dans la section
  Rotation Support. Format texte `Equipe;Semaine;Membres` (semaine = date de début réelle, pas le
  n° de sprint — chaque équipe peut démarrer un jour différent ; membres séparés par `|`, suffixe
  `:Lu,Ma,…` pour une présence partielle). Validation ligne à ligne avec suggestions de correction
  (distance de Levenshtein) pour les noms inconnus, applicables individuellement ou en masse
  ("Accepter les corrections uniques"), avertissements non bloquants pour les dates hors grille avec
  diagnostic de la semaine valide la plus proche. L'écrasement supprime aussi les entrées orphelines
  du PI (ex. anciennes dates générées avant correction du mode semaine d'une équipe).
- **[base.css](static/css/base.css)** : styles modale import/export, chips de suggestion, résultats
  de validation (scrollables).
- **[app/models/people.py](app/models/people.py)** : commentaire `week_mode` mis à jour (5 jours).

## [3.106.0] - 2026-07-03

### Fix : double redirection sur `#settings/rotation`

**Constat** : ouvrir `#settings/rotation` déclenchait une redirection en cascade vers `#settings/rotation-support` puis `#settings/lignes-produit-groupes` — le slug `rotation-support` n'existe nulle part dans le DOM (la section a l'id figé `section-rotation`, donc le slug réel est `rotation`), donc le système de tabs ne trouvait jamais la cible et retombait sur le 1er onglet en réécrivant le hash.

- **[app.js](static/js/app.js)** : suppression de l'alias `'rotation': 'rotation-support'` (le slug court `rotation` correspond déjà au slug réel, l'alias n'avait pas lieu d'être).
- **[settings.js](static/js/views/settings.js)** : `TAB_GROUPS` (groupe "Planning") utilise désormais `rotation` au lieu de `rotation-support` pour matcher le slug réel de la section.

## [3.105.0] - 2026-07-02

### Feat : carte de progression détaillée pour la sync JIRA / Agenda

**Constat** : la sync JIRA/calendrier n'affichait qu'une fine barre de 3px en bas de topbar, avec le détail de phase uniquement visible via tooltip au survol — et surtout, le paramètre `detail` passé à `setProgress()` dans [sync.js](static/js/sync.js) n'était jamais persisté en store (silencieusement perdu).

- **[state.js](static/js/state.js)** : nouvelle clé `syncDetail`.
- **[sync.js](static/js/sync.js)** : `setProgress()` persiste désormais le détail ; message final "Import terminé !".
- **[cal_banner.js](static/js/components/cal_banner.js)** : `syncCalendars()` publie un détail live (compteur + nom du calendrier en cours, puis résumé succès/échec).
- **[index.html](static/index.html)**, **[topbar.js](static/js/components/topbar.js)**, **[base.css](static/css/base.css)** : nouvelle carte flottante `#sync-card` sous la topbar (icône animée, titre, %, barre, libellé de phase, détail) — bleu pour JIRA, vert pour Agenda.

## [3.104.0] - 2026-07-02

### Feat : widget support remonté en tête, card "Temps par colonne" (flux inter-étapes)

**Widget "En support aujourd'hui"** : remonté tout en haut du Dashboard ([dashboard.js](static/js/views/dashboard.js)), avant le bandeau sprint et les métriques — visible immédiatement sans scroller.

**Card "Temps par colonne"** ([stage_flow_card.js](static/js/components/stage_flow_card.js)) : durée moyenne (jours) réellement passée par les tickets dans chaque étape du workflow — Revue, En cours de dév, En cours de test, À livrer en qualif, à livrer en prod. Reprend le style visuel du schéma "Lead time & Cycle time". N'affiche que les colonnes réellement présentes dans le workflow de l'équipe. Intégrée au Dashboard (scope PI sélectionné via `piOffset`) et à l'onglet Objectifs de PI Planning.
- **Constat** : `à livrer en qualif` et `à livrer en prod` sont fondus dans le statut `done` (voir `STATUS_MAP`) — indissociables des tickets réellement clos. Distingués ici via le libellé JIRA brut (`jiraStatus`), sans toucher au mapping de statut existant utilisé par ailleurs (board, filtres…).
- **Backend** ([core.py](app/models/core.py), [migrations.py](app/migrations.py), [serializers.py](app/serializers.py)) : nouvelle colonne JSON `ticket.stage_durations` (`{ "revue": 2.5, ... }`, jours cumulés par statut JIRA brut), exposée en `stageDurations`.
- **Sync** ([sync.js](static/js/sync.js)) : rejoue le changelog complet de chaque ticket pour cumuler les durées par statut visité (un statut revisité plusieurs fois voit ses durées additionnées).
- **Agrégation** ([utils.js](static/js/utils.js)) : `computeStageFlow(tickets)` — moyenne par colonne suivie, ne retourne que celles ayant au moins un ticket concerné.

## [3.103.0] - 2026-07-02

### Feat : dashboard oncall, Slack webhook, timeline, raccourcis clavier, scroll memory

**2 — Widget "En support aujourd'hui" (Dashboard)** : bandeau avatars+noms des membres en support ce jour précis (granularité jour via `supportDaysForMember`). S'affiche uniquement si des membres couvrent aujourd'hui.

**4 — Envoi direct Slack** : endpoint `/api/slack/send` ([slack.py](app/routers/slack.py)) proxy httpx. Settings → Intégrations : section **Slack** avec URL webhook, Tester, Effacer — même pattern que JIRA. Bouton **💬 Slack** dans chaque panneau rotation (visible si webhook configuré).

**6 — Timeline visuelle (vue Support)** : toggle **☰ Tableau / ▦ Timeline**. Vue Timeline : ligne par membre, colonne par jour ouvré du PI, cellule colorée = jour de support. Semaine + jour courants surlignés. Colonne Membre sticky.

**7 — Raccourcis clavier** : `←`/`→` déplace le focus entre pastilles jours dans une ligne. `Shift+Espace` = toggle toute la semaine.

**8 — Scroll memory** : scroll horizontal sauvegardé en `localStorage` (`rot-scroll-{team}`) avant le repli du panneau, restauré à l'ouverture.

## [3.102.0] - 2026-07-01

### Feat : rotation support à la granularité jour (mini-strip Lun→Ven)
- **Constat** : la grille de rotation ne s'assignait qu'à la **semaine entière**. Impossible de modéliser une couverture intra-semaine (ex. « Léa lundi→mercredi, Karim jeudi→vendredi ») pourtant courante en pratique.
- **Modèle** ([people.py](app/models/people.py), [migrations.py](app/migrations.py)) : nouvelle colonne JSON `member_days` sur `supportrotation` (`{ "Nom": [0..4] }`, index = position du jour ouvré dans la fenêtre `[week_start, week_end]`). **Additif et rétro-compatible** : un membre présent dans `members` sans entrée `member_days` = semaine pleine. Exposée en `memberDays` via [serializers.py](app/serializers.py) + `field_map` du routeur ([support.py](app/routers/support.py)) ; propagée dans l'import ([data.py](app/routers/data.py)).
- **Helpers** ([utils.js](static/js/utils.js)) : `supportWorkingDays(weekStart)` (les 5 jours ouvrés de la fenêtre, dans l'ordre chronologique réel — donc `V L M M J` pour une équipe qui bascule le vendredi) et `supportDaysForMember(entry, name)` (résout les jours effectifs avec fallback semaine pleine).
- **Édition** ([settings.js](static/js/views/settings.js)) : chaque cellule devient un mini-strip de 5 pastilles jour. **Clic** = un jour ; **double-clic** = toute la semaine (remplit/vide). Normalisation auto : 0 jour → hors support ; 5 jours → semaine pleine (pas d'entrée `member_days`) ; sinon partiel.
- **Lecture** ([pi.js](static/js/views/pi.js)) : vue PI compacte — semaine pleine = `✓`, couverture partielle = mini-strip. Le message « 📋 Copier » (Slack/Teams) précise les jours pour les membres partiels. La vue Support ([support.js](static/js/views/support.js)) badge les jours quand la couverture n'est pas pleine.
- **Note** : `members` reste la source de vérité « qui est en support cette semaine » (compteurs, golden export inchangés) ; `member_days` ne fait que raffiner.

## [3.101.0] - 2026-06-29

### Feat : édition inline des objectifs PI depuis le Dashboard (texte, statut, commis/stretch, BV)
- **Constat** : corriger un objectif PI (texte, statut, BV, commis/stretch) depuis le Dashboard imposait d'aller dans PI Planning → Objectifs, perdant le contexte de la vue d'ensemble.
- **Frontend** ([dashboard.js](static/js/views/dashboard.js)) : sur le PI courant uniquement (un PI passé reste un snapshot figé, éditable via PI Planning si déverrouillé), chaque ligne de `pi-obj-attain-list` devient éditable : texte en `contenteditable` (Entrée valide, Échap annule), icône de statut cliquable (cycle todo → en cours → terminé → bloqué), badge Commis/Stretch cliquable (toggle), BV cliquable (0–10, clampé). Chaque édition réécrit l'objectif à son index d'origine (`_idx`, conservé après filtre/tri) dans `piInfo.objectives` puis persiste via `api.updatePI` (même chemin que l'éditeur complet de PI Planning).
- **CSS** ([dashboard.css](static/css/views/dashboard.css)) : affordances hover/focus (anneau de couleur primaire) sur les éléments désormais éditables.

### Style : résultats de vote (Fist of Five / Mood-ROTI) en grille compacte multi-équipes
- **Constat** : `#vote-results` empilait une ligne pleine largeur par équipe, obligeant à scroller dès que plusieurs équipes votaient.
- **Frontend** ([pi.js](static/js/views/pi.js), [forms.css](static/css/views/forms.css)) : chaque équipe devient une mini-carte verticale compacte (nom+suppression / score+nb votes / barre de distribution) ; `.vr-list` passe en grille responsive (`auto-fill, minmax(130px,1fr)`) pour afficher plusieurs équipes côte à côte selon la largeur d'écran au lieu d'une liste verticale unique.

---

## [3.100.0] - 2026-06-26

### Feat : export/import complet des votes (Mood / Fist Five / Confidence), des Rétro, des Calendriers, et réparation import Risques ROAM
- **Constat** : les votes Mood / Fist of Five / Confidence sont bien persistés en base ([`MoodVote`](app/models/agile.py), via `/api/mood`) et non en localStorage — mais ils étaient absents de `/api/export` et `/api/import`. Les votes `confidence` (vote de confiance par objectif de PI, sous l'onglet « ✊ Fist of Five ») n'étaient même pas exposés dans `/api/all`. Les Rétro (`RetroItem`) étaient dans `/api/all` mais ni exportées ni importées. Les calendriers ICS étaient exportés mais volontairement exclus de l'import. Les Risques ROAM étaient exportés mais le handler `/api/import` ne les traitait pas (réimport silencieusement ignoré).
- **Backend** ([data.py](app/routers/data.py)) : `export_all` + `/api/all` exposent désormais `moodVotes`, `fistVotes` et `confidenceVotes` (une clé par type). `retroItems` ajouté à `_EXPORT_SPEC`. Le handler `/api/import` gère les nouvelles entrées : `risks` (bug corrigé), `retroItems`, les 3 types de votes (`replace` scopé au type), et `calendars` (recrée le lien ICS url/nom/équipe ; les events sont re-fetchés depuis l'URL au prochain rafraîchissement, `events_json` n'étant pas exporté).
- **Frontend** ([settings.js](static/js/views/settings.js), [app.js](static/js/app.js)) : catégorie d'export « Mood & Fist Five » (`votes` → `moodVotes` + `fistVotes` + `confidenceVotes`) + nouvelle catégorie « Rétro (actions) », avec compteurs. `confidenceVotes` chargé dans le store au boot (compteur juste). `IMPORT_CATEGORIES` n'exclut plus « Calendriers » — toutes les catégories d'export sont désormais ré-importables.
- **Hors périmètre** (décision validée) : votes Poker (éphémères) non concernés ; les configs calendrier par-PI (`pi-cfg-N` : date de début / nb sprints / durée) restent en localStorage, JIRA gardant la source de vérité des dates.

## [3.99.5] - 2026-06-25

### Fix : « Copier pour Slack » toujours inerte (le commentaire du fix 3.99.4 cassait le script)
- Le correctif 3.99.4 avait bien doublé les `\\n` des lignes de **code**, mais le **commentaire** ajouté pour documenter le piège contenait lui-même un `\n` simple — transformé en vrai saut de ligne par le template literal externe, il coupait le commentaire en deux et exposait du texte comme du code (`SyntaxError: Unexpected identifier 'deviendrait'`) → script inline toujours non chargé, bouton inerte.
- **Fix** : commentaire réécrit sans aucune séquence backslash. **Vérifié** en extrayant et générant réellement le `<script>` inline depuis le source (évaluation du template literal + `vm.Script`) : `=> SCRIPT GENERE : SYNTAXE OK`.
- Leçon : dans ce `<script>` inline, le piège des backslashes vaut aussi pour les **commentaires**, pas seulement les chaînes.

## [3.99.4] - 2026-06-25

### Fix : bouton « Copier pour Slack » de la Review ne copiait plus rien
- **Symptôme** : un clic sur « Copier pour Slack » ne copiait qu'une seule ligne (en réalité l'ancienne sélection de l'utilisateur, le titre H2 de la page) — le presse-papier n'était jamais écrit.
- **Cause** ([sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js)) : le code ajouté en 3.99.2 pour reprendre la zone « Décisions » est injecté dans le `<script>` inline, lui-même dans le template literal externe `return \`…\``. Les `\n` en chaînes simple-quotes étaient interprétés par le template literal **externe** et devenaient de vrais sauts de ligne → chaîne `'…'` multi-lignes = **SyntaxError** dans le script généré → aucun écouteur de clic câblé (bouton inerte).
- **Fix** : doublé les séquences (`\\n`) dans le bloc Décisions pour qu'elles survivent jusqu'au script généré (`split('\\n')`, `join('\\n')`, séparateur `'\\n\\n…'`). Vérifié : le script généré est désormais syntaxiquement valide.

## [3.99.3] - 2026-06-25

### Sprint Review — « À reporter » avant « Actions rétro »
- Inversion de l'ordre des deux sections, sur la page HTML **et** dans la copie Slack ([sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js)) : « 🔄 À reporter au prochain sprint » passe désormais **avant** « 🔁 Actions rétro à passer en revue ». L'enchaînement suit le déroulé naturel de la review (ce qui reste à finir, puis le tour de table des actions rétro).

## [3.99.2] - 2026-06-25

### Amélioration : Sprint Review — copie Slack plus riche + points reportés
- **Emoji de type par ticket** dans la copie Slack ([sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js) `_slackList`) : chaque ligne Réalisations / Actions rétro / À reporter est préfixée de l'icône de type (📖/⚙️/🐛/🛡️/🔁…), comme le rendu HTML — meilleur scan.
- **Section « À reporter » détaillée** : remplace le simple compteur par la liste des tickets (10 max), bloqués en tête (la liste est déjà triée `blocked → inprog → review → test → todo`), avec le total de points reportés.
- **Total points « À reporter »** aussi affiché dans le badge de la page HTML (`N tickets · M pts`) — mesure la dette de sprint d'un coup d'œil.
- **Zone « Décisions & prochaines étapes » reprise dans la copie** : la zone éditable est relue au moment du clic « Copier pour Slack » et ajoutée en fin de message (elle était jusqu'ici perdue car le texte Slack est généré avant l'édition).

## [3.99.1] - 2026-06-25

### Fix : Copier Slack Review — lien JIRA affiché en littéral `…/browse/GDEM-4212|GDEM-4212`
- **Problème** : sur la page Sprint Review, le bouton "Copier pour Slack" produisait des liens au format `<URL|ID>` pour les tickets des sections **Réalisations** et **Actions rétro**. Collés dans Slack, ils s'affichaient en littéral avec le `|` (`https://erpc.atlassian.net/browse/GDEM-4212|GDEM-4212`) au lieu d'être cliquables.
- **Cause** ([sprint_tickets_modal.js:1618](static/js/components/sprint_tickets_modal.js#L1618)) : le helper `_slackKey` réutilisait le format `<URL|texte>`, déjà identifié comme non interprété par Slack au paste dans la 3.6.31 (le composeur Slack ne traite ce format qu'à la frappe / via l'API, pas au collage).
- **Fix** : `_slackKey` émet désormais l'**URL nue** (`…/browse/GDEM-4212`), auto-linkifiée par Slack/Teams/Gmail sans configuration — cohérent avec le format texte universel adopté en 3.6.31.

## [3.99.0] - 2026-06-25

### Fix : membre parti encore visible dans Agenda et sur /#support (hero-card)
- **Cause** ([agenda.js](static/js/views/agenda.js), [support.js](static/js/views/support.js)) : `_supportForDay` (Agenda) et `_heroCard` (page Support, "Rotation cette semaine") lisaient `SupportRotation.members` brut (noms figés en base au moment du shuffle) sans le filtrer contre le roster effectif du PI affiché — même symptôme déjà corrigé côté panneau latéral (3.97.0), pas encore appliqué à ces deux vues.
- **Fix** : les deux vues utilisent désormais le helper partagé `effectiveRosterForPi` (au lieu de dupliquer la résolution snapshot/fallback localement) — `agenda.js` filtre les noms de `_supportForDay`, `support.js` propage le roster à `_heroCard` via `_renderHeroRotation` (3 vues : équipe, groupe, orphelins). Un membre qui a quitté l'équipe ne s'affiche plus dans `.agenda-support-bar`, `.agenda-member-row`/`.agenda-support-row`, ni dans `.sup-hero-card`.
- `effectiveRosterForPi` (utils.js) normalise désormais aussi le nom d'équipe du snapshot PI (`extractTeam`), nécessaire pour que `teamNameMatches` apparie correctement membre ↔ équipe dans ces nouveaux filtres.

## [3.98.0] - 2026-06-25

### Fix : vote Fist of Five enregistré sous un sprint "S1" générique au lieu de "30.1"
- **Cause** ([pi.js](static/js/views/pi.js)) : `renderVotingPanel` (formulaire "Voter") et `_renderConfidenceByObjective` calculaient le PI courant via `piInfo?.number || 0` seul, sans repasser par `getCurrentPi` (sprint actif > config) — contrairement à 3 autres endroits du même fichier qui appliquaient déjà ce fallback. Quand `piInfo.number` était vide/obsolète au moment du vote, le sélecteur de sprint retombait sur un libellé générique `S1`/`S2`/… au lieu de `30.1`/`30.2`/… — le vote était alors enregistré avec `piSprint: "S1"`, qui ne matche plus jamais le label `"30.1"` utilisé ailleurs (panneau latéral, résultats de sondage) → "Aucun vote confiance · 30.1" malgré des votes bien enregistrés.
- **Fix** : les deux fonctions utilisent désormais `getCurrentPi({ sprintInfo, piInfo })`, comme partout ailleurs dans le fichier.
- **Limite connue** : ce fix empêche le bug pour les *futurs* votes — les votes déjà enregistrés sous un `piSprint` générique (`S1`, …) restent orphelins (le sélecteur ne propose plus que `30.1`, `30.2`, etc.). À corriger au cas par cas (revoter, ou migration ciblée si le volume le justifie).

## [3.97.0] - 2026-06-25

### Fix : membre parti depuis un PI précédent encore affiché en rotation Support
- **Cause** : `SupportRotation.members` est figé en base au moment du shuffle — si un membre quitte l'équipe après coup, son nom reste affiché indéfiniment (panneau latéral "Support cette semaine", page Support, grille Rotation de Paramètres) tant que personne ne relance un shuffle sur cette semaine. Confirmé sur l'équipe Gabbiano (Guillaume COLSENET assigné en 30.1.2/30.3.2/… alors qu'il n'apparaît plus dans le roster du PI 30).
- **Fix** : nouveau helper `effectiveRosterForPi(piInfo, piNum, absences, members)` ([utils.js](static/js/utils.js)) — priorité au snapshot de membres figé à l'import CSV du PI affiché (gère le turnover), sinon fallback `deriveMembersFromAbsences`. Même logique déjà utilisée par la grille Rotation Support (Paramètres), désormais partagée au lieu d'être dupliquée.
- Appliqué pour filtrer les membres affichés : [infopanel.js](static/js/components/infopanel.js) (panneau latéral), [support.js](static/js/views/support.js) (lignes de la page Support + stats d'équité "Top 3"). La grille Rotation de [settings.js](static/js/views/settings.js) utilisait déjà cette logique (dupliquée localement) — remplacée par le helper partagé.
- Le nettoyage des lignes déjà shuffle (retirer le nom en base) reste manuel : relancer un shuffle sur la semaine concernée dans Paramètres → Rotation Support.

## [3.96.0] - 2026-06-25

### Feat : aperçu zoomable standardisé (utils.js), réutilisé dans les pièces jointes d'atelier
- **Standardisation** ([utils.js](static/js/utils.js)) : `diagramFrameHtml(src, alt, extraClass)` génère le markup `.diagram-frame` (déjà décoré automatiquement par `initDiagramZoom()`) — évite de dupliquer ce HTML à chaque nouvel usage. [Settings.js](static/js/views/settings.js) (diagrammes Excalidraw) migré sur ce helper.
- **Équipe → Pièces jointes d'atelier** ([team.js](static/js/views/team.js)) : les images (SVG/PNG/JPG/GIF/WebP, ex. un export Excalidraw de Team Canvas) affichent désormais une vignette zoomable au lieu d'un simple lien de téléchargement — chip de nom de fichier + suppression conservés en dessous. SVG ajouté aux types acceptés à l'upload.

## [3.95.0] - 2026-06-25

### Fix + Feat : diagrammes Excalidraw tronqués dans Paramètres → zoom/pan plein écran
- **Fix troncature** ([settings.css](static/css/views/settings.css)) : l'aperçu forçait une hauteur fixe (420px) avec scroll horizontal dans une section large de 800px max — illisible, on ne voyait qu'une tranche du diagramme. L'aperçu affiche désormais l'image entière à 100% de la largeur disponible (plus de coupe).
- **Nouveau composant** [diagram_zoom.js](static/js/components/diagram_zoom.js) : clic sur un diagramme → popin plein écran avec zoom (molette, centré sur le curseur, ou pincement à deux doigts au tactile) et pan (glisser), boutons +/−/Ajuster, double-clic pour réinitialiser, Échap pour fermer. Même esprit que [chart_zoom.js](static/js/components/chart_zoom.js) (zoom des graphiques) mais dédié aux images, sans dépendance.
- Câblé globalement via `initDiagramZoom()` ([app.js](static/js/app.js)), décore tout `.diagram-frame` présent dans la page (pas seulement Paramètres).

## [3.94.0] - 2026-06-25

### Fix : votes mood/fist invisibles dans le panneau latéral après un vote fraîchement saisi
- **Cause** ([pi.js](static/js/views/pi.js)) : voter (ou supprimer un vote) dans le panneau "Mood"/"Fist of Five" de PI Planning ne rafraîchissait que la vue locale (`refreshResults`, re-fetch direct depuis l'API) — le store global `moodVotes`/`fistVotes` n'était mis à jour qu'au chargement initial de l'app. Le panneau latéral (et les cellules mood de Health) restaient donc sur l'instantané de démarrage et affichaient "Aucun vote" malgré des votes bien enregistrés en base.
- **Fix** : nouvelle fonction `_syncGlobalVoteStore(type)` qui re-synchronise `store.moodVotes`/`store.fistVotes` après chaque vote/suppression, puis rafraîchit explicitement le panneau latéral (`updateInfoPanel()` — pas un rerender de toute la vue PI, pour ne pas perdre l'état du panneau de vote en cours d'utilisation).

## [3.93.0] - 2026-06-25

### Feat : diagrammes Excalidraw de l'histoire du projet dans Paramètres → A propos
- **Conversion SVG** ([docs/excalidraw/to_svg.py](docs/excalidraw/to_svg.py)) : script Python autonome (sans dépendance, sans node) qui parse les scènes `.excalidraw` (`docs/excalidraw/*.excalidraw`) et génère des SVG statiques (`static/img/excalidraw/*.svg`) — rendu net (pas de style "sketchy" rough.js), fidèle aux formes/couleurs/textes. À relancer après toute modification d'un `.excalidraw`.
- **Police** : réutilise la police "Patrick Hand" déjà auto-hébergée pour le ton manuscrit ([team.css](static/css/views/team.css)), pas de service tiers.
- **Affichage** ([settings.js](static/js/views/settings.js)) : 3 diagrammes repliables (`<details>`) dans la section "A propos" — Histoire du projet, Storytelling, User Story Mapping — avec scroll horizontal ([settings.css](static/css/views/settings.css)).

## [3.92.0] - 2026-06-25

### Style : panneau latéral allégé — Absences retirée, Support filtré par équipe
- **Card "Absents (N)" retirée** ([infopanel.js](static/js/components/infopanel.js)) : peu utile telle quelle (toutes équipes confondues, sans rapport avec l'équipe sélectionnée).
- **"Support cette semaine" filtré** : ne liste plus que les rotations de l'équipe sélectionnée dans le sidebar (toutes les équipes restent affichées si aucune équipe spécifique n'est sélectionnée).

## [3.91.0] - 2026-06-25

### Feat : liste des objectifs PI dans le panneau latéral
- La card "🎯 Objectifs PI" ([infopanel.js](static/js/components/infopanel.js)) n'affichait que le compteur et la barre de progression — elle liste désormais les objectifs eux-mêmes (icône de statut + texte, jusqu'à 6 puis "+N autres"), même style `.panel-list`/`.panel-list-item` que les autres cards de ce panneau.

## [3.90.0] - 2026-06-25

### Fix : panneau latéral "Aucun vote" alors que des votes mood existent
- **Cause** ([infopanel.js](static/js/components/infopanel.js)) : le label du sprint courant (`curLabel`, ex. "30.1") était reconstruit à la main depuis `piInfo.number + index` au lieu d'être extrait du nom du sprint actif. Quand `piInfo.number` est vide/obsolète, la reconstruction produit un label tronqué (`".1"`) — qui matche `sprintInfo.name` par accident (`"Team G - Ité 30.1".includes(".1")` est vrai !) mais ne matche plus aucun `v.piSprint` réel (`"30.1"` ≠ `".1"`), donc le panneau affichait "Aucun vote · .1" alors que 3 votes existaient bien pour ce sprint.
- **Fix** : nouvelle fonction `extractSprintLabel(name)` ([utils.js](static/js/utils.js)) qui extrait le label `"NN.N"` directement par regex depuis le nom du sprint — même principe que `getCurrentPi`/`extractPiNum` déjà en place pour éviter de réimplémenter cette extraction. `health.js` réutilise désormais aussi cette fonction (au lieu de sa propre regex locale `_spKey`) pour rester la source unique.

## [3.89.0] - 2026-06-24

### Style : statut aussi en liste déroulante, comme le type
- **Même traitement que le type** ([modal.js](static/js/components/modal.js)) : le statut redevient un badge cliquable (`statusBadge`) dans la ligne meta, qui ouvre une liste déroulante de chips colorées au lieu d'occuper une rangée fixe de 6 boutons.
- **Helper factorisé** : `_openTypeDropdown` devient `_openChipDropdown(el, items, currentValue, onCommit)`, générique — utilisé pour le type et le statut au lieu de dupliquer la même fonction deux fois (classe CSS renommée `.chip-dropdown`).

## [3.88.0] - 2026-06-24

### Style : type de ticket en liste déroulante (au lieu d'une rangée fixe dans la ligne meta)
- **Retour en arrière partiel sur 3.86.0/3.87.0** ([modal.js](static/js/components/modal.js)) : afficher tous les types en permanence dans `.mdl-meta` prenait trop de place. Le sélecteur de type redevient un clic sur le badge du titre, mais ouvre désormais une liste déroulante ancrée sous le badge avec les mêmes chips colorées (icône + couleur par type, `_openTypeDropdown`) que la modale de création — au lieu de l'ancien picker générique sans couleur (`_openChipPicker`).
- Le statut reste affiché en permanence dans la ligne meta (`chip-sel-group--status`), inchangé — il n'a que 6 valeurs et reste lisible sur une ligne.

## [3.87.0] - 2026-06-24

### Fix : clic sans effet sur le badge de type dans l'en-tête
- Le badge devenu non-éditable (3.86.0) ne faisait plus rien au clic — mauvaise UX. Il scrolle désormais vers le sélecteur de type (`chip-sel-group`) dans la ligne meta et le flashe brièvement, même mécanisme que le badge commentaires qui scrolle vers les commentaires.

## [3.86.0] - 2026-06-24

### Style : type de ticket aussi harmonisé — plus de chip-picker flottant
- **Cause** ([modal.js](static/js/components/modal.js)) : le statut utilisait déjà la nouvelle `chip-sel-group`, mais le badge de type ouvrait encore l'ancien picker flottant générique (`_openChipPicker`/`.chip-picker-opt`) — sans icônes ni couleur par type, visuellement différent du sélecteur de la modale de création malgré la demande d'homogénéité.
- **Fix** : le type est désormais une `chip-sel-group` dans la ligne meta (même rendu — icône + couleur par type — que la modale de création), juste avant celle du statut. Le badge de type dans la barre de titre redevient un simple repère visuel (non cliquable) ; modifier le type se fait via les chips.

## [3.85.0] - 2026-06-24

### Style : statut de la modale ticket harmonisé avec les chips de la création
- **`<select>` natif → `chip-sel-group`** ([modal.js](static/js/components/modal.js)) : le sélecteur de statut de la modale détail reprend désormais exactement le même style que le sélecteur de type de la modale de création (boutons radiogroup colorés, icône + libellé) — les couleurs par statut (`.chip-sel--todo/inprog/review/test/blocked/done`) existaient déjà dans [forms.css](static/css/views/forms.css), seul le câblage manquait.
- **Pas étendu à la carte Rétro** (`retro-status-select`, police 9px dans une colonne de swimlane très dense) — un radiogroup de boutons n'y tiendrait pas ; le `<select>` compact reste le bon choix dans ce contexte précis.

## [3.84.0] - 2026-06-24

### Fix : badge de type non cliquable dans la modale ticket
- **Cause** ([modal.js](static/js/components/modal.js)) : le badge de type (`[data-field="type"]`) est rendu dans la barre de titre (`titleEl()`), mais `_bindInlineEditors` n'était appelé que sur le corps de la modale (`bodyEl()`) — son `querySelectorAll('[data-field]')` ne trouvait donc jamais ce badge, et cliquer dessus ne faisait rien.
- **Fix** : `_bindInlineEditors` est désormais appelé sur `#modal` (ancêtre commun titre + corps) au lieu de `bodyEl()` seul — le picker de type s'ouvre normalement au clic.

## [3.83.0] - 2026-06-24

### Style : grand vide évité au retour à la ligne sur la ligne meta de la modale ticket
- **Cause** ([modal-detail.css](static/css/views/modal-detail.css)) : `.mdl-meta-right` (équipe/sprint/date) utilisait `margin-left: auto` pour se coller à droite — quand les chips de gauche (statut/priorité/points/Réestimer/Bloqué/cycle/lead) étaient trop nombreuses pour tenir sur une ligne, ce retour à la ligne forçait `.mdl-meta-right` tout à droite de sa propre ligne, laissant un grand espace blanc inutile à gauche (visible ex. sur GDEM-4212).
- **Fix** ([modal.js](static/js/components/modal.js)) : remplacement par un espaceur flexible (`.mdl-meta-spacer`, `flex:1 1 0`) — il absorbe l'espace restant quand tout tient sur une ligne (même rendu qu'avant), mais s'efface naturellement au retour à la ligne au lieu de forcer l'écart. `.mdl-meta-right` peut aussi désormais wrapper son propre contenu si besoin.

## [3.82.0] - 2026-06-24

### Fix : modale de vélocité bloquée après ouverture puis fermeture d'un ticket
- **Cause** ([health.js](static/js/views/health.js)) : `_openSprintModal` empilait une nouvelle entrée d'historique (`pushState`) à chaque ouverture, y compris lors de la réouverture automatique déclenchée par `reopenSprintModalFromHash` (elle-même appelée en réponse à une navigation arrière depuis la modale de détail ticket). Résultat : ouvrir un ticket puis le fermer dupliquait l'entrée `~sprint=...`, et "Fermer"/Échap sur la modale de vélocité ne faisait que revenir sur ce doublon au lieu de quitter — la modale semblait ne plus jamais se fermer.
- **Fix** : `_openSprintModal` n'empile une entrée que pour une ouverture initiée par l'utilisateur (nouveau paramètre `pushHistory`, `true` par défaut) ; `reopenSprintModalFromHash` l'appelle désormais avec `pushHistory: false` puisque le hash courant correspond déjà à l'état voulu.

## [3.81.0] - 2026-06-24

### Feat : vélocité par ligne produit (groupe d'équipes)
- **Chips regroupées** ([health.js](static/js/views/health.js)) : le sélecteur d'équipe au-dessus du graphe de vélocité (Health) clusterise désormais les équipes sous leur ligne produit (`TeamGroup`), avec une pastille de ligne produit cliquable en plus des chips équipe individuelles ; les équipes sans ligne produit restent dans un cluster "Autres équipes".
- **Filtrer sur une ligne produit** affiche une grille d'une carte de vélocité par équipe du groupe (au lieu d'une seule courbe agrégée illisible) — chaque carte a son propre graphe Chart.js (`canvasId` dédié par équipe). Re-cliquer sur la ligne produit active revient à la sélection par équipe simple.
- Préférence persistée dans `localStorage` (`sb-health-velo-group`), nettoyée automatiquement si la ligne produit a été supprimée depuis.

## [3.80.0] - 2026-06-24

### Fix : vélocité affichant 0 alors que des tickets sont Done en cours de sprint
- **Cause** ([health.js](static/js/views/health.js)) : la vélocité de la cellule principale du tableau Health priorisait la stat JIRA (`ref.velocity`) sur le calcul local dès qu'elle était non-nulle — y compris quand JIRA renvoie `0` pour un sprint encore actif (la stat Greenhopper ne se fige qu'à la clôture). Résultat : un sprint en cours avec des tickets Done localement pouvait afficher 0 pts.
- **Fix** : la somme des points Done **locaux** est désormais prioritaire dès qu'on a au moins un ticket Done connu ; JIRA ne sert plus de fallback que si aucun Done local n'est connu (sprint clos non synchronisé). Même logique côté Buffer. Comportement aligné avec celui déjà utilisé dans le tableau détaillé de la modale sprint, qui ne souffrait pas du problème.

### Style : liste de tickets du détail sprint plus lisible
- **« 0 » au lieu de « — » sur sprint en cours/clos** ([health.js](static/js/views/health.js)) : une cellule vide (nb engagés, planifié, réalisé, points d'un ticket) est un vrai zéro mesuré une fois le sprint démarré ou terminé — seuls les sprints à venir gardent le « — » (rien n'a encore pu se passer).
- **Total réestimé visible** ([health.js](static/js/views/health.js)) : si au moins un ticket de la liste a été réestimé pendant le sprint, le total en pied de tableau (et le badge d'en-tête) affichent désormais `lancement→actuel` (ex. `10→13`) au lieu du seul total au lancement, avec tooltip explicite — sinon l'écart par ticket restait invisible au niveau agrégé.
- **Ligne Terminé/Done** ([health.css](static/css/views/health.css), `.htl-ticket-row--done`) : au-delà du simple ✓, toute la ligne reçoit désormais une teinte verte, un liseré sur la colonne ID et un titre légèrement atténué — plus facile à repérer dans une liste mêlant tickets faits/à faire.
- **Couleur par parent renforcée** : la teinte par epic/feature (`--pc`) était techniquement appliquée mais trop subtile (8-13% de mix) pour être perçue comme distincte d'un parent à l'autre — fond/bordure renforcés et pastille colorée ajoutée devant le libellé.
- **Groupe ActionRetro dédié** ([health.js](static/js/views/health.js)) : les tickets portant le label `ActionRetro` (pas de Story Points attendu — déjà exclus de l'anomalie "Sans estimation" via `isActionRetro`, désormais exportée depuis [business_rules.js](static/js/business_rules.js)) sont isolés dans leur propre groupe 🔁 plutôt que noyés dans "Sans parent", où ils ressemblaient à des tickets non estimés à corriger.

## [3.79.0] - 2026-06-24

### Fix : historique Story Points tronqué + liens profonds sur le détail des sprints
- **Cause d'un ticket réestimé invisible** (ex. GDEM-1777, 3→5 pts non affiché) : `_extractRecentChanges` ([sync.js](static/js/sync.js)) ne gardait que les 8 derniers changements JIRA **toutes catégories confondues** — un changement Story Points ancien pouvait être évincé par des changements de statut/assignee plus récents, le rendant invisible à `_pointsAtLaunch` même après resync. Les champs `story points` et `sprint` ne sont désormais plus jamais évincés par ce cap (les autres champs continuent de se partager le quota de 8). **Nécessite une resynchronisation JIRA pour les tickets déjà importés** — les historiques déjà tronqués ne peuvent pas être reconstitués sans un nouvel appel à l'API JIRA.
- **Liens profonds sur le détail des sprints** ([health.js](static/js/views/health.js), [app.js](static/js/app.js)) : cliquer sur une cellule du tableau interne (planifié/réalisé/buffer d'un sprint du PI) met désormais à jour l'URL (`~sprint=<metric>:<équipe>:<sprint>`, remplacé sans empiler l'historique) — la cellule active reste surlignée et le lien peut être partagé ou rechargé sans perdre la sélection. Ancien format `~sprint=<metric>:<équipe>` toujours supporté en lecture (rouvre sur le sprint de référence).

## [3.78.0] - 2026-06-24

### Fix : vélocité planifiée faussée par une réestimation en cours de sprint
- **Cause** : la « vélocité planifiée au lancement » (colonne du tableau Health, métriques `planned`/`bufplanned`) sommait les Story Points **courants** des tickets du sprint au lieu des points **au lancement** — une réestimation en cours de sprint gonflait artificiellement le planifié. Cas constaté : GDEM-4057 (5→8 pts pendant l'Ité 30.1) faisait afficher 13 pts planifiés au lieu de 10.
- **Fix** ([health.js](static/js/views/health.js), `_pointsAtLaunch`) : reconstruction des points au lancement depuis l'historique JIRA du champ Story Points (`recentChanges`) — ne garde la valeur reconstituée que si elle est `> 0` (un ticket non encore estimé au lancement, ex. 0→1 pts, continue de compter ses points actuels plutôt qu'un planifié à 0, trompeur).
- **Bonus** : la liste de détail (clic sur la cellule planifiée) affiche désormais `lancement→actuel` (ex. `5→8`) pour chaque ticket réestimé pendant le sprint, avec tooltip explicite ; le total de cette liste et le tri restent cohérents avec la cellule du tableau.

## [3.77.0] - 2026-06-24

### Fix : audit Équipe & Ateliers — fuites, intégrité des clés, durcissement upload
- **Pièces jointes orphelines** : supprimer un atelier (`WorkshopTemplate`) laissait les fichiers de ses réponses (`TeamWorkshop`) sur disque, plus jamais référencés. La cascade de suppression (`delete_workshop_cascade`, [team_workshops.py](app/routers/team_workshops.py)) est désormais partagée entre les deux chemins de suppression.
- **Doublons de réponses** : ajout d'une contrainte unique `(team, template_key)` sur `TeamWorkshop` ([team_identity.py](app/models/team_identity.py), migration idempotente) — empêchait un double-clic/double-onglet de créer deux réponses pour le même atelier dont une serait silencieusement ignorée.
- **Clé d'atelier immuable + slugifiée** : modifier la `key` d'un atelier après création orphelinait silencieusement toutes les réponses existantes — désormais rejeté côté API. Les clés (template ET questions) sont normalisées (`slugify`, [app/common.py](app/common.py)) à la création, à l'édition et à l'import JSON/CSV, pour éviter qu'un libellé avec espaces/accents ne casse les sélecteurs DOM générés côté front.
- **Upload durci** ([attachments.py](app/routers/attachments.py)) : lecture bornée à 15 Mo+1 (au lieu de tout lire avant de vérifier la taille), Content-Type de réponse dérivé de l'extension plutôt que de la valeur déclarée par le client (non fiable).
- **Activer/désactiver un atelier** : la case `active` existait déjà en base mais n'était pilotable que par suppression définitive — ajout d'une case à cocher dans l'admin ; le panneau admin liste désormais aussi les ateliers inactifs (sinon impossible de les réactiver).
- **Qualité des réponses riches** ([team.js](static/js/views/team.js)) : un champ texte riche cliqué puis laissé vide (résidu `<br>` du contenteditable) n'est plus compté comme "rempli".

## [3.76.0] - 2026-06-24

### Feat : export/import de la fiche d'identité et des ateliers
- **Nouvelle tuile « Équipe (fiches & ateliers) »** dans la modale Export ([settings.js](static/js/views/settings.js)) regroupant `teamIdentities`, `workshopTemplates`, `teamWorkshops` — disponible en JSON, CSV et ZIP comme les autres catégories.
- **Import** : ces 3 entités sont reconnues par la modale d'import (prévisualisation, modèle JSON vide) et réellement réécrites en base côté backend ([app/routers/data.py](app/routers/data.py), `import_all`) en mode Remplacer ou Fusionner — jusqu'ici elles étaient exportables mais pas ré-importables.
- Les pièces jointes (fichiers binaires) restent hors export/import, comme les calendriers ICS — seules les métadonnées structurées sont concernées.

## [3.75.0] - 2026-06-24

### Feat : roster d'équipe trié par rôle + bandeau du jour limité à Dashboard/Board
- **Membres triés par rôle** ([team.js](static/js/views/team.js)) : la fiche d'identité affiche désormais les membres à droite du header, triés par rôle puis par nom, sous forme de chips cliquables.
- **Clic membre → fiche radar** ([atlas.js](static/js/views/atlas.js)) : réutilise la fiche membre (compétences/appétences/mobilité) déjà construite pour Atlas plutôt que de dupliquer une modal — exposée via `openMemberCard`.
- **« En mémoire »** : ligne dédiée sous le roster listant les membres présents au PI précédent (snapshot `piInfo.piMembers`) mais absents du roster courant — turnover visible sans aller chercher dans PI Planning.
- **Bandeau du jour resserré** ([cal_banner.js](static/js/components/cal_banner.js)) : les réunions/absences sous le header ne s'affichent plus que sur Dashboard et Board — ailleurs (Équipe, Atlas, Backlog...) il était redondant ou hors-sujet.

## [3.74.0] - 2026-06-24

### Style : selects "sexy", Team Canvas sur une ligne, fiche d'identité différenciée par couleur
- **Listes déroulantes des ateliers** ([team.css](static/css/views/team.css), `.select-fancy`) : flèche teintée par la couleur de catégorie, bordure et halo au focus/survol, typographie plus affirmée — scopé aux champs de réponse d'atelier (pas touché ailleurs sur le site).
- **Team Canvas en une ligne** : `.team-workshop-canvas-grid` passe d'une grille qui retombait à la ligne à un déroulé horizontal façon plateau de post-its (`overflow-x: auto`, post-its de largeur fixe).
- **Titres de questions d'atelier** en police manuscrite teintée par la couleur de la catégorie (cohérent avec le titre de la carte).
- **Fiche d'identité différenciée** : chaque champ (Vision, Périmètre, Qui sommes-nous...) reçoit une couleur dédiée parmi rouge/jaune/vert/bleu/orange/violet (bordure, pastille devant le libellé, fond teinté), pour les distinguer visuellement au premier coup d'œil.

## [3.73.0] - 2026-06-24

### Feat : édition riche des ateliers + fiche d'identité cliquable + export Slack
- **Éditeur riche dans les ateliers** ([team.js](static/js/views/team.js)) : les questions de type texte libre utilisent désormais le même éditeur WYSIWYG que la description des tickets (gras/italique/souligné/listes/lien) — réutilise directement les classes `desc-toolbar`/`desc-editable`/`mdl-description` de [modal-detail.css](static/css/views/modal-detail.css), aucune nouvelle dépendance ni duplication de style.
- **Fiche d'identité cliquable** : fini le gros formulaire à bouton « Enregistrer » — chaque champ s'affiche proprement (sauts de ligne préservés, placeholder discret si vide) et devient éditable au clic ; sauvegarde automatique au blur ou Ctrl+Entrée, Échap pour annuler.
- **Copier pour Slack** : bouton sur la fiche d'identité qui copie l'ensemble des champs remplis au format mrkdwn Slack (`*titre*` + contenu), prêt à coller dans un canal.
- **Admin des ateliers** : renommé « + Question » en « + Item » pour rester générique (un item peut être une question, une note, un critère...).

## [3.72.0] - 2026-06-24

### Feat : ateliers enrichis (catalogue, pièces jointes, habillage visuel)
- **7 nouveaux ateliers** ([app/seed.py](app/seed.py)) : Notre place dans l'ART, Interfaces & dépendances, Rituels & fonctionnement, DoR/DoD, Compétences & responsabilités, Santé d'équipe, FAQ équipe — en plus de Team Canvas/Tuckman/Maturité Agile. Seed désormais idempotent par clé (une réexécution n'écrase ni ne duplique les ateliers existants, permet d'ajouter de nouveaux ateliers par défaut plus tard sans script de migration de données).
- **Pièces jointes par atelier** ([app/routers/attachments.py](app/routers/attachments.py), [app/models/team_identity.py](app/models/team_identity.py)) : image/PDF/XLS/Doc, 15 Mo max, stockées sur disque (`data/uploads/`, nom généré — jamais le nom d'origine) et servies via une route dédiée (pas de listing public). Nécessite la dépendance `python-multipart` (ajoutée à [requirements.txt](requirements.txt)).
- **Habillage visuel des ateliers** ([team.css](static/css/views/team.css)) : galerie de cartes avec icône par atelier, accent coloré par catégorie, police manuscrite mais lisible (Patrick Hand, self-hébergée dans `static/fonts/` — pas d'appel runtime à Google Fonts, conforme à la règle homelab/souveraineté) réservée aux titres. Le Team Canvas se présente désormais en grille de « post-its » colorés (palette `--type-*` existante réutilisée).
- **Admin des ateliers** : ajout d'un champ icône (emoji) par modèle, éditable au même endroit que les questions.

## [3.71.0] - 2026-06-24

### Feat : fiche d'identité d'équipe + ateliers (Team Canvas, Tuckman, maturité Agile)
- **Nouvelle vue « Équipe »** ([team.js](static/js/views/team.js), [team.css](static/css/views/team.css)) : fiche par équipe (vision, périmètre, qui sommes-nous/que faisons-nous/avec qui/comment fonctionnons-nous/besoins pour réussir), membres dérivés des absences (source de vérité existante). Bandeau d'incitation si la fiche est vide.
- **Catalogue d'ateliers admin** ([app/models/team_identity.py](app/models/team_identity.py)) : `WorkshopTemplate` (questions libres, éditables depuis « Gérer les ateliers »), `TeamWorkshop` (réponses par équipe), seedés par défaut avec Team Canvas (FR) basique/avancé, modèle de Tuckman et Maturité Agile ([app/seed.py](app/seed.py)).
- **Backend** : `TeamIdentity` (1 ligne par équipe), routeurs `team_identity.py`, `workshop_templates.py`, `team_workshops.py` ; nouvelles entités ajoutées à `/api/all` et `/api/export` (additif, ne change pas le contrat existant).
- Remplir un atelier n'écrase pas automatiquement la fiche — c'est une référence consultable à côté, à reporter manuellement si pertinent (évite une logique de mapping fragile entre champs d'atelier et champs de fiche).

## [3.70.0] - 2026-06-24

### Feat : import CSV et ZIP (symétrique avec les 3 formats de l'Export)
- **CSV** ([settings.js](static/js/views/settings.js), `_csvTextToRows`) : parseur CSV maison (BOM, délimiteur `;`, cellules entre guillemets, cast au mieux des nombres/booléens, JSON.parse des cellules array/object) — miroir de `arrayToCsv` côté export. La catégorie est déduite du nom de fichier (`squad-board-<categorie>-AAAA-MM-JJ.csv`) ; plusieurs `.csv` peuvent être déposés en même temps (un par catégorie).
- **ZIP** (`_parseZipFile`) : décompression **entièrement côté navigateur**, sans librairie tierce (interdit côté front) — lecture manuelle des en-têtes ZIP (central directory + en-têtes locaux) et inflate via `DecompressionStream('deflate-raw')` natif. Volontairement limité au sous-ensemble produit par notre propre `/api/export/zip` (pas de zip64, chiffrement ni data descriptor) — pas un lecteur ZIP générique.
- **Dropzone élargie** : `accept=".json,.csv,.zip"` + `multiple`, message mis à jour pour expliquer les 3 formats acceptés.
- ⚠️ Code de parsing binaire ZIP non exécuté/testé en conditions réelles dans cette session (pas d'environnement navigateur disponible ici) — à vérifier après déploiement, notamment sur le support de `DecompressionStream` (Chrome/Edge récents OK ; fallback explicite si absent).

## [3.69.0] - 2026-06-24

### Feat : import guidé (format, modèle, prévisualisation, mode)
- **Modale d'import** ([settings.js](static/js/views/settings.js)) : le bouton « Importer » n'ouvre plus directement le sélecteur de fichier natif — il ouvre une modale qui explique le format attendu (`.json`, mêmes clés que l'Export), propose un **modèle vide à télécharger** (`_emptyImportTemplate`) et accepte le fichier par clic ou **glisser-déposer** (`.import-dropzone`).
- **Prévisualisation avant import** : une fois le fichier choisi, affiche les catégories reconnues avec leur nombre d'éléments (réutilise le style `.export-choice-grid`), signale les clés non reconnues, et bloque l'import si le fichier est invalide ou vide de contenu reconnu.
- **Choix du mode** (Remplacer/Fusionner, pills `.board-modes`) : le mode `replace` n'est plus imposé silencieusement — `merge` est désormais accessible depuis l'UI (déjà supporté par `/api/import`, jusqu'ici seulement via API directe).
- **Calendriers** explicitement exclus de l'import (`IMPORT_CATEGORIES`) : exportés pour référence/backup mais `/api/import` ne sait pas les recréer — évite l'illusion d'un round-trip complet.

## [3.68.0] - 2026-06-24

### Style : section « Données » plus lisible
- **Stats** ([settings.js](static/js/views/settings.js), [settings.css](static/css/views/settings.css)) : la ligne de texte brute (« 1530 tickets, 2477 features... ») devient 4 tuiles compactes `.data-stat` (icône + chiffre + libellé).
- **Actions** : boutons Export/Import avec icônes (`.data-actions`), le bouton destructeur « Tout supprimer » poussé à droite pour le distinguer visuellement.
- **Démo** : carte dédiée `.data-demo-card` (dégradé teinté primary), avertissement « Remplace toutes les données existantes » sorti du texte noyé pour devenir un badge orange (réutilise `--warning`/`--warning-bg`/`--warning-border`).

## [3.67.0] - 2026-06-24

### Feat : export ZIP + compteurs, tout sélectionner, dernier choix mémorisé
- **Format ZIP** ([app/routers/data.py](app/routers/data.py), `POST /api/export/zip`) : zippe côté backend (module stdlib `zipfile`, aucune dépendance ajoutée) un fichier CSV par catégorie sélectionnée — règle le problème des téléchargements multiples en rafale du mode CSV à plat dès qu'on choisit ≥2 catégories. Nouvelle pill « ZIP » dans le sélecteur de format ([api.js](static/js/api.js) `exportZip`, [settings.js](static/js/views/settings.js)).
- **Compteurs sur les tuiles** ([utils.js](static/js/utils.js), `exportChoiceModal`) : chaque tuile affiche désormais le nombre d'éléments de la catégorie (badge, `_exportCategoryCounts()` dans settings.js) — on sait ce qu'on exporte avant de cliquer.
- **Tout sélectionner / désélectionner** (même modale) : raccourci au-dessus de la grille, utile vu les 13 catégories disponibles.
- **Dernier choix mémorisé** ([settings.js](static/js/views/settings.js), `sb-export-last`) : la sélection de catégories et le format utilisés la dernière fois sont pré-cochés à la prochaine ouverture de la modale.

## [3.66.0] - 2026-06-24

### Feat : choix du format à l'export + calendriers ICS exportables
- **Bouton renommé** ([settings.js](static/js/views/settings.js)) : « Exporter (JSON) » devient « Export » — le format n'est plus figé dans le libellé puisqu'il se choisit désormais dans la modale.
- **Choix du format** ([utils.js](static/js/utils.js), `exportChoiceModal`) : ajout d'un sélecteur JSON/CSV (pills `.board-modes`, réutilisées depuis Reports) au-dessus de la grille de catégories. En CSV, un fichier est généré **par catégorie** sélectionnée (`arrayToCsv`, nouveau helper générique — colonnes = union des clés, champs imbriqués sérialisés en JSON dans la cellule) ; en JSON, un seul fichier combiné comme avant.
- **Calendriers ICS exportables** ([app/routers/data.py](app/routers/data.py)) : `_EXPORT_SPEC` inclut désormais `calendars` (config ICS : nom, équipe, URL, dernière synchro). La tuile « Calendriers » n'apparaît dans la modale que s'il existe au moins un calendrier configuré.

## [3.65.0] - 2026-06-24

### Feat : bandeau agenda du jour pliable/dépliable
- **Reports** ([cal_banner.js](static/js/components/cal_banner.js)) : le bandeau du jour (réunions + absences) sous le header est désormais entièrement masqué sur `/#reports` (et plus seulement les absences) — redondant avec ses propres sections.
- **Plié/déplié** (même fichier + [calendar-banner.css](static/css/views/calendar-banner.css)) : nouveau bouton (chevron) sur le bandeau, préférence persistée (`sb-cal-banner-collapsed`). Déplié = vue actuelle (toute la journée). Plié = résumé compact : les 2 prochains créneaux à venir et les absents du jour, côte à côte (réutilise le layout `.cal-banner-split`/`.cal-banner-half`).
- Petit fix associé : les chips d'absences groupés par équipe (sans event précis) ouvraient par erreur la semaine en surlignant le premier event du jour — ils ouvrent désormais la semaine sans surlignage erroné.

## [3.64.0] - 2026-06-24

### Feat : export sélectif, bandeau absences allégé, sync ICS ciblée
- **Export à choix multiples** ([utils.js](static/js/utils.js), [settings.js](static/js/views/settings.js)) : le bouton « Exporter (JSON) » ouvre désormais une modale `exportChoiceModal` (gros boutons carrés, tout présélectionné, visuel « enfoncé » au clic — `.export-choice-*` dans [base.css](static/css/base.css)) pour choisir les catégories à inclure (tickets, features, membres, absences, Atlas, Sprint & PI...) avant de générer le fichier.
- **Bandeau agenda du jour** ([cal_banner.js](static/js/components/cal_banner.js)) :
  - Plus affiché sur `/#reports` : redondant avec les sections propres de la page (le bandeau s'abonne maintenant aussi à `store.on('view', ...)` pour se mettre à jour à la navigation).
  - Vue « Toutes équipes » avec beaucoup d'absences le même jour : au-delà de 5, les chips individuels (un par personne) sont remplacés par un **regroupement par équipe** (couleur d'équipe + nombre d'absents) pour ne plus casser le visuel.
- **Sync ICS ciblée** ([topbar.js](static/js/components/topbar.js), `syncCalendars(scope)` dans [cal_banner.js](static/js/components/cal_banner.js)) : le bouton 📅 de la topbar propose désormais, si une équipe est filtrée, un choix « Équipe sélectionnée seulement » vs « Tous les calendriers » avant de lancer la synchro (sync directe si aucune équipe n'est filtrée).

## [3.63.0] - 2026-06-24

### Fix : carte sprint actif (Dashboard) peu visible + favoris incomplets ("Mes tickets", onglets/filtres)
- **Carte sprint actif** ([support.css](static/css/views/support.css)) : en thème sombre, `--bg-alt` et `--surface` sont la **même couleur** → la carte de sprint (`.pi-sprint-card`) se confondait avec son `.card` parent, et la variante `--active` se confondait à son tour avec les cartes par défaut (seule la bordure différait). `.pi-sprint-card` passe à `var(--bg)` (distinct de `.card`) et `.pi-sprint-card--active` à une teinte `color-mix(..., var(--primary) 12%, ...)` pour bien ressortir.
- **Favoris** ([favorites.js](static/js/components/favorites.js)) : un favori ne capturait que `view`/`team`/`group`/`qfText` — le toggle « Mes tickets » et les sous-filtres encodés dans le hash (onglet PI/Roadmap, sprint sélectionné, layout, filtres backlog...) n'étaient pas restaurés, donc la page rechargée ne montrait pas le même contenu. Un favori capture désormais le **hash complet** (rejoué via `applyHash`, exposé sur `window.__squadBoard`) et l'état de `sb-my-tickets-on` (restauré via un nouveau `window.__squadBoard.setMyFilter`, [app.js](static/js/app.js)). Les anciens favoris sans `hash` restent compatibles (fallback view/team/group).

## [3.62.0] - 2026-06-24

### Feat : Planning Poker collaboratif en live (backend + polling)
- **Le poker était 100 % local (localStorage)** : chaque participant ne voyait que ses propres votes, aucune synchro entre machines. Désormais les votes sont **partagés via le backend** et rafraîchis en direct.
- **Backend** : nouveau modèle `PokerVote` ([app/models/agile.py](app/models/agile.py)), serializer `_poker_dict` ([app/serializers.py](app/serializers.py)), routeur ([app/routers/poker.py](app/routers/poker.py)) — `GET /api/poker/{ticket}`, `POST .../vote` (upsert par participant), `POST .../reveal`, `POST .../reset`, `DELETE .../voter/{voter}` (quitter). Enregistré dans [main.py](main.py). Données éphémères volontairement **hors de `/api/all`** (golden export inchangé). Table documentée dans [docs/regles-metier.md](docs/regles-metier.md).
- **Frontend** ([modal.js](static/js/components/modal.js), [api.js](static/js/api.js)) : remplacement du localStorage par les appels API + **polling ~3 s** dans la modale ouverte (nettoyé à la fermeture). Le polling ne ré-écrase pas la saisie en cours (nom / points). L'identité du participant (`sb-poker-myname`) reste locale ; on apparaît côté serveur au 1er vote. « Révéler », « Nouveau tour », « Enregistrer » et « Quitter » deviennent collectifs (propagés à tous). Le bouton « Partager » est enfin pleinement fonctionnel.

## [3.61.2] - 2026-06-24

### Fix : bouton « Partager » du poker copiait un lien sans le suffixe /poker
- Le lien de partage du Planning Poker ([modal.js](static/js/components/modal.js)) devait pointer vers la modale de ré-estimation (`.../ticket/<id>/poker`), mais lorsqu'on était **déjà** dans la modale poker (hash terminé par `/poker`), la logique retirait le suffixe sans le remettre → le lien copié n'ouvrait que le ticket, pas le vote. Normalisation simplifiée : on retire un `/poker` final éventuel puis on le rajoute systématiquement.

## [3.61.1] - 2026-06-24

### Fix : lien partagé alerte + ticket (ré-estimation poker) ne perdait plus l'alerte
- **Parsing du hash** ([app.js](static/js/app.js)) : un lien combinant alerte et ticket (ex. `/#health/Gabbiano/alert/scopeCreep/ticket/GDEM-4117`) perdait le segment `/alert/scopeCreep` et redirigeait vers `/#health/Gabbiano/ticket/GDEM-4117`. La regex d'extraction de l'alerte était ancrée en fin de chaîne (`$`) et échouait dès qu'un `/ticket/…` suivait. On extrait désormais le **ticket d'abord** (toujours en fin), puis l'alerte sur le reste → les deux modales s'ouvrent correctement.
- **Nettoyage du hash** ([alert_modal.js](static/js/components/alert_modal.js)) : `_clearAlertFromHash` retire maintenant le segment `/alert/<id>` même lorsqu'il est suivi d'un `/ticket/…`.
- **Seuil WIP** ([utils.js](static/js/utils.js)) : passé de 1,5 à **2 tickets par membre présent** (`WIP_PER_MEMBER`).

## [3.61.0] - 2026-06-24

### Métier : « WIP élevé » basé sur la capacité réelle de l'équipe (congés déduits)
- **Refonte de l'anomalie WIP** ([business_rules.js](static/js/business_rules.js)) : avant, l'alerte listait *tous* les tickets en cours (`inprog`/`review`/`test`) sans seuil — donc se déclenchait dès qu'il y avait du WIP, ce qui est normal. Désormais elle ne se déclenche que si le **WIP dépasse la capacité du jour de l'équipe**.
- **Capacité = membres présents** (roster dérivé de la table `absence`, **moins les personnes en congé aujourd'hui**). Nouveaux helpers `teamCapacity()` / `wipThreshold()` ([utils.js](static/js/utils.js)) — seuil = ~1,5 ticket par membre présent, plancher à 3. Calculé **par équipe** (signal d'agrégat `wipExceededTeams`), un ticket seul n'est jamais une anomalie.
- **Aligné aux 3 points d'entrée** : matrice/cartes Health ([health.js](static/js/views/health.js)), alerte proactive de l'info-panel ([infopanel.js](static/js/components/infopanel.js), remplace l'ancien ratio « >60 % en cours »), et modale d'action ([alert_modal.js](static/js/components/alert_modal.js)) — plus de divergence entre le compteur et la modale.
- **Légende capacité dans la modale WIP** : `<details>` dépliable listant, par équipe, le **WIP courant / seuil**, les **membres présents** et ceux **en congé** (chips barrés), avec surlignage des équipes en dépassement. Styles `.wip-cap-*` ([base.css](static/css/base.css)).

## [3.60.0] - 2026-06-24

### UI : header et nav mieux différenciés du contenu principal
- **Header (`.topbar`)** ([base.css](static/css/base.css)) : fond légèrement teinté (`primary` 4 % sur la surface) pour le distinguer du blanc pur des cartes, + **ombre portée dessous** (`box-shadow`) pour le faire flotter au-dessus du `main` au lieu d'un simple trait.
- **Nav (`.sidebar`)** : **ombre portée sur le bord droit** + fin liseré, pour la détacher visuellement du contenu principal (en plus de son fond sombre déjà contrasté). En mobile (sidebar en overlay), l'ombre renforce l'effet de superposition.

## [3.59.0] - 2026-06-24

### Refactor : badges type/statut centralisés + fix chevauchement vue Liste
- **Helpers partagés `typeBadge(type, opts)` et `statusBadge(ticket, opts)`** ([utils.js](static/js/utils.js)) : point d'entrée unique pour les badges de type et de statut (libellé correct via TYPE_LABELS/getStatusLabel, classes CSS homogènes, taille `2xs`/`sm`, `title`, attributs, échappement XSS). Modifier l'apparence se fait désormais à **un seul endroit** (CSS `.badge-*` dans base.css + ces helpers).
- **9 sites d'appel refactorisés** pour utiliser ces helpers : [sprint.js](static/js/views/sprint.js) (liste), [kanban.js](static/js/views/kanban.js), [pi.js](static/js/views/pi.js), [roadmap.js](static/js/views/roadmap.js), [card.js](static/js/components/card.js), [infopanel.js](static/js/components/infopanel.js), [modal.js](static/js/components/modal.js), [topbar.js](static/js/components/topbar.js), [alert_modal.js](static/js/components/alert_modal.js). Au passage, correction d'incohérences (tooltips info-panel et breakdown Kanban affichaient la **clé brute** `debt` au lieu du libellé `Dette`). Imports morts nettoyés. Exceptions laissées telles quelles : la palette de commandes (style `cmd-type` dédié) et le badge `badge-sm` de roadmap (sizing différent).
- **Fix chevauchement (vue Liste du board)** ([sprint.css](static/css/views/sprint.css)) : le badge de statut au libellé JIRA long (ex. « A livrer en Préprod ») débordait sur l'avatar de l'assigné. La colonne Statut tronque désormais en ellipsis (`minmax(0,140px)` + `text-overflow`), chaque cellule pouvant rétrécir sans déborder sur sa voisine.

## [3.58.0] - 2026-06-23

### UX : board Scrum — vue Liste avec avatars + mode d'affichage dans le hash
- **Vue Liste (≡)** ([sprint.js](static/js/views/sprint.js), [sprint.css](static/css/views/sprint.css)) : la colonne « Assigné » affiche désormais un **avatar à initiales** (pastille colorée, nom complet en `title`) au lieu du nom complet tronqué — cohérent avec les swimlanes et les cartes.
- **Mode d'affichage dans l'URL** : le mode du board (Colonnes / Swimlanes / Liste) est maintenant reflété dans le hash → lien partageable et restauré au rechargement. Format `#sprint/<team>/[<sprintPick>/]<mode>`, le mode par défaut « columns » étant omis (ex. `#sprint/Gabbiano/list`, `#sprint/all/swimlanes`). Les modes sont des mots réservés, distingués sans ambiguïté d'un nom de sprint. Si l'URL ne précise pas de mode, la préférence locale (localStorage) est conservée ([app.js](static/js/app.js)).

## [3.57.0] - 2026-06-23

### UI : info-panel — détail des cartes plus lisible + dépliage auto des statuts
- **Textes agrandis** dans le détail des cartes Sprint/Buffer/Features ([base.css](static/css/base.css)) : les tailles `9-10px` passent à `--fs-xs` (~11px), le nom du sprint à `--fs-sm` (~13px). Concernés : nom de sprint, dates, badge, objectif, en-têtes de groupe de statut, lignes de tickets (id, titre, points), caret et bouton « +N autres ». Plus confortable à lire.
- **Dépliage automatique des groupes de statut** ([infopanel.js](static/js/components/infopanel.js)) : quand on déplie la carte Sprint, tous ses groupes `<details>` (En cours, Revue, À faire, Terminé…) s'ouvrent d'un coup — plus besoin de cliquer chaque en-tête.

## [3.56.3] - 2026-06-23

### Fix UX : Rapports — changement de format ne fait plus sauter le scroll
- Passer d'un format à l'autre (Texte / Slack / Confluence) re-rendait toute la page : la hauteur du contenu changeant, le scroll « sautait » vers une autre section (ex. depuis Sprint vers Mood Meter) ([reports.js](static/js/views/reports.js)). Désormais la **section en cours de lecture est mémorisée avant le re-render et reposée en vue après** (scroll instantané, sans animation), et l'item de timeline correspondant reste actif. Clic sur le format déjà actif = sans effet. Le calcul de scroll partagé (`_scrollToSection`) compense toujours la barre de contrôles sticky.

## [3.56.2] - 2026-06-23

### Fix UX : timeline Rapports — scroll qui compense la barre de contrôles sticky
- Cliquer sur un item de la timeline alignait le haut de la section sous la barre `.report-controls` sticky, qui la recouvrait ([reports.js](static/js/views/reports.js)). Le scroll est désormais **manuel et calcule la hauteur réelle de `.report-controls`** (`offsetHeight` + petite marge), de sorte que le titre de la section reste visible juste sous la barre. Fallback CSS `scroll-margin-top` ajusté à 72px.

## [3.56.1] - 2026-06-23

### UX : page Rapports — « Métriques sprint » intégré à la timeline
- Le bloc graphiques/KPI en tête de page (« Métriques sprint ») devient une **vraie section** dans la colonne, avec son ancre `#report-sec-metriques`, et **figure désormais en première entrée de la timeline** ([reports.js](static/js/views/reports.js), [reports.css](static/css/views/reports.css)). La timeline couvre ainsi toute la page et est visible dès l'arrivée, sans scroller.
- Le `<details>` repliable des métriques est stylé comme les autres sections (en-tête, chevron rotatif, fond différencié). Clic sur l'item « Métriques sprint » dans la timeline → déplie la section si besoin et y défile ; les graphiques sont **rendus à la volée au premier dépliage** (helper idempotent `_renderCharts`), y compris si la section était repliée au chargement.

## [3.56.0] - 2026-06-23

### UX : page Rapports — timeline / sommaire latéral de navigation
- **Sommaire latéral sticky** ([reports.js](static/js/views/reports.js), [reports.css](static/css/views/reports.css)) : la page Rapports étant longue, une timeline verticale à gauche liste toutes les sections (Sprint, Kanban/Flow, Support, Roadmap/PI, Epic Burndown, Mood/ROTI, Vote de confiance, Calendrier, Équipes, PI Planning, Rapport complet) avec leur icône.
- **Clic → défilement** vers la section (smooth, respecte `prefers-reduced-motion`) ; si la section était repliée, elle se déplie automatiquement.
- **Surbrillance auto** de l'item courant au défilement (IntersectionObserver) : point plein + libellé coloré pour repérer où on se trouve. Sections urgentes (vote PI à J-0/J-1) signalées par un point rouge.
- Chaque section reçoit une ancre `id` + `scroll-margin-top` pour ne pas passer sous la barre de contrôles sticky. **Responsive** : la timeline est masquée < 1100px (la page reprend toute la largeur).

## [3.55.0] - 2026-06-23

### Sondage Slack — enrichissement des thèmes, bouton « Autre thème », copie homogène
- **+8 thèmes de Mood Meter** ([sondage.js](static/js/components/sondage.js)) : café, randonnée, sortie en mer, quête héroïque, saison, pizza, mission spatiale… (9 → 17 thèmes) pour ne plus revoir les mêmes sondages d'un PI à l'autre. Emojis Slack correspondants ajoutés à `SLACK_EMOJI`.
- **Bouton « 🎲 Autre thème »** (vue Mood / ROTI) : tire un autre thème de sondage à la volée, met à jour le message brut **et** l'aperçu Slack sans recharger la vue. `buildMoodSlackRaw` accepte désormais un index de thème explicite ; helpers `moodThemeIndex` / `SONDAGE_THEME_COUNT` exposés.
- **Texte explicatif bref** au-dessus de chaque message Slack (`SONDAGE_INTRO`) : rappelle à quoi sert le sondage (Mood : humeur de fin de sprint ; Fist : vote de confiance PI).
- **Copie Slack homogénéisée** : nouveau helper partagé `wireSlackCopy(btn, getText, label)` ([sondage.js](static/js/components/sondage.js)) basé sur le util `copyToClipboard` (fallback presse-papier + toast). Remplace les 3 implémentations dupliquées de `navigator.clipboard.writeText` + bascule « ✓ Copié ! » dans [reports.js](static/js/views/reports.js) (Mood + Fist) et [pi.js](static/js/views/pi.js) (sondage de vote).
- Styles `.sondage-intro` / `.sondage-col-actions` ([reports-epic.css](static/css/views/reports-epic.css)).

## [3.54.0] - 2026-06-23

### UI : info-panel — cartes Sprint/Buffer plus soignées, statuts pliables, alertes remontées
- **Buffer** : emoji 🛡️ ajouté au titre (cohérent avec l'iconographie du site) + léger dégradé violet de fond ([infopanel.js](static/js/components/infopanel.js), [base.css](static/css/base.css)).
- **Sprint** : emoji 🎯 au titre + **zone de détail « enfoncée »** (fond teinté, bordure, ombre interne) pour bien différencier l'intérieur du contenu de la carte ; ombre plus marquée à l'ouverture/au survol.
- **Groupes de statut (détail Sprint)** : convertis en `<details>` **pliables, repliés par défaut** — seuls « En cours » et « Bloqué » restent ouverts (travail actif + risques visibles). Caret animé, en-tête cliquable. Le clic sur un groupe ou une ligne de ticket ne déclenche plus le pli/dépli de la carte parente (`summary` exclu du handler + `stopPropagation` sur les lignes).
- **Alertes remontées au-dessus de la carte « Statuts »** : les alertes proactives s'affichent désormais avant le récapitulatif des statuts (priorité visuelle).
- **Détail des cartes dépliables** : `max-height` porté à `70vh` avec **scroll interne** si le contenu déborde (au lieu de tronquer), pour toutes les cartes (Sprint, Buffer, Features).

## [3.53.0] - 2026-06-23

### Fix UX : mini-heatmap capacité PI + carte Features sans troncature
- **Mini-heatmap capacité (vue PI)** ([pi.js](static/js/views/pi.js)) : cliquer sur une pastille d'équipe **forçait l'onglet « Capacité »** (`/#pi/<team>/capacity`), éjectant l'utilisateur de l'onglet courant (ex. Mood / ROTI). Désormais le clic **filtre seulement l'équipe** et **reste sur l'onglet courant** (`store.set('team')` re-rend la vue, le tab est préservé). **Toggle** : re-cliquer sur l'équipe déjà active revient à « toutes les équipes ». La pastille active est mise en valeur au rendu (`pi-cap-dot--active`), et le tooltip indique l'action (« Cliquer pour filtrer sur cette équipe »).
- **Carte « Features » (info-panel)** ([infopanel.js](static/js/components/infopanel.js)) : suppression du bouton « +N autres » — **toutes les features sont affichées directement** dans chaque groupe de statut. Le détail de la carte autorise désormais un **scroll interne** (`max-height: 70vh`) plutôt que de tronquer ([base.css](static/css/base.css)).

## [3.52.2] - 2026-06-23

### Fix UX : info-panel — scroll auto à l'ouverture d'une carte dépliable
- **Carte dépliée amenée en vue** ([infopanel.js](static/js/components/infopanel.js)) : déplier une carte (Sprint / Buffer / Features) en bas de l'aside ouvrait le détail hors écran — on ne voyait pas qu'il s'était passé quelque chose. Au clic, après la transition CSS (~320 ms), la carte est désormais ramenée dans la zone visible via `scrollIntoView({ block: 'nearest' })` (uniquement à l'ouverture, pas au repli). Respecte `prefers-reduced-motion` (scroll instantané si l'utilisateur le demande).

## [3.52.1] - 2026-06-23

### UX : info-panel — carte Features filtrée par PI + état vide explicite
- **Filtrage des features par PI courant** ([infopanel.js](static/js/components/infopanel.js)) : la carte Features ne mélangeait que par équipe et ramenait des features d'autres PI. Elle filtre désormais aussi sur le **PI en cours** (`getCurrentPi`), avec la **même logique de matching que la vue PI** (`piSprint` / `sprintName` / `labels` → `PI#XX`, `PIXX`, `XX.Y`).
- **Carte « vide » explicite** quand aucune feature pour l'équipe + le PI sélectionnés : icône 📦 + « Aucune feature pour `<équipe>` · `PI #XX` » (au lieu de masquer la carte). Styles `.panel-card-empty` / `.panel-empty-state` / `.panel-empty-icon` / `.panel-empty-text` ([base.css](static/css/base.css)).
- **Refactor sûr** : extraction du helper partagé `_miniRow(item, statusColor, jiraUrl)` (ligne d'item cliquable des détails de carte), désormais réutilisé par les cartes **Sprint** et **Features** (suppression d'une duplication, fichier repassé sous la limite de 800 lignes).

## [3.52.0] - 2026-06-23

### UX : info-panel — suppression du doublon d'alertes & carte Features enrichie
- **Suppression de l'`alert-bar`** en tête de la vue Sprint ([sprint.js](static/js/views/sprint.js)) : elle dupliquait exactement la carte **Alertes** de l'info-panel (mêmes textes, même action `scopeCreep`). L'info-panel reste la **source unique** des alertes (toujours alimenté par `getSprintAlerts`, conservé en interne). Nettoyage du handler, de la variable `alerts`, des imports `getSprintAlerts`/`openAlertModal` désormais inutilisés et des styles morts `.alert-bar`/`.alert-item*` ([base.css](static/css/base.css)).
- **Carte « Features » repensée** ([infopanel.js](static/js/components/infopanel.js)) — elle était un cul-de-sac (juste `23/30` + barre). Désormais **cliquable/dépliable** comme les cartes Sprint et Buffer :
  - **Sous-ligne** : `% terminées` + points (`done/total pts`).
  - **Mini-barre de répartition** par statut (bloquée / en cours / à faire / terminée) pour scanner l'état d'un coup d'œil + **légende** chiffrée.
  - **Détail dépliable** : features groupées par statut (attention d'abord, terminé en dernier), lignes cliquables ouvrant la modal du ticket, lien JIRA, et bouton « +N autres ». Réutilise les classes existantes (`panel-buf-row`, `panel-sprint-group`, `panel-card-detail`) → wiring clic déjà en place.
  - Nouveaux styles `.panel-feat-distrib` / `.panel-feat-seg` / `.panel-feat-legend` ([base.css](static/css/base.css)).

## [3.51.0] - 2026-06-23

### UX : modal « Nouveau ticket » — pickers autocomplete réutilisés depuis l'édition
- **Fin des `<select>` natifs** dans la création. Les champs **Équipe**, **Leader**, **Epic**, **Contributors** et **Labels** réutilisent désormais les **mêmes pickers que la modal d'édition** (avatars colorés, autocomplete, pastilles de couleur d'équipe), au lieu de menus déroulants hétérogènes.
  - **Équipe** → `_makeChipPicker` avec pastille de couleur (`teamObjects`, fallback sur `teams` si vide).
  - **Leader** → `_makePersonPicker` (avatars + initiales), **filtré par l'équipe** sélectionnée ; réinitialisé si le leader courant n'appartient plus à la nouvelle équipe.
  - **Epic** → `_makeEpicPicker` (récents + tri alpha, recherche par clé/titre, mémorisation des récents).
  - **Contributors** → `_makePersonPicker` enchaîné (saisie successive), exclut le leader et les contributeurs déjà choisis.
  - **Labels** → `_makeLabelPicker` (suggestions issues du store + création libre).
- **Nouveau helper réutilisable** `_wireFormPicker(trigger, hidden, makePicker, renderDisplay, onChange)` ([modal.js](static/js/components/modal.js)) : ouvre un picker inline dans un champ de formulaire **sans sauvegarde API** (valeur tenue dans un `input[hidden]` jusqu'au submit), avec fermeture au clic extérieur et activation clavier (Entrée/Espace).
- **Submit** lit désormais les contributeurs et labels depuis les chips du DOM (`getContribs()` / `getLabels()`), le reste via les `input[hidden]`. Contrat de création inchangé (mêmes clés envoyées à l'API).
- **Styles** ([forms.css](static/css/views/forms.css)) : `.form-picker-trigger` (zone cliquable affichant la valeur, anneau de focus cohérent), `.form-picker-dot` (pastille couleur d'équipe), `.contrib-inline-wrap` / `.labels-inline-wrap` (chips + picker enchaîné).

## [3.50.1] - 2026-06-23

### UI : modals create/edit — chips plus lisibles & sections compactes
- **Espacement resserré** des formulaires de ticket ([forms.css](static/css/views/forms.css)) : `.edit-section` passe d'un encadré épais (`padding: sp-4`, `margin: sp-3`) à un bloc compact (`padding: sp-2/sp-3`, `margin: sp-2`) pour gagner de la hauteur sans perdre la séparation visuelle. Les titres de section restent bien identifiables grâce à un **petit trait d'accent** (`.edit-section-title::before`) et une couleur passée de `--text-muted` à `--text-secondary`. `form-actions` resserré (`sp-4` → `sp-3`).
- **État actif des chips plus franc** — `.chip-sel.is-active` gagne `font-weight: semibold` + une ombre légère ; ajout d'un `:focus-visible` accessible (anneau `--primary`). Inspiré des sélecteurs segmentés type onboarding mobile, en gardant la densité pro de Squad Board.
- **Select picker (Équipe / Leader / Epic) harmonisé** — pleine largeur dans la grille, même anneau de focus que les chips (`.edit-section .select`), tout en restant un `<select>` natif (cascade Équipe→Leader inchangée).
- **Accessibilité** — `_chipSelGroup()` ([modal.js](static/js/components/modal.js)) expose désormais `role="radiogroup"`/`radio` (choix unique) ou `group`/`checkbox` (labels multi), avec `aria-checked` maintenu à jour au clic dans `_wireChipGroup()` et sur les labels custom ajoutés à la volée.

## [3.50.0] - 2026-06-23

### Feat : Cycle Time & Lead Time — analyse enrichie en vue zoom (BACKLOG #31)
- **Légende explicative repliable** — la légende « Comment lire ce graphique » de la popin de zoom est désormais un `<details>` natif pliable/dépliable (déplié par défaut, état conservé d'un graphique à l'autre) pour libérer de la place. Styles `.chart-zoom-explain-summary` / `-caret` / `-body`.
- **Barre d'outils contextuelle en zoom** — [chart_zoom.js](static/js/components/chart_zoom.js) : nouveau mécanisme générique où un graphique déclare ses contrôles (`getChartControls` / `_setControls`), rendus en barre d'outils dans la popin (toggle de mode, tri, chips de filtre). `rerenderChart(sourceId, targetId, overrideOpts)` fusionne l'état des contrôles dans les options du graphique. Styles `.chart-zoom-toolbar` / `.chart-zoom-seg` / `.chart-zoom-chip` dans [chart-zoom.css](static/css/views/chart-zoom.css).
- **[charts.js](static/js/components/charts.js) `renderCycleTime`** (contrôles actifs uniquement en zoom, carte compacte inchangée) :
  - **a) Vue « Nuage de points » (scatter temporel)** — X = date de résolution, Y = cycle time, couleur = percentile CT. Bandes de percentile (vert/orange/rouge) en fond + lignes CT méd./P85. Axe X linéaire formaté maison (pas d'adaptateur de date Chart.js requis, absent du bundle). Toggle **Barres / Nuage**.
  - **b) Ligne de tendance** — moyenne mobile sur N tickets (N auto entre 3 et 7) sur le nuage, pour visualiser la dérive du flux.
  - **c) Filtres rapides** type / lead (chips, « Tous » pour réinitialiser). Pas de filtre « équipe » : la liste arrive déjà filtrée par l'équipe/groupe de la sidebar, un doublon serait trompeur.
  - **d) Tri configurable** (mode barres) : date, cycle time ↓, attente ↓, lead time ↓.
  - **e) Outliers** : tickets dont le lead time dépasse le P85 marqués ⚠ + bordure appuyée, avec entrée dédiée dans la légende.
  - **f) Part d'attente** : le footer du tooltip indique « Attente : X % du lead time » (temps en backlog avant démarrage).

## [3.49.0] - 2026-06-23

### Feat : graphiques — vue zoom enrichie & lisibilité (BACKLOG #30)
- **a) Plus de tickets en vue agrandie** — [charts.js](static/js/components/charts.js) : `renderCycleTime` et `renderWIPAge` acceptent un `opts.limit` et, dans le canvas de zoom (préfixe `zoom-`), affichent jusqu'à **40 barres** au lieu de 15 (helpers `_displayLimit` / `_isZoom`). La vue agrandie devient réellement plus informative.
- **b) États vides non destructeurs** — ces deux graphiques écrasaient `canvas.parentElement.innerHTML` (ce qui supprimait le canvas **et** le bouton de zoom). Nouveau helper `_emptyOverlay()` : message d'état vide (icône + texte centré) **par-dessus** le canvas, sans casser le conteneur ni le bouton zoom ; nettoyé au rendu suivant via `_clearEmptyOverlay()`. Styles `.chart-empty-overlay` dans [base.css](static/css/base.css).
- **c) Export PNG depuis la popin zoom** — [chart_zoom.js](static/js/components/chart_zoom.js) : bouton **⬇ Exporter en PNG** dans l'en-tête de la popin. Le canvas (transparent) est aplati sur un fond `--surface` pour un rendu lisible hors de l'app, nommé `squad-board-<graphique>-<date>.png`. Styles `.chart-zoom-export` dans [chart-zoom.css](static/css/views/chart-zoom.css).

## [3.48.0] - 2026-06-23

### Feat : zoom plein écran des graphiques (popin + légende explicative)
- **Nouveau composant [chart_zoom.js](static/js/components/chart_zoom.js)** + styles [chart-zoom.css](static/css/views/chart-zoom.css) : un bouton **« agrandir »** (icône, révélé au survol) est injecté automatiquement dans chaque `.chart-container` de l'application. Au clic, une **popin alignée en haut de l'écran** s'ouvre (fondu + léger zoom) et redessine le graphique en grand.
- **Navigation précédent/suivant** entre tous les graphiques zoomables de la page (flèches ←/→ ou boutons), **sans animation de transition** (changement instantané, conformément à la demande). `Échap` ferme.
- **Légende enrichie** par type de graphique : pour chaque graphique, deux lignes « 👁 Lecture » (comment lire) et « 💡 Interprétation » (signal d'alerte / interprétation métier) — Burndown, Burnup, CFD, Throughput, Cycle Time, WIP Age, Vélocité (sprint & PI), Statuts, Types et Burnup PI.
- **Mécanique** : [charts.js](static/js/components/charts.js) tient désormais un **registre** (`getChartMeta` / `rerenderChart` / `registerExternalChart`) — chaque `render*()` s'enregistre avec ses arguments, ce qui permet de re-rendre le même graphique dans le canvas agrandi. Le burnup PI ([pi.js](static/js/views/pi.js)) s'enregistre via `registerExternalChart`. Initialisé dans [app.js](static/js/app.js) (`initChartZoom`), décoration auto via `MutationObserver` sur `#content`.
- Accessible (ARIA, focus visible), responsive (plein écran < 640px, bouton toujours visible en tactile) et respecte `prefers-reduced-motion`.

## [3.47.0] - 2026-06-22

### Feat : snapshot de commitment PI (baseline engagé vs livré) (BACKLOG #12)
- **Backend** : nouvelle colonne `pi_baselines` (JSON par numéro de PI) sur `PIConfig` ([app/models/planning.py](app/models/planning.py)), migration ([app/migrations.py](app/migrations.py)), clé `piBaselines` au contrat ([app/serializers.py](app/serializers.py)), endpoint `PUT /api/pi/baseline/{pi_number}` (fusion, n'écrase pas les autres PI) et round-trip export/import ([app/routers/planning.py](app/routers/planning.py), [app/routers/data.py](app/routers/data.py)).
- **Frontend** : helper `computeCommitment(baseline, liveFeatures)` ([utils.js](static/js/utils.js)) + helper API `setPiBaseline` ([api.js](static/js/api.js)). Dans **PI Planning › Objectifs** : bouton **📌 Figer la baseline** (capture manuelle, disponible sur le PI courant en vue « toutes équipes » → baseline au niveau PI) et panneau **Engagement** : barre engagé/livré, chips « +N ajoutés » (scope creep) / « −N retirés », ratio **Say/Do**, date de capture. Comparaison filtrable par équipe à l'affichage. Styles [pi-planning.css](static/css/views/pi-planning.css).
- Permet de mesurer engagé vs livré vs périmètre ajouté en cours de PI — auparavant tout était recalculé sur l'état courant (glissement de périmètre invisible).

## [3.46.0] - 2026-06-22

### Feat : Roadmap repositionnée en vue multi-PI (BACKLOG #27)
- **Timeline multi-PI** en tête de la Roadmap ([roadmap.js](static/js/views/roadmap.js), [roadmap.css](static/css/views/roadmap.css)) : survol horizontal PI-2 → PI+2 (centre = PI courant réel), une colonne par PI listant ses features (triées par rang JIRA, badge de statut, liseré couleur de l'équipe, compteur « N feat. · M ✓ »). Clic sur un en-tête de PI → sélectionne ce PI (`piOffset`) et le détail mono-PI sous la timeline s'actualise ; clic sur une carte → ouvre la feature. Clarifie le rôle de la Roadmap (vision long terme) face à PI Planning (mono-PI).

## [3.45.0] - 2026-06-22

### Feat : dépendances inter-équipes + graphe mutualisé (BACKLOG #14/#29)
- **Composant partagé [dep_graph.js](static/js/components/dep_graph.js)** : extraction des dépendances à partir des **liens JIRA réels** (`links` : « bloque / est bloqué par / dépend de ») au lieu du champ `dependencies` qui n'était jamais peuplé. Fournit `extractDependencyEdges`, `renderItemDepGraph` (graphe SVG, colonnes par équipe, arêtes inter-équipes en rouge), `computeTeamDependencies` et `renderTeamDepBoard`.
- **#29 — Graphe Roadmap réparé & mutualisé** : suppression de `_renderDepGraph` (mort) dans [roadmap.js](static/js/views/roadmap.js) ; le graphe et le badge « ⇒ N » par feature s'appuient désormais sur les vrais liens.
- **#14 — Programme board inter-équipes** : nouvel onglet **🔗 Dépendances** dans PI Planning ([pi.js](static/js/views/pi.js)) — matrice équipe→équipe (dépendances inter-équipes en rouge, internes grisées), compteur de dépendances inter-équipes dans le libellé de l'onglet, et détail des liens au clic sur une cellule. Le périmètre couvre le PI **toutes équipes** pour ne pas masquer un bout de lien. Styles dans [pi-planning.css](static/css/views/pi-planning.css).

## [3.44.0] - 2026-06-22

### UX navigation : raccourcis nettoyés + drag découvrable (BACKLOG #15/#16)
- **#15 — Raccourcis clavier en chiffres uniquement** : les vues Pilotage prennent `1`-`8` (ordre du menu), le groupe « Équipe & RH » n'a plus de raccourci nu ([config.js](static/js/config.js)). Fini les lettres `B H S A G` qui déclenchaient une navigation en tapant du texte hors champ. Le garde clavier ([sidebar.js](static/js/components/sidebar.js)) ignore désormais les raccourcis vides, gère les zones `contentEditable`, et **cède les chiffres à la vue PI Planning** (qui possède ses propres raccourcis d'onglets `1`-`9`) — résolution d'un conflit où presser un chiffre sur PI déclenchait à la fois un changement d'onglet et une navigation.
- **#16 — Glisser-déposer de la sidebar découvrable** : poignée `⠿` révélée au survol des items du groupe Pilotage (+ `title` explicatif), le badge de raccourci s'efface au survol ([base.css](static/css/base.css)).
- **#17 — Topbar** : investigué et différé — le sélecteur PI est justifié sur toutes les vues où il s'affiche (toutes consomment `piOffset`) ; un désencombrement visuel demandera une passe UI dédiée.

## [3.43.0] - 2026-06-22

### Refactor + UX : indicateurs de flux canoniques & regroupement sidebar (BACKLOG #24/#26)
- **#24 — Bloqués / WIP / Throughput unifiés** : helpers `countBlocked()`, `countWip()`, `throughputSince()` et constante `WIP_STATUSES` ([config.js](static/js/config.js), [utils.js](static/js/utils.js)), adoptés par Dashboard, [sprint.js](static/js/views/sprint.js) et [kanban.js](static/js/views/kanban.js). **Correction** : le « Throughput » du Kanban affichait le **total des tickets terminés** (placeholder `// simplified`) et non un débit ; il calcule désormais le **débit sur 7 jours** (même définition que le Dashboard, libellé « Throughput 7j »).
- **#26 — Sidebar regroupée en 2 sections** : champ `section` (`main`/`team`) sur `NAV_ITEMS` ([config.js](static/js/config.js)). Groupe **Pilotage** (Dashboard, Board, Backlog, PI Planning, Roadmap, Santé, Rapports, Paramètres) toujours visible et réordonnable par glisser ; groupe **Équipe & RH** (Amélioration, Support, Atlas, Agenda) repliable, **replié par défaut** pour désencombrer, avec auto-déploiement quand la vue active en fait partie et état persisté (`sb-nav-team-collapsed`). Drag-and-drop désormais limité au groupe Pilotage ([sidebar.js](static/js/components/sidebar.js)) ; nouveaux styles dans [base.css](static/css/base.css).

## [3.42.0] - 2026-06-22

### Refactor : sources de calcul uniques — objectifs PI & buffer/vélocité (BACKLOG #23/#25)
- **#23 — Résolution des objectifs PI centralisée** : `resolvePiObjectives()` ([utils.js](static/js/utils.js)) — la sélection « jeu vivant courant vs snapshot pi_objectives » était dupliquée entre [dashboard.js](static/js/views/dashboard.js) et [pi.js](static/js/views/pi.js) avec un commentaire « doit rester cohérent » signalant le risque. Désormais une seule source. Le `_ticketPiNum` local du Dashboard passe aussi par `extractPiNum`.
- **#25 — Détection buffer & ventilation vélocité unifiées** : `isBufferItem(item)` + `computeVelocityBreakdown(tickets)` ([utils.js](static/js/utils.js)). **Correction de divergence** : Roadmap, PI, Dashboard, Reports et Infopanel détectaient le buffer par sous-chaîne `/buffer/i` tandis que Santé utilisait le match exact `/^buffer$/i` — d'où des totaux buffer/vélocité potentiellement différents d'une vue à l'autre. Tout converge sur la **sémantique stricte** (label exactement « buffer », insensible à la casse), adoptée aussi par [sprint.js](static/js/views/sprint.js), [reports.js](static/js/views/reports.js), [health.js](static/js/views/health.js), [infopanel.js](static/js/components/infopanel.js) et [sprint_tickets_modal.js](static/js/components/sprint_tickets_modal.js).
  - ⚠️ **Impact visible** : un libellé comme `buffer-sprint` ou `mybuffer` n'est plus comptabilisé comme buffer dans la Roadmap/PI/Dashboard/Reports (alignement sur le comportement déjà en vigueur dans Santé).

## [3.41.0] - 2026-06-22

### Refactor : mutualisation Board (graphiques + activité récente) (BACKLOG #21/#22)
- **#21 — Graphiques Board partagés** : nouveau composant [board_charts.js](static/js/components/board_charts.js) (`renderBoardChartsSection` + `mountBoardCharts`) — le bloc Burndown / Burnup / CFD / Throughput / Cycle Time / WIP Age était dupliqué à l'identique dans [sprint.js](static/js/views/sprint.js) et [kanban.js](static/js/views/kanban.js) (deux modes du même écran Board). IDs de canvas unifiés en `board-chart-*`. Les pastilles de la légende WIP Age passent de styles inline à des classes CSS `.wip-age-swatch--ok/warn/crit` ([support.css](static/css/views/support.css)).
- **#22 — Carte « Activité récente » mutualisée** : ajout de `renderActivityCard()` à [activity.js](static/js/components/activity.js) (déjà composant partagé) pour factoriser le shell `<details>` + câblage répété dans Dashboard, Sprint et Kanban. Sprint/Kanban passent d'un rendu différé (div vide rempli après coup) au rendu inline, cohérent avec le Dashboard.

## [3.40.0] - 2026-06-22

### Feat : agenda — badge de fraîcheur ICS, bandeau global, helpers mutualisés (BACKLOG #18/#19/#20)
- **#18 — Badge de fraîcheur ICS dans la topbar** ([index.html](static/index.html), [topbar.js](static/js/components/topbar.js)) : nouveau bouton `#btn-cal-sync` à côté du Sync JIRA. Les calendriers ICS n'ayant pas d'auto-refresh, une pastille d'avertissement s'allume quand la dernière synchro dépasse 6 h ; un clic relance la synchro des calendriers pertinents via `syncCalendars()` (nouvel export headless de [cal_banner.js](static/js/components/cal_banner.js)). Styles dans [calendar-banner.css](static/css/views/calendar-banner.css).
- **#19 — Bandeau agenda du jour global** : `#global-cal-banner` monté sous le header ([index.html](static/index.html)) et rendu une seule fois dans [app.js](static/js/app.js) — il survit aux re-renders de vue et se rafraîchit via ses abonnements store. Il est désormais visible sur **toutes** les vues (vide si aucun calendrier ICS), plus seulement sur le Board. Montages par-vue retirés de [sprint.js](static/js/views/sprint.js) et [kanban.js](static/js/views/kanban.js).
- **#20 — Helpers calendrier mutualisés** : `relevantCalendars()` et `lastCalendarSync()` ajoutés à [utils.js](static/js/utils.js), remplaçant la logique « dernière synchro des calendriers pertinents » dupliquée dans la modale semaine, le bandeau, [infopanel.js](static/js/components/infopanel.js) et le badge topbar.

## [3.39.0] - 2026-06-22

### Refactor : matching PI Roadmap centralisé + nettoyage logs (BACKLOG #28)
- **[roadmap.js](static/js/views/roadmap.js)** : suppression de la regex PI réimplémentée localement (`_extractPiNum`, `_matchPi`, `_normPi`) — source de bugs historiques signalée dans le CLAUDE.md du site. Le PI courant vient désormais de `getCurrentPi({ sprintInfo, piInfo })` et le matching de `extractPiNum(raw) === currentPiNum` ([utils.js](static/js/utils.js), source unique). Effet de bord positif : un `sprintName` complet type `Fuego - Ite 30.3` est maintenant correctement rattaché au PI 30 (l'ancienne regex ancrée ne matchait que `30.1` nu).
- **Logs de debug retirés** : `console.log` de diagnostic à chaque render de la Roadmap et `console.debug` du bandeau calendrier ([cal_banner.js](static/js/components/cal_banner.js)).

## [3.38.1] - 2026-06-22

### Docs : README remis à jour (vues, raccourcis, PI Planning)
- **Table des vues** ([README.md](README.md)) alignée sur la réalité : 12 entrées de navigation (Dashboard, Board unifié Scrum/Kanban, Backlog, PI Planning, Roadmap, Santé, Amélioration, Support, Atlas, Agenda, Rapports, Paramètres) au lieu de 6 — le README listait encore Sprint/Kanban séparés et des raccourcis `1→6` obsolètes.
- **Raccourcis clavier** corrigés pour correspondre à [config.js](static/js/config.js) (`1 2 4 6 7 8 9` + `B H S A G`), mention de la sidebar réordonnable et des URLs partageables.
- **Nouvelle section « PI Planning — préparation & suivi »** : 10 onglets, sélecteur PI `PI-2…PI+2`, capacité/absences, prédictibilité, conventions de matching PI.
- **[BACKLOG.md](BACKLOG.md)** : section « AUDIT 2026-06-22 » (#12→#29) — pistes validées sur PI Planning (snapshot commitment, tendance confiance, dépendances inter-équipes), navigation (raccourcis chiffres-only, sidebar), agenda (badge fraîcheur ICS, dédup), redondances (graphiques Board, activité récente, sources uniques) et roadmap (repositionnement multi-PI).

## [3.38.0] - 2026-06-17

### Design : accents en bordure haute + Dashboard réordonné + polish
- **Accents de cards en `border-top`** au lieu de `border-left`/`::before` latéral (jugé chargé quand beaucoup de cards) : `.sprint-header` ([sprint.css](squad-board/static/css/views/sprint.css)), `.metric-card` + variantes `mc-*`, `.pi-obj-attain`, `.team-card` ([dashboard.css](squad-board/static/css/views/dashboard.css)), `.kanban-metric-*` ([base.css](squad-board/static/css/base.css)). Barres d'accent passées en gradient horizontal de 3 px en haut.
- **Dashboard réordonné** ([dashboard.js](squad-board/static/js/views/dashboard.js)) : l'en-tête sprint/PI (`sprint-header`) est désormais **en premier**, suivi des métriques et des indicateurs secondaires.
- **Barre d'atteinte PI plus lisible à 0 %** ([dashboard.css](squad-board/static/css/views/dashboard.css)) : la piste reçoit une bordure + un fond légèrement rayé (fini le « blanc sur blanc » quand vide), et l'échelle 0 / 80 % cible / 100 % gagne des repères verticaux et un meilleur contraste.
- **Liste « bloqués / stagnants » colorée** : pastilles de statut pour tous les états (bloqué, en cours, revue, test, à faire), âge affiché en pastille teintée selon la criticité (jaune ≥ seuil, rouge ≥ 14 j), id en couleur primaire.

## [3.37.0] - 2026-06-17

### Fix : liste « bloqués / stagnants » toujours vide après une sync
- **Symptôme** : aucun ticket n'apparaissait dans la card Dashboard alors que certains stagnaient (ex. GDEM-4057, 5 j « En cours de développement »).
- **Cause** : l'ancienneté était calculée depuis `updatedAt`, qui est l'**horodatage d'écriture en base** (= heure de la dernière sync), et non la dernière activité JIRA → il vaut ~0 j pour tous les tickets juste après une synchro, donc rien ne dépassait le seuil.
- **Correctif** ([dashboard.js](squad-board/static/js/views/dashboard.js)) : « sans mouvement » est désormais mesuré depuis le **dernier mouvement de statut** — `max(startedDate, dernier changement de statut du changelog)`. La colonne « état » affiche le **statut JIRA réel** (ex. « En cours de développement »). Vérifié : périmètre Gabbiano passe de 0 à 3 tickets, GDEM-4057 en tête (5 j).
- **Page de diagnostic** : [tests/stuck-tickets-debug.html](squad-board/static/tests/stuck-tickets-debug.html) — inspecte un ticket (dates + ancienneté retenue, changelog), compare ancienne vs nouvelle logique, et liste le résultat par équipe/seuil.

## [3.36.0] - 2026-06-17

### Feat : seuil de stagnation éditable (Dashboard)
- **Champ discret inline** dans la card « Tickets bloqués ou stagnants » ([dashboard.js](squad-board/static/js/views/dashboard.js)) : le nombre de jours de « sans mouvement depuis ≥ N j » est désormais éditable directement dans le sous-titre. Valeur persistée en localStorage (`sb-dash-stale-days`, défaut 5, bornée 1–365) et liste re-filtrée à la volée.
- **Style** ([dashboard.css](squad-board/static/css/views/dashboard.css)) : `.inline-num-edit` — input numérique minimaliste (soulignement pointillé, spinners masqués) réutilisable pour d'autres éditions rapides inline.

## [3.35.0] - 2026-06-17

### Fix : suppression d'un objectif PI non persistée
- **Symptôme** : supprimer un objectif via la corbeille le retirait de l'écran, mais il **réapparaissait au rafraîchissement** (la suppression n'était enregistrée qu'au clic ultérieur sur « Enregistrer »).
- **Cause** : le bouton `.pi-obj-del` faisait seulement `row.remove()` (DOM) sans appel API.
- **Correctif** ([pi.js](squad-board/static/js/views/pi.js)) : la logique de sauvegarde est extraite dans une fonction `persist()` réutilisée par « Enregistrer » **et** par la suppression — supprimer un objectif **persiste immédiatement** (toast « Objectif supprimé »). Une ligne nouvellement ajoutée mais vide/non enregistrée est simplement retirée du DOM sans appel réseau.

## [3.34.0] - 2026-06-17

### Fix : objectifs PI enregistrés mais invisibles (divergence de clé snapshot)
- **Symptôme** : ajouter un objectif (ex. équipe Gabbiano) affichait « 1 objectif(s) enregistré(s) » mais rien n'apparaissait, ni dans PI Planning ni sur le Dashboard.
- **Cause** : la **clé d'écriture** du snapshot (`pi_objectives[piInfo.number]`, auto côté backend) divergeait de la **clé de lecture** (`piNum` dérivé du sprint actif). Sur la base réelle, `piInfo.number = 0` alors que le sprint actif est `30.1` (→ `piNum = 30`) : l'objectif partait dans `objectives` (jeu vivant) + `pi_objectives["0"]`, mais l'affichage lisait `pi_objectives["30"]` (snapshot périmé) qui le masquait.
- **Correctifs** ([pi.js](squad-board/static/js/views/pi.js), [dashboard.js](squad-board/static/js/views/dashboard.js)) :
  - **Lecture auto-guérissante** : pour le PI courant, le jeu vivant `objectives` est désormais préféré dès qu'il est non vide (le snapshot ne sert que de fallback / aux PI passés). Les objectifs déjà saisis réapparaissent **sans avoir à les ressaisir**.
  - **Écriture cohérente** : la sauvegarde du PI courant force le snapshot sous la **même clé que la lecture** (`pi_objectives[piNum]`), évitant toute divergence future même si `piInfo.number` est faux.
- **Page de diagnostic** : [tests/pi-objectives-debug.html](squad-board/static/tests/pi-objectives-debug.html) — affiche l'état réel (number, sprint, clés snapshot), signale la divergence, et exécute un test d'ajout de bout en bout (correctif vs ancien comportement) + nettoyage des objectifs `[TEST]`.
- _Note : la cause racine est `piInfo.number` non renseigné (0) — le renseigner dans PI Planning fiabilise aussi les snapshots de PI passés._

## [3.33.0] - 2026-06-17

### Feat : Dashboard — cartes compactes, indicateurs de flux, charts repensés
- **Cartes métriques plus basses** ([dashboard.css](squad-board/static/css/views/dashboard.css)) : `.metric-card` passe en grille (icône en ligne avec le label, padding et police réduits, `--fs-2xl` → `--fs-xl`). Hauteur nettement réduite ; style appliqué aussi aux cartes PI Planning (`.pi-overview`).
- **Nouvelle rangée d'indicateurs secondaires** ([dashboard.js](squad-board/static/js/views/dashboard.js)) : **Débit (7j)** (throughput), **Cycle time médian** (+ lead time médian), **Sans estimation** (tickets actifs sans points), **Sans assigné** (tickets actifs sans lead). Autres indicateurs proposables : âge moyen du WIP, % flaggés, ratio buffer, prévisibilité PI.
- **Bouton « + Ajouter un objectif »** dans l'empty-state objectifs du Dashboard (`#pi-obj-add`) : lien direct vers **PI Planning → Objectifs** (`#pi/<équipe>/objectives`) de l'équipe/ligne produit courante.
- **Charts repensés** (remplacent « Répartition par statut ») :
  - **Lead time & Cycle time** : schéma visuel clair *Créé → (attente) → Démarré → (cycle time) → Terminé* avec moyennes, au-dessus du graphe par ticket existant (`renderCycleTime`).
  - **Tickets bloqués ou stagnants** : liste des tickets bloqués ou sans mouvement depuis ≥ 5 j, triés par ancienneté, cliquables (ouvre le ticket). Colonnes : statut, id, titre, état, responsable, âge (jaune ≥ 5 j, rouge ≥ 14 j).

## [3.32.0] - 2026-06-17

### Feat : connexion JIRA configurable depuis les Paramètres (URL / email / token)
- **Nouveau bloc « Connexion JIRA »** ([settings.js](squad-board/static/js/views/settings.js), section Plugin JIRA) — toujours visible, même sans `.env` : champs **URL**, **Email**, **Token API** (masqué). Pré-remplis depuis le `.env` serveur si présent (URL/email affichés ; pour le token, seul un indicateur « défini dans .env » est montré — le secret n'est **jamais** renvoyé au front). Boutons **Enregistrer**, **Tester** (`rest/api/3/myself`), **Réinitialiser (.env)**.
- **Surcharge réelle de la connexion** : les valeurs saisies sont gardées en **localStorage** (`sb-jira-url` / `sb-jira-user` / `sb-jira-token`) et envoyées au proxy via en-têtes `X-Jira-Url` / `X-Jira-User` / `X-Jira-Token` ([api.js](squad-board/static/js/api.js) — `getJiraCreds`/`setJiraCreds`, en-têtes ajoutés à `jiraGet`). Permet de configurer JIRA sans toucher au `.env`.
- **Proxy backend** ([jira.py](squad-board/app/routers/jira.py)) : chaque en-tête `X-Jira-*` fourni **prime sur le `.env`** ; sinon fallback `.env`. **Token jamais exposé** : `GET /api/config` ([data.py](squad-board/app/routers/data.py)) renvoie `jiraUrl`, `jiraUser` et un booléen `jiraTokenSet`, pas le token.
- **État « configuré »** ([app.js](squad-board/static/js/app.js) — `applyJiraConfig`) recalculé en fusionnant `.env` + localStorage : la sync est activée dès que URL + email + token sont présents (peu importe la source). Champ token laissé vide = valeur conservée (jamais ré-écrit dans le DOM).
- ⚠️ Le token saisi est stocké en clair dans le localStorage du navigateur (outil local) — utiliser le `.env` pour un déploiement partagé.

## [3.31.0] - 2026-06-17

### Feat : équipes/lignes produit retirées préservées + sync rapide allégée
- **Les équipes/lignes produit retirées ne réapparaissent plus** : supprimer une équipe dans Paramètres l'ajoute aux **équipes masquées** (localStorage `sb-jira-excluded-teams`). La sync JIRA ne recrée plus ces équipes — ni leurs tickets/features/epics/sprints — quelle que soit la source (board, `Team[Team]`, features cross-board). Le board d'une équipe masquée n'est même plus scanné (économie de requêtes).
- **Confirmation en début de sync** ([app.js](squad-board/static/js/app.js)) : si des équipes sont masquées, une modale `choiceModal` propose **Conserver ma configuration** (respecte les retraits, défaut) ou **Tout réimporter depuis JIRA** (ignore et vide la liste d'exclusion). Vaut pour la sync rapide **et** complète.
- **Gestion dans Paramètres → Plugin JIRA** ([settings.js](squad-board/static/js/views/settings.js)) : nouvelle ligne « Équipes / lignes produit masquées » — puces cliquables pour restaurer une équipe, bouton « Tout restaurer ».
- **Sync rapide optimisée (14 j)** ([sync.js](squad-board/static/js/sync.js)) : en mode rapide, on **saute les passes historiques** qui ne changent pas sur une fenêtre récente — pagination des sprints clos + vélocité Greenhopper par board, tickets des sprints clos (`closedTicketSprints`), scan complet du buffer (`labels=Buffer`). Les enfants de features sont filtrés sur `updated >= -Nj`. Résultat : nettement moins de requêtes et de temps.
- **Pas de perte d'historique** : en mode rapide, les `teamSprints` fraîchement collectés (sprint actif + futurs) sont **fusionnés par `jiraId`** avec ceux déjà en base (sprints clos + vélocité/buffer), au lieu de les écraser. Une sync complète reste nécessaire pour rafraîchir la vélocité d'un sprint récemment clôturé.
- **Menu de sync simplifié** ([index.html](squad-board/static/index.html)) : suppression des entrées 7 j et 30 j ; il ne reste que **14 j** (+ sync complète). La période reste configurable via Paramètres → « Sync rapide — période ».

## [3.30.0] - 2026-06-17

### Feat : graphe de Vélocité du Dashboard repris dans la page Health
- **Carte Vélocité partagée** : la `health-history-card` (courbe SVG d'évolution du score) est remplacée par la **même carte Vélocité que le Dashboard** (KPIs moy./tendance/record/stabilité, sparkline mini-bars, graphe Chart.js) dans [health.js](squad-board/static/js/views/health.js).
- **Composant réutilisable** [velocity_card.js](squad-board/static/js/components/velocity_card.js) : `velocityCardHtml(opts)` + `mountVelocityChart(opts)` (paramètre `canvasId`), extrait depuis le Dashboard pour éviter la duplication. [dashboard.js](squad-board/static/js/views/dashboard.js) refactoré pour l'utiliser (rendu identique).
- Données dérivées des sprints clôturés via `computeVelocityHistory` / `computeCurrentSprintEntry`. Fonction morte `_renderHealthHistorySvg` supprimée (le sparkline du score Health reste inchangé dans le hero).
- **Lisibilité multi-équipes (Health + Dashboard)** : en périmètre large (« toutes » ou groupe), agréger tous les sprints de toutes les équipes rendait le graphe illisible (177 points). Désormais, sur **les deux pages** : **sélecteur d'équipe** (chips, mémorisé en localStorage — clé distincte par page) affichant **une équipe à la fois**, et **cap aux 16 derniers sprints** (`maxPoints`). Quand une équipe précise est filtrée dans la topbar, le sélecteur disparaît.

## [3.29.0] - 2026-06-17

### Feat : historique du ticket regroupé (modale détail)
- **Plus de répétition de l'auteur** ([modal.js](squad-board/static/js/components/modal.js)) : dans la section `<!-- History -->` de la modale de détail, les modifications **consécutives d'un même auteur** sont regroupées en **une seule ligne** (nom affiché une fois, badge « N champs », sous-liste des changements). Reprend le principe de l'activité récente du board.
- **Date au survol** : chaque changement (et l'horodatage relatif) expose la date+heure complète en tooltip (`mer. 17 juin, 14:32`).
- **Profondeur** : historique élargi de 8 à 12 dernières entrées.
- **CSS** ([modal-detail.css](squad-board/static/css/views/modal-detail.css)) : `.hist-grouped`/`.hist-changes`/`.hist-change`/`.hist-count`.

## [3.28.0] - 2026-06-17

### Feat : matrice Health — colonnes « Prévu » (périmètre engagé au lancement du sprint)
- **2 nouvelles colonnes** ([health.js](squad-board/static/js/views/health.js)) appairées avec les colonnes réalisées pour comparer prévu vs réalisé :
  - **📋 Prévu** : vélocité planifiée (pts) + **nombre de tickets** engagés au lancement du sprint.
  - **🛡 Buf. prévu** : vélocité Buffer planifiée (pts) + **nombre de tickets Buffer** engagés.
- **Source** : vélocité planifiée = estimation JIRA au démarrage (Greenhopper `estimated`) quand dispo, sinon somme des points du périmètre du sprint. Le nombre de tickets n'étant pas snapshoté par JIRA au lancement, il reflète le périmètre courant du sprint (meilleure approximation — précisé dans le tooltip).
- **Modale détaillée** : le tableau `htl-sprint-table` regroupe désormais les métriques en **2 colonnes à 3 sous-colonnes** — **⚡ Vélocité** (`nb` tickets · `planifié` · `réalisée`) et **🛡 Buffer** (`nb` · `planifié` · `réalisée`). `planifié` = estimation JIRA au lancement (non éditable). La colonne **Charge prévue ✏️** (capacité en SP validée par l'équipe au PI Planning, **éditable**, persistée en localStorage) est conservée comme colonne dédiée ; « Capa. estimée » (redondante) supprimée. Plus de **scrollbar horizontale** : en-têtes/cellules compactés, nom de sprint en retour à la ligne au lieu d'élargir la table. Titres de la modale simplifiés : « Vélocité réalisée » → **« Vélocité »**, « Buffer réalisé » → **« Buffer »**.
- **Cellules « Prévu » cliquables** : les 4 sous-colonnes `nb`/`planifié` (Vélocité **et** Buffer) ouvrent, comme les cellules réalisées, la liste détaillée des tickets correspondants en bas de modale (scroll + surlignage). `planned` = tickets engagés au lancement (tous), `bufplanned` = tickets Buffer engagés. Listes stockées par sprint (`all`/`bufAll`) + lazy-fetch JIRA pour les sprints clos. Le moteur de section accepte désormais 4 métriques (velocity/buffer/planned/bufplanned).
- **Liste de tickets regroupée par parent** : la table `htl-table` affiche un **bloc par epic/feature** (en-tête coloré par parent + `N tickets · X pts`), au lieu de répéter la colonne Parent sur chaque ligne ; tri des groupes par points décroissants, « Sans parent » en dernier. Nouvelle **colonne ✓** indiquant les tickets terminés (utile pour les listes « engagés » qui contiennent des tickets non terminés). Tri intra-groupe : **tickets terminés d'abord**, puis points décroissants. Points des tickets terminés en **chip vert**. Compteur de terminés ajouté dans l'en-tête de groupe (`N tickets · N ✓ · X pts`).
- **CSS** ([health.css](squad-board/static/css/views/health.css)) : colonnes `--plan`/`--bufplan` (matrice) + en-têtes groupés `.htl-grp`/`.htl-sub` + séparateurs `.htl-grp-start` (modale) + sous-ligne `.health-metric-count` (« N tk »).

## [3.27.0] - 2026-06-17

### Feat : activité récente — regroupement des modifs d'un même auteur sur un même ticket
- **Plus de répétition du nom** ([activity.js](squad-board/static/js/components/activity.js)) : quand un membre modifie plusieurs champs d'un même ticket (typiquement en une seule édition), les changements consécutifs sont regroupés en **une seule entrée**. L'auteur et le ticket ne s'affichent qu'une fois (en-tête + badge « N modifs »), suivis de la liste des changements.
- **Ordre chronologique préservé** : seules les entrées *consécutives* (même auteur + même ticket) sont fusionnées — pas de réordonnancement.
- **Filtres conservés** : `data-act-field` peut désormais lister plusieurs champs ; filtrer par champ sur une ligne groupée n'affiche que les changements concernés. Filtre par auteur/Tout inchangé.
- **Heure de modification au survol** : l'horodatage relatif (« 2h ») expose la date+heure complète en tooltip (`mer. 17 juin, 14:32`) ; sur une ligne groupée, chaque changement porte sa propre heure.
- **Titre du ticket** : début du titre (tronqué à ~42 car., complet en tooltip) affiché à côté de l'id `.act-ticket` pour situer le ticket sans l'ouvrir.
- **CSS** ([dashboard.css](squad-board/static/css/views/dashboard.css)) : variante `.activity-item--grouped` (en-tête + sous-liste `.act-changes` avec liseré gauche, badge `.act-change-count`) + `.act-ticket-title`.

## [3.26.0] - 2026-06-16

### Feat : import CSV absences — choix « Ajouter » ou « Écraser le PI »
- **Choix au clic sur « Importer le CSV »** ([settings.js](squad-board/static/js/views/settings.js)) : remplace le `confirm()` binaire par une modale à 2 actions — **Ajouter** (append, doublons ignorés, comportement historique) ou **Écraser le PI** (purge d'abord la période avant d'importer). La fenêtre du PI = dates déduites du PI sélectionné si dispo, sinon amplitude des absences du CSV. Le bouton « Écraser » affiche le nombre d'absences existantes qui seront supprimées + la plage de dates.
- **Backend** ([absences.py](squad-board/app/routers/absences.py)) : `POST /api/absences/bulk` accepte un nouveau paramètre `replaceRange {start,end}` — supprime les absences **chevauchant** cette fenêtre (et non plus toute la table comme `replace:true`) avant insertion. Réponse enrichie d'un compteur `deleted`.
- **Modale réutilisable** `choiceModal(title, message, buttons)` ([utils.js](squad-board/static/js/utils.js)) : N actions + Annulation, thémée (réutilise `.confirm-overlay`/`.confirm-modal`), Échap/clic-hors = annuler.
- Toast d'import enrichi : `X ajoutee(s) · Y ecrasee(s) · Z doublon(s)`.

## [3.25.1] - 2026-06-16

### Fix : copie Slack « 📋 Semaine » (Agenda) — absents uniquement, tirets simples
- **Bloc « Dispo » retiré** ([agenda.js](squad-board/static/js/views/agenda.js)) : la copie de la semaine ne liste plus les membres disponibles, seulement les absents (congé, maladie, formation, OFF).
- **Séparateur** : `—` (cadratin) remplacé par `-` dans les lignes d'absence pour un rendu Slack plus sobre.

### Style : format Slack « AGENDA DU JOUR » du calendrier (shortcodes + espacement)
- **Shortcodes Slack** ([cal_banner.js](squad-board/static/js/components/cal_banner.js)) : sections en `:sunrise: Matin` / `:sunny: Après-midi` et absents en `:beach_with_umbrella: Absents` (au lieu des emojis Unicode bruts), plus fiables au collage dans Slack.
- **Espacement** : ligne vide entre chaque section (Matin / Après-midi / Absents) pour un bloc plus lisible.
- **Tirets simples** : séparateur d'horaire `09h30-09h45` (`-` au lieu du demi-cadratin) et titre `AGENDA DU JOUR - *…*`.
- **Demi-journées** : OFF partiel affiché `(matin)` / `(après-midi)` quand détectable dans le titre, sinon `(½)`. Appliqué aussi à la copie hebdo (`_buildWeekSlack`).

## [3.25.0] - 2026-06-16

### Feat : lot d'améliorations UX/UI (accessibilité, mobile, tooltips, topbar)
- **Accessibilité** ([base.css](squad-board/static/css/base.css)) : garde `prefers-reduced-motion` (neutralise les 240 transitions pour les utilisateurs sensibles au mouvement) + anneau `:focus-visible` global (focus clavier toujours visible sur les éléments interactifs sans indicateur dédié ; souris/tactile non affectés).
- **`promptModal()`** ([utils.js](squad-board/static/js/utils.js)) : saisie modale thémée (validation, Échap/Entrée) remplaçant les **5 `prompt()` natifs** (nom utilisateur, favori, URL lien/image WYSIWYG avec sauvegarde/restauration de sélection, libellé support). CSS `.confirm-modal--prompt`.
- **Tooltips stylisés** ([components/tooltip.js](squad-board/static/js/components/tooltip.js)) : composant global léger sur `[data-tooltip]` (délégué sur document → marche pour le contenu dynamique). Chrome topbar/sidebar/modal converti de `title=` natif → `data-tooltip` (avec `aria-label` sur les boutons icône). Attribut distinct du `data-tip` riche du calendrier.
- **Mode mobile « cartes » (< 768px)** pour les 3 vues data-denses : Backlog ([backlog.css](squad-board/static/css/backlog.css)), Rotation Support ([support.css](squad-board/static/css/views/support.css)), Agenda (colonne Membre figée + compactage, [agenda.css](squad-board/static/css/views/agenda.css)). CSS-only, aucune refonte JS.
- **Désencombrement topbar** : menu kebab `⋯` (< 1024px) regroupant Favoris + Mes tickets (relais vers les boutons d'origine ; Favoris ancré sur le kebab car le bouton est masqué), et **recherche conservée** sur tablette/mobile (auparavant masquée avec `.topbar-center`). [index.html](squad-board/static/index.html), [base.css](squad-board/static/css/base.css), [app.js](squad-board/static/js/app.js).
- **hex → tokens** : remplacement des **84 couleurs hex** mappant **sans ambiguïté** vers un design token (iso-rendu en clair, cohérence dark mode). Les 207 hex ambigus (ex. `#ffffff`, `#3b82f6` → plusieurs tokens) et 352 one-off restent inchangés (jugement contextuel requis — pass dédié à prévoir).

## [3.24.1] - 2026-06-15

### Fix : sélecteur PI du topbar invisible quand le sprint actif s'appelle « PI Design #30 »
- **Cause** : `extractPiNum()` ([utils.js](squad-board/static/js/utils.js)) — source unique du N° de PI — ne savait extraire le numéro que s'il suivait *immédiatement* « PI » (`/PI\s*#?\s*(\d+)/i`) ou via la notation décimale `30.1`. Le sprint actif JIRA réel **« PI Design #30 »** (texte entre « PI » et le numéro) renvoyait donc `0` → `getCurrentPi()` = 0 → `updatePiSelector()` cachait le sélecteur sur **toutes** les vues. Idem `health.js` (filtrage par PI).
- **Correctif additif** : 3ᵉ regex en dernier recours `/(?<![A-Za-z])PI(?![A-Za-z])[^\d]{0,15}?(\d+)/i` qui capte « PI \<texte\> #\<num\> ». Les 2 regex existantes restent **inchangées** (zéro régression sur l'existant). Lookbehind/lookahead pour ne pas matcher « PI » au milieu d'un mot (`API`, `shipping`…).
- **Validé** sur 100 % des noms de sprints réels de l'instance (PI Design #27/28/30, `Caméléon - 29.1`, `Team B - ité 18.4`…) + 12 cas de non-régression (`Cadrage_PI30`→30, `shipping 30`→0, `API v2 plan 14`→0).
- ⚠️ Dette connexe repérée (non corrigée ici) : [picalendar.js](squad-board/static/js/views/picalendar.js) et [roadmap.js](squad-board/static/js/views/roadmap.js) **réimplémentent** la regex localement (`_extractPiNum`) — anti-pattern interdit par CLAUDE.md, à faire converger vers `extractPiNum`.

## [3.24.0] - 2026-06-15

### Refactor : éclatement de `views.css` (12 682 lignes) en 23 fichiers par vue/composant (rendu identique)
- **`static/css/views.css` (12 682 lignes) supprimé**, remplacé par `static/css/views/` (23 fichiers de 11 à 1680 lignes) : `health`, `dashboard`, `sprint`, `pi-planning`, `reports`, `velocity`, `sprint-tickets-modal`, `settings`, `forms`, `modal-detail`, `calendar-banner`, `print`, `pi-config`, `support-rotation`, `pi-import`, `support`, `roam`, `pi-calendar`, `reports-epic`, `settings-pi-objectives`, `roadmap`, `agenda`, `poker`.
- **Cascade strictement préservée** : découpe uniquement aux séparateurs de section `══`, **sans réordonnancement**. La concaténation des fichiers dans l'ordre des `<link>` reproduit l'ancien `views.css` **byte-pour-byte** (vérifié par script avant suppression de l'original). Aucun changement visuel.
- **[index.html](squad-board/static/index.html)** : `<link>` unique remplacé par les 23 fichiers dans l'ordre de cascade (commentaire « ne pas réordonner »). `atlas.css`/`backlog.css` restent chargés après.
- **0 coupure mid-bloc** (validé par stylelint : aucune `CssSyntaxError`). `StaticFiles` sert le sous-dossier `views/` de façon récursive (aucun changement backend).
- ⚠️ Certaines vues restent sur 2 fichiers (Settings, Reports) car leurs règles sont non-contigües dans la source — les regrouper aurait réordonné la cascade. À consolider seulement avec une validation visuelle.

## [3.23.0] - 2026-06-15

### Chore : outillage qualité front (ESLint + Stylelint + Prettier, sans build runtime)
- **Nouveau `package.json` dev-only** : `eslint`, `@eslint/js`, `globals`, `stylelint`, `stylelint-config-standard`, `prettier`. Aucun build, aucune dépendance runtime — uniquement des vérifications. `node_modules/` déjà ignoré.
- **Scripts** : `npm run lint` (JS + CSS), `npm run lint:js`, `npm run lint:css`, `npm run format` (Prettier `--write`), `npm run format:check`.
- **ESLint** ([eslint.config.js](squad-board/eslint.config.js)) — flat config, ES modules navigateur. Correctness en erreur (`no-undef`, `no-dupe-keys`…), hygiène en warning (`no-unused-vars`…). Espace fine insécable FR (U+202F) autorisé dans strings/templates. Ignore `vendor/` et `tests/`. **Baseline : 0 erreur, 114 warnings** (legacy à nettoyer progressivement).
- **Stylelint** ([.stylelintrc.json](squad-board/.stylelintrc.json)) — `stylelint-config-standard`. Philosophie : **Prettier possède le formatage, stylelint la qualité** → règles de mise en forme neutralisées (style compact volontaire préservé), signaux qualité en warning (sélecteurs dupliqués, vendor-prefix, blocs vides, hex courts…). **Baseline : 0 erreur, 101 warnings**.
- **Prettier** ([.prettierrc.json](squad-board/.prettierrc.json)) — 4 espaces, single quotes (double en CSS), `printWidth` 100. Config posée ; reformatage non appliqué (à lancer via `npm run format` au moment choisi).
- **2 bugs réels détectés et corrigés par l'outillage** :
  - [topbar.js](squad-board/static/js/components/topbar.js) — `searchInput` hors scope dans `renderSearchResults()` (`ReferenceError` au clic sur un résultat de recherche).
  - [views.css](squad-board/static/css/views.css) — `.demo-goal-card` : `flex: 0 1 650Rpx` (unité invalide, `flex-basis` ignorée) → `650px`.

## [3.22.0] - 2026-06-15

### Refactor : éclatement du backend `main.py` en package `app/` (sans changement fonctionnel)
- **`main.py` 2591 → 63 lignes** : ne fait plus que composer (bootstrap DB, lifespan client HTTP, `include_router`, static). Lancement **inchangé** (`python main.py`, PM2/`ecosystem.config.cjs` intact).
- **Nouveau package `app/`** : `common`, `config`, `db`, `migrations`, `seed`, `http_client`, `serializers`, `crud` (factory), `models/` (19 modèles répartis par domaine), `services/ics.py`, et `routers/` (1 module par domaine).
- **Factory CRUD** (`app/crud.py`) : `make_crud_router()` génère les endpoints mécaniques (list/get/update/delete) ; `create` et la logique spécifique (filtres, field_map, bulk, upsert) restent explicites par routeur.
- **Sérialiseurs centralisés** (`app/serializers.py`) = source unique du contrat camelCase consommé par le front.
- **`expand_calendar_events`** factorisé (partagé entre `/api/all` et `/api/calendars/events`).
- **Non-régression** validée à chaque étape via golden test `GET /api/export` & `/api/all` (sortie byte-identique). Plan détaillé : [docs/refactor-plan-backend.md](docs/refactor-plan-backend.md).

## [3.21.0] - 2026-06-11

### Feat : Hash URL + hiérarchie Epic/Feature dans le Backlog ([backlog.js](squad-board/static/js/views/backlog.js), [app.js](squad-board/static/js/app.js), [backlog.css](squad-board/static/css/backlog.css))
- **Synchronisation URL** : l'état des filtres backlog est encodé dans le fragment (`#backlog?s=todo&p=high&q=foo&pi=PI30&g=epic&h=epic`). Partager/bookmarker l'URL restaure les filtres exactement. `app.js` extrait le query string du fragment avant le routage.
- **Affichage hiérarchique** : nouveau bouton de filtre **Hiérarchie** (Plat / Épics / Complet). En mode *Épics* les tickets sont groupés sous leur Epic parent (⚡) avec indentation ; en mode *Complet* les Features (🚀) s'ajoutent au-dessus des Épics. Orphelins (tickets sans epic, epics sans feature) affichés en tête.
- **Lignes parents** (`.bl-parent-row`) : affichent le total SP des enfants, le nombre de tickets, l'équipe et le statut de l'epic/feature.
- **Indentation visuelle** : `padding-left` proportionnel à la profondeur (22px/niveau) sur les lignes de tickets comme de parents.

## [3.20.0] - 2026-06-10

### Feat : 12 améliorations visuelles et navigation Backlog ([backlog.js](squad-board/static/js/views/backlog.js), [backlog.css](squad-board/static/css/backlog.css))
- **Barre de progression** dans chaque en-tête de groupe : jauge verte indiquant % de tickets `done` (tooltop `X/Y terminés`).
- **Point coloré d'équipe** dans la colonne Équipe : couleur issue de `teamObjects` (Settings → Lignes produit/groupes).
- **Densité d'affichage** : bouton bascule Compact / Confort dans la sous-barre. Persisté dans `sb-backlog-density`.
- **Masquer les tickets terminés** : bouton bascule ⊡/⊠. Persisté dans `sb-backlog-hidedone`.
- **Mise en surbrillance du terme recherché** dans le titre et l'ID (`<mark class="bl-hl">`), insensible à la casse.
- **SP vide mieux distingué** : tiret sans badge de fond (`.bl-pts--empty`).
- **En-têtes de colonnes triables** (ID, Titre, Statut, SP, Priorité, Sprint, Màj) : 1er clic = asc, 2e = desc, 3e = reset. Sort state module-level `_sortKey`/`_sortDir` préservé entre re-renders.
- **En-têtes de groupes sticky** : collent sous le `thead` lors du défilement (`top: 30px; z-index: 2`).
- **Raccourci `/`** pour focaliser la recherche (depuis n'importe où hors champ de saisie), avec cleanup propre à chaque re-render.
- **Compteurs dans les chips de filtres** : badge indiquant le nombre de tickets disponibles dans `base` (avant filtrage backlog).
- **Navigation clavier dans le tableau** : ↑/↓ déplace le focus entre lignes, Entrée ouvre la modal, Espace coche/décoche la sélection. Lignes avec `tabindex="0"`.
- **Sélecteur "Aller à un groupe"** : menu déroulant listant les groupes avec leur nb de tickets, scroll vers le groupe + déplie si replié.

## [3.19.0] - 2026-06-10

### Feat : Page Backlog ([backlog.js](squad-board/static/js/views/backlog.js))
- Nouvelle vue accessible via le menu (raccourci **B**) : tableau de tous les tickets avec filtres, regroupement, sélection en masse et drag & drop.
- **Filtres** : recherche texte (ID ou titre), chips multi-select par type / priorité / statut, dropdown PI, bouton réinitialiser. État persisté en localStorage (`sb-backlog-filters`).
- **Regroupement** : Sprint (actif en tête), PI, ou plat. Persistence via `sb-backlog-groupby`. Accordéon par groupe, expand/collapse tout.
- **Séparateur tickets périmés** : dans chaque groupe, un séparateur ⚠️ sépare les tickets non mis à jour depuis plus de X mois (défaut 3, configurable dans Paramètres → Rappels & Cérémonies). Bouton masquer/afficher la section stale.
- **Sélection multi-tickets** : checkbox par ligne + sélectionner tout. Barre d'actions flottante affichant le nombre sélectionné, avec selects "déplacer vers sprint" et "déplacer vers PI" + bouton Appliquer.
- **Drag & drop** : glisser une (ou plusieurs si sélection active) ligne vers un groupe header pour déplacer vers ce sprint/PI.
- **Export CSV** : bouton ⬇ CSV génère un `.csv` (BOM UTF-8) de tous les tickets visibles.
- Architecture modulaire : styles dans `backlog.css`, logique de filtres dans `backlog-filters.js`, BulkManager dans `backlog-bulk.js`.

### Feat : Paramètre seuil tickets périmés (Settings → Rappels & Cérémonies)
- Nouveau champ numérique dans la section Rappels & Cérémonies pour configurer le seuil en mois des tickets considérés comme périmés dans le Backlog. Persiste dans `localStorage.sb-backlog-stale-months`.

## [3.18.0] - 2026-06-09

### Fix : Navigation prev/next dans la modale ticket (histoire stacking)
- Les boutons ← → de navigation entre tickets utilisaient `history.pushState` à chaque clic, empilant des entrées d'historique. Fermer la modale nécessitait autant de retours que de navigations. Fix : `history.replaceState` quand la modale est déjà ouverte (navigation en cours), `pushState` uniquement à l'ouverture initiale. ([modal.js](squad-board/static/js/components/modal.js))

### Feat : Jeu de données démo complet (Paramètres > Données)
- Bouton « 🎬 Charger la démo complète » dans Settings > Données : charge un scénario SAFe fictif (4 équipes Vega/Lyra/Orion/Sirius, PI#5 sprint 3, 56 tickets, 10 epics, 6 features, objectifs PI, risques ROAM, absences, rotations support, compétences Atlas). Tous les noms sont 100% fictifs. ([demo.js](squad-board/static/js/demo.js), [settings.js](squad-board/static/js/views/settings.js))

### UX : Modale create/edit ticket redessinée (chips ergonomiques)
- **Type, Priorité, Points, Statut** : sélecteurs visuels en chips colorés (radio), fini les `<select>` sans couleur.
- **Labels** : chips prédéfinis cliquables (tech-debt, retro, postmortem…) + champ pour ajouter un label custom (↵).
- **Filtrage leader par équipe** : changer l'équipe filtre automatiquement la liste des leaders disponibles.
- Même traitement appliqué à la modale d'édition pour cohérence. ([modal.js](squad-board/static/js/components/modal.js), [views.css](squad-board/static/css/views.css))

---

## [3.17.0] - 2026-06-08

### Feat : Tickets des sprints clos synchronisés en local (Health)
- **Nouvelle passe de sync** ([sync.js](squad-board/static/js/sync.js)) : pour chaque board, import des tickets des **N derniers sprints clos** (cap `sb-sync-closedTicketSprints`, défaut 6 ≈ 1 PI, `0` = off). Avant, seuls le sprint actif + sprints futurs + features/epics étaient importés → l'historique des tickets de sprints passés était absent en local. Dédoublonnage via `seenTicketIds` (le sprint actif et les sprints clos plus récents priment). La passe tourne même pour les boards sans sprint actif.
- **Conséquence** : dans la modale Health (clic Vélo/Buffer d'un sprint passé), les tickets s'affichent **directement depuis le local** sans lazy-fetch JIRA. Le lazy-fetch reste en filet de sécurité si un sprint plus ancien que le cap est consulté.

### Fix : Cohérence « vélocité/buffer réalisé » (cellule vs liste)
- La cellule Vélo./Buffer du tableau des sprints affichait la vélocité JIRA (greenhopper) tandis que la section tickets sommait les Story Points Done → valeurs incohérentes. Désormais, quand les tickets Done locaux existent, **la cellule = somme des SP Done** (= total de la section). La vélocité JIRA ne sert plus que de fallback quand aucun ticket local n'est disponible. Conforme à l'intitulé de colonne « Vélocité réalisée (Done SP) ».

---

## [3.16.0] - 2026-06-08

### Fix : Dates de fin de sprint clos = clôture réelle (completeDate)
- **Cause** : la synchro JIRA ne conservait que `endDate` (date de fin **planifiée**). Or JIRA distingue `endDate` (planifiée) et `completeDate` (clôture **réelle**, souvent décalée de quelques jours pour un sprint fermé en retard). La barre calendrier / la modale Health affichaient donc une date planifiée (ex: `→ 14/05`) alors que le sprint a réellement tourné jusqu'au `18/05`.
- **Fix** ([sync.js](squad-board/static/js/sync.js)) : `teamSprints[]` capture désormais `completeDate` et `plannedEndDate`. Pour un sprint **clos**, `endDate` effective = `completeDate` (réelle) ; la date planifiée reste disponible via `plannedEndDate`. Les sprints actifs/futurs sont inchangés. Aucun changement de schéma backend : `team_sprints` est une colonne JSON, les nouveaux champs round-trip automatiquement.

### Feat : Inspecteur de sprints dans `/tests/jira-explorer.html`
- Nouvel onglet **Sprints** : liste tous les sprints des boards scrum avec leurs dates **brutes** JIRA (`startDate` / `endDate` planifiée / `completeDate` réelle) + état + ID. Filtre par nom et option « écarts uniquement » qui surligne les sprints dont `completeDate ≠ endDate`. Outil de diagnostic pour vérifier ce que JIRA renvoie réellement.

### Feat : Vue Health enrichie (colonnes Vélocité / Buffer + modale sprint)
- **Sélecteur PI** sur `/#health` (ajout de `health` à `PI_VIEWS`) : anomalies et métriques suivent le PI sélectionné.
- **Colonnes ⚡ Vélocité réalisée et 🛡 Buffer réalisé** par équipe dans la matrice (tooltip détaillé, clic → modale).
- **Modale sprint** : tableau des sprints du PI (début, état, mood coloré éditable au clic, capacité estimée, charge prévue éditable, vélocité, buffer) + liste des tickets Done. Sprint courant surligné bleu pastel.

### Feat : Modale calendrier (cal-week-grid) — nombreuses améliorations
- Jours **PIP** récupérables marqués, events **multi-jours** affichés sur tous leurs jours, **bgcolor par calendrier**, drapeau 🏁 fin de sprint, flocon ❄️ sur events GEL/Freeze.
- **Séparation matin / après-midi** (14h) pleine largeur avec gouttière latérale, **mode compact** (titres seuls + popup détail), **popup détail d'événement** au clic (style Google Agenda : visio, contacts, ID réunion…).
- **Barre sprint** : nom + goal alignés sur les colonnes jours, affichage de **tous les sprints chevauchant la semaine** (précédent + courant + suivant).

---

## [3.15.0] - 2026-06-06

### Refactor : Assainissement de la gestion du « PI courant » (maintenabilité)

#### Niveau 1 — Source unique du PI courant
- **`getCurrentPi({ sprintInfo, piInfo })` + `extractPiNum(name)`** ([utils.js](squad-board/static/js/utils.js)) : une seule fonction calcule « quel est le PI courant » (sprint actif JIRA > `piInfo.number`). Remplace les 3 réimplémentations divergentes de la regex dans [topbar.js](squad-board/static/js/components/topbar.js), [settings.js](squad-board/static/js/views/settings.js) et [dashboard.js](squad-board/static/js/views/dashboard.js). `pi.js` route son `_extractPi` local vers `extractPiNum`. **Plus aucune divergence possible.**

#### Niveau 2 — Config carrée + alerte désync
- **Bandeau d'alerte désync** dans Settings → Sprint & PI : si le N° de PI configuré (`piInfo.number`) ne correspond pas au PI du sprint actif, un bandeau ⚠️ s'affiche avec un bouton **« Recaler sur PI#xx »** qui aligne la config en un clic. Évite les cas où une vue lisant `piInfo.number` brut affiche le mauvais PI (ex: config `number=29` / `name="PI#30"`). Le champ « Nom du PI » reste libre.

#### Niveau 3 — Objectifs historisés par PI
- **`PIConfig.pi_objectives`** (JSON keyé par PI, comme `pi_members`) ([main.py](squad-board/main.py)) : les objectifs de chaque PI sont désormais conservés au lieu d'être écrasés à la transition de PI. Migration SQLite `ALTER TABLE piconfig ADD COLUMN pi_objectives`.
- **Snapshot automatique** : `PUT /api/pi` historise les objectifs du PI courant dans `pi_objectives[number]` à chaque save (pas de dépendance frontend).
- **Endpoint dédié** `PUT /api/pi/objectives/{pi_number}` : saisir/corriger les objectifs d'un PI passé/futur sans toucher au courant (symétrique à `/api/pi/members/{pi_number}`).
- **Dashboard & PI Planning** lisent le snapshot `pi_objectives[displayPiNum]` pour les PI ≠ courant → **les objectifs d'un PI passé sont enfin affichables via le sélecteur PI**. L'onglet Objectifs de PI Planning migre du `localStorage` (par-navigateur) vers la base (partagé). Message « non disponibles » remplacé par « aucun objectif enregistré, saisissez-les dans PI Planning → Objectifs ».
- **Import/Export** : `/api/import` restaure désormais l'intégralité de l'état PI (`sprintsPerPI`, `startDate`, `pi_members`, `pi_objectives`…) au lieu des seuls `number/name/objectives`.

---

## [3.14.0] - 2026-06-05

### Feat : Sélecteur PI sur le Dashboard
- **Sélecteur PI (PI-2..PI+2) sur `/#dashboard/`** : ajout de `dashboard` au set `PI_VIEWS` ([topbar.js](squad-board/static/js/components/topbar.js)). Le titre, les objectifs et la carte « sprint en cours » suivent désormais le PI sélectionné.
- **Carte sprint adaptée au PI** : à l'offset 0, carte du sprint actif inchangée ; sur un autre PI, bandeau `sprint-header--other-pi` (🗓️ PI #N) avec la bande des sprints concernés (`_renderPiSprintsStrip` reçoit `displayPiNum`).

### Fix : Objectifs « non disponibles » à tort sur le Dashboard
- **Cause** : `displayPiNum` était ancré sur le sprint actif alors que `_objsAreForDisplayedPi` comparait à `piInfo.number`. Quand les deux divergent (sprint actif `28.x` mais `piInfo.number=29`, ou config désynchronisée `number=29`/`name="PI#30"`), le message « Les objectifs ne sont disponibles que pour le PI courant » s'affichait même sur le PI courant.
- **Fix** : `_basePiNum` ancré sur le PI du sprint actif (fallback `piInfo.number`), cohérent avec topbar.js et settings.js. Les objectifs (un seul jeu en base, pas d'historique par PI) ne s'appliquent qu'à l'offset 0. Message d'erreur corrigé pour pointer le vrai PI courant.

---

## [3.13.0] - 2026-06-04

### Feat : PI Planning & Atlas — 10 améliorations ergonomie / UX

#### PI Planning
- **#3 — Raccourcis clavier onglets** : touches `1`-`9` basculent entre les onglets PI (Objectifs / Features / Capacité / Burnup / ROAM / Équipes / Support / Mood / Fist). Désactivé si le focus est sur un champ de saisie.
- **#5 — Progression objectifs rollup** : barre de progression par objectif dérivée des features de l'équipe (done/total), couleur verte/orange/rouge. Jauge globale en haut de l'onglet Objectifs.
- **#4 — Vote de confiance par objectif** : panneau `🎯 Confiance par objectif` ajouté sous le Fist of Five. Vote 1-5 par objectif (stocké via `type='confidence'` dans l'API Mood), affichage de la moyenne et distribution par barres.
- **#6 — États vides illustrés** : onglet Features → message guidant avec lien vers la sync JIRA ; onglet Capacité → tooltip hint sur les équipes sans membres importés.
- **#11 — Confettis consensus parfait** : si tous les votes Fist of Five ou Mood ont la même valeur ≥ 4, une animation canvas de confettis apparaît (2,5 s, sans librairie externe).
- **#2 — Mini-heatmap capacité** : strip compact entre les onglets et le contenu PI — une pastille colorée (vert/orange/rouge) par équipe indiquant SP planifiés vs capacité nette. Clic → bascule sur l'onglet Capacité avec filtre équipe.
- **#10 — Mode présentation PI Planning** : bouton `⊞` dans l'en-tête du PI ouvre le plein écran navigateur (fallback position:fixed). Les metric-cards sont agrandies en présentation.

#### Atlas
- **#8 — Recherche de compétence "qui sait faire X ?"** : barre de recherche dans la carte unFIX. Saisir un nom de compétence → highlight des membres avec niveau ≥ 2 (pulsation verte + compteur), fade des autres. Persisté en localStorage.
- **#7 — Simulation staffing drag & drop** : bouton `🔄` active le mode simulation. Glisser une pastille membre vers une autre équipe → recalcul de la hiérarchie live. Bandeau récapitulant les déplacements. Bouton `Annuler` réinitialise.
- **#1 — Comparateur d'équipes** : bouton `⚖️` ouvre une modal de comparaison. Sélectionner 2-3 équipes → radar Chart.js superposé + tableau skill par skill avec mise en avant de l'équipe la plus performante.

---

## [3.12.0] - 2026-06-04

### Feat : Planning Poker (estimation collective des Story Points)
- Bouton **🃏 Réestimer** dans la modale ticket ([modal.js](squad-board/static/js/components/modal.js) `_openPokerModal`) : ouvre une modale de vote Fibonacci (1, 2, 3, 5, 8, 13, 21, ?) avec cartes cliquables.
- **Vote multi-participants** persisté en `localStorage` (`sb-poker-<ticketId>`), votes masqués jusqu'à révélation, puis affichage des stats : moyenne / min / max / écart-type (⚠ si σ ≥ 4 = désaccord à discuter), distribution en barres, Fibonacci la plus proche.
- Bouton **Enregistrer X SP** met à jour les Story Points du ticket via l'API.
- Accès direct via hash `#…/ticket/ID/poker` (partageable, géré dans [app.js](squad-board/static/js/app.js)).

### Feat : Atlas — compétences requises par équipe + sélection catalogue
- **Compétences requises/favoris** (⭐) par équipe sur les en-têtes de la Skills Matrix ([atlas.js](squad-board/static/js/views/atlas.js)) — persistance `localStorage sb-team-req-<équipe>`. Alerte ⚠ animée si une compétence requise n'a aucun membre évalué.
- **Sélection des compétences visibles par équipe** (bouton 🎯) — chaque équipe choisit un sous-ensemble du catalogue global (`sb-team-skills-<équipe>`).
- **Catalogue** : drag & drop pour réordonner, import JSON/CSV avec contrôle visuel vert/orange/rouge, affichage 2 colonnes compact, tri alphabétique des sélecteurs.
- **Long press** (600 ms) sur une cellule de niveau pour proposer un ticket de montée en compétence (loader SVG animé), remplace le double-clic.
- Regroupement des membres **par rôle** dans la carte unFIX (icône + couleur par rôle).

### Feat : PI Planning — copie Miro & tickets enfants
- Bouton **📋 Miro** par équipe (onglet Features) : copie HTML (table avec liens JIRA cliquables) collable directement en stickies Miro. Features buffer copiées avec leurs tickets enfants.
- **Tickets enfants pliables** sous chaque feature (chevron à gauche, rotation au dépli).
- Card "Bloqués" (remplace "Équipes") + tooltips détaillés sur les metric-cards (Features, Epics, Objectifs, Bloqués).

### Fix : PI capacité & cohérence équipes
- **Sélecteur PI ↔ titre** : le titre utilise toujours le numéro de PI calculé (corrige l'incohérence PI29 sélecteur vs PI30 titre).
- **Capacité par membre** : calcul des jours d'absence en **jours ouvrés** (corrige le ratio de dispo, ex. 30 % au lieu de 50 %) ; `endDate` JIRA traité comme borne exclusive.
- **Normalisation des équipes** : `"Team Fuego"` → `"Fuego"` à l'import (backend) ET à la lecture (`deriveMembersFromAbsences`), 564 absences existantes normalisées.

### Perf : optimisations backend & frontend
- **Endpoint `GET /api/all`** : 1 requête au boot au lieu de 17 ([main.py](squad-board/main.py), [app.js](squad-board/static/js/app.js)).
- **Index SQLite composés** : `(team, status)`, `(team, pi_sprint)` sur ticket, `(feature_id, team)` sur epic.
- **`business_rules.js`** : règles d'anomalies partagées (health.js + alert_modal.js), fin de la duplication.
- **roadmap.js** : pré-indexation (Map) au lieu de boucles N+1 ; **health.js** : délégation d'événements ; **sync.js** : fetch des métadonnées boards JIRA en parallèle ; **topbar.js** : guard contre les listeners dupliqués.

### Fix : agenda & sidebar
- **Agenda** : hash par date (navigation back/forward), affichage des demi-journées (½), tri membres par rôle puis prénom, boutons ‹/› élargis.
- **Sidebar** : picker de groupe au survol de "Tous", suppression des boutons de groupe en doublon.

---

## [3.11.7] - 2026-06-03

### Feat : Atlas — visite guidée automatique (onboarding)
- Bouton **▶ Visite guidée** dans la barre de la carte unFIX ([atlas.js](squad-board/static/js/views/atlas.js) `_startTour`) : enchaîne automatiquement les étapes **Programme → chaque ligne produit → chaque équipe** (~4 s/étape), avec un panneau de commentaire (titre + stats + appétences fortes de l'équipe).
- **Contrôles** : précédent / pause-reprise / suivant / arrêter, barre de progression, raccourcis clavier (← → Échap). Couleur de l'accent adaptée au groupe/équipe affiché.
- Compatible **mode présentation plein écran** (l'overlay reste fixé en bas). Idéal pour un coach qui présente l'organisation sans cliquer.
- Refacto : `_wireStage` séparé de `_wireMap` pour ré-attacher les clics du stage sans dupliquer les listeners de la barre.

## [3.11.6] - 2026-06-03

### Feat : Atlas — export carte PNG + nettoyage des orphelins
- **Export de la carte unFIX en PNG** : bouton ⬇ dans la barre de carte ([atlas.js](squad-board/static/js/views/atlas.js) `_exportMapPng`) — capture le stage courant (niveau de zoom affiché) via html2canvas (chargé à la demande depuis CDN, scale 2, fond adapté au thème). Nom de fichier contextuel (`atlas-<équipe|groupe|programme>-AAAA-MM-JJ.png`). Idéal pour les slides d'onboarding.
- **Robustesse orphelins** : le tableau de suivi de mobilité signale les lignes **orphelines** (membre absent du CSV RH après renommage/suppression) avec un bandeau ⚠ + bouton **Nettoyer** (supprime les lignes via `deleteMobility`). Les niveaux/appétences orphelins étaient déjà ignorés à l'affichage (pas de plantage).

## [3.11.5] - 2026-06-03

### UI : Section Sprint & PI élargie + Atlas (lien mobilité, heatmap appétence)
- **Section "Sprint & PI"** (Paramètres) élargie (`settings-section--wide`, jusqu'à 1100px) pour afficher les 6 sprints d'un PI sur une seule ligne sans repli.
- **Atlas — lien Skills Matrix ↔ Mobilité** : le tableau de suivi affiche, à côté du "Niveau (1-4)" saisi, un badge **≈N** = niveau dérivé de la moyenne des compétences évaluées du membre (tooltip : nb de compétences, moyenne, max). Badge en orange si différent du niveau saisi ; clic = reprendre la valeur dérivée.
- **Atlas — appétences équipe** : la carte unFIX affiche désormais les appétences **fortes** (plein) ET **faibles** (atténué/tireté avec ↓), plus seulement les fortes. Les neutres restent masquées.

## [3.11.4] - 2026-06-03

### Feat : Rotation Support — bouton "Copier" (message Slack/Teams)
- Nouveau bouton **📋 Copier** par équipe ([settings.js](squad-board/static/js/views/settings.js) `_rotBuildCopyMessage`) → génère un message de rotation prêt à coller :
  ```
  🟣 Support N3 OPS [PI30]

  * 🟦 Itération 30.1.1 (12/06/2026 au 18/06/2026)
      * @Prénom NOM  @Prénom2 NOM2
  * 🟦 Itération 30.1.2 (19/06/2026 au 25/06/2026)
      * …
  ```
  - Une ligne par itération (semaine), dates JJ/MM/AAAA, membres préfixés `@` (format "Prénom NOM").
  - Respecte le PI sélectionné (offset topbar) et le mode semaine de l'équipe.
  - **Clic droit** sur le bouton → personnaliser le libellé du support (ex: "Support N3 OPS", "Astreinte", persisté en `localStorage.rot-label-<équipe>`).

## [3.11.3] - 2026-06-03

### Fix : Rotation Support — détection du 6e sprint (PI exceptionnel)
- La section **Rotation Support** et les pills **Sprint & PI** (Paramètres) n'affichaient que 5 sprints même quand le PI en compte 6 (ex: PI30 avec un sprint `30.6`). Désormais le nombre de sprints est **détecté depuis les `teamSprints` JIRA** (max index trouvé pour le PI) — `_detectSprintsPerPI` / détection inline ([settings.js](squad-board/static/js/views/settings.js)). On prend `max(détecté, config)` pour ne jamais masquer un sprint réel.

### Feat : Atlas — filtres Skills Matrix + mode présentation
- **Filtre/recherche** dans la Skills Matrix : champ de recherche (filtre les lignes par nom de membre/équipe) + case **"masquer les non-évalués"** (cache lignes ET colonnes sans aucune évaluation). Compteur dynamique `affichés/total`.
- **Mode présentation / onboarding** : bouton plein écran sur la carte unFIX (API Fullscreen native + fallback pseudo-plein-écran). Éléments agrandis pour la projection — idéal pour un coach qui présente l'organisation.

## [3.11.2] - 2026-06-03

### Feat : Atlas — fiche membre (radar), réordonnancement, assignation
- **Fiche membre** (clic sur une pastille de la carte unFIX) : modal avec **radar Chart.js** des compétences évaluées (≥3), barres de niveau triées, appétences fortes, trajectoire de mobilité (rôle/équipe cible, risque). Bouton "Voir dans la matrice →".
- **Réordonnancement** des compétences/appétences : flèches ← → dans le popover d'édition (échange le `sort` avec le voisin de la même catégorie). La grille re-trie par `(catégorie, sort, nom)`.
- **Assignation réelle** depuis l'action 🧭 : bouton "Assigner" sur chaque membre suggéré → popover de sélection de ticket (recherche, tickets de l'équipe non-done, libres en premier) → définit le membre comme `leader` via `updateTicket`.

## [3.11.1] - 2026-06-03

### Feat : Atlas — édition rapide du catalogue + import complet
- **Import** ([main.py](squad-board/main.py) `import_all`) : `skills`, `appetences`, `memberSkills`, `memberAppetences`, `mobility` sont désormais importés (merge/replace) — un import/export round-trip préserve toutes les données Atlas (testé, pas de doublon en merge).
- **Bouton ＋ permanent** dans le coin de la grille Skills Matrix → popover d'ajout rapide d'une compétence (nom, catégorie avec autocomplete, sélecteur de couleur), sans quitter la grille.
- **Édition d'une compétence/appétence** : clic sur l'en-tête de colonne → popover (renommer, changer catégorie/couleur, supprimer). Utilise les endpoints PUT existants.
- **Tooltip pédagogique** sur les niveaux 1-4 dans la légende (description du référentiel au survol) + rappel des raccourcis (clic = +1, clic droit = -1, double-clic faible = ticket skill-up).

## [3.11.0] - 2026-06-03

### Feat : Nouvelle vue **Atlas** — pilotage humain (carte unFIX + Skills Matrix + suivi mobilité)
Outil de coaching / RH / onboarding combinant 3 artefacts liés, accessible via le menu (raccourci `A`, icône `i-network`).

- **Backend** ([main.py](squad-board/main.py)) — 5 nouvelles tables + endpoints REST :
  - `Skill` / `Appetence` : catalogues (seed par défaut : 12 compétences réparties Frontend/Backend/DevOps/Agile + 6 appétences).
  - `MemberSkill` / `MemberAppetence` : niveau (1-4) et appétence (faible/neutre/forte) par **scope** `member` OU `team` (clé logique `scope|scopeKey|skillId`). Upsert idempotent ; `level=0` supprime l'entrée.
  - `MemberMobility` : 1 ligne de trajectoire par membre (équipe/rôle cible, potentiel, risque SPoF, plan, durée transition).
  - Intégrés dans `/api/export`.
- **Onglet Carte unFIX** ([atlas.js](squad-board/static/js/views/atlas.js)) — visualisation zoomable inspirée du framework unFIX :
  - 3 niveaux : Programme (bases/groupes) → Équipe (crews) → Membre (fiche + top 3 compétences).
  - Pastilles membres colorées, halo d'appétence dominante, breadcrumb, zoom/reset.
  - Clic membre → bascule sur la Skills Matrix focalisée. Synchronisé avec le filtre topbar (équipe/groupe).
- **Onglet Skills Matrix** — grille **entités × compétences** éditable :
  - Scope commutable **membre / équipe**. Référentiel niveaux : 1=exécutant spécialisé · 2=opérationnel structuré · 3=ingénieur cloud ready · 4=référent/architecte.
  - Cellule : clic = +1 niveau (cycle 0→4), clic droit = -1. Colonne appétences (cycle neutre/forte/faible).
  - Ligne **Couverture** (heatmap) en pied : moyenne + nb d'évalués par compétence, alerte sur les lacunes (SPoF).
- **Tableau de suivi de mobilité** (modal) — 1 ligne/collaborateur avec colonnes Équipe actuelle/cible, Rôle cible, Niveau, Potentiel, Appétence, Risque, Plan, Transition. Selects colorés, sauvegarde auto, **export CSV**.
- **Gestion du catalogue** (modal ⚙️) : ajouter / supprimer compétences et appétences, organisées par catégorie. État vide géré avec CTA.
- **Action A — ticket "montée en compétence"** : double-clic sur une cellule faible (niveau ≤ 2) → modal pré-remplie (titre `[Skill-up] …`, board cible, leader, plan), crée un ticket avec labels `skill-up` + slug compétence.
- **Action B — suggestions d'affectation** (🧭) : pour une compétence donnée, classe les membres par score = `niveau×25 − charge×8 − absence + appétence forte`. Top 8 avec médailles, charge (tickets actifs), alerte absence prochaine.
- **Appétences niveau équipe** affichées en tags sur les crews de la carte unFIX.
- Sauvegarde **optimiste** (store mis à jour avant l'API) pour une édition fluide.
- CSS dédié ([atlas.css](squad-board/static/css/atlas.css)), responsive < 900px.

## [3.10.80] - 2026-05-29

### Feat : Modal Démo — indicateur "Buffer" (nombre + somme des points)
- Nouvelle stat-card `.demo-stat--buffer` dans la grille de stats du Mode Démo ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - Valeur principale : `${bufferDone}/${bufferTotal}` (tickets Buffer terminés vs total).
  - Label : `🛡️ Buffer · ${bufferPtsDone}/${bufferPtsTotal} pts` (somme des Story Points).
  - Tooltip détaillé au survol.
- Visuel : gradient teal/sky (`#14b8a6 → #38bdf8`) pour distinguer du gradient or/rose de PI Predictabilité.
- N'apparaît que s'il y a au moins un ticket Buffer dans le sprint (label `Buffer` casse-insensible).

## [3.10.79] - 2026-05-29

### Feat : Modal détail ticket — nouveau field "Sprint(s)"
- Ajout d'un field full-width "Sprint(s)" dans la grille 3-colonnes ([modal.js](squad-board/static/js/components/modal.js)) — utile pour repérer en un coup d'œil le sprint courant d'un ticket et son historique (tickets reportés d'un sprint à l'autre).
- **Sources** ([_sprintsHistoryOfTicket](squad-board/static/js/components/modal.js)) :
  - `ticket.sprintName` → sprint courant côté JIRA (source de vérité).
  - `recentChanges` filtré sur `field === 'sprint'` → union des `from`/`to` (comma-separated) pour reconstituer les sprints historiques. Limité aux 8 derniers événements du changelog (cap sync).
- **Affichage** : chips ordonnées, sprint courant en premier avec `●` + couleur primary, sprints historiques avec `○` + style italique gris. Chip `piSprint` séparée (bordure dashed) à droite.
- État vide : `— Aucun sprint`.

## [3.10.78] - 2026-05-29

### Feat : Sprint sélectionné passé — tickets réels (Réalisations / À reporter / board Sprint)
- **Problème** : après [3.10.76], sélectionner un sprint passé via le picker rendait bien le bon header/dates, **mais** la liste "🏆 Réalisations" + "🔄 À reporter" (Sprint Review HTML et modal Démo) ainsi que les colonnes du board page Sprint étaient incohérentes — la base locale ne contient que les tickets `done` qui sont restés taggés sur ce sprint (les "à reporter" ont été retaggés sur le sprint suivant côté JIRA), donc la photo à la clôture était incomplète.
- **Fix** ([sprint_tickets_modal.js getSprintTicketsAsync](squad-board/static/js/components/sprint_tickets_modal.js)) — nouveau helper async exporté :
  - Sprint **actif/futur** → base locale (instantané, source de vérité).
  - Sprint **clos** (sprint.state === 'closed') → fetch JIRA `rest/agile/1.0/sprint/{id}/issue` (snapshot à la clôture = Done + reportés). **Cache module-level** par `team::jiraIds` → un seul fetch par sprint et par session.
  - Fallback transparent sur les tickets locaux si JIRA n'est pas configuré.
  - Toast informatif au premier fetch.
- **`openCurrentSprintReview` / `openCurrentSprintDemo`** désormais `async`, awaitent le helper avant de générer le HTML de la Sprint Review (nouvel onglet) / d'ouvrir la modal Démo. Couvre boutons header Sprint/Kanban + Ctrl+K (`open-sprint-review`, `open-demo-mode`).
- **Page Sprint** ([sprint.js](squad-board/static/js/views/sprint.js)) : quand l'utilisateur sélectionne un sprint clos dans le picker, on injecte le snapshot JIRA (via le même cache partagé). Pendant le fetch, un spinner discret `⏳ Chargement JIRA…` apparaît à côté du picker. Le board, l'activity feed et les charts ré-affichent automatiquement avec les tickets fraîchement chargés.
- **Champs JIRA enrichis** dans la lite-transformation : `resolutiondate`, `created`, `updated` (utiles pour burndown rétrospectif et cycle time des sprints clos).
- **Impact perf** : pour un sprint clos jamais consulté, +1 appel JIRA paginé (cap 20 pages × 100 = 2000 tickets). Cachée ensuite — re-pick du même sprint = instantané. Sprint actif et futur : aucun changement.

## [3.10.77] - 2026-05-29

### Feat : Sprint & Kanban — chip "jours dans la colonne" sur chaque ticket (signal daily)
- Objectif : repérer en un coup d'œil les tickets stagnant dans la même colonne pour alimenter la discussion du daily.
- **Helper** ([utils.js daysInCurrentColumn](squad-board/static/js/utils.js)) — calcule l'ancienneté dans la colonne courante. Sources, par priorité :
  1. Dernier changement `status` dans `recentChanges` (= entrée dans la colonne actuelle).
  2. `startedDate` (mise en cours JIRA) si jamais re-déplacé.
  3. `updatedAt` (fallback faible).
  Retourne `{ days, sinceIso, source }` ou `null`.
- **Affichage** ([card.js](squad-board/static/js/components/card.js)) — chip discret en haut à droite de la carte (à côté de l'ID ticket), forme `⏱ Xj`, tooltip `"X jours dans cette colonne · depuis <source> (date)"`.
- **Zones de couleur** (signal d'action) :
  - 🟢 vert `ok` : 2-3j
  - 🟡 ambré `warn` : 4-6j
  - 🔴 rouge `crit` : ≥ 7j (bold pour appeler l'œil)
- **Masqué** dans 2 cas — pour éviter le bruit :
  - statut `done` (peu actionable en daily)
  - < 2j (ticket fraîchement déplacé)
- Aucune impact perf : `recentChanges` est déjà fetché à la sync (changelog expand). Couvre Sprint **et** Kanban via le composant partagé `renderCard`.

## [3.10.76] - 2026-05-29

### Fix : Sprint Review (page HTML) + modal Démo — respect du sprint sélectionné
- **Symptôme** : depuis la page Sprint, sélectionner un sprint passé/futur via le picker, puis cliquer "Sprint Review" ou "Mode Démo" → la page/modale ouvrait toujours le **sprint actif** au lieu du sprint sélectionné.
- **Cause** ([sprint_tickets_modal.js _resolveCurrentSprint](squad-board/static/js/components/sprint_tickets_modal.js)) : le helper appelait directement `getSprintForTeam(team, sprintInfo)` qui renvoie systématiquement le sprint actif, sans consulter `store.sprintPick` (introduit en [3.10.74]).
- **Fix** : `_resolveCurrentSprint()` priorise désormais `store.sprintPick` :
  1. Si un pick est défini → cherche le sprint correspondant dans `sprintInfo.teamSprints` (filtré par équipe si team ≠ 'all') et le retourne avec `isCurrent: chosen.state === 'active'` (le badge "EN COURS" reste cohérent).
  2. Sinon → fallback `getSprintForTeam` (sprint actif de l'équipe).
- **Impact** : couvre simultanément `openCurrentSprintReview()` et `openCurrentSprintDemo()` (utilisés par boutons du header Sprint/Kanban + Ctrl+K entries `open-sprint-review` et `open-demo-mode`). Idem pour un lien partagé `#sprint/<team>/<sprintName>` (puisque le hash hydrate `store.sprintPick`).

## [3.10.75] - 2026-05-29

### Fix : Modal détail cachée derrière la modale "Tickets sans assigné·e" (et autres alertes)
- **Symptôme** : depuis la modale Health ("Tickets sans assigné·e", "Bloqués", etc.), cliquer un ticket ouvrait la modale détail mais elle était cachée derrière.
- **Cause** : `.alert-modal-overlay` et `.modal-overlay` ont le même `z-index: 200` (var(--z-modal)). L'alert-modal est créée dynamiquement et insérée à la fin du DOM → naturellement au-dessus de `#modal-overlay` (qui est dans l'HTML statique). Quand on ouvre la modal détail, elle reste plus bas dans la pile visuelle.
- **Fix** ([alert_modal.js](squad-board/static/js/components/alert_modal.js)) — au clic sur `[data-open-ticket]`, on ajoute la classe `above-demo` sur `#modal-overlay` avant d'appeler `openTicketModal`. La règle `.modal-overlay.above-demo { z-index: 11000 }` (introduite en [3.10.48] pour le même cas avec la Demo) force la modal détail au-dessus.
- Mécanisme désormais réutilisé : si une autre modale du même niveau a le même souci, suffit d'ajouter `above-demo` avant `openTicketModal`.

## [3.10.74] - 2026-05-29

### UX : Sélecteur de sprint dans le hash — URL partageable
- Le sprint sélectionné via le picker en haut de la page Sprint est désormais reflété dans l'URL : `#sprint/<team>/<sprintName>` → lien partageable qui ouvre directement le bon sprint.
- **Implémentation** :
  - **State** ([state.js](squad-board/static/js/state.js)) : nouvelle clé `sprintPick: null` (synchronisée avec le hash).
  - **Lecture** ([sprint.js](squad-board/static/js/views/sprint.js)) : helpers `_getSprintPick()` / `_setSprintPick(name)` lisent/écrivent `store.sprintPick` (remplace l'ancienne variable de module `_selectedSprintName`).
  - **Hash push** ([app.js pushHash](squad-board/static/js/app.js)) : pour `view === 'sprint'`, ajoute `/<sprintName>` après le team (encodé via `encodeURIComponent`). Si team='all' et qu'on a un pick → format `/all/<sprintName>` pour préserver la position du segment.
  - **Hash apply** ([app.js applyHash](squad-board/static/js/app.js)) : `parts[2]` sur view 'sprint' → `store.set('sprintPick', decoded)`. Si pas de `parts[2]` → reset à null (revient au sprint actif).
  - **Wireup picker** : `change` et clic `↺ Reset` appellent `_setSprintPick(...)` + `window.__squadBoard.pushHash()` → l'URL se met à jour immédiatement.
- L'URL devient un lien direct vers le sprint choisi (utile pour partager une review d'un sprint passé, par exemple).

## [3.10.73] - 2026-05-29

### Fix : Page Sprint — alertes "Sprint à X% du temps" muettes sur les sprints passés
- **Symptôme** : sur un sprint sélectionné d'il y a 4 mois, alerte "Sprint à 723% du temps mais seulement 0% des points" — non pertinent et bruyant.
- **Cause** ([infopanel.js getSprintAlerts](squad-board/static/js/components/infopanel.js)) : le `timePct` n'était pas borné. Le ratio `(now - start) / (end - start)` peut atteindre 800-900% pour un sprint de 14 jours vieux de 4 mois. Toutes les alertes "temps vs pts" se déclenchaient même hors période active.
- **Fix** :
  - **`timePct` borné** à `[0, 100]` (cohérence avec l'affichage de la card sprint déjà borné).
  - Calcul du statut temporel : `isActive` (now ∈ [start, end]), `isFuture` (now < start), `recentlyEnded` (< 7j après fin).
  - **Alertes "temps vs pts" déclenchées UNIQUEMENT si `isActive`** : aucune pertinence sur un sprint terminé ou futur.
  - **Alerte "Sprint terminé"** désormais affichée seulement si fin < 7j (au lieu de toujours pour `timePct >= 100`). Évite le bruit "Sprint terminé - pensez à la démo et à la rétro" sur un sprint d'il y a 4 mois.

## [3.10.72] - 2026-05-29

### UX : Ctrl+K — entrée "Ouvrir la modale Démo" plus facile à trouver
- L'entrée `open-demo-mode` existait déjà mais ses mots-clés (`demo presentation tv fullscreen sprint review`) ne couvraient pas les recherches utilisateur courantes (`modal`, `modale`, `ouvrir`, `écran`, `plein écran`…).
- **Fix** ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js)) :
  - **Label** : `Mode Démo fullscreen…` → `Ouvrir la modale Démo (présentation TV fullscreen)` — démarre par "Ouvrir" (verbe d'action) et inclut "modale" (terme cherché).
  - **Mots-clés** enrichis : `demo démo modal modale ouvrir afficher presentation présentation tv écran fullscreen plein sprint review burnup velocity vélocité mood fist` — couvre les recherches en FR/EN, par contenu (burnup, vélocité, mood), et par contexte (sprint review).
  - Idem pour `open-sprint-review` (ajout de `ouvrir modale` aux mots-clés).
- Désormais une recherche `modal`, `démo`, `écran`, `présentation` ou `burnup` retrouve l'entrée.

## [3.10.71] - 2026-05-29

### Feat : Page Sprint — sélecteur de sprint (PI N-1 / N / N+1) + WIP Age transparent
- **Sélecteur de sprint** en haut de la page Sprint ([sprint.js](squad-board/static/js/views/sprint.js)) :
  - Liste déroulante avec **groupes `<optgroup>`** par PI : `PI N-1 · précédent`, `PI N · courant`, `PI N+1 · à venir`
  - Badge état devant chaque sprint : `●` actif, `✓` clôturé, `○` à venir
  - **Sprint actif sélectionné par défaut**. Le choix de l'utilisateur est en variable de module (reset à chaque reload).
  - Bouton `↺ Sprint actif (XXX)` apparaît si on a basculé sur un autre sprint pour revenir rapidement.
  - Source : `sprintInfo.teamSprints` (déjà fourni par la sync JIRA, filtré par équipe sélectionnée + dédup par nom si team='all').
  - Si moins de 2 sprints dispo → sélecteur masqué (pas pollution UI).
- **WIP Age** ([charts.js renderWIPAge](squad-board/static/js/components/charts.js)) :
  - **Tooltip enrichi** par barre : `Age : Xj (critique 🔴) · Démarré le YYYY-MM-DD (mise en cours / création / fallback) · Statut · Lead · Seuils utilisés · Référence (p85 calculé OU fallback fixe)`.
  - **Coloration claire** : 🟢 vert OK · 🟡 ambré attention (≥ 70% p85) · 🔴 rouge critique (≥ p85).
  - **Fallback** quand p85 non calculable (< 3 tickets done) : seuils fixes 🟡≥7j / 🔴≥14j (Kanban classique).
  - **Légende sous le chart** : 3 swatches avec leurs significations affichées en permanence (plus besoin de deviner).
  - Tooltip dans le card-header `ⓘ comment ça marche` qui explique le calcul (`age = jours depuis mise en cours`, seuils, etc.) au survol.
  - Identique sur la vue Kanban (légende compacte).

## [3.10.70] - 2026-05-29

### UX : Sprint Review — "À reporter" trié par statut puis feature
- La section `🔄 À reporter au prochain sprint` était une liste plate non triée → difficile de scanner.
- **Tri intelligent** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) :
  1. **Statut** : `blocked` → `inprog` → `review` → `test` → `todo` → autres
  2. **Feature parente** (alpha) au sein de chaque statut
  3. **Points décroissants** (les gros tickets d'abord)
- **Regroupement visuel** par statut, réutilise le composant `.wins-group` (bordure gauche colorée par catégorie) :
  - 🚫 Bloqués (rouge) — priorité absolue
  - 🔄 En cours (bleu)
  - 👁 En review (violet)
  - 🧪 En test (ambré)
  - ⏸ À faire (gris)
- Compteur par groupe. Groupe vide → masqué. Permet de viser directement les blockers en réunion sans scroller.

## [3.10.69] - 2026-05-29

### Fix : Modal Demo — background gradient s'étend jusqu'en bas même au scroll
- `.demo-mode-bg` était positionné en `absolute inset: 0` dans `.demo-mode-overlay` (position fixed) → couvrait uniquement le viewport. Quand le contenu débordait et qu'on scrollait, le bas du contenu apparaissait sur fond uni `#0f172a` sans les radial-gradients.
- **Fix** :
  - HTML ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) : `.demo-mode-bg` déplacé **dans** `.demo-mode-content` (qui grandit avec le scroll).
  - CSS ([views.css](squad-board/static/css/views.css)) : `.demo-mode-bg` reste `position: absolute` mais à l'intérieur de `.demo-mode-content` (déjà `position: relative`) → couvre toute la hauteur scrollée. `pointer-events: none` pour ne pas bloquer les clics, `z-index: 0`. Les autres enfants directs (`> *:not(.demo-mode-bg)`) reçoivent `position: relative; z-index: 1` pour passer au-dessus.

## [3.10.68] - 2026-05-29

### UI : Modal Demo Réalisations — passage de grid à CSS multi-column
- `.demo-wins-grid` n'est plus en `display: grid` mais utilise **CSS multi-column** (`column-count: 3` · `column-gap: 8px` · `column-fill: balance`).
- Les cards remplissent désormais la **colonne 1 d'abord** (du haut vers le bas), puis la colonne 2, etc. — au lieu de la distribution row-major du grid (row1: col1/col2/col3, row2: …).
- `.demo-win-card` : `break-inside: avoid` (ne se coupe pas entre 2 colonnes), `display: inline-block; width: 100%` (nécessaire dans une multi-column).
- Responsive : 3 cols → 2 cols ≤ 1400px → 1 col ≤ 900px.

## [3.10.67] - 2026-05-29

### UI : Modal Demo Réalisations — cards collées (zéro espace vertical)
- `.demo-wins-grid` : `gap: 0 8px` au lieu de `6px` (row-gap = 0, column-gap = 8px) → les cards d'une même colonne sont **contiguës**, l'utilisateur voit plus de tickets par hauteur.
- Hover ajusté : suppression du `translateY(-1px)` (créait un chevauchement visuel avec la card du dessus), remplacé par un changement de **fond bleuté + bordure primary** + `z-index: 1` pour faire ressortir la card survolée sans la déplacer.

## [3.10.66] - 2026-05-29

### UI : Modal Demo Réalisations — cards compactées (gain ~40% de hauteur)
- Espace excessif entre les tickets de "🏆 Réalisations" — compacté à plusieurs niveaux ([views.css](squad-board/static/css/views.css)) :
  - `.demo-wins-grid` : `gap: 12px → 6px` · `padding: 4px → 2px`
  - `.demo-win-card` : `padding: 14px 16px → 7px 10px` (vertical -50%) · `border-radius: 12 → 8` · transition plus courte
  - `.demo-win-top` : `margin-bottom: 8 → 3` · `gap: 8 → 6`
  - `.demo-win-icon` : `20 → 16 px`
  - `.demo-win-key` : `12 → 11 px`
  - `.demo-win-pts` : `padding: 2/10 → 1/8` · `font-size: 14 → 12`
  - `.demo-win-title` : `font-size: 14 → 13` · `line-height: 1.4 → 1.3`
  - `.demo-win-parent-chip` : `padding: 3/9 → 1/8` · `margin-top: 6 → 3` · `font-size: 11 → 10`
- Chaque card est ~30 % moins haute, le grid est plus dense → 4-5 cards visibles d'un coup d'œil sans scroller au lieu de 2-3.
- Hovers raccourcis (translate -1px au lieu de -2px) — plus subtil, cohérent avec la taille réduite.

## [3.10.65] - 2026-05-29

### Fix : Modal Demo — scroll autorisé si contenu déborde (petits écrans / Wins très haut)
- Le fix [3.10.59] avait mis `overflow: hidden` sur `.demo-mode-content` → impossible de voir le bas (burnup + vélocité PI) sur petits écrans / écrans avec beaucoup de PI Objectives.
- **Fix** :
  - [views.css](squad-board/static/css/views.css) `.demo-mode-overlay` : `overflow-y: auto` (+ `overflow-x: hidden`) → scroll vertical au niveau de l'overlay fullscreen si le contenu dépasse la viewport. `-webkit-overflow-scrolling: touch` pour scroll fluide iOS.
  - `.demo-mode-content` : passe de `height: 100%` à `min-height: 100%` (peut grandir au-delà), retire le `overflow: hidden`.
  - `.demo-2col` : `flex: 1 1 auto` (au lieu de `1 1 0`) → prend sa taille naturelle, ne shrink pas indéfiniment.
  - `.demo-burnup-chart` : `min-height: 200px` (au lieu de `0`) — garantit qu'il est toujours lisible, même quand on doit scroller.
- **Comportement** :
  - **Grand écran** : tout fit, aucune scrollbar visible (gain UX du fit screen préservé).
  - **Petit écran ou contenu volumineux** : scroll global de l'overlay → l'utilisateur voit tout (burnup, vélocité PI, réalisations).

## [3.10.64] - 2026-05-29

### UI : Page Sprint — header restructuré (progress en bas pleine largeur, quick-actions à droite des stats)
- Avant : la progress bar était sous les stats dans la colonne droite, et les quick-actions (📋 Review + 📺 Demo) étaient empilées en dessous.
- Refonte ([sprint.js](squad-board/static/js/views/sprint.js) + [views.css](squad-board/static/css/views.css)) :
  - **Quick-actions à droite des stats** : la colonne stats passe en `flex-direction: row` avec `justify-content: space-between` → les stats restent à gauche, les boutons sont collés à droite sur la même ligne.
  - **Progress bar full-width en bas** : `<div class="progress sprint-progress-full">` sortie de la colonne stats et placée en sibling du `.sprint-header--2col` avec `grid-column: 1 / -1` (span sur les 2 colonnes).
- La page Sprint se compacte verticalement (header plus dense) et la progress est plus visible (pleine largeur visuelle).

## [3.10.63] - 2026-05-29

### Fix : Page Sprint — Sprint Goal ne se tronque plus
- `.sprint-header--2col .sprint-goal-bar` avait `white-space: nowrap` + `text-overflow: ellipsis` → le goal était coupé à `…` sur une ligne.
- Remplacé par `white-space: pre-wrap` + `word-break: break-word` + `line-height: 1.4` → le goal s'affiche en intégralité, wrap sur plusieurs lignes si nécessaire. Padding vertical légèrement augmenté (4px → 6px) pour la respiration.

## [3.10.62] - 2026-05-28

### Fix : Lien "🚀 PI N+1" Sprint Review — JQL `sprint IN ("PI#N+1")` au lieu de `fixVersion`
- Le bouton `🚀 PI {N+1}` pointait sur `/projects/G/queues?jql=fixVersion=PI30` — dépendait d'un projet inexistant (`G` extrait du nom d'équipe) et utilisait `fixVersion` qui n'est pas la convention de planification SAFe locale.
- **Fix** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) — nouveau JQL : `sprint IN ("PI#30")` (convention features SAFe, cf. CLAUDE.md). URL pleine `/issues/?jql=...` (au lieu de `/projects/.../queues`) — la recherche issue globale Jira fonctionne sur tous les projets sans préfixe. JQL encodé via `encodeURIComponent`.
- Tooltip enrichi : affiche le JQL exact qui sera exécuté (`&#10;` pour saut de ligne dans `title`).

## [3.10.61] - 2026-05-28

### UX : Météo équipe — tooltip transparent avec breakdown du calcul
- Le tooltip de la card Météo affichait juste `mood X/5 · N bloqués · scope creep N` — on ne savait pas comment le score `/100` était calculé.
- **Détail complet** ([dashboard.js](squad-board/static/js/views/dashboard.js)) — le tooltip liste maintenant chaque pénalité ligne par ligne avec l'opération appliquée :
  ```
  MÉTÉO ÉQUIPE — 65/100  (Quelques nuages)

  Score de base : 100
  🚫 Blockers : 2 (> 0)  →  -10
  ✅ Scope creep : 1  →  ±0
  🎭 Mood : 3.2/5 (< 3.5)  →  -10
  ✅ Vélocité : 32/40 pts (80% cible)  →  ±0

  Seuils : ☀️ ≥85  ·  ⛅ ≥65  ·  🌧️ ≥45  ·  ⛈️ <45
  ```
- Chaque ligne montre la valeur observée, le seuil franchi (ou pas), et l'impact sur le score. Les seuils d'icône (☀️/⛅/🌧️/⛈️) sont rappelés en bas.

## [3.10.60] - 2026-05-28

### Fix : Sync JIRA — descriptions ActionRetro tronquées (paragraphes manquants au début)
- **Diagnostic** : sur GDEM-4071, la description JIRA contenait 3 nodes ADF (paragraphe `💥 Problématique :` + paragraphe `👉 But :` + bulletList) mais seul le `<ul>` apparaissait en local. Investigation via curl proxy : le nouvel endpoint **JIRA Cloud `/rest/api/3/search/jql` ne renvoie PAS le champ `description`** même quand on le demande explicitement (limitation API non documentée).
- **Fix** ([sync.js passe Amélioration](squad-board/static/js/sync.js)) — `fields: '*all'` au lieu de la liste explicite pour la passe Amélioration continue (qui couvre les ActionRetro / Retro / Postmortem / CoP). Payload plus lourd mais volume faible (~50 tickets max). Garantit que la description complète arrive.
- **Note pour ajouter** : si d'autres types de tickets ont besoin de leur description complète, étendre `*all` aux passes correspondantes.

### Feat : Sprint Review HTML — PNG, PDF, Décisions éditables, lien PI Planning suivant
- **Bouton 📷 PNG** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) — html2canvas chargé à la demande via CDN, capture pleine page + download automatique. Nommage du fichier : `sprint-review-<sprint-slug>.png`.
- **Bouton 🖨 PDF** — déclenche `window.print()`. Le `@media print` existant produit déjà un PDF propre.
- **Section "Décisions" éditable** — `contenteditable=true` sur `.notes-zone`, persistance localStorage par sprint name (`cr-decisions-<sprint>`), debounce 400 ms. Placeholder italique si vide.
- **Bouton 🚀 PI {N+1}** — lien direct vers Jira `queues?jql=fixVersion=PI{N+1}` pour amorcer le PI Planning suivant. Affiché uniquement si `piInfo.number` est défini.

### Feat : Ctrl+K — 7 templates Slack par rituel
- 7 nouvelles entrées dans la command palette ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js)) : `🌅 Daily standup`, `🎬 Sprint Review / Démo`, `🔁 Rétrospective`, `🚨 Blocker / besoin d'aide`, `🎭 Mood Meter`, `✊ Fist of Five`, `🚀 PI Planning à venir`.
- Helper `_copySlackTpl(kind)` génère un message **texte brut** (pas de mrkdwn) avec variables auto : nom sprint actif, équipe, date du jour. Copie automatique dans le presse-papier + toast.

### Feat : Dashboard — Météo équipe + Mood/Fist chips + "Cette semaine"
- **Météo équipe** ([dashboard.js](squad-board/static/js/views/dashboard.js)) — 5e card metric (☀️/⛅/🌧️/⛈️) avec score `/100` calculé à partir de : blockers (-25 si >3, -10 si >0), scope creep (-20 si >5, -10 si >2), mood moyen (-25 si <3, -10 si <3.5), vélocité vs cible (-15 si <50%). Labels : Tout va bien / Quelques nuages / Pluie battante / Orage.
- **Mood/Fist chips** dans le sprint-header — pattern identique à la Modal Demo, filtre tolérant sur `piSprint`. Border-color liée à la valeur (vert/orange/rouge selon seuil).
- **Section "Cette semaine"** ([dashboard.js](squad-board/static/js/views/dashboard.js)) — 5 cards horizontales (J-4 à J0) avec : nombre de tickets résolus chaque jour + points associés. Intensité du fond proportionnelle au volume (gradient sur var(--success)). Card du jour mise en avant avec border primary + halo.
- (Burndown live + RUN/BUILD #3 reportés — demandent une convention de label `run`/`build` à confirmer avec l'équipe avant impl.)

### Feat : Health — courbe historique du score sur 3 mois
- `HEALTH_HIST_MAX` étendu de 30 à **90 jours** (1 snapshot/jour, persistance localStorage `sb-health-history`).
- Nouvelle card `📈 Évolution sur N jours` ([health.js](squad-board/static/js/views/health.js)) entre la capacité et les cards d'anomalies.
- **KPIs** : moyenne, min, max, delta vs premier point (avec ↗/↘ et badge coloré).
- **SVG inline** (pas de Chart.js, plus léger) — courbe area + ligne avec :
  - 4 bandes de fond (good ≥80 / ok ≥60 / warn ≥40 / bad <40) pour interpréter le niveau au coup d'œil
  - Lignes pointillées sur 0, 50, 100
  - Point final mis en valeur avec halo blanc
  - Labels de dates aux extrémités (jj-mm)
  - Gradient bleu pour l'aire

## [3.10.59] - 2026-05-28

### UI : Modal Demo — fit hauteur viewport (seul .demo-wins-grid scrolle)
- **Garanties** :
  - `.demo-mode-content` : `overflow: hidden` + `display: flex column` + `height: 100%` — jamais de scroll global, peu importe le device.
  - Sections fixes (`header`, `.demo-stats`, `.demo-pi-objectives`, `.demo-footer`) → `flex-shrink: 0`.
  - `.demo-2col` → `flex: 1 1 0; min-height: 0` (prend tout le reste).
  - `.demo-wins-grid` → seule à scroller (overflow-y: auto, déjà présent).
- **Cap PI Objectives** : `max-height: 28vh` + scroll interne fin (4 px) si beaucoup d'objectives — évite qu'ils écrasent le 2col.
- **Burnup chart** : `min-height: 0` (au lieu de `280px`) qui forçait un scroll global sur écrans bas. La min-height de 240 px ne s'applique plus que ≥ 800 px de viewport.
- **Padding compressé** : `28/40/16` (au lieu de `48/56/32`) → -36 px gagnés en hauteur sur toutes tailles.
- **Responsive serré** :
  - `@media (max-height: 720px)` → padding `20/28/12`, gap réduit, stats compactes, PI obj cap à `22vh`.
  - `@media (max-width: 900px)` → padding `18` côté.

## [3.10.58] - 2026-05-28

### UI : Modal Demo — Mood inline dans la goal-card, Fist inline avec pi-summary
- Suppression de la section dédiée `🎭 Climat équipe` (devenue redondante avec le nouvel emplacement contextuel).
- **🎭 Mood Meter** déplacé dans la **goal-card** (chip discret en bas), juste sous le sprint goal — l'humeur d'équipe à côté de l'objectif qu'on a poursuivi : sens visuel. Si pas de goal mais Mood présent → label `Aucun objectif explicite` + Mood en dessous, la card reste utile.
- **✊ Fist of Five (confiance PI)** déplacé inline à droite de la **pi-summary**, dans le h2 de `🎯 PI Objectives` — emplacement sémantique (confiance dans les objectifs du PI).
- **Style discret** ([views.css](squad-board/static/css/views.css)) — chips arrondis (`border-radius: 999px`) avec :
  - Icône (🎭 ou ✊) + face emoji (Mood) + valeur en gras (`4.2/5`) colorée par seuil
  - **5 mini-bars** verticales ultra-compactes (4 px de large, 14-16 px de haut) montrant la distribution proportionnelle au max
  - Compteur de votes séparé par une bordure verticale subtile
  - Fond `rgba(255,255,255,0.05)` + bordure faible → s'intègre sans dominer
- Tooltips par mini-bar pour le détail (`🙂 4/5 : 3 votes` / `4/5 (Confiant) : 3 votes`).

## [3.10.57] - 2026-05-28

### UI : Climat équipe (Modal Demo) — layout compact horizontal
- Le précédent layout des cards Mood/Fist était vertical (score géant centré + 5 lignes de distribution empilées) → prenait ~140 px de hauteur par card. Trop sur la modal Demo.
- **Refonte** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) + [views.css](squad-board/static/css/views.css)) — layout **horizontal compact** (~52 px par card) :
  - `[Icône] Titre + count`   (à gauche)
  - `[Face emoji] 4.2/5`  (score inline au milieu)
  - `[5 mini-bars verticales]` (distribution à droite, 38 px haut, une barre par valeur 1-5 avec count en haut + label en bas)
- Les mini-bars : hauteur proportionnelle au max de la distribution (au lieu du % du total) → mieux différencier les valeurs faibles.
- Tooltips par barre (`Mood : 4/5 : 3 votes` ou `Fist : 4/5 (Confiant) : 2 votes`).
- Padding réduit, font-sizes réduites, h2 plus compact (`14px` au lieu de `16px`).
- Layout préservé sur la Sprint Review HTML (palette papier, distribution lisible en print) — la refonte ne touche que la Modal Demo.

## [3.10.56] - 2026-05-28

### UI : Climat équipe forcé sur 2 colonnes (Mood gauche · Fist droite)
- `.demo-climate-grid` (modal Demo) et `.vote-grid` (Sprint Review HTML) passent de `auto-fit minmax(260px, 1fr)` à `1fr 1fr` — les 2 cards Mood et Fist of Five sont **toujours côte à côte** (au lieu de potentiellement empilées sur écran intermédiaire).
- Responsive : sous 760px (Demo) / 700px (Review HTML) → retour à 1 colonne pour mobile.
- Fist of Five reste explicitement labellisé `Fist of Five — confiance PI` (lien sémantique avec les PI Objectives).

## [3.10.55] - 2026-05-28

### Fix : Mood absent + Climate chevauchait la sparkline vélocité (Modal Demo)
- **Bug #1 — Mood ne s'affichait pas** dans la page Sprint Review (seul Fist apparaissait) : le filtre `v.piSprint === _sprintLabel` était trop strict. Le champ `piSprint` des votes peut contenir `"29.3"`, `"Fuego - Ite 29.3"`, `"PI#29"` selon la saisie utilisateur — un seul format passait le filtre par hasard pour les fistVotes mais pas pour les moodVotes.
  - **Fix** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) — helper `_matchVoteSprint(vps)` tolérant :
    1. `vps === sprint.name` (exact)
    2. `vps === sprintLabel` ou `vps.includes(sprintLabel)` (match partiel sur `29.3`)
    3. Inclusion bidirectionnelle (`vps.includes(sprint.name)` ou `sprint.name.includes(vps)`)
  - Appliqué dans `_buildSprintReviewHtml` ET `openDemoMode` (helpers `_matchVoteSprint` / `_matchDemoVoteSprint`).
  - Log console `[SprintReview] mood=N fist=M sprint="..." label="..." team="..."` pour diagnostic rapide.
- **Bug #2 — Climate chevauchait la sparkline vélocité PI** dans la modal Demo : la section `.demo-climate` était positionnée **après** le `.demo-2col` (qui a `flex: 1` et prenait toute la hauteur disponible). Résultat : Climate poussé en dehors du viewport ou superposé visuellement avec la sparkline en bas du panel Burnup.
  - **Fix** — Climate déplacé **avant** le `.demo-2col` (juste après PI Objectives, juste avant Burnup + Wins). Hiérarchie verticale claire :
    1. Header
    2. Stats
    3. PI Objectives
    4. **🎭 Climate** (nouveau placement)
    5. 2col Burnup ↔ Wins
  - Plus de chevauchement, le flow vertical reste linéaire.

## [3.10.54] - 2026-05-28

### Feat : Réalisations fusionnées + Mood/Fist intégrés (Demo, Sprint Review, Slack)
- **Fusion des 3 groupes Réalisations** (Tickets + Buffer + Actions rétro) en **un seul bloc plat** trié par feature parente :
  - **Sprint Review HTML** : un seul `<ul class="cr-tickets-merged">` au lieu des 3 groupes empilés. Badges récap dans le titre (`🏆 Réalisations [N tickets · X pts] [🛡️ Buffer Y/Z] [🔁 Retro N]`).
  - **Slack copier** : un seul bloc `🏆 Réalisations (N tickets · X pts) · 🛡️ Buffer Y/Z · 🔁 Retro N` puis liste plate (top 15).
  - **Modal Demo** : les cards `.demo-win-card` sont mélangées dans une seule grille à 3 colonnes (déjà en place), avec un **tag inline** `🛡️` ou `🔁` à côté de la clé pour identifier la catégorie. Plus de sections `.demo-wins-group-*`.
- **Climat équipe (Mood + Fist) intégré** dans les 3 sorties :
  - **Filtrage** : votes filtrés par `sprintLabel` (extrait par regex `\d+\.\d+`) et `team` (si différent de `'all'`).
  - **Stats calculées** : moyenne (1 décimale), nombre de votes, distribution par valeur 1-5.
  - **Modal Demo** : section `🎭 Climat équipe` en pleine largeur sous le grid 2-col. Card par vote-type avec score géant (avec emoji-face pour le mood), distribution barres horizontales colorées (vert ≥4, orange ≥3, rouge <3), et labels Fist (`Pas confiance / Inquiet / Mitigé / Confiant / Très confiant`).
  - **Sprint Review HTML** : section `🎭 Climat de l'équipe` avec le même rendu (palette claire pour print).
  - **Slack** : résumé compact `🎭 Climat équipe / • Mood : 🙂 4.2/5 (8 votes) / • Fist of Five (confiance PI) : 3.8/5 (8 votes)`.
- **CSS** ([views.css](squad-board/static/css/views.css) + inline Sprint Review) : `.demo-vote-card/.vote-card`, `.demo-vote-dist/.vote-dist`, `.demo-win-tag--buffer/--retro` (badges inline sur les cards Réalisations).

## [3.10.53] - 2026-05-28

### UX : Copier Slack — liens JIRA cliquables + tirets simples
- **Tickets cliquables** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) : chaque clé de ticket devient un lien Slack `<jiraUrl/browse/ID|ID>` (format interprété par Slack même au paste, contrairement au mrkdwn). Le user clique directement sur la clé pour ouvrir le ticket JIRA.
- Helper `_slackKey(id)` qui produit `<URL|ID>` si `jiraBase` est configuré, sinon retourne l'ID brut (fallback gracieux).
- **Tirets longs `—` remplacés par `-`** partout dans le texte Slack (header, métriques titres, lignes de tickets, "À reporter", etc.) — plus lisible et conforme à la demande.
- `…` (ellipse Unicode) remplacé par `...` (3 points ASCII).

## [3.10.52] - 2026-05-28

### Fix : Copier Slack — texte brut (pas de mrkdwn, Slack n'interprète pas au paste)
- Le bouton "Copier pour Slack" produisait du mrkdwn (`*gras*`, `_italique_`, `` `code` ``) — mais Slack n'interprète ces marqueurs **qu'à la frappe**, pas au paste. Résultat : les caractères `*` `_` apparaissaient littéralement dans le message.
- **Fix** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) — réécriture en **texte brut pur** :
  - Suppression de tous les `*` `_` `` ` `` `>` (blockquote)
  - Aération via emojis, sauts de ligne et **indentation 3 espaces** pour les sous-items
  - Listes avec `   • ` (bullet U+2022)
  - `🚨` Unicode au lieu du `:rotating_light:` shortcode
- L'utilisateur peut désormais coller directement dans Slack sans nettoyage manuel. Pour mettre en gras des passages, il fait Ctrl+B à la frappe.

## [3.10.51] - 2026-05-28

### Feat : Sprint Review — bouton "Copier pour Slack" en haut (résumé aéré, mrkdwn)
- Nouvelle toolbar **sticky** en haut de la page Sprint Review avec un bouton aux couleurs Slack (purple `#4A154B`).
- Au clic, copie dans le presse-papier un **résumé Slack-friendly aéré** (Slack mrkdwn — `*gras*`, `_italique_`, `\`code\``, `• puces`) :
  - Titre + équipe + dates
  - 🎯 Sprint Goal (en blockquote)
  - 📊 Métriques (vélocité, % terminés, buffer)
  - 🎯 PI Objectives summary (N/M livré, BV, Predictability%)
  - 📈 Vélocité PI (moy. clos, record, vs cible)
  - 🏆 Réalisations par groupe (🎫 Tickets / 🛡️ Buffer / 🔁 Actions rétro) — **top 5** par groupe + `…et N autres` si plus
  - 🔁 Actions rétro non clôturées (top 10) à passer en revue
  - 🔄 À reporter (avec mention `:rotating_light:` si blockers non résolus)
  - ⚠️ À discuter en rétro OU 👍 Sprint propre
- **Feedback visuel** : le bouton bascule en vert `✓ Copié dans le presse-papier !` 2.4s puis revient à son état initial. En cas d'erreur clipboard : `Copie impossible` rouge.
- Implémentation 100% **self-contained** : la string est générée au build du HTML et embarquée via `JSON.stringify` dans un `<script>` inline. Pas de dépendance externe au moment où la page s'ouvre.
- `@media print { .cr-toolbar { display: none } }` — le bouton ne pollue pas l'impression.

## [3.10.50] - 2026-05-28

### Feat : Sprint Review — section "Actions rétro à passer en revue" dépliable
- Nouvelle section ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) insérée **au-dessus** de `🔄 À reporter au prochain sprint` :
  - Titre `🔁 Actions rétro à passer en revue (N)` avec intro `« Tour de table : où en est-on sur chaque action issue des rétros précédentes ? »`
  - Liste **toutes les ActionRetro du sprint** (peu importe le statut), triées : pas-encore-done d'abord (en cours, bloquées, à faire), done à la fin — facilite l'ordre du tour de table.
  - Chaque item est une card avec **header en ligne** : badge statut coloré (`✓ Terminée` vert, `✗ Bloquée` rouge, `● En cours` bleu, `○ À faire` ambré), lien JIRA, titre, owner, chip feature parente.
  - **Card colorée par statut** (fond + bordure gauche 4px) — repérage visuel rapide.
- **Description dépliable** : chaque item a un `<details>` `📝 Voir la description` (fermé par défaut pour ne pas alourdir la lecture) :
  - Chevron animé (`▸` → `▾`) à l'ouverture
  - Contenu en serif Georgia (cohérent avec le style document) sur fond blanc avec bordure
  - `white-space: pre-wrap` + `word-break: break-word` pour préserver mise en forme et URLs longues
  - Support natif pour HTML (description parsée par JIRA sync) ET texte brut (les retours à la ligne sont conservés)
- L'utilisateur peut déplier les descriptions une par une pendant la review ou ouvrir toutes avant impression.

## [3.10.49] - 2026-05-28

### Feat : Sprint Review HTML enrichie (parité avec la Modal Demo)
- La page Sprint Review (compte-rendu Confluence-ready ouvert en nouvel onglet) gagne **3 nouvelles sections** synchronisées avec le mode Démo :
  - **🎯 PI Objectives** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) — grid des objectives du PI courant filtrés par équipe (ou tous si team=all). Code couleur par statut (done=vert gradient avec ✓ cerclé, inprog=bleu, blocked=rouge, stretch=dashed). Badge récap : `✓ N/M · BV livrée X/Y · Predictability %`. Badge BV ambré→orange sur les done.
  - **📈 Vélocité PI** — mini velocity-card avec KPIs (moy. clos, ⭐ record, 🎯 vs cible) + **sparkline horizontal** (style barres avec dégradés vert/bleu/ambré). Sprint actif détecté → vélocité **live** calculée depuis les tickets locaux (cf. fix [3.10.47]). Sprint de respiration marqué 🍃. Légende avec 5 swatches.
  - **🏆 Réalisations regroupées** (au lieu de liste plate) en 3 groupes : `🎫 Tickets` (bleu), `🛡️ Buffer` (violet), `🔁 Actions rétro` (orange). Filtres exclusifs (ActionRetro prioritaire). Compteur + total points par groupe. Tickets **triés par feature parente** (alpha). Chaque ticket affiche une **chip feature parente** discrète (🧭 nom complet non tronqué).
- **Helpers communs** entre Demo et Review (résolution feature parente, calcul vélocité live, identification sprint respiration) — code dupliqué pour rester self-contained dans le HTML offline (pas de dépendance externe au moment d'ouvrir dans Confluence).
- **CSS print-friendly** : palette claire (compatible papier/Confluence), `break-inside: avoid` sur cards/objectives/wins-group, sparkline reste lisible en N&B.
- **Pas de Chart.js** : tout est SVG/divs inline-block — la page reste autonome (blob URL).

## [3.10.48] - 2026-05-28

### Fix : Modal ticket s'ouvrait derrière la modal Demo (conflit z-index)
- **Symptôme** : cliquer une clé de ticket ou une chip parente dans les Réalisations du sprint ouvrait la modal détaillée **derrière** la modal Demo (fullscreen dark).
- **Cause** : `.demo-mode-overlay` z-index `10000` vs `.modal-overlay` z-index `200` (`var(--z-modal)`).
- **Fix** :
  - [sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) — au click ticket depuis la Demo, on ajoute la classe `above-demo` au `#modal-overlay` avant d'appeler `openTicketModal`.
  - [base.css](squad-board/static/css/base.css) — nouvelle règle `.modal-overlay.above-demo { z-index: 11000 }` qui force la modal détail au-dessus de la Demo (10000 < 11000).

## [3.10.47] - 2026-05-28

### Fix : Modal Demo — vélocité live pour le sprint en cours (sprint actif = 0 affiché)
- **Symptôme** : sur Gabbiano, la barre du sprint en cours affichait `0 pts` alors que plusieurs tickets étaient en `Terminé` ou `À livrer en Préprod` (statuts mappés vers `done` côté frontend).
- **Cause** : `teamSprints[].velocity` est rempli côté sync.js depuis l'endpoint JIRA Greenhopper `/board/{id}/velocity` qui ne renseigne `completed.value` **qu'à la clôture du sprint**. Pour un sprint actif, l'API renvoie 0 → la barre affichait 0.
- **Fix** ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) — calcul **live** pour chaque sprint sans vélocité JIRA :
  ```
  liveDone = tickets.filter(t.sprintName === s.name && t.status === 'done' && t.team === s.team)
                    .reduce((sum, t) => sum + t.points, 0)
  ```
  Si > 0, on remplace `s.velocity` et on marque `s._live = true`. Les sprints clôturés gardent la valeur JIRA (préservée).
- **Tooltip enrichi** : `12 pts (calculé live depuis les tickets)` quand la vélocité est dérivée localement, vs `12 pts` quand elle vient de JIRA.
- Couvre aussi le cas où le sprint courant a tous ses tickets en `À livrer en Préprod` (mapping STATUS_MAP → `done` déjà OK).

## [3.10.46] - 2026-05-28

### UX : Modal Demo — vélocité dans la barre, sprint goal au hover, PI Objectives "wow"
- **Vélocité affichée dans la barre** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) + [views.css](squad-board/static/css/views.css)) — chaque barre du sparkline montre désormais le nombre de points :
  - Si la hauteur de la barre est ≥ 22 % → label `INSIDE` (texte blanc + text-shadow, en haut de la barre)
  - Sinon → label `ABOVE` (texte gris muted, au-dessus de la barre)
  - Tabular numerics, font-weight 700 pour alignement parfait
- **Sprint Goal dans le tooltip** — le `title` natif inclut maintenant `🎯 <goal>` sur une nouvelle ligne quand la rotation porte un goal. Format final : `nom · X pts · état\n🎯 goal`. Source : `teamSprints[].goal` déjà fourni par la sync JIRA.
- **PI Objectives "done" en mode wow** ([views.css](squad-board/static/css/views.css) `.demo-pi-obj.is-done`) :
  - Fond gradient triple-couche (vert → bleu en diagonale + radial top-right) → effet de profondeur
  - Bordure gauche **4px** (au lieu de 3) + box-shadow vert diffuse + inset highlight blanc
  - Hover : `translateY(-2px)` + ombre amplifiée (effet de soulèvement)
  - Icône ✓ dans un **cercle vert gradient** (24×24, font-weight 700) avec triple halo (ring + glow)
  - Badge BV en **gradient ambré→orange** (au lieu de jaune mat) avec ombre teintée
  - Texte en **blanc pur** + font-weight 600 (au lieu de vert pâle)
  - **Animation "shine sweep"** : un reflet diagonal traverse la card toutes les 3.4s (`@keyframes demo-shine`) — effet brillance subtil mais flatteur en mode présentation
- **Résumé objectives** en header (`.demo-pi-summary`) : badge vert `✓ N/M · BV livrée X/Y` à côté du titre, immédiate lisibilité.

## [3.10.45] - 2026-05-28

### UX : Modal Demo — mini velocity-card du PI sous le burnup (style dashboard) + 🍃 sprint de respiration
- Remplace la sparkline simple introduite en 3.10.44 par une **mini velocity-card** inspirée de la `velocity-card` du dashboard, adaptée au thème dark de la modal Demo.
- **KPIs en ligne** (basés sur les sprints clôturés du PI uniquement) : moy. clos, tendance (moy. 3 derniers vs 3 précédents, ↗/↘ + %), record ⭐ (meilleur sprint clos), stabilité (CV avec label Très stable / Stable / Variable / Instable), % vs cible 🎯 (si `piInfo.velocityTarget` défini). Chaque KPI a son badge coloré : primary/good/ok/warn/danger.
- **Sparkline barres** dégradées par état :
  - `--closed` : dégradé vert
  - `--current` : dégradé bleu + ring (sprint actif)
  - `--best` : dégradé ambré + glow (meilleur sprint)
  - `--breath` : dégradé vert clair + bordure 🍃 (sprint de respiration / IP)
  - `--future` : pointillé gris
- **Sprint de respiration** : le **dernier sprint du PI** (idx max ou `piInfo.sprintsPerPI`) est marqué `--breath` avec un badge 🍃 flottant au-dessus de la barre. Tooltip : `nom · pts · 🍃 Sprint de respiration (IP)`. Référence SAFe : le dernier sprint d'un PI est traditionnellement Innovation & Planning, dédié à la respiration et au cadrage du PI suivant.
- **Label en bas de chaque barre** : numéro du sprint (ex: `29.1`, `29.5`) — `font-variant-numeric: tabular-nums` pour alignement.
- **Légende** sous la sparkline avec 5 swatches (Clôturé / En cours / Record / 🍃 Respiration (IP) / À venir).

## [3.10.44] - 2026-05-28

### UX : Modal Demo — chips parent cliquables, clés ticket cliquables, sparkline PI sous burnup
- **Feature parente en chip discrète** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) — remplace l'ancienne ligne italique `↳ Nom`. Nouveau `<button class="demo-win-parent-chip">` avec icône 🧭, fond `rgba(255,255,255,0.04)`, bordure circulaire (radius 999px), couleur muted. Texte de la feature **non tronqué** (`white-space: normal`, `word-break: break-word`). Hover : tint violet `rgba(192,132,252)`.
- **Clés tickets cliquables** : `<span class="demo-win-key">` devient `<button class="demo-win-key--clickable">` (couleur bleue muted, hover light + lift). Wireup global `overlay.querySelectorAll('[data-ticket-id]')` → `window.__squadBoard.openTicketModal(id)`. La chip parente utilise le même hook (data-ticket-id = id de la feature).
- **Sparkline sprints du PI sous le burnup** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) + [views.css](squad-board/static/css/views.css) `.demo-pi-spark`) — inspiré de `.velocity-card .velocity-spark` du dashboard, adapté au thème dark de la modal Demo :
  - Filtre les `teamSprints` du PI courant (extraction via regex sur le nom du sprint affiché) ; dédup par nom si team='all'
  - Tri chrono, bars hauteur proportionnelle à `velocity`
  - États visuels par dégradé : **closed** (vert), **current** (bleu avec ring), **future** (gris hachuré)
  - Label à gauche : `PI N` + sous-label `X sprints · Y pts cumulés`
  - Tooltip par barre : `nom · pts · état`

## [3.10.43] - 2026-05-28

### UX : Modal Demo Réalisations — feature parente affichée discrètement + tri par feature
- **Retiré** : ligne `— [Nom du responsable]` sur chaque card (info redondante, déjà visible dans la modal ticket détaillée).
- **Ajouté** : ligne `↳ [Nom de la feature parente]` discrètement en bas de chaque card. Résolution via la chaîne `ticket.epic → epic.feature → feature.title` (avec fallback sur le titre de l'epic si pas de feature au-dessus).
- **Style discret** ([views.css](squad-board/static/css/views.css) `.demo-win-parent`) : font-size 11px, italique, couleur `#64748b` (gris foncé sur fond sombre), opacity 0.85. **Pas de troncature** (`white-space: normal`, `word-break: break-word`) — l'utilisateur voit le titre complet même s'il fait plusieurs lignes.
- **Tri par feature** dans chaque groupe (Tickets / Buffer / Actions rétro) : `localeCompare('fr', { sensitivity: 'base' })` sur le titre de la feature parente. Les tickets de la même feature se suivent → facilite la lecture lors du Sprint Review (« Voici tout ce qu'on a fait sur la feature X »). Les tickets sans parent sont relégués à la fin.

## [3.10.42] - 2026-05-28

### Fix : Burnup Modal Demo — textes blancs (lisibles sur fond foncé)
- Le chart Burnup utilisait `baseOpts()` qui lit les variables CSS — sur le fond foncé de la modal Demo (toujours dark, peu importe le thème de l'app), les axes/labels/légende étaient quasi invisibles.
- **Fix** ([charts.js renderBurnup](squad-board/static/js/components/charts.js)) — nouveau paramètre optionnel `opts.theme`. Si `'dark'`, on override les couleurs de ticks (`#cbd5e1`), grilles (`rgba(255,255,255,0.08)`) et légende (`#f1f5f9`). Les couleurs des datasets (lignes scope/done) restent inchangées (déjà visibles sur fond foncé).
- **Appel** ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) : `renderBurnup(..., sprintEvents, { theme: 'dark' })`.

## [3.10.41] - 2026-05-28

### UI : Modal Demo — Réalisations en 3 colonnes + stats compactes
- **Stats** ([views.css](squad-board/static/css/views.css) `.demo-stats`) plus compactes :
  - padding `24px → 12px`, margin-bottom `32px → 18px`, gap `48px → 32px`
  - `.demo-stat-val` font-size `clamp(40-64px) → clamp(28-44px)` ; label font-size `13px → 11px`
  - Libère ~60px de hauteur pour le contenu principal en dessous.
- **3 colonnes côte à côte pour Réalisations** :
  - `.demo-wins-grid` passe en `grid-template-columns: repeat(3, minmax(0, 1fr))` — les 3 groupes (Tickets / Buffer / Actions rétro) sont alignés horizontalement, **toutes les cards visibles d'un coup d'œil**.
  - `align-items: start` pour que les groupes restent collés en haut (pas étirés à la hauteur du plus haut).
  - Responsive : 3 cols → 2 cols sous 1400px → 1 col sous 900px.
  - `.demo-wins-group-cards` passe de grid à flex column (les cards d'un même groupe s'empilent verticalement).
- **Plus de place pour les wins** : grid principal passe de `1fr / 1.15fr` à `0.85fr / 2.4fr` — la colonne Burnup reste lisible mais cède de la largeur au panneau wins (qui en a vraiment besoin pour 3 colonnes lisibles).

## [3.10.40] - 2026-05-28

### UI : Modal Demo Réalisations — regroupement Tickets / Buffer / Actions rétro
- Les "🏆 Réalisations du sprint" étaient affichées en grid à plat (tous types mélangés).
- Refonte ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) — répartition en **3 groupes ordonnés** :
  1. **🎫 Tickets** (bordure gauche bleue `#60a5fa`) — tickets standard sans label spécial
  2. **🛡️ Buffer** (bordure gauche violette `#c084fc`) — label `Buffer`
  3. **🔁 Actions rétro** (bordure gauche jaune `#fbbf24`) — label `ActionRetro`
- Filtres exclusifs (un ticket ne va que dans un seul groupe ; ActionRetro prioritaire sur Buffer si les 2 labels co-existent).
- Chaque groupe affiche : icône + nom + badge compteur + total points cumulés à droite (ex: `🎫 Tickets [5] · 12 pts`).
- Si un groupe est vide → masqué (pas de section orpheline).
- CSS ([views.css](squad-board/static/css/views.css)) — `.demo-wins-grid` devient flex column de `.demo-wins-group`, chaque groupe a son propre grid interne `.demo-wins-group-cards` (1 col par défaut, 2 cols ≥1400px). Styles par variante : `.demo-wins-group--tickets|buffer|retro`.

## [3.10.39] - 2026-05-28

### UI : Modal Demo — layout 2 colonnes + Sprint Goal en card encadrée
- **Sprint Goal** déplacé à droite du titre dans le header (avant : sous le titre, en italique). Nouveau composant `.demo-goal-card` :
  - Gradient orange→rose, bordure orange semi-transparente, ombre teintée, border-radius 14px
  - Label `🎯 SPRINT GOAL` en majuscules orange + texte du goal en italique crème
  - Max-height 180px avec scroll si goal très long
  - `flex-direction: column` du `.demo-hdr` sous 1100px (mobile/écran étroit) : la card passe sous le titre
- **Layout 2 colonnes** pour Burnup + Réalisations ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - Nouveau wrapper `.demo-2col` en grid `minmax(0, 1fr) minmax(0, 1.15fr)` — la colonne wins a légèrement plus de place
  - **Burnup à gauche** : flex column avec `min-height: 280px`, le chart occupe toute la hauteur de la section
  - **Réalisations à droite** : wins-grid en 1 colonne dans la moitié droite (au lieu de l'ancienne grid `repeat(auto-fill, minmax(280px, 1fr))` sur full width), passe à 2 colonnes au-dessus de 1400px
  - Compteur visible `🏆 Réalisations du sprint <small>N</small>` (badge bleu pâle)
- **Responsive** : sous 1100px, retour à une colonne unique (Burnup au-dessus, Wins en dessous).
- Bonus : le header titre passe de `clamp(36px, 5vw, 56px)` à `clamp(32px, 4vw, 48px)` pour mieux cohabiter avec la goal-card à droite.

## [3.10.38] - 2026-05-28

### Feat : Sprint Review & Demo plus accessibles (Ctrl+K + header Sprint/Kanban) + modal Demo enrichie
- **Helpers globaux** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - `openCurrentSprintReview()` — résout le sprint actif de l'équipe sélectionnée via `getSprintForTeam`, récupère ses tickets, ouvre directement le compte-rendu Confluence-ready dans un nouvel onglet.
  - `openCurrentSprintDemo()` — idem, ouvre directement le mode présentation TV plein écran.
  - Exposés via `window.__squadBoard.openCurrentSprintReview` et `…openCurrentSprintDemo` ([app.js](squad-board/static/js/app.js)).
- **3 points d'entrée nouveaux** :
  - **Ctrl+K** ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js)) — 2 entrées `📋 Ouvrir Sprint Review (Confluence-ready)` et `📺 Mode Démo fullscreen`.
  - **Header vue Sprint** ([sprint.js](squad-board/static/js/views/sprint.js)) — boutons `📋 Review` (secondaire) et `📺 Demo` (primary) à droite des stats sprint.
  - **Header vue Kanban** ([kanban.js](squad-board/static/js/views/kanban.js)) — mêmes boutons dans une cellule `.kanban-metric-actions` à la suite des metrics.
- **Modal Demo enrichie** ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - **Sprint Goal** déjà affiché en header (préservé).
  - **Stats étendues** : ajout d'une stat `PI Predictability %` (commit + stretch livrés / commit planifiés × BV) si des objectives sont définis.
  - **Section PI Objectives** : grid auto-fit montrant jusqu'à 8 objectives, code couleur par statut (vert done, bleu inprog, rouge blocked, gris todo), bordure dashed pour stretch, badge BV à droite.
  - **Burnup chart** : canvas plein largeur sous les objectives, utilise `renderBurnup` (utilise `_eventMarkers` qui annote la courbe avec les faits marquants du sprint via le plugin Chart.js existant). Compteur "X faits marquants" si présents.
- **CSS** ([views.css](squad-board/static/css/views.css)) : `.demo-pi-objectives`, `.demo-pi-grid`, `.demo-pi-obj[.is-done|is-inprog|is-blocked|is-stretch]`, `.demo-burnup`, `.demo-burnup-chart` (220px, fond rgba blanc 4%), `.sprint-quick-actions`, `.kanban-metric-actions`. Palette cohérente avec le thème dark de la Demo (text colors `#fff/#cbd5e1/#fbbf24`).

## [3.10.37] - 2026-05-28

### UX : Tabs Settings dans l'URL — partage de lien direct
- Au clic d'une tab Settings, le hash devient `#settings/<slug>` via `history.replaceState` (replace = pas de pollution de l'historique). L'URL devient partageable : envoyer `…/#settings/rotation` ouvre directement la tab "Rotation Support".
- [app.js pushHash](squad-board/static/js/app.js) — gère désormais le cas `view === 'settings'` : lit `store.settingsSection` et produit `settings/<slug>` (au lieu de juste `settings`). Le bouton précédent/suivant du navigateur reste cohérent.
- [settings.js _settingsApplyTabs](squad-board/static/js/views/settings.js) — `activate(slug)` accepte `{ syncHash }` : `false` à l'init (on lit l'état), `true` au clic (on met à jour `store.settingsSection` + `history.replaceState`). Aussi : sync initial du hash si différent de la tab détectée (ex : on arrive sur `#settings` sans slug → on pose `#settings/<première-tab>`).

## [3.10.36] - 2026-05-28

### UI : Tabs Settings pleine largeur (wrap si dépasse, pas de scrollbar)
- La barre `#settings-tabs` était limitée à 800px (héritage de `.settings-layout`).
- Fix :
  - [settings.js](squad-board/static/js/views/settings.js) — la nav est désormais rendue **hors** du `<div class="settings-layout">`, donc plus contrainte par le `max-width: 800px`.
  - [views.css](squad-board/static/css/views.css) — `flex-wrap: wrap` + `width: 100%` + `max-width: none`. Si l'ensemble des tabs dépasse la largeur, **passage à la ligne** automatique (pas de scroll horizontal, plus fluide visuellement).

## [3.10.35] - 2026-05-28

### Feat : Rotation Support — membres actif/inactif (exclusion des rôles non éligibles)
- **Besoin** : certains rôles (Manager, RTE, PO…) ne font pas de support. Ils doivent rester dans la liste des membres pour la capacité mais être exclus du shuffle.
- **Stockage** ([utils.js](squad-board/static/js/utils.js)) — global, `localStorage.rot-inactive` = JSON array de noms. Helpers exportés : `getInactiveSupportMembers()`, `isMemberSupportActive(name)`, `setMemberSupportActive(name, active)`.
- **UI** ([settings.js _rotTeamPanelHtml](squad-board/static/js/views/settings.js)) — chaque ligne membre dans la grille panel équipe a un **toggle circulaire** à gauche du nom :
  - `🛎️` (fond vert pâle, bordure success) = actif support
  - `🚫` (fond gris, opacity 70%) = inactif support
  - Clic = bascule + re-render
  - Quand inactif : nom **barré + italique muted** + ligne entière (cellules semaines) grisée à 60% opacity
  - Résumé panel : `X/Y actifs (Z hors support)` au lieu de `Y membres`
- **Propagation au shuffle** :
  - [settings.js](squad-board/static/js/views/settings.js) handler `data-rot-shuffle` : filtre `teamMembers.filter(isMemberSupportActive)` avant `generateSupportRotation`. Warning si plus aucun actif.
  - [support.js](squad-board/static/js/views/support.js) `_shuffle` : idem.
- **CSS** ([views.css](squad-board/static/css/views.css)) : `.rot-active-toggle[.is-on]`, `.rot-member-name.is-inactive`, `.rot-row-inactive .rot-cell` (grisée), `.rot-sum-inactive`.
- **Pas de migration backend** : le flag est côté frontend uniquement (préférence utilisateur locale, partagée entre Settings et Support via localStorage).

## [3.10.34] - 2026-05-28

### UX : Paramètres en tabs colorées (au lieu de sections empilées collapsibles)
- **Problème** : 10+ sections empilées verticalement → beaucoup de scroll, charge visuelle lourde.
- **Refonte** ([settings.js _settingsApplyTabs](squad-board/static/js/views/settings.js)) — nav horizontale de tabs **post-render** :
  - Scanne `.settings-section`, extrait le titre `h3` (strip le compteur `(N)`), slugify et attribue un id stable (`section-<slug>`) si pas déjà présent.
  - Génère une nav `<nav id="settings-tabs">` sticky en haut avec un bouton par section.
  - Une seule section visible à la fois (`display: none` sur les autres).
  - Tab active = section dépliée (la classe `collapsed` est retirée).
  - Désactive `data-stg-toggle` sur les headers (le clic-pour-collapser n'a plus de sens en mode tabs).
- **Couleurs** : palette 12 couleurs cyclées par index (`#0ea5e9`, `#8b5cf6`, `#10b981`, `#f59e0b`, …). Variable CSS `--tab-color` par tab. Tab active = fond plein + ombre teintée ; tab inactive = dot coloré devant le label.
- **Icônes** : helper `_settingsTabIcon(title)` mappe le titre vers un emoji (🌳 groupe, 👥 équipes, 🧑 membres, 🌴 absences, 🚀 Sprint/PI, 🛎️ rotation, ⚡ events, 📅 calend, 🔗 jira, 📦 data, ⚙️ fallback).
- **Tab initiale** (priorité) : `#settings/<slug>` hash > `store.settingsSection` > `localStorage.sb-settings-tab` > 1re tab. Au clic d'une tab, slug persisté en localStorage (mais hash inchangé pour ne pas casser les deep links Support → `#settings/rotation`).
- **Compatibilité préservée** : le lien `⚙ Édition` depuis Support active toujours la tab "Rotation Support" (id `section-rotation` conservé) — fix [3.10.30](#) toujours opérationnel.
- **CSS** ([views.css](squad-board/static/css/views.css)) `.settings-tabs` + `.stg-tab[.is-active]` — sticky top + ombre subtile + transition fluide. Mode tabs masque le chevron via `.settings-tabs ~ .settings-section .chevron { display: none }`.

## [3.10.33] - 2026-05-28

### UX Settings : tri équipes, PI courant par défaut, Sprint & PI replié
- **Tri alpha équipes** dans Rotation Support ([settings.js _rotPanelsHtml](squad-board/static/js/views/settings.js)) : `localeCompare('fr', { sensitivity: 'base' })` — insensible à la casse + accents. Ordre prévisible.
- **PI en cours affiché par défaut** : suppression de la persistance `localStorage.rot-show-next-pi`. État remplacé par variable de module `_rotShowNext` (initialisée à `false`) → reset à chaque rechargement de page. Le switch reste fonctionnel pendant la session.
- **Section "Sprint & PI" repliée par défaut** ([settings.js:552](squad-board/static/js/views/settings.js#L552)) : ajout de la classe `collapsed` sur le `<div class="settings-section">` correspondant. Cohérent avec les autres sections déjà repliées par défaut.

## [3.10.32] - 2026-05-28

### Fix : Date de début du PI configurable explicitement — fini la dérivation fragile
- **Symptôme rapporté** : avec mode `Ven → Jeu` sur Fuego, le calendrier affichait `30.1.1 = 1 juin` alors que le PI 30 commence en réalité le **vendredi 12 juin**.
- **Cause racine** : `buildSupportPiWeeks` dérivait la date de début du PI depuis `sprintInfo.startDate - curIdx × sprintDuration`. Cette dérivation est fragile si le sprint actif n'est pas parfaitement aligné, ou si plusieurs sprints du même PI ont des dates très légèrement décalées.
- **Fix** : nouvelle source de vérité explicite `piInfo.startDate` (saisie utilisateur).
  - **Backend** ([main.py](squad-board/main.py)) : champ `start_date` ajouté à `PIConfig` (nullable). Migration SQLite via `_run_migrations` (`ALTER TABLE piconfig ADD COLUMN start_date TEXT`). `_pi_dict` expose `startDate`. `update_pi` accepte `startDate` (None pour effacer).
  - **Frontend** ([utils.js buildSupportPiWeeks](squad-board/static/js/utils.js)) — **priorité d'ancrage** :
    1. `piInfo.startDate` si présent (saisi par l'utilisateur, c'est la vérité)
    2. Sinon fallback sur la dérivation `sprintInfo.startDate - curIdx × duration`
    Le snap au jour de semaine (Ven/Mer/Lun) est appliqué dans les 2 cas pour aligner les semaines.
  - **UI** ([settings.js Settings → PI](squad-board/static/js/views/settings.js)) : nouveau champ `<input type="date">` "Début PI (1er jour)" dans le formulaire PI. Au submit, `getPI()` est rechargé dans le store pour que la timeline rotation se réaligne immédiatement.
  - Le retour de `buildSupportPiWeeks` inclut désormais `anchorSource: 'config' | 'derived'` pour diagnostic.
- **Comment l'utiliser** : Settings → PI → saisir la date du **1er jour du PI COURANT** (pas du suivant). Ex: si PI courant = 29 et PI 30 démarre le 12 juin 2026 (vendredi), alors PI 29 a commencé `12 juin - 5×14j = 3 avril 2026` (vendredi) → saisir `2026-04-03`. Le code calculera automatiquement PI 30 = 12 juin ✓.

## [3.10.31] - 2026-05-28

### Feat : Rotation Support — mode semaine paramétrable par équipe (défaut vendredi)
- **Contexte** : les sprints démarrent le **vendredi** sur la plupart des équipes (mode default), mais certaines équipes (ex: équipe legacy) démarrent le **mercredi**. Le code forçait `weekMode: 'monday'` partout — bug visible : semaines mal alignées sur le calendrier sprint.
- **Centralisation** ([utils.js](squad-board/static/js/utils.js)) :
  - `SUPPORT_WEEK_MODES` = `{ monday, wednesday, friday }` avec `dow` (0-6) et `label`.
  - `SUPPORT_WEEK_MODE_DEFAULT = 'friday'` (changement majeur de default).
  - `getSupportWeekMode(team)` lit `localStorage.rot-mode-<team>` avec fallback default.
  - `buildSupportPiWeeks(piInfo, sprintInfo, weekMode)` accepte le mode et **snap** le début du PI au jour cible (recul max 6j) avant de paginer en semaines de 7j.
- **UI sélecteur par équipe** :
  - [Settings → Rotation Support](squad-board/static/js/views/settings.js) : `<select>` "Semaine" dans le header du panneau équipe (à côté de "Eff./sem" et "🎲 Shuffle"). Les valeurs sont les labels lisibles (`Lun → Dim` / `Mer → Mar` / `Ven → Jeu`).
  - [Vue Support](squad-board/static/js/views/support.js) : même `<select>` dans le header de la table rotation (chip `.sup-mode-label`).
  - Changer le mode → `localStorage.rot-mode-<team>` mis à jour + re-render local.
- **Propagation** : tous les `weekMode: 'monday'` hardcodés deviennent `getSupportWeekMode(team)` (createSupport ligne 1287/1545, shuffle Settings, shuffle Support). Les rotations enregistrées portent le mode utilisé pour leur génération.
- **Recalcul par équipe** : dans `_rotTeamPanelHtml` (Settings) et `_panel` (Support), les semaines sont recalculées via `_rotBuildPiWeeks(teamName)` / `buildSupportPiWeeks(..., teamMode)` — chaque équipe peut donc avoir un calendrier de semaines différent et aligné sur son propre 1er jour.
- **Doc** : nouvelle section "Mode semaine Support" dans [CLAUDE.md](squad-board/CLAUDE.md) avec tableau des 3 modes et chaîne d'appel.

## [3.10.30] - 2026-05-28

### 3 fixes UX rotation support
1. **Vue Support — semaines passées masquées par défaut** ([support.js](squad-board/static/js/views/support.js)) : la timeline ne montre plus les semaines `weekEnd < today` à l'ouverture. Bouton dans le header (`#sup-toggle-past`) avec compteur : `🕰️ Afficher passé (N)` / `👁️‍🗨️ Masquer le passé`. État persisté en localStorage `sup-show-past` (off par défaut). Les stats d'équité (top 3 membres chargés, total assignés/cible) restent calculées sur **tout** le PI pour refléter la charge réelle.
2. **Lien `#settings/rotation` plus fiable** :
   - [settings.js](squad-board/static/js/views/settings.js) : lecture **directe du hash** dans renderSettings (plus robuste que `store.settingsSection` qui peut être consommé entre temps). Délai `setTimeout(80)` pour le `scrollIntoView` (laisse le déplissement CSS se faire avant de scroller). Warning console si la section ciblée est introuvable.
   - [app.js](squad-board/static/js/app.js) applyHash : si on est **déjà** sur la vue settings (cas: cliquer un autre `#settings/section` depuis settings), `store.set('view','settings')` ne notifie pas (dédup interne du Store). On force un `queueMicrotask(rerenderView)` pour ré-exécuter renderSettings et appliquer l'auto-ouverture.
3. **Settings tableau rotation — un seul PI à la fois selon switch** ([settings.js _rotTeamPanelHtml](squad-board/static/js/views/settings.js)) : le switch passe d'inclusif (`courant` OU `courant+suivant`) à **exclusif** (`courant` XOR `suivant`). `allWeeks = showNext ? nextWeeks : curWeeks`. Les boucles header/cellule/total ne mélangent plus les 2 PIs : un seul groupHeader (`colspan=allWeeks.length`), `allWeeks.map(...)` au lieu de `curWeeks + nextWeeks`. Résumé recalculé sur le PI affiché.

## [3.10.29] - 2026-05-28

### UI : Vue Support — "Rotation cette semaine" en hero-cards + "Rotation PI" en table Monday-like
- **Section "Rotation cette semaine"** ([support.js](squad-board/static/js/views/support.js)) — refonte en **hero-cards** par équipe :
  - Bordure gauche 5px couleur équipe, badge `EN COURS` couleur primary
  - Méta : 📆 label semaine, dates, badge "Xj restants" (urgent si ≤ 1j)
  - Mini-bar de progression de la semaine (calculée sur la durée écoulée)
  - Membres affichés en chips avec **avatar circulaire** (initiales colorées par hash du nom), nom et tag `Disponible`/`Absent`. Les absents sont barrés + fond rouge pâle.
- **Section "Rotation du PI"** — passage d'une timeline horizontale à un **tableau type Monday** :
  - 5 colonnes : `Semaine` (label + dates), `Statut` (badge `EN COURS` / `PASSÉ 🔒` / `À VENIR`), `Membres assignés` (chips avec avatars), `Effectif` (badge `Vide`/`X/Y`/`✓ Complet` rouge/orange/vert), `Charge équipe` (bar de capacité dispo avec couleur ok/mid/low).
  - Ligne courante surlignée primary, lignes passées atténuées (opacity), lignes du PI suivant teintées info.
  - **Pied de tableau** : compteur global `assignés/cible (%)` + top 3 membres les plus chargés (équité visuelle avec avatars).
  - Wrapper scrollable (`overflow-x: auto`) pour grands écrans étroits.
- **Avatar helper** : nouveau `_avatar(name, size)` utilisant `hashColor(name)` et `initials(name)` (existants dans utils.js) — réutilisable dans toute la vue Support.
- **Match tolérant équipe** : repris dans `_panel` (cohérent avec les autres fixes piège #5) pour que les panels apparaissent même si le nom config ≠ nom CSV exact.
- CSS ([views.css](squad-board/static/css/views.css)) — ~200 lignes de styles : `.sup-avatar`, `.sup-hero-*`, `.sup-table-*`, `.sup-row-*`, `.sup-foot-*` avec variables sémantiques (`var(--success)`, `var(--warning)`, `var(--primary)`), gradients subtils sur les en-têtes panel.

## [3.10.28] - 2026-05-28

### UI : Vue Support — toggle PI suivant aligné sur le switch 2 segments de Settings
- Le bouton `▾ Masquer PI30` solitaire de la timeline rotation Support est remplacé par le **même switch 2 segments** que Settings (classes `.rot-pi-switch*` déjà stylées) — cohérence visuelle entre les 2 vues qui parlent de rotation.
- `📆 PI {N} courant` / `➕ PI {N+1} suivant`, segment actif surligné (fond surface, primary, bold, ombre subtile).
- Chaque segment ACTIVE son propre mode (clic explicite, pas un toggle aveugle).
- Wireup : `#sup-pi-switch-cur` (force false) + `#sup-toggle-next` (force true).

## [3.10.27] - 2026-05-28

### UI : Sprints du PI — objectifs affichés en intégralité (plus de troncature)
- Demande utilisateur : voir l'objectif complet, pas tronqué à 80 chars + tooltip.
- Fix ([dashboard.js](squad-board/static/js/views/dashboard.js)) — suppression du `slice(0, 78) + '…'`, le goal entier est rendu directement. CSS ([views.css](squad-board/static/css/views.css)) : `min-height` retiré, `white-space: pre-wrap` (préserve les retours à la ligne du goal RH/JIRA), `word-break: break-word` (sécurité URLs).
- Les cards s'adaptent désormais à la hauteur du contenu. Le grid `auto-fit` minmax 200px continue d'aligner les cards par ligne ; les goals plus longs étendent la hauteur de leur card (les voisines de même ligne suivent automatiquement avec `align-items: stretch` implicite du grid).

## [3.10.26] - 2026-05-27

### UI : Dashboard "Sprints du PI" — pills compactes remplacées par mini-cards avec objectifs visibles
- **Demande** : voir les objectifs (goals) de chaque sprint du PI et identifier clairement le sprint en cours.
- **Refonte** ([dashboard.js _renderPiSprintsStrip](squad-board/static/js/views/dashboard.js) + [views.css](squad-board/static/css/views.css)) — remplacement des pills compactes par un **grid de mini-cards** (auto-fit minmax 200px) montrant pour chaque sprint :
  - **État badge** : `Terminé` (vert), `En cours` (primary plein), `À venir` (gris)
  - **Nom + dates** du sprint
  - **🎯 Objectif** (goal du sprint depuis `sprintInfo.teamSprints[].goal`, tronqué à 80 chars + tooltip pour le full). Si absent → "Aucun objectif défini" en italique grisé.
  - **Compteur points** : `donePts/totalPts pts` + pourcentage à droite + mini-progress-bar colorée selon avancement
- **Sprint actif distinct** :
  - Border `2px` primary + box-shadow primary diffuse (effet "card surélevée")
  - Badge "En cours" sur fond primary plein (blanc sur primary)
  - Étiquette **● MAINTENANT** en haut à droite, animée (pulse 1.6s)
- **Sprint terminé** : opacity 0.7 pour reculer visuellement.
- **Sprint futur** : border en pointillé + fond surface (vide).

## [3.10.25] - 2026-05-27

### Fix + UI : Settings Rotation — panels PI29/PI30 vides + toggle PI suivant restylé
- **Bug #1 — Panels PI vides** : `_rotPanelsHtml` filtrait `members.filter(m => m.team === teamName)` en **strict**. Si les équipes config app valent `"Fuego"` mais les members CSV ont `team="Team Ami"` ou `"GCOM - Fuego"`, le tableau est vide → `if (!teamMembers.length) return ''` → aucun panneau ne se rend, même avec des données existantes. Piège #5 (3e occurrence dans la codebase).
  - Fix ([settings.js _rotPanelsHtml](squad-board/static/js/views/settings.js)) : match tolérant (cohérent avec support.js `_shuffle` et settings.js shuffle handler) — normalisation + inclusion bidirectionnelle. Appliqué aussi au filtre `support`.
  - **Hint diagnostique** : si finalement aucun panneau ne se rend, on affiche un encart `.rot-empty-hint` listant les équipes effectivement vues dans le CSV (`Team Ami`, `Team Bellier`…) pour que l'utilisateur sache où renommer (côté Settings ou côté CSV).
- **UI #2 — Toggle PI suivant** : remplacé l'unique bouton secondaire (`▾ Masquer PI 30`) par un **switch à 2 segments** type tab-bar :
  - Segment "📆 PI {N} courant" et segment "➕ PI {N+1} suivant"
  - Le segment actif est surligné (fond `var(--surface)`, couleur primary, ombre subtile, font-weight bold)
  - Chaque segment ACTIVE son propre mode (clic explicite, pas un toggle aveugle)
  - Wireup : `#rot-pi-switch-cur` (force false) + `#rot-next-pi-toggle` (force true)
- CSS ([views.css](squad-board/static/css/views.css)) : nouveau bloc `.rot-pi-switch` + `.rot-empty-hint` (en warning-bg avec liste cliquable des équipes vues).

## [3.10.24] - 2026-05-27

### Fix : Dashboard strip "Sprints du PI" invisible + info-panel mélangeait les sprints
- **Bug #1 — Strip invisible** : la fonction `_renderPiSprintsStrip` recevait `sprintInfo` issu de `getSprintForTeam(team, ...)` qui retourne **un seul sprint** (sans le champ `teamSprints[]`). Donc `ts.length === 0` → return ''. Le strip n'apparaissait jamais.
  - Fix ([dashboard.js](squad-board/static/js/views/dashboard.js)) — séparation `sprintInfoAll` (objet global avec `teamSprints[]`) vs `sprintInfo` (sprint actif de l'équipe). Le helper utilise désormais `sprintInfoAll.teamSprints` et déduit le PI à partir du sprint courant OU du sprint global OU du 1er sprint `active` trouvé (3 fallbacks). Signature : `_renderPiSprintsStrip(sprintInfoAll, currentSprint, team, allTickets)`.
- **Bug #2 — info-panel card "Sprint" mélangeait les sprints** : la variable `tickets` venait de `filterByTeam(store.tickets, team)` SANS filtre sprint. Or la sync JIRA ramène les tickets PI courant + suivant + clos → la card sprint mélangeait tout.
  - Fix ([infopanel.js](squad-board/static/js/components/infopanel.js)) — import de `getSprintForTeam` ; `sprintInfo` = sprint actif de l'équipe sélectionnée (fallback global) ; `tickets` désormais filtré sur le sprint actif (`t.sprintName === currentName || t.allSprints.includes(currentName) || t.sprint === currentName`). Toutes les métriques de la card (pts, status counts, alertes, buffer) reflètent maintenant **uniquement le sprint en cours**.
- **Effets de bord vérifiés** : la card Buffer (ligne 109), les alerts proactives (ligne 309) et `getSprintAlerts` utilisent tous `tickets` — cohérent avec "sprint en cours uniquement".

## [3.10.23] - 2026-05-27

### Feat : Dashboard sprint-header — strip "Sprints du PI courant"
- Sous la barre de progression du sprint actif, nouvelle rangée listant **tous les sprints du PI courant** (closed ✓ / active ▶ / future ○) avec :
  - Pill par sprint, état codé visuellement (closed grisé, active surligné primary, future en pointillé)
  - Compteur points livrés/total (calculé depuis `allTickets` via `sprintName`/`allSprints`) si dispo
  - Tooltip : dates + pts + %
- **Source** : `sprintInfo.teamSprints` (fourni par la sync JIRA — closed + active + future). Si une équipe est sélectionnée, filtre dessus ; sinon dédup par nom de sprint (sprints partagés entre équipes).
- Implémentation : `_renderPiSprintsStrip(sprintInfo, team, allTickets)` en fin de [dashboard.js](squad-board/static/js/views/dashboard.js) + bloc CSS `.pi-sprints-strip` dans [views.css](squad-board/static/css/views.css).

### Feat : Settings > Membres — visuel des congés (aujourd'hui + 30 prochains jours)
- À côté de chaque membre, nouveaux éléments visuels inspirés de JIRA-Dashboard :
  - **Chip "🌴 Aujourd'hui"** (warning) si le membre est en congé au moment du rendu
  - **Chip "📅 dd/mm"** (info) montrant la date du prochain congé s'il y en a un à venir
  - **Strip 30 jours** : mini-barre avec 1 case par jour (vert = dispo, jaune = congé, gris = week-end). Tooltip global = "X absences au total · Yj sur les 30 prochains jours · prochain : dd/mm".
  - **Surlignage de la ligne** (`item-row--absent-today`) en jaune pâle si la personne est absente aujourd'hui.
- Implémentation : `_memberAbsenceInfo(memberName, absences)` dans [settings.js](squad-board/static/js/views/settings.js) + classes `.member-abs-*` dans [views.css](squad-board/static/css/views.css). Aucune requête réseau supplémentaire — tout dérive de `store.absences` déjà chargé.

## [3.10.22] - 2026-05-27

### UX : hash `#settings/<section>` pour atterrir directement sur une section
- Le bouton **⚙ Édition** de la timeline rotation (vue Support) pointe maintenant vers `#settings/rotation` au lieu de `#settings` — la section "Rotation Support" est ouverte (déplissée) et scrollée à l'écran automatiquement.
- **Routing** ([app.js applyHash](squad-board/static/js/app.js)) — pour `view === 'settings'`, `parts[1]` n'est plus interprété comme un team (sans objet ici) mais comme une **section** à ouvrir, stockée dans `store.settingsSection`.
- **Auto-ouverture** ([settings.js renderSettings](squad-board/static/js/views/settings.js)) — à la fin du rendu, on lit `store.settingsSection`, on retire la classe `collapsed` sur `#section-<id>` et on `scrollIntoView({behavior:'smooth'})`. Le flag est ensuite consommé (`null`) pour ne pas re-déclencher.
- **Sections supportées** : aujourd'hui seul `id="section-rotation"` existe. Pour étendre, il suffit d'ajouter `id="section-<slug>"` sur les autres `.settings-section` (members, absences, jira, …) et de pointer le hash en conséquence.

## [3.10.21] - 2026-05-27

### Fix : Shuffle rotation — match tolérant sur le nom d'équipe + message diagnostic
- **Symptôme** : cliquer "🎲 Générer PI29" sur l'équipe Fuego affichait `Aucun membre dans cette équipe (CSV congés vide)` alors que les absences étaient bien importées.
- **Cause** : filtre `m.team === team` strict. Si le nom du bouton est `"Fuego"` mais les absences ont `"GCOM - Fuego"` (Team[Team] JIRA), `"Team Fuego"` (CSV RH) ou variations de casse/espaces, aucune correspondance. Piège #5 de l'agent debugger.
- **Fix** ([support.js _shuffle](squad-board/static/js/views/support.js) + [settings.js shuffle handler](squad-board/static/js/views/settings.js)) :
  - **Match tolérant** : normalisation (casse + trim) + inclusion bidirectionnelle (`t.includes(target) || target.includes(t)`). Gère `"Fuego"` ↔ `"GCOM - Fuego"` ↔ `"Team Fuego"`.
  - **Message diagnostic** : si aucun match, on liste les équipes effectivement vues dans les absences (`Équipes vues en base : Team Ami, Team Bellier…`) — l'utilisateur sait immédiatement où est le mismatch.
- **Note** : la rotation enregistrée garde le nom d'équipe original (`Fuego`), donc le rendu de la timeline reste cohérent. Seul le matching pour récupérer les membres est tolérant.

## [3.10.20] - 2026-05-27

### Fix : Import CSV pivot — consolidation des jours consécutifs en une seule absence
- **Symptôme** : un congé du 20/04 → 21/04 était importé comme **2 absences** d'1 jour chacune au lieu de **1 absence de 2 jours** (cf. cas TEST, Alain dans le CSV de l'utilisateur).
- **Cause** : `_parsePivotAbsencesCsv` émettait naïvement une absence par cellule non vide, sans regrouper les jours contigus.
- **Fix** ([settings.js _consolidateConsecutive](squad-board/static/js/views/settings.js)) — après extraction, on regroupe par `(memberName | team)`, on trie les dates, puis on fusionne les runs contigus. Règle "contigu" : gap calendaire ≤ 3 jours entre deux dates triées (vendredi → lundi compte comme un seul congé, le week-end ne casse pas la séquence — convention RH classique).
- **Conséquences** : `startDate`/`endDate` reflètent la plage réelle ; `days` = somme des jours consécutifs. Plus lisible dans la liste, plus utile pour les calculs de capacité PI (`absenceDays >= 3` dans la rotation support s'appuie sur cette plage).
- Exemple concret : pour le CSV `TEST, Alain ... 06/04=1 20/04=1 21/04=1`, on a maintenant **2 absences** au lieu de 3 (06/04 → 06/04, et 20/04 → 21/04 / 2j).

## [3.10.19] - 2026-05-27

### Fix : Import CSV absences — entité enregistrée + dédup membres
- **Symptômes** : (1) l'entité présente dans la 3e colonne du CSV pivot n'était jamais inscrite — perdue silencieusement ; (2) après import, des doublons de membres apparaissaient (mêmes personnes vues 2 fois dans une équipe).
- **Cause #1** : le parseur `_parsePivotAbsencesCsv` extrayait uniquement `(name, team, dates)`. Les colonnes `Entité` et `Rôles` étaient ignorées. Et même capturées, elles n'auraient pas trouvé de place : la table `absence` n'a pas de champ `entity` — il fallait synchroniser la table `member`.
- **Cause #2** : `/api/members/bulk` en mode `replace=False` **ignorait** les noms existants au lieu de les enrichir. Conséquence : un Member créé par la sync JIRA (avec entity vide) restait incomplet, et l'import CSV n'avait aucun effet sur lui — d'où la sensation de "doublons" entre l'apparition côté absences (avec entité) et côté table member (sans).
- **Fix** :
  - [settings.js _parsePivotAbsencesCsv](squad-board/static/js/views/settings.js) — retourne maintenant `{ absences, members }`. Les colonnes méta sont résolues par regex sur l'en-tête (gère `Équipes`/`Equipe`/`Team`, `Entité`/`Entity`/`Société`, `Rôles`/`Role`/`Fonction`). Trim agressif des espaces invisibles (export Excel) pour éviter des doublons `"Alain Lenom"` vs `"Alain Lenom "`.
  - [settings.js handler import](squad-board/static/js/views/settings.js) — appelle désormais `bulkMergeMembers(membersPayload)` après l'import des absences. Toast enrichi : `X absence(s) ajoutee(s) · N membres crees, M maj`.
  - [main.py bulk_merge_members](squad-board/main.py) — refait en **vrai upsert** : si `name.lower()` existe, on enrichit `team`/`role`/`entity` avec les valeurs CSV **non vides** (préserve les valeurs existantes si CSV vide). Retourne `{ created, updated }`.
- **Limite connue** : la dédup membre est sur `name.lower()`. Pour deux graphies vraiment différentes (`"Alain Lenom"` côté JIRA vs `"LENOM, Alain"` côté CSV RH), c'est l'utilisateur qui doit unifier dans Settings — un fuzzy match cross-graphie reste à faire si le besoin se confirme.

## [3.10.18] - 2026-05-27

### Fix : Import CSV Absences — format pivot RH supporté + noms avec virgule
- **Symptôme** : un CSV RH au format <code>NOMS, Prénom \t Équipes \t Entité \t Rôles \t 03/04 \t 06/04 \t …</code> était mal parsé — le séparateur split sur `[;\t,]` cassait les noms `"LENOM, Alain"` en deux colonnes, et le format pivot (1 colonne par jour) n'était pas reconnu.
- **Fix** ([settings.js _parsePivotAbsencesCsv](squad-board/static/js/views/settings.js)) — auto-détection des **2 formats** :
  1. **Pivot RH** (prioritaire) : détecté si ≥ 3 colonnes d'en-tête au format `dd/mm` (ou `dd/mm/yyyy`). Une absence est créée pour chaque cellule non vide / > 0 (cellule = nombre de jours, gère "1", "0.5", virgule décimale "0,5"). Année saisissable via un champ dédié (défaut = année courante).
  2. **Ligne par absence** (fallback) : `Nom;Equipe;Debut;Fin;Type;Jours` — split uniquement sur **TAB ou `;`** (plus jamais sur virgule) pour préserver les noms `"NOM, Prénom"`.
- **Équipes transverses** : helper `_isTransverseTeam(name)` reconnaît `"Team X"`, `"TRV"`, `transverse`, `pool`, `shared` — les absences sont enregistrées telles quelles ; le toast de confirmation indique combien sont transverses (rappel utilisateur). La rotation support / capacité agile les ignore naturellement car le filtre `m.team === <équipe agile>` ne matche pas.
- **UX** ([settings.js section absences](squad-board/static/js/views/settings.js)) :
  - Aide réécrite avec les 2 formats côte à côte.
  - Champ "Année pour format pivot" visible (défaut = année courante).
  - Dialog de confirmation enrichi : format détecté, équipes vues, nombre d'absences transverses.

## [3.10.17] - 2026-05-27

### Feat : Rotation Support — règles métier centralisées + génération depuis la vue Support
- **Règles métier centralisées** ([utils.js generateSupportRotation](squad-board/static/js/utils.js)) — une seule source de vérité, utilisée par Settings (grille) ET la vue Support (timeline) :
  1. Absent ≥ 3 jours sur la semaine → exclu (source = absences CSV RH).
  2. Pas 2 semaines consécutives — relâché si pool insuffisant.
  3. Verrouillage auto du passé (`weekEnd < today` → intact, marqué `_autoLocked`).
  4. Verrouillage manuel (`locked: true` préservé même futur).
  5. Équité par compteur d'affectations + random pour ex-aequos.
  6. `membersPerWeek` configurable (`localStorage.rot-mpw-<team>`).
- **Helper partagé** `buildSupportPiWeeks(piInfo, sprintInfo)` extrait dans utils.js — utilisé par Settings et Support pour générer les semaines du PI courant + suivant.
- **Vue Support enrichie** ([support.js](squad-board/static/js/views/support.js)) :
  - Nouvelle section **"Rotation du PI"** avec **timeline horizontale** des semaines (current + optionnellement PI suivant).
  - Boutons `🎲 Générer PI{N}` et `🎲 PI{N+1}` par équipe (par défaut visible si une équipe est sélectionnée ; sinon panneau par équipe pour `team='all'`).
  - Indicateurs visuels : semaines passées grisées, semaine courante surlignée, semaines verrouillées avec 🔒, membres absents barrés en rouge.
  - Lien direct vers `Paramètres` pour l'édition fine cellule par cellule.
  - **Préservation cross-PI** : si on régénère le PI suivant, le PI courant existant est conservé dans le payload pour ne pas être effacé par le `bulk` côté serveur.
- **Refacto** ([settings.js:1311-1339](squad-board/static/js/views/settings.js#L1311-L1339)) : le handler shuffle utilise désormais `generateSupportRotation`, gagnant automatiquement les règles "pas 2 sem consécutives" et "passé verrouillé".
- **Doc** :
  - [CLAUDE.md](squad-board/CLAUDE.md) nouvelle section "Règles métier Rotation Support" — explicite les 6 règles + le piège du bulk-clear (pourquoi renvoyer l'autre PI).
  - [docs/guide-support.md](squad-board/docs/guide-support.md) mis à jour avec tableau des règles + accès depuis la vue Support.
- **CSS** ([views.css](squad-board/static/css/views.css)) : nouveau bloc `.sup-tl-*` pour la timeline (grid horizontal scrollable, cellules par semaine, chips membres, états past/current/locked).

## [3.10.16] - 2026-05-27

### Tooling : agent `squad-board-debugger` local
- Nouvel agent dans [.claude/agents/squad-board-debugger.md](squad-board/.claude/agents/squad-board-debugger.md) — consolide tout ce qui a été appris pendant les itérations de debug pour éviter de re-perdre du temps :
  - **Mapping snake/camel** : tableau de correspondance (`ticket.epic_id` → `t.epic`, `epic.feature_id` → `e.feature`, etc.).
  - **7 pièges récurrents** : filtre par équipe oublié sur features ; règles d'anomalies dupliquées health/alert_modal ; source de vérité absences vs members ; team mapping Team[Team] ; mismatch noms d'équipe ; 3 chemins enfants d'une feature (epic intermédiaire / direct / JIRA-only) ; détection PI courant.
  - **5 recettes prêtes à copier** : inspecter une feature et ses enfants (local vs JIRA), vérifier la cohérence des noms d'équipe, trouver les tickets d'un epic, lister custom fields JIRA, dump des champs non-null d'une issue.
  - **Méthode d'investigation** en 5 étapes + format de rapport standardisé.
- Mention dans [CLAUDE.md](squad-board/CLAUDE.md) section finale.

## [3.10.15] - 2026-05-27

### Feat : sidebar enfants — lazy fetch JIRA pour les tickets hors base
- **Cas test diagnostiqué** : feature `GCOM-2457` (status=done, PI#29) — JIRA expose 7 enfants OPS via `parent = GCOM-2457 OR "Epic Link" = GCOM-2457` (TRV-4483, TRV-4445, GCOM-3050, GCOM-2657, GCOM-2650, GCOM-2649, GCOM-2647), mais **aucun n'est en base locale** : la sync per-board/sprint n'importe pas les tickets `done` historiques d'une feature elle-même `done`.
- **Fix** ([modal.js _fetchJiraChildren](squad-board/static/js/components/modal.js)) — à l'ouverture de la sidebar enfants sur une feature, on lance en parallèle un fetch JIRA via le proxy local `/jira/rest/api/3/search/jql` avec `parent = X OR "Epic Link" = X`. Les résultats non présents en base sont ajoutés dans une section `📡 Présents dans JIRA, non en base (N)` avec :
  - Un badge `JIRA` (en couleur info, bordure pointillée) pour les distinguer
  - Au clic : ouvre la fiche JIRA externe (`jiraUrl/browse/<id>`) plutôt qu'une modale locale vide
  - Compteurs du toggle button et du header sidebar mis à jour avec le nouveau total
- **Comportement silencieux** : si le proxy JIRA est KO ou non configuré, la promesse échoue sans erreur visible — la sidebar reste utilisable avec ses enfants locaux.
- **CSS** ([base.css](squad-board/static/css/base.css)) — `.badge-jira-only` (dashed border + tint info) et `.mdl-cs-row--jira { opacity: 0.88 }` pour différencier visuellement.

## [3.10.14] - 2026-05-27

### Fix : sidebar enfants invisible — détection élargie + affichage toujours actif sur feature
- **Symptômes** : utilisateur n'a vu ni le bouton 🌿 ni la sidebar sur une feature ouverte depuis PI Planning.
- **Cause #1** : la sidebar n'incluait que les tickets passant par un epic (`epic.feature === f.id` puis `ticket.epic === epic.id`). Or [roadmap.js:147](squad-board/static/js/views/roadmap.js#L147) gère un cas réel : certains projets attachent les tickets **directement** à la feature via `ticket.epic === feature.id` (sautent l'epic intermédiaire) → 0 enfant trouvé, sidebar silencieusement masquée.
- **Cause #2** : `if (total === 0) return;` masquait toute trace de la fonctionnalité — l'utilisateur ne pouvait pas distinguer "feature sans enfant" de "fonctionnalité cassée".
- **Fix** ([modal.js _renderChildrenSidebar](squad-board/static/js/components/modal.js#L1041)) :
  - **Détection élargie** : on cumule `ticketsViaEpic` (via `epic.feature`) ET `ticketsDirect` (via `ticket.epic === feature.id`), avec dédup sur `t.id`.
  - **Affichage toujours actif** sur les features (même si total=0) : bouton 🌿 visible, sidebar avec message "Aucun enfant rattaché" + indication des chemins vérifiés (pour le debug).
  - **Log console** : `[ChildrenSidebar] Feature XXX : N epic(s) + M ticket(s) (via epic: X, direct: Y)` pour diagnostic rapide.
- **Note** : si après reload tu vois "0 epic + 0 ticket" alors qu'il "devrait" y en avoir, c'est que la liaison parente n'est pas en base — vérifier côté JIRA que les epics/tickets pointent bien sur la clé de la feature.

## [3.10.13] - 2026-05-27

### UX : Autocomplete leader multi-tokens (prénom et/ou nom, ordre libre)
- **Avant** : la recherche faisait `name.toLowerCase().includes(query)`. Taper `"martin david"` ne matchait pas `"David Martin"` (ordre des tokens).
- **Fix** ([alert_modal.js:412-422](squad-board/static/js/components/alert_modal.js#L412-L422)) : la query est splittée sur whitespace ; **chaque token** doit être présent dans le nom. Ex: `"dav"` → matche `"David Lefebvre"` ; `"martin david"` → matche `"David Martin"` ; `"jean"` → matche `"Jean Dupont"` et `"Sophie Jean-Baptiste"`.

### Feat : sidebar "Tickets enfants" sur la modal d'une feature
- Quand on ouvre une feature dans la modal détaillée, une sidebar latérale apparaît à droite avec :
  - Les **epics enfants** (`epic.feature === feature.id`)
  - Les **tickets de ces epics** (`ticket.epic === epic.id`)
  - Chacun cliquable → ouvre le ticket dans la modal (navigation in-place)
- **Toggle** via un bouton 🌿 dans le titre (à côté du sélecteur prev/next) ou via la croix de la sidebar. L'état ouvert/fermé est persisté en localStorage `sb-mdl-children-visible`.
- **Comportement** : la sidebar n'apparaît que si `ticket.type === 'feature'` ET qu'il y a au moins 1 enfant. Sinon ni bouton ni sidebar.
- **Responsive** : sous 1280px, la sidebar bascule en bottom-sheet centré (320px max-width / 40vh max-height) pour ne pas déborder de l'écran (modal max-width 860 + sidebar 340 + gap = ~1212px).
- **Implémentation** :
  - JS : [modal.js](squad-board/static/js/components/modal.js) — helper `_renderChildrenSidebar(feature)` en fin de fichier, appelé après le rendu du body. Nettoyage dans `closeModal`.
  - CSS : [base.css](squad-board/static/css/base.css) — nouveau bloc "Sidebar Tickets enfants" + override `.modal.has-children-sidebar { overflow: visible }` pour permettre le débordement.

## [3.10.12] - 2026-05-27

### Fix : Autocomplete leader Health — match tolérant + fallback liste complète
- **Symptôme** : sur un input `leader` (ex: ticket `GDEM-2907`), taper "David" n'affichait aucune suggestion alors que des personnes correspondantes existent dans le CSV congés.
- **Cause** : le filtre strict `derived.filter(m => m.team === scope)` retournait `[]` quand le nom d'équipe du ticket ne correspondait pas au caractère près à celui présent dans la table absences (mismatch typique `"Demeter"` vs `"GDEM - Demeter"` selon la source d'import).
- **Fix** ([alert_modal.js:407-419](squad-board/static/js/components/alert_modal.js#L407-L419)) :
  - **Match tolérant** : normalisation casse + `trim`, puis exact OR inclusion bidirectionnelle (un nom contient l'autre). Gère les préfixes/suffixes JIRA (`"GCOM - Fuego"` ↔ `"Fuego"`).
  - **Fallback ultime** : si le filtre tolérant ne renvoie toujours rien, on suggère la liste complète dérivée du CSV plutôt qu'un popover muet.

## [3.10.11] - 2026-05-27

### Fix : Dashboard et Reports — features non filtrées par équipe
- Extension du fix [3.10.10] aux 2 vues restantes signalées :
  - [dashboard.js:16](squad-board/static/js/views/dashboard.js#L16) — `features = filterByTeam(...)`
  - [reports.js:18](squad-board/static/js/views/reports.js#L18) — idem
- Toutes les vues affichant features par équipe utilisent désormais `filterByTeam` (cohérence avec la nouvelle convention CLAUDE.md).

### Fix : Autocomplete leader dans la modal Health — basé sur le CSV congés et équipe du ticket
- **Symptôme** : l'input `leader` de la modal Health (cliquer une carte → édition) suggérait soit la liste brute `store.members` (artefacts JIRA d'autres équipes), soit une liste filtrée trop laxiste acceptant les membres sans team.
- **Fix** ([alert_modal.js:396-415](squad-board/static/js/components/alert_modal.js#L396-L415)) :
  - Source unique = `deriveMembersFromAbsences(absences, members)` (table absences = CSV RH à jour, cf. CLAUDE.md "Source de vérité des membres").
  - Filtre par équipe : si une équipe est sélectionnée dans le topbar → cette équipe ; sinon (`team='all'`) → équipe du **ticket** sur lequel porte l'input (résolu via `data-id` → `store.tickets`). Utile quand la modal liste plusieurs équipes.
  - Suppression de `_availableMembers` (plus utilisée).

## [3.10.10] - 2026-05-27

### Fix : PI Planning — onglet Features non filtré par équipe sélectionnée
- **Symptôme** : l'onglet `Features (2400)` de la vue PI Planning affichait **toutes** les features de la base, peu importe l'équipe sélectionnée dans le topbar. Les tickets, eux, étaient bien filtrés.
- **Cause** ([pi.js:16](squad-board/static/js/views/pi.js#L16)) — `const features = store.get('features') || [];` lisait le store brut sans passer par `filterByTeam`. Le compteur d'onglet, la metric card "Features", et la liste rendue dans `renderFeatures` héritaient tous de cette liste non filtrée.
- **Fix** ([pi.js:16-18](squad-board/static/js/views/pi.js#L16-L18)) — `const features = filterByTeam(store.get('features') || [], team);`. `filterByTeam` gère déjà : équipe spécifique → filtre `f.team === team`, `'all'` + groupe → filtre sur les équipes du groupe, `'all'` sans groupe → vue globale (préserve la vue RTE).
- **Cohérence SAFe** : le champ `team` des features = `Team[Team]` JIRA (équipe agile responsable, cf. 3.10.8) — donc filtrer dessus correspond bien à "features de l'équipe sélectionnée".
- **Vues similaires vérifiées** :
  - [roadmap.js:18](squad-board/static/js/views/roadmap.js#L18) ✅ déjà filtré
  - [dashboard.js:16](squad-board/static/js/views/dashboard.js#L16) ⚠ **non filtré** — à investiguer (potentiel bug similaire si les metrics features sont affichées)
  - [reports.js:18](squad-board/static/js/views/reports.js#L18) ⚠ **non filtré** — à investiguer

## [3.10.9] - 2026-05-27

### Fix : carte Health "Sans estimation" ignorait l'exclusion ActionRetro
- **Symptôme** : la card Health `noPoints` affichait 7 alors que la modal n'en listait que 2 — 5 tickets `ActionRetro` étaient comptés dans la card mais exclus à juste titre dans la modal.
- **Cause** : la règle de filtre était définie **2 fois** ([health.js:67-72](squad-board/static/js/views/health.js#L67-L72) pour la card + matrice, [alert_modal.js:30-34](squad-board/static/js/components/alert_modal.js#L30-L34) pour la modal). Seule cette dernière excluait `ActionRetro`.
- **Fix** ([health.js:67-75](squad-board/static/js/views/health.js#L67-L75)) — ajout de la même exclusion `!(t.labels || []).some(l => /^ActionRetro$/i.test(l))` dans `ANOMALIES.noPoints.match`. Commentaire de sync croisée vers `alert_modal.js` ajouté.
- **Doc** : nouvelle section "Règles métier" dans [CLAUDE.md](squad-board/CLAUDE.md) — explicite (1) la règle ActionRetro, (2) la duplication des filtres d'anomalies aux 2 endroits avec consigne de garder en sync, (3) à 3e duplication → extraire dans `business_rules.js` partagé.

## [3.10.8] - 2026-05-24

### Fix : Team[Team] prioritaire sur le nom du board pour les features
- **Diagnostic** : les 10 features signalées par l'utilisateur (GCOM-3775, 3810, 3967, 3997, 4001, 4031, 4032, 4038, 4074, TRV-5467) étaient bien en base avec `piSprint="PI#29"` correct, mais leur `team` était **`"PI Board Features ERPC"`** (le nom du board JIRA cross-team) au lieu de leur équipe agile responsable.
- **Cause** : `transformIssue` priorisait `teamName` (nom du board passé en argument) sur `_teamFromField` (Team[Team] JIRA). Les features sont planifiées sur un board cross-team `"PI Board Features ERPC"` mais Team[Team] vaut bien `"GCOM - Fuego"`, `"GCOM - Caméléon"`, etc.
- **Fix #1** ([sync.js:849-853](squad-board/static/js/sync.js#L849-L853)) — Inversion priorité : `_teamFromField (Team[Team])` > `teamName (board)` > `extractTeam(sprint)` > `'Autre'`. Sémantique SAFe : Team[Team] = équipe agile responsable, board = artefact de planification.
- **Fix #2** ([sync.js:443-450](squad-board/static/js/sync.js#L443-L450)) — La passe features JQL réévalue désormais le `team` des features déjà importées par la passe per-board (sinon `existing.team` restait figé sur le board name).
- **Action requise** : resync **complète** pour réappliquer le mapping. Après resync, les 10 features doivent apparaître sur la team Fuego/Caméléon/etc. selon leur `Team[Team]`.

## [3.10.7] - 2026-05-24

### Fix : Features absentes de la roadmap PI courant
- **Filtre PI tolérant multi-source** ([roadmap.js:51-82](squad-board/static/js/views/roadmap.js#L51-L82)) — `_matchFeaturePi(f)` accepte désormais :
  - `f.piSprint` (priorité 1, format `PI#29` standard)
  - `f.sprintName` (fallback si piSprint null mais sprint stocké)
  - `f.labels[]` (chaque label, ex: `PI29` ou `PI#29`)
  - Format `29.1`/`29.3` (sprint nommé `Fuego - Ite 29.3`) → match PI 29
  - Normalisation casse + espaces ignorés
- **Bug team mapping** ([sync.js:844-851](squad-board/static/js/sync.js#L844-L851)) — les features sans champ `Team[Team]` mais avec Sprint=`PI#29` étaient mappées en équipe fantôme **"PI#29"** (extractTeam ne filtrait pas les PI-tags) → invisibles si filtre équipe ≠ "PI#29"
  - **Fix** : la regex `/^PI\s*#?\s*\d+\s*$/i` détecte les sprint names qui sont juste un tag PI et ne déduit plus de team dans ce cas → fallback sur `'Autre'`
- **Log diagnostic console** ajouté : `[Roadmap] Filtre PI PI#29 (team=Fuego) : 2/12 features { PI#29: 2, PI#28: 5, (null): 5 }` — permet de voir d'un coup d'œil le bug data
- **Action requise** : resync complète pour appliquer le fix team mapping aux features existantes

## [3.10.6] - 2026-05-24

### Fix : PI courant détecté depuis le sprint actif (fallback automatique)
- **Cause** : si `piInfo.number` n'est pas configuré dans Settings (cas par défaut), `_basePi = 0` → `currentPiTag = null` → le filtre masquait toutes les features
- **Fix** : fallback automatique via extraction du numéro PI depuis le nom du sprint actif (regex `(\d+)\.\d+` ou `PI\s*#?\s*(\d+)`)
  - Exemple : sprint `"Fuego - Ite 29.3"` ou `"PI30"` → `basePi = 29` / `30` sans config manuelle
- Appliqué dans :
  - [roadmap.js:30-37](squad-board/static/js/views/roadmap.js#L30-L37) — filtre features
  - [picalendar.js:55-61](squad-board/static/js/views/picalendar.js#L55-L61) — labels sprints PI
  - [topbar.js:81-90](squad-board/static/js/components/topbar.js#L81-L90) — affichage du sélecteur (sinon il restait caché)
- Le sélecteur PI écoute maintenant aussi `store.on('sprintInfo')` pour se rafraîchir après sync JIRA
- `pi.js` utilisait déjà le fallback (`_extractPi(sprintInfo?.name)`) — inchangé

## [3.10.5] - 2026-05-24

### Sélecteur PI — filtre features actif sur tous les PI (current/passé inclus)
- **Bug** : le sélecteur PI du topbar mettait à jour le titre mais ne filtrait pas les features en mode "current" — toutes les features de l'équipe restaient visibles peu importe le PI choisi
- **Fix** : en mode "current" (piOffset ≤ 0), `sortedFeatures` est désormais issu de `piFilteredFeatures = features.filter(f => _matchPi(f.piSprint))` ([roadmap.js:35-55](squad-board/static/js/views/roadmap.js#L35-L55))
- **Convention de match** : `f.piSprint` (déjà extrait du champ Sprint JIRA par `extractPI` → format `PI#30`) comparé au tag du PI sélectionné, avec tolérance `PI30`/`PI#30`/casse/espaces
- **Conséquence attendue** : les features sans `piSprint` (champ Sprint absent côté JIRA) n'apparaissent dans **aucun** PI — c'est cohérent avec la règle métier rappelée par l'utilisateur. Pour les rendre visibles, ajouter un Sprint sur le ticket Feature côté JIRA + resync.
- Le mode "PI futur" (piOffset > 0) utilise déjà `f.piSprint === nextPiTag` (inchangé, fonctionnel)

## [3.10.4] - 2026-05-24

### Roadmap — suppression du toggle Current/Next (doublon avec sélecteur PI)
- Le bloc `<div class="rm-view-header">` avec les boutons "PI{N} — courant / PI{N+1} — suivant" est retiré ([roadmap.js:156-165](squad-board/static/js/views/roadmap.js#L156-L165))
- Le handler de clic associé `container.querySelectorAll('.rm-view-btn')` est supprimé
- Le **sélecteur PI du topbar** prend le relais : `piOffset > 0` → vue "PI suivant" (mode cards/list), `piOffset ≤ 0` → vue "PI courant/passé"
- Logique adaptée :
  - `isNextPi = _piOffset > 0` (au lieu de `viewMode === 'next' || 'next-list'`)
  - `viewMode = isNextPi ? (roadmapTab === 'next-list' ? 'next-list' : 'next') : 'current'`
  - `nextPiTag = `PI#${currentPiNum}`` (le PI sélectionné, plus le PI suivant)
- Le sous-toggle **Cartes / Liste** reste dans la section "PI futur" pour basculer entre les deux affichages

## [3.10.3] - 2026-05-24

### Bandeau calendrier — 1 ligne scrollable + Sélecteur PI dans le topbar
- **`.cal-banner-events` réorganisé en 1 ligne horizontale scrollable** ([views.css:4492-4527](squad-board/static/css/views.css#L4492-L4527))
  - `flex-wrap: nowrap` + `overflow-x: auto` avec scrollbar fine (6px, color-mix)
  - `.cal-banner-line` passe en `inline-flex` + `flex-shrink: 0` pour ne plus retourner à la ligne
  - `.cal-banner-line--off` : séparateur vertical à droite au lieu de bordure horizontale
  - Le `.cal-banner` parent passe à `flex-wrap: nowrap` pour préserver la ligne unique
  - Gain : économie de hauteur quand beaucoup de réunions le même jour
- **Sélecteur PI dans le topbar** (PI−2, PI−1, **PI courant**, PI+1, PI+2)
  - Visible uniquement sur les vues `pi`, `picalendar`, `roadmap`
  - Style identique à `.rm-view-toggle` (bordure unifiée, état actif violet, bouton "courant" pré-teinté)
  - Nouveau champ `store.piOffset` (default 0, reset à 0 au changement de vue)
  - Branché dans [roadmap.js:28-34](squad-board/static/js/views/roadmap.js#L28-L34), [pi.js:500-503](squad-board/static/js/views/pi.js#L500-L503), [picalendar.js:52-57](squad-board/static/js/views/picalendar.js#L52-L57)
  - Re-render automatique de la vue au changement de PI (`store.on('piOffset', renderView)`)
  - Décale le PI affiché : titres, filtres features/sprints, calendrier — sans toucher aux données

## [3.10.2] - 2026-05-24

### Axes x des charts Sprint/Kanban : vraies dates de début/fin
- `sprintDays()` ([charts.js:146-156](squad-board/static/js/components/charts.js#L146-L156)) : labels format `12/05 L` au lieu de `J1 (L)` — on voit immédiatement la date réelle
- `sprintCtx` calculé depuis `endDate - startDate` du sprint réel ([sprint.js:101-111](squad-board/static/js/views/sprint.js#L101-L111), [kanban.js:35-44](squad-board/static/js/views/kanban.js#L35-L44)) — fini le `durationDays: 14` hardcodé qui ne correspondait pas aux sprints de 2/3 semaines
- Premier label = date de début du sprint, dernier label = date de fin — l'axe x s'étend exactement sur la durée du sprint
- Charts impactés : Burndown, Burnup, CFD, Throughput (tous les charts daily-based)

## [3.10.1] - 2026-05-24

### Fixes : terme "Buffer" unique + filtre sprint + statut JIRA brut + actions rétro
- **Revert "Buffer" unique** :
  - Chart vélocité : la barre violette s'appelle à nouveau **`Buffer (estimé)`** (au lieu d'Engagement)
  - Modal stat : card unique `Buffer (estimé)` + `▮` violet (CSS `.sb-stat-card--buffer` revert au gradient violet doux)
  - Suppression de la card doublon `Buffer (réservé)` qui faisait collision
  - Markdown/print : `Buffer (estimé)` pour le total JIRA, `🛡️ Tickets Buffer` pour la somme des tickets-label
  - Les tickets ayant le label `Buffer` conservent leur visualisation (icône 🛡️, fond violet, chip)
- **Filtre par sprint sur la page Sprint** ([sprint.js:30-49](squad-board/static/js/views/sprint.js#L30-L49)) :
  - Bug : GCOM-4174 (`sprintName: "PI30"`) apparaissait dans la vue du sprint "Fuego 29.4" car aucun filtre par sprint
  - Fix : `tickets = teamTickets.filter(t => t.sprintName === sprintInfo.name)` après résolution du sprint courant via `getSprintForTeam`
  - Fallback : si pas de sprint courant identifiable, on garde tout (mode dégradé)
- **Statut JIRA brut préservé** (ex: `En cours de développement` au lieu de `En cours`) :
  - Backend : nouvelle colonne `ticket.jira_status` ([main.py:81](squad-board/main.py#L81)) + migration ALTER TABLE + sérialisation `jiraStatus` dans `_ticket_dict`
  - Sync : `transformIssue` exporte le label JIRA brut ([sync.js:842](squad-board/static/js/sync.js#L842))
  - Helper [`getStatusLabel(ticket)`](squad-board/static/js/utils.js#L8-L18) : `jiraStatus` > `STATUS_LABELS[status]`
  - Branché dans `alert_modal.js`, `topbar.js` (search), `sprint.js` (board-list) — le statut interne reste utilisé pour groupement/filtres/couleurs ; le label JIRA pour l'affichage
  - **Action requise** : relancer une sync complète pour peupler `jiraStatus` sur les tickets existants
- **Modal "Tickets sans estimation"** : exclut les tickets ayant le label `ActionRetro` ([alert_modal.js:30](squad-board/static/js/components/alert_modal.js#L30)) — les actions de rétro ne nécessitent pas d'estimation SP

## [3.10.0] - 2026-05-24

### #3 + #7 + #8 + #11 + #12 — Skeleton, Breadcrumb, Favoris, Sparklines, Capacity

**#3 Skeleton loaders pendant les syncs JIRA**
- Au démarrage de `handleJiraImport`, la vue courante est remplacée par un skeleton animé (shimmer 1.4s) — feedback immédiat vs écran figé
- Header avec spinner + titre du mode (rapide / complète) + sub explicatif
- Grid de 4-8 cards placeholders selon le mode
- Auto-remplacé par le re-render à la fin du sync

**#7 Breadcrumb topbar persistant**
- Le `viewTitle` devient un **fil d'Ariane** : `[Icon View] › [Équipe/Groupe] › [📌 Sprint]`
- Segments cliquables :
  - Clic **équipe** → bascule sur "Toutes les équipes"
  - Clic **groupe** → retire le filtre groupe
  - Clic **vue (icon)** → ouvre le Team Switcher (Ctrl+E)
- Sprint name affiché uniquement sur Sprint/Kanban/Dashboard avec équipe spécifique
- Dot couleur sur les segments équipe/groupe

**#8 Vues favorites ★** ([components/favorites.js](squad-board/static/js/components/favorites.js))
- Nouveau bouton **★** dans la topbar (entre topbar et + Nouveau)
- Dropdown qui ouvre la liste des favoris + bouton "＋ Sauver la vue courante"
- Capture state : view + team/group + qfText sessionStorage
- Persistance localStorage `sb-favorites` (max 12)
- Click favori → restore complet en 1 clic
- Suppression au hover via × discret
- Tooltip avec détails du favori

**#11 Trend sparklines KPIs** ([components/sparkline.js](squad-board/static/js/components/sparkline.js))
- Composant SVG ultra-léger autonome (pas de Chart.js)
- Helpers `sparkline(values, opts)` et `trendChip(values, opts)` (avec `invertGood` pour les KPIs où baisse = bien)
- **Health Dashboard enrichi** :
  - Snapshot quotidien du score + counts par anomalie en localStorage `sb-health-history` (max 30 entrées)
  - **Sparkline 120×32** sous le label du score (zone teintée + dernier point + min/max highlights)
  - **Chip de tendance** ↗↘ à côté du label avec % vs jour précédent
  - **Mini sparkline 70×22** dans chaque card anomalie + chip tendance (invertGood = couleur verte si baisse)

**#12 Capacity planning prévisionnelle** ([utils.js:computeCapacityNextSprint](squad-board/static/js/utils.js))
- Helper exporté qui calcule pour une équipe : `vélocité moy. 3 derniers × (1 − ratio absences)`
- Fenêtre du prochain sprint : `endDate sprint actif + 1 jour → +durée du sprint actif`
- Compte les jours ouvrés (lundi-vendredi) sur la fenêtre + intersect avec les absences
- Demi-journées (`type === '1/2'`) supportées
- **Card "🎯 Capacité prévisionnelle"** affichée dans la vue Health quand une équipe est filtrée
  - Capacité estimée (gros bleu), Vélocité moyenne, Ratio absences (vert/info/warning selon %)
  - Sub : nom équipe + dates de la fenêtre du prochain sprint

## [3.9.1] - 2026-05-23

### Fixes : centrage score Health + autocomplete vraie sur input leader
- **Score Health circle** : passage de `display: inline-flex; align-items: baseline` à `flex-direction: column; align-items/justify-content: center` → "14" centré, "/100" en petit dessous (au lieu de désaligné en baseline)
- Font-size légèrement bump (42 → 44px) + letter-spacing -0.02em pour un rendu plus dense
- **Autocomplete custom** sur les inputs `alert-input--leader` ([alert_modal.js:330-432](squad-board/static/js/components/alert_modal.js#L330-L432)) :
  - Remplace la `<datalist>` HTML5 (limitée, UI inconsistante)
  - Popover singleton attaché au `<body>` (position fixed z-index 10010) → échappe au clip de la modal
  - Au focus / input : popover s'ouvre avec les membres filtrés (top 10, match `name.includes(query)`)
  - Affiche nom + équipe en petit à droite
  - Navigation clavier : ↑↓ Enter Esc Tab
  - Click sur option (mousedown pour devancer le blur) → sette la valeur + déclenche événement `input` (track dirty)
  - Auto-close au blur (avec délai 120ms pour laisser le mousedown agir)

## [3.9.0] - 2026-05-23

### #1 + #2 + #3 — Cmd+K boosté, Team switcher, Health Check Dashboard

**#1 Cmd+K (palette de commandes) boosté** ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js))
- Nouvelle catégorie **`Actions`** (10 commandes) avec scoring + boost de pertinence sur les `keywords`
  - Sync JIRA rapide/complète · Basculer thème · Ouvrir calendrier semaine · Modales d'alertes (unassigned, noPoints, oldBlockers, scopeCreep) · Voir toutes équipes · Ouvrir JIRA externe
- Empty state enrichi : top 5 actions populaires visibles avant même de taper
- Activation : run la fonction `action.run()` au clic / Enter

**#2 Team Switcher fuzzy (Ctrl+E)** ([team_switcher.js](squad-board/static/js/components/team_switcher.js))
- Nouveau composant léger : palette modale d'équipes (style cmdpalette mais focalisé)
- Sections : **⏱ Récents** (localStorage `sb-recent-teams`, 6 derniers) → **📦 Groupes** → **Équipes (A-Z)**
- Fuzzy search live + navigation clavier ↑↓ Enter Esc
- **Raccourci Ctrl/Cmd + E** global pour ouvrir
- **Bouton 🔍** ajouté en bas de la sidebar des équipes si > 5 équipes
- Swatches couleur 2 lettres cohérents avec la sidebar
- Au choix → set `team`/`group` dans le store + push récent

**#3 Health Check Dashboard** ([health.js](squad-board/static/js/views/health.js))
- Nouvelle vue dans la sidebar `🛡️ Health` (shortcut `H`)
- **Hero** : score global 0-100 (jauge circulaire colorée selon niveau) + label "Excellent/Correct/Attention/Critique"
- **7 cards anomalies** cliquables : 🚫 Bloqués · 🔴 Blockers >48h · 🐌 Stagnants · 👤 Sans assigné · 📊 Sans estimation · 🔄 WIP élevé · 📈 Périmètre élargi
  - Clic → ouvre la modal d'action (réutilise `openAlertModal` existant)
- **Matrice heatmap équipes × anomalies** :
  - 1 ligne par équipe (avec swatch couleur 2 lettres), 1 colonne par anomalie + total
  - Intensité de fond proportionnelle au count (color-mix dynamique)
  - Clic sur cellule → bascule le filtre topbar sur cette équipe + ouvre la modal d'action
  - Hover : zoom 1.15× + font-weight bold pour la lecture rapide
- **Calcul du score** : `100 - (weighted_anomalies / active_tickets × 35)` avec pondération sévérité (danger ×3, warning ×1.5, info ×0.5)
- Respect du filtre topbar (équipe/groupe) : si filtre actif, la matrice se restreint au périmètre

## [3.8.22] - 2026-05-23

### Filtre équipes intra-modal calendrier (popover header)
- **Nouveau toggle "👥 Équipes"** dans le header de la modal calendrier (Sprint/Kanban) entre la nav semaine et le bouton sync
- **Popover** avec pills équipes (réutilise `.team-pill` de settings) :
  - Pill `Toutes` (par défaut) → reset · pills équipe → toggle multi
  - Triées alphabétiquement (`localeCompare 'fr'`, sensitivity base)
  - Listées uniquement les équipes qui ont au moins **un calendrier ICS** configuré (pas de pollution)
- **Pré-coche l'équipe topbar** si elle est spécifique au open (`openCalWeekModal` initialise `teamSelection` avec [team])
- **Filtre live** : re-render de la modal au toggle, navigation semaine préserve la sélection
- **Events sans team** (calendriers globaux) toujours affichés peu importe la sélection
- **CSV support** : un cal `team="Fuego,Caméléon"` matche les deux filtres
- **Toggle compact** : affiche `Toutes équipes`, `Fuego` (si 1), ou `3 équipes` + badge compteur primary si N > 0
- État `is-active` (fond primary 12% + bordure 40%) sur le toggle quand un filtre est actif
- Popover en `position: fixed` z-index 10001 → échappe au clip de la modal
- Click hors popover → ferme

## [3.8.21] - 2026-05-23

### Équipes triées alphabétiquement dans les pickers Paramètres
- `teamNames` ([settings.js:44](squad-board/static/js/views/settings.js#L44)) trié par `localeCompare('fr', sensitivity:'base')` → ordre alphabétique insensible à la casse / accents
- Impacte les **pills équipes** du picker calendriers ICS (ajout + édition inline) et toutes les autres listes de teams dans la vue Settings
- `.slice()` avant tri pour ne pas muter le store

## [3.8.20] - 2026-05-23

### Calendriers ICS — édition inline + multi-équipes
- **Édition inline** : nouveau bouton **✏️** sur chaque calendrier dans Paramètres → transforme la row en form édition (nom, URL, équipes) avec ✓/✗ et raccourcis Enter/Échap
- **Multi-équipes** via picker à pills :
  - Pill `Toutes` (par défaut) ↔ pills équipe individuelles
  - Clic sur une équipe = toggle ; clic sur "Toutes" = reset
  - Si plus aucune équipe sélectionnée → "Toutes" se réactive automatiquement
  - Stockage CSV dans le champ `team` existant (rétrocompatible)
- **Backend** ([main.py:1893-1897](squad-board/main.py#L1893-L1897)) : `get_calendar_events` accepte le CSV — un cal `team="Fuego,Caméléon"` matche les deux filtres
- **Frontend filter** ([cal_banner.js:188-194 + 691-697](squad-board/static/js/components/cal_banner.js#L188-L194)) : helper `_matchTeam(et, t)` qui split CSV et matche
- **Display** : chip "Fuego" pour 1 équipe, "3 équipes" + tooltip pour multi
- **Délégation** sur `#cal-list` pour les actions (edit/refresh/delete) → cancel d'édition ne perd plus les handlers
- Picker mutualisé entre formulaire d'ajout et formulaire d'édition (même composant `cal-teams-picker`)
- CSS dédié : pills primary actives, form édition fond bleu pâle pour distinguer

## [3.8.19] - 2026-05-23

### Epic picker — combobox autocomplete avec récents (modal ticket)
- Le champ `editable-field` Epic de la modal ticket devient un **combobox custom** au clic (au lieu d'un `<select>` natif)
- **Input d'autocomplete** en haut : filtre live sur la clé (ex `GCOM-`) ET le titre
- **Section "⏱ Récents"** : 8 derniers Epics modifiés sur cet appareil (localStorage `sb-recent-epics`) — push automatique à chaque commit
- **Section "N Epics (A → Z)"** : tous les autres Epics triés alphabétiquement par titre (avec locale FR pour é/à)
- **Option "— Aucun (retirer l'Epic)"** au sommet pour détacher facilement
- **Indicateurs visuels** :
  - Epic courant : fond vert + bordure gauche succès
  - Hover : fond bleu light
  - Clé monospace primary + titre tronqué avec ellipsis
- **Navigation clavier** :
  - ↑/↓ pour parcourir, Enter pour valider, Esc pour annuler
  - Le scroll suit l'élément hover (`scrollIntoView`)
  - Click hors picker = cancel
- **Filtre intelligent** : masque dynamiquement les section headers quand rien dessous n'est visible
- Position absolue dans le champ, dropdown 320px max scrollable, shadow + ring primary pour le focus visuel

## [3.8.18] - 2026-05-23

### qf-search Sprint — matche aussi les labels + Epic/Feature parente
- Le filtre `_qfText` (input `qf-search` de la vue Sprint) prend désormais en compte :
  - **Labels** du ticket (déjà actif, confirmé)
  - **Epic parente** : `t.epic` résolu → matche sur `ep.id` ET `ep.title`
  - **Feature ancêtre** : chaîne `ticket → epic.feature_id → feature` → matche sur `ft.id` ET `ft.title`
- Index `Map` pré-construits depuis `store.epics`/`store.features` → résolution O(1) par ticket (pas de scan répété)
- Aligné sur les **deux chemins de filtre** : initial dans `renderSprint` ([sprint.js:58-87](squad-board/static/js/views/sprint.js#L58-L87)) + diff dans `_refreshBoard` ([sprint.js:334-358](squad-board/static/js/views/sprint.js#L334-L358))
- **Placeholder mis à jour** : `🔍 Filtrer : clé, titre, leader, label, contributeur, Epic/Feature parente…`
- Exemple : taper `LOGIN` affiche les tickets dont l'Epic ou la Feature parente s'appelle "Refonte parcours LOGIN"

## [3.8.17] - 2026-05-23

### Bouton "Voir la semaine" → mini-éphéméride sexy
- Le bouton `Semaine ⌄` devient un **mini-widget calendrier** style page d'éphéméride :
  - **Carré 36×40 avec header rouge** (gradient `#ef4444 → #dc2626`) affichant le mois en 3 lettres (`MAI`)
  - **Numéro du jour en gros bold** (`23`)
  - **Jour de la semaine** en petites caps en bas (`MAR`)
  - Bordure + inner highlight + drop-shadow subtile pour un effet "carte tangible"
- **Label à droite** sur 2 lignes :
  - `Semaine` (14px, semibold)
  - `vue détaillée` (uppercase 9.5px muted)
- **Hover** : translateY(-1px) + box-shadow + ring primary discret + bordure primary 40%
- Tooltip enrichie : `Voir la semaine — mer. 23 mai`
- Police `font-variant-numeric: tabular-nums` pour la cohérence des chiffres
- Le clic ouvre toujours `_openWeekModal(filtered)` (binding inchangé)

## [3.8.16] - 2026-05-23

### Alert-bar du Sprint cliquable → modal d'action (même que panel-alert)
- Les items du `alert-bar` (en haut de la vue Sprint) avec un `actionable` deviennent **cliquables** et ouvrent la même modal que les alertes du panel aside
- Attributs alignés sur `panel-alert-row--clickable` : `role="button"`, `tabindex="0"`, `data-alert-action`, `title="Cliquer pour agir sur ces tickets"`
- **Flèche `→` CTA** apparaît au hover (opacité 0.6 → 1 + translateX)
- **Hover** : `translateY(-1px)` + box-shadow + bordure interne renforcée
- **Accessibilité** : navigation clavier (Enter/Space pour ouvrir)
- Pas de double rendu : la modale globale réutilise `openAlertModal(actionable)` — même tableau éditable + hash routing

## [3.8.15] - 2026-05-23

### Fix tooltip Scrum croppée — singleton portal body
- **Bug** : la tooltip était `position: absolute` dans le badge → croppée par `overflow:hidden`/scroll des parents (`.cal-week-grid-wrap`, modal, cellules jour)
- **Fix** : **singleton tooltip attaché au body** ([cal_banner.js:582-650](squad-board/static/js/components/cal_banner.js#L582-L650))
  - Le badge ne contient plus que l'emoji + `data-scrum-key`
  - Au hover (délégation globale `mouseover`/`mouseout` + `focusin`/`focusout`), une tooltip globale unique est positionnée en **`position: fixed`** via JS calculant la `getBoundingClientRect` du badge
  - **`z-index: 10000`** + reparent au body → échappe à tout clip parent
  - **Placement intelligent** : préfère "au-dessus à droite", flip dessous si pas de place en haut, recale à gauche si débord à gauche, max-x clampé
  - **Hover persistant** sur la tooltip (mouseenter sur tt = cancel hide) — permet de cliquer dedans / lire tranquillement
  - Délais de hide `setTimeout(80ms)` pour transition fluide entre badge et tooltip
- Réutilise la couleur par cérémonie via classe `.cal-scrum-tt--<key>` qui set `--scrum-color`

## [3.8.14] - 2026-05-23

### Tooltip pédagogique sur les cérémonies Scrum
- **Au hover de l'emoji cérémonie** (🌅 🎯 🔍 🔁 🎤) : tooltip riche colorée par type qui explique la cérémonie en 5 points pour un newcomer Scrum :
  - **🎯 Pourquoi** — objectif business/équipe
  - **👥 Qui** — participants typiques
  - **⏱ Fréquence** — cadence et durée
  - **📦 Output** — livrable attendu
  - **💡 Exemple** — phrase concrète dans un encadré teinté (en italique)
- **Design "sexy"** :
  - Largeur 320px, padding généreux, line-height 1.5 pour la lecture
  - Background gradient (couleur du type → surface)
  - Bordure colorée par type + double shadow (drop-shadow coloré + halo léger)
  - Petite **flèche pointe** sous la tooltip vers le badge
  - Titre 14px coloré par type, dashed separator
  - Bloc exemple : encadré bordure gauche colorée + fond pastel
- **Position intelligente** : par défaut au-dessus à droite du badge ; sur les 2 derniers jours de la semaine (`nth-last-child(-n+2)`), bascule à gauche pour ne pas sortir du grid
- **Accessibilité** : `tabindex="0"` + `aria-label` + `role="tooltip"` + visible aussi sur `:focus-visible` / `:focus-within`
- Animation : fade + slide-up cubic-bezier 0.16/1/0.3/1
- Contenu détaillé centralisé dans `_SCRUM_DETAILS` ([cal_banner.js:86-122](squad-board/static/js/components/cal_banner.js#L86-L122))

## [3.8.13] - 2026-05-23

### Durée des events retirée du calendrier modal
- Suppression de `<span class="cal-ev-dur">(15min)</span>` à côté de l'horaire — l'horaire `10h30 – 10h45` suffit à donner la durée
- Plus de calcul `_duration` dans le rendu (helper toujours présent pour usage futur)

## [3.8.12] - 2026-05-23

### Badge cérémonie réduit à l'emoji seul
- Le badge cérémonie n'affiche plus que l'emoji (🌅 / 🎯 / 🔍 / 🔁 / 🎤) sans le libellé texte
- **Tooltip conserve le nom complet** ("Daily", "Sprint Review"…) au hover
- Plus discret + plus de risque de débordement dans les cellules étroites

## [3.8.11] - 2026-05-23

### Fix débordement badge cérémonie Scrum
- **`.cal-ev-time`** passé en `flex-wrap: wrap` (avec `row-gap: 3px`) → le badge cérémonie passe sous l'horaire si la cellule jour est trop étroite (au lieu de déborder hors du cadre)
- L'horaire reste `white-space: nowrap` (premier enfant) pour ne pas casser "10h00 – 10h30"
- **Badge cérémonie compacté** :
  - `font-size: 9.5px → 8.5px`, `padding: 1px 6px → 0 4px`, `border-radius: 4px → 3px`, `gap: 3px → 2px`
  - `font-weight: semibold → bold` pour compenser la taille réduite
  - `letter-spacing` resserré (`0.03em → 0.02em`)
  - Ajout `text-overflow: ellipsis` + `max-width: 100%` au cas où

## [3.8.10] - 2026-05-23

### Calendrier modal — visuel dédié pour les cérémonies Scrum
- Nouveau helper `_detectScrumType(title)` ([cal_banner.js:84-99](squad-board/static/js/components/cal_banner.js#L84-L99)) qui identifie 5 types de cérémonie via regex sur le titre :
  - 🎤 **Sprint Review** (`sprint review`, `sprint demo`, `démo sprint`)
  - 🎯 **Planning** (`sprint planning`, `PI planning`)
  - 🌅 **Daily** (`daily`, `stand-up`, `standup`, `scrum matinal`)
  - 🔍 **Refinement** (`refinement`, `grooming`, `raffinement`)
  - 🔁 **Rétro** (`rétro`, `retro`, `rétrospective`, `retrospective`)
- Ordre des règles : plus spécifique d'abord (sprint review avant review seul)
- **Badge Scrum** affiché à droite de l'horaire (avant l'icône 🔄 récurrence si présente), avec icône + libellé court
- **Fond gradient subtil** sur toute la ligne event (couleur du type vers transparent à 70%)
- **Couleurs cohérentes par type** :
  - Daily → vert (#10b981, action quotidienne)
  - Planning → bleu (#3b82f6, projection)
  - Refinement → ambre (#f59e0b, analyse)
  - Rétro → violet (#8b5cf6, réflexion)
  - Sprint Review → cyan (#06b6d4, démo)
- Variable CSS `--scrum-color` par variante → palette extensible facilement

## [3.8.9] - 2026-05-23

### Calendrier modal — équipe masquée si filtrée + 🔄 à droite de l'horaire
- **Équipe masquée si filtre actif** : si une équipe spécifique est sélectionnée dans la topbar, le `👥 Équipe` n'apparaît plus dans le metaLine de chaque event (information redondante). Les autres infos (calendarName si différent) restent affichées.
- **Icône 🔄 récurrence repositionnée** : retirée du metaLine en bas, ajoutée à droite de l'horaire (`.cal-ev-time` avec `margin-left: auto`) — meilleur scan visuel des événements récurrents au moment où on regarde l'heure
- Span dédié `.cal-ev-recur` avec opacité 0.75 → 1 au hover, cursor help + tooltip "Événement récurrent"

## [3.8.8] - 2026-05-23

### Support-banner — noms en "Prénom L." + label équipe rétréci
- **Nom membre compacté** : `Jean Dupont` → `Jean D.` via helper `_shortName(n)` ([sprint.js:99-104](squad-board/static/js/views/sprint.js#L99-L104))
  - Gestion des noms multi-mots : on garde le prénom + initiale du **dernier** mot (particules ignorées : `Marie Claire De La Fontaine` → `Marie F.`)
  - **Tooltip conserve le nom complet** au hover du chip
- **`.support-team-label` rétréci** : min-width `22px → 16px`, padding `1px 5px → 0 4px`, border-radius `999px → 4px` (carré au lieu de pill — plus compact), font `9.5px → 9px`, letter-spacing diminué (`0.04em → 0.02em`)

## [3.8.7] - 2026-05-23

### "Scope creep" → "Périmètre élargi" (français partout)
- Libellés affichés mis à jour dans :
  - **Alerte du panel aside** : `Périmètre élargi : N ticket(s) ajouté(s) après début (+X pts)`
  - **Modal d'action** : titre `Périmètre élargi — tickets ajoutés en cours de sprint`
  - **Sprint Review template** : `Périmètre élargi :` dans "Points d'attention pour la rétro" + reformulation du message "Sprint propre" (« pas d'ajout significatif après début »)
  - **Docs** : guide-rte.md et guide-scrum-master.md
- **Clés techniques inchangées** (`scopeCreep` actionable, hash routing `#sprint/Fuego/alert/scopeCreep`, var locale `scopeCreep`) pour préserver la rétrocompat et les liens partagés

## [3.8.6] - 2026-05-23

### Support-banner ultra-compact + scroll horizontal
- **Hauteur réduite** : padding `4px sp-3` (vs `sp-2 sp-4`), min-height 30px, font 12px (vs sm)
- **Scroll horizontal discret** des membres (`flex-wrap: nowrap` + `overflow-x: auto`) :
  - Scrollbar fine 4px, couleur transparente `text-muted 30%` → 50% au hover (Firefox `scrollbar-width: thin`)
  - Empêche le retour à la ligne quand beaucoup d'équipes
- **Chips members plus petits** : padding `1px 6px 1px 3px`, font 11px, avatar 14×14 (vs 16×16)
- **Date en format court** : `5 → 11 juin` si même mois, `28 mai → 3 juin` sinon (au lieu de `05/06/2026 → 11/06/2026`)
  - Tooltip conserve les dates complètes au hover
- **Encadrement groupe** un peu resserré (padding 1px/5px au lieu de 2px/6px) et `nowrap` interne

## [3.8.5] - 2026-05-23

### Support-banner — affinage visuel
- **Texte** : `Support :` → `Support` (suppression du deux-points pour cohérence avec les autres labels)
- **Label équipe condensé** : nom complet → 2 premières lettres en majuscules (`Fuego` → `FU`, `Caméléon` → `CA`) — gain de place, tooltip conserve le nom complet
- **Encadrement discret** des membres par équipe (`.support-team-group--bordered`) :
  - Bordure pointillée colorée par équipe (via `--team-dot` CSS variable)
  - Fond très léger (4% color-mix) pour distinguer les groupes sans surcharger
  - Padding interne minimal (2px/5px) pour rester compact
- Séparateur `·` retiré (l'encadrement suffit visuellement)
- Label désormais coloré par équipe (au lieu du dot + neutre) : pastille 22px min, fond 14% + bordure 40% de la couleur équipe

## [3.8.4] - 2026-05-23

### 3 ajustements UX : cal-banner, support, sprint-header
- **cal-banner** : ré-render automatique sur changement de `calendarEvents` / `calendars` / `team` (via `store.on` subscription par wrap, WeakMap pour cleanup). Avant : le bandeau "Aujourd'hui" restait figé après sync. Ajout d'un `console.debug` quand 0 réunion détectée malgré des events filtrés (échantillon `[{title, start, dayKey, team}]`) pour aider au diagnostic. `_dayKey` rendu défensif (NaN/null → '').
- **support-banner** : regroupement par équipe ([sprint.js:80-89](squad-board/static/js/views/sprint.js#L80-L89)). Si > 1 équipe, chaque groupe est précédé d'un mini label discret (chip pastel avec dot couleur équipe), séparés par un `·` discret. Pour 1 seule équipe : rendu identique à avant (pas de label inutile).
- **sprint-header en 2 colonnes** ([sprint.js:127-149](squad-board/static/js/views/sprint.js#L127-L149) + [views.css:660-696](squad-board/static/css/views.css#L660-L696)) :
  - Colonne gauche (1.4fr) : `sprint-info` (nom + dates) + `sprint-goal-bar` intégré
  - Colonne droite (1fr) : `sprint-stats` (pts/tickets/buffer) + `progress` bar pleine largeur
  - Responsive : passe en 1 colonne sous 720px
  - Gain de hauteur vertical → board visible plus haut
- **`view-search-bar` retirée de Sprint** : `qf-search` est désormais le seul champ recherche (déjà mieux placé dans la barre quick-filters)
  - `_qfText` enrichi : matche désormais **clé, titre, leader/assignee, labels, contributors** (ajout labels + contributors)
  - Persistance sessionStorage `sprint-qfText` (compat lecture `sprint-search` pour reprise transparente)
  - Placeholder explicite : `🔍 Filtrer : clé, titre, leader, label, contributeur…`

## [3.8.3] - 2026-05-23

### Calendrier modal — bleu, ticks, indicateurs sprint, Visio
- **Sprint bar passée en bleu** : `--sprint-color` injecté = `var(--primary)` (au lieu de la couleur d'équipe violette)
  - `.cal-week-sprint-bar::before` (bordure gauche), `.cal-week-sprint-goal` (encadré objectif), `.cal-week-sprint-fill` (fill semaine) tous en bleu
  - `--team-color` toujours exposé pour usage futur si besoin
- **Today en rouge** : `.cal-week-sprint-today` (trait + point) passé de `var(--text)` à `var(--danger)` pour ressortir
- **Ticks d'extrémité** (`.cal-week-sprint-tick--edge`) ajoutés au début (0%) et à la fin (100%) du track, plus marqués que les ticks hebdo avec un point d'extrémité
- **Indicateur sprint-start/end dans `.cal-day-hdr`** :
  - Pastille verte ▶ "premier jour du sprint" (start)
  - Pastille orange ◀ "dernier jour du sprint" (end)
  - Discret, à côté du nom du jour, avec tooltip explicatif
- **Lien event location http(s) → "🎥 Visio"** au lieu de "📍 Lieu / Lien" — chip bleu arrondi distinctif (`.cal-ev-link--visio`), title contient l'URL complète

## [3.8.2] - 2026-05-23

### Fix calendrier — décalage horaire DST + doublons récurrence
- **Bug 1 (TZ DST)** : un event récurrent à `10h30 Europe/Paris` créé en hiver (CET +1) s'affichait à `11h30` en été (CEST +2) — drift de 1h
  - **Cause** : `rrulestr(..., dtstart=naive, ignoretz=True)` générait les occurrences en datetime naïf re-taggé UTC, sans tenir compte des transitions DST
  - **Fix** ([main.py:407-432](squad-board/main.py#L407-L432)) : on passe désormais `dtstart` AWARE (avec sa `tzinfo` source) à `rrulestr` ; `dateutil.rrule` gère correctement les transitions été/hiver. Les occurrences sont converties en UTC pour le payload JSON
  - Les EXDATEs sont aussi gardées aware
- **Bug 2 (doublons RECURRENCE-ID)** : un même créneau apparaissait deux fois (l'occurrence générée par RRULE + l'instance modifiée override)
  - **Cause** : ICS supporte `RECURRENCE-ID` pour remplacer une occurrence spécifique d'une récurrence ; le code ajoutait les deux
  - **Fix** : 1er passage collecte les `RECURRENCE-ID` par UID dans `overrides_by_uid` → 2e passage les exclut des occurrences RRULE générées et ajoute le VEVENT override comme événement standalone
  - **Barrière supplémentaire** : déduplication finale par `(uid, start_iso)` via `seen_keys` (protège aussi des autres cas de doublons exotiques)
- Aucun changement frontend nécessaire — le payload reste au format ISO UTC, parsé naturellement par `new Date(...)` côté navigateur

## [3.8.1] - 2026-05-23

### Modal ticket — grille de champs compactée, focus sur la description
- **Passage à 3 colonnes** (`.mdl-grid--3`) pour les champs courts → moins d'espace vertical avant la description
- **Espacement réduit** : row-gap 8px (vs sp-4), column-gap sp-3, font-size 12.5px sur les valeurs, labels 10px
- **Fusion "Créé · maj"** : Leader, Rapporteur, Créé+maj sur une seule ligne de 3 colonnes
  - Format date **"mer. 10 Juin 2026"** (helper `fmtDateLong` exporté dans utils.js) au lieu de DD/MM/YYYY
  - Sub-info "il y a Xj" en plus petit après la date (`<small text-muted>`)
- **Full-width conservé** pour les champs riches : Contributors, Epic, Labels (grid-column 1 / -1)
- **Responsive** : passe à 2 colonnes sous 720px
- Description gagne ~40-60px de hauteur visible — la lecture commence plus haut

## [3.8.0] - 2026-05-23

### Mode Demo fullscreen — présentation TV pour Sprint Review (#15)
- Nouveau bouton **📺 Demo** dans le header de la modal sprint
- Ouvre un **overlay fullscreen** sombre (fond `#0f172a` + radial gradients colorés) adapté affichage TV / vidéoprojecteur
- **Header géant** : badge état, titre du sprint avec gradient text (clamp 36–56px), équipe, objectif en encadré ambre
- **Stats XXL** : Vélocité (gradient bleu→violet avec text-shadow glow), Tickets terminés, % engagement
- **Grid de cards de wins** : tickets done triés par points décroissants
  - Card avec gradient subtil + bordure + hover lift
  - Type icon · clé monospace · chip points vert · titre · leader
- **Auto-scroll lent** des wins (1px/60ms) si overflow, **pause avec Espace**
- **Raccourcis clavier** : <kbd>Esc</kbd> quitter · <kbd>F</kbd> vrai fullscreen navigateur · <kbd>Espace</kbd> pause
- **Bouton fermer rond** en haut à droite

## [3.7.9] - 2026-05-23

### Sprint Review template Confluence-ready (#12)
- Nouveau bouton **📋 Review** dans le header de la modal sprint
- Ouvre dans un nouvel onglet un **compte-rendu HTML autonome** prêt pour réunion / Confluence / impression :
  - **Typo Georgia** (élégante pour un document) + system-ui pour les éléments fonctionnels
  - Header avec titre + badge état + meta (nom, équipe, dates)
  - **🎯 Objectif du sprint** : encadré ambre avec `sprint.goal`, ou état vide explicite si non défini
  - **📊 Métriques** : cards Vélocité (vert) · Engagement · Buffer · Tickets — chiffres en gros
  - **✅ Réalisations** : liste des tickets done triés par points décroissants (gros wins en premier)
  - **🔄 À reporter** : liste des tickets non done
  - **⚠️ Points d'attention pour la rétro** : detect auto blockers + scope creep ≥ 2 (encadré rouge), ou "Sprint propre" vert si rien
  - **🚀 Décisions & prochaines étapes** : zone vide pointillée à remplir en live pendant la réunion
  - **Footer** avec tips Ctrl+P pour imprimer + Ctrl+A/Ctrl+C pour Confluence
- `@media print` : break-after avoid sur les titres, zone notes affichée minimisée
- Utilise `window.open` + blob URL (alerte si popups bloqués)

## [3.7.8] - 2026-05-23

### Vue PI Burnup multi-équipes (#11)
- Nouveau **onglet "📈 Burnup"** dans la vue PI Planning (entre Capacité et Équipes)
- Calcul du burnup PI à partir de `sprintInfo.teamSprints[]` filtrés par numéro de PI :
  - Détecte les sprints du PI courant (regex `{piNumber}.{x}` ou `PI{piNumber}`)
  - Pour chaque (sprint, équipe), récupère la **vélocité JIRA** (priorité) ou fallback **somme des tickets done locaux**
  - Cumule SP livrés par équipe et au total
- **Header** : titre + sous-titre stats + **3 KPIs** (Engagement total · Livré à date · % atteint)
- **Chart Line** (Chart.js) :
  - **1 ligne par équipe** (couleur de l'équipe via `teamObjects`, fallback `TEAM_COLORS`)
  - **Ligne "Total livré"** en gras noir épais avec aire teintée
  - **Ligne "Engagement"** horizontale (gris pointillé) si engagement total connu
  - Tooltip mode `index` (toutes les valeurs au survol d'un sprint)
- **Légende custom HTML** sous le chart avec les noms d'équipes + pts cumulés
- Respect du filtre équipe : si une équipe est sélectionnée dans la topbar, on filtre les sprints
- État vide explicite si pas de PI configuré ou pas de sprints trouvés

## [3.7.7] - 2026-05-23

### Comparaison de sprints — shift+clic sur le chart vélocité (#6)
- **Shift / Ctrl / Cmd + clic** sur une barre du chart vélocité → ajoute le sprint à une sélection multi (sans ouvrir la modal détail)
- **Barre flottante "⚖️ N sprints sélectionnés"** apparaît sous le chart avec :
  - Compteur dynamique + petit rappel "shift+clic pour ajouter/retirer"
  - Bouton **Effacer** (clear)
  - Bouton **Comparer →** (disabled si < 2 sprints)
  - Animation `slideDown` cubic-bezier
- **Nouveau composant** [components/sprint_compare_modal.js](squad-board/static/js/components/sprint_compare_modal.js) :
  - Tableau comparatif côte-à-côte des sprints sélectionnés
  - Lignes : Engagement (estimé) · Vélocité (livrée) · Buffer (réservé) · % réalisé/engagement
  - Colonnes : nom + équipe + état (en cours/clos) + colonne **Moy.** en bout (highlight primary)
  - **Indicateur best/worst** ↑↓ : meilleur en vert, plus faible en orange (avec fond teinté sur la cellule)
  - Légende explicative en footer
- État global `_velocitySelection` (Set d'indices) — réinitialisé à chaque `destroyAllCharts`
- Auto-cleanup : la barre disparaît quand la sélection redevient vide

## [3.7.6] - 2026-05-23

### Export rapport sprint en HTML/Markdown enrichi (#5)
- Deux nouveaux boutons dans le header de la modal sprint à côté du bouton copier :
  - **📝 MD** : télécharge un **rapport Markdown enrichi** (`sprint-<name>-<YYYYMMDD>.md`)
    - Header `# 📊 Sprint name` + blockquote état/équipe/date
    - Tableau Indicateurs (Engagement, Vélocité, Buffer, Tickets, SP)
    - Sections par statut avec tableau Markdown standard (Type · Ticket · Titre · Pts · Assigné·e)
    - Liens JIRA cliquables format `[\`KEY\`](url)`
    - Footer "Généré le … via Squad Board"
    - Compatible **GitHub / GitLab / Confluence (Markdown macro) / VSCode preview**
  - **📥 HTML** : télécharge un **rapport HTML autonome** (`sprint-<name>-<YYYYMMDD>.html`)
    - CSS inline (system-ui, max-width 980px, responsive)
    - Header avec badge état coloré + stats cards (Vélocité, Engagement, Buffer hachuré, Tickets, SP)
    - **Burndown SVG inline** (idéale pointillée + courbe réelle bleue, 880×200) — généré sans dépendance Chart.js
    - Sections par statut avec bordure colorée + tableau complet (tags Buffer/Retro inline)
    - **`@media print`** : page-break-inside avoid pour impression propre
    - Ouvrable navigateur / partageable / copiable dans Confluence / imprimable
- **Téléchargement** via `Blob` + `URL.createObjectURL` + `<a download>` + toast confirmation
- Re-bind dynamique après fetch JIRA pour exporter les tickets fraîchement chargés

## [3.7.5] - 2026-05-23

### Modal d'action sur les alertes — tableau éditable
- **Lignes alertes cliquables** dans le panel aside (chip → `→` au hover) — chaque alerte expose un identifiant `actionable` (unassigned, noPoints, blocked, oldBlockers, stale, wip, scopeCreep)
- **Nouveau composant** [components/alert_modal.js](squad-board/static/js/components/alert_modal.js) avec :
  - Header avec icône + titre + count + intro pédagogique + chip équipe
  - **Tableau éditable** : Type · Ticket (clé + titre cliquable pour ouvrir le détail) · Statut badge · **Assigné·e** (datalist avec membres de l'équipe issus des absences) · **Points** (number input)
  - **Tracking dirty** : lignes modifiées surlignées en jaune (warning bg), compteur dans le bouton Enregistrer
  - **Save batch** : `Promise.all` de `api.updateTicket` + recharge globale + toast résultat
  - État vide ✅ "Plus aucun ticket ne correspond à cette alerte" si filtre vide
- **Hash routing** : `#sprint/Fuego/alert/unassigned` — partageable, supporte back/forward navigateur
  - Extension de `applyHash` dans [app.js:89-130](squad-board/static/js/app.js#L89-L130) pour parser `/alert/<id>` (avant `/ticket/<id>`)
  - Dynamic import du composant pour ne pas charger inutilement
- **Animation** : fade-in + slide-up cohérent avec les autres modales
- **Esc / backdrop** pour fermer

## [3.7.4] - 2026-05-23

### Alertes proactives dans le bandeau aside (#4)
- **`getSprintAlerts` enrichie** ([infopanel.js:540](squad-board/static/js/components/infopanel.js#L540)) avec 3 nouvelles règles :
  - **Blockers anciens > 48h** sans update (compte + ancienneté du plus vieux) → 🔴 danger
  - **Tickets stagnants** : inprog/review/test sans update depuis > 5j → ⚠️ warning
  - **Tickets sans assigné·e** : ≥ 3 hors done → ℹ️ info
  - **Scope creep enrichi** : montre les pts ajoutés (+8 pts → danger, sinon warning)
- **Refonte de la card Alertes du panel aside** ([infopanel.js:294-322](squad-board/static/js/components/infopanel.js#L294-L322)) :
  - Remplace la mini-card limitée (blocked + WIP) par les alertes **complètes de `getSprintAlerts`** (sauf success)
  - Tri par sévérité : danger > warning > info
  - **Pills compteurs** par sévérité dans le titre (🔴 N, ⚠️ N, ℹ️ N)
  - **Lignes alerte** avec bordure gauche colorée + icône + fond teinté

## [3.7.3] - 2026-05-23

### Fix filtres Activité récente — champs rares maintenant trouvables
- **Bug** : le compteur d'un chip filtre pouvait afficher `1` mais le filtre retournait "Aucune activité ne correspond" car les compteurs étaient calculés sur `max × 3` activités tandis que seulement `max` étaient rendues dans le DOM (les filtres ne peuvent agir que sur le DOM)
- **Fix** : on rend désormais TOUTES les activités collectées dans le DOM (jusqu'à `max × 10`), avec les items au-delà de `max` initialement masqués via classe `.activity-item--overflow` (display:none)
  - Quand on active un filtre spécifique : tous les matches sont révélés (sans limite)
  - Quand on revient à "Tout" : on revient à la limite initiale de `max` premiers items (via `data-default-max`)
- Collecte interne passée de `max × 3` à `max × 10` (Dashboard 150, Sprint/Kanban 200)
- Cohérence : ce qui est affiché dans le compteur du chip est toujours ce qui apparaît au clic

## [3.7.2] - 2026-05-23

### Filtres chips dans Activité récente (#2)
- **Barre de filtres** au-dessus de chaque liste d'activité — mono-sélection (un seul filtre actif à la fois)
- **Filtres par champ** (chips colorés cohérents avec les chips de ligne) : 🚦 Statut, 🏃 Sprint, ⚡ Priorité, 👤 Assigné·e, 🏷️ Étiquettes…
  - Affiche seulement les champs qui ont au moins 1 événement (pas de chips vides)
  - Trié par fréquence (le plus actif en premier)
  - **Compteur** dans chaque chip (badge `act-filter-count`)
- **Filtres par auteur** (top 5) : chips sarcelle 👤 séparés par un divider
- **Chip "Tout"** par défaut (état initial actif), permet de revenir à la vue complète
- **Filtrage côté client** sans re-render : on cache les `.activity-item` qui ne matchent pas via `display:none`
- **Message si filtre vide** : "Aucune activité ne correspond au filtre"
- **Scope par vue** (`dashboard` / `sprint` / `kanban`) : les filtres sont isolés entre les vues (pas de contamination)
- Charge **×3 d'activités** initialement pour avoir une marge après filtrage

## [3.7.1] - 2026-05-23

### Activité récente unifiée sur Dashboard / Sprint / Kanban
- **Nouveau composant partagé** [components/activity.js](squad-board/static/js/components/activity.js) qui exporte :
  - `renderActivityList(tickets, opts)` — HTML complet avec gestion de l'état vide
  - `renderActivityRow(activity)` — ligne unitaire (pour intégrations sur mesure)
  - `extractActivities(tickets, max)` — extrait + trie + limite
  - `bindActivityClicks(container)` — délègue le clic ticket vers `openTicketModal`
- **Dashboard** : migré vers le composant (suppression des 70+ lignes de helpers locaux)
- **Sprint** : ancienne `renderDailyActivity` (groupage par jour, format daily-row) remplacée par le composant unifié — même rendu chips que le dashboard, 20 derniers événements
- **Kanban** : section "Activité récente" ajoutée après le board (n'en avait pas) — 20 derniers événements
- Code et CSS factorisés : un seul endroit à maintenir pour l'apparence des activités

## [3.7.0] - 2026-05-23

### Burndown automatique dans la modal sprint (#1)
- Bloc `📉 Burndown` ajouté entre les cards de stats et la liste des tickets de la modal sprint
- Réutilise le `renderBurndown` existant ([charts.js:162](squad-board/static/js/components/charts.js#L162)) avec dataset `Ideal` (gris pointillé), `Reel pts` (bleu plein), `Tickets` (ambre)
- **Sprint actif** : « (temps réel) » avec marqueur « Aujourd'hui »
- **Sprint clos** : « (rétrospectif) » sans marqueur today (todayIdx < 0)
- Helper `_canRenderBurndown(sprint, tickets)` : skip si pas de dates ou pas de points
- Helper `_sprintDurationDays(sprint)` : calcule la durée du sprint depuis start/end
- Injection dynamique via `_maybeInjectBurndown` : si la modal s'ouvre sans tickets (cas fetch JIRA), le bloc burndown est inséré après le fetch
- Style soft : fond `surface-2` + bordure pointillée + titre uppercase 11px

## [3.6.32] - 2026-05-23

### Emoji 🆘 pour les tickets Support
- Emoji 🆘 ajouté pour les types `support` et `incident` dans `_typeIcon` ([sprint_tickets_modal.js:472-473](squad-board/static/js/components/sprint_tickets_modal.js#L472-L473))
- Visible dans la liste des tickets de la modal + dans le rapport copier

## [3.6.31] - 2026-05-23

### Rapport copier — passage en texte simple (Slack-safe)
- **Problème** : le format Markdown Slack `<URL|TEXT>` apparaissait en littéral avec le `|` URL-encodé en `%7C` côté Slack — caractères `*`, `<`, `>` visibles dans le rendu final (capture utilisateur)
- **Cause** : le rendu mrkdwn n'est appliqué que si l'option "Format messages with markup" est activée côté Slack ; le `|` est encodé lors de la copie par certains middlewares
- **Fix** : passage en **texte simple universel** ([sprint_tickets_modal.js:444-518](squad-board/static/js/components/sprint_tickets_modal.js#L444-L518))
  - Suppression de tous les `*` (gras) et `_` (italique)
  - URL en clair (Slack/Teams/Gmail auto-linkifient les URLs nues)
  - Séparateurs visuels par tirets/points : `· — ·`
  - Titre ticket tronqué à 70 caractères pour limiter la verbosité
- Format final compatible **Slack, Teams, Gmail, Outlook** sans configuration :
  ```
  📊 Sprint Fuego - Ité 29.4 — en cours · Fuego · fin 28 Mai 26

  • Engagement : 27 pts  ·  Vélocité : 4 pts (15% réalisé)  ·  🛡️ Buffer : 10 pts (37% de l'engagement)
  • Tickets : 2/12 terminés  ·  Story Points : 4/27

  ◻️ À faire — 3 tickets · 12 pts
    • 📖 https://erpc.atlassian.net/browse/GCOM-4365 — [ICER…] · 5 pts · Sébastien
    • ⚙️ https://erpc.atlassian.net/browse/GCOM-3869 — Semantic versioning · 3 pts
  ```

## [3.6.30] - 2026-05-23

### Rapport copier — emojis type, liens JIRA, "tickets" dans le compteur
- **Emojis par type** ajoutés en préfixe de chaque ligne ticket :
  - 📖 Story (US)  ·  ⚙️ Ops  ·  💸 Debt
  - 🐛 Bug  ·  ✓ Task  ·  🔬 Spike  ·  🧭 Epic  ·  ✨ Feature
  - Les labels prioritaires (🛡️ Buffer, 🔁 ActionRetro, 🩺 Postmortem…) restent prioritaires sur le type
- **Liens JIRA cliquables** au format Slack mrkdwn `<URL|TEXT>` : `<https://jira/browse/GCOM-1234|*GCOM-1234*>` → s'affiche en bleu cliquable dans Slack
  - Fallback gracieux : si `jiraUrl` absent, garde juste l'ID en gras
- **"tickets" dans le compteur des groupes** : `*✅ Terminé* (12 tickets · 38 pts)` (pluriel adapté)
- Format final :
  ```
  *✅ Terminé* (3 tickets · 12 pts)
  • 📖 <https://jira/browse/GCOM-1234|*GCOM-1234*> — US implémentation widget _(5 pts)_ — Sébastien
  • ⚙️ <https://jira/browse/GCOM-1235|*GCOM-1235*> — Déploiement infra _(3 pts)_ — Marie
  ```

## [3.6.29] - 2026-05-23

### Modal sprint — bouton copier (rapport Slack-friendly)
- **Bouton 📋 copier** ajouté dans le header de la modal sprint (à côté du bouton fermer)
- Génère un rapport **Markdown Slack-compatible** ([sprint_tickets_modal.js:444-505](squad-board/static/js/components/sprint_tickets_modal.js#L444-L505)) :
  ```
  *📊 Sprint Fuego 28.3* (clôturé · Fuego · fin 12 Mar 26)

  • Engagement : *50 pts*  ·  Vélocité : *42 pts* _(84% réalisé)_  ·  🛡️ Buffer : *5 pts* _(10% de l'engagement)_
  • Tickets : *12/15* terminés  ·  Story Points : *38/45*

  *✅ Terminé* (12 · 38 pts)
  • *GCOM-1234* — Implémenter le widget X _(5 pts)_ — Sébastien
  • *GCOM-1235* 🛡️ — Couverture buffer _(3 pts)_ — Marie
  ...
  ```
- **Groupes par statut** avec emoji (✅ Terminé, 🔄 En cours, ⛔ Bloqué…)
- **Tags inline** : 🛡️ pour les tickets Buffer, 🔁 pour ActionRetro
- Utilise `copyToClipboard` existant (+ toast confirmation)
- **Re-bind dynamique** après fetch JIRA pour copier les tickets fraîchement chargés (closure mise à jour via `cloneNode` + `replaceWith`)

## [3.6.28] - 2026-05-23

### Hover sprint allégé — focus sur les données attachées au sprint
- Lignes retirées du tooltip vélocité car non attachées au sprint hovré :
  - `Moy. 3-sprints : X pts` (moyenne glissante calculée sur N sprints, pas une donnée du sprint courant)
  - `vs moyenne : ±X pts` (delta calculé)
  - `vs objectif : ±X pts` (delta calculé)
- Datasets `Moyenne (X pts)` et `Moy. glissante (3)` **filtrés du tooltip** via `tooltip.filter: item => !/^Moy/i.test(item.dataset?.label)` — les lignes restent visibles sur le graphique (en cyan)
- Tooltip final = uniquement les données **attachées au sprint** : Engagement · Vélocité · Buffer · Objectif · Réalisé % · Buffer %

## [3.6.27] - 2026-05-23

### Activité récente — chips colorés par type de champ
- **Chip "champ"** discret coloré pour chaque type d'activité ([dashboard.js:391-461](squad-board/static/js/views/dashboard.js#L391-L461)) :
  - 🚦 Statut · bleu  ·  👤 Assigné·e · sarcelle  ·  ⚡ Priorité · ambre  ·  🏃 Sprint · violet  ·  🏷️ Étiquettes · rose
  - 🎯 Version · cyan  ·  📅 Date d'échéance · ambre  ·  🧭 Epic/Parent · violet foncé
  - 📊 Story points · bleu primary  ·  ↕️ Rang · slate  ·  👥 Équipe · orange
- **Chip "valeur"** (from/to) avec mise en forme spécifique :
  - **Statut** → couleurs des badges statut existants (badge-todo, badge-inprog, etc.) via `_statusKeyForBadge()`
  - **Priorité** → couleur par niveau (highest/blocker rouge, high orange, low/lowest atténué)
  - **Autre** → chip neutre avec bordure + tronqué à 240px
  - **Vide** → "—" italique pointillé
- **Chip ticket cliquable** : ID en monospace primary, fond `color-mix` → clic ouvre la modal du ticket
- Layout `flex-wrap` + gap 5px : les chips se positionnent naturellement et s'adaptent en mobile
- Format final : `<author> [🚦 Statut] sur [GCOM-1234] [En cours] → [Terminé]`

## [3.6.26] - 2026-05-23

### Emojis carrés colorés en préfixe dans le tooltip vélocité
- Lignes du `afterBody` (compléments sans pastille Chart.js native) préfixées par un carré coloré Unicode pour matcher la couleur de l'élément graphique correspondant :
  - **⬜ Réalisé : X% de l'engagement** (gris = engagement)
  - **🟪 Buffer = X% de l'engagement** (violet = buffer)
  - **🟦 Moy. 3-sprints : X pts** (cyan = moyennes)
  - **🟦 vs moyenne : ±X pts** (cyan)
  - **🟧 vs objectif : ±X pts** (ambre = objectif)
  - **⏳ Sprint en cours — non compté dans les stats**
- Les datasets (barres/lignes principales) gardent leur pastille colorée native Chart.js — on n'ajoute pas d'emoji là où il y aurait redondance

## [3.6.25] - 2026-05-22

### Moy. glissante en cyan (même couleur que Moyenne globale)
- Ligne `Moy. glissante (3)` passée du violet `#8b5cf6` au **cyan-600** `#0891b2` — même couleur que la Moyenne globale
- Cohérence visuelle : toutes les lignes "moyenne" sont en cyan ; le violet reste exclusivement réservé au Buffer
- Distinction entre les deux moyennes via le style : moyenne globale = pointillée (`[4,3]`) ; moy. glissante = ligne pleine avec courbure

## [3.6.24] - 2026-05-22

### Couleur "Moyenne" distincte de l'Engagement
- Ligne `Moyenne (X pts)` du chart vélocité passée du gris (`#94a3b8`) au **cyan-600** (`#0891b2`)
- Évite la confusion avec la barre `Engagement (estimé)` qui reste en gris clair
- Palette finale du chart : gris = engagement · couleur perf = vélocité · violet = buffer · cyan pointillé = moyenne · violet plein = moy. glissante 3 sprints · ambre pointillé = objectif

## [3.6.23] - 2026-05-22

### Barre Buffer violette visible sur le chart
- **3e barre overlay** dans le chart vélocité ([charts.js:680-694](squad-board/static/js/components/charts.js#L680-L694)) : barre **violette étroite au centre** (`barPercentage: 0.28`) — concentrique avec engagement (gris large) et vélocité (couleur moyenne)
- Couleur saturée `rgba(139,92,246,0.85)` + bordure `#6d28d9` (sprint clos) / plus claire pour le sprint courant
- Affichée uniquement si `data[i].bufferPoints > 0` (sprints sans buffer en base ne génèrent pas de barre)
- **Toggleable via clic légende** (comportement Chart.js natif, défaut visible)
- Order = 2 → s'affiche **au-dessus** de la vélocité (3) mais en dessous des lignes (≤ 1)
- **Tooltip déclutté** : Chart.js affiche désormais auto `[pastille violette] Buffer (réservé) : X` ; mon `afterBody` se contente d'ajouter `Buffer = Y% de l'engagement` (le ratio, pas de doublon)

## [3.6.22] - 2026-05-22

### Buffer historique pour TOUS les sprints clos
- **Nouvelle passe sync** ([sync.js:640-678](squad-board/static/js/sync.js#L640-L678)) : JQL global `labels = "Buffer"` (1 seule requête, cap 5000) → récupère TOUS les tickets buffer
- Pour chaque ticket : trouve le **dernier sprint clos** (par `endDate`) et y agrège ses Story Points dans `bufferBySprintId`
- `teamSprints[]` est patché : chaque sprint clos reçoit son `bufferPoints` réel
- `computeVelocityHistory` ([utils.js:476-481](squad-board/static/js/utils.js#L476-L481)) utilise `s.bufferPoints` en priorité (sinon fallback sur calcul depuis tickets locaux)
- **Résultat** : la ligne `🟪 Buffer (réservé) : X pts` apparaît désormais dans le hover de TOUS les sprints du chart (passés inclus), pas seulement le sprint actif
- Coût réseau marginal : 1 JQL au lieu de N appels par sprint clos

## [3.6.21] - 2026-05-22

### Activité récente — alimentée depuis JIRA + 🟪 buffer hover + accents FR
- **🟪 Carré violet** ajouté devant `Buffer (réservé)` dans le tooltip du chart vélocité — cohérent avec la couleur du concept Buffer dans toute l'app
- **Fix activité récente vide** : `recentChanges` était hardcodé à `[]` dans sync.js → ne récupérait jamais le changelog JIRA
  - Nouveau helper `_extractRecentChanges(issue)` ([sync.js:826-851](squad-board/static/js/sync.js#L826-L851)) qui aplatit `issue.changelog.histories[]` (8 derniers événements max)
  - Filtre les champs non pertinents (description, attachment, comment, link, workratio…)
  - Garde les clés techniques (status, assignee, sprint…) pour ne pas casser les filtres (`c.field === 'status'` dans sprint.js)
  - **`expand=changelog`** ajouté au helper `_paginateJql` (param optionnel) + activé pour les passes future sprints + PI-named sprints (déjà actif sur le sprint actif)
- **Accents français** sur toute l'activité récente :
  - Helper `fieldLabelFr(field)` exporté depuis [utils.js:27-55](squad-board/static/js/utils.js#L27-L55) : `status` → `Statut`, `assignee` → `Assigné·e`, `priority` → `Priorité`, `sprint` → `Sprint`, `labels` → `Étiquettes`, etc.
  - Dashboard `Activite recente` → `Activité récente` + phrase reformulée : `<author> a modifié <champ FR> sur <ticketId> : X → Y`
  - Sprint daily activity : `Aucune activite recente` → `Aucune activité récente` + traduction du champ
  - Modal ticket → Historique : même formulation avec traduction

## [3.6.20] - 2026-05-22

### Fix : doublon "Engagement (estimé)" dans le hover chart
- Chart.js affiche **automatiquement** le label du dataset dans le tooltip (`Engagement (estimé) : 50`)
- Je rajoutais en plus dans `afterBody` une ligne `Engagement estimé : 50 pts (réalisé 80%)` → **duplication visible**
- Fix : ligne afterBody reformulée en simple `Réalisé : X% de l'engagement` (information de % qui complète sans répéter)
- **Buffer (réservé) : X pts (Y% de l'engagement)** conservé tel quel dans afterBody — c'est la seule source d'affichage de l'info Buffer dans le tooltip

## [3.6.19] - 2026-05-22

### Engagement gris + Buffer dans le hover du chart
- **Couleurs harmonisées** :
  - Chart : barre `Engagement (estimé)` passée du violet au **gris clair** (`#94a3b8`)
  - Modal : card Engagement passée en gris (gradient slate + texte `#475569`, picto ▮ gris)
  - **Buffer reste totalement violet** (#8b5cf6) : card hachurée, icône 🛡️, lignes ticket teintées — sémantique visuelle claire
- **Buffer (réservé) ajouté au hover graphique** :
  - `computeVelocityHistory` calcule `bufferPoints` = somme des SP des tickets `label='Buffer'` du sprint
  - `computeCurrentSprintEntry` idem pour le sprint courant
  - Tooltip chart : `Buffer (réservé) : X pts (Y% de l'engagement)` — ligne affichée uniquement si bufferPoints > 0
  - Limitations : pour les sprints clos non chargés en base, bufferPoints = 0 (besoin d'un fetch JIRA pour avoir les tickets) ; affiché correctement pour le sprint actif et les sprints PI-named

## [3.6.18] - 2026-05-22

### Engagement en gris clair, Buffer reste violet
- **Chart** : barre `Engagement (estimé)` passée du violet au **gris clair** (`#94a3b8` slate-400) — couleur neutre cohérente avec la ligne "Moyenne" mais distincte du Buffer
- **Modal** : card `Engagement (estimé)` passée du violet au gris clair (gradient `#94a3b8` 16% + texte `#475569`) + picto ▮ gris
- **Buffer (réservé)** reste totalement violet (#8b5cf6 / #7c3aed / #6d28d9) : card hachurée, icône 🛡️, lignes ticket teintées
- Sémantique visuelle claire : violet = Buffer (capacité réservée label) ; gris = Engagement (snapshot commitment)

## [3.6.17] - 2026-05-22

### Fix : désambiguïsation Buffer / Engagement
- **Problème** : le hover du chart affichait "Buffer estimé" = **total estimé du sprint** (snapshot JIRA Velocity), incohérent avec le label "Buffer" des tickets (capacité réservée, souvent une fraction du total)
- **Chart** : la barre violette + tooltip renommés `Engagement (estimé)` — c'est sémantiquement ce qui est mesuré (commitment JIRA)
- **Modal** :
  - Card existante renommée `Buffer (estimé)` → **`Engagement (estimé)`** + nouveau picto ▮ violet (cohérent chart) + label "X% réalisé"
  - **Nouvelle card `Buffer (réservé)`** ([sprint_tickets_modal.js:55-58](squad-board/static/js/components/sprint_tickets_modal.js#L55-L58)) : somme des Story Points des tickets ayant le label `Buffer`
    - Sub-label : `N tickets · X% de l'engagement`
    - Visuel distinctif : **pattern hachuré violet** + icône 🛡️ avant le label
    - Apparaît dynamiquement après fetch JIRA aussi (gestion dans `_rerenderBody`)
- Maintenant le hover graphique et la modal sont cohérents : `Engagement` désigne le commitment, `Buffer` désigne les tickets-label réservés

## [3.6.16] - 2026-05-22

### Modal vélocité — label Buffer en violet
- **Icône 🛡️** pour les tickets ayant le label `Buffer` (capacité réservée pour imprévus) — priorité sur l'icône par type
- **Chip "Buffer"** violet à côté du leader (pill arrondie, cohérent avec les autres tags)
- **Ligne ticket teintée violet** : gradient horizontal `#8b5cf6` 8% → 2% → transparent + bordure gauche violette pleine 3px (via `box-shadow: inset 3px 0 0`)
- **Hover renforcé** : gradient un peu plus opaque pour rester lisible
- **Drop-shadow violet** sur l'icône 🛡️ pour la mettre en valeur
- Cohérence visuelle totale avec la barre **Buffer (estimé)** du chart vélocité (même couleur `#8b5cf6`)

## [3.6.15] - 2026-05-22

### Modal vélocité — fetch des sprints clos + icône ActionRetro
- **Sprints passés cliquables** : les tickets d'un sprint clos ne sont pas en base (la sync préserve la perf en ignorant les sprints clos) → au clic, **fetch à la demande** depuis JIRA via `/rest/agile/1.0/sprint/{id}/issue`
  - Spinner animé pendant le chargement (`.sb-modal-spinner` + animation `sb-spin`)
  - Pagination jusqu'à 2000 tickets / sprint (hard cap 20 pages × 100)
  - **Parallélisation** : `Promise.allSettled` quand plusieurs sprint IDs (cas cross-team)
  - **Chip "⚡ Chargé depuis JIRA"** ajoutée dans le header pour signaler l'origine des données
  - **Clic ticket fetched** = ouvre dans un nouvel onglet JIRA (`/browse/{key}`) via `window.open` (vs `openTicketModal` pour les tickets en base)
  - Gestion d'erreur réseau avec carte d'erreur dédiée
- **Icône ActionRetro** : 🔁 affichée pour les tickets ayant le label `ActionRetro` (priorité sur l'icône par type)
  - Bonus : 🩺 pour `Postmortem`, 🤝 pour `CoP`/`CommunityOfPractice`, 🔧 pour `Adapt`
  - Tooltip enrichi : « task · Action Retro »
- **Données enrichies** : `computeVelocityHistory` et `computeCurrentSprintEntry` exposent maintenant `jiraId`, `jiraIds[]` et `state` (utilisés par la modal)

## [3.6.14] - 2026-05-22

### Carte Vélocité — clic sur barre = modal de détails du sprint
- **Click handler** ajouté sur le chart vélocité ([charts.js:728-738](squad-board/static/js/components/charts.js#L728-L738)) : clic sur une barre (Vélocité ou Buffer) ouvre une modale dédiée
- **Curseur pointer** au hover via `onHover` pour signaler l'interaction
- **Nouveau composant** [sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) :
  - **Header** : icône + nom du sprint + badge état (en cours / clôturé) + chips équipe + date fin + chip warning si sprint en cours
  - **Cards stats** (auto-fit grid) : Vélocité primaire, Tickets, Story Points, Buffer (si dispo) — gradient violet sur la card Buffer pour cohérence
  - **Liste des tickets groupés par statut** (todo / inprog / review / test / blocked / done) avec :
    - Header de groupe coloré (gradient à la couleur du statut) avec dot pulsé, nom, count, total pts
    - Lignes ticket : icône type, clé monospace, titre, leader (initiales rondes), priorité (chip coloré), points (chip primary)
    - **Hover** = padding-left animé + fond teinté statut + cursor pointer
    - **Clic ticket** = ferme la modal + ouvre la modal de détail du ticket (`window.__squadBoard.openTicketModal`)
  - **État vide** : message d'aide expliquant que les sprints clos n'ont pas leurs tickets en base (la sync ne charge que actif/futurs/PI-named) — pédagogique
- **Animation** : fade-in overlay + slide-up modal via `cubic-bezier(0.16, 1, 0.3, 1)`
- **Esc** ou clic backdrop pour fermer

## [3.6.13] - 2026-05-22

### Carte Vélocité — Buffer (estimé) + sprint en cours
- **Buffer (estimé)** affiché en barre violette translucide en arrière-plan de chaque vélocité (overlay grâce à `grouped: false` Chart.js + `barPercentage` 0.95 vs 0.6)
  - **Toggleable via clic dans la légende** (comportement Chart.js natif, défaut visible)
  - Données issues de `velocityStatEntries[*].estimated.value` du Velocity Chart JIRA (capturé dans sync.js)
- **Sprint en cours en bout de chart** : dérivé du sprint actif via nouveau helper `computeCurrentSprintEntry(tickets, sprintInfo, team)`
  - Vélocité = somme des points done locaux (live, plus à jour que la snapshot JIRA)
  - Estimé = somme totale des points du sprint
  - **Exclu de tous les KPIs** : moy. 3 derniers, tendance, record, stabilité, % vs cible (les stats restent stables même quand le sprint courant change)
  - Barre vélocité affichée en **gris muté** (au lieu de la palette rouge/orange/bleu/vert qui code la performance)
  - Tooltip dédié : « Sprint en cours — non compté dans les stats »
- **Sparkline** : sprint courant en hachures gris (style `.velocity-spark-bar--current`)
- **KPI Dernier renommé "dernier clos"** — clarifie qu'on ne montre PAS le sprint en cours
- **Sous-titre carte** : `N sprints clos + 1 en cours (non comptés) · moy. X pts/sprint`
- **Tooltip enrichi** : affiche le buffer + ratio réalisé en plus des écarts moyenne/objectif

## [3.6.12] - 2026-05-22

### Fix : endpoint Velocity JIRA corrigé
- L'URL `rest/agile/1.0/board/{id}/velocity` retournait **404** : cet endpoint n'existe pas dans l'API publique JIRA
- Remplacé par l'endpoint Greenhopper qui alimente le Velocity Chart natif : `rest/greenhopper/1.0/rapid/charts/velocity.json?rapidViewId={boardId}`
- Backend : `rest/greenhopper/` ajouté à l'allowlist du proxy `/jira/*` dans [main.py:1881](squad-board/main.py#L1881)
- Optim : appel seulement si le board a au moins un sprint clos (évite les requêtes inutiles)
- Catch silencieux pour les boards sans estimation activée

## [3.6.11] - 2026-05-22

### Vélocité historique récupérée directement depuis JIRA
- **Problème** : la sync ne charge que les tickets du sprint actif + futurs + PI-named ; les tickets des sprints **clôturés** ne sont jamais récupérés, donc la dérivation `tickets[done] × sprintName` retournait toujours 0 sprint
- **Solution** : appel de l'endpoint dédié `/rest/agile/1.0/board/{boardId}/velocity` pendant le scan des boards scrum → récupère les **story points complétés** par sprint (les ~7 derniers clos) **sans charger les tickets**
- **Enrichissement de `teamSprints[]`** : chaque sprint clos a maintenant un champ `velocity` (SP livrés) en plus de `state`, `startDate`, `endDate`, etc.
- **Helper `computeVelocityHistory` mis à jour** : priorité 1 = `sprint.velocity` (JIRA) ; priorité 2 = somme des points done des tickets locaux (fallback pour setups sans estimation activée)
- **Log de sync** : `Sprints collectés : N entrées | M avec vélocité JIRA | sprintInfo global : ...`
- Persistance transparente : `team_sprints` est déjà une colonne JSON dans `sprintconfig` → aucune migration nécessaire

## [3.6.10] - 2026-05-22

### Fix : historique de vélocité jamais alimenté
- **Bug** : `store.velocityHistory` initialisé à `[]` n'était **jamais** alimenté par la synchro JIRA ni nulle part — résultat : carte "Pas encore d'historique de vélocité" affichée même avec des sprints clôturés en base
- **Solution** : nouveau helper `computeVelocityHistory(tickets, sprintInfo, team)` dans [utils.js](squad-board/static/js/utils.js) qui dérive la vélocité à la volée depuis `sprintInfo.teamSprints[]` (state='closed') et les tickets locaux `status='done'` (somme des points par sprint)
- **Comportement par équipe** :
  - Équipe sélectionnée : sprints de cette équipe uniquement (key = `name|team`)
  - "Toutes les équipes" / aucune : agrégation cross-team par nom de sprint (somme des points livrés par PI/sprint)
- **Filtrage** : sprints à vélocité 0 masqués (tickets purgés ou jamais done)
- **Tri** : ancien → récent par `endDate` (le chart prend `lastIdx` = dernier sprint = plus récent)
- **Branché dans** : [dashboard.js](squad-board/static/js/views/dashboard.js), [roadmap.js](squad-board/static/js/views/roadmap.js), [infopanel.js](squad-board/static/js/components/infopanel.js) (alerte "vélocité en baisse")
- Suppression des `[...velocityHistory].reverse()` désormais inutiles (helper retourne déjà l'ordre attendu par le chart)
- `store.velocityHistory` conservé comme champ d'état legacy (commenté)

## [3.6.9] - 2026-05-22

### Carte Vélocité — refonte avec KPIs et chart enrichi
- **Header KPIs** (6 chips compacts) au-dessus du chart :
  - **Moy. 3 derniers** (KPI primaire, fond bleu)
  - **Tendance** (↗/↘ % vs 3 sprints précédents) — couleur vert/orange selon le sens
  - **Dernier sprint** (valeur brute)
  - **Record** ⭐ (meilleure vélocité observée)
  - **Stabilité** (label + coefficient de variation CV%) — vert si très stable, rouge si instable
  - **vs Objectif** 🎯 (% du dernier sprint vs `piInfo.velocityTarget`) si défini
- **Sparkline** sous le chart : mini-barres pour tous les sprints, dernier sprint en couleur primaire pleine, record en vert
- **Bordure gauche colorée** (gradient) selon la tendance générale : vert si en hausse ≥10%, orange si baisse ≥10%, bleu sinon
- **Chart enrichi (`renderVelocityChart`)** :
  - **Barres colorées** selon performance vs moyenne globale : vert ≥+10%, bleu entre ±10%, orange entre −10/−20%, rouge < −20%
  - **Ligne horizontale "Moyenne"** (gris pointillé) — référence visuelle immédiate
  - **Moyenne glissante 3 sprints** (ligne violette)
  - **Objectif** (ligne ambre pointillée) si `velocityTarget` défini
  - **Tooltip enrichi** : moy. 3-sprints, écart vs moyenne, écart vs objectif

## [3.6.8] - 2026-05-22

### PI Objectives attainment — refonte esthétique cohérente
- **Bordure gauche en gradient** sur la card `.pi-obj-attain` (cohérent sprint-header), couleur dynamique selon le score (vert/orange/rouge/violet)
- **Track 12px** avec `inset shadow` (au lieu de 10px plat)
- **Fill avec gradient + drop-shadow** colorés selon le score
- **Bonus zone (>100%)** : rayures plus larges (5px), `border-radius`, ombre verte subtile
- **Marqueur cible 80%** : trait + point 10×10 avec ring blanc + shadow (cohérent today marker)
- **Échelle scale repositionnée** : "80% cible" centré sur le marqueur (au lieu de réparti à part égale) — alignement vertical avec la ligne
- **Variables CSS `--accent-color`** pour découpler couleur logique de classe (plus DRY)

## [3.6.7] - 2026-05-22

### Modal calendrier — barre sprint alignée sur le style dashboard
- Layout vertical (head au-dessus, track en dessous full-width) pour cohérence visuelle avec le sprint-header dashboard
- **Bordure gauche colorée** (gradient à la couleur de l'équipe) — identité forte
- **Émoji 📌** devant le nom du sprint, taille de police harmonisée
- **Chips dates** et **chip J-N coloré** (pastilles arrondies) — remplace les spans inline disparates
- **Badge état pastille** (Clos / Actif / À venir) en pill arrondi
- **Track plus haut** (12px) avec gradient + ombre portée à la couleur de l'équipe
- **Today marker** : point 10×10 avec ring blanc + drop-shadow (cohérent avec dashboard)
- **Échelle dates** plus lisible : 10px avec tabular-nums, label centré sur fond blanc
- **Bandeau objectif 🎯** : padding/radius cohérents

## [3.6.6] - 2026-05-22

### Sprint header dashboard — refonte esthétique
- Layout vertical (au lieu d'un flex justify-between) → meilleure homogénéité, occupe toute la largeur disponible
- **Bordure gauche colorée** (gradient violet) sur le sprint-header pour une identité visuelle forte
- **Chip "J-N"** en pastille violette (ou orange si retard) à côté du nom du sprint
- **Chips stats** : `4/184 pts` en gros + chip écart coloré (vert avance / orange retard) — plus de petit texte aligné à droite
- **Objectif sprint** affiché en bandeau dédié avec emoji 🎯 et bordure gauche violet clair
- Barre de progression plus haute (12px) avec **gradient sur les fills** et **ombre portée** subtile à la couleur du statut
- **Label % accolé** à la fin du fill points (pastille blanche avec bordure) — lecture instantanée du pourcentage
- **Marqueur "aujourd'hui"** : point noir 10×10 avec ring blanc + shadow pour bien ressortir, label date du jour en gras avec puce
- Animations cubic-bezier(0.16, 1, 0.3, 1) pour les transitions de largeur

## [3.6.5] - 2026-05-22

### UX panneau latéral + dashboard
- **`+N autres` cliquable** dans le panneau aside (groupes de tickets par statut + buffer) : expand/collapse de la liste cachée avec animation chevron ▾/▴
- **Clic sur un mini-ticket** dans le panneau aside → ouvre la modale du ticket (la zone redevient interactive)
- **Barre sprint dashboard enrichie** : barre simple `width:X%` remplacée par un track avec :
  - **Fond temps écoulé** (violet clair) — visualise où on en est dans la durée
  - **Avant-plan points livrés** (vert/orange/rouge selon %)
  - **Marqueur "aujourd'hui"** (trait vertical noir + point) à la position temporelle exacte
  - **Échelle dates** sous la barre : `12 mai`, `aujourd'hui (22 mai)`, `25 mai`
  - **Texte d'écart** : `+8% d'avance` (vert) ou `-15% de retard` (orange) — comparaison instantanée pts vs temps

## [3.6.4] - 2026-05-22

### Dashboard — atteinte des objectifs PI
- Nouvelle section **Objectifs PI** dans le dashboard (filtre équipe respecté) avec calcul du **score de prédictibilité SAFe** : `(BV commis livrés + BV stretch livrés) / BV commis total`
- Score affiché en grand (vert ≥100%, orange ≥80%, rouge sinon) avec libellé détaillé `Atteinte X/Y BV commis +Z BV stretch`
- **Barre d'atteinte** avec marqueur "cible 80%" et zone bonus hachurée pour les stretch livrés au-delà de 100%
- **Récap chips** : nb commis / stretch / atteints / en cours / à faire
- **Liste détaillée** triée (commis d'abord, puis par BV décroissant) : icône statut, texte, équipe, type (Commis/Stretch), BV

## [3.6.3] - 2026-05-22

### Fix
- **Doublons d'équipes en sync rapide** : la sync incrémentale (mode merge) créait une nouvelle ligne Team à chaque sync au lieu de mettre à jour l'existante, car sync.js n'envoie pas d'`id` pour les teams. Lookup par nom ajouté en fallback dans le merge handler.
- **Dédoublonnage automatique** des teams existantes au début de chaque merge — garde le plus ancien par nom, supprime les doublons accumulés des anciennes versions.

## [3.6.2] - 2026-05-22

### Configurable + lisibilité
- **Période de sync rapide configurable** dans Paramètres → Plugin JIRA (`sb-sync-quickDays`, default 14). Le bouton topbar reflète dynamiquement la valeur (`JIRA 7j` / `JIRA 30j` / ...) et l'item correspondant du dropdown est mis en évidence
- **Graduation temporelle** sur la barre sprint de la modal calendrier : ticks verticaux toutes les semaines + échelle dates concises (`12 mai`, `19 mai`, `25 mai`) sous le track — permet de se repérer rapidement dans la durée du sprint
- Fix : la barre sprint ne se cachait plus si la semaine navigée tombait juste après/avant le sprint (puisque `getSprintForTeam` gère déjà le sprint le plus proche)

## [3.6.1] - 2026-05-22

### Sync JIRA incrémentale
- **Sync rapide** par défaut sur le bouton JIRA topbar : filtre les JQL sur `updated >= -14d` + mode `merge` (préserve l'existant non touché)
- **Split button** avec dropdown : choix entre 7j / 14j / 30j / Sync complète
- **Sync complète** (replace) accessible via le dropdown, avec confirmation stylée (action destructrice — efface puis ré-importe tout)
- Toast adapté : `Sync rapide 14j terminée — X tickets, Y features`
- Affichage initial : `JIRA 14j` pour faire comprendre le mode par défaut

### Cohérence sprint passé / présent / futur dans la modal calendrier
- Sync collecte désormais TOUS les sprints du board (state=closed,active,future, max 50 par board) avec fallback 3 appels séparés si le state combiné échoue
- `getSprintForTeam(team, sprintInfo, targetDate)` retourne le sprint qui contient la date cible (semaine navigée)
- Navigation ← / → dans la modal : la barre suit avec le bon sprint, badge état (Clos / Actif / À venir), objectif d'époque
- Fix bug : `String(Date).slice(0,10)` ne donnait pas une ISO date → matching toujours faux. Remplacé par helper `_toIso(d)` qui gère Date et string

## [3.6.0] - 2026-05-21

### Sync JIRA - robustesse et couverture
- **Pagination réécrite** via helper `_paginateJql` : utilise `nextPageToken` (API moderne JIRA Cloud) avec fallback `startAt`, dédoublonnage `seenKeys`, hard cap 100 itérations. Corrige les imports plafonnés à 100 items
- **Passe PI-named-sprint** : récupère les issues dont le sprint s'appelle directement `"PI30"` / `"PI#30"` (cas GCOM) — couvre les projets qui ne créent pas d'issues type `Feature`
- **Normalisation auto des équipes** : `"GCOM - Fuego"` (JIRA Team[Team]) → `"Fuego"` via match avec les boards locaux (aucune config manuelle)
- **Sprints multiples par équipe** : `teamSprints[]` collecté pendant la sync, un sprint actif par board scrum. `getSprintForTeam(team, sprintInfo, targetDate)` pour la sélection contextuelle
- **Champ Story Points propagé** côté backend (`Feature.points`) + helper `f.points || childPts || 0` dans les vues
- **Rang JIRA préservé** : assignation séquentielle dans l'ordre `ORDER BY rank ASC`, persisté en base
- **Field discovery élargi** : Sprint, Team[Team], Story Points résolus par `clauseNames` ou nom (accepte input JQL `"Sprint"` ou ID `customfield_10021`)
- **Push sprint vers JIRA** : bouton dans Paramètres avec confirmation détaillée (PUT `/rest/agile/1.0/sprint/{id}`)

### Roadmap PI suivant
- **Vue Liste** (collapsible accordions) en plus de la vue Cartes (toggle Cartes/Liste)
- **Drag-and-drop** sur les 3 vues (current + next cartes + next liste) via helper factorisé `_wireFeatureDrag`
- **Statut "rollup" parent** : badge dérivé des enfants (blocked > done > inprog > todo)
- **Features héritées** : remontée auto via la chaîne `ticket → epic → feature` quand la feature est tagguée PI-1 mais a des tickets PI suivant
- **Proxy-epics** : epics avec children PI suivant mais sans feature parente, affichés comme proxy-features (badge violet `epic`)
- **Carte Prédictibilité** : moyenne SP livrés sur 2 PI précédents, capacité jours-homme nette (membres × sprints × jours - absences), tooltip détaillé
- **Lien JIRA externe** sur chaque clé de la vue liste, opacité 0 → 1 au survol

### Calendrier (modal cal-week)
- **Pagination semaine** : boutons `‹ • ›`, badge "Cette semaine"/"Semaine prochaine", raccourcis clavier `← → T Échap`
- **Barre sprint** sous le header : nom + dates + badge J-N + visualisation position semaine dans le sprint + marqueur "aujourd'hui"
- **Objectif sprint** affiché en bandeau coloré avec bordure gauche à la couleur de l'équipe
- **Bouton sync** dans le header avec tooltip "Dernière synchro : …"
- **Demi-journées OFF** (`"Elsa - 1/2 OFF"`, `"Marc - PM OFF"`) reconnues et affichées comme chip avec badge `½` (au lieu d'une ligne event)
- **Sprints passés/futurs** affichés selon la semaine navigée — cohérence du contexte

### Info-panel (sidebar)
- **Carte action "Voir le calendrier"** au-dessus de la card Features, avec compteur calendriers + dernière sync
- **Compteur Features filtré par équipe** (bug : affichait le total global)

### Page de test `/tests/jira-explorer.html`
- Refonte UX avec tabs (Inspection / Snapshot / JQL), topbar sticky, presets chips colorés (Fuego PI#30, Features GCOM, Epics sans parent…)
- **Hash routing** : `#tab=jql&jql=…`, `#tab=inspect&key=GCOM-1234&chain=1` (back/forward navigateur supporté)
- **Comparaison locale ↔ JIRA** : bannière `N / M synchro` + colonne "Local" par ligne (✓ type / ✗ absent)
- **Bouton Synchro** : upsert via `/api/import?mode=merge` (préserve rank/points existants)
- **Historique JQL** : 15 dernières requêtes en localStorage, panneau toggle + datalist autocomplete
- **Colonne SP** dans le tableau JQL, fetch story points field

### UX globale
- **Bouton "Mes tickets"** (topbar) : filtre par `leader === currentUser`, prompt initial pour saisir son nom (stocké localStorage)
- **Recherche temps réel** sur Sprint et Kanban : input avec debounce 200ms (id, titre, leader, labels), restauration focus après re-render
- **Confirmations destructives stylées** : helper `confirmDanger(title, msg)` remplace `confirm()` natifs (modale avec bouton rouge, raccourcis `Échap`/`Entrée`)
- **Bouton "Copier"** sur l'en-tête modal : copie `GEX-17193 - Titre` dans le presse-papier
- **Membres dérivés des absences** : agenda, support, PI Planning, Roadmap utilisent `deriveMembersFromAbsences(absences, members)` (source de vérité CSV RH)
- **Statut feature dérivé** : badge utilise le rollup des enfants au lieu du statut JIRA propre (cohérence d'avancée)
- **Bouton ouvrir epic/feature** dans la modal ticket (à côté du dropdown Epic)

### Paramètres
- **Configuration sync JIRA** repensée : Max tickets/features/epics, Max boards (vide = illimité), Champ Sprint, Champ Équipe (accepte JQL ou customfield_XXXXX)
- **Lien Board JIRA** depuis le formulaire Sprint
- **Rotation support** : membres autocomplétés depuis les absences (CSV RH)

### Backend
- Nouvelles colonnes : `feature.rank`, `feature.points`, `sprintconfig.jira_id`, `sprintconfig.jira_board_id`, `sprintconfig.team_sprints`
- Proxy `/jira/*` gère les réponses vides (204 No Content) — fix pour PUT sprint
- Epic `feature_id` correctement persisté depuis sync (`epic.parent.key` envoyé en `"feature"` au lieu de `"epic"`)

## [3.5.3] - 2026-04-15

### Rapports - Message Slack fun pour le sondage
- Bloc "Message Slack - Sondage Mood Meter" en haut de la section Mood Meter / ROTI
- 10 templates thématiques (roller coaster, film, énergie, cuisine, musique, jeu vidéo, météo, GIF, course, avion) avec rotation automatique par numéro de sprint (sprintNum % 10)
- Layout 2 colonnes : message brut copiable (codes emoji Slack) + aperçu visuel dark (fond #1a1d21)
- Bouton "📋 Copier" pour envoyer directement dans Slack
- Bannière info "À envoyer au plus tard le…" calculée 2 jours ouvrés avant la fin du sprint

## [3.5.2] - 2026-04-15

### Rapports - section Mood Meter / ROTI
- Nouvelle section non-exportable dans les Rapports : sondage de satisfaction par equipe
- Vote emoji 😡😟😐🙂😍 (1-5) persisté en base (`MoodVote`, clé `team × piSprint`)
- Barres de distribution par niveau pour chaque equipe
- Score moyen large (X/5) coloré vert/orange/rouge selon seuil
- Badge global (moyenne toutes equipes + total votes)
- Sparkline historique si votes sur plusieurs sprints/PI
- Bouton "↩ Annuler" pour retirer son dernier vote
- Backend : ajout `DELETE /api/mood/{id}` + chargement dans `loadAllData`

## [3.5.1] - 2026-04-14

### Corrections
- **Vue Amelioration** : affiche desormais les tickets ordinaires categorises par labels (retro, postmortem, cop, adapt) en plus des RetroItems crees directement dans le board
- **Sync JIRA** : nouvelle etape 6 qui fetche via JQL les tickets avec labels amelioration (Retro, Amelioration, postmortem, Adapt, CoP-methodo…) independamment du sprint actif
- **Normalisation labels** : les accents dans les labels JIRA (Retro, Amelioration, CoP-methodo) sont normalises avant la categorisation  
- **Demo data** : ajout de 8 tickets retro-tagges (2 par categorie) et 5 tickets support pour peupler ces vues des le premier lancement

## [3.5.0] - 2026-04-14

### Nouvelles vues
- **Support dashboard** (`S`) : rotation actuelle, tickets support par priorite/equipe, metriques SLA (age moyen, critiques)
- **ROAM board** (`R`) : matrice 5 quadrants (Non traites / Pris en charge / Acceptes / Mitiges / Resolus) avec CRUD complet
- **PI Calendrier** (`5`) : vue timeline du PI avec blocs de sprints par equipe, events, rotation support et marqueur "Aujourd'hui"

### Ameliorations existantes
- **Notifications** : badge rouge sur Dashboard/Sprint/Kanban indiquant les tickets modifies depuis la derniere visite
- **Export PDF** : bouton dans la vue Rapports (`window.print()` + CSS `@media print`)
- **Epic Burndown** : nouvelle section dans Rapports avec barre de progression par epic (tickets + points)
- **PI Objectifs BV** : champs Business Value (0-10) et Commis/Stretch sur chaque objectif PI dans Parametres
- **Backlog ranking** : drag & drop sur la liste des features dans Roadmap, rank persiste en base
- **Graphe de dependances** : visualisation SVG des liens entre features dans Roadmap

### Backend
- Nouveau modele `Risk` (quadrant, impact, probabilite, mitigation) avec CRUD `/api/risks`
- Champs `rank` et `dependencies[]` sur `Feature` (migration automatique SQLite)
- Route `/api/features/rank` (POST) pour mise a jour bulk du rang
- Export JSON inclut maintenant les risques

### Frontend
- 3 nouveaux NAV_ITEMS : Support (`S`), ROAM (`R`), PI Calendrier (`5`), Parametres passe a `9`
- Nouvelles icones SVG : `i-shield`, `i-clock`, `i-git-branch`, `i-download`
- 14 tables SQLite au total

## [3.4.0] - 2026-04-12

### Scrum Master features (6/6)
- **Drag & drop** : deplacer les tickets entre colonnes par glisser-deposer sur le board Sprint
- **Scope creep detection** : alerte quand des tickets sont ajoutes apres le debut du sprint
- **Velocity trend alert** : alerte quand la velocity baisse de >15% sur les 3 derniers sprints
- **Retro board** : nouvelle vue Amelioration (`6`) avec 4 swimlanes (Retro, Post-mortem, CoP, Adapt), CRUD complet
- **Mood meter / ROTI** : vote de satisfaction (1-5) par equipe dans PI Planning → onglet Mood
- **Fist of Five** : vote de confiance PI par equipe dans PI Planning → onglet Fist of Five

### Backend
- Nouveau modele `RetroItem` (source, status, team, owner) avec CRUD `/api/retro`
- Nouveau modele `MoodVote` (type mood/fist, team, value 1-5) avec CRUD `/api/mood`
- 13 tables SQLite au total

## [3.3.0] - 2026-04-12

### Inline styles cleanup
- 40+ classes CSS utilitaires creees (text-danger, inline-flex-center, chart-h-sm, etc.)
- ~90 inline styles statiques remplaces par des classes dans 14 fichiers JS

### Settings collapsibles
- Toutes les sections Parametres sont collapsibles avec chevron
- Membres, Absences, Events, Support plies par defaut

### Sidebar equipes groupees
- Les equipes sont regroupees par ligne produit dans la sidebar
- Bouton "Tous" renomme, plus compact

### Equipes en grille
- Section Equipes dans Parametres affichee en grille multi-colonnes

### Documentation
- 6 guides persona : Scrum Master, Product Owner, RTE, Developpeur, Support, Project Manager
- Backlog de 46 features classees par persona et priorite

## [3.2.0] - 2026-04-11

### Rapports enrichis
- 7 sections : Sprint, Flow, Support, Roadmap, Equipes, PI, Complet
- 3 formats visuels : Texte, Slack (preview dark), Confluence (preview table)
- Preview Slack fidele (fond #1a1d21, badges colores, emojis)
- Preview Confluence fidele (tableaux, lozenges de statut)
- Copier par section, sticky controls

### KPI colorises
- Cartes metriques avec bordure gauche coloree + icone emoji
- Couleur dynamique selon la valeur (vert/jaune/rouge)
- Dashboard, Kanban, PI Planning, Roadmap

### Icone Roadmap
- Nouvelle icone carte (i-map) distincte de l'icone Rapports

## [3.1.0] - 2026-04-11

### Sprint view enrichie
- **3 modes de board** : Colonnes, Swimlanes (par assignee), Liste compacte - persiste en localStorage
- **Quick filters** : Bloques, Non assignes, Critique/High + recherche texte
- **Banniere support** : qui est au support cette semaine
- **Activite du jour** : changements groupes par jour avec badges de transition
- **Charts collapsibles** : section metriques avec etat persiste
- **Sticky header** : sprint info + filtres colles sous le topbar

### Modal enrichie
- Cycle time + Lead time en chips dans la barre meta
- Barre de progression sprint avec marqueurs debut/fin ticket
- Navigation prev/next (boutons + fleches ←→)
- Priorite colorisee avec emoji
- Epic avec titre resolu

### Cartes
- Compteur de commentaires (badge 💬)
- Alerte synchro si >2h (banniere jaune)

### Sidebar
- Tooltips hover sur les compteurs de statut (liste des tickets)
- Buffer tracking dans le sprint header

### Events (Faits marquants)
- Modele Event : incident, gel, jalon, periode, info
- CRUD complet + UI dans Parametres

### Support rotation avancee
- Verrouillage, mode semaine (Lun→Ven / Ven→Jeu / Mer→Mar)
- Effectif par semaine configurable
- Shuffle automatique sur 4 semaines

### Config PI
- Numero PI, nom, sprints/PI, duree sprint, objectif velocity

## [3.0.0] - 2026-04-10

### Migration SQLite
- Remplacement des fichiers JSON par SQLite via SQLModel
- 1 fichier `data/board.db` pour toutes les entites
- Transactions ACID, requetes SQL ciblees

### Leader + Contributors
- Champ `leader` (responsable principal) et `contributors[]` (secondaires)
- Avatars empiles sur les cartes, multi-select dans les formulaires
- Retrocompat `assignee` = alias de `leader`

### Groupes (Lignes produit)
- Modele TeamGroup : nom, couleur, equipes[]
- Filtre topbar par groupe ou equipe individuelle

### Absences + Support rotation
- Modeles Absence et SupportRotation avec CRUD + import bulk

## [2.0.0] - 2026-04-09

### Board autoporteur
- CRUD complet pour tickets, features, epics, membres, equipes
- Commentaires sur les tickets
- Sprint et PI configurables
- Import/Export JSON
- JIRA comme plugin d'import optionnel

## [1.0.0] - 2026-04-09

### Version initiale
- FastAPI backend + proxy JIRA
- 6 vues : Dashboard, Sprint, Kanban, PI, Rapports, Parametres
- Mode demo automatique
- Dark mode, responsive, raccourcis clavier
