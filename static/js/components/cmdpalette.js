/**
 * Command Palette - Ctrl+K global search.
 * Tickets, features, epics, members, views, actions.
 */

import { store } from '../state.js';
import { esc, toast, getSprintForTeam } from '../utils.js';
import { STATUS_LABELS, TYPE_LABELS } from '../config.js';

const HISTORY_KEY   = 'sb-cmd-history';
const FIRST_OPEN_KEY = 'sb-cmd-seen';
const MAX_RESULTS   = 50;
const DEBOUNCE_MS   = 80;

// ── Templates Slack par rituel (texte brut, pas de mrkdwn — Slack n'interprète pas au paste) ──
function _copySlackTpl(kind) {
    const team = store.get('team');
    const teamLabel = (team && team !== 'all') ? team : '';
    const sprint = getSprintForTeam(team, store.get('sprintInfo'));
    const sName = sprint?.name || 'Sprint en cours';
    const sIte  = (sName.match(/(\d+\.\d+)/) || [])[1] || '';
    const tplKey = sName ? `Ite ${sIte}` : 'sprint courant';
    const dayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    const tpls = {
        'daily': `🌅 Daily standup — ${dayLabel}${teamLabel ? '   👥 ' + teamLabel : ''}\n\nLe rituel à 9h30, 15 min max ⏱️\n\nFormat :\n   • Ce que j'ai fait hier\n   • Ce que je fais aujourd'hui\n   • Mes blockers / besoins d'aide 🚨\n\nÀ tout de suite !`,
        'demo-invite': `🎬 Sprint Review / Démo — ${tplKey}${teamLabel ? '   👥 ' + teamLabel : ''}\n\nVendredi 16h00 (45 min)\nLien Squad Board : ouvrir #demo\n\nAu programme :\n   🎯 Sprint Goal\n   🏆 Réalisations\n   📈 Vélocité PI\n   🎭 Mood + ✊ Fist of Five\n   🚀 Décisions & next steps\n\nVenez nombreuses et nombreux ! 🙌`,
        'retro-invite': `🔁 Rétrospective — ${tplKey}${teamLabel ? '   👥 ' + teamLabel : ''}\n\nLundi 14h00 (1h)\nFormat : Glad / Sad / Mad\n\nPréparez-vous mentalement :\n   • Qu'est-ce qui m'a rendu·e content·e ?\n   • Qu'est-ce qui m'a frustré·e ?\n   • Qu'est-ce qu'on aurait pu faire différemment ?\n\nMode anonyme dispo si besoin 🙊`,
        'blocker': `🚨 Blocker — j'ai besoin d'aide${teamLabel ? '   👥 ' + teamLabel : ''}\n\nTicket : <lien JIRA>\nContexte : <2-3 lignes>\n\nCe qui me bloque : <la nature précise>\nCe que j'ai déjà essayé : <les pistes>\n\nQui peut m'aider ? 🙏`,
        'mood': `🎭 Mood Meter — ${tplKey}${teamLabel ? '   👥 ' + teamLabel : ''}\n\nComment vous vous êtes senti·e·s sur ce sprint ?\n\n😞 1 = vraiment pas bien\n😕 2 = pas top\n😐 3 = ça va\n🙂 4 = plutôt bien\n😄 5 = excellent\n\nVotez d'un chiffre 1 à 5 (ou sur Squad Board)`,
        'fist': `✊ Fist of Five — confiance PI${teamLabel ? '   👥 ' + teamLabel : ''}\n\nÀ quel point on est confiant·e·s d'atteindre les objectifs du PI ?\n\n1 = Pas du tout confiance\n2 = Inquiet·e\n3 = Mitigé·e\n4 = Confiant·e\n5 = Très confiant·e\n\nUn chiffre, pas de débat 😉`,
        'pi-planning': `🚀 PI Planning à venir${teamLabel ? '   👥 ' + teamLabel : ''}\n\nDates : <à compléter>\nLieu : <à compléter / lien visio>\n\nÀ préparer :\n   🎯 Vos objectifs candidats (committed / stretch)\n   📊 La capacité prévisionnelle (cf. agenda)\n   🤝 Les dépendances avec les autres équipes\n   📌 Les risques identifiés (ROAM)\n\nVoir Squad Board → PI Planning`,
    };
    const txt = tpls[kind];
    if (!txt) { toast('Template inconnu', 'error'); return; }
    navigator.clipboard.writeText(txt)
        .then(() => toast('📋 Template Slack copié — colle-le dans ton canal !', 'success', 2400))
        .catch(() => toast('Copie impossible', 'error'));
}

