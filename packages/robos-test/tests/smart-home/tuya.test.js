'use strict';

// Feit / Smart Life (Tuya) support: cloud key import, local protocol 3.3 to 3.5,
// and the light-state mapping. A fake Tuya device on 127.0.0.1 plays the bulb.

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const libDir = path.resolve(__dirname, '..', '..', '..', 'robos-lib');
const tuya = require(path.join(libDir, 'tuya.js'));
const sl = require(path.join(libDir, 'smart-light-engine'));

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-tuya-test-'));
after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

const LOCAL_KEY = 'abcdefghijklmnop';
const DEV_ID = 'eb65574abe61544dddvikz';

function ecb(key, data, encrypt, pad = true) {
  const c = encrypt ? crypto.createCipheriv('aes-128-ecb', key, null) : crypto.createDecipheriv('aes-128-ecb', key, null);
  c.setAutoPadding(pad);
  return Buffer.concat([c.update(data), c.final()]);
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const RET_OK = Buffer.alloc(4);
const header = (v) => Buffer.concat([Buffer.from(v), Buffer.alloc(12)]);

/** A Tuya bulb that speaks one protocol version. Records every command it gets. */
function startFakeBulb({ version, key = LOCAL_KEY, dps = { 20: false, 21: 'white', 22: 1000, 23: 0 } }) {
  const local = Buffer.from(key);
  const received = [];
  const server = net.createServer((sock) => {
    let session = null;
    let clientNonce = null;
    let deviceNonce = null;
    let buf = Buffer.alloc(0);
    let seq = 100;
    const v = Number(version);

    const reply = (cmd, plaintext) => {
      seq += 1;
      if (v >= 3.5) {
        sock.write(tuya.encode6699({ seq, cmd, plaintext: Buffer.concat([RET_OK, plaintext]), key: session || local }));
      } else if (v >= 3.4) {
        const k = session || local;
        const body = plaintext.length ? ecb(k, plaintext, true) : Buffer.alloc(0);
        sock.write(tuya.encode55aa({ seq, cmd, payload: Buffer.concat([RET_OK, body]), hmacKey: k }));
      } else {
        let body = plaintext.length ? ecb(local, plaintext, true) : Buffer.alloc(0);
        if (cmd === 8) body = Buffer.concat([header('3.3'), body]);
        sock.write(tuya.encode55aa({ seq, cmd, payload: Buffer.concat([RET_OK, body]) }));
      }
    };

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { frames, rest } = tuya.splitFrames(buf, { hmac: v >= 3.4 && v < 3.5 });
      buf = Buffer.from(rest);
      for (const f of frames) {
        let plain;
        try {
          if (v >= 3.5) {
            plain = tuya.decrypt6699(f, session || local);
          } else if (v >= 3.4) {
            const k = session || local;
            const body = f.raw.subarray(0, f.raw.length - 36);
            assert.ok(hmac(k, body).equals(f.raw.subarray(f.raw.length - 36, f.raw.length - 4)), 'HMAC must match');
            plain = ecb(k, f.body, false);
          } else {
            assert.strictEqual(tuya.crc32(f.raw.subarray(0, f.raw.length - 8)), f.raw.readUInt32BE(f.raw.length - 8));
            const body = f.cmd === 7 ? f.body.subarray(15) : f.body;
            plain = ecb(local, body, false);
          }
        } catch {
          sock.destroy(); // A real bulb hangs up on a frame it cannot read.
          return;
        }
        if (f.cmd === 3) {
          clientNonce = plain;
          deviceNonce = crypto.randomBytes(16);
          reply(4, Buffer.concat([deviceNonce, hmac(local, clientNonce)]));
        } else if (f.cmd === 5) {
          assert.ok(plain.equals(hmac(local, deviceNonce)), 'client must prove it knows the key');
          const mixed = Buffer.from(clientNonce.map((b, i) => b ^ deviceNonce[i]));
          if (v >= 3.5) {
            const c = crypto.createCipheriv('aes-128-gcm', local, clientNonce.subarray(0, 12));
            session = Buffer.concat([c.update(mixed), c.final()]);
          } else {
            session = ecb(local, mixed, true, false);
          }
        } else if (f.cmd === 10 || f.cmd === 16) {
          reply(f.cmd, Buffer.from(JSON.stringify({ devId: DEV_ID, dps })));
        } else if (f.cmd === 7 || f.cmd === 13) {
          const text = plain.toString().replace(/^3\.\d\0{12}/, '');
          const json = JSON.parse(text);
          const changed = json.dps || json.data.dps;
          received.push(changed);
          Object.assign(dps, changed);
          reply(f.cmd, Buffer.alloc(0));
          const status = v >= 3.4 ? { protocol: 4, t: 1, data: { dps: changed } } : { devId: DEV_ID, dps: changed };
          reply(8, Buffer.concat([v >= 3.4 ? header(version) : Buffer.alloc(0), Buffer.from(JSON.stringify(status))]));
        }
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, received, dps, close: () => server.close() }));
  });
}

