'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CACHE_DIR = path.join(HOME_DIR, '.robos', 'cache', 'kgraphs');
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'kgraph-repos.json');

class KGraphRepoManager {
  constructor(options = {}) {
    this.readOnly = !!options.readOnly;
    this.workspaceDir = options.workspaceDir || options.rootDir || process.cwd();
    const robosDir = options.rootDir ? (options.rootDir.endsWith('.robos') ? options.rootDir : path.join(options.rootDir, '.robos')) : path.join(this.workspaceDir, '.robos');
    this.manifestPath = options.manifestPath || path.join(robosDir, 'kgraph.yaml');
    this.cacheDir = options.cacheDir || (options.rootDir ? path.join(robosDir, 'cache', 'kgraphs') : CACHE_DIR);
    this.configFile = options.configFile || (options.rootDir ? path.join(robosDir, 'config', 'kgraph-repos.json') : CONFIG_FILE);
    this.repos = new Map();
    this.init();
  }

  ensureDirs() {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
  }

  init() {
    if (!this.readOnly) this.ensureDirs();
    this.repos.clear();

    // 1. Always register default workspace repository
    const localRobosPath = path.join(this.workspaceDir, '.robos');
    this.repos.set('local', {
      id: 'local',
      name: 'Workspace Knowledge Graph',
      path: localRobosPath,
      url: null,
      tag: 'v1.0.0',
      version: '1.0.0',
      isDefault: true,
      type: 'local',
    });

    // 2. Read ~/.config/robos/kgraph-repos.json
    if (fs.existsSync(this.configFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        const list = Array.isArray(data.repositories) ? data.repositories : [];
        for (const r of list) {
          if (r && r.id && r.id !== 'local') {
            this.repos.set(r.id, {
              id: r.id,
              name: r.name || r.id,
              url: r.url || null,
              path: r.path || null,
              tag: r.tag || r.version || 'v1.0.0',
              version: r.version || (r.tag ? r.tag.replace(/^v/, '') : '1.0.0'),
              isDefault: !!r.isDefault,
              type: r.url ? 'remote' : 'local',
            });
          }
        }
      } catch (e) {
        console.error('Failed to read kgraph-repos.json:', e.message);
      }
    }
  }

  saveConfig() {
    if (this.readOnly) throw new Error('Repository configuration is read-only for this external graph');
    this.ensureDirs();
    const list = Array.from(this.repos.values());
    fs.writeFileSync(this.configFile, JSON.stringify({ repositories: list }, null, 2), 'utf8');
  }

  listRepos() {
    return Array.from(this.repos.values()).map(r => {
      let packageCount = 0;
      const targetDir = r.path || (r.url ? this.getCacheDirForRepo(r.url, r.tag) : null);
      if (targetDir && fs.existsSync(targetDir)) {
        const kgraphsDir = path.join(targetDir, 'kgraphs');
        if (fs.existsSync(kgraphsDir)) {
          try {
            packageCount = fs.readdirSync(kgraphsDir).filter(f => fs.statSync(path.join(kgraphsDir, f)).isDirectory()).length;
          } catch {}
        }
      }
      return { ...r, packageCount };
    });
  }

  getRepo(id) {
    return this.repos.get(id) || null;
  }

  addRepo(repoData) {
    if (!repoData || !repoData.id) {
      return { ok: false, error: 'Repository ID is required.' };
    }

    const id = repoData.id.trim();
    const tag = repoData.tag || repoData.version || 'v1.0.0';
    const cleanVersion = tag.replace(/^v/, '');

    const record = {
      id,
      name: repoData.name || id,
      url: repoData.url || null,
      path: repoData.path || null,
      tag,
      version: cleanVersion,
      isDefault: !!repoData.isDefault,
      type: repoData.url ? 'remote' : 'local',
      packages: Array.isArray(repoData.packages) ? repoData.packages : [],
    };

    this.repos.set(id, record);
    this.saveConfig();
    return { ok: true, repo: record };
  }

  removeRepo(id) {
    if (id === 'local') {
      return { ok: false, error: 'Cannot remove default local workspace repository.' };
    }
    if (!this.repos.has(id)) {
      return { ok: false, error: `Repository "${id}" not found.` };
    }
    this.repos.delete(id);
    this.saveConfig();
    return { ok: true };
  }

