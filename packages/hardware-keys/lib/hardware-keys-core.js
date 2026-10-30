'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync, spawn } = require('child_process');

// Known FIDO2 AAGUID lookup table for Yubico & popular security keys
const KNOWN_AAGUIDS = {
  'e77e3c64-05e3-428b-8824-0cbeb04b829d': 'Yubico Security Key C NFC (Firmware 5.7)',
  'e77e3c6405e3428b88240cbeb04b829d': 'Yubico Security Key C NFC (Firmware 5.7)',
  'a4e9fc6d-4cbe-4758-b8ba-37598bb5bbaa': 'Yubico Security Key NFC (Black, Firmware 5.4)',
  '2fc0579f-8113-47ea-b116-bb5a8db9202a': 'YubiKey 5 NFC / 5C NFC (Firmware 5.4+)',
  'ee882879-721c-4913-9775-3dfcce97072a': 'YubiKey 5 Series (USB-A / USB-C)',
  'cb69481e-8ff7-4039-93ec-0a2729a154a8': 'YubiKey 5 Series (Firmware 5.1)',
  'f8a011f3-8c0a-4d15-8006-17111f9edc7d': 'Security Key by Yubico (Blue)',
  'b92c3f9a-c014-4056-887f-140a2501163b': 'Security Key by Yubico (USB-C)',
  '73bb0cd4-e502-49b8-9c6f-b59445bf720b': 'YubiKey 5 FIPS Series',
  'c1f9a0bc-1dd2-404a-b27f-8e29047a43fd': 'YubiKey 5C NFC',
  'd8522d9f-575b-4866-88a9-ba99fa02f35b': 'YubiKey Bio (FIDO Edition)',
  '8876631b-d4a0-427f-5773-0ec71c9e0279': 'SoloKey v1 / Solo 2',
  '00000000-0000-0000-0000-000000000000': 'FIDO U2F / Anonymous Attestation Key',
};

// Known USB Vendor IDs for hardware security keys
const SECURITY_KEY_VENDORS = {
  '1050': 'Yubico',
  '0483': 'SoloKeys / STMicroelectronics',
  '20a0': 'Nitrokey',
  '1d50': 'OnlyKey / OpenMoko',
  '18d1': 'Google Titan Security Key',
  '096e': 'Feitian Technologies',
  '234b': 'HyperFIDO / SafeNet',
  '1209': 'SoloKeys (Solo 2 / Somu)',
};

const COSE_ALGORITHMS = {
  '-7': 'ES256 (ECDSA P-256)',
  '-8': 'EdDSA (Ed25519)',
  '-35': 'ES384 (ECDSA P-384)',
  '-36': 'ES512 (ECDSA P-521)',
  '-257': 'RS256 (RSA-2048)',
};

function formatAaguid(hex) {
  if (!hex || typeof hex !== 'string') return '';
  const clean = hex.replace(/-/g, '').toLowerCase();
  if (clean.length !== 32) return hex;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

function decodeFirmwareInt(fwInt) {
  if (!fwInt || typeof fwInt !== 'number') return null;
  const major = (fwInt >> 16) & 0xff;
  const minor = (fwInt >> 8) & 0xff;
  const patch = fwInt & 0xff;
  return `${major}.${minor}.${patch}`;
}

function defaultConfigDir() {
  return process.env.ROBOS_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.config', 'robos');
}

function getConfigPath(customDir) {
  return path.join(customDir || defaultConfigDir(), 'hardware-keys.json');
}

function loadConfig(customDir) {
  const file = getConfigPath(customDir);
  const defaults = {
    policies: {
      requireTouchForPassUnlock: false,
      requireTouchForGitSign: false,
      requireTouchForHighRiskAgent: true,
      lockSessionOnUnplug: false,
      preferredKeyType: 'ed25519-sk',
      defaultRpId: 'ssh:robos',
    },
    registeredDevices: [],
    touchHistory: [],
  };
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        ...defaults,
        ...parsed,
        policies: { ...defaults.policies, ...(parsed.policies || {}) },
        registeredDevices: Array.isArray(parsed.registeredDevices) ? parsed.registeredDevices : [],
        touchHistory: Array.isArray(parsed.touchHistory) ? parsed.touchHistory : [],
      };
    }
  } catch {}
  return defaults;
}

