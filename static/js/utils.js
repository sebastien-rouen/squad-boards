/**
 * Shared utility functions.
 */

import { STATUS_MAP, STATUS_LABELS, TYPE_MAP, TYPE_LABELS, TYPE_ICONS, WIP_STATUSES } from './config.js';

// ── Modules extraits — utils.js reste le point d'entrée unique des vues ────────
export * from './utils/dom.js';
export * from './utils/wiki.js';
export * from './utils/modals.js';
export * from './utils/support.js';
export * from './utils/sprint-scope.js';
export * from './utils/capacity-base.js';

import { esc, toast } from './utils/dom.js';   // usages internes à ce fichier
import { extractSprintLabel } from './utils/sprint-scope.js';   // usages internes à ce fichier
import { getInactiveSupportMembers } from './utils/support.js';   // usages internes à ce fichier


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
 * Clé du groupe de flux correspondant au statut ACTUEL d'un ticket (la colonne où il se trouve
 * maintenant), dérivée du libellé JIRA brut. Renvoie null si le statut n'est pas une colonne
 * suivie (backlog, à faire, terminé…). Source unique partagée par la card Aging WIP et les
 * cartes du board (coloration d'ancienneté).
 */
export function currentStageGroupKey(ticket) {
    const raw = String(ticket?.jiraStatus || ticket?._jiraStatus || '').toLowerCase().trim();
    if (!raw) return null;
    return (STAGE_FLOW_GROUPS.find(g => g.test(raw)) || {}).key || null;
}

/**
 * Référence d'ancienneté par colonne : distribution (P50/P85) des durées passées par les tickets
 * DÉJÀ TERMINÉS dans chaque colonne suivie (issu de stageDurations). Sert de "Service Level
 * Expectation" implicite pour colorer l'âge d'un ticket en cours (vert < P50, ambre P50–P85,
 * rouge ≥ P85). Les tickets exclus du flux sont ignorés (cohérent avec computeStageFlow).
 * @returns {{[key:string]: {p50:number, p85:number, n:number}}}
 */
export function computeStageAgeRefs(tickets) {
    const done = (tickets || []).filter(t => t.status === 'done' && !isTicketExcludedFromFlow(t).excluded);
    const refs = {};
    for (const g of STAGE_FLOW_GROUPS) {
        const vals = [];
        for (const t of done) {
            const sd = t.stageDurations || t.stage_durations || {};
            let sum = 0;
            for (const [rawKey, days] of Object.entries(sd)) {
                if (g.test(rawKey)) sum += days;
            }
            if (sum > 0) vals.push(sum);
        }
        refs[g.key] = { p50: percentile(vals, 50), p85: percentile(vals, 85), n: vals.length };
    }
    return refs;
}

// ── Tickets exclus du calcul de flux (ex: tickets récurrents "OPS" créés chaque PI qui
// faussent la moyenne) ── Stockage : localStorage `stageflow-excluded` = JSON array d'IDs
// (exclusion ticket par ticket) + `stageflow-excluded-patterns` = JSON array de regex
// (source string, testées sur le titre, insensible à la casse — ex: "mouf-mouf" exclut tout
// ticket dont le titre contient ce texte, même recréé avec un nouvel ID à chaque PI).
// Global (pas par équipe) — même pattern que getInactiveSupportMembers().
const _STAGEFLOW_EXCLUDED_KEY = 'stageflow-excluded';
const _STAGEFLOW_PATTERNS_KEY = 'stageflow-excluded-patterns';

export function getExcludedFlowTicketIds() {
    try { return JSON.parse(localStorage.getItem(_STAGEFLOW_EXCLUDED_KEY) || '[]'); }
    catch { return []; }
}
export function isFlowTicketExcluded(id) {
    return !!id && getExcludedFlowTicketIds().includes(id);
}
export function setFlowTicketExcluded(id, excluded) {
    if (!id) return;
    const list = getExcludedFlowTicketIds();
    const idx = list.indexOf(id);
    if (excluded) { if (idx < 0) list.push(id); }
    else          { if (idx >= 0) list.splice(idx, 1); }
    localStorage.setItem(_STAGEFLOW_EXCLUDED_KEY, JSON.stringify(list));
}

export function getExcludedFlowPatterns() {
    try { return JSON.parse(localStorage.getItem(_STAGEFLOW_PATTERNS_KEY) || '[]'); }
    catch { return []; }
}
export function addExcludedFlowPattern(pattern) {
    const p = (pattern || '').trim();
    if (!p) return;
    const list = getExcludedFlowPatterns();
    if (!list.some(x => x.toLowerCase() === p.toLowerCase())) {
        list.push(p);
        localStorage.setItem(_STAGEFLOW_PATTERNS_KEY, JSON.stringify(list));
    }
}
export function removeExcludedFlowPattern(pattern) {
    const list = getExcludedFlowPatterns().filter(x => x !== pattern);
    localStorage.setItem(_STAGEFLOW_PATTERNS_KEY, JSON.stringify(list));
}
/** Motif regex (parmi getExcludedFlowPatterns()) qui matche ce titre, ou null. Regex invalide → ignorée. */
export function matchingExcludedFlowPattern(title) {
    for (const p of getExcludedFlowPatterns()) {
        try { if (new RegExp(p, 'i').test(title || '')) return p; } catch { /* regex invalide, ignorée */ }
    }
    return null;
}
/** Un ticket est exclu s'il est exclu individuellement OU si son titre matche un motif actif. */
export function isTicketExcludedFromFlow(ticket) {
    if (!ticket) return { excluded: false, pattern: null };
    if (isFlowTicketExcluded(ticket.id)) return { excluded: true, pattern: null };
    const pattern = matchingExcludedFlowPattern(ticket.title);
    return { excluded: !!pattern, pattern };
}

/**
 * Durée moyenne (jours) passée par les tickets dans chaque colonne de flux suivie
 * (Revue, En cours de dév, En cours de test, À livrer en qualif, À livrer en prod).
 * Basé sur ticket.stageDurations (durées cumulées par statut JIRA brut, calculées au sync
 * depuis le changelog complet — cf sync.js transformIssue). Ne retourne que les colonnes
 * réellement présentes dans le workflow de l'équipe (au moins un ticket concerné).
 * Les tickets exclus (par ID ou par motif — cf isTicketExcludedFromFlow) sont ignorés du calcul.
 */
/** Percentile (interpolation linéaire) sur un tableau NON trié. Retourne 0 si vide. */
export function percentile(arr, p) {
    if (!arr || !arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    if (s.length === 1) return s[0];
    const idx = (p / 100) * (s.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    const v = lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
    return Math.round(v * 10) / 10;
}

export function computeStageFlow(tickets) {
    return STAGE_FLOW_GROUPS.map(g => {
        const perTicket = [];
        for (const t of (tickets || [])) {
            if (isTicketExcludedFromFlow(t).excluded) continue;
            const sd = t.stageDurations || t.stage_durations || {};
            let sum = 0;
            for (const [rawKey, days] of Object.entries(sd)) {
                if (g.test(rawKey)) sum += days;
            }
            if (sum > 0) perTicket.push(sum);
        }
        if (!perTicket.length) return null;
        const avgDays = Math.round((perTicket.reduce((a, b) => a + b, 0) / perTicket.length) * 10) / 10;
        // Médiane (P50) + P85 : plus robustes que la moyenne face aux tickets « bloqués » extrêmes,
        // et cohérents avec les percentiles utilisés ailleurs (SLA, lead/cycle time).
        const medDays = percentile(perTicket, 50);
        const p85Days = percentile(perTicket, 85);
        return { key: g.key, label: g.label, avgDays, medDays, p85Days, count: perTicket.length };
    }).filter(Boolean);
}

/**
 * Détail d'une colonne de flux (pour la modale ouverte au clic sur un segment) : répartition
 * par libellé JIRA brut (nb tickets, durée moyenne) + liste des tickets concernés triée par
 * durée décroissante. Réutilise STAGE_FLOW_GROUPS (même matching que computeStageFlow).
 * Les tickets exclus (par ID ou par motif) sont retirés de la répartition/moyenne (cohérent
 * avec computeStageFlow) mais restent listés (flag `excluded`/`excludedPattern`) pour pouvoir
 * les réinclure (ou retirer le motif qui les exclut).
 */
export function computeStageFlowDetail(groupKey, tickets) {
    const group = STAGE_FLOW_GROUPS.find(g => g.key === groupKey);
    if (!group) return { byRawStatus: [], tickets: [] };
    const byRawStatus = new Map();
    const ticketRows = [];
    for (const t of (tickets || [])) {
        const { excluded: isExcluded, pattern: excludedPattern } = isTicketExcludedFromFlow(t);
        const sd = t.stageDurations || t.stage_durations || {};
        let sum = 0;
        let matchedRaw = null;
        for (const [rawKey, days] of Object.entries(sd)) {
            if (!group.test(rawKey)) continue;
            sum += days;
            if (!matchedRaw || days > (sd[matchedRaw] || 0)) matchedRaw = rawKey;
            if (isExcluded) continue;
            const entry = byRawStatus.get(rawKey) || { rawStatus: rawKey, count: 0, totalDays: 0 };
            entry.count += 1;
            entry.totalDays += days;
            byRawStatus.set(rawKey, entry);
        }
        if (sum > 0) ticketRows.push({ ticket: t, days: Math.round(sum * 10) / 10, jiraStatus: t.jiraStatus || matchedRaw || '', excluded: isExcluded, excludedPattern });
    }
    ticketRows.sort((a, b) => (a.excluded === b.excluded ? b.days - a.days : (a.excluded ? 1 : -1)));
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

// `extractSprintLabel` a rejoint utils/sprint-scope.js (même famille : le périmètre d'un
// sprint) et reste ré-exporté ci-dessus — les imports depuis '../utils.js' sont inchangés.

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

/** Tokens normalisés d'un nom d'équipe : extractTeam + minuscules + sans accents,
 *  découpé en MOTS. "Team Fuego" → ["fuego"], "GCOM - Fuego" → ["gcom","fuego"]. */
function _teamTokens(name) {
    return extractTeam(String(name || ''))
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

/** Comparaison tolérante de noms d'équipe (CSV RH vs config app peuvent différer légèrement).
 *  Tolère "Team Fuego", "GCOM - Fuego", "FUEGO" face à "Fuego".
 *  ⚠️ Comparaison par MOTS ENTIERS, JAMAIS par sous-chaîne : "O" est une équipe réelle,
 *  contenue dans "Fuego", "Gabbiano", "Lion", "Caméléon"… L'ancienne version
 *  (`tgt.includes(t)`) aspirait donc les membres de l'équipe "O" dans ces équipes —
 *  symptôme : shuffle rotation écrivant 3 membres en base (total "3/3") dont certains
 *  n'ont aucune ligne dans la grille, d'où "il n'y a que 2 personnes affichées". */
export function teamNameMatches(memberTeam, target) {
    if (!memberTeam || !target) return false;
    const a = _teamTokens(memberTeam);
    const b = _teamTokens(target);
    if (!a.length || !b.length) return false;
    if (a.join(' ') === b.join(' ')) return true;
    const sa = new Set(a), sb = new Set(b);
    return a.every(t => sb.has(t)) || b.every(t => sa.has(t));
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
