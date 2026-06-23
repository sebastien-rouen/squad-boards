"""Routeur Planning Poker — ré-estimation collaborative d'un ticket (live via polling).

Données éphémères (une session de vote par ticket) : volontairement HORS de /api/all
(golden export) pour ne pas alourdir le snapshot. Le front interroge GET en boucle (~2 s).

Endpoints :
    GET  /api/poker/{ticket}          → liste des votes du ticket
    POST /api/poker/{ticket}/vote     → upsert du vote d'un participant (1 par voteur)
    POST /api/poker/{ticket}/reveal   → révèle tous les votes du ticket
    POST /api/poker/{ticket}/reset    → efface tous les votes du ticket
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _now
from app.db import get_session
from app.models import PokerVote
from app.serializers import _poker_dict

router_poker = APIRouter(tags=["poker"])

# Cartes acceptées (Fibonacci + carte "inconnu")
_ALLOWED = {"1", "2", "3", "5", "8", "13", "21", "?"}


def _votes_of(ticket: str, session: Session):
    q = select(PokerVote).where(PokerVote.ticket_id == ticket).order_by(PokerVote.created_at)
    return session.exec(q).all()


@router_poker.get("/api/poker/{ticket}")
def list_poker(ticket: str, session: Session = Depends(get_session)):
    return [_poker_dict(p) for p in _votes_of(ticket, session)]


@router_poker.post("/api/poker/{ticket}/vote")
async def vote_poker(ticket: str, request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    voter = (body.get("voter") or "").strip()
    value = str(body.get("value") or "").strip()
    if not voter:
        raise HTTPException(400, "Le nom du participant est requis")
    if value not in _ALLOWED:
        raise HTTPException(400, "Valeur de vote invalide")
    # Upsert : un vote par (ticket, voter). Voter à nouveau remet le vote à "caché".
    existing = session.exec(
        select(PokerVote).where(PokerVote.ticket_id == ticket, PokerVote.voter == voter)
    ).first()
    if existing:
        existing.value = value
        existing.revealed = False
        existing.updated_at = _now()
        session.add(existing)
    else:
        session.add(PokerVote(ticket_id=ticket, voter=voter, value=value))
    session.commit()
    return [_poker_dict(p) for p in _votes_of(ticket, session)]


@router_poker.post("/api/poker/{ticket}/reveal")
def reveal_poker(ticket: str, session: Session = Depends(get_session)):
    for p in _votes_of(ticket, session):
        p.revealed = True
        p.updated_at = _now()
        session.add(p)
    session.commit()
    return [_poker_dict(p) for p in _votes_of(ticket, session)]


@router_poker.post("/api/poker/{ticket}/reset")
def reset_poker(ticket: str, session: Session = Depends(get_session)):
    for p in _votes_of(ticket, session):
        session.delete(p)
    session.commit()
    return []


@router_poker.delete("/api/poker/{ticket}/voter/{voter}")
def leave_poker(ticket: str, voter: str, session: Session = Depends(get_session)):
    """Retire un participant (bouton « Quitter ») de la session de vote du ticket."""
    rows = session.exec(
        select(PokerVote).where(PokerVote.ticket_id == ticket, PokerVote.voter == voter)
    ).all()
    for p in rows:
        session.delete(p)
    session.commit()
    return [_poker_dict(p) for p in _votes_of(ticket, session)]
