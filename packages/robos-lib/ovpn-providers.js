'use strict';

/**
 * RobOS OpenVPN Providers & Account Manager (`robos-lib/ovpn-providers`)
 *
 * Manages tracked OpenVPN providers (with IPVanish pre-configured as a first-class
 * built-in provider), `.ovpn` server profiles, and user VPN accounts across RobOS.
 *
 * Account metadata is persisted in `~/.config/robos/ovpn-accounts.json`.
 * Account passwords are stored in the GPG-encrypted UNIX password store (`pass`)
 * under `robos/ovpn/<providerId>/<accountId>` (never in plaintext settings files),
 * with an encrypted local keyfile fallback when `pass` is not initialized.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('node:https');
const { execFileSync, spawnSync } = require('node:child_process');

const BUILTIN_OVPN_PROVIDERS = {
  ipvanish: {
    id: 'ipvanish',
    name: 'IPVanish',
    builtin: true,
    website: 'https://www.ipvanish.com',
    configsUrl: 'https://configs.ipvanish.com/configs/',
    configsArchiveUrl: 'https://configs.ipvanish.com/configs/configs.zip',
    serverListUrl: 'https://www.ipvanish.com/api/servers.geojson',
    caCertFilename: 'ca.ipvanish.com.crt',
    authType: 'user-pass',
    defaultProtocol: 'udp',
    defaultPort: 443,
    cipher: 'AES-256-CBC',
    authDigest: 'SHA256',
    dnsServers: ['198.18.0.1', '198.18.0.2', '1.1.1.1', '9.9.9.9'],
    description: 'IPVanish high-speed OpenVPN network with 3,598 server configs across 90+ locations (from https://configs.ipvanish.com/configs/).',
    credentialHelp: 'Enter your IPVanish OpenVPN username and password (found in your IPVanish Account Dashboard under Service Credentials / OpenVPN).',
    curatedServers: [
      { id: 'ipvanish-US-New-York-nyc-a01', country: 'US', city: 'New York', hostname: 'nyc-a01.ipvanish.com', ip: '173.255.160.9', port: 443, proto: 'udp' },
      { id: 'ipvanish-US-Chicago-chi-b01', country: 'US', city: 'Chicago', hostname: 'chi-b01.ipvanish.com', ip: '216.131.76.3', port: 443, proto: 'udp' },
      { id: 'ipvanish-US-Los-Angeles-lax-b01', country: 'US', city: 'Los Angeles', hostname: 'lax-b01.ipvanish.com', ip: '216.131.80.3', port: 443, proto: 'udp' },
      { id: 'ipvanish-US-Dallas-dal-b01', country: 'US', city: 'Dallas', hostname: 'dal-b01.ipvanish.com', ip: '216.131.78.2', port: 443, proto: 'udp' },
      { id: 'ipvanish-US-Seattle-sea-a01', country: 'US', city: 'Seattle', hostname: 'sea-a01.ipvanish.com', ip: '209.107.214.7', port: 443, proto: 'udp' },
      { id: 'ipvanish-US-Miami-mia-b01', country: 'US', city: 'Miami', hostname: 'mia-b01.ipvanish.com', ip: '216.131.87.3', port: 443, proto: 'udp' },
      { id: 'ipvanish-UK-London-lon-a01', country: 'UK', city: 'London', hostname: 'lon-a01.ipvanish.com', ip: '185.91.122.6', port: 443, proto: 'udp' },
      { id: 'ipvanish-NL-Amsterdam-ams-a01', country: 'NL', city: 'Amsterdam', hostname: 'ams-a01.ipvanish.com', ip: '176.67.80.6', port: 443, proto: 'udp' },
      { id: 'ipvanish-DE-Frankfurt-fra-a01', country: 'DE', city: 'Frankfurt', hostname: 'fra-a01.ipvanish.com', ip: '216.131.114.6', port: 443, proto: 'udp' },
      { id: 'ipvanish-CA-Toronto-tor-b01', country: 'CA', city: 'Toronto', hostname: 'tor-b01.ipvanish.com', ip: '104.36.180.35', port: 443, proto: 'udp' },
      { id: 'ipvanish-CH-Zurich-zrh-c01', country: 'CH', city: 'Zurich', hostname: 'zrh-c01.ipvanish.com', ip: '216.131.108.2', port: 443, proto: 'udp' },
      { id: 'ipvanish-SG-Singapore-sin-a01', country: 'SG', city: 'Singapore', hostname: 'sin-a01.ipvanish.com', ip: '108.171.108.6', port: 443, proto: 'udp' },
      { id: 'ipvanish-JP-Tokyo-nrt-a01', country: 'JP', city: 'Tokyo', hostname: 'nrt-a01.ipvanish.com', ip: '64.145.90.6', port: 443, proto: 'udp' },
      { id: 'ipvanish-AU-Sydney-syd-b01', country: 'AU', city: 'Sydney', hostname: 'syd-b01.ipvanish.com', ip: '173.245.209.4', port: 443, proto: 'udp' },
    ],
  },
  protonvpn: {
    id: 'protonvpn',
    name: 'ProtonVPN (OpenVPN)',
    builtin: true,
    website: 'https://protonvpn.com',
    configsUrl: 'https://account.protonvpn.com/downloads',
    authType: 'user-pass',
    defaultProtocol: 'udp',
    defaultPort: 1194,
    cipher: 'AES-256-GCM',
    authDigest: 'SHA512',
    dnsServers: ['10.8.8.1', '1.1.1.1'],
    description: 'ProtonVPN OpenVPN configuration profiles with OpenVPN / IKEv2 service credentials.',
    credentialHelp: 'Use your ProtonVPN OpenVPN / IKEv2 username and password from Account → OpenVPN / IKEv2 username.',
    curatedServers: [],
  },
  mullvad: {
    id: 'mullvad',
    name: 'Mullvad VPN (OpenVPN)',
    builtin: true,
    website: 'https://mullvad.net',
    configsUrl: 'https://mullvad.net/en/download/vpn/openvpn-config',
    authType: 'user-pass',
    defaultProtocol: 'udp',
    defaultPort: 1194,
    cipher: 'AES-256-GCM',
    authDigest: 'SHA256',
    dnsServers: ['10.8.0.1', '194.242.2.2'],
    description: 'Mullvad privacy-focused OpenVPN profiles using account number + "m" password.',
    credentialHelp: 'Use your 16-digit Mullvad account number as username and "m" as the password.',
    curatedServers: [],
  },
  nordvpn: {
    id: 'nordvpn',
    name: 'NordVPN (OpenVPN)',
    builtin: true,
    website: 'https://nordvpn.com',
    configsUrl: 'https://nordvpn.com/ovpn/',
    authType: 'user-pass',
    defaultProtocol: 'udp',
    defaultPort: 1194,
    cipher: 'AES-256-GCM',
    authDigest: 'SHA512',
    dnsServers: ['103.86.96.100', '103.86.99.100'],
    description: 'NordVPN manual OpenVPN UDP/TCP server configurations.',
    credentialHelp: 'Use your NordVPN Manual Setup service credentials (not your email/password).',
    curatedServers: [],
  },
  custom: {
    id: 'custom',
    name: 'Custom OpenVPN (.ovpn)',
    builtin: true,
    website: 'https://openvpn.net',
    configsUrl: '',
    authType: 'user-pass',
    defaultProtocol: 'udp',
    defaultPort: 1194,
    cipher: 'AES-256-GCM',
    authDigest: 'SHA256',
    dnsServers: ['1.1.1.1', '9.9.9.9'],
    description: 'Bring your own .ovpn profile from any commercial or self-hosted OpenVPN server.',
    credentialHelp: 'Import any .ovpn file and enter the username/password if required by the profile.',
    curatedServers: [],
  },
};

// Official IPVanish Root CA Certificate (distributed in https://configs.ipvanish.com/openvpn/v2.6.0-0/configs.zip)
const IPVANISH_CA_CERT = `-----BEGIN CERTIFICATE-----
MIIErzCCA5egAwIBAgIJAMYKzSS8uPKDMA0GCSqGSIb3DQEBDQUAMIGVMQswCQYD
VQQGEwJVUzELMAkGA1UECBMCRkwxFDASBgNVBAcTC1dpbnRlciBQYXJrMREwDwYD
VQQKEwhJUFZhbmlzaDEVMBMGA1UECxMMSVBWYW5pc2ggVlBOMRQwEgYDVQQDEwtJ
UFZhbmlzaCBDQTEjMCEGCSqGSIb3DQEJARYUc3VwcG9ydEBpcHZhbmlzaC5jb20w
IBcNMjIwNTA5MjAyMDQ1WhgPMjA4MjA0MjQyMDIwNDVaMIGVMQswCQYDVQQGEwJV
UzELMAkGA1UECBMCRkwxFDASBgNVBAcTC1dpbnRlciBQYXJrMREwDwYDVQQKEwhJ
UFZhbmlzaDEVMBMGA1UECxMMSVBWYW5pc2ggVlBOMRQwEgYDVQQDEwtJUFZhbmlz
aCBDQTEjMCEGCSqGSIb3DQEJARYUc3VwcG9ydEBpcHZhbmlzaC5jb20wggEiMA0G
CSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC30MFY2v8go65jdOYM/nHu9hlHQMbE
ttdTxPIDMFuNS0UUxuHGUeJdVCtkeaDOKH3jHsGBczu1amYwphVv6A1qox1YTrzR
Cbec7CaHL926VcOQQcDAPTmL+JPHhlpR21Xa+woHFGDW90LgASLAPtupXgc6LXfF
wb3vVpDnkyPUp4J0DRo2+lq3UtbHaONbGx8jyzYu/kWSiLUc7X69OedoSwlmsGAC
Qteki2o/b0uKTf84Ei+QEjGUquGJU+LETmo2IP55I+KuyZE6+zIiiegm25jgPDkr
qlw2UrJiLCjUg4VhTdjF9/AUmT5tJbhZUGGx1/l0bGr+44ea7PmB3DELAgMBAAGj
gf0wgfowDAYDVR0TBAUwAwEB/zAdBgNVHQ4EFgQUS/0UJYkd58Fwg9f2nxEcJU4Z
7q4wgcoGA1UdIwSBwjCBv4AUS/0UJYkd58Fwg9f2nxEcJU4Z7q6hgZukgZgwgZUx
CzAJBgNVBAYTAlVTMQswCQYDVQQIEwJGTDEUMBIGA1UEBxMLV2ludGVyIFBhcmsx
ETAPBgNVBAoTCElQVmFuaXNoMRUwEwYDVQQLEwxJUFZhbmlzaCBWUE4xFDASBgNV
BAMTC0lQVmFuaXNoIENBMSMwIQYJKoZIhvcNAQkBFhRzdXBwb3J0QGlwdmFuaXNo
LmNvbYIJAMYKzSS8uPKDMA0GCSqGSIb3DQEBDQUAA4IBAQCc9JV7IR8BfBrF/BQT
Xg0SZMZyyMAxR2jfW9qMHKSeJuZVVjfHiqoynEgBCNbn71wZWv3OF/Thu9BJ4GiY
J2Bc9nIa90D1NGYgiOVYLGXfUUqy5FgfrsWh0Go5oYm9l7W9pWfIifwsaZynkY0r
TIHn32FF0H3+wZrGrEUzVL6qi+KD8iR3cBbLT+xUzulMTBp4JYaQnxpV4fZNS0Zs
NrWKFWz4Iz1SSBcsnvUhfWs1aKx4yOJQx33Pc+KwpUI+meTlMjoh+AoTriooKU2M
bOqLQl32y3pR0MP3fX4HDVFRylxdckEc+VryGNHQLUJiIBKBCORih/YiRhtEhpoB
xmkw
-----END CERTIFICATE-----
`;

function buildIpvanishOvpnContent(server, caCertPath) {
  const proto = (server.proto || 'udp').toLowerCase();
  const port = server.port || 443;
  return [
    `# IPVanish OpenVPN Configuration — ${server.country} - ${server.city} (${server.hostname})`,
    `# Generated/Managed by RobOS VPN Sandbox`,
    `client`,
    `dev tun`,
    `proto ${proto}`,
    `remote ${server.hostname} ${port}`,
    ...(server.ip ? [`# Resolved Fallback IP: ${server.ip}`] : []),
    `resolv-retry infinite`,
    `nobind`,
    `persist-tun`,
    `persist-remote-ip`,
    ...(caCertPath ? [`ca "${caCertPath}"`] : []),
    `verify-x509-name ${server.hostname} name`,
    `auth-user-pass`,
    `comp-lzo`,
    `verb 3`,
    `auth SHA256`,
    `data-ciphers AES-256-GCM:AES-256-CBC`,
    `data-ciphers-fallback AES-256-CBC`,
    `tls-cipher TLS-DHE-RSA-WITH-AES-256-CBC-SHA:TLS-DHE-DSS-WITH-AES-256-CBC-SHA:TLS-RSA-WITH-AES-256-CBC-SHA`,
    `setenv CLIENT_CERT 0`,
    `<ca>`,
    IPVANISH_CA_CERT.trim(),
    `</ca>`,
    ``,
  ].join('\n');
}

/**
 * Parse an `.ovpn` configuration string and extract remote servers, protocol, dev type, etc.
 */
