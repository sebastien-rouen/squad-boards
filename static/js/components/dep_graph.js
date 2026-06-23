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

import { esc, hashColor } from '../utils.js';

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

/**
 * HTML du "programme board" : matrice équipe (dépend) × équipe (dont elle dépend).
 * Les cellules inter-équipes non vides sont cliquables (data-dep-from / data-dep-to).
 */
export function renderTeamDepBoard(items, teamObjects = []) {
    const { teamEdges, teams, crossCount, edges } = computeTeamDependencies(items);
    if (!edges.length) {
        return `<div class="empty-state"><p>Aucune dépendance bloquante détectée sur ce périmètre.</p>
            <p class="text-xs text-muted mt-1">Les dépendances proviennent des liens JIRA « bloque / est bloqué par / dépend de » entre tickets, epics et features synchronisés.</p></div>`;
    }
    const countByKey = new Map(teamEdges.map(te => [`${te.from}→${te.to}`, te]));
    const dot = t => `<span class="dep-team-dot" style="background:${esc(_teamColor(t, teamObjects))}"></span>`;

    const headRow = `<tr><th class="dep-mx-corner" title="Lignes : équipe qui dépend · Colonnes : équipe dont elle dépend">dépend ↓ / de →</th>${teams.map(t => `<th class="dep-mx-col">${dot(t)}<span>${esc(t)}</span></th>`).join('')}</tr>`;
    const bodyRows = teams.map(rt => {
        const cells = teams.map(ct => {
            const te = countByKey.get(`${rt}→${ct}`);
            if (!te) return `<td class="dep-mx-cell dep-mx-empty">·</td>`;
            const cross = rt !== ct;
            return `<td class="dep-mx-cell${cross ? ' dep-mx-cross' : ' dep-mx-intra'}" data-dep-from="${esc(rt)}" data-dep-to="${esc(ct)}" title="${esc(rt)} dépend de ${esc(ct)} — ${te.count} lien${te.count > 1 ? 's' : ''}${cross ? ' (inter-équipes)' : ' (interne)'} · cliquer pour le détail">${te.count}</td>`;
        }).join('');
        return `<tr><th class="dep-mx-row">${dot(rt)}<span>${esc(rt)}</span></th>${cells}</tr>`;
    }).join('');

    return `
        <div class="dep-board">
            <div class="dep-board-summary">
                <span class="dep-board-kpi ${crossCount > 0 ? 'dep-board-kpi--warn' : ''}">${crossCount}</span>
                <span class="text-sm text-muted">dépendance${crossCount > 1 ? 's' : ''} inter-équipes${edges.length !== crossCount ? ` · ${edges.length - crossCount} interne${edges.length - crossCount > 1 ? 's' : ''}` : ''}</span>
            </div>
            <div class="table-wrap dep-mx-wrap">
                <table class="dep-mx-table">
                    <thead>${headRow}</thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>
            <div class="dep-board-detail" id="dep-board-detail" hidden></div>
        </div>`;
}

/** Bind les clics sur les cellules de la matrice → liste détaillée des liens sous la table. */
export function bindTeamDepBoard(container, items) {
    const detail = container.querySelector('#dep-board-detail');
    if (!detail) return;
    const { teamEdges } = computeTeamDependencies(items);
    const byKey = new Map(teamEdges.map(te => [`${te.from}→${te.to}`, te]));
    container.querySelectorAll('.dep-mx-cell[data-dep-from]').forEach(cell => {
        cell.addEventListener('click', () => {
            const te = byKey.get(`${cell.dataset.depFrom}→${cell.dataset.depTo}`);
            if (!te) return;
            container.querySelectorAll('.dep-mx-cell.is-selected').forEach(c => c.classList.remove('is-selected'));
            cell.classList.add('is-selected');
            detail.hidden = false;
            detail.innerHTML = `
                <div class="dep-detail-hdr"><strong>${esc(te.from)}</strong> dépend de <strong>${esc(te.to)}</strong> — ${te.count} lien${te.count > 1 ? 's' : ''}</div>
                <div class="dep-detail-list">
                    ${te.links.map(l => `
                        <div class="dep-detail-row">
                            <button class="dep-detail-key" data-ticket-id="${esc(l.from)}" title="${esc(l.fromItem.title || '')}">${esc(l.from)}</button>
                            <span class="dep-detail-arrow" title="dépend de / bloqué par">⟶</span>
                            <button class="dep-detail-key" data-ticket-id="${esc(l.to)}" title="${esc(l.toItem.title || '')}">${esc(l.to)}</button>
                            <span class="dep-detail-title">${esc((l.toItem.title || '').slice(0, 60))}</span>
                        </div>`).join('')}
                </div>`;
            detail.querySelectorAll('.dep-detail-key[data-ticket-id]').forEach(b =>
                b.addEventListener('click', () => window.__squadBoard?.openTicketModal?.(b.dataset.ticketId)));
        });
    });
}
