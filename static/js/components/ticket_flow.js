/**
 * « Le voyage du ticket » — détail de la tuile Flux de la modale ticket (clic sur la tuile).
 *
 * Raconte le parcours d'UN ticket pour en discuter (daily, rétro, revue de flux) :
 *   • une phrase-récit (attente → travail → livraison) ;
 *   • la frise des colonnes JIRA traversées, colorée par PHASE (attente, préparation, dév,
 *     revue, test, livraison, blocage) — durées = `stageDurations` (jours OUVRÉS, sync-parse.js) ;
 *   • des chiffres clés (efficacité du flux, étape la plus longue, allers-retours, blocage,
 *     réestimations, sprints traversés, comparaison à l'équipe, personnes impliquées) ;
 *   • des questions générées à partir de ces faits, pour lancer la discussion.
 *
 * Aucun calcul de durée n'est réécrit ici : Cycle / Lead / âge = utils/workdays.js, blocages =
 * utils/blocked.js, catégorie d'un libellé = `mapStatus`. Modèle pur (`ticketFlowModel`) séparé
 * du rendu, pour être testable sans DOM.
 */
import { esc, fmtDate, mapStatus, cycleDays, leadDays, wipAgeDays, workdaysBetween, blockedIntervals, blockedDays, getStatusLabel, copyToClipboard, hashColor, initials, samePerson, isBotName } from '../utils.js';

/** Phases d'un parcours, dans l'ordre de la légende. `active` = temps où l'ÉQUIPE DE RÉALISATION fait
 *  avancer le ticket (dév, revue, test) : la préparation (spécification, estimation) est montrée à part,
 *  sinon un ticket resté 3 semaines « en spécification » affichait 95 % d'efficacité. */
export const FLOW_PHASES = {
    wait:    { label: 'Attente',      icon: '⏸️', active: false },
    prep:    { label: 'Préparation',  icon: '✍️', active: false },
    work:    { label: 'Développement', icon: '💻', active: true },
    review:  { label: 'Revue',        icon: '👀', active: true  },
    test:    { label: 'Test',         icon: '🧪', active: true  },
    ship:    { label: 'Livraison',    icon: '📦', active: false },
    blocked: { label: 'Bloqué',       icon: '🚫', active: false },
};

/** Phase d'une colonne JIRA (libellé brut en minuscules, clé de `stageDurations`). */
export function flowPhaseOf(label) {
    const k = String(label || '').toLowerCase().trim();
    const cat = mapStatus(k);
    if (cat === 'blocked') return 'blocked';
    if (cat === 'review') return 'review';
    if (cat === 'test') return 'test';
    if (cat === 'done') return 'ship';
    if (cat === 'inprog') return /sp[ée]cif|maquette|wireframe|conception|cadrage|analyse/.test(k) ? 'prep' : 'work';
    return /sp[ée]cif|estim|cadrage|analyse|maquette|wireframe|conception|affinage/.test(k) ? 'prep' : 'wait';
}

