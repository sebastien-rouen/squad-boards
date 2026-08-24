# #team/{équipe} — carte « Calendrier de l'équipe »

Maquette d'une carte à ajouter à la page **Équipe** (`#team/{équipe}`) : un calendrier
**visible**, **exportable** et **remaniable**, pour **les 13 équipes**.

La page Équipe porte aujourd'hui l'identité, le roster et les ateliers — mais rien du
**rythme réel** de l'équipe, qui vit dans des invitations Google éparpillées. Cette carte
le rend manipulable au même endroit que le reste de la fiche.

## Ouvrir

```bash
python main.py            # puis http://localhost:3001/mockups/team/
```

Fonctionne aussi en double-clic (`file://`) : chemins relatifs, scripts classiques.

| Fichier | Rôle |
|---|---|
| `index.html` | La page `#team/{équipe}` en miroir, avec la carte 📅 insérée |
| `calendar.css` | Ce que l'édition ajoute : sélection, glisser, panneau, barre d'état |
| `calendar.js` | Modèle éditable, glisser-déposer, clavier, exports ICS / CSV / Slack |
| `exports.js` | ICS / CSV / Slack + téléchargement — testables sans l'interface |
| `data-teams.js` | **Données réelles des 13 équipes** : itération, roster, rituels |

**Dépendance** : le socle des maquettes agenda (`../agenda/shell.js`, `parts.js`,
`shell.css`, `parts.css`) fournit le typage Scrum/SAFe/Ops, les helpers de dates et les
styles de grille. Ses *données* ne sont pas chargées — cette page a les siennes ; `shell.js`
reçoit une coquille `AGENDA_MOCK` vide plutôt que 187 Ko en double. Déplacer ou renommer
le dossier `agenda/` casserait cette page : c'est le prix de la non-duplication, assumé
pour des maquettes.

## Ce que la carte apporte

### Visible

La cadence de l'équipe en grille horaire, avec deux lectures au choix :

- **Itération** — les jours ouvrés réels de l'itération en cours de l'équipe (11 pour
  Fuego), pour vérifier ce que ça donne ;
- **Semaine type** — lundi → vendredi, le bon niveau pour *décider* d'une cadence.

Au-dessus, la barre de charge : pour Fuego, **13 h 42 de réunions par semaine, 21 h 18 de
libre** sur une base explicite de 35 h — recalculée à chaque modification, ce qui est tout
l'intérêt de pouvoir remanier.

### Exportable

| Format | Détail |
|---|---|
| **ICS** | Un `VEVENT` par rituel actif, récurrence en `RRULE`, `CRLF` (RFC 5545), `TZID=Europe/Paris`. Réimportable dans Google Agenda — et relisible par `services/ics.py`, qui est justement ce qui alimente le site. La boucle est fermée. |
| **CSV** | Point-virgule + BOM UTF-8 : s'ouvre directement dans Excel FR sans assistant d'import. Huit colonnes, dont le nombre d'occurrences sur l'itération. |
| **Slack** | Groupé par cadence, avec le coût hebdomadaire en pied. Même grammaire que les récaps de l'agenda (`:calendar:`, `*gras*`, puces indentées). |
| **Impression** | `@media print` masque le chrome de maquette et garde la carte seule. |

### Remaniable

- **Glisser** un bloc : la colonne donne le jour, la position verticale l'heure, arrondie
  au quart d'heure.
- **Au clavier** (le glisser seul n'est pas accessible) : `←` `→` changent de jour,
  `↑` `↓` décalent de 15 min, `Suppr` retire le rituel.
- **Panneau d'édition** : titre, famille, cadence, jour, heure, durée. Plus dupliquer,
  désactiver (le rituel reste visible, hachuré, et sort des exports) et supprimer.
- **Ajouter** un rituel.
- **Barre d'état** : liste explicitement les écarts avec les calendriers détectés
  (`✏️ Daily Fuego — 09h45 → 10h00`), et un bouton rétablit la détection d'origine.

Le remaniement est stocké en `localStorage`, une clé par équipe
(`sb-mockup-team-cal:{équipe}`) : on retrouve son brouillon en revenant, sans rien écrire
en base, et sans qu'une équipe contamine l'autre.

### Verrouillage des rituels imposés

Les rituels **SAFe démarrent verrouillés** 🔒 : ART Sync, Coach Sync, I&A, PI Planning et
les CoP sont imposés par le train, leur cadence ne se décide pas dans l'équipe. Un rituel
verrouillé ne se glisse pas, ne s'édite pas, ne se supprime pas — mais il reste visible,
compté dans la charge et présent dans les exports (`CATEGORIES:…,Imposé ART` en ICS,
colonne `Imposé ART` en CSV, 🔒 dans le récap Slack).

**Le cadenas est réversible** : un bouton rend la main, et le déverrouillage apparaît dans
la liste des modifications (`🔓 déverrouillé`). C'est le bon compromis — la valeur par
défaut protège, sans jamais interdire à une équipe qui sait ce qu'elle fait. Reverrouiller
ramène exactement à l'état détecté.

Sur Fuego : **7 rituels verrouillés sur 21**. Sur les 13 équipes, entre 6 et 13.

### Les 13 équipes

Le sélecteur en tête de carte bascule d'équipe : chacune a **son itération** (7 ont un
sprint actif, les 6 autres tombent sur une fenêtre de référence signalée en clair), son
roster et sa cadence. L'en-tête de la page suit. Chaque remaniement est isolé par équipe
(`sb-mockup-team-cal:{équipe}`) — modifier Fuego ne touche pas Dezir.

