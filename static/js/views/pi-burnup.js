/**
 * 📈 Page PI → Burnup multi-équipes : story points livrés par sprint du PI, cumulés par équipe.
 *
 * Extrait de pi.js (3.258.0), code déplacé à l'identique. N'importe jamais pi.js (pas de cycle).
 */
import { store } from '../state.js';
import { esc, sumBy, extractPiNum, sprintRealizedVelocity } from '../utils.js';
import { TEAM_COLORS } from '../config.js';
import { registerExternalChart } from '../components/charts.js';

// Cumule les Story Points livrés par sprint du PI courant, agrégé par équipe.
// Référentiel : `sprintInfo.teamSprints[]` (sprints clos + actif) filtrés par PI.
// Le commitment = somme des engagements (estimated) des sprints du PI ; fallback
// sur la velocité historique moyenne × nb sprints si pas d'estimated.
export function renderBurnup(el, { piInfo, teams, teamObjects }) {
    const sprintInfo = store.get('sprintInfo');
    const allTeamSprints = sprintInfo?.teamSprints || [];
    const tickets = store.get('tickets') || [];
    const team = store.get('team');
    const teamFilter = team && team !== 'all';
    // PI courant décalé par le sélecteur topbar (piOffset = -2..+2)
    const _basePi = _extractPi(sprintInfo?.name) || piInfo?.number;
    const _piOffset = store.get('piOffset') || 0;
    const piNumber = _basePi ? Math.max(1, _basePi + _piOffset) : 0;

    if (!piNumber) {
        el.innerHTML = `<div class="empty-state"><p class="text-muted">Numéro de PI introuvable — configure le PI dans Paramètres ou synchronise.</p></div>`;
        return;
    }

    // 1. Filtre les sprints du PI courant (nom contient PI{n} ou {n}.x)
    const piSprints = allTeamSprints.filter(s =>
        _sprintInPi(s.name, piNumber) && (!teamFilter || s.team === team)
    );
    if (!piSprints.length) {
        el.innerHTML = `<div class="empty-state">
            <p class="text-muted">Aucun sprint trouvé pour le PI#${piNumber}${teamFilter ? ` côté ${esc(team)}` : ''}.</p>
        </div>`;
        return;
    }

    // 2. Groupe par sprint name (le même PI sprint peut exister pour plusieurs équipes)
    const sprintNames = [...new Set(piSprints.map(s => s.name))]
        .sort((a, b) => _sprintOrder(a) - _sprintOrder(b));
    const teamsInPi = [...new Set(piSprints.map(s => s.team))];

    // 3. Pour chaque (sprint, équipe) : vélocité réalisée (sprintRealizedVelocity)
    const velMatrix = {}; // { team: { sprintName: velocity } }
    for (const s of piSprints) {
        if (!velMatrix[s.team]) velMatrix[s.team] = {};
        const v = sprintRealizedVelocity(tickets, s) ?? 0;   // même mesure que Santé
        velMatrix[s.team][s.name] = v;
    }

    // 4. Cumul par équipe
    const cumByTeam = {}; // { team: [cumul_after_sprint_0, cumul_after_sprint_1, ...] }
    for (const tm of teamsInPi) {
        let cum = 0;
        cumByTeam[tm] = sprintNames.map(n => {
            cum += velMatrix[tm][n] || 0;
            return cum;
        });
    }
    // Cumul total cross-team
    const cumTotal = sprintNames.map((_, i) =>
        teamsInPi.reduce((s, tm) => s + (cumByTeam[tm][i] || 0), 0));

    // 5. Engagement total = somme des estimated des sprints du PI (par équipe)
    const commitmentTotal = sumBy(piSprints, s => s.estimated || 0);

    // 6. Couleurs équipes
    const teamColor = (name) => {
        const obj = (teamObjects || []).find(o => o.name === name);
        if (obj?.color) return obj.color;
        const idx = (teams || []).indexOf(name);
        return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0];
    };

    el.innerHTML = `
        <div class="pi-burnup pi-card">
            <div class="pi-burnup-hdr">
                <div>
                    <h3 class="pi-burnup-title">PI#${piNumber} Burnup ${teamFilter ? `— ${esc(team)}` : '— toutes équipes'}</h3>
                    <p class="pi-burnup-sub">${sprintNames.length} sprint${sprintNames.length > 1 ? 's' : ''} · ${teamsInPi.length} équipe${teamsInPi.length > 1 ? 's' : ''} · cumul SP livrés vs engagement</p>
                </div>
                <div class="pi-burnup-kpis">
                    ${commitmentTotal > 0 ? `<span class="pi-burnup-kpi"><span class="lbl">Engagement</span><strong>${commitmentTotal} pts</strong></span>` : ''}
                    <span class="pi-burnup-kpi pi-burnup-kpi--accent"><span class="lbl">Livré (à date)</span><strong>${cumTotal[cumTotal.length - 1] || 0} pts</strong></span>
                    ${commitmentTotal > 0 ? `<span class="pi-burnup-kpi"><span class="lbl">% atteint</span><strong>${Math.round((cumTotal[cumTotal.length - 1] / commitmentTotal) * 100)}%</strong></span>` : ''}
                    ${commitmentTotal > 0 ? `<span class="pi-burnup-kpi${(cumTotal[cumTotal.length - 1] || 0) >= commitmentTotal ? ' pi-burnup-kpi--ok' : ''}"><span class="lbl">Reste</span><strong>${Math.max(0, commitmentTotal - (cumTotal[cumTotal.length - 1] || 0))} pts</strong></span>` : ''}
                </div>
            </div>
            <div class="chart-container chart-h-md"><canvas id="pi-burnup-chart"></canvas></div>
            <div class="pi-burnup-legend">
                ${teamsInPi.map(tm => `
                    <span class="pi-burnup-leg-item">
                        <span class="pi-burnup-leg-dot" style="background:${teamColor(tm)}"></span>
                        ${esc(tm)}
                        <span class="pi-burnup-leg-pts">${velMatrix[tm] ? sumBy(sprintNames, n => velMatrix[tm][n] || 0) : 0} pts</span>
                    </span>
                `).join('')}
            </div>
        </div>`;

    // Construit le graphique dans un canvas cible (id) — réutilisé par le zoom plein écran.
    const _buildPiBurnup = (targetId) => {
        if (!window.Chart) return;
        const ctx = document.getElementById(targetId)?.getContext('2d');
        if (!ctx) return;

        // Datasets : une ligne par équipe (cumul) + ligne totale (gras) + commitment horizontal
        const teamDatasets = teamsInPi.map(tm => ({
            label: tm,
            data: cumByTeam[tm],
            borderColor: teamColor(tm),
            backgroundColor: teamColor(tm) + '15',
            borderWidth: 1.5,
            pointRadius: 3,
            tension: 0.25,
            fill: false,
        }));
        const totalDataset = {
            label: 'Total livré',
            data: cumTotal,
            borderColor: '#0f172a',
            backgroundColor: 'rgba(15,23,42,0.08)',
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.25,
            fill: true,
            order: -1,
        };
        const datasets = [totalDataset, ...teamDatasets];
        if (commitmentTotal > 0) {
            datasets.push({
                label: `Engagement (${commitmentTotal} pts)`,
                data: sprintNames.map(() => commitmentTotal),
                borderColor: '#94a3b8',
                borderDash: [5, 5],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
            });
        }

        new window.Chart(ctx, {
            type: 'line',
            // Axe : « 31.1 » plutôt que « Team G - Ité 31.1 » (le nom complet reste dans l'infobulle)
            data: { labels: sprintNames.map(n => (n.match(/(\d+\.\d+)/) || [])[1] || n), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { right: 18 } },   // le dernier libellé (« 31.5 ») était coupé au bord
                plugins: {
                    legend: { display: false }, // on a notre propre legend HTML
                    tooltip: { mode: 'index', callbacks: { title: items => sprintNames[items[0]?.dataIndex] || '' } },
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Story Points (cumulé)' } },
                    x: { title: { display: true, text: 'Sprints du PI' } },
                },
            },
        });
    };

    requestAnimationFrame(() => {
        _buildPiBurnup('pi-burnup-chart');
        // Rend le graphique zoomable (popin plein écran) avec une explication contextuelle.
        registerExternalChart('pi-burnup-chart', 'piburnup',
            `PI#${piNumber} Burnup ${teamFilter ? `— ${team}` : '— toutes équipes'}`, _buildPiBurnup);
    });
}

// Wrapper local sur extractPiNum (utils) — conserve la sémantique null pour les call sites pi.js.
export function _extractPi(name) {
    return extractPiNum(name) || null;
}
function _sprintInPi(sprintName, piNumber) {
    if (!sprintName || !piNumber) return false;
    const s = String(sprintName);
    // Matche {pi}.{x} ou PI{pi} ou PI#{pi}
    return new RegExp(`(^|\\b)${piNumber}\\.\\d+`).test(s) ||
           new RegExp(`PI\\s*#?\\s*${piNumber}(?!\\d)`, 'i').test(s);
}
function _sprintOrder(name) {
    // Tri par numéro de sprint dans le PI (e.g. "Ité 29.4" → 4)
    const m = String(name).match(/\.(\d+)/);
    return m ? parseInt(m[1], 10) : 999;
}
