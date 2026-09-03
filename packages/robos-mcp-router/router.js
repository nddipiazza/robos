'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const HOME_DIR = process.env.HOME || os.homedir();
const MCP_DIR = path.join(HOME_DIR, '.config', 'robos', 'mcp');
const REGISTRY_FILE = path.join(MCP_DIR, 'servers.json');

function httpJsonRpc(url, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          resolve({ error: { message: 'Invalid JSON response' } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

class MCPRouter {
  constructor(options = {}) {
    this.name = options.name || 'RobOS Unified MCP Router';
    this.version = options.version || '1.0.0';
    this.registryFile = options.registryFile || REGISTRY_FILE;
    this.inMemoryServers = options.servers || null;
    this.httpServer = null;
    this.port = options.port || null;
  }

  getRegisteredServers() {
    if (this.inMemoryServers) return this.inMemoryServers;

    if (fs.existsSync(this.registryFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.registryFile, 'utf8'));
      } catch {}
    }

    // Default mock cluster fallback
    return {
      'task-manager': {
        appId: 'task-manager',
        name: 'Task Manager MCP Server',
        version: '1.2.0',
        tools: [
          {
            name: 'robos_task_manager_get_task',
            description: 'Fetches active task details and requirements.',
            inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
          },
          {
            name: 'robos_task_manager_list_tasks',
            description: 'Lists all open backlog and active sprint tasks.',
            inputSchema: { type: 'object', properties: { sprint: { type: 'string' } } },
          },
        ],
        resources: [
          { uri: 'robos://task-manager/tasks/active', name: 'Active Tasks', mimeType: 'application/json' },
        ],
      },
      'workspace-manager': {
        appId: 'workspace-manager',
        name: 'Workspace Manager MCP Server',
        version: '1.1.0',
        tools: [
          {
            name: 'robos_workspace_manager_list_repos',
            description: 'Lists all discovered Git repositories in the workspace.',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        resources: [
          { uri: 'robos://workspace-manager/repos', name: 'Discovered Repositories', mimeType: 'application/json' },
        ],
      },
    };
  }

  async handleJsonRpc(request) {
    const { id, method, params } = request;
    const servers = this.getRegisteredServers();

    try {
      if (method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: this.name,
              version: this.version,
            },
            capabilities: {
              tools: {},
              resources: {},
            },
          },
        };
      }

      if (method === 'ping') {
        return { jsonrpc: '2.0', id, result: {} };
      }

      if (method === 'tools/list') {
        const mergedTools = [];
        for (const [appId, s] of Object.entries(servers)) {
          const tools = s.tools || [];
          for (const t of tools) {
            const toolObj = typeof t === 'string'
              ? { name: t, description: `Provided by ${s.name || appId}`, inputSchema: { type: 'object', properties: {} } }
              : t;
            mergedTools.push(toolObj);
          }
        }
        return { jsonrpc: '2.0', id, result: { tools: mergedTools } };
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params || {};
        if (!name) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } };
        }

        // Identify target server from tool name (e.g. robos_task_manager_get_task -> task-manager)
        let targetAppId = null;
        for (const [appId, s] of Object.entries(servers)) {
          const tools = s.tools || [];
          const hasTool = tools.some(t => (typeof t === 'string' ? t === name : t.name === name));
          if (hasTool || name.includes(appId.replace(/-/g, '_'))) {
            targetAppId = appId;
            break;
          }
        }

        if (!targetAppId) {
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `No registered server found for tool: ${name}` } };
        }

        const targetServer = servers[targetAppId];
        // If HTTP endpoint available
        if (targetServer.endpoint) {
          try {
            const response = await httpJsonRpc(targetServer.endpoint, request);
            return response;
          } catch (err) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `Failed to reach server ${targetAppId}: ${err.message}` }],
              },
            };
          }
        }

        // Direct execution / simulated multiplexer response
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  routedVia: 'robos-mcp-router',
                  targetAppId,
                  tool: name,
                  params: args || {},
                  status: 'SUCCESS',
                  timestamp: new Date().toISOString(),
                }, null, 2),
              },
            ],
          },
        };
      }

      if (method === 'resources/list') {
        const mergedResources = [];
        for (const [appId, s] of Object.entries(servers)) {
          const resources = s.resources || [];
          for (const r of resources) {
            const resObj = typeof r === 'string'
              ? { uri: r, name: r, mimeType: 'application/json' }
              : r;
            mergedResources.push(resObj);
          }
        }
        return { jsonrpc: '2.0', id, result: { resources: mergedResources } };
      }

      if (method === 'resources/read') {
        const { uri } = params || {};
        if (!uri) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing resource URI' } };
        }

        // Parse robos://<appId>/...
        const match = uri.match(/^robos:\/\/([^/]+)\/(.*)$/);
        const targetAppId = match ? match[1] : null;

        if (!targetAppId || !servers[targetAppId]) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Resource not found: ${uri}` } };
        }

        const targetServer = servers[targetAppId];
        if (targetServer.endpoint) {
          try {
            return await httpJsonRpc(targetServer.endpoint, request);
          } catch (err) {
            return { jsonrpc: '2.0', id, error: { code: -32603, message: `Failed to reach server: ${err.message}` } };
          }
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  routedVia: 'robos-mcp-router',
                  targetAppId,
                  uri,
                  data: { fetched: true, timestamp: new Date().toISOString() },
                }, null, 2),
              },
            ],
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not supported: ${method}` },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Router error: ${err.message}` },
      };
    }
  }

  generateClaudeConfig() {
    return {
      mcpServers: {
        robos: {
          command: 'node',
          args: ['/usr/local/share/robos/robos-mcp-router/cli.js', '--stdio'],
        },
      },
    };
  }

  startHttp(port) {
    this.port = port;
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          return res.end();
        }

        if (req.url === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const servers = this.getRegisteredServers();
          return res.end(JSON.stringify({
            ok: true,
            name: this.name,
            version: this.version,
            serversConnected: Object.keys(servers).length,
          }));
        }

        if (req.url === '/mcp' && req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', async () => {
            try {
              const json = JSON.parse(body);
              const response = await this.handleJsonRpc(json);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      this.httpServer.listen(port, () => resolve(this.httpServer));
      this.httpServer.on('error', reject);
    });
  }

  stop() {
    if (this.httpServer) {
      try { this.httpServer.close(); } catch {}
    }
  }
}

module.exports = { MCPRouter };
