/**
 * Mode TV — ce que l'écran mural affiche seul, sans chrome, en rotation.
 *
 * Sept écrans tournent (météo du train → sprint en cours → plans d'action → qui est là → sprint
 * review → la semaine en bref → aujourd'hui ; le soir : fin de journée + review), et l'alerte
 * s'impose en tête de cycle tant qu'un **blocker > 48 h** existe dans le périmètre : elle nomme le
 * ticket, l'équipe, le responsable et depuis quand. Sur les autres écrans, un bandeau rouge la
 * rappelle (cliquable : l'alerte, ou les seuls blockers d'une équipe) — elle ne bloque pas la
 * rotation, elle la précède à chaque tour, jusqu'à ce que le ticket bouge. Sans blocker > 48 h, c'est
 * l'écran ✅ Zéro blocker qui ouvre le tour (le jour : la nuit garde son bilan).
 *
 * Modules : tv-screens.js (qui est là + briques partagées), tv-sprint.js (sprint en cours), tv-week.js (la semaine),
 * tv-live.js (rechargement après synchro, écran allumé, tickets terminés salués), tv-settings.js (⚙).
 * Périmètre = celui du topbar (toutes les équipes, une ligne produit, ou une équipe).
 * Entrées : bouton 📺 du topbar, `#tv`, `#tv/<équipe>` ; `#tv/all/<écran>` fige un écran.
 * Clavier : ← → écran précédent / suivant · Espace pause · F plein écran · Échap sortie.
 */

import { store } from '../state.js';
import { esc, getCurrentPi, sumBy, sprintScope, METEO_GLYPH, METEO_LABEL, worstLevel, emptyStateHtml } from '../utils.js';
import { ANOMALY_BY_KEY, isPastPi } from '../business_rules.js';
import { meteoMatrixHtml, meteoContext, computeTeamMeteo } from '../components/meteo_matrix.js';
import { meteoPlanHtml } from '../components/meteo_plan.js';
import { screenSeconds, pageSeconds, nightEnabled, tvTheme, settingsHtml, wireSettings, applyUrlSettings } from './tv-settings.js';
import { tkAttrs, pagedHtml, dayKey, screenPresence, screenZeroBlocker, noteBlockersSeen, presenceEventHtml } from './tv-screens.js';
import { screenWeek, rollDays, weekDayHtml, weekCalEventHtml, weekOffHtml } from './tv-week.js';
import { meteoDetailHtml } from './tv-meteo-detail.js';
import { screenSprint, sprintDayHtml } from './tv-sprint.js';
import { startLive } from './tv-live.js';

const SCREENS = [
    { id: 'meteo',    title: '🌤️ Météo du train',    seconds: 30 },
    { id: 'sprint',   title: '🏃 Sprint en cours',    seconds: 25 },
    { id: 'plans',    title: '🧭 Plans d\'action',     seconds: 25 },
    { id: 'presence', title: '👥 Qui est là',         seconds: 20 },
    { id: 'review',   title: '📈 Sprint review',       seconds: 25 },
    { id: 'semaine',  title: '🗞️ La semaine en bref', seconds: 25 },
    { id: 'journee',  title: '📅 Aujourd\'hui',        seconds: 20 },
];
const ALERT = { id: 'alerte', title: '⛈️ Alerte', seconds: 20 };
// Quand l'alerte disparaît, rien ne le disait : cet écran ouvre le tour et compte les jours sans blocker.
const ZERO = { id: 'zero', title: '✅ Zéro blocker', seconds: 12 };
// Le soir (19 h → 8 h), rotation réduite et tamisée : le bilan — fin de journée et dernière sprint
// review —, pour celui qui part en dernier et pour ne pas faire tourner un mur d'écrans dans un open
// space vide. Réglable (⚙ → Mode nuit). Avant : la fin de journée SEULE, vide passé 19 h sans
// ticket terminé du jour — deux points de rotation (alerte + fin de journée), plus aucun ticket livré.
const NIGHT = [
    { id: 'journee', title: '🌙 Fin de journée', seconds: 60 },
    { id: 'review',  title: '🌙 Sprint review',  seconds: 60 },
];
const _isNight = () => { const h = new Date().getHours(); return nightEnabled() && (h >= 19 || h < 8); };
const PLANS_PER_PAGE = 3;   // Plans d'action : 3 équipes côte à côte par page, les suivantes en rotation
// L'alerte liste TOUS les blockers et défile seule : 20 s pour 3 tickets, puis 2,5 s par ticket en plus (90 s max).
const _alertSeconds = n => Math.min(90, 20 + Math.max(0, n - 3) * 2.5);

let _st = null;   // état de la session TV en cours (timers, écouteurs) — un seul à la fois

function _cleanup() {
    if (!_st) return;
    clearTimeout(_st.timer); clearInterval(_st.clock); clearInterval(_st.pager); cancelAnimationFrame(_st.raf); _st.resizeObs?.disconnect();
    document.removeEventListener('keydown', _st.onKey, true);
    _st.unsubs.forEach(u => u?.());
    document.body.classList.remove('tv-mode');
    _restoreTheme();
    _st = null;
}

// Thème de l'écran (⚙ → Thème, sombre par défaut) : posé sur <html> le temps de la TV — popin ticket et
// fiche membre comprises —, puis le thème du site est rendu à la sortie.
let _siteTheme;   // undefined = rien à restaurer
function _applyTheme() {
    const html = document.documentElement;
    if (_siteTheme === undefined) _siteTheme = html.getAttribute('data-theme');
    const t = tvTheme();
    if (t === 'site') { if (_siteTheme) html.setAttribute('data-theme', _siteTheme); else html.removeAttribute('data-theme'); }
    else html.setAttribute('data-theme', t);
}
function _restoreTheme() {
    if (_siteTheme === undefined) return;
    if (_siteTheme) document.documentElement.setAttribute('data-theme', _siteTheme); else document.documentElement.removeAttribute('data-theme');
    _siteTheme = undefined;
}