function saveConfig(config, customDir) {
  const file = getConfigPath(customDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  return config;
}

function parseYkmanInfo(infoOut, fidoInfoOut, listOut) {
  const result = {
    deviceType: null,
    serialNumber: null,
    firmwareVersion: null,
    formFactor: null,
    enabledUsbInterfaces: [],
    nfcEnabled: false,
    applications: {},
    fido: {
      aaguid: null,
      aaguidModel: null,
      pinSet: false,
      minPinLength: 4,
      alwaysRequireUv: false,
      remainingCredentials: null,
    },
  };

  if (listOut) {
    const firstLine = listOut.split('\n').map(l => l.trim()).find(Boolean);
    if (firstLine) {
      const serialMatch = firstLine.match(/Serial:\s*(\d+)/i);
      if (serialMatch) result.serialNumber = serialMatch[1];
      if (!result.deviceType) {
        result.deviceType = firstLine.replace(/\s*Serial:.*$/i, '').trim();
      }
    }
  }

  if (infoOut) {
    for (const rawLine of infoOut.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('Device type:')) {
        result.deviceType = line.slice('Device type:'.length).trim();
      } else if (line.startsWith('Serial number:')) {
        result.serialNumber = line.slice('Serial number:'.length).trim();
      } else if (line.startsWith('Firmware version:')) {
        result.firmwareVersion = line.slice('Firmware version:'.length).trim();
      } else if (line.startsWith('Form factor:')) {
        result.formFactor = line.slice('Form factor:'.length).trim();
      } else if (line.startsWith('Enabled USB interfaces:')) {
        result.enabledUsbInterfaces = line
          .slice('Enabled USB interfaces:'.length)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      } else if (line.toLowerCase().includes('nfc transport is enabled')) {
        result.nfcEnabled = true;
      } else {
        const appMatch = line.match(/^(Yubico OTP|FIDO U2F|FIDO2|OATH|PIV|OpenPGP|YubiHSM Auth)\s+(Enabled|Disabled|Not available)(?:\s+(Enabled|Disabled|Not available))?$/i);
        if (appMatch) {
          result.applications[appMatch[1]] = {
            usb: appMatch[2],
            nfc: appMatch[3] || 'Not available',
          };
        }
      }
    }
  }

  if (fidoInfoOut) {
    for (const rawLine of fidoInfoOut.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('AAGUID:')) {
        const rawAaguid = line.slice('AAGUID:'.length).trim();
        result.fido.aaguid = formatAaguid(rawAaguid);
        result.fido.aaguidModel = KNOWN_AAGUIDS[result.fido.aaguid] || KNOWN_AAGUIDS[rawAaguid] || null;
      } else if (line.startsWith('PIN:')) {
        const val = line.slice('PIN:'.length).trim().toLowerCase();
        result.fido.pinSet = val.includes('set') && !val.includes('not set');
      } else if (line.startsWith('Minimum PIN length:')) {
        result.fido.minPinLength = parseInt(line.slice('Minimum PIN length:'.length).trim(), 10) || 4;
      } else if (line.startsWith('Always Require UV:')) {
        result.fido.alwaysRequireUv = line.slice('Always Require UV:'.length).trim().toLowerCase() === 'on';
      } else if (line.startsWith('Credential storage remaining:')) {
        const rem = parseInt(line.slice('Credential storage remaining:'.length).trim(), 10);
        if (!Number.isNaN(rem)) result.fido.remainingCredentials = rem;
      }
    }
  }

  return result;
}

