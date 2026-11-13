'use strict';

/**
 * RobOS AI Multiplayer Game Theater — Dynamic Game Cartridge Runtime & Lobby Engine.
 *
 * Manages:
 *   - Persisted dynamic games in `~/.config/robos/game-theater/games/<game-id>/`
 *     (`manifest.json`, `server.js`, `client.gd`, `revisions/`)
 *   - Sandboxed `vm` execution of AI-generated `server.js` modules with per-call timeouts
 *   - Strict multiplayer seat limits (`minPlayers` .. `maxPlayers`), lobby presence, chat,
 *     and per-player scoped views (`getPlayerView(state, viewerUid)`) so hidden-information
 *     games (like Hangman's secret phrase!) never leak secrets over the network.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { getTheaterDir, toPublicPlayerProfile } = require('./player-registry');

function slugifyGameId(input) {
  return (
    String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || `game-${crypto.randomBytes(3).toString('hex')}`
  );
}

const SPECTATOR_VIEWER_UID = '__spectator__';

function getGamesDir(options = {}) {
  return options.gamesDir || path.join(getTheaterDir(options), 'games');
}

function getLiveSpectatorFilePath(options = {}) {
  return options.spectatorStatePath || path.join(getTheaterDir(options), 'live-spectator.json');
}

function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * Compiles a dynamic `server.js` CommonJS string inside a restricted `node:vm` context.
 */
