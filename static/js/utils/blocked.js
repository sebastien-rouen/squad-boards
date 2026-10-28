/**
 * Périodes de BLOCAGE d'un ticket — SOURCE UNIQUE (frises Cycle Time / Lead Time de charts.js,
 * détail « Flux » de la modale ticket).
 */
import { STATUS_MAP } from '../config.js';
import { customStatusOf } from './jira-mapping.js';
import { workdayDurationDays } from './workdays.js';

/** Date JIRA → ms ; le changelog écrit « +0200 », que Date.parse ne lit pas sans le « : ». */
const _msOf = v => (v ? Date.parse(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN);

/** Même lookup que `mapStatus` (utils.js) — importer le barrel ici créerait un cycle. */
const _isBlockedStatus = s => !!s && (customStatusOf(s) || STATUS_MAP[s.toLowerCase().trim()]) === 'blocked';

/**
 * Périodes de blocage entre `fromMs` et `toMs`, rejouées depuis l'historique : bloqué = drapeau
 * JIRA posé OU statut classé « bloqué ». [{ from, to }] — vide si l'historique n'en dit rien.
 * Complet depuis que la synchro garde TOUS les changements de statut et de drapeau
 * (sync-parse.js, 3.216.0) ; avant une resynchro complète, un blocage ancien peut manquer.
 */
export function blockedIntervals(t, fromMs = -Infinity, toMs = Infinity) {
    const ch = (t?.recentChanges || [])
        .map(c => ({ f: String(c.field || '').toLowerCase(), from: String(c.from || '').trim(), to: String(c.to || '').trim(), ms: _msOf(c.date) }))
        .filter(c => (c.f === 'status' || c.f === 'flagged') && Number.isFinite(c.ms))
        .sort((a, b) => a.ms - b.ms);
    if (!ch.length) return [];
    // État AVANT le premier changement : le `from` du premier changement de chaque champ.
    let st = _isBlockedStatus(ch.find(c => c.f === 'status')?.from), fl = !!ch.find(c => c.f === 'flagged')?.from;
    let open = st || fl ? -Infinity : null;
    const out = [];
    for (const c of ch) {
        if (c.f === 'status') st = _isBlockedStatus(c.to); else fl = !!c.to;
        if ((st || fl) && open == null) open = c.ms;
        else if (!(st || fl) && open != null) { out.push([open, c.ms]); open = null; }
    }
    if (open != null) out.push([open, Infinity]);
    return out.map(([a, b]) => ({ from: Math.max(a, fromMs), to: Math.min(b, toMs) })).filter(x => x.to > x.from);
}

/** Durée bloquée totale (jours ouvrés fractionnaires) d'une liste de périodes bornées. */
export const blockedDays = iv => iv.reduce((s, x) => s + workdayDurationDays(x.from, x.to), 0);
