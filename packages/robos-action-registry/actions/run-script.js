'use strict';

const { execSync } = require('child_process');

module.exports = {
  type: 'run_script',
  label: 'Run Script',
  description: 'Execute a shell command with optional timeout',
  params: {
    command: { type: 'string', required: true, templatable: true },
    cwd: { type: 'string', required: false, templatable: true },
    timeout: { type: 'number', required: false },
    env: { type: 'object', required: false },
  },

  async execute(params, _context) {
    const timeout = (params.timeout || 30) * 1000;
    const opts = {
      timeout,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: params.cwd || undefined,
      env: params.env ? { ...process.env, ...params.env } : process.env,
    };

    try {
      const output = execSync(params.command, opts);
      return { success: true, output: output.trim() };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        output: (err.stdout || '') + (err.stderr || ''),
      };
    }
  },
};
