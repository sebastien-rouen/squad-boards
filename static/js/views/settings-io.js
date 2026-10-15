/**
 * Import / export de données — catégories exportables, écriture de fichier, lecture CSV/ZIP
 * et modale d'import. Extrait de settings.js (v3.141.7) : logique pure, sans dépendance vers
 * le reste de la vue Paramètres.
 *
 * `_openImportModal(container, onImported)` reçoit son rafraîchissement par INJECTION —
 * importer `reloadAndRender` depuis settings.js créerait un cycle d'imports.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, arrayToCsv, confirmDanger } from '../utils.js';
import { loadReminders } from '../reminders.js';
import { csvTextToRows } from './settings-io-csv.js';   // parser pur et testé (multi-lignes, "" ≠ vide)

// ── Export (modale à choix multiples) ─────────────────────────────────────────
// `key` mappe vers 1+ clés de la réponse /api/export (cf. _EXPORT_SPEC côté backend,
// app/routers/data.py). Plusieurs clés d'export sont regroupées sous une seule tuile
// (Atlas, Sprint & PI) pour rester lisible dans la grille.
const EXPORT_CATEGORIES = [
    { key: 'tickets',  label: 'Tickets',      icon: '🎫' },
    { key: 'features', label: 'Features',     icon: '🧩' },
    { key: 'epics',    label: 'Epics',        icon: '🏔️' },
    { key: 'members',  label: 'Membres',      icon: '👤' },
    { key: 'teams',    label: 'Équipes',      icon: '👥' },
    { key: 'groups',   label: 'Groupes',      icon: '🗂️' },
    { key: 'absences', label: 'Absences',     icon: '🏖️' },
    { key: 'support',  label: 'Support',      icon: '🛟' },
    { key: 'events',   label: 'Évènements',   icon: '📅' },
    { key: 'votes',    label: 'Mood & Fist Five', icon: '😊' },
    { key: 'retroItems', label: 'Rétro (actions)', icon: '🔁' },
    { key: 'atlas',    label: 'Atlas (compétences)', icon: '🧭' },
    { key: 'config',   label: 'Sprint & PI',  icon: '⚙️' },
    { key: 'team',     label: 'Équipe (fiches & ateliers)', icon: '🪪' },
    { key: 'calendars', label: 'Calendriers', icon: '🗓️' },
];
const EXPORT_CATEGORY_KEYS = {
    atlas:  ['skills', 'appetences', 'memberSkills', 'memberAppetences', 'mobility'],
    config: ['sprint', 'pi'],
    team:   ['teamIdentities', 'workshopTemplates', 'teamWorkshops'],
    votes:  ['moodVotes', 'fistVotes', 'confidenceVotes'],
};
const EXPORT_FORMATS = [
    { key: 'json', label: 'JSON' },
    { key: 'csv',  label: 'CSV' },
    { key: 'zip',  label: 'ZIP' },
];
const _LS_EXPORT_LAST = 'sb-export-last';

/** Catégories d'export visibles : « Calendriers » seulement si des calendriers ICS existent. */
function _availableExportCategories() {
    const hasCalendars = (store.get('calendars') || []).length > 0;
    return EXPORT_CATEGORIES.filter(c => c.key !== 'calendars' || hasCalendars);
}

/** Nombre d'éléments par catégorie — affiché en badge sur chaque tuile de la modale. */
function _exportCategoryCounts() {
    const len = key => (store.get(key) || []).length;
    return {
        tickets:  len('tickets'),
        features: len('features'),
        epics:    len('epics'),
        members:  len('members'),
        teams:    (store.get('teamObjects') || store.get('teams') || []).length,
        groups:   len('groups'),
        absences: len('absences'),
        support:  len('support'),
        events:   len('events'),
        atlas:    len('skills') + len('appetences') + len('memberSkills') + len('memberAppetences') + len('mobility'),
        team:     len('teamIdentities') + len('workshopTemplates') + len('teamWorkshops'),
        votes:    len('moodVotes') + len('fistVotes') + len('confidenceVotes'),
        retroItems: len('retroItems'),
        calendars: len('calendars'),
        // 'config' (sprint & PI) n'est pas une liste — pas de badge pertinent.
    };
}

/** Dernier choix d'export (sélection + format), persisté pour pré-cocher la modale au prochain usage. */
function _loadLastExportChoice() {
    try { return JSON.parse(localStorage.getItem(_LS_EXPORT_LAST) || 'null'); }
    catch { return null; }
}
function _saveLastExportChoice(keys, format) {
    localStorage.setItem(_LS_EXPORT_LAST, JSON.stringify({ keys, format }));
}

