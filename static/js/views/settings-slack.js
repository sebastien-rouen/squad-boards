/**
 * Paramètres → Slack : webhook d'envoi des rotations support — webhook du PROJET, enregistré côté serveur en
 * écriture seule (3.269.0) : jamais réaffiché, hors sauvegardes. `store.slackConfigured` dit s'il existe.
 */

import { toast } from '../utils.js';
import * as api from '../api.js';
import { store } from '../state.js';

/** Section « Slack (optionnel) ». */
export function slackSectionHtml(_ctx) {
    return `
        <!-- ═══ Slack ═══ -->
        <div class="settings-section">
            <div class="settings-section-header" data-stg-toggle>
                <div><h3>Slack (optionnel)</h3><p>Envoi direct des rotations support dans un canal Slack</p></div>
                <svg class="icon icon-sm chevron"><use href="#i-chevron-down"/></svg>
            </div>
            <div class="settings-section-body">
                <div class="sync-cfg-block">
                    <div class="sync-cfg-title">Incoming Webhook</div>
                    <div class="sync-cfg-hint">Créez un Incoming Webhook dans votre Slack App (api.slack.com → Votre app → Incoming Webhooks → Activate). L'URL est enregistrée <strong>sur le serveur, pour tous les postes</strong>, et n'est jamais réaffichée. Le bouton <strong>💬 Slack</strong> dans chaque panneau de rotation l'utilisera pour envoyer directement dans le canal cible.</div>
                    <div class="sync-cfg-row">
                        <div class="sync-cfg-label">
                            <span class="sync-cfg-icon">🔗</span>
                            <div>
                                <div class="sync-cfg-name">URL Webhook</div>
                                <div class="sync-cfg-desc">ex : <code>https://hooks.slack.com/services/T.../B.../...</code></div>
                            </div>
                        </div>
                        <div class="sync-cfg-input-wrap">
                            <input type="url" id="slack-webhook" class="input sync-cfg-input" style="min-width:340px"
                                placeholder="${store.get('slackConfigured') ? '•••••••••• (enregistré — saisir pour remplacer)' : 'https://hooks.slack.com/services/...'}"
                                value="">
                        </div>
                    </div>
                    <div class="sync-cfg-actions">
                        <button class="btn btn-primary btn-sm" id="btn-save-slack">Enregistrer</button>
                        <button class="btn btn-ghost btn-sm" id="btn-test-slack">🧪 Tester</button>
                        ${store.get('slackConfigured') ? `<button class="btn btn-ghost btn-sm" id="btn-reset-slack">Effacer</button>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
}

/** Câblage du webhook Slack : enregistrer, tester, effacer. */
export function wireSlackSection(container, ctx) {
    // ── Slack webhook ─────────────────────────────────────────────────────────
    container.querySelector('#btn-save-slack')?.addEventListener('click', async () => {
        const url = (container.querySelector('#slack-webhook')?.value || '').trim();
        if (!url) { toast('Saisis l\'URL du webhook (Effacer pour le retirer)', 'info'); return; }
        try { await api.saveSlackWebhook(url); } catch (e) { toast(e.message, 'error', 6000); return; }
        store.set('slackConfigured', true);
        toast('Webhook Slack enregistré (partagé)', 'success');
        ctx.reload();
    });
    container.querySelector('#btn-test-slack')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-test-slack');
        const old = btn.textContent; btn.disabled = true; btn.textContent = '…';
        try {
            await api.sendSlackMessage('🧪 Test depuis Squad Board — rotation support');
            toast('Message envoyé avec succès ✓', 'success');
        } catch (e) { toast(e.message, 'error', 6000); }
        finally { btn.disabled = false; btn.textContent = old; }
    });
    container.querySelector('#btn-reset-slack')?.addEventListener('click', async () => {
        try { await api.saveSlackWebhook(''); } catch (e) { toast(e.message, 'error'); return; }
        store.set('slackConfigured', false);
        toast('Webhook Slack supprimé', 'info');
        ctx.reload();
    });
}
