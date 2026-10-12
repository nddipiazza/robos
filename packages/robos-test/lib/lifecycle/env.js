'use strict';
/**
 * Shared run context for the lifecycle demo: one tmp root holding the git
 * world, the forge state/log, and a scenario factory so every app (separate
 * Electron processes with separate HOMEs) points at the same fake forge.
 */
const fs = require('fs');
const path = require('path');
const world = require('./world');
const forge = require('./forge');
const { createHash } = require('crypto');
const { buildEvidence } = require('./evidence');

const LIFE_BIN = path.join(__dirname, 'bin');
const SANDBOX_BIN = path.resolve(__dirname, '../../sandbox/bin');

function createContext(root) {
  const w = world.createWorld(path.join(root, 'world'));
  const stateFile = path.join(root, 'forge-state.json');
  const logFile = path.join(root, 'forge-calls.log');
  fs.writeFileSync(logFile, '');
  forge.save(stateFile, { issues: [], labels: [], prs: [], user: forge.ME, nextNumber: 40, ci: {} });

  const env = {
    PATH: `${LIFE_BIN}:${SANDBOX_BIN}:${process.env.PATH}`,
    FAKE_FORGE_STATE: stateFile,
    FAKE_FORGE_LOG: logFile,
    FAKE_WORKSPACE: w.workspace,
  };

  const settings = {
    task_servers: [{
      id: 'gh-pawfinder', type: 'github', name: 'Pawfinder (GitHub)',
      gh_api_url: 'https://api.github.com', use_gh_cli: true,
      gh_org: 'acme-corp', gh_repo: 'pawfinder-api',
      repos: [{ org: 'acme-corp', repo: 'pawfinder-api' }],
      issue_types: [{ id: 'epic', label: 'Epic', color: '#7c3aed' }, { id: 'task', label: 'Task', color: '#2563eb' }, { id: 'bug', label: 'Bug', color: '#e11d48' }],
    }],
    active_task_server: 'gh-pawfinder',
  };

  /** Scenario for harness.launchApp: sandboxed HOME + fake forge/agent on PATH. */
  function scenario(name, extraEnv = {}, extraSettings = {}) {
    return {
      name,
      description: `Lifecycle demo: ${name}`,
      ghAuth: true,
      gitConfig: { name: 'Dana Whitfield', email: 'dana@acme-corp.example' },
      settings: { ...settings, ...extraSettings },
      env: { ...env, ...extraEnv },
    };
  }

  // ---- review manifest (Task Implementer's "Review branch…" output) -------------
  function prepareReview() {
    const dir = path.join(root, 'review');
    fs.mkdirSync(dir, { recursive: true });
    const evidenceBundlePath = buildEvidence({ workspace: w.workspace, baseRef: 'origin/main', outDir: path.join(dir, 'evidence') });
    const demoProcess = path.join(dir, 'demo.json');
    fs.writeFileSync(demoProcess, JSON.stringify({
      instructions: `Demonstrate the actual local changes for ${world.TASK.title}. Call the real searchPets function with the new options and run the project tests. Use real observations and stop at each checkpoint. Never create a PR automatically.`,
      checkpoints: [
        { title: 'Understand the change', given: 'The implementation branch is checked out.', when: 'Inspect the diff against main and the task acceptance criteria.', then: 'The reviewer understands what changed and what to try.' },
        { title: 'Try the changed behavior', given: 'The sample pets are loaded.', when: 'Call searchPets with a species filter and with an unknown species, then run the tests.', then: 'Each acceptance criterion is observed to hold.' },
      ],
    }, null, 2));
    const manifest = path.join(dir, 'review.json');
    fs.writeFileSync(manifest, JSON.stringify({
      taskUrl: forge.issueUrl(42), taskTitle: world.TASK.title,
      workspace: w.workspace, repo: forge.REPO, title: 'feat(search): species filter and relevance ranking (#42)',
      baseRef: 'origin/main', baseBranch: 'main',
      summary: 'Adopters can narrow pet search to one species, and the best matches now come first.',
      demoProcess, evidenceBundlePath,
      demoAgent: { command: path.join(LIFE_BIN, 'codex'), args: ['exec', '--json'], timeoutMs: 120000 },
    }, null, 2) + '\n');
    return manifest;
  }

  /** Scenario for pr-review as the PR author ('owner') or as the reviewer. */
  function reviewScenario(role, { manifest, prUrl } = {}) {
    const login = role === 'owner' ? forge.ME : forge.REVIEWER;
    const repoKey = createHash('sha256').update(forge.REPO.toLowerCase()).digest('hex');
    const files = {
      '.config/robos/github-accounts.json': { git: login },
      [`.robos/project-review-settings/${repoKey}.json`]: { githubReviewers: [forge.REVIEWER] },
    };
    const extra = role === 'owner' ? { ROBOS_LOCAL_REVIEW: manifest } : { ROBOS_REVIEW_URL: prUrl };
    return { ...scenario(`review-${role}`, extra), files };
  }

  const readState = () => forge.load(stateFile);
  const writeState = (s) => forge.save(stateFile, s);
  const calls = () => fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).args);

  return { root, world: w, stateFile, logFile, env, settings, scenario, prepareReview, reviewScenario, readState, writeState, calls };
}

module.exports = { createContext, LIFE_BIN };
