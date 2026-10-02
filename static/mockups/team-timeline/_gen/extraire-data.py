"""Régénère _shared/data.js (frise des faits marquants) depuis data/board.db — LECTURE SEULE.

    python static/mockups/team-timeline/_gen/extraire-data.py      # depuis la racine du site

Fenêtre avril → novembre 2026, 13 équipes. Tout est calculé ici en données brutes ; le rendu
(regroupements, turnover, couleurs) est fait par le JS des maquettes, comme le ferait le site.
"""
import json
import os
import re
import sqlite3
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

W0, W1, TODAY = '2026-04-01', '2026-11-30', '2026-09-29'
DST = 'static/mockups/team-timeline/_shared/data.js'
SWITCH_S = datetime(2026, 3, 29, 1, tzinfo=timezone.utc)     # passage à l'heure d'été
SWITCH_W = datetime(2026, 10, 25, 1, tzinfo=timezone.utc)    # retour à l'heure d'hiver


def local_day(s):
    """ISO UTC → date locale Europe/Paris (sans tzdata : heure d'été entre les deux bascules)."""
    d = datetime.fromisoformat(s.replace('Z', '+00:00'))
    if d.tzinfo is None:
        return s[:10]
    return (d + timedelta(hours=2 if SWITCH_S <= d < SWITCH_W else 1)).strftime('%Y-%m-%d')


def norm(name):
    """« HÉDÉ-HAÜY, Pierre-Just » == « HEDE-HAUY, Pierre-Just » : sans accents, minuscules."""
    s = unicodedata.normalize('NFD', name or '')
    return ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').lower().strip()


def base_team(t):
    return re.sub(r'^(Team|Équipe|Equipe)\s+', '', t or '').strip()


c = sqlite3.connect('file:data/board.db?mode=ro', uri=True)
teams = [dict(name=n, color=col) for n, col in c.execute('select name, color from team order by name')]
tnames = {t['name'] for t in teams}

# ── PI et sprints (dates JIRA réelles, par équipe) ─────────────────────────────
_, ts = c.execute('select name, team_sprints from sprintconfig').fetchone()
sprints = defaultdict(list)
pi_start = {}
for s in json.loads(ts):
    m = re.search(r'(\d+)\.(\d+)', s['name'])
    if not m or s['team'] not in tnames:
        continue
    pi, n = int(m.group(1)), int(m.group(2))
    if pi < 29:
        continue
    st, en = local_day(s['startDate']), local_day(s.get('plannedEndDate') or s['endDate'])
    sprints[s['team']].append(dict(label=f'{pi}.{n}', start=st, end=en))
    if n == 1:
        pi_start[pi] = min(pi_start.get(pi, st), st)
for v in sprints.values():
    v.sort(key=lambda x: x['start'])

# ── Rosters par PI (noms dédoublonnés sans accents) ────────────────────────────
pm = json.loads(c.execute('select pi_members from piconfig').fetchone()[0] or '{}')
rosters = {}
for pi, members in pm.items():
    by = defaultdict(dict)
    for m in members:
        t = base_team(m.get('team'))
        if t in tnames:
            by[t].setdefault(norm(m['name']), dict(name=m['name'], role=m.get('role') or ''))
    rosters[pi] = {t: list(v.values()) for t, v in by.items()}

# ── Check-lists onboarding / offboarding (date exacte, nom dans le titre) ──────
moves = []
for tid, created, labels, title in c.execute(
        "select id, created_at, labels, title from ticket where labels like '%boarding%' order by created_at"):
    lab = [x.lower() for x in json.loads(labels or '[]')]
    kind = 'out' if 'offboarding' in lab else 'in' if 'onboarding' in lab else None
    day = local_day(created)
    if not kind or not (W0 <= day <= W1):
        continue
    who = re.sub(r'(?i)^.*?(on|off)boarding\s*[-–:]?\s*', '', title)
    who = re.sub(r"(?i)^(d['’]un\s+)?co[ée]quipier\s+ERPC\s*[-–:]?\s*", '', who).strip(' -–')
    moves.append(dict(id=tid, day=day, kind=kind, who=who, title=title, team=None))


# Rattache chaque mouvement à une équipe : ≥ 2 mots en commun (sans accents) avec un membre d'un roster
def _tokens(s):
    return {x for x in re.split(r'[\s,\-]+', norm(s)) if len(x) > 1}


_members = [(t, _tokens(m['name'])) for pi in rosters.values() for t, ms in pi.items() for m in ms]
for mv in moves:
    wt = _tokens(mv['who'])
    hit = next((t for t, mt in _members if len(wt & mt) >= 2), None)
    mv['team'] = hit

# ── Absence par semaine et par équipe (part du roster du PI en vigueur) ───────
absences = [(norm(n), local_day(s) if 'T' in s else s[:10], local_day(e) if 'T' in e else e[:10])
            for n, s, e in c.execute('select member_name, start_date, end_date from absence')]
pis = sorted(pi_start.items())


def pi_at(day):
    cur = None
    for pi, st in pis:
        if st <= day:
            cur = str(pi)
    return cur


presence = {}
wk = date.fromisoformat(W0)
wk -= timedelta(days=wk.weekday())
weeks = []
while wk.isoformat() <= W1:
    weeks.append(wk)
    wk += timedelta(weeks=1)
