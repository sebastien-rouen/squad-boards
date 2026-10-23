/**
 * 📝 Sprint Review « Confluence-ready » ouverte dans un nouvel onglet : réalisations, à reporter, votes, objectifs PI, lead / cycle time, copies et exports.
 *
 * Extrait de sprint_tickets_modal.js (3.254.0) — code déplacé à l'identique. Dépendances CIRCULAIRES vers sprint_tickets_modal.js
 * assumées : jamais utilisées au niveau racine du module (seulement dans des fonctions / écouteurs).
 */
import { store } from '../state.js';
import { esc, pct, sumBy, isInSprint, cycleDays, leadDays } from '../utils.js';
import { sprintReviewCss } from './sprint_review_css.js';
import { _fmtDate, _sprintStats, _typeIcon } from './sprint_tickets_modal.js';

// ── Section Lead Time / Cycle Time pour la Sprint Review ─────────────────────
// Reproduit le schéma explicatif de la tooltip d'aide (help_popover.lctDiagramSvg)
// en version autonome (couleurs inline, aucune dépendance CSS externe) ET l'annote
// avec les valeurs réelles du sprint. Basé sur les MÉDIANES : robustes aux tickets
// exceptionnellement anciens en backlog (un seul ticket resté 500 j fausserait la
// moyenne du Lead Time). Champs source : `t.leadTimeDays` / `t.cycleTimeDays`
// (mêmes que la card Lead/Cycle du Dashboard).
function _leadCycleSectionHtml(tickets, link = (k) => esc(k)) {
    const _median = (arr) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2 * 10) / 10;
    };
    const _fmtD = (v) => `${String(v).replace('.', ',')} j`;

    const doneCT = tickets.filter(t => t.status === 'done' && cycleDays(t) > 0);
    const ltVals = doneCT.map(t => leadDays(t) > 0 ? leadDays(t) : cycleDays(t));
    const n      = doneCT.length;
    const ctMed  = _median(doneCT.map(t => cycleDays(t)));
    const ltMed  = _median(ltVals);
    const waitMed = Math.max(0, Math.round((ltMed - ctMed) * 10) / 10);
    const flowEff = ltMed > 0 ? Math.round((ctMed / ltMed) * 100) : null;
    const flowCls = flowEff == null ? '' : flowEff >= 40 ? 'metric--ok' : flowEff < 25 ? 'metric--warn' : '';

    const cards = n === 0
        ? `<p class="empty">Aucune donnée de délai disponible pour ce sprint — le Lead/Cycle time est reconstruit depuis l'historique JIRA des tickets terminés.</p>`
        : `<div class="metrics">
        <div class="metric">
            <div class="lbl">Lead Time médian</div>
            <div class="val">${_fmtD(ltMed)}</div>
            <div class="sub">création → livraison</div>
        </div>
        <div class="metric metric--ok">
            <div class="lbl">Cycle Time médian</div>
            <div class="val">${_fmtD(ctMed)}</div>
            <div class="sub">démarrage → fin</div>
        </div>
        <div class="metric">
            <div class="lbl">Temps d'attente</div>
            <div class="val">${_fmtD(waitMed)}</div>
            <div class="sub">Lead − Cycle · file backlog</div>
        </div>
        ${flowEff != null ? `<div class="metric ${flowCls}">
            <div class="lbl">Flow efficiency</div>
            <div class="val">${flowEff}%</div>
            <div class="sub">part réellement travaillée</div>
        </div>` : ''}
    </div>`;

    // Schéma 4 étapes + accolades Lead / Change Lead / Cycle Time (cf tooltip d'aide),
    // annoté avec les médianes du sprint.
    const svg = `<div class="lct-schema"><svg class="lct-diagram" viewBox="0 0 720 220" role="img" aria-label="Schéma Lead time et Cycle time" width="100%">
        <text x="360" y="18" text-anchor="middle" fill="#0f172a" font-size="15" font-weight="700">Lead Time${n ? ` · ${_fmtD(ltMed)} médian` : ''}</text>
        <path d="M10 40 V32 H710 V40" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
        <text x="300" y="60" text-anchor="middle" fill="#ef4444" font-size="13" font-weight="700">First Commit</text>
        <text x="515" y="60" text-anchor="middle" fill="#475569" font-size="13" font-weight="600">Change Lead Time</text>
        <path d="M300 80 V72 H710 V80" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
        <rect x="10"  y="95" width="240" height="60" rx="6" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"/>
        <rect x="250" y="95" width="150" height="60" rx="6" fill="#dcfce7" stroke="#22c55e" stroke-width="1.5"/>
        <rect x="400" y="95" width="160" height="60" rx="6" fill="#ede9fe" stroke="#8b5cf6" stroke-width="1.5"/>
        <rect x="560" y="95" width="150" height="60" rx="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="130" y="121" text-anchor="middle" fill="#0f172a" font-size="14" font-weight="600">Backlog</text>
        <text x="130" y="141" text-anchor="middle" fill="#b45309" font-size="11.5">${n ? `≈ ${_fmtD(waitMed)} d'attente` : "file d'attente"}</text>
        <text x="325" y="129" text-anchor="middle" fill="#0f172a" font-size="14" font-weight="600">Développement</text>
        <text x="480" y="129" text-anchor="middle" fill="#0f172a" font-size="14" font-weight="600">Revue de code</text>
        <text x="635" y="129" text-anchor="middle" fill="#0f172a" font-size="14" font-weight="600">Déploiement</text>
        <line x1="300" y1="82" x2="300" y2="93" stroke="#ef4444" stroke-width="1.5"/>
        <path d="M300 96 l-4 -7 h8 z" fill="#ef4444"/>
        <path d="M250 165 V173 H710 V165" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
        <text x="480" y="197" text-anchor="middle" fill="#0f172a" font-size="15" font-weight="700">Cycle Time${n ? ` · ${_fmtD(ctMed)} médian` : ''}</text>
    </svg></div>`;

    // Barre par ticket réalisé : longueur = Lead Time (échelle = plus grand Lead du sprint),
    // remplissage vert = Cycle Time (travail effectif), reste ambre = attente en backlog.
    // Trié du Lead le plus long au plus court (met en tête les tickets qui ont le plus attendu).
    let perTicket = '';
    if (n > 0) {
        const rows = doneCT
            .map(t => {
                const lt = leadDays(t) > 0 ? leadDays(t) : cycleDays(t);
                const ct = Math.min(cycleDays(t), lt);   // garde-fou : cycle ≤ lead
                return { t, lt, ct, wait: Math.max(0, lt - ct) };
            })
            .sort((a, b) => b.lt - a.lt);
        // Échelle ROBUSTE = 3× le Lead médian : évite qu'un ticket resté des mois en backlog
        // n'écrase visuellement tous les autres. Les tickets qui dépassent l'échelle sont
        // marqués « ›› » et gardent leur valeur chiffrée exacte.
        const scaleMax = Math.max(1, ltMed > 0 ? ltMed * 3 : Math.max(...rows.map(r => r.lt)));
        const bars = rows.map(({ t, lt, ct, wait }) => {
            const over = lt > scaleMax;
            const cyclePct = Math.min((ct / scaleMax) * 100, 100);
            const waitPct  = Math.min((wait / scaleMax) * 100, 100 - cyclePct);
            const eff = lt > 0 ? Math.round((ct / lt) * 100) : 0;
            const title = `${esc(t.id)} — ${esc(t.title || '')} · Lead ${_fmtD(lt)} · Cycle ${_fmtD(ct)} · attente ${_fmtD(wait)} · flow ${eff}%`;
            return `<div class="lct-tk" title="${title}">
            <div class="lct-tk-meta">
                <span class="lct-tk-id">${link(t.id)}</span>
                <span class="lct-tk-title">${esc(t.title || '(sans titre)')}</span>
            </div>
            <div class="lct-tk-track">
                <div class="lct-tk-wait" style="width:${waitPct.toFixed(1)}%"></div>
                <div class="lct-tk-cycle" style="width:${Math.max(cyclePct, 1.5).toFixed(1)}%">${cyclePct >= 12 ? `${ct}` : ''}</div>
                ${over ? '<span class="lct-tk-over" title="Lead au-delà de l échelle de mesure">hors échelle ››</span>' : ''}
            </div>
            <span class="lct-tk-num${over ? ' lct-tk-num--over' : ''}">${lt}<small> / ${ct} j</small></span>
        </div>`;
        }).join('');
        perTicket = `
