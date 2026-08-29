/* ========================================
   PANNEAU DE CONTRÔLE FLOTTANT — repli, explications, mémoire du thème.
   Script classique (pas de module) : fonctionne aussi en file://.
   ======================================== */
(function () {
  var fcp = document.querySelector('.fcp');
  if (!fcp) return;

  var toggle = fcp.querySelector('.fcp-toggle');
  var annot = fcp.querySelector('.fcp-annot');
  var KEY_FOLD = 'sb-mockup-fcp-folded';
  var KEY_ANNOT = 'sb-mockup-annot';
  var KEY_THEME = 'sb-mockup-theme';

  function lire(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }
  function ecrire(cle, val) { try { localStorage.setItem(cle, val); } catch (e) { /* navigation privée */ } }

  /* Repli du panneau */
  if (lire(KEY_FOLD) === '1') { fcp.classList.add('is-collapsed'); toggle.setAttribute('aria-expanded', 'false'); }
  toggle.addEventListener('click', function () {
    var replie = fcp.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!replie));
    ecrire(KEY_FOLD, replie ? '1' : '0');
  });

  /* Explications : pastilles + légende */
  function poserAnnot(on) {
    document.body.classList.toggle('show-annot', on);
    if (annot) annot.setAttribute('aria-pressed', String(on));
  }
  poserAnnot(lire(KEY_ANNOT) === '1');
  if (annot) annot.addEventListener('click', function () {
    var on = !document.body.classList.contains('show-annot');
    poserAnnot(on);
    ecrire(KEY_ANNOT, on ? '1' : '0');
  });

  /* Thème : le bouton de l'en-tête et celui du panneau font la même chose ;
     on mémorise le choix pour qu'il survive au changement de page. */
  var racine = document.documentElement;
  var memo = lire(KEY_THEME);
  if (memo === 'light' || memo === 'dark') {
    racine.setAttribute('data-theme', memo);
    document.querySelectorAll('.gal-theme').forEach(function (b) { b.textContent = memo === 'light' ? '🌙 Voir en sombre' : '☀️ Voir en clair'; });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.gal-theme, .fcp-theme')) return;
    /* le gestionnaire de la page a déjà basculé l'attribut : on lit l'état final */
    setTimeout(function () { ecrire(KEY_THEME, racine.getAttribute('data-theme') || 'dark'); }, 0);
  });
})();
