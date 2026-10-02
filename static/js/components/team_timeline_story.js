/**
 * Frise « Fil du temps » (bascule « 📖 Récit » de la carte Faits marquants) : récit vertical, mois
 * par mois — ce qu'on lit en rétro, en onboarding, dans un rapport. Vue par défaut sur mobile.
 * Frise 2 de la maquette static/mockups/team-timeline/ (b-recit), mêmes données que les couloirs.
 *
 * `target(item)` (fourni par la coquille team_timeline.js) enregistre une cible cliquable → fiche.
 */

import { esc } from '../utils.js';
import { FACT_TYPES, fmt, fmtY, fmtShort, monthName, mondayOf, dayOfWeek, shortName, timelineToday } from './team_timeline_model.js';

const DOW = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const plural = (n, s, p = `${s}s`) => n > 1 ? p : s;
const chip = (m, cls) => `<span class="tls-person ${cls}${m.precise ? '' : ' is-approx'}${m.conflict ? ' is-conflict' : ''}" title="${esc(m.who)}${m.precise ? '' : ' — au changement de PI'}">${esc(shortName(m.who))}${m.kind === 'move-in' ? ` <small>← ${esc(m.from)}</small>` : m.kind === 'move-out' ? ` <small>→ ${esc(m.to)}</small>` : ''}${m.conflict ? ' ⚠️' : ''}</span>`;
const byKey = (list, key) => { const m = new Map(); list.forEach(x => { const k = key(x); (m.get(k) || m.set(k, []).get(k)).push(x); }); return m; };

