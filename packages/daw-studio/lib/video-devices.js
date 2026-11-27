'use strict';

/**
 * RobOS DAW Studio — Video Inputs (RobOS IP Camera, ONVIF, Camera Watch, V4L2 Webcams),
 * HD Video Quality Presets, & Synchronized Multi-Track Video Recorder (`ffmpeg` Fragmented MP4 + Faststart).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const dgram = require('dgram');
const crypto = require('crypto');
const { spawn, spawnSync, execFile, execFileSync } = require('child_process');

const DEFAULT_VIDEO_QUALITY = 'hd-1080p';

const VIDEO_QUALITY_PRESETS = [
  {
    id: 'hd-1080p',
    label: 'HD Quality — 1080p Full HD (Up to 1920x1080 · 30 fps · Studio HQ)',
    shortLabel: '1080p Full HD',
    width: 1920,
    height: 1080,
    fps: 30,
    crf: 18,
    jpegQuality: 88,
    robosResolution: 'FHD_1080P',
    robosStreamPath: '/video',
    isHd: true,
  },
  {
    id: 'hd-720p',
    label: 'HD Quality — 720p HD (1280x720 · 30 fps · Standard HD)',
    shortLabel: '720p HD',
    width: 1280,
    height: 720,
    fps: 30,
    crf: 19,
    jpegQuality: 85,
    robosResolution: 'HD_720P',
    robosStreamPath: '/video',
    isHd: true,
  },
  {
    id: 'sd-480p',
    label: 'SD 480p (854x480 · 24 fps · Balanced Size)',
    shortLabel: '480p SD',
    width: 854,
    height: 480,
    fps: 24,
    crf: 22,
    jpegQuality: 78,
    robosResolution: 'SD_480P',
    robosStreamPath: '/video',
    isHd: false,
  },
  {
    id: 'low-360p',
    label: 'Low Bandwidth 360p (640x360 · 15 fps · RobOS /sub Stream)',
    shortLabel: '360p Low',
    width: 640,
    height: 360,
    fps: 15,
    crf: 24,
    jpegQuality: 72,
    robosResolution: 'QHD_360P',
    robosStreamPath: '/sub',
    isHd: false,
  },
];

function getVideoQualitySpec(presetId) {
  return VIDEO_QUALITY_PRESETS.find(p => p.id === presetId) || VIDEO_QUALITY_PRESETS[0];
}

function makeVideoId(prefix = 'vid') {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function slugifyVideo(text) {
  return String(text || 'video-cam')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'video-cam';
}

function withVideoCredentials(rawUrl, username, password) {
  if (!rawUrl || !username) return String(rawUrl || '');
  try {
    const u = new URL(rawUrl);
    if (!u.username) {
      u.username = username;
      u.password = password || '';
    }
    return u.toString();
  } catch {
    return String(rawUrl || '');
  }
}

function redactVideoUrl(rawUrl) {
  return String(rawUrl || '').replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:)([^@/\s]+)@/gi, '$1***@');
}

function parseRobosBaseUrl(hostOrUrl, defaultPort = 8080) {
  const raw = String(hostOrUrl || '').trim();
  if (!raw) return null;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const port = Number(u.port) || (u.protocol === 'https:' ? 443 : defaultPort);
      return {
        protocol: u.protocol,
        host: u.hostname,
        port,
        baseUrl: `${u.protocol}//${u.hostname}:${port}`,
      };
    }
    // Plain host or host:port (e.g. "192.168.1.65" or "192.168.1.65:8080")
    const cleaned = raw.replace(/\/.*$/, '');
    const colonIdx = cleaned.lastIndexOf(':');
    let host = cleaned;
    let port = Number(defaultPort) || 8080;
    if (colonIdx > 0) {
      const maybePort = Number(cleaned.slice(colonIdx + 1));
      if (Number.isFinite(maybePort) && maybePort > 0 && maybePort <= 65535) {
        host = cleaned.slice(0, colonIdx);
        port = maybePort;
      }
    }
    if (!host) return null;
    return {
      protocol: 'http:',
      host,
      port,
      baseUrl: `http://${host}:${port}`,
    };
  } catch {
    return null;
  }
}

function resolveRobosStreamUrlForQuality(streamUrl, qualityPreset = DEFAULT_VIDEO_QUALITY) {
  const spec = getVideoQualitySpec(qualityPreset);
  const raw = String(streamUrl || '').trim();
  if (!raw) return '';
  if (/\/(video|sub|mjpeg|live)(\?.*)?$/i.test(raw)) {
    return raw.replace(/\/(video|sub|mjpeg|live)(\?.*)?$/i, `${spec.robosStreamPath}$2`);
  }
  return raw;
}

function withRobosCleanStreamParam(streamUrl) {
  const raw = String(streamUrl || '').trim();
  if (!raw) return '';
  if (/[?&](timestamp|osd|clean)=/i.test(raw)) return raw;
  return `${raw}${raw.includes('?') ? '&' : '?'}timestamp=0`;
}

function buildRobosIpCameraSource({
  id = '',
  host = '',
  port = 8080,
  baseUrl = '',
  name = '',
  username = '',
  password = '',
  qualityPreset = DEFAULT_VIDEO_QUALITY,
  origin = 'robos-ip-camera',
  status = null,
} = {}) {
  const parsed = parseRobosBaseUrl(baseUrl || host, port);
  const resolvedHost = parsed?.host || String(host || '').trim();
  const resolvedPort = parsed?.port || Number(port) || 8080;
  const resolvedBase = parsed?.baseUrl || (resolvedHost ? `http://${resolvedHost}:${resolvedPort}` : '');
  const spec = getVideoQualitySpec(qualityPreset);

  const camName = String(status?.name || name || (resolvedHost ? `RobOS IP Camera (${resolvedHost})` : 'RobOS IP Camera')).trim();
  const resTag = (status?.width && status?.height) ? `${status.width}x${status.height}` : spec.shortLabel;
  const battTag = (typeof status?.batteryPercent === 'number' && status.batteryPercent >= 0)
    ? ` · ${status.batteryPercent}%`
    : '';
  const streamUrl = resolvedBase ? `${resolvedBase}${spec.robosStreamPath}` : '';
  const snapshotUrl = resolvedBase ? `${resolvedBase}/snapshot.jpg` : '';

  return {
    id: id || (resolvedHost ? `robos-cam:${resolvedHost}:${resolvedPort}` : 'robos-cam:manual'),
    sourceType: 'robos-ip-camera',
    protocol: 'mjpeg',
    label: `${camName} (RobOS IP Camera · ${resolvedHost ? `${resolvedHost}:${resolvedPort} · ` : ''}${resTag}${battTag})`,
    shortName: camName,
    host: resolvedHost,
    port: resolvedPort,
    baseUrl: resolvedBase,
    streamUrl,
    subStreamUrl: resolvedBase ? `${resolvedBase}/sub` : '',
    snapshotUrl,
    controlUrl: resolvedBase ? `${resolvedBase}/api/control` : '',
    statusUrl: resolvedBase ? `${resolvedBase}/api/status` : '',
    devicePath: '',
    username: String(username || ''),
    password: String(password || ''),
    isRobosAndroidCam: true,
    qualityPreset: spec.id,
    fps: spec.fps,
    origin,
    robosStatus: status || null,
  };
}

// ─── RobOS IP Camera HTTP Status Probe, Remote Control & Subnet Discovery ───

function httpJsonRequest(targetUrl, { method = 'GET', bodyObj = null, username = '', password = '', timeoutMs = 1200 } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      resolve(null);
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const headers = { Accept: 'application/json' };
    const user = username || (parsed.username ? decodeURIComponent(parsed.username) : '');
    const pass = password || (parsed.password ? decodeURIComponent(parsed.password) : '');
    if (user) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }
    let payloadBuf = null;
    if (bodyObj !== null) {
      payloadBuf = Buffer.from(JSON.stringify(bodyObj), 'utf8');
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(payloadBuf.length);
    }

    const req = mod.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      headers,
      timeout: timeoutMs,
      rejectUnauthorized: false,
    }, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', c => {
        total += c.length;
        if (total <= 256 * 1024) chunks.push(c);
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    if (payloadBuf) req.write(payloadBuf);
    req.end();
  });
}

async function probeRobosIpCameraStatus(hostOrUrl, { port = 8080, username = '', password = '', timeoutMs = 1100 } = {}) {
  const parsed = parseRobosBaseUrl(hostOrUrl, port);
  if (!parsed) return { ok: false, error: 'Invalid RobOS IP Camera address' };

  const ping = await httpJsonRequest(`${parsed.baseUrl}/api/ping`, { timeoutMs });
  const status = await httpJsonRequest(`${parsed.baseUrl}/api/status`, { username, password, timeoutMs });

  if (!ping && !status) {
    return { ok: false, host: parsed.host, port: parsed.port, baseUrl: parsed.baseUrl, error: `No RobOS IP Camera reachable at ${parsed.baseUrl}` };
  }
  const isRobos = (ping?.app === 'robos-ip-camera') || (status?.app === 'robos-ip-camera') || (status?.manufacturer === 'RobOS');
  if (!isRobos) {
    return { ok: false, host: parsed.host, port: parsed.port, baseUrl: parsed.baseUrl, error: `Endpoint at ${parsed.baseUrl} is not a RobOS IP Camera` };
  }

  const mergedStatus = {
    app: 'robos-ip-camera',
    name: status?.name || ping?.name || 'RobOS IP Camera',
    room: status?.room || ping?.room || '',
    urn: status?.urn || ping?.urn || '',
    model: status?.model || 'Android Phone',
    live: status ? Boolean(status.live) : true,
    state: status?.state || 'live',
    width: Number(status?.width) || 1280,
    height: Number(status?.height) || 720,
    fps: Number(status?.fps) || Number(status?.targetFps) || 30,
    targetFps: Number(status?.targetFps) || 30,
    lensFacing: status?.lensFacing || 'BACK',
    zoomRatio: Number(status?.zoomRatio) || 1.0,
    torchEnabled: Boolean(status?.torchEnabled),
    overlayTimestamp: status?.overlayTimestamp !== undefined ? Boolean(status.overlayTimestamp) : true,
    batteryPercent: typeof status?.batteryPercent === 'number' ? status.batteryPercent : -1,
    charging: Boolean(status?.charging),
    temperatureC: Number(status?.temperatureC) || 0,
    authRequired: Boolean(ping?.authRequired),
    authNeedsCredentials: Boolean(ping?.authRequired && !status),
  };

  const source = buildRobosIpCameraSource({
    host: parsed.host,
    port: parsed.port,
    baseUrl: parsed.baseUrl,
    name: mergedStatus.name,
    username,
    password,
    status: mergedStatus,
  });

  return { ok: true, status: mergedStatus, source };
}

async function controlRobosIpCamera(videoConfig = {}, commandPayload = {}) {
  const parsed = parseRobosBaseUrl(videoConfig.baseUrl || videoConfig.streamUrl || videoConfig.host, videoConfig.port || 8080);
  if (!parsed) return { ok: false, error: 'Missing RobOS IP Camera host/URL' };
  const res = await httpJsonRequest(`${parsed.baseUrl}/api/control`, {
    method: 'POST',
    bodyObj: commandPayload || {},
    username: videoConfig.username || '',
    password: videoConfig.password || '',
    timeoutMs: 1800,
  });
  if (!res?.ok) {
    return { ok: false, error: `Camera control request failed at ${parsed.baseUrl}` };
  }
  const refreshed = await probeRobosIpCameraStatus(parsed.baseUrl, {
    port: parsed.port,
    username: videoConfig.username || '',
    password: videoConfig.password || '',
    timeoutMs: 1100,
  });
  return { ok: true, status: refreshed.status || null, source: refreshed.source || null };
}

function getLocalLanPrefixes() {
  const ifaces = os.networkInterfaces() || {};
  const prefixes = [];
  for (const [ifName, addrs] of Object.entries(ifaces)) {
    if (/^(lo|docker|br-|veth|virbr|tailscale|tun|tap|wg)/i.test(ifName)) continue;
    for (const a of (addrs || [])) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const parts = String(a.address || '').split('.');
      if (parts.length === 4 && (parts[0] === '192' || parts[0] === '10' || parts[0] === '172')) {
        const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
        if (!prefixes.includes(prefix)) prefixes.push({ prefix, selfIp: a.address });
      }
    }
  }
  return prefixes;
}

/**
 * Fast bounded `/api/ping` LAN sweep on `:8080` so RobOS IP Cameras are discovered even
 * on Wi-Fi routers with multicast isolation. Completes a `/24` subnet in ~450 ms.
 */
