'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const LIB_PATH = path.resolve(__dirname, '../../../robos-task-client');

// ── JiraAdapter unit tests ───────────────────────────────────────────────────

describe('JiraAdapter unit tests', () => {
  const { JiraAdapter } = require(path.join(LIB_PATH, 'jira-adapter'));

  it('constructor: parses URL correctly', () => {
    const adapter = new JiraAdapter({
      url: 'https://acme.atlassian.net',
      username: 'user@acme.com',
      token: 'fake-token',
      projects: ['BBF'],
    });
    assert.strictEqual(adapter.baseUrl, 'https://acme.atlassian.net');
    assert.strictEqual(adapter._hostname, 'acme.atlassian.net');
    assert.strictEqual(adapter._isHttps, true);
    assert.strictEqual(adapter.type, 'jira');
  });

  it('constructor: handles URL with trailing slash', () => {
    const adapter = new JiraAdapter({ url: 'https://jira.myco.com/' });
    assert.strictEqual(adapter.baseUrl, 'https://jira.myco.com');
  });

  it('constructor: handles URL with context path', () => {
    const adapter = new JiraAdapter({ url: 'https://jira.myco.com/jira' });
    assert.strictEqual(adapter._basePath, '/jira');
  });

  it('constructor: throws on missing URL', () => {
    assert.throws(() => new JiraAdapter({}), /URL is required/);
  });

  it('_mapIssue: maps Jira fields to RobOS work item', () => {
    const adapter = new JiraAdapter({ url: 'https://acme.atlassian.net' });
    const mapped = adapter._mapIssue({
      key: 'BBF-42',
      id: '10042',
      fields: {
        summary: 'Fix platform crash',
        description: 'Platform crashes when field is empty',
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        issuetype: { name: 'Bug' },
        priority: { name: 'High' },
        assignee: { displayName: 'Alex Dev', name: 'adev' },
        labels: ['backend', 'critical'],
        created: '2026-03-20T10:00:00Z',
        updated: '2026-03-21T14:30:00Z',
        parent: { key: 'BBF-10', fields: { summary: 'Worker Config Epic' } },
      },
    });

    assert.strictEqual(mapped.key, 'BBF-42');
    assert.strictEqual(mapped.summary, 'Fix platform crash');
    assert.strictEqual(mapped.status, 'In Progress');
    assert.strictEqual(mapped.statusCategory, 'indeterminate');
    assert.strictEqual(mapped.issueType, 'Bug');
    assert.strictEqual(mapped.priority, 'High');
    assert.strictEqual(mapped.assignee, 'Alex Dev');
    assert.deepStrictEqual(mapped.labels, ['backend', 'critical']);
    assert.strictEqual(mapped.parent.key, 'BBF-10');
    assert.strictEqual(mapped.url, 'https://acme.atlassian.net/browse/BBF-42');
  });

  it('_mapIssue: handles missing fields gracefully', () => {
    const adapter = new JiraAdapter({ url: 'https://acme.atlassian.net' });
    const mapped = adapter._mapIssue({ key: 'BBF-1', id: '1', fields: {} });

    assert.strictEqual(mapped.key, 'BBF-1');
    assert.strictEqual(mapped.summary, '');
    assert.strictEqual(mapped.status, 'Unknown');
    assert.strictEqual(mapped.assignee, null);
    assert.strictEqual(mapped.parent, null);
  });
});

// ── GitHubAdapter unit tests ─────────────────────────────────────────────────

describe('GitHubAdapter unit tests', () => {
  const { GitHubAdapter } = require(path.join(LIB_PATH, 'github-adapter'));

  it('constructor: parses config correctly', () => {
    const adapter = new GitHubAdapter({
      gh_org: 'acme-corp',
      gh_repo: 'buildbarn-forms',
      use_gh_cli: true,
    });
    assert.strictEqual(adapter.org, 'acme-corp');
    assert.strictEqual(adapter.repo, 'buildbarn-forms');
    assert.strictEqual(adapter._repoSlug, 'acme-corp/buildbarn-forms');
    assert.strictEqual(adapter.type, 'github');
  });

  it('constructor: reads org/repo from repos array fallback', () => {
    const adapter = new GitHubAdapter({
      repos: [{ org: 'myorg', repo: 'myrepo' }],
    });
    assert.strictEqual(adapter._repoSlug, 'myorg/myrepo');
  });

  it('_mapIssue: maps GitHub issue to RobOS work item', () => {
    const adapter = new GitHubAdapter({ gh_org: 'acme-corp', gh_repo: 'buildbarn-forms' });
    const mapped = adapter._mapIssue({
      number: 42,
      title: 'Worker config form crashes',
      body: 'Steps to reproduce...',
      state: 'open',
      labels: [{ name: 'bug' }, { name: 'state:in-progress' }, { name: 'P1' }],
      assignees: [{ login: 'alexdev' }],
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-21T14:30:00Z',
      milestone: { title: 'v1.0' },
    });

    assert.strictEqual(mapped.key, '#42');
    assert.strictEqual(mapped.id, '42');
    assert.strictEqual(mapped.summary, 'Worker config form crashes');
    assert.strictEqual(mapped.status, 'in-progress');
    assert.strictEqual(mapped.issueType, 'Bug');
    assert.strictEqual(mapped.priority, 'High');
    assert.strictEqual(mapped.assignee, 'alexdev');
    assert.strictEqual(mapped.parent.key, 'v1.0');
    assert.strictEqual(mapped.url, 'https://github.com/acme-corp/buildbarn-forms/issues/42');
  });

  it('_mapIssue: handles missing labels/assignees', () => {
    const adapter = new GitHubAdapter({ gh_org: 'a', gh_repo: 'b' });
    const mapped = adapter._mapIssue({ number: 1, title: 'test', state: 'open', labels: [] });

    assert.strictEqual(mapped.status, 'open');
    assert.strictEqual(mapped.issueType, 'Issue');
    assert.strictEqual(mapped.assignee, null);
    assert.strictEqual(mapped.parent, null);
  });

  it('_detectType: detects issue types from labels', () => {
    const adapter = new GitHubAdapter({ gh_org: 'a', gh_repo: 'b' });
    assert.strictEqual(adapter._detectType(['bug']), 'Bug');
    assert.strictEqual(adapter._detectType(['feature-request']), 'Feature');
    assert.strictEqual(adapter._detectType(['chore']), 'Task');
    assert.strictEqual(adapter._detectType(['documentation']), 'Issue');
  });

  it('_detectPriority: detects priority from labels', () => {
    const adapter = new GitHubAdapter({ gh_org: 'a', gh_repo: 'b' });
    assert.strictEqual(adapter._detectPriority(['P0']), 'Critical');
    assert.strictEqual(adapter._detectPriority(['P1']), 'High');
    assert.strictEqual(adapter._detectPriority(['P3']), 'Low');
    assert.strictEqual(adapter._detectPriority([]), 'Medium');
  });
});

// ── createAdapter factory tests ──────────────────────────────────────────────

describe('createAdapter factory', () => {
  const { createAdapter } = require(LIB_PATH);

  it('creates JiraAdapter for type jira', () => {
    const adapter = createAdapter({ type: 'jira', url: 'https://jira.test.com' });
    assert.strictEqual(adapter.type, 'jira');
  });

  it('creates GitHubAdapter for type github', () => {
    const adapter = createAdapter({ type: 'github', gh_org: 'test', gh_repo: 'repo' });
    assert.strictEqual(adapter.type, 'github');
  });

  it('throws for unsupported type', () => {
    assert.throws(() => createAdapter({ type: 'linear' }), /Unsupported/);
  });
});
