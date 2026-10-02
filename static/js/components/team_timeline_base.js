/**
 * Frise des faits marquants — outils communs (extraits de team_timeline_model.js, 3.178.0) :
 * dates « AAAA-MM-JJ » locales, formats français, noms de personnes normalisés, mémo par équipe.
 * Aucune dépendance : importable par le modèle et par team_timeline_support.js sans cycle.
 */

// ── Dates (chaînes YYYY-MM-DD locales) ─────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => new Date(s.slice(0, 10) + 'T00:00:00');
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const mondayOf = s => addDays(s, -((parse(s).getDay() + 6) % 7));
export const dayOfWeek = s => parse(s).getDay();
const MONTH = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTH_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const fmt = s => `${+s.slice(8, 10)} ${MONTH[+s.slice(5, 7) - 1]}`;
export const fmtShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
/** « 1 sept. 2026 » — l'année partout où une période peut chevaucher deux années (frise, export). */
export const fmtY = s => `${fmt(s)} ${s.slice(0, 4)}`;
export const monthShort = s => MONTH[+s.slice(5, 7) - 1];
export const monthName = s => MONTH_LONG[+s.slice(5, 7) - 1];
export const inRange = (d, A, B) => d >= A && d <= B;
/** ISO UTC (« 2026-09-21T08:48:00Z ») → jour LOCAL ; date simple → telle quelle. */
export const localDay = s => { if (!s) return ''; if (String(s).length <= 10) return String(s); const d = new Date(s); return isNaN(d) ? String(s).slice(0, 10) : iso(d); };

// ── Personnes : « HÉDÉ-HAÜY, Pierre-Just » == « HEDE-HAUY, Pierre-Just » ─────────
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const tokens = s => new Set(norm(s).split(/[\s,\-]+/).filter(x => x.length > 1));
/** Même personne = au moins 2 mots communs (« Taha EL ROBRINI » ↔ « EL ROBRINI, Taha »). */
export const samePerson = (a, b) => { const B = tokens(b); let n = 0; tokens(a).forEach(x => { if (B.has(x)) n++; }); return n >= 2; };
export const shortName = n => { const [last, first] = String(n).split(','); return first ? `${first.trim()} ${last.trim().charAt(0)}.` : String(n); };

/** Mémo par équipe à l'intérieur d'un modèle (turnover, présence… coûteux en vue Train). */
export const per = (M, name, team, fn) => {
    const k = `${name}|${team}`;
    if (!M.cache.has(k)) M.cache.set(k, fn());
    return M.cache.get(k);
};
