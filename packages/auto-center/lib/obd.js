'use strict';
// OBD-II over an ELM327-compatible adapter (vLinker, OBDLink, Veepeak, ...). The transport only moves text:
// send(command, timeoutMs) resolves with everything the adapter printed before its '>' prompt.
// This module frames the replies (CAN 11/29-bit and the older J1850 / ISO 9141 / KWP buses) and decodes them.
const PROTOCOLS = { 1: 'SAE J1850 PWM', 2: 'SAE J1850 VPW', 3: 'ISO 9141-2', 4: 'ISO 14230-4 KWP (5 baud init)', 5: 'ISO 14230-4 KWP (fast init)', 6: 'ISO 15765-4 CAN (11 bit, 500 kbaud)', 7: 'ISO 15765-4 CAN (29 bit, 500 kbaud)', 8: 'ISO 15765-4 CAN (11 bit, 250 kbaud)', 9: 'ISO 15765-4 CAN (29 bit, 250 kbaud)', A: 'SAE J1939 CAN' };
const ERRORS = [['UNABLE TO CONNECT', /UNABLE TO CONNECT/], ['NO DATA', /NO DATA/], ['CAN ERROR', /CAN ERROR/], ['BUS ERROR', /BUS ERROR/], ['BUS BUSY', /BUS BUSY/], ['BUS INIT ERROR', /BUS INIT:[\s.]*ERROR/], ['DATA ERROR', /DATA ERROR/], ['BUFFER FULL', /BUFFER FULL/], ['FB ERROR', /FB ERROR/], ['LV RESET', /LV RESET/], ['STOPPED', /STOPPED/], ['ERROR', /\bERR\d+/]];
const fToC = c => Math.round(c * 9 / 5 + 32);
const word = d => d[0] * 256 + d[1];
// Mode 01 readings shown as live data. bytes = data length after the PID byte.
const LIVE = [
  { pid: 0x0C, id: 'rpm', label: 'Engine speed', bytes: 2, unit: 'rpm', value: d => Math.round(word(d) / 4) },
  { pid: 0x0D, id: 'speed', label: 'Vehicle speed', bytes: 1, unit: 'km/h', value: d => d[0], display: v => `${Math.round(v / 1.609344)} mph` },
  { pid: 0x05, id: 'coolant', label: 'Coolant temperature', bytes: 1, unit: '°C', value: d => d[0] - 40, display: v => `${fToC(v)} °F (${v} °C)` },
  { pid: 0x42, id: 'voltage', label: 'Battery / module voltage', bytes: 2, unit: 'V', value: d => Math.round(word(d) / 10) / 100 },
  { pid: 0x04, id: 'load', label: 'Engine load', bytes: 1, unit: '%', value: d => Math.round(d[0] * 100 / 255) },
  { pid: 0x11, id: 'throttle', label: 'Throttle position', bytes: 1, unit: '%', value: d => Math.round(d[0] * 100 / 255) },
  { pid: 0x2F, id: 'fuel', label: 'Fuel level', bytes: 1, unit: '%', value: d => Math.round(d[0] * 100 / 255) },
  { pid: 0x0F, id: 'intake', label: 'Intake air temperature', bytes: 1, unit: '°C', value: d => d[0] - 40, display: v => `${fToC(v)} °F (${v} °C)` },
  { pid: 0x06, id: 'stft1', label: 'Short-term fuel trim (bank 1)', bytes: 1, unit: '%', value: d => Math.round((d[0] - 128) * 1000 / 128) / 10 },
  { pid: 0x07, id: 'ltft1', label: 'Long-term fuel trim (bank 1)', bytes: 1, unit: '%', value: d => Math.round((d[0] - 128) * 1000 / 128) / 10 },
  { pid: 0x1F, id: 'runtime', label: 'Time since engine start', bytes: 2, unit: 's', value: d => word(d), display: v => `${Math.floor(v / 60)} min ${v % 60} s` },
];
const hexBytes = s => (s.match(/../g) || []).map(h => parseInt(h, 16));
const lines = raw => String(raw || '').split(/[\r\n]+/).map(l => l.replace(/\s+/g, '').toUpperCase()).filter(l => l && l !== '>');
function adapterError(raw) {
  const text = String(raw || '').toUpperCase();
  return (ERRORS.find(([, re]) => re.test(text)) || [null])[0];
}
// Group the adapter's lines into one byte message per ECU (CAN reassembles multi-frame ISO-TP replies), or
// one message per line on the older buses where each line is a complete frame.
function frames(raw, protocol) {
  const p = String(protocol || '').replace(/^A/, ''), can = /^[6-9]$/.test(p), header = p === '7' || p === '9' ? 8 : can ? 3 : 6;
  const out = new Map(), add = (ecu, m) => (out.get(ecu) || out.set(ecu, []).get(ecu)).push(m), partial = new Map();
  for (const l of lines(raw)) {
    if (!/^[0-9A-F]+$/.test(l) || l.length <= header) continue;
    const ecu = can ? l.slice(0, header) : l.slice(4, 6), bytes = hexBytes(l.slice(header));
    if (!can) { add(ecu, bytes.slice(0, -1)); continue; } // drop the legacy checksum
    const type = bytes[0] >> 4;
    if (type === 0) add(ecu, bytes.slice(1, 1 + (bytes[0] & 0x0F)));
    else if (type === 1) partial.set(ecu, { length: ((bytes[0] & 0x0F) << 8) | bytes[1], data: bytes.slice(2) });
    else if (type === 2 && partial.has(ecu)) { const m = partial.get(ecu); m.data.push(...bytes.slice(1)); if (m.data.length >= m.length) { add(ecu, m.data.slice(0, m.length)); partial.delete(ecu); } }
  }
  return out;
}
// Positive replies to one service (0x40 + mode), keyed by ECU.
function replies(raw, protocol, mode, pid) {
  const want = mode + 0x40, out = new Map();
  for (const [ecu, msgs] of frames(raw, protocol)) {
    const ok = msgs.filter(m => m[0] === want && (pid == null || m[1] === pid));
    if (ok.length) out.set(ecu, ok);
  }
  return out;
}
function ecuName(ecu) {
  const id = ecu.length === 8 ? ecu.slice(6) : ecu;
  return { '7E8': 'Engine', '10': 'Engine', '7E9': 'Transmission', '18': 'Transmission' }[id] || 'Module ' + ecu;
}
const engineFirst = map => [...map.entries()].sort(([a], [b]) => (ecuName(b) === 'Engine') - (ecuName(a) === 'Engine'));
function dtc(a, b) { return 'PCBU'[a >> 6] + ((a >> 4) & 3) + (a & 0x0F).toString(16).toUpperCase() + b.toString(16).toUpperCase().padStart(2, '0'); }
// Mode 03 / 07 / 0A. CAN replies carry a count byte; the older buses send three code slots per frame.
function decodeDtcs(raw, protocol, mode) {
  const can = /^A?[6-9]$/.test(String(protocol)), seen = new Map();
  for (const [ecu, msgs] of replies(raw, protocol, mode)) for (const m of msgs) {
    const body = can ? m.slice(2) : m.slice(1);
    for (let i = 0; i + 1 < body.length; i += 2) { if (!body[i] && !body[i + 1]) continue; const code = dtc(body[i], body[i + 1]); if (!seen.has(code)) seen.set(code, { code, module: ecuName(ecu) }); }
  }
  return [...seen.values()];
}
function decodeVin(raw, protocol) {
  const [hit] = engineFirst(replies(raw, protocol, 0x09, 0x02)); if (!hit) return null;
  const msgs = hit[1], can = /^A?[6-9]$/.test(String(protocol));
  const bytes = can ? msgs[0].slice(3) : msgs.slice().sort((a, b) => a[2] - b[2]).flatMap(m => m.slice(3));
  const vin = String.fromCharCode(...bytes.filter(b => b >= 0x30 && b <= 0x5A)).replace(/[^A-HJ-NPR-Z0-9]/g, '');
  return vin.length >= 17 ? vin.slice(-17) : null;
}
function decodePid(raw, protocol, pid) {
  const [hit] = engineFirst(replies(raw, protocol, 0x01, pid)); return hit ? hit[1][0].slice(2) : null;
}
// PIDs 00/20/40 are bitmaps of which of the next 32 PIDs the engine computer answers.
function supportedFrom(base, data) {
  const out = new Set(); if (!data) return out;
  data.slice(0, 4).forEach((byte, i) => { for (let bit = 0; bit < 8; bit++) if (byte & (0x80 >> bit)) out.add(base + i * 8 + bit + 1); });
  return out;
}
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';
// Model year from VIN position 10; position 7 being a letter means the 2010-2039 cycle for light vehicles.
function vinYear(vin) {
  if (!vin || vin.length !== 17) return null; const i = YEAR_CODES.indexOf(vin[9]); if (i < 0) return null;
  return 1980 + i + (/[A-Z]/.test(vin[6]) ? 30 : 0);
}
class Elm327 {
  constructor(transport) { this.transport = transport; this.chain = Promise.resolve(); this.protocol = null; this.supported = new Set(); }
  // Commands are queued so live polling and a code read never interleave on the serial line.
  send(command, timeoutMs = 5000) {
    if (!/^[A-Z0-9 @]{1,24}$/.test(command)) throw new Error('Invalid adapter command');
    const next = this.chain.then(() => this.transport.send(command, timeoutMs));
    this.chain = next.catch(() => {}); return next;
  }
  // protocol: a protocol number seen on this car before; the adapter tries it first and falls back to searching.
  async init(protocol) {
    const reset = await this.send('ATZ', 4000), version = (reset.match(/ELM327[^\r\n>]*/i) || [''])[0].trim();
    if (!version) throw new Error('The device answered, but not like an ELM327 OBD adapter');
    for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH1', /^[1-9A-C]$/.test(protocol || '') ? 'ATSPA' + protocol : 'ATSP0']) await this.send(c);
    const voltage = parseFloat(await this.send('ATRV')) || null;
    const adapter = { version, voltage };
    const probe = await this.send('0100', 20000);
    if (!lines(probe).some(l => /4100/.test(l))) return { adapter, vehicle: { connected: false, error: adapterError(probe) || 'NO DATA' } };
    this.protocol = (await this.send('ATDPN')).replace(/[^0-9A-F]/gi, '').replace(/^A/, '') || null;
    this.supported = supportedFrom(0, decodePid(probe, this.protocol, 0x00));
    for (const base of [0x20, 0x40]) { if (!this.supported.has(base)) break; for (const s of supportedFrom(base, decodePid(await this.send('01' + base.toString(16).toUpperCase(), 8000), this.protocol, base))) this.supported.add(s); }
    return { adapter, vehicle: { connected: true, protocol: this.protocol, protocolName: PROTOCOLS[this.protocol] || 'Protocol ' + this.protocol } };
  }
  async voltage() { return parseFloat(await this.send('ATRV')) || null; }
  async readCodes() {
    const status = decodePid(await this.send('0101', 8000), this.protocol, 0x01);
    const vin = decodeVin(await this.send('0902', 8000), this.protocol);
    const read = async mode => decodeDtcs(await this.send('0' + mode.toString(16).toUpperCase(), 8000), this.protocol, mode);
    return { vin, modelYear: vinYear(vin), mil: status ? !!(status[0] & 0x80) : null, reportedCount: status ? status[0] & 0x7F : null,
      stored: await read(0x03), pending: await read(0x07), permanent: this.protocol && /^[6-9]$/.test(this.protocol) ? await read(0x0A) : [] };
  }
  async live() {
    const readings = [];
    for (const p of LIVE) {
      if (this.supported.size && !this.supported.has(p.pid)) continue;
      const d = decodePid(await this.send('01' + p.pid.toString(16).toUpperCase().padStart(2, '0'), 4000), this.protocol, p.pid);
      if (!d || d.length < p.bytes) continue;
      const value = p.value(d); readings.push({ id: p.id, label: p.label, value, unit: p.unit, display: p.display ? p.display(value) : `${value} ${p.unit}` });
    }
    return readings;
  }
  async clearCodes() {
    const raw = await this.send('04', 10000);
    if (!replies(raw, this.protocol, 0x04).size) throw new Error(adapterError(raw) === 'NO DATA' || /7F04/.test(lines(raw).join('')) ? 'The car refused to clear codes. Most cars only allow it with the key ON and the engine off.' : 'The car did not confirm the codes were cleared');
    return true;
  }
}
module.exports = { Elm327, frames, replies, decodeDtcs, decodeVin, decodePid, supportedFrom, vinYear, adapterError, ecuName, LIVE, PROTOCOLS };
