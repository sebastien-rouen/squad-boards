/**
 * Rotation mutualisée — carte « Paramètres → Rotation » permettant de faire assurer UNE
 * seule astreinte par PLUSIEURS équipes (typiquement les 3 équipes d'une ligne produit),
 * avec une composition par POSTE : « 2 Dev + 1 Product Owner chaque semaine ».
 *
 * Ce que ce module fait, et ce qu'il ne fait pas :
 *   - il ne crée AUCUN objet « pool » en base. Le tirage est réparti dans les rotations
 *     des VRAIES équipes (une entrée `support` par équipe et par semaine), donc la page
 *     Support, l'agenda, le panneau latéral et le message Slack continuent de fonctionner
 *     sans rien connaître du pool ;
 *   - la config du pool (équipes, quotas, mode semaine) vit en localStorage, comme le
 *     reste des réglages de la grille (`rot-mpw-*`, `rot-mode-*`, `rot-inactive`) ;
 *   - les postes viennent de `member.role` (Paramètres → Membres), jointé au roster du PI
 *     par `effectiveRosterForPi` — exactement la source de la grille.
 *
 * ⚠️ Les équipes d'un pool DOIVENT partager le même jour de bascule de semaine : `weekStart`
 * est la clé d'appariement des rotations en base, et deux modes différents produisent deux
 * séries de semaines sans aucune date commune (la rotation serait écrite en base mais
 * invisible dans la grille). Enregistrer le pool aligne donc le mode de chaque équipe
 * (`saveSupportWeekMode`, en base depuis 3.165.0).
 */

import { store } from '../state.js';
import * as api from '../api.js';
import { saveSupportWeekMode } from '../support-week-mode.js';
import {
    esc, toast, confirmDanger, teamNameMatches, effectiveRosterForPi,
    isMemberSupportActive, SUPPORT_WEEK_MODES, getSupportWeekMode,
    getSupportPool, saveSupportPool, poolQuotaTotal, POOL_ALL_KEY,
    generatePooledSupportRotation, carrySupportRowsOutside,
    posteOfRole, posteRoles, posteLabel, remapQuotasToPostes,
    copyToClipboard, promptModal,
} from '../utils.js';
import { buildPiWeeks } from '../utils/pi-weeks.js';
import { _rotRefreshPanels, _rotWireDayCells } from './settings-rotation.js';
// Rendu du récapitulatif (vues « par semaine » / « par poste ») et message à coller —
// extrait dans son propre module, ce fichier approchait la limite de 800 lignes.
import { poolRecapHtml, poolCopyMessage, getPoolView, setPoolView } from './settings-rotation-pool-recap.js';

/**
 * Tirage calculé mais PAS encore enregistré : `{ pool, weeks, piNum, members, run,
 * existingSupport }`. C'est LUI qu'« Enregistrer ce tirage » écrit — recalculer à
 * l'enregistrement donnerait un autre tirage (le départage des ex-aequo est aléatoire),
 * et l'utilisateur enregistrerait autre chose que ce qu'il vient de lire.
 * Remis à zéro dès qu'un réglage change : on ne doit jamais pouvoir enregistrer un
 * brouillon qui ne correspond plus aux quotas affichés.
 */
let _preview = null;

/**
 * Mode lecture : masque, dans la grille ci-dessous, les panneaux des équipes hors pool.
 * Purement visuel (une classe sur `#rot-panels`), donc jamais persisté : il n'a de sens
 * que le temps de relire un aperçu, et s'éteint avec lui.
 */
let _focusPool = false;

/** Clé du pool en cours d'édition : le groupe sélectionné dans le topbar, sinon global. */
function _poolKey() {
    return store.get('group') || POOL_ALL_KEY;
}

/** Groupe (ligne produit) sélectionné dans le topbar, ou null. */
function _selGroup() {
    const id = store.get('group');
    return id ? (store.get('groups') || []).find(g => g.id === id) || null : null;
}

/**
 * Config du pool en cours d'édition, nettoyée des équipes qui n'existent plus et dont les
 * quotas sont reportés sur les POSTES (un quota enregistré sur `Dev` avant la fusion avec
 * `Tech Lead` doit continuer de compter, pas devenir une ligne orpheline).
 */
