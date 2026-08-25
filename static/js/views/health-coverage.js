/**
 * Couverture de l'historique — depuis quand les statistiques de cette page mesurent-elles
 * réellement quelque chose.
 *
 * L'import JIRA ne rapatrie pas « tout l'historique » : il rapatrie deux profondeurs
 * DIFFÉRENTES, et rien ne le disait à l'écran.
 *
 *   ⚡ Métadonnées de sprint (dates + vélocité Greenhopper) → `closedKeep` sprints/board.
 *   🎫 Détail des tickets (cycle time, engagement, scope creep) → `closedTicketSprints`.
 *
 * Le second est bien plus court que le premier (6 sprints contre 20 par défaut). Au-delà,
 * la base contient encore des tickets — mais UNIQUEMENT ceux que les passes JQL (features,
 * epics, labels) ramènent au passage, c'est-à-dire ce qui traîne encore ouvert. Une moyenne
 * calculée là-dessus ne mesure pas une équipe : elle mesure ses restes. D'où ce bandeau,
 * qui nomme la limite au lieu de la laisser deviner.
 *
 * ⚠️ Ce module ne se fie PAS à `createdAt` : jusqu'à la v3.143.1 le backend y écrivait la
 * date d'INSERTION locale, si bien que tous les tickets d'un même import portaient la même
 * seconde. La profondeur se déduit donc des SPRINTS, dont les dates JIRA sont fiables,
 * croisés avec le nombre de tickets que chacun porte encore.
 */

import { esc, extractSprintLabel } from '../utils.js';
import { SYNC_DEFAULTS, syncSetting } from '../config.js';

/**
 * En dessous de ce nombre de tickets, un sprint clos n'est pas « couvert » : c'est un
 * résidu. Mesuré sur le parc au 25/08/2026 — les PI 21 à 28 totalisent une poignée de
 * tickets par équipe là où les PI 29-30 en portent 20 à 50. Les compter comme couverts
 * annoncerait 2 ans d'historique pour 3 mois de données réelles.
 */
const MIN_TICKETS_PER_SPRINT = 5;

const MS_PER_DAY = 86400000;

/** Ancienneté d'une date ISO, en mois pleins (0 si absente ou future). */
function _monthsSince(iso) {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, Math.round((Date.now() - t) / MS_PER_DAY / 30.44));
}

/** « ~9 mois », ou des semaines en dessous de 2 mois (« ~9 mois » pour 6 semaines mentirait). */
function _fmtAge(iso) {
    if (!iso) return '—';
    const months = _monthsSince(iso);
    if (months >= 2) return `~${months} mois`;
    const weeks = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / MS_PER_DAY / 7));
    return `~${weeks} sem.`;
}

