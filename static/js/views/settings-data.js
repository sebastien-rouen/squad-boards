/**
 * Paramètres → Données (export, import, purge, démo) et À propos.
 */

import { store } from '../state.js';
import { backupCardHtml } from './settings-backup.js';
import { diagramFrameHtml, exportChoiceModal, toast, arrayToCsv, confirmDanger } from '../utils.js';
import { _exportCategoryCounts, _availableExportCategories, _loadLastExportChoice, EXPORT_FORMATS, _saveLastExportChoice, EXPORT_CATEGORY_KEYS, _downloadBlob, _openImportModal } from './settings-io.js';
import * as api from '../api.js';

/** Section « Données ». */
export function dataSectionHtml(ctx) {
    const { tickets, members, absences } = ctx;
    return `
        <!-- ═══ Data ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle><h3>Données</h3><svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg></div>
            <div class="settings-section-body">
                <div class="data-stats">
                    <div class="data-stat"><span class="data-stat-icon">🎫</span><div class="data-stat-body"><span class="data-stat-val">${tickets.length}</span><span class="data-stat-lbl">Tickets</span></div></div>
                    <div class="data-stat"><span class="data-stat-icon">🧩</span><div class="data-stat-body"><span class="data-stat-val">${(store.get('features') || []).length}</span><span class="data-stat-lbl">Features</span></div></div>
                    <div class="data-stat"><span class="data-stat-icon">👤</span><div class="data-stat-body"><span class="data-stat-val">${members.length}</span><span class="data-stat-lbl">Membres</span></div></div>
                    <div class="data-stat"><span class="data-stat-icon">🏖️</span><div class="data-stat-body"><span class="data-stat-val">${absences.length}</span><span class="data-stat-lbl">Absences</span></div></div>
                </div>

                <div class="data-actions">
                    <button class="btn btn-secondary" id="btn-export"><svg class="icon icon-sm"><use href="#i-download"/></svg> Export</button>
                    <button class="btn btn-secondary" id="btn-import">⬆️ Importer</button>
                    <button class="btn btn-danger" id="btn-clear">🗑️ Tout supprimer</button>
                </div>

                ${backupCardHtml()}

                <hr class="mt-4 mb-4" style="border-color:var(--border)">

                <div class="data-demo-card">
                    <span class="data-demo-icon">🎬</span>
                    <div class="data-demo-body">
                        <p class="data-demo-title">Jeu de données démo</p>
                        <p class="data-demo-desc">Charge un scénario SAFe complet : 4 équipes fictives (Vega, Lyra, Orion, Sirius), PI#5 sprint 3 en cours, 56 tickets, features, epics, objectifs PI, rotations support, absences, compétences Atlas.</p>
                        <span class="data-demo-warn">⚠️ Remplace toutes les données existantes</span>
                    </div>
                    <div class="data-demo-action">
                        <button class="btn btn-primary" id="btn-seed-demo">Charger la démo</button>
                        <span id="seed-demo-status" class="text-xs text-muted" style="display:none"></span>
                    </div>
                </div>
            </div>
        </div>`;
}

/** Section « À propos ». */
export function aboutSectionHtml(ctx) {
    return `
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
                <div class="history-diagrams">
                    <details class="history-diagram" open>
                        <summary>Histoire du projet</summary>
                        <div class="history-diagram-scroll">${diagramFrameHtml('/img/excalidraw/historique-projet.svg', "Timeline de l'histoire du projet Squad Board")}</div>
                    </details>
                    <details class="history-diagram">
                        <summary>Storytelling</summary>
                        <div class="history-diagram-scroll">${diagramFrameHtml('/img/excalidraw/storytelling.svg', 'Storytelling du projet Squad Board')}</div>
                    </details>
                    <details class="history-diagram">
                        <summary>User Story Mapping</summary>
                        <div class="history-diagram-scroll">${diagramFrameHtml('/img/excalidraw/user-story-map.svg', 'User Story Mapping du projet Squad Board')}</div>
                    </details>
                </div>
            </div>`;
}

