/**
 * Git Backend — stores config files in a local git repo with push/pull sync.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DEFAULT_LOCAL_PATH = path.join(os.homedir(), '.config', 'robos', 'store');

class GitBackend {
  constructor(opts = {}) {
    this.repoUrl = opts.repoUrl || null;
    this.localPath = opts.localPath || DEFAULT_LOCAL_PATH;
    this.branch = opts.branch || 'main';
    this.autoCommit = opts.autoCommit !== false;
    this.autoPush = opts.autoPush !== false;
  }

  _git(args, opts = {}) {
    const cwd = opts.cwd || this.localPath;
    try {
      return execSync(`git ${args}`, {
        cwd, encoding: 'utf8', timeout: opts.timeout || 15000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      }).trim();
    } catch (e) {
      throw new Error(`git ${args.split(' ')[0]} failed: ${(e.stderr || e.message || '').toString().trim()}`);
    }
  }

  /**
   * Initialize the store — clone if remote URL provided, or init locally.
   */
  async init() {
    if (fs.existsSync(path.join(this.localPath, '.git'))) {
      return { ok: true, status: 'existing' };
    }

    fs.mkdirSync(this.localPath, { recursive: true });

    if (this.repoUrl) {
      try {
        execSync(`git clone ${this.repoUrl} ${this.localPath}`, {
          encoding: 'utf8', timeout: 30000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        return { ok: true, status: 'cloned' };
      } catch (e) {
        throw new Error(`Failed to clone ${this.repoUrl}: ${(e.stderr || e.message).toString().trim()}`);
      }
    }

    // Local-only init
    this._git('init', { cwd: this.localPath });
    this._git(`checkout -b ${this.branch}`, { cwd: this.localPath });
    return { ok: true, status: 'initialized' };
  }

  /**
   * Get a config file's content.
   */
  async get(key) {
    const filePath = path.join(this.localPath, key);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }

  /**
   * Set a config file's content. Auto-commits if enabled.
   */
  async set(key, value, commitMessage) {
    const filePath = path.join(this.localPath, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, value);

    if (this.autoCommit) {
      this._git(`add ${key}`);
      const msg = commitMessage || `Update ${key}`;
      try {
        this._git(`commit -m "${msg.replace(/"/g, '\\"')}"`);
      } catch {
        // Nothing to commit (file unchanged)
      }

      if (this.autoPush && this.repoUrl) {
        try { this._git(`push origin ${this.branch}`); } catch {}
      }
    }

    return { ok: true };
  }

  /**
   * Delete a config file.
   */
  async delete(key, commitMessage) {
    const filePath = path.join(this.localPath, key);
    if (!fs.existsSync(filePath)) return { ok: true, deleted: false };

    fs.unlinkSync(filePath);

    if (this.autoCommit) {
      this._git(`add ${key}`);
      const msg = commitMessage || `Delete ${key}`;
      try { this._git(`commit -m "${msg.replace(/"/g, '\\"')}"`); } catch {}
      if (this.autoPush && this.repoUrl) {
        try { this._git(`push origin ${this.branch}`); } catch {}
      }
    }

    return { ok: true, deleted: true };
  }

  /**
   * List config files under a prefix.
   */
  async list(prefix = '') {
    const dir = path.join(this.localPath, prefix);
    if (!fs.existsSync(dir)) return [];

    const results = [];
    function walk(d, rel) {
      for (const name of fs.readdirSync(d)) {
        if (name.startsWith('.')) continue;
        const full = path.join(d, name);
        const relPath = rel ? `${rel}/${name}` : name;
        if (fs.statSync(full).isDirectory()) {
          walk(full, relPath);
        } else {
          results.push(relPath);
        }
      }
    }
    walk(dir, prefix);
    return results.sort();
  }

  /**
   * Get commit history for a file.
   */
  async history(key, limit = 20) {
    try {
      const log = this._git(`log --pretty=format:"%H|%an|%ai|%s" -n ${limit} -- ${key}`);
      if (!log) return [];
      return log.split('\n').map(line => {
        const [hash, author, date, ...msgParts] = line.split('|');
        return { hash, author, date, message: msgParts.join('|') };
      });
    } catch {
      return [];
    }
  }

  /**
   * Pull + push to sync with remote.
   */
  async sync() {
    if (!this.repoUrl) return { ok: true, status: 'local-only' };

    const results = { pulled: false, pushed: false, conflicts: false };

    // Pull
    try {
      this._git(`pull --rebase origin ${this.branch}`, { timeout: 30000 });
      results.pulled = true;
    } catch (e) {
      if (e.message.includes('CONFLICT')) {
        results.conflicts = true;
        // Abort rebase, keep local
        try { this._git('rebase --abort'); } catch {}
        return { ok: false, status: 'conflict', error: 'Merge conflict — local changes preserved', ...results };
      }
      // Pull failed (no remote, offline, etc.) — non-fatal
    }

    // Push
    try {
      this._git(`push origin ${this.branch}`, { timeout: 30000 });
      results.pushed = true;
    } catch {
      // Push failed (no remote, offline, etc.) — non-fatal
    }

    return { ok: true, status: 'synced', ...results };
  }

  /**
   * Get uncommitted diff for a file (or all files).
   */
  async diff(key) {
    try {
      return this._git(key ? `diff -- ${key}` : 'diff');
    } catch {
      return '';
    }
  }
}

module.exports = { GitBackend, DEFAULT_LOCAL_PATH };