/**
 * La racine fait `100vh` PUIS `zoom: var(--tv-zoom)` : le zoom standard agrandit aussi cette hauteur —
 * mesuré : 1 404 px de TV pour un écran de 1 080 (body en overflow: hidden). Le bas sortait de l'écran :
 * fin des journées de « La semaine », pied, dernière rangée des listes paginées (3.199.2). On ramène la
 * hauteur VISUELLE à celle de la fenêtre ; sans zoom effectif (ancien moteur), rien ne change.
 */
function _fitViewport(root) {
    if (!root) return;
    root.style.height = '';
    const visual = root.getBoundingClientRect().height;
    if (visual > innerHeight + 1) root.style.height = `${(root.offsetHeight * innerHeight / visual).toFixed(2)}px`;
}

/** Périmètre : équipes du topbar (toutes, ligne produit, ou une seule). */
function _scope() {
    const all = store.get('teams') || [];
    const team = store.get('team'), groupId = store.get('group');
    if (groupId) {
        const g = (store.get('groups') || []).find(x => x.id === groupId);
        if (g?.teams?.length) return { teams: all.filter(t => g.teams.includes(t)), label: g.name };
    }
    if (team && team !== 'all') return { teams: all.filter(t => t === team), label: team };
    return { teams: all, label: 'toutes les équipes' };
}

// Le changelog JIRA date en « +0200 » : forme ISO « +02:00 » pour un parsing sûr.
const _iso = d => String(d || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
const _hours = iso => Math.floor((Date.now() - new Date(_iso(iso)).getTime()) / 3600000);
const _fmtSince = h => (h >= 48 ? `${Math.floor(h / 24)} j` : `${h} h`);
const _ticketOpen = () => { const mo = document.getElementById('modal-overlay'); return !!mo && !mo.classList.contains('hidden'); };
const _detailOpen = () => { const d = document.getElementById('tv-detail'); return !!d && !d.hidden; };
// Fiche membre (Atlas) ouverte depuis « Qui est là » : sa propre couche, hors de #tv-root.
const _memberCard = () => document.getElementById('atlas-membercard-overlay');
const _modalOpen = () => _ticketOpen() || _detailOpen() || !!_memberCard();
// Jour LOCAL (AAAA-MM-JJ) : toISOString() donnait le jour UTC — faux entre minuit et 2 h.
const _dayKey = dayKey;
const _resolvedDay = t => (t.resolvedDate ? _dayKey(new Date(_iso(t.resolvedDate))) : '');
const _fmtDay = key => new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Fraîcheur des données : l'écran mural ne synchronise jamais lui-même, il montre la dernière synchro
 *  faite ailleurs. La config sprint est réécrite à chaque import JIRA (data.py) → son `updatedAt`
 *  date la synchro. Au-delà de 2 h, un badge le dit (le bandeau « obsolète » du site est masqué ici). */
function _staleHtml() {
    const at = store.get('sprintInfo')?.updatedAt;
    const ms = at ? Date.now() - new Date(_iso(at)).getTime() : 0;
    if (!at || !(ms > 2 * 3600000)) return '';
    const when = new Date(_iso(at)).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<span class="tv-stale" title="Dernière synchro JIRA : ${esc(when)} — lancer une synchro depuis le site">⚠ Données du ${esc(when)}</span>`;
}

const _curPi = () => getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') });

/** Blockers > 48 h du périmètre — la règle de Santé (PI révolus exclus), pas une réécriture — du
 *  plus silencieux au plus récent. `past` = reliquats d'un PI révolu (sprint « 26.5 » en PI 31),
 *  écartés de l'alerte — le plus vieux imposait « 312 j » — mais cités en pied de liste. */
function _blockers(teams) {
    const rule = ANOMALY_BY_KEY.oldBlockers, curPi = _curPi();
    const all = (store.get('tickets') || [])
        .filter(t => teams.includes(t.team) && rule.match(t, {}))
        .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
    return { live: all.filter(t => !isPastPi(t, curPi)), past: all.filter(t => isPastPi(t, curPi)) };
}

/** Attributs d'un ticket cliquable (clic ou Entrée → popin du ticket, cf. renderTv). */
const _tk = tkAttrs;

/** Liste paginée qui tourne : TOUS les tickets, découpés en pages à la hauteur de l'écran (cf. _paginate). */
const _pagedList = (items, row) => pagedHtml(items.map(row).join(''));

/** Depuis quand le ticket est bloqué, quand le changelog le dit : pose du drapeau (ticket signalé),
 *  sinon entrée dans son statut bloquant actuel. `updatedAt` ne le dit pas : c'est la dernière
 *  activité JIRA (commentaire, report de sprint…) — d'où « sans mouvement depuis », affiché à part. */
function _blockedSince(t) {
    let best = 0;
    for (const c of (t.recentChanges || [])) {
        const f = String(c.field || '').toLowerCase();
        const hit = t.flagged ? (f === 'flagged' && c.to) : (f === 'status' && c.to && c.to === t.jiraStatus);
        const ms = hit && c.date ? new Date(_iso(c.date)).getTime() : 0;
        if (ms > best) best = ms;
    }
    return best ? new Date(best).toISOString() : null;
}

/**
 * TV : rien n'est coupé, rien ne défile si on peut l'éviter (3.199.2). Une carte plus haute que sa
 * zone (grand format d'un sprint, plan d'action chargé) est RÉDUITE pour tenir entière.
 */
function _fitItems(list, items) {
    items.forEach(li => { li.style.zoom = ''; });
    const H = list.clientHeight;
    items.forEach(li => { const h = li.offsetHeight; if (H && h > H + 1) li.style.zoom = ((H - 2) / h).toFixed(3); });
}

/** Découpe la liste `#tv-paged-list` en pages qui tiennent dans sa hauteur (ou par paquets de
 *  `data-per-page`), puis tourne d'une page toutes les pageSeconds() (écran figé : en boucle). Renvoie le nombre de pages — l'écran dure le
 *  temps de toutes les voir. Points du pager cliquables ; la pause (survol) fige la page affichée. */
function _paginate(root, loop) {
    clearInterval(_st.pager);
    const list = root.querySelector('#tv-paged-list'), pager = root.querySelector('#tv-pager');
    _st.resizeObs?.disconnect();
    if (!list || !pager) return 1;
    const items = [...list.children];
    let pages = [];
    const go = i => {
        _st.page = (i + pages.length) % pages.length;
        pages.forEach((p, k) => p.forEach(li => { li.hidden = k !== _st.page; }));
        // Point de la page courante = compte à rebours de la page suivante (rien sur la dernière
        // page hors boucle : c'est la rotation d'écran qui prend le relais, cf. points du haut).
        const turns = loop || _st.page + 1 < pages.length;
        const fill = turns ? `<b style="animation-duration:${pageSeconds() * 1000}ms"></b>` : '';
        pager.innerHTML = `<span>${_st.page + 1} / ${pages.length}</span>${pages.map((_, k) => `<button type="button" class="${k === _st.page ? 'is-on' : ''}" data-page="${k}" aria-label="Page ${k + 1}">${k === _st.page ? fill : ''}</button>`).join('')}<small>${items.length} ${esc(list.dataset.unit || 'tickets')}</small>`;
        // Une carte plus haute que l'écran (plan chargé, grand format) est réduite, plus défilée.
        _fitItems(list, pages[_st.page]);
    };
    // Mesure : tout est affiché, on coupe dès qu'un ticket dépasse la hauteur visible (sur 2
    // colonnes, les deux tickets d'une rangée ont le même offsetTop : la coupe tombe entre deux
    // rangées). Le pager prend sa place AVANT la mesure — affiché après, il raccourcissait la liste.
    const measure = () => {
        items.forEach(li => { li.hidden = false; li.style.zoom = ''; });
        pager.innerHTML = '<span>1 / 1</span>';
        pager.hidden = false;
        pages = [];
        const per = parseInt(list.dataset.perPage || '', 10);
        let top = null;
        if (per > 0) for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));   // pages fixes (colonnes)
        else for (const li of items) {
            const bottom = li.offsetTop + li.offsetHeight;
            if (top === null || bottom - top > list.clientHeight) { pages.push([]); top = li.offsetTop; }
            pages.at(-1).push(li);
        }
        if (pages.length <= 1) { pager.hidden = true; _fitItems(list, items); return; }
        go(Math.min(_st.page, pages.length - 1));
    };
    _st.page = 0;
    measure();
    // Taille changée après coup (plein écran F, fenêtre redimensionnée, zoom TV d'un autre palier) :
    // on redécoupe, sinon les derniers tickets de la page sortaient de l'écran.
    let lastH = list.clientHeight, lastW = list.clientWidth;
    _st.resizeObs = new ResizeObserver(() => {
        if (list.clientHeight === lastH && list.clientWidth === lastW) return;
        lastH = list.clientHeight; lastW = list.clientWidth;
        measure();
    });
    _st.resizeObs.observe(list);
    pager.onclick = e => { const b = e.target.closest('[data-page]'); if (b) go(+b.dataset.page); };
    // Intervalle posé même sur une seule page : un redimensionnement peut en créer d'autres.
    _st.pager = setInterval(() => {
        if (!_st || _st.paused || pages.length <= 1) return;
        if (_st.page + 1 >= pages.length && !loop) return;   // dernière page : la rotation d'écran prend le relais
        go(_st.page + 1);
    }, pageSeconds() * 1000);
    return Math.max(1, pages.length);
}

