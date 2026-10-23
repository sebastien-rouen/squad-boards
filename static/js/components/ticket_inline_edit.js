/**
 * Édition EN PLACE des champs de la popin ticket (statut, points, priorité, personnes, sprint, epic, étiquettes, contributeurs).
 *
 * Extrait de modal.js (3.253.0, > 2 900 lignes) — code déplacé à l'identique. Les dépendances vers
 * modal.js sont CIRCULAIRES mais sans effet au chargement (appelées dans des fonctions seulement) :
 * ne jamais utiliser un import de ./modal.js au niveau racine du module.
 */
import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, PRIORITY_META, pointsTone } from '../utils.js';
import { _sprintsHistoryOfTicket, avatar, getMemberNames, openTicketModal, refreshData } from './modal.js';
import { _openPokerModal } from './poker_modal.js';
import { _labelChipEl, _makeEpicPicker, _makeLabelPicker, _makePersonPicker, _openChipDropdown, _openChipPicker, _pushRecentEpic } from './ticket_pickers.js';

// ══════════════════════════════════════════════════════════════════════════════
// Inline field editors
// ══════════════════════════════════════════════════════════════════════════════
// Flash vert discret sur un élément après sauvegarde réussie
function _flashSaved(el) {
    if (!el) return;
    el.classList.add('mdl-field-saved');
    setTimeout(() => el?.classList.remove('mdl-field-saved'), 900);
}

