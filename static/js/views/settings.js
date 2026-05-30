/**
 * Settings view - teams, groups, members, absences, support rotation, sprint, JIRA, data.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import {
    esc, fmtDate, fmtRelative, toast, deriveMembersFromAbsences, generateSupportRotation,
    buildSupportPiWeeks, SUPPORT_WEEK_MODES, SUPPORT_WEEK_MODE_DEFAULT, getSupportWeekMode,
    isMemberSupportActive, setMemberSupportActive, getInactiveSupportMembers,
} from '../utils.js';

// ── Reminder configuration ────────────────────────────────────────────────────
const _LS_REMINDERS = 'sb-reminders';

export const REMINDER_DEFS = [
    { id: 'demo',    icon: '🎬', label: 'DEMO Sprint',          dBefore: 0,  enabled: true  },
    { id: 'retro',   icon: '🔄', label: 'Rétrospective',        dBefore: 1,  enabled: true  },
    { id: 'mood',    icon: '🎭', label: 'Mood Meter',           dBefore: 2,  enabled: true  },
    { id: 'fist',    icon: '✊', label: 'Vote de confiance',    dBefore: 0,  enabled: true  },
    { id: 'sondage', icon: '📊', label: 'Sondage équipe',       dBefore: 2,  enabled: false },
    { id: 'planning',icon: '📋', label: 'Sprint Planning',      dBefore: 0,  enabled: false },
];

export function loadReminders() {
    try {
        const saved = JSON.parse(localStorage.getItem(_LS_REMINDERS) || '{}');
        const result = {};
        for (const def of REMINDER_DEFS) {
            result[def.id] = {
                dBefore: saved[def.id]?.dBefore ?? def.dBefore,
                enabled: saved[def.id]?.enabled ?? def.enabled,
            };
        }
        return result;
    } catch { return Object.fromEntries(REMINDER_DEFS.map(d => [d.id, { dBefore: d.dBefore, enabled: d.enabled }])); }
}

function _saveReminders(data) {
    localStorage.setItem(_LS_REMINDERS, JSON.stringify(data));
}

// ── CSV Absences : parser pivot (header = dates dd/mm) ──────────────────────
// Détecte le format RH classique où chaque colonne après les 3-4 colonnes meta
// (Nom, Équipe, Entité, Rôle) représente un jour. La cellule contient le nombre
// de jours d'absence (1 = jour entier, 0.5 = demi-journée, vide = présent).
//
// IMPORTANT : on split sur TAB ou ; uniquement, jamais sur virgule — les noms RH
// sont souvent au format "NOM, Prénom" et la virgule fait partie du nom.
//
// Retourne `{ absences, members }` (les 2 tableaux dérivés du même CSV).
// Les `members` sont uniques par (name|team), avec entity + role capturés depuis
// les colonnes correspondantes du header. Permet de synchroniser la table member
// avec l'entité — sans ça, l'entité du CSV était silencieusement perdue.
//
// Retourne null si le format ne ressemble pas à un pivot (→ fallback ligne).
function _parsePivotAbsencesCsv(raw, year) {
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    const splitLine = (l) => l.split(/[\t;]/).map(c => c.trim());
    const header = splitLine(lines[0]);
    // Cherche des colonnes date dd/mm (avec ou sans année) à partir de la 4e colonne
    const datePattern = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
    const dateCols = [];
    for (let i = 3; i < header.length; i++) {
        const m = header[i].match(datePattern);
        if (m) {
            const dd = m[1].padStart(2, '0');
            const mm = m[2].padStart(2, '0');
            const yy = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : year;
            dateCols.push({ idx: i, iso: `${yy}-${mm}-${dd}` });
        }
    }
    // Heuristique : il faut au moins 3 colonnes date pour considérer que c'est un pivot
    if (dateCols.length < 3) return null;
    // Résolution des colonnes méta (Nom, Équipe, Entité, Rôle) par nom d'en-tête
    const _norm = s => (s || '').toLowerCase().replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ûü]/g, 'u').trim();
    const _findCol = (regex, fallback) => {
        const idx = header.findIndex(h => regex.test(_norm(h)));
        return idx >= 0 ? idx : fallback;
    };
    const nameIdx   = _findCol(/^(noms?|nom[\s,]*prenom|name)/, 0);
    const teamIdx   = _findCol(/^(equipes?|team)s?$/,           1);
    const entityIdx = _findCol(/^(entite|entity|societe|organisation)$/, 2);
    const roleIdx   = _findCol(/^(roles?|fonction|role)s?$/,    3);

    const absences = [];
    const memberByKey = new Map();   // (name|team) → { name, team, entity, role }
    for (let r = 1; r < lines.length; r++) {
        const cols = splitLine(lines[r]);
        // Trim agressif sur les méta (espaces invisibles dans les exports Excel) — évite des doublons
        // type "Alain Lenom" vs "Alain Lenom " (trailing space).
        const name   = (cols[nameIdx]   || '').replace(/\s+/g, ' ').trim();
        const team   = (cols[teamIdx]   || '').replace(/\s+/g, ' ').trim();
        const entity = (cols[entityIdx] || '').replace(/\s+/g, ' ').trim();
        const role   = (cols[roleIdx]   || '').replace(/\s+/g, ' ').trim();
        if (!name) continue;

        // Member unique par (name|team). Si plusieurs lignes du CSV donnent le même
        // (name, team), on garde la 1re ; pour les valeurs non-vides on enrichit.
        const key = `${name}|${team}`;
        if (!memberByKey.has(key)) {
            memberByKey.set(key, { name, team, entity, role });
        } else {
            const existing = memberByKey.get(key);
            if (!existing.entity && entity) existing.entity = entity;
            if (!existing.role && role)     existing.role   = role;
        }

        for (const dc of dateCols) {
            const v = cols[dc.idx];
            if (!v) continue;
            // Cellule = nombre de jours. "1" plein, "0.5" demi. Ignore "0", "-", "x" textuels.
            const num = parseFloat(v.replace(',', '.'));
            if (!num || num <= 0) continue;
            absences.push({
                memberName: name,
                team,
                startDate: dc.iso,
                endDate: dc.iso,
                type: 'conge',
                days: num,
            });
        }
    }
    if (!absences.length && memberByKey.size === 0) return null;
    // Consolidation : regroupe les jours consécutifs en UNE absence avec days = somme.
    // Convention RH : vendredi → lundi est considéré contigu (gap calendaire 3j = week-end).
    return { absences: _consolidateConsecutive(absences), members: [...memberByKey.values()] };
}

// Regroupe les absences journalières d'un même membre+équipe quand elles sont contiguës.
// "Contiguës" = gap calendaire ≤ 3 jours entre 2 dates triées (saute le week-end).
function _consolidateConsecutive(rawAbsences) {
    const byKey = new Map();
    for (const a of rawAbsences) {
        const key = `${a.memberName}|${a.team}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(a);
    }
    const out = [];
    for (const list of byKey.values()) {
        list.sort((a, b) => a.startDate.localeCompare(b.startDate));
        let cur = null;
        for (const a of list) {
            if (!cur) { cur = { ...a }; continue; }
            const d1 = new Date(cur.endDate   + 'T00:00:00').getTime();
            const d2 = new Date(a.startDate   + 'T00:00:00').getTime();
            const gapDays = Math.round((d2 - d1) / 86400000);
            if (gapDays > 0 && gapDays <= 3) {
                cur.endDate = a.startDate;
                cur.days   += a.days;
            } else {
                out.push(cur);
                cur = { ...a };
            }
        }
        if (cur) out.push(cur);
    }
    return out;
}

// Calcule l'info absences d'un membre pour affichage compact dans la liste Settings :
// - todayCount : nombre de jours d'absence couvrant aujourd'hui
// - nextStart  : prochaine date d'absence après aujourd'hui (format dd/mm)
// - nextDays   : total de jours sur la prochaine plage
// - stripHtml  : strip 30 prochains jours (1 case par jour, coloriée si absent)
// - tooltip    : récap textuel
function _memberAbsenceInfo(memberName, absences) {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const ms = (d) => new Date(d + 'T00:00:00').getTime();
    const my = (absences || []).filter(a => a.memberName === memberName);

    // Aujourd'hui : absence couvrant la date
    const todayAbs = my.filter(a => (a.startDate || '') <= todayIso && (a.endDate || '') >= todayIso);
    const todayCount = todayAbs.reduce((s, a) => s + (a.days || 0), 0);

    // Prochain congé (postérieur à today)
    const upcoming = my
        .filter(a => (a.startDate || '') > todayIso)
        .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    const next = upcoming[0];
    const _fmtDDMM = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';

    // Strip 30 jours : 1 case par jour, colorée si dans une plage d'absence
    const DAYS = 30;
    const inAbs = (iso) => my.some(a => (a.startDate || '') <= iso && (a.endDate || '') >= iso);
    const _add = (n) => {
        const d = new Date(today);
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
    };
    let stripHtml = '';
    let totalAbsentInWindow = 0;
    for (let i = 0; i < DAYS; i++) {
        const iso = _add(i);
        const dow = new Date(iso + 'T00:00:00').getDay(); // 0=dim, 6=sam
        const isWeekend = dow === 0 || dow === 6;
        const absent = inAbs(iso);
        if (absent && !isWeekend) totalAbsentInWindow++;
        const cls = absent ? 'member-abs-day member-abs-day--off' : (isWeekend ? 'member-abs-day member-abs-day--we' : 'member-abs-day');
        stripHtml += `<span class="${cls}" title="${_fmtDDMM(iso)}${absent ? ' · congé' : ''}"></span>`;
    }
    const tooltip = `${my.length} absence(s) au total · ${totalAbsentInWindow}j sur les 30 prochains jours` + (next ? ` · prochain : ${_fmtDDMM(next.startDate)}` : '');

    return {
        todayCount,
        nextStart: next ? _fmtDDMM(next.startDate) : '',
        nextDays: next ? (next.days || 0) : 0,
        stripHtml,
        tooltip,
    };
}

// Une équipe transverse n'est pas une équipe agile dédiée → ses membres ne sont
// pas comptabilisés dans la rotation support, ni dans la capacité d'une équipe.
// Patterns reconnus : "Team X", "TRV", "Transverse", "Pool", "Shared".
function _isTransverseTeam(team) {
    if (!team) return false;
    const t = team.toLowerCase().trim();
    return /^team\s+x\b/.test(t)
        || /^trv\b/.test(t)
        || /transverse/.test(t)
        || /^pool\b/.test(t)
        || /^shared\b/.test(t);
}

export function renderSettings(container) {
    const jiraConfigured = store.get('jiraConfigured');
    const project = store.get('project');
    const jiraUrl = store.get('jiraUrl');
    const teams = store.get('teamObjects') || [];
    const teamNames = (store.get('teams') || []).slice().sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
    const groups = store.get('groups') || [];
    const members = store.get('members') || [];
    const absences = store.get('absences') || [];
    // Pour la rotation support : on dérive depuis les absences (CSV RH = vérité)
    const rotMembers = deriveMembersFromAbsences(absences, members);
    const support = store.get('support') || [];
    const tickets = store.get('tickets') || [];
    const events = store.get('events') || [];
    const sprintInfo = store.get('sprintInfo');
    const piInfo = store.get('piInfo');
    const calendars = store.get('calendars') || [];

    const EVENT_TYPES = {
        incident:  { icon: '💥', label: 'Incident' },
        freeze:    { icon: '🧊', label: 'Gel' },
        milestone: { icon: '🚩', label: 'Jalon' },
        period:    { icon: '📅', label: 'Periode' },
        other:     { icon: 'ℹ️',  label: 'Info' },
    };

    container.innerHTML = `
        <!-- Barre de tabs PLEINE LARGEUR (hors du settings-layout qui est cappé à 800px) -->
        <nav id="settings-tabs" class="settings-tabs" aria-label="Sections Paramètres"></nav>

        <div class="settings-layout">

        <!-- ═══ Groups (Lignes produit) ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Lignes produit / Groupes (${groups.length})</h3><p>Regroupez des equipes pour filtrer par ligne produit</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="item-list" id="group-list">
                    ${groups.map(g => `
                        <div class="item-row" data-id="${esc(g.id)}">
                            <span class="team-dot" style="background:${g.color}"></span>
                            <span class="item-name">${esc(g.name)}</span>
                            <span class="item-meta">${(g.teams || []).map(t => esc(t)).join(', ') || 'aucune equipe'}</span>
                            <div class="item-actions">
                                <button class="btn-icon btn-edit-group" data-id="${esc(g.id)}" title="Modifier"><svg class="icon icon-sm"><use href="#i-settings"/></svg></button>
                                <button class="btn-icon btn-del-group" data-id="${esc(g.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="add-inline mt-2">
                    <input class="input" id="new-group-name" placeholder="Nom du groupe">
                    <input class="input" id="new-group-teams" placeholder="Equipes (Alpha, Beta)" style="flex:2;">
                    <button class="btn btn-primary btn-sm" id="btn-add-group">Ajouter</button>
                </div>
            </div>
        </div>

        <!-- ═══ Teams ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <h3>Equipes (${teams.length})</h3>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="team-grid" id="team-list">
                    ${teams.map(t => `
                        <div class="team-grid-item" data-id="${esc(t.id)}">
                            <input type="color" value="${t.color || '#3b82f6'}" data-team-id="${esc(t.id)}" class="input-color-swatch">
                            <span class="item-name">${esc(t.name)}</span>
                            <span class="item-meta">${tickets.filter(x => x.team === t.name).length}</span>
                            <button class="btn-icon btn-del-team" data-id="${esc(t.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                        </div>
                    `).join('')}
                </div>
                <div class="add-inline mt-2">
                    <input class="input" id="new-team-name" placeholder="Nom de l'equipe">
                    <button class="btn btn-primary btn-sm" id="btn-add-team">Ajouter</button>
                </div>
            </div>
        </div>

        <!-- ═══ Members ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Membres (${members.length})</h3><p>Le CSV fait foi. L'equipe peut etre modifiee directement dans la liste.</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="item-list" id="member-list">
                    ${members.map(m => {
                        const memberAbs = _memberAbsenceInfo(m.name, absences);
                        return `
                        <div class="item-row${memberAbs.todayCount > 0 ? ' item-row--absent-today' : ''}" data-id="${esc(m.id)}">
                            <span class="item-name">
                                ${esc(m.name)}
                                ${memberAbs.todayCount > 0 ? `<span class="member-abs-chip member-abs-chip--today" title="En congé aujourd'hui">🌴 Aujourd'hui</span>` : ''}
                                ${memberAbs.nextStart && !memberAbs.todayCount ? `<span class="member-abs-chip member-abs-chip--upcoming" title="Prochain congé : ${memberAbs.nextStart} (${memberAbs.nextDays}j)">📅 ${memberAbs.nextStart}</span>` : ''}
                            </span>
                            <select class="select select-sm member-team-select" data-id="${esc(m.id)}" title="Equipe">
                                <option value="">- equipe -</option>
                                ${teamNames.map(t => `<option value="${esc(t)}"${m.team === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}
                            </select>
                            <span class="item-meta">${esc(m.role || '-')}</span>
                            ${m.entity ? `<span class="item-meta item-entity">${esc(m.entity)}</span>` : '<span class="item-meta text-muted">-</span>'}
                            <span class="member-abs-strip" title="${memberAbs.tooltip}">${memberAbs.stripHtml}</span>
                            <div class="item-actions">
                                <button class="btn-icon btn-del-member" data-id="${esc(m.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <div class="add-inline mt-2">
                    <input class="input" id="new-member-name" placeholder="Nom">
                    <select class="select" id="new-member-team">
                        <option value="">Equipe</option>
                        ${teamNames.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                    </select>
                    <input class="input input-narrow" id="new-member-role" placeholder="Role">
                    <input class="input input-narrow" id="new-member-entity" placeholder="Entite (societe)">
                    <button class="btn btn-primary btn-sm" id="btn-add-member">Ajouter</button>
                </div>

                <h4 class="text-sm font-semibold mt-4 mb-1">Import CSV membres</h4>
                <p class="text-xs text-muted mb-2">Format : <code>Nom;Equipe;Entite;Role</code> - une ligne par membre. Colonnes supplementaires ignorees. Ecrase toute la liste existante.</p>
                <textarea class="input" id="member-csv-input" rows="5" placeholder="Alice;Fuego;Accenture;Dev&#10;Bob;Gabbiano;Capgemini;PO&#10;Claire;Fuego;Accenture;SM"></textarea>
                <div class="flex gap-2 mt-2">
                    <button class="btn btn-primary btn-sm" id="btn-import-member-csv">Importer le CSV</button>
                    <button class="btn btn-danger btn-sm" id="btn-clear-members">Tout supprimer</button>
                </div>
            </div>
        </div>

        <!-- ═══ Absences / Conges ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Absences / Conges (${absences.length})</h3><p>Gerez les conges et absences. Import en masse via CSV.</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                ${absences.length ? `
                    <div class="table-wrap mb-4 abs-table-wrap">
                        <table class="abs-table">
                            <thead><tr>
                                <th>Membre</th><th>Entite</th><th>Equipe</th>
                                <th>Debut</th><th>Fin</th><th>Type</th><th>Jours</th><th></th>
                            </tr></thead>
                            <tbody>
                                ${absences.slice(0, 100).map(a => {
                                    const mbr = members.find(x => x.name === a.memberName);
                                    return `<tr>
                                        <td class="abs-td-name">${esc(a.memberName)}</td>
                                        <td>${mbr?.entity ? `<span class="abs-entity-chip">${esc(mbr.entity)}</span>` : '<span class="text-muted">-</span>'}</td>
                                        <td>${esc(a.team)}</td>
                                        <td>${fmtDate(a.startDate)}</td>
                                        <td>${fmtDate(a.endDate)}</td>
                                        <td><span class="chip chip-abs-${esc(a.type)}">${esc(a.type)}</span></td>
                                        <td class="abs-td-days">${a.days}j</td>
                                        <td><button class="btn-icon btn-del-abs" data-id="${esc(a.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${absences.length > 100 ? `<p class="text-xs text-muted mb-3">... et ${absences.length - 100} autres</p>` : ''}
                ` : '<p class="text-muted text-sm mb-4">Aucune absence enregistree</p>'}

                <div class="abs-add-card">
                    <div class="abs-add-card-title">
                        <svg class="icon icon-sm"><use href="#i-calendar"/></svg>
                        Ajouter une absence
                    </div>
                    <div class="abs-add-grid">
                        <div class="abs-add-field">
                            <label class="abs-label">Membre</label>
                            <select class="select" id="abs-member">
                                <option value="">- choisir -</option>
                                ${members.map(m => `<option value="${esc(m.name)}">${esc(m.name)}${m.entity ? ' · ' + esc(m.entity) : ''}${m.team ? ' (' + esc(m.team) + ')' : ''}</option>`).join('')}
                            </select>
                        </div>
                        <div class="abs-add-field">
                            <label class="abs-label">Du</label>
                            <input class="input" type="date" id="abs-start">
                        </div>
                        <div class="abs-add-field">
                            <label class="abs-label">Au</label>
                            <input class="input" type="date" id="abs-end">
                        </div>
                        <div class="abs-add-field">
                            <label class="abs-label">Type</label>
                            <select class="select" id="abs-type">
                                <option value="conge">Congé</option>
                                <option value="maladie">Maladie</option>
                                <option value="formation">Formation</option>
                                <option value="autre">Autre</option>
                            </select>
                        </div>
                        <div class="abs-add-field abs-add-field--sm">
                            <label class="abs-label">Jours</label>
                            <input class="input" type="number" id="abs-days" value="1" min="0.5" step="0.5">
                        </div>
                        <div class="abs-add-field abs-add-field--action">
                            <label class="abs-label">&nbsp;</label>
                            <button class="btn btn-primary" id="btn-add-abs">Ajouter</button>
                        </div>
                    </div>
                </div>

                <h4 class="text-sm font-semibold mt-4 mb-1">Import CSV / Excel</h4>
                <p class="text-xs text-muted mb-2">
                    2 formats auto-détectés :<br>
                    <strong>① Pivot RH</strong> (header avec dates <code>dd/mm</code>) : <code>NOMS, Prénom	Équipes	Entité	Rôles	03/04	06/04	…</code><br>
                    <strong>② Ligne par absence</strong> : <code>Nom;Equipe;Debut;Fin;Type;Jours</code>
                </p>
                <div class="flex gap-2 mb-2 items-center">
                    <label class="text-xs text-muted">Année pour format pivot (dates dd/mm sans année) :</label>
                    <input class="input" type="number" id="abs-csv-year" value="${new Date().getFullYear()}" min="2000" max="2100" style="width:90px">
                </div>
                <textarea class="input" id="abs-csv-input" rows="6" placeholder="Collez ici les donnees CSV (TAB ou ; entre colonnes)..."></textarea>
                <div class="flex gap-2 mt-2">
                    <button class="btn btn-secondary btn-sm" id="btn-import-abs-csv">Importer le CSV</button>
                    <button class="btn btn-danger btn-sm" id="btn-clear-abs">Tout supprimer</button>
                </div>
            </div>
        </div>

        <!-- ═══ Faits marquants (Events) ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Faits marquants (${events.length})</h3><p>Incidents, gels de code, jalons, periodes cles</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                ${events.length ? `
                    <div class="item-list mb-4">
                        ${events.map(ev => {
                            const et = EVENT_TYPES[ev.type] || EVENT_TYPES.other;
                            return `<div class="item-row">
                                <span class="text-lg">${et.icon}</span>
                                <span class="item-name">${esc(ev.title)}</span>
                                <span class="item-meta">${esc(et.label)}</span>
                                <span class="item-meta">${fmtDate(ev.startDate)}${ev.endDate && ev.endDate !== ev.startDate ? ' → ' + fmtDate(ev.endDate) : ''}</span>
                                ${(ev.teams || []).length ? `<span class="item-meta">${ev.teams.map(t => esc(t)).join(', ')}</span>` : ''}
                                <div class="item-actions">
                                    <button class="btn-icon btn-del-event" data-id="${esc(ev.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                ` : '<p class="text-muted text-sm mb-4">Aucun fait marquant</p>'}

                <h4 class="text-sm font-semibold mb-2">Ajouter un fait marquant</h4>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Type</label>
                        <select class="select w-full" id="evt-type">
                            ${Object.entries(EVENT_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="label">Titre *</label>
                        <input class="input" id="evt-title" placeholder="Incident prod, Gel de code...">
                    </div>
                </div>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Date debut *</label>
                        <input class="input" type="date" id="evt-start">
                    </div>
                    <div class="form-group">
                        <label class="label">Date fin (optionnelle)</label>
                        <input class="input" type="date" id="evt-end">
                    </div>
                </div>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Equipes (vide = toutes)</label>
                        <input class="input" id="evt-teams" placeholder="Alpha, Beta">
                    </div>
                    <div class="form-group">
                        <label class="label">Description</label>
                        <input class="input" id="evt-desc" placeholder="Contexte, impact...">
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" id="btn-add-event">Ajouter</button>
            </div>
        </div>

        <!-- ═══ Support Rotation ═══ -->
        <div class="settings-section collapsed" id="section-rotation">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Rotation Support (${support.length} semaines)</h3><p>Grille par equipe - cliquez pour affecter les membres semaine par semaine</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">

                <!-- Per-team rotation grid panels -->
                <div id="rot-panels" class="mb-4">
                    ${_rotPanelsHtml(teamNames, teams, support, rotMembers, absences)}
                </div>

                <hr class="hr-section">

                <h4 class="text-sm font-semibold mb-2">Ajouter une semaine manuellement</h4>
                <div class="flex gap-2 mb-2 flex-wrap items-end">
                    <div class="form-group form-group-inline"><label class="label">Equipe</label>
                        <select class="select" id="sup-team"><option value="">Equipe</option>${teamNames.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
                    </div>
                    <div class="form-group form-group-inline"><label class="label">Semaine</label>
                        <input class="input input-narrow" id="sup-label" placeholder="S15">
                    </div>
                    <div class="form-group form-group-inline"><label class="label">Debut</label>
                        <input class="input input-date" type="date" id="sup-start">
                    </div>
                    <div class="form-group form-group-inline"><label class="label">Fin</label>
                        <input class="input input-date" type="date" id="sup-end">
                    </div>
                    <div class="form-group form-group-inline"><label class="label">Eff./sem</label>
                        <input class="input input-xs" type="number" id="sup-mpw" value="2" min="1" max="10">
                    </div>
                </div>
                <div class="flex gap-2 mb-2 flex-wrap" id="sup-members-checkboxes"></div>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" id="btn-add-sup">Ajouter</button>
                </div>
            </div>
        </div>

        <!-- ═══ Sprint + PI Config ═══ -->
        <div class="settings-section collapsed">${(() => {
            const piNum       = piInfo?.number      || '';
            const piName      = piInfo?.name        || '';
            const sprintsCnt  = piInfo?.sprintsPerPI  || 5;
            const sprintDur   = piInfo?.sprintDuration || 14;
            const velTarget   = piInfo?.velocityTarget || '';
            const totalDays   = sprintsCnt * sprintDur;

            // Détection du sprint courant depuis le nom (ex : "29.3" → index 2)
            const idxMatch = (sprintInfo?.name || '').match(/\.(\d+)\s*$/);
            const curIdx   = idxMatch ? parseInt(idxMatch[1]) - 1 : -1;

            // Progression dans le sprint courant
            let sprintPct = 0;
            if (sprintInfo?.startDate && sprintInfo?.endDate) {
                const now   = Date.now();
                const start = new Date(sprintInfo.startDate).getTime();
                const end   = new Date(sprintInfo.endDate).getTime();
                sprintPct   = Math.round(Math.max(0, Math.min(1, (now - start) / (end - start))) * 100);
            }

            // Pills de sprints
            const pills = [...Array(sprintsCnt)].map((_, i) => {
                const label  = piNum ? `${piNum}.${i + 1}` : `S${i + 1}`;
                const isCur  = i === curIdx;
                const isDone = curIdx >= 0 && i < curIdx;
                const isIP   = i === sprintsCnt - 1;
                const cls    = isIP ? 'ip' : isCur ? 'current' : isDone ? 'done' : '';
                const icon   = isCur ? '▶ ' : isDone ? '✓ ' : '';
                return `<span class="pi-sprint-pill ${cls}" data-sprint-idx="${i}" data-sprint-label="${esc(label)}" title="${isIP ? 'IP - ' : ''}Configurer ${esc(label)}">${icon}${esc(label)}</span>`;
            }).join('');

            return `
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Sprint & PI</h3><p>Programme Increment et sprint en cours</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="pi-cfg-card">

                    <!-- ── PI : header + track + champs ── -->
                    <form id="pi-form">
                        <div class="pi-cfg-hdr">
                            <span class="pi-cfg-badge">PI${piNum ? ' #' + piNum : ' ?'}</span>
                            <span class="pi-cfg-title">${esc(piName) || 'Programme Increment'}</span>
                            <span class="pi-cfg-meta">${sprintsCnt}&thinsp;sprints &middot; ${sprintDur}&thinsp;j &middot; ${totalDays}&thinsp;j</span>
                            <button type="submit" class="pi-cfg-save-btn">Enregistrer PI</button>
                        </div>

                        <div class="pi-sprint-track" data-cur-idx="${curIdx}" data-sprint-dur="${sprintDur}" data-cur-start="${sprintInfo?.startDate?.slice(0,10) || ''}">
                            ${pills}
                        </div>

                        <div class="pi-cfg-body">
                            <div class="form-row pi-cfg-fields">
                                <div class="form-group"><label class="label">N° PI</label><input class="input" name="number" type="number" value="${piNum}" placeholder="29"></div>
                                <div class="form-group"><label class="label">Nom PI</label><input class="input" name="piName" value="${esc(piName)}" placeholder="PI#29"></div>
                                <div class="form-group"><label class="label">Sprints / PI</label><input class="input" name="sprintsPerPI" type="number" value="${sprintsCnt}" min="1" max="10"></div>
                                <div class="form-group"><label class="label">Duree (j)</label><input class="input" name="sprintDuration" type="number" value="${sprintDur}" min="7" max="28"></div>
                                <div class="form-group" title="Date du 1er jour du PI courant (ex: 2026-04-03). Si vide, calculée depuis le sprint actif.">
                                    <label class="label">Début PI (1er jour)</label>
                                    <input class="input" name="startDate" type="date" value="${esc(piInfo?.startDate || '')}">
                                </div>
                                <div class="form-group"><label class="label">Velocity cible</label><input class="input" name="velocityTarget" type="number" value="${velTarget}" placeholder="40 pts"></div>
                            </div>
                        </div>
                    </form>

                    <!-- ── Sprint courant : niché dans le PI ── -->
                    <form id="sprint-form">
                        <div class="sprint-nested-card">
                            <div class="sprint-nested-hdr">
                                <span class="sprint-nested-dot"></span>
                                <span class="sprint-nested-label">Sprint en cours</span>
                                ${sprintPct > 0 ? `
                                    <div class="sprint-nested-bar" title="${sprintPct}% ecoule">
                                        <div class="sprint-nested-fill" style="width:${sprintPct}%"></div>
                                    </div>
                                    <span class="sprint-nested-pct">${sprintPct}%</span>
                                ` : ''}
                            </div>
                            <div class="sprint-nested-body">
                                <div class="form-group"><label class="label">Nom</label><input class="input" name="name" placeholder="Sprint${piNum ? ' #' + piNum + '.1' : ''}"></div>
                                <div class="form-row">
                                    <div class="form-group"><label class="label">Debut</label><input class="input" type="date" name="startDate" value="${sprintInfo?.startDate?.slice(0,10) || ''}"></div>
                                    <div class="form-group"><label class="label">Fin</label><input class="input" type="date" name="endDate" value="${sprintInfo?.endDate?.slice(0,10) || ''}"></div>
                                </div>
                                <div class="form-group"><label class="label">Objectif</label><textarea class="input" name="goal" rows="2">${esc(sprintInfo?.goal || '')}</textarea></div>
                                <div class="flex items-center gap-2 flex-wrap">
                                    <button type="submit" class="btn btn-primary btn-sm">Enregistrer sprint</button>
                                    ${sprintInfo?.jiraId ? `
                                        <button type="button" class="btn btn-secondary btn-sm" id="btn-sprint-push-jira" title="Mettre a jour le sprint dans JIRA avec les valeurs locales">
                                            ↑ Pousser vers JIRA
                                        </button>` : `
                                        <span class="text-xs text-muted" title="Aucun ID JIRA — sync depuis JIRA d'abord">Push JIRA indisponible</span>`}
                                    ${sprintInfo?.jiraBoardId && jiraUrl ? `
                                        <a class="btn btn-ghost btn-sm" href="${esc(jiraUrl)}/jira/software/c/boards/${esc(sprintInfo.jiraBoardId)}" target="_blank" rel="noopener" title="Ouvrir le board JIRA dans un nouvel onglet">
                                            <svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                            Board JIRA
                                        </a>` : ''}
                                </div>
                            </div>
                        </div>
                    </form>

                </div>
            </div>

            `;
        })()}
        </div>

        <!-- ═══ Rappels & Cérémonies ═══ -->
        ${(() => {
            const reminders = loadReminders();
            return `
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Rappels &amp; Cérémonies</h3><p>Configurez quand afficher les rappels dans le panneau latéral</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <p class="text-xs text-muted mb-3">J-0 = dernier jour du sprint &nbsp;·&nbsp; J-2 = 2 jours avant la fin du sprint</p>
                <div class="reminder-grid" id="reminder-grid">
                    ${REMINDER_DEFS.map(def => {
                        const cfg = reminders[def.id];
                        return `
                        <div class="reminder-card ${cfg.enabled ? '' : 'reminder-card--off'}" data-rid="${def.id}">
                            <div class="reminder-card-top">
                                <span class="reminder-icon">${def.icon}</span>
                                <span class="reminder-label">${esc(def.label)}</span>
                                <label class="toggle-switch" title="${cfg.enabled ? 'Désactiver' : 'Activer'}">
                                    <input type="checkbox" class="reminder-toggle" data-rid="${esc(def.id)}" ${cfg.enabled ? 'checked' : ''}>
                                    <span class="toggle-track"></span>
                                </label>
                            </div>
                            <div class="reminder-card-body">
                                <label class="abs-label">Afficher à J−</label>
                                <div class="reminder-days-row">
                                    <input type="number" class="input reminder-days-input" data-rid="${esc(def.id)}"
                                        value="${cfg.dBefore}" min="0" max="13" step="1" ${cfg.enabled ? '' : 'disabled'}>
                                    <span class="reminder-days-unit">jours avant fin de sprint</span>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>`;
        })()}

        <!-- ═══ Calendriers ICS ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Calendriers ICS (${calendars.length})</h3><p>Liens publics Google Calendar ou ICS par equipe — affichage dans la banniere Sprint/Kanban</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                ${calendars.length ? `
                    <div class="item-list mb-4" id="cal-list">
                        ${calendars.map(c => {
                            const teamsArr = (c.team || '').split(',').map(s => s.trim()).filter(Boolean);
                            const teamsChip = teamsArr.length === 0
                                ? '<span class="item-meta text-muted">toutes équipes</span>'
                                : teamsArr.length === 1
                                    ? `<span class="chip chip-sm">${esc(teamsArr[0])}</span>`
                                    : `<span class="chip chip-sm" title="${esc(teamsArr.join(', '))}">${teamsArr.length} équipes</span>`;
                            return `
                            <div class="item-row" data-id="${esc(c.id)}" data-cal-name="${esc(c.name)}" data-cal-url="${esc(c.icalUrl || '')}" data-cal-team="${esc(c.team || '')}">
                                <span class="cal-dot" style="background:var(--primary)">📅</span>
                                <span class="item-name">${esc(c.name)}</span>
                                ${teamsChip}
                                <span class="item-meta text-muted">${c.lastFetched ? 'Sync : ' + new Date(c.lastFetched).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Jamais synchronisé'}</span>
                                <div class="item-actions">
                                    <button class="btn-icon btn-cal-edit" data-id="${esc(c.id)}" title="Modifier">✏️</button>
                                    <button class="btn btn-sm btn-secondary btn-cal-refresh" data-id="${esc(c.id)}" title="Synchroniser">🔄</button>
                                    <button class="btn-icon btn-del-cal" data-id="${esc(c.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="flex gap-2 mb-4">
                        <button class="btn btn-secondary btn-sm" id="btn-cal-refresh-all">🔄 Rafraichir tous</button>
                    </div>
                ` : '<p class="text-muted text-sm mb-4">Aucun calendrier configuré</p>'}

                <h4 class="text-sm font-semibold mb-2">Ajouter un calendrier</h4>
                <div class="form-row mb-2">
                    <div class="form-group">
                        <label class="label">Nom *</label>
                        <input class="input" id="cal-name" placeholder="Réunions Alpha">
                    </div>
                    <div class="form-group">
                        <label class="label">Équipes (aucune = toutes)</label>
                        <div class="cal-teams-picker" id="cal-teams-picker" data-selected="">
                            <button type="button" class="team-pill is-active" data-team="">Toutes</button>
                            ${teamNames.map(t => `<button type="button" class="team-pill" data-team="${esc(t)}">${esc(t)}</button>`).join('')}
                        </div>
                        <p class="text-xs text-muted mt-1">Clic pour ajouter/retirer — plusieurs équipes possibles</p>
                    </div>
                </div>
                <div class="form-group mb-3">
                    <label class="label">URL ICS *</label>
                    <input class="input" id="cal-url" placeholder="https://calendar.google.com/calendar/ical/...">
                    <p class="text-xs text-muted mt-1">Google Calendar : Paramètres du calendrier → Intégrations → Adresse publique au format ICAL</p>
                </div>
                <button class="btn btn-primary btn-sm" id="btn-add-cal">Ajouter et synchroniser</button>
            </div>
        </div>

        <!-- ═══ JIRA Plugin ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle><h3>Plugin JIRA (optionnel)</h3><svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg></div>
            <div class="settings-section-body">
                <div class="connection-status ${jiraConfigured ? 'connected' : 'disconnected'}">
                    <span class="status-dot"></span>
                    ${jiraConfigured ? `Connecte a <strong>${esc(jiraUrl)}</strong> (projet: ${esc(project)})` : 'Non configure'}
                </div>
                ${jiraConfigured ? `
                <div class="sync-cfg-block mt-4">
                    <div class="sync-cfg-title">Configuration de la synchronisation</div>
                    <div class="sync-cfg-hint">Acceptes : nom JQL (ex : <code>Sprint</code>, <code>Team[Team]</code>) ou ID (<code>customfield_XXXXX</code>). Laissez vide pour la detection automatique. Pour les champs <em>Max</em>, laissez vide = illimité. Les champs candidats sont loggues dans la console apres chaque sync.</div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">⏱️</span>
                            <div>
                                <div class="sync-cfg-name">Sync rapide — période</div>
                                <div class="sync-cfg-desc">Nombre de jours pris en compte pour la sync rapide (clic direct sur le bouton JIRA). JQL filtré sur <code>updated &gt;= -Nj</code></div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="number" id="sync-quick-days" class="input sync-cfg-input" min="1" max="365" step="1" placeholder="14"
                                value="${esc(localStorage.getItem('sb-sync-quickDays') || '')}">
                            <span class="sync-cfg-unit">jours</span>
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">📥</span>
                            <div>
                                <div class="sync-cfg-name">Max tickets / features / epics</div>
                                <div class="sync-cfg-desc">Plafond par JQL : tickets actifs, tickets PI suivant, features, epics. Vide = illimité</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="number" id="sync-max-features" class="input sync-cfg-input" min="1" step="10" placeholder="Illimité"
                                value="${esc(localStorage.getItem('sb-sync-maxFeatures') || '')}">
                            <span class="sync-cfg-unit">tickets</span>
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🗂️</span>
                            <div>
                                <div class="sync-cfg-name">Max boards (équipes)</div>
                                <div class="sync-cfg-desc">Nombre maximum de boards JIRA scannés (avant filtrage scrum). Vide = illimité</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="number" id="sync-max-boards" class="input sync-cfg-input" min="1" step="10" placeholder="Illimité"
                                value="${esc(localStorage.getItem('sb-sync-maxBoards') || '')}">
                            <span class="sync-cfg-unit">boards</span>
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🔄</span>
                            <div>
                                <div class="sync-cfg-name">Champ Sprint</div>
                                <div class="sync-cfg-desc">Nom JQL (<code>Sprint</code>) ou ID (<code>customfield_10021</code>) — utilise pour extraire le PI depuis le nom du sprint</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="text" id="sync-sprint-field" class="input sync-cfg-input sync-cfg-id" placeholder="customfield_10021"
                                value="${esc(localStorage.getItem('sb-sync-sprintField') || '')}">
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">👥</span>
                            <div>
                                <div class="sync-cfg-name">Champ Equipe</div>
                                <div class="sync-cfg-desc">Nom du champ JIRA (JQL ou ID) — ex : <code>Team[Team]</code> ou <code>customfield_XXXXX</code></div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="text" id="sync-team-field" class="input sync-cfg-input" placeholder="Team[Team]"
                                value="${esc(localStorage.getItem('sb-sync-teamField') || '')}">
                        </div>
                    </div>

                    <div class="sync-cfg-actions">
                        <button class="btn btn-primary btn-sm" id="btn-save-sync-config">Enregistrer</button>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- ═══ Data ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle><h3>Donnees</h3><svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg></div>
            <div class="settings-section-body">
                <span class="text-sm">${tickets.length} tickets, ${(store.get('features') || []).length} features, ${members.length} membres, ${absences.length} absences</span>
                <div class="flex gap-3 mt-4 flex-wrap">
                    <button class="btn btn-secondary" id="btn-export">Exporter (JSON)</button>
                    <label class="btn btn-secondary" style="cursor:pointer;display:inline-flex;">Importer (JSON)<input type="file" accept=".json" id="btn-import-file" style="display:none;"></label>
                    <button class="btn btn-danger" id="btn-clear">Tout supprimer</button>
                </div>
            </div>
        </div>

        <!-- ═══ About ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle><h3>A propos</h3><svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg></div>
            <div class="settings-section-body">
                <p class="text-sm"><strong>Squad Board</strong> v3.0 - Board autoporteur avec SQLite</p>
                <div class="mt-4 detail-grid" style="max-width:360px;">
                    <dt class="text-xs">N</dt><dd class="text-xs">Nouveau ticket</dd>
                    <dt class="text-xs">1-6</dt><dd class="text-xs">Naviguer entre les vues</dd>
                    <dt class="text-xs">Ctrl+K</dt><dd class="text-xs">Rechercher</dd>
                </div>
            </div>
        </div>

    </div>`;

    // ══════════════════════════════════════════════════════════════════════════
    // Event wiring
    // ══════════════════════════════════════════════════════════════════════════

    // ── JIRA sync config ──────────────────────────────────────────────────────
    const _saveCap = (inputId, lsKey) => {
        const raw = (container.querySelector(`#${inputId}`)?.value || '').trim();
        if (!raw) { localStorage.removeItem(lsKey); return; }
        const n = parseInt(raw);
        if (!isNaN(n) && n >= 1) localStorage.setItem(lsKey, String(n));
        else localStorage.removeItem(lsKey);
    };
    const _saveStr = (inputId, lsKey) => {
        const v = (container.querySelector(`#${inputId}`)?.value || '').trim();
        if (v) localStorage.setItem(lsKey, v);
        else localStorage.removeItem(lsKey);
    };
    container.querySelector('#btn-save-sync-config')?.addEventListener('click', () => {
        _saveCap('sync-max-features', 'sb-sync-maxFeatures');
        _saveCap('sync-max-boards',   'sb-sync-maxBoards');
        _saveCap('sync-quick-days',   'sb-sync-quickDays');
        _saveStr('sync-sprint-field', 'sb-sync-sprintField');
        _saveStr('sync-team-field',   'sb-sync-teamField');
        toast('Configuration sync JIRA enregistree', 'success');
        // Met à jour le label du bouton topbar pour refléter la nouvelle durée
        window.__squadBoard?.refreshSyncButtonLabel?.();
    });

    // ── Groups ────────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-group')?.addEventListener('click', async () => {
        const name = container.querySelector('#new-group-name')?.value.trim();
        const teamsStr = container.querySelector('#new-group-teams')?.value.trim();
        if (!name) return;
        const groupTeams = teamsStr.split(',').map(t => t.trim()).filter(Boolean);
        try {
            await api.createGroup({ name, teams: groupTeams });
            toast(`Groupe "${name}" cree`, 'success');
            await reloadAndRender(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelectorAll('.btn-edit-group').forEach(btn => {
        btn.addEventListener('click', async () => {
            const g = groups.find(x => x.id === btn.dataset.id);
            if (!g) return;
            const name = prompt('Nom:', g.name);
            if (name === null) return;
            const teamsStr = prompt('Equipes (separees par virgule):', (g.teams || []).join(', '));
            if (teamsStr === null) return;
            const color = prompt('Couleur (hex):', g.color);
            try {
                await api.updateGroup(g.id, {
                    name: name || g.name,
                    teams: teamsStr.split(',').map(t => t.trim()).filter(Boolean),
                    color: color || g.color,
                });
                toast('Groupe mis a jour', 'success');
                await reloadAndRender(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    container.querySelectorAll('.btn-del-group').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Supprimer ce groupe ?')) return;
            try { await api.deleteGroup(btn.dataset.id); await reloadAndRender(container); } catch (e) { toast(e.message, 'error'); }
        });
    });

    // ── Teams ─────────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-team')?.addEventListener('click', async () => {
        const name = container.querySelector('#new-team-name')?.value.trim();
        if (!name) return;
        try { await api.createTeam({ name }); toast(`Equipe "${name}" creee`, 'success'); await reloadAndRender(container); } catch (e) { toast(e.message, 'error'); }
    });
    container.querySelectorAll('.btn-del-team').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Supprimer cette equipe ?')) return;
            try { await api.deleteTeam(btn.dataset.id); await reloadAndRender(container); } catch (e) { toast(e.message, 'error'); }
        });
    });
    container.querySelectorAll('input[type="color"][data-team-id]').forEach(input => {
        input.addEventListener('change', async () => {
            try { await api.updateTeam(input.dataset.teamId, { color: input.value }); } catch { /* silent */ }
        });
    });

    // ── Members ───────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-member')?.addEventListener('click', async () => {
        const name   = container.querySelector('#new-member-name')?.value.trim();
        const team   = container.querySelector('#new-member-team')?.value;
        const role   = container.querySelector('#new-member-role')?.value.trim();
        const entity = container.querySelector('#new-member-entity')?.value.trim();
        if (!name) return;
        try { await api.createMember({ name, team, role, entity }); toast(`Membre "${name}" ajoute`, 'success'); await reloadAndRender(container); } catch (e) { toast(e.message, 'error'); }
    });
    // Inline team edit - auto-save on change
    container.querySelectorAll('.member-team-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            try { await api.updateMember(sel.dataset.id, { team: sel.value }); } catch (e) { toast(e.message, 'error'); }
        });
    });
    container.querySelectorAll('.btn-del-member').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Supprimer ?')) return;
            try {
                await api.deleteMember(btn.dataset.id);
                btn.closest('.item-row')?.remove();
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // CSV import - always replaces all members (CSV is source of truth)
    container.querySelector('#btn-import-member-csv')?.addEventListener('click', async () => {
        const raw = container.querySelector('#member-csv-input')?.value.trim();
        if (!raw) { toast('Collez des donnees CSV d\'abord', 'warning'); return; }
        const parsed = raw.split('\n')
            .map(l => l.split(/[;\t]/).map(c => c.trim()))
            .filter(cols => cols[0])
            .map(cols => ({ name: cols[0], team: cols[1] || '', entity: cols[2] || '', role: cols[3] || '' }));
        if (!parsed.length) { toast('Aucune donnee valide', 'warning'); return; }
        if (!confirm(`Remplacer les ${members.length} membres actuels par ${parsed.length} membres du CSV ?`)) return;
        try {
            await api.bulkMergeMembers(parsed, true);
            toast(`${parsed.length} membres importes`, 'success');
            await reloadAndRender(container);
        } catch (e) { toast(e.message, 'error'); }
    });
    container.querySelector('#btn-clear-members')?.addEventListener('click', async () => {
        if (!confirm('Supprimer TOUS les membres ?')) return;
        try {
            await Promise.all(members.map(m => api.deleteMember(m.id)));
            toast('Tous les membres supprimes', 'success');
            await reloadAndRender(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Absences ──────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-abs')?.addEventListener('click', async () => {
        const memberName = container.querySelector('#abs-member')?.value;
        const startDate = container.querySelector('#abs-start')?.value;
        const endDate = container.querySelector('#abs-end')?.value;
        const type = container.querySelector('#abs-type')?.value;
        const days = parseFloat(container.querySelector('#abs-days')?.value) || 1;
        if (!memberName || !startDate) { toast('Membre et date de debut requis', 'warning'); return; }
        const member = members.find(m => m.name === memberName);
        try {
            await api.createAbsence({ memberName, team: member?.team || '', startDate, endDate: endDate || startDate, type, days });
            toast('Absence ajoutee', 'success');
            await reloadAndRender(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelectorAll('.btn-del-abs').forEach(btn => {
        btn.addEventListener('click', async () => {
            try { await api.deleteAbsence(btn.dataset.id); await reloadAndRender(container); } catch (e) { toast(e.message, 'error'); }
        });
    });

    container.querySelector('#btn-import-abs-csv')?.addEventListener('click', async () => {
        const raw = container.querySelector('#abs-csv-input')?.value.trim();
        if (!raw) { toast('Collez des donnees CSV d\'abord', 'warning'); return; }
        const year = parseInt(container.querySelector('#abs-csv-year')?.value) || new Date().getFullYear();
        // 1. Auto-détection : format pivot (header dd/mm) prioritaire
        const pivot = _parsePivotAbsencesCsv(raw, year);
        let absencesPayload, membersPayload, mode;
        if (pivot) {
            absencesPayload = pivot.absences;
            membersPayload  = pivot.members;
            mode = 'pivot';
        } else {
            // 2. Fallback : format ligne. NB on split sur ; ou tab — JAMAIS sur virgule
            absencesPayload = [];
            const lines = raw.split('\n').filter(l => l.trim());
            for (const line of lines) {
                const cols = line.split(/[;\t]/).map(c => c.trim());
                if (!cols[0] || !cols[2]) continue;
                absencesPayload.push({
                    memberName: cols[0],
                    team: cols[1] || '',
                    startDate: cols[2] || '',
                    endDate: cols[3] || cols[2] || '',
                    type: cols[4] || 'conge',
                    days: parseFloat((cols[5] || '').replace(',', '.')) || 1,
                });
            }
            membersPayload = [];   // format ligne n'a pas d'entité ni de rôle
            mode = 'ligne';
        }
        if (!absencesPayload.length) {
            toast('Aucune donnée valide dans le CSV (formats supportés : pivot dd/mm ou ligne Nom;Equipe;Debut;Fin;Type;Jours)', 'warning');
            return;
        }
        const transverseCount = absencesPayload.filter(p => _isTransverseTeam(p.team)).length;
        const teamsDetected = [...new Set(absencesPayload.map(p => p.team).filter(Boolean))];
        const xtraInfo = transverseCount
            ? `\n\n${transverseCount} absence(s) sur des équipes transverses (Team X / TRV / …) — enregistrées telles quelles, non comptabilisées dans les équipes agiles.`
            : '';
        const teamsLine = teamsDetected.length ? `\nÉquipes détectées : ${teamsDetected.slice(0, 8).join(', ')}${teamsDetected.length > 8 ? '…' : ''}` : '';
        const membersLine = membersPayload.length ? `\nMembres synchronisés (avec entité + rôle) : ${membersPayload.length}` : '';
        if (!confirm(`Format détecté : ${mode}\nAjouter ${absencesPayload.length} absence(s) ?${teamsLine}${membersLine}${xtraInfo}\n\nLes doublons (même nom + même jour) seront ignorés.`)) return;
        try {
            const res = await api.bulkCreateAbsences(absencesPayload, false);
            // Synchronisation Members en upsert : ajoute les nouveaux + enrichit team/entity/role
            // sur ceux qui existent déjà (cas : la sync JIRA a créé un Member avec entity vide).
            let memSync = null;
            if (membersPayload.length) {
                memSync = await api.bulkMergeMembers(membersPayload, false);
            }
            const parts = [`${res.created} absence(s) ajoutee(s)`];
            if (res.skipped) parts.push(`${res.skipped} doublon(s)`);
            if (memSync) parts.push(`${memSync.created || 0} membres crees, ${memSync.updated || 0} maj`);
            toast(parts.join(' · '), 'success');
            await reloadAndRender(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelector('#btn-clear-abs')?.addEventListener('click', async () => {
        if (!confirm('Supprimer toutes les absences ?')) return;
        try { await api.bulkCreateAbsences([], true); await reloadAndRender(container); toast('Absences supprimees', 'info'); } catch (e) { toast(e.message, 'error'); }
    });

    // ── Section collapse toggle ─────────────────────────────────────────────
    container.querySelectorAll('[data-stg-toggle]').forEach(header => {
        header.addEventListener('click', () => {
            header.closest('.settings-section')?.classList.toggle('collapsed');
        });
    });

    // ── Events ────────────────────────────────────────────────────────────────
    container.querySelector('#btn-add-event')?.addEventListener('click', async () => {
        const title = container.querySelector('#evt-title')?.value.trim();
        const startDate = container.querySelector('#evt-start')?.value;
        if (!title || !startDate) { toast('Titre et date requis', 'warning'); return; }
        try {
            await api.createEvent({
                type: container.querySelector('#evt-type')?.value || 'other',
                title,
                description: container.querySelector('#evt-desc')?.value.trim() || '',
                startDate,
                endDate: container.querySelector('#evt-end')?.value || startDate,
                teams: (container.querySelector('#evt-teams')?.value || '').split(',').map(t => t.trim()).filter(Boolean),
            });
            toast('Fait marquant ajoute', 'success');
            await reloadAndRender(container);
        } catch (e) { toast(e.message, 'error'); }
    });
    container.querySelectorAll('.btn-del-event').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Supprimer ce fait marquant ?')) return;
            try { await api.deleteEvent(btn.dataset.id); await reloadAndRender(container); } catch (e) { toast(e.message, 'error'); }
        });
    });

    // ── Calendriers ICS ───────────────────────────────────────────────────────
    // Picker équipes en pills (mono ou multi-sélection — CSV en sortie via getter)
    const _wireTeamsPicker = (root, currentCsv = '') => {
        if (!root) return;
        const current = new Set((currentCsv || '').split(',').map(s => s.trim()).filter(Boolean));
        root.querySelectorAll('.team-pill').forEach(p => {
            const team = p.dataset.team;
            // État initial : "Toutes" actif si current vide
            if (!team && current.size === 0) p.classList.add('is-active');
            else if (team && current.has(team)) p.classList.add('is-active');
            else p.classList.remove('is-active');
        });
        root.addEventListener('click', e => {
            const pill = e.target.closest('.team-pill');
            if (!pill || !root.contains(pill)) return;
            const team = pill.dataset.team;
            if (!team) {
                // "Toutes" → reset
                root.querySelectorAll('.team-pill').forEach(p => p.classList.toggle('is-active', p.dataset.team === ''));
            } else {
                root.querySelector('.team-pill[data-team=""]')?.classList.remove('is-active');
                pill.classList.toggle('is-active');
                // Si plus rien d'actif → réactive "Toutes"
                const anyActive = root.querySelectorAll('.team-pill[data-team]:not([data-team=""]).is-active').length > 0;
                if (!anyActive) root.querySelector('.team-pill[data-team=""]')?.classList.add('is-active');
            }
        });
    };
    const _readTeamsPicker = (root) => {
        if (!root) return '';
        return [...root.querySelectorAll('.team-pill.is-active')]
            .map(p => p.dataset.team).filter(Boolean).join(',');
    };

    // Init picker ajout
    _wireTeamsPicker(container.querySelector('#cal-teams-picker'));

    container.querySelector('#btn-add-cal')?.addEventListener('click', async () => {
        const name = container.querySelector('#cal-name')?.value.trim();
        const team = _readTeamsPicker(container.querySelector('#cal-teams-picker'));
        const url  = container.querySelector('#cal-url')?.value.trim();
        if (!name || !url) { toast('Nom et URL requis', 'warning'); return; }
        try {
            const cal = await api.createCalendar({ name, team, icalUrl: url });
            toast(`Calendrier "${name}" ajouté, synchronisation...`, 'info');
            try {
                await api.refreshCalendar(cal.id);
                toast('Synchronisation réussie', 'success');
            } catch (re) { toast(`Ajout OK mais sync échouée : ${re.message}`, 'warning'); }
            await _calReloadSection(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    // Délégation sur la liste des calendriers : edit / refresh / delete
    // (permet au cancel d'édition de juste remettre l'HTML sans re-bind individuel)
    const _openEdit = (row) => {
        if (!row || row.classList.contains('item-row--editing')) return;
        const id      = row.dataset.id;
        const curName = row.dataset.calName || '';
        const curUrl  = row.dataset.calUrl || '';
        const curTeam = row.dataset.calTeam || '';
        const origHtml = row.innerHTML;
        row.classList.add('item-row--editing');
        row.innerHTML = `
            <form class="cal-edit-form" data-id="${esc(id)}">
                <div class="cal-edit-fields">
                    <input class="input input-sm" name="name" value="${esc(curName)}" placeholder="Nom *" required>
                    <input class="input input-sm" name="url"  value="${esc(curUrl)}"  placeholder="URL ICS *" required>
                    <div class="cal-teams-picker cal-teams-picker--inline" data-edit-picker>
                        <button type="button" class="team-pill" data-team="">Toutes</button>
                        ${teamNames.map(t => `<button type="button" class="team-pill" data-team="${esc(t)}">${esc(t)}</button>`).join('')}
                    </div>
                </div>
                <div class="cal-edit-actions">
                    <button type="submit" class="btn btn-primary btn-sm" title="Enregistrer (Entrée)">✓</button>
                    <button type="button" class="btn btn-secondary btn-sm cal-edit-cancel" title="Annuler (Échap)">✗</button>
                </div>
            </form>`;
        const picker = row.querySelector('[data-edit-picker]');
        _wireTeamsPicker(picker, curTeam);
        const form = row.querySelector('.cal-edit-form');
        const nameInp = form.querySelector('input[name="name"]');
        nameInp.focus(); nameInp.select();
        const cancel = () => { row.classList.remove('item-row--editing'); row.innerHTML = origHtml; };
        form.querySelector('.cal-edit-cancel').addEventListener('click', cancel);
        form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = form.querySelector('input[name="name"]').value.trim();
            const newUrl  = form.querySelector('input[name="url"]').value.trim();
            const newTeam = _readTeamsPicker(picker);
            if (!newName || !newUrl) { toast('Nom et URL requis', 'warning'); return; }
            try {
                await api.updateCalendar(id, { name: newName, icalUrl: newUrl, team: newTeam });
                toast('Calendrier mis à jour', 'success');
                await _calReloadSection(container);
            } catch (err) { toast(err.message, 'error'); }
        });
    };

    container.querySelector('#cal-list')?.addEventListener('click', async (e) => {
        const edit = e.target.closest('.btn-cal-edit');
        if (edit) { _openEdit(edit.closest('.item-row')); return; }
        const refresh = e.target.closest('.btn-cal-refresh');
        if (refresh) {
            refresh.disabled = true; refresh.textContent = '⏳';
            try { await api.refreshCalendar(refresh.dataset.id); toast('Synchronisé', 'success'); await _calReloadSection(container); }
            catch (err) { toast(err.message, 'error'); refresh.disabled = false; refresh.textContent = '🔄'; }
            return;
        }
        const del = e.target.closest('.btn-del-cal');
        if (del) {
            if (!confirm('Supprimer ce calendrier ?')) return;
            try { await api.deleteCalendar(del.dataset.id); await _calReloadSection(container); }
            catch (err) { toast(err.message, 'error'); }
        }
    });

    container.querySelector('#btn-cal-refresh-all')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-cal-refresh-all');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Synchronisation...'; }
        try {
            await Promise.all(calendars.map(c => api.refreshCalendar(c.id).catch(() => {})));
            toast('Tous les calendriers synchronises', 'success');
            await _calReloadSection(container);
        } catch (e) { toast(e.message, 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Rafraichir tous'; }
    });

    // (delete + refresh sont gérés par la délégation sur #cal-list ci-dessus)

    // ── Rotation grid - délégué à _rotWirePanelEvents ────────────────────────
    _rotWirePanelEvents(container);

    // ── Support - ajout manuel ────────────────────────────────────────────────
    container.querySelector('#sup-team')?.addEventListener('change', () => {
        const team = container.querySelector('#sup-team')?.value;
        const teamMembers = rotMembers.filter(m => m.team === team);
        const box = container.querySelector('#sup-members-checkboxes');
        if (box) box.innerHTML = teamMembers.map(m => `
            <label class="chip" style="cursor:pointer;gap:4px;"><input type="checkbox" value="${esc(m.name)}" checked> ${esc(m.name)}</label>
        `).join('');
    });

    container.querySelector('#btn-add-sup')?.addEventListener('click', async () => {
        const team  = container.querySelector('#sup-team')?.value;
        const label = container.querySelector('#sup-label')?.value.trim();
        const start = container.querySelector('#sup-start')?.value;
        const end   = container.querySelector('#sup-end')?.value;
        const mpw   = parseInt(container.querySelector('#sup-mpw')?.value) || 2;
        const checked = [...container.querySelectorAll('#sup-members-checkboxes input:checked')].map(c => c.value);
        if (!team || !start) { toast('Equipe et date de debut requises', 'warning'); return; }
        try {
            await api.createSupport({ team, weekLabel: label, weekStart: start, weekEnd: end || start, members: checked, weekMode: getSupportWeekMode(team), membersPerWeek: mpw });
            toast('Rotation ajoutee', 'success');
            await _rotRefreshPanels(container);
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Sprint ────────────────────────────────────────────────────────────────
    // ── Sprint pills - clic pour pré-remplir le formulaire sprint ────────────
    container.querySelectorAll('.pi-sprint-pill[data-sprint-idx]').forEach(pill => {
        pill.addEventListener('click', () => {
            const idx      = parseInt(pill.dataset.sprintIdx);
            const label    = pill.dataset.sprintLabel;
            const track    = container.querySelector('.pi-sprint-track');
            const curIdx   = parseInt(track?.dataset.curIdx ?? '-1');
            const dur      = parseInt(track?.dataset.sprintDur ?? '14');
            const curStart = track?.dataset.curStart;

            const nameEl = container.querySelector('#sprint-form input[name="name"]');
            if (nameEl) nameEl.value = `Sprint #${label}`;

            if (curStart && curIdx >= 0) {
                const offset   = idx - curIdx;
                const start    = new Date(curStart + 'T00:00:00');
                start.setDate(start.getDate() + offset * dur);
                const end = new Date(start);
                end.setDate(end.getDate() + dur - 1);
                const startEl = container.querySelector('#sprint-form input[name="startDate"]');
                const endEl   = container.querySelector('#sprint-form input[name="endDate"]');
                if (startEl) startEl.value = start.toISOString().slice(0, 10);
                if (endEl)   endEl.value   = end.toISOString().slice(0, 10);
            }

            // Marquer ce pill comme "current" (un seul à la fois)
            container.querySelectorAll('.pi-sprint-pill[data-sprint-idx]').forEach(p => p.classList.remove('current'));
            pill.classList.add('current');

            // Scroll vers le formulaire sprint
            container.querySelector('.sprint-nested-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });

    container.querySelector('#sprint-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api.updateSprint({
                name: fd.get('name'),
                startDate: fd.get('startDate') ? new Date(fd.get('startDate')).toISOString() : null,
                endDate: fd.get('endDate') ? new Date(fd.get('endDate')).toISOString() : null,
                goal: fd.get('goal'),
            });
            toast('Sprint mis a jour', 'success');
        } catch (e) { toast(e.message, 'error'); }
    });

    // ── Push sprint vers JIRA ─────────────────────────────────────────────────
    container.querySelector('#btn-sprint-push-jira')?.addEventListener('click', async () => {
        const form = container.querySelector('#sprint-form');
        const fd   = new FormData(form);
        const name      = fd.get('name') || sprintInfo?.name || '';
        const startDate = fd.get('startDate') || (sprintInfo?.startDate || '').slice(0, 10);
        const endDate   = fd.get('endDate')   || (sprintInfo?.endDate   || '').slice(0, 10);
        const goal      = fd.get('goal') || sprintInfo?.goal || '';

        if (!sprintInfo?.jiraId) { toast('ID JIRA du sprint manquant — relancer une sync', 'warning'); return; }
        if (!startDate || !endDate) { toast('Dates requises', 'warning'); return; }

        const msg = `Pousser ces valeurs vers JIRA ?\n\n` +
            `• Nom: ${name}\n` +
            `• Début: ${startDate}\n` +
            `• Fin: ${endDate}\n` +
            `• Objectif: ${goal ? goal.slice(0, 60) + (goal.length > 60 ? '…' : '') : '(vide)'}\n\n` +
            `Sprint JIRA ID: ${sprintInfo.jiraId}\n\n` +
            `Cette action écrasera les valeurs côté JIRA. Continuer ?`;
        if (!confirm(msg)) return;

        const btn = container.querySelector('#btn-sprint-push-jira');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Push en cours…';
        try {
            // PUT JIRA expects ISO datetime with TZ. On utilise midnight local → ISO.
            const r = await fetch(`/jira/rest/agile/1.0/sprint/${encodeURIComponent(sprintInfo.jiraId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    startDate: new Date(`${startDate}T00:00:00`).toISOString(),
                    endDate:   new Date(`${endDate}T23:59:59`).toISOString(),
                    goal,
                }),
            });
            if (!r.ok) {
                const txt = await r.text().catch(() => '');
                throw new Error(`JIRA ${r.status}: ${txt.slice(0, 200) || 'permissions insuffisantes ?'}`);
            }
            toast('Sprint poussé vers JIRA ✓', 'success');
        } catch (err) {
            toast(`Échec push JIRA : ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    });

    // PI form
    container.querySelector('#pi-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            const current = store.get('piInfo') || {};
            await api.updatePI({
                ...current,
                number: parseInt(fd.get('number')) || current.number || 0,
                name: fd.get('piName') || current.name || '',
                sprintsPerPI: parseInt(fd.get('sprintsPerPI')) || 5,
                sprintDuration: parseInt(fd.get('sprintDuration')) || 14,
                startDate: (fd.get('startDate') || '').toString() || null,
                velocityTarget: parseInt(fd.get('velocityTarget')) || null,
            });
            // Recharger piInfo dans le store pour que la timeline rotation soit immédiatement réalignée
            try { const fresh = await api.getPI(); store.set('piInfo', fresh); } catch {}
            toast('PI mis a jour', 'success');
        } catch (e) { toast(e.message, 'error'); }
    });


    // ── Reminders ─────────────────────────────────────────────────────────────
    container.querySelectorAll('.reminder-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const rid  = toggle.dataset.rid;
            const saved = loadReminders();
            saved[rid] = { ...saved[rid], enabled: toggle.checked };
            _saveReminders(saved);
            const card  = container.querySelector(`.reminder-card[data-rid="${rid}"]`);
            const input = card?.querySelector('.reminder-days-input');
            card?.classList.toggle('reminder-card--off', !toggle.checked);
            if (input) input.disabled = !toggle.checked;
        });
    });
    container.querySelectorAll('.reminder-days-input').forEach(input => {
        input.addEventListener('change', () => {
            const rid  = input.dataset.rid;
            const saved = loadReminders();
            saved[rid] = { ...saved[rid], dBefore: Math.max(0, parseInt(input.value) || 0) };
            _saveReminders(saved);
        });
    });

    // ── Data ──────────────────────────────────────────────────────────────────
    container.querySelector('#btn-export')?.addEventListener('click', async () => {
        try {
            const data = await api.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `squad-board-${new Date().toISOString().slice(0, 10)}.json`;
            a.click(); URL.revokeObjectURL(a.href);
            toast('Exporte', 'success');
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelector('#btn-import-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (!confirm('Importer ? Les donnees actuelles seront remplacees.')) return;
            await api.importAll(data, 'replace');
            await reloadAndRender(container);
            toast('Import reussi', 'success');
        } catch (err) { toast(`Erreur: ${err.message}`, 'error'); }
    });

    container.querySelector('#btn-clear')?.addEventListener('click', async () => {
        if (!confirm('Tout supprimer ? Irreversible.')) return;
        try {
            await api.importAll({ tickets: [], features: [], epics: [], members: [], teams: [], groups: [], absences: [], support: [], sprint: [], pi: [] }, 'replace');
            await reloadAndRender(container);
            toast('Donnees supprimees', 'info');
        } catch (e) { toast(e.message, 'error'); }
    });

    // Activation du système de tabs (post-render — slugify titres + nav + display switch)
    _settingsApplyTabs(container);
    store.set('settingsSection', null);   // consommé par _settingsApplyTabs
}

// ── Système de tabs Settings ────────────────────────────────────────────────
// Transforme les .settings-section empilées en navigation par tabs (1 visible à la fois).
// Source de la tab active (priorité) : hash #settings/<slug> > store.settingsSection > localStorage > 1re.
function _settingsApplyTabs(container) {
    const sections = [...container.querySelectorAll('.settings-section')];
    if (!sections.length) return;
    const _slug = s => s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const tabs = sections.map((sec, i) => {
        const h3 = sec.querySelector('.settings-section-header h3');
        const rawTitle = (h3?.textContent || `Section ${i + 1}`).trim();
        // Strip suffixe "(N)" et autres compteurs entre parenthèses du titre affiché en tab.
        const title = rawTitle.replace(/\s*\(\d+\)\s*$/, '').trim();
        // Conserve un id stable (existant ou dérivé du titre — section-rotation, section-sprint-pi, etc.)
        let id = sec.id;
        if (!id) { id = 'section-' + _slug(title); sec.id = id; }
        const slug = id.replace(/^section-/, '');
        // En mode tabs : on retire le toggle individuel des headers (ils ne doivent plus collapser)
        sec.querySelectorAll('[data-stg-toggle]').forEach(h => h.removeAttribute('data-stg-toggle'));
        return { sec, id, slug, title, icon: _settingsTabIcon(title), color: _settingsTabColor(i) };
    });

    const nav = container.querySelector('#settings-tabs');
    if (!nav) return;
    nav.innerHTML = tabs.map(t =>
        `<button class="stg-tab" data-stg-tab="${esc(t.slug)}" style="--tab-color:${t.color}" title="${esc(t.title)}">
            <span class="stg-tab-icon">${t.icon}</span>
            <span class="stg-tab-label">${esc(t.title)}</span>
        </button>`
    ).join('');

    const activate = (slug, { syncHash = true } = {}) => {
        const found = tabs.find(t => t.slug === slug) || tabs[0];
        if (!found) return;
        tabs.forEach(t => {
            const isActive = t === found;
            t.sec.style.display = isActive ? '' : 'none';
            // Tab active : on s'assure que le contenu est déplié (ignore l'état 'collapsed')
            if (isActive) t.sec.classList.remove('collapsed');
        });
        nav.querySelectorAll('[data-stg-tab]').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.stgTab === found.slug);
        });
        localStorage.setItem('sb-settings-tab', found.slug);
        // Sync URL : on stocke dans le store (consommé par pushHash → #settings/<slug>) sans
        // re-déclencher le re-render. replaceState pour ne pas polluer l'historique à chaque clic.
        if (syncHash) {
            store.set('settingsSection', found.slug);
            const target = `#settings/${found.slug}`;
            if (location.hash !== target) history.replaceState(null, '', target);
        }
    };

    // Détermination de la tab initiale (sans sync hash : on lit l'état existant)
    const _hashParts = location.hash.replace(/^#/, '').split('/');
    const fromHash  = (_hashParts[0] === 'settings' && _hashParts[1]) ? decodeURIComponent(_hashParts[1]) : null;
    const fromStore = store.get('settingsSection');
    const fromLS    = localStorage.getItem('sb-settings-tab');
    activate(fromHash || fromStore || fromLS || tabs[0]?.slug, { syncHash: false });
    // Sync hash initial : si on a déterminé une tab et que le hash n'est pas déjà settings/<slug>, on le pose
    if (tabs.length) {
        const activeSlug = (nav.querySelector('.stg-tab.is-active')?.dataset.stgTab) || tabs[0].slug;
        store.set('settingsSection', activeSlug);
        const target = `#settings/${activeSlug}`;
        if (location.hash !== target) history.replaceState(null, '', target);
    }

    nav.querySelectorAll('[data-stg-tab]').forEach(btn => {
        btn.addEventListener('click', () => activate(btn.dataset.stgTab));
    });
}

function _settingsTabIcon(title) {
    const t = title.toLowerCase();
    if (t.includes('groupe') || t.includes('ligne')) return '🌳';
    if (t.includes('equipe') || t.includes('équipe')) return '👥';
    if (t.includes('membre')) return '🧑';
    if (t.includes('absence') || t.includes('conge') || t.includes('congé')) return '🌴';
    if (t.includes('sprint') || t.includes('pi')) return '🚀';
    if (t.includes('rotation') || t.includes('support')) return '🛎️';
    if (t.includes('fait') || t.includes('event')) return '⚡';
    if (t.includes('calend')) return '📅';
    if (t.includes('jira')) return '🔗';
    if (t.includes('rappel') || t.includes('reminder')) return '⏰';
    if (t.includes('donn') || t.includes('export') || t.includes('import')) return '📦';
    return '⚙️';
}
function _settingsTabColor(i) {
    const palette = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#a855f7','#22c55e','#f97316','#3b82f6','#ec4899','#14b8a6'];
    return palette[i % palette.length];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rotation Support - Refresh partiel (ne touche pas au reste de la page)
// ═══════════════════════════════════════════════════════════════════════════════

/** Recharge les données support depuis l'API puis re-rend uniquement #rot-panels */
async function _rotRefreshPanels(container) {
    const panelsEl = container.querySelector('#rot-panels');
    if (!panelsEl) return;
    try {
        const support = await api.getSupport();
        store.set('support', support);
        _rotRenderPanels(container, support);
    } catch (e) { toast(e.message, 'error'); }
}

/** Re-rend #rot-panels depuis les données fournies puis recâble les events */
function _rotRenderPanels(container, support) {
    const panelsEl = container.querySelector('#rot-panels');
    if (!panelsEl) return;
    const teamNames   = store.get('teams') || [];
    const teamObjects = store.get('teamObjects') || [];
    const absences    = store.get('absences') || [];
    // Rotation support → membres dérivés des absences (source de vérité CSV RH)
    const rotMembers  = deriveMembersFromAbsences(absences, store.get('members') || []);
    panelsEl.innerHTML = _rotPanelsHtml(teamNames, teamObjects, support, rotMembers, absences);
    _rotWirePanelEvents(container);
}

/** Câble tous les handlers data-rot-* sur les panneaux dans container */
function _rotWirePanelEvents(container) {
    // Collapse toggle (pas d'appel API)
    container.querySelectorAll('[data-rot-toggle]').forEach(hdr => {
        hdr.addEventListener('click', () => {
            _rotSetCollapsed(hdr.dataset.rotToggle, !_rotIsCollapsed(hdr.dataset.rotToggle));
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Effectif/semaine (pas d'appel API)
    container.querySelectorAll('[data-rot-mpw]').forEach(inp => {
        inp.addEventListener('change', () => {
            localStorage.setItem(`rot-mpw-${inp.dataset.rotMpw}`, inp.value);
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Mode semaine par équipe (vendredi par défaut, mercredi ou lundi possibles)
    container.querySelectorAll('[data-rot-mode]').forEach(sel => {
        sel.addEventListener('change', () => {
            localStorage.setItem(`rot-mode-${sel.dataset.rotMode}`, sel.value);
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Toggle actif/inactif support par membre (exclu des shuffles + grisé dans la grille)
    container.querySelectorAll('[data-rot-active]').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.rotActive;
            const wasActive = btn.classList.contains('is-on');
            setMemberSupportActive(name, !wasActive);
            _rotRenderPanels(container, store.get('support') || []);
        });
    });

    // Toggle cellule membre ↔ semaine
    container.querySelectorAll('[data-rot-cell]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const { rotCell: team, member, weekStart, weekEnd, weekLabel } = btn.dataset;
            const support  = store.get('support') || [];
            const existing = support.find(s => s.team === team && s.weekStart === weekStart);
            try {
                if (existing) {
                    const cur = existing.members || [];
                    const newMembers = cur.includes(member)
                        ? cur.filter(m => m !== member)
                        : [...cur, member];
                    await api.updateSupport(existing.id, { members: newMembers });
                } else {
                    const mpw = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
                    await api.createSupport({ team, weekLabel, weekStart, weekEnd, members: [member], weekMode: getSupportWeekMode(team), membersPerWeek: mpw });
                }
                await _rotRefreshPanels(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // Switch PI courant / suivant (état session uniquement → reset au reload sur "courant")
    container.querySelector('#rot-pi-switch-cur')?.addEventListener('click', () => {
        _rotShowNext = false;
        _rotRenderPanels(container, store.get('support') || []);
    });
    container.querySelector('#rot-next-pi-toggle')?.addEventListener('click', () => {
        _rotShowNext = true;
        _rotRenderPanels(container, store.get('support') || []);
    });

    // Shuffle (génération automatique) — règles métier centralisées dans utils.generateSupportRotation
    container.querySelectorAll('[data-rot-shuffle]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const team        = btn.dataset.rotShuffle;
            const mpw         = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
            const absences    = store.get('absences') || [];
            const allMembers  = deriveMembersFromAbsences(absences, store.get('members') || []);
            // Match tolérant (gère "Fuego" vs "GCOM - Fuego" / casse / espace) — cohérent avec support.js
            const _norm = s => (s || '').toLowerCase().trim();
            const target = _norm(team);
            const teamMembers = allMembers
                .filter(m => {
                    const t = _norm(m.team);
                    return t === target || (target && t && (t.includes(target) || target.includes(t)));
                })
                .map(m => m.name);
            if (!teamMembers.length) {
                const known = [...new Set(allMembers.map(m => m.team).filter(Boolean))].sort();
                const hint = known.length
                    ? `Équipes vues en base : ${known.slice(0, 6).join(', ')}${known.length > 6 ? '…' : ''}`
                    : 'Importe d\'abord le CSV RH.';
                toast(`Aucun membre rattaché à "${team}". ${hint}`, 'warning');
                return;
            }
            // Filtrage des membres marqués inactifs (rôles non éligibles support)
            const activeMembers = teamMembers.filter(isMemberSupportActive);
            if (!activeMembers.length) {
                toast(`Tous les membres de ${team} sont marqués inactifs pour le support.`, 'warning');
                return;
            }
            const teamMode = getSupportWeekMode(team);
            const { curWeeks, nextWeeks } = _rotBuildPiWeeks(team);
            // Le shuffle régénère le PI affiché (courant par défaut, suivant si switch activé pour la session)
            const weeks  = _rotShowNext ? nextWeeks : curWeeks;
            const existingSupport = (store.get('support') || []).filter(s => s.team === team);
            const rotations = generateSupportRotation({
                team, weeks, memberNames: activeMembers, absences, existingSupport,
                membersPerWeek: mpw, weekMode: teamMode,
            });
            try {
                await api.bulkCreateSupport(team, rotations);
                const preserved = rotations.filter(r => r._autoLocked || r.locked).length;
                const msg = preserved
                    ? `Rotation generee pour ${team} (${weeks.length} sem., ${preserved} preservees)`
                    : `Rotation generee pour ${team} (${weeks.length} semaines)`;
                toast(msg, 'success');
                await _rotRefreshPanels(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // Effacer la rotation d'une équipe
    container.querySelectorAll('[data-rot-clear]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const team     = btn.dataset.rotClear;
            if (!confirm(`Supprimer toute la rotation de ${team} ?`)) return;
            const support  = store.get('support') || [];
            const toDelete = support.filter(s => s.team === team);
            try {
                await Promise.all(toDelete.map(s => api.deleteSupport(s.id)));
                toast(`Rotation ${team} supprimee`, 'info');
                await _rotRefreshPanels(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rotation Support - Grid helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Génère les semaines du PI courant et suivant pour une équipe.
 *  Si pas d'équipe, utilise le mode par défaut. */
function _rotBuildPiWeeks(team = null) {
    const mode = team ? getSupportWeekMode(team) : SUPPORT_WEEK_MODE_DEFAULT;
    return buildSupportPiWeeks(store.get('piInfo'), store.get('sprintInfo'), mode);
}

/** Nombre de jours d'absence pour un membre sur une plage */
function _rotAbsDays(memberName, weekStart, weekEnd, absences) {
    return absences
        .filter(a => a.memberName === memberName && a.startDate <= weekEnd && a.endDate >= weekStart)
        .reduce((sum, a) => sum + (a.days || 0), 0);
}

/** Format court : "14 avr." */
function _rotFmtShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** État collapse par équipe (localStorage) */
function _rotIsCollapsed(team) {
    try { const s = JSON.parse(localStorage.getItem('rot-collapsed') || '{}'); return s[team] !== false; } catch { return true; }
}
function _rotSetCollapsed(team, val) {
    try { const s = JSON.parse(localStorage.getItem('rot-collapsed') || '{}'); s[team] = val; localStorage.setItem('rot-collapsed', JSON.stringify(s)); } catch {}
}

// État du switch PI courant/suivant : variable de module = reset au reload.
// Le user demande "afficher PI en cours par défaut" → on ne persiste plus dans localStorage.
// Le switch reste fonctionnel pendant la session via cette variable.
let _rotShowNext = false;

/** Rend tous les panneaux de rotation (un par équipe) */
function _rotPanelsHtml(teamNames, teamObjects, support, members, absences) {
    if (!teamNames.length) return '<p class="text-muted text-sm">Aucune equipe configuree</p>';
    const { curWeeks, nextWeeks, curPiNum, nextPiNum } = _rotBuildPiWeeks();
    // Tri alpha-numérique des équipes (insensible à la casse, accents normalisés)
    teamNames = [...teamNames].sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
    const showNext = _rotShowNext;
    const today    = new Date().toISOString().slice(0, 10);

    // Switch exclusif : on affiche soit le PI courant, soit le PI suivant (jamais les 2)
    const toggleBtn = `<div class="rot-pi-switch" role="tablist" aria-label="PI affiché dans le tableau">
        <button class="rot-pi-switch-btn${!showNext ? ' is-active' : ''}" id="rot-pi-switch-cur" role="tab" aria-selected="${!showNext}" title="Afficher le PI courant">
            <span class="rot-pi-switch-icon">📆</span>
            <span>PI ${curPiNum || '?'} <small>courant</small></span>
        </button>
        <button class="rot-pi-switch-btn${showNext ? ' is-active' : ''}" id="rot-next-pi-toggle" role="tab" aria-selected="${showNext}" title="Afficher le PI suivant">
            <span class="rot-pi-switch-icon">📅</span>
            <span>PI ${nextPiNum || '?'} <small>suivant</small></span>
        </button>
    </div>`;

    // Match tolérant entre équipes config app et équipes du CSV RH (cf. piège #5 agent debugger)
    const _norm = s => (s || '').toLowerCase().trim();
    const _matchTeam = (memberTeam, target) => {
        const t = _norm(memberTeam);
        const tgt = _norm(target);
        return t === tgt || (tgt && t && (t.includes(tgt) || tgt.includes(t)));
    };

    const panels = teamNames.map(teamName => {
        const teamObj   = teamObjects.find(t => (typeof t === 'string' ? t : t.name) === teamName);
        const teamColor = (typeof teamObj === 'object' ? teamObj?.color : null) || '#64748b';
        const teamMembers = members.filter(m => _matchTeam(m.team, teamName)).map(m => m.name);
        if (!teamMembers.length) return '';
        const teamSupport = support.filter(s => _matchTeam(s.team, teamName));
        return _rotTeamPanelHtml(teamName, teamColor, teamSupport, teamMembers, absences,
            curWeeks, nextWeeks, showNext, today, curPiNum, nextPiNum);
    }).filter(Boolean).join('');

    // Diagnostic : si aucun panneau, on liste les équipes vues côté CSV pour aider à corriger le mapping
    let emptyHint = '';
    if (!panels) {
        const knownInData = [...new Set(members.map(m => m.team).filter(Boolean))].sort();
        emptyHint = knownInData.length
            ? `<div class="rot-empty-hint">
                <p><strong>Aucune équipe configurée n'a de membre rattaché.</strong></p>
                <p>Équipes vues dans le CSV congés : <code>${knownInData.map(esc).join('</code>, <code>')}</code></p>
                <p class="text-xs text-muted">Renomme côté Settings → Équipes ou côté CSV pour aligner.</p>
            </div>`
            : '<p class="text-muted text-sm">Ajoutez des membres aux équipes (ou importez le CSV congés) pour configurer la rotation.</p>';
    }

    return toggleBtn + (panels || emptyHint);
}

/** Rend le panneau d'une équipe avec sa grille membre×semaine. Le switch PI sélectionne
 *  UN seul PI à la fois (courant OU suivant), pas la concaténation.
 *  Les semaines sont recalculées selon le mode équipe (friday par défaut, mercredi pour certaines). */
function _rotTeamPanelHtml(teamName, teamColor, teamSupport, teamMembers, absences,
                            _ignoredCurWeeks, _ignoredNextWeeks, showNext, today, curPiNum, nextPiNum) {
    const collapsed  = _rotIsCollapsed(teamName);
    const mpw        = parseInt(localStorage.getItem(`rot-mpw-${teamName}`)) || 2;
    // Recalcul des semaines selon le mode de l'équipe (override le calcul global)
    const { curWeeks, nextWeeks } = _rotBuildPiWeeks(teamName);
    // Switch exclusif : PI courant OU PI suivant (pas les 2)
    const allWeeks   = showNext ? nextWeeks : curWeeks;
    const panelPiNum = showNext ? nextPiNum : curPiNum;

    // Résumé sur le PI affiché (pas toujours le courant)
    const filledWeeks = allWeeks.filter(w => {
        const e = teamSupport.find(s => s.weekStart === w.weekStart);
        return e && (e.members || []).length > 0;
    }).length;
    const fullWeeks = allWeeks.filter(w => {
        const e = teamSupport.find(s => s.weekStart === w.weekStart);
        return e && (e.members || []).length === mpw;
    }).length;
    const summaryColor = fullWeeks === allWeeks.length ? 'var(--success)' : filledWeeks > 0 ? 'var(--warning)' : 'var(--danger)';
    const piLabel = panelPiNum ? `PI ${panelPiNum}` : '';
    const activeCount = teamMembers.filter(isMemberSupportActive).length;
    const inactiveCount = teamMembers.length - activeCount;
    const memberSummary = inactiveCount > 0
        ? `${activeCount}/${teamMembers.length} actif${activeCount > 1 ? 's' : ''} <small class="rot-sum-inactive">(${inactiveCount} hors support)</small>`
        : `${teamMembers.length} membre${teamMembers.length > 1 ? 's' : ''}`;
    const summaryHtml = `<span class="rot-sum">${memberSummary}${piLabel ? ` · ${piLabel}` : ''} · <span style="color:${summaryColor}">${filledWeeks}/${allWeeks.length} sem.</span></span>`;

    if (collapsed) {
        return `<div class="rot-panel" id="rot-panel-${esc(teamName)}" style="border-left:3px solid ${teamColor}">
            <div class="rot-panel-hdr" data-rot-toggle="${esc(teamName)}">
                <span class="rot-chevron">▶</span>
                <span class="rot-dot" style="background:${teamColor}"></span>
                <span class="rot-name">${esc(teamName)}</span>
                ${summaryHtml}
            </div>
        </div>`;
    }

    // ── Helpers cellule ────────────────────────────────────────────────────────
    const mkWeekTh = (w, isNext) => {
        const isCur = today >= w.weekStart && today <= w.weekEnd;
        return `<th class="rot-wk-th${isCur ? ' rot-wk-current' : ''}${isNext ? ' rot-wk-next-pi' : ''}">
            <span class="rot-wk-label">${w.label}</span>
            <span class="rot-wk-dates">${_rotFmtShort(w.weekStart)}</span>
        </th>`;
    };

    const mkCell = (w, member, isNext) => {
        const entry   = teamSupport.find(s => s.weekStart === w.weekStart);
        const sel     = entry && (entry.members || []).includes(member);
        const absDays = _rotAbsDays(member, w.weekStart, w.weekEnd, absences);
        const absent  = absDays >= 2.5;
        const partial = absDays > 0 && !absent;
        const isCur   = today >= w.weekStart && today <= w.weekEnd;
        const absBadge = absDays > 0
            ? `<span class="rot-abs-badge${absent ? ' rot-abs-full' : ''}" title="${absDays}j congé">${absDays % 1 ? absDays.toFixed(1) : absDays}j</span>`
            : '';
        const cls = [
            'rot-cell',
            absent  ? 'rot-cell-absent'  : '',
            partial ? 'rot-cell-partial' : '',
            isCur   ? 'rot-cell-current' : '',
            isNext  ? 'rot-cell-next-pi' : '',
        ].filter(Boolean).join(' ');
        return `<td class="${cls}">
            ${absBadge}
            <button class="rot-chip${sel ? ' rot-chip-on' : ''}"
                style="${sel ? `background:${teamColor}22;color:${teamColor};border-color:${teamColor}` : ''}"
                data-rot-cell="${esc(teamName)}"
                data-member="${esc(member)}"
                data-week-start="${w.weekStart}"
                data-week-end="${w.weekEnd}"
                data-week-label="${w.label}"
            >${sel ? '✓' : '+'}</button>
        </td>`;
    };

    const mkCountCell = (w, isNext) => {
        const entry = teamSupport.find(s => s.weekStart === w.weekStart);
        const cnt   = entry ? (entry.members || []).length : 0;
        const isCur = today >= w.weekStart && today <= w.weekEnd;
        const cls   = cnt === mpw ? 'rot-count-ok' : cnt > 0 ? 'rot-count-partial' : '';
        return `<td class="rot-cell rot-count-cell ${cls}${isCur ? ' rot-cell-current' : ''}${isNext ? ' rot-cell-next-pi' : ''}">${cnt}/${mpw}</td>`;
    };

    // ── En-têtes : un seul PI affiché (déterminé par le switch) ──────────────
    const piHeader = panelPiNum ? `PI ${panelPiNum}` : (showNext ? 'PI suivant' : 'PI courant');
    const piGroupRow = `<tr>
        <th class="rot-member-th" rowspan="2">Membre</th>
        <th colspan="${allWeeks.length}" class="rot-pi-group-th${showNext ? ' rot-pi-group-next' : ''}">${piHeader}</th>
    </tr>`;
    const weekRow = `<tr>
        ${allWeeks.map(w => mkWeekTh(w, showNext)).join('')}
    </tr>`;

    // ── Lignes membres ─────────────────────────────────────────────────────────
    const memberRows = teamMembers.map(member => {
        const active = isMemberSupportActive(member);
        const toggleLbl = active ? 'Actif support — cliquer pour désactiver' : 'Inactif support — cliquer pour activer';
        return `
        <tr class="${active ? '' : 'rot-row-inactive'}">
            <td class="rot-member-td">
                <button type="button" class="rot-active-toggle${active ? ' is-on' : ''}"
                        data-rot-active="${esc(member)}"
                        title="${toggleLbl}"
                        aria-pressed="${active}">${active ? '🛎️' : '🚫'}</button>
                <span class="rot-member-name${active ? '' : ' is-inactive'}">${esc(member)}</span>
            </td>
            ${allWeeks.map(w => mkCell(w, member, showNext)).join('')}
        </tr>`;
    }).join('');

    // ── Ligne totaux ───────────────────────────────────────────────────────────
    const countRow = `<tr class="rot-count-row">
        <td class="rot-member-th">Total</td>
        ${allWeeks.map(w => mkCountCell(w, showNext)).join('')}
    </tr>`;

    return `<div class="rot-panel" id="rot-panel-${esc(teamName)}" style="border-left:3px solid ${teamColor}">
        <div class="rot-panel-hdr" data-rot-toggle="${esc(teamName)}">
            <span class="rot-chevron">▼</span>
            <span class="rot-dot" style="background:${teamColor}"></span>
            <span class="rot-name">${esc(teamName)}</span>
            ${summaryHtml}
            <div class="rot-panel-actions" onclick="event.stopPropagation()">
                <label class="text-xs text-muted rot-mpw-label">Eff./sem
                    <input type="number" class="input rot-mpw-input" min="1" max="10" value="${mpw}"
                        data-rot-mpw="${esc(teamName)}">
                </label>
                <label class="text-xs text-muted rot-mpw-label" title="Jour de début de chaque semaine support">Semaine
                    <select class="select select-sm rot-mode-select" data-rot-mode="${esc(teamName)}">
                        ${Object.entries(SUPPORT_WEEK_MODES).map(([k, v]) =>
                            `<option value="${k}"${k === getSupportWeekMode(teamName) ? ' selected' : ''}>${v.label}</option>`
                        ).join('')}
                    </select>
                </label>
                <button class="btn btn-sm btn-secondary rot-btn" data-rot-shuffle="${esc(teamName)}" title="Générer automatiquement en respectant les congés">🎲 Shuffle</button>
                <button class="btn btn-sm btn-danger rot-btn" data-rot-clear="${esc(teamName)}" title="Effacer la rotation de cette équipe">✕</button>
            </div>
        </div>
        <div class="rot-panel-body">
            <div class="table-wrap">
                <table class="rot-grid">
                    <thead>${piGroupRow}${weekRow}</thead>
                    <tbody>
                        ${memberRows}
                        ${countRow}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

async function _calReloadSection(container) {
    const [calendars, calendarEvents] = await Promise.all([
        api.getCalendars().catch(() => []),
        api.getCalendarEvents().catch(() => []),
    ]);
    store.set('calendars', calendars);
    store.set('calendarEvents', calendarEvents);
    renderSettings(container);
}

async function reloadAndRender(container) {
    const [tickets, features, epics, members, teams, groups, absences, support, events, sprint, pi, calendars, calendarEvents] = await Promise.all([
        api.getTickets(), api.getFeatures(), api.getEpics(),
        api.getMembers(), api.getTeams(), api.getGroups(),
        api.getAbsences(), api.getSupport(), api.getEvents(),
        api.getSprint().catch(() => null), api.getPI().catch(() => null),
        api.getCalendars().catch(() => []), api.getCalendarEvents().catch(() => []),
    ]);
    store.set('tickets', tickets); store.set('features', features); store.set('epics', epics);
    store.set('members', members);
    store.set('teams', teams.map(t => typeof t === 'string' ? t : t.name));
    store.set('teamObjects', teams);
    store.set('groups', groups); store.set('absences', absences); store.set('support', support);
    store.set('events', events);
    store.set('sprintInfo', sprint); store.set('piInfo', pi);
    store.set('calendars', calendars);
    store.set('calendarEvents', calendarEvents);
    renderSettings(container);
}
