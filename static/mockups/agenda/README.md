# Agenda — vue itération : 3 directions + 1 synthèse

Maquettes statiques pour enrichir `/agenda` quand **une équipe est sélectionnée** :
visualiser sur une itération les évènements **Scrum** et **SAFe** sur une frise
chronologique colorée, et pouvoir en sortir un **récapitulatif Slack** groupé
chronologiquement, avec les récurrences indiquées (`1x/sem.`, `1x/ité.`…).

Rien du site n'est modifié — ces fichiers vivent uniquement dans `static/mockups/agenda/`.

## Ouvrir

```bash
python main.py                       # puis http://localhost:3001/mockups/agenda/
```

Ou en double-cliquant `index.html` : les CSS sont référencés en relatif
(`../../css/tokens.css`), et `data.js` / `shell.js` sont des scripts classiques —
pas de module ES — donc tout fonctionne aussi en `file://`.

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'entrée : contexte, les 4 options, la grammaire commune |
| `option-a-frise-couloirs.html` | Option A — frise en couloirs Scrum / SAFe / Ops |
| `option-b-agenda-dense.html` | Option B — sommaire de densité + agenda jour par jour |
| `option-c-cadence.html` | Option C — semaine type du rythme + frise des jalons |
| `option-d-synthese.html` | **Option D — la synthèse recommandée**, avec décalage d'itération |
| `shell.css` / `shell.js` | Chrome et helpers partagés (typage, récurrence, décalage, modale Slack) |
| `parts.css` / `parts.js` | Briques communes à B, C et D : tuiles de charge, grille du rythme, agenda dense |
| `data.js` | **Données réelles** extraites de `data/board.db` (voir plus bas) |

Chaque option a un bouton **🌓 Thème** (clair/sombre) et **📱 Mobile**, qui contraint la
scène à un vrai viewport de téléphone (390 × 780, avec son propre défilement) pour juger
les deux rendus sans redimensionner la fenêtre.

Les briques de B, C et D vivent dans `parts.css` / `parts.js` plutôt que recopiées dans
chaque page : une correction de la tuile de charge ou de la grille du rythme profite aux
trois, au lieu d'être appliquée à deux options sur trois et oubliée dans la dernière.

## Les données ne sont pas inventées

Le jeu de données est un extrait réel de la base, pour que les maquettes montrent
ce que produirait vraiment la fonctionnalité — cas tordus compris.

| | |
|---|---|
| Équipe | **Fuego** |
| Itération | **Fuego - Ité 30.6** — 21/08 → 04/09/2026 (11 jours ouvrés, 3 semaines calendaires) |
| Sources | `team_calendar.events_json`, `absence`, `supportrotation`, `sprintconfig.team_sprints` |
| Calendriers | `ERPC - Fuego` (équipe) + `ERPC - GLOBAL` (train, champ `team` vide = toutes équipes) |
| Volume | 51 évènements — 20 Scrum, 21 SAFe, 10 métier/ops |
| Contexte | 10 jours avec des « X - OFF », 5 congés saisis, la rotation support 30.6.1 |

Le script d'extraction (SQLite → `data.js`) est décrit dans « Comment `data.js` a été
produit » en fin de document.

## Les options

### A — Frise en couloirs

