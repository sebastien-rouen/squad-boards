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
import { esc, extractPiNum, belongedToPi, piEntryMs, isBufferItem, sprintNamesAt, historyOf, jiraDateMs, isWorkday, workdaysBetween, burnDayKey, mapStatus,
    stageOfLabel, JIRA_STAGES, copyToClipboard, toast, todayIsoLocal, emptyStateHtml, teamNameMatches } from '../utils.js';

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

/** Ticket du Buffer : étiquette « buffer » du ticket OU de son epic, ou epic « [Buffer] … » (GCOM-5022 : l'epic seule). */
export function bufferTest(features = []) {
    const ids = new Set(features.filter(f => isBufferItem(f) || /^\s*\[buffer\]/i.test(f.title || '')).map(f => f.id));
    return t => isBufferItem(t) || ids.has(t.epic);
}

/**
 * Ligne produit à montrer (page PI ET Dashboard, même choix) : le groupe de l'équipe filtrée, sinon le groupe du
 * topbar, sinon tout le train (`teams` = toutes les équipes). null = équipe rattachée à aucun groupe.
 * @returns {{ title, prefix, teams: string[], tickets: object[], group }|null}
 */
export function lineProductScope({ team, groupId, groups = [], tickets = [], teams = [] }) {
    const ofGroup = g => ({ title: `Ligne produit ${g.name}`, prefix: `${g.name} - `, teams: g.teams || [], group: g,
        tickets: tickets.filter(t => (g.teams || []).includes(t.team)) });
    if (team && team !== 'all') {
        const g = groups.find(x => (x.teams || []).some(n => teamNameMatches(n, team)));
        return g ? ofGroup(g) : null;
    }
    const g = groupId && groups.find(x => x.id === groupId);
    return g ? ofGroup(g) : { title: 'Toutes les équipes', prefix: '', teams, tickets, group: null };
}

/**
 * @param {object}   o
 * @param {object[]} o.tickets  tickets du périmètre (équipe ou ligne produit), NON réduits au PI
 * @param {number}   o.piNum
 * @param {{startIso, endIso}} o.bounds  `piBounds(...)`
 * @param {string}   [o.today]  AAAA-MM-JJ local
 * @param {'pts'|'tickets'} [o.unit]
 * @param {string[]} [o.teams]  une ligne par équipe dans `rows` (ligne produit)
 * @param {(t) => boolean} [o.isBuffer]  ticket du Buffer (hors ADDED SCOPE) — `bufferTest(features)` ajoute l'epic « [Buffer] »
 * @param {boolean}  [o.snapshotOnly]  état du jour seul, sans rejouer le PI jour par jour (Dashboard)
 */
