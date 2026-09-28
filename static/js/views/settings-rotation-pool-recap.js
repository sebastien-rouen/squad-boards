/**
 * Récapitulatif d'une rotation mutualisée — deux lectures d'un même tirage, et le message
 * prêt à coller. Extrait de settings-rotation-pool.js (3.162.0), qui approchait la limite
 * de 800 lignes ; ce module ne connaît ni le store ni le DOM au-delà du rendu de chaînes.
 *
 * Les deux vues ne répondent PAS à la même question :
 *   - **Par semaine** : « qui est d'astreinte la semaine du 12/06 ? » — la lecture de
 *     tous les jours, celle qu'on colle dans Slack.
 *   - **Par poste** : « la charge est-elle équitablement répartie ? » — une ligne par
 *     personne du vivier, y compris celles JAMAIS tirées : c'est précisément l'absence
 *     de pastille qui révèle un déséquilibre, un tableau des seuls affectés le cacherait.
 *
 * Le rendu ne recalcule jamais un tirage : `weekMembers(w)` est fourni par l'appelant et
 * pointe soit sur le brouillon, soit sur l'état en base.
 */

import {
    esc, posteRoles,
    supportWorkingDays, supportDaysForMember, supportAbsenceDayLevel, supportWeekHead,
    supportAbsenceDays, isSupportAbsent,
} from '../utils.js';

export const POOL_VIEWS = {
    weeks:  { label: '📅 Par semaine', hint: 'Qui est d’astreinte chaque semaine' },
    postes: { label: '👥 Par poste',   hint: 'Comment la charge se répartit dans le vivier' },
};
const _VIEW_KEY = 'rot-pool-view';

export function getPoolView() {
    const v = (typeof localStorage !== 'undefined') ? localStorage.getItem(_VIEW_KEY) : null;
    return POOL_VIEWS[v] ? v : 'weeks';
}
export function setPoolView(v) {
    if (POOL_VIEWS[v]) localStorage.setItem(_VIEW_KEY, v);
}

/** « NOM, Prénom » → « Prénom NOM » (même règle d'affichage que la grille). */
export function fmtMemberName(n) {
    const c = String(n || '').indexOf(',');
    return c < 0 ? n : `${n.slice(c + 1).trim()} ${n.slice(0, c).trim()}`;
}

/** Format court d'une date ISO : « 12 juin ». */
export function fmtShortDate(iso) {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** « @Prénom NOM » — premier mot tel quel, reste en majuscules (même règle que la grille). */
export function slackName(n) {
    const nm = fmtMemberName(n);
    const parts = String(nm).trim().split(/\s+/);
    return parts.length < 2 ? `@${nm}` : `@${parts[0]} ${parts.slice(1).join(' ').toUpperCase()}`;
}

const _dmy = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };

/**
 * Message de rotation du POOL, prêt à coller (Slack/Teams) : une ligne par semaine, les
 * personnes groupées PAR POSTE — c'est tout l'intérêt du pool, un message par équipe ne
 * dirait pas qui tient le rôle de PO cette semaine-là.
 * Un brouillon est annoncé comme tel : on ne poste pas un tirage non enregistré sans le dire.
 */
export function poolCopyMessage({ pool, weeks, piNum, members, weekMembers, isPreview, label }) {
    const roleOf = new Map(members.map(m => [m.name, m.role || '']));
    const realOf = new Map(members.map(m => [m.name, m.realRole || '']));
    const wanted = Object.entries(pool.quotas).filter(([, n]) => n > 0);

    const lines = [`🎧 *${label} — ${pool.teams.join(' · ')} — PI${piNum || '?'}*`];
    if (isPreview) lines.push('_Aperçu — non encore enregistré._');
    lines.push('');
    for (const w of weeks) {
        const names = [...new Set(weekMembers(w))];
        const parts = wanted.map(([poste]) => {
            // Sur un poste groupé, on précise le rôle réel : « Dev + Tech Lead : @X (Dev),
            // @Y (Tech Lead) ». Sans ça le message perd l'information qui a motivé la fusion.
            const grouped = posteRoles(poste, pool.roleGroups).length > 1;
            const hit = names.filter(n => roleOf.get(n) === poste)
                .map(n => (grouped && realOf.get(n)) ? `${slackName(n)} (${realOf.get(n)})` : slackName(n));
            return `${poste} : ${hit.length ? hit.join(', ') : '—'}`;
        });
        lines.push(`  • ${w.label} (${_dmy(w.weekStart)} → ${_dmy(w.weekEnd)}) — ${parts.join(' · ')}`);
    }
    return lines.join('\n');
}

