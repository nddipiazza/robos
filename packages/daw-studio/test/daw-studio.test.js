'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ad = require('../../robos-lib/audio-devices');
const { MIC_PROFILES, getMicProfile } = require('../lib/mic-profiles');
const {
  OPEN_DRUMKIT_CATALOG,
  decodeWavMono,
  computeWaveformPeaks,
  detectDrumTransients,
} = require('../lib/drum-instruments');
const {
  createEmptyProject,
  buildTrackFromWizard,
  saveProject,
  loadProject,
  listProjects,
  synthesizeDrumTakeWav,
  MultiTrackRecorder,
} = require('../lib/session-manager');
const { parseChannelTarget, makeWavHeader } = require('../lib/pcm-capture');
const {
  extractChannelAcousticFeatures,
  computeCrossChannelCorrelations,
  synthesizeRealisticSoundcheckRoleWav,
  classifySoundcheckHeuristic,
  classifySoundcheckWithAgent,
  applyClassifiedDrumsetToProject,
} = require('../lib/drumset-ai-classifier');

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

describe('Add Mic Wizard profiles, open-source drum kits & session persistence', () => {
  it('provides 18 studio mic profiles with AI-generated WebP artwork on disk and LV2/EQ presets', () => {
    assert.strictEqual(MIC_PROFILES.length, 18);
    const rendererDir = path.join(__dirname, '..', 'renderer');
    for (const p of MIC_PROFILES) {
      const imgFile = path.join(rendererDir, p.image);
      assert.ok(fs.existsSync(imgFile), `Missing AI mic illustration for ${p.id}: ${imgFile}`);
      assert.ok(Array.isArray(p.fx.openSourcePlugins) && p.fx.openSourcePlugins.length >= 2);
      assert.strictEqual(typeof p.fx.eq.hpfHz, 'number');
    }
    assert.strictEqual(getMicProfile('snare-top').soundReplacement.pieceId, 'snare');
    assert.strictEqual(getMicProfile('snare-bottom').fx.phaseInvert, true);
  });

  it('defines open-source drum replacement archives without embedding WAV/FLAC binaries in git', () => {
    assert.ok(OPEN_DRUMKIT_CATALOG.length >= 3);
    const gm = OPEN_DRUMKIT_CATALOG.find(k => k.id === 'gm-rock-kit');
    assert.ok(gm);
    assert.ok(gm.pieces.kick.layers.length >= 3);
    assert.ok(gm.pieces.snare.layers.length >= 3);
  });

  it('detects drum strike transients and computes waveform peaks accurately', () => {
    const hitTimes = [0.20, 0.70, 1.20, 1.70];
    const wav = synthesizeDrumTakeWav({
      profileId: 'snare-top',
      durationSec: 2.2,
      sampleRate: 48000,
      hitTimesSec: hitTimes,
    });
    const decoded = decodeWavMono(wav);
    assert.strictEqual(decoded.sampleRate, 48000);
    assert.ok(Math.abs(decoded.durationSec - 2.2) < 0.02);

    const peaks = computeWaveformPeaks(wav, 120);
    assert.strictEqual(peaks.peaks.length, 120);
    assert.ok(peaks.peakDb > -12);

    const transients = detectDrumTransients(wav, { thresholdDb: -28, minIntervalMs: 70 });
    assert.strictEqual(transients.length, 4, `Expected 4 hits, got ${transients.length}`);
    for (let i = 0; i < hitTimes.length; i++) {
      assert.ok(Math.abs(transients[i].timeSec - hitTimes[i]) < 0.03, `Hit ${i} off: ${transients[i].timeSec}`);
    }
  });

  it('arms a full drum set + guitar mic, records multi-track takes, saves, and reloads all tracking & sound replacement intact', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-test-'));
    const prevProjDir = process.env.ROBOS_DAW_PROJECTS_DIR;
    const prevCfgDir = process.env.ROBOS_DAW_CONFIG_DIR;
    process.env.ROBOS_DAW_PROJECTS_DIR = path.join(tmpRoot, 'projects');
    process.env.ROBOS_DAW_CONFIG_DIR = path.join(tmpRoot, 'config');

    try {
      const fakeScarlettInputs = Array.from({ length: 12 }, (_, idx) => ({
        id: 130 + idx,
        name: `alsa_input.scarlett.in${idx + 1}`,
        description: `Scarlett 18i20 3rd Gen Input ${idx + 1}`,
        isFocusrite: true,
      }));

      const project = createEmptyProject({ name: 'E2E Drum & Guitar Tracking Proof', bpm: 128 });
      const micChoices = [
        { profileId: 'kick-in', name: 'Kick Inside' },
        { profileId: 'kick-out', name: 'Kick Outside Sub' },
        { profileId: 'snare-top', name: 'Snare Top' },
        { profileId: 'snare-bottom', name: 'Snare Bottom Ø' },
        { profileId: 'tom-rack-1', name: 'Rack Tom 1' },
        { profileId: 'tom-rack-2', name: 'Rack Tom 2' },
        { profileId: 'tom-floor-1', name: 'Floor Tom 1' },
        { profileId: 'hihat-mic', name: 'Hi-Hat' },
        { profileId: 'ride-mic', name: 'Ride Spot' },
        { profileId: 'cymbal-overhead', name: 'Overhead L', pan: -0.65 },
        { profileId: 'cymbal-overhead', name: 'Overhead R', pan: 0.65 },
        { profileId: 'guitar-cab', name: 'Rhythm Guitar Cab', pan: -0.45 },
      ];
      for (let i = 0; i < micChoices.length; i++) {
        project.tracks.push(buildTrackFromWizard({
          ...micChoices[i],
          inputNodeName: fakeScarlettInputs[i].name,
          inputLabel: fakeScarlettInputs[i].description,
          armed: true,
        }));
      }
      assert.strictEqual(project.tracks.length, 12);
      assert.ok(project.tracks.every(t => t.armed));

      // 1. Save armed template before recording & verify reload
      const firstSave = saveProject(project);
      assert.ok(firstSave.ok && fs.existsSync(firstSave.manifestFile));
      const firstLoad = loadProject(project.id);
      assert.strictEqual(firstLoad.project.tracks.length, 12);
      assert.strictEqual(firstLoad.project.bpm, 128);

      // 2. Record multi-track test session across all 12 armed tracks, save, and reload
      const recorder = new MultiTrackRecorder();
      const startRes = recorder.start(firstLoad.project, { startSec: 0 });
      assert.strictEqual(startRes.ok, true);
      assert.strictEqual(startRes.armedCount, 12);

      await new Promise(r => setTimeout(r, 350));
      const stopRes = await recorder.stop({ injectTestSignal: true });
      assert.strictEqual(stopRes.ok, true);
      assert.strictEqual(stopRes.recordedClips.length, 12);

      const secondSave = saveProject(stopRes.project);
      assert.strictEqual(secondSave.ok, true);

      const listed = listProjects();
      assert.strictEqual(listed.projects.length, 1);
      assert.strictEqual(listed.projects[0].clipCount, 12);

      // 3. Re-open from disk and assert every track, channel, EQ, Sound Replacement & WAV stem reloaded
      const reopened = loadProject(secondSave.project.id);
      assert.strictEqual(reopened.ok, true);
      assert.strictEqual(reopened.project.name, 'E2E Drum & Guitar Tracking Proof');
      assert.strictEqual(reopened.project.tracks.length, 12);

      const kickReloaded = reopened.project.tracks.find(t => t.profileId === 'kick-in');
      assert.ok(kickReloaded);
      assert.strictEqual(kickReloaded.inputNodeName, 'alsa_input.scarlett.in1');
      assert.strictEqual(kickReloaded.soundReplacement.enabled, true);
      assert.strictEqual(kickReloaded.soundReplacement.kitId, 'gm-rock-kit');
      assert.strictEqual(kickReloaded.soundReplacement.pieceId, 'kick');
      assert.strictEqual(kickReloaded.clips.length, 1);
      assert.strictEqual(kickReloaded.clips[0].fileExists, true);
      assert.ok(fs.existsSync(kickReloaded.clips[0].wavFile));
      assert.ok(kickReloaded.clips[0].peaks.length > 50);
      assert.ok(kickReloaded.clips[0].transients.length >= 1);

      const gtrReloaded = reopened.project.tracks.find(t => t.profileId === 'guitar-cab');
      assert.strictEqual(gtrReloaded.pan, -0.45);
      assert.strictEqual(gtrReloaded.clips.length, 1);
      assert.strictEqual(gtrReloaded.clips[0].fileExists, true);
    } finally {
      if (prevProjDir === undefined) delete process.env.ROBOS_DAW_PROJECTS_DIR;
      else process.env.ROBOS_DAW_PROJECTS_DIR = prevProjDir;
      if (prevCfgDir === undefined) delete process.env.ROBOS_DAW_CONFIG_DIR;
      else process.env.ROBOS_DAW_CONFIG_DIR = prevCfgDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('DrumSet AI All-Mic Soundcheck & Discrete 8-Channel ADAT Expansion', () => {
  it('expands Focusrite ADAT Optical source into 8 discrete selectable inputs (Ch 9..Ch 16)', () => {
    const pwCliOut = [
      'id 119, type PipeWire:Interface:Node/3',
      '  media.class = "Audio/Source"',
      '  node.name = "alsa_input.usb-Focusrite_Scarlett_18i20_USB-00.HiFi__Direct2__source"',
      '  node.description = "Scarlett 18i20 3rd Gen ADAT Optical Input"',
    ].join('\n');
    const parsed = ad.parsePipeWireNodes(pwCliOut);
    assert.strictEqual(parsed.inputs.length, 8);
    assert.strictEqual(parsed.inputs[0].description, 'Scarlett 18i20 3rd Gen ADAT Input 1 (Ch 9)');
    assert.strictEqual(parsed.inputs[7].description, 'Scarlett 18i20 3rd Gen ADAT Input 8 (Ch 16)');
    const tgt = parseChannelTarget(parsed.inputs[2].name);
    assert.strictEqual(tgt.channelIndex, 2);
    assert.strictEqual(tgt.totalChannels, 8);
    assert.strictEqual(makeWavHeader(96000, 48000).length, 44);
  });

  it('extracts spectral/transient signatures, prefers Gemini (antigravity) via RobOS Agent, and auto-configures Kick, Snare, Toms, Cymbals & Other mics', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-sc-test-'));
    try {
      const roles = [
        'kick-in',
        'snare-top',
        'snare-bottom',
        'tom-rack-1',
        'tom-rack-2',
        'tom-floor-1',
        'hihat-mic',
        'cymbal-overhead',
        'guitar-cab',
        'silent',
      ];

      const channels = roles.map((role, idx) => {
        const channelIndex = idx + 1;
        const wavBuf = synthesizeRealisticSoundcheckRoleWav(role, 4.5, 48000);
        const wavFile = path.join(tmpDir, `ch-${channelIndex}.wav`);
        fs.writeFileSync(wavFile, wavBuf);
        const features = extractChannelAcousticFeatures(wavBuf);
        return {
          channelIndex,
          inputNodeName: `alsa_input.scarlett.ch${channelIndex}`,
          inputLabel: `Scarlett 18i20 Input ${channelIndex}`,
          wavFile,
          previewFileName: features.isSilent ? null : `ch-${channelIndex}.wav`,
          previewWavFile: features.isSilent ? null : wavFile,
          features,
        };
      });

      computeCrossChannelCorrelations(channels);

      // Verify deterministic physics/spectral classifier baseline finds kick, snare, ordered toms, cymbals, guitar, and unused
      const heur = classifySoundcheckHeuristic(channels);
      assert.strictEqual(heur[0].profileId, 'kick-in');
      assert.strictEqual(heur[1].profileId, 'snare-top');
      assert.strictEqual(heur[2].profileId, 'snare-bottom');
      assert.strictEqual(heur[3].profileId, 'tom-rack-1');
      assert.strictEqual(heur[4].profileId, 'tom-rack-2');
      assert.strictEqual(heur[5].profileId, 'tom-floor-1');
      assert.strictEqual(heur[6].profileId, 'hihat-mic');
      assert.strictEqual(heur[7].profileId, 'cymbal-overhead');
      assert.strictEqual(heur[9].profileId, 'unused');

      // Verify `classifySoundcheckWithAgent` invokes `antigravity` (Gemini) FIRST and hydrates proper settings
      const calls = [];
      const mockAiAgent = {
        PROVIDERS: [
          { id: 'github-copilot', name: 'GitHub Copilot' },
          { id: 'antigravity', name: 'Gemini CLI / Antigravity' },
        ],
        PROVIDER_MAP: {
          'github-copilot': { id: 'github-copilot', name: 'GitHub Copilot' },
          antigravity: { id: 'antigravity', name: 'Gemini CLI / Antigravity' },
        },
        getActiveProviderId: () => 'github-copilot',
        ask: async (prompt, opts) => {
          calls.push({ prompt, opts });
          return {
            ok: true,
            via: 'cli',
            provider: opts.providerId,
            text: JSON.stringify({
              channels: heur.map(h => ({
                channelIndex: h.channelIndex,
                profileId: h.profileId,
                suggestedTrackName: h.suggestedTrackName,
                pan: h.pan,
                confidence: 0.96,
                reasoning: h.reasoning,
              })),
            }),
          };
        },
      };

      const agentRes = await classifySoundcheckWithAgent(
        { sessionId: 'sc-unit', dir: tmpDir, channels },
        { aiAgentModule: mockAiAgent }
      );
      assert.strictEqual(agentRes.ok, true);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].opts.providerId, 'antigravity', 'Must prefer Gemini (antigravity) first');
      assert.strictEqual(agentRes.provider, 'antigravity');
      assert.ok(fs.existsSync(path.join(tmpDir, 'soundcheck-features.json')));

      // Apply classified drumset to project and verify LV2/EQ, Phase Invert, Pan, Sound Replacement & Stems
      const proj = createEmptyProject({ name: 'Gemini Auto-Detected Kit' });
      const applied = applyClassifiedDrumsetToProject(proj, agentRes.classifications, {
        importSoundcheckTakes: true,
        replaceExistingTracks: true,
      });
      assert.strictEqual(applied.addedCount, 9); // 9 active mics, 1 silent skipped
      const snareBot = proj.tracks.find(t => t.profileId === 'snare-bottom');
      assert.ok(snareBot);
      assert.strictEqual(snareBot.fx.phaseInvert, true);
      const kickTrk = proj.tracks.find(t => t.profileId === 'kick-in');
      assert.strictEqual(kickTrk.soundReplacement.enabled, true);
      assert.strictEqual(kickTrk.soundReplacement.pieceId, 'kick');
      assert.strictEqual(kickTrk.clips.length, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