<h3 class="lct-h3">Par ticket réalisé <span class="lct-legend"><i class="lct-sw lct-sw--cycle"></i>Cycle (travail) <i class="lct-sw lct-sw--wait"></i>Attente backlog</span></h3>
<div class="lct-tickets">${bars}</div>`;
    }

    return `
<h2>⏱️ Lead Time &amp; Cycle Time${n ? `<span class="badge">${n} ticket${n > 1 ? 's' : ''} mesuré${n > 1 ? 's' : ''}</span>` : ''}</h2>
${cards}
${svg}
<p class="lct-note"><strong>Lead time</strong> = de la création du ticket à sa livraison, <em>temps d'attente en backlog compris</em>. <strong>Cycle time</strong> = du démarrage effectif du travail à la fin — ce que l'équipe maîtrise réellement. L'écart entre les deux = le temps passé en file d'attente avant priorisation ; le <strong>Flow efficiency</strong> (Cycle ÷ Lead) mesure la part du délai réellement consacrée au travail (repère : ~15 % courant, 40 %+ excellent).${n ? ` Valeurs <strong>médianes</strong> sur les ${n} ticket${n > 1 ? 's' : ''} terminé${n > 1 ? 's' : ''} du sprint (robustes aux tickets exceptionnellement anciens).` : ''}</p>
${perTicket}`;
}

// ── Sprint Review template (Confluence-ready) — ouvre dans un nouvel onglet ──
// Format orienté COMMUNICATION : objectif, réalisations, métriques, points
// d'attention pour la rétro, à reporter au prochain sprint, next steps (vide à
// remplir en live pendant la review).
export function _buildSprintReviewHtml(sprint, tickets) {
    const stateLabel = sprint.isCurrent ? 'EN COURS' : 'CLÔTURÉ';
    const stateColor = sprint.isCurrent ? '#10b981' : '#64748b';
    const startLabel = sprint.startDate ? _fmtDate(sprint.startDate) : '';
    const endLabel = sprint.endDate ? _fmtDate(sprint.endDate) : '';
    const jiraBase = store.get('jiraUrl');
    const link = (key) => !jiraBase || !key
        ? `<strong>${esc(key)}</strong>`
        : `<a href="${jiraBase.replace(/\/$/, '')}/browse/${esc(key)}" target="_blank">${esc(key)}</a>`;

    const {
        total, ptsTotal, ptsDone, doneCount, veloPts, engagePct, engageDistinct,
        estimated, bufferTickets, bufferRealised, bufferRealShare,
    } = _sprintStats(sprint, tickets);

    // ── Résolution feature parente (chaîne ticket → epic → feature) ─────────
    const allEpics    = store.get('epics') || [];
    const allFeatures = store.get('features') || [];
    const epicById    = new Map(allEpics.map(e => [e.id, e]));
    const featureById = new Map(allFeatures.map(f => [f.id, f]));
    const _parentFeature = (t) => {
        if (!t.epic) return null;
        const ep = epicById.get(t.epic);
        if (!ep) return null;
        const f = ep.feature ? featureById.get(ep.feature) : (ep.type === 'feature' ? ep : null);
        if (f) return { id: f.id, title: f.title || f.id };
        return { id: ep.id, title: ep.title || ep.id };
    };

    // ── Tickets done : tri par feature puis regroupement Tickets/Buffer/Retro
    const doneTickets = tickets.filter(t => t.status === 'done')
        .sort((a, b) => {
            const fa = _parentFeature(a)?.title || '';
            const fb = _parentFeature(b)?.title || '';
            if (!fa && fb) return 1;
            if (fa && !fb) return -1;
            const cmp = fa.localeCompare(fb, 'fr', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            return (b.points || 0) - (a.points || 0);
        });
    const _has = (t, rx) => (t.labels || []).some(l => rx.test(l));
    const doneActionRetro = doneTickets.filter(t => _has(t, /^ActionRetro$/i));
    const doneBuffer      = doneTickets.filter(t => !_has(t, /^ActionRetro$/i) && _has(t, /^Buffer$/i));
    const doneNormal      = doneTickets.filter(t => !_has(t, /^ActionRetro$/i) && !_has(t, /^Buffer$/i));

    // Toutes les ActionRetro du sprint (peu importe le statut) — pour faire le tour en review
    const allActionRetro = tickets.filter(t => _has(t, /^ActionRetro$/i))
        .sort((a, b) => {
            // done en dernier (on parle d'abord des en cours / bloquées / à reporter)
            const sa = a.status === 'done' ? 1 : 0;
            const sb = b.status === 'done' ? 1 : 0;
            if (sa !== sb) return sa - sb;
            return (a.id || '').localeCompare(b.id || '');
        });

    // Tickets non done = à reporter
    // Tri "À reporter" : statut prioritaire (blocked → inprog → review/test → todo) puis
    // par feature parente (alpha) puis par points décroissants.
    const _statusRank = (s) => ({ blocked: 0, inprog: 1, review: 2, test: 3, todo: 4 })[s] ?? 5;
    const notDone = tickets.filter(t => t.status !== 'done').sort((a, b) => {
        const rs = _statusRank(a.status) - _statusRank(b.status);
        if (rs !== 0) return rs;
        const fa = _parentFeature(a)?.title || '';
        const fb = _parentFeature(b)?.title || '';
        if (!fa && fb) return 1;
        if (fa && !fb) return -1;
        const cmp = fa.localeCompare(fb, 'fr', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return (b.points || 0) - (a.points || 0);
    });
    const blocked = notDone.filter(t => t.status === 'blocked');
    const notDonePts = sumBy(notDone, t => t.points);

    // Périmètre élargi : tickets ajoutés après début sprint
    const sprintStart = sprint.startDate ? new Date(String(sprint.startDate).slice(0, 10)).getTime() : 0;
    const scopeCreep = tickets.filter(t => t.createdAt && new Date(t.createdAt).getTime() > sprintStart);

    // ── Mood + Fist of Five (filtrés par sprint + équipe) ────────────────────
    // piSprint en base peut être : "29.3", "Fuego - Ite 29.3", "PI#29"… match tolérant.
    const _sprintLabel = (String(sprint.name || '').match(/(\d+\.\d+)/) || [])[1] || '';
    const _matchVoteSprint = (vps) => {
        if (!vps) return false;
        if (vps === sprint.name) return true;
        if (_sprintLabel && (vps === _sprintLabel || vps.includes(_sprintLabel))) return true;
        return sprint.name && (vps.includes(sprint.name) || sprint.name.includes(vps));
    };
    const _voteFilter = (v) => (!sprint.team || sprint.team === 'all' || v.team === sprint.team)
                            && _matchVoteSprint(v.piSprint);
    const moodVotes = (store.get('moodVotes') || []).filter(_voteFilter);
    const fistVotes = (store.get('fistVotes') || []).filter(_voteFilter);
    console.info(`[SprintReview] mood=${moodVotes.length} fist=${fistVotes.length} sprint="${sprint.name}" label="${_sprintLabel}" team="${sprint.team || 'all'}"`);
    const _voteStats = (votes) => {
        if (!votes.length) return null;
        const dist = [0, 0, 0, 0, 0, 0]; // index 1..5
        let sum = 0;
        for (const v of votes) {
            const n = parseInt(v.value) || 0;
            if (n >= 1 && n <= 5) { dist[n]++; sum += n; }
        }
        return { avg: Math.round((sum / votes.length) * 10) / 10, count: votes.length, dist };
    };
    const moodStats = _voteStats(moodVotes);
    const fistStats = _voteStats(fistVotes);
    const _voteFace = (n) => ({ 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }[Math.round(n)] || '❓');
    const _voteColor = (n) => n >= 4 ? '#10b981' : n >= 3 ? '#f59e0b' : '#ef4444';

    // ── PI Objectives (filtré par équipe si applicable) ─────────────────────
    const piInfo = store.get('piInfo');
    const piObjs = (piInfo?.objectives || [])
        .filter(o => (o.text || '').trim())
        .filter(o => !sprint.team || sprint.team === 'all' || !o.team || o.team === sprint.team);
    const _bv = o => Math.max(0, Math.min(10, parseInt(o.bv) || 0));
    const piCommit  = piObjs.filter(o => o.committed);
    const piStretch = piObjs.filter(o => !o.committed);
    const piDoneCt  = piObjs.filter(o => o.status === 'done').length;
    const piCommitTotal = sumBy(piCommit, _bv);
    const piCommitDone  = sumBy(piCommit.filter(o => o.status === 'done'), _bv);
    const piStretchDone = sumBy(piStretch.filter(o => o.status === 'done'), _bv);
    const piScore = piCommitTotal > 0 ? Math.round(((piCommitDone + piStretchDone) / piCommitTotal) * 100) : null;

    // ── Sparkline PI : sprints du PI courant + vélocité (live pour actifs) ──
    const _extractPi  = (name) => { const m = String(name || '').match(/(\d+)\.\d+/) || String(name || '').match(/PI\s*#?\s*(\d+)/i); return m ? parseInt(m[1], 10) : 0; };
    const _extractIdx = (name) => { const m = String(name || '').match(/\d+\.(\d+)/); return m ? parseInt(m[1], 10) : 0; };
    const refPi = _extractPi(sprint.name);
    const teamSprints = Array.isArray(store.get('sprintInfo')?.teamSprints) ? store.get('sprintInfo').teamSprints : [];
    let piSprints = refPi ? teamSprints.filter(s => _extractPi(s.name) === refPi) : [];
    if (piSprints.length) {
        if (sprint.team && sprint.team !== 'all') {
            piSprints = piSprints.filter(s => s.team === sprint.team);
        } else {
            const seen = new Map();
            for (const s of piSprints) {
                const k = (s.name || '').toLowerCase();
                if (!seen.has(k) || s.state === 'active') seen.set(k, s);
            }
            piSprints = [...seen.values()];
        }
        piSprints.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
        const allTks = store.get('tickets') || [];
        piSprints = piSprints.map(s => {
            if (s.velocity && s.velocity > 0) return s;
            const live = allTks
                // Vélocité = RÉALISÉ : seuls les tickets restés dans le sprint (idem ci-dessus).
                .filter(t => isInSprint(t, s.name, null)
                          && t.status === 'done'
                          && (!s.team || t.team === s.team))
                .reduce((sum, t) => sum + (t.points || 0), 0);
            return live > 0 ? { ...s, velocity: live, _live: true } : s;
        });
    }
    const sprintsPerPi = piInfo?.sprintsPerPI || piSprints.length;
    const breathIdx = Math.max(sprintsPerPi, ...piSprints.map(s => _extractIdx(s.name)));
    const closedSprints = piSprints.filter(s => s.state === 'closed');
    const closedVals = closedSprints.map(s => s.velocity || 0);
    const piTotal = closedVals.reduce((a, b) => a + b, 0);
    const piAvg   = closedVals.length ? Math.round(piTotal / closedVals.length) : 0;
    const piBest  = closedVals.length ? Math.max(...closedVals) : 0;
    const piTarget = piInfo?.velocityTarget || null;
    const piTargetPct = piTarget && closedVals.length ? Math.round((piAvg / piTarget) * 100) : null;

    // ── Helper rendu d'une ligne ticket (avec feature parente) ──────────────
    const renderRow = (t) => {
        const tIcon = _typeIcon(t.type, t.labels);
        const pts = t.points ? ` <span class="pill pill-pts">${t.points} pts</span>` : '';
        const pf = _parentFeature(t);
        const parentChip = pf
            ? ` <span class="parent-chip" title="Feature parente ${esc(pf.id)}">🧭 ${esc(pf.title)}</span>`
            : '';
        return `<li>${tIcon} ${link(t.id)} — ${esc(t.title || '(sans titre)')}${pts}${parentChip}</li>`;
    };

    // ── Rendu d'un groupe de réalisations (Tickets / Buffer / Actions rétro)
    const renderWinsGroup = (label, icon, list, color) => list.length === 0 ? '' : `
        <div class="wins-group" style="border-left-color:${color}">
            <h3 class="wins-group-title">
                <span class="wins-group-icon">${icon}</span>
                <span>${label}</span>
                <span class="wins-group-count">${list.length}</span>
                ${list.some(t => t.points) ? `<span class="wins-group-pts">${sumBy(list, t => t.points)} pts</span>` : ''}
            </h3>
            <ul class="cr-tickets">${list.map(renderRow).join('')}</ul>
        </div>`;

    // ── Génération du texte Slack-friendly (PUR TEXTE, sans mrkdwn) ──────────
    // Slack n'interprète PAS *gras* / _italique_ / `code` au paste. Le format de
    // lien `<URL|texte>` n'est PAS non plus interprété au paste dans le composeur
    // Slack : il s'affiche en littéral avec le `|` (ex : `…/browse/GDEM-4212|GDEM-4212`).
    // → on émet l'URL nue, que Slack/Teams/Gmail auto-linkifient (cf. CHANGELOG 3.6.31).
    const jiraBaseClean = (jiraBase || '').replace(/\/$/, '');
    const _slackKey = (id) => jiraBaseClean && id ? `${jiraBaseClean}/browse/${id}` : id || '';
    const _slackList = (arr, max = 5) => {
        const top = arr.slice(0, max).map(t => `   • ${_typeIcon(t.type, t.labels)} ${_slackKey(t.id)} - ${t.title || '(sans titre)'}${t.points ? ` (${t.points} pts)` : ''}`).join('\n');
        const rest = arr.length > max ? `\n   ...et ${arr.length - max} autre${arr.length - max > 1 ? 's' : ''}` : '';
        return top + rest;
    };
    const slackParts = [];
    slackParts.push(`🏆 Sprint Review - ${sprint.name}${sprint.team ? `   👥 ${sprint.team}` : ''}`);
    if (startLabel || endLabel) slackParts.push(`📅 ${startLabel} -> ${endLabel}`);
    if (sprint.goal) {
        const goalLines = String(sprint.goal).split('\n').map(l => `   ${l}`).join('\n');
        slackParts.push(`\n🎯 Objectif du sprint\n${goalLines}`);
    }
    slackParts.push(
        `\n📊 Métriques\n` +
        `   • Vélocité : ${veloPts} pts${engageDistinct ? ` / ${estimated} engagés (${engagePct}% réalisé)` : ''}\n` +
        `   • Tickets : ${doneCount}/${total || '-'} (${pct(doneCount, total)}% terminés)` +
        `   ·   Story Points : ${ptsDone}/${ptsTotal || '-'}` +
        (bufferRealised > 0 ? `\n   • 🛡️ Buffer : ${bufferRealised} pts${bufferRealShare ? ` (${bufferRealShare}% de l'engagé)` : ''}` : '')
    );
    if (piObjs.length) {
        slackParts.push(
            `\n🎯 PI Objectives - ${piDoneCt}/${piObjs.length} livré${piDoneCt > 1 ? 's' : ''}` +
            (piCommitTotal > 0 ? ` · BV ${piCommitDone + piStretchDone}/${piCommitTotal}` : '') +
            (piScore > 0 ? ` · Predictability ${piScore}%` : '')
        );
    }
    if (piSprints.length) {
        slackParts.push(
            `\n📈 Vélocité PI ${refPi} - moy. ${piAvg} pts` +
            (piBest ? ` · record ⭐${piBest}` : '') +
            (piTargetPct != null ? ` · vs cible 🎯 ${piTargetPct}%` : '')
        );
    }
    // Réalisations fusionnées : un seul bloc tous types confondus, badges récap Buffer/Retro.
    const realisationsHdr = `\n🏆 Réalisations (${doneTickets.length} tickets · ${ptsDone} pts)`
        + (bufferTickets.length > 0 ? ` · 🛡️ Buffer ${doneBuffer.length}/${bufferTickets.length}` : '')
        + (doneActionRetro.length > 0 ? ` · 🔁 Retro ${doneActionRetro.length}` : '');
    if (doneTickets.length) {
        slackParts.push(`${realisationsHdr}\n${_slackList(doneTickets, 15)}`);
    } else {
        slackParts.push(`${realisationsHdr}\n   (aucun ticket terminé)`);
    }
    // Climat équipe (mood + fist)
    if (moodStats || fistStats) {
        const climLines = ['\n🎭 Climat équipe'];
        if (moodStats) climLines.push(`   • Mood : ${_voteFace(moodStats.avg)} ${moodStats.avg}/5 (${moodStats.count} vote${moodStats.count > 1 ? 's' : ''})`);
        if (fistStats) climLines.push(`   • Fist of Five (confiance PI) : ${fistStats.avg}/5 (${fistStats.count} vote${fistStats.count > 1 ? 's' : ''})`);
        slackParts.push(climLines.join('\n'));
    }
    if (notDone.length) {
        // notDone est déjà trié blocked → inprog → review → test → todo : les bloqués remontent en tête.
        const reportHdr = `\n🔄 À reporter - ${notDone.length} ticket${notDone.length > 1 ? 's' : ''}`
            + (notDonePts ? ` · ${notDonePts} pts` : '')
            + (blocked.length ? ` (dont ${blocked.length} bloqué${blocked.length > 1 ? 's' : ''} 🚨)` : '');
        slackParts.push(`${reportHdr}\n${_slackList(notDone, 10)}`);
    }
    if (allActionRetro.length) {
        const openRetro = allActionRetro.filter(t => t.status !== 'done');
        if (openRetro.length) slackParts.push(`\n🔁 Actions rétro à passer en revue (${openRetro.length} non clôturée${openRetro.length > 1 ? 's' : ''})\n${_slackList(openRetro, 10)}`);
    }
    if (blocked.length > 0 || scopeCreep.length >= 2) {
        const pts = [];
        if (blocked.length > 0) pts.push(`${blocked.length} blocker${blocked.length > 1 ? 's' : ''} non résolu${blocked.length > 1 ? 's' : ''}`);
        if (scopeCreep.length >= 2) pts.push(`périmètre élargi (${scopeCreep.length} tickets ajoutés)`);
        slackParts.push(`\n⚠️ À discuter en rétro : ${pts.join(' · ')}`);
    } else {
        slackParts.push(`\n👍 Sprint propre - pas de blocker non résolu`);
    }
    const slackText = slackParts.join('\n');
    // JSON.stringify → string JS échappée safe à injecter dans le <script>
    const slackTextJsLit = JSON.stringify(slackText);

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Sprint Review — ${esc(sprint.name)}</title>
<style>
${sprintReviewCss(stateColor)}
</style>
</head>
<body>

<div class="cr-toolbar">
    <button id="copy-slack-btn" class="slack-btn" title="Copier un résumé aéré dans le presse-papier (Slack-friendly)">
        <span class="slack-btn-icon">💬</span>
        <span class="slack-btn-label">Copier pour Slack</span>
    </button>
    <button id="png-btn" class="tb-btn" title="Télécharger en image PNG">📷 PNG</button>
    <button id="print-btn" class="tb-btn" title="Imprimer / PDF (Ctrl+P)">🖨 PDF</button>
    ${piInfo?.number ? (() => {
        const nextPi = piInfo.number + 1;
        // JQL : sprint IN ("PI#30") — encode pour URL (espaces, parenthèses, guillemets)
        const jql = `sprint IN ("PI#${nextPi}")`;
        const url = jiraBaseClean
            ? `${jiraBaseClean}/issues/?jql=${encodeURIComponent(jql)}`
            : '#';
        return `<a class="tb-btn" href="${url}" target="_blank" title="Préparer le PI Planning suivant&#10;JQL : ${jql}">🚀 PI ${nextPi}</a>`;
    })() : ''}
</div>

<header class="cr-header">
    <h1 class="cr-title">📋 Sprint Review<span class="cr-state">${stateLabel}</span></h1>
    <div class="cr-meta">
        <strong>${esc(sprint.name)}</strong>
        ${sprint.team ? ` · 👥 <strong>${esc(sprint.team)}</strong>` : ''}
        ${startLabel || endLabel ? ` · 📅 ${esc(startLabel)} → ${esc(endLabel)}` : ''}
    </div>
</header>

<script>
(function(){
    const SLACK_TEXT = ${slackTextJsLit};
    const SPRINT_NAME = ${JSON.stringify(sprint.name || 'sprint')};
    // ── Copier Slack ──
    const btn = document.getElementById('copy-slack-btn');
    const lbl = btn?.querySelector('.slack-btn-label');
    const icn = btn?.querySelector('.slack-btn-icon');
    btn?.addEventListener('click', async () => {
        try {
            // Reprend les "Décisions & prochaines étapes" saisies dans la zone éditable
            // (générée vide côté serveur → on la relit au moment du clic).
            let text = SLACK_TEXT;
            const decEl = document.getElementById('cr-decisions');
            const decTxt = decEl ? (decEl.innerText || '').replace(/ /g, ' ').trim() : '';
            if (decTxt) {
                // Backslashes doublés : ce bloc est injecté dans le <script> via le template
                // literal externe ; une séquence d'échappement simple deviendrait un vrai saut
                // de ligne dans le script généré (chaîne multi-lignes = SyntaxError, bouton inerte).
                const decBody = decTxt.split('\\n').map(l => l.trim() ? '   ' + l.trim() : '').join('\\n');
                text += '\\n\\n🚀 Décisions & prochaines étapes\\n' + decBody;
            }
            await navigator.clipboard.writeText(text);
            btn.classList.add('is-ok');
            if (lbl) lbl.textContent = 'Copié !';
            if (icn) icn.textContent = '✓';
            setTimeout(() => { btn.classList.remove('is-ok'); if (lbl) lbl.textContent = 'Copier pour Slack'; if (icn) icn.textContent = '💬'; }, 2400);
        } catch (e) {
            btn.classList.add('is-err');
            if (lbl) lbl.textContent = 'Copie impossible';
            setTimeout(() => { btn.classList.remove('is-err'); if (lbl) lbl.textContent = 'Copier pour Slack'; }, 2400);
        }
    });
    // ── Décisions éditable + persistence localStorage ──
    const dec = document.getElementById('cr-decisions');
    if (dec) {
        const key = dec.dataset.storageKey;
        try { const saved = localStorage.getItem(key); if (saved) dec.innerHTML = saved; } catch {}
        let saveT = null;
        dec.addEventListener('input', () => {
            clearTimeout(saveT);
            saveT = setTimeout(() => { try { localStorage.setItem(key, dec.innerHTML); } catch {} }, 400);
        });
    }
    // ── PDF (impression / Save as PDF) ──
    document.getElementById('print-btn')?.addEventListener('click', () => window.print());
    // ── PNG via html2canvas (chargé à la demande depuis CDN) ──
    document.getElementById('png-btn')?.addEventListener('click', async () => {
        const pngBtn = document.getElementById('png-btn');
        pngBtn.textContent = '⏳ Génération…';
        try {
            if (!window.html2canvas) {
                await new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                    s.onload = res; s.onerror = rej;
                    document.head.appendChild(s);
                });
            }
            const canvas = await window.html2canvas(document.body, { backgroundColor: '#fff', scale: 2, useCORS: true });
            const link = document.createElement('a');
            link.download = 'sprint-review-' + SPRINT_NAME.replace(/[^a-z0-9]+/gi, '-') + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            pngBtn.textContent = '✓ PNG';
            setTimeout(() => { pngBtn.textContent = '📷 PNG'; }, 1800);
        } catch (e) {
            console.error(e);
            pngBtn.textContent = '❌ Erreur';
            setTimeout(() => { pngBtn.textContent = '📷 PNG'; }, 2400);
        }
    });
})();
</script>

<h2>🎯 Objectif du sprint</h2>
${sprint.goal
    ? `<div class="goal">${esc(sprint.goal)}</div>`
    : '<div class="goal goal--empty">Aucun objectif explicite n\'a été défini pour ce sprint.</div>'}

<h2>📊 Métriques</h2>
<div class="metrics">
    <div class="metric metric--ok">
        <div class="lbl">Vélocité</div>
        <div class="val">${veloPts}<small style="font-size:11px"> pts</small></div>
        <div class="sub">${engageDistinct ? `${engagePct}% de l'engagé` : 'livré'}</div>
    </div>
    <div class="metric ${doneCount === total ? 'metric--ok' : ''}">
        <div class="lbl">Tickets</div>
        <div class="val">${doneCount}<small style="font-size:14px">/${total || '—'}</small></div>
        <div class="sub">${pct(doneCount, total)}% terminés</div>
    </div>
    <div class="metric">
        <div class="lbl">Story Points</div>
        <div class="val">${ptsDone}<small style="font-size:14px">/${ptsTotal || '—'}</small></div>
        <div class="sub">${pct(ptsDone, ptsTotal)}% livrés</div>
    </div>
    ${engageDistinct ? `
    <div class="metric">
        <div class="lbl">Engagé (estimé)</div>
        <div class="val">${estimated}<small style="font-size:11px"> pts</small></div>
        <div class="sub">${engagePct}% réalisé</div>
    </div>` : ''}
    <div class="metric">
        <div class="lbl">🛡️ Buffer</div>
        <div class="val">${bufferRealised}<small style="font-size:11px"> pts</small></div>
        <div class="sub">${bufferRealised === 0 ? 'aucun buffer' : `${bufferTickets.length ? `${bufferTickets.length} ticket${bufferTickets.length > 1 ? 's' : ''}` : 'snapshot JIRA'}`}</div>
    </div>