const _RANK = { todo: 0, inprog: 1, review: 2, test: 3, done: 4 };
const _ms = v => (v ? Date.parse(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN);
const _median = arr => {
    const v = [...arr].sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** « 2,7 j » / « 16 j » / « < 1 j » — durées en jours ouvrés. */
export function fmtDays(d) {
    if (d == null || !Number.isFinite(d)) return '—';
    if (d < 0.05) return '0 j';
    if (d < 1) return '< 1 j';
    if (d < 10) return `${String(Math.round(d * 10) / 10).replace('.', ',')} j`;
    return `${Math.round(d)} j`;
}

/**
 * @param {object}   t            ticket
 * @param {object[]} teamTickets  tickets de la MÊME équipe (référence de comparaison)
 * @param {Date}     [now]
 */
export function ticketFlowModel(t, teamTickets = [], now = new Date()) {
    const nowMs = now.getTime();
    const changes = [...(t.recentChanges || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const of = f => changes.filter(c => String(c.field || '').toLowerCase() === f);

    // ── Colonnes traversées (ordre d'entrée = ordre des clés de stageDurations) ──
    const stages = Object.entries(t.stageDurations || {})
        .map(([label, days]) => ({ label, days: Number(days) || 0, phase: flowPhaseOf(label) }))
        .filter(s => s.days >= 0.05);
    const total = stages.reduce((s, x) => s + x.days, 0);
    const phases = {};
    for (const s of stages) phases[s.phase] = (phases[s.phase] || 0) + s.days;
    const active = Object.entries(phases).reduce((s, [k, d]) => s + (FLOW_PHASES[k].active ? d : 0), 0);
    const longest = stages.reduce((m, s) => (!m || s.days > m.days ? s : m), null);

    // ── Jalons ──
    const done = t.status === 'done';
    const started = !!t.startedDate;
    const ct = cycleDays(t), lt = leadDays(t);
    const waitBeforeStart = workdaysBetween(t.createdAt, started ? t.startedDate : now);
    const wip = started && !done ? wipAgeDays(t.startedDate, now) : null;
    const age = workdaysBetween(t.createdAt, now);

    // ── Allers-retours : statut qui recule (revue → dév, terminé → en cours…) ──
    const backs = of('status').filter(c => {
        const a = _RANK[mapStatus(String(c.from || '').toLowerCase())], b = _RANK[mapStatus(String(c.to || '').toLowerCase())];
        return a != null && b != null && a >= 1 && b < a;
    }).map(c => ({ from: c.from, to: c.to, date: c.date }));

    // ── Blocages (drapeau OU statut bloqué), bornés à la vie du ticket ──
    const endMs = done && t.resolvedDate ? _ms(t.resolvedDate) : nowMs;
    const blocks = blockedIntervals(t, _ms(t.createdAt) || -Infinity, Number.isFinite(endMs) ? endMs : nowMs);
    const blocked = blockedDays(blocks);

    // ── Estimations ──
    // Réestimation = une valeur précédente existait (la 1ʳᵉ estimation « — → 5 » n'en est pas une).
    const estimates = changes.filter(c => /^story point/.test(String(c.field || '').toLowerCase()) && String(c.from || '').trim() && String(c.to || '').trim() && c.from !== c.to)
        .map(c => ({ from: c.from, to: c.to, author: c.author }));

    // ── Sprints traversés ──
    const sprintSet = new Set();
    for (const c of of('sprint')) for (const raw of [c.from, c.to]) String(raw || '').split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(n => sprintSet.add(n));
    if (t.sprintName) sprintSet.add(t.sprintName);

    // ── Personnes impliquées, avec leur(s) rôle(s) ──
    // Doublons JIRA / RH fusionnés (« RIVIERE, David » ≡ « David Riviere », `samePerson`) ; les
    // comptes techniques (« Automation for Jira ») sont comptés à part, ce ne sont pas des personnes.
    const people = [];
    let bots = 0;
    const botSeen = new Set();
    const addPerson = (name, role) => {
        if (!name) return;
        if (isBotName(name)) { if (!botSeen.has(name)) { botSeen.add(name); bots++; } return; }
        const p = people.find(x => x.name === name || samePerson(x.name, name));
        if (p) p.roles.add(role); else people.push({ name, roles: new Set([role]) });
    };
    addPerson(t.leader || t.assignee, 'Leader');
    addPerson(t.reporter, 'Rapporteur');
    (t.contributors || []).forEach(n => addPerson(n, 'Contributeur'));
    (t.comments || []).forEach(c => addPerson(c.author, 'A commenté'));
    changes.forEach(c => addPerson(c.author, 'A modifié'));

    // ── Comparaison à l'équipe (tickets livrés, Cycle Time en jours ouvrés) ──
    const ref = teamTickets.filter(x => x.id !== t.id && x.status === 'done' && cycleDays(x) > 0);
    const refCts = ref.map(cycleDays);
    let vsTeam = null;
    if (refCts.length >= 5) {
        if (done && ct) vsTeam = { kind: 'faster', pct: Math.round(refCts.filter(v => v > ct).length / refCts.length * 100), n: refCts.length, median: _median(refCts) };
        else if (wip) vsTeam = { kind: 'older', pct: Math.round(refCts.filter(v => v < wip).length / refCts.length * 100), n: refCts.length, median: _median(refCts) };
    }
    const samePts = t.points ? ref.filter(x => Number(x.points) === Number(t.points)).map(cycleDays) : [];
    const samePtsMedian = samePts.length >= 3 ? _median(samePts) : null;

    return {
        id: t.id, team: t.team || '', status: getStatusLabel(t), points: Number(t.points) || 0,
        done, started, ct, lt, wip, age, waitBeforeStart,
        createdAt: t.createdAt, startedDate: t.startedDate, resolvedDate: t.resolvedDate,
        stages, total, phases, active, efficiency: total > 0 ? Math.round(active / total * 100) : null, longest,
        backs, blocks, blocked, estimates, sprints: [...sprintSet], people: people.map(p => ({ name: p.name, roles: [...p.roles] })), bots,
        vsTeam, samePtsMedian, samePtsN: samePts.length,
    };
}

/** Phrase-récit du parcours. */
function _story(m) {
    const wait = m.waitBeforeStart != null ? fmtDays(m.waitBeforeStart) : null;
    const prep = m.phases.prep >= 1 ? ` (dont ${fmtDays(Math.min(m.phases.prep, m.waitBeforeStart || m.phases.prep))} de préparation)` : '';
    if (m.done) {
        return `Créé le ${fmtDate(m.createdAt)}${m.started && wait ? `, pris en main après <b>${wait}</b>${prep}` : ''}, livré ${m.ct ? `en <b>${fmtDays(m.ct)}</b> de travail` : `le ${fmtDate(m.resolvedDate)}`}${m.lt ? ` — <b>${fmtDays(m.lt)}</b> de bout en bout` : ''}.`;
    }
    if (m.started) {
        return `Créé il y a ${fmtDays(m.age)}, pris en main après <b>${wait}</b>${prep} ; en cours depuis <b>${fmtDays(m.wip)}</b>, actuellement « ${esc(m.status)} ».`;
    }
    return `Créé il y a <b>${fmtDays(m.age)}</b>, il attend toujours d'être pris en main (« ${esc(m.status)} »).`;
}

/** Faits marquants → cartes. Textes BRUTS (libellés JIRA compris) : échappés au rendu. */
function _facts(m) {
    const f = [];
    if (m.efficiency != null) {
        const mood = m.efficiency >= 60 ? '🚀 Fluide' : m.efficiency >= 30 ? '🙂 Correct' : '🐢 Beaucoup d\'attente';
        f.push({ icon: '⚡', value: `${m.efficiency} %`, label: 'Efficacité du flux', sub: mood, tip: 'Temps de dév, revue et test ÷ temps total passé dans les colonnes (attente et préparation comprises)', tone: m.efficiency >= 60 ? 'good' : m.efficiency >= 30 ? '' : 'warn' });
    }
    if (m.longest && m.total > 0) {
        f.push({ icon: '⏳', value: fmtDays(m.longest.days), label: 'Étape la plus longue', sub: `${m.longest.label} · ${Math.round(m.longest.days / m.total * 100)} %`, tip: m.longest.label });
    }
    f.push(m.backs.length
        ? { icon: '🔁', value: String(m.backs.length), label: m.backs.length > 1 ? 'Allers-retours' : 'Aller-retour', sub: m.backs.slice(0, 2).map(b => `${b.from} → ${b.to}`).join(' · '), tone: m.backs.length >= 2 ? 'warn' : '' }
        : { icon: '🎯', value: '0', label: 'Aller-retour', sub: 'Toujours vers l\'avant', tone: 'good' });
    if (m.blocked >= 0.05) {
        f.push({ icon: '🚫', value: fmtDays(m.blocked), label: 'Bloqué', sub: `${m.blocks.length} période${m.blocks.length > 1 ? 's' : ''}`, tone: 'bad' });
    }
    if (m.estimates.length) {
        const first = m.estimates[0].from || '—', last = m.estimates.at(-1).to || '—';
        f.push({ icon: '🎲', value: `${first} → ${last}`, label: 'Estimation', sub: `réestimé ${m.estimates.length} fois`, tone: m.estimates.length >= 2 ? 'warn' : '' });
    } else if (m.points) {
        f.push({ icon: '🎲', value: `${m.points} pts`, label: 'Estimation', sub: 'jamais réestimé', tone: 'good' });
    }
    if (m.sprints.length) {
        f.push({ icon: '🗓️', value: String(m.sprints.length), label: m.sprints.length > 1 ? 'Sprints traversés' : 'Sprint', sub: m.sprints.length > 1 ? `${m.sprints.length - 1} déplacement${m.sprints.length > 2 ? 's' : ''}` : m.sprints[0], tip: m.sprints.join(' · '), tone: m.sprints.length >= 3 ? 'warn' : '' });
    }
    if (m.vsTeam) {
        f.push(m.vsTeam.kind === 'faster'
            ? { icon: '🏁', value: `${m.vsTeam.pct} %`, label: 'Plus rapide que', sub: `des ${m.vsTeam.n} livrés · ${m.team}`, tip: `Cycle Time médian de l'équipe : ${fmtDays(m.vsTeam.median)}`, tone: m.vsTeam.pct >= 50 ? 'good' : 'warn' }
            : { icon: '⏰', value: `${m.vsTeam.pct} %`, label: 'Déjà plus long que', sub: `des ${m.vsTeam.n} livrés · ${m.team}`, tip: `Cycle Time médian de l'équipe : ${fmtDays(m.vsTeam.median)}`, tone: m.vsTeam.pct >= 85 ? 'bad' : m.vsTeam.pct >= 50 ? 'warn' : 'good' });
    }
    if (m.people.length) {
        f.push({ icon: '👥', value: String(m.people.length), label: m.people.length > 1 ? 'Personnes impliquées' : 'Personne impliquée', people: m.people, sub: m.bots ? `+ ${m.bots} automate${m.bots > 1 ? 's' : ''}` : '' });
    }
    return f;
}

/** Questions pour lancer la discussion, tirées des faits (4 au plus, les plus parlantes d'abord). */
export function flowQuestions(m) {
    const q = [];
    const work = m.done ? m.ct : m.wip;
    if (m.backs.length) q.push(`🔁 ${m.backs.length} retour${m.backs.length > 1 ? 's' : ''} en arrière (${esc(m.backs[0].from)} → ${esc(m.backs[0].to)}) : les critères d'acceptation étaient-ils clairs dès le départ ?`);
    if (m.blocked >= 1) q.push(`🚫 Bloqué ${fmtDays(m.blocked)} : qu'est-ce qui l'a bloqué, et comment le voir venir la prochaine fois ?`);
    if (m.vsTeam?.kind === 'older' && m.vsTeam.pct >= 85) q.push(`⏰ Déjà plus long que ${m.vsTeam.pct} % des tickets livrés : faut-il demander de l'aide, ou le découper ?`);
    if (m.points && m.samePtsMedian && work && work > 2 * m.samePtsMedian) q.push(`📏 ${m.points} pts mais ${fmtDays(work)} de travail, quand l'équipe en met ${fmtDays(m.samePtsMedian)} d'habitude pour cette taille : qu'a-t-on découvert en route ?`);
    if (m.waitBeforeStart != null && m.waitBeforeStart >= 5 && (!work || m.waitBeforeStart > work)) q.push(`⏸️ ${fmtDays(m.waitBeforeStart)} avant d'être pris en dév : priorité floue, besoin pas prêt, ou trop de travail en cours ?`);
    const L = m.longest;
    if (L && L.days >= 3) {
        if (L.phase === 'review') q.push(`👀 ${fmtDays(L.days)} en « ${esc(L.label)} » : les relecteurs étaient-ils disponibles ?`);
        else if (L.phase === 'test' || L.phase === 'ship') q.push(`📦 ${fmtDays(L.days)} en « ${esc(L.label)} » : goulot côté qualification ou livraison ?`);
        else if (L.phase === 'prep') q.push(`✍️ ${fmtDays(L.days)} en « ${esc(L.label)} » : le besoin était-il assez mûr pour démarrer ?`);
        else if (L.phase === 'wait') q.push(`⏸️ ${fmtDays(L.days)} en « ${esc(L.label)} » : qu'attendait-on exactement ?`);
    }
    if (m.estimates.length) q.push(`🎲 Estimation revue (${esc(m.estimates[0].from || '—')} → ${esc(m.estimates.at(-1).to || '—')}) : qu'est-ce qui a changé notre vision ?`);
    if (m.sprints.length >= 3) q.push(`🗓️ ${m.sprints.length} sprints traversés : trop gros pour un sprint ?`);
    if (!q.length) q.push(m.done ? '🎉 Un parcours sans accroc : qu\'est-ce qui a bien marché, à refaire ?' : '🙂 Rien d\'inquiétant pour l\'instant : le prochain pas est-il clair pour tout le monde ?');
    return q.slice(0, 4);
}

/** Résumé texte (Slack / Teams) — mêmes faits que le panneau. */
export function flowSummaryText(m) {
    const strip = s => String(s).replace(/<[^>]+>/g, '');
    const lines = [`🧭 ${m.id} — le voyage du ticket`, strip(_story(m))];
    if (m.stages.length) lines.push('Parcours : ' + m.stages.map(s => `${s.label} ${fmtDays(s.days)}`).join(' → '));
    for (const f of _facts(m)) lines.push(`${f.icon} ${f.label} : ${strip(f.value)}${f.sub ? ` (${strip(f.sub)})` : ''}`);
    lines.push('', '💬 Pour en parler :', ...flowQuestions(m).map(q => `• ${strip(q)}`));
    return lines.join('\n');
}

/** HTML du panneau. */
export function ticketFlowHtml(m) {
    const journey = m.stages.length
        ? `<div class="tf-journey" role="img" aria-label="Parcours : ${esc(m.stages.map(s => `${s.label} ${fmtDays(s.days)}`).join(', '))}">
            ${m.stages.map(s => {
                const pct = s.days / m.total * 100;
                return `<span class="tf-seg tf-ph--${s.phase}" style="flex-grow:${s.days.toFixed(2)}" title="${esc(FLOW_PHASES[s.phase].icon)} ${esc(s.label)} — ${esc(fmtDays(s.days))} (${Math.round(pct)} %)">${pct >= 11 ? `<span class="tf-seg-txt">${esc(fmtDays(s.days))}</span>` : ''}</span>`;
            }).join('')}
        </div>
        <div class="tf-legend">
            ${Object.keys(FLOW_PHASES).filter(k => m.phases[k]).map(k => `<span class="tf-leg"><i class="tf-ph--${k}"></i>${FLOW_PHASES[k].icon} ${esc(FLOW_PHASES[k].label)} <b>${esc(fmtDays(m.phases[k]))}</b></span>`).join('')}
        </div>`
        : '<p class="tf-empty">Pas encore de passage en colonne mesuré — la frise apparaît après la prochaine synchro.</p>';

    const facts = _facts(m).map(f => `<div class="tf-fact${f.tone ? ` tf-fact--${f.tone}` : ''}${f.people ? ' tf-fact--people' : ''}"${f.tip ? ` title="${esc(f.tip)}"` : ''}>
        <span class="tf-fact-ico" aria-hidden="true">${f.icon}</span>
        <span class="tf-fact-val">${esc(f.value)}</span>
        <span class="tf-fact-lbl">${esc(f.label)}</span>
        ${f.people
            ? `<button type="button" class="tf-people" data-tf-people aria-expanded="false" title="Voir qui — cliquer">${f.people.slice(0, 6).map(p => `<span class="tf-av" style="background:${hashColor(p.name)}">${esc(initials(p.name))}</span>`).join('')}${f.people.length > 6 ? `<span class="tf-av tf-av--more">+${f.people.length - 6}</span>` : ''}<span class="tf-people-more">voir qui</span></button>
               ${f.sub ? `<span class="tf-fact-sub">${esc(f.sub)}</span>` : ''}
               <ul class="tf-people-list" hidden>${f.people.map(p => `<li>
                    <span class="tf-av" style="background:${hashColor(p.name)}">${esc(initials(p.name))}</span>
                    <span class="tf-people-name">${esc(p.name)}</span>
                    ${p.roles.map(r => `<span class="tf-role">${esc(r)}</span>`).join('')}
               </li>`).join('')}</ul>`
            : (f.sub ? `<span class="tf-fact-sub">${esc(f.sub)}</span>` : '')}
    </div>`).join('');

    return `<div class="tf">
        <div class="tf-head">
            <span class="tf-title">🧭 Le voyage du ticket</span>
            <button type="button" class="tf-copy" data-tf-copy title="Copier le résumé pour Slack / Teams">📋 Copier le résumé</button>
        </div>
        <p class="tf-story">${_story(m)}</p>
        ${journey}
        <div class="tf-facts">${facts}</div>
        <div class="tf-talk">
            <span class="tf-talk-title">💬 Pour en parler</span>
            <ul>${flowQuestions(m).map(q => `<li>${q}</li>`).join('')}</ul>
        </div>
        <p class="tf-foot">Durées en jours ouvrés, arrêtées à la dernière synchro JIRA.</p>
    </div>`;
}

/** Câble le bouton de copie et le dépliage des personnes. */
export function bindTicketFlow(root, m) {
    root.querySelector('[data-tf-people]')?.addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget, card = btn.closest('.tf-fact');
        const list = card?.querySelector('.tf-people-list');
        if (!list) return;
        list.hidden = !list.hidden;
        btn.setAttribute('aria-expanded', String(!list.hidden));
        card.classList.toggle('is-open', !list.hidden);
        btn.querySelector('.tf-people-more').textContent = list.hidden ? 'voir qui' : 'masquer';
    });
    root.querySelector('[data-tf-copy]')?.addEventListener('click', e => {
        e.stopPropagation();
        copyToClipboard(flowSummaryText(m), 'Résumé copié');
    });
}