/** Entrées datées du récit (déjà filtrées par catégorie). */
function entries(st, c) {
    const on = k => st.cats.has(k), E = [];
    if (on('rythme')) {
        c.pis.filter(p => p.start >= st.A).forEach(p => E.push({ day: p.start, cat: 'rythme', divider: true, label: `🧭 Début du PI ${p.n}` }));
        byKey(c.milestones, m => m.day).forEach((ms, day) => E.push({ day, cat: 'rythme', title: `🚩 ${ms.map(m => m.title.replace(/^ERPC - /, '')).join(' · ')}`, sub: 'Train ERPC',
            item: { kind: 'milestone', cat: 'rythme', items: ms, title: ms.length > 1 ? `${ms.length} jalons du train` : ms[0].title, when: fmt(day) } }));
    }
    if (on('presence')) c.low.forEach(p => {
        // Histogramme : une barre par semaine, SCINDÉE en deux — rouge = congés (haut), vert = disponibles
        // (bas) — surmontée du % de congés en rouge ; dessous, le lundi de la semaine et « absents/équipe »
        // (vue Train : absents et effectifs de toutes les équipes additionnés)
        const bars = c.presence.filter(s => s.week >= p.start && s.week <= p.end && s.pct !== null)
            .map(s => `<span class="tls-bar" style="--p:${s.pct}" title="${esc(`Semaine du ${fmtY(s.week)} : ${s.pct} % en congés, ${100 - s.pct} % disponibles${s.size ? ` — ${s.away} personne(s) sur ${s.size} en congé au moins un jour` : ''}${s.holidays?.length ? ` · 🎌 férié${s.holidays.length > 1 ? 's' : ''} (non compté${s.holidays.length > 1 ? 's' : ''}) : ${s.holidays.map(h => `${h.name} ${fmt(h.day)}`).join(', ')}` : ''}`)}">
                <small class="tls-bar-pct">${s.pct} %</small><span class="tls-bar-col"><b class="tls-bar-off"></b><i class="tls-bar-on"></i></span>
                <small class="tls-bar-day">${DOW[dayOfWeek(s.week)]}<br>${fmtShort(s.week)}</small>${s.size ? `<small class="tls-bar-who">${s.away}/${s.size}</small>` : ''}${s.holidays?.length ? `<small class="tls-bar-hol">🎌 ${s.holidays.length}</small>` : ''}</span>`).join('');
        E.push({ day: p.start, end: p.end, cat: 'presence', title: `🏖️ ${p.label}`, sub: `${p.weeks} semaines · ${p.avg} % d’absence en moyenne · pic ${p.peak} % (sem. du ${fmt(p.peakWeek)})`,
            extra: `<div class="tls-spark">${bars}</div>`, item: { kind: 'low', cat: 'presence', low: p, title: `${p.label} — pic ${p.peak} %`, when: `${fmt(p.start)} → ${fmt(p.end)}` } });
    });
    if (on('production')) c.incidents.forEach(x => E.push({ day: x.day, cat: 'production', title: `🚨 ${x.count} ${plural(x.count, 'incident')} de production`,
        sub: `Semaine du ${fmt(x.week)}`, extra: `<ul class="tls-list">${x.items.slice(0, 2).map(i => `<li>${esc(i.title.slice(0, 110))}${i.title.length > 110 ? '…' : ''}</li>`).join('')}${x.count > 2 ? `<li class="tls-more">+ ${x.count - 2} autres</li>` : ''}</ul>`,
        item: { kind: 'incidents', cat: 'production', items: x.items, title: `${x.count} ${plural(x.count, 'incident')} de production`, when: `Semaine du ${fmt(x.week)}` } }));
    if (on('livraison')) byKey(c.releases, r => mondayOf(r.day)).forEach((rs, w) => {
        const items = rs.flatMap(r => r.items);
        E.push({ day: rs[0].day, cat: 'livraison', title: `🚀 ${items.length} ${plural(items.length, 'créneau', 'créneaux')} de MEP`,
            sub: `Semaine du ${fmt(w)} · ${[...new Set(items.map(i => i.cal.replace(/^ERPC - /, '')))].join(', ')}`,
            item: { kind: 'releases', cat: 'livraison', items, title: 'Mises en production', when: `Semaine du ${fmt(w)}` } });
    });
    if (on('operations')) byKey(c.operations, o => mondayOf(o.day)).forEach((os, w) => {
        const prod = os.filter(o => o.prod).length;
        E.push({ day: os[0].day, cat: 'operations', title: `⚙️ ${os.length} ${plural(os.length, 'opération')}${prod ? ` · ⚠️ ${prod} en production` : ''}`, sub: `Semaine du ${fmt(w)} · ${[...new Set(os.map(o => o.cal))].join(', ')}`,
            extra: `<ul class="tls-list">${os.slice(0, 3).map(o => `<li${o.prod ? ' class="is-prod"' : ''}>${esc(fmt(o.day))}${o.time ? ` ${esc(o.time.replace(':', 'h'))}` : ''} — ${esc(o.title.slice(0, 100))}</li>`).join('')}${os.length > 3 ? `<li class="tls-more">+ ${os.length - 3} autres</li>` : ''}</ul>`,
            item: { kind: 'ops', cat: 'operations', items: os, title: `${os.length} ${plural(os.length, 'opération')}`, when: `Semaine du ${fmt(w)}` } });
    });
    if (on('equipe')) byKey(c.moves, m => m.day).forEach((ms, day) => {
        const grp = (ks, cls, lbl) => { const g = ms.filter(m => ks.includes(m.kind)); return g.length ? `<div class="tls-people"><span class="tls-people-lbl ${cls}">${lbl}</span>${g.map(m => chip(m, cls)).join('')}</div>` : ''; };
        const approx = ms.every(m => !m.precise);
        E.push({ day, cat: 'equipe', title: approx ? `👥 Changement de roster au début du PI ${ms[0].pi}` : '👥 Arrivées et départs',
            sub: approx ? 'Constaté au changement de PI — date exacte inconnue' : 'Check-lists d’onboarding / offboarding',
            extra: grp(['in'], 'is-in', '▲ Arrivée') + grp(['out'], 'is-out', '▼ Départ') + grp(['move-in', 'move-out'], 'is-move', '⇄ Mobilité'),
            item: { kind: 'moves', cat: 'equipe', moves: ms, title: `${ms.length} ${plural(ms.length, 'mouvement')}`, when: fmt(day) } });
    });
    if (on('oneonone')) {
        const today = timelineToday();
        byKey(c.ones, o => mondayOf(o.day)).forEach((os, w) => {
            const planned = os.every(o => o.day > today);
            E.push({ day: os[0].day, cat: 'oneonone', planned, title: `💬 ${os.length} 1v1${planned ? ` ${plural(os.length, 'planifié')}` : ''}`, sub: `Semaine du ${fmt(w)}`,
                extra: `<p class="tls-note">${os.map(o => esc(o.pair)).join(' · ')}</p>`,
                item: { kind: 'ones', cat: 'oneonone', items: os, title: `${os.length} 1v1`, when: `Semaine du ${fmt(w)}` } });
        });
    }
    if (on('charge')) c.support.filter(w => w.tickets.length + w.tasks.length).forEach(w => {
        const n = w.tickets.length + w.tasks.length;
        E.push({ day: w.week, cat: 'charge', title: `🛎️ Support — ${w.tickets.length} ${plural(w.tickets.length, 'ticket')} · ${w.tasks.length} ${plural(w.tasks.length, 'tâche')} de suivi`, sub: `Semaine du ${fmt(w.week)}`,
            extra: `<ul class="tls-list">${[...w.tickets.map(t => `${t.boarding ? '🧳' : '🎫'} ${t.title}`), ...[...w.tasks].sort((a, b) => b.streak - a.streak).map(k => `${k.done ? '✅' : '🧩'} ${k.text}${k.streak > 1 ? ` — 🔁 ${k.streak} semaines` : ''}`)].slice(0, 3).map(x => `<li>${esc(x.slice(0, 110))}</li>`).join('')}${n > 3 ? `<li class="tls-more">+ ${n - 3} autres</li>` : ''}</ul>`,
            item: { kind: 'support', cat: 'charge', week: w, title: `Support — ${n} ${plural(n, 'élément')}`, when: `Semaine du ${fmt(w.week)}` } });
    });
    c.facts.forEach(f => {
        const cat = f.type === 'incident' ? 'production' : 'fait';
        if (!on(cat)) return;
        const t = FACT_TYPES[f.type] || FACT_TYPES.other;
        E.push({ day: f.start, end: f.end !== f.start ? f.end : null, cat, manual: true, title: `${t.emoji} ${f.title}`,
            sub: `${t.label} · ${f.author ? `ajouté par ${f.author}` : 'saisi à la main'}`, extra: f.note ? `<p class="tls-note">${esc(f.note)}</p>` : '',
            item: { kind: 'fact', cat, fact: f, title: `${t.emoji} ${f.title}`, when: f.start === f.end ? fmt(f.start) : `${fmt(f.start)} → ${fmt(f.end)}` } });
    });
    return E.filter(e => (e.day >= st.A && e.day <= st.B) || (e.end && e.end >= st.A && e.day <= st.B))
        .sort((a, b) => a.day.localeCompare(b.day) || (b.divider ? 1 : 0) - (a.divider ? 1 : 0));
}