/** « nov. 2025 » */
function _fmtMonth(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

/** Médiane entière d'une liste de nombres (0 si vide). */
function _median(nums) {
    if (!nums.length) return 0;
    const s = nums.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Médiane de dates ISO — la date « typique » du parc, pas celle de son maillon faible. */
function _medianDate(isos) {
    const ts = isos.filter(Boolean).map(d => new Date(d).getTime()).filter(n => !isNaN(n));
    if (!ts.length) return null;
    ts.sort((a, b) => a - b);
    return new Date(ts[ts.length >> 1]).toISOString();
}

/**
 * Profondeur d'historique réellement disponible, par équipe puis agrégée.
 *
 * @param {object}   p
 * @param {string[]} p.teamsScope  équipes du périmètre courant (filtre topbar déjà appliqué)
 * @param {object[]} p.tickets     tous les tickets connus
 * @param {object}   p.sprintInfo  `store.get('sprintInfo')` — porte `teamSprints[]`
 * @returns {object|null} null si aucun sprint JIRA n'est connu (site autoporteur, sans plugin)
 */
export function computeCoverage({ teamsScope = [], tickets = [], sprintInfo = {} } = {}) {
    const allSprints = sprintInfo?.teamSprints || [];
    if (!allSprints.length || !teamsScope.length) return null;

    // Index tickets par équipe — un seul passage. `t.team === tm` est l'appariement utilisé
    // partout ailleurs dans la vue (filterByTeam, teamSprints) : s'en écarter ici ferait
    // diverger le bandeau des chiffres qu'il annonce.
    const byTeam = new Map(teamsScope.map(tm => [tm, []]));
    for (const t of tickets) {
        const bucket = byTeam.get(t.team);
        if (bucket) bucket.push(t);
    }

    const teams = [];
    for (const tm of teamsScope) {
        const closed = allSprints
            .filter(s => s.team === tm && s.state === 'closed' && s.startDate)
            .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        if (!closed.length) continue;

        // ⚠️ ON COMPTE LA PRÉSENCE ACTUELLE (`sprintName`), PAS LE PÉRIMÈTRE ENGAGÉ.
        // C'est l'inverse de la règle habituelle de utils/sprint-scope.js, et pour une
        // raison précise : la question posée ici n'est pas « qu'a engagé ce sprint ? » mais
        // « ce sprint a-t-il été rapatrié ? ». Or la passe d'import interroge
        // `/sprint/{id}/issue`, qui ne rend que les tickets S'Y TROUVANT — un ticket reporté
        // est rapatrié par son sprint d'ARRIVÉE, jamais par celui qu'il a quitté.
        //
        // Passer par `sprintNamesOf()` (union des sprints traversés) comptait donc comme
        // « couverts » des sprints que rien n'a importés : un ticket zombie reporté quinze
        // fois les crédite tous. Mesuré sur le parc au 25/08/2026 — 101 sprints annoncés
        // contre 60 réellement rapatriés, et jusqu'à 19 contre 6 sur Initiale. Un bandeau
        // qui promet trois fois la profondeur disponible est pire que pas de bandeau.
        //
        // Contrepartie assumée : ce compte SOUS-ESTIME un peu (JIRA vide les sprints clos de
        // leurs non-finis). Sur une annonce de couverture, l'erreur prudente est la bonne.
        const counts = new Map();
        for (const t of byTeam.get(tm) || []) {
            const sn = t.sprintName || t.sprint_name || '';
            if (!sn) continue;
            counts.set(sn, (counts.get(sn) || 0) + 1);
            const k = extractSprintLabel(sn);
            // La clé NN.N ne distingue pas les équipes entre elles : elle n'est utilisable
            // que parce que `byTeam` a déjà restreint le lot à une seule équipe.
            if (k && k !== sn) counts.set(k, (counts.get(k) || 0) + 1);
        }
        const nbOf = s => Math.max(counts.get(s.name) || 0, counts.get(extractSprintLabel(s.name)) || 0);

        const withAny = closed.filter(s => nbOf(s) > 0);
        const solid   = closed.filter(s => nbOf(s) >= MIN_TICKETS_PER_SPRINT);
        teams.push({
            team: tm,
            closedCount: closed.length,
            metaSince: closed[0].startDate,
            anyCount: withAny.length,
            solidCount: solid.length,
            solidSince: solid.length ? solid[0].startDate : null,
            thinCount: withAny.length - solid.length,
        });
    }
    if (!teams.length) return null;

    const caps = {
        closedKeep: syncSetting('closedKeep') || SYNC_DEFAULTS.closedKeep,
        closedTicketSprints: syncSetting('closedTicketSprints'),
    };
    const metaCount   = _median(teams.map(t => t.closedCount));
    const solidCount  = _median(teams.map(t => t.solidCount));
    // Le plancher : l'équipe la moins couverte en tickets. C'est elle qui limite toute
    // comparaison inter-équipes, et la médiane seule la masquerait.
    const floor = teams.slice().sort((a, b) =>
        a.solidCount - b.solidCount || a.team.localeCompare(b.team, 'fr'))[0];

    return {
        teams: teams.slice().sort((a, b) =>
            a.solidCount - b.solidCount || a.team.localeCompare(b.team, 'fr')),
        // « plafonné » = la profondeur bute sur le RÉGLAGE, pas sur ce que JIRA contient.
        // C'est le signal qui dit « augmente le paramètre », à ne pas confondre avec une
        // équipe jeune qui n'a simplement pas plus de sprints derrière elle.
        meta:   { count: metaCount,  since: _medianDate(teams.map(t => t.metaSince)),
                  capped: metaCount >= caps.closedKeep },
        ticket: { count: solidCount, since: _medianDate(teams.map(t => t.solidSince)),
                  capped: caps.closedTicketSprints > 0
                       && _median(teams.map(t => t.anyCount)) >= caps.closedTicketSprints,
                  disabled: caps.closedTicketSprints === 0 },
        floor,
        caps,
        minTickets: MIN_TICKETS_PER_SPRINT,
    };
}

const OPEN_KEY = 'sb-health-coverage-open';

function _rowHtml({ icon, label, desc, count, since, capped, tone }) {
    const capChip = capped
        ? `<span class="hcov-chip hcov-chip--warn" title="La profondeur bute sur le réglage, pas sur ce que contient JIRA : augmente-le dans Paramètres → Plugin JIRA pour remonter plus loin.">⚠ plafonné par le réglage</span>`
        : '';
    return `
        <div class="hcov-row hcov-row--${tone}">
            <span class="hcov-row-icon" aria-hidden="true">${icon}</span>
            <div class="hcov-row-main">
                <div class="hcov-row-label">${esc(label)}</div>
                <div class="hcov-row-desc">${esc(desc)}</div>
            </div>
            <div class="hcov-row-figs">
                <span class="hcov-fig"><strong>${count}</strong> sprint${count > 1 ? 's' : ''}</span>
                <span class="hcov-fig hcov-fig--age">${esc(_fmtAge(since))}</span>
                <span class="hcov-fig hcov-fig--since">depuis ${esc(_fmtMonth(since))}</span>
            </div>
            ${capChip}
        </div>`;
}

/**
 * Bandeau « Couverture de l'historique ». Rendu en lecture seule : il ne change aucun
 * chiffre de la page, il dit ce que ces chiffres valent.
 * @param {object|null} cov  sortie de `computeCoverage` — '' si null (aucun sprint JIRA)
 */
export function coverageBannerHtml(cov) {
    if (!cov) return '';
    const { meta, ticket, floor, teams, caps, minTickets } = cov;
    const open = localStorage.getItem(OPEN_KEY) === '1';

    // La réserve est le cœur du bandeau : sans elle, deux chiffres côte à côte laisseraient
    // croire que la période la plus longue est exploitable de bout en bout.
    const gap = meta.count - ticket.count;
    const caveat = ticket.disabled
        ? `Le détail des tickets des sprints clos est <strong>désactivé</strong> (réglage à 0) : seule la vélocité reste historisée.`
        : gap > 0
            ? `Avant <strong>${esc(_fmtMonth(ticket.since))}</strong>, la base ne garde que les tickets encore ouverts — ramassés au passage par les requêtes features/epics, pas rapatriés pour eux-mêmes. Tout ce qui compte des tickets un par un (cycle time, engagement, périmètre ajouté en cours de sprint) n'est représentatif <strong>qu'à partir de cette date</strong>. La vélocité, elle, remonte plus loin : elle vient des métadonnées de sprint.`
            : `Les deux profondeurs coïncident : tout l'historique de sprint connu porte aussi ses tickets.`;

    const floorNote = (floor && floor.solidCount < ticket.count)
        ? `<p class="hcov-floor">Maillon faible : <strong>${esc(floor.team)}</strong> — ${floor.solidCount} sprint${floor.solidCount > 1 ? 's' : ''} exploitable${floor.solidCount > 1 ? 's' : ''}${floor.solidSince ? ` (depuis ${esc(_fmtMonth(floor.solidSince))})` : ''}. Toute comparaison entre équipes est bornée par elle.</p>`
        : '';

    return `
        <details class="hcov" ${open ? 'open' : ''}>
            <summary class="hcov-summary">
                <span class="hcov-title">📅 Couverture de l'historique</span>
                <span class="hcov-teaser">vélocité ${esc(_fmtAge(meta.since))} · tickets ${esc(_fmtAge(ticket.since))}</span>
                <span class="hcov-toggle" aria-hidden="true"></span>
            </summary>
            <div class="hcov-body">
                ${_rowHtml({
                    icon: '⚡', tone: 'velo',
                    label: 'Vélocité & tendances',
                    desc: 'Métadonnées de sprint (dates, points livrés) — 1 appel JIRA par board',
                    count: meta.count, since: meta.since, capped: meta.capped,
                })}
                ${_rowHtml({
                    icon: '🎫', tone: 'tickets',
                    label: 'Détail des tickets',
                    desc: `Cycle time, engagement, scope creep — sprints portant au moins ${minTickets} tickets`,
                    count: ticket.count, since: ticket.since, capped: ticket.capped,
                })}
                <p class="hcov-caveat">ⓘ ${caveat}</p>
                ${floorNote}
                <div class="hcov-table-wrap">
                <table class="hcov-table">
                    <caption class="hcov-table-cap">Profondeur par équipe — de la moins couverte à la mieux couverte</caption>
                    <thead>
                        <tr>
                            <th scope="col">Équipe</th>
                            <th scope="col" title="Sprints clos connus (dates + vélocité)">⚡ Sprints</th>
                            <th scope="col" title="Début du plus ancien sprint clos connu">Depuis</th>
                            <th scope="col" title="Sprints clos portant au moins ${minTickets} tickets">🎫 Exploitables</th>
                            <th scope="col" title="Début du plus ancien sprint exploitable">Depuis</th>
                            <th scope="col" title="Sprints clos où il ne reste qu'une poignée de tickets — non représentatifs">Résiduels</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teams.map(t => `
                        <tr>
                            <th scope="row">${esc(t.team)}</th>
                            <td>${t.closedCount}</td>
                            <td class="hcov-td-date">${esc(_fmtMonth(t.metaSince))}</td>
                            <td class="${t.solidCount ? '' : 'hcov-td-none'}">${t.solidCount || '—'}</td>
                            <td class="hcov-td-date">${esc(_fmtMonth(t.solidSince))}</td>
                            <td class="hcov-td-thin">${t.thinCount || '—'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                </div>
                <p class="hcov-hint">
                    Réglages actuels : <code>${caps.closedKeep}</code> sprints de vélocité,
                    <code>${caps.closedTicketSprints}</code> sprints de tickets, par board —
                    <a href="#settings/jira">Paramètres → Plugin JIRA</a>.
                </p>
            </div>
        </details>`;
}

/** Persiste l'état déplié du bandeau — un seul listener, remplacé à chaque rendu. */
export function wireCoverageBanner(container) {
    const el = container.querySelector('.hcov');
    if (!el) return;
    el.addEventListener('toggle', () => {
        localStorage.setItem(OPEN_KEY, el.open ? '1' : '0');
    });
}