export function piStageFlowModel({ tickets = [], piNum, bounds, today = todayIsoLocal(), unit = 'pts', teams = [], isBuffer = isBufferItem, snapshotOnly = false }) {
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
    for (let i = snapshotOnly ? shownN : 0; i < shownN; i++) {
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
    // ADDED SCOPE, calé sur le rapport JIRA du train (PI 31 : Ami −2, Bellier −3 au point près) : tickets du
    // périmètre ENTRÉS dans le PI après son premier jour (`piEntryMs`), à leurs points du jour, HORS Buffer (capacité
    // réservée : ses ajouts sont prévus). Une réestimation n'est pas un ajout ; un ajout retiré depuis ne compte plus.
    // JIRA l'affiche en NÉGATIF — conservé à l'écran et à la copie pour que les deux tableaux se comparent.
    const startCut = _endOfDayMs(bounds.startIso);
    // Jour d'ENTRÉE de chaque ajout (`addedIdx`) et cumul par jour (`addedDays[i]`) : repères du graphique Flux.
    const addedDays = [];
    for (const x of now) {
        const e = piEntryMs(x.t, piNum);
        x.added = Number.isFinite(e) && e > startCut && !isBuffer(x.t);
        if (!x.added) continue;
        const k = burnDayKey(new Date(e));
        let i = days.findIndex(d => d >= k);
        if (i < 0) i = days.length - 1;
        x.addedIdx = i;
        addedDays[i] ||= { v: 0, n: 0, ids: [] };
        addedDays[i].v = _r1(addedDays[i].v + x.snap.v);
        addedDays[i].n += 1;
        addedDays[i].ids.push(x.t.id);
    }
    if (snapshotOnly && shownN) byDay[shownN - 1] = now;
    const row = _row;
    return {
        piNum, unit, days, shownN, elapsed: _elapsedPct(bounds, today),
        labels: days.map(d => `${d.slice(8, 10)}/${d.slice(5, 7)}`),
        todayIndex: today >= days[0] && today <= days.at(-1) ? shownN - 1 : -1,
        series, byDay, addedDays, total: row('Total', now), now,
        rows: teams.length ? teams.map(tm => row(tm, now.filter(x => x.t.team === tm))) : [],
        guessed: [...guessed],
    };
}

/** Ligne du tableau : points par état, total, part terminée (05), ADDED SCOPE — équipe, total ou epic. */
function _row(label, list) {
    const by = Object.fromEntries(JIRA_STAGES.map(s => [s.key, 0]));
    for (const x of list) by[x.snap.key] += x.snap.v;
    for (const k in by) by[k] = _r1(by[k]);
    const total = _r1(Object.values(by).reduce((a, b) => a + b, 0));
    // Part TERMINÉE (05) : le chiffre posé en bout de barre, comparé au temps écoulé du PI.
    const added = _r1(list.filter(x => x.added).reduce((a, x) => a + x.snap.v, 0));
    return { label, by, total, n: list.length, donePct: total > 0 ? Math.round(by.done / total * 100) : 0, added };
}

/**
 * Détail PAR EPIC (le second tableau du rapport JIRA : une ligne par epic, ses six états, son ADDED SCOPE), sur
 * l'état du jour. `t.epic` porte l'id de la FEATURE parente (cf. CLAUDE.md) — `epicTitle` le traduit.
 * Tri : total décroissant (ordre du rapport JIRA), « Sans epic » en dernier.
 * @returns {{ id: string, label, by, total, n, added, donePct, teams: string[] }[]}  id '__none' = sans epic
 */
export function piFlowEpicRows(m, { team = '', epicTitle = id => id } = {}) {
    const groups = new Map();
    for (const x of m?.now || []) {
        if (team && x.t.team !== team) continue;
        const k = x.t.epic || '__none';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(x);
    }
    return [...groups].map(([id, list]) => ({ id, ..._row(id === '__none' ? 'Sans epic' : (epicTitle(id) || id), list),
        teams: [...new Set(list.map(x => x.t.team))] }))
        .sort((a, b) => (a.id === '__none') - (b.id === '__none') || b.total - a.total || a.label.localeCompare(b.label));
}

/** Détail par epic au format du rapport JIRA (TSV). */
export function piFlowEpicTsv(m, { title, team = '', epicTitle }) {
    const rows = piFlowEpicRows(m, { team, epicTitle }).filter(r => r.total > 0);   // comme le rapport JIRA
    return [`${title}\tPI ${m.piNum}\t${m.unit === 'tickets' ? 'tickets' : 'story points'}`,
        ['Epic', 'TOTAL', ...JIRA_STAGES.map(s => s.label), 'ADDED SCOPE'].join('\t'),
        ...rows.map(r => [r.label, _fmt(r.total), ...JIRA_STAGES.map(s => _fmt(r.by[s.key])), _fmt(-r.added || 0)].join('\t'))].join('\n');
}

// Message du détail par epic (Slack) : un emoji par état (lisible sans légende), 00 → 05.
const _SLACK_ICO = { todo: '⚪', scoping: '🟣', ready: '🔵', dev: '🛠️', testing: '🧪', done: '✅' };
const _cut = (v, n) => { const t = String(v || '').trim().replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const _pts = v => `${_fmt(v)} pt${v > 1 ? 's' : ''}`;

/**
 * Lignes du message, en segments neutres : chaîne = texte, `{ b }` = gras, `{ i }` = italique, `{ id, url }` = ticket.
 * Un seul modèle pour deux rendus — texte enrichi (Slack convertit gras et liens au collage) et texte brut sans
 * aucun balisage : le mrkdwn (`*gras*`, `<url|ID>`) s'affichait tel quel une fois collé dans le compositeur Slack.
 * `{ indent: true }` en tête de ligne = ligne de ticket, décalée.
 */
function _epicMessage(m, { title, team = '', epicTitle, jiraUrl = '', today = todayIsoLocal() }) {
    const u = m.unit === 'tickets' ? 'tickets' : 'pts';
    const tk = t => ({ id: t.id, url: jiraUrl ? `${jiraUrl}/browse/${t.id}` : '' });
    const scope = m.now.filter(x => !team || x.t.team === team);
    const head = _row('', scope);
    const all = piFlowEpicRows(m, { team, epicTitle });
    const rows = all.filter(r => r.total > 0), hidden = all.filter(r => !r.total);
    const order = JIRA_STAGES.map(s => s.key).reverse();   // le plus avancé d'abord : 04 test, 03 dév…
    const epicOf = r => scope.filter(x => (r.id === '__none' ? !x.t.epic : x.t.epic === r.id));
    const late = piFlowLate(head.donePct, m.elapsed);
    const L = [
        [{ b: `📂 Détail par epic — ${title} · PI ${m.piNum}` }, ` (${today.slice(8, 10)}/${today.slice(5, 7)})`],
        [`${_fmt(head.total)} ${u} · ✅ ${head.donePct} % terminé${late ? ' ⚠️' : ''} · ⏳ ${m.elapsed} % du PI écoulé`
            + (head.added ? ` · ➕ Added scope −${_fmt(head.added)} ${u}` : '')],
        [{ i: JIRA_STAGES.map(s => `${_SLACK_ICO[s.key]} ${s.short}`).join(' · ') + ' · ➕ ajouté au PI' }],
    ];
    for (const r of rows) {
        const list = epicOf(r);
        const parts = JIRA_STAGES.filter(s => r.by[s.key]).map(s => `${_SLACK_ICO[s.key]} ${_fmt(r.by[s.key])}`);
        L.push([], [{ b: r.label }, ` — ${_fmt(r.total)} ${u} · ${parts.join(' · ')}${r.added ? ` · ➕ −${_fmt(r.added)}` : ''}`]);
        const open = list.filter(x => x.snap.key !== 'done')
            .sort((a, b) => order.indexOf(a.snap.key) - order.indexOf(b.snap.key) || b.snap.pts - a.snap.pts);
        for (const x of open) {
            L.push([{ indent: true }, `${_SLACK_ICO[x.snap.key]} `, tk(x.t), ` ${_cut(x.t.title, 70)} · `,
                { i: x.snap.label || JIRA_STAGES.find(s => s.key === x.snap.key).short },
                (x.snap.pts > 0 ? ` · ${_pts(x.snap.pts)}` : '') + (x.added ? ' · ➕' : '')]);
        }
        const done = list.filter(x => x.snap.key === 'done').sort((a, b) => b.snap.pts - a.snap.pts);
        if (done.length) L.push([{ indent: true }, '✅ ', ...done.flatMap((x, k) => [k ? ', ' : '', tk(x.t), x.added ? ' ➕' : ''])]);
    }
    if (hidden.length) L.push([], [{ i: `+ ${hidden.length} epic${hidden.length > 1 ? 's' : ''} sans point (${hidden.reduce((a, r) => a + r.n, 0)} tickets non estimés)` }]);
    return L;
}

/** Détail par epic en TEXTE BRUT : aucun balisage, numéros de tickets sans lien (le lien vit dans la version riche). */
export function piFlowEpicText(m, opts) {
    return _epicMessage(m, opts).map(line => line.map(p => (typeof p === 'string' ? p
        : p.indent ? '    ' : p.id ? p.id : (p.b ?? p.i ?? ''))).join('')).join('\n');
}

/** Détail par epic en HTML : gras, italique et liens JIRA cliquables — collé dans Slack, il garde sa mise en forme. */
export function piFlowEpicHtml(m, opts) {
    const part = p => (typeof p === 'string' ? esc(p)
        : p.indent ? '&nbsp;&nbsp;&nbsp;&nbsp;'
        : p.id ? (p.url ? `<a href="${esc(p.url)}">${esc(p.id)}</a>` : esc(p.id))
        : p.b != null ? `<b>${esc(p.b)}</b>` : `<i>${esc(p.i)}</i>`);
    return _epicMessage(m, opts).map(line => (line.length ? `<div>${line.map(part).join('')}</div>` : '<div><br></div>')).join('');
}

/** Copie le détail par epic : HTML riche (Slack, Teams, mail) + texte brut de secours. */
export async function copyPiFlowEpic(m, opts) {
    const html = piFlowEpicHtml(m, opts), text = piFlowEpicText(m, opts);
    try {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('presse-papiers riche indisponible');
        await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
        toast('Détail par epic copié — collez-le dans Slack (liens cliquables)', 'success');
    } catch {
        copyToClipboard(text, 'Détail par epic copié (texte)');
    }
}

/** Tableau au format du rapport JIRA (TSV : se colle dans un tableur ou Confluence). */
export function piFlowTsv(m, { title, prefix = '' }) {
    const head = ['', 'TOTAL', ...JIRA_STAGES.map(s => s.label), 'ADDED SCOPE'].join('\t');
    const line = r => [r.label === 'Total' ? r.label : `${prefix}${r.label}`, _fmt(r.total), ...JIRA_STAGES.map(s => _fmt(r.by[s.key])), _fmt(-r.added || 0)].join('\t');
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
            : _fmt(0)}</td>`).join('')}
        <td class="psf-added ${r.added ? '' : 'is-zero'}">${r.added
            ? `<button type="button" data-psf-cell="__added" data-psf-team="${esc(team)}" title="${_fmt(r.added)} ${u} entrés dans le PI après son premier jour (hors Buffer) — JIRA l'affiche en négatif. Lister les tickets">−${_fmt(r.added)}</button>`
            : '0'}</td></tr>`;
    return `<div class="psf-table-wrap"><table class="psf-table">
        <thead><tr><th></th><th title="Total en ${u}">Total</th>${JIRA_STAGES.map(s => `<th title="${esc(s.label)}"><i style="background:${s.color}"></i>${esc(s.code)}<span>${esc(s.short)}</span></th>`).join('')}<th class="psf-added" title="ADDED SCOPE : entrés dans le PI après son premier jour, hors Buffer (négatif, comme dans JIRA)">Added<span>scope</span></th></tr></thead>
        <tbody>${rows.map(r => tr(r, r.label)).join('')}${rows.length ? tr(m.total, '', 'psf-sum') : tr({ ...m.total, label: title }, '')}</tbody>
    </table></div>`;
}

/**
 * Section « 📂 Détail par epic » sous le tableau d'une ligne produit : choix de l'équipe (puces), tableau au format
 * du rapport JIRA, cellules cliquables (liste des tickets de l'epic dans cet état), copie TSV.
 * @param {object} o
 * @param {string[]} o.teams     équipes proposées (celles qui ont des tickets)
 * @param {string}   o.team      équipe affichée ('' = toutes)
 * @param {Function} o.epicTitle id de feature → titre
 */
export function piFlowEpicsHtml(m, { teams = [], team = '', epicTitle }) {
    // Epics à 0 (tickets non estimés) masquées, comme dans le rapport JIRA — comptées en pied de tableau.
    const all = piFlowEpicRows(m, { team, epicTitle });
    const rows = all.filter(r => r.total > 0), hidden = all.filter(r => !r.total);
    const u = m.unit === 'tickets' ? 'tk' : 'pts';
    const chip = (v, lbl) => `<button type="button" class="psf-chip${v === team ? ' is-on' : ''}" data-psf-epic-team="${esc(v)}" aria-pressed="${v === team}">${esc(lbl)}</button>`;
    const cell = (r, k, v, extra = '') => `<button type="button" data-psf-cell="${k}" data-psf-team="${esc(team)}" data-psf-epic="${esc(r.id)}" data-psf-epic-label="${esc(r.label)}"${extra}>${v}</button>`;
    const tr = r => `<tr><th scope="row" title="${esc(r.label)}${!team && r.teams.length ? ` — ${esc(r.teams.join(', '))}` : ''}">${esc(r.label)}${!team && teams.length > 1 ? `<small>${esc(r.teams.join(', '))}</small>` : ''}</th>
        <td class="psf-total">${cell(r, '', _fmt(r.total), ` title="Lister les ${r.n} tickets"`)}</td>
        ${JIRA_STAGES.map(s => `<td class="${r.by[s.key] ? '' : 'is-zero'}">${r.by[s.key] ? cell(r, s.key, _fmt(r.by[s.key])) : _fmt(0)}</td>`).join('')}
        <td class="psf-added ${r.added ? '' : 'is-zero'}">${r.added ? cell(r, '__added', `−${_fmt(r.added)}`, ` title="Ajoutés après le 1ᵉʳ jour du PI, hors Buffer"`) : '0'}</td></tr>`;
    return `<div class="psf-epics-bar">
            <span class="psf-chips" role="group" aria-label="Équipe">${chip('', 'Toutes')}${teams.map(t => chip(t, t)).join('')}</span>
            ${rows.length ? `<button type="button" class="btn btn-ghost btn-xs" data-psf-epic-copy title="Copier pour Slack : synthèse par epic et tickets avec leur lien JIRA">📋 Copier pour Slack</button>` : ''}
        </div>
        ${rows.length ? `<div class="psf-table-wrap"><table class="psf-table psf-table--epics">
            <thead><tr><th>Epic</th><th title="Total en ${u}">Total</th>${JIRA_STAGES.map(s => `<th title="${esc(s.label)}"><i style="background:${s.color}"></i>${esc(s.code)}</th>`).join('')}<th class="psf-added" title="ADDED SCOPE (négatif, comme dans JIRA)">Added</th></tr></thead>
            <tbody>${rows.map(tr).join('')}</tbody></table></div>` : '<p class="text-muted text-sm">Aucun ticket estimé.</p>'}
        ${hidden.length ? `<p class="psf-epics-hidden text-muted" title="${esc(hidden.map(r => `${r.label} (${r.n} ticket${r.n > 1 ? 's' : ''})`).join(' · '))}">+ ${hidden.length} epic${hidden.length > 1 ? 's' : ''} sans ${u === 'pts' ? 'point' : 'ticket'} (${hidden.reduce((a, r) => a + r.n, 0)} tickets non estimés), masquée${hidden.length > 1 ? 's' : ''} comme dans le rapport JIRA</p>` : ''}`;
}

/**
 * Tickets d'une sélection : état `key` ('' = tous) au jour `i` (dernier jour affiché par défaut), d'une équipe
 * (`team` vide = toute la carte). Triés par points décroissants.
 */
export function piFlowPick(m, { key = '', i = m.shownN - 1, team = '', epic = '', addedDay = null } = {}) {
    const src = key === '__added' ? m.now.filter(x => x.added && (addedDay == null || x.addedIdx === addedDay))
        : (m.byDay[i] || []).filter(x => !key || x.snap.key === key);
    return src.filter(x => (!team || x.t.team === team) && (!epic || (epic === '__none' ? !x.t.epic : x.t.epic === epic)))
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
            ${st ? `<i class="psf-list-dot" style="background:${st.color}"></i><b>${esc(st.label)}</b>` : sel.key === '__added' ? '<b>➕ Added scope</b><span class="text-muted">entrés après le 1ᵉʳ jour du PI, hors Buffer ·</span>' : '<b>Tous les états</b>'}
            <span class="text-muted">${isToday ? 'aujourd\'hui' : `le ${esc(m.labels[i])}`}${sel.team ? ` · ${esc(sel.team)}` : ''}${sel.epicLabel ? ` · ${esc(sel.epicLabel)}` : ''} · ${list.length} ticket${list.length > 1 ? 's' : ''} · ${_fmt(pts)} pts</span>
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
export function piFlowCardHtml(m, { id, title, note = '', epics = null }) {
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
        : `état JIRA jour par jour (jours ouvrés)${m.addedDays.some(a => a?.v > 0) ? ' · <span class="psf-add-key">▼ +N</span> entrés dans le PI (hors Buffer)' : ''} — cliquer une bande ou un repère`}`;
    const barsH = view === 'bars' ? ` style="height:${Math.max(150, 46 * barN + 100)}px"` : '';
    return `<div class="card psf" data-psf="${esc(id)}">
        ${head(sub)}
        <div class="chart-container psf-chart"${barsH}><canvas id="psf-chart-${esc(id)}" aria-label="Flux cumulé par état — ${esc(title)}"></canvas></div>
        ${_tableHtml(m, title)}
        ${epics ? `<details class="psf-epics" open><summary>📂 Détail par epic</summary>
            <div data-psf-epics>${piFlowEpicsHtml(m, epics)}</div></details>` : ''}
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
        const key = `${sel.key}|${sel.i ?? ''}|${sel.team || ''}|${sel.epic || ''}`;
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
        const chip = e.target.closest('[data-psf-epic-team]');
        const c = cards.get(id);
        if (chip && c?.epics) {
            c.epics = { ...c.epics, team: chip.dataset.psfEpicTeam };
            card.querySelector('[data-psf-epics]').innerHTML = piFlowEpicsHtml(c.m, c.epics);
            return;
        }
        if (e.target.closest('[data-psf-epic-copy]') && c?.epics) {
            const lbl = c.epics.team ? `${c.prefix || ''}${c.epics.team}` : c.title;
            copyPiFlowEpic(c.m, { title: lbl, team: c.epics.team, epicTitle: c.epics.epicTitle, jiraUrl: c.epics.jiraUrl });
            return;
        }
        const cell = e.target.closest('[data-psf-cell]');
        if (cell) pick(id, { key: cell.dataset.psfCell, team: cell.dataset.psfTeam || '', epic: cell.dataset.psfEpic || '', epicLabel: cell.dataset.psfEpicLabel || '' }, cell);
    }));
    return { pick };
}

