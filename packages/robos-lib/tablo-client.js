'use strict';

/**
 * RobOS Tablo OTA DVR & Live TV Client (`robos-lib/tablo-client`)
 *
 * Connects directly to a Tablo device on the local LAN (default `192.168.1.55:8887`)
 * using Tablo's HMAC-MD5 device request signing (`tablo:<device_key>:<sig>`),
 * discovers DVR recordings (`/recordings/airings`), live OTA channels (`/guide/channels`),
 * storage & tuner telemetry (`/server/harddrives`, `/server/tuners`), thumbnail images
 * (`/images/<id>`), and streams recordings/channels to HTML5 `<video>` via on-the-fly
 * `ffmpeg` MPEG-2/AC-3 -> H.264/AAC fragmented MP4 transcoding or direct HLS playback.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const DEFAULT_TABLO_IP = process.env.ROBOS_TABLO_IP || '192.168.1.55';
const DEFAULT_TABLO_PORT = Number(process.env.ROBOS_TABLO_PORT || 8887);

// Tablo local device HMAC-MD5 signing keys
const TABLO_HASH_KEY = '6l8jU5N43cEilqItmT3U2M2PFM3qPziilXqau9ys';
const TABLO_DEVICE_KEY = 'ljpg6ZkwShVv8aI12E2LP55Ep8vq1uYDPvX0DdTB';
const TABLO_USER_AGENT = 'Tablo-FAST/2.0.0 (Mobile; iPhone; iOS 16.6)';

function makeTabloDeviceAuth(method, urlPath, body = '', dateStr = new Date().toUTCString()) {
  const cleanMethod = String(method || 'GET').toUpperCase();
  const cleanPath = String(urlPath || '/').split('?')[0];
  const bodyStr = body ? String(body) : '';
  const msgHash = bodyStr ? crypto.createHash('md5').update(bodyStr).digest('hex').toLowerCase() : '';
  const payload = `${cleanMethod}\n${cleanPath}\n${msgHash}\n${dateStr}`;
  const sig = crypto.createHmac('md5', TABLO_HASH_KEY).update(payload).digest('hex').toLowerCase();
  return {
    authorization: `tablo:${TABLO_DEVICE_KEY}:${sig}`,
    date: dateStr,
  };
}

function tabloRequestOnce(ip, port, method, urlPath, { body = '', timeoutMs = 4500, rawBuffer = false, contentType } = {}) {
  const targetIp = String(ip || DEFAULT_TABLO_IP).trim();
  const targetPort = Number(port || DEFAULT_TABLO_PORT);
  const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const { authorization, date } = makeTabloDeviceAuth(method, urlPath, bodyStr);

  const headers = {
    Authorization: authorization,
    Date: date,
    Accept: '*/*',
    Connection: 'close',
    'User-Agent': TABLO_USER_AGENT,
  };
  if (bodyStr) {
    headers['Content-Type'] = contentType || 'application/x-www-form-urlencoded';
    headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
  }

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: targetIp,
        port: targetPort,
        path: urlPath,
        method: String(method || 'GET').toUpperCase(),
        agent: false,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const status = res.statusCode || 0;
          if (rawBuffer) {
            return resolve({
              ok: status >= 200 && status < 300,
              status,
              headers: res.headers,
              buffer,
            });
          }
          const text = buffer.toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: res.headers,
            text,
            json,
          });
        });
      }
    );
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout' });
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function tabloRequest(ip, port, method, urlPath, opts = {}) {
  const first = await tabloRequestOnce(ip, port, method, urlPath, opts);
  if (first.ok || first.status === 404 || first.status === 401) return first;
  await new Promise((r) => setTimeout(r, 120));
  return tabloRequestOnce(ip, port, method, urlPath, opts);
}

async function getTabloStatus({ ip = DEFAULT_TABLO_IP, port = DEFAULT_TABLO_PORT, timeoutMs = 2500 } = {}) {
  const [infoRes, hdRes, tunersRes, settingsRes] = await Promise.all([
    tabloRequest(ip, port, 'GET', '/server/info', { timeoutMs }),
    tabloRequest(ip, port, 'GET', '/server/harddrives', { timeoutMs }),
    tabloRequest(ip, port, 'GET', '/server/tuners', { timeoutMs }),
    tabloRequest(ip, port, 'GET', '/settings/info', { timeoutMs }),
  ]);

  if (!infoRes.ok || !infoRes.json || !infoRes.json.server_id) {
    return {
      ok: false,
      ip,
      port,
      online: false,
      error: infoRes.error || (infoRes.json && infoRes.json.error && infoRes.json.error.description) || `Unreachable on ${ip}:${port}`,
    };
  }

  const info = infoRes.json;
  const harddrives = Array.isArray(hdRes.json) ? hdRes.json : [];
  const tuners = Array.isArray(tunersRes.json) ? tunersRes.json : [];
  const settings = settingsRes.json && !settingsRes.json.error ? settingsRes.json : {};

  return {
    ok: true,
    ip,
    port,
    online: true,
    serverId: info.server_id,
    name: info.name || 'Tablo',
    version: info.version || '',
    buildNumber: info.build_number || 0,
    availability: info.availability || 'ready',
    setupCompleted: Boolean(info.setup_completed),
    model: info.model || { name: 'Tablo DVR', type: 'tablo', tuners: tuners.length || 2, wifi: true },
    harddrives,
    tuners,
    settings,
  };
}

