# Refonte visuelle — quatre directions (desktop & TV)

Maquettes statiques pour choisir **le parti pris visuel** d'une refonte de Squad Board :
un Dashboard plus simple, le PI Planning, les rapports de sprint et la santé des équipes
**en un coup d'œil**, coloré, avec des explications visuelles à la demande. Rien du site
n'est modifié — tout vit dans `static/mockups/refonte/`.

## Ouvrir

```bash
python main.py            # puis http://localhost:3001/mockups/refonte/
```

Fonctionne aussi en double-clic (`file://`) : chemins relatifs, scripts classiques.
Les pages démarrent **en sombre** (le mode d'un écran mural) ; ☀️ bascule en clair,
thème par défaut du site.

| Fichier | Rôle |
|---|---|
| `index.html` | Galerie : aperçu desktop réel de chaque direction, tableau de choix |
| `mockup-1/` … `mockup-4/` | Une direction = `style.css` (identité + pont de tokens) + 5 pages |
| `mockup-3/06…12-*.html`, `deep.css` | Les sept pages d'approfondissement de la Météo (direction préférée) |
| `_shared/ui*.css` | Les composants, écrits **une fois** sur les tokens `--ui-*` |
| `_shared/gallery.css`, `bureau.css/js` | Chrome de galerie, cadres 1280 × 820 et 1920 × 1080 à l'échelle |
| `_shared/overlay.css/js` | Le panneau 🎛️ (direction, écran, thème, 💡 explications) |
| `_gen/` | Générateur (`build.js`) et contrôles (`verify.js`) — voir plus bas |

Chaque direction a les mêmes cinq pages :

| Page | Contenu |
|---|---|
| `01-dashboard.html` | L'écran principal en desktop (avec 💡 explications), puis en mobile + état vide |
| `02-sections.html` | PI Planning (objectifs, features), Rapports (sprint 30.1), Santé, état vide, mobile |
| `03-modals.html` | Nouveau ticket, objectif PI, Fist of Five, suppression annulable, aide « ? », Ctrl+K |
| `04-live.html` | Daily, PI Planning en salle, import JIRA, jeton expiré, hors ligne, sprint clos |
| `05-tv.html` | Les quatre écrans de la rotation TV, 1920 × 1080, sans chrome |

## Les quatre directions

| | Parti pris | Point fort | Limite | Moment idéal |
|---|---|---|---|---|
| 🧭 **1 · Cockpit** | Mur de tuiles bento, grands chiffres, une couleur par domaine, sidebar réduite aux icônes | Tout tient sur un écran sans défiler ; TV et desktop montrent la même chose | Peu de texte — la compréhension passe par les « ? » | Écran mural d'équipe, daily, revue de sprint |
| 📖 **2 · Journal de bord** | Chapitres numérotés, une phrase de synthèse en français par indicateur, titres serif, sommaire collant | Un manager qui découvre l'équipe comprend sans qu'on lui explique | Plus long à parcourir ; sur TV il faut tourner les chapitres | Point hebdo management, préparation d'un rapport, onboarding |
| 🌤️ **3 · Météo des équipes** | Matrice équipes × domaines en pastilles ☀️ ⛅ 🌧️ ⛈️, panneau de détail à côté | La santé de **toutes** les équipes en un coup d'œil — l'écran du RTE | Réducteur par construction : un ⛈️ cache ses causes | Écran mural multi-équipes, ART sync, revue de PI |
| 🛤️ **4 · Frise du PI** | Une colonne par sprint, curseur « aujourd'hui », « Maintenant » et « Sur le PI » dessous | PI Planning, suivi et rapport = la même vue à des instants différents | Exige la largeur ; sur mobile la frise redevient une liste | Suivi continu du PI, préparation de l'I&A, TV de plateau |

## Ce qui ne change pas d'une direction à l'autre

- **Le contenu.** Même jeu de données synthétique (`_gen/data.js`, équipes et personnes du
  jeu de démo du site) : Vega, PI #30, Ité 30.2 à J7/10, deux tickets glissés de 30.1,
  Orion en ⛈️. Les chiffres reproduisent les pièges de prod (engagement ≠ réalisé, base de
  capacité plafonnée ⚠, sprint de respiration 🍃 hors moyenne).
- **Les composants.** KPI, cartes, bande des sprints du PI (avec US / Buffer / Action et
  glissés — celle du Dashboard actuel, gardée telle quelle), matrice Santé, rapport de
  sprint, votes, modales : écrits une fois dans `_shared/`, sur les tokens `--ui-*`.
- **Les vrais tokens.** Chaque page charge `static/css/tokens.css` : couleurs de statut,
  espacements, rayons sont ceux du site. Une direction ne fait qu'un pont
  (`--ui-accent: var(--primary)`…) et sa mise en page.
- **Les explications.** Chaque « ? » ouvre un **schéma** (lead vs cycle time, calcul du
  score, base de capacité, rollup d'objectif). Le bouton 💡 du panneau révèle des pastilles
  numérotées sur le Dashboard, avec une légende qui dit pourquoi chaque zone est là.
- **Aucune requête média.** Desktop, TV et mobile cohabitent sur la même page : la
  disposition est portée par la classe du cadre (`.bureau`, `.tv`), jamais par la fenêtre.

## Approfondissement de la Météo (2026-08-29)

Direction **préférée** après la première revue : sept pages de plus dans `mockup-3/`, pour
la pousser là où une direction se juge vraiment — les écrans secondaires et les cas limites.

| Page | Ce qu'elle montre | Ce qu'on y a découvert |
|---|---|---|
| `06-equipe.html` | La fiche d'une équipe (Vega ☀️, Orion ⛈️) : cinq pastilles cliquables, une section par domaine, roster, rotation, tendance du mood | **La fiche est le Dashboard d'équipe.** Et pour une ⛈️, la météo doit *proposer* : un plan d'action dérivé des anomalies pondérées, avec un responsable et une échéance par ligne |
| `07-previsions.html` | La météo à cinq PI (passé, en cours, prévision, à planifier), prédictibilité SAFe, vélocité sur 12 sprints, roadmap des features | Le PI 31 est 🌧️ *avant d'avoir commencé* (engagement à 132 % de la base) — c'est le moment de le dire, au PI Planning |
| `08-board.html` | Board Scrum, Kanban avec vieillissement, backlog groupé + actions en masse | Le titre du Board porte la météo du sprint ; en Kanban, l'âge colore la carte entière |
| `09-parametres.html` | Seuils météo (nouveau), import CSV des absences, Sprint & PI, équipes | **Les seuils sont réglables mais globaux** — une équipe ne se choisit pas une météo plus clémente ; l'aperçu recalcule la matrice avant d'enregistrer |
| `10-etats.html` | 12 équipes / 3 lignes produit, une seule équipe, premier lancement, dernier jour du PI, sans JIRA | Le niveau d'un groupe est le **pire** de ses équipes ; **⚪ pas de donnée ≠ ⛈️** — une case grise n'est pas une mauvaise nouvelle |
| `11-comprendre.html` | Une carte par domaine (formule, source dans le code, seuils, exemple), glossaire visuel, mode apprentissage (tous les « ? » ouverts) | L'explication visuelle « en détail si besoin » du brief : une page d'aide, et un mode qu'on allume pour un nouveau Scrum Master puis qu'on éteint |
| `12-tv-rotation.html` | La séquence de rotation, l'alerte ⛈️ plein écran (blocker > 48 h), le train complet, la fin de journée | **L'alerte n'est pas un toast** : elle nomme le ticket, la chaîne qu'il bloque, et qui peut le lever |

Ce que l'approfondissement a changé dans le socle : une cinquième case **⚪ pas de donnée**
(`weatherOf(null)`), deux façons de calculer un niveau — **absolu** (Santé, Support, Mood × 20)
et **relatif au temps écoulé** (Sprint, PI : ±10 points = variable) — et le niveau d'une
équipe = le pire de ses domaines (`meteo-matrix.js`, `data-meteo.js`). Les seuils vivent à
un seul endroit (`THRESHOLDS`) et la page d'aide les lit, elle ne les recopie pas.

## Mon avis

**Tu penches pour la Météo ; l'approfondissement me convainc que c'est le bon socle — à
une condition : que la fiche équipe soit traitée comme le vrai Dashboard, et pas comme un
panneau.** Mon premier avis (Météo pour le mur, Cockpit pour le poste) reste valable dans
l'esprit : le poste de travail d'un Scrum Master, c'est `06-equipe.html`, qui reprend la
grille du Cockpit sous les pastilles météo. Deux écrans, une identité.

Ce que je garderais tel quel de la première galerie :

Le brief dit trois choses : *simplifier*, *toutes les équipes en un coup d'œil*, *desktop /
TV*. Aucune direction ne gagne sur les trois à la fois, et c'est en dessinant les pages
secondaires que ça s'est vu :

- **La Météo** est la seule qui répond vraiment à « la santé des équipes en un coup
  d'œil » : quatre équipes × cinq domaines, une échelle unique, et l'œil va tout seul vers
  le ⛈️ d'Orion. Sur TV (page 05) elle est imbattable — c'est l'écran qu'un RTE veut dans
  le couloir. Mais elle **n'est pas un Dashboard d'équipe** : dès qu'on est Scrum Master de
  Vega, on passe son temps dans le panneau de droite, et le panneau est… un Cockpit étroit.
- **Le Cockpit** est le plus proche de ce que le site sait déjà faire (c'est la direction F
  « Deux flux » poussée en bento), et le seul dont le desktop et la TV sont *le même écran*.
  La bande des sprints du PI y garde tout son contenu. Sa faiblesse est celle du site
  actuel : il montre, il n'explique pas. Les « ? » à schéma comblent ça — et ils sont déjà
  au backlog.
- **Le Journal** m'a surpris : c'est la direction que je pensais écarter (« trop de
  texte ») et c'est celle qui rend le mieux « facilité de compréhension ». Une phrase comme
  *« un ticket met 4 jours à traverser l'équipe, mais en attend 7 avant d'être pris »* fait
  plus qu'un KPI Flow efficiency à 36 %. Je ne la retiendrais pas comme Dashboard, mais je
  **volerais ses phrases de synthèse** pour les mettre en tête de chaque section des trois
  autres — c'est un composant, pas une direction.
- **La Frise** est la plus juste conceptuellement (le PI est un axe du temps, le sprint un
  point dessus) et la plus fragile en pratique : superbe à 1280 px, illisible en dessous de
  1000, et le Dashboard s'y transforme en vue PI. Elle a sa place… **comme onglet
  « Frise » du PI Planning**, pas comme page d'accueil.

Concrètement, avec la Météo comme socle :

1. **Dashboard = la matrice** (toutes équipes) quand aucune équipe n'est filtrée, **la fiche**
   (`06`) dès qu'une équipe est sélectionnée dans le topbar — c'est déjà le comportement du
   filtre équipe du site, il suffit que la vue change de forme.
2. **Mode TV** : météo du train en premier, alerte ⛈️ qui interrompt, fin de journée le soir
   (`12`). La rotation est un réglage, pas du code par équipe.
3. **PI Planning** garde ses onglets ; `07-previsions.html` devient l'onglet Roadmap, et la
   Frise (mockup-4) reste une bonne idée d'onglet « Frise » — sans son identité.
4. **Les phrases de synthèse du Journal** en tête de chaque section de la fiche : c'est un
   composant de dix lignes, et c'est ce qui rend « facilité de compréhension » vrai.
5. **Une seule identité** : celle de la Météo (18 px, traits épais, manuscrit pour les
   repères). Les rayons et polices des trois autres directions ne se mélangent pas.

Ce que je ne ferais pas : **une météo par domaine avec ses propres seuils.** La tentation
viendra (« le Support à 75 % c'est déjà bien ») ; dès que les seuils diffèrent, deux ⛅ ne
veulent plus dire la même chose et la matrice cesse d'être lisible en cinq secondes — ce
qui est sa seule raison d'exister.

Deux réserves à garder en tête avant de coder :

- **Le calcul « relatif au temps »** (Sprint, PI) est le bon pour une équipe en cours de
  sprint, mais il est brutal le premier jour (0 % à 10 % du temps = ⛅, à 20 % = 🌧️). Il
  faudra une **tolérance de démarrage** (J1–J2 = ⚪ ou ⛅ forcé) que la maquette ne montre pas.
- **Le score de santé pèse par équipe**, pas par taille : une équipe de 3 avec 2 bloqués est
  plus ⛈️ qu'une de 8 avec 3. Le site normalise déjà par tickets actifs — vérifier que la
  matrice lit ce score-là, et non un compte brut.

## Régénérer et vérifier

```bash
node static/mockups/refonte/_gen/build.js     # 28 pages, idempotent
node static/mockups/refonte/_gen/verify.js    # balises, liens, variables orphelines,
                                              # classes par page, 0 requête média, ≤ 800 lignes
```

Le générateur est la source : **ne pas éditer les `.html` à la main**, ils sont réécrits.
Pour changer une direction, toucher `_gen/layouts.js` (mise en page) ou
`mockup-N/style.css` (identité) ; pour un composant, `_gen/ui-*.js` + `_shared/ui*.css`.
