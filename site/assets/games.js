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