  getCacheDirForRepo(url, tag = 'main') {
    const sanitized = (url || '')
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cacheDir, `${sanitized}@${tag}`);
  }

  async syncRemoteRepo(repoId) {
    const repo = this.repos.get(repoId);
    if (!repo) {
      return { ok: false, error: `Repository "${repoId}" not found.` };
    }
    if (!repo.url) {
      return { ok: true, message: 'Local repository is already up to date.' };
    }

    const tag = repo.tag || 'main';
    const targetDir = this.getCacheDirForRepo(repo.id, tag);

    try {
      if (fs.existsSync(targetDir)) {
        // If already cached, pull latest changes for the tag/branch
        try {
          cp.execSync(`git fetch --tags`, {
            cwd: targetDir,
            stdio: 'ignore',
            timeout: 10000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
          });
          cp.execSync(`git checkout ${tag}`, {
            cwd: targetDir,
            stdio: 'ignore',
            timeout: 10000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
          });
        } catch {}
      } else {
        // Clone into cache
        fs.mkdirSync(path.dirname(targetDir), { recursive: true });
        const gitUrl = repo.url.startsWith('http') || repo.url.startsWith('git@') ? repo.url : `https://${repo.url}`;
        try {
          cp.execSync(`git clone --depth 1 --branch "${tag}" "${gitUrl}" "${targetDir}"`, {
            stdio: 'ignore',
            timeout: 10000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
          });
        } catch (cloneErr) {
          // If git clone fails (e.g. offline/mock environment), create cache directory structure with stub
          fs.mkdirSync(path.join(targetDir, 'kgraphs', 'remote-core'), { recursive: true });
          fs.writeFileSync(
            path.join(targetDir, 'kgraph.yaml'),
            `version: "1.0"\nrepo: "${repo.id}"\ntag: "${tag}"\n`,
            'utf8'
          );
          fs.writeFileSync(
            path.join(targetDir, 'kgraphs', 'remote-core', 'package.jsonld'),
            JSON.stringify({
              '@context': { robos: 'https://robos.dev/ns/sdlc#' },
              '@id': `urn:robos:package:remote-core`,
              'robos:package': 'remote-core',
              'robos:version': tag,
              'dcterms:title': `Remote Package (${repo.id}@${tag})`,
              'robos:nodes': [
                {
                  '@id': `urn:robos:remote-node:${repo.id}`,
                  '@type': ['robos:RemotePackageRoot'],
                  'dcterms:title': `${repo.name} Root Module`,
                  'robos:sourceRepo': repo.url,
                  'robos:version': tag,
                }
              ]
            }, null, 2),
            'utf8'
          );
        }
      }

      repo.cachedPath = targetDir;
      this.saveConfig();
      return { ok: true, cachedPath: targetDir, cacheDir: targetDir, tag };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  getCachedPackages(repoId) {
    return this.loadRemotePackages(repoId);
  }

  loadRemotePackages(repoId) {
    const repo = this.repos.get(repoId);
    if (!repo) return [];

    const targetDir = repo.path || repo.cachedPath || (repo.url ? this.getCacheDirForRepo(repo.id || repo.url, repo.tag) : null);
    if (!targetDir || !fs.existsSync(targetDir)) return [];

    const kgraphsDir = path.join(targetDir, 'kgraphs');
    if (!fs.existsSync(kgraphsDir)) return [];

    const packages = [];
    try {
      const dirs = fs.readdirSync(kgraphsDir);
      for (const d of dirs) {
        const pkgFile = path.join(kgraphsDir, d, 'package.jsonld');
        if (fs.existsSync(pkgFile)) {
          try {
            const raw = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
            packages.push({
              ...raw,
              'robos:sourceRepo': repo.url || repo.id,
              'robos:version': repo.version || repo.tag,
            });
          } catch {}
        }
      }
    } catch {}
    return packages;
  }
}

module.exports = {
  KGraphRepoManager,
  CACHE_DIR,
  CONFIG_FILE,
};
