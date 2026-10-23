/**
 * 📅 Outils de la modale semaine : sélecteur d'équipes (popover), messages Slack du jour / de la semaine, câblage des contrôles.
 *
 * Extrait de cal_banner.js (3.254.0) — code déplacé à l'identique. Dépendances CIRCULAIRES vers cal_banner.js
 * assumées : jamais utilisées au niveau racine du module (seulement dans des fonctions / écouteurs).
 */
import { store } from '../state.js';
import { esc, toast, supportMembersOnDay, previousWorkingDayIso, copySlack } from '../utils.js';
import { _mondayOf } from './cal_week_modal.js';
import { _closeWeekModal, _dayKey, _eventCoversDay, _extractVisioLink, _h, _isHalfOff, _isOff, _syncCalendarsFromModal } from './cal_banner.js';

// ── Picker équipes dans le header de la modal (toggle + popover) ──────────
// Permet de filtrer dynamiquement les events affichés par équipe(s).
// Set vide = "Toutes" (montre tout, comportement par défaut).
export function _renderTeamPickerToggle(teamSelection) {
    const n = teamSelection.size;
    const labelTxt = n === 0 ? 'Toutes équipes'
                   : n === 1 ? [...teamSelection][0]
                   : `${n} équipes`;
    const activeCls = n > 0 ? ' is-active' : '';
    return `
        <div class="cal-week-team-picker-wrap">
            <button aria-label="Filtrer par équipe(s)" class="btn-icon cal-week-team-toggle${activeCls}" id="cal-week-team-toggle"
                    title="Filtrer par équipe(s)" aria-haspopup="true" aria-expanded="false">
                <span class="cal-week-team-toggle-icon">👥</span>
                <span class="cal-week-team-toggle-lbl">${esc(labelTxt)}</span>
                ${n > 0 ? `<span class="cal-week-team-toggle-count">${n}</span>` : ''}
            </button>
        </div>`;
}

export function _wireTeamPickerPopover(overlay, currentSelection, onChange) {
    const toggle = overlay.querySelector('#cal-week-team-toggle');
    if (!toggle) return;
    let popover = null;
    let onDocClick = null;

    const close = () => {
        if (!popover) return;
        popover.remove();
        popover = null;
        toggle.setAttribute('aria-expanded', 'false');
        if (onDocClick) document.removeEventListener('mousedown', onDocClick, true);
    };

    const open = () => {
        if (popover) { close(); return; }
        // Sources cumulées pour la liste d'équipes :
        // 1. champ team des calendriers configurés (peut être multi-valeur "A,B")
        // 2. champ team de chaque event (source de vérité du backend, toujours à jour)
        // 3. sélection courante (garantit que l'équipe topbar est toujours listée)
        const teamSet = new Set();
        (store.get('calendars') || []).forEach(c => {
            if (c.team) c.team.split(',').map(s => s.trim()).filter(Boolean).forEach(t => teamSet.add(t));
        });
        (store.get('calendarEvents') || []).forEach(e => {
            if (e.team) e.team.split(',').map(s => s.trim()).filter(Boolean).forEach(t => teamSet.add(t));
        });
        currentSelection.forEach(t => teamSet.add(t));
        const allTeams = [...teamSet].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

        popover = document.createElement('div');
        popover.className = 'cal-week-team-popover';
        popover.innerHTML = `
            <div class="cal-week-team-popover-hdr">Filtrer par équipe(s)</div>
            <div class="cal-week-team-popover-pills">
                <button type="button" class="team-pill${currentSelection.size === 0 ? ' is-active' : ''}" data-team="">Toutes</button>
                ${allTeams.map(t => `<button type="button" class="team-pill${currentSelection.has(t) ? ' is-active' : ''}" data-team="${esc(t)}">${esc(t)}</button>`).join('')}
            </div>
            ${allTeams.length === 0 ? '<p class="cal-week-team-popover-empty">Aucune équipe configurée sur un calendrier ICS.</p>' : ''}
        `;
        // Position absolue sous le toggle (utilise getBoundingClientRect pour ne pas être cropped)
        document.body.appendChild(popover);
        const r = toggle.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.top = `${r.bottom + 6}px`;
        const popW = 280;
        popover.style.left = `${Math.max(8, Math.min(window.innerWidth - popW - 8, r.right - popW))}px`;
        popover.style.zIndex = '10001';
        toggle.setAttribute('aria-expanded', 'true');

        popover.addEventListener('click', e => {
            const pill = e.target.closest('.team-pill');
            if (!pill) return;
            const team = pill.dataset.team;
            const next = new Set(currentSelection);
            if (!team) next.clear(); // "Toutes" → vide
            else if (next.has(team)) next.delete(team);
            else next.add(team);
            currentSelection = next;
            // Re-render local (active/inactive states)
            popover.querySelectorAll('.team-pill').forEach(p => {
                const t = p.dataset.team;
                p.classList.toggle('is-active', t === '' ? next.size === 0 : next.has(t));
            });
            onChange(next);
        });

        onDocClick = (ev) => {
            if (popover && !popover.contains(ev.target) && !toggle.contains(ev.target)) close();
        };
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    };

    toggle.addEventListener('click', (e) => { e.stopPropagation(); open(); });
}

