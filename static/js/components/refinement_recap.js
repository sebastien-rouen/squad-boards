/**
 * Récap de la séance d'affinage (page 🃏 Affinage) — à partager à l'équipe après la séance.
 *
 * Un MODÈLE unique (`refinementRecapModel`) alimente trois rendus qui disent la même chose :
 *   • Slack (mrkdwn : *gras*, <url|lien>) ;
 *   • Teams / mail : HTML à styles EN LIGNE (les clients mail ignorent les feuilles de style), copié
 *     en `text/html` + `text/plain` de secours ;
 *   • CSV (un ticket par ligne, `arrayToCsv`).
 * Ce qu'il faut rappeler : ce qui a été estimé (votes → valeur), la répartition des tailles, et les
 * points d'attention — désaccords à rediscuter, gros tickets à découper, tickets longs à estimer —,
 * puis ce qui reste à estimer.
 */
import { store } from '../state.js';
import { esc, toast, arrayToCsv, copyToClipboard } from '../utils.js';

const ANIMALS = { 1: '🐭', 2: '🐇', 3: '🦊', 5: '🐶', 8: '🐴', 13: '🐘', 21: '🐋' };
const SLOW_MIN = 10;     // au-delà, « a pris du temps »
const BIG_PTS = 13;      // à partir de là, « à découper ? »
const SPLIT_SIGMA = 4;   // même seuil que la popin Poker (« fort désaccord »)

const _fmt1 = n => String(Math.round(n * 10) / 10).replace('.', ',');
const _hhmm = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * @param {object} o
 * @param {string}   o.team
 * @param {object[]} o.rounds  tours du jour, du plus ANCIEN au plus récent, avec `minutes` (cf. refinement.js)
 * @param {{t: object, group: string}[]} o.queue  file restante (`estimationQueue`)
 */
export function refinementRecapModel({ team, rounds, queue }) {
    const tickets = store.get('tickets') || [];
    const jira = store.get('jiraUrl');
    const items = rounds.map(r => {
        const t = tickets.find(x => x.id === r.ticketId);
        const nums = (r.votes || []).map(v => Number(v.value)).filter(Number.isFinite);
        return {
            id: r.ticketId, title: t?.title || '', url: jira ? `${jira}/browse/${r.ticketId}` : '',
            value: r.value, votes: r.votes || [], min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null,
            spread: r.spread, split: r.spread != null && r.spread >= SPLIT_SIGMA, unanimous: r.spread === 0 && r.voters > 1,
            minutes: r.minutes, at: r.createdAt,
        };
    });
    const timed = items.filter(i => i.minutes != null);
    const sizes = {};
    items.forEach(i => { sizes[i.value] = (sizes[i.value] || 0) + 1; });
    const voters = [...new Set(items.flatMap(i => i.votes.map(v => v.voter)).filter(Boolean))];
    const first = items[0]?.at, last = items.at(-1)?.at;
    return {
        team,
        date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        start: first ? _hhmm(first) : '', end: last ? _hhmm(last) : '',
        duration: first && last ? Math.round((Date.parse(last) - Date.parse(first)) / 60000) : null,
        items,
        total: items.reduce((s, i) => s + (Number(i.value) || 0), 0),
        avgMin: timed.length ? timed.reduce((s, i) => s + i.minutes, 0) / timed.length : null,
        sizes: Object.entries(sizes).map(([v, n]) => ({ v: Number(v), n })).sort((a, b) => a.v - b.v),
        voters,
        splits: items.filter(i => i.split),
        big: items.filter(i => i.value >= BIG_PTS),
        slow: items.filter(i => i.minutes != null && i.minutes > SLOW_MIN),
        unanimous: items.filter(i => i.unanimous).length,
        remaining: queue.length,
        remainingSprint: queue.filter(x => x.group === 'sprint').length,
        next: queue[0]?.t || null,
    };
}

const _sizesTxt = m => m.sizes.map(s => `${ANIMALS[s.v] || ''} ${s.v} pts ×${s.n}`).join(' · ');
const _votesTxt = i => i.votes.map(v => v.value).join(' · ');

