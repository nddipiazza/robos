/**
 * HarnessRouter Backend for RobOS Agent Client
 *
 * Implements the backend interface for AgentSession, routing tasks through
 * the Unified Harness Protocol (UHP 2026-08-11) via HarnessRouter.
 */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

class HarnessRouterBackend {
  constructor(opts = {}) {
    this.harnessId = opts.harnessId || opts.agent || 'chrn_gemini';
    this.model = opts.model || 'gemini-3.8-flash';
    this.routerUrl = opts.routerUrl || 'http://127.0.0.1:3000';
    this.timeout = opts.timeout || 60000;
  }

  /**
   * Spawn a task execution process via the HarnessRouter runner script.
   *
   * @param {string} workspaceDir   — cwd for the child process
   * @param {string[]} contextFiles — files to reference
   * @param {string} prompt         — the prompt to send
   * @returns {ChildProcess}
   */
  spawn(workspaceDir, contextFiles, prompt) {
    let fullPrompt = prompt || '';
    if (contextFiles && contextFiles.length > 0) {
      fullPrompt += '\n\n## Context Files\n';
      for (const f of contextFiles) {
        fullPrompt += `- ${f}\n`;
      }
    }

    const runnerScript = `
      const { getHarnessRouter } = require(${JSON.stringify(path.join(__dirname, 'harness-router.js'))});
      (async () => {
        try {
          const router = await getHarnessRouter({ baseUrl: ${JSON.stringify(this.routerUrl)} });
          const res = await router.runTask({
            input: ${JSON.stringify(fullPrompt)},
            model: ${JSON.stringify(this.model)},
            harnessId: ${JSON.stringify(this.harnessId)},
            stream: true,
            cwd: ${JSON.stringify(workspaceDir || process.cwd())},
            onDelta: (delta) => { process.stdout.write(delta); },
            onEvent: (type, data) => {
              process.stdout.write(JSON.stringify({ type: 'uhp_event', event: type, data }) + '\\n');
            }
          });
          if (!res.ok) {
            process.stderr.write((res.error && res.error.message) || 'HarnessRouter task failed');
            process.exit(1);
          }
          process.exit(0);
        } catch (err) {
          process.stderr.write(err.message || String(err));
          process.exit(1);
        }
      })();
    `;

    return spawn(process.execPath, ['-e', runnerScript], {
      cwd: workspaceDir || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  }

  /**
   * Parse streamed output to extract UHP events.
   * @param {string} rawOutput
   * @returns {Array<{type:string, data:object}>}
   */
  parseOutput(rawOutput) {
    const events = [];
    if (!rawOutput) return events;

    const lines = rawOutput.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'uhp_event') {
          events.push({ type: obj.event || 'uhp_event', data: obj.data || {} });
        } else {
          events.push({ type: 'text', data: { text: line } });
        }
      } catch {
        events.push({ type: 'text', data: { text: line } });
      }
    }
    return events;
  }

  /**
   * Parse metrics from raw output.
   */
  parseMetrics(rawOutput) {
    const events = this.parseOutput(rawOutput);
    let tokenUsage = null;
    const filesChanged = [];

    for (const ev of events) {
      if (ev.data && ev.data.usage) {
        tokenUsage = ev.data.usage;
      }
    }

    return {
      tokenUsage,
      filesChanged,
    };
  }
}

module.exports = { HarnessRouterBackend };
