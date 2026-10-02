/**
 * Jours fériés en France (métropole) — SOURCE UNIQUE : bandeau calendrier (cal_banner.js) et frise
 * des faits marquants (l'import Congés RH enregistre aussi les fériés comme des absences : le 1er et
 * le 8 mai comptaient comme des congés).
 */

const _cache = {};                                   // par année
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

/** { 'AAAA-MM-JJ': 'Nom du férié' } pour une année (dates LOCALES). */
export function frenchHolidays(y) {
    if (_cache[y]) return _cache[y];
    const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const E = easter(y);
    _cache[y] = {
        [isoOf(new Date(y,  0,  1))]: 'Jour de l\'An',
        [isoOf(add(E, 1))]:           'Lundi de Pâques',
        [isoOf(new Date(y,  4,  1))]: 'Fête du Travail',
        [isoOf(new Date(y,  4,  8))]: 'Victoire 1945',
        [isoOf(add(E, 39))]:          'Ascension',
        [isoOf(add(E, 50))]:          'Lundi de Pentecôte',
        [isoOf(new Date(y,  6, 14))]: 'Fête Nationale',
        [isoOf(new Date(y,  7, 15))]: 'Assomption',
        [isoOf(new Date(y, 10,  1))]: 'Toussaint',
        [isoOf(new Date(y, 10, 11))]: 'Armistice',
        [isoOf(new Date(y, 11, 25))]: 'Noël',
    };
    return _cache[y];
}

/** Nom du férié à cette date ('AAAA-MM-JJ'), ou null. */
export function holidayName(isoDate) {
    return frenchHolidays(parseInt(String(isoDate).slice(0, 4), 10))[String(isoDate).slice(0, 10)] || null;
}
