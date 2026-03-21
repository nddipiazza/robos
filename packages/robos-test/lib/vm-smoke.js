#!/usr/bin/env node
/**
 * RobOS VM Smoke Test
 *
 * Deploys apps to the live VM, launches each one, verifies health + DOM snapshot,
 * then kills it. Reports pass/fail with error details for debugging.
 *
 * Usage:
 *   node lib/vm-smoke.js                          # test all 4 security apps
 *   node lib/vm-smoke.js security-setup pass-manager  # test specific apps
 *   node lib/vm-smoke.js --deploy                 # deploy before testing (default)
 *   node lib/vm-smoke.js --no-deploy              # skip deploy, just test what's there
 */
'use strict';

const { execSync, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SSH_OPTS = '-p 2224 -o StrictHostKeyChecking=no -o ConnectTimeout=5';
const SSH_HOST = 'robos@localhost';

const APP_PORTS = {
  'agents-manager': 19104,
  'automation-studio': 19128,
  'context-manager': 19106,
  'security-setup': 19114,
  'pass-manager': 19113,
  'pass-unlock': 19122,
  'git-login-manager': 19123,
  'task-servers': 19112,
  'issue-manager': 19103,
  'workflow-studio': 19120,
  'task-board': 19124,
  'notifications': 19115,
  'robos-preferences': 19116,
  'search-index': 19119,
  'desktop-manager': 19125,
  'robos-toast': 19126,
  'desktop-widgets': 19127,
};

const DEFAULT_APPS = Object.keys(APP_PORTS);

// ── SSH helpers ──────────────────────────────────────────────────────────────

function ssh(cmd, opts = {}) {
  const timeout = opts.timeout || 30000;
  try {
    return execSync(`ssh ${SSH_OPTS} ${SSH_HOST} '${cmd.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const stderr = (e.stderr || '').toString().trim();
    const stdout = (e.stdout || '').toString().trim();
    throw new Error(`SSH command failed: ${cmd}\nstdout: ${stdout}\nstderr: ${stderr}`);
  }
}

function sshNoThrow(cmd, opts = {}) {
  try { return ssh(cmd, opts); } catch (e) { return e.message; }
}

function scp(localPath, remotePath) {
  execSync(`scp ${SSH_OPTS.replace('-p', '-P')} -r ${localPath} ${SSH_HOST}:${remotePath}`,
    { timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
}

// ── HTTP helper (via SSH port forward) ───────────────────────────────────────

function httpGetViaSSH(port, endpoint, timeoutMs = 5000) {
  try {
    const result = execSync(
      `ssh ${SSH_OPTS} ${SSH_HOST} 'curl -s --max-time ${Math.ceil(timeoutMs/1000)} http://localhost:${port}${endpoint}'`,
      { encoding: 'utf8', timeout: timeoutMs + 5000 }
    ).trim();
    return result;
  } catch { return null; }
}

// ── Deploy ───────────────────────────────────────────────────────────────────

function deployApp(appId) {
  const appDir = path.join(REPO_ROOT, 'packages', appId);
  process.stdout.write(`  deploying ${appId}...`);

  // Copy files
  sshNoThrow(`rm -rf /tmp/${appId}`);
  scp(`${appDir}/*`, `/tmp/${appId}/`);

  // Install on VM
  ssh(`sudo rm -rf /usr/local/share/robos/${appId} && ` +
      `sudo cp -r /tmp/${appId} /usr/local/share/robos/${appId} && ` +
      `sudo chmod -R a+rX /usr/local/share/robos/${appId} && ` +
      `cd /usr/local/share/robos/${appId} && ` +
      `sudo npm install --quiet 2>&1 | tail -1`,
    { timeout: 120000 });

  // Install .desktop file
  const desktopFile = sshNoThrow(`ls /usr/local/share/robos/${appId}/*.desktop 2>/dev/null | head -1`);
  if (desktopFile && !desktopFile.includes('SSH command failed')) {
    const basename = desktopFile.split('/').pop();
    sshNoThrow(`sudo cp ${desktopFile} /usr/share/applications/${basename}`);
  }

  sshNoThrow(`rm -rf /tmp/${appId}`);
  process.stdout.write(' done\n');
}

// ── Kill previous instance ───────────────────────────────────────────────────

function killPreviousInstance(appId, port) {
  // Kill by port
  sshNoThrow(`fuser -k ${port}/tcp 2>/dev/null`);
  // Kill by process name
  sshNoThrow(`pkill -f "electron.*${appId}" 2>/dev/null`);
  // Wait for cleanup
  spawnSync('sleep', ['1']);
}

// ── Launch + health check ────────────────────────────────────────────────────

function launchAndCheck(appId, port) {
  // Launch in background on VM (use sshNoThrow — nohup & causes non-zero exit)
  sshNoThrow(`export DISPLAY=:0 && ` +
      `cd /usr/local/share/robos/${appId} && ` +
      `nohup node_modules/.bin/electron . --no-sandbox --disable-gpu --disable-dev-shm-usage ` +
      `> /tmp/robos-smoke-${appId}.log 2>&1 &`);

  // Poll health endpoint
  const startTime = Date.now();
  const timeout = 15000;
  let lastError = null;

  while (Date.now() - startTime < timeout) {
    const health = httpGetViaSSH(port, '/health', 3000);
    if (health) {
      try {
        const parsed = JSON.parse(health);
        if (parsed.ok) return { ok: true, health: parsed };
      } catch {}
    }
    spawnSync('sleep', ['1']);
  }

  // Failed — collect diagnostics
  const log = sshNoThrow(`cat /tmp/robos-smoke-${appId}.log 2>/dev/null | tail -30`);
  const ps = sshNoThrow(`ps aux | grep "${appId}" | grep -v grep`);
  return {
    ok: false,
    error: `Health check timed out after ${timeout}ms`,
    diagnostics: { log, ps },
  };
}

// ── DOM snapshot check ───────────────────────────────────────────────────────

function checkSnapshot(port) {
  // Wait a bit for renderer to finish async init
  spawnSync('sleep', ['2']);

  const snapshot = httpGetViaSSH(port, '/snapshot', 8000);
  if (!snapshot) return { ok: false, error: 'Snapshot request failed or timed out' };

  try {
    const tree = JSON.parse(snapshot);
    const texts = [];
    function walk(node) {
      if (node.text) texts.push(node.text.trim());
      (node.children || []).forEach(walk);
    }
    walk(tree);
    return { ok: true, textCount: texts.length, preview: texts.slice(0, 8).join(' | ') };
  } catch (e) {
    return { ok: false, error: `Snapshot parse failed: ${e.message}`, raw: snapshot.substring(0, 200) };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const doDeploy = !args.includes('--no-deploy');
  const appList = args.filter(a => !a.startsWith('--'));
  const apps = appList.length > 0 ? appList : DEFAULT_APPS;

  // Verify SSH connectivity
  process.stdout.write('Checking VM connectivity... ');
  try {
    ssh('echo ok');
    process.stdout.write('ok\n\n');
  } catch {
    console.error('FAIL — cannot SSH to VM. Is it running?');
    process.exit(1);
  }

  const results = [];

  for (const appId of apps) {
    const port = APP_PORTS[appId];
    if (!port) {
      console.error(`Unknown app: ${appId}`);
      results.push({ appId, ok: false, error: 'Unknown app' });
      continue;
    }

    console.log(`\n── ${appId} (port ${port}) ──`);

    // 1. Deploy
    if (doDeploy) {
      try {
        deployApp(appId);
      } catch (e) {
        console.error(`  DEPLOY FAILED: ${e.message}`);
        results.push({ appId, ok: false, phase: 'deploy', error: e.message });
        continue;
      }
    }

    // 2. Kill previous
    process.stdout.write('  killing previous...');
    killPreviousInstance(appId, port);
    process.stdout.write(' done\n');

    // 3. Launch + health
    process.stdout.write('  launching + health check...');
    const launch = launchAndCheck(appId, port);
    if (!launch.ok) {
      console.error(` FAIL\n  ${launch.error}`);
      if (launch.diagnostics) {
        console.error(`  --- process log ---\n${launch.diagnostics.log}`);
        console.error(`  --- ps ---\n${launch.diagnostics.ps}`);
      }
      results.push({ appId, ok: false, phase: 'health', error: launch.error, diagnostics: launch.diagnostics });
      continue;
    }
    process.stdout.write(` ok (${launch.health.title || appId})\n`);

    // 4. DOM snapshot
    process.stdout.write('  checking DOM snapshot...');
    const snap = checkSnapshot(port);
    if (!snap.ok) {
      console.error(` FAIL\n  ${snap.error}`);
      results.push({ appId, ok: false, phase: 'snapshot', error: snap.error });
    } else {
      process.stdout.write(` ok (${snap.textCount} text nodes)\n`);
      process.stdout.write(`  preview: ${snap.preview}\n`);
      results.push({ appId, ok: true, title: launch.health.title, textCount: snap.textCount, preview: snap.preview });
    }

    // 5. Kill after test
    killPreviousInstance(appId, port);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══ SMOKE TEST RESULTS ══\n');
  let allOk = true;
  for (const r of results) {
    const status = r.ok ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}  ${r.appId}${r.ok ? ` — "${r.preview}"` : ` — ${r.phase}: ${r.error}`}`);
    if (!r.ok) allOk = false;
  }
  console.log('');

  process.exit(allOk ? 0 : 1);
}

main();
