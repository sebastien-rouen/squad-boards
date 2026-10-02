/* Noyau des maquettes « Frise des faits marquants » — commun aux deux frises.
 * Période A → B, turnover (rosters par PI + check-lists on/offboarding), présence et périodes
 * creuses (l'été), incidents de production regroupés, MEP, jalons du train, faits saisis à la main.
 * Script classique (file:// compatible). Dépend de data.js (window.TIMELINE_DATA).
 */
(function () {
    'use strict';
    const D = window.TIMELINE_DATA;

    // ── Dates (chaînes YYYY-MM-DD locales) ─────────────────────────────────────
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parse = s => new Date(s.slice(0, 10) + 'T00:00:00');
    const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
    const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
    const mondayOf = s => addDays(s, -((parse(s).getDay() + 6) % 7));
    const MONTH = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const MONTH_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const fmt = s => `${+s.slice(8, 10)} ${MONTH[+s.slice(5, 7) - 1]}`;
    const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
    const monthName = s => `${MONTH_LONG[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
    const inRange = (d, A, B) => d >= A && d <= B;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const tokens = s => new Set(norm(s).split(/[\s,\-]+/).filter(x => x.length > 1));
    const samePerson = (a, b) => { const A = tokens(a), B = tokens(b); let n = 0; A.forEach(x => { if (B.has(x)) n++; }); return n >= 2; };
    const shortName = n => { const [last, first] = String(n).split(','); return first ? `${first.trim()} ${last.trim().charAt(0)}.` : String(n); };
    const teamColor = t => (D.teams.find(x => x.name === t) || {}).color || '#64748b';

    // ── Catégories (couleur = token CSS --c-*) ──────────────────────────────────
    const CATS = {
        rythme:     { label: 'Rythme',             emoji: '🧭' },
        production: { label: 'Production',         emoji: '🚨' },
        livraison:  { label: 'Livraisons',         emoji: '🚀' },
        presence:   { label: 'Présence',           emoji: '🏖️' },
        equipe:     { label: 'Arrivées & départs', emoji: '👥' },
        oneonone:   { label: '1v1',                emoji: '💬' },
        fait:       { label: 'Faits marquants',    emoji: '📌' },
    };
    const FACT_TYPES = {
        incident: { label: 'Incident de production', emoji: '💥' },
        gel:      { label: 'Gel / freeze',           emoji: '🧊' },
        jalon:    { label: 'Jalon',                  emoji: '🚩' },
        periode:  { label: 'Période',                emoji: '📅' },
        autre:    { label: 'Autre',                  emoji: '📌' },
    };

    // ── PI : bornes, présélections de période ──────────────────────────────────
    const PIS = Object.entries(D.piStart).map(([n, s]) => ({ n: +n, start: s })).sort((a, b) => a.start.localeCompare(b.start));
    PIS.forEach((p, i) => { p.end = PIS[i + 1] ? addDays(PIS[i + 1].start, -1) : addDays(p.start, 12 * 7 - 1); });
    const piOf = d => [...PIS].reverse().find(p => p.start <= d) || null;

    function presets() {
        const t = D.today, cur = piOf(t), prev = cur && PIS.find(p => p.n === cur.n - 1);
        return [
            cur && { key: 'pi', label: `PI ${cur.n}`, A: cur.start, B: cur.end },
            prev && { key: 'piprev', label: `PI ${prev.n}`, A: prev.start, B: prev.end },
            { key: 'ete', label: 'Été', A: '2026-06-29', B: '2026-08-31' },
            { key: '6m', label: '6 mois', A: addDays(t, -182), B: t },
            { key: 'tout', label: 'Tout', A: D.window[0], B: D.window[1] },
        ].filter(Boolean);
    }

    // ── Turnover : rosters par PI (précision « au PI ») + check-lists (date exacte) ─
    const rosterNames = (pi, team) => ((D.rosters[pi] || {})[team] || []).map(m => m.name);
    const teamOfIn = (pi, name, except) => Object.entries(D.rosters[pi] || {}).find(([t, ms]) => t !== except && ms.some(m => samePerson(m.name, name)))?.[0] || null;

    /** Mouvements d'une équipe (ou du train si team === '*'). kind : in | out | move-in | move-out. */
    function turnover(team) {
        const out = [];
        const teams = team === '*' ? D.teams.map(t => t.name) : [team];
        for (let i = 1; i < PIS.length; i++) {
            const p = String(PIS[i - 1].n), q = String(PIS[i].n), day = PIS[i].start;
            for (const t of teams) {
                const before = rosterNames(p, t), after = rosterNames(q, t);
                for (const n of after.filter(x => !before.some(y => samePerson(x, y)))) {
                    const from = teamOfIn(p, n, t);
                    if (team === '*' && from) continue;                         // mobilité interne au train : comptée une fois (départ)
                    out.push({ day, kind: from ? 'move-in' : 'in', who: n, team: t, from, to: t, precise: false, pi: +q });
                }
                for (const n of before.filter(x => !after.some(y => samePerson(x, y)))) {
                    const to = teamOfIn(q, n, t);
                    out.push({ day, kind: to ? 'move-out' : 'out', who: n, team: t, from: t, to, precise: false, pi: +q });
                }
            }
        }
        // Check-lists : date exacte ; fusion avec le mouvement de roster de la même personne
        for (const m of D.moves) {
            if (team !== '*' && m.team !== team) continue;
            const kind = m.kind === 'in' ? ['in', 'move-in'] : ['out', 'move-out'];
            const hit = out.find(o => kind.includes(o.kind) && samePerson(o.who, m.who));
            if (hit) { hit.checklist = m.day; hit.precise = true; hit.day = m.day; }
            else out.push({ day: m.day, kind: m.kind, who: m.who, team: m.team, precise: true, checklist: m.day, onlyChecklist: true });
        }
        // Incohérence : entrée et sortie de la même personne à moins de 45 jours (RODRIGUEZ sort du
        // roster d'Initiale au PI 30 le 11/06, check-list d'onboarding le 19/06) — signalée, pas tranchée
        for (const a of out) for (const b of out) {
            if (a !== b && a.kind.endsWith('in') !== b.kind.endsWith('in') && samePerson(a.who, b.who) && Math.abs(diff(a.day, b.day)) <= 45) {
                a.conflict = b.conflict = true;
            }
        }
        return out.sort((a, b) => a.day.localeCompare(b.day));
    }

    // ── Présence : absence hebdomadaire et périodes creuses ────────────────────
    function presence(team) {
        if (team !== '*') return (D.presence[team] || []).map(([w, pct, peak]) => ({ week: w, pct, peak }));
        const weeks = D.presence[D.teams[0].name].map(r => r[0]);
        return weeks.map((w, i) => {
            const vals = Object.values(D.presence).map(r => r[i]?.[1]).filter(v => v !== null && v !== undefined);
            return { week: w, pct: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, peak: 0 };
        });
    }
    /** Semaines consécutives ≥ seuil → une période ; « Congés d'été » si elle touche juillet-août. */
    function lowPeriods(series, threshold = 25, minWeeks = 2) {
        const out = []; let cur = null;
        for (const s of series) {
            if (s.pct !== null && s.pct >= threshold) {
                if (!cur) cur = { start: s.week, end: addDays(s.week, 4), peak: s.pct, peakWeek: s.week, weeks: 0, sum: 0 };
                cur.end = addDays(s.week, 4); cur.weeks++; cur.sum += s.pct;
                if (s.pct > cur.peak) { cur.peak = s.pct; cur.peakWeek = s.week; }
            } else if (cur) { if (cur.weeks >= minWeeks) out.push(cur); cur = null; }
        }
        if (cur && cur.weeks >= minWeeks) out.push(cur);
        out.forEach(p => {
            p.avg = Math.round(p.sum / p.weeks);
            // « Été » si le MILIEU de la période tombe en juillet-août (31/08 → 18/09 n'est pas l'été)
            const mid = addDays(p.start, Math.floor(diff(p.start, p.end) / 2));
            const summer = mid >= '2026-07-01' && mid <= '2026-08-31';
            p.label = summer ? 'Congés d’été' : 'Période creuse';
        });
        return out;
    }

    /** Niveau de présence d'une semaine (demande : vert à 100 %, puis orange, puis rouge).
     *  Seuil rouge = 25 % d'absence, le même que la détection des périodes creuses. */
    const presenceLevel = pct => pct === null || pct === undefined ? null : pct === 0 ? 'ok' : pct <= 25 ? 'mid' : 'low';

    // ── Production, livraisons, jalons ─────────────────────────────────────────
    /** Incidents regroupés par semaine (un marqueur par semaine, taille = nombre). */
    function incidents(team) {
        const by = new Map();
        for (const i of D.incidents) {
            if (team !== '*' && i.team !== team) continue;
            const w = mondayOf(i.day);
            (by.get(w) || by.set(w, []).get(w)).push(i);
        }
        return [...by.entries()].map(([week, items]) => ({ week, day: items[0].day, items, count: items.length })).sort((a, b) => a.week.localeCompare(b.week));
    }
    function releases(team) {
        const by = new Map();
        for (const r of D.releases) {
            if (team !== '*' && !r.teams.includes(team)) continue;
            (by.get(r.day) || by.set(r.day, []).get(r.day)).push(r);
        }
        return [...by.entries()].map(([day, items]) => ({ day, items })).sort((a, b) => a.day.localeCompare(b.day));
    }
    /** 1v1 (« [1v1] Mohamed/Omar », « O3 - Elsa/Tanisha ») des agendas de l'équipe. */
    const oneOnOnes = team => (D.oneOnOnes || []).filter(o => team === '*' || o.teams.includes(team));
    const milestones = () => D.milestones.filter((m, i, all) => all.findIndex(x => x.day === m.day && x.title.replace(/Adapt|Inspect/, '') === m.title.replace(/Adapt|Inspect/, '')) === i);
    // Couverture de l'agenda ICS (les MEP et jalons n'existent pas avant) — dite, pas cachée
    const icsFrom = () => [...D.releases, ...D.milestones].map(x => x.day).sort()[0] || null;

    // ── Faits saisis à la main (brouillon de maquette ; en vrai : table `event`) ──
    const LS = 'sb-mockup-timeline-facts';
    const facts = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
    const saveFacts = list => { try { localStorage.setItem(LS, JSON.stringify(list)); } catch { /* privé */ } };
    /** Exemples fondés sur des tickets RÉELS (affichés quand ?seed=1) — jamais inventés. */
    const SEED = [
        { id: 'seed-1', type: 'incident', title: 'Erreur INES SPD — désynchronisations PGA', start: '2026-09-22', end: '2026-09-22', teams: ['Initiale'], note: 'Mantis 0294159 : entre 12 h 45 et 17 h, demandes PGA terminées ou invalides désynchronisées.', seed: true },
        { id: 'seed-2', type: 'gel', title: 'Gel des MEP — PI Planning', start: '2026-09-01', end: '2026-09-04', teams: ['*'], note: 'Inspect & Adapt puis PI Planning plénière : aucune mise en production.', seed: true },
    ];
    function factsFor(team, seed) {
        const all = [...(seed ? SEED : []), ...facts()];
        return all.filter(f => team === '*' || f.teams.includes('*') || f.teams.includes(team));
    }

    /** Tout ce qui tombe dans [A, B] pour une équipe (ou '*' = train), par catégorie. */
    function collect(team, A, B, seed) {
        const pres = presence(team);
        return {
            pis: PIS.filter(p => p.end >= A && p.start <= B),
            sprints: team === '*' ? [] : (D.sprints[team] || []).filter(s => s.end >= A && s.start <= B),
            presence: pres.filter(s => s.week <= B && addDays(s.week, 4) >= A),
            low: lowPeriods(pres).filter(p => p.end >= A && p.start <= B),
            incidents: incidents(team).filter(x => x.week <= B && addDays(x.week, 6) >= A),
            releases: releases(team).filter(x => inRange(x.day, A, B)),
            milestones: milestones().filter(x => inRange(x.day, A, B)),
            moves: turnover(team).filter(x => inRange(x.day, A, B)),
            ones: oneOnOnes(team).filter(x => inRange(x.day, A, B)),
            facts: factsFor(team, seed).filter(f => f.end >= A && f.start <= B),
            icsFrom: icsFrom(),
        };
    }

    /** Collaborateurs vus en 1v1 — même règle que le site : le manager (≥ 2 partenaires sur TOUT
     *  l'extrait) n'est pas compté ; il est en 1er chez Fuego, en 2nd chez Gabbiano (« O3 - David/Tanisha »). */
    function onePeople(ones) {
        const partners = new Map();
        for (const o of D.oneOnOnes || []) {
            const n = o.pair.split('/').map(x => norm(x)).filter(Boolean);
            if (n.length === 2) n.forEach((x, i) => (partners.get(x) || partners.set(x, new Set()).get(x)).add(n[1 - i]));
        }
        const seen = new Set(ones.flatMap(o => o.pair.split('/').map(x => norm(x)).filter(Boolean)));
        return [...seen].filter(x => !((partners.get(x)?.size || 0) >= 2)).length;
    }

    /** Résumé chiffré de la période (bandeau de KPI). */
    function summary(c) {
        const n = k => c.moves.filter(m => m.kind === k).length;
        const peak = c.presence.reduce((best, s) => (s.pct ?? -1) > (best?.pct ?? -1) ? s : best, null);
        return {
            arrivals: n('in'), departures: n('out'), movesIn: n('move-in'), movesOut: n('move-out'),
            incidents: c.incidents.reduce((a, x) => a + x.count, 0), releases: c.releases.length,
            peak, facts: c.facts.length, ones: c.ones.length,
            onePeople: onePeople(c.ones),
        };
    }

    window.TL = {
        D, CATS, FACT_TYPES, PIS, pad, iso, parse, addDays, diff, mondayOf, fmt, fmtShort, monthName, esc,
        shortName, teamColor, presets, piOf, collect, summary, facts, saveFacts, SEED, samePerson, presenceLevel,
    };
})();
