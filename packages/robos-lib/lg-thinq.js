'use strict';

// Read-only client for LG ThinQ Connect, the cloud API behind LG's smart washers,
// dryers and refrigerators. It lists a person's appliances and turns each one's
// status into cards for the Appliances tab in Smart Light.
//
// The personal access token lives in its own file, lg-thinq.json (mode 0600), not in
// smart-lights.json: Config Sync copies that file and it is served by the local API.
// Nothing returned from this module contains the token.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STORE_FILE = 'lg-thinq.json';
const PAT_PAGE_URL = 'https://connect-pat.lgthinq.com';
const REQUEST_TIMEOUT_MS = 15 * 1000;
const MIN_REFRESH_MS = 20 * 1000;
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;

// The client key published in LG's Apache-licensed thinqconnect SDK. It identifies
// the SDK, not the person; every installation sends the same value.
const API_KEY = 'v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3';

const COUNTRIES_BY_REGION = {
  kic: 'AU BD CN HK ID IN JP KH KR LA LK MM MY NP NZ PH SG TH TW VN',
  aic: 'AG AR AW BB BO BR BS BZ CA CL CO CR CU DM DO EC GD GT GY HN HT JM KN LC MX NI PA PE PR PY SR SV TT US UY VC VE',
  eic: 'AE AF AL AM AO AT AZ BA BE BF BG BH BJ BY CD CF CG CH CI CM CV CY CZ DE DJ DK DZ EE EG ES ET FI FR GA GB GE GH GM GN GQ GR HR HU IE IL IQ IR IS IT JO KE KG KW KZ LB LR LT LU LV LY MA MD ME MK ML MR MT MU MW NE NG NL NO OM PK PL PS PT QA RO RS RU RW SA SD SE SI SK SL SN SO ST SY TD TG TN TR TZ UA UG UZ XK YE ZA ZM',
};

const ERROR_TEXT = {
  1103: 'LG rejected this token. Check that it was copied in full and has not been deleted.',
  1218: 'LG rejected this token. Check that it was copied in full and has not been deleted.',
  1302: 'LG does not recognize this token. Create a new one and try again.',
  1304: 'Open the LG ThinQ phone app and accept its latest terms, then try again.',
  1306: 'LG is limiting requests from this account. The app will wait five minutes before asking again.',
  1307: 'LG does not support this country for this token. Use the country of your ThinQ account.',
  1222: 'This appliance is not connected to LG right now.',
};

const AUTH_ERROR_CODES = new Set(['1103', '1218', '1302']);

class ThinqError extends Error {
  constructor(code, message, status) {
    super(ERROR_TEXT[code] || message || `LG ThinQ request failed (${status || 'no response'}).`);
    this.name = 'ThinqError';
    this.code = code == null ? null : String(code);
    this.status = status;
  }
}

function regionForCountry(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  for (const [region, countries] of Object.entries(COUNTRIES_BY_REGION)) {
    if (countries.split(' ').includes(code)) return region;
  }
  return null;
}

function newMessageId() {
  return Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex').toString('base64url');
}

function buildRequestHeaders({ token, countryCode, clientId }) {
  return {
    Authorization: `Bearer ${token}`,
    'x-country': countryCode,
    'x-message-id': newMessageId(),
    'x-client-id': clientId,
    'x-api-key': API_KEY,
    'x-service-phase': 'OP',
  };
}

function humanize(value) {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  if (value == null || value === '') return null;
  const text = String(value).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return text ? text[0].toUpperCase() + text.slice(1) : null;
}

