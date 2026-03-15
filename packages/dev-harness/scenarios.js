// Scenario definitions for the RobOS Dev Harness.
// Each scenario sets up a different combination of credentials/failures.

const FAKE_PUBKEY  = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeDevKeyForHarnessTestingOnly robos@dev-harness';
const FAKE_PRIVKEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAA (fake dev key — not real)
-----END OPENSSH PRIVATE KEY-----\n`;

module.exports = {

  'all-good': {
    description: 'All credentials healthy — app should show green across the board',
    ghAuth:    true,
    sshKey:    { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    sshConn:   'ok',
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
  },

  'no-gh-auth': {
    description: 'gh CLI not authenticated — should prompt Login →',
    ghAuth:    false,
    sshKey:    { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    sshConn:   'ok',
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
  },

  'no-ssh-key': {
    description: 'No SSH key on disk — should prompt Generate Key →',
    ghAuth:    true,
    sshKey:    null,
    sshConn:   'fail',
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
  },

  'ssh-not-on-github': {
    description: 'SSH key exists but not added to GitHub — should prompt Add to GitHub →',
    ghAuth:    true,
    sshKey:    { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    sshConn:   'fail',
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
  },

  'scope-missing': {
    description: 'gh token lacks admin:public_key scope — upload should surface Re-auth button',
    ghAuth:    true,
    sshKey:    { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    sshConn:   'fail',
    sshUpload: 'scope-error',
    gitConfig: { name: 'Dev User', email: 'dev@example.com' },
  },

  'git-config-missing': {
    description: 'No git user.name/email configured — should prompt Configure →',
    ghAuth:    true,
    sshKey:    { public: FAKE_PUBKEY, private: FAKE_PRIVKEY },
    sshConn:   'ok',
    gitConfig: null,
  },

  'all-broken': {
    description: 'Everything is broken — stress test error state UI',
    ghAuth:    false,
    sshKey:    null,
    sshConn:   'fail',
    gitConfig: null,
  },

};
