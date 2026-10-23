/**
 * 📊 Page PI → onglet Capacité : capacité par équipe et par sprint, absences pondérées par rôle.
 *
 * Extrait de pi.js (3.258.0), code déplacé à l'identique. N'importe jamais pi.js (pas de cycle).
 */
import { store } from '../state.js';
import { esc, sumBy, deriveMembersFromAbsences } from '../utils.js';
import { TEAM_COLORS } from '../config.js';
import { _extractPi } from './pi-burnup.js';
import { CAP_EXCLUDED_ROLES_KEY, CAP_HISTORY_COUNT_KEY, CAP_HISTORY_MODE_KEY, _capAbsDaysInWindow, _capAvgVelocity, _capGetExcludedRoles, _capGetHistoryCount, _capGetHistoryMode, _capGetRolePct, _capMemberAvail, _capNominalWorkdays, _capPiFromSprint, _capRolePct, _capSprintIdx, _capSprintWindows, _withRealizedVelocity, _workdays } from './pi-capacity-model.js';
import { _rotFmtCapDate } from './pi-teams.js';

export function renderCapacity(el, { piInfo, absences, teams, teamObjects, _computeCapByTeam, capByTeam: _capByTeamRef }) {
    const sprintInfo    = store.get('sprintInfo');
    const allMembers    = store.get('members') || [];
    const tickets       = store.get('tickets') || [];
    const effectiveMembers = deriveMembersFromAbsences(absences, allMembers);
    const rolePctMap    = _capGetRolePct();

    // Vélocité réalisée de chaque sprint : `sprintRealizedVelocity`, même mesure que Santé.
    const allTeamSprints = (sprintInfo?.teamSprints || []).map(s => _withRealizedVelocity(s, tickets));

    const excludedRoles = _capGetExcludedRoles();
    const historyMode   = _capGetHistoryMode();
    const historyCount  = _capGetHistoryCount();
    const basePiNum     = _extractPi(sprintInfo?.name) || piInfo?.number || 0;
    const piOffset      = store.get('piOffset') || 0;
    const curPiNum      = basePiNum ? Math.max(1, basePiNum + piOffset) : 0;

    // Lit la config locale du PI affiché (stockée par settings.js sous pi-cfg-<N>)
    const _piCfgLocal = (() => { try { return JSON.parse(localStorage.getItem(`pi-cfg-${curPiNum}`) || 'null'); } catch { return null; } })();

    const sprintDur     = _piCfgLocal?.sprintDuration || piInfo?.sprintDuration || 14;
    const sprintCount   = _piCfgLocal?.sprintsPerPI   || piInfo?.sprintsPerPI   || 5;

    // Pour les fenêtres : utilise startDate local si dispo, sinon dérivation JIRA
    const piInfoForWindows = {
        ...piInfo,
        number:        curPiNum,
        sprintsPerPI:  sprintCount,
        sprintDuration: sprintDur,
        startDate: piOffset === 0
            ? (_piCfgLocal?.startDate || piInfo?.startDate || null)
            : (_piCfgLocal?.startDate || null),  // PI autre : local si sauvegardé, sinon dérivation JIRA
    };
    const sprintWindows = _capSprintWindows(piInfoForWindows, allTeamSprints);

    // Toutes les équipes visibles (filtre topbar)
    const teamFilter = store.get('team');
    const visibleTeams = (!teamFilter || teamFilter === 'all') ? teams : teams.filter(t => t === teamFilter);

    // Rôles uniques issus des membres dérivés des absences (source de vérité RH)
    const allRoles = [...new Set(
        effectiveMembers.map(m => m.role).filter(Boolean)
    )].sort();

    // Décode le mojibake UTF-8 interprété en Latin-1 (ex: "CamÃ©lÃ©on" → "Caméléon")
    // Technique : ré-encoder en Latin-1 byte par byte puis décoder en UTF-8
    const _fixMojibake = s => {
        if (!s) return s;
        try {
            const bytes = new Uint8Array([...s].map(c => c.charCodeAt(0) & 0xFF));
            return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        } catch { return s; }
    };

    // Normalisation : retire accents, casse, espaces — appliqué après correction mojibake
    const _norm = s => _fixMojibake(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    // Lookup : normalisé → nom réel dans les absences (gère "Team Fuego", accents, casse, mojibake)
    const _absTeamRealNames = new Map(absences.map(a => [_norm(a.team), a.team]));
    const _absTeamAlias = (teamName) => {
        // Essai exact
        if (_absTeamRealNames.has(_norm(teamName)))   return _absTeamRealNames.get(_norm(teamName));
        // Essai avec préfixe "Team "
        if (_absTeamRealNames.has(_norm('Team ' + teamName))) return _absTeamRealNames.get(_norm('Team ' + teamName));
        // Essai en retirant un préfixe "Team " éventuel dans teamName
        const without = teamName.replace(/^Team\s+/i, '');
        if (_absTeamRealNames.has(_norm(without))) return _absTeamRealNames.get(_norm(without));
        return teamName;
    };

    // Calcul par équipe
    const teamData = visibleTeams.map((teamName, i) => {
        const tObj  = teamObjects.find(o => o.name === teamName);
        const color = tObj?.color || TEAM_COLORS[i % TEAM_COLORS.length];

        const absTeamName = _absTeamAlias(teamName);

        // Membres : match normalisé sur m.team pour absorber accents/casse/mojibake
        const _normTeam    = _norm(teamName);
        const _normAbsTeam = _norm(absTeamName);
        const members = effectiveMembers.filter(m => {
            const mt = _norm(m.team);
            if (mt !== _normTeam && mt !== _normAbsTeam) return false;
            return !excludedRoles.some(r => r.toLowerCase() === (m.role || '').toLowerCase());
        });
        // ETP pondéré : somme des ratios (ex: Ops=1.0, Tech Lead=0.4, Co-BO=0.0)
        const memberEtp   = members.reduce((s, m) => s + _capRolePct(m.role, rolePctMap) / 100, 0);
        const memberCount = members.length; // nb brut (affiché dans l'UI)

        // Vélocité moyenne historique (par sprint)
        const avgVelPerSprint = _capAvgVelocity(allTeamSprints, teamName, curPiNum, historyMode, historyCount);

        // Base Capacité manuelle (override de la vélocité historique, par équipe)
        const baseCapRaw = localStorage.getItem(`cap-base-${curPiNum}-${teamName}`);
        const baseCapacity = baseCapRaw !== null && baseCapRaw !== '' ? parseInt(baseCapRaw, 10) : null;
        // Multiplicateur effectif : base manuelle si renseignée, sinon vélocité historique
        const capMultiplier = (baseCapacity !== null && baseCapacity > 0) ? baseCapacity : avgVelPerSprint;
        const capSource     = (baseCapacity !== null && baseCapacity > 0) ? 'manual' : 'history';

        // Sprints du PI courant issus de teamSprints (pour vérifier les données réelles)
        const piTeamSprints = allTeamSprints
            .filter(s => s.team === teamName && _capPiFromSprint(s.name) === curPiNum)
            .sort((a, b) => (_capSprintIdx(a.name)||0) - (_capSprintIdx(b.name)||0));

        // Capacité par sprint — utilise sprintCount dérivé du PI affiché (local ou JIRA)
        const sprints = Array.from({ length: sprintCount }, (_, idx) => {
            const sprintNum = idx + 1;
            const label     = `${curPiNum || '?'}.${sprintNum}`;
            const window    = sprintWindows?.[idx] || null;
            const isIP      = window?.isIP || false; // Sprint Innovation & Planning

            // Jours/homme théoriques = Σ capacité de rôle × jours OUVRÉS de la fenêtre. Avant :
            // `memberEtp × sprintDur`, soit 14 jours CALENDAIRES face à des absences comptées en jours
            // ouvrés — +40 % de jours théoriques, donc un % d'absence sous-estimé d'autant.
            const workDays  = window ? _workdays(window.from, window.to) : _capNominalWorkdays(sprintDur);
            const totalDays = memberEtp * workDays;

            // Absences sur la fenêtre de ce sprint — pondérées par le ratio rôle de chaque membre
            const absDays = window
                ? Math.round(members.reduce((s, m) => {
                    const pct = _capRolePct(m.role, rolePctMap) / 100;
                    if (pct === 0) return s;
                    const raw = _capAbsDaysInWindow(
                        absences.filter(a => a.memberName === m.name),
                        absTeamName, window.from, window.to
                    );
                    return s + raw * pct;
                }, 0) * 10) / 10
                : 0;

            const availDays = Math.max(0, totalDays - absDays);
            const availPct  = totalDays > 0 ? Math.round((availDays / totalDays) * 100) : 100;

            // Sprint IP : pas d'estimation de planning (spEst/spBuf/spNet = 0)
            const spEst   = (!isIP && memberEtp > 0) ? Math.ceil(capMultiplier * (availPct / 100)) : 0;
            const spBuf   = !isIP ? Math.round(spEst * 0.2) : 0;
            const spNet   = spEst - spBuf;

            // Disponibilité par membre (pour la tooltip détail)
            const memberAvail = window
                ? _capMemberAvail(members, absences, absTeamName, window.from, window.to, sprintDur, rolePctMap)
                : members.filter(m => _capRolePct(m.role, rolePctMap) > 0).map(m => ({ name: m.name, role: m.role || '', rolePct: _capRolePct(m.role, rolePctMap), absDays: 0, availDays: workDays, availPct: 100 }));

            // Données réelles du sprint (si déjà clôturé) — comptabilisées même pour sprint IP
            // Cherche par index (pattern XX.N) en priorité, puis par fenêtre de dates
            const real = piTeamSprints.find(s => _capSprintIdx(s.name) === sprintNum)
                || (window ? allTeamSprints.find(s =>
                    s.team === teamName && s.state === 'closed' &&
                    String(s.startDate || '').slice(0,10) === window.from
                ) : null);
            const realState = real?.state || null;
            // realVel : velocity du sprint (déjà enrichie avec fallback tickets dans allTeamSprints)
            // Si toujours 0, fallback direct sur les tickets done du sprint
            let realVel = (real?.velocity || 0) > 0 ? real.velocity : null;
            if (realVel == null && real?.name) {
                const fromTkts = sumBy(
                    tickets.filter(t => t.status === 'done' && t.team === teamName &&
                        (t.sprintName || t.sprint_name) === real.name),
                    t => t.points || 0
                );
                if (fromTkts > 0) realVel = fromTkts;
            }

            return { label, workDays, totalDays, absDays, availDays, availPct, spEst, spBuf, spNet, realVel, realState, window, memberAvail, isIP };
        });

        const totalSpEst  = sumBy(sprints, s => s.spEst);
        const totalBuf    = sumBy(sprints, s => s.spBuf);
        const totalAbs    = Math.round(sumBy(sprints, s => s.absDays) * 10) / 10;
        const closedSprints  = sprints.filter(s => s.realVel != null && s.realState !== 'active');
        const closedCount    = closedSprints.length;
        const totalRealVel   = sumBy(closedSprints, s => s.realVel);
        const totalRealNet   = sumBy(closedSprints, s => s.spNet);   // capacité nette estimée sur sprints clôturés
        const totalRealBuf   = Math.max(0, totalRealVel - totalRealNet); // part qui déborde dans le buffer

        return { teamName, color, memberCount, memberEtp, members, avgVelPerSprint, capMultiplier, capSource, baseCapacity, sprints, totalSpEst, totalBuf, totalAbs, totalRealVel, totalRealBuf, closedCount };
    });

    // ── HTML ──────────────────────────────────────────────────────────────────

    const modeLabel = historyMode === 'pi'
        ? `${historyCount} PI précédent${historyCount > 1 ? 's' : ''}`
        : `${historyCount} dernier${historyCount > 1 ? 's' : ''} sprint${historyCount > 1 ? 's' : ''}`;

    // Détermine la source des fenêtres (pour le badge info dans le bandeau)
    const windowSource = !sprintWindows ? 'none'
        : piInfo?.startDate ? 'config'
        : 'jira';
    // Détecte si la vélocité historique vient des tickets (pas de Greenhopper JIRA)
    const velFromTickets = allTeamSprints.some(s => s._velFromTickets);

    el.innerHTML = `
    <div class="picap">

        <!-- ── Bandeau paramètres ── -->
        <div class="picap-params">
            <!-- Ligne 1 : vélocité + lien + badge source -->
            <div class="picap-params-row1">
                <span class="picap-params-label">Vélocité</span>
                <select class="select select-sm" id="cap-history-mode">
                    <option value="pi"     ${historyMode==='pi'     ? 'selected' : ''}>Par PI</option>
                    <option value="sprint" ${historyMode==='sprint' ? 'selected' : ''}>Par sprint</option>
                </select>
                <input class="input input-sm" id="cap-history-count" type="number" min="1" max="20" value="${historyCount}" style="width:48px" title="Nombre de PI ou sprints">
                <span class="picap-params-hint">${esc(modeLabel)}${velFromTickets ? ' <span class="picap-vel-source" title="Vélocité calculée depuis les tickets done (pas de données Greenhopper JIRA)">· tickets</span>' : ''}</span>
                <span class="picap-params-sep"></span>
                ${windowSource === 'none' ? `<span class="picap-warn">
                    <svg class="icon icon-sm" style="color:var(--warning)"><use href="#i-alert"/></svg>
                    Aucun sprint PI trouvé
                </span>` : ''}
                <a class="picap-settings-link" id="cap-goto-settings" href="#settings">
                    <svg class="icon icon-sm"><use href="#i-settings"/></svg>
                    % par rôle
                </a>
            </div>
            <!-- Ligne 2 : rôles exclus sur toute la largeur -->
            <div class="picap-params-row2">
                <span class="picap-params-label">Exclus</span>
                <div class="picap-role-select" id="cap-role-select">
                    <div class="picap-role-tags">
                        ${excludedRoles.filter(r => allRoles.includes(r)).map(r => {
                            const pct = _capRolePct(r, rolePctMap);
                            return `<span class="picap-role-tag" data-role="${esc(r)}">
                                ${esc(r)}${pct < 100 ? ` <em>${pct}%</em>` : ''}
                                <button class="picap-role-tag-rm" data-role="${esc(r)}" tabindex="-1">×</button>
                            </span>`;
                        }).join('')}
                        <input class="picap-role-input" id="cap-role-input" placeholder="Ajouter un rôle à exclure…" autocomplete="off">
                    </div>
                    <ul class="picap-role-dropdown" id="cap-role-dropdown" hidden></ul>
                </div>
            </div>
        </div>

        <!-- ── Grille sprints ── -->
        <div class="picap-grid">
            ${teamData.map(td => {
                if (!td.memberCount) return `
                    <div class="picap-team-block">
                        <div class="picap-team-hdr">
                            <span class="team-dot" style="background:${td.color}"></span>
                            <span class="picap-team-name">${esc(td.teamName)}</span>
                            <span class="picap-team-empty" title="Importez les absences CSV dans Paramètres → Import CSV absences pour voir la capacité">⚠️ Aucun membre — importez les absences CSV</span>
                        </div>
                    </div>`;

                return `
                <div class="picap-team-block">
                    <div class="picap-team-hdr">
                        <span class="team-dot" style="background:${td.color}"></span>
                        <span class="picap-team-name">${esc(td.teamName)}</span>
                        <span class="picap-team-meta picap-has-tt">${(() => {
                            // Jamais d'« ETP » à l'écran (choix utilisateur) : des JOURS/HOMME par sprint
                            // type (jours ouvrés de `sprintDur`), chaque jour pondéré par la capacité du rôle.
                            const spDays = _capNominalWorkdays(sprintDur);
                            const jh = v => (Math.round(v * spDays * 10) / 10).toString().replace('.', ',');
                            const pct = td.memberCount > 0 ? Math.round((td.memberEtp / td.memberCount) * 100) : 100;
                            const etpStr = `${td.memberCount} membres <span class="picap-meta-etp" title="Jours/homme d'un sprint de ${spDays} jours ouvrés, chaque jour pondéré par la capacité du rôle (hors absences)">· ${jh(td.memberEtp)} j/h par sprint${pct !== 100 ? ` (${pct} %)` : ''}</span>`;
                            // Regroupe par rôle pour le tooltip
                            const byRole = {};
                            td.members.forEach(m => {
                                const r = m.role || 'Dev';
                                const p = _capRolePct(m.role, rolePctMap);
                                if (!byRole[r]) byRole[r] = { pct: p, count: 0, etp: 0 };   // etp = j/h par jour ouvré
                                byRole[r].count++;
                                byRole[r].etp += p / 100;
                            });
                            const roleRows = Object.entries(byRole)
                                .sort(([,a],[,b]) => b.etp - a.etp)
                                .map(([role, d]) => {
                                    const isZero = d.pct === 0;
                                    return `
                                <div class="picap-tt-row${isZero ? ' picap-tt-row--excluded' : ''}">
                                    <span>${esc(role)} <em class="picap-tt-role-count">(×${d.count})</em>${isZero ? ' <em class="picap-tt-role-excl">exclu</em>' : ''}</span>
                                    <strong>${isZero ? '—' : `${jh(d.etp)} j/h <span class="picap-tt-role-pct">${d.pct}%</span>`}</strong>
                                </div>`;
                                }).join('');
                            const histRows = td.avgVelPerSprint > 0 ? `
                                <div class="picap-tt-sep"></div>
                                <div class="picap-tt-row picap-tt-row--head"><span>Vélocité historique</span></div>
                                <div class="picap-tt-row">
                                    <span>${historyMode === 'pi' ? `${historyCount} PI précédent${historyCount > 1 ? 's' : ''}` : `${historyCount} dernier${historyCount > 1 ? 's' : ''} sprint${historyCount > 1 ? 's' : ''}`}</span>
                                    <strong>${td.avgVelPerSprint} SP/sprint</strong>
                                </div>` : '';
                            return `${etpStr} · vél. moy. <strong>${td.avgVelPerSprint}</strong> SP/sprint
                            <div class="picap-tt picap-tt--meta">
                                <div class="picap-tt-row picap-tt-row--head"><span>Composition de l'équipe</span></div>
                                ${roleRows}
                                <div class="picap-tt-sep"></div>
                                <div class="picap-tt-row picap-tt-row--total">
                                    <span>Total par sprint (${spDays} j ouvrés)</span>
                                    <strong>${jh(td.memberEtp)} j/h <span class="picap-tt-role-pct">(${pct}%)</span></strong>
                                </div>
                                ${histRows}
                            </div>`;
                        })()}</span>
                        <label class="picap-base-wrap" title="Base Capacité : remplace la vélocité historique pour l'estimation. Vide = vélocité historique (${td.avgVelPerSprint} SP).">
                            <span class="picap-base-label">Base</span>
                            <input class="picap-base-input"
                                type="number" min="1" max="999"
                                placeholder="${td.avgVelPerSprint}"
                                value="${td.baseCapacity !== null ? td.baseCapacity : ''}"
                                data-team="${esc(td.teamName)}"
                                data-pi="${curPiNum}">
                            <span class="picap-base-unit">SP</span>
                            ${td.capSource === 'manual' ? `<span class="picap-base-badge">perso</span>` : ''}
                        </label>
                        <span class="picap-team-totals">

                            <!-- Barre PI totaux : même style que les sprints (net + buffer) -->
                            <div class="picap-sp-row picap-sp-row--pi-total picap-has-tt">
                                <div class="picap-sp-bars">
                                    <div class="picap-sp-net" style="flex:${td.totalSpEst - td.totalBuf}">
                                        <span class="picap-sp-val">${td.totalSpEst - td.totalBuf}</span>
                                        <span class="picap-sp-lbl">SP nets</span>
                                    </div>
                                    <div class="picap-sp-buf" style="flex:${td.totalBuf}">
                                        <span class="picap-sp-val">${td.totalBuf}</span>
                                        <span class="picap-sp-lbl">buf</span>
                                    </div>
                                </div>
                                <span class="picap-sp-total">≈&thinsp;${td.totalSpEst} SP</span>
                                <!-- Tooltip SP estimés (conservé) -->
                                <div class="picap-tt picap-tt--totals">
                                    <div class="picap-tt-row picap-tt-row--head"><span>Capacité PI — net + buffer</span></div>
                                    ${td.sprints.filter(s => !s.isIP).map(s => `
                                    <div class="picap-tt-row">
                                        <span>Sprint ${s.label}${s.realState === 'closed' ? ' ✓' : s.realState === 'active' ? ' ▶' : ''}</span>
                                        <strong>${s.spNet} <span style="color:#7c3aed">+${s.spBuf}</span> SP</strong>
                                    </div>`).join('')}
                                    <div class="picap-tt-sep"></div>
                                    <div class="picap-tt-row picap-tt-row--total">
                                        <span>Capacité nette</span>
                                        <strong>${td.totalSpEst - td.totalBuf} SP</strong>
                                    </div>
                                    <div class="picap-tt-row">
                                        <span>dont buffer (20%)</span>
                                        <strong style="color:#7c3aed">+ ${td.totalBuf} SP</strong>
                                    </div>
                                    <div class="picap-tt-row picap-tt-row--total">
                                        <span>Total estimé</span>
                                        <strong>${td.totalSpEst} SP</strong>
                                    </div>
                                </div>
                            </div>

                            <!-- Chip réalisé -->
                            ${td.closedCount > 0 ? (() => {
                                const cls = td.sprints.filter(s => s.realState === 'closed' && s.realVel != null);
                                const estClosed = sumBy(cls, s => s.spEst);
                                const netClosed = sumBy(cls, s => s.spNet);
                                const ecart     = td.totalRealVel - netClosed;
                                const ecartCls  = ecart >= 0 ? 'picap-tt-row--total' : 'picap-tt-row--warn';
                                return `
                            <span class="picap-total-real picap-has-tt">
                                ✓ ${td.totalRealVel} SP réalisés${td.totalRealBuf > 0 ? ` <span class="picap-total-real-buf">dont ${td.totalRealBuf} buf</span>` : ''}
                                <div class="picap-tt picap-tt--totals">
                                    <div class="picap-tt-row picap-tt-row--head"><span>Réalisé — ${td.closedCount} sprint${td.closedCount > 1 ? 's' : ''} clôturé${td.closedCount > 1 ? 's' : ''}</span></div>
                                    ${cls.map(s => `
                                    <div class="picap-tt-row">
                                        <span>Sprint ${s.label}</span>
                                        <strong style="color:var(--success)">${s.realVel} SP</strong>
                                    </div>`).join('')}
                                    <div class="picap-tt-sep"></div>
                                    <div class="picap-tt-row picap-tt-row--total" style="--picap-total-color:var(--success)">
                                        <span>Total réalisé</span>
                                        <strong style="color:var(--success)">${td.totalRealVel} SP</strong>
                                    </div>
                                    ${td.totalRealBuf > 0 ? `
                                    <div class="picap-tt-row">
                                        <span>dont buffer utilisé</span>
                                        <strong style="color:#7c3aed">+${td.totalRealBuf} SP</strong>
                                    </div>` : ''}
                                    <div class="picap-tt-sep"></div>
                                    <div class="picap-tt-row">
                                        <span>Estimé (${td.closedCount} sprint${td.closedCount > 1 ? 's' : ''})</span>
                                        <strong>${estClosed} SP</strong>
                                    </div>
                                    <div class="picap-tt-row ${ecartCls}">
                                        <span>Écart vs capacité nette</span>
                                        <strong>${ecart >= 0 ? '+' : ''}${ecart} SP</strong>
                                    </div>
                                </div>
                            </span>`;
                            })() : ''}

                        </span>
                    </div>
                    <div class="picap-sprints">
                        ${td.sprints.map(s => {
                            const isDone = s.realState === 'closed' || (s.realVel != null && s.realState !== 'active');
                            const isActive = s.realState === 'active';
                            const barW = Math.min(100, s.availPct);
                            return `
                            <div class="picap-sprint${isDone ? ' picap-sprint--done' : isActive ? ' picap-sprint--active' : ''}${s.isIP ? ' picap-sprint--ip' : ''}">
                                <div class="picap-sprint-hdr">
                                    <span class="picap-sprint-label">Sprint ${s.label}</span>
                                    ${s.isIP ? '<span class="picap-sprint-badge-ip" title="Sprint Innovation & Planning — exclu des estimations de capacité">🧪 IP</span>' : ''}
                                    ${s.window ? `<span class="picap-sprint-dates">${_rotFmtCapDate(s.window.from)} → ${_rotFmtCapDate(s.window.to)}</span>` : ''}
                                    ${isDone && s.realVel != null ? `<span class="picap-sprint-real">Réalisé : <strong>${s.realVel} SP</strong></span>` : ''}
                                    ${isActive ? `<span class="picap-sprint-badge-active">En cours</span>` : ''}
                                </div>

                                <!-- Barre dispo + absences -->
                                <div class="picap-avail-bar-wrap picap-has-tt">
                                    <div class="picap-avail-bar">
                                        <div class="picap-avail-fill" style="width:${barW}%"></div>
                                        ${s.absDays > 0 ? `<div class="picap-avail-abs" style="width:${100-barW}%"></div>` : ''}
                                    </div>
                                    <span class="picap-avail-pct">${s.availPct}% dispo${s.absDays > 0 ? ` · <span class="text-warning">${s.absDays}j abs</span>` : ''}</span>
                                    <div class="picap-tt">
                                        <div class="picap-tt-row picap-tt-row--head">
                                            <span>Disponibilité sprint ${s.label}</span>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>Membres dev</span>
                                            <strong>${td.memberCount}</strong>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>Durée sprint</span>
                                            <strong>${s.workDays} j ouvrés</strong>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>Jours théoriques</span>
                                            <strong>${Math.round(s.totalDays * 10) / 10} j/h</strong>
                                        </div>
                                        ${s.absDays > 0 ? `
                                        <div class="picap-tt-row picap-tt-row--warn">
                                            <span>Congés / absences</span>
                                            <strong>− ${s.absDays} j/h</strong>
                                        </div>` : ''}
                                        <div class="picap-tt-row picap-tt-row--total">
                                            <span>Jours disponibles</span>
                                            <strong>${Math.round(s.availDays * 10) / 10} j/h (${s.availPct}%)</strong>
                                        </div>
                                    </div>
                                </div>

                                <!-- SP : net + buffer (masqué pour sprint IP) -->
                                ${s.isIP ? `
                                <div class="picap-sp-row picap-sp-row--ip">
                                    <span class="picap-sp-ip-note">Sprint Innovation & Planning — pas d'estimation de capacité</span>
                                    ${s.realVel != null ? `<span class="picap-sprint-real">Réalisé : <strong>${s.realVel} SP</strong></span>` : ''}
                                </div>` : `
                                ${(() => {
                                    const rv       = s.realVel ?? null;
                                    const realNet  = rv !== null ? Math.min(rv, s.spNet) : null;       // part vélocité dans le net
                                    const realBuf  = rv !== null ? Math.max(0, rv - s.spNet) : null;   // part dans le buffer
                                    const netFill  = s.spNet > 0 && realNet !== null ? Math.round((realNet / s.spNet) * 100) : 0;
                                    const bufFill  = s.spBuf > 0 && realBuf !== null ? Math.min(100, Math.round((realBuf / s.spBuf) * 100)) : 0;
                                    return `
                                <div class="picap-sp-row picap-has-tt">
                                    <div class="picap-sp-bars">
                                        <div class="picap-sp-net" style="flex:${s.spNet}">
                                            ${realNet !== null ? `<div class="picap-sp-real-fill picap-sp-real-fill--net" style="width:${netFill}%" title="${realNet} SP réalisés sur ${s.spNet} nets"></div>` : ''}
                                            <span class="picap-sp-val">${s.spNet}</span>
                                            <span class="picap-sp-lbl">SP${realNet !== null ? ` <em class="picap-sp-real-hint">/ ${realNet} réal.</em>` : ''}</span>
                                        </div>
                                        <div class="picap-sp-buf" style="flex:${s.spBuf}">
                                            ${realBuf !== null && realBuf > 0 ? `<div class="picap-sp-real-fill picap-sp-real-fill--buf" style="width:${bufFill}%" title="${realBuf} SP réalisés sur ${s.spBuf} buffer"></div>` : ''}
                                            <span class="picap-sp-val">${s.spBuf}</span>
                                            <span class="picap-sp-lbl">buf${realBuf !== null && realBuf > 0 ? ` <em class="picap-sp-real-hint">/ ${realBuf}</em>` : ''}</span>
                                        </div>
                                    </div>
                                    <span class="picap-sp-total">≈&thinsp;${s.spEst} SP${rv !== null ? ` <span class="picap-sp-total-real">✓${rv}</span>` : ''}</span>
                                    <div class="picap-tt picap-tt--wide">
                                        <div class="picap-tt-row picap-tt-row--head">
                                            <span>Membres disponibles — sprint ${s.label}</span>
                                        </div>
                                        ${s.memberAvail.map(m => `
                                        <div class="picap-tt-row picap-tt-member">
                                            <span class="picap-tt-member-name">${esc(m.name)}${m.rolePct < 100 ? ` <span class="picap-tt-role-pct">${m.rolePct}%</span>` : ''}</span>
                                            <span class="picap-tt-member-bar-wrap">
                                                <span class="picap-tt-member-bar">
                                                    <span class="picap-tt-member-fill" style="width:${m.availPct}%"></span>
                                                </span>
                                            </span>
                                            <strong class="${m.availPct < 70 ? 'picap-tt-low' : m.availPct < 100 ? 'picap-tt-mid' : ''}">${m.availPct}%${m.absDays > 0 ? ` <span class="picap-tt-abs">−${m.absDays}j</span>` : ''}</strong>
                                        </div>`).join('')}
                                        <div class="picap-tt-sep"></div>
                                        <div class="picap-tt-row picap-tt-row--head">
                                            <span>Calcul estimation</span>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>Jours théoriques (${td.memberCount} membres pondérés × ${s.workDays} j ouvrés)</span>
                                            <strong>${Math.round(s.totalDays * 10) / 10} j/h</strong>
                                        </div>
                                        ${s.absDays > 0 ? `
                                        <div class="picap-tt-row picap-tt-row--warn">
                                            <span>− Absences pondérées</span>
                                            <strong>− ${s.absDays} j/h</strong>
                                        </div>` : ''}
                                        <div class="picap-tt-row">
                                            <span>= Jours disponibles</span>
                                            <strong>${Math.round(s.availDays * 10) / 10} j/h (${s.availPct}%)</strong>
                                        </div>
                                        <div class="picap-tt-sep"></div>
                                        <div class="picap-tt-row">
                                            <span>${td.capSource === 'manual'
                                                ? 'Base Capacité <em>(perso)</em>'
                                                : `Vél. moy. (${historyCount} ${historyMode === 'pi' ? 'PI' : 'sprints'})${velFromTickets ? ' <span class="picap-vel-source">tickets</span>' : ''}`
                                            }</span>
                                            <strong>${td.capMultiplier} SP</strong>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--formula">
                                            <span>${td.capMultiplier} × ${s.availPct}% = <strong>${(td.capMultiplier * s.availPct / 100).toFixed(1)}</strong> → ⌈ ${s.spEst} SP ⌉</span>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--total">
                                            <span>SP estimés</span>
                                            <strong>${s.spEst} SP</strong>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--buf">
                                            <span>Buffer (20%)</span>
                                            <strong>− ${s.spBuf} SP</strong>
                                        </div>
                                        <div class="picap-tt-row picap-tt-row--total">
                                            <span>SP nets</span>
                                            <strong>${s.spNet} SP</strong>
                                        </div>
                                        ${rv !== null ? `
                                        <div class="picap-tt-sep"></div>
                                        <div class="picap-tt-row picap-tt-row--head"><span>Réalisé</span></div>
                                        <div class="picap-tt-row">
                                            <span>Vélocité réelle</span>
                                            <strong style="color:var(--success)">${rv} SP</strong>
                                        </div>
                                        <div class="picap-tt-row">
                                            <span>dont vélocité nette</span>
                                            <strong>${realNet} SP</strong>
                                        </div>
                                        ${realBuf > 0 ? `
                                        <div class="picap-tt-row picap-tt-row--buf">
                                            <span>dont buffer utilisé</span>
                                            <strong>+${realBuf} SP</strong>
                                        </div>` : ''}
                                        <div class="picap-tt-row ${rv >= s.spNet ? 'picap-tt-row--total' : 'picap-tt-row--warn'}">
                                            <span>Écart vs estimé</span>
                                            <strong>${rv - s.spEst >= 0 ? '+' : ''}${rv - s.spEst} SP</strong>
                                        </div>` : ''}
                                    </div>
                                </div>`;
                                })()}`}
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }).join('')}
        </div>

        <!-- ── Récap PI ── -->
        <div class="picap-recap">
            <div class="picap-recap-title">Récap PI#${curPiNum || '?'}</div>
            <div class="picap-recap-kpis">
                ${teamData.filter(td => td.memberCount > 0).map(td => `
                    <div class="picap-recap-kpi">
                        <span class="picap-recap-dot" style="background:${td.color}"></span>
                        <span class="picap-recap-team">${esc(td.teamName)}</span>
                        <span class="picap-recap-val">${td.totalSpEst} SP</span>
                        <span class="picap-recap-buf">+ ${td.totalBuf} buf</span>
                    </div>`).join('')}
                <div class="picap-recap-kpi picap-recap-kpi--total">
                    <span class="picap-recap-team">Total</span>
                    <span class="picap-recap-val">${sumBy(teamData, td => td.totalSpEst)} SP</span>
                    <span class="picap-recap-buf">+ ${sumBy(teamData, td => td.totalBuf)} buf</span>
                </div>
            </div>
        </div>

    </div>`;

    // ── Interactions ──────────────────────────────────────────────────────────
    const _rerender = () => {
        // Recalcule capByTeam et propage dans _tabData avant de re-rendre
        if (_computeCapByTeam && _capByTeamRef) {
            const fresh = _computeCapByTeam();
            Object.keys(_capByTeamRef).forEach(k => delete _capByTeamRef[k]);
            Object.assign(_capByTeamRef, fresh);
        }
        renderCapacity(el, { piInfo, absences, teams, teamObjects, _computeCapByTeam, capByTeam: _capByTeamRef });
    };

    el.querySelector('#cap-history-mode')?.addEventListener('change', e => {
        localStorage.setItem(CAP_HISTORY_MODE_KEY, e.target.value);
        _rerender();
    });
    el.querySelector('#cap-history-count')?.addEventListener('change', e => {
        const v = Math.max(1, Math.min(20, parseInt(e.target.value) || 2));
        localStorage.setItem(CAP_HISTORY_COUNT_KEY, String(v));
        _rerender();
    });
    // ── Autocomplete rôles exclus ─────────────────────────────────────────────
    const _saveExcluded = (list) => {
        localStorage.setItem(CAP_EXCLUDED_ROLES_KEY, JSON.stringify(list));
        _rerender();
    };
    const input    = el.querySelector('#cap-role-input');
    const dropdown = el.querySelector('#cap-role-dropdown');

    const _showDropdown = (query) => {
        const current = _capGetExcludedRoles();
        const matches = allRoles.filter(r =>
            !current.includes(r) &&
            r.toLowerCase().includes(query.toLowerCase())
        );
        if (!matches.length) { dropdown.hidden = true; return; }
        dropdown.innerHTML = matches.map(r => {
            const pct = _capRolePct(r, rolePctMap);
            return `<li class="picap-role-opt" data-role="${esc(r)}">${esc(r)}${pct < 100 ? ` <em>${pct}%</em>` : ''}</li>`;
        }).join('');
        dropdown.hidden = false;
    };

    input?.addEventListener('focus',  () => _showDropdown(input.value));
    input?.addEventListener('input',  () => _showDropdown(input.value));
    input?.addEventListener('keydown', e => {
        if (e.key === 'Escape') { dropdown.hidden = true; input.blur(); }
        if (e.key === 'Backspace' && !input.value) {
            // Supprime le dernier tag
            const current = _capGetExcludedRoles().filter(r => allRoles.includes(r));
            if (current.length) _saveExcluded(current.slice(0, -1));
        }
    });
    dropdown?.addEventListener('mousedown', e => {
        const li = e.target.closest('.picap-role-opt');
        if (!li) return;
        e.preventDefault();
        const role = li.dataset.role;
        const current = _capGetExcludedRoles();
        if (!current.includes(role)) _saveExcluded([...current, role]);
    });
    // Clic sur × d'un tag
    el.querySelector('#cap-role-select')?.addEventListener('click', e => {
        const btn = e.target.closest('.picap-role-tag-rm');
        if (!btn) return;
        const role = btn.dataset.role;
        _saveExcluded(_capGetExcludedRoles().filter(r => r !== role));
    });
    // Ferme le dropdown au clic extérieur
    document.addEventListener('click', function _outsideClick(e) {
        if (!el.querySelector('#cap-role-select')?.contains(e.target)) {
            if (dropdown) dropdown.hidden = true;
            document.removeEventListener('click', _outsideClick);
        }
    });
    el.querySelectorAll('.picap-base-input').forEach(inp => {
        const _save = (target) => {
            const team = target.dataset.team;
            const pi   = target.dataset.pi;
            const key  = `cap-base-${pi}-${team}`;
            const v    = target.value.trim();
            if (v === '' || isNaN(parseInt(v))) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, String(Math.max(1, parseInt(v))));
            }
            _rerender();
        };
        // Sauvegarde uniquement sur blur ou Enter — pas à chaque frappe ni flèche
        inp.addEventListener('blur',    e => _save(e.target));
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _save(e.target); e.target.blur(); } });
        inp.addEventListener('click',   e => e.stopPropagation());
    });

    el.querySelector('#cap-goto-settings')?.addEventListener('click', e => {
        e.preventDefault();
        const sb = window.__squadBoard;
        if (!sb) return;
        // Positionne la tab cible avant de changer de vue (consommé par _settingsApplyTabs)
        sb.store.set('settingsSection', 'cap-roles');
        sb.store.set('view', 'settings');
    });
}
