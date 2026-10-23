/**
 * Paramètres → Rotation Support : grille par équipe (settings-rotation.js), rotation
 * mutualisée (settings-rotation-pool.js), affectation rapide et tirage de groupe.
 */

import { poolSectionHtml, wirePoolSection } from './settings-rotation-pool.js';
import { esc, toast, getSupportWeekMode } from '../utils.js';
import { _rotToolbarHtml, _rotSupportHidden, _rotPanelsHtml, _rotWirePanelEvents, _rotWireToolbar, _rotBuildPiWeeks, _rotRefreshPanels, _shuffleOneTeam } from './settings-rotation.js';
import { makePersonPicker } from '../components/modal.js';
import { store } from '../state.js';
import * as api from '../api.js';

/** Section « Rotation Support ». */
export function rotationSectionHtml(ctx) {
    const { support, selGroup, rotTeamNames, teams, rotMembers, absences } = ctx;
    return `
        <!-- ═══ Support Rotation ═══ -->
        <div class="settings-section settings-section--wide settings-section--rotation collapsed" id="section-rotation">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Rotation Support (${support.length} semaines)</h3><p>Grille par équipe — cliquez pour affecter les membres semaine par semaine</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">

                <!-- Affectation rapide — placée en haut pour que le picker déborde librement -->
                <div class="flex items-center justify-between mb-2">
                    <h4 class="text-sm font-semibold" style="margin:0">Affecter rapidement des membres à une semaine</h4>
                    <button type="button" class="btn btn-sm btn-secondary" id="btn-sup-io">🔄 Import / Export</button>
                </div>
                <div class="sup-add-card">
                    <div class="sup-add-members">
                        <label class="label">Membres <span class="sup-add-team-badge" id="sup-team-badge" hidden></span></label>
                        <div class="sup-member-input-wrap" id="sup-member-wrap">
                            <div class="sup-member-chips" id="sup-member-chips"></div>
                            <button type="button" class="sup-member-add-btn" id="sup-member-add">+ Ajouter</button>
                        </div>
                        <span class="sup-add-hint">L'entrée sera rattachée à l'équipe du 1er membre. Tous les membres restent disponibles.</span>
                    </div>
                    <div class="sup-add-grid">
                        <div class="sup-add-field">
                            <label class="label">Semaine</label>
                            <select class="select" id="sup-week" disabled>
                                <option value="">Ajoutez d'abord un membre</option>
                            </select>
                        </div>
                        <div class="sup-add-field sup-add-field--sm">
                            <label class="label">Dates</label>
                            <span class="sup-add-dates" id="sup-dates">—</span>
                        </div>
                        <div class="sup-add-field sup-add-field--xs">
                            <label class="label">Eff./sem</label>
                            <input class="input" type="number" id="sup-mpw" value="2" min="1" max="10">
                        </div>
                        <div class="sup-add-field sup-add-field--action">
                            <label class="label">&nbsp;</label>
                            <button class="btn btn-primary" id="btn-add-sup">✓ Enregistrer</button>
                        </div>
                    </div>
                </div>

                <hr class="hr-section">

                ${poolSectionHtml()}

                ${selGroup ? `
                <div class="rot-group-bar" id="rot-group-bar">
                    <span class="text-xs text-muted">Groupe <strong>${esc(selGroup.name)}</strong> — ${rotTeamNames.length} équipe${rotTeamNames.length !== 1 ? 's' : ''}</span>
                    <button type="button" class="btn btn-sm btn-secondary" id="btn-shuffle-group"
                            title="Génère automatiquement la rotation pour toutes les équipes du groupe en une seule fois">
                        🎲 Shuffle toutes les équipes du groupe
                    </button>
                </div>
                ` : ''}

                ${_rotToolbarHtml()}

                <!-- Per-team rotation grid panels -->
                <div id="rot-panels" class="mb-4${_rotSupportHidden() ? ' rot-hide-support' : ''}">
                    ${_rotPanelsHtml(rotTeamNames, teams, support, rotMembers, absences)}
                </div>
            </div>
        </div>`;
}

