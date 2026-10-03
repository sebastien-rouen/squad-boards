/**
 * Plugin JIRA — section « Paramètres → Plugin JIRA » : connexion (URL / email / token),
 * paramètres de synchronisation, équipes masquées et création de groupes depuis les projets.
 *
 * Extrait de settings.js (v3.141.8). Le HTML relit tout depuis le store et `api.getJiraCreds()`,
 * donc aucune donnée à lui passer ; seul le rafraîchissement de la vue est INJECTÉ
 * (`onReload`) — importer `reloadAndRender` depuis settings.js créerait un cycle.
 */

import { store } from '../state.js';
import { SYNC_DEFAULTS } from '../config.js';
import * as api from '../api.js';
import { esc, toast, emptyStateHtml } from '../utils.js';
import { getExcludedTeams, removeExcludedTeam, clearExcludedTeams } from '../sync.js';
import { statusOverrideHtml, wireStatusOverride } from './settings-status-override.js';

/** Valeur effective d'un réglage de sync (saisie utilisateur, sinon défaut). */
function _readCapValue(lsKey, fallback) {
    const n = parseInt((localStorage.getItem(lsKey) || '').trim(), 10);
    return isNaN(n) || n < 0 ? fallback : n;
}

/** Cadence du PI, telle que déclarée dans « Sprint & PI » — jamais devinée ici. */
function _piCadence() {
    const pi = store.get('piInfo') || {};
    return {
        perPi: parseInt(pi.sprintsPerPI, 10) || 5,
        days: parseInt(pi.sprintDuration, 10) || 14,
    };
}

/**
 * Traduit un nombre de sprints en durée parlante. Un chiffre en sprints ne dit rien de la
 * profondeur obtenue tant qu'on ne connaît pas la cadence : c'est la conversion qui permet
 * de répondre à « je veux 6 mois d'historique ».
 */
function _equiv(sprints) {
    if (!sprints || sprints < 1) return '';
    const { perPi, days } = _piCadence();
    const months = Math.round((sprints * days) / 30.44);
    const pis = (sprints / perPi);
    const piTxt = pis >= 1 ? ` · ${pis % 1 === 0 ? pis : pis.toFixed(1)} PI` : '';
    return `≈ ${months} mois${piTxt} (${perPi} sprints/PI, ${days} j)`;
}

/** Raccourcis exprimés en PI — l'unité dans laquelle se raisonne un historique SAFe. */
function _piPresets() {
    const { perPi } = _piCadence();
    return [1, 2, 4].map(n => {
        const sprints = n * perPi;
        return `<button type="button" class="btn btn-ghost btn-sm sync-preset" data-sprints="${sprints}"
            title="${sprints} sprints — ${_equiv(sprints)}">${n} PI</button>`;
    }).join('');
}

// ── Onglets de la section (3.195.0) ─────────────────────────────────────────
// Connexion, synchro, équipes masquées et statuts forcés s'empilaient sur plusieurs écrans. Les
// quatre panneaux restent TOUS dans le DOM (masqués par `hidden`) : le câblage et l'enregistrement
// de la synchro lisent leurs champs sans savoir quel onglet est ouvert. Onglet retenu par
// navigateur (localStorage) : un enregistrement re-rend la page et y revient.
const _TABS = [
    { key: 'conn',   icon: '🔗', label: 'Connexion' },
    { key: 'sync',   icon: '⏱️', label: 'Synchro' },
    { key: 'teams',  icon: '🚫', label: 'Équipes masquées' },
    { key: 'status', icon: '🎯', label: 'Statuts forcés' },
];
const _TAB_KEY = 'sb-settings-jira-tab';
function _activeTab() {
    let k = '';
    try { k = localStorage.getItem(_TAB_KEY) || ''; } catch { /* stockage indisponible */ }
    return _TABS.some(t => t.key === k) ? k : 'conn';
}

/** Panneau sans objet tant que JIRA n'est pas connecté. */
const _needConnection = what => emptyStateHtml({ icon: '🔌', title: 'JIRA n\'est pas connecté', text: `Configurez d'abord la connexion pour accéder ${what}.`, action: { label: 'Configurer la connexion', attrs: 'data-jira-goto="conn"' } });

/** À partir de ce nombre d'équipes masquées, un champ de recherche filtre les puces. */
const _EXCL_SEARCH_MIN = 10;

