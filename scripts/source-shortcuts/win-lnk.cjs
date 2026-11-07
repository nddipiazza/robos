'use strict';
// Writes Windows .lnk shortcuts. Run with Electron (not Node):
//   electron.exe win-lnk.cjs <job.json>
// Only Electron's shell.writeShortcutLink sets System.AppUserModel.ID on a shortcut, which
// is what makes Windows show a running window under its shortcut's icon and name and pin
// the shortcut (not electron.exe) to the taskbar. WScript.Shell cannot set it.
// job.json: { result: <path>, links: [{ file, target, args, cwd, description, icon, appUserModelId }] }
const fs = require('node:fs');
const { app, shell } = require('electron');

app.whenReady().then(() => {
  const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
  const results = job.links.map(link => {
    try {
      const ok = shell.writeShortcutLink(link.file, 'create', { target: link.target, args: link.args, cwd: link.cwd,
        description: link.description, icon: link.icon, iconIndex: 0, appUserModelId: link.appUserModelId });
      return { file: link.file, ok };
    } catch (error) { return { file: link.file, ok: false, error: error.message }; }
  });
  fs.writeFileSync(job.result, JSON.stringify(results));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
