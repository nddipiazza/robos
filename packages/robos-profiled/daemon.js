'use strict';
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const net  = require('net');
const { TmpfsManager } = require('./tmpfs-manager');
const { DisplayBridge } = require('./display-bridge');
const { IdentityForwarder } = require('./identity-forwarder');

const HOME_DIR = process.env.HOME || os.homedir();
const RUN_DIR  = path.join(HOME_DIR, '.config', 'robos', 'profiled');
const STATE_FILE = path.join(RUN_DIR, 'profiles.json');
const SOCKET_PATH = path.join(RUN_DIR, 'profiled.sock');
const AGENT_HOMES_DIR = path.join(RUN_DIR, 'homes');

class ProfileDaemon {
  constructor(options = {}) {
    this.profiles = new Map();
    this.server = null;
    this.tmpfs = new TmpfsManager({
      baseDir: options.baseDir || (process.getuid && process.getuid() === 0 ? '/home' : AGENT_HOMES_DIR),
      defaultQuota: '2G',
    });
    this.displayBridge = new DisplayBridge(options);
    this.identityForwarder = new IdentityForwarder({
      hostHome: HOME_DIR,
      hostUid: options.hostUid,
    });
    this.init();
  }

  init() {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const list = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        for (const p of list) {
          this.profiles.set(p.username, p);
        }
      }
    } catch {}
  }

  saveState() {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    const list = Array.from(this.profiles.values());
    fs.writeFileSync(STATE_FILE, JSON.stringify(list, null, 2), 'utf8');
  }

  createProfile(name, options = {}) {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const username = cleanName.startsWith('my-agent-') ? cleanName : `my-agent-${cleanName}`;

    if (this.profiles.has(username)) {
      const existing = this.profiles.get(username);
      if (existing.status === 'active') {
        return { ok: false, error: `Profile ${username} is already active` };
      }
    }

    const uid = 15000 + Math.floor(Math.random() * 10000);
    const scopeName = `robos-agent-${cleanName}.scope`;

    // Mount memory-backed tmpfs home and populate skeleton dotfiles
    const mountRes = this.tmpfs.mountHome(username, { quota: options.quota || '2G' });
    const homeDir = mountRes.targetDir;

    // Bridge host display, audio, and DRI subsystem permissions
    const dispRes = this.displayBridge.bridgeDisplay(homeDir, uid);

    // Forward host SSH agent, Git identity, and AI model credentials
    const identRes = this.identityForwarder.forwardIdentity(homeDir, uid, options);

    const profile = {
      name: cleanName,
      username,
      uid,
      gid: uid,
      home: homeDir,
      tmpfs: true,
      quota: mountRes.quota,
      dotfiles: mountRes.dotfiles,
      display: dispRes.display,
      waylandDisplay: dispRes.waylandDisplay,
      xauthority: dispRes.xauthority,
      audioServer: dispRes.audioServer,
      gpuDri: dispRes.gpuDri,
      sshForwarded: identRes.sshForwarded,
      gpgForwarded: identRes.gpgForwarded,
      gitAuthor: identRes.gitAuthor,
      apiTokensInjected: identRes.apiTokensInjected,
      groups: ['video', 'render', 'audio', 'kvm'],
      scope: scopeName,
      createdAt: new Date().toISOString(),
      status: 'active',
      role: options.role || 'Autonomous Review Agent',
      model: options.model || 'claude-sonnet-4-20250514',
      memoryMb: options.memoryMb || 2048,
      pids: [process.pid],
    };

    this.profiles.set(username, profile);
    this.saveState();

    return { ok: true, profile };
  }

  listProfiles() {
    return Array.from(this.profiles.values());
  }

  inspectProfile(username) {
    const key = username.startsWith('my-agent-') ? username : `my-agent-${username}`;
    const profile = this.profiles.get(key) || this.profiles.get(username);
    if (!profile) return { ok: false, error: `Profile not found: ${username}` };
    return { ok: true, profile };
  }

  terminateProfile(username) {
    const key = username.startsWith('my-agent-') ? username : `my-agent-${username}`;
    const profile = this.profiles.get(key) || this.profiles.get(username);
    if (!profile) return { ok: false, error: `Profile not found: ${username}` };

    profile.status = 'terminated';
    profile.terminatedAt = new Date().toISOString();
    profile.pids = [];

    // Safe identity cleanup
    this.identityForwarder.cleanupIdentity(profile.home);

    // Safe unbridge and display cleanup
    this.displayBridge.unbridgeDisplay(profile.home);

    // Safe unmount and zero-residue purge
    this.tmpfs.unmountHome(username);

    this.profiles.set(profile.username, profile);
    this.saveState();

    return { ok: true, profile };
  }

  wipeAll() {
    const results = [];
    for (const [username, profile] of this.profiles.entries()) {
      if (profile.status === 'active') {
        const res = this.terminateProfile(username);
        results.push(res);
      }
    }
    return { ok: true, count: results.length };
  }

  spawnSwarm(count = 4, prefix = 'swarm', options = {}) {
    const created = [];
    for (let i = 1; i <= count; i++) {
      const name = `${prefix}-${i}`;
      const res = this.createProfile(name, {
        role: options.role || `Autonomous Swarm Worker ${i}`,
        model: options.model || 'claude-sonnet-4-20250514',
        quota: options.quota || '2G',
        ...options,
      });
      if (res.ok) created.push(res.profile);
    }
    return { ok: true, count: created.length, profiles: created };
  }

  runCommand(name, commandStr, options = {}) {
    const cp = require('child_process');
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const username = cleanName.startsWith('my-agent-') ? cleanName : `my-agent-${cleanName}`;
    let profile = this.profiles.get(username);
    if (!profile || profile.status !== 'active') {
      const createRes = this.createProfile(name, options);
      if (!createRes.ok) return createRes;
      profile = createRes.profile;
    }

    try {
      const output = cp.execSync(commandStr, {
        encoding: 'utf8',
        timeout: options.timeout || 15000,
        env: {
          ...process.env,
          ROBOS_AGENT: '1',
          ROBOS_AGENT_NAME: cleanName,
          HOME: profile.home,
          DISPLAY: profile.display || ':0',
          SSH_AUTH_SOCK: path.join(profile.home, '.ssh-auth-sock'),
        },
      });

      if (options.autoclean) {
        this.terminateProfile(username);
      }

      return { ok: true, output: output.trim(), username };
    } catch (err) {
      if (options.autoclean) {
        this.terminateProfile(username);
      }
      return { ok: false, error: err.message, output: (err.stdout || '').trim() };
    }
  }

  startSocketServer() {
    try {
      if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
    } catch {}

    this.server = net.createServer((sock) => {
      let buf = '';
      sock.on('data', (d) => {
        buf += d.toString();
        try {
          const msg = JSON.parse(buf);
          const res = this.handleCommand(msg);
          sock.write(JSON.stringify(res) + '\n');
          buf = '';
        } catch {}
      });
    });

    this.server.listen(SOCKET_PATH, () => {});
    return SOCKET_PATH;
  }

  handleCommand(msg) {
    const cmd = msg.command || msg.cmd;
    switch (cmd) {
      case 'create':
        return this.createProfile(msg.name, msg.options || {});
      case 'run':
        return this.runCommand(msg.name, msg.commandStr || msg.command, msg.options || {});
      case 'list':
        return { ok: true, profiles: this.listProfiles() };
      case 'inspect':
        return this.inspectProfile(msg.username || msg.name);
      case 'terminate':
        return this.terminateProfile(msg.username || msg.name);
      default:
        return { ok: false, error: `Unknown command: ${cmd}` };
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    try {
      if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
    } catch {}
  }
}

module.exports = { ProfileDaemon, SOCKET_PATH, STATE_FILE, RUN_DIR };
