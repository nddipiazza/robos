'use strict';
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const net  = require('net');
const cp   = require('child_process');
const { SessionTunnel } = require('./session-tunnel');
const { VirtualDisplayEngine } = require('./display-engine');

const HOME_DIR = process.env.HOME || os.homedir();
const RUN_DIR  = path.join(HOME_DIR, '.config', 'robos', 'agentd');
const STATE_FILE = path.join(RUN_DIR, 'agents.json');
const SOCKET_PATH = path.join(RUN_DIR, 'agentd.sock');
const AGENT_HOMES_DIR = path.join(RUN_DIR, 'homes');
const ARCHIVES_DIR = path.join(RUN_DIR, 'archives');

class AgentDaemon {
  constructor(options = {}) {
    this.agents = new Map();
    this.server = null;
    this.runDir = options.runDir || RUN_DIR;
    this.stateFile = options.stateFile || (options.runDir ? path.join(options.runDir, 'agents.json') : STATE_FILE);
    this.baseDir = options.baseDir || (process.getuid && process.getuid() === 0 ? '/home' : AGENT_HOMES_DIR);
    this.tunnel = new SessionTunnel({ hostHome: HOME_DIR, hostUid: options.hostUid });
    this.displayEngine = new VirtualDisplayEngine(options);
    this.init();
  }

