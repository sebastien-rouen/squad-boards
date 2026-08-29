/**
 * Paramètres → « Seuils météo » — l'échelle ☀️ ⛅ 🌧️ ⛈️ du Dashboard, réglable avec aperçu.
 *
 * Même découpage que settings-jira.js : `meteoSectionHtml()` rend la section,
 * `wireMeteoSection(container)` la câble. Les seuils sont GLOBAUX (toutes les équipes) et
 * locaux à ce navigateur (`sb-meteo-thresholds`, comme les autres réglages `sb-*`) ; l'échelle
 * elle-même vit dans utils/meteo.js — ici on ne fait que la lire, la valider et l'écrire.
 *
 * L'aperçu recalcule la VRAIE matrice avec les seuils saisis (avant enregistrement) : on voit
 * qui change de couleur avant de décider.
 */

import { store } from '../state.js';
import { esc, toast, getCurrentPi, meteoThresholds, METEO_DEFAULT_THRESHOLDS, METEO_REL_BAND, METEO_START_TOLERANCE } from '../utils.js';
import { meteoMatrixHtml, meteoContext } from '../components/meteo_matrix.js';

const LS_KEY = 'sb-meteo-thresholds';
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
    return { ok: true, thresholds: t };
}

function _previewHtml(thresholds) {
    const teams = store.get('teams') || [];
    if (!teams.length) return '<p class="text-sm text-muted">Aucune équipe : l\'aperçu apparaîtra après une synchronisation ou la création d\'une équipe.</p>';
    const piNum = getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo: store.get('piInfo') });
    return meteoMatrixHtml(teams, { ...meteoContext(piNum), thresholds }, store.get('teamObjects') || [], { preview: true, title: 'Aperçu avec ces seuils' });
}

export function meteoSectionHtml() {
    const th = meteoThresholds();
    const isCustom = !!localStorage.getItem(LS_KEY);
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
                    <div class="sync-cfg-hint">Échelle <strong>relative</strong> — Sprint et PI comparent l'avancement au temps écoulé : ±${METEO_REL_BAND} points = ⛅, jusqu'à −${2 * METEO_REL_BAND} = 🌧️, au-delà = ⛈️ ; sous ${METEO_START_TOLERANCE} % du temps, on ne juge pas encore. Ces bandes ne se règlent pas ici.</div>
                    <p class="meteo-thr-msg text-xs" id="meteo-thr-msg" role="status" aria-live="polite"></p>
                    <div class="meteo-thr-actions">
                        <button class="btn btn-primary btn-sm" id="meteo-thr-save" type="button">Enregistrer</button>
                        <button class="btn btn-secondary btn-sm" id="meteo-thr-reset" type="button"${isCustom ? '' : ' disabled'}>Valeurs par défaut</button>
                    </div>
                </div>
                <div id="meteo-thr-preview">${_previewHtml(th)}</div>
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
        preview.innerHTML = _previewHtml(d.thresholds);
    };
    sec.querySelectorAll('.meteo-thr-input').forEach(inp => inp.addEventListener('input', refresh));

    sec.querySelector('#meteo-thr-save')?.addEventListener('click', () => {
        const d = _readDraft(sec);
        if (!d.ok) { setMsg(d.error, true); return; }
        localStorage.setItem(LS_KEY, JSON.stringify(d.thresholds));
        btnReset.disabled = false;
        setMsg('Seuils enregistrés — le Dashboard les applique dès son prochain affichage.');
        toast('Seuils météo enregistrés', 'success');
        refresh();
    });

    btnReset?.addEventListener('click', () => {
        localStorage.removeItem(LS_KEY);
        for (const f of FIELDS) { const inp = sec.querySelector(`#meteo-thr-${f.key}`); if (inp) inp.value = METEO_DEFAULT_THRESHOLDS[f.key]; }
        btnReset.disabled = true;
        setMsg('Valeurs par défaut rétablies.');
        toast('Seuils météo par défaut', 'info');
        refresh();
    });
}