function parseOvpnConfig(content = '') {
  const lines = String(content || '').split(/\r?\n/);
  const remotes = [];
  let defaultProto = 'udp';
  let defaultPort = 1194;
  let dev = 'tun';
  let requiresAuthUserPass = false;
  let hasInlineCa = content.includes('<ca>');
  let caFile = null;
  const fallbackIps = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const fallbackMatch = trimmed.match(/^#\s*Resolved Fallback IP:\s*(\S+)/i);
    if (fallbackMatch) {
      fallbackIps.push(fallbackMatch[1]);
      continue;
    }
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const line = trimmed.replace(/\s+#.*$/, '');
    const parts = line.split(/\s+/);
    const directive = parts[0].toLowerCase();

    if (directive === 'proto' && parts[1]) {
      defaultProto = parts[1].toLowerCase().replace(/^tcp.*/, 'tcp').replace(/^udp.*/, 'udp');
    } else if (directive === 'port' && parts[1]) {
      const p = parseInt(parts[1], 10);
      if (!Number.isNaN(p)) defaultPort = p;
    } else if (directive === 'dev' && parts[1]) {
      dev = parts[1];
    } else if (directive === 'auth-user-pass') {
      requiresAuthUserPass = true;
    } else if (directive === 'ca' && parts[1]) {
      caFile = parts.slice(1).join(' ').replace(/^["']|["']$/g, '');
    } else if (directive === 'remote' && parts[1]) {
      const host = parts[1];
      const port = parts[2] ? parseInt(parts[2], 10) : null;
      const proto = parts[3] ? parts[3].toLowerCase().replace(/^tcp.*/, 'tcp').replace(/^udp.*/, 'udp') : null;
      remotes.push({ host, port, proto });
    }
  }

  const normalizedRemotes = remotes.map((r, idx) => ({
    host: r.host,
    port: r.port || defaultPort,
    proto: r.proto || defaultProto,
    ip: /^\d+\.\d+\.\d+\.\d+$/.test(r.host) ? r.host : (fallbackIps[idx] || null),
  }));

  return {
    remotes: normalizedRemotes,
    proto: normalizedRemotes[0]?.proto || defaultProto,
    port: normalizedRemotes[0]?.port || defaultPort,
    dev,
    requiresAuthUserPass,
    hasInlineCa,
    caFile,
  };
}

function createOvpnManager(options = {}) {
  const configDir = options.configDir || process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
  const passStoreDir = options.passStoreDir || process.env.PASSWORD_STORE_DIR || path.join(os.homedir(), '.password-store');
  const accountsFile = path.join(configDir, 'ovpn-accounts.json');
  const providersFile = path.join(configDir, 'ovpn-providers.json');
  const profilesRoot = path.join(configDir, 'ovpn', 'profiles');
  const vaultFile = path.join(configDir, 'ovpn', '.vault.enc.json');
  const vaultKeyFile = path.join(configDir, 'ovpn', '.vault.key');

  function ensureDirs() {
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(profilesRoot, { recursive: true });
  }

  function patchDirForModernOpenvpn(dirPath) {
    try {
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.ovpn'));
      for (const file of files) {
        const p = path.join(dirPath, file);
        const raw = fs.readFileSync(p, 'utf8');
        if (raw.includes('\nkeysize ') || raw.startsWith('keysize ')) {
          const lines = raw.split(/\r?\n/).filter(l => !l.trim().startsWith('keysize '));
          if (!lines.some(l => l.trim().startsWith('data-ciphers '))) {
            lines.push('data-ciphers AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-256-CBC');
            lines.push('data-ciphers-fallback AES-256-CBC');
          }
          fs.writeFileSync(p, lines.join('\n') + '\n', { mode: 0o644 });
        }
      }
    } catch {}
  }

  function ensureIpvanishProfiles() {
    ensureDirs();
    const ipvDir = path.join(profilesRoot, 'ipvanish');
    fs.mkdirSync(ipvDir, { recursive: true });
    const caPath = path.join(ipvDir, BUILTIN_OVPN_PROVIDERS.ipvanish.caCertFilename);
    fs.writeFileSync(caPath, IPVANISH_CA_CERT, { mode: 0o644 });

    // Extract bundled full 3,598-server IPVanish archive if present and directory isn't populated yet
    const bundleArchive = path.join(__dirname, 'assets', 'ipvanish-configs.tar.xz');
    const isCustomTestDir = Boolean(options.configDir && options.extractFullBundle !== true);
    if (!isCustomTestDir && fs.existsSync(bundleArchive)) {
      try {
        const existingCount = fs.readdirSync(ipvDir).filter(f => f.endsWith('.ovpn')).length;
        if (existingCount < 100) {
          spawnSync('tar', ['-xJf', bundleArchive, '-C', ipvDir], { timeout: 15000 });
        }
      } catch {}
    }

    for (const server of BUILTIN_OVPN_PROVIDERS.ipvanish.curatedServers) {
      const ovpnPath = path.join(ipvDir, `${server.id}.ovpn`);
      if (!fs.existsSync(ovpnPath)) {
        fs.writeFileSync(ovpnPath, buildIpvanishOvpnContent(server, caPath), { mode: 0o644 });
      }
    }
    return ipvDir;
  }

  function passReady() {
    return fs.existsSync(path.join(passStoreDir, '.gpg-id'));
  }

  function passEntryPath(providerId, accountId) {
    return `robos/ovpn/${providerId}/${accountId}`;
  }

  // Encrypted local fallback vault for environments where `pass` GPG store isn't initialized yet
  function getVaultKey() {
    ensureDirs();
    if (fs.existsSync(vaultKeyFile)) {
      return Buffer.from(fs.readFileSync(vaultKeyFile, 'utf8').trim(), 'hex');
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(vaultKeyFile, key.toString('hex'), { mode: 0o600 });
    return key;
  }

  function readLocalVault() {
    try {
      if (!fs.existsSync(vaultFile)) return {};
      return JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
    } catch {
      return {};
    }
  }

  function writeLocalVault(data) {
    ensureDirs();
    fs.writeFileSync(vaultFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  function saveSecret(providerId, accountId, secretValue) {
    const clean = String(secretValue || '').trim();
    if (!clean) throw new Error('Password cannot be empty.');
    const entry = passEntryPath(providerId, accountId);

    if (passReady() && options.usePass !== false) {
      const res = spawnSync('pass', ['insert', '--multiline', '--force', entry], {
        input: clean + '\n',
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, PASSWORD_STORE_DIR: passStoreDir },
      });
      if (res.status === 0 && !res.error) {
        return { storage: 'pass', passPath: entry };
      }
    }

    // Encrypted AES-256-GCM local vault fallback so credentials are never plaintext
    const key = getVaultKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const vault = readLocalVault();
    vault[entry] = {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
      updatedAt: new Date().toISOString(),
    };
    writeLocalVault(vault);
    return { storage: 'vault', passPath: entry };
  }

  function hasSecret(providerId, accountId) {
    const entry = passEntryPath(providerId, accountId);
    if (fs.existsSync(path.join(passStoreDir, entry + '.gpg'))) return true;
    const vault = readLocalVault();
    return Boolean(vault[entry]?.data);
  }

  function readSecret(providerId, accountId) {
    const entry = passEntryPath(providerId, accountId);
    if (fs.existsSync(path.join(passStoreDir, entry + '.gpg')) && options.usePass !== false) {
      try {
        const out = execFileSync('pass', ['show', entry], {
          encoding: 'utf8',
          timeout: 15000,
          stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...process.env, PASSWORD_STORE_DIR: passStoreDir },
        });
        const firstLine = out.split(/\r?\n/)[0]?.trim();
        if (firstLine) return firstLine;
      } catch {
        // Fall through to local vault if pass is locked
      }
    }
    const vault = readLocalVault();
    const rec = vault[entry];
    if (!rec) return '';
    try {
      const key = getVaultKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(rec.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(rec.tag, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(rec.data, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  function deleteSecret(providerId, accountId) {
    const entry = passEntryPath(providerId, accountId);
    if (fs.existsSync(path.join(passStoreDir, entry + '.gpg')) && options.usePass !== false) {
      try {
        spawnSync('pass', ['rm', '--force', entry], {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, PASSWORD_STORE_DIR: passStoreDir },
        });
      } catch {}
    }
    const vault = readLocalVault();
    if (vault[entry]) {
      delete vault[entry];
      writeLocalVault(vault);
    }
  }

  function readCustomProviders() {
    try {
      if (!fs.existsSync(providersFile)) return [];
      const parsed = JSON.parse(fs.readFileSync(providersFile, 'utf8'));
      return Array.isArray(parsed.providers) ? parsed.providers : [];
    } catch {
      return [];
    }
  }

  function writeCustomProviders(providers) {
    ensureDirs();
    fs.writeFileSync(providersFile, JSON.stringify({ providers }, null, 2), { mode: 0o600 });
  }

  function listProviders() {
    ensureIpvanishProfiles();
    const custom = readCustomProviders();
    const all = [
      ...Object.values(BUILTIN_OVPN_PROVIDERS),
      ...custom.filter(p => p && p.id && !BUILTIN_OVPN_PROVIDERS[p.id]),
    ];
    return all.map(p => ({
      ...p,
      profiles: listProfiles(p.id),
    }));
  }

  function getProvider(providerId) {
    const providers = listProviders();
    return providers.find(p => p.id === providerId) || null;
  }

  function addCustomProvider(providerInput = {}) {
    const rawId = String(providerInput.id || providerInput.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!rawId) throw new Error('Provider ID or name is required.');
    if (BUILTIN_OVPN_PROVIDERS[rawId]) {
      throw new Error(`Provider "${rawId}" is already a built-in provider.`);
    }
    const custom = readCustomProviders().filter(p => p.id !== rawId);
    const provider = {
      id: rawId,
      name: String(providerInput.name || rawId).trim(),
      builtin: false,
      website: String(providerInput.website || '').trim(),
      configsUrl: String(providerInput.configsUrl || '').trim(),
      authType: providerInput.authType || 'user-pass',
      defaultProtocol: providerInput.defaultProtocol || 'udp',
      defaultPort: Number(providerInput.defaultPort) || 1194,
      cipher: providerInput.cipher || 'AES-256-GCM',
      authDigest: providerInput.authDigest || 'SHA256',
      dnsServers: Array.isArray(providerInput.dnsServers) && providerInput.dnsServers.length
        ? providerInput.dnsServers
        : ['1.1.1.1', '9.9.9.9'],
      description: String(providerInput.description || 'Custom OpenVPN provider').trim(),
      credentialHelp: String(providerInput.credentialHelp || 'Enter your OpenVPN username and password.').trim(),
      curatedServers: [],
    };
    custom.push(provider);
    writeCustomProviders(custom);
    fs.mkdirSync(path.join(profilesRoot, rawId), { recursive: true });
    return provider;
  }

  function removeCustomProvider(providerId) {
    if (BUILTIN_OVPN_PROVIDERS[providerId]) {
      throw new Error('Built-in OpenVPN providers cannot be removed.');
    }
    const custom = readCustomProviders().filter(p => p.id !== providerId);
    writeCustomProviders(custom);
    return { ok: true };
  }

  function listProfiles(providerId = 'ipvanish') {
    if (providerId === 'ipvanish') ensureIpvanishProfiles();
    const dir = path.join(profilesRoot, providerId);
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ovpn')).sort();
    const curatedMap = new Map(
      (BUILTIN_OVPN_PROVIDERS[providerId]?.curatedServers || []).map(s => [s.id, s])
    );

    return files.map(filename => {
      const id = filename.slice(0, -5);
      const fullPath = path.join(dir, filename);
      const curated = curatedMap.get(id);
      // Fast-path for standard IPVanish naming convention: ipvanish-US-New-York-nyc-a01
      const ipvMatch = id.match(/^ipvanish-([A-Z]{2})-(.+)-([a-z]{3}-[a-z0-9]+)$/i);
      if (ipvMatch && files.length > 50) {
        const country = ipvMatch[1].toUpperCase();
        const city = ipvMatch[2].replace(/---/g, ' - ').replace(/-/g, ' ');
        const serverCode = ipvMatch[3].toLowerCase();
        const hostname = curated?.hostname || `${serverCode}.ipvanish.com`;
        return {
          id,
          filename,
          path: fullPath,
          providerId,
          country,
          city,
          hostname,
          ip: curated?.ip || null,
          port: curated?.port || 443,
          proto: curated?.proto || 'udp',
          label: `${country} — ${city} (${hostname})`,
        };
      }

      let parsed = { remotes: [], proto: 'udp', port: 443 };
      try {
        parsed = parseOvpnConfig(fs.readFileSync(fullPath, 'utf8'));
      } catch {}
      const remote = parsed.remotes[0] || {};
      const country = curated?.country || (ipvMatch ? ipvMatch[1].toUpperCase() : '');
      const city = curated?.city || (ipvMatch ? ipvMatch[2].replace(/---/g, ' - ').replace(/-/g, ' ') : '');
      const hostname = remote.host || curated?.hostname || (ipvMatch ? `${ipvMatch[3].toLowerCase()}.ipvanish.com` : '');
      return {
        id,
        filename,
        path: fullPath,
        providerId,
        country,
        city,
        hostname,
        ip: remote.ip || curated?.ip || null,
        port: remote.port || curated?.port || parsed.port || 443,
        proto: remote.proto || curated?.proto || parsed.proto || 'udp',
        label: country && city
          ? `${country} — ${city} (${hostname || id})`
          : `${id}${hostname ? ' (' + hostname + ')' : ''}`,
      };
    });
  }

  function importOvpnProfile({ providerId = 'ipvanish', filename, filePath, content, caCertContent, caCertFilename }) {
    ensureDirs();
    const pDir = path.join(profilesRoot, providerId);
    fs.mkdirSync(pDir, { recursive: true });

    let rawContent = content;
    let targetName = filename;
    if (!rawContent && filePath) {
      rawContent = fs.readFileSync(filePath, 'utf8');
      if (!targetName) targetName = path.basename(filePath);
    }
    if (!rawContent) throw new Error('No .ovpn content provided to import.');
    if (!targetName) targetName = `profile-${Date.now()}.ovpn`;
    if (!targetName.endsWith('.ovpn')) targetName += '.ovpn';
    const safeName = path.basename(targetName).replace(/[^a-zA-Z0-9._-]/g, '_');

    if (caCertContent) {
      const caName = path.basename(caCertFilename || 'ca.crt');
      fs.writeFileSync(path.join(pDir, caName), caCertContent, { mode: 0o644 });
    } else if (filePath) {
      // If the source directory has a referenced ca cert (e.g., ca.ipvanish.com.crt), copy it alongside
      const parsed = parseOvpnConfig(rawContent);
      if (parsed.caFile && !path.isAbsolute(parsed.caFile)) {
        const siblingCa = path.join(path.dirname(filePath), parsed.caFile);
        if (fs.existsSync(siblingCa)) {
          fs.copyFileSync(siblingCa, path.join(pDir, path.basename(parsed.caFile)));
        }
      }
    }

    const destPath = path.join(pDir, safeName);
    fs.writeFileSync(destPath, rawContent, { mode: 0o644 });
    return {
      ok: true,
      profileId: safeName.slice(0, -5),
      path: destPath,
      parsed: parseOvpnConfig(rawContent),
    };
  }

  /**
   * Downloads and extracts IPVanish official OpenVPN configs from https://configs.ipvanish.com/configs/configs.zip
   * Falls back cleanly to curated profiles if offline.
   */
  async function syncProviderProfiles(providerId = 'ipvanish') {
    if (providerId === 'ipvanish') {
      const ipvDir = ensureIpvanishProfiles();
      const tmpZip = path.join(os.tmpdir(), `ipvanish-configs-${process.pid}.zip`);
      try {
        await new Promise((resolve, reject) => {
          const req = https.get(BUILTIN_OVPN_PROVIDERS.ipvanish.configsArchiveUrl, { timeout: 12000 }, res => {
            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const fileStream = fs.createWriteStream(tmpZip);
            res.pipe(fileStream);
            fileStream.on('finish', () => fileStream.close(resolve));
            fileStream.on('error', reject);
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(new Error('Timeout downloading configs.zip')); });
        });

        const unzipRes = spawnSync('unzip', ['-o', '-q', tmpZip, '-d', ipvDir], { timeout: 20000 });
        try { fs.unlinkSync(tmpZip); } catch {}
        patchDirForModernOpenvpn(ipvDir);
        const profiles = listProfiles('ipvanish');
        return {
          ok: true,
          syncedFromRemote: unzipRes.status === 0,
          count: profiles.length,
          profiles,
          message: unzipRes.status === 0
            ? `Synced ${profiles.length} IPVanish OpenVPN server profiles from configs.ipvanish.com.`
            : `Loaded ${profiles.length} built-in IPVanish OpenVPN server profiles.`,
        };
      } catch (err) {
        try { fs.unlinkSync(tmpZip); } catch {}
        const profiles = listProfiles('ipvanish');
        return {
          ok: true,
          syncedFromRemote: false,
          count: profiles.length,
          profiles,
          message: `Ready with ${profiles.length} curated IPVanish OpenVPN profiles (offline fallback: ${err.message}).`,
        };
      }
    }
    const profiles = listProfiles(providerId);
    return { ok: true, syncedFromRemote: false, count: profiles.length, profiles, message: `${profiles.length} profiles available.` };
  }

  function readAccountsStore() {
    ensureIpvanishProfiles();
    try {
      if (!fs.existsSync(accountsFile)) {
        return { defaultAccountId: null, accounts: [] };
      }
      const data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
      return {
        defaultAccountId: data.defaultAccountId || null,
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
      };
    } catch {
      return { defaultAccountId: null, accounts: [] };
    }
  }

  function writeAccountsStore(store) {
    ensureDirs();
    const tmp = `${accountsFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, accountsFile);
  }

  function listAccounts() {
    const store = readAccountsStore();
    const providers = listProviders();
    const providerMap = new Map(providers.map(p => [p.id, p]));

    const accounts = store.accounts.map(acc => {
      const provider = providerMap.get(acc.providerId) || BUILTIN_OVPN_PROVIDERS.custom;
      const secretConfigured = hasSecret(acc.providerId, acc.id);
      const profiles = provider.profiles || [];
      const selectedProfile = profiles.find(p => p.id === acc.defaultProfile) || profiles[0] || null;
      return {
        ...acc,
        providerName: provider.name,
        secretConfigured,
        passPath: passEntryPath(acc.providerId, acc.id),
        selectedProfile,
        isDefault: store.defaultAccountId === acc.id,
      };
    });

    const defaultAccountId = store.defaultAccountId && accounts.some(a => a.id === store.defaultAccountId)
      ? store.defaultAccountId
      : (accounts[0]?.id || null);

    return {
      defaultAccountId,
      passReady: passReady(),
      accounts: accounts.map(a => ({ ...a, isDefault: a.id === defaultAccountId })),
      providers,
    };
  }

  function saveAccount(input = {}) {
    const providerId = String(input.providerId || 'ipvanish').trim().toLowerCase();
    const provider = getProvider(providerId);
    if (!provider) throw new Error(`Unknown OpenVPN provider "${providerId}".`);

    const username = String(input.username || '').trim();
    if (!username) throw new Error('OpenVPN account username is required.');

    const store = readAccountsStore();
    const id = input.id
      ? String(input.id).trim()
      : `${providerId}-${username.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || Date.now()}`;

    const existingIdx = store.accounts.findIndex(a => a.id === id);
    const existing = existingIdx !== -1 ? store.accounts[existingIdx] : null;

    let secretMeta = null;
    if (input.password !== undefined && String(input.password).trim() !== '') {
      secretMeta = saveSecret(providerId, id, input.password);
    } else if (!existing || !hasSecret(providerId, id)) {
      throw new Error('OpenVPN account password is required.');
    }

    const profiles = listProfiles(providerId);
    const defaultProfile = input.defaultProfile || existing?.defaultProfile || profiles[0]?.id || '';

    const record = {
      id,
      label: String(input.label || existing?.label || `${provider.name} (${username})`).trim(),
      providerId,
      username,
      defaultProfile,
      protocol: input.protocol || existing?.protocol || provider.defaultProtocol || 'udp',
      port: Number(input.port || existing?.port || provider.defaultPort || 443),
      dnsServers: Array.isArray(input.dnsServers) && input.dnsServers.length
        ? input.dnsServers
        : (existing?.dnsServers || provider.dnsServers || ['1.1.1.1', '9.9.9.9']),
      killSwitch: input.killSwitch !== false,
      blockIpv6: input.blockIpv6 !== false,
      stripNetAdminCap: input.stripNetAdminCap !== false,
      secretStorage: secretMeta?.storage || existing?.secretStorage || 'pass',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx !== -1) {
      store.accounts[existingIdx] = record;
    } else {
      store.accounts.push(record);
    }

    if (input.setDefault || !store.defaultAccountId || store.accounts.length === 1) {
      store.defaultAccountId = record.id;
    }

    writeAccountsStore(store);
    return {
      ok: true,
      account: listAccounts().accounts.find(a => a.id === record.id),
      ...listAccounts(),
    };
  }

  function deleteAccount(accountId) {
    const store = readAccountsStore();
    const target = store.accounts.find(a => a.id === accountId);
    if (!target) throw new Error(`Account "${accountId}" not found.`);
    deleteSecret(target.providerId, target.id);
    store.accounts = store.accounts.filter(a => a.id !== accountId);
    if (store.defaultAccountId === accountId) {
      store.defaultAccountId = store.accounts[0]?.id || null;
    }
    writeAccountsStore(store);
    return { ok: true, ...listAccounts() };
  }

  function setDefaultAccount(accountId) {
    const store = readAccountsStore();
    if (!store.accounts.some(a => a.id === accountId)) {
      throw new Error(`Account "${accountId}" not found.`);
    }
    store.defaultAccountId = accountId;
    writeAccountsStore(store);
    return { ok: true, ...listAccounts() };
  }

  function getAccountCredentials(accountId) {
    const { accounts, defaultAccountId } = listAccounts();
    const targetId = accountId || defaultAccountId;
    const acc = accounts.find(a => a.id === targetId);
    if (!acc) throw new Error('No OpenVPN account configured. Add your IPVanish or OpenVPN account first.');
    const password = readSecret(acc.providerId, acc.id);
    if (!password) {
      throw new Error(`Password for account "${acc.label}" is unavailable. Unlock Pass Manager or re-save the account password.`);
    }
    return {
      account: acc,
      username: acc.username,
      password,
    };
  }

  return {
    BUILTIN_OVPN_PROVIDERS,
    parseOvpnConfig,
    passReady,
    listProviders,
    getProvider,
    addCustomProvider,
    removeCustomProvider,
    listProfiles,
    importOvpnProfile,
    syncProviderProfiles,
    listAccounts,
    saveAccount,
    deleteAccount,
    setDefaultAccount,
    getAccountCredentials,
    ensureIpvanishProfiles,
  };
}

module.exports = {
  BUILTIN_OVPN_PROVIDERS,
  IPVANISH_CA_CERT,
  parseOvpnConfig,
  buildIpvanishOvpnContent,
  createOvpnManager,
  ...createOvpnManager(),
};
