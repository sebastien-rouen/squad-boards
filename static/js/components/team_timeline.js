/**
 * Carte « Faits marquants » (page Équipe, sous l'Agenda) — frise 1 « Couloirs du temps » de la
 * maquette static/mockups/team-timeline/ : période A → B (présélections + deux dates + mini-carte),
 * portée Équipe / Train, chiffres clés, filtres par catégorie, fiche au clic, « ＋ Fait marquant ».
 *
 * Données : team_timeline_model.js (aucune saisie par défaut). Faits saisis → table `event`
 * (api.createEvent / deleteEvent), `teams` vide = tout le train, `author` = nom saisi ; tout le monde peut en ajouter
 * et en supprimer (choix par défaut, README de la maquette, point 4).
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { esc, toast, confirmDanger, copyToClipboard, emptyStateHtml } from '../utils.js';
import { teamColor } from './team_calendar.js';
import { CATS, FACT_TYPES, fmt, fmtY, diff, presets, collectView, summary, timelineWindow, timelineToday, calendarSources, ALL_SOURCES } from './team_timeline_model.js';
import { lanesHtml, wireLanes } from './team_timeline_lanes.js';
import { storyHtml } from './team_timeline_story.js';
import { detailHtml } from './team_timeline_detail.js';
import { restorePrefs, savePrefs, syncFromUrl, isFiltered, resetFilters } from './team_timeline_prefs.js';
import { kpisHtml, legendHtml, openTimelineExport } from './team_timeline_export.js';

let _mounted = null;        // { el, st } — l'état survit au re-rendu de la page Équipe (même équipe)
let _listening = false;
// Vue par défaut (sans lien ni préférence enregistrée) : récit sur mobile, couloirs ailleurs.
// Filtres mémorisés + reflétés dans l'URL (~frise=) : team_timeline_prefs.js
const initialView = () => window.matchMedia?.('(max-width: 640px)').matches ? 'story' : 'lanes';


function render(el, st) {
    const team = st.scope === 'train' ? '*' : st.team;
    const c = collectView(st);                                 // portée générale + couloirs basculés sur le train
    const s = summary(c);
    st._items = [];                                            // registre des cibles cliquables (fiche)
    const target = item => { st._items.push(item); return `data-i="${st._items.length - 1}"`; };
    const counts = {
        rythme: c.pis.length + c.milestones.length, production: s.incidents, livraison: s.releases, operations: s.ops, charge: s.supTickets + s.supTasks,
        presence: c.low.length, equipe: c.moves.length, oneonone: s.ones, fait: c.facts.length,
    };
    const [W0, W1] = timelineWindow();
    const preset = presets().find(p => p.A === st.A && p.B === st.B);
    const body = st.cats.size ? (st.view === 'story' ? storyHtml(st, c, target) : lanesHtml(st, c, target))
        : emptyStateHtml({ icon: '🌤️', title: 'Aucune catégorie affichée', text: 'Réactivez au moins une catégorie pour voir la frise.', action: { label: 'Tout afficher', attrs: 'data-act="reset"' } });
    el.innerHTML = `
    <section class="card tl-card" style="--team:${teamColor(st.team)}" aria-label="Frise des faits marquants">
        <header class="tl-head">
            <div class="tl-title">
                <strong>🕰️ Faits marquants</strong>
                <span class="tl-sub">${st.scope === 'train' ? 'Tout le train' : esc(st.team)} · du ${fmtY(st.A)} au ${fmtY(st.B)} (${Math.round(diff(st.A, st.B) / 7)} semaines)</span>
            </div>
            <div class="tl-seg" role="group" aria-label="Affichage">
                <button type="button" data-view="lanes" aria-pressed="${st.view === 'lanes'}" title="Une ligne par thème, sur un axe du temps">📊 Couloirs</button>
                <button type="button" data-view="story" aria-pressed="${st.view === 'story'}" title="Lire la période mois par mois">📖 Récit</button>
            </div>
            <div class="tl-seg" role="group" aria-label="Portée">
                <button type="button" data-scope="team" aria-pressed="${st.scope === 'team'}">👥 ${esc(st.team)}</button>
                <button type="button" data-scope="train" aria-pressed="${st.scope === 'train'}">🚂 Train</button>
            </div>
            <div class="tl-actions">
                <button type="button" class="btn-icon tl-link-btn" data-act="link" aria-label="Copier le lien de cette vue" title="Copier le lien de cette vue (filtres compris)">🔗</button>
                <button type="button" class="btn btn-secondary btn-sm tl-export-btn" data-act="export" aria-label="Exporter" title="Exporter en image PNG, Markdown ou Slack">⤓<span class="tl-btn-label"> Exporter</span></button>
                <button type="button" class="btn btn-primary btn-sm tl-add" data-act="add" aria-label="Ajouter un fait marquant" title="Ajouter un fait marquant">＋<span class="tl-btn-label"> Fait marquant</span></button>
            </div>
        </header>
        <div class="tl-range" role="group" aria-label="Période">
            <div class="tl-presets" role="group" aria-label="Présélections">${presets().map(p => `<button type="button" class="tl-preset" data-preset="${p.key}" aria-pressed="${preset?.key === p.key}">${esc(p.label)}</button>`).join('')}</div>
            <!-- Un seul champ pour la plage : début → fin · durée (icônes de calendrier = celles du navigateur) -->
            <div class="tl-dates${preset ? '' : ' is-custom'}">
                <input type="date" data-date="A" aria-label="Du" value="${st.A}" min="${W0}" max="${st.B}">
                <span class="tl-arrow" aria-hidden="true">→</span>
                <input type="date" data-date="B" aria-label="Au" value="${st.B}" min="${st.A}" max="${W1}">
                <span class="tl-dates-len">${Math.round(diff(st.A, st.B) / 7)} sem.</span>
            </div>
            ${isFiltered(st) ? '<button type="button" class="tl-reset" data-act="reset-filters" title="Période 6 mois, toutes les catégories et sources, portée équipe">↺ Réinitialiser les filtres</button>' : ''}
        </div>
        <div class="tl-kpis" aria-label="Résumé de la période">
            ${kpisHtml(s, st)}
        </div>
        <div class="tl-filters" role="group" aria-label="Catégories">
            ${Object.entries(CATS).map(([k, v]) => `<button type="button" class="tl-chip" data-c="${k}" data-cat="${k}" aria-pressed="${st.cats.has(k)}">${v.emoji} ${esc(v.label)} <b>${counts[k]}</b></button>`).join('')}
        </div>
        ${sourcesHtml(st, team)}
        ${c.icsFrom && st.A < c.icsFrom && ['livraison', 'rythme', 'oneonone', 'operations'].some(k => st.cats.has(k)) ? `<p class="tl-note">ℹ️ MEP, jalons, 1v1 et opérations viennent des agendas ICS, disponibles à partir du ${fmtY(c.icsFrom)} : leur absence avant cette date ne veut pas dire « aucune MEP ».</p>` : ''}
        ${st.cats.has('presence') ? legendHtml() : ''}
        <div class="tl-body">${body}${detailHtml(st)}${st.adding ? formHtml(st) : ''}</div>
    </section>`;
    wireLanes(el, st, () => render(el, st));
    wire(el, st);
    savePrefs(st);                                             // navigateur + URL, à chaque changement
}

/** Filtre « Sources d'agenda » : une puce par portée, nommée d'après ses agendas réels (« ERPC - GDEM »).
 *  Alimente MEP, jalons, 1v1 et opérations — pas la présence, les incidents ni le turnover (hors ICS). */