function _pool() {
    const p = getSupportPool(_poolKey());
    const known = new Set(store.get('teams') || []);
    return {
        ...p,
        teams: p.teams.filter(t => known.has(t)),
        quotas: remapQuotasToPostes(p.quotas, p.roleGroups),
    };
}

/** Écrit la config ET aligne le jour de bascule des équipes du pool (cf. avertissement en tête). */
function _persist(patch) {
    const next = { ..._pool(), ...patch };
    saveSupportPool(_poolKey(), next);
    if (next.enabled) _alignWeekModes(next);
    // Le brouillon ET le mode lecture tombent ensemble : le focus n'est proposé qu'en
    // aperçu, le laisser actif masquerait des équipes sans plus aucun bouton pour les
    // rappeler. `_rerender` applique la classe juste après.
    _preview = null;
    _focusPool = false;
    return next;
}

/** Impose le jour de bascule du pool à ses équipes — sinon la rotation est écrite en base
 *  sur des semaines que la grille n'affiche jamais (cf. avertissement en tête de fichier). */
function _alignWeekModes(pool) {
    for (const t of pool.teams) saveSupportWeekMode(t, pool.weekMode).catch(e => toast(`Mode de semaine non enregistré : ${e.message}`, 'error'));
}

// ── Roster & postes ─────────────────────────────────────────────────────────

/** Semaines du PI affiché, calculées avec le mode du POOL (source unique : buildPiWeeks). */
function _poolWeeks(weekMode) {
    const { weeks, piNum } = buildPiWeeks({
        piInfo: store.get('piInfo'),
        sprintInfo: store.get('sprintInfo'),
        piOffset: store.get('piOffset') || 0,
        weekMode,
    });
    return { weeks: weeks || [], piNum };
}

/**
 * Candidats du pool : roster du PI affiché, restreint aux équipes cochées, `team`
 * normalisé sur le nom de la config (le CSV RH écrit parfois « Team Fuego ») et membres
 * désactivés pour le support écartés — mêmes filtres que le shuffle par équipe.
 */
function _poolMembers(teams, piNum, roleGroups = null) {
    const groups = roleGroups || _pool().roleGroups;
    const roster = effectiveRosterForPi(
        store.get('piInfo'), piNum, store.get('absences') || [], store.get('members') || []
    );
    const out = [];
    for (const t of teams) {
        for (const m of roster) {
            if (!teamNameMatches(m.team, t)) continue;
            if (!isMemberSupportActive(m.name)) continue;
            // `role` porte le POSTE (ce sur quoi le tirage raisonne), `realRole` le rôle RH.
            // Le générateur n'a rien à savoir des fusions : il compte des postes. Mais on
            // garde le rôle réel pour l'affichage — devant un créneau tenu par un Tech Lead,
            // la première question est justement « qui, et à quel titre ? ».
            out.push({
                name: m.name, team: t,
                role: posteOfRole(m.role || '', groups),
                realRole: m.role || '',
            });
        }
    }
    return out;
}

