/**
 * Détecteur d'évènements d'agenda — SOURCE UNIQUE (carte « Agenda de l'équipe », bandeau calendrier).
 *
 * Deux axes INDÉPENDANTS :
 *   - la NATURE, déduite du titre par des règles ordonnées (la plus spécifique d'abord) ;
 *   - la PORTÉE, déduite du calendrier source (`team_calendar.team`) : équipe, groupe (« A,B,C »),
 *     train (champ vide) ou opérations.
 * La « Démonstration d'itération » du train et la « Répétition démo » d'une équipe ont la même
 * nature, pas la même portée : c'est ce qui rend la comparaison entre équipes lisible.
 *
 * Mesuré sur les 3 580 évènements réels (maquette static/mockups/team-calendar/) : 97,3 % rangés.
 * Le reste (« (🪄✨) », « Bastions ! ») se positionne à la main : table `calendar_rule`, une règle
 * par titre normalisé (`calNorm`) — la même fonction côté règle et côté évènement, sinon la règle
 * ne s'applique plus.
 */

export const CAL_NATURES = {
    daily:     { label: 'Daily',                  emoji: '🌅' },
    planning:  { label: 'Planning',               emoji: '🎯' },
    affinage:  { label: 'Affinage',               emoji: '🔍' },
    demo:      { label: 'Démo',                   emoji: '🎤' },
    retro:     { label: 'Rétro',                  emoji: '🔁' },
    train:     { label: 'Train SAFe',             emoji: '🚂' },
    community: { label: 'Communauté & formation', emoji: '🤝' },
    sync:      { label: 'Synchro & 1:1',          emoji: '💬' },
    release:   { label: 'Livraison & tech',       emoji: '🚀' },
    support:   { label: 'Support',                emoji: '🛎️' },
    off:       { label: 'Absence',                emoji: '🏖️' },
    busy:      { label: 'Détails masqués',        emoji: '🔒' },
    focus:     { label: 'Temps protégé',          emoji: '🎧' },
    other:     { label: 'Autre',                  emoji: '📌' },
};

export const CAL_SCOPES = {
    team:  { label: 'Équipe',     icon: '👥' },
    group: { label: 'Groupe',     icon: '🧩' },
    train: { label: 'Train ERPC', icon: '🚂' },
    ops:   { label: 'Opérations', icon: '⚙️' },
};