// ── Import (modale guidée : format, modèle, prévisualisation) ─────────────────
// Toutes les catégories d'export sont désormais ré-importables. Pour « Calendriers »,
// l'import recrée le lien ICS (url/nom/équipe) ; les events sont re-fetchés depuis l'URL.
const IMPORT_CATEGORIES = EXPORT_CATEGORIES;
const IMPORT_ALL_RAW_KEYS = new Set(IMPORT_CATEGORIES.flatMap(c => EXPORT_CATEGORY_KEYS[c.key] || [c.key]));

/** Modèle JSON vide (toutes les clés reconnues, en tableaux vides) — pour montrer le format attendu. */
function _emptyImportTemplate() {
    const out = {};
    for (const k of IMPORT_ALL_RAW_KEYS) out[k] = [];
    return out;
}

/** Nombre d'éléments détectés pour une catégorie dans un fichier importé, ou `null` si absente du fichier. */
function _importCategoryCount(data, category) {
    const keys = EXPORT_CATEGORY_KEYS[category.key] || [category.key];
    let total = null;
    for (const k of keys) {
        if (!(k in data)) continue;
        const v = data[k];
        if (Array.isArray(v)) total = (total || 0) + v.length;
        else if (v != null) total = (total || 0) + 1; // sprint/pi : objet présent
    }
    return total;
}

function _downloadBlob(content, mime, filename) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click(); URL.revokeObjectURL(a.href);
}

/** Déduit la catégorie depuis le nom de fichier `squad-board-<categorie>-AAAA-MM-JJ.csv` (export). */
function _categoryKeyFromFilename(name) {
    const m = name.match(/^squad-board-(.+?)-\d{4}-\d{2}-\d{2}\.\w+$/i);
    return m ? m[1] : name.replace(/\.\w+$/, '');
}

async function _parseCsvFile(file) {
    const rows = csvTextToRows(await file.text());
    return { [_categoryKeyFromFilename(file.name)]: rows };
}

/**
 * Décompresse un .zip généré par `/api/export/zip` (un fichier .json ou .csv par catégorie)
 * entièrement côté navigateur — lecture manuelle du format ZIP (en-têtes locaux + central
 * directory) + `DecompressionStream('deflate-raw')` natif pour l'inflate. Pas de librairie
 * tierce (interdit côté front) : on ne supporte que le sous-ensemble produit par notre propre
 * export (pas de zip64, pas de chiffrement, pas de data descriptor — tailles connues à l'écriture).
 */
