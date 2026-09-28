# #team/{équipe} — calendrier de l'équipe : détecter, voir, comparer

Maquettes statiques (rien du site n'est modifié) pour afficher, sur la page **Équipe**, les
évènements de l'agenda Google de l'équipe, **rangés automatiquement**, sur un calendrier joli et
standard, **comparable** avec d'autres équipes cochées.

Différence avec [`../team/`](../team/README.md) (août) : celle-ci servait à **remanier** les rituels
(glisser-déposer, exports). Ici, on **lit** le vrai agenda, on le **range** et on **compare** — sans
rien éditer dans Google.

## Ouvrir

```bash
python main.py            # puis http://localhost:3001/mockups/team-calendar/
```

Double-clic sur `index.html` (`file://`) fonctionne aussi pour regarder. Seules les **sondes**
exigent HTTP : en `file://`, chaque fichier est sa propre origine et le navigateur refuse de lire les
règles CSS (`SecurityError`) — une vérification « classes sans style » y voit tout en échec.

| Fichier | Rôle |
|---|---|
| `index.html` | Galerie : 3 directions avec aperçu réel, tableau « choisir » |
| `detection.html` | **Le détecteur** : couverture par équipe, agendas reliés et leurs alertes, file « À positionner », règles |
| `frame.html` | Page cadre : la VRAIE coquille du site (vrais CSS) + la carte, pilotée par l'URL |
| `d-synthese/0N-*.html` | **Direction retenue** : 5 écrans, dont `05-zoom.html` (du sprint à la semaine, et retour) |
| `{a-semaine,b-couloirs,c-mosaique}/0N-*.html` | Les 3 directions explorées : 4 écrans chacune, desktop 1280 et mobile 390 sur la même page |
| `_shared/classify.js` | Détecteur nature + portée — **à porter tel quel** dans le site |
| `_shared/tc-core.js`, `tc-ui.js` | Modèle, filtres, charge, fiche « Classer comme… », états — communs |
| `_shared/tc-week.js`, `tc-lanes.js`, `tc-mosaic.js` | Les trois vues |
| `_shared/tc-hybrid.js` | La synthèse D : aiguille vers A ou B, zoom et fil de retour — aucun rendu propre |
| `_shared/data.js` | **Extrait réel** : 1 059 évènements, 13 équipes, 14/09 → 18/10/2026 |
| `_gen/` | `extraire-data.py`, `gen-gallery.cjs` (idempotent), `verif-rendu.cjs`, `couverture.cjs` |

Chaque écran est une **iframe** de `frame.html` : elle charge `tokens.css`, `base.css` et
`views/team.css` sans casser la page de galerie, et les requêtes média du site jouent à la
**vraie** largeur du cadre (390 ou 1280) — le piège n°1 des maquettes, évité par construction.

## Le cœur : le détecteur (deux axes)

| Axe | Source | Valeurs |
|---|---|---|
| **Nature** — la couleur | le **titre**, règles ordonnées | 🌅 Daily · 🎯 Planning · 🔍 Affinage · 🎤 Démo · 🔁 Rétro · 🚂 Train SAFe · 🤝 Communauté & formation · 💬 Synchro & 1:1 · 🚀 Livraison & tech · 🛎️ Support · 🏖️ Absence · 🔒 Détails masqués · 🎧 Temps protégé · 📌 Autre |
| **Portée** — l'étiquette | l'**agenda source** (`team_calendar.team`) | 👥 Équipe · 🧩 Groupe (`A,B,C`) · 🚂 Train (vide) · ⚙️ Opérations |

La « Démonstration d'itération » du train et la « Répétition démo » de l'équipe ont **la même
couleur, pas la même étiquette**. C'est ce qui rend la comparaison lisible.

**Couverture : 97,3 %** des 3 580 évènements réels (tous agendas, toute l'année). Le reste n'est
pas devinable (« (🪄✨) » ×21, « Bastions ! »). Pièges rencontrés en mesurant, tous corrigés :

- « **Raffinage** de tickets » (Gabbiano) et « **Démonstration** d'itération » — le détecteur actuel
  du bandeau calendrier (`_detectScrumType`) ne reconnaît ni l'un ni l'autre ;
- « **Review** des découpages et chiffrages » est un affinage, pas une démo ;
- « **Weekly** Fuego » remplace le daily du lundi, mais « Weekly Fueguitos - PO/TL/SMs » est une synchro ;
- « [Infra] - Créneau de **ME(P)P** » : les parenthèses cassent un motif naïf ;
- « **🧰** NDIAYE, Oumar » : la rotation support de Kadjar est notée par un **emoji** ;
- « THAM OFF PM », « Thomas - OFF matin » : absences sans tiret ou en demi-journée ;
- « Deep work - pas de réunion » : du **temps protégé**, jamais compté en charge ;
- un même évènement arrive par **deux agendas** (GLOBAL + groupe GDEM) : dédoublonné sur
  titre + horaire, en gardant la portée la plus proche de l'équipe.

**Positionner à la main** = corriger une **règle**, pas un évènement : « Classer comme… » range
tous les évènements du même titre, dans toutes les équipes. Sinon la correction disparaîtrait au
prochain import ICS.

## Ce que les vraies données ont révélé (à régler, indépendamment de la vue)

| Équipe | Constat | Action |
|---|---|---|
| **Lion** | 37 créneaux sur 37 « Busy » : agenda partagé en « disponibilités seulement » | Repartager avec **tous les détails** au compte de synchro |
| **Etoile, Océane** | Aucun agenda relié | Relier leur agenda (Paramètres → Agendas) |
| **Kadjar** | « ERPC - Kadjar » déclaré partagé `Juke,Kadjar` : ses rituels s'affichent chez Juke | Corriger le champ équipe de cet agenda |
| Toutes | « ERPC - Opérations » est très bavard | Masqué par défaut, activable (portée ⚙️) |

## Les trois directions

| | A · Semaine | **B · Couloirs** | C · Mosaïque |
|---|---|---|---|
| Parti pris | Grille horaire (Google/Outlook) | Une ligne par équipe × une colonne par jour | L'itération en cases + agenda du jour |
| Comparer 2-3 équipes | 🟡 sous-colonnes, serré au-delà de 2 | 🟢 fait pour ça | 🟡 pastilles |
| Heure exacte, conflits | 🟢 | 🟡 heure de début | 🔴 |
| Itération (10 jours) en 1280 | 🟡 dense | 🟢 sans défilement (mesuré) | 🟢 |
| Mobile | vue Jour | un jour à la fois | cases + agenda |

Communs aux trois : filtres de nature en chips (avec compteurs), portées, « Comparer » en liste
à cocher (3 équipes max, case grisée expliquée), couloir **« Train & commun »** qui dessine le
train **une seule fois**, fiche d'évènement, bandeau « Journée » pour support et absences (des
gens, pas des réunions), pied de carte : charge de réunions (base 7 h/jour affichée), taux de
détection, fraîcheur de synchro. Thème sombre et clair, cibles tactiles ≥ 44 px en mobile.

> ✅ **Implémenté en 3.167.0** (direction D) : `static/js/components/team_calendar.js` (+ `_views.js`),
> `static/js/utils/cal-classify.js`, `static/css/views/team-calendar.css`, table `calendar_rule`.
> Cette maquette reste le **miroir** : toute retouche visuelle du site s'y reporte.

## Décision (2026-09-28) : D · Synthèse

Retour : « j'aime la clarté du A, et de voir l'ensemble du sprint sur le B ». Les deux ne
s'opposent pas — c'est la bascule Jour / Semaine / Mois de tout agenda standard :

- **Semaine** → la grille horaire de **A** (heure exacte, ligne « maintenant », vue Jour en mobile) ;
- **Itération** → les couloirs de **B** (le sprint entier, les équipes cochées alignées) ;
- **zoom** : un clic sur l'en-tête d'un jour de l'itération ouvre sa semaine en grille horaire ; la
  semaine qu'ouvrira le clic est déjà encadrée ; un fil « ↩ Tout le sprint 31.2 · semaine 2 sur 2 »
  ramène ;
- **le contexte voyage** : filtres de nature, portées, équipes comparées, fiche ouverte.

D n'a **aucun rendu propre** : `tc-hybrid.js` aiguille vers A ou B, et `d-synthese/style.css` importe
leurs feuilles. Toute correction de A ou de B profite à la synthèse, et il n'y a pas de troisième
implémentation à maintenir. Vérifié : zoom aller-retour sur bureau et mobile, comparaison et
filtre conservés (`_gen/sonde-zoom.cjs`).

Défaut proposé à l'ouverture de la page Équipe : **Semaine** (la question du jour est « qu'avons-nous
aujourd'hui ? ») ; le choix Semaine / Itération serait retenu par personne (`localStorage`).

### Lisibilité des titres (retour : « je ne vois que les 5 premiers caractères du Daily Fuego »)

Mesuré (`_gen/sonde-troncature.cjs`, largeur ET hauteur — un `line-clamp` rogne par le bas sans
que `scrollWidth` le voie) :

| Vue | Avant | Après |
|---|---|---|
| Itération, seule | 55/55 coupés, ~3 caractères visibles | **0 coupé, 0 rogné** |
| Itération, 3 équipes | 158/158 coupés | **0 coupé, 0 rogné** |
| Semaine, seule | 14/26 coupés | 5 longs intitulés MEP en créneau de 30 min → titre entier **au survol** |
| Semaine, 3 équipes | 79/79 coupés | reste serré (4 sous-colonnes/jour) → conseil « voir l'itération » |

Les quatre leviers, du plus rentable au moins :

1. **Titre court** (`TC.shortTitle`) : sans emoji (la couleur dit la nature), sans le nom de
   l'équipe de la ligne (« 🔥 Daily Fuego » → « Daily », « Gabbiano - Raffinage de tickets » →
   « Raffinage de tickets »), sans « ERPC - ». Les crochets ne tombent que s'ils désignent l'équipe
   (« [GDEM/PAAC] MEP » garde son contexte). Titre complet en infobulle et dans la fiche.