</div>

${_leadCycleSectionHtml(tickets, link)}

${piObjs.length ? `
<h2>🎯 PI Objectives ${piInfo?.number ? `<span class="badge">PI ${piInfo.number}</span>` : ''}
    <span class="pi-summary">✓ ${piDoneCt}/${piObjs.length}${piCommitTotal > 0 ? ` · BV livrée ${piCommitDone + piStretchDone}/${piCommitTotal}` : ''}${piScore > 0 ? ` · Predictability ${piScore}%` : ''}</span>
</h2>
<div class="pi-grid">
    ${piObjs.map(o => {
        const stCls = o.status === 'done' ? 'is-done' : o.status === 'blocked' ? 'is-blocked' : o.status === 'inprog' ? 'is-inprog' : 'is-todo';
        const stIcon = o.status === 'done' ? '✓' : o.status === 'blocked' ? '✗' : o.status === 'inprog' ? '●' : '○';
        return `<div class="pi-obj ${stCls}${o.committed ? ' is-commit' : ' is-stretch'}">
            <span class="pi-obj-state" aria-hidden="true">${stIcon}</span>
            <span class="pi-obj-text">${esc(o.text || '')}</span>
            <span class="pi-obj-bv" title="Business Value">${_bv(o)}</span>
        </div>`;
    }).join('')}
</div>` : ''}

