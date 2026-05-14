/**
 * Jira Adapter — wraps Jira REST API v3 for both Cloud and Data Center.
 *
 * Auth: Bearer token (Data Center/Server) or Basic auth (Cloud: email + API token).
 * Descriptions use Atlassian Document Format (ADF) in v3; _adfToText() extracts
 * plain text for display.
 */
'use strict';

const https = require('https');
const http = require('http');

class JiraAdapter {
  constructor(config) {
    this.baseUrl = (config.url || '').replace(/\/$/, '');
    this.username = config.username || '';
    this.token = config.token || '';
    this.projects = config.projects || [];
    this.type = 'jira';

    if (!this.baseUrl) throw new Error('Jira URL is required');

    const parsed = new URL(this.baseUrl);
    this._isHttps = parsed.protocol === 'https:';
    this._hostname = parsed.hostname;
    this._port = parsed.port || (this._isHttps ? 443 : 80);
    this._basePath = parsed.pathname.replace(/\/$/, '');
  }

  // ── HTTP helper ──────────────────────────────────────────────────────────

  _authHeaders() {
    if (this.token && !this.username) {
      return { 'Authorization': `Bearer ${this.token}` };
    } else if (this.username && this.token) {
      return { 'Authorization': 'Basic ' + Buffer.from(`${this.username}:${this.token}`).toString('base64') };
    }
    return {};
  }

  _request(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
      const fullPath = `${this._basePath}/rest/api/3${apiPath}`;
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...this._authHeaders(),
      };

      const payload = body ? JSON.stringify(body) : null;
      if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

      const opts = {
        hostname: this._hostname,
        port: this._port,
        path: fullPath,
        method,
        headers,
        timeout: 15000,
      };

