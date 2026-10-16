/**
 * « 🌊 Flux cumulé par état » — onglet Indicateurs de la page PI (3.225.0) : surfaces empilées des six états
 * du rapport JIRA du train (00.TODO → 05.DEVELOPMENT_DONE, `utils/jira-stages.js`), jour OUVRÉ par jour
 * ouvré sur le PI. Deux cartes : l'équipe, puis sa ligne produit (groupe de Paramètres) avec une ligne par
 * équipe — le tableau JIRA, reproduit et copiable.
 *
 * RIEN n'est interpolé (≠ `renderCFD` du Board, qui simule) : chaque jour rejoue l'historique du ticket —
 * sprints (`sprintNamesAt`), statut et story points À CETTE DATE. Le dernier jour = périmètre `engagedInPi`
 * (même chiffre que l'Avancement du PI du Dashboard) : présent dans un sprint du PI, reports compris, sans
 * retirés ni « Clos sans suite ». Un retrait fait descendre la pile le jour où il a lieu.
 * ⚠️ Historique de statut COMPLET depuis 3.216.0 seulement : un sprint clos archivé avant peut porter un
 * historique tronqué (le statut le plus ancien connu vaut alors pour les jours d'avant).
 */
import { esc, extractPiNum, belongedToPi, sprintNamesAt, historyOf, jiraDateMs, isWorkday, workdaysBetween, burnDayKey, mapStatus,
    stageOfLabel, JIRA_STAGES, copyToClipboard, todayIsoLocal, emptyStateHtml } from '../utils.js';

const UNIT_KEY = 'sb-pi-stageflow-unit';
export const piFlowUnit = () => { try { return localStorage.getItem(UNIT_KEY) === 'tickets' ? 'tickets' : 'pts'; } catch { return 'pts'; } };
const _setUnit = u => { try { localStorage.setItem(UNIT_KEY, u); } catch { /* préférence de confort */ } };
// Vue des cartes (équipe ET ligne produit, réglage commun) : flux cumulé (surfaces dans le temps) ou barres
// (une par équipe, état du jour).
const VIEW_KEY = 'sb-pi-stageflow-view';
export const piFlowView = () => { try { return localStorage.getItem(VIEW_KEY) === 'bars' ? 'bars' : 'flow'; } catch { return 'flow'; } };
const _setView = v => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* préférence de confort */ } };
// Barres en valeur (pts / tickets) ou en % : chaque équipe ramenée à 100, pour comparer des équipes de tailles différentes.
const PCT_KEY = 'sb-pi-stageflow-pct';
export const piFlowPct = () => { try { return localStorage.getItem(PCT_KEY) === '1'; } catch { return false; } };
const _setPct = on => { try { localStorage.setItem(PCT_KEY, on ? '1' : '0'); } catch { /* préférence de confort */ } };

const _endOfDayMs = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
const _r1 = v => Math.round(v * 10) / 10;
const _fmt = v => String(_r1(v)).replace('.', ',');

/** Valeur d'un champ à l'instant `atMs` : après le DERNIER changement, la valeur actuelle fait foi. */
function _valueAt(changes, atMs, current) {
    if (!changes.length) return current;
    const before = changes.filter(x => x.ms <= atMs).pop();
    if (before === changes.at(-1)) return current;
    return before ? before.ch.to : changes[0].ch.from;
}

const _ORDER = Object.fromEntries(JIRA_STAGES.map((s, i) => [s.key, i]));
const _later = (a, b) => (a && (_ORDER[a] ?? -1) >= (_ORDER[b] ?? -1) ? a : b);
const _normLbl = v => String(v || '').trim().toLowerCase();

