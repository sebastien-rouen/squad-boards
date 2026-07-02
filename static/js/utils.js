/**
 * Shared utility functions.
 */

import { STATUS_MAP, STATUS_LABELS, TYPE_MAP, TYPE_LABELS, TYPE_ICONS, WIP_STATUSES } from './config.js';

/**
 * Retourne le label d'affichage du statut d'un ticket.
 * Priorité : `t.jiraStatus` (label JIRA brut, ex: "En cours de développement") → STATUS_LABELS interne.
 *
 * Permet de préserver la granularité JIRA dans l'UI tout en gardant le mapping interne
 * pour les filtres, le groupement et les colonnes Kanban.
 */
export function getStatusLabel(ticket) {
    if (!ticket) return '';
    if (ticket.jiraStatus && String(ticket.jiraStatus).trim()) return ticket.jiraStatus;
    return STATUS_LABELS[ticket.status] || ticket.status || '';
}

/**
 * Badge de TYPE de ticket — point d'entrée unique pour des couleurs/design homogènes.
 * Couleurs & style : classes CSS `.badge .badge-type .badge-<type>` (cf. base.css).
 *
 * @param {string} type   clé interne (story, bug, task, support, ops, debt, epic, feature)
 * @param {object} [opts]
 * @param {string} [opts.size]   '2xs' | 'sm' → ajoute `badge-<size>`
 * @param {string} [opts.extra]  classes additionnelles
 * @param {string} [opts.attrs]  attributs HTML bruts (déjà échappés par l'appelant)
 * @param {string} [opts.label]  libellé forcé (sinon TYPE_LABELS[type] ou la clé)
 * @param {boolean}[opts.title]  ajoute un title = libellé (défaut true)
 * @returns {string} HTML du badge
 */
export function typeBadge(type, opts = {}) {
    const t = type || '';
    const label = opts.label != null ? opts.label : (TYPE_LABELS[t] || t || '?');
    const icon  = TYPE_ICONS[t] ? `${TYPE_ICONS[t]} ` : '';
    const size  = opts.size ? ` badge-${opts.size}` : '';
    const extra = opts.extra ? ` ${opts.extra}` : '';
    const title = opts.title === false ? '' : ` title="${esc(label)}"`;
    const attrs = opts.attrs ? ` ${opts.attrs}` : '';
    return `<span class="badge badge-type badge-${esc(t)}${size}${extra}"${title}${attrs}>${icon}${esc(label)}</span>`;
}

/**
 * Badge de STATUT de ticket — point d'entrée unique (couleurs/design homogènes).
 * Classes CSS `.badge .badge-status .badge-<statusKey>` (cf. base.css).
 *
 * @param {object} ticket  ticket (utilise t.status pour la couleur, getStatusLabel pour le libellé)
 * @param {object} [opts]
 * @param {string} [opts.size]    '2xs' | 'sm'
 * @param {string} [opts.extra]   classes additionnelles
 * @param {string} [opts.attrs]   attributs HTML bruts
 * @param {string} [opts.label]   libellé forcé (sinon getStatusLabel(ticket))
 * @param {boolean}[opts.title]   ajoute un title (défaut true)
 * @returns {string} HTML du badge
 */
export function statusBadge(ticket, opts = {}) {
    const key   = ticket?.status || '';
    const label = opts.label != null ? opts.label : getStatusLabel(ticket);
    const size  = opts.size ? ` badge-${opts.size}` : '';
    const extra = opts.extra ? ` ${opts.extra}` : '';
    const title = opts.title === false ? '' : ` title="${esc(label)}"`;
    const attrs = opts.attrs ? ` ${opts.attrs}` : '';
    return `<span class="badge badge-${esc(key)} badge-status${size}${extra}"${title}${attrs}>${esc(label)}</span>`;
}

/** Escape HTML to prevent XSS. */
export function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

/**
 * Extensions d'image éligibles à l'aperçu zoomable (`diagramFrameHtml`) — schémas
 * (SVG Excalidraw/draw.io exportés, captures de tableau blanc) et photos classiques.
 */
export const ZOOMABLE_IMAGE_EXT = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

/** Extension (minuscule, sans le point) d'un nom de fichier. */
export function fileExt(filename) {
    return (filename || '').split('.').pop().toLowerCase();
}

/**
 * Marquage HTML standard pour un schéma/image zoomable (molette + pan + pincement).
 * Décoré automatiquement par `initDiagramZoom()` (components/diagram_zoom.js) : tout
 * `.diagram-frame` présent dans #content reçoit le bouton « agrandir » au prochain rendu.
 * Utilisé par : Paramètres → A propos (diagrammes Excalidraw), Équipe → pièces jointes
 * d'atelier (aperçu image au lieu d'un simple lien de téléchargement).
 */
export function diagramFrameHtml(src, alt, extraClass = '') {
    return `<div class="diagram-frame${extraClass ? ' ' + extraClass : ''}">
        <img src="${esc(src)}" alt="${esc(alt || '')}" loading="lazy">
    </div>`;
}

/** Map a JIRA status string to internal status key. */
export function mapStatus(jiraStatus) {
    if (!jiraStatus) return 'todo';
    return STATUS_MAP[jiraStatus.toLowerCase().trim()] || 'todo';
}

/** Map a JIRA issue type to internal type key. */
export function mapType(jiraType) {
    if (!jiraType) return 'task';
    return TYPE_MAP[jiraType.toLowerCase().trim()] || 'task';
}

/**
 * Traduction des noms de champs JIRA (clés techniques) en français.
 * Utilisé pour l'affichage de l'activité récente (recentChanges).
 */
const _FIELD_LABEL_FR = {
    status:        'Statut',
    assignee:      'Assigné·e',
    reporter:      'Rapporteur·rice',
    priority:      'Priorité',
    sprint:        'Sprint',
    resolution:    'Résolution',
    labels:        'Étiquettes',
    fixversion:    'Version',
    'fix version': 'Version',
    duedate:       "Date d'échéance",
    summary:       'Titre',
    epic:          'Epic parent',
    'epic link':   'Epic parent',
    parent:        'Parent',
    rank:          'Rang',
    'story points': 'Story points',
    'team[team]':  'Équipe',
    team:          'Équipe',
    flagged:       'Drapeau',
};
export function fieldLabelFr(field) {
    if (!field) return 'Champ';
    const key = String(field).toLowerCase().trim();
    return _FIELD_LABEL_FR[key]
        || (field.charAt(0).toUpperCase() + field.slice(1));
}

/** Extract team name from a board or sprint name.
 *  Strips known prefixes (Sprint, Equipe, Team, Board…) and sprint suffixes (" - Ite X.Y").
 *  "Sprint Fuego" → "Fuego", "Fuego - Ite 30.1" → "Fuego", "Équipe Alpha" → "Alpha"
 */
export function extractTeam(name) {
    if (!name) return 'Autre';
    return (name || '')
        .replace(/^(?:Sprint|Équipe|Equipe|Team|Board|Kanban)\s+/i, '')
        .replace(/\s+-\s+(?:It[eé]|Iter|Sprint|S)\s*[\d.]+.*/i, '')
        .trim() || name.trim();
}

