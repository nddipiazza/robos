'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

let hkCore = null;
try {
  hkCore = require('../hardware-keys/lib/hardware-keys-core');
} catch {
  try {
    hkCore = require('/usr/local/share/robos/hardware-keys/lib/hardware-keys-core');
  } catch {}
}

function getDefaultVaultDir() {
  const base = process.env.ROBOS_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.config', 'robos');
  return path.join(base, 'vault');
}

function getDefaultKdbxPath() {
  if (process.env.ROBOS_KDBX_PATH) return process.env.ROBOS_KDBX_PATH;
  const settingsFile = path.join(getDefaultVaultDir(), 'vault-settings.json');
  try {
    if (fs.existsSync(settingsFile)) {
      const st = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (st.activeKdbxPath && (!st.activeKdbxPath.startsWith(os.tmpdir() + path.sep) || fs.existsSync(st.activeKdbxPath))) {
        return st.activeKdbxPath;
      }
    }
  } catch {}
  return path.join(getDefaultVaultDir(), 'robos-passwords.kdbx');
}

function setActiveKdbxPath(kdbxPath) {
  const resolved = path.resolve(kdbxPath);
  if (resolved.startsWith(os.tmpdir() + path.sep) && !process.env.ROBOS_CONFIG_DIR) {
    return { activeKdbxPath: resolved, recentDatabases: [resolved] };
  }
  const dir = getDefaultVaultDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const settingsFile = path.join(dir, 'vault-settings.json');
  let st = { recentDatabases: [] };
  try {
    if (fs.existsSync(settingsFile)) st = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {}
  st.activeKdbxPath = resolved;
  st.recentDatabases = [resolved, ...(st.recentDatabases || []).filter(p => p !== resolved && !p.startsWith(os.tmpdir() + path.sep))].slice(0, 10);
  fs.writeFileSync(settingsFile, JSON.stringify(st, null, 2) + '\n', { mode: 0o600 });
  return st;
}

function getFido2MetaPath(dbPath) {
  return `${dbPath}.fido2.json`;
}

function getVolatileSessionPath() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'default';
  const shmDir = fs.existsSync('/dev/shm') ? '/dev/shm' : os.tmpdir();
  return path.join(shmDir, `robos-kdbx-session-${uid}.json`);
}

function readVolatileSessions() {
  const p = getVolatileSessionPath();
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {}
  return {};
}

function writeVolatileSession(dbPath, secret, unlockedVia = 'password') {
  const p = getVolatileSessionPath();
  const all = readVolatileSessions();
  all[path.resolve(dbPath)] = {
    secret,
    unlockedVia,
    unlockedAt: new Date().toISOString(),
  };
  fs.writeFileSync(p, JSON.stringify(all), { mode: 0o600 });
}

function getUnlockedSecret(dbPath) {
  const all = readVolatileSessions();
  const item = all[path.resolve(dbPath)];
  return item ? item.secret : null;
}

function clearVolatileSession(dbPath) {
  const p = getVolatileSessionPath();
  if (!dbPath) {
    try { fs.unlinkSync(p); } catch {}
    return;
  }
  const all = readVolatileSessions();
  delete all[path.resolve(dbPath)];
  if (Object.keys(all).length === 0) {
    try { fs.unlinkSync(p); } catch {}
  } else {
    fs.writeFileSync(p, JSON.stringify(all), { mode: 0o600 });
  }
}

function loadFido2Binding(dbPath) {
  const metaPath = getFido2MetaPath(dbPath);
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
  } catch {}
  return null;
}

