'use strict';
const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

/**
 * RobOS Desktop Explorer & Taskbar Demo
 * Multi-Document App Integration & Real Desktop Apps (.desktop resolution)
 * Demonstrates:
 *  1. Initializing the desktop shell on host virtual framebuffer
 *  2. Launching real Visual Studio Code with multiple workspace windows (multi-doc app)
 *  3. Launching real Google Chrome and GNOME Calculator
 *  4. Live discovery of all .desktop files and native high-res icons
 *  5. Multi-window badge count on the VS Code dock item
 *  6. Clicking VS Code to trigger the interactive Multi-Document Picker menu
 *  7. Window selection and document switching via the picker
 *  8. Pinning multi-document VS Code, Chrome, and Calculator
 *  9. Closing windows and testing launcher stub retention and relaunch
 * 10. Dynamic dock scaling and cleanup
 */

let chromeProc = null;
let calcProc = null;
let codeProcs = [];
const CHROME_PROFILE = '/tmp/robos-demo-chrome-profile';
const CODE_DATA = '/tmp/robos-demo-code-data';
const PROJ_A = '/tmp/robos-workspace-frontend';
const PROJ_B = '/tmp/robos-workspace-backend';

function setupWorkspaceDirs() {
  fs.mkdirSync(PROJ_A, { recursive: true });
  fs.mkdirSync(PROJ_B, { recursive: true });
  fs.writeFileSync(`${PROJ_A}/App.tsx`, '// RobOS Frontend Client\nconsole.log("Ready");\n');
  fs.writeFileSync(`${PROJ_B}/server.go`, '// RobOS Backend Server\npackage main\n');
}

function launchRealApps() {
  setupWorkspaceDirs();
  const display = process.env.DISPLAY || ':99';
  const codeBin = fs.existsSync('/home/ndipiazza/.local/share/code/code')
    ? '/home/ndipiazza/.local/share/code/code'
    : (fs.existsSync('/home/ndipiazza/.local/share/code/bin/code') ? '/home/ndipiazza/.local/share/code/bin/code' : 'code');

  // 1. Launch VS Code Window 1 (Workspace A)
  const p1 = spawn(codeBin, [
    '--ozone-platform=x11',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${CODE_DATA}/a`,
    '--new-window',
    '--window-position=300,50',
    '--window-size=920,560',
    PROJ_A,
  ], {
    env: { ...process.env, DISPLAY: display },
    stdio: 'ignore',
    detached: true,
  });
  p1.unref();
  codeProcs.push(p1);

  // 2. Launch VS Code Window 2 (Workspace B)
  setTimeout(() => {
    const p2 = spawn(codeBin, [
      '--ozone-platform=x11',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${CODE_DATA}/b`,
      '--new-window',
      '--window-position=340,80',
      '--window-size=920,560',
      PROJ_B,
    ], {
      env: { ...process.env, DISPLAY: display },
      stdio: 'ignore',
      detached: true,
    });
    p2.unref();
    codeProcs.push(p2);
  }, 1200);

  // 3. Launch Google Chrome
  setTimeout(() => {
    chromeProc = spawn('google-chrome', [
      '--ozone-platform=x11',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-position=380,110',
      '--window-size=880,520',
      `--user-data-dir=${CHROME_PROFILE}`,
      'https://robos.dev',
    ], {
      env: { ...process.env, DISPLAY: display },
      stdio: 'ignore',
      detached: true,
    });
    chromeProc.unref();
  }, 2000);

  // 4. Launch GNOME Calculator
  setTimeout(() => {
    calcProc = spawn('gnome-calculator', [], {
      env: { ...process.env, DISPLAY: display, GDK_BACKEND: 'x11' },
      stdio: 'ignore',
      detached: true,
    });
    calcProc.unref();
  }, 2500);
}

