"""Routeur Absences — liste filtrée + create + repair-encoding + bulk + update/delete (factory)."""
from typing import Optional

from fastapi import Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _normalize_team
from app.db import get_session
from app.models import Absence
from app.serializers import _absence_dict
from app.crud import make_crud_router

# update (field_map) + delete via factory ; list custom (filtres), pas de GET/{id}.
router = make_crud_router(
    model=Absence, serializer=_absence_dict, prefix="/api/absences",
    tag="absences", not_found="Absence non trouvee", with_list=False,
    field_map={"memberName": "member_name", "startDate": "start_date", "endDate": "end_date"},
)


@router.get("")
def list_absences(team: Optional[str] = None, member: Optional[str] = None,
                  session: Session = Depends(get_session)):
    q = select(Absence)
    if team:
        q = q.where(Absence.team == team)
    if member:
        q = q.where(Absence.member_name == member)
    return [_absence_dict(a) for a in session.exec(q).all()]


@router.post("")
async def create_absence(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("memberName"):
        raise HTTPException(400, "Le nom du membre est requis")
    a = Absence(
        member_name=body["memberName"],
        team=_normalize_team(body.get("team", "")),
        start_date=body.get("startDate", ""),
        end_date=body.get("endDate", ""),
        type=body.get("type", "conge"),
        days=body.get("days", 1.0),
        note=body.get("note", ""),
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return _absence_dict(a)


@router.post("/repair-encoding")
async def repair_absence_encoding(session: Session = Depends(get_session)):
    """Corrige les noms d'équipe et de membre encodés en mojibake (Windows-1252 lu comme UTF-8).
    Ex: 'CamÃ©lÃ©on' -> 'Caméléon'. Idempotent : ne modifie que les lignes effectivement corrompues."""
    def _fix(s: str) -> str:
        if not s:
            return s
        try:
            fixed = s.encode('latin-1').decode('utf-8')
            return fixed if fixed != s else s
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s

    fixed_count = 0
    for a in session.exec(select(Absence)).all():
        new_team = _normalize_team(_fix(a.team or ""))
        new_name = _fix(a.member_name or "")
        if new_team != a.team or new_name != a.member_name:
            a.team = new_team
            a.member_name = new_name
            session.add(a)
            fixed_count += 1
    session.commit()
    return {"ok": True, "fixed": fixed_count}


@router.post("/bulk")
async def bulk_create_absences(request: Request, session: Session = Depends(get_session)):
    """Import d'absences en lot.

    Clé de déduplication : (member_name, start_date, end_date).
      - `replace=True` vide toute la table d'abord ;
      - `replaceRange={start,end}` ne supprime que les absences CHEVAUCHANT la fenêtre ;
      - sinon, mode « ajouter » : une clé déjà connue est MISE À JOUR si la durée, l'équipe
        ou le type ont changé (`updated`), sinon ignorée (`skipped`).

    Renvoie aussi `overlaps` : les absences importées qui recouvrent partiellement une
    absence existante de la même personne sans avoir la même clé. Elles sont créées — c'est
    à l'utilisateur de trancher, via « Écraser la période » — mais le silence sur ce point
    faisait compter deux fois les mêmes jours dans la capacité.
    """
    body = await request.json()
    items = body.get("absences", [])
    replace = body.get("replace", False)
    replace_range = body.get("replaceRange") or None
    deleted = 0
    if replace:
        for row in session.exec(select(Absence)).all():
            session.delete(row)
            deleted += 1
        session.flush()
    elif replace_range:
        rs = (replace_range.get("start") or "").strip()
        re_ = (replace_range.get("end") or "").strip()
        if rs and re_:
            # Chevauchement [rs, re_] : start <= re_ ET end >= rs (dates ISO YYYY-MM-DD, comparaison lexicale OK)
            for row in session.exec(select(Absence)).all():
                a_start = row.start_date or ""
                a_end = row.end_date or a_start
                if a_start <= re_ and a_end >= rs:
                    session.delete(row)
                    deleted += 1
            session.flush()

    # Index des absences existantes par (nom, début, fin) — la clé de déduplication.
    # ⚠️ Cette clé ne contient PAS `days` : deux imports successifs où la RH a corrigé une
    # demi-journée en journée pleine produisent la MÊME clé. Avant la 3.148.0 la ligne était
    # simplement « skipped » : la correction se perdait en silence, l'absence gardait ses
    # 0,5 j et personne n'en était informé. On met donc à jour ce dont le fichier fait
    # autorité (durée, équipe, type) au lieu d'ignorer.
    rows = session.exec(select(Absence)).all()
    par_cle = {}
    for a in rows:
        par_cle.setdefault((a.member_name, a.start_date, a.end_date), a)
    # Index par personne pour détecter les chevauchements PARTIELS, que la clé exacte laisse
    # passer : une ancienne absence 09→09 et une nouvelle 09→10 sont deux clés distinctes,
    # donc deux enregistrements — et le 09 est alors compté deux fois dans la capacité.
    par_personne = {}
    for a in rows:
        par_personne.setdefault(a.member_name, []).append(a)

    created = 0
    skipped = 0
    updated = 0
    overlaps = []
    for d in items:
        nom = d.get("memberName", "")
        debut = d.get("startDate", "")
        fin = d.get("endDate", debut)
        key = (nom, debut, fin)
        jours = d.get("days", 1.0)
        equipe = _normalize_team(d.get("team", ""))
        type_ = d.get("type", "conge")

        exist = par_cle.get(key)
        if exist is not None:
            # Comparaison tolérante : 0.5 et 0.50 sont la même durée, et un flottant qui
            # a fait l'aller-retour JSON peut différer d'un epsilon.
            change = (
                abs(float(exist.days or 0) - float(jours or 0)) > 1e-6
                or (equipe and exist.team != equipe)
                or (type_ and exist.type != type_)
            )
            if change:
                exist.days = jours
                if equipe:
                    exist.team = equipe
                if type_:
                    exist.type = type_
                session.add(exist)
                updated += 1
            else:
                skipped += 1
            continue

        # Chevauchement partiel avec une absence existante de la même personne : on le
        # SIGNALE sans trancher — fusionner à sa place serait une décision métier, et
        # l'option « Écraser la période » existe justement pour ce cas.
        for autre in par_personne.get(nom, []):
            a_deb = autre.start_date or ""
            a_fin = autre.end_date or a_deb
            if a_deb <= fin and a_fin >= debut and (a_deb, a_fin) != (debut, fin):
                if len(overlaps) < 20:
                    overlaps.append({
                        "memberName": nom,
                        "existant": f"{a_deb}→{a_fin}",
                        "importe": f"{debut}→{fin}",
                    })
                break

        a = Absence(
            member_name=nom,
            team=equipe,
            start_date=debut,
            end_date=fin,
            type=type_,
            days=jours,
            note=d.get("note", ""),
        )
        session.add(a)
        par_cle[key] = a
        par_personne.setdefault(nom, []).append(a)
        created += 1
    session.commit()
    return {
        "ok": True, "created": created, "skipped": skipped, "updated": updated,
        "deleted": deleted, "overlaps": overlaps,
    }
