# 🔐 Authentification — SSO BastaVerse

Squad Board s'adosse au **hub d'identité `auth`** de l'écosystème (collection `users` d'une PocketBase dédiée,
fournisseurs Google et Infomaniak) : le même compte ouvre le backlog, le carnet… et Squad Board. Le site ne gère
aucun compte. Livré en **3.280.0**, **armé en 3.285.0** (`AUTH_REQUIRED=true`, `SB_RELOAD=false`).

## Comment ça marche

```
Navigateur ── https://auth-drafts.bastou.dev/pb ──┐  (SDK PocketBase 0.27.0, page /login.html)
   │ cookie sb_session (SameSite=Strict)          │
   ▼                                              │
FastAPI :3010 ── app/auth.py ── POST /api/collections/users/auth-refresh ── http://127.0.0.1:8146
```

| Pièce | Rôle |
|---|---|
| `app/auth.py` | Verrou unique devant `/api/*`, `/jira/*`, `/docs`, `/redoc`, `/openapi.json` ; jeton vérifié auprès du hub (cache 60 s, empreinte SHA-256) ; hub injoignable ⇒ **refus** |
| `GET /api/auth/status` | **Public** : `{ required, hub }` — le front lit le commutateur ICI (un seul réglage, côté serveur) |
| `GET /api/auth/me` | Compte de la session ; sert à la page de connexion pour confirmer la liste blanche |
| `static/js/auth-session.js` | Garde au démarrage (`ensureAuth`, avant tout appel), cookie, prolongation toutes les 6 h (écran TV), 401 ⇒ reconnexion |
| `static/login.html` + `js/login.js` + `css/login.css` (copie commune) + `css/login-theme.css` (décor du site) | Page de connexion |

- **Cookie `sb_session`** : recopie du jeton du SDK, pour que les `<img>` des pièces jointes JIRA, les `fetch`
  directs et les liens de téléchargement partent authentifiés sans en-tête.
- **`X-Auth-Required: 1`** sur les refus du verrou : seul ce 401 déconnecte. Un 401 **relayé** par le proxy JIRA
  (jeton JIRA expiré) reste une erreur JIRA.
- Page, JS, CSS restent publics (le code n'est pas secret, les données le sont).
- Swagger (`/docs`) n'existe plus quand la porte est fermée.

## Qui peut entrer

⚠️ Le hub CRÉE un compte à la première connexion Google / Infomaniak : sans liste, n'importe quel compte entre.
- **Accès de secours** : `AUTH_ALLOWED_EMAILS` du `.env` — toujours autorisés, modifiables seulement sur le serveur.
- **Paramètres → 🔐 Accès** (3.285.0) : les autres comptes, un e-mail par ligne, pris en compte en 15 s sans
  redémarrage (table `server_secret`, jamais exportée). Le serveur refuse une liste qui retirerait l'accès à celui
  qui l'enregistre (hors accès de secours).

## Réglages (`.env`)

```env
AUTH_REQUIRED=false                                 # le SEUL commutateur
AUTH_POCKETBASE_URL=http://127.0.0.1:8146           # vérification serveur (réseau interne)
AUTH_PUBLIC_URL=https://auth-drafts.bastou.dev/pb   # même hub, vu par le navigateur
AUTH_ALLOWED_EMAILS=                                # vide = tout compte du hub
SB_HOST=127.0.0.1                                   # défaut ; 0.0.0.0 pour exposer le port
SB_RELOAD=true                                      # false en exploitation
```

## Armer — l'ordre compte

1. **Tester la connexion porte ouverte** : `https://squad-boards.bastou.dev/login.html?test` → se connecter
   (Google / Infomaniak) → retour au site. Le flux OAuth du hub est validé sans rien fermer.
2. `.env` : `AUTH_REQUIRED=true` (et idéalement `AUTH_ALLOWED_EMAILS=…`), puis `pm2 restart squad-boards-drafts`.
3. Vérifier :

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://squad-boards.bastou.dev/api/teams        # 401
curl -s https://squad-boards.bastou.dev/api/auth/status                                   # required: true
curl -s -o /dev/null -w '%{http_code}\n' https://squad-boards.bastou.dev/docs             # 404
```

4. Se connecter dans le navigateur (Google ou Infomaniak), vérifier le bouton de compte en pied de menu.
   **Écran TV** : s'y connecter une fois ; la session est prolongée tant que la page reste ouverte.

Désarmer = `AUTH_REQUIRED=false` + restart (aucune donnée touchée).

## Pièges

- **Instance de démo** (`tools/demo-video`, port 3011) : elle lit le même `.env`. Une variable d'environnement
  passée au lancement l'emporte sur le `.env` (`load_dotenv` sans override) → lancer la démo avec
  `AUTH_REQUIRED=false` dans son bloc `server` une fois la porte armée.
- **Depuis `127.0.0.1:3010`** la page de connexion n'affiche aucun fournisseur : le CORS du hub n'accepte que
  `*.bastou.dev`. Tester par le domaine.
- Diagnostic des pannes du hub : skill `/auth-sso` §9 (tableau symptôme → cause).
