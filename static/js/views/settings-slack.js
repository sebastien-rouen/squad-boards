/**
 * Paramètres → Slack : webhook d'envoi des rotations support (stocké côté navigateur).
 */

import { esc, toast } from '../utils.js';
import * as api from '../api.js';

/** Section « Slack (optionnel) ». */
export function slackSectionHtml(ctx) {
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
                    <div class="sync-cfg-hint">Créez un Incoming Webhook dans votre Slack App (api.slack.com → Votre app → Incoming Webhooks → Activate). L'URL est stockée en localStorage. Le bouton <strong>💬 Slack</strong> dans chaque panneau de rotation l'utilisera pour envoyer directement dans le canal cible.</div>
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
                                placeholder="https://hooks.slack.com/services/..."
                                value="${esc(api.getSlackWebhook())}">
                        </div>
                    </div>
                    <div class="sync-cfg-actions">
                        <button class="btn btn-primary btn-sm" id="btn-save-slack">Enregistrer</button>
                        <button class="btn btn-ghost btn-sm" id="btn-test-slack">🧪 Tester</button>
                        ${api.getSlackWebhook() ? `<button class="btn btn-ghost btn-sm" id="btn-reset-slack">Effacer</button>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
}

/** Câblage du webhook Slack : enregistrer, tester, effacer. */
export function wireSlackSection(container, ctx) {
    // ── Slack webhook ─────────────────────────────────────────────────────────
    container.querySelector('#btn-save-slack')?.addEventListener('click', () => {
        const url = container.querySelector('#slack-webhook')?.value || '';
        api.setSlackWebhook(url);
        toast(url ? 'Webhook Slack enregistré' : 'Webhook supprimé', 'success');
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
    container.querySelector('#btn-reset-slack')?.addEventListener('click', () => {
        api.setSlackWebhook('');
        toast('Webhook Slack supprimé', 'info');
        ctx.reload();
    });
}
