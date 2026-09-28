'use strict';
const { spawn } = require('child_process');

// A short raw-PCM preview, independent of dictation and transcription.
class MicrophoneTest {
  stop() {
    const session = this.session;
    this.session = null;
    if (!session) return;
    clearTimeout(session.timeout);
    clearTimeout(session.startTimeout);
    session.process.kill('SIGTERM');
    session.send({ stopped: true });
  }

  start(device, send) {
    this.stop();
    if (typeof device !== 'string' || !/^(default|\d+|hw:\d+,\d+)$/.test(device)) {
      throw new Error('Choose an available microphone.');
    }
    const pipewire = /^\d+$/.test(device);
    const proc = spawn(pipewire ? 'pw-record' : 'arecord', pipewire
      ? ['--target', device, '--rate', '16000', '--channels', '1', '--format', 's16', '-']
      : ['-q', '-D', device, '-t', 'raw', '-f', 'S16_LE', '-r', '16000', '-c', '1', '-'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
    const session = { process: proc, send };
    this.session = session;
    let pending = Buffer.alloc(0);
    let errorText = '';
    proc.stderr.on('data', data => { errorText = (errorText + data.toString()).slice(-1000); });
    proc.stdout.on('data', data => {
      if (this.session !== session) return;
      clearTimeout(session.startTimeout);
      pending = Buffer.concat([pending, data]);
      // 100ms at 16kHz: send a compact envelope and actual input level.
      while (pending.length >= 3200) {
        const samples = [];
        let sum = 0;
        for (let bin = 0; bin < 80; bin++) {
          let peak = 0;
          for (let i = 0; i < 20; i++) {
            const value = pending.readInt16LE((bin * 20 + i) * 2) / 32768;
            sum += value * value;
            peak = Math.max(peak, Math.abs(value));
          }
          samples.push(peak);
        }
        send({ samples, level: Math.sqrt(sum / 1600) });
        pending = pending.subarray(3200);
      }
    });
    const fail = message => {
      if (this.session !== session) return;
      this.stop();
      send({ error: message });
    };
    proc.on('error', error => fail(error.message));
    proc.on('exit', () => fail(errorText.trim() || 'Microphone capture ended. Check your input device.'));
    session.startTimeout = setTimeout(() => fail('No audio received. Check the microphone connection and selected device.'), 5000);
    session.timeout = setTimeout(() => this.stop(), 30000);
  }
}
module.exports = { MicrophoneTest };
