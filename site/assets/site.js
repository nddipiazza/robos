(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme');
  if (btn) btn.addEventListener('click', function () {
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('rb2-theme', next); } catch (e) {}
  });

  // OS detection for download buttons
  var ua = navigator.userAgent || '';
  var os = /Windows/i.test(ua) ? 'win' : /Mac/i.test(ua) ? 'mac' : 'linux';
  var names = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
  document.querySelectorAll('[data-dl-label]').forEach(function (el) {
    el.textContent = 'Download for ' + names[os];
  });
  document.querySelectorAll('[data-dl-href]').forEach(function (el) {
    var h = el.getAttribute('data-' + os);
    if (h) el.setAttribute('href', h);
  });
  document.querySelectorAll('[data-os]').forEach(function (el) {
    if (el.getAttribute('data-os') === os) el.classList.add('is-current');
  });

  // Tabs (install methods)
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var tabs = group.querySelectorAll('[role=tab]');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) {
          var on = x === t;
          x.setAttribute('aria-selected', on);
          document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
        });
      });
    });
  });

  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var code = b.parentElement.querySelector('code').innerText;
      if (navigator.clipboard) navigator.clipboard.writeText(code);
      var old = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1400);
    });
  });

  // App filter
  var q = document.getElementById('app-q');
  if (q) q.addEventListener('input', function () {
    var v = q.value.trim().toLowerCase();
    document.querySelectorAll('.app-card').forEach(function (c) {
      c.hidden = v && c.dataset.s.indexOf(v) === -1;
    });
    document.querySelectorAll(".app-group:not(.games-link)").forEach(function (g) {
      g.hidden = !g.querySelector('.app-card:not([hidden])');
    });
  });
})();

// Hero player: highlight the current step and let people jump between steps.
(function () {
  var v = document.getElementById('hero-video');
  var buttons = document.querySelectorAll('#hero-player .steps button');
  if (!v || !buttons.length) return;
  var starts = Array.prototype.map.call(buttons, function (b) { return parseFloat(b.dataset.start); });
  var current = -1;
  function mark(t) {
    var i = 0;
    for (var k = 0; k < starts.length; k++) if (t + 0.05 >= starts[k]) i = k;
    if (i === current) return;
    current = i;
    buttons.forEach(function (b, k) { b.classList.toggle('on', k === i); b.classList.toggle('done', k < i); });
  }
  v.addEventListener('timeupdate', function () { mark(v.currentTime); });
  buttons.forEach(function (b, k) {
    b.addEventListener('click', function () { v.currentTime = starts[k]; mark(starts[k]); v.play().catch(function () {}); });
  });
  mark(0);
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); v.controls = true; }
})();