${piSprints.length ? (() => {
    const sparkMax = Math.max(...piSprints.map(s => s.velocity || 0), piTarget || 0, 1);
    const bestSprint = closedSprints.length ? closedSprints.reduce((a, b) => (a.velocity || 0) > (b.velocity || 0) ? a : b) : null;
    const bars = piSprints.map(s => {
        const v = s.velocity || 0;
        const h = Math.max(12, Math.round((v / sparkMax) * 100));
        const isCur = s.state === 'active' || s.name === sprint.name;
        const isClosed = s.state === 'closed';
        const isBreath = _extractIdx(s.name) === breathIdx;
        const isBest = bestSprint && s.name === bestSprint.name && !isCur && !isBreath;
        const cls = isBreath ? 'vel-bar--breath' : isCur ? 'vel-bar--current' : isBest ? 'vel-bar--best' : isClosed ? 'vel-bar--closed' : 'vel-bar--future';
        const stateLbl = isBreath ? '🍃 Sprint de respiration (IP)' : isCur ? 'en cours' : isClosed ? 'clôturé' : 'à venir';
        const liveSuffix = s._live ? ' (calculé live)' : '';
        const goalLine = s.goal ? '\n🎯 ' + s.goal : '';
        const tt = `${s.name} · ${v} pts${liveSuffix} · ${stateLbl}${goalLine}`;
        const ptsInside = h >= 22 && v > 0;
        const breathBadge = isBreath ? '<span class="vel-breath-badge">🍃</span>' : '';
        const name = (s.name || '').match(/\d+\.\d+/)?.[0] || s.name || '';
        return `<div class="vel-bar-wrap" title="${esc(tt)}">
            ${breathBadge}
            <div class="vel-bar ${cls}" style="height:${h}%">${ptsInside ? `<span class="vel-bar-pts">${v}</span>` : ''}</div>
            <div class="vel-bar-name">${esc(name)}</div>
        </div>`;
    }).join('');
    return `
<h2>📈 Vélocité PI ${refPi || ''}</h2>
<div class="vel-card">
    <div class="vel-hdr">
        <div class="vel-title">Vélocité PI ${refPi} <small>${closedSprints.length} sprint${closedSprints.length > 1 ? 's' : ''} clos · ${piTotal} pts livrés</small></div>
        <div class="vel-kpis">
            <div class="vel-kpi vel-kpi--good" title="Moyenne des sprints clôturés"><span class="vel-kpi-val">${piAvg}</span><span class="vel-kpi-lbl">moy. clos</span></div>
            ${piBest ? `<div class="vel-kpi" title="Meilleur sprint clos"><span class="vel-kpi-val">⭐ ${piBest}</span><span class="vel-kpi-lbl">record</span></div>` : ''}
            ${piTargetPct != null ? `<div class="vel-kpi ${piTargetPct >= 100 ? 'vel-kpi--good' : 'vel-kpi--warn'}" title="Moy. clos vs cible : ${piAvg}/${piTarget}"><span class="vel-kpi-val">🎯 ${piTargetPct}%</span><span class="vel-kpi-lbl">vs cible</span></div>` : ''}
        </div>
    </div>
    <div class="vel-spark">${bars}</div>
    <div class="vel-legend">
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#047857"></span>Clôturé</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#1d4ed8"></span>En cours</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#b45309"></span>Record</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#4ade80;border:1px solid #34d399"></span>🍃 Respiration (IP)</span>
        <span class="vel-legend-item"><span class="vel-legend-swatch" style="background:#f1f5f9;border:1px dashed #cbd5e1"></span>À venir</span>
    </div>
</div>` ;
})() : ''}

