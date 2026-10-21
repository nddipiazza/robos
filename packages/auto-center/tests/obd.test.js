'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { Elm327, frames, decodeDtcs, decodeVin, decodePid, supportedFrom, vinYear, adapterError } = require('../lib/obd');
const { ObdLink, ADAPTER_NAME } = require('../lib/obd-link');
const fixture = name => path.join(__dirname, 'fixtures/obd', name);

test('real Grand Caravan capture: protocol, VIN, no codes and live readings', async () => {
  const link = new ObdLink({ replay: fixture('grand-caravan-2014.json') });
  assert.deepEqual(await link.scan(), [{ name: 'vLinker MC-Android', address: 'C4:57:46:DC:88:40' }]);
  const s = await link.connect({ address: 'C4:57:46:DC:88:40', name: 'vLinker MC-Android' });
  assert.equal(s.adapter.version, 'ELM327 v2.2'); assert.equal(s.adapter.voltage, 14.7);
  assert.equal(s.vehicle.connected, true); assert.equal(s.vehicle.protocol, '6'); assert.match(s.vehicle.protocolName, /CAN \(11 bit, 500/);
  const codes = await link.readCodes();
  assert.equal(codes.vin, '2C4RDGCG4ER100001'); assert.equal(codes.modelYear, 2014);
  assert.equal(codes.mil, false); assert.equal(codes.reportedCount, 0);
  assert.deepEqual([codes.stored, codes.pending, codes.permanent], [[], [], []]);
  const live = Object.fromEntries((await link.live()).readings.map(r => [r.id, r]));
  assert.equal(live.rpm.value, 1027); assert.equal(live.coolant.display, '68 °F (20 °C)'); assert.equal(live.speed.display, '0 mph');
  assert.equal(live.voltage.value, 14.47); assert.equal(live.fuel.value, 35);
});

test('real warm-engine capture: every live reading the van supports', async () => {
  const link = new ObdLink({ replay: fixture('grand-caravan-2014-warm.json') }); await link.connect({});
  const live = Object.fromEntries((await link.live()).readings.map(r => [r.id, r.display]));
  assert.deepEqual(live, { rpm: '628 rpm', speed: '0 mph', coolant: '216 °F (102 °C)', voltage: '14.45 V', load: '27 %', throttle: '12 %', fuel: '32 %', intake: '100 °F (38 °C)', stft1: '1.6 %', ltft1: '0 %', runtime: '17 min 12 s' });
});

test('real 2005 Accord on ISO 9141-2: legacy framing, multi-line VIN, "NO DATA" means no codes', async () => {
  const link = new ObdLink({ replay: fixture('accord-2005-iso9141.json') });
  const s = await link.connect({});
  assert.equal(s.vehicle.protocol, '3'); assert.equal(s.vehicle.protocolName, 'ISO 9141-2');
  const codes = await link.readCodes();
  assert.equal(codes.vin, '1HGCM66585A000001'); assert.equal(codes.modelYear, 2005);
  assert.equal(codes.mil, false); assert.deepEqual([codes.stored, codes.pending, codes.permanent], [[], [], []]);
  const live = Object.fromEntries((await link.live()).readings.map(r => [r.id, r.display]));
  assert.deepEqual(live, { rpm: '785 rpm', speed: '0 mph', coolant: '154 °F (68 °C)', load: '38 %', throttle: '16 %', intake: '86 °F (30 °C)', stft1: '-2.3 %', ltft1: '-8.6 %' });
});

test('codes, pending codes and clearing them', async () => {
  const link = new ObdLink({ replay: fixture('grand-caravan-2014-codes.json') }); await link.connect({ name: 'vLinker MC-Android' });
  const before = await link.readCodes();
  assert.equal(before.mil, true); assert.equal(before.reportedCount, 2);
  assert.deepEqual(before.stored.map(c => c.code), ['P0133', 'P0420']); assert.equal(before.stored[0].module, 'Engine');
  assert.deepEqual(before.pending.map(c => c.code), ['P0442']);
  const after = await link.clearCodes();
  assert.equal(after.mil, false); assert.deepEqual(after.stored, []);
});

test('the car not answering is reported, not thrown', async () => {
  const elm = new Elm327({ send: async c => c === 'ATZ' ? 'ELM327 v2.2' : c === '0100' ? 'SEARCHING...\rUNABLE TO CONNECT\r\r' : c === 'ATRV' ? '12.1V' : 'OK' });
  const r = await elm.init();
  assert.deepEqual(r, { adapter: { version: 'ELM327 v2.2', voltage: 12.1 }, vehicle: { connected: false, error: 'UNABLE TO CONNECT' } });
  const link = new ObdLink(); link.elm = elm; link.state = { vehicle: r.vehicle };
  await assert.rejects(link.readCodes(), /Turn the key to ON/);
});

test('a device that is not an ELM327 is refused', async () => {
  await assert.rejects(new Elm327({ send: async () => 'hello' }).init(), /not like an ELM327/);
});

test('framing: 29-bit CAN, several modules, and the older buses', () => {
  // Engine and transmission both answer mode 03 on 11-bit CAN.
  const two = '7E806430201330420\r7E9044301 0700\r';
  assert.deepEqual(decodeDtcs(two, '6', 3), [{ code: 'P0133', module: 'Engine' }, { code: 'P0420', module: 'Engine' }, { code: 'P0700', module: 'Transmission' }]);
  // 29-bit CAN headers.
  assert.deepEqual(decodePid('18DAF11004410C1AF8', '7', 0x0C), [0x1A, 0xF8]);
  assert.deepEqual(decodeDtcs('18DAF11806430101C1D100', '7', 3), [{ code: 'P01C1', module: 'Transmission' }, { code: 'U1100', module: 'Transmission' }]);
  // ISO 9141 / J1850: 3 header bytes, trailing checksum, three code slots per line.
  assert.deepEqual(decodePid('BUS INIT: ...OK\r486B10410C1AF8A1\r', '3', 0x0C), [0x1A, 0xF8]);
  assert.deepEqual(decodeDtcs('486B104301330420000044\r', '3', 3).map(c => c.code), ['P0133', 'P0420']);
  const padded = '000000' + Buffer.from('1G1JC5444R7252367').toString('hex').toUpperCase();
  const legacyVin = [0, 1, 2, 3, 4].map(i => '486B10' + '4902' + '0' + (i + 1) + padded.slice(i * 8, i * 8 + 8) + 'CC').reverse().join('\r');
  assert.equal(decodeVin(legacyVin, '3'), '1G1JC5444R7252367');
  assert.equal(frames('7E8101449020131474A\r7E8214335343434523732\r7E822353233363738\r', '6').get('7E8')[0].length, 20);
  assert.equal(adapterError('BUS INIT: ...OK'), null); assert.equal(adapterError('BUS INIT: ...ERROR'), 'BUS INIT ERROR');
});

test('supported PID bitmaps and VIN model years', () => {
  const s = supportedFrom(0, [0xBF, 0xBE, 0xB9, 0x93]);
  for (const pid of [0x01, 0x05, 0x0C, 0x0D, 0x11, 0x1F, 0x20]) assert.ok(s.has(pid), 'has ' + pid.toString(16));
  assert.ok(!s.has(0x10)); assert.ok(!s.has(0x02));
  assert.equal(vinYear('2C4RDGCG4ER100001'), 2014); assert.equal(vinYear('1G1JC5444R7252367'), 1994); assert.equal(vinYear('bad'), null);
});

test('adapter names that are offered after a scan', () => {
  for (const n of ['vLinker MC-Android', 'OBDII', 'OBDLink MX+', 'Vgate iCar Pro', 'V-LINK']) assert.ok(ADAPTER_NAME.test(n), n);
  for (const n of ['[TV] Samsung 8 Series (65)', 'Govee_H6173_7B5D', 'M720 Triathlon']) assert.ok(!ADAPTER_NAME.test(n), n);
});
