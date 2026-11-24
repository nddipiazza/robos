'use strict';

/**
 * RobOS Media Service Client & Preferences Auto-Sync Engine
 *
 * Connects RobOS machines to one or more RobOS Media Servers (:19234),
 * discovers servers on the LAN, registers MCP endpoints, and keeps
 * RobOS Movie Player, RobOS Audio Player, and Book catalogs automatically updated.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

const DEFAULT_MEDIA_SERVER_PORT = 19234;

const MCP_MEDIA_TOOLS = [
  'robos_media_server_status',
  'robos_media_list_services',
  'robos_media_add_service',
  'robos_media_remove_service',
  'robos_media_scan',
  'robos_media_search',
  'robos_media_list_movies',
  'robos_media_list_shows',
  'robos_media_get_show',
  'robos_media_list_music',
  'robos_media_list_books',
  'robos_media_read_book',
  'robos_media_get_item',
  'robos_media_continue',
];

const MCP_MEDIA_RESOURCES = [
  'robos-media://server/status',
  'robos-media://services',
  'robos-media://catalog/movies',
  'robos-media://catalog/shows',
  'robos-media://catalog/music',
  'robos-media://catalog/books',
  'robos-media://continue',
];

function homeOf(opts = {}) {
  return opts.homeDir || process.env.HOME || os.homedir();
}

function configDirOf(opts = {}) {
  return opts.configDir || path.join(homeOf(opts), '.config', 'robos');
}

function mediaServersFileOf(opts = {}) {
  return path.join(configDirOf(opts), 'media-servers.json');
}

function normalizeServerUrl(rawUrl) {
  let s = String(rawUrl || '').trim();
  if (!s) throw new Error('Enter a RobOS Media Server URL or IP address');
  s = s.replace(/\/mcp\/?$/i, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  const u = new URL(s);
  if (!u.port && u.protocol === 'http:') {
    u.port = String(DEFAULT_MEDIA_SERVER_PORT);
  }
  return u.origin;
}

function deterministicServerId(url) {
  return `ms_${crypto.createHash('sha1').update(String(url).toLowerCase()).digest('hex').slice(0, 12)}`;
}

function deterministicFolderId(url, target = 'movie') {
  return `fld_ms_${target}_${crypto.createHash('sha1').update(String(url).toLowerCase()).digest('hex').slice(0, 10)}`;
}

function virtualRootForServer(configDir, url, target = 'movie') {
  const safe = String(url || 'media-service').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.resolve(path.join(configDir, 'media-service-streams', `${target}_${safe}`));
}

function trackIdForPath(filePath) {
  return `trk_${crypto.createHash('sha1').update(String(filePath)).digest('hex').slice(0, 16)}`;
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return fallback;
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function httpGetJson(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (err) { reject(new Error(`Invalid JSON from ${url}: ${err.message}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timed out connecting to ${url}`)); });
    req.on('error', reject);
  });
}

function httpPostJson(url, body = {}, headers = {}, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ ok: res.statusCode < 400 }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.end(payload);
  });
}

// ── Media Servers Config Store (`~/.config/robos/media-servers.json`) ────────

function loadMediaServersConfig(opts = {}) {
  const raw = readJson(mediaServersFileOf(opts), null);
  if (!raw || typeof raw !== 'object') {
    return {
      version: 1,
      autoSyncPlayers: true,
      defaultServerId: null,
      servers: [],
    };
  }
  return {
    version: 1,
    autoSyncPlayers: raw.autoSyncPlayers !== false,
    ...(raw.autoImportDataSources !== undefined ? { autoImportDataSources: Boolean(raw.autoImportDataSources) } : {}),
    defaultServerId: raw.defaultServerId || (raw.servers?.[0]?.id ?? null),
    servers: Array.isArray(raw.servers) ? raw.servers : [],
  };
}

function saveMediaServersConfig(cfg, opts = {}) {
  const normalized = {
    version: 1,
    autoSyncPlayers: cfg.autoSyncPlayers !== false,
    ...(cfg.autoImportDataSources !== undefined ? { autoImportDataSources: Boolean(cfg.autoImportDataSources) } : {}),
    defaultServerId: cfg.defaultServerId || (cfg.servers?.[0]?.id ?? null),
    servers: Array.isArray(cfg.servers) ? cfg.servers : [],
  };
  writeJsonAtomic(mediaServersFileOf(opts), normalized);
  return normalized;
}

async function probeMediaServer(rawUrl, { timeoutMs = 3500 } = {}) {
  const url = normalizeServerUrl(rawUrl);
  const info = await httpGetJson(`${url}/api/info`, timeoutMs);
  if (!info || !info.ok) throw new Error('Endpoint did not return a valid RobOS Media Server response');
  return {
    ok: true,
    url,
    mcpUrl: `${url}/mcp`,
    serverId: info.serverId || deterministicServerId(url),
    serverName: info.serverName || `RobOS Media Server (${new URL(url).hostname})`,
    hostname: info.hostname || new URL(url).hostname,
    catalogRevision: Number(info.catalogRevision) || 1,
    updatedAt: info.updatedAt || null,
    mcpEnabled: info.mcpEnabled !== false,
    transcodeEnabled: info.transcodeEnabled !== false,
    counts: info.counts || { total: 0, movies: 0, shows: 0, episodes: 0, musicTracks: 0, albums: 0, books: 0, education: 0 },
    services: Array.isArray(info.services) ? info.services : [],
  };
}

async function listMediaServers(opts = {}) {
  const cfg = loadMediaServersConfig(opts);
  const withLive = opts.probe !== false
    ? await Promise.all(cfg.servers.map(async (srv) => {
        if (srv.enabled === false) return { ...srv, online: false };
        try {
          const live = await probeMediaServer(srv.url, { timeoutMs: opts.timeoutMs || 2200 });
          return {
            ...srv,
            name: srv.name || live.serverName,
            mcpUrl: live.mcpUrl,
            online: true,
            catalogRevision: live.catalogRevision,
            cachedCounts: live.counts,
            remoteServices: live.services,
          };
        } catch (err) {
          return { ...srv, online: false, lastStatus: err.message };
        }
      }))
    : cfg.servers;

  return {
    ok: true,
    autoSyncPlayers: cfg.autoSyncPlayers,
    defaultServerId: cfg.defaultServerId,
    servers: withLive,
  };
}

async function saveMediaServer(input = {}, opts = {}) {
  const url = normalizeServerUrl(input.url || input.endpoint);
  let probed = null;
  if (opts.skipProbe !== true) {
    try { probed = await probeMediaServer(url, { timeoutMs: opts.timeoutMs || 3500 }); } catch {}
  }

  const cfg = loadMediaServersConfig(opts);
  const id = input.id || probed?.serverId || deterministicServerId(url);
  const existingIdx = cfg.servers.findIndex(s => s.id === id || normalizeServerUrl(s.url) === url);
  const prev = existingIdx >= 0 ? cfg.servers[existingIdx] : null;

  const entry = {
    id: prev?.id || id,
    name: String(input.name || prev?.name || probed?.serverName || `RobOS Media Service (${new URL(url).hostname})`).trim(),
    url,
    mcpUrl: `${url}/mcp`,
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : (prev ? prev.enabled !== false : true),
    autoConnectMoviePlayer: input.autoConnectMoviePlayer !== undefined ? Boolean(input.autoConnectMoviePlayer) : (prev ? prev.autoConnectMoviePlayer !== false : true),
    autoConnectAudioPlayer: input.autoConnectAudioPlayer !== undefined ? Boolean(input.autoConnectAudioPlayer) : (prev ? prev.autoConnectAudioPlayer !== false : true),
    autoConnectMcp: input.autoConnectMcp !== undefined ? Boolean(input.autoConnectMcp) : (prev ? prev.autoConnectMcp !== false : true),
    services: Array.isArray(input.services)
      ? input.services
      : (prev?.services || (probed?.services ? probed.services.map(s => s.id) : ['movies', 'shows', 'music', 'books', 'education'])),
    addedAt: prev?.addedAt || new Date().toISOString(),
  };

  if (existingIdx >= 0) cfg.servers[existingIdx] = entry;
  else cfg.servers.push(entry);
  if (input.setDefault !== false || !cfg.defaultServerId) {
    cfg.defaultServerId = entry.id;
  }
  saveMediaServersConfig(cfg, opts);

  let syncResult = null;
  if (opts.syncNow !== false) {
    syncResult = await syncMediaServicesToLocalApps({ ...opts, force: true });
  }
  return { ok: true, server: entry, probed, syncResult, ...(await listMediaServers({ ...opts, probe: Boolean(probed) })) };
}

async function removeMediaServer(serverId, opts = {}) {
  const cfg = loadMediaServersConfig(opts);
  const target = cfg.servers.find(s => s.id === serverId);
  cfg.servers = cfg.servers.filter(s => s.id !== serverId);
  if (cfg.defaultServerId === serverId) {
    cfg.defaultServerId = cfg.servers[0]?.id || null;
  }
  saveMediaServersConfig(cfg, opts);
  if (target) {
    removeServerFromLocalApps(target, opts);
  }
  return listMediaServers(opts);
}

function setAutoSyncPlayers(enabled, opts = {}) {
  const cfg = loadMediaServersConfig(opts);
  cfg.autoSyncPlayers = Boolean(enabled);
  return saveMediaServersConfig(cfg, opts);
}

// ── Fast LAN Discovery (:19234) ──────────────────────────────────────────────

function tcpCheck(ip, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, ip);
  });
}

async function discoverMediaServersOnLan(opts = {}) {
  const port = Number(opts.port) || DEFAULT_MEDIA_SERVER_PORT;
  const cfgDir = configDirOf(opts);
  const candidateIps = new Set(['127.0.0.1']);

  // 1. Saved media servers, RobOS Services SSH hosts, and Data Sources SFTP hosts
  const savedCfg = loadMediaServersConfig(opts);
  for (const s of savedCfg.servers) {
    try { candidateIps.add(new URL(s.url).hostname); } catch {}
  }
  const sshHosts = readJson(path.join(cfgDir, 'services', 'hosts.json'), []);
  for (const h of Array.isArray(sshHosts) ? sshHosts : []) {
    if (h?.address) candidateIps.add(h.address);
  }
  const dataSources = readJson(path.join(cfgDir, 'data-sources.json'), []);
  const dsList = Array.isArray(dataSources) ? dataSources : (dataSources?.connections || dataSources?.sources || []);
  for (const ds of dsList) {
    if (ds?.host) candidateIps.add(ds.host);
  }

  // 2. Local /24 IPv4 subnet
  if (opts.scanSubnet !== false) {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const iface of list || []) {
        if (!iface.internal && iface.family === 'IPv4' && (iface.address.startsWith('192.168.') || iface.address.startsWith('10.'))) {
          const prefix = iface.address.split('.').slice(0, 3).join('.');
          for (let i = 1; i <= 254; i++) candidateIps.add(`${prefix}.${i}`);
          break;
        }
      }
    }
  }

  const ips = [...candidateIps];
  const openIps = [];
  const batchSize = 64;
  for (let i = 0; i < ips.length; i += batchSize) {
    const chunk = ips.slice(i, i + batchSize);
    const results = await Promise.all(chunk.map(async ip => ((await tcpCheck(ip, port, opts.tcpTimeoutMs || 450)) ? ip : null)));
    for (const hit of results) if (hit) openIps.push(hit);
  }

  const discovered = [];
  const seenServerIds = new Set();
  for (const ip of openIps) {
    try {
      const info = await probeMediaServer(`http://${ip}:${port}`, { timeoutMs: 1800 });
      if (seenServerIds.has(info.serverId) && ip === '127.0.0.1' && openIps.length > 1) continue;
      if (!seenServerIds.has(info.serverId)) {
        seenServerIds.add(info.serverId);
        discovered.push(info);
      }
    } catch {}
  }
  return { ok: true, servers: discovered };
}

// ── Track Conversion for Movie Player & Audio Player ─────────────────────────

function convertItemToMovieTrack(item, { endpoint, folderId, virtualRoot, serverId, serverName }) {
  const base = normalizeServerUrl(endpoint);
  const ext = item.ext || (item.streamFormat === 'mkv' ? '.mkv' : '.mp4');
  const safeId = String(item.id).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const localPath = path.join(virtualRoot, `${safeId}${ext}`);
  const id = trackIdForPath(localPath);

  const directStreamUrl = item.directStreamUrl
    ? String(item.directStreamUrl).replace(/^https?:\/\/[^/]+/, base)
    : `${base}/stream/${encodeURIComponent(item.id)}${ext}`;
  const transcodeUrl = item.transcodeUrl
    ? String(item.transcodeUrl).replace(/^https?:\/\/[^/]+/, base)
    : `${base}/transcode/${encodeURIComponent(item.id)}.mp4`;
  const streamUrl = item.needsTranscode ? transcodeUrl : directStreamUrl;
  const artUrl = item.artUrl
    ? String(item.artUrl).replace(/^https?:\/\/[^/]+/, base)
    : `${base}/api/art/${encodeURIComponent(item.id)}.jpg`;
  const subtitlesUrl = item.subtitlesUrl
    ? String(item.subtitlesUrl).replace(/^https?:\/\/[^/]+/, base)
    : `${base}/api/subtitles/${encodeURIComponent(item.id)}.vtt`;

  const isTv = item.mediaType === 'tv';
  return {
    id,
    filePath: localPath,
    src: streamUrl,
    title: item.title || 'Untitled Video',
    artist: item.artist || item.qualityBadge || serverName || 'RobOS Media Service',
    album: isTv ? (item.showName || item.album || 'TV Series') : (item.album || item.title || 'Movies'),
    albumArtist: isTv ? (item.showName || item.album || 'TV Series') : undefined,
    discNumber: isTv ? (item.seasonNumber ?? 1) : undefined,
    trackNumber: isTv ? (item.episodeNumber ?? 1) : undefined,
    mediaType: isTv ? 'tv' : 'movie',
    showName: isTv ? (item.showName || '') : '',
    seasonNumber: isTv ? (item.seasonNumber ?? 1) : null,
    episodeNumber: isTv ? (item.episodeNumber ?? 1) : null,
    episodeCode: isTv ? (item.episodeCode || '') : '',
    episodeTitle: isTv ? (item.episodeTitle || '') : '',
    genre: item.genre || (isTv ? 'TV Series' : 'Movies'),
    genres: Array.isArray(item.genres) && item.genres.length ? item.genres : [item.genre || (isTv ? 'TV Series' : 'Movies')],
    year: item.year || null,
    rating: item.rating || null,
    overview: item.overview || '',
    duration: Number(item.duration) || 0,
    artId: artUrl,
    addedAt: item.addedAt || new Date().toISOString(),
    mediaService: {
      folderId,
      serverId,
      serverName,
      endpoint: base,
      remoteItemId: item.id,
      streamUrl,
      directStreamUrl,
      transcodeUrl,
      artUrl,
      subtitlesUrl,
      needsTranscode: Boolean(item.needsTranscode),
    },
  };
}

function convertItemToAudioTrack(item, { endpoint, folderId, virtualRoot, serverId, serverName }) {
  const base = normalizeServerUrl(endpoint);
  const ext = item.ext || '.mp3';
  const safeId = String(item.id).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const localPath = path.join(virtualRoot, `${safeId}${ext}`);
  const id = trackIdForPath(localPath);

  const directStreamUrl = item.directStreamUrl
    ? String(item.directStreamUrl).replace(/^https?:\/\/[^/]+/, base)
    : `${base}/stream/${encodeURIComponent(item.id)}${ext}`;
  const transcodeUrl = item.transcodeUrl
    ? String(item.transcodeUrl).replace(/^https?:\/\/[^/]+/, base)
    : `${base}/transcode-audio/${encodeURIComponent(item.id)}.mp3`;
  const artUrl = item.artUrl
    ? String(item.artUrl).replace(/^https?:\/\/[^/]+/, base)
    : `${base}/api/art/${encodeURIComponent(item.id)}.jpg`;
  const lyricsUrl = item.subtitlesUrl
    ? String(item.subtitlesUrl).replace(/^https?:\/\/[^/]+/, base)
    : null;

  return {
    id,
    filePath: localPath,
    src: ext === '.wma' || ext === '.alac' ? transcodeUrl : directStreamUrl,
    title: item.title || 'Untitled Track',
    artist: item.artist || 'Unknown Artist',
    albumArtist: item.albumArtist || item.artist || 'Unknown Artist',
    album: item.album || 'Singles',
    genre: item.genre || 'Music',
    year: item.year || null,
    trackNumber: item.trackNumber || null,
    discNumber: item.discNumber || null,
    duration: Number(item.duration) || 0,
    lossless: Boolean(item.lossless),
    codec: item.codec || ext.slice(1).toUpperCase(),
    artId: artUrl,
    addedAt: item.addedAt || new Date().toISOString(),
    mediaService: {
      folderId,
      serverId,
      serverName,
      endpoint: base,
      remoteItemId: item.id,
      streamUrl: directStreamUrl,
      transcodeUrl,
      artUrl,
      lyricsUrl,
    },
  };
}

async function fetchMovieCatalogTracks(endpoint, { folderId, virtualRoot, serverName = '', timeoutMs = 15000 } = {}) {
  const base = normalizeServerUrl(endpoint);
  const info = await probeMediaServer(base, { timeoutMs: Math.min(timeoutMs, 5000) });
  const cat = await httpGetJson(`${base}/api/catalog?type=movie,tv,education`, timeoutMs);
  const items = Array.isArray(cat.items) ? cat.items : [];
  const tracks = items.map(it => convertItemToMovieTrack(it, {
    endpoint: base,
    folderId,
    virtualRoot,
    serverId: info.serverId,
    serverName: serverName || info.serverName,
  }));
  return { info, tracks };
}

async function fetchAudioCatalogTracks(endpoint, { folderId, virtualRoot, serverName = '', timeoutMs = 15000 } = {}) {
  const base = normalizeServerUrl(endpoint);
  const info = await probeMediaServer(base, { timeoutMs: Math.min(timeoutMs, 5000) });
  const cat = await httpGetJson(`${base}/api/catalog?type=music`, timeoutMs);
  const items = Array.isArray(cat.items) ? cat.items : [];
  const tracks = items.map(it => convertItemToAudioTrack(it, {
    endpoint: base,
    folderId,
    virtualRoot,
    serverId: info.serverId,
    serverName: serverName || info.serverName,
  }));
  return { info, tracks };
}

// ── Background Auto-Reconciliation into Movie Player, Audio Player & MCP ─────

async function notifyRunningPlayer(configDir, controlFileName) {
  const ctrl = readJson(path.join(configDir, controlFileName), null);
  if (!ctrl || !ctrl.port) return false;
  try {
    await httpPostJson(
      `http://127.0.0.1:${ctrl.port}/api/media-service-reload`,
      {},
      ctrl.token ? { 'X-RobOS-Token': ctrl.token } : {},
      1500
    );
    return true;
  } catch {
    return false;
  }
}

function registerMcpForServer(configDir, srv, info) {
  const mcpRegistryFile = path.join(configDir, 'mcp', 'servers.json');
  const reg = readJson(mcpRegistryFile, {});
  const appId = 'robos-media-server';
  reg[appId] = {
    appId,
    name: info?.serverName ? `${info.serverName} MCP` : `${srv.name || 'RobOS Media Server'} MCP`,
    version: '1.0.0',
    status: 'RUNNING',
    port: Number(new URL(srv.url).port) || DEFAULT_MEDIA_SERVER_PORT,
    endpoint: `${normalizeServerUrl(srv.url)}/mcp`,
    tools: MCP_MEDIA_TOOLS,
    resources: MCP_MEDIA_RESOURCES,
  };
  writeJsonAtomic(mcpRegistryFile, reg);

  const mcpCfgFile = path.join(configDir, 'mcp-config.json');
  const mcpCfg = readJson(mcpCfgFile, null);
  if (mcpCfg && mcpCfg.agents && typeof mcpCfg.agents === 'object') {
    let changed = false;
    for (const agent of Object.keys(mcpCfg.agents)) {
      if (Array.isArray(mcpCfg.agents[agent]) && !mcpCfg.agents[agent].includes(appId)) {
        mcpCfg.agents[agent].push(appId);
        changed = true;
      }
    }
    if (changed) writeJsonAtomic(mcpCfgFile, mcpCfg);
  }
}

function removeServerFromLocalApps(srv, opts = {}) {
  const cfgDir = configDirOf(opts);
  const url = normalizeServerUrl(srv.url);

  for (const [target, foldersName, libName] of [
    ['movie', 'movie-folders.json', 'movie-library.json'],
    ['audio', 'audio-folders.json', 'audio-library.json'],
  ]) {
    const folderId = deterministicFolderId(url, target);
    const vRoot = virtualRootForServer(cfgDir, url, target);
    const foldersFile = path.join(cfgDir, foldersName);
    const folders = readJson(foldersFile, []);
    if (Array.isArray(folders)) {
      const next = folders.filter(f => !(f.id === folderId || (f.kind === 'media-service' && normalizeServerUrl(f.endpoint || f.path || 'http://invalid') === url)));
      if (next.length !== folders.length) writeJsonAtomic(foldersFile, next);
    }
    const libFile = path.join(cfgDir, libName);
    const lib = readJson(libFile, null);
    if (lib && Array.isArray(lib.tracks)) {
      const filtered = lib.tracks.filter(t => !(t?.filePath?.startsWith(vRoot + path.sep) || t?.mediaService?.endpoint === url));
      if (filtered.length !== lib.tracks.length) {
        writeJsonAtomic(libFile, { ...lib, updatedAt: new Date().toISOString(), tracks: filtered });
      }
    }
  }
}

async function syncMediaServicesToLocalApps(opts = {}) {
  const cfgDir = configDirOf(opts);
  const cfg = loadMediaServersConfig(opts);
  if (!cfg.autoSyncPlayers && !opts.force) {
    return { ok: true, skipped: 'autoSyncPlayers-disabled', syncedServers: [] };
  }

  const stateCacheFile = path.join(cfgDir, 'media-service-sync-state.json');
  const syncState = readJson(stateCacheFile, { revisions: {} });
  const results = [];

  for (const srv of cfg.servers) {
    if (!srv || srv.enabled === false || !srv.url) continue;
    const url = normalizeServerUrl(srv.url);
    let info;
    try {
      info = await probeMediaServer(url, { timeoutMs: opts.timeoutMs || 4000 });
    } catch (err) {
      results.push({ id: srv.id, url, ok: false, error: err.message });
      continue;
    }

    if (srv.autoConnectMcp !== false) {
      registerMcpForServer(cfgDir, srv, info);
    }

    const prevRev = syncState.revisions[url];
    const movieFolderId = deterministicFolderId(url, 'movie');
    const audioFolderId = deterministicFolderId(url, 'audio');
    const movieLibFile = path.join(cfgDir, 'movie-library.json');
    const audioLibFile = path.join(cfgDir, 'audio-library.json');

    // Always ensure folder entries exist in movie-folders.json and audio-folders.json
    if (srv.autoConnectMoviePlayer !== false) {
      const mFoldersFile = path.join(cfgDir, 'movie-folders.json');
      const mFolders = readJson(mFoldersFile, []);
      if (Array.isArray(mFolders)) {
        const idx = mFolders.findIndex(f => f.id === movieFolderId || (f.kind === 'media-service' && normalizeServerUrl(f.endpoint || f.path || 'http://x') === url));
        const folderEntry = {
          ...(idx >= 0 ? mFolders[idx] : {}),
          id: idx >= 0 ? mFolders[idx].id : movieFolderId,
          label: idx >= 0 && mFolders[idx].label ? mFolders[idx].label : `${srv.name || info.serverName} (Movies & Shows)`,
          kind: 'media-service',
          endpoint: url,
          path: url,
          serverId: info.serverId,
          syncEnabled: idx >= 0 ? mFolders[idx].syncEnabled !== false : true,
          lastSynced: new Date().toISOString(),
        };
        if (idx >= 0) mFolders[idx] = folderEntry;
        else mFolders.push(folderEntry);
        writeJsonAtomic(mFoldersFile, mFolders);
      }
    }

    if (srv.autoConnectAudioPlayer !== false) {
      const aFoldersFile = path.join(cfgDir, 'audio-folders.json');
      const aFolders = readJson(aFoldersFile, []);
      if (Array.isArray(aFolders)) {
        const idx = aFolders.findIndex(f => f.id === audioFolderId || (f.kind === 'media-service' && normalizeServerUrl(f.endpoint || f.path || 'http://x') === url));
        const folderEntry = {
          ...(idx >= 0 ? aFolders[idx] : {}),
          id: idx >= 0 ? aFolders[idx].id : audioFolderId,
          label: idx >= 0 && aFolders[idx].label ? aFolders[idx].label : `${srv.name || info.serverName} (Music)`,
          kind: 'media-service',
          endpoint: url,
          path: url,
          serverId: info.serverId,
          syncEnabled: idx >= 0 ? aFolders[idx].syncEnabled !== false : true,
          lastSynced: new Date().toISOString(),
        };
        if (idx >= 0) aFolders[idx] = folderEntry;
        else aFolders.push(folderEntry);
        writeJsonAtomic(aFoldersFile, aFolders);
      }
    }

    const needsFullCatalogSync = Boolean(opts.force)
      || prevRev !== info.catalogRevision
      || (srv.autoConnectMoviePlayer !== false && !fs.existsSync(movieLibFile))
      || (srv.autoConnectAudioPlayer !== false && !fs.existsSync(audioLibFile));

    let movieCount = 0;
    let audioCount = 0;
    let bookCount = 0;

    if (needsFullCatalogSync) {
      if (srv.autoConnectMoviePlayer !== false) {
        const vRoot = virtualRootForServer(cfgDir, url, 'movie');
        const { tracks } = await fetchMovieCatalogTracks(url, {
          folderId: movieFolderId,
          virtualRoot: vRoot,
          serverName: srv.name || info.serverName,
          timeoutMs: opts.catalogTimeoutMs || 20000,
        });
        const existingLib = readJson(movieLibFile, { tracks: [] });
        const otherTracks = (Array.isArray(existingLib.tracks) ? existingLib.tracks : []).filter(
          t => !(t?.filePath?.startsWith(vRoot + path.sep) || t?.mediaService?.endpoint === url)
        );
        writeJsonAtomic(movieLibFile, {
          updatedAt: new Date().toISOString(),
          tracks: otherTracks.concat(tracks),
        });
        movieCount = tracks.length;
        await notifyRunningPlayer(cfgDir, 'movie-player-control.json');
      }

      if (srv.autoConnectAudioPlayer !== false) {
        const vRoot = virtualRootForServer(cfgDir, url, 'audio');
        const { tracks } = await fetchAudioCatalogTracks(url, {
          folderId: audioFolderId,
          virtualRoot: vRoot,
          serverName: srv.name || info.serverName,
          timeoutMs: opts.catalogTimeoutMs || 20000,
        });
        const existingLib = readJson(audioLibFile, { tracks: [] });
        const otherTracks = (Array.isArray(existingLib.tracks) ? existingLib.tracks : []).filter(
          t => !(t?.filePath?.startsWith(vRoot + path.sep) || t?.mediaService?.endpoint === url)
        );
        writeJsonAtomic(audioLibFile, {
          updatedAt: new Date().toISOString(),
          tracks: otherTracks.concat(tracks),
        });
        audioCount = tracks.length;
        await notifyRunningPlayer(cfgDir, 'audio-player-control.json');
      }

      // Sync Books snapshot as well
      try {
        const booksCat = await httpGetJson(`${url}/api/catalog?type=book`, 10000);
        const booksFile = path.join(cfgDir, 'books-library.json');
        writeJsonAtomic(booksFile, {
          updatedAt: new Date().toISOString(),
          serverUrl: url,
          serverName: srv.name || info.serverName,
          books: Array.isArray(booksCat.items) ? booksCat.items : [],
        });
        bookCount = Array.isArray(booksCat.items) ? booksCat.items.length : 0;
      } catch {}

      syncState.revisions[url] = info.catalogRevision;
      syncState.lastSyncedAt = new Date().toISOString();
      writeJsonAtomic(stateCacheFile, syncState);
    }

    results.push({
      id: srv.id,
      name: srv.name || info.serverName,
      url,
      ok: true,
      catalogRevision: info.catalogRevision,
      updatedCatalog: needsFullCatalogSync,
      counts: info.counts,
      synced: { movieCount, audioCount, bookCount },
    });
  }

  return { ok: true, syncedServers: results };
}

/**
 * Completely clears all legacy Movie Player and Audio Player folders, libraries,
 * playlists, stats, caches, watch/play history, and Electron userData, while
 * preserving `media-servers.json` and hardware `audio-devices.json`, then reloads
 * fresh libraries from configured RobOS Media Services.
 */