async function discoverRobosIpCamerasOnSubnet({ port = 8080, timeoutMs = 550 } = {}) {
  const subnets = getLocalLanPrefixes().slice(0, 2);
  if (!subnets.length) return [];

  const targets = [];
  for (const { prefix, selfIp } of subnets) {
    for (let hostOctet = 2; hostOctet <= 254; hostOctet++) {
      const ip = `${prefix}.${hostOctet}`;
      if (ip !== selfIp) targets.push(ip);
    }
  }

  const hits = [];
  const concurrency = 64;
  let cursor = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const ip = targets[cursor++];
      const ping = await httpJsonRequest(`http://${ip}:${port}/api/ping`, { timeoutMs });
      if (ping && ping.app === 'robos-ip-camera') {
        const probed = await probeRobosIpCameraStatus(ip, { port, timeoutMs: 800 });
        if (probed?.ok && probed.source) {
          hits.push({ ...probed.source, origin: 'robos-lan-sweep' });
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  return hits;
}

function getCameraWatchConfigPath() {
  if (process.env.ROBOS_CAMERA_WATCH_CONFIG) return process.env.ROBOS_CAMERA_WATCH_CONFIG;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.config', 'robos', 'camera-watch', 'cameras.json');
}

/**
 * Read cameras configured in RobOS Camera Watch (`~/.config/robos/camera-watch/cameras.json`),
 * automatically recognizing RobOS IP Camera (`:8080/video`, `manufacturer: "RobOS"`) and defaulting to HD `/video`.
 */
function readCameraWatchSavedSources(configPath = getCameraWatchConfigPath()) {
  try {
    if (!fs.existsSync(configPath)) return [];
    const doc = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const cameras = Array.isArray(doc?.cameras) ? doc.cameras : [];
    const out = [];

    for (const cam of cameras) {
      if (cam.enabled === false) continue;
      if (cam.kind === 'device') {
        const fmt = cam.device?.format || '';
        if (process.platform === 'linux' && fmt && fmt !== 'v4l2') continue;
        const devName = cam.device?.name || '';
        if (!devName) continue;
        if (process.platform === 'linux' && !fs.existsSync(devName)) continue;
        out.push({
          id: `cw:${cam.id}`,
          sourceType: 'v4l2',
          protocol: 'v4l2',
          label: `${cam.name || 'Webcam'} (${devName})`,
          shortName: cam.name || 'Webcam',
          streamUrl: '',
          snapshotUrl: '',
          devicePath: devName,
          username: '',
          password: '',
          isRobosAndroidCam: false,
          qualityPreset: DEFAULT_VIDEO_QUALITY,
          fps: 30,
          origin: 'camera-watch',
        });
        continue;
      }

      let streamUrl = String(cam.streamUrl || '').trim();
      let snapshotUrl = String(cam.snapshotUrl || '').trim();
      if (!streamUrl && cam.onvif?.hostname) {
        const port = Number(cam.onvif.port) || 8080;
        streamUrl = `http://${cam.onvif.hostname}:${port}/video`;
        if (!snapshotUrl) snapshotUrl = `http://${cam.onvif.hostname}:${port}/snapshot.jpg`;
      }
      if (!streamUrl) continue;

      const isRtsp = /^rtsps?:/i.test(streamUrl);
      const isRobosAndroid = Boolean(
        cam.onvif?.manufacturer === 'RobOS' ||
        /:8080\/(video|sub)\b/i.test(streamUrl)
      );

      if (isRobosAndroid) {
        // Always upgrade RobOS IP Camera saved sources to HD `/video` by default
        const parsed = parseRobosBaseUrl(streamUrl, cam.onvif?.port || 8080);
        out.push(buildRobosIpCameraSource({
          id: `cw:${cam.id}`,
          host: parsed?.host || cam.onvif?.hostname || '',
          port: parsed?.port || Number(cam.onvif?.port) || 8080,
          baseUrl: parsed?.baseUrl || '',
          name: cam.name || 'RobOS IP Camera',
          username: cam.username || '',
          password: cam.password || '',
          qualityPreset: DEFAULT_VIDEO_QUALITY,
          origin: 'camera-watch',
        }));
        continue;
      }

      let hostHint = '';
      try { hostHint = new URL(streamUrl).host; } catch {}
      const badge = isRtsp ? 'RTSP IP Cam' : 'HTTP MJPEG Cam';

      out.push({
        id: `cw:${cam.id}`,
        sourceType: 'ip-camera',
        protocol: isRtsp ? 'rtsp' : 'mjpeg',
        label: `${cam.name || 'IP Camera'} (${badge}${hostHint ? ` · ${hostHint}` : ''})`,
        shortName: cam.name || 'IP Camera',
        streamUrl,
        snapshotUrl,
        devicePath: '',
        username: cam.username || '',
        password: cam.password || '',
        rtspTransport: cam.rtspTransport || 'tcp',
        isRobosAndroidCam: false,
        qualityPreset: DEFAULT_VIDEO_QUALITY,
        fps: 30,
        origin: 'camera-watch',
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * List local Linux V4L2 video capture devices (`/dev/video*`), filtering out
 * secondary V4L2 metadata sub-nodes (`index > 0`).
 */
function listLocalV4l2VideoDevices(devDir = '/dev', sysDir = '/sys/class/video4linux') {
  if (process.platform !== 'linux') return [];
  let nodes = [];
  try {
    nodes = fs.readdirSync(devDir).filter(n => /^video\d+$/.test(n));
  } catch {
    return [];
  }

  return nodes
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .filter(n => {
      try {
        const idxFile = path.join(sysDir, n, 'index');
        if (fs.existsSync(idxFile)) {
          const idx = fs.readFileSync(idxFile, 'utf8').trim();
          return idx === '0';
        }
      } catch {}
      return true;
    })
    .map(n => {
      const devPath = path.posix.join(devDir, n);
      let rawName = n;
      try {
        rawName = fs.readFileSync(path.join(sysDir, n, 'name'), 'utf8').trim() || n;
      } catch {}
      const parts = rawName.split(':').map(s => s.trim()).filter(Boolean);
      const cleanName = (parts.length >= 2 && parts[0].toLowerCase().startsWith(parts[1].toLowerCase().slice(0, 8)))
        ? parts[0]
        : rawName;
      return {
        id: `v4l2:${devPath}`,
        sourceType: 'v4l2',
        protocol: 'v4l2',
        label: `${cleanName} (${devPath})`,
        shortName: cleanName,
        streamUrl: '',
        snapshotUrl: '',
        devicePath: devPath,
        username: '',
        password: '',
        isRobosAndroidCam: false,
        qualityPreset: DEFAULT_VIDEO_QUALITY,
        fps: 30,
        origin: 'local-v4l2',
      };
    });
}

function extractXmlTagText(xml, tagLocalName) {
  const re = new RegExp(`<(?:\\w+:)?${tagLocalName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagLocalName}>`, 'i');
  const m = re.exec(String(xml || ''));
  return m ? m[1].trim() : '';
}

function extractOnvifScope(scopes, key) {
  const re = new RegExp(`onvif:\\/\\/www\\.onvif\\.org\\/${key}\\/([^\\s<"]+)`, 'i');
  const m = re.exec(String(scopes || ''));
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch {
    return m[1];
  }
}

/**
 * Lightweight zero-dependency UDP WS-Discovery probe (`239.255.255.250:3702`)
 * to discover RobOS IP Camera and ONVIF cameras on the LAN.
 */
function discoverOnvifLanCameras({ timeoutMs = 1200 } = {}) {
  return new Promise((resolve) => {
    const found = new Map();
    let sock = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try { sock?.close(); } catch {}
      resolve(Array.from(found.values()));
    };

    try {
      sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }

    const msgId = `urn:uuid:${crypto.randomUUID()}`;
    const probeXml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" ' +
      'xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" ' +
      'xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" ' +
      'xmlns:dn="http://www.onvif.org/ver10/network/wsdl">' +
      `<e:Header><w:MessageID>${msgId}</w:MessageID>` +
      '<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>' +
      '<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>' +
      '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>';

    sock.on('error', () => finish());
    sock.on('message', (msg, rinfo) => {
      try {
        const xml = msg.toString('utf8');
        const xaddrsRaw = extractXmlTagText(xml, 'XAddrs');
        const scopesRaw = extractXmlTagText(xml, 'Scopes');
        const xaddrs = xaddrsRaw.split(/\s+/).filter(Boolean);
        let parsedUrl = null;
        for (const x of xaddrs) {
          try {
            const u = new URL(x);
            if (u.hostname === rinfo?.address || !parsedUrl) parsedUrl = u;
          } catch {}
        }
        const host = parsedUrl?.hostname || rinfo?.address;
        if (!host) return;
        const port = Number(parsedUrl?.port) || 8080;
        const key = `${host}:${port}`;
        if (found.has(key)) return;

        const name = extractOnvifScope(scopesRaw, 'name') || extractOnvifScope(scopesRaw, 'hardware') || `ONVIF Camera ${host}`;
        const isRobos = /robos/i.test(scopesRaw) || /robos/i.test(xml) || port === 8080;

        if (isRobos) {
          found.set(key, buildRobosIpCameraSource({
            id: `onvif:${host}:${port}`,
            host,
            port,
            name,
            qualityPreset: DEFAULT_VIDEO_QUALITY,
            origin: 'onvif-lan',
          }));
        } else {
          found.set(key, {
            id: `onvif:${host}:${port}`,
            sourceType: 'ip-camera',
            protocol: 'mjpeg',
            label: `${name} (ONVIF LAN · ${host}:${port})`,
            shortName: name,
            streamUrl: `http://${host}:${port}/video`,
            snapshotUrl: `http://${host}:${port}/snapshot.jpg`,
            devicePath: '',
            username: '',
            password: '',
            isRobosAndroidCam: false,
            qualityPreset: DEFAULT_VIDEO_QUALITY,
            fps: 30,
            origin: 'onvif-lan',
          });
        }
      } catch {}
    });

    try {
      sock.bind(0, () => {
        try {
          const buf = Buffer.from(probeXml, 'utf8');
          sock.send(buf, 0, buf.length, 3702, '239.255.255.250');
        } catch {}
      });
    } catch {
      finish();
      return;
    }

    setTimeout(finish, Math.max(250, Math.min(5000, Number(timeoutMs) || 1200)));
  });
}

/**
 * Discover all available video input sources (RobOS IP Cameras + Camera Watch + ONVIF LAN + local V4L2),
 * enriching RobOS IP Cameras with live `/api/status` HD resolution & battery telemetry.
 */
async function discoverAllVideoSources({ scanLan = true, includeSubnetSweep = false, timeoutMs = 950 } = {}) {
  const isTest = process.env.ROBOS_TEST === '1';
  const saved = readCameraWatchSavedSources();
  const local = listLocalV4l2VideoDevices();
  const lan = (scanLan && !isTest) ? await discoverOnvifLanCameras({ timeoutMs }) : [];

  let candidates = [...saved, ...lan, ...local];
  const hasRobosAlready = candidates.some(c => c.isRobosAndroidCam || c.sourceType === 'robos-ip-camera');

  if (!isTest && (includeSubnetSweep || (scanLan && !hasRobosAlready))) {
    const swept = await discoverRobosIpCamerasOnSubnet({ timeoutMs: 500 });
    candidates = [...swept, ...candidates];
  }

  const seenStreams = new Set();
  const seenDevs = new Set();
  const merged = [];

  for (const item of candidates) {
    if (item.devicePath) {
      if (seenDevs.has(item.devicePath)) continue;
      seenDevs.add(item.devicePath);
    } else if (item.streamUrl) {
      const normKey = (item.baseUrl || item.streamUrl).replace(/\/(video|sub)\b.*$/i, '').replace(/\/+$/, '').toLowerCase();
      if (seenStreams.has(normKey)) continue;
      seenStreams.add(normKey);
    }
    merged.push(item);
  }

  // Enrich RobOS IP Cameras with live /api/status telemetry in parallel
  if (!isTest) {
    await Promise.all(merged.map(async (item, idx) => {
      if (!item.isRobosAndroidCam && item.sourceType !== 'robos-ip-camera') return;
      const probed = await probeRobosIpCameraStatus(item.baseUrl || item.streamUrl || item.host, {
        port: item.port || 8080,
        username: item.username || '',
        password: item.password || '',
        timeoutMs: 750,
      });
      if (probed?.ok && probed.source) {
        merged[idx] = {
          ...probed.source,
          id: item.id,
          origin: item.origin,
          username: item.username || '',
          password: item.password || '',
          qualityPreset: item.qualityPreset || DEFAULT_VIDEO_QUALITY,
        };
      }
    }));
  }

  // Sort RobOS IP Cameras first so they appear at the top of Video Inputs
  merged.sort((a, b) => {
    const aRobos = (a.sourceType === 'robos-ip-camera' || a.isRobosAndroidCam) ? 0 : 1;
    const bRobos = (b.sourceType === 'robos-ip-camera' || b.isRobosAndroidCam) ? 0 : 1;
    return aRobos - bRobos;
  });

  return merged;
}

// ─── V4L2 HD Format Negotiation & FFmpeg Input Builder ──────────────────────

const v4l2FormatCache = new Map();

function negotiateV4l2CaptureFormat(devPath, targetWidth = 1920, targetHeight = 1080) {
  const cacheKey = `${devPath}:${targetWidth}x${targetHeight}`;
  if (v4l2FormatCache.has(cacheKey)) return v4l2FormatCache.get(cacheKey);

  let rawOut = '';
  try {
    // Note: FFmpeg 7+ exits with code 0 on `-list_formats all` while printing formats to stderr!
    const r = spawnSync('ffmpeg', ['-hide_banner', '-f', 'v4l2', '-list_formats', 'all', '-i', devPath], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    rawOut = `${r?.stderr || ''}\n${r?.stdout || ''}`;
  } catch (err) {
    rawOut = String(err?.stderr || err?.stdout || '');
  }

  const pickBestSize = (lineText) => {
    const matches = [...String(lineText || '').matchAll(/\b(\d{3,4})x(\d{3,4})\b/g)];
    if (!matches.length) return null;
    const parsed = matches.map(m => ({ w: Number(m[1]), h: Number(m[2]) }));
    const fitting = parsed
      .filter(s => s.w <= targetWidth && s.h <= targetHeight)
      .sort((a, b) => (b.w * b.h) - (a.w * a.h));
    if (fitting.length) return `${fitting[0].w}x${fitting[0].h}`;
    parsed.sort((a, b) => (a.w * a.h) - (b.w * b.h));
    return `${parsed[0].w}x${parsed[0].h}`;
  };

  const lines = rawOut.split('\n');
  const mjpegLine = lines.find(l => /\bmjpeg\b/i.test(l));
  if (mjpegLine) {
    const size = pickBestSize(mjpegLine);
    const res = { inputFormat: 'mjpeg', videoSize: size || '1920x1080' };
    v4l2FormatCache.set(cacheKey, res);
    return res;
  }

  const yuyvLine = lines.find(l => /\byuyv/i.test(l));
  if (yuyvLine) {
    const size = pickBestSize(yuyvLine);
    const res = { inputFormat: '', videoSize: size || '' };
    v4l2FormatCache.set(cacheKey, res);
    return res;
  }

  // Do NOT poison `v4l2FormatCache` if the device was momentarily busy (`EBUSY`)
  return { inputFormat: '', videoSize: '' };
}

function buildFfmpegVideoInputArgs(videoConfig = {}) {
  const spec = getVideoQualitySpec(videoConfig.qualityPreset || DEFAULT_VIDEO_QUALITY);
  const srcType = videoConfig.sourceType || (videoConfig.devicePath ? 'v4l2' : 'ip-camera');

  if (srcType === 'v4l2' || videoConfig.devicePath) {
    const dev = videoConfig.devicePath || '/dev/video0';
    const neg = negotiateV4l2CaptureFormat(dev, spec.width, spec.height);
    const args = ['-use_wallclock_as_timestamps', '1', '-f', 'v4l2'];
    if (neg.inputFormat) args.push('-input_format', neg.inputFormat);
    if (neg.videoSize) args.push('-video_size', neg.videoSize);
    args.push('-framerate', String(Number(videoConfig.fps) || spec.fps || 30), '-i', dev);
    return args;
  }

  const isRobos = Boolean(videoConfig.isRobosAndroidCam || srcType === 'robos-ip-camera');
  const rawStream = isRobos
    ? withRobosCleanStreamParam(resolveRobosStreamUrlForQuality(videoConfig.streamUrl, spec.id))
    : videoConfig.streamUrl;
  const authedUrl = withVideoCredentials(rawStream, videoConfig.username, videoConfig.password);

  if (/^rtsps?:/i.test(authedUrl)) {
    return ['-rtsp_transport', videoConfig.rtspTransport || 'tcp', '-use_wallclock_as_timestamps', '1', '-i', authedUrl];
  }
  return ['-probesize', '65536', '-analyzeduration', '250000', '-use_wallclock_as_timestamps', '1', '-f', 'mpjpeg', '-i', authedUrl];
}

function fetchHttpBytes(targetUrl, { username = '', password = '', timeoutMs = 3500 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      reject(err);
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const headers = {};
    const user = username || (parsed.username ? decodeURIComponent(parsed.username) : '');
    const pass = password || (parsed.password ? decodeURIComponent(parsed.password) : '');
    if (user) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }

    const req = mod.get({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      headers,
      timeout: timeoutMs,
      rejectUnauthorized: false,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} from camera snapshot`));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', chunk => {
        total += chunk.length;
        if (total <= 8 * 1024 * 1024) chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => {
      req.destroy(new Error('Camera snapshot timed out'));
    });
    req.on('error', reject);
  });
}

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

/**
 * Parse back-to-back MJPEG (`image2pipe`) frames from a Node readable stream (`proc.stdout`).
 */
function extractMjpegFramesFromStream(readable, onJpegBuffer) {
  if (!readable || typeof onJpegBuffer !== 'function') return;
  let accum = Buffer.alloc(0);
  let frameIndex = 0;

  readable.on('data', (chunk) => {
    if (!chunk || !chunk.length) return;
    accum = accum.length ? Buffer.concat([accum, chunk]) : chunk;
    if (accum.length > 4 * 1024 * 1024) {
      accum = accum.subarray(accum.length - 1024 * 1024);
    }
    while (true) {
      const soi = accum.indexOf(JPEG_SOI);
      if (soi < 0) {
        accum = Buffer.alloc(0);
        break;
      }
      const eoi = accum.indexOf(JPEG_EOI, soi + 2);
      if (eoi < 0) {
        if (soi > 0) accum = accum.subarray(soi);
        break;
      }
      const jpg = Buffer.from(accum.subarray(soi, eoi + 2));
      accum = accum.subarray(eoi + 2);
      frameIndex++;
      onJpegBuffer(jpg, frameIndex);
    }
  });
}

// Track any in-flight V4L2 one-shot snapshot processes so concurrent requests deduplicate
// and `daw:record-start` can cleanly abort & await them before opening `/dev/videoX`!
const activeV4l2SnapshotJobs = new Map(); // devPath -> { proc, promise, abortResolve }

async function abortInFlightV4l2Snapshots(targetDevicePath = '') {
  const entries = [...activeV4l2SnapshotJobs.entries()];
  const waits = [];
  for (const [devPath, job] of entries) {
    if (targetDevicePath && devPath !== targetDevicePath) continue;
    try { job.proc?.kill('SIGINT'); } catch {}
    try { job.proc?.kill('SIGKILL'); } catch {}
    if (job.donePromise) waits.push(job.donePromise.catch(() => {}));
  }
  if (waits.length) await Promise.all(waits);
}

function grabSingleFrameWithFfmpeg(inputArgsList, timeoutMs = 5500, { isV4l2 = false, devicePath = '' } = {}) {
  if (isV4l2 && devicePath && activeV4l2SnapshotJobs.has(devicePath)) {
    const existing = activeV4l2SnapshotJobs.get(devicePath);
    if (existing?.userPromise) return existing.userPromise;
  }

  // UVC USB cameras (e.g. OBSBOT Tiny 2 Lite) often emit 1-2 dark/black sensor-warmup frames
  // (`~6 KB`) in the first 60ms of `VIDIOC_STREAMON` before auto-exposure settles (`25-35 KB`).
  // Capturing up to 5 frames on V4L2 (+100ms at 30fps) guarantees a bright, lit preview frame!
  const frameCount = isV4l2 ? '5' : '1';
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    ...inputArgsList,
    '-frames:v', frameCount,
    '-vf', "scale='min(1280,iw)':-2",
    '-q:v', '4',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    'pipe:1',
  ];

  let doneResolve = null;
  const donePromise = new Promise(r => { doneResolve = r; });
  const jobEntry = { proc: null, donePromise, userPromise: null };

  const userPromise = new Promise((resolve, reject) => {
    let proc = null;
    let killTimer = null;
    let stderrTail = '';
    const frames = [];
    let settled = false;

    const finish = (err, bestBuf) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (devicePath) activeV4l2SnapshotJobs.delete(devicePath);
      if (doneResolve) doneResolve();
      if (err || !bestBuf || bestBuf.length < 64) {
        const msg = String(stderrTail || err?.message || 'Could not capture preview frame').trim().split('\n').pop();
        reject(new Error(msg || 'Could not capture preview frame'));
      } else {
        resolve(bestBuf);
      }
    };

    try {
      proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      jobEntry.proc = proc;
    } catch (err) {
      finish(err, null);
      return;
    }

    killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      if (frames.length > 0) {
        finish(null, frames[frames.length - 1]);
      } else {
        finish(new Error('Camera preview timed out'), null);
      }
    }, timeoutMs);

    extractMjpegFramesFromStream(proc.stdout, (jpg) => {
      frames.push(jpg);
    });
    proc.stderr?.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-600);
    });
    proc.on('error', (err) => finish(err, frames[frames.length - 1] || null));
    proc.on('close', () => {
      // Pick the latest well-exposed JPEG frame (preferring frames > 8KB over tiny black warmup frames)
      let chosen = null;
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].length >= 8000) {
          chosen = frames[i];
          break;
        }
      }
      if (!chosen && frames.length > 0) chosen = frames[frames.length - 1];
      finish(chosen ? null : new Error(stderrTail || 'No video frame decoded'), chosen);
    });
  });

  jobEntry.userPromise = userPromise;
  if (isV4l2 && devicePath && jobEntry.proc) {
    activeV4l2SnapshotJobs.set(devicePath, jobEntry);
  }
  return userPromise;
}

/**
 * Grab a single HD JPEG preview frame (`data:image/jpeg;base64,...`) from any configured video source.
 */
async function captureVideoSourceSnapshot(videoConfig = {}) {
  if (videoConfig.snapshotUrl && /^https?:/i.test(videoConfig.snapshotUrl)) {
    try {
      const jpg = await fetchHttpBytes(videoConfig.snapshotUrl, {
        username: videoConfig.username,
        password: videoConfig.password,
        timeoutMs: 2800,
      });
      if (jpg && jpg.length > 64) {
        return { ok: true, dataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}` };
      }
    } catch {}
  }

  if (videoConfig.streamUrl && /^https?:/i.test(videoConfig.streamUrl) && /\/(video|sub)\b/i.test(videoConfig.streamUrl)) {
    const derivedSnap = videoConfig.streamUrl.replace(/\/(video|sub)(\?.*)?$/i, '/snapshot.jpg$2');
    try {
      const jpg = await fetchHttpBytes(derivedSnap, {
        username: videoConfig.username,
        password: videoConfig.password,
        timeoutMs: 2800,
      });
      if (jpg && jpg.length > 64) {
        return { ok: true, dataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}` };
      }
    } catch {}
  }

  const isV4l2 = Boolean(videoConfig.sourceType === 'v4l2' || videoConfig.devicePath);
  const jpg = await grabSingleFrameWithFfmpeg(buildFfmpegVideoInputArgs(videoConfig), 5500, {
    isV4l2,
    devicePath: videoConfig.devicePath || '',
  });
  return { ok: true, dataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}` };
}

/**
 * Construct a DAW Studio Video Track (`trackKind === 'video'`) defaulting to HD quality (`hd-1080p`)
 * and optional audio (`audioMode: 'none' | 'interface' | 'stream'`).
 */
function buildVideoTrack({
  name,
  videoConfig = {},
  qualityPreset = DEFAULT_VIDEO_QUALITY,
  audioMode = 'none',
  inputNodeName = '',
  inputLabel = '',
  armed = true,
} = {}) {
  const cleanAudioMode = ['none', 'interface', 'stream'].includes(audioMode) ? audioMode : 'none';
  const spec = getVideoQualitySpec(qualityPreset || videoConfig.qualityPreset || DEFAULT_VIDEO_QUALITY);
  const isRobos = Boolean(
    videoConfig.isRobosAndroidCam ||
    videoConfig.sourceType === 'robos-ip-camera' ||
    /:8080\/(video|sub)\b/i.test(videoConfig.streamUrl || '')
  );

  const camName = videoConfig.shortName || videoConfig.label || (isRobos ? 'RobOS IP Camera' : 'Camera');
  const trackName = String(name || camName).trim() || 'Video Cam 1';
  const rawStream = isRobos
    ? resolveRobosStreamUrlForQuality(videoConfig.streamUrl, spec.id)
    : String(videoConfig.streamUrl || '').trim();
  const parsedRobos = isRobos ? parseRobosBaseUrl(videoConfig.baseUrl || rawStream || videoConfig.host, videoConfig.port || 8080) : null;

  let subtitle = `${camName} (${spec.shortLabel}) · Video Only`;
  if (cleanAudioMode === 'interface') {
    subtitle = `${camName} (${spec.shortLabel}) + ${inputLabel || 'Audio Input'}`;
  } else if (cleanAudioMode === 'stream') {
    subtitle = `${camName} (${spec.shortLabel}) + Stream Audio`;
  }

  return {
    id: makeVideoId('trk'),
    trackKind: 'video',
    profileId: isRobos ? 'robos-ip-camera' : 'video-cam',
    name: trackName,
    shortLabel: trackName.slice(0, 12),
    category: 'video',
    color: '#a855f7',
    image: 'assets/icons/daw-crest.webp',
    inputNodeName: cleanAudioMode === 'interface' ? (inputNodeName || '') : '',
    inputLabel: subtitle,
    armed: Boolean(armed),
    monitor: false,
    muted: false,
    soloed: false,
    gainDb: 0,
    volume: 1.0,
    pan: 0,
    videoConfig: {
      sourceId: videoConfig.id || videoConfig.sourceId || '',
      sourceType: isRobos ? 'robos-ip-camera' : (videoConfig.sourceType || (videoConfig.devicePath ? 'v4l2' : 'ip-camera')),
      protocol: videoConfig.protocol || (videoConfig.devicePath ? 'v4l2' : (/^rtsps?:/i.test(rawStream) ? 'rtsp' : 'mjpeg')),
      label: videoConfig.label || camName,
      shortName: camName,
      host: parsedRobos?.host || videoConfig.host || '',
      port: parsedRobos?.port || Number(videoConfig.port) || (isRobos ? 8080 : 0),
      baseUrl: parsedRobos?.baseUrl || videoConfig.baseUrl || '',
      streamUrl: rawStream,
      snapshotUrl: String(videoConfig.snapshotUrl || (parsedRobos ? `${parsedRobos.baseUrl}/snapshot.jpg` : '')).trim(),
      devicePath: String(videoConfig.devicePath || '').trim(),
      username: String(videoConfig.username || ''),
      password: String(videoConfig.password || ''),
      rtspTransport: videoConfig.rtspTransport || 'tcp',
      isRobosAndroidCam: isRobos,
      qualityPreset: spec.id,
      targetWidth: spec.width,
      targetHeight: spec.height,
      crf: spec.crf,
      audioMode: cleanAudioMode,
      fps: Number(videoConfig.fps) || spec.fps || 30,
    },
    fx: {
      openSourcePlugins: ['x42 Parametric EQ4 (LV2)', 'Calf Bus Glue (LV2)'],
      phaseInvert: false,
      gate: { enabled: false, thresholdDb: -55 },
      eq: { enabled: false, hpfHz: 40, lowFreqHz: 100, lowGainDb: 0, midFreqHz: 800, midGainDb: 0, midQ: 1.2, presenceFreqHz: 2000, presenceGainDb: 0, highFreqHz: 6000, highGainDb: 0 },
      compressor: { enabled: false, thresholdDb: -18, ratio: 2.5, attackMs: 12, releaseMs: 120, makeupDb: 0 },
      drive: { enabled: false, amount: 0 },
      reverb: { enabled: false, type: 'room', mix: 0 },
      airExciter: { enabled: false, mix: 0 },
    },
    soundReplacement: {
      supported: false,
      enabled: false,
      kitId: 'gm-rock-kit',
      pieceId: 'snare',
      blend: 0,
      thresholdDb: -28,
      minIntervalMs: 75,
    },
    clips: [],
  };
}

function probeVideoFileInfo(filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration',
      '-of', 'json',
      filePath,
    ], { timeout: 12000 }, (err, stdout) => {
      if (err) {
        resolve({ durationSec: 0, width: 0, height: 0, hasAudio: false, hasVideo: false });
        return;
      }
      try {
        const parsed = JSON.parse(stdout || '{}');
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const vStream = streams.find(s => s.codec_type === 'video');
        const aStream = streams.find(s => s.codec_type === 'audio');
        resolve({
          durationSec: Number(parsed.format?.duration) || 0,
          width: Number(vStream?.width) || 0,
          height: Number(vStream?.height) || 0,
          hasAudio: Boolean(aStream),
          hasVideo: Boolean(vStream),
        });
      } catch {
        resolve({ durationSec: 0, width: 0, height: 0, hasAudio: false, hasVideo: false });
      }
    });
  });
}

const inFlightFilmstrips = new Map();
let activeFilmstripWorkers = 0;
const filmstripWorkerQueue = [];

function acquireFilmstripSlot() {
  if (activeFilmstripWorkers < 2) {
    activeFilmstripWorkers++;
    return Promise.resolve();
  }
  return new Promise(resolve => filmstripWorkerQueue.push(resolve));
}

function releaseFilmstripSlot() {
  const next = filmstripWorkerQueue.shift();
  if (next) next();
  else activeFilmstripWorkers = Math.max(0, activeFilmstripWorkers - 1);
}

function getDefaultFilmstripCacheDir() {
  return process.env.ROBOS_DAW_THUMBCACHE_DIR
    || path.join(os.homedir(), '.cache', 'robos', 'daw-studio', 'filmstrips');
}

async function runFfmpegFilmstrip(args, timeoutMs = 30000) {
  await acquireFilmstripSlot();
  try {
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || 'FFmpeg filmstrip extraction failed').trim()));
          return;
        }
        resolve();
      });
    });
  } finally {
    releaseFilmstripSlot();
  }
}

