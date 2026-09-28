/**
 * Presentation des noms de membres et message de rotation d'UNE equipe, pret a coller
 * (Slack/Teams). Le message du POOL, lui, groupe par poste et vit dans
 * settings-rotation-pool-recap.js — les deux ne repondent pas a la meme question.
 *
 * Extrait de settings-rotation.js (3.162.0), qui depassait les 800 lignes.
 */

import { store } from '../state.js';
import { isMemberSupportActive } from '../utils.js';
import { _rotBuildPiWeeks } from './settings-rotation-weeks.js';

/** Formate un nom "NOM, Prénom" → "Prénom NOM". Laisse inchangé si pas de virgule. */
function _fmtMemberName(n) {
    const comma = n.indexOf(',');
    if (comma < 0) return n;
    return `${n.slice(comma + 1).trim()} ${n.slice(0, comma).trim()}`;
}

/** Construit un message de rotation prêt à coller (Slack/Teams) pour une équipe.
 *  Format : en-tête (rôle support + PI) puis une ligne par itération avec dates + membres @. */
function _rotBuildCopyMessage(teamName) {
    const { selectedWeeks, selectedPiNum } = _rotBuildPiWeeks(teamName);
    const support = (store.get('support') || []).filter(s => {
        const t = (s.team || '').toLowerCase().trim(), g = teamName.toLowerCase().trim();
        return t === g || (t && g && (t.includes(g) || g.includes(t)));
    });
    // Libellé de support configurable par équipe (défaut "Support N3 OPS")
    const roleLabel = localStorage.getItem(`rot-label-${teamName}`) || 'Support N3 OPS';

    const _fmtDate = iso => {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    };

    // "@Prenom NOM" — premier mot tel quel, reste en MAJUSCULES
    const _sn = n => { const nm = _fmtMemberName(n); const p = nm.trim().split(/\s+/); return p.length < 2 ? `@${nm}` : `@${p[0]} ${p.slice(1).join(' ').toUpperCase()}`; };

    const lines = [`🎧 *${roleLabel} — PI${selectedPiNum || '?'}*`, ''];
    for (const w of selectedWeeks) {
        const entry = support.find(s => s.weekStart === w.weekStart);
        const members = (entry?.members || []).map(_sn).join(', ');
        lines.push(`  • ${w.label} (${_fmtDate(w.weekStart)} → ${_fmtDate(w.weekEnd)}) : ${members || '—'}`);
    }
    return lines.join('\n');
}

/** Trie une liste de noms membres : actifs en premier, puis par prénom puis nom.
 *  Format attendu : "NOM, Prénom" ou "Prénom NOM" — les deux cas sont gérés. */
function _sortSupportMembers(names) {
    const _parseName = n => {
        // Format "NOM, Prénom" → { first: "Prénom", last: "NOM" }
        const comma = n.indexOf(',');
        if (comma > 0) return { first: n.slice(comma + 1).trim(), last: n.slice(0, comma).trim() };
        // Format "Prénom NOM" → dernier mot = nom
        const parts = n.trim().split(/\s+/);
        return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] || '' };
    };
    return [...names].sort((a, b) => {
        const aActive = isMemberSupportActive(a) ? 0 : 1;
        const bActive = isMemberSupportActive(b) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const pa = _parseName(a), pb = _parseName(b);
        const firstCmp = pa.first.localeCompare(pb.first, 'fr', { sensitivity: 'base' });
        if (firstCmp !== 0) return firstCmp;
        return pa.last.localeCompare(pb.last, 'fr', { sensitivity: 'base' });
    });
}

export { _fmtMemberName, _rotBuildCopyMessage, _sortSupportMembers };
