'use strict';
const http = require('http');
const { registerServer, unregisterServer } = require('./registry');

class MCPServer {
  constructor(options = {}) {
    this.appId = options.appId || 'robos-app';
    this.name = options.name || `RobOS ${this.appId} MCP Server`;
    this.version = options.version || '1.0.0';
    this.description = options.description || `MCP Server for RobOS ${this.appId}`;
    this.port = options.port || null;
    this.httpServer = null;

    this.tools = new Map();
    this.resources = new Map();

    if (options.tools) {
      const toolList = Array.isArray(options.tools) ? options.tools : Object.values(options.tools);
      for (const t of toolList) {
        this.addTool(t);
      }
    }

    if (options.resources) {
      const resList = Array.isArray(options.resources) ? options.resources : Object.values(options.resources);
      for (const r of resList) {
        this.addResource(r);
      }
    }
  }

  formatToolName(name) {
    if (name.startsWith('robos_')) return name;
    const cleanApp = this.appId.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    return `robos_${cleanApp}_${cleanName}`;
  }

  formatResourceUri(uri) {
    if (uri.startsWith('robos://')) return uri;
    const cleanPath = uri.replace(/^\/+/, '');
    return `robos://${this.appId}/${cleanPath}`;
  }

  addTool(tool) {
    const canonicalName = this.formatToolName(tool.name);
    this.tools.set(canonicalName, {
      name: canonicalName,
      description: tool.description || '',
      inputSchema: tool.inputSchema || tool.parameters || { type: 'object', properties: {} },
      handler: tool.handler || (async () => ({})),
    });
    return canonicalName;
  }

  addResource(resource) {
    const canonicalUri = this.formatResourceUri(resource.uri);
    this.resources.set(canonicalUri, {
      uri: canonicalUri,
      name: resource.name || canonicalUri,
      mimeType: resource.mimeType || 'application/json',
      description: resource.description || '',
      handler: resource.handler || (async () => ({})),
    });
    return canonicalUri;
  }

  async handleJsonRpc(request) {
    const { id, method, params } = request;

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
        const toolList = Array.from(this.tools.values()).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        return { jsonrpc: '2.0', id, result: { tools: toolList } };
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params || {};
        const tool = this.tools.get(name);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Tool not found: ${name}` },
          };
        }

        try {
          const rawResult = await tool.handler(args || {});
          const text = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text }],
            },
          };
        } catch (err) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: `Error executing ${name}: ${err.message}` }],
            },
          };
        }
      }

      if (method === 'resources/list') {
        const resList = Array.from(this.resources.values()).map(r => ({
          uri: r.uri,
          name: r.name,
          mimeType: r.mimeType,
          description: r.description,
        }));
        return { jsonrpc: '2.0', id, result: { resources: resList } };
      }

      if (method === 'resources/read') {
        const { uri } = params || {};
        const resource = this.resources.get(uri);
        if (!resource) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Resource not found: ${uri}` },
          };
        }

        const data = await resource.handler(uri);
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text,
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
        error: { code: -32603, message: `Internal server error: ${err.message}` },
      };
    }
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
          return res.end(JSON.stringify({
            ok: true,
            appId: this.appId,
            name: this.name,
            version: this.version,
            tools: this.tools.size,
            resources: this.resources.size,
          }));
        }

        if (req.url === '/mcp' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
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

      this.httpServer.listen(port, () => {
        this.register();
        resolve(this.httpServer);
      });

      this.httpServer.on('error', reject);
    });
  }

  register() {
    registerServer({
      appId: this.appId,
      name: this.name,
      version: this.version,
      port: this.port,
      endpoint: this.port ? `http://localhost:${this.port}/mcp` : null,
      tools: Array.from(this.tools.keys()),
      resources: Array.from(this.resources.keys()),
    });
  }

  stop() {
    unregisterServer(this.appId);
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch {}
    }
  }
}

function createMCPServer(options) {
  const server = new MCPServer(options);
  if (options.port) {
    server.startHttp(options.port);
  } else {
    server.register();
  }
  return server;
}

module.exports = { MCPServer, createMCPServer };
