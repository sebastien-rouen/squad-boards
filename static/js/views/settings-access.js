/**
 * Paramètres → « Accès » (3.285.0) — qui peut se connecter quand le SSO est armé (app/auth.py).
 * Deux listes : celle du `.env` (AUTH_ALLOWED_EMAILS, accès de secours, lecture seule ici) et celle éditée ici
 * (table server_secret, jamais exportée). Le serveur refuse une liste qui retirerait l'accès à celui qui l'écrit.
 * Contrat : `accessSectionHtml()` + `wireAccessSection(container)` ; contenu chargé à l'ouverture (route dédiée).
 */

import { esc, toast } from '../utils.js';
import * as api from '../api.js';

const _list = (emails, cls) => emails.length
    ? `<div class="acc-chips">${emails.map(e => `<span class="chip chip-sm ${cls}">${esc(e)}</span>`).join('')}</div>`
    : '<p class="text-muted text-sm">Aucun</p>';

function _bodyHtml(a) {
    const state = a.required
        ? '<p class="acc-state acc-state--on">🔒 <b>Connexion obligatoire</b> — seuls les comptes ci-dessous ouvrent Squad Board.</p>'
        : '<p class="acc-state acc-state--off">🔓 <b>Porte ouverte</b> — tout le monde accède sans connexion (AUTH_REQUIRED=false dans le .env).</p>';
    return `${state}
        ${a.me ? `<p class="text-sm">Connecté en tant que <b>${esc(a.me)}</b>.</p>` : ''}
        <div class="sync-cfg-block">
            <div class="sync-cfg-title">🛟 Accès de secours (.env)</div>
            <p class="text-xs text-muted">Toujours autorisés, modifiables seulement dans le fichier <code>.env</code> du serveur (AUTH_ALLOWED_EMAILS).</p>
            ${_list(a.envEmails, 'acc-chip--env')}
        </div>
        <div class="sync-cfg-block">
            <div class="sync-cfg-title">👥 Comptes autorisés</div>
            <p class="text-xs text-muted">Un e-mail par ligne : l'adresse du compte Google ou Infomaniak de la personne. Pris en compte en 15 s, sans redémarrage.</p>
            <textarea class="input" id="acc-emails" rows="6" placeholder="prenom.nom@entreprise.fr" spellcheck="false">${esc(a.emails.join('\n'))}</textarea>
            <div class="flex gap-2 mt-2"><button type="button" class="btn btn-primary btn-sm" id="acc-save">Enregistrer</button></div>
        </div>`;
}

export function accessSectionHtml() {
    return `
        <div class="settings-section" id="section-acces">
            <div class="settings-section-header"><div><h3>Accès</h3><p>Connexion SSO BastaVerse : qui peut ouvrir Squad Board</p></div></div>
            <div class="settings-section-body" id="acc-body"><p class="text-muted text-sm">Chargement…</p></div>
        </div>`;
}

async function _load(body) {
    try {
        body.innerHTML = _bodyHtml(await api.getAccess());
    } catch (e) {
        body.innerHTML = `<p class="text-sm">Lecture impossible (${esc(e.message)}) — serveur à redémarrer ?</p>`;
    }
}

export function wireAccessSection(container) {
    const body = container.querySelector('#acc-body');
    if (!body) return;
    _load(body);
    body.addEventListener('click', async e => {
        if (!e.target.closest('#acc-save')) return;
        const emails = body.querySelector('#acc-emails').value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
        try {
            const j = await api.putAccess(emails);
            toast(`${j.emails.length} compte${j.emails.length > 1 ? 's' : ''} autorisé${j.emails.length > 1 ? 's' : ''}`, 'success');
            _load(body);
        } catch (err) { toast(err.message, 'error'); }
    });
}