/** Formate un event pour Slack : "  • HH:mm–HH:mm : Titre lien" */
function _fmtEvSlack(ev) {
    const s = new Date(ev.start), e = new Date(ev.end);
    const time = `${_h(s)}-${_h(e)}`;
    // Lien visio (url > location > description) — sinon url générique éventuelle
    const link = _extractVisioLink(ev) || (ev.url && /^https?:\/\//i.test(ev.url) ? ev.url : null);
    return link ? `  • ${time} : ${ev.title} ${link}` : `  • ${time} : ${ev.title}`;
}

/** Extrait le nom depuis un titre OFF : "NOM, Prénom - OFF" → "NOM, Prénom" */
function _nameFromOff(title) {
    return title.replace(/-\s*[^-]*\bOFF\s*$/i, '').trim();
}

/** Libellé de demi-journée OFF : "matin" / "après-midi" si détectable, sinon "½". */
function _halfLabel(title) {
    const t = title || '';
    if (/\b(?:AM|matin)\b/i.test(t)) return 'matin';
    if (/\b(?:PM|après[- ]?midi)\b/i.test(t)) return 'après-midi';
    return '½';
}

/** Construit le message Slack pour un seul jour. */
function _buildDaySlack(evs, day) {
    const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const _fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const regular = evs.filter(e => !_isOff(e.title) && !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
    const offEvs  = evs.filter(e => _isOff(e.title));

    if (!regular.length && !offEvs.length) return '_(Aucun événement)_';

    const dow = (day.getDay() + 6) % 7;
    const lines = [`:date: AGENDA DU JOUR - *${DAY_LABELS[dow]} ${_fmtD(day)}*`, ''];

    const matin = regular.filter(e => new Date(e.start).getHours() < 12);
    const aprem  = regular.filter(e => new Date(e.start).getHours() >= 12);

    if (matin.length) {
        lines.push(':sunrise: Matin');
        matin.forEach(ev => lines.push(_fmtEvSlack(ev)));
        lines.push('');
    }
    if (aprem.length) {
        lines.push(':sunny: Après-midi');
        aprem.forEach(ev => lines.push(_fmtEvSlack(ev)));
        lines.push('');
    }

    // Support du jour — même source que la barre support de la semaine (store 'support'),
    // filtré sur l'équipe sélectionnée. Prénom seul (pas le nom complet). La transition n'est pas
    // déduite des bornes de rotation (weekStart/weekEnd — pas fiable, cf incident précédent) mais
    // en comparant directement les membres du jour copié à ceux de la veille : s'ils diffèrent,
    // affiche "Sortant(s) --> Entrant(s)" plutôt qu'une simple liste.
    const team = store.get('team');
    const _supAllDay = store.get('support') || [];
    const _supForDayKey = k => [...new Set(
        supportMembersOnDay(_supAllDay, k)
            .filter(m => !team || team === 'all' || m.team === team)
            .map(m => m.name)
    )];
    // Noms RH au format "NOM, Prénom" (jamais l'inverse — cf docs/regles-metier.md) : le prénom
    // est ce qui suit la virgule. Fallback sur le 1er mot si jamais un nom sans virgule traîne.
    const _firstName = n => {
        const t = (n || '').trim();
        const after = t.includes(',') ? t.split(',')[1] : t;
        return (after || '').trim().split(/\s+/)[0] || t;
    };
    const dk = _dayKey(day);
    const todaySup = _supForDayKey(dk);
    let supportLine = '';
    if (todaySup.length) {
        // Veille OUVRÉE : un lundi se compare au vendredi (le week-end ne compte personne)
        const prevDk  = previousWorkingDayIso(dk);
        const prevSup = _supForDayKey(prevDk);
        const changed = prevSup.length && (prevSup.length !== todaySup.length || !prevSup.every(m => todaySup.includes(m)));
        supportLine = changed
            ? `${prevSup.map(_firstName).join(', ')} --> ${todaySup.map(_firstName).join(', ')}`
            : todaySup.map(_firstName).join(', ');
    }
    if (supportLine) lines.push(`:shield: Support : ${supportLine}`);

    if (offEvs.length) {
        const names = offEvs.map(ev => {
            const name = _nameFromOff(ev.title);
            return _isHalfOff(ev.title) ? `${name} (${_halfLabel(ev.title)})` : name;
        }).join(', ');
        lines.push(`:beach_with_umbrella: Absents : ${names}`);
    }

    return lines.join('\n').trimEnd();
}

/** Construit le message Slack de la semaine : un bloc par jour (lun→dim). */
function _buildWeekSlack(allEvents, days) {
    const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const _fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const lines = [];

    for (const day of days) {
        const dk = _dayKey(day);
        const allDay = allEvents.filter(e => _eventCoversDay(e, dk));
        const evs    = allDay.filter(e => !_isOff(e.title) && !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
        const offEvs = allDay.filter(e => _isOff(e.title));
        if (!evs.length && !offEvs.length) continue;

        const dow = (day.getDay() + 6) % 7;
        lines.push(`*${DAY_LABELS[dow]} ${_fmtD(day)}*`);

        const matin = evs.filter(e => new Date(e.start).getHours() < 12);
        const aprem  = evs.filter(e => new Date(e.start).getHours() >= 12);

        if (matin.length) {
            lines.push(':sunrise: Matin');
            matin.forEach(ev => lines.push(_fmtEvSlack(ev)));
            lines.push('');
        }
        if (aprem.length) {
            lines.push(':sunny: Après-midi');
            aprem.forEach(ev => lines.push(_fmtEvSlack(ev)));
            lines.push('');
        }
        if (offEvs.length) {
            const names = offEvs.map(ev => _isHalfOff(ev.title) ? `${_nameFromOff(ev.title)} (${_halfLabel(ev.title)})` : _nameFromOff(ev.title)).join(', ');
            lines.push(`:beach_with_umbrella: Absents : ${names}`);
        }
        lines.push('');
    }

    if (!lines.length) return '_(Aucun événement cette semaine)_';
    return lines.join('\n').trimEnd();
}

/** Câble les boutons (close, sync, navigation) après chaque render. */
export function _wireWeekContent(overlay, allEvents, refresh, navigate, resetToToday, togglePmSplit, toggleCompact) {
    overlay.querySelector('#cal-week-close')?.addEventListener('click', _closeWeekModal);
    overlay.querySelector('#cal-week-sync')?.addEventListener('click', _syncCalendarsFromModal);
    overlay.querySelector('#cal-week-prev')?.addEventListener('click', () => navigate(-1));
    overlay.querySelector('#cal-week-next')?.addEventListener('click', () => navigate(+1));
    overlay.querySelector('#cal-week-today')?.addEventListener('click', resetToToday);
    overlay.querySelector('#cal-week-pm-split')?.addEventListener('click', () => togglePmSplit?.());
    overlay.querySelector('#cal-week-compact')?.addEventListener('click', () => toggleCompact?.());

    overlay.querySelectorAll('.cal-day-copy-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const dk = btn.dataset.dk;
            const day = new Date(dk + 'T00:00:00');
            const dayEvs = allEvents.filter(ev => _eventCoversDay(ev, dk));
            const msg = _buildDaySlack(dayEvs, day);
            try {
                if (!await copySlack(msg)) throw new Error('copie');
                btn.textContent = '✓';
                setTimeout(() => { btn.textContent = '📋'; }, 1800);
            } catch {
                toast('Copie impossible', 'error');
            }
        });
    });

    const copyBtn = overlay.querySelector('#cal-week-copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const weekOffset = parseInt(copyBtn.dataset.weekOffset ?? '0', 10);
            const mon = _mondayOf(new Date(), weekOffset);
            const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
            const msg = _buildWeekSlack(allEvents, days);
            try {
                if (!await copySlack(msg)) throw new Error('copie');
                copyBtn.textContent = '✓';
                copyBtn.title = 'Copié !';
                setTimeout(() => { copyBtn.textContent = '📋'; copyBtn.title = 'Copier la semaine (Slack)'; }, 1800);
            } catch {
                toast('Copie impossible', 'error');
            }
        });
    }
}
