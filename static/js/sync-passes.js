/**
 * Passes JQL de la synchro JIRA (extrait de sync.js en 3.252.0 — le fichier dépassait 1 100 lignes).
 *
 * Chaque passe reçoit le contexte `ctx` construit par `_doImport` (sync.js) : paramètres (projets, clause
 * de mise à jour du mode rapide, plafonds, ids des champs JIRA, sprint de référence) et tableaux PARTAGÉS
 * `allTickets` / `allFeatures` / `allEpics`, mutés en place — l'ordre d'appel compte (features et epics
 * avant les sprints PI nommés, pour que l'ordre de rang JIRA l'emporte ; `ctx.rank` porte ce rang).
 * Code déplacé à l'identique : seules les variables locales sont devenues des champs de `ctx`.
 * ⚠️ Toute passe qui PRODUIT des tickets demande `description,comment,issuelinks` + `contributorsFieldParam()`.
 */
import { setProgress } from './sync-report.js';
import { contributorsFieldParam, transformIssue, _extractTeamName, _paginateJql, _normalizeTeamName } from './sync-parse.js';

/** 3b. Tickets du PI suivant dans les sprints futurs (Roadmap PI suivant, Affinage). */
export async function fetchNextPiFutureTickets(ctx) {
    const { projects, updClause, maxFeaturesPerJql, sprintInfo, knownBoardTeams, storyPointsField, sprintFieldId, teamFieldId, allTickets, incidents } = ctx;
    // 3b. Fetch next-PI tickets from future sprints (pour la vue Roadmap PI suivant)
    if (sprintInfo) {
        const piMatch = sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i);
        if (piMatch) {
            const nextPI = parseInt(piMatch[1]) + 1;
            const nextPiTag = `PI#${nextPI}`;
            setProgress(68, `Tickets PI${nextPI} (sprints futurs)...`, 'Sprints suivants');
            try {
                const futureJql = `project IN (${projects.join(',')}) AND sprint in futureSprints() AND issuetype NOT IN (Feature, "Fonctionnalite", Epic)${updClause} ORDER BY updated DESC`;
                const FUTURE_PAGE = 100;
                let nextPiAdded = 0;
                // `description,comment,issuelinks` (3.248.0) : sans eux, les tickets du PI suivant (cadrage compris) arrivaient
                // VIDES — l'Affinage les signalait « 📝 sans description » alors que JIRA en avait une.
                const futFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,created,description,comment,issuelinks,${sprintFieldId}${contributorsFieldParam()}` +
                    (teamFieldId ? `,${teamFieldId}` : '');
                const seenKeys = await _paginateJql({
                    jql: futureJql,
                    fields: futFields,
                    expand: 'changelog',
                    pageSize: FUTURE_PAGE,
                    cap: maxFeaturesPerJql,
                    onPage: (issues, total) => {
                        for (const issue of issues) {
                            const ticket = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, null, teamFieldId);
                            ticket.team = _normalizeTeamName(ticket.team, knownBoardTeams);
                            if (ticket.piSprint === nextPiTag && !allTickets.find(t => t.id === issue.key)) {
                                allTickets.push(ticket);
                                nextPiAdded++;
                            }
                        }
                        setProgress(68, `Tickets PI${nextPI} (sprints futurs)...`, `${total} scannés, ${nextPiAdded} pour ${nextPiTag}`);
                    },
                });
                console.log(`[Squad-Board] Sprints futurs: ${seenKeys.size} tickets uniques scannes — ${nextPiAdded} ajoutes pour ${nextPiTag}`);
            } catch (e) {
                console.warn('Next PI future sprints fetch:', e.message);
                incidents.add('tickets des sprints futurs (PI suivant)', e);
            }
        }
    }
}

/** 4. Features (JQL, rang JIRA) + diagnostic de couverture en console. */
export async function fetchFeatures(ctx) {
    const { projects, jqlProject, updClause, maxFeaturesPerJql, knownBoardTeams, storyPointsField, sprintFieldId, piSprintField, teamFieldId, allFeatures, incidents, fieldIndex } = ctx;
    // 4. Fetch features via JQL (paginated)
    setProgress(72, 'Recuperation des features...', `JQL sur ${projects.length} ${projects.length > 1 ? 'projets' : 'projet'}`);
    let _featureDiagSample = null;    // first raw issue processed
    let _nullPiRawSample = null;       // first raw issue whose transformed result has null piSprint
    let _richRawSample = null;         // first raw issue with non-null custom fields (best for team field discovery)
    try {
        const extraFields = [sprintFieldId, 'fixVersions'];
        if (piSprintField) extraFields.push(piSprintField);
        if (teamFieldId)   extraFields.push(teamFieldId);
        const featureFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,created,description,${extraFields.join(',')}`;
        const featureJql = `${jqlProject} AND issuetype IN (Feature, "Fonctionnalite")${updClause} ORDER BY rank ASC`;
        const featSeen = await _paginateJql({
            jql: featureJql,
            fields: featureFields,
            pageSize: 100,
            cap: maxFeaturesPerJql,
            onPage: (issues, total) => {
                setProgress(72, `Features ${total}...`, `${projects.length} ${projects.length > 1 ? 'projets' : 'projet'}`);
                for (const issue of issues) {
                    const existing = allFeatures.find(f => f.id === issue.key);
                    if (existing) {
                        existing.rank = ctx.rank.feature++;  // rank-up une feature déjà importée (passe per-board)
                        // Re-évalue le team via Team[Team] (plus précis que le board name pour les
                        // features planifiées sur un board cross-team, ex: "PI Board Features ERPC")
                        const _fromField = teamFieldId ? _extractTeamName(issue.fields?.[teamFieldId]) : null;
                        if (_fromField) {
                            existing.team = _normalizeTeamName(_fromField, knownBoardTeams);
                        }
                    } else {
                        const transformed = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                        transformed.team = _normalizeTeamName(transformed.team, knownBoardTeams);
                        transformed.rank = ctx.rank.feature++;  // ordre JIRA backlog (ORDER BY Rank ASC)
                        allFeatures.push(transformed);
                        if (!_featureDiagSample) _featureDiagSample = issue;
                        if (!_nullPiRawSample && !transformed.piSprint) _nullPiRawSample = issue;
                        if (!_richRawSample) {
                            const hasCustom = Object.keys(issue.fields || {}).some(k => k.startsWith('customfield_') && issue.fields[k] != null);
                            if (hasCustom) _richRawSample = issue;
                        }
                    }
                }
            },
        });
        const featStart = featSeen.size;
        // Diagnostic : prefer rich sample (has custom fields) to reveal Team/PI field IDs
        const diagSample = _richRawSample || _nullPiRawSample || _featureDiagSample;
        if (diagSample) {
            const f = diagSample.fields || {};
            const nullPiCount = allFeatures.filter(x => !x.piSprint).length;
            console.group('[Squad-Board] Features JQL diagnostic — ' + (nullPiCount > 0 ? `echantillon null piSprint: ${diagSample.key}` : diagSample.key));
            const nullTeamCount = allFeatures.filter(x => !x.team || x.team === 'Autre').length;
            const capLabel = maxFeaturesPerJql === Infinity ? 'illimite' : maxFeaturesPerJql;
            const featsWithPts = allFeatures.filter(x => (x.points || 0) > 0).length;
            console.log(`Features JQL scannees: ${featStart} | importees: ${allFeatures.length} (cap: ${capLabel}) | null piSprint: ${nullPiCount} | sans equipe: ${nullTeamCount} | avec Story Points: ${featsWithPts}`);
            console.log('Cle:', diagSample.key, '| Titre:', f.summary);
            console.log('Type JIRA:', f.issuetype?.name);
            console.log('Labels:', JSON.stringify(f.labels));
            console.log('Parent:', f.parent?.key, '-', f.parent?.fields?.summary);
            console.log('fixVersions:', JSON.stringify(f.fixVersions));
            console.log(`${sprintFieldId} (sprint):`, JSON.stringify(f[sprintFieldId]));
            if (teamFieldId) console.log(`${teamFieldId} (team):`, JSON.stringify(f[teamFieldId]));
            else             console.log('Team field: non configure — ajouter dans Parametres → Plugin JIRA');
            if (piSprintField) console.log(`${piSprintField} (PI custom):`, JSON.stringify(f[piSprintField]));
            // Cross-reference field IDs with names from /field API
            const nonNull = Object.entries(f)
                .filter(([k, v]) => k.startsWith('customfield_') && v !== null && v !== undefined)
                .map(([k, v]) => ({
                    id: k,
                    name: fieldIndex.get(k) || '?',
                    value: typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : String(v).slice(0, 100),
                }));
            if (nonNull.length) { console.log('Champs custom non-null:'); console.table(nonNull); }
            else console.log('Champs custom non-null: aucun');
            console.groupEnd();

            // Coverage diagnostic — helps spot projects/teams/PIs missing features
            const byProject = allFeatures.reduce((acc, x) => {
                const p = (x.id || '').split('-')[0] || '?';
                acc[p] = (acc[p] || 0) + 1; return acc;
            }, {});
            const byPi = allFeatures.reduce((acc, x) => {
                const k = x.piSprint || '— null';
                acc[k] = (acc[k] || 0) + 1; return acc;
            }, {});
            const byTeam = allFeatures.reduce((acc, x) => {
                const k = x.team || '— null';
                acc[k] = (acc[k] || 0) + 1; return acc;
            }, {});
            console.log('[Squad-Board] Features — par projet:');
            console.table(Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ project: p, count: n })));
            console.log('[Squad-Board] Features — par PI:');
            console.table(Object.entries(byPi).sort().map(([p, n]) => ({ PI: p, count: n })));
            console.log('[Squad-Board] Features — par equipe (apres normalisation):');
            console.table(Object.entries(byTeam).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ team: t, count: n })));
        } else {
            console.warn('[Squad-Board] Features JQL: 0 features retournees. Verifier le nom du type JIRA.');
        }
    } catch (e) {
        console.warn('[Squad-Board] Features JQL error:', e.message);
        incidents.add('features (requête JQL)', e);
    }
}