/**
 * État à l'instant `atMs` : `{ key, label }` — clé de JIRA_STAGES (null = abandonné) et libellé JIRA de ce
 * jour-là ('' quand il est reconstruit par les dates).
 * Historique COMPLET (son dernier `to` = statut actuel) : rejoué tel quel. Historique ABSENT ou TRONQUÉ (sprints
 * clos archivés avant 3.216.0 : 7 tickets Fuego « En Prod » sans aucun changement de statut, comptés terminés
 * dès le 07/09) : changements connus, puis reconstruction par les dates du cycle — avant `startedDate` = dernier
 * état connu (à faire par défaut), après = en développement, à `resolvedDate` = état actuel.
 */
function _stageAt(t, h, atMs, guessed) {
    const stage = lbl => {
        if (!lbl) return stageOfLabel('', () => t.status).key;   // ticket local sans libellé JIRA : statut interne
        const s = stageOfLabel(lbl, mapStatus);
        if (s.guessed) guessed.add(lbl);
        return s.key;
    };
    const of = lbl => ({ key: stage(lbl), label: lbl });
    const st = h.status, cur = t.jiraStatus || '';
    if (st.length && _normLbl(st.at(-1).ch.to) === _normLbl(cur)) return of(_valueAt(st, atMs, cur));
    const before = st.filter(x => x.ms <= atMs).pop();
    if (before && before !== st.at(-1)) return of(before.ch.to);
    const knownLbl = before ? before.ch.to : st.length ? st[0].ch.from : '';
    const known = knownLbl ? stage(knownLbl) : null;
    const now = stage(cur), sta = jiraDateMs(t.startedDate), res = jiraDateMs(t.resolvedDate);
    const terminal = now === 'done' || now === null;
    const rebuilt = key => ({ key, label: key === known ? knownLbl : '' });
    if (terminal && Number.isFinite(res)) {
        if (atMs >= res) return { key: now, label: cur };
        return rebuilt(Number.isFinite(sta) && atMs >= sta ? _later(known, 'dev') : (known || 'todo'));
    }
    if (!terminal && Number.isFinite(sta) && atMs < sta) return rebuilt(known || 'todo');
    return { key: now, label: cur };
}

/** État et poids d'un ticket à l'instant `atMs` ; null = hors PI ce jour-là ou abandonné. */
function _snapshot(t, h, atMs, piNum, unit, guessed) {
    if (!sprintNamesAt(t, atMs).some(n => extractPiNum(n) === piNum)) return null;
    const { key, label } = _stageAt(t, h, atMs, guessed);
    if (!key) return null;
    const pts = Number(_valueAt(h.points, atMs, t.points || 0)) || 0;
    return { key, label, pts, v: unit === 'tickets' ? 1 : pts };
}

/**
 * Part du PI écoulée en jours OUVRÉS — même calcul que le repère « aujourd'hui » de l'Avancement du PI
 * (pi_progress.js), pour que les deux pages annoncent le même pourcentage.
 */
function _elapsedPct(bounds, today) {
    if (today < bounds.startIso) return 0;
    if (today > bounds.endIso) return 100;
    const all = workdaysBetween(bounds.startIso, bounds.endIso), gone = workdaysBetween(bounds.startIso, today);
    return all > 0 ? Math.max(0, Math.min(100, Math.round(gone / all * 100))) : 0;
}

/** En retard : moins terminé que le temps écoulé, au-delà de la marge de démarrage (même règle que pi_progress). */
export const piFlowLate = (donePct, elapsed) => elapsed >= 15 && donePct + 10 < elapsed;

/**
 * @param {object}   o
 * @param {object[]} o.tickets  tickets du périmètre (équipe ou ligne produit), NON réduits au PI
 * @param {number}   o.piNum
 * @param {{startIso, endIso}} o.bounds  `piBounds(...)`
 * @param {string}   [o.today]  AAAA-MM-JJ local
 * @param {'pts'|'tickets'} [o.unit]
 * @param {string[]} [o.teams]  une ligne par équipe dans `rows` (ligne produit)
 */
