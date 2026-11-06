'use strict';

// Thin layer over the open-source `onvif` package (github.com/agsh/onvif, MIT,
// the stable 0.8 line on npm): WS-Discovery of cameras on the LAN, a camera's
// media profiles, RTSP stream and snapshot URIs, PTZ moves and presets, and the
// camera's own event stream (motion alarms). The package is loaded lazily, so
// the rest of the app works with plain RTSP/HTTP cameras even without it.
//
// The library's API is callback based; openSession() returns a small promise
// wrapper so the rest of Camera Watch does not depend on its shape.

let onvifModule = null;
function loadOnvif() {
  if (onvifModule) return onvifModule;
  try {
    onvifModule = require('onvif');
  } catch (err) {
    const e = new Error('The ONVIF library is not installed. Run "npm install" in the camera-watch folder.');
    e.cause = err;
    throw e;
  }
  return onvifModule;
}

/** For tests: use a stand-in for the onvif package. */
function setOnvifModule(mod) {
  onvifModule = mod;
}

/** Put user:password into a stream URL that does not already carry credentials. */
function withCredentials(url, username, password) {
  if (!url || !username) return url;
  try {
    const u = new URL(url);
    if (u.username) return url;
    u.username = username;
    u.password = password || '';
    return u.toString();
  } catch {
    return url;
  }
}

/** The same URL with the password replaced, for logs and the UI. */
function redactUrl(url) {
  return String(url ?? '').replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:)([^@/\s]+)@/gi, '$1***@');
}

function scopeValue(scopes, key) {
  const m = new RegExp(`onvif://www\\.onvif\\.org/${key}/([^\\s<"]+)`, 'i').exec(String(scopes || ''));
  if (!m) return '';
  try { return decodeURIComponent(m[1]).replace(/_/g, ' '); } catch { return m[1]; }
}

function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v._ ?? v['#text'] ?? '');
  return String(v);
}

/** Turn one WS-Discovery ProbeMatch (as the library parses it) into a device entry. */
function deviceFromProbeMatch(data, rinfo) {
  const match = data?.probeMatches?.probeMatch;
  const m = Array.isArray(match) ? match[0] : match;
  if (!m) return null;
  const xaddrs = textOf(m.XAddrs ?? m.xAddrs).split(/\s+/).filter(Boolean);
  const urls = xaddrs.map((x) => { try { return new URL(x); } catch { return null; } }).filter(Boolean);
  const addr = rinfo?.address || '';
  const url = urls.find((u) => u.hostname === addr) || urls[0] || null;
  const scopes = textOf(m.scopes ?? m.Scopes);
  const hostname = url?.hostname || addr;
  if (!hostname) return null;
  return {
    hostname,
    port: Number(url?.port) || (url?.protocol === 'https:' ? 443 : 80),
    path: url?.pathname || '/onvif/device_service',
    urn: textOf(m.endpointReference?.address ?? m.EndpointReference?.Address),
    address: addr,
    name: scopeValue(scopes, 'name'),
    hardware: scopeValue(scopes, 'hardware'),
    xaddrs,
  };
}

/**
 * Probe the LAN for ONVIF cameras with WS-Discovery (UDP multicast 239.255.255.250:3702).
 * Resolves to [{ hostname, port, path, urn, name, hardware, address, xaddrs }].
 */
function discover({ timeoutMs = 5000 } = {}) {
  const { Discovery } = loadOnvif();
  const seen = new Map();
  const onDevice = (data, rinfo) => {
    const d = deviceFromProbeMatch(data, rinfo);
    const key = d && (d.urn || `${d.hostname}:${d.port}`);
    // The 'device' event knows the sender's address; the final list does not.
    if (d && (rinfo || !seen.has(key))) seen.set(key, d);
  };
  // Non-camera devices answer with malformed SOAP now and then; the library
  // reports that as an 'error' event, which must have a listener.
  const onError = () => {};
  Discovery.on('device', onDevice);
  Discovery.on('error', onError);
  return new Promise((resolve, reject) => {
    try {
      // resolve:false hands back the probe answer instead of auto-connecting a
      // Cam to each device without credentials.
      Discovery.probe({ timeout: timeoutMs, resolve: false }, (err, matches) => {
        Discovery.removeListener('device', onDevice);
        Discovery.removeListener('error', onError);
        for (const m of matches || []) onDevice(m, null);
        const list = [...seen.values()].sort((a, b) => a.hostname.localeCompare(b.hostname, undefined, { numeric: true }));
        // err is a list of per-device problems; only fail when nothing answered and the socket failed.
        if (!list.length && err && !Array.isArray(err)) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve(list);
      });
    } catch (err) {
      Discovery.removeListener('device', onDevice);
      Discovery.removeListener('error', onError);
      reject(err);
    }
  });
}

