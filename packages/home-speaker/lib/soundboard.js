'use strict';

const fs = require('fs');
const path = require('path');

function createWavHeader(numSamples, sampleRate = 44100, channels = 1) {
  const buffer = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = numSamples * channels * 2;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function generateIntercomChime(sampleRate = 44100) {
  const duration = 1.0;
  const numSamples = Math.floor(sampleRate * duration);
  const pcm = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let freq, env;
    if (t < 0.45) {
      freq = 698.46; // F5
      env = Math.exp(-t * 3.5);
    } else {
      freq = 523.25; // C5
      env = Math.exp(-(t - 0.45) * 3.0);
    }
    const sample = (Math.sin(2 * Math.PI * freq * t) * 0.75 + Math.sin(4 * Math.PI * freq * t) * 0.25) * env * 22000;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample))), i * 2);
  }
  return Buffer.concat([createWavHeader(numSamples, sampleRate, 1), pcm]);
}

function generateAttentionPing(sampleRate = 44100) {
  const duration = 0.7;
  const numSamples = Math.floor(sampleRate * duration);
  const pcm = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = 880;
    const env = Math.exp(-t * 4.0);
    const sample = (Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(4 * Math.PI * freq * t) * 0.2) * env * 24000;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample))), i * 2);
  }
  return Buffer.concat([createWavHeader(numSamples, sampleRate, 1), pcm]);
}

function generateFanfare(sampleRate = 44100) {
  const notes = [
    { freq: 523.25, start: 0.0, end: 0.18 },
    { freq: 659.25, start: 0.18, end: 0.36 },
    { freq: 783.99, start: 0.36, end: 0.54 },
    { freq: 1046.50, start: 0.54, end: 1.2 }
  ];
  const duration = 1.2;
  const numSamples = Math.floor(sampleRate * duration);
  const pcm = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const note of notes) {
      if (t >= note.start && t < note.end) {
        const noteT = t - note.start;
        const decay = Math.exp(-noteT * 2.0);
        sample = (Math.sin(2 * Math.PI * note.freq * t) * 0.7 + Math.sin(4 * Math.PI * note.freq * t) * 0.3) * decay * 22000;
        break;
      }
    }
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample))), i * 2);
  }
  return Buffer.concat([createWavHeader(numSamples, sampleRate, 1), pcm]);
}

function generateAlertSiren(sampleRate = 44100) {
  const duration = 1.6;
  const numSamples = Math.floor(sampleRate * duration);
  const pcm = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const cycle = Math.floor(t * 3.5) % 2;
    const freq = cycle === 0 ? 880 : 587.33;
    const sample = Math.sin(2 * Math.PI * freq * t) * 20000;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample))), i * 2);
  }
  return Buffer.concat([createWavHeader(numSamples, sampleRate, 1), pcm]);
}

const SOUNDS = [
  {
    id: 'chime',
    name: 'Intercom Chime',
    category: 'Chimes',
    description: 'Pleasant two-tone chime for voice announcements',
    icon: '🔔',
    getBuffer: () => generateIntercomChime()
  },
  {
    id: 'ping',
    name: 'Attention Ping',
    category: 'Chimes',
    description: 'Crisp high-pitch attention alert',
    icon: '✨',
    getBuffer: () => generateAttentionPing()
  },
  {
    id: 'fanfare',
    name: 'Victory Fanfare',
    category: 'Alerts',
    description: 'Ascending brass fanfare for successful builds or milestones',
    icon: '🎺',
    getBuffer: () => generateFanfare()
  },
  {
    id: 'siren',
    name: 'Alert Siren',
    category: 'Alerts',
    description: 'Urgent alternating klaxon alert for critical errors',
    icon: '🚨',
    getBuffer: () => generateAlertSiren()
  },
  {
    id: 'witch_laugh',
    name: 'Witch Laugh',
    category: 'Effects',
    description: 'Cackling laugh track sound effect',
    icon: '🧙‍♀️',
    filePath: path.join(__dirname, '..', 'assets', 'sounds', 'witch-laugh.mp3')
  }
];

function getSound(id) {
  return SOUNDS.find(s => s.id === id);
}

function listSounds() {
  return SOUNDS.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    icon: s.icon,
    hasFile: !!s.filePath
  }));
}

module.exports = {
  SOUNDS,
  getSound,
  listSounds,
  generateIntercomChime,
  generateAttentionPing,
  generateFanfare,
  generateAlertSiren
};