async function resetAndLoadPlayerLibraries(opts = {}) {
  const cfgDir = configDirOf(opts);
  const baseHome = opts.homeDir
    ? opts.homeDir
    : (opts.configDir ? null : (process.env.HOME || os.homedir()));
  const cacheRoot = opts.cacheDir || (baseHome ? path.join(baseHome, '.cache', 'robos') : null);

  const removedPaths = [];
  const rmTarget = (target) => {
    if (!target || !fs.existsSync(target)) return;
    fs.rmSync(target, { recursive: true, force: true });
    removedPaths.push(target);
  };

  const configTargets = [
    'movie-folders.json',
    'movie-library.json',
    'movie-playlists.json',
    'movie-track-stats.json',
    'movie-public-metadata-cache.json',
    'movie-cache-settings.json',
    'movie-player-control.json',
    'movie-player',
    'movie-subtitles',
    'audio-folders.json',
    'audio-library.json',
    'audio-playlists.json',
    'audio-track-stats.json',
    'audio-cache-settings.json',
    'audio-player-control.json',
    'audio-lyrics',
    'books-library.json',
    path.join('media-history', 'movie-player.json'),
    path.join('media-history', 'audio-player.json'),
    'media-service-sync-state.json',
    'media-service-streams',
    'peer-streams',
    path.join('electron', 'robos-movie-player'),
    path.join('electron', 'robos-audio-player'),
  ];
  for (const rel of configTargets) {
    rmTarget(path.join(cfgDir, rel));
  }

  if (cacheRoot) {
    for (const rel of ['movie-player', 'audio-player', 'movie-subtitles', 'cloud-metadata-cache.json']) {
      rmTarget(path.join(cacheRoot, rel));
    }
  }

  if (baseHome && opts.clearElectronUserData !== false) {
    for (const dirName of ['robos-movie-player', 'robos-audio-player']) {
      rmTarget(path.join(baseHome, '.config', dirName));
    }
  }

  const syncResult = await syncMediaServicesToLocalApps({ ...opts, force: true });
  return {
    ok: true,
    removedCount: removedPaths.length,
    removedPaths,
    syncResult,
  };
}