/* ── Écrans ─────────────────────────────────────────────────────────── */

/** Météo du train : 13 équipes en cellules riches demandaient 3 fois la hauteur de l'écran (défilement,
 *  le bas jamais lu d'un coup d'œil). Une matrice PAR LIGNE PRODUIT (+ « Autres équipes »), paginées à
 *  la hauteur comme les autres listes — chaque page se lit entière (3.199.2). */
function _screenMeteo({ teams, teamObjects, ctx }) {
    const groups = store.get('group') ? [] : (store.get('groups') || []);
    const placed = new Set(), blocks = [];
    for (const g of groups) {
        const list = teams.filter(t => (g.teams || []).includes(t) && !placed.has(t));
        if (!list.length) continue;
        list.forEach(t => placed.add(t));
        blocks.push({ title: `Météo · ${g.name}`, teams: list });
    }
    const rest = teams.filter(t => !placed.has(t));
    if (rest.length) blocks.push({ title: blocks.length ? 'Météo · Autres équipes' : 'Météo du train', teams: rest });
    return `<div class="tv-meteo">${pagedHtml(blocks.map((bk, i) => `<li class="tv-meteo-page">${meteoMatrixHtml(bk.teams, ctx, teamObjects, { preview: true, title: bk.title, rich: true, key: `tv${i}` })}</li>`).join(''), { cls: 'tv-meteo-pages', unit: blocks.length > 1 ? 'lignes produit' : 'équipes' })}</div>`;
}

/** Plans d'action : le plus de colonnes possible tant que chaque plan reste lisible (réduction ≥ 75 %) ;
 *  trois plans étroits se repliaient sur tant de lignes qu'il fallait les réduire à 27 % (1366 × 768). */
