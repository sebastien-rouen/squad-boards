/**
 * Bulle (fiche) d'un repère de la frise des faits marquants — extrait de team_timeline.js (3.180.0).
 *
 * Toutes les lignes suivent un même gabarit (`li`) : pastille de tête (date, heure, icône) teintée à la
 * couleur de la catégorie, texte principal, étiquettes alignées à droite ; sous-titres de section
 * (`head`) ; mouvements de personnes GROUPÉS PAR ÉQUIPE (pastille de l'équipe, compteurs ▲ ▼ ⇄,
 * personnes en puces colorées). Les clés de ticket sont cliquables (popin du ticket).
 */

import { esc } from '../utils.js';
import { teamColor } from './team_calendar.js';
import { FACT_TYPES, fmt, fmtShort, diff, timelineToday } from './team_timeline_model.js';

/** Ligne de bulle : { lead: tête, main: texte, tags: étiquettes, cls: variante (is-prod, is-done…) }. */
const li = ({ lead = '', main = '', tags = '', cls = '' }) => `<li class="tl-li${cls ? ` ${cls}` : ''}">${lead ? `<span class="tl-li-lead">${lead}</span>` : ''}<span class="tl-li-main">${main}</span>${tags ? `<span class="tl-li-tags">${tags}</span>` : ''}</li>`;
const head = html => `<li class="tl-li-head">${html}</li>`;
const tag = txt => `<span class="tl-tag">${esc(txt)}</span>`;
/** Texte échappé dont les URL brutes deviennent un lien court « 🔗 github.com » (les tâches du suivi en
 *  collent de très longues, qui écrasaient la bulle). */
