/**
 * Rotation Support — grille membre×semaine de « Paramètres → Rotation », shuffle, copie
 * du message et calcul des semaines d'un PI.
 *
 * Extrait de settings.js (v3.141.4) : bloc autonome, aucune dépendance vers le reste de la
 * vue Paramètres. Les règles métier de tirage vivent dans utils.generateSupportRotation ;
 * ce module gère l'affichage, les interactions et la résolution des semaines du PI.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import {
    esc, toast, deriveMembersFromAbsences, generateSupportRotation, buildSupportPiWeeks,
    SUPPORT_WEEK_MODES, SUPPORT_WEEK_MODE_DEFAULT, getSupportWeekMode, supportWorkingDays,
    supportDaysForMember, supportAbsenceDayLevel, isMemberSupportActive, setMemberSupportActive,
    promptModal, teamNameMatches, confirmDanger, effectiveRosterForPi,
} from '../utils.js';

async function _rotRefreshPanels(container) {
    const panelsEl = container.querySelector('#rot-panels');
    if (!panelsEl) return;
    try {
        const support = await api.getSupport();
        store.set('support', support);
        _rotRenderPanels(container, support);
    } catch (e) { toast(e.message, 'error'); }
}

/** Re-rend #rot-panels depuis les données fournies puis recâble les events */
function _rotRenderPanels(container, support) {
    const panelsEl = container.querySelector('#rot-panels');
    if (!panelsEl) return;
    const allTeamNames = store.get('teams') || [];
    const teamObjects  = store.get('teamObjects') || [];
    const absences     = store.get('absences') || [];
    const rotMembers   = deriveMembersFromAbsences(absences, store.get('members') || []);
    // Respecter le filtre groupe du topbar
    const selGroupId  = store.get('group') || null;
    const selGroup    = selGroupId ? (store.get('groups') || []).find(g => g.id === selGroupId) : null;
    const teamNames   = (selGroup?.teams?.length)
        ? allTeamNames.filter(t => selGroup.teams.includes(t))
        : allTeamNames;
    // Préserve le scroll horizontal de chaque panneau : innerHTML le remettrait à 0,
    // ce qui ferait "sauter" la grille quand on coche un jour dans une semaine hors écran.
    const scrollByPanel = {};
    panelsEl.querySelectorAll('.rot-panel').forEach(p => {
        const wrap = p.querySelector('.table-wrap');
        if (wrap && p.id) scrollByPanel[p.id] = wrap.scrollLeft;
    });
    panelsEl.innerHTML = _rotPanelsHtml(teamNames, teamObjects, support, rotMembers, absences);
    panelsEl.querySelectorAll('.rot-panel').forEach(p => {
        const wrap = p.querySelector('.table-wrap');
        if (!wrap) return;
        const team = p.dataset.rotTeam || '';
        const saved = p.id in scrollByPanel
            ? scrollByPanel[p.id]
            : parseInt(localStorage.getItem(`rot-scroll-${team}`) || '0', 10);
        if (saved > 0) wrap.scrollLeft = saved;
    });
    _rotWirePanelEvents(container);
}

/**
 * Génère et enregistre la rotation pour une équipe.
 * Renvoie { ok, weeks, preserved } ou { ok: false, reason }.
 * Partagé entre le shuffle par équipe et le shuffle de groupe.
 */
async function _shuffleOneTeam(teamName) {
    const absences = store.get('absences') || [];
    const mpw      = parseInt(localStorage.getItem(`rot-mpw-${teamName}`)) || 2;
    const teamMode = getSupportWeekMode(teamName);
    // `selectedWeeks` = les semaines RÉELLEMENT affichées par la grille pour le PI
    // épinglé. Ne jamais retomber sur curWeeks/nextWeeks : les deux séries n'ont pas
    // la même ancre. buildSupportPiWeeks() SNAPPE la date de début sur le jour de la
    // semaine du mode ; la branche `_targetStart` de _rotBuildPiWeeks() utilise la
    // date JIRA BRUTE du sprint <PI>.1, sans snap. Sur PI 31 (JIRA : dimanche
    // 2026-09-06) la grille listait 06/09, 13/09… quand le shuffle écrivait 04/09,
    // 11/09… (vendredi snappé) : zéro weekStart commun, dans les trois modes de
    // semaine. La grille apparie sur `s.weekStart === w.weekStart`, donc la rotation
    // était bien créée en base — toast de succès — mais sur des semaines que le
    // panneau n'affiche jamais. Vu de l'utilisateur : « le Shuffle ne fait rien ».
    // Au passage, nextWeeks ne connaît que PI+1 et hérite du nombre de sprints du PI
    // courant : sur PI 30 (6 sprints) → PI 31 (5), il produisait 12 semaines au lieu
    // de 10, et restait bloqué sur PI+1 pour un offset de +2.
    const { selectedWeeks, selectedPiNum } = _rotBuildPiWeeks(teamName);
    const weeks = selectedWeeks || [];
    if (!weeks.length) return { ok: false, reason: `Aucune semaine calculée pour le PI ${selectedPiNum || '?'} — vérifier la date de début du PI` };
    // Roster = EXACTEMENT celui affiche par la grille : snapshot du PI selectionne s'il
    // existe (turnover PI a PI), sinon derivation des absences — via effectiveRosterForPi,
    // comme la grille, l'agenda et l'info-panel. Le shuffle piochait avant dans le roster
    // GLOBAL avec un matching maison par sous-chaine : l'equipe "O" etant contenue dans
    // "Fuego"/"Gabbiano"/"Lion"/"Cameleon", ses membres etaient tires puis ecrits en base
    // (total "3/3") sans avoir de ligne dans la grille -> "la semaine n'affiche que 2 personnes".
    const teamMembers = effectiveRosterForPi(store.get('piInfo'), selectedPiNum, absences, store.get('members') || [])
        .filter(m => teamNameMatches(m.team, teamName))
        .map(m => m.name);
    if (!teamMembers.length) return { ok: false, reason: `Aucun membre rattaché à "${teamName}"` };
    const activeMembers = teamMembers.filter(isMemberSupportActive);
    if (!activeMembers.length) return { ok: false, reason: `Tous les membres de "${teamName}" sont inactifs pour le support` };
    const existingSupport = (store.get('support') || []).filter(s => s.team === teamName);
    const rotations = generateSupportRotation({
        team: teamName, weeks, memberNames: activeMembers, absences, existingSupport,
        membersPerWeek: mpw, weekMode: teamMode,
    });
    await api.bulkCreateSupport(teamName, rotations);
    return {
        ok: true,
        weeks: weeks.length,
        piNum: selectedPiNum,
        preserved: rotations.filter(r => r._autoLocked || r.locked).length,
    };
}

