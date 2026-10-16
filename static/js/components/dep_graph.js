/**
 * Dépendances — composant partagé (BACKLOG #14 / #29).
 *
 * Source de vérité : le champ `links` (issuelinks JIRA) porté par CHAQUE item, et non le champ
 * `dependencies` (mort — jamais peuplé par la sync). Un lien compte comme dépendance s'il est
 * de type bloquant ("blocks" / "is blocked by" / "depends on" + variantes FR).
 *
 * Fournit :
 *   - extractDependencyEdges(items)        → arêtes "from dépend de to" entre items connus
 *   - renderItemDepGraph(svg, items)        → graphe SVG par item, colonnes par équipe (Roadmap)
 *   - computeTeamDependencies(items)        → agrégation équipe→équipe
 *   - renderTeamDepBoard(items, teamObjects) → HTML "programme board" inter-équipes (#14)
 */

import { esc, hashColor, statusBadge } from '../utils.js';

// Direction d'un lien : 'dependsOn' (cet item dépend du lié) | 'blocks' (cet item bloque le lié) | null
function _linkDirection(type) {
    const t = (type || '').toLowerCase();
    // Inward (l'item courant est bloqué / dépend) — testé en premier car "blocked" contient "block"
    if (/blocked by|bloqu\w*\s+par|depends?\s+on|d[ée]pend/.test(t)) return 'dependsOn';
    if (/\bblocks?\b|\bbloque\b/.test(t)) return 'blocks';
    return null;
}

const _teamColor = (team, teamObjects) =>
    teamObjects?.find(o => o.name === team)?.color || hashColor(team || '');

/**
 * Arêtes de dépendance « from → to » (from dépend de to ; to doit être livré d'abord).
 * Ne conserve que les arêtes dont les deux extrémités sont présentes dans `items`
 * (nécessaire pour connaître les équipes des deux côtés). Dédupliquées.
 */
export function extractDependencyEdges(items) {
    const list = items || [];
    const byId = new Map(list.map(i => [i.id, i]));
    const seen = new Set();
    const edges = [];
    const add = (fromId, toId) => {
        if (!fromId || !toId || fromId === toId) return;
        if (!byId.has(fromId) || !byId.has(toId)) return;
        const key = `${fromId}→${toId}`;
        if (seen.has(key)) return;
        seen.add(key);
        const fromItem = byId.get(fromId), toItem = byId.get(toId);
        edges.push({
            from: fromId, to: toId, fromItem, toItem,
            fromTeam: fromItem.team || 'Autre', toTeam: toItem.team || 'Autre',
        });
    };
    for (const it of list) {
        for (const l of (it.links || [])) {
            const dir = _linkDirection(l.type);
            if (dir === 'dependsOn') add(it.id, l.id);
            else if (dir === 'blocks') add(l.id, it.id);
        }
    }
    return edges;
}

// ── Graphe par item (SVG) ───────────────────────────────────────────────────
/**
 * Rend un graphe de dépendances dans `svg`, colonnes groupées par équipe (les arêtes
 * inter-équipes sont mises en évidence). Réutilise les classes CSS `.dep-node` existantes.
 * @returns {number} nombre d'arêtes rendues (0 = rien dessiné)
 */
