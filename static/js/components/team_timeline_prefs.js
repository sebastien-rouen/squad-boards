/**
 * Filtres de la carte « Faits marquants » : mémorisés dans le navigateur ET portés par l'URL.
 *
 *   #team/Fuego~frise=v=story&p=pi&c=charge%2Coperations&src=team%2Cops
 *
 * Mémorisés PAR ÉQUIPE (Fuego peut garder le Support et les Opérations, Gabbiano les 1v1).
 * Priorité au montage : lien (~frise=, partageable) > navigateur (cette équipe) > défauts. Réécrits à
 * chaque rendu, sans recharger (`history.replaceState` : pas de `hashchange`, pas de re-routage).
 * Une seule forme pour les deux : la chaîne de paramètres (seules les valeurs ≠ défaut, sauf `v`).
 *
 * Paramètres : v = lanes|story · s = train · p = clé de présélection (pi, piprev, ete, 6m, tout) ou
 * du / au = dates · c / xc = catégories affichées / MASQUÉES · src / xsrc = sources d'agenda affichées /
 * masquées (la forme la plus courte est écrite ; « - » = aucune) · lt = couloirs vus à l'échelle du
 * train dans la vue Équipe (ex. lt=production,livraison).
 * La valeur ne contient ni « / » ni « ~ » (URLSearchParams encode « / ») : le routeur (app.js) la
 * retire sans toucher un « /ticket/ID » ou un « ~cal » ajouté ensuite par une modale.
 */

import { CATS, presets, ALL_SOURCES, LANE_TRAIN_FIELDS } from './team_timeline_model.js';

const KEY = 'sb-team-tl-prefs-by-team';            // { "Fuego": "v=story&p=pi…", … }
const OLD_KEY = 'sb-team-tl-prefs';                 // 3.175.0 : une seule préférence pour toutes les équipes
const OLD_VIEW_KEY = 'sb-team-tl-view';            // avant 3.175.0 : seule la vue était retenue
// « ~ » parfois encodé « %7E » par le navigateur (cf. app.js, filtres du Backlog)
const MARK = /(?:~|%7E)frise=([^~/]*?)(?=~|%7E|\/|$)/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PRESET = '6m';

const allCats = () => Object.keys(CATS);
const allSrc = () => [...ALL_SOURCES()];
const list = (q, k, valid) => q.get(k) === '-' ? [] : String(q.get(k) || '').split(',').filter(x => valid.includes(x));

/** Liste affichée (`k`) ou masquée (`xk`), la plus courte ; rien si tout est affiché. */
function setList(q, k, all, on) {
    const shown = all.filter(x => on.has(x)), hidden = all.filter(x => !on.has(x));
    if (!hidden.length) return;
    if (hidden.length < shown.length) q.set(`x${k}`, hidden.join(','));
    else q.set(k, shown.join(',') || '-');
}
const getList = (q, k, all, cur) => q.has(`x${k}`) ? new Set(all.filter(x => !list(q, `x${k}`, all).includes(x)))
    : q.has(k) ? new Set(list(q, k, all)) : cur;

/** État → paramètres (chaîne). */
export function toParams(st) {
    const q = new URLSearchParams();
    q.set('v', st.view);                                   // toujours : un lien desktop reste en couloirs sur mobile
    if (st.scope === 'train') q.set('s', 'train');
    const p = presets().find(x => x.A === st.A && x.B === st.B);
    if (!p) { q.set('du', st.A); q.set('au', st.B); }
    else if (p.key !== DEFAULT_PRESET) q.set('p', p.key);
    setList(q, 'c', allCats(), st.cats);
    setList(q, 'src', allSrc(), st.sources);
    const lt = Object.keys(LANE_TRAIN_FIELDS).filter(k => st.laneTrain?.has(k));
    if (lt.length) q.set('lt', lt.join(','));
    return q.toString();
}

/** Paramètres → champs de l'état (ce qui est absent ou invalide garde la valeur de `st`). */
function apply(st, qs) {
    const q = new URLSearchParams(qs);
    if (['lanes', 'story'].includes(q.get('v'))) st.view = q.get('v');
    st.scope = q.get('s') === 'train' ? 'train' : 'team';
    const pr = presets().find(x => x.key === (q.get('p') || DEFAULT_PRESET));
    const du = q.get('du'), au = q.get('au');
    if (ISO.test(du || '') && ISO.test(au || '') && du <= au) { st.A = du; st.B = au; }
    else if (pr) { st.A = pr.A; st.B = pr.B; }
    st.cats = getList(q, 'c', allCats(), st.cats);
    st.sources = getList(q, 'src', allSrc(), st.sources);
    st.laneTrain = new Set(list(q, 'lt', Object.keys(LANE_TRAIN_FIELDS)));
    return st;
}

const fromUrl = () => (location.hash.match(MARK) || [])[1] ?? null;
const readMap = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
/** Filtres mémorisés pour CETTE équipe ; à défaut, l'ancienne préférence commune (reprise une fois). */
function fromStorage(team) {
    const own = readMap()[team];
    if (typeof own === 'string') return own;
    try {
        const shared = localStorage.getItem(OLD_KEY);
        if (shared !== null) return shared;
        const v = localStorage.getItem(OLD_VIEW_KEY);
        return v === 'lanes' || v === 'story' ? `v=${v}` : null;
    } catch { return null; }                              // navigation privée : défauts
}

/** Applique à un état neuf : lien > navigateur (cette équipe) > défauts (déjà posés dans `st`). */
export function restorePrefs(st) {
    const qs = fromUrl() ?? fromStorage(st.team);
    return qs === null ? st : apply(st, qs);
}

/** Filtres modifiés par rapport aux défauts (la vue n'est pas un filtre) → bouton « ↺ Réinitialiser ». */
export const isFiltered = st => st.scope !== 'team' || st.cats.size !== allCats().length || st.sources.size !== allSrc().length || st.laneTrain?.size
    || presets().find(x => x.key === DEFAULT_PRESET)?.A !== st.A || presets().find(x => x.key === DEFAULT_PRESET)?.B !== st.B;

/** Remet les filtres par défaut (garde la vue couloirs / récit). */
export function resetFilters(st) {
    const p = presets().find(x => x.key === DEFAULT_PRESET);
    Object.assign(st, { scope: 'team', A: p.A, B: p.B, cats: new Set(allCats()), sources: new Set(allSrc()), laneTrain: new Set(), selectedItem: null });
    return st;
}

/** État déjà en mémoire (même équipe) : un lien ~frise= différent collé dans la barre d'adresse l'emporte. */
export function syncFromUrl(st) {
    const qs = fromUrl();
    if (qs !== null && qs !== toParams(st)) apply(st, qs);
    return st;
}

/** Mémorise (navigateur) et reflète dans l'URL — seulement sur la page Équipe, hors modale de ticket. */
export function savePrefs(st) {
    const qs = toParams(st);
    try { localStorage.setItem(KEY, JSON.stringify({ ...readMap(), [st.team]: qs })); } catch { /* navigation privée */ }
    const h = location.hash;
    if (!h.startsWith('#team/') || h.includes('/ticket/')) return;
    const base = h.replace(MARK, '');
    const i = base.indexOf('~');                           // autres marqueurs (~bloc=, ~cal) gardés APRÈS
    const next = i < 0 ? `${base}~frise=${qs}` : `${base.slice(0, i)}~frise=${qs}${base.slice(i)}`;
    if (next !== h) history.replaceState(null, '', next);
}
