/**
 * 🧭 Volet « Cadrage » de la page Affinage (views/refinement.js) — rendu seul ; la sélection vit dans
 * `cadrageModel` (utils/cadrage.js).
 *
 * Trois colonnes (SA, PO / PM, contributeur), une carte par ticket : statut JIRA, macro-estimation,
 * personnes DANS L'ORDRE JIRA (contributeurs, porteur, rapporteur — noms tels qu'affichés par JIRA,
 * membres de l'équipe surlignés), étiquettes de rôle des AUTRES périmètres (qui d'autre cadre avec nous).
 * Actions câblées par la vue : `data-rf-open` (modale), `data-rf-poker` (macro-estimation),
 * `data-rf-cad-toggle` (replier), `data-rf-cad-done` (masquer les prêts), `data-rf-cad-more` (déplier une colonne),
 * `data-rf-cad-pi` (choix des PI : « auto » ou un numéro, bascule — 3.247.0).
 */
import { esc, typeBadge, pointsTone, labelChipHtml, getStatusLabel, emptyStateHtml, samePerson } from '../utils.js';

const _ROLE_LABEL_RE = /^(SA|PO|PM|UX)-/i;
const _pct = (n, d) => (d ? Math.round(n / d * 100) : 0);
const _PREVIEW = 6;   // cartes par colonne avant « Afficher les N autres »

function _personHtml(name, role, members) {
    const mine = members.some(m => samePerson(m, name));
    const tip = { contrib: 'Contributeur', leader: 'Porteur (assigné JIRA)', reporter: 'Rapporteur' }[role];
    return `<span class="rf-cad-person rf-cad-person--${role}${mine ? ' is-mine' : ''}" title="${esc(`${tip}${mine ? ' · membre de l\'équipe' : ''}`)}">${esc(name)}</span>`;
}

function _peopleHtml(t, members) {
    const contribs = (t.contributors || []).filter(Boolean);
    const parts = [
        ...contribs.map(n => _personHtml(n, 'contrib', members)),
        t.leader ? _personHtml(t.leader, 'leader', members) : '<span class="rf-cad-person rf-cad-person--none" title="Personne n\'est assigné dans JIRA">sans porteur</span>',
        t.reporter && t.reporter !== t.leader ? _personHtml(t.reporter, 'reporter', members) : '',
    ];
    return `<div class="rf-cad-people">${parts.join('')}</div>`;
}

function _itemHtml({ t, pi, members }, model, acceptance) {
    const done = t.status === 'done';
    const pts = Number(t.points) > 0 ? Number(t.points) : 0;
    const own = model.perimeter.product;
    // Rôles d'AUTRES périmètres : montre qui co-cadre (SA-GEX, PM-GDC…), le nôtre est déjà le titre de colonne.
    const others = (t.labels || []).filter(l => _ROLE_LABEL_RE.test(l) && !String(l).toUpperCase().endsWith(`-${own}`));
    const acc = acceptance(t);
    return `<li class="rf-cad-item${done ? ' is-done' : ''}" data-s="${esc(t.status || 'todo')}" data-rf-row="${esc(t.id)}" tabindex="0" title="Ouvrir ${esc(t.id)} — ${esc(t.title || '')}">
        <div class="rf-cad-item-head">
            ${t.type !== 'task' ? typeBadge(t.type, { size: '2xs' }) : ''}
            <button type="button" class="rf-id" data-rf-open="${esc(t.id)}" title="Ouvrir le ticket">${esc(t.id)}</button>
            ${model.auto ? (pi < model.targetPi ? `<span class="rf-cad-late" title="Étiquette Cadrage_PI${pi} : cadrage du PI en cours, pas encore terminé">↩ PI ${pi}</span>` : '')
                : model.pis.length > 1 ? `<span class="rf-cad-pi-tag" title="Étiquette Cadrage_PI${pi}">PI ${pi}</span>` : ''}
            <span class="rf-cad-status" title="Statut JIRA">${done ? '✅ ' : ''}${esc(getStatusLabel(t))}</span>
            ${pts ? `<span class="mdl-points pts-tone--${pointsTone(pts).key}" title="Macro-estimation">${pts}<small>pts</small></span>`
                : '<span class="rf-cad-nopts" title="Pas encore macro-estimé">? pts</span>'}
        </div>
        <p class="rf-cad-item-title">${esc(t.title || '')}</p>
        ${_peopleHtml(t, members)}
        ${others.length || acc !== 'ok' || (!done && !pts) ? `<div class="rf-cad-item-foot">
            ${acc === 'empty' ? '<span class="rf-warn rf-warn--empty" title="Pas de description dans JIRA" aria-label="Sans description">📝</span>' : ''}
            ${acc === 'missing' ? '<span class="rf-warn" title="Story sans critère d\'acceptation repéré" aria-label="Sans critères d\'acceptation">⚠️</span>' : ''}
            ${others.map(l => labelChipHtml(l)).join('')}
            ${!done && !pts ? `<button type="button" class="btn btn-secondary btn-sm rf-cad-go" data-rf-poker="${esc(t.id)}" title="Ouvrir le Poker sur ce ticket">🃏 Macro-estimer</button>` : ''}
        </div>` : ''}
    </li>`;
}

