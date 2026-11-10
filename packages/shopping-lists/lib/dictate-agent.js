'use strict';

/**
 * RobOS Shopping Lists — Voice Dictation -> Whisper STT -> RobOS Agent (`/shopping-lists` Skill) Pipeline
 *
 * Accepts raw recorded audio (WebM/Opus, OGG/Opus, MP4/AAC, WAV) from the Android PWA (`:19225`)
 * or Desktop Electron App (`packages/shopping-lists`), transcribes it with Whisper STT
 * (`packages/voice-prompt/lib/stt-engine.js` + `ffmpeg`), and uses the RobOS AI Agent
 * (`robos-lib/ai-agent`) + `/shopping-lists` skill (`SkillsExecutor` / `executeTextCommand`)
 * to turn spoken dictation into structured shopping list actions across
 * 1) Grocery, 2) Target, and 3) Costco.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { normalizeShoppingVoiceTranscript } = require('./defaults');
const { executeTextCommand } = require('./text-commands');

function requireOptional(candidates) {
  for (const p of candidates) {
    if (!p) continue;
    try { return require(p); } catch {}
  }
  return null;
}

const sttMod = requireOptional([
  path.resolve(__dirname, '..', '..', 'voice-prompt', 'lib', 'stt-engine'),
  '/usr/local/share/robos/voice-prompt/lib/stt-engine',
]);

const skillsExecutorMod = requireOptional([
  path.resolve(__dirname, '..', '..', 'voice-prompt', 'lib', 'skills-executor'),
  '/usr/local/share/robos/voice-prompt/lib/skills-executor',
]);

const aiAgentMod = requireOptional([
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-agent'),
  path.resolve(__dirname, '..', '..', 'robos-lib', 'ai-agent'),
  '/usr/local/share/robos/robos-lib/ai-agent',
]);

let sharedSttEngine = null;
function getSharedSttEngine() {
  if (!sharedSttEngine && sttMod?.STTEngine) {
    sharedSttEngine = new sttMod.STTEngine();
  }
  return sharedSttEngine;
}

// Pre-warm the Whisper STT worker in the background when server starts (outside unit test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  try { getSharedSttEngine(); } catch {}
}

/**
 * Safely decode a base64 audio string or Data URL (including multi-parameter MIME types
 * like `data:audio/webm;codecs=opus;base64,...` or `data:audio/mp4;codecs=mp4a.40.2;base64,...`).
 */
function decodeBase64Audio(audioBase64) {
  const raw = String(audioBase64 || '').trim();
  if (!raw) return Buffer.alloc(0);
  const commaIdx = raw.indexOf(',');
  const b64 = (raw.startsWith('data:') && commaIdx !== -1)
    ? raw.slice(commaIdx + 1)
    : raw.replace(/^data:.*?;base64,/i, '');
  return Buffer.from(b64.replace(/\s+/g, ''), 'base64');
}

/**
 * Boost quiet laptop/phone microphone recordings before passing PCM samples to Whisper.
 */
function normalizeAudioSamples(samples) {
  if (!samples || !samples.length) return samples;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.004 && peak < 0.85) {
    const gain = Math.min(15.0, 0.85 / peak);
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
    }
    return out;
  }
  return samples;
}