2. **Couloirs** : nom au-dessus sur toute la largeur, heure dessous, **sans limite de lignes**,
   césure française ; **rituels quotidiens une seule fois** dans l'en-tête de ligne (« Daily ·
   9h45 · 9/10 j ») au lieu de dix fois ; en comparaison, 3 évènements par case (jalons d'abord) puis
   « + N autres » qui déplie — 1 628 px pour 3 équipes au lieu de 2 203.
3. **Grille horaire** : heure à 52 px (standard), 2 lignes de titre dès 45 min, 3 dès 75 min,
   l'horaire seulement au-delà d'une heure (la position le dit déjà).
4. **Survol / focus clavier** : un bloc coupé s'élargit et montre son titre entier, au premier plan.

## Mon avis (avant décision)

**B · Couloirs est la vue à coder pour la page Équipe.** L'équipe a déjà Google Agenda pour sa
semaine en grille horaire : refaire A dans Squad Board, c'est refaire moins bien ce que Google fait
très bien. Ce que Google ne sait **pas** faire, c'est ce que tu demandes : ranger (nature + portée) et
**comparer** plusieurs équipes sur l'itération. C'est exactement le terrain de B — les rétros, démos
et plannings de Gabbiano, Fuego et Helica s'alignent verticalement, et le survol d'un évènement
allume la même nature chez toutes les équipes.

**C en complément mobile / accueil**, pas en concurrent : sur téléphone c'est la plus naturelle,
et elle ferait une excellente tuile « ma journée » sur le Dashboard.

**A seulement si** l'on veut détecter les **conflits d'horaire** entre équipes (qui mobilise deux
fois les mêmes personnes à 14 h). C'est une vraie question, mais une autre fonctionnalité.

Trois réserves, à trancher avant de coder :

1. **Où vivent les règles « positionnées » ?** Une table `calendar_rule` (titre normalisé → nature),
   partagée par toutes les équipes, est le plus simple et le plus juste (un titre a la même nature
   partout). Par équipe seulement si deux équipes emploient le même titre pour deux choses.
2. **Qui peut positionner ?** Pas de rôles dans le site aujourd'hui. Proposition : tout le monde,
   avec l'historique « rangé à la main par… » et « Revenir à la détection » — c'est réversible.
3. **Le détecteur doit remplacer `_detectScrumType`** du bandeau calendrier, sinon deux détecteurs
   divergeront (le bandeau ne reconnaît déjà pas « Raffinage »).

## Plan d'implémentation proposé (après ton choix)

0. **Vue retenue : D** — `components/team_calendar.js` = coquille + vues Semaine (A) et Itération (B) ;
   la mosaïque (C) n'est pas codée.
1. `static/js/utils/cal-classify.js` : port de `_shared/classify.js`, **tests node** sur un jeu de
   titres réels (golden dataset) ; le bandeau calendrier bascule dessus.
2. Backend : `GET /api/calendars/events?team=` dédoublonné ; table `calendar_rule` + routes
   (migration **sur copie d'abord** — la base se recharge à chaud).
3. `components/team_calendar.js` + `css/views/team-calendar.css` : la vue retenue, sur la page Équipe.
4. Paramètres → Agendas : le tableau de `detection.html` (couverture, alertes, file « À positionner »).
5. Hors code : repartager l'agenda de Lion, relier Etoile et Océane, corriger le champ de Kadjar.

## Ton avis

- [x] Direction retenue : **D · Synthèse** (A pour la semaine, B pour l'itération)
- [ ] Vue par défaut à l'ouverture : Semaine / Itération
- [ ] Nature manquante ou mal nommée : ______
- [ ] Opérations masqué par défaut : oui / non
- [ ] Règles « positionnées » partagées par toutes les équipes : oui / non
- [ ] Remarques : ______

## Vérification

Scriptée, sans capture d'écran, dans Edge via `playwright-core` (`_gen/verif-rendu.cjs`, en HTTP) :

- **64 rendus** (4 directions × desktop/mobile × 8 états) : toutes les classes du DOM **réellement
  produit** ont un style dans les feuilles **chargées par ce cadre** — le vérificateur statique ne
  voit rien ici, tout le calendrier étant rendu en JS ;
- 0 variable CSS orpheline, 0 lien cassé, 0 erreur JS, 0 défilement horizontal de page ;
- cibles tactiles mobiles ≥ 44 px partout, sauf les blocs horaires de la vue Semaine (plancher
  26 px : un daily de 15 min reste petit dans toute grille horaire) ;
- mesures qui ont changé le design : 31 blocs de moins de 28 px en Semaine comparée → cascade
  décalée ; couloirs mobiles de 9 689 px de haut → un jour à la fois ; 3 323 px de défilement
  horizontal des couloirs → colonnes bornées, 10 jours tiennent en 1280.

Le rendu visuel reste à juger dans le navigateur, desktop **et** mobile.

## Régénérer

```bash
python static/mockups/team-calendar/_gen/extraire-data.py      # data.js depuis board.db (lecture seule)
node static/mockups/team-calendar/_gen/gen-gallery.cjs         # index + 12 écrans (idempotent)
node static/mockups/team-calendar/_gen/couverture.cjs <dossier-contenant-all-events.json>
```
