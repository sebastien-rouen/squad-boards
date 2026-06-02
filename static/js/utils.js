/**
 * Shared utility functions.
 */

import { STATUS_MAP, STATUS_LABELS, TYPE_MAP } from './config.js';

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

/** Escape HTML to prevent XSS. */
export function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
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
        .replace(/\s+-\s+(?:Ite|Iter|Sprint|S)\s*[\d.]+.*/i, '')
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
 * Sprint actif pour l'équipe donnée, depuis le store.
 *
 * Source : `sprintInfo.teamSprints[]` (collecté par sync.js, un sprint par board scrum).
 * Fallback : `sprintInfo` global (legacy single-sprint pour les setups mono-équipe).
 *
 * @param {string|null} team  Nom de l'équipe ou 'all'/null (renvoie le sprint legacy).
 * @returns {object|null}     `{name, startDate, endDate, goal, jiraId, jiraBoardId, team}` ou null.
 */
export function getSprintForTeam(team, sprintInfo = null, targetDate = null) {
    const si = sprintInfo || (typeof window !== 'undefined' && window.__squadBoard?.store?.get('sprintInfo'));
    if (!si) return null;
    const arr = Array.isArray(si.teamSprints) ? si.teamSprints : [];

    // Filtre par équipe (si spécifique) — sinon on prend tous les sprints connus
    const candidates = (team && team !== 'all')
        ? arr.filter(s => s.team === team)
        : arr;

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
        if ((t.labels || []).some(l => /^Buffer$/i.test(l))) bufferPoints += t.points || 0;
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
        if (!(t.labels || []).some(l => /^Buffer$/i.test(l))) continue;
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
        const key = `${a.memberName}|${a.team}`;
        if (!byKey.has(key)) byKey.set(key, { name: a.memberName, team: a.team, role: '' });
    }
    // Merge des rôles depuis la table members (si la personne y existe aussi)
    for (const m of (members || [])) {
        if (!m.name || !m.team) continue;
        const key = `${m.name}|${m.team}`;
        const existing = byKey.get(key);
        if (existing && m.role) existing.role = m.role;
    }
    return [...byKey.values()];
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

        // Règles 3 & 4 : préserver passé et locked
        if (existing && (isPast || isLocked)) {
            result.push({
                ...existing,
                // On marque le passé comme `locked` côté UI pour clarté (mais sans toucher la base)
                _autoLocked: isPast && !isLocked,
            });
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
