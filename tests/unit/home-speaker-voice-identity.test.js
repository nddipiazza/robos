'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  VoiceIdentityService,
  VOICE_ONBOARDING_PHRASES,
  float32ToPcm16le,
} = require('../../packages/home-speaker/lib/voice-identity-service');
const { executeNabuCommand } = require('../../packages/home-speaker/lib/nabu-command-router');

function synthesizeHarmonicVoice({ f0 = 120, formants = [], durationSec = 1.6, seed = 1 } = {}) {
  const sr = 16000;
  const N = Math.floor(sr * durationSec);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const vibrato = 1 + 0.015 * Math.sin(2 * Math.PI * 5.2 * t + seed);
    const pitch = f0 * vibrato;
    let sample = 0;
    for (let h = 1; h <= 14; h++) {
      const freq = pitch * h;
      let env = 1 / Math.pow(h, 0.85);
      for (const fm of formants) {
        const bw = fm.bw || 120;
        env += fm.amp * Math.exp(-Math.pow(freq - fm.f, 2) / (2 * bw * bw));
      }
      sample += env * Math.sin(2 * Math.PI * freq * t + h * 0.25 * seed);
    }
    const cadence = 0.65 + 0.35 * Math.sin(2 * Math.PI * 3.2 * t + seed);
    out[i] = Math.tanh(sample * 0.15 * cadence);
  }
  return out;
}