/** Format a date string as DD/MM/YYYY. */
export function fmtDate(d) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt)) return '-';
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Format long FR : "mer. 10 juin 2026" — capitalise le mois pour cohérence. */
export function fmtDateLong(d) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt)) return '-';
    const s = dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    // Capitalise le mois (juin → Juin) — replace insensitive sur les mois
    return s.replace(/\b(jan(?:vier)?|f[éeè]v(?:rier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sep(?:tembre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\b/i,
        m => m.charAt(0).toUpperCase() + m.slice(1));
}

/** Format ISO "YYYY-MM-DD" → "mer. 26 août 2026" (vide si invalide). Utilisé par les champs date. */
export function fmtDateFriendly(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
    const dt = new Date(iso.slice(0, 10) + 'T00:00:00');
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Champ date "friendly" RÉUTILISABLE : input natif (clic = calendrier OS) + overlay texte lisible.
 * Tout le champ est cliquable. À coupler avec `wireFriendlyDates(container)` après insertion DOM.
 *
 * @param {object} o
 *   - name        {string}  attribut name de l'input (pour FormData / querySelector)
 *   - value       {string}  date ISO "YYYY-MM-DD" initiale
 *   - placeholder {string}  texte affiché quand vide (défaut "Choisir une date")
 *   - min/max     {string}  bornes ISO optionnelles
 *   - id          {string}  id optionnel sur l'input
 * @returns {string} HTML
 */
export function friendlyDateField({ name = '', value = '', placeholder = 'Choisir une date', min = '', max = '', id = '' } = {}) {
    const long = fmtDateFriendly(value);
    return `<div class="fdate" data-fdate>
        <input class="fdate-input" type="date" ${id ? `id="${esc(id)}"` : ''} name="${esc(name)}" value="${esc(value)}"${min ? ` min="${esc(min)}"` : ''}${max ? ` max="${esc(max)}"` : ''}>
        <span class="fdate-display${long ? '' : ' is-empty'}" data-ph="${esc(placeholder)}">${long ? esc(long) : esc(placeholder)}</span>
        <svg class="fdate-icon icon icon-xs" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1.5" y="2.5" width="13" height="12" rx="2"/><path d="M1.5 6h13M5 1v3M11 1v3"/></svg>
    </div>`;
}

/** Câble tous les champs `[data-fdate]` d'un conteneur : sync de l'overlay + clic ouvre le calendrier.
 *  Idempotent (ne recâble pas un champ déjà initialisé). */
export function wireFriendlyDates(container = document) {
    container.querySelectorAll('[data-fdate]').forEach(wrap => {
        if (wrap._fdateWired) return;
        wrap._fdateWired = true;
        const input   = wrap.querySelector('.fdate-input');
        const display = wrap.querySelector('.fdate-display');
        if (!input || !display) return;
        const ph = display.dataset.ph || display.textContent;
        const sync = () => {
            const long = fmtDateFriendly(input.value);
            display.textContent = long || ph;
            display.classList.toggle('is-empty', !long);
        };
        input.addEventListener('change', sync);
        input.addEventListener('input', sync);
        // Clic n'importe où sur le champ → ouvre le calendrier natif (showPicker si dispo)
        wrap.addEventListener('click', (e) => {
            if (e.target === input) return; // l'input gère déjà son clic
            try { input.showPicker?.(); } catch { input.focus(); }
        });
    });
}

/** Format a date as relative time (e.g., "il y a 2h"). */
export function fmtRelative(d) {
    if (!d) return '';
    const now = Date.now();
    const dt = new Date(d).getTime();
    const diff = now - dt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'maintenant';
    if (mins < 60) return `il y a ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `il y a ${days}j`;
    return fmtDate(d);
}

/**
 * Combien de jours le ticket reste dans sa colonne actuelle (utile au daily).
 *
 * Source de vérité, par ordre :
 *  1. Dernier `status` change dans `recentChanges` (≈ entrée dans la colonne courante).
 *  2. `startedDate` (mise en cours JIRA) — sert pour les tickets jamais re-déplacés.
 *  3. `updatedAt` — fallback faible (peut être faussé par un edit non-statut).
 *
 * Retourne `{ days, sinceIso, source }` ou `null` si rien d'exploitable.
 */
export function daysInCurrentColumn(ticket) {
    if (!ticket) return null;
    const changes = ticket.recentChanges || ticket.recent_changes || [];
    let sinceIso = null;
    let source = null;
    for (const c of changes) {
        if ((c.field || '').toLowerCase().trim() === 'status') {
            sinceIso = c.date;
            source = 'status';
            break;
        }
    }
    if (!sinceIso) {
        sinceIso = ticket.startedDate || ticket.started_date || null;
        if (sinceIso) source = 'started';
    }
    if (!sinceIso) {
        sinceIso = ticket.updatedAt || ticket.updated_at || null;
        if (sinceIso) source = 'updated';
    }
    if (!sinceIso) return null;
    const dt = new Date(sinceIso).getTime();
    if (!Number.isFinite(dt)) return null;
    const days = Math.max(0, Math.floor((Date.now() - dt) / 86400000));
    return { days, sinceIso, source };
}

// Groupes de colonnes suivis par l'indicateur de flux (Dashboard/PI Planning) — matching sur les
// libellés JIRA bruts stockés dans ticket.stageDurations (clés en minuscules, cf sync.js).
// Ordre = ordre chronologique d'affichage (dev → test → review → qualif → prod). Le test "prod"
// exclut "preprod"/"préprod" pour ne pas les confondre.
export const STAGE_FLOW_GROUPS = [
    { key: 'dev', label: 'En cours de dév', test: k => /d[eé]velopp|development/.test(k) },
    { key: 'test', label: 'En cours de test', test: k => /test|recette|uat/.test(k) },
    { key: 'review', label: 'Revue', test: k => /revue|review|relecture/.test(k) },
    { key: 'qualif', label: 'À livrer en qualif', test: k => k.includes('qualif') },
    { key: 'prod', label: 'À livrer en prod', test: k => k.includes('prod') && !k.includes('preprod') && !k.includes('préprod') },
];

/**
 * Durée moyenne (jours) passée par les tickets dans chaque colonne de flux suivie
 * (Revue, En cours de dév, En cours de test, À livrer en qualif, À livrer en prod).
 * Basé sur ticket.stageDurations (durées cumulées par statut JIRA brut, calculées au sync
 * depuis le changelog complet — cf sync.js transformIssue). Ne retourne que les colonnes
 * réellement présentes dans le workflow de l'équipe (au moins un ticket concerné).
 */
export function computeStageFlow(tickets) {
    return STAGE_FLOW_GROUPS.map(g => {
        const perTicket = [];
        for (const t of (tickets || [])) {
            const sd = t.stageDurations || t.stage_durations || {};
            let sum = 0;
            for (const [rawKey, days] of Object.entries(sd)) {
                if (g.test(rawKey)) sum += days;
            }
            if (sum > 0) perTicket.push(sum);
        }
        if (!perTicket.length) return null;
        const avgDays = Math.round((perTicket.reduce((a, b) => a + b, 0) / perTicket.length) * 10) / 10;
        return { key: g.key, label: g.label, avgDays, count: perTicket.length };
    }).filter(Boolean);
}

/**
 * Détail d'une colonne de flux (pour la modale ouverte au clic sur un segment) : répartition
 * par libellé JIRA brut (nb tickets, durée moyenne) + liste des tickets concernés triée par
 * durée décroissante. Réutilise STAGE_FLOW_GROUPS (même matching que computeStageFlow).
 */
export function computeStageFlowDetail(groupKey, tickets) {
    const group = STAGE_FLOW_GROUPS.find(g => g.key === groupKey);
    if (!group) return { byRawStatus: [], tickets: [] };
    const byRawStatus = new Map();
    const ticketRows = [];
    for (const t of (tickets || [])) {
        const sd = t.stageDurations || t.stage_durations || {};
        let sum = 0;
        let matchedRaw = null;
        for (const [rawKey, days] of Object.entries(sd)) {
            if (!group.test(rawKey)) continue;
            sum += days;
            if (!matchedRaw || days > (sd[matchedRaw] || 0)) matchedRaw = rawKey;
            const entry = byRawStatus.get(rawKey) || { rawStatus: rawKey, count: 0, totalDays: 0 };
            entry.count += 1;
            entry.totalDays += days;
            byRawStatus.set(rawKey, entry);
        }
        if (sum > 0) ticketRows.push({ ticket: t, days: Math.round(sum * 10) / 10, jiraStatus: t.jiraStatus || matchedRaw || '' });
    }
    ticketRows.sort((a, b) => b.days - a.days);
    const rows = [...byRawStatus.values()]
        .map(r => ({ ...r, avgDays: Math.round((r.totalDays / r.count) * 10) / 10 }))
        .sort((a, b) => b.totalDays - a.totalDays);
    return { byRawStatus: rows, tickets: ticketRows };
}

/** Calculate percentage, clamped 0-100. */
export function pct(part, total) {
    if (!total) return 0;
    return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}

/** Pick a color class for a progress percentage. */
export function progressColor(value) {
    if (value >= 80) return 'green';
    if (value >= 50) return 'yellow';
    return 'red';
}

/** Generate a deterministic color for a string (name, team, etc.). */
export function hashColor(str) {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 55%, 50%)`;
}

/** Get initials from a name (max 2 chars). */
export function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

/** Group an array by a key function. */
export function groupBy(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }
    return map;
}

/** Sum values from an array using an accessor function. */
export function sumBy(arr, fn) {
    return arr.reduce((s, item) => s + (fn(item) || 0), 0);
}

/** Detect PI number from sprint name (e.g., "Ite 29.3" → 29). */
export function detectPI(sprintName) {
    if (!sprintName) return null;
    const m = sprintName.match(/(\d+)\.\d+/)
        || sprintName.match(/PI\s*#?\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}

/** Show a toast notification. */
export function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-out');
        el.addEventListener('animationend', () => el.remove());
    }, duration);
}

// ── Atlassian Wiki Markup → HTML ──────────────────────────────────────────────

export function parseWikiMarkup(text) {
    if (!text || typeof text !== 'string') return '';

    const blocks = [];
    const ph = i => `\x02B${i}\x02`;

    // {code[:attrs]} … {code}
    text = text.replace(/\{code(?::([^}]*))?\}([\s\S]*?)\{code\}/gi, (_, attrs, body) => {
        const lang = (attrs || '').match(/(?:^|language=)([a-z]+)/i)?.[1] || '';
        const idx = blocks.length;
        blocks.push(`<pre><code class="lang-${esc(lang)}">${esc(body.replace(/^\n/, ''))}</code></pre>`);
        return ph(idx);
    });
    // {noformat} … {noformat}
    text = text.replace(/\{noformat[^}]*\}([\s\S]*?)\{noformat\}/gi, (_, body) => {
        const idx = blocks.length;
        blocks.push(`<pre>${esc(body.replace(/^\n/, ''))}</pre>`);
        return ph(idx);
    });
    // {quote} … {quote}
    text = text.replace(/\{quote\}([\s\S]*?)\{quote\}/gi, (_, body) => {
        const idx = blocks.length;
        blocks.push(`<blockquote>${parseWikiMarkup(body.trim())}</blockquote>`);
        return ph(idx);
    });
    // Panel macros: {info}, {note}, {warning}, {tip}, {panel}
    text = text.replace(/\{(info|note|warning|tip|panel)(?::[^}]*)?\}([\s\S]*?)\{\/?\1\}/gi, (_, type, body) => {
        const cls = type === 'warning' ? 'warning' : 'info';
        const idx = blocks.length;
        blocks.push(`<div class="adf-panel adf-panel-${cls}">${parseWikiMarkup(body.trim())}</div>`);
        return ph(idx);
    });

    const lines = text.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.indexOf('\x02') >= 0) { out.push(line); i++; continue; }
        if (/^----+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

        const hm = line.match(/^h([1-6])\.\s+(.*)/);
        if (hm) { out.push(`<h${hm[1]}>${_wikiInline(hm[2])}</h${hm[1]}>`); i++; continue; }

        if (/^[*#]/.test(line)) {
            const chunk = [];
            while (i < lines.length && /^[*#]/.test(lines[i]) && lines[i].indexOf('\x02') < 0) chunk.push(lines[i++]);
            out.push(_wikiList(chunk));
            continue;
        }

        if (/^\|/.test(line)) {
            const chunk = [];
            while (i < lines.length && /^\|/.test(lines[i])) chunk.push(lines[i++]);
            out.push(_wikiTable(chunk));
            continue;
        }

        if (!line.trim()) { i++; continue; }

        out.push(`<p>${_wikiInline(line)}</p>`);
        i++;
    }

    let result = out.join('');
    // eslint-disable-next-line no-control-regex -- \x02 = sentinelle interne (placeholders de blocs)
    result = result.replace(/\x02B(\d+)\x02/g, (_, n) => blocks[+n] || '');
    return result;
}

function _wikiInline(text) {
    if (!text) return '';
    let s = esc(text);
    s = s.replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '<strong>$1</strong>');
    s = s.replace(/_(\S(?:[^_\n]*\S)?)_/g, '<em>$1</em>');
    s = s.replace(/\+(\S(?:[^+\n]*\S)?)\+/g, '<u>$1</u>');
    s = s.replace(/(?<![a-zA-Z0-9])-(\S(?:[^-\n]*?\S)?)-(?![a-zA-Z0-9])/g, '<s>$1</s>');
    s = s.replace(/\{\{([^}\n]+)\}\}/g, '<code>$1</code>');
    s = s.replace(/\{color:([^}]+)\}(.*?)\{color\}/g, '<span style="color:$1">$2</span>');
    s = s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\[([^\]]+)\]/g, (_, inner) =>
        inner.startsWith('~') ? `<strong>@${inner.slice(1)}</strong>`
            : `<a href="${inner}" target="_blank" rel="noopener">${inner}</a>`
    );
    s = s.replace(/!([^!\n|]+)(?:\|[^!]*)?\!/g, '<img src="$1" style="max-width:100%" alt="">');
    s = s.replace(/\\\\/g, '<br>');
    return s;
}

