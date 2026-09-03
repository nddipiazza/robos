'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const net = require('net');

const { launchApp, killApp } = require('../../lib/harness');
const { getTextSnapshot, getSnapshot, evalJS, evalClick, evalType } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

function sendSocketMessage(socketPath, payload) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.write(JSON.stringify(payload));
      client.end();
    });
    let data = '';
    client.on('data', chunk => { data += chunk; });
    client.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { resolve(data); }
    });
    client.on('error', reject);
  });
}

describe('Desktop Manager E2E Test Suite with In-Depth Assertions', () => {
  it('launches Desktop Manager, validates DOM, IPC, and Unix Socket Hub', async () => {
    // 1. Launch desktop-manager under test harness
    const app = await launchApp('desktop-manager', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Desktop Manager debug port should be allocated');

      // 2. In-depth DOM Assertions on Initial Load
      const text = await getTextSnapshot(app.port);
      assert.ok(text.includes('RobOS Desktop Manager'), 'Header must contain "RobOS Desktop Manager"');
      assert.ok(text.includes('Notifications'), 'App list must render "Notifications"');
      assert.ok(text.includes('Pass Manager'), 'App list must render "Pass Manager"');
      assert.ok(text.includes('Git Projects'), 'App list must render "Git Projects"');

      // 3. Search and Filter Interactivity Assertion
      await evalType(app.port, '#app-search', 'Task');
      const filteredCount = await evalJS(app.port, `(() => document.querySelectorAll('.app-card').length)()`);
      assert.ok(filteredCount >= 1 && filteredCount <= 10, `Filtered app count should be between 1 and 10, got ${filteredCount}`);
      
      // Clear search
      await evalType(app.port, '#app-search', '');
      const totalCount = await evalJS(app.port, `(() => document.querySelectorAll('.app-card').length)()`);
      assert.ok(totalCount >= 15, `Total app count should be >= 15, got ${totalCount}`);

      // 4. Socket IPC Hub & Console Interactivity Assertion
      await evalClick(app.port, '#tab-btn-socket');
      await evalClick(app.port, '#btn-ping-socket');
      await new Promise(r => setTimeout(r, 300));
      const logText = await evalJS(app.port, `document.getElementById('socket-event-log').innerText`);
      assert.ok(logText.includes('SOCKET PING'), 'Event log must record SOCKET PING event');
      assert.ok(logText.includes('pong'), 'Event log must contain pong response');

      // 5. Notifications Tab & Urgent Dispatch Assertion
      await evalClick(app.port, '#tab-btn-notif');
      await evalClick(app.port, '#btn-emit-urgent-notif');
      await new Promise(r => setTimeout(r, 300));
      const notifBadgeText = await evalJS(app.port, `document.getElementById('notif-count').innerText`);
      assert.ok(parseInt(notifBadgeText) >= 1, `Notification count badge should be >= 1, got ${notifBadgeText}`);
      const notifListText = await evalJS(app.port, `document.getElementById('notif-container').innerText`);
      assert.ok(notifListText.includes('High Priority Blocker Alert'), 'Notification list must contain urgent toast alert');

      // 6. Watchdog Grid Assertion
      await evalClick(app.port, '#tab-btn-watchdog');
      const watchdogCards = await evalJS(app.port, `document.querySelectorAll('.watchdog-card').length`);
      assert.ok(watchdogCards >= 1, `Watchdog cards count should be >= 1, got ${watchdogCards}`);

      // 7. Unix Socket Direct Inter-Process Communication Assertions
      const socketPath = await evalJS(app.port, `window.api.getSocketPath()`);
      assert.ok(socketPath, 'App must return valid socketPath');
      
      let socketReady = false;
      for (let i = 0; i < 20; i++) {
        if (fs.existsSync(socketPath)) { socketReady = true; break; }
        await new Promise(r => setTimeout(r, 200));
      }
      assert.ok(socketReady, `Socket file must exist at ${socketPath}`);

      // Direct Ping test over Unix domain socket
      const pingRes = await sendSocketMessage(socketPath, { ping: true });
      assert.strictEqual(pingRes.pong, true, 'Socket must respond with pong: true');
      assert.ok(typeof pingRes.time === 'number', 'Ping response must include timestamp');

      // Direct query apps via socket
      const appsRes = await sendSocketMessage(socketPath, { getApps: true });
      assert.ok(Array.isArray(appsRes.apps), 'getApps must return apps array');
      assert.ok(appsRes.apps.some(a => a.id === 'notifications'), 'Apps array must include notifications');

      // Direct notify via socket
      const notifRes = await sendSocketMessage(socketPath, {
        notify: {
          title: 'Direct Socket Notification',
          body: 'Verified socket communication with Desktop Manager',
          icon: 'info',
          source: 'e2e-test',
        },
      });
      assert.strictEqual(notifRes.ok, true, 'Socket notify must return ok: true');

      // Verify unread count via socket
      const unreadRes = await sendSocketMessage(socketPath, { getUnread: true });
      assert.ok(unreadRes.unread >= 1, 'Unread count should be >= 1 after firing notification');

      // Query process status via socket
      const statusRes = await sendSocketMessage(socketPath, { status: true });
      assert.ok(statusRes && statusRes.status, 'Status response must contain status object');
    } finally {
      // 8. Clean Teardown
      await killApp(app);
    }
  });
});