function sourcesHtml(st, team) {
    const src = calendarSources(team);
    if (!src.length) return '';
    const name = x => x.cals.length === 1 ? x.cals[0].replace(/^ERPC - /, '') : `${x.label} (${x.cals.length})`;
    return `<div class="tl-sources" role="group" aria-label="Sources d'agenda">
        <span class="tl-sources-lbl">📅 Sources d’agenda</span>
        ${src.map(x => `<button type="button" class="tl-src" data-src="${x.key}" aria-pressed="${st.sources.has(x.key)}" title="${esc(`${x.label} : ${x.cals.join(', ')}`)}">${x.icon} ${esc(name(x))}</button>`).join('')}
    </div>`;
}

// ── Fiche : team_timeline_detail.js (gabarit de ligne, mouvements groupés par équipe) ──────────

// ── Formulaire « ＋ Fait marquant » (table `event`) ─────────────────────────────
/** Formulaire d'ajout OU de modification (`st.editing` = le fait à modifier, prérempli). */
function formHtml(st) {
    const today = timelineToday(), e = st.editing;
    const type = e ? e.type : Object.keys(FACT_TYPES)[0];
    const forAll = e ? !e.teams.length : false;
    return `<form class="tl-form" data-form aria-label="${e ? 'Modifier le fait marquant' : 'Ajouter un fait marquant'}">
        <h4>${e ? '✏️ Modifier le fait marquant' : '＋ Fait marquant'}</h4>
        <div class="tl-form-types" role="radiogroup" aria-label="Type">${Object.entries(FACT_TYPES).map(([k, v]) => `
            <label><input type="radio" name="type" value="${k}" ${k === type ? 'checked' : ''}><span>${v.emoji} ${esc(v.label)}</span></label>`).join('')}</div>
        <label class="tl-field"><span>Titre</span><input name="title" required maxlength="120" value="${esc(e?.title || '')}" placeholder="Ex. : Panne INES SPD — désynchronisations PGA"></label>
        <div class="tl-form-row">
            <label class="tl-field"><span>Du</span><input type="date" name="start" required value="${e?.start || today}"></label>
            <label class="tl-field"><span>au</span><input type="date" name="end" value="${e?.end || today}"></label>
        </div>
        <label class="tl-field"><span>Pour</span><select name="teams"><option value="${esc(st.team)}"${forAll ? '' : ' selected'}>${esc(st.team)}</option><option value=""${forAll ? ' selected' : ''}>Tout le train</option></select></label>
        <label class="tl-field"><span>Détail (facultatif)</span><textarea name="note" rows="2" maxlength="400">${esc(e?.note || '')}</textarea></label>
        <label class="tl-field"><span>${e ? 'Auteur' : 'Ajouté par'}</span><input name="author" maxlength="80" autocomplete="name" value="${esc(e ? e.author : authorName())}" placeholder="Ton prénom et nom"></label>
        <div class="tl-form-actions"><button type="button" class="btn btn-secondary btn-sm" data-act="cancel">Annuler</button><button class="btn btn-primary btn-sm">${e ? 'Enregistrer' : 'Ajouter à la frise'}</button></div>
    </form>`;
}