/** Équipes masquées : en-tête (titre, nombre, « Tout restaurer »), recherche, puces sur toute la largeur. */
function _excludedHtml(ex) {
    if (!ex.length) return emptyStateHtml({ tone: 'ok', icon: '✅', title: 'Aucune équipe masquée', text: 'Toutes les équipes des boards JIRA sont synchronisées. Une équipe se masque depuis la carte de synchro (« Masquer ») quand elle ne vous concerne pas.' });
    return `
                <div class="sync-cfg-block mt-4">
                    <div class="sync-cfg-row sync-cfg-row--stack" id="excluded-teams-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🚫</span>
                            <div class="excl-head">
                                <div class="sync-cfg-name">Équipes / lignes produit masquées <span class="excl-count">${ex.length}</span></div>
                                <div class="sync-cfg-desc">Retirées de la sync JIRA : elles ne sont pas recréées. Cliquez une équipe pour la restaurer (elle réapparaîtra à la prochaine sync).</div>
                            </div>
                            <button type="button" class="btn btn-ghost btn-sm excl-clear" id="btn-clear-excluded">↺ Tout restaurer</button>
                        </div>
                        ${ex.length >= _EXCL_SEARCH_MIN ? `<div class="excl-search"><input type="search" id="excl-search" class="input" placeholder="Filtrer les ${ex.length} équipes…" aria-label="Filtrer les équipes masquées" aria-controls="excluded-teams-list"><small id="excl-search-count" aria-live="polite"></small></div>` : ''}
                        <ul class="excl-list" id="excluded-teams-list" aria-label="Équipes masquées">
                            ${ex.map(n => `<li><button type="button" class="excl-chip excluded-team-chip" data-name="${esc(n)}" title="Restaurer ${esc(n)}"><span>${esc(n)}</span><span class="excl-chip-x" aria-hidden="true">↺</span></button></li>`).join('')}
                        </ul>
                    </div>
                </div>`;
}