Les jours ouvrés en colonnes, un **couloir horizontal par famille** (Scrum, SAFe, Ops),
chaque évènement en pastille dans la case jour × couloir. La bande du bas rappelle les
absents et le support. Clic sur une pastille → panneau de détail (cadence, calendrier
source, nombre d'occurrences, alerte doublon).

- **Force** — la structure de l'itération saute aux yeux : le planning ouvre, l'ART Sync
  tombe au milieu, l'I&A et le PI Planning ferment. Les trous se voient aussi bien que
  les pics.
- **Limite** — c'est dense, et ça scrolle horizontalement sur petit écran. Le récap Slack
  qu'elle produit est le plus long des trois (le daily y apparaît 10 fois).

### B — Agenda dense chronologique

Une **sparkline de densité** en haut (une barre empilée Scrum/SAFe/Ops par jour, cliquable pour
aller au jour), puis les semaines côte à côte, jour par jour, chaque évènement en ligne
avec son badge de récurrence à droite. Bouton 📋 par jour, comme l'agenda actuel.

- **Force** — c'est la forme la plus proche du message Slack : on relit exactement ce
  qu'on s'apprête à coller. Et c'est la seule qui répond bien à la question quotidienne
  « c'est quoi la semaine prochaine ? ».
- **Limite** — moins « frise » que A : la vue d'ensemble passe par la sparkline, qui dit
  le volume mais pas la nature des évènements.

### C — Cadence & jalons

Sépare **ce qui se répète** de **ce qui n'arrive qu'une fois**. En haut trois tuiles de
charge (heures de rituels par semaine, part du train, nombre de jalons). Puis une
**semaine type** en grille horaire où chaque rituel récurrent apparaît **une seule fois**
avec sa cadence (hachures = une semaine sur deux). Enfin une **frise fine des jalons** :
uniquement les évènements ponctuels, ceux qui donnent sa forme à l'itération.

- **Force** — répond le plus directement à « indiquer bien les récurrences », et c'est la
  seule qui rend visible le **coût** : ~13 h de créneaux de rituels par semaine, dont une
  part imposée par le train. Un argument utilisable en rétro.
- **Limite** — ce n'est pas une frise chronologique au sens strict : le rythme est
  détaché du calendrier. Le repli mobile de la grille horaire est une liste, pas la grille.

### D — Synthèse *(recommandée)*

Assemble les trois morceaux retenus, dans l'ordre de lecture qui me paraît juste :

1. **Les tuiles de charge** de C, enrichies du **temps libre** — voir plus bas.
2. **⏱️ Le rythme** — la semaine type de C, mais **repliable** : c'est un fond de décor,
   qu'on referme une fois qu'on le connaît.
3. **📅 L'agenda dense chronologique** de B — sparkline + semaines jour par jour, celui
   qu'on consulte au quotidien et qu'on copie dans Slack.

Son récap Slack est le plus court à information égale : les rituels quotidiens et
hebdomadaires sont énoncés une fois en tête, le corps chronologique ne garde que les
moments de l'itération. Le daily y apparaît une fois, contre dix dans le récap de A.

**Le décalage d'itération** (`− 1 j` / `+ 1 j` / `Rétablir`) déplace tous les évènements
et recalcule tout — charge, semaine type, agenda, récap. C'est un bac à sable pour
éprouver la vue : un férié inséré, une itération repoussée. Un bandeau annonce ce qui
sort du cadre (`⚠️ 15 sur un week-end · non affichés`), parce qu'un décalage de +1 jour
projette tous les vendredis sur un samedi — c'est justement l'effet qu'on veut voir.
Aucune donnée n'est modifiée : les absences et le support restent lus à leur date source.

### Le temps libre

La barre de charge de C mesurait 100 % de réunions, ce qui donnait une impression fausse
de saturation. Elle se lit désormais sur **la semaine entière** — base explicite de
**35 h (5 × 7 h)** — avec un quatrième segment vert pour ce qui n'est pas réuni :
sur l'itération 30.6 de Fuego, **13 h 44 de rituels, 21 h 16 de libre**.

Trois nuances que les maquettes affichent plutôt que de les taire :

- c'est un **plafond**, pas un acquis : hors absences, hors interruptions, hors support ;
- ça suppose qu'on **assiste à tout**, ce qui est faux — les CoP et les syncs du train ne
  concernent pas tout le monde ;
- un rituel qui, sous décalage, tombe un week-end **sort aussi de la charge** — sinon la
  grille du rythme et la barre afficheraient deux chiffres contradictoires.

## Ce que les options partagent

- **Deux familles colorées**, plus une troisième discrète :
  🔵 **Scrum** (daily, planning, rétro, refinement, weekly, passation support) —
  🟣 **SAFe** (ART Sync, Coach Sync, CoP, I&A, PI Planning, System Demo, journées Innovation) —
  ⚪ **Métier & Ops** (MEP, Infra, points métier, Dump), qui ne relèvent d'aucune des deux
  et pollueraient la lecture si on les forçait dans l'une ou l'autre.
  🟢 **Temps libre** complète la palette dans les tuiles de charge (B, C, D).
- **La récurrence en toutes lettres** : `tous les jours`, `1x/sem.`, `1x/ité.`, `1x/mois`.
- **Les filtres agissent sur le texte Slack** : décocher SAFe produit un récap sans SAFe.
- **Un aperçu avant copie** dans la modale — on relit avant de coller dans un canal.

Le format Slack reprend celui déjà utilisé par « AGENDA DU JOUR » dans
[agenda.js](../../js/views/agenda.js) et [cal_banner.js](../../js/components/cal_banner.js) :
texte brut, `:emoji:`, `*gras*`, puces indentées de deux espaces.

## Mon avis

**D est la vue à coder si une seule doit l'être.** C'est la synthèse assumée : elle prend
l'agenda jour par jour de B — la forme la plus proche du message Slack, donc la plus sûre
pour relire avant de coller — et lui greffe la déduplication des rituels de C.

Le raisonnement : la demande contient deux besoins qui ne se satisfont pas au même endroit.
Voir la forme de l'itération est un besoin **ponctuel** (préparer une rétro, un PI Planning) ;
sortir un récap Slack propre est un besoin **hebdomadaire**. B sert bien le second sans
sacrifier le premier, parce que la sparkline donne 80 % de la vue d'ensemble pour 10 % de
la surface. Et ce que C apporte et que B n'avait pas, c'est d'afficher « Daily — tous les
jours, 9h45 » **une fois au lieu de dix** : le meilleur remède au récap à rallonge.

A reste plus belle et plus impressionnante, mais elle occupe tout l'écran pour une
information qu'on consulte une fois par itération — et sur un portable elle oblige à
défiler latéralement, ce qu'on veut éviter en réunion. Je la **garderais pour l'impression
et le PI Planning** : c'est le format qui se photographie et se colle dans une slide. Le
site a déjà `print.css`, et une frise en couloirs sur une A4 paysage est un support de
discussion honnête.

Deux réserves sur D, à trancher :

- **Le bloc « rythme » est ouvert par défaut** dans la maquette pour qu'on le voie. En
  usage réel je le replierais après la première visite (`localStorage`), sinon il repousse
  l'agenda sous la ligne de flottaison à chaque chargement.
- **Le décalage est un outil de conception, pas une fonctionnalité utilisateur.** Il sert à
  éprouver la vue pendant qu'on la construit. S'il devait rester, ce serait plutôt comme
  simulation de férié dans PI Planning — pas dans l'agenda.

Les tuiles de charge, elles, valent la peine indépendamment de l'option retenue — mais
leur place naturelle est peut-être une vue Santé / Rétro plutôt que l'agenda.

## Points à trancher avant d'implémenter

Ces sept points sont des décisions, pas des détails d'exécution — les maquettes ont fait
un choix pour chacun, il est révisable.

1. **La classification Scrum / SAFe n'a pas de source de vérité.** Elle est déduite du
   titre par expressions régulières, avec repli sur le calendrier d'origine (calendrier
   d'équipe → Scrum, calendrier sans `team` → SAFe). Ça marche bien ici parce que le train
   ERPC préfixe ses évènements, mais c'est fragile pour une équipe qui nommerait autrement.
   *Alternative* : une table de règles éditable dans Paramètres, ou un mapping par
   calendrier (`team_calendar.kind` : `team` / `train`).

2. **La fréquence est déduite, pas lue.** `services/ics.py` expose `recurring: true|false`
   mais jette la RRULE. Les maquettes calculent l'**écart médian entre occurrences du même
   `uid`** sur la fenêtre en cache (−1 mois / +4 mois) : 1 j → tous les jours, 7 → `1x/sem.`,
   14 → `1x/ité.`, 30 → `1x/mois`. C'est robuste sur les données réelles, mais ça dépend de
   la fenêtre : un rituel créé la semaine dernière n'aura pas assez d'occurrences.
   *Mieux* : ajouter `freq` et `interval` au payload dans `_parse_ics_events()` — l'info est
   déjà dans `rrule_prop`, elle est simplement jetée. Une dizaine de lignes.

3. **Les doublons inter-calendriers sont réels.** « ERPC - PI Planning » et « Journées
   Innovation » existent à l'identique dans `ERPC - Fuego` **et** `ERPC - GLOBAL` (même
   `uid`) : les maquettes dédoublonnent sur `(uid, start)`. Mais « [GCOM] Point Métier
   Fuego » apparaît deux fois le lundi 24/08, à 10h00 et 10h30, avec des `uid` **différents** —
   là c'est un vrai doublon d'agenda côté Google, pas un artefact. Les maquettes le
   **signalent** (bordure pointillée, ⚠︎) plutôt que de le masquer : masquer silencieusement
   ferait disparaître une information qui mérite d'être corrigée à la source.