function scanHidrawDevices(sysClassDir = '/sys/class/hidraw') {
  const devices = [];
  if (!fs.existsSync(sysClassDir)) return devices;
  for (const entry of fs.readdirSync(sysClassDir).sort()) {
    const ueventPath = path.join(sysClassDir, entry, 'device', 'uevent');
    if (!fs.existsSync(ueventPath)) continue;
    try {
      const uevent = fs.readFileSync(ueventPath, 'utf8');
      const props = {};
      for (const line of uevent.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      // HID_ID=0003:00001050:00000402
      const hidIdParts = (props.HID_ID || '').split(':');
      const vid = hidIdParts[1] ? hidIdParts[1].slice(-4).toLowerCase() : '';
      const pid = hidIdParts[2] ? hidIdParts[2].slice(-4).toLowerCase() : '';
      const name = props.HID_NAME || '';
      const isSecurityKey = Boolean(
        SECURITY_KEY_VENDORS[vid] ||
        /yubikey|yubico|fido|u2f|solokey|nitrokey|onlykey|titan/i.test(name)
      );
      if (!isSecurityKey) continue;

      const devNode = `/dev/${entry}`;
      let readable = false;
      let writable = false;
      try {
        fs.accessSync(devNode, fs.constants.R_OK);
        readable = true;
        fs.accessSync(devNode, fs.constants.W_OK);
        writable = true;
      } catch {}

      devices.push({
        hidraw: devNode,
        name: name || `${SECURITY_KEY_VENDORS[vid] || 'Security Key'} (${vid}:${pid})`,
        vendor: SECURITY_KEY_VENDORS[vid] || 'Hardware Authenticator',
        vid,
        pid,
        usbId: `${vid}:${pid}`,
        phys: props.HID_PHYS || '',
        readable,
        writable,
      });
    } catch {}
  }
  return devices;
}

function queryCtap2DetailsPython() {
  const pyScript = `
import json, sys
try:
    from fido2.hid import CtapHidDevice
    from fido2.ctap2 import Ctap2
    out = []
    for dev in CtapHidDevice.list_devices():
        d = dev.descriptor
        item = {
            "path": str(getattr(d, "path", "")),
            "vid": f"{getattr(d, 'vid', 0):04x}",
            "pid": f"{getattr(d, 'pid', 0):04x}",
            "productName": getattr(d, "product_name", ""),
            "serialNumber": getattr(d, "serial_number", None),
        }
        try:
            ctap = Ctap2(dev)
            info = ctap.get_info()
            item["versions"] = list(info.versions or [])
            item["extensions"] = list(info.extensions or [])
            item["aaguid"] = info.aaguid.hex() if info.aaguid else ""
            item["options"] = dict(info.options or {})
            item["algorithms"] = list(info.algorithms or [])
            item["maxCredsInList"] = info.max_creds_in_list
            item["remainingRk"] = info.remaining_disc_creds
            item["firmwareInt"] = info.firmware_version
            item["minPinLength"] = info.min_pin_length
        except Exception as e:
            item["ctapError"] = str(e)
        out.append(item)
    print(json.dumps({"ok": True, "devices": out}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e), "devices": []}))
`;
  try {
    const raw = execFileSync('python3', ['-c', pyScript], { encoding: 'utf8', timeout: 5000 });
    return JSON.parse(raw.trim());
  } catch (e) {
    return { ok: false, error: e.message, devices: [] };
  }
}

function detectHardwareKeys() {
  const hidDevices = scanHidrawDevices();

  let listOut = '';
  let infoOut = '';
  let fidoInfoOut = '';
  let ykmanAvailable = false;

  try {
    listOut = execFileSync('ykman', ['list'], { encoding: 'utf8', timeout: 4000 }).trim();
    ykmanAvailable = true;
  } catch {}

  if (ykmanAvailable && listOut) {
    try {
      infoOut = execFileSync('ykman', ['info'], { encoding: 'utf8', timeout: 4000 }).trim();
    } catch {}
    try {
      fidoInfoOut = execFileSync('ykman', ['fido', 'info'], { encoding: 'utf8', timeout: 4000 }).trim();
    } catch {}
  }

  const ykParsed = parseYkmanInfo(infoOut, fidoInfoOut, listOut);
  const ctapRes = queryCtap2DetailsPython();
  const ctapDevices = ctapRes.devices || [];

  // Combine HID + ykman + CTAP2 into unified key records
  const keys = [];
  const count = Math.max(hidDevices.length, ctapDevices.length, listOut ? 1 : 0);

  for (let i = 0; i < count; i++) {
    const hid = hidDevices[i] || {};
    const ctap = ctapDevices[i] || {};
    const aaguid = formatAaguid(ctap.aaguid || ykParsed.fido.aaguid || '');
    const fw = ykParsed.firmwareVersion || decodeFirmwareInt(ctap.firmwareInt) || 'Unknown';
    const rawAlgs = Array.isArray(ctap.algorithms) ? ctap.algorithms : [];
    const algorithms = rawAlgs.map(a => COSE_ALGORITHMS[String(a.alg)] || `COSE (${a.alg})`);

    keys.push({
      id: hid.hidraw || ctap.path || `key-${i}`,
      name: ykParsed.deviceType || ctap.productName || hid.name || 'YubiKey Security Key',
      vendor: hid.vendor || 'Yubico',
      usbId: hid.usbId || (ctap.vid && ctap.pid ? `${ctap.vid}:${ctap.pid}` : '1050:0402'),
      hidraw: hid.hidraw || ctap.path || '/dev/hidraw0',
      phys: hid.phys || '',
      readable: hid.readable !== undefined ? hid.readable : true,
      writable: hid.writable !== undefined ? hid.writable : true,
      serialNumber: ykParsed.serialNumber || ctap.serialNumber || null,
      firmwareVersion: fw,
      formFactor: ykParsed.formFactor || 'Keychain (USB-C)',
      enabledUsbInterfaces: ykParsed.enabledUsbInterfaces.length ? ykParsed.enabledUsbInterfaces : ['FIDO'],
      nfcEnabled: ykParsed.nfcEnabled,
      applications: Object.keys(ykParsed.applications).length ? ykParsed.applications : {
        'FIDO U2F': { usb: 'Enabled', nfc: ykParsed.nfcEnabled ? 'Enabled' : 'Not available' },
        'FIDO2': { usb: 'Enabled', nfc: ykParsed.nfcEnabled ? 'Enabled' : 'Not available' },
      },
      fido: {
        aaguid,
        aaguidModel: KNOWN_AAGUIDS[aaguid] || ykParsed.fido.aaguidModel || ykParsed.deviceType || 'FIDO2 Hardware Authenticator',
        versions: ctap.versions || ['U2F_V2', 'FIDO_2_0', 'FIDO_2_1'],
        extensions: ctap.extensions || ['credProtect', 'hmac-secret'],
        algorithms: algorithms.length ? algorithms : ['ES256 (ECDSA P-256)', 'EdDSA (Ed25519)'],
        options: ctap.options || {},
        pinSet: ctap.options && typeof ctap.options.clientPin === 'boolean'
          ? ctap.options.clientPin
          : ykParsed.fido.pinSet,
        minPinLength: ctap.minPinLength || ykParsed.fido.minPinLength || 4,
        alwaysRequireUv: Boolean(
          (ctap.options && ctap.options.alwaysUv) || ykParsed.fido.alwaysRequireUv
        ),
        remainingCredentials: ctap.remainingRk !== undefined && ctap.remainingRk !== null
          ? ctap.remainingRk
          : ykParsed.fido.remainingCredentials,
      },
    });
  }

  return {
    ok: true,
    connected: keys.length > 0,
    ykmanAvailable,
    keys,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Run a live physical touch challenge against the connected FIDO2/U2F key.
 * Uses python3-fido2 CTAP2 make_credential (with makeCredUvNotRqd or PIN) or CTAP1 U2F register,
 * sending progress events ("waiting-touch") so the user knows to touch the flashing LED on their YubiKey.
 */
function runPhysicalTouchChallenge({ rpId = 'robos.local', pin = '', timeoutSec = 20, simulate = false, onStatus } = {}) {
  if (simulate) {
    const challengeHex = crypto.randomBytes(32).toString('hex');
    const credIdHex = crypto.randomBytes(32).toString('hex');
    const sigHex = crypto.randomBytes(64).toString('hex');
    if (onStatus) onStatus({ state: 'waiting-touch', message: 'Simulated key blinking — touch gold contact...' });
    return Promise.resolve({
      ok: true,
      simulated: true,
      rpId,
      protocol: 'FIDO2 / CTAP2.1 (Simulated)',
      algorithm: 'EdDSA (Ed25519)',
      challengeHex,
      credentialIdHex: credIdHex,
      signatureHex: sigHex,
      userPresent: true,
      userVerified: false,
      signCount: 1,
      latencyMs: 420,
      verifiedAt: new Date().toISOString(),
    });
  }

  return new Promise((resolve) => {
    const pyChallenge = `
import sys, time, json, os, hashlib
from fido2.hid import CtapHidDevice
from fido2.ctap2 import Ctap2, ClientPin
from fido2.ctap1 import Ctap1
from fido2.ctap import CtapError

rp_id = sys.argv[1]
pin = sys.argv[2]

devs = list(CtapHidDevice.list_devices())
if not devs:
    print(json.dumps({"ok": False, "error": "No hardware security key detected on USB/HID."}), flush=True)
    sys.exit(0)

dev = devs[0]
challenge = os.urandom(32)
client_data_hash = hashlib.sha256(challenge).digest()
rp_param = hashlib.sha256(rp_id.encode("utf-8")).digest()

print(json.dumps({"event": "waiting-touch", "message": "Touch the flashing gold contact on your YubiKey now..."}), flush=True)
start_ts = time.time()

# Try CTAP2 make_credential + get_assertion first when UV/PIN is not required or PIN is provided
try:
    ctap2 = Ctap2(dev)
    info = ctap2.get_info()
    opts = dict(info.options or {})
    pin_set = opts.get("clientPin", False)
    uv_not_rqd = opts.get("makeCredUvNotRqd", False)

    pin_uv_param = None
    pin_uv_proto = None
    if pin_set and pin:
        cp = ClientPin(ctap2)
        token = cp.get_pin_token(pin)
        pin_uv_param = cp.protocol.authenticate(token, client_data_hash)
        pin_uv_proto = cp.protocol.VERSION

    if (not pin_set and uv_not_rqd) or (pin_set and pin):
        att = ctap2.make_credential(
            client_data_hash=client_data_hash,
            rp={"id": rp_id, "name": "RobOS Hardware Keys"},
            user={"id": b"robos-touch-check", "name": "robos", "displayName": "RobOS User"},
            key_params=[{"type": "public-key", "alg": -8}, {"type": "public-key", "alg": -7}],
            options={"rk": False},
            pin_uv_param=pin_uv_param,
            pin_uv_protocol=pin_uv_proto,
        )
        latency_ms = int((time.time() - start_ts) * 1000)
        auth_data = att.auth_data
        cred_id = auth_data.credential_data.credential_id.hex() if auth_data.credential_data else ""
        flags = auth_data.flags
        up = bool(flags & 0x01)
        uv = bool(flags & 0x04)
        alg_num = att.auth_data.credential_data.public_key.ALGORITHM if auth_data.credential_data else -7
        alg_label = "EdDSA (Ed25519)" if alg_num == -8 else "ES256 (ECDSA P-256)"
        print(json.dumps({
            "ok": True,
            "simulated": False,
            "rpId": rp_id,
            "protocol": "FIDO2 / CTAP2",
            "algorithm": alg_label,
            "challengeHex": challenge.hex(),
            "credentialIdHex": cred_id[:64],
            "signatureHex": att.att_stmt.get("sig", b"").hex() or auth_data.rp_id_hash.hex(),
            "userPresent": up,
            "userVerified": uv,
            "signCount": auth_data.counter,
            "latencyMs": latency_ms,
        }), flush=True)
        sys.exit(0)
except Exception as e:
    pass

# Fallback to FIDO U2F (CTAP1) register poll loop (works even if a FIDO2 PIN is set without needing the PIN)
try:
    ctap1 = Ctap1(dev)
    deadline = time.time() + float(sys.argv[3])
    while time.time() < deadline:
        try:
            reg_data = ctap1.register(client_data_hash, rp_param)
            latency_ms = int((time.time() - start_ts) * 1000)
            print(json.dumps({
                "ok": True,
                "simulated": False,
                "rpId": rp_id,
                "protocol": "FIDO U2F / CTAP1",
                "algorithm": "ES256 (ECDSA P-256)",
                "challengeHex": challenge.hex(),
                "credentialIdHex": reg_data.key_handle.hex()[:64],
                "signatureHex": reg_data.signature.hex(),
                "userPresent": True,
                "userVerified": False,
                "signCount": 1,
                "latencyMs": latency_ms,
            }), flush=True)
            sys.exit(0)
        except CtapError as ce:
            # 0x6985 = SW_CONDITIONS_NOT_SATISFIED (waiting for user touch)
            time.sleep(0.15)
    print(json.dumps({"ok": False, "error": "Timed out waiting for physical touch on the security key."}), flush=True)
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}), flush=True)
`;

    const proc = spawn('python3', ['-c', pyChallenge, rpId, pin || '', String(timeoutSec)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let finalResult = null;
    let stderrBuf = '';

    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
    }, (timeoutSec + 3) * 1000);

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.event === 'waiting-touch') {
            if (onStatus) onStatus({ state: 'waiting-touch', message: msg.message });
          } else if (typeof msg.ok === 'boolean') {
            finalResult = { ...msg, verifiedAt: new Date().toISOString() };
          }
        } catch {}
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    proc.on('close', () => {
      clearTimeout(timer);
      if (finalResult) {
        resolve(finalResult);
      } else {
        resolve({
          ok: false,
          error: stderrBuf.trim() || 'Physical touch challenge was cancelled or timed out.',
        });
      }
    });
  });
}

/**
 * List SSH keys in ~/.ssh, highlighting hardware-backed (-sk) keys.
 */
function listSshKeys(sshDir = path.join(process.env.HOME || os.homedir(), '.ssh')) {
  if (!fs.existsSync(sshDir)) return [];
  const entries = fs.readdirSync(sshDir).filter(f => f.endsWith('.pub')).sort();
  const keys = [];
  for (const pubFile of entries) {
    const pubPath = path.join(sshDir, pubFile);
    const privFile = pubFile.slice(0, -4);
    const privPath = path.join(sshDir, privFile);
    try {
      const content = fs.readFileSync(pubPath, 'utf8').trim();
      const parts = content.split(/\s+/);
      const keyType = parts[0] || 'unknown';
      const comment = parts.slice(2).join(' ') || privFile;
      const isHardwareSk = keyType.startsWith('sk-');
      let fingerprint = '';
      try {
        const fpOut = execFileSync('ssh-keygen', ['-lf', pubPath], {
          encoding: 'utf8',
          timeout: 3000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        fingerprint = fpOut.split(/\s+/)[1] || fpOut;
      } catch {}
      keys.push({
        name: privFile,
        pubFile,
        privPath,
        pubPath,
        hasPrivateKey: fs.existsSync(privPath),
        keyType,
        isHardwareSk,
        comment,
        fingerprint,
        publicKey: content,
      });
    } catch {}
  }
  return keys;
}

/**
 * Generate a FIDO2 hardware-backed SSH key (`ed25519-sk` or `ecdsa-sk`).
 * Calls onStatus when ssh-keygen prompts the user to touch their security key.
 */
function generateHardwareSshKey({
  sshDir = path.join(process.env.HOME || os.homedir(), '.ssh'),
  keyType = 'ed25519-sk',
  fileName = 'id_ed25519_sk',
  application = 'ssh:robos',
  requireTouch = true,
  verifyRequired = false,
  resident = false,
  comment = `robos-yubikey@${os.hostname()}`,
  passphrase = '',
  overwrite = false,
  onStatus,
} = {}) {
  return new Promise((resolve) => {
    const safeType = keyType === 'ecdsa-sk' ? 'ecdsa-sk' : 'ed25519-sk';
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `id_${safeType.replace('-', '_')}`;
    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    const privPath = path.join(sshDir, safeName);
    const pubPath = `${privPath}.pub`;

    if (fs.existsSync(privPath) && !overwrite) {
      return resolve({
        ok: false,
        error: `Key file already exists at ${privPath}. Enable Overwrite or pick a different filename.`,
      });
    }
    if (overwrite) {
      try { fs.unlinkSync(privPath); } catch {}
      try { fs.unlinkSync(pubPath); } catch {}
    }

    const args = ['-t', safeType, '-C', comment, '-f', privPath, '-N', passphrase || ''];
    if (application) args.push('-O', `application=${application}`);
    if (!requireTouch) args.push('-O', 'no-touch-required');
    if (verifyRequired) args.push('-O', 'verify-required');
    if (resident) args.push('-O', 'resident');

    if (onStatus) {
      onStatus({
        state: 'waiting-touch',
        message: 'Touch your flashing YubiKey to enroll the hardware-backed SSH key...',
      });
    }

    const proc = spawn('ssh-keygen', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let outBuf = '';
    proc.stdout.on('data', (d) => {
      outBuf += d.toString();
      if (onStatus && /touch|confirm user presence/i.test(outBuf)) {
        onStatus({ state: 'waiting-touch', message: 'Touch your YubiKey gold disc now to confirm user presence...' });
      }
    });
    proc.stderr.on('data', (d) => {
      outBuf += d.toString();
      if (onStatus && /touch|confirm user presence/i.test(outBuf)) {
        onStatus({ state: 'waiting-touch', message: 'Touch your YubiKey gold disc now to confirm user presence...' });
      }
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(pubPath)) {
        try { fs.chmodSync(privPath, 0o600); } catch {}
        const publicKey = fs.readFileSync(pubPath, 'utf8').trim();
        resolve({
          ok: true,
          keyType: safeType,
          privPath,
          pubPath,
          publicKey,
          output: outBuf.trim(),
        });
      } else {
        resolve({
          ok: false,
          error: outBuf.trim() || `ssh-keygen exited with code ${code}`,
        });
      }
    });
  });
}

/**
 * Sign and verify a test payload using a hardware-backed SSH key (`ssh-keygen -Y sign`).
 */
function testSshKeySignature({ keyPath, message = 'RobOS Hardware Key Verification Payload', namespace = 'robos.auth', onStatus } = {}) {
  return new Promise((resolve) => {
    if (!keyPath || !fs.existsSync(keyPath)) {
      return resolve({ ok: false, error: `SSH key not found: ${keyPath}` });
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-sk-sign-'));
    const msgFile = path.join(tmpDir, 'payload.txt');
    const sigFile = `${msgFile}.sig`;
    fs.writeFileSync(msgFile, message, 'utf8');

    if (onStatus) {
      onStatus({ state: 'waiting-touch', message: 'Touch your YubiKey to sign the payload with your SSH key...' });
    }

    const startTs = Date.now();
    const proc = spawn('ssh-keygen', ['-Y', 'sign', '-f', keyPath, '-n', namespace, msgFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let outBuf = '';
    proc.stdout.on('data', d => { outBuf += d.toString(); });
    proc.stderr.on('data', d => { outBuf += d.toString(); });

    proc.on('close', (code) => {
      const latencyMs = Date.now() - startTs;
      if (code === 0 && fs.existsSync(sigFile)) {
        const signature = fs.readFileSync(sigFile, 'utf8').trim();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        resolve({
          ok: true,
          keyPath,
          namespace,
          message,
          signature,
          latencyMs,
          signedAt: new Date().toISOString(),
        });
      } else {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        resolve({
          ok: false,
          error: outBuf.trim() || `ssh-keygen -Y sign exited with code ${code}`,
        });
      }
    });
  });
}

/**
 * Set or change FIDO2 PIN using ykman.
 */
function setOrChangeFidoPin({ currentPin = '', newPin = '' } = {}) {
  if (!newPin || newPin.length < 4) {
    return { ok: false, error: 'FIDO2 PIN must be at least 4 characters.' };
  }
  try {
    const args = ['fido', 'access', 'change-pin', '--new-pin', newPin];
    if (currentPin) {
      args.push('--pin', currentPin);
    }
    const out = execFileSync('ykman', args, { encoding: 'utf8', timeout: 8000 });
    return { ok: true, output: out.trim() };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: msg || 'Failed to update FIDO2 PIN' };
  }
}

/**
 * List Resident Keys (Passkeys) stored on the YubiKey via ykman.
 */
function listResidentCredentials({ pin = '' } = {}) {
  if (!pin) {
    return { ok: false, needsPin: true, error: 'Enter your FIDO2 PIN to view discoverable resident credentials (Passkeys).' };
  }
  try {
    const out = execFileSync('ykman', ['fido', 'credentials', 'list', '--pin', pin], {
      encoding: 'utf8',
      timeout: 8000,
    });
    const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
    // Filter out header line if present
    const credentials = [];
    for (const line of lines) {
      if (/^credential_id\s+rp_id/i.test(line) || /^-+\s+-+/.test(line)) continue;
      const parts = line.split(/\s{2,}|\t+/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        credentials.push({
          credentialId: parts[0],
          rpId: parts[1] || '',
          userName: parts[2] || '',
          displayName: parts[3] || '',
          raw: line,
        });
      } else {
        credentials.push({
          credentialId: line.split(/\s+/)[0] || line,
          rpId: line,
          userName: '',
          displayName: '',
          raw: line,
        });
      }
    }
    return { ok: true, credentials };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: msg || 'Unable to list resident credentials.' };
  }
}

/**
 * Delete a Resident Key (Passkey) by credential ID.
 */
function deleteResidentCredential({ credentialId, pin }) {
  if (!credentialId || !pin) {
    return { ok: false, error: 'Credential ID and FIDO2 PIN are required.' };
  }
  try {
    const out = execFileSync('ykman', ['fido', 'credentials', 'delete', '--force', '--pin', pin, credentialId], {
      encoding: 'utf8',
      timeout: 8000,
    });
    return { ok: true, output: out.trim() };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: msg || 'Failed to delete resident credential.' };
  }
}

/**
 * Inspect PAM U2F enrollment status (`~/.config/Yubico/u2f_keys`) and Git SSH commit signing status.
 */
function getSystemIntegrationStatus(homeDir = process.env.HOME || os.homedir()) {
  const u2fFile = path.join(homeDir, '.config', 'Yubico', 'u2f_keys');
  let pamEnrolled = false;
  let pamKeys = [];
  if (fs.existsSync(u2fFile)) {
    try {
      const content = fs.readFileSync(u2fFile, 'utf8').trim();
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const [user, ...rest] = line.split(':');
        if (user && rest.length > 0) {
          pamEnrolled = true;
          pamKeys.push({
            user,
            handleCount: Math.floor(rest.length / 2) || 1,
            preview: line.slice(0, 68) + (line.length > 68 ? '...' : ''),
          });
        }
      }
    } catch {}
  }

  let pamU2fModuleInstalled = false;
  for (const p of [
    '/lib/x86_64-linux-gnu/security/pam_u2f.so',
    '/usr/lib/x86_64-linux-gnu/security/pam_u2f.so',
    '/lib/security/pam_u2f.so',
    '/usr/bin/pamu2fcfg',
  ]) {
    if (fs.existsSync(p)) {
      pamU2fModuleInstalled = true;
      break;
    }
  }

  let gitGpgFormat = '';
  let gitSigningKey = '';
  let gitCommitSign = false;
  try {
    gitGpgFormat = execFileSync('git', ['config', '--global', '--get', 'gpg.format'], { encoding: 'utf8', timeout: 2000 }).trim();
  } catch {}
  try {
    gitSigningKey = execFileSync('git', ['config', '--global', '--get', 'user.signingkey'], { encoding: 'utf8', timeout: 2000 }).trim();
  } catch {}
  try {
    gitCommitSign = execFileSync('git', ['config', '--global', '--get', 'commit.gpgsign'], { encoding: 'utf8', timeout: 2000 }).trim() === 'true';
  } catch {}

  return {
    u2fFile,
    pamU2fModuleInstalled,
    pamEnrolled,
    pamKeys,
    pamSudoSnippet: 'auth sufficient pam_u2f.so cue [cue_prompt=Touch your YubiKey to approve]',
    gitSigning: {
      enabled: gitGpgFormat === 'ssh' && Boolean(gitSigningKey),
      gpgFormat: gitGpgFormat,
      signingKey: gitSigningKey,
      commitGpgSign: gitCommitSign,
    },
  };
}

/**
 * Enroll the connected YubiKey into ~/.config/Yubico/u2f_keys using pamu2fcfg.
 */
function enrollPamU2fKey({ homeDir = process.env.HOME || os.homedir(), onStatus } = {}) {
  return new Promise((resolve) => {
    if (onStatus) {
      onStatus({
        state: 'waiting-touch',
        message: 'Touch your flashing YubiKey to enroll PAM U2F login & sudo authentication...',
      });
    }
    const proc = spawn('pamu2fcfg', [], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim().includes(':')) {
        const u2fFile = path.join(homeDir, '.config', 'Yubico', 'u2f_keys');
        fs.mkdirSync(path.dirname(u2fFile), { recursive: true, mode: 0o700 });
        fs.writeFileSync(u2fFile, stdout.trim() + '\n', { mode: 0o600 });
        resolve({ ok: true, u2fFile, entry: stdout.trim() });
      } else {
        resolve({ ok: false, error: stderr.trim() || `pamu2fcfg exited with code ${code}` });
      }
    });
  });
}

/**
 * Configure global Git commit signing to use a hardware-backed SSH key.
 */
function configureGitHardwareSigning({ pubKeyPath }) {
  if (!pubKeyPath || !fs.existsSync(pubKeyPath)) {
    return { ok: false, error: `Public key file not found: ${pubKeyPath}` };
  }
  try {
    execFileSync('git', ['config', '--global', 'gpg.format', 'ssh']);
    execFileSync('git', ['config', '--global', 'user.signingkey', pubKeyPath]);
    execFileSync('git', ['config', '--global', 'commit.gpgsign', 'true']);
    return { ok: true, pubKeyPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  KNOWN_AAGUIDS,
  SECURITY_KEY_VENDORS,
  COSE_ALGORITHMS,
  formatAaguid,
  decodeFirmwareInt,
  loadConfig,
  saveConfig,
  parseYkmanInfo,
  scanHidrawDevices,
  detectHardwareKeys,
  runPhysicalTouchChallenge,
  listSshKeys,
  generateHardwareSshKey,
  testSshKeySignature,
  setOrChangeFidoPin,
  listResidentCredentials,
  deleteResidentCredential,
  getSystemIntegrationStatus,
  enrollPamU2fKey,
  configureGitHardwareSigning,
};
