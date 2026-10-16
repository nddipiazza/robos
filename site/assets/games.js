(function () {
  // Background video: only start it when it will not hurt the visitor.
  // Poster image stays for reduced-motion, data-saver, slow links and phones.
  var v = document.querySelector('.bg-video');
  if (!v) return;
  var conn = navigator.connection || {};
  var skip =
    (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') ||
    window.innerWidth < 720;
  if (skip) return;
  v.src = v.dataset.src;
  v.addEventListener('playing', function () { document.body.classList.add('bg-live'); });
  var p = v.play();
  if (p && p.catch) p.catch(function () {});
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) v.pause(); else v.play().catch(function () {});
  });
})();

(function () {
  // Faction tabs: without JS every panel is shown.
  var tabs = document.querySelectorAll('.tabs [data-tab]');
  if (tabs.length) {
    document.documentElement.classList.add('js');
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.toggle('on', t === b); });
        document.querySelectorAll('.tabpanel').forEach(function (p) { p.classList.toggle('on', p.id === 'tab-' + b.dataset.tab); });
      });
    });
  }
  // Lightbox for gallery images.
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.shots img, .faction img, .annot img');
    if (!img) return;
    var lb = document.createElement('div');
    lb.className = 'lb';
    lb.innerHTML = '<img alt=""><p></p>';
    lb.querySelector('img').src = img.src;
    lb.querySelector('img').alt = img.alt;
    lb.querySelector('p').textContent = img.alt;
    var close = function () { lb.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (k) { if (k.key === 'Escape') close(); };
    lb.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
  });
})();
