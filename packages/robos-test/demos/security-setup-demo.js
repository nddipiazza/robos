/**
 * security-setup demo — walks the first-run wizard end-to-end.
 *
 * Uses the fresh-install scenario as a starting point, then drives the wizard
 * visually via goStep() and DOM mutations (no real GPG/SSH generation).
 *
 * Outputs (in packages/robos-test/run/demos/security-setup/):
 *   security-setup.webm
 *   security-setup.vtt
 *   security-setup-audio.wav
 *   security-setup-final.webm
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const { launchApp, killApp } = require('../lib/harness');
const { evalJS }             = require('../lib/snapshot');
const scenarios              = require('../lib/scenarios');
const {
  findWindowGeometry, startRecording, stopRecording,
  createCaptionTrack, writeVttFile,
} = require('../lib/recorder');
const {
  synthesizeCue, getAudioDurationMs, buildTimelineAudio, muxVideoAudio,
} = require('../lib/narrator');

const OUT_DIR       = path.join(__dirname, '..', 'run', 'demos', 'security-setup');
const OUT_VIDEO     = path.join(OUT_DIR, 'security-setup.webm');
const OUT_CAPTION   = path.join(OUT_DIR, 'security-setup.vtt');
const OUT_AUDIO     = path.join(OUT_DIR, 'security-setup-audio.wav');
const OUT_FINAL     = path.join(OUT_DIR, 'security-setup-final.webm');
const CUE_AUDIO_DIR = path.join(OUT_DIR, 'cue-audio');

const BREATHE_MS = 600;

// Helper JS snippets for visual-only state changes (no real key generation)
const MARK_PINENTRY_CONFIGURED = `
  (() => {
    const el = document.getElementById('pinentry-status');
    el.className = 'status-block ok';
    el.textContent = '\u2713 Secure passphrase dialog is configured.';
    document.getElementById('btn-configure-pinentry').textContent = 'Re-configure';
  })();
`;

const MARK_GPG_KEY_CREATED = `
  (() => {
    const el = document.getElementById('gpg-key-status');
    el.className = 'status-block ok';
    el.textContent = '\u2713 1 GPG key ready: Dev User <dev@example.com>';
    document.getElementById('create-key-form').classList.add('hidden');
  })();
`;

const POPULATE_PASS_KEY_INFO = `
  document.getElementById('pass-key-info').textContent = 'Dev User <dev@example.com>  (\u20267A4F9C3B2D8E1A5F)';
`;

const MARK_PASS_INITIALIZED = `
  (() => {
    const el = document.getElementById('pass-status');
    el.className = 'status-block ok';
    el.textContent = '\u2713 Pass store initialized successfully.';
  })();
`;

const MARK_SSH_GENERATED = `
  (() => {
    document.getElementById('ssh-generate-form').classList.add('hidden');
    document.getElementById('ssh-existing').classList.remove('hidden');
    const st = document.getElementById('ssh-status');
    st.className = 'status-block ok';
    st.textContent = '\u2713 SSH key found: ~/.ssh/id_ed25519';
    document.getElementById('ssh-pubkey-display').textContent =
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJdFakeKeyGeneratedForDemoPurposesOnly robos@dev-laptop';
  })();
`;

const POPULATE_DONE_SUMMARY = `
  document.getElementById('done-details').innerHTML =
    '<b>GPG Key:</b> Dev User <dev@example.com> (\u20267A4F9C3B2D8E1A5F)<br>' +
    '<b>Pass Store:</b> ~/.password-store<br>' +
    '<b>SSH Key:</b> ~/.ssh/id_ed25519<br>' +
    '<b>Pinentry:</b> GUI dialog configured<br><br>' +
    'Use <b>Reset</b> (top-right) to start over with fresh keys.';
`;

/**
 * Typewriter effect: fires native input events so any listeners see each char.
 */
const typeInto = (selector, text) => `
  (async () => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return;
    el.focus();
    el.value = '';
    for (const ch of ${JSON.stringify(text)}) {
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 55));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })();
`;

