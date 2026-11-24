'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createOvpnManager, parseOvpnConfig, getFailoverCandidates, BUILTIN_OVPN_PROVIDERS } = require('./ovpn-providers');
const {
  createVpnSandboxEngine,
  generateFirewallSpec,
  buildSetupShellScript,
  buildSwitchTunnelShellScript,
  buildAppLaunchCommand,
} = require('./vpn-sandbox-engine');

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

test('getFailoverCandidates orders next VPN servers in line naturally (e.g. Chicago 2 -> Chicago 3 -> Chicago 4)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vpn-order-test-'));
  try {
    const mgr = createOvpnManager({ configDir: tmpDir, usePass: false });
    // Seed Chicago b01, b02, b03, b04, b10, c01
    for (const [code, ip] of [
      ['chi-b02', '216.131.76.9'],
      ['chi-b03', '216.131.76.15'],
      ['chi-b04', '216.131.76.21'],
      ['chi-b10', '216.131.76.57'],
      ['chi-c01', '216.131.76.165'],
    ]) {
      mgr.importOvpnProfile({
        providerId: 'ipvanish',
        filename: `ipvanish-US-Chicago-${code}.ovpn`,
        content: `client\ndev tun\nproto udp\nremote ${code}.ipvanish.com 443\n# Resolved Fallback IP: ${ip}\nauth-user-pass\n`,
      });
    }

    const ipvProfiles = mgr.listProfiles('ipvanish');
    const candidatesFromChi2 = mgr.getFailoverCandidates(ipvProfiles, 'ipvanish-US-Chicago-chi-b02');
    assert.equal(candidatesFromChi2[0].id, 'ipvanish-US-Chicago-chi-b03', 'Chicago 2 must advance directly to Chicago 3');
    assert.equal(candidatesFromChi2[1].id, 'ipvanish-US-Chicago-chi-b04', 'Chicago 3 must be followed by Chicago 4');
    assert.equal(candidatesFromChi2[2].id, 'ipvanish-US-Chicago-chi-b10', 'Chicago 4 must be followed by Chicago 10');
    assert.equal(candidatesFromChi2[3].id, 'ipvanish-US-Chicago-chi-c01', 'Chicago b10 must be followed by Chicago c01');
    assert.equal(candidatesFromChi2[4].id, 'ipvanish-US-Chicago-chi-b01', 'Should wrap around to Chicago 1 before leaving Chicago');
    assert.equal(candidatesFromChi2[5].country, 'US', 'Should prefer other US cities before foreign countries');

    // Also verify plain custom filenames (chicago1, chicago2, chicago3, chicago10, miami1) use natural numeric order
    mgr.addCustomProvider({ id: 'myvpn', name: 'MyVPN' });
    for (const name of ['chicago1', 'chicago10', 'chicago2', 'chicago3', 'miami1']) {
      mgr.importOvpnProfile({
        providerId: 'myvpn',
        filename: `${name}.ovpn`,
        content: `client\ndev tun\nproto udp\nremote 198.51.100.10 1194\nauth-user-pass\n`,
      });
    }
    const customProfiles = mgr.listProfiles('myvpn');
    const customNext = getFailoverCandidates(customProfiles, 'chicago2').map(p => p.id);
    assert.deepEqual(customNext, ['chicago3', 'chicago10', 'chicago1', 'miami1']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('VPN Sandbox detects down VPN at launch AND mid-session and automatically fails over to next VPN in line (Chicago 2 -> Chicago 3 -> Chicago 4)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vpn-failover-test-'));
  try {
    const ovpnManager = createOvpnManager({ configDir: tmpDir, usePass: false });
    for (const [code, ip] of [
      ['chi-b02', '216.131.76.9'],
      ['chi-b03', '216.131.76.15'],
      ['chi-b04', '216.131.76.21'],
    ]) {
      ovpnManager.importOvpnProfile({
        providerId: 'ipvanish',
        filename: `ipvanish-US-Chicago-${code}.ovpn`,
        content: `client\ndev tun\nproto udp\nremote ${code}.ipvanish.com 443\n# Resolved Fallback IP: ${ip}\nauth-user-pass\n`,
      });
    }

    ovpnManager.saveAccount({
      providerId: 'ipvanish',
      label: 'IPVanish Failover Account',
      username: 'chi_user',
      password: 'chi_secret_password',
      defaultProfile: 'ipvanish-US-Chicago-chi-b02',
      setDefault: true,
    });

    const downServers = new Set(['ipvanish-US-Chicago-chi-b02']);
    const failoverEvents = [];
    let lastSwitchScript = '';

    const engine = createVpnSandboxEngine({
      configDir: tmpDir,
      ovpnManager,
      usePass: false,
      healthCheckIntervalMs: 0, // driven explicitly in test
      onFailover: ev => failoverEvents.push(ev),
      tunnelConnectHook: async ({ profile, spec, switchScript }) => {
        if (switchScript) lastSwitchScript = switchScript;
        if (downServers.has(profile.id)) {
          return {
            ok: false,
            reason: 'tun_timeout',
            error: `Connection timed out on ${profile.hostname}`,
          };
        }
        return {
          ok: true,
          verifiedExitIp: spec.vpnServerIps[0],
          assignedTunnelIp: '172.21.23.50',
        };
      },
      tunnelHealthHook: async session => {
        if (downServers.has(session.profileId)) {
          return {
            healthy: false,
            reason: 'tun0_down',
            detail: `${session.serverHost} tunnel went down`,
          };
        }
        return { healthy: true };
      },
    });

    // 1. Launch on Chicago 2 while Chicago 2 is DOWN -> must automatically connect to Chicago 3!
    const session = await engine.launchSandboxedExecutable({
      executable: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      profileId: 'ipvanish-US-Chicago-chi-b02',
    });

    assert.equal(session.requestedProfileId, 'ipvanish-US-Chicago-chi-b02');
    assert.equal(session.profileId, 'ipvanish-US-Chicago-chi-b03', 'Must fail over from Chicago 2 to Chicago 3 at launch');
    assert.equal(session.serverHost, 'chi-b03.ipvanish.com');
    assert.equal(session.vpnExitIp, '216.131.76.15');
    assert.equal(session.failoverCount, 1);
    assert.equal(failoverEvents.length, 1);
    assert.equal(failoverEvents[0].fromProfileId, 'ipvanish-US-Chicago-chi-b02');
    assert.equal(failoverEvents[0].toProfileId, 'ipvanish-US-Chicago-chi-b03');
    const initialPid = session.pid;

    // 2. Now Chicago 3 ALSO goes down mid-session while the app is running -> health monitor must switch to Chicago 4 in-place!
    downServers.add('ipvanish-US-Chicago-chi-b03');
    const cycleEvents = await engine.runHealthCheckCycle();
    assert.equal(cycleEvents.length, 1);
    assert.equal(cycleEvents[0].ok, true);
    assert.equal(cycleEvents[0].switched, true);
    assert.equal(cycleEvents[0].fromProfileId, 'ipvanish-US-Chicago-chi-b03');
    assert.equal(cycleEvents[0].toProfileId, 'ipvanish-US-Chicago-chi-b04');

    const updated = engine.getSession(session.id);
    assert.equal(updated.status, 'running');
    assert.equal(updated.pid, initialPid, 'Sandboxed app PID must stay alive without restarting during in-place failover');
    assert.equal(updated.profileId, 'ipvanish-US-Chicago-chi-b04');
    assert.equal(updated.serverHost, 'chi-b04.ipvanish.com');
    assert.equal(updated.vpnExitIp, '216.131.76.21');
    assert.equal(updated.failoverCount, 2);

    // Verify zero-leak switch script rotates NAT rule cleanly and maintains Default-DROP
    assert.ok(lastSwitchScript.includes('iptables -P OUTPUT DROP'), 'Switch script must keep OUTPUT DROP policy locked');
    assert.ok(
      lastSwitchScript.includes('-D POSTROUTING') && lastSwitchScript.includes('216.131.76.15/32'),
      'Switch script must remove previous server POSTROUTING MASQUERADE rule'
    );
    assert.ok(
      lastSwitchScript.includes('216.131.76.21/32'),
      'Switch script must lock firewall to new server IP'
    );

    engine.stopSession(session.id);

    // 3. Verify AUTH_FAILED aborts immediately and does NOT cycle through servers
    let authAttempts = 0;
    const authFailEngine = createVpnSandboxEngine({
      configDir: tmpDir,
      ovpnManager,
      usePass: false,
      healthCheckIntervalMs: 0,
      tunnelConnectHook: async () => {
        authAttempts++;
        return { ok: false, fatalAuth: true, error: 'OpenVPN authentication failed (AUTH_FAILED).' };
      },
    });
    await assert.rejects(
      () => authFailEngine.launchSandboxedExecutable({ executable: 'echo', args: ['hi'], profileId: 'ipvanish-US-Chicago-chi-b02' }),
      /AUTH_FAILED/
    );
    assert.equal(authAttempts, 1, 'AUTH_FAILED must stop immediately without retrying subsequent servers');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
