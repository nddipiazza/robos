/* RobOS Party Game — the AI host's animated face.
 *
 * A robot face drawn in SVG: blinking eyes that glance around, mood-driven
 * brows, and a mouth lip-synced to the narration. Lip sync follows the text:
 * the caption advances at the speech rate and vowels open the mouth wider than
 * consonants. When narration audio is playing in this page, the mouth follows
 * the audio's real playback position instead.
 *
 *   const face = createHostFace(containerEl);
 *   face.say({ id, text, mood, durationMs }, audioEl?);
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

  window.createHostFace = function (container) {
    var color = '#00bcd4';
    var svg = svgEl('svg', { viewBox: '0 0 400 400', class: 'host-face' });
    var defs = svgEl('defs', {});
    var glow = svgEl('filter', { id: 'faceGlow', x: '-30%', y: '-30%', width: '160%', height: '160%' });
    glow.appendChild(svgEl('feGaussianBlur', { stdDeviation: '6', result: 'b' }));
    var merge = svgEl('feMerge', {});
    merge.appendChild(svgEl('feMergeNode', { in: 'b' }));
    merge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    glow.appendChild(merge);
    defs.appendChild(glow);
    svg.appendChild(defs);

    var antenna = svgEl('line', { x1: 200, y1: 40, x2: 200, y2: 78, 'stroke-width': 8, 'stroke-linecap': 'round' });
    var bulb = svgEl('circle', { cx: 200, cy: 32, r: 13 });
    var head = svgEl('rect', { x: 50, y: 78, width: 300, height: 270, rx: 70, 'stroke-width': 8, fill: '#0b1220' });
    var screen = svgEl('rect', { x: 78, y: 106, width: 244, height: 214, rx: 50, fill: '#070b12' });
    var g = svgEl('g', { filter: 'url(#faceGlow)' });
    var browL = svgEl('line', { 'stroke-width': 9, 'stroke-linecap': 'round' });
    var browR = svgEl('line', { 'stroke-width': 9, 'stroke-linecap': 'round' });
    var eyeL = svgEl('ellipse', { cx: 150, cy: 180, rx: 22, ry: 26 });
    var eyeR = svgEl('ellipse', { cx: 250, cy: 180, rx: 22, ry: 26 });
    var pupilL = svgEl('circle', { r: 8, fill: '#070b12' });
    var pupilR = svgEl('circle', { r: 8, fill: '#070b12' });
    var mouth = svgEl('path', { 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    var cheekL = svgEl('circle', { cx: 112, cy: 248, r: 13, opacity: 0.25 });
    var cheekR = svgEl('circle', { cx: 288, cy: 248, r: 13, opacity: 0.25 });
    [browL, browR, eyeL, eyeR, pupilL, pupilR, mouth, cheekL, cheekR].forEach(function (n) { g.appendChild(n); });
    [antenna, bulb, head, screen, g].forEach(function (n) { svg.appendChild(n); });
    container.appendChild(svg);

    var mood = MOODS.happy;
    var speech = null; // { text, start, duration, audio }
    var mouthOpen = 0;
    var gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
    var blink = { until: 0, next: performance.now() + 2500 };
    var bob = 0;

    function paint() {
      [antenna, head].forEach(function (n) { n.setAttribute('stroke', color); });
      [bulb, eyeL, eyeR, cheekL, cheekR].forEach(function (n) { n.setAttribute('fill', color); });
      [browL, browR, mouth].forEach(function (n) { n.setAttribute('stroke', color); });
      mouth.setAttribute('fill', 'rgba(0,0,0,0.55)');
    }
    paint();

    function speakingPosition(now) {
      if (!speech) return -1;
      var a = speech.audio;
      if (a && !a.paused && a.duration > 0 && isFinite(a.duration)) return a.currentTime / a.duration;
      var t = (now - speech.start) / speech.duration;
      return t >= 0 && t <= 1 ? t : -1;
    }

    function frame(now) {
      // Gaze: small saccades every 1–3 s.
      if (now > gaze.next) {
        gaze.tx = (Math.random() - 0.5) * 14;
        gaze.ty = (Math.random() - 0.5) * 10;
        gaze.next = now + 1000 + Math.random() * 2000;
      }
      gaze.x += (gaze.tx - gaze.x) * 0.15;
      gaze.y += (gaze.ty - gaze.y) * 0.15;
      // Blink.
      if (now > blink.next) {
        blink.until = now + 140;
        blink.next = now + 2200 + Math.random() * 3500;
      }
      var lid = now < blink.until ? 0.08 : mood.eye;

      // Lip sync.
      var pos = speakingPosition(now);
      var target = 0;
      if (pos >= 0) {
        var idx = Math.floor(pos * speech.text.length);
        var wobble = 0.85 + 0.15 * Math.sin(now / 45);
        target = openness(speech.text.charAt(idx)) * wobble;
        if (speech.onProgress) speech.onProgress(pos);
      } else if (speech && speech.onProgress) {
        speech.onProgress(1);
        speech.onProgress = null;
      }
      mouthOpen += (target - mouthOpen) * 0.35;
      bob = pos >= 0 ? Math.sin(now / 160) * 3 : Math.sin(now / 900) * 2;

      var by = 138 + mood.brow + bob;
      browL.setAttribute('x1', 124); browL.setAttribute('y1', by + mood.browTilt);
      browL.setAttribute('x2', 176); browL.setAttribute('y2', by - mood.browTilt);
      browR.setAttribute('x1', 224); browR.setAttribute('y1', by - mood.browTilt);
      browR.setAttribute('x2', 276); browR.setAttribute('y2', by + mood.browTilt);

      var ey = 180 + bob;
      eyeL.setAttribute('cy', ey); eyeR.setAttribute('cy', ey);
      eyeL.setAttribute('ry', 26 * lid); eyeR.setAttribute('ry', 26 * lid);
      pupilL.setAttribute('cx', 150 + gaze.x); pupilL.setAttribute('cy', ey + gaze.y * lid);
      pupilR.setAttribute('cx', 250 + gaze.x); pupilR.setAttribute('cy', ey + gaze.y * lid);
      pupilL.setAttribute('r', 8 * Math.min(1, lid)); pupilR.setAttribute('r', 8 * Math.min(1, lid));

      var my = 262 + bob;
      var w = 58 - mouthOpen * 10;
      var curve = mood.mouthCurve * (1 - mouthOpen * 0.6);
      var open = 4 + mouthOpen * 46;
      mouth.setAttribute('d',
        'M ' + (200 - w) + ' ' + my +
        ' Q 200 ' + (my + curve) + ' ' + (200 + w) + ' ' + my +
        ' Q 200 ' + (my + curve + open) + ' ' + (200 - w) + ' ' + my + ' Z');
      bulb.setAttribute('opacity', pos >= 0 ? 0.6 + 0.4 * Math.abs(Math.sin(now / 120)) : 0.85);

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      setColor: function (c) { if (c && c !== color) { color = c; paint(); } },
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
    };
  };
})();