function convertAudioBufferToWav16k(audioBuffer, ext = 'webm') {
  return new Promise((resolve, reject) => {
    const tmpBase = path.join(os.tmpdir(), `robos-shop-dictate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const cleanExt = ext.replace(/[^a-z0-9]/gi, '') || 'webm';
    const inFile = `${tmpBase}.${cleanExt}`;
    const outWav = `${tmpBase}.wav`;

    try {
      fs.writeFileSync(inFile, audioBuffer);
    } catch (err) {
      return reject(err);
    }

    execFile(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', inFile, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outWav],
      { timeout: 15000 },
      (err, _stdout, stderr) => {
        try { fs.unlinkSync(inFile); } catch {}
        if (err || !fs.existsSync(outWav)) {
          try { fs.unlinkSync(outWav); } catch {}
          const firstErrLine = String(stderr || err?.message || 'ffmpeg could not convert audio')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .pop() || 'Unsupported or empty audio recording';
          return reject(new Error(`Audio decoding failed: ${firstErrLine}`));
        }
        resolve(outWav);
      },
    );
  });
}

async function transcribeAudioBuffer(audioBuffer, { mimeType = 'audio/webm', sttTranscribeFn } = {}) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    return '';
  }

  if (typeof sttTranscribeFn === 'function') {
    const raw = await sttTranscribeFn(audioBuffer, mimeType);
    return normalizeShoppingVoiceTranscript(raw || '');
  }

  const ext = mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('ogg')
      ? 'ogg'
      : mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a')
        ? 'm4a'
        : 'webm';

  let wavPath = '';
  try {
    wavPath = await convertAudioBufferToWav16k(audioBuffer, ext);
    const rawSamples = sttMod?.readWavToFloat32 ? sttMod.readWavToFloat32(wavPath) : null;
    if (!rawSamples || rawSamples.length === 0) return '';
    const samples = normalizeAudioSamples(rawSamples);
    const engine = getSharedSttEngine();
    if (!engine) return '';
    const opts = samples.length > 16000 * 30 ? { chunk_length_s: 30, stride_length_s: 5 } : {};
    const result = await engine.transcribeAsync(samples, opts);
    let cleaned = sttMod?.cleanTranscript ? sttMod.cleanTranscript(result?.text || '') : String(result?.text || '').trim();
    cleaned = cleaned
      .replace(/\((?:blank[\s_]*audio|silence|music|applause|laughter|noise|sigh|groan|cough|sound|whistle|whistling|inaudible|static|clicking|breathing|bell|beep|tone)\)/gi, '')
      .replace(/\*[^*]{1,30}\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalizeShoppingVoiceTranscript(cleaned);
  } finally {
    if (wavPath) {
      try { fs.unlinkSync(wavPath); } catch {}
    }
  }
}

/**
 * Offline conversational dictation splitter: turns natural multi-clause speech
 * (e.g. "I need 2 gallons of whole milk and blueberries at the grocery store, and also add tide pods to target")
 * into discrete `/shopping-lists` skill command strings.
 */
function extractOfflineSkillCommandsFromDictation(transcript, defaultListId = 'grocery') {
  const norm = normalizeShoppingVoiceTranscript(transcript || '')
    .replace(/^(?:ok|okay|hey|hi|yo)\s+(?:nabu|robos|row\s+bose)[\s,.:;-]*/i, '')
    .trim();
  if (!norm) return [];

  // Split multi-clause sentences separated by ";", ".", "and also", "then", or ", and <verb / store clause>"
  const clauses = norm
    .split(/\s*(?:;\s*|\.\s+|,?\s*\band\s+also\b|,?\s*\bthen\s+(?:also\s+)?(?=(?:add|put|grab|get|buy|need|check|uncheck|remove|delete|clear|undo)\b)|,\s*(?:and\s+)?(?:also\s+)?(?=(?:add|put|grab|get|buy|need|check|uncheck|remove|delete|clear|undo)\b)|,\s*and\s+(?=[^,;]+\b(?:to|at|on|in|from|for)\s+(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco)\b))\s*/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const commands = [];
  for (let clause of clauses) {
    clause = clause
      .replace(/^(?:and\s+also|also|and|then)\s+/i, '')
      .replace(/^(?:we(?:'re|\s+are)\s+[^,]+?\s+so\s+)/i, '')
      .replace(/^(?:i\s+(?:really\s+)?(?:need|want|have)\s+to\s+(?:get|buy|grab|pick\s+up|add)\s+)/i, 'add ')
      .replace(/^(?:(?:can|could|would)\s+you\s+(?:please\s+)?)?(?:please\s+)?(?:go\s+ahead\s+and\s+)?/i, '')
      .replace(/^(?:i\s+(?:also\s+)?(?:need|want)\s+)/i, 'add ')
      .replace(/^(?:let's\s+(?:get|buy|grab|add)\s+|grab\s+|pick\s+up\s+)/i, 'add ')
      .trim();

    if (!clause) continue;
    if (!/^(?:add|put|buy|get|need|check|mark|tick|cross|uncheck|remove|delete|drop|increase|decrease|set|change|qty|quantity|more|less|fewer|clear|undo|list|show|what)\b/i.test(clause)) {
      clause = `add ${clause}`;
    }
    commands.push(clause);
  }

  return commands.length ? commands : [`add ${norm} @${defaultListId}`];
}

function isExecutableBinaryOnPath(bin) {
  if (!bin) return false;
  return (process.env.PATH || '').split(path.delimiter).some((dir) => {
    try {
      fs.accessSync(path.join(dir, bin), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function resolveAvailableAgentOptions() {
  if (!aiAgentMod) return { timeoutMs: 10000, cliTimeoutMs: 10000 };
  try {
    const activeId = aiAgentMod.getActiveProviderId?.() || 'github-copilot';
    const activeDef = aiAgentMod.PROVIDER_MAP?.[activeId];
    const activeBin = activeDef && aiAgentMod.resolveBin ? aiAgentMod.resolveBin(activeDef) : activeDef?.bin;
    if (activeBin && isExecutableBinaryOnPath(activeBin)) {
      return {
        providerId: activeId,
        ...(activeId === 'antigravity' ? { model: 'Gemini 3.8 Flash (Low)' } : {}),
        timeoutMs: 10000,
        cliTimeoutMs: 10000,
      };
    }
    for (const p of aiAgentMod.PROVIDERS || []) {
      const candidateBin = aiAgentMod.resolveBin ? aiAgentMod.resolveBin(p) : p.bin;
      if (candidateBin && isExecutableBinaryOnPath(candidateBin)) {
        return {
          providerId: p.id,
          ...(p.id === 'antigravity' ? { model: 'Gemini 3.8 Flash (Low)' } : {}),
          timeoutMs: 10000,
          cliTimeoutMs: 10000,
        };
      }
    }
  } catch {}
  return { timeoutMs: 10000, cliTimeoutMs: 10000 };
}

function needsConversationalRecipeReasoning(norm) {
  return /\b(?:making|cooking|baking|preparing|recipe|ingredients?\s+for|what\s+do\s+(?:i|we)\s+need\s+for|dinner\s+tonight|breakfast|lunch)\b/i.test(norm);
}

/**
 * Uses the active RobOS AI Agent (`robos-lib/ai-agent`) grounded in the `/shopping-lists`
 * skill grammar to translate spoken dictation into `/shopping-lists` skill commands.
 */
async function planSkillCommandsWithAgent(transcript, store, { defaultListId = 'grocery', aiAskFn, forceAgent = false } = {}) {
  const norm = normalizeShoppingVoiceTranscript(transcript || '');
  if (!norm) return { usedAgent: false, commands: [] };

  const shouldUseAgent = Boolean(aiAskFn)
    || Boolean(forceAgent)
    || Boolean(aiAgentMod?.listProviders?.()?.api)
    || needsConversationalRecipeReasoning(norm);

  const ask = aiAskFn || (shouldUseAgent && aiAgentMod && typeof aiAgentMod.ask === 'function' ? aiAgentMod.ask.bind(aiAgentMod) : null);

  if (ask) {
    try {
      const snap = store.getSnapshot();
      const listsSummary = snap.lists
        .map((l) => `${l.id} (${l.name}: ${l.items.filter((i) => !i.checked).map((i) => `${i.name} [${i.qty} ${i.unit}]`).slice(0, 12).join(', ') || 'empty'})`)
        .join(' | ');

      const prompt = [
        'You are the RobOS Household Shopping Lists Skill Agent (`/shopping-lists`).',
        'Convert the user\'s spoken audio dictation into an array of `/shopping-lists` skill text commands.',
        `Available store lists: ${listsSummary}. Default list if unspecified: @${defaultListId}.`,
        'Supported `/shopping-lists` skill command syntax:',
        '  - "add <qty> <unit> <item> $<price> (<note>) #<badge>, <item2> @grocery|@target|@costco"',
        '  - "check <item> @grocery|@target|@costco"',
        '  - "uncheck <item> @grocery|@target|@costco"',
        '  - "remove <item> @grocery|@target|@costco"',
        '  - "qty <item> +1|-1|<number> @grocery|@target|@costco"',
        '  - "clear checked @grocery|@target|@costco" or "undo"',
        'Rules:',
        '  1. Extract all items, quantities, units (ea, pack, lb, oz, gal, case, bag, box, bunch), prices, notes, and store routing (@grocery, @target, @costco).',
        '  2. If the user mentions a dish or recipe alongside specific ingredients, add the requested ingredients.',
        '  3. Return ONLY a valid JSON object: {"commands": ["add ...", ...], "agentNote": "1-sentence summary"}.',
        `Spoken dictation transcript: ${JSON.stringify(norm)}`,
      ].join('\n');

      const askOpts = aiAskFn ? { timeoutMs: 12000 } : resolveAvailableAgentOptions();
      const rawReply = await ask(prompt, askOpts);
      const textReply = typeof rawReply === 'string' ? rawReply : (rawReply?.text || rawReply?.output || '');
      const jsonMatch = textReply.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const cmds = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.commands) ? parsed.commands : []);
        const cleanCmds = cmds.map((c) => String(c || '').trim()).filter(Boolean);
        if (cleanCmds.length > 0) {
          return {
            usedAgent: true,
            commands: cleanCmds,
            agentNote: parsed?.agentNote || '',
          };
        }
      }
    } catch {}
  }

  return {
    usedAgent: false,
    commands: extractOfflineSkillCommandsFromDictation(norm, defaultListId),
    agentNote: '',
  };
}

/**
 * Full end-to-end Dictation -> STT -> RobOS Agent (`/shopping-lists` skill) execution.
 */
async function processDictationAudio({
  store,
  audioBuffer,
  audioBase64,
  mimeType = 'audio/webm',
  transcriptHint = '',
  listId = '',
  autoSync = true,
  sttTranscribeFn,
  aiAskFn,
  forceAgent = false,
} = {}) {
  const effectiveListId = listId || store.getSnapshot().activeListId || 'grocery';
  const buf = audioBuffer || (audioBase64 ? decodeBase64Audio(audioBase64) : null);

  let transcript = '';
  if (buf && buf.length > 0) {
    try {
      transcript = await transcribeAudioBuffer(buf, { mimeType, sttTranscribeFn });
    } catch (err) {
      if (!transcriptHint) throw err;
    }
  }
  if (!transcript && transcriptHint) {
    transcript = normalizeShoppingVoiceTranscript(transcriptHint);
  }

  if (!transcript || !transcript.trim()) {
    throw new Error('Could not hear any speech in the recording. Tap Dictate, speak clearly, and tap Stop & Send.');
  }

  // 1. Plan `/shopping-lists` skill commands using the RobOS AI Agent / `/shopping-lists` skill planner
  let plan = await planSkillCommandsWithAgent(transcript, store, {
    defaultListId: effectiveListId,
    aiAskFn,
    forceAgent,
  });

  // 2. Execute each `/shopping-lists` skill command through SkillsExecutor / executeTextCommand
  let results = [];
  let summaries = [];
  const executor = skillsExecutorMod?.defaultSkillsExecutor;

  const runCommands = async (cmds) => {
    const outResults = [];
    const outSummaries = [];
    for (const cmd of cmds) {
      const res = await executeTextCommand(store, cmd, {
        listId: effectiveListId,
        autoSync,
      });
      outResults.push({ command: cmd, ...res });
      const msg = res.summary || res.spoken || res.text;
      if (msg) outSummaries.push(msg);
    }
    return { outResults, outSummaries };
  };

  ({ outResults: results, outSummaries: summaries } = await runCommands(plan.commands));

  // If offline skill command parsing did not match any actionable items and we haven't asked the AI agent yet,
  // escalate to the RobOS AI Agent (`robos-lib/ai-agent`) automatically.
  if (!plan.usedAgent && !aiAskFn && results.length > 0 && results.every((r) => !r.ok)) {
    const escalated = await planSkillCommandsWithAgent(transcript, store, {
      defaultListId: effectiveListId,
      forceAgent: true,
    });
    if (escalated.usedAgent && escalated.commands.length > 0) {
      plan = escalated;
      ({ outResults: results, outSummaries: summaries } = await runCommands(plan.commands));
    }
  }

  // Record skill invocation in SkillsExecutor telemetry if available
  if (executor && typeof executor.emit === 'function') {
    try {
      executor.emit('skill-executed', {
        skillId: 'shopping-lists',
        source: 'dictate-button',
        transcript,
        commands: plan.commands,
        usedAgent: plan.usedAgent,
      });
    } catch {}
  }

  const combinedSummary = summaries.join(' · ') || plan.agentNote || `Processed "${transcript}"`;
  return {
    ok: true,
    skillId: '/shopping-lists',
    usedAgent: plan.usedAgent,
    transcript,
    skillCommands: plan.commands,
    summary: combinedSummary,
    spokenSummary: summaries.map((s) => s.replace(/\s+/g, ' ')).join(' '),
    results,
    state: store.getSnapshot(),
  };
}

module.exports = {
  decodeBase64Audio,
  convertAudioBufferToWav16k,
  transcribeAudioBuffer,
  extractOfflineSkillCommandsFromDictation,
  planSkillCommandsWithAgent,
  processDictationAudio,
};
