'use strict';

// Unit tests for robos-lib/lg-thinq: request headers and regions, the appliance
// cards for washers, dryers, WashTowers and refrigerators, and how the token is kept.
//
// No traffic reaches LG: requests go to a local HTTP server that answers like the
// ThinQ Connect API, or to a recording fetch.

const { describe, it, after, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const libDir = path.resolve(__dirname, '..', '..', '..', 'robos-lib');
const thinq = require(path.join(libDir, 'lg-thinq'));
const { CATEGORIES, EXCLUDE } = require(path.join(libDir, 'config-sync-catalog'));

const TOKEN = 'thinqpat_test_value';
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-lg-thinq-'));
const cleanups = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

function tempConfigDir() {
  return fs.mkdtempSync(path.join(tmpRoot, 'cfg-'));
}

const DEVICES = [
  { deviceId: 'fridge-id', deviceInfo: { deviceType: 'DEVICE_REFRIGERATOR', modelName: 'LRFLC2706S', alias: 'Kitchen Fridge' } },
  { deviceId: 'dryer-id', deviceInfo: { deviceType: 'DEVICE_DRYER', modelName: 'DLEX4000W', alias: 'Dryer' } },
  { deviceId: 'washer-id', deviceInfo: { deviceType: 'DEVICE_WASHER', modelName: 'WM4000HWA', alias: 'Washer' } },
];

const WASHER_STATE = [{
  location: { locationName: 'MAIN' },
  runState: { currentState: 'RINSING' },
  timer: { remainHour: 0, remainMinute: 42, totalHour: 1, totalMinute: 5 },
  remoteControlEnable: { remoteControlEnabled: false },
  cycle: { cycleCount: 212 },
}];

const DRYER_STATE = {
  runState: { currentState: 'POWER_OFF' },
  timer: { remainHour: 0, remainMinute: 0 },
  remoteControlEnable: { remoteControlEnabled: true },
};

const FRIDGE_STATE = {
  doorStatus: [{ locationName: 'MAIN', doorState: 'CLOSE' }],
  temperatureInUnits: [
    { locationName: 'FRIDGE', targetTemperatureF: 37, targetTemperatureC: 3, unit: 'F' },
    { locationName: 'FREEZER', targetTemperatureF: 0, targetTemperatureC: -18, unit: 'F' },
  ],
  waterFilterInfo: { usedTime: 4, unit: 'MONTH', waterFilterState: 'GOOD' },
  refrigeration: { expressMode: false, rapidFreeze: true, freshAirFilter: 'AUTO', freshAirFilterRemainPercent: 80 },
  ecoFriendly: { ecoFriendlyMode: false },
  powerSave: { powerSaveEnabled: true },
  sabbath: { sabbathMode: false },
};

const STATES = { 'washer-id': WASHER_STATE, 'dryer-id': DRYER_STATE, 'fridge-id': FRIDGE_STATE };

async function fakeLgServer({ validToken = TOKEN, stateOverride = null, errorFor = () => null } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${validToken}`) {
      return send(401, { error: { code: '1103', message: 'invalid token' } });
    }
    const failure = errorFor(req.url);
    if (failure) return send(failure.status, { error: { code: failure.code, message: failure.message } });
    if (req.url === '/devices') return send(200, { messageId: 'x', response: DEVICES });
    const match = req.url.match(/^\/devices\/([^/]+)\/state$/);
    if (match) return send(200, { messageId: 'x', response: stateOverride?.[match[1]] ?? STATES[match[1]] });
    return send(404, { error: { code: '1000', message: 'not found' } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise((resolve) => server.close(resolve)));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests };
}

function storePath(configDir) {
  return path.join(configDir, thinq.STORE_FILE);
}

describe('regions and request headers', () => {
  it('maps countries to the region LG serves them from', () => {
    assert.strictEqual(thinq.regionForCountry('US'), 'aic');
    assert.strictEqual(thinq.regionForCountry('de'), 'eic');
    assert.strictEqual(thinq.regionForCountry('KR'), 'kic');
    assert.strictEqual(thinq.regionForCountry('ZZ'), null);
    assert.strictEqual(thinq.regionForCountry('USA'), null);
  });

  it('calls the regional host with the headers LG requires', async () => {
    const calls = [];
    const service = thinq.createThinqService({
      configDir: tempConfigDir(),
      env: {},
      fetchImpl: async (url, init) => {
        calls.push({ url, headers: init.headers, method: init.method });
        return new Response(JSON.stringify({ response: [] }), { status: 200 });
      },
    });
    const result = await service.connect({ token: `  ${TOKEN}  `, countryCode: 'us' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://api-aic.lgthinq.com/devices');
    assert.strictEqual(calls[0].method, 'GET');
    const { headers } = calls[0];
    assert.strictEqual(headers.Authorization, `Bearer ${TOKEN}`);
    assert.strictEqual(headers['x-country'], 'US');
    assert.strictEqual(headers['x-api-key'], thinq.API_KEY);
    assert.strictEqual(headers['x-service-phase'], 'OP');
    assert.match(headers['x-client-id'], /^[0-9a-f-]{36}$/);
    assert.match(headers['x-message-id'], /^[A-Za-z0-9_-]{22}$/);
  });

  it('never ignores test mode: no base URL means no request at all', async () => {
    let called = false;
    const service = thinq.createThinqService({
      configDir: tempConfigDir(),
      env: { ROBOS_TEST: '1' },
      fetchImpl: async () => { called = true; return new Response('{}'); },
    });
    const result = await service.connect({ token: TOKEN, countryCode: 'US' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(called, false);
  });

  it('ignores the base URL override outside test mode', async () => {
    const calls = [];
    const service = thinq.createThinqService({
      configDir: tempConfigDir(),
      env: { ROBOS_THINQ_BASE_URL: 'http://attacker.example' },
      fetchImpl: async (url) => { calls.push(url); return new Response(JSON.stringify({ response: [] })); },
    });
    await service.connect({ token: TOKEN, countryCode: 'US' });
    assert.ok(calls[0].startsWith('https://api-aic.lgthinq.com/'));
  });
});

describe('appliance cards', () => {
  it('sorts appliances and reads a washer, dryer and refrigerator', async () => {
    const { baseUrl } = await fakeLgServer();
    const service = thinq.createThinqService({ configDir: tempConfigDir(), baseUrl, env: {} });
    const { ok, overview } = await service.connect({ token: TOKEN, countryCode: 'US' });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(overview.devices.map((d) => d.kind), ['washer', 'dryer', 'refrigerator']);

    const [washer, dryer, fridge] = overview.devices;
    const facts = (device) => Object.fromEntries(device.units[0].facts.map((f) => [f.label, f.value]));

    assert.strictEqual(washer.name, 'Washer');
    assert.strictEqual(washer.model, 'WM4000HWA');
    assert.strictEqual(washer.units[0].status, 'Rinsing');
    assert.strictEqual(facts(washer)['Time left'], '42 min');
    assert.strictEqual(facts(washer)['Cycle length'], '1 hr 5 min');
    assert.strictEqual(facts(washer)['Remote start'], 'Off');
    assert.strictEqual(facts(washer)['Cycles run'], '212');

    assert.strictEqual(dryer.units[0].status, 'Off');
    assert.strictEqual(facts(dryer)['Time left'], undefined);
    assert.strictEqual(facts(dryer)['Remote start'], 'On');

    assert.strictEqual(fridge.units[0].status, 'Door closed');
    assert.strictEqual(facts(fridge)['Fridge set to'], '37°F');
    assert.strictEqual(facts(fridge)['Freezer set to'], '0°F');
    assert.strictEqual(facts(fridge)['Water filter used'], '4 months');
    assert.strictEqual(facts(fridge)['Fresh air filter'], 'Auto, 80% left');
    assert.strictEqual(facts(fridge)['Quick freeze'], 'On');
  });

  it('reports an open refrigerator door and Celsius set points', () => {
    const card = thinq.normalizeAppliance(
      { deviceId: 'f', deviceInfo: { deviceType: 'DEVICE_REFRIGERATOR' } },
      {
        doorStatus: { locationName: 'MAIN', doorState: 'OPEN' },
        temperatureInUnits: [{ locationName: 'FRIDGE', targetTemperatureC: 3, targetTemperatureF: 37, unit: 'C' }],
      },
    );
    assert.strictEqual(card.units[0].status, 'Door open');
    assert.deepStrictEqual(card.units[0].facts[0], { label: 'Fridge set to', value: '3°C' });
  });

  it('shows both halves of a WashTower', () => {
    const card = thinq.normalizeAppliance(
      { deviceId: 't', deviceInfo: { deviceType: 'DEVICE_WASHTOWER', alias: 'Tower' } },
      { washer: { runState: { currentState: 'SPINNING' } }, dryer: { runState: { currentState: 'END' } } },
    );
    assert.deepStrictEqual(card.units.map((u) => [u.label, u.status]), [['Washer', 'Spinning'], ['Dryer', 'Finished']]);
  });

  it('classifies appliance types, keeping dishwashers out of laundry', () => {
    assert.strictEqual(thinq.applianceKind('DEVICE_WASHER'), 'washer');
    assert.strictEqual(thinq.applianceKind('DEVICE_WASHTOWER_WASHER'), 'washer');
    assert.strictEqual(thinq.applianceKind('DEVICE_WASHCOMBO_MAIN'), 'washer');
    assert.strictEqual(thinq.applianceKind('DEVICE_WASHTOWER_DRYER'), 'dryer');
    assert.strictEqual(thinq.applianceKind('DEVICE_WASHTOWER'), 'washtower');
    assert.strictEqual(thinq.applianceKind('DEVICE_REFRIGERATOR'), 'refrigerator');
    assert.strictEqual(thinq.applianceKind('DEVICE_DISH_WASHER'), 'other');
    assert.strictEqual(thinq.applianceKind('DEVICE_KIMCHI_REFRIGERATOR'), 'other');
  });

  it('keeps showing the others when one appliance is offline', async () => {
    const { baseUrl } = await fakeLgServer({
      errorFor: (url) => (url === '/devices/dryer-id/state' ? { status: 400, code: '1222', message: 'offline' } : null),
    });
    const service = thinq.createThinqService({ configDir: tempConfigDir(), baseUrl, env: {} });
    const { overview } = await service.connect({ token: TOKEN, countryCode: 'US' });
    const dryer = overview.devices.find((d) => d.kind === 'dryer');
    assert.strictEqual(dryer.reachable, false);
    assert.match(dryer.error, /not connected/);
    assert.strictEqual(overview.devices.find((d) => d.kind === 'washer').reachable, true);
  });
});

describe('keeping the token safe', () => {
  it('saves an accepted token in a private file and never returns it', async () => {
    const configDir = tempConfigDir();
    const { baseUrl } = await fakeLgServer();
    const service = thinq.createThinqService({ configDir, baseUrl, env: {} });
    const result = await service.connect({ token: TOKEN, countryCode: 'US' });
    assert.strictEqual(fs.statSync(storePath(configDir)).mode & 0o777, 0o600);
    assert.strictEqual(JSON.parse(fs.readFileSync(storePath(configDir), 'utf8')).token, TOKEN);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    assert.ok(!JSON.stringify(service.getOverview()).includes(TOKEN));
    assert.ok(!JSON.stringify(await service.refresh({ force: true })).includes(TOKEN));
  });

  it('does not save a token LG rejects', async () => {
    const configDir = tempConfigDir();
    const { baseUrl } = await fakeLgServer();
    const service = thinq.createThinqService({ configDir, baseUrl, env: {} });
    const result = await service.connect({ token: 'wrong', countryCode: 'US' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /rejected this token/);
    assert.ok(!result.error.includes('wrong'));
    assert.strictEqual(fs.existsSync(storePath(configDir)), false);
    assert.strictEqual(result.overview.connected, false);
  });

  it('rejects an unsupported country without contacting LG', async () => {
    let called = false;
    const service = thinq.createThinqService({
      configDir: tempConfigDir(),
      env: {},
      fetchImpl: async () => { called = true; return new Response('{}'); },
    });
    const result = await service.connect({ token: TOKEN, countryCode: 'ZZ' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(called, false);
  });

  it('forgets the token and appliances on disconnect', async () => {
    const configDir = tempConfigDir();
    const { baseUrl } = await fakeLgServer();
    const service = thinq.createThinqService({ configDir, baseUrl, env: {} });
    await service.connect({ token: TOKEN, countryCode: 'US' });
    const overview = service.disconnect();
    assert.strictEqual(fs.existsSync(storePath(configDir)), false);
    assert.strictEqual(overview.connected, false);
    assert.deepStrictEqual(overview.devices, []);
  });

  it('is excluded from Config Sync', () => {
    const included = CATEGORIES.flatMap((category) => category.include);
    assert.ok(!included.includes(`config/${thinq.STORE_FILE}`));
    assert.ok(EXCLUDE.includes(`config/${thinq.STORE_FILE}`));
  });
});

describe('staying inside LG rate limits', () => {
  it('reuses recent results unless a refresh is forced', async () => {
    let time = 1_000_000;
    const { baseUrl, requests } = await fakeLgServer();
    const service = thinq.createThinqService({ configDir: tempConfigDir(), baseUrl, env: {}, now: () => time });
    await service.connect({ token: TOKEN, countryCode: 'US' });
    const afterConnect = requests.length;

    await service.refresh();
    assert.strictEqual(requests.length, afterConnect);

    time += thinq.MIN_REFRESH_MS + 1;
    await service.refresh();
    assert.ok(requests.length > afterConnect);

    const afterPoll = requests.length;
    await service.refresh({ force: true });
    assert.ok(requests.length > afterPoll);
  });

  it('backs off for five minutes after LG limits the account, and keeps the last status', async () => {
    let time = 1_000_000;
    let limited = false;
    const { baseUrl, requests } = await fakeLgServer({
      errorFor: () => (limited ? { status: 429, code: '1306', message: 'too many' } : null),
    });
    const service = thinq.createThinqService({ configDir: tempConfigDir(), baseUrl, env: {}, now: () => time });
    await service.connect({ token: TOKEN, countryCode: 'US' });

    limited = true;
    const overview = await service.refresh({ force: true });
    assert.match(overview.error, /limiting requests/);
    assert.strictEqual(overview.devices.length, 3);

    const afterLimit = requests.length;
    time += thinq.RATE_LIMIT_BACKOFF_MS - 1000;
    await service.refresh({ force: true });
    assert.strictEqual(requests.length, afterLimit);

    limited = false;
    time += 2000;
    const recovered = await service.refresh({ force: true });
    assert.ok(requests.length > afterLimit);
    assert.strictEqual(recovered.error, null);
  });

  it('shares one read between overlapping refreshes', async () => {
    const { baseUrl, requests } = await fakeLgServer();
    const service = thinq.createThinqService({ configDir: tempConfigDir(), baseUrl, env: {} });
    await service.connect({ token: TOKEN, countryCode: 'US' });
    const before = requests.length;
    await Promise.all([service.refresh({ force: true }), service.refresh({ force: true })]);
    assert.strictEqual(requests.length - before, 1 + DEVICES.length);
  });
});
