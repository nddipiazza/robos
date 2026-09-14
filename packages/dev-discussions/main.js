'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

// QEMU VM flags
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'robos');
const CACHE_FILE = path.join(CONFIG_DIR, 'dev-discussions-cache.json');
const DEBUG_PORT = 19187;

let mainWindow = null;

// Debug server for DOM snapshots
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try {
      const { registerSnapshotIPC, startDebugServer } = require(p);
      app.whenReady().then(() => {
        if (mainWindow) {
          registerSnapshotIPC(mainWindow);
          startDebugServer(mainWindow, DEBUG_PORT, 'dev-discussions');
        }
      });
      break;
    } catch {}
  }
} catch {}

// ── Default Seed Data ────────────────────────────────────────────────────────
function getInitialSeedData() {
  return {
    version: 1,
    lastSyncedAt: new Date(Date.now() - 120000).toISOString(),
    rateLimitBudget: {
      limit: 5000,
      remaining: 4892,
      resetAt: new Date(Date.now() + 3600000).toISOString(),
    },
    workspaces: [
      {
        id: 'acme-sdlc',
        name: 'Acme Enterprise SDLC',
        avatar: '🏢',
        active: true,
      },
      {
        id: 'robos-core',
        name: 'RobOS Core Platform',
        avatar: '🤖',
        active: false,
      }
    ],
    projects: [
      {
        id: 'proj-petshop',
        workspaceId: 'acme-sdlc',
        name: 'Acme Petshop',
        slug: 'acme/petshop-api',
        icon: '🐾',
        repository: 'github.com/acme/petshop-api',
        description: 'Pet adoption, veterinary records, and healthcare microservices.',
        features: [
          {
            id: 'feat-rabies',
            name: 'Rabies Verification System',
            code: 'PET-FEAT-01',
            status: 'in-progress',
            items: [
              {
                id: 'thread-pet-101',
                type: 'task',
                sourceServer: 'github-issue',
                number: '101',
                title: 'PET-101: Add Rabies Certificate Upload Form',
                status: 'in-review',
                author: { name: 'Sarah Chen', role: 'Lead Architect', avatar: '👩‍💻', isAgent: false },
                createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                lastActivityAt: new Date(Date.now() - 3600000 * 3).toISOString(),
                url: 'https://github.com/acme/petshop-api/issues/101',
                comments: [
                  {
                    id: 'c-101-1',
                    author: { name: 'Sarah Chen', role: 'Lead Architect', avatar: '👩‍💻', isAgent: false },
                    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                    content: 'We need to support veterinary rabies certificate uploads conforming to the NASPHV rabies compendium. Requirements:\n\n- Accepted MIME types: `application/pdf`, `image/jpeg`, `image/png`\n- File size limit: 15MB\n- Automated OCR for vaccination expiration dates.\n\nPlease discuss validation rules before committing implementation to branch.',
                    reactions: { '👍': 4, '🚀': 2 },
                    attachments: [
                      {
                        title: 'nasphv-rabies-compendium-2026.pdf',
                        fileUrl: 'https://acme.internal/docs/nasphv-rabies-2026.pdf',
                        fileSize: 1420500,
                        mimeType: 'application/pdf'
                      }
                    ]
                  },
                  {
                    id: 'c-101-2',
                    author: { name: 'Antigravity Agent', role: 'Autonomous AI Agent', avatar: '⚡', isAgent: true },
                    createdAt: new Date(Date.now() - 86400000 * 1.5).toISOString(),
                    content: 'I analyzed `packages/petshop-api/models/certificate.go` and the `robos:Microservice` topology in KGraph. If we enforce client-side WebAssembly SHA-256 hashing prior to S3 multipart upload, we prevent forged uploads and duplicate certificate ingestion.\n\nHere is the proposed validation struct:\n```go\ntype CertificatePayload struct {\n    PetID       string    `json:"petId" validate:"required,uuid"`\n    VaccineTag  string    `json:"vaccineTag" validate:"required,alphanum"`\n    ValidUntil  time.Time `json:"validUntil" validate:"required,gtfield=IssuedAt"`\n    SHA256Hash  string    `json:"sha256" validate:"required,hexadecimal,len=64"`\n}\n```',
                    reactions: { '💡': 5, '❤️': 3 },
                    attachments: []
                  },
                  {
                    id: 'c-101-3',
                    author: { name: 'Dave K.', role: 'Senior Vet Systems Engineer', avatar: '👨‍🔧', isAgent: false },
                    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
                    content: 'Agree with client-side SHA-256 check. Also make sure the 3-year rabies booster exemption rule is reflected in the validation logic.',
                    reactions: { '👍': 3 },
                    attachments: []
                  },
                  {
                    id: 'c-101-4',
                    author: { name: 'Claude Code Agent', role: 'Autonomous AI Agent', avatar: '🤖', isAgent: true },
                    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
                    content: 'Implemented the 3-year booster check in PR #42. Live E2E test video proof-of-work has been generated in the disposable sandbox.',
                    reactions: { '🚀': 4 },
                    attachments: []
                  }
                ]
              },
              {
                id: 'thread-pet-102',
                type: 'task',
                sourceServer: 'jira',
                number: 'PET-102',
                title: 'PET-102: API Validation Middleware & Rate Limiting',
                status: 'in-progress',
                author: { name: 'Alex Rivera', role: 'Security Architect', avatar: '🛡️', isAgent: false },
                createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                lastActivityAt: new Date(Date.now() - 3600000 * 8).toISOString(),
                url: 'https://acme.atlassian.net/browse/PET-102',
                comments: [
                  {
                    id: 'c-102-1',
                    author: { name: 'Alex Rivera', role: 'Security Architect', avatar: '🛡️', isAgent: false },
                    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                    content: 'Ensure all vet certificate ingestion endpoints enforce strict rate limiting (100 req/min per clinic credential). All rate-limit violations should trigger an audit event to `~/.config/robos/prompt-security-audit.json`.',
                    reactions: { '👍': 2 },
                    attachments: []
                  },
                  {
                    id: 'c-102-2',
                    author: { name: 'Antigravity Agent', role: 'Autonomous AI Agent', avatar: '⚡', isAgent: true },
                    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
                    content: 'Configured Redis token bucket limiter with sliding window. The rate limit policy is declared in `robos:NoSQLDatabase` shape in KGraph.',
                    reactions: { '🚀': 2 },
                    attachments: []
                  }
                ]
              },
              {
                id: 'thread-pr-42',
                type: 'pull-request',
                sourceServer: 'github-pr',
                number: '42',
                title: 'PR #42: feat(vet): rabies check validation and certificate OCR parser',
                status: 'open',
                branch: 'feature/PET-105-rabies-verification',
                baseBranch: 'main',
                author: { name: 'Antigravity Agent', role: 'Autonomous AI Agent', avatar: '⚡', isAgent: true },
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                lastActivityAt: new Date(Date.now() - 1800000).toISOString(),
                url: 'https://github.com/acme/petshop-api/pull/42',
                comments: [
                  {
                    id: 'c-pr42-intro',
                    author: { name: 'Antigravity Agent', role: 'Autonomous AI Agent', avatar: '⚡', isAgent: true },
                    createdAt: new Date(Date.now() - 86400000).toISOString(),
                    content: '### Summary of Changes\n- Scaffolds certificate OCR ingestion pipeline.\n- Enforces strict SHA-256 validation.\n- Links verified certificates to `robos:CertificateOfCompletion` in KGraph.\n- Includes text-narrated video proof-of-work (`demo-42.webm`).',
                    reactions: { '🚀': 6, '❤️': 2 },
                    attachments: [
                      {
                        title: 'video-proof-of-work-1080p.webm',
                        fileUrl: 'file:///home/robos/.robos/development/walkthroughs/pet-105/demo-42.webm',
                        fileSize: 8420000,
                        mimeType: 'video/webm'
                      }
                    ]
                  },
                  {
                    id: 'c-pr42-rev1',
                    isReviewComment: true,
                    filePath: 'controllers/vet.js',
                    lineNumber: 48,
                    diffHunk: '@@ -45,6 +45,12 @@ async function verifyCertificate(req, res) {\n+  if (!req.body.sha256 || req.body.sha256.length !== 64) {\n+    return res.status(400).json({ error: "Invalid certificate cryptographic digest" });\n+  }\n+  const isRevoked = await CertificateStore.isRevoked(req.body.vaccineTag);\n+  if (isRevoked) return res.status(409).json({ error: "Certificate tag marked revoked" });',
                    author: { name: 'Sarah Chen', role: 'Lead Architect', avatar: '👩‍💻', isAgent: false },
                    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
                    resolved: false,
                    content: 'Good check on `isRevoked`, but what happens if the Redis store is down? We should fail safe (deny ingestion or return 503 Service Unavailable) rather than skipping the check.',
                    reactions: { '👍': 3, '👀': 1 },
                    attachments: []
                  },
                  {
                    id: 'c-pr42-rev2',
                    isReviewComment: true,
                    filePath: 'controllers/vet.js',
                    lineNumber: 52,
                    parentCommentId: 'c-pr42-rev1',
                    author: { name: 'Antigravity Agent', role: 'Autonomous AI Agent', avatar: '⚡', isAgent: true },
                    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
                    resolved: true,
                    content: 'Updated in commit `8f2a1b9`: Wrapped `isRevoked` in a circuit-breaker. When Redis is unavailable, it rejects with HTTP 503 and logs to alert channel.',
                    reactions: { '🎉': 4 },
                    attachments: []
                  },
                  {
                    id: 'c-pr42-rev3',
                    isReviewComment: true,
                    filePath: 'models/certificate.go',
                    lineNumber: 84,
                    diffHunk: '@@ -81,6 +81,9 @@ func (c *Certificate) Expired() bool {\n+func (c *Certificate) WithinBoosterWindow(now time.Time) bool {\n+    return now.After(c.ValidUntil.AddDate(0, -1, 0)) && now.Before(c.ValidUntil)\n+}',
                    author: { name: 'Dave K.', role: 'Senior Vet Systems Engineer', avatar: '👨‍🔧', isAgent: false },
                    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
                    resolved: false,
                    content: 'Let’s make sure `WithinBoosterWindow` also fires a reminder notification to the pet owner 30 days prior. RobOS `notifications` app can pick this up.',
                    reactions: { '💡': 3 },
                    attachments: []
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'proj-robos-core',
        workspaceId: 'robos-core',
        name: 'RobOS Platform Core',
        slug: 'robos/core',
        icon: '⚡',
        repository: 'github.com/robos/robos',
        description: 'SDLC OS platform, autonomous agent governance harness, and modular KGraph runtime.',
        features: [
          {
            id: 'feat-agent-governance',
            name: 'Autonomous Agent Governance',
            code: 'CORE-FEAT-14',
            status: 'in-progress',
            items: [
              {
                id: 'thread-core-204',
                type: 'task',
                sourceServer: 'github-issue',
                number: '204',
                title: 'CORE-204: Zero-Data-Leak Prompt Security Guard (Entropy Defense)',
                status: 'open',
                author: { name: 'Alex Rivera', role: 'Security Architect', avatar: '🛡️', isAgent: false },
                createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
                lastActivityAt: new Date(Date.now() - 3600000 * 12).toISOString(),
                url: 'https://github.com/robos/robos/issues/204',
                comments: [
                  {
                    id: 'c-204-1',
                    author: { name: 'Alex Rivera', role: 'Security Architect', avatar: '🛡️', isAgent: false },
                    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
                    content: 'High-entropy strings (e.g. AWS secret keys, GitHub PAT tokens, JWTs) must be redacted before sending prompts to external LLM providers. Shannon entropy threshold should be tunable per repo.',
                    reactions: { '👍': 5 },
                    attachments: []
                  }
                ]
              },
              {
                id: 'thread-pr-105',
                type: 'pull-request',
                sourceServer: 'github-pr',
                number: '105',
                title: 'PR #105: feat(kgraph): dual-state blast radius diff engine',
                status: 'merged',
                branch: 'feature/CORE-105-blast-radius',
                baseBranch: 'main',
                author: { name: 'Claude Code Agent', role: 'Autonomous AI Agent', avatar: '🤖', isAgent: true },
                createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
                lastActivityAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                url: 'https://github.com/robos/robos/pull/105',
                comments: [
                  {
                    id: 'c-pr105-1',
                    author: { name: 'Claude Code Agent', role: 'Autonomous AI Agent', avatar: '🤖', isAgent: true },
                    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
                    content: 'Enables real-time blast-radius comparison between World 1 (main) and World 2 (feature branch) before code changes are committed.',
                    reactions: { '🚀': 8, '❤️': 4 },
                    attachments: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

// ── Cache Management ────────────────────────────────────────────────────────
function readCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (data && data.projects && data.projects.length > 0) return data;
    }
  } catch (err) {
    console.warn('Failed to read dev-discussions cache, re-initializing:', err.message);
  }
  const initial = getInitialSeedData();
  writeCache(initial);
  return initial;
}

function writeCache(data) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write dev-discussions cache:', err.message);
  }
}

// ── Remote Sync Helpers ─────────────────────────────────────────────────────
function executeGhCommand(cmd) {
  try {
    const stdout = cp.execSync(cmd, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    return { ok: true, data: JSON.parse(stdout) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── KGraph Node Synthesis ───────────────────────────────────────────────────
function exportDiscussionsToKGraph(cache) {
  try {
    const kgraphOrgPath = path.join(process.cwd(), '.robos', 'kgraphs', 'organization', 'package.jsonld');
    let pkgDoc = null;
    if (fs.existsSync(kgraphOrgPath)) {
      try { pkgDoc = JSON.parse(fs.readFileSync(kgraphOrgPath, 'utf8')); } catch {}
    }

    const generatedNodes = [];
    for (const proj of cache.projects) {
      for (const feat of proj.features || []) {
        for (const item of feat.items || []) {
          // Synthesize robos:DiscussionThread node
          const threadNodeId = `urn:robos:thread:${proj.id}:${item.id}`;
          const threadNode = {
            '@id': threadNodeId,
            '@type': ['robos:DiscussionThread', 'robos:Conversation'],
            'dcterms:title': item.title,
            'robos:associatedWorkItem': `urn:robos:${item.type}:${item.number}`,
            'robos:threadType': item.type === 'pull-request' ? 'pr-review' : 'work-item',
            'robos:sourceServer': item.sourceServer || 'github',
            'robos:commentCount': (item.comments || []).length,
            'robos:lastActivityAt': item.lastActivityAt || new Date().toISOString(),
            'robos:package': 'organization',
          };
          generatedNodes.push(threadNode);

          // Synthesize comments
          for (const c of item.comments || []) {
            const commentNodeId = `urn:robos:comment:${item.id}:${c.id}`;
            const isReview = !!c.isReviewComment;
            const commentNode = {
              '@id': commentNodeId,
              '@type': isReview ? ['robos:ReviewComment', 'robos:Comment'] : ['robos:Comment', 'robos:WorkItemComment'],
              'robos:content': c.content,
              'robos:author': c.author ? c.author.name : 'Unknown',
              'robos:createdAt': c.createdAt || new Date().toISOString(),
              'robos:parentItem': threadNodeId,
              'robos:package': 'organization',
            };
            if (isReview) {
              commentNode['robos:pullRequest'] = `urn:robos:pull-request:${item.number}`;
              commentNode['robos:filePath'] = c.filePath || 'unknown';
              if (c.lineNumber) commentNode['robos:lineNumber'] = c.lineNumber;
              if (c.diffHunk) commentNode['robos:diffHunk'] = c.diffHunk;
            }
            generatedNodes.push(commentNode);

            // Attachments
            for (const att of c.attachments || []) {
              const attId = `urn:robos:attachment:${c.id}:${encodeURIComponent(att.title)}`;
              generatedNodes.push({
                '@id': attId,
                '@type': ['robos:CommentAttachment', 'robos:Attachment'],
                'dcterms:title': att.title,
                'robos:fileUrl': att.fileUrl,
                'robos:fileSize': att.fileSize || 0,
                'robos:mimeType': att.mimeType || 'application/octet-stream',
                'robos:parentItem': commentNodeId,
                'robos:package': 'organization',
              });
            }
          }
        }
      }
    }

    if (pkgDoc && Array.isArray(pkgDoc['robos:nodes'])) {
      // Upsert nodes into organization package
      for (const node of generatedNodes) {
        const existingIdx = pkgDoc['robos:nodes'].findIndex(n => n['@id'] === node['@id']);
        if (existingIdx >= 0) pkgDoc['robos:nodes'][existingIdx] = node;
        else pkgDoc['robos:nodes'].push(node);
      }
      pkgDoc['@graph'] = pkgDoc['robos:nodes'];
      fs.mkdirSync(path.dirname(kgraphOrgPath), { recursive: true });
      fs.writeFileSync(kgraphOrgPath, JSON.stringify(pkgDoc, null, 2), 'utf8');
      return { ok: true, nodesExported: generatedNodes.length, destination: kgraphOrgPath };
    }

    return { ok: true, nodesExported: generatedNodes.length, destination: 'in-memory (package pending)' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────────────
function registerIPC() {
  ipcMain.handle('get-discussions', async () => {
    return readCache();
  });

  ipcMain.handle('post-comment', async (_, { threadId, content, isReviewComment, filePath, lineNumber, diffHunk, postUpstream }) => {
    const cache = readCache();
    let targetItem = null;
    let targetProject = null;

    for (const proj of cache.projects) {
      for (const feat of proj.features || []) {
        const found = (feat.items || []).find(i => i.id === threadId);
        if (found) {
          targetItem = found;
          targetProject = proj;
          break;
        }
      }
      if (targetItem) break;
    }

    if (!targetItem) {
      return { ok: false, error: 'Thread not found' };
    }

    const newComment = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author: {
        name: 'Lead System Architect',
        role: 'Lead Architect',
        avatar: '👑',
        isAgent: false
      },
      createdAt: new Date().toISOString(),
      content: content.trim(),
      reactions: {},
      attachments: [],
    };

    if (isReviewComment) {
      newComment.isReviewComment = true;
      newComment.filePath = filePath || '';
      newComment.lineNumber = lineNumber || 0;
      newComment.diffHunk = diffHunk || '';
      newComment.resolved = false;
    }

    targetItem.comments.push(newComment);
    targetItem.lastActivityAt = newComment.createdAt;
    writeCache(cache);

    // Optional upstream sync via gh
    let upstreamResult = null;
    if (postUpstream && targetProject.slug) {
      if (targetItem.type === 'pull-request') {
        const ghRes = executeGhCommand(`gh pr comment --repo ${targetProject.slug} ${targetItem.number} --body "${content.replace(/"/g, '\\"')}"`);
        upstreamResult = ghRes.ok ? 'Posted to GitHub PR' : `Failed upstream: ${ghRes.error}`;
      } else {
        const ghRes = executeGhCommand(`gh issue comment --repo ${targetProject.slug} ${targetItem.number} --body "${content.replace(/"/g, '\\"')}"`);
        upstreamResult = ghRes.ok ? 'Posted to GitHub Issue' : `Failed upstream: ${ghRes.error}`;
      }
    }

    return { ok: true, comment: newComment, upstreamResult };
  });

  ipcMain.handle('add-attachment', async (_, { threadId, commentId, attachment }) => {
    const cache = readCache();
    for (const proj of cache.projects) {
      for (const feat of proj.features || []) {
        for (const item of feat.items || []) {
          if (item.id === threadId) {
            const comment = (item.comments || []).find(c => c.id === commentId);
            if (comment) {
              comment.attachments = comment.attachments || [];
              comment.attachments.push(attachment);
              writeCache(cache);
              return { ok: true, attachment };
            }
          }
        }
      }
    }
    return { ok: false, error: 'Target comment not found' };
  });

  ipcMain.handle('toggle-resolved', async (_, { threadId, commentId }) => {
    const cache = readCache();
    for (const proj of cache.projects) {
      for (const feat of proj.features || []) {
        for (const item of feat.items || []) {
          if (item.id === threadId) {
            const comment = (item.comments || []).find(c => c.id === commentId);
            if (comment && comment.isReviewComment) {
              comment.resolved = !comment.resolved;
              writeCache(cache);
              return { ok: true, resolved: comment.resolved };
            }
          }
        }
      }
    }
    return { ok: false, error: 'Review comment not found' };
  });

  ipcMain.handle('add-reaction', async (_, { threadId, commentId, emoji }) => {
    const cache = readCache();
    for (const proj of cache.projects) {
      for (const feat of proj.features || []) {
        for (const item of feat.items || []) {
          if (item.id === threadId) {
            const comment = (item.comments || []).find(c => c.id === commentId);
            if (comment) {
              comment.reactions = comment.reactions || {};
              comment.reactions[emoji] = (comment.reactions[emoji] || 0) + 1;
              writeCache(cache);
              return { ok: true, reactions: comment.reactions };
            }
          }
        }
      }
    }
    return { ok: false, error: 'Comment not found' };
  });

  ipcMain.handle('sync-remote', async (_, { repo, number, type }) => {
    const cache = readCache();
    if (repo && number) {
      const isPR = type === 'pull-request';
      const cmd = isPR
        ? `gh pr view --repo ${repo} ${number} --json reviews,comments,title,state,url`
        : `gh issue view --repo ${repo} ${number} --json comments,title,state,url`;
      const res = executeGhCommand(cmd);
      if (res.ok && res.data) {
        cache.lastSyncedAt = new Date().toISOString();
        if (cache.rateLimitBudget.remaining > 0) cache.rateLimitBudget.remaining -= 1;
        writeCache(cache);
        return { ok: true, synced: true, remoteData: res.data };
      }
    }
    cache.lastSyncedAt = new Date().toISOString();
    writeCache(cache);
    return { ok: true, synced: false, message: 'Fast cache is up-to-date (no changes detected or offline mode)' };
  });

  ipcMain.handle('export-to-kgraph', async () => {
    const cache = readCache();
    return exportDiscussionsToKGraph(cache);
  });

  ipcMain.handle('get-rate-limit-status', async () => {
    const cache = readCache();
    return cache.rateLimitBudget;
  });

  ipcMain.handle('open-external', async (_, url) => {
    if (url && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false, error: 'Invalid URL' };
  });
}

// ── Window Lifecycle ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b101b',
    title: 'RobOS Dev Discussions',
    icon: path.join(__dirname, 'icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  mainWindow.loadFile('renderer/index.html');
}

app.setName('robos-dev-discussions');
app.setPath('userData', path.join(CONFIG_DIR, 'electron', 'dev-discussions'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  registerIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