let _debounce = null;
let _history  = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

// ── DOM helpers ─────────────────────────────────────────────────────────────
const _overlay  = () => document.getElementById('cmd-overlay');
const _input    = () => document.getElementById('cmd-input');
const _results  = () => document.getElementById('cmd-results');
const _countEl  = () => document.getElementById('cmd-count');

// ── Views navigation ─────────────────────────────────────────────────────────
const VIEWS = [
    { id: 'dashboard',   label: 'Dashboard',          icon: '📊' },
    { id: 'sprint',      label: 'Sprint',             icon: '🏃' },
    { id: 'kanban',      label: 'Kanban',             icon: '📋' },
    { id: 'pi',          label: 'PI Planning',        icon: '🗓️' },
    { id: 'picalendar',  label: 'Calendrier PI',      icon: '📅' },
    { id: 'roadmap',     label: 'Roadmap',            icon: '🗺️' },
    { id: 'retro',       label: 'Rétrospective',      icon: '🔄' },
    { id: 'support',     label: 'Support',            icon: '🛡️' },
    { id: 'roam',        label: 'Risques ROAM',       icon: '⚠️' },
    { id: 'agenda',      label: 'Agenda',             icon: '📆' },
    { id: 'reports',     label: 'Rapports',           icon: '📝' },
    { id: 'settings',    label: 'Paramètres',         icon: '⚙️' },
];