async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  });
  await Promise.all(workers);
  return results;
}

function formatDurationHuman(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function normalizeRecording(raw, parentMap, { ip, port, portalBaseUrl = '' }) {
  if (!raw || typeof raw !== 'object') return null;
  const objectId = raw.object_id || Number(String(raw.path || '').split('/').pop()) || 0;
  const itemPath = raw.path || '';
  const parentPath = raw.series_path || raw.sport_path || raw.movie_path || raw.program_path || null;
  const parent = (parentPath && parentMap.get(parentPath)) || null;

  let kind = 'program';
  if (itemPath.includes('/sports/')) kind = 'sports';
  else if (itemPath.includes('/series/')) kind = 'series';
  else if (itemPath.includes('/movies/')) kind = 'movie';

  const showTitle =
    raw.airing_details?.show_title ||
    parent?.series?.title ||
    parent?.sport?.title ||
    parent?.movie?.title ||
    'Recorded Program';

  const ep = raw.episode || null;
  const ev = raw.event || null;
  const mv = raw.movie_airing || raw.movie || parent?.movie || null;

  let episodeCode = '';
  if (ep && (ep.season_number || ep.number)) {
    const sNum = String(ep.season_number || 1).padStart(2, '0');
    const eNum = String(ep.number || 1).padStart(2, '0');
    episodeCode = `S${sNum}E${eNum}`;
  }

  const subTitle =
    (ev && ev.title) ||
    (ep && ep.title) ||
    (mv && mv.title) ||
    '';

  const title = subTitle || showTitle;
  const fullTitle =
    subTitle && subTitle !== showTitle
      ? `${showTitle}: ${episodeCode ? `${episodeCode} — ` : ''}${subTitle}`
      : episodeCode
      ? `${showTitle} (${episodeCode})`
      : showTitle;

  const description =
    (ev && ev.description) ||
    (ep && ep.description) ||
    parent?.series?.description ||
    parent?.movie?.plot ||
    '';

  const chObj = raw.airing_details?.channel?.channel || {};
  const major = chObj.major || 0;
  const minor = chObj.minor || 0;
  const channelNumber = major ? `${major}.${minor || 1}` : '';
  const callSign = chObj.call_sign || chObj.name || '';
  const network = chObj.network || '';

  const vid = raw.video_details || {};
  const durationSec = Math.round(Number(vid.duration || raw.airing_details?.duration || 0));
  const sizeBytes = Number(vid.size || 0);
  const width = Number(vid.width || 1280);
  const height = Number(vid.height || 720);
  const resolution =
    height >= 1080 || chObj.resolution === 'hd_1080'
      ? '1080p HD'
      : height >= 720 || chObj.resolution === 'hd_720'
      ? '720p HD'
      : 'SD';

  const snapshotImageId =
    raw.snapshot_image?.image_id ||
    parent?.series?.thumbnail_image?.image_id ||
    parent?.series?.cover_image?.image_id ||
    null;
  const coverImageId =
    parent?.series?.cover_image?.image_id ||
    parent?.series?.background_image?.image_id ||
    snapshotImageId ||
    null;

  const base = String(portalBaseUrl || '').replace(/\/$/, '');
  const imageUrl = snapshotImageId
    ? `${base}/api/tablo/image/${snapshotImageId}?ip=${encodeURIComponent(ip)}&port=${port}`
    : '';
  const coverUrl = coverImageId
    ? `${base}/api/tablo/image/${coverImageId}?ip=${encodeURIComponent(ip)}&port=${port}`
    : imageUrl;
  const streamUrl = `${base}/api/tablo/stream?path=${encodeURIComponent(itemPath)}&ip=${encodeURIComponent(ip)}&port=${port}`;

  return {
    id: objectId,
    path: itemPath,
    kind,
    showTitle,
    title,
    subTitle,
    fullTitle,
    episodeCode,
    description,
    airDate: raw.airing_details?.datetime || '',
    origAirDate: ep?.orig_air_date || parent?.series?.orig_air_date || '',
    venue: ev?.venue || '',
    teams: Array.isArray(ev?.teams) ? ev.teams.map((t) => t.name).filter(Boolean) : [],
    genres: parent?.series?.genres || [],
    cast: parent?.series?.cast || [],
    durationSec,
    durationFormatted: formatDurationHuman(durationSec),
    sizeBytes,
    sizeFormatted: sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB` : '',
    state: vid.state || 'finished',
    clean: vid.clean !== false,
    width,
    height,
    resolution,
    videoCodec: vid.container_format || 'mpeg2',
    audioCodec: vid.audio || 'ac3',
    channel: {
      callSign,
      number: channelNumber,
      major,
      minor,
      network,
      resolution: chObj.resolution || '',
      label: [channelNumber, callSign, network ? `(${network})` : ''].filter(Boolean).join(' '),
    },
    watched: Boolean(raw.user_info?.watched),
    protected: Boolean(raw.user_info?.protected),
    positionSec: Math.round(Number(raw.user_info?.position || 0)),
    snapshotImageId,
    coverImageId,
    imageUrl,
    coverUrl,
    streamUrl,
  };
}

async function listTabloRecordings({ ip = DEFAULT_TABLO_IP, port = DEFAULT_TABLO_PORT, portalBaseUrl = '' } = {}) {
  const airingsRes = await tabloRequest(ip, port, 'GET', '/recordings/airings');
  if (!airingsRes.ok || !Array.isArray(airingsRes.json)) {
    return {
      ok: false,
      ip,
      port,
      recordings: [],
      error:
        airingsRes.error ||
        (airingsRes.json && airingsRes.json.error && airingsRes.json.error.description) ||
        `Could not list recordings from ${ip}:${port}`,
    };
  }

  const airingPaths = airingsRes.json;
  const rawRecordings = await mapConcurrent(airingPaths, 4, async (p) => {
    const r = await tabloRequest(ip, port, 'GET', p);
    return r.ok && r.json ? r.json : null;
  });

  const validRaw = rawRecordings.filter(Boolean);
  const parentPaths = Array.from(
    new Set(
      validRaw
        .map((r) => r.series_path || r.sport_path || r.movie_path || r.program_path)
        .filter(Boolean)
    )
  );

  const parentMap = new Map();
  await mapConcurrent(parentPaths, 4, async (pp) => {
    const r = await tabloRequest(ip, port, 'GET', pp);
    if (r.ok && r.json) parentMap.set(pp, r.json);
  });

  const recordings = validRaw
    .map((r) => normalizeRecording(r, parentMap, { ip, port, portalBaseUrl }))
    .filter(Boolean)
    .sort((a, b) => String(b.airDate || '').localeCompare(String(a.airDate || '')));

  return {
    ok: true,
    ip,
    port,
    count: recordings.length,
    recordings,
  };
}

async function listTabloChannels({ ip = DEFAULT_TABLO_IP, port = DEFAULT_TABLO_PORT, portalBaseUrl = '' } = {}) {
  const chRes = await tabloRequest(ip, port, 'GET', '/guide/channels');
  if (!chRes.ok || !Array.isArray(chRes.json)) {
    return {
      ok: false,
      ip,
      port,
      channels: [],
      error: chRes.error || `Could not list channels from ${ip}:${port}`,
    };
  }

  const rawChannels = await mapConcurrent(chRes.json, 10, async (p) => {
    const r = await tabloRequest(ip, port, 'GET', p);
    return r.ok && r.json ? r.json : null;
  });

  const base = String(portalBaseUrl || '').replace(/\/$/, '');
  const channels = rawChannels
    .filter(Boolean)
    .map((c) => {
      const ch = c.channel || {};
      const major = Number(ch.major || 0);
      const minor = Number(ch.minor || 0);
      const number = major ? `${major}.${minor}` : String(c.object_id || '');
      const logoId = Array.isArray(ch.logos) && ch.logos[0]?.image_id ? ch.logos[0].image_id : null;
      return {
        id: c.object_id,
        path: c.path,
        number,
        major,
        minor,
        callSign: ch.call_sign || ch.name || '',
        name: ch.name || ch.call_sign || '',
        network: ch.network || '',
        resolution: ch.resolution === 'hd_1080' ? '1080i HD' : ch.resolution === 'hd_720' ? '720p HD' : 'SD',
        source: ch.source || 'ota',
        logoImageId: logoId,
        logoUrl: logoId ? `${base}/api/tablo/image/${logoId}?ip=${encodeURIComponent(ip)}&port=${port}` : '',
        streamUrl: `${base}/api/tablo/stream?path=${encodeURIComponent(c.path)}&ip=${encodeURIComponent(ip)}&port=${port}`,
      };
    })
    .sort((a, b) => (a.major - b.major) || (a.minor - b.minor));

  return {
    ok: true,
    ip,
    port,
    count: channels.length,
    channels,
  };
}

async function watchTabloPath({ ip = DEFAULT_TABLO_IP, port = DEFAULT_TABLO_PORT, itemPath } = {}) {
  const cleanPath = String(itemPath || '').trim();
  if (!cleanPath.startsWith('/')) {
    return { ok: false, error: 'Invalid Tablo item path' };
  }
  const watchEndpoint = cleanPath.endsWith('/watch') ? cleanPath : `${cleanPath}/watch`;
  const res = await tabloRequest(ip, port, 'POST', watchEndpoint);
  if (res.ok && res.json && res.json.playlist_url) {
    return {
      ok: true,
      ip,
      port,
      path: cleanPath,
      playlistUrl: res.json.playlist_url,
      token: res.json.token || '',
      expires: res.json.expires || '',
      keepalive: res.json.keepalive || 0,
      videoDetails: res.json.video_details || {},
      audioDetails: res.json.audio_details || {},
    };
  }

  // Fallback for recordings via direct PVR HLS playlist on port 18080
  if (cleanPath.startsWith('/recordings/')) {
    const objectId = cleanPath.split('/').pop();
    if (objectId && /^\d+$/.test(objectId)) {
      return {
        ok: true,
        ip,
        port,
        path: cleanPath,
        playlistUrl: `http://${ip}:18080/pvr/${objectId}/pl/playlist.m3u8`,
        fallbackPvr: true,
      };
    }
  }

  return {
    ok: false,
    ip,
    port,
    path: cleanPath,
    error:
      res.error ||
      (res.json && res.json.error && res.json.error.description) ||
      `Tablo rejected watch request for ${cleanPath} (HTTP ${res.status})`,
  };
}