export function storyHtml(st, c, target) {
    const E = entries(st, c);
    if (!E.length) return '<div class="tl-state"><div class="tl-state-ico">🌤️</div><h5>Rien de marquant sur cette période</h5><p>Élargissez la période ou réactivez des catégories.</p></div>';
    return `<div class="tls">${[...byKey(E, e => e.day.slice(0, 7))].map(([m, es]) => {
        const n = cat => es.filter(e => e.cat === cat && !e.divider).length;
        const bilan = [n('equipe') && `${n('equipe')} 👥`, n('production') && `${n('production')} 🚨`, n('livraison') && `${n('livraison')} 🚀`,
            n('operations') && `${n('operations')} ⚙️`, n('charge') && `${n('charge')} 🛎️`, n('oneonone') && `${n('oneonone')} 💬`, n('presence') && '🏖️'].filter(Boolean).join(' · ');
        return `<section class="tls-month"><h5 class="tls-mhead"><span>${esc(`${monthName(m + '-01')} ${m.slice(0, 4)}`)}</span><small>${bilan}</small></h5>
            ${es.map(e => e.divider ? `<div class="tls-divider" data-c="${e.cat}"><span>${esc(e.label)} — ${fmt(e.day)}</span></div>`
                : `<div class="tls-entry" data-c="${e.cat}">
                    <div class="tls-date"><b>${+e.day.slice(8, 10)}</b><span>${DOW[dayOfWeek(e.day)]}</span></div>
                    <div class="tls-dot" aria-hidden="true"></div>
                    <div class="tls-card${e.manual ? ' is-manual' : ''}${e.planned ? ' is-planned' : ''}" role="button" tabindex="0" ${target(e.item)}>
                        <b class="tls-title">${esc(e.title)}</b>
                        <span class="tls-sub">${e.end ? `${fmt(e.day)} → ${fmt(e.end)} · ` : ''}${esc(e.sub || '')}</span>
                        ${e.extra || ''}
                    </div>
                </div>`).join('')}
        </section>`;
    }).join('')}</div>`;
}