function _wikiList(lines) {
    const items = lines.map(l => {
        const m = l.match(/^([*#]+)\s+(.*)/);
        return m ? { depth: m[1].length, tag: m[1][m[1].length - 1] === '#' ? 'ol' : 'ul', text: m[2] } : null;
    }).filter(Boolean);
    if (!items.length) return '';
    let html = '';
    const stack = [];
    for (const item of items) {
        while (stack.length && stack[stack.length - 1].depth >= item.depth) html += `</${stack.pop().tag}>`;
        if (!stack.length || stack[stack.length - 1].depth < item.depth) {
            html += `<${item.tag}>`;
            stack.push({ tag: item.tag, depth: item.depth });
        }
        html += `<li>${_wikiInline(item.text)}</li>`;
    }
    while (stack.length) html += `</${stack.pop().tag}>`;
    return html;
}

function _wikiTable(lines) {
    let html = '<table>';
    for (const line of lines) {
        const isHeader = line.startsWith('||');
        const clean = line.replace(/^\|+/, '').replace(/\|+\s*$/, '');
        const cells = isHeader ? clean.split('||') : clean.split('|');
        const tag = isHeader ? 'th' : 'td';
        html += '<tr>' + cells.map(c => `<${tag}>${_wikiInline(c.trim())}</${tag}>`).join('') + '</tr>';
    }
    return html + '</table>';
}

/** Debounce a function. */
export function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

/** Sort tickets: blocked first, then by points desc, then by id. */
export function sortTickets(tickets) {
    return [...tickets].sort((a, b) => {
        if (a.status === 'blocked' && b.status !== 'blocked') return -1;
        if (b.status === 'blocked' && a.status !== 'blocked') return 1;
        if (a.flagged && !b.flagged) return -1;
        if (b.flagged && !a.flagged) return 1;
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
        return (a.id || '').localeCompare(b.id || '');
    });
}

/**
 * Filter tickets by team or group.
 * Reads group from store if group is selected.
 */
export function filterByTeam(tickets, team) {
    if (!team || team === 'all') {
        // Check if a group is selected
        const { store } = window.__squadBoard || {};
        if (store) {
            const groupId = store.get('group');
            if (groupId) {
                const groups = store.get('groups') || [];
                const group = groups.find(g => g.id === groupId);
                if (group && group.teams?.length) {
                    return tickets.filter(t => group.teams.includes(t.team));
                }
            }
        }
        return tickets;
    }
    return tickets.filter(t => t.team === team);
}

/**
 * Si le filtre "Mes tickets" est actif (toggle topbar + nom saisi),
 * restreint la liste aux items dont leader/assignee = utilisateur courant.
 */
export function filterByMine(items) {
    if (typeof window === 'undefined' || !window.__squadBoard?.store) return items;
    const s = window.__squadBoard.store;
    if (!s.get('myFilterOn')) return items;
    const me = (s.get('myName') || '').trim().toLowerCase();
    if (!me) return items;
    return (items || []).filter(t => {
        const leader = (t.leader || t.assignee || '').toLowerCase();
        return !!leader && (leader === me || leader.includes(me));
    });
}

/**
 * Copie du texte dans le presse-papier (avec fallback exec si navigator.clipboard absent).
 * Affiche un toast en cas de succès/échec.
 */
export async function copyToClipboard(text, label = 'Copié') {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
        }
        toast(`${label} : ${text.length > 60 ? text.slice(0, 60) + '…' : text}`, 'success', 1800);
        return true;
    } catch (e) {
        toast(`Copie impossible : ${e.message}`, 'error');
        return false;
    }
}

/**
 * Confirmation destructrice avec modale stylée (vs `confirm()` natif).
 * Retourne Promise<boolean>.
 *
 * options : { confirmLabel?, cancelLabel?, danger? }
 */
export function confirmDanger(title, message, options = {}) {
    return new Promise(resolve => {
        const {
            confirmLabel = 'Supprimer',
            cancelLabel = 'Annuler',
            danger = true,
        } = options;
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        ov.innerHTML = `
            <div class="confirm-modal" role="dialog" aria-modal="true">
                <div class="confirm-icon ${danger ? 'confirm-icon--danger' : 'confirm-icon--warn'}">${danger ? '⚠' : '?'}</div>
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message).replace(/\n/g, '<br>')}</div>` : ''}
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-act="cancel">${esc(cancelLabel)}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-act="ok">${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const onKey = e => {
            if (e.key === 'Escape') cleanup(false);
            else if (e.key === 'Enter') cleanup(true);
        };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => {
            if (e.target === ov) cleanup(false);
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'ok')     cleanup(true);
            if (act === 'cancel') cleanup(false);
        });
        setTimeout(() => ov.querySelector('[data-act="ok"]')?.focus(), 50);
    });
}

/**
 * Modale à choix multiples (≥2 actions + annulation). Réutilise `.confirm-overlay`/`.confirm-modal`.
 * @param {string} title
 * @param {string} message  (sauts de ligne `\n` autorisés)
 * @param {Array<{key:string,label:string,variant?:string}>} buttons  variant: 'primary'|'danger'|'secondary'
 * @returns {Promise<string|null>} la `key` choisie, ou `null` si annulé (Échap / clic hors modale / Annuler).
 */
export function choiceModal(title, message, buttons = []) {
    return new Promise(resolve => {
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        const btnHtml = buttons.map(b =>
            `<button class="btn btn-${b.variant || 'primary'} btn-sm" data-key="${esc(b.key)}">${esc(b.label)}</button>`
        ).join('');
        ov.innerHTML = `
            <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message).replace(/\n/g, '<br>')}</div>` : ''}
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-key="">Annuler</button>
                    ${btnHtml}
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val || null);
        };
        const onKey = e => { if (e.key === 'Escape') cleanup(null); };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => {
            if (e.target === ov) return cleanup(null);
            const btn = e.target.closest('[data-key]');
            if (btn) cleanup(btn.dataset.key);
        });
        // Focus la 1re action métier (pas "Annuler")
        setTimeout(() => ov.querySelector('.confirm-actions [data-key]:not([data-key=""])')?.focus(), 50);
    });
}

/**
 * Modale de sélection multiple façon "gros boutons carrés" (ex: choisir les
 * données à exporter). Chaque bouton bascule sélectionné/désélectionné avec un
 * visuel "enfoncé" (bordure + fond teintés, légèrement réduit, ombre interne).
 * Tout est présélectionné par défaut (sauf `initialSelected`). Propose en option
 * un choix de format (pills façon `.board-modes`, réutilisé depuis Reports) et
 * un raccourci tout sélectionner/désélectionner.
 * @param {string} title
 * @param {Array<{key:string,label:string,icon?:string,count?:number}>} items
 * @param {object} [opts] { message?, confirmLabel?, formats?:Array<{key:string,label:string}>,
 *   initialSelected?:string[], initialFormat?:string }
 * @returns {Promise<{keys:string[],format:string}|null>} sélection + format choisi, ou `null` si annulé.
 */
