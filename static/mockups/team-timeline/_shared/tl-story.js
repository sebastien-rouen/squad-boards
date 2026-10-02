/* Frise 2 — « Fil du temps » : récit vertical, mois par mois (journal d'équipe).
 * Parti pris : RACONTER la période — ce qu'on lit en rétro, en onboarding, dans un rapport.
 * Rail coloré, une carte par fait ; même type la même semaine = regroupé ; période creuse = carte
 * de période avec son histogramme ; mini-bilan par mois. Naturel en mobile.
 */
(function () {
    'use strict';
    const T = window.TL, esc = T.esc;
    const target = (st, it) => window.TLApp.target(st, it);
    const DOW = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const chip = (m, cls) => `<span class="tls-person ${cls}${m.precise ? '' : ' is-approx'}${m.conflict ? ' is-conflict' : ''}" title="${esc(m.who)}${m.precise ? '' : ' — au changement de PI'}">${esc(T.shortName(m.who))}${m.kind === 'move-in' ? ` <small>← ${esc(m.from)}</small>` : m.kind === 'move-out' ? ` <small>→ ${esc(m.to)}</small>` : ''}${m.conflict ? ' ⚠️' : ''}</span>`;

    /** Liste datée des entrées du récit (déjà filtrées par catégorie). */
    function entries(st, c) {
        const on = k => st.cats.has(k), E = [];
        if (on('rythme')) {
            c.pis.filter(p => p.start >= st.A).forEach(p => E.push({ day: p.start, cat: 'rythme', divider: true, html: `🧭 Début du <b>PI ${p.n}</b>` }));
            const byDay = new Map();
            c.milestones.forEach(m => (byDay.get(m.day) || byDay.set(m.day, []).get(m.day)).push(m));
            byDay.forEach((ms, day) => E.push({ day, cat: 'rythme', title: ms.map(m => m.title.replace(/^ERPC - /, '')).join(' · '), sub: 'Train ERPC',
                item: { kind: 'milestone', cat: 'rythme', title: ms.map(m => m.title).join(' · '), when: T.fmt(day) } }));
        }
        if (on('presence')) c.low.forEach(p => {
            const bars = c.presence.filter(s => s.week >= p.start && s.week <= p.end && s.pct !== null)
                .map(s => `<i style="--p:${s.pct}" title="Semaine du ${T.fmt(s.week)} : ${s.pct} %"></i>`).join('');
            E.push({ day: p.start, end: p.end, cat: 'presence', title: `🏖️ ${p.label}`, sub: `${p.weeks} semaines · ${p.avg} % d’absence en moyenne · pic ${p.peak} % (sem. du ${T.fmt(p.peakWeek)})`,
                extra: `<div class="tls-spark">${bars}</div>`, item: { kind: 'low', cat: 'presence', low: p, title: `${p.label} — pic ${p.peak} %`, when: `${T.fmt(p.start)} → ${T.fmt(p.end)}` } });
        });
        if (on('production')) c.incidents.forEach(x => E.push({ day: x.day, cat: 'production', title: `🚨 ${x.count} incident${x.count > 1 ? 's' : ''} de production`,
            sub: `Semaine du ${T.fmt(x.week)}`, extra: `<ul class="tls-list">${x.items.slice(0, 2).map(i => `<li>${esc(i.title.slice(0, 110))}${i.title.length > 110 ? '…' : ''}</li>`).join('')}${x.count > 2 ? `<li class="tls-more">+ ${x.count - 2} autres</li>` : ''}</ul>`,
            item: { kind: 'incidents', cat: 'production', items: x.items, title: `${x.count} incident(s) de production`, when: `Semaine du ${T.fmt(x.week)}` } }));
        if (on('livraison')) {
            const byWeek = new Map();
            c.releases.forEach(r => { const w = T.mondayOf(r.day); (byWeek.get(w) || byWeek.set(w, []).get(w)).push(r); });
            byWeek.forEach((rs, w) => { const items = rs.flatMap(r => r.items); E.push({ day: rs[0].day, cat: 'livraison', title: `🚀 ${items.length} créneau${items.length > 1 ? 'x' : ''} de MEP`,
                sub: `Semaine du ${T.fmt(w)} · ${[...new Set(items.map(i => i.cal.replace('ERPC - ', '')))].join(', ')}`, item: { kind: 'releases', cat: 'livraison', items, title: 'Mises en production', when: `Semaine du ${T.fmt(w)}` } }); });
        }
        if (on('equipe')) {
            const byDay = new Map();
            c.moves.forEach(m => (byDay.get(m.day) || byDay.set(m.day, []).get(m.day)).push(m));
            byDay.forEach((ms, day) => {
                const grp = (ks, cls, lbl) => { const g = ms.filter(m => ks.includes(m.kind)); return g.length ? `<div class="tls-people"><span class="tls-people-lbl ${cls}">${lbl}</span>${g.map(m => chip(m, cls)).join('')}</div>` : ''; };
                const approx = ms.every(m => !m.precise);
                E.push({ day, cat: 'equipe', title: approx ? `👥 Changement de roster au début du PI ${ms[0].pi}` : '👥 Arrivées et départs',
                    sub: approx ? 'Constaté au changement de PI — date exacte inconnue' : 'Check-lists d’onboarding / offboarding',
                    extra: grp(['in'], 'is-in', '▲ Arrivée') + grp(['out'], 'is-out', '▼ Départ') + grp(['move-in', 'move-out'], 'is-move', '⇄ Mobilité'),
                    item: { kind: 'move', cat: 'equipe', move: ms[0], title: `${ms.length} mouvement(s) — ${ms.map(m => T.shortName(m.who)).join(', ')}`, when: T.fmt(day) } });
            });
        }
        c.facts.forEach(f => {
            const cat = f.type === 'incident' ? 'production' : 'fait';
            if (!on(cat)) return;
            const t = T.FACT_TYPES[f.type] || T.FACT_TYPES.autre;
            E.push({ day: f.start, end: f.end !== f.start ? f.end : null, cat, title: `${t.emoji} ${f.title}`, sub: `${t.label}${f.seed ? ' · exemple fondé sur de vrais tickets' : ' · saisi à la main'}`,
                extra: f.note ? `<p class="tls-note">${esc(f.note)}</p>` : '', manual: true, item: { kind: 'fact', cat, fact: f, title: `${t.emoji} ${f.title}`, when: T.fmt(f.start) } });
        });
        return E.filter(e => e.day >= st.A && e.day <= st.B || (e.end && e.end >= st.A && e.day <= st.B)).sort((a, b) => a.day.localeCompare(b.day) || (b.divider ? 1 : 0) - (a.divider ? 1 : 0));
    }

    function html(st, c) {
        const E = entries(st, c);
        if (!E.length) return '<div class="tl-state"><div class="tl-state-ico">🌤️</div><h5>Rien de marquant</h5><p>Élargissez la période ou réactivez des catégories.</p></div>';
        const months = new Map();
        E.forEach(e => { const k = e.day.slice(0, 7); (months.get(k) || months.set(k, []).get(k)).push(e); });
        return `<div class="tls">${[...months.entries()].map(([m, es]) => {
            const n = cat => es.filter(e => e.cat === cat && !e.divider).length;
            const bilan = [n('equipe') && `${n('equipe')} 👥`, n('production') && `${n('production')} 🚨`, n('livraison') && `${n('livraison')} 🚀`, n('presence') && '🏖️'].filter(Boolean).join(' · ');
            return `<section class="tls-month"><h5 class="tls-mhead"><span>${esc(T.monthName(m + '-01'))}</span><small>${bilan}</small></h5>
                ${es.map(e => e.divider ? `<div class="tls-divider" data-c="${e.cat}"><span>${e.html} — ${T.fmt(e.day)}</span></div>`
                    : `<div class="tls-entry" data-c="${e.cat}">
                        <div class="tls-date"><b>${+e.day.slice(8, 10)}</b><span>${DOW[T.parse(e.day).getDay()]}</span></div>
                        <div class="tls-dot" aria-hidden="true"></div>
                        <div class="tls-card${e.manual ? ' is-manual' : ''}" role="button" tabindex="0" ${target(st, e.item)}>
                            <b class="tls-title">${esc(e.title)}</b>
                            <span class="tls-sub">${e.end ? `${T.fmt(e.day)} → ${T.fmt(e.end)} · ` : ''}${esc(e.sub || '')}</span>
                            ${e.extra || ''}
                        </div>
                    </div>`).join('')}
            </section>`;
        }).join('')}</div>`;
    }

    window.TLViews = window.TLViews || {};
    window.TLViews.story = { html };
})();