function saveFido2Binding(dbPath, binding) {
  const metaPath = getFido2MetaPath(dbPath);
  fs.mkdirSync(path.dirname(metaPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(metaPath, JSON.stringify(binding, null, 2) + '\n', { mode: 0o600 });
  return binding;
}

/**
 * Run keepassxc-cli with the database password piped on stdin.
 */
function runKeepassCli(args, stdinText = '', timeoutMs = 15000) {
  const out = execFileSync('keepassxc-cli', args, {
    input: stdinText,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return out;
}

/**
 * Enroll a FIDO2 credential with the `hmac-secret` CTAP2 extension and immediately evaluate
 * the 32-byte deterministic hardware secret for a 32-byte random salt.
 */
function enrollAndEvaluateFido2HmacSecret({ rpId = 'robos.keystore', pin = '', simulate = false, onStatus } = {}) {
  if (simulate) {
    const credIdHex = crypto.randomBytes(32).toString('hex');
    const saltHex = crypto.randomBytes(32).toString('hex');
    const hmacSecretHex = crypto
      .createHmac('sha256', Buffer.from('robos-simulated-yubikey-root-key'))
      .update(Buffer.from(saltHex, 'hex'))
      .digest('hex');
    if (onStatus) onStatus({ state: 'waiting-touch', message: 'Simulated YubiKey touch for keystore enrollment...' });
    return Promise.resolve({
      ok: true,
      simulated: true,
      rpId,
      credentialIdHex: credIdHex,
      saltHex,
      hmacSecretHex,
      deviceName: 'Simulated FIDO2 Security Key',
      aaguid: 'e77e3c64-05e3-428b-8824-0cbeb04b829d',
    });
  }

  return new Promise((resolve) => {
    const pyScript = `
import sys, os, json, hashlib
from fido2.hid import CtapHidDevice
from fido2.ctap2 import Ctap2, ClientPin

rp_id = sys.argv[1]
pin = sys.argv[2]

devs = list(CtapHidDevice.list_devices())
if not devs:
    print(json.dumps({"ok": False, "error": "No physical security key detected on USB/HID."}), flush=True)
    sys.exit(0)

dev = devs[0]
ctap = Ctap2(dev)
info = ctap.get_info()
exts = list(info.extensions or [])
if "hmac-secret" not in exts:
    print(json.dumps({"ok": False, "error": "Connected key does not support the FIDO2 hmac-secret extension."}), flush=True)
    sys.exit(0)

opts = dict(info.options or {})
pin_set = opts.get("clientPin", False)
cp = ClientPin(ctap)
pin_uv_param = None
pin_uv_proto = None

challenge = os.urandom(32)
cdh = hashlib.sha256(challenge).digest()

if pin_set:
    if not pin:
        print(json.dumps({"ok": False, "needsPin": True, "error": "This YubiKey has a FIDO2 PIN set. Enter your FIDO2 PIN to enroll it."}), flush=True)
        sys.exit(0)
    token = cp.get_pin_token(pin)
    pin_uv_param = cp.protocol.authenticate(token, cdh)
    pin_uv_proto = cp.protocol.VERSION

print(json.dumps({"event": "waiting-touch", "message": "Step 1/2: Touch your flashing YubiKey to create the Keystore FIDO2 credential..."}), flush=True)

att = ctap.make_credential(
    client_data_hash=cdh,
    rp={"id": rp_id, "name": "RobOS KeePassXC Keystore"},
    user={"id": os.urandom(16), "name": "robos-vault", "displayName": "RobOS Keystore"},
    key_params=[{"type": "public-key", "alg": -8}, {"type": "public-key", "alg": -7}],
    extensions={"hmac-secret": True},
    options={"rk": False},
    pin_uv_param=pin_uv_param,
    pin_uv_protocol=pin_uv_proto,
)

cred_id = att.auth_data.credential_data.credential_id
salt = os.urandom(32)

ka, shared_secret = cp._get_shared_secret()
salt_enc = cp.protocol.encrypt(shared_secret, salt)
salt_auth = cp.protocol.authenticate(shared_secret, salt_enc)

cdh2 = hashlib.sha256(os.urandom(32)).digest()
pin_uv_param2 = None
if pin_set and pin:
    token2 = cp.get_pin_token(pin)
    pin_uv_param2 = cp.protocol.authenticate(token2, cdh2)

print(json.dumps({"event": "waiting-touch", "message": "Step 2/2: Touch your flashing YubiKey again to seal the 256-bit hmac-secret vault key..."}), flush=True)

assertion = ctap.get_assertion(
    rp_id=rp_id,
    client_data_hash=cdh2,
    allow_list=[{"type": "public-key", "id": cred_id}],
    extensions={
        "hmac-secret": {
            1: ka,
            2: salt_enc,
            3: salt_auth,
            4: cp.protocol.VERSION,
        }
    },
    pin_uv_param=pin_uv_param2,
    pin_uv_protocol=pin_uv_proto,
)

enc_output = assertion.auth_data.extensions.get("hmac-secret")
hmac_secret = cp.protocol.decrypt(shared_secret, enc_output)

print(json.dumps({
    "ok": True,
    "simulated": False,
    "rpId": rp_id,
    "credentialIdHex": cred_id.hex(),
    "saltHex": salt.hex(),
    "hmacSecretHex": hmac_secret[:32].hex(),
    "deviceName": getattr(dev.descriptor, "product_name", "YubiKey FIDO2"),
    "aaguid": info.aaguid.hex() if info.aaguid else "",
}), flush=True)
`;

    const proc = spawn('python3', ['-c', pyScript, rpId, pin || ''], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let result = null;
    let errBuf = '';

    proc.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n').map(l => l.trim()).filter(Boolean)) {
        try {
          const msg = JSON.parse(line);
          if (msg.event === 'waiting-touch') {
            if (onStatus) onStatus({ state: 'waiting-touch', message: msg.message });
          } else if (typeof msg.ok === 'boolean') {
            result = msg;
          }
        } catch {}
      }
    });
    proc.stderr.on('data', (d) => { errBuf += d.toString(); });
    proc.on('close', () => {
      if (result) resolve(result);
      else resolve({ ok: false, error: errBuf.trim() || 'Physical key enrollment timed out or failed.' });
    });
  });
}

/**
 * Evaluate the deterministic 32-byte `hmac-secret` on the connected YubiKey to unlock a keystore.
 */
function evaluateFido2HmacSecret({ rpId = 'robos.keystore', credentialIdHex, saltHex, pin = '', simulate = false, onStatus } = {}) {
  if (simulate) {
    const hmacSecretHex = crypto
      .createHmac('sha256', Buffer.from('robos-simulated-yubikey-root-key'))
      .update(Buffer.from(saltHex, 'hex'))
      .digest('hex');
    if (onStatus) onStatus({ state: 'waiting-touch', message: 'Simulated YubiKey touch to unlock keystore...' });
    return Promise.resolve({
      ok: true,
      simulated: true,
      hmacSecretHex,
      latencyMs: 310,
    });
  }

  return new Promise((resolve) => {
    const pyScript = `
import sys, os, time, json, hashlib
from fido2.hid import CtapHidDevice
from fido2.ctap2 import Ctap2, ClientPin

rp_id = sys.argv[1]
cred_id = bytes.fromhex(sys.argv[2])
salt = bytes.fromhex(sys.argv[3])
pin = sys.argv[4]

devs = list(CtapHidDevice.list_devices())
if not devs:
    print(json.dumps({"ok": False, "error": "No physical YubiKey / FIDO2 key detected on USB. Plug in your key and try again."}), flush=True)
    sys.exit(0)

dev = devs[0]
ctap = Ctap2(dev)
info = ctap.get_info()
opts = dict(info.options or {})
pin_set = opts.get("clientPin", False)
cp = ClientPin(ctap)

ka, shared_secret = cp._get_shared_secret()
salt_enc = cp.protocol.encrypt(shared_secret, salt)
salt_auth = cp.protocol.authenticate(shared_secret, salt_enc)

cdh = hashlib.sha256(os.urandom(32)).digest()
pin_uv_param = None
pin_uv_proto = None
if pin_set and pin:
    token = cp.get_pin_token(pin)
    pin_uv_param = cp.protocol.authenticate(token, cdh)
    pin_uv_proto = cp.protocol.VERSION

print(json.dumps({"event": "waiting-touch", "message": "Touch the flashing gold contact on your YubiKey to unlock the keystore..."}), flush=True)
t0 = time.time()

assertion = ctap.get_assertion(
    rp_id=rp_id,
    client_data_hash=cdh,
    allow_list=[{"type": "public-key", "id": cred_id}],
    extensions={
        "hmac-secret": {
            1: ka,
            2: salt_enc,
            3: salt_auth,
            4: cp.protocol.VERSION,
        }
    },
    pin_uv_param=pin_uv_param,
    pin_uv_protocol=pin_uv_proto,
)

latency_ms = int((time.time() - t0) * 1000)
enc_output = assertion.auth_data.extensions.get("hmac-secret")
hmac_secret = cp.protocol.decrypt(shared_secret, enc_output)

print(json.dumps({
    "ok": True,
    "simulated": False,
    "hmacSecretHex": hmac_secret[:32].hex(),
    "latencyMs": latency_ms,
}), flush=True)
`;

    const proc = spawn('python3', ['-c', pyScript, rpId, credentialIdHex, saltHex, pin || ''], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let result = null;
    let errBuf = '';

    proc.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n').map(l => l.trim()).filter(Boolean)) {
        try {
          const msg = JSON.parse(line);
          if (msg.event === 'waiting-touch') {
            if (onStatus) onStatus({ state: 'waiting-touch', message: msg.message });
          } else if (typeof msg.ok === 'boolean') {
            result = msg;
          }
        } catch {}
      }
    });
    proc.stderr.on('data', (d) => { errBuf += d.toString(); });
    proc.on('close', () => {
      if (result) resolve(result);
      else resolve({ ok: false, error: errBuf.trim() || 'Physical touch unlock timed out or failed.' });
    });
  });
}

