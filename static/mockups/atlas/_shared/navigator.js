/* ========================================
   NAVIGATEUR DE PROTOTYPE — Atlas
   Lit `data-dir` et `data-page` sur <body>, construit un panneau flottant
   avec les écrans de la direction courante et la bascule vers les autres
   directions — sur le MÊME écran. Masqué dans l'aperçu iframe de l'index.
   ======================================== */
(function () {
  if (window.self !== window.top) return;

  var body = document.body;
  var dir = body.getAttribute('data-dir');
  var page = body.getAttribute('data-page');
  if (!dir || !page) return;

  var DIRECTIONS = {
    'a-constellation': '🌌 Constellation',
    'b-matrice': '🟩 Matrice',
    'c-profils': '🧑‍🤝‍🧑 Profils',
    'd-signaux': '🚨 Signaux'
  };
  var PAGES = [
    ['01-atlas', '🏠', 'Écran principal'],
    ['02-sections', '📑', 'Sections'],
    ['03-modales', '🪟', 'Modales'],
    ['04-atelier', '⚡', 'Atelier de staffing'],
    ['05-mobilite', '🧭', 'Mobilité & trajectoires']
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  var root = el('aside', 'pnav');
  root.setAttribute('aria-label', 'Navigateur de prototype');

  var toggle = el('button', 'pnav__toggle');
  toggle.type = 'button';
  toggle.appendChild(el('i', null, '🧭'));
  toggle.appendChild(el('span', null, DIRECTIONS[dir] + ' · ' + page.slice(3)));
  toggle.appendChild(el('b', null, '▾'));
  root.appendChild(toggle);

  var bodyEl = el('div', 'pnav__body');
  bodyEl.appendChild(el('div', 'pnav__group', 'Direction'));
  var sw = el('div', 'pnav__switch pnav__switch--4');
  Object.keys(DIRECTIONS).forEach(function (key) {
    var a = el('a', null, DIRECTIONS[key].split(' ')[0]);
    a.title = DIRECTIONS[key];
    a.href = '../' + key + '/' + page + '.html';
    if (key === dir) a.setAttribute('aria-current', 'true');
    sw.appendChild(a);
  });
  bodyEl.appendChild(sw);

  bodyEl.appendChild(el('div', 'pnav__group', 'Écrans'));
  var links = el('div', 'pnav__links');
  PAGES.forEach(function (p) {
    var a = el('a');
    a.href = p[0] + '.html';
    a.appendChild(el('i', null, p[1]));
    a.appendChild(el('span', null, p[2]));
    if (p[0] === page) a.setAttribute('aria-current', 'page');
    links.appendChild(a);
  });
  var up = el('a');
  up.href = '../index.html';
  up.appendChild(el('i', null, '↑'));
  up.appendChild(el('span', null, 'Galerie'));
  links.appendChild(up);
  bodyEl.appendChild(links);
  root.appendChild(bodyEl);

  var closed = false;
  try { closed = localStorage.getItem('pnav-closed') === '1'; } catch (e) { /* stockage bloqué */ }
  if (closed) root.classList.add('pnav--closed');
  toggle.addEventListener('click', function () {
    var now = root.classList.toggle('pnav--closed');
    try { localStorage.setItem('pnav-closed', now ? '1' : '0'); } catch (e) { /* idem */ }
  });
  body.appendChild(root);
})();
