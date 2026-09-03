'use strict';

const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Hermetic Gitea Git Forge Service
 * Provides local Git HTTP repository hosting & Gitea/GitHub-compatible REST APIs
 * for 100% offline, reproducible E2E tests without network egress or API rate limits.
 */
class GiteaForgeService {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '127.0.0.1';
    this.baseDir = options.baseDir || path.join('/tmp', `robos-gitea-${Date.now()}`);
    this.server = null;
    this.repos = new Map(); // key: owner/repo
    this.pullRequests = [];
  }

  async start() {
    fs.mkdirSync(this.baseDir, { recursive: true });

    this.server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${this.host}:${this.port}`);

      // 1. Healthz probe
      if (url.pathname === '/healthz' || url.pathname === '/api/v1/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, version: '1.22.0', forge: 'Gitea Hermetic Test Forge' }));
        return;
      }

      // 2. REST API: /api/v1/user
      if (url.pathname === '/api/v1/user') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 1,
          login: 'robos-tester',
          full_name: 'RobOS Lead Reviewer',
          email: 'lead-reviewer@acme.org',
          is_admin: true,
        }));
        return;
      }

      // 3. REST API: /api/v1/repos/:owner/:repo
      const repoMatch = url.pathname.match(/^\/api\/v1\/repos\/([^/]+)\/([^/]+)/);
      if (repoMatch) {
        const owner = repoMatch[1];
        const repo = repoMatch[2];
        const repoKey = `${owner}/${repo}`;

        // Sub-route: /pulls
        if (url.pathname.endsWith('/pulls')) {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}');
                const pr = {
                  id: this.pullRequests.length + 1,
                  number: 42 + this.pullRequests.length,
                  title: data.title || 'feat(petstore): implement vaccine certification verification',
                  head: { ref: data.head || 'feature/PET-105-vaccine-certification' },
                  base: { ref: data.base || 'main' },
                  state: 'open',
                  merged: false,
                  user: { login: 'robos-agent' },
                  created_at: new Date().toISOString(),
                };
                this.pullRequests.push(pr);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(pr));
              } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.pullRequests));
          return;
        }

        // Sub-route: /pulls/:index/merge
        const mergeMatch = url.pathname.match(/\/pulls\/(\d+)\/merge$/);
        if (mergeMatch && req.method === 'POST') {
          const prNum = parseInt(mergeMatch[1]);
          const pr = this.pullRequests.find(p => p.number === prNum) || this.pullRequests[0];
          if (pr) {
            pr.state = 'closed';
            pr.merged = true;
            pr.merged_at = new Date().toISOString();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, merged: true, message: `PR #${prNum} merged to main.` }));
          return;
        }

        // Repo details
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 101,
          name: repo,
          full_name: repoKey,
          owner: { login: owner },
          clone_url: `http://${this.host}:${this.port}/${repoKey}.git`,
          default_branch: 'main',
        }));
        return;
      }

      // 4. Git HTTP Smart Protocol (/owner/repo.git/...)
      const gitMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\.git(\/.*)?$/);
      if (gitMatch) {
        const owner = gitMatch[1];
        const repo = gitMatch[2];
        const repoPath = path.join(this.baseDir, `${owner}_${repo}.git`);

        if (!fs.existsSync(repoPath)) {
          // Auto-initialize bare repo if needed
          fs.mkdirSync(repoPath, { recursive: true });
          execSync(`git init --bare "${repoPath}"`, { stdio: 'ignore' });
        }

        // Delegate to git http-backend
        const gitHttp = spawn('git', ['http-backend'], {
          env: {
            ...process.env,
            GIT_PROJECT_ROOT: this.baseDir,
            GIT_HTTP_EXPORT_ALL: '1',
            PATH_INFO: url.pathname.replace(/^\/[^/]+\//, `/${owner}_`),
            QUERY_STRING: url.search ? url.search.substring(1) : '',
            REQUEST_METHOD: req.method,
            CONTENT_TYPE: req.headers['content-type'] || '',
            REMOTE_USER: 'robos-tester',
          },
        });

        req.pipe(gitHttp.stdin);

        let headerParsed = false;
        let buffer = Buffer.alloc(0);

        gitHttp.stdout.on('data', chunk => {
          if (!headerParsed) {
            buffer = Buffer.concat([buffer, chunk]);
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd !== -1) {
              const headerStr = buffer.slice(0, headerEnd).toString('utf8');
              const bodyChunk = buffer.slice(headerEnd + 4);
              headerParsed = true;

              const headers = {};
              let status = 200;
              for (const line of headerStr.split('\r\n')) {
                const idx = line.indexOf(':');
                if (idx !== -1) {
                  const key = line.slice(0, idx).trim();
                  const val = line.slice(idx + 1).trim();
                  if (key.toLowerCase() === 'status') {
                    status = parseInt(val.split(' ')[0]) || 200;
                  } else {
                    headers[key] = val;
                  }
                }
              }
              res.writeHead(status, headers);
              if (bodyChunk.length > 0) res.write(bodyChunk);
            }
          } else {
            res.write(chunk);
          }
        });

        gitHttp.stdout.on('end', () => { res.end(); });
        gitHttp.on('error', err => {
          res.writeHead(500);
          res.end(err.message);
        });
        return;
      }

      // 5. Gitea Web UI: /:owner/:repo/issues or /:owner/:repo
      const webMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)(\/issues)?$/);
      if (webMatch && req.method === 'GET' && !url.pathname.endsWith('.git')) {
        const owner = webMatch[1];
        const repo = webMatch[2];
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${owner}/${repo} - Issues · Gitea: Git with a cup of tea</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1b1c1d; color: #dbdbdb; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
    header { background: #161718; border-bottom: 1px solid #2d2e2f; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; }
    .nav-left { display: flex; align-items: center; gap: 16px; font-weight: 600; }
    .gitea-logo { color: #60c150; font-size: 18px; display: flex; align-items: center; gap: 6px; }
    .repo-header { background: #1f2022; border-bottom: 1px solid #2d2e2f; padding: 16px 24px 0; }
    .repo-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .repo-name { font-size: 18px; font-weight: 600; color: #4183c4; display: flex; align-items: center; gap: 8px; }
    .repo-badge { font-size: 11px; padding: 2px 6px; background: #2d2e2f; border-radius: 10px; color: #888; font-weight: normal; }
    .repo-tabs { display: flex; gap: 4px; }
    .tab { padding: 8px 14px; color: #aaa; text-decoration: none; border-bottom: 2px solid transparent; font-weight: 500; font-size: 13px; display: flex; align-items: center; gap: 6px; }
    .tab.active { color: #fff; border-bottom-color: #e36209; font-weight: 600; }
    .tab-badge { background: #2d2e2f; border-radius: 10px; padding: 1px 6px; font-size: 11px; color: #ccc; }
    .content-wrap { max-width: 1200px; margin: 24px auto; padding: 0 20px; }
    .controls-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .filter-btn-group { display: flex; gap: 8px; }
    .btn { background: #2b2d30; border: 1px solid #3e4246; color: #dbdbdb; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; }
    .btn-green { background: #28a745; color: #fff; border-color: #28a745; }
    .issues-panel { background: #1f2022; border: 1px solid #2d2e2f; border-radius: 6px; overflow: hidden; }
    .panel-header { background: #18191a; padding: 12px 16px; border-bottom: 1px solid #2d2e2f; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    .issue-item { padding: 12px 16px; border-bottom: 1px solid #282a2d; display: flex; align-items: flex-start; gap: 12px; transition: background .1s; }
    .issue-item:last-child { border-bottom: none; }
    .issue-item:hover { background: #25272a; }
    .issue-icon { color: #28a745; font-size: 16px; padding-top: 1px; }
    .issue-details { flex: 1; }
    .issue-title { font-size: 15px; font-weight: 600; color: #e1e4e8; text-decoration: none; margin-right: 6px; }
    .issue-title:hover { color: #58a6ff; }
    .label-tag { font-size: 11px; padding: 2px 6px; border-radius: 3px; margin-left: 4px; font-weight: 600; }
    .label-epic { background: #a78bfa33; color: #c4b5fd; border: 1px solid #a78bfa66; }
    .label-backend { background: #3b82f633; color: #93c5fd; border: 1px solid #3b82f666; }
    .label-frontend { background: #ec489933; color: #f472b6; border: 1px solid #ec489966; }
    .label-streaming { background: #f59e0b33; color: #fcd34d; border: 1px solid #f59e0b66; }
    .label-security { background: #10b98133; color: #6ee7b7; border: 1px solid #10b98166; }
    .issue-sub { font-size: 12px; color: #8b949e; margin-top: 3px; }
    footer { text-align: center; color: #666; font-size: 12px; margin: 40px 0 20px; }
  </style>
</head>
<body>
  <header>
    <div class="nav-left">
      <span class="gitea-logo">🍵 Gitea</span>
      <span>Explore</span>
      <span>Help</span>
    </div>
    <div>Signed in as <strong>robos-tester</strong></div>
  </header>

  <div class="repo-header">
    <div class="repo-title-row">
      <div class="repo-name">
        <span>📁 ${owner} / <strong>${repo}</strong></span>
        <span class="repo-badge">Public</span>
      </div>
      <div>
        <button class="btn">⭐ Star 1</button>
        <button class="btn">🔱 Fork 0</button>
      </div>
    </div>
    <div class="repo-tabs">
      <a href="#" class="tab">Code</a>
      <a href="#" class="tab active">Issues <span class="tab-badge">6</span></a>
      <a href="#" class="tab">Pull Requests <span class="tab-badge">0</span></a>
      <a href="#" class="tab">Releases</a>
      <a href="#" class="tab">Settings</a>
    </div>
  </div>

  <div class="content-wrap">
    <div class="controls-row">
      <div class="filter-btn-group">
        <button class="btn">Filters ▾</button>
        <button class="btn">Milestones</button>
        <button class="btn">Labels</button>
      </div>
      <button class="btn btn-green">+ New Issue</button>
    </div>

    <div class="issues-panel">
      <div class="panel-header">
        <span>🟢 6 Open Issues</span>
        <span style="color:#666; margin-left:12px;">✓ 0 Closed</span>
      </div>

      <div class="issue-item">
        <span class="issue-icon">🟢</span>
        <div class="issue-details">
          <a href="#" class="issue-title">#1 Epic: Acme Petshop Distributed Platform</a>
          <span class="label-tag label-epic">epic</span>
          <span class="label-tag label-epic">petshop</span>
          <div class="issue-sub">#1 opened 1 minute ago by <strong>robos-agent</strong> • Architecture comprising Java 21 Spring Boot 3 REST API, React 18 frontend, and TypeSpec common library.</div>
        </div>
      </div>

      <div class="issue-item">
        <span class="issue-icon">🟢</span>
        <div class="issue-details">
          <a href="#" class="issue-title">#2 PET-101: PostgreSQL Database Schema & Migrations</a>
          <span class="label-tag label-backend">database</span>
          <span class="label-tag label-backend">backend</span>
          <div class="issue-sub">#2 opened 1 minute ago by <strong>robos-agent</strong> • Define Flyway migrations for petstore catalog, orders, and inventory tables.</div>
        </div>
      </div>

      <div class="issue-item">
        <span class="issue-icon">🟢</span>
        <div class="issue-details">
          <a href="#" class="issue-title">#3 PET-102: Java Spring Boot 3 REST API Service</a>
          <span class="label-tag label-backend">java</span>
          <span class="label-tag label-backend">spring-boot</span>
          <span class="label-tag label-backend">api</span>
          <div class="issue-sub">#3 opened 1 minute ago by <strong>robos-agent</strong> • Implement OpenAPI 3.1 REST microservice handling /pets and /orders endpoints.</div>
        </div>
      </div>

      <div class="issue-item">
        <span class="issue-icon">🟢</span>
        <div class="issue-details">
          <a href="#" class="issue-title">#4 PET-103: React 18 Web Adoption Portal & Cart</a>
          <span class="label-tag label-frontend">frontend</span>
          <span class="label-tag label-frontend">react</span>
          <div class="issue-sub">#4 opened 1 minute ago by <strong>robos-agent</strong> • Client web portal consuming OpenAPI 3.1 endpoints with real-time field validation.</div>
        </div>
      </div>

      <div class="issue-item">
        <span class="issue-icon">🟢</span>
        <div class="issue-details">
          <a href="#" class="issue-title">#5 PET-104: Kafka Topic & Event Ingestion Pipeline</a>
          <span class="label-tag label-streaming">streaming</span>
          <span class="label-tag label-streaming">kafka</span>
          <div class="issue-sub">#5 opened 1 minute ago by <strong>robos-agent</strong> • AsyncAPI topic consumer capturing pet adoption and inventory update events.</div>
        </div>
      </div>

      <div class="issue-item">
        <span class="issue-icon">🟢</span>
        <div class="issue-details">
          <a href="#" class="issue-title">#6 PET-105: Rabies Vaccine Certification Gateway</a>
          <span class="label-tag label-security">security</span>
          <span class="label-tag label-security">compliance</span>
          <div class="issue-sub">#6 opened 1 minute ago by <strong>robos-agent</strong> • Delta endpoint verifying rabies vaccination certification and veterinary records.</div>
        </div>
      </div>
    </div>
  </div>

  <footer>
    Gitea Version: 1.22.0 • RobOS Hermetic Git Forge • Connected to Knowledge Graph <code>urn:robos:project:acme-petshop-platform</code>
  </footer>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        resolve({ url: `http://${this.host}:${this.port}`, baseDir: this.baseDir });
      });
    });
  }

  seedRepo({ owner, repo, defaultBranch = 'main', files = {} }) {
    const repoBarePath = path.join(this.baseDir, `${owner}_${repo}.git`);
    fs.mkdirSync(repoBarePath, { recursive: true });
    execSync(`git init --bare "${repoBarePath}"`, { stdio: 'ignore' });

    // Create temporary worktree to commit seed files
    const tmpWork = path.join(this.baseDir, `tmp_${owner}_${repo}_${Date.now()}`);
    fs.mkdirSync(tmpWork, { recursive: true });
    execSync(`git clone "${repoBarePath}" "${tmpWork}"`, { stdio: 'ignore' });
    execSync(`git -C "${tmpWork}" checkout -B "${defaultBranch}"`, { stdio: 'ignore' });

    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = path.join(tmpWork, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
    }

    execSync(`git -C "${tmpWork}" config user.name "RobOS Tester"`, { stdio: 'ignore' });
    execSync(`git -C "${tmpWork}" config user.email "test@acme.org"`, { stdio: 'ignore' });
    execSync(`git -C "${tmpWork}" add -A`, { stdio: 'ignore' });
    execSync(`git -C "${tmpWork}" commit -m "feat(initial): seed ${repo} scaffold"`, { stdio: 'ignore' });
    execSync(`git -C "${tmpWork}" push origin "${defaultBranch}"`, { stdio: 'ignore' });

    // Clean up temporary work dir
    fs.rmSync(tmpWork, { recursive: true, force: true });
    this.repos.set(`${owner}/${repo}`, { owner, repo, defaultBranch });
    return `http://${this.host}:${this.port}/${owner}/${repo}.git`;
  }

  async stop() {
    if (this.server) {
      await new Promise(r => this.server.close(r));
    }
    try {
      fs.rmSync(this.baseDir, { recursive: true, force: true });
    } catch {}
  }
}

module.exports = { GiteaForgeService };
