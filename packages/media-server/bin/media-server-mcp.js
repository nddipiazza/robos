#!/usr/bin/env node
'use strict';

/**
 * RobOS Media Server — Stdio MCP Bridge
 *
 * Works in two modes:
 *   1. Remote/HTTP bridge mode (default when ROBOS_MEDIA_SERVER_URL is set or a server is configured in ~/.config/robos/media-servers.json):
 *      forwards every JSON-RPC request over HTTP to `http://<server>:19234/mcp`!
 *   2. Direct local mode: opens the local `MediaCatalogStore` directly when run on the server host with `--local`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const readline = require('node:readline');
const { MediaCatalogStore } = require('../lib/catalog-store');
const { createMcpDispatcher } = require('../lib/mcp-handler');

function resolveTargetMcpUrl() {
  if (process.argv.includes('--local')) return null;
  const urlFlagIdx = process.argv.indexOf('--url');
  if (urlFlagIdx >= 0 && process.argv[urlFlagIdx + 1]) {
    const raw = process.argv[urlFlagIdx + 1].replace(/\/+$/, '');
    return raw.endsWith('/mcp') ? raw : `${raw}/mcp`;
  }
  if (process.env.ROBOS_MEDIA_SERVER_URL) {
    const raw = process.env.ROBOS_MEDIA_SERVER_URL.replace(/\/+$/, '');
    return raw.endsWith('/mcp') ? raw : `${raw}/mcp`;
  }
  try {
    const home = process.env.HOME || os.homedir();
    const cfgFile = path.join(home, '.config', 'robos', 'media-servers.json');
    if (fs.existsSync(cfgFile)) {
      const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
      const servers = Array.isArray(cfg.servers) ? cfg.servers.filter(s => s && s.enabled !== false && s.url) : [];
      const chosen = servers.find(s => s.id === cfg.defaultServerId) || servers[0];
      if (chosen) {
        const u = String(chosen.mcpUrl || `${chosen.url.replace(/\/+$/, '')}/mcp`);
        return u;
      }
    }
  } catch {}
  return 'http://127.0.0.1:19234/mcp';
}

function forwardRpcOverHttp(mcpUrl, rpcReq) {
  return new Promise((resolve, reject) => {
    const u = new URL(mcpUrl);
    const mod = u.protocol === 'https:' ? https : http;
    const body = JSON.stringify(rpcReq);
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (!data.trim()) return resolve(null);
        try { resolve(JSON.parse(data)); }
        catch (err) { reject(new Error(`Invalid JSON from ${mcpUrl}: ${err.message}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout contacting ${mcpUrl}`)); });
    req.on('error', reject);
    req.end(body);
  });
}

function serveStdio() {
  const remoteMcpUrl = resolveTargetMcpUrl();
  let localDispatcher = null;
  const getLocal = () => {
    if (!localDispatcher) {
      const store = new MediaCatalogStore();
      localDispatcher = createMcpDispatcher(store, () => 'http://127.0.0.1:19234');
    }
    return localDispatcher;
  };

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
      return;
    }

    if (remoteMcpUrl) {
      try {
        const remoteRes = await forwardRpcOverHttp(remoteMcpUrl, req);
        if (req.id !== undefined && remoteRes) {
          process.stdout.write(JSON.stringify(remoteRes) + '\n');
        }
        return;
      } catch (err) {
        // Fall back to local store if remote is localhost and not started yet
        if (!remoteMcpUrl.includes('127.0.0.1') && !remoteMcpUrl.includes('localhost')) {
          if (req.id !== undefined) {
            process.stdout.write(JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              error: { code: -32603, message: `RobOS Media Server unreachable (${remoteMcpUrl}): ${err.message}` },
            }) + '\n');
          }
          return;
        }
      }
    }

    try {
      const result = await getLocal().dispatch(req);
      if (req.id !== undefined && result !== undefined) {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
      }
    } catch (err) {
      if (req.id !== undefined) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: err.code || -32603, message: err.message },
        }) + '\n');
      }
    }
  });
}

if (require.main === module) serveStdio();
module.exports = { resolveTargetMcpUrl, forwardRpcOverHttp };