// ── Actions rapides — déclenchent des helpers app sans changer de vue ─────────
// Chacune : id, label, icon, keywords (boost search), run(): void
const ACTIONS = [
    {
        id: 'sync-jira-quick', label: 'Synchroniser JIRA (rapide)', icon: '⚡',
        keywords: 'sync jira rapide quick refresh',
        run: () => document.getElementById('btn-sync')?.click(),
    },
    {
        id: 'sync-jira-full', label: 'Synchroniser JIRA (complète)', icon: '🔄',
        keywords: 'sync jira full complete reset',
        run: () => window.__squadBoard?.handleJiraImport?.('full'),
    },
    {
        id: 'toggle-theme', label: 'Basculer thème clair / sombre', icon: '🌓',
        keywords: 'theme dark light sombre clair mode',
        run: () => {
            const cur = store.get('theme') || 'light';
            const next = cur === 'dark' ? 'light' : 'dark';
            store.set('theme', next);
            document.documentElement.setAttribute('data-theme', next);
        },
    },
    {
        id: 'open-cal-week', label: 'Ouvrir le calendrier de la semaine', icon: '📅',
        keywords: 'calendrier semaine week meetings réunions',
        run: () => import('./cal_banner.js').then(m => m.openCalWeekModal()),
    },
    {
        id: 'open-sprint-review', label: 'Ouvrir Sprint Review (Confluence-ready)', icon: '📋',
        keywords: 'sprint review demo confluence rapport compte-rendu ouvrir modale',
        run: () => window.__squadBoard?.openCurrentSprintReview?.(),
    },
    {
        id: 'open-demo-mode', label: 'Ouvrir la modale Démo (présentation TV fullscreen)', icon: '📺',
        keywords: 'demo démo modal modale ouvrir afficher presentation présentation tv écran fullscreen plein sprint review burnup velocity vélocité mood fist',
        run: () => window.__squadBoard?.openCurrentSprintDemo?.(),
    },
    // ── Templates Slack par rituel (copient un message tout prêt dans le presse-papier) ──
    {
        id: 'slack-daily', label: 'Slack : annonce Daily standup', icon: '🌅',
        keywords: 'slack template daily standup matin rituel',
        run: () => _copySlackTpl('daily'),
    },
    {
        id: 'slack-demo-invite', label: 'Slack : invitation Demo / Sprint Review', icon: '🎬',
        keywords: 'slack template demo review invitation présentation',
        run: () => _copySlackTpl('demo-invite'),
    },
    {
        id: 'slack-retro-invite', label: 'Slack : invitation Rétrospective', icon: '🔁',
        keywords: 'slack template retro rétrospective invitation',
        run: () => _copySlackTpl('retro-invite'),
    },
    {
        id: 'slack-blocker-alert', label: 'Slack : alerte blocker / besoin d\'aide', icon: '🚨',
        keywords: 'slack template blocker bloquant impediment aide',
        run: () => _copySlackTpl('blocker'),
    },
    {
        id: 'slack-mood-poll', label: 'Slack : invitation vote Mood Meter', icon: '🎭',
        keywords: 'slack template mood meter vote sondage humeur',
        run: () => _copySlackTpl('mood'),
    },
    {
        id: 'slack-fist-poll', label: 'Slack : invitation vote Fist of Five', icon: '✊',
        keywords: 'slack template fist confiance pi vote sondage',
        run: () => _copySlackTpl('fist'),
    },
    {
        id: 'slack-pi-planning', label: 'Slack : annonce PI Planning à venir', icon: '🚀',
        keywords: 'slack template pi planning safe planification',
        run: () => _copySlackTpl('pi-planning'),
    },
    {
        id: 'open-alert-unassigned', label: 'Voir les tickets sans assigné·e', icon: '👤',
        keywords: 'alerte sans assigne unassigned personne',
        run: () => import('./alert_modal.js').then(m => m.openAlertModal('unassigned')),
    },
    {
        id: 'open-alert-no-points', label: 'Voir les tickets sans estimation', icon: '📊',
        keywords: 'alerte sans estimation points story',
        run: () => import('./alert_modal.js').then(m => m.openAlertModal('noPoints')),
    },
    {
        id: 'open-alert-old-blockers', label: 'Voir les blockers anciens (> 48h)', icon: '🔴',
        keywords: 'alerte blocker bloque ancien stale',
        run: () => import('./alert_modal.js').then(m => m.openAlertModal('oldBlockers')),
    },
    {
        id: 'open-alert-scope-creep', label: 'Voir le périmètre élargi', icon: '📈',
        keywords: 'alerte scope creep perimetre elargi ajoute',
        run: () => import('./alert_modal.js').then(m => m.openAlertModal('scopeCreep')),
    },
    {
        id: 'team-all', label: 'Voir toutes les équipes', icon: '👥',
        keywords: 'toutes equipes all team filter',
        run: () => { store.set('team', 'all'); store.set('group', null); },
    },
    {
        id: 'open-jira', label: 'Ouvrir JIRA dans un nouvel onglet', icon: '🔗',
        keywords: 'jira browse external open lien',
        run: () => { const u = store.get('jiraUrl'); if (u) window.open(u, '_blank', 'noopener'); },
    },
];

// ── Init ──────────────────────────────────────────────────────────────────────
export function initCmdPalette() {
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            _isOpen() ? _close() : _open();
        }
        if (!_isOpen()) return;
        if (e.key === 'Escape') { _close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); _move(1); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); _move(-1); return; }
        if (e.key === 'Enter')     { e.preventDefault(); _confirmActive(e); return; }
    });

    _overlay()?.addEventListener('click', e => {
        if (e.target === _overlay()) _close();
    });

    _input()?.addEventListener('input', e => {
        _markSeen();
        clearTimeout(_debounce);
        _debounce = setTimeout(() => _search(e.target.value.trim()), DEBOUNCE_MS);
    });
}

