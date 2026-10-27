/* RobOS Party Game — guest phone controller: join, survey, role, answers. */
(function () {
  'use strict';

  var STORE = 'robos-party-guest';
  var app = document.getElementById('app');
  var me = load();
  var view = null;
  var qIndex = 0;
  var renderKey = '';
  var es = null;
  var houseMode = false; // the party host is filling in the house survey
  var houseSaveTimer = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }
  function save(v) {
    me = v;
    try { v ? localStorage.setItem(STORE, JSON.stringify(v)) : localStorage.removeItem(STORE); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
  }
  function authed(body) {
    body.guestId = me.guestId;
    body.token = me.token;
    return body;
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // ── Join ─────────────────────────────────────────────────────────────────
  function renderJoin(error) {
    renderKey = 'join';
    document.getElementById('bar').classList.add('hidden');
    app.innerHTML =
      '<div class="hero"><div class="hero-emoji">🎉</div><h1>RobOS Party Game</h1>' +
      '<p class="muted">Tell the host about yourself. It will be used for comedy.</p></div>' +
      '<form id="joinForm" class="card"><label for="name">Your name</label>' +
      '<input id="name" maxlength="24" autocomplete="nickname" placeholder="e.g. Sam" required>' +
      (error ? '<div class="error">' + esc(error) + '</div>' : '') +
      '<button class="primary" type="submit">Join the party</button></form>';
    document.getElementById('joinForm').onsubmit = function (e) {
      e.preventDefault();
      var name = document.getElementById('name').value.trim();
      if (!name) return;
      post('/api/join', { name: name }).then(function (r) {
        save({ guestId: r.guestId, token: r.token });
        connect();
      }).catch(function (err) { renderJoin(err.message); });
    };
  }

  // ── Survey ───────────────────────────────────────────────────────────────
  function firstUnanswered() {
    for (var i = 0; i < view.survey.length; i++) if (view.me.answers[view.survey[i].id] === undefined) return i;
    return view.survey.length;
  }

  function renderSurvey(force) {
    var qs = view.survey;
    var key = 'survey:' + qIndex + ':' + qs.length + ':' + view.canClaimPartyHost;
    if (!force && key === renderKey) return;
    var typed = document.getElementById('textAnswer');
    var typedValue = typed && renderKey.indexOf('survey:' + qIndex + ':') === 0 ? typed.value : null;
    renderKey = key;
    if (qIndex >= qs.length) return renderWaiting();
    var q = qs[qIndex];
    var current = typedValue != null ? typedValue : view.me.answers[q.id];
    var html = hostClaimBanner() + '<div class="progress"><i style="width:' + Math.round((qIndex / qs.length) * 100) + '%"></i></div>';
    html += '<div class="card question-card"><div class="qcount">Question ' + (qIndex + 1) + ' of ' + qs.length + '</div><h2>' + esc(q.prompt) + '</h2>';
    if (q.kind === 'choice') {
      html += '<div class="choices">' + q.options.map(function (o) {
        return '<button type="button" class="choice ' + (current === o.value ? 'sel' : '') + '" data-v="' + esc(o.value) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>';
    } else if (q.kind === 'scale') {
      html += '<div class="scale">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" class="choice ' + (current === n ? 'sel' : '') + '" data-v="' + n + '">' + n + '</button>';
      }).join('') + '</div><div class="scale-labels"><span>' + esc(q.minLabel || '') + '</span><span>' + esc(q.maxLabel || '') + '</span></div>';
    } else {
      html += '<form id="textForm"><input id="textAnswer" maxlength="120" placeholder="' + esc(q.placeholder || '') + '" value="' + esc(current || '') + '">' +
        '<button class="primary" type="submit">Next</button></form>';
    }
    html += '</div><div class="nav">' + (qIndex > 0 ? '<button type="button" id="back" class="ghost">Back</button>' : '<span></span>') + '</div>';
    app.innerHTML = html;

    function answer(value) {
      var a = {};
      a[q.id] = value;
      post('/api/survey', authed({ answers: a })).then(function () {
        view.me.answers[q.id] = value;
        qIndex += 1;
        renderSurvey(true);
      }).catch(function (err) { toast(err.message); });
    }
    Array.prototype.forEach.call(app.querySelectorAll('.choice'), function (b) {
      b.onclick = function () { answer(q.kind === 'scale' ? Number(b.getAttribute('data-v')) : b.getAttribute('data-v')); };
    });
    var tf = document.getElementById('textForm');
    if (tf) {
      var input = document.getElementById('textAnswer');
      input.focus();
      tf.onsubmit = function (e) {
        e.preventDefault();
        if (input.value.trim()) answer(input.value.trim());
      };
    }
    var back = document.getElementById('back');
    if (back) back.onclick = function () { qIndex -= 1; renderSurvey(true); };
    wireHostClaim();
  }

  // ── Party host ───────────────────────────────────────────────────────────
  // Until someone claims it, every guest can say "I'm the party host". The
  // party host then describes the house for the AI host.
  function hostClaimBanner() {
    if (!view.canClaimPartyHost) return '';
    return '<div class="host-claim"><span>🏠 Is this party at your place?</span>' +
      '<button type="button" id="claimHost" class="claim">I\'m the party host</button></div>';
  }

  function wireHostClaim() {
    var b = document.getElementById('claimHost');
    if (!b) return;
    b.onclick = function () {
      post('/api/claim-host', authed({})).then(function () {
        houseMode = true;
        renderKey = '';
        render();
      }).catch(function (err) { toast(err.message); renderKey = ''; render(); });
    };
  }

  function houseValue(q, form) {
    if (q.kind === 'multi') {
      return Array.prototype.filter.call(form.querySelectorAll('[name="' + q.id + '"]:checked'), function () { return true; })
        .map(function (el) { return el.value; });
    }
    var el = form.querySelector('[name="' + q.id + '"]');
    if (!el) return undefined;
    if (q.kind === 'choice') {
      var sel = form.querySelector('[name="' + q.id + '"]:checked');
      return sel ? sel.value : undefined;
    }
    return el.value.trim();
  }

  function renderHouse() {
    if (renderKey === 'house') return;
    renderKey = 'house';
    var qs = view.houseSurvey;
    var saved = view.house || {};
    var html = '<div class="hero small-hero"><div class="hero-emoji">🏠</div><h1>Tell me about your place</h1>' +
      '<p class="muted">You are the party host! The AI host builds real challenges from your house, so the more you share the better the games. Starred questions are required.</p></div>' +
      '<div class="meter"><div class="meter-bar"><i id="houseMeter"></i></div><span id="houseMeterText"></span></div>' +
      '<form id="houseForm">';
    qs.forEach(function (q) {
      var v = saved[q.id];
      html += '<div class="card house-q"><label>' + esc(q.prompt) + (q.required ? ' <span class="req">*</span>' : '') + '</label>';
      if (q.kind === 'choice' || q.kind === 'multi') {
        html += '<div class="chips">' + q.options.map(function (o) {
          var on = q.kind === 'multi' ? (v || []).indexOf(o.value) >= 0 : v === o.value;
          return '<label class="chip"><input type="' + (q.kind === 'multi' ? 'checkbox' : 'radio') + '" name="' + q.id + '" value="' + esc(o.value) + '"' + (on ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>';
        }).join('') + '</div>';
      } else {
        html += '<textarea name="' + q.id + '" rows="3" maxlength="600" placeholder="' + esc(q.placeholder || '') + '">' + esc(v || '') + '</textarea>';
      }
      html += '</div>';
    });
    html += '</form><button type="button" id="houseDone" class="primary">Save and continue</button>';
    app.innerHTML = html;
    var form = document.getElementById('houseForm');
    function collect() {
      var answers = {};
      qs.forEach(function (q) {
        var v = houseValue(q, form);
        if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) answers[q.id] = v;
      });
      return answers;
    }
    function showProgress(p) {
      if (!p) return;
      document.getElementById('houseMeter').style.width = p.percent + '%';
      document.getElementById('houseMeterText').textContent = p.complete
        ? p.percent + '% described' + (p.percent < 70 ? ' · more detail makes better games!' : ' · amazing!')
        : 'Required: ' + p.missing.length + ' left';
    }
    function save() {
      return post('/api/house', authed({ answers: collect() })).then(function (r) { showProgress(r.progress); return r.progress; });
    }
    showProgress(view.partyHost && view.partyHost.house);
    form.addEventListener('change', function () {
      clearTimeout(houseSaveTimer);
      houseSaveTimer = setTimeout(save, 600);
    });
    form.addEventListener('input', function () {
      clearTimeout(houseSaveTimer);
      houseSaveTimer = setTimeout(save, 1200);
    });
    document.getElementById('houseDone').onclick = function () {
      clearTimeout(houseSaveTimer);
      save().then(function (p) {
        if (!p.complete) return toast('Please answer the starred questions.');
        houseMode = false;
        renderKey = '';
        render();
      }).catch(function (err) { toast(err.message); });
    };
  }

  function renderWaiting() {
    var hostInfo = view.partyHost ? view.partyHost.name + ':' + view.partyHost.house.percent : 'none';
    var key = 'waiting:' + view.guests.length + ':' + view.phase + ':' + hostInfo + ':' + view.canClaimPartyHost;
    if (key === renderKey) return;
    renderKey = key;
    var ready = view.guests.filter(function (g) { return g.surveyComplete; }).length;
    var hostLine = view.partyHost
      ? '<p class="muted">🏠 Party host: <b>' + esc(view.partyHost.name) + '</b> · house ' + view.partyHost.house.percent + '% described</p>'
      : '';
    app.innerHTML = hostClaimBanner() + '<div class="hero"><div class="hero-emoji">' + esc(view.me.avatar) + '</div><h1>You\'re in, ' + esc(view.me.name) + '!</h1>' +
      '<p class="muted">Watch the TV. ' + ready + ' of ' + view.guests.length + ' guests are ready.</p>' + hostLine +
      '<button type="button" id="edit" class="ghost">Change my answers</button>' +
      (view.isPartyHost ? ' <button type="button" id="editHouse" class="ghost">Edit house details</button>' : '') + '</div>';
    document.getElementById('edit').onclick = function () { qIndex = 0; renderSurvey(true); };
    var eh = document.getElementById('editHouse');
    if (eh) eh.onclick = function () { houseMode = true; renderKey = ''; render(); };
    wireHostClaim();
  }

  // ── Game ─────────────────────────────────────────────────────────────────
  function roleCard(role) {
    return '<div class="role-card" style="--rc:' + esc(role.color) + '"><div class="remoji">' + esc(role.emoji) + '</div>' +
      '<div class="kicker">You are</div><h2>' + esc(role.title) + '</h2><p>' + esc(role.blurb) + '</p>' +
      '<div class="secret"><b>Your secret power</b><br>' + esc(role.secret) + '</div>' +
      (role.secretRole ? '<div class="warn">Keep this hidden! The TV says you are “' + esc(role.publicTitle) + '”.</div>' : '') + '</div>';
  }

  function renderQuestion() {
    var r = view.round;
    var m = view.me;
    var key = 'q:' + view.game.id + ':' + r.number + ':' + (m.answer || '') + ':' + m.doubledThisRound + ':' + m.canDoubleDown;
    if (key === renderKey) return;
    renderKey = key;
    if (m.sittingOut) {
      app.innerHTML = '<div class="hero"><div class="hero-emoji">🤫</div><h1>This one is about you</h1><p class="muted">Sit back. Keep a straight face.</p></div>';
      return;
    }
    var html = '<div class="kicker">' + esc(view.game.icon + ' ' + view.game.title) + ' · ' + r.number + '/' + r.total + '</div>';
    html += '<h2>' + esc(r.headline) + '</h2>' + (r.body ? '<div class="q-body">' + esc(r.body) + '</div>' : '');
    html += '<div class="choices answers">' + r.options.map(function (o) {
      var cls = 'choice';
      if (m.answer === o.id) cls += ' sel';
      if (m.hint === o.id) cls += ' crossed';
      if (o.guestId === m.id) cls += ' self';
      return '<button type="button" class="' + cls + '" data-id="' + esc(o.id) + '"' + (m.hint === o.id ? ' disabled' : '') + '>' + esc(o.label) + (o.guestId === m.id ? ' (you)' : '') + '</button>';
    }).join('') + '</div>';
    if (m.hint) html += '<div class="hint">🕵️ Detective tip: one wrong answer is crossed out.</div>';
    if (m.canDoubleDown) html += '<button type="button" id="dd" class="double">DOUBLE DOWN ×2</button>';
    if (m.doubledThisRound) html += '<div class="hint hot">🔥 Doubled! Get it right.</div>';
    if (m.answer) html += '<div class="locked-in">🔒 Locked in. You can still change it.</div>';
    app.innerHTML = html;
    Array.prototype.forEach.call(app.querySelectorAll('.answers .choice'), function (b) {
      b.onclick = function () {
        post('/api/answer', authed({ optionId: b.getAttribute('data-id') })).catch(function (err) { toast(err.message); });
      };
    });
    var dd = document.getElementById('dd');
    if (dd) dd.onclick = function () { post('/api/double-down', authed({})).catch(function (err) { toast(err.message); }); };
  }

  function renderReveal() {
    var d = view.me.delta;
    var key = 'reveal:' + view.game.id + ':' + view.round.number;
    if (key === renderKey) return;
    renderKey = key;
    var res = view.result || {};
    app.innerHTML = '<div class="hero"><div class="hero-emoji">' + (d && d.points > 0 ? '🎉' : d && d.points < 0 ? '💥' : '😬') + '</div>' +
      '<h1>' + (d ? (d.points > 0 ? '+' : '') + d.points + ' points' : 'No points') + '</h1>' +
      (d ? '<p class="muted">' + esc(d.reasons.join(' · ')) + '</p>' : '') +
      '<div class="card"><b>' + esc(res.reveal ? res.reveal.headline : '') + '</b> ' + esc(res.correctLabel || '') +
      '<div class="muted">' + esc(res.reveal ? res.reveal.detail : '') + '</div></div></div>';
  }

  function renderStatus(emoji, title, sub) {
    var key = 'status:' + title + ':' + sub;
    if (key === renderKey) return;
    renderKey = key;
    app.innerHTML = '<div class="hero"><div class="hero-emoji">' + emoji + '</div><h1>' + esc(title) + '</h1><p class="muted">' + esc(sub || '') + '</p></div>';
  }

  function renderBar() {
    var m = view.me;
    document.getElementById('bar').classList.remove('hidden');
    var av = document.getElementById('meAvatar');
    av.textContent = m.avatar;
    av.style.setProperty('--c', m.color);
    document.getElementById('meName').textContent = m.name;
    document.getElementById('meScore').textContent = view.phase === 'lobby' || view.phase === 'setup' ? '' : m.score + ' pts · #' + m.rank;
    var chip = document.getElementById('roleChip');
    if (m.role) {
      chip.classList.remove('hidden');
      chip.textContent = m.role.emoji + ' ' + m.role.title;
      chip.style.borderColor = m.role.color;
      chip.onclick = function () {
        var sheet = document.getElementById('roleSheet');
        sheet.innerHTML = roleCard(m.role) + '<button type="button" class="primary" id="closeSheet">Got it</button>';
        sheet.classList.remove('hidden');
        document.getElementById('closeSheet').onclick = function () { sheet.classList.add('hidden'); };
      };
    } else chip.classList.add('hidden');
  }

  function render() {
    if (!view) return;
    if (view.error === 'unknown-guest') {
      save(null);
      return renderJoin('That party ended. Join the new one!');
    }
    renderBar();
    var m = view.me;
    switch (view.phase) {
      case 'setup':
      case 'lobby':
        if (!view.survey) return renderStatus('⏳', 'Hang tight', 'The host is getting ready.');
        // The party host must describe the house; it opens right after claiming
        // and again until the required answers are in.
        if (view.isPartyHost && (houseMode || (m.surveyComplete && !view.partyHost.house.complete))) return renderHouse();
        if (renderKey.indexOf('survey') !== 0 && renderKey.indexOf('waiting') !== 0) qIndex = firstUnanswered();
        if (renderKey.indexOf('waiting') === 0 && m.surveyComplete) return renderWaiting();
        return renderSurvey(false);
      case 'roles':
        if (m.role) {
          var key = 'role:' + m.role.id;
          if (key !== renderKey) {
            renderKey = key;
            app.innerHTML = roleCard(m.role) + '<p class="muted center">Keep your phone private. Watch the TV!</p>';
          }
          return;
        }
        return renderStatus('🎭', 'Roles incoming…', 'Watch the TV for your reveal.');
      case 'game-intro':
        return renderStatus(view.game ? view.game.icon : '🎲', view.game ? view.game.title : 'Next game', view.game ? view.game.description : '');
      case 'question':
        return renderQuestion();
      case 'reveal':
        return renderReveal();
      case 'scores':
        return renderStatus('📊', 'You are #' + m.rank, m.score + ' points so far');
      case 'finale':
        return renderStatus(view.winnerIds.indexOf(m.id) >= 0 ? '🏆' : '🎉', view.winnerIds.indexOf(m.id) >= 0 ? 'You won!' : 'You finished #' + m.rank, m.score + ' points. Thanks for playing!');
      default:
        return null;
    }
  }

  function onView(v) {
    view = v;
    render();
  }

  function connect() {
    if (!me) return renderJoin();
    var qs = 'role=player&guest=' + encodeURIComponent(me.guestId) + '&token=' + encodeURIComponent(me.token);
    fetch('/api/view?' + qs).then(function (r) {
      if (r.status === 401) {
        save(null);
        renderJoin();
        return null;
      }
      return r.json();
    }).then(function (v) {
      if (!v) return;
      onView(v);
      if (es) es.close();
      es = new EventSource('/events?' + qs);
      es.onmessage = function (e) { try { onView(JSON.parse(e.data)); } catch (err) {} };
    }).catch(function () {
      app.innerHTML = '<div class="center muted">Can\'t reach the party. Retrying…</div>';
      setTimeout(connect, 2000);
    });
  }

  connect();
})();
