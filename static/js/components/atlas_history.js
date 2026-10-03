/**
 * Atlas — 📈 évolution des niveaux d'une personne (ou d'une équipe), dans sa fiche (3.198.0).
 *
 * Source : `GET /api/skill-history` — une ligne par CHANGEMENT de niveau, écrite par le serveur à
 * chaque saisie (table `skill_level_history`). Les niveaux saisis avant la création de la table n'ont
 * pas de date de départ : la première étape affichée est alors « avant » (niveau d'origine, date
 * inconnue), jamais une date inventée.
 *
 * Composant : ne PAS importer views/atlas.js (lazy loading) — le référentiel des niveaux est INJECTÉ
 * (`levelMeta`), comme le catalogue des compétences.
 */

import * as api from '../api.js';
import { esc } from '../utils.js';

const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }); };

/** Pastille d'un niveau (couleur du référentiel). */
const chip = (lvl, levelMeta, title = '') => {
    const m = levelMeta(lvl);
    return `<span class="atlas-hist-lvl${lvl ? '' : ' is-none'}" style="--lc:${m.color}" title="${esc(title || m.label)}">${lvl || '–'}</span>`;
};

/** HTML du bloc à partir des lignes d'historique d'une personne. */
export function skillHistoryHtml(rows, { skills = [], levelMeta }) {
    const bySkill = new Map();
    for (const h of rows) (bySkill.get(h.skillId) || bySkill.set(h.skillId, []).get(h.skillId)).push(h);
    const name = id => skills.find(s => s.id === id)?.name || 'Compétence supprimée';
    const lines = [...bySkill].map(([id, hs]) => {
        hs.sort((a, b) => String(a.changedAt).localeCompare(String(b.changedAt)));
        const first = hs[0];
        const start = first.prevLevel ? `${chip(first.prevLevel, levelMeta, `${levelMeta(first.prevLevel).label} — avant le ${fmtDay(first.changedAt)}`)}<small>avant</small>` : '';
        const steps = hs.map(h => `<span class="atlas-hist-arrow" aria-hidden="true">→</span>${chip(h.level, levelMeta, `${h.level ? levelMeta(h.level).label : 'Niveau retiré'} — le ${fmtDay(h.changedAt)}`)}<small>${esc(fmtDay(h.changedAt))}</small>`).join('');
        const last = hs.at(-1).level, origin = first.prevLevel;
        const trend = last > origin ? 'is-up' : last < origin ? 'is-down' : '';
        return { at: hs.at(-1).changedAt, html: `<li class="atlas-hist-row ${trend}"><span class="atlas-hist-name">${esc(name(id))}</span><span class="atlas-hist-steps">${start}${steps}</span></li>` };
    }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return lines.length
        ? `<ul class="atlas-hist-list">${lines.map(l => l.html).join('')}</ul>`
        : '<div class="atlas-empty-sm">Aucun changement de niveau enregistré pour l\'instant — l\'historique se remplit à chaque nouvelle saisie.</div>';
}

/** Charge l'historique et remplit `el` (bloc de la fiche). Échec réseau : le bloc reste discret. */
export async function mountSkillHistory(el, scopeKey, { scope = 'member', skills = [], levelMeta }) {
    if (!el) return;
    try {
        const rows = await api.getSkillHistory(scope, scopeKey);
        if (!el.isConnected) return;
        el.querySelector('.atlas-hist-body').innerHTML = skillHistoryHtml(Array.isArray(rows) ? rows : [], { skills, levelMeta });
    } catch {
        el.querySelector('.atlas-hist-body').innerHTML = '<div class="atlas-empty-sm">Historique indisponible.</div>';
    }
}