/**
 * Dashboard → carte « 📈 Avancement du PI » : une ligne par équipe de la ligne produit, mêmes six états et même
 * repère du temps écoulé que les barres de la page PI. Barres HTML (pas de Chart.js sur la page d'accueil),
 * chacune ramenée à 100 % pour comparer des équipes de tailles différentes ; points écrits dans les segments.
 * @param {object} m  modèle `piStageFlowModel({ snapshotOnly: true, teams })`
 * @param {object} o
 * @param {string} o.title      « Ligne produit GCOM »
 * @param {string} [o.highlight] équipe filtrée (ligne mise en avant)
 * @param {string} [o.href]     lien vers le détail (page PI → Indicateurs)
 * @param {string} [o.copyLabel] périmètre du bouton « Détail par epic » (même message que la page PI), '' = sans bouton
 */
const _ink = hex => { const n = parseInt(String(hex).slice(1, 7), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 150 ? '#fff' : '#0f172a'; };

export function piFlowRowsHtml(m, { title, highlight = '', href = '', copyLabel = '' }) {
    const rows = m?.rows.filter(r => r.n) || [];
    if (!rows.length) return '';
    const el = m.elapsed;
    const line = r => {
        const late = piFlowLate(r.donePct, el);
        const segs = JIRA_STAGES.map(s => {
            const v = r.by[s.key];
            if (!v) return '';
            const w = r.total > 0 ? v / r.total * 100 : 0;
            return `<button type="button" class="psr-seg" style="width:${w}%;background:${s.color};color:${_ink(s.color)}" data-psr-key="${s.key}" data-psr-team="${esc(r.label)}"
                title="${esc(s.label)} : ${_fmt(v)} pts (${Math.round(w)} %) — cliquer pour la liste">${w >= 9 ? _fmt(v) : ''}</button>`;
        }).join('');
        return `<div class="psr-row${highlight && teamNameMatches(r.label, highlight) ? ' is-current' : ''}">
            <span class="psr-name" title="${esc(r.label)} · ${_fmt(r.total)} pts">${esc(r.label)} <small>${_fmt(r.total)}</small></span>
            <span class="psr-bar">${segs}<i class="psr-now" style="left:${el}%" aria-hidden="true"></i></span>
            <span class="psr-done${late ? ' is-late' : ''}" title="Terminé (05) : ${r.donePct} % des points${late ? ` — en retard sur le temps écoulé (${el} %)` : ''}">✓ ${r.donePct} %</span>
        </div>`;
    };
    return `<div class="psr" data-psr>
        <div class="psr-head"><b>États JIRA — ${esc(title)}</b>
            <span class="text-muted">en story points · <i class="psr-key" aria-hidden="true"></i> ${el} % du PI écoulé</span>
            ${copyLabel ? `<button type="button" class="btn btn-ghost btn-xs psr-copy" data-psr-copy title="Copier pour Slack le détail par epic de ${esc(copyLabel)} (tickets avec leur lien JIRA)">📋 Détail par epic</button>` : ''}
            ${href ? `<a class="psr-more" href="${esc(href)}" title="Flux cumulé jour par jour, tableau, Added scope">Détail →</a>` : ''}</div>
        ${rows.map(line).join('')}
        <div class="psr-legend">${JIRA_STAGES.map(s => `<span><i style="background:${s.color}"></i>${esc(s.code)} ${esc(s.short)}</span>`).join('')}</div>
        <div class="pip-list psf-list" data-psr-list hidden></div>
    </div>`;
}

/**
 * Clic sur un segment de `piFlowRowsHtml` → liste des tickets dans son volet (distinct de celui de la carte hôte,
 * qui garde sa propre logique d'ouverture). Re-cliquer le même segment replie.
 * @param {object} [copyOpts]  options de `copyPiFlowEpic` (title, team, epicTitle, jiraUrl) du bouton « Détail par epic »
 */
export function bindPiFlowRows(root, m, copyOpts = null) {
    const box = root.querySelector('[data-psr]');
    const panel = box?.querySelector('[data-psr-list]');
    if (!box || !m || !panel) return;
    let open = '';
    box.querySelector('[data-psr-copy]')?.addEventListener('click', () => { if (copyOpts) copyPiFlowEpic(m, copyOpts); });
    box.addEventListener('click', e => {
        const seg = e.target.closest('[data-psr-key]');
        if (!seg) return;
        const key = `${seg.dataset.psrKey}|${seg.dataset.psrTeam}`;
        box.querySelectorAll('.psr-seg.is-active').forEach(x => x.classList.remove('is-active'));
        if (open === key && !panel.hidden) { open = ''; panel.hidden = true; return; }
        open = key;
        seg.classList.add('is-active');
        panel.innerHTML = _listHtml(m, { key: seg.dataset.psrKey, team: seg.dataset.psrTeam }, true);
        panel.hidden = false;
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    panel.addEventListener('click', e => {
        if (e.target.closest('[data-psf-close]')) { open = ''; panel.hidden = true; box.querySelectorAll('.psr-seg.is-active').forEach(x => x.classList.remove('is-active')); return; }
        const row = e.target.closest('.psf-row[data-ticket]');
        if (row) window.__squadBoard?.openTicketModal?.(row.dataset.ticket);
    });
}
