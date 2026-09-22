'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

/**
 * XvfbRobOSAgentSession
 * Manages an isolated headless virtual framebuffer (Xvfb) agent session
 * for running Godot 4 games, executing Cucumber E2E tests, and capturing
 * video proof-of-work recordings and GameState telemetry.
 */
class XvfbRobOSAgentSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectDir = options.projectDir || path.resolve(__dirname, '../../../games/crpg-realm');
    this.display = options.display || process.env.CRPG_DISPLAY || ':99';
    this.webPort = options.webPort || parseInt(process.env.CRPG_WEB_SERVICE_PORT || '18090', 10);
    this.reportsDir = options.reportsDir || path.join(this.projectDir, 'tests', 'e2e', 'reports');
    this.videosDir = path.join(this.reportsDir, 'videos');
    this.xvfbProc = null;
    this.godotProc = null;
    this.ffmpegProc = null;
  }

  async runE2ESuite(extraArgs = []) {
    this.emit('session:starting', { display: this.display, port: this.webPort });
    const runnerScript = path.join(this.projectDir, 'run_cucumber_tests.py');

    if (!fs.existsSync(runnerScript)) {
      throw new Error(`Cucumber runner script not found at ${runnerScript}`);
    }

    const env = {
      ...process.env,
      DISPLAY: this.display,
      CRPG_WEB_SERVICE_PORT: String(this.webPort),
      USE_XVFB: '1'
    };

    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [runnerScript, ...extraArgs], {
        cwd: this.projectDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', chunk => {
        const text = chunk.toString();
        stdout += text;
        this.emit('session:log', text);
      });

      proc.stderr.on('data', chunk => {
        const text = chunk.toString();
        stderr += text;
        this.emit('session:err', text);
      });

      proc.on('close', code => {
        const artifacts = this.listArtifacts();
        const result = {
          exitCode: code,
          success: code === 0,
          stdout,
          stderr,
          reportPath: path.join(this.reportsDir, 'index.html'),
          artifacts
        };

        if (code === 0) {
          this.emit('session:completed', result);
          resolve(result);
        } else {
          this.emit('session:failed', result);
          resolve(result);
        }
      });

      proc.on('error', err => {
        this.emit('session:error', err);
        reject(err);
      });
    });
  }

  listArtifacts() {
    const artifacts = {
      videos: [],
      telemetry: []
    };

    if (fs.existsSync(this.videosDir)) {
      artifacts.videos = fs.readdirSync(this.videosDir)
        .filter(f => f.endsWith('.mp4'))
        .map(f => path.join(this.videosDir, f));
    }

    if (fs.existsSync(this.reportsDir)) {
      artifacts.telemetry = fs.readdirSync(this.reportsDir)
        .filter(f => f.startsWith('gamestate_') && f.endsWith('.json'))
        .map(f => path.join(this.reportsDir, f));
    }

    return artifacts;
  }
}

module.exports = { XvfbRobOSAgentSession };
