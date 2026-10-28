/**
 * Paramètres → « Seuils météo » — l'échelle ☀️ ⛅ 🌧️ ⛈️ du Dashboard, réglable avec aperçu.
 *
 * Même découpage que settings-jira.js : `meteoSectionHtml()` rend la section,
 * `wireMeteoSection(container)` la câble. Les seuils sont GLOBAUX (toutes les équipes) et PARTAGÉS
 * (réglage de projet `sb-meteo-thresholds`, en base depuis 3.266.0 — project-settings.js) ; l'échelle
 * elle-même vit dans utils/meteo.js — ici on ne fait que la lire, la valider et l'écrire.
 *
 * L'aperçu recalcule la VRAIE matrice avec les seuils saisis (avant enregistrement) : on voit
 * qui change de couleur avant de décider.
 */

import { store } from '../state.js';
import { esc, toast, getCurrentPi, meteoThresholds, meteoScopeThresholds, METEO_DEFAULT_THRESHOLDS, METEO_SCOPE_DEFAULT_THRESHOLDS, METEO_REL_BAND, METEO_START_TOLERANCE } from '../utils.js';
import { meteoMatrixHtml, meteoContext } from '../components/meteo_matrix.js';
import { projectStorage } from '../project-settings.js';

const LS_KEY = 'sb-meteo-thresholds';
const LS_SCOPE = 'sb-meteo-scope';
// 📐 Périmètre : échelle INVERSE (taux de mouvement, plus bas = mieux) — plafonds croissants.
const SCOPE_FIELDS = [
    { key: 'sun',   glyph: '☀️', name: 'Plafond « beau »',      desc: 'jusqu\'à ce % de mouvement, c\'est ☀️' },
    { key: 'cloud', glyph: '⛅', name: 'Plafond « variable »',  desc: 'au-delà, c\'est 🌧️ attention' },
    { key: 'rain',  glyph: '🌧️', name: 'Plafond « attention »', desc: 'au-delà, c\'est ⛈️ critique' },
];
const FIELDS = [
    { key: 'rain',  glyph: '🌧️', name: 'Seuil « attention »', desc: 'en dessous, c\'est ⛈️ critique' },
    { key: 'cloud', glyph: '⛅', name: 'Seuil « variable »',  desc: 'en dessous, c\'est 🌧️ attention' },
    { key: 'sun',   glyph: '☀️', name: 'Seuil « beau »',      desc: 'à partir de là, c\'est ☀️' },
];

/** Lit les trois champs ; renvoie `{ ok, thresholds, error }`. */
function _readDraft(container) {
    const t = {};
    for (const f of FIELDS) {
        const n = parseInt(container.querySelector(`#meteo-thr-${f.key}`)?.value, 10);
        if (!Number.isInteger(n) || n < 1 || n > 100) return { ok: false, error: `${f.name} : un entier entre 1 et 100.` };
        t[f.key] = n;
    }
    if (!(t.sun > t.cloud && t.cloud > t.rain)) return { ok: false, error: 'Les seuils doivent être croissants : attention < variable < beau.' };
    const sc = {};
    for (const f of SCOPE_FIELDS) {
        const n = parseInt(container.querySelector(`#meteo-scope-${f.key}`)?.value, 10);
        if (!Number.isInteger(n) || n < 0 || n > 200) return { ok: false, error: `Périmètre — ${f.name} : un entier entre 0 et 200.` };
        sc[f.key] = n;
    }
    if (!(sc.sun < sc.cloud && sc.cloud < sc.rain)) return { ok: false, error: 'Périmètre : les plafonds doivent être croissants : beau < variable < attention.' };
    return { ok: true, thresholds: t, scope: sc };
}

function _previewHtml(thresholds, scopeThresholds = null) {
    const teams = store.get('teams') || [];
    if (!teams.length) return '<p class="text-sm text-muted">Aucune équipe : l\'aperçu apparaîtra après une synchronisation ou la création d\'une équipe.</p>';
    const piNum = getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') });
    return meteoMatrixHtml(teams, { ...meteoContext(piNum), thresholds, scopeThresholds }, store.get('teamObjects') || [], { preview: true, title: 'Aperçu avec ces seuils' });
}

