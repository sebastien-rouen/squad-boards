/**
 * Health — carte « 🎯 Capacité prévisionnelle » (une équipe) : base du PI sélectionné, fiabilité sur les
 * PI clos précédents, détail par itération (base, j/h présents, réalisé). Même calcul que la colonne
 * 🎯 de la matrice (`_capBaseFor` du modèle).
 */

import { extractPiNum, isBreathSprint, esc, todayIsoLocal, sprintCapacityBase, extractSprintLabel } from '../utils.js';
import { sprintWorkDays, iterationManDays } from '../components/meteo_fiche.js';
import { _capacityTip, _fmtD } from './health-shared.js';

/** Carte Capacité prévisionnelle — vide si plusieurs équipes ou aucune base calculable. */
export function capacityCardHtml(m) {
    const { teamsScope, targetPiNum, currentPiNum, _capBaseFor, sprintInfo, _sprintVelo, absences, _pctOfFor, _lastAbsence } = m;
    // Capacité prévisionnelle (si une équipe est sélectionnée) — TOUJOURS le PI SÉLECTIONNÉ
    // (repli : courant + 1). Même calcul que la colonne 🎯 Base capacité : `_capBaseFor`, qui
    // ne regarde que les 2 PI AVANT le PI visé — donc sur un PI en cours ou passé, c'est ce
    // qu'on pouvait prévoir à son PI Planning, mis en regard du réalisé (vélocité des sprints
    // clos, respiration exclue, même mesure que la moyenne de référence).
    const capacityCard = teamsScope.length === 1 ? (() => {
        const team = teamsScope[0];
        const capPi = targetPiNum || (currentPiNum ? currentPiNum + 1 : 0);
        const cap = _capBaseFor(team, capPi);
        if (!cap) return '';
        const when = capPi > currentPiNum ? 'future' : capPi === currentPiNum ? 'current' : 'past';
        const _fmtDm = iso => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '?';
        const ratioPct = Math.round(cap.ratio * 100);
        const ratioColor = ratioPct >= 30 ? 'var(--warning)' : ratioPct >= 15 ? 'var(--info)' : 'var(--success)';
        // Réalisé d'un PI : sprints CLOS de l'équipe, hors respiration — même mesure (_sprintVelo)
        // que la moyenne de référence de la base, sinon prévu et réalisé ne se compareraient pas.
        const _realized = (pi, breathIdx) => {
            const closed = (sprintInfo?.teamSprints || []).filter(sp => sp.team === team
                && extractPiNum(sp.name || '') === pi && sp.state === 'closed' && !isBreathSprint(sp.name, breathIdx));
            const measured = closed.filter(sp => _sprintVelo(team, sp) != null);
            return { closed: measured, done: measured.reduce((sum, sp) => sum + _sprintVelo(team, sp), 0) };
        };
        const { closed, done } = when === 'future' ? { closed: [], done: 0 } : _realized(capPi, cap.breathIdx);
        // Fiabilité de la base : prévu vs réalisé sur les 3 PI CLOS précédant le PI visé (et
        // antérieurs au PI courant). Même calcul de base que la carte, rejoué PI par PI.
        // Écart ≤ 10 % ✓ fiable, ≤ 25 % ~ approximative, au-delà ✗ — couleur DOUBLÉE du signe.
        const hist = [];
        for (let pi = capPi - 3; pi < capPi; pi++) {
            if (pi <= 0 || pi >= currentPiNum) continue;
            const b = _capBaseFor(team, pi);
            if (!b?.points) continue;
            const r = _realized(pi, b.breathIdx);
            if (!r.closed.length) continue;
            const pct = Math.round(r.done / b.points * 100);
            const gap = Math.abs(pct - 100);
            hist.push({ pi, pct, base: b.points, done: r.done, n: r.closed.length,
                lvl: gap <= 10 ? 'good' : gap <= 25 ? 'warn' : 'bad', sign: gap <= 10 ? '✓' : gap <= 25 ? '~' : '✗' });
        }
        const meanGap = hist.length ? Math.round(hist.reduce((s2, h) => s2 + Math.abs(h.pct - 100), 0) / hist.length) : null;
        const histHtml = hist.length ? `<div class="capacity-mini-hist" title="${esc(`Fiabilité de la base pour ${team} : réalisé ÷ base prévue, PI clos précédents.\n`
                + hist.map(h => `PI ${h.pi} : base ${h.base} pts, réalisé ${h.done} pts (${h.n} sprints clos) → ${h.pct} %`).join('\n')
                + `\nÉcart moyen : ±${meanGap} % — ✓ ≤ 10 %, ~ ≤ 25 %, ✗ au-delà`)}">
                <div class="capacity-mini-hist-hd"><span class="capacity-mini-hist-lbl">Fiabilité de la base</span><span class="capacity-mini-hist-mean">écart moyen ±${meanGap} %</span></div>
                <div class="capacity-mini-hist-its">${hist.map(h => `<span class="capacity-mini-hist-it is-${h.lvl}">PI ${h.pi} <b>${h.sign} ${h.pct} %</b></span>`).join('')}</div>
            </div>` : '';
        // Détail PAR ITÉRATION : la base du sprint (même `sprintCapacityBase` que la matrice — leur
        // somme fait le total affiché) en regard des JOURS/HOMME présents (`iterationManDays`, même mesure
        // que la carte roster du Dashboard) et du réalisé des sprints clos. Repliable, état par navigateur.
        const _todayIso = todayIsoLocal();
        const _fr1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
        const spRows = (cap.planSprints || []).map(sp => {
            const b = sprintCapacityBase({ avg: cap.avg, sprint: sp, absences, team, etp: cap.etp,
                pctOf: _pctOfFor(cap), lastAbsenceDate: _lastAbsence });
            const it = sprintWorkDays(sp);
            const md = it ? iterationManDays(cap.staff?.members, it, absences) : null;
            const share = md?.nominal > 0 ? Math.min(100, Math.round(md.present / md.nominal * 100)) : null;
            const real = sp.state === 'closed' ? _sprintVelo(team, sp) : null;
            const now = it && it.days[0] <= _todayIso && _todayIso <= it.days.at(-1);
            const realTxt = real != null ? `${real}` : now ? 'en cours' : '—';
            const realLvl = real != null && b?.points ? (Math.abs(real / b.points - 1) <= 0.1 ? 'good' : Math.abs(real / b.points - 1) <= 0.25 ? 'warn' : 'bad') : '';
            const sTip = `${extractSprintLabel(sp.name) || sp.name}${sp.projected ? ' (dates projetées)' : ''} — ${_fmtDm(sp.startDate)} → ${_fmtDm(sp.endDate)}`
                + `\n🎯 Base : ${b ? `${b.points} pts (${cap.avg.toFixed(1)} pts/sp − ${Math.round(b.ratio * 100)} % d'absences)` : 'non calculable'}`
                + (md ? `\n👥 Présence : ${_fr1(md.present)} j/h sur ${_fr1(md.nominal)} (${share} %) — congés et fériés déduits` : '')
                + (real != null ? `\n✅ Réalisé : ${real} pts` : '');
            return `<div class="capacity-mini-sp${now ? ' is-now' : ''}" title="${esc(sTip)}">
                <span class="capacity-mini-sp-lbl">${esc(extractSprintLabel(sp.name) || sp.name)}${sp.projected ? '<i title="Dates projetées">*</i>' : ''}</span>
                <span class="capacity-mini-sp-base">${b ? b.points : '—'}</span>
                <span class="capacity-mini-sp-etp">${share != null ? `<span class="capacity-mini-sp-bar${share < 75 ? ' is-low' : ''}"><i style="width:${share}%"></i></span>${_fr1(md.present)}` : '—'}</span>
                <span class="capacity-mini-sp-real${realLvl ? ` is-${realLvl}` : ''}">${realTxt}</span>
            </div>`;
        }).join('');
        // Jours/homme présents sur les sprints planifiables du PI (ligne de synthèse de la carte).
        const _mdPi = (cap.planSprints || []).reduce((acc, sp) => {
            const r = iterationManDays(cap.staff?.members, sprintWorkDays(sp), absences);
            return r ? { present: acc.present + r.present, nominal: acc.nominal + r.nominal } : acc;
        }, { present: 0, nominal: 0 });
        let _spOpen = false;
        try { _spOpen = localStorage.getItem('sb-health-cap-sprints') === '1'; } catch { /* stockage indisponible */ }
        const spHtml = spRows ? `<details class="capacity-mini-sprints"${_spOpen ? ' open' : ''}>
                <summary>Par itération (${(cap.planSprints || []).length})</summary>
                <div class="capacity-mini-sp capacity-mini-sp-hd"><span>Itér.</span><span>🎯 base pts</span><span>👥 j/h présents</span><span>✅ réalisé pts</span></div>
                ${spRows}
            </details>` : '';
        const lbl = when === 'future' ? 'Capacité prévisionnelle' : 'Capacité prévue';
        const tag = when === 'current' ? ' <small>(en cours)</small>' : when === 'past' ? ' <small>(clos)</small>' : '';
        const tip = _capacityTip(cap, team, capPi, _lastAbsence)
            + (cap.projected ? `\n\n📅 Aucun sprint du PI#${capPi} dans JIRA : dates PROJETÉES depuis la cadence (Paramètres → Sprint & PI).` : '')
            + (when !== 'future' ? `\n\nPI#${capPi} ${when === 'current' ? 'en cours' : 'clos'} : base calculée comme au PI Planning (vélocité des 2 PI précédents), comparée au réalisé des ${closed.length} sprint${closed.length > 1 ? 's' : ''} clos.` : '');
        return `
            <div class="capacity-mini" title="${esc(tip)}">
                <div class="capacity-mini-lbl">🎯 ${lbl} <strong>PI#${capPi}</strong>${tag}${cap.capped ? ' <span title="Congés connus jusqu\'au ' + esc(_fmtD(_lastAbsence)) + ' seulement : base optimiste">⚠</span>' : ''}</div>
                <div class="capacity-mini-val">${cap.points}<small>pts</small></div>
                <div class="capacity-mini-sub">${esc(team)} · ${_fmtDm(cap.windowStart)} → ${_fmtDm(cap.windowEnd)}${cap.projected ? ' · <em>dates projetées</em>' : ''}</div>
                <div class="capacity-mini-row">
                    <span>⚡ ${cap.avg.toFixed(1)} pts/sp × ${cap.sprintsCount}</span>
                    <span title="Jours/homme présents sur les sprints planifiables (capacité par rôle, congés et fériés déduits) / sans absence">👥 ${_mdPi.nominal ? `${Math.round(_mdPi.present)} / ${Math.round(_mdPi.nominal)} j/h` : '—'}</span>
                    <span style="color:${ratioColor}">🏖 −${ratioPct}%</span>
                </div>
                ${histHtml}
                ${spHtml}
                ${when !== 'future' ? `<div class="capacity-mini-row capacity-mini-done"><span>✅ Réalisé ${done} pts${cap.points ? ` · ${Math.round(done / cap.points * 100)} %` : ''}</span><span>${closed.length}/${cap.sprintsCount} sprints clos</span></div>` : ''}
            </div>`;
    })() : '';
    return capacityCard;
}