describe('Tuya local protocol', () => {
  for (const version of ['3.3', '3.4', '3.5']) {
    it(`reads and sets a version ${version} bulb`, async () => {
      const bulb = await startFakeBulb({ version });
      try {
        const dev = new tuya.TuyaLanDevice({ id: DEV_ID, ip: '127.0.0.1', port: bulb.port, localKey: LOCAL_KEY, version, timeoutMs: 2000 });
        await dev.connect();
        const dps = await dev.status();
        assert.strictEqual(dps['20'], false);
        assert.strictEqual(tuya.detectSchema(dps), 'v2');
        await dev.setDps({ 20: true, 22: 500 });
        dev.close();
        assert.deepStrictEqual(bulb.received, [{ 20: true, 22: 500 }]);
      } finally {
        bulb.close();
      }
    });
  }

  it('reports a wrong local key instead of hanging', async () => {
    const bulb = await startFakeBulb({ version: '3.5' });
    try {
      const dev = new tuya.TuyaLanDevice({ id: DEV_ID, ip: '127.0.0.1', port: bulb.port, localKey: 'WRONGKEYWRONGKEY', version: '3.5', timeoutMs: 2000 });
      await assert.rejects(dev.connect(), /local key/);
    } finally {
      bulb.close();
    }
  });

  it('does not mistake the Smart Life app asking for lights for a light', () => {
    const probe = tuya.encode6699({ seq: 0, cmd: 0x25, plaintext: Buffer.from('{"from":"app","ip":"192.168.1.18"}'), key: tuya.BROADCAST_KEY });
    assert.strictEqual(tuya.parseBroadcast(probe, '192.168.1.18'), null);
  });

  it('reads the broadcast a real version 3.5 bulb sends', () => {
    const json = { ip: '192.168.1.11', gwId: DEV_ID, active: 2, encrypt: true, productKey: 'keytfesxxsqewnqy', version: '3.5' };
    const frame = tuya.encode6699({ seq: 0, cmd: 0x13, plaintext: Buffer.concat([RET_OK, Buffer.from(JSON.stringify(json))]), key: tuya.BROADCAST_KEY });
    assert.deepStrictEqual(tuya.parseBroadcast(frame, '192.168.1.11'), {
      id: DEV_ID,
      ip: '192.168.1.11',
      version: '3.5',
      productKey: 'keytfesxxsqewnqy',
    });
  });
});

