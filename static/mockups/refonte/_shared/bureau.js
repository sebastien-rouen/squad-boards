/* ========================================
   ÉCHELLE DES CADRES DESKTOP (1280 × 820) ET TV (1920 × 1080)

   On MESURE le conteneur, jamais la fenêtre : une requête média se tromperait
   de référence dès que les tailles cohabitent sur une page — le cadre
   représente un navigateur de 1280 ou 1920 px, quelle que soit la largeur
   réelle de l'écran qui l'affiche.

   L'échelle est plafonnée à 1 : agrandir un cadre le rendrait flou sans rien
   montrer de plus. La largeur de référence vient de `data-w` sur la fenêtre
   de découpe (1280 par défaut), la hauteur de `data-h` (820).
   ======================================== */
(function () {
  function ajuster() {
    var fenetres = document.querySelectorAll('.bureau-fenetre');
    for (var i = 0; i < fenetres.length; i++) {
      var f = fenetres[i];
      var largeur = parseInt(f.getAttribute('data-w'), 10) || 1280;
      var hauteur = parseInt(f.getAttribute('data-h'), 10) || 820;
      // `clientWidth` de la fenêtre de découpe : sa largeur ne dépend pas de
      // l'échelle qu'on s'apprête à écrire, seule sa hauteur en dépend.
      var dispo = f.clientWidth;
      if (!dispo) continue;
      var echelle = Math.min(1, dispo / largeur);
      f.style.setProperty('--echelle', echelle.toFixed(4));
      f.style.setProperty('--cadre-h', hauteur + 'px');
    }
  }

  var enAttente = false;
  function ajusterDiffere() {
    if (enAttente) return;
    enAttente = true;
    requestAnimationFrame(function () { enAttente = false; ajuster(); });
  }

  window.addEventListener('resize', ajusterDiffere);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ajuster);
  ajuster();
})();