async function _parseZipFile(file) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('Ce navigateur ne sait pas décompresser un .zip ici — dézippez-le et importez les fichiers .json/.csv individuellement.');
    }
    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    const EOCD_SIG = 0x06054b50;
    const maxBack = Math.min(bytes.length, 65557);
    let eocdOffset = -1;
    for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
        if (view.getUint32(i, true) === EOCD_SIG) { eocdOffset = i; break; }
    }
    if (eocdOffset < 0) throw new Error('Archive ZIP invalide (fin de répertoire central introuvable).');

    const entryCount = view.getUint16(eocdOffset + 10, true);
    let offset = view.getUint32(eocdOffset + 16, true); // début du central directory
    const CD_SIG = 0x02014b50;
    const decoder = new TextDecoder('utf-8');
    const out = {};

    for (let i = 0; i < entryCount; i++) {
        if (view.getUint32(offset, true) !== CD_SIG) throw new Error('Archive ZIP invalide (en-tête central).');
        const method = view.getUint16(offset + 10, true);
        const compSize = view.getUint32(offset + 20, true);
        const nameLen = view.getUint16(offset + 28, true);
        const extraLen = view.getUint16(offset + 30, true);
        const commentLen = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

        if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Archive ZIP invalide (entrée "${name}").`);
        const lhNameLen = view.getUint16(localOffset + 26, true);
        const lhExtraLen = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
        const compData = bytes.subarray(dataStart, dataStart + compSize);

        let raw;
        if (method === 0) raw = compData; // stocké, non compressé
        else if (method === 8) {
            const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            raw = new Uint8Array(await new Response(stream).arrayBuffer());
        } else {
            throw new Error(`Méthode de compression non supportée pour "${name}".`);
        }

        const text = decoder.decode(raw);
        const ext = name.split('.').pop().toLowerCase();
        const key = name.replace(/\.\w+$/, '');
        if (ext === 'json') out[key] = JSON.parse(text);
        else if (ext === 'csv') out[key] = csvTextToRows(text);

        offset += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}

// ── Test d'import (`?dry_run=1`) ─────────────────────────────────────────────
/** Chute jugée suspecte en mode Remplacer : moins de la moitié des lignes en base (≥ 10). */
const _IMPORT_DROP_RATIO = 0.5;
const _fmtN = n => Number(n || 0).toLocaleString('fr-FR');

/** Libellé d'une clé brute (`tickets`, `fistVotes`…) via sa catégorie d'export. */
function _rawKeyLabel(key) {
    const c = IMPORT_CATEGORIES.find(x => (EXPORT_CATEGORY_KEYS[x.key] || [x.key]).includes(key));
    if (!c) return key;
    return (EXPORT_CATEGORY_KEYS[c.key] || [c.key]).length > 1 ? `${c.icon} ${c.label} · ${key}` : `${c.icon} ${c.label}`;
}

/** Collections dont le remplacement ferait chuter le nombre de lignes de plus de moitié. */
function _importDrops(res) {
    return Object.entries(res?.counts || {})
        .filter(([k, n]) => (res.current?.[k] ?? 0) >= 10 && n < res.current[k] * _IMPORT_DROP_RATIO)
        .map(([k, n]) => ({ key: k, from: res.current[k], to: n }));
}

/** Résultat du test : tableau en base → après, chutes signalées. Rien n'a été écrit. */
function _importTestHtml(res, mode) {
    const keys = Object.keys(res?.counts || {});
    const drops = mode === 'replace' ? _importDrops(res) : [];
    const dropKeys = new Set(drops.map(d => d.key));
    const rows = keys.map(k => {
        const cur = res.current?.[k], n = res.counts[k];
        const after = mode === 'replace'
            ? `${_fmtN(n)}${cur ? ` <span class="import-test-delta">(${n >= cur ? '+' : '−'}${Math.round(Math.abs(n - cur) / cur * 100)} %)</span>` : ''}`
            : '<span class="import-test-muted">fusion</span>';
        return `<tr${dropKeys.has(k) ? ' class="is-drop"' : ''}><td>${esc(_rawKeyLabel(k))}</td>
            <td class="num">${cur == null ? '—' : _fmtN(cur)}</td><td class="num">${_fmtN(n)}</td><td class="num">${after}</td></tr>`;
    }).join('');
    return `
        <div class="import-test-ok">✅ Test réussi : l'import passerait (contraintes de la base vérifiées). Rien n'a été écrit.</div>
        ${drops.length ? `<div class="import-preview-warn import-preview-warn--danger">⚠️ Remplacer ferait chuter ${drops.length > 1 ? 'ces collections' : 'cette collection'} de plus de moitié :
            ${drops.map(d => `<strong>${esc(_rawKeyLabel(d.key))}</strong> ${_fmtN(d.from)} → ${_fmtN(d.to)}`).join(', ')}. Vérifiez le fichier avant d'importer.</div>` : ''}
        ${rows ? `<table class="import-test-table">
            <thead><tr><th>Collection</th><th class="num">En base</th><th class="num">Fichier</th><th class="num">Après import</th></tr></thead>
            <tbody>${rows}</tbody></table>` : ''}`;
}

/** Message de confirmation du mode Remplacer (texte brut : confirmDanger échappe). */
function _replaceConfirmMessage(data, res) {
    if (res?.counts) {
        const lines = Object.entries(res.counts).map(([k, n]) => `• ${_rawKeyLabel(k)} : ${_fmtN(res.current?.[k])} → ${_fmtN(n)}`);
        const drops = _importDrops(res);
        return `${drops.length ? '⚠️ Chute de plus de moitié sur : ' + drops.map(d => _rawKeyLabel(d.key)).join(', ') + '.\n\n' : ''}`
            + `Les données en base de ces collections seront supprimées puis remplacées par le fichier :\n${lines.join('\n')}`;
    }
    const cats = IMPORT_CATEGORIES.filter(c => _importCategoryCount(data, c) != null).map(c => c.label);
    return `Les données en base de ces catégories seront supprimées puis remplacées par le fichier : ${cats.join(', ')}.\n\n`
        + `Astuce : « 🔍 Tester l'import » compare d'abord le fichier à la base, sans rien écrire.`;
}

/**
 * Modale d'import guidée : explique le format attendu, propose un modèle vide à télécharger,
 * accepte .json / .csv / .zip (clic ou glisser-déposer, comme produits par l'Export), prévisualise
 * le contenu (catégories reconnues + compteurs, clés ignorées) et choisit le mode avant import.
 */
function _openImportModal(container, onImported = null) {
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay';
    ov.innerHTML = `
        <div class="confirm-modal confirm-modal--export" role="dialog" aria-modal="true" aria-label="Importer des données">
            <div class="confirm-body">
                <div class="confirm-title">Importer des données</div>
                <div class="confirm-message">
                    Fichier(s) <code>.json</code>, <code>.csv</code> ou <code>.zip</code> — ceux générés par le bouton <strong>Export</strong> ci-dessus
                    (mêmes clés/catégories : ${IMPORT_CATEGORIES.map(c => esc(c.label)).join(', ')}).
                    Pas sûr du format ? <button type="button" class="link-btn" id="import-dl-template">📥 Télécharger un modèle JSON vide</button>
                </div>
                <div class="import-dropzone" id="import-dropzone" role="button" tabindex="0">
                    <span class="import-dropzone-icon">📂</span>
                    <span class="import-dropzone-text">Cliquer pour choisir un ou plusieurs fichiers, ou glisser-déposer ici</span>
                    <span class="import-dropzone-hint">.json (1 fichier) · .csv (1 par catégorie, plusieurs à la fois) · .zip (1 fichier, dézippé ici)</span>
                </div>
                <input type="file" accept=".json,.csv,.zip,application/json,text/csv,application/zip" id="import-file-input" multiple style="display:none;">
                <div id="import-preview"></div>
                <div id="import-test" aria-live="polite"></div>
            </div>
            <div class="confirm-actions">
                <button class="btn btn-ghost btn-sm" data-act="cancel">Annuler</button>
                <button class="btn btn-secondary btn-sm" data-act="test" id="import-test-btn" disabled
                        title="Import complet côté serveur puis annulation : rien n'est écrit">🔍 Tester l'import</button>
                <button class="btn btn-primary btn-sm" data-act="ok" id="import-confirm-btn" disabled>Importer</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('visible'));

    let parsedData = null;
    let mode = 'replace';
    // Dernier test (`?dry_run=1`) : jeté à chaque nouveau fichier ou changement de mode.
    let testResult = null;

    const close = () => {
        ov.classList.remove('visible');
        ov.addEventListener('transitionend', () => ov.remove(), { once: true });
        document.removeEventListener('keydown', onKey);
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    const dropzone   = ov.querySelector('#import-dropzone');
    const fileInput  = ov.querySelector('#import-file-input');
    const previewEl  = ov.querySelector('#import-preview');
    const confirmBtn = ov.querySelector('#import-confirm-btn');
    const testBtn    = ov.querySelector('#import-test-btn');
    const testEl     = ov.querySelector('#import-test');
    const resetTest  = () => { testResult = null; testEl.innerHTML = ''; };

    const modeHint = () => mode === 'replace'
        ? '⚠️ Remplace entièrement les données existantes des catégories détectées ci-dessus.'
        : 'Fusionne avec les données existantes (mise à jour par id si trouvé, ajout sinon).';

    const renderPreview = (fileNames, data) => {
        const recognized = IMPORT_CATEGORIES
            .map(c => ({ ...c, count: _importCategoryCount(data, c) }))
            .filter(c => c.count != null);
        const unknownKeys = Object.keys(data).filter(k => !IMPORT_ALL_RAW_KEYS.has(k) && k !== 'exportedAt');
        previewEl.innerHTML = `
            <div class="import-preview-file">📄 <strong>${fileNames.map(esc).join(', ')}</strong></div>
            ${recognized.length ? `<div class="export-choice-grid import-preview-grid">
                ${recognized.map(c => `<div class="export-choice-btn export-choice-btn--on import-preview-tile">
                    <span class="export-choice-count">${c.count}</span>
                    <span class="export-choice-icon">${c.icon}</span>
                    <span class="export-choice-label">${esc(c.label)}</span>
                </div>`).join('')}
            </div>` : `<div class="import-preview-warn import-preview-warn--danger">Aucune catégorie reconnue — vérifiez le format (modèle ci-dessus) ou le nom des fichiers .csv.</div>`}
            ${unknownKeys.length ? `<div class="import-preview-warn">⚠️ Clé(s)/fichier(s) ignoré(s) (non reconnu(s)) : ${unknownKeys.map(esc).join(', ')}</div>` : ''}
            ${recognized.length ? `
            <div class="export-choice-formats">
                <span class="export-choice-formats-lbl">Mode</span>
                <div class="board-modes">
                    <button type="button" class="board-mode-btn${mode === 'replace' ? ' active' : ''}" data-mode="replace">Remplacer</button>
                    <button type="button" class="board-mode-btn${mode === 'merge' ? ' active' : ''}" data-mode="merge">Fusionner</button>
                </div>
            </div>
            <p class="import-preview-hint">${modeHint()}</p>` : ''}
        `;
        previewEl.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                mode = btn.dataset.mode;
                resetTest();
                previewEl.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
                const hint = previewEl.querySelector('.import-preview-hint');
                if (hint) hint.textContent = modeHint();
            });
        });
        confirmBtn.disabled = !recognized.length;
        testBtn.disabled = !recognized.length;
    };

    const handleFiles = async (fileList) => {
        const files = [...(fileList || [])];
        if (!files.length) return;
        try {
            const zips = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
            if (zips.length && files.length > 1) {
                throw new Error('Un fichier .zip doit être déposé seul (il contient déjà toutes les catégories).');
            }
            let merged;
            if (zips.length) {
                merged = await _parseZipFile(zips[0]);
            } else {
                merged = {};
                for (const file of files) {
                    const ext = file.name.split('.').pop().toLowerCase();
                    if (ext === 'json') {
                        const data = JSON.parse(await file.text());
                        if (!data || typeof data !== 'object' || Array.isArray(data)) {
                            throw new Error(`"${file.name}" doit contenir un objet JSON (pas une liste).`);
                        }
                        Object.assign(merged, data);
                    } else if (ext === 'csv') {
                        Object.assign(merged, await _parseCsvFile(file));
                    } else {
                        throw new Error(`Format non supporté : "${file.name}" (.json, .csv ou .zip attendu).`);
                    }
                }
            }
            parsedData = merged;
            resetTest();
            renderPreview(files.map(f => f.name), merged);
        } catch (err) {
            parsedData = null;
            resetTest();
            confirmBtn.disabled = true;
            testBtn.disabled = true;
            previewEl.innerHTML = `<div class="import-preview-warn import-preview-warn--danger">❌ ${esc(err.message)}</div>`;
        }
    };

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));
    ['dragover', 'dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, e => {
            e.preventDefault();
            dropzone.classList.toggle('import-dropzone--over', evt === 'dragover');
        });
    });
    dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer?.files));

    ov.querySelector('#import-dl-template')?.addEventListener('click', () => {
        _downloadBlob(JSON.stringify(_emptyImportTemplate(), null, 2), 'application/json', 'squad-board-template.json');
    });

    const runTest = async () => {
        testBtn.disabled = true;
        testEl.innerHTML = `<p class="import-preview-hint">🔍 Test en cours — import complet côté serveur, puis annulation…</p>`;
        try {
            testResult = await api.importAll(parsedData, mode, { dryRun: true });
            testEl.innerHTML = _importTestHtml(testResult, mode);
        } catch (err) {
            testResult = null;
            // L'import échouerait de la même façon : on ne le propose plus pour ce fichier.
            confirmBtn.disabled = true;
            testEl.innerHTML = `<div class="import-preview-warn import-preview-warn--danger">❌ L'import échouerait — ${esc(err.message)}</div>`;
        } finally {
            testBtn.disabled = !parsedData;
        }
    };

    ov.addEventListener('click', async e => {
        if (e.target === ov) return close();
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'cancel') return close();
        if (act === 'test' && parsedData) return runTest();
        if (act === 'ok' && parsedData) {
            // Remplacer = réécriture : derrière confirmDanger, avec les écarts du test s'il a été fait.
            if (mode === 'replace') {
                const ok = await confirmDanger('Remplacer les données ?', _replaceConfirmMessage(parsedData, testResult), { confirmLabel: 'Remplacer' });
                if (!ok) return;
            }
            close();
            try {
                await api.importAll(parsedData, mode);
                await onImported?.();   // injecté par settings.js (évite un cycle d'imports)
                toast('Import réussi', 'success');
            } catch (err) { toast(`Erreur : ${err.message}`, 'error'); }
        }
    });
}

// (loadReminders / _saveReminders : voir reminders.js)


export {
    EXPORT_CATEGORIES, EXPORT_CATEGORY_KEYS, EXPORT_FORMATS,
    _availableExportCategories, _exportCategoryCounts, _loadLastExportChoice, _saveLastExportChoice,
    _downloadBlob, _openImportModal,
};