async function fetchTabloImage({ ip = DEFAULT_TABLO_IP, port = DEFAULT_TABLO_PORT, imageId } = {}) {
  const id = String(imageId || '').replace(/[^\d]/g, '');
  if (!id) return { ok: false, status: 400, error: 'Invalid image ID' };
  const res = await tabloRequest(ip, port, 'GET', `/images/${id}`, { rawBuffer: true, timeoutMs: 4000 });
  if (!res.ok || !res.buffer || !res.buffer.length) {
    return { ok: false, status: res.status || 404, error: res.error || 'Image not found' };
  }
  return {
    ok: true,
    status: 200,
    contentType: res.headers?.['content-type'] || 'image/jpeg',
    buffer: res.buffer,
  };
}

function streamTabloViaFfmpeg({ playlistUrl, seekSec = 0, req, res }) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  const seek = Math.max(0, Number(seekSec) || 0);
  if (seek > 0) {
    args.push('-ss', String(seek));
  }
  args.push(
    '-i',
    playlistUrl,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-b:a',
    '160k',
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  );

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    Connection: 'keep-alive',
  });

  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      ff.kill('SIGKILL');
    } catch {}
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);

  ff.stdout.pipe(res);
  ff.on('error', () => {
    cleanup();
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    try {
      res.end();
    } catch {}
  });
  ff.on('close', () => {
    try {
      res.end();
    } catch {}
  });

  return ff;
}

