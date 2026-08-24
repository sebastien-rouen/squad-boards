/**
 * Health — colonnes de vote du tableau « Sprints du PI ».
 *
 * Deux votes d'équipe partagent exactement la même mécanique (échelle 1→5, moyenne,
 * distribution, saisie inline) mais pas le même sens :
 *   🎭 Mood      — humeur ressentie par l'équipe sur le sprint
 *   ✊ Confiance — Fist of Five : confiance dans l'atteinte des objectifs du PI
 *
 * Les deux vivent dans la même table backend (`mood`), distingués par `type`
 * (`mood` | `fist`) et exposés séparément par /api/all (`moodVotes` / `fistVotes`).
 * D'où ce module unique plutôt que deux jeux de helpers jumeaux : une correction de
 * calcul (moyenne pondérée, tooltip, seuils de teinte) profite mécaniquement aux deux.
 *
 * Ce module ne connaît que le calcul et le rendu — health.js garde l'ouverture de la
 * modale, l'appel API et le rafraîchissement du DOM après un vote.
 */

import { esc } from '../utils.js';

/**
 * Échelles et libellés — l'ordre des tableaux suit les valeurs 1→5.
 * L'échelle Fist reprend celle du panneau de vote PI (views/pi.js → renderFist) :
 * poing fermé = aucune confiance, main ouverte = confiance totale.
 */
export const VOTE_KINDS = {
    mood: {
        label: 'Mood',
        icon: '🎭',
        storeKey: 'moodVotes',
        what: "Humeur ressentie par l'équipe sur le sprint",
        emojis: ['😞', '😕', '😐', '🙂', '😄'],
        scale:  ['Très mauvais', 'Mauvais', 'Neutre', 'Bien', 'Excellent'],
    },
    fist: {
        label: 'Confiance',
        icon: '✊',
        storeKey: 'fistVotes',
        what: "Fist of Five — confiance dans l'atteinte des objectifs du PI",
        emojis: ['✊', '✌️', '🤟', '🖖', '🖐️'],
        scale:  ['Aucune confiance', 'Faible confiance', 'Confiance modérée', 'Bonne confiance', 'Confiance totale'],
    },
};

// Instantané des votes par type — rafraîchi à chaque render de Health et après chaque
// vote, pour que les cellules re-rendues à chaud restent cohérentes avec le store.
const _votes = { mood: [], fist: [] };

/** Alimente l'instantané depuis le store (appelé par renderHealth). */
export function setVotes(kind, list) { _votes[kind] = list || []; }

/** Ajoute un vote fraîchement enregistré, sans re-fetch. */
export function pushVote(kind, vote) { _votes[kind] = (_votes[kind] || []).concat(vote); }

const _face = (kind, n) => VOTE_KINDS[kind].emojis[Math.round(n) - 1] || '—';

/**
 * Stats sur un ensemble de votes bruts (valeurs 1-5). Moyenne pondérée par le nombre
 * de votes, jamais moyenne de moyennes : un sprint à 12 votes et un sprint à 2 ne
 * pèsent pas pareil. `tone` est vide s'il n'y a aucun vote — pas de verdict à donner.
 */
function _stats(votes) {
    const vals = votes.map(v => parseInt(v.value) || 0).filter(Boolean);
    const n = vals.length;
    if (!n) return { n: 0, avg: null, tone: '' };
    const avg = Math.round((vals.reduce((a, b) => a + b, 0) / n) * 10) / 10;
    return {
        n, avg,
        tone: avg >= 4 ? 'good' : avg >= 3 ? 'ok' : 'bad',
        dist: [1, 2, 3, 4, 5].map(v => vals.filter(m => m === v).length),
        voted: new Set(votes.map(v => v.piSprint)).size,
    };
}

const _forSprint = (kind, team, sprintKey) =>
    (_votes[kind] || []).filter(v => v.team === team && v.piSprint === sprintKey);

