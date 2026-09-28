/* Amorce du cadre : lit l'URL, pose le thème, l'en-tête d'équipe (balisage RÉEL de team.js) et la carte. */
(function () {
    'use strict';
    const T = window.TC, esc = T.esc;
    const q = new URLSearchParams(location.search);
    const DIRS = { week: 'a-semaine', lanes: 'b-couloirs', mosaic: 'c-mosaique', hybrid: 'd-synthese' };
    const dir = DIRS[q.get('dir')] ? q.get('dir') : 'week';
    const team = q.get('team') || 'Gabbiano';

    document.documentElement.dataset.theme = q.get('theme') === 'light' ? 'light' : 'dark';
    // La feuille de direction est déjà posée dans <head> (frame.html) : rien à basculer ici
    // Le cadre embarqué n'a pas besoin de défiler jusqu'à la fiche : on coupe le superflu
    if (q.get('compact') === '1') document.body.classList.add('tcf-compact');

    document.getElementById('crumb').innerHTML =
        `<span class="bc-seg bc-seg--view">🪪 <span>Équipe</span></span><span class="bc-sep">›</span><span class="bc-seg bc-seg--team"><span class="bc-dot"></span>${esc(team)}</span>`;

    // En-tête d'équipe : même balisage que views/team.js (team-id-header), roster du PI 31
    const color = T.teamColor(team);
    const roster = (T.D.rosters[team] || []).slice().sort((a, b) => (a.role || 'zz').localeCompare(b.role || 'zz', 'fr') || a.name.localeCompare(b.name, 'fr'));
    const ini = n => n.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    document.getElementById('team-header').innerHTML = `
        <div class="team-id-header card">
            <div class="team-id-header-left">
                <span class="team-id-swatch" style="background:${color}">${esc(team.slice(0, 2).toUpperCase())}</span>
                <div class="team-id-header-info"><h2>${esc(team)}</h2></div>
            </div>
            <div class="team-id-roster">
                <span class="team-id-roster-label">Membres (${roster.length})</span>
                <div class="team-id-roster-list">${roster.map(m => `
                    <button type="button" class="team-id-member-chip${m.role ? ' has-role' : ''}" data-role="${esc(m.role)}" title="${esc(m.role ? `${m.name} — ${m.role}` : m.name)}">
                        <span class="assignee-avatar" style="background:hsl(${[...m.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 55% 50%)">${esc(ini(m.name))}</span>
                        <span class="team-id-member-name">${esc(m.name)}</span>
                    </button>`).join('')}
                </div>
            </div>
        </div>`;

    const list = s => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : []);
    window.TCApp.mount(document.getElementById('tc-mount'), {
        dir, team, compare: list(q.get('cmp')), period: q.get('period') || (dir === 'week' || dir === 'hybrid' ? 'week' : 'iteration'),
        state: q.get('state') || 'nominal', banner: q.get('banner'), popOpen: q.get('pop') === '1',
        select: q.get('select'), anchor: q.get('day') || undefined,
        kinds: q.get('kinds') ? list(q.get('kinds')) : undefined, scopes: q.get('scopes') ? list(q.get('scopes')) : undefined,
    });
})();
