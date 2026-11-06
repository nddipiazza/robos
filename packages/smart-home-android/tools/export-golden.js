#!/usr/bin/env node
// Writes what the desktop JavaScript produces for a set of inputs. The Kotlin tests read
// this file, so the phone and desktop stay in step. Rerun after changing the desktop engine:
//   node tools/export-golden.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../../robos-lib/smart-light-engine');
const thinq = require('../../robos-lib/lg-thinq');
const tuyaLib = require('../../robos-lib/tuya');

const PORTS = {
  'wiz-udp': 38899, 'wled-http': 80, 'kasa-lan': 9999, 'hue-rest': 80, 'lifx-udp': 56700,
  'govee-udp': 4003, 'elgato-http': 9123, 'yeelight-tcp': 55443, shelly: 80, 'ha-rest': 8123,
};
const KEYS = { 'hue-rest': 'testuser|3', 'ha-rest': 'light.office|secret-token' };
const SHAPES = [
  { on: true, brightness: 75, colorMode: 'kelvin', colorHex: '#ffb76b', kelvin: 2800, effect: 'solid' },
  { on: true, brightness: 5, colorMode: 'kelvin', colorHex: '#ffffff', kelvin: 6500, effect: 'solid' },
  { on: true, brightness: 100, colorMode: 'rgb', colorHex: '#7c3aed', kelvin: 3200, effect: 'aurora' },
  { on: true, brightness: 42, colorMode: 'rgb', colorHex: '#00bcd4', kelvin: 4000, effect: 'cyberpunk' },
  { on: false, brightness: 42, colorMode: 'rgb', colorHex: '#ef4444', kelvin: 4000, effect: 'breath' },
];

const commands = [];
for (const protocolId of Object.keys(PORTS)) {
  for (const shape of SHAPES) {
    const light = { ...shape, protocolId, ip: '192.168.1.50', port: PORTS[protocolId], deviceKey: KEYS[protocolId] || '' };
    const cmd = engine.buildProtocolCommand(light);
    commands.push({
      light,
      method: cmd.method || null,
      path: cmd.path || null,
      headers: cmd.headers || {},
      payload: cmd.payload,
      binaryHex: cmd.binaryHex || null,
    });
  }
}

const hours = [];
for (let h = 0; h < 24; h += 0.5) hours.push(h);

const appliances = [
  {
    device: { deviceId: 'w1', deviceInfo: { deviceType: 'DEVICE_WASHER', alias: 'Washer', modelName: 'WM4000' } },
    state: [{ runState: { currentState: 'RUNNING' }, timer: { remainHour: 1, remainMinute: 5, totalHour: 0, totalMinute: 50 }, remoteControlEnable: { remoteControlEnabled: true }, cycle: { cycleCount: 12 }, detergent: { detergentSetting: 'NORMAL_LOAD' } }],
  },
  {
    device: { deviceId: 'd1', deviceInfo: { deviceType: 'DEVICE_DRYER', alias: 'Dryer' } },
    state: [{ runState: { currentState: 'END' } }],
  },
  {
    device: { deviceId: 't1', deviceInfo: { deviceType: 'DEVICE_WASHTOWER', alias: 'Tower' } },
    state: { washer: { runState: { currentState: 'INITIAL' } }, dryer: { runState: { currentState: 'POWER_OFF' }, timer: { relativeHourToStop: 2 } } },
  },
  {
    device: { deviceId: 'f1', deviceInfo: { deviceType: 'DEVICE_REFRIGERATOR', alias: 'Fridge', modelName: 'LRF' } },
    state: {
      doorStatus: [{ doorState: 'OPEN' }],
      temperatureInUnits: [{ locationName: 'FRIDGE', unit: 'F', targetTemperatureF: 37 }, { locationName: 'FREEZER', unit: 'C', targetTemperatureC: -18 }],
      waterFilterInfo: { waterFilterState: 'REPLACE', usedTime: 6, unit: 'MONTH' },
      refrigeration: { freshAirFilter: 'ON', freshAirFilterRemainPercent: 40, expressMode: true, rapidFreeze: 'OFF' },
      powerSave: { powerSaveEnabled: false },
    },
  },
  {
    device: { deviceId: 'o1', deviceInfo: { deviceType: 'DEVICE_AIR_CONDITIONER', alias: 'AC' } },
    state: { operation: { airConOperationMode: 'POWER_ON' }, temperature: { currentTemperature: 22 }, nested: { someValue: true } },
  },
  { device: { deviceId: 'x1', deviceInfo: { deviceType: 'DEVICE_DISH_WASHER' } }, state: null, error: 'This appliance is not connected to LG right now.' },
];

