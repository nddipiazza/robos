/* RobOS Personality — the face display.
 *
 * Follows the app's live event stream (/events) and draws the personality:
 * an animated face whose mouth opens with the voice, eyes that blink and
 * glance around (and look up while it thinks), captions of what it says,
 * the words its ears are hearing, and a picture-in-picture of what its eyes
 * see. Written in plain ES5 so TV browsers can run it.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var token = params.get('t') || '';
  var mode = params.get('mode') || 'window';
  if (mode === 'embed') document.body.classList.add('embed');

  var MOODS = {
    happy: { brow: -4, tilt: 0, eye: 1, curve: 10 },
    excited: { brow: -10, tilt: 0, eye: 1.15, curve: 14 },
    curious: { brow: -6, tilt: 8, eye: 1, curve: 4 },
    thinking: { brow: -2, tilt: 6, eye: 0.85, curve: 2 },
    surprised: { brow: -16, tilt: 0, eye: 1.3, curve: -2 },
    sad: { brow: 4, tilt: -8, eye: 0.8, curve: -8 },
    calm: { brow: 0, tilt: 0, eye: 0.9, curve: 6 },
  };
  var ACTIVITY_LABEL = {
    idle: '', listening: 'listening', hearing: 'hearing you', thinking: 'thinking', speaking: 'speaking',
  };

  var els = {
    stage: document.getElementById('stage'),
    face: document.getElementById('face'),
    name: document.getElementById('name'),
    activity: document.getElementById('activity'),
    pip: document.getElementById('pip'),
    pipImg: document.getElementById('pip-img'),
    pipLabel: document.getElementById('pip-label'),
    heard: document.getElementById('heard'),
    caption: document.getElementById('caption'),
    offline: document.getElementById('offline'),
  };

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function glow(id, blur) {
    var f = svgEl('filter', { id: id, x: '-30%', y: '-30%', width: '160%', height: '160%' });
    f.appendChild(svgEl('feGaussianBlur', { stdDeviation: String(blur), result: 'b' }));
    var m = svgEl('feMerge', {});
    m.appendChild(svgEl('feMergeNode', { in: 'b' }));
    m.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    f.appendChild(m);
    return f;
  }

  function mouthPath(cx, my, w, curve, open) {
    return 'M ' + (cx - w) + ' ' + my + ' Q ' + cx + ' ' + (my + curve) + ' ' + (cx + w) + ' ' + my +
      ' Q ' + cx + ' ' + (my + curve + open) + ' ' + (cx - w) + ' ' + my + ' Z';
  }

  // ── Robot: a glowing screen face ───────────────────────────────────────
  function buildRobot(svg) {
    var defs = svgEl('defs', {});
    defs.appendChild(glow('pglow', 6));
    svg.appendChild(defs);
    var antenna = svgEl('line', { x1: 200, y1: 40, x2: 200, y2: 78, 'stroke-width': 8, 'stroke-linecap': 'round' });
    var bulb = svgEl('circle', { cx: 200, cy: 32, r: 13 });
    var earL = svgEl('rect', { x: 26, y: 170, width: 26, height: 70, rx: 10 });
    var earR = svgEl('rect', { x: 348, y: 170, width: 26, height: 70, rx: 10 });
    var head = svgEl('rect', { x: 50, y: 78, width: 300, height: 270, rx: 70, 'stroke-width': 8, fill: '#0b1220' });
    var screen = svgEl('rect', { x: 78, y: 106, width: 244, height: 214, rx: 50, fill: '#05080e' });
    var g = svgEl('g', { filter: 'url(#pglow)' });
    var browL = svgEl('line', { 'stroke-width': 9, 'stroke-linecap': 'round' });
    var browR = svgEl('line', { 'stroke-width': 9, 'stroke-linecap': 'round' });
    var eyeL = svgEl('ellipse', { cx: 150, cy: 180, rx: 22, ry: 26 });
    var eyeR = svgEl('ellipse', { cx: 250, cy: 180, rx: 22, ry: 26 });
    var pupilL = svgEl('circle', { r: 8, fill: '#05080e' });
    var pupilR = svgEl('circle', { r: 8, fill: '#05080e' });
    var mouth = svgEl('path', { 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'rgba(0,0,0,0.55)' });
    var cheekL = svgEl('circle', { cx: 112, cy: 248, r: 13, opacity: 0.25 });
    var cheekR = svgEl('circle', { cx: 288, cy: 248, r: 13, opacity: 0.25 });
    [browL, browR, eyeL, eyeR, pupilL, pupilR, mouth, cheekL, cheekR].forEach(function (n) { g.appendChild(n); });
    [antenna, bulb, earL, earR, head, screen, g].forEach(function (n) { svg.appendChild(n); });
    return {
      paint: function (c) {
        [antenna, head].forEach(function (n) { n.setAttribute('stroke', c); });
        [bulb, eyeL, eyeR, cheekL, cheekR, earL, earR].forEach(function (n) { n.setAttribute('fill', c); });
        [browL, browR, mouth].forEach(function (n) { n.setAttribute('stroke', c); });
      },
      render: function (p) {
        var m = p.mood;
        var by = 138 + m.brow + p.bob;
        browL.setAttribute('x1', 124); browL.setAttribute('y1', by + m.tilt);
        browL.setAttribute('x2', 176); browL.setAttribute('y2', by - m.tilt);
        browR.setAttribute('x1', 224); browR.setAttribute('y1', by - m.tilt);
        browR.setAttribute('x2', 276); browR.setAttribute('y2', by + m.tilt);
        var ey = 180 + p.bob;
        eyeL.setAttribute('cy', ey); eyeR.setAttribute('cy', ey);
        eyeL.setAttribute('ry', 26 * p.lid); eyeR.setAttribute('ry', 26 * p.lid);
        pupilL.setAttribute('cx', 150 + p.gazeX); pupilL.setAttribute('cy', ey + p.gazeY * p.lid);
        pupilR.setAttribute('cx', 250 + p.gazeX); pupilR.setAttribute('cy', ey + p.gazeY * p.lid);
        pupilL.setAttribute('r', 8 * Math.min(1, p.lid)); pupilR.setAttribute('r', 8 * Math.min(1, p.lid));
        var w = 58 - p.mouth * 10;
        mouth.setAttribute('d', mouthPath(200, 262 + p.bob, w, m.curve * (1 - p.mouth * 0.6), 4 + p.mouth * 46));
        bulb.setAttribute('opacity', p.speaking ? 0.6 + 0.4 * Math.abs(Math.sin(p.now / 120)) : (p.thinking ? 0.4 + 0.6 * Math.abs(Math.sin(p.now / 300)) : 0.85));
        var earGlow = p.listening ? 0.55 + 0.45 * Math.min(1, p.hearLevel * 8) : 0.35;
        earL.setAttribute('opacity', earGlow); earR.setAttribute('opacity', earGlow);
      },
    };
  }

  // ── Buddy: a round, friendly cartoon face ──────────────────────────────
  function buildBuddy(svg) {
    var defs = svgEl('defs', {});
    var grad = svgEl('radialGradient', { id: 'pskin', cx: '45%', cy: '38%', r: '65%' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#ffe2c4' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#e9b98f' }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    var halo = svgEl('circle', { cx: 200, cy: 210, r: 176, fill: 'none', 'stroke-width': 6, opacity: 0.55 });
    var head = svgEl('circle', { cx: 200, cy: 210, r: 160, fill: 'url(#pskin)' });
    var hair = svgEl('path', { d: 'M54 170 C60 70 150 36 214 46 C300 58 350 110 346 176 C318 120 262 96 200 104 C140 110 92 132 54 170 Z' });
    var g = svgEl('g', {});
    var browL = svgEl('path', { fill: 'none', stroke: '#3b2a20', 'stroke-width': 8, 'stroke-linecap': 'round' });
    var browR = svgEl('path', { fill: 'none', stroke: '#3b2a20', 'stroke-width': 8, 'stroke-linecap': 'round' });
    var eyeL = svgEl('ellipse', { cx: 148, cy: 196, rx: 17, ry: 22, fill: '#1d1712' });
    var eyeR = svgEl('ellipse', { cx: 252, cy: 196, rx: 17, ry: 22, fill: '#1d1712' });
    var shineL = svgEl('circle', { r: 5, fill: '#fff' });
    var shineR = svgEl('circle', { r: 5, fill: '#fff' });
    var cheekL = svgEl('ellipse', { cx: 112, cy: 254, rx: 24, ry: 14, fill: '#f08a7e', opacity: 0.45 });
    var cheekR = svgEl('ellipse', { cx: 288, cy: 254, rx: 24, ry: 14, fill: '#f08a7e', opacity: 0.45 });
    var nose = svgEl('path', { d: 'M200 214 Q212 240 196 246', fill: 'none', stroke: '#c98d66', 'stroke-width': 5, 'stroke-linecap': 'round' });
    var mouth = svgEl('path', { fill: '#5a1f1f', stroke: '#3b2a20', 'stroke-width': 5, 'stroke-linejoin': 'round' });
    [browL, browR, cheekL, cheekR, eyeL, eyeR, shineL, shineR, nose, mouth].forEach(function (n) { g.appendChild(n); });
    var all = svgEl('g', {});
    [halo, head, hair, g].forEach(function (n) { all.appendChild(n); });
    svg.appendChild(all);
    return {
      paint: function (c) {
        halo.setAttribute('stroke', c);
        hair.setAttribute('fill', c);
      },
      render: function (p) {
        var m = p.mood;
        all.setAttribute('transform', 'translate(0 ' + p.bob.toFixed(2) + ') rotate(' + (p.tilt * 2).toFixed(2) + ' 200 210)');
        var by = 156 + m.brow;
        browL.setAttribute('d', 'M120 ' + (by + 6 + m.tilt) + ' Q148 ' + (by - 12) + ' 176 ' + (by + 4 - m.tilt));
        browR.setAttribute('d', 'M224 ' + (by + 4 - m.tilt) + ' Q252 ' + (by - 12) + ' 280 ' + (by + 6 + m.tilt));
        eyeL.setAttribute('ry', 22 * p.lid); eyeR.setAttribute('ry', 22 * p.lid);
        eyeL.setAttribute('cx', 148 + p.gazeX * 0.4); eyeR.setAttribute('cx', 252 + p.gazeX * 0.4);
        eyeL.setAttribute('cy', 196 + p.gazeY * 0.3); eyeR.setAttribute('cy', 196 + p.gazeY * 0.3);
        var shine = p.lid > 0.4 ? 1 : 0;
        shineL.setAttribute('opacity', shine); shineR.setAttribute('opacity', shine);
        shineL.setAttribute('cx', 153 + p.gazeX * 0.6); shineL.setAttribute('cy', 188 + p.gazeY * 0.4);
        shineR.setAttribute('cx', 257 + p.gazeX * 0.6); shineR.setAttribute('cy', 188 + p.gazeY * 0.4);
        var w = 44 - p.mouth * 8;
        mouth.setAttribute('d', mouthPath(200, 282, w, (m.curve + 4) * (1 - p.mouth * 0.6), 3 + p.mouth * 40));
      },
    };
  }

  var STYLES = { robot: buildRobot, buddy: buildBuddy };

  // ── State ──────────────────────────────────────────────────────────────
  var look = null;
  var lookKey = '';
  var mood = MOODS.happy;
  var activity = 'idle';
  var mouthTarget = 0;
  var mouthTargetAt = 0;
  var mouthOpen = 0;
  var hearLevel = 0;
  var gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
  var blink = { until: 0, next: performance.now() + 2500 };
  var captionsOn = true;
  var pipOn = true;
  var sight = null;
  var heardTimer = null;
  var captionTimer = null;

  function setLook(style, color) {
    var key = style + color;
    if (key === lookKey) return;
    lookKey = key;
    var svg = svgEl('svg', { viewBox: '0 0 400 400' });
    els.face.innerHTML = '';
    els.face.appendChild(svg);
    look = (STYLES[style] || buildRobot)(svg);
    look.paint(color);
    document.documentElement.style.setProperty('--accent', color);
  }

  function setActivity(a) {
    activity = a || 'idle';
    els.stage.setAttribute('data-activity', activity);
    els.activity.textContent = ACTIVITY_LABEL[activity] || '';
  }

  function showCaption(c) {
    clearTimeout(captionTimer);
    if (!captionsOn || !c || !c.text) { els.caption.classList.add('hidden'); return; }
    var words = c.text.split(/\s+/).filter(Boolean);
    var shown = c.words == null ? words.length : c.words;
    els.caption.innerHTML = '';
    els.caption.appendChild(document.createTextNode(words.slice(0, shown).join(' ')));
    if (shown < words.length) {
      var later = document.createElement('span');
      later.className = 'later';
      later.textContent = (shown ? ' ' : '') + words.slice(shown).join(' ');
      els.caption.appendChild(later);
    }
    els.caption.classList.remove('hidden');
    if (c.done) captionTimer = setTimeout(function () { els.caption.classList.add('hidden'); }, 6000);
  }

  function showHeard(h) {
    clearTimeout(heardTimer);
    if (!h || !h.text) { els.heard.classList.add('hidden'); return; }
    els.heard.textContent = h.text;
    els.heard.classList.toggle('final', Boolean(h.final));
    els.heard.classList.remove('hidden');
    if (h.final) heardTimer = setTimeout(function () { els.heard.classList.add('hidden'); }, 5000);
  }

  function showSight(s) {
    sight = s && s.at ? s : null;
    if (!pipOn || !sight) { els.pip.classList.add('hidden'); return; }
    els.pipLabel.textContent = 'Eyes: ' + (sight.cameraName || 'camera');
    els.pipImg.src = '/sight.jpg?t=' + encodeURIComponent(token) + '&n=' + sight.at;
    els.pip.classList.remove('hidden');
  }

  function applyState(s) {
    els.name.textContent = s.name || 'Personality';
    document.title = (s.name || 'Personality') + ' · RobOS Personality';
    setLook(s.face && s.face.style || 'robot', s.face && s.face.color || '#00bcd4');
    captionsOn = s.captions !== false;
    pipOn = s.pip !== false;
    mood = MOODS[s.mood] || MOODS.happy;
    setActivity(s.activity);
    showCaption(s.caption);
    showHeard(s.heard);
    showSight(s.sight);
  }

  function handle(e) {
    switch (e.type) {
      case 'state': applyState(e); break;
      case 'mouth': mouthTarget = Math.max(0, Math.min(1, Number(e.v) || 0)); mouthTargetAt = performance.now(); break;
      case 'ear-level': hearLevel = Number(e.v) || 0; break;
      case 'activity': setActivity(e.activity); break;
      case 'mood': mood = MOODS[e.mood] || MOODS.happy; break;
      case 'caption': showCaption(e); break;
      case 'heard': showHeard(e); break;
      case 'sight': showSight(e); break;
      default: break;
    }
  }

  // ── Animation ──────────────────────────────────────────────────────────
  function frame(now) {
    if (activity === 'thinking') {
      gaze.tx = 10; gaze.ty = -12;
    } else if (now > gaze.next) {
      gaze.tx = (Math.random() - 0.5) * 14;
      gaze.ty = (Math.random() - 0.5) * 10;
      gaze.next = now + 1000 + Math.random() * 2000;
    }
    gaze.x += (gaze.tx - gaze.x) * 0.12;
    gaze.y += (gaze.ty - gaze.y) * 0.12;
    if (now > blink.next) {
      blink.until = now + 140;
      blink.next = now + 2200 + Math.random() * 3500;
    }
    // A missed update must not leave the mouth hanging open.
    var target = now - mouthTargetAt > 400 ? 0 : mouthTarget;
    mouthOpen += (target - mouthOpen) * 0.45;
    var speaking = activity === 'speaking';
    var lid = now < blink.until ? 0.08 : mood.eye * (activity === 'listening' || activity === 'hearing' ? 1.08 : 1);
    if (look) {
      look.render({
        now: now,
        mood: mood,
        gazeX: gaze.x,
        gazeY: gaze.y,
        lid: lid,
        mouth: mouthOpen,
        speaking: speaking,
        thinking: activity === 'thinking',
        listening: activity === 'listening' || activity === 'hearing',
        hearLevel: hearLevel,
        bob: speaking ? Math.sin(now / 160) * 3 : Math.sin(now / 900) * 2,
        tilt: speaking ? Math.sin(now / 700) * 0.8 : Math.sin(now / 2300) * 0.5,
      });
    }
    requestAnimationFrame(frame);
  }

  setLook('robot', '#00bcd4');
  requestAnimationFrame(frame);

  // ── Live stream ────────────────────────────────────────────────────────
  function connect() {
    var es = new EventSource('/events?t=' + encodeURIComponent(token));
    es.onopen = function () { els.offline.classList.add('hidden'); };
    es.onmessage = function (m) {
      try { handle(JSON.parse(m.data)); } catch (err) { /* ignore a bad event */ }
    };
    es.onerror = function () { els.offline.classList.remove('hidden'); };
  }
  connect();

  // Tests read the face's current drawing state from here.
  window.__personalityFace = function () {
    return { activity: activity, mouthOpen: mouthOpen, mouthTarget: mouthTarget, caption: els.caption.textContent, heard: els.heard.textContent, pip: !els.pip.classList.contains('hidden'), style: lookKey };
  };
})();
