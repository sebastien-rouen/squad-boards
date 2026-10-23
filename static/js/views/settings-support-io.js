/**
 * Paramètres → Rotation Support : import / export en masse de la rotation du PI affiché
 * (format « Equipe;Semaine;Membres », cf. commentaire du câblage).
 */

import { supportWorkingDays, teamNameMatches, supportDaysForMember, esc, ioTabModal, confirmDanger, getSupportWeekMode, toast } from '../utils.js';
import { _rotBuildPiWeeks, _rotRefreshPanels } from './settings-rotation.js';
import { store } from '../state.js';
import * as api from '../api.js';

const _norm = s => (s || '').toLowerCase().trim();

/** Câblage de la modale d'import / export de la rotation. */
export function wireSupportIo(container, ctx) {
    const { rotTeamNames, rotMembers } = ctx;
    // ── Import / Export en masse (rotation complète du PI sélectionné) ─────────
    // Format : "Equipe;Semaine;Membres" — une ligne par équipe × semaine, membres séparés par `|`.
    // "Semaine" = date de début de semaine (AAAA-MM-JJ), pas le n° de sprint : chaque équipe peut
    // démarrer sa semaine un jour différent (lundi, mercredi, vendredi, …), donc un même label de
    // sprint ("30.2.1") correspond à des dates différentes selon l'équipe — la date exacte est le
    // seul identifiant fiable. Un membre suivi de `:Lu,Ma,…` ne couvre que ces jours (mêmes
    // abréviations que le sélecteur de jours Lun→Ven de la grille) ; sans suffixe = semaine pleine
    // (5/5, comportement par défaut de `supportDaysForMember`). L'écrasement ne touche que les
    // équipes présentes dans le texte collé.
    const _IO_DOW_LABEL = { 1: 'Lu', 2: 'Ma', 3: 'Me', 4: 'Je', 5: 'Ve' };
    const _IO_LABEL_DOW  = { lu: 1, ma: 2, me: 3, je: 4, ve: 5 };
    const _ioDowOfIso = iso => new Date(iso + 'T00:00:00').getDay();
    const _ioFmtDate  = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    // Accepte AAAA-MM-JJ (format export) ou JJ/MM/AAAA saisi à la main → normalise en ISO, ou null.
    const _ioParseDate = (raw) => {
        const s = (raw || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (!m) return null;
        const [, d, mo, yRaw] = m;
        const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    };

    // Encode un membre + ses jours (indices 0-4 issus de supportDaysForMember) en jeton texte.
    const _supIoEncodeMember = (weekStart, name, dayIdx) => {
        if (dayIdx.length >= 5) return name;
        const wd = supportWorkingDays(weekStart);
        const labels = [...dayIdx].sort((a, b) => a - b)
            .map(i => _IO_DOW_LABEL[_ioDowOfIso(wd[i]?.iso || '')]).filter(Boolean);
        return labels.length ? `${name}:${labels.join(',')}` : name;
    };

    const _supIoBuildExportText = () => {
        const lines = ['Equipe;Semaine;Membres'];
        for (const team of rotTeamNames) {
            const { selectedWeeks } = _rotBuildPiWeeks(team);
            for (const w of selectedWeeks) {
                const entry = (store.get('support') || []).find(s => teamNameMatches(s.team, team) && s.weekStart === w.weekStart);
                const members = entry?.members || [];
                const tokens = members.map(m => _supIoEncodeMember(w.weekStart, m, supportDaysForMember(entry, m)));
                lines.push(`${team};${w.weekStart};${tokens.join('|')}`);
            }
        }
        return lines.join('\n');
    };

    // Distance de Levenshtein (accents ignorés) — sert uniquement à proposer des corrections.
    const _ioNormAccents = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const _levenshtein = (a, b) => {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
        return dp[m][n];
    };
    // Propose jusqu'à 3 noms proches (équipe visée en priorité) pour un membre inconnu.
    const _supIoSuggestMembers = (nameRaw, team) => {
        const q = _ioNormAccents(nameRaw);
        const score = rm => {
            const n = _ioNormAccents(rm.name);
            if (n.includes(q) || q.includes(n)) return 0;
            return _levenshtein(q, n);
        };
        const maxDist = Math.max(2, Math.ceil(q.length / 2));
        const pool = [...rotMembers].sort((a, b) => {
            const teamA = teamNameMatches(a.team, team) ? 0 : 1;
            const teamB = teamNameMatches(b.team, team) ? 0 : 1;
            if (teamA !== teamB) return teamA - teamB;
            return score(a) - score(b);
        });
        const seen = new Set();
        return pool
            .filter(rm => { const s = score(rm); if (s > maxDist || seen.has(rm.name)) return false; seen.add(rm.name); return true; })
            .slice(0, 3)
            .map(rm => rm.name);
    };

    // Parse les lignes déjà découpées (mutable, partagé avec la correction par chips) → un statut par
    // ligne : 'ok' (appliquée), 'warning' (ignorée sans bloquer, ex. date hors semaines du PI) ou
    // 'error' (bloque le bouton Écraser tant que non corrigée). Les membres/jours sont TOUJOURS
    // vérifiés, même si la date ne correspond à aucune semaine du PI sélectionné : sinon un simple
    // avertissement de date masquerait silencieusement un vrai nom inconnu sur la même ligne.
    const _supIoParseLines = (lines) => {
        const results = [];
        lines.forEach((line, lineIdx) => {
            if (!line) return;
            if (lineIdx === 0 && /^equipe\s*;\s*semaine\s*;\s*membres/i.test(line)) return; // en-tête
            const lineNo = lineIdx + 1;
            const cols = line.split(';');
            const teamRaw    = (cols[0] || '').trim();
            const dateRaw     = (cols[1] || '').trim();
            const membersRaw = (cols[2] || '').trim();
            if (!teamRaw || !dateRaw) { results.push({ status: 'error', lineIdx, lineNo, message: 'Format invalide (attendu Equipe;Semaine;Membres)' }); return; }
            const team = rotTeamNames.find(t => teamNameMatches(t, teamRaw));
            if (!team) { results.push({ status: 'error', lineIdx, lineNo, message: `Équipe inconnue : "${teamRaw}"` }); return; }
            const weekStartIso = _ioParseDate(dateRaw);
            if (!weekStartIso) { results.push({ status: 'error', lineIdx, lineNo, message: `Date "${dateRaw}" illisible (attendu AAAA-MM-JJ, ex. 2026-07-03)` }); return; }
            const { selectedWeeks, selectedPiNum } = _rotBuildPiWeeks(team);
            const week = selectedWeeks.find(w => w.weekStart === weekStartIso);
            // Index (0-4) → jour DOW réel de la semaine de 7 jours démarrant à cette date (indépendant
            // du fait qu'elle corresponde ou non à une semaine du PI sélectionné).
            const dowToIndex = new Map(supportWorkingDays(weekStartIso).map(d => [_ioDowOfIso(d.iso), d.index]));
            const tokens = membersRaw ? membersRaw.split('|').map(t => t.trim()).filter(Boolean) : [];
            const unresolved = [];
            const badDays = [];
            const members = [];
            const memberDays = {};
            tokens.forEach((tok, tokenIdx) => {
                const [namePart, daysPart] = tok.split(':');
                const nameRaw = (namePart || '').trim();
                if (!nameRaw) return;
                const found = rotMembers.find(rm => _norm(rm.name) === _norm(nameRaw));
                if (!found) { unresolved.push({ tokenIdx, nameRaw, candidates: _supIoSuggestMembers(nameRaw, team) }); return; }
                members.push(found.name);
                if (daysPart) {
                    const idxs = [];
                    for (const ab of daysPart.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)) {
                        const dow = _IO_LABEL_DOW[ab];
                        const idx = dow != null ? dowToIndex.get(dow) : null;
                        if (idx == null) badDays.push(`${nameRaw}:${ab}`); else idxs.push(idx);
                    }
                    const uniq = [...new Set(idxs)].sort((a, b) => a - b);
                    if (uniq.length && uniq.length < 5) memberDays[found.name] = uniq;
                }
            });
            // Erreurs de membres/jours en premier : elles bloquent quoi qu'il arrive, y compris si la
            // date tombe aussi hors PI (sinon le warning ci-dessous les masquerait silencieusement).
            if (unresolved.length) {
                results.push({
                    status: 'error', lineIdx, lineNo,
                    message: `${unresolved.length > 1 ? 'Membres inconnus' : 'Membre inconnu'} : ${unresolved.map(u => u.nameRaw).join(', ')}`,
                    unresolved,
                });
                return;
            }
            if (badDays.length) { results.push({ status: 'error', lineIdx, lineNo, message: `${badDays.length > 1 ? 'Jours invalides' : 'Jour invalide'} (attendu Lu/Ma/Me/Je/Ve) : ${badDays.join(', ')}` }); return; }
            if (!week) {
                // Diagnostic : la semaine valide la plus proche aide à repérer un décalage systématique
                // (mauvais PI, jour/mois inversés, export d'une autre équipe…) plutôt qu'un message muet.
                const dayMs = 86400000;
                const nearest = selectedWeeks.reduce((best, w2) => {
                    const diff = Math.round((new Date(w2.weekStart + 'T00:00:00') - new Date(weekStartIso + 'T00:00:00')) / dayMs);
                    return (best == null || Math.abs(diff) < Math.abs(best.diff)) ? { weekStart: w2.weekStart, diff } : best;
                }, null);
                const hint = nearest
                    ? ` — la plus proche semaine du PI ${selectedPiNum} est ${_ioFmtDate(nearest.weekStart)} (${nearest.diff > 0 ? '+' : ''}${nearest.diff} j)`
                    : ` — aucune semaine connue pour ${team} sur le PI ${selectedPiNum}`;
                results.push({ status: 'warning', lineIdx, lineNo, message: `${_ioFmtDate(weekStartIso)} n'est le début d'aucune semaine du PI ${selectedPiNum} pour ${team}${hint} — ligne ignorée` });
                return;
            }
            results.push({ status: 'ok', lineIdx, lineNo, team, weekStart: week.weekStart, weekEnd: week.weekEnd, members, memberDays });
        });
        return results;
    };

    container.querySelector('#btn-sup-io')?.addEventListener('click', () => {
        const curPiNum = rotTeamNames.length ? _rotBuildPiWeeks(rotTeamNames[0]).selectedPiNum : null;
        const piLabel = curPiNum ?? '?';

        const importHtml = `
            <p class="text-xs text-muted mb-2">PI ciblé : <strong>PI ${esc(piLabel)}</strong> — l'écrasement ne touche que les équipes présentes dans le texte collé.</p>
            <details class="mb-2"><summary class="text-xs">Format attendu</summary>
                <pre class="io-template">Equipe;Semaine;Membres
Fuego;2026-07-03;Alice|Bob:Lu,Ma
Fuego;2026-07-10;Charlie
Fuego;2026-07-17;
Phoenix;2026-06-29;Dave:Me,Je,Ve|Eve</pre>
                <p class="text-xs text-muted" style="margin-top:6px"><strong>Semaine</strong> = date de début (AAAA-MM-JJ, ou JJ/MM/AAAA) — pas le n° de sprint : chaque équipe peut démarrer sa semaine un jour différent (lundi, mercredi, vendredi…), donc utilisez la date exacte plutôt que le libellé du sprint. Membres séparés par <code>|</code>. Un nom seul = semaine pleine (5/5). Ajouter <code>:Lu,Ma,Me,Je,Ve</code> après un nom pour ne l'affecter que sur ces jours (mêmes jours que la grille ci-dessous). Une semaine sans membre (colonne vide, ex. <code>Fuego;2026-07-17;</code>) sera vidée à l'écrasement.</p>
            </details>
            <textarea class="input io-textarea" id="sup-io-input" rows="8" placeholder="Collez le texte ici..."></textarea>
            <div id="sup-io-result" class="io-result" hidden></div>
            <div class="io-actions">
                <button type="button" class="btn btn-secondary btn-sm" id="sup-io-check">Vérifier</button>
                <button type="button" class="btn btn-danger btn-sm" id="sup-io-apply" disabled>⚠ Écraser</button>
            </div>`;
        const exportHtml = `
            <p class="text-xs text-muted mb-2">Rotation complète du PI ${esc(piLabel)} (toutes équipes, semaines vides incluses) — à copier comme sauvegarde ou comme point de départ pour un import.</p>
            <textarea class="input io-textarea" id="sup-io-output" rows="10" readonly>${esc(_supIoBuildExportText())}</textarea>
            <div class="io-actions">
                <button type="button" class="btn btn-secondary btn-sm" id="sup-io-copy">📋 Copier</button>
            </div>`;

        const { overlay, close } = ioTabModal('Import / Export — Rotation Support', { importHtml, exportHtml });
        let validated = null;
        let currentLines = [];   // synchronisé avec le textarea — muté par les chips de correction
        let lastGroups = new Map(); // recalculé à chaque _runCheck — regroupe les occurrences d'un même nom inconnu

        // Remplace le nom inconnu d'un jeton (préserve le suffixe `:Lu,Ma` s'il y en a un) dans
        // `currentLines[lineIdx]`, sans relancer la validation (appelé en boucle par l'auto-fix).
        const _applyFix = (lineIdx, tokenIdx, suggest) => {
            const line = currentLines[lineIdx];
            if (line == null) return;
            const cols = line.split(';');
            const memberTokens = (cols[2] || '').split('|');
            const tok = memberTokens[tokenIdx];
            if (tok == null) return;
            const [, daysPart] = tok.split(':');
            memberTokens[tokenIdx] = daysPart ? `${suggest}:${daysPart}` : suggest;
            cols[2] = memberTokens.join('|');
            currentLines[lineIdx] = cols.join(';');
        };

        // Ré-exécute la validation depuis `currentLines`, remplit le textarea et le panneau résultat.
        const _runCheck = () => {
            const input = overlay.querySelector('#sup-io-input');
            if (input) input.value = currentLines.join('\n');
            const results = _supIoParseLines(currentLines);
            validated = results;
            const errors   = results.filter(r => r.status === 'error');
            const warnings = results.filter(r => r.status === 'warning');
            const valid    = results.filter(r => r.status === 'ok');
            // Erreurs de membre inconnu n'ayant qu'UNE seule suggestion → corrigeables en un clic.
            const singleFixes = errors.flatMap(e => (e.unresolved || [])
                .filter(u => u.candidates.length === 1)
                .map(u => ({ lineIdx: e.lineIdx, tokenIdx: u.tokenIdx, nameRaw: u.nameRaw, suggest: u.candidates[0] })));
            // Regroupe les occurrences d'un même nom inconnu (même normalisation) sur TOUTES les
            // lignes → un seul jeu de chips à traiter au lieu de répéter la correction ligne par ligne.
            const groups = new Map();
            errors.forEach(e => (e.unresolved || []).forEach(u => {
                const key = _norm(u.nameRaw);
                if (!groups.has(key)) groups.set(key, { nameRaw: u.nameRaw, candidates: u.candidates, occ: [] });
                groups.get(key).occ.push({ lineIdx: e.lineIdx, tokenIdx: u.tokenIdx });
            }));
            lastGroups = groups;
            const box = overlay.querySelector('#sup-io-result');
            if (box) {
                box.hidden = false;
                const teamsAffected = [...new Set(valid.map(r => r.team))];
                const _errLine = e => `<li>Ligne ${e.lineNo} : ${esc(e.message)}</li>`;
                const groupedHtml = groups.size ? `
                    <div class="io-group-fixes-title">Corrections groupées (${groups.size} nom${groups.size > 1 ? 's' : ''} distinct${groups.size > 1 ? 's' : ''}) :</div>
                    ${[...groups.entries()].map(([key, g]) => `
                        <div class="io-suggest-chips">
                            <span class="io-suggest-lbl">${esc(g.nameRaw)} <em>(${g.occ.length}×)</em> →</span>
                            ${g.candidates.length
                                ? g.candidates.map(c => `<button type="button" class="io-chip" data-group-key="${esc(key)}" data-suggest="${esc(c)}">${esc(c)}</button>`).join('')
                                : '<span class="text-muted text-xs">aucune suggestion</span>'}
                        </div>`).join('')}` : '';
                box.innerHTML = `
                    ${!results.length ? '<div class="io-result-err">❌ Aucune ligne détectée.</div>' : ''}
                    ${valid.length ? `<div class="io-result-ok">✅ ${valid.length} ligne${valid.length > 1 ? 's' : ''} valide${valid.length > 1 ? 's' : ''} — ${teamsAffected.length} équipe${teamsAffected.length > 1 ? 's' : ''} : ${teamsAffected.map(esc).join(', ')}</div>` : ''}
                    ${warnings.length ? `<div class="io-result-warn">⚠️ ${warnings.length} avertissement${warnings.length > 1 ? 's' : ''} (ligne${warnings.length > 1 ? 's' : ''} ignorée${warnings.length > 1 ? 's' : ''}, n'empêche(nt) pas l'écrasement) :<ul>${warnings.map(w => `<li>Ligne ${w.lineNo} : ${esc(w.message)}</li>`).join('')}</ul></div>` : ''}
                    ${errors.length ? `<div class="io-result-err">❌ ${errors.length} erreur${errors.length > 1 ? 's' : ''} (à corriger avant écrasement) :
                        ${singleFixes.length ? `<button type="button" class="btn btn-primary btn-xs" id="sup-io-autofix" style="margin:4px 0">✨ Accepter ${singleFixes.length} correction${singleFixes.length > 1 ? 's' : ''} unique${singleFixes.length > 1 ? 's' : ''}</button>` : ''}
                        ${groupedHtml}
                        <ul>${errors.map(_errLine).join('')}</ul></div>` : ''}
                `;
            }
            const applyBtn = overlay.querySelector('#sup-io-apply');
            if (applyBtn) {
                const teamsAffected = [...new Set(valid.map(r => r.team))];
                const canApply = errors.length === 0 && valid.length > 0;
                applyBtn.disabled = !canApply;
                applyBtn.textContent = canApply
                    ? `⚠ Écraser ${teamsAffected.length} équipe${teamsAffected.length > 1 ? 's' : ''} — PI ${piLabel}`
                    : '⚠ Écraser';
            }
        };

        overlay.querySelector('#sup-io-check')?.addEventListener('click', () => {
            const raw = overlay.querySelector('#sup-io-input')?.value || '';
            currentLines = raw.split('\n').map(l => l.trim()).filter(Boolean);
            _runCheck();
        });

        // Clic sur "Accepter les corrections uniques" (tout ce qui n'a qu'une seule suggestion
        // possible, toutes occurrences confondues) ou sur une chip groupée (corrige TOUTES les
        // occurrences du même nom inconnu, sur toutes les lignes, en un clic).
        overlay.querySelector('#sup-io-result')?.addEventListener('click', e => {
            if (e.target.closest('#sup-io-autofix')) {
                const errors = (validated || []).filter(r => r.status === 'error');
                errors.flatMap(err => (err.unresolved || []).filter(u => u.candidates.length === 1)
                    .map(u => ({ lineIdx: err.lineIdx, tokenIdx: u.tokenIdx, suggest: u.candidates[0] })))
                    .forEach(fix => _applyFix(fix.lineIdx, fix.tokenIdx, fix.suggest));
                _runCheck();
                return;
            }
            const chip = e.target.closest('.io-chip[data-group-key]');
            if (!chip) return;
            const { groupKey, suggest } = chip.dataset;
            const group = lastGroups.get(groupKey);
            if (group) group.occ.forEach(o => _applyFix(o.lineIdx, o.tokenIdx, suggest));
            _runCheck();
        });

        overlay.querySelector('#sup-io-apply')?.addEventListener('click', async () => {
            const valid = (validated || []).filter(r => r.status === 'ok');
            if (!valid.length) return;
            const teamsAffected = [...new Set(valid.map(r => r.team))];
            const ok = await confirmDanger(
                `Écraser la rotation de ${teamsAffected.length} équipe${teamsAffected.length > 1 ? 's' : ''}`,
                `PI ${piLabel} — équipes concernées : ${teamsAffected.join(', ')}.\nToutes les semaines de ces équipes pour ce PI seront remplacées par le contenu du texte (semaines non mentionnées vidées, anciennes entrées orphelines du PI supprimées).`,
                { confirmLabel: 'Écraser', danger: true },
            );
            if (!ok) return;
            const applyBtn = overlay.querySelector('#sup-io-apply');
            if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '⏳ Application…'; }
            try {
                const currentSupport = store.get('support') || [];
                let created = 0, updated = 0, cleared = 0, deleted = 0;
                for (const team of teamsAffected) {
                    const { selectedWeeks } = _rotBuildPiWeeks(team);
                    if (!selectedWeeks.length) continue;
                    const rangeStart = selectedWeeks[0].weekStart;
                    const rangeEnd   = selectedWeeks[selectedWeeks.length - 1].weekEnd;
                    const byDate = new Map(valid.filter(r => r.team === team).map(r => [r.weekStart, r]));
                    // Toutes les entrées existantes de l'équipe qui tombent dans la fenêtre du PI —
                    // y compris celles qui ne s'alignent plus sur la grille théorique actuelle (ex.
                    // anciennes entrées d'un import précédent avec un mauvais jour de semaine, avant
                    // correction du mode équipe) : un écrasement doit aussi les nettoyer.
                    const teamEntries = currentSupport.filter(s => teamNameMatches(s.team, team) && s.weekStart >= rangeStart && s.weekStart <= rangeEnd);
                    const handledIds = new Set();
                    for (const w of selectedWeeks) {
                        const row = byDate.get(w.weekStart);
                        const members    = row ? row.members : [];
                        const memberDays = row ? row.memberDays : {};
                        const existing = teamEntries.find(s => s.weekStart === w.weekStart);
                        if (existing) handledIds.add(existing.id);
                        if (!members.length) {
                            if (existing && (existing.members || []).length) {
                                await api.updateSupport(existing.id, { members: [], memberDays: {} });
                                cleared++;
                            }
                            continue;
                        }
                        if (existing) {
                            await api.updateSupport(existing.id, { members, memberDays });
                            updated++;
                        } else {
                            const mpw = parseInt(localStorage.getItem(`rot-mpw-${team}`)) || 2;
                            await api.createSupport({ team, weekLabel: w.label, weekStart: w.weekStart, weekEnd: w.weekEnd, members, memberDays, weekMode: getSupportWeekMode(team), membersPerWeek: mpw });
                            created++;
                        }
                    }
                    // Entrées orphelines de la fenêtre du PI (dates ne correspondant plus à aucune
                    // semaine de la grille actuelle) → supprimées pour que l'écrasement soit complet.
                    for (const s of teamEntries) {
                        if (!handledIds.has(s.id) && (s.members || []).length) {
                            await api.deleteSupport(s.id);
                            deleted++;
                        }
                    }
                }
                toast(`Rotation écrasée — ${created} ${created > 1 ? 'créées' : 'créée'}, ${updated} ${updated > 1 ? 'mises' : 'mise'} à jour, ${cleared} ${cleared > 1 ? 'vidées' : 'vidée'}${deleted ? `, ${deleted} ${deleted > 1 ? 'orphelines' : 'orpheline'} ${deleted > 1 ? 'supprimées' : 'supprimée'}` : ''}`, 'success');
                close();
                await _rotRefreshPanels(container);
            } catch (e) { toast(e.message, 'error'); }
            finally { if (applyBtn) applyBtn.disabled = false; }
        });

        overlay.querySelector('#sup-io-copy')?.addEventListener('click', async () => {
            const ta = overlay.querySelector('#sup-io-output');
            try {
                await navigator.clipboard.writeText(ta?.value || '');
                toast('Copié dans le presse-papiers', 'success');
            } catch { ta?.select(); toast('Sélection prête — Ctrl+C pour copier', 'info'); }
        });
    });

}
