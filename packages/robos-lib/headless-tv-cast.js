'use strict';

/**
 * Headless RobOS Smart TV Cast & Transport Engine
 * -----------------------------------------------
 * Allows a headless RobOS Voice / Media Server (e.g. `ROBOS_HEADLESS=1` on `192.168.1.25`)
 * to cast movies & TV episodes directly to paired RobOS Smart TVs (Roku OS SceneGraph
 * `<Video id="cinemaVideo">` via `/api/roku-cast` + Roku ECP `:8060`, and Google Cast
 * devices if `castv2-client` is installed) and control pause/resume/next/previous/stop
 * with zero Electron GUI window required.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const historyLib = require('./media-history');

function configDirOf(configDir) {
  return configDir || process.env.ROBOS_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.config', 'robos');
}

function detectLanIp() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const iface of (list || [])) {
      if (iface && iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.') && !iface.address.startsWith('172.17.')) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function rewriteLoopbackToLan(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      const lan = detectLanIp();
      if (lan && lan !== '127.0.0.1') u.hostname = lan;
    }
    return u.toString().replace(/\/+$/, '');
  } catch {
    return rawUrl;
  }
}

function resolveConfiguredMediaServerUrls(configDir) {
  const dir = configDirOf(configDir);
  const urls = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'media-servers.json'), 'utf8'));
    for (const s of (cfg?.servers || [])) {
      if (s && s.enabled !== false && s.url) {
        urls.push(rewriteLoopbackToLan(s.url));
      }
    }
  } catch {}
  if (!urls.length) {
    urls.push(`http://${detectLanIp()}:19234`);
  }
  return [...new Set(urls)];
}

function loadTvInfo(targetIp, configDir) {
  const dir = configDirOf(configDir);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'tv-studio.json'), 'utf8'));
    const found = (raw.tvs || []).find(t => t && t.ip === targetIp);
    if (found) return found;
  } catch {}
  return { ip: targetIp, id: `tv-${targetIp}`, name: `Smart TV (${targetIp})`, platformId: 'roku-os', ports: { ecp: 8060 } };
}

function sessionFilePath(configDir) {
  return path.join(configDirOf(configDir), 'headless-tv-session.json');
}

function readHeadlessSession(configDir) {
  try {
    return JSON.parse(fs.readFileSync(sessionFilePath(configDir), 'utf8'));
  } catch {
    return null;
  }
}

function writeHeadlessSession(session, configDir) {
  const file = sessionFilePath(configDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(session, null, 2));
}

function httpPostJson(urlStr, bodyObj, timeoutMs = 2500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const payload = Buffer.from(JSON.stringify(bodyObj || {}));
      const req = http.request({
        hostname: u.hostname,
        port: Number(u.port) || 80,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
        timeout: timeoutMs,
      }, (res) => {
        let txt = '';
        res.setEncoding('utf8');
        res.on('data', c => { txt += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(txt)); } catch { resolve({ ok: res.statusCode < 400 }); }
        });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
      req.end(payload);
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

function ensureRokuChannelActive(ip, ecpPort = 8060) {
  if (process.env.ROBOS_TEST === '1' || process.env.NODE_TEST_CONTEXT) return Promise.resolve(true);
  return new Promise((resolve) => {
    const postEcp = (ecpPath) => new Promise((done) => {
      const req = http.request({ hostname: ip, port: ecpPort, path: ecpPath, method: 'POST', timeout: 1800 }, (res) => {
        res.resume();
        res.on('end', () => done(true));
      });
      req.on('error', () => done(false));
      req.on('timeout', () => { req.destroy(); done(false); });
      req.end();
    });

    const req = http.get({ hostname: ip, port: ecpPort, path: '/query/active-app', timeout: 1500 }, (res) => {
      let xml = '';
      res.setEncoding('utf8');
      res.on('data', c => { xml += c; });
      res.on('end', async () => {
        if (!xml.includes('id="dev"')) {
          await postEcp('/keypress/PowerOn');
          await postEcp('/launch/dev');
        }
        resolve(true);
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function buildStreamTargetForTrack(track, configDir) {
  const ms = track?.mediaService;
  if (ms && ms.endpoint && ms.remoteItemId) {
    const base = rewriteLoopbackToLan(ms.endpoint);
    const rawStream = rewriteLoopbackToLan(ms.directStreamUrl || ms.streamUrl || track.src || '');
    const extMatch = String(rawStream || track.filePath || '.mp4').match(/(\.[a-z0-9]{2,5})(?:\?|$)/i);
    const ext = (extMatch ? extMatch[1] : '.mp4').toLowerCase();
    const hlsUrl = `${base}/hls/${encodeURIComponent(ms.remoteItemId)}/index.m3u8`;
    if (['.avi', '.wmv', '.flv', '.mpg', '.mpeg', '.ts', '.m2ts'].includes(ext)) {
      return { mediaUrl: hlsUrl, hlsUrl, streamFormat: 'hls', remoteItemId: ms.remoteItemId, serverUrl: base };
    }
    return {
      mediaUrl: `${base}/stream/${encodeURIComponent(ms.remoteItemId)}${ext}`,
      hlsUrl,
      streamFormat: ext === '.mkv' ? 'mkv' : 'mp4',
      remoteItemId: ms.remoteItemId,
      serverUrl: base,
    };
  }
  const fallbackUrl = rewriteLoopbackToLan(track?.src || '');
  const isMkv = fallbackUrl.toLowerCase().endsWith('.mkv');
  return {
    mediaUrl: fallbackUrl,
    hlsUrl: '',
    streamFormat: isMkv ? 'mkv' : 'mp4',
    remoteItemId: track?.id || '',
    serverUrl: resolveConfiguredMediaServerUrls(configDir)[0] || '',
  };
}

function resolveSavedResumeSec(track, startAt, configDir) {
  if (startAt !== null && startAt !== undefined) {
    return Math.max(0, Math.round(Number(startAt) || 0));
  }
  const dir = configDirOf(configDir);
  try {
    const stats = JSON.parse(fs.readFileSync(path.join(dir, 'movie-track-stats.json'), 'utf8'))?.tracks || {};
    const st = stats[track.id];
    if (st && st.inProgress && !st.completed && Number(st.positionSec) >= 5) {
      return Math.round(Number(st.positionSec));
    }
  } catch {}
  try {
    const entries = historyLib.readEntries('movie-player', dir);
    const k = historyLib.mediaKey(track);
    const ent = k && entries[k];
    if (ent && ent.inProgress && !ent.completed && Number(ent.positionSec) >= 5) {
      return Math.round(Number(ent.positionSec));
    }
  } catch {}
  return 0;
}

function recordHeadlessPlayStart(track, resumeSec, configDir) {
  const dir = configDirOf(configDir);
  const now = new Date().toISOString();
  try {
    const statsPath = path.join(dir, 'movie-track-stats.json');
    let raw = { tracks: {} };
    try { raw = JSON.parse(fs.readFileSync(statsPath, 'utf8')); } catch {}
    if (!raw || typeof raw.tracks !== 'object') raw = { tracks: {} };
    const prev = raw.tracks[track.id] || {};
    const next = {
      ...prev,
      plays: (Number(prev.plays) || 0) + 1,
      lastPlayed: now,
      completed: prev.completed === true && resumeSec === 0 ? false : Boolean(prev.completed),
      inProgress: resumeSec >= 1,
      positionSec: resumeSec >= 1 ? resumeSec : 0,
      dismissedFromWatchlist: false,
      updatedAt: now,
    };
    raw.tracks[track.id] = next;
    raw.updatedAt = now;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statsPath, JSON.stringify(raw));

    const h = new historyLib.MediaHistory({ app: 'movie-player', configDir: dir });
    h.record(track, next);
  } catch {}
}

/**
 * Casts a queue of tracks directly to a Smart TV without an Electron Movie Player window.
 */
