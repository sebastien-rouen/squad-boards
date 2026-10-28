/**
 * Page de connexion SSO (3.280.0) — adaptée de backlog/assets/js/pages/login.js (skill /auth-sso).
 *
 * Fournisseurs lus sur le hub (jamais une liste en dur), connexion par le SDK PocketBase 0.27.0 (aligné sur le
 * serveur du hub), puis jeton recopié dans le cookie `sb_session` et compte confirmé par le SERVEUR
 * (`/api/auth/me` : liste blanche `AUTH_ALLOWED_EMAILS`, une seule source). Retour vers `?redirect=` (relatif).
 */
import { authStatus, readSession, syncCookie } from './auth-session.js';

const PB_SDK_URL = 'https://cdn.jsdelivr.net/npm/pocketbase@0.27.0/dist/pocketbase.es.mjs';
const PROVIDER_ICONS = { google: '🔵', oidc: '🟣', oidc2: '🟣', oidc3: '🟣', github: '⚫' };
const NOTICES = { expired: 'Session expirée — reconnecte-toi pour continuer.' };

const $ = id => document.getElementById(id);
const providersEl = $('providers'), fallbackEl = $('fallback'), formEl = $('password-form');
const submitEl = $('password-submit'), errorEl = $('login-error'), cardEl = $('login-card');

// Thème du site (même clé que state.js), avant tout rendu visible
try { if (localStorage.getItem('sb-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { /* stockage bloqué */ }

let _pb = null;
async function client() {
    if (_pb) return _pb;
    const { hub } = await authStatus();
    const PocketBase = (await import(PB_SDK_URL)).default;   // toujours NOTRE SDK, jamais un window.PocketBase
    _pb = new PocketBase(hub);
    return _pb;
}

/** Destination : chemin RELATIF à ce site uniquement (sinon tremplin de redirection vers un domaine tiers). */
function destination() {
    const raw = new URLSearchParams(location.search).get('redirect');
    return !raw || !raw.startsWith('/') || raw.startsWith('//') ? '/' : raw;
}

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    cardEl.classList.remove('login-card--shake');
    void cardEl.offsetWidth;   // reflow : relance l'animation
    cardEl.classList.add('login-card--shake');
}

function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.classList.toggle('is-busy', busy);
    (btn.querySelector('.login-provider-label') || btn).textContent = label;
}

/** Le serveur accepte-t-il ce compte ? 403 = hors liste blanche → session effacée aussitôt. */
async function confirmWithServer(pb) {
    syncCookie(pb.authStore.token);
    const r = await fetch('/api/auth/me', { cache: 'no-store' });
    if (r.ok) return;
    pb.authStore.clear();
    syncCookie(null);
    const e = new Error(r.status === 403 ? 'Ce compte n\'est pas autorisé sur Squad Board.' : 'Le serveur a refusé la session.');
    e.code = 'NOT_ALLOWED';
    throw e;
}

function succeed() {
    cardEl.classList.add('login-card--success');
    setTimeout(() => location.replace(destination()), 420);
}

function describe(error, providerLabel) {
    if (error?.code === 'NOT_ALLOWED') return error.message;
    const raw = String(error?.message || '');
    if (/popup|window|closed|abort/i.test(raw)) return 'Connexion interrompue — la fenêtre a été fermée, ou le navigateur a bloqué la popup.';
    if (error?.status === 400 || /failed to authenticate/i.test(raw)) {
        return providerLabel ? `${providerLabel} a refusé la connexion. Vérifie la configuration OAuth2.` : 'E-mail ou mot de passe incorrect.';
    }
    if (/fetch|network/i.test(raw)) return 'Le service de connexion est injoignable. Réessaie dans un instant.';
    return 'Connexion impossible pour le moment.';
}

async function login(run, btn, idle, providerLabel) {
    errorEl.hidden = true;
    setBusy(btn, true, 'Connexion…');
    try {
        const pb = await client();
        await run(pb);
        await confirmWithServer(pb);
        succeed();
    } catch (error) {
        setBusy(btn, false, idle);
        showError(describe(error, providerLabel));
    }
}

function renderProviders(providers) {
    providersEl.replaceChildren();
    if (!providers.length) {
        const p = document.createElement('p');
        p.className = 'login-hint';
        p.textContent = 'Aucun fournisseur SSO configuré.';
        providersEl.append(p);
        return;
    }
    providers.forEach((prov, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'login-provider';
        btn.style.setProperty('--stagger', `${i * 70}ms`);   // propriété personnalisée : délai d'apparition
        const icon = document.createElement('span');
        icon.className = 'login-provider-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = PROVIDER_ICONS[prov.name] || '🔑';
        const label = document.createElement('span');
        label.className = 'login-provider-label';
        const idle = `Continuer avec ${prov.label}`;
        label.textContent = idle;
        btn.append(icon, label);
        btn.addEventListener('click', () => login(pb => pb.collection('users').authWithOAuth2({ provider: prov.name }), btn, idle, prov.label));
        providersEl.append(btn);
    });
}

async function start() {
    const st = await authStatus();
    // Porte ouverte, ou déjà connecté : rien à faire ici — sauf `?test` (essai de la connexion AVANT d'armer)
    if (!new URLSearchParams(location.search).has('test') && (!st.required || readSession())) { location.replace(destination()); return; }
    const reason = NOTICES[new URLSearchParams(location.search).get('reason')];
    if (reason) { $('login-notice').textContent = reason; $('login-notice').hidden = false; }
    formEl.addEventListener('submit', e => {
        e.preventDefault();
        const email = $('email').value.trim(), password = $('password').value;
        if (!email || !password) { showError('E-mail et mot de passe sont requis.'); return; }
        login(pb => pb.collection('users').authWithPassword(email, password), submitEl, 'Se connecter');
    });
    try {
        const pb = await client();
        const m = await pb.collection('users').listAuthMethods();
        const raw = m?.oauth2?.providers || m?.authProviders || [];
        renderProviders(raw.map(p => ({ name: p.name, label: p.displayName || p.name })));
        fallbackEl.hidden = !(m?.password?.enabled ?? m?.emailPassword ?? true);
        if (!raw.length && fallbackEl.hidden) showError('Aucune méthode de connexion n\'est configurée sur le hub.');
    } catch {
        providersEl.replaceChildren();
        showError('Fournisseurs indisponibles — le service de connexion ne répond pas.');
        fallbackEl.hidden = false;   // c'est exactement le cas que couvre le repli
        fallbackEl.open = true;
    }
}

start();
