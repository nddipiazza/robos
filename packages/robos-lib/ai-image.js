/**
 * robos-lib/ai-image.js
 *
 * Generates an image with a Gemini model through the Antigravity CLI (agy), using
 * the user's existing agy sign-in. agy's generate_image tool writes into its own
 * "brain" folder, so this runs agy in a scratch folder holding the reference
 * images, finds the file it made and copies it to outFile.
 *
 *   const { ok, file, error } = await generateImage({
 *     prompt: 'A forest battle backdrop, 8-bit pixel art',
 *     references: ['/path/to/screenshot.png'],
 *     outFile: '/path/to/backdrop.png',
 *   });
 */

'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { guardPrompt } = require('./ai-agent');

// gemini-3.8-flash models answer "no generate_image tool" in headless agy runs.
const DEFAULT_MODEL = 'gemini-4-argon-medium';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
// agy's copies of the images it was shown, which its replies sometimes name as the result.
const SHOWN_IMAGES_DIR = '.system_generated';

function fileHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function brainDir() {
  return path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
}

function isImageFile(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    if (head[0] === 0xff && head[1] === 0xd8) return true;
    return head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP';
  } catch {
    return false;
  }
}

function newImagesUnder(dir, sinceMs, found = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== SHOWN_IMAGES_DIR) newImagesUnder(full, sinceMs, found);
    } else if (IMAGE_RE.test(entry.name)) {
      try { if (fs.statSync(full).mtimeMs >= sinceMs) found.push(full); } catch {}
    }
  }
  return found;
}

/** The image an agy run made: a path in its reply, else the newest image in its brain folder. */
function findGeneratedImage(response, { conversationId, sinceMs, workDir, referenceHashes = new Set() }) {
  const isNew = (file) => {
    try {
      return fs.statSync(file).mtimeMs >= sinceMs && isImageFile(file) && !referenceHashes.has(fileHash(file));
    } catch {
      return false;
    }
  };
  const named = String(response || '').match(/\/[^\s)`"'\]]+\.(?:png|jpe?g|webp)/gi) || [];
  for (const candidate of named) {
    if (candidate.startsWith(workDir) || candidate.includes(`/${SHOWN_IMAGES_DIR}/`)) continue;
    if (isNew(candidate)) return candidate;
  }
  const roots = conversationId ? [path.join(brainDir(), conversationId), brainDir()] : [brainDir()];
  for (const root of roots) {
    const images = newImagesUnder(root, sinceMs).filter(isNew);
    if (images.length) return images.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  }
  return null;
}

function parseStream(stdout) {
  const out = { conversationId: null, response: '', status: null };
  for (const line of stdout.split('\n')) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.event === 'init') out.conversationId = event.conversation_id || null;
    if (event.event === 'result' && event.result) {
      out.conversationId = event.result.conversation_id || out.conversationId;
      out.response = event.result.response || '';
      out.status = event.result.status || null;
    }
  }
  return out;
}

function runAgy(prompt, { cwd, model, timeoutMs, bin }) {
  const args = ['--model', model, '--print-timeout', `${Math.ceil(timeoutMs / 1000)}s`, '--output-format', 'stream-json', '-p', prompt];
  return new Promise((resolve) => {
    const proc = cp.spawn(bin, args, { cwd, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs + 30000 });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('error', e => resolve({ code: -1, stdout, stderr: e.message }));
    proc.on('close', code => resolve({ code, stdout, stderr }));
  });
}

/**
 * @param {{ prompt: string, references?: string[], outFile: string, model?: string, timeoutMs?: number, retries?: number, bin?: string }} opts
 * @returns {Promise<{ ok: boolean, file?: string, error?: string, model: string, attempts: number }>}
 */
async function generateImage(opts) {
  const { prompt, references = [], outFile, retries = 1, bin = 'agy' } = opts;
  const model = opts.model || DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  if (!outFile) throw new Error('generateImage needs an outFile');

  const scan = guardPrompt(String(prompt || ''));
  if (scan.blocked) return { ok: false, error: scan.summary, model, attempts: 0 };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-ai-image-'));
  try {
    const refNames = references.map((ref, i) => {
      const name = `ref-${i + 1}${path.extname(ref).toLowerCase()}`;
      fs.copyFileSync(ref, path.join(workDir, name));
      return name;
    });
    const referenceHashes = new Set(references.map(fileHash));
    const refLine = refNames.length
      ? `View these reference images in the current folder and pass them to generate_image as image inputs: ${refNames.join(', ')}.`
      : 'There are no reference images.';
    const fullPrompt = [
      'Do not run any shell commands. Call the generate_image tool exactly once.',
      refLine,
      `Image description: ${scan.text}`,
      'The result must be a new image, not a copy of a reference. Then print the absolute path of the generated file. If the tool fails, print the exact error.',
    ].join('\n');

    let lastError = 'agy produced no image';
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const sinceMs = Date.now() - 1000;
      const run = await runAgy(fullPrompt, { cwd: workDir, model, timeoutMs, bin });
      const parsed = parseStream(run.stdout);
      const found = findGeneratedImage(parsed.response, { conversationId: parsed.conversationId, sinceMs, workDir, referenceHashes });
      if (found) {
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.copyFileSync(found, outFile);
        return { ok: true, file: outFile, model, attempts: attempt };
      }
      lastError = run.code === 0
        ? `agy produced no image: ${parsed.response.slice(0, 300)}`
        : `agy failed: ${(run.stderr || run.stdout).trim().slice(0, 300) || `exit code ${run.code}`}`;
    }
    return { ok: false, error: lastError, model, attempts: retries + 1 };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { generateImage, findGeneratedImage, parseStream, isImageFile, DEFAULT_MODEL };
