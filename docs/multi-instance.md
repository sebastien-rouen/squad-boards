# Plusieurs projets : une instance par projet

> 3.278.0 — décision de l'analyse « site paramétrable » (P3-13) : **multi-instance**, pas multi-tenant.

## Principe

Un projet = une base SQLite + un port. Le code est le même ; tout ce qui est propre au projet vit **dans sa
base** depuis 3.266.0 → 3.277.0 :

| Dans la base de l'instance | Où ça se règle |
|---|---|
| Équipes, personnes, tickets, sprints, PI | Paramètres, synchro JIRA, assistant de mise en route |
| Réglages de projet (`project_setting`) : seuils, champs JIRA, correspondance des statuts, fériés, modules, identité | Paramètres → Règles, JIRA, Calendrier, Modules, Identité |
| Secrets (`server_secret`) : connexion JIRA, webhook Slack — écriture seule | Paramètres → JIRA / Slack |

Partagé entre instances lancées depuis le même dossier : le code, le `.env` (connexion JIRA de **repli** seulement,
quand aucune n'est enregistrée dans Paramètres) et, sauf `SB_UPLOADS_DIR`, le dossier des pièces jointes.

## Lancer un deuxième projet

```bash
cp ecosystem.instances.example.cjs ecosystem.projet-b.cjs   # nom, port, SB_DB_PATH, SB_UPLOADS_DIR
pm2 start ecosystem.projet-b.cjs
curl -s http://127.0.0.1:3012/api/config                    # l'instance répond, base créée
```

Au premier affichage, le site propose la démo, JIRA ou **🧭 Mettre en route mon projet** (cadence, équipes,
modules, calendrier). Donner ensuite un **nom et une couleur** (Paramètres → Identité du projet) pour distinguer
les onglets.

Exposer l'instance : un hôte Nginx Proxy Manager vers `127.0.0.1:<port>` (même modèle que
`squad-boards-drafts.bastou.dev`).

## Démarrer depuis un projet existant

Paramètres → Données → 💾 export de configuration `.local` sur le projet source, puis import sur la nouvelle
instance (réglages de projet compris). Un mode « gabarit » sans données est prévu (BACKLOG P3-14).

## Limites connues

- **Pas d'authentification** (BACKLOG #A2) : chaque instance est ouverte à qui atteint son port — à fermer avant
  d'y mettre un vrai projet.
- `reload=True` dans `main.py` (mode développement) : chaque instance surveille le code ; à retirer en exploitation.
- Préférences d'affichage (thème, dépliages, filtres) : par navigateur ET par adresse — deux instances sur deux
  sous-domaines ne se les partagent pas, ce qui est voulu.
