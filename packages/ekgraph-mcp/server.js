'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMCPServer } = require('../robos-mcp-lib/index');

const HOME_DIR = process.env.HOME || os.homedir();
const EKG_DIR = path.join(HOME_DIR, '.config', 'robos', 'ekgraph');
const EKG_FILE = path.join(EKG_DIR, 'nodes.json');

const DEFAULT_NODES = [
  {
    path: 'repos/robos-core',
    title: 'RobOS Core Platform',
    type: 'repository',
    content: 'Central operating system repository for RobOS desktop and IDE framework.',
    tags: ['core', 'electron', 'system'],
    links: ['services/gateway', 'people/ndipiazza'],
    updatedAt: new Date().toISOString(),
  },
  {
    path: 'services/auth-service',
    title: 'Authentication Service',
    type: 'service',
    content: 'OAuth2 and JWT token broker with automated key rotation.',
    endpoint: 'https://auth.internal.corp',
    logging: 'datadog://auth-svc',
    tags: ['auth', 'security', 'jwt'],
    links: ['environments/prod', 'people/ndipiazza'],
    updatedAt: new Date().toISOString(),
  },
  {
    path: 'services/gateway',
    title: 'API Gateway',
    type: 'service',
    content: 'Primary API gateway and rate limiter for RobOS services.',
    endpoint: 'https://api.internal.corp',
    logging: 'datadog://api-gw',
    tags: ['gateway', 'proxy', 'rate-limit'],
    links: ['services/auth-service', 'environments/prod'],
    updatedAt: new Date().toISOString(),
  },
  {
    path: 'environments/prod',
    title: 'Production Environment',
    type: 'environment',
    content: 'Primary production cluster deployed on AWS us-east-1 EKS.',
    cluster: 'us-east-1-k8s',
    ingress: 'https://api.robos.dev',
    tags: ['prod', 'aws', 'k8s'],
    links: ['services/auth-service', 'services/gateway'],
    updatedAt: new Date().toISOString(),
  },
  {
    path: 'people/ndipiazza',
    title: 'Lead Architect',
    type: 'person',
    content: 'Platform engineering, kernel architecture, and AI agent coordination.',
    email: 'ndipiazza@robos.local',
    team: 'Platform Engineering',
    tags: ['lead', 'architecture'],
    links: ['repos/robos-core'],
    updatedAt: new Date().toISOString(),
  },
];

class EKGraphService {
  constructor(options = {}) {
    this.nodes = new Map();
    this.nodesFile = options.nodesFile || EKG_FILE;
    this.init();
  }

