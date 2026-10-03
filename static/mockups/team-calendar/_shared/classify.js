/* Détecteur d'évènements d'agenda — MAQUETTE (static/mockups/team-calendar/).
 *
 * Deux axes INDÉPENDANTS, c'est tout le parti pris :
 *   - la NATURE, déduite du titre (règles ordonnées, la plus spécifique d'abord) ;
 *   - la PORTÉE, déduite du calendrier source : équipe, groupe (« Estafette,Gabbiano,… »),
 *     train (ERPC - GLOBAL, champ `team` vide) ou opérations.
 * Une « Démonstration d'itération » du train et une « Répétition démo » d'équipe ont la même
 * nature (Démo) mais pas la même portée : c'est ce qui rend la comparaison entre équipes lisible.
 *
 * Script classique (pas de module ES) : marche en file://, dans le navigateur et sous Node.
 * Couverture mesurée sur les 3 580 évènements réels : voir README.md.
 */
(function (root) {
    'use strict';

    // L'ordre = ordre de la légende. `family` regroupe les couleurs proches.
    const NATURES = {
        daily:     { label: 'Daily',                  emoji: '🌅', family: 'scrum'  },
        planning:  { label: 'Planning',               emoji: '🎯', family: 'scrum'  },
        affinage:  { label: 'Affinage',               emoji: '🔍', family: 'scrum'  },
        demo:      { label: 'Démo',                   emoji: '🎤', family: 'scrum'  },
        retro:     { label: 'Rétro',                  emoji: '🔁', family: 'scrum'  },
        train:     { label: 'Train SAFe',             emoji: '🚂', family: 'train'  },
        community: { label: 'Communauté & formation', emoji: '🤝', family: 'train'  },
        sync:      { label: 'Synchro & 1:1',          emoji: '💬', family: 'work'   },
        release:   { label: 'Livraison & tech',       emoji: '🚀', family: 'work'   },
        support:   { label: 'Support',                emoji: '🛎️', family: 'people' },
        off:       { label: 'Absence',                emoji: '🏖️', family: 'people' },
        busy:      { label: 'Détails masqués',        emoji: '🔒', family: 'people' },
        // Temps PROTÉGÉ (« Deep work - pas de réunion ») : l'inverse d'une réunion, jamais compté en charge
        focus:     { label: 'Temps protégé',          emoji: '🎧', family: 'work'   },
        // Miroir 3.199.0 — natures de plus (rangement à la main + détection prudente)
        orga:      { label: 'Organisation',           emoji: '🗂️', family: 'work'   },
        cadrage:   { label: 'Cadrage & conception',   emoji: '🧭', family: 'work'   },
        metier:    { label: 'Métier & parties prenantes', emoji: '🏛️', family: 'work' },
        rh:        { label: 'RH & onboarding',        emoji: '👋', family: 'people' },
        social:    { label: 'Convivialité',           emoji: '🎉', family: 'people' },
        other:     { label: 'Autre',                  emoji: '📌', family: 'work'   },
    };

    // Règles ORDONNÉES — la première qui correspond gagne, testées sur le titre normalisé
    // (minuscules, sans accents ni emoji). Chaque piège réel rencontré est commenté.
    const RULES = [
        // Personnes d'abord. « Sacha - OFF », « Tanisha - 1/2 OFF », « THAM OFF » — jamais « Kick off »
        ['off',       /-\s*[^-]*\boff(\s(am|pm|matin|apres[- ]?midi|aprem))?\s*$|^(?!.*kick)[a-z][a-z.' ]{1,24}\s(1\/2\s)?off(\s(am|pm|matin|apres[- ]?midi|aprem))?$/],
        ['focus',     /deep\s*work|pas de reunion|\bfocus\b|no\s*meeting/],
        // « Busy » : agenda partagé en « disponibilités seulement » (Lion) — titre masqué par Google
        ['busy',      /^(busy|occupe|indisponible|prive)$/],
        ['support',   /^support\b|passation support|point support|monitoring prod|astreinte/],
        ['social',    /after[- ]?work|\bpot\b|\bapero|dejeuner|petit[- ]?dej|team[- ]?building|anniversaire|galette|\bseminaire|soiree/],
        ['rh',        /onboarding|offboarding|\baccueil\b|entretiens? (annuel|individuel|professionnel|d.?embauche|de recrutement)|recrutement|\bcandidat/],
        // Train avant « planning » : « ERPC - PI Planning - Plénière » n'est PAS un sprint planning
        ['train',     /pi\s*planning|pleniere|art\s*sync|coach\s*sync|po\s*sync|scrum\s*of\s*scrums|inspect|\badapt\b|i\s*&\s*a|journees?\s*innovation|system\s*demo/],
        ['community', /\bcopa?\b|communaute|guilde|chapter|la tech des|tech\s*talk|meetup|brown\s*bag|\bclub\b|formation|training|aprem tech|techme/],
        ['cadrage',   /cadrage|conception|architecture|\bspecs?\b|specification|kick[- ]?off|\blancement\b|\bmaquettes?\b/],
        // 1:1 (« [1v1] Mohamed/Kévin », « O3 - Elsa/Tanisha ») et synchro de rôles (« Weekly … PO/TL/SMs »)
        ['sync',      /\b1v1\b|^o3\b|one[- ]on[- ]one|weekly.*\b(po|tl|sms?)\b/],
        // « Review des découpages et chiffrages » est un affinage, pas une démo
        ['affinage',  /decoupage|chiffrage/],
        // Démo avant rétro : « Répétition démo », « Prépa démo », « Démonstration d'itération »
        ['demo',      /\bdemo\b|demonstration|sprint\s*review|\breview\b/],
        ['retro',     /\bretro(spective)?\b/],
        ['planning',  /sprint\s*planning|planning\s*sprint|\bplanning\b|point mi[- ]?ite/],
        // « Raffinage de tickets » (Gabbiano), « Affinage » : le français que l'ancien détecteur ignorait
        ['affinage',  /refinement|raffinage|raffinement|affinage|grooming/],
        // « Weekly Fuego » REMPLACE le daily du lundi : même nature, pas une réunion de plus
        ['daily',     /\bdaily\b|stand[- ]?up|\bweekly\b|meteo du jour/],
        // « [Infra] - Créneau de ME(P)P » : les parenthèses deviennent des espaces à la normalisation
        ['release',   /\bmepp?\b|\bme p p\b|mise en (pre)?prod|livraison|release|preprod|montees? de versions?|renovate|\bmr\b|merge|deploiement|gitlab|\brepos?\b|\bdump\b|\bgel\b|freeze|latest is not a version|intervention|\btnr\b|\bqual_/],
        ['metier',    /\bmoa\b|\bmoe\b|metiers?\b|utilisateurs|\bclients?\b|parties prenantes|stakeholders?|\bdsi\b|\bcopil\b/],
        ['orga',      /\borga(nisation)?\b|logistique|administratif|\badmin\b|conges|demenagement|flex[- ]?office|\bbureaux?\b|budget|staffing/],
        ['sync',      /synchro|\bsync\b|\bpoint\b|atelier|comite|\brevue\b|reunion|alignement|humeur|finalisation/],
    ];

    const norm = s => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}\s&/'.-]/gu, ' ')
        .replace(/\s+/g, ' ').trim().toLowerCase();

    /** Nature d'un évènement depuis son titre. */
    function nature(title) {
        // 🧰 = rotation support de Kadjar (« 🧰 BELMONTE, Patrice ») : l'emoji EST l'information,
        // et il disparaît à la normalisation — on le teste sur le titre brut.
        if (/^\s*🧰/u.test(String(title || ''))) return 'support';
        const t = norm(title);
        if (!t) return 'other';
        for (const [key, re] of RULES) if (re.test(t)) return key;
        return 'other';
    }

    /**
     * Portée d'un évènement pour une équipe, depuis le champ `team` du calendrier source :
     * '' = tout le train, « A,B,C » = un groupe, « A » = l'équipe elle-même. « ERPC - Opérations »
     * est transverse sans être le train : portée à part.
     * @returns {'team'|'group'|'train'|'ops'|null} null = ne concerne pas l'équipe
     */
    function scope(calTeam, calName, team) {
        const teams = String(calTeam || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!teams.length) return /op[ée]rations/i.test(calName || '') ? 'ops' : 'train';
        if (!teams.includes(team)) return null;
        return teams.length === 1 ? 'team' : 'group';
    }

    const SCOPES = {
        team:  { label: 'Équipe',     icon: '👥' },
        group: { label: 'Groupe',     icon: '🧩' },
        train: { label: 'Train ERPC', icon: '🚂' },
        ops:   { label: 'Opérations', icon: '⚙️' },
    };

    /** Personne d'une absence ou d'un support (« Sacha - OFF » → « Sacha », « 🧰 NDIAYE, Oumar » → « NDIAYE, Oumar »). */
    function person(title, kind) {
        const t = String(title || '').trim();
        if (kind === 'off') return t.replace(/\s*-?\s*(1\/2\s*)?OFF\s*$/i, '').replace(/\s*-\s*$/, '').trim();
        if (kind === 'support') {
            const m = t.match(/^support\s*-\s*(.+)$/i) || t.match(/^\s*🧰\s*(.+)$/u);
            return m ? m[1].trim() : '';
        }
        return '';
    }

    const api = { NATURES, SCOPES, RULES, nature, scope, person, norm };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.TeamCalClassify = api;
})(typeof window !== 'undefined' ? window : globalThis);
