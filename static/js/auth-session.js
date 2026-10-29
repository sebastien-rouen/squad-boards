/**
 * Session SSO BastaVerse côté navigateur (3.280.0) — sans SDK (seule la page de connexion le charge).
 *
 * Le commutateur vit SUR LE SERVEUR (`AUTH_REQUIRED`, lu par `GET /api/auth/status`, public) : le front ne
 * peut pas diverger de lui. La session est celle que le SDK PocketBase range dans `localStorage`
 * (`pocketbase_auth`) ; elle est recopiée dans le cookie `sb_session` (SameSite=Strict) pour que tout ce qui
 * ne porte pas d'en-tête — `<img>` des pièces jointes JIRA, `fetch` directs, liens — parte authentifié.
 * Vérification réelle : serveur (app/auth.py), auprès du hub. Ici, on écarte seulement un jeton expiré.
 */

const STORE_KEY = 'pocketbase_auth';
const COOKIE = 'sb_session';
const LOGIN = '/login.html';
const REFRESH_MS = 6 * 3600 * 1000;   // écran mural (TV) : la session est prolongée tant que la page vit

let _status = null;

/** `{ required, hub }` — mis en cache pour la page. Serveur injoignable → porte ouverte côté front (l'API refusera). */
export async function authStatus() {
    if (_status) return _status;
    try {
        const r = await fetch('/api/auth/status', { cache: 'no-store' });
        _status = r.ok ? await r.json() : { required: false, hub: '' };
    } catch { _status = { required: false, hub: '' }; }
    try { (await import('./state.js')).store.set('authStatus', _status); } catch { /* hors application (page de connexion) */ }
    return _status;
}

function _payload(token) {
    try {
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent([...atob(b64)].map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
    } catch { return null; }
}

/** `{ token, record }` d'une session encore valide, sinon null. */
export function readSession() {
    let parsed;
    try { parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
    const token = parsed?.token;
    const record = parsed?.record || parsed?.model;
    if (!token || !record) return null;
    const exp = _payload(token)?.exp;
    if (exp && exp * 1000 <= Date.now()) return null;
    return { token, record, exp };
}

/** Recopie le jeton dans le cookie (ou l'efface). Secure dès que la page est en https. */
export function syncCookie(token) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    const exp = token ? _payload(token)?.exp : 0;
    const maxAge = token ? Math.max(60, Math.floor((exp ? exp * 1000 - Date.now() : 86400000) / 1000)) : 0;
    document.cookie = `${COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}

/** Prolonge la session auprès du hub (même appel que le SDK) ; échec silencieux, l'API dira 401. */
async function _refresh(hub) {
    const s = readSession();
    if (!s || !hub) return;
    try {
        const r = await fetch(`${hub}/api/collections/users/auth-refresh`, { method: 'POST', headers: { Authorization: s.token } });
        if (!r.ok) return;
        const j = await r.json();
        if (!j?.token) return;
        localStorage.setItem(STORE_KEY, JSON.stringify({ token: j.token, record: j.record || s.record }));
        syncCookie(j.token);
    } catch { /* hub momentanément injoignable : on réessaiera */ }
}

/** Vers la page de connexion, en gardant la destination (chemin RELATIF uniquement, cf. login.js). */
export function goLogin(reason = '') {
    const target = location.pathname + location.search + location.hash;
    const url = new URL(LOGIN, location.origin);
    if (target !== '/' && target !== '/index.html') url.searchParams.set('redirect', target);
    if (reason) url.searchParams.set('reason', reason);
    location.replace(url.toString());
}

/**
 * À appeler AVANT le premier appel à l'API. Renvoie false si la page part vers la connexion.
 * Porte ouverte : ne fait rien (le cookie éventuel est simplement ignoré par le serveur).
 */
export async function ensureAuth() {
    const st = await authStatus();
    if (!st.required) return true;
    const s = readSession();
    if (!s) { syncCookie(null); goLogin(); return false; }
    syncCookie(s.token);
    // Nom affiché (poker, frise, synchro) : celui du compte quand rien n'est saisi — le serveur signe de toute façon
    try { if (!localStorage.getItem('sb-poker-myname')) localStorage.setItem('sb-poker-myname', s.record.name || (s.record.email || '').split('@')[0]); } catch { /* stockage bloqué */ }
    setInterval(() => _refresh(st.hub), REFRESH_MS);
    return true;
}

/** Réponse 401 de l'API alors que la porte est fermée : session expirée ou révoquée. */
export async function onUnauthorized() {
    if (!(await authStatus()).required) return;
    try { localStorage.removeItem(STORE_KEY); } catch { /* stockage indisponible */ }
    syncCookie(null);
    goLogin('expired');
}

export function currentUser() { return readSession()?.record || null; }

export function logout() {
    try { localStorage.removeItem(STORE_KEY); } catch { /* stockage indisponible */ }
    syncCookie(null);
    location.replace(LOGIN);
}

/** Bouton de compte du pied de sidebar (index.html) : nom de la session, clic = déconnexion confirmée. */
export function initAccountButton() {
    const u = currentUser();
    const btn = document.getElementById('btn-account');
    if (!u || !btn) return;
    btn.hidden = false;
    document.getElementById('account-name').textContent = u.name || (u.email || '').split('@')[0] || 'Compte';
    btn.dataset.tooltip = `${u.email || ''} — se déconnecter`;
    btn.addEventListener('click', async () => {
        const { confirmDanger } = await import('./utils.js');
        if (await confirmDanger('Se déconnecter', 'La session SSO de ce navigateur sera fermée.', { confirmLabel: 'Se déconnecter', danger: false })) logout();
    });
}
