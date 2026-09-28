/* Noyau des maquettes « Calendrier de l'équipe » : dates, modèle d'évènement, filtres, charge.
 * Commun aux trois directions — seul le rendu diffère. Script classique (file:// compatible).
 * Dépend de : data.js (window.TEAM_CAL_DATA), classify.js (window.TeamCalClassify).
 */
(function () {
    'use strict';
    const D = window.TEAM_CAL_DATA;
    const C = window.TeamCalClassify;

    // ── Dates (chaînes locales YYYY-MM-DD / YYYY-MM-DDTHH:MM, jamais d'UTC) ─────────
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parse = s => new Date(s.slice(0, 10) + 'T00:00:00');
    const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
    const dow = s => parse(s).getDay();
    const isWorkday = s => dow(s) !== 0 && dow(s) !== 6;
    const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
    const minutes = s => (s.length > 10 ? (+s.slice(11, 13)) * 60 + (+s.slice(14, 16)) : 0);
    const hhmm = m => `${Math.floor(m / 60)}h${pad(m % 60)}`;
    const DAY = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const DAY_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const MONTH = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const fmtDay = s => `${DAY[dow(s)]} ${+s.slice(8, 10)}`;
    const fmtDate = s => `${+s.slice(8, 10)} ${MONTH[+s.slice(5, 7) - 1]}`;
    const fmtLong = s => `${DAY_LONG[dow(s)]} ${+s.slice(8, 10)} ${MONTH[+s.slice(5, 7) - 1]}`;
    const workdays = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) out.push(d); return out; };
    const durLabel = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m / 60} h`);

    // ── Corrections manuelles (« positionner ») : titre normalisé → nature ────────────
    // Brouillon de maquette en localStorage ; en vrai ce serait une table de règles partagée.
    const LS_KEY = 'sb-mockup-team-cal-overrides';
    function overrides() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
    function setOverride(title, kind) {
        const o = overrides();
        const k = C.norm(title);
        if (kind) o[k] = kind; else delete o[k];
        try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* navigation privée */ }
    }

    // ── Modèle : un évènement enrichi par équipe ────────────────────────────────────
    const calById = Object.fromEntries(D.calendars.map(c => [c.id, c]));
    const teamColor = name => (D.teams.find(t => t.name === name) || {}).color || '#64748b';

    // Portée la plus proche de l'équipe d'abord : un doublon garde celle-là
    const SCOPE_RANK = { team: 0, group: 1, train: 2, ops: 3 };

    /** Évènements qui concernent `team`, enrichis (nature, portée, personne, minutes).
     *  Dédoublonnés sur titre + début : « ERPC - Démonstration d'itération » arrive à la fois par
     *  l'agenda GLOBAL et par l'agenda de groupe GDEM — deux blocs identiques à 14 h (mesuré). */
    function eventsFor(team) {
        const o = overrides();
        const out = [];
        const seen = new Map();
        D.events.forEach(([calId, title, start, end, allDay], i) => {
            const cal = calById[calId];
            if (!cal) return;
            const scope = C.scope(cal.team, cal.name, team);
            if (!scope) return;
            const key = `${title}|${start}`;
            const prev = seen.get(key);
            if (prev && SCOPE_RANK[prev.scope] <= SCOPE_RANK[scope]) return;
            if (prev) out.splice(out.indexOf(prev), 1);
            const detected = C.nature(title);
            const kind = o[C.norm(title)] || detected;
            const s = minutes(start), e = end.length > 10 && end.slice(0, 10) === start.slice(0, 10) ? minutes(end) : s + 30;
            const ev = {
                id: `${team}#${i}`, team, title, start, end, day: start.slice(0, 10),
                allDay: !!allDay || e - s >= 360,           // ≥ 6 h = journée (« Livraison en prod ») : bandeau, pas bloc
                startMin: s, endMin: Math.max(e, s + 15), kind, detected, corrected: kind !== detected,
                scope, cal: cal.name, person: C.person(title, kind),
            };
            seen.set(key, ev);
            out.push(ev);
        });
        return out;
    }

    /** Évènement journée entière qui couvre `day` (fin exclusive en ICS). */
    const covers = (ev, day) => ev.allDay && ev.day <= day && (ev.end.slice(0, 10) > day || ev.end.slice(0, 10) === ev.day && ev.day === day);

    // Natures qui ne sont PAS des réunions : jamais comptées dans la charge
    const NOT_MEETING = new Set(['off', 'support', 'busy', 'focus']);

    /** Charge de réunions (minutes) par jour ouvré, sur une liste d'évènements déjà filtrée. */
    function load(events, days) {
        const perDay = Object.fromEntries(days.map(d => [d, 0]));
        for (const e of events) if (!e.allDay && !NOT_MEETING.has(e.kind) && e.day in perDay) perDay[e.day] += e.endMin - e.startMin;
        const total = Object.values(perDay).reduce((a, b) => a + b, 0);
        return { perDay, total, avgPerDay: days.length ? total / days.length : 0 };
    }

    /** Itération d'une équipe contenant `day` (dates JIRA réelles), sinon la plus proche. */
    function iterationOf(team, day) {
        const its = (D.iterations[team] || []);
        return its.find(i => i.start <= day && day < i.end) || its[its.length - 1] || null;
    }

    /** Couloirs de chevauchement pour une journée (algorithme glouton standard des agendas). */
    function layoutDay(evs) {
        const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
        const lanes = []; let cluster = [], clusterEnd = -1;
        const flush = () => { const n = Math.max(1, ...cluster.map(e => e._lane + 1)); cluster.forEach(e => { e._lanes = n; }); cluster = []; };
        for (const e of sorted) {
            if (e.startMin >= clusterEnd && cluster.length) { flush(); lanes.length = 0; }
            let li = lanes.findIndex(end => end <= e.startMin);
            if (li < 0) { li = lanes.length; lanes.push(0); }
            lanes[li] = e.endMin; e._lane = li; cluster.push(e);
            clusterEnd = Math.max(clusterEnd, e.endMin);
        }
        if (cluster.length) flush();
        return sorted;
    }

    // ── Titre court pour les blocs : le bruit coûtait tout l'espace ──────────────────
    // « 🌅 🔥 Daily Fuego » dans la ligne de Fuego : l'emoji de nature (la couleur le dit déjà),
    // l'emoji du titre et le nom de l'équipe (on est dans SA ligne) laissaient ~3 caractères
    // visibles en vue Itération (mesuré). Le titre complet reste en infobulle et dans la fiche.
    const PICTO = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{2728}]/gu;
    const ACCENTS = { a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]' };
    const loose = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .split('').map(ch => ACCENTS[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    function shortTitle(title, team) {
        const full = String(title || '').trim();
        let t = full.replace(PICTO, ' ').replace(/^\s*ERPC\s*[-–:]\s*/i, '');   // « ERPC - Démonstration d'itération »
        if (team && !team.startsWith('__')) {
            // « [Estafette] Sprint Planning » : crochets retirés SEULEMENT s'ils désignent l'équipe —
            // « [GDEM/PAAC] MEP » ou « [1v1] … » gardent leur contexte
            t = t.replace(new RegExp(`^\\s*\\[\\s*${loose(team)}\\s*\\]\\s*[-–:]?\\s*`, 'i'), '');
            // « Gabbiano - Rétro », « Daily Fuego », « Team Fuego »
            t = t.replace(new RegExp(`(^|[\\s\\-–:/(])(team\\s+)?${loose(team)}(?=$|[\\s\\-–:/)])`, 'gi'), '$1');
        }
        t = t.replace(/\(\s*\)/g, '').replace(/^\s*[-–:]\s*|\s*[-–:]\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!/\p{L}/u.test(t)) return full;                      // « (🪄✨) » : rien de lisible à garder
        return t.charAt(0).toUpperCase() + t.slice(1);
    }

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    window.TC = {
        D, C, pad, iso, parse, addDays, dow, isWorkday, mondayOf, minutes, hhmm, fmtDay, fmtDate, fmtLong,
        workdays, durLabel, overrides, setOverride, eventsFor, covers, NOT_MEETING, load, iterationOf,
        layoutDay, teamColor, esc, DAY, DAY_LONG, shortTitle,
    };
})();
