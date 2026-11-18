// Collapses the header links into a menu button when they don't fit, at any width.
// Phones in portrait always use the menu (site.css); phones in landscape keep the swipeable strip.
(function () {
  var nav = document.querySelector('.nav');
  if (!nav) return;
  var inner = nav.querySelector('.nav-in');
  var links = nav.querySelector('.links');
  var btn = nav.querySelector('.menu-btn');
  if (!inner || !links || !btn) return;
  if (!links.id) links.id = 'nav-links';
  btn.setAttribute('aria-controls', links.id);

  function close() {
    nav.classList.remove('nav-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function fit() {
    close();
    nav.classList.remove('nav-collapsed');
    if (getComputedStyle(links).display === 'none') return; // the CSS already collapsed it
    if (inner.scrollWidth > inner.clientWidth) nav.classList.add('nav-collapsed');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = nav.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
  document.addEventListener('click', function (e) { if (!nav.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('nav-open')) { close(); btn.focus(); }
  });

  // Mobile browsers fire resize when the address bar hides; only refit when the width changes.
  var lastWidth = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    fit();
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  fit();
})();