<h2>🏆 Réalisations <span class="badge">${doneTickets.length} ticket${doneTickets.length > 1 ? 's' : ''} · ${ptsDone} pts</span>${bufferTickets.length > 0 ? ` <span class="badge">🛡️ Buffer : ${doneBuffer.length}/${bufferTickets.length} · ${sumBy(doneBuffer, t => t.points)} pts</span>` : ''}${doneActionRetro.length > 0 ? ` <span class="badge">🔁 Retro : ${doneActionRetro.length}</span>` : ''}</h2>
${doneTickets.length === 0
    ? '<p class="empty">Aucun ticket terminé sur ce sprint.</p>'
    : `<ul class="cr-tickets cr-tickets-merged">${doneTickets.map(renderRow).join('')}</ul>`}

${(moodStats || fistStats) ? `
<h2>🎭 Climat de l'équipe</h2>
<div class="vote-grid">
    ${moodStats ? `
    <div class="vote-card">
        <div class="vote-card-head">
            <span class="vote-card-icon">🎭</span>
            <span class="vote-card-title">Mood Meter</span>
            <span class="vote-card-count">${moodStats.count} vote${moodStats.count > 1 ? 's' : ''}</span>
        </div>
        <div class="vote-card-score" style="color:${_voteColor(moodStats.avg)}">
            ${_voteFace(moodStats.avg)} <strong>${moodStats.avg}</strong><small>/5</small>
        </div>
        <div class="vote-dist">
            ${[1, 2, 3, 4, 5].map(n => {
                const c = moodStats.dist[n];
                const w = moodStats.count ? Math.round((c / moodStats.count) * 100) : 0;
                return `<div class="vote-dist-row"><span class="vote-dist-face">${_voteFace(n)}</span><div class="vote-dist-bar"><div class="vote-dist-fill" style="width:${w}%;background:${_voteColor(n)}"></div></div><span class="vote-dist-count">${c}</span></div>`;
            }).join('')}
        </div>
    </div>` : ''}
    ${fistStats ? `
    <div class="vote-card">
        <div class="vote-card-head">
            <span class="vote-card-icon">✊</span>
            <span class="vote-card-title">Fist of Five — confiance PI</span>
            <span class="vote-card-count">${fistStats.count} vote${fistStats.count > 1 ? 's' : ''}</span>
        </div>
        <div class="vote-card-score" style="color:${_voteColor(fistStats.avg)}">
            <strong>${fistStats.avg}</strong><small>/5</small>
        </div>
        <div class="vote-dist">
            ${[1, 2, 3, 4, 5].map(n => {
                const c = fistStats.dist[n];
                const w = fistStats.count ? Math.round((c / fistStats.count) * 100) : 0;
                const lbl = ['', 'Pas confiant', 'Inquiet', 'Mitigé', 'Confiant', 'Très confiant'][n];
                return `<div class="vote-dist-row"><span class="vote-dist-fist">${n}</span><div class="vote-dist-bar"><div class="vote-dist-fill" style="width:${w}%;background:${_voteColor(n)}"></div></div><span class="vote-dist-label">${lbl}</span><span class="vote-dist-count">${c}</span></div>`;
            }).join('')}
        </div>
    </div>` : ''}
</div>` : ''}