/** Sélecteur de PI : « ✨ Auto » + une puce par PI (nombre de tickets, repère cible / en cours), multi-choix. */
function _piPickerHtml(model) {
    const on = new Set(model.auto ? [model.targetPi, ...model.pis] : model.pis);
    const chip = a => {
        const pressed = on.has(a.pi);
        const tag = a.target ? '<em>cible</em>' : a.current ? '<em>en cours</em>' : '';
        const tip = `PI ${a.pi} : ${a.total} ticket${a.total > 1 ? 's' : ''} de cadrage (${a.done} prêt${a.done > 1 ? 's' : ''}, ${a.open} ouvert${a.open > 1 ? 's' : ''})`
            + (model.auto && a.current ? ' — en automatique, seuls les ouverts sont affichés' : '');
        return `<button type="button" class="rf-cad-pi${pressed ? ' is-on' : ''}${a.target ? ' is-target' : ''}${!a.total ? ' is-empty' : ''}"
            data-rf-cad-pi="${a.pi}" aria-pressed="${pressed}" title="${esc(tip)}">
            <span class="rf-cad-pi-check" aria-hidden="true"></span>PI ${a.pi}${tag}<b>${a.total}</b></button>`;
    };
    const pair = !model.auto && model.pis.length === 2 && model.pis[0] === model.piNum && model.pis[1] === model.targetPi;
    const todo = model.items.filter(x => x.t.status !== 'done' && !(Number(x.t.points) > 0)).length;
    return `<div class="rf-cad-pis" role="group" aria-label="PI du cadrage — plusieurs choix possibles">
        <button type="button" class="rf-cad-pi rf-cad-pi--auto${model.auto ? ' is-on' : ''}" data-rf-cad-pi="auto" aria-pressed="${model.auto}"
            title="Automatique : le PI suivant (cible) + les cadrages du PI en cours encore ouverts">✨ Auto</button>
        <button type="button" class="rf-cad-pi rf-cad-pi--auto${pair ? ' is-on' : ''}" data-rf-cad-pi="pair" aria-pressed="${pair}"
            title="PI ${model.piNum} et PI ${model.targetPi} en entier, prêts compris">📅 Ce PI + suivant</button>
        <span class="rf-cad-pis-sep" aria-hidden="true"></span>
        ${model.available.map(chip).join('')}
        ${todo ? `<button type="button" class="btn btn-primary btn-sm rf-cad-play" data-rf-cad-play
            title="Ouvre le Poker sur le premier ; « ⏭ Suivant » n'enchaîne que sur ces ${todo} tickets">🃏 Macro-estimer les ${todo}</button>` : ''}
    </div>`;
}

function _colHtml(g, model, opts) {
    const p = model.perimeter;
    const scope = g.key === 'sa' ? `SA-${p.product}` : g.key === 'po' ? `PO / PM-${p.product}` : ['équipe', ...p.tags].join(' · ');
    const shown = opts.hideDone ? g.items.filter(x => x.t.status !== 'done') : g.items;
    const limit = opts.expanded.has(g.key) ? Infinity : _PREVIEW;
    return `<section class="rf-cad-col" data-role="${g.key}" aria-label="${esc(g.label)}">
        <h4 class="rf-cad-col-title">
            <span class="rf-cad-col-icon" aria-hidden="true">${g.icon}</span>
            <span class="rf-cad-col-name">${esc(g.label)}<small>${esc(scope)}</small></span>
            <span class="rf-cad-col-count" title="${g.done} ${g.done > 1 ? 'prêts' : 'prêt'} sur ${g.items.length}">${g.done}/${g.items.length}</span>
        </h4>
        <span class="rf-cad-bar" aria-hidden="true"><i style="--p:${_pct(g.done, g.items.length)}%"></i></span>
        ${shown.length ? `<ol class="rf-cad-list">${shown.slice(0, limit).map(x => _itemHtml(x, model, opts.acceptance)).join('')}</ol>
            ${shown.length > limit ? `<button type="button" class="rf-more rf-cad-more" data-rf-cad-more="${g.key}">Afficher les ${shown.length - limit} autres</button>` : ''}`
            : `<p class="rf-cad-empty">${g.items.length ? 'Tout est prêt 🎉' : 'Aucun ticket de cadrage pour ce rôle.'}</p>`}
    </section>`;
}