function closeRealApps() {
  codeProcs.forEach(p => {
    if (p && p.pid) {
      try { process.kill(-p.pid, 'SIGTERM'); } catch {}
      try { p.kill('SIGKILL'); } catch {}
    }
  });
  codeProcs = [];

  if (chromeProc && chromeProc.pid) {
    try { process.kill(-chromeProc.pid, 'SIGTERM'); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    chromeProc = null;
  }
  if (calcProc && calcProc.pid) {
    try { process.kill(-calcProc.pid, 'SIGTERM'); } catch {}
    try { calcProc.kill('SIGKILL'); } catch {}
    calcProc = null;
  }
  try {
    const display = process.env.DISPLAY || ':99';
    execSync('pkill -f "code --ozone-platform=x11" || true', { env: { ...process.env, DISPLAY: display } });
    execSync(`pkill -f "${CHROME_PROFILE}" || true`, { env: { ...process.env, DISPLAY: display } });
    execSync('pkill -f "gnome-calculator" || true', { env: { ...process.env, DISPLAY: display } });
  } catch {}
  try {
    fs.rmSync(CHROME_PROFILE, { recursive: true, force: true });
    fs.rmSync(CODE_DATA, { recursive: true, force: true });
    fs.rmSync(PROJ_A, { recursive: true, force: true });
    fs.rmSync(PROJ_B, { recursive: true, force: true });
  } catch {}
}

const SCRIPT = [
  {
    narration: 'Step 1: RobOS Desktop Explorer shell initializes with top menu bar and bottom application dock.',
    js: `(async () => {
      document.body.classList.add('demo-mode');
      pinnedApps = [];
      savePinnedApps();
      lastWinSnap = '';
      await refreshWindows();
    })()`,
    minHold: 3000,
  },
  {
    narration: 'Step 2: Clicking the App Launcher button on the dock to open RobOS App Launcher and launch real applications: VS Code (2 workspace windows), Google Chrome, and GNOME Calculator.',
    target: '#btn-launcher',
    action: 'click',
    callout: 'Click App Launcher on Dock',
    js: `(async () => {
      showToast('Opening App Launcher & Launching Apps…');
      try { await window.robos.launchApp('app-launcher'); } catch(_) {}
    })()`,
    minHold: 4500,
  },
  {
    narration: 'Step 3: Taskbar dynamically matches .desktop entries and resolves native icons for VS Code, Chrome, and Calculator.',
    js: `(async () => {
      await refreshWindows();
    })()`,
    minHold: 5000,
  },
  {
    narration: 'Step 4: VS Code is recognized as a multi-document app, displaying a glowing count badge on its dock icon.',
    target: '#window-area .win-btn[data-instance="code"]',
    action: 'hover',
    callout: 'Multi-Document Grouping (2 Windows)',
    js: `(async () => {
      await refreshWindows();
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Step 5: Clicking the multi-window VS Code icon opens the Document Picker menu listing all open workspace windows.',
    target: '#window-area .win-btn[data-instance="code"]',
    action: 'click',
    callout: 'Click to open Multi-Doc Window Picker',
    js: `(() => {
      const menu = document.querySelector('.window-picker-menu');
      if (!menu) {
        const codeBtn = document.querySelector('#window-area .win-btn[data-instance="code"]');
        if (codeBtn) codeBtn.click();
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'Step 6: Right-clicking any application reveals full window controls and desktop actions to pin it to the dock.',
    target: '#window-area .win-btn[data-instance="code"]',
    action: 'contextmenu',
    callout: 'Right-click for Window Actions & Pin',
    js: `(async () => {
      setTimeout(() => {
        const pinItem = document.querySelector('.ctx-item[data-action="pin"]');
        if (pinItem) pinItem.click();
      }, 2000);
    })()`,
    minHold: 5000,
  },
  {
    narration: 'Step 7: Closing application windows; pinned applications seamlessly remain on the dock as quick-launcher stubs.',
    js: `(async () => {
      showToast('Application Windows Closed');
      await refreshWindows();
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Step 8: Clicking the pinned VS Code launcher stub executes the action and relaunches the editor.',
    target: '#window-area .pinned-not-running',
    action: 'click',
    callout: 'Click Pinned Launcher Stub to Relaunch',
    js: `(async () => {
      showToast('Relaunching VS Code from Dock…');
      const codeStub = document.querySelector('#window-area .pinned-not-running');
      if (codeStub) codeStub.click();
      await refreshWindows();
    })()`,
    minHold: 4000,
  },
  {
    narration: 'Step 9: The dock separator handle allows smooth dynamic scaling down to the new 25% smaller ultra-compact minimum size (0.40 scale, ~21px).',
    target: '#dock-resize-handle',
    action: 'hover',
    callout: 'Dynamic Dock Scaling Handle (Min ~21px)',
    js: `(async () => {
      applyDockScale(0.40);
      showToast('Ultra-Compact Dock Scale (0.40 / ~21px)');
      setTimeout(() => { applyDockScale(1.3); showToast('Enlarged Scale (1.3)'); }, 1400);
      setTimeout(() => { applyDockScale(1.0); showToast('Standard Scale (1.0)'); }, 2600);
    })()`,
    minHold: 4000,
  },
  {
    narration: 'Step 10: Multi-document window grouping, .desktop resolution, and dynamic window management verified on localhost.',
    js: `(() => {
      showToast('RobOS Desktop Explorer Ready');
    })()`,
    minHold: 2500,
  },
];

runDemo({
  slug: 'desktop-taskbar',
  appId: 'robos-desktop',
  windowTitle: 'RobOS Desktop',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  prelaunch: async () => {
    closeRealApps();
    const display = process.env.DISPLAY || ':99';
    exec(`xsetroot -solid "#0a0d14"`, { env: { ...process.env, DISPLAY: display } }, () => {});
  },
  script: SCRIPT.map((s, idx) => {
    const origJs = s.js;
    if (idx === 1) {
      // Step 2: launch real apps
      return {
        ...s,
        js: `(async () => {
          ${origJs}
        })()`,
        action: async () => { launchRealApps(); },
      };
    }
    if (idx === 6) {
      // Step 7: close real apps
      return {
        ...s,
        action: async () => { closeRealApps(); },
      };
    }
    if (idx === 7) {
      // Step 8: relaunch code
      return {
        ...s,
        action: async () => {
          const display = process.env.DISPLAY || ':99';
          const codeBin = fs.existsSync('/home/ndipiazza/.local/share/code/code')
            ? '/home/ndipiazza/.local/share/code/code'
            : (fs.existsSync('/home/ndipiazza/.local/share/code/bin/code') ? '/home/ndipiazza/.local/share/code/bin/code' : 'code');
          const p = spawn(codeBin, [
            '--ozone-platform=x11',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            `--user-data-dir=${CODE_DATA}`,
            PROJ_A,
          ], {
            env: { ...process.env, DISPLAY: display },
            stdio: 'ignore',
            detached: true,
          });
          p.unref();
          codeProcs.push(p);
        },
      };
    }
    return s;
  }),
}).then(() => {
  closeRealApps();
}).catch(err => {
  closeRealApps();
  console.error(err);
  process.exit(1);
});
