/**
 * Direction D — 🚨 SIGNAUX : l'action d'abord.
 * L'Atlas comme boîte de réception : risques et opportunités triés par urgence, chacun avec ses
 * actions (former, binôme, prêt, mobilité) et un suivi jusqu'à résolution. Les vues d'exploration
 * (carte, matrice) passent au second plan, derrière un registre des risques par compétence.
 */
const U = require('./ui.cjs');
const C = require('./common.cjs');
const PC = require('./pages-common.cjs');
const { D, av, lvl, chip, btn, bar, esc, tc, teamDot, screen, topbar, tabbar, desk, deskTop } = U;

const dir = {
    key: 'd-signaux', num: 4, name: 'Signaux', nextName: 'Constellation', mod: '', icon: '🚨',
    pitch: 'L\'action d\'abord : une boîte de réception des risques et opportunités, chacun avec ses réponses, suivis jusqu\'à résolution.',
    traits: ['Boîte de réception', 'Actions en un clic', 'Registre des risques', 'Options comparées', 'Plan d\'action du train'],
    plus: 'Directement actionnable ; transforme l\'Atlas en outil de pilotage (on décide, on suit). Les opportunités comptent autant que les risques.',
    minus: 'Peu d\'exploration : « qui sait quoi » sans problème à résoudre se lit mal ; dépend de la qualité des règles de détection.',
    moment: 'Pilotage hebdo du train, préparation d\'un PI Planning.',
};

const KPIS = [['2', 'bus factor 1', 'danger'], ['1', 'trou de couverture', 'danger'], ['7', 'évaluations > 6 mois', 'warn'], ['3', 'montées en cours', 'ok']];
const kpiStrip = (n = 4) => `<div class="kpis kpis--4">${KPIS.slice(0, n).map(([v, l, m]) => `<div class="kpi kpi--${m}"><span class="kpi__v">${v}</span><span class="kpi__l">${l}</span></div>`).join('')}</div>`;
const filters = () => `<div class="toolbar">${[['Tous', 5], ['🚌 Bus factor', 1], ['🕳️ Trous', 1], ['🛡️ Faiblesses', 1], ['✨ Opportunités', 1], ['📈 Progrès', 1]].map(([l, n], i) => chip(`${l} <em>${n}</em>`, i === 0 ? 'on' : '')).join('')}<span class="spacer"></span>${btn('🔕 Masquer les résolus', 'sm ghost')}</div>`;

const ACTIONS = [
    { who: 'Hugo Bernard', what: 'Binôme Kafka avec Noah', due: 'avant le 31 oct.', state: 'En cours', pct: 60 },
    { who: 'Noah Roux', what: 'Documenter le partitionnement Kafka', due: '31 oct.', state: 'Décidé', pct: 20 },
    { who: 'Lina Fournier', what: 'Animer 2 rétros Cobalt', due: '14 nov.', state: 'En cours', pct: 50 },
];
const actionRow = a => `<div class="row">${av(D.person(a.who), 'sm')}<span class="row__main"><b>${esc(a.what)}</b><span class="row__meta">${esc(a.who.split(' ')[0])} · ${a.due} · ${a.state}</span></span><span class="mini-bar">${bar(a.pct, a.pct >= 50 ? 'ok' : '')}</span></div>`;
const coverRows = () => Object.keys(D.REQUIRED).map(t => { const c = D.coverage(t); return `<div class="cov">${teamDot(t)}<b>${esc(t)}</b>${bar(c.pct, c.pct < 100 ? 'danger' : 'ok')}<small>${c.pct} %</small></div>`; }).join('');