function profileToken(p) {
  const t = p?.$?.token ?? p?.token ?? p?.profileToken;
  return t === undefined || t === null ? '' : String(t);
}

function profileInfo(p) {
  const res = p?.videoEncoderConfiguration?.resolution || {};
  return {
    token: profileToken(p),
    name: textOf(p?.name) || profileToken(p),
    width: Number(res.width) || 0,
    height: Number(res.height) || 0,
    encoding: textOf(p?.videoEncoderConfiguration?.encoding),
  };
}

function cleanError(err) {
  if (!err) return new Error('Unknown ONVIF error.');
  if (Array.isArray(err)) return cleanError(err[0]);
  const msg = err.message || String(err);
  if (/ECONNREFUSED/.test(msg)) return new Error('The camera refused the connection. Check the address and ONVIF port (often 80, 8000, 8080 or 8899).');
  if (/ETIMEDOUT|timeout|EHOSTUNREACH/i.test(msg)) return new Error('The camera did not answer. Check the address, and that ONVIF is turned on in the camera.');
  if (/NotAuthorized|401|Sender not Authorized|not authorized/i.test(msg)) return new Error('The camera refused the user name or password.');
  return err instanceof Error ? err : new Error(msg);
}

/**
 * Connect to a camera. Resolves to a session object with promise methods;
 * the underlying library object is session.cam.
 */
function openSession({ hostname, port = 80, path = '/onvif/device_service', username, password, timeoutMs = 10000 }) {
  const { Cam } = loadOnvif();
  const cam = new Cam({
    hostname,
    port: Number(port) || 80,
    path: path || '/onvif/device_service',
    username: username || undefined,
    password: password || undefined,
    timeout: timeoutMs,
    // Cameras behind NAT or with a wrong XAddr still answer on the address we used.
    preserveAddress: true,
    autoconnect: false,
  });
  // An 'error' event without a listener would crash the app.
  cam.on('error', () => {});
  const call = (method, ...args) => new Promise((resolve, reject) => {
    if (typeof cam[method] !== 'function') { reject(new Error(`This version of the onvif library has no ${method}.`)); return; }
    cam[method](...args, (err, result) => (err ? reject(cleanError(err)) : resolve(result)));
  });

  const session = {
    cam,
    get profiles() { return (cam.profiles || []).map(profileInfo).filter((p) => p.token); },
    get activeProfileToken() {
      const t = cam.activeSource?.profileToken;
      return t !== undefined && t !== null ? String(t) : profileToken(cam.defaultProfile);
    },
    get hasPtz() { return Boolean(cam.uri?.ptz || cam.capabilities?.PTZ); },
    getDeviceInformation: () => call('getDeviceInformation'),
    getStreamUri: (profile) => call('getStreamUri', { protocol: 'RTSP', ...(profile ? { profileToken: profile } : {}) }),
    getSnapshotUri: (profile) => call('getSnapshotUri', profile ? { profileToken: profile } : {}),
    continuousMove: ({ x = 0, y = 0, zoom = 0, profile, timeoutMs: t } = {}) =>
      call('continuousMove', { x, y, zoom, ...(profile ? { profileToken: profile } : {}), ...(t ? { timeout: t } : {}) }),
    stop: (profile) => call('stop', { panTilt: true, zoom: true, ...(profile ? { profileToken: profile } : {}) }),
    async getPresets(profile) {
      // The library resolves to { presetName: preset }, with the token at preset.$.token.
      const byName = await call('getPresets', profile ? { profileToken: profile } : {});
      return Object.entries(byName || {})
        // The library turns numeric-looking tokens into numbers; tokens are strings.
        .map(([name, p]) => ({ token: String(p?.$?.token ?? ''), name: textOf(p?.name) || name }))
        .filter((p) => p.token !== '');
    },
    gotoPreset: (token, profile) => call('gotoPreset', { preset: token, ...(profile ? { profileToken: profile } : {}) }),
    /** Listen to camera events (the library starts a pull-point subscription on the first listener). */
    onEvent(fn) {
      cam.on('event', fn);
      return () => cam.removeListener('event', fn);
    },
    close() {
      try { cam.removeAllListeners('event'); } catch {}
    },
  };

  return new Promise((resolve, reject) => {
    cam.connect((err) => (err ? reject(cleanError(err)) : resolve(session)));
  });
}

