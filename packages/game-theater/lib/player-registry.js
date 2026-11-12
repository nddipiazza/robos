'use strict';

/**
 * RobOS AI Multiplayer Game Theater — Player Identity & Capability Token Registry.
 *
 * Uniquely identifies every RobOS Game User using the same capability-token + Google Doc
 * launcher pattern used by RobOS Google Calendar and RobOS Shopping Lists:
 *   - Discovers RobOS users from `robos-lib/people-store` (`~/.config/robos/people/*.json`)
 *   - Issues each player a dedicated 256-bit `authToken` (`?auth=<token>`)
 *   - Signs a 1-year `HttpOnly` session cookie (`robos_theater_player`) bound to that exact player
 *   - Tracks each player's dedicated Google Doc (`RobOS Game Theater — <Name> (Player Launch Doc)`)
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function requireRobosLib(modName) {
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean);
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  return null;
}

function getHomeDir(options = {}) {
  return options.homeDir || process.env.HOME || os.homedir();
}

function getConfigDir(options = {}) {
  return options.configDir || process.env.ROBOS_CONFIG_DIR || path.join(getHomeDir(options), '.config', 'robos');
}

function getTheaterDir(options = {}) {
  return options.theaterDir || path.join(getConfigDir(options), 'game-theater');
}

function getSettingsPath(options = {}) {
  return path.join(getTheaterDir(options), 'settings.json');
}

function slugifyUid(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `player-${crypto.randomBytes(3).toString('hex')}`;
}

function signPlayerCookie(cookieSecret, uid, authToken) {
  const sig = crypto
    .createHmac('sha256', String(cookieSecret))
    .update(`robos-game-theater-v1:${uid}:${authToken}`)
    .digest('hex');
  return `${uid}.${sig}`;
}

function loadRawSettings(options = {}) {
  const fp = getSettingsPath(options);
  let data = {};
  try {
    if (fs.existsSync(fp)) {
      data = JSON.parse(fs.readFileSync(fp, 'utf8')) || {};
    }
  } catch {}

  let changed = false;
  if (!data.cookieSecret) {
    data.cookieSecret = crypto.randomBytes(32).toString('hex');
    changed = true;
  }
  if (!data.hostAdminToken) {
    data.hostAdminToken = crypto.randomBytes(32).toString('hex');
    changed = true;
  }
  if (!data.players || typeof data.players !== 'object') {
    data.players = {};
    changed = true;
  }
  if (!data.playerDocs || typeof data.playerDocs !== 'object') {
    data.playerDocs = {};
    changed = true;
  }
  if (!data.hostDoc || typeof data.hostDoc !== 'object') {
    data.hostDoc = {};
    changed = true;
  }

  if (changed) {
    saveRawSettings(data, options);
  }
  return data;
}

function saveRawSettings(data, options = {}) {
  const fp = getSettingsPath(options);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function updateTheaterSettings(patch = {}, options = {}) {
  const current = loadRawSettings(options);
  const next = {
    ...current,
    ...patch,
    players: {
      ...(current.players || {}),
      ...(patch.players || {}),
    },
    playerDocs: {
      ...(current.playerDocs || {}),
      ...(patch.playerDocs || {}),
    },
    hostDoc: {
      ...(current.hostDoc || {}),
      ...(patch.hostDoc || {}),
    },
  };
  return saveRawSettings(next, options);
}

/**
 * Syncs people from `robos-lib/people-store` (or custom `options.seedPeople`) into the
 * Game Theater player registry, preserving existing `authToken` and Google Doc links.
 */
function loadTheaterPlayers(options = {}) {
  const settings = loadRawSettings(options);
  const peopleStore = options.peopleStore !== undefined ? options.peopleStore : requireRobosLib('people-store');

  let peopleList = [];
  if (Array.isArray(options.seedPeople)) {
    peopleList = options.seedPeople;
  } else if (peopleStore && typeof peopleStore.loadAllPeople === 'function') {
    try {
      peopleList = peopleStore.loadAllPeople({ configDir: getConfigDir(options) });
    } catch {}
  }

  let changed = false;
  for (const person of peopleList) {
    const uid = slugifyUid(person.uid || person.username || person.email || person.displayName);
    const existing = settings.players[uid] || {};
    const authToken = existing.authToken || crypto.randomBytes(32).toString('hex');
    if (!existing.authToken) changed = true;

    const updated = {
      uid,
      name: person.displayName || person.name || existing.name || uid,
      shortName: person.nickname || person.firstName || person.shortName || existing.shortName || person.displayName || uid,
      gamerTag: person.gameProfile?.gamerTag || person.gamerTag || existing.gamerTag || person.nickname || person.firstName || uid,
      avatar: person.gameProfile?.avatar || person.avatar || existing.avatar || '🎮',
      color: person.gameProfile?.color || person.color || existing.color || '#00bcd4',
      email: String(person.email ?? existing.email ?? '').trim(),
      source: existing.source || 'people-store',
      authToken,
      createdAt: existing.createdAt || new Date().toISOString(),
    };

    if (
      !settings.players[uid] ||
      existing.name !== updated.name ||
      existing.gamerTag !== updated.gamerTag ||
      existing.email !== updated.email ||
      existing.avatar !== updated.avatar ||
      existing.color !== updated.color
    ) {
      settings.players[uid] = updated;
      changed = true;
    }
  }

  // Ensure there is always at least 2 default RobOS players if people-store is empty (e.g. isolated test dir)
  if (Object.keys(settings.players).length === 0) {
    const defaults = [
      {
        uid: 'player-one',
        name: 'Player One',
        shortName: 'Player 1',
        gamerTag: 'PlayerOne',
        avatar: '🧙‍♂️',
        color: '#00bcd4',
        email: '',
        source: 'default',
      },
      {
        uid: 'player-two',
        name: 'Player Two',
        shortName: 'Player 2',
        gamerTag: 'PlayerTwo',
        avatar: '🛡️',
        color: '#ec4899',
        email: '',
        source: 'default',
      },
    ];
    for (const d of defaults) {
      settings.players[d.uid] = {
        ...d,
        authToken: crypto.randomBytes(32).toString('hex'),
        createdAt: new Date().toISOString(),
      };
    }
    changed = true;
  }

  if (changed) {
    saveRawSettings(settings, options);
  }

  const players = Object.values(settings.players).sort((a, b) => a.name.localeCompare(b.name));
  return players.map((p) => ({
    ...p,
    doc: settings.playerDocs?.[p.uid] || null,
  }));
}

