// The appliance omits optional native accelerators. Keep Windows binaries intact.
if (process.platform !== 'win32') {
  const fs = require('node:fs');
  const path = require('node:path');
  function clean(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) clean(file);
      else if (item.isFile() && item.name.endsWith('.node')) fs.unlinkSync(file);
    }
  }
  clean(path.join(__dirname, 'node_modules'));
}
