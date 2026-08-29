/**
 * Mode TV — ce que l'écran mural affiche seul, sans chrome, en rotation.
 *
 * Trois écrans tournent (météo du train → plans d'action → aujourd'hui), et un quatrième
 * s'impose en tête de cycle tant qu'un **blocker > 48 h** existe dans le périmètre : l'alerte
 * plein écran nomme le ticket, l'équipe, le responsable et depuis quand. Sur les autres écrans,
 * un bandeau rouge rappelle l'alerte — elle ne bloque pas la rotation indéfiniment, elle la
 * précède à chaque tour, jusqu'à ce que le ticket bouge.
 *
 * Périmètre = celui du topbar (toutes les équipes, une ligne produit, ou une équipe).
 * Entrées : bouton 📺 du topbar, `#tv`, `#tv/<équipe>` ; `#tv/all/<écran>` fige un écran.
 * Clavier : ← → écran précédent / suivant · Espace pause · F plein écran · Échap sortie.
 * Les données sont celles du store : la vue se redessine à chaque sync sans repartir de zéro.
 */

import { store } from '../state.js';
import { esc, getCurrentPi, sumBy, METEO_GLYPH, METEO_LABEL, worstLevel } from '../utils.js';
import { ANOMALY_BY_KEY } from '../business_rules.js';
import { meteoMatrixHtml, meteoContext, computeTeamMeteo } from '../components/meteo_matrix.js';
import { meteoPlanHtml } from '../components/meteo_plan.js';

const SCREENS = [
    { id: 'meteo',   title: '🌤️ Météo du train', seconds: 30 },
    { id: 'plans',   title: '🧭 Plans d\'action',  seconds: 25 },
    { id: 'journee', title: '📅 Aujourd\'hui',     seconds: 20 },
];
const ALERT = { id: 'alerte', title: '⛈️ Alerte', seconds: 20 };
// Le soir (19 h → 8 h), plus de rotation : le bilan du jour seul, tamisé — pour celui qui part en
// dernier et pour ne pas faire tourner un mur d'écrans dans un open space vide. `sb-tv-night=0` le coupe.
const NIGHT = { id: 'journee', title: '🌙 Fin de journée', seconds: 120 };
const _isNight = () => { const h = new Date().getHours(); return localStorage.getItem('sb-tv-night') !== '0' && (h >= 19 || h < 8); };
const MAX_PLANS = 3;
const MAX_ALERTS = 3;

let _st = null;   // état de la session TV en cours (timers, écouteurs) — un seul à la fois

