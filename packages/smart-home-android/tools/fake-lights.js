#!/usr/bin/env node
// Pretends to be one light of every kind, on this computer, for the emulator tests.
// The emulator reaches this computer at 10.0.2.2. Nothing listens beyond 127.0.0.1.
//
//   GET  :19300/packets      everything received so far
//   POST :19300/reset        forget it, and let go of the Hue link button
//   POST :19300/press-link   press the Hue Bridge's link button
'use strict';
const dgram = require('node:dgram');
const http = require('node:http');
const net = require('node:net');

const HOST = '127.0.0.1';
const PORTS = { control: 19300, hue: 19301, wled: 19302, shelly: 19303, ha: 8123, elgato: 9123, wiz: 38899, kasa: 9999, lifx: 56700, govee: 4003, yeelight: 55443 };
let packets = [];
let linkPressed = false;

function record(protocol, data) {
  packets.push({ protocol, at: Date.now(), ...data });
}

function kasaDecode(buf) {
  let key = 171;
  let out = '';
  for (const c of buf) {
    out += String.fromCharCode(key ^ c);
    key = c;
  }
  return out;
}

function kasaEncode(text) {
  let key = 171;
  return Buffer.from([...text].map((ch) => (key ^= ch.charCodeAt(0))));
}

function udp(protocol, port, handler) {
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg, from) => {
    const reply = handler(msg);
    if (reply) socket.send(reply, from.port, from.address);
  });
  socket.bind(port, HOST);
}

udp('wiz', PORTS.wiz, (msg) => {
  record('wiz', { json: JSON.parse(msg.toString()) });
  return Buffer.from('{"method":"setPilot","result":{"success":true}}');
});
udp('kasa', PORTS.kasa, (msg) => {
  record('kasa', { json: JSON.parse(kasaDecode(msg)) });
  return kasaEncode('{"smartlife.iot.smartbulb.lightingservice":{"transition_light_state":{"err_code":0}}}');
});
udp('lifx', PORTS.lifx, (msg) => {
  record('lifx', { type: msg.readUInt16LE(32), hex: msg.toString('hex') });
  const ack = Buffer.alloc(36);
  ack.writeUInt16LE(36, 0);
  ack.writeUInt16LE(45, 32);
  return ack;
});
udp('govee', PORTS.govee, (msg) => {
  record('govee', { json: JSON.parse(msg.toString()) });
  return null;
});

net.createServer((socket) => {
  socket.on('error', () => {});
  socket.on('data', (data) => {
    for (const line of data.toString().split('\r\n').filter(Boolean)) record('yeelight', { json: JSON.parse(line) });
  });
}).listen(PORTS.yeelight, HOST);

function httpLight(protocol, port, answer) {
  http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = body ? JSON.parse(body) : null;
      const { status = 200, reply = {} } = answer(req, json) || {};
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  }).listen(port, HOST);
}

for (const [protocol, port] of [['wled', PORTS.wled], ['shelly', PORTS.shelly], ['elgato', PORTS.elgato]]) {
  httpLight(protocol, port, (req, json) => {
    record(protocol, { method: req.method, path: req.url, json });
  });
}

httpLight('ha', PORTS.ha, (req, json) => {
  record('ha', { method: req.method, path: req.url, json, auth: req.headers.authorization || null });
  if (req.headers.authorization !== 'Bearer test-token') return { status: 401, reply: { message: 'unauthorized' } };
  return { reply: [] };
});

const HUE_USER = 'fake-hue-username';
httpLight('hue', PORTS.hue, (req, json) => {
  record('hue', { method: req.method, path: req.url, json });
  if (req.method === 'POST' && req.url === '/api') {
    if (!linkPressed) return { reply: [{ error: { type: 101, address: '', description: 'link button not pressed' } }] };
    return { reply: [{ success: { username: HUE_USER } }] };
  }
  if (req.method === 'GET' && req.url === `/api/${HUE_USER}/lights`) {
    return {
      reply: {
        1: { name: 'Hue Sofa Lamp', type: 'Extended color light', productname: 'Hue color lamp', state: { on: true, bri: 127 } },
        2: { name: 'Hue TV Strip', type: 'Color light', productname: 'Hue lightstrip plus', state: { on: false, bri: 254 } },
      },
    };
  }
  if (req.url.startsWith(`/api/${HUE_USER}/`)) return { reply: [{ success: { ok: true } }] };
  return { reply: [{ error: { type: 1, address: req.url, description: 'unauthorized user' } }] };
});

http.createServer((req, res) => {
  const send = (value) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  if (req.url === '/packets') return send(packets);
  if (req.url === '/reset') {
    packets = [];
    linkPressed = false;
    return send({ ok: true });
  }
  if (req.url === '/press-link') {
    linkPressed = true;
    return send({ ok: true });
  }
  res.writeHead(404);
  return res.end();
}).listen(PORTS.control, HOST, () => console.log(`Fake lights ready on ${HOST}:${PORTS.control}`));
