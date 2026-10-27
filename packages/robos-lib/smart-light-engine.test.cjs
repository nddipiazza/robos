'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  kelvinToHex,
  computeCircadianTarget,
  encodeKasaXorPayload,
  decodeKasaXorPayload,
  buildLifxSetColorPacket,
  buildProtocolCommand,
  createSmartLightEngine,
} = require('./smart-light-engine');

test('color, kelvin, Kasa XOR-171, and LIFX binary encoders produce valid wire frames', () => {
  const rgb = hexToRgb('#00bcd4');
  assert.deepEqual(rgb, { r: 0, g: 188, b: 212 });
  assert.equal(rgbToHex(rgb), '#00bcd4');

  const hsv = rgbToHsv(rgb);
  assert.ok(hsv.hue >= 180 && hsv.hue <= 195);
  assert.ok(hsv.saturation > 90);

  const warmHex = kelvinToHex(2400);
  const coolHex = kelvinToHex(5800);
  assert.match(warmHex, /^#[0-9a-f]{6}$/);
  assert.match(coolHex, /^#[0-9a-f]{6}$/);
  assert.notEqual(warmHex, coolHex);

  // Kasa XOR-171 roundtrip
  const originalJson = JSON.stringify({
    'smartlife.iot.smartbulb.lightingservice': {
      transition_light_state: { on_off: 1, brightness: 85, color_temp: 4000 },
    },
  });
  const encrypted = encodeKasaXorPayload(originalJson, false);
  assert.equal(decodeKasaXorPayload(encrypted, false), originalJson);

  const encryptedTcp = encodeKasaXorPayload(originalJson, true);
  assert.equal(encryptedTcp.length, originalJson.length + 4);
  assert.equal(decodeKasaXorPayload(encryptedTcp, true), originalJson);

  // LIFX 49-byte SetColor frame (36-byte header + 13-byte HSBK payload)
  const lifxBuf = buildLifxSetColorPacket({
    hue: 187,
    saturation: 100,
    brightness: 80,
    kelvin: 4500,
  });
  assert.equal(lifxBuf.length, 49);
  assert.equal(lifxBuf.readUInt16LE(0), 49);
  assert.equal(lifxBuf.readUInt16LE(32), 102); // Light::SetColor = 102
});

test('buildProtocolCommand supports WiZ, WLED, Kasa, Hue, LIFX, Govee, Elgato, Yeelight, Shelly, and HA', () => {
  const wizCmd = buildProtocolCommand({
    protocolId: 'wiz-udp',
    ip: '192.168.1.83',
    port: 38899,
    on: true,
    brightness: 75,
    colorMode: 'rgb',
    colorHex: '#00bcd4',
    kelvin: 4000,
  });
  assert.equal(wizCmd.payload.method, 'setPilot');
  assert.equal(wizCmd.payload.params.r, 0);
  assert.equal(wizCmd.payload.params.g, 188);
  assert.equal(wizCmd.payload.params.b, 212);

  const wledCmd = buildProtocolCommand({
    protocolId: 'wled-http',
    ip: '192.168.1.81',
    port: 80,
    on: true,
    brightness: 88,
    colorMode: 'rgb',
    colorHex: '#ec4899',
    effect: 'cyberpunk',
  });
  assert.equal(wledCmd.path, '/json/state');
  assert.equal(wledCmd.payload.seg[0].fx, 63);
});

test('SmartLightEngine manages rooms, lights, scenes, AI mood synthesis, circadian curves, schedules, and CI sync', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-smart-light-test-'));
  const engine = createSmartLightEngine({
    configDir: tmpDir,
    skipLanNetwork: true,
    apiPort: 0,
  });

  const initial = engine.getOverview();
  assert.ok(initial.lights.length >= 6);
  assert.ok(initial.rooms.length >= 5);
  assert.ok(initial.protocols.length >= 10);

  // Update a light
  const firstId = initial.lights[0].id;
  const upd = await engine.updateLight(firstId, {
    on: true,
    brightness: 64,
    colorMode: 'rgb',
    colorHex: '#22c55e',
    effect: 'aurora',
  });
  assert.equal(upd.ok, true);
  assert.equal(upd.light.brightness, 64);
  assert.equal(upd.light.colorHex, '#22c55e');
  assert.ok(upd.overview.protocolLog.length >= 1);

  // Add a new light
  const added = await engine.addOrUpdateLight({
    name: 'Arcade Marquee Strip',
    roomId: 'basement',
    protocolId: 'wled-http',
    formFactor: 'strip',
    ip: '192.168.1.95',
  });
  assert.equal(added.ok, true);
  assert.equal(added.overview.lights.length, initial.lights.length + 1);

  // Apply built-in scene
  const sceneRes = await engine.applyScene('scene-cyberpunk', 'all');
  assert.equal(sceneRes.ok, true);
  assert.equal(sceneRes.overview.activeSceneId, 'scene-cyberpunk');

  // Synthesize AI mood scene
  const aiRes = await engine.designSceneWithAi({
    prompt: 'D&D dungeon dragon boss battle',
    roomScope: 'studio',
  });
  assert.equal(aiRes.ok, true);
  assert.match(aiRes.scene.name, /Dragon|dungeon/i);

  // Circadian curve at solar noon (12:00) vs deep night (02:00)
  const noon = computeCircadianTarget(12);
  const night = computeCircadianTarget(2);
  assert.ok(noon.kelvin > 5400);
  assert.ok(night.kelvin <= 2300);

  const circRes = await engine.applyCircadianHour(12, true);
  assert.equal(circRes.ok, true);
  assert.equal(circRes.overview.circadianEnabled, true);

  // CI Status Light Bar sync
  const ciRes = await engine.triggerCiStatusLight({ status: 'failing' });
  assert.equal(ciRes.ok, true);
  assert.equal(ciRes.ciStatus.colorHex, '#ef4444');

  // Local HTTP Control Server
  const srvInfo = await engine.startApiServer();
  assert.equal(srvInfo.ok, true);
  assert.ok(srvInfo.port > 0);
  await engine.stopApiServer();

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
