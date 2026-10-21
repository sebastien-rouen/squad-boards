"""Configuration : variables d'environnement et chemins."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# config.py vit dans app/ → la racine projet est deux niveaux au-dessus.
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
STATIC_DIR = BASE_DIR / "static"
DB_PATH = DATA_DIR / "board.db"
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

JIRA_URL = os.getenv("JIRA_URL", "").rstrip("/")
JIRA_USER = os.getenv("JIRA_USER", "")
JIRA_TOKEN = os.getenv("JIRA_TOKEN", "")
JIRA_PROJECT = os.getenv("JIRA_PROJECT", "")
# Hôtes JIRA acceptés quand le NAVIGATEUR fournit l'URL (en-tête X-Jira-Url), en plus de *.atlassian.net et de
# l'hôte de JIRA_URL — ex. un JIRA auto-hébergé : JIRA_ALLOWED_HOSTS=jira.mon-domaine.fr
JIRA_ALLOWED_HOSTS = {h.strip().lower() for h in os.getenv("JIRA_ALLOWED_HOSTS", "").split(",") if h.strip()}