/** HTML de la section — à interpoler dans le template de renderSettings. */
export function jiraSectionHtml() {
    const jiraConfigured  = store.get('jiraConfigured');
    const project         = store.get('project');
    const jiraUrl         = store.get('jiraUrl');
    const jiraEnv         = store.get('jiraEnv') || {};
    const jiraCreds       = api.getJiraCreds();
    const excluded        = [...getExcludedTeams()].sort((a, b) => a.localeCompare(b, 'fr'));
    const tab             = _activeTab();
    return `
        <!-- ═══ JIRA Plugin ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle><h3>Plugin JIRA (optionnel)</h3><svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg></div>
            <div class="settings-section-body">
                <div class="jira-tabs" role="tablist" aria-label="Plugin JIRA">${_TABS.map(t => `<button type="button" role="tab" class="jira-tab" id="jira-tab-${t.key}" data-jira-tab="${t.key}" aria-controls="jira-panel-${t.key}" aria-selected="${t.key === tab}" tabindex="${t.key === tab ? 0 : -1}">${t.icon} ${esc(t.label)}${t.key === 'teams' && excluded.length ? ` <small>${excluded.length}</small>` : ''}</button>`).join('')}</div>
                <div class="jira-panel" id="jira-panel-conn" role="tabpanel" aria-labelledby="jira-tab-conn"${tab === 'conn' ? '' : ' hidden'}>
                <div class="connection-status ${jiraConfigured ? 'connected' : 'disconnected'}">
                    <span class="status-dot"></span>
                    ${jiraConfigured ? `Connecte a <strong>${esc(jiraUrl || '')}</strong>${project ? ` (projet: ${esc(project)})` : ''}` : 'Non configure'}
                </div>

                <div class="sync-cfg-block mt-4">
                    <div class="sync-cfg-title">Connexion JIRA</div>
                    <div class="sync-cfg-hint">Pré-rempli depuis le <code>.env</code> serveur si présent. Toute valeur saisie ici est gardée en mémoire (localStorage) et <strong>prime sur le .env</strong>. Laissez vide pour conserver la valeur du .env.</div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🔗</span>
                            <div>
                                <div class="sync-cfg-name">URL JIRA</div>
                                <div class="sync-cfg-desc">Base de l'instance, ex : <code>https://mon-domaine.atlassian.net</code></div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="url" id="jira-url" class="input sync-cfg-input sync-cfg-input--wide" placeholder="${esc(jiraEnv.url || 'https://mon-domaine.atlassian.net')}"
                                value="${esc(jiraCreds.url || '')}">
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">📧</span>
                            <div>
                                <div class="sync-cfg-name">Email</div>
                                <div class="sync-cfg-desc">Compte JIRA (Basic Auth Atlassian Cloud)</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="email" id="jira-user" class="input sync-cfg-input sync-cfg-input--wide" placeholder="${esc(jiraEnv.user || 'prenom.nom@societe.com')}"
                                value="${esc(jiraCreds.user || '')}">
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🔑</span>
                            <div>
                                <div class="sync-cfg-name">Token API</div>
                                <div class="sync-cfg-desc">${jiraEnv.tokenSet ? 'Un token est déjà défini dans le .env — laissez vide pour le conserver, ou saisissez-en un nouveau pour le surcharger.' : 'Token API Atlassian — non affiché une fois enregistré.'}</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="password" id="jira-token" class="input sync-cfg-input sync-cfg-input--wide" autocomplete="off"
                                placeholder="${jiraCreds.token ? '•••••••••• (enregistré — laissez vide pour conserver)' : (jiraEnv.tokenSet ? '•••••••••• (défini dans .env)' : 'Aucun token')}"
                                value="">
                        </div>
                    </div>

                    <div class="sync-cfg-actions">
                        <button class="btn btn-primary btn-sm" id="btn-save-jira-conn">Enregistrer la connexion</button>
                        <button class="btn btn-ghost btn-sm" id="btn-test-jira-conn">Tester</button>
                        ${(jiraCreds.url || jiraCreds.user || jiraCreds.token) ? `<button class="btn btn-ghost btn-sm" id="btn-reset-jira-conn" title="Revenir aux valeurs du .env">Réinitialiser (.env)</button>` : ''}
                    </div>
                </div>
                </div>

                <div class="jira-panel" id="jira-panel-sync" role="tabpanel" aria-labelledby="jira-tab-sync"${tab === 'sync' ? '' : ' hidden'}>
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

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">⚡</span>
                            <div>
                                <div class="sync-cfg-name">Historique — vélocité</div>
                                <div class="sync-cfg-desc">Sprints clôturés conservés par board pour les tendances et la base de capacité. <strong>Gratuit à élargir</strong> : l'import parcourt de toute façon tous les sprints du board (défaut : ${SYNC_DEFAULTS.closedKeep}). ${_equiv(SYNC_DEFAULTS.closedKeep)}</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="number" id="sync-closed-keep" class="input sync-cfg-input" min="5" max="200" step="5" placeholder="${SYNC_DEFAULTS.closedKeep}"
                                value="${esc(localStorage.getItem('sb-sync-closedKeep') || '')}">
                            <span class="sync-cfg-unit">sprints</span>
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🎫</span>
                            <div>
                                <div class="sync-cfg-name">Historique — détail des tickets</div>
                                <div class="sync-cfg-desc">
                                    Sprints clôturés dont les <strong>tickets</strong> sont rapatriés — ce qui alimente cycle time, engagement et périmètre ajouté en cours de sprint (défaut : ${SYNC_DEFAULTS.closedTicketSprints}).
                                    ⚠️ Contrairement au réglage ci-dessus, celui-ci <strong>coûte un appel JIRA par sprint et par board</strong>, changelog compris : c'est lui qui fait la durée d'un import complet et le poids de la base. <code>0</code> désactive la passe.
                                </div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap sync-cfg-input-wrap--stack">
                            <div class="sync-cfg-inline">
                                <input type="number" id="sync-closed-ticket-sprints" class="input sync-cfg-input" min="0" max="60" step="1" placeholder="${SYNC_DEFAULTS.closedTicketSprints}"
                                    value="${esc(localStorage.getItem('sb-sync-closedTicketSprints') || '')}">
                                <span class="sync-cfg-unit">sprints</span>
                            </div>
                            <div class="sync-cfg-presets" role="group" aria-label="Raccourcis de profondeur">
                                ${_piPresets()}
                            </div>
                            <div class="sync-cfg-equiv" id="sync-tickets-equiv">${_equiv(_readCapValue('sb-sync-closedTicketSprints', SYNC_DEFAULTS.closedTicketSprints))}</div>
                        </div>
                    </div>

                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">📦</span>
                            <div>
                                <div class="sync-cfg-name">Ne pas retélécharger les sprints clos</div>
                                <div class="sync-cfg-desc">
                                    Un sprint clôturé ne bouge plus : ses tickets sont relus depuis la base au lieu d'être redemandés à JIRA. C'est ce qui rend un historique long <strong>soutenable</strong> — sans ça, la sync complète étant en mode « efface puis ré-importe », l'intégralité de la fenêtre se repaie à chaque fois.
                                    ⚠️ En contrepartie, une correction faite dans JIRA sur un sprint <em>déjà clos</em> ne redescendra plus. « Tout réimporter depuis JIRA » contourne l'archive.
                                </div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <label class="toggle-switch" title="${_readCapValue('sb-sync-archiveClosed', SYNC_DEFAULTS.archiveClosed) ? 'Désactiver' : 'Activer'}">
                                <input type="checkbox" id="sync-archive-closed" ${_readCapValue('sb-sync-archiveClosed', SYNC_DEFAULTS.archiveClosed) ? 'checked' : ''}>
                                <span class="toggle-track"></span>
                            </label>
                        </div>
                    </div>


                    <div class="sync-cfg-actions">
                        <button class="btn btn-primary btn-sm" id="btn-save-sync-config">Enregistrer</button>
                    </div>
                </div>
                ` : _needConnection('aux réglages de synchronisation')}
                </div>

                <div class="jira-panel" id="jira-panel-teams" role="tabpanel" aria-labelledby="jira-tab-teams"${tab === 'teams' ? '' : ' hidden'}>
                ${_excludedHtml(excluded)}
                </div>

                <div class="jira-panel" id="jira-panel-status" role="tabpanel" aria-labelledby="jira-tab-status"${tab === 'status' ? '' : ' hidden'}>
                ${statusOverrideHtml()}
                </div>
            </div>
        </div>