function upsertTheaterPlayer(input = {}, options = {}) {
  const settings = loadRawSettings(options);
  const rawName = String(input.name || input.displayName || input.gamerTag || '').trim();
  if (!rawName && !input.uid) {
    throw new Error('Player name is required.');
  }
  const uid = slugifyUid(input.uid || rawName);
  const existing = settings.players[uid] || {};
  const authToken = input.rotateToken || !existing.authToken
    ? crypto.randomBytes(32).toString('hex')
    : existing.authToken;

  const player = {
    uid,
    name: rawName || existing.name || uid,
    shortName: String(input.shortName || input.nickname || existing.shortName || rawName.split(/\s+/)[0] || uid).trim(),
    gamerTag: String(input.gamerTag || existing.gamerTag || rawName.replace(/\s+/g, '') || uid).trim(),
    avatar: String(input.avatar || existing.avatar || '🎲').trim(),
    color: String(input.color || existing.color || '#00bcd4').trim(),
    email: String(input.email ?? existing.email ?? '').trim(),
    source: existing.source || 'custom',
    authToken,
    createdAt: existing.createdAt || new Date().toISOString(),
  };

  settings.players[uid] = player;
  saveRawSettings(settings, options);
  return {
    ...player,
    doc: settings.playerDocs?.[uid] || null,
  };
}

function toPublicPlayerProfile(player) {
  if (!player) return null;
  return {
    uid: player.uid,
    name: player.name,
    shortName: player.shortName || player.name,
    gamerTag: player.gamerTag || player.shortName || player.name,
    avatar: player.avatar || '🎮',
    color: player.color || '#00bcd4',
    hasDoc: Boolean(player.doc?.docUrl),
  };
}

function buildPlayerLaunchUrl(baseUrl, player) {
  const cleanBase = String(baseUrl || 'https://127.0.0.1:19229').replace(/\/+$/, '');
  return `${cleanBase}/?auth=${encodeURIComponent(player.authToken)}`;
}

/**
 * Resolves an incoming HTTP/WebSocket request's player identity from:
 *   1. `?auth=<player.authToken>` (1-click launch link from the player's Google Doc)
 *   2. Signed `robos_theater_player` session cookie
 *   3. Loopback convenience (`?as=<uid>` or first RobOS player when opening from localhost studio)
 */
function authenticatePlayerRequest({ queryAuth = '', queryAs = '', cookieVal = '', isLoopback = false } = {}, options = {}) {
  const settings = loadRawSettings(options);
  const players = loadTheaterPlayers(options);

  if (queryAuth) {
    const matched = players.find((p) => p.authToken === queryAuth);
    if (matched) {
      return {
        ok: true,
        via: 'token',
        player: matched,
        signedCookie: signPlayerCookie(settings.cookieSecret, matched.uid, matched.authToken),
      };
    }
    return { ok: false, error: 'Invalid or expired player launch token.' };
  }

  if (isLoopback && queryAs) {
    const q = String(queryAs).trim().toLowerCase();
    const matched = players.find(
      (p) => p.uid === q || p.gamerTag.toLowerCase() === q || p.shortName.toLowerCase() === q,
    );
    if (matched) {
      return {
        ok: true,
        via: 'loopback-as',
        player: matched,
        signedCookie: signPlayerCookie(settings.cookieSecret, matched.uid, matched.authToken),
      };
    }
  }

  if (cookieVal && cookieVal.includes('.')) {
    const dot = cookieVal.indexOf('.');
    const uid = cookieVal.slice(0, dot);
    const matched = players.find((p) => p.uid === uid);
    if (matched) {
      const expected = signPlayerCookie(settings.cookieSecret, matched.uid, matched.authToken);
      if (cookieVal === expected) {
        return {
          ok: true,
          via: 'cookie',
          player: matched,
          signedCookie: expected,
        };
      }
    }
  }

  if (isLoopback && options.allowLoopbackDefault !== false && players.length > 0) {
    let osUser = '';
    try { osUser = String(os.userInfo().username || '').toLowerCase(); } catch {}
    const preferred =
      (osUser && players.find((p) => p.uid.includes(osUser) || p.email.toLowerCase().startsWith(`${osUser}@`))) ||
      players[0];
    return {
      ok: true,
      via: 'loopback-default',
      player: preferred,
      signedCookie: signPlayerCookie(settings.cookieSecret, preferred.uid, preferred.authToken),
    };
  }

  return { ok: false, error: 'Unauthorized. Open RobOS AI Multiplayer Game Theater via your personal Google Doc Launch Button.' };
}

module.exports = {
  getHomeDir,
  getConfigDir,
  getTheaterDir,
  getSettingsPath,
  slugifyUid,
  signPlayerCookie,
  loadRawSettings,
  saveRawSettings,
  updateTheaterSettings,
  loadTheaterPlayers,
  upsertTheaterPlayer,
  toPublicPlayerProfile,
  buildPlayerLaunchUrl,
  authenticatePlayerRequest,
};
