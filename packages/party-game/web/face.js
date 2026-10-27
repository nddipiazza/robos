/* RobOS Party Game — the AI host's animated face.
 *
 * Two looks share one animation core: blinking eyes that glance around,
 * mood-driven brows, a gentle bob, and a mouth lip-synced to the narration.
 * Lip sync follows the text: the caption advances at the speech rate and
 * vowels open the mouth wider than consonants. When narration audio is playing
 * in this page, the mouth follows the audio's real playback position instead.
 *
 *   mask   (default) a hooded masked figure: ivory mask, arched brows, rosy
 *          cheeks, curled mustache and goatee, eyes glowing in the host color
 *   robot  a friendly robot screen face
 *
 *   const face = createHostFace(containerEl, { style: 'mask' });
 *   face.say({ id, text, mood, durationMs }, audioEl?, onProgress?);
 *   face.setColor('#00bcd4');
 */
(function () {
  'use strict';

  var MOODS = {
    happy: { brow: -4, browTilt: 0, eye: 1, mouthCurve: 10 },
    excited: { brow: -10, browTilt: 0, eye: 1.15, mouthCurve: 14 },
    curious: { brow: -6, browTilt: 8, eye: 1, mouthCurve: 4 },
    scheming: { brow: 2, browTilt: -10, eye: 0.6, mouthCurve: 8 },
    shocked: { brow: -16, browTilt: 0, eye: 1.3, mouthCurve: -2 },
  };

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function openness(ch) {
    if (!ch) return 0;
    var c = ch.toLowerCase();
    if ('aeo'.indexOf(c) >= 0) return 1;
    if ('iuy'.indexOf(c) >= 0) return 0.65;
    if ('mbp'.indexOf(c) >= 0) return 0.05;
    if (/[a-z0-9]/.test(c)) return 0.35;
    return 0;
  }

  function glowFilter(id, blur) {
    var f = svgEl('filter', { id: id, x: '-30%', y: '-30%', width: '160%', height: '160%' });
    f.appendChild(svgEl('feGaussianBlur', { stdDeviation: String(blur), result: 'b' }));
    var merge = svgEl('feMerge', {});
    merge.appendChild(svgEl('feMergeNode', { in: 'b' }));
    merge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    f.appendChild(merge);
    return f;
  }

  // ── Mask: a hooded figure in an ivory mask ──────────────────────────────
  function buildMask(svg, uid) {
    var defs = svgEl('defs', {});
    defs.appendChild(glowFilter(uid + 'glow', 5));
    var grad = svgEl('radialGradient', { id: uid + 'ivory', cx: '50%', cy: '42%', r: '62%' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#fbf7ee' }));
    grad.appendChild(svgEl('stop', { offset: '70%', 'stop-color': '#efe6d3' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#cfc2a8' }));
    defs.appendChild(grad);
    var hoodGrad = svgEl('linearGradient', { id: uid + 'hood', x1: '0', y1: '0', x2: '0', y2: '1' });
    hoodGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#1a2030' }));
    hoodGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#05070c' }));
    defs.appendChild(hoodGrad);
    svg.appendChild(defs);

    var hood = svgEl('path', {
      d: 'M40 400 C30 250 70 40 200 26 C330 40 370 250 360 400 Z',
      fill: 'url(#' + uid + 'hood)', 'stroke-width': 5,
    });
    var hoodInner = svgEl('path', {
      d: 'M78 400 C70 260 100 78 200 66 C300 78 330 260 322 400 Z',
      fill: '#03050a', opacity: 0.9,
    });
    var head = svgEl('g', {});
    var mask = svgEl('path', {
      d: 'M200 78 C282 78 314 146 311 206 C308 280 268 342 200 368 C132 342 92 280 89 206 C86 146 118 78 200 78 Z',
      fill: 'url(#' + uid + 'ivory)', stroke: '#b9ab8f', 'stroke-width': 2,
    });
    var cheekL = svgEl('ellipse', { cx: 132, cy: 236, rx: 26, ry: 15, fill: '#e2867f', opacity: 0.45 });
    var cheekR = svgEl('ellipse', { cx: 268, cy: 236, rx: 26, ry: 15, fill: '#e2867f', opacity: 0.45 });
    var nose = svgEl('path', { d: 'M200 180 Q208 222 194 240', fill: 'none', stroke: '#cdbfa3', 'stroke-width': 3, 'stroke-linecap': 'round' });
    var browL = svgEl('path', { fill: 'none', stroke: '#15151a', 'stroke-width': 6, 'stroke-linecap': 'round' });
    var browR = svgEl('path', { fill: 'none', stroke: '#15151a', 'stroke-width': 6, 'stroke-linecap': 'round' });
    var eyeL = svgEl('path', { fill: '#0a0c12' });
    var eyeR = svgEl('path', { fill: '#0a0c12' });
    var glints = svgEl('g', { filter: 'url(#' + uid + 'glow)' });
    var glintL = svgEl('circle', { r: 5 });
    var glintR = svgEl('circle', { r: 5 });
    glints.appendChild(glintL);
    glints.appendChild(glintR);
    var mouth = svgEl('path', { fill: '#2a1212', stroke: '#15151a', 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    var stache = svgEl('path', {
      d: 'M200 262 C186 251 162 249 142 257 C128 263 117 259 114 247 C110 262 124 276 145 273 C166 270 184 266 200 270 ' +
        'C216 266 234 270 255 273 C276 276 290 262 286 247 C283 259 272 263 258 257 C238 249 214 251 200 262 Z',
      fill: '#15151a',
    });
    var goatee = svgEl('path', { fill: '#15151a' });
    [cheekL, cheekR, nose, browL, browR, eyeL, eyeR, glints, mouth, stache, goatee].forEach(function (n) { head.appendChild(n); });
    var maskGroup = svgEl('g', {});
    maskGroup.appendChild(mask);
    maskGroup.appendChild(head);
    [hood, hoodInner, maskGroup].forEach(function (n) { svg.appendChild(n); });

    function almond(cx, cy, lid) {
      var h = 13 * lid;
      return 'M' + (cx - 30) + ' ' + cy + ' Q' + cx + ' ' + (cy - h * 1.6) + ' ' + (cx + 30) + ' ' + cy +
        ' Q' + cx + ' ' + (cy + h) + ' ' + (cx - 30) + ' ' + cy + ' Z';
    }

    return {
      paint: function (color) {
        hood.setAttribute('stroke', color);
        glintL.setAttribute('fill', color);
        glintR.setAttribute('fill', color);
      },
      render: function (p) {
        maskGroup.setAttribute('transform', 'translate(0 ' + p.bob.toFixed(2) + ') rotate(' + (p.tilt * 2).toFixed(2) + ' 200 220)');
        var by = 150 + p.mood.brow;
        var t = p.mood.browTilt;
        // Arched brows: the outer ends lift with the mood's tilt.
        browL.setAttribute('d', 'M116 ' + (by + 8 - t) + ' Q148 ' + (by - 22) + ' 182 ' + (by + 4 + t));
        browR.setAttribute('d', 'M218 ' + (by + 4 + t) + ' Q252 ' + (by - 22) + ' 284 ' + (by + 8 - t));
        var lid = Math.max(0.08, p.lid);
        eyeL.setAttribute('d', almond(150, 184, lid));
        eyeR.setAttribute('d', almond(250, 184, lid));
        glintL.setAttribute('cx', 150 + p.gazeX);
        glintR.setAttribute('cx', 250 + p.gazeX);
        glintL.setAttribute('cy', 182 + p.gazeY * 0.5 * lid);
        glintR.setAttribute('cy', 182 + p.gazeY * 0.5 * lid);
        glintL.setAttribute('r', 5.5 * Math.min(1, lid) * (p.speaking ? 1.15 : 1));
        glintR.setAttribute('r', 5.5 * Math.min(1, lid) * (p.speaking ? 1.15 : 1));
        var my = 286;
        var w = 30 - p.mouth * 6;
        var curve = (p.mood.mouthCurve + 2) * (1 - p.mouth * 0.6);
        var open = 3 + p.mouth * 30;
        // The famous smirk: the right corner sits a little higher.
        mouth.setAttribute('d',
          'M' + (200 - w) + ' ' + (my + 2) + ' Q200 ' + (my + curve) + ' ' + (200 + w) + ' ' + (my - 4) +
          ' Q200 ' + (my + curve + open) + ' ' + (200 - w) + ' ' + (my + 2) + ' Z');
        var gy = my + 10 + open * 0.55;
        goatee.setAttribute('d', 'M194 ' + gy + ' Q200 ' + (gy - 3) + ' 206 ' + gy + ' L201 ' + (gy + 46) + ' Z');
      },
    };
  }

  // ── Robot: a friendly screen face ───────────────────────────────────────
  function buildRobot(svg, uid) {
    var defs = svgEl('defs', {});
    defs.appendChild(glowFilter(uid + 'glow', 6));
    svg.appendChild(defs);
    var antenna = svgEl('line', { x1: 200, y1: 40, x2: 200, y2: 78, 'stroke-width': 8, 'stroke-linecap': 'round' });
    var bulb = svgEl('circle', { cx: 200, cy: 32, r: 13 });
    var head = svgEl('rect', { x: 50, y: 78, width: 300, height: 270, rx: 70, 'stroke-width': 8, fill: '#0b1220' });
    var screen = svgEl('rect', { x: 78, y: 106, width: 244, height: 214, rx: 50, fill: '#070b12' });
    var g = svgEl('g', { filter: 'url(#' + uid + 'glow)' });
    var browL = svgEl('line', { 'stroke-width': 9, 'stroke-linecap': 'round' });
    var browR = svgEl('line', { 'stroke-width': 9, 'stroke-linecap': 'round' });
    var eyeL = svgEl('ellipse', { cx: 150, cy: 180, rx: 22, ry: 26 });
    var eyeR = svgEl('ellipse', { cx: 250, cy: 180, rx: 22, ry: 26 });
    var pupilL = svgEl('circle', { r: 8, fill: '#070b12' });
    var pupilR = svgEl('circle', { r: 8, fill: '#070b12' });
    var mouth = svgEl('path', { 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'rgba(0,0,0,0.55)' });
    var cheekL = svgEl('circle', { cx: 112, cy: 248, r: 13, opacity: 0.25 });
    var cheekR = svgEl('circle', { cx: 288, cy: 248, r: 13, opacity: 0.25 });
    [browL, browR, eyeL, eyeR, pupilL, pupilR, mouth, cheekL, cheekR].forEach(function (n) { g.appendChild(n); });
    [antenna, bulb, head, screen, g].forEach(function (n) { svg.appendChild(n); });

    return {
      paint: function (color) {
        [antenna, head].forEach(function (n) { n.setAttribute('stroke', color); });
        [bulb, eyeL, eyeR, cheekL, cheekR].forEach(function (n) { n.setAttribute('fill', color); });
        [browL, browR, mouth].forEach(function (n) { n.setAttribute('stroke', color); });
      },
      render: function (p) {
        var m = p.mood;
        var by = 138 + m.brow + p.bob;
        browL.setAttribute('x1', 124); browL.setAttribute('y1', by + m.browTilt);
        browL.setAttribute('x2', 176); browL.setAttribute('y2', by - m.browTilt);
        browR.setAttribute('x1', 224); browR.setAttribute('y1', by - m.browTilt);
        browR.setAttribute('x2', 276); browR.setAttribute('y2', by + m.browTilt);
        var ey = 180 + p.bob;
        eyeL.setAttribute('cy', ey); eyeR.setAttribute('cy', ey);
        eyeL.setAttribute('ry', 26 * p.lid); eyeR.setAttribute('ry', 26 * p.lid);
        pupilL.setAttribute('cx', 150 + p.gazeX); pupilL.setAttribute('cy', ey + p.gazeY * p.lid);
        pupilR.setAttribute('cx', 250 + p.gazeX); pupilR.setAttribute('cy', ey + p.gazeY * p.lid);
        pupilL.setAttribute('r', 8 * Math.min(1, p.lid)); pupilR.setAttribute('r', 8 * Math.min(1, p.lid));
        var my = 262 + p.bob;
        var w = 58 - p.mouth * 10;
        var curve = m.mouthCurve * (1 - p.mouth * 0.6);
        var open = 4 + p.mouth * 46;
        mouth.setAttribute('d',
          'M ' + (200 - w) + ' ' + my + ' Q 200 ' + (my + curve) + ' ' + (200 + w) + ' ' + my +
          ' Q 200 ' + (my + curve + open) + ' ' + (200 - w) + ' ' + my + ' Z');
        bulb.setAttribute('opacity', p.speaking ? 0.6 + 0.4 * Math.abs(Math.sin(p.now / 120)) : 0.85);
      },
    };
  }

  var STYLES = { mask: buildMask, robot: buildRobot };
  var counter = 0;

  window.HOST_FACE_STYLES = Object.keys(STYLES);

  window.createHostFace = function (container, options) {
    var style = (options && STYLES[options.style]) ? options.style : 'mask';
    var color = (options && options.color) || '#00bcd4';
    var uid = 'hf' + (++counter) + '-';
    var svg = svgEl('svg', { viewBox: '0 0 400 400', class: 'host-face host-face-' + style });
    container.innerHTML = '';
    container.appendChild(svg);
    var look = STYLES[style](svg, uid);
    look.paint(color);

    var mood = MOODS.happy;
    var speech = null; // { text, start, duration, audio, onProgress }
    var mouthOpen = 0;
    var gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
    var blink = { until: 0, next: performance.now() + 2500 };
    var stopped = false;

    function speakingPosition(now) {
      if (!speech) return -1;
      var a = speech.audio;
      if (a && !a.paused && a.duration > 0 && isFinite(a.duration)) return a.currentTime / a.duration;
      var t = (now - speech.start) / speech.duration;
      return t >= 0 && t <= 1 ? t : -1;
    }

    function frame(now) {
      if (stopped) return;
      if (now > gaze.next) {
        gaze.tx = (Math.random() - 0.5) * 14;
        gaze.ty = (Math.random() - 0.5) * 10;
        gaze.next = now + 1000 + Math.random() * 2000;
      }
      gaze.x += (gaze.tx - gaze.x) * 0.15;
      gaze.y += (gaze.ty - gaze.y) * 0.15;
      if (now > blink.next) {
        blink.until = now + 140;
        blink.next = now + 2200 + Math.random() * 3500;
      }
      var pos = speakingPosition(now);
      var target = 0;
      if (pos >= 0) {
        var idx = Math.floor(pos * speech.text.length);
        target = openness(speech.text.charAt(idx)) * (0.85 + 0.15 * Math.sin(now / 45));
        if (speech.onProgress) speech.onProgress(pos);
      } else if (speech && speech.onProgress) {
        speech.onProgress(1);
        speech.onProgress = null;
      }
      mouthOpen += (target - mouthOpen) * 0.35;
      look.render({
        now: now,
        mood: mood,
        gazeX: gaze.x,
        gazeY: gaze.y,
        lid: now < blink.until ? 0.08 : mood.eye,
        mouth: mouthOpen,
        speaking: pos >= 0,
        bob: pos >= 0 ? Math.sin(now / 160) * 3 : Math.sin(now / 900) * 2,
        tilt: pos >= 0 ? Math.sin(now / 700) * 0.8 : Math.sin(now / 2300) * 0.5,
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      style: style,
      setColor: function (c) { if (c && c !== color) { color = c; look.paint(color); } },
      setMood: function (m) { mood = MOODS[m] || MOODS.happy; },
      say: function (narration, audio, onProgress) {
        if (!narration) return;
        this.setMood(narration.mood);
        speech = {
          text: narration.text || '',
          start: performance.now(),
          duration: narration.durationMs || 3000,
          audio: audio || null,
          onProgress: onProgress || null,
        };
      },
      isSpeaking: function () { return speakingPosition(performance.now()) >= 0; },
      destroy: function () { stopped = true; },
    };
  };
})();
