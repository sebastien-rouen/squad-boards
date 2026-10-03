# Page 403 explicite (Nginx Proxy Manager)

> BACKLOG « 🌐 Accès & erreurs » — préparé le 2026-10-03 (3.197.0), **à appliquer à la main** dans
> Nginx Proxy Manager (LXC `npm`) : c'est une configuration d'infra, rien n'est déployé par le site.

## Le problème

L'hôte proxy `squad-boards(-drafts).bastou.dev` est protégé par une **Access List** (réseau local
seulement). Derrière un VPN (ex. VPN Firefox), la requête arrive d'une IP publique : nginx répond
`403 Forbidden` avec sa page nue (« access forbidden by rule » dans le journal). On croit le site
cassé, alors qu'il suffit de couper le VPN.

## La correction

Une page d'erreur **en ligne** (aucun fichier à copier dans le conteneur) : `error_page` envoie le 403
vers une location nommée qui renvoie le HTML. La location nommée n'a pas de règle `deny`, elle est
donc servie même quand l'Access List refuse.

NPM → **Hosts → Proxy Hosts → squad-boards(-drafts).bastou.dev → ⚙ Edit → Advanced → Custom Nginx
Configuration**, coller :

```nginx
# Page 403 explicite — Access List « réseau local » (squad-boards, 3.197.0)
error_page 403 @sb_forbidden;
location @sb_forbidden {
    default_type "text/html";
    charset utf-8;
    add_header Cache-Control "no-store" always;
    return 403 '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accès réservé — Squad Board</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font:16px/1.5 system-ui,sans-serif;padding:16px}main{max-width:34rem;text-align:center}h1{font-size:1.5rem;margin:.5rem 0}.ico{font-size:3.5rem}ul{text-align:left;color:#cbd5e1}code{background:#1e293b;padding:1px 6px;border-radius:4px}small{color:#94a3b8}</style></head><body><main><div class="ico">🔒</div><h1>Accès réservé au réseau local</h1><p>Squad Board n’est joignable que depuis le réseau de la maison (ou par l’accès distant).</p><ul><li>Un <b>VPN</b> est actif (VPN Firefox, extension…) ? <b>Coupez-le</b> puis rechargez la page.</li><li>À l’extérieur ? Passez par l’<b>accès distant</b> habituel.</li></ul><p><small>Erreur 403 — accès refusé par la règle du proxy, le site n’est pas en panne.</small></p></main></body></html>';
}
```

Puis **Save** : NPM recharge nginx (vérifie la syntaxe avant ; en cas d'erreur, l'hôte passe
« Offline » et le message s'affiche dans NPM — retirer le bloc et réessayer).

## Vérifier

```bash
# Depuis le réseau local : le site répond normalement (200)
curl -s -o /dev/null -w "%{http_code}\n" https://squad-boards-drafts.bastou.dev/
# Depuis une IP extérieure (VPN actif, ou 4G) : 403 AVEC la page explicite
curl -s https://squad-boards-drafts.bastou.dev/ | grep -o "Accès réservé au réseau local"
```

## Notes

- Même bloc réutilisable pour les autres hôtes protégés par une Access List (changer le nom du site
  dans le titre et le texte).
- `always` sur `Cache-Control` : sans lui, nginx n'ajoute pas l'en-tête à une réponse d'erreur, et un
  navigateur pourrait garder la page 403 après la coupure du VPN.
- Les guillemets simples délimitent le corps : le HTML n'utilise que des guillemets doubles et des
  apostrophes typographiques (’).
