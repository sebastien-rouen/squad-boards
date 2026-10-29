/**
 * Navigation de Paramètres (3.282.0) — SOURCE UNIQUE des onglets : groupe, icône, libellé court, mots-clés.
 * Hors de `views/` (3.284.0) : la palette Ctrl+K (cmd_sections.js, un composant) en tire ses entrées « réglage ».
 *
 * Le SLUG est l'identifiant de la section (`#section-<slug>`, ou le titre slugifié) : il fait les liens
 * `#settings/<slug>` posés partout dans le site — ne JAMAIS le renommer ici (seuls libellé, icône et groupe
 * bougent). Une section ajoutée sans entrée ici tombe dans « Autres » : c'est le signal qu'il faut la classer.
 * `module` : onglet masqué quand ce module est désactivé (utils/modules.js, 3.283.0).
 * `keywords` : sans accents, pour la recherche (palette Ctrl+K et filtre de la nav, 3.284.0).
 */

export const SETTINGS_NAV = Object.freeze([
    // Sans nom de groupe : entrée d'accueil, page d'arrivée de `#settings` (3.283.0)
    { group: '', icon: '', items: [
        { slug: 'vue-d-ensemble',         icon: '🧭', label: 'Vue d\'ensemble',       keywords: 'etat configuration a faire checklist assistant' },
    ] },
    { group: 'Projet', icon: '🏁', items: [
        { slug: 'identite-du-projet',     icon: '🏷️', label: 'Identité',              keywords: 'nom projet couleur marque initiales logo' },
        { slug: 'acces',                  icon: '🔐', label: 'Accès',                 keywords: 'connexion sso login comptes autorises email collegues securite' },
        { slug: 'modules-menu',           icon: '🧩', label: 'Modules & menu',        keywords: 'vues masquer renommer menu navigation assistant mise en route' },
        { slug: 'sprint-pi',              icon: '🚀', label: 'Sprint & PI',           keywords: 'cadence duree sprint pi dates objectifs velocite' },
        { slug: 'calendrier-de-travail',  icon: '📆', label: 'Calendrier de travail', keywords: 'jours feries pays fermeture pont entreprise' },
    ] },
    { group: 'Personnes', icon: '👥', items: [
        { slug: 'lignes-produit-groupes', icon: '🌳', label: 'Lignes produit',        keywords: 'groupes ligne produit equipes regroupement' },
        { slug: 'equipes',                icon: '👥', label: 'Équipes',               keywords: 'equipe couleur board jira creer' },
        { slug: 'membres',                icon: '🧑', label: 'Membres',               keywords: 'personnes role import csv membre' },
        { slug: 'cap-roles',              icon: '🧮', label: 'Capacité par rôle',     keywords: 'capacite role pourcentage dev tech lead po etp' },
        { slug: 'absences-conges',        icon: '🌴', label: 'Absences & congés',     keywords: 'conges absences rh import csv excel alias' },
    ] },
    { group: 'Rituels', icon: '🛎️', items: [
        { slug: 'rotation',               icon: '🛎️', label: 'Rotation support',      module: 'support', keywords: 'astreinte support rotation tirage semaine pool' },
        { slug: 'rappels-ceremonies',     icon: '⏰', label: 'Rappels & cérémonies',  keywords: 'rappel demo retro mood vote ceremonie backlog dormant' },
    ] },
    { group: 'Règles', icon: '⚖️', items: [
        { slug: 'regles-metier',          icon: '📏', label: 'Règles métier',         keywords: 'seuil stagnant stagnation sachant poker cartes absence' },
        { slug: 'seuils-meteo',           icon: '🌤️', label: 'Seuils météo',          keywords: 'meteo seuils sante sla mood perimetre' },
    ] },
    { group: 'Connexions', icon: '🔌', items: [
        { slug: 'plugin-jira-optionnel',  icon: '🔗', label: 'JIRA',                  keywords: 'jira synchro jeton token connexion statuts correspondance mapping champs' },
        { slug: 'calendriers-ics',        icon: '🗓️', label: 'Agendas (ICS)',         keywords: 'calendrier agenda ics outlook google evenements detecteur' },
        { slug: 'slack-optionnel',        icon: '💬', label: 'Slack',                 keywords: 'slack webhook message notification' },
    ] },
    { group: 'Données', icon: '💾', items: [
        { slug: 'donnees',                icon: '📦', label: 'Sauvegarde & données',  keywords: 'export import sauvegarde restauration gabarit supprimer zip' },
        { slug: 'faits-marquants',        icon: '⚡', label: 'Faits marquants',       module: 'team', keywords: 'faits marquants evenements frise liste' },
        { slug: 'a-propos',               icon: 'ℹ️', label: 'À propos',              keywords: 'version a propos aide' },
    ] },
]);

/** slug → { …entrée, group, groupIcon } */
export const NAV_BY_SLUG = Object.freeze(Object.fromEntries(
    SETTINGS_NAV.flatMap(g => g.items.map(it => [it.slug, { ...it, group: g.group, groupIcon: g.icon }]))));
