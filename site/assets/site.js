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

// Hero player. The default is a self-cycling slideshow of real frames (it needs no autoplay
// permission, so it moves everywhere); "Watch the full recording" swaps in the video.
(function () {
  var player = document.getElementById('hero-player');
  if (!player) return;
  var stage = document.getElementById('hero-stage');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var chips = Array.prototype.slice.call(player.querySelectorAll('.steps button'));
  var bar = stage.querySelector('.stage-progress i');
  var video = document.getElementById('hero-video');
  var watch = document.getElementById('hero-watch');
  var DWELL = 4600;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var index = 0, visible = true, started = 0, elapsed = 0, raf = 0, inVideo = false;

  function stepOf(i) { return parseInt(slides[i].dataset.step, 10); }
  function mark(step) {
    chips.forEach(function (b) {
      var s = parseInt(b.dataset.step, 10);
      b.classList.toggle('on', s === step); b.classList.toggle('done', s < step);
    });
  }
  function show(i) {
    index = (i + slides.length) % slides.length;
    slides.forEach(function (el, k) { el.classList.toggle('is-active', k === index); });
    mark(stepOf(index));
    elapsed = 0; started = performance.now();
    bar.style.width = '0%';
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (inVideo || reduce || !visible || document.hidden) { started = now - elapsed; return; }
    elapsed = now - started;
    bar.style.width = Math.min(100, (elapsed / DWELL) * 100) + '%';
    if (elapsed >= DWELL) show(index + 1);
  }
  // Fetch the later slides once the first has painted, so cross-fades never flash empty.
  function preload() { slides.forEach(function (el) { var im = new Image(); im.src = el.currentSrc || el.src; }); }
  if (document.readyState === 'complete') setTimeout(preload, 300); else window.addEventListener('load', function () { setTimeout(preload, 300); });

  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }, { threshold: 0.25 }).observe(stage);

  // Step buttons: jump to that step's slide, or seek the recording while it is playing.
  chips.forEach(function (b) {
    b.addEventListener('click', function () {
      var step = parseInt(b.dataset.step, 10);
      if (inVideo) { video.currentTime = parseFloat(b.dataset.start); video.play().catch(function () {}); return; }
      for (var i = 0; i < slides.length; i++) if (stepOf(i) === step) { show(i); break; }
    });
  });

  // Recording mode.
  var starts = chips.map(function (b) { return parseFloat(b.dataset.start); });
  video.addEventListener('timeupdate', function () {
    if (!inVideo) return;
    var k = 0; for (var i = 0; i < starts.length; i++) if (video.currentTime + 0.05 >= starts[i]) k = i;
    mark(parseInt(chips[k].dataset.step, 10));
  });
  watch.addEventListener('click', function () {
    inVideo = !inVideo;
    stage.classList.toggle('is-video', inVideo);
    video.hidden = !inVideo;
    watch.setAttribute('aria-pressed', inVideo);
    watch.textContent = inVideo ? '↺ Back to step highlights' : '▶ Watch the full recording';
    if (inVideo) { video.currentTime = starts[Math.max(0, chips.findIndex(function (b) { return b.classList.contains('on'); }))] || 0; video.play().catch(function () { video.controls = true; }); }
    else { video.pause(); show(index); }
  });

  show(0);
  raf = requestAnimationFrame(tick);
})();
