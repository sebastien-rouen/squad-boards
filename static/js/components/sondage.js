/**
 * Sondage - templates Slack et générateurs de messages bruts.
 * Partagé entre reports.js et pi.js.
 */

import { copyToClipboard } from '../utils.js';

export const SONDAGE_TEMPLATES = [
  { theme: ':roller_coaster: Votre humeur en 1 emoji ?',
    responses: [
      { n: ':one:',   text: `"J'ai passé plus de temps à éteindre des feux qu'à coder…" :fire::fire_extinguisher:` },
      { n: ':two:',   text: `"J'ai survécu… mais j'ai besoin de vacances" :weary:` },
      { n: ':three:', text: `"Mitigé : entre les bugs et les post-its qui collent mal" :shrug:` },
      { n: ':four:',  text: `"Plutôt cool ! On a avancé malgré tout" :sunglasses:` },
      { n: ':five:',  text: `"SPLASH !" :ocean: "Sprint de ouf, équipe de ouf !"` },
    ],
    footer: `Votez avec un emoji ou un chiffre ! (Anonyme, promis :shushing_face:)`,
  },
  { theme: ':crystal_ball: Si ce sprint était un film, ce serait… ?',
    responses: [
      { n: ':one:',   text: `"Titanic" - on a foncé droit dans l'iceberg :iceberg:` },
      { n: ':two:',   text: `"Survivor" - j'ai tenu mais à quel prix :desert_island:` },
      { n: ':three:', text: `"Groundhog Day" - j'ai l'impression d'avoir fait la même chose en boucle :arrows_counterclockwise:` },
      { n: ':four:',  text: `"Ocean's Eleven" - plan exécuté, objectif atteint :dark_sunglasses:` },
      { n: ':five:',  text: `"Avengers Endgame" - ÉPIQUE. On a tout déchiré :zap:` },
    ],
    footer: `Répondez par un chiffre ! Le pop-corn est offert :popcorn:`,
  },
  { theme: `:space_invader: Votre niveau d'énergie en fin de sprint ?`,
    responses: [
      { n: ':one:',   text: `Batterie 1% - "Quelqu'un a un chargeur ?" :low_battery:` },
      { n: ':two:',   text: `Mode veille activé :zzz: "Je fonctionne en automatique"` },
      { n: ':three:', text: `50/50 - "Ça dépend des jours (et du café)" :coffee:` },
      { n: ':four:',  text: `Bien chargé ! :battery: "On refait un tour ?"` },
      { n: ':five:',  text: `OVER 9000 :zap::muscle: "Qui veut un sprint de plus ?!"` },
    ],
    footer: `Votez ! Et n'oubliez pas de recharger vos batteries ce week-end :electric_plug:`,
  },
  { theme: ':cook: Si ce sprint était un plat, ce serait… ?',
    responses: [
      { n: ':one:',   text: `"Des pâtes trop cuites" - c'est passé, mais c'était pas ouf :spaghetti:` },
      { n: ':two:',   text: `"Un sandwich triangle" - ça fait le taf, sans plus :sandwich:` },
      { n: ':three:', text: `"Un kebab" - un peu de tout, pas sûr de ce qu'il y a dedans :stuffed_flatbread:` },
      { n: ':four:',  text: `"Un bon burger maison" - solide, bien garni :hamburger:` },
      { n: ':five:',  text: `"Un repas étoilé" - exceptionnel, chef ! :star2::kissing_chef:` },
    ],
    footer: `Bon appétit et bon vote ! :fork_and_knife:`,
  },
  { theme: ':musical_note: La bande-son de ce sprint ?',
    responses: [
      { n: ':one:',   text: `"Highway to Hell" - AC/DC savait :guitar::fire:` },
      { n: ':two:',   text: `"Bohemian Rhapsody" - du chaos, mais artistique :art:` },
      { n: ':three:', text: `"Hotel California" - tu peux entrer mais jamais sortir :hotel:` },
      { n: ':four:',  text: `"Don't Stop Me Now" - Queen mode activé :crown:` },
      { n: ':five:',  text: `"We Are The Champions" - pas besoin d'expliquer :trophy:` },
    ],
    footer: `Montez le volume et votez ! :loud_sound:`,
  },
  { theme: ':video_game: Ce sprint en mode jeu vidéo ?',
    responses: [
      { n: ':one:',   text: `"Dark Souls" - j'ai ragequit 3 fois :skull:` },
      { n: ':two:',   text: `"Tetris en mode expert" - les blocs tombent trop vite :bricks:` },
      { n: ':three:', text: `"Minecraft" - j'ai crafté des trucs, mais j'sais pas trop quoi :pick:` },
      { n: ':four:',  text: `"Mario Kart" - quelques carapaces bleues mais on s'en sort :racing_car:` },
      { n: ':five:',  text: `"GG EZ" - speed run validé, pas de game over :joystick::tada:` },
    ],
    footer: `Insert coin et votez ! :coin:`,
  },
  { theme: ':sun_behind_rain_cloud: La météo de ce sprint ?',
    responses: [
      { n: ':one:',   text: `"Tempête de catégorie 5" - sortez les gilets de sauvetage :tornado:` },
      { n: ':two:',   text: `"Pluie fine et continue" - pas dramatique mais déprimant :cloud_with_rain:` },
      { n: ':three:', text: `"Nuageux avec éclaircies" - on a vu le soleil… 2 fois :partly_sunny:` },
      { n: ':four:',  text: `"Beau temps !" - lunettes de soleil requises :sunny:` },
      { n: ':five:',  text: `"Arc-en-ciel permanent" :rainbow: - un sprint magique !" :sparkles:` },
    ],
    footer: `Donnez-nous la météo du sprint ! :thermometer:`,
  },
  { theme: ':clapper: Ce sprint résumé en un GIF ?',
    responses: [
      { n: ':one:',   text: `"This is fine" :fire::dog: - tout brûle mais je souris` },
      { n: ':two:',   text: `"Confused Travolta" :man_in_tuxedo: - j'ai cherché des specs qui n'existent pas` },
      { n: ':three:', text: `"Shrug" :person_shrugging: - ni bien ni mal, ça existe` },
      { n: ':four:',  text: `"Thumbs up kid" :+1: - solide, je recommande` },
      { n: ':five:',  text: `"Leonardo DiCaprio champagne" :champagne::raised_hands: - on fête ça !"` },
    ],
    footer: `Votez avec votre GIF intérieur ! :frame_with_picture:`,
  },
  { theme: ':racing_car: Ce sprint sur un circuit ?',
    responses: [
      { n: ':one:',   text: `"Panne sèche au premier virage" :fuelpump: - on n'est pas allés loin` },
      { n: ':two:',   text: `"Crevaison au 3e tour" - ça roulait… puis non :tire:` },
      { n: ':three:', text: `"Milieu de peloton" - régulier, pas spectaculaire :checkered_flag:` },
      { n: ':four:',  text: `"Podium !" :sports_medal: - top 3, on prend` },
      { n: ':five:',  text: `"Pole position + meilleur tour" :trophy: - Hamilton qui ?" :racing_car::dash:` },
    ],
    footer: `Gentlemen, start your votes ! :traffic_light:`,
  },
  { theme: ':airplane: Ce sprint en classe de vol ?',
    responses: [
      { n: ':one:',   text: `"Siège du milieu, pas de hublot, bébé qui pleure" :baby::cry:` },
      { n: ':two:',   text: `"Eco - les genoux dans le siège de devant" :leg:` },
      { n: ':three:', text: `"Eco+ - un peu de place, un café tiède" :coffee:` },
      { n: ':four:',  text: `"Business - je gère, j'ai de la place" :briefcase:` },
      { n: ':five:',  text: `"First class + champagne" :champagne::airplane: - on plane !"` },
    ],
    footer: `Attachez vos ceintures et votez ! :seat:`,
  },
  { theme: ':coffee: Ce sprint en termes de café ?',
    responses: [
      { n: ':one:',   text: `"Décaféiné froid de la veille" - aucune énergie, aucun goût :face_with_spiral_eyes:` },
      { n: ':two:',   text: `"Café de la machine à 30 centimes" - ça passe parce qu'il faut bien :neutral_face:` },
      { n: ':three:', text: `"Allongé du matin" - correct, sans plus :coffee:` },
      { n: ':four:',  text: `"Bon expresso de barista" - ça réveille et c'est bon :sparkles:` },
      { n: ':five:',  text: `"Triple shot artisanal" - SUPER PRODUCTIF, j'ai tout déchiré :zap::muscle:` },
    ],
    footer: `Servez-vous une tasse et votez ! :coffee:`,
  },
  { theme: ':mountain: Ce sprint comme une randonnée ?',
    responses: [
      { n: ':one:',   text: `"Perdu en montagne sous l'orage" - où est le chemin ?! :tornado:` },
      { n: ':two:',   text: `"Montée raide sans pause" - les jambes en feu :fire:` },
      { n: ':three:', text: `"Sentier vallonné" - quelques montées, quelques descentes :hiking_boot:` },
      { n: ':four:',  text: `"Belle balade avec vue" - effort récompensé :sunny:` },
      { n: ':five:',  text: `"Sommet atteint au lever du soleil" :mountain::sparkles: - vue imprenable !"` },
    ],
    footer: `Chaussez vos crampons et votez ! :hiking_boot:`,
  },
  { theme: ':ocean: Ce sprint en sortie en mer ?',
    responses: [
      { n: ':one:',   text: `"Naufrage" - on coule, sortez les canots :sos:` },
      { n: ':two:',   text: `"Mer agitée, tout le monde a le mal de mer" :face_vomiting:` },
      { n: ':three:', text: `"Houle modérée" - ça tangue mais on tient le cap :sailboat:` },
      { n: ':four:',  text: `"Vent dans le dos" - on file droit vers l'objectif :dash:` },
      { n: ':five:',  text: `"Mer d'huile + dauphins" :dolphin::ocean: - croisière parfaite !"` },
    ],
    footer: `Hissez les voiles et votez ! :sailboat:`,
  },
  { theme: ':dragon: Ce sprint en quête héroïque ?',
    responses: [
      { n: ':one:',   text: `"Game over dès le premier donjon" - le dragon a gagné :dragon::skull:` },
      { n: ':two:',   text: `"Combat de boss interminable" - encore une potion ? :crossed_swords:` },
      { n: ':three:', text: `"Quête secondaire" - utile mais on a oublié l'objectif principal :scroll:` },
      { n: ':four:',  text: `"Niveau bouclé, loot correct" :shield: - on progresse bien` },
      { n: ':five:',  text: `"Trésor légendaire débloqué" :crown::sparkles: - épopée réussie !"` },
    ],
    footer: `Tirez l'épée et votez ! :crossed_swords:`,
  },
  { theme: ':snowflake: La saison de ce sprint ?',
    responses: [
      { n: ':one:',   text: `"Hiver glacial" - tout est gelé, rien n'avance :snowflake:` },
      { n: ':two:',   text: `"Automne pluvieux" - morose et un peu déprimant :cloud_with_rain:` },
      { n: ':three:', text: `"Printemps capricieux" - ça repart, par à-coups :seedling:` },
      { n: ':four:',  text: `"Bel été" - chaud, productif, agréable :sunny:` },
      { n: ':five:',  text: `"Été indien parfait" :rainbow::sparkles: - le climat idéal !"` },
    ],
    footer: `Donnez la météo de votre sprint ! :thermometer:`,
  },
  { theme: ':pizza: Ce sprint en pizza ?',
    responses: [
      { n: ':one:',   text: `"Brûlée et froide" - immangeable :face_with_spiral_eyes:` },
      { n: ':two:',   text: `"Surgelée passée au micro-ondes" - ça nourrit, sans joie :neutral_face:` },
      { n: ':three:', text: `"Pizza correcte du coin" - ni bonne ni mauvaise :pizza:` },
      { n: ':four:',  text: `"Bonne pizza au feu de bois" - généreuse et savoureuse :sparkles:` },
      { n: ':five:',  text: `"Napolitaine d'un vrai pizzaiolo" :pizza::kissing_chef: - chef's kiss !"` },
    ],
    footer: `Coupez une part et votez ! :pizza:`,
  },
  { theme: ':rocket: Ce sprint en mission spatiale ?',
    responses: [
      { n: ':one:',   text: `"Explosion au décollage" - mission avortée :boom:` },
      { n: ':two:',   text: `"Problème, Houston" - on improvise pour rentrer :satellite:` },
      { n: ':three:', text: `"Orbite basse" - on tourne, sans avancer vraiment :artificial_satellite:` },
      { n: ':four:',  text: `"Amarrage réussi" - mission solide :rocket:` },
      { n: ':five:',  text: `"On a marché sur la Lune" :rocket::full_moon: - un pas de géant !"` },
    ],
    footer: `3, 2, 1… votez ! :rocket:`,
  },
];