/** Câblage de la Rotation : grille, pool, affectation rapide, tirage de groupe. */
export function wireRotationSection(container, ctx) {
    const { rotMembers } = ctx;
    // ── Rotation grid - délégué à _rotWirePanelEvents ────────────────────────
    _rotWirePanelEvents(container);
    // Barre d'outils (« Congés seuls ») : hors de #rot-panels, donc câblée à part — les
    // re-renders de la grille ne doivent pas la re-câbler (listeners empilés).
    _rotWireToolbar(container);
    // Rotation mutualisée : carte autonome, elle aussi hors de #rot-panels
    wirePoolSection(container);

    // ── Support - affectation rapide (équipe déduite du 1er membre) ───────────
    const _supMembers = [];          // noms des membres sélectionnés (chips)
    let   _supTeam    = null;         // équipe déduite (verrouillée par le 1er membre)

    const _norm = s => (s || '').toLowerCase().trim();

    const _supRenderChips = () => {
        const box = container.querySelector('#sup-member-chips');
        if (!box) return;
        box.innerHTML = _supMembers.map(m => `
            <span class="sup-member-chip">
                ${esc(m)}
                <button class="sup-member-chip-rm" data-rm="${esc(m)}" title="Retirer">×</button>
            </span>`).join('');
        box.querySelectorAll('.sup-member-chip-rm').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = _supMembers.indexOf(btn.dataset.rm);
                if (i >= 0) _supMembers.splice(i, 1);
                if (!_supMembers.length) _supTeam = null;  // libère l'équipe si plus de membre
                _supSync();
            });
        });
    };

    // Affiche le badge équipe déduite
    const _supRenderTeamBadge = () => {
        const badge = container.querySelector('#sup-team-badge');
        if (!badge) return;
        if (_supTeam) { badge.textContent = `· ${_supTeam}`; badge.hidden = false; }
        else { badge.hidden = true; }
    };

    // Peuple le sélecteur de semaines (PI précédent + courant + suivant) pour l'équipe déduite.
    const _supRefreshWeeks = () => {
        const sel  = container.querySelector('#sup-week');
        const datesEl = container.querySelector('#sup-dates');
        if (!sel) return;
        if (!_supTeam) {
            sel.disabled = true;
            sel.innerHTML = `<option value="">Ajoutez d'abord un membre</option>`;
            if (datesEl) datesEl.textContent = '—';
            return;
        }
        const built = (() => { try { return _rotBuildPiWeeks(_supTeam); } catch { return {}; } })();
        const curWeeks  = built.selectedWeeks || built.curWeeks || [];
        const nextWeeks = built.nextWeeks || [];
        const curPi     = built.selectedPiNum || built.curPiNum;

        const _addD = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
        const _piSpan = curWeeks.length ? (() => {
            const first = curWeeks[0].weekStart, last = curWeeks[curWeeks.length-1].weekEnd;
            return Math.round((new Date(last+'T00:00:00') - new Date(first+'T00:00:00')) / 86400000) + 1;
        })() : 0;
        const prevWeeks = (curPi && _piSpan && curWeeks.length) ? curWeeks.map(w => ({
            label: w.label.replace(new RegExp(`^${curPi}\\.`), `${curPi - 1}.`),
            weekStart: _addD(w.weekStart, -_piSpan),
            weekEnd:   _addD(w.weekEnd, -_piSpan),
        })) : [];

        const all = [...prevWeeks, ...curWeeks, ...nextWeeks];
        const seen = new Set();
        const uniqueWeeks = all.filter(w => { if (seen.has(w.weekStart)) return false; seen.add(w.weekStart); return true; })
                               .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

        const today = new Date().toISOString().slice(0, 10);
        const _fmtD = iso => { const [, m, d] = iso.split('-'); const mn = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']; return `${parseInt(d)} ${mn[parseInt(m)-1]}`; };
        sel.disabled = false;
        sel.innerHTML = `<option value="">— choisir une semaine —</option>` + uniqueWeeks.map(w => {
            const isPast = w.weekEnd < today;
            const isCur  = w.weekStart <= today && w.weekEnd >= today;
            const tag = isCur ? ' ⏺' : isPast ? ' ✓' : '';
            return `<option value="${w.weekStart}" data-end="${w.weekEnd}" data-label="${esc(w.label)}">${esc(w.label)} — ${_fmtD(w.weekStart)}${tag}</option>`;
        }).join('');
        const curOpt = uniqueWeeks.find(w => w.weekStart <= today && w.weekEnd >= today);
        if (curOpt) { sel.value = curOpt.weekStart; sel.dispatchEvent(new Event('change')); }
        else if (datesEl) datesEl.textContent = '—';
    };

    // Resync complet de l'UI (chips, badge, semaines)
    const _supSync = () => { _supRenderChips(); _supRenderTeamBadge(); _supRefreshWeeks(); };

    // Affiche les dates au choix d'une semaine
    container.querySelector('#sup-week')?.addEventListener('change', e => {
        const opt = e.target.selectedOptions[0];
        const datesEl = container.querySelector('#sup-dates');
        if (!opt?.value) { if (datesEl) datesEl.textContent = '—'; return; }
        const _fmtD = iso => { const [, m, d] = iso.split('-'); return `${parseInt(d)}/${m}`; };
        if (datesEl) datesEl.textContent = `${_fmtD(opt.value)} → ${_fmtD(opt.dataset.end)}`;
    });

    // Ajoute un membre — l'équipe de l'entrée est déduite du 1er membre, sans rejeter les autres.
    const _supAddMember = (name) => {
        if (!name) return;
        const member = rotMembers.find(m => _norm(m.name) === _norm(name));
        if (!member) return;
        if (_supMembers.includes(member.name)) return;
        if (!_supTeam) _supTeam = member.team;   // équipe de l'entrée = celle du 1er membre
        _supMembers.push(member.name);
        _supSync();
    };

    // Bouton "+ Ajouter" → ouvre le même person picker que la modal ticket (reporter/contributors).
    // Attaché au body en position fixed pour échapper à l'overflow:hidden de la section.
    // Après chaque ajout, le picker se rouvre pour enchaîner la saisie des membres suivants.
    const supAddBtn = container.querySelector('#sup-member-add');
    const _openSupPicker = () => {
        if (document.querySelector('.sup-member-picker')) return;
        // Pool : TOUS les membres (pas de filtre par équipe), équipe affichée en badge.
        const pool = rotMembers
            .filter(m => !_supMembers.includes(m.name))
            .map(m => ({ name: m.name, sub: m.team || '' }));
        if (!pool.length) { toast('Tous les membres sont déjà ajoutés', 'info'); return; }
        const onCommit = (name) => {
            cleanup();
            _supAddMember(name);
            // Rouvre le picker pour enchaîner — focus immédiat sur la recherche
            requestAnimationFrame(() => _openSupPicker());
        };
        const onCancel = () => { cleanup(); };
        const { wrap, input } = makePersonPicker(pool, '', onCommit, onCancel);
        wrap.classList.add('person-picker--no-clear', 'sup-member-picker');
        // Positionne en fixed sous le bouton
        const r = supAddBtn.getBoundingClientRect();
        wrap.style.position = 'fixed';
        wrap.style.top  = `${r.bottom + 4}px`;
        wrap.style.left = `${r.left}px`;
        document.body.appendChild(wrap);
        supAddBtn.hidden = true;
        requestAnimationFrame(() => input.focus());
        const onDocClick = (ev) => { if (!wrap.contains(ev.target) && ev.target !== supAddBtn) onCancel(); };
        const cleanup = () => {
            wrap.remove();
            supAddBtn.hidden = false;
            document.removeEventListener('mousedown', onDocClick, true);
        };
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    };
    supAddBtn?.addEventListener('click', _openSupPicker);

    container.querySelector('#btn-add-sup')?.addEventListener('click', async () => {
        const weekSel = container.querySelector('#sup-week');
        const opt    = weekSel?.selectedOptions[0];
        const mpw    = parseInt(container.querySelector('#sup-mpw')?.value) || 2;
        if (!_supMembers.length) { toast('Ajoutez au moins un membre', 'warning'); return; }
        if (!opt?.value)         { toast('Choisissez une semaine', 'warning'); return; }
        const team  = _supTeam;
        const start = opt.value;
        const end   = opt.dataset.end;
        const label = opt.dataset.label;
        try {
            // Fusion si la semaine existe déjà
            const existing = (store.get('support') || []).find(s =>
                _norm(s.team) === _norm(team) && s.weekStart === start);
            if (existing) {
                const merged = [...new Set([...(existing.members || []), ..._supMembers])];
                await api.updateSupport(existing.id, { members: merged });
                toast(`${label} mis à jour — ${merged.length} membre${merged.length > 1 ? 's' : ''}`, 'success');
            } else {
                await api.createSupport({ team, weekLabel: label, weekStart: start, weekEnd: end, members: [..._supMembers], weekMode: getSupportWeekMode(team), membersPerWeek: mpw });
                toast(`${label} — ${_supMembers.length} membre${_supMembers.length > 1 ? 's' : ''} affecté${_supMembers.length > 1 ? 's' : ''}`, 'success');
            }
            // Reset complet
            _supMembers.length = 0;
            _supTeam = null;
            _supSync();
            await _rotRefreshPanels(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelector('#btn-shuffle-group')?.addEventListener('click', async () => {
        const btn        = container.querySelector('#btn-shuffle-group');
        const selGroupId = store.get('group') || null;
        const selGroup   = selGroupId ? (store.get('groups') || []).find(g => g.id === selGroupId) : null;
        const allTeams   = store.get('teams') || [];
        const teamsInGrp = (selGroup?.teams?.length)
            ? allTeams.filter(t => selGroup.teams.includes(t))
            : [];
        if (!teamsInGrp.length) { toast('Aucune équipe dans ce groupe', 'warning'); return; }

        if (btn) { btn.disabled = true; btn.textContent = '⏳ Génération…'; }
        let ok = 0, skipped = 0, totalPreserved = 0;
        for (const teamName of teamsInGrp) {
            try {
                const result = await _shuffleOneTeam(teamName);
                if (result.ok) { ok++; totalPreserved += result.preserved || 0; }
                else           { skipped++; toast(`${teamName} : ${result.reason}`, 'warning'); }
            } catch (e) { skipped++; toast(`${teamName} : ${e.message}`, 'error'); }
        }
        if (btn) { btn.disabled = false; btn.textContent = '🎲 Shuffle toutes les équipes du groupe'; }

        if (ok > 0) {
            const msg = totalPreserved
                ? `Rotation générée pour ${ok} équipe${ok > 1 ? 's' : ''} (${totalPreserved} semaine${totalPreserved > 1 ? 's' : ''} préservée${totalPreserved > 1 ? 's' : ''})`
                : `Rotation générée pour ${ok} équipe${ok > 1 ? 's' : ''}`;
            toast(msg + (skipped ? ` — ${skipped} ignorée${skipped > 1 ? 's' : ''}` : ''), 'success');
            await _rotRefreshPanels(container);
        }
    });
}
