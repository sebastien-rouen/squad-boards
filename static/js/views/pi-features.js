/**
 * 🧩 Page PI → onglet Features : features du PI par équipe, statut consolidé, charge.
 *
 * Extrait de pi.js (3.258.0), code déplacé à l'identique. N'importe jamais pi.js (pas de cycle).
 */
import { store } from '../state.js';
import { esc, progressColor, sumBy, isBufferItem } from '../utils.js';
import { STATUS_LABELS } from '../config.js';

// ── Features tab ──────────────────────────────────────────────────────────────
export function renderFeatures(el, { featureList, capByTeam = {} }) {
    if (!featureList.length) {
        const team = store.get('team');
        const jiraUrl = store.get('jiraUrl');
        el.innerHTML = `
            <div class="pi-empty-state">
                <span class="pi-empty-icon">📦</span>
                <h3 class="pi-empty-title">Aucune feature pour ce PI</h3>
                <p class="pi-empty-hint">
                    ${team && team !== 'all' ? `L'équipe <strong>${esc(team)}</strong> n'a pas encore de features pour ce PI.` : 'Aucune feature importée pour ce PI.'}
                    ${jiraUrl ? `<br>Importez les features depuis JIRA via <strong>Paramètres → Synchronisation</strong>.` : `<br>Configurez un sprint JIRA dans <strong>Paramètres</strong> pour importer les features.`}
                </p>
            </div>`;
        return;
    }

    // Groupe les features par équipe pour insérer les séparateurs de capacité
    const byTeam = new Map();
    for (const f of featureList) {
        const key = f.team || '—';
        if (!byTeam.has(key)) byTeam.set(key, []);
        byTeam.get(key).push(f);
    }

    // Couleurs statut
    const STATUS_COLOR = {
        done:   { bg: 'var(--status-done-bg,#dcfce7)',   text: 'var(--status-done,#16a34a)',   dot: '#16a34a' },
        inprog: { bg: 'var(--status-inprog-bg,#dbeafe)', text: 'var(--status-inprog,#2563eb)', dot: '#2563eb' },
        review: { bg: '#ede9fe',                          text: '#7c3aed',                      dot: '#7c3aed' },
        test:   { bg: 'var(--warning-bg,#fef9c3)',        text: 'var(--warning,#ca8a04)',        dot: '#ca8a04' },
        blocked:{ bg: 'var(--danger-bg,#fee2e2)',         text: 'var(--danger,#dc2626)',         dot: '#dc2626' },
        todo:   { bg: 'var(--bg-alt)',                    text: 'var(--text-muted)',             dot: '#94a3b8' },
    };

    const _isBufFeature = isBufferItem;
    const jiraUrl = store.get('jiraUrl') || null;

    // Formate une feature : "[Feature] https://jira.../browse/ID - Titre - X pts"
    const _miroLine = (f) => {
        const type   = _isBufFeature(f) ? 'Buffer' : 'Feature';
        const pts    = f.childPts || f.points || 0;
        const link   = jiraUrl ? `${jiraUrl}/browse/${f.id}` : f.id;
        const ptsStr = ` - ${pts || 0} pts`;
        return `[${type}] ${link} - ${f.title}${ptsStr}`;
    };

    // Copie les features au format TSV — collable dans Miro comme tableau
    const _copyMiroImage = async (items, teamName) => {
        const { toast } = await import('../utils.js');
        try {
            const featStyle  = 'border:2px solid #6366f1;border-radius:6px;padding:6px 10px;font-size:13px;font-family:sans-serif;white-space:nowrap;background:#f5f3ff;vertical-align:top;';
            const childStyle = 'border:1px solid #c7d2fe;border-radius:6px;padding:5px 10px;font-size:12px;font-family:sans-serif;white-space:nowrap;background:#eef2ff;vertical-align:top;';

            // Regroupe les items en lignes : [feature, ...enfants]
            const rows = [];
            let cur = null;
            for (const item of items) {
                if (item._isChild) {
                    if (cur) cur.children.push(item);
                } else {
                    cur = { feature: item, children: [] };
                    rows.push(cur);
                }
            }

            const _featCell = (f) => {
                const link   = jiraUrl ? `${jiraUrl}/browse/${f.id}` : f.id;
                const type   = _isBufFeature(f) ? 'Buffer' : 'Feature';
                const pts    = f.childPts || f.points || 0;
                return `<td style="${featStyle}">[${type}] <a href="${link}">${f.id}</a> - ${f.title} - ${pts} pts</td>`;
            };
            const _childCell = (t) => {
                const link = jiraUrl ? `${jiraUrl}/browse/${t.id}` : t.id;
                const pts  = t.points || 0;
                return `<td style="${childStyle}"><a href="${link}">${t.id}</a> - ${t.title} - ${pts} pts</td>`;
            };

            const htmlRows = rows.map(r =>
                `<tr>${_featCell(r.feature)}${r.children.map(_childCell).join('')}</tr>`
            ).join('');
            const html = `<table style="border-collapse:separate;border-spacing:4px;"><tbody>${htmlRows}</tbody></table>`;

            const plainLines = rows.flatMap(r => {
                const type = _isBufFeature(r.feature) ? 'Feature Buffer' : 'Feature';
                const pts  = r.feature.childPts || r.feature.points || 0;
                const head = `[${type}] ${r.feature.id} - ${r.feature.title} - ${pts} pts`;
                const children = r.children.map(t => {
                    const p = t.points || 0;
                    return `\t${t.id} - ${t.title} - ${p} pts`;
                });
                return [head, ...children];
            });

            await navigator.clipboard.write([new ClipboardItem({
                'text/html':  new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([plainLines.join('\n')], { type: 'text/plain' }),
            })]);
            const total = items.length;
            toast(`${rows.length} feature${rows.length > 1 ? 's' : ''} · ${total - rows.length} tickets copiés — ${teamName}`, 'success', 2500);
        } catch {
            toast('Copie non supportée — utilisez HTTPS', 'error');
        }
    };

    const _featureRow = (f, beyondCap = false) => {
        const s   = f.rolledStatus || f.status || 'todo';
        const sc  = STATUS_COLOR[s] || STATUS_COLOR.todo;
        const tip = f.rolledStatus && f.rolledStatus !== f.status
            ? `Dérivé des ${f.childCount} enfants (JIRA: ${STATUS_LABELS[f.status] || f.status})`
            : 'Statut JIRA';
        const spTotal = f.childPts || 0;
        const spDone  = f.childPtsDone || 0;
        const hasProgress = spTotal > 0 && spDone > 0;
        const spLabel = spTotal > 0 ? (hasProgress ? `${spDone}/${spTotal}` : String(spTotal)) : '—';
        const spDonePct = hasProgress ? Math.round(spDone / spTotal * 100) : 0;
        const isBuffer = _isBufFeature(f);
        const dimmed = beyondCap && !isBuffer;
        const tktCount = f.childCount > 0 ? f.childCount : (f.allCount || 0);

        // Tickets enfants pour le bloc pliable
        const allTickets = store.get('tickets') || [];
        const allEpics   = store.get('epics') || [];
        const children   = allTickets.filter(t => t.epic && allEpics.find(ep => ep.id === t.epic && ep.feature === f.id))
            .concat(allTickets.filter(t => t.epic === f.id || t.featureId === f.id))
            .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i); // dédup

        const _stC = { done:'var(--success)', inprog:'var(--primary)', review:'#6366f1', test:'var(--warning)', blocked:'var(--danger)', todo:'var(--text-muted)' };
        const _stI = { done:'✓', inprog:'●', review:'◑', test:'◕', blocked:'✗', todo:'○' };
        const childrenHtml = children.length ? `
            <div class="feat-children-list">
                ${children.map(t => {
                    const pts = t.points || 0;
                    const tLink = jiraUrl ? `<a class="feat-child-id" href="${esc(jiraUrl)}/browse/${esc(t.id)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(t.id)}</a>` : `<span class="feat-child-id">${esc(t.id)}</span>`;
                    const ptsCls = pts === 0 ? 'feat-child-pts--zero'
                                : pts <= 3  ? 'feat-child-pts--low'
                                : pts <= 8  ? 'feat-child-pts--mid'
                                :             'feat-child-pts--high';
                    return `<div class="feat-child-row" data-ticket-id="${esc(t.id)}" style="cursor:pointer">
                        <span style="color:${_stC[t.status]||_stC.todo}">${_stI[t.status]||'○'}</span>
                        ${tLink}
                        <span class="feat-child-title">${esc(t.title)}</span>
                        <span class="feat-child-pts ${ptsCls}">${pts} SP</span>
                    </div>`;
                }).join('')}
            </div>` : '';

        return `
        <div class="feat-row-wrap${dimmed ? ' feat-row-dimmed' : ''}${children.length ? ' has-children' : ''}">
            <div class="feature-row2${isBuffer ? ' feat-row-buffer' : ''}" data-ticket-id="${esc(f.id)}" style="--feat-color:${sc.dot}">
                ${children.length ? `<button class="feat-expand-btn" title="Voir les ${children.length} tickets enfants" onclick="event.stopPropagation();this.closest('.feat-row-wrap').classList.toggle('expanded')">
                    <svg class="feat-expand-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
                </button>` : '<span class="feat-expand-spacer"></span>'}
                <span class="feat-dot" style="background:${sc.dot}"></span>
                <span class="feat-id">${esc(f.id)}</span>
                <span class="feat-title">${esc(f.title)}${isBuffer ? ' <span class="feat-buf-badge">Buffer</span>' : ''}</span>
                <span class="feat-status" style="background:${sc.bg};color:${sc.text}" title="${esc(tip)}">${esc(STATUS_LABELS[s] || s)}</span>
                <span class="feat-bar-wrap" title="${f.progress}% complété">
                    <span class="feat-bar"><span class="feat-bar-fill ${progressColor(f.progress)}" style="width:${f.progress}%"></span></span>
                    <span class="feat-pct feat-pct--${progressColor(f.progress)}">${f.progress}%</span>
                </span>
                <span class="feat-sp feat-sp--${spTotal === 0 ? 'zero' : spTotal <= 13 ? 'low' : spTotal <= 34 ? 'mid' : 'high'}" title="SP${spDonePct > 0 ? ` · ${spDonePct}% livrés` : ''}">
                    ${spLabel}<span class="feat-sp-unit"> SP</span>
                </span>
                <span class="feat-tickets">${tktCount}<span class="feat-sp-unit"> ticket${tktCount > 1 ? 's' : ''}</span></span>
                <span class="feat-team">${esc(f.team || '—')}</span>
            </div>
            ${childrenHtml}
        </div>`;
    };

    // Construit le HTML par équipe avec ligne de coupure dans la liste
    const _nTeams = byTeam.size ?? [...byTeam].length;
    let html = `<div class="pi-card">
        <div class="pi-card-head">
            <span class="pi-card-ico" aria-hidden="true">📦</span>
            <div class="pi-card-title"><b>Features du PI</b>
                <small>${featureList.length} feature${featureList.length > 1 ? 's' : ''} · ${_nTeams} équipe${_nTeams > 1 ? 's' : ''} — triées par rang JIRA ; la ligne de coupure marque la capacité de l'équipe</small></div>
        </div>
        <div class="pi-card-body"><div class="feature-list2">`;
    for (const [teamName, tFeatures] of byTeam) {
        const cap = capByTeam[teamName];
        const tObj = store.get('teamObjects')?.find(o => o.name === teamName);
        const color = tObj?.color || '#64748b';

        // Tri par rang JIRA (0 = haute priorité, puis croissant)
        const ranked = [...tFeatures].sort((a, b) => {
            const ra = a.rank ?? 9999, rb = b.rank ?? 9999;
            if (ra !== rb) return ra - rb;
            return (a.id || '').localeCompare(b.id || '');
        });

        const totalSpPlanned = sumBy(ranked, f => f.childPts || f.points || 0);

        // Calcul de la ligne de coupure :
        // - Les features Buffer (label "Buffer") sont toujours prises → budget = spNet + spBuf
        // - Les autres features sont prises dans l'ordre jusqu'à épuisement de spNet
        // - La ligne est insérée juste après la dernière feature qui passe dans la capacité
        let cutIdx = null; // index APRÈS lequel insérer la ligne (null = pas de ligne)
        let overBudget = false;
        if (cap && (cap.spNet > 0 || cap.spEst > 0)) {
            const _isBufFeature = isBufferItem;
            let cumSp = 0;
            const budgetNet = cap.spNet;
            const budgetTotal = cap.spEst; // inclut le buffer

            for (let i = 0; i < ranked.length; i++) {
                const f = ranked[i];
                const sp = f.childPts || f.points || 0;
                if (_isBufFeature(f)) {
                    // Feature buffer : toujours prise, utilise le budget buffer
                    continue;
                }
                cumSp += sp;
                if (cumSp > budgetNet && cutIdx === null) {
                    // On a dépassé la capacité nette → la ligne se place avant cette feature
                    cutIdx = i;
                    overBudget = cumSp > budgetTotal;
                }
            }
        }

        html += `<div class="feat-team-group">`;

        // Sépare features normales et buffer pour affichage dépliable du buffer
        const bufFeatures = ranked.filter(f => _isBufFeature(f));
        const netFeatures = ranked.filter(f => !_isBufFeature(f));
        const bufId = `feat-buf-${teamName.replace(/\s+/g, '-')}`;

        // En-tête équipe avec bouton copie Miro
        html += `<div class="feat-team-hdr">
            <span class="team-dot" style="background:${color}"></span>
            <span class="feat-team-name">${esc(teamName)}</span>
            <span class="feat-team-count">${ranked.length} feature${ranked.length > 1 ? 's' : ''}</span>
            <span class="feat-team-sp-planned">${totalSpPlanned} SP planifiés</span>
            ${cap && cap.spNet > 0 ? `<span class="feat-team-cap" style="color:${totalSpPlanned <= cap.spNet ? 'var(--success)' : 'var(--danger)'}">cap. ${cap.spNet} SP nets</span>` : ''}
            <button class="feat-miro-btn" data-team="${esc(teamName)}" title="Copier les features pour Miro (stickies)">📋 Miro</button>
        </div>`;

        // Lignes features nettes avec ligne de coupure intercalée (sans buffer)
        let netCutIdx = cutIdx;
        netFeatures.forEach((f, i) => {
            if (i === netCutIdx) {
                const capColor = overBudget ? 'var(--danger)' : 'var(--warning)';
                html += `<div class="feat-cut-line" style="--cut-color:${capColor}">
                    <div class="feat-cut-bar"></div>
                    <button class="feat-cut-label" data-goto-tab="capacity" title="Voir le détail de la capacité">
                        ⛔ Limite capacité — ${cap?.spNet ?? 0} SP nets · ${cap?.spBuf ?? 0} buffer
                    </button>
                    <div class="feat-cut-bar"></div>
                </div>`;
            }
            html += _featureRow(f, i >= (netCutIdx ?? Infinity));
        });

        // Features buffer dépliables
        if (bufFeatures.length) {
            const bufPtsTot = sumBy(bufFeatures, f => f.childPts || f.points || 0);
            html += `<details class="feat-buf-group" id="${esc(bufId)}">
                <summary class="feat-buf-summary">
                    <span class="feat-buf-toggle-icon">›</span>
                    <span class="feat-buf-badge">Buffer</span>
                    <span class="feat-buf-count">${bufFeatures.length} feature${bufFeatures.length > 1 ? 's' : ''} · ${bufPtsTot} SP</span>
                    <button class="feat-miro-btn feat-miro-btn--buf" data-team="${esc(teamName)}" data-buf="1" title="Copier les features buffer pour Miro">📋 Miro</button>
                </summary>
                <div class="feat-buf-list">
                    ${bufFeatures.map(f => _featureRow(f, false)).join('')}
                </div>
            </details>`;
        }

        html += '</div>';
    }
    html += '</div></div></div>';   // .feature-list2, .pi-card-body, .pi-card

    el.innerHTML = html;
    el.querySelectorAll('.feature-row2, .feat-child-row').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('a')) return;
            window.__squadBoard?.openTicketModal?.(row.dataset.ticketId);
        });
    });
    el.querySelectorAll('[data-goto-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.gotoTab;
            document.querySelector(`#pi-tabs .tab[data-tab="${tabId}"]`)?.click();
        });
    });

    // Boutons copie Miro
    el.querySelectorAll('.feat-miro-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const teamName = btn.dataset.team;
            const isBuf = btn.dataset.buf === '1';
            const teamFeatures = featureList.filter(f => (f.team || '—') === teamName);

            if (isBuf) {
                // Pour le buffer : features buffer + leurs tickets enfants
                const allTickets = store.get('tickets') || [];
                const allEpics   = store.get('epics') || [];
                const bufFeatures = teamFeatures.filter(f => _isBufFeature(f));
                const items = [];
                for (const f of bufFeatures) {
                    items.push({ ...f, _isFeature: true });
                    const children = allTickets.filter(t =>
                        t.epic && allEpics.find(ep => ep.id === t.epic && ep.feature === f.id)
                    ).concat(
                        allTickets.filter(t => t.epic === f.id || t.featureId === f.id)
                    );
                    // Dédupliquer
                    const seen = new Set();
                    for (const t of children) {
                        if (seen.has(t.id)) continue;
                        seen.add(t.id);
                        items.push({ ...t, _isChild: true, _parentId: f.id });
                    }
                }
                _copyMiroImage(items, teamName + ' [Buffer]');
            } else {
                const allTickets = store.get('tickets') || [];
                const allEpics   = store.get('epics') || [];
                const netFeatures = teamFeatures.filter(f => !_isBufFeature(f));
                const items = [];
                for (const f of netFeatures) {
                    items.push({ ...f, _isFeature: true });
                    const children = allTickets.filter(t =>
                        t.epic && allEpics.find(ep => ep.id === t.epic && ep.feature === f.id)
                    ).concat(
                        allTickets.filter(t => t.epic === f.id || t.featureId === f.id)
                    );
                    const seen = new Set();
                    for (const t of children) {
                        if (seen.has(t.id)) continue;
                        seen.add(t.id);
                        items.push({ ...t, _isChild: true, _parentId: f.id });
                    }
                }
                _copyMiroImage(items, teamName);
            }
        });
    });
}