| Équipe | Rituels | Réunions/sem. | 🔒 | Max en parallèle |
|---|---|---|---|---|
| Estafette | 40 | 24 h 36 | 13 | 7 |
| Gabbiano | 32 | 19 h 24 | 9 | 3 |
| Helica | 29 | 19 h 36 | 9 | 2 |
| Juke | 25 | 16 h 48 | 8 | 7 |
| Fuego | 21 | 13 h 42 | 7 | 4 |
| O | 8 | 5 h 30 | 6 | 2 |

**La grille tient**, mais la limite se voit : à 7 rituels simultanés (Estafette, Juke), des
blocs à un quart de colonne deviennent étroits. Au-delà de 4 voies ils s'empilent en
cascade décalée plutôt que de rétrécir à l'infini, et le survol ramène au premier plan.
En dessous de 780 px la grille cède la place à la liste, qui n'a pas ce problème.

Cas limite utile : **Lion et O n'ont aucun rituel Scrum** — que du SAFe et de l'ops. Leur
grille est presque vide côté équipe, ce qui est en soi une information.

## Le piège que cette maquette a rendu visible

Le daily de Fuego **ne se tient pas le lundi** — il est remplacé par le Weekly de 9h30,
soit 9 jours sur 11. La première version de l'export ICS produisait pourtant
`FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` : réimporté dans Google Agenda, il aurait **recréé deux
dailies fantômes** par itération.

Corrigé : les jours systématiquement sautés sont retirés du `BYDAY`
(`FREQ=WEEKLY;BYDAY=TU,WE,TH,FR`), et les trois exports le disent de la même façon —
`tous les jours sauf lundi` en CSV, `(sauf lundi)` en Slack. Un export qui invente des
réunions est pire que pas d'export du tout.

C'est le genre d'écart qu'on ne voit qu'en produisant vraiment le fichier : d'où le
harnais de vérification qui valide l'ICS (VEVENT équilibrés, DTSTART bien formé, CRLF),
la régularité des colonnes CSV, et le fait qu'un rituel désactivé disparaisse de l'export.

### Deux chiffres faux, trouvés en passant aux 13 équipes

Estafette affichait **56 h 36 de réunions par semaine** — plus que la semaine ouvrée.
Invraisemblable, donc faux. Deux causes :

- **« Livraison en prod » dure 1440 min** : c'est une *journée entière*, pas une réunion de
  24 h. À elle seule, elle pesait 24 h de charge. Les créneaux « journée » (`allDay` ou
  ≥ 6 h) sortent désormais de la charge, s'affichent en bandeau sous l'en-tête de colonne
  — au lieu de recouvrir toute la journée — et s'exportent en `DTSTART;VALUE=DATE`, ce que
  demande la RFC pour un évènement de journée.
- **« Deep work — pas de réunion » comptait 8 h de réunion.** C'en est l'exact inverse :
  du temps protégé. Ces créneaux forment maintenant une catégorie à part (bleu hachuré),
  hors charge, avec la mention « un créneau *pas de réunion* protège du temps, il n'en
  consomme pas ».

Après correction : **24 h 36 de réunions, + 8 h protégées, + 1 journée bloquée**. Le chiffre
devient utilisable — et le retrait du bloc de 24 h fait tomber le chevauchement maximal de
12 à 7, donc la grille redevient lisible.

Le harnais refuse désormais toute charge supérieure à 40 h/semaine : un garde-fou contre
le retour silencieux de ce genre d'agrégat.

## Points à trancher avant d'implémenter

1. **Où stocker le remaniement ?** La maquette ne touche pas la base. En vrai, deux
   options : une table `team_ritual` (le calendrier devient une donnée du produit, éditable
   sans Google) ou un simple export (le calendrier reste dans Google, Squad Board n'aide
   qu'à le préparer). La seconde est moins ambitieuse mais évite un deuxième référentiel
   qui divergera du premier.
2. **Le sens de la synchro.** Aujourd'hui l'ICS entre. Si on édite dans Squad Board, que
   se passe-t-il au prochain import ? Sans réponse claire, l'édition écrase ou se fait
   écraser. L'option « export seul » esquive proprement la question.
3. **Qui a le droit d'éditer ?** La cadence d'une équipe engage tout le monde ; il n'y a
   pas de notion de rôle dans le site aujourd'hui.
4. ~~**Les rituels du train ne s'éditent pas.**~~ *Traité* : les rituels SAFe démarrent
   verrouillés, avec un cadenas réversible (voir plus haut). Reste à décider **qui** peut
   déverrouiller — aujourd'hui n'importe qui.
5. **La base de 35 h** est une hypothèse affichée, pas un paramètre. À rendre configurable
   si le chiffre doit servir en rétro.

## Vérification

Exécutée sous Node avec un DOM factice : rendu de la page (roster, grille, liste, barre de
charge), puis validation des trois exports — 21 `VEVENT` équilibrés avec leurs `RRULE`,
22 lignes CSV à 8 colonnes régulières avec BOM, récap Slack groupé par cadence. Le test
désactive un rituel et vérifie qu'il quitte bien l'ICS et qu'il apparaît dans le diff.

Le rendu visuel, le glisser-déposer et le téléchargement réel restent à juger dans le
navigateur — un DOM factice ne les couvre pas.
