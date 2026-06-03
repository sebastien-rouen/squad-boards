/**
 * Simple reactive state store.
 * Subscribe to keys and get notified on changes.
 */
class Store {
    constructor(initial = {}) {
        this._state = { ...initial };
        this._listeners = new Map();
    }

    get(key) {
        return this._state[key];
    }

    set(key, value) {
        const old = this._state[key];
        this._state[key] = value;
        if (old !== value) this._notify(key, value, old);
    }

    update(key, fn) {
        this.set(key, fn(this._state[key]));
    }

    on(key, fn) {
        if (!this._listeners.has(key)) this._listeners.set(key, new Set());
        this._listeners.get(key).add(fn);
        return () => this._listeners.get(key)?.delete(fn);
    }

    _notify(key, value, old) {
        const fns = this._listeners.get(key);
        if (fns) fns.forEach(fn => fn(value, old));
    }

    snapshot() {
        return { ...this._state };
    }
}

export const store = new Store({
    view: localStorage.getItem('sb-view') || 'dashboard',
    team: localStorage.getItem('sb-team') || 'all',
    group: localStorage.getItem('sb-group') || null,  // selected group id
    theme: localStorage.getItem('sb-theme') || 'light',
    syncing: false,
    lastSync: localStorage.getItem('sb-lastSync') || null,
    searchQuery: '',

    // Data
    tickets: [],
    features: [],
    epics: [],
    teams: [],       // string[] of team names
    teamObjects: [], // full team objects with id, name, color
    groups: [],      // group objects with id, name, color, teams[]
    members: [],     // member objects with id, name, team, role
    absences: [],    // absence objects
    support: [],     // support rotation objects
    events: [],      // events (faits marquants)
    retroItems: [],  // retro/amelioration items
    // Atlas (compétences / appétences / mobilité)
    skills: [],            // catalogue compétences
    appetences: [],        // catalogue appétences
    memberSkills: [],      // niveaux par scope (membre|équipe)
    memberAppetences: [],  // appétences par scope
    mobility: [],          // lignes de suivi de mobilité
    sprintInfo: null,
    velocityHistory: [],  // legacy — désormais calculé à la volée via utils.computeVelocityHistory
    piOffset: 0,          // décalage PI sélectionné dans le topbar (-2..+2), 0 = PI courant
    sprintPick: null,     // sprint sélectionné dans la page Sprint (null = sprint actif). Synchronisé avec le hash.
    piInfo: null,

    // Board column labels from JIRA (populated on sync)
    boardColumns: {},

    // Config from server
    jiraConfigured: false,
    project: '',
    jiraUrl: null,
});

// Persist selections
store.on('view', v => localStorage.setItem('sb-view', v));
store.on('team', v => localStorage.setItem('sb-team', v));
store.on('group', v => { if (v) localStorage.setItem('sb-group', v); else localStorage.removeItem('sb-group'); });
store.on('theme', v => localStorage.setItem('sb-theme', v));
store.on('lastSync', v => { if (v) localStorage.setItem('sb-lastSync', v); });
