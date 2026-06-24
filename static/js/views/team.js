/**
 * Équipe — fiche d'identité (vision, périmètre, 5 questions) + ateliers de
 * démarrage/diagnostic (Team Canvas, ART, Interfaces, Rituels, DoR/DoD,
 * Compétences, Santé d'équipe, FAQ, Tuckman, Maturité Agile).
 *
 * Les ateliers sont un catalogue admin (WorkshopTemplate, géré ici même) — chaque
 * équipe y répond indépendamment (TeamWorkshop), avec pièces jointes possibles
 * (image, PDF, XLS, Doc). Remplir un atelier n'écrase pas la fiche d'identité :
 * c'est une référence consultable à côté, à reporter manuellement si pertinent.
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, hashColor, initials, deriveMembersFromAbsences, confirmDanger, copyToClipboard, promptModal, extractTeam, getCurrentPi } from '../utils.js';
import { openMemberCard } from './atlas.js';

const IDENTITY_FIELDS = [
    { key: 'vision', label: 'Vision' },
    { key: 'perimeter', label: 'Périmètre' },
    { key: 'quiSommesNous', label: 'Qui sommes-nous ?' },
    { key: 'queFaisonsNous', label: 'Que faisons-nous ?' },
    { key: 'avecQui', label: 'Avec qui travaillons-nous ?' },
    { key: 'commentFonctionnons', label: 'Comment fonctionnons-nous ?' },
    { key: 'besoinsReussite', label: 'De quoi avons-nous besoin pour réussir ?' },
];

const SCALE_LABELS = ['1 — Faible', '2', '3 — Moyen', '4', '5 — Fort'];

// Identité visuelle par catégorie d'atelier — couleur d'accent + repli si pas d'icône en base.
const CATEGORY_META = {
    canvas:     { color: '#6366f1', icon: '🧩' },
    art:        { color: '#0ea5e9', icon: '🚂' },
    interfaces: { color: '#8b5cf6', icon: '🔗' },
    rituals:    { color: '#f59e0b', icon: '🗓️' },
    'dor-dod':  { color: '#10b981', icon: '✅' },
    skills:     { color: '#ec4899', icon: '🎯' },
    health:     { color: '#14b8a6', icon: '💚' },
    faq:        { color: '#3b82f6', icon: '💬' },
    tuckman:    { color: '#a855f7', icon: '🌀' },
    maturity:   { color: '#f97316', icon: '📈' },
    custom:     { color: '#94a3b8', icon: '📋' },
};
const _catMeta = c => CATEGORY_META[c] || CATEGORY_META.custom;

const ATTACHMENT_ICON = { pdf: '📄', xls: '📊', xlsx: '📊', doc: '📝', docx: '📝',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️' };
const _attIcon = filename => ATTACHMENT_ICON[(filename.split('.').pop() || '').toLowerCase()] || '📎';

let _adminOpen = false;
let _openWorkshopKey = null;
const _attachmentsCache = {}; // workshopId -> Attachment[]

function _isIdentityEmpty(identity) {
    return IDENTITY_FIELDS.every(f => !(identity[f.key] || '').trim());
}

/** Membres triés par rôle (vide en dernier), puis par nom. */
function _sortedMembers(members) {
    return [...members].sort((a, b) => {
        const ra = (a.role || '').trim(), rb = (b.role || '').trim();
        if (ra !== rb) {
            if (!ra) return 1;
            if (!rb) return -1;
            return ra.localeCompare(rb, 'fr');
        }
        return (a.name || '').localeCompare(b.name || '', 'fr');
    });
}

/** Membres présents dans l'équipe au PI précédent mais absents du roster courant ("en mémoire"). */
function _formerMembers(team, currentMembers) {
    const piInfo = store.get('piInfo');
    const curPi = getCurrentPi({ sprintInfo: store.get('sprintInfo'), piInfo });
    if (!curPi || curPi <= 1) return [];
    const snapshot = (piInfo?.piMembers || {})[String(curPi - 1)] || [];
    const currentNames = new Set(currentMembers.map(m => m.name));
    const seen = new Set();
    return snapshot
        .filter(m => extractTeam(m.team) === team && !currentNames.has(m.name))
        .filter(m => !seen.has(m.name) && seen.add(m.name));
}

