/**
 * Formulaires de création et de modification d'un ticket (champs à chips, sélecteurs, contributeurs).
 *
 * Extrait de modal.js (3.253.0, > 2 900 lignes) — code déplacé à l'identique. Les dépendances vers
 * modal.js sont CIRCULAIRES mais sans effet au chargement (appelées dans des fonctions seulement) :
 * ne jamais utiliser un import de ./modal.js au niveau racine du module.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast } from '../utils.js';
import { STATUS_LABELS, STATUS_ORDER, TYPE_LABELS, TYPE_ICONS } from '../config.js';
import { avatar, bodyEl, closeModal, getMemberNames, personChip, refreshData, showModal, titleEl } from './modal.js';
import { _labelChipEl, _makeChipPicker, _makeEpicPicker, _makeLabelPicker, _makePersonPicker, _pushRecentEpic } from './ticket_pickers.js';

// ══════════════════════════════════════════════════════════════════════════════
// Contributors multi-select
// ══════════════════════════════════════════════════════════════════════════════
function contribFieldHtml(selected = []) {
    const members = getMemberNames();
    return `
        <div id="contributors-field">
            <div class="flex gap-1 flex-wrap mb-1" id="contrib-chips">
                ${selected.map(c => `<span class="chip chip-gap">${esc(c)} <button type="button" class="contrib-remove-btn" data-name="${esc(c)}">&times;</button></span>`).join('')}
            </div>
            <select class="select" id="contrib-add-select">
                <option value="">+ Contributeur</option>
                ${members.filter(m => !selected.includes(m)).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
            </select>
            <input type="hidden" name="contributors" value='${JSON.stringify(selected)}'>
        </div>
    `;
}

function wireContrib(container) {
    const field = container.querySelector('#contributors-field');
    if (!field) return;
    const getS = () => JSON.parse(field.querySelector('input[name="contributors"]').value || '[]');
    const setS = list => field.querySelector('input[name="contributors"]').value = JSON.stringify(list);

    field.addEventListener('click', e => {
        const btn = e.target.closest('.contrib-remove-btn');
        if (!btn) return;
        e.preventDefault();
        setS(getS().filter(c => c !== btn.dataset.name));
        btn.closest('.chip')?.remove();
        const sel = field.querySelector('#contrib-add-select');
        const opt = document.createElement('option'); opt.value = btn.dataset.name; opt.textContent = btn.dataset.name;
        sel.appendChild(opt);
    });

    field.querySelector('#contrib-add-select')?.addEventListener('change', e => {
        const name = e.target.value; if (!name) return;
        const s = getS(); if (!s.includes(name)) { s.push(name); setS(s);
            const chip = document.createElement('span'); chip.className = 'chip chip-gap';
            chip.innerHTML = `${esc(name)} <button type="button" class="contrib-remove-btn" data-name="${esc(name)}">&times;</button>`;
            field.querySelector('#contrib-chips').appendChild(chip);
        }
        e.target.querySelector(`option[value="${CSS.escape(name)}"]`)?.remove();
        e.target.value = '';
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// Create Ticket
// ══════════════════════════════════════════════════════════════════════════════

const PRIORITY_CFG = [
    { val:'low',      label:'↓ Faible'   },
    { val:'medium',   label:'○ Moyen'    },
    { val:'high',     label:'↑ Élevé'    },
    { val:'critical', label:'⚡ Critique' },
];
const PRESET_LABELS = ['tech-debt','retro','postmortem','cop','adapt','support','skill-up','urgent'];

function _chipSelGroup(name, items, defaultVal, extra = '', multi = false) {
    const itemRole = multi ? 'checkbox' : 'radio';
    const chips = items.map(({ val, label, cls }) => {
        const active = val === defaultVal;
        return `<button type="button" role="${itemRole}" aria-checked="${active}" class="chip-sel ${cls || `chip-sel--${val}`}${active ? ' is-active' : ''}" data-val="${val}">${label}</button>`;
    }).join('');
    const groupRole = multi ? 'group' : 'radiogroup';
    return `<div class="chip-sel-group" role="${groupRole}" data-name="${name}">${chips}</div><input type="hidden" name="${name}" value="${defaultVal}">${extra}`;
}

function _wireChipGroup(container, name, single = true, onChange) {
    const group  = container.querySelector(`.chip-sel-group[data-name="${name}"]`);
    const hidden = container.querySelector(`input[name="${name}"]`);
    if (!group) return;
    group.querySelectorAll('.chip-sel').forEach(chip => {
        chip.addEventListener('click', () => {
            if (single) {
                group.querySelectorAll('.chip-sel').forEach(c => { c.classList.remove('is-active'); c.setAttribute('aria-checked', 'false'); });
                chip.classList.add('is-active');
            } else {
                chip.classList.toggle('is-active');
            }
            chip.setAttribute('aria-checked', chip.classList.contains('is-active'));
            if (hidden && single) hidden.value = chip.dataset.val;
            if (onChange) onChange(chip.dataset.val, chip.classList.contains('is-active'));
        });
    });
}

/**
 * Ouvre un picker inline dans un conteneur de champ de formulaire (création).
 * Réutilise les pickers de l'édition (avatars, autocomplete, couleurs d'équipe)
 * mais SANS sauvegarde API : la valeur est tenue dans un input caché jusqu'au submit.
 *
 * @param trigger  élément cliquable affichant la valeur courante (.form-picker-trigger)
 * @param hidden   input[type=hidden] mis à jour à la sélection
 * @param makePicker (current, onCommit, onCancel) → { wrap, input } | wrap
 * @param renderDisplay (value) → HTML affiché dans le trigger
 * @param onChange  callback optionnel (value) après commit
 */
