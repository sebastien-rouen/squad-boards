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
import { saveSupportWeekMode } from '../support-week-mode.js';
import {
    esc, toast, copyToClipboard, deriveMembersFromAbsences, generateSupportRotation,
    SUPPORT_WEEK_MODES, getSupportWeekMode, supportWorkingDays, supportWeekHead,
    supportDaysForMember, supportAbsenceDayLevel, isMemberSupportActive, setMemberSupportActive,
    isSupportAbsent,
    promptModal, teamNameMatches, confirmDanger, effectiveRosterForPi,
    supportPoolForTeam, poolQuotaTotal, carrySupportRowsOutside,
} from '../utils.js';
import { loadPiCfg, savePiCfg } from '../utils/pi-config.js';
import { buildPiWeeks, detectSprintsPerPI, jiraSprint1Start, piStartDate, piCongesDiff } from '../utils/pi-weeks.js';
// Blocs extraits (3.162.0) — ce fichier depassait les 800 lignes. Ils restent RE-EXPORTES
// plus bas : la suite de tests et settings.js les importent depuis ici depuis toujours.
import {
    _detectSprintsPerPI, _jiraSprint1Start, _rotBuildPiWeeks, _rotAbsDays,
    _rotFirstWorkday, _rotLastWorkday, _rotFmtShort,
} from './settings-rotation-weeks.js';
import {
    _rotIsCollapsed, _rotSetCollapsed, _rotPiOff,
    _rotSupportHidden, _rotToolbarHtml, _rotWireToolbar,
} from './settings-rotation-display.js';
import { _fmtMemberName, _rotBuildCopyMessage, _sortSupportMembers } from './settings-rotation-message.js';

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
    // épinglé. Ne jamais retomber sur curWeeks/nextWeeks : nextWeeks ne connaît que
    // PI+1 (un offset de +2 visait le mauvais PI) et hérite du nombre de sprints du PI
    // courant (PI 30 à 6 sprints → PI 31 à 5 : 12 semaines au lieu de 10).
    // Historique (3.141.x → 3.162.0) : la branche PI épinglé de buildPiWeeks gardait la
    // date JIRA brute du sprint <PI>.1 quand buildSupportPiWeeks snappait celle du PI
    // courant ; le shuffle écrivait sur des `weekStart` que la grille n'affichait jamais
    // (« le Shuffle ne fait rien »), et le mode « Jeu → Mer » restait sans effet sur un
    // PI épinglé. Depuis 3.162.1 les deux branches passent par snapToWeekMode — la
    // grille apparie toujours strictement sur `s.weekStart === w.weekStart`.
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
    // `bulk` purge TOUTES les lignes de l'équipe avant d'insérer : sans ce report, un
    // shuffle sur le PI 31 effaçait la rotation du PI 30 (invisible, la grille n'affiche
    // qu'un PI à la fois).
    const carry = carrySupportRowsOutside(existingSupport, teamName, weeks);
    await api.bulkCreateSupport(teamName, [...carry, ...rotations]);
    return {
        ok: true,
        weeks: weeks.length,
        piNum: selectedPiNum,
        preserved: rotations.filter(r => r._autoLocked || r.locked).length,
    };
}

/**
 * Câble les pastilles jour d'un SOUS-ARBRE (clic = un jour, double-clic = la semaine,
 * ← / → et Maj+Espace au clavier), et appelle `onSaved()` après chaque écriture.
 *
 * Le sous-arbre est un paramètre parce que la vue « par poste » de la rotation mutualisée
 * rend les mêmes `rot-strip` hors de `#rot-panels` : recâbler tout le conteneur y aurait
 * ajouté un SECOND écouteur sur chaque pastille de la grille — un clic aurait basculé
 * le jour deux fois, donc rien.
 *
 * @param {Element} root      sous-arbre à câbler
 * @param {Function} onSaved  rafraîchissement après écriture (async)
 */