/**
 * @param {object} model   `cadrageModel(...)`
 * @param {object} opts    `open`, `hideDone`, `expanded` (Set des colonnes dépliées), `acceptance(t)` → 'ok' | 'empty' | 'missing'
 */
export function cadrageSectionHtml(model, { open = true, hideDone = false, expanded = new Set(), acceptance = () => 'ok' } = {}) {
    const p = model.perimeter;
    const pct = _pct(model.done, model.total);
    const scope = [p.product, ...p.tags].filter(Boolean).join(' · ') || 'périmètre inconnu';
    const piLabel = model.auto || !model.pis.length ? `PI ${model.targetPi}` : `PI ${model.pis.join(' · ')}`;
    return `<section class="card rf-cad${open ? ' is-open' : ''}" aria-labelledby="rf-cad-title">
        <header class="rf-cad-head" title="${open ? 'Replier' : 'Déplier'} le cadrage">
            <span class="rf-cad-ring" style="--p:${pct}" role="img" aria-label="${pct} % des tickets de cadrage prêts"><b>${pct}<small>%</small></b></span>
            <div class="rf-cad-head-main">
                <h3 id="rf-cad-title" class="rf-cad-title"><span class="rf-cad-tag">🧭 Cadrage</span> ${piLabel}
                    <span class="rf-cad-scope">${esc(scope)}</span></h3>
                <p class="rf-cad-sub">${model.auto
                    ? `À préparer avant le PI ${model.targetPi} : sujets prêts et macro-estimés
                    — étiquette <code>Cadrage_PI${model.targetPi}</code>${model.openCurrent ? `, + ${model.openCurrent} cadrage${model.openCurrent > 1 ? 's' : ''} du PI ${model.piNum} encore ouvert${model.openCurrent > 1 ? 's' : ''}` : ''}.`
                    : `Étiquette${model.pis.length > 1 ? 's' : ''} ${model.pis.map(n => `<code>Cadrage_PI${n}</code>`).join(' ')} — tous statuts, prêts compris.`}
                    ${!open && model.total ? `<span class="rf-cad-peek">▸ Voir les ${model.total} ticket${model.total > 1 ? 's' : ''}</span>` : ''}</p>
                ${!open && model.total ? `<span class="rf-cad-minis" aria-label="Avancement par rôle">${model.groups.map(g =>
                    `<span class="rf-cad-mini" data-role="${g.key}" title="${esc(`${g.label} : ${g.done} prêt${g.done > 1 ? 's' : ''} sur ${g.items.length}`)}">
                        <span aria-hidden="true">${g.icon}</span>${esc(g.label.replace(/^En tant que /i, '').replace(/^./, c => c.toUpperCase()))} <b>${g.done}/${g.items.length}</b>
                        <span class="rf-cad-mini-bar" aria-hidden="true"><i style="--p:${_pct(g.done, g.items.length)}%"></i></span></span>`).join('')}</span>` : ''}
            </div>
            <div class="rf-cad-kpis">
                <span class="rf-cad-kpi"><b>${model.done}/${model.total}</b> prêts</span>
                <span class="rf-cad-kpi${model.unestimated ? ' rf-cad-kpi--warn' : ''}"><b>${model.unestimated}</b> sans macro-estimation</span>
                ${model.auto && model.openCurrent ? `<span class="rf-cad-kpi rf-cad-kpi--late" title="Étiquette Cadrage_PI${model.piNum}, pas encore terminés"><b>${model.openCurrent}</b> du PI ${model.piNum}</span>` : ''}
                ${open && model.done ? `<button type="button" class="rf-fix-toggle rf-cad-hide${hideDone ? ' is-on' : ''}" data-rf-cad-done aria-pressed="${hideDone}">${hideDone ? 'Afficher les prêts' : 'Masquer les prêts'}</button>` : ''}
                <button aria-label="${open ? 'Replier' : 'Déplier'} le cadrage" type="button" class="btn-icon rf-cad-toggle" data-rf-cad-toggle aria-expanded="${open}" aria-controls="rf-cad-body"
                    title="${open ? 'Replier' : 'Déplier'} le cadrage"><svg class="icon icon-sm"><use href="#i-chevron-down"/></svg></button>
            </div>
            ${_piPickerHtml(model)}
        </header>
        ${open ? `<div id="rf-cad-body" class="rf-cad-cols">${model.total
            ? model.groups.map(g => _colHtml(g, model, { hideDone, expanded, acceptance })).join('')
            : emptyStateHtml({ icon: '🧭', title: 'Aucun ticket de cadrage',
                text: `Aucun ticket étiqueté ${(model.auto ? [model.targetPi] : model.pis).map(n => `Cadrage_PI${n}`).join(' / ')} sur le périmètre ${scope}.` })}</div>` : ''}
    </section>`;
}
