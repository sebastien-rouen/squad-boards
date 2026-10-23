/**
 * Paramètres → Sprint & PI : câblage (formulaires sprint / PI, navigation inter-PI,
 * config locale `pi-cfg-<N>`, push JIRA, recalage du N° de PI).
 */

import { store } from '../state.js';
import { loadPiCfg, savePiCfg } from '../utils/pi-config.js';
import { fmtDateFriendly, wireFriendlyDates, toast, confirmDanger } from '../utils.js';
import { _jiraSprint1Start } from './settings-rotation.js';
import { piWorkdays } from './settings-sprint-pi-html.js';
import * as api from '../api.js';

/** Câblage de la section Sprint & PI. */
export function wireSprintPiSection(container, ctx) {
    const { piInfo, sprintInfo } = ctx;
    // ── Sprint ────────────────────────────────────────────────────────────────
    // Helper : remplit le formulaire sprint depuis une pill
    const _fillSprintForm = (pill) => {
        const idx      = parseInt(pill.dataset.sprintIdx);
        const label    = pill.dataset.sprintLabel;
        const track    = container.querySelector('#pi-sprint-track');
        const curIdx   = parseInt(track?.dataset.curIdx ?? '-1');
        const dur      = parseInt(track?.dataset.sprintDur ?? '14');
        const curStart = track?.dataset.curStart;

        // 1. Cherche dans teamSprints un sprint dont le nom contient le label (ex: "29.3")
        const teamSprints = store.get('sprintInfo')?.teamSprints || [];
        const selectedTeam = store.get('team');
        const matchedSprints = teamSprints.filter(s => String(s.name || '').includes(label));
        // Priorité : sprint de l'équipe sélectionnée, sinon le premier disponible
        const real = (selectedTeam && selectedTeam !== 'all'
            ? matchedSprints.find(s => s.team === selectedTeam)
            : null) || matchedSprints[0] || null;

        const nameEl  = container.querySelector('#sprint-form input[name="name"]');
        const startEl = container.querySelector('#sprint-form input[name="startDate"]');
        const endEl   = container.querySelector('#sprint-form input[name="endDate"]');
        const goalEl  = container.querySelector('#sprint-form textarea[name="goal"]');

        if (real) {
            // Données réelles JIRA disponibles
            if (nameEl)  nameEl.value  = real.name || `Sprint #${label}`;
            if (startEl) startEl.value = (real.startDate || '').slice(0, 10);
            if (endEl)   endEl.value   = (real.endDate   || '').slice(0, 10);
            if (goalEl)  goalEl.value  = real.goal || '';
        } else {
            // Calcul par décalage depuis le sprint courant (fallback)
            if (nameEl) nameEl.value = `Sprint #${label}`;
            if (curStart && curIdx >= 0) {
                const offset = idx - curIdx;
                const start  = new Date(curStart + 'T00:00:00');
                start.setDate(start.getDate() + offset * dur);
                const end = new Date(start);
                end.setDate(end.getDate() + dur - 1);
                if (startEl) startEl.value = start.toISOString().slice(0, 10);
                if (endEl)   endEl.value   = end.toISOString().slice(0, 10);
            }
            if (goalEl) goalEl.value = '';
        }

        // Un input.value posé en JS ne déclenche ni 'input' ni 'change' → l'overlay texte
        // .fdate-display (seul élément visible, l'input natif est transparent, cf pi-config.css)
        // reste figé sur l'ancienne date tant qu'on ne force pas ces events (câblés par
        // wireFriendlyDates, appelé plus bas sur ce même container).
        startEl?.dispatchEvent(new Event('input', { bubbles: true }));
        endEl?.dispatchEvent(new Event('input', { bubbles: true }));

        // Badge source dans le header du formulaire
        const hdr = container.querySelector('.sprint-nested-label');
        if (hdr) hdr.textContent = real ? `Sprint ${label}` : `Sprint ${label} (dates estimées)`;

        // Barre de progression du header : recalculée pour le sprint sélectionné (sinon elle
        // reste figée sur le % du sprint actif au chargement de la page, même en pointant sur
        // un autre sprint). Créée à la volée si absente (ex : sprint futur, pas de barre au départ).
        const hdrWrap = container.querySelector('.sprint-nested-hdr');
        if (hdrWrap && startEl?.value && endEl?.value) {
            const startMs = new Date(startEl.value + 'T00:00:00').getTime();
            const endMs   = new Date(endEl.value + 'T23:59:59').getTime();
            const pct = Math.round(Math.max(0, Math.min(1, (Date.now() - startMs) / (endMs - startMs))) * 100);
            let bar   = hdrWrap.querySelector('.sprint-nested-bar');
            let pctEl = hdrWrap.querySelector('.sprint-nested-pct');
            if (!bar) {
                bar = document.createElement('div');
                bar.className = 'sprint-nested-bar';
                bar.innerHTML = '<div class="sprint-nested-fill"></div>';
                hdrWrap.appendChild(bar);
            }
            if (!pctEl) {
                pctEl = document.createElement('span');
                pctEl.className = 'sprint-nested-pct';
                hdrWrap.appendChild(pctEl);
            }
            bar.title = `${pct}% écoulé`;
            bar.querySelector('.sprint-nested-fill').style.width = `${pct}%`;
            pctEl.textContent = `${pct}%`;
        }

        // Marquer ce pill comme sélectionné
        container.querySelectorAll('.pi-sprint-pill[data-sprint-idx]').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');

        // Sync contraintes min/max après remplissage
        if (startEl?.value) endEl && (endEl.min = startEl.value);
        if (endEl?.value)   startEl && (startEl.max = endEl.value);

        container.querySelector('.sprint-nested-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    // ── Sprint pills - clic pour pré-remplir le formulaire sprint ────────────
    container.querySelectorAll('.pi-sprint-pill[data-sprint-idx]').forEach(pill => {
        pill.addEventListener('click', () => _fillSprintForm(pill));
    });

    // ── Contraintes intelligentes dates début / fin ───────────────────────────
    const _syncDateConstraints = () => {
        const startEl = container.querySelector('#spr-start');
        const endEl   = container.querySelector('#spr-end');
        if (!startEl || !endEl) return;
        if (startEl.value) endEl.min = startEl.value;
        if (endEl.value)   startEl.max = endEl.value;
        // Si fin < début, corriger fin = début + durée sprint
        if (startEl.value && endEl.value && endEl.value < startEl.value) {
            const dur = parseInt(container.querySelector('#pi-sprint-track')?.dataset.sprintDur ?? '14');
            const d = new Date(startEl.value + 'T00:00:00');
            d.setDate(d.getDate() + dur - 1);
            endEl.value = d.toISOString().slice(0, 10);
            endEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };
    container.querySelector('#spr-start')?.addEventListener('change', _syncDateConstraints);
    container.querySelector('#spr-end')?.addEventListener('change', _syncDateConstraints);
    // Init contraintes au chargement
    _syncDateConstraints();

    // ── Navigation inter-PI (prev / next) ────────────────────────────────────
    const _switchPiTrack = (displayPiNum, overrideSprintsCnt) => {
        const track = container.querySelector('#pi-sprint-track');
        if (!track) return;
        const sprintsCnt  = overrideSprintsCnt || parseInt(container.querySelector('#pi-form input[name="sprintsPerPI"]')?.value) || piInfo?.sprintsPerPI || 5;
        const basePi      = piInfo?.number || 0;
        const allSprints  = store.get('sprintInfo')?.teamSprints || [];
        const selectedTeam = store.get('team');
        // Filtre par équipe sélectionnée pour le dot hasData et la navigation
        const teamSprints = (selectedTeam && selectedTeam !== 'all')
            ? allSprints.filter(s => s.team === selectedTeam)
            : allSprints;

        const idxMatch = (store.get('sprintInfo')?.name || '').match(/\.(\d+)\s*$/);
        const curIdx   = idxMatch ? parseInt(idxMatch[1]) - 1 : -1;

        track.dataset.displayPi = displayPiNum;
        const sprintDurSwitch = piInfo?.sprintDuration || 14;
        track.innerHTML = [...Array(sprintsCnt)].map((_, i) => {
            const label   = `${displayPiNum}.${i + 1}`;
            const isCur   = displayPiNum === basePi && i === curIdx;
            const isDone  = displayPiNum === basePi && curIdx >= 0 && i < curIdx;
            const isIP    = i === sprintsCnt - 1;
            const hasData = teamSprints.some(s => String(s.name || '').includes(`${displayPiNum}.${i + 1}`));
            const cls     = [isIP ? 'ip' : isCur ? 'current' : isDone ? 'done' : '', hasData ? 'has-data' : ''].filter(Boolean).join(' ');
            const icon    = isCur ? '▶ ' : isDone ? '✓ ' : '';
            // Dates depuis allSprints (non filtré) pour toujours avoir les dates même si l'équipe n'a pas ce sprint
            const ts = allSprints.find(s => String(s.name||'').includes(`${displayPiNum}.${i+1}`) && s.startDate && s.endDate);
            const dates = ts
                ? { from: String(ts.startDate).slice(0,10), to: String(ts.endDate).slice(0,10) }
                : piInfo?.startDate ? (() => { const add=(iso,n)=>{const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};const from=add(piInfo.startDate,i*sprintDurSwitch);return{from,to:add(from,sprintDurSwitch-1)};})() : null;
            const wd     = dates ? piWorkdays(dates.from, dates.to) : null;
            const wdHtml = wd !== null ? `<span class="pi-pill-wd">${wd}j</span>` : '';
            const tip    = `${isIP ? 'IP — ' : ''}Sprint ${label}${hasData ? ' · données disponibles' : ''}${dates ? ` · ${dates.from} → ${dates.to}` : ''}${wd !== null ? ` · ${wd} j ouvrés` : ''}`;
            return `<span class="pi-sprint-pill ${cls}" data-sprint-idx="${i}" data-sprint-label="${label}" data-pi-num="${displayPiNum}" title="${tip}">${icon}${label}${wdHtml}</span>`;
        }).join('');

        track.querySelectorAll('.pi-sprint-pill').forEach(pill => {
            pill.addEventListener('click', () => _fillSprintForm(pill));
        });

        // PIs connus depuis teamSprints + toujours inclure le PI courant configuré (_basePiNum)
        const knownPis = [...new Set([
            ...teamSprints.map(s => { const m = String(s.name||'').match(/\b(\d{2,})\.\d+/); return m ? parseInt(m[1]) : null; }).filter(Boolean),
            ...(_basePiNum ? [_basePiNum] : []),
        ])].sort((a, b) => a - b);

        const prevBtn = container.querySelector('#pi-track-prev');
        const nextBtn = container.querySelector('#pi-track-next');
        if (prevBtn) {
            const prevPi = knownPis.filter(p => p < displayPiNum).slice(-1)[0] || null;
            prevBtn.dataset.pi = prevPi || '';
            prevBtn.disabled = !prevPi;
            prevBtn.innerHTML = prevPi
                ? `<svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="10 4 6 8 10 12"/></svg> PI#${prevPi}`
                : `<svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="10 4 6 8 10 12"/></svg>`;
        }
        if (nextBtn) {
            const nextPi = knownPis.find(p => p > displayPiNum) || null;
            nextBtn.dataset.pi = nextPi || '';
            nextBtn.disabled = !nextPi;
            nextBtn.innerHTML = nextPi
                ? `PI#${nextPi} <svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 4 10 8 6 12"/></svg>`
                : `<svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 4 10 8 6 12"/></svg>`;
        }
    };

    // ── Persistance locale des configs PI : utils/pi-config.js (savePiCfg FUSIONNE) ──

    // Lit les valeurs actuelles des champs PI sous forme d'objet
    const _piFormRead = () => {
        const f = container.querySelector('#pi-form');
        if (!f) return null;
        // Jours PIP : 2 date-pickers → array (ordre chronologique, vides ignorés)
        const pipDates = [
            f.querySelector('[name="pipDate1"]')?.value || '',
            f.querySelector('[name="pipDate2"]')?.value || '',
        ].filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
        return {
            number:        parseInt(f.querySelector('[name="number"]')?.value) || 0,
            name:          f.querySelector('[name="piName"]')?.value || '',
            sprintsPerPI:  parseInt(f.querySelector('[name="sprintsPerPI"]')?.value) || 5,
            sprintDuration:parseInt(f.querySelector('[name="sprintDuration"]')?.value) || 14,
            startDate:     f.querySelector('[name="startDate"]')?.value || '',
            pipDates,
        };
    };

    // Snapshot pour détecter les modifications (chaîne stable)
    const _piFormSnapshot = () => { const v = _piFormRead(); return v ? Object.values(v).join('|') : ''; };
    let _piFormBaseline = _piFormSnapshot();

    // Remplit les champs du formulaire PI depuis un objet config
    const _piFormFill = (cfg) => {
        const f = container.querySelector('#pi-form');
        if (!f || !cfg) return;
        const _set = (name, val) => {
            const el = f.querySelector(`[name="${name}"]`);
            if (el && val != null) {
                el.value = val;
                // Si c'est un champ date "friendly", resynchronise l'overlay texte
                const wrap = el.closest('[data-fdate]');
                if (wrap) {
                    const disp = wrap.querySelector('.fdate-display');
                    if (disp) { const long = fmtDateFriendly(val); disp.textContent = long || disp.dataset.ph || ''; disp.classList.toggle('is-empty', !long); }
                }
            }
        };
        _set('number',         cfg.number ?? '');
        _set('piName',         cfg.name ?? '');
        _set('sprintsPerPI',   cfg.sprintsPerPI ?? '');
        _set('sprintDuration', cfg.sprintDuration ?? '');
        _set('startDate',      cfg.startDate ?? '');
        // PIP : 2 date-pickers friendly
        const pip = Array.isArray(cfg.pipDates) ? cfg.pipDates : [];
        _set('pipDate1', pip[0] || '');
        _set('pipDate2', pip[1] || '');
        const badge   = container.querySelector('.pi-cfg-badge');
        const titleEl = container.querySelector('.pi-cfg-title');
        const meta    = container.querySelector('.pi-cfg-meta');
        if (badge)   badge.textContent = `PI #${cfg.number || '?'}`;
        if (titleEl) titleEl.textContent = cfg.name || `PI#${cfg.number || '?'}`;
        if (meta && cfg.sprintsPerPI && cfg.sprintDuration)
            meta.textContent = `${cfg.sprintsPerPI} sprints · ${cfg.sprintDuration} j · ${cfg.sprintsPerPI * cfg.sprintDuration} j`;
    };

    // Cherche la date de début du sprint 1 d'un PI dans teamSprints
    // Utilise la même regex que _capSprintIdx : /\b\d{2,}\.(\d+)/
    const _findSprint1Start = (piNum) => _jiraSprint1Start(piNum);

    // Compte le nombre de sprints d'un PI depuis teamSprints
    const _detectSprintCount = (piNum) => {
        const all = store.get('sprintInfo')?.teamSprints || [];
        const indices = all
            .map(s => { const mPi = String(s.name||'').match(/\b(\d{2,})\.\d+/); const mIdx = String(s.name||'').match(/\b\d{2,}\.(\d+)/); return (mPi && parseInt(mPi[1]) === piNum && mIdx) ? parseInt(mIdx[1]) : null; })
            .filter(Boolean);
        return indices.length ? Math.max(...indices) : null;
    };

    // Au chargement : initialise la config du PI courant (localStorage + pré-remplissage du champ)
    // Fallback : si piInfo.number non configuré, dérive depuis les teamSprints (PI le plus récent)
    const _allKnownPis = [...new Set((store.get('sprintInfo')?.teamSprints || [])
        .map(s => { const m = String(s.name||'').match(/\b(\d{2,})\.\d+/); return m ? parseInt(m[1]) : null; }).filter(Boolean)
    )].sort((a, b) => a - b);
    const _fromSprint = (() => { const m = String(sprintInfo?.name || '').match(/(\d+)\.\d+/) || String(sprintInfo?.name || '').match(/PI\s*#?\s*(\d+)/i); return m ? parseInt(m[1], 10) : 0; })();
    const _basePiNum = _fromSprint || piInfo?.number || (_allKnownPis.length ? _allKnownPis[_allKnownPis.length - 1] : 0);
    if (_basePiNum) {
        const existing  = loadPiCfg(_basePiNum);
        // JIRA prime toujours (source de vérité) ; localStorage en fallback si JIRA ne sait pas
        const jiraStart = _findSprint1Start(_basePiNum);
        const startDate = jiraStart || piInfo?.startDate || existing?.startDate || '';
        const cfg = existing || {
            number: _basePiNum,
            name: piInfo?.name || '',
            sprintsPerPI: piInfo?.sprintsPerPI || 5,
            sprintDuration: piInfo?.sprintDuration || 14,
            startDate,
        };
        // Toujours mettre à jour la startDate depuis JIRA si disponible
        if (startDate) cfg.startDate = startDate;
        savePiCfg(_basePiNum, cfg);
        // Pré-remplit le champ si vide dans le formulaire
        const dateEl = container.querySelector('#pi-start-date');
        if (dateEl && !dateEl.value && cfg.startDate) {
            dateEl.value = cfg.startDate;
            _piFormBaseline = _piFormSnapshot();
        }
    }

    // Bannière de confirmation inline (non bloquante)
    const _askSavePi = (label, onSave, onDiscard) => {
        container.querySelector('#pi-dirty-banner')?.remove();
        const banner = document.createElement('div');
        banner.id = 'pi-dirty-banner';
        banner.className = 'pi-dirty-banner';
        banner.innerHTML = `
            <span class="pi-dirty-msg">⚠ PI#${label} — modifications non sauvegardées</span>
            <button class="pi-dirty-btn pi-dirty-btn--save" type="button">Sauvegarder</button>
            <button class="pi-dirty-btn pi-dirty-btn--discard" type="button">Ignorer</button>
            <button class="pi-dirty-btn pi-dirty-btn--cancel" type="button">✕</button>
        `;
        container.querySelector('.pi-track-nav')?.insertAdjacentElement('beforebegin', banner);
        banner.querySelector('.pi-dirty-btn--save').addEventListener('click', async () => {
            banner.remove(); await onSave();
        });
        banner.querySelector('.pi-dirty-btn--discard').addEventListener('click', () => {
            banner.remove(); onDiscard();
        });
        banner.querySelector('.pi-dirty-btn--cancel').addEventListener('click', () => {
            banner.remove();
        });
    };

    // Navigation inter-PI avec détection dirty
    const _navToPi = (targetPi) => {
        const track = container.querySelector('#pi-sprint-track');
        const currentPi = parseInt(track?.dataset.displayPi || '0') || _basePiNum;
        const snapshot  = _piFormSnapshot();

        if (snapshot !== _piFormBaseline) {
            _askSavePi(currentPi,
                async () => {
                    // Sauvegarde locale pour ce PI
                    const data = _piFormRead();
                    if (data) savePiCfg(currentPi, data, { manual: true });
                    // Si c'est le PI courant en base, sauvegarde aussi en API
                    if (currentPi === _basePiNum) {
                        try {
                            await api.updatePI({ ...(store.get('piInfo') || {}), ...data, name: data.name });
                            const fresh = await api.getPI(); store.set('piInfo', fresh);
                        } catch {}
                    }
                    _loadPiAndSwitch(targetPi);
                },
                () => _loadPiAndSwitch(targetPi)
            );
        } else {
            _loadPiAndSwitch(targetPi);
        }
    };

    // Charge la config d'un PI (localStorage en priorité) et switch le track
    const _loadPiAndSwitch = (targetPi) => {
        const saved = loadPiCfg(targetPi);
        // JIRA prime toujours sur localStorage pour la startDate (source de vérité des dates réelles)
        const jiraStart    = _findSprint1Start(targetPi);
        const startDate    = jiraStart || saved?.startDate || '';
        const sprintsPerPI = saved?.sprintsPerPI || _detectSprintCount(targetPi) || piInfo?.sprintsPerPI || 5;

        const cfg = saved
            ? { ...saved, startDate, sprintsPerPI }
            : {
                number: targetPi,
                name: targetPi === _basePiNum ? (piInfo?.name || '') : `PI#${targetPi}`,
                sprintsPerPI,
                sprintDuration: piInfo?.sprintDuration || 14,
                startDate,
            };
        _piFormFill(cfg);
        _switchPiTrack(targetPi, cfg.sprintsPerPI);
        _piFormBaseline = _piFormSnapshot();
        // Synchronise le sélecteur PI topbar
        const offset = Math.max(-2, Math.min(2, targetPi - _basePiNum));
        if ((store.get('piOffset') || 0) !== offset) store.set('piOffset', offset);
    };

    container.querySelector('#pi-track-prev')?.addEventListener('click', (e) => {
        const pi = parseInt(e.currentTarget.dataset.pi);
        if (pi) _navToPi(pi);
    });
    container.querySelector('#pi-track-next')?.addEventListener('click', (e) => {
        const pi = parseInt(e.currentTarget.dataset.pi);
        if (pi) _navToPi(pi);
    });

    // Synchronisation topbar → navigation Settings
    // Quand le sélecteur PI topbar change (après le chargement initial), met à jour la nav Settings
    let _piOffsetInitDone = false;
    requestAnimationFrame(() => { _piOffsetInitDone = true; }); // ignore le fire initial
    const _unsubPiOffset = store.on('piOffset', (offset) => {
        if (!_piOffsetInitDone) return; // ignore le déclenchement au chargement
        const track = container.querySelector('#pi-sprint-track');
        if (!track || !container.isConnected) { _unsubPiOffset?.(); return; }
        const targetPi = _basePiNum + (offset || 0);
        const currentDisplayPi = parseInt(track.dataset.displayPi || '0');
        if (targetPi > 0 && targetPi !== currentDisplayPi) {
            _loadPiAndSwitch(targetPi);
        }
    });

    // ── Mise à jour live des pills quand "Sprints / PI" change ───────────────
    container.querySelector('#pi-form input[name="sprintsPerPI"]')?.addEventListener('input', (e) => {
        const newCount = parseInt(e.target.value) || 0;
        if (newCount < 1 || newCount > 10) return;
        const track = container.querySelector('#pi-sprint-track');
        if (!track) return;
        const displayPiNum = parseInt(track.dataset.displayPi) || (piInfo?.number || 0);
        const allSprints   = store.get('sprintInfo')?.teamSprints || [];
        const selectedTeam = store.get('team');
        const teamSprints  = (selectedTeam && selectedTeam !== 'all')
            ? allSprints.filter(s => s.team === selectedTeam)
            : allSprints;
        const idxMatch = (store.get('sprintInfo')?.name || '').match(/\.(\d+)\s*$/);
        const curIdx   = idxMatch ? parseInt(idxMatch[1]) - 1 : -1;
        const basePi   = piInfo?.number || 0;

        const durLive = parseInt(container.querySelector('#pi-form input[name="sprintDuration"]')?.value) || (piInfo?.sprintDuration || 14);
        track.innerHTML = [...Array(newCount)].map((_, i) => {
            const label   = displayPiNum ? `${displayPiNum}.${i + 1}` : `S${i + 1}`;
            const isCur   = displayPiNum === basePi && i === curIdx;
            const isDone  = displayPiNum === basePi && curIdx >= 0 && i < curIdx;
            const isIP    = i === newCount - 1;
            const hasData = teamSprints.some(s => String(s.name || '').includes(`${displayPiNum}.${i + 1}`));
            const cls     = [isIP ? 'ip' : isCur ? 'current' : isDone ? 'done' : '', hasData ? 'has-data' : ''].filter(Boolean).join(' ');
            const icon    = isCur ? '▶ ' : isDone ? '✓ ' : '';
            const ts = allSprints.find(s => String(s.name||'').includes(`${displayPiNum}.${i+1}`) && s.startDate && s.endDate);
            const dates = ts
                ? { from: String(ts.startDate).slice(0,10), to: String(ts.endDate).slice(0,10) }
                : piInfo?.startDate ? (() => { const add=(iso,n)=>{const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};const from=add(piInfo.startDate,i*durLive);return{from,to:add(from,durLive-1)};})() : null;
            const wd     = dates ? piWorkdays(dates.from, dates.to) : null;
            const wdHtml = wd !== null ? `<span class="pi-pill-wd">${wd}j</span>` : '';
            const tip    = `${isIP ? 'IP — ' : ''}Sprint ${label}${hasData ? ' · données disponibles' : ''}${dates ? ` · ${dates.from} → ${dates.to}` : ''}${wd !== null ? ` · ${wd} j ouvrés` : ''}`;
            return `<span class="pi-sprint-pill ${cls}" data-sprint-idx="${i}" data-sprint-label="${label}" data-pi-num="${displayPiNum}" title="${tip}">${icon}${label}${wdHtml}</span>`;
        }).join('');

        track.querySelectorAll('.pi-sprint-pill').forEach(pill => {
            pill.addEventListener('click', () => _fillSprintForm(pill));
        });

        // Met à jour le meta dans le header PI
        const meta = container.querySelector('.pi-cfg-meta');
        if (meta) {
            const dur = parseInt(container.querySelector('#pi-form input[name="sprintDuration"]')?.value) || (piInfo?.sprintDuration || 14);
            meta.textContent = `${newCount} sprints · ${dur} j · ${newCount * dur} j`;
        }
    });

    // Met à jour uniquement le meta quand la durée du sprint change
    container.querySelector('#pi-form input[name="sprintDuration"]')?.addEventListener('input', (e) => {
        const dur = parseInt(e.target.value) || 0;
        const cnt = parseInt(container.querySelector('#pi-form input[name="sprintsPerPI"]')?.value) || (piInfo?.sprintsPerPI || 5);
        const meta = container.querySelector('.pi-cfg-meta');
        if (meta && dur > 0) meta.textContent = `${cnt} sprints · ${dur} j · ${cnt * dur} j`;
    });

    // Champs date "friendly" — câblage centralisé (sync overlay + clic ouvre calendrier)
    wireFriendlyDates(container);

    container.querySelector('#sprint-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api.updateSprint({
                name: fd.get('name'),
                startDate: fd.get('startDate') ? new Date(fd.get('startDate')).toISOString() : null,
                endDate: fd.get('endDate') ? new Date(fd.get('endDate')).toISOString() : null,
                goal: fd.get('goal'),
            });
            toast('Sprint mis a jour', 'success');
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Push sprint vers JIRA ─────────────────────────────────────────────────
    container.querySelector('#btn-sprint-push-jira')?.addEventListener('click', async () => {
        const form = container.querySelector('#sprint-form');
        const fd   = new FormData(form);
        const name      = fd.get('name') || sprintInfo?.name || '';
        const startDate = fd.get('startDate') || (sprintInfo?.startDate || '').slice(0, 10);
        const endDate   = fd.get('endDate')   || (sprintInfo?.endDate   || '').slice(0, 10);
        const goal      = fd.get('goal') || sprintInfo?.goal || '';

        if (!sprintInfo?.jiraId) { toast('ID JIRA du sprint manquant — relancer une sync', 'warning'); return; }
        if (!startDate || !endDate) { toast('Dates requises', 'warning'); return; }

        const msg = `Pousser ces valeurs vers JIRA ?\n\n` +
            `• Nom: ${name}\n` +
            `• Début: ${startDate}\n` +
            `• Fin: ${endDate}\n` +
            `• Objectif: ${goal ? goal.slice(0, 60) + (goal.length > 60 ? '…' : '') : '(vide)'}\n\n` +
            `Sprint JIRA ID: ${sprintInfo.jiraId}\n\n` +
            `Cette action écrasera les valeurs côté JIRA.`;
        if (!(await confirmDanger('Pousser vers JIRA', msg, { confirmLabel: 'Pousser', danger: false }))) return;

        const btn = container.querySelector('#btn-sprint-push-jira');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Push en cours…';
        try {
            // PUT JIRA expects ISO datetime with TZ. On utilise midnight local → ISO.
            const r = await fetch(`/jira/rest/agile/1.0/sprint/${encodeURIComponent(sprintInfo.jiraId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    startDate: new Date(`${startDate}T00:00:00`).toISOString(),
                    endDate:   new Date(`${endDate}T23:59:59`).toISOString(),
                    goal,
                }),
            });
            if (!r.ok) {
                const txt = await r.text().catch(() => '');
                throw new Error(`JIRA ${r.status}: ${txt.slice(0, 200) || 'permissions insuffisantes ?'}`);
            }
            toast('Sprint poussé vers JIRA ✓', 'success');
        } catch (err) {
            toast(`Échec push JIRA : ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    });

    // PI form
    container.querySelector('#pi-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = _piFormRead();
        if (!data) return;
        const track = container.querySelector('#pi-sprint-track');
        const displayPi = parseInt(track?.dataset.displayPi || '0') || _basePiNum;
        // Toujours sauvegarder en localStorage pour ce PI
        savePiCfg(displayPi, data, { manual: true });
        // Mettre à jour le nombre de sprints dans le track
        _switchPiTrack(displayPi, data.sprintsPerPI);
        _piFormBaseline = _piFormSnapshot();
        // Appel API seulement si c'est le PI courant en base
        if (displayPi === _basePiNum) {
            try {
                const current = store.get('piInfo') || {};
                await api.updatePI({
                    ...current,
                    number: data.number,
                    name: data.name,
                    sprintsPerPI: data.sprintsPerPI,
                    sprintDuration: data.sprintDuration,
                    startDate: data.startDate || null,
                });
                try { const fresh = await api.getPI(); store.set('piInfo', fresh); } catch {}
                toast('PI mis à jour', 'success');
            } catch (err) { toast(err.message, 'error'); }
        } else {
            toast(`PI#${displayPi} sauvegardé localement`, 'success');
        }
    });


    // ── Recaler le N° PI sur le sprint actif (résout la désync config/sprint) ──
    container.querySelector('#pi-desync-realign')?.addEventListener('click', async (e) => {
        const target = parseInt(e.currentTarget.dataset.pi) || 0;
        if (!target) return;
        try {
            const current = store.get('piInfo') || {};
            await api.updatePI({ ...current, number: target });
            const fresh = await api.getPI();
            store.set('piInfo', fresh);
            toast(`PI recalé sur PI#${target}`, 'success');
        } catch (err) { toast(err.message, 'error'); }
    });
}
