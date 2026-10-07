/**
 * GitHub Adapter — wraps gh CLI and GitHub API for issue management.
 *
 * Prefers gh CLI (already authenticated) over raw API calls.
 */
'use strict';

const { execSync, exec } = require('child_process');

// RobOS owns GitHub identity: the Git client account selected in Preferences → GitHub accounts.
// Resolve that account's saved credential per request; ambient tokens and gh's active login do not choose identity.
let githubAccounts = null;
try { githubAccounts = require('../robos-lib/github-accounts'); } catch {}

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
    try {
      const host = config.gh_api_url && !/api\.github\.com/.test(config.gh_api_url) ? new URL(config.gh_api_url).hostname : '';
      this._hostFlag = host ? ` --hostname ${host}` : '';
    } catch { this._hostFlag = ''; }
  }

  // Shared asynchronous command path for PR consumers. Never use a shell here.
  async runGitHubCommand(args, execute = require('node:util').promisify(require('node:child_process').execFile), credentialEnv = host => githubAccounts.gitEnv(host)) {
    if (!this.useGhCli) throw new Error('This task server uses a pass token. Enable “Use Git client account” in Task Servers; this PR operation does not support pass-token authentication yet.');
    if (!githubAccounts) throw new Error('RobOS GitHub account library is unavailable.');
    const host = new URL(this.apiUrl).hostname === 'api.github.com' ? 'github.com' : new URL(this.apiUrl).hostname;
    const env = await credentialEnv(host);
    try {
      const result = await execute('gh', args, {encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,env});
      return result.stdout;
    } catch (error) {
      // gh pr checks returns 1 for failed checks and 8 for pending checks.
      if (args[0] === 'pr' && args[1] === 'checks' && [1,8].includes(error.code) && error.stdout) return error.stdout;
      throw error;
    }
  }

  _gh(args, opts = {}) {
    const timeout = opts.timeout || 15000;
    if (!this.useGhCli) throw new Error('Enable “Use Git client account” in Task Servers; pass-token authentication is not supported by this adapter yet.');
    if (!githubAccounts) throw new Error('RobOS GitHub account library is unavailable.');
    const host = new URL(this.apiUrl).hostname === 'api.github.com' ? 'github.com' : new URL(this.apiUrl).hostname;
    const env = githubAccounts.gitEnvSync(host, {...process.env,...opts.env});
    try {
      return execSync(`gh ${args}`, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, env }).trim();
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
    if (assignee) args += ` --assignee ${assignee === 'me' ? '@me' : assignee}`;
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
      `issue view ${number} --repo ${this._repoSlug} --json number,title,state,body,labels,assignees,comments,createdAt,updatedAt,milestone,url`
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
    if (assignee) args += ` --add-assignee ${assignee === 'me' ? '@me' : assignee}`;

    this._gh(args);
    return { ok: true };
  }


  // ── Hierarchy (GitHub sub-issues) ────────────────────────────────────────

  /** Sub-issues of one issue (GitHub sub-issues REST endpoint). */
  async getSubIssues(number) {
    const raw = this._ghJson(`api "repos/${this._repoSlug}/issues/${number}/sub_issues?per_page=100"${this._hostFlag}`);
    return (Array.isArray(raw) ? raw : []).map(r => this._mapRest(r));
  }

  /**
   * All open issues (paged) plus recently closed ones, each carrying its parent issue key when it is a
   * sub-issue (`parent`) and its sub-issue count (`subIssues`). Pull requests are excluded.
   */
  async listHierarchy({ maxOpen = 500, recentClosed = 50 } = {}) {
    const page = (state, per, n) => {
      const raw = this._ghJson(`api "repos/${this._repoSlug}/issues?state=${state}&per_page=${per}&page=${n}&sort=updated&direction=desc"${this._hostFlag}`, { timeout: 30000 });
      return Array.isArray(raw) ? raw.filter(r => !r.pull_request) : [];
    };
    const rows = [];
    for (let n = 1; rows.length < maxOpen; n++) {
      const got = page('open', 100, n);
      rows.push(...got);
      if (got.length < 100) break;
    }
    if (recentClosed > 0) rows.push(...page('closed', Math.min(recentClosed, 100), 1));
    const items = rows.map(r => this._mapRest(r));
    const byKey = new Map(items.map(i => [i.key, i]));
    // Fill gaps when parent_issue_url is missing: ask each parent for its sub-issues.
    for (const p of items) {
      if (!p.subIssues || items.some(c => c.parent && c.parent.key === p.key)) continue;
      try {
        for (const c of await this.getSubIssues(p.id)) {
          const it = byKey.get(c.key);
          if (it) it.parent = { key: p.key, summary: p.summary };
        }
      } catch {}
    }
    return items;
  }

  /**
   * Recent pull requests (open + closed + merged) with CI / review state and the issue numbers each one links to
   * (closing keywords or #N in the title/body, plus a number in the branch name). One `gh pr list` call.
   */
  async listPullRequests({ limit = 100 } = {}) {
    const host = /--hostname (\S+)/.exec(this._hostFlag || '');
    const raw = this._ghJson(`pr list --repo ${this._repoSlug} --state all --limit ${limit} --json number,title,state,isDraft,headRefName,url,author,body,updatedAt,mergedAt,reviewDecision,statusCheckRollup`,
      { timeout: 45000, env: host ? { GH_HOST: host[1] } : undefined });
    const ci = roll => {
      const rows = Array.isArray(roll) ? roll : [];
      if (!rows.length) return '';
      const bad = /^(FAILURE|ERROR|TIMED_OUT|CANCELLED|ACTION_REQUIRED|STARTUP_FAILURE)$/, ok = /^(SUCCESS|NEUTRAL|SKIPPED)$/;
      let pending = false;
      for (const c of rows) {
        const v = String(c.conclusion || c.state || '').toUpperCase();
        if (bad.test(v)) return 'fail';
        if (!ok.test(v)) pending = true;
      }
      return pending ? 'pending' : 'pass';
    };
    const slug = this._repoSlug.toLowerCase();
    return (Array.isArray(raw) ? raw : []).map(p => {
      const text = `${p.title || ''}\n${p.body || ''}`, nums = new Set();
      for (const m of text.matchAll(/(?:^|[^\w/])((?:[\w.-]+\/[\w.-]+)?)#(\d{1,7})\b/g)) if (!m[1] || m[1].toLowerCase() === slug) nums.add(Number(m[2]));
      const b = /(?:^|[\/_-])(?:issue-?)?(\d{1,7})(?:[-_\/]|$)/.exec(p.headRefName || '');
      if (b) nums.add(Number(b[1]));
      const state = String(p.state || '').toUpperCase();
      return {
        number: p.number, title: p.title || '', url: p.url, branch: p.headRefName || '', author: (p.author && p.author.login) || '',
        state: state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : 'open', draft: !!p.isDraft, merged: state === 'MERGED' || !!p.mergedAt,
        ci: ci(p.statusCheckRollup), review: p.reviewDecision === 'APPROVED' ? 'approved' : p.reviewDecision === 'CHANGES_REQUESTED' ? 'changes' : 'pending',
        updated: p.updatedAt || null, issues: [...nums],
      };
    });
  }

  async unassignIssue(number, assignee = '@me') {
    this._gh(`issue edit ${number} --repo ${this._repoSlug} --remove-assignee ${assignee === 'me' ? '@me' : assignee}`);
    return { ok: true };
  }

  _mapRest(raw) {
    const labels = (raw.labels || []).map(l => typeof l === 'string' ? l : l.name);
    const stateLabel = labels.find(l => l.startsWith('state:'));
    const pm = String(raw.parent_issue_url || '').match(/\/issues\/(\d+)$/);
    return {
      key: `#${raw.number}`,
      id: String(raw.number),
      summary: raw.title || '',
      description: raw.body || '',
      status: stateLabel ? stateLabel.replace('state:', '') : (raw.state || 'open'),
      statusCategory: raw.state === 'closed' ? 'done' : 'indeterminate',
      issueType: this._detectType(labels),
      priority: this._detectPriority(labels),
      assignee: (raw.assignees && raw.assignees[0] && raw.assignees[0].login) || null,
      labels,
      created: raw.created_at,
      updated: raw.updated_at,
      parent: pm ? { key: `#${pm[1]}` } : null,
      milestone: raw.milestone ? raw.milestone.title : null,
      subIssues: raw.sub_issues_summary ? raw.sub_issues_summary.total : 0,
      url: raw.html_url || `https://github.com/${this._repoSlug}/issues/${raw.number}`,
    };
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
      url: raw.url || raw.html_url || `${this.apiUrl.includes('api.github.com') ? 'https://github.com' : new URL(this.apiUrl).origin}/${this._repoSlug}/issues/${raw.number}`,
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
