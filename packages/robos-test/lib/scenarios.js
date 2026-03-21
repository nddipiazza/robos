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
};
