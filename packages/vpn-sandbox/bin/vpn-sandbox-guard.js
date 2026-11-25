#!/usr/bin/env node
'use strict';

/**
 * RobOS VPN Sandbox — Always-On Outside-Sandbox Process Killer & CLI (`vpn-sandbox-guard.js`)
 *
 * Continuously watches `/proc` and terminates (`SIGKILL`) any guarded application
 * (such as `qbittorrent`, `transmission-gtk`, etc.) found running outside an active
 * `robos_vpn_*` network namespace, even when the RobOS VPN Sandbox GUI window is closed.
 *
 * Usage:
 *   vpn-sandbox-guard.js --daemon                 Run continuous background watchdog
 *   vpn-sandbox-guard.js --once                   Scan /proc once and kill outside-sandbox instances
 *   vpn-sandbox-guard.js --status                 Print JSON guard state & recent kill/block events
 *   vpn-sandbox-guard.js --lock <executable>      Lock executable to VPN-Only mode
 *   vpn-sandbox-guard.js --unlock <executable>    Unlock executable and restore base-state launch
 *   vpn-sandbox-guard.js --prove                  Run live 5-phase VPN-Only Guard proof
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let sandboxModule = null;
for (const base of [
  process.env.ROBOS_LIB_PATH,
  path.resolve(__dirname, '..', '..', 'robos-lib'),
  '/usr/local/share/robos/robos-lib',
].filter(Boolean)) {
  try {
    sandboxModule = require(path.join(base, 'vpn-sandbox-engine'));
    break;
  } catch {}
}

if (!sandboxModule) {
  console.error('Error: robos-lib/vpn-sandbox-engine not found.');
  process.exit(1);
}

const configDir = process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
const intervalMs = Math.max(150, Number(process.env.ROBOS_VPN_GUARD_INTERVAL_MS || 400));

async function main() {
  const args = process.argv.slice(2);
  const engine = sandboxModule.createVpnSandboxEngine({
    configDir,
    guardPollIntervalMs: intervalMs,
    enableGuardMonitor: false,
  });

  if (args.includes('--status')) {
    console.log(JSON.stringify(engine.getGuardState(), null, 2));
    return;
  }

  if (args.includes('--once')) {
    const res = engine.enforceGuardedAppsOnce();
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const lockIdx = args.indexOf('--lock');
  if (lockIdx !== -1) {
    const target = args[lockIdx + 1];
    if (!target) {
      console.error('Usage: vpn-sandbox-guard.js --lock <executable>');
      process.exit(1);
    }
    const res = engine.addGuardedApp({ executable: target });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const unlockIdx = args.indexOf('--unlock');
  if (unlockIdx !== -1) {
    const target = args[unlockIdx + 1];
    if (!target) {
      console.error('Usage: vpn-sandbox-guard.js --unlock <executable>');
      process.exit(1);
    }
    const res = engine.removeGuardedApp(target);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (args.includes('--prove')) {
    const proof = await engine.proveVpnOnlyGuard();
    console.log(JSON.stringify(proof, null, 2));
    if (!proof.ok) process.exit(1);
    return;
  }

  // Default / --daemon: continuous lightweight /proc watchdog
  const guardFile = path.join(configDir, 'vpn-sandbox-guard.json');
  let cachedHasActive = false;
  let lastMtimeMs = -1;

  const refreshActiveFlag = () => {
    try {
      const st = fs.statSync(guardFile);
      if (st.mtimeMs !== lastMtimeMs) {
        lastMtimeMs = st.mtimeMs;
        const parsed = JSON.parse(fs.readFileSync(guardFile, 'utf8'));
        cachedHasActive =
          parsed.enabled !== false &&
          Array.isArray(parsed.guardedApps) &&
          parsed.guardedApps.some(a => a.enabled !== false && a.killOutsideSandbox !== false);
      }
    } catch {
      lastMtimeMs = -1;
      cachedHasActive = false;
    }
    return cachedHasActive;
  };

  refreshActiveFlag();
  if (cachedHasActive) {
    try {
      engine.enforceGuardedAppsOnce();
    } catch {}
  }

  const timer = setInterval(() => {
    if (!refreshActiveFlag()) return;
    try {
      const res = engine.enforceGuardedAppsOnce();
      if (res.killedCount > 0) {
        for (const k of res.killed) {
          process.stdout.write(
            `[${res.scannedAt}] Killed outside-sandbox ${k.executable} (PID ${k.pid}, netns=${k.netns})\n`
          );
        }
      }
    } catch {}
  }, intervalMs);

  const shutdown = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
