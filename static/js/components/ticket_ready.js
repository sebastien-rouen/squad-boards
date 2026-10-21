/**
 * ✨ « Prêt à estimer ? » — guide animé de la fiche ticket (3.241.0, modale `openTicketModal`, modal.js).
 *
 * Une bande en tête de fiche liste ce qui MANQUE pour estimer le ticket (Definition of Ready allégée) :
 *   📝 description · ✅ critères d'acceptation (STORY seulement, même repérage que l'Affinage et le Poker :
 *   `acceptanceStatus`, desc_sections.js) · 🧩 feature parente · 👤 porteur · 🃏 estimation.
 * « Guide-moi » (ou clic sur une puce) lance le pas-à-pas : le champ est mis en lumière (halo animé), une flèche
 * rebondit au-dessus, une bulle dit quoi faire. Clic sur le champ ou « Remplir » = l'éditeur du champ s'ouvre.
 * Champ rempli → puce cochée avec une gerbe d'étincelles, passage au suivant ; tout est prêt → 🎉.
 *
 * ⚠️ La fiche se RE-REND après la plupart des éditions (`openTicketModal` rappelle `mountReadyGuide`) mais PAS
 * après la description (édition en place) : l'abonnement `store.on('tickets')` réévalue en place. État du guide
 * = module (`_g`, par ticket) ; calque flèche + bulle = `position: fixed` sur body, suivi par rAF tant que le
 * champ est visible — modale fermée, tout est retiré. Styles : css/views/ticket-ready.css.
 */
import { store } from '../state.js';
import { esc, parseWikiMarkup, scrollToEl } from '../utils.js';
import { acceptanceStatus } from './desc_sections.js';

const _reduce = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const _ACCEPT_TPL = '<h3>Critères d\'acceptation</h3><ul><li>Étant donné …, quand …, alors …</li></ul>';

/** Points de contrôle, dans l'ordre du guide. `sel` = champ mis en lumière, `act` = ouvrir son éditeur. */
const _CHECKS = [
    { key: 'desc', icon: '📝', label: 'Description', sel: '#desc-wrap',
      tip: 'Décris le besoin : contexte, objectif, ce qui change pour l\'utilisateur.',
      ok: (t, acc) => acc !== 'empty', act: body => body.querySelector('#desc-edit-btn')?.click() },
    { key: 'accept', icon: '✅', label: 'Critères d\'acceptation', sel: '#desc-wrap',
      tip: 'Ajoute une section « Critères d\'acceptation » : un modèle Étant donné / quand / alors est inséré.',
      applies: t => t.type === 'story', ok: (t, acc) => acc === 'ok',
      act: body => {
          body.querySelector('#desc-edit-btn')?.click();
          requestAnimationFrame(() => {
              const ed = body.querySelector('#desc-content');
              if (!ed || /crit[eè]res? d.acceptation/i.test(ed.textContent)) return;
              ed.insertAdjacentHTML('beforeend', _ACCEPT_TPL);   // modèle statique, aucune donnée saisie
              const li = ed.querySelector('li:last-child');
              const r = document.createRange(); r.selectNodeContents(li);
              const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
          });
      } },
    { key: 'parent', icon: '🧩', label: 'Feature parente', sel: '.mdl-crumb-parent',
      tip: 'Rattache le ticket à sa feature : il comptera dans l\'avancement du PI.',
      ok: t => !!t.epic, act: body => body.querySelector('.mdl-crumb-parent')?.click() },
    { key: 'leader', icon: '👤', label: 'Porteur', sel: '.mdl-people [data-field="leader"]',
      tip: 'Qui porte le sujet ? Un nom évite le ticket orphelin.',
      ok: t => !!(t.leader || t.assignee), act: body => body.querySelector('.mdl-people [data-field="leader"]')?.click() },
    { key: 'points', icon: '🃏', label: 'Estimation', sel: '.mdl-prop--points',
      tip: 'Dernière étape : lance un Planning Poker avec l\'équipe (ou saisis les points).',
      ok: t => Number(t.points) > 0, act: body => body.querySelector('#mdl-poker-btn')?.click() },
];

let _g = { id: null, active: false, key: null, done: null, shown: null };   // guide en cours (par ticket) ; `done` = cochés connus, `shown` = étape déjà amenée à l'écran
let _layer = null, _raf = 0, _unsub = null, _spot = null, _spotClick = null;

