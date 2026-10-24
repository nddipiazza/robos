'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createOvpnManager, parseOvpnConfig, BUILTIN_OVPN_PROVIDERS } = require('./ovpn-providers');
const { createVpnSandboxEngine, generateFirewallSpec, buildSetupShellScript, buildAppLaunchCommand } = require('./vpn-sandbox-engine');

test('IPVanish is pre-registered as a first-class built-in OpenVPN provider with curated .ovpn profiles', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-ovpn-test-'));
  try {
    const mgr = createOvpnManager({ configDir: tmpDir, usePass: false });
    const providers = mgr.listProviders();
    assert.ok(BUILTIN_OVPN_PROVIDERS.ipvanish, 'BUILTIN_OVPN_PROVIDERS must include ipvanish');

    const ipv = providers.find(p => p.id === 'ipvanish');
    assert.ok(ipv, 'listProviders() must include ipvanish');
    assert.equal(ipv.name, 'IPVanish');
    assert.equal(ipv.builtin, true);
    assert.ok(ipv.profiles.length >= 14, 'IPVanish should seed curated regional .ovpn profiles');

    const nyc = ipv.profiles.find(p => p.id === 'ipvanish-US-New-York-nyc-a01');
    assert.ok(nyc, 'New York IPVanish profile should exist');
    assert.equal(nyc.hostname, 'nyc-a01.ipvanish.com');
    assert.equal(nyc.port, 443);
    assert.equal(nyc.proto, 'udp');
    assert.ok(fs.existsSync(nyc.path), '.ovpn file should be written to disk');

    const caPath = path.join(tmpDir, 'ovpn', 'profiles', 'ipvanish', 'ca.ipvanish.com.crt');
    assert.ok(fs.existsSync(caPath), 'IPVanish CA certificate should be written to disk');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('OpenVPN accounts are tracked, managed, and store passwords encrypted (never plaintext in ovpn-accounts.json)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-ovpn-acc-test-'));
  try {
    const mgr = createOvpnManager({ configDir: tmpDir, usePass: false });

    const saved = mgr.saveAccount({
      providerId: 'ipvanish',
      label: 'My IPVanish Account',
      username: 'ndipiazza_ipv',
      password: 'super-secret-ipvanish-password-999',
      defaultProfile: 'ipvanish-US-Chicago-chi-a01',
      setDefault: true,
    });

    assert.equal(saved.ok, true);
    assert.ok(saved.account);
    assert.equal(saved.account.providerId, 'ipvanish');
    assert.equal(saved.account.username, 'ndipiazza_ipv');
    assert.equal(saved.account.secretConfigured, true);
    assert.equal(saved.account.isDefault, true);

    // Ensure plaintext password is NEVER in ovpn-accounts.json
    const rawAccountsJson = fs.readFileSync(path.join(tmpDir, 'ovpn-accounts.json'), 'utf8');
    assert.ok(!rawAccountsJson.includes('super-secret-ipvanish-password-999'), 'Password must never appear in ovpn-accounts.json');

    // Verify encrypted credential retrieval works
    const creds = mgr.getAccountCredentials(saved.account.id);
    assert.equal(creds.username, 'ndipiazza_ipv');
    assert.equal(creds.password, 'super-secret-ipvanish-password-999');

    // Add a custom provider and account
    const customProv = mgr.addCustomProvider({
      name: 'CorpVPN',
      website: 'https://vpn.example.com',
      defaultPort: 1194,
    });
    assert.equal(customProv.id, 'corpvpn');

    const imported = mgr.importOvpnProfile({
      providerId: 'corpvpn',
      filename: 'corp-us-east.ovpn',
      content: 'client\ndev tun\nproto tcp\nremote 198.51.100.42 443 tcp\nauth-user-pass\n',
    });
    assert.equal(imported.ok, true);
    assert.equal(imported.parsed.remotes[0].host, '198.51.100.42');
    assert.equal(imported.parsed.remotes[0].port, 443);
    assert.equal(imported.parsed.remotes[0].proto, 'tcp');

    // Delete account
    const afterDel = mgr.deleteAccount(saved.account.id);
    assert.equal(afterDel.accounts.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Zero-Leak Firewall Spec & Sandbox Engine enforce strict ip netns + dual-layer iptables kill-switch rules', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vpn-sandbox-test-'));
  try {
    const ovpnManager = createOvpnManager({ configDir: tmpDir, usePass: false });
    ovpnManager.saveAccount({
      providerId: 'ipvanish',
      label: 'IPVanish Primary',
      username: 'ipv_user',
      password: 'ipv_password_123',
      defaultProfile: 'ipvanish-US-New-York-nyc-a01',
      setDefault: true,
    });

    const engine = createVpnSandboxEngine({ configDir: tmpDir, ovpnManager, usePass: false });

    const spec = generateFirewallSpec({
      sessionId: 'a1b2',
      subnetOctet: 15,
      vpnServerIps: ['64.145.73.10'],
      vpnPort: 443,
      vpnProto: 'udp',
      dnsServers: ['198.18.0.1', '1.1.1.1'],
      hostIface: 'eth0',
      targetUid: 1000,
      targetGid: 1000,
      targetUser: 'robos',
    });

    assert.equal(spec.netnsName, 'robos_vpn_a1b2');
    const nsRules = spec.namespaceIptablesRules.join('\n');
    const hostRules = spec.hostIptablesRules.join('\n');

    // 1. Default DROP policy inside namespace
    assert.ok(nsRules.includes('ip netns exec robos_vpn_a1b2 iptables -P INPUT DROP'));
    assert.ok(nsRules.includes('ip netns exec robos_vpn_a1b2 iptables -P FORWARD DROP'));
    assert.ok(nsRules.includes('ip netns exec robos_vpn_a1b2 iptables -P OUTPUT DROP'));

    // 2. IPv6 completely dropped inside namespace
    assert.ok(nsRules.includes('ip netns exec robos_vpn_a1b2 ip6tables -P OUTPUT DROP'));

    // 3. Only root (uid 0, openvpn) can use veth_n_a1b2, and only to 64.145.73.10:443/udp; user app can ONLY use tun+
    assert.ok(
      nsRules.includes(
        'ip netns exec robos_vpn_a1b2 iptables -A OUTPUT -o veth_n_a1b2 -d 64.145.73.10/32 -p udp --dport 443 -m owner --uid-owner 0 -j ACCEPT'
      )
    );
    assert.ok(nsRules.includes('ip netns exec robos_vpn_a1b2 iptables -A OUTPUT -o tun+ -j ACCEPT'));
    assert.ok(nsRules.includes('ip netns exec robos_vpn_a1b2 iptables -A OUTPUT -o veth_n_a1b2 -j DROP'));

    // 4. Host FORWARD chain locks veth_h_a1b2 to 64.145.73.10:443/udp and drops everything else before NAT
    assert.ok(
      hostRules.includes(
        'iptables -A ROBOS_VPN_FWD_a1b2 -i veth_h_a1b2 -o eth0 -s 10.203.15.2/32 -d 64.145.73.10/32 -p udp --dport 443 -j ACCEPT'
      )
    );
    assert.ok(hostRules.includes('iptables -A ROBOS_VPN_FWD_a1b2 -i veth_h_a1b2 -j DROP'));

    // 5. Launch command strips CAP_NET_ADMIN and CAP_NET_RAW
    const cmd = buildAppLaunchCommand(spec, { executable: 'firefox', args: ['--private-window'], env: { DISPLAY: ':0' } });
    assert.ok(cmd.includes('ip netns exec robos_vpn_a1b2'));
    assert.ok(cmd.includes('setpriv --inh-caps=-net_admin,-net_raw'));

    // 6. Run 6-point Zero-Leak Audit
    const audit = await engine.runLeakAudit({});
    assert.equal(audit.ok, true);
    assert.equal(audit.checks.length, 6);
    assert.ok(audit.checks.every(c => c.passed), 'All 6 zero-leak checks must pass');

    // 7. Launch a sandboxed executable and verify session lifecycle
    const session = await engine.launchSandboxedExecutable({
      executable: 'curl',
      args: ['-sS', 'https://api.ipify.org?format=json'],
    });
    assert.ok(session.id);
    assert.equal(session.providerId, 'ipvanish');
    assert.equal(session.killSwitchActive, true);
    assert.equal(session.ipv6Blocked, true);
    assert.equal(session.dnsLeakProtected, true);
    assert.notEqual(session.vpnExitIp, session.hostNormalIp, 'VPN exit IP must never equal host normal IP');

    const stopped = engine.stopSession(session.id);
    assert.equal(stopped.status, 'stopped');

    // 8. Prove Kill-Switch when OpenVPN drops mid-session
    const proof = await engine.proveKillSwitchOnVpnDrop({ simulateIfNoTun: true });
    assert.equal(proof.ok, true);
    assert.equal(proof.ipLeakedAfterDrop, false);
    assert.equal(proof.tun0DestroyedAfterKill, true);
    assert.equal(proof.steps.length, 5);
    assert.ok(proof.steps.every(s => s.passed));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RobOS Preferences schema includes ovpn_accounts section', () => {
  const { SETTINGS_SCHEMA } = require('../robos-preferences/main');
  assert.ok(
    SETTINGS_SCHEMA.sections.some(s => s.id === 'ovpn_accounts'),
    'SETTINGS_SCHEMA in robos-preferences must include ovpn_accounts section'
  );
});

test('Transmission default profile is created automatically when Transmission is installed', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vpn-transmission-test-'));
  try {
    const ovpnManager = createOvpnManager({ configDir: tmpDir, usePass: false });
    const engineWithTransmission = createVpnSandboxEngine({
      configDir: tmpDir,
      ovpnManager,
      usePass: false,
      transmissionBinary: 'transmission-gtk',
    });
    const profiles = engineWithTransmission.listSavedAppProfiles();
    const tr = profiles.find(p => p.id === 'sandbox-transmission');
    assert.ok(tr, 'Transmission profile must be present when transmission is installed');
    assert.equal(tr.name, 'Transmission');
    assert.equal(tr.executable, 'transmission-gtk');

    const engineWithoutTransmission = createVpnSandboxEngine({
      configDir: tmpDir,
      ovpnManager,
      usePass: false,
      transmissionBinary: null,
    });
    const profilesWithout = engineWithoutTransmission.listSavedAppProfiles();
    assert.ok(!profilesWithout.some(p => p.id === 'sandbox-transmission'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
