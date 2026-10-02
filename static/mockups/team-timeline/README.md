# #team/{équipe} — frise des faits marquants (2 propositions)

> ✅ **Frise 1 retenue et implémentée** (3.169.0) : carte « Faits marquants » de la page Équipe,
> sous l'Agenda — `static/js/components/team_timeline*.js`, `static/css/views/team-timeline.css`.
> Cette galerie en est le **miroir** : toute retouche visuelle du site s'y reporte.
> La frise 2 est devenue la bascule **« 📖 Récit »** (3.170.0, défaut sur mobile). Écarts du site
> avec cette galerie : 1v1 dans le récit, congés en barres scindées (rouge = congés, vert = disponibles, % en rouge), auteur des faits,
> 1v1 planifiés (pastilles creuses), fenêtre étendue jusqu'aux 1v1 planifiés, jours fériés, couloir
> ⚙️ Opérations et filtre « Sources d'agenda », export PNG / Markdown / Slack.

Maquettes statiques (rien du site n'est modifié) : une frise chronologique des **faits marquants**
d'une équipe (ou de tout le train), **de la date A à la date B** au choix — problèmes en production,
vacances d'été, turnover (**arrivées en vert, départs en rouge**, mobilités en bleu), MEP, jalons du
train et faits saisis à la main.

## Ouvrir

```bash
python main.py            # puis http://localhost:3001/mockups/team-timeline/
```

Double-clic sur `index.html` marche pour regarder ; les sondes exigent HTTP (en `file://`, règles
CSS illisibles). Le chrome de galerie (`gallery.css`, `gallery.js`, panneau de démo) est **partagé**
avec `../team-calendar/_shared/` : ne pas déplacer ce dossier.

| Fichier | Rôle |
|---|---|
| `index.html` | Les 2 frises, aperçu réel, tableau des sources, tableau « choisir » |
| `frame.html` | Page cadre : VRAIE coquille du site (vrais CSS) + la frise, pilotée par l'URL |
| `a-couloirs/0N-*.html` | Frise 1 — 4 écrans, desktop et mobile sur la même page |
| `b-recit/0N-*.html` | Frise 2 — 4 écrans |
| `_shared/tl-core.js` | Période A → B, turnover, présence et périodes creuses, incidents, MEP, jalons, faits |
| `_shared/tl-ui.js` | Coquille commune : présélections + dates, portée Équipe/Train, KPI, filtres, fiche, formulaire |
| `_shared/tl-lanes.js`, `tl-story.js` | Les deux frises |
| `_shared/data.js` | **Extrait réel** de `board.db` (53 Ko) |
| `_gen/` | `extraire-data.py`, `gen-gallery.cjs` (idempotent), `verif-rendu.cjs` |

## Rien n'est saisi à la main par défaut

| Catégorie | Source (existante) | Ce qu'on en tire |
|---|---|---|
| 🚨 Production | tickets support/bug avec « prod » / « production » / « incident » en mot entier, ou label `incident-prod` | 22 incidents (Initiale 17), regroupés par semaine |
| 🏖️ Présence | table `absence` (import Congés) × roster du PI | par semaine : 🟩 100 % présents, 🟧 75 à 99 %, 🟥 moins de 75 % ; **l'été est détecté** (semaines consécutives ≥ 25 % d'absence, « Congés d'été » si leur milieu tombe en juillet-août) |
| 👥 Arrivées & départs | `piMembers` (PI 29, 30, 31) + tickets « Check-list onboarding / offboarding » | arrivée ▲ vert, départ ▼ rouge, mobilité ⇄ bleu ; date exacte si check-list, sinon « au changement de PI » (pointillé) |
| 🚀 Livraisons, 🧭 Rythme | agendas ICS (MEP, I&A, PI Planning, démos) + sprints JIRA | jours de MEP, jalons du train, PI et sprints |
| 💬 1v1 | agendas de l'équipe : « [1v1] Mohamed/Omar » (Fuego), « O3 - Elsa/Tanisha » (Gabbiano) | 75 1v1, regroupés selon l'échelle ; la fiche liste les binômes (« Ptit point entretien » exclu : ambigu) |
| 📌 Faits marquants | table `event` — **déjà là, vide**, types `incident / freeze / milestone / period / other` | saisie « ＋ Fait marquant » pour ce qu'aucune source ne voit |

## Ce que les vraies données ont appris

- **Le label `désynchro` n'est PAS un incident** : chez Initiale, 47 tickets « [PGA][PDC][DESYNCHRO]
  Comparaison totale GDD/SPD » = campagnes de contrôle en masse. La 1ʳᵉ version de la maquette les
  ignorait par chance (le JSON stocke `désynchro`, que le `LIKE` SQL ne voyait pas) ; le site,
  lui, les comptait : 64 incidents au lieu de 17. Règle alignée des deux côtés, « prod » en mot
  entier (« problème », « PreProd » écartés).

- **Mobilité ≠ arrivée** : Diane REJA a une check-list d'onboarding chez Initiale (03/04), puis
  apparaît chez Gabbiano au PI 31. Une frise naïve aurait montré « départ d'Initiale + arrivée
  chez Gabbiano » ; ici c'est une ⇄ mobilité « Initiale → Gabbiano ». Idem BASSO (Lion → Fuego).
- **Accents** : « HÉDÉ-HAÜY » et « HEDE-HAUY » sont la même personne ; sans normalisation, la frise
  inventait une arrivée et un départ chez Helica.
- **Les check-lists d'onboarding sont celles du TRAIN** (rangées chez Fuego) : 39 sur la période,
  24 rattachées à une équipe par le nom (≥ 2 mots communs avec un roster). Les 15 autres ne sont
  visibles qu'en vue Train.
- **Données contradictoires signalées, pas tranchées** : RODRIGUEZ sort du roster d'Initiale au
  PI 30 (11/06) mais a une check-list d'onboarding le 19/06 → « ⚠️ à vérifier ».
- **Les agendas ICS ne couvrent que fin août → novembre** : la frise le **dit** (« une ligne vide
  avant n'est pas “aucune MEP” ») au lieu de laisser croire qu'il n'y a pas eu de MEP au printemps.
- **Échelle** : sur 6 mois, trois jalons du 31/08 au 03/09 se couvraient (plus cliquables) et, en
  vue Train, 56 prénoms se chevauchaient 289 fois. Marqueurs regroupés selon l'échelle (🚩 3,
  ▲ 5 ▼ 2 ⇄ 1), qui se séparent au zoom.

## Les deux frises

| | **Frise 1 · Couloirs du temps** | **Frise 2 · Fil du temps** |
|---|---|---|
| Forme | axe horizontal A → B, une ligne par thème, mini-carte de l'année à faire glisser | récit vertical mois par mois, cartes, mini-bilan par mois |
| Voir des corrélations (incidents ↔ été ↔ départs) | 🟢 alignées sur le même axe | 🟡 |
| Raconter une période (onboarding, rapport, rétro) | 🟡 | 🟢 |
| Tout le train | 🟢 comptes regroupés | 🟡 long |
| Mobile | 🟡 piste défilante | 🟢 naturel |

Communs : présélections (PI courant, PI précédent, Été, 6 mois, Tout) + deux dates, portée
Équipe / Train, bandeau de chiffres clés (+3 arrivées, −1 départ, ⇄ 2, 16 incidents, pic d'absence
60 %…), filtres par catégorie, fiche au clic, « ＋ Fait marquant », thème clair / sombre.

## Mon avis

**Les deux, comme l'Agenda : la frise 1 par défaut, la frise 2 en bascule « Lire comme un récit ».**
Elles partagent tout (`tl-core.js`, la coquille, les filtres, la fiche) : la seconde vue coûte peu, et
les deux besoins sont réels mais distincts. La frise 1 répond à « que s'est-il passé et qu'est-ce qui
va avec quoi ? » (le pic d'incidents d'Initiale en septembre tombe pendant la rotation des MEP
GDEM, les départs arrivent au changement de PI). La frise 2 répond à « raconte-moi l'équipe » — c'est
elle qu'on montre à un arrivant, et c'est la bonne vue sur mobile.

Où : sur la **page Équipe**, sous l'Agenda (même portée, même en-tête) ; la vue Train mériterait
aussi une place dans Santé ou Rapports.

Points tranchés à l'intégration (réglages par défaut, réversibles) :

1. **Incident de production** : titre avec « prod » / « production » / « incident » en mot entier,
   **ou label JIRA `incident-prod`** (déjà reconnu : le poser suffit pour fiabiliser). Plus `désynchro`.
2. **Seuil** : 25 % d'absence, 2 semaines consécutives pour une période creuse — et c'est aussi la
   frontière orange / rouge de la présence. Constante `LOW_THRESHOLD` du modèle.
3. **Turnover** : rosters par PI + check-lists (pointillé = « au PI »). Une date d'arrivée / de
   départ dans l'import Congés rendrait tout précis — non fait.
4. **Faits saisis** : table `event`, tout le monde peut ajouter et supprimer (fiche → 🗑️, avec
   confirmation). **Auteur non affiché** : la table n'a pas de colonne `author` (l'ajouter = migration).

