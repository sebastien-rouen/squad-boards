"""Lecture / écriture des secrets de projet (table `server_secret`, 3.269.0).

Ordre de résolution des identifiants JIRA : valeur enregistrée depuis Paramètres > `.env` > rien.
Les routes ne renvoient JAMAIS un jeton ni un webhook : seulement leur présence (`*Set`).
"""
from urllib.parse import urlparse

from sqlmodel import Session

from app.common import _now
from app.config import JIRA_URL, JIRA_USER, JIRA_TOKEN, JIRA_ALLOWED_HOSTS
from app.db import engine
from app.models import ServerSecret


def get_secret(key: str) -> str:
    with Session(engine) as s:
        row = s.get(ServerSecret, key)
        return row.value if row else ""


def set_secrets(values: dict) -> None:
    """{clé: valeur} ; valeur vide = suppression (retour au .env)."""
    with Session(engine) as s:
        for key, value in values.items():
            row = s.get(ServerSecret, key)
            if not value:
                if row:
                    s.delete(row)
            elif row:
                row.value, row.updated_at = value, _now()
            else:
                s.add(ServerSecret(key=key, value=value))
        s.commit()


def jira_effective() -> tuple[str, str, str, str]:
    """(url, user, token, source) effectifs — source = 'serveur' si une valeur enregistrée est en jeu, sinon 'env'."""
    url, user, token = get_secret("jira.url"), get_secret("jira.user"), get_secret("jira.token")
    source = "serveur" if (url or user or token) else ("env" if JIRA_URL else "")
    return (url or JIRA_URL).rstrip("/"), user or JIRA_USER, token or JIRA_TOKEN, source


def host_allowed(host: str) -> bool:
    """Hôte JIRA acceptable : Atlassian Cloud, l'hôte du .env, ou JIRA_ALLOWED_HOSTS (jamais le réseau interne)."""
    host = (host or "").lower()
    env_host = (urlparse(JIRA_URL).hostname or "").lower()
    return bool(host) and (host.endswith(".atlassian.net") or host == env_host or host in JIRA_ALLOWED_HOSTS)