function deriveWrappingKey(hmacSecretHex, masterPassword = '', requireBoth2FA = false) {
  const hwBuf = Buffer.from(hmacSecretHex, 'hex');
  if (!requireBoth2FA) return hwBuf;
  return crypto.pbkdf2Sync(masterPassword || '', hwBuf, 100000, 32, 'sha256');
}

function wrapVaultSecret(vaultSecret, wrappingKeyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKeyBuf, iv);
  const enc = Buffer.concat([cipher.update(vaultSecret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ivHex: iv.toString('hex'),
    authTagHex: tag.toString('hex'),
    ciphertextHex: enc.toString('hex'),
  };
}

function unwrapVaultSecret({ ivHex, authTagHex, ciphertextHex }, wrappingKeyBuf) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    wrappingKeyBuf,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

function getVaultStatus({ dbPath = getDefaultKdbxPath() } = {}) {
  const resolved = path.resolve(dbPath);
  const exists = fs.existsSync(resolved);
  const unlockedSecret = getUnlockedSecret(resolved);
  const allSessions = readVolatileSessions();
  const sessionInfo = allSessions[resolved] || null;
  const fido2Binding = loadFido2Binding(resolved);

  let hardwareKeys = [];
  if (hkCore) {
    try {
      const hid = hkCore.scanHidrawDevices();
      hardwareKeys = hid;
    } catch {}
  }

  let sizeBytes = 0;
  let modifiedAt = null;
  if (exists) {
    try {
      const st = fs.statSync(resolved);
      sizeBytes = st.size;
      modifiedAt = st.mtime.toISOString();
    } catch {}
  }

  const settingsFile = path.join(getDefaultVaultDir(), 'vault-settings.json');
  let recentDatabases = [resolved];
  try {
    if (fs.existsSync(settingsFile)) {
      const st = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (Array.isArray(st.recentDatabases) && st.recentDatabases.length) {
        recentDatabases = st.recentDatabases;
      }
    }
  } catch {}

  const legacyPassDir = path.join(process.env.HOME || os.homedir(), '.password-store');
  const hasLegacyPassStore = fs.existsSync(path.join(legacyPassDir, '.gpg-id'));

  const fido2Enrolled = Boolean(fido2Binding && fido2Binding.credentialIdHex);
  const fido2Summary = fido2Binding ? {
    rpId: fido2Binding.rpId,
    deviceName: fido2Binding.deviceName,
    aaguid: fido2Binding.aaguid,
    requireBoth2FA: Boolean(fido2Binding.requireBoth2FA),
    hardwareOnly: Boolean(fido2Binding.hardwareOnly),
    mode: fido2Binding.hardwareOnly ? 'hardware-only' : (fido2Binding.requireBoth2FA ? '2fa' : 'hardware-unlock'),
    enrolledAt: fido2Binding.enrolledAt,
  } : null;

  return {
    ok: true,
    initialized: exists,
    exists,
    locked: !unlockedSecret,
    unlocked: Boolean(unlockedSecret),
    unlockedAt: sessionInfo ? sessionInfo.unlockedAt : null,
    unlockedVia: sessionInfo ? sessionInfo.unlockedVia : null,
    dbPath: resolved,
    dbFileName: path.basename(resolved),
    sizeBytes,
    modifiedAt,
    recentDatabases,
    fido2Enrolled,
    hasFido2Binding: fido2Enrolled,
    fido2Binding: fido2Summary,
    fido2Enrollment: fido2Summary,
    hardwareKeyConnected: hardwareKeys.length > 0,
    hardwareKeyName: hardwareKeys[0] ? hardwareKeys[0].name : null,
    hasLegacyPassStore,
  };
}

async function initDatabase({
  dbPath = getDefaultKdbxPath(),
  masterPassword = '',
  password = '',
  enrollHardwareKey = false,
  useHardwareKey = false,
  hardwareOnly = false,
  requireBoth2FA = false,
  pin = '',
  simulateHardware = false,
  simulate = false,
  onStatus,
} = {}) {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const effectivePassword = masterPassword || password;
  const shouldEnroll = enrollHardwareKey || useHardwareKey || hardwareOnly;
  const shouldSimulate = simulateHardware || simulate;

  let fidoRes = null;
  if (shouldEnroll) {
    fidoRes = await enrollAndEvaluateFido2HmacSecret({
      rpId: 'robos.keystore',
      pin,
      simulate: shouldSimulate,
      onStatus,
    });
    if (!fidoRes.ok) return fidoRes;
  }

  // Determine the actual secret that encrypts the .kdbx archive
  const vaultSecret = hardwareOnly
    ? fidoRes.hmacSecretHex
    : (effectivePassword || (fidoRes ? fidoRes.hmacSecretHex : ''));

  if (!vaultSecret) {
    return { ok: false, error: 'Provide a Master Password or enable Physical YubiKey Protection.' };
  }

  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    runKeepassCli(
      ['db-create', '-q', '-p', '-t', '150', resolved],
      `${vaultSecret}\n${vaultSecret}\n`
    );
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: `keepassxc-cli db-create failed: ${msg}` };
  }

  if (fidoRes) {
    const wrappingKey = deriveWrappingKey(fidoRes.hmacSecretHex, effectivePassword, requireBoth2FA);
    const wrapped = wrapVaultSecret(vaultSecret, wrappingKey);
    saveFido2Binding(resolved, {
      rpId: fidoRes.rpId,
      credentialIdHex: fidoRes.credentialIdHex,
      saltHex: fidoRes.saltHex,
      deviceName: fidoRes.deviceName,
      aaguid: fidoRes.aaguid,
      simulated: Boolean(fidoRes.simulated),
      hardwareOnly: Boolean(hardwareOnly),
      requireBoth2FA: Boolean(requireBoth2FA),
      ...wrapped,
      enrolledAt: new Date().toISOString(),
    });
  }

  setActiveKdbxPath(resolved);
  writeVolatileSession(resolved, vaultSecret, fidoRes ? 'hardware-key' : 'password');

  return {
    ok: true,
    dbPath: resolved,
    fido2Enrolled: Boolean(fidoRes),
    hardwareEnrolled: Boolean(fidoRes),
    status: getVaultStatus({ dbPath: resolved }),
  };
}