export function renderTeam(container) {
    const team = store.get('team');
    if (!team || team === 'all') {
        container.innerHTML = `
            <div class="empty-state">
                <svg class="icon"><use href="#i-id-card"/></svg>
                <h3>Choisis une équipe</h3>
                <p>Sélectionne une équipe dans la sidebar pour voir sa fiche d'identité et ses ateliers.</p>
            </div>`;
        return;
    }

    const teamObj   = (store.get('teamObjects') || []).find(t => t.name === team);
    const color     = teamObj?.color || hashColor(team);
    const members   = deriveMembersFromAbsences(store.get('absences') || [], store.get('members') || [])
        .filter(m => m.team === team);
    const sortedMembers = _sortedMembers(members);
    const formerMembers = _formerMembers(team, members);
    const identity  = (store.get('teamIdentities') || []).find(i => i.team === team) || {};
    const templates = (store.get('workshopTemplates') || []).filter(t => t.active !== false)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const workshops = (store.get('teamWorkshops') || []).filter(w => w.team === team);
    const empty     = _isIdentityEmpty(identity);

    container.innerHTML = `
        <div class="team-id-header card">
            <div class="team-id-header-left">
                <span class="team-id-swatch" style="background:${color}">${esc(team.slice(0, 2).toUpperCase())}</span>
                <div class="team-id-header-info"><h2>${esc(team)}</h2></div>
            </div>
            <div class="team-id-roster">
                <span class="team-id-roster-label">Membres (${members.length})</span>
                <div class="team-id-roster-list">
                    ${sortedMembers.length
                        ? sortedMembers.map(m => `
                            <button type="button" class="team-id-member-chip" data-member="${esc(m.name)}" title="${esc(m.role || 'Voir la fiche membre')}">
                                <span class="assignee-avatar" style="background:${hashColor(m.name)}">${esc(initials(m.name))}</span>
                                <span class="team-id-member-name">${esc(m.name)}</span>
                                ${m.role ? `<span class="team-id-member-role">${esc(m.role)}</span>` : ''}
                            </button>`).join('')
                        : '<span class="text-muted text-sm">Aucun membre — importer les absences pour peupler la liste.</span>'}
                </div>
                ${formerMembers.length ? `
                    <div class="team-id-roster-former">
                        <span class="team-id-roster-label">🕯️ En mémoire — PI précédent</span>
                        <div class="team-id-roster-list">
                            ${formerMembers.map(m => `
                                <button type="button" class="team-id-member-chip team-id-member-chip--former" data-member="${esc(m.name)}" title="Voir la fiche membre">
                                    <span class="assignee-avatar" style="background:${hashColor(m.name)}">${esc(initials(m.name))}</span>
                                    <span class="team-id-member-name">${esc(m.name)}</span>
                                </button>`).join('')}
                        </div>
                    </div>` : ''}
            </div>
        </div>

        ${empty ? `
            <div class="team-id-banner">
                <div>
                    <strong>Fiche d'identité non remplie.</strong>
                    <span class="text-muted">Démarre avec un atelier guidé pour la pré-construire.</span>
                </div>
                <button class="btn btn-primary btn-sm" id="btn-goto-workshops">Choisir un atelier</button>
            </div>
        ` : ''}

        <div class="card team-id-card">
            <div class="card-header">
                <span class="card-title">Fiche d'identité</span>
                <button class="btn btn-secondary btn-sm" id="btn-copy-slack" title="Copier la fiche au format Slack">📋 Copier pour Slack</button>
            </div>
            <div class="team-identity-fields">
                ${IDENTITY_FIELDS.map(f => _renderIdentityField(f, identity[f.key])).join('')}
            </div>
        </div>

        <div class="card" id="team-workshops-section">
            <div class="card-header">
                <span class="card-title">✨ Ateliers</span>
                <button class="btn btn-secondary btn-sm" id="btn-toggle-admin">⚙ Gérer les ateliers</button>
            </div>
            ${_adminOpen ? _renderAdminPanel(templates) : ''}
            <div class="team-workshop-gallery">
                ${templates.length ? templates.map(t => _renderWorkshopCard(t, workshops.find(w => (w.templateKey || w.template_key) === t.key))).join('')
                    : '<p class="text-muted text-sm">Aucun atelier disponible — utilise "Gérer les ateliers" pour en créer un.</p>'}
            </div>
        </div>
    `;

    _bindIdentityForm(container, team);
    _bindBanner(container);
    _bindAdminToggle(container, templates);
    _bindWorkshopCards(container, team, templates, workshops);
    _bindRichEditors(container);
    if (_adminOpen) _bindAdminPanel(container, templates);

    // Charge les pièces jointes de l'atelier ouvert (si pas déjà en cache).
    const openWorkshop = workshops.find(w => (w.templateKey || w.template_key) === _openWorkshopKey);
    if (_openWorkshopKey && openWorkshop?.id && !_attachmentsCache[openWorkshop.id]) {
        api.getAttachments(openWorkshop.id).then(atts => {
            _attachmentsCache[openWorkshop.id] = atts;
            renderTeam(container);
        }).catch(() => { _attachmentsCache[openWorkshop.id] = []; });
    }
}