function formatDuration(hours, minutes) {
  if (typeof hours !== 'number' && typeof minutes !== 'number') return null;
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  if (total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function fact(label, value) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : humanize(value);
  return text ? { label, value: text } : null;
}

// LG's wording for a few laundry states does not read well on its own.
const RUN_STATE_TEXT = { END: 'Finished', POWER_OFF: 'Off', INITIAL: 'Ready', RESERVED: 'Scheduled' };

function runStateText(state) {
  const current = state?.runState?.currentState;
  return RUN_STATE_TEXT[current] || humanize(current);
}

function formatUsedTime(amount, unit) {
  const word = String(unit || '').toLowerCase();
  return `${amount} ${word}${word && amount !== 1 && !word.endsWith('s') ? 's' : ''}`.trim();
}

function laundryUnit(state, label = null) {
  const facts = [
    fact('Time left', formatDuration(state?.timer?.remainHour, state?.timer?.remainMinute)),
    fact('Cycle length', formatDuration(state?.timer?.totalHour, state?.timer?.totalMinute)),
    fact('Starts in', formatDuration(state?.timer?.relativeHourToStart, state?.timer?.relativeMinuteToStart)),
    fact('Finishes in', formatDuration(state?.timer?.relativeHourToStop, state?.timer?.relativeMinuteToStop)),
    fact('Remote start', state?.remoteControlEnable?.remoteControlEnabled),
    typeof state?.cycle?.cycleCount === 'number' ? fact('Cycles run', state.cycle.cycleCount) : null,
    fact('Detergent', humanize(state?.detergent?.detergentSetting)),
  ].filter(Boolean);
  return { label, status: runStateText(state) || 'Status unknown', facts };
}

function fridgeSetPoint(entry) {
  const unit = String(entry?.unit || '').toUpperCase();
  const fahrenheit = entry?.targetTemperatureF;
  const celsius = entry?.targetTemperatureC;
  if (unit !== 'C' && fahrenheit != null) return `${fahrenheit}°F`;
  if (celsius != null) return `${celsius}°C`;
  if (entry?.targetTemperature != null) return `${entry.targetTemperature}°${unit || ''}`;
  return null;
}

function fridgeUnit(state) {
  const doors = asList(state?.doorStatus);
  const known = doors.filter((d) => d?.doorState);
  const anyOpen = known.some((d) => String(d.doorState).toUpperCase() === 'OPEN');
  const status = known.length === 0 ? 'Door status unknown' : anyOpen ? 'Door open' : 'Door closed';

  // LG reports the temperature each compartment is set to, not a measured one.
  const setPoints = asList(state?.temperatureInUnits ?? state?.temperature).map((entry) =>
    fact(`${humanize(entry?.locationName) || 'Compartment'} set to`, fridgeSetPoint(entry)),
  );

  const filter = state?.waterFilterInfo;
  const refrigeration = state?.refrigeration;
  const airFilter = [
    humanize(refrigeration?.freshAirFilter),
    typeof refrigeration?.freshAirFilterRemainPercent === 'number' ? `${refrigeration.freshAirFilterRemainPercent}% left` : '',
  ].filter(Boolean).join(', ');
  const facts = [
    ...setPoints,
    fact('Water filter', humanize(filter?.waterFilterState)),
    typeof filter?.usedTime === 'number'
      ? fact('Water filter used', formatUsedTime(filter.usedTime, filter.unit))
      : null,
    fact('Fresh air filter', airFilter),
    fact('Express mode', refrigeration?.expressMode),
    fact('Express cool', refrigeration?.expressFridge),
    fact('Quick freeze', refrigeration?.rapidFreeze),
    fact('Eco mode', state?.ecoFriendly?.ecoFriendlyMode),
    fact('Power saving', state?.powerSave?.powerSaveEnabled),
    fact('Sabbath mode', state?.sabbath?.sabbathMode),
  ].filter(Boolean);
  return { label: null, status, facts };
}

// Appliances without their own card still show whatever plain values LG sends.
function genericUnit(state) {
  const facts = [];
  const walk = (value, prefix) => {
    if (value == null || facts.length >= 12) return;
    if (Array.isArray(value)) return value.forEach((item) => walk(item, prefix));
    if (typeof value === 'object') {
      return Object.entries(value).forEach(([key, inner]) => walk(inner, key));
    }
    const label = humanize(String(prefix).replace(/([a-z])([A-Z])/g, '$1 $2'));
    const item = fact(label || 'Value', typeof value === 'boolean' ? value : humanize(value));
    if (item) facts.push(item);
  };
  walk(state, 'Value');
  return { label: null, status: runStateText(state) || 'Connected', facts };
}

function applianceKind(deviceType) {
  const type = String(deviceType || '').toUpperCase();
  if (type.includes('DISH')) return 'other';
  if (type.endsWith('WASHTOWER')) return 'washtower';
  if (type.includes('DRYER')) return 'dryer';
  if (type.includes('WASH')) return 'washer';
  if (type.endsWith('REFRIGERATOR') && !type.includes('KIMCHI')) return 'refrigerator';
  return 'other';
}

function statusUnits(kind, state) {
  if (kind === 'refrigerator') return [fridgeUnit(state)];
  if (kind === 'washtower') {
    return [laundryUnit(state?.washer, 'Washer'), laundryUnit(state?.dryer, 'Dryer')];
  }
  if (kind === 'washer' || kind === 'dryer') {
    const list = asList(state);
    if (list.length <= 1) return [laundryUnit(list[0])];
    return list.map((unit) => laundryUnit(unit, humanize(unit?.location?.locationName ?? unit?.locationName)));
  }
  return [genericUnit(state)];
}

const KIND_ORDER = { washer: 0, washtower: 1, dryer: 2, refrigerator: 3, other: 4 };
const KIND_LABEL = { washer: 'Washer', washtower: 'WashTower', dryer: 'Dryer', refrigerator: 'Refrigerator' };

function normalizeAppliance(device, state, stateError = null) {
  const info = device?.deviceInfo || {};
  const kind = applianceKind(info.deviceType);
  const typeLabel = KIND_LABEL[kind] || humanize(String(info.deviceType || 'Appliance').replace(/^DEVICE_/, ''));
  return {
    id: device?.deviceId,
    kind,
    typeLabel,
    name: info.alias || typeLabel,
    model: info.modelName || null,
    reachable: !stateError,
    error: stateError,
    units: stateError ? [] : statusUnits(kind, state),
  };
}

function createThinqService(options = {}) {
  const env = options.env || process.env;
  const testMode = env.ROBOS_TEST === '1' || env.ROBOS_TEST_MODE === '1';
  // Only tests may point the token at another host.
  const baseUrlOverride = options.baseUrl || (testMode ? env.ROBOS_THINQ_BASE_URL : null);
  const fetchImpl = options.fetchImpl || ((...args) => globalThis.fetch(...args));
  const now = options.now || (() => Date.now());
  const storePath = path.join(options.configDir, STORE_FILE);

  let cache = { devices: [], updatedAt: null, error: null };
  let lastRefreshAt = 0;
  let blockedUntil = 0;
  let inFlight = null;

  function readStore() {
    try {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      return store?.token ? store : null;
    } catch {
      return null;
    }
  }

  function writeStore(store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tmp = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, storePath);
  }

  async function request(store, endpoint) {
    if (testMode && !baseUrlOverride) {
      throw new ThinqError(null, 'LG ThinQ is not contacted in test mode.');
    }
    const base = baseUrlOverride || `https://api-${regionForCountry(store.countryCode)}.lgthinq.com`;
    let response;
    try {
      response = await fetchImpl(`${base}/${endpoint}`, {
        method: 'GET',
        headers: buildRequestHeaders(store),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ThinqError(null, 'Could not reach LG ThinQ. Check your internet connection.');
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {}
    if (response.ok) return payload?.response;
    if (response.status === 401 && !payload?.error?.code) throw new ThinqError('1103', null, 401);
    throw new ThinqError(payload?.error?.code, payload?.error?.message, response.status);
  }

  function overview() {
    const store = readStore();
    return {
      connected: Boolean(store),
      countryCode: store?.countryCode || null,
      devices: cache.devices,
      updatedAt: cache.updatedAt,
      error: cache.error,
      patPageUrl: PAT_PAGE_URL,
    };
  }

  // Appliances are read one at a time so a house full of them stays well inside
  // LG's rate limit. One unreachable appliance does not hide the others.
  async function readAppliances(store) {
    const devices = asList(await request(store, 'devices'));
    const cards = [];
    for (const device of devices) {
      try {
        const state = await request(store, `devices/${encodeURIComponent(device.deviceId)}/state`);
        cards.push(normalizeAppliance(device, state));
      } catch (err) {
        if (err.code === '1306' || AUTH_ERROR_CODES.has(err.code)) throw err;
        cards.push(normalizeAppliance(device, null, err.message));
      }
    }
    return cards.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
  }

  function recordFailure(err) {
    if (err.code === '1306') blockedUntil = now() + RATE_LIMIT_BACKOFF_MS;
    cache = { ...cache, error: err.message };
  }

  async function refresh({ force = false } = {}) {
    const store = readStore();
    if (!store) return overview();
    if (inFlight) return inFlight;
    const time = now();
    if (time < blockedUntil) return overview();
    if (!force && lastRefreshAt && time - lastRefreshAt < MIN_REFRESH_MS) return overview();
    lastRefreshAt = time;
    inFlight = (async () => {
      try {
        cache = { devices: await readAppliances(store), updatedAt: new Date(now()).toISOString(), error: null };
      } catch (err) {
        recordFailure(err);
      } finally {
        inFlight = null;
      }
      return overview();
    })();
    return inFlight;
  }

  // The token is saved only after LG has accepted it.
  async function connect({ token, countryCode } = {}) {
    const cleanToken = String(token || '').trim();
    const country = String(countryCode || '').trim().toUpperCase();
    if (!cleanToken) return { ok: false, error: 'Paste your LG ThinQ personal access token first.', overview: overview() };
    if (!regionForCountry(country)) {
      return { ok: false, error: `LG ThinQ does not list "${country}" as a supported country. Use a two-letter code such as US.`, overview: overview() };
    }
    const store = {
      token: cleanToken,
      countryCode: country,
      clientId: readStore()?.clientId || crypto.randomUUID(),
    };
    try {
      const devices = await readAppliances(store);
      writeStore(store);
      blockedUntil = 0;
      lastRefreshAt = now();
      cache = { devices, updatedAt: new Date(now()).toISOString(), error: null };
      return { ok: true, overview: overview() };
    } catch (err) {
      if (err.code === '1306') blockedUntil = now() + RATE_LIMIT_BACKOFF_MS;
      return { ok: false, error: err.message, overview: overview() };
    }
  }

  function disconnect() {
    fs.rmSync(storePath, { force: true });
    cache = { devices: [], updatedAt: null, error: null };
    lastRefreshAt = 0;
    blockedUntil = 0;
    return overview();
  }

  return { getOverview: overview, refresh, connect, disconnect };
}

module.exports = {
  API_KEY,
  PAT_PAGE_URL,
  STORE_FILE,
  MIN_REFRESH_MS,
  RATE_LIMIT_BACKOFF_MS,
  ThinqError,
  regionForCountry,
  newMessageId,
  buildRequestHeaders,
  applianceKind,
  normalizeAppliance,
  createThinqService,
};