async function enrollHardwareKeyOnDatabase({
  dbPath = getDefaultKdbxPath(),
  masterPassword = '',
  requireBoth2FA = false,
  pin = '',
  simulate = false,
  onStatus,
} = {}) {
  const resolved = path.resolve(dbPath);
  const currentSecret = getUnlockedSecret(resolved) || masterPassword;
  if (!currentSecret) {
    return { ok: false, error: 'Unlock the keystore first or enter its Master Password to bind a physical key.' };
  }

  // Verify currentSecret actually opens the .kdbx database
  try {
    runKeepassCli(['ls', '-q', resolved], `${currentSecret}\n`);
  } catch {
    return { ok: false, error: 'Invalid Master Password for this .kdbx keystore.' };
  }

  const fidoRes = await enrollAndEvaluateFido2HmacSecret({
    rpId: 'robos.keystore',
    pin,
    simulate,
    onStatus,
  });
  if (!fidoRes.ok) return fidoRes;

  const wrappingKey = deriveWrappingKey(fidoRes.hmacSecretHex, masterPassword, requireBoth2FA);
  const wrapped = wrapVaultSecret(currentSecret, wrappingKey);
  const binding = saveFido2Binding(resolved, {
    rpId: fidoRes.rpId,
    credentialIdHex: fidoRes.credentialIdHex,
    saltHex: fidoRes.saltHex,
    deviceName: fidoRes.deviceName,
    aaguid: fidoRes.aaguid,
    simulated: Boolean(fidoRes.simulated),
    hardwareOnly: false,
    requireBoth2FA: Boolean(requireBoth2FA),
    ...wrapped,
    enrolledAt: new Date().toISOString(),
  });

  writeVolatileSession(resolved, currentSecret, 'hardware-key');
  return {
    ok: true,
    binding,
    status: getVaultStatus({ dbPath: resolved }),
  };
}