/** Slack (mrkdwn). */
export function recapSlack(m) {
    const link = i => (i.url ? `<${i.url}|${i.id}>` : i.id);
    const L = [];
    L.push(`🃏 *Séance d'affinage — ${m.team}* · ${m.date}${m.start ? ` · ${m.start} → ${m.end}${m.duration ? ` (${m.duration} min)` : ''}` : ''}`);
    L.push(`✅ *${m.items.length} ticket${m.items.length > 1 ? 's' : ''} estimé${m.items.length > 1 ? 's' : ''}* · ${m.total} pts${m.avgMin != null ? ` · ⏱ ${Math.max(1, Math.round(m.avgMin))} min / ticket` : ''}${m.voters.length ? ` · 👥 ${m.voters.length} participant${m.voters.length > 1 ? 's' : ''}` : ''}`);
    L.push('', '*Estimés*');
    m.items.forEach(i => L.push(`• ${link(i)} ${i.title} → *${i.value} pts* (${_votesTxt(i)})${i.split ? ' ⚠️ désaccord' : i.unanimous ? ' 🎯' : ''}`));
    if (m.sizes.length) L.push('', `*Répartition* : ${_sizesTxt(m)}`);
    if (m.splits.length || m.big.length || m.slow.length) L.push('', '*Points d\'attention*');
    if (m.splits.length) L.push(`⚠️ À rediscuter (fort désaccord) : ${m.splits.map(i => `${link(i)} (${i.min} ↔ ${i.max})`).join(', ')}`);
    if (m.big.length) L.push(`✂️ À découper ? (≥ ${BIG_PTS} pts) : ${m.big.map(i => `${link(i)} (${i.value} pts)`).join(', ')}`);
    if (m.slow.length) L.push(`⏳ Longs à estimer (> ${SLOW_MIN} min) : ${m.slow.map(i => `${link(i)} (${Math.round(i.minutes)} min)`).join(', ')} — besoin d'un affinage en amont ?`);
    L.push('', m.remaining
        ? `📋 *Reste à estimer* : ${m.remaining} ticket${m.remaining > 1 ? 's' : ''}${m.remainingSprint ? ` (dont ${m.remainingSprint} dans le sprint en cours)` : ''}${m.next ? ` — prochain : ${m.next.id} ${m.next.title || ''}` : ''}`
        : '🎉 *Plus rien à estimer* pour l\'équipe !');
    return L.join('\n');
}

/** Texte brut (secours du collage Teams / mail, CSV mis à part). */
const _plain = m => recapSlack(m).replace(/<([^|>]+)\|([^>]+)>/g, '$2').replace(/\*/g, '');

