'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const ad = require('../../robos-lib/audio-devices');

describe('audio-devices & Focusrite Linux Pro-Audio parser', () => {
  it('identifies Focusrite Scarlett 18i20 3rd Gen (1235:8215) in lsusb output', () => {
    const sample = [
      'Bus 001 Device 001: ID 1d6b:0002 Linux Foundation 2.0 root hub',
      'Bus 001 Device 003: ID 1235:8215 Focusrite-Novation Scarlett 18i20 3rd Gen',
    ].join('\n');
    const parsed = ad.parseLsusb(sample);
    assert.strictEqual(parsed.length, 2);
    const fr = parsed.find(d => d.isFocusrite);
    assert.ok(fr, 'Focusrite USB device should be detected');
    assert.strictEqual(fr.usbId, '1235:8215');
    assert.strictEqual(fr.model, 'Scarlett 18i20');
    assert.strictEqual(fr.generation, '3rd Gen');
  });

  it('parses ALSA stream0 capabilities (20ch S32_LE 24-bit 44.1k-192kHz)', () => {
    const stream0 = `Focusrite Scarlett 18i20 USB at usb-0000:04:00.3-1.2, high speed : USB Audio

Playback:
  Status: Stop
  Interface 1
    Altset 1
    Format: S32_LE
    Channels: 20
    Endpoint: 0x01 (1 OUT) (ASYNC)
    Rates: 44100, 48000
    Bits: 24
  Interface 1
    Altset 3
    Format: S32_LE
    Channels: 10
    Endpoint: 0x01 (1 OUT) (ASYNC)
    Rates: 176400, 192000
    Bits: 24

Capture:
  Status: Stop
  Interface 2
    Altset 1
    Format: S32_LE
    Channels: 20
    Endpoint: 0x81 (1 IN) (ASYNC)
    Rates: 44100, 48000
    Bits: 24`;
    const info = ad.parseStream0(stream0);
    assert.strictEqual(info.maxPlaybackChannels, 20);
    assert.strictEqual(info.maxCaptureChannels, 20);
    assert.strictEqual(info.bits, 24);
    assert.strictEqual(info.format, 'S32_LE');
    assert.deepStrictEqual(info.sampleRates, [44100, 48000, 176400, 192000]);
  });

  it('computes PipeWire effective quantum and latency in milliseconds', () => {
    const meta = `Found "settings" metadata 32
update: id:0 key:'clock.rate' value:'48000' type:''
update: id:0 key:'clock.quantum' value:'1024' type:''
update: id:0 key:'clock.force-quantum' value:'128' type:''
update: id:0 key:'clock.force-rate' value:'0' type:''`;
    const clk = ad.parsePipeWireClock(meta);
    assert.strictEqual(clk.effectiveRate, 48000);
    assert.strictEqual(clk.effectiveQuantum, 128);
    assert.strictEqual(clk.latencyMs, 2.67);
  });

  it('synthesizes a valid stereo RIFF WAV studio chime and measures peak dBFS', () => {
    const wav = ad.buildChimeWavBuffer(48000, 0.25);
    assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF');
    assert.strictEqual(wav.toString('ascii', 8, 12), 'WAVE');
    const stats = ad.analyzeWavSamples(wav);
    assert.ok(stats.samples > 10000);
    assert.ok(stats.peakDb > -18 && stats.peakDb < -4, `Unexpected peak dB: ${stats.peakDb}`);
  });
});