function unlockWithPassword({ dbPath = getDefaultKdbxPath(), masterPassword = '', password = '' } = {}) {
  const resolved = path.resolve(dbPath);
  const effectivePassword = masterPassword || password;
  if (!fs.existsSync(resolved)) {
    return { ok: false, notInitialized: true, error: `Keystore file not found: ${resolved}` };
  }
  const binding = loadFido2Binding(resolved);
  if (binding && binding.hardwareOnly) {
    return {
      ok: false,
      needsHardwareTouch: true,
      error: 'This keystore is sealed in Physical Key-Only mode. Touch your YubiKey to unlock it.',
    };
  }
  if (binding && binding.requireBoth2FA) {
    return {
      ok: false,
      needsHardwareTouch: true,
      error: 'This keystore requires both your Master Password and a physical YubiKey touch (2FA). Click "Unlock with Physical Key".',
    };
  }

  try {
    runKeepassCli(['ls', '-q', resolved], `${effectivePassword}\n`);
    setActiveKdbxPath(resolved);
    writeVolatileSession(resolved, effectivePassword, 'password');
    return { ok: true, unlockedVia: 'password', status: getVaultStatus({ dbPath: resolved }) };
  } catch {
    return { ok: false, error: 'Incorrect Master Password for this KeePassXC keystore.' };
  }
}