export const FIST_SCALE = [
    { n: ':one:',   emoji: '1️⃣', label: 'Aucune confiance',    text: 'Je pense que les objectifs ne sont pas atteignables dans les conditions actuelles (trop de risques, manque de clarté, dépendances bloquantes).' },
    { n: ':two:',   emoji: '2️⃣', label: 'Faible confiance',     text: 'Les objectifs me semblent très difficiles à atteindre. Il faudrait des changements majeurs pour y arriver.' },
    { n: ':three:', emoji: '3️⃣', label: 'Confiance modérée',    text: 'Les objectifs sont atteignables, mais avec des risques importants ou des hypothèses encore fragiles.' },
    { n: ':four:',  emoji: '4️⃣', label: 'Bonne confiance',      text: 'Les objectifs sont réalistes et bien compris. Quelques risques existent, mais ils sont maîtrisables.' },
    { n: ':five:',  emoji: '5️⃣', label: 'Confiance totale',     text: 'Je suis très confiant : objectifs clairs, plan solide, capacité et dépendances bien maîtrisées.' },
];

export const SLACK_EMOJI = {
  ':one:':'1️⃣',':two:':'2️⃣',':three:':'3️⃣',':four:':'4️⃣',':five:':'5️⃣',
  ':fire:':'🔥',':fire_extinguisher:':'🧯',':weary:':'😩',':shrug:':'🤷',':sunglasses:':'😎',
  ':ocean:':'🌊',':shushing_face:':'🤫',':roller_coaster:':'🎢',':crystal_ball:':'🔮',
  ':iceberg:':'🧊',':desert_island:':'🏝️',':arrows_counterclockwise:':'🔄',':dark_sunglasses:':'🕶️',
  ':zap:':'⚡',':popcorn:':'🍿',':space_invader:':'👾',':low_battery:':'🪫',':zzz:':'💤',
  ':coffee:':'☕',':battery:':'🔋',':muscle:':'💪',':electric_plug:':'🔌',':cook:':'👨‍🍳',
  ':spaghetti:':'🍝',':sandwich:':'🥪',':stuffed_flatbread:':'🥙',':hamburger:':'🍔',
  ':star2:':'🌟',':kissing_chef:':'😘',':fork_and_knife:':'🍴',':musical_note:':'🎵',
  ':guitar:':'🎸',':art:':'🎨',':hotel:':'🏨',':crown:':'👑',':trophy:':'🏆',
  ':video_game:':'🎮',':skull:':'💀',':bricks:':'🧱',':pick:':'⛏️',':racing_car:':'🏎️',
  ':joystick:':'🕹️',':tada:':'🎉',':coin:':'🪙',':sun_behind_rain_cloud:':'🌦️',
  ':tornado:':'🌪️',':cloud_with_rain:':'🌧️',':partly_sunny:':'⛅',':sunny:':'☀️',
  ':rainbow:':'🌈',':sparkles:':'✨',':thermometer:':'🌡️',':clapper:':'🎬',
  ':dog:':'🐶',':man_in_tuxedo:':'🤵',':person_shrugging:':'🤷',':+1:':'👍',
  ':champagne:':'🍾',':raised_hands:':'🙌',':frame_with_picture:':'🖼️',
  ':fuelpump:':'⛽',':tire:':'🛞',':checkered_flag:':'🏁',':sports_medal:':'🏅',
  ':dash:':'💨',':traffic_light:':'🚦',':airplane:':'✈️',':baby:':'👶',':cry:':'😢',
  ':leg:':'🦵',':briefcase:':'💼',':seat:':'💺',':loud_sound:':'🔊',
  ':face_with_spiral_eyes:':'😵‍💫',':neutral_face:':'😐',':mountain:':'⛰️',':hiking_boot:':'🥾',
  ':sos:':'🆘',':face_vomiting:':'🤮',':sailboat:':'⛵',':dolphin:':'🐬',':dragon:':'🐉',
  ':crossed_swords:':'⚔️',':scroll:':'📜',':shield:':'🛡️',':snowflake:':'❄️',':seedling:':'🌱',
  ':pizza:':'🍕',':boom:':'💥',':satellite:':'📡',':artificial_satellite:':'🛰️',':full_moon:':'🌕',
};