## Ton avis

- [x] Frise retenue : **1 · Couloirs** (+ présence vert / orange / rouge, + couloir 💬 1v1)
- [ ] Place : page Équipe / Santé / Rapports / autre : ______
- [ ] Catégorie manquante ou de trop : ______
- [ ] Remarques : ______

## Vérification

Dans Edge via `playwright-core`, en HTTP (`_gen/verif-rendu.cjs` + sonde de parcours) :

- **28 rendus** (2 frises × desktop/mobile × 7 états) : toutes les classes du DOM produit ont un style
  dans les feuilles chargées par le cadre ; 0 variable orpheline, 0 lien cassé, 0 erreur JS, 0
  défilement horizontal de page ;
- parcours : fiche au clic, glisser la mini-carte (« 29 juin → 31 août » → « 4 août → 6 oct. »),
  ajouter un fait marquant (il apparaît sur la frise) ;
- chevauchements de marqueurs : 0 sur desktop (y compris Train), 2 en Train sur mobile (piste de
  720 px).

Le rendu visuel reste à juger dans le navigateur, desktop **et** mobile.

## Régénérer

```bash
python static/mockups/team-timeline/_gen/extraire-data.py     # data.js depuis board.db (lecture seule)
node static/mockups/team-timeline/_gen/gen-gallery.cjs        # index + 8 écrans
```