/**
 * Generates (and caches on disk) a horizontal JPEG filmstrip sprite sheet (`tileCount x 1`)
 * for NLE timeline video thumbnail rendering.
 */
async function generateVideoFilmstripSprite(videoFile, {
  maxTiles = 40,
  tileWidth = 160,
  tileHeight = 90,
  cacheDir = null,
} = {}) {
  const absVideo = videoFile ? path.resolve(String(videoFile)) : '';
  if (!absVideo || !fs.existsSync(absVideo)) {
    return { ok: false, error: 'Video file not found on disk.' };
  }
  let stat;
  try {
    stat = fs.statSync(absVideo);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!stat.size || stat.size < 256) {
    return { ok: false, error: 'Video file is empty.' };
  }

  const tw = Math.max(64, Math.min(320, Math.round(Number(tileWidth) || 160)));
  const th = Math.max(36, Math.min(180, Math.round(Number(tileHeight) || 90)));
  const capTiles = Math.max(4, Math.min(64, Math.round(Number(maxTiles) || 40)));
  const dir = cacheDir || getDefaultFilmstripCacheDir();
  fs.mkdirSync(dir, { recursive: true });

  const cacheHash = crypto
    .createHash('sha1')
    .update(`v1:${absVideo}:${stat.size}:${Math.round(stat.mtimeMs)}:${tw}x${th}:${capTiles}`)
    .digest('hex')
    .slice(0, 24);
  const spriteFile = path.join(dir, `${cacheHash}.jpg`);
  const metaFile = path.join(dir, `${cacheHash}.json`);

  if (fs.existsSync(spriteFile) && fs.existsSync(metaFile)) {
    try {
      const sStat = fs.statSync(spriteFile);
      if (sStat.size > 256) {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        if (meta && Number(meta.tileCount) >= 1) {
          return {
            ok: true,
            spriteFile,
            tileCount: Number(meta.tileCount),
            tileWidth: Number(meta.tileWidth) || tw,
            tileHeight: Number(meta.tileHeight) || th,
            sourceDurationSec: Number(meta.sourceDurationSec) || 1,
            cached: true,
          };
        }
      }
    } catch {}
  }

  if (inFlightFilmstrips.has(cacheHash)) {
    return inFlightFilmstrips.get(cacheHash);
  }

  const jobPromise = (async () => {
    try {
      const probe = await probeVideoFileInfo(absVideo);
      if (!probe.hasVideo) {
        return { ok: false, error: 'Media file does not contain a video stream.' };
      }
      const vidDur = Math.max(0.25, Number(probe.durationSec) || 2.0);
      const tileCount = vidDur <= 2.5
        ? Math.max(4, Math.min(capTiles, Math.ceil(vidDur * 4)))
        : Math.max(8, Math.min(capTiles, Math.ceil(vidDur / 2.2)));
      const fpsExpr = (tileCount / vidDur).toFixed(6);
      const vf = `fps=${fpsExpr}:round=near,scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},tile=${tileCount}x1`;
      const tmpOut = path.join(dir, `${cacheHash}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.jpg`);

      try {
        const buildArgs = (nokey) => [
          '-nostdin',
          '-y',
          '-v', 'error',
          ...(nokey ? ['-skip_frame', 'nokey'] : []),
          '-i', absVideo,
          '-vf', vf,
          '-frames:v', '1',
          '-q:v', '5',
          tmpOut,
        ];
        if (vidDur > 22) {
          try {
            await runFfmpegFilmstrip(buildArgs(true));
          } catch {
            await runFfmpegFilmstrip(buildArgs(false));
          }
        } else {
          await runFfmpegFilmstrip(buildArgs(false));
        }

        if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 256) {
          await runFfmpegFilmstrip(buildArgs(false));
        }

        fs.renameSync(tmpOut, spriteFile);
        const meta = {
          tileCount,
          tileWidth: tw,
          tileHeight: th,
          sourceDurationSec: Number(vidDur.toFixed(4)),
        };
        fs.writeFileSync(metaFile, JSON.stringify(meta));
        return {
          ok: true,
          spriteFile,
          ...meta,
          cached: false,
        };
      } finally {
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
      }
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      inFlightFilmstrips.delete(cacheHash);
    }
  })();

  inFlightFilmstrips.set(cacheHash, jobPromise);
  return jobPromise;
}