/**
 * Points de contrôle d'un ticket (MÊME calcul pour la bande de la fiche et le badge ✨ de la file d'Affinage).
 * @param {object} t
 * @param {'ok'|'empty'|'missing'} [acc]  état des critères déjà calculé par l'appelant (cache de l'Affinage)
 * @returns {{ key, icon, label, done: boolean }[]}
 */
export function readyChecks(t, acc) {
    if (acc == null) {
        const raw = String(t.description || '');
        acc = acceptanceStatus(raw.trim().startsWith('<') ? raw : parseWikiMarkup(raw));
    }
    return _CHECKS.filter(c => !c.applies || c.applies(t)).map(c => ({ ...c, done: !!c.ok(t, acc) }));
}
const _status = t => readyChecks(t);

/** Arme le guide pour la PROCHAINE ouverture de ce ticket (Affinage, étape « Compléter ») : il démarre seul. */
export function armReadyGuide(id) { _g = { id, active: true, key: null, done: null, shown: null }; }

function _barHtml(items) {
    const done = items.filter(i => i.done).length;
    const pct = Math.round(done / items.length * 100);
    const all = done === items.length;
    return `<div class="dor-ring" style="--p:${pct}" aria-hidden="true"><b>${done}/${items.length}</b></div>
        <div class="dor-main">
            <span class="dor-title">${all ? '🎉 Prêt à estimer !' : '✨ Prêt à estimer ?'}</span>
            <span class="dor-chips">${items.map(i => `<button type="button" class="dor-chip${i.done ? ' is-done' : ''}${_g.active && _g.key === i.key ? ' is-on' : ''}"
                data-dor="${i.key}" ${i.done ? 'disabled' : ''} title="${esc(i.done ? `${i.label} : renseigné` : `${i.label} — à remplir (cliquer pour y aller)`)}">
                <span aria-hidden="true">${i.done ? '✓' : i.icon}</span>${esc(i.label)}</button>`).join('')}</span>
        </div>
        ${all ? '' : `<button type="button" class="btn btn-primary btn-sm dor-go" data-dor-go>${_g.active ? '⏹ Arrêter' : '▶ Guide-moi'}</button>`}`;
}

function _clearSpot() {
    if (_spot && _spotClick) _spot.removeEventListener('click', _spotClick, true);
    _spot?.classList.remove('dor-spot');
    _spot = null; _spotClick = null;
}

function _teardown() {
    cancelAnimationFrame(_raf); _raf = 0;
    _clearSpot();
    _layer?.remove(); _layer = null;
}

/** Calque flèche + bulle, collé au champ (rAF) ; disparaît avec lui. */
function _follow() {
    cancelAnimationFrame(_raf);
    const tick = () => {
        if (!_spot || !_layer) return;
        if (!_spot.isConnected || !_spot.getClientRects().length) { _teardown(); return; }   // modale fermée / re-rendue
        const r = _spot.getBoundingClientRect();
        const arrow = _layer.querySelector('.dor-arrow'), tip = _layer.querySelector('.dor-tip');
        arrow.style.left = `${r.left + Math.min(r.width / 2, 120) - 16}px`;
        arrow.style.top = `${r.top - 46}px`;
        const below = r.bottom + tip.offsetHeight + 24 < innerHeight;
        tip.classList.toggle('is-above', !below);
        tip.style.left = `${Math.max(12, Math.min(r.left, innerWidth - tip.offsetWidth - 12))}px`;
        tip.style.top = `${below ? r.bottom + 14 : r.top - tip.offsetHeight - 54}px`;
        _layer.hidden = r.bottom < 0 || r.top > innerHeight;
        _raf = requestAnimationFrame(tick);
    };
    _raf = requestAnimationFrame(tick);
}

function _sparkle(el) {
    if (!el || _reduce()) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
        const s = document.createElement('span');
        s.className = `dor-spark dor-spark--${i % 3}`;
        s.style.left = `${r.left + r.width / 2}px`; s.style.top = `${r.top + r.height / 2}px`;
        document.body.appendChild(s);
        const a = (i / 12) * Math.PI * 2, d = 26 + Math.random() * 22;
        s.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }],
        { duration: 650, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'forwards' }).finished.finally(() => s.remove());
    }
}

