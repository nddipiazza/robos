'use strict';
const readline = require('readline');

function startStdioTransport(server) {
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
      const response = await server.handleJsonRpc(request);
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }) + '\n');
    }
  });

  return rl;
}

module.exports = { startStdioTransport };
