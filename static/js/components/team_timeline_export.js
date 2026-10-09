/**
 * Export de la carte « Faits marquants » : bouton ⤓ Exporter → modale (catégories à inclure, format)
 * → image PNG (la vue courante, couloirs ou récit, mise en page d'export), Markdown groupé par
 * catégorie (fichier .md ou presse-papiers) ou texte Slack (le même Markdown converti : `toSlack`).
 *
 * PNG : html2canvas chargé à la demande depuis le CDN (même recette qu'Atlas et la revue de sprint).
 * ⚠️ Deux pièges html2canvas, corrigés DANS LE CLONE seulement (`onclone`) :
 *  - il ne lit pas `color(srgb …)`, la forme calculée de nos `color-mix()` → rgba() (`fixColors`) ;
 *  - il mesure la ligne de base des polices avec une <img> GIF en ligne, ajoutée au document
 *    D'ORIGINE (pas au clone) : le reset `img, svg { display: block }` de base.css la fausse → TOUT le
 *    texte dessiné 5 à 8 px trop bas (chiffres sortis des pastilles, ◆ sous leur compteur). Règle
 *    correctrice limitée à cette image-témoin, posée le temps de l'export (`METRICS_FIX`).
 */

import { esc, toast, copyToClipboard, exportChoiceModal } from '../utils.js';
import { store } from '../state.js';
import { CATS, FACT_TYPES, fmt, fmtY, fmtShort, monthName, diff, dayOfWeek, collectView, summary, timelineToday, mepFollowUps, onePeopleList, shortName } from './team_timeline_model.js';
import { lanesHtml } from './team_timeline_lanes.js';
import { teamColor } from './team_calendar.js';
import { zipStore } from '../utils/zip.js';
import { storyHtml } from './team_timeline_story.js';

const H2C = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
const DOW = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const plural = (n, s, p = `${s}s`) => n > 1 ? p : s;
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// ── Chiffres clés (partagés avec la carte) ─────────────────────────────────────
/** Tuile de chiffre clé : pastille d'icône teintée (couleur de la catégorie), libellé court, grand
 *  chiffre, détail facultatif. Valeur nulle ATTÉNUÉE (« 0 incident » ne doit pas crier). */
/** Couloir que chaque tuile isole au clic (la carte seulement ; l'image exportée garde des <div>). */
const KPI_CAT = { in: 'equipe', out: 'equipe', move: 'equipe', prod: 'production', rel: 'livraison', sup: 'charge', stale: 'charge', one: 'oneonone', abs: 'presence' };
let _isolated;                                              // couloir isolé pendant ce rendu (ou null / undefined)
const kpi = (k, ico, label, value, sub = '', zero = false) => {
    const cat = _isolated !== undefined && KPI_CAT[k];         // cliquable seulement dans la carte
    const open = cat ? `<button type="button" class="tl-kpi" data-kpi="${k}" data-kpi-cat="${cat}" aria-pressed="${_isolated === cat}"
        title="${esc(_isolated === cat ? 'Réafficher toutes les catégories' : `Afficher seulement : ${CATS[cat].label}`)}"` : `<div class="tl-kpi" data-kpi="${k}"`;
    return `${open}${zero ? ' data-zero' : ''}>
    <span class="tl-kpi-ico" aria-hidden="true">${ico}</span>
    <span class="tl-kpi-txt"><span class="tl-kpi-lbl">${esc(label)}</span>${value !== '' ? `<b>${value}</b>` : ''}${sub ? `<span class="tl-kpi-sub">${esc(sub)}</span>` : ''}</span>
${cat ? '</button>' : '</div>'}`;
};
/** `st` fourni (la carte) : tuiles cliquables, celle du couloir isolé enfoncée. Sans `st` (export) : statiques. */
export function kpisHtml(s, st) {
    _isolated = st ? (st.cats.size === 1 ? [...st.cats][0] : null) : undefined;
    const moves = s.movesIn + s.movesOut;
    // Les indicateurs à ZÉRO sont regroupés en une seule tuile discrète : ils ne volent plus la place
    // (et l'œil) des vraies informations — « ✓ Rien à signaler : arrivées · départs · incidents prod »
    const zeros = [[s.arrivals, 'arrivées'], [s.departures, 'départs'], [s.incidents, 'incidents prod'], [s.releases, 'MEP']]
        .filter(([n]) => !n).map(([, l]) => l);
    return [
        s.arrivals ? kpi('in', '▲', plural(s.arrivals, 'Arrivée'), `+${s.arrivals}`) : '',
        s.departures ? kpi('out', '▼', plural(s.departures, 'Départ'), `−${s.departures}`) : '',
        moves ? kpi('move', '⇄', plural(moves, 'Mobilité'), moves) : '',
        s.incidents ? kpi('prod', '🚨', 'Incidents prod', s.incidents) : '',
        s.releases ? kpi('rel', '🚀', 'Jours de MEP', s.releases) : '',
        s.supTickets + s.supTasks ? kpi('sup', '🛎️', 'Support', s.supTickets + s.supTasks,
            `${s.supTickets} ${plural(s.supTickets, 'ticket')}${s.supBoarding ? ` (${s.supBoarding} on/off)` : ''} · ${s.supTasks} ${plural(s.supTasks, 'tâche')}`) : '',
        s.stale ? kpi('stale', '⏳', s.stale > 1 ? 'Tâches qui traînent' : 'Tâche qui traîne', s.stale, '3 semaines ou plus') : '',
        s.ones ? kpi('one', '💬', '1v1', s.ones, `${s.onePeople} ${plural(s.onePeople, 'collaborateur')}${s.onesPlanned ? ` · ${s.onesPlanned} ${plural(s.onesPlanned, 'planifié')}` : ''}`) : '',
        s.peak && s.peak.pct !== null ? kpi('abs', '🏖️', 'Pic de congés', `${s.peak.pct}<small>%</small>`, `sem. du ${fmt(s.peak.week)}`, !s.peak.pct) : '',
        zeros.length ? kpi('none', '✓', 'Rien à signaler', '', zeros.join(' · '), true) : '',
    ].join('');
}
export const legendHtml = () => `<p class="tl-legend" aria-label="Légende de la présence"><span data-l="ok"></span>100 % présents <span data-l="mid"></span>75 à 99 % <span data-l="low"></span>moins de 75 % <i class="tl-legend-hol" aria-hidden="true"></i>jour férié (non compté)</p>`;