4. **Une itération ne s'aligne pas sur les semaines.** Fuego 30.6 court du **vendredi**
   21/08 au **vendredi** 04/09 : 11 jours ouvrés sur **3** semaines calendaires. Un
   découpage naïf en paquets de 5 jours place les césures n'importe où — c'était le premier
   bug de ces maquettes. `weekGroups()` dans `shell.js` regroupe par lundi de rattachement ;
   c'est ce que comprennent les humains (« semaine du 24 août ») et c'est ce qu'il faut
   reprendre côté site.

5. **Le périmètre de l'équipe.** `expand_calendar_events(cals, team)` filtre déjà : un
   calendrier sans `team` est visible par toutes les équipes. C'est ce qui fait entrer le
   calendrier du train dans la vue Fuego — heureux hasard qui rend la fonctionnalité
   possible sans rien changer au back. À confirmer : une équipe dont le calendrier train
   serait renseigné avec une liste d'équipes (`GDEM` → `Estafette,Gabbiano,Initiale,Helica`)
   verra bien ses évènements SAFe.

6. **Quelle itération afficher ?** Les maquettes sont figées sur l'itération courante.
   La vue réelle doit suivre `getSprintForTeam(team, sprintInfo)` et proposer une navigation
   ité précédente / suivante — probablement alignée sur `sb-piOffset` déjà en place, plutôt
   qu'un nouvel état.

