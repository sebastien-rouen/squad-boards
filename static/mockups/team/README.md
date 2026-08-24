# #team/{équipe} — carte « Calendrier de l'équipe »

Maquette d'une carte à ajouter à la page **Équipe** (`#team/Fuego`) : un calendrier
**visible**, **exportable** et **remaniable**.

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
| `index.html` | La page `#team/Fuego` en miroir, avec la carte 📅 insérée |
| `calendar.css` | Ce que l'édition ajoute : sélection, glisser, panneau, barre d'état |
| `calendar.js` | Modèle éditable, glisser-déposer, clavier, exports ICS / CSV / Slack |
| `data-team.js` | **Données réelles** de Fuego : 15 membres, rôles, couleur `#ec4899` |

**Dépendance** : le socle des maquettes agenda (`../agenda/shell.js`, `parts.js`,
`shell.css`, `parts.css`, `data.js`) fournit le typage Scrum/SAFe/Ops, la déduction de
cadence, les dates de l'itération et la grille horaire. Déplacer ou renommer ce dossier
casserait cette page — c'est le prix de la non-duplication, assumé pour des maquettes.

## Ce que la carte apporte

### Visible

La cadence de l'équipe en grille horaire, avec deux lectures au choix :

- **Itération 30.6** — les 11 jours ouvrés réels, pour vérifier ce que ça donne ;
- **Semaine type** — lundi → vendredi, le bon niveau pour *décider* d'une cadence.

Au-dessus, la barre de charge : **13 h 44 de rituels par semaine, 21 h 16 de libre** sur
une base explicite de 35 h — et elle se recalcule à chaque modification, ce qui est tout
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

Le remaniement est stocké en `localStorage` (`sb-mockup-team-cal`) : on retrouve son
brouillon en revenant, sans rien écrire en base.

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
4. **Les rituels du train ne s'éditent pas.** ART Sync, I&A, PI Planning sont imposés par
   l'ART : la maquette les laisse modifiables, ce qui est discutable. Les verrouiller
   (lecture seule, badge « imposé ») serait plus honnête.
5. **La base de 35 h** est une hypothèse affichée, pas un paramètre. À rendre configurable
   si le chiffre doit servir en rétro.

## Vérification

Exécutée sous Node avec un DOM factice : rendu de la page (roster, grille, liste, barre de
charge), puis validation des trois exports — 21 `VEVENT` équilibrés avec leurs `RRULE`,
22 lignes CSV à 8 colonnes régulières avec BOM, récap Slack groupé par cadence. Le test
désactive un rituel et vérifie qu'il quitte bien l'ICS et qu'il apparaît dans le diff.

Le rendu visuel, le glisser-déposer et le téléchargement réel restent à juger dans le
navigateur — un DOM factice ne les couvre pas.