/** Câble tous les handlers data-rot-* sur les panneaux dans container */
function _rotWirePanelEvents(container) {
    // Collapse toggle (pas d'appel API)
    container.querySelectorAll('[data-rot-toggle]').forEach(hdr => {
        hdr.addEventListener('click', () => {
            const team = hdr.dataset.rotToggle;
            // Sauvegarde scroll avant de plier (innerHTML le perdrait sinon)
            if (!_rotIsCollapsed(team)) {
                const panel = container.querySelector(`#rot-panel-${CSS.escape(team)}`);
                const wrap = panel?.querySelector('.table-wrap');
                if (wrap && wrap.scrollLeft > 0) localStorage.setItem(`rot-scroll-${team}`, String(wrap.scrollLeft));
            }
            _rotSetCollapsed(team, !_rotIsCollapsed(team));
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Effectif/semaine (pas d'appel API)
    container.querySelectorAll('[data-rot-mpw]').forEach(inp => {
        inp.addEventListener('change', () => {
            localStorage.setItem(`rot-mpw-${inp.dataset.rotMpw}`, inp.value);
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Mode semaine par équipe (vendredi par défaut, mercredi ou lundi possibles)
    container.querySelectorAll('[data-rot-mode]').forEach(sel => {
        sel.addEventListener('change', () => {
            localStorage.setItem(`rot-mode-${sel.dataset.rotMode}`, sel.value);
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Toggle actif/inactif support par membre (exclu des shuffles + grisé dans la grille)
    container.querySelectorAll('[data-rot-active]').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.rotActive;
            const wasActive = btn.classList.contains('is-on');
            setMemberSupportActive(name, !wasActive);
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Toggle verrouillage manuel d'une semaine (future) — préservée lors d'un shuffle
    container.querySelectorAll('[data-rot-lock]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { rotLock: team, weekStart, weekEnd } = btn.dataset;
            const support  = store.get('support') || [];
            const existing = support.find(s => s.team === team && s.weekStart === weekStart);
            try {
                if (existing) {
                    await api.updateSupport(existing.id, { locked: !existing.locked });
                } else {
                    // Verrouille une semaine vide : crée l'entrée avec locked: true
                    const mpw = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
                    const label = btn.closest('.rot-wk-th')?.querySelector('.rot-wk-label')?.textContent || '';
                    await api.createSupport({ team, weekLabel: label, weekStart, weekEnd, members: [], weekMode: getSupportWeekMode(team), membersPerWeek: mpw, locked: true });
                }
                await _rotRefreshPanels(container);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Toggle déverrouillage EXCEPTIONNEL d'une semaine passée — la rend modifiable
    container.querySelectorAll('[data-rot-unlock]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { rotUnlock: team, weekStart, weekEnd } = btn.dataset;
            const support  = store.get('support') || [];
            const existing = support.find(s => s.team === team && s.weekStart === weekStart);
            try {
                if (existing) {
                    await api.updateSupport(existing.id, { unlocked: !existing.unlocked });
                } else {
                    // Crée une entrée vide déverrouillée pour permettre l'édition d'une semaine passée vide
                    const mpw = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
                    const label = btn.closest('.rot-wk-th')?.querySelector('.rot-wk-label')?.textContent || '';
                    await api.createSupport({ team, weekLabel: label, weekStart, weekEnd, members: [], weekMode: getSupportWeekMode(team), membersPerWeek: mpw, unlocked: true });
                }
                await _rotRefreshPanels(container);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Toggle jour de support d'un membre (mini-strip).
    // Clic simple = un jour ; double-clic = toute la semaine (remplit/vide).
    container.querySelectorAll('[data-rot-day]:not([disabled])').forEach(btn => {

        // Empêche le focus au clic (évite que le navigateur scrolle la cellule "into view").
        btn.addEventListener('pointerdown', e => { e.preventDefault(); });

        const persist = async (newDays) => {
            const { rotDay: team, member, weekStart, weekEnd, weekLabel } = btn.dataset;
            const support  = store.get('support') || [];
            const existing = support.find(s => s.team === team && s.weekStart === weekStart);
            const clean = [...new Set(newDays)].filter(d => d >= 0 && d <= 4).sort((a, b) => a - b);
            const baseMembers = existing?.members || [];
            const baseDays    = { ...(existing?.memberDays || {}) };
            let members;
            if (clean.length === 0) {
                members = baseMembers.filter(m => m !== member);
                delete baseDays[member];
            } else {
                members = baseMembers.includes(member) ? baseMembers : [...baseMembers, member];
                if (clean.length === 5) delete baseDays[member];
                else                    baseDays[member] = clean;
            }
            try {
                if (existing) {
                    await api.updateSupport(existing.id, { members, memberDays: baseDays });
                } else {
                    const mpw = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
                    await api.createSupport({ team, weekLabel, weekStart, weekEnd, members, memberDays: baseDays, weekMode: getSupportWeekMode(team), membersPerWeek: mpw });
                }
                await _rotRefreshPanels(container);
            } catch (e) { toast(e.message, 'error'); }
        };

        const curDays = () => {
            const { rotDay: team, member, weekStart } = btn.dataset;
            const existing = (store.get('support') || []).find(s => s.team === team && s.weekStart === weekStart);
            return supportDaysForMember(existing, member);
        };

        // e.detail : 1 = clic simple, 2 = deuxième clic d'un double-clic.
        // On ignore le clic simple si le navigateur va enchaîner avec dblclick (detail >= 2).
        btn.addEventListener('click', e => {
            if (e.detail >= 2) return;
            const di = parseInt(btn.dataset.dayIndex, 10);
            const days = curDays();
            persist(days.includes(di) ? days.filter(d => d !== di) : [...days, di]);
        });
        btn.addEventListener('dblclick', () => {
            persist(curDays().length === 5 ? [] : [0, 1, 2, 3, 4]);
        });
    });


    // Shuffle (génération automatique) — règles métier centralisées dans utils.generateSupportRotation
    container.querySelectorAll('[data-rot-shuffle]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const team = btn.dataset.rotShuffle;
            btn.disabled = true;
            try {
                const result = await _shuffleOneTeam(team);
                if (!result.ok) { toast(result.reason, 'warning'); return; }
                // Le PI est nommé dans le toast : c'est le seul repère qui permette de
                // voir tout de suite qu'on a généré sur le PI épinglé, et pas un autre.
                const piTag = result.piNum ? ` — PI ${result.piNum}` : '';
                const msg = result.preserved
                    ? `Rotation générée pour ${team}${piTag} (${result.weeks} sem., ${result.preserved} préservées)`
                    : `Rotation générée pour ${team}${piTag} (${result.weeks} semaines)`;
                toast(msg, 'success');
                await _rotRefreshPanels(container);
            } catch (e) { toast(e.message, 'error'); }
            finally { btn.disabled = false; }
        });
    });

    // Effacer la rotation d'une équipe
    container.querySelectorAll('[data-rot-clear]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const team     = btn.dataset.rotClear;
            if (!(await confirmDanger('Supprimer la rotation', `Supprimer toute la rotation de ${team} ?`, { confirmLabel: 'Supprimer' }))) return;
            const support  = store.get('support') || [];
            const toDelete = support.filter(s => s.team === team);
            try {
                await Promise.all(toDelete.map(s => api.deleteSupport(s.id)));
                toast(`Rotation ${team} supprimee`, 'info');
                await _rotRefreshPanels(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // ── Envoyer directement sur Slack ────────────────────────────────────────
    container.querySelectorAll('[data-rot-slack]').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const old = btn.textContent; btn.disabled = true; btn.textContent = '…';
            try {
                const msg = _rotBuildCopyMessage(btn.dataset.rotSlack);
                await api.sendSlackMessage(msg);
                btn.textContent = '✓ Envoyé !';
                setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1800);
            } catch (err) {
                toast(err.message, 'error', 6000);
                btn.textContent = old; btn.disabled = false;
            }
        });
    });

    // ── Raccourcis clavier sur les pastilles jour ─────────────────────────────
    // ← / → : déplace le focus vers le jour précédent/suivant dans la même ligne.
    // Shift+Espace : toggle toute la semaine (équivalent double-clic).
    container.querySelectorAll('[data-rot-day]:not([disabled])').forEach(btn => {
        btn.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const row = btn.closest('tr');
                if (!row) return;
                const days = [...row.querySelectorAll('.rot-day:not([disabled])')];
                const idx  = days.indexOf(btn);
                const next = e.key === 'ArrowRight' ? days[idx + 1] : days[idx - 1];
                if (next) { next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
            }
            if (e.key === ' ' && e.shiftKey) {
                e.preventDefault();
                btn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            }
        });
    });

    // ── Copier un message de rotation (Slack/Teams) ──────────────────────────
    container.querySelectorAll('[data-rot-copy]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const team = btn.dataset.rotCopy;
            const msg  = _rotBuildCopyMessage(team);
            navigator.clipboard.writeText(msg)
                .then(() => toast('Message de rotation copié', 'success'))
                .catch(() => toast('Copie impossible', 'error'));
        });
        // Clic droit → personnaliser le libellé du rôle (ex: "Support N3 OPS")
        btn.addEventListener('contextmenu', async e => {
            e.preventDefault(); e.stopPropagation();
            const team = btn.dataset.rotCopy;
            const cur = localStorage.getItem(`rot-label-${team}`) || 'Support N3 OPS';
            const next = await promptModal(`Libellé du support — ${team}`, {
                value: cur,
                placeholder: 'Support N3 OPS',
                confirmLabel: 'Enregistrer',
            });
            if (next !== null) {
                localStorage.setItem(`rot-label-${team}`, next || 'Support N3 OPS');
                toast('Libellé mis à jour — utilisé dans le message copié', 'success');
            }
        });
    });

    // ── Capacité dev — sliders % par rôle ────────────────────────────────────
    let _roleSaveTimer = null;
    container.querySelectorAll('.cap-role-slider').forEach(slider => {
    // Clic sur "N membres" → copie la liste
    container.querySelectorAll('.cap-role-count--tip').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const text = el.dataset.copy;
            if (!text) return;
            navigator.clipboard.writeText(text)
                .then(() => toast('Liste copiée', 'success'))
                .catch(() => toast('Copie impossible', 'error'));
        });
    });

        slider.addEventListener('input', () => {
            const pct   = parseInt(slider.value, 10);
            // Mise à jour visuelle immédiate
            const valEl = slider.closest('.cap-role-slider-wrap')?.querySelector('.cap-role-pct-val');
            if (valEl) {
                valEl.textContent = pct + '%';
                valEl.className = 'cap-role-pct-val' + (pct === 0 ? ' cap-role-pct-zero' : pct < 100 ? ' cap-role-pct-partial' : '');
            }
            // Debounce : sauvegarde 600ms après le dernier glissement
            clearTimeout(_roleSaveTimer);
            _roleSaveTimer = setTimeout(async () => {
                // Reconstruit la map complète depuis tous les sliders visibles
                const map = {};
                container.querySelectorAll('.cap-role-slider').forEach(s => {
                    map[s.dataset.role] = parseInt(s.value, 10);
                });
                try {
                    const current = store.get('piInfo') || {};
                    const updated = await api.updatePI({ ...current, roleCapacity: map });
                    store.set('piInfo', updated);
                } catch (e) { toast(e.message, 'error'); }
            }, 600);
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rotation Support - Grid helpers
// ═══════════════════════════════════════════════════════════════════════════════

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

/** Détecte le nombre réel de sprints d'un PI depuis les teamSprints JIRA (max index).
 *  Couvre les PI exceptionnels à 6 sprints (ex: PI30 avec un sprint 30.6). */
/** Config PI saisie dans « Paramètres → Sprint & PI » (localStorage `pi-cfg-<N>`). */
function _lsPiCfg(piNum) {
    if (!piNum) return null;
    try { return JSON.parse(localStorage.getItem(`pi-cfg-${piNum}`) || 'null'); } catch { return null; }
}

function _detectSprintsPerPI(piNum, fallback) {
    if (!piNum) return fallback;
    // 1) Config explicite de la section « Sprint & PI » POUR CE PI — elle fait foi.
    const cfg = _lsPiCfg(piNum);
    if (cfg?.sprintsPerPI) return cfg.sprintsPerPI;
    // 2) Sinon, sprints JIRA DE CE PI : le plus grand indice observé EST le nombre d'itérations.
    const all = store.get('sprintInfo')?.teamSprints || [];
    let maxIdx = 0;
    for (const s of all) {
        const m = String(s.name || '').match(/\b(\d{2,})\.(\d+)/);
        if (m && parseInt(m[1], 10) === piNum) maxIdx = Math.max(maxIdx, parseInt(m[2], 10));
    }
    // ⚠️ JAMAIS `Math.max(maxIdx, fallback)` : le fallback vient souvent d'un AUTRE PI (le
    // courant). JIRA connaît 30.1→30.6 et 31.1→31.5 ; le max donnait 6 itérations au PI 31,
    // soit 2 semaines fantômes (31.6.1 / 31.6.2) débordant sur le PI 32.
    return maxIdx > 0 ? maxIdx : fallback;
}

/** Date de début du sprint .1 d'un PI = date MAJORITAIRE parmi les équipes.
 *  Évite qu'un sprint JIRA mal daté d'1 jour (ex: jeudi au lieu de vendredi) décale
 *  le snap d'une semaine entière. Retourne 'YYYY-MM-DD' ou '' si aucun sprint trouvé. */
function _jiraSprint1Start(piNum) {
    if (!piNum) return '';
    const all = store.get('sprintInfo')?.teamSprints || [];
    const counts = {};
    for (const s of all) {
        const m = String(s.name || '').match(/\b(\d{2,})\.(\d+)/);
        if (m && parseInt(m[1]) === piNum && parseInt(m[2]) === 1 && s.startDate) {
            const d = String(s.startDate).slice(0, 10);
            counts[d] = (counts[d] || 0) + 1;
        }
    }
    const entries = Object.entries(counts);
    if (!entries.length) return '';
    // Plus fréquent d'abord ; à égalité, la date la plus tardive (souvent le vrai vendredi vs jeudi mal daté)
    return entries.sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0];
}

/** Génère les semaines du PI courant et suivant pour une équipe.
 *  Si pas d'équipe, utilise le mode par défaut. */
function _rotBuildPiWeeks(team = null) {
    const mode      = team ? getSupportWeekMode(team) : SUPPORT_WEEK_MODE_DEFAULT;
    const piInfoRaw = store.get('piInfo');
    const sprintInfo = store.get('sprintInfo');

    // Priorité : startDate du localStorage pi-cfg-<N> (mis à jour par la section Sprint & PI)
    // plutôt que piInfo.startDate en base qui peut pointer vers un PI précédent
    const _sprintName = store.get('sprintInfo')?.name || '';
    const _piFromSprint = (() => { const m = _sprintName.match(/(\d+)\.\d+/) || _sprintName.match(/PI\s*#?\s*(\d+)/i); return m ? parseInt(m[1], 10) : 0; })();
    const basePiNum = _piFromSprint || piInfoRaw?.number || 0;
    const localCfg  = basePiNum ? (() => { try { return JSON.parse(localStorage.getItem(`pi-cfg-${basePiNum}`) || 'null'); } catch { return null; } })() : null;
    // Nombre de sprints : localStorage > détecté depuis JIRA (gère le 6e sprint) > piInfo > 5
    const baseSprintsCnt = _detectSprintsPerPI(basePiNum, localCfg?.sprintsPerPI || piInfoRaw?.sprintsPerPI || 5);
    // startDate : JIRA (date majoritaire du sprint .1) prime sur localStorage périmé.
    const _resolvedStart = _jiraSprint1Start(basePiNum) || localCfg?.startDate || piInfoRaw?.startDate;
    // Toujours corriger number avec basePiNum (dérivé du sprint actif) + startDate résolue
    const piInfo = {
        ...piInfoRaw,
        number: basePiNum || piInfoRaw?.number,
        sprintsPerPI: baseSprintsCnt,
        ...(_resolvedStart ? { startDate: _resolvedStart } : {}),
    };

    const base      = buildSupportPiWeeks(piInfo, sprintInfo, mode);

    // buildSupportPiWeeks uses a single sprintCnt for both curWeeks and nextWeeks.
    // If the next PI has more sprints (e.g. PI 30 has 6 vs PI 29's 5), nextWeeks is
    // truncated. Detect and fix before returning or using nextWeeks.
    {
        const _nextPi = base.nextPiNum;
        const nextSprintCnt = _nextPi ? _detectSprintsPerPI(_nextPi, baseSprintsCnt) : baseSprintsCnt;
        if (_nextPi && nextSprintCnt > baseSprintsCnt && base.nextWeeks.length > 0) {
            const _sdur = piInfo?.sprintDuration || 14;
            const _wps  = Math.max(1, Math.floor(_sdur / 7));
            const _fmt  = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            const _ad   = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return _fmt(d); };
            const nextStart = base.nextWeeks[0].weekStart;
            const fixed = [];
            for (let s = 0; s < nextSprintCnt; s++)
                for (let w = 0; w < _wps; w++) {
                    const ws = _ad(nextStart, s * _sdur + w * 7);
                    fixed.push({ label: `${_nextPi}.${s+1}.${w+1}`, weekStart: ws, weekEnd: _ad(ws, 6) });
                }
            base.nextWeeks = fixed;
        }
    }

    if (_rotPiOff() === 0) return { ...base, selectedWeeks: base.curWeeks, selectedPiNum: base.curPiNum };

    // Calcule les semaines pour le PI sélectionné via l'offset
    const targetPiForCnt = basePiNum ? Math.max(1, basePiNum + _rotPiOff()) : 0;
    const sprintCnt = _detectSprintsPerPI(targetPiForCnt, piInfo?.sprintsPerPI || 5);
    const sprintDur = piInfo?.sprintDuration || 14;
    const targetPiNum = basePiNum ? Math.max(1, basePiNum + _rotPiOff()) : base.curPiNum;
    const wps = Math.max(1, Math.floor(sprintDur / 7));

    // startDate du PI cible : JIRA (date majoritaire du sprint .1) prime sur localStorage périmé.
    const targetCfg = (() => { try { return JSON.parse(localStorage.getItem(`pi-cfg-${targetPiNum}`) || 'null'); } catch { return null; } })();
    const _targetStart = _jiraSprint1Start(targetPiNum) || targetCfg?.startDate || '';
    let curStart = base.curWeeks[0]?.weekStart;

    // Si le PI cible a sa propre startDate (JIRA ou locale), l'utilise directement
    if (_targetStart) {
        // Calcule les semaines depuis la startDate du PI cible
        const selectedWeeks = [];
        for (let s = 0; s < sprintCnt; s++) {
            for (let w = 0; w < wps; w++) {
                const d = new Date(_targetStart + 'T00:00:00');
                d.setDate(d.getDate() + s * sprintDur + w * 7);
                const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
                const wStart = fmt(d);
                const wEnd   = (() => { const e = new Date(d); e.setDate(e.getDate() + 6); return fmt(e); })();
                selectedWeeks.push({ label: `${targetPiNum}.${s + 1}.${w + 1}`, weekStart: wStart, weekEnd: wEnd });
            }
        }
        return { ...base, selectedWeeks, selectedPiNum: targetPiNum };
    }

    if (!curStart) return { ...base, selectedWeeks: base.curWeeks, selectedPiNum: base.curPiNum };

    const selectedWeeks = [];
    for (let s = 0; s < sprintCnt; s++) {
        for (let w = 0; w < wps; w++) {
            const d = new Date(curStart + 'T00:00:00');
            d.setDate(d.getDate() + _rotPiOff() * sprintCnt * sprintDur + s * sprintDur + w * 7);
            const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            const wStart = fmt(d);
            const wEnd   = (() => { const e = new Date(d); e.setDate(e.getDate() + 6); return fmt(e); })();
            selectedWeeks.push({ label: `${targetPiNum}.${s + 1}.${w + 1}`, weekStart: wStart, weekEnd: wEnd });
        }
    }
    return { ...base, selectedWeeks, selectedPiNum: targetPiNum };
}

/** Nombre de jours d'absence pour un membre sur une plage */
function _rotAbsDays(memberName, weekStart, weekEnd, absences) {
    return absences
        .filter(a => a.memberName === memberName && a.startDate <= weekEnd && a.endDate >= weekStart)
        .reduce((sum, a) => sum + (a.days || 0), 0);
}

/** Premier jour OUVRÉ de la semaine — celui qu'affiche la première pastille de la colonne
 *  (supportWorkingDays saute samedi/dimanche). Quand la date de début du PI vient de JIRA
 *  sans être snappée (PI 31 : dimanche 2026-09-06), l'en-tête annonçait « 6 sept. » au-dessus
 *  d'une colonne qui commence le lundi 7. Correction d'AFFICHAGE seulement : `weekStart` reste
 *  la clé d'appariement des rotations déjà enregistrées en base. */
function _rotFirstWorkday(weekStart) {
    return supportWorkingDays(weekStart)[0]?.iso || weekStart;
}

/** Dernier jour ouvré de la semaine (infobulle de l'en-tête). */
function _rotLastWorkday(weekStart) {
    const days = supportWorkingDays(weekStart);
    return days[days.length - 1]?.iso || weekStart;
}

/** Format court : "14 avr." */
function _rotFmtShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** État collapse par équipe (localStorage) */
function _rotIsCollapsed(team) {
    try { const s = JSON.parse(localStorage.getItem('rot-collapsed') || '{}'); return s[team] !== false; } catch { return true; }
}
function _rotSetCollapsed(team, val) {
    try { const s = JSON.parse(localStorage.getItem('rot-collapsed') || '{}'); s[team] = val; localStorage.setItem('rot-collapsed', JSON.stringify(s)); } catch {}
}

// L'offset PI de la rotation lit directement store.get('piOffset') — piloté par le topbar.
const _rotPiOff = () => store.get('piOffset') || 0;

/** Rend tous les panneaux de rotation (un par équipe) */
function _rotPanelsHtml(teamNames, teamObjects, support, members, absences) {
    if (!teamNames.length) return '<p class="text-muted text-sm">Aucune equipe configuree</p>';
    const { curPiNum, selectedWeeks: _sw, selectedPiNum: _sp } = _rotBuildPiWeeks();
    teamNames = [...teamNames].sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
    const today    = new Date().toISOString().slice(0, 10);
    const showNext = _rotPiOff() > 0; // pour les classes CSS existantes

    // Snapshot des membres du PI affiché (gère le turnover PI à PI) — cf. effectiveRosterForPi
    // (utils.js), même logique que le panneau latéral (infopanel.js) pour rester la source
    // unique. `members` ici est déjà le résultat de deriveMembersFromAbsences (rotMembers,
    // calculé par l'appelant) → fallback direct, pas besoin de re-dériver.
    const piMembersMap = store.get('piInfo')?.piMembers || {};
    const piSnapshot   = piMembersMap[String(_sp || curPiNum)] || null;
    const effectiveMembers = (piSnapshot && piSnapshot.length) ? piSnapshot : members;
    const _usingSnapshot = !!(piSnapshot && piSnapshot.length);

    // Match tolérant entre équipes config app et équipes du CSV RH (cf. piège #5 agent debugger)
    const _matchTeam = teamNameMatches;

    const panels = teamNames.map(teamName => {
        const teamObj   = teamObjects.find(t => (typeof t === 'string' ? t : t.name) === teamName);
        const teamColor = (typeof teamObj === 'object' ? teamObj?.color : null) || '#64748b';
        const teamMembers = _sortSupportMembers(effectiveMembers.filter(m => _matchTeam(m.team, teamName)).map(m => m.name));
        if (!teamMembers.length) return '';
        const teamSupport = support.filter(s => _matchTeam(s.team, teamName));
        const { selectedWeeks, selectedPiNum } = _rotBuildPiWeeks(teamName);
        return _rotTeamPanelHtml(teamName, teamColor, teamSupport, teamMembers, absences,
            selectedWeeks, selectedWeeks, showNext, today, selectedPiNum, selectedPiNum);
    }).filter(Boolean).join('');

    // Diagnostic : si aucun panneau, on liste les équipes vues côté CSV pour aider à corriger le mapping
    let emptyHint = '';
    if (!panels) {
        const knownInData = [...new Set(members.map(m => m.team).filter(Boolean))].sort();
        emptyHint = knownInData.length
            ? `<div class="rot-empty-hint">
                <p><strong>Aucune équipe configurée n'a de membre rattaché.</strong></p>
                <p>Équipes vues dans le CSV congés : <code>${knownInData.map(esc).join('</code>, <code>')}</code></p>
                <p class="text-xs text-muted">Renomme côté Settings → Équipes ou côté CSV pour aligner.</p>
            </div>`
            : '<p class="text-muted text-sm">Ajoutez des membres aux équipes (ou importez le CSV congés) pour configurer la rotation.</p>';
    }

    const snapshotBanner = _usingSnapshot
        ? `<div class="rot-snapshot-banner">👥 Membres du <strong>snapshot PI ${esc(String(_sp || curPiNum))}</strong> (figés à l'import CSV). <span class="text-muted">Le turnover d'autres PI n'affecte pas cette vue.</span></div>`
        : '';
    return snapshotBanner + (panels || emptyHint);
}

/** Rend le panneau d'une équipe avec sa grille membre×semaine. Le switch PI sélectionne
 *  UN seul PI à la fois (courant OU suivant), pas la concaténation.
 *  Les semaines sont recalculées selon le mode équipe (friday par défaut, mercredi pour certaines). */
function _rotTeamPanelHtml(teamName, teamColor, teamSupport, teamMembers, absences,
                            _ignoredCurWeeks, _ignoredNextWeeks, showNext, today, curPiNum, _ignoredNextPiNum) {
    const collapsed  = _rotIsCollapsed(teamName);
    const mpw        = parseInt(localStorage.getItem(`rot-mpw-${teamName}`)) || 2;
    // Recalcul des semaines selon le mode de l'équipe ET l'offset PI sélectionné
    const { selectedWeeks, selectedPiNum } = _rotBuildPiWeeks(teamName);
    const allWeeks   = selectedWeeks;
    const panelPiNum = selectedPiNum;

    // Compte UNIQUEMENT les membres qui ont une ligne dans la grille. Une rotation déjà
    // en base peut contenir un nom hors roster du PI affiché (turnover, ou — avant le fix —
    // équipe aspirée par l'ancien matching par sous-chaîne : "O" ⊂ "Fuego") : le compter
    // affichait "3/3" sur une semaine où l'œil ne voit que 2 personnes. L'écart se lit
    // maintenant directement dans le total (2/3 en orange → relancer le Shuffle).
    const _rosterSet = new Set(teamMembers);
    const _weekCount = (w) => {
        const e = teamSupport.find(s => s.weekStart === w.weekStart);
        return (e?.members || []).filter(m => _rosterSet.has(m)).length;
    };

    // Résumé sur le PI affiché (pas toujours le courant)
    const filledWeeks = allWeeks.filter(w => _weekCount(w) > 0).length;
    const fullWeeks   = allWeeks.filter(w => _weekCount(w) === mpw).length;
    const summaryColor = fullWeeks === allWeeks.length ? 'var(--success)' : filledWeeks > 0 ? 'var(--warning)' : 'var(--danger)';
    const piLabel = panelPiNum ? `PI ${panelPiNum}` : '';
    const activeCount = teamMembers.filter(isMemberSupportActive).length;
    const inactiveCount = teamMembers.length - activeCount;
    const memberSummary = inactiveCount > 0
        ? `${activeCount}/${teamMembers.length} actif${activeCount > 1 ? 's' : ''} <small class="rot-sum-inactive">(${inactiveCount} hors support)</small>`
        : `${teamMembers.length} membre${teamMembers.length > 1 ? 's' : ''}`;
    const summaryHtml = `<span class="rot-sum">${memberSummary}${piLabel ? ` · ${piLabel}` : ''} · <span style="color:${summaryColor}">${filledWeeks}/${allWeeks.length} sem.</span></span>`;

    if (collapsed) {
        return `<div class="rot-panel" id="rot-panel-${esc(teamName)}" data-rot-team="${esc(teamName)}" style="border-left:3px solid ${teamColor}">
            <div class="rot-panel-hdr" data-rot-toggle="${esc(teamName)}">
                <span class="rot-chevron">▶</span>
                <span class="rot-dot" style="background:${teamColor}"></span>
                <span class="rot-name">${esc(teamName)}</span>
                ${summaryHtml}
            </div>
        </div>`;
    }

    // Détermine l'état de verrou d'une semaine
    // - Passé : verrouillé par défaut, déverrouillable exceptionnellement via `unlocked: true`
    // - Futur : déverrouillé par défaut, verrouillable manuellement via `locked: true`
    const _weekLockState = (w) => {
        const entry = teamSupport.find(s => s.weekStart === w.weekStart);
        const isPast = w.weekEnd < today;
        const isManualLocked   = !!entry?.locked;     // verrou manuel (futur)
        const isPastUnlocked   = !!entry?.unlocked;   // déverrou exceptionnel (passé)
        // Verrouillé si : (passé ET non déverrouillé exceptionnellement) OU verrou manuel
        const isLocked = (isPast && !isPastUnlocked) || isManualLocked;
        return { isPast, isManualLocked, isPastUnlocked, isLocked, entry };
    };

    // ── Helpers cellule ────────────────────────────────────────────────────────
    const mkWeekTh = (w, isNext) => {
        const isCur = today >= w.weekStart && today <= w.weekEnd;
        const { isPast, isManualLocked, isPastUnlocked } = _weekLockState(w);
        let lockBtn;
        if (isPast) {
            // Passé : cadenas cliquable pour déverrouiller/reverrouiller exceptionnellement
            lockBtn = `<button class="rot-wk-lock rot-wk-lock--past${isPastUnlocked ? ' is-unlocked' : ''}"
                    data-rot-unlock="${esc(teamName)}" data-week-start="${w.weekStart}" data-week-end="${w.weekEnd}"
                    title="${isPastUnlocked ? 'Semaine passée déverrouillée exceptionnellement — clic pour reverrouiller' : 'Semaine passée verrouillée — clic pour déverrouiller exceptionnellement'}">${isPastUnlocked ? '🔓' : '🔒'}</button>`;
        } else {
            // Futur : verrouillage manuel
            lockBtn = `<button class="rot-wk-lock rot-wk-lock--manual${isManualLocked ? ' is-locked' : ''}"
                    data-rot-lock="${esc(teamName)}" data-week-start="${w.weekStart}" data-week-end="${w.weekEnd}"
                    title="${isManualLocked ? 'Verrouillée manuellement — clic pour déverrouiller' : 'Cliquer pour verrouiller (préservée lors d’un shuffle)'}">${isManualLocked ? '🔒' : '🔓'}</button>`;
        }
        return `<th class="rot-wk-th${isCur ? ' rot-wk-current' : ''}${isNext ? ' rot-wk-next-pi' : ''}${isPast ? ' rot-wk-past' : ''}${isManualLocked ? ' rot-wk-locked' : ''}${isPastUnlocked ? ' rot-wk-unlocked' : ''}">
            <span class="rot-wk-label">${w.label}</span>
            <span class="rot-wk-dates" title="Semaine travaillée du ${_rotFmtShort(_rotFirstWorkday(w.weekStart))} au ${_rotFmtShort(_rotLastWorkday(w.weekStart))}">${_rotFmtShort(_rotFirstWorkday(w.weekStart))}</span>
            ${lockBtn}
        </th>`;
    };

    const mkCell = (w, member, isNext) => {
        const entry   = teamSupport.find(s => s.weekStart === w.weekStart);
        const sel     = entry && (entry.members || []).includes(member);
        const absDays = _rotAbsDays(member, w.weekStart, w.weekEnd, absences);
        const absent  = absDays >= 2.5;
        const partial = absDays > 0 && !absent;
        const isCur   = today >= w.weekStart && today <= w.weekEnd;
        const { isLocked, isPast } = _weekLockState(w);
        const cls = [
            'rot-cell',
            absent  ? 'rot-cell-absent'  : '',
            partial ? 'rot-cell-partial' : '',
            isCur   ? 'rot-cell-current' : '',
            isNext  ? 'rot-cell-next-pi' : '',
            isLocked ? 'rot-cell-locked' : '',
        ].filter(Boolean).join(' ');
        // Semaine verrouillée (passée ou manuelle) → cellule non éditable
        const lockTitle = isPast ? 'Semaine passée — verrouillée' : 'Semaine verrouillée';
        const days = sel ? supportDaysForMember(entry, member) : [];
        const wd = supportWorkingDays(w.weekStart);
        const strip = wd.map(d => {
            const on  = days.includes(d.index);
            const abs = supportAbsenceDayLevel(member, d.iso, absences);
            const absCls = abs ? ` rot-day-abs-${abs}` : '';
            const absTitle = abs === 'full' ? ' (absent)' : abs === 'half' ? ' (½j congé)' : '';
            return `<button class="rot-day${on ? ' on' : ''}${absCls}${isLocked ? ' rot-day-locked' : ''}"
                ${isLocked ? `disabled title="${lockTitle}"` : `title="${d.letter}${absTitle} — clic: ce jour · double-clic: toute la semaine"`}
                data-rot-day="${esc(teamName)}"
                data-member="${esc(member)}"
                data-day-index="${d.index}"
                data-week-start="${w.weekStart}"
                data-week-end="${w.weekEnd}"
                data-week-label="${w.label}"
            >${d.letter}</button>`;
        }).join('');
        return `<td class="${cls}">
            <span class="rot-strip">${strip}</span>
        </td>`;
    };

    const mkCountCell = (w, isNext) => {
        const cnt   = _weekCount(w);
        const isCur = today >= w.weekStart && today <= w.weekEnd;
        const cls   = cnt === mpw ? 'rot-count-ok' : cnt > 0 ? 'rot-count-partial' : '';
        return `<td class="rot-cell rot-count-cell ${cls}${isCur ? ' rot-cell-current' : ''}${isNext ? ' rot-cell-next-pi' : ''}">${cnt}/${mpw}</td>`;
    };

    // ── En-têtes : un seul PI affiché (déterminé par le switch) ──────────────
    const piHeader = panelPiNum ? `PI ${panelPiNum}` : (showNext ? 'PI suivant' : 'PI courant');
    const piGroupRow = `<tr>
        <th class="rot-member-th" rowspan="2">Membre</th>
        <th colspan="${allWeeks.length}" class="rot-pi-group-th${showNext ? ' rot-pi-group-next' : ''}">${piHeader}</th>
    </tr>`;
    const weekRow = `<tr>
        ${allWeeks.map(w => mkWeekTh(w, showNext)).join('')}
    </tr>`;

    // ── Lignes membres ─────────────────────────────────────────────────────────
    const memberRows = teamMembers.map(member => {
        const active = isMemberSupportActive(member);
        const toggleLbl = active ? 'Actif support — cliquer pour désactiver' : 'Inactif support — cliquer pour activer';
        return `
        <tr class="${active ? '' : 'rot-row-inactive'}">
            <td class="rot-member-td">
                <button type="button" class="rot-active-toggle${active ? ' is-on' : ''}"
                        data-rot-active="${esc(member)}"
                        title="${toggleLbl}"
                        aria-pressed="${active}">${active ? '🛎️' : '🚫'}</button>
                <span class="rot-member-name${active ? '' : ' is-inactive'}" title="${esc(member)}">${esc(_fmtMemberName(member))}</span>
            </td>
            ${allWeeks.map(w => mkCell(w, member, showNext)).join('')}
        </tr>`;
    }).join('');

    // ── Ligne totaux ───────────────────────────────────────────────────────────
    const countRow = `<tr class="rot-count-row">
        <td class="rot-member-th">Total</td>
        ${allWeeks.map(w => mkCountCell(w, showNext)).join('')}
    </tr>`;

    return `<div class="rot-panel" id="rot-panel-${esc(teamName)}" data-rot-team="${esc(teamName)}" style="border-left:3px solid ${teamColor}">
        <div class="rot-panel-hdr" data-rot-toggle="${esc(teamName)}">
            <span class="rot-chevron">▼</span>
            <span class="rot-dot" style="background:${teamColor}"></span>
            <span class="rot-name">${esc(teamName)}</span>
            ${summaryHtml}
            <div class="rot-panel-actions" onclick="event.stopPropagation()">
                <label class="text-xs text-muted rot-mpw-label">Eff./sem
                    <input type="number" class="input rot-mpw-input" min="1" max="10" value="${mpw}"
                        data-rot-mpw="${esc(teamName)}">
                </label>
                <label class="text-xs text-muted rot-mpw-label" title="Jour de début de chaque semaine support">Semaine
                    <select class="select select-sm rot-mode-select" data-rot-mode="${esc(teamName)}">
                        ${Object.entries(SUPPORT_WEEK_MODES).map(([k, v]) =>
                            `<option value="${k}"${k === getSupportWeekMode(teamName) ? ' selected' : ''}>${v.label}</option>`
                        ).join('')}
                    </select>
                </label>
                <button class="btn btn-sm btn-secondary rot-btn" data-rot-copy="${esc(teamName)}" title="Copier un message de rotation prêt à coller. Clic droit = personnaliser le libellé.">📋 Copier</button>
                ${api.getSlackWebhook() ? `<button class="btn btn-sm btn-secondary rot-btn" data-rot-slack="${esc(teamName)}" title="Envoyer la rotation dans Slack">💬 Slack</button>` : ''}
                <button class="btn btn-sm btn-secondary rot-btn" data-rot-shuffle="${esc(teamName)}" title="Générer automatiquement en respectant les congés">🎲 Shuffle</button>
                <button class="btn btn-sm btn-danger rot-btn" data-rot-clear="${esc(teamName)}" title="Effacer la rotation de cette équipe">✕</button>
            </div>
        </div>
        <div class="rot-panel-body">
            <div class="table-wrap">
                <table class="rot-grid">
                    <thead>${piGroupRow}${weekRow}</thead>
                    <tbody>
                        ${memberRows}
                        ${countRow}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}


export {
    _rotRefreshPanels, _rotWirePanelEvents, _rotPanelsHtml, _rotBuildPiWeeks, _rotSetCollapsed, _shuffleOneTeam, _jiraSprint1Start,
};
