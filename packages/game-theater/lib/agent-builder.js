'use strict';

/**
 * RobOS AI Multiplayer Game Theater — Dynamic AI Game Generator & Live Modifier.
 *
 * Uses `robos-lib/ai-agent` (`ask()`) so ANY authenticated RobOS Game User in the lobby
 * can dynamically generate a brand-new multiplayer game (`server.js` + Godot 4 `client.gd`)
 * or evolve an existing game on the fly, with automated Node VM + Headless Godot 4
 * compiler verification and self-healing repair retries.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { slugifyGameId, compileGameServerModule } = require('./game-runtime');

const GODOT_PROJECT_DIR = path.resolve(__dirname, '..', 'godot');
const WEB_GODOT_DIR = path.resolve(__dirname, '..', 'web', 'godot');

function requireRobosLib(modName) {
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean);
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  throw new Error(`RobOS shared module "${modName}" not found.`);
}

function findGodotBin() {
  const candidates = [
    process.env.GODOT_BIN,
    'godot4',
    'godot',
    path.join(os.homedir(), '.local', 'bin', 'godot4'),
    path.join(os.homedir(), 'apps', 'godot4'),
    '/usr/local/bin/godot4',
    '/usr/bin/godot4',
    '/usr/bin/godot',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (candidate.includes('/')) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
      const resolved = execFileSync('sh', ['-c', `command -v ${candidate}`], {
        encoding: 'utf8',
        timeout: 3000,
      }).trim();
      if (resolved) return resolved;
    } catch {}
  }
  return '';
}

function resolveAvailableProviderId(aiAgent, preferredId) {
  if (preferredId) return preferredId;
  const activeId = aiAgent.getActiveProviderId();
  const activeDef = aiAgent.PROVIDER_MAP?.[activeId];
  const isBinExecutable = (bin) =>
    (process.env.PATH || '').split(path.delimiter).some((dir) => {
      try {
        fs.accessSync(path.join(dir, bin), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });

  if (activeDef) {
    const resolved = aiAgent.resolveBin ? aiAgent.resolveBin(activeDef) : activeDef.bin;
    if (isBinExecutable(resolved)) return activeId;
  }

  for (const p of aiAgent.PROVIDERS || []) {
    const resolved = aiAgent.resolveBin ? aiAgent.resolveBin(p) : p.bin;
    if (isBinExecutable(resolved)) return p.id;
  }
  return activeId;
}

function extractJsonBundle(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('Empty response from RobOS Agent.');

  // Strip ```json ... ``` fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Could not parse JSON bundle from RobOS Agent output.');
  }
}

function validateBundle(bundle, { skipGodotValidation = false } = {}) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Bundle must be a JSON object.');
  }
  const manifest = bundle.manifest || {};
  const serverJs = String(bundle.serverJs || '').trim();
  const clientGd = String(bundle.clientGd || '').trim();

  if (!serverJs) throw new Error('Bundle missing non-empty "serverJs".');
  if (!clientGd) throw new Error('Bundle missing non-empty "clientGd".');

  // 1. Validate serverJs in Node VM
  const compiled = compileGameServerModule(serverJs, 'validate-server.js');
  const minPlayers = Math.max(1, Number(manifest.minPlayers ?? compiled.meta.minPlayers ?? 2));
  const maxPlayers = Math.max(minPlayers, Number(manifest.maxPlayers ?? compiled.meta.maxPlayers ?? 2));

  const mockPlayers = [];
  for (let i = 0; i < minPlayers; i++) {
    mockPlayers.push({
      uid: `player-${i + 1}`,
      name: `Player ${i + 1}`,
      shortName: `P${i + 1}`,
      gamerTag: `Gamer${i + 1}`,
      avatar: i === 0 ? '🧙‍♂️' : '🛡️',
      color: i === 0 ? '#00bcd4' : '#ec4899',
    });
  }

  const initialState = compiled.createInitialState(mockPlayers, {});
  if (!initialState || typeof initialState !== 'object') {
    throw new Error('createInitialState(players, options) must return a state object.');
  }

  const samples = [];
  for (const mp of mockPlayers) {
    const view = compiled.getPlayerView(initialState, mp.uid);
    if (!view || typeof view !== 'object') {
      throw new Error(`getPlayerView(state, "${mp.uid}") must return a Dictionary/object.`);
    }
    samples.push({
      view,
      me: mp,
      lobby: {
        seats: mockPlayers,
        onlinePlayers: mockPlayers,
        isSeated: true,
        matchStatus: 'playing',
        minPlayers,
        maxPlayers,
      },
    });
  }

  const spectatorView = compiled.getPlayerView(initialState, '__spectator__');
  if (!spectatorView || typeof spectatorView !== 'object') {
    throw new Error('getPlayerView(state, "__spectator__") must return a public spectator Dictionary/object.');
  }

  // Also include empty waiting view sample so client.gd handles pre-match view gracefully
  samples.unshift({
    view: {},
    me: mockPlayers[0],
    lobby: {
      seats: [mockPlayers[0]],
      onlinePlayers: mockPlayers,
      isSeated: true,
      matchStatus: 'idle',
      minPlayers,
      maxPlayers,
    },
  });

  // 2. Validate clientGd in Godot 4 Headless compiler & SceneTree
  const godotBin = skipGodotValidation ? '' : findGodotBin();
  if (godotBin) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-theater-gd-'));
    try {
      const gdPath = path.join(tmpDir, 'client.gd');
      const viewsPath = path.join(tmpDir, 'views.json');
      fs.writeFileSync(gdPath, clientGd, 'utf8');
      fs.writeFileSync(viewsPath, JSON.stringify({ samples }), 'utf8');

      let stdout = '';
      let stderr = '';
      try {
        stdout = execFileSync(
          godotBin,
          ['--headless', '--path', GODOT_PROJECT_DIR, '-s', 'res://scripts/validate_client.gd', '--', gdPath, viewsPath],
          { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch (err) {
        stdout = String(err.stdout || '');
        stderr = String(err.stderr || err.message || '');
        throw new Error(`Godot 4 client.gd validation failed:\n${stderr}\n${stdout}`.trim());
      }

      if (/SCRIPT ERROR:|Parse Error:|VALIDATE_ERROR:/i.test(stderr) || !stdout.includes('VALIDATION_OK')) {
        throw new Error(`Godot 4 GDScript error:\n${stderr}\n${stdout}`.trim());
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  return {
    manifest: {
      ...manifest,
      minPlayers,
      maxPlayers,
    },
    serverJs,
    clientGd,
  };
}

function buildSystemSpecPrompt() {
  return `You are the RobOS AI Multiplayer Game Theater Architect.
IMPORTANT: Do NOT invoke any tools, file readers, or shell commands. Reply directly and immediately with ONLY a single valid JSON object (no markdown commentary outside JSON) with this exact top-level structure:
{
  "manifest": {
    "id": "lowercase-kebab-slug",
    "title": "Human Game Title",
    "description": "Concise 1-sentence summary of rules",
    "minPlayers": 2,
    "maxPlayers": 2
  },
  "serverJs": "...CommonJS Node.js source code...",
  "clientGd": "...Godot 4.3 GDScript source code..."
}

=== STRICT CONTRACT FOR "serverJs" (CommonJS in restricted Node VM — NO require() except globals Math, Date, JSON, crypto.randomInt) ===
1. Export via \`module.exports = { meta, createInitialState, onPlayerAction, getPlayerView, onTick, onSeatsChanged };\` (\`onTick\` and \`onSeatsChanged\` are optional):
   - \`meta\`: \`{ title, description, minPlayers, maxPlayers, tickIntervalMs }\` (MUST match manifest minPlayers & maxPlayers! Set \`tickIntervalMs: 1000\` if the game uses real-time timers/countdowns).
   - \`createInitialState(players, options)\`:
     - \`players\` is an Array of seated player objects: \`[{ uid, name, shortName, gamerTag, avatar, color }, ...]\`.
     - Use \`Math.random()\` or \`crypto.randomInt(0, players.length)\` when random starter/question selection is required.
     - Return a plain JSON-serializable state object.
   - \`onPlayerAction(state, player, action)\`:
     - \`player\` is the seated player \`{ uid, name, shortName, gamerTag, avatar, color }\` who sent \`action\` (\`{ type: "...", ... }\`).
     - Validate turn/role ownership and inputs! On illegal move or wrong player's turn, return \`{ state, error: "Clear explanation" }\`.
     - On valid move, update state and return \`{ state }\`.
   - \`onTick(state, nowMs)\` (OPTIONAL — called automatically on the server every \`meta.tickIntervalMs || 1000\` ms while a match is playing):
     - Ideal for timed trivia rounds (e.g. cycling questions every 30 seconds), countdown clocks, or real-time mechanics!
     - Update countdowns / advance expired rounds using \`nowMs\` and return \`{ state }\` (the runtime automatically broadcasts whenever \`state\` changes).
   - \`onSeatsChanged(state, seats)\` (OPTIONAL — called if a player joins/leaves a seat mid-match when \`seats.length <= maxPlayers\`):
     - Sync \`state.players\` / \`state.scores\` so newly seated players appear on the leaderboard immediately without resetting scores.
   - \`getPlayerView(state, viewerUid)\`:
     - Return a JSON-serializable Dictionary tailored specifically to \`viewerUid\` (note: \`viewerUid\` may also be \`"__spectator__"\` for the live RobOS Spectator Dashboard & Smart TV Wallboard).
     - NEVER leak hidden secrets (such as unguessed secret words/phrases, unrevealed correct multiple-choice index, or hidden hands) to \`"__spectator__"\` or any player who should not see them yet! Always include public stage progress, scores/leaderboard, and round status so spectators on the TV can follow the match live.
2. LARGE CONTENT & TRIVIA PACKING RULE:
   - If the user requests hundreds of items/questions (e.g. 500 trivia counts, large word banks, card decks), keep the JSON compact and fast to emit: encode datasets as compact single-line pipe-delimited strings (e.g. \`"Subject|Correct|Alt1|Alt2|Alt3"\` or \`"Category|Subject|CorrectValue"\` paired with realistic scale-aware distractor generation in JS) with ZERO comments or multi-line formatting per entry so the entire JSON bundle stays concise and complete.

=== STRICT CONTRACT FOR "clientGd" (Godot 4.3 GDScript) ===
1. MUST start with \`extends Control\` and declare:
   \`var send_action: Callable\`
2. MUST define:
   \`func apply_view(view: Dictionary, me: Dictionary, lobby: Dictionary) -> void:\`
   - Called immediately on mount and whenever \`serverJs\` updates state.
   - If \`view.is_empty()\`, display a friendly waiting message inside the Control.
   - To send an action to \`serverJs\`, call:
     \`if send_action.is_valid(): send_action.call({"type": "...", ...})\`
3. CRITICAL GODOT 4.3 GDSCRIPT COMPILER RULES (MUST FOLLOW 100%):
   - NEVER use \`:=\` type inference with \`Dictionary.get(...)\`, array indexing \`arr[i]\`, or \`Variant\` expressions! Godot 4 fails with "Cannot infer the type of variable because the value doesn't have a set type". ALWAYS write explicit types or plain \`=\`, e.g.:
     \`var phase: String = String(view.get("phase", ""))\`
     \`var wrong_count: int = int(view.get("wrongCount", 0))\`
     \`var letters: Array = view.get("guessedLetters", []) if typeof(view.get("guessedLetters")) == TYPE_ARRAY else []\`
   - Do NOT use ternary \`a ? b : c\` (JavaScript syntax) — GDScript uses \`b if cond else c\`!
   - Do NOT use \`&&\`, \`||\`, \`!\` — GDScript uses \`and\`, \`or\`, \`not\` (fine either way, prefer \`and\`/\`or\`/\`not\`).
   - Use Godot 4 APIs ONLY (not Godot 3):
     - \`btn.pressed.connect(func(): ...)\`
     - \`line_edit.text_submitted.connect(func(txt: String): ...)\`
     - \`Control.PRESET_FULL_RECT\`, \`HORIZONTAL_ALIGNMENT_CENTER\`, \`TextServer.AUTOWRAP_WORD_SMART\`
     - \`StyleBoxFlat.new()\` with \`add_theme_stylebox_override("panel", style)\` or \`"normal"\`
     - For custom 2D graphics (gallows, boards, tokens), create a child \`Control\` or draw inside a dedicated \`Control\` / custom draw helper using \`queue_redraw()\` and \`_draw()\` (\`draw_line\`, \`draw_circle\`, \`draw_arc\`, \`draw_rect\`). Note: inner \`class CanvasBoard extends Control:\` inside \`client.gd\` works great in Godot 4!
   - Prefer clean ASCII labels and procedural \`_draw()\` graphics over raw Unicode emojis so text renders crisply even before fallback emoji fonts finish loading.
   - Make the UI clean, dark-themed (\`#0d1117\` / \`#161b22\` / \`#00bcd4\` / \`#22c55e\` / \`#ef4444\`), responsive, legible, and fun to play!`;
}

async function askAgentForBundle(fullPrompt, options = {}) {
  if (typeof options.aiAsk === 'function') {
    return options.aiAsk(fullPrompt, options);
  }
  const aiAgent = requireRobosLib('ai-agent');
  const providerId = resolveAvailableProviderId(aiAgent, options.providerId);
  const isolatedCwd = path.join(os.tmpdir(), 'robos-theater-agent-cwd');
  fs.mkdirSync(isolatedCwd, { recursive: true });
  return aiAgent.ask(fullPrompt, {
    providerId,
    cwd: isolatedCwd,
    model: options.model || undefined,
    effort: options.effort || 'low',
    skipWritingPreamble: true,
    cliTimeoutMs: options.cliTimeoutMs || 900000,
    timeoutMs: options.timeoutMs || 900000,
  });
}

/**
 * Ensures `web/godot/index.html` + `index.wasm` has been exported at least once.
 */
