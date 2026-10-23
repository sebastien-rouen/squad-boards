/**
 * 🩺 Health — état et outils partagés entre la page (health.js) et la modale de sprint : métadonnées de sprint par équipe, dernière date de congés connue, points au lancement, infobulle de la base capacité, badge d'état.
 *
 * Extrait de health.js (3.261.0), code déplacé à l'identique. N'importe jamais health.js (pas de cycle).
 */
import { extractSprintLabel, jiraDateMs } from '../utils.js';

// Stockage module-level des métadonnées sprint — peuplé à chaque render, lu sans closure
export const _sprintMetaStore = new Map();
// État partagé avec la modale de sprint (health-sprint-modal.js), posé à chaque rendu :
// dernière date de congés connue — dit quand la base de capacité repose sur une fenêtre que
// l'import RH ne couvre pas entièrement.
export const _healthCtx = { lastKnownAbsence: '' };

// Helpers partagés entre renderHealth et _openSprintModal (module-level)
export const _spKey  = extractSprintLabel; // alias local — source unique désormais dans utils.js
export const _fmtD   = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) : '—';

/**
 * Reconstruit les points d'un ticket "au lancement" du sprint depuis son historique
 * (recentChanges, field "Story Points") plutôt que de prendre les points courants —
 * sinon une réestimation en cours de sprint fausse la vélocité planifiée (footgun
 * remonté en prod : GDEM-4057 5→8 pts pendant l'Ité 30.1 gonflait le planifié de +3).
 * Si la valeur reconstituée est 0 (ticket pas encore estimé au lancement), on garde
 * les points courants : un "0 pts planifiés" serait trompeur, mieux vaut afficher
 * la meilleure estimation connue pour ce ticket plutôt qu'un planifié sous-évalué.
 */
export function _pointsAtLaunch(t, sprintStart) {
    const startMs = jiraDateMs(sprintStart);
    if (!Number.isFinite(startMs)) return t.points || 0;
    // Dates comparées en ms : le changelog est en « +0200 », les sprints en « Z ».
    const changes = (t.recentChanges || t.recent_changes || [])
        .filter(c => (c.field || '').toLowerCase() === 'story points' && jiraDateMs(c.date) >= startMs)
        .sort((a, b) => jiraDateMs(a.date) - jiraDateMs(b.date));
    if (!changes.length) return t.points || 0;
    const launch = parseFloat(changes[0].from);
    return (!isNaN(launch) && launch > 0) ? launch : (t.points || 0);
}

/**
 * Détail complet du calcul de la Base capacité, en clair.
 *
 * La première question devant un chiffre de capacité est « qui as-tu compté ? » — d'où la
 * liste NOMINATIVE avec le rôle et son %, et la mention explicite de ceux qui pèsent 0.
 * Sans elle, impossible de savoir si un Product Owner ou un architecte gonfle l'effectif.
 */
export function _capacityTip(cap, team, piNum, lastAbsence) {
    const s = cap.staff || { members: [], counted: 0, ignored: 0, unknownRole: 0 };
    const pctTxt = Math.round(cap.ratio * 100);
    const L = [];
    L.push(`🎯 BASE CAPACITÉ PI#${piNum} — ${team}`);
    L.push('');
    L.push(`1. Vélocité réalisée : ${cap.velocityTotal} pts sur ${cap.sprintsUsed} sprints clos`);
    L.push(`   des PI ${cap.pis.join(' et ')} → moyenne ${cap.avg.toFixed(1)} pts/sprint`);
    if (cap.breathExcluded) {
        L.push(`   🍃 ${cap.breathExcluded} sprint${cap.breathExcluded > 1 ? 's' : ''} de respiration écarté${cap.breathExcluded > 1 ? 's' : ''} de la moyenne`);
    }
    L.push('');
    L.push(`2. Effectif compté : ${s.etp.toFixed(2)} j/h par jour ouvré (${s.members.length} personnes, pondérées par rôle)`);
    for (const m of s.members) {
        const flag = m.pct === 0 ? ' ✗ exclu' : (m.unknownRole ? ' ⚠ rôle inconnu → 100 % par défaut' : '');
        L.push(`   ${m.pct === 0 ? '·' : '•'} ${m.name} — ${m.role || '(sans rôle)'} ${m.pct} %${flag}`);
    }
    if (s.ignored) L.push(`   → ${s.ignored} personne${s.ignored > 1 ? 's' : ''} à 0 % : comptée${s.ignored > 1 ? 's' : ''} ni dans l'effectif, ni dans les absences.`);
    L.push(`   Réglable dans Paramètres → Capacité dev — % de travail par rôle.`);
    L.push('');
    L.push(`3. Disponibilité sur le PI : ${cap.absencesDays.toFixed(1)} j d'absence pondérés`);
    L.push(`   sur ${(cap.openDays * s.etp).toFixed(1)} j/h ouvrés (${cap.openDays} j ouvrés × ${s.etp.toFixed(2)} j/h par jour)`);
    L.push(`   → ${pctTxt} % d'indisponibilité`);
    L.push('');
    const nbSp = cap.dated || cap.sprintsCount;
    L.push(`= ${cap.avg.toFixed(1)} × ${nbSp} sprint${nbSp > 1 ? 's' : ''} planifiable${nbSp > 1 ? 's' : ''} = ${cap.gross} pts bruts, − ${pctTxt} % → ${cap.points} pts`);
    if (cap.breathCount) {
        L.push(`  (le PI compte ${cap.sprintsTotal} sprints, dont 🍃 le ${cap.breathIdx}ᵉ — respiration, non planifiée)`);
    }
    if (cap.capped) {
        L.push('');
        L.push(`⚠ Les congés connus s'arrêtent au ${_fmtD(lastAbsence)}, avant la fin du PI :`);
        L.push(`  le taux d'absence est un plancher, donc cette base un plafond.`);
    }
    if (s.unknownRole) {
        L.push('');
        L.push(`⚠ ${s.unknownRole} membre${s.unknownRole > 1 ? 's' : ''} sans rôle connu, compté${s.unknownRole > 1 ? 's' : ''} à 100 %.`);
    }
    L.push('');
    L.push('Repère de PI Planning, pas un engagement.');
    return L.join('\n');
}

// Badge état coloré pour le tableau sprints : bleu=en cours, vert=clos/terminé, gris=à venir
export function _stateBadge(state) {
    const map = {
        active: { cls: 'htl-state--active', label: '🔵 En cours' },
        closed: { cls: 'htl-state--closed', label: '✅ Terminé'  },
        future: { cls: 'htl-state--future', label: '⚪ À venir'   },
    };
    const m = map[state] || { cls: 'htl-state--future', label: state || '—' };
    return `<span class="htl-state ${m.cls}">${m.label}</span>`;
}
