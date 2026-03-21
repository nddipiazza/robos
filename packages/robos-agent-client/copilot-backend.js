/**
 * GitHub Copilot CLI backend — spawns `gh copilot` with a prompt and
 * parses its text-based output.
 */
'use strict';

const { spawn } = require('node:child_process');

class CopilotBackend {
  constructor(_opts = {}) {
    // Copilot CLI has fewer configuration knobs than Claude
  }

  /**
   * Spawn the gh copilot CLI process.
   *
   * @param {string} workspaceDir   — cwd for the child process
   * @param {string[]} contextFiles — files to reference (appended to prompt)
   * @param {string} prompt         — the prompt to send
   * @returns {ChildProcess}
   */
  spawn(workspaceDir, contextFiles, prompt) {
    let fullPrompt = prompt || '';
    if (contextFiles && contextFiles.length > 0) {
      fullPrompt += '\n\nContext files:\n';
      for (const f of contextFiles) {
        fullPrompt += `- ${f}\n`;
      }
    }

    return spawn('gh', ['copilot', 'suggest', '--target', 'shell', fullPrompt], {
      cwd: workspaceDir || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  }

  /**
   * Parse Copilot's text output.  Copilot CLI outputs plain text (not
   * structured JSON), so we return each non-empty line as a text event.
   *
   * @param {string} rawOutput
   * @returns {Array<{type:string, data:object}>}
   */
  parseOutput(rawOutput) {
    const events = [];
    if (!rawOutput) return events;

    const lines = rawOutput.split('\n').filter(Boolean);
    for (const line of lines) {
      events.push({ type: 'text', data: { text: line } });
    }
    return events;
  }

  /**
   * Best-effort metrics extraction.  Copilot CLI does not expose token usage,
   * so we only look for file-change hints in the output.
   *
   * @param {string} rawOutput
   * @returns {{ tokenUsage: null, filesChanged: string[] }}
   */
  parseMetrics(rawOutput) {
    const result = { tokenUsage: null, filesChanged: [] };
    if (!rawOutput) return result;

    // Heuristic: lines that look like file paths
    const filePattern = /^\s*([\w./-]+\.[a-z]{1,5})\s*$/;
    const lines = rawOutput.split('\n');
    for (const line of lines) {
      const m = line.match(filePattern);
      if (m) result.filesChanged.push(m[1]);
    }
    result.filesChanged = [...new Set(result.filesChanged)];
    return result;
  }
}

module.exports = { CopilotBackend };
