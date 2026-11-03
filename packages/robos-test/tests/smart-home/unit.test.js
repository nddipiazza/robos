'use strict';

// Unit tests for robos-lib/smart-light-engine and the Smart Light dashboard widget:
// Hue link-button pairing (failures leave the lights alone; a real bridge username
// is saved), the once-a-minute schedule runner (day/time matching, once per day,
// fades, stop on quit) and the smart-lights widget counts in dashboard-engine.
//
// No LAN traffic: the "bridge" is a local HTTP server on 127.0.0.1, or a closed
// local port. HOME and ROBOS_CONFIG_DIR point at a temp dir for the whole file.

const { describe, it, after, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-smart-light-home-'));
process.env.HOME = tmpHome;
process.env.ROBOS_CONFIG_DIR = path.join(tmpHome, '.config', 'robos');

const libDir = path.resolve(__dirname, '..', '..', '..', 'robos-lib');
const sl = require(path.join(libDir, 'smart-light-engine'));
const dashboard = require(path.join(libDir, 'dashboard-engine'));

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});
after(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

function tempConfigDir() {
  const dir = fs.mkdtempSync(path.join(tmpHome, 'cfg-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeEngine(opts = {}) {
  const configDir = opts.configDir || tempConfigDir();
  const engine = sl.createSmartLightEngine({ configDir, apiPort: 0, skipLanNetwork: true, ...opts });
  cleanups.push(() => engine.stopScheduler());
  return { engine, configDir };
}

function hueLights(overview) {
  return overview.lights
    .filter((l) => l.protocolId === 'hue-rest')
    .map((l) => ({ id: l.id, ip: l.ip, port: l.port, deviceKey: l.deviceKey }));
}

function savedHueLights(configDir) {
  const saved = JSON.parse(fs.readFileSync(path.join(configDir, 'smart-lights.json'), 'utf8'));
  return hueLights(saved);
}

function closedPort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// A stand-in Hue Bridge on 127.0.0.1 that answers POST /api with `reply`.
function fakeBridge(reply) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      cleanups.push(() => new Promise((r) => server.close(() => r())));
      resolve({ port: server.address().port, requests });
    });
  });
}

describe('Hue Bridge pairing', () => {
  it('returns ok:false and leaves light keys unchanged when the bridge is unreachable', async () => {
    const { engine, configDir } = makeEngine({ skipLanNetwork: false });
    const before = hueLights(engine.getOverview());
    assert.ok(before.length >= 1, 'seed data includes a Hue light');

    const port = await closedPort();
    const res = await engine.pairHueBridge({ bridgeIp: '127.0.0.1', bridgePort: port });

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.livePaired, false);
    assert.strictEqual(res.reason, 'unreachable');
    assert.match(res.error, /Could not reach a Hue Bridge at 127\.0\.0\.1/);
    assert.strictEqual(res.hueUsername, undefined);
    assert.deepStrictEqual(hueLights(engine.getOverview()), before);
    assert.deepStrictEqual(savedHueLights(configDir), before);
  });

  it("passes on the bridge's 'link button not pressed' error and changes nothing", async () => {
    const bridge = await fakeBridge([
      { error: { type: 101, address: '', description: 'link button not pressed' } },
    ]);
    const { engine, configDir } = makeEngine({ skipLanNetwork: false });
    const before = hueLights(engine.getOverview());

    const res = await engine.pairHueBridge({ bridgeIp: '127.0.0.1', bridgePort: bridge.port });

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'link-button-not-pressed');
    assert.match(res.error, /link button not pressed/);
    assert.match(res.error, /Press the round link button/);
    assert.deepStrictEqual(hueLights(engine.getOverview()), before);
    assert.deepStrictEqual(savedHueLights(configDir), before);
    assert.strictEqual(bridge.requests.length, 1);
  });

  it('saves the username a bridge returns into every Hue light', async () => {
    const bridge = await fakeBridge([{ success: { username: 'bridge-user-1a2b3c' } }]);
    const { engine, configDir } = makeEngine({ skipLanNetwork: false });
    const before = hueLights(engine.getOverview());

    const res = await engine.pairHueBridge({ bridgeIp: '127.0.0.1', bridgePort: bridge.port });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.livePaired, true);
    assert.strictEqual(res.simulated, false);
    assert.strictEqual(res.hueUsername, 'bridge-user-1a2b3c');
    assert.strictEqual(res.updatedCount, before.length);

    const req = bridge.requests[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/api');
    assert.deepStrictEqual(JSON.parse(req.body), { devicetype: 'robos#smart-light' });

    for (const light of savedHueLights(configDir)) {
      assert.strictEqual(light.ip, '127.0.0.1');
      assert.strictEqual(light.port, bridge.port);
      assert.match(light.deviceKey, /^bridge-user-1a2b3c\|\w+$/);
    }

    // The command for that light now uses the real username.
    const hueLight = engine.getOverview().lights.find((l) => l.protocolId === 'hue-rest');
    const cmd = sl.buildProtocolCommand(hueLight);
    assert.match(cmd.path, /^\/api\/bridge-user-1a2b3c\/lights\//);
  });

  it('labels pairing as simulated when LAN traffic is disabled (test/demo mode)', async () => {
    const { engine } = makeEngine({ skipLanNetwork: true });
    const res = await engine.pairHueBridge({ bridgeIp: '192.168.1.87' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.simulated, true);
    assert.strictEqual(res.livePaired, false);
    assert.match(res.hueUsername, /^robos-hue-sim-/);
  });
});

