# Atlas — quatre directions pour la refonte

> ✅ **Retenues et implémentées (3.263.0)** : 🌌 Constellation (onglet Carte) + 🟩 Matrice (onglet Skills Matrix),
> dans `static/js/views/atlas*.js`. Profils et Signaux restent ici pour mémoire.

Maquettes statiques (rien du site n'est modifié) pour **refaire l'Atlas** (`views/atlas.js` : carte unFIX +
Skills Matrix + une douzaine de modales). Même cahier pour les quatre directions : **voir qui sait quoi**,
**repérer les trous avant qu'ils coûtent**, **agir** (former, affecter, accompagner une mobilité).

## Ouvrir

```bash
python main.py            # puis http://localhost:3001/mockups/atlas/
```

Desktop par défaut (bureau 1280 × 820 réduit), mobile 390 × 760 via le commutateur 🖥️ / 📱 (mémorisé,
`gal-view`). Le panneau 🧭 en bas à droite passe d'une direction à l'autre **sur le même écran**.

| Direction | Parti pris | Signature |
|---|---|---|
| `a-constellation/` 🌌 | L'organisation d'abord | Carte orbitale : la recherche allume les sachants, halo rouge = trou |
| `b-matrice/` 🟩 | Le diagnostic d'abord | Heatmap 26 × 10, requises cerclées, bus factor en pied de colonne |
| `c-profils/` 🧑‍🤝‍🧑 | Les personnes d'abord | Cartes de profil (forces, envie, jalon), préparation d'entretien |
| `d-signaux/` 🚨 | L'action d'abord | Boîte de réception des risques, options comparées, plan d'action |

Chaque direction : `01-atlas` (écran principal), `02-sections` (carte, matrice, tableau de bord, mobilité,
catalogue), `03-modales` (fiche, évaluer, monter en compétence, qui affecter, suppression annulable),
`04-atelier` (staffing simulé, alerte d'absence, état vide), `05-mobilite` (souhait → plan → suivi → bilan).

## Données

FICTIVES ([_gen/data.cjs](_gen/data.cjs)) : 5 équipes, 26 personnes, 10 compétences. Situations plantées
exprès : Kafka porté par un seul sachant qui part en congés, Kubernetes requis chez Delta et non couvert,
Sécurité faible partout, une envie de mobilité (Lina → Scrum Master), une montée en compétence en cours.

## Régénérer et vérifier

```bash
node static/mockups/atlas/_gen/build.cjs      # 20 pages + index, idempotent
node static/mockups/atlas/_gen/verifier.cjs   # balises, liens, classes PAR PAGE, variables, @media
```

| Fichier | Rôle |
|---|---|
| `_gen/data.cjs` | Données fictives + calculs (sachants, couverture, niveau moyen) |
| `_gen/ui.cjs` | Composants HTML communs (avatar, niveau, appétence, radar SVG, feuille, modale, coquille desktop) |
| `_gen/common.cjs` | Contenu métier commun : signaux, fiche membre, évaluation, qui affecter, simulation, mobilité |
| `_gen/pages-common.cjs` | Pages identiques d'une direction à l'autre (03, 05) et écrans communs de 04 |
| `_gen/dir-{a,b,c,d}.cjs` | Chaque direction : ses pages 01, 02, 04 et son fond pour 03 |
| `_gen/page.cjs`, `index-page.cjs` | Gabarit de page (chrome de galerie) et index |
| `_shared/ui.css`, `blocks.css`, `desktop.css` | Composants sur les tokens `--ui-*`, blocs métier, coquille desktop |
| `{direction}/style.css` | Identité + signature + pont de tokens |
| `_shared/gallery.css`, `bureau.*`, `view-switch.js`, `navigator.*`, `index.css` | Chrome repris de `api-multi-sites/mockups/dashboard/_shared/` |

⚠️ Couleurs de DONNÉES fixes dans les quatre directions (niveau 1 gris, 2 bleu, 3 vert, 4 violet — celles de
`SKILL_LEVELS` du site ; appétence forte = ambre) : seule l'identité change, jamais le sens d'une couleur.