async function openTabloExternalPlayer({ ip = DEFAULT_TABLO_IP, port = DEFAULT_TABLO_PORT, itemPath, title = 'Tablo Stream' } = {}) {
  const watch = await watchTabloPath({ ip, port, itemPath });
  if (!watch.ok || !watch.playlistUrl) {
    return watch;
  }

  const candidates = [
    { bin: 'mpv', args: [`--title=${title}`, watch.playlistUrl] },
    { bin: 'vlc', args: [watch.playlistUrl] },
    { bin: 'ffplay', args: ['-window_title', title, watch.playlistUrl] },
  ];

  for (const c of candidates) {
    const check = spawnSync('which', [c.bin], { encoding: 'utf8' });
    if (check.status === 0) {
      const child = spawn(c.bin, c.args, { detached: true, stdio: 'ignore' });
      child.unref();
      return {
        ok: true,
        player: c.bin,
        playlistUrl: watch.playlistUrl,
        message: `Opened "${title}" in ${c.bin} (${watch.playlistUrl})`,
      };
    }
  }

  return {
    ok: true,
    player: null,
    playlistUrl: watch.playlistUrl,
    message: `Direct HLS URL ready: ${watch.playlistUrl}`,
  };
}

module.exports = {
  DEFAULT_TABLO_IP,
  DEFAULT_TABLO_PORT,
  makeTabloDeviceAuth,
  tabloRequest,
  getTabloStatus,
  listTabloRecordings,
  listTabloChannels,
  watchTabloPath,
  fetchTabloImage,
  streamTabloViaFfmpeg,
  openTabloExternalPlayer,
};