describe('schedule runner', () => {
  // 2026-01-05 is a Monday.
  const at = (day, hh, mm) => new Date(2026, 0, 5 + day, hh, mm, 0);

  function scheduledEngine(clock, opts = {}) {
    const made = makeEngine({ now: () => clock.date, ...opts });
    for (const s of made.engine.getOverview().schedules) made.engine.removeSchedule(s.id);
    return made;
  }

  it('fires a matching schedule exactly once per day and skips other days', async () => {
    assert.strictEqual(at(0, 7, 0).getDay(), 1);
    const clock = { date: at(0, 6, 59) };
    const { engine, configDir } = scheduledEngine(clock);
    const { schedule } = engine.addOrUpdateSchedule({
      name: 'Monday goodnight',
      time: '07:00',
      days: ['Mon'],
      sceneId: 'scene-goodnight',
      roomScope: 'all',
      fadeMinutes: 0,
    });
    await engine.setRoomState('all', { on: true });

    assert.deepStrictEqual((await engine.runDueSchedules()).fired, [], 'not yet 07:00');

    clock.date = at(0, 7, 0);
    assert.deepStrictEqual((await engine.runDueSchedules()).fired, [schedule.id]);
    const ov = engine.getOverview();
    assert.strictEqual(ov.activeSceneId, 'scene-goodnight');
    assert.ok(ov.lights.filter((l) => l.roomId !== 'bedroom').every((l) => !l.on), 'goodnight turned lights off');

    clock.date = at(0, 7, 1);
    assert.deepStrictEqual((await engine.runDueSchedules()).fired, [], 'already ran today');
    clock.date = at(0, 7, 2);
    assert.deepStrictEqual((await engine.runDueSchedules()).fired, []);

    // A fresh engine on the same state (app restart) does not fire it again today.
    const restarted = makeEngine({ configDir, now: () => clock.date }).engine;
    assert.deepStrictEqual((await restarted.runDueSchedules()).fired, []);

    for (let day = 1; day <= 6; day += 1) {
      clock.date = at(day, 7, 0);
      assert.deepStrictEqual((await engine.runDueSchedules()).fired, [], `skips day +${day}`);
    }

    clock.date = at(7, 7, 0); // next Monday
    assert.deepStrictEqual((await engine.runDueSchedules()).fired, [schedule.id]);
  });

  it('ignores disabled schedules and times outside the catch-up window', async () => {
    const clock = { date: at(0, 9, 0) };
    const { engine } = scheduledEngine(clock);
    engine.addOrUpdateSchedule({ name: 'Off', time: '09:00', days: ['Mon'], enabled: false, fadeMinutes: 0 });
    engine.addOrUpdateSchedule({ name: 'Earlier', time: '08:00', days: ['Mon'], fadeMinutes: 0 });
    assert.deepStrictEqual((await engine.runDueSchedules()).fired, []);

    // A check delayed by a couple of minutes still runs it.
    const { schedule } = engine.addOrUpdateSchedule({ name: 'Late', time: '08:58', days: ['Mon'], fadeMinutes: 0 });
    assert.deepStrictEqual((await engine.runDueSchedules()).fired, [schedule.id]);
  });

  it('steps a fade over the fade window and ends on the scene', async () => {
    const sleeps = [];
    const timers = {
      setTimeout: (fn, ms) => {
        sleeps.push(ms);
        return setImmediate(fn);
      },
      clearTimeout: (h) => clearImmediate(h),
    };
    const clock = { date: at(0, 7, 0) };
    const { engine } = scheduledEngine(clock, { timers });
    await engine.setRoomState('bedroom', { on: false });
    engine.addOrUpdateSchedule({
      name: 'Sunrise',
      time: '07:00',
      days: ['Mon'],
      roomScope: 'bedroom',
      sceneId: 'scene-deep-focus',
      fadeMinutes: 2,
    });

    const run = await engine.runDueSchedules();
    assert.strictEqual(run.fired.length, 1);
    await Promise.all(run.fades);

    // 2 minutes at one step per 30 s: 4 steps, 3 waits of 30 s between them.
    assert.deepStrictEqual(sleeps, [30000, 30000, 30000]);
    const scene = engine.getOverview().scenes.find((s) => s.id === 'scene-deep-focus');
    for (const light of engine.getOverview().lights.filter((l) => l.roomId === 'bedroom')) {
      assert.strictEqual(light.on, true);
      assert.strictEqual(light.brightness, scene.preset.brightness);
    }
  });

  it('startScheduler checks once a minute and stopScheduler clears the timer and running fades', async () => {
    const calls = { setInterval: [], clearInterval: 0, pendingTimeouts: 0 };
    const timers = {
      setInterval: (fn, ms) => {
        calls.setInterval.push(ms);
        return { fn };
      },
      clearInterval: () => {
        calls.clearInterval += 1;
      },
      // Fade steps never come due on their own here.
      setTimeout: () => {
        calls.pendingTimeouts += 1;
        return {};
      },
      clearTimeout: () => {},
    };
    const clock = { date: at(0, 7, 0) };
    const { engine } = scheduledEngine(clock, { timers });
    engine.addOrUpdateSchedule({ name: 'Wake', time: '07:00', days: ['Mon'], roomScope: 'bedroom', fadeMinutes: 10 });

    engine.startScheduler();
    assert.deepStrictEqual(calls.setInterval, [sl.SCHEDULER_INTERVAL_MS]);
    assert.strictEqual(sl.SCHEDULER_INTERVAL_MS, 60000);
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(calls.pendingTimeouts, 1, 'the immediate first check started the fade');
    assert.ok(engine.getOverview().schedules[0].lastAutoRunDate);

    engine.stopScheduler();
    assert.strictEqual(calls.clearInterval, 1);
    // Starting again after a stop installs a new interval; stopping twice is harmless.
    engine.startScheduler();
    engine.stopScheduler();
    engine.stopScheduler();
    assert.strictEqual(calls.setInterval.length, 2);
  });
});

