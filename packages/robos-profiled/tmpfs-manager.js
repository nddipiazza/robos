'use strict';
const path = require('path');
const fs   = require('fs');
const cp   = require('child_process');

class TmpfsManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || '/home';
    this.defaultQuota = options.defaultQuota || '2G';
    this.skelDir = options.skelDir || '/etc/skel';
  }

  mountHome(username, options = {}) {
    const quota = options.quota || this.defaultQuota;
    const targetDir = path.join(this.baseDir, username);

    // Create target directory if needed
    fs.mkdirSync(targetDir, { recursive: true });

    let mounted = false;
    let isMock = false;

    // In non-root / test environments, simulate or mount tmpfs
    if (process.getuid && process.getuid() === 0) {
      try {
        cp.execSync(`mount -t tmpfs -o size=${quota},mode=0700 tmpfs "${targetDir}"`, { stdio: 'ignore' });
        mounted = true;
      } catch {
        isMock = true;
      }
    } else {
      isMock = true;
    }

    // Set secure 0700 permissions
    try {
      fs.chmodSync(targetDir, 0o700);
    } catch {}

    // Populate skeleton dotfiles from /etc/skel
    this.populateSkel(targetDir);

    return {
      ok: true,
      targetDir,
      quota,
      mounted,
      isMock,
      dotfiles: ['.bashrc', '.profile'],
    };
  }

  populateSkel(targetDir) {
    const defaultDotfiles = {
      '.bashrc': '# RobOS Ephemeral Agent bashrc\nexport PS1="\\[\\033[01;36m\\]\\u@robos-agent\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ "\nexport DISPLAY=":0"\n',
      '.profile': '# RobOS Ephemeral Agent profile\nexport ROBOS_AGENT=1\nexport HOME="' + targetDir + '"\n',
    };

    // Copy from /etc/skel if available
    if (fs.existsSync(this.skelDir)) {
      try {
        const files = fs.readdirSync(this.skelDir);
        for (const file of files) {
          const src = path.join(this.skelDir, file);
          const dest = path.join(targetDir, file);
          if (!fs.existsSync(dest) && fs.statSync(src).isFile()) {
            fs.copyFileSync(src, dest);
          }
        }
      } catch {}
    }

    // Ensure baseline dotfiles exist and contain agent environment
    for (const [name, content] of Object.entries(defaultDotfiles)) {
      const p = path.join(targetDir, name);
      if (!fs.existsSync(p)) {
        fs.writeFileSync(p, content, 'utf8');
      } else {
        const existing = fs.readFileSync(p, 'utf8');
        if (!existing.includes('robos-agent')) {
          fs.appendFileSync(p, '\n' + content, 'utf8');
        }
      }
    }
  }

  unmountHome(username) {
    const targetDir = path.join(this.baseDir, username);
    if (!fs.existsSync(targetDir)) return { ok: true, cleaned: true };

    if (process.getuid && process.getuid() === 0) {
      try {
        cp.execSync(`umount -l "${targetDir}"`, { stdio: 'ignore' });
      } catch {}
    }

    // Purge temporary files and directory
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch {}

    return { ok: true, cleaned: true, targetDir };
  }
}

module.exports = { TmpfsManager };