const SCRIPT = [
  {
    narration: 'RobOS Security Setup is the first-run wizard that configures everything you need for signed commits, encrypted secrets, and SSH access to GitHub.',
    js: `goStep(1); refreshStep1();`,
    minHold: 2500,
  },
  {
    narration: 'Step one: the GPG passphrase dialog. RobOS wires up pinentry so key prompts appear as a secure GUI, not in a terminal.',
    js: null,
    minHold: 2500,
  },
  {
    narration: 'Clicking Configure sets the pinentry program and cache timeouts in your GPG agent config.',
    js: MARK_PINENTRY_CONFIGURED,
    minHold: 2000,
  },
  {
    narration: 'Step two is your GPG key. It encrypts your password store and signs your git commits.',
    js: `goStep(2); refreshStep2();`,
    minHold: 2500,
  },
  {
    narration: 'Fill in your name, email, and a strong passphrase. RobOS generates a 4096-bit RSA key.',
    js: `(async () => {
      const t = (sel, txt) => new Promise(async r => {
        const el = document.querySelector(sel); el.focus(); el.value = '';
        for (const ch of txt) { el.value += ch; el.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(x=>setTimeout(x,55)); }
        r();
      });
      await t('#gpg-name', 'Dev User');
      await t('#gpg-email', 'dev@example.com');
      await t('#gpg-pass', 'correct horse battery');
      await t('#gpg-pass2', 'correct horse battery');
    })();`,
    minHold: 7000,
  },
  {
    narration: 'Once generated, the key is ready for the next step.',
    js: MARK_GPG_KEY_CREATED,
    minHold: 2500,
  },
  {
    narration: 'Step three initializes the password store using your new GPG key. Every secret RobOS stores will be encrypted with it.',
    js: `goStep(3); ${POPULATE_PASS_KEY_INFO}`,
    minHold: 2500,
  },
  {
    narration: 'A single click runs pass init and the store is live.',
    js: MARK_PASS_INITIALIZED,
    minHold: 2000,
  },
  {
    narration: 'Step four generates an Ed25519 SSH key for authenticating with GitHub and other git hosts.',
    js: `goStep(4);`,
    minHold: 3000,
  },
  {
    narration: 'Optionally add a comment, then generate.',
    js: typeInto('#ssh-comment', 'robos@dev-laptop'),
    minHold: 3000,
  },
  {
    narration: 'The key is generated and stored on disk. Click Next to continue.',
    js: MARK_SSH_GENERATED,
    minHold: 3500,
  },
  {
    narration: 'Step five. GPG key, password store, and SSH key are all set. You are ready to pick up your first task.',
    js: `goStep(5); ${POPULATE_DONE_SUMMARY}`,
    minHold: 4000,
  },
];

const SAMPLE_SCENARIO_TWEAKS = {};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function preSynthesize() {
  fs.rmSync(CUE_AUDIO_DIR, { recursive: true, force: true });
  fs.mkdirSync(CUE_AUDIO_DIR, { recursive: true });
  const audio = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const wav = path.join(CUE_AUDIO_DIR, `cue-${String(i).padStart(2, '0')}.wav`);
    process.stdout.write(`  [tts ${i+1}/${SCRIPT.length}] synthesizing...\r`);
    await synthesizeCue(SCRIPT[i].narration, wav);
    audio.push({ wav, durationMs: getAudioDurationMs(wav) });
  }
  process.stdout.write('\n');
  return audio;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Pre-synthesizing narration...');
  const cueAudio = await preSynthesize();
  cueAudio.forEach((a, i) => console.log(`    cue ${i+1}: ${(a.durationMs/1000).toFixed(2)}s`));

  const scenario = { ...scenarios['fresh-install'], ...SAMPLE_SCENARIO_TWEAKS, name: 'demo' };
  const app = await launchApp('security-setup', scenario);
  let rec = null;
  try {
    // Let the renderer finish its smart-startup logic before we start
    await sleep(1200);

    const geom = await findWindowGeometry('RobOS Security Setup');
    console.log('Window geometry:', geom);

    rec = startRecording({ geometry: geom, outPath: OUT_VIDEO });
    const captions = createCaptionTrack(rec);
    await sleep(500);

    const cueStartMs = [];
    for (let i = 0; i < SCRIPT.length; i++) {
      const { narration, js, minHold } = SCRIPT[i];
      process.stdout.write(`  [cue ${i+1}/${SCRIPT.length}] ${narration.slice(0, 60)}...\n`);
      if (js) await evalJS(app.port, js);
      const startMs = Date.now() - rec.startedAt;
      captions.add(narration);
      cueStartMs.push(startMs);
      const hold = Math.max(minHold, cueAudio[i].durationMs + BREATHE_MS);
      await sleep(hold);
    }

    const cues = captions.finalize();
    const result = await stopRecording(rec);
    rec = null;
    writeVttFile(cues, OUT_CAPTION);
    console.log(`Wrote ${result.outPath}  (${(result.durationMs/1000).toFixed(1)}s)`);
    console.log(`Wrote ${OUT_CAPTION}  (${cues.length} cues)`);

    console.log('Building narration timeline...');
    const timelineCues = cueAudio.map((a, i) => ({ wav: a.wav, startMs: cueStartMs[i] }));
    buildTimelineAudio(timelineCues, OUT_AUDIO, result.durationMs);
    console.log(`Wrote ${OUT_AUDIO}`);

    console.log('Muxing video + audio + captions...');
    muxVideoAudio(OUT_VIDEO, OUT_AUDIO, OUT_FINAL, { captionPath: OUT_CAPTION });
    console.log(`Wrote ${OUT_FINAL}`);
  } catch (err) {
    if (rec) await stopRecording(rec).catch(() => {});
    console.error('Demo failed:', err);
    process.exitCode = 1;
  } finally {
    await killApp(app);
  }
}

main();