// Pas de compte utilisateur : le nom est celui du planning poker (même navigateur), mémorisé
const AUTHOR_KEY = 'sb-poker-myname';
const authorName = () => { try { return localStorage.getItem(AUTHOR_KEY) || ''; } catch { return ''; } };
const saveAuthorName = n => { try { if (n) localStorage.setItem(AUTHOR_KEY, n); } catch { /* navigation privée */ } };

async function reloadEvents() {
    store.set('events', await api.getEvents());
}

// ── Interactions ───────────────────────────────────────────────────────────────
function wire(el, st) {
    const again = () => render(el, st);
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async e => {
        const a = b.dataset.act;
        e.preventDefault();
        if (a === 'close') st.selectedItem = null;
        else if (a === 'add') { st.adding = true; st.editing = null; st.selectedItem = null; }
        else if (a === 'edit-fact') { st.editing = st.selectedItem?.fact || null; st.adding = !!st.editing; st.selectedItem = null; }
        else if (a === 'cancel') { st.adding = false; st.editing = null; }
        else if (a === 'reset') st.cats = new Set(Object.keys(CATS));
        else if (a === 'export') { st.selectedItem = null; openTimelineExport(st); return; }
        else if (a === 'reset-filters') resetFilters(st);
        else if (a === 'link') {
            // L'URL porte déjà les filtres (~frise=, écrit à chaque rendu) ; ✓ bref sur l'icône en retour
            await copyToClipboard(location.href, 'Lien copié');
            b.textContent = '✓';
            setTimeout(() => { if (b.isConnected) b.textContent = '🔗'; }, 1500);
            return;
        }
        else if (a === 'del-fact') {
            if (!(await confirmDanger('Supprimer le fait marquant', 'Supprimer ce fait marquant de la frise ?', { confirmLabel: 'Supprimer' }))) return;
            try { await api.deleteEvent(b.dataset.id); st.selectedItem = null; await reloadEvents(); toast('Fait marquant supprimé', 'success'); }
            catch (err) { toast(err.message, 'error'); }
            return;                                                 // le store redessine la carte
        } else return;
        again();
    }));
    el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
        st.view = b.dataset.view; st.selectedItem = null;
        again();
    }));
    // Cartes du récit (role="button", elles contiennent des listes) : Entrée / Espace = clic
    el.querySelectorAll('[data-i][role="button"]').forEach(b => b.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
    }));
    // Clé de ticket dans une fiche → popin du ticket (la fiche reste ouverte derrière)
    el.querySelectorAll('[data-ticket]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        window.__squadBoard?.openTicketModal?.(b.dataset.ticket);
    }));
    // Personne dans une bulle → sa fiche membre (Atlas, chargé à la demande), la bulle reste ouverte
    el.querySelectorAll('[data-member]').forEach(b => b.addEventListener('click', async e => {
        e.stopPropagation();
        (await import('../views/atlas.js')).openMemberCard(b.dataset.member);
    }));
    // Libellé de couloir (vue Équipe) : ce couloir seul passe sur tout le train, et retour
    el.querySelectorAll('[data-lane-scope]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.laneScope;
        st.laneTrain.has(k) ? st.laneTrain.delete(k) : st.laneTrain.add(k);
        st.selectedItem = null; again();
    }));
    el.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { st.scope = b.dataset.scope; st.selectedItem = null; again(); }));
    el.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { const p = presets().find(x => x.key === b.dataset.preset); st.A = p.A; st.B = p.B; again(); }));
    el.querySelectorAll('[data-date]').forEach(i => i.addEventListener('change', () => {
        if (!i.value) return;
        st[i.dataset.date] = i.value;
        if (st.A > st.B) [st.A, st.B] = [st.B, st.A];
        again();
    }));
    el.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.src;
        st.sources.has(k) ? st.sources.delete(k) : st.sources.add(k);
        if (k === 'ops' && st.sources.has('ops')) st.cats.add('operations');   // réactiver la source = voir son couloir
        st.selectedItem = null; again();
    }));
    // Tuile de chiffre clé : isole son couloir ; re-clic = retour aux catégories d'avant
    el.querySelectorAll('[data-kpi-cat]').forEach(b => b.addEventListener('click', () => {
        const cat = b.dataset.kpiCat;
        if (st.cats.size === 1 && st.cats.has(cat)) { st.cats = new Set(st.prevCats || Object.keys(CATS)); st.prevCats = null; }
        else { if (st.cats.size > 1) st.prevCats = [...st.cats]; st.cats = new Set([cat]); }
        st.selectedItem = null; again();
    }));
    el.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { st.cats.has(b.dataset.cat) ? st.cats.delete(b.dataset.cat) : st.cats.add(b.dataset.cat); again(); }));
    el.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        st.selectedItem = st._items[+b.dataset.i];
        const r = b.getBoundingClientRect(), host = el.querySelector('.tl-body').getBoundingClientRect();
        const left = Math.min(Math.max(8, r.left - host.left), host.width - 340);
        st.detailPos = `top:${Math.max(8, r.bottom - host.top + 6)}px;left:${Math.max(8, left)}px`;
        again();
    }));
    el.querySelector('[data-form]')?.addEventListener('submit', async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const title = String(f.get('title') || '').trim();
        let start = String(f.get('start') || ''), end = String(f.get('end') || '') || start;
        if (!title || !start) return;
        if (end < start) [start, end] = [end, start];
        const teams = f.get('teams') ? [String(f.get('teams'))] : [];
        const author = String(f.get('author') || '').trim();
        saveAuthorName(author);
        const data = { type: f.get('type'), title, description: String(f.get('note') || '').trim(), startDate: start, endDate: end, teams, author };
        const editing = st.editing;
        try {
            if (editing) await api.updateEvent(editing.id, data);
            else await api.createEvent(data);
            st.adding = false; st.editing = null; st.cats.add(f.get('type') === 'incident' ? 'production' : 'fait');
            // Le fait tombe hors de la période affichée : on l'y ramène plutôt que de le « perdre »
            if (end < st.A || start > st.B) { st.A = [start, st.A].sort()[0]; st.B = [end, st.B].sort()[1]; }
            await reloadEvents();
            toast(editing ? 'Fait marquant modifié' : 'Fait marquant ajouté', 'success');
        } catch (err) { toast(err.message, 'error'); }
    });
}

