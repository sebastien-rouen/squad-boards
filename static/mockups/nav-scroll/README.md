# Navigation qui déborde — 2 directions à challenger

Maquettes statiques pour régler un problème mesuré : la barre d'onglets de **Paramètres**
(14 sections) passe à la ligne sur téléphone et mange l'écran. Rien du site n'est modifié —
ces fichiers vivent uniquement dans `static/mockups/nav-scroll/`.

## Ouvrir

```bash
python main.py       # puis http://localhost:3001/mockups/nav-scroll/
```

Ou en double-cliquant `index.html` : les CSS sont référencés en relatif
(`../../css/tokens.css`, `base.css`, `views/settings.css`) et `shell.js` est un script
classique — pas de module ES — donc tout fonctionne aussi en `file://`.

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'entrée : le problème mesuré, la barre **actuelle** en référence, les 2 options |
| `option-a-rail.html` | Option A — rail défilant à flèches |
| `option-b-condense.html` | Option B — déclencheur + feuille |
| `shell.css` / `shell.js` | Chrome partagé : bascule d'appareil, thème, **sonde de mesure** |

Chaque page a un sélecteur **d'appareil** (6 viewports réels) et un bouton **🌓 Thème**.

## Ce n'est pas jugé à l'œil

Chaque maquette embarque une **sonde** qui parcourt les six appareils et rend des chiffres :
nombre de lignes de la barre, hauteur qu'elle occupe, **part de l'écran qui reste au
contenu**, et ce qui sort du champ. Une maquette qui dit « c'est mieux » sans chiffre ne se
compare pas à la suivante.

Les 14 onglets sont les **vrais** (mêmes libellés, mêmes icônes, mêmes groupes que
`TAB_GROUPS` et `_settingsTabIcon` dans `views/settings.js`), et la barre de référence
reproduit la vraie structure — 4 groupes en colonne avec leur label 9 px, pas 14 boutons à
plat. Une première version à plat annonçait 7 lignes là où la vraie structure en fait 8 :
corrigée, parce qu'une maquette qui exagère le problème ne sert à rien.

## Le problème, mesuré (Edge, viewports réels)

| Appareil | Aujourd'hui | Option A | Option B |
|---|---|---|---|
| Fold fermé · 344 | **43 %** (9 lignes) | 86 % (1) | 86 % (1) |
| iPhone SE · 375 | **44 %** (8 lignes) | 85 % (1) | 85 % (1) |
| iPhone 14 · 390 | **48 %** (8 lignes) | 86 % (1) | 86 % (1) |
| Pixel 7 · 412 | **54 %** (7 lignes) | 87 % (1) | 86 % (1) |
| iPad mini · 768 | 71 % (3 lignes) | 87 % (1) | 87 % (1) |

*(« % » = part de la hauteur d'écran qui reste au contenu.)*

Sur un iPhone 14, **la navigation occupe plus de la moitié de l'écran** — 227 px de barre
collante pour 720 px de haut. Le code connaît déjà le symptôme : `settings.js` mesure cette
hauteur avec un `ResizeObserver` pour publier `--stg-tabs-h` et compenser le
`scroll-padding` des ancres. Compenser en permanence une barre qui gonfle est un aveu : elle
ne devrait pas gonfler.

## Mon avis

**L'option A, sans hésiter — et le chiffre qui tranche n'est pas celui que j'attendais.**

Je pensais que B (déclencheur + feuille) gagnerait sur l'encombrement, quitte à coûter un
tap. La mesure dit l'inverse : **A et B rendent le même espace** — 39 px de barre contre
42 px, soit 86 % de main dans les deux cas. Le pari de B était de payer un geste pour gagner
de la place ; il n'y a pas de place à gagner. Le geste serait payé pour rien.

À partir de là, A gagne sur tout le reste :

- **Aucun tap supplémentaire.** On change de section d'un doigt, sans ouvrir/fermer.
- **La section courante reste lisible en contexte**, parmi ses voisines — ce que B perd
  entièrement au profit d'un compteur « 2 / 14 ».
- **Un seul modèle de navigation** desktop et mobile : le rail ne défile que s'il déborde,
  donc sur grand écran il se comporte exactement comme la barre actuelle sur une ligne.
- **Le coût d'une section en plus devient nul.** Aujourd'hui, ajouter un onglet peut coûter
  une ligne entière, en permanence, sur tous les téléphones.

Ce que A perd, et qu'il faut assumer : **le regroupement Équipe / Planning / Intégrations /
Système s'aplatit**. C'est réel, et c'est le seul vrai argument de B — sa feuille en deux
colonnes montre les groupes bien mieux qu'un rail.

**La piste que je garderais pour la suite** : un rail qui conserve les labels de groupe
comme séparateurs *dans* le défilement (`Équipe · 🌳 👥 🧑 ⚙️ 🌴 │ Planning · 🚀 …`), en les
rendant collants à gauche pendant le swipe. On garde la hauteur d'une ligne et le
regroupement. Je ne l'ai pas maquetté pour ne pas noyer l'arbitrage principal — il se
tranche d'abord entre « une ligne qui défile » et « pas de ligne du tout ».

**Trois détails qui ne sont pas cosmétiques dans A :**

1. Les **dégradés de bord** et les chevrons ne sont pas de la décoration. Un rail qui défile
   sans le dire est *pire* qu'une barre qui wrappe : rien ne signale qu'il reste des onglets.
2. Les **flèches n'apparaissent que du côté où il reste quelque chose.** Deux flèches
   toujours visibles, dont une inerte, apprennent au doigt à les ignorer.
3. La **scrollbar native est masquée** (`scrollbar-width: none`) sur pointeur grossier :
   elle coûterait 8 à 15 px selon l'OS — précisément la hauteur qu'on cherche à rendre.
   Au pointeur fin, elle revient.

## Au-delà de Paramètres

`settings-tabs` est le cas le plus visible, mais **173 conteneurs** du site sont en
`flex-wrap: wrap`. Les autres barres de navigation concernées, repérées par le même motif :
`.quick-filters`, `.activity-filters`, `.agenda-toolbar`, `.bl-flt-chips`, `.grp-chips-row`,
`.jira-project-chips`, `.rot-toolbar`, `.db-oncall-chips`.

Si A est retenue, elle mérite d'être extraite en composant (`.nav-rail`) plutôt que recopiée
huit fois — sinon les dégradés et la logique de bords divergeront d'une barre à l'autre,
comme la règle des anomalies l'a fait entre `health.js` et `alert_modal.js`.