7. **Où ça vit dans la page.** Un onglet dans `/agenda` (Semaine | Itération) me semble
   plus juste qu'un empilement : la vue semaine actuelle répond à « qui est là ? », la vue
   itération à « qu'est-ce qui se passe ? ». Deux questions, deux onglets — et le hash
   `#agenda/{team}/{date}` peut accueillir un segment de plus.

## Écarts assumés avec le site actuel

- Les maquettes ajoutent trois familles de couleurs (`--k-scrum`, `--k-safe`, `--k-ops`)
  qui **n'existent pas encore** dans `tokens.css`. Elles sont définies dans `shell.css`,
  light et dark. À promouvoir en tokens si une option est retenue.
- `base.css` configure le `body` pour le shell du site : `display:flex`, `height:100vh`
  et surtout **`overflow:hidden`** — dans l'application, c'est `.main` qui défile, pas la
  page. `shell.css` lève les trois, sans quoi **rien ne peut défiler** et le bas des options
  longues reste inatteignable. Sans conséquence pour le site : la surcharge est locale aux
  maquettes.
- Corollaire à connaître si ces vues sont intégrées : un `overflow-x:auto` isolé fait passer
  `overflow-y` à `auto` par la spec CSS, ce qui recrée un conteneur de défilement piégeux.
  D'où le choix de laisser `.mk-stage` sans `overflow` en desktop et de confier le
  défilement horizontal aux enfants larges (frise, grille horaire, sparkline).
- Les maquettes n'utilisent pas les modules ES du site (`state.js`, `utils.js`) : elles
  sont volontairement autonomes pour rester ouvrables en `file://`. La logique réutilisable
  (`weekGroups`, déduction de fréquence, classification, format Slack) est isolée dans
  `shell.js` et transposable telle quelle.
- `esc()` est réimplémenté dans `shell.js` avec le même contrat que celui de `utils.js` —
  les maquettes passent toute donnée par `esc()` avant `innerHTML`, comme le veut la règle
  du site, pour que le code serve de base honnête à l'implémentation.

## Comment `data.js` a été produit

Extraction ponctuelle depuis `data/board.db` (lecture seule), le 24/08/2026 :

1. lire `team_calendar` et ne garder que les calendriers visibles par Fuego
   (champ `team` contenant l'équipe, ou vide) ;
2. dédoublonner les occurrences sur `(uid, start)`, convertir en heure de Paris ;
3. calculer l'écart médian entre occurrences du même `uid` **sur toute la fenêtre en cache**
   (pas seulement l'itération) pour en déduire la cadence ;
4. classer chaque évènement (`scrum` / `safe` / `ops`) ;
5. sortir les « X - OFF » dans `off[jour]`, joindre `absence` et `supportrotation`.

Pour régénérer sur une autre équipe ou une autre itération, il suffit de rejouer ces
étapes en changeant `TEAM` et les bornes — la structure de `data.js` est stable :
`{ team, iteration, today, events[], off{}, absences[], support[] }`.

## Vérification

La logique des quatre options a été exécutée sous Node avec un DOM factice : rendu des
quatre vues et génération des quatre récaps Slack, sans erreur ni `undefined` dans le HTML
produit. Le décalage est testé séparément sur `−1`, `+1`, `+2` et le retour à `0` — les
évènements tombent bien aux dates attendues, les absences suivent, et l'invariant
`charge + temps libre = base hebdomadaire` tient à chaque pas.

Deux erreurs trouvées par cette passe plutôt qu'à l'œil :

- le découpage en paquets de 5 jours ouvrés, qui plaçait la césure des semaines au mauvais
  endroit pour une itération démarrant un vendredi ;
- la barre de charge qui comptait encore, sous décalage, des rituels tombés le week-end que
  la grille du rythme avait déjà écartés — deux chiffres contradictoires à l'écran.

Le rendu visuel, lui, reste à juger dans le navigateur — c'est tout l'objet de ces maquettes.
