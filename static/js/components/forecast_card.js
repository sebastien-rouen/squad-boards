/**
 * Card "Prévision (Monte-Carlo)" — Dashboard.
 *
 * Répond à « va-t-on finir à temps ? » sans se fier à une moyenne trompeuse. On tire au sort,
 * des milliers de fois, un enchaînement de semaines dont le débit (nb de tickets terminés) est
 * échantillonné dans l'HISTORIQUE RÉEL de l'équipe, jusqu'à écouler les tickets restants. La
 * distribution des durées simulées donne une prévision honnête : P50 (optimiste-réaliste), P85
 * (prudent) et, si une date cible est connue, la **probabilité** de tenir l'échéance.
 *
 * Volontairement basé sur le **débit hebdomadaire** (throughput) et non sur les story points :
 * le comptage de tickets est plus robuste quand l'estimation est partielle (cf card "Sans estimation").
 *
 * Rendu autonome : run chart en barres inline (pas de canvas Chart.js) + éventail P50/P85.
 */

import { esc, percentile, emptyStateHtml } from '../utils.js';
import { helpIconHtml } from './help_popover.js';

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Construit l'échantillon de débit hebdomadaire sur les `weeks` dernières fenêtres de 7 jours.
 * bucket[0] = semaine la plus récente (glissante, se terminant maintenant).
 */
export function weeklyThroughput(tickets, weeks = 12) {
    const now = Date.now();
    const buckets = new Array(weeks).fill(0);
    for (const t of (tickets || [])) {
        if (t.status !== 'done' || !t.resolvedDate) continue;
        const ms = new Date(t.resolvedDate).getTime();
        if (isNaN(ms)) continue;
        const wi = Math.floor((now - ms) / WEEK_MS);
        if (wi >= 0 && wi < weeks) buckets[wi] += 1;
    }
    return buckets; // ordre : [récent … ancien]
}

/**
 * Simulation Monte-Carlo : combien de semaines pour écouler `remaining` tickets, en tirant chaque
 * semaine un débit au hasard parmi `samples` (bootstrap avec remise).
 * @returns {{ weeksP50:number, weeksP85:number, weeksP95:number, prob?:number, samples:number[], median:number, ok:boolean, trials:number }}
 */
export function monteCarloForecast(samples, remaining, { trials = 5000, daysLeft = null } = {}) {
    const usable = (samples || []).filter(v => v >= 0);
    const positive = usable.filter(v => v > 0);
    // Impossible de prévoir sans aucune semaine productive, ou sans reste.
    if (!usable.length || !positive.length || remaining <= 0) {
        return { ok: false, samples: usable, median: 0, weeksP50: 0, weeksP85: 0, weeksP95: 0 };
    }
    const weeksNeeded = [];
    const MAX_W = 300;
    for (let i = 0; i < trials; i++) {
        let acc = 0, w = 0;
        while (acc < remaining && w < MAX_W) {
            acc += usable[(Math.random() * usable.length) | 0];
            w++;
        }
        weeksNeeded.push(w);
    }
    const median = percentile(usable, 50);
    const res = {
        ok: true,
        samples: usable,
        median,
        trials,
        weeksP50: percentile(weeksNeeded, 50),
        weeksP85: percentile(weeksNeeded, 85),
        weeksP95: percentile(weeksNeeded, 95),
    };
    if (daysLeft != null && daysLeft >= 0) {
        const weeksLeft = daysLeft / 7;
        const hit = weeksNeeded.filter(w => w <= weeksLeft).length;
        res.prob = Math.round((hit / weeksNeeded.length) * 100);
    }
    return res;
}

/**
 * Combien de tickets seront terminés d'ici `weeksLeft` semaines (3.239.0) — même bootstrap que la prévision, dans
 * l'autre sens : on tire `weeksLeft` semaines de débit et on additionne (la fraction de semaine au prorata).
 * @returns {{ p50: number, p85: number }}  p85 = au moins ce nombre dans 85 % des simulations (le chiffre « sûr »).
 */