export function exportChoiceModal(title, items, opts = {}) {
    const { message = '', confirmLabel = 'Exporter', formats = null, initialSelected = null, initialFormat = null } = opts;
    return new Promise(resolve => {
        const validKeys = new Set(items.map(i => i.key));
        const initial = initialSelected?.filter(k => validKeys.has(k));
        const selected = new Set(initial?.length ? initial : items.map(i => i.key));
        let format = (initialFormat && formats?.some(f => f.key === initialFormat)) ? initialFormat : (formats?.[0]?.key || null);
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        const toggleAllLabel = () => selected.size === items.length ? 'Tout désélectionner' : 'Tout sélectionner';
        const gridHtml = items.map(i => `
            <button type="button" class="export-choice-btn${selected.has(i.key) ? ' export-choice-btn--on' : ''}" data-key="${esc(i.key)}">
                ${i.count != null ? `<span class="export-choice-count">${i.count}</span>` : ''}
                <span class="export-choice-icon">${i.icon || '📦'}</span>
                <span class="export-choice-label">${esc(i.label)}</span>
            </button>`).join('');
        const formatsHtml = formats
            ? `<div class="export-choice-formats">
                   <span class="export-choice-formats-lbl">Format</span>
                   <div class="board-modes">
                       ${formats.map(f => `<button type="button" class="board-mode-btn${f.key === format ? ' active' : ''}" data-format="${esc(f.key)}">${esc(f.label)}</button>`).join('')}
                   </div>
               </div>`
            : '';
        ov.innerHTML = `
            <div class="confirm-modal confirm-modal--export" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message)}</div>` : ''}
                    ${formatsHtml}
                    <div class="export-choice-toolbar">
                        <button type="button" class="btn btn-ghost btn-xs" id="export-choice-toggle-all">${toggleAllLabel()}</button>
                    </div>
                    <div class="export-choice-grid">${gridHtml}</div>
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-act="cancel">Annuler</button>
                    <button class="btn btn-primary btn-sm" data-act="ok">${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const onKey = e => { if (e.key === 'Escape') cleanup(null); };
        document.addEventListener('keydown', onKey);
        const toggleAllBtn = ov.querySelector('#export-choice-toggle-all');
        ov.querySelector('.export-choice-grid').addEventListener('click', e => {
            const btn = e.target.closest('.export-choice-btn');
            if (!btn) return;
            const key = btn.dataset.key;
            if (selected.has(key)) selected.delete(key); else selected.add(key);
            btn.classList.toggle('export-choice-btn--on', selected.has(key));
            toggleAllBtn.textContent = toggleAllLabel();
        });
        toggleAllBtn?.addEventListener('click', () => {
            const selectAll = selected.size !== items.length;
            selected.clear();
            if (selectAll) items.forEach(i => selected.add(i.key));
            ov.querySelectorAll('.export-choice-btn').forEach(btn =>
                btn.classList.toggle('export-choice-btn--on', selected.has(btn.dataset.key)));
            toggleAllBtn.textContent = toggleAllLabel();
        });
        ov.querySelector('.export-choice-formats')?.addEventListener('click', e => {
            const btn = e.target.closest('[data-format]');
            if (!btn) return;
            format = btn.dataset.format;
            ov.querySelectorAll('.export-choice-formats .board-mode-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.format === format));
        });
        ov.addEventListener('click', e => {
            if (e.target === ov) return cleanup(null);
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'ok') cleanup({ keys: [...selected], format });
            if (act === 'cancel') cleanup(null);
        });
    });
}

/**
 * Convertit un tableau d'objets plats en CSV (Excel-compatible : BOM + délimiteur `;`).
 * Colonnes = union des clés de tous les objets, dans leur ordre d'apparition. Une valeur
 * array/object est sérialisée en JSON dans sa cellule (pas d'éclatement en sous-colonnes).
 * @param {Array<object>} rows
 * @returns {string} contenu CSV prêt à être mis dans un Blob
 */
export function arrayToCsv(rows) {
    if (!rows?.length) return '';
    const cols = [];
    const seen = new Set();
    for (const row of rows) {
        for (const k of Object.keys(row)) {
            if (!seen.has(k)) { seen.add(k); cols.push(k); }
        }
    }
    const cell = v => {
        if (v == null) return '';
        const s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
        return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [cols.join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))];
    return '﻿' + lines.join('\n');
}

/**
 * Saisie texte modale (remplace `prompt()` natif : thémée, dark-mode, validation, Échap/Entrée).
 * @param {string} title
 * @param {object} [opts] { message?, value?, placeholder?, confirmLabel?, cancelLabel?, type?, required? }
 * @returns {Promise<string|null>} valeur saisie (trim) ou `null` si annulé.
 */