describe('RobOS Voice ID, Speaker Onboarding & App User Metadata Propagation', () => {
  let tmpDir;
  let idService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-voice-id-unit-'));
    fs.writeFileSync(
      path.join(tmpDir, 'movie-library.json'),
      JSON.stringify({
        tracks: [
          {
            id: 'trk_rm_s08e01',
            title: 'Rick and Morty · S08E01 · Summer of All Fears',
            showName: 'Rick and Morty',
            album: 'Rick and Morty',
            mediaType: 'tv',
            seasonNumber: 8,
            episodeNumber: 1,
            episodeTitle: 'Summer of All Fears',
            episodeCode: 'S08E01',
            year: 2025,
          },
        ],
      })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tv-studio.json'),
      JSON.stringify({
        tvs: [
          {
            id: 'tv-livingroom-tcl-roku',
            name: '65" TCL Roku TV (Living room)',
            ip: '192.168.1.15',
            platformId: 'roku-os',
          },
        ],
      })
    );
    idService = new VoiceIdentityService({ configDir: tmpDir, useNeural: false });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('provides 3 standard calibration phrases for Voice Onboarding', () => {
    const phrases = idService.getOnboardingPhrases();
    assert.equal(phrases.length, 3);
    assert.equal(phrases[0].step, 1);
    assert.ok(phrases[0].prompt.includes('Hello Nabu'));
  });

  it('enrolls multiple RobOS Users via Voice Onboarding and accurately identifies whose voice is speaking', async () => {
    // 1. Onboard Nicholas (baritone ~118 Hz)
    const nickSample1 = synthesizeHarmonicVoice({
      f0: 118,
      formants: [{ f: 500, amp: 2.2 }, { f: 1450, amp: 1.6 }, { f: 2450, amp: 1.0 }],
      seed: 1,
    });
    const nickSample2 = synthesizeHarmonicVoice({
      f0: 121,
      formants: [{ f: 512, amp: 2.1 }, { f: 1470, amp: 1.5 }, { f: 2430, amp: 1.1 }],
      seed: 2,
    });

    await idService.enrollVoiceSample({
      userId: 'nicholas-dipiazza',
      name: 'Nicholas DiPiazza',
      role: 'Owner / Admin',
      step: 1,
      phrase: VOICE_ONBOARDING_PHRASES[0].prompt,
      float32: nickSample1,
    });
    const nickEnroll2 = await idService.enrollVoiceSample({
      userId: 'nicholas-dipiazza',
      name: 'Nicholas DiPiazza',
      role: 'Owner / Admin',
      step: 2,
      phrase: VOICE_ONBOARDING_PHRASES[1].prompt,
      float32: nickSample2,
    });

    assert.equal(nickEnroll2.ok, true);
    assert.equal(nickEnroll2.profile.sampleCount, 2);

    // 2. Onboard Sarah (alto/soprano ~215 Hz)
    const sarahSample1 = synthesizeHarmonicVoice({
      f0: 215,
      formants: [{ f: 680, amp: 2.3 }, { f: 1950, amp: 1.8 }, { f: 2950, amp: 1.2 }],
      seed: 3,
    });
    const sarahSample2 = synthesizeHarmonicVoice({
      f0: 211,
      formants: [{ f: 670, amp: 2.2 }, { f: 1920, amp: 1.9 }, { f: 2920, amp: 1.1 }],
      seed: 4,
    });

    await idService.enrollVoiceSample({
      userId: 'sarah-rivera',
      name: 'Sarah Rivera',
      role: 'Family Member',
      step: 1,
      phrase: VOICE_ONBOARDING_PHRASES[0].prompt,
      float32: sarahSample1,
    });
    await idService.enrollVoiceSample({
      userId: 'sarah-rivera',
      name: 'Sarah Rivera',
      role: 'Family Member',
      step: 2,
      phrase: VOICE_ONBOARDING_PHRASES[1].prompt,
      float32: sarahSample2,
    });

    // 3. Identify unseen Nicholas utterance vs unseen Sarah utterance
    const unseenNick = synthesizeHarmonicVoice({
      f0: 119,
      formants: [{ f: 506, amp: 2.15 }, { f: 1460, amp: 1.55 }, { f: 2440, amp: 1.05 }],
      seed: 9,
    });
    const unseenSarah = synthesizeHarmonicVoice({
      f0: 213,
      formants: [{ f: 675, amp: 2.25 }, { f: 1935, amp: 1.85 }, { f: 2935, amp: 1.15 }],
      seed: 10,
    });

    const matchNick = await idService.identifySpeaker({ float32: unseenNick });
    assert.equal(matchNick.identified, true);
    assert.equal(matchNick.userId, 'nicholas-dipiazza');
    assert.equal(matchNick.name, 'Nicholas DiPiazza');
    assert.ok(matchNick.confidence >= 0.75, `Expected confidence >= 0.75, got ${matchNick.confidence}`);

    const matchSarah = await idService.identifySpeaker({ float32: unseenSarah });
    assert.equal(matchSarah.identified, true);
    assert.equal(matchSarah.userId, 'sarah-rivera');
    assert.equal(matchSarah.name, 'Sarah Rivera');
    assert.ok(matchSarah.confidence >= 0.75, `Expected confidence >= 0.75, got ${matchSarah.confidence}`);
  });

  it('supports hands-free spoken voice onboarding ("Hello Nabu, remember my voice as Nicholas") and "who am I?"', async () => {
    const nickVoicePcm = float32ToPcm16le(
      synthesizeHarmonicVoice({
        f0: 120,
        formants: [{ f: 510, amp: 2.2 }, { f: 1460, amp: 1.6 }, { f: 2440, amp: 1.0 }],
        seed: 5,
      })
    );

    const enrollRes = await executeNabuCommand('Hello Nabu, remember my voice as Nicholas DiPiazza', {
      configDir: tmpDir,
      autoLaunchPlayers: false,
      pcmBuffer: nickVoicePcm,
      voiceIdentityService: idService,
    });

    assert.equal(enrollRes.ok, true);
    assert.equal(enrollRes.skill, 'voice-enroll');
    assert.equal(enrollRes.robosUser.name, 'Nicholas DiPiazza');
    assert.equal(enrollRes.robosUser.identified, true);

    const whoRes = await executeNabuCommand('Hello Nabu, who am I?', {
      configDir: tmpDir,
      autoLaunchPlayers: false,
      pcmBuffer: nickVoicePcm,
      voiceIdentityService: idService,
    });

    assert.equal(whoRes.ok, true);
    assert.equal(whoRes.skill, 'voice-whoami');
    assert.equal(whoRes.robosUser.name, 'Nicholas DiPiazza');
    assert.ok(whoRes.response.includes('Nicholas DiPiazza'));
  });

  it('attaches the identified "robosUser" metadata when routing voice commands to RobOS apps', async () => {
    const nickFloat = synthesizeHarmonicVoice({
      f0: 118,
      formants: [{ f: 500, amp: 2.2 }, { f: 1450, amp: 1.6 }, { f: 2450, amp: 1.0 }],
      seed: 7,
    });
    await idService.enrollVoiceSample({
      userId: 'nicholas-dipiazza',
      name: 'Nicholas DiPiazza',
      role: 'Owner / Admin',
      float32: nickFloat,
    });

    const queryPcm = float32ToPcm16le(nickFloat);
    const playRes = await executeNabuCommand(
      'Hello Nabu, play Rick and Morty Season 8 Episode 1 on the Roku',
      {
        configDir: tmpDir,
        autoLaunchPlayers: false,
        pcmBuffer: queryPcm,
        voiceIdentityService: idService,
      }
    );

    assert.equal(playRes.ok, true);
    assert.equal(playRes.skill, 'movie-play');
    assert.ok(playRes.robosUser, 'Expected robosUser on command result');
    assert.equal(playRes.robosUser.userId, 'nicholas-dipiazza');
    assert.equal(playRes.robosUser.name, 'Nicholas DiPiazza');
    assert.equal(playRes.robosUser.identified, true);
    assert.equal(playRes.data.robosUser.name, 'Nicholas DiPiazza');

    // Also verify ~/.config/robos/active-voice-context.json was written for any desktop app to inspect
    const activeCtx = idService.readActiveVoiceContext();
    assert.ok(activeCtx && activeCtx.robosUser);
    assert.equal(activeCtx.robosUser.name, 'Nicholas DiPiazza');
  });
});