function _focusStep(body, items) {
    _clearSpot();
    const it = items.find(i => i.key === _g.key);
    if (!it || it.done) { _teardown(); return; }
    const target = body.querySelector(it.sel);
    if (!target) { _teardown(); return; }
    _spot = target;
    target.classList.add('dor-spot');
    // Le champ lui-même devient le bouton : un clic ouvre son éditeur (la description ne s'ouvre pas sur son cadre)
    // (cadre de la description : le clic ouvre déjà l'éditeur ; pour les critères, on insère en plus le modèle)
    if (it.key === 'accept') {
        _spotClick = e => { if (!e.target.closest('#desc-editor')) { e.stopPropagation(); it.act(body); } };
        target.addEventListener('click', _spotClick, true);
    }
    if (_g.shown !== it.key) { _g.shown = it.key; scrollToEl(target, { block: 'center' }); }
    const todo = items.filter(i => !i.done);
    if (!_layer) {
        _layer = document.createElement('div');
        _layer.className = 'dor-layer';
        document.body.appendChild(_layer);
    }
    const n = todo.indexOf(it) + 1;
    _layer.innerHTML = `<svg class="dor-arrow" viewBox="0 0 32 40" aria-hidden="true"><path d="M16 2v28M5 20l11 13 11-13" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="dor-tip" role="dialog" aria-label="Guide : ${esc(it.label)}">
            <span class="dor-tip-step">Étape ${n} / ${todo.length}</span>
            <b class="dor-tip-title">${it.icon} ${esc(it.label)}</b>
            <p class="dor-tip-txt">${esc(it.tip)}</p>
            <span class="dor-tip-acts">
                <button type="button" class="btn btn-primary btn-sm" data-dor-act>✏️ Remplir</button>
                ${todo.length > 1 ? '<button type="button" class="btn btn-secondary btn-sm" data-dor-skip>Passer →</button>' : ''}
                <button type="button" class="btn-icon dor-tip-x" data-dor-stop aria-label="Arrêter le guide">×</button>
            </span>
        </div>`;
    _layer.onclick = e => {
        if (e.target.closest('[data-dor-act]')) it.act(body);
        else if (e.target.closest('[data-dor-skip]')) { _g.key = todo[(todo.indexOf(it) + 1) % todo.length].key; _refresh(body); }
        else if (e.target.closest('[data-dor-stop]')) { _g.active = false; _refresh(body); }
    };
    _follow();
}

let _body = null, _ticketId = null;
function _refresh(body = _body) {
    const t = (store.get('tickets') || []).find(x => x.id === _ticketId);
    const bar = body?.querySelector('.dor-bar');
    if (!t || !bar) { _teardown(); return; }
    const items = _status(t);
    // Champ fraîchement rempli (même après un re-rendu de la fiche) : étincelles sur sa puce, le guide avance
    bar.innerHTML = _barHtml(items);
    if (_g.done) items.filter(i => i.done && !_g.done.has(i.key)).forEach(i => _sparkle(bar.querySelector(`[data-dor="${i.key}"]`)));
    _g.done = new Set(items.filter(i => i.done).map(i => i.key));
    bar.classList.toggle('is-ready', items.every(i => i.done));
    if (_g.active && (items.find(i => i.key === _g.key)?.done ?? true)) _g.key = items.find(i => !i.done)?.key || null;
    if (!_g.key) _g.active = false;
    if (_g.active) _focusStep(body, items); else _teardown();
}

/**
 * Monte (ou remonte après re-rendu) la bande « Prêt à estimer ? » en tête du corps de la fiche.
 * @param {HTMLElement} body    corps de la modale (`bodyEl()`)
 * @param {object}      ticket
 */
export function mountReadyGuide(body, ticket) {
    _teardown(); _unsub?.(); _unsub = null;
    if (!body || !ticket || ticket.status === 'done' || ['epic', 'feature'].includes(ticket.type)) return;
    if (_g.id !== ticket.id) _g = { id: ticket.id, active: false, key: null, done: null, shown: null };
    const items = _status(ticket);
    if (items.every(i => i.done) && !_g.active) return;   // déjà prêt : rien à montrer
    _body = body; _ticketId = ticket.id;
    const bar = document.createElement('section');
    bar.className = 'dor-bar';
    bar.setAttribute('aria-label', 'Prêt à estimer ?');
    body.prepend(bar);
    bar.addEventListener('click', e => {
        const go = e.target.closest('[data-dor-go]'), chip = e.target.closest('[data-dor]');
        if (go) { _g.active = !_g.active; _g.key = _g.active ? (_status(store.get('tickets').find(x => x.id === _ticketId) || ticket).find(i => !i.done)?.key || null) : null; _refresh(); }
        else if (chip) { _g.active = true; _g.key = chip.dataset.dor; _refresh(); }
    });
    _refresh(body);
    _unsub = store.on('tickets', () => { if (_body?.isConnected && _body.querySelector('.dor-bar')) _refresh(); else { _unsub?.(); _unsub = null; _teardown(); } });
}
