'use strict';

/**
 * RobOS DAW Studio — Video Inputs (RobOS Android IP Camera, ONVIF, Camera Watch, V4L2 Webcams)
 * & Synchronized Multi-Track Video Recorder (`ffmpeg` Fragmented MP4 + Faststart).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const dgram = require('dgram');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

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

function getCameraWatchConfigPath() {
  if (process.env.ROBOS_CAMERA_WATCH_CONFIG) return process.env.ROBOS_CAMERA_WATCH_CONFIG;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.config', 'robos', 'camera-watch', 'cameras.json');
}

/**
 * Read cameras configured in RobOS Camera Watch (`~/.config/robos/camera-watch/cameras.json`),
 * automatically recognizing RobOS IP Camera for Android (`:8080/video`, `manufacturer: "RobOS"`).
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
      let hostHint = '';
      try { hostHint = new URL(streamUrl).host; } catch {}
      const badge = isRobosAndroid ? 'RobOS Android IP Cam' : (isRtsp ? 'RTSP IP Cam' : 'HTTP MJPEG Cam');

      out.push({
        id: `cw:${cam.id}`,
        sourceType: 'ip-camera',
        protocol: isRtsp ? 'rtsp' : 'mjpeg',
        label: `${cam.name || 'IP Camera'} (${badge}${hostHint ? ` · ${hostHint}` : ''})`,
        shortName: cam.name || 'IP Camera',
        streamUrl,
        snapshotUrl: snapshotUrl || (isRobosAndroid && hostHint ? `http://${hostHint}/snapshot.jpg` : ''),
        devicePath: '',
        username: cam.username || '',
        password: cam.password || '',
        rtspTransport: cam.rtspTransport || 'tcp',
        isRobosAndroidCam: isRobosAndroid,
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
      // Clean repeated USB UVC strings like "Integrated Camera: Integrated C"
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
 * to discover RobOS IP Camera for Android and ONVIF cameras on the LAN.
 */
function discoverOnvifLanCameras({ timeoutMs = 1500 } = {}) {
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
        const streamUrl = `http://${host}:${port}/video`;
        const snapshotUrl = `http://${host}:${port}/snapshot.jpg`;

        found.set(key, {
          id: `onvif:${host}:${port}`,
          sourceType: 'ip-camera',
          protocol: 'mjpeg',
          label: `${name} (${isRobos ? 'RobOS Android IP Cam' : 'ONVIF LAN'} · ${host}:${port})`,
          shortName: name,
          streamUrl,
          snapshotUrl,
          devicePath: '',
          username: '',
          password: '',
          isRobosAndroidCam: isRobos,
          origin: 'onvif-lan',
        });
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

    setTimeout(finish, Math.max(300, Math.min(5000, Number(timeoutMs) || 1500)));
  });
}

/**
 * Discover all available video input sources (Camera Watch + RobOS Android IP Cam + optional LAN scan + local V4L2).
 */
async function discoverAllVideoSources({ scanLan = false, timeoutMs = 1400 } = {}) {
  const saved = readCameraWatchSavedSources();
  const local = listLocalV4l2VideoDevices();
  const lan = scanLan ? await discoverOnvifLanCameras({ timeoutMs }) : [];

  const seenStreams = new Set();
  const seenDevs = new Set();
  const merged = [];

  for (const item of [...saved, ...lan, ...local]) {
    if (item.devicePath) {
      if (seenDevs.has(item.devicePath)) continue;
      seenDevs.add(item.devicePath);
    } else if (item.streamUrl) {
      const normUrl = item.streamUrl.replace(/\/+$/, '').toLowerCase();
      if (seenStreams.has(normUrl)) continue;
      seenStreams.add(normUrl);
    }
    merged.push(item);
  }

  return merged;
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
        if (total <= 6 * 1024 * 1024) chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => {
      req.destroy(new Error('Camera snapshot timed out'));
    });
    req.on('error', reject);
  });
}