/** 5. Epics (JQL, rang JIRA) + diagnostic du lien epic → feature. */
export async function fetchEpics(ctx) {
    const { projects, jqlProject, updClause, maxFeaturesPerJql, knownBoardTeams, storyPointsField, sprintFieldId, piSprintField, teamFieldId, allEpics, incidents } = ctx;
    // 5. Fetch epics via JQL (paginated)
    setProgress(78, 'Recuperation des epics...', `JQL sur ${projects.length} ${projects.length > 1 ? 'projets' : 'projet'}`);
    try {
        const epicExtraFields = [sprintFieldId, 'fixVersions'];
        if (piSprintField) epicExtraFields.push(piSprintField);
        if (teamFieldId)   epicExtraFields.push(teamFieldId);
        const epicFields = `summary,status,issuetype,assignee,priority,labels,${storyPointsField},parent,updated,created,description,${epicExtraFields.join(',')}`;
        const epicJql = `${jqlProject} AND issuetype=Epic${updClause} ORDER BY rank ASC`;
        await _paginateJql({
            jql: epicJql,
            fields: epicFields,
            pageSize: 100,
            cap: maxFeaturesPerJql,
            onPage: (issues, total) => {
                setProgress(78, `Epics ${total}...`, `${projects.length} ${projects.length > 1 ? 'projets' : 'projet'}`);
                for (const issue of issues) {
                    const existing = allEpics.find(e => e.id === issue.key);
                    if (existing) {
                        existing.rank = ctx.rank.epic++;
                    } else {
                        const transformed = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                        transformed.team = _normalizeTeamName(transformed.team, knownBoardTeams);
                        transformed.rank = ctx.rank.epic++;
                        allEpics.push(transformed);
                    }
                }
            },
        });
        // Diagnostic — verify epic→feature linkage (used for PI inheritance in roadmap)
        const epicsWithFeature = allEpics.filter(e => e.feature).length;
        const epicByProject = allEpics.reduce((acc, e) => {
            const p = (e.id || '').split('-')[0] || '?';
            acc[p] = (acc[p] || 0) + 1; return acc;
        }, {});
        console.log(`[Squad-Board] Epics: ${allEpics.length} importes | ${epicsWithFeature} lies a une feature (${Math.round(epicsWithFeature * 100 / Math.max(1, allEpics.length))}%)`);
        console.table(Object.entries(epicByProject).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ project: p, count: n })));
    } catch (e) {
        console.warn('[Squad-Board] Epics fetch:', e?.message || e);
        incidents.add('epics', e);
    }
}

