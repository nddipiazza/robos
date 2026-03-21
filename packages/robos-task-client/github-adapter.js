/**
 * GitHub Adapter — wraps gh CLI and GitHub API for issue management.
 *
 * Prefers gh CLI (already authenticated) over raw API calls.
 */
'use strict';

const { execSync, exec } = require('child_process');

class GitHubAdapter {
  constructor(config) {
    this.type = 'github';
    this.org = config.gh_org || (config.repos && config.repos[0]?.org) || '';
    this.repo = config.gh_repo || (config.repos && config.repos[0]?.repo) || '';
    this.useGhCli = config.use_gh_cli !== false;
    this.token = config.gh_token || '';
    this.apiUrl = config.gh_api_url || 'https://api.github.com';
    this.labels = config.gh_labels || [];

    this._repoSlug = `${this.org}/${this.repo}`;
  }

  _gh(args, opts = {}) {
    const timeout = opts.timeout || 15000;
    try {
      return execSync(`gh ${args}`, { encoding: 'utf8', timeout }).trim();
    } catch (e) {
      throw new Error((e.stderr || e.message || '').toString().trim());
    }
  }

  _ghJson(args, opts = {}) {
    const raw = this._gh(args, opts);
    try { return JSON.parse(raw); }
    catch { throw new Error(`Invalid JSON from gh: ${raw.substring(0, 200)}`); }
  }

  // ── Connection test ──────────────────────────────────────────────────────

  async testConnection() {
    try {
      const user = this._ghJson('api user');
      return { ok: true, login: user.login };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Search ───────────────────────────────────────────────────────────────

  async searchIssues({ assignee, state = 'open', labels, maxResults = 100 } = {}) {
    let args = `issue list --repo ${this._repoSlug} --limit ${maxResults} --state ${state}`;
    if (assignee) args += ` --assignee ${assignee}`;
    if (labels && labels.length) args += ` --label "${labels.join(',')}"`;
    args += ' --json number,title,state,labels,assignees,createdAt,updatedAt,body,milestone';

    const issues = this._ghJson(args);
    return {
      issues: issues.map(i => this._mapIssue(i)),
      total: issues.length,
    };
  }

  // ── Get single issue ─────────────────────────────────────────────────────

  async getIssue(number) {
    const issue = this._ghJson(
      `issue view ${number} --repo ${this._repoSlug} --json number,title,state,body,labels,assignees,comments,createdAt,updatedAt,milestone`
    );
    return this._mapIssue(issue);
  }

  // ── Create issue ─────────────────────────────────────────────────────────

  async createIssue({ summary, description, labels, assignee }) {
    let args = `issue create --repo ${this._repoSlug} --title ${JSON.stringify(summary)}`;
    if (description) args += ` --body ${JSON.stringify(description)}`;
    if (labels && labels.length) args += ` --label "${labels.join(',')}"`;
    if (assignee) args += ` --assignee ${assignee}`;

    const out = this._gh(args);
    const urlMatch = out.match(/https:\/\/github\.com\/[^\s]+\/issues\/(\d+)/);
    return { key: urlMatch ? `#${urlMatch[1]}` : out, url: urlMatch ? urlMatch[0] : null };
  }

  // ── Update issue ─────────────────────────────────────────────────────────

  async updateIssue(number, { summary, description, labels, assignee }) {
    let args = `issue edit ${number} --repo ${this._repoSlug}`;
    if (summary) args += ` --title ${JSON.stringify(summary)}`;
    if (description) args += ` --body ${JSON.stringify(description)}`;
    if (labels) args += ` --add-label "${labels.join(',')}"`;
    if (assignee) args += ` --add-assignee ${assignee}`;

    this._gh(args);
    return { ok: true };
  }

  // ── Status transitions (via labels for GitHub) ───────────────────────────

  async transitionIssueTo(number, statusLabel, removeLabel) {
    let args = `issue edit ${number} --repo ${this._repoSlug}`;
    if (removeLabel) args += ` --remove-label "state:${removeLabel}"`;
    args += ` --add-label "state:${statusLabel}"`;

    this._gh(args);
    return { ok: true };
  }

  async closeIssue(number) {
    this._gh(`issue close ${number} --repo ${this._repoSlug}`);
    return { ok: true };
  }

  async reopenIssue(number) {
    this._gh(`issue reopen ${number} --repo ${this._repoSlug}`);
    return { ok: true };
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async addComment(number, body) {
    this._gh(`issue comment ${number} --repo ${this._repoSlug} --body ${JSON.stringify(body)}`);
    return { ok: true };
  }

  async getComments(number) {
    const issue = this._ghJson(
      `issue view ${number} --repo ${this._repoSlug} --json comments`
    );
    return (issue.comments || []).map(c => ({
      id: c.id,
      author: c.author?.login || 'unknown',
      body: c.body,
      created: c.createdAt,
      updated: c.updatedAt,
    }));
  }

  // ── Worklog (GitHub doesn't have native worklog — use comments) ──────────

  async logWork(number, timeSpentSeconds, comment) {
    const hours = Math.round(timeSpentSeconds / 360) / 10;
    const body = `⏱ Logged ${hours}h${comment ? ` — ${comment}` : ''}`;
    return this.addComment(number, body);
  }

  // ── Map GitHub issue to RobOS work item ──────────────────────────────────

  _mapIssue(raw) {
    const labels = (raw.labels || []).map(l => typeof l === 'string' ? l : l.name);
    const stateLabel = labels.find(l => l.startsWith('state:'));
    return {
      key: `#${raw.number}`,
      id: String(raw.number),
      summary: raw.title || '',
      description: raw.body || '',
      status: stateLabel ? stateLabel.replace('state:', '') : (raw.state || 'open'),
      statusCategory: raw.state === 'closed' ? 'done' : 'indeterminate',
      issueType: this._detectType(labels),
      priority: this._detectPriority(labels),
      assignee: raw.assignees?.[0]?.login || null,
      labels,
      created: raw.createdAt,
      updated: raw.updatedAt,
      parent: raw.milestone ? { key: raw.milestone.title, summary: raw.milestone.title } : null,
      url: `https://github.com/${this._repoSlug}/issues/${raw.number}`,
      comments: raw.comments,
    };
  }

  _detectType(labels) {
    if (labels.some(l => l === 'bug')) return 'Bug';
    if (labels.some(l => l.includes('feature'))) return 'Feature';
    if (labels.some(l => l === 'chore' || l === 'task')) return 'Task';
    return 'Issue';
  }

  _detectPriority(labels) {
    if (labels.some(l => l.includes('P0') || l.includes('critical'))) return 'Critical';
    if (labels.some(l => l.includes('P1') || l.includes('high'))) return 'High';
    if (labels.some(l => l.includes('P2') || l.includes('medium'))) return 'Medium';
    if (labels.some(l => l.includes('P3') || l.includes('low'))) return 'Low';
    return 'Medium';
  }
}

module.exports = { GitHubAdapter };