// ── Fiche d'identité — affichage joli, clic sur un champ pour l'éditer ──────
function _renderIdentityField(field, value) {
    const v = (value || '').trim();
    return `
        <div class="team-identity-field">
            <span class="team-identity-label">${esc(field.label)}</span>
            <div class="team-identity-value" data-key="${field.key}" tabindex="0" title="Cliquer pour éditer">
                ${v ? esc(v).replace(/\n/g, '<br>') : '<span class="team-identity-placeholder">— Cliquer pour compléter —</span>'}
            </div>
        </div>`;
}

function _buildSlackText(team, identity) {
    const lines = [`*${team} — Fiche d'identité*`, ''];
    for (const f of IDENTITY_FIELDS) {
        const val = (identity[f.key] || '').trim();
        if (!val) continue;
        lines.push(`*${f.label}*`, val, '');
    }
    return lines.join('\n').trim();
}

function _editIdentityField(container, team, el) {
    if (el.querySelector('textarea')) return; // déjà en édition
    const key = el.dataset.key;
    const identity = (store.get('teamIdentities') || []).find(i => i.team === team) || {};
    const orig = identity[key] || '';
    el.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.className = 'input team-identity-textarea';
    ta.rows = 3;
    ta.value = orig;
    el.appendChild(ta);
    ta.focus();
    ta.select();
    let done = false;
    const commit = async () => {
        if (done) return;
        done = true;
        const val = ta.value;
        if (val === orig) { renderTeam(container); return; }
        try {
            const updated = await api.updateTeamIdentity(team, { [key]: val });
            const list = (store.get('teamIdentities') || []).filter(i => i.team !== team);
            store.set('teamIdentities', [...list, updated]);
            toast('Fiche mise à jour', 'success');
        } catch (e) { toast(e.message, 'error'); }
        renderTeam(container);
    };
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', e => {
        if (e.key === 'Escape') { done = true; renderTeam(container); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); ta.blur(); }
    });
}

function _bindIdentityForm(container, team) {
    container.querySelectorAll('.team-identity-value').forEach(el => {
        el.addEventListener('click', () => _editIdentityField(container, team, el));
    });
    container.querySelector('#btn-copy-slack')?.addEventListener('click', () => {
        const identity = (store.get('teamIdentities') || []).find(i => i.team === team) || {};
        copyToClipboard(_buildSlackText(team, identity), 'Copié pour Slack');
    });
    container.querySelectorAll('.team-id-member-chip[data-member]').forEach(btn => {
        btn.addEventListener('click', () => openMemberCard(btn.dataset.member));
    });
}

