/**
 * API client for the Squad Board backend.
 * Full CRUD on all entities - no JIRA dependency.
 */

async function request(path, options = {}) {
    const resp = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || `HTTP ${resp.status}`);
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
export const updateSprint    = data => request('/api/sprint', { method: 'PUT', body: JSON.stringify(data) });

// ── PI ────────────────────────────────────────────────────────────────────────
export const getPI           = ()   => request('/api/pi');
export const updatePI        = data => request('/api/pi', { method: 'PUT', body: JSON.stringify(data) });
// Snapshot des membres d'un PI (fusion — n'écrase pas les autres PI)
export const setPiMembers    = (piNumber, members) => request(`/api/pi/members/${piNumber}`, { method: 'PUT', body: JSON.stringify({ members }) });
// Snapshot des objectifs d'un PI (fusion — n'écrase pas les autres PI ; synchronise `objectives` si PI courant)
export const setPiObjectives = (piNumber, objectives) => request(`/api/pi/objectives/${piNumber}`, { method: 'PUT', body: JSON.stringify({ objectives }) });

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

export const bulkCreateAbsences = (absences, replace = false) => request('/api/absences/bulk', {
    method: 'POST', body: JSON.stringify({ absences, replace }),
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

// ── Risks (ROAM board) ────────────────────────────────────────────────────────
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
export const importAll       = (data, mode = 'replace') => request('/api/import', {
    method: 'POST',
    body: JSON.stringify({ ...data, mode }),
});

// ── Calendriers ICS ───────────────────────────────────────────────────────────
export const getCalendars      = ()          => request('/api/calendars');
export const createCalendar    = data        => request('/api/calendars', { method: 'POST', body: JSON.stringify(data) });
export const updateCalendar    = (id, data)  => request(`/api/calendars/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCalendar    = id          => request(`/api/calendars/${id}`, { method: 'DELETE' });
export const refreshCalendar   = id          => request(`/api/calendars/${id}/refresh`, { method: 'POST' });
export const getCalendarEvents = (params={}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString();
    return request(`/api/calendars/events${qs ? '?' + qs : ''}`);
};

// ── JIRA Proxy (optional) ────────────────────────────────────────────────────
export const jiraGet = (path, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/jira/${path}${qs ? '?' + qs : ''}`);
};