// ── Open / close ──────────────────────────────────────────────────────────────
function _isOpen() { return !_overlay()?.classList.contains('cmd-hidden'); }

const _footerTips = () => document.getElementById('cmd-footer-tips');

function _open() {
    _overlay()?.classList.remove('cmd-hidden');
    const inp = _input();
    if (!inp) return;
    inp.value = '';
    inp.focus();
    // Affiche les tips dans le footer uniquement à la 1ère ouverture
    const isFirstOpen = !localStorage.getItem(FIRST_OPEN_KEY);
    const tipsEl = _footerTips();
    if (tipsEl) tipsEl.hidden = !isFirstOpen;
    _renderEmpty();
}

function _markSeen() {
    if (!localStorage.getItem(FIRST_OPEN_KEY)) {
        localStorage.setItem(FIRST_OPEN_KEY, '1');
        const tipsEl = _footerTips();
        if (tipsEl) tipsEl.hidden = true;
    }
}

function _close() {
    _overlay()?.classList.add('cmd-hidden');
    _input() && (_input().value = '');
}

// ── Empty state (history + actions populaires + hints) ──────────────────────
function _renderEmpty() {
    const el = _results();
    if (!el) return;
    let html = '';
    if (_history.length) {
        html += `<div class="cmd-group-label">🕘 Récents</div>`;
        html += _history.slice(0, 5).map(q =>
            `<div class="cmd-item cmd-history" data-query="${esc(q)}">
                <span class="cmd-item-icon">🔍</span>
                <span class="cmd-item-title">${esc(q)}</span>
            </div>`
        ).join('');
    }
    // Actions populaires (top 5) — accessibles immédiatement
    html += `<div class="cmd-group-label">✨ Actions rapides</div>`;
    html += ACTIONS.slice(0, 5).map(a =>
        `<div class="cmd-item" data-group="action" data-id="${esc(a.id)}" tabindex="-1">
            <span class="cmd-item-icon">${a.icon}</span>
            <span class="cmd-item-title">${esc(a.label)}</span>
        </div>`
    ).join('');
    el.innerHTML = html;
    _countEl() && (_countEl().textContent = '');
    el.querySelectorAll('.cmd-history').forEach(item => {
        item.addEventListener('click', () => {
            _input().value = item.dataset.query;
            _search(item.dataset.query);
        });
    });
    el.querySelectorAll('.cmd-item[data-group="action"]').forEach(item => {
        item.addEventListener('click', e => _activate(item, e));
        item.addEventListener('mouseenter', () => _setActive(item));
    });
    _setActive(el.querySelector('.cmd-item'));
}

// ── Query parser ──────────────────────────────────────────────────────────────
function _parse(q) {
    const filters = { assignee: null, team: null, status: null, type: null };
    const words = [];
    for (const tok of q.split(/\s+/)) {
        if (!tok) continue;
        if (tok.startsWith('@')) { filters.assignee = tok.slice(1).toLowerCase(); continue; }
        const m = tok.match(/^(team|status|type):(.+)$/i);
        if (m) { filters[m[1].toLowerCase()] = m[2].toLowerCase(); continue; }
        words.push(tok.toLowerCase());
    }
    return { filters, text: words.join(' ') };
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function _score(haystack, needle) {
    if (!needle) return 0.5;
    const h = (haystack || '').toLowerCase();
    if (!h) return 0;
    if (h === needle) return 100;
    if (h.startsWith(needle)) return 80;
    if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(h)) return 60;
    if (h.includes(needle)) return 40;
    return 0;
}

function _matchFilters(t, filters) {
    if (filters.assignee && !(t.leader || t.assignee || '').toLowerCase().includes(filters.assignee)) return false;
    if (filters.team   && (t.team || '').toLowerCase() !== filters.team) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.type   && t.type  !== filters.type) return false;
    return true;
}

