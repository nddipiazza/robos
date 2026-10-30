/* Quick start wizard (rowbose.com/using-robos-wizard/).
   Walks the decision tree in site/_data/quickstart.yml (embedded as #qs-data), then
   builds a guide for the answers. Answers live in the URL hash (question=option index),
   so the browser back button works and a finished guide can be shared as a link. */
(function () {
  'use strict';
  var root = document.getElementById('qs-app');
  var dataEl = document.getElementById('qs-data');
  if (!root || !dataEl) return;
  var D = JSON.parse(dataEl.textContent);
  var REL = { version: root.dataset.version, download: root.dataset.download, url: root.dataset.releaseUrl };

  var OS_NAME = { win: 'Windows', mac: 'Mac', linux: 'Linux', any: 'your computer' };
  var SOURCE_APP = { dev: 'pr-review', lead: 'pr-review', ops: 'kube-studio', creator: 'crpg-editor', gamer: 'party-game', home: 'audio-player', business: 'point-of-sale' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function link(l, cls) {
    var ext = /^https?:/.test(l.url);
    return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(l.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l.label) + '</a>';
  }
  function detectOS() {
    var p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '').toLowerCase();
    if (/win/.test(p)) return 'win';
    if (/mac|iphone|ipad/.test(p)) return 'mac';
    if (/linux|x11|cros/.test(p) && !/android/.test(p)) return 'linux';
    return 'any';
  }

  /* ---------- state from the URL hash ---------- */
  function parseHash() {
    var out = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = kv.slice(i + 1).split(',').filter(Boolean).map(Number);
    });
    return out;
  }
  function toHash(picks, path) {
    return '#' + path.filter(function (q) { return picks[q]; }).map(function (q) { return q + '=' + picks[q].join(','); }).join('&');
  }
  // Follow the tree through the recorded picks. Stops at the first unanswered question.
  function walk(picks) {
    var path = [], answers = {}, apps = [], q = D.start, guard = 0;
    while (q && D.questions[q] && guard++ < 20) {
      path.push(q);
      var Q = D.questions[q], sel = picks[q];
      var skipped = !!(Q.multi && sel && sel.length === 1 && sel[0] === -1);
      if (!sel || !sel.length || (!skipped && sel.some(function (i) { return !Q.options[i]; }))) return { path: path, answers: answers, apps: apps, current: q, done: false };
      var next = Q.next;
      if (!skipped) sel.forEach(function (i) {
        var o = Q.options[i];
        if (o.set) Object.keys(o.set).forEach(function (k) { answers[k] = o.set[k]; });
        if (o.apps) apps = apps.concat(o.apps);
        if (o.next) next = o.next;
      });
      answers['_' + q] = skipped ? [] : sel.map(function (i) { return Q.options[i].label; });
      q = next;
    }
    return { path: path, answers: answers, apps: apps, current: null, done: true };
  }
  // How many questions are left if the visitor keeps picking the first option.
  function remaining(q) {
    var n = 0, guard = 0;
    while (q && D.questions[q] && guard++ < 20) { n++; var Q = D.questions[q]; q = (Q.options[0] && Q.options[0].next) || Q.next; }
    return n;
  }

  var picks = parseHash();

  function go(newPicks, replace) {
    picks = newPicks;
    var st = walk(picks);
    var h = toHash(picks, st.path);
    if (replace) history.replaceState(null, '', h || location.pathname); else history.pushState(null, '', h || location.pathname);
    render();
    var top = document.getElementById('quickstart');
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth' });
  }
  function answer(q, sel) {
    var st = walk(picks), keep = {};
    // Drop answers after this question: a different choice can lead down another branch.
    for (var i = 0; i < st.path.length; i++) { if (st.path[i] === q) break; keep[st.path[i]] = picks[st.path[i]]; }
    keep[q] = sel;
    go(keep);
  }
  function back() {
    var st = walk(picks), keep = {};
    var stop = st.done ? st.path.length - 1 : st.path.length - 2;
    for (var i = 0; i < stop; i++) keep[st.path[i]] = picks[st.path[i]];
    go(keep);
  }

  /* ---------- question screen ---------- */
  function renderQuestion(st) {
    var q = st.current, Q = D.questions[q];
    var step = st.path.length, total = step - 1 + remaining(q);
    var html = '<div class="qs-card qs-q" data-q="' + esc(q) + '">';
    html += '<div class="qs-meter" role="progressbar" aria-valuemin="1" aria-valuemax="' + total + '" aria-valuenow="' + step + '" aria-label="Question ' + step + ' of ' + total + '"><i style="width:' + Math.round(100 * (step - 1) / total) + '%"></i></div>';
    html += '<p class="qs-step">Question ' + step + ' of ' + total + (Q.multi ? ' · choose any' : '') + '</p>';
    html += '<h2 class="qs-title" tabindex="-1">' + esc(Q.title) + '</h2>';
    if (Q.help) html += '<p class="qs-help">' + esc(Q.help) + '</p>';
    html += '<div class="qs-opts' + (Q.options.length > 4 ? ' is-many' : '') + '" role="' + (Q.multi ? 'group' : 'list') + '">';
    var sel = picks[q] || [];
    Q.options.forEach(function (o, i) {
      var on = sel.indexOf(i) !== -1;
      html += '<button type="button" class="qs-opt' + (on ? ' is-on' : '') + '" data-i="' + i + '"' + (Q.multi ? ' aria-pressed="' + on + '"' : '') + '>';
      if (Q.multi) html += '<span class="qs-check" aria-hidden="true"></span>';
      else if (o.icon) html += '<img class="qs-ic" src="/assets/icons/' + esc(o.icon) + '.svg" alt="" width="40" height="40">';
      html += '<span class="qs-opt-t"><b>' + esc(o.label) + '</b>' + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span>';
      if (!Q.multi) html += '<span class="qs-go" aria-hidden="true">→</span>';
      html += '</button>';
    });
    html += '</div><div class="qs-nav">';
    html += step > 1 ? '<button type="button" class="qs-link" data-act="back">← Back</button>' : '<span></span>';
    if (Q.multi) html += '<button type="button" class="btn" data-act="next">' + (sel.length ? 'Continue →' : 'Skip →') + '</button>';
    html += '</div></div>';
    root.innerHTML = html;

    root.querySelectorAll('.qs-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.dataset.i);
        if (!Q.multi) return answer(q, [i]);
        var on = b.classList.toggle('is-on');
        b.setAttribute('aria-pressed', on);
        var n = root.querySelectorAll('.qs-opt.is-on').length;
        root.querySelector('[data-act=next]').textContent = n ? 'Continue →' : 'Skip →';
      });
    });
    var nb = root.querySelector('[data-act=next]');
    if (nb) nb.addEventListener('click', function () {
      var s = [].map.call(root.querySelectorAll('.qs-opt.is-on'), function (b) { return Number(b.dataset.i); });
      answer(q, s.length ? s : [-1]);
    });
    var bb = root.querySelector('[data-act=back]');
    if (bb) bb.addEventListener('click', back);
    var t = root.querySelector('.qs-title');
    if (t && document.activeElement && document.activeElement !== document.body) t.focus({ preventScroll: true });
  }

  /* ---------- the guide ---------- */
  function downloadButtons(os) {
    var d = REL.download, v = REL.version, b = [];
    if (os === 'win' || os === 'any') b.push({ label: 'Download for Windows', url: d + '/RobOS-v' + v + '-Windows-Setup.exe' });
    if (os === 'mac' || os === 'any') {
      b.push({ label: os === 'any' ? 'Mac (Apple chip)' : 'Download for Mac with Apple chip', url: d + '/RobOS-v' + v + '-macOS-arm64.dmg' });
      b.push({ label: os === 'any' ? 'Mac (Intel)' : 'Mac with Intel', url: d + '/RobOS-v' + v + '-macOS-x64.dmg', ghost: true });
    }
    if (os === 'linux' || os === 'any') b.push({ label: os === 'any' ? 'Linux (AppImage)' : 'Download for Linux (AppImage)', url: d + '/RobOS-v' + v + '-Linux-x86_64.AppImage' });
    return '<div class="qs-dl">' + b.map(function (x, i) {
      return '<a class="btn' + (x.ghost || (os === 'any' && i > 0) ? ' btn-ghost' : '') + '" href="' + esc(x.url) + '"><img class="btn-ic" src="/assets/icons/download.svg" alt="" width="18" height="18"> ' + esc(x.label) + '</a>';
    }).join('') + '</div>';
  }
  function installSteps(os, level, persona) {
    var pick = persona === 'gamer' ? 'the games' : persona === 'creator' ? 'the game tools' : 'the apps';
    var steps;
    if (level === 'tech') {
      steps = {
        win: ['Run the installer. App Manager opens with every app in a grouped checkbox tree.', 'Tick ' + pick + ' below (or the whole library). Each gets a Start menu entry; remove them the same way.', 'Open Software Center to install your coding-agent CLI, IDEs, Godot 4 and FFmpeg through WinGet.'],
        mac: ['Open the DMG and install App Manager.', 'Tick ' + pick + ' below. Each gets its own launcher, and you can add or remove apps later.'],
        linux: ['<code>chmod +x</code> the AppImage and run it to open App Manager.', 'Tick ' + pick + ' below. Each gets a native launcher. On GNOME you can also install from source into the app grid (see below).'],
        any: ['Download App Manager for your system and open it.', 'Tick ' + pick + ' below. Each gets its own launcher.']
      }[os];
    } else {
      steps = {
        win: ['Click the download button above to get RobOS for Windows.', 'Open the file you downloaded. If Windows asks whether to allow it, choose <b>Yes</b>. If it warns about an unrecognized app, choose <b>More info</b>, then <b>Run anyway</b>.', 'RobOS App Manager opens. Tick ' + pick + ' listed below and start the download.', 'Open your apps from the <b>Start</b> menu, like any other program.'],
        mac: ['Click the button for your Mac. Not sure which? Open the Apple menu → <b>About This Mac</b>. If it says <b>Chip: Apple M…</b>, pick Apple chip; if it says <b>Intel</b>, pick Intel.', 'Open the file you downloaded and follow the prompts to install RobOS App Manager.', 'If your Mac says it can\'t open the app, go to <b>System Settings → Privacy &amp; Security</b> and choose <b>Open Anyway</b>.', 'In App Manager, tick ' + pick + ' listed below. Each one gets its own icon.'],
        linux: ['Click the download button above to get the AppImage file.', 'Right-click the file, open <b>Properties</b> and turn on <b>Allow executing file as program</b>.', 'Double-click it to open RobOS App Manager, then tick ' + pick + ' listed below.'],
        any: ['Pick the download for your computer above.', 'Open the file you downloaded and follow the prompts.', 'RobOS App Manager opens. Tick ' + pick + ' listed below.']
      }[os];
    }
    return '<ol class="qs-steps">' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>';
  }
  function codeBlock(text) {
    return '<pre class="code qs-code"><button type="button" class="qs-copy">Copy</button><code>' + esc(text) + '</code></pre>';
  }
  function appCards(ids, intro) {
    var seen = {}, list = ids.filter(function (id) { if (seen[id] || !D.apps[id]) return false; seen[id] = 1; return true; });
    if (!list.length) return '';
    var html = intro ? '<p class="qs-sub">' + intro + '</p>' : '';
    html += '<div class="qs-apps">' + list.map(function (id) {
      var a = D.apps[id], how = D.games[id];
      return '<a class="card qs-app" href="' + esc(a.url) + '"><b>' + esc(a.name) + (a.preview ? ' <span class="qs-tag">Preview · sample data</span>' : '') + '</b><span>' + esc(a.text) + '</span>' + (how ? '<small>' + esc(how) + '</small>' : '') + '</a>';
    }).join('') + '</div>';
    return html;
  }

  function renderGuide(st) {
    var A = st.answers, level = A.level || 'basic', persona = A.persona || 'home';
    var P = D.personas[persona] || D.personas.home;
    var os = A.os === 'detect' ? detectOS() : (A.os || 'any');
    var tech = level === 'tech';
    var bx = A.business && D.extras.business[A.business], cx = A.create && D.extras.create[A.create];
    var apps = st.apps.slice();
    if (bx) apps = bx.apps.concat(apps);
    if (cx) apps = cx.apps.concat(apps);
    if (!apps.length) apps = P.apps.length ? P.apps : (persona === 'gamer' ? Object.keys(D.games) : ['audio-player', 'movie-player', 'household', 'smart-light', 'robos-tv', 'party-game']);
    else if (persona === 'dev' || persona === 'lead' || persona === 'ops') apps = apps.concat(P.apps);

    var wowLinks = P.wow_links.concat(bx ? bx.links : []).concat(cx ? cx.links.slice(0, 1) : []);
    var read = [];
    if (A.team && D.extras.team[A.team]) read.push(D.extras.team[A.team]);
    if (cx) read = read.concat(cx.links);
    read = read.concat(P.read);

    var chips = st.path.map(function (q) { return q === 'os' && A.os === 'detect' ? [OS_NAME[os] === 'your computer' ? 'Any computer' : OS_NAME[os] + ' (detected)'] : A['_' + q]; })
      .filter(function (l) { return l && l.length; })
      .map(function (l) { return l.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }).join('');

    var h = '<div class="qs-guide">';
    // 1. header
    h += '<header class="qs-ghead"><p class="eyebrow">' + esc(P.eyebrow) + '</p><h2 class="qs-gtitle" tabindex="-1">' + esc(P.title) + '</h2>';
    h += '<ul class="qs-chips" aria-label="Your answers">' + chips + '</ul>';
    h += '<div class="qs-gactions"><button type="button" class="qs-link" data-act="back">← Change last answer</button><button type="button" class="qs-link" data-act="restart">Start over</button><button type="button" class="qs-link" data-act="share">Copy link to this guide</button></div></header>';

    // 2. the wow
    h += '<section class="qs-card qs-wow"><p class="qs-kicker">The highlight</p><h3>' + esc(P.wow_title) + '</h3><p>' + esc(P.wow) + '</p>';
    if (wowLinks.length) h += '<div class="qs-links">' + wowLinks.map(function (l, i) { return link(l, i ? 'btn btn-ghost' : 'btn'); }).join('') + '</div>';
    h += '</section>';

    // 3. install
    h += '<section class="qs-card qs-install"><p class="qs-kicker">Step 1</p><h3>Install RobOS on ' + esc(OS_NAME[os]) + '</h3>';
    if (!tech) h += '<p>RobOS is free. One small program, <b>App Manager</b>, lets you pick which apps to install, so you only get what you need.</p>';
    h += downloadButtons(os) + installSteps(os, level, persona);
    if (persona === 'gamer' || persona === 'creator') {
      h += '<div class="qs-note"><b>About the games:</b> the Party Game and the game editors install from App Manager (the <i>Games &amp; game tools</i> group). The other games are Godot 4 projects you run from the source code; ' +
        (os === 'win' ? 'on Windows, Software Center can install Godot 4 for you.' : 'install Godot 4.3 or newer from godotengine.org first.') + '</div>';
      if (tech || persona === 'creator' || level === 'savvy') h += codeBlock('git clone https://github.com/nddipiazza/robos.git\ncd robos/games/tabletop-rpg\nGODOT_BIN=/path/to/godot4 ./play.sh');
    }
    if (tech) {
      h += '<details class="qs-more"' + (persona === 'dev' ? ' open' : '') + '><summary>Prefer running from source?</summary><p>Needs Node.js 20+, Git and a desktop session. Each app is its own Electron package; the script installs its dependencies the first time. Run it with no argument to list the apps.</p>' +
        codeBlock('git clone https://github.com/nddipiazza/robos.git\ncd robos\nscripts/dev-launch.sh ' + (SOURCE_APP[persona] || 'pr-review')) +
        '<p class="qs-sub">' + link({ label: 'GNOME launcher, the VM and the Linux appliance', url: '/download/#linux-distro' }) + ' · ' + link({ label: 'Full install guide', url: '/v1/getting-started.html' }) + '</p></details>';
    }
    if (A.agent && D.extras.agent[A.agent]) h += '<p class="qs-sub"><b>Then connect your agent:</b> ' + link(D.extras.agent[A.agent]) + '. RobOS runs the CLI you are already signed in to.</p>';
    if (apps.indexOf('party-game') !== -1) h += '<p class="qs-sub"><b>Party Game needs two things first:</b> a TV paired in ' + link({ label: 'Smart TV Studio', url: '/tv/' }) + ', and an AI agent signed in under RobOS Agents, because the AI hosts the show.</p>';
    h += '<p class="qs-sub">' + link({ label: 'Every install option', url: '/download/' }) + '</p></section>';

    // 4. apps for you
    var hasPreview = apps.some(function (id) { return D.apps[id] && D.apps[id].preview; });
    var intro = tech ? 'Start with these.' + (hasPreview ? ' Apps marked Preview are demos that show sample data while they are being built out.' : '') : 'Tick these in App Manager. You can add more any time.';
    if (persona === 'gamer') intro = 'How to start each game you picked:';
    h += '<section class="qs-card"><p class="qs-kicker">Step 2</p><h3>' + (persona === 'gamer' ? 'Your games' : 'Apps picked for you') + '</h3>' + appCards(apps, intro) + '</section>';

    // 5. the suites, for everyone
    h += '<section class="qs-card"><p class="qs-kicker">Also included</p><h3>' + (tech ? 'The app suites come with it' : 'More free apps in RobOS') + '</h3>';
    h += '<p class="qs-sub">' + (tech ? 'RobOS is one suite. The same install gives you the everyday apps, each built on the same knowledge graph you can extend.' : 'Install any of these from the same App Manager.') + '</p>';
    var shown = {};
    apps.forEach(function (id) { if (D.apps[id]) shown[D.apps[id].url] = 1; });
    var suites = D.suites.filter(function (s) { return !shown[s.url]; });
    if (suites.length) h += '<div class="qs-suites">' + suites.map(function (s) { return '<a href="' + esc(s.url) + '"><b>' + esc(s.label) + '</b><span>' + esc(s.text) + '</span></a>'; }).join('') + '</div>';
    h += '<p class="qs-sub">' + link({ label: 'Browse every app', url: '/apps/' }) + '</p></section>';

    // 6. read next
    h += '<section class="qs-card"><p class="qs-kicker">Step 3</p><h3>Read next</h3><ul class="qs-read">' + read.map(function (l) { return '<li>' + link(l) + '</li>'; }).join('') + '</ul></section>';
    h += '</div>';
    root.innerHTML = h;

    root.querySelector('[data-act=back]').addEventListener('click', back);
    root.querySelector('[data-act=restart]').addEventListener('click', function () { go({}); });
    var sh = root.querySelector('[data-act=share]');
    sh.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(location.href);
      sh.textContent = 'Link copied'; setTimeout(function () { sh.textContent = 'Copy link to this guide'; }, 1600);
    });
    root.querySelectorAll('.qs-copy').forEach(function (b) {
      b.addEventListener('click', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(b.parentElement.querySelector('code').innerText);
        b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1400);
      });
    });
    var t = root.querySelector('.qs-gtitle');
    if (t && document.activeElement && document.activeElement !== document.body) t.focus({ preventScroll: true });
  }

  function render() {
    var st = walk(picks);
    root.classList.toggle('is-guide', st.done);
    if (st.done) renderGuide(st); else renderQuestion(st);
  }

  window.addEventListener('popstate', function () { picks = parseHash(); render(); });
  var start = document.getElementById('qs-start');
  if (start) start.addEventListener('click', function () { document.getElementById('quickstart').scrollIntoView({ behavior: 'smooth' }); });
  render();
})();