async function playTracksHeadless({
  tracks = [],
  initialIndex = 0,
  targetIp,
  targetDevice = null,
  startAt = null,
  configDir,
} = {}) {
  const dir = configDirOf(configDir);
  if (!Array.isArray(tracks) || !tracks.length) return { ok: false, error: 'No matching movies or episodes to play.' };
  if (!targetIp || targetIp === 'local') {
    return { ok: false, error: 'Headless server requires a Smart TV target (for example "on the Roku TV").' };
  }

  const clampedIdx = Math.max(0, Math.min(tracks.length - 1, Number(initialIndex) || 0));
  const tvInfo = targetDevice || loadTvInfo(targetIp, dir);
  const first = tracks[clampedIdx];
  const streamInfo = buildStreamTargetForTrack(first, dir);
  if (!streamInfo.mediaUrl || !/^https?:\/\//i.test(streamInfo.mediaUrl)) {
    return { ok: false, error: `Track "${first.title}" does not have an HTTP stream URL on this server.` };
  }

  const resumeSec = resolveSavedResumeSec(first, startAt, dir);
  const loadKey = `headless-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const displayTitle = first.showName && first.seasonNumber != null && first.episodeNumber != null
    ? `${first.showName} · S${String(first.seasonNumber).padStart(2, '0')}E${String(first.episodeNumber).padStart(2, '0')}${first.episodeTitle ? ` — ${first.episodeTitle}` : ''}`
    : (first.title || 'RobOS Movie Player');

  const castState = {
    active: true,
    loadKey,
    tvIp: targetIp,
    tvId: tvInfo.id || `tv-${targetIp}`,
    tvName: tvInfo.name || targetIp,
    platformId: tvInfo.platformId || 'roku-os',
    trackId: streamInfo.remoteItemId || first.id,
    mediaUrl: streamInfo.mediaUrl,
    hlsUrl: streamInfo.hlsUrl || '',
    streamFormat: streamInfo.streamFormat,
    title: displayTitle,
    startAt: resumeSec,
    paused: false,
    seekKey: '',
    seekSeconds: resumeSec,
    startedAt: new Date().toISOString(),
  };

  // Update tv-studio.json
  try {
    const tvCfgPath = path.join(dir, 'tv-studio.json');
    if (fs.existsSync(tvCfgPath)) {
      const tvCfg = JSON.parse(fs.readFileSync(tvCfgPath, 'utf8'));
      tvCfg.activeCinemaCast = castState;
      tvCfg.activeCinemaLibrary = {
        ...(tvCfg.activeCinemaLibrary || {}),
        active: true,
        tvIp: targetIp,
        tvId: castState.tvId,
        tvName: castState.tvName,
        platformId: castState.platformId,
      };
      fs.writeFileSync(tvCfgPath, JSON.stringify(tvCfg, null, 2));
    }
  } catch {}

  // Save headless queue session so "next episode" / "previous episode" / "pause" work!
  writeHeadlessSession({
    active: true,
    targetIp,
    targetDevice: tvInfo,
    currentIndex: clampedIdx,
    tracks: tracks.slice(0, 50),
    castState,
    updatedAt: new Date().toISOString(),
  }, dir);

  recordHeadlessPlayStart(first, resumeSec, dir);

  // Push cast state to all configured RobOS Media Servers (:19234)
  const serverUrls = [...new Set([streamInfo.serverUrl, ...resolveConfiguredMediaServerUrls(dir)].filter(Boolean))];
  await Promise.all(serverUrls.map(srv => httpPostJson(`${srv}/api/roku-cast`, castState)));

  if ((tvInfo.platformId || 'roku-os') === 'roku-os') {
    await ensureRokuChannelActive(targetIp, tvInfo?.ports?.ecp || 8060);
  }

  return {
    ok: true,
    via: 'headless-tv-cast',
    playing: true,
    targetIp,
    startAt: resumeSec,
    count: tracks.length,
    track: { id: first.id, title: displayTitle },
  };
}

/**
 * Controls an active headless Smart TV session (`pause`, `resume`, `next`, `previous`, `restart`, `stop-cast`, `open-tv-library`).
 */
async function controlHeadlessTv(action, { targetIp = null, configDir } = {}) {
  const dir = configDirOf(configDir);
  const session = readHeadlessSession(dir);
  const ip = targetIp || session?.targetIp || null;
  const serverUrls = resolveConfiguredMediaServerUrls(dir);

  if (action === 'open-tv-library') {
    if (!ip) return { ok: false, error: 'No Smart TV IP specified.' };
    const tvInfo = loadTvInfo(ip, dir);
    await Promise.all(serverUrls.map(srv => httpPostJson(`${srv}/api/roku-cast`, { active: false })));
    if ((tvInfo.platformId || 'roku-os') === 'roku-os') {
      await ensureRokuChannelActive(ip, tvInfo?.ports?.ecp || 8060);
    }
    return { ok: true, via: 'headless-tv-cast', targetIp: ip };
  }

  if (action === 'stop-cast') {
    await Promise.all(serverUrls.map(srv => httpPostJson(`${srv}/api/roku-cast`, { active: false })));
    if (session) writeHeadlessSession({ ...session, active: false }, dir);
    return { ok: true, via: 'headless-tv-cast', active: false };
  }

  if (!session || !session.active || !Array.isArray(session.tracks) || !session.tracks.length) {
    return { ok: false, error: 'No active Smart TV playback session on this server.' };
  }

  if (action === 'pause' || action === 'resume') {
    const paused = action === 'pause';
    const nextCast = { ...(session.castState || {}), active: true, paused };
    writeHeadlessSession({ ...session, castState: nextCast, updatedAt: new Date().toISOString() }, dir);
    await Promise.all(serverUrls.map(srv => httpPostJson(`${srv}/api/roku-cast`, { paused })));
    return { ok: true, via: 'headless-tv-cast', playing: !paused };
  }

  if (action === 'restart') {
    return playTracksHeadless({
      tracks: session.tracks,
      initialIndex: session.currentIndex || 0,
      targetIp: session.targetIp,
      targetDevice: session.targetDevice,
      startAt: 0,
      configDir: dir,
    });
  }

  if (action === 'next' || action === 'previous') {
    const delta = action === 'next' ? 1 : -1;
    const nextIdx = Math.max(0, Math.min(session.tracks.length - 1, (session.currentIndex || 0) + delta));
    return playTracksHeadless({
      tracks: session.tracks,
      initialIndex: nextIdx,
      targetIp: session.targetIp,
      targetDevice: session.targetDevice,
      startAt: 0,
      configDir: dir,
    });
  }

  return { ok: false, error: `Unsupported headless TV action: ${action}` };
}

function hasActiveHeadlessSession(configDir) {
  const s = readHeadlessSession(configDir);
  return Boolean(s && s.active);
}

module.exports = {
  detectLanIp,
  rewriteLoopbackToLan,
  playTracksHeadless,
  controlHeadlessTv,
  hasActiveHeadlessSession,
  readHeadlessSession,
};
