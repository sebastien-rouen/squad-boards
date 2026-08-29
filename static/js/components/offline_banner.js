/**
 * Bandeau HORS LIGNE — « dernier état connu à HH:MM », jamais un écran vide.
 *
 * Deux signaux : le navigateur (`offline` / `online`) et l'API (`sb:api-offline` émis par
 * `request()` quand `fetch` lui-même échoue — pas un 4xx/5xx, une absence de réponse). Le
 * bandeau s'insère sous le topbar comme celui de synchro périmée, avec un « Réessayer » qui
 * sonde réellement l'API avant de disparaître : un `online` du navigateur ne prouve pas que le
 * serveur répond.
 */

const ID = 'offline-banner';
let _lastOk = null;

const _fmt = d => (d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null);

function _hide() { document.getElementById(ID)?.remove(); }

function _show(reason) {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    let el = document.getElementById(ID);
    if (!el) {
        el = document.createElement('div');
        el.id = ID;
        el.className = 'stale-banner stale-banner--offline';
        el.setAttribute('role', 'status');
        topbar.insertAdjacentElement('afterend', el);
    }
    el.innerHTML = '';
    const txt = document.createElement('span');
    txt.textContent = `📡 Hors ligne — ${reason}. Affichage du dernier état connu${_lastOk ? ` (${_fmt(_lastOk)})` : ''}.`;
    const actions = document.createElement('div');
    actions.className = 'stale-banner-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-secondary btn-sm';
    retry.textContent = 'Réessayer';
    retry.addEventListener('click', () => probe(true));
    actions.appendChild(retry);
    el.append(txt, actions);
}

/** Sonde l'API ; `manual` = clic sur Réessayer (redessine la vue si ça répond). */
export async function probe(manual = false) {
    try {
        const r = await fetch('/api/config', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        _lastOk = new Date();
        _hide();
        if (manual) window.__squadBoard?.rerenderView?.();
        return true;
    } catch {
        _show(navigator.onLine === false ? 'réseau coupé' : 'API injoignable');
        return false;
    }
}

export function initOfflineBanner() {
    if (window.__offlineBannerInit) return;
    window.__offlineBannerInit = true;
    window.addEventListener('offline', () => _show('réseau coupé'));
    window.addEventListener('online', () => probe(false));
    window.addEventListener('sb:api-offline', () => _show(navigator.onLine === false ? 'réseau coupé' : 'API injoignable'));
    window.addEventListener('sb:api-online', () => { _lastOk = new Date(); if (document.getElementById(ID)) _hide(); });
}