describe('Tuya light state', () => {
  it('round-trips white light for every data-point layout', () => {
    for (const schema of ['v2', 'v1']) {
      const dps = tuya.dpsFromLight({ on: true, brightness: 50, kelvin: 4000, colorMode: 'kelvin' }, schema);
      assert.deepStrictEqual(tuya.lightFromDps(dps, schema), { on: true, brightness: 50, kelvin: 4000, colorMode: 'kelvin' });
    }
  });

  it('sends color as hue, saturation and brightness', () => {
    const dps = tuya.dpsFromLight({ on: true, brightness: 80, colorMode: 'rgb', colorHex: '#ff8000' }, 'v2');
    assert.deepStrictEqual(dps, { 20: true, 21: 'colour', 24: '001e03e80320' });
    assert.strictEqual(tuya.lightFromDps(dps, 'v2').colorHex, '#ff8000');
  });

  it('turns off with only the switch data point', () => {
    assert.deepStrictEqual(tuya.dpsFromLight({ on: false }, 'v2'), { 20: false });
    assert.deepStrictEqual(tuya.dpsFromLight({ on: false }, 'switch'), { 1: false });
  });
});

/** A stand-in for Tuya's cloud that checks every signature the way Tuya documents it. */
function fakeTuyaCloud({ devices = [], failWith = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, { method, headers }) => {
    const u = new URL(url);
    const urlPath = u.pathname + u.search;
    calls.push(urlPath);
    const token = headers.access_token || '';
    const stringToSign = `${method}\n${crypto.createHash('sha256').update('').digest('hex')}\n\n${urlPath}`;
    const expected = crypto.createHmac('sha256', 'SECRET').update(`ACCESSID${token}${headers.t}${stringToSign}`).digest('hex').toUpperCase();
    const body = (obj) => ({ status: 200, json: async () => obj });
    if (headers.sign !== expected || headers.client_id !== 'ACCESSID') return body({ success: false, code: 1004, msg: 'sign invalid' });
    if (failWith) return body({ success: false, ...failWith });
    if (u.pathname === '/v1.0/token') return body({ success: true, result: { access_token: 'TOKEN1' } });
    if (token !== 'TOKEN1') return body({ success: false, code: 1010, msg: 'token invalid' });
    if (u.pathname === '/v2.0/cloud/thing/device') return body({ success: true, result: devices });
    return body({ success: false, code: 1108, msg: 'uri path invalid' });
  };
  return { fetchImpl, calls };
}

const MORNING_ROOM = { id: DEV_ID, name: 'Morning Room Light', localKey: LOCAL_KEY, category: 'dj', productName: 'Feit A19', isOnline: true };

describe('Tuya cloud import', () => {
  it('lists linked lights, finds them on the network and saves keys only in tuya.json', async () => {
    const configDir = fs.mkdtempSync(path.join(tmpHome, 'cfg-'));
    const cloud = fakeTuyaCloud({ devices: [MORNING_ROOM, { id: 'plug1', name: 'Porch Plug', local_key: 'qrstuvwxyzabcdef', category: 'cz' }] });
    const service = tuya.createTuyaService({
      configDir,
      fetchImpl: cloud.fetchImpl,
      discover: async () => [{ id: DEV_ID, ip: '192.168.1.11', version: '3.5', productKey: 'x' }],
    });
    const res = await service.findLights({ accessId: 'ACCESSID', accessSecret: 'SECRET', region: 'us' });
    assert.strictEqual(res.ok, true, res.error);
    assert.deepStrictEqual(
      res.devices.map((d) => [d.name, d.kind, d.ip, d.version]),
      [
        ['Morning Room Light', 'light', '192.168.1.11', '3.5'],
        ['Porch Plug', 'switch', null, null],
      ]
    );
    assert.ok(!JSON.stringify(res).includes(LOCAL_KEY), 'keys never leave the main process');
    const file = path.join(configDir, 'tuya.json');
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    assert.strictEqual(service.keyFor(DEV_ID), LOCAL_KEY);
    assert.deepStrictEqual(service.getSetup().accessIdEnding, 'SSID');
  });

  it('explains a wrong secret and saves nothing', async () => {
    const configDir = fs.mkdtempSync(path.join(tmpHome, 'cfg-'));
    const service = tuya.createTuyaService({ configDir, fetchImpl: fakeTuyaCloud().fetchImpl, discover: async () => [] });
    const res = await service.findLights({ accessId: 'ACCESSID', accessSecret: 'WRONG', region: 'us' });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /Access ID or Access Secret/);
    assert.strictEqual(fs.existsSync(path.join(configDir, 'tuya.json')), false);
  });

  it('tells the person to add IoT Core when the project lacks it', async () => {
    const configDir = fs.mkdtempSync(path.join(tmpHome, 'cfg-'));
    const service = tuya.createTuyaService({
      configDir,
      fetchImpl: fakeTuyaCloud({ failWith: { code: 28841105, msg: 'No permissions' } }).fetchImpl,
      discover: async () => [],
    });
    const res = await service.findLights({ accessId: 'ACCESSID', accessSecret: 'SECRET', region: 'us' });
    assert.match(res.error, /IoT Core/);
  });
});

