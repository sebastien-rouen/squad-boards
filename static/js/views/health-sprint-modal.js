/**
 * 🩺 Health — modale « Sprints du PI » d'une équipe (vélocité / buffer / prévu, votes Mood et Confiance, charge prévue), ouverte depuis la matrice ou le hash ; lecture JIRA des sprints clos non synchronisés.
 *
 * Extrait de health.js (3.261.0), code déplacé à l'identique. N'importe jamais health.js (pas de cycle).
 */
import { store } from '../state.js';
import { esc, isBreathSprint, carriedOverTo, toast, hashColor, isBufferItem } from '../utils.js';
import * as api from '../api.js';
import { isActionRetro } from '../business_rules.js';
import { VOTE_KINDS, pushVote, voteCellHtml, voteTotalHtml, voteRowCls, pickerHtml } from './health-votes.js';
import { _fmtD, _healthCtx, _pointsAtLaunch, _spKey, _sprintMetaStore, _stateBadge } from './health-shared.js';

// Réouverture depuis le hash (refresh / lien partagé / retour arrière depuis un ticket) : lit
// _sprintMetaStore peuplé par renderHealth. `pushHistory: false` — le hash courant correspond
// déjà à cet état (on y arrive PAR la navigation), le ré-empiler créerait des entrées dupliquées
// que "Fermer"/Échap doivent retraverser une par une (la modale semble alors ne plus se fermer).
export function reopenSprintModalFromHash(team, metric, sprintName) {
    const meta = _sprintMetaStore.get(team);
    if (meta) _openSprintModal(meta, team, metric, sprintName, false);
}

// Découverte (mise en cache) du champ Story Points JIRA — pour le lazy-fetch des sprints clos.
let _spFieldCache = null;
async function _discoverSpField() {
    if (_spFieldCache !== null) return _spFieldCache;
    try {
        const fields = await api.jiraGet('rest/api/3/field');
        const sp = (fields || []).find(f => f.custom && /story point/i.test(f.name || ''));
        _spFieldCache = sp?.id || '';
    } catch { _spFieldCache = ''; }
    return _spFieldCache;
}

// Récupère les issues d'un sprint JIRA (sprints clos non synchronisés localement).
// Retourne des objets ticket simplifiés {id,title,status,points,leader,labels,epic}.
async function _fetchSprintIssuesFromJira(jiraId) {
    const spField = await _discoverSpField();
    const fieldList = `summary,status,assignee,labels,parent${spField ? ',' + spField : ''}`;
    const out = [];
    let startAt = 0;
    while (true) {
        const r = await api.jiraGet(`rest/agile/1.0/sprint/${jiraId}/issue`, { startAt, maxResults: 50, fields: fieldList });
        const issues = r?.issues || [];
        for (const it of issues) {
            const f = it.fields || {};
            out.push({
                id: it.key,
                title: f.summary || '',
                status: f.status?.statusCategory?.key === 'done' ? 'done' : 'other',
                points: spField ? (Number(f[spField]) || 0) : 0,
                leader: f.assignee?.displayName || '',
                labels: f.labels || [],
                epic: f.parent?.key || '',
            });
        }
        if (issues.length < 50 || r?.isLast) break;
        startAt += issues.length;
        if (startAt > 300) break; // garde-fou
    }
    return out;
}