export function slackToEmoji(txt) {
  return txt.replace(/:[a-z_+]+:/g, m => SLACK_EMOJI[m] || m);
}

/** Nombre de thèmes disponibles (pour le bouton « 🎲 Autre thème »). */
export const SONDAGE_THEME_COUNT = SONDAGE_TEMPLATES.length;

/** Index de thème déterministe à partir du nom de sprint (rotation auto par sprint). */
export function moodThemeIndex(sprintName) {
  const m = (sprintName || '').match(/(\d+)\.(\d+)/);
  const sprintNum = m ? parseInt(m[1]) * 10 + parseInt(m[2]) : 0;
  return sprintNum % SONDAGE_TEMPLATES.length;
}

/**
 * Génère le message Slack brut d'invitation au vote Mood Meter.
 * @param sprintName  nom du sprint (ex. "30.1") — détermine le thème par défaut.
 * @param themeIndex  index de thème explicite (bouton « 🎲 Autre thème ») ; sinon rotation auto.
 */
export function buildMoodSlackRaw(sprintName, themeIndex = null) {
  const m = (sprintName || '').match(/(\d+)\.(\d+)/);
  const sprintLabel = m ? ` ${m[1]}.${m[2]}` : '';
  const idx = themeIndex == null
    ? moodThemeIndex(sprintName)
    : ((themeIndex % SONDAGE_TEMPLATES.length) + SONDAGE_TEMPLATES.length) % SONDAGE_TEMPLATES.length;
  const tpl = SONDAGE_TEMPLATES[idx];
  let raw = `[SONDAGE] Mood du sprint${sprintLabel} : ${tpl.theme}\n\n`;
  tpl.responses.forEach(r => { raw += `${r.n} = ${r.text}\n`; });
  raw += `\n→ ${tpl.footer}`;
  return raw;
}

