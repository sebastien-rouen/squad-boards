"""ICS / iCalendar parser — développe les récurrences (RRULE) avec gestion DST."""
import json
from datetime import datetime, timezone, date as _date, timedelta

try:
    from icalendar import Calendar as _ICalendar
    from dateutil import rrule as _drule
    from dateutil.relativedelta import relativedelta as _relativedelta
    _ICAL_OK = True
except ImportError:
    _ICAL_OK = False


def _dt_to_utc(dt) -> datetime:
    """Normalise date ou datetime en datetime UTC-aware."""
    if isinstance(dt, datetime):
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    if isinstance(dt, _date):
        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def _parse_ics_events(ics_text: str) -> list[dict]:
    """
    Parse un flux ICS et développe les événements récurrents (RRULE) dans une
    fenêtre de -1 mois à +4 mois autour d'aujourd'hui.

    Corrections fuseau horaire (DST) :
    - Les RRULE étaient générées en datetime NAÏF puis re-taggées UTC arbitrairement,
      ce qui causait un décalage de +/- 1h lors des transitions été/hiver.
    - Désormais on passe `dtstart` AWARE (avec sa tzinfo originelle) à `rrulestr`,
      et dateutil gère correctement les transitions DST. Les occurrences sont
      converties en UTC pour le payload JSON (le navigateur fait le rendu local).

    Dédoublonnage RECURRENCE-ID :
    - Un VEVENT avec `RECURRENCE-ID` est une instance MODIFIÉE d'une récurrence,
      elle doit remplacer l'occurrence générée par la RRULE master pour cette date.
    - On fait un 1er passage pour collecter les overrides par (uid, date),
      puis on les exclut des occurrences RRULE générées et on les ajoute en standalone.
    """
    if not _ICAL_OK:
        raise RuntimeError("icalendar non installé — lancez : pip install icalendar python-dateutil")
    try:
        cal = _ICalendar.from_ical(ics_text)
    except Exception as e:
        raise ValueError(f"ICS invalide : {e}")

    now = datetime.now(timezone.utc)
    win_start = now - _relativedelta(months=1)
    win_end   = now + _relativedelta(months=4)

    vevents = [c for c in cal.walk() if c.name == "VEVENT"]

    # ── Pass 1 : collecte des overrides RECURRENCE-ID par UID ──────────────────
    # Pour chaque UID, on note les dates des instances modifiées → à exclure
    # lors de la génération des occurrences RRULE master.
    overrides_by_uid: dict[str, set] = {}
    for comp in vevents:
        recid = comp.get("RECURRENCE-ID")
        if not recid:
            continue
        uid = str(comp.get("UID", "") or "")
        if not uid:
            continue
        try:
            rec_utc = _dt_to_utc(recid.dt)
            overrides_by_uid.setdefault(uid, set()).add(rec_utc)
        except Exception:
            continue

    events: list[dict] = []
    seen_keys: set = set()  # (uid, start_iso) — dernière barrière anti-doublons

    def _push(ev: dict):
        k = (ev["uid"], ev["start"])
        if k in seen_keys:
            return
        seen_keys.add(k)
        events.append(ev)

    for comp in vevents:
        try:
            uid   = str(comp.get("UID",         "") or "")
            title = str(comp.get("SUMMARY",     "") or "").strip() or "(Sans titre)"
            desc  = str(comp.get("DESCRIPTION", "") or "")[:500]
            loc   = str(comp.get("LOCATION",    "") or "")
            url   = str(comp.get("URL",         "") or "")

            dtstart = comp.get("DTSTART")
            if not dtstart:
                continue
            raw_s = dtstart.dt
            is_all_day = isinstance(raw_s, _date) and not isinstance(raw_s, datetime)
            start = _dt_to_utc(raw_s)

            dtend = comp.get("DTEND")
            dur_p = comp.get("DURATION")
            if dtend:
                end = _dt_to_utc(dtend.dt)
            elif dur_p:
                end = start + dur_p.dt
            else:
                end = start + (timedelta(days=1) if is_all_day else timedelta(hours=1))
            if end <= start:
                end = start + timedelta(hours=1)
            duration = end - start

            # EXDATEs (exceptions de récurrence) — gardées AWARE pour matcher dtstart
            exdates_aware: list[datetime] = []
            exdate_prop = comp.get("EXDATE")
            if exdate_prop:
                if not isinstance(exdate_prop, list):
                    exdate_prop = [exdate_prop]
                for ex_item in exdate_prop:
                    ex_dts = ex_item.dts if hasattr(ex_item, "dts") else [ex_item]
                    for exdt in ex_dts:
                        exdates_aware.append(_dt_to_utc(exdt.dt))

            # Instance modifiée (RECURRENCE-ID) — ajoutée standalone (= override).
            # Pas de RRULE expansion sur ce comp.
            is_override = comp.get("RECURRENCE-ID") is not None

            def _ev(s: datetime, r: bool) -> dict:
                # s doit être aware (UTC) — isoformat produit ".../+00:00" parsable JS
                return {
                    "uid": uid, "title": title, "description": desc, "location": loc,
                    "url": url,
                    "start": s.isoformat(), "end": (s + duration).isoformat(),
                    "allDay": is_all_day, "recurring": r,
                }

            rrule_prop = comp.get("RRULE")
            if rrule_prop and not is_override:
                rule_str = rrule_prop.to_ical().decode("utf-8")
                # Préserve la tz source pour respecter DST : si dtstart a une tzinfo,
                # on l'utilise telle quelle ; sinon on assume UTC (RFC 5545 "Z"-less
                # est interprété "floating" mais on choisit UTC par défaut).
                dtstart_for_rule = raw_s if (isinstance(raw_s, datetime) and raw_s.tzinfo) else start
                try:
                    rset = _drule.rruleset()
                    rset.rrule(_drule.rrulestr(f"RRULE:{rule_str}", dtstart=dtstart_for_rule))
                    for exdt in exdates_aware:
                        # Les exdates doivent être convertibles à la tz de dtstart_for_rule
                        rset.exdate(exdt.astimezone(dtstart_for_rule.tzinfo) if dtstart_for_rule.tzinfo else exdt.replace(tzinfo=None))
                    # Les RECURRENCE-ID overrides sont aussi à exclure des occurrences générées
                    for ov in overrides_by_uid.get(uid, ()):
                        rset.exdate(ov.astimezone(dtstart_for_rule.tzinfo) if dtstart_for_rule.tzinfo else ov.replace(tzinfo=None))
                    for occ in rset.between(win_start, win_end, inc=True):
                        _push(_ev(occ.astimezone(timezone.utc), True))
                except Exception:
                    if win_start <= start <= win_end:
                        _push(_ev(start, True))
            else:
                if start <= win_end and end >= win_start:
                    # Pour un override, on le marque recurring=True (visible dans l'UI)
                    _push(_ev(start, bool(rrule_prop) or is_override))
        except Exception:
            continue

    events.sort(key=lambda e: e["start"])
    return events


def expand_calendar_events(cals, team=None) -> list[dict]:
    """Aplatit les events cachés (events_json) de plusieurs TeamCalendar en une liste
    triée, enrichie de calendarId/calendarName/team. Si `team` est fourni, ne garde que
    les calendriers dont le champ team (CSV) contient l'équipe (un calendrier sans team
    = toutes équipes). Source unique partagée par /api/all et /api/calendars/events."""
    out: list[dict] = []
    for cal in cals:
        if team and cal.team:
            cal_teams = [t.strip() for t in cal.team.split(',') if t.strip()]
            if cal_teams and team not in cal_teams:
                continue
        if not cal.events_json:
            continue
        try:
            for ev in json.loads(cal.events_json):
                ev["calendarId"]   = cal.id
                ev["calendarName"] = cal.name
                ev["team"]         = cal.team
                out.append(ev)
        except Exception:
            pass
    out.sort(key=lambda e: e.get("start", ""))
    return out