function compileGameServerModule(serverCode, filename = 'dynamic-game-server.js') {
  const exportsObj = {};
  const moduleObj = { exports: exportsObj };

  const sandbox = {
    module: moduleObj,
    exports: exportsObj,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Error,
    TypeError,
    RangeError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    crypto: {
      randomInt: (min, max) => (max === undefined ? crypto.randomInt(min) : crypto.randomInt(min, max)),
      randomUUID: () => crypto.randomUUID(),
    },
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  const script = new vm.Script(String(serverCode || ''), { filename });
  script.runInContext(ctx, { timeout: 1500 });

  const mod = moduleObj.exports;
  if (!mod || typeof mod !== 'object') {
    throw new Error('server.js must export an object via module.exports.');
  }
  const createInitialState = mod.createInitialState || mod.initState || mod.createGame;
  const onPlayerAction = mod.onPlayerAction || mod.onAction || mod.handleAction;
  const getPlayerView = mod.getPlayerView || mod.getViewForPlayer || mod.getView;
  const onTick = typeof mod.onTick === 'function' ? mod.onTick : null;
  const onSeatsChanged = typeof mod.onSeatsChanged === 'function' ? mod.onSeatsChanged : null;

  if (typeof createInitialState !== 'function') {
    throw new Error('server.js must export createInitialState(players, options).');
  }
  if (typeof onPlayerAction !== 'function') {
    throw new Error('server.js must export onPlayerAction(state, player, action).');
  }
  if (typeof getPlayerView !== 'function') {
    throw new Error('server.js must export getPlayerView(state, viewerUid).');
  }

  const runWithTimeout = (fn, args) => {
    ctx.__fn = fn;
    ctx.__args = args;
    try {
      return vm.runInContext('__fn(...__args)', ctx, { timeout: 1500 });
    } finally {
      ctx.__fn = undefined;
      ctx.__args = undefined;
    }
  };

  return {
    meta: mod.meta && typeof mod.meta === 'object' ? deepCloneJson(mod.meta) : {},
    hasTick: Boolean(onTick),
    createInitialState: (players, opts = {}) =>
      deepCloneJson(runWithTimeout(createInitialState, [deepCloneJson(players), deepCloneJson(opts)])),
    onPlayerAction: (state, player, action) => {
      const workingState = deepCloneJson(state);
      const res = runWithTimeout(onPlayerAction, [workingState, deepCloneJson(player), deepCloneJson(action)]);
      if (res && typeof res === 'object' && ('state' in res || 'error' in res)) {
        return {
          state: res.state !== undefined ? deepCloneJson(res.state) : workingState,
          error: res.error ? String(res.error) : null,
        };
      }
      if (res && typeof res === 'object') {
        return { state: deepCloneJson(res), error: null };
      }
      return { state: workingState, error: null };
    },
    onTick: onTick
      ? (state, nowMs = Date.now()) => {
          const workingState = deepCloneJson(state);
          const res = runWithTimeout(onTick, [workingState, Number(nowMs)]);
          if (res && typeof res === 'object' && ('state' in res || 'changed' in res)) {
            return {
              state: res.state !== undefined ? deepCloneJson(res.state) : workingState,
              changed: res.changed !== undefined ? Boolean(res.changed) : true,
            };
          }
          if (res && typeof res === 'object') {
            return { state: deepCloneJson(res), changed: true };
          }
          return { state: workingState, changed: false };
        }
      : null,
    onSeatsChanged: onSeatsChanged
      ? (state, seats) => {
          const workingState = deepCloneJson(state);
          const res = runWithTimeout(onSeatsChanged, [workingState, deepCloneJson(seats)]);
          if (res && typeof res === 'object' && 'state' in res) {
            return deepCloneJson(res.state);
          }
          if (res && typeof res === 'object') {
            return deepCloneJson(res);
          }
          return workingState;
        }
      : null,
    getPlayerView: (state, viewerUid) =>
      deepCloneJson(runWithTimeout(getPlayerView, [deepCloneJson(state), String(viewerUid || '')])),
  };
}

class GameTheaterRuntime extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.gamesDir = getGamesDir(options);
    fs.mkdirSync(this.gamesDir, { recursive: true });

    this.games = new Map(); // id -> { manifest, serverJs, clientGd, compiled }
    this.activeGameId = null;
    this.seats = []; // array of public player profiles seated in the active game
    this.matchStatus = 'idle'; // 'idle' | 'playing'
    this.matchState = null;
    this.matchId = null;
    this.lastActionError = null;
    this.chatLog = [];
    this.agentStatus = {
      busy: false,
      mode: null,
      requestedBy: null,
      title: '',
      prompt: '',
      step: '',
      error: null,
      updatedAt: null,
    };
    this.onlineCounts = new Map(); // uid -> count of open WS tabs
    this.onlineProfiles = new Map(); // uid -> public profile
    this._tickTimer = null;
    this.spectatorStatePath = getLiveSpectatorFilePath(options);

    this.on('updated', () => {
      this._persistLiveSpectatorSnapshot();
    });

    this.reloadGamesFromDisk();
    this._persistLiveSpectatorSnapshot();
  }

  _stopTickTimer() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  _syncTickTimer() {
    this._stopTickTimer();
    const active = this.getActiveGame();
    if (!active || this.matchStatus !== 'playing' || !this.matchState || !active.compiled.onTick) {
      return;
    }
    const rawMs = Number(active.compiled.meta?.tickIntervalMs || 1000);
    const intervalMs = Math.max(250, Math.min(10000, Number.isFinite(rawMs) ? rawMs : 1000));
    this._tickTimer = setInterval(() => {
      const cur = this.getActiveGame();
      if (!cur || this.matchStatus !== 'playing' || !this.matchState || !cur.compiled.onTick) {
        this._stopTickTimer();
        return;
      }
      try {
        const beforeJson = JSON.stringify(this.matchState);
        const res = cur.compiled.onTick(this.matchState, Date.now());
        const nextJson = JSON.stringify(res.state);
        if (nextJson !== beforeJson) {
          this.matchState = res.state;
          this.emit('updated', { reason: 'game-tick' });
        }
      } catch {}
    }, intervalMs);
    this._tickTimer.unref?.();
  }

  close() {
    this._stopTickTimer();
  }

  reloadGamesFromDisk() {
    this.games.clear();
    if (!fs.existsSync(this.gamesDir)) return;
    const entries = fs.readdirSync(this.gamesDir, { withFileTypes: true });
    const loaded = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(this.gamesDir, ent.name);
      const manifestPath = path.join(dir, 'manifest.json');
      const serverPath = path.join(dir, 'server.js');
      const clientPath = path.join(dir, 'client.gd');
      if (!fs.existsSync(manifestPath) || !fs.existsSync(serverPath) || !fs.existsSync(clientPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const serverJs = fs.readFileSync(serverPath, 'utf8');
        const clientGd = fs.readFileSync(clientPath, 'utf8');
        const compiled = compileGameServerModule(serverJs, `${manifest.id || ent.name}/server.js`);
        const normalizedManifest = this._normalizeManifest(manifest, compiled.meta, ent.name);
        loaded.push({
          id: normalizedManifest.id,
          manifest: normalizedManifest,
          serverJs,
          clientGd,
          compiled,
        });
      } catch {}
    }

    loaded.sort((a, b) => String(b.manifest.updatedAt || '').localeCompare(String(a.manifest.updatedAt || '')));
    for (const g of loaded) {
      this.games.set(g.id, g);
    }

    if (this.activeGameId && !this.games.has(this.activeGameId)) {
      this.activeGameId = null;
    }
    if (!this.activeGameId && loaded.length > 0) {
      this.activeGameId = loaded[0].id;
    }
  }

  _normalizeManifest(manifest = {}, compiledMeta = {}, fallbackId = 'game') {
    const id = slugifyGameId(manifest.id || fallbackId);
    const rawMin = Number(manifest.minPlayers ?? compiledMeta.minPlayers ?? 2);
    const rawMax = Number(manifest.maxPlayers ?? compiledMeta.maxPlayers ?? Math.max(2, rawMin));
    const minPlayers = Math.max(1, Number.isFinite(rawMin) ? Math.floor(rawMin) : 2);
    const maxPlayers = Math.max(minPlayers, Number.isFinite(rawMax) ? Math.floor(rawMax) : 2);
    return {
      id,
      title: String(manifest.title || compiledMeta.title || id).trim(),
      description: String(manifest.description || compiledMeta.description || '').trim(),
      minPlayers,
      maxPlayers,
      version: Number(manifest.version || 1),
      createdBy: manifest.createdBy || null,
      updatedBy: manifest.updatedBy || manifest.createdBy || null,
      lastPrompt: String(manifest.lastPrompt || ''),
      createdAt: manifest.createdAt || new Date().toISOString(),
      updatedAt: manifest.updatedAt || new Date().toISOString(),
    };
  }

  saveAndActivateGame({ id, manifest, serverJs, clientGd, activate = true }) {
    const compiled = compileGameServerModule(serverJs, `${id || manifest?.id || 'game'}/server.js`);
    const existing = id && this.games.get(slugifyGameId(id));
    const gameId = slugifyGameId(id || manifest?.id || manifest?.title);
    const nextVersion = existing ? (existing.manifest.version || 1) + 1 : Number(manifest?.version || 1);

    const normalized = this._normalizeManifest(
      {
        ...(existing?.manifest || {}),
        ...(manifest || {}),
        id: gameId,
        version: nextVersion,
        updatedAt: new Date().toISOString(),
      },
      compiled.meta,
      gameId,
    );

    const dir = path.join(this.gamesDir, gameId);
    const revDir = path.join(dir, 'revisions');
    fs.mkdirSync(revDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(normalized, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'server.js'), String(serverJs), 'utf8');
    fs.writeFileSync(path.join(dir, 'client.gd'), String(clientGd), 'utf8');
    fs.writeFileSync(
      path.join(revDir, `rev-${String(nextVersion).padStart(3, '0')}.json`),
      JSON.stringify({ manifest: normalized, serverJs, clientGd }, null, 2),
      'utf8',
    );

    const record = {
      id: gameId,
      manifest: normalized,
      serverJs: String(serverJs),
      clientGd: String(clientGd),
      compiled,
    };
    this.games.set(gameId, record);

    if (activate || !this.activeGameId) {
      this.selectGame(gameId, { preserveCompatibleSeats: true });
    } else {
      this.emit('updated', { reason: 'game-saved', gameId });
    }
    return record;
  }

  listGames() {
    return Array.from(this.games.values()).map((g) => ({ ...g.manifest }));
  }

  getGameRecord(gameId) {
    return this.games.get(gameId) || null;
  }

  getActiveGame() {
    if (!this.activeGameId) return null;
    return this.games.get(this.activeGameId) || null;
  }

  selectGame(gameId, { preserveCompatibleSeats = true } = {}) {
    const rec = this.games.get(gameId);
    if (!rec) {
      throw new Error(`Game "${gameId}" not found.`);
    }
    this.activeGameId = rec.id;
    this._stopTickTimer();
    this.matchStatus = 'idle';
    this.matchState = null;
    this.matchId = null;
    this.lastActionError = null;

    if (!preserveCompatibleSeats) {
      this.seats = [];
    } else if (this.seats.length > rec.manifest.maxPlayers) {
      this.seats = this.seats.slice(0, rec.manifest.maxPlayers);
    }

    // If enough players are already seated for the newly selected/updated game, auto-start fresh match!
    if (
      this.seats.length >= rec.manifest.minPlayers &&
      this.seats.length <= rec.manifest.maxPlayers
    ) {
      this._initMatchInternal(rec);
    }

    this.emit('updated', { reason: 'game-selected', gameId: rec.id });
    return rec;
  }

  markPlayerConnected(player) {
    const pub = toPublicPlayerProfile(player);
    if (!pub) return;
    const prev = this.onlineCounts.get(pub.uid) || 0;
    this.onlineCounts.set(pub.uid, prev + 1);
    this.onlineProfiles.set(pub.uid, pub);
    this.emit('updated', { reason: 'player-connected', uid: pub.uid });
  }

  markPlayerDisconnected(uid) {
    const prev = this.onlineCounts.get(uid) || 0;
    if (prev <= 1) {
      this.onlineCounts.delete(uid);
      this.onlineProfiles.delete(uid);
    } else {
      this.onlineCounts.set(uid, prev - 1);
    }
    this.emit('updated', { reason: 'player-disconnected', uid });
  }

  getOnlinePlayers() {
    return Array.from(this.onlineProfiles.values());
  }

  joinSeat(player) {
    const pub = toPublicPlayerProfile(player);
    if (!pub) return { ok: false, error: 'Invalid player.' };

    const active = this.getActiveGame();
    const maxPlayers = active ? active.manifest.maxPlayers : 8;
    const title = active ? active.manifest.title : 'Lobby';

    const alreadyIdx = this.seats.findIndex((s) => s.uid === pub.uid);
    if (alreadyIdx !== -1) {
      this.seats[alreadyIdx] = pub;
      return { ok: true, seats: [...this.seats], alreadySeated: true };
    }

    if (this.seats.length >= maxPlayers) {
      return {
        ok: false,
        code: 'MAX_PLAYERS_REACHED',
        error: `No more than ${maxPlayers} players allowed in "${title}" (${this.seats.length}/${maxPlayers} seats filled).`,
      };
    }

    this.seats.push(pub);

    // Auto-start when exact required players fill the seats and match hasn't started yet
    if (
      active &&
      this.matchStatus === 'idle' &&
      this.seats.length >= active.manifest.minPlayers &&
      this.seats.length <= active.manifest.maxPlayers
    ) {
      this._initMatchInternal(active);
    } else if (active && this.matchStatus === 'playing' && this.matchState) {
      if (active.compiled.onSeatsChanged) {
        try {
          this.matchState = active.compiled.onSeatsChanged(this.matchState, this.seats);
        } catch {}
      } else if (Array.isArray(this.matchState.players)) {
        if (!this.matchState.players.some((p) => p.uid === pub.uid)) {
          this.matchState.players.push(pub);
        }
      }
    }

    this.emit('updated', { reason: 'seat-joined', uid: pub.uid });
    return { ok: true, seats: [...this.seats] };
  }

  leaveSeat(uid) {
    const before = this.seats.length;
    this.seats = this.seats.filter((s) => s.uid !== uid);
    if (this.seats.length !== before) {
      const active = this.getActiveGame();
      if (!active || this.seats.length < active.manifest.minPlayers) {
        this._stopTickTimer();
        this.matchStatus = 'idle';
        this.matchState = null;
        this.matchId = null;
      } else if (this.matchStatus === 'playing' && this.matchState && active.compiled.onSeatsChanged) {
        try {
          this.matchState = active.compiled.onSeatsChanged(this.matchState, this.seats);
        } catch {}
      }
      this.emit('updated', { reason: 'seat-left', uid });
    }
    return { ok: true, seats: [...this.seats] };
  }

  _initMatchInternal(activeRecord, options = {}) {
    this.matchId = `match-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    this.matchState = activeRecord.compiled.createInitialState(this.seats, options);
    this.matchStatus = 'playing';
    this.lastActionError = null;
    this._syncTickTimer();
  }

  startMatch(requestedByPlayer, options = {}) {
    const active = this.getActiveGame();
    if (!active) {
      return { ok: false, error: 'No game loaded yet. Ask the RobOS Agent to generate a game first!' };
    }
    // Ensure requesting player is seated if there is an open seat
    if (requestedByPlayer) {
      const seated = this.seats.some((s) => s.uid === requestedByPlayer.uid);
      if (!seated && this.seats.length < active.manifest.maxPlayers) {
        this.seats.push(toPublicPlayerProfile(requestedByPlayer));
      }
    }
    if (this.seats.length < active.manifest.minPlayers) {
      return {
        ok: false,
        code: 'MIN_PLAYERS_REQUIRED',
        error: `"${active.manifest.title}" requires ${active.manifest.minPlayers} players (${this.seats.length}/${active.manifest.minPlayers} seated).`,
      };
    }
    if (this.seats.length > active.manifest.maxPlayers) {
      return {
        ok: false,
        code: 'MAX_PLAYERS_EXCEEDED',
        error: `No more than ${active.manifest.maxPlayers} players allowed in "${active.manifest.title}".`,
      };
    }

    this._initMatchInternal(active, options);
    this.emit('updated', { reason: 'match-started', matchId: this.matchId });
    return { ok: true, matchId: this.matchId };
  }

  handleGameAction(player, action = {}) {
    const active = this.getActiveGame();
    if (!active) {
      return { ok: false, error: 'No active game.' };
    }
    if (this.matchStatus !== 'playing' || !this.matchState) {
      return { ok: false, error: 'Match has not started yet.' };
    }
    const seatedPlayer = this.seats.find((s) => s.uid === player?.uid);
    if (!seatedPlayer) {
      return {
        ok: false,
        code: 'NOT_SEATED',
        error: `Only the ${active.manifest.maxPlayers} seated players can perform actions in "${active.manifest.title}".`,
      };
    }

    try {
      const res = active.compiled.onPlayerAction(this.matchState, seatedPlayer, action);
      if (res.error) {
        this.lastActionError = res.error;
        return { ok: false, error: res.error };
      }
      this.matchState = res.state;
      this.lastActionError = null;
      this.emit('updated', { reason: 'game-action', by: seatedPlayer.uid, actionType: action?.type || '' });
      return { ok: true, view: this.getPlayerViewFor(seatedPlayer.uid) };
    } catch (err) {
      return { ok: false, error: `Game server error: ${err.message}` };
    }
  }

  addChatMessage(player, text) {
    const clean = String(text || '').trim().slice(0, 400);
    if (!clean) return null;
    const pub = toPublicPlayerProfile(player);
    const msg = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      uid: pub?.uid || 'system',
      name: pub?.shortName || pub?.name || 'System',
      gamerTag: pub?.gamerTag || 'system',
      avatar: pub?.avatar || '🎭',
      color: pub?.color || '#00bcd4',
      text: clean,
      ts: new Date().toISOString(),
    };
    this.chatLog.push(msg);
    if (this.chatLog.length > 60) {
      this.chatLog = this.chatLog.slice(-60);
    }
    this.emit('updated', { reason: 'chat', message: msg });
    return msg;
  }

  setAgentStatus(patch = {}) {
    this.agentStatus = {
      ...this.agentStatus,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.emit('updated', { reason: 'agent-status', agentStatus: this.agentStatus });
  }

  getPlayerViewFor(viewerUid) {
    const active = this.getActiveGame();
    if (!active || this.matchStatus !== 'playing' || !this.matchState) {
      return null;
    }
    try {
      return active.compiled.getPlayerView(this.matchState, viewerUid);
    } catch (err) {
      return { error: `View render error: ${err.message}` };
    }
  }

  getSnapshotForPlayer(viewerPlayer) {
    const viewerUid = viewerPlayer?.uid || '';
    const active = this.getActiveGame();
    return {
      me: toPublicPlayerProfile(viewerPlayer),
      onlinePlayers: this.getOnlinePlayers(),
      seats: [...this.seats],
      isSeated: Boolean(viewerUid && this.seats.some((s) => s.uid === viewerUid)),
      games: this.listGames(),
      activeGame: active
        ? {
            ...active.manifest,
            clientGd: active.clientGd,
          }
        : null,
      matchStatus: this.matchStatus,
      matchId: this.matchId,
      gameView: this.getPlayerViewFor(viewerUid),
      chatLog: [...this.chatLog],
      agentStatus: { ...this.agentStatus },
    };
  }

  getSpectatorSnapshot() {
    const active = this.getActiveGame();
    return {
      active: Boolean(active),
      matchStatus: this.matchStatus,
      matchId: this.matchId,
      gamesCount: this.games.size,
      activeGame: active ? { ...active.manifest } : null,
      seats: [...this.seats],
      onlinePlayers: this.getOnlinePlayers(),
      spectatorView: this.getPlayerViewFor(SPECTATOR_VIEWER_UID),
      chatLog: this.chatLog.slice(-12),
      agentStatus: { ...this.agentStatus },
      updatedAt: new Date().toISOString(),
    };
  }

  _persistLiveSpectatorSnapshot() {
    if (this.options?.persistSpectatorState === false) return;
    try {
      const snap = this.getSpectatorSnapshot();
      const dir = path.dirname(this.spectatorStatePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmpPath = `${this.spectatorStatePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(snap, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.spectatorStatePath);
    } catch {}
  }
}

module.exports = {
  SPECTATOR_VIEWER_UID,
  slugifyGameId,
  getGamesDir,
  getLiveSpectatorFilePath,
  compileGameServerModule,
  GameTheaterRuntime,
};