function _wireFormPicker(trigger, hidden, makePicker, renderDisplay, onChange) {
    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
    });
    trigger.addEventListener('click', () => {
        if (trigger.querySelector('.person-picker, .epic-picker, .chip-picker')) return;
        const orig = trigger.innerHTML;
        const restore = () => { trigger.innerHTML = orig; };
        const onCommit = (val) => {
            cleanup();
            hidden.value = val == null ? '' : val;
            trigger.innerHTML = renderDisplay(hidden.value);
            if (onChange) onChange(hidden.value);
        };
        const onCancel = () => { cleanup(); restore(); };
        const built = makePicker(hidden.value, onCommit, onCancel);
        const wrap  = built.wrap || built;
        const input = built.input;
        trigger.innerHTML = '';
        trigger.appendChild(wrap);
        if (input) requestAnimationFrame(() => input.focus());
        const onDocClick = (ev) => { if (!wrap.contains(ev.target)) onCancel(); };
        const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    });
}

export function openCreateModal(defaults = {}) {
    const epics   = store.get('epics') || [];
    // Source des équipes avec couleur : teamObjects si dispo, sinon noms bruts (fallback)
    let teamObjs = store.get('teamObjects') || [];
    if (!teamObjs.length) {
        teamObjs = (store.get('teams') || []).map(t => (typeof t === 'string' ? { name: t } : t));
    }
    const defaultType   = defaults.type   || 'story';
    const defaultStatus = defaults.status || 'todo';
    const defaultTeam   = defaults.team   || '';

    // Options d'équipe avec pastille de couleur (comme l'édition)
    const teamOptions = [
        { value: '', label: '— Aucune' },
        ...teamObjs.map(t => ({ value: t.name, label: t.name, dot: t.color })),
    ];
    const _teamColor = (name) => teamObjs.find(t => t.name === name)?.color || 'var(--text-muted)';
    // Rendus d'affichage des triggers
    const teamDisplay = (val) => val
        ? `<span class="inline-flex-center"><span class="form-picker-dot" style="background:${esc(_teamColor(val))}"></span><span>${esc(val)}</span></span>`
        : `<span class="text-muted">— Choisir une équipe</span>`;
    const personDisplay = (val) => val
        ? personChip(val, 'leader')
        : `<span class="text-muted">Non assigné</span>`;
    const epicDisplay = (val) => {
        if (!val) return `<span class="text-muted">Aucun</span>`;
        const e = epics.find(x => x.id === val);
        return `<span class="inline-flex-center"><span class="epic-picker-key">${esc(val)}</span> <span>${esc(e?.title || '')}</span></span>`;
    };

    const typeItems     = Object.entries(TYPE_LABELS).map(([val, label]) => ({ val, label: `${TYPE_ICONS[val] || ''} ${label}` }));
    const priorityItems = PRIORITY_CFG.map(p => ({ val: p.val, label: p.label }));
    const pointsItems   = [0,1,2,3,5,8,13,21].map(p => ({ val: String(p), label: p === 0 ? '–' : String(p), cls: 'chip-sel chip-sel--pts' }));
    const statusItems   = STATUS_ORDER.map(s => ({ val: s, label: STATUS_LABELS[s] }));

    titleEl().textContent = 'Nouveau ticket';
    bodyEl().innerHTML = `
        <form id="create-form" autocomplete="off">

            <div class="form-group" style="margin-bottom:var(--sp-3)">
                <input class="input" name="title" required placeholder="Intitulé du ticket…" autofocus
                       style="font-size:var(--fs-md);font-weight:var(--fw-medium);padding:10px 14px">
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Type</div>
                ${_chipSelGroup('type', typeItems, defaultType)}
            </div>

            <div class="form-row" style="gap:var(--sp-3);margin-bottom:var(--sp-3)">
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Priorité</div>
                    ${_chipSelGroup('priority', priorityItems, 'medium')}
                </div>
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Points (SP)</div>
                    ${_chipSelGroup('points', pointsItems, '0')}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Statut</div>
                ${_chipSelGroup('status', statusItems, defaultStatus)}
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Assignation</div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="label">Équipe</label>
                        <div class="form-picker-trigger" id="cs-team-trigger" tabindex="0" role="button">${teamDisplay(defaultTeam)}</div>
                        <input type="hidden" name="team" value="${esc(defaultTeam)}">
                    </div>
                    <div class="form-group">
                        <label class="label">Leader</label>
                        <div class="form-picker-trigger" id="cs-leader-trigger" tabindex="0" role="button">${personDisplay('')}</div>
                        <input type="hidden" name="leader" value="">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Contributors</label>
                    <div class="contrib-inline-wrap" id="cs-contrib-wrap">
                        <button type="button" class="btn btn-sm btn-secondary" id="cs-contrib-add-btn">+ Ajouter</button>
                    </div>
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Liens</div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Epic</label>
                    <div class="form-picker-trigger" id="cs-epic-trigger" tabindex="0" role="button">${epicDisplay('')}</div>
                    <input type="hidden" name="epic" value="">
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Labels</div>
                <div class="labels-inline-wrap" id="cs-labels-wrap"></div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Description</div>
                <div style="margin:0"><textarea class="input" name="description" rows="3" placeholder="Description optionnelle…"></textarea></div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="btn-cancel-create">Annuler</button>
                <button type="submit" class="btn btn-primary">Créer le ticket</button>
            </div>
        </form>
    `;

    // Wire radio chip groups
    ['type','priority','points','status'].forEach(name => _wireChipGroup(bodyEl(), name, true));

    const body       = bodyEl();
    const teamHidden = body.querySelector('input[name="team"]');
    const leadHidden = body.querySelector('input[name="leader"]');

    // ── Équipe : chip-picker avec pastilles de couleur ──────────────────────────
    _wireFormPicker(
        body.querySelector('#cs-team-trigger'),
        teamHidden,
        (current, onCommit) => _makeChipPicker(teamOptions, current, onCommit),
        teamDisplay
    );

    // ── Leader : person-picker (avatars) — même source que l'édition ────────────
    _wireFormPicker(
        body.querySelector('#cs-leader-trigger'),
        leadHidden,
        (current, onCommit, onCancel) => _makePersonPicker(getMemberNames(), current, onCommit, onCancel),
        personDisplay
    );

    // ── Epic : autocomplete (récents + tri alpha) ───────────────────────────────
    _wireFormPicker(
        body.querySelector('#cs-epic-trigger'),
        body.querySelector('input[name="epic"]'),
        (current, onCommit, onCancel) => _makeEpicPicker(epics, current, (id) => { if (id) _pushRecentEpic(id); onCommit(id); }, onCancel),
        epicDisplay
    );

    // ── Contributors : person-picker enchaîné (avatars), comme l'édition ────────
    const contribWrap = body.querySelector('#cs-contrib-wrap');
    const addBtn = body.querySelector('#cs-contrib-add-btn');
    const getContribs = () => Array.from(contribWrap.querySelectorAll('.contrib-rm')).map(b => b.dataset.name);
    contribWrap.addEventListener('click', e => {
        const rm = e.target.closest('.contrib-rm'); if (!rm) return;
        rm.closest('.chip')?.remove();
    });
    const _openContribPicker = () => {
        if (contribWrap.querySelector('.person-picker')) return;
        const current = getContribs();
        const allNames = getMemberNames().filter(m => !current.includes(m) && m !== leadHidden.value);
        if (!allNames.length) return;
        const onCommit = (name) => {
            cleanup();
            if (!name) return;
            const chip = document.createElement('span');
            chip.className = 'chip chip-gap';
            chip.innerHTML = `${avatar(name, false, 18)} ${esc(name)} <button type="button" class="contrib-rm" data-name="${esc(name)}" title="Retirer">×</button>`;
            contribWrap.insertBefore(chip, addBtn);
            requestAnimationFrame(_openContribPicker);  // enchaîne
        };
        const onCancel = () => { cleanup(); pickerWrap.remove(); };
        const { wrap: pickerWrap, input } = _makePersonPicker(allNames, '', onCommit, onCancel);
        pickerWrap.classList.add('person-picker--no-clear');
        contribWrap.insertBefore(pickerWrap, addBtn);
        requestAnimationFrame(() => input.focus());
        const onDocClick = (ev) => { if (!pickerWrap.contains(ev.target) && ev.target !== addBtn) onCancel(); };
        const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
        setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    };
    addBtn.addEventListener('click', _openContribPicker);

    // ── Labels : autocomplete (suggestions du store + frappe libre) ─────────────
    const labelsWrap = body.querySelector('#cs-labels-wrap');
    const getLabels = () => Array.from(labelsWrap.querySelectorAll('.label-rm')).map(b => b.dataset.label);
    labelsWrap.addEventListener('click', e => {
        const rm = e.target.closest('.label-rm'); if (!rm) return;
        rm.closest('.chip')?.remove();
    });
    const { wrap: labelPickerWrap } = _makeLabelPicker(
        getLabels(),
        (val) => {
            if (!val || getLabels().includes(val)) return;
            labelsWrap.insertBefore(_labelChipEl(val), labelPickerWrap);
        },
        () => {}
    );
    labelsWrap.appendChild(labelPickerWrap);

    body.querySelector('#btn-cancel-create')?.addEventListener('click', closeModal);

    body.querySelector('#create-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            title:        fd.get('title'),
            type:         fd.get('type'),
            status:       fd.get('status'),
            team:         fd.get('team'),
            leader:       fd.get('leader') || null,
            contributors: getContribs(),
            points:       parseInt(fd.get('points')) || 0,
            priority:     fd.get('priority'),
            epic:         fd.get('epic') || null,
            labels:       getLabels(),
            description:  fd.get('description'),
        };
        try {
            const fn = data.type === 'feature' ? api.createFeature : data.type === 'epic' ? api.createEpic : api.createTicket;
            await fn(data); await refreshData(); closeModal();
            toast('Créé', 'success'); window.__squadBoard.rerenderView?.();
        } catch (err) { toast(err.message, 'error'); }
    });
    showModal();
}