function ensureGodotWebClientExported({ asyncRebuild = false } = {}) {
  const indexHtml = path.join(WEB_GODOT_DIR, 'index.html');
  const indexWasm = path.join(WEB_GODOT_DIR, 'index.wasm');
  const exportScript = path.join(GODOT_PROJECT_DIR, 'export_web.sh');

  if (!asyncRebuild && fs.existsSync(indexHtml) && fs.existsSync(indexWasm)) {
    return { exported: true, path: indexHtml };
  }
  if (!fs.existsSync(exportScript) || !findGodotBin()) {
    return { exported: fs.existsSync(indexHtml), path: indexHtml };
  }

  if (asyncRebuild) {
    const child = spawn('bash', [exportScript], {
      cwd: GODOT_PROJECT_DIR,
      stdio: 'ignore',
    });
    child.unref();
    return { exported: true, background: true, path: indexHtml };
  }

  execFileSync('bash', [exportScript], {
    cwd: GODOT_PROJECT_DIR,
    stdio: 'ignore',
    timeout: 45000,
  });
  return { exported: fs.existsSync(indexHtml), path: indexHtml };
}

async function generateOrModifyGame({
  mode = 'generate',
  runtime,
  gameId = '',
  title = '',
  prompt = '',
  requestedBy = null,
  providerId = '',
  aiAsk = null,
  skipGodotValidation = false,
  maxRepairs = 2,
} = {}) {
  if (!runtime) throw new Error('GameTheaterRuntime instance is required.');
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Game prompt is required.');

  if (runtime.agentStatus.busy) {
    throw new Error('RobOS Agent is already generating or updating a game. Please wait a moment.');
  }

  const requesterLabel = requestedBy?.shortName || requestedBy?.name || requestedBy?.gamerTag || 'RobOS Player';
  const existingRecord = mode === 'modify' ? runtime.getGameRecord(gameId || runtime.activeGameId) : null;
  if (mode === 'modify' && !existingRecord) {
    throw new Error('No existing game found to modify.');
  }

  runtime.setAgentStatus({
    busy: true,
    mode,
    requestedBy: requesterLabel,
    title: title || existingRecord?.manifest?.title || '',
    prompt: cleanPrompt,
    step:
      mode === 'modify'
        ? `Asking RobOS Agent to update "${existingRecord.manifest.title}"...`
        : `Asking RobOS Agent to design "${title || 'new multiplayer game'}"...`,
    error: null,
  });

  try {
    let taskSection = '';
    if (mode === 'modify' && existingRecord) {
      taskSection = `TASK: Modify the existing multiplayer game "${existingRecord.manifest.title}" (id: "${existingRecord.id}") according to this player request:
PLAYER CHANGE REQUEST:
${cleanPrompt}

CURRENT manifest.json:
${JSON.stringify(existingRecord.manifest, null, 2)}

CURRENT server.js:
${existingRecord.serverJs}

CURRENT client.gd:
${existingRecord.clientGd}

Keep manifest.id as "${existingRecord.id}" unless a rename was explicitly requested, and return the complete updated JSON bundle {"manifest", "serverJs", "clientGd"}.`;
    } else {
      taskSection = `TASK: Create a brand-new multiplayer game for RobOS AI Multiplayer Game Theater!
${title ? `REQUESTED GAME TITLE: ${title}\n` : ''}PLAYER GAME SPECIFICATION:
${cleanPrompt}

Return ONLY the complete JSON bundle {"manifest", "serverJs", "clientGd"}.`;
    }

    let currentPrompt = `${buildSystemSpecPrompt()}\n\n${taskSection}`;
    let lastErr = null;
    let validated = null;

    for (let attempt = 0; attempt <= maxRepairs; attempt++) {
      const baseStep =
        attempt > 0
          ? `Auto-repairing compiler check (attempt ${attempt}/${maxRepairs})`
          : mode === 'modify'
            ? `Asking RobOS Agent to update "${existingRecord.manifest.title}"`
            : `Asking RobOS Agent to design "${title || 'new multiplayer game'}"`;

      const attemptStartedAt = Date.now();
      runtime.setAgentStatus({
        busy: true,
        step: `${baseStep}...`,
      });
      const progressTimer = setInterval(() => {
        const secs = Math.floor((Date.now() - attemptStartedAt) / 1000);
        runtime.setAgentStatus({
          busy: true,
          step: `${baseStep}... (${secs}s elapsed)`,
        });
      }, 4000);
      progressTimer.unref?.();

      let res;
      try {
        res = await askAgentForBundle(currentPrompt, { providerId, aiAsk });
      } finally {
        clearInterval(progressTimer);
      }
      if (!res || !res.ok) {
        throw new Error(res?.error || 'RobOS Agent invocation failed.');
      }

      try {
        runtime.setAgentStatus({
          busy: true,
          step: 'Validating Node VM server.js & compiling Godot 4 client.gd...',
        });
        const rawBundle = extractJsonBundle(res.text);
        validated = validateBundle(rawBundle, { skipGodotValidation });
        break;
      } catch (validationErr) {
        lastErr = validationErr;
        if (attempt >= maxRepairs) {
          throw validationErr;
        }
        currentPrompt = `${buildSystemSpecPrompt()}

Your previous JSON bundle had the following validation / compiler error:
${validationErr.message}

PREVIOUS OUTPUT TO FIX:
${res.text}

Fix ALL errors and return ONLY the corrected JSON object {"manifest", "serverJs", "clientGd"}.`;
      }
    }

    if (!validated) {
      throw lastErr || new Error('Failed to validate generated game.');
    }

    const finalId =
      mode === 'modify' && existingRecord
        ? existingRecord.id
        : slugifyGameId(title || validated.manifest.id || validated.manifest.title);

    const saved = runtime.saveAndActivateGame({
      id: finalId,
      manifest: {
        ...validated.manifest,
        id: finalId,
        ...(title && mode === 'generate' ? { title } : {}),
        createdBy: existingRecord?.manifest?.createdBy || requestedBy?.uid || 'robos-player',
        updatedBy: requestedBy?.uid || 'robos-player',
        lastPrompt: cleanPrompt,
      },
      serverJs: validated.serverJs,
      clientGd: validated.clientGd,
      activate: true,
    });

    // Also mirror the generated GDScript into godot/generated/ for developer inspection
    try {
      const genDir = path.join(GODOT_PROJECT_DIR, 'generated');
      fs.mkdirSync(genDir, { recursive: true });
      fs.writeFileSync(path.join(genDir, `${saved.id}.gd`), saved.clientGd, 'utf8');
    } catch {}

    runtime.setAgentStatus({
      busy: false,
      mode: null,
      step: `${requesterLabel} ${mode === 'modify' ? 'updated' : 'created'} "${saved.manifest.title}" (v${saved.manifest.version})!`,
      error: null,
    });

    return {
      ok: true,
      game: {
        ...saved.manifest,
        serverJs: saved.serverJs,
        clientGd: saved.clientGd,
      },
    };
  } catch (err) {
    runtime.setAgentStatus({
      busy: false,
      mode: null,
      step: '',
      error: err.message,
    });
    throw err;
  }
}

module.exports = {
  GODOT_PROJECT_DIR,
  WEB_GODOT_DIR,
  findGodotBin,
  resolveAvailableProviderId,
  extractJsonBundle,
  validateBundle,
  ensureGodotWebClientExported,
  generateOrModifyGame,
};
