'use strict';

/**
 * RobOS Shopping Lists — Voice Dictation -> Whisper STT -> RobOS Agent (`/shopping-lists` Skill) Pipeline
 *
 * Accepts raw recorded audio (WebM/Opus, OGG, MP4/AAC, WAV) from the Android PWA (`:19225`)
 * or Desktop Electron App (`packages/shopping-lists`), transcribes it with Whisper STT
 * (`packages/voice-prompt/lib/stt-engine.js` + `ffmpeg`), and uses the active RobOS AI Agent
 * (`robos-lib/ai-agent`) + `/shopping-lists` skill (`SkillsExecutor` / `executeTextCommand`)
 * to turn free-form spoken dictation into structured shopping list actions across
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

function convertAudioBufferToWav16k(audioBuffer, ext = 'webm') {
  return new Promise((resolve, reject) => {
    const tmpBase = path.join(os.tmpdir(), `robos-shop-dictate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const inFile = `${tmpBase}.${ext.replace(/[^a-z0-9]/gi, '') || 'webm'}`;
    const outWav = `${tmpBase}.wav`;

    try {
      fs.writeFileSync(inFile, audioBuffer);
    } catch (err) {
      return reject(err);
    }

    execFile(
      'ffmpeg',
      ['-y', '-i', inFile, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outWav],
      { timeout: 15000 },
      (err) => {
        try { fs.unlinkSync(inFile); } catch {}
        if (err || !fs.existsSync(outWav)) {
          try { fs.unlinkSync(outWav); } catch {}
          return reject(new Error(`Audio decoding failed: ${err?.message || 'ffmpeg could not convert audio'}`));
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
    const samples = sttMod?.readWavToFloat32 ? sttMod.readWavToFloat32(wavPath) : null;
    if (!samples || samples.length === 0) return '';
    const engine = getSharedSttEngine();
    if (!engine) return '';
    const result = await engine.transcribeAsync(samples);
    const cleaned = sttMod?.cleanTranscript ? sttMod.cleanTranscript(result?.text || '') : String(result?.text || '').trim();
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
    .replace(/^(?:ok|okay|hey|hi|yo)\s+nabu[\s,.:;-]*/i, '')
    .trim();
  if (!norm) return [];

  // If it already starts with a direct command verb (add, check, remove, clear, undo, etc.) and has no conversational preamble,
  // check if it has multiple store clauses separated by "and also" / "then" / ";"
  const clauses = norm
    .split(/\s*(?:;\s*|\.\s+|\band\s+also\b|\bthen\s+(?:also\s+)?(?=(?:add|put|grab|get|buy|need|check|remove|delete)\b))\s*/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const commands = [];
  for (let clause of clauses) {
    // Strip conversational filler ("we're making tacos tonight so", "can you please", "I need to grab")
    clause = clause
      .replace(/^(?:we(?:'re|\s+are)\s+[^,]+?\s+so\s+)/i, '')
      .replace(/^(?:i\s+(?:really\s+)?(?:need|want|have)\s+to\s+(?:get|buy|grab|pick\s+up|add)\s+)/i, 'add ')
      .replace(/^(?:(?:can|could|would)\s+you\s+(?:please\s+)?)?(?:please\s+)?(?:go\s+ahead\s+and\s+)?/i, '')
      .replace(/^(?:i\s+(?:also\s+)?(?:need|want)\s+)/i, 'add ')
      .replace(/^(?:let's\s+(?:get|buy|grab|add)\s+|grab\s+|pick\s+up\s+)/i, 'add ')
      .trim();

    if (!clause) continue;
    if (!/^(?:add|put|buy|get|need|check|mark|tick|cross|uncheck|remove|delete|drop|increase|decrease|set|change|clear|undo|list|show|what)\b/i.test(clause)) {
      clause = `add ${clause}`;
    }
    commands.push(clause);
  }

  return commands.length ? commands : [`add ${norm} @${defaultListId}`];
}

/**
 * Uses the active RobOS AI Agent (`robos-lib/ai-agent`) grounded in the `/shopping-lists`
 * skill grammar to translate any spoken dictation into `/shopping-lists` skill commands.
 */
async function planSkillCommandsWithAgent(transcript, store, { defaultListId = 'grocery', aiAskFn } = {}) {
  const ask = aiAskFn || (aiAgentMod && typeof aiAgentMod.ask === 'function' ? aiAgentMod.ask.bind(aiAgentMod) : null);
  const norm = normalizeShoppingVoiceTranscript(transcript || '');
  if (!norm) return { usedAgent: false, commands: [] };

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
        '  2. If the user mentions a dish or recipe Alongside specific ingredients, add the requested ingredients.',
        '  3. Return ONLY a valid JSON object: {"commands": ["add ...", ...], "agentNote": "1-sentence summary"}.',
        `Spoken dictation transcript: ${JSON.stringify(norm)}`,
      ].join('\n');

      const rawReply = await ask(prompt, { timeoutMs: 18000 });
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
} = {}) {
  const effectiveListId = listId || store.getSnapshot().activeListId || 'grocery';
  const buf = audioBuffer || (audioBase64 ? Buffer.from(String(audioBase64).replace(/^data:[^;]+;base64,/, ''), 'base64') : null);

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
    throw new Error('Could not hear any speech in the recording. Hold or tap Dictate and speak clearly.');
  }

  // 1. Plan `/shopping-lists` skill commands using the RobOS AI Agent (with offline fallback)
  const plan = await planSkillCommandsWithAgent(transcript, store, {
    defaultListId: effectiveListId,
    aiAskFn,
  });

  // 2. Execute each `/shopping-lists` skill command through SkillsExecutor / executeTextCommand
  const results = [];
  const summaries = [];
  const executor = skillsExecutorMod?.defaultSkillsExecutor;

  for (const cmd of plan.commands) {
    const res = await executeTextCommand(store, cmd, {
      listId: effectiveListId,
      autoSync,
    });
    results.push({ command: cmd, ...res });
    if (res.summary) summaries.push(res.summary);
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
  convertAudioBufferToWav16k,
  transcribeAudioBuffer,
  extractOfflineSkillCommandsFromDictation,
  planSkillCommandsWithAgent,
  processDictationAudio,
};