/** Câblage des Données : export, import, purge, jeu de démo. */
export function wireDataSection(container, ctx) {
    const { tickets, members, absences } = ctx;
    // ── Data ──────────────────────────────────────────────────────────────────
    container.querySelector('#btn-export')?.addEventListener('click', async () => {
        const counts = _exportCategoryCounts();
        const categories = _availableExportCategories().map(c => ({ ...c, count: counts[c.key] }));
        const last = _loadLastExportChoice();
        const picked = await exportChoiceModal('Que voulez-vous exporter ?', categories, {
            message: 'Tout est présélectionné — cliquez pour désélectionner ce que vous ne voulez pas inclure.',
            formats: EXPORT_FORMATS,
            initialSelected: last?.keys || null,
            initialFormat: last?.format || null,
        });
        if (!picked) return; // annulé
        const { keys: pickedKeys, format } = picked;
        if (!pickedKeys.length) { toast('Aucune donnée sélectionnée', 'info'); return; }
        _saveLastExportChoice(pickedKeys, format);
        const keys = [...new Set(pickedKeys.flatMap(k => EXPORT_CATEGORY_KEYS[k] || [k]))];
        const day = new Date().toISOString().slice(0, 10);
        try {
            if (format === 'zip') {
                // Bundle CSV par catégorie dans un .zip généré côté backend (zipfile stdlib) —
                // évite les téléchargements multiples en rafale du mode CSV à plat ci-dessous.
                const blob = await api.exportZip(keys, 'csv');
                _downloadBlob(blob, 'application/zip', `squad-board-${day}.zip`);
            } else if (format === 'csv') {
                // Pas de structure tabulaire unique commune à toutes les catégories → un CSV par
                // catégorie (les champs imbriqués — labels, comments... — sont sérialisés en JSON
                // dans leur cellule plutôt que d'exploser en colonnes). Avec 2+ catégories, préférer
                // le format ZIP ci-dessus (un seul fichier, pas de rafale de téléchargements).
                const data = await api.exportAll();
                let i = 0;
                for (const k of keys) {
                    const rows = Array.isArray(data[k]) ? data[k] : [];
                    if (!rows.length) continue;
                    const csv = arrayToCsv(rows);
                    setTimeout(() => _downloadBlob(csv, 'text/csv;charset=utf-8', `squad-board-${k}-${day}.csv`), i * 150);
                    i++;
                }
                if (!i) { toast('Aucune ligne à exporter pour cette sélection', 'info'); return; }
            } else {
                const data = await api.exportAll();
                const out = { exportedAt: data.exportedAt };
                for (const k of keys) out[k] = data[k];
                _downloadBlob(JSON.stringify(out, null, 2), 'application/json', `squad-board-${day}.json`);
            }
            toast('Exporte', 'success');
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelector('#btn-import')?.addEventListener('click', () => _openImportModal(container, ctx.reload));

    container.querySelector('#btn-clear')?.addEventListener('click', async () => {
        if (!(await confirmDanger('Supprimer toutes les données', 'Tout supprimer ? Irréversible.', { confirmLabel: 'Supprimer' }))) return;
        try {
            await api.importAll({ tickets: [], features: [], epics: [], members: [], teams: [], groups: [], absences: [], support: [], sprint: [], pi: [] }, 'replace');
            await ctx.reload();
            toast('Données supprimées', 'info');
        } catch (e) { toast(e.message, 'error'); }
    });

    container.querySelector('#btn-seed-demo')?.addEventListener('click', async () => {
        if (!(await confirmDanger('Charger la démo', 'Charger la démo complète ? Toutes les données actuelles seront remplacées.', { confirmLabel: 'Charger', danger: false }))) return;
        const btn    = container.querySelector('#btn-seed-demo');
        const status = container.querySelector('#seed-demo-status');
        btn.disabled = true;
        status.style.display = '';
        try {
            const { seedFullDemoData } = await import('../demo.js');
            await seedFullDemoData((msg) => { status.textContent = msg; });
            await ctx.reload();
            toast('Démo chargée avec succès !', 'success', 4000);
        } catch (e) {
            toast(`Erreur : ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
            status.style.display = 'none';
        }
    });
}