function _bindBanner(container) {
    container.querySelector('#btn-goto-workshops')?.addEventListener('click', () => {
        container.querySelector('#team-workshops-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── Carte atelier (badge + formulaire dynamique repliable) ──────────────────
function _renderWorkshopCard(template, workshop) {
    const isOpen = _openWorkshopKey === template.key;
    const meta = _catMeta(template.category);
    const status = workshop?.status === 'completed'
        ? `<span class="badge badge-success">Rempli${workshop.updatedAt ? ' le ' + new Date(workshop.updatedAt).toLocaleDateString('fr-FR') : ''}</span>`
        : workshop ? `<span class="badge">Brouillon</span>` : `<span class="badge badge-muted">Non rempli</span>`;
    return `
        <div class="team-workshop-card${isOpen ? ' is-open' : ''}" style="--wc-accent:${meta.color}">
            <div class="team-workshop-card-head" data-key="${esc(template.key)}">
                <span class="team-workshop-icon">${esc(template.icon || meta.icon)}</span>
                <div class="team-workshop-card-text">
                    <strong class="team-workshop-title">${esc(template.name)}</strong>
                    <p class="text-muted text-sm">${esc(template.description || '')}</p>
                </div>
                <div class="team-workshop-card-actions">
                    ${status}
                    <button class="btn btn-secondary btn-sm team-workshop-toggle" data-key="${esc(template.key)}">
                        ${isOpen ? 'Fermer' : (workshop ? 'Modifier' : 'Remplir')}
                    </button>
                </div>
            </div>
            ${isOpen ? _renderWorkshopForm(template, workshop) : ''}
        </div>
    `;
}

function _renderWorkshopForm(template, workshop) {
    const data = workshop?.data || {};
    const isCanvas = template.category === 'canvas';
    return `
        <div class="team-workshop-form">
            <div class="${isCanvas ? 'team-workshop-canvas-grid' : 'team-workshop-fields'}">
                ${(template.fields || []).map((f, i) => `
                    <div class="form-group${isCanvas ? ' team-workshop-sticky' : ''}" style="--sticky-i:${i}">
                        <label class="label">${esc(f.label)}</label>
                        ${_renderFieldInput(template.key, f, data[f.key])}
                    </div>
                `).join('')}
            </div>
            ${_renderAttachmentsSection(workshop)}
            <div class="form-actions">
                <button class="btn btn-secondary btn-sm team-workshop-cancel" data-key="${esc(template.key)}">Annuler</button>
                <button class="btn btn-primary btn-sm team-workshop-save" data-key="${esc(template.key)}">Enregistrer</button>
            </div>
        </div>
    `;
}

function _renderFieldInput(templateKey, field, value) {
    const id = `ws-field-${templateKey}-${field.key}`;
    if (field.type === 'select') {
        const options = field.options || [];
        return `<span class="select-fancy">
            <select class="select w-full" id="${id}">
                <option value="">—</option>
                ${options.map(o => `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}
            </select>
        </span>`;
    }
    if (field.type === 'scale') {
        return `<span class="select-fancy">
            <select class="select w-full" id="${id}">
                <option value="">—</option>
                ${SCALE_LABELS.map((l, i) => `<option value="${i + 1}"${String(i + 1) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
        </span>`;
    }
    if (field.type === 'text') {
        return `<input class="input" id="${id}" value="${esc(value || '')}">`;
    }
    // Texte libre → éditeur riche (même parité visuelle que la description des tickets).
    return `
        <div class="rich-editor">
            <div class="desc-toolbar">
                <button type="button" class="desc-tb-btn" data-cmd="bold" title="Gras (Ctrl+B)"><b>B</b></button>
                <button type="button" class="desc-tb-btn" data-cmd="italic" title="Italique (Ctrl+I)"><i>I</i></button>
                <button type="button" class="desc-tb-btn" data-cmd="underline" title="Souligné (Ctrl+U)"><u>U</u></button>
                <span class="desc-tb-sep"></span>
                <button type="button" class="desc-tb-btn" data-cmd="insertUnorderedList" title="Liste à puces">• UL</button>
                <button type="button" class="desc-tb-btn" data-cmd="insertOrderedList" title="Liste numérotée">1. OL</button>
                <span class="desc-tb-sep"></span>
                <button type="button" class="desc-tb-btn rich-tb-link" title="Insérer un lien">🔗</button>
                <button type="button" class="desc-tb-btn" data-cmd="removeFormat" title="Effacer le formatage">Aa×</button>
            </div>
            <div class="desc-editable mdl-description" id="${id}" contenteditable="true">${value || ''}</div>
        </div>`;
}

function _collectWorkshopData(container, template) {
    const data = {};
    for (const f of (template.fields || [])) {
        const el = container.querySelector(`#ws-field-${template.key}-${f.key}`);
        data[f.key] = !el ? '' : (f.type === 'select' || f.type === 'scale' || f.type === 'text' ? el.value : el.innerHTML.trim());
    }
    return data;
}

// Barre d'outils riche (bold/italic/listes/lien) — déléguée par éditeur, exécute document.execCommand.
function _bindRichEditors(container) {
    container.querySelectorAll('.rich-editor').forEach(wrap => {
        const toolbar = wrap.querySelector('.desc-toolbar');
        const content = wrap.querySelector('.desc-editable');
        if (!toolbar || !content) return;
        toolbar.addEventListener('mousedown', async e => {
            const btn = e.target.closest('.desc-tb-btn');
            if (!btn) return;
            e.preventDefault();
            if (btn.classList.contains('rich-tb-link')) {
                const sel = window.getSelection();
                const savedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
                const url = await promptModal('URL du lien', {
                    type: 'url', placeholder: 'https://…', confirmLabel: 'Insérer', required: true,
                });
                content.focus();
                if (savedRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
                if (url) document.execCommand('createLink', false, url);
                return;
            }
            const cmd = btn.dataset.cmd;
            if (cmd) document.execCommand(cmd, false, null);
            content.focus();
        });
    });
}

// ── Pièces jointes ────────────────────────────────────────────────────────────
function _renderAttachmentsSection(workshop) {
    if (!workshop?.id) {
        return `
            <div class="team-workshop-attachments team-workshop-attachments--locked">
                <span class="text-muted text-sm">📎 Enregistre l'atelier une première fois pour pouvoir ajouter des pièces jointes (image, PDF, XLS, Doc).</span>
            </div>`;
    }
    const attachments = _attachmentsCache[workshop.id] || [];
    return `
        <div class="team-workshop-attachments" data-workshop-id="${esc(workshop.id)}">
            <div class="team-workshop-attachments-label">📎 Pièces jointes</div>
            <div class="team-workshop-attachments-list">
                ${attachments.map(a => `
                    <span class="team-attachment-chip">
                        <a href="${esc(api.attachmentDownloadUrl(a.id))}" target="_blank" rel="noopener" title="${esc(a.filename)}">
                            ${_attIcon(a.filename)} ${esc(a.filename)}
                        </a>
                        <button type="button" class="attachment-delete" data-id="${esc(a.id)}" title="Supprimer">×</button>
                    </span>
                `).join('') || '<span class="text-muted text-sm">Aucune pièce jointe.</span>'}
            </div>
            <label class="btn btn-secondary btn-sm attachment-upload-label">
                + Ajouter un fichier
                <input type="file" class="attachment-upload-input" data-workshop-id="${esc(workshop.id)}"
                    accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.xls,.xlsx,.doc,.docx" hidden>
            </label>
        </div>
    `;
}

function _bindWorkshopCards(container, team, templates, workshops) {
    container.querySelectorAll('.team-workshop-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            _openWorkshopKey = _openWorkshopKey === btn.dataset.key ? null : btn.dataset.key;
            renderTeam(container);
        });
    });
    container.querySelectorAll('.team-workshop-cancel').forEach(btn => {
        btn.addEventListener('click', () => { _openWorkshopKey = null; renderTeam(container); });
    });
    container.querySelectorAll('.team-workshop-save').forEach(btn => {
        btn.addEventListener('click', async () => {
            const template = templates.find(t => t.key === btn.dataset.key);
            if (!template) return;
            const data = _collectWorkshopData(container, template);
            const hasAnswer = Object.values(data).some(v => (v || '').trim());
            try {
                const updated = await api.upsertTeamWorkshop({
                    team, templateKey: template.key, data,
                    status: hasAnswer ? 'completed' : 'draft',
                });
                const list = (store.get('teamWorkshops') || [])
                    .filter(w => !(w.team === team && (w.templateKey || w.template_key) === template.key));
                store.set('teamWorkshops', [...list, updated]);
                toast('Atelier enregistré', 'success');
                // Le formulaire reste ouvert (atelier maintenant sauvegardé → pièces jointes activables).
                renderTeam(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });

    // Pièces jointes : upload (input file caché derrière le label) + suppression.
    container.querySelectorAll('.attachment-upload-input').forEach(input => {
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            const workshopId = input.dataset.workshopId;
            if (!file || !workshopId) return;
            try {
                await api.uploadAttachment(workshopId, file);
                delete _attachmentsCache[workshopId];
                toast('Pièce jointe ajoutée', 'success');
                renderTeam(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });
    container.querySelectorAll('.attachment-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const workshopId = btn.closest('.team-workshop-attachments')?.dataset.workshopId;
            try {
                await api.deleteAttachment(btn.dataset.id);
                if (workshopId) delete _attachmentsCache[workshopId];
                toast('Pièce jointe supprimée', 'info');
                renderTeam(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });
}

// ── Admin des ateliers (catalogue WorkshopTemplate) ──────────────────────────
function _renderAdminPanel(templates) {
    return `
        <div class="team-workshop-admin">
            <p class="text-muted text-sm">Modèles d'ateliers disponibles pour toutes les équipes. Les questions sont libres : ajoute, modifie ou retire des champs.</p>
            ${templates.map(t => `
                <div class="team-workshop-admin-row">
                    <div>
                        <span>${esc(t.icon || '📋')}</span>
                        <strong>${esc(t.name)}</strong>
                        <span class="text-muted text-xs">(${esc(t.key)})</span>
                    </div>
                    <div class="team-workshop-admin-actions">
                        <button class="btn btn-secondary btn-sm admin-edit-template" data-id="${esc(t.id)}">Éditer</button>
                        <button class="btn btn-danger btn-sm admin-delete-template" data-id="${esc(t.id)}">Supprimer</button>
                    </div>
                </div>
            `).join('')}
            <button class="btn btn-secondary btn-sm" id="btn-new-template">+ Nouvel atelier</button>
            <div id="admin-template-editor"></div>
        </div>
    `;
}

function _emptyField() { return { key: '', label: '', type: 'textarea', options: [] }; }

function _renderTemplateEditor(template) {
    const fields = template.fields && template.fields.length ? template.fields : [_emptyField()];
    return `
        <div class="team-workshop-admin-editor">
            <div class="form-row">
                <div class="form-group team-workshop-admin-icon"><label class="label">Icône (emoji)</label>
                    <input class="input" id="tpl-icon" value="${esc(template.icon || '📋')}" maxlength="4"></div>
                <div class="form-group"><label class="label">Clé (stable, non modifiable après création)</label>
                    <input class="input" id="tpl-key" value="${esc(template.key || '')}" ${template.id ? 'disabled' : ''}></div>
                <div class="form-group"><label class="label">Nom</label>
                    <input class="input" id="tpl-name" value="${esc(template.name || '')}"></div>
            </div>
            <div class="form-group"><label class="label">Description</label>
                <input class="input" id="tpl-description" value="${esc(template.description || '')}"></div>
            <div class="form-group"><label class="label">Catégorie</label>
                <select class="select w-full" id="tpl-category">
                    ${Object.keys(CATEGORY_META).map(c => `<option value="${c}"${c === template.category ? ' selected' : ''}>${c}</option>`).join('')}
                </select></div>
            <div class="team-workshop-admin-fields" id="tpl-fields">
                ${fields.map((f, i) => _renderFieldEditorRow(f, i)).join('')}
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-add-field">+ Item</button>
            <div class="form-actions">
                <button class="btn btn-secondary btn-sm" id="btn-cancel-template">Annuler</button>
                <button class="btn btn-primary btn-sm" id="btn-save-template" data-id="${esc(template.id || '')}">Enregistrer l'atelier</button>
            </div>
        </div>
    `;
}

function _renderFieldEditorRow(f, i) {
    return `
        <div class="team-workshop-admin-field-row" data-idx="${i}">
            <input class="input" placeholder="clé" data-fld="key" value="${esc(f.key || '')}">
            <input class="input" placeholder="libellé" data-fld="label" value="${esc(f.label || '')}">
            <select class="select" data-fld="type">
                ${['textarea', 'text', 'select', 'scale'].map(t => `<option value="${t}"${t === f.type ? ' selected' : ''}>${t}</option>`).join('')}
            </select>
            <input class="input" placeholder="options (séparées par ,)" data-fld="options" value="${esc((f.options || []).join(', '))}">
            <button type="button" class="btn-icon admin-remove-field" data-idx="${i}"><svg class="icon icon-sm"><use href="#i-x"/></svg></button>
        </div>
    `;
}

function _bindAdminToggle(container, templates) {
    container.querySelector('#btn-toggle-admin')?.addEventListener('click', () => {
        _adminOpen = !_adminOpen;
        renderTeam(container);
    });
}

function _bindAdminPanel(container, templates) {
    const editorHost = container.querySelector('#admin-template-editor');

    const openEditor = (template) => {
        editorHost.innerHTML = _renderTemplateEditor(template);
        editorHost.querySelector('#btn-add-field')?.addEventListener('click', () => {
            const fieldsEl = editorHost.querySelector('#tpl-fields');
            const idx = fieldsEl.children.length;
            fieldsEl.insertAdjacentHTML('beforeend', _renderFieldEditorRow(_emptyField(), idx));
        });
        editorHost.querySelector('#tpl-fields')?.addEventListener('click', e => {
            const btn = e.target.closest('.admin-remove-field');
            if (btn) btn.closest('.team-workshop-admin-field-row')?.remove();
        });
        editorHost.querySelector('#btn-cancel-template')?.addEventListener('click', () => { editorHost.innerHTML = ''; });
        editorHost.querySelector('#btn-save-template')?.addEventListener('click', async () => {
            const id = editorHost.querySelector('#btn-save-template').dataset.id;
            const fieldsRows = [...editorHost.querySelectorAll('.team-workshop-admin-field-row')];
            const fields = fieldsRows.map(row => ({
                key: row.querySelector('[data-fld="key"]').value.trim(),
                label: row.querySelector('[data-fld="label"]').value.trim(),
                type: row.querySelector('[data-fld="type"]').value,
                options: row.querySelector('[data-fld="options"]').value.split(',').map(s => s.trim()).filter(Boolean),
            })).filter(f => f.key && f.label);
            const payload = {
                icon: editorHost.querySelector('#tpl-icon').value.trim() || '📋',
                key: editorHost.querySelector('#tpl-key').value.trim(),
                name: editorHost.querySelector('#tpl-name').value.trim(),
                description: editorHost.querySelector('#tpl-description').value.trim(),
                category: editorHost.querySelector('#tpl-category').value,
                fields,
            };
            if (!payload.key || !payload.name) { toast('Clé et nom requis', 'warning'); return; }
            try {
                if (id) await api.updateWorkshopTemplate(id, payload);
                else await api.createWorkshopTemplate(payload);
                store.set('workshopTemplates', await api.getWorkshopTemplates());
                toast('Atelier enregistré', 'success');
                renderTeam(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    };

    container.querySelector('#btn-new-template')?.addEventListener('click', () => openEditor({}));
    container.querySelectorAll('.admin-edit-template').forEach(btn => {
        btn.addEventListener('click', () => openEditor(templates.find(t => t.id === btn.dataset.id) || {}));
    });
    container.querySelectorAll('.admin-delete-template').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmDanger('Supprimer cet atelier ?', 'Les réponses des équipes pour cet atelier seront supprimées.');
            if (!ok) return;
            try {
                await api.deleteWorkshopTemplate(btn.dataset.id);
                store.set('workshopTemplates', await api.getWorkshopTemplates());
                toast('Atelier supprimé', 'info');
                renderTeam(container);
            } catch (e) { toast(e.message, 'error'); }
        });
    });
}
