# 📖 Squad Board — l'histoire

> Du fichier vide au board autoporteur qui a remplacé mes onglets Excel.
> Six semaines. 100+ versions. Un terrain de jeu, et beaucoup de choses apprises au passage.

---

## 💡 Le déclic

Je suis **Scrum Master** sur un programme SAFe et j'épaule le **RTE** au quotidien. Mes journées, c'est :
- 🗓️ Vérifier qui est absent cette semaine.
- 📊 Savoir où on en est sur le PI courant.
- 🚧 Comprendre pourquoi un ticket bloque depuis 3 jours.
- 🎤 Préparer la Sprint Review.
- 👥 Suivre l'équipe que je coache + soutenir le RTE sur les autres squads de la ligne produit.

JIRA fait ce qu'il sait faire, mais il n'est pas conçu pour la **vie d'équipe au quotidien**. Trop d'onglets. Trop de clics. Trop de *"où est cette info, déjà ?"*. J'ouvrais Excel pour les absences, Slack pour les rotations support, Confluence pour les Sprint Reviews, et JIRA pour tout le reste. Le contexte se perdait entre les outils.

J'ai voulu un **board unique**, autoporteur, qui me serve **moi** d'abord — et qui puisse aussi servir le RTE quand il vient voir l'état du programme. Quitte à ce que JIRA devienne un plugin d'import, pas une dépendance.

---

## 🚀 Semaine 1 — Le POC qui ne devait pas survivre

**🌱 v1.0.0 — 9 avril 2026**

J'ai démarré sur un coup de tête, un mardi après-midi.
FastAPI + une page HTML.
Six vues placeholder.
Mode démo qui crée 30 tickets fake au lancement.

Mes contraintes (auto-imposées, par fierté) :
- ⚡ **Zéro build step.** Pas de webpack, pas de TypeScript, pas de framework JS. Du Vanilla ES modules.
- 📄 **Un seul fichier backend.** `main.py`, point.
- 🗄️ **Un seul fichier de stockage.** SQLite suffit.
- 📦 **Cinq dépendances Python max.** Toujours respecté à ce jour.

Pourquoi ces contraintes ? Parce que je voulais pouvoir reprendre ce code dans 6 mois sans réfléchir. Et parce qu'à 60 deps npm, on perd plus de temps à mettre à jour qu'à coder.

**🌿 v2.0.0 — le lendemain**

CRUD complet pour tickets, features, epics, équipes, membres. JIRA bascule de "central" à "optionnel". Première satisfaction : `python main.py`, l'app marche, sans rien d'autre.

---

## 🏗️ Semaine 2 — Trouver l'os qu'on a vraiment

**🗄️ v3.0.0 — 10 avril**

Migration JSON → SQLite via SQLModel. Pas par perfectionnisme : parce qu'à 200 tickets, mes fichiers JSON commençaient à devenir illisibles et la concurrence d'écriture me faisait perdre des données. Une demi-journée. Migration faite, plus jamais à y revenir.

Ajout du concept **👤 Leader + 👥 Contributors** sur les tickets — parce que dans la vraie vie un ticket n'a pas un seul humain dessus.

Ajout des **🎯 Groupes (lignes produit)** — parce que mon équipe fait partie d'une ligne produit avec d'autres squads. Le filtre topbar bascule entre "Toutes", "Une ligne", "Une équipe". Trois clics, jamais perdus.

**🎓 v3.1 → v3.4 (12 avril)**

