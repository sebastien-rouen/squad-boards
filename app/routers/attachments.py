"""Routeur Attachments — pièces jointes d'un atelier (image, PDF, XLS, Doc).

Fichier stocké sur disque (`data/uploads/`, nom = id généré, jamais le nom d'origine
de l'utilisateur) ; métadonnées en DB. Servi via une route dédiée (pas de StaticFiles
sur le dossier) pour garder le contrôle des extensions et éviter le listing public.
"""
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.common import _gen_id
from app.config import UPLOADS_DIR
from app.db import get_session
from app.models import Attachment, TeamWorkshop
from app.serializers import _attachment_dict

router = APIRouter(tags=["attachments"])

MAX_SIZE = 15 * 1024 * 1024  # 15 Mo
ALLOWED_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",   # images
    ".pdf",                                      # PDF
    ".xls", ".xlsx",                             # tableurs
    ".doc", ".docx",                             # documents
}


@router.get("/api/team-workshops/{workshop_id}/attachments")
def list_attachments(workshop_id: str, session: Session = Depends(get_session)):
    rows = session.exec(select(Attachment).where(Attachment.team_workshop_id == workshop_id)).all()
    return [_attachment_dict(a) for a in rows]


@router.post("/api/team-workshops/{workshop_id}/attachments")
async def upload_attachment(workshop_id: str, file: UploadFile = File(...),
                            session: Session = Depends(get_session)):
    if not session.get(TeamWorkshop, workshop_id):
        raise HTTPException(404, "Atelier non trouvé")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "Type de fichier non autorisé (image, PDF, XLS, Doc uniquement)")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "Fichier trop volumineux (15 Mo max)")
    stored_name = f"{_gen_id()}{ext}"
    (UPLOADS_DIR / stored_name).write_bytes(content)
    att = Attachment(
        team_workshop_id=workshop_id, filename=file.filename or stored_name,
        stored_name=stored_name, content_type=file.content_type or "application/octet-stream",
        size=len(content),
    )
    session.add(att)
    session.commit()
    session.refresh(att)
    return _attachment_dict(att)


@router.get("/api/attachments/{attachment_id}/download")
def download_attachment(attachment_id: str, session: Session = Depends(get_session)):
    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(404, "Pièce jointe non trouvée")
    path = UPLOADS_DIR / att.stored_name
    if not path.exists():
        raise HTTPException(404, "Fichier manquant sur le serveur")
    return FileResponse(path, media_type=att.content_type, filename=att.filename)


@router.delete("/api/attachments/{attachment_id}")
def delete_attachment(attachment_id: str, session: Session = Depends(get_session)):
    att = session.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(404, "Pièce jointe non trouvée")
    (UPLOADS_DIR / att.stored_name).unlink(missing_ok=True)
    session.delete(att)
    session.commit()
    return {"ok": True}