<h2>🔄 À reporter au prochain sprint <span class="badge">${notDone.length} ticket${notDone.length > 1 ? 's' : ''}${notDonePts ? ` · ${notDonePts} pts` : ''}</span></h2>
${notDone.length === 0
    ? '<p class="empty">🎉 Tous les tickets ont été livrés !</p>'
    : (() => {
        // Groupes par statut dans l'ordre du tri (blocked → inprog → review → test → todo)
        const groups = [
            { key: 'blocked', label: '🚫 Bloqués',   color: '#ef4444' },
            { key: 'inprog',  label: '🔄 En cours',  color: '#3b82f6' },
            { key: 'review',  label: '👁 En review', color: '#8b5cf6' },
            { key: 'test',    label: '🧪 En test',   color: '#f59e0b' },
            { key: 'todo',    label: '⏸ À faire',    color: '#64748b' },
        ];
        const other = notDone.filter(t => !groups.find(g => g.key === t.status));
        return groups.map(g => {
            const list = notDone.filter(t => t.status === g.key);
            if (!list.length) return '';
            return `<div class="wins-group" style="border-left-color:${g.color}">
                <h3 class="wins-group-title"><span>${g.label}</span><span class="wins-group-count">${list.length}</span></h3>
                <ul class="cr-tickets">${list.map(renderRow).join('')}</ul>
            </div>`;
        }).join('') + (other.length ? `<div class="wins-group" style="border-left-color:#94a3b8">
            <h3 class="wins-group-title"><span>Autres</span><span class="wins-group-count">${other.length}</span></h3>
            <ul class="cr-tickets">${other.map(renderRow).join('')}</ul>
        </div>` : '');
    })()}

