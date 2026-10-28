"""Routeur Planning Poker — ré-estimation collaborative d'un ticket (live via polling).

Données éphémères (une session de vote par ticket) : volontairement HORS de /api/all
(golden export) pour ne pas alourdir le snapshot. Le front interroge GET en boucle (~2 s).

Endpoints :
    GET  /api/poker/{ticket}          → liste des votes du ticket
    POST /api/poker/{ticket}/vote     → upsert du vote d'un participant (1 par voteur)
    POST /api/poker/{ticket}/reveal   → révèle tous les votes du ticket
    POST /api/poker/{ticket}/reset    → efface tous les votes du ticket
    GET  /api/poker/{ticket}/rounds   → tours CONCLUS du ticket (historique, du plus récent au plus ancien)
    POST /api/poker/{ticket}/rounds   → enregistre un tour conclu (votes + valeur retenue)

Les tours conclus (`PokerRound`) sont DURABLES : dans /api/export (et sa restauration), pas dans /api/all
(chargés à la demande par la modale ticket).
"""
import re

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _now
from app.db import get_session
from app.models import PokerVote, PokerRound
from app.serializers import _poker_dict, _poker_round_dict
from app.auth import signed

router_poker = APIRouter(tags=["poker"])

# Cartes acceptées (3.272.0) : l'échelle est réglable par projet (Paramètres → Règles métier) — tout entier de
# 0 à 999, « ? » et « ☕ » ; même motif que POKER_CARD_RE (static/js/rules.js). Avant : Fibonacci 1 → 21 figé.
_CARD_RE = re.compile(r"^(\d{1,3}|\?|☕)$")


def _allowed(value: str) -> bool:
    return bool(_CARD_RE.match(value or ""))


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
    if not _allowed(value):
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


@router_poker.get("/api/poker/{ticket}/rounds")
def list_poker_rounds(ticket: str, session: Session = Depends(get_session)):
    q = select(PokerRound).where(PokerRound.ticket_id == ticket).order_by(PokerRound.created_at.desc())
    return [_poker_round_dict(r) for r in session.exec(q).all()]


@router_poker.post("/api/poker/{ticket}/rounds")
async def save_poker_round(ticket: str, request: Request, session: Session = Depends(get_session)):
    """Body : { value, votes: [{ voter, value }], author, team }. Moyenne et écart recalculés ici."""
    body = await request.json()
    try:
        value = int(body.get("value"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Valeur retenue invalide")
    votes = [{"voter": str(v.get("voter") or "").strip(), "value": str(v.get("value") or "").strip()}
             for v in (body.get("votes") or []) if isinstance(v, dict)]
    votes = [v for v in votes if v["voter"] and _allowed(v["value"])]
    nums = [int(v["value"]) for v in votes if v["value"].isdigit()]
    avg = round(sum(nums) / len(nums), 2) if nums else None
    spread = round((sum((n - avg) ** 2 for n in nums) / len(nums)) ** 0.5, 2) if len(nums) > 1 else (0.0 if nums else None)
    r = PokerRound(ticket_id=ticket, team=(body.get("team") or "").strip(), value=value, votes=votes,
                   voters=len(votes), avg=avg, spread=spread, author=signed(request, (body.get("author") or "").strip()))
    session.add(r)
    session.commit()
    session.refresh(r)
    return _poker_round_dict(r)


@router_poker.get("/api/poker-rounds")
def list_team_rounds(team: str = "", since: str = "", session: Session = Depends(get_session)):
    """Tours conclus d'une équipe depuis `since` (ISO) — page « Séance d'affinage » (du plus récent au plus ancien)."""
    q = select(PokerRound)
    if team:
        q = q.where(PokerRound.team == team)
    if since:
        q = q.where(PokerRound.created_at >= since)
    return [_poker_round_dict(r) for r in session.exec(q.order_by(PokerRound.created_at.desc())).all()]


@router_poker.get("/api/poker-sessions")
def list_poker_sessions(session: Session = Depends(get_session)):
    """Sessions de vote EN COURS : { ticketId: { votes, revealed } } — repère « 🗳 en cours » de la file."""
    out: dict = {}
    for v in session.exec(select(PokerVote)).all():
        s = out.setdefault(v.ticket_id, {"votes": 0, "revealed": True})
        s["votes"] += 1
        s["revealed"] = s["revealed"] and bool(v.revealed)
    return out