function _rotWireDayCells(root, onSaved) {
    // Toggle jour de support d'un membre (mini-strip).
    // Clic simple = un jour ; double-clic = toute la semaine (remplit/vide).
    root.querySelectorAll('[data-rot-day]:not([disabled])').forEach(btn => {

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
                await onSaved();
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

    // ── Raccourcis clavier sur les pastilles jour ─────────────────────────────
    // ← / → : déplace le focus vers le jour précédent/suivant dans la même ligne.
    // Shift+Espace : toggle toute la semaine (équivalent double-clic).
    root.querySelectorAll('[data-rot-day]:not([disabled])').forEach(btn => {
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
}

/** Câble tous les handlers data-rot-* sur les panneaux dans container */
function _rotWirePanelEvents(container) {
    // ── Recalage du PI sur les dates des Congés (et retour arrière) ───────────
    container.querySelector('#rot-recal-conges')?.addEventListener('click', async () => {
        const piNum = parseInt(container.querySelector('#rot-recal-conges')?.dataset.pi) || 0;
        const cfg = loadPiCfg(piNum);
        if (!piNum || !cfg) return;
        // Les rotations enregistrées sont appariées sur weekStart : on annonce combien
        // décrocheront de la grille après recalage (elles restent en base, jamais supprimées).
        const avant = new Set((_rotBuildPiWeeks().selectedWeeks || []).map(w => w.weekStart));
        const impactees = (store.get('support') || []).filter(s => avant.has(s.weekStart) && (s.members || []).length);
        const lignes = [
            `Début du PI : ${_rotFmtShort(piStartDate(store.get('sprintInfo'), piNum))} → ${_rotFmtShort(cfg.startDateFromCsv)}`,
            cfg.sprintsPerPIFromCsv ? `Itérations : ${cfg.sprintsPerPIFromCsv}` : '',
            impactees.length
                ? `⚠ ${impactees.length} semaine(s) déjà remplie(s) ne seront plus alignées sur la grille — relancer un Shuffle après recalage (rien n'est supprimé).`
                : 'Aucune rotation enregistrée sur ce PI : recalage sans effet de bord.',
        ].filter(Boolean).join('\n');
        if (!(await confirmDanger(`Recaler le PI ${piNum} sur les Congés`, lignes,
            { confirmLabel: 'Recaler', danger: impactees.length > 0 }))) return;
        savePiCfg(piNum, {
            startDate: cfg.startDateFromCsv,
            ...(cfg.sprintsPerPIFromCsv ? { sprintsPerPI: cfg.sprintsPerPIFromCsv } : {}),
        }, { manual: true });
        toast(`PI ${piNum} calé sur les Congés — début ${_rotFmtShort(cfg.startDateFromCsv)}`, 'success');
        _rotRenderPanels(container, store.get('support') || []);
    });

    container.querySelector('#rot-recal-jira')?.addEventListener('click', async () => {
        const piNum = parseInt(container.querySelector('#rot-recal-jira')?.dataset.pi) || 0;
        const cfg = loadPiCfg(piNum);
        if (!piNum || !cfg) return;
        if (!(await confirmDanger(`Revenir aux dates JIRA pour le PI ${piNum}`,
            `Les semaines repartiront de la date du sprint ${piNum}.1 dans JIRA.\nLes rotations enregistrées ne sont pas modifiées.`,
            { confirmLabel: 'Revenir à JIRA' }))) return;
        const manual = { ...(cfg.manual || {}) };
        delete manual.startDate;
        delete manual.sprintsPerPI;
        savePiCfg(piNum, { manual });
        toast(`PI ${piNum} : dates JIRA rétablies`, 'info');
        _rotRenderPanels(container, store.get('support') || []);
    });
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
            // En base (partagé entre navigateurs) ; le store est à jour avant le re-rendu
            saveSupportWeekMode(sel.dataset.rotMode, sel.value).catch(e => toast(`Mode de semaine non enregistré : ${e.message}`, 'error'));
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

    // Pastilles jour : câblage partagé avec la vue « par poste » du pool.
    _rotWireDayCells(container, () => _rotRefreshPanels(container));

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

    // ── Copier un message de rotation (Slack/Teams) ──────────────────────────
    container.querySelectorAll('[data-rot-copy]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const team = btn.dataset.rotCopy;
            const msg  = _rotBuildCopyMessage(team);
            // Même repli que la copie de liste ci-dessous : `navigator.clipboard` est absent
            // hors contexte sécurisé, et l'appeler nu y lève une TypeError non rattrapable.
            copyToClipboard(msg, 'Message de rotation copié');
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

    // Clic sur « N membres » → copie la liste.
    // ⚠️ Ce câblage était imbriqué DANS le forEach des sliders juste en dessous : chaque
    // rôle réattachait un listener à TOUS les compteurs, donc un seul clic déclenchait
    // autant de copies — et autant de toasts — qu'il y a de rôles configurés (23 en prod).
    // Il doit rester en dehors, un listener par élément.
    container.querySelectorAll('.cap-role-count--tip').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const text = el.dataset.copy;
            if (!text) return;
            // `copyToClipboard` (utils) gère le repli execCommand : `navigator.clipboard` est
            // absent hors contexte sécurisé (accès en http par IP LAN), et l'appeler
            // directement y lève une TypeError synchrone qu'aucun .catch() ne rattrape.
            copyToClipboard(text, 'Liste copiée');
        });
    });

    // ── Capacité dev — sliders % par rôle ────────────────────────────────────
    let _roleSaveTimer = null;
    container.querySelectorAll('.cap-role-slider').forEach(slider => {
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

    // ── Bandeau « Recaler ce PI sur les Congés » ─────────────────────────────
    // L'écart est calculé par piCongesDiff (utils/pi-weeks.js), la même source que le
    // récapitulatif multi-PI de « Paramètres → Sprint & PI ». Le recalage reste un geste
    // explicite : `weekStart` est la clé d'appariement des rotations déjà enregistrées.
    // Un écart de date n'en est un que s'il déplacerait une clé pour au moins une des
    // équipes affichées — d'où leurs modes de semaine passés à piCongesDiff.
    const _piAffiche = _sp || curPiNum;
    const _modes = [...new Set(teamNames.map(t => getSupportWeekMode(t)))];
    const _d = piCongesDiff(store.get('sprintInfo'), _piAffiche, store.get('piInfo'), _modes);
    const _recale = _d.cale, _ecartDate = _d.ecartDate, _ecartCnt = _d.ecartCnt;
    const _startUtil = _d.startUsed, _sprintsUtil = _d.sprintsUsed;
    let congesBanner = '';
    if (_recale) {
        congesBanner = `<div class="rot-conges-banner rot-conges-banner--on">
            📅 <strong>PI ${esc(String(_piAffiche))}</strong> calé sur les <strong>Congés</strong> — début ${_rotFmtShort(_d.startCsv)}.
            <button type="button" class="btn btn-xs btn-secondary" id="rot-recal-jira" data-pi="${esc(String(_piAffiche))}"
                    title="Revenir à la date du sprint .1 dans JIRA">↩ Revenir aux dates JIRA</button>
        </div>`;
    } else if (_ecartDate || _ecartCnt) {
        const details = [
            _ecartDate ? `début <strong>${_rotFmtShort(_d.startCsv)}</strong> <span class="text-muted">(grille : ${_rotFmtShort(_startUtil)})</span>` : '',
            _ecartCnt  ? `<strong>${_d.sprintsCsv}</strong> itérations <span class="text-muted">(grille : ${_sprintsUtil})</span>` : '',
        ].filter(Boolean).join(' · ');
        congesBanner = `<div class="rot-conges-banner">
            📅 Les <strong>Congés importés</strong> du PI ${esc(String(_piAffiche))} indiquent ${details}.
            <button type="button" class="btn btn-xs btn-primary" id="rot-recal-conges" data-pi="${esc(String(_piAffiche))}"
                    title="Aligner les semaines de ce PI sur les dates du CSV Congés">Recaler ce PI sur les Congés</button>
        </div>`;
    }
    const snapshotBanner = _usingSnapshot
        ? `<div class="rot-snapshot-banner">👥 Membres du <strong>snapshot PI ${esc(String(_sp || curPiNum))}</strong> (figés à l'import CSV). <span class="text-muted">Le turnover d'autres PI n'affecte pas cette vue.</span></div>`
        : '';
    return congesBanner + snapshotBanner + (panels || emptyHint);
}

/** Rend le panneau d'une équipe avec sa grille membre×semaine. Le switch PI sélectionne
 *  UN seul PI à la fois (courant OU suivant), pas la concaténation.
 *  Les semaines sont recalculées selon le mode équipe (friday par défaut, mercredi pour certaines). */
function _rotTeamPanelHtml(teamName, teamColor, teamSupport, teamMembers, absences,
                            _ignoredCurWeeks, _ignoredNextWeeks, showNext, today, curPiNum, _ignoredNextPiNum) {
    const collapsed  = _rotIsCollapsed(teamName);
    const mpw        = parseInt(localStorage.getItem(`rot-mpw-${teamName}`)) || 2;
    // Rotation mutualisée : l'effectif cible n'est plus celui de l'équipe mais celui du
    // pool. Une équipe peut légitimement ne fournir personne une semaine donnée — afficher
    // « 0/2 » en rouge serait un faux négatif. Cf. settings-rotation-pool.js.
    const poolHit    = supportPoolForTeam(teamName);
    const poolTotal  = poolHit ? poolQuotaTotal(poolHit.pool) : 0;
    // `data-pool-member` sur le panneau : la carte du pool peut masquer les équipes hors
    // pool le temps de relire un aperçu (classe `rot-focus-pool` sur #rot-panels). Purement
    // CSS — rien n'est retiré du rendu, donc rien à reconstruire en sortant du mode.
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
    const summaryColor = (poolHit ? filledWeeks === allWeeks.length : fullWeeks === allWeeks.length)
        ? 'var(--success)' : filledWeeks > 0 ? 'var(--warning)' : 'var(--danger)';
    const piLabel = panelPiNum ? `PI ${panelPiNum}` : '';
    const activeCount = teamMembers.filter(isMemberSupportActive).length;
    const inactiveCount = teamMembers.length - activeCount;
    const memberSummary = inactiveCount > 0
        ? `${activeCount}/${teamMembers.length} actif${activeCount > 1 ? 's' : ''} <small class="rot-sum-inactive">(${inactiveCount} hors support)</small>`
        : `${teamMembers.length} membre${teamMembers.length > 1 ? 's' : ''}`;
    const poolBadge = poolHit
        ? `<span class="rot-pool-badge" title="Rotation mutualisée avec ${esc(poolHit.pool.teams.join(', '))} — ${poolTotal} personnes/semaine sur l'ensemble du pool">⧉ mutualisée</span>`
        : '';
    const summaryHtml = `<span class="rot-sum">${poolBadge}${memberSummary}${piLabel ? ` · ${piLabel}` : ''} · <span style="color:${summaryColor}">${filledWeeks}/${allWeeks.length} sem.</span></span>`;

    if (collapsed) {
        return `<div class="rot-panel" id="rot-panel-${esc(teamName)}" data-rot-team="${esc(teamName)}" data-pool-member="${poolHit ? 1 : 0}" style="border-left:3px solid ${teamColor}">
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
        const wh = supportWeekHead(w);
        return `<th class="rot-wk-th${isCur ? ' rot-wk-current' : ''}${isNext ? ' rot-wk-next-pi' : ''}${isPast ? ' rot-wk-past' : ''}${isManualLocked ? ' rot-wk-locked' : ''}${isPastUnlocked ? ' rot-wk-unlocked' : ''}${wh.cls}">
            <span class="rot-wk-label"${wh.title ? ` title="${wh.title}"` : ''}>${wh.text}</span>
            <span class="rot-wk-dates" title="Semaine travaillée du ${_rotFmtShort(_rotFirstWorkday(w.weekStart))} au ${_rotFmtShort(_rotLastWorkday(w.weekStart))}">${_rotFmtShort(_rotFirstWorkday(w.weekStart))}</span>
            ${lockBtn}
        </th>`;
    };

    const mkCell = (w, member, isNext) => {
        const entry   = teamSupport.find(s => s.weekStart === w.weekStart);
        const sel     = entry && (entry.members || []).includes(member);
        const absDays = _rotAbsDays(member, w.weekStart, w.weekEnd, absences);
        const absent  = isSupportAbsent(absDays);   // même seuil que le tirage (règle n°1)
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
        const base  = `rot-cell rot-count-cell${isCur ? ' rot-cell-current' : ''}${isNext ? ' rot-cell-next-pi' : ''}`;
        if (poolHit) {
            return `<td class="${base} rot-count-pool" title="Rotation mutualisée (${esc(poolHit.pool.teams.join(', '))}) — cible de ${poolTotal}/semaine sur l'ensemble du pool, pas par équipe">⧉ ${cnt}</td>`;
        }
        const cls = cnt === mpw ? 'rot-count-ok' : cnt > 0 ? 'rot-count-partial' : '';
        return `<td class="${base} ${cls}">${cnt}/${mpw}</td>`;
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

    return `<div class="rot-panel" id="rot-panel-${esc(teamName)}" data-rot-team="${esc(teamName)}" data-pool-member="${poolHit ? 1 : 0}" style="border-left:3px solid ${teamColor}">
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
    _rotRefreshPanels, _rotRenderPanels, _rotWirePanelEvents, _rotPanelsHtml, _rotBuildPiWeeks,
    _rotSetCollapsed, _shuffleOneTeam, _jiraSprint1Start,
    _rotToolbarHtml, _rotWireToolbar, _rotSupportHidden, _rotWireDayCells,
    // Exposés pour la suite de tests (tests/rotation.test.mjs) : sans eux, il fallait
    // fabriquer une copie « sonde » du module à chaque exécution.
    _detectSprintsPerPI, _rotFirstWorkday,
};


