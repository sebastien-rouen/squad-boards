/**
 * Environnement navigateur minimal pour exécuter les modules front sous `node --test`.
 *
 * À importer EN PREMIER dans chaque suite : `state.js` lit `localStorage` dès son chargement,
 * donc les stubs doivent exister avant tout `import` de module applicatif (d'où les
 * `await import()` dynamiques dans les tests).
 *
 * ⚠️ `esc()` (utils/dom.js) passe par `document.createElement` + `textContent` → `innerHTML`.
 * Un faux élément qui n'échappe pas fait renvoyer une chaîne VIDE à `esc()` : tout le contenu
 * interpolé disparaît des rendus de test sans le moindre message d'erreur. Le stub ci-dessous
 * échappe donc réellement — ne pas le simplifier.
 */

const noop = () => {};

/** Élément factice dont `textContent = x` produit un `innerHTML` échappé, comme le vrai DOM. */
export function fauxElement(id = '') {
    const el = {
        id, innerHTML: '', value: '', disabled: false, isConnected: true,
        style: {}, dataset: {},
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        appendChild: noop, remove: noop, focus: noop, setAttribute: noop,
        addEventListener: noop, removeEventListener: noop,
        querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    };
    Object.defineProperty(el, 'textContent', {
        set(v) { el.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
        get() { return el.innerHTML; },
    });
    return el;
}

/** Stockage clé/valeur conforme à l'API Storage (length + key() inclus : `listPiCfgNumbers` les utilise). */
export function fauxStorage() {
    const mem = new Map();
    return {
        getItem: k => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => mem.set(k, String(v)),
        removeItem: k => mem.delete(k),
        clear: () => mem.clear(),
        key: i => [...mem.keys()][i] ?? null,
        get length() { return mem.size; },
    };
}

/**
 * Installe les globales. Renvoie de quoi piloter l'environnement dans les tests.
 * @param {object} [o.champs]  valeurs servies par `container.querySelector('#id').value`
 */
export function installerEnv({ champs = new Map() } = {}) {
    const storage = fauxStorage();
    globalThis.localStorage = storage;
    globalThis.sessionStorage = fauxStorage();
    globalThis.document = {
        getElementById: () => null,
        createElement: () => fauxElement(),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        body: fauxElement('body'),
        documentElement: fauxElement('html'),
        fullscreenElement: null,
    };
    globalThis.window = {
        location: { hash: '' },
        addEventListener: noop,
        matchMedia: () => ({ matches: false, addEventListener: noop }),
        __squadBoard: {},
        localStorage: storage,
        sessionStorage: globalThis.sessionStorage,
    };
    globalThis.requestAnimationFrame = noop;

    const requetes = [];
    globalThis.fetch = async (url, opts = {}) => {
        requetes.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
        return { ok: true, status: 200, json: async () => JSON.parse(opts.body || '{}') };
    };

    return { storage, requetes, champs };
}

/**
 * Conteneur factice qui enregistre les listeners posés — permet de déclencher un handler
 * sans DOM réel : `poses.find(p => p.id === 'btn-x').fn()`.
 */
export function fauxConteneur({ champs = new Map(), listesParSelecteur = {} } = {}) {
    const poses = [];
    const faire = (id) => {
        const el = fauxElement(id);
        el.value = champs.get(id) ?? '';
        el.dataset = { name: 'Equipe X', pi: '31' };
        el.addEventListener = (t, fn) => poses.push({ id, type: t, fn });
        return el;
    };
    return {
        poses,
        querySelector: sel => faire(sel.replace('#', '')),
        querySelectorAll: sel => (listesParSelecteur[sel] || []).map(faire),
    };
}
