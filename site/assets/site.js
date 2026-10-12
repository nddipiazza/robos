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