function grabSingleFrameWithFfmpeg(inputArgsList, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      ...inputArgsList,
      '-frames:v', '1',
      '-vf', "scale='min(960,iw)':-2",
      '-q:v', '5',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ];
    execFile('ffmpeg', args, { encoding: 'buffer', timeout: timeoutMs, maxBuffer: 6 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err || !stdout || stdout.length < 64) {
        const msg = String(stderr || err?.message || 'Could not capture preview frame').trim().split('\n').pop();
        reject(new Error(msg));
        return;
      }
      resolve(stdout);
    });
  });
}

function buildFfmpegVideoInputArgs(videoConfig = {}) {
  const srcType = videoConfig.sourceType || (videoConfig.devicePath ? 'v4l2' : 'ip-camera');
  if (srcType === 'v4l2' || videoConfig.devicePath) {
    const dev = videoConfig.devicePath || '/dev/video0';
    return ['-use_wallclock_as_timestamps', '1', '-f', 'v4l2', '-framerate', String(Number(videoConfig.fps) || 30), '-i', dev];
  }
  const authedUrl = withVideoCredentials(videoConfig.streamUrl, videoConfig.username, videoConfig.password);
  if (/^rtsps?:/i.test(authedUrl)) {
    return ['-rtsp_transport', videoConfig.rtspTransport || 'tcp', '-use_wallclock_as_timestamps', '1', '-i', authedUrl];
  }
  return ['-use_wallclock_as_timestamps', '1', '-f', 'mpjpeg', '-i', authedUrl];
}

/**
 * Grab a single JPEG preview frame (`data:image/jpeg;base64,...`) from any configured video source.
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

  // Fallback: derive /snapshot.jpg if streamUrl ends with /video or /sub
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

  const jpg = await grabSingleFrameWithFfmpeg(buildFfmpegVideoInputArgs(videoConfig), 5000);
  return { ok: true, dataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}` };
}

/**
 * Construct a DAW Studio Video Track (`trackKind === 'video'`).
 * `audioMode`:
 *   - `'none'`      : Video only (no track audio — ideal alongside multi-mic Focusrite/ADAT setup)
 *   - `'interface'` : Record paired PipeWire / Focusrite audio input channel alongside video
 *   - `'stream'`    : Record embedded camera stream audio (RTSP / webcam stream audio if present)
 */
