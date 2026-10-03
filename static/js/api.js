/**
 * API client for the Squad Board backend.
 * Full CRUD on all entities - no JIRA dependency.
 */

// Signal réseau pour le bandeau hors ligne (offline_banner.js). Un `fetch` qui n'obtient
// AUCUNE réponse est une panne de réseau ou de serveur — pas un 4xx/5xx, qui, lui, est une
// réponse. Gardé silencieux hors navigateur (tests Node).
const _emit = name => { if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') window.dispatchEvent?.(new CustomEvent(name)); };

async function request(path, options = {}) {
    let resp;
    try {
        resp = await fetch(path, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        });
    } catch (netErr) {
        _emit('sb:api-offline');
        const e = new Error('API injoignable — vérifie le réseau ou le serveur');
        e.status = 0;
        e.offline = true;
        e.cause = netErr;
        throw e;
    }
    _emit('sb:api-online');
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        const e = new Error(err.detail || `HTTP ${resp.status}`);
        // Le code HTTP permet aux appelants de distinguer une panne d'authentification
        // d'une absence de donnees : sans lui, un 401 se raconte comme « aucun resultat ».
        e.status = resp.status;
        throw e;
    }
    if (resp.status === 204) return null;
    return resp.json();
}

// ── Config ────────────────────────────────────────────────────────────────────
export const getConfig = () => request('/api/config');