/** Monte la carte dans `el` pour `team` (état conservé si la même équipe est re-rendue). */
export function mountTeamTimeline(el, team) {
    if (!el) return;
    const prev = _mounted && _mounted.st.team === team ? _mounted.st : null;
    const p = presets().find(x => x.key === '6m');
    // Lien ~frise= > filtres mémorisés > défauts ; même équipe déjà ouverte : un lien collé l'emporte
    const st = prev ? syncFromUrl(prev) : restorePrefs({
        team, scope: 'team', view: initialView(), sources: ALL_SOURCES(), laneTrain: new Set(), A: p.A, B: p.B, cats: new Set(Object.keys(CATS)),
        adding: false, selectedItem: null, detailPos: null, _items: [],
    });
    _mounted = { el, st };
    if (!_listening) {
        _listening = true;
        const redraw = () => { if (_mounted?.el.isConnected) render(_mounted.el, _mounted.st); };
        ['events', 'tickets', 'absences', 'piInfo', 'calendarEvents', 'calendarRules'].forEach(k => store.on(k, redraw));
        // Fiche et formulaire : fermés au clic extérieur (fiche) et sur Échap — comportement standard
        document.addEventListener('click', e => {
            const m = _mounted;
            if (!m?.el.isConnected || !m.st.selectedItem || e.target.closest('.tl-detail, [data-i]')) return;
            m.st.selectedItem = null;
            render(m.el, m.st);
        });
        document.addEventListener('keydown', e => {
            const m = _mounted;
            if (e.key !== 'Escape' || !m?.el.isConnected || !(m.st.selectedItem || m.st.adding)) return;
            m.st.selectedItem = null; m.st.adding = false; m.st.editing = null;
            render(m.el, m.st);
        });
    }
    render(el, st);
}