`;
}

/**
 * Câble les interactions de la section.
 * @param {HTMLElement} container  racine de la vue Paramètres
 * @param {Function}    onReload   rafraîchissement complet (injecté par settings.js)
 */
export function wireJiraSection(container, onReload = () => {}) {
    const reloadAndRender = () => onReload();
    wireStatusOverride(container, reloadAndRender);   // 🎯 Statuts forcés dans une colonne (règle partagée)

    // ── JIRA sync config ──────────────────────────────────────────────────────
    // `min` : 0 est une valeur LÉGITIME pour l'historique des tickets (désactive la passe),
    // alors qu'un plafond à 0 n'aurait aucun sens ailleurs. Sans ce paramètre, saisir 0
    // effaçait la clé et rétablissait silencieusement le défaut.
    const _saveCap = (inputId, lsKey, min = 1) => {
        const raw = (container.querySelector(`#${inputId}`)?.value || '').trim();
        if (!raw) { localStorage.removeItem(lsKey); return; }
        const n = parseInt(raw);
        if (!isNaN(n) && n >= min) localStorage.setItem(lsKey, String(n));
        else localStorage.removeItem(lsKey);
    };
    const _saveStr = (inputId, lsKey) => {
        const v = (container.querySelector(`#${inputId}`)?.value || '').trim();
        if (v) localStorage.setItem(lsKey, v);
        else localStorage.removeItem(lsKey);
    };
    // ── Connexion JIRA (URL / email / token → localStorage, prime sur .env) ────
    const _saveJiraConn = () => {
        const url   = container.querySelector('#jira-url')?.value || '';
        const user  = container.querySelector('#jira-user')?.value || '';
        const token = container.querySelector('#jira-token')?.value || '';
        // URL/email vides ⇒ suppression (fallback .env). Token vide ⇒ on conserve l'existant.
        api.setJiraCreds({ url, user, ...(token.trim() ? { token } : {}) });
    };
    container.querySelector('#btn-save-jira-conn')?.addEventListener('click', async () => {
        _saveJiraConn();
        await window.__squadBoard?.applyJiraConfig?.();
        toast('Connexion JIRA enregistrée', 'success');
        reloadAndRender();
    });
    container.querySelector('#btn-test-jira-conn')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        _saveJiraConn();  // on teste ce qui est saisi
        const old = btn.textContent; btn.disabled = true; btn.textContent = 'Test…';
        try {
            const me = await api.jiraGet('rest/api/3/myself');
            toast(`Connexion OK — ${me?.displayName || me?.emailAddress || 'authentifié'}`, 'success');
        } catch (err) {
            toast(`Échec connexion JIRA : ${err.message}`, 'error', 5000);
        } finally { btn.disabled = false; btn.textContent = old; }
    });
    container.querySelector('#btn-reset-jira-conn')?.addEventListener('click', async () => {
        api.setJiraCreds({ url: '', user: '', token: '' });
        await window.__squadBoard?.applyJiraConfig?.();
        toast('Connexion réinitialisée (valeurs du .env)', 'success');
        reloadAndRender();
    });

    container.querySelector('#btn-save-sync-config')?.addEventListener('click', () => {
        _saveCap('sync-max-features', 'sb-sync-maxFeatures');
        _saveCap('sync-max-boards',   'sb-sync-maxBoards');
        _saveCap('sync-quick-days',   'sb-sync-quickDays');
        _saveCap('sync-closed-keep',  'sb-sync-closedKeep');
        _saveCap('sync-closed-ticket-sprints', 'sb-sync-closedTicketSprints', 0);
        // Booléen stocké en 0/1 : `syncSetting` ne lit que des entiers, et une clé absente
        // doit pouvoir signifier « défaut » et non « désactivé ».
        localStorage.setItem('sb-sync-archiveClosed',
            container.querySelector('#sync-archive-closed')?.checked ? '1' : '0');
        _saveStr('sync-sprint-field', 'sb-sync-sprintField');
        _saveStr('sync-team-field',   'sb-sync-teamField');
        toast('Configuration sync JIRA enregistree', 'success');
        // Met à jour le label du bouton topbar pour refléter la nouvelle durée
        window.__squadBoard?.refreshSyncButtonLabel?.();
    });

    // ── Profondeur des tickets : raccourcis en PI et équivalence en mois ──────
    // L'équivalence se recalcule à la saisie SANS re-rendre la section : un rendu complet
    // reposerait les champs et ferait perdre les autres valeurs en cours d'édition.
    const _ticketsInput = container.querySelector('#sync-closed-ticket-sprints');
    const _equivEl      = container.querySelector('#sync-tickets-equiv');
    const _refreshEquiv = () => {
        if (!_equivEl) return;
        const n = parseInt(_ticketsInput?.value, 10);
        _equivEl.textContent = isNaN(n)
            ? _equiv(SYNC_DEFAULTS.closedTicketSprints)
            : (n === 0 ? 'Passe désactivée — aucun ticket de sprint clos ne sera rapatrié.' : _equiv(n));
    };
    _ticketsInput?.addEventListener('input', _refreshEquiv);
    container.querySelectorAll('.sync-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!_ticketsInput) return;
            _ticketsInput.value = btn.dataset.sprints;
            _refreshEquiv();
        });
    });

    // ── Onglets ───────────────────────────────────────────────────────────────
    const _tabsEl = container.querySelector('.jira-tabs');
    const _show = key => {
        try { localStorage.setItem(_TAB_KEY, key); } catch { /* stockage indisponible */ }
        container.querySelectorAll('[data-jira-tab]').forEach(b => {
            const on = b.dataset.jiraTab === key;
            b.setAttribute('aria-selected', String(on));
            b.tabIndex = on ? 0 : -1;
        });
        container.querySelectorAll('.jira-panel').forEach(p => { p.hidden = p.id !== `jira-panel-${key}`; });
    };
    _tabsEl?.addEventListener('click', e => {
        const b = e.target.closest('[data-jira-tab]');
        if (b) _show(b.dataset.jiraTab);
    });
    _tabsEl?.addEventListener('keydown', e => {
        const keys = _TABS.map(t => t.key), cur = keys.indexOf(e.target.dataset?.jiraTab);
        if (cur < 0) return;
        const next = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: keys.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const key = keys[(next + keys.length) % keys.length];
        _show(key);
        _tabsEl.querySelector(`[data-jira-tab="${key}"]`)?.focus();
    });
    container.querySelectorAll('[data-jira-goto]').forEach(b => b.addEventListener('click', () => {
        _show(b.dataset.jiraGoto);
        _tabsEl?.querySelector(`[data-jira-tab="${b.dataset.jiraGoto}"]`)?.focus();
    }));

    // ── Équipes masquées — filtre (sans accents ni casse) ─────────────────────
    const _fold = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const _exclSearch = container.querySelector('#excl-search');
    _exclSearch?.addEventListener('input', () => {
        const q = _fold(_exclSearch.value.trim());
        let shown = 0;
        container.querySelectorAll('#excluded-teams-list li').forEach(li => {
            const hit = !q || _fold(li.textContent).includes(q);
            li.hidden = !hit;
            if (hit) shown++;
        });
        const out = container.querySelector('#excl-search-count');
        if (out) out.textContent = q ? `${shown} / ${container.querySelectorAll('#excluded-teams-list li').length}` : '';
    });

    // ── Équipes masquées — restauration ───────────────────────────────────────
    container.querySelectorAll('.excluded-team-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            removeExcludedTeam(chip.dataset.name);
            toast(`« ${chip.dataset.name} » restaurée — réapparaîtra à la prochaine sync`, 'success');
            reloadAndRender();
        });
    });
    container.querySelector('#btn-clear-excluded')?.addEventListener('click', () => {
        clearExcludedTeams();
        toast('Toutes les équipes masquées ont été restaurées', 'success');
        reloadAndRender();
    });


}
