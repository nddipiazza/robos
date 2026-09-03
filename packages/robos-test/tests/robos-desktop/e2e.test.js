'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText, evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('robos-desktop (Taskbar Shell & Desktop Explorer) E2E', () => {
  let app, snap;

  before(async () => {
    app = await launchApp('robos-desktop', scenarios['all-good']);
    snap = await getSnapshot(app.port);

    // Provide test windows with Google Chrome and Gedit and hook getX11Windows
    await evalJS(app.port, `
      window.__test_windows = [
        {
          wid: '0x0200001',
          wmclass: 'google-chrome.Google-chrome',
          instance: 'google-chrome',
          title: 'Google Chrome - RobOS Developer Portal',
          label: 'Chrome',
          iconSvg: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMGJjZDQiIHN0cm9rZS13aWR0aD0iMS41Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPjwvc3ZnPg==',
          actions: [{ name: 'New Incognito Window', exec: 'google-chrome --incognito' }],
          exec: 'google-chrome'
        },
        {
          wid: '0x0200002',
          wmclass: 'gedit.Gedit',
          instance: 'gedit',
          title: 'notes.txt - Gedit',
          label: 'Text Edit',
          iconSvg: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMGJjZDQiIHN0cm9rZS13aWR0aD0iMS41Ij48cGF0aCBkPSJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjhsLTYtNnoiLz48L3N2Zz4=',
          actions: [{ name: 'New Document', exec: 'gedit --new-document' }],
          exec: 'gedit'
        }
      ];
      window.robos.getX11Windows = async () => window.__test_windows;
      pinnedApps = [];
      savePinnedApps();
    `);
  });

  after(async () => {
    await killApp(app);
  });

  describe('1. Taskbar and Menubar Structure', () => {
    it('renders the top menu bar with RobOS logo and clock', async () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('RobOS'), `Top bar should have RobOS branding, got: ${allText}`);

      const hasLogoBtn = await evalJS(app.port, `!!document.getElementById('robos-logo-btn')`);
      assert.strictEqual(hasLogoBtn, true, '#robos-logo-btn must exist');

      const hasClock = await evalJS(app.port, `!!document.getElementById('clock-time')`);
      assert.strictEqual(hasClock, true, '#clock-time must exist');

      const hasNotifBtn = await evalJS(app.port, `!!document.getElementById('btn-notifications')`);
      assert.strictEqual(hasNotifBtn, true, '#btn-notifications must exist');
    });

    it('renders the bottom dock with App Launcher button and resize handle', async () => {
      const hasDock = await evalJS(app.port, `!!document.getElementById('dock')`);
      assert.strictEqual(hasDock, true, '#dock must exist');

      const hasLauncher = await evalJS(app.port, `!!document.getElementById('btn-launcher')`);
      assert.strictEqual(hasLauncher, true, '#btn-launcher must exist');

      const hasResizeHandle = await evalJS(app.port, `!!document.getElementById('dock-resize-handle')`);
      assert.strictEqual(hasResizeHandle, true, '#dock-resize-handle must exist');

      const hasWindowArea = await evalJS(app.port, `!!document.getElementById('window-area')`);
      assert.strictEqual(hasWindowArea, true, '#window-area must exist');
    });
  });

  describe('2. Launching Apps from Taskbar & Menubar', () => {
    it('launches App Launcher when clicking the launcher dock button', async () => {
      await evalJS(app.port, `window.robos.resetTestHistory()`);
      await evalClick(app.port, '#btn-launcher');
      const hist = await evalJS(app.port, `window.robos.getTestHistory()`);
      assert.ok(hist.launchedApps.includes('app-launcher'), `Should trigger launch of app-launcher, got: ${JSON.stringify(hist)}`);
    });

    it('launches Notifications when clicking notifications button in menu bar', async () => {
      await evalJS(app.port, `window.robos.resetTestHistory()`);
      await evalClick(app.port, '#btn-notifications');
      const hist = await evalJS(app.port, `window.robos.getTestHistory()`);
      assert.ok(hist.launchedApps.includes('notifications'), `Should trigger launch of notifications, got: ${JSON.stringify(hist)}`);
    });
  });

  describe('3. Running External Apps (Google Chrome & Gedit) with Icons', () => {
    it('renders Google Chrome window with icon and tooltip in taskbar', async () => {
      await evalJS(app.port, `
        lastWinSnap = '';
        renderX11Windows(window.__test_windows);
      `);

      const chromeBtn = await evalJS(app.port, `
        (() => {
          const btn = document.querySelector('#window-area .win-btn[data-wid="0x0200001"]');
          if (!btn) return null;
          const img = btn.querySelector('.win-icon-img');
          return {
            exists: true,
            tooltip: btn.dataset.tooltip,
            hasIconImg: !!img,
            iconSrc: img ? img.src : null
          };
        })()
      `);

      assert.ok(chromeBtn && chromeBtn.exists, 'Google Chrome window button exists in taskbar');
      assert.ok(chromeBtn.tooltip.includes('Google Chrome'), `Tooltip contains Google Chrome, got: ${chromeBtn.tooltip}`);
      assert.strictEqual(chromeBtn.hasIconImg, true, 'Chrome button has icon image element');
      assert.ok(chromeBtn.iconSrc.startsWith('data:image/svg+xml'), 'Chrome button renders SVG icon data URI');
    });

    it('renders Gedit text editor window with icon and tooltip in taskbar', async () => {
      const geditBtn = await evalJS(app.port, `
        (() => {
          const btn = document.querySelector('#window-area .win-btn[data-wid="0x0200002"]');
          if (!btn) return null;
          const img = btn.querySelector('.win-icon-img');
          return {
            exists: true,
            tooltip: btn.dataset.tooltip,
            hasIconImg: !!img,
            iconSrc: img ? img.src : null
          };
        })()
      `);

      assert.ok(geditBtn && geditBtn.exists, 'Gedit window button exists in taskbar');
      assert.ok(geditBtn.tooltip.includes('notes.txt - Gedit'), `Tooltip contains Gedit, got: ${geditBtn.tooltip}`);
      assert.strictEqual(geditBtn.hasIconImg, true, 'Gedit button has icon image element');
      assert.ok(geditBtn.iconSrc.startsWith('data:image/svg+xml'), 'Gedit button renders SVG icon data URI');
    });
  });

  describe('4. Pinning Applications to Taskbar', () => {
    it('pins Google Chrome via context menu', async () => {
      const res = await evalJS(app.port, `
        (() => {
          removeContextMenu();
          const btn = document.querySelector('#window-area .win-btn[data-wid="0x0200001"]');
          const rect = btn.getBoundingClientRect();
          btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top }));
          const pinItem = document.querySelector('.ctx-item[data-action="pin"]');
          const pinText = pinItem ? pinItem.textContent : '';
          if (pinItem) pinItem.click();
          return {
            pinText,
            isPinned: isPinned('google-chrome')
          };
        })()
      `);

      assert.ok(res.pinText.includes('Pin to Dock'), 'Context menu shows Pin to Dock');
      assert.strictEqual(res.isPinned, true, 'Google Chrome is now pinned to taskbar');

      // Re-render and verify .pinned-btn class is applied
      await evalJS(app.port, `
        lastWinSnap = '';
        renderX11Windows(window.__test_windows);
      `);
      const isPinnedBtn = await evalJS(app.port, `
        document.querySelector('.win-btn[data-wid="0x0200001"]').classList.contains('pinned-btn')
      `);
      assert.strictEqual(isPinnedBtn, true, 'Chrome button has .pinned-btn class');
    });

    it('pins Gedit via context menu', async () => {
      const res = await evalJS(app.port, `
        (() => {
          removeContextMenu();
          const btn = document.querySelector('#window-area .win-btn[data-wid="0x0200002"]');
          const rect = btn.getBoundingClientRect();
          btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top }));
          const pinItem = document.querySelector('.ctx-item[data-action="pin"]');
          if (pinItem) pinItem.click();
          return { isPinned: isPinned('gedit') };
        })()
      `);

      assert.strictEqual(res.isPinned, true, 'Gedit is now pinned to taskbar');
    });
  });

  describe('5. Relaunching from Pinned Taskbar (Pinned Not Running)', () => {
    it('renders pinned Chrome and Gedit as launcher stubs when windows close', async () => {
      // Simulate windows closing (empty running windows array)
      await evalJS(app.port, `
        lastWinSnap = '';
        renderX11Windows([]);
      `);

      const stubs = await evalJS(app.port, `
        Array.from(document.querySelectorAll('#window-area .pinned-not-running')).map(el => el.dataset.tooltip)
      `);

      assert.strictEqual(stubs.length, 2, 'Should display 2 pinned stubs when windows are closed');
      assert.ok(stubs.some(s => s.includes('Chrome (not running)')), 'Chrome stub is rendered');
      assert.ok(stubs.some(s => s.includes('Text Edit (not running)')), 'Gedit stub is rendered');
    });

    it('clicks pinned Chrome stub to relaunch it again', async () => {
      await evalJS(app.port, `window.robos.resetTestHistory()`);
      await evalJS(app.port, `
        const chromeStub = Array.from(document.querySelectorAll('#window-area .pinned-not-running'))
          .find(el => el.dataset.tooltip.includes('Chrome'));
        if (chromeStub) chromeStub.click();
      `);

      const hist = await evalJS(app.port, `window.robos.getTestHistory()`);
      assert.ok(hist.executedActions.includes('google-chrome'), `Clicking pinned Chrome stub executes google-chrome command, got: ${JSON.stringify(hist)}`);
    });

    it('clicks pinned Gedit stub to relaunch it again', async () => {
      await evalJS(app.port, `window.robos.resetTestHistory()`);
      await evalJS(app.port, `
        const geditStub = Array.from(document.querySelectorAll('#window-area .pinned-not-running'))
          .find(el => el.dataset.tooltip.includes('Text Edit'));
        if (geditStub) geditStub.click();
      `);

      const hist = await evalJS(app.port, `window.robos.getTestHistory()`);
      assert.ok(hist.executedActions.includes('gedit'), `Clicking pinned Gedit stub executes gedit command, got: ${JSON.stringify(hist)}`);
    });
  });

  describe('6. Removing / Unpinning Applications', () => {
    it('unpins Chrome from dock via pinned context menu', async () => {
      const res = await evalJS(app.port, `
        (() => {
          removeContextMenu();
          const chromeStub = Array.from(document.querySelectorAll('#window-area .pinned-not-running'))
            .find(el => el.dataset.tooltip.includes('Chrome'));
          const rect = chromeStub.getBoundingClientRect();
          chromeStub.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top }));
          const unpinItem = document.querySelector('.ctx-item[data-action="unpin"]');
          if (unpinItem) unpinItem.click();
          return { isPinned: isPinned('google-chrome') };
        })()
      `);

      assert.strictEqual(res.isPinned, false, 'Chrome is unpinned');

      await evalJS(app.port, `
        lastWinSnap = '';
        renderX11Windows([]);
      `);
      const stubCount = await evalJS(app.port, `
        document.querySelectorAll('#window-area .pinned-not-running').length
      `);
      assert.strictEqual(stubCount, 1, 'Only 1 stub remains after unpinning Chrome');
    });

    it('unpins Gedit from dock via pinned context menu', async () => {
      const res = await evalJS(app.port, `
        (() => {
          removeContextMenu();
          const geditStub = Array.from(document.querySelectorAll('#window-area .pinned-not-running'))
            .find(el => el.dataset.tooltip.includes('Text Edit'));
          const rect = geditStub.getBoundingClientRect();
          geditStub.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top }));
          const unpinItem = document.querySelector('.ctx-item[data-action="unpin"]');
          if (unpinItem) unpinItem.click();
          return { isPinned: isPinned('gedit') };
        })()
      `);

      assert.strictEqual(res.isPinned, false, 'Gedit is unpinned');

      await evalJS(app.port, `
        lastWinSnap = '';
        renderX11Windows([]);
      `);
      const stubCount = await evalJS(app.port, `
        document.querySelectorAll('#window-area .pinned-not-running').length
      `);
      assert.strictEqual(stubCount, 0, 'No stubs remain after unpinning all apps');
    });
  });

  describe('7. Resizing the Taskbar / Dock', () => {
    it('applies default dock scale and CSS variable', async () => {
      await evalJS(app.port, `applyDockScale(1.0);`);
      const btnSize = await evalJS(app.port, `
        document.documentElement.style.getPropertyValue('--dock-btn-size')
      `);
      assert.strictEqual(btnSize, '52px', 'Default scale 1.0 sets --dock-btn-size to 52px');
    });

    it('resizes dock up to larger scale (1.5x)', async () => {
      await evalJS(app.port, `applyDockScale(1.5);`);
      const btnSize = await evalJS(app.port, `
        document.documentElement.style.getPropertyValue('--dock-btn-size')
      `);
      assert.strictEqual(btnSize, '78px', 'Scale 1.5 sets --dock-btn-size to 78px');
    });

    it('resizes dock down to smaller scale (0.75x)', async () => {
      await evalJS(app.port, `applyDockScale(0.75);`);
      const btnSize = await evalJS(app.port, `
        document.documentElement.style.getPropertyValue('--dock-btn-size')
      `);
      assert.strictEqual(btnSize, '39px', 'Scale 0.75 sets --dock-btn-size to 39px');
    });

    it('clamps dock resizing to min (0.55) and max (1.6) scale bounds', async () => {
      await evalJS(app.port, `applyDockScale(0.1);`);
      let scale = await evalJS(app.port, `dockScale`);
      assert.strictEqual(scale, 0.55, 'Scale clamps to min 0.55');

      await evalJS(app.port, `applyDockScale(3.0);`);
      scale = await evalJS(app.port, `dockScale`);
      assert.strictEqual(scale, 1.6, 'Scale clamps to max 1.6');

      await evalJS(app.port, `applyDockScale(1.0);`);
    });
  });

  describe('8. Window Control Context Menu Actions', () => {
    it('displays standard window control actions in context menu', async () => {
      const res = await evalJS(app.port, `
        (() => {
          removeContextMenu();
          lastWinSnap = '';
          renderX11Windows(window.__test_windows);
          const btn = document.querySelector('#window-area .win-btn');
          const rect = btn.getBoundingClientRect();
          btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top }));
          const items = Array.from(document.querySelectorAll('.ctx-item')).map(el => el.textContent.trim());
          removeContextMenu();
          return { items };
        })()
      `);

      assert.ok(res.items.some(a => a.includes('Bring to Front')), 'Contains Bring to Front action');
      assert.ok(res.items.some(a => a.includes('Maximize / Restore')), 'Contains Maximize / Restore action');
      assert.ok(res.items.some(a => a.includes('Minimize')), 'Contains Minimize action');
      assert.ok(res.items.some(a => a.includes('Close')), 'Contains Close action');
      assert.ok(res.items.some(a => a.includes('New Incognito Window')), 'Contains desktop action');
    });
  });
});
