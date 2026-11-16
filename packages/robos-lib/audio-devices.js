'use strict';

/**
 * RobOS Audio Devices & Pro-Audio Interface Discovery (PipeWire + ALSA + USB)
 *
 * Connects to Linux PipeWire, WirePlumber, and ALSA (`snd_usb_audio` mainline
 * Focusrite Scarlett Gen 1/2/3/4 & Clarett+ driver) with zero Windows ASIO
 * drivers required. Persists user preferences in `~/.config/robos/audio-devices.json`.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execFile } = require('child_process');

const FOCUSRITE_VENDOR_ID = '1235';

const FOCUSRITE_MODELS = {
  '8006': { model: 'Scarlett 2i2', generation: '1st Gen' },
  '800c': { model: 'Scarlett Solo', generation: '1st Gen' },
  '8012': { model: 'Scarlett 6i6', generation: '1st Gen' },
  '8014': { model: 'Scarlett 18i8', generation: '1st Gen' },
  '8001': { model: 'Scarlett 18i20', generation: '1st Gen' },
  '8200': { model: 'Scarlett 18i8', generation: '2nd Gen' },
  '8201': { model: 'Scarlett 18i20', generation: '2nd Gen' },
  '8202': { model: 'Scarlett 2i2', generation: '2nd Gen' },
  '8203': { model: 'Scarlett 2i4', generation: '2nd Gen' },
  '8204': { model: 'Scarlett 6i6', generation: '2nd Gen' },
  '8205': { model: 'Scarlett Solo', generation: '2nd Gen' },
  '8210': { model: 'Scarlett 2i2', generation: '3rd Gen' },
  '8211': { model: 'Scarlett Solo', generation: '3rd Gen' },
  '8212': { model: 'Scarlett 4i4', generation: '3rd Gen' },
  '8213': { model: 'Scarlett 8i6', generation: '3rd Gen' },
  '8214': { model: 'Scarlett 18i8', generation: '3rd Gen' },
  '8215': { model: 'Scarlett 18i20', generation: '3rd Gen' },
  '8218': { model: 'Scarlett Solo', generation: '4th Gen' },
  '8219': { model: 'Scarlett 2i2', generation: '4th Gen' },
  '821a': { model: 'Scarlett 4i4', generation: '4th Gen' },
  '821b': { model: 'Scarlett 16i16', generation: '4th Gen' },
  '821c': { model: 'Scarlett 18i16', generation: '4th Gen' },
  '821d': { model: 'Scarlett 18i20', generation: '4th Gen' },
  '8206': { model: 'Clarett 2Pre USB', generation: 'Clarett' },
  '8207': { model: 'Clarett 4Pre USB', generation: 'Clarett' },
  '8208': { model: 'Clarett 8Pre USB', generation: 'Clarett' },
  '820a': { model: 'Clarett+ 2Pre', generation: 'Clarett+' },
  '820b': { model: 'Clarett+ 4Pre', generation: 'Clarett+' },
  '820c': { model: 'Clarett+ 8Pre', generation: 'Clarett+' },
  '8216': { model: 'Vocaster One', generation: 'Vocaster' },
  '8217': { model: 'Vocaster Two', generation: 'Vocaster' },
};

function getConfigPath() {
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.config', 'robos', 'audio-devices.json');
}

function loadAudioConfig() {
  const defaults = {
    preferredInterfaceId: '',
    preferredInputNodeName: '',
    preferredOutputNodeName: '',
    sampleRate: 48000,
    quantum: 0, // 0 = PipeWire dynamic/auto, or 32/64/128/256/512/1024
    updatedAt: null,
  };
  try {
    const file = getConfigPath();
    if (fs.existsSync(file)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  } catch {}
  return defaults;
}

function saveAudioConfig(patch = {}) {
  const current = loadAudioConfig();
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const file = getConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function runCmd(cmd, args, timeout = 3000) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseLsusb(lsusbText) {
  const devices = [];
  for (const line of String(lsusbText || '').split('\n')) {
    const m = line.match(/^Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\s+(.*)$/);
    if (!m) continue;
    const vendorId = m[3].toLowerCase();
    const productId = m[4].toLowerCase();
    const rawName = m[5].trim();
    const isFocusrite = vendorId === FOCUSRITE_VENDOR_ID;
    const known = isFocusrite ? FOCUSRITE_MODELS[productId] : null;
    devices.push({
      bus: m[1],
      device: m[2],
      usbId: `${vendorId}:${productId}`,
      vendorId,
      productId,
      name: rawName,
      isFocusrite,
      model: known ? known.model : rawName,
      generation: known ? known.generation : null,
    });
  }
  return devices;
}

function parseStream0(streamText) {
  const info = {
    usbSpeed: null,
    maxPlaybackChannels: 0,
    maxCaptureChannels: 0,
    sampleRates: [],
    bits: null,
    format: null,
    syncMode: null,
  };
  if (!streamText) return info;
  const header = streamText.split('\n')[0] || '';
  if (/high speed/i.test(header)) info.usbSpeed = 'USB 2.0 High-Speed (480 Mbps)';
  else if (/super speed/i.test(header)) info.usbSpeed = 'USB 3.x SuperSpeed';
  else if (/full speed/i.test(header)) info.usbSpeed = 'USB 1.1 Full-Speed (12 Mbps)';

  const ratesSet = new Set();
  let section = null;
  for (const line of streamText.split('\n')) {
    if (/^Playback:/i.test(line)) section = 'playback';
    else if (/^Capture:/i.test(line)) section = 'capture';
    const chMatch = line.match(/^\s*Channels:\s*(\d+)/);
    if (chMatch) {
      const ch = parseInt(chMatch[1], 10);
      if (section === 'playback' && ch > info.maxPlaybackChannels) info.maxPlaybackChannels = ch;
      if (section === 'capture' && ch > info.maxCaptureChannels) info.maxCaptureChannels = ch;
    }
    const rateMatch = line.match(/^\s*Rates:\s*(.+)$/);
    if (rateMatch) {
      for (const tok of rateMatch[1].split(/[,\s]+/)) {
        const n = parseInt(tok, 10);
        if (Number.isFinite(n) && n >= 8000) ratesSet.add(n);
      }
    }
    const bitsMatch = line.match(/^\s*Bits:\s*(\d+)/);
    if (bitsMatch && (!info.bits || parseInt(bitsMatch[1], 10) > info.bits)) {
      info.bits = parseInt(bitsMatch[1], 10);
    }
    const fmtMatch = line.match(/^\s*Format:\s*(\S+)/);
    if (fmtMatch && !info.format) info.format = fmtMatch[1];
    if (/\(ASYNC\)/i.test(line)) info.syncMode = 'Asynchronous Isochronous';
  }
  info.sampleRates = [...ratesSet].sort((a, b) => a - b);
  return info;
}

function parseAlsaCards(procAsoundDir = '/proc/asound') {
  const cardsText = readTextSafe(path.join(procAsoundDir, 'cards'));
  const cards = [];
  const lines = cardsText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(\d+)\s+\[([^\]]+)\]:\s+(\S+)\s+-\s+(.*)$/);
    if (!m) continue;
    const cardIndex = parseInt(m[1], 10);
    const shortId = m[2].trim();
    const driver = m[3].trim();
    const name = m[4].trim();
    const detail = (lines[i + 1] || '').trim();
    const cardDir = path.join(procAsoundDir, `card${cardIndex}`);
    const usbIdRaw = readTextSafe(path.join(cardDir, 'usbid')).trim().toLowerCase();
    const stream0 = parseStream0(readTextSafe(path.join(cardDir, 'stream0')));
    const isFocusrite = usbIdRaw.startsWith(`${FOCUSRITE_VENDOR_ID}:`) || /focusrite|scarlett|clarett|vocaster/i.test(`${name} ${detail}`);
    const productId = usbIdRaw.split(':')[1] || '';
    const known = isFocusrite && FOCUSRITE_MODELS[productId] ? FOCUSRITE_MODELS[productId] : null;
    cards.push({
      cardIndex,
      alsaDevice: `hw:${cardIndex},0`,
      shortId,
      driver,
      name,
      detail,
      usbId: usbIdRaw || null,
      isUsb: driver === 'USB-Audio' || Boolean(usbIdRaw),
      isFocusrite,
      model: known ? `Focusrite ${known.model} (${known.generation})` : name,
      generation: known ? known.generation : null,
      ...stream0,
    });
  }
  return cards;
}

function parsePipeWireClock(metadataText) {
  const clock = {
    rate: 48000,
    quantum: 1024,
    minQuantum: 32,
    maxQuantum: 2048,
    forceQuantum: 0,
    forceRate: 0,
  };
  for (const line of String(metadataText || '').split('\n')) {
    const m = line.match(/key:'([^']+)'\s+value:'([^']*)'/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'clock.rate') clock.rate = parseInt(v, 10) || 48000;
    else if (k === 'clock.quantum') clock.quantum = parseInt(v, 10) || 1024;
    else if (k === 'clock.min-quantum') clock.minQuantum = parseInt(v, 10) || 32;
    else if (k === 'clock.max-quantum') clock.maxQuantum = parseInt(v, 10) || 2048;
    else if (k === 'clock.force-quantum') clock.forceQuantum = parseInt(v, 10) || 0;
    else if (k === 'clock.force-rate') clock.forceRate = parseInt(v, 10) || 0;
  }
  const activeQuantum = clock.forceQuantum > 0 ? clock.forceQuantum : clock.quantum;
  const activeRate = clock.forceRate > 0 ? clock.forceRate : clock.rate;
  clock.effectiveRate = activeRate;
  clock.effectiveQuantum = activeQuantum;
  clock.latencyMs = Number(((activeQuantum / activeRate) * 1000).toFixed(2));
  return clock;
}

function parseWpctlDefaults(wpctlText) {
  const defaultIds = new Set();
  for (const line of String(wpctlText || '').split('\n')) {
    const m = line.match(/\*+\s+(\d+)\.\s+/);
    if (m) defaultIds.add(parseInt(m[1], 10));
  }
  return defaultIds;
}

function parseChannelTarget(targetNodeName) {
  const raw = String(targetNodeName || '');
  const m = raw.match(/^([^#]+)#ch=(\d+)(?:&total=(\d+))?$/);
  if (!m) return { baseNodeName: raw, channelIndex: null, totalChannels: 1 };
  return {
    baseNodeName: m[1],
    channelIndex: parseInt(m[2], 10),
    totalChannels: parseInt(m[3] || '8', 10),
  };
}

function endpointPriority(desc) {
  const s = String(desc || '');
  if (/ADAT/i.test(s)) return 2;
  if (/S\/PDIF|SPDIF/i.test(s)) return 4;
  if (/Input \d/i.test(s)) return 1;
  if (/Line Output 1\+2/i.test(s)) return 1;
  if (/Headphones/i.test(s)) return 2;
  if (/Line Output/i.test(s)) return 3;
  return 6;
}

function naturalSortKey(label) {
  return String(label || '').replace(/(\d+)/g, (_, d) => d.padStart(4, '0'));
}

function parsePipeWireNodes(pwNodesText, defaultIds = new Set()) {
  const inputs = [];
  const outputs = [];
  const blocks = String(pwNodesText || '').split(/\n(?=\tid\s+\d+,)/);
  for (const block of blocks) {
    const idMatch = block.match(/^\s*id\s+(\d+),/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1], 10);
    const getProp = (prop) => {
      const pm = block.match(new RegExp(`${prop.replace('.', '\\.')}\\s*=\\s*"([^"]*)"`));
      return pm ? pm[1] : '';
    };
    const mediaClass = getProp('media.class');
    const nodeName = getProp('node.name');
    const description = getProp('node.description') || nodeName;
    if (!nodeName) continue;

    // Exclude internal `.split` helper streams so users see clean studio endpoints
    if (nodeName.endsWith('.split') || /\/Internal$/i.test(mediaClass)) continue;

    const isFocusrite = /focusrite|scarlett|clarett|vocaster/i.test(`${nodeName} ${description}`);
    const serialMatch = nodeName.match(/Scarlett_[^_]+_USB_([A-Z0-9]+)-/i);
    const audioChannels = parseInt(getProp('audio.channels') || '0', 10);

    // Expand multi-channel Focusrite ADAT Optical Input (8 channels) into 8 discrete studio inputs
    if (mediaClass === 'Audio/Source' && (/ADAT Optical Input/i.test(description) || /HiFi__Direct2__source/i.test(nodeName))) {
      const totalCh = audioChannels >= 2 ? audioChannels : 8;
      const prefix = description.replace(/\s*ADAT Optical Input.*$/i, '').trim() || 'Focusrite';
      for (let ch = 0; ch < totalCh; ch++) {
        inputs.push({
          id,
          name: `${nodeName}#ch=${ch}&total=${totalCh}`,
          baseNodeName: nodeName,
          channelIndex: ch,
          totalChannels: totalCh,
          description: `${prefix} ADAT Input ${ch + 1} (Ch ${ch + 9})`,
          mediaClass,
          isDefault: false,
          isFocusrite,
          isAdat: true,
          serial: serialMatch ? serialMatch[1] : null,
        });
      }
      continue;
    }

    const entry = {
      id,
      name: nodeName,
      description,
      mediaClass,
      isDefault: defaultIds.has(id),
      isFocusrite,
      serial: serialMatch ? serialMatch[1] : null,
    };
    if (mediaClass === 'Audio/Source') inputs.push(entry);
    else if (mediaClass === 'Audio/Sink') outputs.push(entry);
  }

  const sorter = (a, b) => {
    if (a.isFocusrite !== b.isFocusrite) return a.isFocusrite ? -1 : 1;
    const pa = endpointPriority(a.description);
    const pb = endpointPriority(b.description);
    if (pa !== pb) return pa - pb;
    return naturalSortKey(a.description).localeCompare(naturalSortKey(b.description));
  };
  inputs.sort(sorter);
  outputs.sort(sorter);
  return { inputs, outputs };
}

const alignedCaptureMatrixCards = new Set();

function readFocusriteHardwareControls(cardIndex) {
  if (cardIndex === null || cardIndex === undefined || cardIndex < 0) return null;
  const scontrols = runCmd('amixer', ['-c', String(cardIndex), 'scontrols']);
  if (!scontrols) return null;

  const hasControl = (name) => scontrols.includes(`'${name}'`);
  const readSwitch = (name) => {
    if (!hasControl(name)) return null;
    const out = runCmd('amixer', ['-c', String(cardIndex), 'sget', name]);
    if (/\[(on)\]/i.test(out)) return true;
    if (/\[(off)\]/i.test(out)) return false;
    return null;
  };
  const readEnum = (name) => {
    if (!hasControl(name)) return null;
    const out = runCmd('amixer', ['-c', String(cardIndex), 'sget', name]);
    const itemMatch = out.match(/Item0:\s*'([^']+)'/);
    const itemsMatch = out.match(/Items:\s*(.+)/);
    const options = itemsMatch
      ? [...itemsMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])
      : [];
    return itemMatch ? { value: itemMatch[1], options } : null;
  };

  // Read CARD-level firmware & clock validity controls when exposed by snd_usb_audio
  const cardControlsList = runCmd('amixer', ['-c', String(cardIndex), 'controls']);
  const readCardControlByName = (targetName) => {
    const m = cardControlsList.match(new RegExp(`(numid=\\d+),iface=[A-Z]+,name='${targetName}'`));
    if (!m) return null;
    return runCmd('amixer', ['-c', String(cardIndex), 'cget', m[1]]);
  };

  let firmwareVersion = null;
  const fwOut = readCardControlByName('Firmware Version');
  if (fwOut) {
    const fm = fwOut.match(/:\s*values=(\d+)/);
    if (fm) firmwareVersion = fm[1];
  }

  let clockSource = null;
  const clkOut = readCardControlByName('Clock Source Clock Source');
  if (clkOut) {
    const items = [...clkOut.matchAll(/Item #\d+ '([^']+)'/g)].map(m => m[1]);
    const vm = clkOut.match(/:\s*values=(\d+)/);
    const idx = vm ? parseInt(vm[1], 10) : 0;
    clockSource = { value: items[idx] || 'Internal', options: items };
  }

  const syncValid = {
    internal: /values=on/.test(readCardControlByName('Internal Validity') || ''),
    spdif: /values=on/.test(readCardControlByName('S/PDIF Validity') || ''),
    adat: /values=on/.test(readCardControlByName('ADAT Validity') || ''),
  };

  // Align 20-channel Focusrite Scarlett 18i20 hardware USB capture mux with Linux ALSA UCM (`HiFi`):
  // UCM splits Ch 0..7 (`PCM 01..08`) -> Analogue 1..8, Ch 10..11 (`PCM 11..12`) -> S/PDIF 1..2,
  // and Ch 12..19 (`PCM 13..20`) -> ADAT 1..8 (`Direct2#ch=0..7`), whereas factory firmware leaves
  // `PCM 11..18` on `ADAT 1..8` (shifting ADAT by 2 channels and leaving ADAT 7..8 on `'Off'`).
  let captureRoutingAligned = false;
  if (hasControl('PCM 01') && hasControl('PCM 11') && hasControl('PCM 13') && hasControl('PCM 20')) {
    const cacheKey = `${cardIndex}:${firmwareVersion || ''}`;
    if (alignedCaptureMatrixCards.has(cacheKey)) {
      captureRoutingAligned = true;
    } else {
      const expectedPcmMap = [
        ['PCM 01', 'Analogue 1'],
        ['PCM 02', 'Analogue 2'],
        ['PCM 03', 'Analogue 3'],
        ['PCM 04', 'Analogue 4'],
        ['PCM 05', 'Analogue 5'],
        ['PCM 06', 'Analogue 6'],
        ['PCM 07', 'Analogue 7'],
        ['PCM 08', 'Analogue 8'],
        ['PCM 11', 'S/PDIF 1'],
        ['PCM 12', 'S/PDIF 2'],
        ['PCM 13', 'ADAT 1'],
        ['PCM 14', 'ADAT 2'],
        ['PCM 15', 'ADAT 3'],
        ['PCM 16', 'ADAT 4'],
        ['PCM 17', 'ADAT 5'],
        ['PCM 18', 'ADAT 6'],
        ['PCM 19', 'ADAT 7'],
        ['PCM 20', 'ADAT 8'],
      ];
      for (const [pcmCtrl, targetSrc] of expectedPcmMap) {
        const cur = readEnum(pcmCtrl);
        if (cur && cur.options.includes(targetSrc) && cur.value !== targetSrc) {
          runCmd('amixer', ['-c', String(cardIndex), 'sset', pcmCtrl, targetSrc]);
        }
      }
      alignedCaptureMatrixCards.add(cacheKey);
      captureRoutingAligned = true;
    }
  }

  const phantomBanks = [];
  for (const bankName of ['Line In 1-4 Phantom Power', 'Line In 5-8 Phantom Power', 'Line In 1 Phantom Power', 'Line In 2 Phantom Power']) {
    const state = readSwitch(bankName);
    if (state !== null) {
      phantomBanks.push({
        control: bankName,
        label: bankName.replace('Line In ', 'Inputs ').replace(' Phantom Power', ' +48V'),
        enabled: state,
      });
    }
  }

  const preamps = [];
  for (let ch = 1; ch <= 8; ch++) {
    const air = readSwitch(`Line In ${ch} Air`);
    const pad = readSwitch(`Line In ${ch} Pad`);
    const level = readEnum(`Line In ${ch} Level`);
    if (air === null && pad === null && !level) continue;
    preamps.push({
      channel: ch,
      label: `Input ${ch}`,
      air,
      pad,
      level: level ? level.value : null,
      levelOptions: level ? level.options : [],
    });
  }

  return {
    cardIndex,
    firmwareVersion,
    clockSource,
    syncValid,
    captureRoutingAligned,
    phantomBanks,
    preamps,
    totalMixerControls: scontrols.split('\n').filter(Boolean).length,
  };
}

function setFocusriteHardwareControl({ cardIndex, control, value }) {
  const idx = Number(cardIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx > 31) {
    throw new Error('Invalid ALSA card index');
  }
  const safeControl = String(control || '');
  if (!/^(Line In [\d-]+ (Air|Pad|Level|Phantom Power)|Speaker Switching|Clock Source Clock Source)$/.test(safeControl)) {
    throw new Error(`Unsupported hardware control: ${safeControl}`);
  }
  if (safeControl === 'Clock Source Clock Source') {
    const allowed = ['Internal', 'S/PDIF', 'ADAT'];
    if (!allowed.includes(value)) throw new Error('Invalid clock source');
    execFileSync('amixer', ['-c', String(idx), 'cset', `name='${safeControl}'`, value], { timeout: 3000 });
  } else if (typeof value === 'boolean') {
    const isCaptureSwitch = /^Line In /i.test(safeControl);
    try {
      execFileSync('amixer', ['-c', String(idx), 'sset', safeControl, isCaptureSwitch ? (value ? 'cap' : 'nocap') : (value ? 'on' : 'off')], { timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      execFileSync('amixer', ['-c', String(idx), 'sset', safeControl, value ? 'on' : 'off'], { timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] });
    }
  } else {
    const safeEnum = String(value);
    if (!/^(Line|Inst|on|off)$/i.test(safeEnum)) throw new Error('Invalid control value');
    execFileSync('amixer', ['-c', String(idx), 'sset', safeControl, safeEnum], { timeout: 3000 });
  }
  return readFocusriteHardwareControls(idx);
}

function setPipeWireEngineSettings({ sampleRate, quantum, defaultInputId, defaultOutputId } = {}) {
  const configPatch = {};
  if (sampleRate !== undefined && sampleRate !== null) {
    const rate = parseInt(sampleRate, 10) || 0;
    if (![0, 44100, 48000, 88200, 96000, 176400, 192000].includes(rate)) {
      throw new Error(`Unsupported sample rate: ${sampleRate}`);
    }
    runCmd('pw-metadata', ['-n', 'settings', '0', 'clock.force-rate', String(rate)]);
    configPatch.sampleRate = rate || 48000;
  }
  if (quantum !== undefined && quantum !== null) {
    const q = parseInt(quantum, 10) || 0;
    if (![0, 32, 64, 128, 256, 512, 1024, 2048].includes(q)) {
      throw new Error(`Unsupported buffer size: ${quantum}`);
    }
    runCmd('pw-metadata', ['-n', 'settings', '0', 'clock.force-quantum', String(q)]);
    configPatch.quantum = q;
  }
  if (defaultInputId) {
    const id = parseInt(defaultInputId, 10);
    if (id > 0) runCmd('wpctl', ['set-default', String(id)]);
  }
  if (defaultOutputId) {
    const id = parseInt(defaultOutputId, 10);
    if (id > 0) runCmd('wpctl', ['set-default', String(id)]);
  }
  const saved = saveAudioConfig(configPatch);
  return { ok: true, config: saved, snapshot: getAudioDevicesSnapshot() };
}

function analyzeWavSamples(buffer) {
  if (!buffer || buffer.length < 48) return { peakDb: -96, rmsDb: -96, samples: 0 };
  // Locate 'data' chunk in RIFF WAV
  let offset = 12;
  let dataStart = 44;
  let dataLen = buffer.length - 44;
  let bitsPerSample = 16;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 24 <= buffer.length) {
      bitsPerSample = buffer.readUInt16LE(offset + 22) || 16;
    } else if (chunkId === 'data') {
      dataStart = offset + 8;
      dataLen = Math.min(chunkSize, buffer.length - dataStart);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const step = Math.max(2, Math.floor(bitsPerSample / 8));
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  for (let p = dataStart; p + step <= dataStart + dataLen; p += step) {
    let norm = 0;
    if (step === 2) norm = buffer.readInt16LE(p) / 32768;
    else if (step === 4) norm = buffer.readInt32LE(p) / 2147483648;
    const abs = Math.abs(norm);
    if (abs > peak) peak = abs;
    sumSq += norm * norm;
    count++;
  }
  const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
  const toDb = (v) => (v <= 0.000015 ? -96 : Number((20 * Math.log10(v)).toFixed(1)));
  return {
    peakDb: toDb(peak),
    rmsDb: toDb(rms),
    peakLinear: Number(peak.toFixed(4)),
    samples: count,
  };
}

function testInputCapture({ targetNodeName = '', durationMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const { baseNodeName, channelIndex, totalChannels } = parseChannelTarget(targetNodeName);
    if (channelIndex !== null) {
      const args = ['--record', '--raw', '--rate', '48000', '--channels', String(totalChannels), '--format', 's16'];
      if (baseNodeName) args.push('--target', baseNodeName);
      args.push('-');
      const child = spawn('pw-cat', args, { stdio: ['ignore', 'pipe', 'ignore'] });
      const chunks = [];
      child.stdout.on('data', c => chunks.push(c));
      setTimeout(() => { try { child.kill('SIGINT'); } catch {} }, Math.max(400, Math.min(4000, durationMs)));
      child.on('close', () => {
        const raw = Buffer.concat(chunks);
        const frameBytes = totalChannels * 2;
        const frames = Math.floor(raw.length / frameBytes);
        if (frames < 32) return resolve({ ok: false, error: 'No audio frames captured from ADAT channel.' });
        const wav = Buffer.alloc(44 + frames * 2);
        wav.write('RIFF', 0);
        wav.writeUInt32LE(36 + frames * 2, 4);
        wav.write('WAVE', 8);
        wav.write('fmt ', 12);
        wav.writeUInt32LE(16, 16);
        wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(48000, 24);
        wav.writeUInt32LE(96000, 28);
        wav.writeUInt16LE(2, 32);
        wav.writeUInt16LE(16, 34);
        wav.write('data', 36);
        wav.writeUInt32LE(frames * 2, 40);
        for (let f = 0; f < frames; f++) {
          wav.writeInt16LE(raw.readInt16LE(f * frameBytes + channelIndex * 2), 44 + f * 2);
        }
        const stats = analyzeWavSamples(wav);
        resolve({ ok: true, targetNodeName, durationMs, ...stats });
      });
      return;
    }

    const tmpFile = path.join(os.tmpdir(), `robos-audio-probe-${ process.pid }-${Date.now()}.wav`);
    const args = ['--rate', '48000', '--channels', '1', '--format', 's16'];
    if (targetNodeName) args.push('--target', String(targetNodeName));
    args.push(tmpFile);

    const child = execFile('pw-record', args, { timeout: durationMs + 2500 }, () => {});
    setTimeout(() => {
      try { child.kill('SIGINT'); } catch {}
    }, Math.max(400, Math.min(4000, durationMs)));

    child.on('close', () => {
      try {
        const buf = fs.existsSync(tmpFile) ? fs.readFileSync(tmpFile) : null;
        try { fs.unlinkSync(tmpFile); } catch {}
        if (!buf || buf.length < 100) {
          return resolve({ ok: false, error: 'No audio frames captured from target input.' });
        }
        const stats = analyzeWavSamples(buf);
        resolve({
          ok: true,
          targetNodeName: targetNodeName || 'default',
          durationMs,
          ...stats,
        });
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });
  });
}

function buildChimeWavBuffer(sampleRate = 48000, durationSec = 0.85) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const numChannels = 2;
  const dataBytes = numSamples * numChannels * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * 2, 28);
  buf.writeUInt16LE(numChannels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  const freqs = [440, 554.37, 659.25]; // Warm A-major studio triad
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.02) * Math.exp(-3.2 * t);
    let sample = 0;
    for (const f of freqs) sample += Math.sin(2 * Math.PI * f * t);
    sample = (sample / freqs.length) * env * 0.35;
    const pcm = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
    const pos = 44 + i * 4;
    buf.writeInt16LE(pcm, pos);
    buf.writeInt16LE(pcm, pos + 2);
  }
  return buf;
}

function playTestTone({ targetNodeName = '' } = {}) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `robos-audio-chime-${process.pid}-${Date.now()}.wav`);
    fs.writeFileSync(tmpFile, buildChimeWavBuffer(48000, 0.85));
    const args = [];
    if (targetNodeName) args.push('--target', String(targetNodeName));
    args.push(tmpFile);
    execFile('pw-play', args, { timeout: 4000 }, (err) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true, targetNodeName: targetNodeName || 'default' });
    });
  });
}

function getAudioDevicesSnapshot() {
  const lsusbDevices = parseLsusb(runCmd('lsusb', []));
  const alsaCards = parseAlsaCards();
  const wpctlOut = runCmd('wpctl', ['status']);
  const pwMetaOut = runCmd('pw-metadata', ['-n', 'settings']);
  const pwNodesOut = runCmd('pw-cli', ['ls', 'Node']);

  const pipewireRunning = Boolean(wpctlOut || pwNodesOut);
  const clock = parsePipeWireClock(pwMetaOut);
  const defaultIds = parseWpctlDefaults(wpctlOut);
  const { inputs, outputs } = parsePipeWireNodes(pwNodesOut, defaultIds);

  const focusriteUsb = lsusbDevices.find(d => d.isFocusrite) || null;
  const focusriteCard = alsaCards.find(c => c.isFocusrite) || null;
  const focusriteMixer = focusriteCard ? readFocusriteHardwareControls(focusriteCard.cardIndex) : null;

  const serialFromPipeWire = [...inputs, ...outputs].find(n => n.isFocusrite && n.serial)?.serial || null;
  const config = loadAudioConfig();

  // Auto-select sensible defaults in config view if none chosen yet
  const activeInput = inputs.find(i => i.name === config.preferredInputNodeName)
    || inputs.find(i => i.isDefault)
    || inputs[0]
    || null;
  const activeOutput = outputs.find(o => o.name === config.preferredOutputNodeName)
    || outputs.find(o => o.isFocusrite && /Headphones 1|Line Output 1\+2/i.test(o.description))
    || outputs.find(o => o.isDefault)
    || outputs[0]
    || null;

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    driverStack: pipewireRunning ? 'PipeWire Pro-Audio + ALSA snd_usb_audio (Native Linux — No ASIO Required)' : 'ALSA Direct',
    pipewireRunning,
    clock,
    focusrite: focusriteCard || focusriteUsb ? {
      connected: true,
      model: focusriteCard?.model || (focusriteUsb ? `Focusrite ${focusriteUsb.model}` : 'Focusrite USB'),
      generation: focusriteCard?.generation || focusriteUsb?.generation || null,
      usbId: focusriteCard?.usbId || focusriteUsb?.usbId || null,
      serial: serialFromPipeWire,
      alsaCardIndex: focusriteCard ? focusriteCard.cardIndex : null,
      alsaDevice: focusriteCard ? focusriteCard.alsaDevice : null,
      usbSpeed: focusriteCard?.usbSpeed || 'USB 2.0 High-Speed',
      syncMode: focusriteCard?.syncMode || 'Asynchronous',
      bits: focusriteCard?.bits || 24,
      format: focusriteCard?.format || 'S32_LE',
      maxCaptureChannels: focusriteCard?.maxCaptureChannels || 0,
      maxPlaybackChannels: focusriteCard?.maxPlaybackChannels || 0,
      sampleRates: focusriteCard?.sampleRates?.length ? focusriteCard.sampleRates : [44100, 48000, 88200, 96000],
      mixer: focusriteMixer,
    } : {
      connected: false,
      hint: 'Plug in any Focusrite Scarlett, Clarett+, or Vocaster over a data USB cable (use the [USB] port rather than [5V DC] on Gen 4 models). Linux connects natively via snd_usb_audio + PipeWire.',
    },
    alsaCards,
    usbAudioDevices: lsusbDevices.filter(d => d.isFocusrite || /audio|scarlett|focusrite|steinberg|yamaha|motu|behringer|presonus|audient|ssl|rme|rode|shure|zoom/i.test(d.name)),
    inputs,
    outputs,
    activeInput,
    activeOutput,
    config,
  };
}

module.exports = {
  FOCUSRITE_VENDOR_ID,
  FOCUSRITE_MODELS,
  getConfigPath,
  loadAudioConfig,
  saveAudioConfig,
  parseLsusb,
  parseStream0,
  parseAlsaCards,
  parsePipeWireClock,
  parsePipeWireNodes,
  analyzeWavSamples,
  buildChimeWavBuffer,
  readFocusriteHardwareControls,
  setFocusriteHardwareControl,
  setPipeWireEngineSettings,
  testInputCapture,
  playTestTone,
  getAudioDevicesSnapshot,
};