function _cleanup() {
    if (!_st) return;
    clearTimeout(_st.timer); clearInterval(_st.clock);
    document.removeEventListener('keydown', _st.onKey);
    _st.unsubs.forEach(u => u?.());
    document.body.classList.remove('tv-mode');
    _st = null;
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

const _hours = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
const _fmtSince = h => (h >= 48 ? `${Math.floor(h / 24)} j` : `${h} h`);

/** Blockers > 48 h dans le périmètre — la règle de Santé, pas une réécriture. */
function _blockers(teams) {
    const rule = ANOMALY_BY_KEY.oldBlockers;
    return (store.get('tickets') || [])
        .filter(t => teams.includes(t.team) && rule.match(t, {}))
        .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
}

/* ── Écrans ─────────────────────────────────────────────────────────── */

function _screenMeteo({ teams, teamObjects, ctx }) {
    const groups = store.get('group') ? [] : (store.get('groups') || []);
    return `<div class="tv-meteo">${meteoMatrixHtml(teams, ctx, teamObjects, { preview: true, title: 'Météo du train', groups })}</div>`;
}

function _screenPlans({ teams, teamObjects, ctx }) {
    const order = { storm: 0, rain: 1, cloud: 2, sun: 3, none: 4 };
    const bad = teams.map(t => computeTeamMeteo(t, ctx)).filter(r => r.level === 'storm' || r.level === 'rain')
        .sort((a, b) => order[a.level] - order[b.level]).slice(0, MAX_PLANS);
    if (!bad.length) return `<div class="tv-clear"><span aria-hidden="true">☀️</span><h2>Rien à débloquer aujourd'hui</h2><p>Aucune équipe en 🌧️ ou ⛈️ sur ${esc(_scope().label)}.</p></div>`;
    return `<div class="tv-plans" style="--n:${bad.length}">${bad.map(r => {
        const color = (teamObjects || []).find(o => o.name === r.team)?.color || 'var(--border)';
        return `<section class="tv-plan" style="--team-color:${color}">
            <h2><span class="team-dot" style="background:${color}"></span>${esc(r.team)} <span class="tv-plan-lvl">${METEO_GLYPH[r.level]} ${esc(METEO_LABEL[r.level])}</span></h2>
            ${meteoPlanHtml(r.team, ctx) || '<p class="tv-muted">Aucune anomalie — la météo vient du sprint ou du PI, pas des tickets.</p>'}
        </section>`;
    }).join('')}</div>`;
}

function _screenJournee({ teams, ctx }) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const tk = (store.get('tickets') || []).filter(t => teams.includes(t.team));
    const doneToday = tk.filter(t => String(t.resolvedDate || '').slice(0, 10) === todayIso);
    const blocked = tk.filter(t => t.status === 'blocked');
    const old = _blockers(teams);
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
        ${doneToday.length ? `<ul class="tv-list">${doneToday.slice(0, 8).map(t => `<li><span class="tv-list-ok" aria-hidden="true">✅</span><code>${esc(t.id)}</code><span>${esc(t.title || '')}</span><small>${esc(t.team)}${t.leader ? ' · ' + esc(t.leader) : ''}</small></li>`).join('')}</ul>` : '<p class="tv-muted">Rien de terminé pour l\'instant aujourd\'hui.</p>'}
    </div>`;
}

function _screenAlert(blockers) {
    const list = blockers.slice(0, MAX_ALERTS);
    const h = _hours(list[0].updatedAt);
    return `<div class="tv-alert">
        <div class="tv-alert-hd"><span aria-hidden="true">⛈️</span><div><small>Alerte · ${list.length > 1 ? `${blockers.length} blockers` : esc(list[0].team)}</small><h2>Blocker${blockers.length > 1 ? 's' : ''} sans mouvement depuis plus de 48 h</h2><p>La rotation reprend après cet écran ; l'alerte revient à chaque tour tant que le ticket ne bouge pas.</p></div><span class="tv-alert-since">${_fmtSince(h)}</span></div>
        <div class="tv-alert-list">${list.map(t => `<article class="tv-alert-tk"><code>${esc(t.id)}</code><b>${esc(t.title || '')}</b><span>${esc(t.team)} · ${t.leader ? esc(t.leader) : '<em>non assigné</em>'} · ${t.points ? t.points + ' pts · ' : ''}bloqué depuis ${_fmtSince(_hours(t.updatedAt))}</span></article>`).join('')}
        ${blockers.length > MAX_ALERTS ? `<p class="tv-muted">+ ${blockers.length - MAX_ALERTS} autre${blockers.length - MAX_ALERTS > 1 ? 's' : ''} — voir Santé → Blockers > 48 h</p>` : ''}</div>
    </div>`;
}

/* ── Rendu ──────────────────────────────────────────────────────────── */

export function renderTv(container) {
    _cleanup();
    document.body.classList.add('tv-mode');
    const locked = (location.hash.match(/^#tv\/[^/]*\/([a-z]+)/) || [])[1] || null;
    const seconds = Math.max(5, parseInt(localStorage.getItem('sb-tv-seconds') || '', 10) || 0) || null;

    _st = { timer: null, clock: null, idx: 0, paused: false, onKey: null, unsubs: [] };

    container.innerHTML = `
    <div class="tv" id="tv-root">
        <header class="tv-top">
            <b id="tv-title"></b>
            <span class="tv-ctx" id="tv-ctx"></span>
            <span class="tv-clock" id="tv-clock"></span>
            <span class="tv-dots" id="tv-dots" aria-hidden="true"></span>
            <button class="btn-icon tv-btn" id="tv-fs" type="button" data-tooltip="Plein écran (F)" aria-label="Plein écran">⛶</button>
            <button class="btn-icon tv-btn" id="tv-exit" type="button" data-tooltip="Quitter (Échap)" aria-label="Quitter le mode TV">✕</button>
        </header>
        <div class="tv-strip" id="tv-strip" hidden></div>
        <main class="tv-screen" id="tv-screen" aria-live="polite"></main>
        <footer class="tv-foot"><kbd>←</kbd><kbd>→</kbd> écran · <kbd>Espace</kbd> pause · <kbd>F</kbd> plein écran · <kbd>Échap</kbd> quitter${locked ? ` · écran figé : <b>${esc(locked)}</b>` : ''}</footer>
    </div>`;

    const $ = id => container.querySelector('#' + id);
    const tick = () => { $('tv-clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
    tick(); _st.clock = setInterval(tick, 30000);

    /** Écrans du cycle courant : l'alerte en tête tant qu'un blocker > 48 h existe. */
    const cycle = () => {
        const { teams } = _scope();
        const blockers = _blockers(teams);
        const night = _isNight();
        $('tv-root').classList.toggle('is-night', night);
        const base = night ? [NIGHT] : SCREENS;
        const screens = blockers.length ? [ALERT, ...base] : base;
        return { screens: locked ? screens.filter(s => s.id === locked).concat(screens.filter(s => s.id !== locked)).slice(0, locked ? 1 : screens.length) : screens, blockers, teams };
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
        $('tv-dots').innerHTML = screens.map((x, i) => `<i class="${i === _st.idx ? 'is-on' : ''}${x.id === 'alerte' ? ' is-alert' : ''}"></i>`).join('');
        const strip = $('tv-strip');
        if (blockers.length && s.id !== 'alerte') {
            strip.hidden = false;
            strip.innerHTML = `<span aria-hidden="true">⛈️</span> <b>${blockers.length} blocker${blockers.length > 1 ? 's' : ''} &gt; 48 h</b> — ${blockers.slice(0, 2).map(t => `<code>${esc(t.id)}</code> ${esc(t.team)}`).join(' · ')}${blockers.length > 2 ? ' · …' : ''}`;
        } else strip.hidden = true;
        $('tv-screen').innerHTML = s.id === 'alerte' ? _screenAlert(blockers)
            : s.id === 'meteo' ? _screenMeteo(args)
            : s.id === 'plans' ? _screenPlans(args)
            : _screenJournee(args);
        $('tv-screen').scrollTop = 0;
        clearTimeout(_st.timer);
        if (!locked && !_st.paused) _st.timer = setTimeout(() => show(_st.idx + 1), (seconds || s.seconds) * 1000);
    };

    const pause = (on) => { if (!_st) return; _st.paused = on; $('tv-root').classList.toggle('is-paused', on); if (on) clearTimeout(_st.timer); else show(_st.idx); };

    _st.onKey = e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowRight') { e.preventDefault(); show(_st.idx + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); show(_st.idx - 1); }
        else if (e.key === ' ') { e.preventDefault(); pause(!_st.paused); }
        else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); $('tv-fs')?.click(); }
        else if (e.key === 'Escape') { e.preventDefault(); $('tv-exit')?.click(); }
    };
    document.addEventListener('keydown', _st.onKey);
    $('tv-exit').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); store.set('view', 'dashboard'); });
    $('tv-fs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
    $('tv-root').addEventListener('mouseenter', () => pause(true));
    $('tv-root').addEventListener('mouseleave', () => pause(false));

    // Données rafraîchies (sync) → redessine l'écran courant ; changement de vue → nettoyage.
    _st.unsubs.push(store.on('tickets', () => show(_st?.idx || 0)));
    let unsubView = null;
    unsubView = store.on('view', v => { if (v !== 'tv') { _cleanup(); unsubView?.(); } });
    _st.unsubs.push(unsubView);

    show(0);
}
