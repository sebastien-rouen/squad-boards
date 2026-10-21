/**
 * Sections repliables à état retenu (3.237.0) — Dashboard d'abord (flux « Pilotage & flux » / « Équipe & risques »,
 * bandeau « Sprints du PI »). Un bouton ▾ est ajouté dans l'en-tête de chaque section trouvée ; l'état est gardé en
 * localStorage PAR PORTÉE (`scope`) : on replie la vue « toutes les équipes » (très longue) sans fermer celle d'une
 * équipe. Confort d'écran seulement — un stockage indisponible laisse tout ouvert.
 * Style : `.coll-btn`, `.is-collapsed` (css/views/page-toc.css).
 */

const _read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
const _write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* non retenu */ } };

/**
 * @param {HTMLElement} container
 * @param {object} o
 * @param {string} o.storageKey   clé localStorage (un objet { portée: { section: true } })
 * @param {string} o.scope        portée de l'état (ex. 'all' | 'team')
 * @param {{ key: string, sel: string, head: string, body: string, label: string }[]} o.items
 */
export function bindCollapsibles(container, { storageKey, scope, items }) {
    const all = _read(storageKey);
    const state = all[scope] || {};
    for (const it of items) {
        const sec = container.querySelector(it.sel);
        const head = sec?.querySelector(it.head);
        const body = sec?.querySelector(it.body);
        if (!head || !body || head.querySelector('.coll-btn')) continue;
        const id = `coll-${it.key}`;
        body.id = body.id || id;
        body.classList.add('coll-body');   // `[hidden]` respecté même si le corps est en grid / flex (page-toc.css)
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coll-btn';
        btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-chevron-down"/></svg>';
        btn.setAttribute('aria-controls', body.id);
        const apply = closed => {
            sec.classList.toggle('is-collapsed', closed);
            body.hidden = closed;
            btn.setAttribute('aria-expanded', String(!closed));
            btn.setAttribute('aria-label', `${closed ? 'Déplier' : 'Replier'} « ${it.label} »`);
            btn.title = closed ? 'Déplier' : 'Replier';
        };
        apply(!!state[it.key]);
        btn.addEventListener('click', () => {
            const closed = !sec.classList.contains('is-collapsed');
            apply(closed);
            const cur = _read(storageKey);
            cur[scope] = { ...(cur[scope] || {}), [it.key]: closed };
            _write(storageKey, cur);
        });
        head.appendChild(btn);
    }
}
