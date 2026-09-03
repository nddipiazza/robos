'use strict';
const { EventEmitter } = require('events');
const net = require('net');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { AutonomousEDDRunner, EDD_PHASES } = require('./lib/edd-runner');

class RobOSAgentSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.homeDir = options.homeDir || process.env.HOME || os.homedir();
    this.socketPath = options.socketPath || path.join(this.homeDir, '.config', 'robos', 'agentd', 'agentd.sock');
    this.fallbackDaemon = options.daemon || null;
    this.eddRunner = new AutonomousEDDRunner();
  }

  async sendSocketCommand(payload) {
    if (this.fallbackDaemon) {
      // Direct in-process daemon execution
      const cmd = payload.command;
      if (cmd === 'spawn') return this.fallbackDaemon.spawnAgent(payload.taskId, payload.options);
      if (cmd === 'list') return { ok: true, agents: this.fallbackDaemon.listAgents() };
      if (cmd === 'inspect') return this.fallbackDaemon.inspectAgent(payload.taskId);
      if (cmd === 'terminate') return this.fallbackDaemon.terminateAgent(payload.taskId);
      if (cmd === 'wipeAll') return { ok: true, results: this.fallbackDaemon.wipeAll() };
      if (cmd === 'appendLog') return this.fallbackDaemon.appendLog(payload.taskId, payload.line);
      return { ok: false, error: 'Unknown command' };
    }

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.socketPath)) {
        return resolve({ ok: false, error: `Socket not found at ${this.socketPath}` });
      }

      const client = net.createConnection({ path: this.socketPath }, () => {
        client.write(JSON.stringify(payload) + '\n');
      });

      let buf = '';
      client.on('data', chunk => {
        buf += chunk.toString('utf8');
      });

      client.on('end', () => {
        try {
          resolve(JSON.parse(buf.trim()));
        } catch (err) {
          resolve({ ok: false, error: 'Malformed socket response', raw: buf });
        }
      });

      client.on('error', err => {
        resolve({ ok: false, error: err.message });
      });
    });
  }

  async spawnAgentSession(taskId, options = {}) {
    const res = await this.sendSocketCommand({ command: 'spawn', taskId, options });
    if (res.ok) {
      this.emit('session:spawned', res.agent);
    }
    return res;
  }

  async listAgentSessions() {
    const res = await this.sendSocketCommand({ command: 'list' });
    if (res.ok) {
      return res.agents || [];
    }
    return [];
  }

  async inspectAgentSession(taskId) {
    return this.sendSocketCommand({ command: 'inspect', taskId });
  }

  async sendAgentCommand(taskId, command) {
    const logRes = await this.sendSocketCommand({
      command: 'appendLog',
      taskId,
      line: `[COMMAND_DISPATCH] ${command}`,
    });
    this.emit('session:command', { taskId, command });
    return logRes;
  }

  async terminateAgentSession(taskId) {
    const res = await this.sendSocketCommand({ command: 'terminate', taskId });
    if (res.ok) {
      this.emit('session:terminated', res.agent);
    }
    return res;
  }

  async wipeAllSessions() {
    const res = await this.sendSocketCommand({ command: 'wipeAll' });
    if (res.ok) {
      this.emit('session:wiped');
    }
    return res;
  }

  async runEDD(config = {}) {
    return this.eddRunner.executeEDDLoop(config);
  }
}

module.exports = { RobOSAgentSession, AutonomousEDDRunner, EDD_PHASES };