const text = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => {
    const host = (u.match(/^https?:\/\/([^/?#]+)/) || [])[1] || 'lien';
    return `<a class="tl-link" href="${u}" target="_blank" rel="noopener noreferrer" title="${u}">🔗 ${host.replace(/^www\./, '')}</a>`;
});
/** Clé de ticket CLIQUABLE → la popin du ticket, la même que sur le board (window.__squadBoard). */
const ticketTag = id => `<button type="button" class="tl-tag tl-ticket" data-ticket="${esc(id)}" title="${esc(`Ouvrir le ticket ${id}`)}">${esc(id)}</button>`;
/** « jour J », « J+1 », « J-2 » (écart en jours entre une MEP et un incident). */
const relDay = (n, sign) => n ? `J${sign}${n}` : 'jour J';

// ── Mouvements de personnes ─────────────────────────────────────────────────────
const KIND = { in: ['in', '▲', 'Arrivée'], out: ['out', '▼', 'Départ'], 'move-in': ['move', '⇄', 'Mobilité'], 'move-out': ['move', '⇄', 'Mobilité'] };
const person = m => {
    const [cls, sym] = KIND[m.kind];
    const dest = m.kind === 'move-out' ? ` → ${m.to}` : m.kind === 'move-in' ? ` ← ${m.from}` : '';
    // Puce = bouton : ouvre la fiche membre (Atlas) de la personne
    return `<button type="button" class="tl-person is-${cls}${m.precise ? '' : ' is-approx'}" data-member="${esc(m.who)}" title="${esc(`${KIND[m.kind][2]} : ${m.who}${dest} — ${m.precise ? fmt(m.day) : `au changement de PI (${fmt(m.day)})`} · voir sa fiche`)}"><i>${sym}</i>${esc(m.who)}${dest ? `<small>${esc(dest)}</small>` : ''}<small>${fmtShort(m.day)}${m.precise ? '' : ' · PI'}</small></button>`;
};
const counts = ms => ['in', 'out', 'move'].map(k => { const n = ms.filter(m => KIND[m.kind][0] === k).length;
    return n ? `<b class="tl-k-${k}">${KIND[Object.keys(KIND).find(x => KIND[x][0] === k)][1]} ${n}</b>` : ''; }).join('');

/** « 22 mouvements » (vue Train) : un bloc par équipe, les plus concernées d'abord. */
function movesByTeam(moves) {
    const by = new Map();
    moves.forEach(m => { const t = m.team || ''; (by.get(t) || by.set(t, []).get(t)).push(m); });
    // Équipes d'abord (les plus concernées en tête), « Hors équipes suivies » toujours en dernier
    return [...by].sort((a, b) => !a[0] - !b[0] || b[1].length - a[1].length || a[0].localeCompare(b[0], 'fr')).map(([team, ms]) =>
        `<li class="tl-group"><div class="tl-group-head"><span class="tl-team-dot" style="--team:${team ? teamColor(team) : 'var(--border)'}"></span>
            <b>${esc(team || 'Hors équipes suivies')}</b><span class="tl-group-counts">${counts(ms)}</span></div>
            <div class="tl-people">${ms.map(person).join('')}</div></li>`).join('');
}

// ── Support ─────────────────────────────────────────────────────────────────────
function supportRows(w) {
    const tix = w.tickets.map(t => li({ lead: fmtShort(t.day), main: `${t.boarding ? '🧳 ' : ''}${text(t.title)}`, tags: `${ticketTag(t.id)}${tag(t.status)}` })).join('');
    // Tâches reportées d'abord (les plus anciennes en tête) : « Reboot des vm — 🔁 3 semaines · depuis le 07/09 »
    const carried = w.tasks.filter(k => k.streak > 1);
    const tasks = [...w.tasks].sort((a, b) => b.streak - a.streak).map(k => li({
        lead: k.done ? '✅' : '🧩', cls: k.done ? 'is-done' : '', main: text(k.text),
        tags: `${k.streak > 1 ? `<span class="tl-carry"${k.streak >= 3 ? ' data-lvl="high"' : ''} title="${esc(`Présente dans le suivi ${k.streak} semaines d'affilée, depuis la semaine du ${fmt(k.since)}`)}">🔁 ${k.streak} sem. · depuis le ${fmtShort(k.since)}</span>` : ''}${ticketTag(k.ticket)}`,
    })).join('');
    // « 31.1.2 » = PI 31 · itération 1 · semaine 2
    const where = [...new Set(w.tasks.map(k => k.label))].map(l => { const [pi, it, wk] = l.split('.'); return `${l} · PI ${pi}, itération ${it}, semaine ${wk}`; }).join(' / ');
    return `${tix ? head(`🎫 ${w.tickets.length} ticket${w.tickets.length > 1 ? 's' : ''} Support`) + tix : ''}${tasks
        ? head(`🧩 ${w.tasks.length} tâche${w.tasks.length > 1 ? 's' : ''} du ticket de suivi${carried.length ? ` <span class="tl-carry">🔁 ${carried.length} reportée${carried.length > 1 ? 's' : ''}</span>` : ''}<small>${esc(where)}</small>`) + tasks : ''}`;
}

// ── Bulle ───────────────────────────────────────────────────────────────────────
/** HTML de la bulle du repère sélectionné (`st.selectedItem`), ou ''. */
export function detailHtml(st) {
    const it = st.selectedItem;
    if (!it) return '';
    let rows = '', actions = '';
    const showTeam = st.scope === 'train' || st.laneTrain?.has('production');
    if (it.kind === 'incidents') rows = it.items.map(i => li({ lead: fmtShort(i.day), main: text(i.title), tags: `${ticketTag(i.id)}${tag(i.status)}${showTeam ? tag(i.team) : ''}` })).join('');
    else if (it.kind === 'releases') rows = it.items.map(r => li({ lead: '◆', main: esc(r.title), tags: tag(r.cal.replace(/^ERPC - /, '')) })).join('');
    else if (it.kind === 'move') {
        const m = it.move, [cls, sym] = KIND[m.kind];
        const what = { in: 'Arrivée', out: 'Départ', 'move-in': `Mobilité : vient de ${m.from}`, 'move-out': `Mobilité : part vers ${m.to}` }[m.kind];
        rows = li({ lead: sym, cls: `is-k-${cls}`, main: `<b>${esc(what)}</b>`, tags: m.team ? tag(m.team) : '' })
            + li({ lead: '👤', main: `<button type="button" class="tl-member-link" data-member="${esc(m.who)}">${esc(m.who)}</button>`, tags: '<span class="tl-tag">fiche membre</span>' })
            + li({ lead: m.precise ? '📋' : '🗓️', main: m.precise ? `Check-list ${m.kind.endsWith('in') ? 'd’onboarding' : 'd’offboarding'} du ${fmt(m.checklist)}` : `Constaté au changement de PI (début du PI ${m.pi}) — date exacte inconnue` })
            + (m.onlyChecklist ? li({ lead: 'ℹ️', main: 'Absent des rosters de PI : personne hors des équipes suivies, ou roster à compléter' }) : '')
            + (m.conflict ? li({ lead: '⚠️', cls: 'is-warn', main: 'À vérifier : une entrée et une sortie de cette personne à moins de 45 jours' }) : '');
    } else if (it.kind === 'moves') rows = movesByTeam(it.moves);
    else if (it.kind === 'ones') rows = it.items.map(o => li({ lead: fmtShort(o.day), main: esc(o.pair), tags: o.day > timelineToday() ? tag('planifié') : '', cls: o.day > timelineToday() ? 'is-planned' : '' })).join('');
    else if (it.kind === 'low') rows = li({ lead: '📆', main: `${it.low.weeks} semaines à <b>${it.low.avg} %</b> de congés en moyenne` }) + li({ lead: '📈', main: `Pic : <b>${it.low.peak} %</b> la semaine du ${fmt(it.low.peakWeek)}` });
    else if (it.kind === 'ops') rows = it.items.map(o => li({ lead: `${fmtShort(o.day)}${o.time ? `<small>${esc(o.time.replace(':', 'h'))}</small>` : ''}`, main: esc(o.title), cls: o.prod ? 'is-prod' : '', tags: o.prod ? '<span class="tl-tag is-prod">⚠️ production</span>' : '' })).join('');
    else if (it.kind === 'support') rows = supportRows(it.week);
    else if (it.kind === 'milestone') rows = it.items.map(m => li({ lead: fmtShort(m.day), main: esc(m.title) })).join('');
    else if (it.kind === 'fact') {
        const f = it.fact;
        rows = (f.note ? li({ lead: '📝', main: text(f.note) }) : '')
            + li({ lead: FACT_TYPES[f.type].emoji, main: FACT_TYPES[f.type].label, tags: tag(f.teams.length ? f.teams.join(', ') : 'tout le train') })
            + li({ lead: '✍️', main: f.author ? `Ajouté par <b>${esc(f.author)}</b>` : 'Auteur inconnu', tags: f.createdAt ? tag(fmt(f.createdAt)) : '' });
        // Modifier (contour) > Supprimer (discret) : l'action destructive n'est pas mise en avant
        actions = `<div class="tl-detail-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="del-fact" data-id="${esc(f.id)}">🗑️ Supprimer</button><button type="button" class="btn btn-secondary btn-sm" data-act="edit-fact">✏️ Modifier</button></div>`;
    }
    // Alertes en tête : MEP suivie d'un incident (48 h), incident après une MEP, opération en production le même jour
    let alerts = '';
    if (it.clash?.length) alerts += li({ lead: '⚠️', cls: 'tl-clash is-warn', main: `<b>Opération en production le même jour</b><br>${it.clash.map(o => `${esc(fmtShort(o.day))} ${esc(o.title)}`).join('<br>')}` });
    if (it.afterMep?.length) alerts += li({ lead: '🚀', cls: 'tl-clash', main: `<b>Après une MEP</b><br>${it.afterMep.map(i => `${esc(i.title.slice(0, 60))} : MEP du ${i.mep.map(d => `${fmtShort(d)} (${relDay(diff(d, i.day), '-')})`).join(', ')}`).join('<br>')}` });
    if (it.followed?.length) alerts += li({ lead: '🚨', cls: 'tl-clash is-warn', main: `<b>${it.followed.length} incident${it.followed.length > 1 ? 's' : ''} de production dans les 48 h</b><br>${it.followed.map(i => `${esc(fmtShort(i.day))} (${relDay(diff(i.mep, i.day), '+')}) ${esc(i.title.slice(0, 90))}`).join('<br>')}` });
    return `<div class="tl-detail" data-c="${it.cat}" role="dialog" aria-label="${esc(it.title)}" style="${st.detailPos || 'top:12px;right:12px'}">
        <div class="tl-detail-band"></div>
        <button type="button" class="tl-close" data-act="close" aria-label="Fermer">✕</button>
        <div class="tl-detail-body"><h4>${esc(it.title)}</h4><p class="tl-muted">${esc(it.when)}</p><ul>${alerts}${rows}</ul>${actions}</div>
    </div>`;
}