export function deliverableBy(samples, weeksLeft, { trials = 5000 } = {}) {
    const usable = (samples || []).filter(v => v >= 0);
    if (!usable.length || !(weeksLeft > 0)) return { p50: 0, p85: 0 };
    const whole = Math.floor(weeksLeft), frac = weeksLeft - whole, counts = [];
    for (let i = 0; i < trials; i++) {
        let acc = 0;
        for (let w = 0; w < whole; w++) acc += usable[(Math.random() * usable.length) | 0];
        if (frac > 0) acc += frac * usable[(Math.random() * usable.length) | 0];
        counts.push(acc);
    }
    return { p50: Math.floor(percentile(counts, 50)), p85: Math.floor(percentile(counts, 15)) };
}

const _fmtDate = ms => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
const _num = n => String(Math.round(n * 10) / 10).replace('.', ',');
const _addWeeks = w => Date.now() + w * WEEK_MS;

/**
 * @param {object} o
 * @param {object[]} o.historyTickets  Historique équipe complet (pour le débit).
 * @param {number}   o.remaining        Tickets restants à terminer dans le périmètre.
 * @param {string}   [o.scopeLabel]     Libellé du périmètre ("sprint 30.2", "PI 30").
 * @param {string}   [o.targetDateIso]  Date cible (fin de sprint/PI) — active la probabilité.
 * @param {string}   [o.targetLabel]    "sprint" | "PI" pour le libellé de la probabilité.
 * @param {number}   [o.weeks]          Fenêtre d'historique (semaines).
 */