// Règles ORDONNÉES — la première qui correspond gagne, testées sur le titre normalisé.
// Chaque piège réel rencontré est commenté : ne pas réordonner sans relire.
const RULES = [
    // Personnes d'abord. « Sacha - OFF », « Thomas - OFF matin », « THAM OFF PM » — jamais « Kick off »
    ['off',       /-\s*[^-]*\boff(\s(am|pm|matin|apres[- ]?midi|aprem))?\s*$|^(?!.*kick)[a-z][a-z.' ]{1,24}\s(1\/2\s)?off(\s(am|pm|matin|apres[- ]?midi|aprem))?$/],
    ['focus',     /deep\s*work|pas de reunion|\bfocus\b|no\s*meeting/],
    // « Busy » : agenda partagé en « disponibilités seulement » (Lion) — titre masqué par Google
    ['busy',      /^(busy|occupe|indisponible|prive)$/],
    ['support',   /^support\b|passation support|point support|monitoring prod|astreinte/],
    // Train avant « planning » : « ERPC - PI Planning - Plénière » n'est PAS un sprint planning
    ['train',     /pi\s*planning|pleniere|art\s*sync|coach\s*sync|po\s*sync|scrum\s*of\s*scrums|inspect|\badapt\b|i\s*&\s*a|journees?\s*innovation|system\s*demo/],
    ['community', /\bcopa?\b|communaute|guilde|chapter|la tech des|tech\s*talk|meetup|brown\s*bag|\bclub\b|formation|training|aprem tech|techme/],
    // 1:1 (« [1v1] Mohamed/Kévin », « O3 - Elsa/Tanisha ») et synchro de rôles (« Weekly … PO/TL/SMs »)
    ['sync',      /\b1v1\b|\bo3\b|one[- ]on[- ]one|weekly.*\b(po|tl|sms?)\b/],
    // « Review des découpages et chiffrages » est un affinage, pas une démo
    ['affinage',  /decoupage|chiffrage/],
    // Démo avant rétro : « Répétition démo », « Prépa démo », « Démonstration d'itération »
    ['demo',      /\bdemo\b|demonstration|sprint\s*review|\breview\b/],
    ['retro',     /\bretro(spective)?\b/],
    ['planning',  /sprint\s*planning|planning\s*sprint|\bplanning\b|point mi[- ]?ite/],
    // « Raffinage de tickets » (Gabbiano), « Affinage » : le français que _detectScrumType ignorait
    ['affinage',  /refinement|raffinage|raffinement|affinage|grooming/],
    // « Weekly Fuego » REMPLACE le daily du lundi : même nature, pas une réunion de plus
    ['daily',     /\bdaily\b|stand[- ]?up|\bweekly\b|meteo du jour/],
    // « [Infra] - Créneau de ME(P)P » : les parenthèses deviennent des espaces à la normalisation
    ['release',   /\bmepp?\b|\bme p p\b|mise en (pre)?prod|livraison|release|preprod|montees? de versions?|renovate|\bmr\b|merge|deploiement|gitlab|\brepos?\b|\bdump\b|\bgel\b|freeze|latest is not a version|intervention|\btnr\b|\bqual_/],
    ['sync',      /synchro|\bsync\b|\bpoint\b|atelier|comite|\brevue\b|reunion|alignement|humeur|\borga\b|finalisation/],
];

/** Titre normalisé : minuscules, sans accents ni emoji. Clé des règles `calendar_rule`. */
export function calNorm(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}\s&/'.-]/gu, ' ')
        .replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Nature DÉTECTÉE d'un titre (sans les règles positionnées — voir `calNatureWithRules`). */
export function calNature(title) {
    // 🧰 = rotation support de Kadjar (« 🧰 BELMONTE, Patrice ») : l'emoji EST l'information,
    // et il disparaît à la normalisation — testé sur le titre brut.
    if (/^\s*🧰/u.test(String(title || ''))) return 'support';
    const t = calNorm(title);
    if (!t) return 'other';
    for (const [key, re] of RULES) if (re.test(t)) return key;
    return 'other';
}

/** Index titre normalisé → règle, mémoïsé par tableau de règles (celui du store). */
const _ruleIdx = new WeakMap();
function _rulesByNorm(rules) {
    if (!Array.isArray(rules)) return new Map();
    let m = _ruleIdx.get(rules);
    if (!m) { m = new Map(rules.map(r => [r.titleNorm, r])); _ruleIdx.set(rules, m); }
    return m;
}

/**
 * Nature EFFECTIVE : la règle positionnée à la main (store `calendarRules`) prime sur le détecteur.
 * @returns {{nature: string, detected: string, rule: object|null}}
 */
export function calNatureWithRules(title, rules) {
    const detected = calNature(title);
    const rule = _rulesByNorm(rules).get(calNorm(title)) || null;
    return { nature: rule && CAL_NATURES[rule.nature] ? rule.nature : detected, detected, rule };
}

/**
 * Portée d'un évènement pour une équipe, depuis le champ `team` (CSV) de son calendrier :
 * '' = tout le train, « A,B,C » = un groupe, « A » = l'équipe elle-même. « ERPC - Opérations »
 * est transverse sans être le train.
 * @returns {'team'|'group'|'train'|'ops'|null} null = ne concerne pas l'équipe
 */
export function calScope(calTeam, calName, team) {
    const teams = String(calTeam || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!teams.length) return /op[ée]rations/i.test(calName || '') ? 'ops' : 'train';
    if (!teams.includes(team)) return null;
    return teams.length === 1 ? 'team' : 'group';
}

/** Personne d'une absence ou d'un support (« Sacha - OFF » → « Sacha », « 🧰 NDIAYE, Oumar » → « NDIAYE, Oumar »). */
export function calPerson(title, nature) {
    const t = String(title || '').trim();
    if (nature === 'off') return t.replace(/\s*-?\s*(1\/2\s*)?OFF(\s+\S+)?\s*$/i, '').replace(/\s*-\s*$/, '').trim();
    if (nature === 'support') {
        const m = t.match(/^support\s*-\s*(.+)$/i) || t.match(/^\s*🧰\s*(.+)$/u);
        return m ? m[1].trim() : '';
    }
    return '';
}

// ── Titre court pour les blocs : le bruit coûtait tout l'espace ─────────────────────────
// « 🌅 🔥 Daily Fuego » dans la ligne de Fuego : emoji de nature (la couleur le dit), emoji du
// titre, nom de l'équipe (on est dans SA ligne) — ~3 caractères visibles en vue Itération (mesuré).
const PICTO = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{2728}]/gu;
const ACCENTS = { a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]' };
const loose = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split('').map(ch => ACCENTS[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');

/** « 🔥 Daily Fuego » → « Daily » dans la ligne de Fuego ; le titre complet reste en infobulle. */
export function calShortTitle(title, team) {
    const full = String(title || '').trim();
    let t = full.replace(PICTO, ' ').replace(/^\s*ERPC\s*[-–:]\s*/i, '');
    if (team && !team.startsWith('__')) {
        // Crochets retirés SEULEMENT s'ils désignent l'équipe — « [GDEM/PAAC] MEP » garde son contexte
        t = t.replace(new RegExp(`^\\s*\\[\\s*${loose(team)}\\s*\\]\\s*[-–:]?\\s*`, 'i'), '');
        t = t.replace(new RegExp(`(^|[\\s\\-–:/(])(team\\s+)?${loose(team)}(?=$|[\\s\\-–:/)])`, 'gi'), '$1');
    }
    t = t.replace(/\(\s*\)/g, '').replace(/^\s*[-–:]\s*|\s*[-–:]\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!/\p{L}/u.test(t)) return full;                      // « (🪄✨) » : rien de lisible à garder
    return t.charAt(0).toUpperCase() + t.slice(1);
}
