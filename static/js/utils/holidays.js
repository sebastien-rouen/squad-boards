/**
 * Jours fériés et fermetures — SOURCE UNIQUE : jours ouvrés (workdays.js), bandeau calendrier (cal_banner.js),
 * frise des faits marquants, TV (l'import Congés RH enregistre aussi les fériés comme des absences : le 1er et le
 * 8 mai comptaient comme des congés).
 *
 * Pays réglable (3.270.0, avant : France métropole en dur) + jours de fermeture de l'entreprise (ponts), dans le
 * réglage de projet `sb-holidays` = { country, closures: ['AAAA-MM-JJ', …] }. Module PUR (tests node) : la
 * lecture du réglage lui est branchée par project-settings.js (`holidaySettings.read`) ; défaut = France.
 */

export const HOLIDAY_COUNTRIES = Object.freeze([
    { key: 'FR',    label: '🇫🇷 France (métropole)' },
    { key: 'FR-AM', label: '🇫🇷 France — Alsace-Moselle' },
    { key: 'BE',    label: '🇧🇪 Belgique' },
    { key: 'CH',    label: '🇨🇭 Suisse (jours les plus courants)' },
    { key: 'none',  label: 'Aucun jour férié' },
]);

/** Source du réglage (texte JSON ou null) — branchée au chargement par project-settings.js. */
export const holidaySettings = { read: () => null };

const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Dimanche de Pâques (algorithme de Meeus / Jones / Butcher). */
function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day   = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
}

const _cache = {};                                   // par pays et par année
/** { 'AAAA-MM-JJ': 'Nom du férié' } pour un pays et une année (dates LOCALES). */
export function holidaysOf(country, y) {
    const key = `${country}|${y}`;
    if (_cache[key]) return _cache[key];
    if (country === 'none') return (_cache[key] = {});
    const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const E = easter(y), D = (m, d) => new Date(y, m - 1, d);
    const list = {
        FR: [[D(1, 1), 'Jour de l\'An'], [add(E, 1), 'Lundi de Pâques'], [D(5, 1), 'Fête du Travail'], [D(5, 8), 'Victoire 1945'],
            [add(E, 39), 'Ascension'], [add(E, 50), 'Lundi de Pentecôte'], [D(7, 14), 'Fête Nationale'], [D(8, 15), 'Assomption'],
            [D(11, 1), 'Toussaint'], [D(11, 11), 'Armistice'], [D(12, 25), 'Noël']],
        BE: [[D(1, 1), 'Nouvel An'], [add(E, 1), 'Lundi de Pâques'], [D(5, 1), 'Fête du Travail'], [add(E, 39), 'Ascension'],
            [add(E, 50), 'Lundi de Pentecôte'], [D(7, 21), 'Fête nationale'], [D(8, 15), 'Assomption'], [D(11, 1), 'Toussaint'],
            [D(11, 11), 'Armistice'], [D(12, 25), 'Noël']],
        CH: [[D(1, 1), 'Nouvel An'], [D(1, 2), 'Saint-Berchtold'], [add(E, -2), 'Vendredi saint'], [add(E, 1), 'Lundi de Pâques'],
            [add(E, 39), 'Ascension'], [add(E, 50), 'Lundi de Pentecôte'], [D(8, 1), 'Fête nationale'], [D(12, 25), 'Noël'],
            [D(12, 26), 'Saint-Étienne']],
    };
    // Alsace-Moselle : France + Vendredi saint et Saint-Étienne
    list['FR-AM'] = [...list.FR, [add(E, -2), 'Vendredi saint'], [D(12, 26), 'Saint-Étienne']];
    _cache[key] = Object.fromEntries((list[country] || list.FR).map(([d, n]) => [isoOf(d), n]));
    return _cache[key];
}

/** Compatibilité : fériés français (anciens appels). */
export const frenchHolidays = y => holidaysOf('FR', y);

// Réglage lu une fois par valeur brute (holidayName est appelé pour chaque jour de chaque calcul)
let _cfg = { raw: undefined, country: 'FR', closures: new Set() };
/** Réglage effectif { country, closures: Set } — France sans fermeture si rien n'est réglé. */
export function holidayConfig() {
    let raw = null;
    try { raw = holidaySettings.read(); } catch { /* source indisponible : défaut */ }
    if (raw === _cfg.raw) return _cfg;
    let v = {};
    try { v = JSON.parse(raw || '{}') || {}; } catch { /* réglage illisible : défaut */ }
    const country = HOLIDAY_COUNTRIES.some(c => c.key === v.country) ? v.country : 'FR';
    _cfg = { raw, country, closures: new Set((v.closures || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) };
    return _cfg;
}

/** Nom du férié (ou « Fermeture ») à cette date ('AAAA-MM-JJ'), ou null. */
export function holidayName(isoDate) {
    const iso = String(isoDate).slice(0, 10);
    const { country, closures } = holidayConfig();
    if (closures.has(iso)) return 'Fermeture de l\'entreprise';
    return holidaysOf(country, parseInt(iso.slice(0, 4), 10))[iso] || null;
}