function startMediaServiceAutoSync(opts = {}) {
  const cfgDir = configDirOf(opts);
  const log = opts.log || (() => {});
  const intervalMs = Number(opts.intervalMs || process.env.ROBOS_MEDIA_SERVICE_POLL_MS || 45000);
  let timer = null;
  let watchTimer = null;
  let watcher = null;
  let running = null;
  let stopped = false;

  async function tick(reason = 'poll', force = false) {
    if (stopped) return null;
    if (running) return running;
    running = syncMediaServicesToLocalApps({ ...opts, force })
      .then((res) => {
        const updated = (res.syncedServers || []).filter(s => s.updatedCatalog);
        if (updated.length) {
          log(`synced ${updated.length} RobOS Media Service(s) (${reason})`);
        }
        return res;
      })
      .catch((err) => {
        log(`media service sync error: ${err.message}`);
        return { ok: false, error: err.message };
      })
      .finally(() => {
        running = null;
        if (!stopped) {
          clearTimeout(timer);
          timer = setTimeout(() => tick('poll', false), intervalMs);
          timer.unref?.();
        }
      });
    return running;
  }

  fs.mkdirSync(cfgDir, { recursive: true });
  try {
    watcher = fs.watch(cfgDir, (_evt, filename) => {
      if (filename !== 'media-servers.json' || running) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => tick('config-changed', true), 400);
      watchTimer.unref?.();
    });
    watcher.on('error', () => { try { watcher.close(); } catch {} });
  } catch {}

  const initialDelay = opts.startDelayMs ?? 1500;
  timer = setTimeout(() => tick('startup', false), initialDelay);
  timer.unref?.();

  return {
    runNow: (force = true) => tick('manual', force),
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(watchTimer);
      try { watcher?.close(); } catch {}
    },
  };
}

module.exports = {
  DEFAULT_MEDIA_SERVER_PORT,
  MCP_MEDIA_TOOLS,
  MCP_MEDIA_RESOURCES,
  normalizeServerUrl,
  deterministicServerId,
  deterministicFolderId,
  virtualRootForServer,
  loadMediaServersConfig,
  saveMediaServersConfig,
  listMediaServers,
  saveMediaServer,
  removeMediaServer,
  setAutoSyncPlayers,
  probeMediaServer,
  discoverMediaServersOnLan,
  convertItemToMovieTrack,
  convertItemToAudioTrack,
  fetchMovieCatalogTracks,
  fetchAudioCatalogTracks,
  syncMediaServicesToLocalApps,
  resetAndLoadPlayerLibraries,
  startMediaServiceAutoSync,
};
