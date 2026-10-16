/**
 * Votes d'équipe Mood / Fist of Five (Confiance) — échelles, libellés, clé de store. SOURCE UNIQUE :
 * Santé (views/health-votes.js, qui ré-exporte) ET vote rapide de l'info-panel (components/panel_votes.js).
 * Même table backend `mood`, distinguée par `type` (`mood` | `fist`), valeur 1 → 5, appariée sur `piSprint`.
 */
export const VOTE_KINDS = {
    mood: {
        label: 'Mood',
        icon: '🎭',
        storeKey: 'moodVotes',
        what: "Humeur ressentie par l'équipe sur le sprint",
        emojis: ['😞', '😕', '😐', '🙂', '😄'],
        scale:  ['Très mauvais', 'Mauvais', 'Neutre', 'Bien', 'Excellent'],
    },
    fist: {
        label: 'Confiance',
        icon: '✊',
        storeKey: 'fistVotes',
        what: "Fist of Five — confiance dans l'atteinte des objectifs du PI",
        // 1 = UN doigt levé (☝️) : le poing fermé ✊ se lit « 0 », il n'existe pas sur une échelle 1 → 5.
        emojis: ['☝️', '✌️', '🤟', '🖖', '🖐️'],
        scale:  ['Aucune confiance', 'Faible confiance', 'Confiance modérée', 'Bonne confiance', 'Confiance totale'],
    },
};
