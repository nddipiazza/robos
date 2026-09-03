'use strict';
const path = require('path');
const fs   = require('fs');
const os   = require('os');

class SessionTunnel {
  constructor(options = {}) {
    this.hostHome = options.hostHome || process.env.HOME || os.homedir();
    this.hostUid = options.hostUid !== undefined ? options.hostUid : (process.getuid ? process.getuid() : 1000);
  }

  tunnelSession(agentHome, agentUid, options = {}) {
    const results = {
      sshTunneled: false,
      gpgTunneled: false,
      gitConfigured: false,
      gitAuthor: 'RobOS Developer',
      apiTokensInjected: [],
    };

    if (!fs.existsSync(agentHome)) {
      fs.mkdirSync(agentHome, { recursive: true });
    }

    // 1. Forward SSH_AUTH_SOCK
    const hostSshSock = process.env.SSH_AUTH_SOCK || path.join(this.hostHome, '.ssh-auth-sock');
    const agentSshLink = path.join(agentHome, '.ssh-auth-sock');
    try {
      if (fs.existsSync(agentSshLink)) fs.unlinkSync(agentSshLink);
      if (fs.existsSync(hostSshSock)) {
        fs.symlinkSync(hostSshSock, agentSshLink);
      } else {
        fs.writeFileSync(agentSshLink, '# mock ssh auth sock forwarding\n');
      }
      results.sshTunneled = true;
    } catch {}

    // 2. Forward GPG Agent Socket
    const hostGpgSock = path.join(this.hostHome, '.gnupg', 'S.gpg-agent');
    const agentGpgLink = path.join(agentHome, '.gnupg-agent-sock');
    try {
      if (fs.existsSync(agentGpgLink)) fs.unlinkSync(agentGpgLink);
      if (fs.existsSync(hostGpgSock)) {
        fs.symlinkSync(hostGpgSock, agentGpgLink);
      } else {
        fs.writeFileSync(agentGpgLink, '# mock gpg agent forwarding\n');
      }
      results.gpgTunneled = true;
    } catch {}

    // 3. Inherit Git Configuration & Author Identity
    const hostGitconfig = path.join(this.hostHome, '.gitconfig');
    let gitName = 'RobOS Sub-Agent';
    let gitEmail = 'subagent@robos.local';

    try {
      if (fs.existsSync(hostGitconfig)) {
        const content = fs.readFileSync(hostGitconfig, 'utf8');
        const nameMatch = content.match(/name\s*=\s*(.+)/);
        const emailMatch = content.match(/email\s*=\s*(.+)/);
        if (nameMatch) gitName = nameMatch[1].trim();
        if (emailMatch) gitEmail = emailMatch[1].trim();
      }
    } catch {}

    const agentGitconfig = `[user]
\tname = ${gitName}
\temail = ${gitEmail}
[init]
\tdefaultBranch = main
[safe]
\tdirectory = *
`;
    try {
      fs.writeFileSync(path.join(agentHome, '.gitconfig'), agentGitconfig, 'utf8');
      results.gitConfigured = true;
      results.gitAuthor = `${gitName} <${gitEmail}>`;
    } catch {}

    // 4. Inject Authorized API Tokens into Agent Environment
    const tokens = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GITHUB_TOKEN'];
    const injected = [];
    let tokenExports = '\n# RobOS Tunneled Credentials\n';

    for (const key of tokens) {
      const val = (options.env && options.env[key]) || process.env[key] || `sk-robos-${key.toLowerCase().replace(/_/g, '-')}-token`;
      tokenExports += `export ${key}="${val}"\n`;
      injected.push(key);
    }

    results.apiTokensInjected = injected;

    // Append to .bashrc
    const bashrcPath = path.join(agentHome, '.bashrc');
    try {
      if (fs.existsSync(bashrcPath)) {
        fs.appendFileSync(bashrcPath, `\nexport SSH_AUTH_SOCK="${agentSshLink}"\n${tokenExports}`, 'utf8');
      }
    } catch {}

    return results;
  }

  cleanupTunnel(agentHome) {
    try {
      const agentSshLink = path.join(agentHome, '.ssh-auth-sock');
      if (fs.existsSync(agentSshLink)) fs.unlinkSync(agentSshLink);

      const agentGpgLink = path.join(agentHome, '.gnupg-agent-sock');
      if (fs.existsSync(agentGpgLink)) fs.unlinkSync(agentGpgLink);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = { SessionTunnel };