async function unlockWithHardwareKey({
  dbPath = getDefaultKdbxPath(),
  masterPassword = '',
  pin = '',
  simulate = false,
  onStatus,
} = {}) {
  const resolved = path.resolve(dbPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, notInitialized: true, error: `Keystore file not found: ${resolved}` };
  }
  const binding = loadFido2Binding(resolved);
  if (!binding || !binding.credentialIdHex || !binding.saltHex) {
    return {
      ok: false,
      error: 'No Physical Security Key is enrolled on this .kdbx keystore yet. Unlock with your password first and click "Bind Physical Key".',
    };
  }
  if (binding.requireBoth2FA && !masterPassword) {
    return {
      ok: false,
      needsPassword: true,
      error: 'This keystore uses Master Password + Physical Key 2FA. Enter your Master Password and click "Unlock with Physical Key".',
    };
  }

  const evalRes = await evaluateFido2HmacSecret({
    rpId: binding.rpId || 'robos.keystore',
    credentialIdHex: binding.credentialIdHex,
    saltHex: binding.saltHex,
    pin,
    simulate: simulate || Boolean(binding.simulated),
    onStatus,
  });
  if (!evalRes.ok) return evalRes;

  let vaultSecret;
  try {
    const wrappingKey = deriveWrappingKey(evalRes.hmacSecretHex, masterPassword, Boolean(binding.requireBoth2FA));
    vaultSecret = unwrapVaultSecret(binding, wrappingKey);
  } catch {
    return {
      ok: false,
      error: binding.requireBoth2FA
        ? 'Physical touch succeeded, but the Master Password or YubiKey did not match this keystore.'
        : 'Physical touch succeeded, but this YubiKey does not match the key enrolled on this keystore.',
    };
  }

  try {
    runKeepassCli(['ls', '-q', resolved], `${vaultSecret}\n`);
    setActiveKdbxPath(resolved);
    writeVolatileSession(resolved, vaultSecret, 'hardware-key');
    return {
      ok: true,
      unlockedVia: 'hardware-key',
      latencyMs: evalRes.latencyMs,
      status: getVaultStatus({ dbPath: resolved }),
    };
  } catch {
    return { ok: false, error: 'Failed to open .kdbx archive with unwrapped hardware secret.' };
  }
}

function lockDatabase({ dbPath } = {}) {
  clearVolatileSession(dbPath || null);
  return { ok: true, status: getVaultStatus({ dbPath: dbPath || getDefaultKdbxPath() }) };
}