// ── Modale ─────────────────────────────────────────────────────────────────────
export async function openTimelineExport(st) {
    const c = collectView(st), s = summary(c);
    const counts = { rythme: c.pis.length + c.milestones.length, production: s.incidents, livraison: s.releases, operations: s.ops, charge: s.supTickets + s.supTasks,
        presence: c.presence.filter(w => w.pct).length, equipe: c.moves.length, oneonone: s.ones, fait: c.facts.length };
    const chipDef = teamChips(st, c);
    const fileName = est => {
        const teams = est.moveTeams?.size && (est.movesOpen || est.onesOpen) ? `-${[...est.moveTeams].map(t => slug(t || 'hors-equipes')).join('-')}` : '';
        return `faits-marquants-${slug(est.scope === 'train' ? 'train' : est.team)}${teams}-${st.A}_${st.B}`;
    };
    /** Une image : la vue courante (`team` absent) ou celle d'une équipe du train (portée Équipe, SES données). */
    const image = ({ keys, toggles, chips }, team) => {
        if (team === undefined) return { est: exportState(st, keys, toggles, chips), c, s };
        const v = { ...st, scope: 'team', team, laneTrain: new Set(), moveTeams: new Set() }, cv = collectView(v);
        return { est: exportState(v, keys, toggles, null), c: cv, s: summary(cv) };
    };
    /** Image montrée dans l'aperçu (et copiée) : la 1re en « une image par équipe ». */
    const first = pick => { const each = perTeamList(chipDef, pick); return { each, img: image(pick, each?.[0]) }; };
    /** Export, modale ouverte : le bouton « Exporter » montre l'avancement (⏳ 4/13…). */
    const run = async (picked, progress) => {
        if (!picked.keys.length) { toast('Choisis au moins une catégorie', 'warning'); return false; }
        const { each, img } = first(picked);
        try {
            if (each) {
                // Une image par équipe, rendues l'une après l'autre puis réunies dans UN .zip (une rafale de
                // téléchargements = une autorisation du navigateur et N fenêtres) ; une seule équipe → le PNG.
                // Le zip emporte aussi le Markdown de la vue (le train) : images et texte dans le même paquet.
                const files = [];
                for (const [i, t] of each.entries()) {
                    progress(each.length > 1 ? `⏳ ${i + 1}/${each.length} · ${t}` : '⏳ Génération…');
                    const im = image(picked, t);
                    files.push({ name: `${fileName(im.est)}.png`, blob: await renderPng(im.est, im.c, im.s) });
                }
                if (files.length === 1) { download(files[0].blob, files[0].name); toast('Image exportée', 'success'); return; }
                progress('⏳ Archive…');
                const view = image(picked).est;                         // la vue elle-même (le train), pas la 1re équipe
                files.push({ name: `${fileName(view)}.md`, blob: new Blob([toMarkdown(view, c, s)], { type: 'text/markdown;charset=utf-8' }) });
                download(await zipStore(files), `faits-marquants-par-equipe-${st.A}_${st.B}.zip`);
                toast(`${each.length} images + Markdown du train exportés dans un .zip`, 'success');
            } else if (picked.format === 'png') {
                progress('⏳ Génération…');
                await exportPng(img.est, c, s, fileName(img.est));
            } else {
                const md = toMarkdown(img.est, c, s);
                if (picked.format === 'md-copy') await copyToClipboard(md, 'Markdown copié');
                else if (picked.format === 'slack') await copyToClipboard(toSlack(md), 'Copié pour Slack');
                else { download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${fileName(img.est)}.md`); toast('Markdown exporté', 'success'); }
            }
        } catch (e) {
            toast(`Export impossible : ${e.message || e}`, 'error');
        }
    };
    await exportChoiceModal('Exporter les faits marquants', Object.entries(CATS).map(([k, v]) => ({ key: k, label: v.label, icon: v.emoji, count: counts[k] })), {
        message: `${st.scope === 'train' ? 'Tout le train' : st.team} · du ${fmtY(st.A)} au ${fmtY(st.B)}. Choisis les catégories et le format.`,
        confirmLabel: 'Exporter', initialSelected: [...st.cats], onConfirm: run,
        formats: [{ key: 'png', label: `🖼️ Image PNG (${st.view === 'story' ? 'récit' : 'couloirs'})` },
            { key: 'md', label: '📝 Markdown (.md)' }, { key: 'md-copy', label: '📋 Markdown copié' }, { key: 'slack', label: '💬 Copier pour Slack' }],
        // Image : couloirs dépliés ou non, indépendamment de l'écran (partent de son état) ; aperçu réduit
        // de ce qui sera pris, recalculé à chaque changement (catégories, format, dépliage).
        toggles: [
            st.view !== 'story' && c.moves.length ? { key: 'movesOpen', label: `👥 Déplier arrivées / départs (${c.moves.length})`, on: !!st.movesOpen, formats: IMG } : null,
            st.view !== 'story' && c.ones.length ? { key: 'onesOpen', label: `💬 Déplier 1v1 (${c.ones.length})`, on: !!st.onesOpen, formats: IMG } : null,
            // Vue Train : une image par équipe (sa propre frise, ses chiffres), équipes choisies par les puces
            chipDef?.perTeam ? { key: 'perTeam', label: '📦 Une image par équipe', on: false, formats: IMG } : null,
        ].filter(Boolean),
        chips: chipDef,
        preview: pick => {
            if (!IMG.includes(pick.format) || !pick.keys.length) return null;
            const { each, img } = first(pick);
            const html = exportCardHtml(img.est, img.c, img.s);
            return each ? { html, note: `${each.length} ${plural(each.length, 'image')}, une par équipe — 1re : ${each[0]}` } : html;
        },
        // Copie de l'image affichée, modale laissée ouverte : changer de puce puis copier la suivante
        previewActions: [{ key: 'copy', label: '📋 Copier l’image', busyLabel: '⏳ Copie…', doneLabel: '✅ Copiée',
            title: 'Copier cette image dans le presse-papiers (coller avec Ctrl+V dans Teams, Confluence, Slack…)',
            run: async pick => {
                const { img } = first(pick);
                try { await exportPng(img.est, img.c, img.s, fileName(img.est), true); } catch (e) { toast(`Copie impossible : ${e.message || e}`, 'error'); throw e; }
            } }],
    });
}

const IMG = ['png'];
/** « Une image par équipe » cochée (vue Train, image) : les équipes choisies par les puces (aucune = toutes). */
function perTeamList(def, pick) {
    if (!def?.perTeam || !IMG.includes(pick.format) || !pick.toggles?.perTeam) return null;
    const all = def.items.map(i => i.key).filter(Boolean);              // « Hors équipes suivies » n'a pas de frise
    const list = pick.chips?.length ? all.filter(k => pick.chips.includes(k)) : all;
    return list.length ? list : null;
}
/** État de la carte exportée : catégories, dépliage et équipes choisis dans la modale (l'écran ne bouge pas). */
const exportState = (st, keys, toggles, chips) => ({ ...st, ...(toggles || {}), ...(chips ? { moveTeams: new Set(chips) } : {}),
    cats: new Set(keys), selectedItem: null, adding: false, _items: [] });

/** Puces d'équipes de la modale. Vue Train : TOUTES les équipes (une image par équipe, filtre des couloirs
 *  dépliés) ; couloir basculé sur le train : équipes des arrivées / départs et 1v1. Les plus concernées
 *  d'abord, présélection = filtre de l'écran ; visibles pour l'image, couloir déplié ou « une image par équipe ». */
function teamChips(st, c) {
    const train = st.scope === 'train', count = new Map();
    [...c.moves, ...c.ones].forEach(x => count.set(x.team || '', (count.get(x.team || '') || 0) + 1));
    if (train) (store.get('teams') || []).forEach(t => count.has(t) || count.set(t, 0));
    if (count.size < 2 || (!train && st.view === 'story')) return null;
    const unfolded = toggles => st.view !== 'story' && !!(toggles.movesOpen || toggles.onesOpen);
    return {
        label: 'Équipes', perTeam: train,
        items: [...count].sort((a, b) => !a[0] - !b[0] || b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
            .map(([t, n]) => ({ key: t, label: t || 'Hors équipes suivies', count: n || null, color: t ? teamColor(t) : '' })),
        selected: [...(st.moveTeams || [])],
        visible: ({ format, toggles }) => IMG.includes(format) && (unfolded(toggles) || (train && !!toggles.perTeam)),
        itemVisible: (item, { toggles }) => !(train && toggles.perTeam && !item.key),
    };
}

function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── PNG ────────────────────────────────────────────────────────────────────────
async function loadH2C() {
    if (window.html2canvas) return;
    await new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = H2C; sc.onload = res; sc.onerror = () => rej(new Error('html2canvas indisponible (réseau)'));
        document.head.appendChild(sc);
    });
}

/** `color(srgb r g b / a)` (composantes 0-1) → `rgba(…)` ; le reste inchangé. */
const COLOR_FN = /color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+%?))?\)/g;
const toRgba = v => v.replace(COLOR_FN, (m, r, g, b, a) => {
    const alpha = a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : +a;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
});
const METRICS_FIX = 'body > div > img[src^="data:image/gif"] { display: inline !important; max-width: none !important; }';
const COLOR_PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color',
    'border-left-color', 'outline-color', 'box-shadow', 'text-decoration-color'];
function fixColors(root, win) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
        const cs = win.getComputedStyle(el);
        for (const p of COLOR_PROPS) {
            const v = cs.getPropertyValue(p);
            if (v && v.includes('color(')) el.style.setProperty(p, toRgba(v));
        }
    }
}

/** Équipes filtrées des couloirs dépliés, rappelées dans le sous-titre : l'image dit qu'elle est filtrée. */
const teamsNote = st => ((st.movesOpen || st.onesOpen) && st.moveTeams?.size
    ? ` · 👥 ${esc([...st.moveTeams].map(t => t || 'Hors équipes suivies').join(', '))}` : '');

/** La carte exportée en image — aussi l'APERÇU réduit de la modale d'export (même rendu, à l'échelle). */
export function exportCardHtml(st, c, s) {
    const noTarget = () => '';                                  // image : aucune cible cliquable
    return `<section class="card tl-card tl-export">
        <header class="tl-head"><div class="tl-title">
            <strong>🕰️ Faits marquants — ${esc(scopeNote(st, c))}</strong>
            <span class="tl-sub">Du ${fmtY(st.A)} au ${fmtY(st.B)} · ${Math.round(diff(st.A, st.B) / 7)} semaines · ${[...st.cats].map(k => CATS[k].emoji).join(' ')}${teamsNote(st)}</span>
        </div></header>
        <div class="tl-kpis">${kpisHtml(s)}</div>
        ${st.cats.has('presence') ? legendHtml() : ''}
        <div class="tl-body">${st.view === 'story' ? storyHtml(st, c, noTarget) : lanesHtml(st, c, noTarget, { brush: false })}</div>
        <footer class="tl-export-foot">Squad Board · généré le ${fmtY(timelineToday())}</footer>
    </section>`;
}

/** Image dans le presse-papiers (Teams, Confluence, Slack…) ; refus du navigateur → téléchargement. */
async function copyImage(blob, filename) {
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Image copiée — colle-la avec Ctrl+V', 'success');
    } catch {
        download(blob, filename);
        toast('Copie de l’image refusée par le navigateur : image téléchargée', 'warning');
    }
}

async function exportPng(st, c, s, name, copy = false) {
    const blob = await renderPng(st, c, s);
    if (copy) await copyImage(blob, `${name}.png`);
    else { download(blob, `${name}.png`); toast('Image exportée', 'success'); }
}

/** La carte exportée rendue en PNG (Blob), hors écran. */
async function renderPng(st, c, s) {
    await loadH2C();
    const host = document.createElement('div');
    host.className = 'tl-export-host';
    host.innerHTML = exportCardHtml(st, c, s);
    document.body.appendChild(host);
    const metrics = document.createElement('style');
    metrics.textContent = METRICS_FIX;
    document.head.appendChild(metrics);
    try {
        const card = host.firstElementChild;
        const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#ffffff';
        const canvas = await window.html2canvas(card, {
            backgroundColor: bg, scale: 2, useCORS: true, logging: false,
            onclone: doc => {
                // La carte EXPORTÉE (dans l'hôte hors écran) : l'aperçu de la modale est aussi un `.tl-export`,
                // encore présent pendant la fermeture — le 1er trouvé recevait les couleurs converties, et
                // html2canvas échouait sur « unsupported color function "color" ».
                fixColors(doc.querySelector('.tl-export-host .tl-export'), doc.defaultView);
            },
        });
        return await new Promise(r => canvas.toBlob(r, 'image/png'));
    } finally {
        host.remove();
        metrics.remove();
    }
}

// ── Markdown, groupé par catégorie puis par mois ───────────────────────────────
const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const dayLabel = d => `${DOW[dayOfWeek(d)]} ${fmtShort(d)}`;
const dayLabelY = d => `${dayLabel(d)}/${d.slice(0, 4)}`;          // « lun. 31/08/2026 »
const byMonth = (list, day = x => x.day) => {
    const m = new Map();
    list.forEach(x => { const k = day(x).slice(0, 7); (m.get(k) || m.set(k, []).get(k)).push(x); });
    return [...m];
};
const monthTitle = k => `### ${monthName(k + '-01').replace(/^./, ch => ch.toUpperCase())} ${k.slice(0, 4)}`;
const PRES_ICON = pct => pct === 0 ? '🟩' : pct <= 25 ? '🟧' : '🟥';
/** Clé de ticket → lien JIRA si l'adresse est connue (Markdown ; converti pour Slack par toSlack). */
const key = id => { const u = store.get('jiraUrl'); return u ? `[${id}](${String(u).replace(/\/+$/, '')}/browse/${id})` : `\`${id}\``; };
const relDay = (n, sign) => n ? `J${sign}${n}` : 'jour J';
/** Lien vers la fiche d'un membre : l'app l'ouvre sur `~membre=<nom>` (app.js → applyHash). */
const memberLink = (m, label) => `[${label || shortName(m.name)}](${location.origin}${location.pathname}#${m.team ? `team/${encodeURIComponent(m.team)}` : 'dashboard'}~membre=${encodeURIComponent(m.name)})`;
/** Portée affichée : équipe, train, ou équipe avec certains couloirs vus à l'échelle du train. */
export function scopeNote(st, c) {
    if (st.scope === 'train') return 'tout le train';
    const lanes = [...(c.trainLanes || [])].map(k => CATS[k].label);
    return lanes.length ? `${st.team} · 🚂 tout le train pour : ${lanes.join(', ')}` : st.team;
}
const followOf = (st, c) => mepFollowUps(c, st.scope === 'train' || c.trainLanes?.has('production') || c.trainLanes?.has('livraison') ? 'train' : 'team');

export function toMarkdown(st, c, s) {
    const on = k => st.cats.has(k), today = timelineToday(), L = [];
    const who = st.scope === 'train' ? 'tout le train' : st.team;
    L.push(`# 🕰️ Faits marquants — ${who}`, '',
        `> Du **${fmtY(st.A)}** au **${fmtY(st.B)}** · ${Math.round(diff(st.A, st.B) / 7)} semaines · généré le ${fmtY(today)} depuis Squad Board`,
        ...(c.trainLanes?.size ? ['>', `> Portée : **${scopeNote(st, c)}**`] : []), '');
    const follow = followOf(st, c), showTeam = st.scope === 'train' || c.trainLanes?.has('production');

    L.push('## 📊 En bref', '', '| Indicateur | Valeur |', '|---|---:|',
        `| ▲ Arrivées | ${s.arrivals} |`, `| ▼ Départs | ${s.departures} |`);
    if (s.movesIn + s.movesOut) L.push(`| ⇄ Mobilités | ${s.movesIn + s.movesOut} |`);
    L.push(`| 🚨 Incidents de production | ${s.incidents} |`, `| 🚀 Jours de MEP | ${s.releases} |`);
    if (follow.byRelease.size) L.push(`| 🚨 MEP suivies d'un incident (48 h) | ${follow.byRelease.size} |`);
    if (s.ops) L.push(`| ⚙️ Opérations | ${s.ops}${s.opsProd ? ` (${s.opsProd} en production)` : ''} |`);
    if (s.supTickets + s.supTasks) L.push(`| 🛎️ Support | ${s.supTickets} ${plural(s.supTickets, 'ticket')}${s.supBoarding ? ` (dont ${s.supBoarding} on/offboarding)` : ''} · ${s.supTasks} ${plural(s.supTasks, 'tâche')} de suivi |`);
    if (s.stale) L.push(`| ⏳ Tâches qui traînent (≥ 3 semaines) | ${s.stale} |`);
    if (s.ones) L.push(`| 💬 1v1 | ${s.ones} (${s.onePeople} ${plural(s.onePeople, 'collaborateur')}${s.onesPlanned ? `, dont ${s.onesPlanned} ${plural(s.onesPlanned, 'planifié')}` : ''}) |`);
    if (s.peak && s.peak.pct !== null) L.push(`| 🏖️ Pic de congés | ${s.peak.pct} % (semaine du ${fmtY(s.peak.week)}) |`);
    L.push('');

    if (on('rythme')) {
        L.push('## 🧭 Rythme', '');
        c.pis.forEach(p => L.push(`- **PI ${p.n}** : ${fmtY(p.start)} → ${fmtY(p.end)}`));
        if (c.sprints.length) L.push(`- **Sprints** : ${c.sprints.map(x => `${x.label} (${fmt(x.start)} → ${fmt(x.end)})`).join(' · ')}`);
        if (c.milestones.length) { L.push('- **🚩 Jalons du train**'); c.milestones.forEach(m => L.push(`  - ${dayLabelY(m.day)} — ${m.title}`)); }
        L.push('');
    }
    if (on('presence')) {
        const weeks = c.presence.filter(w => w.pct || w.holidays?.length);
        L.push('## 🏖️ Présence', '', '> 🟩 100 % présents · 🟧 75 à 99 % · 🟥 moins de 75 % — les jours fériés 🎌 ne comptent pas comme des congés.', '');
        c.low.forEach(p => L.push(`- **${p.label}** : ${fmtY(p.start)} → ${fmtY(p.end)} · ${p.weeks} semaines · ${p.avg} % de congés en moyenne · pic ${p.peak} %`));
        if (c.low.length) L.push('');
        if (weeks.length) {
            L.push('| Semaine du | Congés | En congé (≥ 1 j) | Fériés |', '|---|---:|---:|---|');
            weeks.forEach(w => L.push(`| ${dayLabelY(w.week)} | ${w.pct === null ? '—' : `${PRES_ICON(w.pct)} ${w.pct} %`} | ${w.size ? `${w.away}/${w.size}` : '—'} | ${cell((w.holidays || []).map(h => `🎌 ${h.name} (${fmtShort(h.day)})`).join(', '))} |`));
        } else L.push('_Aucun congé sur la période._');
        L.push('');
    }
    if (on('production')) {
        const items = c.incidents.flatMap(x => x.items), manual = c.facts.filter(f => f.type === 'incident');
        L.push(`## 🚨 Production — ${items.length} ${plural(items.length, 'incident')}`, '');
        if (!items.length && !manual.length) L.push('_Aucun incident de production sur la période._', '');
        byMonth(items).forEach(([k, xs]) => { L.push(monthTitle(k), ''); xs.forEach(i => L.push(`- **${dayLabel(i.day)}** — ${i.title} · ${key(i.id)} · _${i.status}_${showTeam ? ` · ${i.team}` : ''}${follow.byIncident.has(i.id) ? ` · 🚀 après la MEP du ${follow.byIncident.get(i.id).map(d => `${fmtShort(d)} (${relDay(diff(d, i.day), '-')})`).join(', ')}` : ''}`)); L.push(''); });
        manual.forEach(f => L.push(`- 💥 **${f.title}** — ${fmtY(f.start)}${f.end !== f.start ? ` → ${fmtY(f.end)}` : ''} _(saisi${f.author ? ` par ${f.author}` : ''})_`));
        if (manual.length) L.push('');
    }
    if (on('livraison')) {
        L.push(`## 🚀 Livraisons — ${c.releases.length} ${plural(c.releases.length, 'jour')} de MEP`, '');
        if (!c.releases.length) L.push('_Aucune MEP sur la période (agendas ICS disponibles depuis le ' + (c.icsFrom ? fmtY(c.icsFrom) : '—') + ')._', '');
        byMonth(c.releases).forEach(([k, rs]) => { L.push(monthTitle(k), ''); rs.forEach(r => L.push(`- **${dayLabel(r.day)}** — ${[...new Set(r.items.map(i => i.title))].join(' · ')}${follow.byRelease.has(r.day) ? ` · **🚨 incident dans les 48 h** : ${follow.byRelease.get(r.day).map(i => `${key(i.id)} (${relDay(diff(r.day, i.day), '+')})`).join(', ')}` : ''}`)); L.push(''); });
    }
    if (on('operations')) {
        L.push(`## ⚙️ Opérations — ${s.ops}${s.opsProd ? ` · ⚠️ ${s.opsProd} en production` : ''}`, '');
        if (!c.operations.length) L.push('_Aucune opération planifiée sur la période._', '');
        byMonth(c.operations).forEach(([k, os]) => { L.push(monthTitle(k), ''); os.forEach(o => L.push(`- **${dayLabel(o.day)}${o.time ? ` ${o.time.replace(':', 'h')}` : ''}** — ${o.prod ? '⚠️ ' : ''}${o.title}${o.prod ? ' · _production_' : ''}`)); L.push(''); });
    }
    if (on('charge')) {
        L.push(`## 🛎️ Support — ${s.supTickets} ${plural(s.supTickets, 'ticket')} · ${s.supTasks} ${plural(s.supTasks, 'tâche')} de suivi`, '');
        const weeks = c.support.filter(w => w.tickets.length + w.tasks.length);
        if (!weeks.length) L.push('_Aucun ticket Support sur la période._', '');
        else {
            L.push('| Semaine du | Tickets Support | Tâches du suivi |', '|---|---:|---:|');
            weeks.forEach(w => L.push(`| ${dayLabelY(w.week)} | ${w.tickets.length} | ${w.tasks.length} |`));
            L.push('');
            weeks.forEach(w => {
                L.push(`### Semaine du ${dayLabelY(w.week)}`, '');
                w.tickets.forEach(t => L.push(`- ${t.boarding ? '🧳' : '🎫'} **${t.title}** · ${key(t.id)} · _${t.status}_`));
                w.tasks.forEach(k => L.push(`- ${k.done ? '✅' : '🧩'} ${k.text} · ${key(k.ticket)} _${k.label}_${k.streak > 1 ? ` · **🔁 ${k.streak} semaines** (depuis le ${fmtShort(k.since)})` : ''}`));
                L.push('');
            });
        }
    }
    if (on('equipe')) {
        const K = { in: '▲ Arrivée', out: '▼ Départ', 'move-in': '⇄ Mobilité (arrivée)', 'move-out': '⇄ Mobilité (départ)' };
        L.push(`## 👥 Arrivées & départs — ${c.moves.length} ${plural(c.moves.length, 'mouvement')}`, '');
        const teams = new Set(c.moves.map(m => m.team || ''));
        if (teams.size > 1) {
            // Plusieurs équipes (Train, ou couloir basculé sur le train) : un bloc par équipe, comme la bulle
            const by = new Map();
            c.moves.forEach(m => { const t = m.team || ''; (by.get(t) || by.set(t, []).get(t)).push(m); });
            [...by].sort((a, b) => !a[0] - !b[0] || b[1].length - a[1].length || a[0].localeCompare(b[0], 'fr')).forEach(([t, ms]) => {
                const n = k => ms.filter(m => k.includes(m.kind)).length;
                const cnt = [[n(['in']), '▲'], [n(['out']), '▼'], [n(['move-in', 'move-out']), '⇄']].filter(([x]) => x).map(([x, sym]) => `${sym} ${x}`).join(' · ');
                L.push(`### ${t || 'Hors équipes suivies'} — ${cnt}`, '');
                ms.forEach(m => L.push(`- ${K[m.kind].split(' ')[0]} **${m.who}**${m.kind === 'move-out' ? ` → ${m.to}` : m.kind === 'move-in' ? ` ← ${m.from}` : ''} · ${m.precise ? dayLabelY(m.day) : `début du PI ${m.pi}`}${m.precise ? ' · check-list' : ' · constaté au PI'}${m.conflict ? ' · ⚠️ à vérifier' : ''}`));
                L.push('');
            });
        } else if (c.moves.length) {
            L.push('| Date | Mouvement | Personne | Détail |', '|---|---|---|---|');
            c.moves.forEach(m => L.push(`| ${m.precise ? `${dayLabelY(m.day)}` : `début du PI ${m.pi} (${fmtY(m.day)})`} | ${K[m.kind]} | ${cell(m.who)} | ${cell([m.kind === 'move-in' ? `vient de ${m.from}` : m.kind === 'move-out' ? `part vers ${m.to}` : st.scope === 'train' ? m.team : '', m.precise ? 'check-list' : 'constaté au PI', m.conflict ? '⚠️ à vérifier' : ''].filter(Boolean).join(' · '))} |`));
        } else L.push('_Aucune arrivée ni départ sur la période._');
        L.push('');
    }
    if (on('oneonone')) {
        L.push(`## 💬 1v1 — ${s.ones}${s.ones ? ` · ${s.onePeople} ${plural(s.onePeople, 'collaborateur')}${s.onesPlanned ? ` · dont ${s.onesPlanned} ${plural(s.onesPlanned, 'planifié')}` : ''}` : ''}`, '');
        if (!c.ones.length) L.push('_Aucun 1v1 dans l’agenda sur la période._', '');
        byMonth(c.ones).forEach(([k, os]) => { L.push(monthTitle(k), ''); os.forEach(o => L.push(`- **${dayLabel(o.day)}** — ${o.pair}${o.day > today ? ' _(planifié)_' : ''}`)); L.push(''); });
        // Par personne (managers exclus) : combien de 1v1 et quand, avec un lien vers sa fiche quand le
        // prénom de l'agenda désigne un seul membre.
        const people = onePeopleList(c.ones, c.onesAll, st.scope === 'train' ? '*' : st.team);
        if (people.length) {
            L.push('### Par personne', '');
            people.forEach(p => L.push(`- ${p.member ? memberLink(p.member, `${p.who} (${shortName(p.member.name)})`) : `**${p.who}**`}${p.member && st.scope === 'train' && p.member.team ? ` · ${p.member.team}` : ''} — ${p.days.length} 1v1 : ${p.days.map(dayLabel).join(', ')}`));
            L.push('');
        }
    }
    if (on('fait')) {
        const fx = c.facts.filter(f => f.type !== 'incident');
        L.push(`## 📌 Faits marquants saisis — ${fx.length}`, '');
        if (!fx.length) L.push('_Aucun fait saisi sur la période._', '');
        fx.forEach(f => {
            const t = FACT_TYPES[f.type] || FACT_TYPES.other;
            L.push(`- ${t.emoji} **${f.title}** — ${fmtY(f.start)}${f.end !== f.start ? ` → ${fmtY(f.end)}` : ''} · ${t.label} · ${f.teams.length ? f.teams.join(', ') : 'tout le train'}${f.author ? ` · ajouté par ${f.author}` : ''}`);
            if (f.note) L.push(`  > ${f.note.replace(/\s+/g, ' ')}`);
        });
        if (fx.length) L.push('');
    }
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Markdown → mrkdwn Slack (même contenu, même groupement) : Slack n'a ni titres ni tableaux ni `**`.
 *  Titres → *gras* (mois → _italique_), lignes de tableau → puces « a : b » ou « a · b · c »,
 *  `- ` → `• `, sous-liste → `◦`. Même style que « Copier pour Slack » de la fiche d'identité. */
export function toSlack(md) {
    const out = [];
    let inTable = false;
    for (const line of md.split('\n')) {
        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) { out.push(h[1].length === 3 ? `_${h[2]}_` : `*${h[2]}*`); inTable = false; continue; }
        if (/^\|[-:| ]+\|$/.test(line)) continue;                                // séparateur de tableau
        if (line.startsWith('|')) {
            const cells = line.slice(1, -1).split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, '|'));
            if (!inTable) { inTable = true; continue; }                          // ligne d'en-têtes
            out.push(cells.length === 2 ? `• ${cells[0]} : ${cells[1]}` : `• ${cells.filter(Boolean).join(' · ')}`);
            continue;
        }
        inTable = false;
        // Liens Markdown [clé](url) → liens Slack <url|clé> (clés de ticket vers JIRA)
        out.push(line.replace(/^ {2}- /, '    ◦ ').replace(/^- /, '• ').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<$2|$1>').replace(/\*\*(.+?)\*\*/g, '*$1*'));
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
