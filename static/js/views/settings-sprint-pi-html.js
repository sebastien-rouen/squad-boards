/**
 * Paramètres → Sprint & PI : rendu de la section (navigation inter-PI, pastilles de sprint,
 * formulaires). Le câblage vit dans settings-sprint-pi.js.
 */

import { getCurrentPi, esc, friendlyDateField, getSupportWeekMode, isWorkday, workdaysBetween } from '../utils.js';
import { store } from '../state.js';
import { loadPiCfg } from '../utils/pi-config.js';
import { knownPiNumbers, piCongesDiff } from '../utils/pi-weeks.js';

/** Jours ouvrés de `from` à `to` INCLUS ('AAAA-MM-JJ'), fériés déduits — null sans dates. */
export function piWorkdays(from, to) {
    if (!from || !to) return null;
    const start = new Date(from + 'T00:00:00');
    return workdaysBetween(start, new Date(to + 'T00:00:00')) + (isWorkday(start) ? 1 : 0);
}

/** Section « Sprint & PI ». */
export function sprintPiSectionHtml(ctx) {
    const { sprintInfo, piInfo, jiraUrl } = ctx;
    // PI courant = source unique getCurrentPi (sprint actif JIRA > piInfo.number).
    // Évite d'afficher PI30 quand piInfo.number=30 mais le sprint courant est "Fuego - Ité 29.5".
    const piNum       = getCurrentPi({ sprintInfo, piInfo }) || '';
    const piName      = piInfo?.name        || '';
    // Détection désync : le PI déduit du sprint actif ≠ N° configuré en base.
    // Si oui, on propose de recaler — sinon les vues lisant piInfo.number brut mentent.
    const _sprintPi   = getCurrentPi({ sprintInfo, piInfo: null }) || 0;  // sprint seul, sans fallback config
    const _cfgPi      = piInfo?.number || 0;
    const _piDesync   = _sprintPi && _cfgPi && _sprintPi !== _cfgPi ? { sprintPi: _sprintPi, cfgPi: _cfgPi } : null;
    // Nombre de sprints : détecté depuis teamSprints JIRA (gère le 6e sprint exceptionnel)
    // puis localStorage pi-cfg, puis piInfo. On prend le max pour ne jamais masquer un sprint réel.
    const _cfgLocal   = loadPiCfg(piNum);
    const _detectedCnt = (() => {
        if (!piNum) return 0;
        const all = sprintInfo?.teamSprints || [];
        let mx = 0;
        for (const s of all) { const m = String(s.name||'').match(/\b(\d{2,})\.(\d+)/); if (m && parseInt(m[1],10) === piNum) mx = Math.max(mx, parseInt(m[2],10)); }
        return mx;
    })();
    const sprintsCnt  = Math.max(_detectedCnt, _cfgLocal?.sprintsPerPI || piInfo?.sprintsPerPI || 5);
    const sprintDur   = piInfo?.sprintDuration || 14;
    const totalDays   = sprintsCnt * sprintDur;

    // Détection du sprint courant depuis le nom (ex : "29.3" → index 2)
    const idxMatch = (sprintInfo?.name || '').match(/\.(\d+)\s*$/);
    const curIdx   = idxMatch ? parseInt(idxMatch[1]) - 1 : -1;

    // Progression dans le sprint courant
    let sprintPct = 0;
    if (sprintInfo?.startDate && sprintInfo?.endDate) {
        const now   = Date.now();
        const start = new Date(sprintInfo.startDate).getTime();
        const end   = new Date(sprintInfo.endDate).getTime();
        sprintPct   = Math.round(Math.max(0, Math.min(1, (now - start) / (end - start))) * 100);
    }

    // Résout les dates d'un sprint depuis TOUS les teamSprints (pas filtré par équipe)
    // Le filtre équipe s'applique uniquement au dot "has-data", pas aux dates
    const _sprintDates = (displayPiNum, sprintIdx) => {
        const label = `${displayPiNum}.${sprintIdx+1}`;
        const ts = allTeamSprints.find(s => String(s.name||'').includes(label) && s.startDate && s.endDate);
        if (ts) return { from: String(ts.startDate).slice(0,10), to: String(ts.endDate).slice(0,10) };
        if (piInfo?.startDate) {
            const add = (iso, n) => { const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
            const from = add(piInfo.startDate, sprintIdx * sprintDur);
            return { from, to: add(from, sprintDur - 1) };
        }
        return null;
    };

    // PI connus depuis teamSprints — filtrés par équipe sélectionnée
    const allTeamSprints = sprintInfo?.teamSprints || [];
    const selectedTeamForPills = store.get('team');
    const teamSprints = (selectedTeamForPills && selectedTeamForPills !== 'all')
        ? allTeamSprints.filter(s => s.team === selectedTeamForPills)
        : allTeamSprints;
    const knownPis = [...new Set(
        teamSprints.map(s => { const m = String(s.name||'').match(/\b(\d{2,})\.\d+/); return m ? parseInt(m[1]) : null; }).filter(Boolean)
    )].sort((a, b) => a - b);
    const basePiRaw = typeof piNum === 'number' ? piNum : (parseInt(piNum) || 0);
    // Fallback : si piInfo.number non configuré, prend le PI le plus récent des teamSprints
    const basePi = basePiRaw || (knownPis.length ? knownPis[knownPis.length - 1] : 0);
    if (basePi && !knownPis.includes(basePi)) knownPis.push(basePi);
    knownPis.sort((a, b) => a - b);
    const prevPi = knownPis.filter(p => p < basePi).slice(-1)[0] || null;
    const nextPi = knownPis.find(p => p > basePi) || null;

    // Génère les pills pour un PI donné (affichePiNum peut différer de basePi)
    const makePills = (displayPiNum) => [...Array(sprintsCnt)].map((_, i) => {
        const label  = displayPiNum ? `${displayPiNum}.${i + 1}` : `S${i + 1}`;
        const isCur  = displayPiNum === basePi && i === curIdx;
        const isDone = displayPiNum === basePi && curIdx >= 0 && i < curIdx;
        const isIP   = i === sprintsCnt - 1;
        const hasData = teamSprints.some(s => String(s.name||'').includes(`${displayPiNum}.${i+1}`));
        const cls    = [isIP ? 'ip' : isCur ? 'current' : isDone ? 'done' : '', hasData ? 'has-data' : ''].filter(Boolean).join(' ');
        const icon   = isCur ? '▶ ' : isDone ? '✓ ' : '';
        const dates  = _sprintDates(displayPiNum, i);
        const wd     = dates ? piWorkdays(dates.from, dates.to) : null;
        const wdHtml = wd !== null ? `<span class="pi-pill-wd">${wd}j</span>` : '';
        const tip    = `${isIP ? 'IP — ' : ''}Sprint ${label}${hasData ? ' · données disponibles' : ''}${dates ? ` · ${dates.from} → ${dates.to}` : ''}${wd !== null ? ` · ${wd} j ouvrés` : ''}`;
        return `<span class="pi-sprint-pill ${cls}" data-sprint-idx="${i}" data-sprint-label="${esc(label)}" data-pi-num="${displayPiNum}" title="${esc(tip)}">${icon}${esc(label)}${wdHtml}</span>`;
    }).join('');

    return `
<div class="settings-section settings-section--wide collapsed">
    <div class="settings-section-header" data-stg-toggle>
        <div><h3>Sprint & PI</h3><p>Programme Incrément et sprint en cours</p></div>
        <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
    </div>
    <div class="settings-section-body">
        <div class="pi-cfg-card">

            <!-- ── PI : header + track + champs ── -->
            <form id="pi-form">
                <div class="pi-cfg-hdr">
                    <span class="pi-cfg-badge">PI${piNum ? ' #' + piNum : ' ?'}</span>
                    <span class="pi-cfg-title">${esc(piName) || 'Programme Increment'}</span>
                    <span class="pi-cfg-meta">${sprintsCnt}&thinsp;sprints &middot; ${sprintDur}&thinsp;j &middot; ${totalDays}&thinsp;j</span>
                    <button type="submit" class="pi-cfg-save-btn">Enregistrer PI</button>
                </div>

                ${_piDesync ? `
                <div class="pi-cfg-desync" role="alert">
                    <span class="pi-cfg-desync-icon">⚠️</span>
                    <span class="pi-cfg-desync-msg">
                        Le N° de PI configuré (<strong>PI#${_piDesync.cfgPi}</strong>) ne correspond pas au sprint actif
                        JIRA (<strong>PI#${_piDesync.sprintPi}</strong>${sprintInfo?.name ? ` — ${esc(sprintInfo.name)}` : ''}).
                        Les vues qui lisent le N° brut peuvent afficher le mauvais PI.
                    </span>
                    <button type="button" class="pi-cfg-desync-btn" id="pi-desync-realign" data-pi="${_piDesync.sprintPi}">
                        Recaler sur PI#${_piDesync.sprintPi}
                    </button>
                </div>` : ''}

                <!-- Navigation inter-PI + pills -->
                <div class="pi-track-nav">
                    <button type="button" class="pi-track-nav-btn" id="pi-track-prev" data-pi="${prevPi || ''}" ${!prevPi ? 'disabled' : ''} title="${prevPi ? `PI#${prevPi}` : 'Aucun PI précédent'}">
                        <svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="10 4 6 8 10 12"/></svg>
                        ${prevPi ? `PI#${prevPi}` : ''}
                    </button>
                    <div class="pi-sprint-track" id="pi-sprint-track" data-cur-idx="${curIdx}" data-sprint-dur="${sprintDur}" data-cur-start="${sprintInfo?.startDate?.slice(0,10) || ''}" data-display-pi="${basePi}">
                        ${makePills(basePi)}
                    </div>
                    <button type="button" class="pi-track-nav-btn" id="pi-track-next" data-pi="${nextPi || ''}" ${!nextPi ? 'disabled' : ''} title="${nextPi ? `PI#${nextPi}` : 'Aucun PI suivant dans les données JIRA'}">
                        ${nextPi ? `PI#${nextPi}` : ''}
                        <svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 4 10 8 6 12"/></svg>
                    </button>
                </div>

                <div class="pi-cfg-body">
                    <div class="pi-cfg-grid">
                        <div class="pi-cfg-field">
                            <label class="pi-cfg-label">N° PI</label>
                            <input class="pi-cfg-input" name="number" type="number" value="${piNum}" placeholder="30">
                        </div>
                        <div class="pi-cfg-field">
                            <label class="pi-cfg-label">Nom du PI</label>
                            <input class="pi-cfg-input" name="piName" value="${esc(piName)}" placeholder="PI#30 — Été 2026">
                        </div>
                        <div class="pi-cfg-field">
                            <label class="pi-cfg-label">Sprints / PI</label>
                            <input class="pi-cfg-input" name="sprintsPerPI" type="number" value="${sprintsCnt}" min="1" max="10">
                        </div>
                        <div class="pi-cfg-field">
                            <label class="pi-cfg-label">Durée sprint (j)</label>
                            <input class="pi-cfg-input" name="sprintDuration" type="number" value="${sprintDur}" min="7" max="28">
                        </div>
                        <div class="pi-cfg-field pi-cfg-field--date" title="1er jour du PI. Si vide, calculé depuis le sprint actif.">
                            <label class="pi-cfg-label pi-cfg-label--date">
                                <svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="2" width="14" height="13" rx="2"/><path d="M1 6h14M5 1v2M11 1v2"/></svg>
                                Début du PI
                            </label>
                            ${friendlyDateField({ name: 'startDate', value: piInfo?.startDate || _cfgLocal?.startDate || '', placeholder: 'Calculé auto' })}
                        </div>
                        <div class="pi-cfg-field pi-cfg-field--pip" title="Jours de PI Planning (PIP) qui clôturent ce PI — préparation du PI suivant. Déduits automatiquement de l'import CSV.">
                            <label class="pi-cfg-label pi-cfg-label--date">🗓️ PIP (PI suivant)</label>
                            <div class="pi-pip-pickers">
                                ${friendlyDateField({ name: 'pipDate1', value: (_cfgLocal?.pipDates || [])[0] || '', placeholder: 'Jour 1' })}
                                ${friendlyDateField({ name: 'pipDate2', value: (_cfgLocal?.pipDates || [])[1] || '', placeholder: 'Jour 2' })}
                            </div>
                        </div>
                    </div>
                </div>
            </form>

            ${(() => {
                // ── Récapitulatif « PI vs Congés » ───────────────────────────────
                // Un coup d'œil sur les PI dont l'ancrage diverge du CSV RH importé.
                // Lecture seule : le recalage reste un geste explicite, PI par PI,
                // depuis Paramètres → Rotation (weekStart = clé des rotations en base).
                // On filtre AVANT de tronquer : un PI dont les Congés ont été importés
                // doit rester listé même si JIRA connaît des boards de PI plus récents
                // (« PI#32 », « PI#33 »… existent souvent bien avant leurs sprints).
                // Modes de semaine de toutes les équipes : un jour d'écart qui reste
                // dans la même semaine de bascule n'est pas un écart (cf. piCongesDiff).
                const _modesEquipes = [...new Set((store.get('teams') || []).map(t => getSupportWeekMode(t)))];
                const _diffs = knownPiNumbers(sprintInfo)
                    .map(n => piCongesDiff(sprintInfo, n, piInfo, _modesEquipes))
                    .filter(d => d.startCsv || d.sprintsCsv)
                    .slice(-6);
                if (!_diffs.length) return '';
                const _j = iso => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
                const _src = { saisie: 'saisi', jira: 'JIRA', config: 'config', aucune: '—' };
                const _lignes = _diffs.map(d => {
                    const etat = d.cale
                        ? '<span class="pi-recap-badge pi-recap-badge--on">🔒 calé sur Congés</span>'
                        : d.ecart
                            ? '<span class="pi-recap-badge pi-recap-badge--warn">⚠ écart</span>'
                            : d.memeSemaine
                                ? '<span class="pi-recap-badge pi-recap-badge--ok" title="Les deux dates reculent sur la même semaine de bascule : recaler ne déplacerait aucune semaine de la grille">✓ même semaine</span>'
                                : '<span class="pi-recap-badge pi-recap-badge--ok">✓ aligné</span>';
                    return `<tr${d.ecart ? ' class="pi-recap-row--warn"' : ''}>
                        <td><strong>PI ${d.piNum}</strong></td>
                        <td>${_j(d.startUsed)} <span class="text-muted">(${_src[d.source] || d.source})</span></td>
                        <td>${_j(d.startCsv)}</td>
                        <td>${d.sprintsUsed}${d.sprintsCsv && d.sprintsCsv !== d.sprintsUsed ? ` <span class="text-muted">/ ${d.sprintsCsv} CSV</span>` : ''}</td>
                        <td>${etat}</td>
                    </tr>`;
                }).join('');
                const _nbEcarts = _diffs.filter(d => d.ecart).length;
                return `
                <div class="pi-recap">
                    <div class="pi-recap-hdr">
                        <span>📅 PI vs Congés importés</span>
                        ${_nbEcarts
                            ? `<a class="btn btn-xs btn-secondary" href="#settings/rotation" title="Le recalage se fait PI par PI depuis la grille Rotation">${_nbEcarts} écart${_nbEcarts > 1 ? 's' : ''} — recaler</a>`
                            : '<span class="text-xs text-muted">tout est aligné</span>'}
                    </div>
                    <table class="pi-recap-table">
                        <thead><tr><th>PI</th><th>Début utilisé</th><th>Début Congés</th><th>Itérations</th><th>État</th></tr></thead>
                        <tbody>${_lignes}</tbody>
                    </table>
                </div>`;
            })()}

            <!-- ── Sprint sélectionné : niché dans le PI ── -->
            <form id="sprint-form">
                <div class="sprint-nested-card">
                    <div class="sprint-nested-hdr">
                        <span class="sprint-nested-dot"></span>
                        <span class="sprint-nested-label">Sprint en cours</span>
                        ${sprintPct > 0 ? `
                            <div class="sprint-nested-bar" title="${sprintPct}% écoulé">
                                <div class="sprint-nested-fill" style="width:${sprintPct}%"></div>
                            </div>
                            <span class="sprint-nested-pct">${sprintPct}%</span>
                        ` : ''}
                    </div>
                    <div class="sprint-nested-body">
                        <div class="sprint-nested-grid">
                            <div class="pi-cfg-field pi-cfg-field--full">
                                <label class="pi-cfg-label" for="spr-name">Nom du sprint</label>
                                <input id="spr-name" class="pi-cfg-input" name="name" placeholder="Sprint${piNum ? ' #' + piNum + '.1' : ''}">
                            </div>
                            <div class="pi-cfg-field pi-cfg-field--date">
                                <label class="pi-cfg-label pi-cfg-label--date">
                                    <svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="2" width="14" height="13" rx="2"/><path d="M1 6h14M5 1v2M11 1v2"/></svg>
                                    Début
                                </label>
                                ${friendlyDateField({ id: 'spr-start', name: 'startDate', value: sprintInfo?.startDate?.slice(0,10) || '', placeholder: 'Début sprint' })}
                            </div>
                            <div class="pi-cfg-field pi-cfg-field--date">
                                <label class="pi-cfg-label pi-cfg-label--date">
                                    <svg class="icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="2" width="14" height="13" rx="2"/><path d="M1 6h14M5 1v2M11 1v2"/></svg>
                                    Fin
                                </label>
                                ${friendlyDateField({ id: 'spr-end', name: 'endDate', value: sprintInfo?.endDate?.slice(0,10) || '', placeholder: 'Fin sprint', min: sprintInfo?.startDate?.slice(0,10) || '' })}
                            </div>
                            <div class="pi-cfg-field pi-cfg-field--full">
                                <label class="pi-cfg-label" for="spr-goal">Objectif du sprint</label>
                                <textarea id="spr-goal" class="pi-cfg-input pi-cfg-input--textarea" name="goal" rows="2">${esc(sprintInfo?.goal || '')}</textarea>
                            </div>
                        </div>
                        <div class="sprint-nested-actions">
                            <button type="submit" class="btn btn-primary btn-sm">Enregistrer sprint</button>
                            ${sprintInfo?.jiraId ? `
                                <button type="button" class="btn btn-secondary btn-sm" id="btn-sprint-push-jira" title="Mettre a jour le sprint dans JIRA avec les valeurs locales">
                                    ↑ Pousser vers JIRA
                                </button>` : `
                                <span class="text-xs text-muted" title="Aucun ID JIRA — sync depuis JIRA d'abord">Push JIRA indisponible</span>`}
                            ${sprintInfo?.jiraBoardId && jiraUrl ? `
                                <a class="btn btn-ghost btn-sm" href="${esc(jiraUrl)}/jira/software/c/boards/${esc(sprintInfo.jiraBoardId)}" target="_blank" rel="noopener" title="Ouvrir le board JIRA dans un nouvel onglet">
                                    <svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    Board JIRA
                                </a>` : ''}
                        </div>
                    </div>
                </div>
            </form>

        </div>
    </div>
</div>`;
}
