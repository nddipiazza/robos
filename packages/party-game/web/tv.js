/* RobOS Party Game — TV screen.
 * Screens: stage (host face + main action), scoreboard (live standings and
 * lock-ins), spotlight (the guest the round is about, plus a giant countdown).
 * Kept to ES2015 without optional chaining so older TV browsers can run it. */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var screen = params.get('screen') || 'stage';
  var face = window.createHostFace(document.getElementById('face'));
  var content = document.getElementById('content');
  var caption = document.getElementById('caption');
  var strip = document.getElementById('strip');
  var voice = document.getElementById('voice');
  var view = null;
  var clockOffset = 0;
  var lastNarrationId = null;
  var lastPhaseKey = null;
  var lastHtml = '';

  document.body.className = 'screen-' + screen;
  document.getElementById('screenLabel').textContent =
    { stage: 'MAIN STAGE', scoreboard: 'SCOREBOARD', spotlight: 'SPOTLIGHT' }[screen] || screen.toUpperCase();

  var PHASES = {
    setup: 'Setting up', lobby: 'Join the party', roles: 'Role reveal', 'game-intro': 'Next mini game',
    question: 'Answer on your phone', reveal: 'The reveal', scores: 'Scoreboard', finale: 'Finale',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function guestById(id) {
    if (!view) return null;
    for (var i = 0; i < view.guests.length; i++) if (view.guests[i].id === id) return view.guests[i];
    return null;
  }
  function ranked() {
    return view.ranking.map(guestById).filter(Boolean);
  }
  function secondsLeft() {
    if (!view || !view.phaseEndsAt) return null;
    return Math.max(0, Math.ceil((view.phaseEndsAt - (Date.now() + clockOffset)) / 1000));
  }
  function avatar(g, extra) {
    return '<span class="avatar ' + (extra || '') + '" style="--c:' + esc(g.color) + '">' + esc(g.avatar) + '</span>';
  }
  function flash() {
    var f = document.getElementById('flash');
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  // ── Narration ────────────────────────────────────────────────────────────
  function speak(n) {
    if (!n || n.id === lastNarrationId) return;
    lastNarrationId = n.id;
    var audio = null;
    if (view.narrationAudio === 'tv' && screen === 'stage') {
      voice.src = '/api/narration/' + encodeURIComponent(n.id);
      var p = voice.play();
      if (p && p.catch) p.catch(function () {});
      audio = voice;
    }
    var words = n.text.split(' ');
    caption.innerHTML = '';
    var spans = words.map(function (w) {
      var s = document.createElement('span');
      s.textContent = w + ' ';
      caption.appendChild(s);
      return s;
    });
    face.say(n, audio, function (pos) {
      var upto = Math.ceil(pos * spans.length);
      for (var i = 0; i < spans.length; i++) spans[i].className = i < upto ? 'said' : '';
    });
  }

  // ── Content per phase ────────────────────────────────────────────────────
  function renderLobby() {
    var html = '<div class="lobby">';
    html += '<div class="join-card"><img class="qr" src="/qr.svg?v=' + encodeURIComponent(view.joinUrl) + '" alt="Join QR">' +
      '<div class="join-text"><div class="kicker">Scan to join</div><div class="join-url">' + esc(view.joinUrl) + '</div>' +
      '<div class="join-hint">Answer a few questions about yourself. The host will use them against you.</div></div></div>';
    var ph = view.partyHost;
    html += '<div class="party-host">' + (ph
      ? '🏠 Party at <b>' + esc(ph.name) + '’s</b> place · house ' + (ph.house.complete ? 'described' : 'tour in progress') +
        '<span class="house-meter"><i style="width:' + ph.house.percent + '%"></i></span>' + ph.house.percent + '%'
      : '🏠 Whose place is this? The party host taps <b>I’m the party host</b> on their phone.') + '</div>';
    html += '<div class="guest-grid">';
    view.guests.forEach(function (g) {
      html += '<div class="guest-chip ' + (g.surveyComplete ? 'ready' : 'typing') + '">' + avatar(g) +
        '<span class="gname">' + esc(g.name) + (ph && ph.guestId === g.id ? ' 🏠' : '') + '</span><span class="gstate">' + (g.surveyComplete ? 'Ready' : 'Answering…') + '</span></div>';
    });
    if (!view.guests.length) html += '<div class="empty">Waiting for the first guest…</div>';
    html += '</div></div>';
    return html;
  }

  function roleCard(g, big) {
    var r = g.role;
    if (!r) return '<div class="role-card mystery ' + (big ? 'big' : '') + '">' + avatar(g) + '<div class="rname">' + esc(g.name) + '</div><div class="rtitle">???</div></div>';
    return '<div class="role-card ' + (big ? 'big' : '') + '" style="--rc:' + esc(r.color) + '">' + avatar(g) +
      '<div class="rname">' + esc(g.name) + '</div><div class="remoji">' + esc(r.emoji) + '</div>' +
      '<div class="rtitle">' + esc(r.title) + '</div><div class="rblurb">' + esc(r.blurb) + '</div></div>';
  }

  function renderRoles() {
    var current = guestById(view.roleRevealGuestId);
    var html = '<div class="roles">';
    if (current) html += '<div class="role-spot">' + roleCard(current, true) + '</div>';
    else html += '<div class="kicker center">Your roles are being decided…</div>';
    html += '<div class="role-row">' + view.guests.map(function (g) { return roleCard(g, false); }).join('') + '</div></div>';
    return html;
  }

  function renderGameIntro() {
    var g = view.game;
    if (!g) return '';
    return '<div class="title-card"><div class="kicker">Mini game ' + g.number + ' of ' + g.total + '</div>' +
      '<div class="tc-icon">' + esc(g.icon) + '</div><h1>' + esc(g.title) + '</h1>' +
      '<div class="tc-tag">' + esc(g.tagline) + '</div><p class="tc-desc">' + esc(g.description) + '</p></div>';
  }

  function timerHtml() {
    var s = secondsLeft();
    if (s == null) return '';
    return '<div class="timer ' + (s <= 5 ? 'hurry' : '') + '" id="timer">' + s + '</div>';
  }

  function renderQuestion(revealing) {
    var r = view.round;
    if (!r) return '';
    var res = view.result;
    var html = '<div class="question">';
    html += '<div class="q-top"><span class="kicker">' + esc(view.game.icon + ' ' + view.game.title) + ' · Round ' + r.number + '/' + r.total + '</span>' + (revealing ? '' : timerHtml()) + '</div>';
    html += '<h1 class="q-head">' + esc(r.headline) + '</h1>';
    if (r.body) html += '<div class="q-body">' + esc(r.body) + '</div>';
    if (r.caption) html += '<div class="q-caption">' + esc(r.caption) + '</div>';
    html += '<div class="options ' + esc(r.layout) + '">';
    r.options.forEach(function (o) {
      var g = o.guestId ? guestById(o.guestId) : null;
      var cls = 'option';
      var votes = 0;
      if (revealing && res) {
        if (o.id === res.correct) cls += ' correct';
        else cls += ' dim';
        for (var k in res.answers) if (res.answers[k] === o.id) votes++;
      }
      if (!revealing && r.excludeGuestIds.indexOf(o.guestId) >= 0 && o.guestId && view.game.id !== 'who-said-that') cls += ' muted';
      html += '<div class="' + cls + '">' + (g ? avatar(g) : '') + '<span class="olabel">' + esc(o.label) + '</span>' +
        (revealing ? '<span class="votes">' + votes + ' vote' + (votes === 1 ? '' : 's') + '</span>' : '') + '</div>';
    });
    html += '</div>';
    if (revealing && res) {
      html += '<div class="reveal-box"><div class="rv-head">' + esc(res.reveal.headline) + ' ' +
        (res.correctLabel && res.reveal.headline.indexOf(res.correctLabel) < 0 && res.reveal.detail.indexOf(res.correctLabel) < 0 ? '<b>' + esc(res.correctLabel) + '</b>' : '') + '</div>' +
        '<div class="rv-detail">' + esc(res.reveal.detail) + '</div>' + deltaRow(res) + '</div>';
    } else {
      html += lockedIn();
    }
    html += '</div>';
    return html;
  }

  function deltaRow(res) {
    var html = '<div class="deltas">';
    Object.keys(res.deltas || {}).forEach(function (id) {
      var g = guestById(id);
      var d = res.deltas[id];
      if (!g) return;
      html += '<div class="delta ' + (d.points < 0 ? 'neg' : '') + '">' + avatar(g, 'sm') + '<b>' + (d.points > 0 ? '+' : '') + d.points + '</b>' +
        '<small>' + esc(d.reasons.slice(1).join(' · ')) + '</small></div>';
    });
    return html + '</div>';
  }

  function lockedIn() {
    var r = view.round;
    var html = '<div class="locked">';
    view.guests.forEach(function (g) {
      if (r.excludeGuestIds.indexOf(g.id) >= 0) return;
      var done = view.answeredIds.indexOf(g.id) >= 0;
      html += '<span class="lock ' + (done ? 'in' : '') + '">' + avatar(g, 'sm') + (done ? '🔒' : '…') + '</span>';
    });
    return html + '</div>';
  }

  function leaderboard(big) {
    var list = ranked();
    var top = list.length ? Math.max(1, list[0].score) : 1;
    var html = '<div class="board ' + (big ? 'big' : '') + '">';
    list.forEach(function (g, i) {
      var winner = view.winnerIds.indexOf(g.id) >= 0;
      html += '<div class="row ' + (winner ? 'winner' : '') + '"><span class="rank">' + (i + 1) + '</span>' + avatar(g) +
        '<span class="bname">' + esc(g.name) + (g.role ? ' <small style="color:' + esc(g.role.color) + '">' + esc(g.role.emoji + ' ' + g.role.title) + '</small>' : '') + '</span>' +
        '<span class="bar"><i style="width:' + Math.max(4, (g.score / top) * 100) + '%;background:' + esc(g.color) + '"></i></span>' +
        '<span class="pts">' + g.score + '</span></div>';
    });
    return html + '</div>';
  }

  function renderScores() {
    return '<div class="scores"><h1>Standings</h1>' + leaderboard(true) + '</div>';
  }

  function renderFinale() {
    var winners = view.winnerIds.map(guestById).filter(Boolean);
    var bits = '';
    for (var c = 0; c < 40; c++) bits += '<i style="left:' + ((c * 37) % 100) + '%;animation-delay:' + ((c * 0.53) % 4).toFixed(2) + 's"></i>';
    var html = '<div class="finale"><div class="confetti">' + bits + '</div>';
    html += '<div class="kicker">The winner' + (winners.length > 1 ? 's' : '') + '</div>';
    html += '<div class="winners">' + winners.map(function (g) { return '<div class="winner-card">' + avatar(g, 'xl') + '<h1>' + esc(g.name) + '</h1><div class="pts">' + g.score + ' pts</div></div>'; }).join('') + '</div>';
    if (view.moleResult) {
      var m = guestById(view.moleResult.guestId);
      html += '<div class="mole-reveal">🐀 The Mole was <b>' + esc(m ? m.name : '?') + '</b> — mission ' + (view.moleResult.success ? 'accomplished' : 'failed') + '</div>';
    }
    html += leaderboard(false);
    var awards = view.ai && view.ai.awards;
    if (awards) {
      html += '<div class="awards">' + ranked().filter(function (g) { return awards[g.id]; }).map(function (g) {
        return '<div class="award">' + avatar(g, 'sm') + '<div><b>' + esc(awards[g.id].title) + '</b><small>' + esc(g.name) + '</small></div></div>';
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function renderStage() {
    switch (view.phase) {
      case 'setup': return '<div class="title-card"><div class="tc-icon">🎉</div><h1>' + esc(view.title) + '</h1><div class="tc-tag">The host is setting things up…</div></div>';
      case 'lobby': return renderLobby();
      case 'roles': return renderRoles();
      case 'game-intro': return renderGameIntro();
      case 'question': return renderQuestion(false);
      case 'reveal': return renderQuestion(true);
      case 'scores': return renderScores();
      case 'finale': return renderFinale();
      default: return '';
    }
  }

  function renderScoreboard() {
    var html = '<div class="scoreboard-screen">';
    if (view.phase === 'lobby' || view.phase === 'setup') return renderLobby();
    if (view.phase === 'finale') return renderFinale();
    if (view.game) html += '<div class="kicker">' + esc(view.game.icon + ' ' + view.game.title) + (view.round ? ' · Round ' + view.round.number + '/' + view.round.total : '') + '</div>';
    if (view.phase === 'question') html += '<div class="sb-lock"><h2>Locked in</h2>' + lockedIn() + timerHtml() + '</div>';
    if (view.phase === 'reveal' && view.result) html += deltaRow(view.result);
    html += leaderboard(true) + '</div>';
    return html;
  }

  function renderSpotlight() {
    var subject = null;
    if (view.phase === 'roles') subject = guestById(view.roleRevealGuestId);
    else if (view.round && view.round.subjectId) subject = guestById(view.round.subjectId);
    var html = '<div class="spotlight-screen">';
    if (view.phase === 'question' && !subject) {
      var s = secondsLeft();
      html += '<div class="kicker">Time left</div><div class="mega ' + (s != null && s <= 5 ? 'hurry' : '') + '" id="timer">' + (s == null ? '' : s) + '</div>';
      html += '<div class="spot-q">' + esc(view.round.body || view.round.headline) + '</div>';
    } else if (subject) {
      html += '<div class="kicker">' + (view.phase === 'question' ? 'In the spotlight' : view.phase === 'roles' ? 'Now revealing' : 'It was…') + '</div>';
      html += '<div class="spot-guest">' + avatar(subject, 'xxl') + '<h1>' + esc(subject.name) + '</h1>' +
        (subject.role ? '<div class="spot-role" style="color:' + esc(subject.role.color) + '">' + esc(subject.role.emoji + ' ' + subject.role.title) + '</div>' : '') + '</div>';
      if (view.phase === 'question') html += timerHtml();
    } else if (view.phase === 'finale') {
      return renderFinale();
    } else if (view.phase === 'lobby') {
      html += '<div class="kicker">Party guests</div><div class="spot-wall">' + view.guests.map(function (g) { return avatar(g, 'xl'); }).join('') + '</div>';
    } else {
      html += renderGameIntro() || '<div class="tc-icon">🎉</div>';
    }
    return html + '</div>';
  }

  function renderStrip() {
    if (screen !== 'stage' || (view.tvs || []).length > 1 || ['lobby', 'setup', 'scores', 'finale'].indexOf(view.phase) >= 0) {
      strip.innerHTML = '';
      strip.style.display = 'none';
      return;
    }
    strip.style.display = '';
    strip.innerHTML = ranked().map(function (g) {
      return '<span class="strip-item">' + avatar(g, 'sm') + esc(g.name) + ' <b>' + g.score + '</b></span>';
    }).join('');
  }

  function render() {
    if (!view) return;
    document.getElementById('title').textContent = view.title;
    document.getElementById('phaseLabel').textContent = PHASES[view.phase] || '';
    if (view.personality) {
      face.setColor(view.personality.faceColor);
      document.documentElement.style.setProperty('--host', view.personality.faceColor);
    }
    var phaseKey = view.phase + ':' + (view.game ? view.game.id : '') + ':' + (view.round ? view.round.number : '');
    if (phaseKey !== lastPhaseKey && (view.phase === 'reveal' || view.phase === 'game-intro' || view.phase === 'finale')) flash();
    lastPhaseKey = phaseKey;

    var html = screen === 'scoreboard' ? renderScoreboard() : screen === 'spotlight' ? renderSpotlight() : renderStage();
    if (html !== lastHtml) {
      content.innerHTML = html;
      lastHtml = html;
    }
    document.getElementById('hostCol').style.display = screen === 'stage' ? '' : 'none';
    renderStrip();
    speak(view.narration);
  }

  function onView(v) {
    if (!v || v.error) return;
    clockOffset = (v.serverNow || Date.now()) - Date.now();
    view = v;
    render();
  }

  // Live updates: SSE, with polling for TV browsers without EventSource.
  var qs = 'role=tv&screen=' + encodeURIComponent(screen);
  function poll() {
    fetch('/api/view?' + qs).then(function (r) { return r.json(); }).then(onView).catch(function () {}).then(function () {
      setTimeout(poll, 1000);
    });
  }
  if (window.EventSource) {
    var es = new EventSource('/events?' + qs);
    es.onmessage = function (e) { try { onView(JSON.parse(e.data)); } catch (err) {} };
  } else {
    poll();
  }

  // Countdown repaint without a full render.
  setInterval(function () {
    var t = document.getElementById('timer');
    var s = secondsLeft();
    if (t && s != null) {
      t.textContent = s;
      t.classList.toggle('hurry', s <= 5);
    }
  }, 250);
})();