/** 5b. Sprints nommés « PI30 » / « PI#30 » (cadrage) — APRÈS features / epics. */
export async function fetchPiNamedSprints(ctx) {
    const { projects, jqlProject, updClause, maxFeaturesPerJql, sprintInfo, knownBoardTeams, storyPointsField, sprintFieldId, piSprintField, teamFieldId, allTickets, allFeatures, allEpics, incidents } = ctx;
    // 5b. PI-named-sprint pass — runs AFTER features/epics JQL so the standard rank order wins.
    // Catches projects (e.g. GCOM) that plan via sprints literally named "PI30" / "PI#30".
    // Items already in allFeatures/allEpics are skipped (rank preserved from earlier passes).
    if (sprintInfo) {
        const _m = sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i);
        if (_m) {
            const cur = parseInt(_m[1]);
            const piNames = [];
            for (let i = cur - 1; i <= cur + 2; i++) {
                if (i > 0) piNames.push(`PI${i}`, `PI#${i}`);
            }
            const piSprintJql = `${jqlProject} AND Sprint in (${piNames.map(n => `"${n}"`).join(',')})${updClause} ORDER BY Rank ASC`;
            setProgress(81, 'Sprints PI nommes...', piNames.join(', '));
            try {
                const added = { features: 0, epics: 0, tickets: 0 };
                const piFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,created,description,comment,issuelinks,fixVersions,${sprintFieldId}${contributorsFieldParam()}` +
                    (teamFieldId ? `,${teamFieldId}` : '') + (piSprintField ? `,${piSprintField}` : '');
                const seen = await _paginateJql({
                    jql: piSprintJql,
                    fields: piFields,
                    expand: 'changelog',
                    pageSize: 100,
                    cap: maxFeaturesPerJql,
                    onPage: (issues, total) => {
                        for (const issue of issues) {
                            const tr = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                            tr.team = _normalizeTeamName(tr.team, knownBoardTeams);
                            if (tr.type === 'feature') {
                                if (!allFeatures.find(f => f.id === issue.key)) {
                                    tr.rank = ctx.rank.feature++;
                                    allFeatures.push(tr); added.features++;
                                }
                            } else if (tr.type === 'epic') {
                                if (!allEpics.find(e => e.id === issue.key)) {
                                    tr.rank = ctx.rank.epic++;
                                    allEpics.push(tr); added.epics++;
                                }
                            } else {
                                if (!allTickets.find(t => t.id === issue.key)) { allTickets.push(tr); added.tickets++; }
                            }
                        }
                        setProgress(81, 'Sprints PI nommes...', `${total} uniques · +${added.features}f +${added.epics}e +${added.tickets}t`);
                    },
                });
                console.log(`[Squad-Board] Sprints PI nommes (${piNames.join(', ')}): ${seen.size} uniques scannes — +${added.features} features, +${added.epics} epics, +${added.tickets} tickets`);
            } catch (e) {
                console.warn('[Squad-Board] PI-named sprint fetch:', e?.message || e);
                incidents.add('sprints de cadrage (PI nommés)', e);
            }
        }
    }
}

/** 5c. Tickets rattachés aux features du PI courant, +1 et +2 (backlog, cadrage). */
export async function fetchFeatureChildren(ctx) {
    const { updClause, maxFeaturesPerJql, sprintInfo, knownBoardTeams, storyPointsField, sprintFieldId, piSprintField, teamFieldId, allTickets, allFeatures, incidents } = ctx;
    // 5c. Children of PI-current + PI-next features — Stories/Tasks linked via parent=
    //     pour la projection et l'estimation PI+1. Ciblé sur PI courant + PI suivant uniquement
    //     pour éviter d'importer l'historique complet de tous les PIs passés.
    if (allFeatures.length && sprintInfo) {
        const piMatch = sprintInfo.name.match(/(\d+)\.\d+/) || sprintInfo.name.match(/PI\s*#?\s*(\d+)/i);
        if (piMatch) {
            const curPi  = parseInt(piMatch[1]);
            const nextPi = curPi + 1;
            const nextPi2 = curPi + 2;
            // Tags acceptés : "PI#30", "PI30", "30.x" (piSprint de la feature)
            const _matchesPi = (f, piNum) => {
                const ps = (f.piSprint || '').toUpperCase();
                return ps === `PI#${piNum}` || ps === `PI${piNum}` || ps.startsWith(`${piNum}.`);
            };
            const piFeatures = allFeatures.filter(f => _matchesPi(f, curPi) || _matchesPi(f, nextPi) || _matchesPi(f, nextPi2));

            if (piFeatures.length) {
                const FEAT_CHILD_BATCH = 50;
                // description / comment / issuelinks (3.249.0) : cette passe rapatrie les tickets d'une feature hors des
                // sprints déjà lus (backlog, cadrage : TRV-6276) — sans eux ils arrivaient sans description.
                const childFields = `summary,status,issuetype,assignee,reporter,priority,labels,${storyPointsField},parent,updated,created,description,comment,issuelinks,${sprintFieldId}${contributorsFieldParam()}` +
                    (teamFieldId ? `,${teamFieldId}` : '') + (piSprintField ? `,${piSprintField}` : '');
                let childrenAdded = 0;
                for (let i = 0; i < piFeatures.length; i += FEAT_CHILD_BATCH) {
                    const ids = piFeatures.slice(i, i + FEAT_CHILD_BATCH).map(f => f.id).join(',');
                    setProgress(82, `Enfants features PI${curPi}+PI${nextPi}+PI${nextPi2}...`,
                        `batch ${Math.floor(i / FEAT_CHILD_BATCH) + 1}/${Math.ceil(piFeatures.length / FEAT_CHILD_BATCH)}`);
                    try {
                        await _paginateJql({
                            // ⚡ Quick mode : seuls les enfants modifiés récemment (updClause) sont rapatriés.
                            jql: `parent IN (${ids}) AND issuetype NOT IN (Feature, "Fonctionnalite", Epic)${updClause} ORDER BY updated DESC`,
                            fields: childFields,
                            pageSize: 100,
                            cap: maxFeaturesPerJql,
                            onPage: (issues) => {
                                for (const issue of issues) {
                                    if (allTickets.find(t => t.id === issue.key)) continue;
                                    const tr = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, piSprintField || null, teamFieldId);
                                    tr.team = _normalizeTeamName(tr.team, knownBoardTeams);
                                    allTickets.push(tr);
                                    childrenAdded++;
                                }
                            },
                        });
                    } catch (e) {
                        console.warn('[Squad-Board] Feature children fetch batch:', e?.message || e);
                        incidents.add('tickets rattachés à une feature', e);
                    }
                }
                console.log(`[Squad-Board] Enfants features PI${curPi}+PI${nextPi}+PI${nextPi2}: +${childrenAdded} tickets (${piFeatures.length} features ciblées)`);
            }
        }
    }
}