// ── Tickets ───────────────────────────────────────────────────────────────────
export const getTickets = (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/tickets${qs ? '?' + qs : ''}`);
};
export const getTicket      = id    => request(`/api/tickets/${id}`);
export const createTicket    = data  => request('/api/tickets', { method: 'POST', body: JSON.stringify(data) });
export const updateTicket    = (id, data) => request(`/api/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTicket    = id    => request(`/api/tickets/${id}`, { method: 'DELETE' });

// ── Comments (sub-resource of ticket) ─────────────────────────────────────────
export const addComment      = (ticketId, data) => request(`/api/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify(data) });
export const deleteComment   = (ticketId, commentId) => request(`/api/tickets/${ticketId}/comments/${commentId}`, { method: 'DELETE' });

// ── Features ──────────────────────────────────────────────────────────────────
export const getFeatures     = ()   => request('/api/features');
export const createFeature   = data => request('/api/features', { method: 'POST', body: JSON.stringify(data) });
export const updateFeature   = (id, data) => request(`/api/features/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteFeature   = id   => request(`/api/features/${id}`, { method: 'DELETE' });

// ── Epics ─────────────────────────────────────────────────────────────────────
export const getEpics        = ()   => request('/api/epics');
export const createEpic      = data => request('/api/epics', { method: 'POST', body: JSON.stringify(data) });
export const updateEpic      = (id, data) => request(`/api/epics/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEpic      = id   => request(`/api/epics/${id}`, { method: 'DELETE' });

// ── Members ───────────────────────────────────────────────────────────────────
export const getMembers      = ()   => request('/api/members');
export const createMember    = data => request('/api/members', { method: 'POST', body: JSON.stringify(data) });
export const updateMember    = (id, data) => request(`/api/members/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMember    = id   => request(`/api/members/${id}`, { method: 'DELETE' });

// ── Atlas : Skills, Appétences, Mobilité ──────────────────────────────────────
export const getSkills           = ()   => request('/api/skills');
export const createSkill         = data => request('/api/skills', { method: 'POST', body: JSON.stringify(data) });
export const updateSkill         = (id, data) => request(`/api/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSkill         = id   => request(`/api/skills/${id}`, { method: 'DELETE' });
export const getAppetences       = ()   => request('/api/appetences');
export const createAppetence     = data => request('/api/appetences', { method: 'POST', body: JSON.stringify(data) });
export const updateAppetence     = (id, data) => request(`/api/appetences/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAppetence     = id   => request(`/api/appetences/${id}`, { method: 'DELETE' });
export const getMemberSkills     = ()   => request('/api/member-skills');
export const upsertMemberSkill   = data => request('/api/member-skills', { method: 'PUT', body: JSON.stringify(data) });
export const getSkillHistory     = (scope = 'member', key = '') => request(`/api/skill-history?${new URLSearchParams({ scope, key })}`);   // 3.198.0
export const getMemberAppetences = ()   => request('/api/member-appetences');
export const upsertMemberAppetence = data => request('/api/member-appetences', { method: 'PUT', body: JSON.stringify(data) });
export const getMobility         = ()   => request('/api/mobility');
export const upsertMobility      = data => request('/api/mobility', { method: 'PUT', body: JSON.stringify(data) });
export const deleteMobility      = id   => request(`/api/mobility/${id}`, { method: 'DELETE' });

// ── Teams ─────────────────────────────────────────────────────────────────────
export const getTeams        = ()   => request('/api/teams');
export const createTeam      = data => request('/api/teams', { method: 'POST', body: JSON.stringify(data) });
export const updateTeam      = (id, data) => request(`/api/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTeam      = id   => request(`/api/teams/${id}`, { method: 'DELETE' });

// ── Sprint ────────────────────────────────────────────────────────────────────
export const getSprint       = ()   => request('/api/sprint');
export const getSyncStamp    = ()   => request('/api/sync-stamp');   // heure du dernier import JIRA (mode TV)
// Statuts forcés (Paramètres → JIRA) : {done|inprog|todo: {statuses, exceptTeams}} ; {} = valeurs par défaut
export const setStatusOverride = data => request('/api/pi/status-override', { method: 'PUT', body: JSON.stringify(data || {}) });
export const updateSprint    = data => request('/api/sprint', { method: 'PUT', body: JSON.stringify(data) });

// ── PI ────────────────────────────────────────────────────────────────────────
export const getPI           = ()   => request('/api/pi');
export const updatePI        = data => request('/api/pi', { method: 'PUT', body: JSON.stringify(data) });
// Snapshot des membres d'un PI (fusion — n'écrase pas les autres PI)
export const setPiMembers    = (piNumber, members) => request(`/api/pi/members/${piNumber}`, { method: 'PUT', body: JSON.stringify({ members }) });
// Snapshot des objectifs d'un PI (fusion — n'écrase pas les autres PI ; synchronise `objectives` si PI courant)
export const setPiObjectives = (piNumber, objectives) => request(`/api/pi/objectives/${piNumber}`, { method: 'PUT', body: JSON.stringify({ objectives }) });
// Baseline de commitment d'un PI (fusion) — { features:[{id,title,team,points,status}], committedPts }
export const setPiBaseline   = (piNumber, payload) => request(`/api/pi/baseline/${piNumber}`, { method: 'PUT', body: JSON.stringify(payload) });
// Mode de semaine de support d'UNE équipe (fusion côté serveur, les autres équipes sont préservées)
export const setSupportWeekMode = (team, mode) => request('/api/pi/support-week-mode', { method: 'PUT', body: JSON.stringify({ team, mode }) });

// ── Groups (lignes produit) ───────────────────────────────────────────────────
export const getGroups       = ()   => request('/api/groups');
export const createGroup     = data => request('/api/groups', { method: 'POST', body: JSON.stringify(data) });
export const updateGroup     = (id, data) => request(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteGroup     = id   => request(`/api/groups/${id}`, { method: 'DELETE' });

// ── Absences ──────────────────────────────────────────────────────────────────
export const getAbsences     = (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/absences${qs ? '?' + qs : ''}`);
};
export const createAbsence   = data => request('/api/absences', { method: 'POST', body: JSON.stringify(data) });
export const bulkMergeMembers = (members, replace = false) => request('/api/members/bulk', {
    method: 'POST',
    body: JSON.stringify({ members, replace }),
});

export const bulkCreateAbsences = (absences, replace = false, replaceRange = null) => request('/api/absences/bulk', {
    method: 'POST', body: JSON.stringify({ absences, replace, replaceRange }),
});
export const updateAbsence   = (id, data) => request(`/api/absences/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAbsence   = id   => request(`/api/absences/${id}`, { method: 'DELETE' });

// ── Support Rotation ──────────────────────────────────────────────────────────
export const getSupport      = (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/support${qs ? '?' + qs : ''}`);
};
export const createSupport   = data => request('/api/support', { method: 'POST', body: JSON.stringify(data) });
export const bulkCreateSupport = (team, rotations) => request('/api/support/bulk', {
    method: 'POST', body: JSON.stringify({ team, rotations }),
});
export const updateSupport   = (id, data) => request(`/api/support/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSupport   = id   => request(`/api/support/${id}`, { method: 'DELETE' });

// ── Mood / Fist of Five ───────────────────────────────────────────────────────
export const getMood         = (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/mood${qs ? '?' + qs : ''}`);
};
export const createMood      = data => request('/api/mood', { method: 'POST', body: JSON.stringify(data) });
export const deleteMood      = id   => request(`/api/mood/${id}`, { method: 'DELETE' });

// ── Planning Poker (ré-estimation collaborative, live via polling) ──────────────
const _pk = t => `/api/poker/${encodeURIComponent(t)}`;
export const getPoker        = ticket          => request(_pk(ticket));
export const pokerVote       = (ticket, voter, value) =>
    request(`${_pk(ticket)}/vote`, { method: 'POST', body: JSON.stringify({ voter, value }) });
export const pokerReveal     = ticket          => request(`${_pk(ticket)}/reveal`, { method: 'POST' });
export const pokerReset      = ticket          => request(`${_pk(ticket)}/reset`, { method: 'POST' });
export const pokerLeave      = (ticket, voter) => request(`${_pk(ticket)}/voter/${encodeURIComponent(voter)}`, { method: 'DELETE' });

// ── Retro Items ───────────────────────────────────────────────────────────────
export const getRetro        = (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/retro${qs ? '?' + qs : ''}`);
};
export const createRetro     = data => request('/api/retro', { method: 'POST', body: JSON.stringify(data) });
export const updateRetro     = (id, data) => request(`/api/retro/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRetro     = id   => request(`/api/retro/${id}`, { method: 'DELETE' });

// ── Events (Faits marquants) ──────────────────────────────────────────────────
export const getEvents       = ()   => request('/api/events');
export const createEvent     = data => request('/api/events', { method: 'POST', body: JSON.stringify(data) });
export const updateEvent     = (id, data) => request(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEvent     = id   => request(`/api/events/${id}`, { method: 'DELETE' });

// ── Risks (ROAM) ──────────────────────────────────────────────────────────────
// ⚠️ PLUS AUCUN APPELANT côté front depuis la 3.146.1 : la vue ROAM et son onglet dans
// PI Planning ont été retirés (fonctionnalité inutilisée, 0 risque en base). Les routes,
// le modèle `Risk` et la colonne restent en place — rien n'est perdu et le front se
// restaure d'un `git revert` — mais ces helpers sont du code mort tant que la vue n'est
// pas rétablie. À supprimer avec le backend le jour où la décision est confirmée.
export const getRisks        = (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/risks${qs ? '?' + qs : ''}`);
};
export const createRisk      = data => request('/api/risks', { method: 'POST', body: JSON.stringify(data) });
export const updateRisk      = (id, data) => request(`/api/risks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRisk      = id   => request(`/api/risks/${id}`, { method: 'DELETE' });
export const rankFeatures    = items => request('/api/features/rank', { method: 'POST', body: JSON.stringify(items) });

// ── Import / Export ───────────────────────────────────────────────────────────
export const getAll          = ()   => request('/api/all');
export const exportAll       = ()   => request('/api/export');
// Bundle de configuration curée (sauvegarde .local, 3.198.0) — cf. app/routers/config_bundle.py
export const exportConfig    = ()   => request('/api/config/export');
export const importConfig    = data => request('/api/config/import', { method: 'POST', body: JSON.stringify(data || {}) });
export const importAll       = (data, mode = 'replace') => request('/api/import', {
    method: 'POST',
    body: JSON.stringify({ ...data, mode }),
});
// Réponse binaire (zip) — ne passe pas par request() qui force resp.json().
export const exportZip = async (keys, format) => {
    const resp = await fetch('/api/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, format }),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.blob();
};

// ── Fiche d'identité d'équipe ──────────────────────────────────────────────────
export const getTeamIdentity    = team => request(`/api/team-identity/${encodeURIComponent(team)}`);
export const updateTeamIdentity = (team, data) => request(`/api/team-identity/${encodeURIComponent(team)}`, {
    method: 'PUT', body: JSON.stringify(data),
});

// ── Ateliers (Team Canvas, Tuckman, maturité Agile, ...) ──────────────────────
export const getWorkshopTemplates   = ()   => request('/api/workshop-templates');
export const createWorkshopTemplate = data => request('/api/workshop-templates', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkshopTemplate = (id, data) => request(`/api/workshop-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteWorkshopTemplate = id   => request(`/api/workshop-templates/${id}`, { method: 'DELETE' });

export const getTeamWorkshops  = (team) => request(`/api/team-workshops${team ? '?team=' + encodeURIComponent(team) : ''}`);
export const upsertTeamWorkshop = data  => request('/api/team-workshops', { method: 'PUT', body: JSON.stringify(data) });
export const deleteTeamWorkshop = id    => request(`/api/team-workshops/${id}`, { method: 'DELETE' });

// ── Pièces jointes d'un atelier (image, PDF, XLS, Doc — 15 Mo max) ────────────
export const getAttachments = workshopId => request(`/api/team-workshops/${workshopId}/attachments`);
export async function uploadAttachment(workshopId, file) {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch(`/api/team-workshops/${workshopId}/attachments`, { method: 'POST', body: form });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
}
export const deleteAttachment = id => request(`/api/attachments/${id}`, { method: 'DELETE' });
export const attachmentDownloadUrl = id => `/api/attachments/${id}/download`;

// ── Calendriers ICS ───────────────────────────────────────────────────────────
export const getCalendars      = ()          => request('/api/calendars');
export const createCalendar    = data        => request('/api/calendars', { method: 'POST', body: JSON.stringify(data) });
export const updateCalendar    = (id, data)  => request(`/api/calendars/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCalendar    = id          => request(`/api/calendars/${id}`, { method: 'DELETE' });
export const refreshCalendar   = id          => request(`/api/calendars/${id}/refresh`, { method: 'POST' });
// Natures d'évènements positionnées à la main (« Classer comme… »), une règle par titre normalisé
export const getCalendarRules   = ()   => request('/api/calendar-rules');
export const saveCalendarRule   = data => request('/api/calendar-rules', { method: 'PUT', body: JSON.stringify(data) });
export const deleteCalendarRule = id   => request(`/api/calendar-rules/${id}`, { method: 'DELETE' });
export const getCalendarEvents = (params={}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/calendars/events${qs ? '?' + qs : ''}`);
};

// ── JIRA Proxy (optional) ────────────────────────────────────────────────────
// Identifiants JIRA surchargeables depuis Paramètres (stockés en localStorage).
// Quand renseignés, ils sont envoyés au proxy via en-têtes X-Jira-* et priment sur le .env.
export const JIRA_LS_KEYS = { url: 'sb-jira-url', user: 'sb-jira-user', token: 'sb-jira-token' };

export function getJiraCreds() {
    return {
        url:   (localStorage.getItem(JIRA_LS_KEYS.url)   || '').trim(),
        user:  (localStorage.getItem(JIRA_LS_KEYS.user)  || '').trim(),
        token: (localStorage.getItem(JIRA_LS_KEYS.token) || '').trim(),
    };
}
export function setJiraCreds({ url, user, token }) {
    const _set = (k, v) => v != null && (v.trim() ? localStorage.setItem(k, v.trim()) : localStorage.removeItem(k));
    _set(JIRA_LS_KEYS.url, url);
    _set(JIRA_LS_KEYS.user, user);
    _set(JIRA_LS_KEYS.token, token);
}
function jiraHeaders() {
    const c = getJiraCreds();
    const h = {};
    if (c.url)   h['X-Jira-Url']   = c.url;
    if (c.user)  h['X-Jira-User']  = c.user;
    if (c.token) h['X-Jira-Token'] = c.token;
    return h;
}

// ── Slack Incoming Webhook ────────────────────────────────────────────────────
export const SLACK_LS_KEYS = { webhook: 'sb-slack-webhook' };
export function getSlackWebhook() { return (localStorage.getItem(SLACK_LS_KEYS.webhook) || '').trim(); }
export function setSlackWebhook(url) {
    const v = (url || '').trim();
    v ? localStorage.setItem(SLACK_LS_KEYS.webhook, v) : localStorage.removeItem(SLACK_LS_KEYS.webhook);
}
/** Envoie un message texte vers le webhook Slack via le proxy backend (contourne CORS). */
export async function sendSlackMessage(text, webhook) {
    const url = webhook || getSlackWebhook();
    if (!url) throw new Error('Aucun webhook Slack configuré (Paramètres → Intégrations → Slack)');
    return request('/api/slack/send', { method: 'POST', body: JSON.stringify({ webhook: url, text }) });
}

/**
 * Traduit une erreur du proxy `/jira/*` en message actionnable.
 *
 * Un 401 ne veut pas dire « pas de données » : il dit que JIRA a refusé la connexion. Les
 * confondre envoyait l'utilisateur vérifier sa liste de projets alors que ses identifiants
 * étaient en cause (« Aucun board scrum pour GCOM, GDEM… » sur un HTTP 401).
 */
export function jiraErrorMessage(e, quoi = 'les données JIRA') {
    const s = e?.status;
    if (s === 401 || s === 403) {
        return `JIRA a refusé la connexion (HTTP ${s}) en récupérant ${quoi}. `
            + `Vérifier l'URL, l'utilisateur et le jeton dans Paramètres → Plugin JIRA `
            + `(un jeton API expire et doit être régénéré).`;
    }
    if (s === 404) return `Ressource JIRA introuvable (404) en récupérant ${quoi} — vérifier l'URL de l'instance.`;
    if (s >= 500)  return `JIRA est indisponible (HTTP ${s}) en récupérant ${quoi} — réessayer plus tard.`;
    return `Impossible de récupérer ${quoi} : ${e?.message || e}`;
}

export const jiraGet = (path, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/jira/${path}${qs ? '?' + qs : ''}`, { headers: jiraHeaders() });
};