export function piStageFlowModel({ tickets = [], piNum, bounds, today = todayIsoLocal(), unit = 'pts', teams = [] }) {
    if (!piNum || !bounds?.startIso || !bounds?.endIso) return null;
    const days = [];
    for (let d = new Date(`${bounds.startIso}T12:00:00`); burnDayKey(d) <= bounds.endIso; d.setDate(d.getDate() + 1)) {
        if (isWorkday(d)) days.push(burnDayKey(d));
    }
    const shownN = days.filter(d => d <= today).length;
    const cands = tickets.filter(t => belongedToPi(t, piNum))
        .map(t => ({ t, h: { status: historyOf(t, 'status'), points: historyOf(t, 'story points') } }));
    const guessed = new Set();
    const series = Object.fromEntries(JIRA_STAGES.map(s => [s.key, days.map(() => null)]));
    const byDay = [];   // byDay[i] = [{ t, snap }] : la liste d'une bande cliquée (`piFlowPick`)
    for (let i = 0; i < shownN; i++) {
        const at = Math.min(Date.now(), _endOfDayMs(days[i]));
        for (const s of JIRA_STAGES) series[s.key][i] = 0;
        byDay[i] = [];
        for (const { t, h } of cands) {
            const snap = _snapshot(t, h, at, piNum, unit, guessed);
            if (!snap) continue;
            series[snap.key][i] += snap.v;
            byDay[i].push({ t, snap });
        }
        for (const s of JIRA_STAGES) series[s.key][i] = _r1(series[s.key][i]);
    }
    // État d'AUJOURD'HUI (ou de la fin du PI s'il est passé), ticket par ticket : tableau + listes.
    const at = Math.min(Date.now(), _endOfDayMs(today < bounds.endIso ? today : bounds.endIso));
    const now = cands.map(({ t, h }) => ({ t, snap: _snapshot(t, h, at, piNum, unit, guessed) })).filter(x => x.snap);
    const row = (label, list) => {
        const by = Object.fromEntries(JIRA_STAGES.map(s => [s.key, 0]));
        for (const x of list) by[x.snap.key] += x.snap.v;
        for (const k in by) by[k] = _r1(by[k]);
        const total = _r1(Object.values(by).reduce((a, b) => a + b, 0));
        // Part TERMINÉE (05) : le chiffre posé en bout de barre, comparé au temps écoulé du PI.
        return { label, by, total, n: list.length, donePct: total > 0 ? Math.round(by.done / total * 100) : 0 };
    };
    return {
        piNum, unit, days, shownN, elapsed: _elapsedPct(bounds, today),
        labels: days.map(d => `${d.slice(8, 10)}/${d.slice(5, 7)}`),
        todayIndex: today >= days[0] && today <= days.at(-1) ? shownN - 1 : -1,
        series, byDay, total: row('Total', now), now,
        rows: teams.length ? teams.map(tm => row(tm, now.filter(x => x.t.team === tm))) : [],
        guessed: [...guessed],
    };
}

/** Tableau au format du rapport JIRA (TSV : se colle dans un tableur ou Confluence). */
export function piFlowTsv(m, { title, prefix = '' }) {
    const head = ['', 'TOTAL', ...JIRA_STAGES.map(s => s.label)].join('\t');
    const line = r => [r.label === 'Total' ? r.label : `${prefix}${r.label}`, _fmt(r.total), ...JIRA_STAGES.map(s => _fmt(r.by[s.key]))].join('\t');
    // Sans ligne par équipe (carte d'une équipe) : la ligne porte son nom, comme le rapport JIRA.
    const total = m.rows.length ? m.total : { ...m.total, label: title };
    return [`${title}\tPI ${m.piNum}\t${m.unit === 'tickets' ? 'tickets' : 'story points'}`, head,
        ...(m.rows.length ? m.rows.filter(r => r.n).map(line) : []), line(total)].join('\n');
}