// ── Search ────────────────────────────────────────────────────────────────────
function _search(q) {
    if (!q) { _renderEmpty(); return; }
    const { filters, text } = _parse(q);
    const hasFilters = Object.values(filters).some(Boolean);
    const results = [];

    // Views
    if (!hasFilters && text) {
        for (const v of VIEWS) {
            const s = _score(v.label, text);
            if (s > 0) results.push({ group: 'view', score: s + 20, item: v });
        }
        // Actions (commandes app) — keywords boost
        for (const a of ACTIONS) {
            const sLabel = _score(a.label, text);
            const sKey = _score(a.keywords, text);
            const s = Math.max(sLabel, sKey * 0.85);
            if (s > 0) results.push({ group: 'action', score: s + 25, item: a });
        }
    }

    // Tickets
    const team    = store.get('team');
    const tickets = store.get('tickets') || [];
    const epics   = store.get('epics') || [];
    const features = store.get('features') || [];
    const members = store.get('members') || [];

    const allItems = [
        ...tickets.map(t => ({ ...t, _group: 'ticket' })),
        ...epics.map(t => ({ ...t, _group: 'epic' })),
        ...features.map(t => ({ ...t, _group: 'feature' })),
    ];

    for (const t of allItems) {
        if (!_matchFilters(t, filters)) continue;
        let s = 0;
        if (text) {
            s = Math.max(s, _score(t.id, text));
            s = Math.max(s, _score(t.title, text));
            s = Math.max(s, _score(t.leader || t.assignee, text) * 0.8);
            s = Math.max(s, _score(t.team, text) * 0.6);
            for (const l of t.labels || []) s = Math.max(s, _score(l, text) * 0.9);
            if (s === 0) continue;
        } else if (hasFilters) {
            s = 50;
        }
        // Boost bloqués / critiques
        if (t.status === 'blocked') s += 15;
        if (t.priority === 'critical' || t.priority === 'highest') s += 10;
        results.push({ group: t._group, score: s, item: t });
    }

    // Members
    if (text) {
        for (const m of members) {
            const name = m.name || m;
            const s = _score(name, text);
            if (s > 0) results.push({ group: 'member', score: s, item: { id: name, title: name, team: m.team, role: m.role } });
        }
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, MAX_RESULTS);

    if (q.length >= 3) _saveHistory(q);
    _renderResults(top, text);
}

// ── Render results ─────────────────────────────────────────────────────────────
const _STATUS_COLOR = { done: '#10B981', inprog: '#3B82F6', review: '#8B5CF6', test: '#06B6D4', blocked: '#EF4444', todo: '#94A3B8' };
const _GROUP_ICON   = { ticket: '🎫', epic: '⚡', feature: '📦', view: '📐', member: '👤', action: '✨' };
const _GROUP_LABEL  = { ticket: 'Tickets', epic: 'Epics', feature: 'Features', view: 'Vues', member: 'Membres', action: 'Actions' };

function _highlight(text, term) {
    if (!term || !text) return esc(text || '');
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc(text).replace(new RegExp(`(${safe})`, 'gi'), '<mark class="cmd-hl">$1</mark>');
}

