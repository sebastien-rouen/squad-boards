/* ========================================
   COMMUTATEUR DE VUE — 🖥️ Desktop (défaut) / 📱 Mobile
   Pose `data-view` sur <body>, mémorise le choix, et prévient bureau.js
   (un cadre masqué a une largeur nulle : il faut le remesurer à l'affichage).
   ======================================== */
(function () {
  var CLE = 'gal-view';
  var body = document.body;
  var vue = 'desktop';
  try { vue = localStorage.getItem(CLE) || 'desktop'; } catch (e) { /* stockage bloqué */ }
  if (vue !== 'mobile') vue = 'desktop';
  body.setAttribute('data-view', vue);

  var nav = document.querySelector('.gal-nav');
  if (!nav || window.self !== window.top) return;

  var sw = document.createElement('div');
  sw.className = 'gal-view';
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'Vue');

  var boutons = [['desktop', '🖥️', 'Desktop'], ['mobile', '📱', 'Mobile']].map(function (d) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(d[0] === vue));
    b.appendChild(document.createTextNode(d[1] + ' ' + d[2]));
    b.addEventListener('click', function () { choisir(d[0]); });
    sw.appendChild(b);
    return [d[0], b];
  });

  function choisir(nouvelle) {
    vue = nouvelle;
    body.setAttribute('data-view', vue);
    boutons.forEach(function (p) { p[1].setAttribute('aria-pressed', String(p[0] === vue)); });
    try { localStorage.setItem(CLE, vue); } catch (e) { /* idem */ }
    window.dispatchEvent(new Event('gal-view-change'));
  }

  nav.appendChild(sw);
})();