describe('dashboard smart-lights widget', () => {
  it('counts the lights and reports the active scene from the engine overview', async () => {
    const { engine, configDir } = makeEngine();
    await engine.applyScene('scene-cyberpunk', 'all');
    const all = engine.getOverview().lights;
    await engine.updateLight(all[0].id, { on: false });
    await engine.updateLight(all[1].id, { on: false });
    const ov = engine.getOverview();
    const onCount = ov.lights.filter((l) => l.on).length;

    const data = dashboard.collectSupplementalWidgetData({ configDir, repoDir: configDir }).smartLights;
    assert.strictEqual(data.bulbsCount, ov.lights.length);
    assert.strictEqual(data.onlineCount, onCount);
    assert.ok(data.bulbsCount > onCount && onCount > 0);
    assert.strictEqual(data.roomsCount, ov.rooms.length);
    assert.strictEqual(data.activeSceneId, 'scene-cyberpunk');
    assert.strictEqual(data.activeScene, 'RobOS Cyberpunk Arcade');
    assert.strictEqual(data.bulbs[0].on, false);
    assert.ok(data.bulbs[0].room && data.bulbs[0].protocol);

    const html = dashboard.renderDashboardTvWallboardHtml({
      resolvedDashboard: {
        dashboard: {
          ...dashboard.DEFAULT_DASHBOARDS[0],
          cards: [{ id: 'c1', title: 'Lights', widgetType: 'smart-lights', liveData: data }],
        },
      },
    });
    assert.ok(html.includes(`${onCount}/${ov.lights.length} Bulbs On`));
    assert.ok(html.includes('RobOS Cyberpunk Arcade'));
  });

  it('reports no lights (and creates no state) when Smart Light has never saved any', () => {
    const configDir = tempConfigDir();
    const data = dashboard.collectSupplementalWidgetData({ configDir, repoDir: configDir }).smartLights;
    assert.strictEqual(data.bulbsCount, 0);
    assert.strictEqual(data.onlineCount, 0);
    assert.deepStrictEqual(data.bulbs, []);
    assert.strictEqual(fs.existsSync(path.join(configDir, 'smart-lights.json')), false);
  });
});