function buildTreeFromFlatLines(lines) {
  const root = [];
  const dirMap = new Map();

  function ensureDir(dirPath) {
    const clean = dirPath.replace(/\/+$/, '');
    if (!clean) return root;
    if (dirMap.has(clean)) return dirMap.get(clean).children;

    const parts = clean.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const parentChildren = ensureDir(parentPath);

    const dirNode = { type: 'dir', name, path: clean, children: [] };
    parentChildren.push(dirNode);
    dirMap.set(clean, dirNode);
    return dirNode.children;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '[empty]') continue;
    // Skip Recycle Bin group in main tree unless desired
    if (line.startsWith('Recycle Bin/') || line === 'Recycle Bin') continue;

    if (line.endsWith('/')) {
      ensureDir(line.slice(0, -1));
    } else {
      const parts = line.split('/');
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      const parentChildren = ensureDir(parentPath);
      parentChildren.push({
        type: 'entry',
        name,
        path: line,
      });
    }
  }
  return root;
}

function listEntries({ dbPath = getDefaultKdbxPath() } = {}) {
  const resolved = path.resolve(dbPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, notInitialized: true, error: 'KeePassXC (.kdbx) keystore is not initialized yet.' };
  }
  const secret = getUnlockedSecret(resolved);
  if (!secret) {
    return { ok: true, locked: true, tree: [], status: getVaultStatus({ dbPath: resolved }) };
  }

  try {
    const out = runKeepassCli(['ls', '-q', '-R', '-f', resolved], `${secret}\n`);
    const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
    const entries = lines.filter(l => l && l !== '[empty]' && !l.endsWith('/') && !l.startsWith('Recycle Bin/') && l !== 'Recycle Bin');
    const tree = buildTreeFromFlatLines(lines);
    return {
      ok: true,
      locked: false,
      entries,
      tree,
      status: getVaultStatus({ dbPath: resolved }),
    };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: msg || 'Failed to list entries from .kdbx database' };
  }
}

function ensureGroupsExist(resolvedDbPath, secret, entryPath) {
  const parts = entryPath.split('/').filter(Boolean);
  if (parts.length <= 1) return;
  let currentGroup = '';
  for (let i = 0; i < parts.length - 1; i++) {
    currentGroup = currentGroup ? `${currentGroup}/${parts[i]}` : parts[i];
    try {
      runKeepassCli(['mkdir', '-q', resolvedDbPath, currentGroup], `${secret}\n`);
    } catch {
      // Group already exists
    }
  }
}

function getEntry({ dbPath = getDefaultKdbxPath(), entryPath }) {
  const resolved = path.resolve(dbPath);
  const secret = getUnlockedSecret(resolved);
  if (!secret) return { ok: false, locked: true, error: 'Keystore is locked. Unlock with your YubiKey or Master Password.' };

  try {
    const out = runKeepassCli(['show', '-q', '-s', resolved, entryPath], `${secret}\n`);
    const fields = {
      title: '',
      username: '',
      password: '',
      url: '',
      notes: '',
      uuid: '',
      tags: '',
    };
    let inNotes = false;
    const noteLines = [];
    for (const rawLine of out.split('\n')) {
      if (rawLine.startsWith('Title:')) { fields.title = rawLine.slice(6).trim(); inNotes = false; }
      else if (rawLine.startsWith('UserName:')) { fields.username = rawLine.slice(9).trim(); inNotes = false; }
      else if (rawLine.startsWith('Password:')) { fields.password = rawLine.slice(9).trim(); inNotes = false; }
      else if (rawLine.startsWith('URL:')) { fields.url = rawLine.slice(4).trim(); inNotes = false; }
      else if (rawLine.startsWith('Uuid:')) { fields.uuid = rawLine.slice(5).trim(); inNotes = false; }
      else if (rawLine.startsWith('Tags:')) { fields.tags = rawLine.slice(5).trim(); inNotes = false; }
      else if (rawLine.startsWith('Notes:')) {
        inNotes = true;
        const firstNote = rawLine.slice(6).trim();
        if (firstNote) noteLines.push(firstNote);
      } else if (inNotes) {
        noteLines.push(rawLine);
      }
    }
    fields.notes = noteLines.join('\n').trim();

    const metaParts = [];
    if (fields.username) metaParts.push(`UserName: ${fields.username}`);
    if (fields.url) metaParts.push(`URL: ${fields.url}`);
    if (fields.notes) metaParts.push(fields.notes);

    return {
      ok: true,
      ...fields,
      entry: { ...fields },
      meta: metaParts.join('\n'),
    };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: msg || `Entry not found: ${entryPath}` };
  }
}