function _choosePlansPerPage(root) {
    const list = root.querySelector('.tv-plans#tv-paged-list');
    if (!list) return;
    const items = [...list.children];
    const total = items.length;
    for (const n of [PLANS_PER_PAGE, 2, 1]) {
        const k = Math.min(n, total);
        list.style.setProperty('--n', k);
        list.dataset.perPage = k;
        items.forEach(li => { li.hidden = false; li.style.zoom = ''; });
        const worst = Math.min(...items.map(li => list.clientHeight / Math.max(1, li.offsetHeight)));
        if (worst >= 0.75 || k === 1) return;
    }
}

function _screenPlans({ teams, teamObjects, ctx }) {
    const order = { storm: 0, rain: 1, cloud: 2, sun: 3, none: 4 };
    const bad = teams.map(t => computeTeamMeteo(t, ctx)).filter(r => r.level === 'storm' || r.level === 'rain')
        .sort((a, b) => order[a.level] - order[b.level]);
    if (!bad.length) return emptyStateHtml({ size: 'tv', tone: 'ok', icon: '☀️', title: 'Rien à débloquer aujourd\'hui', text: `Aucune équipe en 🌧️ ou ⛈️ sur ${_scope().label}.` });
    // TOUTES les équipes en 🌧️ / ⛈️ (avant : les 3 pires, les suivantes jamais montrées), par pages de 3.
    return `<div class="tv-plans-screen"><div class="tv-paged"><div class="tv-plans" id="tv-paged-list" data-per-page="${PLANS_PER_PAGE}" data-unit="équipes à surveiller" style="--n:${Math.min(PLANS_PER_PAGE, bad.length)}">${bad.map(r => {
        const color = (teamObjects || []).find(o => o.name === r.team)?.color || 'var(--border)';
        return `<section class="tv-plan" style="--team-color:${color}">
            <h2><span class="team-dot" style="background:${color}"></span>${esc(r.team)} <span class="tv-plan-lvl">${METEO_GLYPH[r.level]} ${esc(METEO_LABEL[r.level])}</span></h2>
            ${meteoPlanHtml(r.team, ctx, { names: true }) || '<p class="tv-muted">Aucune anomalie — la météo vient du sprint ou du PI, pas des tickets.</p>'}
        </section>`;
    }).join('')}</div><div class="tv-pager" id="tv-pager" hidden></div></div></div>`;
}