const _forPi = (kind, team, sprintKeys) => {
    const keys = new Set(sprintKeys);
    return (_votes[kind] || []).filter(v => v.team === team && keys.has(v.piSprint));
};

// Distribution en clair dans le tooltip, du plus favorable au moins favorable.
const _distLines = (kind, dist) => [5, 4, 3, 2, 1]
    .map(v => `${_face(kind, v)} ${v} ${VOTE_KINDS[kind].scale[v - 1]} : ${dist[v - 1]}`)
    .join('\n');

// `attrs` porte les data-* de saisie sur les cellules de sprint, et reste vide sur le
// total (non cliquable) — le rendu de la valeur, lui, est strictement le même.
const _valHtml = (kind, s, tip, attrs = '') =>
    `<span class="htl-vote-val htl-vote--${s.tone}"${attrs ? ' ' + attrs : ''} title="${esc(tip)}">`
    + `${_face(kind, s.avg)} ${s.avg} <span class="htl-vote-count">(${s.n})</span></span>`;

/**
 * Cellule d'un sprint : moyenne + nb de votes + tooltip de distribution, cliquable
 * pour voter (le picker est monté par health.js sur `[data-vote-editable]`).
 */
export function voteCellHtml(kind, team, sprintKey) {
    const k = VOTE_KINDS[kind];
    const attrs = `data-vote-editable data-vote-kind="${kind}" `
        + `data-sprint-key="${esc(sprintKey)}" data-team="${esc(team)}"`;
    const s = _stats(_forSprint(kind, team, sprintKey));
    if (!s.n) {
        const tip = `${k.icon} ${k.label} — aucun vote pour le sprint ${sprintKey}\n${k.what}\n\nCliquer pour voter`;
        return `<span class="htl-vote-empty htl-muted" ${attrs} title="${esc(tip)}">+ voter</span>`;
    }
    const tip = `${k.icon} ${k.label} · ${team} · sprint ${sprintKey}\n${k.what}\n`
        + `Moyenne ${s.avg}/5 · ${s.n} vote${s.n > 1 ? 's' : ''}\n`
        + _distLines(kind, s.dist)
        + '\n\nCliquer pour voter';
    return _valHtml(kind, s, tip, attrs);
}

/**
 * Moyenne sur TOUT le PI, pour la ligne de total du tableau. Non cliquable,
 * contrairement aux cellules par sprint : on ne vote pas sur un total.
 */
export function voteTotalHtml(kind, team, sprintKeys) {
    const k = VOTE_KINDS[kind];
    const s = _stats(_forPi(kind, team, sprintKeys));
    if (!s.n) return '<span class="htl-muted">—</span>';
    const tip = `${k.icon} ${k.label} moyen du PI · ${team}\n${k.what}\n`
        + `Moyenne ${s.avg}/5 · ${s.n} vote${s.n > 1 ? 's' : ''} `
        + `sur ${s.voted} sprint${s.voted > 1 ? 's' : ''} / ${sprintKeys.length}\n`
        + _distLines(kind, s.dist);
    return _valHtml(kind, s, tip);
}

/**
 * Classe de teinte de la ligne de total — vide s'il n'y a aucun vote. Sépare la
 * couleur du rendu : la ligne et la cellule partagent ainsi le même seuil.
 */
export function voteRowCls(kind, team, sprintKeys) {
    const tone = _stats(_forPi(kind, team, sprintKeys)).tone;
    return tone ? ` htl-sprint-total--${tone}` : '';
}

/** Boutons du picker inline (1→5) pour un type de vote. */
export function pickerHtml(kind) {
    const k = VOTE_KINDS[kind];
    return k.emojis.map((em, i) => {
        const lbl = `${i + 1}/5 — ${k.scale[i]}`;
        return `<button class="htl-vote-btn" type="button" data-val="${i + 1}" `
            + `title="${esc(lbl)}" aria-label="${esc(lbl)}">${em}</button>`;
    }).join('');
}