// Feit / Smart Life. The JavaScript side was checked against a real Feit bulb (protocol 3.5).
function tuyaGolden() {
  const key = Buffer.from('abcdefghijklmnop');
  const iv = Buffer.from('000102030405060708090a0b', 'hex');
  const dps = [];
  for (const schema of ['v2', 'v1', 'switch']) {
    for (const shape of SHAPES) {
      const out = tuyaLib.dpsFromLight(shape, schema);
      dps.push({ light: shape, schema, dps: out, back: tuyaLib.lightFromDps(out, schema) });
    }
  }
  const plain = Buffer.from('3.5\0\0\0\0\0\0\0\0\0\0\0\0{"protocol":5,"t":1,"data":{"dps":{"20":true}}}');
  const frames = [
    { kind: '6699', seq: 5, cmd: 13, plainHex: plain.toString('hex'), frameHex: tuyaLib.encode6699({ seq: 5, cmd: 13, plaintext: plain, key, iv }).toString('hex') },
    { kind: '55aa-crc', seq: 3, cmd: 10, plainHex: '7b7d', frameHex: tuyaLib.encode55aa({ seq: 3, cmd: 10, payload: Buffer.from('{}') }).toString('hex') },
    { kind: '55aa-hmac', seq: 3, cmd: 16, plainHex: '7b7d', frameHex: tuyaLib.encode55aa({ seq: 3, cmd: 16, payload: Buffer.from('{}'), hmacKey: key }).toString('hex') },
  ];
  const sign = [
    { accessToken: '', t: '1700000000000', method: 'GET', urlPath: '/v1.0/token?grant_type=1' },
    { accessToken: 'TOKEN1', t: '1700000000001', method: 'GET', urlPath: '/v2.0/cloud/thing/device?page_size=20' },
  ].map((c) => ({ ...c, accessId: 'ACCESSID', accessSecret: 'SECRET', sign: tuyaLib.signTuyaRequest({ accessId: 'ACCESSID', accessSecret: 'SECRET', ...c }) }));
  const announce = { ip: '192.168.1.66', gwId: 'eb95f73583c1a3f1a5bedo', active: 2, encrypt: true, productKey: 'keytfesxxsqewnqy', version: '3.5' };
  const announceFrame = tuyaLib.encode6699({ seq: 0, cmd: 0x13, plaintext: Buffer.concat([Buffer.alloc(4), Buffer.from(JSON.stringify(announce))]), key: tuyaLib.BROADCAST_KEY, iv });
  return {
    dps,
    frames,
    sign,
    broadcast: { frameHex: announceFrame.toString('hex'), parsed: tuyaLib.parseBroadcast(announceFrame, '192.168.1.66') },
    sessionKeys: (() => {
      // What both sides derive from the two nonces, for 3.4 (ECB) and 3.5 (GCM).
      const local = Buffer.from('0123456789abcdef');
      const remote = Buffer.from('fedcba9876543210');
      const mixed = Buffer.from(local.map((b, i) => b ^ remote[i]));
      const gcm = require('node:crypto').createCipheriv('aes-128-gcm', key, local.subarray(0, 12));
      return {
        localHex: local.toString('hex'),
        remoteHex: remote.toString('hex'),
        v34Hex: tuyaLib.aesEcb(key, mixed, true, false).toString('hex'),
        v35Hex: Buffer.concat([gcm.update(mixed), gcm.final()]).toString('hex'),
      };
    })(),
  };
}

const golden = {
  colors: {
    hexToRgb: ['#00bcd4', '#abc', 'not-hex', '7c3aed'].map((input) => ({ input, output: engine.hexToRgb(input) })),
    rgbToHsv: ['#00bcd4', '#7c3aed', '#ff0000', '#808080', '#000000', '#ffffff', '#ec4899'].map((input) => ({ input, output: engine.rgbToHsv(engine.hexToRgb(input)) })),
    kelvinToHex: [1800, 2000, 2200, 2700, 3000, 4000, 5200, 6500, 6600, 9000].map((input) => ({ input, output: engine.kelvinToHex(input) })),
  },
  circadian: hours.map((input) => ({ input, output: engine.computeCircadianTarget(input) })),
  kasa: ['{"system":{"get_sysinfo":{}}}', '{"a":1}'].map((input) => ({ input, outputHex: engine.encodeKasaXorPayload(input, false).toString('hex') })),
  commands,
  effects: engine.WLED_EFFECTS.map((e) => ({ id: e.id, code: e.code })),
  scenes: engine.BUILTIN_SCENES.map((s) => ({ id: s.id, preset: s.preset })),
  regions: ['US', 'us', 'DE', 'KR', 'ZZ', 'USA', ''].map((input) => ({ input, output: thinq.regionForCountry(input) })),
  appliances: appliances.map((a) => ({ ...a, output: thinq.normalizeAppliance(a.device, a.state, a.error || null) })),
  tuya: tuyaGolden(),
};

const out = path.join(__dirname, '..', 'app', 'src', 'test', 'resources', 'golden.json');
fs.writeFileSync(out, `${JSON.stringify(golden, null, 1)}\n`);
console.log(`Wrote ${out}`);