/** 6. Tickets d’amélioration continue (rétro, post-mortem, CoP, adapt). */
export async function fetchImprovementTickets(ctx) {
    const { jqlProject, maxFeaturesPerJql, knownBoardTeams, storyPointsField, sprintFieldId, teamFieldId, allTickets, allFeatures, incidents } = ctx;
    // 6. Fetch amelioration tickets (retro, post-mortem, CoP, adapt - cross-sprint)
    setProgress(83, 'Tickets amelioration continue...', 'retro / postmortem / cop / adapt');
    const AMEL_LABELS = [
        'Retro', 'Rétro', 'retro', 'rétro', 'ActionRetro', 'actionretro',
        'RetroFonc', 'retroffonc', 'retro-tech',
        'Amelioration', 'Amélioration', 'amelioration',
        'postmortem', 'Postmortem',
        'Adapt', 'adapt',
        'COP', 'CoP', 'cop', 'cop-dev', 'CoP-methodo', 'cop-methodo', 'CoP-méthodo',
        'methodo', 'Methodo',
    ];
    try {
        const amelJql = `${jqlProject} AND labels in (${AMEL_LABELS.map(l => `"${l}"`).join(',')}) AND (statusCategory != Done OR updated >= "-30d") ORDER BY updated DESC`;
        // ⚠ JIRA Cloud /search/jql ne renvoie PAS le champ `description` même quand on le demande
        // explicitement dans `fields` (limitation API). Pour les tickets ActionRetro/Postmortem où
        // la description porte tout le contexte de l'item rétro, on utilise `*all` pour avoir tous
        // les champs incluant la description. Payload plus lourd mais volume faible (~50 tickets max).
        const amelFields = '*all';
        await _paginateJql({
            jql: amelJql,
            fields: amelFields,
            pageSize: 100,
            cap: maxFeaturesPerJql,
            onPage: (issues) => {
                for (const issue of issues) {
                    if (!allTickets.find(t => t.id === issue.key) && !allFeatures.find(f => f.id === issue.key)) {
                        const ticket = transformIssue(issue, null, null, storyPointsField, null, sprintFieldId, null, teamFieldId);
                        ticket.team = _normalizeTeamName(ticket.team, knownBoardTeams);
                        allTickets.push(ticket);
                    }
                }
            },
        });
    } catch (e) {
        console.warn('Amelioration fetch:', e.message);
        incidents.add('améliorations', e);
    }
}

