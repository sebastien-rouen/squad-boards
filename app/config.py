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
DEMO_DIR = BASE_DIR / "docs" / "demo"   # démos vidéo servies sous /demo/ (main.py)
# Base SQLite : `SB_DB_PATH` (absolu, ou relatif à la racine du projet) pour une instance parallèle — ex. la base du
# jeu de démo filmé par tools/demo-video (`PORT=3011 SB_DB_PATH=data/demo.db python3 main.py`). Défaut : data/board.db.
_db_env = os.getenv("SB_DB_PATH", "").strip()
DB_PATH = (Path(_db_env) if Path(_db_env).is_absolute() else BASE_DIR / _db_env) if _db_env else DATA_DIR / "board.db"
# Pièces jointes : `SB_UPLOADS_DIR` (absolu ou relatif à la racine) pour qu'une instance parallèle n'écrive pas dans
# le dossier d'une autre (docs/multi-instance.md, 3.287.0). Défaut : data/uploads.
_up_env = os.getenv("SB_UPLOADS_DIR", "").strip()
UPLOADS_DIR = (Path(_up_env) if Path(_up_env).is_absolute() else BASE_DIR / _up_env) if _up_env else DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

JIRA_URL = os.getenv("JIRA_URL", "").rstrip("/")
JIRA_USER = os.getenv("JIRA_USER", "")
JIRA_TOKEN = os.getenv("JIRA_TOKEN", "")
JIRA_PROJECT = os.getenv("JIRA_PROJECT", "")
# Hôtes JIRA acceptés quand le NAVIGATEUR fournit l'URL (en-tête X-Jira-Url), en plus de *.atlassian.net et de
# l'hôte de JIRA_URL — ex. un JIRA auto-hébergé : JIRA_ALLOWED_HOSTS=jira.mon-domaine.fr
JIRA_ALLOWED_HOSTS = {h.strip().lower() for h in os.getenv("JIRA_ALLOWED_HOSTS", "").split(",") if h.strip()}