export function meteoSectionHtml() {
    const th = meteoThresholds();
    const sth = meteoScopeThresholds();
    const isCustom = !!projectStorage.getItem(LS_KEY) || !!projectStorage.getItem(LS_SCOPE);
    return `
        <!-- ═══ Seuils météo ═══ -->
        <div class="settings-section" id="section-seuils-meteo">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Seuils météo</h3><p>L'échelle ☀️ ⛅ 🌧️ ⛈️ du Dashboard — la même pour toutes les équipes</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="sync-cfg-block">
                    <div class="sync-cfg-title">Échelle absolue — Santé, SLA, Mood × 20 (scores sur 100)</div>
                    <div class="sync-cfg-hint">Trois seuils, <strong>identiques pour toutes les équipes</strong> : une équipe ne se choisit pas une météo plus clémente, sinon deux ⛅ ne veulent plus dire la même chose. Réglage local à ce navigateur.${isCustom ? ' <strong>Seuils personnalisés actifs.</strong>' : ''}</div>
                    ${FIELDS.map(f => `
                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">${f.glyph}</span>
                            <div><div class="sync-cfg-name">${esc(f.name)}</div><div class="sync-cfg-desc">${esc(f.desc)} · défaut ${METEO_DEFAULT_THRESHOLDS[f.key]}</div></div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="number" id="meteo-thr-${f.key}" class="input sync-cfg-input meteo-thr-input" min="1" max="100" step="1" value="${th[f.key]}" aria-label="${esc(f.name)}">
                        </div>
                    </div>`).join('')}
                    <div class="sync-cfg-title">📐 Périmètre — taux de mouvement (plus bas = mieux)</div>
                    <div class="sync-cfg-hint">(Tickets ajoutés + retirés en cours de sprint) ÷ tickets engagés au lancement, sur les sprints démarrés du PI. Un report à la clôture n'est pas un retrait.</div>
                    ${SCOPE_FIELDS.map(f => `
                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">${f.glyph}</span>
                            <div><div class="sync-cfg-name">${esc(f.name)}</div><div class="sync-cfg-desc">${esc(f.desc)} · défaut ${METEO_SCOPE_DEFAULT_THRESHOLDS[f.key]} %</div></div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="number" id="meteo-scope-${f.key}" class="input sync-cfg-input meteo-thr-input" min="0" max="200" step="1" value="${sth[f.key]}" aria-label="Périmètre — ${esc(f.name)}">
                        </div>
                    </div>`).join('')}
                    <div class="sync-cfg-hint">Échelle <strong>relative</strong> — Sprint et PI comparent l'avancement au temps écoulé : ±${METEO_REL_BAND} points = ⛅, jusqu'à −${2 * METEO_REL_BAND} = 🌧️, au-delà = ⛈️ ; sous ${METEO_START_TOLERANCE} % du temps, on ne juge pas encore. Ces bandes ne se règlent pas ici.</div>
                    <p class="meteo-thr-msg text-xs" id="meteo-thr-msg" role="status" aria-live="polite"></p>
                    <div class="meteo-thr-actions">
                        <button class="btn btn-primary btn-sm" id="meteo-thr-save" type="button">Enregistrer</button>
                        <button class="btn btn-secondary btn-sm" id="meteo-thr-reset" type="button"${isCustom ? '' : ' disabled'}>Valeurs par défaut</button>
                    </div>
                </div>
                <details class="stg-fold" id="meteo-thr-fold"><summary>👁️ Aperçu sur les équipes <span class="stg-fold__hint">la vraie matrice, recalculée à chaque saisie</span></summary>
                <div id="meteo-thr-preview">${_previewHtml(th, sth)}</div></details>
            </div>
        </div>`;
}

export function wireMeteoSection(container) {
    const sec = container.querySelector('#section-seuils-meteo');
    if (!sec) return;
    const msg = sec.querySelector('#meteo-thr-msg');
    const preview = sec.querySelector('#meteo-thr-preview');
    const btnReset = sec.querySelector('#meteo-thr-reset');
    const setMsg = (text, bad = false) => { msg.textContent = text; msg.classList.toggle('is-error', bad); };

    // Aperçu vivant : chaque saisie recalcule la matrice avec le brouillon.
    const refresh = () => {
        const d = _readDraft(sec);
        if (!d.ok) { setMsg(d.error, true); return; }
        setMsg('');
        sec.querySelector('#meteo-thr-fold').open = true;   // une saisie montre son effet (3.284.0)
        preview.innerHTML = _previewHtml(d.thresholds, d.scope);
    };
    sec.querySelectorAll('.meteo-thr-input').forEach(inp => inp.addEventListener('input', refresh));

    sec.querySelector('#meteo-thr-save')?.addEventListener('click', () => {
        const d = _readDraft(sec);
        if (!d.ok) { setMsg(d.error, true); return; }
        projectStorage.setItem(LS_KEY, JSON.stringify(d.thresholds));
        projectStorage.setItem(LS_SCOPE, JSON.stringify(d.scope));
        btnReset.disabled = false;
        setMsg('Seuils enregistrés — le Dashboard les applique dès son prochain affichage.');
        toast('Seuils météo enregistrés', 'success');
        refresh();
    });

    btnReset?.addEventListener('click', () => {
        projectStorage.removeItem(LS_KEY);
        projectStorage.removeItem(LS_SCOPE);
        for (const f of FIELDS) { const inp = sec.querySelector(`#meteo-thr-${f.key}`); if (inp) inp.value = METEO_DEFAULT_THRESHOLDS[f.key]; }
        for (const f of SCOPE_FIELDS) { const inp = sec.querySelector(`#meteo-scope-${f.key}`); if (inp) inp.value = METEO_SCOPE_DEFAULT_THRESHOLDS[f.key]; }
        btnReset.disabled = true;
        setMsg('Valeurs par défaut rétablies.');
        toast('Seuils météo par défaut', 'info');
        refresh();
    });
}