function buildVideoTrack({
  name,
  videoConfig = {},
  audioMode = 'none',
  inputNodeName = '',
  inputLabel = '',
  armed = true,
} = {}) {
  const cleanAudioMode = ['none', 'interface', 'stream'].includes(audioMode) ? audioMode : 'none';
  const camName = videoConfig.shortName || videoConfig.label || 'Camera';
  const trackName = String(name || camName).trim() || 'Video Cam 1';

  let subtitle = `${camName} · Video Only`;
  if (cleanAudioMode === 'interface') {
    subtitle = `${camName} + ${inputLabel || 'Audio Input'}`;
  } else if (cleanAudioMode === 'stream') {
    subtitle = `${camName} + Camera Stream Audio`;
  }

  return {
    id: makeVideoId('trk'),
    trackKind: 'video',
    profileId: 'video-cam',
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
      sourceType: videoConfig.sourceType || (videoConfig.devicePath ? 'v4l2' : 'ip-camera'),
      protocol: videoConfig.protocol || (videoConfig.devicePath ? 'v4l2' : (/^rtsps?:/i.test(videoConfig.streamUrl || '') ? 'rtsp' : 'mjpeg')),
      label: videoConfig.label || camName,
      shortName: camName,
      streamUrl: String(videoConfig.streamUrl || '').trim(),
      snapshotUrl: String(videoConfig.snapshotUrl || '').trim(),
      devicePath: String(videoConfig.devicePath || '').trim(),
      username: String(videoConfig.username || ''),
      password: String(videoConfig.password || ''),
      rtspTransport: videoConfig.rtspTransport || 'tcp',
      isRobosAndroidCam: Boolean(videoConfig.isRobosAndroidCam),
      audioMode: cleanAudioMode,
      fps: Number(videoConfig.fps) || 30,
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

function synthesizeTestPatternMp4(destMp4, durationSec = 2.5, withAudio = false) {
  return new Promise((resolve, reject) => {
    const dur = Math.max(0.5, Math.min(60, Number(durationSec) || 2.5));
    const args = [
      '-nostdin', '-y', '-v', 'error',
      '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=${dur.toFixed(3)}`,
    ];
    if (withAudio) {
      args.push('-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=48000:duration=${dur.toFixed(3)}`);
    }
    args.push(
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p',
      ...(withAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
      '-movflags', '+faststart',
      destMp4
    );
    execFile('ffmpeg', args, { timeout: 25000 }, (err) => {
      if (err) reject(err);
      else resolve(destMp4);
    });
  });
}

/**
 * Synchronized Multi-Camera Video Recorder (`ffmpeg` -> Fragmented H.264 `.mp4` -> Faststart `.mp4`)
 */
class VideoTrackRecorder {
  constructor() {
    this.active = null;
  }

  isRecording() {
    return Boolean(this.active);
  }

  start(project, { startSec = 0, injectTestSignal = false } = {}) {
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
      const audioMode = vcfg.audioMode || 'none';

      const entry = {
        trackId: track.id,
        trackName: track.name,
        clipId,
        finalFileName,
        videoFile,
        partFile,
        relativeVideoPath: path.join('takes', finalFileName),
        audioMode,
        videoConfig: vcfg,
        proc: null,
        firstPacketWallMs: null,
        exitPromise: Promise.resolve(),
        stderrTail: '',
      };

      if (!injectTestSignal) {
        const inArgs = buildFfmpegVideoInputArgs(vcfg);
        const wantStreamAudio = audioMode === 'stream';
        const ffArgs = [
          '-hide_banner',
          '-loglevel', 'warning',
          ...inArgs,
          '-map', '0:v:0',
          ...(wantStreamAudio ? ['-map', '0:a?'] : ['-an']),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', '22',
          '-pix_fmt', 'yuv420p',
          '-g', '30',
          ...(wantStreamAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
          '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          '-y',
          partFile,
        ];

        try {
          const proc = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
          entry.proc = proc;
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
      })),
    };
  }

  async _terminateEntryProc(entry) {
    if (!entry.proc) return;
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
        await synthesizeTestPatternMp4(entry.videoFile, wallDurationSec, entry.audioMode === 'stream');
      }

      const probe = await probeVideoFileInfo(entry.videoFile);
      const vidDur = Number((probe.durationSec || wallDurationSec).toFixed(3));

      // Align camera startup latency against headphone overdub clock (`earsStartWallMs`)
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

      // Case A: `audioMode === 'interface'` — MultiTrackRecorder already created the aligned `.wav` clip on this track!
      if (pairedAudioRec && pairedAudioRec.clip) {
        pairedAudioRec.clip.mediaKind = 'video';
        pairedAudioRec.clip.videoFile = entry.videoFile;
        pairedAudioRec.clip.relativeVideoPath = entry.relativeVideoPath;
        pairedAudioRec.clip.videoFileExists = true;
        pairedAudioRec.clip.videoWidth = probe.width || 1280;
        pairedAudioRec.clip.videoHeight = probe.height || 720;
        recordedVideoClips.push({ trackId: entry.trackId, clip: pairedAudioRec.clip });
        continue;
      }

      // Case B: `audioMode === 'stream'` — extract camera audio to `.wav` if stream carried audio
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

      // Case C: Video-only (`audioMode === 'none'`) or stream clip
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
        videoWidth: probe.width || 1280,
        videoHeight: probe.height || 720,
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
  withVideoCredentials,
  redactVideoUrl,
  readCameraWatchSavedSources,
  listLocalV4l2VideoDevices,
  discoverOnvifLanCameras,
  discoverAllVideoSources,
  captureVideoSourceSnapshot,
  buildVideoTrack,
  probeVideoFileInfo,
  synthesizeTestPatternMp4,
  VideoTrackRecorder,
};
