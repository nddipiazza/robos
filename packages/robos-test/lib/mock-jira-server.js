/**
 * Mock Jira HTTP server for task-implementer demos.
 *
 * Responds to Jira REST API v3 endpoints:
 *   GET  /rest/api/3/myself           → fake user info
 *   POST /rest/api/3/search/jql       → mock issues (filtered by open/closed)
 *   GET  /rest/api/3/project          → mock project list
 *
 * Usage:
 *   const { startMockJira, stopMockJira } = require('./mock-jira-server');
 *   const server = await startMockJira(19890);
 *   // ...
 *   await stopMockJira(server);
 */
'use strict';

const http = require('http');

const MOCK_USER = {
  key: 'dev',
  name: 'dev@acme-inc.com',
  displayName: 'Dev User',
  emailAddress: 'dev@acme-inc.com',
  active: true,
};

const MOCK_ISSUES = [
  {
    id: '10001',
    key: 'ACME-101',
    fields: {
      summary: 'Fix authentication timeout in login service',
      description: 'Users report being logged out after 5 minutes of inactivity despite session_timeout set to 30 minutes in config.yaml. The middleware reads the wrong config key.',
      status: { name: 'To Do', statusCategory: { key: 'new' } },
      issuetype: { name: 'Bug' },
      priority: { name: 'High' },
      assignee: null,
      labels: ['bug', 'auth'],
      created: '2025-05-10T09:00:00.000+0000',
      updated: '2025-05-13T10:00:00.000+0000',
    },
  },
  {
    id: '10002',
    key: 'ACME-102',
    fields: {
      summary: 'Add pagination to /api/users endpoint',
      description: 'The /api/users endpoint returns all users without pagination. Add limit/offset query params and return total count in response headers.',
      status: { name: 'To Do', statusCategory: { key: 'new' } },
      issuetype: { name: 'Story' },
      priority: { name: 'Medium' },
      assignee: { displayName: 'Dev User', name: 'dev' },
      labels: ['feature', 'api'],
      created: '2025-05-11T14:00:00.000+0000',
      updated: '2025-05-12T14:30:00.000+0000',
    },
  },
  {
    id: '10003',
    key: 'ACME-103',
    fields: {
      summary: 'Upgrade React to v18.3 across the monorepo',
      description: 'React 18.3 includes critical security patches. Update all packages in the monorepo that depend on react and react-dom.',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      issuetype: { name: 'Task' },
      priority: { name: 'High' },
      assignee: { displayName: 'Dev User', name: 'dev' },
      labels: ['chore', 'dependencies'],
      created: '2025-05-09T11:00:00.000+0000',
      updated: '2025-05-11T09:15:00.000+0000',
    },
  },
  {
    id: '10004',
    key: 'ACME-104',
    fields: {
      summary: 'Add rate limiting to public API gateway',
      description: 'Implement token-bucket rate limiting at the API gateway level. Default: 100 req/min per IP, 1000 req/min per authenticated user.',
      status: { name: 'To Do', statusCategory: { key: 'new' } },
      issuetype: { name: 'Story' },
      priority: { name: 'Medium' },
      assignee: null,
      labels: ['feature', 'security'],
      created: '2025-05-08T16:00:00.000+0000',
      updated: '2025-05-10T16:45:00.000+0000',
    },
  },
  {
    id: '10005',
    key: 'ACME-105',
    fields: {
      summary: 'Memory leak in WebSocket connection pool',
      description: 'Under sustained load, memory usage grows unbounded. Profiling shows WebSocket objects not being released when clients disconnect.',
      status: { name: 'To Do', statusCategory: { key: 'new' } },
      issuetype: { name: 'Bug' },
      priority: { name: 'Critical' },
      assignee: null,
      labels: ['bug', 'performance'],
      created: '2025-05-07T10:00:00.000+0000',
      updated: '2025-05-09T11:20:00.000+0000',
    },
  },
  {
    id: '10006',
    key: 'ACME-98',
    fields: {
      summary: 'Migrate database from MySQL 5.7 to PostgreSQL 15',
      description: 'MySQL 5.7 reaches end of life. Migrate the application database to PostgreSQL 15 for better JSON support and long-term stability.',
      status: { name: 'Done', statusCategory: { key: 'done' } },
      issuetype: { name: 'Epic' },
      priority: { name: 'High' },
      assignee: { displayName: 'Dev User', name: 'dev' },
      labels: ['migration', 'infrastructure'],
      created: '2025-04-15T09:00:00.000+0000',
      updated: '2025-05-08T17:00:00.000+0000',
    },
  },
];

const MOCK_PROJECTS = [
  { id: '10000', key: 'ACME', name: 'Acme Inc Platform' },
];

function filterIssues(jql = '', maxResults = 50) {
  let issues = MOCK_ISSUES;
  const jqlLower = jql.toLowerCase();

  if (jqlLower.includes('statusCategory != done') || jqlLower.includes('statuscategory != done')) {
    issues = issues.filter(i => i.fields.status.statusCategory.key !== 'done');
  } else if (jqlLower.includes('statusCategory = done') || jqlLower.includes('statuscategory = done')) {
    issues = issues.filter(i => i.fields.status.statusCategory.key === 'done');
  }

  return issues.slice(0, maxResults);
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });
}

function startMockJira(port = 19890) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const pathname = url.pathname;

      // Handle CORS pre-flight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
        return res.end();
      }

      if (pathname === '/rest/api/3/myself') {
        return sendJson(res, MOCK_USER);
      }

      // v3: POST /rest/api/3/search/jql  (body: { jql, maxResults, startAt })
      if (pathname === '/rest/api/3/search/jql' && req.method === 'POST') {
        const body = await readBody(req);
        const jql = body.jql || '';
        const maxResults = body.maxResults || 50;
        const startAt = body.startAt || 0;
        const issues = filterIssues(jql, maxResults);
        return sendJson(res, {
          expand: 'schema,names',
          startAt,
          maxResults,
          total: issues.length,
          issues,
        });
      }

      if (pathname === '/rest/api/3/project') {
        return sendJson(res, MOCK_PROJECTS);
      }

      sendJson(res, { error: `Not found: ${req.method} ${pathname}` }, 404);
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`[mock-jira] Listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

function stopMockJira(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(resolve);
  });
}

module.exports = { startMockJira, stopMockJira, MOCK_ISSUES };