function remuxFaststartMp4(rawFile, finalFile) {
  return new Promise((resolve) => {
    execFile('ffmpeg', [
      '-nostdin', '-y', '-v', 'error',
      '-i', rawFile,
      '-c', 'copy',
      '-movflags', '+faststart',
      finalFile,
    ], { timeout: 25000 }, (err) => {
      if (err || !fs.existsSync(finalFile) || fs.statSync(finalFile).size < 256) {
        try {
          if (fs.existsSync(rawFile) && rawFile !== finalFile) {
            fs.copyFileSync(rawFile, finalFile);
          }
        } catch {}
      } else if (rawFile !== finalFile) {
        try { fs.unlinkSync(rawFile); } catch {}
      }
      resolve(fs.existsSync(finalFile));
    });
  });
}

function synthesizeTestPatternMp4(destMp4, durationSec = 2.5, withAudio = false, { width = 1280, height = 720, crf = 20 } = {}) {
  return new Promise((resolve, reject) => {
    const dur = Math.max(0.5, Math.min(60, Number(durationSec) || 2.5));
    const safeW = Math.max(320, Math.min(1920, Math.floor((Number(width) || 1280) / 2) * 2));
    const safeH = Math.max(180, Math.min(1080, Math.floor((Number(height) || 720) / 2) * 2));
    const args = [
      '-nostdin', '-y', '-v', 'error',
      '-f', 'lavfi', '-i', `testsrc=size=${safeW}x${safeH}:rate=30:duration=${dur.toFixed(3)}`,
    ];
    if (withAudio) {
      args.push('-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=48000:duration=${dur.toFixed(3)}`);
    }
    args.push(
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf), '-pix_fmt', 'yuv420p',
      ...(withAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']),
      '-movflags', '+faststart',
      destMp4
    );
    execFile('ffmpeg', args, { timeout: 25000 }, (err) => {
      if (err) reject(err);
      else resolve(destMp4);
    });
  });
}

function videoConfigsMatchSource(a = {}, b = {}) {
  if (!a || !b) return false;
  if (a.devicePath && b.devicePath) return String(a.devicePath) === String(b.devicePath);
  if (a.streamUrl && b.streamUrl) return String(a.streamUrl) === String(b.streamUrl);
  return false;
}

/**
 * Persistent Live Camera Preview Streamer (`ffmpeg` -> 15 fps MJPEG `image2pipe`)
 *
 * Keeps V4L2 USB webcams (e.g. OBSBOT Tiny 2 Lite) and RTSP cameras open in a single
 * continuous stream during idle Live Cam monitoring instead of cold-opening `/dev/videoX`
 * repeatedly, and cleanly releases the V4L2 device BEFORE `VideoTrackRecorder.start()` runs!
 */
class LiveCameraMonitor {
  constructor() {
    this.session = null;
  }

  isRunning() {
    return Boolean(this.session?.proc);
  }

  getLatestFrame(videoConfig = null) {
    if (!this.session?.latestDataUrl) return '';
    if (videoConfig && !videoConfigsMatchSource(this.session.videoConfig, videoConfig)) return '';
    return this.session.latestDataUrl;
  }

  async start(videoConfig = {}, { trackId = '', onLiveFrame = null } = {}) {
    if (!videoConfig || (!videoConfig.devicePath && !videoConfig.streamUrl)) {
      await this.stop();
      return { ok: false, error: 'No video source configured' };
    }

    const sourceSig = `${trackId}|${videoConfig.devicePath || ''}|${videoConfig.streamUrl || ''}|${videoConfig.qualityPreset || ''}`;
    if (this.session && this.session.sourceSig === sourceSig && this.session.proc) {
      this.session.onLiveFrame = onLiveFrame;
      return {
        ok: true,
        reused: true,
        latestDataUrl: this.session.latestDataUrl || '',
      };
    }

    await this.stop();
    if (videoConfig.devicePath) {
      await abortInFlightV4l2Snapshots(videoConfig.devicePath);
    }

    const inArgs = buildFfmpegVideoInputArgs(videoConfig);
    const isV4l2 = Boolean(videoConfig.sourceType === 'v4l2' || videoConfig.devicePath);
    const ffArgs = [
      '-hide_banner',
      '-loglevel', 'error',
      ...inArgs,
      '-map', '0:v:0',
      '-an',
      '-vf', 'fps=15,scale=640:-2',
      '-c:v', 'mjpeg',
      '-q:v', '6',
      '-f', 'image2pipe',
      'pipe:1',
    ];

    const session = {
      sourceSig,
      trackId,
      videoConfig: { ...videoConfig },
      proc: null,
      latestDataUrl: '',
      latestFrameAtMs: 0,
      lastEmitAtMs: 0,
      onLiveFrame,
      exitPromise: Promise.resolve(),
    };

    try {
      const proc = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      session.proc = proc;
      extractMjpegFramesFromStream(proc.stdout, (jpg, frameIdx) => {
        // Skip tiny cold-open dark warmup frames (< 7.5 KB) in first 3 frames on UVC cameras
        if (isV4l2 && frameIdx <= 3 && jpg.length < 7500) return;
        const now = Date.now();
        const dataUrl = `data:image/jpeg;base64,${jpg.toString('base64')}`;
        session.latestDataUrl = dataUrl;
        session.latestFrameAtMs = now;
        if (typeof session.onLiveFrame === 'function' && (now - session.lastEmitAtMs >= 58 || frameIdx <= 2)) {
          session.lastEmitAtMs = now;
          session.onLiveFrame({
            trackId: session.trackId,
            devicePath: videoConfig.devicePath || '',
            streamUrl: videoConfig.streamUrl || '',
            dataUrl,
            timestampMs: now,
            fromRecorder: false,
          });
        }
      });
      session.exitPromise = new Promise((resolve) => {
        proc.on('error', () => resolve());
        proc.on('close', () => {
          if (this.session === session) this.session = null;
          resolve();
        });
      });
      this.session = session;
      return { ok: true, reused: false };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async stop() {
    const cur = this.session;
    if (!cur) return { ok: true };
    this.session = null;
    if (cur.proc) {
      const proc = cur.proc;
      cur.proc = null;
      try { proc.stdin?.write('q\n'); } catch {}
      try { proc.kill('SIGINT'); } catch {}
      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
      }, 900);
      await cur.exitPromise;
      clearTimeout(killTimer);
    }
    return { ok: true };
  }
}

/**
 * Synchronized Multi-Camera HD Video Recorder (`ffmpeg` -> Fragmented H.264 `.mp4` + 15 fps Live MJPEG Pipe -> Faststart `.mp4`)
 */
class VideoTrackRecorder {
  constructor() {
    this.active = null;
  }

  isRecording() {
    return Boolean(this.active);
  }

  getLiveFrameForConfig(videoConfig = null) {
    if (!this.active || !Array.isArray(this.active.entries)) return '';
    for (const entry of this.active.entries) {
      if (!entry.latestPreviewDataUrl) continue;
      if (!videoConfig || videoConfigsMatchSource(entry.videoConfig, videoConfig)) {
        return entry.latestPreviewDataUrl;
      }
    }
    return '';
  }

  start(project, { startSec = 0, injectTestSignal = false, onLiveFrame = null } = {}) {
    if (this.active) throw new Error('Video recording is already in progress');
    const armedVideoTracks = (project.tracks || []).filter(t => t.armed && t.trackKind === 'video');
    if (!armedVideoTracks.length) {
      return { ok: true, armedVideoCount: 0, entries: [] };
    }

    const projectDir = project.projectDir;
    const takesDir = path.join(projectDir, 'takes');
    fs.mkdirSync(takesDir, { recursive: true });

    const startedAtMs = Date.now();
    const entries = armedVideoTracks.map(track => {
      const clipId = makeVideoId('vtake');
      const slug = slugifyVideo(track.shortLabel || track.name);
      const finalFileName = `${slug}-${clipId}.mp4`;
      const partFileName = `${slug}-${clipId}.part.mp4`;
      const videoFile = path.join(takesDir, finalFileName);
      const partFile = path.join(takesDir, partFileName);
      const vcfg = track.videoConfig || {};
      const spec = getVideoQualitySpec(vcfg.qualityPreset || DEFAULT_VIDEO_QUALITY);
      const audioMode = vcfg.audioMode || 'none';
      const isV4l2 = Boolean(vcfg.sourceType === 'v4l2' || vcfg.devicePath);

      const entry = {
        trackId: track.id,
        trackName: track.name,
        clipId,
        finalFileName,
        videoFile,
        partFile,
        relativeVideoPath: path.join('takes', finalFileName),
        audioMode,
        qualitySpec: spec,
        videoConfig: vcfg,
        proc: null,
        firstPacketWallMs: null,
        latestPreviewDataUrl: '',
        latestPreviewAtMs: 0,
        lastLiveEmitAtMs: 0,
        exitPromise: Promise.resolve(),
        stderrTail: '',
      };

      if (!injectTestSignal) {
        // Sync quality & suppress RobOS IP Camera surveillance timestamp watermark during DAW recording
        if ((vcfg.isRobosAndroidCam || vcfg.sourceType === 'robos-ip-camera') && process.env.ROBOS_TEST !== '1') {
          entry.robosCleanSessionActive = true;
          entry.priorOverlayTimestamp = true;
          probeRobosIpCameraStatus(vcfg.baseUrl || vcfg.streamUrl || vcfg.host, {
            port: vcfg.port || 8080,
            username: vcfg.username || '',
            password: vcfg.password || '',
            timeoutMs: 800,
          }).then((probed) => {
            if (probed?.ok && probed.status && typeof probed.status.overlayTimestamp === 'boolean') {
              entry.priorOverlayTimestamp = probed.status.overlayTimestamp;
            }
            return controlRobosIpCamera(vcfg, {
              resolution: spec.robosResolution,
              fps: spec.fps,
              jpegQuality: spec.jpegQuality,
              overlayTimestamp: false,
            });
          }).catch(() => {
            controlRobosIpCamera(vcfg, {
              resolution: spec.robosResolution,
              fps: spec.fps,
              jpegQuality: spec.jpegQuality,
              overlayTimestamp: false,
            }).catch(() => {});
          });
        }

        const inArgs = buildFfmpegVideoInputArgs(vcfg);
        const wantStreamAudio = audioMode === 'stream';
        const vfScale = `scale='min(${spec.width},iw)':'min(${spec.height},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
        // Dual-Output Pipeline:
        //   Output #1 -> Full HD H.264 fragmented `.part.mp4` on disk
        //   Output #2 -> 15 fps `640x360` MJPEG live monitor frames on `pipe:1` (`stdout`)
        // Opening `/dev/videoX` ONLY ONCE eliminates Linux V4L2 `Device or resource busy` lockups
        // and keeps OBSBOT / USB webcams streaming smoothly on-screen throughout the recording!
        const ffArgs = [
          '-hide_banner',
          '-loglevel', 'warning',
          ...inArgs,
          '-map', '0:v:0',
          ...(wantStreamAudio ? ['-map', '0:a?'] : ['-an']),
          '-vf', vfScale,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', String(spec.crf),
          '-pix_fmt', 'yuv420p',
          '-g', '30',
          ...(wantStreamAudio ? ['-c:a', 'aac', '-b:a', '160k'] : []),
          '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          '-y',
          partFile,
          '-map', '0:v:0',
          '-an',
          '-vf', 'fps=15,scale=640:-2',
          '-c:v', 'mjpeg',
          '-q:v', '6',
          '-f', 'image2pipe',
          'pipe:1',
        ];

        try {
          const proc = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
          entry.proc = proc;
          extractMjpegFramesFromStream(proc.stdout, (jpg, frameIdx) => {
            const now = Date.now();
            if (entry.firstPacketWallMs === null) {
              entry.firstPacketWallMs = now;
            }
            if (isV4l2 && frameIdx <= 3 && jpg.length < 7500) return;
            const dataUrl = `data:image/jpeg;base64,${jpg.toString('base64')}`;
            entry.latestPreviewDataUrl = dataUrl;
            entry.latestPreviewAtMs = now;
            if (typeof onLiveFrame === 'function' && (now - entry.lastLiveEmitAtMs >= 58 || frameIdx <= 2)) {
              entry.lastLiveEmitAtMs = now;
              onLiveFrame({
                trackId: entry.trackId,
                devicePath: vcfg.devicePath || '',
                streamUrl: vcfg.streamUrl || '',
                dataUrl,
                timestampMs: now,
                fromRecorder: true,
              });
            }
          });
          proc.stderr?.on('data', chunk => {
            entry.stderrTail = (entry.stderrTail + chunk.toString('utf8')).slice(-600);
          });
          const pollTimer = setInterval(() => {
            if (entry.firstPacketWallMs !== null) {
              clearInterval(pollTimer);
              return;
            }
            try {
              if (fs.existsSync(partFile) && fs.statSync(partFile).size > 512) {
                entry.firstPacketWallMs = Date.now();
                clearInterval(pollTimer);
              }
            } catch {}
          }, 25);
          entry.exitPromise = new Promise(resolve => {
            proc.on('error', () => { clearInterval(pollTimer); resolve(); });
            proc.on('close', () => { clearInterval(pollTimer); resolve(); });
          });
        } catch {
          entry.proc = null;
        }
      }

      return entry;
    });

    this.active = {
      project,
      startSec: Number(startSec) || 0,
      startedAtMs,
      injectTestSignal: Boolean(injectTestSignal),
      entries,
    };

    return {
      ok: true,
      armedVideoCount: entries.length,
      entries: entries.map(e => ({
        trackId: e.trackId,
        trackName: e.trackName,
        clipId: e.clipId,
        videoFile: e.videoFile,
        audioMode: e.audioMode,
        qualityPreset: e.qualitySpec.id,
      })),
    };
  }

  async _terminateEntryProc(entry) {
    if (entry.proc) {
      const proc = entry.proc;
      entry.proc = null;
      try { proc.stdin?.write('q\n'); } catch {}
      try { proc.kill('SIGINT'); } catch {}
      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
      }, 1800);
      await entry.exitPromise;
      clearTimeout(killTimer);
    }
    if (entry.robosCleanSessionActive) {
      entry.robosCleanSessionActive = false;
      if (entry.priorOverlayTimestamp === true && process.env.ROBOS_TEST !== '1') {
        controlRobosIpCamera(entry.videoConfig, { overlayTimestamp: true }).catch(() => {});
      }
    }
  }

  async cancel() {
    if (!this.active) return { ok: true, deletedFiles: 0 };
    const session = this.active;
    this.active = null;
    let deletedFiles = 0;

    for (const entry of session.entries) {
      await this._terminateEntryProc(entry);
      for (const f of [entry.partFile, entry.videoFile]) {
        try {
          if (f && fs.existsSync(f)) {
            fs.unlinkSync(f);
            deletedFiles++;
          }
        } catch {}
      }
    }
    return { ok: true, deletedFiles };
  }

  async stop({
    injectTestSignal = false,
    earsStartWallMs = null,
    audioRecordedClips = [],
    importMediaFileToWavFn = null,
    computeWaveformPeaksFn = null,
  } = {}) {
    if (!this.active) return { ok: true, recordedVideoClips: [] };
    const session = this.active;
    this.active = null;
    const wallDurationSec = Math.max(0.6, (Date.now() - session.startedAtMs) / 1000);
    const recordedVideoClips = [];

    for (const entry of session.entries) {
      await this._terminateEntryProc(entry);

      const hasRealCapture = !injectTestSignal
        && !session.injectTestSignal
        && fs.existsSync(entry.partFile)
        && fs.statSync(entry.partFile).size > 512;

      if (hasRealCapture) {
        await remuxFaststartMp4(entry.partFile, entry.videoFile);
      } else {
        try { if (fs.existsSync(entry.partFile)) fs.unlinkSync(entry.partFile); } catch {}
        const synthW = Math.min(1280, entry.qualitySpec?.width || 1280);
        const synthH = Math.min(720, entry.qualitySpec?.height || 720);
        await synthesizeTestPatternMp4(entry.videoFile, wallDurationSec, entry.audioMode === 'stream', {
          width: synthW,
          height: synthH,
          crf: entry.qualitySpec?.crf || 19,
        });
      }

      const probe = await probeVideoFileInfo(entry.videoFile);
      const vidDur = Number((probe.durationSec || wallDurationSec).toFixed(3));

      let alignedStartSec = session.startSec;
      let alignedOffsetSec = 0;
      const camStartMs = entry.firstPacketWallMs || session.startedAtMs;
      if (hasRealCapture && Number.isFinite(earsStartWallMs) && Number.isFinite(camStartMs)) {
        const deltaSec = (earsStartWallMs - camStartMs) / 1000;
        if (Math.abs(deltaSec) < 3.0 && Math.abs(deltaSec) >= 0.015) {
          if (deltaSec > 0 && deltaSec < vidDur - 0.1) {
            alignedOffsetSec = Number(deltaSec.toFixed(3));
          } else if (deltaSec < 0) {
            alignedStartSec = Number((session.startSec + Math.abs(deltaSec)).toFixed(3));
          }
        }
      }

      const targetTrack = (session.project.tracks || []).find(t => t.id === entry.trackId);
      const pairedAudioRec = audioRecordedClips.find(r => r.trackId === entry.trackId);

      if (pairedAudioRec && pairedAudioRec.clip) {
        pairedAudioRec.clip.mediaKind = 'video';
        pairedAudioRec.clip.videoFile = entry.videoFile;
        pairedAudioRec.clip.relativeVideoPath = entry.relativeVideoPath;
        pairedAudioRec.clip.videoFileExists = true;
        pairedAudioRec.clip.videoWidth = probe.width || entry.qualitySpec?.width || 1280;
        pairedAudioRec.clip.videoHeight = probe.height || entry.qualitySpec?.height || 720;
        pairedAudioRec.clip.qualityPreset = entry.qualitySpec?.id || DEFAULT_VIDEO_QUALITY;
        recordedVideoClips.push({ trackId: entry.trackId, clip: pairedAudioRec.clip });
        continue;
      }

      let wavFile = null;
      let relativeWavPath = null;
      let peaks = [];
      let peakDb = -96;
      if (entry.audioMode === 'stream' && probe.hasAudio && typeof importMediaFileToWavFn === 'function') {
        const wavName = entry.finalFileName.replace(/\.mp4$/i, '.wav');
        const destWav = path.join(path.dirname(entry.videoFile), wavName);
        try {
          await importMediaFileToWavFn(entry.videoFile, destWav, {
            sampleRate: Number(session.project.sampleRate) || 48000,
          });
          if (fs.existsSync(destWav) && typeof computeWaveformPeaksFn === 'function') {
            const pInfo = computeWaveformPeaksFn(fs.readFileSync(destWav));
            wavFile = destWav;
            relativeWavPath = path.join('takes', wavName);
            peaks = pInfo.peaks || [];
            peakDb = pInfo.peakDb ?? -96;
          }
        } catch {}
      }

      const playDur = Math.max(0.1, Number((vidDur - alignedOffsetSec).toFixed(3)));
      const clip = {
        id: entry.clipId,
        name: `${entry.trackName} Video Take`,
        mediaKind: 'video',
        hasAudio: Boolean(wavFile),
        wavFile,
        relativeWavPath,
        fileExists: Boolean(wavFile),
        videoFile: entry.videoFile,
        relativeVideoPath: entry.relativeVideoPath,
        videoFileExists: fs.existsSync(entry.videoFile),
        videoWidth: probe.width || entry.qualitySpec?.width || 1280,
        videoHeight: probe.height || entry.qualitySpec?.height || 720,
        qualityPreset: entry.qualitySpec?.id || DEFAULT_VIDEO_QUALITY,
        startSec: alignedStartSec,
        offsetSec: alignedOffsetSec,
        durationSec: playDur,
        sourceDurationSec: vidDur,
        gainDb: 0,
        fadeInSec: 0,
        fadeOutSec: 0,
        muted: false,
        peakDb,
        peaks,
        transients: [],
        recordedAt: new Date().toISOString(),
      };

      if (targetTrack) {
        if (!Array.isArray(targetTrack.clips)) targetTrack.clips = [];
        targetTrack.clips.push(clip);
      }
      recordedVideoClips.push({ trackId: entry.trackId, clip });
    }

    return { ok: true, recordedVideoClips };
  }
}

module.exports = {
  DEFAULT_VIDEO_QUALITY,
  VIDEO_QUALITY_PRESETS,
  getVideoQualitySpec,
  parseRobosBaseUrl,
  resolveRobosStreamUrlForQuality,
  withRobosCleanStreamParam,
  buildRobosIpCameraSource,
  probeRobosIpCameraStatus,
  controlRobosIpCamera,
  discoverRobosIpCamerasOnSubnet,
  withVideoCredentials,
  redactVideoUrl,
  readCameraWatchSavedSources,
  listLocalV4l2VideoDevices,
  discoverOnvifLanCameras,
  discoverAllVideoSources,
  extractMjpegFramesFromStream,
  abortInFlightV4l2Snapshots,
  captureVideoSourceSnapshot,
  buildVideoTrack,
  probeVideoFileInfo,
  generateVideoFilmstripSprite,
  synthesizeTestPatternMp4,
  LiveCameraMonitor,
  VideoTrackRecorder,
};
