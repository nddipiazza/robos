/**
 * Claude Code backend — spawns the `claude` CLI and parses its streaming
 * JSON output for tool calls, text, and errors.
 */
'use strict';

const { spawn } = require('node:child_process');

class ClaudeBackend {
  constructor(opts = {}) {
    this.model = opts.model || null;          // e.g. 'claude-sonnet-4-20250514'
    this.maxTokens = opts.maxTokens || null;
    this.outputFormat = opts.outputFormat || 'stream-json';
  }

  /**
   * Spawn the claude CLI process.
   *
   * @param {string} workspaceDir   — cwd for the child process
   * @param {string[]} contextFiles — files to reference (injected via prompt)
   * @param {string} prompt         — the prompt to send
   * @returns {ChildProcess}
   */
  spawn(workspaceDir, contextFiles, prompt) {
    const args = ['--print', '--output-format', this.outputFormat];
    if (this.model) args.push('--model', this.model);
    if (this.maxTokens) args.push('--max-tokens', String(this.maxTokens));

    // Append context file references to prompt
    let fullPrompt = prompt || '';
    if (contextFiles && contextFiles.length > 0) {
      fullPrompt += '\n\n## Context Files\n';
      for (const f of contextFiles) {
        fullPrompt += `- ${f}\n`;
      }
    }

    args.push('--', fullPrompt);

    return spawn('claude', args, {
      cwd: workspaceDir || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  }

  /**
   * Parse Claude's streaming JSON output to extract structured events.
   *
   * Each line of output may be a JSON object with type: 'text', 'tool_use',
   * 'result', 'error', etc.
   *
   * @param {string} rawOutput — accumulated stdout
   * @returns {Array<{type:string, data:object}>}
   */
  parseOutput(rawOutput) {
    const events = [];
    if (!rawOutput) return events;

    const lines = rawOutput.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        events.push({
          type: obj.type || 'unknown',
          data: obj,
        });
      } catch {
        // Non-JSON line — treat as plain text
        events.push({ type: 'text', data: { text: line } });
      }
    }
    return events;
  }

  /**
   * Best-effort extraction of metrics from output.
   *
   * @param {string} rawOutput
   * @returns {{ tokenUsage: {input:number, output:number}|null, filesChanged: string[] }}
   */
  parseMetrics(rawOutput) {
    const result = { tokenUsage: null, filesChanged: [] };
    if (!rawOutput) return result;

    const lines = rawOutput.split('\n');
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // Token usage from result messages
        if (obj.type === 'result' && obj.usage) {
          result.tokenUsage = {
            input: obj.usage.input_tokens || 0,
            output: obj.usage.output_tokens || 0,
          };
        }
        // File changes from tool_use events
        if (obj.type === 'tool_use' && obj.name === 'write_to_file' && obj.input && obj.input.path) {
          result.filesChanged.push(obj.input.path);
        }
        if (obj.type === 'tool_use' && obj.name === 'edit_file' && obj.input && obj.input.path) {
          result.filesChanged.push(obj.input.path);
        }
      } catch {
        // skip non-JSON
      }
    }
    // Deduplicate
    result.filesChanged = [...new Set(result.filesChanged)];
    return result;
  }
}

module.exports = { ClaudeBackend };
