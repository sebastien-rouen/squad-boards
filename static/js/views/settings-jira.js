/**
 * Plugin JIRA — section « Paramètres → Plugin JIRA » : connexion (URL / email / token),
 * paramètres de synchronisation, équipes masquées et création de groupes depuis les projets.
 *
 * Extrait de settings.js (v3.141.8). Le HTML relit tout depuis le store et `api.getJiraCreds()`,
 * donc aucune donnée à lui passer ; seul le rafraîchissement de la vue est INJECTÉ
 * (`onReload`) — importer `reloadAndRender` depuis settings.js créerait un cycle.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast } from '../utils.js';
import { getExcludedTeams, removeExcludedTeam, clearExcludedTeams } from '../sync.js';

/** HTML de la section — à interpoler dans le template de renderSettings. */
export function jiraSectionHtml() {
    const jiraConfigured  = store.get('jiraConfigured');
    const project         = store.get('project');
    const jiraUrl         = store.get('jiraUrl');
    const jiraEnv         = store.get('jiraEnv') || {};
    const jiraCreds       = api.getJiraCreds();
    const jiraProjectTeams = store.get('jiraProjectTeams') || {};
    return `
        <!-- ═══ JIRA Plugin ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle><h3>Plugin JIRA (optionnel)</h3><svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg></div>
            <div class="settings-section-body">
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
                            <input type="url" id="jira-url" class="input sync-cfg-input" style="min-width:260px" placeholder="${esc(jiraEnv.url || 'https://mon-domaine.atlassian.net')}"
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
                            <input type="email" id="jira-user" class="input sync-cfg-input" style="min-width:260px" placeholder="${esc(jiraEnv.user || 'prenom.nom@societe.com')}"
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
                            <input type="password" id="jira-token" class="input sync-cfg-input" style="min-width:260px" autocomplete="off"
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
                            <span class="sync-cfg-icon">📅</span>
                            <div>
                                <div class="sync-cfg-name">Sprints récents à conserver</div>
                                <div class="sync-cfg-desc">Nombre de sprints clôturés récents récupérés par board pour la vélocité historique. Utile pour les équipes avec beaucoup de sprints (défaut : 20)</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="number" id="sync-closed-keep" class="input sync-cfg-input" min="5" max="100" step="5" placeholder="20"
                                value="${esc(localStorage.getItem('sb-sync-closedKeep') || '')}">
                            <span class="sync-cfg-unit">sprints</span>
                        </div>
                    </div>

                    ${(() => {
                        const ex = getExcludedTeams();
                        return `
                    <div class="sync-cfg-row" id="excluded-teams-row" style="${ex.length ? '' : 'display:none'}">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🚫</span>
                            <div>
                                <div class="sync-cfg-name">Équipes / lignes produit masquées</div>
                                <div class="sync-cfg-desc">Retirées de la sync JIRA : elles ne sont pas recréées. Cliquez une puce pour la restaurer.</div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap" style="flex-wrap:wrap;gap:6px;align-items:center">
                            <div id="excluded-teams-list" style="display:flex;flex-wrap:wrap;gap:6px">
                                ${ex.map(n => `<button type="button" class="chip chip-removable excluded-team-chip" data-name="${esc(n)}" title="Restaurer ${esc(n)}">${esc(n)} ✕</button>`).join('')}
                            </div>
                            ${ex.length ? `<button type="button" class="btn btn-ghost btn-sm" id="btn-clear-excluded">Tout restaurer</button>` : ''}
                        </div>
                    </div>`;
                    })()}

                    <div class="sync-cfg-actions">
                        <button class="btn btn-primary btn-sm" id="btn-save-sync-config">Enregistrer</button>
                    </div>
                </div>
                ` : ''}
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
        _saveStr('sync-sprint-field', 'sb-sync-sprintField');
        _saveStr('sync-team-field',   'sb-sync-teamField');
        toast('Configuration sync JIRA enregistree', 'success');
        // Met à jour le label du bouton topbar pour refléter la nouvelle durée
        window.__squadBoard?.refreshSyncButtonLabel?.();
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
