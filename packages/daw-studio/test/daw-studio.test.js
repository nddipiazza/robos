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
const { parseChannelTarget, makeWavHeader, ingestMonoPcmBuffer } = require('../lib/pcm-capture');
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

  it('defines 15 metal-viable open-source drum replacement archives without embedding WAV/FLAC binaries in git', () => {
    assert.strictEqual(OPEN_DRUMKIT_CATALOG.length, 15);
    const expectedIds = [
      'muldjord-death-metal',
      'muldjord-triggered-metal',
      'wilkinson-modern-metal',
      'smdrums-heavy-metal',
      'smdrums-hybrid-metalcore',
      'salamander-prog-metal',
      'salamander-thrash-metal',
      'avl-black-pearl-metal',
      'avl-red-zeppelin-metal',
      'big-rusty-doom-sludge',
      'big-rusty-djent-stack',
      'drs-contact-metal',
      'sonor-power-metal',
      'frankensnare-brass-thrash',
      'gm-rock-kit',
    ];
    assert.deepStrictEqual(OPEN_DRUMKIT_CATALOG.map(k => k.id), expectedIds);
    for (const kit of OPEN_DRUMKIT_CATALOG) {
      assert.ok(kit.genreTag && kit.genreTag.length >= 5, `Missing genreTag on ${kit.id}`);
      assert.ok(kit.pieces.kick && kit.pieces.kick.layers.length >= 2, `Missing multi-layer kick on ${kit.id}`);
      assert.ok(kit.pieces.snare && kit.pieces.snare.layers.length >= 2, `Missing multi-layer snare on ${kit.id}`);
      for (const piece of Object.values(kit.pieces)) {
        for (const layer of piece.layers) {
          assert.ok(layer.url.startsWith('https://'), `Invalid URL on ${kit.id}: ${layer.url}`);
          assert.ok(/\.(flac|wav)$/.test(layer.file), `Invalid sample extension on ${kit.id}: ${layer.file}`);
        }
      }
    }
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
      assert.strictEqual(project.metronome, false, 'Metronome must default to off');
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
      fs.writeFileSync(path.join(customVstDir, 'WinDrummer.dll'), 'stub');
      fs.writeFileSync(path.join(customVstDir, 'StudioKit.sfz'), 'stub');
      fs.writeFileSync(path.join(customVstDir, 'ExpansionPack.iso'), 'stub');
      fs.writeFileSync(path.join(customVstDir, 'soundb0.obw'), 'stub');
      fs.writeFileSync(path.join(customVstDir, 'KD01_locked.wav'), Buffer.from('RIFF\x24\x00\x00\x00ttpwfmt ', 'binary'));

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
      assert.strictEqual(plugSnap.pluginCount, 6); // FabProQ (VST3), x42-eq (LV2), SurgeXT (CLAP), AnalogComp (VST2), WinDrummer (VST2-WIN), StudioKit (SFZ)
      assert.strictEqual(plugSnap.archiveCount, 1); // ExpansionPack.iso flagged as unextracted archive
      assert.strictEqual(plugSnap.proprietarySoundbankCount, 2); // soundb0.obw + RIFF-ttpw wav excluded from raw sampleFiles
      assert.strictEqual(plugSnap.sampleCount, 0);
      const formats = new Set(plugSnap.plugins.map(p => p.format));
      for (const fmt of ['VST3', 'LV2', 'CLAP', 'VST2', 'VST2-WIN', 'SFZ']) {
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

  it('streams low-latency 20ms waveform slice peaks in real time across armed tracks while recording', async () => {
    // 1. Verify exact chunk-boundary PCM waveform slice accumulator (960 samples = 20ms @ 48kHz)
    const state = {
      slicePos: 0,
      slicePeak: 0,
      windowPeakLin: 0,
      maxPeakLin: 0,
      pendingPeaks: [],
    };
    const chunkA = Buffer.alloc(600 * 2); // 600 samples (partial slice)
    chunkA.writeInt16LE(16384, 200 * 2);  // 0.5000 peak
    ingestMonoPcmBuffer(state, chunkA, 960);
    assert.strictEqual(state.pendingPeaks.length, 0);
    assert.ok(Math.abs(state.slicePeak - 0.5) < 0.001, 'Partial tip peak should be immediately available');

    const chunkB = Buffer.alloc(1400 * 2); // +1400 samples -> 2000 total (completes 2 slices of 960 + 80 remainder)
    chunkB.writeInt16LE(-26214, 100 * 2);  // ~0.8000 peak inside slice 0
    chunkB.writeInt16LE(9830, 800 * 2);    // ~0.3000 peak inside slice 1
    chunkB.writeInt16LE(22938, 1380 * 2);  // ~0.7000 peak inside trailing partial slice 2
    ingestMonoPcmBuffer(state, chunkB, 960);
    assert.strictEqual(state.pendingPeaks.length, 2);
    assert.ok(Math.abs(state.pendingPeaks[0] - 0.8) < 0.002);
    assert.ok(Math.abs(state.pendingPeaks[1] - 0.3) < 0.002);
    assert.strictEqual(state.slicePos, 80);
    assert.ok(Math.abs(state.slicePeak - 0.7) < 0.002);

    // 2. Verify MultiTrackRecorder emits live streaming newPeaks deltas while recording BEFORE stop()
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-live-wave-'));
    const prevProjDir = process.env.ROBOS_DAW_PROJECTS_DIR;
    process.env.ROBOS_DAW_PROJECTS_DIR = tmpRoot;
    const recorder = new MultiTrackRecorder();
    try {
      const proj = createEmptyProject({ name: 'Live Waveform Test', sampleRate: 48000 });
      proj.tracks.push(
        buildTrackFromWizard({ profileId: 'kick-in', name: 'Kick In', armed: true }),
        buildTrackFromWizard({ profileId: 'snare-top', name: 'Snare Top', armed: true }),
        buildTrackFromWizard({ profileId: 'guitar-cab', name: 'Disarmed Gtr', armed: false })
      );

      const streamedEvents = [];
      const accumulatedByTrack = new Map();
      const started = recorder.start(proj, {
        startSec: 1.5,
        injectTestSignal: true,
        onMeter: (evt) => {
          streamedEvents.push(evt);
          for (const tr of evt.tracks) {
            const arr = accumulatedByTrack.get(tr.trackId) || [];
            arr.push(...(tr.newPeaks || []));
            accumulatedByTrack.set(tr.trackId, arr);
          }
        },
      });
      assert.strictEqual(started.ok, true);
      assert.strictEqual(started.armedCount, 2);
      assert.strictEqual(started.sliceDurationSec, 0.02);

      // Record ~720ms so both Kick (0.15s) and Snare backbeat (0.65s) stream live before stop()
      await new Promise(r => setTimeout(r, 720));
      assert.ok(streamedEvents.length >= 8, `Expected >=8 live progress flushes within 720ms, got ${streamedEvents.length}`);
      for (const t of started.tracks) {
        const livePeaks = accumulatedByTrack.get(t.trackId) || [];
        assert.ok(livePeaks.length >= 25, `Expected >=25 live 20ms waveform slices for ${t.trackName}, got ${livePeaks.length}`);
        assert.ok(livePeaks.some(p => p > 0.25), `Expected visible drum transient peak in live stream for ${t.trackName}`);
      }

      const stopped = await recorder.stop({ injectTestSignal: true });
      assert.strictEqual(stopped.ok, true);
      assert.strictEqual(stopped.recordedClips.length, 2);
    } finally {
      if (recorder.isRecording()) await recorder.stop();
      if (prevProjDir === undefined) delete process.env.ROBOS_DAW_PROJECTS_DIR;
      else process.env.ROBOS_DAW_PROJECTS_DIR = prevProjDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('supports REAPER tracking operations: abort & discard pass, live markers, overlapping take comping (T / Shift+T / Alt+Shift+T), and fade-to-cursor', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-reaper-'));
    const prevProjDir = process.env.ROBOS_DAW_PROJECTS_DIR;
    const prevCfgDir = process.env.ROBOS_DAW_CONFIG_DIR;
    process.env.ROBOS_DAW_PROJECTS_DIR = path.join(tmpRoot, 'projects');
    process.env.ROBOS_DAW_CONFIG_DIR = path.join(tmpRoot, 'config');
    const recorder = new MultiTrackRecorder();
    try {
      const proj = createEmptyProject({ name: 'REAPER Tracking Test', bpm: 120 });
      const tr = buildTrackFromWizard({ profileId: 'snare-top', name: 'Snare Top', armed: true });
      proj.tracks.push(tr);

      // 1. Abort Recording (Alt+Backspace / Ctrl+.): deletes incomplete WAV and adds zero clips
      const started = recorder.start(proj, { startSec: 2.0, injectTestSignal: true });
      assert.strictEqual(started.ok, true);
      const pendingWav = started.tracks[0].wavFile;
      assert.ok(fs.existsSync(pendingWav));
      await new Promise(r => setTimeout(r, 120));
      const canceled = await recorder.cancel();
      assert.strictEqual(canceled.ok, true);
      assert.strictEqual(canceled.canceled, true);
      assert.strictEqual(canceled.deletedFiles, 1);
      assert.strictEqual(fs.existsSync(pendingWav), false);
      assert.strictEqual(tr.clips.length, 0);

      // 2. Overlapping Take Comping (T / Shift+T) + Crop to Active Take (Alt+Shift+T)
      tr.clips.push(
        { id: 'pass-1', name: 'Pass 1', startSec: 1.0, offsetSec: 0, durationSec: 4.0, sourceDurationSec: 4.0, muted: false },
        { id: 'pass-2', name: 'Pass 2', startSec: 1.0, offsetSec: 0, durationSec: 4.0, sourceDurationSec: 4.0, muted: true },
        { id: 'pass-3', name: 'Pass 3', startSec: 1.0, offsetSec: 0, durationSec: 4.0, sourceDurationSec: 4.0, muted: true }
      );
      let comp = DE.cycleOverlappingTake(proj, new Set([tr.id]), 2.5, 1); // T -> Pass 2
      assert.strictEqual(comp.takeNumber, 2);
      assert.strictEqual(comp.totalTakes, 3);
      assert.deepStrictEqual(tr.clips.map(c => c.muted), [true, false, true]);

      comp = DE.cycleOverlappingTake(proj, new Set([tr.id]), 2.5, -1); // Shift+T -> back to Pass 1
      assert.strictEqual(comp.takeNumber, 1);
      assert.deepStrictEqual(tr.clips.map(c => c.muted), [false, true, true]);

      comp = DE.cycleOverlappingTake(proj, new Set([tr.id]), 2.5, 1); // T -> Pass 2 wins!
      assert.strictEqual(DE.cropToActiveTake(proj, new Set([tr.id]), 2.5), 2);
      assert.strictEqual(tr.clips.length, 1);
      assert.strictEqual(tr.clips[0].id, 'pass-2');

      // 3. Fade-In / Fade-Out to Playhead (Alt+F / Alt+G)
      assert.strictEqual(DE.fadeClipsToPlayhead(proj, new Set(['pass-2']), new Set([tr.id]), 'in', 1.75), 1);
      assert.strictEqual(tr.clips[0].fadeInSec, 0.75);
      assert.strictEqual(DE.fadeClipsToPlayhead(proj, new Set(['pass-2']), new Set([tr.id]), 'out', 4.5), 1);
      assert.strictEqual(tr.clips[0].fadeOutSec, 0.5);

      // 4. Project Markers (Shift+M / Insert), Marker Jump (Alt+1..9), Item/Marker Edge Jump (; / '), End (5.0s)
      const m1 = DE.addProjectMarker(proj, 2.0, 'Verse');
      const m2 = DE.addProjectMarker(proj, 4.0, 'Fill');
      assert.strictEqual(m1.num, 1);
      assert.strictEqual(m2.num, 2);
      assert.strictEqual(DE.jumpToProjectMarkerByNumber(proj, 2), 4.0);
      assert.strictEqual(DE.getProjectEndSec(proj), 5.0);
      // Points are [0, 1.0, 2.0, 4.0, 5.0]
      assert.strictEqual(DE.findAdjacentTimelinePoint(proj, 1.0, 1), 2.0);
      assert.strictEqual(DE.findAdjacentTimelinePoint(proj, 4.0, -1), 2.0);

      // Verify markers persist across saveProject / loadProject
      const saved = saveProject(proj);
      const reloaded = loadProject(saved.project.id);
      assert.strictEqual(reloaded.project.markers.length, 2);
      assert.strictEqual(reloaded.project.markers[0].name, 'Verse');
      assert.strictEqual(reloaded.project.markers[1].timeSec, 4.0);
    } finally {
      if (recorder.isRecording()) await recorder.cancel();
      if (prevProjDir === undefined) delete process.env.ROBOS_DAW_PROJECTS_DIR;
      else process.env.ROBOS_DAW_PROJECTS_DIR = prevProjDir;
      if (prevCfgDir === undefined) delete process.env.ROBOS_DAW_CONFIG_DIR;
      else process.env.ROBOS_DAW_CONFIG_DIR = prevCfgDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('preserves 5-decimal precision on quiet -46.7 dBFS drum transients across live streaming and saved takes', () => {
    const { ingestMonoPcmBuffer, makeWavHeader } = require('../lib/pcm-capture');
    const sliceSamples = 960; // 20ms @ 48kHz
    const pcmData = Buffer.alloc(sliceSamples * 4 * 2); // 4 slices (80ms)
    // Slice 0: -80 dBFS preamp floor (sample = 3)
    pcmData.writeInt16LE(3, 10);
    // Slice 1: -46.7 dBFS quiet kick drum transient (sample = 152 -> 0.00464 linear)
    pcmData.writeInt16LE(152, sliceSamples * 2 + 20);

    const st = {
      slicePos: 0,
      slicePeak: 0,
      pendingPeaks: [],
      windowPeakLin: 0,
      maxPeakLin: 0,
    };
    ingestMonoPcmBuffer(st, pcmData, sliceSamples);
    assert.strictEqual(st.pendingPeaks.length, 4);
    assert.strictEqual(st.pendingPeaks[0], 0.00009); // -80 dBFS floor kept below -68 dBFS gate
    assert.strictEqual(st.pendingPeaks[1], 0.00464); // -46.7 dBFS kick transient preserved accurately

    const wav = Buffer.concat([makeWavHeader(pcmData.length, 48000), pcmData]);
    const waveInfo = computeWaveformPeaks(wav, 4);
    assert.strictEqual(waveInfo.peakDb, -46.7);
    assert.strictEqual(waveInfo.peaks[1], 0.00464);

    // Verify smart auto-gain staging and adaptive crest-factor drum transient detection on quiet -46.7 dBFS takes
    const { computeSmartAutoGainDb } = require('../lib/drum-instruments');
    const twoSecSamples = 48000 * 2;
    const quietKickPcm = Buffer.alloc(twoSecSamples * 2);
    for (let i = 0; i < twoSecSamples; i++) {
      quietKickPcm.writeInt16LE((i % 2 === 0) ? 2 : -2, i * 2); // ~ -84 dBFS preamp noise floor
    }
    for (const hitSec of [0.25, 0.75, 1.25, 1.75]) {
      const idx0 = Math.floor(hitSec * 48000);
      for (let k = 0; k < 480; k++) {
        const env = Math.exp(-k / 140);
        const s = Math.round(152 * env * Math.sin(2 * Math.PI * 60 * (k / 48000)));
        quietKickPcm.writeInt16LE(s, (idx0 + k) * 2);
      }
    }
    const quietKickWav = Buffer.concat([makeWavHeader(quietKickPcm.length, 48000), quietKickPcm]);
    const stagedDb = computeSmartAutoGainDb(quietKickWav);
    assert.ok(stagedDb >= 30 && stagedDb <= 36, `expected +30..+36 dB auto-gain on -46.7 dBFS kick stem, got ${stagedDb}`);
    const quietHits = detectDrumTransients(quietKickWav, { thresholdDb: -28, minIntervalMs: 75 });
    assert.strictEqual(quietHits.length, 4);

    // Pure room hiss without transients must NEVER get boosted
    const roomOnlyWav = Buffer.concat([makeWavHeader(Buffer.alloc(48000 * 2), 48000), Buffer.alloc(48000 * 2)]);
    assert.strictEqual(computeSmartAutoGainDb(roomOnlyWav), 0);
  });

  it('unifies Focusrite Analog UCM split sources and ADAT Direct2 onto a single 20ch hw_USB_0 clock with zero inter-track delay', () => {
    const { parsePwDumpSplitMap } = require('../lib/pcm-capture');
    const mockDump = JSON.stringify([
      {
        info: {
          props: {
            'media.class': 'Audio/Source',
            'node.name': 'alsa_input.usb-Focusrite_Scarlett_18i20.HiFi__Line9__source',
            'api.alsa.split.name': 'alsa_input.hw_USB_0',
            'api.alsa.split.hw-position': '[AUX0,AUX1,AUX2,AUX3,AUX4,AUX5,AUX6,AUX7,AUX8,AUX9,AUX10,AUX11,AUX12,AUX13,AUX14,AUX15,AUX16,AUX17,AUX18,AUX19]',
            'api.alsa.split.position': '[AUX3]',
          },
        },
      },
      {
        info: {
          props: {
            'media.class': 'Audio/Source',
            'node.name': 'alsa_input.usb-Focusrite_Scarlett_18i20.HiFi__Direct2__source',
            'api.alsa.split.name': 'alsa_input.hw_USB_0',
            'api.alsa.split.hw-position': '[AUX0,AUX1,AUX2,AUX3,AUX4,AUX5,AUX6,AUX7,AUX8,AUX9,AUX10,AUX11,AUX12,AUX13,AUX14,AUX15,AUX16,AUX17,AUX18,AUX19]',
            'api.alsa.split.position': '[AUX12,AUX13,AUX14,AUX15,AUX16,AUX17,AUX18,AUX19]',
          },
        },
      },
    ]);
    const map = parsePwDumpSplitMap(mockDump);
    assert.deepStrictEqual(map.get('alsa_input.usb-Focusrite_Scarlett_18i20.HiFi__Line9__source'), {
      parentNodeName: 'alsa_input.hw_USB_0',
      totalChannels: 20,
      indices: [3],
    });
    assert.deepStrictEqual(map.get('alsa_input.usb-Focusrite_Scarlett_18i20.HiFi__Direct2__source'), {
      parentNodeName: 'alsa_input.hw_USB_0',
      totalChannels: 20,
      indices: [12, 13, 14, 15, 16, 17, 18, 19],
    });
  });

  it('imports MP3, FLAC, OGG, and MP4/WebM video files into 24-bit session WAVs and parses dropped file URIs', async () => {
    const { execFileSync } = require('child_process');
    const {
      ALL_MEDIA_EXTENSIONS,
      classifyMediaExtension,
      parseDroppedUriList,
      importMediaFileToWav,
    } = require('../lib/media-importer');

    assert.ok(ALL_MEDIA_EXTENSIONS.includes('mp3'));
    assert.ok(ALL_MEDIA_EXTENSIONS.includes('mp4'));
    assert.ok(ALL_MEDIA_EXTENSIONS.includes('mkv'));
    assert.ok(ALL_MEDIA_EXTENSIONS.includes('webm'));
    assert.ok(ALL_MEDIA_EXTENSIONS.includes('flac'));
    assert.strictEqual(classifyMediaExtension('/tmp/backing track.MP3'), 'audio');
    assert.strictEqual(classifyMediaExtension('/tmp/drum_playthrough.mp4'), 'video');
    assert.deepStrictEqual(
      parseDroppedUriList('file:///home/user/My%20Song.mp3\r\n# comment\r\nfile:///home/user/video.mp4\r\n'),
      ['/home/user/My Song.mp3', '/home/user/video.mp4']
    );

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-media-import-'));
    try {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.45', path.join(tmpDir, 'backing.mp3')]);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=0.45', path.join(tmpDir, 'stem.flac')]);
      execFileSync('ffmpeg', [
        '-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'testsrc=size=128x96:rate=15:duration=0.5',
        '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.5',
        '-shortest',
        path.join(tmpDir, 'playthrough.mp4'),
      ]);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=128x96:rate=15:duration=0.35', '-an', path.join(tmpDir, 'silent.mp4')]);

      const mp3Res = await importMediaFileToWav(path.join(tmpDir, 'backing.mp3'), path.join(tmpDir, 'out-mp3.wav'));
      assert.strictEqual(mp3Res.ok, true);
      assert.strictEqual(mp3Res.mediaKind, 'audio');
      const mp3Peaks = computeWaveformPeaks(fs.readFileSync(mp3Res.destWavPath), 48);
      assert.ok(mp3Peaks.durationSec >= 0.4 && mp3Peaks.peakDb > -30);

      const mp4Res = await importMediaFileToWav(path.join(tmpDir, 'playthrough.mp4'), path.join(tmpDir, 'out-mp4.wav'));
      assert.strictEqual(mp4Res.ok, true);
      assert.strictEqual(mp4Res.mediaKind, 'video');
      const mp4Peaks = computeWaveformPeaks(fs.readFileSync(mp4Res.destWavPath), 48);
      assert.ok(mp4Peaks.durationSec >= 0.45 && mp4Peaks.peakDb > -30);

      await assert.rejects(
        () => importMediaFileToWav(path.join(tmpDir, 'silent.mp4'), path.join(tmpDir, 'out-silent.wav')),
        /no audio track/i
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('aligns overdubbed takes to backing-track headphone presentation timestamps with sub-millisecond accuracy', () => {
    const { alignRecordedWavBuffer } = require('../lib/session-manager');

    // Case 1: pw-cat began capturing at wall 1000ms; backing track 0.000s reached headphones at 1125ms (+125ms pre-roll + RTL).
    // Drummer strikes snare in sync with backing beat at 1.000s (wall 2125ms -> raw WAV offset 1.125s).
    const rawWav = synthesizeDrumTakeWav({
      profileId: 'snare-top',
      durationSec: 2.2,
      sampleRate: 48000,
      hitTimesSec: [1.125],
    });
    const aligned = alignRecordedWavBuffer(rawWav, {
      punchStartSec: 4.0,
      sampleRate: 48000,
      firstSampleMicWallMs: 1000,
      earsStartWallMs: 1125,
    });
    assert.strictEqual(aligned.clipStartSec, 4.0);
    assert.strictEqual(aligned.trimmedSec, 0.125);
    const hits = detectDrumTransients(aligned.buffer, { thresholdDb: -28, minIntervalMs: 65 });
    assert.ok(hits.length >= 1, 'Expected detected snare transient after pre-roll alignment');
    assert.ok(Math.abs(hits[0].timeSec - 1.0) <= 0.006, `Expected snare hit aligned to 1.000s, got ${hits[0].timeSec}s`);

    // Case 2: capture started 40ms AFTER backing track reached headphones -> shifts clipStartSec +0.040s
    const lateWav = synthesizeDrumTakeWav({
      profileId: 'snare-top',
      durationSec: 2.0,
      sampleRate: 48000,
      hitTimesSec: [0.96],
    });
    const lateAligned = alignRecordedWavBuffer(lateWav, {
      punchStartSec: 4.0,
      sampleRate: 48000,
      firstSampleMicWallMs: 1040,
      earsStartWallMs: 1000,
    });
    assert.strictEqual(lateAligned.clipStartSec, 4.04);
  });

  it('generates a Gemini-preferred beat-locked click track directly below the target track with a 1-measure count-off', async () => {
    const { generateAlignedClickTrackForProject } = require('../lib/click-track-generator');
    const tmpClickDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-click-unit-'));
    try {
      const bpm = 128;
      const beatSec = 60 / bpm; // 0.46875s -> 1 bar (4/4) = 1.875s
      const hits = [];
      for (let b = 0; b < 32; b++) hits.push(0.35 + b * beatSec);
      const wavFile = path.join(tmpClickDir, 'backing-groove.wav');
      fs.writeFileSync(wavFile, synthesizeDrumTakeWav({
        profileId: 'kick-in',
        durationSec: 16.5,
        sampleRate: 48000,
        hitTimesSec: hits,
      }));

      const proj = createEmptyProject({ name: 'Click Generator Test', bpm: 120 });
      const backingTrack = buildTrackFromWizard({ profileId: 'acoustic-inst', name: 'Backing Song', armed: false });
      backingTrack.soloed = true;
      backingTrack.clips.push({ id: 'c-song', name: 'Backing Song', wavFile, startSec: 0, durationSec: 16.5 });
      const drumTrack = buildTrackFromWizard({ profileId: 'snare-top', name: 'Snare Top', armed: true });
      proj.tracks.push(backingTrack, drumTrack);

      const calledProviders = [];
      const mockAgent = {
        PROVIDERS: [{ id: 'copilot' }, { id: 'antigravity' }],
        PROVIDER_MAP: {
          antigravity: { id: 'antigravity', name: 'Gemini (Antigravity)' },
          copilot: { id: 'copilot', name: 'GitHub Copilot' },
        },
        getActiveProviderId: () => 'copilot',
        ask: async (_prompt, opts) => {
          calledProviders.push(opts.providerId);
          assert.ok(fs.existsSync(path.join(opts.cwd, 'beat-analysis.json')));
          assert.ok(fs.existsSync(path.join(opts.cwd, 'track-excerpt.wav')));
          return {
            ok: true,
            provider: opts.providerId,
            text: JSON.stringify({
              bpm: 128,
              beatsPerBar: 4,
              noteValue: 4,
              subdivision: 'quarter',
              reasoning: 'Tight 128 BPM 4/4 rock groove.',
            }),
          };
        },
      };

      const res = await generateAlignedClickTrackForProject(proj, backingTrack.id, {
        takesDir: tmpClickDir,
        aiAgentModule: mockAgent,
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(calledProviders[0], 'antigravity', 'Must prefer Gemini (antigravity) provider first');
      assert.strictEqual(res.bpm, 128);
      assert.strictEqual(res.timeSignature, '4/4');
      // Inserted directly under Backing Song (index 1, pushing Snare Top to index 2)
      assert.strictEqual(proj.tracks[0].id, backingTrack.id);
      assert.strictEqual(proj.tracks[1].id, res.clickTrack.id);
      assert.strictEqual(proj.tracks[2].id, drumTrack.id);
      assert.strictEqual(res.clickTrack.armed, false);
      assert.strictEqual(res.clickTrack.soloed, true, 'Inherits solo visibility when session has soloed tracks');

      // Song originally started at 0.35s (< 1.875s measure), so session shifted forward cleanly to fit 1-bar count-in at 0.10s
      const expectedDownbeat = Number((backingTrack.clips[0].startSec + 0.35).toFixed(4));
      assert.ok(Math.abs(res.firstDownbeatSec - expectedDownbeat) <= 0.005, `Expected downbeat ~${expectedDownbeat}s, got ${res.firstDownbeatSec}s`);
      assert.ok(Math.abs((res.firstDownbeatSec - res.countInStartSec) - (4 * beatSec)) <= 0.002, '1-measure count-off must precede Beat 1 by exactly 4 beats');
      assert.ok(fs.existsSync(res.clickClip.wavFile));

      // Verify multi-tempo arrangement tracking (120 BPM for 20s -> 150 BPM for 20s)
      const { analyzeAudioBeatGrid } = require('../lib/click-track-generator');
      const sr16 = 16000;
      const multiMono = new Float32Array(sr16 * 40);
      const stampHit = (sec, freq) => {
        const s0 = Math.round(sec * sr16);
        for (let i = 0; i < Math.min(800, multiMono.length - s0); i++) {
          const t = i / sr16;
          multiMono[s0 + i] += 0.85 * Math.sin(2 * Math.PI * freq * t) * Math.exp(-55 * t);
        }
      };
      for (let b = 0; b < 38; b++) {
        stampHit(1.0 + b * 0.5, (b % 4 === 0) ? 75 : 420); // 120 BPM (0.5s beat) across 1s..20s
      }
      for (let b = 0; b < 46; b++) {
        stampHit(20.0 + b * 0.4, (b % 4 === 0) ? 75 : 420); // 150 BPM (0.4s beat) across 20s..38.4s
      }
      const multiGrid = analyzeAudioBeatGrid(multiMono, { earliestStartSec: 0 });
      assert.strictEqual(multiGrid.isMultiTempo, true, 'Must detect multi-tempo section change');
      assert.strictEqual(multiGrid.segments.length, 2);
      assert.ok(Math.abs(multiGrid.segments[0].bpm - 120) <= 0.5, `Expected Seg 0 ~120 BPM, got ${multiGrid.segments[0].bpm}`);
      assert.ok(Math.abs(multiGrid.segments[1].bpm - 150) <= 0.5, `Expected Seg 1 ~150 BPM, got ${multiGrid.segments[1].bpm}`);
    } finally {
      fs.rmSync(tmpClickDir, { recursive: true, force: true });
    }
  });

  it('removes drums via Gemini-preferred agent + separator into a new track directly below with exact matching startSec & duration', async () => {
    const { removeDrumsFromTrackInProject } = require('../lib/drum-remover');
    const tmpRmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-rm-drums-'));
    try {
      const wavFile = path.join(tmpRmDir, 'full-song.wav');
      fs.writeFileSync(wavFile, synthesizeDrumTakeWav({
        profileId: 'snare-top',
        durationSec: 2.5,
        sampleRate: 48000,
      }));

      const proj = createEmptyProject({ name: 'Remove Drums Test', bpm: 120 });
      const songTrack = buildTrackFromWizard({ profileId: 'acoustic-inst', name: 'Master Song', armed: false });
      songTrack.soloed = true;
      songTrack.clips.push({
        id: 'c-master',
        name: 'Master Song [MP3]',
        wavFile,
        startSec: 7.425,
        offsetSec: 0.15,
        durationSec: 2.1,
        sourceDurationSec: 2.5,
        gainDb: -1.5,
        fadeInSec: 0.02,
        fadeOutSec: 0.08,
      });
      const kickTrack = buildTrackFromWizard({ profileId: 'kick-in', name: 'Kick In', armed: true });
      proj.tracks.push(songTrack, kickTrack);

      const calledProviders = [];
      const mockAgent = {
        PROVIDERS: [{ id: 'copilot' }, { id: 'antigravity' }],
        PROVIDER_MAP: {
          antigravity: { id: 'antigravity', name: 'Gemini (Antigravity)' },
          copilot: { id: 'copilot', name: 'GitHub Copilot' },
        },
        getActiveProviderId: () => 'copilot',
        ask: async (_prompt, opts) => {
          calledProviders.push(opts.providerId);
          assert.ok(fs.existsSync(path.join(opts.cwd, 'stem-drum-telemetry.json')));
          return {
            ok: true,
            provider: opts.providerId,
            text: JSON.stringify({
              compensation: 1.035,
              suggestedTrackName: 'Master Song (No Drums)',
              reasoning: 'Aggressive rock drum kit subtracted cleanly.',
            }),
          };
        },
      };

      const res = await removeDrumsFromTrackInProject(proj, songTrack.id, {
        takesDir: tmpRmDir,
        aiAgentModule: mockAgent,
        forceHpss: true,
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(calledProviders[0], 'antigravity', 'Must prefer Gemini (antigravity) first');
      assert.strictEqual(proj.tracks[0].id, songTrack.id);
      assert.strictEqual(proj.tracks[0].muted, true, 'Original drum-containing stem muted automatically');
      assert.strictEqual(proj.tracks[1].id, res.drumlessTrack.id, 'Inserted directly underneath source track');
      assert.strictEqual(proj.tracks[2].id, kickTrack.id);

      const newClip = res.drumlessTrack.clips[0];
      assert.strictEqual(newClip.startSec, 7.425, 'Exact startSec match');
      assert.strictEqual(newClip.offsetSec, 0.15, 'Exact offsetSec match');
      assert.strictEqual(newClip.durationSec, 2.1, 'Exact durationSec match');
      assert.strictEqual(newClip.fadeInSec, 0.02);
      assert.strictEqual(newClip.fadeOutSec, 0.08);
      assert.ok(fs.existsSync(newClip.wavFile));
    } finally {
      fs.rmSync(tmpRmDir, { recursive: true, force: true });
    }
  });

  it('exports stereo mixdowns to MP3, WAV (24-bit), FLAC, M4A, OGG, Opus, and AIFF via FFmpeg', async () => {
    const {
      MIXDOWN_FORMATS,
      ensureFormatExtension,
      transcodeMixdownBuffer,
    } = require('../lib/mixdown-exporter');
    const { probeMediaStreams } = require('../lib/media-importer');

    assert.ok(MIXDOWN_FORMATS.length >= 7);
    assert.strictEqual(ensureFormatExtension('/tmp/song-mixdown.wav', 'mp3'), '/tmp/song-mixdown.mp3');
    assert.strictEqual(ensureFormatExtension('/tmp/song-mixdown', 'flac'), '/tmp/song-mixdown.flac');

    const tmpExpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-mixdown-formats-'));
    try {
      const srcWav = synthesizeDrumTakeWav({ profileId: 'snare-top', durationSec: 1.25, sampleRate: 48000 });
      for (const [format, quality, expectedCodecRe] of [
        ['mp3', '320k', /mp3/i],
        ['wav', 'pcm_s24le', /pcm_s24le/i],
        ['flac', '24bit', /flac/i],
        ['m4a', '256k', /aac/i],
        ['ogg', 'q8', /vorbis/i],
        ['opus', '192k', /opus/i],
        ['aiff', 'pcm_s24be', /pcm_s24be/i],
      ]) {
        const out = await transcodeMixdownBuffer(srcWav, {
          outPath: path.join(tmpExpDir, `master.${format}`),
          format,
          quality,
          sampleRate: 48000,
          title: 'RobOS Mixdown Test',
        });
        assert.strictEqual(out.ok, true);
        assert.ok(fs.existsSync(out.filePath), `Expected ${out.filePath} to exist`);
        assert.ok(out.bytes > 1000, `Expected non-empty ${format} output`);
        const probe = await probeMediaStreams(out.filePath);
        assert.match(probe.audioCodec, expectedCodecRe);
        assert.ok(Math.abs(probe.durationSec - 1.25) < 0.15, `Expected ~1.25s duration for ${format}, got ${probe.durationSec}s`);
      }
    } finally {
      fs.rmSync(tmpExpDir, { recursive: true, force: true });
    }
  });

  it('discovers RobOS Android IP Cameras & V4L2 devices, defaults to HD quality with optional audio, and persists MP4 clips', async () => {
    const http = require('http');
    const {
      DEFAULT_VIDEO_QUALITY,
      VIDEO_QUALITY_PRESETS,
      probeRobosIpCameraStatus,
      controlRobosIpCamera,
      readCameraWatchSavedSources,
      listLocalV4l2VideoDevices,
      buildVideoTrack,
      probeVideoFileInfo,
      VideoTrackRecorder,
    } = require('../lib/video-devices');
    const { importMediaFileToWav } = require('../lib/media-importer');

    assert.strictEqual(DEFAULT_VIDEO_QUALITY, 'hd-1080p');
    assert.ok(VIDEO_QUALITY_PRESETS.some(p => p.id === 'hd-1080p' && p.isHd === true));
    assert.ok(VIDEO_QUALITY_PRESETS.some(p => p.id === 'hd-720p' && p.isHd === true));

    const tmpVidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-video-mode-'));
    let mockCamSrv = null;
    try {
      // 0. Verify live RobOS IP Camera /api/ping, /api/status, and /api/control protocol
      let lastControlCmd = null;
      mockCamSrv = http.createServer((req, res) => {
        if (req.url === '/api/ping') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ app: 'robos-ip-camera', name: 'Studio Phone Cam', room: 'Drum Room', authRequired: false }));
          return;
        }
        if (req.url === '/api/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            app: 'robos-ip-camera',
            name: 'Studio Phone Cam',
            room: 'Drum Room',
            manufacturer: 'RobOS',
            model: 'motorola XT2125-4',
            live: true,
            state: 'live',
            width: 1920,
            height: 1080,
            fps: 30,
            targetFps: 30,
            lensFacing: lastControlCmd?.lens || 'BACK',
            torchEnabled: Boolean(lastControlCmd?.toggleTorch),
            batteryPercent: 84,
            charging: true,
          }));
          return;
        }
        if (req.url === '/api/control' && req.method === 'POST') {
          let body = '';
          req.on('data', c => { body += c; });
          req.on('end', () => {
            lastControlCmd = JSON.parse(body || '{}');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }
        res.writeHead(404);
        res.end();
      });
      await new Promise(resolve => mockCamSrv.listen(0, '127.0.0.1', resolve));
      const mockPort = mockCamSrv.address().port;

      const probed = await probeRobosIpCameraStatus('127.0.0.1', { port: mockPort });
      assert.strictEqual(probed.ok, true);
      assert.strictEqual(probed.source.sourceType, 'robos-ip-camera');
      assert.strictEqual(probed.source.qualityPreset, 'hd-1080p');
      assert.strictEqual(probed.source.streamUrl, `http://127.0.0.1:${mockPort}/video`);
      assert.strictEqual(probed.status.width, 1920);
      assert.strictEqual(probed.status.batteryPercent, 84);

      const {
        withRobosCleanStreamParam,
      } = require('../lib/video-devices');
      assert.strictEqual(withRobosCleanStreamParam('http://192.168.1.65:8080/video'), 'http://192.168.1.65:8080/video?timestamp=0');
      assert.strictEqual(withRobosCleanStreamParam('http://192.168.1.65:8080/video?timestamp=0'), 'http://192.168.1.65:8080/video?timestamp=0');

      const ctrlRes = await controlRobosIpCamera(probed.source, { lens: 'FRONT', toggleTorch: true, resolution: 'FHD_1080P', overlayTimestamp: false });
      assert.strictEqual(ctrlRes.ok, true);
      assert.strictEqual(ctrlRes.status.lensFacing, 'FRONT');
      assert.strictEqual(lastControlCmd.resolution, 'FHD_1080P');
      assert.strictEqual(lastControlCmd.overlayTimestamp, false);

      // 1. Verify Camera Watch + RobOS Android IP Camera discovery upgrades /sub to HD /video by default
      const mockCwJson = path.join(tmpVidDir, 'cameras.json');
      fs.writeFileSync(mockCwJson, JSON.stringify({
        version: 1,
        cameras: [
          {
            id: 'cam-android',
            name: 'XT2125-4 Drum Cam',
            kind: 'onvif',
            enabled: true,
            streamUrl: 'http://192.168.1.65:8080/sub',
            snapshotUrl: 'http://192.168.1.65:8080/snapshot.jpg',
            onvif: { hostname: '192.168.1.65', port: 8080, manufacturer: 'RobOS', model: 'motorola XT2125-4' },
          },
          {
            id: 'cam-win-only',
            name: 'Windows DShow Cam',
            kind: 'device',
            enabled: true,
            device: { format: 'dshow', name: 'OBSBOT' },
          },
        ],
      }));
      const cwSources = readCameraWatchSavedSources(mockCwJson);
      assert.strictEqual(cwSources.length, 1);
      assert.strictEqual(cwSources[0].sourceType, 'robos-ip-camera');
      assert.strictEqual(cwSources[0].isRobosAndroidCam, true);
      assert.strictEqual(cwSources[0].qualityPreset, 'hd-1080p');
      assert.strictEqual(cwSources[0].streamUrl, 'http://192.168.1.65:8080/video');

      const fakeDev = path.join(tmpVidDir, 'dev');
      const fakeSys = path.join(tmpVidDir, 'sys');
      fs.mkdirSync(path.join(fakeSys, 'video0'), { recursive: true });
      fs.mkdirSync(path.join(fakeSys, 'video1'), { recursive: true });
      fs.mkdirSync(fakeDev, { recursive: true });
      fs.writeFileSync(path.join(fakeDev, 'video0'), '');
      fs.writeFileSync(path.join(fakeDev, 'video1'), '');
      fs.writeFileSync(path.join(fakeSys, 'video0', 'name'), 'Studio Overhead UVC');
      fs.writeFileSync(path.join(fakeSys, 'video0', 'index'), '0\n');
      fs.writeFileSync(path.join(fakeSys, 'video1', 'name'), 'Studio Overhead UVC');
      fs.writeFileSync(path.join(fakeSys, 'video1', 'index'), '1\n');
      const v4lList = listLocalV4l2VideoDevices(fakeDev, fakeSys);
      assert.strictEqual(v4lList.length, 1);
      assert.strictEqual(v4lList[0].shortName, 'Studio Overhead UVC');

      // 2. Test Video-Only Recording (`audioMode: 'none'`, 0 audio tracks armed!)
      const projDir = path.join(tmpVidDir, 'vid-proj');
      const proj = createEmptyProject({ name: 'Drum Cam Video Session', sampleRate: 48000 });
      proj.projectDir = projDir;
      const vidOnlyTrack = buildVideoTrack({
        name: 'Moto G100 Drum Cam',
        videoConfig: cwSources[0],
        audioMode: 'none',
        armed: true,
      });
      const vidStreamAudioTrack = buildVideoTrack({
        name: 'Overhead Cam + Stream Mic',
        videoConfig: cwSources[0],
        audioMode: 'stream',
        armed: true,
      });
      proj.tracks.push(vidOnlyTrack, vidStreamAudioTrack);

      const audioRec = new MultiTrackRecorder();
      const vidRec = new VideoTrackRecorder();
      const startAudio = audioRec.start(proj, { startSec: 2.0, injectTestSignal: true });
      const startVid = vidRec.start(proj, { startSec: 2.0, injectTestSignal: true });
      assert.strictEqual(startAudio.ok, true);
      assert.strictEqual(startVid.armedVideoCount, 2);

      await new Promise(r => setTimeout(r, 420));
      const stopAudio = await audioRec.stop({ injectTestSignal: true });
      const stopVid = await vidRec.stop({
        injectTestSignal: true,
        audioRecordedClips: stopAudio.recordedClips || [],
        importMediaFileToWavFn: importMediaFileToWav,
        computeWaveformPeaksFn: computeWaveformPeaks,
      });
      assert.strictEqual(stopVid.recordedVideoClips.length, 2);

      const clipNoAudio = proj.tracks[0].clips[0];
      assert.strictEqual(clipNoAudio.mediaKind, 'video');
      assert.strictEqual(clipNoAudio.hasAudio, false);
      assert.strictEqual(clipNoAudio.wavFile, null);
      assert.ok(fs.existsSync(clipNoAudio.videoFile));
      const pNoAudio = await probeVideoFileInfo(clipNoAudio.videoFile);
      assert.strictEqual(pNoAudio.hasVideo, true);
      assert.strictEqual(pNoAudio.hasAudio, false);
      assert.strictEqual(pNoAudio.width, 1280);
      assert.strictEqual(pNoAudio.height, 720);
      assert.strictEqual(vidOnlyTrack.videoConfig.qualityPreset, 'hd-1080p');
      assert.strictEqual(vidOnlyTrack.videoConfig.sourceType, 'robos-ip-camera');

      const clipWithStreamAudio = proj.tracks[1].clips[0];
      assert.strictEqual(clipWithStreamAudio.mediaKind, 'video');
      assert.strictEqual(clipWithStreamAudio.hasAudio, true);
      assert.ok(clipWithStreamAudio.wavFile && fs.existsSync(clipWithStreamAudio.wavFile));
      assert.ok(clipWithStreamAudio.peaks.length > 0);

      // 3. Persist & reload project to verify MP4 video paths survive saveProject -> loadProject
      const savedDir = path.join(tmpVidDir, 'saved-vid-proj');
      saveProject(proj, { targetDir: savedDir });
      const reloaded = loadProject(savedDir);
      assert.strictEqual(reloaded.ok, true);
      const reloadedClip = reloaded.project.tracks[0].clips[0];
      assert.strictEqual(reloadedClip.videoFileExists, true);
      assert.ok(reloadedClip.videoFile.startsWith(savedDir));
      assert.ok(fs.existsSync(reloadedClip.videoFile));
    } finally {
      if (mockCamSrv) await new Promise(r => mockCamSrv.close(r));
      fs.rmSync(tmpVidDir, { recursive: true, force: true });
    }
  });

  it('encodes & parses Standard MIDI Karaoke (.kar SMF Format 1 0xFF 0x05) and creates persistent Karaoke Lyrics tracks', async () => {
    const prevTestEnv = process.env.ROBOS_TEST;
    process.env.ROBOS_TEST = '1';
    const tmpLyrDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-lyrics-'));
    try {
      const {
        parseSongArtistAndTitle,
        encodeMidiKaraokeSmf,
        parseMidiKaraokeSmf,
        createLyricsTrackForProject,
        updateLyricsClipData,
      } = require('../lib/lyrics-generator');

      // 1. Song title / artist cleaning from imported cover filenames
      const metaA = parseSongArtistAndTitle('Somebody That I Used To Know by Gotye Meets Metal_mixed [M4A]');
      assert.strictEqual(metaA.title, 'Somebody That I Used To Know');
      assert.strictEqual(metaA.artist, 'Gotye');

      const metaB = parseSongArtistAndTitle('Dream Theater - Metropolis Pt. 1 (guitar cover with tabs & chords) [MP4]');
      assert.strictEqual(metaB.artist, 'Dream Theater');
      assert.strictEqual(metaB.title, 'Metropolis Pt. 1');

      // 2. Binary SMF Format 1 Karaoke (.kar) 0xFF 0x05 Lyric Meta-Event + MIDI pitch roundtrip
      const sampleLines = [
        {
          startSec: 2.0,
          endSec: 4.4,
          text: 'Now and then I think',
          words: [
            { text: 'Now', startSec: 2.0, endSec: 2.45, midiNote: 62 },
            { text: 'and', startSec: 2.45, endSec: 2.85, midiNote: 64 },
            { text: 'then', startSec: 2.85, endSec: 3.35, midiNote: 65 },
            { text: 'I', startSec: 3.35, endSec: 3.7, midiNote: 67 },
            { text: 'think', startSec: 3.7, endSec: 4.4, midiNote: 69 },
          ],
        },
        {
          startSec: 5.0,
          endSec: 7.2,
          text: 'Of when we were together',
          words: [
            { text: 'Of', startSec: 5.0, endSec: 5.35, midiNote: 64 },
            { text: 'when', startSec: 5.35, endSec: 5.75, midiNote: 65 },
            { text: 'we', startSec: 5.75, endSec: 6.1, midiNote: 67 },
            { text: 'were', startSec: 6.1, endSec: 6.5, midiNote: 65 },
            { text: 'together', startSec: 6.5, endSec: 7.2, midiNote: 62 },
          ],
        },
      ];

      const karBuf = encodeMidiKaraokeSmf({
        lines: sampleLines,
        bpm: 129,
        timeSignature: '4/4',
        title: 'Somebody That I Used To Know',
        artist: 'Gotye',
        clipStartSec: 1.5,
      });
      assert.strictEqual(karBuf.toString('ascii', 0, 4), 'MThd');
      assert.strictEqual(karBuf.readUInt16BE(8), 1); // SMF Format 1
      assert.strictEqual(karBuf.readUInt16BE(10), 2); // Track 0 Conductor + Track 1 Words

      const decodedKar = parseMidiKaraokeSmf(karBuf, { clipStartSec: 1.5 });
      assert.strictEqual(decodedKar.title, 'Somebody That I Used To Know');
      assert.strictEqual(decodedKar.artist, 'Gotye');
      assert.ok(Math.abs(decodedKar.bpm - 129) < 0.25);
      assert.strictEqual(decodedKar.lines.length, 2);
      assert.strictEqual(decodedKar.lines[0].text, 'Now and then I think');
      assert.strictEqual(decodedKar.lines[1].text, 'Of when we were together');
      assert.strictEqual(decodedKar.lines[0].words[0].midiNote, 62);
      assert.strictEqual(decodedKar.lines[0].words[4].midiNote, 69);
      assert.ok(Math.abs(decodedKar.lines[0].words[0].startSec - 2.0) < 0.02);

      // 3. Create Lyrics Track directly below a music track + persist across saveProject -> loadProject
      const projDir = path.join(tmpLyrDir, 'kar-session');
      fs.mkdirSync(path.join(projDir, 'takes'), { recursive: true });
      const wavFile = path.join(projDir, 'takes', 'backing.wav');
      fs.writeFileSync(wavFile, synthesizeDrumTakeWav({ profileId: 'vocal-condenser', durationSec: 10.0 }));

      const proj = createEmptyProject({ name: 'Karaoke Session', bpm: 128, sampleRate: 48000 });
      proj.projectDir = projDir;
      proj.tracks.push({
        id: 'trk-music-1',
        name: 'Somebody That I Used To Know by Gotye [MP4]',
        trackKind: 'audio',
        color: '#38bdf8',
        clips: [{
          id: 'clip-music-1',
          name: 'Somebody That I Used To Know by Gotye [MP4]',
          wavFile,
          startSec: 1.0,
          offsetSec: 0,
          durationSec: 10.0,
          muted: false,
        }],
      });

      const created = await createLyricsTrackForProject(proj, 'trk-music-1', {
        customLyricsText: '[00:01.00] First studio line\n[00:04.50] Second metal chorus line',
      });
      assert.strictEqual(created.ok, true);
      assert.strictEqual(proj.tracks.length, 2);
      assert.strictEqual(proj.tracks[1].trackKind, 'lyrics');
      assert.ok(fs.existsSync(created.karFile));
      assert.ok(fs.existsSync(created.lrcFile));
      assert.strictEqual(created.lineCount, 2);
      assert.strictEqual(created.wordCount, 7);

      // Update lyrics via Inspector API and verify .kar rewrites cleanly
      const updated = updateLyricsClipData(proj, {
        trackId: created.lyricsTrack.id,
        lyricsText: '[00:01.20] <00:01.20>Updated <00:01.80>karaoke <00:02.50>words',
      });
      assert.strictEqual(updated.ok, true);
      assert.strictEqual(updated.clip.wordCount, 3);

      // Save to a fresh target directory and reload with lyricsData stripped to prove .kar binary re-hydration!
      const savedCopyDir = path.join(tmpLyrDir, 'saved-kar-copy');
      saveProject(proj, { targetDir: savedCopyDir });
      const mfPath = path.join(savedCopyDir, 'project.json');
      const rawJson = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
      delete rawJson.tracks[1].clips[0].lyricsData;
      fs.writeFileSync(mfPath, JSON.stringify(rawJson, null, 2), 'utf8');

      const reloaded = loadProject(savedCopyDir);
      const rehydratedClip = reloaded.project.tracks[1].clips[0];
      assert.ok(rehydratedClip.karFile && fs.existsSync(rehydratedClip.karFile));
      assert.strictEqual(rehydratedClip.lyricsData.lines.length, 1);
      assert.strictEqual(rehydratedClip.lyricsData.lines[0].text, 'Updated karaoke words');
    } finally {
      if (prevTestEnv === undefined) delete process.env.ROBOS_TEST;
      else process.env.ROBOS_TEST = prevTestEnv;
      fs.rmSync(tmpLyrDir, { recursive: true, force: true });
    }
  });

  it('saves and re-syncs Kdenlive (.kdenlive) projects: creates audio mixdown + aligned video tracks, replaces existing tracks, recreates deleted tracks, and preserves user Kdenlive tracks', async () => {
    const tmpKdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-kdenlive-'));
    try {
      const { synthesizeTestPatternMp4 } = require('../lib/video-devices');
      const {
        ROBOS_AUDIO_TRACK_NAME,
        parseMltXml,
        serializeMltXml,
        getProp,
        saveOrUpdateKdenliveProject,
      } = require('../lib/kdenlive-exporter');

      const cam1Mp4 = path.join(tmpKdDir, 'drum-cam-1.mp4');
      const cam2TakeA = path.join(tmpKdDir, 'overhead-a.mp4');
      const cam2TakeB = path.join(tmpKdDir, 'overhead-b.mp4');
      await synthesizeTestPatternMp4(cam1Mp4, 4.0, false, { width: 1280, height: 720 });
      await synthesizeTestPatternMp4(cam2TakeA, 2.0, false, { width: 1280, height: 720 });
      await synthesizeTestPatternMp4(cam2TakeB, 2.0, false, { width: 1280, height: 720 });

      const mixWavBuf1 = synthesizeDrumTakeWav({ profileId: 'snare-top', durationSec: 6.0 });
      const kdenliveFile = path.join(tmpKdDir, 'metal-drum-video.kdenlive');

      const proj = createEmptyProject({ name: 'Metal Drum Video', bpm: 140, sampleRate: 48000 });
      proj.tracks.push(
        {
          id: 'trk-vid-1',
          name: 'Drum Cam 1',
          trackKind: 'video',
          muted: false,
          clips: [
            {
              id: 'vc-1',
              name: 'Drum Cam 1 Take',
              mediaKind: 'video',
              videoFile: cam1Mp4,
              startSec: 2.0,
              offsetSec: 0.5,
              durationSec: 3.0,
              muted: false,
            },
          ],
        },
        {
          id: 'trk-vid-2',
          name: 'Overhead Cam',
          trackKind: 'video',
          muted: false,
          clips: [
            {
              id: 'vc-2a',
              name: 'Overhead Intro',
              mediaKind: 'video',
              videoFile: cam2TakeA,
              startSec: 0.0,
              offsetSec: 0.0,
              durationSec: 1.5,
              muted: false,
            },
            {
              id: 'vc-2b',
              name: 'Overhead Chorus',
              mediaKind: 'video',
              videoFile: cam2TakeB,
              startSec: 3.5,
              offsetSec: 0.0,
              durationSec: 1.5,
              muted: false,
            },
          ],
        }
      );

      // 1. First Save (no existing .kdenlive file): creates audio mixdown track + 2 aligned video tracks
      const pass1 = await saveOrUpdateKdenliveProject({
        project: proj,
        kdenlivePath: kdenliveFile,
        mixdownWavBuffer: mixWavBuf1,
      });
      assert.strictEqual(pass1.ok, true);
      assert.strictEqual(pass1.existedBefore, false);
      assert.strictEqual(pass1.videoTrackCount, 2);
      assert.strictEqual(pass1.createdTrackCount, 3); // 1 audio + 2 video
      assert.strictEqual(pass1.updatedTrackCount, 0);
      assert.ok(fs.existsSync(kdenliveFile));
      assert.ok(fs.existsSync(pass1.mixdownWavPath));

      const doc1 = parseMltXml(fs.readFileSync(kdenliveFile, 'utf8'));
      const tractors1 = doc1.root.children.filter(c => c.type === 'element' && c.tag === 'tractor');
      const drumCamTractor1 = tractors1.find(t => getProp(t, 'kdenlive:track_name') === 'RobOS Video — Drum Cam 1');
      assert.ok(drumCamTractor1, 'Expected RobOS Video — Drum Cam 1 track tractor');

      // Verify exact 2.000s <blank> lead-in + 0.500s source in-point on Drum Cam 1's playlist!
      const drumCamPlId = drumCamTractor1.children.find(c => c.tag === 'track')?.attrs?.producer;
      const drumCamPl = doc1.root.children.find(c => c.attrs?.id === drumCamPlId);
      assert.strictEqual(drumCamPl.children[0].tag, 'blank');
      assert.strictEqual(drumCamPl.children[0].attrs.length, '00:00:02.000');
      assert.strictEqual(drumCamPl.children[1].tag, 'entry');
      assert.strictEqual(drumCamPl.children[1].attrs.in, '00:00:00.500');

      // 2. Simulate user editing inside Kdenlive:
      //    - Add a custom user track ("V3 User Titles")
      //    - Strip `robos:role` from RobOS Audio Mixdown (proving kdenlive:track_name matching works after Kdenlive Ctrl+S!)
      //    - Delete "RobOS Video — Overhead Cam" in Kdenlive
      const audioTr1 = tractors1.find(t => getProp(t, 'kdenlive:track_name') === ROBOS_AUDIO_TRACK_NAME);
      audioTr1.children = audioTr1.children.filter(c => !(c.tag === 'property' && c.attrs?.name?.startsWith('robos:')));

      const overheadTr1 = tractors1.find(t => getProp(t, 'kdenlive:track_name') === 'RobOS Video — Overhead Cam');
      const seqTr1 = tractors1.find(t => Boolean(getProp(t, 'kdenlive:uuid')));
      // Remove Overhead Cam from sequence tractor (simulating user deleting that track in Kdenlive)
      seqTr1.children = seqTr1.children.filter(c => !(c.tag === 'track' && c.attrs?.producer === overheadTr1.attrs.id));
      doc1.root.children = doc1.root.children.filter(c => c !== overheadTr1);

      // Insert a user-owned Kdenlive track ("V3 User Titles")
      const userPl = { type: 'element', tag: 'playlist', attrs: { id: 'playlist99' }, children: [] };
      const userTr = {
        type: 'element',
        tag: 'tractor',
        attrs: { id: 'tractor99', in: '00:00:00.000', out: '00:00:05.000' },
        children: [
          { type: 'element', tag: 'property', attrs: { name: 'kdenlive:track_name' }, children: [{ type: 'text', value: 'V3 User Titles' }] },
          { type: 'element', tag: 'track', attrs: { hide: 'audio', producer: 'playlist99' }, children: [] },
        ],
      };
      const seqIdx = doc1.root.children.indexOf(seqTr1);
      doc1.root.children.splice(seqIdx, 0, userPl, userTr);
      const trackInsertIdx = seqTr1.children.findIndex(c => c.tag === 'transition');
      seqTr1.children.splice(trackInsertIdx, 0, { type: 'element', tag: 'track', attrs: { producer: 'tractor99' }, children: [] });
      fs.writeFileSync(kdenliveFile, serializeMltXml(doc1), 'utf8');

      // 3. Second Save (file already exists!): nudge Drum Cam 1 to 1.0s, render longer 8.0s mixdown, and re-export!
      proj.tracks[0].clips[0].startSec = 1.0;
      const mixWavBuf2 = synthesizeDrumTakeWav({ profileId: 'kick-in', durationSec: 8.0 });
      const pass2 = await saveOrUpdateKdenliveProject({
        project: proj,
        kdenlivePath: kdenliveFile,
        mixdownWavBuffer: mixWavBuf2,
      });

      assert.strictEqual(pass2.ok, true);
      assert.strictEqual(pass2.existedBefore, true);
      assert.strictEqual(pass2.preservedUserTrackCount, 1);
      // RobOS Audio Mixdown + Drum Cam 1 updated in place; deleted Overhead Cam recreated!
      assert.strictEqual(pass2.updatedTrackCount, 2);
      assert.strictEqual(pass2.createdTrackCount, 1);

      const doc2 = parseMltXml(fs.readFileSync(kdenliveFile, 'utf8'));
      const tractors2 = doc2.root.children.filter(c => c.type === 'element' && c.tag === 'tractor');
      assert.ok(tractors2.some(t => getProp(t, 'kdenlive:track_name') === 'V3 User Titles'), 'User track must be preserved');
      assert.ok(tractors2.some(t => getProp(t, 'kdenlive:track_name') === 'RobOS Video — Overhead Cam'), 'Deleted video track must be recreated');

      const drumCamTractor2 = tractors2.find(t => getProp(t, 'kdenlive:track_name') === 'RobOS Video — Drum Cam 1');
      const drumCamPlId2 = drumCamTractor2.children.find(c => c.tag === 'track')?.attrs?.producer;
      const drumCamPl2 = doc2.root.children.find(c => c.attrs?.id === drumCamPlId2);
      assert.strictEqual(drumCamPl2.children[0].attrs.length, '00:00:01.000', 'Updated video clip offset must reflect 1.000s');
    } finally {
      fs.rmSync(tmpKdDir, { recursive: true, force: true });
    }
  });

  it('mounts reusable <robos-job-status> bottom-toolbar spinner and tracks Kdenlive & WAV/MP3 mixdown jobs', async () => {
    const pkgDir = path.join(__dirname, '..');
    const htmlSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'index.html'), 'utf8');
    const appSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'app.js'), 'utf8');

    assert.ok(htmlSrc.includes('robos-job-status.js'), 'index.html must load robos-ui/robos-job-status.js');
    assert.ok(htmlSrc.includes('<robos-job-status id="daw-job-status"'), 'index.html must mount <robos-job-status> in #daw-statusbar');

    assert.ok(appSrc.includes("category: 'KDENLIVE'"), 'saveSessionToKdenliveProject must register KDENLIVE job');
    assert.ok(appSrc.includes("'MIXDOWN'"), 'renderAndExportMixdown must register MIXDOWN job');
    assert.ok(appSrc.includes("'VIDEO MP4'"), 'renderAndExportMixdown must register VIDEO MP4 job');
    assert.ok(appSrc.includes('window.robos.pickExportMixdownPath'), 'Export must pick save path first then run in bottom-toolbar job spinner');
    assert.ok(!appSrc.includes("btn.textContent = 'Rendering & Encoding...'"), 'Export modal must close immediately instead of blocking workbench with modal status');
    assert.ok(appSrc.includes("category: 'MIDI .KAR'"), 'createLyricsTrackUnderTrack must register MIDI .KAR job');
    assert.ok(appSrc.includes("category: 'CLICK AI'"), 'generateClickTrackUnderTrack must register CLICK AI job');
    assert.ok(appSrc.includes("category: 'STEMS'"), 'removeDrumsUnderTrack must register STEMS job');
    assert.ok(appSrc.includes('robos-job-action'), 'app.js must wire robos-job-action Reveal button');

    const { RobosJobManager } = require('../../robos-ui/robos-job-status.js');
    const mgr = new RobosJobManager();
    const res = await mgr.run({
      title: 'Save to Kdenlive (band.kdenlive)',
      category: 'KDENLIVE',
      progress: 18,
      detail: 'Rendering lossless 48 kHz stereo audio mixdown...',
    }, async (job) => {
      assert.strictEqual(mgr.getSnapshot().runningCount, 1);
      job.update({ progress: 68, detail: 'Aligning video tracks & writing MLT XML...' });
      job.complete({ detail: 'Synced band.kdenlive', outputPath: '/tmp/band.kdenlive', actionLabel: 'Reveal' });
      return { ok: true, kdenlivePath: '/tmp/band.kdenlive' };
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(mgr.getSnapshot().runningCount, 0);
    assert.strictEqual(mgr.getSnapshot().jobs[0].status, 'completed');
    assert.strictEqual(mgr.getSnapshot().jobs[0].outputPath, '/tmp/band.kdenlive');
  });

  it('detects music time signature first (4/4, 3/4, 6/8, 7/8) and locks True Beat 1 without Beat-1-on-Beat-3 pickup swap', () => {
    const { analyzeAudioBeatGrid, synthesizeAlignedClickWav } = require('../lib/click-track-generator');
    const sr = 16000;

    const synthArrangement = (durSec, fn) => {
      const buf = new Float32Array(Math.ceil(durSec * sr));
      const hit = (sec, freq, amp, decay = 45, dur = 0.09, noiseAmp = 0) => {
        const s0 = Math.round(sec * sr);
        const len = Math.min(Math.round(dur * sr), buf.length - s0);
        for (let i = 0; i < len; i++) {
          if (s0 + i < 0) continue;
          const t = i / sr;
          const n = noiseAmp > 0 ? ((Math.sin(i * 12.9898) * 43758.5453) % 1) * noiseAmp * Math.exp(-decay * 1.4 * t) : 0;
          buf[s0 + i] += amp * Math.sin(2 * Math.PI * freq * t) * Math.exp(-decay * t) + n;
        }
      };
      const chord = (sec, dur, rootHz, amp = 0.24) => {
        const s0 = Math.round(sec * sr);
        const len = Math.min(Math.round(dur * sr), buf.length - s0);
        for (let i = 0; i < len; i++) {
          if (s0 + i < 0) continue;
          const t = i / sr;
          const env = Math.min(1, t / 0.01) * Math.exp(-1.5 * t);
          buf[s0 + i] += amp * env * (0.6 * Math.sin(2 * Math.PI * rootHz * t) + 0.4 * Math.sin(2 * Math.PI * rootHz * 1.5 * t));
        }
      };
      fn({ hit, chord });
      return buf;
    };

    // 1. 4/4 @ 120 BPM with a 2-beat pickup on Beats 3 & 4 ("3 - 4 | BAM Bar 1 Beat 1!")
    const pickup44 = synthArrangement(18, ({ hit, chord }) => {
      hit(1.0, 260, 0.55, 55, 0.08, 0.35); // Pickup Beat 3
      hit(1.5, 230, 0.62, 55, 0.08, 0.40); // Pickup Beat 4
      const roots = [110, 146.8, 164.8, 130.8];
      for (let bar = 0; bar < 7; bar++) {
        const bs = 2.0 + bar * 2.0; // True Bar 1 Beat 1 = 2.0s
        chord(bs, 1.95, roots[bar % 4], 0.25);
        hit(bs + 0.0, 68, 0.88, 35, 0.12, bar % 4 === 0 ? 0.35 : 0.05);
        hit(bs + 0.5, 240, 0.65, 55, 0.08, 0.45);
        hit(bs + 1.0, 68, 0.75, 40, 0.10, 0.04);
        hit(bs + 1.5, 240, 0.65, 55, 0.08, 0.45);
      }
    });
    const g44 = analyzeAudioBeatGrid(pickup44, { earliestStartSec: 0 });
    assert.strictEqual(g44.timeSignature, '4/4');
    assert.ok(Math.abs(g44.bpm - 120) <= 0.5);
    assert.ok(Math.abs(g44.firstDownbeatSec - 2.0) <= 0.025, `Expected True Beat 1 at 2.00s (not 1.00s Beat-3 pickup), got ${g44.firstDownbeatSec}s`);

    // Verify 1-bar count-off starts at 0.00s so Beats 3 & 4 of count-off play over the 1.0s & 1.5s pickup and Beat 1 lands at 2.0s!
    const click44 = synthesizeAlignedClickWav({ bpm: g44.bpm, beatsPerBar: g44.beatsPerBar, firstDownbeatSec: g44.firstDownbeatSec, songEndSec: 8.0 });
    assert.ok(Math.abs(click44.clipStartSec - 0.0) <= 0.025);
    assert.strictEqual(click44.transients[4].velocity, 0.95, '5th click (index 4) must be Song Bar 1 Beat 1 Downbeat');

    // 2. 4/4 Half-Time Breakdown @ 132 BPM (Kick + Chord on Beat 1, Heavy Snare on Beat 3 — must NOT swap 1 & 3)
    const bht = 60 / 132;
    const halfTime44 = synthArrangement(18, ({ hit, chord }) => {
      const roots = [73.4, 87.3, 98.0, 82.4];
      for (let bar = 0; bar < 8; bar++) {
        const bs = 1.2 + bar * 4 * bht;
        chord(bs, 3.8 * bht, roots[bar % 4], 0.26);
        hit(bs + 0 * bht, 62, 0.92, 32, 0.14, 0.18);
        hit(bs + 1 * bht, 900, 0.28, 95, 0.04, 0.18);
        hit(bs + 2 * bht, 235, 0.85, 48, 0.09, 0.55);
        hit(bs + 3 * bht, 900, 0.28, 95, 0.04, 0.18);
      }
    });
    const gHt = analyzeAudioBeatGrid(halfTime44, { earliestStartSec: 0 });
    assert.strictEqual(gHt.timeSignature, '4/4');
    assert.ok(Math.abs(gHt.firstDownbeatSec - 1.2) <= 0.025, `Half-time Beat 1 must lock to 1.20s, got ${gHt.firstDownbeatSec}s`);

    // 3. 3/4 Triple Meter @ 126 BPM with 1-beat pickup
    const b34 = 60 / 126;
    const waltz34 = synthArrangement(18, ({ hit, chord }) => {
      const trueB1 = 0.8 + b34;
      hit(0.8, 320, 0.45, 65, 0.06, 0.20);
      const roots = [130.8, 164.8, 196.0, 146.8];
      for (let bar = 0; bar < 10; bar++) {
        const bs = trueB1 + bar * 3 * b34;
        chord(bs, 2.9 * b34, roots[bar % 4], 0.24);
        hit(bs, 70, 0.88, 36, 0.11, 0.05);
        hit(bs + b34, 290, 0.52, 65, 0.07, 0.30);
        hit(bs + 2 * b34, 290, 0.50, 65, 0.07, 0.28);
      }
    });
    const g34 = analyzeAudioBeatGrid(waltz34, { earliestStartSec: 0 });
    assert.strictEqual(g34.timeSignature, '3/4');
    assert.ok(Math.abs(g34.firstDownbeatSec - (0.8 + b34)) <= 0.025);

    // 4. 6/8 Compound Meter @ 150 eighth-BPM with 3-pulse pickup ("4 - 5 - 6 | 1!")
    const p68 = 60 / 150;
    const groove68 = synthArrangement(20, ({ hit, chord }) => {
      hit(0.6, 250, 0.58, 55, 0.08, 0.38);
      hit(1.0, 900, 0.32, 90, 0.04, 0.25);
      hit(1.4, 900, 0.34, 90, 0.04, 0.25);
      const roots = [110, 130.8, 146.8, 98];
      for (let bar = 0; bar < 7; bar++) {
        const bs = 1.8 + bar * 6 * p68;
        chord(bs, 5.8 * p68, roots[bar % 4], 0.25);
        hit(bs + 0 * p68, 68, 0.90, 35, 0.12, bar % 2 === 0 ? 0.25 : 0.05);
        hit(bs + 1 * p68, 950, 0.32, 95, 0.04, 0.22);
        hit(bs + 2 * p68, 950, 0.32, 95, 0.04, 0.22);
        hit(bs + 3 * p68, 240, 0.72, 55, 0.08, 0.46);
        hit(bs + 4 * p68, 950, 0.32, 95, 0.04, 0.22);
        hit(bs + 5 * p68, 950, 0.35, 95, 0.04, 0.24);
      }
    });
    const g68 = analyzeAudioBeatGrid(groove68, { earliestStartSec: 0 });
    assert.strictEqual(g68.timeSignature, '6/8');
    assert.ok(Math.abs(g68.firstDownbeatSec - 1.8) <= 0.025);

    // 5. 7/8 Prog Odd Meter @ 140 eighth-BPM
    const p78 = 60 / 140;
    const prog78 = synthArrangement(20, ({ hit, chord }) => {
      const roots = [82.4, 98.0, 110.0, 73.4];
      for (let bar = 0; bar < 6; bar++) {
        const bs = 1.0 + bar * 7 * p78;
        chord(bs, 6.8 * p78, roots[bar % 4], 0.24);
        hit(bs + 0 * p78, 66, 0.90, 35, 0.11, 0.20);
        hit(bs + 1 * p78, 900, 0.30, 95, 0.04, 0.20);
        hit(bs + 2 * p78, 240, 0.65, 55, 0.08, 0.40);
        hit(bs + 3 * p78, 900, 0.30, 95, 0.04, 0.20);
        hit(bs + 4 * p78, 72, 0.68, 40, 0.09, 0.08);
        hit(bs + 5 * p78, 240, 0.62, 55, 0.08, 0.38);
        hit(bs + 6 * p78, 900, 0.32, 95, 0.04, 0.22);
      }
    });
    const g78 = analyzeAudioBeatGrid(prog78, { earliestStartSec: 0 });
    assert.strictEqual(g78.timeSignature, '7/8');
    assert.ok(Math.abs(g78.firstDownbeatSec - 1.0) <= 0.025);
  });

  it('parses Focusrite Scarlett 18i20 DSP Headphone Direct-Monitor vs Backing PCM 1+2 mix and exposes Headphone Mix controls', () => {
    const {
      scarlettDbToRaw,
      scarlettRawToDb,
      parseScarlettHeadphoneMix,
    } = require('../../robos-lib/audio-devices');

    assert.strictEqual(scarlettDbToRaw(-80), 0);
    assert.strictEqual(scarlettDbToRaw(-3), 154);
    assert.strictEqual(scarlettDbToRaw(0), 160);
    assert.strictEqual(scarlettDbToRaw(12), 184);
    assert.strictEqual(scarlettRawToDb(0), -80);
    assert.strictEqual(scarlettRawToDb(154), -3);
    assert.strictEqual(scarlettRawToDb(184), 12);

    const sampleDump = [
      "Simple mixer control 'Analogue Output 07',0",
      "  Capabilities: penum",
      "  Item0: 'Mix A'",
      "Simple mixer control 'Analogue Output 08',0",
      "  Capabilities: penum",
      "  Item0: 'Mix B'",
      "Simple mixer control 'Line 07 (Headphones 1 L)',0",
      "  Limits: Playback 0 - 127",
      "  Mono: Playback 127 [100%] [0.00dB]",
      "Simple mixer control 'Line 07 Mute',0",
      "  Mono: Playback [off]",
      "Simple mixer control 'Line 08 (Headphones 1 R)',0",
      "  Limits: Playback 0 - 127",
      "  Mono: Playback 127 [100%] [0.00dB]",
      "Simple mixer control 'Mixer Input 01',0",
      "  Item0: 'Analogue 1'",
      "Simple mixer control 'Mixer Input 02',0",
      "  Item0: 'Analogue 2'",
      "Simple mixer control 'Mixer Input 19',0",
      "  Item0: 'PCM 1'",
      "Simple mixer control 'Mixer Input 20',0",
      "  Item0: 'PCM 2'",
      "Simple mixer control 'Mix A Input 01',0",
      "  Limits: Playback 0 - 184",
      "  Mono: Playback 154 [84%] [-3.00dB]",
      "Simple mixer control 'Mix B Input 01',0",
      "  Limits: Playback 0 - 184",
      "  Mono: Playback 154 [84%] [-3.00dB]",
      "Simple mixer control 'Mix A Input 02',0",
      "  Limits: Playback 0 - 184",
      "  Mono: Playback 0 [0%] [-80.00dB]",
      "Simple mixer control 'Mix B Input 02',0",
      "  Limits: Playback 0 - 184",
      "  Mono: Playback 0 [0%] [-80.00dB]",
      "Simple mixer control 'Mix A Input 19',0",
      "  Limits: Playback 0 - 184",
      "  Mono: Playback 160 [87%] [0.00dB]",
      "Simple mixer control 'Mix B Input 20',0",
      "  Limits: Playback 0 - 184",
      "  Mono: Playback 160 [87%] [0.00dB]",
    ].join('\n');

    const parsed = parseScarlettHeadphoneMix(sampleDump);
    assert.strictEqual(parsed.supported, true);
    assert.strictEqual(parsed.mixLeft, 'Mix A');
    assert.strictEqual(parsed.mixRight, 'Mix B');
    assert.strictEqual(parsed.activeDirectCount, 1);
    assert.strictEqual(parsed.maxDirectInputDb, -3);
    assert.strictEqual(parsed.backingPcmDb, 0);
    assert.strictEqual(parsed.headphones.length, 1);

    const pkgDir = path.join(__dirname, '..');
    const htmlSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'index.html'), 'utf8');
    const appSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'app.js'), 'utf8');
    assert.ok(htmlSrc.includes('id="btn-topbar-headphone-mix"'));
    assert.ok(htmlSrc.includes('id="headphone-mix-modal"'));
    assert.ok(appSrc.includes('computeReliableEarsStartWallMs'));
  });

  it('exports combined MP4 (Camera Video + Stereo Audio Mixdown), preserves video-only clip fileExists, and queues Ctrl+Z until recordStop completes', async () => {
    const { MIXDOWN_FORMATS, transcodeMixdownBuffer } = require('../lib/mixdown-exporter');
    const { synthesizeTestPatternMp4, probeVideoFileInfo, buildVideoTrack } = require('../lib/video-devices');

    assert.ok(MIXDOWN_FORMATS.some(f => f.id === 'mp4'), 'MIXDOWN_FORMATS should include mp4 Video + Audio mixdown');

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-mp4-mix-'));
    const prevProjDir = process.env.ROBOS_DAW_PROJECTS_DIR;
    process.env.ROBOS_DAW_PROJECTS_DIR = path.join(tmpRoot, 'projects');
    try {
      const camMp4 = path.join(tmpRoot, 'camera-take.mp4');
      await synthesizeTestPatternMp4(camMp4, 1.5, false, { width: 640, height: 360 });

      // 1. Verify video-only camera clip (wavFile: null) keeps fileExists: true across save/load
      const proj = createEmptyProject({ name: 'Video Audio Export Test', sampleRate: 48000 });
      const vTrack = buildVideoTrack({ name: 'XT2125-4 Camera', audioMode: 'none' });
      vTrack.clips.push({
        id: 'vtake-test1',
        name: 'XT2125-4 Take',
        mediaKind: 'video',
        videoFile: camMp4,
        wavFile: null,
        startSec: 0.4,
        offsetSec: 0,
        durationSec: 1.5,
        sourceDurationSec: 1.5,
        videoWidth: 640,
        videoHeight: 360,
        videoFps: 25,
      });
      proj.tracks.push(vTrack);
      const savedDir = path.join(tmpRoot, 'saved-proj');
      saveProject(proj, { targetDir: savedDir });
      const reloaded = loadProject(savedDir);
      assert.strictEqual(reloaded.ok, true);
      const reloadedClip = reloaded.project.tracks[0].clips[0];
      assert.strictEqual(reloadedClip.videoFileExists, true);
      assert.strictEqual(reloadedClip.fileExists, true, 'Video-only clip must remain fileExists: true on reload');

      // 2. Synthesize 1.9s stereo audio mixdown buffer (0.0s -> 1.9s covering 0.4s lead-in + 1.5s video)
      const sr = 48000;
      const frames = Math.round(1.9 * sr);
      const left = new Float32Array(frames);
      const right = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const s = 0.35 * Math.sin((2 * Math.PI * 220 * i) / sr);
        left[i] = s;
        right[i] = s * 0.9;
      }
      const stereoWavBuf = Buffer.from(DE.encodeStereoFloat32ToWavBytes(left, right, sr));

      // 3a. Export MP4 via instant lossless stream_copy (aligned at 0.0s)
      const outFastMp4 = path.join(tmpRoot, 'exported-fast.mp4');
      const fastRes = await transcodeMixdownBuffer(stereoWavBuf, {
        outPath: outFastMp4,
        format: 'mp4',
        quality: 'stream_copy',
        sampleRate: sr,
        title: 'Drum Video Fast Mixdown',
        videoMuxSpec: {
          videoFile: camMp4,
          clipStartSec: 0.0,
          clipOffsetSec: 0,
          clipDurationSec: 1.5,
          renderStartSec: 0.0,
          renderEndSec: 1.5,
        },
      });
      assert.strictEqual(fastRes.ok, true);
      const fastProbed = await probeVideoFileInfo(outFastMp4);
      assert.strictEqual(fastProbed.hasVideo, true);
      assert.strictEqual(fastProbed.hasAudio, true);

      // 3b. Export MP4 muxing camera video + stereo audio mixdown with 0.4s timeline lead-in alignment
      const outMp4 = path.join(tmpRoot, 'exported-video-mixdown.mp4');
      const res = await transcodeMixdownBuffer(stereoWavBuf, {
        outPath: outMp4,
        format: 'mp4',
        quality: 'stream_copy',
        sampleRate: sr,
        title: 'Drum Video Mixdown',
        videoMuxSpec: {
          videoFile: camMp4,
          clipStartSec: 0.4,
          clipOffsetSec: 0,
          clipDurationSec: 1.5,
          renderStartSec: 0.0,
          renderEndSec: 1.9,
        },
      });
      assert.strictEqual(res.ok, true);
      assert.ok(fs.existsSync(outMp4) && res.bytes > 4000);
      const probed = await probeVideoFileInfo(outMp4);
      assert.strictEqual(probed.hasVideo, true, 'Exported MP4 must contain video stream');
      assert.strictEqual(probed.hasAudio, true, 'Exported MP4 must contain stereo mixed audio stream');
      assert.ok(probed.durationSec >= 1.6, `Expected duration >= 1.6s, got ${probed.durationSec}`);

      // 4. Verify Video Output Export MP4 / Reveal .mp4 buttons and Ctrl+Z recordStop race guard
      const pkgDir = path.join(__dirname, '..');
      const htmlSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'index.html'), 'utf8');
      const appSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'app.js'), 'utf8');
      assert.ok(htmlSrc.includes('id="btn-vmon-export-mp4"'));
      assert.ok(htmlSrc.includes('id="btn-vmon-reveal-mp4"'));
      assert.ok(htmlSrc.includes('id="export-video-track-select"'));
      assert.ok(appSrc.includes('let activeRecordStopPromise = null;'));
      assert.ok(appSrc.includes('await activeRecordStopPromise;'));
    } finally {
      if (prevProjDir === undefined) delete process.env.ROBOS_DAW_PROJECTS_DIR;
      else process.env.ROBOS_DAW_PROJECTS_DIR = prevProjDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('generates and caches NLE timeline video filmstrip thumbnail sprites for video clips', async () => {
    const {
      synthesizeTestPatternMp4,
      probeVideoFileInfo,
      generateVideoFilmstripSprite,
    } = require('../lib/video-devices');

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-filmstrip-'));
    try {
      const sampleMp4 = path.join(tmpRoot, 'timeline-preview.mp4');
      const cacheDir = path.join(tmpRoot, 'cache');
      await synthesizeTestPatternMp4(sampleMp4, 2.0, false, { width: 640, height: 360 });

      // 1. Fresh generation produces tileCount x 1 JPEG sprite with exact dimensions
      const res1 = await generateVideoFilmstripSprite(sampleMp4, {
        maxTiles: 12,
        tileWidth: 160,
        tileHeight: 90,
        cacheDir,
      });
      assert.strictEqual(res1.ok, true);
      assert.strictEqual(res1.cached, false);
      assert.ok(res1.tileCount >= 4 && res1.tileCount <= 12);
      assert.ok(fs.existsSync(res1.spriteFile));

      const spriteInfo = await probeVideoFileInfo(res1.spriteFile);
      assert.strictEqual(spriteInfo.width, res1.tileCount * 160);
      assert.strictEqual(spriteInfo.height, 90);

      // 2. Second request hits persistent disk cache immediately
      const res2 = await generateVideoFilmstripSprite(sampleMp4, {
        maxTiles: 12,
        tileWidth: 160,
        tileHeight: 90,
        cacheDir,
      });
      assert.strictEqual(res2.ok, true);
      assert.strictEqual(res2.cached, true);
      assert.strictEqual(res2.spriteFile, res1.spriteFile);
      assert.strictEqual(res2.tileCount, res1.tileCount);

      // 3. Verify timeline filmstrip drawing & IPC wiring in renderer/app.js + preload.js
      const pkgDir = path.join(__dirname, '..');
      const preloadSrc = fs.readFileSync(path.join(pkgDir, 'preload.js'), 'utf8');
      const appSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'app.js'), 'utf8');
      assert.ok(preloadSrc.includes("getVideoFilmstrip: (payload) => ipcRenderer.invoke('daw:video-filmstrip'"));
      assert.ok(appSrc.includes('function drawVideoFilmstripIntoClip('));
      assert.ok(appSrc.includes('function ensureVideoClipFilmstrip('));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('synthesizes all 16 metronome instruments and defaults to Closed Hi-Hat + Open Hi-Hat on the transition beat with real choke physics', () => {
    const {
      DEFAULT_BEAT_INSTRUMENT,
      DEFAULT_TRANSITION_INSTRUMENT,
      DEFAULT_TRANSITION_PLACEMENT,
      METRONOME_INSTRUMENTS,
      synthesizeMetronomeInstrumentHit,
      synthesizeInstrumentClickWav,
      synthesizeMetronomePreviewWav,
    } = require('../lib/human-click-track');
    const { decodeWavMono } = require('../lib/drum-instruments');

    assert.strictEqual(DEFAULT_BEAT_INSTRUMENT, 'hihat-closed');
    assert.strictEqual(DEFAULT_TRANSITION_INSTRUMENT, 'hihat-open');
    assert.strictEqual(DEFAULT_TRANSITION_PLACEMENT, 'turnaround');
    assert.ok(METRONOME_INSTRUMENTS.length >= 16);

    // Every selectable instrument renders crisp, bounded, non-silent audio from Sample #0
    for (const inst of METRONOME_INSTRUMENTS) {
      const hit = synthesizeMetronomeInstrumentHit(inst.id, { sampleRate: 48000, velocity: 0.85, isAccent: true });
      assert.strictEqual(hit.instrumentId, inst.id);
      assert.ok(hit.samples.length > 500, `Expected non-trivial sample length for ${inst.id}`);
      let maxAbs = 0;
      for (let i = 0; i < hit.samples.length; i++) {
        const a = Math.abs(hit.samples[i]);
        if (a > maxAbs) maxAbs = a;
      }
      assert.ok(maxAbs >= 0.15 && maxAbs <= 0.99, `Instrument ${inst.id} peak out of range: ${maxAbs}`);
    }

    // Default 4/4 click track: Closed Hi-Hat on beats 1..3, Open Hi-Hat on transition beat (beat 4) choking on next beat 1
    const click = synthesizeInstrumentClickWav({
      bpm: 120,
      beatsPerBar: 4,
      noteValue: 4,
      countInBars: 1,
      firstDownbeatSec: 2.0,
      songEndSec: 6.0,
      sampleRate: 48000,
    });
    assert.strictEqual(click.beatInstrument, 'hihat-closed');
    assert.strictEqual(click.transitionInstrument, 'hihat-open');
    assert.ok(click.transients.length >= 12);

    // Count-in: beats 0, 1, 2 = hihat-closed, beat 3 (count-in transition into Song Bar 1 Beat 1) = hihat-open
    assert.strictEqual(click.transients[0].instrumentId, 'hihat-closed');
    assert.strictEqual(click.transients[1].instrumentId, 'hihat-closed');
    assert.strictEqual(click.transients[2].instrumentId, 'hihat-closed');
    assert.strictEqual(click.transients[3].instrumentId, 'hihat-open');
    assert.strictEqual(click.transients[3].isTransitionBeat, true);
    // Song Bar 1 Beat 1 (index 4) = accented hihat-closed, Beat 4 (index 7) = hihat-open
    assert.strictEqual(click.transients[4].instrumentId, 'hihat-closed');
    assert.strictEqual(click.transients[4].isDownbeat, true);
    assert.strictEqual(click.transients[7].instrumentId, 'hihat-open');
    assert.strictEqual(click.transients[7].isTransitionBeat, true);

    // Verify hi-hat choke damps open hi-hat tail right before Beat 1 (t = 2.0s) strikes
    const decoded = decodeWavMono(click.wavBuffer);
    const justBeforeChokeIdx = Math.floor(1.998 * 48000);
    assert.ok(Math.abs(decoded.samples[justBeforeChokeIdx]) < 0.05, 'Open hi-hat tail should choke cleanly right before Closed Hi-Hat strikes on Beat 1');

    // Preview WAV renders 2 bars cleanly
    const prev = synthesizeMetronomePreviewWav({ bpm: 120, beatsPerBar: 4 });
    assert.strictEqual(prev.transients.length, 8);
  });

  it('fuses human tap recording + real song audio + Gemini to generate a best-in-class click track via Right-Click -> Create Click Track', async () => {
    const {
      extractHumanTapsFromWav,
      fuseHumanTapsWithMusic,
      synthesizeMetronomeInstrumentHit,
      generateHumanGuidedClickTrackForProject,
    } = require('../lib/human-click-track');
    const { makeWavHeader } = require('../lib/pcm-capture');
    const { createEmptyProject, buildTrackFromWizard } = require('../lib/session-manager');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daw-human-click-'));
    try {
      const sr = 48000;
      const durSec = 14.0;
      const totalSamples = Math.floor(durSec * sr);
      const trueBpm = 138;
      const beatSec = 60 / trueBpm;
      const firstDownbeat = 1.20;

      // 1. Build a real musical song WAV at 138 BPM (4/4) starting at 1.20s
      const songSamples = new Float32Array(totalSamples);
      for (let b = 0; ; b++) {
        const tBeat = firstDownbeat + b * beatSec;
        if (tBeat >= durSec - 0.25) break;
        const barPos = b % 4;
        const startIdx = Math.floor(tBeat * sr);
        const len = Math.floor(0.14 * sr);
        for (let i = 0; i < len && (startIdx + i) < totalSamples; i++) {
          const t = i / sr;
          if (barPos === 0 || barPos === 2) {
            // Kick + bass root chord change on Bar 1
            const f0 = barPos === 0 ? 64 : 72;
            songSamples[startIdx + i] += 0.78 * Math.sin(2 * Math.PI * f0 * t) * Math.exp(-26 * t);
          } else {
            // Snare backbeat on 2 & 4
            const n = Math.sin((i + 1) * 91.7) * 0.5;
            songSamples[startIdx + i] += (0.45 * Math.sin(2 * Math.PI * 215 * t) + 0.45 * n) * Math.exp(-32 * t);
          }
        }
      }
      const writeWavFile = (filePath, floatArr) => {
        const bytes = floatArr.length * 2;
        const hdr = makeWavHeader(bytes, sr);
        const pcm = Buffer.allocUnsafe(bytes);
        for (let i = 0; i < floatArr.length; i++) {
          pcm.writeInt16LE(Math.round(Math.max(-0.98, Math.min(0.98, floatArr[i])) * 32767), i * 2);
        }
        const full = Buffer.concat([hdr, pcm]);
        fs.writeFileSync(filePath, full);
        return full;
      };
      const songWavPath = path.join(tmpDir, 'song-138bpm.wav');
      writeWavFile(songWavPath, songSamples);

      // 2. Simulate a human tapping sticks into a mic channel with +-18ms human jitter, -12ms early bias,
      //    harder Beat-1 accents, and 1 skipped beat!
      const tapSamples = new Float32Array(totalSamples);
      const stickVoice = synthesizeMetronomeInstrumentHit('drumsticks', { sampleRate: sr, velocity: 0.9 }).samples;
      const jitterPatternMs = [-16, 8, -22, 14, -10, 19, -8, -15];
      let expectedTapCount = 0;
      for (let b = 0; ; b++) {
        const idealSec = firstDownbeat + b * beatSec;
        if (idealSec >= durSec - 0.4) break;
        if (b === 9) continue; // Human missed 1 beat mid-song!
        const jitterSec = (-12 + jitterPatternMs[b % jitterPatternMs.length]) / 1000;
        const tapSec = idealSec + jitterSec;
        const startIdx = Math.max(0, Math.floor(tapSec * sr));
        const amp = (b % 4 === 0) ? 0.92 : 0.52;
        for (let i = 0; i < stickVoice.length && (startIdx + i) < totalSamples; i++) {
          tapSamples[startIdx + i] += stickVoice[i] * amp;
        }
        expectedTapCount++;
      }
      const tapWavPath = path.join(tmpDir, 'human-stick-taps.wav');
      const tapWavBuf = writeWavFile(tapWavPath, tapSamples);

      const extracted = extractHumanTapsFromWav(tapWavBuf, { clipStartSec: 0 });
      assert.strictEqual(extracted.length, expectedTapCount, 'Should detect every human stick tap cleanly despite skipped beat');
      assert.ok(extracted[0].accentRatio > 1.15, 'Accented Beat-1 stick tap should register elevated accentRatio');

      // Verify more taps => higher coverage % in fuseHumanTapsWithMusic
      const mono16k = new Float32Array(Math.floor(durSec * 16000));
      for (let i = 0; i < mono16k.length; i++) {
        mono16k[i] = songSamples[Math.min(songSamples.length - 1, i * 3)];
      }
      const shortFusion = fuseHumanTapsWithMusic(extracted.slice(0, 6), mono16k, { earliestStartSec: 0, latestEndSec: durSec });
      const fullFusion = fuseHumanTapsWithMusic(extracted, mono16k, { earliestStartSec: 0, latestEndSec: durSec });
      assert.ok(fullFusion.tapCoveragePct > shortFusion.tapCoveragePct + 40, 'Tapping longer across the song increases tapCoveragePct');
      assert.ok(Math.abs(fullFusion.bpm - 138) <= 0.6, `Expected fused BPM ~138, got ${fullFusion.bpm}`);
      assert.strictEqual(fullFusion.timeSignature, '4/4');

      // 3. Full Project + Mock Gemini Agent end-to-end verification (with 2-bar configurable count-in)
      const proj = createEmptyProject({ name: 'Human Guided Click Session', bpm: 120, sampleRate: sr });
      const songTrack = buildTrackFromWizard({
        profileId: 'acoustic-inst',
        name: 'Fall Out Boy Backing Song',
        inputNodeName: '',
        armed: false,
      });
      songTrack.clips.push({
        id: 'clip-song-1',
        name: 'Fall Out Boy Backing',
        wavFile: songWavPath,
        startSec: 0,
        offsetSec: 0,
        durationSec: durSec,
        muted: false,
      });
      proj.tracks.push(songTrack);

      let capturedTelemetry = null;
      const mockGeminiAgent = {
        PROVIDER_MAP: { antigravity: { id: 'antigravity', name: 'Gemini (Mock)' } },
        ask: async (_prompt, opts) => {
          const jsonPath = path.join(opts.cwd, 'human-tap-fusion.json');
          capturedTelemetry = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          assert.ok(fs.existsSync(path.join(opts.cwd, 'song-excerpt.wav')));
          return {
            ok: true,
            provider: 'Gemini',
            text: JSON.stringify({
              bpm: 138.0,
              beatsPerBar: 4,
              noteValue: 4,
              subdivision: 'quarter',
              segments: null,
              beatInstrument: 'hihat-closed',
              transitionInstrument: 'hihat-open',
              transitionPlacement: 'turnaround',
              reasoning: 'Locked 138.0 BPM 4/4 grid from 27 human stick taps + kick/snare transients.',
            }),
          };
        },
      };

      const genRes = await generateHumanGuidedClickTrackForProject(proj, songTrack.id, {
        tapWavPath,
        countInBars: 2,
        aiAgentModule: mockGeminiAgent,
        takesDir: tmpDir,
      });

      assert.strictEqual(genRes.ok, true);
      assert.ok(capturedTelemetry, 'Gemini should receive human-tap-fusion.json telemetry');
      assert.strictEqual(capturedTelemetry.humanTapSummary.tapCount, expectedTapCount);
      assert.ok(capturedTelemetry.humanTapSummary.tapCoveragePct >= 75);
      assert.strictEqual(genRes.bpm, 138);
      assert.strictEqual(genRes.beatInstrument, 'hihat-closed');
      assert.strictEqual(genRes.transitionInstrument, 'hihat-open');
      assert.strictEqual(genRes.countInBars, 2);
      assert.ok(genRes.timelineShiftSec > 0, '2-bar count-in before 1.20s downbeat shifts timeline forward cleanly');
      assert.strictEqual(proj.tracks[1].id, genRes.clickTrack.id, 'Click track is placed directly below target song track');
      assert.ok(fs.existsSync(genRes.clickClip.wavFile));

      // 4. Verify UI & IPC right-click -> Create Click Track wiring
      const pkgDir = path.join(__dirname, '..');
      const htmlSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'index.html'), 'utf8');
      const appSrc = fs.readFileSync(path.join(pkgDir, 'renderer', 'app.js'), 'utf8');
      const preloadSrc = fs.readFileSync(path.join(pkgDir, 'preload.js'), 'utf8');
      assert.ok(htmlSrc.includes('id="human-click-modal"'));
      assert.ok(htmlSrc.includes('id="hclick-input-select"'));
      assert.ok(htmlSrc.includes('id="hclick-countdown-beats-input"'));
      assert.ok(htmlSrc.includes('id="hclick-beat-inst-select"'));
      assert.ok(htmlSrc.includes('id="hclick-trans-inst-select"'));
      assert.ok(appSrc.includes("'create-click', 'metronome', 'Create Click Track'"));
      assert.ok(preloadSrc.includes("finishHumanClickTrack: (payload) => ipcRenderer.invoke('daw:human-click-finish'"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('performs pro step / pre-roll punch-in recording: phase-locked pre-roll trim, cymbal ring-out preservation vs equal-power crossfade, and multi-clip stitched MP4 video export', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-step-rec-'));
    try {
      const {
        buildEqualPowerFadeCurve,
        detectFirstMusicalEntryInWav,
        classifyClipTailAsRingOut,
        reconcileStepRecordingPass,
        buildTrackVideoExportSegments,
      } = require('../lib/step-recording');
      const { transcodeMixdownBuffer } = require('../lib/mixdown-exporter');
      const { synthesizeTestPatternMp4, probeVideoFileInfo } = require('../lib/video-devices');

      const sr = 48000;
      function writeMonoFloatWav(filePath, samples) {
        const dataBytes = samples.length * 2;
        const hdr = makeWavHeader(dataBytes, sr, 1, 16);
        const pcm = Buffer.alloc(dataBytes);
        for (let i = 0; i < samples.length; i++) {
          const s = Math.max(-1, Math.min(1, samples[i]));
          pcm.writeInt16LE(Math.round(s * 32767), i * 2);
        }
        const full = Buffer.concat([hdr, pcm]);
        fs.writeFileSync(filePath, full);
        return full;
      }

      // Verify equal-power fade curves sum to constant unit power: cos^2 + sin^2 = 1.0
      const curveIn = buildEqualPowerFadeCurve('in', 1.0, 64);
      const curveOut = buildEqualPowerFadeCurve('out', 1.0, 64);
      assert.strictEqual(curveIn.length, 64);
      const midIdx = 32;
      const powerSumMid = (curveIn[midIdx] * curveIn[midIdx]) + (curveOut[midIdx] * curveOut[midIdx]);
      assert.ok(Math.abs(powerSumMid - 1.0) < 0.01, `Expected constant unit power ~1.0 at midpoint, got ${powerSumMid}`);

      // Synthesize Section 1 (0.0s -> 6.5s):
      //   - Drum hits at 0.5s, 1.5s, 2.5s, 3.5s
      //   - Final crash cymbal strike at 3.95s decaying smoothly out to 6.5s (ring-out tail!)
      const sec1Dur = 6.5;
      const sec1Samples = new Float32Array(Math.floor(sec1Dur * sr));
      for (const hitSec of [0.5, 1.5, 2.5, 3.5]) {
        const i0 = Math.floor(hitSec * sr);
        for (let k = 0; k < Math.floor(0.12 * sr) && i0 + k < sec1Samples.length; k++) {
          const t = k / sr;
          sec1Samples[i0 + k] += 0.75 * Math.exp(-t * 32) * Math.sin(2 * Math.PI * 110 * t);
        }
      }
      // Crash cymbal ring-out starting at 3.95s -> smooth exponential shimmer decay for 2.55s
      const crashStart = Math.floor(3.95 * sr);
      for (let i = crashStart; i < sec1Samples.length; i++) {
        const t = (i - crashStart) / sr;
        const shimmer = (
          0.42 * Math.sin(2 * Math.PI * 3410 * t) +
          0.33 * Math.sin(2 * Math.PI * 5173 * t) +
          0.25 * Math.sin(2 * Math.PI * 7829 * t)
        );
        sec1Samples[i] += 0.55 * Math.exp(-t * 1.15) * shimmer;
      }

      const ohPart1Path = path.join(tmpDir, 'oh-part1.wav');
      const kickPart1Path = path.join(tmpDir, 'kick-part1.wav');
      const ohPart1Buf = writeMonoFloatWav(ohPart1Path, sec1Samples);
      writeMonoFloatWav(kickPart1Path, sec1Samples);

      // Synthesize Section 2 punched in at `punchStartSec = 2.0s` (duration 6.0s => 2.0s -> 8.0s timeline):
      //   - Quiet room/listening pre-roll for first 2.20s of recording (2.0s -> 4.20s timeline) while listening to Section 1
      //   - First drum hit enters at 2.20s into recording (`4.20s` timeline), continuing at 5.2s, 6.2s, 7.2s!
      const sec2Dur = 6.0;
      const sec2OhSamples = new Float32Array(Math.floor(sec2Dur * sr));
      const sec2KickSamples = new Float32Array(Math.floor(sec2Dur * sr));
      for (let i = 0; i < sec2OhSamples.length; i++) {
        const roomFloor = 0.0005 * Math.sin(2 * Math.PI * 180 * (i / sr));
        sec2OhSamples[i] = roomFloor;
        sec2KickSamples[i] = roomFloor;
      }
      // Overhead enters at 2.200s offset; Kick enters slightly later at 2.450s offset -> both MUST lock to earliest 2.200s!
      for (const relHit of [2.20, 3.20, 4.20, 5.20]) {
        const i0 = Math.floor(relHit * sr);
        for (let k = 0; k < Math.floor(0.14 * sr) && i0 + k < sec2OhSamples.length; k++) {
          const t = k / sr;
          sec2OhSamples[i0 + k] += 0.78 * Math.exp(-t * 28) * Math.sin(2 * Math.PI * 220 * t);
        }
      }
      for (const relHit of [2.45, 3.45, 4.45, 5.45]) {
        const i0 = Math.floor(relHit * sr);
        for (let k = 0; k < Math.floor(0.14 * sr) && i0 + k < sec2KickSamples.length; k++) {
          const t = k / sr;
          sec2KickSamples[i0 + k] += 0.85 * Math.exp(-t * 30) * Math.sin(2 * Math.PI * 65 * t);
        }
      }

      const ohPart2Path = path.join(tmpDir, 'oh-part2.wav');
      const kickPart2Path = path.join(tmpDir, 'kick-part2.wav');
      const ohPart2Buf = writeMonoFloatWav(ohPart2Path, sec2OhSamples);
      const kickPart2Buf = writeMonoFloatWav(kickPart2Path, sec2KickSamples);

      const detOh = detectFirstMusicalEntryInWav(ohPart2Buf);
      assert.strictEqual(detOh.detectedPreRoll, true);
      assert.ok(Math.abs(detOh.entryOffsetSec - 2.20) < 0.025, `Expected ~2.20s entry offset, got ${detOh.entryOffsetSec}`);

      // Synthesize 2 camera video takes (`cam-part1.mp4` 6.5s, `cam-part2.mp4` 6.0s)
      const camPart1Mp4 = path.join(tmpDir, 'cam-part1.mp4');
      const camPart2Mp4 = path.join(tmpDir, 'cam-part2.mp4');
      await synthesizeTestPatternMp4(camPart1Mp4, 6.5, false, { width: 640, height: 360 });
      await synthesizeTestPatternMp4(camPart2Mp4, 6.0, false, { width: 640, height: 360 });

      const proj = createEmptyProject({ name: 'Step Recording Drum + Cam', bpm: 120, sampleRate: sr });
      const ohTrack = buildTrackFromWizard({ profileId: 'overhead-l', name: 'Overhead L', armed: true });
      const kickTrack = buildTrackFromWizard({ profileId: 'kick-in', name: 'Kick In', armed: true });
      const vidTrack = {
        id: 'trk-cam-main',
        name: 'Drum Cam',
        trackKind: 'video',
        armed: true,
        muted: false,
        clips: [],
      };

      const ohClip1 = {
        id: 'oh-c1',
        name: 'OH Part 1',
        wavFile: ohPart1Path,
        startSec: 0,
        offsetSec: 0,
        durationSec: 6.5,
        sourceDurationSec: 6.5,
        peaks: computeWaveformPeaks(ohPart1Buf, 200),
        transients: [0.5, 1.5, 2.5, 3.5, 3.95].map(t => ({ timeSec: t, peakDb: -3, velocity: 0.85 })),
      };
      const kickClip1 = {
        id: 'kick-c1',
        name: 'Kick Part 1',
        wavFile: kickPart1Path,
        startSec: 0,
        offsetSec: 0,
        durationSec: 6.5,
        sourceDurationSec: 6.5,
        peaks: computeWaveformPeaks(ohPart1Buf, 200),
        transients: [0.5, 1.5, 2.5, 3.5].map(t => ({ timeSec: t, peakDb: -3, velocity: 0.85 })),
      };
      const vidClip1 = {
        id: 'vid-c1',
        name: 'Cam Part 1',
        mediaKind: 'video',
        videoFile: camPart1Mp4,
        startSec: 0,
        offsetSec: 0,
        durationSec: 6.5,
        sourceDurationSec: 6.5,
      };

      const ohClip2 = {
        id: 'oh-c2',
        name: 'OH Part 2',
        wavFile: ohPart2Path,
        startSec: 2.0,
        offsetSec: 0,
        durationSec: 6.0,
        sourceDurationSec: 6.0,
        peaks: computeWaveformPeaks(ohPart2Buf, 200),
        transients: [2.20, 3.20, 4.20, 5.20].map(t => ({ timeSec: t, peakDb: -2, velocity: 0.9 })),
      };
      const kickClip2 = {
        id: 'kick-c2',
        name: 'Kick Part 2',
        wavFile: kickPart2Path,
        startSec: 2.0,
        offsetSec: 0,
        durationSec: 6.0,
        sourceDurationSec: 6.0,
        peaks: computeWaveformPeaks(kickPart2Buf, 200),
        transients: [2.45, 3.45, 4.45, 5.45].map(t => ({ timeSec: t, peakDb: -2, velocity: 0.9 })),
      };
      const vidClip2 = {
        id: 'vid-c2',
        name: 'Cam Part 2',
        mediaKind: 'video',
        videoFile: camPart2Mp4,
        startSec: 2.0,
        offsetSec: 0,
        durationSec: 6.0,
        sourceDurationSec: 6.0,
      };

      ohTrack.clips.push(ohClip1, ohClip2);
      kickTrack.clips.push(kickClip1, kickClip2);
      vidTrack.clips.push(vidClip1, vidClip2);
      proj.tracks.push(ohTrack, kickTrack, vidTrack);

      // Verify Section 1 tail after 4.165s is recognized as a decaying Cymbal Ring-Out
      const ringCheck = classifyClipTailAsRingOut(ohClip1, 4.165);
      assert.strictEqual(ringCheck.isRingOut, true, 'Decaying crash cymbal shimmer after 3.95s should classify as ring-out');

      // Reconcile the step-recorded punch pass!
      const blendRes = reconcileStepRecordingPass(proj, {
        punchStartSec: 2.0,
        recordedClips: [
          { trackId: ohTrack.id, clip: ohClip2 },
          { trackId: kickTrack.id, clip: kickClip2 },
        ],
        recordedVideoClips: [
          { trackId: vidTrack.id, clip: vidClip2 },
        ],
      });

      assert.strictEqual(blendRes.blended, true);
      assert.strictEqual(blendRes.preservedRingOutCount, 2);
      assert.strictEqual(blendRes.splicedVideoTracks, 1);

      // 1. Multi-mic phase lock: Overhead & Kick MUST receive the exact same `offsetSec` and `startSec`!
      assert.strictEqual(ohClip2.offsetSec, kickClip2.offsetSec, 'All armed drum mics must share identical sample-locked offsetSec');
      assert.strictEqual(ohClip2.startSec, kickClip2.startSec, 'All armed drum mics must share identical timeline startSec');
      assert.ok(Math.abs(ohClip2.startSec - 4.165) < 0.03, `Expected Part 2 audio trimmed to ~4.165s, got ${ohClip2.startSec}`);
      assert.ok(ohClip2.transients[0].timeSec < 0.08, 'Shifted first transient should sit right near start of trimmed clip');

      // 2. Cymbal ring-out preserved on Part 1 (`durationSec` still extends to 6.5s with smooth equal-power fade-out)
      assert.strictEqual(ohClip1.stepBlendMode, 'ringout-layer');
      assert.ok(ohClip1.durationSec >= 6.4, `Expected Part 1 cymbal ring-out tail preserved (~6.5s), got ${ohClip1.durationSec}`);
      assert.strictEqual(ohClip1.fadeShape, 'equal-power');
      assert.ok(ohClip1.fadeOutSec > 1.5, `Expected long smooth fade-out over ring-out tail, got ${ohClip1.fadeOutSec}`);

      // 3. Camera video Part 2 idle pre-roll trimmed (`~4.08s`) + Part 1 trimmed with `0.18s` cross-dissolve overlap
      assert.ok(Math.abs(vidClip2.startSec - 4.08) < 0.04, `Expected Part 2 video trimmed to ~4.08s, got ${vidClip2.startSec}`);
      assert.strictEqual(vidClip2.videoCrossfadeSec, 0.18);
      assert.ok(Math.abs((vidClip1.startSec + vidClip1.durationSec) - (vidClip2.startSec + 0.18)) < 0.02);

      // 4. Case B: Active Drum Hits in Tail -> Equal-Power Crossfade (trims old hits so they never double-flam!)
      const activeClip1 = {
        id: 'act-c1',
        name: 'Active Beats Part 1',
        wavFile: ohPart1Path,
        startSec: 0,
        offsetSec: 0,
        durationSec: 6.5,
        sourceDurationSec: 6.5,
        // Simulate active snare/kick hits continuing at 4.8s and 5.5s
        transients: [0.5, 1.5, 2.5, 3.5, 4.8, 5.5].map(t => ({ timeSec: t, peakDb: -2, velocity: 0.9 })),
      };
      const activeClip2 = {
        id: 'act-c2',
        name: 'Active Beats Part 2',
        wavFile: ohPart2Path,
        startSec: 2.0,
        offsetSec: 0,
        durationSec: 6.0,
        sourceDurationSec: 6.0,
      };
      const activeTrack = buildTrackFromWizard({ profileId: 'snare-top', name: 'Snare Active', armed: true });
      activeTrack.clips.push(activeClip1, activeClip2);
      const activeProj = createEmptyProject({ name: 'Active Overlap Punch', bpm: 120, sampleRate: sr });
      activeProj.tracks.push(activeTrack);

      const activeCheck = classifyClipTailAsRingOut(activeClip1, 4.165);
      assert.strictEqual(activeCheck.isRingOut, false, 'Active hits at 4.8s & 5.5s must NOT classify as ring-out');

      const activeRes = reconcileStepRecordingPass(activeProj, {
        punchStartSec: 2.0,
        recordedClips: [{ trackId: activeTrack.id, clip: activeClip2 }],
      });
      assert.strictEqual(activeRes.blended, true);
      assert.strictEqual(activeRes.activeXfadeCount, 1);
      assert.strictEqual(activeClip1.stepBlendMode, 'equal-power-xfade');
      assert.strictEqual(activeClip1.fadeOutSec, 0.075);
      assert.strictEqual(activeClip2.fadeInSec, 0.075);
      assert.ok(Math.abs((activeClip1.startSec + activeClip1.durationSec) - (activeClip2.startSec + 0.075)) < 0.01);

      // 5. Multi-Segment Stitched MP4 Video + Stereo Audio Export (`segments` FFmpeg cross-dissolve pipeline)
      const exportSegments = buildTrackVideoExportSegments(vidTrack, {
        renderStartSec: 0,
        renderEndSec: 8.0,
      });
      assert.strictEqual(exportSegments.length, 2);
      assert.ok(exportSegments[1].effectiveXfadeSec > 0.05);

      const stereoLeft = new Float32Array(8 * sr);
      const stereoRight = new Float32Array(8 * sr);
      for (let i = 0; i < stereoLeft.length; i++) {
        const v = 0.25 * Math.sin(2 * Math.PI * 220 * (i / sr));
        stereoLeft[i] = v;
        stereoRight[i] = v;
      }
      const stereoWavBuf = Buffer.from(DE.encodeStereoFloat32ToWavBytes(stereoLeft, stereoRight, sr));
      const stitchedMp4Out = path.join(tmpDir, 'stitched-step-session.mp4');

      const mp4Res = await transcodeMixdownBuffer(stereoWavBuf, {
        outPath: stitchedMp4Out,
        format: 'mp4',
        quality: 'stream_copy', // multi-segment auto-switches cleanly to frame-accurate H.264 xfade stitch
        sampleRate: sr,
        title: 'Step Recording Stitched Drum Video',
        videoMuxSpec: {
          segments: exportSegments,
          renderStartSec: 0,
          renderEndSec: 8.0,
        },
      });
      assert.strictEqual(mp4Res.ok, true);
      assert.strictEqual(mp4Res.stitchedSegments, 2);
      assert.ok(fs.existsSync(stitchedMp4Out));
      const info = await probeVideoFileInfo(stitchedMp4Out);
      assert.strictEqual(info.hasVideo, true);
      assert.strictEqual(info.hasAudio, true);
      assert.ok(Math.abs(info.durationSec - 8.0) < 0.45, `Expected ~8.0s stitched MP4 duration, got ${info.durationSec}`);

      // 6. Verify renderer pre-roll headphone cueing, auto-input switch, equal-power envelope & stitched MP4 option
      const appSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
      assert.ok(appSrc.includes('isArmedCueTrack'), 'Armed tracks should play prior clips in headphones during pre-roll');
      assert.ok(appSrc.includes('armedPreRollBusGain'), 'Armed pre-roll bus should auto-duck when live playing begins');
      assert.ok(appSrc.includes('scheduleClipFadeEnvelope'), 'Playback & mixdown should apply equal-power clip fade curves');
      assert.ok(appSrc.includes('Full Stitched Track'), 'Export MP4 should offer Full Stitched Track across multi-part takes');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('streams continuous 15 fps live preview frames via LiveCameraMonitor & dual-output VideoTrackRecorder without V4L2 freeze or blank timeline preview', async () => {
    const http = require('http');
    const { PassThrough } = require('stream');
    const { execFileSync } = require('child_process');
    const {
      extractMjpegFramesFromStream,
      captureVideoSourceSnapshot,
      buildVideoTrack,
      probeVideoFileInfo,
      LiveCameraMonitor,
      VideoTrackRecorder,
    } = require('../lib/video-devices');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-daw-live-vid-'));
    let mjpegServer = null;
    const activeClients = new Set();
    try {
      // 0. Regression guard: V4L2 path in `captureVideoSourceSnapshot` must never hit TDZ (`userPromise`)
      await assert.rejects(
        () => captureVideoSourceSnapshot({ sourceType: 'v4l2', devicePath: '/dev/nonexistent-v4l2-test' }),
        (err) => {
          assert.ok(!/userPromise|before initialization/i.test(err.message), `Unexpected TDZ error: ${err.message}`);
          return true;
        }
      );
      // 1. Unit test chunk-boundary MJPEG SOI/EOI parser
      const fakeStream = new PassThrough();
      const parsedFrames = [];
      extractMjpegFramesFromStream(fakeStream, (jpg, idx) => parsedFrames.push({ jpg, idx }));
      const f1 = Buffer.from([0xff, 0xd8, 0x11, 0x22, 0x33, 0xff, 0xd9]);
      const f2 = Buffer.from([0xff, 0xd8, 0x44, 0x55, 0x66, 0x77, 0xff, 0xd9]);
      fakeStream.write(Buffer.concat([Buffer.from([0x00, 0x01]), f1.subarray(0, 4)]));
      fakeStream.write(Buffer.concat([f1.subarray(4), f2.subarray(0, 3)]));
      fakeStream.write(f2.subarray(3));
      assert.strictEqual(parsedFrames.length, 2);
      assert.strictEqual(parsedFrames[0].jpg.length, f1.length);
      assert.strictEqual(parsedFrames[1].jpg.length, f2.length);

      // 2. Spin up an in-process 20 fps multipart MJPEG camera server using 2 distinct test JPEG frames
      const jpgA = execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=1:duration=1',
        '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
      ]);
      const jpgB = execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=1:duration=2',
        '-ss', '1', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
      ]);

      mjpegServer = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=robosframe',
          'Cache-Control': 'no-cache',
          Connection: 'close',
        });
        let tick = 0;
        const pushFrame = () => {
          const frame = (tick++ % 2 === 0) ? jpgA : jpgB;
          try {
            res.write(`--robosframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
            res.write(frame);
            res.write('\r\n');
          } catch {}
        };
        pushFrame();
        const timer = setInterval(pushFrame, 50);
        activeClients.add({ res, timer });
        req.on('close', () => {
          clearInterval(timer);
        });
      });

      await new Promise(resolve => mjpegServer.listen(0, '127.0.0.1', resolve));
      const port = mjpegServer.address().port;
      const vcfg = {
        id: `test-cam:${port}`,
        sourceType: 'ip-camera',
        protocol: 'mjpeg',
        label: 'OBSBOT Sim Camera',
        shortName: 'OBSBOT Sim',
        streamUrl: `http://127.0.0.1:${port}/video`,
        qualityPreset: 'hd-720p',
        fps: 20,
      };

      // 3. Verify `LiveCameraMonitor` streams live frames and cleanly stops before recording
      const liveMon = new LiveCameraMonitor();
      const monFrames = [];
      await liveMon.start(vcfg, {
        trackId: 'trk-vid-live',
        onLiveFrame: (f) => monFrames.push(f),
      });
      const monDeadline = Date.now() + 2500;
      while (monFrames.length < 3 && Date.now() < monDeadline) {
        await new Promise(r => setTimeout(r, 60));
      }
      assert.ok(monFrames.length >= 2, `Expected >= 2 LiveCameraMonitor frames, got ${monFrames.length}`);
      assert.ok(liveMon.getLatestFrame(vcfg).startsWith('data:image/jpeg;base64,'));
      await liveMon.stop();
      assert.strictEqual(liveMon.isRunning(), false);

      // 4. Verify `VideoTrackRecorder` `waitCaptureReady()` + exact `earsStartWallMs` & `stopTimelineSec` sync lock!
      const vidTrack = buildVideoTrack({ name: 'OBSBOT Tiny 2 Lite', videoConfig: vcfg, armed: true });
      const proj = { projectDir: tmpDir, sampleRate: 48000, tracks: [vidTrack] };
      const rec = new VideoTrackRecorder();
      const recFrames = [];
      rec.start(proj, {
        startSec: 24.0,
        injectTestSignal: false,
        onLiveFrame: (f) => recFrames.push(f),
      });

      const readyOk = await rec.waitCaptureReady(2600);
      assert.strictEqual(readyOk, true, 'waitCaptureReady should resolve once camera begins streaming');
      const simulatedEarsStartWallMs = Date.now() + 55; // Backing audio hits headphones AFTER camera is ready

      const recDeadline = Date.now() + 2800;
      while (recFrames.length < 4 && Date.now() < recDeadline) {
        await new Promise(r => setTimeout(r, 60));
      }
      assert.ok(recFrames.length >= 3, `Expected continuous live frames during recording, got ${recFrames.length}`);
      assert.strictEqual(recFrames[0].trackId, vidTrack.id);
      assert.strictEqual(recFrames[0].fromRecorder, true);
      assert.ok(rec.getLiveFrameForConfig(vcfg).startsWith('data:image/jpeg;base64,'));
      await new Promise(r => setTimeout(r, 950));

      const stopRes = await rec.stop({
        injectTestSignal: false,
        earsStartWallMs: simulatedEarsStartWallMs,
        stopTimelineSec: 24.75,
      });
      assert.strictEqual(stopRes.ok, true);
      assert.strictEqual(stopRes.recordedVideoClips.length, 1);
      const vClip = stopRes.recordedVideoClips[0].clip;
      assert.strictEqual(vClip.startSec, 24.0, 'Video clip startSec must lock to exact punchStartSec (24.0s)');
      assert.ok(vClip.offsetSec > 0.04, `Expected pre-roll offsetSec > 0.04s, got ${vClip.offsetSec}`);
      assert.strictEqual(vClip.durationSec, 0.75, 'Video clip durationSec must lock to exact stopTimelineSec (24.75 - 24.0 = 0.75s)');
      const mp4Info = await probeVideoFileInfo(vClip.videoFile);
      assert.strictEqual(mp4Info.hasVideo, true);

      // 5. Verify renderer & pop-out window live frame + audible output latency + PLL video sync wiring
      const pkgRoot = path.join(__dirname, '..');
      const appSrc = fs.readFileSync(path.join(pkgRoot, 'renderer', 'app.js'), 'utf8');
      const vidWinSrc = fs.readFileSync(path.join(pkgRoot, 'renderer', 'video-window.js'), 'utf8');
      assert.ok(!appSrc.includes('embedded-video-live-img'), 'Must not reference nonexistent #embedded-video-live-img');
      assert.ok(appSrc.includes('ingestLiveRecordingVideoThumbFromDataUrl'));
      assert.ok(appSrc.includes('getAudibleOutputLatencySec'));
      assert.ok(!/\baudioCtx\b/.test(appSrc), 'Must use studioAudioCtx (never undeclared audioCtx) in renderer/app.js');
      assert.ok(appSrc.includes('videoEl.playbackRate'));
      assert.ok(appSrc.includes('onVideoLiveFrame'));
      assert.ok(vidWinSrc.includes('onLiveFrame'));
      assert.ok(vidWinSrc.includes('videoEl.playbackRate'));
    } finally {
      for (const c of activeClients) {
        clearInterval(c.timer);
        try { c.res.destroy(); } catch {}
      }
      if (mjpegServer) {
        await new Promise(resolve => mjpegServer.close(() => resolve()));
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