      const transport = this._isHttps ? https : http;
      const req = transport.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(data ? JSON.parse(data) : {}); }
            catch { resolve(data); }
          } else {
            let msg = `Jira API ${res.statusCode}: ${apiPath}`;
            try {
              const err = JSON.parse(data);
              msg = err.errorMessages?.[0] || err.message || msg;
            } catch {}
            reject(new Error(msg));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Jira request timeout')); });
      if (payload) req.write(payload);
      req.end();
    });
  }

  // ── Connection test ──────────────────────────────────────────────────────

  async testConnection() {
    try {
      const user = await this._request('GET', '/myself');
      return { ok: true, displayName: user.displayName || user.name || user.key };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Search — POST /rest/api/3/search/jql ─────────────────────────────────

  async searchIssues({ jql, maxResults = 50, startAt = 0, fields } = {}) {
    const defaultFields = ['summary', 'description', 'status', 'assignee', 'priority', 'issuetype', 'created', 'updated', 'labels', 'parent'];
    const body = {
      jql: jql || (this.projects.length ? `project IN (${this.projects.join(',')})` : ''),
      maxResults,
      startAt,
      fields: fields ? (Array.isArray(fields) ? fields : fields.split(',').map(f => f.trim())) : defaultFields,
    };
    const result = await this._request('POST', '/search/jql', body);
    return {
      issues: (result.issues || []).map(i => this._mapIssue(i)),
      total: result.total || 0,
      startAt: result.startAt || 0,
      maxResults: result.maxResults || maxResults,
    };
  }

  // ── Get single issue ─────────────────────────────────────────────────────

  async getIssue(issueKey) {
    const issue = await this._request('GET', `/issue/${issueKey}`);
    return this._mapIssue(issue);
  }

  // ── Create issue ─────────────────────────────────────────────────────────

  async createIssue({ projectKey, summary, description, issueType = 'Task', assignee, labels, priority }) {
    const fields = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    };
    // v3 requires ADF for description
    if (description) fields.description = this._textToAdf(description);
    if (assignee) fields.assignee = { id: assignee };
    if (labels) fields.labels = labels;
    if (priority) fields.priority = { name: priority };

    const result = await this._request('POST', '/issue', { fields });
    return { key: result.key, id: result.id, self: result.self };
  }

  // ── Update issue ─────────────────────────────────────────────────────────

  async updateIssue(issueKey, { summary, description, assignee, labels, priority }) {
    const fields = {};
    if (summary !== undefined) fields.summary = summary;
    if (description !== undefined) fields.description = this._textToAdf(description);
    if (assignee !== undefined) fields.assignee = assignee ? { id: assignee } : null;
    if (labels !== undefined) fields.labels = labels;
    if (priority !== undefined) fields.priority = { name: priority };

    await this._request('PUT', `/issue/${issueKey}`, { fields });
    return { ok: true };
  }

  // ── Transitions ──────────────────────────────────────────────────────────

  async getTransitions(issueKey) {
    const result = await this._request('GET', `/issue/${issueKey}/transitions`);
    return (result.transitions || []).map(t => ({
      id: t.id,
      name: t.name,
      to: { id: t.to.id, name: t.to.name, statusCategory: t.to.statusCategory?.key },
    }));
  }

  async transitionIssue(issueKey, transitionId) {
    await this._request('POST', `/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
    return { ok: true };
  }

  async transitionIssueTo(issueKey, targetStatusName) {
    const transitions = await this.getTransitions(issueKey);
    const match = transitions.find(t =>
      t.name.toLowerCase() === targetStatusName.toLowerCase() ||
      t.to.name.toLowerCase() === targetStatusName.toLowerCase()
    );
    if (!match) {
      throw new Error(`No transition to "${targetStatusName}" available. Available: ${transitions.map(t => t.to.name).join(', ')}`);
    }
    return this.transitionIssue(issueKey, match.id);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async addComment(issueKey, body) {
    // v3 requires ADF for comment body
    await this._request('POST', `/issue/${issueKey}/comment`, {
      body: this._textToAdf(body),
    });
    return { ok: true };
  }

  async getComments(issueKey) {
    const result = await this._request('GET', `/issue/${issueKey}/comment`);
    return (result.comments || []).map(c => ({
      id: c.id,
      author: c.author?.displayName || c.author?.name || 'unknown',
      body: this._adfToText(c.body),
      created: c.created,
      updated: c.updated,
    }));
  }

  // ── Worklog ──────────────────────────────────────────────────────────────

  async logWork(issueKey, timeSpentSeconds, comment) {
    const worklog = { timeSpentSeconds };
    if (comment) worklog.comment = this._textToAdf(comment);
    await this._request('POST', `/issue/${issueKey}/worklog`, worklog);
    return { ok: true };
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects() {
    const projects = await this._request('GET', '/project');
    return projects.map(p => ({ key: p.key, name: p.name, id: p.id }));
  }

  // ── Statuses for a project ───────────────────────────────────────────────

  async getStatuses(projectKey) {
    const result = await this._request('GET', `/project/${projectKey}/statuses`);
    const statuses = [];
    for (const issueType of result) {
      for (const status of (issueType.statuses || [])) {
        if (!statuses.find(s => s.id === status.id)) {
          statuses.push({
            id: status.id,
            name: status.name,
            category: status.statusCategory?.key || 'undefined',
          });
        }
      }
    }
    return statuses;
  }

  // ── ADF helpers ──────────────────────────────────────────────────────────

  /** Convert Atlassian Document Format (v3) to plain text. */
  _adfToText(adf) {
    if (!adf || typeof adf !== 'object') return String(adf || '');
    const parts = [];
    const walk = (node) => {
      if (!node) return;
      if (node.type === 'text') { parts.push(node.text || ''); return; }
      if (node.type === 'hardBreak' || node.type === 'rule') { parts.push('\n'); return; }
      const isBlock = ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'panel'].includes(node.type);
      if (node.content) node.content.forEach(walk);
      if (isBlock) parts.push('\n');
    };
    walk(adf);
    return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Wrap plain text as a minimal ADF document (v3). */
  _textToAdf(text) {
    if (text && typeof text === 'object' && text.type === 'doc') return text;
    const paragraphs = String(text || '').split(/\n\n+/).map(para => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para.replace(/\n/g, ' ') }],
    }));
    return { type: 'doc', version: 1, content: paragraphs.length ? paragraphs : [{ type: 'paragraph', content: [] }] };
  }

  // ── Map Jira issue to RobOS work item ────────────────────────────────────

  _mapIssue(raw) {
    const f = raw.fields || {};
    return {
      key: raw.key,
      id: raw.id,
      summary: f.summary || '',
      description: this._adfToText(f.description),
      status: f.status?.name || 'Unknown',
      statusCategory: f.status?.statusCategory?.key || 'undefined',
      issueType: f.issuetype?.name || 'Task',
      priority: f.priority?.name || 'Medium',
      assignee: f.assignee?.displayName || f.assignee?.name || null,
      labels: f.labels || [],
      created: f.created,
      updated: f.updated,
      parent: f.parent ? { key: f.parent.key, summary: f.parent.fields?.summary } : null,
      url: `${this.baseUrl}/browse/${raw.key}`,
    };
  }
}

module.exports = { JiraAdapter };