describe('Tuya lights in Smart Home', () => {
  it('adds a found light with its real state and sends later changes to the bulb', async () => {
    const configDir = fs.mkdtempSync(path.join(tmpHome, 'cfg-'));
    const bulb = await startFakeBulb({ version: '3.5', dps: { 20: true, 21: 'white', 22: 1000, 23: 1000 } });
    const service = tuya.createTuyaService({
      configDir,
      fetchImpl: fakeTuyaCloud({ devices: [MORNING_ROOM] }).fetchImpl,
      discover: async () => [{ id: DEV_ID, ip: '127.0.0.1', version: '3.5' }],
      connectDevice: (d) => new tuya.TuyaLanDevice({ ...d, port: bulb.port, timeoutMs: 2000 }),
    });
    const engine = sl.createSmartLightEngine({ configDir, apiPort: 0, skipLanNetwork: false, tuya: service });
    try {
      const found = await service.findLights({ accessId: 'ACCESSID', accessSecret: 'SECRET', region: 'us' });
      const added = await engine.addTuyaLights({ devices: found.devices, roomId: 'living-room' });
      assert.strictEqual(added.ok, true, added.error);
      const light = added.overview.lights.find((l) => l.name === 'Morning Room Light');
      assert.deepStrictEqual(
        { protocolId: light.protocolId, ip: light.ip, on: light.on, brightness: light.brightness, kelvin: light.kelvin, schema: light.tuyaSchema },
        { protocolId: 'tuya-lan', ip: '127.0.0.1', on: true, brightness: 100, kelvin: 6500, schema: 'v2' }
      );
      assert.deepStrictEqual(bulb.received, [], 'adding a light must not change it');
      const saved = fs.readFileSync(path.join(configDir, 'smart-lights.json'), 'utf8');
      assert.ok(!saved.includes(LOCAL_KEY), 'smart-lights.json never holds the key');

      const res = await engine.updateLight(light.id, { on: false });
      assert.strictEqual(res.delivered, true, res.error);
      assert.deepStrictEqual(bulb.received, [{ 20: false }]);
    } finally {
      engine.stopScheduler();
      bulb.close();
    }
  });

  it('says so when the bulb does not answer', async () => {
    const configDir = fs.mkdtempSync(path.join(tmpHome, 'cfg-'));
    const service = tuya.createTuyaService({ configDir, connectDevice: (d) => new tuya.TuyaLanDevice({ ...d, port: 1, timeoutMs: 500 }) });
    const engine = sl.createSmartLightEngine({ configDir, apiPort: 0, skipLanNetwork: false, tuya: service });
    try {
      const added = await engine.addOrUpdateLight({ name: 'Lost Bulb', protocolId: 'tuya-lan', ip: '127.0.0.1', deviceKey: DEV_ID, skipSend: true });
      const res = await engine.updateLight(added.light.id, { on: true });
      assert.strictEqual(res.delivered, false);
      assert.match(res.error, /local key|connect|answer/);
    } finally {
      engine.stopScheduler();
    }
  });
});