${allActionRetro.length ? `
<h2>🔁 Actions rétro à passer en revue <span class="badge">${allActionRetro.length}</span></h2>
<p class="retro-intro">Tour de table : où en est-on sur chaque action issue des rétros précédentes ?</p>
<div class="retro-list">
    ${allActionRetro.map(t => {
        const pf = _parentFeature(t);
        const stCls = t.status === 'done' ? 'is-done' : t.status === 'blocked' ? 'is-blocked' : t.status === 'inprog' ? 'is-inprog' : 'is-todo';
        const stLbl = t.status === 'done' ? '✓ Terminée' : t.status === 'blocked' ? '✗ Bloquée' : t.status === 'inprog' ? '● En cours' : '○ À faire';
        const leader = t.leader || t.assignee || '';
        // Description : peut être HTML (parseWikiMarkup JIRA → HTML) ou texte brut. On affiche tel quel
        // dans un <details> dépliable pour ne pas alourdir la lecture du tour de table.
        const desc = (t.description || '').trim();
        return `
        <div class="retro-item ${stCls}">
            <div class="retro-item-hdr">
                <span class="retro-status">${stLbl}</span>
                ${link(t.id)}
                <span class="retro-title">${esc(t.title || '(sans titre)')}</span>
                ${leader ? `<span class="retro-owner">— ${esc(leader)}</span>` : ''}
                ${pf ? `<span class="parent-chip">🧭 ${esc(pf.title)}</span>` : ''}
            </div>
            ${desc ? `
            <details class="retro-desc">
                <summary>📝 Voir la description</summary>
                <div class="retro-desc-body">${desc}</div>
            </details>` : ''}
        </div>`;
    }).join('')}
</div>` : ''}

