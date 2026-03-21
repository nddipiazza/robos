'use strict';

const { exec } = require('child_process');

module.exports = {
  type: 'launch_app',
  label: 'Launch App',
  description: 'Open a RobOS Electron app',
  params: {
    appId: { type: 'string', required: true, templatable: true },
    args: { type: 'string', required: false, templatable: true },
  },

  async execute(params, _context) {
    const appPath = `/usr/local/share/robos/${params.appId}`;
    const cmd = `electron ${appPath} --no-sandbox --disable-gpu --disable-dev-shm-usage ${params.args || ''}`.trim();

    return new Promise((resolve) => {
      const child = exec(cmd, { timeout: 10000 }, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, output: `Launched ${params.appId}` });
        }
      });

      // Don't wait for app to exit — resolve after launch
      setTimeout(() => {
        resolve({ success: true, output: `Launched ${params.appId} (pid: ${child.pid})` });
      }, 500);
    });
  },
};