J'ai listé tout ce qui me manquait en tant que **Scrum Master** au quotidien :
- 🖱️ Drag & drop entre colonnes du board (parce que cliquer pour changer un statut, c'est lent).
- 📈 Alerte **scope creep** quand des tickets sont ajoutés en cours de sprint.
- 📉 Alerte **velocity en baisse** quand la moyenne 3-derniers chute de >15%.
- 🔁 Board **Retro** avec 4 swimlanes (Retro, Post-mortem, CoP, Adapt).
- 😐 **Mood Meter / ROTI** (1-5 emoji) par équipe.
- ✋ **Fist of Five** pour la confiance PI.

Tout livré en deux jours. Le pattern qui se dessine : à chaque fois que je me dis *"tiens, j'aimerais bien…"*, je le construis. Le sentiment de **pouvoir** est addictif.

---

## 🌍 Semaine 3 — Élargir le périmètre

**🆘 v3.5.0 — 14 avril**

J'ajoute trois vues d'un coup parce qu'elles servent toutes les rôles autour de moi (mon équipe, les autres squads de la ligne produit, le RTE) :
- 🛎️ **Support dashboard** : qui est de garde cette semaine, quels tickets, SLA.
- ⚠️ **ROAM** : matrice des risques (Risks, Opportunities, Assumptions, Mitigations).
- 📅 **PI Calendrier** : timeline du PI, blocs de sprints par équipe.

Mon piège récurrent à ce stade : **vouloir tout en même temps**. J'ai dû me forcer à terminer chaque vue avant d'en démarrer une nouvelle, sinon le `data/board.db` se remplit de modèles à moitié finis.

**🩹 v3.5.1 — le lendemain**

Première vraie erreur de design. J'avais oublié que les tickets retro arrivaient via labels JIRA, pas via mes RetroItems internes. La vue Retro affichait du vide. Fix : passe 6 dans la sync (`JQL labels IN (Retro, Postmortem, CoP-methodo, Adapt)`).

> 💡 **Leçon** : la donnée JIRA arrive rarement comme tu l'imagines. Vérifie toujours sur un échantillon.

**📊 v3.7.x — toute la semaine**

L'enchaînement Sprint Review : template Confluence-ready (HTML autonome), export Markdown enrichi, comparaison de sprints en shift+clic sur le chart vélocité.

J'avais besoin de ça pour ma vraie review du vendredi. **Le besoin métier dicte le sprint dev.**

---

## ✨ Semaine 4 — Plus qu'un outil, une expérience

**📺 v3.8.0 — 23 mai**

Mode **Démo fullscreen** — la version "Sprint Review TV". Overlay noir, stats XXL, gradient bleu→violet sur les chiffres clés, cards de wins qui défilent en auto-scroll. Esc pour sortir, F pour le vrai fullscreen navigateur, Espace pour pauser le scroll.

J'ai pris 2h à peaufiner les animations. Aucun ROI direct. Mais quand j'ai présenté en review devant 25 personnes et que tout le monde s'est tu pour regarder le bilan défiler, j'ai compris : **l'expérience compte autant que la fonction**.

**🎛️ v3.9.0 — Cmd+K boost + Team Switcher fuzzy + Health Check Dashboard**

Mes trois ajouts les plus utilisés au quotidien :
- ⌨️ **Cmd+K** ouvre une palette de commandes avec scoring fuzzy.
- 🔄 **Ctrl+E** ouvre le sélecteur d'équipes — récents en haut, fuzzy en bas. Plus jamais besoin de cliquer dans la sidebar.
- 🩺 **Health Check Dashboard** — un score 0-100, une heatmap équipe × type d'anomalie, des modales d'action en un clic.

Tout ça inspiré de Linear, Raycast, Vercel. **L'UX, c'est l'invisible qui rend l'outil agréable.**

---

## 🔬 Semaines 5-6 — La rigueur des détails

C'est là que j'ai le plus appris. Pas des nouvelles features tape-à-l'œil — des **fixes de fond** sur la qualité de la donnée importée de JIRA.

### 🕵️ Le faux ami `Velocity Chart`

Je voulais afficher la vélocité historique sur chaque sprint clos. J'ai naïvement cherché un endpoint REST `/rest/agile/1.0/board/{id}/velocity`. **404.** Cet endpoint n'existe pas dans l'API publique.

Après recherche : il faut passer par `rest/greenhopper/1.0/rapid/charts/velocity.json?rapidViewId={boardId}`. Endpoint "interne" mais public, utilisé par le widget Velocity Chart natif JIRA. Une fois trouvé : **completed.value + estimated.value pour les 7 derniers sprints clos**, sans avoir à charger les tickets. Cadeau.

> 💡 **Leçon** : avant de calculer côté client ce que JIRA sait déjà, cherche l'endpoint qui te le donne.

### 🐞 Le bug `Team[Team]` qui m'a fait perdre 2 heures

L'utilisateur (moi, dans une autre vie) signale : *"Je ne vois pas mes features PI#29 dans la roadmap, alors qu'elles existent dans JIRA."*

J'ai cherché côté **filtre frontend** pendant longtemps. Tolérance de regex, fallback labels, fallback sprintName — tout marchait sur le papier. Toujours vide.

Diagnostic à l'aide d'un `curl` direct sur l'API locale :
```bash
curl -s http://127.0.0.1:3000/api/features | python -c "..."
```
→ Les 10 features étaient bien en base avec `piSprint="PI#29"` correct. Mais leur `team` valait `"PI Board Features ERPC"` — le **nom du board JIRA cross-team** au lieu de l'équipe responsable.

Cause : dans `transformIssue`, la priorité était `teamName (board) || _teamFromField (Team[Team])`. Le board l'emportait sur le champ `Team[Team]` qui est pourtant la **vérité métier SAFe**.

Fix : une ligne inversée. Mais le diagnostic m'a coûté l'après-midi.

> 💡 **Leçon** : quand l'utilisateur dit *"je ne vois pas X"*, la première question n'est pas *"le filtre marche-t-il ?"* mais *"X est-il vraiment dans le store, et avec quelles métadonnées ?"*. L'outil le plus puissant pour ça : `curl` + `jq` sur ta propre API.

### 🏷️ Le mismatch terminologique "Buffer"

J'ai renommé une barre de chart "Buffer (estimé)" → "Engagement (estimé)" pour clarifier la sémantique. L'utilisateur m'a répondu sèchement : *"je préfère garder le terme Buffer si cela est ok"*.

J'ai revert tout.

> 💡 **Leçon** : ne renomme jamais un terme métier au nom de la pureté sémantique. Les utilisateurs ont leur vocabulaire, respecte-le.

---

## 🗂️ Juin 2026 — Le backlog comme vraie interface

Après la partie Health & Calendrier (mai), je reviens sur une vue que j'utilisais depuis le début sans vraiment l'avoir terminée : **le backlog**.

Au départ c'était une liste de tickets filtrée par sprint. Fonctionnel, mais plat. En juin, j'ai décidé de la traiter comme une vraie interface de pilotage.

### 🔗 Les filtres deviennent partageables (v3.20)

Premier problème : je configure mes filtres (statut "bloqué", type "Bug", sprint courant), je partage le lien avec le RTE — il arrive sur la vue par défaut, sans rien. L'URL ne reflétait pas l'état des filtres.

Solution évidente : sérialiser les filtres dans le hash URL. Mais là, piège classique.

Mon premier séparateur était `?`. Résultat : `#backlog/MonEquipe?h=full` devient `#backlog/MonEquipe%3Fh%3Dfull` après un rechargement navigateur, parce que les navigateurs encodent certains caractères dans les fragments. Les filtres ne se restauraient plus.

J'ai cherché la spécification RFC 3986. Le séparateur `~` est **unreserved** — les navigateurs ne l'encodent jamais dans les fragments. Deux lignes de fix, mais il fallait savoir chercher dans la bonne spec.

```
#backlog/MonEquipe~h=epic~s=blocked,inprog
```

Ce lien se partage, se met en favori, s'ouvre dans un nouvel onglet. L'état se restaure à la virgule près.

> 💡 **Leçon** : avant d'utiliser un caractère comme séparateur dans une URL, vérifier sa classification RFC 3986. Un `?` ou `=` à l'intérieur d'un fragment peut sembler marcher localement et péter en prod.

### 🏗️ Trois modes de hiérarchie (v3.20)

La vue "liste plate" de tickets cachait le contexte. Je voulais voir les Épics qui chapeautent les stories, les Features qui regroupent les épics — sans perdre la densité d'information.

J'ai ajouté un toggle **Plat / Épics / Complet** dans la toolbar :
- **Plat** : comportement historique, tickets seuls.
- **Épics** : les épics apparaissent comme des sous-en-têtes bleutés. Les stories se regroupent sous leur épic.
- **Complet** : Features → Épics → Stories. Trois niveaux imbriqués, indentés visuellement.

Le challenge : ce mode devait coexister avec le groupBy existant (par sprint, équipe, type...). La solution : la hiérarchie s'applique **à l'intérieur** de chaque groupe. On peut donc avoir "groupé par sprint, hiérarchie complète" — ce qui donne par sprint, la liste des Features avec leurs épics et stories dedans.

### 🔮 Sprints futurs dans le backlog (v3.21)

Le backlog n'affichait que les tickets existants. Problème : un sprint futur vide n'apparaissait pas du tout, alors que je voulais pouvoir anticiper sa constitution, voir qu'il n'est pas encore alimenté, visualiser ses dates et son objectif.

J'ai injecté les sprints futurs connus comme **groupes vides** dans le rendu backlog. Visuellement : une fine barre ambre sur la gauche du groupe, le nom en légèrement teinté, le compte à 0. Discret, mais présent.

Subtilité : ces sprints futurs doivent se filtrer selon l'équipe sélectionnée en topbar — sinon je vois les sprints futurs de toutes les squads du programme, ce qui est du bruit pur.

### 📅 Dates et goal sprint éditables inline (v3.21)

Sur chaque en-tête de groupe sprint, j'ai ajouté une pill dates (`◷ 14 — 27 juin`) et un bouton crayon à côté du goal sprint. En cliquant : une zone de texte qui glisse en dessous avec deux champs date (début, fin) et le textarea du goal. `Sauvegarder` → `PUT /api/sprint`. Aucune modale, aucun rechargement.

Le placement était délicat : l'éditeur devait être à l'intérieur de la row d'en-tête pour ne pas être masqué par le CSS de collapse des groupes. Une heure à débugger des `display: none` récalcitrants avant de trouver l'explication dans les règles CSS de `.bl-group-body[data-collapsed="true"] tr:not(.bl-group-hdr-row)`.

> 💡 **Leçon** : quand un élément disparaît de façon inexpliquée, chercher en remontant le DOM les règles CSS qui portent sur les ancêtres — pas seulement sur l'élément lui-même.

---

## 🧰 Les outils

| Outil | Rôle | Mon ressenti |
|-------|------|--------------|
| 💻 **VSCode** | Éditeur principal | Workflow classique, rien à dire |
| 🐙 **GitHub** | Versionnage + GitHub Issues pour le backlog | 100+ commits sur 6 semaines |
| 🤖 **Claude Code** | Pair-programming IA dans VSCode | Le multiplicateur. Sans lui, le projet aurait pris 3× plus de temps |
| ⚡ **FastAPI + SQLModel** | Backend | Productif comme un Express, typé comme un Django |
| 🗄️ **SQLite** | Stockage | Aucune installation, aucune config. Parfait pour single-user |
| 📜 **Vanilla JS + ES modules** | Frontend | Aucun build step. Rechargement instantané. Le bonheur |
| 📊 **Chart.js** | Visualisations | Burndown, Burnup, CFD, Velocity, Throughput, Cycle Time scatter, WIP Age |
| 🔧 **`curl` + Python one-liners** | Debug data | Mon couteau suisse. Plus puissant que n'importe quel DevTool |

### 🤖 Sur Claude Code en particulier

**✅ Ce qui a marché** :
- 🎯 **Briefs précis** : *"Le ticket GCOM-3775 est en PI#29 dans JIRA mais n'apparaît pas dans la roadmap. Vérifie via l'API locale et corrige."* → diagnostic + fix livrés en 3 tours.
- 🔄 **Itérations courtes** : je commit, je teste dans le navigateur, je donne le retour. Pas de PR géante.
- 👀 **Demander à voir avant de croire** : *"montre-moi le code avant de l'écrire"* a évité plusieurs faux départs.

**❌ Ce qui n'a pas marché** :
- 💥 Lui demander de "tout faire d'un coup". L'IA hallucine ses propres détails dès que le contexte se dilue.
- 🗃️ Lui faire confiance sur la persistance. Il oublie une migration. Il oublie un champ JSON. Toujours vérifier les schémas SQL.
- 🧠 Lui demander de re-comprendre le contexte à chaque session. **Garder un CLAUDE.md à jour est crucial.**

---

## 🎁 Ce que tu peux emporter

**1️⃣ Tu peux livrer énormément avec un stack minimal.**
FastAPI + SQLite + Vanilla JS. C'est tout. Pas de microservices, pas de Kubernetes, pas de webpack. Six semaines pour 100+ versions et une vraie utilité quotidienne.

**2️⃣ L'autoporteur > la dépendance.**
JIRA comme plugin d'import optionnel. Si JIRA tombe ou si la sync casse, l'app continue de marcher. Tous les imports doivent être **idempotents** et **récupérables**.

**3️⃣ Construis pour toi d'abord.**
Mes meilleures features sont celles dont **j'avais besoin moi** (Scrum Master au quotidien, ou en soutien du RTE pour la vue programme). Quand on développe pour soi, on sait immédiatement si une décision est bonne. Quand on développe *"pour les utilisateurs"*, on devine.

**4️⃣ La donnée JIRA n'est jamais ce que tu crois.**
- Le champ Sprint peut être un array, un string formaté `[id=123,name=PI#29,state=active]`, ou un objet.
- Le champ Team[Team] est un objet `{id, name}`, pas un string.
- L'endpoint Velocity n'est pas dans `/rest/agile`, il est dans `/rest/greenhopper`.
- `total` dans `/search/jql` est non fiable (souvent capé à `maxResults`).

Vérifie chaque hypothèse sur un échantillon réel avant de coder le mapping.

**5️⃣ L'IA pair-programmée accélère, mais ne remplace pas le diagnostic.**
Claude Code écrit du bon code rapidement. Mais quand un bug est subtil (le mapping `Team[Team]`), c'est moi qui dois trouver l'angle d'attaque. L'IA exécute, l'humain investigue.

**6️⃣ Le bon outil pour le bon job.**
Pas besoin de Postgres pour 1 utilisateur. Pas besoin de React pour une SPA de 6000 lignes. Pas besoin de Docker pour `python main.py`. **Choisis la solution la plus simple qui marche, et tu auras toujours moins de dettes que celui qui a choisi la plus puissante.**

**7️⃣ Itère petit, mais finis chaque incrément.**
Une feature à moitié livrée est pire qu'une feature absente. Le `git log` doit raconter une histoire propre. Le CHANGELOG aussi.

**8️⃣ Documente pendant que tu code, pas après.**
À la v3.4.0, j'ai 6 docs par persona (Scrum Master, PO, RTE, Dev, Support, PM). Elles existent parce que je les ai écrites au fil de l'eau. Six mois plus tard, j'aurais oublié 70% du contexte.

---

## 🚀 Et maintenant ?

Le projet n'est pas fini. Il ne le sera probablement jamais. Le `backlog-features.md` contient encore 46 items.

Mais aujourd'hui, **j'ouvre Squad Board en premier le matin, et Slack en second**. JIRA, je ne l'ouvre plus que pour modifier un ticket. Le RTE vient régulièrement jeter un œil au Health Dashboard et au PI Calendrier pour avoir sa vue programme. C'est le signe que le pari est gagné.

Si tu veux faire pareil pour ton équipe — fork, ouvre `python main.py`, et commence par les features qui te servent **toi**. Tu verras qu'avec une bonne stack, six semaines suffisent à se construire un outil sur mesure.

---

✍️ *Sébastien Rouen — Scrum Master @ Octo, en appui du RTE sur le programme expérimentations.*
📅 *Squad Board, du 9 avril au 11 juin 2026. 100+ versions. Et la suite arrive.*
