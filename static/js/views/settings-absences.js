/**
 * Paramètres → Absences / Congés : saisie, liste filtrable, import du CSV pivot RH
 * (aperçu, écrasement par fenêtre) — le parser vit dans settings-absences-csv.js.
 */

import { esc, fmtDate, friendlyDateField, toast, choiceModal, confirmDanger } from '../utils.js';
import { personAliasesHtml } from './settings-person-aliases.js';
import * as api from '../api.js';
import { _parsePivotAbsencesCsv, diagnosePivotCsv, convertCommasToSemicolons, _isTransverseTeam } from './settings-absences-csv.js';
import { store } from '../state.js';
import { loadPiCfg, savePiCfg } from '../utils/pi-config.js';

/** Section « Absences / Congés ». */
export function absencesSectionHtml(ctx) {
    const { absences, members, sprintInfo, piInfo } = ctx;
    return `
        <!-- ═══ Absences / Conges ═══ -->
        <div class="settings-section collapsed">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Absences / Congés (${absences.length})</h3><p>Gérez les congés et absences. Import en masse via CSV.</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                ${absences.length ? `
                    <details class="abs-list-details" id="abs-list-details">
                        <summary class="abs-list-summary">
                            <span class="abs-list-summary-label">Liste des absences</span>
                            <span class="abs-list-summary-count">${absences.length} entrée${absences.length > 1 ? 's' : ''}</span>
                        </summary>
                        <div class="abs-list-body">
                            <div class="abs-filter-row">
                                <input class="input input-sm abs-filter-input" id="abs-filter" placeholder="Filtrer par membre, équipe, type…" autocomplete="off">
                                <span class="abs-filter-count" id="abs-filter-count"></span>
                            </div>
                            <div class="table-wrap abs-table-wrap">
                                <table class="abs-table" id="abs-table">
                                    <thead><tr>
                                        <th>Membre</th><th>Équipe</th>
                                        <th>Début</th><th>Fin</th><th>Type</th><th>Jours</th><th></th>
                                    </tr></thead>
                                    <tbody id="abs-tbody">
                                        ${absences.map(a => `<tr class="abs-row"
                                            data-search="${esc((a.memberName + ' ' + a.team + ' ' + a.type).toLowerCase())}">
                                            <td class="abs-td-name">${esc(a.memberName)}</td>
                                            <td>${esc(a.team)}</td>
                                            <td>${fmtDate(a.startDate)}</td>
                                            <td>${fmtDate(a.endDate)}</td>
                                            <td><span class="chip chip-abs-${esc(a.type)}">${esc(a.type)}</span></td>
                                            <td class="abs-td-days">${a.days}j</td>
                                            <td><button aria-label="Supprimer" class="btn-icon btn-del-abs" data-id="${esc(a.id)}" title="Supprimer"><svg class="icon icon-sm text-danger"><use href="#i-x"/></svg></button></td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </details>
                ` : '<p class="text-muted text-sm mb-4">Aucune absence enregistree</p>'}

                ${personAliasesHtml()}

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
                            ${friendlyDateField({ id: 'abs-start', name: 'abs-start', placeholder: 'Début' })}
                        </div>
                        <div class="abs-add-field">
                            <label class="abs-label">Au</label>
                            ${friendlyDateField({ id: 'abs-end', name: 'abs-end', placeholder: 'Fin' })}
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
                <div class="flex gap-3 mb-2 items-center flex-wrap">
                    <div class="flex gap-2 items-center">
                        <label class="text-xs text-muted" title="Les membres importés seront associés à ce PI (snapshot — gère le turnover)">PI cible 👥 :</label>
                        <input class="input" type="number" id="abs-csv-pi" placeholder="${(() => {
                            const m = String(sprintInfo?.name || '').match(/(\d+)\.\d+/); return m ? m[1] : (piInfo?.number || '');
                        })()}" min="1" max="99" style="width:80px"
                            value="${(() => { const m = String(sprintInfo?.name || '').match(/(\d+)\.\d+/); return m ? m[1] : (piInfo?.number || ''); })()}">
                    </div>
                    <div class="flex gap-2 items-center">
                        <label class="text-xs text-muted" title="Nb de dernières colonnes du CSV correspondant au PIP du prochain PI (exclues du calcul des dates de fin du PI courant)">Jours PIP exclus :</label>
                        <input class="input" type="number" id="abs-csv-pip" value="2" min="0" max="10" style="width:64px">
                    </div>
                </div>
                <div class="abs-csv-drop" id="abs-csv-drop">
                    <label class="abs-label" for="abs-csv-input">Données CSV</label>
                    <textarea class="input" id="abs-csv-input" rows="6"
                        aria-describedby="abs-csv-hint"
                        placeholder="Collez ici les données CSV (tabulation ou point-virgule entre les colonnes), ou déposez le fichier dans cette zone…"></textarea>
                    <p class="abs-csv-hint text-xs text-muted" id="abs-csv-hint">
                        Glissez-déposez un <code>.csv</code> / <code>.tsv</code> / <code>.txt</code>, ou collez depuis Excel.
                        L'aperçu se met à jour tout seul.
                    </p>
                </div>
                <div class="abs-csv-preview" id="abs-csv-preview" hidden></div>
                <div class="flex gap-2 mt-2">
                    <button class="btn btn-secondary btn-sm" id="btn-preview-abs-csv">👁 Aperçu</button>
                    <button class="btn btn-primary btn-sm" id="btn-import-abs-csv">Importer le CSV</button>
                    <button class="btn btn-danger btn-sm" id="btn-clear-abs">Tout supprimer</button>
                    <button class="btn btn-ghost btn-sm" id="btn-repair-abs-encoding" title="Corrige les noms corrompus (caractères accentués cassés) dans la base">🔧 Réparer l'encodage</button>
                </div>
            </div>
        </div>`;
}

/** Câblage des Absences : saisie, filtre, aperçu et import CSV. */
export function wireAbsencesSection(container, ctx) {
    const { members, piInfo } = ctx;
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
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelectorAll('.btn-del-abs').forEach(btn => {
        btn.addEventListener('click', async () => {
            try { await api.deleteAbsence(btn.dataset.id); await ctx.reload(); } catch (e) { toast(e.message, 'error'); }
        });
    });

    // Filtre live sur la liste des absences
    const absFilterInput  = container.querySelector('#abs-filter');
    const absFilterCount  = container.querySelector('#abs-filter-count');
    const _absFilterRows  = () => {
        const q = absFilterInput?.value.trim().toLowerCase() || '';
        let visible = 0;
        container.querySelectorAll('#abs-tbody .abs-row').forEach(row => {
            const match = !q || row.dataset.search.includes(q);
            row.style.display = match ? '' : 'none';
            if (match) visible++;
        });
        if (absFilterCount) absFilterCount.textContent = q ? `${visible} résultat${visible > 1 ? 's' : ''}` : '';
    };
    absFilterInput?.addEventListener('input', _absFilterRows);

    container.querySelector('#btn-repair-abs-encoding')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-repair-abs-encoding');
        btn.disabled = true;
        try {
            const res = await fetch('/api/absences/repair-encoding', { method: 'POST' });
            const data = await res.json();
            toast(`Encodage réparé : ${data.fixed} ligne${data.fixed > 1 ? 's' : ''} corrigée${data.fixed > 1 ? 's' : ''}`, 'success');
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
    });

    /**
     * Ce que l'import a écarté. Sans ce bandeau, un export RH écrivant « CP » ou « RTT »
     * au lieu d'un nombre de jours produisait un import parfaitement silencieux : membres
     * créés, zéro absence, aucun message. L'utilisateur croyait avoir importé.
     */
    const _warnAbsHtml = (parsed) => {
        const w = [];
        if (parsed.ignoredCells) {
            const ex = (parsed.ignoredSamples || []).map(v => `« ${esc(v)} »`).join(', ');
            const d = parsed.ignoredDetails || [];
            // Le compte seul ne permet pas de corriger le fichier : il faut savoir QUELLE
            // ligne, QUI et QUEL jour. Replié par défaut — c'est un détail, pas une alerte.
            const detail = d.length ? `
                <details class="abs-csv-ignored">
                    <summary>Voir les ${d.length === parsed.ignoredCells ? '' : `${d.length} premières sur `}${parsed.ignoredCells} cellules</summary>
                    <table class="abs-csv-ignored-tbl">
                        <thead><tr><th>Ligne</th><th>Personne</th><th>Jour</th><th>Valeur</th></tr></thead>
                        <tbody>${d.map(x => `<tr>
                            <td>${x.ligne}</td><td>${esc(x.nom)}</td>
                            <td>${esc(x.date.split('-').reverse().slice(0, 2).join('/'))}</td>
                            <td><code>${esc(x.valeur)}</code></td>
                        </tr>`).join('')}</tbody>
                    </table>
                </details>` : '';
            w.push(`<strong>${parsed.ignoredCells} ${parsed.ignoredCells > 1 ? 'cellules' : 'cellule'} ${parsed.ignoredCells > 1 ? 'ignorées' : 'ignorée'}</strong>${ex ? ` (${ex})` : ''} — le format attend un nombre de jours : <code>1</code>, <code>0.5</code>. Une cellule contenant un code d'absence n'est pas comptée.${detail}`);
        }
        if (parsed.skippedRows) {
            w.push(`<strong>${parsed.skippedRows} ${parsed.skippedRows > 1 ? 'lignes' : 'ligne'} sans nom</strong> ${parsed.skippedRows > 1 ? 'ignorées' : 'ignorée'}.`);
        }
        return w.length
            ? `<div class="abs-csv-warn">⚠️ ${w.join('<br>')}</div>`
            : '';
    };

    // Parse le CSV courant → { absencesPayload, membersPayload, mode, piStartDate, piEndDate } (partagé Aperçu + Import)
    const _parseAbsCsv = () => {
        const raw = container.querySelector('#abs-csv-input')?.value.trim();
        if (!raw) return null;
        const pipDays = Math.max(0, parseInt(container.querySelector('#abs-csv-pip')?.value) ?? 2);
        // Année des colonnes dd/mm DÉDUITE (3.248.0) : au plus près d'aujourd'hui, +1 au passage décembre → janvier
        const pivot = _parsePivotAbsencesCsv(raw, new Date(), pipDays);
        if (pivot) return {
            absencesPayload: pivot.absences, membersPayload: pivot.members, mode: 'pivot',
            piStartDate: pivot.piStartDate, piEndDate: pivot.piEndDate, dayCount: pivot.dayCount,
            pipDates: pivot.pipDates,
            ignoredCells: pivot.ignoredCells, ignoredSamples: pivot.ignoredSamples,
            ignoredDetails: pivot.ignoredDetails, skippedRows: pivot.skippedRows,
        };
        // Fallback ligne (split ; ou tab — jamais virgule) — pas de dates PI déductibles
        const absencesPayload = [];
        for (const line of raw.split('\n').filter(l => l.trim())) {
            const cols = line.split(/[;\t]/).map(c => c.trim());
            if (!cols[0] || !cols[2]) continue;
            absencesPayload.push({
                memberName: cols[0], team: cols[1] || '',
                startDate: cols[2] || '', endDate: cols[3] || cols[2] || '',
                type: cols[4] || 'conge', days: parseFloat((cols[5] || '').replace(',', '.')) || 1,
            });
        }
        return { absencesPayload, membersPayload: [], mode: 'ligne', piStartDate: null, piEndDate: null };
    };

    // Aperçu partiel : montre les 1ères lignes parsées pour valider avant import.
    // Extrait en fonction (3.147.0) pour être rejoué au collage et au dépôt de fichier :
    // une erreur de format doit se voir AVANT de cliquer « Importer », pas après.
    const _renderAbsPreview = () => {
        const box = container.querySelector('#abs-csv-preview');
        const parsed = _parseAbsCsv();
        if (!parsed || !parsed.absencesPayload.length) {
            if (!box) return;
            box.hidden = false;
            // « Aucune donnée valide détectée » recouvrait quatre causes distinctes et
            // n'en nommait aucune. `diagnosePivotCsv` dit laquelle, et quoi faire.
            const raw = container.querySelector('#abs-csv-input')?.value || '';
            const diag = raw.trim() ? diagnosePivotCsv(raw) : null;
            // Séparateur virgule : plutôt que de renvoyer l'utilisateur vers Excel, on
            // propose la conversion sur place — elle préserve les virgules des noms.
            const peutConvertir = !!convertCommasToSemicolons(raw);
            box.innerHTML = diag
                ? `<div class="abs-csv-diag">
                       <strong class="text-danger">${esc(diag.titre)}</strong>
                       <span class="text-xs text-muted">${esc(diag.indice)}</span>
                       ${peutConvertir ? `<button type="button" class="btn btn-sm btn-secondary abs-csv-fix" id="abs-csv-fix-sep">↔ Convertir les virgules en point-virgules</button>` : ''}
                   </div>`
                : '<span class="text-danger text-xs">Aucune donnée valide détectée.</span>';
            box.querySelector('#abs-csv-fix-sep')?.addEventListener('click', () => {
                const conv = convertCommasToSemicolons(container.querySelector('#abs-csv-input').value);
                if (!conv) return;
                container.querySelector('#abs-csv-input').value = conv;
                _renderAbsPreview();
                toast('Séparateurs convertis — vérifiez l\'aperçu', 'success');
            });
            return;
        }
        const { absencesPayload, membersPayload, mode, piStartDate, piEndDate, dayCount, pipDates } = parsed;
        const pi = container.querySelector('#abs-csv-pi')?.value || '?';
        const teams = [...new Set(absencesPayload.map(p => p.team).filter(Boolean))];
        const membersForPi = membersPayload.length ? membersPayload : [...new Map(absencesPayload.filter(a => a.memberName && a.team).map(a => [`${a.memberName}|${a.team}`, { name: a.memberName, team: a.team }])).values()];
        const previewMembers = membersForPi.slice(0, 8);
        const _fmtFr = iso => { if (!iso) return '?'; const [y,m,d] = iso.split('-'); const mn = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc']; return `${parseInt(d)} ${mn[parseInt(m)-1]} ${y}`; };
        const _fmtShort = iso => { if (!iso) return '?'; const [,m,d] = iso.split('-'); return `${parseInt(d)}/${m}`; };
        const pipNote = (pipDates && pipDates.length)
            ? ` <span class="text-muted">· PIP exclu : ${pipDates.map(_fmtShort).join(', ')}</span>`
            : '';
        const datesBlock = (piStartDate && piEndDate)
            ? `<div class="abs-csv-preview-dates">📅 Dates PI déduites : <strong>${_fmtFr(piStartDate)}</strong> → <strong>${_fmtFr(piEndDate)}</strong> <span class="text-muted">(${dayCount} jours ouvrés)</span>${pipNote}${
                piStartDate.slice(0, 4) !== (pipDates?.at(-1) || piEndDate).slice(0, 4)
                    ? ` <span class="abs-csv-years" title="Années déduites des colonnes : l'année avance au passage décembre → janvier">🗓 à cheval sur ${piStartDate.slice(0, 4)} → ${(pipDates?.at(-1) || piEndDate).slice(0, 4)}</span>` : ''}</div>`
            : '';
        if (box) {
            box.hidden = false;
            box.innerHTML = `
                <div class="abs-csv-preview-hdr">
                    <span class="abs-csv-preview-badge">Format ${mode}</span>
                    <span>${absencesPayload.length} ${absencesPayload.length > 1 ? 'absences' : 'absence'} · ${membersForPi.length} ${membersForPi.length > 1 ? 'membres' : 'membre'} → snapshot <strong>PI ${esc(pi)}</strong></span>
                </div>
                ${datesBlock}
                <div class="abs-csv-preview-teams">${teams.slice(0, 10).map(t => `<span class="abs-csv-preview-team">${esc(t)}</span>`).join('')}${teams.length > 10 ? `<span class="text-muted text-xs">+${teams.length - 10}</span>` : ''}</div>
                ${_warnAbsHtml(parsed)}
                <div class="abs-csv-preview-members">
                    ${previewMembers.map(m => `<span class="abs-csv-preview-member">${esc(m.name)} <em>${esc(m.team || '')}</em></span>`).join('')}
                    ${membersForPi.length > 8 ? `<span class="text-muted text-xs">… +${membersForPi.length - 8} autres</span>` : ''}
                </div>`;
        }
    };

    // Trois chemins mènent à l'aperçu — un seul rendu, pour qu'ils ne divergent jamais.
    container.querySelector('#btn-preview-abs-csv')?.addEventListener('click', _renderAbsPreview);
    const _absInput = container.querySelector('#abs-csv-input');
    // Le collage est LE geste normal ici : l'aperçu doit suivre sans qu'on le demande.
    // `setTimeout(0)` : au moment de l'événement `paste`, la valeur du champ est encore
    // l'ancienne — le texte n'y est inséré qu'après.
    _absInput?.addEventListener('paste', () => setTimeout(_renderAbsPreview, 0));
    _absInput?.addEventListener('input', () => {
        clearTimeout(_absInput._t);
        _absInput._t = setTimeout(_renderAbsPreview, 400);   // frappe manuelle : on laisse finir
    });

    // ── Dépôt de fichier ─────────────────────────────────────────────────────
    // Passer par Excel pour copier-coller est une étape de trop quand le fichier est déjà
    // là. Lecture en texte seulement : pas de dépendance, donc pas de .xlsx (le CLAUDE.md
    // racine interdit toute dépendance npm côté frontend).
    const _absDrop = container.querySelector('#abs-csv-drop');
    if (_absDrop && _absInput) {
        const stop = e => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover'].forEach(ev => _absDrop.addEventListener(ev, e => {
            stop(e); _absDrop.classList.add('is-dragover');
        }));
        ['dragleave', 'drop'].forEach(ev => _absDrop.addEventListener(ev, e => {
            stop(e); _absDrop.classList.remove('is-dragover');
        }));
        _absDrop.addEventListener('drop', async e => {
            const f = e.dataTransfer?.files?.[0];
            if (!f) return;
            if (/\.(xlsx|xls)$/i.test(f.name)) {
                toast('Les fichiers Excel ne sont pas lus directement — enregistrez en CSV (point-virgule), ou copiez-collez les cellules.', 'warning', 6000);
                return;
            }
            try {
                _absInput.value = await f.text();
                _renderAbsPreview();
                toast(`« ${f.name} » chargé — vérifiez l'aperçu avant d'importer`, 'success');
            } catch (err) {
                toast(`Lecture impossible : ${err.message}`, 'error');
            }
        });
    }

    container.querySelector('#btn-import-abs-csv')?.addEventListener('click', async () => {
        const parsed = _parseAbsCsv();
        if (!parsed) { toast('Collez des donnees CSV d\'abord', 'warning'); return; }
        const { absencesPayload, membersPayload, mode, piStartDate, piEndDate, pipDates = [] } = parsed;
        if (!absencesPayload.length) {
            toast('Aucune donnée valide dans le CSV (formats supportés : pivot dd/mm ou ligne Nom;Equipe;Debut;Fin;Type;Jours)', 'warning');
            return;
        }
        // PI cible pour le snapshot des membres
        const piTarget = parseInt(container.querySelector('#abs-csv-pi')?.value) || 0;
        // Membres du snapshot : payload pivot si dispo, sinon dérivé des absences (nom+équipe)
        const snapshotMembers = membersPayload.length
            ? membersPayload
            : [...new Map(absencesPayload.filter(a => a.memberName && a.team).map(a => [`${a.memberName}|${a.team}`, { name: a.memberName, team: a.team, role: '', entity: '' }])).values()];

        // Dates du PI déduites de la plage CSV (1er → dernier jour ouvré listé)
        const _fmtFr = iso => { if (!iso) return '?'; const [y,m,d] = iso.split('-'); return `${parseInt(d)}/${m}/${y}`; };
        const sprintDur = piInfo?.sprintDuration || 14;
        // Le 1er jour du PI = 1re colonne date du CSV, TELLE QUELLE. Plus de snap au vendredi :
        // les équipes démarrent le jour que dit le fichier RH, et le décalage rendait la grille
        // rotation incohérente avec les jours réellement travaillés.
        const piStartReal = piStartDate || null;
        // Nombre de sprints = durée totale (jours calendaires) / durée d'un sprint, arrondi.
        const sprintsDeduced = (piStartReal && piEndDate)
            ? Math.max(1, Math.round((new Date(piEndDate + 'T00:00:00') - new Date(piStartReal + 'T00:00:00')) / 86400000 / sprintDur))
            : null;

        const transverseCount = absencesPayload.filter(p => _isTransverseTeam(p.team)).length;
        const teamsDetected = [...new Set(absencesPayload.map(p => p.team).filter(Boolean))];
        const xtraInfo = transverseCount
            ? `\n\n${transverseCount} ${transverseCount > 1 ? 'absences' : 'absence'} sur des équipes transverses (Team X / TRV / …) — enregistrées telles quelles.`
            : '';
        const teamsLine = teamsDetected.length ? `\nÉquipes : ${teamsDetected.slice(0, 8).join(', ')}${teamsDetected.length > 8 ? '…' : ''}` : '';
        const piLine = piTarget ? `\n👥 Snapshot membres → PI ${piTarget} (${snapshotMembers.length} membres)` : '\n⚠ Aucun PI cible — pas de snapshot membres.';
        const datesLine = (piTarget && piStartReal)
            ? `\n📅 Dates PI ${piTarget} : ${_fmtFr(piStartReal)} → ${_fmtFr(piEndDate)}${sprintsDeduced ? ` (~${sprintsDeduced} sprints)` : ''}`
            : '';
        const pipLine = pipDates.length
            ? `\n🗓️ PIP (PI Planning du PI suivant) : ${pipDates.map(_fmtFr).join(', ')}`
            : '';
        // Fenêtre à écraser = TOUT CE QUE LE FICHIER DÉCRIT, pas seulement le PI.
        // ⚠️ Bug corrigé en 3.147.1 : `rangeEnd` valait `piEndDate`, qui exclut par
        // construction les `pipDays` dernières colonnes (le PI Planning du PI suivant).
        // Or les absences de ces jours-là SONT importées. « Écraser » s'arrêtait donc avant
        // elles : une absence PIP d'un import précédent survivait, et comme la déduplication
        // backend porte sur (nom, début, fin), une ancienne entrée 09→09 ne dédoublonnait
        // pas une nouvelle 09→10 consolidée — deux absences pour les mêmes jours.
        // Le fichier fait autorité sur toutes les dates qu'il liste, PIP compris.
        const _payloadDates = absencesPayload
            .flatMap(a => [a.startDate, a.endDate || a.startDate]).filter(Boolean).sort();
        const rangeStart = [piStartReal, _payloadDates[0]].filter(Boolean).sort()[0] || null;
        const rangeEnd = [piEndDate, _payloadDates[_payloadDates.length - 1], ...pipDates]
            .filter(Boolean).sort().pop() || null;
        const overlapCount = (rangeStart && rangeEnd)
            ? (store.get('absences') || []).filter(a => {
                const s = a.startDate || '', e = a.endDate || s;
                return s <= rangeEnd && e >= rangeStart;
            }).length
            : 0;

        const periodLabel = piTarget ? `du PI ${piTarget}` : 'de la période';
        const rangeTxt = (rangeStart && rangeEnd) ? ` (${_fmtFr(rangeStart)} → ${_fmtFr(rangeEnd)})` : '';
        const choices = [{ key: 'append', label: `Ajouter (${absencesPayload.length})`, variant: 'primary' }];
        if (rangeStart && rangeEnd) {
            choices.push({
                key: 'replace',
                label: `Écraser ${periodLabel}${overlapCount ? ` — ${overlapCount} suppr.` : ''}`,
                variant: 'danger',
            });
        }
        const choice = await choiceModal(
            'Importer les absences',
            `Format : ${mode} · ${absencesPayload.length} ${absencesPayload.length > 1 ? 'absences' : 'absence'} à importer.${teamsLine}${piLine}${datesLine}${pipLine}${xtraInfo}\n\n`
            + `• Ajouter : conserve l'existant, ignore les doublons (même nom + jour).\n`
            + `• Écraser ${periodLabel}${rangeTxt} : supprime d'abord les ${overlapCount} ${overlapCount > 1 ? 'absences' : 'absence'} qui CHEVAUCHENT cette période — y compris la part d'un congé qui déborderait avant ou après — puis importe ce que contient le fichier.`,
            choices,
        );
        if (!choice) return;
        const replaceRange = choice === 'replace' ? { start: rangeStart, end: rangeEnd } : null;
        try {
            const res = await api.bulkCreateAbsences(absencesPayload, false, replaceRange);
            let memSync = null;
            if (membersPayload.length) memSync = await api.bulkMergeMembers(membersPayload, false);
            // Enregistre le snapshot des membres pour le PI cible
            if (piTarget && snapshotMembers.length) {
                await api.setPiMembers(piTarget, snapshotMembers);
            }
            // Enregistre les dates déduites dans pi-cfg-<N>. L'import COMPLÈTE, il n'écrase JAMAIS :
            // les valeurs brutes du CSV vont dans `*FromCsv` (elles alimenteront le bouton
            // « Recaler ce PI sur les Congés »), et les clés effectives ne sont remplies que
            // si elles sont absentes — une saisie « Sprint & PI » reste donc intacte, et
            // l'ancrage d'un PI déjà planifié ne bouge pas dans le dos de l'utilisateur.
            if (piTarget && piStartReal) {
                const cfg = loadPiCfg(piTarget) || {};
                const patch = { number: piTarget, startDateFromCsv: piStartReal, sprintDuration: cfg.sprintDuration || sprintDur };
                if (sprintsDeduced) patch.sprintsPerPIFromCsv = sprintsDeduced;
                if (!cfg.startDate) patch.startDate = piStartReal;
                if (!cfg.sprintsPerPI && sprintsDeduced) patch.sprintsPerPI = sprintsDeduced;
                // Jours PIP (PI Planning) qui clôturent ce PI — réutilisables par le PI calendrier
                if (pipDates.length) patch.pipDates = pipDates;
                savePiCfg(piTarget, patch);   // fusion : ne touche pas aux valeurs saisies à la main
            }
            const parts = [`${res.created} ${res.created > 1 ? 'absences' : 'absence'} ${res.created > 1 ? 'ajoutées' : 'ajoutée'}`];
            if (res.updated) parts.push(`${res.updated} ${res.updated > 1 ? 'mises' : 'mise'} à jour`);
            if (res.deleted) parts.push(`${res.deleted} ${res.deleted > 1 ? 'écrasées' : 'écrasée'}`);
            if (res.skipped) parts.push(`${res.skipped} ${res.skipped > 1 ? 'inchangées' : 'inchangée'}`);
            if (memSync) parts.push(`${memSync.created || 0} créés, ${memSync.updated || 0} maj`);
            if (piTarget) parts.push(`snapshot PI ${piTarget}`);
            if (piTarget && piStartReal) parts.push(`dates PI`);
            toast(parts.join(' · '), 'success');
            // Chevauchements : une absence importée recouvre partiellement une absence
            // existante de la même personne. Les deux coexistent, donc les jours communs
            // sont comptés DEUX FOIS dans la capacité. Second toast, en `warning` : noyé
            // dans la ligne de succès, l'information passerait pour un détail.
            if (res.overlaps?.length) {
                const ex = res.overlaps.slice(0, 3)
                    .map(o => `${o.memberName} (${o.existant} ↔ ${o.importe})`).join(', ');
                const reste = res.overlaps.length > 3 ? ` +${res.overlaps.length - 3}` : '';
                toast(`⚠️ ${res.overlaps.length} ${res.overlaps.length > 1 ? 'chevauchements' : 'chevauchement'} : ${ex}${reste}. Ces jours sont comptés deux fois — relancez avec « Écraser la période » pour repartir propre.`,
                    'warning', 9000);
            }
            await ctx.reload();
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelector('#btn-clear-abs')?.addEventListener('click', async () => {
        if (!(await confirmDanger('Supprimer toutes les absences', 'Supprimer toutes les absences ?', { confirmLabel: 'Supprimer' }))) return;
        try { await api.bulkCreateAbsences([], true); await ctx.reload(); toast('Absences supprimees', 'info'); } catch (e) { toast(e.message, 'error'); }
    });
}