// ── Modal sprint détaillé (vélocité / buffer) ─────────────────────────────────
// `initialSprintName` : sprint dont la liste de tickets est affichée à l'ouverture —
// par défaut le sprint de référence de l'équipe, mais un lien profond (~sprint=...)
// peut cibler n'importe quel sprint du PI.
export function _openSprintModal(meta, teamName, metric, initialSprintName, pushHistory = true) {
    if (!meta) return;
    document.getElementById('health-sprint-modal')?.remove();

    const isVelo  = metric === 'velocity';
    const icon    = isVelo ? '⚡' : '🛡';
    const label   = isVelo ? 'Vélocité' : 'Buffer';
    const color   = meta.teamColor || '#6366f1';
    const initials = teamName.slice(0, 2).toUpperCase();
    const piLabel  = meta.piNum ? `PI#${meta.piNum}` : '';
    const activeSprintName = initialSprintName || meta.spName;

    // ── Tableau des sprints du PI ────────────────────────────────────────────
    // Totaux de colonne, accumulés pendant la construction des lignes. Les sprints
    // à venir affichent « — » (rien n'a pu se passer) : c'est une absence de mesure,
    // pas un zéro. On compte donc aussi le nombre de valeurs réellement mesurées (`n`)
    // pour rendre « — » quand la colonne entière est vide — un PI pas encore commencé
    // afficherait sinon des totaux à 0 qui ressembleraient à un échec.
    const tot = {};
    const _num = v => (typeof v === 'number' && Number.isFinite(v)) ? v
        : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
    const _hasNum = v => (typeof v === 'number' && Number.isFinite(v))
        || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
    const _add = (key, v) => {
        const t = tot[key] || (tot[key] = { sum: 0, n: 0 });
        if (!_hasNum(v)) return;
        t.sum += _num(v);
        t.n++;
    };
    const _totOf = key => tot[key]?.n ? String(tot[key].sum) : '<span class="htl-muted">—</span>';
    const _totNum = key => tot[key]?.sum || 0;
    // Écart NET au lancement (« nb actuel ») : ▲ vert / ▼ rouge, ±0 gris si des mouvements
    // se compensent, rien sans mouvement. Partagé par les lignes de sprint ET le Total PI.
    const _netHtml = (net, moved) => (!net && !moved) ? ''
        : net > 0 ? `<span class="htl-delta-net htl-delta-net--up">▲${net}</span>`
        : net < 0 ? `<span class="htl-delta-net htl-delta-net--down">▼${-net}</span>`
        : '<span class="htl-delta-net htl-delta-net--flat">±0</span>';
    // Mouvements cumulés par métrique (ajouts + retraits), pour le ±0 du Total PI.
    const _moves = { current: 0, bufcurrent: 0 };
    // Stabilité du périmètre, sprints démarrés seulement (un sprint à venir n'a pas de
    // lancement) : `plan` engagés au lancement, `removed` retirés EN COURS de sprint,
    // `added` ajoutés après le lancement. Les reports à la clôture ne sont PAS une
    // instabilité du périmètre (le ticket y est resté jusqu'au bout) : c'est un engagement
    // non tenu, déjà signalé par la colonne « nb début ».
    const _stab = { current: { plan: 0, removed: 0, added: 0 }, bufcurrent: { plan: 0, removed: 0, added: 0 } };

    // Clés de sprint du PI (« 29.3 ») — utilisées telles quelles pour apparier les votes
    // Mood et Confiance, en base comme après un vote enregistré à chaud.
    const _piKeys = (meta.piSprints || []).map(s => _spKey(s.name));

    const sprintRows = (meta.piSprints || []).map(s => {
        const sk    = _spKey(s.name);
        const moodHtml   = voteCellHtml('mood', teamName, sk);
        const fistHtml   = voteCellHtml('fist', teamName, sk);
        const isRef = s.name === meta.spName;
        const _active = m => s.name === activeSprintName && m === metric ? ' htl-cell-active' : '';
        // Charge prévue — trois sources, dans cet ordre :
        //   1. la saisie de l'équipe, qui prime toujours (c'est SA décision) ;
        //   2. l'engagement JIRA du sprint, s'il existe vraiment (`estimated > 0` — un 0
        //      signifie « pas encore planifié », pas « capacité nulle », et l'afficher tel
        //      quel remplissait la colonne de zéros sur tous les sprints à venir) ;
        //   3. à défaut, la base de capacité calculée : vélocité moyenne des 2 derniers PI
        //      corrigée des congés de CE sprint. Suggestion, pas saisie : elle n'est pas
        //      écrite en localStorage tant que l'utilisateur n'y a pas touché.
        const chargeKey  = `sb-charge-${s.name}`;
        const chargeSaved = localStorage.getItem(chargeKey);
        const capSp = meta.capBySprint?.[s.name] || null;
        // 🍃 Respiration : rien n'y est engagé, donc aucune charge n'y est suggérée. Le sprint
        // reste affiché — il existe — mais il est marqué pour qu'on ne le prenne pas pour une
        // itération de production oubliée.
        const isBreath = !!meta.capBase && isBreathSprint(s.name, meta.capBase.breathIdx);
        const chargeSuggested = chargeSaved == null && !(s.estimated > 0) && !!capSp;
        const chargeVal  = chargeSaved != null ? chargeSaved
            : (s.estimated > 0 ? String(s.estimated)
                : (capSp ? String(capSp.points) : ''));
        const chargeTitle = chargeSuggested
            ? `🎯 Base de capacité suggérée : ${capSp.points} pts\n`
                + `Vélocité moyenne ${meta.capBase.avg.toFixed(1)} pts/sprint (${meta.capBase.sprintsUsed} sprints clos des PI ${meta.capBase.pis.join(' et ')})\n`
                + `− ${Math.round(capSp.ratio * 100)} % d'absences sur ce sprint (${capSp.absencesDays.toFixed(1)} j pondérés sur ${(capSp.openDays * capSp.etp).toFixed(1)} j/h ouvrés)\n`
                + `Effectif : ${capSp.etp.toFixed(2)} j/h par jour ouvré — ${meta.capBase.staff.counted} personne${meta.capBase.staff.counted > 1 ? 's' : ''} comptée${meta.capBase.staff.counted > 1 ? 's' : ''}`
                + (meta.capBase.staff.ignored ? `, ${meta.capBase.staff.ignored} à 0 % (rôle exclu)` : '')
                + ` — détail dans l'infobulle 🎯 Base capacité de la matrice`
                + (capSp.capped ? `\n⚠ Congés connus jusqu'au ${_fmtD(_healthCtx.lastKnownAbsence)} seulement : absences sous-estimées, base optimiste.` : '')
                + `\n\nRepère de PI Planning — saisir une valeur pour la remplacer.`
            : isBreath
                ? "🍃 Sprint de respiration (IP) — rien n'y est planifié, il ne compte pas dans la Base capacité. Saisie possible malgré tout."
                : "Charge prévue — capacité en SP validée par l'équipe au PI Planning (éditable)";
        // Cellules Vélo/Buffer cliquables → section tickets en bas.
        // COHÉRENCE : « réalisé » = somme des Story Points des tickets Done locaux quand on les a
        // (= total affiché dans la section). Fallback sur la vélocité JIRA (greenhopper) sinon.
        // Sprint en cours/passé : une cellule vide est un vrai 0 mesuré (rien fait/engagé).
        // Sprint à venir : rien n'a encore pu se passer → le "—" reste plus honnête qu'un 0.
        const _isPastOrActive = s.state === 'active' || s.state === 'closed';
        const spT = meta.sprintTickets?.[s.name] || { done: [], bufDone: [] };
        const vel = spT.done.length
            ? spT.done.reduce((a, t) => a + (t.points || 0), 0)
            : (s.velocity != null ? s.velocity : (_isPastOrActive ? 0 : '—'));
        const buf = spT.bufDone.length
            ? spT.bufDone.reduce((a, t) => a + (t.points || 0), 0)
            : (s.bufferPoints != null ? s.bufferPoints : (_isPastOrActive ? 0 : '—'));
        const veloClickable = vel !== '—' || spT.done.length > 0;
        const bufClickable  = buf !== '—' || spT.bufDone.length > 0;
        const veloAttr = veloClickable ? ` htl-cell-clickable${_active('velocity')}" data-sp-tickets="${esc(s.name)}" data-sp-metric="velocity` : '';
        const bufAttr  = bufClickable  ? ` htl-cell-clickable${_active('buffer')}" data-sp-tickets="${esc(s.name)}" data-sp-metric="buffer`   : '';
        // Périmètre engagé au lancement : vélocité planifiée (pts) + nb de tickets engagés.
        const planTk = spT.planTk || 0, planPts = spT.planPts || 0, bufPlanTk = spT.bufPlanTk || 0, bufPlanPts = spT.bufPlanPts || 0;
        const planClickable = planTk > 0 || planPts > 0, bufPlanClickable = bufPlanTk > 0 || bufPlanPts > 0;
        const planAttr    = planClickable    ? ` data-sp-tickets="${esc(s.name)}" data-sp-metric="planned"`    : '';
        const bufPlanAttr = bufPlanClickable ? ` data-sp-tickets="${esc(s.name)}" data-sp-metric="bufplanned"` : '';
        const planCls = planClickable ? ' htl-cell-clickable' + _active('planned') : '', bufPlanCls = bufPlanClickable ? ' htl-cell-clickable' + _active('bufplanned') : '';
        const planHint = planClickable ? ' — cliquer pour la liste' : '', bufPlanHint = bufPlanClickable ? ' — cliquer pour la liste' : '';
        // Nb ACTUEL, à côté du nb au lancement : l'écart = ajouts − retraits/reports.
        const curTk = (spT.cur || []).length, bufCurTk = (spT.bufCur || []).length;
        // Écart au lancement : ajoutés · retirés · reportés à la clôture · modifiés (Story
        // Points réestimés, ajouts compris) — comptés pour l'infobulle et l'écart net.
        const _curCell = (n, m, extra, what) => {
            const cur  = (m === 'current' ? spT.cur : spT.bufCur) || [];
            const plan = (m === 'current' ? spT.all : spT.bufAll) || [];
            const curIds = new Set(cur.map(t => t.id));
            const added    = spT.plannedIds ? cur.filter(t => !spT.plannedIds.has(t.id)) : [];
            const removed  = spT.plannedIds ? plan.filter(t => !curIds.has(t.id)) : [];
            const modified = spT.startDate
                ? [...cur, ...removed].filter(t => _pointsAtLaunch(t, spT.startDate) !== (t.points || 0)) : [];
            const _ids = list => list.slice(0, 8).map(t => t.id).join(', ') + (list.length > 8 ? '…' : '');
            const _pl = (k, sing, plur) => `${k} ${k > 1 ? plur : sing}`;
            // Sprint clos : JIRA a déplacé les non-finis à la clôture — ils restent comptés
            // (le sprint les contenait), et sont nommés à part.
            const carried = s.state === 'closed' ? cur.filter(t => carriedOverTo(t, s.name)) : [];
            const tip = (s.state === 'closed'
                    ? `${what} dans le sprint à sa clôture (reportés compris)`
                    : `${what} actuellement dans le sprint`)
                + `\nAu lancement : ${plan.length} · maintenant : ${n}`
                + (carried.length  ? `\n↪ ${_pl(carried.length, 'reporté', 'reportés')} à la clôture : ${_ids(carried)}` : '')
                + (added.length    ? `\n🟢 ${_pl(added.length, 'ajouté', 'ajoutés')} après le lancement : ${_ids(added)}` : '')
                + (removed.length  ? `\n🔴 ${_pl(removed.length, 'retiré', 'retirés')} du sprint en cours de route : ${_ids(removed)}` : '')
                + (modified.length ? `\n🔵 ${_pl(modified.length, 'modifié', 'modifiés')} (Story Points réestimés) : ${_ids(modified)}` : '')
                + (n ? '\nCliquer pour la liste' : '');
            // Écart NET au lancement à droite du nombre (▲ vert / ▼ rouge) : le nombre est
            // déjà le total, l'indicateur dit seulement dans quel sens il a bougé. ±0 si des
            // mouvements se compensent. Détail (ajouts, retraits, reports, réestimations) :
            // infobulle uniquement — l'afficher en exposants obligeait à refaire le calcul.
            const moved = added.length + removed.length;
            _moves[m] += moved;
            if (spT.plannedIds && spT.startDate && _isPastOrActive) {
                _stab[m].plan += plan.length; _stab[m].removed += removed.length; _stab[m].added += added.length;
            }
            const netHtml = spT.plannedIds ? _netHtml(n - plan.length, moved) : '';
            return n
                ? `<td class="htl-spr-num htl-cur-col${extra} htl-cell-clickable${_active(m)}" data-sp-tickets="${esc(s.name)}" data-sp-metric="${m}" title="${esc(tip)}">${n}${netHtml}</td>`
                : `<td class="htl-spr-num htl-cur-col${extra}" title="${esc(tip)}">${dash}${netHtml}</td>`;
        };
        const dash = _isPastOrActive ? '0' : '<span class="htl-muted">—</span>';

        // Sur un sprint à venir, `planTk`/`planPts` valent 0 mais la cellule affiche
        // « — » : on aligne le total sur ce qui est RENDU, pas sur la valeur interne.
        _add('charge', chargeVal);
        _add('planTk', _isPastOrActive || planTk ? planTk : '—');
        _add('curTk', _isPastOrActive || curTk ? curTk : '—');
        _add('planPts', _isPastOrActive || planPts ? planPts : '—');
        _add('vel', vel);
        _add('bufTk', _isPastOrActive || bufPlanTk ? bufPlanTk : '—');
        _add('bufCurTk', _isPastOrActive || bufCurTk ? bufCurTk : '—');
        _add('bufPts', _isPastOrActive || bufPlanPts ? bufPlanPts : '—');
        _add('buf', buf);

        return `<tr class="${isRef ? 'htl-sprint-row--ref' : ''}${isBreath ? ' htl-sprint-row--breath' : ''}">
            <td class="htl-spr-name">${isRef ? `<strong>${esc(s.name)}</strong>` : esc(s.name)}${isBreath ? ' <span class="htl-breath-chip" title="Sprint de respiration (IP) — non planifié, exclu de la Base capacité">🍃</span>' : ''}</td>
            <td class="htl-spr-date">${_fmtD(s.startDate)}</td>
            <td class="htl-spr-state">${_stateBadge(s.state)}</td>
            <td class="htl-spr-vote">${moodHtml}</td>
            <td class="htl-spr-vote">${fistHtml}</td>
            <td class="htl-spr-num htl-grp-start"><input class="htl-charge-input${chargeSuggested ? ' htl-charge-input--suggested' : ''}" type="number" min="0" value="${esc(chargeVal)}" data-charge-key="${esc(chargeKey)}" title="${esc(chargeTitle)}"></td>
            <td class="htl-spr-num htl-grp-start${planCls}"${planAttr} title="Tickets engagés au lancement${planHint}">${planTk || dash}</td>
            ${_curCell(curTk, 'current', '', 'Tickets')}
            <td class="htl-spr-num${planCls}"${planAttr} title="Vélocité planifiée au lancement (estimation JIRA)${planHint}">${planPts || dash}</td>
            <td class="htl-spr-num htl-velo-col${veloAttr}"${veloClickable ? ' title="Voir les tickets Done de ce sprint"' : ''}>${vel}</td>
            <td class="htl-spr-num htl-grp-start${bufPlanCls}"${bufPlanAttr} title="Tickets Buffer engagés au lancement${bufPlanHint}">${bufPlanTk || dash}</td>
            ${_curCell(bufCurTk, 'bufcurrent', ' htl-bufplan-col', 'Tickets Buffer')}
            <td class="htl-spr-num htl-bufplan-col${bufPlanCls}"${bufPlanAttr} title="Vélocité Buffer planifiée au lancement${bufPlanHint}">${bufPlanPts || dash}</td>
            <td class="htl-spr-num htl-buf-col${bufAttr}"${bufClickable ? ' title="Voir les tickets Buffer de ce sprint"' : ''}>${buf}</td>
        </tr>`;
    }).join('');

    // Total PI de « nb actuel » : somme des sprints + écart net à la somme des « nb début ».
    // Évalués APRÈS la construction des lignes, qui alimentent `tot` et `_moves`.
    const _totNet = (curKey, planKey, m) => tot[curKey]?.n
        ? _netHtml(_totNum(curKey) - _totNum(planKey), _moves[m]) : '';
    const _totTip = (curKey, planKey, m, what) => {
        if (!tot[curKey]?.n) return `${what} actuellement dans les sprints du PI`;
        const net = _totNum(curKey) - _totNum(planKey);
        return `${what} dans les sprints du PI (sprints clos : contenu à la clôture)`
            + `\nAu lancement : ${_totNum(planKey)} · maintenant : ${_totNum(curKey)}`
            + ` (${net >= 0 ? '+' : ''}${net})`
            + (_moves[m] ? `\n${_moves[m]} mouvement${_moves[m] > 1 ? 's' : ''} (ajouts + retraits) sur le PI` : '')
            + _stabTip(m);
    };
    // Taux de stabilité : part des tickets engagés au lancement restés dans leur sprint
    // jusqu'au bout, + part d'ajouts rapportée à l'engagement. Comparable d'un PI à l'autre.
    const _stabTip = m => {
        const st = _stab[m];
        if (!st.plan) return '';
        const pct = v => Math.round(v / st.plan * 100);
        return `\n\n📐 Stabilité : ${pct(st.plan - st.removed)} % des ${st.plan} tickets engagés au lancement`
            + ` sont restés dans leur sprint${st.removed ? ` (${st.removed} retiré${st.removed > 1 ? 's' : ''} en cours de route)` : ''}`
            + `\n➕ Ajouts : ${st.added} ticket${st.added > 1 ? 's' : ''}, soit ${pct(st.added)} % de l'engagement`
            + `\n(sprints démarrés seulement ; un report à la clôture n'est pas un retrait)`;
    };

    // ── Section tickets (re-render au clic sur une cellule Vélo/Buffer) ───────
    // Index id → titre du parent : le parent (t.epic) peut être un epic, une feature
    // ou un ticket selon la hiérarchie JIRA → on cherche dans les 3 collections.
    const _parentTitleById = new Map();
    for (const e of (store.get('epics') || []))    _parentTitleById.set(e.id, e.title);
    for (const f of (store.get('features') || [])) _parentTitleById.set(f.id, f.title);
    for (const tk of (store.get('tickets') || [])) if (!_parentTitleById.has(tk.id)) _parentTitleById.set(tk.id, tk.title);

    // Listes de tickets d'un sprint selon la métrique cliquée :
    //   velocity = Done · buffer = Buffer Done · planned = engagés au lancement (tous) · bufplanned = Buffer engagés
    //   current / bufcurrent = contenu ACTUEL du sprint (ajouts en cours marqués « ➕ »)
    const _METRIC_FIELD = { velocity: 'done', buffer: 'bufDone', planned: 'all', bufplanned: 'bufAll', current: 'cur', bufcurrent: 'bufCur' };
    const _METRIC_EMPTY = { velocity: 'Done', buffer: 'Buffer Done', planned: 'engagé', bufplanned: 'Buffer engagé', current: 'dans le sprint', bufcurrent: 'Buffer dans le sprint' };
    const _isCurMetric = metric => metric === 'current' || metric === 'bufcurrent';
    const _plannedIdsFor = sprintName => meta.sprintTickets?.[sprintName]?.plannedIds
        || (sprintName === meta.spName ? meta.plannedIds : null);
    const _isPlanMetric = metric => metric === 'planned' || metric === 'bufplanned';
    const _ticketsFor = (sprintName, metric) => {
        const field = _METRIC_FIELD[metric] || 'done';
        const bucket = meta.sprintTickets?.[sprintName];
        if (bucket && bucket[field]) return bucket[field];
        if (sprintName === meta.spName && meta[field]) return meta[field];
        return [];
    };
    // Démarrage du sprint cliqué — nécessaire pour reconstituer les points "au lancement"
    // (planned/bufplanned) via _pointsAtLaunch, cohérent avec le total de la cellule du tableau.
    const _sprintStartFor = sprintName =>
        (sprintName === meta.spName ? meta.startDate : meta.sprintTickets?.[sprintName]?.startDate) || null;
    // Points à afficher/sommer pour un ticket selon la métrique : reconstitués au lancement
    // pour planned/bufplanned, courants sinon.
    const _ptsFor = (tk, metric, sprintStart) => _isPlanMetric(metric) ? _pointsAtLaunch(tk, sprintStart) : (tk.points || 0);

    // Un ticket engagé au lancement mais non terminé = engagement non tenu. On ne le
    // signale QUE sur les métriques d'engagement (planned/bufplanned) : dans une liste
    // « Done », un non-done n'existe pas, et dans « tous les tickets » ce serait du bruit.
    // `sprintClosed` distingue le définitif du provisoire — voir _missCls.
    // Deux façons de ne pas tenir un engagement : le ticket est resté sans être terminé,
    // ou il a été REPORTÉ vers un autre sprint. Le second cas compte même si le ticket est
    // `done` aujourd'hui : il l'a été ailleurs, après coup — pas dans ce sprint.
    const _isMissed = (tk, metric, sprintName) => _isPlanMetric(metric)
        && (tk.status !== 'done' || !!carriedOverTo(tk, sprintName));
    // Sprint clos → l'engagement est manqué pour de bon : barré. Sprint en cours → encore
    // rattrapable : orange seul, barrer reviendrait à condamner un ticket encore vivant.
    const _missCls = (tk, metric, ctx) => !_isMissed(tk, metric, ctx.sprintName) ? ''
        : (ctx.sprintClosed ? ' htl-ticket-row--missed htl-ticket-row--missed-final' : ' htl-ticket-row--missed');
    const _missCount = (items, metric, ctx) => items.filter(tk => _isMissed(tk, metric, ctx.sprintName)).length;
    // Compteur de manqués sur l'en-tête d'un groupe — muet quand tout a été tenu, pour
    // que la présence même du chiffre soit le signal.
    const _missMetaHtml = (items, metric, ctx) => {
        const n = _missCount(items, metric, ctx);
        if (!n) return '';
        const lbl = ctx.sprintClosed ? 'non réalisé' : 'en cours';
        return ` · <span class="htl-grp-missed" title="${esc(`${n} ticket${n > 1 ? 's' : ''} engagé${n > 1 ? 's' : ''} au lancement ${ctx.sprintClosed ? "et non terminé" + (n > 1 ? 's' : '') + " à la clôture du sprint (non fini sur place, ou reporté ailleurs)" : "pas encore terminé" + (n > 1 ? 's' : '')}`)}">${n} ✗ ${lbl}${n > 1 && ctx.sprintClosed ? 's' : ''}</span>`;
    };

    const _ACTIONRETRO_KEY = '__actionretro__';
    // `ctx` = { sprintName, sprintStart, isPastOrActive, sprintClosed } — regroupé plutôt
    // qu'égrené en paramètres positionnels, que la moindre insertion rendrait fragiles.
    const _ticketRowsHtml = (list, metric, ctx) => {
        const { sprintStart, isPastOrActive } = ctx;
        if (!list.length) return `<tr><td colspan="6" class="text-muted text-center" style="padding:16px">Aucun ticket ${_METRIC_EMPTY[metric] || ''}</td></tr>`;
        // Regroupe les tickets par parent (epic/feature) — un bloc par parent, trié par points décroissants.
        // Les tickets ActionRetro (actions de rétro, pas de Story Points attendu) sont isolés dans
        // leur propre groupe plutôt que noyés dans "Sans parent" — sinon ils ressemblent à des
        // tickets non estimés problématiques alors que c'est normal pour cette catégorie.
        const groups = new Map();
        for (const tk of list) {
            const k = isActionRetro(tk) ? _ACTIONRETRO_KEY : (tk.epic ? String(tk.epic) : '');
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(tk);
        }
        const _gpts = items => items.reduce((s, tk) => s + _ptsFor(tk, metric, sprintStart), 0);
        // Ordre : epics réels (points décroissants) → ActionRetro → Sans parent (toujours en dernier).
        const _grpOrder = k => k === '' ? 2 : k === _ACTIONRETRO_KEY ? 1 : 0;
        const ordered = [...groups.entries()].sort((a, b) => {
            const oa = _grpOrder(a[0]), ob = _grpOrder(b[0]);
            if (oa !== ob) return oa - ob;
            return oa === 0 ? _gpts(b[1]) - _gpts(a[1]) : 0;
        });
        const _ticketRow = tk => {
            const who = tk.leader || tk.assignee || '';
            const isBuf = isBufferItem(tk);
            const curPts = tk.points || 0;
            const _showLaunch = _isPlanMetric(metric) || _isCurMetric(metric);
            const launchPts = _showLaunch ? _pointsAtLaunch(tk, sprintStart) : curPts;
            const reestimated = _showLaunch && launchPts !== curPts;
            const ptsLabel = reestimated ? `${launchPts}→${curPts}` : String(launchPts || '');
            const missed  = _isMissed(tk, metric, ctx.sprintName);
            // Un chip vert sur un engagement non tenu dirait « fait » alors qu'il ne l'a pas
            // été dans ce sprint — le statut `done` d'un reporté vaut pour un autre sprint.
            const ptsHtml = (launchPts || reestimated)
                ? `<span class="htl-pts-chip${tk.status === 'done' && !missed ? ' htl-pts-chip--done' : ''}${reestimated ? ' htl-pts-chip--reest' : ''}"${reestimated ? ` title="Réestimé pendant le sprint : ${launchPts} pts au lancement → ${curPts} pts actuels"` : ''}>${ptsLabel}</span>`
                : (isPastOrActive ? '0' : '<span class="htl-muted">—</span>');
            // Sprint d'arrivée d'un report — l'afficher évite la question qui suit
            // immédiatement le constat : « et il est passé où, celui-là ? »
            const moved   = (_isPlanMetric(metric) || _isCurMetric(metric)) ? carriedOverTo(tk, ctx.sprintName) : '';
            const movedK  = _spKey(moved) || moved;
            const addedMid = _isCurMetric(metric) && !!ctx.plannedIds && !ctx.plannedIds.has(tk.id);
            const rowTitle = !missed ? 'Voir le détail du ticket'
                : moved
                    ? `Engagé au lancement puis REPORTÉ vers « ${moved} »${tk.status === 'done' ? ' — terminé depuis, mais pas dans ce sprint' : ''}. Cliquer pour le détail du ticket`
                    : (ctx.sprintClosed
                        ? 'Engagé au lancement mais NON réalisé — le sprint est clos. Cliquer pour le détail du ticket'
                        : 'Engagé au lancement, pas encore terminé — le sprint est en cours. Cliquer pour le détail du ticket');
            const doneCell = missed
                ? `<span class="htl-done-miss" title="${esc(moved ? 'Reporté vers ' + moved : ctx.sprintClosed ? 'Non réalisé' : 'Pas encore terminé')}">✗</span>`
                : tk.status === 'done'
                    ? '<span class="htl-done-yes" title="Terminé">✓</span>'
                    : '<span class="htl-done-no" title="Non terminé">·</span>';
            return `<tr class="htl-ticket-row${tk.status === 'done' ? ' htl-ticket-row--done' : ''}${_missCls(tk, metric, ctx)}" data-open-ticket="${esc(tk.id || '')}" title="${esc(rowTitle)}">
                <td class="htl-id">${esc(tk.id || '—')}</td>
                <td class="htl-done">${doneCell}</td>
                <td class="htl-title">${esc(tk.title || '')}${moved ? `<span class="htl-moved-chip" title="${esc(`Reporté vers « ${moved} »`)}">↪ ${esc(movedK)}</span>` : ''}${addedMid ? '<span class="htl-moved-chip htl-added-chip" title="Ajouté au sprint après son lancement — hors engagement">➕ ajouté</span>' : ''}</td>
                <td class="htl-buf-flag">${isBuf ? '<span title="Ticket Buffer">🛡️</span>' : ''}</td>
                <td class="htl-pts">${ptsHtml}</td>
                <td class="htl-who">${who ? esc(who) : '<span class="htl-muted">—</span>'}</td>
            </tr>`;
        };
        return ordered.map(([parentKey, items]) => {
            const isRetroGrp = parentKey === _ACTIONRETRO_KEY;
            const parentTitle = (parentKey && !isRetroGrp) ? (_parentTitleById.get(parentKey) || '') : '';
            const full = (parentKey && !isRetroGrp) ? `${parentKey}${parentTitle ? ' — ' + parentTitle : ''}` : '';
            const lbl  = full.length > 64 ? full.slice(0, 63) + '…' : full;
            const pc   = (parentKey && !isRetroGrp) ? hashColor(parentKey) : '';
            const head = isRetroGrp
                ? `<span class="htl-parent-chip htl-parent-chip--retro" title="Actions de rétrospective — pas de Story Points attendu, c'est normal">🔁 ActionRetro</span>`
                : parentKey
                    ? `<span class="htl-parent-chip" style="--pc:${pc}" data-open-ticket="${esc(parentKey)}" title="Parent : ${esc(parentKey)}${parentTitle ? ' — ' + esc(parentTitle) : ''} — cliquer pour voir le détail">${esc(lbl)}</span>`
                    : '<span class="htl-muted">Sans parent</span>';
            const groupRow = `<tr class="htl-grp-row"${pc ? ` style="--pc:${pc}"` : ''}>
                <td colspan="6" class="htl-grp-cell">${head}<span class="htl-grp-meta">${items.length} ticket${items.length !== 1 ? 's' : ''} · ${items.filter(x => x.status === 'done' && !_isMissed(x, metric, ctx.sprintName)).length} ✓${_missMetaHtml(items, metric, ctx)} · ${_gpts(items)} pts</span></td>
            </tr>`;
            // Tri intra-groupe : tickets terminés d'abord, puis points décroissants
            const sorted = items.slice().sort((a, b) => {
                const da = a.status === 'done' ? 1 : 0, db = b.status === 'done' ? 1 : 0;
                return db - da || _ptsFor(b, metric, sprintStart) - _ptsFor(a, metric, sprintStart);
            });
            return groupRow + sorted.map(_ticketRow).join('');
        }).join('');
    };

    // Contenu de la section tickets pour un sprint + métrique donnés
    const _METRIC_TITLE = {
        velocity:   '⚡ Tickets Done',
        buffer:     '🛡 Buffer Done',
        planned:    '📋 Tickets engagés au lancement',
        bufplanned: '🛡 Buffer engagé au lancement',
        current:    '📌 Tickets actuellement dans le sprint',
        bufcurrent: '🛡 Buffer actuellement dans le sprint',
    };
    // Liste « actuel » : les tickets engagés au lancement qui n'y sont plus, en fin de liste,
    // grisés et HORS total — sinon la pastille rouge −N ne se lirait que dans une infobulle.
    // Destination = sprint actuel du ticket (report), à défaut le backlog.
    const _removedRowsHtml = (sprintName, metric, curList, sprintStart) => {
        if (!_isCurMetric(metric)) return '';
        const curIds = new Set(curList.map(t => t.id));
        const removed = _ticketsFor(sprintName, metric === 'current' ? 'planned' : 'bufplanned')
            .filter(t => !curIds.has(t.id));
        if (!removed.length) return '';
        const rows = removed.map(tk => {
            const dest = tk.sprintName || tk.sprint_name || '';
            const destLbl = dest ? `↪ ${_spKey(dest) || dest}` : '↪ backlog';
            const pts = _pointsAtLaunch(tk, sprintStart);
            const who = tk.leader || tk.assignee || '';
            return `<tr class="htl-ticket-row htl-ticket-row--removed" data-open-ticket="${esc(tk.id || '')}" title="${esc(`Engagé au lancement puis retiré du sprint${dest ? ` — aujourd'hui dans « ${dest} »` : ' — renvoyé au backlog'}. Cliquer pour le détail du ticket`)}">
                <td class="htl-id">${esc(tk.id || '—')}</td>
                <td class="htl-done">${tk.status === 'done' ? '<span class="htl-done-yes" title="Terminé (hors de ce sprint)">✓</span>' : '<span class="htl-done-no">·</span>'}</td>
                <td class="htl-title">${esc(tk.title || '')}<span class="htl-moved-chip htl-removed-chip">➖ retiré ${esc(destLbl)}</span></td>
                <td class="htl-buf-flag">${isBufferItem(tk) ? '<span title="Ticket Buffer">🛡️</span>' : ''}</td>
                <td class="htl-pts">${pts || '<span class="htl-muted">—</span>'}</td>
                <td class="htl-who">${who ? esc(who) : '<span class="htl-muted">—</span>'}</td>
            </tr>`;
        }).join('');
        return `<tbody class="htl-removed-body">
            <tr class="htl-grp-row"><td colspan="6" class="htl-grp-cell"><span class="htl-removed-head">➖ Retirés depuis le lancement</span><span class="htl-grp-meta">${removed.length} ticket${removed.length > 1 ? 's' : ''} · hors total</span></td></tr>
            ${rows}
        </tbody>`;
    };

    const _ticketsSection = (sprintName, metric) => {
        const list = _ticketsFor(sprintName, metric);
        const sprintStart = _sprintStartFor(sprintName);
        // Sprint en cours/clos : un ticket sans points affiche "0" (vrai zéro mesuré) plutôt
        // qu'un "—" — cohérent avec le tableau récapitulatif des sprints ci-dessus.
        const spState = (meta.piSprints || []).find(s => s.name === sprintName)?.state;
        const isPastOrActive = spState === 'active' || spState === 'closed';
        // Clos = le sprint est passé : ce qui n'est pas fait ne le sera plus dans ce sprint.
        const sprintClosed = spState === 'closed';
        const ctx = { sprintName, sprintStart, isPastOrActive, sprintClosed, plannedIds: _plannedIdsFor(sprintName) };
        const missN = _missCount(list, metric, ctx);
        const movedN = _isPlanMetric(metric) ? list.filter(t => carriedOverTo(t, sprintName)).length : 0;
        // Ajouts en cours de sprint : exclus de l'engagement, mais signalés pour que l'écart avec
        // le contenu du sprint dans JIRA ne passe pas pour un oubli.
        const addedN = metric === 'planned' ? (meta.sprintTickets?.[sprintName]?.added || 0) : 0;
        const tot = list.reduce((s, t) => s + _ptsFor(t, metric, sprintStart), 0);
        // Si au moins un ticket a été réestimé pendant le sprint, le total "au lancement" seul
        // masquerait l'écart — on affiche aussi le total courant, même format que les chips de ligne.
        const totCurrent = list.reduce((s, t) => s + (t.points || 0), 0);
        const totReest = _isPlanMetric(metric) && tot !== totCurrent;
        const totLabel = totReest ? `${tot}→${totCurrent}` : String(tot);
        const totTitle = totReest ? ` title="Au moins un ticket réestimé pendant le sprint : ${tot} pts au lancement → ${totCurrent} pts actuels"` : '';
        return `
            <div class="htl-tickets-hdr">
                <span class="htl-tickets-hdr-title">${_METRIC_TITLE[metric] || _METRIC_TITLE.velocity}</span>
                ${sprintName ? `<span class="htl-tickets-hdr-sprint">${esc(sprintName)}</span>` : ''}
                <span class="htl-tickets-hdr-badge"${totTitle}>${list.length} ticket${list.length !== 1 ? 's' : ''} · ${totLabel} pts</span>
                ${addedN ? `<span class="htl-tickets-hdr-added htl-muted" title="${esc(`${addedN} ticket${addedN > 1 ? 's' : ''} ajouté${addedN > 1 ? 's' : ''} au sprint APRÈS son lancement : hors engagement, donc absent${addedN > 1 ? 's' : ''} de cette liste (reconstitué depuis l'historique du champ Sprint)`)}">+${addedN} ajouté${addedN > 1 ? 's' : ''} en cours</span>` : ''}
                ${missN ? `<span class="htl-tickets-hdr-missed" title="${esc(`${missN} ticket${missN > 1 ? 's' : ''} engagé${missN > 1 ? 's' : ''} au lancement ${sprintClosed ? 'et non tenu' + (missN > 1 ? 's' : '') + " à la clôture — l'engagement n'a pas été honoré" : 'et pas encore terminé' + (missN > 1 ? 's' : '') + ' — le sprint est en cours'}${movedN ? `\n\ndont ${movedN} reporté${movedN > 1 ? 's' : ''} vers un autre sprint (JIRA les déplace à la clôture ; ils sont reconstitués depuis l'historique du champ Sprint)` : ''}`)}">✗ ${missN} ${sprintClosed ? `non réalisé${missN > 1 ? 's' : ''}` : 'en cours'}${movedN ? ` <span class="htl-hdr-moved">↪ ${movedN}</span>` : ''}</span>` : ''}
            </div>
            <table class="htl-table">
                <thead><tr>
                    <th>ID</th><th title="Terminé">✓</th><th>Titre</th>
                    <th title="Ticket Buffer">🛡️</th><th>Pts</th><th>Responsable</th>
                </tr></thead>
                <tbody>${_ticketRowsHtml(list, metric, ctx)}</tbody>
                ${_removedRowsHtml(sprintName, metric, list, sprintStart)}
                ${list.length ? `<tfoot><tr>
                    <td colspan="4" class="htl-total-lbl">Total</td>
                    <td class="htl-total-val${totReest ? ' htl-total-val--reest' : ''}"${totTitle}>${totLabel}</td>
                    <td></td>
                </tr></tfoot>` : ''}
            </table>`;
    };

    const overlay = document.createElement('div');
    overlay.id = 'health-sprint-modal';
    overlay.className = 'modal-overlay alert-modal-overlay';
    overlay.innerHTML = `
        <div class="modal htl-modal">
            <div class="htl-modal-hdr" style="border-top:4px solid ${esc(color)}">
                <div class="htl-modal-hdr-left">
                    <div class="htl-modal-swatch" style="background:${esc(color)}">${esc(initials)}</div>
                    <div class="htl-modal-hdr-text">
                        <div class="htl-modal-hdr-title">${icon} ${esc(label)}</div>
                        <div class="htl-modal-hdr-sub">${esc(teamName)}${piLabel ? ` · ${esc(piLabel)}` : ''}${meta.piSprints?.length ? ` · ${meta.piSprints.length} sprint${meta.piSprints.length>1?'s':''}` : ''}</div>
                    </div>
                </div>
                <button class="btn-icon modal-close htl-modal-close" aria-label="Fermer">
                    <svg class="icon"><use href="#i-x"/></svg>
                </button>
            </div>
            <div class="modal-body htl-modal-body">
                <div class="htl-section-lbl">Sprints du PI</div>
                <div class="htl-sprint-table-wrap">
                    <table class="htl-sprint-table">
                        <thead>
                        <tr>
                            <th rowspan="2">Sprint</th>
                            <th rowspan="2">Début</th>
                            <th rowspan="2">État</th>
                            <th rowspan="2" title="🎭 Mood — humeur ressentie par l'équipe sur le sprint, moyenne des votes. Cliquer une cellule pour voter">🎭 Mood</th>
                            <th rowspan="2" title="✊ Fist of Five — confiance de l'équipe dans l'atteinte des objectifs du PI, moyenne des votes. Cliquer une cellule pour voter">✊ Confiance</th>
                            <th rowspan="2" class="htl-th-num htl-grp-start" title="Charge prévue — capacité en SP validée par l'équipe au PI Planning (éditable)">Charge prévue ✏️</th>
                            <th class="htl-grp htl-grp--velo" colspan="4">⚡ Vélocité</th>
                            <th class="htl-grp htl-grp--buf" colspan="4">🛡 Buffer</th>
                        </tr>
                        <tr>
                            <th class="htl-th-num htl-sub htl-grp-start" title="Nombre de tickets dans le sprint à son lancement (ajouts en cours exclus)">nb début</th>
                            <th class="htl-th-num htl-sub htl-cur-col" title="Nombre de tickets actuellement dans le sprint (ajouts compris, reports et retraits exclus)">nb actuel</th>
                            <th class="htl-th-num htl-sub" title="Vélocité planifiée au lancement (estimation JIRA)">planifié</th>
                            <th class="htl-th-num htl-sub htl-velo-col" title="Vélocité réalisée (Done SP)">réalisée</th>
                            <th class="htl-th-num htl-sub htl-grp-start" title="Nombre de tickets Buffer dans le sprint à son lancement">nb début</th>
                            <th class="htl-th-num htl-sub htl-cur-col" title="Nombre de tickets Buffer actuellement dans le sprint">nb actuel</th>
                            <th class="htl-th-num htl-sub" title="Vélocité Buffer planifiée">planifié</th>
                            <th class="htl-th-num htl-sub htl-buf-col" title="Points Buffer consommés">réalisée</th>
                        </tr></thead>
                        <tbody>${sprintRows || '<tr><td colspan="14" class="htl-muted text-center" style="padding:12px">Aucun sprint trouvé pour ce PI</td></tr>'}</tbody>
                        ${sprintRows ? `<tfoot><tr class="htl-sprint-total${voteRowCls('mood', teamName, _piKeys)}">
                            <td colspan="3" class="htl-total-lbl">Total PI · ${(meta.piSprints || []).length} sprint${(meta.piSprints || []).length > 1 ? 's' : ''}</td>
                            <td class="htl-spr-vote htl-total-vote" id="htl-tot-mood">${voteTotalHtml('mood', teamName, _piKeys)}</td>
                            <td class="htl-spr-vote htl-total-vote" id="htl-tot-fist">${voteTotalHtml('fist', teamName, _piKeys)}</td>
                            <td class="htl-spr-num htl-grp-start htl-total-val" id="htl-tot-charge" title="Somme des charges prévues saisies">${_totOf('charge')}</td>
                            <td class="htl-spr-num htl-grp-start htl-total-val" title="Total des tickets engagés au lancement">${_totOf('planTk')}</td>
                            <td class="htl-spr-num htl-cur-col htl-total-val" title="${esc(_totTip('curTk', 'planTk', 'current', 'Tickets'))}">${_totOf('curTk')}${_totNet('curTk', 'planTk', 'current')}</td>
                            <td class="htl-spr-num htl-total-val" title="Total de la vélocité planifiée">${_totOf('planPts')}</td>
                            <td class="htl-spr-num htl-velo-col htl-total-val" title="Total de la vélocité réalisée${_totNum('planPts') ? ` — ${Math.round(_totNum('vel') / _totNum('planPts') * 100)} % du planifié` : ''}">${_totOf('vel')}</td>
                            <td class="htl-spr-num htl-grp-start htl-total-val" title="Total des tickets Buffer engagés">${_totOf('bufTk')}</td>
                            <td class="htl-spr-num htl-cur-col htl-total-val" title="${esc(_totTip('bufCurTk', 'bufTk', 'bufcurrent', 'Tickets Buffer'))}">${_totOf('bufCurTk')}${_totNet('bufCurTk', 'bufTk', 'bufcurrent')}</td>
                            <td class="htl-spr-num htl-bufplan-col htl-total-val" title="Total du Buffer planifié">${_totOf('bufPts')}</td>
                            <td class="htl-spr-num htl-buf-col htl-total-val" title="Total du Buffer consommé${_totNum('bufPts') ? ` — ${Math.round(_totNum('buf') / _totNum('bufPts') * 100)} % du planifié` : ''}">${_totOf('buf')}</td>
                        </tr></tfoot>` : ''}
                    </table>
                </div>
                <div class="htl-section-lbl htl-tickets-hint">Détail des tickets — clique une cellule chiffrée (nb début · nb actuel · planifié · réalisée) ci-dessus</div>
                <div class="htl-tickets-section" id="htl-tickets-host">${_ticketsSection(activeSprintName, metric)}</div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // ── Hash routing : reflète l'ouverture dans l'URL (back-button + partage) ─
    // On empile une entrée d'historique avec le marqueur ~sprint=<metric>:<team>:<sprint>,
    // SEULEMENT pour une ouverture initiée par l'utilisateur (pushHistory=true, défaut).
    // Une réouverture déclenchée par reopenSprintModalFromHash (retour arrière depuis un ticket,
    // refresh, lien partagé) arrive déjà sur le hash voulu — le pousser à nouveau créerait des
    // entrées dupliquées que "Fermer"/Échap devraient retraverser une par une (footgun : la
    // modale semblait alors ne plus jamais se fermer après avoir ouvert puis fermé un ticket).
    if (pushHistory) {
        const _base = (location.hash || '#').replace(/~sprint=[^~]*/g, '') || '#';
        history.pushState({ healthSprint: true }, '',
            _base + '~sprint=' + encodeURIComponent(`${metric}:${teamName}:${activeSprintName}`));
    }

    // ── Charge prévue éditable (localStorage) ───────────────────────────────
    // Le total de la colonne est recalculé à chaque saisie : figé, il deviendrait
    // faux dès la première modification — un total faux est pire qu'aucun total.
    const _refreshChargeTotal = () => {
        const cell = overlay.querySelector('#htl-tot-charge');
        if (!cell) return;
        let sum = 0, n = 0;
        overlay.querySelectorAll('.htl-charge-input').forEach(i => {
            const v = String(i.value).trim();
            const x = Number(v);
            if (v !== '' && Number.isFinite(x)) { sum += x; n++; }
        });
        // Aucune charge saisie → « — », comme au premier rendu : un 0 laisserait
        // croire à une capacité nulle plutôt qu'à une absence de saisie.
        if (n) cell.textContent = String(sum);
        else cell.innerHTML = '<span class="htl-muted">—</span>';
    };
    overlay.querySelectorAll('.htl-charge-input').forEach(input => {
        input.addEventListener('change', () => {
            const v = input.value.trim();
            if (v === '' || isNaN(Number(v))) { _refreshChargeTotal(); return; }
            localStorage.setItem(input.dataset.chargeKey, v);
            // Ce n'est plus une suggestion : la valeur vient d'être décidée par l'équipe.
            input.classList.remove('htl-charge-input--suggested');
            _refreshChargeTotal();
        });
        // `input` couvre les flèches du champ nombre et le collage, que `change`
        // ne remonte qu'à la perte de focus.
        input.addEventListener('input', _refreshChargeTotal);
    });

    // ── Clic cellule Vélo/Buffer d'un sprint → met à jour la section tickets ──
    // Les sprints clos ne sont pas synchronisés localement → lazy-fetch depuis JIRA.
    overlay.addEventListener('click', async e => {
        const cell = e.target.closest('[data-sp-tickets]');
        if (!cell) return;
        const host = overlay.querySelector('#htl-tickets-host');
        if (!host) return;
        const sprintName = cell.dataset.spTickets;
        const metric     = cell.dataset.spMetric || 'velocity';
        overlay.querySelectorAll('.htl-cell-active').forEach(c => c.classList.remove('htl-cell-active'));
        cell.classList.add('htl-cell-active');

        // Met à jour le hash sans empiler d'entrée d'historique (remplace, ne pousse pas) —
        // sinon chaque clic dans la table interne casserait le bouton "retour" du navigateur.
        const _base = (location.hash || '#').replace(/~sprint=[^~]*/g, '') || '#';
        history.replaceState({ healthSprint: true }, '',
            _base + '~sprint=' + encodeURIComponent(`${metric}:${teamName}:${sprintName}`));

        // Tickets locaux dispo → affichage direct
        if (_ticketsFor(sprintName, metric).length) {
            host.innerHTML = _ticketsSection(sprintName, metric);
            host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Sinon : lazy-fetch depuis JIRA via le jiraId du sprint
        const sp = (meta.piSprints || []).find(s => s.name === sprintName);
        if (!sp?.jiraId) {
            host.innerHTML = _ticketsSection(sprintName, metric); // "Aucun ticket"
            host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        host.innerHTML = `<div class="htl-loading">⏳ Chargement des tickets du sprint depuis JIRA…</div>`;
        host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        try {
            const fetched = await _fetchSprintIssuesFromJira(sp.jiraId);
            const done = fetched.filter(t => t.status === 'done');
            meta.sprintTickets = meta.sprintTickets || {};
            meta.sprintTickets[sprintName] = {
                done,
                bufDone: done.filter(t => isBufferItem(t)),
                all: fetched,
                bufAll: fetched.filter(t => isBufferItem(t)),
                cur: fetched,
                bufCur: fetched.filter(t => isBufferItem(t)),
            };
            host.innerHTML = _ticketsSection(sprintName, metric);
        } catch (err) {
            // Message issu du code HTTP : un 401 est une panne d'authentification, pas une
            // absence de données — le dire évite de chercher au mauvais endroit.
            host.innerHTML = `<div class="htl-loading htl-muted">${esc(api.jiraErrorMessage(err, 'les tickets de ce sprint'))}</div>`;
        }
    });

    // ── Liens ticket → modal de détail (délégué : gère les lignes re-rendues) ─
    // Même pattern qu'alert_modal : on force le modal détail au-dessus via .above-demo.
    overlay.addEventListener('click', e => {
        const el = e.target.closest('[data-open-ticket]');
        if (!el) return;
        e.stopPropagation();
        const id = el.dataset.openTicket;
        if (!id) return;
        const mo = document.getElementById('modal-overlay');
        if (mo) mo.classList.add('above-demo');
        window.__squadBoard?.openTicketModal?.(id);
    });

    // ── Votes éditables (🎭 Mood / ✊ Confiance) : picker inline au clic ──────
    // Un seul câblage pour les deux colonnes : elles ne diffèrent que par leur échelle
    // et leur type backend, tous deux portés par health-votes.js.
    overlay.addEventListener('click', e => {
        const target = e.target.closest('[data-vote-editable]');
        if (!target) return;
        e.stopPropagation();
        // Ferme un picker déjà ouvert — y compris celui de l'autre colonne de vote
        overlay.querySelector('.htl-vote-picker')?.remove();
        const kind      = target.dataset.voteKind || 'mood';
        const sprintKey = target.dataset.sprintKey;
        const voteTeam  = target.dataset.team;
        const kindLbl   = VOTE_KINDS[kind].label.toLowerCase();
        const picker = document.createElement('div');
        picker.className = 'htl-vote-picker';
        picker.innerHTML = pickerHtml(kind);
        target.parentNode.appendChild(picker);
        picker.querySelectorAll('.htl-vote-btn').forEach(btn => {
            btn.addEventListener('click', async ev => {
                ev.stopPropagation();
                const val = parseInt(btn.dataset.val, 10);   // backend exige un entier
                picker.remove();
                const vote = { type: kind, team: voteTeam, piSprint: sprintKey, value: val };
                try {
                    // La réponse porte l'id généré côté serveur — on la préfère à l'objet
                    // local pour que le store reste alignable sur un re-fetch.
                    const saved = await api.createMood(vote);
                    // Maj du store global + de l'instantané qui alimente les cellules
                    const storeKey = VOTE_KINDS[kind].storeKey;
                    store.set(storeKey, (store.get(storeKey) || []).concat(saved || vote));
                    pushVote(kind, saved || vote);
                    // Remplace la cellule par sa version recalculée (moyenne + nb votes + tooltip)
                    const td = target.closest('.htl-spr-vote');
                    if (td) td.innerHTML = voteCellHtml(kind, voteTeam, sprintKey);
                    // …et le total du PI de CE vote, sinon il contredirait la ligne
                    // qu'on vient de modifier juste au-dessus.
                    const totCell = overlay.querySelector(`#htl-tot-${kind}`);
                    if (totCell) totCell.innerHTML = voteTotalHtml(kind, voteTeam, _piKeys);
                    // La teinte de la ligne de total reste celle du Mood : c'est le climat
                    // d'équipe qu'elle signale, pas la confiance dans le plan.
                    const row = overlay.querySelector('.htl-sprint-total');
                    if (row) row.className = 'htl-sprint-total' + voteRowCls('mood', voteTeam, _piKeys);
                    toast?.(`Vote ${kindLbl} enregistré`, 'success');
                } catch { toast?.(`Erreur lors du vote ${kindLbl}`, 'error'); }
            });
        });
        // Fermer le picker au clic ailleurs
        const onOut = ev => { if (!picker.contains(ev.target) && ev.target !== target) { picker.remove(); document.removeEventListener('click', onOut, true); } };
        setTimeout(() => document.addEventListener('click', onOut, true), 0);
    });
    // Fermeture initiée par l'utilisateur → history.back() : le popstate (géré par app.js)
    // re-route, retire le marqueur et ferme la modale. Le bouton « Précédent » fait pareil.
    const _userClose = () => {
        if (location.hash.includes('~sprint=')) history.back();
        else _closeSprintModal();
    };
    overlay.addEventListener('click', e => {
        if (e.target === overlay || e.target.closest('.modal-close')) _userClose();
    });
    document.addEventListener('keydown', function onK(ev) {
        if (ev.key === 'Escape' && document.getElementById('health-sprint-modal')) {
            _userClose();
            document.removeEventListener('keydown', onK);
        }
    });
}

// Retire la modale sprint du DOM (sans toucher à l'historique).
function _closeSprintModal() {
    const ov = document.getElementById('health-sprint-modal');
    if (!ov) return;
    ov.classList.remove('visible');
    ov.addEventListener('transitionend', () => ov.remove(), { once: true });
    setTimeout(() => ov.remove(), 300); // filet de sécurité si transitionend ne se déclenche pas
}