export function renderItemDepGraph(svg, items, teamObjects = []) {
    if (!svg) return 0;
    const edges = extractDependencyEdges(items);
    if (!edges.length) { svg.innerHTML = ''; return 0; }

    const involved = new Set();
    edges.forEach(e => { involved.add(e.from); involved.add(e.to); });
    const byId = new Map((items || []).map(i => [i.id, i]));
    const nodes = [...involved].map(id => byId.get(id)).filter(Boolean);

    const W = 168, H = 50, PAD = 24, GAPX = 70, GAPY = 16;
    // Colonnes par équipe (tri alpha) — visualise les flux inter-équipes horizontalement
    const cols = {};
    nodes.forEach(n => {
        const k = n.team || 'Autre';
        (cols[k] ||= []).push(n);
    });
    const colKeys = Object.keys(cols).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const positions = {};
    let cx = PAD;
    const colHeaders = [];
    for (const col of colKeys) {
        let cy = PAD + 22; // place pour l'en-tête de colonne
        colHeaders.push({ x: cx, label: col, color: _teamColor(col, teamObjects) });
        for (const n of cols[col]) {
            positions[n.id] = { x: cx, y: cy };
            cy += H + GAPY;
        }
        cx += W + GAPX;
    }
    const totalW = cx + PAD;
    const totalH = Math.max(...Object.values(positions).map(p => p.y + H)) + PAD;
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);
    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

    let html = `<defs>
        <marker id="dep-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--primary)"/></marker>
        <marker id="dep-arrow-cross" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--danger)"/></marker>
    </defs>`;

    // En-têtes de colonnes (équipes)
    for (const h of colHeaders) {
        html += `<text x="${h.x + W / 2}" y="${PAD}" text-anchor="middle" font-size="11" font-weight="700" fill="${esc(h.color)}">${esc(h.label)}</text>`;
    }

    // Arêtes
    for (const e of edges) {
        const from = positions[e.from], to = positions[e.to];
        if (!from || !to) continue;
        const cross = e.fromTeam !== e.toTeam;
        const x1 = from.x + W, y1 = from.y + H / 2;
        const x2 = to.x, y2 = to.y + H / 2;
        const mx = (x1 + x2) / 2;
        const stroke = cross ? 'var(--danger)' : 'var(--primary)';
        html += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="${cross ? 2 : 1.5}" marker-end="url(#${cross ? 'dep-arrow-cross' : 'dep-arrow'})" opacity="${cross ? 0.9 : 0.6}"${cross ? ' stroke-dasharray="0"' : ''}/>`;
    }

    // Nœuds
    for (const n of nodes) {
        const { x, y } = positions[n.id];
        const color = _teamColor(n.team, teamObjects);
        html += `<g class="dep-node" data-feature-id="${esc(n.id)}">
            <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" fill="var(--card-bg)" stroke="${esc(color)}" stroke-width="1.5" opacity="0.95"/>
            <text x="${x + W / 2}" y="${y + 18}" text-anchor="middle" font-size="10" fill="var(--text)" font-weight="600" class="dep-node-id">${esc(n.id)}</text>
            <text x="${x + W / 2}" y="${y + 34}" text-anchor="middle" font-size="9" fill="var(--text-muted)" class="dep-node-title">${esc((n.title || '').slice(0, 24))}${(n.title || '').length > 24 ? '…' : ''}</text>
        </g>`;
    }
    svg.innerHTML = html;

    svg.querySelectorAll('.dep-node').forEach(node => {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(node.dataset.featureId));
    });
    return edges.length;
}

// ── Programme board inter-équipes (#14) ──────────────────────────────────────
/**
 * Agrège les arêtes de dépendance au niveau équipe.
 * @returns {{ edges, teamEdges:[{from,to,count,crossTeam,links}], teams:string[], crossCount }}
 */
export function computeTeamDependencies(items) {
    const edges = extractDependencyEdges(items);
    const teamEdges = new Map();
    const teams = new Set();
    let crossCount = 0;
    for (const e of edges) {
        teams.add(e.fromTeam); teams.add(e.toTeam);
        if (e.fromTeam !== e.toTeam) crossCount++;
        const key = `${e.fromTeam}→${e.toTeam}`;
        if (!teamEdges.has(key)) {
            teamEdges.set(key, { from: e.fromTeam, to: e.toTeam, count: 0, crossTeam: e.fromTeam !== e.toTeam, links: [] });
        }
        const te = teamEdges.get(key);
        te.count++; te.links.push(e);
    }
    return {
        edges,
        teamEdges: [...teamEdges.values()],
        teams: [...teams].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
        crossCount,
    };
}

// Un lien est RÉSOLU quand l'item dont on dépend (« to ») est livré.
const _resolved = l => l.toItem?.status === 'done';

/**
 * HTML du « programme board » inter-équipes :
 *   • indicateurs — liens inter-équipes, NON RÉSOLUS (l'item attendu n'est pas livré), résolus, internes,
 *     équipe la plus sollicitée (dont les autres dépendent) et la plus dépendante ;
 *   • liens les plus forts en puces cliquables ;
 *   • matrice COMPACTE : seulement les équipes qui ont une dépendance inter-équipes (lignes = qui dépend,
 *     colonnes = dont elle dépend), couleur selon les liens non résolus, ✓ quand tout est livré, totaux ;
 *     les équipes sans lien inter-équipes sont citées à part (avec leurs liens internes) ;
 *   • détail au clic (cellule ou puce) : chaque lien, les deux tickets, le statut de l'item attendu.
 * Les éléments cliquables portent `data-dep-from` / `data-dep-to` (câblés par bindTeamDepBoard).
 */
export function renderTeamDepBoard(items, teamObjects = []) {
    const { teamEdges, teams, crossCount, edges } = computeTeamDependencies(items);
    if (!edges.length) {
        return `<div class="empty-state"><p>Aucune dépendance bloquante détectée sur ce périmètre.</p>
            <p class="text-xs text-muted mt-1">Les dépendances proviennent des liens JIRA « bloque / est bloqué par / dépend de » entre tickets, epics et features synchronisés.</p></div>`;
    }
    const dot = t => `<span class="dep-team-dot" style="background:${esc(_teamColor(t, teamObjects))}"></span>`;
    const cross = teamEdges.filter(te => te.crossTeam);
    const intra = teamEdges.filter(te => !te.crossTeam);
    const open = te => te.links.filter(l => !_resolved(l)).length;
    const unresolved = cross.reduce((s, te) => s + open(te), 0);
    const byKey = new Map(cross.map(te => [`${te.from}→${te.to}`, te]));
    const rows = [...new Set(cross.map(te => te.from))].sort((a, b) => a.localeCompare(b, 'fr'));
    const cols = [...new Set(cross.map(te => te.to))].sort((a, b) => a.localeCompare(b, 'fr'));
    const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
    const rowTotal = r => sum(cross.filter(te => te.from === r), te => te.count);
    const colTotal = c => sum(cross.filter(te => te.to === c), te => te.count);
    const mostAsked = [...cols].sort((a, b) => colTotal(b) - colTotal(a))[0];
    const mostDep = [...rows].sort((a, b) => rowTotal(b) - rowTotal(a))[0];
    const askedBy = c => new Set(cross.filter(te => te.to === c).map(te => te.from)).size;

    const kpi = (ico, val, lbl, cls = '', title = '') => `<div class="dbx-kpi ${cls}"${title ? ` title="${esc(title)}"` : ''}><span class="dbx-kpi-ico">${ico}</span><span class="dbx-kpi-val">${val}</span><span class="dbx-kpi-lbl">${lbl}</span></div>`;
    const kpis = `<div class="dbx-kpis">
        ${kpi('🔗', crossCount, `lien${crossCount > 1 ? 's' : ''} inter-équipes`, crossCount ? 'is-warn' : '')}
        ${kpi('⏳', unresolved, `non résolu${unresolved > 1 ? 's' : ''}`, unresolved ? 'is-bad' : 'is-ok', "L'item dont on dépend n'est pas encore livré")}
        ${kpi('✅', crossCount - unresolved, `résolu${crossCount - unresolved > 1 ? 's' : ''}`, 'is-ok', "L'item dont on dépend est livré")}
        ${kpi('🏠', edges.length - crossCount, `interne${edges.length - crossCount > 1 ? 's' : ''}`, '', 'Liens entre items d\'une même équipe')}
        ${mostAsked ? kpi(dot(mostAsked), esc(mostAsked), `la plus sollicitée · ${askedBy(mostAsked)} équipe${askedBy(mostAsked) > 1 ? 's' : ''} en dépendent`, 'dbx-kpi--team') : ''}
        ${mostDep ? kpi(dot(mostDep), esc(mostDep), `la plus dépendante · ${rowTotal(mostDep)} lien${rowTotal(mostDep) > 1 ? 's' : ''}`, 'dbx-kpi--team') : ''}
    </div>`;

    const top = [...cross].sort((a, b) => open(b) - open(a) || b.count - a.count).slice(0, 6);
    const chips = top.length ? `<div class="dbx-top"><span class="dbx-top-lbl">Liens les plus forts :</span>
        ${top.map(te => `<button type="button" class="dbx-chip${open(te) ? ' has-open' : ''}" data-dep-from="${esc(te.from)}" data-dep-to="${esc(te.to)}" title="${esc(te.from)} dépend de ${esc(te.to)} — cliquer pour le détail">
            ${dot(te.from)}${esc(te.from)} <span class="dbx-arrow">→</span> ${dot(te.to)}${esc(te.to)} <b>${te.count}</b>${open(te) ? ` <span class="dbx-open" title="${open(te)} non résolu${open(te) > 1 ? 's' : ''}">· ${open(te)} ⏳</span>` : ' <span class="dbx-done" title="Tous résolus">· ✓</span>'}
        </button>`).join('')}</div>` : '';

    const heat = n => (n >= 3 ? 'h3' : n === 2 ? 'h2' : n === 1 ? 'h1' : 'h0');
    const matrix = cross.length ? `<div class="table-wrap dep-mx-wrap"><table class="dbx-table">
        <thead><tr>
            <th class="dbx-corner" title="Lignes : l'équipe qui dépend · Colonnes : l'équipe dont elle dépend"><span>dépend ↓</span><span>de →</span></th>
            ${cols.map(c => `<th class="dbx-col">${dot(c)}<span>${esc(c)}</span></th>`).join('')}
            <th class="dbx-total-col" title="Nombre de liens dont l'équipe dépend">Total</th>
        </tr></thead>
        <tbody>
            ${rows.map(r => `<tr>
                <th class="dbx-row">${dot(r)}<span>${esc(r)}</span></th>
                ${cols.map(c => {
                    if (r === c) return '<td class="dbx-cell dbx-self">—</td>';
                    const te = byKey.get(`${r}→${c}`);
                    if (!te) return '<td class="dbx-cell dbx-empty"></td>';
                    const o = open(te);
                    return `<td class="dbx-cell dbx-${o ? heat(o) : 'ok'}" data-dep-from="${esc(r)}" data-dep-to="${esc(c)}" tabindex="0"
                        title="${esc(r)} dépend de ${esc(c)} — ${te.count} lien${te.count > 1 ? 's' : ''}${o ? `, ${o} non résolu${o > 1 ? 's' : ''}` : ', tous résolus'} · cliquer pour le détail">
                        <b>${te.count}</b>${o ? (o < te.count ? `<small>${o} ⏳</small>` : '') : '<small>✓</small>'}</td>`;
                }).join('')}
                <td class="dbx-total">${rowTotal(r)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr><th class="dbx-row dbx-foot" title="Nombre de liens qui attendent l'équipe">Sollicitée</th>${cols.map(c => `<td class="dbx-total">${colTotal(c)}</td>`).join('')}<td class="dbx-total dbx-grand">${crossCount}</td></tr></tfoot>
    </table></div>` : '<p class="dbx-none">✓ Aucune dépendance inter-équipes : seulement des liens internes.</p>';

    const involved = new Set([...rows, ...cols]);
    const quiet = teams.filter(t => !involved.has(t));
    const intraOf = t => sum(intra.filter(te => te.from === t), te => te.count);
    const note = quiet.length ? `<div class="dbx-quiet"><span class="dbx-quiet-lbl">Sans dépendance inter-équipes :</span>
        ${quiet.map(t => `<span class="dbx-quiet-team">${dot(t)}${esc(t)}${intraOf(t) ? ` <small>${intraOf(t)} interne${intraOf(t) > 1 ? 's' : ''}</small>` : ''}</span>`).join('')}</div>` : '';

    return `<div class="dep-board">
        ${kpis}
        ${chips}
        ${matrix}
        <div class="dbx-legend"><span><i class="dbx-h1"></i>1 non résolu</span><span><i class="dbx-h2"></i>2</span><span><i class="dbx-h3"></i>3 et +</span><span><i class="dbx-ok"></i>tous résolus ✓</span><span>⏳ = item attendu pas encore livré</span></div>
        ${note}
        <div class="dep-board-detail" id="dep-board-detail" hidden></div>
    </div>`;
}

/** Clic sur une cellule ou une puce → liste détaillée des liens sous la matrice. */
export function bindTeamDepBoard(container, items) {
    const detail = container.querySelector('#dep-board-detail');
    if (!detail) return;
    const { teamEdges } = computeTeamDependencies(items);
    const byKey = new Map(teamEdges.map(te => [`${te.from}→${te.to}`, te]));
    const show = el => {
        const te = byKey.get(`${el.dataset.depFrom}→${el.dataset.depTo}`);
        if (!te) return;
        container.querySelectorAll('.is-selected[data-dep-from]').forEach(c => c.classList.remove('is-selected'));
        container.querySelectorAll(`[data-dep-from="${CSS.escape(te.from)}"][data-dep-to="${CSS.escape(te.to)}"]`).forEach(c => c.classList.add('is-selected'));
        const links = [...te.links].sort((a, b) => _resolved(a) - _resolved(b));
        const open = links.filter(l => !_resolved(l)).length;
        detail.hidden = false;
        detail.innerHTML = `
            <div class="dep-detail-hdr"><strong>${esc(te.from)}</strong> dépend de <strong>${esc(te.to)}</strong> — ${te.count} lien${te.count > 1 ? 's' : ''}${open ? ` · <span class="dbx-open">${open} non résolu${open > 1 ? 's' : ''}</span>` : ' · <span class="dbx-done">tous résolus ✓</span>'}</div>
            <div class="dep-detail-list">
                ${links.map(l => `<div class="dbx-link${_resolved(l) ? ' is-resolved' : ''}">
                    <div class="dbx-link-side">
                        <button class="dep-detail-key" data-ticket-id="${esc(l.from)}">${esc(l.from)}</button>
                        <span class="dbx-link-title" title="${esc(l.fromItem.title || '')}">${esc(l.fromItem.title || '')}</span>
                    </div>
                    <span class="dbx-link-arrow" title="dépend de / est bloqué par">attend ⟶</span>
                    <div class="dbx-link-side">
                        <button class="dep-detail-key" data-ticket-id="${esc(l.to)}">${esc(l.to)}</button>
                        <span class="dbx-link-title" title="${esc(l.toItem.title || '')}">${esc(l.toItem.title || '')}</span>
                        ${statusBadge(l.toItem, { size: '2xs' })}
                    </div>
                </div>`).join('')}
            </div>`;
        detail.querySelectorAll('.dep-detail-key[data-ticket-id]').forEach(b =>
            b.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(b.dataset.ticketId)));
        detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    container.querySelectorAll('[data-dep-from]').forEach(el => {
        el.addEventListener('click', () => show(el));
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(el); } });
    });
}