<h2>⚠️ Points d'attention pour la rétro</h2>
${blocked.length > 0 || scopeCreep.length >= 2
    ? `<div class="attention">
        ${blocked.length > 0 ? `<p><strong>${blocked.length} ${blocked.length > 1 ? 'blockers' : 'blocker'}</strong> non ${blocked.length > 1 ? 'résolus' : 'résolu'} — analyser les causes racines.</p>` : ''}
        ${scopeCreep.length >= 2 ? `<p><strong>Périmètre élargi :</strong> ${scopeCreep.length} ${scopeCreep.length > 1 ? 'tickets' : 'ticket'} ${scopeCreep.length > 1 ? 'ajoutés' : 'ajouté'} après le début — discuter du processus de priorisation.</p>` : ''}
    </div>`
    : '<div class="attention attention--ok"><strong>👍 Sprint propre :</strong> pas de blocker non résolu ni d\'ajout significatif après début.</div>'}

<h2>🚀 Décisions & prochaines étapes <small class="cr-edit-hint">(éditable — sauvegardé localement)</small></h2>
<div id="cr-decisions" class="notes-zone" contenteditable="true" data-storage-key="${esc('cr-decisions-' + (sprint.name || 'sprint'))}" placeholder="Saisissez ici les décisions prises en réunion…"></div>

<footer class="cr-footer">
    Compte-rendu auto-généré par <strong>Squad Board</strong> le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}<br>
    <small>Tip : Ctrl+P pour imprimer · Ctrl+A puis Ctrl+C pour copier dans Confluence</small>
</footer>

</body>
</html>`;
}
