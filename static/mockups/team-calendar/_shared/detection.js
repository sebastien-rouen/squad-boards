/* Page « Détecteur » : couverture par équipe, agendas reliés (avec alertes), file « À positionner », règles.
 * Calculée en direct sur l'extrait de 5 semaines ; le chiffre annuel (3 580 évènements) est dans README.md. */
(function () {
    'use strict';
    const T = window.TC, C = T.C, D = T.D, esc = T.esc;
    const root = document.getElementById('det');
    const KINDS = Object.keys(C.NATURES);

    function teamStats(team) {
        const evs = T.eventsFor(team).filter(e => e.scope === 'team' || e.scope === 'group');
        const by = {}; KINDS.forEach(k => { by[k] = 0; });
        evs.forEach(e => { by[e.kind]++; });
        const masked = by.busy, known = evs.length - by.other - masked;
        const denom = evs.length - masked;
        return { team, n: evs.length, by, masked, other: by.other, pct: denom ? Math.round(known / denom * 100) : null };
    }

    function calendarsHtml() {
        const n = Object.fromEntries(D.calendars.map(c => [c.id, 0]));
        D.events.forEach(e => { n[e[0]] = (n[e[0]] || 0) + 1; });
        const own = new Set(D.calendars.flatMap(c => c.team.split(',').map(s => s.trim()).filter(Boolean)));
        const rows = D.calendars.map(c => {
            const teams = c.team.split(',').map(s => s.trim()).filter(Boolean);
            const scope = !teams.length ? (/op[ée]rations/i.test(c.name) ? 'ops' : 'train') : teams.length === 1 ? 'team' : 'group';
            let alert = '';
            // Agenda « d'équipe » déclaré partagé : ses rituels apparaissent chez les autres (Kadjar → Juke)
            const named = D.teams.find(t => new RegExp(`\\b${t.name}\\b`, 'i').test(c.name));
            if (named && teams.length > 1) alert = `⚠️ Agenda de ${esc(named.name)} déclaré partagé avec ${esc(teams.filter(t => t !== named.name).join(', '))} : ses rituels s'affichent aussi chez eux.`;
            const busy = D.events.filter(e => e[0] === c.id && C.nature(e[1]) === 'busy').length;
            if (busy && busy === n[c.id]) alert = `🔒 Partagé en « disponibilités seulement » : ${busy} créneaux « Busy », aucun titre lisible.`;
            return `<tr><td><b>${esc(c.name)}</b></td><td>${C.SCOPES[scope].icon} ${C.SCOPES[scope].label}${teams.length > 1 ? ` · ${esc(teams.join(', '))}` : ''}</td>
                <td class="num">${n[c.id] || 0}</td><td>${alert || '<span class="ok">✓</span>'}</td></tr>`;
        }).join('');
        const orphans = D.teams.filter(t => !own.has(t.name)).map(t => t.name);
        return `<table class="ix-table"><thead><tr><th>Agenda</th><th>Portée</th><th class="num">Évts (5 sem.)</th><th>État</th></tr></thead><tbody>${rows}</tbody></table>
            ${orphans.length ? `<p class="det-note">📭 <b>Sans agenda relié :</b> ${orphans.map(esc).join(', ')} — leur page Équipe affichera l'état « Relier un agenda ».</p>` : ''}`;
    }

    function teamsHtml() {
        const stats = D.teams.map(t => teamStats(t.name)).sort((a, b) => b.n - a.n);
        return `<table class="ix-table det-teams"><thead><tr><th>Équipe</th><th class="num">Évts</th><th class="num">Détectés</th><th>Répartition des natures</th></tr></thead><tbody>
        ${stats.map(s => `<tr><td><span class="det-sw" style="background:${T.teamColor(s.team)}"></span>${esc(s.team)}</td>
            <td class="num">${s.n}</td>
            <td class="num">${s.n ? (s.masked === s.n ? '🔒 masqué' : `<b>${s.pct} %</b>`) : '—'}</td>
            <td>${s.n ? `<div class="det-bar" role="img" aria-label="Répartition">${KINDS.filter(k => s.by[k]).map(k => `<span data-k="${k}" style="flex:${s.by[k]}" title="${esc(C.NATURES[k].label)} : ${s.by[k]}"></span>`).join('')}</div>` : '<span class="muted">sans agenda</span>'}</td></tr>`).join('')}
        </tbody></table>
        <div class="det-legend">${KINDS.map(k => `<span class="tc-chip" data-k="${k}" aria-pressed="true">${C.NATURES[k].emoji} ${esc(C.NATURES[k].label)}</span>`).join('')}</div>`;
    }

    function queueHtml() {
        const o = T.overrides();
        const map = new Map();
        D.events.forEach(([calId, title]) => {
            const k = C.norm(title);
            if (C.nature(title) !== 'other' && !o[k]) return;
            const cal = D.calendars.find(c => c.id === calId);
            const cur = map.get(k) || { title, n: 0, cals: new Set() };
            cur.n++; cur.cals.add(cal ? cal.name.replace(/^ERPC - /, '') : '?');
            map.set(k, cur);
        });
        const items = [...map.entries()].sort((a, b) => b[1].n - a[1].n);
        const todo = items.filter(([k]) => !o[k]).length;
        return `<p class="det-note">${todo ? `<b>${todo} titres</b> restent à ranger sur l'extrait — ` : '<b>Tout est rangé.</b> '}un choix vaut pour toutes les occurrences, dans toutes les équipes. Brouillon en localStorage dans la maquette.</p>
        <div class="det-queue">${items.map(([k, it]) => `<div class="det-q${o[k] ? ' is-done' : ''}">
            <div><b>${esc(it.title)}</b><small>${it.n} occurrence${it.n > 1 ? 's' : ''} · ${esc([...it.cals].join(', '))}</small></div>
            <select data-title="${esc(it.title)}" aria-label="Classer « ${esc(it.title)} »">
                <option value="">— Choisir une nature —</option>
                ${KINDS.filter(x => x !== 'other').map(x => `<option value="${x}" ${o[k] === x ? 'selected' : ''}>${C.NATURES[x].emoji} ${esc(C.NATURES[x].label)}</option>`).join('')}
            </select></div>`).join('')}</div>`;
    }

    function rulesHtml() {
        const src = re => re.source.replace(/\\s\*/g, ' ').replace(/\\b/g, '').replace(/\\s/g, ' ').replace(/\\/g, '');
        return `<ol class="det-rules">
            <li><span class="tc-chip" data-k="support" aria-pressed="true">🛎️ Support</span><code>titre qui commence par 🧰</code><small>rotation de Kadjar — l'emoji est l'information</small></li>
            ${C.RULES.map(([k, re]) => `<li><span class="tc-chip" data-k="${k}" aria-pressed="true">${C.NATURES[k].emoji} ${esc(C.NATURES[k].label)}</span><code>${esc(src(re))}</code></li>`).join('')}
            <li><span class="tc-chip" data-k="other" aria-pressed="true">📌 Autre</span><code>aucune règle</code><small>→ file « À positionner »</small></li>
        </ol>`;
    }

    function render() {
        root.innerHTML = `
        <div class="det-tiles">
            <div class="det-tile"><b>97,3 %</b><span>des 3 580 évènements réels rangés automatiquement (tous agendas, toute l'année)</span></div>
            <div class="det-tile"><b>13 + 4</b><span>natures + portées — la couleur dit « quoi », l'étiquette dit « à qui »</span></div>
            <div class="det-tile"><b>155</b><span>créneaux masqués (Lion) : ni devinables, ni à deviner — à régler côté partage</span></div>
        </div>
        <div class="gal-group" id="equipes">Par équipe — extrait du 14/09 au 18/10</div>${teamsHtml()}
        <div class="gal-group" id="agendas">Agendas reliés</div>${calendarsHtml()}
        <div class="gal-group" id="positionner">À positionner</div>${queueHtml()}
        <div class="gal-group" id="regles">Règles, dans l'ordre (la première qui correspond gagne)</div>${rulesHtml()}`;
        root.querySelectorAll('select[data-title]').forEach(s => s.addEventListener('change', () => { T.setOverride(s.dataset.title, s.value || null); render(); }));
    }

    document.querySelector('[data-theme-toggle]').addEventListener('click', e => {
        e.preventDefault();
        const h = document.documentElement; h.dataset.theme = h.dataset.theme === 'light' ? 'dark' : 'light';
    });
    render();
})();