/* ── 01 ─ */
function p01() {
    return {
        key: '01-atlas', title: 'Écran principal',
        sub: 'L\'Atlas ouvre sur ce qui demande une action : risques et opportunités triés par urgence, chacun avec ses réponses en un clic.',
        deskNote: 'boîte de réception des signaux + couverture et actions en cours en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('signaux', '📊 Tableau de bord', `<span class="since">Mis à jour il y a 2 h</span>`), body: kpiStrip() + filters() + `<div class="inbox">${C.SIGNALS.map(s => C.signalCard(s)).join('')}</div>`,
            side: `<h3>🛡️ Couverture des équipes</h3>${coverRows()}<h3>🏃 Actions en cours</h3>${ACTIONS.map(actionRow).join('')}${btn('Voir le plan d\'action →', 'sm ghost')}` }),
        solo: screen({ solo: true, top: topbar('Signaux', { sub: '5 à traiter · 2 urgents', actions: btn('⚙️', 'icon ghost') }),
            body: `${kpiStrip(3)}<div class="chips-row">${['Tous 5', '🚌 1', '🕳️ 1', '🛡️ 1', '✨ 1'].map((l, i) => chip(l, i === 0 ? 'on' : '')).join('')}</div>${C.SIGNALS.slice(0, 3).map(s => C.signalCard(s)).join('')}`,
            tabbar: tabbar('bord') }),
        notes: [
            '<strong>Une liste de choses à faire</strong>, pas une carte à explorer : chaque signal dit quoi, qui, où, et propose ses actions (binôme, documentation, formation, prêt, trajectoire).',
            '<strong>Les opportunités comptent aussi</strong> : une envie non exploitée (Lina) ou un progrès en cours (Hugo) sont des signaux, en vert et violet — l\'Atlas n\'est pas qu\'un détecteur de problèmes.',
            '<strong>Le panneau suit l\'exécution</strong> : couverture par équipe et actions décidées, avec leur avancement.',
            '<strong>Limite</strong> : on découvre peu ; pour « qui sait quoi » sans problème à résoudre, il faut passer par le registre (Sections) — la vue la moins inspirante pour présenter le train.',
        ],
    };
}