  init() {
    fs.mkdirSync(this.runDir, { recursive: true });
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(ARCHIVES_DIR, { recursive: true });
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const list = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        for (const a of list) {
          this.agents.set(a.username, a);
        }
      }
    } catch {}
  }

  saveState() {
    try {
      const list = Array.from(this.agents.values());
      fs.writeFileSync(this.stateFile, JSON.stringify(list, null, 2), 'utf8');
    } catch {}
  }

  spawnAgent(taskId, options = {}) {
    const cleanId = String(taskId).toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const username = cleanId.startsWith('agent-') ? cleanId : `agent-${cleanId}`;
    const targetHome = path.join(this.baseDir, username);

    // If active already, return it
    if (this.agents.has(username) && this.agents.get(username).status === 'active') {
      return { ok: true, agent: this.agents.get(username), existing: true };
    }

    // 1. Allocate isolated UID & GID
    const uid = 20000 + Math.floor(Math.random() * 10000);
    const scopeName = `robos-subagent-${cleanId}.scope`;

    // 2. Initialize Home & Dotfiles
    fs.mkdirSync(targetHome, { recursive: true });
    try {
      fs.chmodSync(targetHome, 0o700);
    } catch {}

    const logsDir = path.join(targetHome, '.logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const bashrcContent = `# RobOS Sub-Agent Session Environment
export ROBOS_AGENT=1
export ROBOS_AGENT_TYPE="sub-agent"
export ROBOS_TASK_ID="${cleanId}"
export USER="${username}"
export HOME="${targetHome}"
export DISPLAY="\${DISPLAY:-:0}"
export PS1="[robos-agent:${cleanId}]\\\\$ "
`;
    fs.writeFileSync(path.join(targetHome, '.bashrc'), bashrcContent, 'utf8');
    fs.writeFileSync(path.join(targetHome, '.profile'), `source "\$HOME/.bashrc"\n`, 'utf8');

    // Initial session log
    const initialLog = `[${new Date().toISOString()}] [ROBOS_AGENTD] Sub-agent session initialized for task: ${cleanId}\n` +
      `[${new Date().toISOString()}] [ROBOS_AGENTD] UID: ${uid}, Scope: ${scopeName}, Home: ${targetHome}\n`;
    fs.writeFileSync(path.join(logsDir, 'session.log'), initialLog, 'utf8');

    // 3. Tunnel host credentials, SSH/GPG sockets, and git identity
    const tunnelRes = this.tunnel.tunnelSession(targetHome, uid, options);

    // 4. Allocate dedicated Virtual Display stream
    const dispRes = this.displayEngine.allocateDisplay(cleanId);

    const agent = {
      taskId: cleanId,
      username,
      uid,
      gid: uid,
      home: targetHome,
      scope: scopeName,
      role: options.role || 'Autonomous Developer Agent',
      model: options.model || 'claude-sonnet-4-20250514',
      memoryMb: options.memoryMb || 2048,
      cpuShares: options.cpuShares || 1024,
      maxPids: options.maxPids || 128,
      display: dispRes.display,
      displayNum: dispRes.displayNum,
      streamUrl: dispRes.streamUrl,
      resolution: dispRes.resolution,
      sshTunneled: tunnelRes.sshTunneled,
      gpgTunneled: tunnelRes.gpgTunneled,
      gitAuthor: tunnelRes.gitAuthor,
      apiTokensInjected: tunnelRes.apiTokensInjected,
      status: 'active',
      createdAt: new Date().toISOString(),
      logs: [initialLog.trim()],
    };

    this.agents.set(username, agent);
    this.saveState();

    return { ok: true, agent };
  }

  listAgents() {
    return Array.from(this.agents.values());
  }

  inspectAgent(taskId) {
    const cleanId = String(taskId).toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const username = cleanId.startsWith('agent-') ? cleanId : `agent-${cleanId}`;
    const agent = this.agents.get(username);
    if (!agent) return { ok: false, error: `Sub-agent not found: ${taskId}` };

    // Read live logs if available
    try {
      const logFile = path.join(agent.home, '.logs', 'session.log');
      if (fs.existsSync(logFile)) {
        agent.logs = fs.readFileSync(logFile, 'utf8').trim().split('\n');
      }
    } catch {}

    return { ok: true, agent };
  }

  appendLog(taskId, line) {
    const cleanId = String(taskId).toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const username = cleanId.startsWith('agent-') ? cleanId : `agent-${cleanId}`;
    const agent = this.agents.get(username);
    if (!agent) return { ok: false, error: 'Agent not found' };

    const entry = `[${new Date().toISOString()}] ${line}`;
    try {
      const logFile = path.join(agent.home, '.logs', 'session.log');
      fs.appendFileSync(logFile, entry + '\n', 'utf8');
      if (!agent.logs) agent.logs = [];
      agent.logs.push(entry);
    } catch {}
    return { ok: true };
  }

  terminateAgent(taskId) {
    const cleanId = String(taskId).toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const username = cleanId.startsWith('agent-') ? cleanId : `agent-${cleanId}`;
    const agent = this.agents.get(username);
    if (!agent) return { ok: false, error: `Sub-agent not found: ${taskId}` };

    agent.status = 'terminated';
    agent.terminatedAt = new Date().toISOString();

    // 1. Archive logs
    try {
      const logFile = path.join(agent.home, '.logs', 'session.log');
      const archiveDir = path.join(ARCHIVES_DIR, cleanId);
      fs.mkdirSync(archiveDir, { recursive: true });
      if (fs.existsSync(logFile)) {
        fs.copyFileSync(logFile, path.join(archiveDir, 'session.log'));
      }
      agent.archivedLog = path.join(archiveDir, 'session.log');
    } catch {}

    // 2. Release virtual display allocation
    this.displayEngine.releaseDisplay(cleanId);

    // 3. Cleanup tunneled sockets
    this.tunnel.cleanupTunnel(agent.home);

    // 4. Safe home directory cleanup
    try {
      if (fs.existsSync(agent.home)) {
        fs.rmSync(agent.home, { recursive: true, force: true });
      }
    } catch {}

    this.agents.set(username, agent);
    this.saveState();

    return { ok: true, agent };
  }

  wipeAll() {
    const results = [];
    for (const [username, agent] of this.agents.entries()) {
      if (agent.status === 'active') {
        results.push(this.terminateAgent(agent.taskId));
      }
    }
    return { ok: true, count: results.length };
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

  stop() {
    if (this.server) {
      try { this.server.close(); } catch {}
    }
    try {
      if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
    } catch {}
  }

  handleCommand(msg) {
    const cmd = msg.command || msg.cmd;
    switch (cmd) {
      case 'spawn':
        return this.spawnAgent(msg.taskId || msg.name, msg.options || {});
      case 'list':
        return { ok: true, agents: this.listAgents() };
      case 'inspect':
        return this.inspectAgent(msg.taskId || msg.name);
      case 'log':
        return this.appendLog(msg.taskId || msg.name, msg.line);
      case 'terminate':
        return this.terminateAgent(msg.taskId || msg.name);
      case 'wipeAll':
        return this.wipeAll();
      default:
        return { ok: false, error: `Unknown command: ${cmd}` };
    }
  }
}

module.exports = { AgentDaemon, RUN_DIR, STATE_FILE, SOCKET_PATH, AGENT_HOMES_DIR, ARCHIVES_DIR };