for t in tnames:
    rows = []
    for w in weeks:
        pi = pi_at(w.isoformat()) or '29'
        ros = [norm(m['name']) for m in rosters.get(pi, {}).get(t, [])]
        if not ros:
            rows.append([w.isoformat(), None, 0])
            continue
        days = [(w + timedelta(i)).isoformat() for i in range(5)]
        off = sum(1 for d in days for n in ros if any(a == n and s <= d <= e for a, s, e in absences))
        peak = max(sum(1 for n in ros if any(a == n and s <= d <= e for a, s, e in absences)) for d in days)
        rows.append([w.isoformat(), round(off / (5 * len(ros)) * 100), peak])
    presence[t] = rows

# ── Incidents de production : même règle que le site (components/team_timeline_model.js) ─
# « prod » / « production » / « incident » en MOT ENTIER (écarte « problème », « PreProd »), ou label
# `incident-prod`. PAS `désynchro` : 47 campagnes de comparaison GDD/SPD chez Initiale, pas des incidents.
INC = re.compile(r'(?i)\bprod\b|production|incident')
incidents = []
for tid, team, typ, created, status, labels, title in c.execute(
        "select id, team, type, created_at, status, labels, title from ticket where type in ('bug','support')"):
    lab = [x.lower() for x in json.loads(labels or '[]')]
    if not (INC.search(title or '') or 'incident-prod' in lab):
        continue
    day = local_day(created)
    if team in tnames and W0 <= day <= W1:
        incidents.append(dict(id=tid, team=team, day=day, type=typ, status=status, title=title[:160]))
incidents.sort(key=lambda x: x['day'])

# ── Agendas : MEP / livraisons (équipe ou groupe) et jalons du train ──────────
releases, milestones = [], []
seen = set()
REL = re.compile(r'(?i)\bmepp?\b|me\(p\)p|mise en (pr[ée])?prod|livraison en prod')
MIL = re.compile(r'(?i)pi\s*planning|i\s*&\s*a|inspect|journ[ée]es?\s*innovation|d[ée]monstration d.it[ée]ration')
for name, team, ej in c.execute('select name, team, events_json from team_calendar'):
    cal_teams = [x.strip() for x in (team or '').split(',') if x.strip()]
    for e in json.loads(ej or '[]'):
        day = e['start'][:10] if e.get('allDay') else local_day(e['start'])
        if not (W0 <= day <= W1):
            continue
        key = (e['title'], day)
        if key in seen:
            continue
        if REL.search(e['title']) and cal_teams:
            seen.add(key)
            releases.append(dict(day=day, title=e['title'], teams=cal_teams, cal=name))
        elif MIL.search(e['title']) and not cal_teams:
            seen.add(key)
            milestones.append(dict(day=day, title=e['title']))
releases.sort(key=lambda x: x['day'])
milestones.sort(key=lambda x: x['day'])

# ── 1v1 : « [1v1] Mohamed/Omar » (Fuego), « O3 - Elsa/Tanisha » (Gabbiano) — agendas d'équipe ──
# « Ptit point entretien » (Helica) est ambigu : exclu plutôt que deviné.
ONE = re.compile(r'(?i)\b1v1\b|\bo3\b|one[- ]on[- ]one|\b1:1\b')     # « O3 » n'importe où (même règle que le site)
one_on_ones, seen1 = [], set()
for name, team, ej in c.execute('select name, team, events_json from team_calendar'):
    cal_teams = [x.strip() for x in (team or '').split(',') if x.strip()]
    if not cal_teams:
        continue
    for e in json.loads(ej or '[]'):
        if not ONE.search(e['title']):
            continue
        day = e['start'][:10] if e.get('allDay') else local_day(e['start'])
        if not (W0 <= day <= W1) or (e['title'], day) in seen1:
            continue
        seen1.add((e['title'], day))
        pair = re.sub(r'(?i)^\s*(\[1v1\]|o3)\s*[-–:]?\s*', '', e['title']).strip()
        one_on_ones.append(dict(day=day, title=e['title'], pair=pair, teams=cal_teams))
one_on_ones.sort(key=lambda x: x['day'])

out = dict(generated=TODAY, today=TODAY, window=[W0, W1], teams=teams, piStart={str(k): v for k, v in pi_start.items()},
           sprints=sprints, rosters=rosters, moves=moves, presence=presence, incidents=incidents,
           releases=releases, milestones=milestones, oneOnOnes=one_on_ones)
body = ('/* EXTRAIT RÉEL de data/board.db — frise des faits marquants, 13 équipes, avril → novembre 2026.\n'
        '   Généré par _gen/extraire-data.py (lecture seule). */\n'
        'window.TIMELINE_DATA = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
os.makedirs(os.path.dirname(DST), exist_ok=True)
tmp = DST + '.tmp'
with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
    f.write(body)
os.replace(tmp, DST)
print(f'{os.path.getsize(DST) // 1024} Ko · PI {out["piStart"]} · {len(moves)} on/offboardings · '
      f'{len(incidents)} incidents · {len(releases)} MEP · {len(milestones)} jalons · {len(one_on_ones)} 1v1 · {len(weeks)} semaines')
