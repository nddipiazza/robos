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
const DE = require('../renderer/daw-editing');

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

describe('DAW Editing Engine: Multi-Select, Track/Take Gain, Split/Trim, Copy/Paste & Undo/Redo', () => {
  it('supports Click, Ctrl+Click toggle, Shift+Click range, and Ctrl+A Select All on tracks and takes', () => {
    const project = createEmptyProject({ name: 'Selection Test' });
    for (const id of ['kick-in', 'snare-top', 'tom-rack-1', 'cymbal-overhead']) {
      const tr = buildTrackFromWizard({ profileId: id });
      tr.clips.push({ id: `clip-${id}-1`, name: `${id} Take 1`, startSec: 0, durationSec: 4.0 });
      tr.clips.push({ id: `clip-${id}-2`, name: `${id} Take 2`, startSec: 5.0, durationSec: 3.0 });
      project.tracks.push(tr);
    }

    // Single click track 0
    let sel = DE.applyTrackClickSelection(project.tracks, new Set(), null, project.tracks[0].id, {});
    assert.strictEqual(sel.selectedTrackIds.size, 1);

    // Shift+Click track 2 -> selects tracks 0, 1, 2
    sel = DE.applyTrackClickSelection(project.tracks, sel.selectedTrackIds, sel.anchorTrackId, project.tracks[2].id, { shiftKey: true });
    assert.strictEqual(sel.selectedTrackIds.size, 3);

    // Ctrl+Click track 1 -> toggles track 1 off, leaving 0 & 2
    sel = DE.applyTrackClickSelection(project.tracks, sel.selectedTrackIds, sel.anchorTrackId, project.tracks[1].id, { ctrlKey: true });
    assert.strictEqual(sel.selectedTrackIds.size, 2);
    assert.strictEqual(sel.selectedTrackIds.has(project.tracks[1].id), false);

    // 2D Shift+Click across takes (track 0 take 1 -> track 2 take 1) selects all 3 overlapping takes in phase lock
    let clipSel = DE.applyClipClickSelection(project, new Set(), null, 'clip-kick-in-1', {});
    clipSel = DE.applyClipClickSelection(project, clipSel.selectedClipIds, clipSel.anchorClipId, 'clip-tom-rack-1-1', { shiftKey: true });
    assert.strictEqual(clipSel.selectedClipIds.size, 3);
    assert.ok(clipSel.selectedClipIds.has('clip-snare-top-1'));

    // Ctrl+A selects all 4 tracks and all 8 takes
    const all = DE.selectAllInProject(project);
    assert.strictEqual(all.selectedTrackIds.size, 4);
    assert.strictEqual(all.selectedClipIds.size, 8);
  });

  it('splits takes non-destructively, slices transients & peaks, trims edges, moves in phase lock, and Undo/Redoes cleanly', () => {
    const project = createEmptyProject({ name: 'Non-Destructive Edit Test' });
    const kick = buildTrackFromWizard({ profileId: 'kick-in', name: 'Kick' });
    const snare = buildTrackFromWizard({ profileId: 'snare-top', name: 'Snare' });

    kick.clips.push({
      id: 'c-kick',
      name: 'Kick Take',
      startSec: 1.0,
      offsetSec: 0,
      durationSec: 4.0,
      sourceDurationSec: 4.0,
      peakDb: -9.0,
      peaks: Array.from({ length: 40 }, (_, i) => (i + 1) / 40),
      transients: [
        { timeSec: 0.5, peakDb: -9, velocity: 0.8 },
        { timeSec: 2.5, peakDb: -8, velocity: 0.9 },
      ],
    });
    snare.clips.push({
      id: 'c-snare',
      name: 'Snare Take',
      startSec: 1.5,
      offsetSec: 0,
      durationSec: 4.0,
      sourceDurationSec: 4.0,
      peakDb: -12.0,
      peaks: Array.from({ length: 40 }, () => 0.5),
      transients: [{ timeSec: 1.0, peakDb: -12, velocity: 0.75 }],
    });
    project.tracks.push(kick, snare);

    const history = new DE.UndoHistoryStack(20);
    history.pushSnapshot(project, 'Split Kick at 3.0s');

    // Split Kick at timeline t = 3.0s (2.0s into the clip)
    const splitRes = DE.splitClipsInProject(project, {
      selectedClipIds: new Set(['c-kick']),
      selectedTrackIds: new Set(),
      splitTimeSec: 3.0,
    });
    assert.strictEqual(splitRes.splitCount, 1);
    assert.strictEqual(project.tracks[0].clips.length, 2);

    const [leftPart, rightPart] = project.tracks[0].clips;
    assert.strictEqual(leftPart.startSec, 1.0);
    assert.strictEqual(leftPart.durationSec, 2.0);
    assert.strictEqual(leftPart.transients.length, 1);
    assert.strictEqual(leftPart.transients[0].timeSec, 0.5);

    assert.strictEqual(rightPart.startSec, 3.0);
    assert.strictEqual(rightPart.offsetSec, 2.0);
    assert.strictEqual(rightPart.durationSec, 2.0);
    assert.strictEqual(rightPart.transients.length, 1);
    assert.strictEqual(rightPart.transients[0].timeSec, 0.5); // 2.5s source - 2.0s offset = 0.5s into right clip!

    // Phase-locked move: Kick leftPart is at 1.0s, Snare is at 1.5s (0.5s delta).
    // Dragging both left by -5.0s clamps at t=0 so Kick hits 0.0s and Snare stays at 0.5s!
    DE.moveClipsByDelta(project, new Set([leftPart.id, 'c-snare']), -5.0);
    assert.strictEqual(project.tracks[0].clips[0].startSec, 0);
    assert.strictEqual(project.tracks[1].clips[0].startSec, 0.5);

    // Trim Snare left edge inward by +0.4s
    DE.trimClipEdge(project.tracks[1].clips[0], 'left', 0.4);
    assert.strictEqual(project.tracks[1].clips[0].startSec, 0.9);
    assert.strictEqual(project.tracks[1].clips[0].offsetSec, 0.4);
    assert.strictEqual(project.tracks[1].clips[0].durationSec, 3.6);

    // Undo restores original unsplit 1-clip state; Redo re-applies
    const undone = history.undo(project);
    assert.ok(undone);
    assert.strictEqual(undone.project.tracks[0].clips.length, 1);
    const redone = history.redo(undone.project);
    assert.ok(redone);
    assert.strictEqual(redone.project.tracks[0].clips.length, 2);
  });

  it('persists Track Gain, Take Gain, Fades, Mute & Trimmed Clip Windows across saveProject and loadProject', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-edit-persist-'));
    const prevProjDir = process.env.ROBOS_DAW_PROJECTS_DIR;
    const prevCfgDir = process.env.ROBOS_DAW_CONFIG_DIR;
    process.env.ROBOS_DAW_PROJECTS_DIR = path.join(tmpRoot, 'projects');
    process.env.ROBOS_DAW_CONFIG_DIR = path.join(tmpRoot, 'config');

    try {
      const proj = createEmptyProject({ name: 'Gain & Trim Persistence' });
      const trk = buildTrackFromWizard({ profileId: 'snare-top', name: 'Snare Top' });
      const projDir = path.join(process.env.ROBOS_DAW_PROJECTS_DIR, proj.id, 'audio');
      fs.mkdirSync(projDir, { recursive: true });
      const wavPath = path.join(projDir, 'snare-take.wav');
      fs.writeFileSync(wavPath, synthesizeDrumTakeWav({ profileId: 'snare-top', durationSec: 3.0 }));

      trk.clips.push({
        id: 'clip-persist-1',
        name: 'Trimmed Snare',
        fileName: 'snare-take.wav',
        wavFile: wavPath,
        startSec: 1.25,
        offsetSec: 0.5,
        durationSec: 1.8,
        sourceDurationSec: 3.0,
        peakDb: -14.5,
        gainDb: 4.5,
        fadeInSec: 0.05,
        fadeOutSec: 0.25,
        muted: true,
        peaks: [0.3, 0.7, 0.4],
        transients: [],
      });
      DE.normalizeTrackGain(trk, -6.0); // -6.0 - (-14.5) = +8.5 dB
      assert.strictEqual(trk.gainDb, 8.5);
      proj.tracks.push(trk);

      // Duplicate & reorder track
      const dupIds = DE.duplicateTracksInProject(proj, new Set([trk.id]), { includeClips: true });
      assert.strictEqual(dupIds.length, 1);
      assert.strictEqual(proj.tracks.length, 2);
      DE.reorderTrackInProject(proj, dupIds[0], -1);
      assert.strictEqual(proj.tracks[0].id, dupIds[0]);

      // Copy & Paste clip
      const cb = DE.copyClipsFromProject(proj, new Set(['clip-persist-1']));
      const pasted = DE.pasteClipsIntoProject(proj, cb, 4.0, proj.tracks[0].id);
      assert.strictEqual(pasted.length, 1);

      const saved = saveProject(proj);
      assert.strictEqual(saved.ok, true);

      const loaded = loadProject(proj.id);
      assert.strictEqual(loaded.ok, true);
      const reloadedOrig = loaded.project.tracks[1];
      assert.strictEqual(reloadedOrig.gainDb, 8.5);
      assert.strictEqual(reloadedOrig.clips[0].startSec, 1.25);
      assert.strictEqual(reloadedOrig.clips[0].offsetSec, 0.5);
      assert.strictEqual(reloadedOrig.clips[0].durationSec, 1.8);
      assert.strictEqual(reloadedOrig.clips[0].gainDb, 4.5);
      assert.strictEqual(reloadedOrig.clips[0].fadeInSec, 0.05);
      assert.strictEqual(reloadedOrig.clips[0].fadeOutSec, 0.25);
      assert.strictEqual(reloadedOrig.clips[0].muted, true);
    } finally {
      if (prevProjDir === undefined) delete process.env.ROBOS_DAW_PROJECTS_DIR;
      else process.env.ROBOS_DAW_PROJECTS_DIR = prevProjDir;
      if (prevCfgDir === undefined) delete process.env.ROBOS_DAW_CONFIG_DIR;
      else process.env.ROBOS_DAW_CONFIG_DIR = prevCfgDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('supports batch track actions (select all tracks, invert, arm/disarm all, remove selected/all), trim-to-playhead, snap grid & stereo WAV mixdown encoding', () => {
    const project = createEmptyProject({ name: 'Batch Track & Menu Ops', bpm: 120 });
    for (let i = 0; i < 4; i++) {
      const tr = buildTrackFromWizard({ profileId: 'snare-top', name: `Audio ${i + 1}`, armed: false });
      tr.clips.push({
        id: `c-${i}`,
        name: `Take ${i + 1}`,
        startSec: 0,
        offsetSec: 0,
        durationSec: 4.0,
        sourceDurationSec: 4.0,
      });
      project.tracks.push(tr);
    }

    // Select all tracks only (clears clip selection so Delete / Remove acts on tracks)
    const tracksOnly = DE.selectAllTracksOnly(project);
    assert.strictEqual(tracksOnly.selectedTrackIds.size, 4);
    assert.strictEqual(tracksOnly.selectedClipIds.size, 0);

    // Select all clips only
    const clipsOnly = DE.selectAllClipsOnly(project);
    assert.strictEqual(clipsOnly.selectedTrackIds.size, 0);
    assert.strictEqual(clipsOnly.selectedClipIds.size, 4);

    // Invert track selection
    const firstTwo = new Set([project.tracks[0].id, project.tracks[1].id]);
    const inverted = DE.invertTrackSelection(project, firstTwo);
    assert.strictEqual(inverted.size, 2);
    assert.ok(inverted.has(project.tracks[2].id) && inverted.has(project.tracks[3].id));

    // Batch Arm All / Disarm All / Arm Selected / Phase Invert
    assert.strictEqual(DE.setTracksPropertyBatch(project, 'all', 'armed', true), 4);
    assert.ok(project.tracks.every(t => t.armed === true));
    assert.strictEqual(DE.setTracksPropertyBatch(project, 'all', 'armed', false), 4);
    assert.ok(project.tracks.every(t => t.armed === false));
    assert.strictEqual(DE.setTracksPropertyBatch(project, firstTwo, 'armed', true), 2);
    assert.strictEqual(project.tracks.filter(t => t.armed).length, 2);
    DE.setTracksPropertyBatch(project, firstTwo, 'phaseInvert', true);
    assert.strictEqual(project.tracks[0].fx.phaseInvert, true);
    assert.strictEqual(project.tracks[2].fx.phaseInvert, false);

    // Trim Start & End to Playhead
    assert.strictEqual(DE.trimClipsToPlayhead(project, new Set(['c-0']), 'left', 1.0), 1);
    assert.strictEqual(project.tracks[0].clips[0].startSec, 1.0);
    assert.strictEqual(project.tracks[0].clips[0].offsetSec, 1.0);
    assert.strictEqual(project.tracks[0].clips[0].durationSec, 3.0);
    assert.strictEqual(DE.trimClipsToPlayhead(project, new Set(['c-0']), 'right', 3.0), 1);
    assert.strictEqual(project.tracks[0].clips[0].durationSec, 2.0);

    // Remove Selected Tracks + Undo recovery
    const hist = new DE.UndoHistoryStack(10);
    hist.pushSnapshot(project, 'Remove 2 Tracks');
    assert.strictEqual(DE.deleteTracksFromProject(project, firstTwo), 2);
    assert.strictEqual(project.tracks.length, 2);
    const restored = hist.undo(project).project;
    assert.strictEqual(restored.tracks.length, 4);

    // Snap to Beat Grid (120 BPM => 0.5s beat, subdivision 2 => 0.25s grid)
    assert.strictEqual(DE.snapTimeToBeatGrid(1.13, 120, true, 2), 1.25);
    assert.strictEqual(DE.snapTimeToBeatGrid(1.13, 120, false, 2), 1.13);

    // Stereo 16-bit PCM WAV Mixdown Encoder
    const left = new Float32Array([0, 0.5, -0.5, 1.0]);
    const right = new Float32Array([0, -0.5, 0.5, -1.0]);
    const wavBytes = DE.encodeStereoFloat32ToWavBytes(left, right, 48000);
    assert.strictEqual(wavBytes.length, 44 + 4 * 4);
    assert.strictEqual(Buffer.from(wavBytes.slice(0, 4)).toString('ascii'), 'RIFF');
    assert.strictEqual(Buffer.from(wavBytes.slice(8, 12)).toString('ascii'), 'WAVE');
  });

  it('enforces zero default emojis across DAW UI files and ships AI studio icon badges + vector DawIcons', () => {
    const DawIcons = require('../renderer/daw-icons');
    const pkgRoot = path.resolve(__dirname, '..');
    const expectedBadges = [
      'daw-crest',
      'drumset-ai',
      'mic-wizard',
      'drum-replace',
      'audio-interface',
      'channel-fx',
      'metronome',
      'mixdown-export',
    ];
    for (const key of expectedBadges) {
      assert.ok(DawIcons.AI_BADGES[key], `Missing AI_BADGES[${key}]`);
      const assetPath = path.join(pkgRoot, 'renderer', DawIcons.AI_BADGES[key]);
      assert.ok(fs.existsSync(assetPath), `Missing AI badge file: ${assetPath}`);
      const buf = fs.readFileSync(assetPath);
      assert.ok(buf.length > 512, `AI badge file unexpectedly small: ${assetPath}`);
      assert.strictEqual(buf.slice(0, 4).toString('ascii'), 'RIFF', `Expected RIFF WEBP header for ${key}`);
      assert.strictEqual(buf.slice(8, 12).toString('ascii'), 'WEBP', `Expected WEBP header for ${key}`);
      assert.ok(DawIcons.badge(key, 20).includes(DawIcons.AI_BADGES[key]));
      assert.ok(DawIcons.menuIcon(key, 15).includes('daw-ai-badge'));
    }

    assert.ok(DawIcons.svg('scissors', 14).startsWith('<svg'));
    assert.ok(DawIcons.menuIcon('sliders', 14).includes('<svg'));

    const emojiOrDingbatRegex = /\p{Extended_Pictographic}|[\u2600-\u27BF\uFE0F\u25CF\u25CB\u25A0\u25B6\u23F8-\u23FA]/gu;
    function collectSourceFiles(dir) {
      const out = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === 'test') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...collectSourceFiles(full));
        else if (/\.(js|html|css|cjs)$/.test(ent.name)) out.push(full);
      }
      return out;
    }
    const filesToCheck = collectSourceFiles(pkgRoot);
    assert.ok(filesToCheck.length >= 8);
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.match(emojiOrDingbatRegex);
      assert.strictEqual(
        matches,
        null,
        `Found forbidden emoji/dingbat in ${path.relative(pkgRoot, filePath)}: ${JSON.stringify(matches)}`
      );
    }
  });

  it('links multi-track identical-end-time trimming, phase-locked left trimming, ganged mixer sliders, and batch track reorder across selected tracks', () => {
    const project = createEmptyProject({ name: 'Multi-Track Linked Trim & Gang', bpm: 120 });

    // 2 Overheads ending around 24.0s (with 107ms PipeWire stop jitter) + 4 ADAT Drum Mics ending identically at 18.795s
    const specs = [
      { name: 'Overhead L', dur: 24.107, gainDb: 0 },
      { name: 'Overhead R', dur: 24.0, gainDb: 1.5 },
      { name: 'Rack Tom 1', dur: 18.795, gainDb: -2.0 },
      { name: 'Rack Tom 2', dur: 18.795, gainDb: 0 },
      { name: 'Kick Drum', dur: 18.795, gainDb: 3.0 },
      { name: 'Floor Tom 1', dur: 18.795, gainDb: -1.0 },
    ];
    specs.forEach((sp, i) => {
      const tr = buildTrackFromWizard({ profileId: 'snare-top', name: sp.name });
      tr.gainDb = sp.gainDb;
      tr.clips.push({
        id: `clip-mt-${i}`,
        name: `${sp.name} Take`,
        startSec: 0,
        offsetSec: 0,
        durationSec: sp.dur,
        sourceDurationSec: sp.dur,
        peaks: [0.2, 0.6, 0.8, 0.5, 0.3],
        transients: [{ timeSec: 5.0, peakDb: -9.0, velocity: 0.8 }],
      });
      project.tracks.push(tr);
    });

    // Select ALL 6 tracks and drag right edge of Kick Drum (18.795s) by -3.795s -> should link ONLY the 4 identical-end-time 18.795s tracks!
    const allTrackIds = new Set(project.tracks.map(t => t.id));
    const linkedRight = DE.resolveLinkedClipsForOperation(project, {
      selectedTrackIds: allTrackIds,
      selectedClipIds: new Set(),
      anchorClipId: 'clip-mt-4', // Kick Drum (18.795s)
      mode: 'right',
    });
    assert.strictEqual(linkedRight.size, 4);
    assert.ok(!linkedRight.has('clip-mt-0') && !linkedRight.has('clip-mt-1'));
    assert.ok(linkedRight.has('clip-mt-2') && linkedRight.has('clip-mt-3') && linkedRight.has('clip-mt-4') && linkedRight.has('clip-mt-5'));

    const initRightMap = new Map();
    for (const tr of project.tracks) {
      for (const c of tr.clips) if (linkedRight.has(c.id)) initRightMap.set(c.id, DE.cloneDeep(c));
    }
    assert.strictEqual(
      DE.trimClipsBatch(project, initRightMap, linkedRight, 'right', -3.795, { anchorClipId: 'clip-mt-4' }),
      4
    );
    // All 4 trimmed tracks now end at exact 15.0000s; Overheads remain untouched at 24.107s / 24.0s
    assert.strictEqual(project.tracks[2].clips[0].durationSec, 15.0);
    assert.strictEqual(project.tracks[3].clips[0].durationSec, 15.0);
    assert.strictEqual(project.tracks[4].clips[0].durationSec, 15.0);
    assert.strictEqual(project.tracks[5].clips[0].durationSec, 15.0);
    assert.strictEqual(project.tracks[0].clips[0].durationSec, 24.107);
    assert.strictEqual(project.tracks[1].clips[0].durationSec, 24.0);

    // Dragging Overhead L (24.107s) right edge to 20.0s aligns both Overheads (within 150ms stop jitter) to exact 20.0s
    const linkedOverheads = DE.resolveLinkedClipsForOperation(project, {
      selectedTrackIds: new Set([project.tracks[0].id, project.tracks[1].id]),
      selectedClipIds: new Set(),
      anchorClipId: 'clip-mt-0',
      mode: 'right',
    });
    assert.strictEqual(linkedOverheads.size, 2);
    const initOhMap = new Map([
      ['clip-mt-0', DE.cloneDeep(project.tracks[0].clips[0])],
      ['clip-mt-1', DE.cloneDeep(project.tracks[1].clips[0])],
    ]);
    DE.trimClipsBatch(project, initOhMap, linkedOverheads, 'right', -4.107, { anchorClipId: 'clip-mt-0' });
    assert.strictEqual(project.tracks[0].clips[0].durationSec, 20.0);
    assert.strictEqual(project.tracks[1].clips[0].durationSec, 20.0);

    // Left-edge trim across all 6 tracks (all start at 0.0s) preserves sample-accurate phase lock (startSec === offsetSec === 2.0s)
    const linkedLeft = DE.resolveLinkedClipsForOperation(project, {
      selectedTrackIds: allTrackIds,
      selectedClipIds: new Set(),
      anchorClipId: 'clip-mt-4',
      mode: 'left',
    });
    assert.strictEqual(linkedLeft.size, 6);
    const initLeftMap = new Map(project.tracks.map(t => [t.clips[0].id, DE.cloneDeep(t.clips[0])]));
    DE.trimClipsBatch(project, initLeftMap, linkedLeft, 'left', 2.0, { anchorClipId: 'clip-mt-4' });
    for (const tr of project.tracks) {
      assert.strictEqual(tr.clips[0].startSec, 2.0);
      assert.strictEqual(tr.clips[0].offsetSec, 2.0);
    }

    // Trim End to Playhead ([ / ]) with ONLY selectedTrackIds (empty selectedClipIds) affects only selected tracks
    const twoTomTracks = new Set([project.tracks[2].id, project.tracks[3].id]);
    assert.strictEqual(DE.trimClipsToPlayhead(project, new Set(), 'right', 10.0, twoTomTracks), 2);
    assert.strictEqual(project.tracks[2].clips[0].durationSec, 8.0); // 2.0 -> 10.0
    assert.strictEqual(project.tracks[3].clips[0].durationSec, 8.0);
    assert.strictEqual(project.tracks[4].clips[0].durationSec, 13.0); // Kick untouched (2.0 -> 15.0)

    // Ganged numeric slider adjustment across selected tracks
    const startGains = new Map(project.tracks.map(t => [t.id, t.gainDb]));
    DE.adjustTracksNumericBatch(project, startGains, twoTomTracks, 'gainDb', 3.5, -24, 24, 1);
    assert.strictEqual(project.tracks[2].gainDb, 1.5); // -2.0 + 3.5
    assert.strictEqual(project.tracks[3].gainDb, 3.5); //  0.0 + 3.5
    assert.strictEqual(project.tracks[4].gainDb, 3.0); // untouched

    // Batch reorder selected tracks up together preserving relative order
    assert.strictEqual(DE.reorderTracksBatch(project, twoTomTracks, -1), true);
    assert.strictEqual(project.tracks[1].name, 'Rack Tom 1');
    assert.strictEqual(project.tracks[2].name, 'Rack Tom 2');
  });

  it('persists custom VST & sample directories, scans nested Samples/*.wav + VST3/LV2/CLAP bundles, and maps canonical + individual drum pieces', () => {
    const {
      addVstDirectory,
      removeVstDirectory,
      getConfiguredVstDirectoryPaths,
      getVstDirectoriesSnapshot,
    } = require('../lib/vst-directories');
    const { inspectInstalledKits } = require('../lib/drum-instruments');

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-vst-dirs-'));
    const prevCfgDir = process.env.ROBOS_DAW_CONFIG_DIR;
    process.env.ROBOS_DAW_CONFIG_DIR = path.join(tmpRoot, 'config');

    try {
      // 1. Create a realistic nested sample pack folder (like "[99Sounds] 99 Drum Samples/Samples/*.wav")
      const samplePackDir = path.join(tmpRoot, '[99Sounds] Test Drum Samples');
      const nestedSamplesDir = path.join(samplePackDir, 'Samples');
      fs.mkdirSync(nestedSamplesDir, { recursive: true });
      const wavBuf = synthesizeDrumTakeWav({ profileId: 'snare-top', durationSec: 0.25 });
      for (const fileName of [
        'kick-acoustic01.wav',
        'kick-808.wav',
        'snare-acoustic01.wav',
        'snare-punch.wav',
        'tom-acoustic01.wav',
        'tom-acoustic02.wav',
        'hihat-acoustic01.wav',
        'openhat-acoustic01.wav',
        'crash-acoustic.wav',
        'ride-acoustic01.wav',
        'cowbell-808.wav',
      ]) {
        fs.writeFileSync(path.join(nestedSamplesDir, fileName), wavBuf);
      }

      // 2. Create a custom plugin folder containing .vst3 bundle, .lv2 bundle, .clap, .so, and .sfz
      const customVstDir = path.join(tmpRoot, 'CustomPlugins');
      const vst3BundleInternal = path.join(customVstDir, 'FabProQ.vst3', 'Contents', 'x86_64-linux');
      const lv2BundleInternal = path.join(customVstDir, 'x42-eq.lv2');
      fs.mkdirSync(vst3BundleInternal, { recursive: true });
      fs.mkdirSync(lv2BundleInternal, { recursive: true });
      // Internal .so inside .vst3 / .lv2 bundles must NOT be double-counted as separate VST2 plugins
      fs.writeFileSync(path.join(vst3BundleInternal, 'FabProQ.so'), 'stub');
      fs.writeFileSync(path.join(lv2BundleInternal, 'x42-eq.so'), 'stub');
      fs.writeFileSync(path.join(customVstDir, 'SurgeXT.clap'), 'stub');
      fs.writeFileSync(path.join(customVstDir, 'AnalogComp.so'), 'stub');
      fs.writeFileSync(path.join(customVstDir, 'StudioKit.sfz'), 'stub');

      // Add both directories (plus duplicate add check)
      addVstDirectory(samplePackDir);
      addVstDirectory(samplePackDir); // deduplicated
      addVstDirectory(customVstDir);

      const configuredPaths = getConfiguredVstDirectoryPaths();
      assert.strictEqual(configuredPaths.length, 2);

      const snap = getVstDirectoriesSnapshot();
      assert.strictEqual(snap.totalCustomDirs, 2);
      assert.strictEqual(snap.totalCustomSamples, 11);

      const packSnap = snap.customDirectories.find(d => d.path === samplePackDir);
      assert.ok(packSnap);
      assert.strictEqual(packSnap.sampleCount, 11);
      assert.ok(packSnap.kitId.startsWith('custom-dir-'));

      const plugSnap = snap.customDirectories.find(d => d.path === customVstDir);
      assert.ok(plugSnap);
      assert.strictEqual(plugSnap.pluginCount, 5); // FabProQ (VST3), x42-eq (LV2), SurgeXT (CLAP), AnalogComp (VST2), StudioKit (SFZ)
      const formats = new Set(plugSnap.plugins.map(p => p.format));
      for (const fmt of ['VST3', 'LV2', 'CLAP', 'VST2', 'SFZ']) {
        assert.ok(formats.has(fmt), `Expected format ${fmt} to be discovered`);
      }

      // Verify inspectInstalledKits exposes the custom sample pack with canonical + individual pieces
      const kitsInfo = inspectInstalledKits();
      const customKit = kitsInfo.kits.find(k => k.id === packSnap.kitId);
      assert.ok(customKit, 'Expected custom sample directory to be indexed as an installed drum kit');
      assert.strictEqual(customKit.installed, true);
      assert.strictEqual(customKit.sampleCount, 11);
      // Canonical pieces prefer acoustic samples over 808
      assert.ok(customKit.pieces.kick.layers[0].localPath.endsWith('kick-acoustic01.wav'));
      assert.ok(customKit.pieces.snare.layers[0].localPath.endsWith('snare-acoustic01.wav'));
      assert.ok(customKit.pieces['tom-rack']);
      assert.ok(customKit.pieces.hihat);
      assert.ok(customKit.pieces['hihat-open']);
      assert.ok(customKit.pieces.cymbal);
      assert.ok(customKit.pieces.ride);
      // Every individual sample is also exposed for direct selection
      assert.ok(customKit.pieces['sample-kick-808']);
      assert.ok(customKit.pieces['sample-snare-punch']);
      assert.ok(customKit.pieces['sample-cowbell-808']);

      // Removing directory prunes it cleanly
      const rm = removeVstDirectory(samplePackDir);
      assert.strictEqual(rm.removed, true);
      assert.strictEqual(getConfiguredVstDirectoryPaths().length, 1);
    } finally {
      if (prevCfgDir === undefined) delete process.env.ROBOS_DAW_CONFIG_DIR;
      else process.env.ROBOS_DAW_CONFIG_DIR = prevCfgDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