function _renderResults(results, term) {
    const el = _results();
    if (!el) return;
    if (!results.length) {
        el.innerHTML = `<div class="cmd-empty">Aucun résultat</div>`;
        _countEl() && (_countEl().textContent = '');
        return;
    }

    const groups = {};
    for (const r of results) {
        if (!groups[r.group]) groups[r.group] = [];
        groups[r.group].push(r);
    }

    const ORDER = ['action', 'view', 'ticket', 'feature', 'epic', 'member'];
    let html = '';
    let total = 0;

    for (const grp of ORDER) {
        const items = groups[grp];
        if (!items?.length) continue;
        html += `<div class="cmd-group-label">${_GROUP_ICON[grp]} ${_GROUP_LABEL[grp]} <span class="cmd-group-count">${items.length}</span></div>`;
        for (const { item } of items) {
            const statusColor = _STATUS_COLOR[item.status] || '#94A3B8';
            const typeLabel   = TYPE_LABELS[item.type] || item.type || '';
            const pts         = item.points ? `<span class="cmd-pts">${item.points}</span>` : '';
            const statusBadge = item.status
                ? `<span class="cmd-status" style="background:${statusColor}22;color:${statusColor};border-color:${statusColor}44">${STATUS_LABELS[item.status] || item.status}</span>`
                : '';
            const typeBadge = typeLabel
                ? `<span class="cmd-type badge badge-type badge-${item.type} badge-2xs">${esc(typeLabel)}</span>`
                : '';
            const meta = item.team ? `<span class="cmd-meta">${esc(item.team)}</span>` : '';
            const idEl = item.id !== item.title
                ? `<span class="cmd-id">${esc(item.id)}</span>`
                : '';

            html += `<div class="cmd-item" data-group="${grp}" data-id="${esc(item.id)}" tabindex="-1">
                <span class="cmd-item-icon">${_GROUP_ICON[grp]}</span>
                ${idEl}
                ${typeBadge}
                <span class="cmd-item-title">${_highlight(item.title || item.label || item.id, term)}</span>
                ${pts}
                ${statusBadge}
                ${meta}
            </div>`;
            total++;
        }
    }

    el.innerHTML = html;
    _countEl() && (_countEl().textContent = `${total} résultat${total > 1 ? 's' : ''}`);

    el.querySelectorAll('.cmd-item[data-group]').forEach(item => {
        item.addEventListener('click', e => _activate(item, e));
        item.addEventListener('mouseenter', () => _setActive(item));
    });

    _setActive(el.querySelector('.cmd-item'));
}

// ── Keyboard nav ──────────────────────────────────────────────────────────────
function _move(dir) {
    const items = [...(_results()?.querySelectorAll('.cmd-item[data-group]') || [])];
    if (!items.length) return;
    const cur = _results()?.querySelector('.cmd-item--active');
    let idx = cur ? items.indexOf(cur) + dir : dir === 1 ? 0 : items.length - 1;
    idx = Math.max(0, Math.min(idx, items.length - 1));
    _setActive(items[idx]);
    items[idx].scrollIntoView({ block: 'nearest' });
}

function _setActive(el) {
    _results()?.querySelectorAll('.cmd-item--active').forEach(i => i.classList.remove('cmd-item--active'));
    el?.classList.add('cmd-item--active');
}

function _confirmActive(e) {
    const active = _results()?.querySelector('.cmd-item--active');
    if (active) _activate(active, e);
}

// ── Action on click ───────────────────────────────────────────────────────────
function _activate(el, e) {
    const { group, id } = el.dataset;
    const jiraUrl = store.get('jiraUrl');

    if ((e?.ctrlKey || e?.metaKey) && jiraUrl && ['ticket', 'epic', 'feature'].includes(group)) {
        window.open(`${jiraUrl}/browse/${id}`, '_blank', 'noopener');
        _close();
        return;
    }

    if (group === 'view') {
        store.set('view', id);
        window.location.hash = id;
        _close();
        return;
    }

    if (group === 'action') {
        const action = ACTIONS.find(a => a.id === id);
        _close();
        if (action) {
            try { action.run(); } catch (err) { console.error('[cmd] action failed:', err); }
        }
        return;
    }

    if (['ticket', 'epic', 'feature'].includes(group)) {
        _close();
        window.__squadBoard?.openTicketModal?.(id);
        return;
    }

    _close();
}

// ── History ───────────────────────────────────────────────────────────────────
function _saveHistory(q) {
    _history = [q, ..._history.filter(h => h !== q)].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(_history));
}