// ══════════════════════════════════════════════════════════════════════════════
// Edit Ticket
// ══════════════════════════════════════════════════════════════════════════════
export function openEditModal(ticket) {
    const teams        = store.get('teams') || [];
    const members      = store.get('members') || [];
    const epics        = store.get('epics') || [];
    const leader       = ticket.leader || ticket.assignee || '';
    const contributors = (ticket.contributors || []).filter(c => c && c !== leader);
    const ticketLabels = new Set(ticket.labels || []);

    const teamNames    = teams.map(t => (typeof t === 'string' ? t : t.name));
    const memberNames  = getMemberNames();

    const typeItems     = Object.entries(TYPE_LABELS).map(([val, label]) => ({ val, label: `${TYPE_ICONS[val] || ''} ${label}` }));
    const priorityItems = PRIORITY_CFG.map(p => ({ val: p.val, label: p.label }));
    const pointsItems   = [0,1,2,3,5,8,13,21].map(p => ({ val: String(p), label: p === 0 ? '–' : String(p), cls: 'chip-sel chip-sel--pts' }));
    const statusItems   = STATUS_ORDER.map(s => ({ val: s, label: STATUS_LABELS[s] }));

    // Build label chips (preset ∪ current ticket labels)
    const allLabelVals  = [...new Set([...PRESET_LABELS, ...ticketLabels])];
    const labelChipsHtml = allLabelVals.map(l =>
        `<button type="button" class="chip-sel chip-sel--label${ticketLabels.has(l) ? ' is-active' : ''}" data-val="${l}">${l}</button>`
    ).join('');

    titleEl().textContent = `Modifier ${ticket.id}`;
    bodyEl().innerHTML = `
        <form id="edit-form" autocomplete="off">

            <div class="form-group" style="margin-bottom:var(--sp-3)">
                <input class="input" name="title" required value="${esc(ticket.title)}" autofocus
                       style="font-size:var(--fs-md);font-weight:var(--fw-medium);padding:10px 14px">
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Type</div>
                ${_chipSelGroup('type', typeItems, ticket.type || 'story')}
            </div>

            <div class="form-row" style="gap:var(--sp-3);margin-bottom:var(--sp-3)">
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Priorité</div>
                    ${_chipSelGroup('priority', priorityItems, ticket.priority || 'medium')}
                </div>
                <div class="edit-section" style="margin:0">
                    <div class="edit-section-title">Points (SP)</div>
                    ${_chipSelGroup('points', pointsItems, String(ticket.points || 0))}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Statut</div>
                ${_chipSelGroup('status', statusItems, ticket.flagged ? 'blocked' : (ticket.status || 'todo'))}
                <label class="edit-checkbox-label" style="margin-top:var(--sp-2)">
                    <input type="checkbox" name="flagged" ${ticket.flagged?'checked':''}> 🚫 Marquer comme impédiment (bloqué)
                </label>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Assignation</div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="label">Équipe</label>
                        <select class="select w-full" name="team">
                            <option value="">—</option>
                            ${teamNames.map(t => `<option value="${esc(t)}"${t===ticket.team?' selected':''}>${esc(t)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="label">Leader</label>
                        <select class="select w-full" name="leader">
                            <option value="">Non assigné</option>
                            ${memberNames.map(m => `<option value="${esc(m)}"${m===leader?' selected':''}>${esc(m)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Contributors</label>
                    ${contribFieldHtml(contributors)}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Liens</div>
                <div class="form-group" style="margin-bottom:0">
                    <label class="label">Epic</label>
                    <select class="select w-full" name="epic">
                        <option value="">Aucun</option>
                        ${epics.map(e => `<option value="${esc(e.id)}"${e.id===ticket.epic?' selected':''}>${esc(e.id)} — ${esc(e.title)}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Labels</div>
                <div class="chip-sel-group" data-name="_labels_ui">${labelChipsHtml}</div>
                <div style="margin-top:var(--sp-2);display:flex;gap:var(--sp-2);align-items:center">
                    <input class="input" id="es-label-input" placeholder="+ Label personnalisé…" style="font-size:var(--fs-xs);flex:1">
                    <span class="text-xs text-muted">↵ pour ajouter</span>
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title">Description</div>
                <div style="margin:0"><textarea class="input" name="description" rows="4" placeholder="Description du ticket...">${esc(ticket.description||'')}</textarea></div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Annuler</button>
                <button type="submit" class="btn btn-primary">Enregistrer</button>
            </div>
        </form>
    `;

    // Wire radio chip groups
    ['type','priority','points','status'].forEach(name => _wireChipGroup(bodyEl(), name, true));

    // Wire label chips (multi-select)
    _wireChipGroup(bodyEl(), '_labels_ui', false);

    // Custom label input
    const labelGroup = bodyEl().querySelector('.chip-sel-group[data-name="_labels_ui"]');
    bodyEl().querySelector('#es-label-input')?.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const raw = e.target.value.trim().replace(/\s+/g, '-').toLowerCase();
        if (!raw) return;
        const existing = labelGroup?.querySelector(`.chip-sel[data-val="${CSS.escape(raw)}"]`);
        if (existing) { existing.classList.add('is-active'); }
        else if (labelGroup) {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'chip-sel chip-sel--label is-active'; btn.dataset.val = raw; btn.textContent = raw;
            btn.setAttribute('role', 'checkbox'); btn.setAttribute('aria-checked', 'true');
            btn.addEventListener('click', () => { const on = btn.classList.toggle('is-active'); btn.setAttribute('aria-checked', on); });
            labelGroup.appendChild(btn);
        }
        e.target.value = '';
    });

    wireContrib(bodyEl());
    bodyEl().querySelector('#btn-cancel-edit')?.addEventListener('click', closeModal);

    bodyEl().querySelector('#edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const selectedLabels = [...(labelGroup?.querySelectorAll('.chip-sel.is-active') || [])].map(c => c.dataset.val);
        const data = {
            title:        fd.get('title'),
            type:         fd.get('type'),
            status:       fd.get('status'),
            team:         fd.get('team'),
            leader:       fd.get('leader') || null,
            contributors: JSON.parse(fd.get('contributors') || '[]'),
            points:       parseInt(fd.get('points')) || 0,
            priority:     fd.get('priority'),
            epic:         fd.get('epic') || null,
            labels:       selectedLabels,
            flagged:      !!fd.get('flagged'),
            description:  fd.get('description'),
        };
        try {
            const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
            await fn(ticket.id, data); await refreshData(); closeModal();
            toast('Mis à jour', 'success'); window.__squadBoard.rerenderView?.();
        } catch (err) { toast(err.message, 'error'); }
    });
    showModal();
}