function saveEntry({
  dbPath = getDefaultKdbxPath(),
  entryPath,
  username = '',
  password = '',
  url = '',
  notes = '',
}) {
  const resolved = path.resolve(dbPath);
  const secret = getUnlockedSecret(resolved);
  if (!secret) return { ok: false, locked: true, error: 'Keystore is locked.' };

  const cleanPath = String(entryPath || '').replace(/^\/+|\/+$/g, '').trim();
  if (!cleanPath) return { ok: false, error: 'Entry path is required.' };

  ensureGroupsExist(resolved, secret, cleanPath);

  // Check if entry already exists
  let exists = false;
  try {
    runKeepassCli(['show', '-q', resolved, cleanPath], `${secret}\n`);
    exists = true;
  } catch {}

  const cmd = exists ? 'edit' : 'add';
  const args = [cmd, '-q', '-p'];
  if (username !== undefined) args.push('-u', username);
  if (url !== undefined) args.push('--url', url);
  if (notes !== undefined) args.push('--notes', notes);
  args.push(resolved, cleanPath);

  try {
    runKeepassCli(args, `${secret}\n${password}\n`);
    return { ok: true, entryPath: cleanPath, updated: exists };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: msg || `Failed to ${cmd} entry ${cleanPath}` };
  }
}

function deleteEntry({ dbPath = getDefaultKdbxPath(), entryPath }) {
  const resolved = path.resolve(dbPath);
  const secret = getUnlockedSecret(resolved);
  if (!secret) return { ok: false, locked: true, error: 'Keystore is locked.' };

  try {
    runKeepassCli(['rm', '-q', resolved, entryPath], `${secret}\n`);
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: msg || `Failed to delete ${entryPath}` };
  }
}

function moveEntry({ dbPath = getDefaultKdbxPath(), from, to, fromPath, toPath }) {
  const resolved = path.resolve(dbPath);
  const secret = getUnlockedSecret(resolved);
  if (!secret) return { ok: false, locked: true, error: 'Keystore is locked.' };

  const src = String(from || fromPath || '').replace(/^\/+|\/+$/g, '').trim();
  const dst = String(to || toPath || '').replace(/^\/+|\/+$/g, '').trim();
  if (!src || !dst) return { ok: false, error: 'Source and destination paths are required.' };

  const existing = getEntry({ dbPath: resolved, entryPath: src });
  if (!existing.ok) return existing;

  const saved = saveEntry({
    dbPath: resolved,
    entryPath: dst,
    username: existing.username,
    password: existing.password,
    url: existing.url,
    notes: existing.notes,
  });
  if (!saved.ok) return saved;

  if (src !== dst) {
    deleteEntry({ dbPath: resolved, entryPath: src });
  }
  return { ok: true, from: src, to: dst };
}

function generatePassword({ length = 32, lower = true, upper = true, numeric = true, special = true } = {}) {
  try {
    const args = ['generate', '-L', String(length)];
    if (lower) args.push('-l');
    if (upper) args.push('-U');
    if (numeric) args.push('-n');
    if (special) args.push('-s');
    const pw = execFileSync('keepassxc-cli', args, { encoding: 'utf8', timeout: 5000 }).trim();
    let estimate = '';
    try {
      estimate = execFileSync('keepassxc-cli', ['estimate', pw], { encoding: 'utf8', timeout: 3000 }).trim();
    } catch {}
    return { ok: true, password: pw, estimate };
  } catch (e) {
    const fallback = crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length);
    return { ok: true, password: fallback, estimate: '' };
  }
}

function getDatabaseInfo({ dbPath = getDefaultKdbxPath() } = {}) {
  const resolved = path.resolve(dbPath);
  const secret = getUnlockedSecret(resolved);
  if (!secret) return { ok: false, locked: true, error: 'Keystore is locked.' };

  try {
    const raw = runKeepassCli(['db-info', '-q', resolved], `${secret}\n`);
    const info = {};
    for (const line of raw.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        info[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return { ok: true, info, raw: raw.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  getDefaultVaultDir,
  getDefaultKdbxPath,
  setActiveKdbxPath,
  getFido2MetaPath,
  loadFido2Binding,
  getVaultStatus,
  initDatabase,
  enrollHardwareKeyOnDatabase,
  unlockWithPassword,
  unlockWithHardwareKey,
  lockDatabase,
  listEntries,
  getEntry,
  saveEntry,
  deleteEntry,
  moveEntry,
  generatePassword,
  getDatabaseInfo,
};