/** Génère le message Slack brut d'invitation au vote Fist of Five */
export function buildFistSlackRaw(sprintName) {
  const m = (sprintName || '').match(/(\d+\.\d+)/);
  const sprintLabel = m ? `Sprint ${m[1]}` : 'Sprint en cours';
  let raw = `✊ [SONDAGE] Vote de confiance PI - ${sprintLabel}\n\n`;
  raw += `Pour rappel, on vote sur l'atteinte des objectifs du PI avec notre connaissance au moment du vote, notre avancement durant les sprints précédents, etc\n\n`;
  FIST_SCALE.forEach(r => { raw += `${r.n} *${r.label}* = ${r.text}\n`; });
  raw += `\n→ Votez avec un chiffre (1 à 5) pour enregistrer votre vote 🗳️`;
  return raw;
}

/**
 * Texte explicatif bref affiché au-dessus du message Slack, selon le type de sondage.
 * Rappelle à quoi sert le sondage et comment l'utiliser.
 */
export const SONDAGE_INTRO = {
  mood: 'Mesure l\'humeur de l\'équipe en fin de sprint (1 à 5). Anonyme, ludique, ça lance la rétro et détecte l\'usure.',
  fist: 'Vote de confiance (Fist of Five) sur l\'atteinte des objectifs du PI. Donne un signal partagé pour ajuster le plan.',
};

/**
 * Câble un bouton de copie Slack de façon homogène (même comportement partout).
 * Utilise le helper partagé copyToClipboard (fallback + toast inclus).
 * @param btn      le bouton (HTMLElement) ; ses libellés sont gérés ici.
 * @param getText  fonction renvoyant le texte brut à copier au moment du clic.
 * @param label    libellé du bouton au repos (défaut « 📋 Copier »).
 */
export function wireSlackCopy(btn, getText, label = '📋 Copier') {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = await copyToClipboard(getText(), 'Message Slack copié');
    btn.textContent = ok ? '✓ Copié !' : label;
    setTimeout(() => { btn.textContent = label; }, 1500);
  });
}
  