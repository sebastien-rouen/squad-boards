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

import { esc, percentile } from '../utils.js';

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

const _fmtDate = ms => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
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
            <div class="card-header"><div><span class="card-title">🔮 Prévision de fin</span>${help}</div></div>
            <p class="text-muted text-sm" style="padding:var(--sp-3)">${esc(reason)}</p>
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
                    <span class="card-title">🔮 Prévision de fin</span>
                    ${help}
                </div>
                <span class="forecast-conf forecast-conf--${conf.cls}" title="${nonEmpty} semaine(s) avec au moins un ticket terminé dans les ${weeks} dernières">${conf.txt}</span>
            </div>
            ${probBlock}
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
            </div>
        </div>`;
}