  init() {
    if (fs.existsSync(this.nodesFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.nodesFile, 'utf8'));
        for (const n of list) this.nodes.set(n.path, n);
        return;
      } catch {}
    }
    for (const n of DEFAULT_NODES) {
      this.nodes.set(n.path, { ...n });
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.nodesFile), { recursive: true });
      fs.writeFileSync(this.nodesFile, JSON.stringify(Array.from(this.nodes.values()), null, 2), 'utf8');
    } catch {}
  }

  search(query = '') {
    const q = query.toLowerCase();
    const all = Array.from(this.nodes.values());
    if (!q) return all;
    return all.filter(n =>
      n.path.toLowerCase().includes(q) ||
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  getNode(nodePath) {
    return this.nodes.get(nodePath) || null;
  }

  listChildren(prefix = '') {
    const p = prefix.endsWith('/') ? prefix : (prefix ? `${prefix}/` : '');
    return Array.from(this.nodes.values()).filter(n => n.path.startsWith(p));
  }

  createNode(data = {}) {
    if (!data.path) throw new Error('Node path is required');
    const node = {
      path: data.path,
      title: data.title || data.path,
      type: data.type || 'knowledge',
      content: data.content || '',
      tags: data.tags || [],
      links: data.links || [],
      requiresReview: data.requiresReview || false,
      updatedAt: new Date().toISOString(),
    };
    this.nodes.set(node.path, node);
    this.save();
    return node;
  }

  updateNode(nodePath, data = {}) {
    const node = this.nodes.get(nodePath);
    if (!node) return null;
    Object.assign(node, data, { updatedAt: new Date().toISOString() });
    this.save();
    return node;
  }

  getLinked(nodePath) {
    const node = this.nodes.get(nodePath);
    if (!node) return [];

    const outgoing = node.links || [];
    const incoming = Array.from(this.nodes.values())
      .filter(n => (n.links || []).includes(nodePath))
      .map(n => n.path);

    const linkedPaths = Array.from(new Set([...outgoing, ...incoming]));
    return linkedPaths.map(p => this.nodes.get(p)).filter(Boolean);
  }
}

function createEKGraphMCPServer(options = {}) {
  const service = new EKGraphService(options);

  const server = createMCPServer({
    appId: 'ekgraph',
    name: 'EKGraph MCP Server',
    version: '1.3.0',
    description: 'RobOS Engineering Knowledge Graph Model Context Protocol Server',
    port: options.port || null,
    tools: [
      {
        name: 'robos_ekgraph_search',
        description: 'Natural language search across all knowledge nodes, services, and architectures.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search term or keyword' } },
          required: ['query'],
        },
        handler: async (args) => service.search(args.query),
      },
      {
        name: 'robos_ekgraph_get_node',
        description: 'Get a specific knowledge node by its canonical path.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Canonical node path (e.g. services/auth-service)' } },
          required: ['path'],
        },
        handler: async (args) => {
          const node = service.getNode(args.path);
          if (!node) throw new Error(`Node not found: ${args.path}`);
          return node;
        },
      },
      {
        name: 'robos_ekgraph_list_children',
        description: 'List all knowledge nodes under a category prefix.',
        inputSchema: {
          type: 'object',
          properties: { prefix: { type: 'string', description: 'Category prefix (e.g. services, repos)' } },
        },
        handler: async (args) => service.listChildren(args.prefix),
      },
      {
        name: 'robos_ekgraph_create_node',
        description: 'Create a new knowledge node in the Engineering Knowledge Graph.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Canonical path' },
            title: { type: 'string', description: 'Node title' },
            type: { type: 'string', description: 'Node type: service, repository, environment, person, architecture' },
            content: { type: 'string', description: 'Knowledge content' },
            tags: { type: 'array', items: { type: 'string' } },
            links: { type: 'array', items: { type: 'string' } },
          },
          required: ['path', 'title'],
        },
        handler: async (args) => service.createNode(args),
      },
      {
        name: 'robos_ekgraph_update_node',
        description: 'Update content or attributes of an existing knowledge node.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Node path' },
            content: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['path'],
        },
        handler: async (args) => {
          const node = service.updateNode(args.path, args);
          if (!node) throw new Error(`Node not found: ${args.path}`);
          return node;
        },
      },
      {
        name: 'robos_ekgraph_get_linked',
        description: 'Get all knowledge nodes linked to a given node in the graph topology.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Node path' } },
          required: ['path'],
        },
        handler: async (args) => service.getLinked(args.path),
      },
    ],
    resources: [
      {
        uri: 'robos://ekgraph-mcp/ekgraph/repos',
        name: 'All Repository Nodes',
        mimeType: 'application/json',
        handler: async () => service.listChildren('repos'),
      },
      {
        uri: 'robos://ekgraph-mcp/ekgraph/services',
        name: 'All Service Nodes',
        mimeType: 'application/json',
        handler: async () => service.listChildren('services'),
      },
      {
        uri: 'robos://ekgraph-mcp/ekgraph/environments',
        name: 'All Environment Nodes',
        mimeType: 'application/json',
        handler: async () => service.listChildren('environments'),
      },
      {
        uri: 'robos://ekgraph-mcp/ekgraph/people',
        name: 'All Team Member Nodes',
        mimeType: 'application/json',
        handler: async () => service.listChildren('people'),
      },
    ],
  });

  return { server, service };
}

module.exports = { createEKGraphMCPServer, EKGraphService };