/** 6.5 Buffer historique : points Buffer par sprint clos. @returns {Promise<Map<string, number>>} */
export async function fetchBufferHistory(ctx) {
    const { jqlProject, quickMode, storyPointsField, sprintFieldId, incidents } = ctx;
    // 6.5 Buffer historique : récupère tous les tickets `labels = Buffer` et
    // agrège leurs Story Points par sprint clos (dernier sprint clos de chaque ticket).
    // Évite de devoir charger TOUS les tickets des sprints clos juste pour avoir le buffer.
    // ⚡ Quick mode : sauté (scan potentiellement coûteux de tous les tickets Buffer ;
    //    les bufferPoints des sprints clos sont préservés en DB via le merge des teamSprints).
    const bufferBySprintId = new Map();  // sprintId → total points buffer
    if (!quickMode) try {
        setProgress(86, 'Buffer historique...', 'tickets label=Buffer');
        const bufFields = `summary,status,${storyPointsField},${sprintFieldId}`;
        const seenBuf = await _paginateJql({
            jql: `${jqlProject} AND labels = "Buffer" ORDER BY updated DESC`,
            fields: bufFields,
            pageSize: 100,
            cap: 5000,
            onPage: (issues) => {
                for (const issue of issues) {
                    const f = issue.fields || {};
                    const pts = f[storyPointsField] || 0;
                    if (!pts) continue;
                    const sprintField = f[sprintFieldId];
                    const sprints = Array.isArray(sprintField) ? sprintField : (sprintField ? [sprintField] : []);
                    // Garde le DERNIER sprint clos (par endDate) — un ticket multi-sprint
                    // est compté dans le sprint où il a finalement été livré.
                    let last = null;
                    for (const s of sprints) {
                        if (!s || s.state !== 'closed') continue;
                        if (!last || (s.endDate || '') > (last.endDate || '')) last = s;
                    }
                    if (last?.id) {
                        const sid = String(last.id);
                        bufferBySprintId.set(sid, (bufferBySprintId.get(sid) || 0) + pts);
                    }
                }
            },
        });
        console.log(`[Squad-Board] Buffer historique : ${seenBuf.size} tickets label=Buffer scannés → ${bufferBySprintId.size} sprints renseignés`);
    } catch (e) {
        console.warn('[Squad-Board] Buffer historique : échec', e.message);
        incidents.add('buffer historique', e);
    }
    return bufferBySprintId;
}