/** HTML à styles en ligne — Teams, Outlook, Gmail. */
export function recapHtml(m) {
    const td = 'padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;';
    const link = i => (i.url ? `<a href="${esc(i.url)}" style="color:#2563eb;text-decoration:none;font-family:monospace;white-space:nowrap">${esc(i.id)}</a>` : `<span style="font-family:monospace;white-space:nowrap">${esc(i.id)}</span>`);
    const att = [];
    if (m.splits.length) att.push(`⚠️ <b>À rediscuter</b> (fort désaccord) : ${m.splits.map(i => `${link(i)} (${i.min} ↔ ${i.max})`).join(', ')}`);
    if (m.big.length) att.push(`✂️ <b>À découper ?</b> (≥ ${BIG_PTS} pts) : ${m.big.map(i => `${link(i)} (${i.value} pts)`).join(', ')}`);
    if (m.slow.length) att.push(`⏳ <b>Longs à estimer</b> (> ${SLOW_MIN} min) : ${m.slow.map(i => `${link(i)} (${Math.round(i.minutes)} min)`).join(', ')} — besoin d'un affinage en amont ?`);
    return `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827;line-height:1.45">
        <p style="margin:0 0 4px;font-size:16px"><b>🃏 Séance d'affinage — ${esc(m.team)}</b></p>
        <p style="margin:0 0 10px;color:#6b7280;font-size:13px">${esc(m.date)}${m.start ? ` · ${esc(m.start)} → ${esc(m.end)}${m.duration ? ` (${m.duration} min)` : ''}` : ''}</p>
        <p style="margin:0 0 10px;font-size:14px">✅ <b>${m.items.length} ticket${m.items.length > 1 ? 's' : ''} estimé${m.items.length > 1 ? 's' : ''}</b> · ${m.total} pts${m.avgMin != null ? ` · ⏱ ${Math.max(1, Math.round(m.avgMin))} min / ticket` : ''}${m.voters.length ? ` · 👥 ${m.voters.length} participant${m.voters.length > 1 ? 's' : ''}` : ''}</p>
        <table style="border-collapse:collapse;margin:0 0 10px">
            <tr><th style="${td}text-align:left;color:#6b7280;font-size:11px">Ticket</th><th style="${td}text-align:left;color:#6b7280;font-size:11px">Titre</th><th style="${td}text-align:left;color:#6b7280;font-size:11px">Votes</th><th style="${td}text-align:right;color:#6b7280;font-size:11px">Retenu</th></tr>
            ${m.items.map(i => `<tr><td style="${td}">${link(i)}</td><td style="${td}">${esc(i.title)}</td><td style="${td}color:#6b7280">${esc(_votesTxt(i))}${i.split ? ' ⚠️' : i.unanimous ? ' 🎯' : ''}</td><td style="${td}text-align:right"><b>${i.value} pts</b></td></tr>`).join('')}
        </table>
        ${m.sizes.length ? `<p style="margin:0 0 10px;font-size:13px"><b>Répartition</b> : ${esc(_sizesTxt(m))}</p>` : ''}
        ${att.length ? `<p style="margin:0 0 4px;font-size:13px"><b>Points d'attention</b></p><ul style="margin:0 0 10px;padding-left:18px;font-size:13px">${att.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
        <p style="margin:0;font-size:13px">${m.remaining
            ? `📋 <b>Reste à estimer</b> : ${m.remaining} ticket${m.remaining > 1 ? 's' : ''}${m.remainingSprint ? ` (dont ${m.remainingSprint} dans le sprint en cours)` : ''}${m.next ? ` — prochain : ${esc(m.next.id)} ${esc(m.next.title || '')}` : ''}`
            : '🎉 <b>Plus rien à estimer</b> pour l\'équipe !'}</p>
    </div>`;
}

/** Copie Teams / mail : HTML riche + texte brut de secours. */
export async function copyRecapRich(m) {
    const html = recapHtml(m), text = _plain(m);
    try {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('presse-papiers riche indisponible');
        await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
        toast('Récap copié — collez-le dans Teams ou un mail', 'success');
    } catch {
        copyToClipboard(text, 'Récap copié (texte)');
    }
}

/** CSV : un ticket estimé par ligne. */
export function downloadRecapCsv(m) {
    const rows = m.items.map(i => ({
        'Heure': _hhmm(i.at), 'Ticket': i.id, 'Titre': i.title, 'Retenu (pts)': i.value,
        'Votes': i.votes.map(v => `${v.voter}: ${v.value}`).join(' | '),
        'Min': i.min ?? '', 'Max': i.max ?? '', 'Écart-type': i.spread != null ? _fmt1(i.spread) : '',
        'Désaccord fort': i.split ? 'oui' : '', 'Durée (min)': i.minutes != null ? Math.round(i.minutes) : '',
        'Lien': i.url,
    }));
    const blob = new Blob([arrayToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `affinage-${m.team.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Message « à compléter avant la séance » (page Affinage, bouton 📋) : tickets 📝 sans description /
 * ⚠️ story sans critère d'acceptation, REGROUPÉS PAR RAPPORTEUR (la personne à relancer), le sprint en
 * cours signalé en premier. Slack (mrkdwn) ; les noms restent en clair (pas d'identifiant Slack connu).
 * @param {string} team
 * @param {{ t: object, group: string, status: 'empty'|'missing' }[]} items  dans l'ordre de la file
 */
export function toCompleteSlack(team, items) {
    const jira = store.get('jiraUrl');
    const link = t => (jira ? `<${jira}/browse/${t.id}|${t.id}>` : t.id);
    const short = s => { const t = String(s || '').trim(); return t.length > 70 ? `${t.slice(0, 68).trim()}…` : t; };
    const byWho = new Map();
    for (const it of items) {
        const who = it.t.reporter || 'Rapporteur inconnu';
        if (!byWho.has(who)) byWho.set(who, []);
        byWho.get(who).push(it);
    }
    const groups = [...byWho].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'fr'));
    const L = [
        `📝 *Affinage ${team} — ${items.length} ticket${items.length > 1 ? 's' : ''} à compléter avant la séance*`,
        'Merci de compléter vos tickets (description, critères d\'acceptation, feature parente, porteur) 🙏 — on pourra les estimer sereinement.',
    ];
    for (const [who, list] of groups) {
        L.push('', `*${who}* (${list.length})`);
        for (const it of list) {
            // `missing` (3.243.0) = points de contrôle manquants du badge ✨ ; repli : état des critères seul
            const what = it.missing?.length ? `manque : ${it.missing.map(c => `${c.icon} ${c.label.toLowerCase()}`).join(', ')}`
                : it.status === 'empty' ? '📝 sans description' : '⚠️ sans critères d\'acceptation';
            L.push(`• ${link(it.t)} ${short(it.t.title)} — ${what}${it.group === 'sprint' ? ' · 🏃 sprint en cours' : ''}`);
        }
    }
    L.push('', '_Critère d\'acceptation = une condition vérifiable : « Étant donné… Lorsque… Alors… », ou une liste de résultats attendus._');
    return L.join('\n');
}