/** Postes présents dans le vivier, du plus fourni au moins fourni. */
function _rolesOf(members) {
    const by = new Map();
    for (const m of members) {
        const r = m.role || '';
        if (!r) continue;
        by.set(r, (by.get(r) || 0) + 1);
    }
    return [...by.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
        .map(([role, count]) => ({ role, count }));
}


/** Couleur d'une équipe (pastille des chips), depuis teamObjects. */
function _teamColor(name) {
    const o = (store.get('teamObjects') || []).find(t => (typeof t === 'string' ? t : t?.name) === name);
    return (typeof o === 'object' ? o?.color : null) || '#64748b';
}

// ── Rendu ───────────────────────────────────────────────────────────────────

/**
 * Carte complète. Rendue par `renderSettings` puis re-rendue en place à chaque réglage —
 * elle vit HORS de `#rot-panels` pour ne pas être balayée par les re-renders de la grille.
 */
export function poolSectionHtml() {
    const pool     = _pool();
    const grp      = _selGroup();
    const allTeams = (store.get('teams') || []).slice()
        .sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
    // Hors groupe on propose toutes les équipes ; dans un groupe, les siennes d'abord.
    const teamChoices = grp?.teams?.length ? allTeams.filter(t => grp.teams.includes(t)) : allTeams;

    const { weeks, piNum } = _poolWeeks(pool.weekMode);
    const members = _poolMembers(pool.teams, piNum, pool.roleGroups);
    const roles   = _rolesOf(members);
    const total   = poolQuotaTotal(pool);

    const teamChips = teamChoices.map(t => {
        const on = pool.teams.includes(t);
        const n  = members.filter(m => m.team === t).length;
        return `<label class="rot-pool-team${on ? ' is-on' : ''}">
            <input type="checkbox" data-pool-team="${esc(t)}"${on ? ' checked' : ''}>
            <span class="rot-pool-team-dot" style="background:${_teamColor(t)}"></span>
            <span class="rot-pool-team-name">${esc(t)}</span>
            ${on ? `<span class="rot-pool-team-count">${n}</span>` : ''}
        </label>`;
    }).join('');

    // Postes : ceux du vivier, plus ceux déjà quotés même si plus personne ne les tient
    // (sinon un quota invisible continuerait de peser sans qu'on puisse le corriger).
    const orphanRoles = Object.keys(pool.quotas)
        .filter(r => !roles.some(x => x.role === r))
        .map(r => ({ role: r, count: 0 }));
    const allPostes = [...roles, ...orphanRoles];
    const roleRows = allPostes.map(({ role, count }) => {
        const q = parseInt(pool.quotas[role], 10) || 0;
        const short = q > count;
        const covered = posteRoles(role, pool.roleGroups);
        const grouped = covered.length > 1;
        // Fusionner = « ces postes sont interchangeables pour l'astreinte ». On ne propose
        // que les AUTRES postes du vivier : fusionner avec un poste que personne ne tient
        // n'ajouterait aucun candidat.
        const mergeable = allPostes.filter(x => x.role !== role && x.count > 0);
        const mergeCtl = mergeable.length ? `
            <select class="select select-sm rot-pool-merge-select" data-pool-merge="${esc(role)}"
                    aria-label="Fusionner ${esc(role)} avec un autre poste">
                <option value="">⛓ fusionner avec…</option>
                ${mergeable.map(x => `<option value="${esc(x.role)}">${esc(x.role)}</option>`).join('')}
            </select>` : '';
        const splitCtl = grouped ? `
            <button type="button" class="btn btn-xs btn-secondary rot-pool-split" data-pool-split="${esc(role)}"
                    title="Séparer en ${covered.map(esc).join(', ')}">⤫ séparer</button>` : '';
        return `<div class="rot-pool-role${q ? ' is-on' : ''}${short ? ' is-short' : ''}${grouped ? ' is-grouped' : ''}">
            <div class="rot-pool-role-main">
                <span class="rot-pool-role-name" title="${grouped ? `Poste groupé : ${covered.map(esc).join(', ')} — indifféremment` : esc(role)}">${grouped ? '⛓ ' : ''}${esc(role)}</span>
                <span class="rot-pool-role-supply">${count} dispo</span>
                <input type="number" class="input rot-pool-role-input" min="0" max="10"
                       value="${q}" data-pool-role="${esc(role)}"
                       aria-label="Nombre de ${esc(role)} par semaine">
            </div>
            ${mergeCtl || splitCtl ? `<div class="rot-pool-role-merge">${mergeCtl}${splitCtl}</div>` : ''}
        </div>`;
    }).join('');

    const modeOptions = Object.entries(SUPPORT_WEEK_MODES).map(([k, v]) =>
        `<option value="${k}"${k === pool.weekMode ? ' selected' : ''}>${v.label}</option>`
    ).join('');

    const scope = grp
        ? `ligne produit <strong>${esc(grp.name)}</strong>`
        : 'toutes équipes (aucun groupe sélectionné dans le bandeau du haut)';

    const summary = pool.teams.length
        ? `${pool.teams.length} équipe${pool.teams.length > 1 ? 's' : ''} · ${members.length} personne${members.length > 1 ? 's' : ''} éligible${members.length > 1 ? 's' : ''} · <strong>${total}</strong> par semaine`
        : 'Aucune équipe sélectionnée';

    // Le mode semaine du pool s'impose aux équipes : on le dit AVANT d'enregistrer, la
    // grille de chaque équipe changera de colonnes.
    const divergent = pool.teams.filter(t => getSupportWeekMode(t) !== pool.weekMode);
    const modeWarn = divergent.length
        ? `<p class="rot-pool-warn">⚠️ Enregistrer fera passer ${divergent.map(esc).join(', ')} en semaine « ${SUPPORT_WEEK_MODES[pool.weekMode].label} » — les équipes d'un pool doivent partager le même jour de bascule.</p>`
        : '';

    // Un pool est « actif » une fois son tirage ENREGISTRÉ : c'est ce qui pose le repère ⧉
    // dans la grille par équipe. Régler la carte et lancer un aperçu n'active rien — on ne
    // marque pas des équipes comme mutualisées sur un brouillon.
    const state = pool.enabled
        ? '<span class="rot-pool-state is-on">active</span>'
        : '<span class="rot-pool-state">brouillon</span>';

    return `<div class="rot-pool" id="rot-pool">
        <div class="rot-pool-hdr">
            <span class="rot-pool-title">⧉ Rotation mutualisée</span>
            ${state}
            <span class="rot-pool-scope text-xs text-muted">${scope}</span>
            <span class="rot-pool-summary text-xs">${summary}</span>
            ${pool.enabled ? '<button type="button" class="btn btn-xs btn-secondary" id="rot-pool-off" title="Retire le repère ⧉ de la grille — la rotation déjà enregistrée n’est pas touchée">Ne plus mutualiser</button>' : ''}
        </div>
        <div class="rot-pool-body">
            <p class="rot-pool-intro text-xs text-muted">
                Une seule astreinte assurée à plusieurs équipes, composée par <strong>poste</strong>
                (le poste vient de <a href="#settings/membres">Paramètres → Membres</a>).
                Exemple : 2 <em>Dev</em> + 1 <em>Product Owner</em> chaque semaine, pris indifféremment
                dans les équipes cochées.
            </p>

            <div class="rot-pool-field">
                <div class="rot-pool-field-hdr">
                    <span class="label">Équipes du pool</span>
                    ${grp?.teams?.length ? `<button type="button" class="btn btn-xs btn-secondary" id="rot-pool-all">Toute la ligne ${esc(grp.name)}</button>` : ''}
                    <button type="button" class="btn btn-xs btn-secondary" id="rot-pool-none">Aucune</button>
                </div>
                <div class="rot-pool-teams">${teamChips || '<span class="text-xs text-muted">Aucune équipe configurée</span>'}</div>
            </div>

            <div class="rot-pool-field">
                <div class="rot-pool-field-hdr">
                    <span class="label">Composition hebdomadaire</span>
                    <span class="text-xs text-muted">${piNum ? `PI ${piNum} · ${weeks.length} semaines` : 'PI non résolu'}</span>
                </div>
                ${pool.teams.length
                    ? `<div class="rot-pool-roles">${roleRows || '<span class="text-xs text-muted">Aucun poste renseigné sur ces équipes — complétez Paramètres → Membres.</span>'}</div>`
                    : '<span class="text-xs text-muted">Cochez d’abord les équipes du pool.</span>'}
            </div>

            <div class="rot-pool-field rot-pool-field--row">
                <label class="text-xs text-muted rot-pool-mode">Semaine
                    <select class="select select-sm" id="rot-pool-mode">${modeOptions}</select>
                </label>
                <div class="rot-pool-actions">
                    <button type="button" class="btn btn-sm btn-secondary" id="rot-pool-preview"
                            ${total && pool.teams.length ? '' : 'disabled'}
                            title="Calcule un tirage et l’affiche, sans rien écrire en base">${_preview ? '🎲 Relancer le tirage' : '👁 Aperçu du tirage'}</button>
                    <button type="button" class="btn btn-sm btn-primary" id="rot-pool-generate"
                            ${_preview ? '' : 'disabled'}
                            title="${_preview
                                ? 'Écrit EXACTEMENT le tirage affiché dans la rotation des équipes du pool'
                                : 'Lancez d’abord un aperçu : on n’enregistre que ce qui a été relu'}">💾 Enregistrer ce tirage</button>
                </div>
            </div>
            ${modeWarn}
            <div class="rot-pool-recap" id="rot-pool-recap">${_recapHtml(pool, weeks, piNum, members)}</div>
            <!-- ↑ deux lectures d'un même tirage : par semaine (qui est d'astreinte) ou
                 par poste (comment la charge se répartit) — cf. settings-rotation-pool-recap.js -->
        </div>
    </div>`;
}

/**
 * Qui est affecté une semaine donnée : le brouillon s'il y en a un, sinon l'état RÉEL lu
 * dans le store — jamais une reconstitution théorique. Source unique du tableau ET du
 * message à coller, pour que ce qu'on copie soit exactement ce qu'on lit à l'écran.
 */
function _weekMembers(pool, w) {
    if (_preview) {
        return pool.teams.flatMap(t =>
            (_preview.run.rotationsByTeam[t] || []).find(r => r.weekStart === w.weekStart)?.members || []);
    }
    const support = store.get('support') || [];
    return pool.teams.flatMap(t =>
        support.filter(s => teamNameMatches(s.team, t) && s.weekStart === w.weekStart)
            .flatMap(s => s.members || []));
}

/**
 * Équipes affichées par la grille sous la carte (même règle que `_rotRenderPanels` : le
 * filtre groupe du topbar). Sert à savoir s'il y a seulement quelque chose à masquer —
 * proposer « masquer les équipes hors pool » quand il n'y en a aucune serait un leurre.
 */
function _gridTeams() {
    const all = store.get('teams') || [];
    const grp = _selGroup();
    return grp?.teams?.length ? all.filter(t => grp.teams.includes(t)) : all;
}

/**
 * Entrée `support` d'un couple (équipe, semaine) — brouillon si un aperçu est affiché,
 * état en base sinon. La vue « par poste » en a besoin pour rendre les mini-strips au jour
 * près, comme la grille par équipe.
 */
function _entryOf(pool, team, weekStart) {
    if (_preview) {
        return (_preview.run.rotationsByTeam[team] || []).find(r => r.weekStart === weekStart) || null;
    }
    return (store.get('support') || [])
        .find(s => teamNameMatches(s.team, team) && s.weekStart === weekStart) || null;
}

/** Adapte la config locale au module de rendu du récapitulatif. */
function _recapHtml(pool, weeks, piNum, members) {
    const outOfPool = _gridTeams().filter(t => !pool.teams.includes(t));
    return poolRecapHtml({
        pool, weeks, piNum, members,
        weekMembers: w => _weekMembers(pool, w),
        teamColor: _teamColor,
        isPreview: !!_preview,
        shortfalls: _preview ? (_preview.run.shortfalls || []) : [],
        view: getPoolView(),
        slackAvailable: !!api.getSlackWebhook(),
        focusable: outOfPool.length > 0,
        focused: _focusPool,
        // Édition au jour près, comme la grille par équipe — mais JAMAIS sur un aperçu :
        // le brouillon n'existe pas en base, l'écriture porterait sur une entrée absente.
        entryOf: (team, weekStart) => _entryOf(pool, team, weekStart),
        absences: store.get('absences') || [],
        today: new Date().toISOString().slice(0, 10),
        editable: !_preview,
    });
}

/** Applique (ou retire) le masquage des équipes hors pool dans la grille. */
function _applyFocus(container) {
    container.querySelector('#rot-panels')?.classList.toggle('rot-focus-pool', _focusPool);
}

/** Re-rend la carte en place et recâble ses events (la grille n'est pas re-rendue, mais son
 *  masquage suit l'état du focus — un seul point d'application, quel que soit le chemin). */
function _rerender(container) {
    const el = container.querySelector('#rot-pool');
    if (!el) return;
    el.outerHTML = poolSectionHtml();
    wirePoolSection(container);
    _applyFocus(container);
    _wireRecapCells(container);
}

/**
 * Câble les mini-strips de la vue « par poste ». On passe le NŒUD DU RÉCAP, pas le
 * conteneur : `_rotWireDayCells(container, …)` recâblerait aussi la grille par équipe, qui
 * n'a pas été re-rendue — chaque pastille y aurait reçu un second écouteur, et un clic
 * aurait basculé le jour deux fois, donc rien.
 */
function _wireRecapCells(container) {
    const recap = container.querySelector('#rot-pool-recap');
    if (!recap) return;
    _rotWireDayCells(recap, async () => {
        // Une écriture depuis le récap change AUSSI la grille : les deux se relisent.
        await _rotRefreshPanels(container);
        _rerender(container);
    });
}

// Tout passe par `_rerender` : lancer ou effacer un aperçu change AUSSI les deux boutons
// d'action (libellé du tirage, activation de « Enregistrer ce tirage »), qui vivent hors
// du récap. Ne re-rendre que le tableau laissait « Enregistrer » grisé après un aperçu.

// ── Câblage ─────────────────────────────────────────────────────────────────

/** Construit les données du tirage (partagé par l'aperçu et la génération). */
function _buildRun() {
    const pool = _pool();
    const { weeks, piNum } = _poolWeeks(pool.weekMode);
    if (!pool.teams.length) return { error: 'Aucune équipe dans le pool' };
    if (!weeks.length)      return { error: `Aucune semaine calculée pour le PI ${piNum || '?'} — vérifier la date de début du PI` };
    if (!poolQuotaTotal(pool)) return { error: 'Aucun poste demandé — mettez au moins un quota à 1' };
    const members = _poolMembers(pool.teams, piNum, pool.roleGroups);
    if (!members.length) return { error: 'Aucun membre actif sur les équipes du pool' };

    const support = store.get('support') || [];
    const existingSupport = pool.teams.flatMap(t =>
        support.filter(s => teamNameMatches(s.team, t)).map(s => ({ ...s, team: t })));

    const run = generatePooledSupportRotation({
        teams: pool.teams, weeks, members, quotas: pool.quotas,
        absences: store.get('absences') || [], existingSupport,
        weekMode: pool.weekMode,
    });
    return { pool, weeks, piNum, members, run, existingSupport };
}

/** Câble la carte. Idempotent : appelé au montage puis après chaque re-render. */
export function wirePoolSection(container) {
    const root = container.querySelector('#rot-pool');
    if (!root) return;
    _wireRecapCells(container);   // vue « par poste » : mêmes pastilles que la grille

    // « Ne plus mutualiser » : retire le repère ⧉ de la grille et rend chaque équipe à son
    // effectif cible. La rotation DÉJÀ enregistrée n'est pas touchée — on ne supprime pas
    // des affectations réelles pour un changement d'affichage.
    root.querySelector('#rot-pool-off')?.addEventListener('click', () => {
        _persist({ enabled: false });
        toast('Pool désactivé — la rotation déjà enregistrée est conservée', 'info');
        _rerender(container);
        _rotRefreshPanels(container);
    });

    root.querySelectorAll('[data-pool-team]').forEach(cb => {
        cb.addEventListener('change', () => {
            const teams = [...root.querySelectorAll('[data-pool-team]')]
                .filter(x => x.checked).map(x => x.dataset.poolTeam);
            _persist({ teams });
            _rerender(container);
            _rotRefreshPanels(container);
        });
    });

    root.querySelector('#rot-pool-all')?.addEventListener('click', () => {
        const grp = _selGroup();
        const known = store.get('teams') || [];
        _persist({ teams: known.filter(t => (grp?.teams || []).includes(t)) });
        _rerender(container);
        _rotRefreshPanels(container);
    });

    root.querySelector('#rot-pool-none')?.addEventListener('click', () => {
        _persist({ teams: [] });
        _rerender(container);
        _rotRefreshPanels(container);
    });

    root.querySelector('#rot-pool-mode')?.addEventListener('change', e => {
        _persist({ weekMode: e.target.value });
        _rerender(container);
        _rotRefreshPanels(container);   // les colonnes de la grille changent
    });

    root.querySelectorAll('[data-pool-role]').forEach(inp => {
        inp.addEventListener('change', () => {
            const quotas = {};
            root.querySelectorAll('[data-pool-role]').forEach(x => {
                quotas[x.dataset.poolRole] = parseInt(x.value, 10) || 0;
            });
            _persist({ quotas });
            _rerender(container);
        });
    });

    // ── Fusionner deux postes : « ils sont interchangeables pour l'astreinte » ──
    root.querySelectorAll('[data-pool-merge]').forEach(sel => {
        sel.addEventListener('change', () => {
            const other = sel.value;
            if (!other) return;
            const pool   = _pool();
            const target = sel.dataset.poolMerge;
            const roles  = [...posteRoles(target, pool.roleGroups), ...posteRoles(other, pool.roleGroups)];
            const label  = posteLabel(roles);

            const groups = { ...pool.roleGroups };
            delete groups[target];
            delete groups[other];
            groups[label] = roles;

            // Les deux quotas s'ADDITIONNENT : « 2 Dev » + « 1 Tech Lead » veut dire trois
            // personnes par semaine. Garder le max en perdrait une en silence.
            const quotas = { ...pool.quotas };
            const sum = (parseInt(quotas[target], 10) || 0) + (parseInt(quotas[other], 10) || 0);
            delete quotas[target];
            delete quotas[other];
            if (sum) quotas[label] = sum;

            _persist({ roleGroups: groups, quotas });
            toast(`Poste groupé : ${label}`, 'success');
            _rerender(container);
        });
    });

    // ── Séparer un poste groupé : le quota retombe entier sur le 1er rôle ──────
    root.querySelectorAll('[data-pool-split]').forEach(btn => {
        btn.addEventListener('click', () => {
            const pool  = _pool();
            const label = btn.dataset.poolSplit;
            const roles = posteRoles(label, pool.roleGroups);
            const groups = { ...pool.roleGroups };
            delete groups[label];

            const quotas = { ...pool.quotas };
            const q = parseInt(quotas[label], 10) || 0;
            delete quotas[label];
            // Répartir arbitrairement serait une décision qu'on n'a pas à prendre : tout va
            // sur le premier rôle, les autres à 0, à l'utilisateur d'ajuster.
            if (q) quotas[roles[0]] = (parseInt(quotas[roles[0]], 10) || 0) + q;

            _persist({ roleGroups: groups, quotas });
            toast(`Poste séparé : ${roles.join(', ')} — quota reporté sur ${roles[0]}`, 'info');
            _rerender(container);
        });
    });

    // ── Aperçu : on tire, on affiche, on n'écrit rien ────────────────────────
    root.querySelector('#rot-pool-preview')?.addEventListener('click', () => {
        const r = _buildRun();
        if (r.error) { toast(r.error, 'warning'); return; }
        _preview = r;   // le contexte ENTIER : c'est ce tirage-là qui sera enregistré
        _rerender(container);
        toast('Tirage calculé — relisez-le, puis « Enregistrer ce tirage »', 'info');
    });

    root.querySelector('#rot-pool-preview-clear')?.addEventListener('click', () => {
        _preview = null;
        _focusPool = false;   // le focus n'a de sens que le temps de relire un aperçu
        _rerender(container);
    });

    // ── Deux lectures du même tirage ─────────────────────────────────────────
    root.querySelectorAll('[data-pool-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            setPoolView(btn.dataset.poolView);
            _rerender(container);
        });
    });

    // ── Se concentrer sur le pool pendant la relecture ───────────────────────
    root.querySelector('#rot-pool-focus')?.addEventListener('click', () => {
        _focusPool = !_focusPool;
        _rerender(container);
    });

    // ── Copier / Slack : exactement ce que montre le tableau ─────────────────
    const _message = () => {
        const pool = _pool();
        const { weeks, piNum } = _poolWeeks(pool.weekMode);
        return poolCopyMessage({
            pool, weeks, piNum,
            members: _poolMembers(pool.teams, piNum, pool.roleGroups),
            weekMembers: w => _weekMembers(pool, w),
            isPreview: !!_preview,
            label: localStorage.getItem(`rot-pool-label-${_poolKey()}`) || 'Astreinte mutualisée',
        });
    };

    root.querySelector('#rot-pool-copy')?.addEventListener('click', () => {
        // `copyToClipboard` gère le repli execCommand : `navigator.clipboard` est absent
        // hors contexte sécurisé (accès en http par IP LAN) et lève une TypeError synchrone.
        copyToClipboard(_message(), 'Message du pool copié');
    });

    // Clic droit → libellé du rôle, comme sur le bouton Copier d'une équipe
    root.querySelector('#rot-pool-copy')?.addEventListener('contextmenu', async e => {
        e.preventDefault();
        const key = `rot-pool-label-${_poolKey()}`;
        const next = await promptModal('Libellé de l’astreinte mutualisée', {
            value: localStorage.getItem(key) || 'Astreinte mutualisée',
            placeholder: 'Astreinte mutualisée',
            confirmLabel: 'Enregistrer',
        });
        if (next !== null) {
            localStorage.setItem(key, next || 'Astreinte mutualisée');
            toast('Libellé mis à jour — utilisé dans le message copié', 'success');
        }
    });

    root.querySelector('#rot-pool-slack')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        const old = btn.textContent;
        btn.disabled = true; btn.textContent = '…';
        try {
            await api.sendSlackMessage(_message());
            btn.textContent = '✓ Envoyé !';
            setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1800);
        } catch (err) {
            toast(err.message, 'error', 6000);
            btn.textContent = old; btn.disabled = false;
        }
    });

    // ── Enregistrement : le tirage RELU, pas un nouveau ──────────────────────
    root.querySelector('#rot-pool-generate')?.addEventListener('click', async () => {
        const btn = root.querySelector('#rot-pool-generate');
        // Jamais de recalcul ici : le départage des ex-aequo est aléatoire, recalculer
        // enregistrerait un autre tirage que celui affiché. Le bouton est grisé sans aperçu,
        // et tout changement de réglage jette le brouillon (_persist).
        if (!_preview) { toast('Lancez d’abord un aperçu du tirage', 'warning'); return; }
        const { pool, weeks, piNum, run, existingSupport } = _preview;

        // Enregistrer = réécrire : on annonce la casse avant.
        const compo = Object.entries(pool.quotas).filter(([, n]) => n > 0)
            .map(([role, n]) => `${n} ${role}`).join(' + ');
        const divergent = pool.teams.filter(t => getSupportWeekMode(t) !== pool.weekMode);
        const ok = await confirmDanger(`Enregistrer le tirage mutualisé — PI ${piNum || '?'}`, [
            `${compo} chaque semaine, sur ${weeks.length} semaines.`,
            `Équipes : ${pool.teams.join(', ')}.`,
            'La rotation existante de ces équipes est réécrite (passé et semaines verrouillées préservés).',
            divergent.length ? `Jour de bascule aligné sur « ${SUPPORT_WEEK_MODES[pool.weekMode].label} » pour ${divergent.join(', ')}.` : '',
            run.shortfalls.length ? `⚠ ${run.shortfalls.length} créneau(x) resteront non pourvus (vivier trop court).` : '',
        ].filter(Boolean).join('\n'), { confirmLabel: 'Enregistrer', danger: true });
        if (!ok) return;

        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = '⏳ Enregistrement…';
        let done = 0;
        try {
            for (const team of pool.teams) {
                // `bulk` purge TOUTES les lignes de l'équipe : on réinjecte celles qui
                // sortent de la fenêtre du PI affiché (sinon le PI précédent disparaît).
                const carry = carrySupportRowsOutside(existingSupport, team, weeks);
                await api.bulkCreateSupport(team, [...carry, ...(run.rotationsByTeam[team] || [])]);
                done++;
            }
            // Enregistré ⇒ le pool devient actif : c'est ce qui pose le repère ⧉ dans la
            // grille et aligne le jour de bascule des équipes.
            _persist({ enabled: true });   // met aussi _preview à null
            toast(`Tirage enregistré — PI ${piNum || '?'}, ${done} équipe${done > 1 ? 's' : ''}`, 'success');
            await _rotRefreshPanels(container);
            _rerender(container);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    });
}
