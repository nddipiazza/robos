/* RobOS Personality — logic shared by the app window and the tests.
 *
 *   UtteranceDetector  splits microphone audio into spoken utterances with an
 *                      energy detector that follows the room's noise floor
 *   mouthFromText      how open the mouth is at a point in a sentence, for when
 *                      no audio is playing (no voice engine installed)
 *   MouthFollower      maps the voice's loudness to mouth openness
 *   downsample         resamples microphone audio to the 16 kHz Whisper wants
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TalkCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SAMPLE_RATE = 16000;

  function rms(samples) {
    var sum = 0;
    for (var i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return samples.length ? Math.sqrt(sum / samples.length) : 0;
  }

  /**
   * Feed it 16 kHz mono chunks; it calls back:
   *   onStart()                      speech began
   *   onPartial(samples)             every partialMs while speaking (for live words)
   *   onEnd(samples)                 the finished utterance
   * sensitivity 0..1: higher hears quieter voices.
   */
  function UtteranceDetector(opts) {
    opts = opts || {};
    this.sampleRate = opts.sampleRate || SAMPLE_RATE;
    this.silenceMs = opts.silenceMs || 850;
    this.minSpeechMs = opts.minSpeechMs || 300;
    this.maxSpeechMs = opts.maxSpeechMs || 15000;
    this.partialMs = opts.partialMs || 1200;
    this.preRollMs = opts.preRollMs || 250;
    this.onStart = opts.onStart || function () {};
    this.onPartial = opts.onPartial || function () {};
    this.onEnd = opts.onEnd || function () {};
    this.setSensitivity(opts.sensitivity == null ? 0.5 : opts.sensitivity);
    this.reset();
  }

  UtteranceDetector.prototype.setSensitivity = function (s) {
    s = Math.min(1, Math.max(0, Number(s) || 0));
    // 0 → needs a loud voice (8x the noise floor), 1 → 2x the floor.
    this.ratio = 8 - s * 6;
    this.minLevel = 0.02 - s * 0.016;
  };

  UtteranceDetector.prototype.reset = function () {
    this.floor = 0.005;
    this.speaking = false;
    this.chunks = [];
    this.preRoll = [];
    this.speechSamples = 0;
    this.silentSamples = 0;
    this.sincePartial = 0;
    this.level = 0;
  };

  UtteranceDetector.prototype._concat = function () {
    var total = 0, i;
    for (i = 0; i < this.chunks.length; i++) total += this.chunks[i].length;
    var out = new Float32Array(total);
    var at = 0;
    for (i = 0; i < this.chunks.length; i++) { out.set(this.chunks[i], at); at += this.chunks[i].length; }
    return out;
  };

  UtteranceDetector.prototype.threshold = function () {
    return Math.max(this.minLevel, this.floor * this.ratio);
  };

  UtteranceDetector.prototype.push = function (chunk) {
    var level = rms(chunk);
    this.level = level;
    var ms = function (n) { return (n / this.sampleRate) * 1000; }.bind(this);
    var loud = level > this.threshold();

    if (!this.speaking) {
      // The noise floor follows quiet sound only, so speech does not raise it.
      if (!loud) this.floor = this.floor * 0.95 + level * 0.05;
      this.preRoll.push(chunk);
      var pre = 0;
      for (var i = 0; i < this.preRoll.length; i++) pre += this.preRoll[i].length;
      while (this.preRoll.length > 1 && ms(pre - this.preRoll[0].length) >= this.preRollMs) {
        pre -= this.preRoll[0].length;
        this.preRoll.shift();
      }
      if (loud) {
        this.speaking = true;
        this.chunks = this.preRoll.slice();
        this.preRoll = [];
        this.speechSamples = chunk.length;
        this.silentSamples = 0;
        this.sincePartial = 0;
        this.onStart();
      }
      return;
    }

    this.chunks.push(chunk);
    this.speechSamples += chunk.length;
    this.sincePartial += chunk.length;
    this.silentSamples = loud ? 0 : this.silentSamples + chunk.length;

    if (ms(this.silentSamples) >= this.silenceMs || ms(this.speechSamples) >= this.maxSpeechMs) {
      var all = this._concat();
      var spoken = this.speechSamples - this.silentSamples;
      this.speaking = false;
      this.chunks = [];
      this.preRoll = [];
      if (ms(spoken) >= this.minSpeechMs) this.onEnd(all);
      return;
    }
    if (ms(this.sincePartial) >= this.partialMs) {
      this.sincePartial = 0;
      this.onPartial(this._concat());
    }
  };

  /** Linear resample from the microphone's rate to 16 kHz. */
  function downsample(input, fromRate, toRate) {
    toRate = toRate || SAMPLE_RATE;
    if (fromRate === toRate) return new Float32Array(input);
    var ratio = fromRate / toRate;
    var outLen = Math.floor(input.length / ratio);
    var out = new Float32Array(outLen);
    for (var i = 0; i < outLen; i++) {
      var pos = i * ratio;
      var i0 = Math.floor(pos);
      var i1 = Math.min(input.length - 1, i0 + 1);
      var f = pos - i0;
      out[i] = input[i0] * (1 - f) + input[i1] * f;
    }
    return out;
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

  /** pos 0..1 through the sentence; now is a clock for a little wobble. */
  function mouthFromText(text, pos, now) {
    if (!text || pos < 0 || pos >= 1) return 0;
    var ch = text.charAt(Math.floor(pos * text.length));
    return openness(ch) * (0.85 + 0.15 * Math.sin((now || 0) / 45));
  }

  /** Time a sentence takes when it is only shown, not heard (~15 chars/s). */
  function textDurationMs(text) {
    return Math.max(1200, Math.min(20000, String(text || '').length * 65));
  }

  /**
   * rms loudness of the voice → 0..1 mouth openness, scaled to the voice's own
   * recent peak so quiet and loud engines both open and close the mouth fully.
   */
  function MouthFollower() {
    this.peak = 0.05;
  }
  MouthFollower.prototype.push = function (level) {
    // The peak rises at once and falls slowly (about half in 2 s at 30 updates/s).
    this.peak = Math.max(level, this.peak * 0.989, 0.02);
    if (level < 0.006) return 0;
    var v = (level - 0.15 * this.peak) / (0.7 * this.peak);
    return Math.max(0, Math.min(1, v));
  };

  /** How many words of the caption have been said at pos 0..1. */
  function wordsSpoken(text, pos) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    if (pos >= 1) return words.length;
    return Math.min(words.length, Math.ceil(Math.max(0, pos) * words.length));
  }

  return {
    SAMPLE_RATE: SAMPLE_RATE,
    UtteranceDetector: UtteranceDetector,
    downsample: downsample,
    rms: rms,
    openness: openness,
    mouthFromText: mouthFromText,
    MouthFollower: MouthFollower,
    textDurationMs: textDurationMs,
    wordsSpoken: wordsSpoken,
  };
});
