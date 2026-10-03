/**
 * Burndown / burnup RÉELS d'un sprint — source unique (Board, Rapports, modale de sprint, TV).
 *
 * Le reste à faire d'un jour se lit dans les DATES : un ticket terminé compte le jour de sa résolution
 * (`resolvedDate`), un ticket créé pendant le sprint élargit le périmètre le jour de sa création. Avant
 * 3.195.0, le graphique du Board interpolait une droite (`fait × i / jour courant`) : ni plateau ni
 * accélération, et un chiffre qui contredisait la TV.
 *
 * Pur (aucun DOM, aucun store) : `days` décide de l'axe. La TV passe les jours OUVRÉS (un ticket résolu
 * le week-end tombe sur le lundi), le Board passe les jours CALENDAIRES (ses étiquettes montrent les
 * week-ends) : le cumul est le même, seule la marche change de jour.
 */

/** Jour LOCAL (AAAA-MM-JJ) — toISOString() donnerait le jour UTC, faux entre minuit et 2 h. */
export const burnDayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Jour de résolution (JIRA écrit « +0200 », que Date ne lit pas sans le « : »). '' si inconnu. */
export const resolvedDay = t => (t?.resolvedDate ? burnDayKey(new Date(String(t.resolvedDate).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))) : '');

/** Jour de création. '' si inconnu (le ticket est alors présent dès le premier jour). */
export const createdDay = t => (t?.createdAt ? burnDayKey(new Date(t.createdAt)) : '');

const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);

/**
 * Série jour par jour.
 * @param {object}   o
 * @param {object[]} o.engaged  périmètre engagé (tous les tickets du sprint)
 * @param {object[]} o.done     tickets terminés comptés comme réalisés
 * @param {string[]} o.days     jours de l'axe (AAAA-MM-JJ, croissants)
 * @param {string}   o.today    jour courant (AAAA-MM-JJ) — la série s'arrête là
 * @param {Function} [o.val]    poids d'un ticket (points par défaut ; `() => 1` pour compter)
 * @returns {{ shown: string[], slot: Function, doneSlot: Function, total: number, real: number[],
 *             doneDay: number[], scopeAt: number[], addedDay: number[], remaining: number, done: number }}
 */
export function burnSeries({ engaged = [], done = [], days = [], today, val = t => t.points || 0 }) {
    const start = days[0];
    const shown = days.filter(d => d <= today);
    // Avant le sprint → 1er jour ; entre deux jours de l'axe (week-end en jours ouvrés) → jour suivant.
    const slot = k => (k < start ? days[0] : days.find(d => d >= k) ?? days.at(-1));
    // Terminé sans date de résolution : compté au dernier jour affiché (on sait qu'il est fini, pas quand).
    const doneSlot = t => { const r = resolvedDay(t); return r ? slot(r) : (shown.at(-1) ?? start); };
    const total = sum(engaged, val);
    const slots = done.map(t => [doneSlot(t), val(t)]);
    const doneDay = shown.map(d => sum(slots.filter(([s]) => s === d), ([, v]) => v));
    const real = [];
    doneDay.reduce((acc, v) => { const left = acc - v; real.push(left); return left; }, total);
    const scopeAt = shown.map(d => sum(engaged.filter(t => !createdDay(t) || slot(createdDay(t)) <= d), val));
    const addedDay = scopeAt.map((v, i) => (i ? Math.max(0, v - scopeAt[i - 1]) : 0));
    const remaining = real.at(-1) ?? total;
    return { shown, slot, doneSlot, total, real, doneDay, scopeAt, addedDay, remaining, done: total - remaining };
}