export function forecastCardHtml({ historyTickets = [], remaining = 0, scopeLabel = '', targetDateIso = null, targetLabel = 'échéance', weeks = 12 } = {}) {
    const samples = weeklyThroughput(historyTickets, weeks);
    const nonEmpty = samples.filter(v => v > 0).length;
    const now = Date.now();
    const daysLeft = targetDateIso ? Math.round((new Date(targetDateIso).getTime() - now) / DAY_MS) : null;
    const fc = monteCarloForecast(samples, remaining, { daysLeft });

    const help = '<span class="card-subtitle">Prévision par simulation (Monte-Carlo) sur le débit récent</span>';

    if (!fc.ok) {
        const reason = remaining <= 0 ? 'Aucun ticket restant à terminer 🎉'
            : nonEmpty < 1 ? 'Pas encore assez d\'historique de tickets terminés pour simuler'
            : 'Simulation indisponible';
        return `
        <div class="card forecast-card">
            <div class="card-header"><div><span class="card-title">🔮 Prévision de fin ${helpIconHtml({ key: 'forecast', label: 'Comprendre la prévision Monte-Carlo' })}</span>${help}</div></div>
            ${emptyStateHtml({ icon: remaining <= 0 ? '🎉' : '🔮', title: reason, tone: remaining <= 0 ? 'ok' : '' })}
        </div>`;
    }

    // Confiance : nombre de semaines productives dans l'échantillon.
    const conf = nonEmpty >= 8 ? { cls: 'ok', txt: 'bon historique' }
        : nonEmpty >= 4 ? { cls: 'warn', txt: 'historique limité' }
        : { cls: 'low', txt: 'historique très court — prévision indicative' };

    // Run chart : barres inline, la plus ancienne à gauche.
    const chrono = samples.slice().reverse();
    const maxV = Math.max(...chrono, 1);
    const bars = chrono.map((v, i) => {
        const h = Math.max(6, Math.round((v / maxV) * 100));
        const wkAgo = chrono.length - 1 - i;
        const lbl = wkAgo === 0 ? 'cette semaine' : `il y a ${wkAgo} sem.`;
        return `<span class="forecast-bar" style="height:${h}%" title="${v} ticket${v > 1 ? 's' : ''} terminé${v > 1 ? 's' : ''} · ${lbl}"></span>`;
    }).join('');

    const minV = Math.min(...chrono), medPct = Math.round((fc.median / maxV) * 100);

    // ── Détails (3.239.0) : échéance, débit nécessaire, livrable d'ici là, frise des dates ──────────────
    const weeksLeft = daysLeft != null && daysLeft >= 0 ? daysLeft / 7 : null;
    let detailsHtml = '';
    if (weeksLeft != null) {
        const need = remaining / Math.max(weeksLeft, 1 / 7);
        const ratio = fc.median > 0 ? need / fc.median : null;
        const by = deliverableBy(samples, weeksLeft, { trials: fc.trials });
        const defer = Math.max(0, remaining - by.p85);
        const needCls = ratio == null ? 'crit' : ratio <= 1 ? 'ok' : ratio <= 1.5 ? 'warn' : 'crit';
        const targetMs = new Date(targetDateIso).getTime();
        // Frise : de maintenant à la plus lointaine des dates (P95 ou échéance), marqueurs positionnés en %.
        const span = Math.max(fc.weeksP95, weeksLeft, 0.5) * 1.08;
        const x = w => Math.min(100, Math.max(0, (w / span) * 100)).toFixed(1);
        detailsHtml = `
            <div class="forecast-details">
                <div class="forecast-need forecast-need--${needCls}">
                    <span class="forecast-need-ico" aria-hidden="true">${needCls === 'ok' ? '✅' : needCls === 'warn' ? '⚠️' : '🚨'}</span>
                    <span>Pour finir le ${esc(targetLabel)} le <b>${_fmtDate(targetMs)}</b> (dans ${daysLeft} j), il faudrait
                    <b>${_num(need)} tickets / sem.</b>${ratio != null ? ` — <b>${_num(ratio)}×</b> le débit habituel (${_num(fc.median)} / sem.)` : ''}.</span>
                </div>
                <div class="forecast-by">
                    <span class="forecast-by-lbl">D'ici le ${_fmtDate(targetMs)}, au rythme habituel :</span>
                    <span class="forecast-by-val"><b>${by.p85}</b> ticket${by.p85 > 1 ? 's' : ''} <small>quasi sûr (85 %)</small></span>
                    <span class="forecast-by-val"><b>${by.p50}</b> ticket${by.p50 > 1 ? 's' : ''} <small>probable (50 %)</small></span>
                    ${defer ? `<span class="forecast-by-val forecast-by-val--defer"><b>${defer}</b> à reporter ou retirer <small>pour tenir l'échéance</small></span>`
                        : '<span class="forecast-by-val forecast-by-val--ok">✓ <small>tout le reste tient dans le délai</small></span>'}
                </div>
                <div class="forecast-track" role="img" aria-label="Échéance le ${_fmtDate(targetMs)} ; fin probable le ${_fmtDate(_addWeeks(fc.weeksP50))} (P50), prudente le ${_fmtDate(_addWeeks(fc.weeksP85))} (P85)">
                    <span class="forecast-track-range" style="--a:${x(fc.weeksP50)}%;--b:${x(fc.weeksP85)}%"></span>
                    <span class="forecast-track-mark forecast-track-mark--now" style="--x:0%"></span>
                    <span class="forecast-track-mark forecast-track-mark--target" style="--x:${x(weeksLeft)}%"></span>
                    <span class="forecast-track-mark forecast-track-mark--p50" style="--x:${x(fc.weeksP50)}%"></span>
                    <span class="forecast-track-mark forecast-track-mark--p85" style="--x:${x(fc.weeksP85)}%"></span>
                    <span class="forecast-track-mark forecast-track-mark--p95" style="--x:${x(fc.weeksP95)}%"></span>
                </div>
                <!-- Dates en légende sous la frise (pas d'étiquette sur les repères : P85 / P95 proches se chevauchaient) -->
                <p class="forecast-track-legend">
                    <span><i class="lg lg--now"></i>auj.</span>
                    <span><i class="lg lg--target"></i>échéance <b>${_fmtDate(targetMs)}</b></span>
                    <span><i class="lg lg--p50"></i>P50 <b>${_fmtDate(_addWeeks(fc.weeksP50))}</b></span>
                    <span><i class="lg lg--p85"></i>P85 <b>${_fmtDate(_addWeeks(fc.weeksP85))}</b></span>
                    <span><i class="lg lg--p95"></i>P95 ${_fmtDate(_addWeeks(fc.weeksP95))}</span>
                </p>
            </div>`;
    }

    const dP50 = _fmtDate(_addWeeks(fc.weeksP50));
    const dP85 = _fmtDate(_addWeeks(fc.weeksP85));

    // Probabilité de tenir l'échéance (si date cible connue).
    let probBlock = '';
    if (fc.prob != null) {
        const pCls = fc.prob >= 85 ? 'ok' : fc.prob >= 50 ? 'warn' : 'crit';
        const pMsg = fc.prob >= 85 ? 'confortable' : fc.prob >= 50 ? 'jouable mais serré' : 'à risque';
        probBlock = `
            <div class="forecast-prob forecast-prob--${pCls}" title="Part des ${fc.trials.toLocaleString('fr-FR')} simulations où les ${remaining} tickets restants sont terminés avant la fin du ${esc(targetLabel)} (${daysLeft} j restants)">
                <span class="forecast-prob-val">${fc.prob}%</span>
                <span class="forecast-prob-lbl">de finir le ${esc(targetLabel)} à temps · ${pMsg}</span>
            </div>`;
    }

    return `
        <div class="card forecast-card">
            <div class="card-header">
                <div>
                    <span class="card-title">🔮 Prévision de fin ${helpIconHtml({ key: 'forecast', label: 'Comprendre la prévision Monte-Carlo' })}</span>
                    ${help}
                </div>
                <span class="forecast-conf forecast-conf--${conf.cls}" title="${nonEmpty} ${nonEmpty > 1 ? 'semaines' : 'semaine'} avec au moins un ticket terminé dans les ${weeks} dernières">${conf.txt}</span>
            </div>
            ${probBlock}
            ${detailsHtml}
            <div class="forecast-kpis">
                <div class="forecast-kpi">
                    <span class="forecast-kpi-val">${remaining}</span>
                    <span class="forecast-kpi-lbl">tickets restants${scopeLabel ? ` · ${esc(scopeLabel)}` : ''}</span>
                </div>
                <div class="forecast-kpi">
                    <span class="forecast-kpi-val">${fc.median}<small>/sem</small></span>
                    <span class="forecast-kpi-lbl">débit médian</span>
                </div>
                <div class="forecast-kpi forecast-kpi--p50" title="50% de chances d'avoir terminé d'ici là">
                    <span class="forecast-kpi-val">${dP50}</span>
                    <span class="forecast-kpi-lbl">P50 · ~${fc.weeksP50} sem.</span>
                </div>
                <div class="forecast-kpi forecast-kpi--p85" title="85% de chances d'avoir terminé d'ici là — la date sur laquelle s'engager">
                    <span class="forecast-kpi-val">${dP85}</span>
                    <span class="forecast-kpi-lbl">P85 · ~${fc.weeksP85} sem.</span>
                </div>
            </div>
            <div class="forecast-runchart" title="Débit hebdomadaire (tickets terminés) sur les ${weeks} dernières semaines — source de la simulation">
                ${bars}
                <span class="forecast-median" style="--y:${medPct}%" aria-hidden="true"><em>médiane ${_num(fc.median)}</em></span>
            </div>
            <p class="forecast-runchart-cap">Débit des ${weeks} dernières semaines (source de la simulation) · min ${minV} · médiane ${_num(fc.median)} · max ${maxV} — ${fc.trials.toLocaleString('fr-FR')} tirages</p>
        </div>`;
}
