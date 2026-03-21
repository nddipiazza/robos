/**
 * Test scenarios for RobOS security apps.
 */
'use strict';

const FAKE_PUBKEY  = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeDevKeyForHarnessTestingOnly robos@dev-harness';
const FAKE_PRIVKEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA (fake dev key — not real)\n-----END OPENSSH PRIVATE KEY-----\n';

module.exports = {
  'all-good': {
    name: 'all-good',
    description: 'All credentials healthy',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    passReady: true,
    passEntries: { 'work/github-token': 'ghp_fake123' },
    gpgAgent: true,
  },

  'fresh-install': {
    name: 'fresh-install',
    description: 'Completely fresh system — no keys, no pass, no git config',
    ghAuth: false,
    sshKey: null,
    gitConfig: null,
    passReady: false,
    gpgAgent: false,
  },

  'no-gh-auth': {
    name: 'no-gh-auth',
    description: 'gh CLI not authenticated',
    ghAuth: false,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    passReady: true,
    gpgAgent: true,
  },

  'no-ssh-key': {
    name: 'no-ssh-key',
    description: 'No SSH key on disk',
    ghAuth: true,
    sshKey: null,
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    passReady: true,
    gpgAgent: true,
  },

  'pass-not-initialized': {
    name: 'pass-not-initialized',
    description: 'No pass store, no GPG keys',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    passReady: false,
    gpgAgent: false,
  },

  'pass-locked': {
    name: 'pass-locked',
    description: 'Pass store exists but GPG cache is inactive',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    passReady: true,
    passEntries: { 'work/github-token': 'ghp_fake', 'personal/email': 'secret' },
    gpgAgent: true,
  },

  'all-broken': {
    name: 'all-broken',
    description: 'Everything is broken — stress test error states',
    ghAuth: false,
    sshKey: null,
    gitConfig: null,
    passReady: false,
    gpgAgent: false,
  },

  'git-config-missing': {
    name: 'git-config-missing',
    description: 'No git user.name/email configured',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: null,
    passReady: true,
    gpgAgent: true,
  },

  // ── Task server scenarios ──────────────────────────────────────────────────

  'no-task-servers': {
    name: 'no-task-servers',
    description: 'No task servers configured — empty state',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: { task_servers: [] },
  },

  'github-task-server': {
    name: 'github-task-server',
    description: 'One GitHub task server configured',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: {
      task_servers: [{
        id: 'gh-1',
        type: 'github',
        name: 'Acme GitHub',
        gh_api_url: 'https://api.github.com',
        use_gh_cli: true,
        repos: [{ org: 'Hermetiq', repo: 'buildbarn-forms' }],
        gh_labels: [],
      }],
    },
  },

  'jira-task-server': {
    name: 'jira-task-server',
    description: 'One Jira task server configured',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: {
      task_servers: [{
        id: 'jira-1',
        type: 'jira',
        name: 'Acme Jira',
        url: 'https://acme.atlassian.net',
        username: 'dev@acme.com',
        token_pass_path: 'acme/jira-token',
        projects: ['BBF'],
      }],
    },
  },

  // ── Issue manager scenarios ────────────────────────────────────────────────

  'issue-manager-no-config': {
    name: 'issue-manager-no-config',
    description: 'Issue manager with no task server configured',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: { task_servers: [] },
  },

  // ── PR review / CI monitor / Stage demo scenarios ───────────────────────

  'pr-review-no-config': {
    name: 'pr-review-no-config',
    description: 'PR review with no task server configured',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: { task_servers: [] },
  },

  'pr-review-github': {
    name: 'pr-review-github',
    description: 'PR review with a GitHub task server',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: {
      task_servers: [{
        id: 'gh-1',
        type: 'github',
        name: 'Acme GitHub',
        gh_api_url: 'https://api.github.com',
        use_gh_cli: true,
        gh_org: 'Hermetiq',
        gh_repo: 'buildbarn-forms',
        repos: [{ org: 'Hermetiq', repo: 'buildbarn-forms' }],
      }],
      active_task_server: 'gh-1',
    },
  },

  'ci-monitor-no-config': {
    name: 'ci-monitor-no-config',
    description: 'CI monitor with no task server configured',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: { task_servers: [] },
  },

  'ci-monitor-github': {
    name: 'ci-monitor-github',
    description: 'CI monitor with a GitHub task server',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: {
      task_servers: [{
        id: 'gh-1',
        type: 'github',
        name: 'Acme GitHub',
        gh_api_url: 'https://api.github.com',
        use_gh_cli: true,
        gh_org: 'Hermetiq',
        gh_repo: 'buildbarn-forms',
        repos: [{ org: 'Hermetiq', repo: 'buildbarn-forms' }],
      }],
      active_task_server: 'gh-1',
    },
  },

  'stage-demo-no-config': {
    name: 'stage-demo-no-config',
    description: 'Stage demo viewer with no task server configured',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: { task_servers: [] },
  },

  'stage-demo-github': {
    name: 'stage-demo-github',
    description: 'Stage demo viewer with a GitHub task server',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: {
      task_servers: [{
        id: 'gh-1',
        type: 'github',
        name: 'Acme GitHub',
        gh_api_url: 'https://api.github.com',
        use_gh_cli: true,
        gh_org: 'Hermetiq',
        gh_repo: 'buildbarn-forms',
        repos: [{ org: 'Hermetiq', repo: 'buildbarn-forms' }],
      }],
      active_task_server: 'gh-1',
    },
  },

  'issue-manager-github': {
    name: 'issue-manager-github',
    description: 'Issue manager with a GitHub task server',
    ghAuth: true,
    sshKey: { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
    settings: {
      task_servers: [{
        id: 'gh-1',
        type: 'github',
        name: 'Acme GitHub',
        gh_api_url: 'https://api.github.com',
        use_gh_cli: true,
        gh_org: 'Hermetiq',
        gh_repo: 'buildbarn-forms',
        repos: [{ org: 'Hermetiq', repo: 'buildbarn-forms' }],
        issue_types: [
          { id: 'bug', label: 'Bug', color: '#e11d48' },
          { id: 'feature', label: 'Feature', color: '#2563eb' },
        ],
        workflows: [{
          id: 'wf-bug',
          name: 'Bug Workflow',
          type_id: 'bug',
          states: [
            { id: 'triage', label: 'Triage', color: '#f59e0b', is_initial: true },
            { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
            { id: 'done', label: 'Done', color: '#22c55e' },
          ],
          transitions: [
            { from: 'triage', to: 'in-progress' },
            { from: 'in-progress', to: 'done' },
          ],
        }],
      }],
      active_task_server: 'gh-1',
    },
  },
};
