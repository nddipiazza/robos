#!/usr/bin/env node
'use strict';
const readline = require('readline');
const { MCPRouter } = require('./router');

const router = new MCPRouter();
const args = process.argv.slice(2);

if (args.includes('--claude-config')) {
  process.stdout.write(JSON.stringify(router.generateClaudeConfig(), null, 2) + '\n');
  process.exit(0);
}

// Default to stdio transport for AI agents like Claude Code
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const request = JSON.parse(trimmed);
    const response = await router.handleJsonRpc(request);
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    }) + '\n');
  }
});