// ── Rendu ───────────────────────────────────────────────────────────────────

/** Pastille + nom + rôle réel (sur un poste groupé seulement). */
function _chip(n, ctx, { extra = false } = {}) {
    const { teamOf, realOf, teamColor, showRealRole } = ctx;
    const team = teamOf.get(n) || '';
    const real = realOf.get(n) || '';
    const cls = `rot-pool-chip${extra ? ' rot-pool-chip--extra' : ''}`;
    const title = extra
        ? esc(real || 'poste inconnu')
        : `${esc(n)} — ${esc(team || '?')}${real ? ` · ${esc(real)}` : ''}`;
    const role = (!extra && showRealRole && real) ? `<em class="rot-pool-chip-role">${esc(real)}</em>` : '';
    return `<span class="${cls}" style="--chip:${teamColor(team)}" title="${title}">${esc(fmtMemberName(n))}${role}</span>`;
}

/** Vue « Par semaine » : lignes = semaines, colonnes = postes. */
function _weeksTable(ctx) {
    const { pool, weeks, wanted, weekMembers, roleOf, isPreview } = ctx;
    const rows = weeks.map(w => {
        const names = [...new Set(weekMembers(w))];
        const cells = wanted.map(([poste, want]) => {
            const grouped = posteRoles(poste, pool.roleGroups).length > 1;
            const hit = names.filter(n => roleOf.get(n) === poste);
            const chips = hit.map(n => _chip(n, { ...ctx, showRealRole: grouped })).join('');
            const ko = hit.length < want;
            return `<td class="rot-pool-cell${ko ? ' is-short' : ''}">${chips || '<span class="rot-pool-hole">—</span>'}
                ${ko ? `<span class="rot-pool-miss">${hit.length}/${want}</span>` : ''}</td>`;
        }).join('');
        // Membres tirés hors des postes quotés (ex: rotation par équipe encore en place)
        const extra = names.filter(n => !wanted.some(([p]) => roleOf.get(n) === p));
        const wh = supportWeekHead(w);
        return `<tr>
            <th class="rot-pool-wk${wh.cls}"${wh.title ? ` title="${wh.title}"` : ''}>${esc(wh.text)}<small>${fmtShortDate(w.weekStart)}</small></th>
            ${cells}
            <td class="rot-pool-cell rot-pool-cell--extra">${extra.map(n => _chip(n, ctx, { extra: true })).join('')}</td>
        </tr>`;
    }).join('');

    return `<div class="table-wrap">
        <table class="rot-pool-table${isPreview ? ' is-preview' : ''}">
            <thead><tr><th class="rot-pool-wk">Semaine</th>
                ${wanted.map(([poste, n]) => `<th>${esc(poste)} <span class="rot-pool-q">×${n}</span></th>`).join('')}
                <th class="text-xs text-muted">Hors composition</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

/**
 * Équité de la charge sur un poste : écart entre le plus et le moins sollicité du vivier.
 *
 * Un écart de 1 est INÉVITABLE — 36 créneaux pour 13 personnes ne tombent pas juste, et le
 * tirage arrondit. Ce qu'on veut signaler commence au-delà : quelqu'un à 4 passages quand un
 * autre est à 0. Le libellé reste factuel plutôt qu'alarmiste, parce qu'un 0 s'explique très
 * souvent par des congés ou une semaine verrouillée, pas par un tirage injuste — l'infobulle
 * le dit, et c'est à l'œil humain de trancher.
 *
 * @returns {{min, max, spread, avg, level: 'ok'|'watch'|'off', label}}
 */
function _equityOf(people, slots) {
    if (!people.length) return null;
    const counts = people.map(m => m.n);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const spread = max - min;
    const avg = slots / people.length;
    const level = spread <= 1 ? 'ok' : (spread === 2 && min > 0) ? 'watch' : 'off';
    return {
        min, max, spread, avg, level,
        label: min === max ? `${min} passage${min > 1 ? 's' : ''} chacun` : `${min}–${max} passages`,
    };
}

/** Marque les extrêmes du poste — et seulement s'il y a vraiment un écart à montrer. */
function _totClass(m, people) {
    const counts = people.filter(x => !x.outsider).map(x => x.n);
    if (!counts.length) return '';
    const min = Math.min(...counts), max = Math.max(...counts);
    if (max - min <= 1) return '';   // arrondi normal du tirage, rien à signaler
    if (m.n === max) return ' is-max';
    if (m.n === min) return ' is-min';
    return '';
}

/**
 * Vue « Par poste » : UNE seule grille au format `rot-grid`, avec les mêmes `rot-strip`
 * jour par jour que la grille par équipe — donc lisible ET modifiable au même endroit,
 * sans avoir à retrouver l'équipe de chacun panneau par panneau.
 *
 * Trois différences assumées avec la grille par équipe :
 *   - les lignes sont groupées par POSTE (séparateur + couverture en pied de groupe), puis
 *     triées par équipe et par prénom ;
 *   - une colonne « Tot. » ferme chaque ligne : c'est l'apport de cette vue, voir d'un coup
 *     qui porte la charge ;
 *   - pas de cadenas dans l'en-tête. Le verrou est un état (équipe, semaine), et une colonne
 *     couvre ici plusieurs équipes : un seul cadenas y mentirait. Il reste dans la grille par
 *     équipe, et les semaines verrouillées sont simplement non modifiables ici.
 *
 * ⚠️ Les pastilles ne sont modifiables que sur l'état RÉEL : en aperçu, elles décrivent un
 * brouillon qui n'existe pas en base, et l'écriture porterait sur une entrée absente.
 */
function _postesGrid(ctx) {
    const { pool, weeks, wanted, weekMembers, roleOf, realOf, teamOf, teamColor, members,
            isPreview, entryOf, absences = [], today, editable } = ctx;

    const byWeek = weeks.map(w => new Set(weekMembers(w)));
    const countOf = n => byWeek.reduce((s, set) => s + (set.has(n) ? 1 : 0), 0);
    const cols = weeks.length + 2;   // membre + semaines + total

    // Une semaine passée n'est pas modifiable (sauf déverrou exceptionnel posé depuis la
    // grille par équipe) — même règle que `_weekLockState`, appliquée équipe par équipe.
    const lockedFor = (team, w) => {
        const e = entryOf ? entryOf(team, w.weekStart) : null;
        return (w.weekEnd < today && !e?.unlocked) || !!e?.locked;
    };

    const weekHead = weeks.map(w => {
        const wh = supportWeekHead(w);
        return `<th class="rot-wk-th${today >= w.weekStart && today <= w.weekEnd ? ' rot-wk-current' : ''}${w.weekEnd < today ? ' rot-wk-past' : ''}${wh.cls}">
        <span class="rot-wk-label"${wh.title ? ` title="${wh.title}"` : ''}>${esc(wh.text)}</span>
        <span class="rot-wk-dates">${fmtShortDate(w.weekStart)}</span>
    </th>`;
    }).join('');

    const body = wanted.map(([poste, want]) => {
        const grouped = posteRoles(poste, pool.roleGroups).length > 1;
        const vivier = members.filter(m => m.role === poste);
        // Une personne affectée mais hors vivier du PI (turnover, ou rotation par équipe
        // antérieure) doit apparaître : sinon son passage manque au décompte affiché.
        const known = new Set(vivier.map(m => m.name));
        const outsiders = [...new Set(byWeek.flatMap(s => [...s]))]
            .filter(n => !known.has(n) && roleOf.get(n) === poste)
            .map(n => ({ name: n, team: teamOf.get(n) || '', realRole: realOf.get(n) || '', outsider: true }));

        // Tri par ÉQUIPE puis par prénom : sur une astreinte mutualisée, la première question
        // posée est « qu'est-ce que chaque équipe fournit ? ». Les personnes sans équipe
        // connue ferment la liste au lieu d'ouvrir le tri alphabétique.
        const people = [...vivier, ...outsiders]
            .map(m => ({ ...m, n: countOf(m.name) }))
            .sort((a, b) =>
                (a.team || '￿').localeCompare(b.team || '￿', 'fr', { sensitivity: 'base' }) ||
                fmtMemberName(a.name).localeCompare(fmtMemberName(b.name), 'fr', { sensitivity: 'base' }));

        const equity = _equityOf(people.filter(m => !m.outsider), want * weeks.length);
        const equityBadge = equity
            ? `<span class="rot-pool-equity is-${equity.level}"
                     title="Écart de charge sur ce poste : ${equity.label} pour ${want * weeks.length} créneaux répartis entre ${vivier.length} personnes (moyenne ${equity.avg.toFixed(1)}).${equity.level === 'ok' ? '' : ' Un écart s’explique souvent par des congés ou une semaine verrouillée — à relire avant de relancer un tirage.'}">⚖️ ${equity.label}</span>`
            : '';

        const sep = `<tr class="rot-poste-sep">
            <th colspan="${cols}">
                <span class="rot-poste-name">${grouped ? '⛓ ' : ''}${esc(poste)}</span>
                <span class="text-xs text-muted">${want}/semaine · ${vivier.length} dans le vivier</span>
                ${equityBadge}
            </th>
        </tr>`;

        const rows = people.map((m, idx) => {
            // Le nom d'équipe n'est porté que par la PREMIÈRE ligne de son bloc : le répéter
            // seize fois noierait les noms. La bande de couleur, elle, court sur toutes les
            // lignes — c'est elle qui rattache une ligne lue seule à son équipe.
            const opensTeam = idx === 0 || people[idx - 1].team !== m.team;
            const cells = weeks.map(w => _stripCell(m, w, poste, { ...ctx, lockedFor, byWeek, weeks })).join('');
            return `<tr class="${m.n ? '' : 'is-idle'}${m.outsider ? ' is-outsider' : ''}${opensTeam && idx ? ' is-team-start' : ''}">
                <td class="rot-member-td rot-pool-person" style="--chip:${teamColor(m.team)}">
                    ${opensTeam ? `<span class="rot-pool-person-team">${esc(m.team || '?')}</span>` : ''}
                    <span class="rot-member-name rot-pool-person-name" title="${esc(m.name)} — ${esc(m.team || '?')}">${esc(fmtMemberName(m.name))}</span>
                    ${grouped && m.realRole ? `<em class="rot-pool-chip-role">${esc(m.realRole)}</em>` : ''}
                    ${m.outsider ? '<em class="rot-pool-chip-role" title="Affecté(e) mais hors du vivier de ce PI">hors vivier</em>' : ''}
                </td>
                ${cells}
                <td class="rot-pool-tot${m.n ? '' : ' is-zero'}${_totClass(m, people)}">${m.n}</td>
            </tr>`;
        }).join('');

        // Couverture réelle du poste, semaine par semaine — le même signal que la vue par
        // semaine, lisible d'un coup sur toute la ligne.
        const cover = `<tr class="rot-count-row rot-pool-cover">
            <td class="rot-member-th">Couverture</td>
            ${weeks.map((w, i) => {
                const n = [...byWeek[i]].filter(x => roleOf.get(x) === poste).length;
                return `<td class="rot-cell rot-count-cell${n < want ? ' rot-count-partial' : ' rot-count-ok'}">${n}/${want}</td>`;
            }).join('')}
            <td class="rot-pool-tot">${want * weeks.length}</td>
        </tr>`;

        return sep + rows + cover;
    }).join('');

    const hint = editable
        ? 'Clic = un jour · double-clic = la semaine — les modifications partent dans la rotation de l’équipe du membre.'
        : 'Aperçu non enregistré : la grille est en lecture seule tant que le tirage n’est pas écrit en base.';

    return `<p class="rot-pool-grid-hint text-xs text-muted">${hint}</p>
    <div class="table-wrap">
        <table class="rot-grid rot-pool-grid${isPreview ? ' is-preview' : ''}">
            <thead>
                <tr>
                    <th class="rot-member-th" rowspan="2">Membre</th>
                    <th colspan="${weeks.length}" class="rot-pi-group-th">PI ${ctx.piNum || '?'}</th>
                    <th class="rot-pool-tot" rowspan="2" title="Nombre de semaines d’astreinte sur le PI">Tot.</th>
                </tr>
                <tr>${weekHead}</tr>
            </thead>
            <tbody>${body}</tbody>
        </table>
    </div>`;
}

/**
 * Une cellule semaine : le même mini-strip que la grille par équipe, avec les mêmes
 * `data-rot-*` — c'est ce qui permet de réutiliser tel quel le câblage `_rotWireDayCells`
 * plutôt que de réécrire la persistance ici.
 */
function _stripCell(m, w, poste, ctx) {
    const { entryOf, absences, today, editable, lockedFor } = ctx;
    const entry  = entryOf ? entryOf(m.team, w.weekStart) : null;
    const days   = supportDaysForMember(entry, m.name);
    // Sans equipe connue (personne affectee hors vivier), il n'y a pas de rotation cible :
    // la cellule reste lisible mais jamais modifiable.
    const locked = !editable || !m.team || lockedFor(m.team, w);
    // Source unique (jours DE la semaine) — cette copie additionnait la durée totale des congés
    const absDays = supportAbsenceDays(m.name, w.weekStart, w.weekEnd, absences);
    const isCur = today >= w.weekStart && today <= w.weekEnd;
    const cls = ['rot-cell',
        isSupportAbsent(absDays) ? 'rot-cell-absent' : absDays > 0 ? 'rot-cell-partial' : '',
        isCur ? 'rot-cell-current' : '',
        locked ? 'rot-cell-locked' : ''].filter(Boolean).join(' ');

    const strip = supportWorkingDays(w.weekStart).map(d => {
        const on  = days.includes(d.index);
        const abs = supportAbsenceDayLevel(m.name, d.iso, absences);
        const absTitle = abs === 'full' ? ' (absent)' : abs === 'half' ? ' (½j congé)' : '';
        return `<button class="rot-day${on ? ' on' : ''}${abs ? ` rot-day-abs-${abs}` : ''}${locked ? ' rot-day-locked' : ''}"
            ${locked ? `disabled title="${editable ? 'Semaine verrouillée' : 'Aperçu — enregistrez le tirage pour modifier'}"` : `title="${d.letter}${absTitle} — clic: ce jour · double-clic: toute la semaine"`}
            data-rot-day="${esc(m.team)}"
            data-member="${esc(m.name)}"
            data-day-index="${d.index}"
            data-week-start="${w.weekStart}"
            data-week-end="${w.weekEnd}"
            data-week-label="${esc(w.label)}"
        >${d.letter}</button>`;
    }).join('');
    return `<td class="${cls}"><span class="rot-strip">${strip}</span></td>`;
}

/**
 * Récapitulatif complet : bandeau (état, vues, actions) + tableau de la vue courante.
 * @param {Object} ctx
 * @param {Object} ctx.pool            config du pool (quotas déjà exprimés en postes)
 * @param {Array}  ctx.weeks           semaines du PI affiché
 * @param {number} ctx.piNum
 * @param {Array}  ctx.members         [{name, team, role, realRole}] du vivier
 * @param {Function} ctx.weekMembers   (w) => noms affectés — brouillon ou état en base
 * @param {Function} ctx.teamColor     (team) => couleur
 * @param {boolean} ctx.isPreview
 * @param {Array}  ctx.shortfalls
 * @param {string} ctx.view            'weeks' | 'postes'
 * @param {boolean} ctx.slackAvailable
 * @param {boolean} ctx.focusable      des équipes hors pool sont affichées dans la grille
 * @param {boolean} ctx.focused        elles sont actuellement masquées
 */
export function poolRecapHtml(ctx) {
    const { pool, weeks, piNum, members, weekMembers, isPreview, shortfalls = [], view,
            slackAvailable, focusable, focused } = ctx;
    if (!pool.teams.length || !weeks.length) return '';
    const wanted = Object.entries(pool.quotas).filter(([, n]) => n > 0);
    if (!wanted.length) return '';

    // Rien en base et pas d'aperçu : douze lignes de tirets ne disent rien. On invite à
    // tirer plutôt que d'afficher un tableau vide qu'on prendrait pour un échec.
    if (!isPreview && !weeks.some(w => weekMembers(w).length)) {
        return `<p class="rot-pool-empty text-xs text-muted">
            Aucune rotation enregistrée sur ces équipes pour le PI ${piNum || '?'}.
            Lancez un <strong>aperçu du tirage</strong> pour voir la composition proposée.
        </p>`;
    }

    const full = {
        ...ctx,
        wanted,
        roleOf: new Map(members.map(m => [m.name, m.role || ''])),
        realOf: new Map(members.map(m => [m.name, m.realRole || ''])),
        teamOf: new Map(members.map(m => [m.name, m.team])),
    };
    const total = wanted.reduce((s, [, n]) => s + n, 0);

    const warn = shortfalls.length
        ? `<p class="rot-pool-warn">⚠️ ${shortfalls.length} créneau(x) non pourvu(s) — vivier trop court sur : ${[...new Set(shortfalls.map(s => s.role))].map(esc).join(', ')}. Le manque n'est jamais comblé par un autre poste.</p>`
        : '';

    const viewBtns = Object.entries(POOL_VIEWS).map(([k, v]) =>
        `<button type="button" class="btn btn-xs ${k === view ? 'btn-primary' : 'btn-secondary'}"
                 data-pool-view="${k}" title="${esc(v.hint)}" aria-pressed="${k === view}">${v.label}</button>`
    ).join('');

    // Le focus n'est proposé QUE pendant un aperçu : c'est le moment où la grille des autres
    // équipes n'est que du bruit autour du tirage qu'on relit.
    const focusBtn = (isPreview && focusable)
        ? `<button type="button" class="btn btn-xs ${focused ? 'btn-primary' : 'btn-secondary'}" id="rot-pool-focus"
                   aria-pressed="${focused}"
                   title="${focused ? 'Réafficher toutes les équipes dans la grille ci-dessous' : 'Masquer, dans la grille ci-dessous, les équipes qui ne sont pas dans le pool'}">${focused ? '👁 Toutes les équipes' : '🙈 Masquer les équipes hors pool'}</button>`
        : '';

    return `<div class="rot-pool-recap-hdr">
            <strong class="text-sm">${isPreview ? 'Aperçu (non enregistré)' : 'Rotation actuelle'}</strong>
            <span class="text-xs text-muted">PI ${piNum || '?'} · ${total} personne${total > 1 ? 's' : ''}/semaine</span>
            <div class="rot-pool-views">${viewBtns}</div>
            <div class="rot-pool-recap-actions">
                ${focusBtn}
                <button type="button" class="btn btn-xs btn-secondary" id="rot-pool-copy"
                        title="Copier le message de rotation du pool (une ligne par semaine, groupé par poste). Clic droit = personnaliser le libellé.">📋 Copier</button>
                ${slackAvailable ? '<button type="button" class="btn btn-xs btn-secondary" id="rot-pool-slack" title="Envoyer ce message dans Slack">💬 Slack</button>' : ''}
                ${isPreview ? '<button type="button" class="btn btn-xs btn-secondary" id="rot-pool-preview-clear">Revenir à l’état réel</button>' : ''}
            </div>
        </div>
        ${warn}
        ${view === 'postes' ? _postesGrid(full) : _weeksTable(full)}`;
}

