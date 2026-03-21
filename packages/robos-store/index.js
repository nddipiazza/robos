/**
 * RobOS Distributed Config Store — git-backed, versioned configuration.
 *
 * Stores team-shared configs (workflows, task servers, AI prefs, etc.)
 * in a git repo. Each team member clones the repo; changes are committed
 * and pushed automatically.
 *
 * Usage:
 *   const { RobosStore } = require('robos-store');
 *   const store = new RobosStore({ repoUrl: '...', localPath: '...' });
 *   await store.init();
 *   await store.set('workflows/default.yaml', yamlContent);
 *   const content = await store.get('workflows/default.yaml');
 *   await store.sync();
 */
'use strict';

const { GitBackend } = require('./git-backend');
const { SchemaValidator } = require('./schema');

class RobosStore {
  constructor(opts = {}) {
    this.backend = new GitBackend(opts);
    this.validator = new SchemaValidator();
  }

  async init() { return this.backend.init(); }
  async get(key) { return this.backend.get(key); }
  async set(key, value, message) {
    if (this.validator.hasSchema(key)) {
      const errors = this.validator.validate(key, value);
      if (errors.length) throw new Error(`Validation failed for ${key}: ${errors.join(', ')}`);
    }
    return this.backend.set(key, value, message);
  }
  async delete(key, message) { return this.backend.delete(key, message); }
  async list(prefix) { return this.backend.list(prefix); }
  async history(key, limit) { return this.backend.history(key, limit); }
  async sync() { return this.backend.sync(); }
  async diff(key) { return this.backend.diff(key); }
}

module.exports = { RobosStore, GitBackend, SchemaValidator };
