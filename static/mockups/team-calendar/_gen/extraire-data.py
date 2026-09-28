"""Régénère _shared/data.js depuis data/board.db (LECTURE SEULE) — à lancer depuis la racine du site.

    python static/mockups/team-calendar/_gen/extraire-data.py

Fenêtre : 5 semaines autour d'aujourd'hui. Heures converties en Europe/Paris SANS tzdata (absent du
Python Windows) : heure d'été (+2) jusqu'au dimanche 25/10/2026 01:00 UTC, puis +1 — à adapter si la
fenêtre franchit un autre changement d'heure.
"""
import json
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone

W0, W1, TODAY = '2026-09-14', '2026-10-19', '2026-09-28'
SWITCH = datetime(2026, 10, 25, 1, 0, tzinfo=timezone.utc)
DST = 'static/mockups/team-calendar/_shared/data.js'


def loc(s, allday):
    if allday:
        return s[:10]
    d = datetime.fromisoformat(s)
    return (d + timedelta(hours=2 if d < SWITCH else 1)).strftime('%Y-%m-%dT%H:%M')


c = sqlite3.connect('file:data/board.db?mode=ro', uri=True)
teams = [dict(name=n, color=col) for n, col in c.execute('select name, color from team order by name')]
tnames = {t['name'] for t in teams}

events, seen, cals = [], set(), []
for cid, team, name, ej in c.execute('select id, team, name, events_json from team_calendar order by name'):
    cals.append(dict(id=cid, name=name, team=team or ''))
    for e in json.loads(ej or '[]'):
        st, en = loc(e['start'], e['allDay']), loc(e['end'], e['allDay'])
        if not (W0 <= st[:10] < W1) or (cid, e['uid'], st) in seen:
            continue
        seen.add((cid, e['uid'], st))
        events.append([cid, e['title'], st, en, 1 if e['allDay'] else 0])

_, ts = c.execute('select name, team_sprints from sprintconfig').fetchone()
its = {}
for s in json.loads(ts):
    lbl = s['name'].split()[-1]
    if s['team'] in tnames and lbl.startswith('31.'):
        its.setdefault(s['team'], []).append(dict(
            label=lbl, start=loc(s['startDate'], False)[:10],
            end=loc(s.get('plannedEndDate') or s['endDate'], False)[:10], state=s['state']))
for v in its.values():
    v.sort(key=lambda i: i['start'])

# Roster du PI 31 (snapshot de l'import Congés) — « Team Gabbiano » → « Gabbiano »
rost = {}
for m in json.loads(c.execute('select pi_members from piconfig').fetchone()[0] or '{}').get('31', []):
    t = re.sub(r'^(Team|Équipe|Equipe)\s+', '', m.get('team') or '').strip()
    if t in tnames and not any(x['name'] == m['name'] for x in rost.get(t, [])):
        rost.setdefault(t, []).append(dict(name=m['name'], role=m.get('role') or ''))

out = dict(generated=TODAY, today=TODAY, window=[W0, W1], teams=teams, calendars=cals, iterations=its,
           events=sorted(events, key=lambda x: x[2]), rosters=rost)
body = ('/* EXTRAIT RÉEL de data/board.db — agendas ICS des 13 équipes, 14/09 → 18/10/2026, heure de Paris.\n'
        '   Généré par _gen/extraire-data.py. events = [calendrierId, titre, début, fin, journéeEntière] */\n'
        'window.TEAM_CAL_DATA = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
tmp = DST + '.tmp'
with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
    f.write(body)
os.replace(tmp, DST)
print(f'{len(events)} évènements, {os.path.getsize(DST) // 1024} Ko')
