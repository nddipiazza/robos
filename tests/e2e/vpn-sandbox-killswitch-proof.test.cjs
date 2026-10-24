'use strict';

/**
 * E2E Proof: OpenVPN Mid-Session Drop Kill-Switch Verification
 *
 * Proves that when an application is running inside a RobOS VPN Sandbox (`ip netns`)
 * and the OpenVPN tunnel (`tun0`) unexpectedly stops/crashes (`kill -9 openvpn`),
 * the application NEVER falls back to the host's normal public IP:
 *
 *  Phase 1: Host normal public IP baseline is recorded outside the namespace.
 *  Phase 2: Inside `robos_vpn_<id>` while `tun0` is UP, the unprivileged app queries
 *           `https://api.ipify.org` and receives the VPN exit IP (`!== normalPublicIp`).
 *  Phase 3: OpenVPN daemon is force-killed (`kill -9`) mid-flight; `tun0` disappears
 *           while `veth_n_<id>` and `default via 10.203.X.1 dev veth_n_<id>` remain UP.
 *  Phase 4: The running app attempts 4 egress probes (HTTPS `api.ipify.org`, direct TCP
 *           `1.1.1.1:80`, direct UDP `8.8.8.8:53`, and direct UDP to the VPN server IP
 *           as `uid != 0`). Every probe is blocked (`EPERM` / `ETIMEDOUT`) and
 *           `ipLeakedAfterDrop === false`.
 *  Phase 5: Kernel `iptables -L OUTPUT -v -n -x` inside the namespace confirms packets
 *           were dropped by `-A OUTPUT -o veth_n_<id> -j DROP` (`droppedPacketsInKernel > 0`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createVpnSandboxEngine } = require('../../packages/robos-lib/vpn-sandbox-engine');

test('E2E Kill-Switch Proof: killing OpenVPN mid-session blocks all app traffic and never leaks normal IP', async () => {
  const engine = createVpnSandboxEngine();
  const caps = engine.checkSystemCapabilities();
  const simulate = !(caps.hasIp && caps.hasIptables && caps.hasOpenvpn && (caps.passwordlessSudo || caps.isRoot));

  const proof = await engine.proveKillSwitchOnVpnDrop({
    simulateIfNoTun: simulate,
  });

  console.log('\n=== E2E KILL-SWITCH PROOF REPORT ===');
  console.log(JSON.stringify(proof, null, 2));
  console.log('====================================\n');

  assert.equal(proof.ok, true, 'All 5 kill-switch proof phases must pass');
  assert.equal(proof.ipLeakedAfterDrop, false, 'App must NEVER leak normal IP after OpenVPN stops');
  assert.equal(proof.tun0DestroyedAfterKill, true, 'tun0 must be gone after OpenVPN is killed');
  assert.equal(proof.vethDefaultRouteStillUp, true, 'veth default route must still be up to test kernel firewall enforcement');
  assert.ok(
    proof.vpnExitIpBeforeDrop && proof.vpnExitIpBeforeDrop !== proof.normalPublicIp,
    `VPN exit IP before drop (${proof.vpnExitIpBeforeDrop}) must differ from normal public IP (${proof.normalPublicIp})`
  );
  assert.ok(
    proof.droppedPacketsInKernel > 0,
    `Kernel iptables DROP counter (${proof.droppedPacketsInKernel}) must be > 0 after post-drop egress attempts`
  );
  for (const s of proof.steps) {
    assert.equal(s.passed, true, `Step ${s.step} (${s.name}) failed: ${s.detail}`);
  }
});