export function promptModal(title, opts = {}) {
    const {
        message = '', value = '', placeholder = '',
        confirmLabel = 'Valider', cancelLabel = 'Annuler',
        type = 'text', required = false,
    } = opts;
    return new Promise(resolve => {
        const ov = document.createElement('div');
        ov.className = 'confirm-overlay';
        ov.innerHTML = `
            <div class="confirm-modal confirm-modal--prompt" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="confirm-body">
                    <div class="confirm-title">${esc(title)}</div>
                    ${message ? `<div class="confirm-message">${esc(message).replace(/\n/g, '<br>')}</div>` : ''}
                    <input class="input confirm-input" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}">
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost btn-sm" data-act="cancel">${esc(cancelLabel)}</button>
                    <button class="btn btn-primary btn-sm" data-act="ok">${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('visible'));
        const input = ov.querySelector('.confirm-input');
        const cleanup = (val) => {
            ov.classList.remove('visible');
            ov.addEventListener('transitionend', () => ov.remove(), { once: true });
            document.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const submit = () => {
            const v = input.value.trim();
            if (required && !v) { input.classList.add('confirm-input--error'); input.focus(); return; }
            cleanup(v);
        };
        const onKey = e => {
            if (e.key === 'Escape') cleanup(null);
            else if (e.key === 'Enter') submit();
        };
        document.addEventListener('keydown', onKey);
        ov.addEventListener('click', e => {
            if (e.target === ov) return cleanup(null);
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'ok') submit();
            if (act === 'cancel') cleanup(null);
        });
        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}

/**
 * Sprint actif pour l'équipe donnée, depuis le store.
 *
 * Source : `sprintInfo.teamSprints[]` (collecté par sync.js, un sprint par board scrum).
 * Fallback : `sprintInfo` global (legacy single-sprint pour les setups mono-équipe).
 *
 * @param {string|null} team  Nom de l'équipe ou 'all'/null (renvoie le sprint legacy).
 * @returns {object|null}     `{name, startDate, endDate, goal, jiraId, jiraBoardId, team}` ou null.
 */
/**
 * Extrait le numéro de PI d'un nom de sprint/PI.
 * Règles (dans l'ordre) : `NN.x` (ex: "Fuego - Ité 29.3" → 29) > `PI #NN` / `PINN`.
 * @returns {number} le numéro de PI, ou 0 si non extractible.
 */
export function extractPiNum(name) {
    if (!name) return 0;
    const s = String(name);
    const m = s.match(/(\d+)\.\d+/)                                  // notation sprint "30.1"
           || s.match(/PI\s*#?\s*(\d+)/i)                            // "PI#30", "PI 30", "PI30"
           || s.match(/(?<![A-Za-z])PI(?![A-Za-z])[^\d]{0,15}?(\d+)/i); // "PI Design #30" (texte entre PI et n°)
    return m ? parseInt(m[1], 10) : 0;
}

/**
 * Extrait le label complet "NN.N" d'un nom de sprint (ex: "Team G - Ité 30.1" → "30.1").
 * À utiliser pour matcher `v.piSprint` (votes mood/fist) — NE JAMAIS reconstruire ce label à
 * la main depuis `piInfo.number` + index de sprint : si `piInfo.number` est vide/obsolète, la
 * reconstruction produit un label tronqué (ex: ".1") qui ne matche plus aucun vote (footgun
 * constaté : panneau latéral "Aucun vote · .1" alors que des votes existaient bien sur 30.1).
 * @returns {string} le label "NN.N", ou '' si non extractible.
 */
export function extractSprintLabel(name) {
    const m = String(name || '').match(/(\d+\.\d+)/);
    return m ? m[1] : '';
}

/**
 * SOURCE UNIQUE du "PI courant". À utiliser partout (topbar, settings, dashboard, …)
 * au lieu de réimplémenter la regex localement — sinon divergences et bugs d'affichage.
 *
 * Règle métier : le PI courant = PI du SPRINT ACTIF JIRA en priorité (la réalité terrain),
 * fallback sur `piInfo.number` (config Settings). Le sprint prime car la config peut être
 * obsolète (ex: number=29 alors que le sprint actif est déjà en 30.x).
 *
 * @param {object} [opts] — { sprintInfo, piInfo }. Si omis, lus depuis window.__squadBoard.store.
 * @returns {number} numéro de PI courant, ou 0 si indéterminable.
 */
export function getCurrentPi({ sprintInfo, piInfo } = {}) {
    const store = (typeof window !== 'undefined') ? window.__squadBoard?.store : null;
    const si = sprintInfo !== undefined ? sprintInfo : store?.get('sprintInfo');
    const pi = piInfo     !== undefined ? piInfo     : store?.get('piInfo');
    return extractPiNum(si?.name) || pi?.number || 0;
}

/**
 * SOURCE UNIQUE de résolution des objectifs PI à afficher pour un PI donné — partagée par
 * le Dashboard (carte « Atteinte ») et PI Planning (onglet Objectifs). Évite le footgun
 * historique « doit rester cohérent entre les deux vues » (clé de lecture du snapshot).
 *
 * Règle : PI courant → jeu vivant `piInfo.objectives` s'il est non vide, sinon snapshot
 * `piObjectives[piNum]`. PI passé → snapshot, puis fallback localStorage legacy si fourni.
 * Renvoie la liste BRUTE (ni filtre texte, ni filtre équipe) — chaque appelant applique
 * ensuite ses propres filtres (l'éditeur PI a besoin des lignes vides/en cours de saisie).
 *
 * @param {object} opts { piInfo, piNum, isCurrentPi, legacyLsKey? }
 * @returns {Array} objectifs bruts pour ce PI
 */
export function resolvePiObjectives({ piInfo, piNum, isCurrentPi, legacyLsKey = null } = {}) {
    const snap = (piInfo?.piObjectives || {})[String(piNum)] || null;
    const live = piInfo?.objectives || [];
    if (isCurrentPi) return live.length ? live : (snap || []);
    if (snap) return snap;
    if (legacyLsKey) {
        try { return JSON.parse(localStorage.getItem(legacyLsKey) || '[]'); } catch { return []; }
    }
    return [];
}

/**
 * Compare une baseline de commitment PI (snapshot figé) à l'état courant des features du PI.
 * Baseline et live partagent la forme { id, title, team, points, status }.
 * @returns {{engagedPts, deliveredPts, addedPts, removedPts, added, removed, addedCount, removedCount, sayDo, capturedAt}}
 */
export function computeCommitment(baseline, liveFeatures) {
    const base = baseline?.features || [];
    const live = liveFeatures || [];
    const baseIds = new Set(base.map(f => f.id));
    const liveById = new Map(live.map(f => [f.id, f]));
    const liveIds = new Set(live.map(f => f.id));
    const engagedPts = base.reduce((s, f) => s + (f.points || 0), 0);
    // Livré = features engagées (baseline) encore présentes et désormais "done".
    const deliveredPts = base.reduce((s, f) => {
        const cur = liveById.get(f.id);
        return s + (cur && cur.status === 'done' ? (cur.points || 0) : 0);
    }, 0);
    const added   = live.filter(f => !baseIds.has(f.id));   // scope creep
    const removed = base.filter(f => !liveIds.has(f.id));   // descopé
    const addedPts   = added.reduce((s, f) => s + (f.points || 0), 0);
    const removedPts = removed.reduce((s, f) => s + (f.points || 0), 0);
    return {
        engagedPts, deliveredPts, addedPts, removedPts,
        added, removed, addedCount: added.length, removedCount: removed.length,
        sayDo: engagedPts > 0 ? Math.round((deliveredPts / engagedPts) * 100) : null,
        capturedAt: baseline?.capturedAt || null,
    };
}

/**
 * Calendriers pertinents pour une équipe : ceux sans équipe (= globaux/toutes) OU de l'équipe
 * courante. Si team est vide/'all', renvoie tous les calendriers. Source unique — utilisée par
 * le bandeau agenda, la modale semaine, l'infopanel et le badge de fraîcheur topbar.
 */
export function relevantCalendars(calendars, team) {
    const cals = calendars || [];
    return (team && team !== 'all')
        ? cals.filter(c => !c.team || c.team === team)
        : cals;
}

/**
 * Date ISO de la synchro la plus récente parmi les calendriers pertinents (cf. relevantCalendars).
 * @returns {string} ISO de `lastFetched` le plus récent, ou '' si aucune synchro.
 */
export function lastCalendarSync(calendars, team) {
    return relevantCalendars(calendars, team)
        .reduce((mx, c) => (c.lastFetched && c.lastFetched > mx) ? c.lastFetched : mx, '');
}

export function getSprintForTeam(team, sprintInfo = null, targetDate = null) {
    const si = sprintInfo || (typeof window !== 'undefined' && window.__squadBoard?.store?.get('sprintInfo'));
    if (!si) return null;
    const arr = Array.isArray(si.teamSprints) ? si.teamSprints : [];

    // Filtre par équipe (si spécifique) — sinon on prend tous les sprints connus
    // Fallback : si aucun sprint ne matche s.team === team, on tente via le nom du sprint
    // (ex: "Initiale - Ité 29.5" → extractTeam → "Initiale") pour couvrir les boards
    // JIRA mal nommés ("Team I", "I", etc.) dont l'alias ne correspond pas au nom équipe UI.
    let candidates = (team && team !== 'all')
        ? arr.filter(s => s.team === team)
        : arr;
    if (team && team !== 'all' && !candidates.length) {
        candidates = arr.filter(s => extractTeam(s.name) === team);
    }

    // Si targetDate fournie, on cherche le sprint qui contient cette date
    if (targetDate && candidates.length) {
        // targetDate peut être un Date (cas modal) ou un ISO string — on extrait juste YYYY-MM-DD
        const _toIso = d => d instanceof Date
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            : String(d).slice(0, 10);
        const t = new Date(`${_toIso(targetDate)}T12:00:00`).getTime();
        const containing = candidates.find(s => {
            const sStart = new Date(`${_toIso(s.startDate)}T00:00:00`).getTime();
            const sEnd   = new Date(`${_toIso(s.endDate)}T23:59:59`).getTime();
            return !isNaN(sStart) && !isNaN(sEnd) && sStart <= t && t <= sEnd;
        });
        if (containing) return containing;
        // Pas de sprint contenant la date → on prend le PLUS PROCHE (gap entre sprints)
        let closest = null, minDist = Infinity;
        for (const s of candidates) {
            const sStart = new Date(`${_toIso(s.startDate)}T00:00:00`).getTime();
            const sEnd   = new Date(`${_toIso(s.endDate)}T23:59:59`).getTime();
            if (isNaN(sStart) || isNaN(sEnd)) continue;
            const dist = t < sStart ? sStart - t : t > sEnd ? t - sEnd : 0;
            if (dist < minDist) { minDist = dist; closest = s; }
        }
        // Seuil : ne renvoie le sprint proche que s'il est à moins de 14 jours (intersprint typique)
        if (closest && minDist <= 14 * 86400000) return closest;
        return null;
    }

    // Équipe spécifique sans targetDate : on cherche un sprint actif sinon le premier
    if (team && team !== 'all') {
        return candidates.find(s => s.state === 'active') || candidates[0] || null;
    }
    // "Toutes les équipes" (ou pas de team) → sprint global pour la rétrocompat
    return {
        team: null,
        name: si.name,
        startDate: si.startDate,
        endDate: si.endDate,
        goal: si.goal,
        jiraId: si.jiraId,
        jiraBoardId: si.jiraBoardId,
    };
}

/**
 * SOURCE UNIQUE de détection « buffer » d'un ticket/feature. Convention : un label
 * **exactement** égal à « buffer » (insensible à la casse). Avant, roadmap/pi utilisaient
 * un match sous-chaîne `/buffer/i` (faux positifs « buffer-xxx ») alors que health.js utilisait
 * déjà `/^buffer$/i` → chiffres divergents. On converge ici sur la sémantique stricte de health.
 * @param {{labels?: string[]}} item
 * @returns {boolean}
 */
export function isBufferItem(item) {
    return (item?.labels || []).some(l => /^buffer$/i.test(l));
}

/**
 * Ventilation vélocité / buffer / feature d'un lot de tickets — source unique partagée par
 * la Roadmap et PI Planning (évite les calculs divergents).
 * @param {Array} tickets
 * @returns {{totalPts, donePts, bufferPts, bufferDonePts, featurePts, featureDonePts}}
 */
export function computeVelocityBreakdown(tickets) {
    const list = tickets || [];
    const _pts = t => t.points || 0;
    const done = list.filter(t => t.status === 'done');
    const bufAll = list.filter(isBufferItem);
    const bufDone = bufAll.filter(t => t.status === 'done');
    const totalPts      = sumBy(list, _pts);
    const donePts       = sumBy(done, _pts);
    const bufferPts     = sumBy(bufAll, _pts);
    const bufferDonePts = sumBy(bufDone, _pts);
    return {
        totalPts, donePts, bufferPts, bufferDonePts,
        featurePts:     totalPts - bufferPts,
        featureDonePts: donePts - bufferDonePts,
    };
}

/**
 * Indicateurs de flux — sources uniques partagées par Dashboard (vue d'ensemble),
 * Board (sprint courant) et Santé. Évite les définitions divergentes d'une vue à l'autre.
 */
/** Nombre de tickets bloqués. */
export function countBlocked(tickets) {
    return (tickets || []).filter(t => t.status === 'blocked').length;
}
/** Nombre de tickets en cours (WIP) — statuts WIP_STATUSES (inprog/review/test). */
export function countWip(tickets) {
    return (tickets || []).filter(t => WIP_STATUSES.includes(t.status)).length;
}
/**
 * Débit (throughput) : nb de tickets passés en « done » avec `resolvedDate` dans les
 * `days` derniers jours. Définition canonique (le Dashboard l'utilisait déjà inline).
 */
export function throughputSince(tickets, days = 7) {
    const cutoff = Date.now() - days * 86400000;
    return (tickets || []).filter(t =>
        t.status === 'done' && t.resolvedDate && new Date(t.resolvedDate).getTime() >= cutoff
    ).length;
}

/**
 * Calcule l'historique de vélocité à partir des sprints clôturés.
 *
 * Priorité 1 : `sprint.velocity` (story points livrés, donnée pré-calculée par JIRA via
 * l'endpoint `/board/{id}/velocity`, collectée par sync.js).
 * Priorité 2 : somme des points des tickets locaux `status='done'` dont `sprintName` matche
 * (fallback pour sprints sans données JIRA ou setups sans sync).
 *
 * Filtrage par équipe :
 *   • Équipe spécifique : ne garde que les sprints de cette équipe (clé = name|team)
 *   • 'all' / null      : agrège par nom de sprint (somme cross-team par PI)
 *
 * Tri : par `endDate` ascendant (ancien → récent) — le chart prend `lastIdx` comme plus récent.
 *
 * @param {Array}  tickets    Tickets locaux (fallback)
 * @param {object} sprintInfo Objet sprintInfo du store (avec `teamSprints[]`)
 * @param {string} team       Équipe sélectionnée ou 'all'/null
 * @returns {Array} `[{ name, velocity, endDate, team? }]` trié ancien → récent
 */
export function computeVelocityHistory(tickets, sprintInfo, team = null) {
    const sprints = sprintInfo?.teamSprints || [];
    if (!sprints.length) return [];

    const teamFilter = team && team !== 'all';
    const closed = sprints.filter(s => s.state === 'closed' && s.endDate && s.name);

    // Agrégation par clé (équipe spécifique : par sprint+équipe ; all : par nom de sprint cross-team)
    const accum = new Map();
    for (const s of closed) {
        if (teamFilter && s.team !== team) continue;
        const key = teamFilter ? `${s.name}|${s.team}` : s.name;
        const prev = accum.get(key);
        const v = (typeof s.velocity === 'number' && s.velocity > 0)
            ? s.velocity
            : _sumDoneTicketPoints(tickets, s.name, teamFilter ? s.team : null);
        const est = (typeof s.estimated === 'number' && s.estimated > 0) ? s.estimated : 0;
        // Buffer : priorité 1 = `s.bufferPoints` (pré-calculé par sync.js via JQL labels=Buffer
        // sur sprints clos) ; priorité 2 = somme des tickets label Buffer locaux (sprints actifs/PI-named)
        const bp = (typeof s.bufferPoints === 'number' && s.bufferPoints > 0)
            ? s.bufferPoints
            : _sumBufferTicketPoints(tickets, s.name, teamFilter ? s.team : null);
        if (!prev) {
            accum.set(key, {
                name: s.name, velocity: v, estimated: est, bufferPoints: bp,
                endDate: s.endDate, team: s.team,
                state: 'closed',
                jiraId: s.jiraId || '',
                jiraBoardId: s.jiraBoardId || '',
                jiraIds: s.jiraId ? [s.jiraId] : [],
            });
        } else {
            prev.velocity     += v;
            prev.estimated    += est;
            prev.bufferPoints += bp;
            if (s.endDate > prev.endDate) prev.endDate = s.endDate;
            if (s.jiraId && !prev.jiraIds.includes(s.jiraId)) prev.jiraIds.push(s.jiraId);
        }
    }

    return [...accum.values()]
        .filter(v => v.velocity > 0)
        .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
}

/**
 * Entrée vélocité pour le(s) sprint(s) actif(s) — pour affichage en bout de chart
 * sans contamination des stats (KPIs calculés sur sprints clos seulement).
 *
 * Source : tickets locaux (somme `points` done + total) — plus à jour que la
 * snapshot JIRA pour un sprint en cours. Fallback sur `s.estimated` JIRA si présent.
 *
 * @returns {object|null} `{name, velocity, estimated, endDate, team, isCurrent: true}` ou null
 */
export function computeCurrentSprintEntry(tickets, sprintInfo, team = null) {
    const sprints = sprintInfo?.teamSprints || [];
    if (!sprints.length) return null;

    const teamFilter = team && team !== 'all';
    const active = sprints.filter(s => s.state === 'active' && s.name);
    const filtered = teamFilter ? active.filter(s => s.team === team) : active;
    if (!filtered.length) return null;

    let estimated = 0, completed = 0, latestEnd = '';
    const validKeys = new Set(filtered.map(s => `${s.name}|${s.team}`));

    for (const s of filtered) {
        if (s.endDate > latestEnd) latestEnd = s.endDate;
        if (s.estimated > 0) estimated += s.estimated; // fallback JIRA snapshot
    }

    // Live depuis tickets locaux : total = capacité ; done = vélocité courante ;
    // bufferPoints = somme des points des tickets label "Buffer"
    let liveTotal = 0, bufferPoints = 0;
    for (const t of (tickets || [])) {
        const k = `${t.sprintName || t.sprint_name}|${t.team}`;
        if (!validKeys.has(k)) continue;
        liveTotal += t.points || 0;
        if (t.status === 'done') completed += t.points || 0;
        if (isBufferItem(t)) bufferPoints += t.points || 0;
    }
    if (liveTotal > 0) estimated = liveTotal; // priorité au calcul live

    if (!estimated && !completed) return null;

    return {
        name: filtered.length === 1 ? filtered[0].name : 'Sprint en cours',
        velocity:  completed,
        estimated,
        bufferPoints,
        endDate:   latestEnd,
        team:      teamFilter ? team : null,
        state:     'active',
        isCurrent: true,
        jiraId:    filtered.length === 1 ? (filtered[0].jiraId || '') : '',
        jiraIds:   filtered.map(s => s.jiraId).filter(Boolean),
    };
}

function _sumDoneTicketPoints(tickets, sprintName, team) {
    if (!tickets?.length) return 0;
    let sum = 0;
    for (const t of tickets) {
        if (t.status !== 'done') continue;
        if ((t.sprintName || t.sprint_name) !== sprintName) continue;
        if (team && t.team !== team) continue;
        sum += t.points || 0;
    }
    return sum;
}

/**
 * Capacité prévisionnelle pour le **PI suivant** d'une équipe.
 *
 * Formule :
 *   `grossCapacity = vélocité moyenne sprint (3 derniers clos) × sprintsPerPI`
 *   `netCapacity   = grossCapacity × (1 − ratio_absences_PI)`
 *
 * Fenêtre PI suivant = `endDate sprint actif + 1` → `+sprintsPerPI × sprintDuration jours`
 * Sources : piInfo.sprintsPerPI (default 5) · piInfo.sprintDuration (default 14j)
 *
 * @returns {object|null} `{ avgVelocityPerSprint, sprintsPerPI, grossCapacity, netCapacity,
 *   absencesDays, openDays, teamSize, ratio, piNumber, windowStart, windowEnd }`
 */
export function computeCapacityNextPI(team, sprintInfo, piInfo, absences, ticketsForVelocity = []) {
    if (!team || team === 'all') return null;
    const teamSprints = sprintInfo?.teamSprints || [];
    const activeSprint = teamSprints.find(s => s.state === 'active' && s.team === team);
    if (!activeSprint?.endDate) return null;

    const sprintsPerPI    = piInfo?.sprintsPerPI    || 5;
    const sprintDuration  = piInfo?.sprintDuration  || 14;
    const totalDaysPI     = sprintsPerPI * sprintDuration;

    const _toIso = (d) => d.toISOString().slice(0, 10);
    const curEnd   = new Date(String(activeSprint.endDate).slice(0, 10));
    const piStart  = new Date(curEnd); piStart.setDate(curEnd.getDate() + 1);
    const piEnd    = new Date(piStart); piEnd.setDate(piStart.getDate() + totalDaysPI - 1);

    // Vélocité moyenne / sprint sur les 3 derniers sprints clos
    const history = computeVelocityHistory(ticketsForVelocity, sprintInfo, team);
    const last3 = history.slice(-3);
    if (!last3.length) return null;
    const avgVelocityPerSprint = Math.round(last3.reduce((s, v) => s + v.velocity, 0) / last3.length);
    const grossCapacity = avgVelocityPerSprint * sprintsPerPI;

    // Jours ouvrés (lun-ven) sur la fenêtre PI
    const _isWeekend = (d) => { const w = d.getDay(); return w === 0 || w === 6; };
    let openDays = 0;
    for (let d = new Date(piStart); d <= piEnd; d.setDate(d.getDate() + 1)) {
        if (!_isWeekend(d)) openDays++;
    }

    // Jours d'absence des membres de l'équipe sur la fenêtre PI
    const teamAbsences = (absences || []).filter(a => a.team === team);
    let absencesDays = 0;
    for (const a of teamAbsences) {
        if (!a.startDate || !a.endDate) continue;
        const aStart = new Date(String(a.startDate).slice(0, 10));
        const aEnd   = new Date(String(a.endDate).slice(0, 10));
        const ovStart = aStart > piStart ? aStart : piStart;
        const ovEnd   = aEnd   < piEnd   ? aEnd   : piEnd;
        if (ovStart > ovEnd) continue;
        for (let d = new Date(ovStart); d <= ovEnd; d.setDate(d.getDate() + 1)) {
            if (!_isWeekend(d)) absencesDays += (a.type === '1/2' || /half|demi/i.test(a.type || '') ? 0.5 : 1);
        }
    }

    const teamMembers = [...new Set(teamAbsences.map(a => a.memberName).filter(Boolean))];
    const teamSize = Math.max(1, teamMembers.length);
    const totalOpenDaysTeam = openDays * teamSize;
    const ratio = totalOpenDaysTeam > 0 ? Math.min(1, absencesDays / totalOpenDaysTeam) : 0;
    const netCapacity = Math.round(grossCapacity * (1 - ratio));

    const curPiNumber = piInfo?.number || 0;
    const nextPiNumber = curPiNumber ? curPiNumber + 1 : null;

    return {
        avgVelocityPerSprint,
        sprintsPerPI,
        sprintDuration,
        grossCapacity,
        netCapacity,
        absencesDays,
        openDays,
        teamSize,
        totalOpenDaysTeam,
        ratio: Math.round(ratio * 100),
        piNumber: nextPiNumber,
        windowStart: _toIso(piStart),
        windowEnd: _toIso(piEnd),
    };
}

function _sumBufferTicketPoints(tickets, sprintName, team) {
    if (!tickets?.length) return 0;
    let sum = 0;
    for (const t of tickets) {
        if ((t.sprintName || t.sprint_name) !== sprintName) continue;
        if (team && t.team !== team) continue;
        if (!isBufferItem(t)) continue;
        sum += t.points || 0;
    }
    return sum;
}

/**
 * Statut "rollup" d'un parent (feature, epic) calculé depuis ses enfants.
 *
 * Règles (priorité décroissante) :
 *   • blocked : au moins un enfant bloqué
 *   • done    : tous les enfants terminés
 *   • inprog  : au moins un enfant en cours / review / test / terminé
 *   • todo    : sinon (aucun progrès)
 *
 * Si pas d'enfants → renvoie `fallback` (le statut propre du parent, depuis JIRA).
 *
 * Statuts internes : `todo`, `inprog`, `review`, `test`, `blocked`, `done`.
 */
export function rollupStatus(children, fallback = null) {
    if (!children || !children.length) return fallback;
    if (children.some(c => c.status === 'blocked')) return 'blocked';
    if (children.every(c => c.status === 'done')) return 'done';
    if (children.some(c => ['inprog', 'review', 'test', 'done'].includes(c.status))) return 'inprog';
    return 'todo';
}

/**
 * Liste effective des membres d'équipes, dérivée des absences/congés.
 *
 * Source de vérité = absences (généralement importées d'un CSV RH à jour), pas la table `members`
 * qui peut contenir des artefacts JIRA (assignees/reporters d'autres équipes).
 *
 * Stratégie :
 *   1. Tous les noms uniques + équipe trouvés dans `absences` → membres
 *   2. Les rôles éventuels de la table `members` sont mergés quand le nom+équipe correspond
 *
 * Retourne `[{ name, team, role }]`.
 *
 * Utilisée pour : agenda, support, calculs de capacité PI (PI Planning, Roadmap, PI Calendrier).
 * Pour les modales/tickets, garder les données JIRA brutes (assignee.displayName, etc.).
 */
export function deriveMembersFromAbsences(absences, members = []) {
    const byKey = new Map();
    for (const a of (absences || [])) {
        if (!a.memberName || !a.team) continue;
        // Normalize "Team Fuego" → "Fuego" to align with JIRA board names used in groups.
        // Applies to data already in DB (backend normalizes new imports, this covers existing rows).
        const team = extractTeam(a.team);
        const key = `${a.memberName}|${team}`;
        if (!byKey.has(key)) byKey.set(key, { name: a.memberName, team, role: '' });
    }
    // Merge des rôles depuis la table members (si la personne y existe aussi)
    for (const m of (members || [])) {
        if (!m.name || !m.team) continue;
        const team = extractTeam(m.team);
        const key = `${m.name}|${team}`;
        const existing = byKey.get(key);
        if (existing && m.role) existing.role = m.role;
    }
    return [...byKey.values()];
}

/**
 * Roster effectif d'un PI donné : priorité au snapshot figé à l'import CSV
 * (`piInfo.piMembers[piNum]`) — gère le turnover PI à PI (un membre qui rejoint/quitte
 * une équipe entre deux PI) ; sinon fallback sur `deriveMembersFromAbsences` (dérivation
 * "vivante", pas figée). Sans ce snapshot, un membre parti après le PI où la rotation
 * Support a été générée continuerait d'apparaître indéfiniment (rotation déjà shuffle
 * = noms figés en base, jamais réécrits tant que personne ne relance un shuffle).
 *
 * Utilisée pour : grille Rotation Support (Paramètres), panneau latéral "Support cette
 * semaine" (infopanel.js) — partout où on doit savoir qui est *réellement* dans l'équipe
 * pour le PI affiché, pas seulement qui a un jour eu une absence enregistrée.
 */
export function effectiveRosterForPi(piInfo, piNum, absences, members) {
    const snapshot = piInfo?.piMembers?.[String(piNum)];
    // Normalise le nom d'équipe du snapshot (ex: "Team Fuego" → "Fuego") — sinon teamNameMatches
    // peut échouer à apparier un membre snapshotté avec une équipe non normalisée (cf. agenda.js).
    return (snapshot && snapshot.length)
        ? snapshot.map(m => ({ ...m, team: extractTeam(m.team) }))
        : deriveMembersFromAbsences(absences, members);
}

/** Comparaison tolérante de noms d'équipe (CSV RH vs config app peuvent différer légèrement). */
export function teamNameMatches(memberTeam, target) {
    const t = (memberTeam || '').toLowerCase().trim();
    const tgt = (target || '').toLowerCase().trim();
    return t === tgt || (tgt && t && (t.includes(tgt) || tgt.includes(t)));
}

/**
 * Capacité d'une équipe à une date donnée (par défaut aujourd'hui) : membres
 * présents = roster (deriveMembersFromAbsences) moins les absents du jour.
 * Source de vérité = table `absence` (CSV RH), conformément aux conventions du site.
 *
 * @param {string} team         nom d'équipe (normalisé via extractTeam)
 * @param {Array}  members      store.members (rôles/autocomplete)
 * @param {Array}  absences     store.absences
 * @param {Date}   [at]         date de référence (défaut : maintenant)
 * @returns {{ total:number, available:number, absent:number,
 *             availableNames:string[], absentNames:string[] }}
 */
export function teamCapacity(team, members, absences, at = new Date()) {
    const teamKey = extractTeam(team);
    const roster = deriveMembersFromAbsences(absences, members)
        .filter(m => extractTeam(m.team) === teamKey)
        .map(m => m.name);
    const day = at.toISOString().slice(0, 10); // YYYY-MM-DD
    const absentToday = new Set(
        (absences || [])
            .filter(a => a.memberName && extractTeam(a.team) === teamKey
                && a.startDate && a.endDate
                && String(a.startDate).slice(0, 10) <= day
                && String(a.endDate).slice(0, 10) >= day)
            .map(a => a.memberName)
    );
    const availableNames = roster.filter(n => !absentToday.has(n));
    const absentNames    = roster.filter(n => absentToday.has(n));
    return {
        total: roster.length,
        available: availableNames.length,
        absent: absentNames.length,
        availableNames,
        absentNames,
    };
}

/**
 * Seuil de WIP pour une équipe selon sa capacité du jour (membres présents).
 * Heuristique : ~2 tickets en parallèle par personne présente, plancher à 3.
 * Retourne le seuil entier au-delà duquel le WIP est jugé « élevé ».
 */
export const WIP_PER_MEMBER = 2;
export function wipThreshold(capacity) {
    const avail = Math.max(0, capacity?.available || 0);
    return Math.max(3, Math.ceil(avail * WIP_PER_MEMBER));
}

// ── Rotation Support : règles métier centralisées ───────────────────────────
/**
 * Compte les jours d'absence d'un membre dans une plage [weekStart, weekEnd].
 * Source = table absences (CSV RH, vérité).
 */
export function supportAbsenceDays(memberName, weekStart, weekEnd, absences) {
    return (absences || [])
        .filter(a => a.memberName === memberName && a.startDate <= weekEnd && a.endDate >= weekStart)
        .reduce((sum, a) => sum + (a.days || 0), 0);
}

/**
 * Niveau d'absence d'un membre pour un jour ouvré précis (ISO YYYY-MM-DD).
 * Cherche dans les absences qui couvrent ce jour ; une absence couvre le jour
 * si startDate ≤ iso ≤ endDate. La durée `days` est la durée **totale** de
 * l'absence (peut couvrir plusieurs jours). Pour un jour donné on la ramène
 * à une demi-journée si days/nbJoursCoverts < 1.
 * @returns {'full'|'half'|null}
 */
export function supportAbsenceDayLevel(memberName, iso, absences) {
    const dayMs = 86400000;
    const hits = (absences || []).filter(a =>
        a.memberName === memberName && a.startDate <= iso && a.endDate >= iso
    );
    if (!hits.length) return null;
    // Somme les fractions de jours d'absence qui tombent sur ce jour précis
    let total = 0;
    for (const a of hits) {
        const start = new Date(a.startDate + 'T00:00:00');
        const end   = new Date(a.endDate   + 'T00:00:00');
        const span  = Math.max(1, Math.round((end - start) / dayMs) + 1);
        total += (a.days || 1) / span;
    }
    if (total >= 0.9) return 'full';
    if (total >= 0.4) return 'half';
    return null;
}

// Jour de la semaine ISO → index getDay() (0 = dim, 1 = lun, …, 5 = ven).
// Modes supportés côté backend : monday | wednesday | friday (cf. SupportRotation.week_mode).
export const SUPPORT_WEEK_MODES = {
    monday:    { dow: 1, label: 'Lun → Dim' },
    wednesday: { dow: 3, label: 'Mer → Mar' },
    friday:    { dow: 5, label: 'Ven → Jeu' },
};
export const SUPPORT_WEEK_MODE_DEFAULT = 'friday';   // 1er jour de sprint sur la plupart des équipes

/** Récupère le mode semaine d'une équipe depuis localStorage (clé `rot-mode-<team>`). */
export function getSupportWeekMode(team) {
    const stored = (typeof localStorage !== 'undefined' && team) ? localStorage.getItem(`rot-mode-${team}`) : null;
    return (stored && SUPPORT_WEEK_MODES[stored]) ? stored : SUPPORT_WEEK_MODE_DEFAULT;
}

// ── Granularité jour (variante mini-strip) ──────────────────────────────────
// getDay() (0=dim … 6=sam) → lettre FR. Un membre couvre 5 jours ouvrés max/semaine.
const _DOW_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/**
 * Jours ouvrés (Lun→Ven) contenus dans la fenêtre 7 jours [weekStart, weekStart+6].
 * Toute fenêtre de 7 jours consécutifs contient exactement 5 jours ouvrés, quel que
 * soit le jour de bascule de l'équipe. L'index (0-4) = position chronologique et sert
 * de clé stable dans `memberDays` (indépendant du weekMode).
 * @param {string} weekStart  ISO YYYY-MM-DD
 * @returns {Array<{index:number, iso:string, letter:string}>}
 */
export function supportWorkingDays(weekStart) {
    if (!weekStart) return [];
    const base = new Date(weekStart + 'T00:00:00');
    const out = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;               // saute samedi/dimanche
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        out.push({ index: out.length, iso, letter: _DOW_LETTER[dow] });
    }
    return out;
}

/**
 * Jours effectifs d'un membre pour une semaine donnée.
 * Fallback rétro-compatible : un membre présent dans `members` mais absent de
 * `memberDays` = semaine pleine (les 5 jours ouvrés).
 * @returns {number[]} indices de jours ouvrés (0-4), triés
 */
export function supportDaysForMember(entry, memberName) {
    if (!entry) return [];
    const md = entry.memberDays || entry.member_days || {};
    if (Object.prototype.hasOwnProperty.call(md, memberName)) {
        return [...(md[memberName] || [])].sort((a, b) => a - b);
    }
    return (entry.members || []).includes(memberName) ? [0, 1, 2, 3, 4] : [];
}

// ── Membres exclus du support (rôles non éligibles : Manager, RTE, PO, …) ──
// Stockage : localStorage `rot-inactive` = JSON array de noms. Global (pas par équipe).
// Un membre marqué inactif est exclu du shuffle ET affiché grisé dans la grille.
const _ROT_INACTIVE_KEY = 'rot-inactive';
export function getInactiveSupportMembers() {
    try { return JSON.parse(localStorage.getItem(_ROT_INACTIVE_KEY) || '[]'); }
    catch { return []; }
}
export function isMemberSupportActive(name) {
    if (!name) return false;
    return !getInactiveSupportMembers().includes(name);
}
export function setMemberSupportActive(name, active) {
    if (!name) return;
    const list = getInactiveSupportMembers();
    const idx = list.indexOf(name);
    if (active) { if (idx >= 0) list.splice(idx, 1); }
    else        { if (idx < 0)  list.push(name); }
    localStorage.setItem(_ROT_INACTIVE_KEY, JSON.stringify(list));
}

/**
 * Construit les semaines du PI courant et du PI suivant.
 * Une "semaine" = { label, weekStart, weekEnd } (ISO YYYY-MM-DD).
 *
 * **Sources d'ancrage temporel** (par priorité) :
 *   1. `piInfo.startDate` — source de vérité absolue (saisie utilisateur dans Settings → PI).
 *      Ex: PI 30 = "2026-06-12" (vendredi). Évite toute dérivation fragile.
 *   2. Fallback : dérivation depuis `sprintInfo.startDate - (sprintIdx) × sprintDuration`.
 *      Marche si le sprint actif est correctement aligné mais sensible aux décalages.
 *
 * @param {{number?, sprintsPerPI?, sprintDuration?, startDate?}} piInfo
 * @param {{name?, startDate?}} sprintInfo  Sprint actif (fallback d'ancrage)
 * @param {string} [weekMode='friday']  monday | wednesday | friday — 1er jour de chaque semaine
 */
export function buildSupportPiWeeks(piInfo, sprintInfo, weekMode = SUPPORT_WEEK_MODE_DEFAULT) {
    const sprintCnt = piInfo?.sprintsPerPI  || 5;
    const sprintDur = piInfo?.sprintDuration || 14;
    const piNum     = piInfo?.number || '';
    const wps       = Math.max(1, Math.floor(sprintDur / 7));
    const targetDow = (SUPPORT_WEEK_MODES[weekMode] || SUPPORT_WEEK_MODES[SUPPORT_WEEK_MODE_DEFAULT]).dow;

    // Formate une Date locale en YYYY-MM-DD sans conversion UTC (évite le décalage timezone).
    const _fmt = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    const _add = (d, n) => {
        const dt = new Date(d + 'T00:00:00');
        dt.setDate(dt.getDate() + n);
        return _fmt(dt);
    };
    // Snap au jour de semaine ciblé (recul jusqu'à 6j max).
    const _snap = (iso) => {
        const d = new Date(iso + 'T00:00:00');
        const back = (d.getDay() - targetDow + 7) % 7;
        d.setDate(d.getDate() - back);
        return _fmt(d);
    };

    // Priorité 1 : piInfo.startDate si saisi explicitement par l'utilisateur.
    // Cette date n'est PAS snappée — on respecte le choix utilisateur (qui sait que son PI commence un vendredi).
    // Si jamais l'utilisateur a saisi une date qui ne correspond pas au weekMode actuel, on snappe quand même
    // pour aligner avec les semaines (sinon les rotations seraient désynchronisées du sprint).
    let piStartSnapped;
    if (piInfo?.startDate) {
        piStartSnapped = _snap(piInfo.startDate.slice(0, 10));
    } else {
        // Fallback : dérivation depuis sprintInfo
        const anchor = (sprintInfo?.startDate || new Date().toISOString()).slice(0, 10);
        let curIdx = -1;
        if (sprintInfo?.name && piNum) {
            const m = sprintInfo.name.match(/(\d+)\.(\d+)/);
            if (m && parseInt(m[1]) === piNum) curIdx = parseInt(m[2]) - 1;
        }
        const piStart = curIdx >= 0 ? _add(anchor, -curIdx * sprintDur) : anchor;
        piStartSnapped = _snap(piStart);
    }

    const makeWeeks = (pn, ps) => {
        const ws = [];
        for (let s = 0; s < sprintCnt; s++) {
            const ss = _add(ps, s * sprintDur);
            for (let w = 0; w < wps; w++) {
                const wStart = _add(ss, w * 7);
                const wEnd   = _add(wStart, 6);
                ws.push({ label: `${pn}.${s + 1}.${w + 1}`, weekStart: wStart, weekEnd: wEnd });
            }
        }
        return ws;
    };

    const nextPiNum   = piNum ? piNum + 1 : '';
    const nextPiStart = _add(piStartSnapped, sprintCnt * sprintDur);
    return {
        curWeeks:  makeWeeks(piNum,     piStartSnapped),
        nextWeeks: makeWeeks(nextPiNum, nextPiStart),
        curPiNum:  piNum,
        nextPiNum,
        weekMode,
        anchorSource: piInfo?.startDate ? 'config' : 'derived',  // pour diagnostic
    };
}

/**
 * Génère une rotation support pour une équipe sur un ensemble de semaines.
 *
 * RÈGLES MÉTIER (cf. CLAUDE.md, guide-support.md) :
 *   1. **Absence ≥ 3 jours dans la semaine → membre exclu** de cette semaine.
 *   2. **Pas 2 semaines consécutives** : un membre affecté en semaine N est exclu
 *      de la semaine N+1 — sauf si pas assez de monde dispo (contrainte relâchée).
 *   3. **Verrouillage auto du passé** : toute semaine dont `weekEnd < today` est
 *      préservée telle quelle (jamais réécrite par un shuffle).
 *   4. **Verrouillage manuel** : une rotation marquée `locked: true` est préservée.
 *   5. **Équité** : on priorise les membres avec le moins d'affectations cumulées
 *      sur l'ensemble de la rotation (passé inclus). Random pour les ex-aequos.
 *   6. **Tirage final** : `membersPerWeek` membres sélectionnés (ou moins si pool insuffisant).
 *
 * @param {Object} opts
 * @param {string} opts.team
 * @param {Array<{label, weekStart, weekEnd}>} opts.weeks  Semaines à planifier (chronologique)
 * @param {Array<string>} opts.memberNames  Noms des candidats (déjà filtrés par équipe)
 * @param {Array} opts.absences
 * @param {Array} [opts.existingSupport=[]]  Rotations existantes (pour préserver passé/locked)
 * @param {number} [opts.membersPerWeek=2]
 * @param {string} [opts.weekMode='monday']
 * @param {string} [opts.today]  ISO date (override pour tests) — par défaut aujourd'hui
 * @returns {Array} Liste complète { team, weekLabel, weekStart, weekEnd, members, weekMode, membersPerWeek, locked? }
 */
export function generateSupportRotation(opts) {
    const {
        team, weeks, memberNames, absences = [], existingSupport = [],
        membersPerWeek = 2, weekMode = 'monday',
        today = new Date().toISOString().slice(0, 10),
    } = opts;

    const counts = Object.fromEntries(memberNames.map(m => [m, 0]));
    const result = [];
    let lastPicks = [];

    const _findExisting = (w) => existingSupport.find(
        s => s.team === team && s.weekStart === w.weekStart && s.weekEnd === w.weekEnd
    );

    for (const w of weeks) {
        const existing = _findExisting(w);
        const isPast = w.weekEnd < today;
        const isLocked = !!existing?.locked;
        const isPastUnlocked = !!existing?.unlocked;  // déverrou exceptionnel du passé

        // Règle 3 : VERROUILLAGE DUR du passé — une semaine dont weekEnd < today
        // n'est JAMAIS shuffle/réécrite, même si elle n'a pas d'entrée existante.
        // EXCEPTION : si `unlocked: true`, l'utilisateur a déverrouillé exceptionnellement → shuffle autorisé.
        if (isPast && !isPastUnlocked) {
            const preserved = existing || {
                team, weekLabel: w.label, weekStart: w.weekStart, weekEnd: w.weekEnd,
                members: [], weekMode, membersPerWeek,
            };
            result.push({ ...preserved, _autoLocked: true, locked: existing?.locked || false });
            (preserved.members || []).forEach(m => { if (m in counts) counts[m]++; });
            lastPicks = preserved.members || [];
            continue;
        }

        // Règle 4 : verrouillage manuel (locked: true) — préservé même dans le futur
        if (existing && isLocked) {
            result.push({ ...existing, _autoLocked: false });
            (existing.members || []).forEach(m => { if (m in counts) counts[m]++; });
            lastPicks = existing.members || [];
            continue;
        }

        // Règle 1 : exclure les absents ≥ 3j
        const available = memberNames.filter(m => supportAbsenceDays(m, w.weekStart, w.weekEnd, absences) < 3);

        // Règle 2 : pas 2 sem consécutives (relâché si pool insuffisant)
        let pool = available.filter(m => !lastPicks.includes(m));
        if (pool.length < membersPerWeek) pool = available;

        // Règle 5 : tri équité asc + random pour ex-aequo
        pool.sort((a, b) => counts[a] !== counts[b] ? counts[a] - counts[b] : Math.random() - 0.5);
        const picked = pool.slice(0, Math.min(membersPerWeek, pool.length));
        picked.forEach(m => counts[m]++);
        lastPicks = picked;

        result.push({
            team,
            weekLabel: w.label,
            weekStart: w.weekStart,
            weekEnd: w.weekEnd,
            members: picked,
            weekMode,
            membersPerWeek,
            locked: false,
        });
    }

    return result;
}
