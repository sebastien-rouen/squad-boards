/**
 * Détection des champs JIRA de la synchro (extrait de sync.js en 3.252.0) : story points, sprint,
 * équipe (Team[Team]), sprint PI, et champ Contributeurs (`setContributorsField`, sinon observateurs).
 * Surcharges : localStorage `sb-sync-sprintField`, `sb-sync-teamField`, `sb-sync-piSprintField`,
 * `sb-sync-contributorsField`. Une erreur d'API garde les valeurs par défaut (comportement d'origine).
 */
import * as api from './api.js';
import { SYNC_CONFIG } from './config.js';
import { detectContributorsField, setContributorsField } from './sync-parse.js';
import { projectStorage } from './project-settings.js';

/** @returns {Promise<{ storyPointsField: string, sprintFieldId: string, piSprintField: string|null, teamFieldId: string|null, fieldIndex: Map<string, string> }>} */
export async function detectSyncFields() {
    const piSprintFieldOverride = (projectStorage.getItem('sb-sync-piSprintField') || '').trim() || null;
    const sprintFieldOverride   = (projectStorage.getItem('sb-sync-sprintField')   || '').trim() || null;
    const teamFieldOverride     = (projectStorage.getItem('sb-sync-teamField')     || '').trim() || null;
    // 1. Discover story points field, sprint field, team field, and PI Sprint custom field
    let storyPointsField = 'story_points';
    let sprintFieldId    = sprintFieldOverride || SYNC_CONFIG.sprintField;
    let piSprintField    = piSprintFieldOverride;
    let teamFieldId      = teamFieldOverride;  // "Team[Team]" field — direct team assignment on Features
    let _fieldIndex      = new Map(); // id → name, for diagnostic
    try {
        const fields = await api.jiraGet('rest/api/3/field');
        for (const f of fields) if (f.id && f.name) _fieldIndex.set(f.id, f.name);
        const spField = fields.find(f => f.name?.toLowerCase().includes('story point') && f.custom);
        if (spField) storyPointsField = spField.id;
        // Auto-detect sprint field by exact name "Sprint" (ID varies: 10020, 10021…)
        if (!sprintFieldOverride) {
            const sf = fields.find(f => f.custom && f.name?.toLowerCase() === 'sprint');
            if (sf) {
                sprintFieldId = sf.id;
                console.log(`[Squad-Board] Sprint field auto-detecte: "${sf.name}" (${sprintFieldId})`);
            }
        } else if (!/^customfield_\d+$/.test(sprintFieldId)) {
            // Override is a JQL clause name (e.g. "Sprint") — resolve to customfield ID
            const resolved = fields.find(f =>
                f.clauseNames?.includes(sprintFieldId) || f.name?.toLowerCase() === sprintFieldId.toLowerCase()
            );
            if (resolved) {
                console.log(`[Squad-Board] Sprint field "${sprintFieldId}" resolu → ${resolved.id} ("${resolved.name}")`);
                sprintFieldId = resolved.id;
            } else {
                console.warn(`[Squad-Board] Sprint field "${sprintFieldId}" non trouve dans la liste des champs JIRA — utilise tel quel.`);
            }
        } else {
            console.log(`[Squad-Board] Sprint field (override): ${sprintFieldId}`);
        }
        // Auto-detect "Team[Team]" field (Atlassian Teams integration)
        // Always log team-field candidates so user can find the right customfield ID
        const teamCandidates = fields.filter(f =>
            f.custom && (
                f.schema?.type === 'team' ||
                (f.schema?.custom || '').toLowerCase().includes('team') ||
                /team|equipe|squad/i.test(f.name || '')
            )
        );
        if (teamCandidates.length) {
            console.log('[Squad-Board] Champs Team candidats (copier l\'ID dans Parametres → Plugin JIRA → Champ Equipe):');
            console.table(teamCandidates.map(f => ({ id: f.id, name: f.name, type: f.schema?.type || '?' })));
        }
        // If the override looks like a JQL clause name (e.g. "Team[Team]"), resolve to customfield ID
        if (teamFieldId && !/^customfield_\d+$/.test(teamFieldId)) {
            const resolved = fields.find(f =>
                f.clauseNames?.includes(teamFieldId) || f.name === teamFieldId
            );
            if (resolved) {
                console.log(`[Squad-Board] Team field "${teamFieldId}" resolu → ${resolved.id} ("${resolved.name}")`);
                teamFieldId = resolved.id;
            } else {
                console.warn(`[Squad-Board] Team field "${teamFieldId}" non trouve dans la liste des champs JIRA — voir tableau ci-dessus.`);
            }
        }
        if (!teamFieldId) {
            const tf = teamCandidates[0] || null;
            if (tf) {
                teamFieldId = tf.id;
                console.log(`[Squad-Board] Team field auto-detecte: "${tf.name}" (${teamFieldId})`);
            } else {
                console.warn('[Squad-Board] Team field non detecte — configurez-le dans Parametres → Plugin JIRA → Champ Equipe (ex: "Team[Team]").');
            }
        } else {
            console.log(`[Squad-Board] Team field utilise: ${teamFieldId}`);
        }

        // Champ « Contributeurs » (volontaires aux côtés du porteur — page Affinage, cadrage)
        const contribOverride = (projectStorage.getItem('sb-sync-contributorsField') || '').trim() || null;
        const contribField = detectContributorsField(fields, contribOverride);
        setContributorsField(contribField);
        if (contribField) console.log(`[Squad-Board] Champ Contributeurs: ${contribField} ("${_fieldIndex.get(contribField) || '?'}")`);
        else console.log('[Squad-Board] Pas de champ Contributeurs — contributeurs = observateurs JIRA (sync-watchers.js) ; surcharge : localStorage sb-sync-contributorsField');

        // Auto-detect dedicated PI Sprint custom field (common in SAFe JIRA setups)
        if (!piSprintField) {
            const PI_FIELD_RE = /\bpi\b[\s_-]*(sprint|planning|increment|it[eé]ration)|program[\s_-]*increment|art[\s_-]*sprint/i;
            const piField = fields.find(f => f.custom && PI_FIELD_RE.test(f.name || ''));
            if (piField) {
                piSprintField = piField.id;
                console.log(`[Squad-Board] PI Sprint field auto-detecte: "${piField.name}" (${piSprintField})`);
            }
        } else {
            console.log(`[Squad-Board] PI Sprint field (override Settings): ${piSprintField}`);
        }
    } catch { /* use defaults */ }
    return { storyPointsField, sprintFieldId, piSprintField, teamFieldId, fieldIndex: _fieldIndex };
}