function _tableHtml(m, title) {
    const u = m.unit === 'tickets' ? 'tk' : 'pts';
    const rows = m.rows.length ? m.rows.filter(r => r.n) : [];
    // Cellule cliquable : la liste de ces tickets aujourd'hui (`team` vide = toute la carte).
    const tr = (r, team, cls = '') => `<tr class="${cls}"><th scope="row">${esc(r.label)}</th>
        <td class="psf-total"><button type="button" data-psf-cell="" data-psf-team="${esc(team)}" title="Lister les ${r.n} tickets">${_fmt(r.total)}</button></td>
        ${JIRA_STAGES.map(s => `<td class="${r.by[s.key] ? '' : 'is-zero'}">${r.by[s.key]
            ? `<button type="button" data-psf-cell="${s.key}" data-psf-team="${esc(team)}" title="${esc(s.label)}${team ? ` · ${esc(team)}` : ''} — lister les tickets">${_fmt(r.by[s.key])}</button>`
            : _fmt(0)}</td>`).join('')}</tr>`;
    return `<div class="psf-table-wrap"><table class="psf-table">
        <thead><tr><th></th><th title="Total en ${u}">Total</th>${JIRA_STAGES.map(s => `<th title="${esc(s.label)}"><i style="background:${s.color}"></i>${esc(s.code)}<span>${esc(s.short)}</span></th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => tr(r, r.label)).join('')}${rows.length ? tr(m.total, '', 'psf-sum') : tr({ ...m.total, label: title }, '')}</tbody>
    </table></div>`;
}

/**
 * Tickets d'une sélection : état `key` ('' = tous) au jour `i` (dernier jour affiché par défaut), d'une équipe
 * (`team` vide = toute la carte). Triés par points décroissants.
 */
export function piFlowPick(m, { key = '', i = m.shownN - 1, team = '' } = {}) {
    return (m.byDay[i] || [])
        .filter(x => (!key || x.snap.key === key) && (!team || x.t.team === team))
        .sort((a, b) => b.snap.pts - a.snap.pts || String(a.t.id).localeCompare(String(b.t.id)));
}

const _MAX_ROWS = 40;
function _listHtml(m, sel, multiTeam) {
    const list = piFlowPick(m, sel);
    const st = JIRA_STAGES.find(s => s.key === sel.key);
    const i = sel.i ?? m.shownN - 1;
    const isToday = i === m.shownN - 1;
    const pts = _r1(list.reduce((a, x) => a + x.snap.pts, 0));
    const rows = list.slice(0, _MAX_ROWS).map(({ t, snap }) => {
        const s = JIRA_STAGES.find(x => x.key === snap.key);
        const lbl = snap.label || `${s.short} (reconstruit)`;
        return `<button type="button" class="stuck-row psf-row" data-ticket="${esc(t.id)}" title="Ouvrir ${esc(t.id)}">
            <span class="stuck-dot" style="background:${s.color}"></span>
            <span class="stuck-id">${esc(t.id)}</span>
            <span class="stuck-title">${esc(t.title || '')}</span>
            <span class="stuck-state" title="${isToday ? 'Statut JIRA' : `Statut JIRA le ${esc(m.labels[i])} — aujourd'hui : ${esc(t.jiraStatus || '—')}`}">${esc(lbl)}</span>
            ${multiTeam ? `<span class="stuck-lead">${esc(t.team || '')}</span>` : ''}
            <span class="stuck-age" title="Story points ce jour-là">${snap.pts > 0 ? `${_fmt(snap.pts)} pts` : '— pts'}</span>
        </button>`;
    }).join('');
    return `<div class="pip-list-head">
            ${st ? `<i class="psf-list-dot" style="background:${st.color}"></i><b>${esc(st.label)}</b>` : '<b>Tous les états</b>'}
            <span class="text-muted">${isToday ? 'aujourd\'hui' : `le ${esc(m.labels[i])}`}${sel.team ? ` · ${esc(sel.team)}` : ''} · ${list.length} ticket${list.length > 1 ? 's' : ''} · ${_fmt(pts)} pts</span>
            <button type="button" class="btn-icon pip-list-close" data-psf-close aria-label="Replier la liste" title="Replier">×</button>
        </div>
        <div class="stuck-list pip-list-rows${multiTeam ? ' psf-rows--team' : ''}">${rows || '<p class="text-muted text-sm">Aucun ticket.</p>'}</div>
        ${list.length > _MAX_ROWS ? `<p class="pip-list-more text-muted text-xs">+${list.length - _MAX_ROWS} autres</p>` : ''}`;
}

/**
 * @param {object} m       modèle `piStageFlowModel` (null = PI sans bornes)
 * @param {object} o
 * @param {string} o.id    suffixe unique (canvas, data-*)
 * @param {string} o.title « Fuego », « Ligne produit GCOM »
 * @param {string} [o.note] précision sous le titre (HTML déjà échappé : équipe hors ligne produit…)
 */
export function piFlowCardHtml(m, { id, title, note = '' }) {
    const unit = m?.unit || piFlowUnit();
    const seg = (attr, cur, opts) => `<span class="psf-unit" role="group">${opts.map(([v, lbl, tip]) =>
        `<button type="button" class="${cur === v ? 'is-on' : ''}" data-${attr}="${v}" aria-pressed="${cur === v}"${tip ? ` title="${esc(tip)}"` : ''}>${lbl}</button>`).join('')}</span>`;
    const hasBars = !!m;
    const view = piFlowView();
    const barN = m ? (m.rows.filter(r => r.n).length || 1) : 1;
    const head = sub => `<div class="card-header psf-head">
            <div><span class="card-title">🌊 Flux cumulé — ${esc(title)}</span><span class="card-subtitle">${sub}</span></div>
            <div class="psf-actions">
                ${hasBars ? seg('psf-view', view, [['flow', '📈 Flux', 'Surfaces empilées jour par jour'], ['bars', '📊 Barres', 'Une barre par équipe, état du jour']]) : ''}
                ${view === 'bars' ? seg('psf-pct', piFlowPct() ? 'pct' : 'val', [['val', 'Valeur', 'Points ou tickets'], ['pct', '%', 'Chaque équipe ramenée à 100 %']]) : ''}
                ${seg('psf-unit', unit, [['pts', 'Points'], ['tickets', 'Tickets']])}
                ${m?.total.n ? `<button type="button" class="btn btn-ghost btn-xs" data-psf-copy="${esc(id)}" title="Copier le tableau au format du rapport JIRA (colle dans un tableur ou Confluence)">📋 Copier</button>` : ''}
            </div>
        </div>${note ? `<p class="psf-note">${note}</p>` : ''}`;
    if (!m) return `<div class="card psf">${head('Bornes du PI inconnues')}${emptyStateHtml({ icon: '🌊', title: 'Pas de dates pour ce PI', text: 'Aucun sprint daté ni cadence projetée : le flux ne peut pas être tracé.' })}</div>`;
    const u = unit === 'tickets' ? 'tickets' : 'pts';
    if (!m.shownN) return `<div class="card psf">${head(`PI #${m.piNum} · pas encore commencé`)}${emptyStateHtml({ icon: '🌊', title: 'Le PI n\'a pas commencé', text: `Le flux démarrera le ${esc(m.labels[0] || '')}.` })}</div>`;
    const sub = `PI #${m.piNum} · <b>${_fmt(m.total.total)} ${u}</b> · ${m.total.n} ticket${m.total.n > 1 ? 's' : ''} · ${view === 'bars'
        ? `état JIRA du jour${m.rows.length ? ', une barre par équipe' : ''} · <span class="psf-elapsed-key">┆</span> ${m.elapsed} % du PI écoulé — cliquer un segment`
        : 'état JIRA jour par jour (jours ouvrés) — cliquer une bande'}`;
    const barsH = view === 'bars' ? ` style="height:${Math.max(150, 46 * barN + 100)}px"` : '';
    return `<div class="card psf" data-psf="${esc(id)}">
        ${head(sub)}
        <div class="chart-container psf-chart"${barsH}><canvas id="psf-chart-${esc(id)}" aria-label="Flux cumulé par état — ${esc(title)}"></canvas></div>
        ${_tableHtml(m, title)}
        <div class="pip-list psf-list" data-psf-list hidden></div>
        ${m.guessed.length ? `<p class="psf-guess" title="Libellés JIRA absents de utils/jira-stages.js, rangés d'après le statut interne">⚠ Statut${m.guessed.length > 1 ? 's' : ''} non répertorié${m.guessed.length > 1 ? 's' : ''} : ${m.guessed.map(esc).join(', ')}</p>` : ''}
    </div>`;
}

/**
 * Câble les cartes rendues dans `root` : copie, bascules d'unité et de vue (`rerender()` redessine l'onglet),
 * cellules du tableau et lignes de la liste. Rend le contrôleur dont le graphique appelle `pick` au clic.
 * @param {Map<string, {m, title, prefix}>} cards
 * @returns {{ pick(id: string, sel: {key, i, team}): void }}
 */
export function bindPiFlowCards(root, cards, rerender) {
    const open = new Map();   // carte → clé de la sélection affichée (re-cliquer = replier)
    const close = (card, id) => {
        open.delete(id);
        const panel = card.querySelector('[data-psf-list]');
        if (panel) panel.hidden = true;
        card.querySelectorAll('[data-psf-cell].is-active').forEach(el => el.classList.remove('is-active'));
    };
    const pick = (id, sel, cell = null) => {
        const card = root.querySelector(`[data-psf="${CSS.escape(id)}"]`);
        const c = cards.get(id);
        if (!card || !c?.m) return;
        const key = `${sel.key}|${sel.i ?? ''}|${sel.team || ''}`;
        if (open.get(id) === key) { close(card, id); return; }
        open.set(id, key);
        card.querySelectorAll('[data-psf-cell].is-active').forEach(el => el.classList.remove('is-active'));
        cell?.classList.add('is-active');
        const panel = card.querySelector('[data-psf-list]');
        panel.innerHTML = _listHtml(c.m, sel, c.m.rows.length > 0);
        panel.hidden = false;
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    root.querySelectorAll('[data-psf-unit]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.psfUnit === piFlowUnit()) return;
        _setUnit(b.dataset.psfUnit);
        rerender();
    }));
    root.querySelectorAll('[data-psf-view]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.psfView === piFlowView()) return;
        _setView(b.dataset.psfView);
        rerender();
    }));
    root.querySelectorAll('[data-psf-pct]').forEach(b => b.addEventListener('click', () => {
        if ((b.dataset.psfPct === 'pct') === piFlowPct()) return;
        _setPct(b.dataset.psfPct === 'pct');
        rerender();
    }));
    root.querySelectorAll('[data-psf-copy]').forEach(b => b.addEventListener('click', () => {
        const c = cards.get(b.dataset.psfCopy);
        if (c?.m) copyToClipboard(piFlowTsv(c.m, c), 'Tableau copié');
    }));
    root.querySelectorAll('[data-psf]').forEach(card => card.addEventListener('click', e => {
        const id = card.dataset.psf;
        if (e.target.closest('[data-psf-close]')) { close(card, id); return; }
        const row = e.target.closest('.psf-row[data-ticket]');
        if (row) { window.__squadBoard?.openTicketModal?.(row.dataset.ticket); return; }
        const cell = e.target.closest('[data-psf-cell]');
        if (cell) pick(id, { key: cell.dataset.psfCell, team: cell.dataset.psfTeam || '' }, cell);
    }));
    return { pick };
}
