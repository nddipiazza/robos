'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const readline = require('node:readline');
const { pathToFileURL } = require('node:url');

// Only a workstation-supplied launch manifest can authorize a runner. Never read
// executable commands from PR bodies, repository contents, or renderer IPC.
function loadLocalReview(file) {
  if (!file) return null;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const taskLink = require('../../robos-task-client').workItemLink({...config.task, url:config.task?.url || config.taskUrl, title:config.task?.title || config.taskTitle});
  if (!path.isAbsolute(config.workspace || '') || !config.title || !config.baseRef) throw new Error('Local review requires workspace, title and baseRef');
  const git = args => execFileSync('git', ['-C', config.workspace, ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const base = git(['rev-parse', '--verify', config.baseRef + '^{commit}']).trim();
  const head = git(['rev-parse', 'HEAD']).trim();
  const diffPatch = git(['diff', base, head, '--']);
  const changedFiles = git(['diff', '--name-only', base, head, '--']).trim().split('\n').filter(Boolean);
  if (config.runner && (!path.isAbsolute(config.runner.command || '') || !Array.isArray(config.runner.args))) throw new Error('Runner requires an absolute executable and argument array');
  return { ...config, base, head, diffPatch, changedFiles,
    videoUrl: config.videoPath ? pathToFileURL(fs.realpathSync(config.videoPath)).href : null,
    pr: { workItems: taskLink ? [taskLink] : [], local: true, published: !!config.pullRequest, number: config.pullRequest?.number || 'local', url: config.pullRequest?.url, repo: config.repo || 'Local workspace', title: config.pullRequest?.title || config.title, headBranch: git(['branch', '--show-current']).trim(), baseBranch: (config.baseBranch || config.baseRef).replace(/^origin\//, ''), body: config.pullRequest?.body ?? config.summary ?? '', changedFiles }
  };
}

class ShowMeSession {
  constructor(runner) { this.runner = runner; this.child = null; this.ready = false; }
  async start() {
    if (this.child) return { ok: false, error: 'A demonstration is already open. Finish or close it first.' };
    if (!this.runner) return { ok: false, error: 'No trusted local Show me runner configured.' };
    this.ready = false;
    return new Promise(resolve => {
      const child = this.child = spawn(this.runner.command, this.runner.args, { cwd: this.runner.cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      const logs = []; let settled = false;
      const finish = result => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
      const timer = setTimeout(() => { child.kill(); finish({ ok: false, error: 'Show me timed out before reaching its checkpoint.' }); }, this.runner.timeoutMs || 120000);
      child.stdin.on('error', () => {});
      child.stderr.on('data', data => { logs.push(String(data).slice(-2000)); if (logs.length > 100) logs.shift(); });
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', line => {
        let event; try { event = JSON.parse(line); } catch { return; }
        if (event.message) { logs.push(String(event.message)); if (logs.length > 100) logs.shift(); }
        if (event.status === 'HANDOFF_READY') {
          this.ready = true;
          finish({ ok: true, handoffActive: true, status: event.status, steps: logs.map(text => ({ text })), message: event.message });
        }
      });
      child.on('error', error => { this.child = null; this.ready = false; finish({ ok: false, error: error.message }); });
      child.on('exit', code => { this.child = null; this.ready = false; lines.close(); finish({ ok: false, error: `Show me exited (${code}) before its checkpoint. ${logs.join('\n')}` }); });
    });
  }
  control(action) {
    if (!this.child || !this.ready) return { ok: false, error: 'No active reviewer handoff.' };
    if (!['focus', 'complete'].includes(action)) return { ok: false, error: 'Unknown handoff action.' };
    this.child.stdin.write(JSON.stringify({ action }) + '\n');
    if (action === 'complete') this.ready = false;
    return { ok: true, status: action === 'focus' ? 'HANDOFF_READY' : 'REVIEWER_CONFIRMED' };
  }
  stop() { this.child?.kill(); }
}
module.exports = { loadLocalReview, ShowMeSession };