export function _bindInlineEditors(container, ticket) {
    const apiSave = async (fields, flashEl) => {
        const fn = ticket.type === 'feature' ? api.updateFeature : ticket.type === 'epic' ? api.updateEpic : api.updateTicket;
        await fn(ticket.id, fields);
        if (flashEl) _flashSaved(flashEl);
        await refreshData();
    };

    // ── Title ─────────────────────────────────────────────────────────────────
    const titleSpan = document.getElementById('mdl-title-span');
    if (titleSpan) {
        titleSpan.addEventListener('click', () => {
            if (titleSpan.querySelector('input')) return;
            const orig = ticket.title;
            const inp = document.createElement('input');
            inp.type = 'text'; inp.value = orig; inp.className = 'mdl-title-input';
            titleSpan.innerHTML = ''; titleSpan.appendChild(inp);
            inp.focus(); inp.select();
            let done = false;
            const commit = async () => {
                if (done) return; done = true;
                const val = inp.value.trim() || orig;
                if (val === orig) { titleSpan.textContent = orig; return; }
                try { await apiSave({ title: val }); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); titleSpan.textContent = orig; }
            };
            inp.addEventListener('blur', commit);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
                if (e.key === 'Escape') { done = true; titleSpan.textContent = orig; }
            });
        });
    }

    // ── Chip pickers : priorité, points, équipe ──────────────────────────────
    // Libellés / niveaux : PRIORITY_META (utils/priority.js), même source que le badge de l'en-tête.
    const PRIO_COLORS = { critical: ['var(--danger)', 'var(--danger-bg)'], high: ['var(--warning)', 'var(--warning-bg)'], medium: ['var(--info)', 'var(--info-bg)'], low: ['var(--text-muted)', 'var(--bg-alt)'] };
    const PRIO_CFG = Object.fromEntries(Object.entries(PRIORITY_META).map(([k, m]) => [k, { label: m.label, color: PRIO_COLORS[k][0], bg: PRIO_COLORS[k][1] }]));
    const prioOptions = Object.entries(PRIO_CFG).map(([v, c]) => ({ value: v, label: c.label, color: c.color, bg: c.bg }));
    // Points : même palier de couleur que la pastille de l'en-tête (pointsTone → .pts-tone--*).
    const ptOptions   = [0,1,2,3,5,8,13,21].map(p => {
        const tone = pointsTone(p);
        return { value: String(p), label: p ? `${p}` : '—', cls: `chip-picker-opt--pts pts-tone--${tone.key}`, title: p ? `${tone.label}${tone.hint ? ` — ${tone.hint}` : ''}` : 'Non estimé' };
    });
    const teamObjs    = store.get('teamObjects') || [];
    const teamOptions = [
        { value: '', label: '— Aucune' },
        ...teamObjs.map(t => ({ value: t.name, label: t.name, dot: t.color })),
    ];

    container.querySelectorAll('[data-field]').forEach(el => {
        const field = el.dataset.field;

        // Type : géré via _openChipDropdown (clic sur le badge titre), câblé plus haut.

        if (field === 'flagged') {
            el.addEventListener('click', async () => {
                try { await apiSave({ flagged: el.dataset.value !== 'true' }); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            });
            return;
        }

        if (field === 'priority') {
            el.addEventListener('click', () => _openChipPicker(el, prioOptions, el.dataset.value, async (val) => {
                try { await apiSave({ priority: val }, el); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            }));
            return;
        }

        if (field === 'points') {
            el.addEventListener('click', () => {
                _openChipPicker(el, ptOptions, String(el.dataset.value || '0'), async (val) => {
                    try { await apiSave({ points: parseInt(val) || 0 }, el); openTicketModal(ticket.id); }
                    catch (err) { toast(err.message, 'error'); }
                });
                document.querySelector('.chip-picker--open')?.classList.add('chip-picker--nowrap');
            });
            return;
        }

        if (field === 'team') {
            el.addEventListener('click', () => _openChipPicker(el, teamOptions, el.dataset.value || '', async (val) => {
                try { await apiSave({ team: val || null }, el); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            }));
            return;
        }

        // Epic : picker custom autocomplete (récents + tri alpha) — pas dans OPTIONS
        if (field === 'epic') {
            el.addEventListener('click', e => {
                if (e.target.closest('.mdl-link-id')) return;
                if (el.querySelector('.epic-picker')) return;
                const orig = el.innerHTML;
                const current = el.dataset.value || '';
                const allEpics = store.get('epics') || [];
                const onCommit = async (id) => {
                    cleanup();
                    if (id) _pushRecentEpic(id);
                    try { await apiSave({ epic: id || null }); openTicketModal(ticket.id); }
                    catch (err) { toast(err.message, 'error'); el.innerHTML = orig; }
                };
                const onCancel = () => { cleanup(); el.innerHTML = orig; };
                const { wrap, input } = _makeEpicPicker(allEpics, current, onCommit, onCancel);
                el.innerHTML = '';
                el.appendChild(wrap);
                requestAnimationFrame(() => input.focus());
                const onDocClick = (ev) => { if (!wrap.contains(ev.target)) onCancel(); };
                const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
                setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
            });
            return;
        }

        // Leader / Reporter : picker autocomplete avec avatars
        if (field === 'leader' || field === 'reporter') {
            el.addEventListener('click', () => {
                if (el.querySelector('.person-picker')) return;
                const orig = el.innerHTML;
                const current = el.dataset.value || '';
                const allNames = getMemberNames();
                const fieldEl = el.closest('.mdl-field');
                const onCommit = async (name) => {
                    cleanup();
                    try { await apiSave({ [field]: name || null }, fieldEl); openTicketModal(ticket.id); }
                    catch (err) { toast(err.message, 'error'); el.innerHTML = orig; }
                };
                const onCancel = () => { cleanup(); el.innerHTML = orig; };
                const { wrap, input } = _makePersonPicker(allNames, current, onCommit, onCancel);
                el.innerHTML = '';
                el.appendChild(wrap);
                requestAnimationFrame(() => input.focus());
                const onDocClick = (ev) => { if (!wrap.contains(ev.target)) onCancel(); };
                const cleanup = () => document.removeEventListener('mousedown', onDocClick, true);
                setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
            });
            return;
        }

    });

    // ── Sprint éditable ───────────────────────────────────────────────────────
    const sprintEl = container.querySelector('#sprint-field');
    if (sprintEl) {
        sprintEl.addEventListener('click', () => {
            if (document.querySelector('.chip-picker--open')) return;
            // Sprints JIRA de l'équipe
            const allTeamSprints = (store.get('sprintInfo')?.teamSprints || [])
                .filter(s => s.team === ticket.team)
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
            // Sprints historiques du ticket (changelog) — pas nécessairement dans teamSprints
            const historicalSprints = _sprintsHistoryOfTicket(ticket).map(s => s.name);
            // Union des deux sources, dédupliquée
            const seen = new Set();
            const allNames = [
                ...allTeamSprints.map(s => ({ name: s.name, state: s.state })),
                ...historicalSprints.map(n => ({ name: n, state: 'closed' })),
            ].filter(s => { if (seen.has(s.name)) return false; seen.add(s.name); return true; })
             .slice(0, 14);
            const sprintOptions = [
                { value: '', label: '— Aucun sprint' },
                ...allNames.map(s => ({
                    value: s.name,
                    label: s.name,
                    color: s.state === 'active' ? 'var(--success)' : s.state === 'future' ? 'var(--primary)' : undefined,
                    bg:    s.state === 'active' ? 'color-mix(in srgb, var(--success) 10%, var(--surface))' : s.state === 'future' ? 'var(--primary-bg)' : undefined,
                })),
            ];
            // Toutes les valeurs courantes (sprint actif JIRA + sprints historiques)
            const currentValues = [...new Set([ticket.sprintName, ...historicalSprints].filter(Boolean))];
            const fieldEl = sprintEl.closest('.mdl-field, .mdl-prop');
            _openChipPicker(sprintEl, sprintOptions, currentValues, async (val) => {
                try { await apiSave({ sprintName: val || null }, fieldEl); openTicketModal(ticket.id); }
                catch (err) { toast(err.message, 'error'); }
            });
        });
    }

    // ── Contributors inline ───────────────────────────────────────────────────
    const contribWrap = container.querySelector('#contrib-inline-wrap');
    if (contribWrap) {
        const getNames = () => Array.from(contribWrap.querySelectorAll('.contrib-rm')).map(b => b.dataset.name);
        const saveC = async () => { try { await apiSave({ contributors: getNames() }); } catch (err) { toast(err.message, 'error'); } };

        // Retrait d'un contributeur
        contribWrap.addEventListener('click', async e => {
            const btn = e.target.closest('.contrib-rm'); if (!btn) return;
            btn.closest('.chip').remove();
            // Sa bande de présence part avec lui
            container.querySelectorAll('.mdl-contrib-pres').forEach(r => { if (r.dataset.name === btn.dataset.name) r.remove(); });
            await saveC();
        });

        // Bouton + Ajouter → ouvre le person picker ; un choix ferme le sélecteur (liste comprise), enregistre,
        // puis re-rend la popin pour afficher la présence (congés) du nouveau contributeur (3.255.0).
        const addBtn = contribWrap.querySelector('#contrib-add-btn');
        if (addBtn) {
            const _openContribPicker = () => {
                if (contribWrap.querySelector('.person-picker')) return;
                const current = getNames();
                const allNames = getMemberNames().filter(m => !current.includes(m) && m !== (ticket.leader || ticket.assignee));
                if (!allNames.length) return;
                const onCommit = async (name) => {
                    cleanup();
                    // Le sélecteur ET sa liste de résultats partent tout de suite (avant : ils restaient
                    // affichés, et bloquaient la réouverture — `.person-picker` encore présent).
                    pickerWrap.remove();
                    if (!name) return;
                    const chip = document.createElement('span');
                    chip.className = 'chip chip-gap';
                    chip.innerHTML = `${avatar(name, false, 18)} ${esc(name)} <button type="button" class="contrib-rm" data-name="${esc(name)}" title="Retirer">×</button>`;
                    contribWrap.insertBefore(chip, addBtn);
                    // Mini-loader à la place de sa future bande de congés : enregistrement + rechargement du store
                    // prennent 1 à 2 s avant le re-rendu (qui le remplace).
                    const field = contribWrap.closest('.mdl-field');
                    let list = field?.querySelector('.mdl-contrib-pres-list');
                    if (field && !list) { list = document.createElement('div'); list.className = 'mdl-contrib-pres-list'; field.appendChild(list); }
                    if (list) {
                        const row = document.createElement('div');
                        row.className = 'mdl-contrib-pres mdl-contrib-pres--loading';
                        row.setAttribute('role', 'status');
                        const first = name.includes(',') ? name.split(',')[1].trim().split(/\s+/)[0] : name.split(/\s+/)[0];
                        row.innerHTML = `<span class="mdl-contrib-pres-name">${esc(first)}</span><span class="mdl-pres-loader" aria-hidden="true"><i></i><i></i><i></i></span><span class="mdl-pres-loading-txt">congés…</span>`;
                        list.appendChild(row);
                    }
                    await saveC();
                    // Re-rendu de la popin : la bande de congés du nouveau contributeur (et son 🌴) apparaît.
                    // Pas de réouverture automatique : elle ré-affichait aussitôt toute la liste (≈ 220 noms) —
                    // « + Ajouter » pour le suivant.
                    openTicketModal(ticket.id);
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
        }
    }

    // ── Labels inline — autocomplete ──────────────────────────────────────────
    const labelsWrap = container.querySelector('#labels-inline-wrap');
    if (labelsWrap) {
        const getLabels = () => Array.from(labelsWrap.querySelectorAll('.label-rm')).map(b => b.dataset.label);
        const saveL = async () => { try { await apiSave({ labels: getLabels() }); } catch (err) { toast(err.message, 'error'); } };

        // Retrait d'un label
        labelsWrap.addEventListener('click', async e => {
            const btn = e.target.closest('.label-rm'); if (!btn) return;
            btn.closest('.chip').remove(); await saveL();
        });

        // Remplace l'input texte par le label picker
        const oldInput = labelsWrap.querySelector('#label-add-input');
        const { wrap: labelPickerWrap, input: labelInput } = _makeLabelPicker(
            getLabels(),
            async (val) => {
                if (!val || getLabels().includes(val)) return;
                labelsWrap.insertBefore(_labelChipEl(val), labelPickerWrap);
                await saveL();
            },
            () => { labelInput.value = ''; }
        );
        if (oldInput) oldInput.replaceWith(labelPickerWrap);
        else labelsWrap.appendChild(labelPickerWrap);
    }

    // ── Planning Poker ────────────────────────────────────────────────────────
    container.querySelector('#mdl-poker-btn')?.addEventListener('click', () => {
        // Ajoute /poker au hash pour permettre le partage direct du lien
        const cur = location.hash;
        if (!cur.endsWith('/poker')) {
            history.replaceState(null, '', cur.replace(/\/poker$/, '') + '/poker');
        }
        _openPokerModal(ticket, apiSave, openTicketModal);
    });
}