/** Sprint review : le dernier sprint CLOS du périmètre — engagement / réalisé / glissés, mood, tickets livrés. */
function _screenReview({ teams, ctx }) {
    const closed = (ctx.sprintInfoAll?.teamSprints || []).filter(s => teams.includes(s.team) && s.state === 'closed' && s.endDate)
        .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0];
    if (!closed) return emptyStateHtml({ size: 'tv', icon: '📈', title: 'Aucun sprint clos', text: `La review arrivera avec le premier sprint terminé de ${_scope().label}.` });
    const scope = sprintScope((store.get('tickets') || []).filter(t => t.team === closed.team), closed.name);
    const pts = sumBy(scope.engaged, t => t.points), donePts = sumBy(scope.done, t => t.points);
    const pct = pts ? Math.round((donePts / pts) * 100) : 0;
    const lbl = (String(closed.name).match(/(\d+\.\d+)/) || [])[1] || '';
    const moods = (ctx.moodVotes || []).filter(v => v.team === closed.team && lbl && v.piSprint && v.piSprint.includes(lbl)).map(v => parseInt(v.value, 10)).filter(n => n >= 1 && n <= 5);
    const mood = moods.length ? (moods.reduce((s, n) => s + n, 0) / moods.length).toFixed(1) : null;
    const kpi = (label, value, sub, cls = '') => `<div class="metric-card ${cls}"><span class="metric-label">${label}</span><span class="metric-value">${value}</span><span class="metric-sub">${sub}</span></div>`;
    const fmt = iso => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
    return `<div class="tv-review">
        <div class="tv-journee-hd"><span aria-hidden="true">🏁</span><div><h2>${esc(closed.name)}</h2><p>${esc(closed.team)} · ${fmt(closed.startDate)} → ${fmt(closed.endDate)}${closed.goal ? ` · 🎯 ${esc(closed.goal)}` : ''}</p></div></div>
        <div class="dashboard-metrics">
            ${kpi('Tickets', `${scope.done.length}<span class="metric-denom"> / ${scope.engaged.length}</span>`, 'terminés dans le sprint', scope.done.length === scope.engaged.length ? 'mc-done' : 'mc-info')}
            ${kpi('Points', `${donePts}<span class="metric-denom"> / ${pts}</span>`, `${pct} % de l'engagement`, pct >= 80 ? 'mc-done' : pct >= 50 ? 'mc-warning' : 'mc-danger')}
            ${kpi('Glissés', scope.carried.length, scope.carried.length ? 'engagés ici, livrés ailleurs' : 'aucun report', scope.carried.length ? 'mc-warning' : 'mc-done')}
            ${kpi('Mood', mood ?? '—', mood ? `/5 · ${moods.length} vote${moods.length > 1 ? 's' : ''}` : 'aucun vote', mood ? (mood >= 4 ? 'mc-done' : mood >= 3 ? 'mc-warning' : 'mc-danger') : 'mc-info')}
        </div>
        ${scope.done.length ? _pagedList(scope.done, t => `<li ${_tk(t.id)}><span class="tv-list-ok" aria-hidden="true">✅</span><code>${esc(t.id)}</code><span>${esc(t.title || '')}</span><small>${t.leader ? esc(t.leader) + ' · ' : ''}${t.points ? t.points + ' pts' : ''}</small></li>`) : '<p class="tv-muted">Rien de terminé dans ce sprint.</p>'}
    </div>`;
}

function _screenJournee({ teams, ctx }) {
    const today = _dayKey(new Date());
    const tk = (store.get('tickets') || []).filter(t => teams.includes(t.team));
    const doneToday = tk.filter(t => _resolvedDay(t) === today);
    // Rien de terminé aujourd'hui (soirée, lendemain de synchro…) : les derniers terminés — le jour
    // le plus récent des 7 derniers — plutôt qu'un écran vide. Le chiffre clé reste celui du jour.
    const weekAgo = _dayKey(new Date(Date.now() - 7 * 86400000));
    const lastDay = doneToday.length ? null : tk.map(_resolvedDay).filter(d => d && d < today && d >= weekAgo).sort().at(-1);
    const recent = lastDay ? tk.filter(t => _resolvedDay(t) === lastDay) : [];
    const row = t => `<li ${_tk(t.id)}><span class="tv-list-ok" aria-hidden="true">✅</span><code>${esc(t.id)}</code><span>${esc(t.title || '')}</span><small>${esc(t.team)}${t.leader ? ' · ' + esc(t.leader) : ''}</small></li>`;
    const curPi = _curPi();
    const blocked = tk.filter(t => ANOMALY_BY_KEY.blocked.match(t, { curPi }));
    const old = _blockers(teams).live;
    const inprog = tk.filter(t => t.status === 'inprog');
    const kpi = (label, value, sub, cls = '') => `<div class="metric-card ${cls}"><span class="metric-label">${label}</span><span class="metric-value">${value}</span><span class="metric-sub">${sub}</span></div>`;
    const worst = worstLevel(teams.map(t => computeTeamMeteo(t, ctx).level));
    return `<div class="tv-journee">
        <div class="tv-journee-hd"><span aria-hidden="true">${METEO_GLYPH[worst]}</span><div><h2>${esc(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2><p>${esc(_scope().label)} · ${esc(METEO_LABEL[worst])}</p></div></div>
        <div class="dashboard-metrics">
            ${kpi('Terminés aujourd\'hui', doneToday.length, `${sumBy(doneToday, t => t.points)} pts`, doneToday.length ? 'mc-done' : 'mc-info')}
            ${kpi('En cours', inprog.length, 'tickets actifs', 'mc-inprog')}
            ${kpi('Bloqués', blocked.length, old.length ? `dont ${old.length} > 48 h` : 'aucun > 48 h', blocked.length ? 'mc-danger' : 'mc-done')}
            ${kpi('Équipes', teams.length, `${teams.filter(t => ['storm', 'rain'].includes(computeTeamMeteo(t, ctx).level)).length} à surveiller`, 'mc-info')}
        </div>
        ${doneToday.length ? _pagedList(doneToday, row)
            : recent.length ? `<h3 class="tv-list-hd">Rien de terminé aujourd'hui · derniers terminés : <b>${esc(_fmtDay(lastDay))}</b></h3>${_pagedList(recent, row)}`
            : '<p class="tv-muted">Rien de terminé aujourd\'hui ni ces 7 derniers jours.</p>'}
    </div>`;
}

/** Alerte : TOUS les blockers, groupés par équipe (équipe du plus ancien d'abord), paginés par équipe.
 *  `focus` = une équipe choisie (clic sur sa puce du bandeau ou son titre) : ses seuls blockers. */
function _screenAlert({ live: all, past: allPast }, teamObjects, focus = null) {
    const live = focus ? all.filter(t => t.team === focus) : all;
    const past = focus ? allPast.filter(t => t.team === focus) : allPast;
    if (!live.length) return _screenAlert({ live: all, past: allPast }, teamObjects);
    const n = live.length;
    const byTeam = new Map();
    for (const t of live) byTeam.set(t.team, [...(byTeam.get(t.team) || []), t]);
    const color = tm => (teamObjects || []).find(o => o.name === tm)?.color || 'var(--border)';
    const card = t => {
        const since = _blockedSince(t);
        // Pourquoi il compte comme bloqué : drapeau JIRA (statut quelconque) ou statut bloquant.
        const why = t.flagged ? `🚩 Signalé · ${t.jiraStatus || 'drapeau'}` : (t.jiraStatus || 'Bloqué');
        return `<article class="tv-alert-tk" ${_tk(t.id)}>
            <div class="tv-alert-tk-top"><code>${esc(t.id)}</code><span class="tv-alert-why">${esc(why)}</span></div>
            <b>${esc(t.title || '')}</b>
            <span>${t.leader ? esc(t.leader) : '<em>non assigné</em>'}${t.points ? ` · ${t.points} pts` : ''}${since ? ` · bloqué depuis ${_fmtSince(_hours(since))}` : ''} · <strong>sans mouvement depuis ${_fmtSince(_hours(t.updatedAt))}</strong></span>
        </article>`;
    };
    return `<div class="tv-alert">
        <div class="tv-alert-hd"><span aria-hidden="true">⛈️</span><div><small>Alerte · ${focus ? `${esc(focus)} · ${n} blocker${n > 1 ? 's' : ''}` : n > 1 ? `${n} blockers · ${byTeam.size} équipe${byTeam.size > 1 ? 's' : ''}` : esc(live[0].team)}${focus ? ` <button type="button" class="tv-chip-btn" data-alert-team="">← Toutes les équipes (${all.length})</button>` : ''}</small><h2>Blocker${n > 1 ? 's' : ''} sans mouvement depuis plus de 48 h</h2><p>La rotation reprend après cet écran ; l'alerte revient à chaque tour tant que le ticket ne bouge pas.</p></div><span class="tv-alert-since">${_fmtSince(_hours(live[0].updatedAt))}${n > 1 ? '<small>le plus ancien</small>' : ''}</span></div>
        <div class="tv-paged tv-alert-paged"><div class="tv-alert-list" id="tv-paged-list" data-unit="équipes">
            ${[...byTeam].map(([tm, list]) => `<section class="tv-alert-team" style="--team-color:${color(tm)}">
                <h3>${focus ? `<span class="team-dot" style="background:${color(tm)}"></span>${esc(tm)}` : `<button type="button" class="tv-team-btn" data-alert-team="${esc(tm)}" title="Voir seulement ${esc(tm)}"><span class="team-dot" style="background:${color(tm)}"></span>${esc(tm)}</button>`} <span class="tv-alert-count">${list.length}</span></h3>
                <div class="tv-alert-grid">${list.map(card).join('')}</div>
            </section>`).join('')}
        </div><div class="tv-pager" id="tv-pager" hidden></div></div>
            ${past.length ? `<p class="tv-muted tv-alert-past">Hors alerte : ${past.length} blocker${past.length > 1 ? 's' : ''} d'un PI révolu, resté${past.length > 1 ? 's' : ''} au backlog — ${past.map(t => `<code ${_tk(t.id)}>${esc(t.id)}</code> ${esc(t.team)} (${esc(t.sprintName || '')})`).join(' · ')}</p>` : ''}
    </div>`;
}

/* ── Rendu ──────────────────────────────────────────────────────────── */

export function renderTv(container) {
    _cleanup();
    // #tv~tv=page:8,ecran:30,nuit:non → réglages enregistrés sur cet écran. app.js les a retenus
    // (store `tvUrlSettings`) : l'adresse est réécrite au démarrage avant que la TV ne la lise.
    const urlSet = store.get('tvUrlSettings');
    applyUrlSettings(urlSet ? `~tv=${urlSet}` : location.hash);
    if (urlSet) store.set('tvUrlSettings', null);
    document.body.classList.add('tv-mode');
    _applyTheme();
    // Écran figé : #tv/<équipe>/<écran> (store `tvScreen`, posé par app.js) ; l'adresse en secours.
    const locked = store.get('tvScreen') || (location.hash.match(/^#tv\/[^/~]*\/([a-z]+)/) || [])[1] || null;

    _st = { timer: null, clock: null, pager: null, page: 0, raf: 0, idx: 0, paused: false, alertTeam: null, sprintTeam: null, weekOffset: 0, onKey: null, unsubs: [] };

    container.innerHTML = `
    <div class="tv" id="tv-root">
        <header class="tv-top">
            <b id="tv-title"></b>
            <span class="tv-ctx" id="tv-ctx"></span>
            <span id="tv-stale"></span>
            <span class="tv-clock" id="tv-clock"></span>
            <span class="tv-dots" id="tv-dots" aria-hidden="true"></span>
            ${settingsHtml()}
            <button class="btn-icon tv-btn" id="tv-fs" type="button" data-tooltip="Plein écran (F)" aria-label="Plein écran">⛶</button>
            <button class="btn-icon tv-btn" id="tv-exit" type="button" data-tooltip="Quitter (Échap)" aria-label="Quitter le mode TV">✕</button>
        </header>
        <div class="tv-strip" id="tv-strip" hidden></div>
        <main class="tv-screen" id="tv-screen" aria-live="polite"></main>
        <div class="tv-cheers" id="tv-cheers" aria-live="polite" hidden></div>
        <div class="tv-detail" id="tv-detail" hidden></div>
        <footer class="tv-foot"><kbd>←</kbd><kbd>→</kbd> écran · <kbd>Espace</kbd> pause · <kbd>F</kbd> plein écran · <kbd>Échap</kbd> quitter${locked ? ` · écran figé : <b>${esc(locked)}</b>` : ''}</footer>
    </div>`;

    const $ = id => container.querySelector('#' + id);
    // Hauteur visuelle = la fenêtre (avant le 1er écran : la pagination mesure cette hauteur).
    _fitViewport($('tv-root'));
    const onResize = () => _fitViewport($('tv-root'));
    window.addEventListener('resize', onResize);
    _st.unsubs.push(() => window.removeEventListener('resize', onResize));
    const tick = () => { $('tv-clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
    tick(); _st.clock = setInterval(tick, 30000);

    /** Écrans du cycle courant : l'alerte en tête tant qu'un blocker > 48 h existe. */
    const cycle = () => {
        const { teams } = _scope();
        const blockers = _blockers(teams);
        const night = _isNight();
        $('tv-root').classList.toggle('is-night', night);
        // La nuit a sa palette (sombre, contrastes adoucis — tv.css) quel que soit le thème de l'écran.
        if (night) $('tv-root').setAttribute('data-theme', 'dark'); else $('tv-root').removeAttribute('data-theme');
        // Un écran figé par le hash (#tv/all/review) est une intention explicite : il l'emporte
        // sur le mode nuit et sur l'alerte. Sinon : la nuit réduit au bilan du jour, et l'alerte
        // passe en tête de tour tant qu'un blocker > 48 h existe.
        if (blockers.live.length) noteBlockersSeen(blockers.live.map(t => t.team));   // départ de la série « sans blocker »
        if (locked) {
            const pick = [ALERT, ZERO, ...SCREENS].find(s => s.id === locked);
            return { screens: pick ? [pick] : (night ? NIGHT : SCREENS), blockers, teams };
        }
        const base = night ? NIGHT : SCREENS;
        return { screens: blockers.live.length ? [ALERT, ...base] : night ? base : [ZERO, ...base], blockers, teams };
    };

    const show = (idx) => {
        if (!_st) return;
        const { screens, blockers, teams } = cycle();
        if (!screens.length) return;
        _st.idx = ((idx % screens.length) + screens.length) % screens.length;
        const s = screens[_st.idx];
        const teamObjects = store.get('teamObjects') || [];
        const ctx = meteoContext(getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') }));
        const args = { teams, teamObjects, ctx };
        $('tv-title').textContent = s.title;
        $('tv-ctx').textContent = `${_scope().label} · PI #${ctx.piNum || '?'}`;
        $('tv-stale').innerHTML = _staleHtml();
        const dots = fillMs => { $('tv-dots').innerHTML = screens.map((x, i) => `<i class="${i === _st.idx ? 'is-on' : ''}${x.id === 'alerte' ? ' is-alert' : ''}">${i === _st.idx && fillMs ? `<b style="animation-duration:${fillMs}ms"></b>` : ''}</i>`).join(''); };
        dots(0);
        const strip = $('tv-strip');
        const live = blockers.live;
        if (live.length && s.id !== 'alerte') {
            strip.hidden = false;
            // Clic sur le bandeau → l'alerte ; sur une équipe → l'alerte de cette seule équipe.
            const per = [...live.reduce((m, t) => m.set(t.team, (m.get(t.team) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
            strip.innerHTML = `<button type="button" class="tv-strip-main" data-alert-team=""><span aria-hidden="true">⛈️</span> <b>${live.length} blocker${live.length > 1 ? 's' : ''} &gt; 48 h</b></button>${per.map(([tm, k]) => `<button type="button" class="tv-strip-team" data-alert-team="${esc(tm)}" style="--team-color:${(teamObjects.find(o => o.name === tm) || {}).color || 'var(--border)'}"><span class="team-dot"></span>${esc(tm)} <b>${k}</b></button>`).join('')}`;
        } else strip.hidden = true;
        if (s.id !== 'alerte') _st.alertTeam = null;   // le filtre d'équipe ne survit pas à l'écran d'alerte
        if (s.id !== 'sprint') _st.sprintTeam = null;  // ni le zoom sur une équipe à « Sprint en cours »
        if (s.id !== 'semaine') _st.weekOffset = 0;    // ni une autre semaine que la courante
        $('tv-screen').innerHTML = s.id === 'alerte' ? (live.length ? _screenAlert(blockers, teamObjects, _st.alertTeam) : emptyStateHtml({ size: 'tv', tone: 'ok', icon: '✅', title: 'Aucun blocker de plus de 48 h' }))
            : s.id === 'meteo' ? _screenMeteo(args)
            : s.id === 'sprint' ? screenSprint(args, _st.sprintTeam)
            : s.id === 'plans' ? _screenPlans(args)
            : s.id === 'presence' ? screenPresence(args)
            : s.id === 'review' ? _screenReview(args)
            : s.id === 'semaine' ? screenWeek(args, _st.weekOffset)
            : s.id === 'zero' ? screenZeroBlocker({ ...args, liveBlockers: live.length })
            : _screenJournee(args);
        $('tv-screen').scrollTop = 0;
        clearTimeout(_st.timer);
        // Le défilement de l'écran précédent s'arrête ici : celui de la météo porte sur #tv-screen,
        // qui survit au changement d'écran (il aurait fait défiler l'écran suivant).
        cancelAnimationFrame(_st.raf);
        // Durée : l'alerte le temps de défiler toute la liste, les listes paginées le temps de voir
        // toutes leurs pages — jamais moins que la durée réglée.
        if (s.id === 'plans') _choosePlansPerPage($('tv-screen'));
        const pages = _paginate($('tv-screen'), !!locked);
        const seconds = screenSeconds();
        // Durée : le temps de voir toutes les pages — jamais moins que la durée réglée ; l'alerte au moins
        // le temps de lire tous ses blockers. Plus aucun défilement : pages, densité ou réduction (3.199.2).
        const ms = Math.max(seconds || s.seconds, s.id === 'alerte' ? _alertSeconds(live.length) : 0, pages > 1 ? pages * pageSeconds() : 0) * 1000;
        if (s.id === 'semaine') rollDays($('tv-screen'));                        // densité : tout tient à l'écran
        if (!locked && !_st.paused) _st.timer = setTimeout(() => show(_st.idx + 1), ms);
        // Compte à rebours : le point de l'écran courant se remplit en `ms` (figé à la pause, absent
        // sur un écran figé — il ne tourne pas).
        dots(!locked && !_st.paused && screens.length > 1 ? ms : 0);
    };

    const openTk = id => { pause(true); window.__squadBoard?.openTicketModal?.(id); };
    /** Fiche membre (Atlas, chargé à la demande) ; la rotation attend sa fermeture (observateur du body). */
    const openMember = async name => {
        pause(true);
        (await import('./atlas.js')).openMemberCard(name);
        const obs = new MutationObserver(() => {
            if (_memberCard()) return;
            obs.disconnect();
            if (_st?.paused && !_modalOpen() && !$('tv-root').matches(':hover')) pause(false);
        });
        obs.observe(document.body, { childList: true });
        _st.unsubs.push(() => obs.disconnect());
    };
    /** Détail d'une cellule météo (équipe × domaine) ; la rotation attend sa fermeture. */
    const openPanel = html => {
        if (!html) return;
        $('tv-detail').innerHTML = html;
        $('tv-detail').hidden = false;
        pause(true);
        $('tv-detail').querySelector('.tvd-close')?.focus();
    };
    const openDetail = (team, dom) => openPanel(meteoDetailHtml(team, dom, meteoContext(_curPi()), store.get('teamObjects') || []));
    const closeDetail = () => {
        $('tv-detail').hidden = true;
        $('tv-detail').innerHTML = '';
        if (!$('tv-root').matches(':hover')) pause(false);
    };
    const pause = (on) => { if (!_st) return; _st.paused = on; $('tv-root').classList.toggle('is-paused', on); if (on) clearTimeout(_st.timer); else show(_st.idx); };

    _st.onKey = e => {
        if (_ticketOpen()) return;   // Échap / flèches appartiennent à la popin ouverte, pas à la TV
        if (_detailOpen()) { if (e.key === 'Escape') { e.preventDefault(); closeDetail(); } return; }
        if (_memberCard()) { if (e.key === 'Escape') { e.preventDefault(); _memberCard().querySelector('#atlas-mc-close')?.click(); } return; }
        if (e.key === 'Escape' && settings.isOpen()) { e.preventDefault(); settings.close(); return; }
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;   // flèches d'un menu de réglage
        if (e.key === 'Enter' && e.target.dataset?.ticket) { e.preventDefault(); openTk(e.target.dataset.ticket); return; }
        if (e.key === 'Enter' && e.target.closest?.('[data-burn-day]')) { e.preventDefault(); e.target.closest('[data-burn-day]').dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
        if (e.key === 'Enter' && e.target.matches?.('header[data-week-day], [data-cal-ev], [data-cal-off], [data-pres-ev]')) { e.preventDefault(); e.target.click(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); show(_st.idx + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); show(_st.idx - 1); }
        else if (e.key === ' ') { e.preventDefault(); pause(!_st.paused); }
        else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); $('tv-fs')?.click(); }
        else if (e.key === 'Escape') { e.preventDefault(); $('tv-exit')?.click(); }
    };
    // En CAPTURE : la TV voit la touche avant la popin ticket (modal.js). Sinon Échap fermait la popin
    // PUIS, la popin déjà fermée, le panneau de détail derrière — et un 2e Échap quittait la TV.
    document.addEventListener('keydown', _st.onKey, true);
    // Réglages ⚙ : appliqués tout de suite (durées relues à chaque écran, mode nuit au prochain cycle).
    const settings = wireSettings($('tv-root'), () => { _applyTheme(); show(_st.idx); });
    $('tv-exit').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); store.set('view', 'dashboard'); });
    $('tv-fs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
    $('tv-root').addEventListener('mouseenter', () => pause(true));
    $('tv-root').addEventListener('mouseleave', () => { if (!_modalOpen()) pause(false); });
    // Ticket cliquable (alerte, review, aujourd'hui) → sa popin ; la rotation attend sa fermeture.
    $('tv-root').addEventListener('click', e => {
        // Panneau de détail : ✕ ou clic sur le fond le ferment ; une pastille de domaine le bascule.
        if (e.target.closest('[data-tvd-close]') || e.target === $('tv-detail')) { closeDetail(); return; }
        // Repère du burndown / burnup (barre +N, ▲+N) → tickets terminés / ajoutés ce jour-là ;
        // AVANT le zoom de la carte, qui l'englobe.
        const burn = e.target.closest('[data-burn-day]');
        if (burn) { openPanel(sprintDayHtml(burn.dataset.burnTeam, burn.dataset.burnDay, burn.dataset.burnKind, store.get('teamObjects') || [])); return; }
        const cell = e.target.closest('[data-meteo-team]');
        if (cell) { openDetail(cell.dataset.meteoTeam, cell.dataset.meteoDom); return; }
        const tkEl = e.target.closest('[data-ticket]');
        if (tkEl) { openTk(tkEl.dataset.ticket); return; }
        const member = e.target.closest('[data-member]');
        if (member) { openMember(member.dataset.member); return; }
        // La semaine : ‹ › changent de semaine (l'écran se fige le temps de la lecture) ; un jour → son détail.
        const wnav = e.target.closest('[data-week-nav]');
        if (wnav) { const n = +wnav.dataset.weekNav; _st.weekOffset = n ? _st.weekOffset + n : 0; pause(true); show(_st.idx); return; }
        // Évènement d'agenda → son détail (depuis le détail d'un jour : avec retour vers ce jour) ; absences du jour.
        const calEv = e.target.closest('[data-cal-ev]');
        if (calEv) {
            const back = e.target.closest('#tv-detail') ? $('tv-detail').querySelector('.tvw-detail')?.dataset.day : null;
            openPanel(weekCalEventHtml(calEv.dataset.calEv, back)); return;
        }
        const presEv = e.target.closest('[data-pres-ev]');
        if (presEv) { openPanel(presenceEventHtml(presEv.dataset.presEv)); return; }
        const calOff = e.target.closest('[data-cal-off]');
        if (calOff) { openPanel(weekOffHtml(calOff.dataset.calOff)); return; }
        const wday = e.target.closest('[data-week-day]');
        if (wday) { openPanel(weekDayHtml(_scope().teams, wday.dataset.weekDay)); return; }
        const sp = e.target.closest('[data-sprint-team]');
        if (sp) { _st.sprintTeam = sp.dataset.sprintTeam || null; show(_st.idx); return; }
        const team = e.target.closest('[data-alert-team]');
        if (team) {   // bandeau ou titre d'équipe → écran d'alerte (filtré sur l'équipe, ou toutes)
            _st.alertTeam = team.dataset.alertTeam || null;
            show(Math.max(0, cycle().screens.findIndex(x => x.id === 'alerte')));
            return;
        }
    });
    const mo = document.getElementById('modal-overlay');
    if (mo) {
        const obs = new MutationObserver(() => { if (!_modalOpen() && _st?.paused && !$('tv-root').matches(':hover')) pause(false); });
        obs.observe(mo, { attributes: true, attributeFilter: ['class'] });
        _st.unsubs.push(() => obs.disconnect());
    }

    // Données rafraîchies (sync) → redessine l'écran courant ; changement de vue → nettoyage.
    _st.unsubs.push(store.on('tickets', () => show(_st?.idx || 0)));
    _st.unsubs.push(startLive({ cheerHost: $('tv-cheers'), scopeTeams: () => _scope().teams }));
    let unsubView = null;
    // Sortie de la TV : l'écran figé est oublié (sinon le bouton 📺 rouvrirait sur le dernier écran figé).
    unsubView = store.on('view', v => { if (v !== 'tv') { _cleanup(); unsubView?.(); store.set('tvScreen', null); } });
    _st.unsubs.push(unsubView);

    show(0);
}
