/* ========================================
   ÉCHELLE DU CADRE DESKTOP

   On MESURE le conteneur, jamais la fenêtre : une requête média se tromperait
   de référence dès que les deux tailles cohabitent sur une page — le cadre
   représente un navigateur de 1280 px, quelle que soit la largeur réelle.

   L'échelle est plafonnée à 1 : agrandir un cadre de 1280 px sur un grand écran
   le rendrait flou sans rien montrer de plus.
   ======================================== */
(function () {
  var LARGEUR_BUREAU = 1280;

  function ajuster() {
    var fenetres = document.querySelectorAll('.bureau-fenetre');
    for (var i = 0; i < fenetres.length; i++) {
      var f = fenetres[i];
      // `clientWidth` de la fenêtre de découpe : sa largeur ne dépend pas de
      // l'échelle qu'on s'apprête à écrire, seule sa hauteur en dépend.
      var dispo = f.clientWidth;
      if (!dispo) continue;
      var echelle = Math.min(1, dispo / LARGEUR_BUREAU);
      f.style.setProperty('--echelle', echelle.toFixed(4));
    }
  }

  var enAttente = false;
  function ajusterDiffere() {
    if (enAttente) return;
    enAttente = true;
    requestAnimationFrame(function () {
      enAttente = false;
      ajuster();
    });
  }

  window.addEventListener('resize', ajusterDiffere);
  // Un cadre masqué (vue mobile) mesure 0 : remesurer quand la vue change
  window.addEventListener('gal-view-change', ajuster);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ajuster);
  }
  ajuster();
})();