/* ── 02 ─ */
const TREND = { kafka: '↘', secu: '→', k8s: '↗', factu: '→' };
function p02() {
    const reg = D.SKILLS.map(s => ({ s, n: D.experts(s.id).length, req: Object.keys(D.REQUIRED).filter(t => D.REQUIRED[t].includes(s.id)) }))
        .sort((a, b) => a.n - b.n);
    const riskOf = r => r.n <= 1 ? 'danger' : r.n <= 3 ? 'warn' : 'ok';
    const rowMod = r => (riskOf(r) === 'ok' ? '' : riskOf(r));
    return {
        key: '02-sections', title: 'Sections',
        sub: 'L\'exploration devient un registre des risques par compétence : sachants, bus factor, équipes qui en dépendent, tendance — et l\'action associée.',
        deskNote: 'registre des risques par compétence, tendance en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('registre des risques', '🎯 Matrice'),
            body: `<div class="reg-wrap"><table class="reg"><thead><tr><th>Compétence</th><th>Sachants</th><th>Risque</th><th>Requise par</th><th>Moy.</th><th>Tend.</th><th>Action</th></tr></thead><tbody>${reg.map(r => `<tr${rowMod(r) ? ` class="reg--${rowMod(r)}"` : ''}><td><b>${esc(r.s.label)}</b><small>${esc(r.s.cat)}</small></td><td><span class="faces-xs">${D.experts(r.s.id).slice(0, 5).map(p => av(p, 'xs')).join('')}</span>${r.n > 5 ? `<small>+${r.n - 5}</small>` : ''}</td><td>${chip(r.n <= 1 ? '🚌 bus factor 1' : r.n <= 3 ? 'fragile' : 'solide', riskOf(r))}</td><td>${r.req.map(t => `<span class="tag ${tc(t)}">${esc(t)}</span>`).join('')}</td><td>${String(D.avgLevel(r.s.id)).replace('.', ',')}</td><td class="trend">${TREND[r.s.id] || '→'}</td><td>${r.n <= 3 ? btn('Agir', 'sm primary') : ''}</td></tr>`).join('')}</tbody></table></div>`,
            side: `<h3>📉 Trous de couverture par PI</h3><div class="pi-bars">${[['PI 29', 3], ['PI 30', 2], ['PI 31', 2], ['PI 32', 1]].map(([l, v]) => `<div class="pi-bar"><span style="height:${v * 30}px"></span><small>${l}</small><b>${v}</b></div>`).join('')}</div><div class="callout">Un trou de moins à chaque PI : le plan de formation Kubernetes de Borée a fermé le sien au PI 31.</div>` }),
        phones: [
            { tag: 'Carte', cap: 'Équipes et leurs risques', why: 'L\'organisation réduite à ce qui compte ici : un badge de risque par équipe, le détail au toucher.',
              html: screen({ top: topbar('Équipes'), body: Object.keys(D.REQUIRED).map(t => { const c = D.coverage(t); const sig = C.SIGNALS.filter(s => s.team === t).length; return `<div class="row">${teamDot(t)}<span class="row__main"><b>${esc(t)}</b><span class="row__meta">${D.byTeam(t).length} pers. · couverture ${c.pct} %</span></span>${sig ? `<span class="badge badge--${c.missing.length ? 'danger' : 'warn'}">${sig}</span>` : '<span class="badge badge--ok">✓</span>'}</div>`; }).join(''), tabbar: tabbar('carte') }) },
            { tag: 'Matrice', cap: 'Registre', why: 'Une carte par compétence fragile, triée par nombre de sachants ; les solides sont regroupées en bas.',
              html: screen({ top: topbar('Registre des risques'), body: reg.slice(0, 5).map(r => `<article class="regc${rowMod(r) ? ' regc--' + rowMod(r) : ''}"><div class="inline"><b>${esc(r.s.label)}</b><span class="spacer"></span>${chip(r.n + ' sachant' + (r.n > 1 ? 's' : ''), riskOf(r))}</div><span class="faces-xs">${D.experts(r.s.id).map(p => av(p, 'xs')).join('')}</span><small>Requise par ${r.req.join(', ') || '—'} · tendance ${TREND[r.s.id] || '→'}</small></article>`).join('') + `<small>+ ${reg.length - 5} compétences solides</small>`, tabbar: tabbar('matrice') }) },
            { tag: 'Tableau de bord', cap: 'Les chiffres', why: 'Quatre chiffres et une tendance : est-ce que ça s\'améliore ?',
              html: screen({ top: topbar('Tableau de bord'), body: kpiStrip(4) + `<section class="card"><h4 class="sec-title">Trous de couverture par PI</h4><div class="pi-bars">${[['29', 3], ['30', 2], ['31', 2], ['32', 1]].map(([l, v]) => `<div class="pi-bar"><span style="height:${v * 26}px"></span><small>PI ${l}</small><b>${v}</b></div>`).join('')}</div></section>`, tabbar: tabbar('bord') }) },
            { tag: 'Mobilité', cap: 'Trajectoires', why: 'Section commune.', html: screen({ top: topbar('Mobilité'), body: C.MOBILITY.map(C.mobCard).join(''), tabbar: tabbar('mobilite') }) },
            { tag: 'Catalogue', cap: 'Compétences', why: 'Section commune.', html: screen({ top: topbar('Catalogue', { actions: btn('＋', 'icon primary') }), body: C.catalogBody(), tabbar: tabbar('catalogue') }) },
        ],
        notes: [
            '<strong>La matrice devient un registre</strong> trié par fragilité : on lit d\'abord Kafka (1 sachant) et Sécurité (2), les compétences solides restent en bas.',
            '<strong>Une tendance par PI</strong> : le nombre de trous baisse-t-il ? C\'est la question que pose un manager de train, pas « quel est le niveau moyen en SQL ».',
        ],
    };
}

/* ── 04 ─ */
const OPTIONS = [
    { k: 'former', t: '🎓 Former Manon', d: '2 sprints', r: 'Delta reste découvert d\'ici là', e: 'Manon a l\'envie (appétence forte) ; aucun effet sur les autres équipes.', tag: 'Durable', mod: '' },
    { k: 'pret', t: '🔀 Prêt de Théo (Éole)', d: 'Immédiat', r: 'Éole −1 personne, 3 tickets à réattribuer', e: 'Delta couvert à 100 % dès le sprint 32.1 ; Éole garde Camille (4) et Alice (2).', tag: 'Rapide', mod: 'on' },
    { k: 'mix', t: '🤝 Prêt + formation', d: 'Immédiat, puis 2 sprints', r: 'Théo mobilisé à mi-temps', e: 'Théo couvre et forme Manon en binôme ; retour chez Éole au PI 33.', tag: 'Recommandé', mod: 'best' },
];
const option = o => `<article class="opt${o.mod ? ' opt--' + o.mod : ''}"><div class="inline"><b>${o.t}</b><span class="spacer"></span>${chip(o.tag, o.mod === 'best' ? 'ok' : o.mod === 'on' ? 'on' : '')}</div><dl><dt>Délai</dt><dd>${o.d}</dd><dt>Risque</dt><dd>${o.r}</dd><dt>Effets</dt><dd>${o.e}</dd></dl>${btn(o.mod === 'best' ? '✓ Retenir' : 'Simuler', o.mod === 'best' ? 'sm primary' : 'sm')}</article>`;