/**
 * Read what Camera Watch needs from a connected camera:
 * device info, profiles, the RTSP stream URI, the snapshot URI and whether it has PTZ.
 */
async function inspect(session, { profileToken: wanted } = {}) {
  let info = null;
  try { info = await session.getDeviceInformation(); } catch { info = null; }
  const profiles = session.profiles;
  const token = (wanted && profiles.some((p) => p.token === wanted))
    ? wanted
    : session.activeProfileToken || profiles[0]?.token || '';

  let streamUri = '';
  try {
    const r = await session.getStreamUri(token);
    streamUri = r?.uri || '';
  } catch (err) {
    throw new Error(`The camera did not give an RTSP stream address: ${err.message}`);
  }
  if (!streamUri) throw new Error('The camera did not give an RTSP stream address.');
  let snapshotUri = '';
  try {
    const r = await session.getSnapshotUri(token);
    snapshotUri = r?.uri || '';
  } catch { /* snapshots are optional */ }

  return {
    manufacturer: textOf(info?.manufacturer),
    model: textOf(info?.model),
    firmware: textOf(info?.firmwareVersion),
    serial: textOf(info?.serialNumber),
    profiles,
    profileToken: token,
    streamUri,
    snapshotUri,
    ptz: session.hasPtz,
  };
}

/** Walk an ONVIF NotificationMessage and collect SimpleItem Name/Value pairs. */
function simpleItems(node, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return out;
  if (Array.isArray(node)) {
    for (const n of node) simpleItems(n, out, depth + 1);
    return out;
  }
  const attrs = node.$ && typeof node.$ === 'object' ? node.$ : node;
  const name = attrs.Name ?? attrs.name;
  const value = attrs.Value ?? attrs.value;
  if (name !== undefined && value !== undefined && typeof name !== 'object' && typeof value !== 'object') {
    out.push({ name: String(name), value });
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') simpleItems(v, out, depth + 1);
  }
  return out;
}

/**
 * Read a camera event: is it a motion alarm, and is motion on or off?
 * Returns { topic, motion: true|false } or null when it is not a motion event.
 * Covers the common topics: RuleEngine/CellMotionDetector/Motion (IsMotion),
 * VideoSource/MotionAlarm (State) and object/field detectors.
 */
function parseMotionEvent(msg) {
  const topic = textOf(msg?.topic);
  if (!/motion|ObjectDetection|FieldDetector|LineDetector/i.test(topic)) return null;
  const data = msg?.message?.message?.data ?? msg?.message?.data ?? msg?.data ?? msg?.message ?? msg;
  const items = simpleItems(data);
  const item = items.find((i) => /^(IsMotion|State|IsInside|Value|Active)$/i.test(i.name)) || items[0];
  if (!item) return null;
  const v = String(item.value).toLowerCase();
  return { topic, motion: v === 'true' || v === '1' };
}

module.exports = {
  loadOnvif,
  setOnvifModule,
  discover,
  deviceFromProbeMatch,
  openSession,
  inspect,
  withCredentials,
  redactUrl,
  parseMotionEvent,
  simpleItems,
  profileInfo,
};