function p04() {
    return {
        key: '04-atelier', title: 'Atelier de staffing',
        sub: 'Pour un signal, l\'atelier compare des OPTIONS (former, prêter, les deux) avec leur délai, leur risque et leurs effets — on décide, puis on suit.',
        deskNote: 'trois options pour le trou de Delta, simulation de l\'option sélectionnée en panneau',
        desk: desk({ mod: dir.mod, top: deskTop('décider', '📊 Tableau de bord'), body: C.signalCard(C.SIGNALS[1], true) + `<div class="opts">${OPTIONS.map(option).join('')}</div><section class="card"><div class="card__head"><h3>📋 Plan d'action du train</h3></div><div class="plan">${['À traiter', 'Décidé', 'En cours', 'Résolu'].map((st, i) => `<div class="plan__col"><h4>${st}</h4>${[[C.SIGNALS[2]], [C.SIGNALS[1]], [C.SIGNALS[0], C.SIGNALS[3]], [C.SIGNALS[4]]][i].map(s => `<span class="plan__item sig--${s.sev}">${s.icon} ${s.title}</span>`).join('')}</div>`).join('')}</div></section>`,
            side: `<h3>🔀 Option « Prêt de Théo »</h3>${C.simImpact()}` }),
        phones: [
            { tag: 'Options', cap: 'Trois réponses au trou de Delta', why: 'Chaque option dit son délai, son risque et ses effets : la comparaison se fait sans tableau croisé.',
              html: screen({ top: topbar('Décider', { back: true, sub: 'Delta · Kubernetes' }), body: OPTIONS.map(option).join('') }) },
            { tag: 'Simulation', cap: 'Option « Prêt de Théo »', why: 'Simuler une option ouvre le même avant / après que les autres directions.', html: screen({ top: topbar('Option', { back: true, sub: 'Prêt de Théo' }), body: C.simBanner() + C.simImpact() }) },
            PC.phoneAlert(),
            PC.phoneEmpty(),
        ],
        notes: [
            '<strong>On ne déplace pas des gens, on choisit une réponse</strong> : l\'atelier part du problème (Delta sans Kubernetes) et compare des options chiffrées.',
            '<strong>L\'option mixte est mise en avant</strong> parce qu\'elle règle le court terme ET le long terme ; la décision reste humaine (« Retenir »).',
            '<strong>Le plan d\'action du train</strong> suit chaque signal jusqu\'à « Résolu » : l\'Atlas devient un outil de pilotage, plus seulement de constat.',
        ],
    };
}

const backdrop = () => kpiStrip() + filters() + `<div class="inbox">${C.SIGNALS.map(s => C.signalCard(s)).join('')}</div>`;
const backdropMobile = () => C.SIGNALS.slice(0, 3).map(s => C.signalCard(s, true)).join('');

module.exports = {
    dir,
    pages: () => [p01(), p02(),
        PC.p03(dir, { backdrop, backdropMobile, notes: ['<strong>Les modales naissent des signaux</strong> : « Binôme avec Hugo » ouvre directement le ticket de montée en compétence prérempli.', '<strong>« Qui affecter ? »</strong> est l\'action naturelle d\'un trou de couverture.', '<strong>Suppression annulable</strong> dans le catalogue.'] }),
        p04(),
        PC.p05(dir, { notes: ['<strong>Une trajectoire est un signal positif suivi</strong> : elle apparaît dans la boîte de réception à chaque étape à décider.', '<strong>Son coût pour l\'équipe</strong> devient lui-même un signal (Angular chez Cobalt) si la relève n\'est pas prévue.'] })],
};
