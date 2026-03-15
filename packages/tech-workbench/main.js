const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const cp    = require('child_process');
const crypto = require('crypto');

// ── Paths ─────────────────────────────────────────────────────────────────────
const TPS_DIR       = path.join(os.homedir(), '.config', 'robos', 'tech-workbench');
const SESSIONS_FILE = path.join(TPS_DIR, 'sessions.json');
const JOURNAL_FILE  = path.join(os.homedir(), '.config', 'robos', 'journal-events.json');

fs.mkdirSync(TPS_DIR, { recursive: true });

// ── RobOS instructions ────────────────────────────────────────────────────────
const ROBOS_INSTRUCTIONS = `You are an AI agent running inside RobOS — an AI-powered developer-lifecycle OS built on Ubuntu Linux.
RobOS apps: Task Planner, Workflow Studio, Agent Scheduler, Work Journal, Dev Central, Notifications, Tech Workbench (this app — creates technical problem solution documents).
You have access to the user's development environment, GitHub repos, and project context.
`;

function getRobosInstructions() { return ROBOS_INSTRUCTIONS; }

// ── Sessions ──────────────────────────────────────────────────────────────────
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveSessions(sessions) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function sessionDir(slug) {
  return path.join(TPS_DIR, slug);
}

function readSessionMeta(slug) {
  const f = path.join(sessionDir(slug), 'metadata.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function writeSessionMeta(slug, meta) {
  fs.mkdirSync(sessionDir(slug), { recursive: true });
  fs.writeFileSync(path.join(sessionDir(slug), 'metadata.json'), JSON.stringify(meta, null, 2));
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
    + '-' + Date.now().toString(36);
}

// ── Journal ───────────────────────────────────────────────────────────────────
function writeJournalEvent(ev) {
  try {
    let data = [];
    try { data = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8')); } catch {}
    data.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      source: 'tech-workbench', ...ev });
    if (data.length > 2000) data = data.slice(0, 2000);
    fs.writeFileSync(JOURNAL_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

// ── Copilot runner ────────────────────────────────────────────────────────────
function findCopilot() {
  const candidates = [
    '/usr/local/bin/copilot', '/usr/bin/copilot',
    path.join(os.homedir(), '.local/bin/copilot'),
  ];
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  return (cp.spawnSync('which', ['copilot'], { encoding: 'utf8' }).stdout || '').trim() || 'copilot';
}

function copilotRun(event, prompt, streamChannel = 'stream') {
  return new Promise((resolve, reject) => {
    const bin = findCopilot();
    const fullPrompt = getRobosInstructions() + prompt;
    const proc = cp.spawn(bin, ['-p', fullPrompt, '--allow-all-tools', '--silent', '--no-ask-user'], {
      env: { ...process.env, DISPLAY: ':0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { const c = d.toString(); stdout += c; event.sender.send(streamChannel, c); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => reject(new Error(`Failed to spawn copilot: ${err.message}`)));
    proc.on('close', code => {
      if (code !== 0 && !stdout.trim()) reject(new Error(`copilot exited ${code}: ${stderr.slice(0, 300)}`));
      else if (!stdout.trim()) reject(new Error(`copilot produced no output. stderr: ${stderr.slice(0, 200)}`));
      else resolve(stdout.trim());
    });
  });
}

// ── AI Prompts ────────────────────────────────────────────────────────────────
function buildDraftPrompt(sessionName, prompt, answers) {
  const qaSection = answers && answers.length > 0
    ? '\n\nAdditional context from Q&A:\n' + answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')
    : '';

  return `You are a senior software architect and technical writer. Generate a comprehensive Technical Problem Solution document set for the following problem.

Session name: "${sessionName}"
Problem: ${prompt}${qaSection}

Generate EXACTLY 4 markdown documents separated by the delimiter "---DOC---".
Each document must start with a level-1 heading.

Document 1 — Problem Statement:
- Clear problem description with context
- Business/technical impact  
- Constraints and requirements
- Scope (in/out of scope)

Document 2 — Technical Analysis:
- Root cause analysis
- Current state / pain points
- Existing approaches and their trade-offs
- Technical risks

Document 3 — Proposed Solution:
- Solution overview
- Implementation approach
- Key design decisions
- Phased rollout plan
- Success criteria / metrics

Document 4 — Architecture & Design:
- Use 2-3 Mermaid diagrams (flowchart, sequence diagram, or architecture diagram)
- Component breakdown
- Data flow
- Integration points
- Each Mermaid block: \`\`\`mermaid ... \`\`\`

Use proper markdown: headers, bullet points, code blocks where appropriate.
Be specific and detailed — this is a real technical design document.
Output ONLY the 4 documents separated by ---DOC--- with no other text before or after.`;
}

function buildQuestionsPrompt(sessionName, prompt) {
  return `You are a senior software architect reviewing a technical problem. Generate 6-8 focused clarifying questions to better understand the problem and guide a better solution.

Session: "${sessionName}"
Problem: ${prompt}

Output ONLY valid JSON (no markdown, no explanation):
{
  "questions": [
    { "id": "q1", "category": "context", "question": "Question text here?" },
    ...
  ]
}

Categories: context, technical, constraints, scale, timeline, team, success
Questions should be:
- Specific and answerable
- Help fill in gaps about scale, tech stack, team size, deadlines, existing systems
- Not redundant with info already given
- Practical and professional`;
}

function buildRefinementPrompt(sessionName, prompt, answers, currentDocs) {
  const qaSection = answers.map(a => `Q: ${a.question}\nA: ${a.answer || '(no answer)'}`).join('\n\n');
  const docsSection = currentDocs.map((d, i) => `--- Document ${i+1} ---\n${d}`).join('\n\n');

  return `You are a senior software architect. Refine and improve the following Technical Problem Solution documents based on the Q&A answers provided.

Session: "${sessionName}"
Original Problem: ${prompt}

Q&A Answers:
${qaSection}

Current Documents:
${docsSection}

Produce improved versions of all 4 documents incorporating the new information.
Improve specificity, accuracy, and completeness based on the answers.
Add or update Mermaid diagrams in Document 4 if the architecture changed.

Output EXACTLY 4 documents separated by ---DOC--- with no other text.`;
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1300, height: 850, minWidth: 900, minHeight: 600,
    title: 'RobOS TPS Workbench',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC: Sessions ─────────────────────────────────────────────────────────────
ipcMain.handle('list-sessions', () => {
  const sessions = loadSessions();
  // Enrich with meta
  return sessions.map(s => {
    const meta = readSessionMeta(s.slug);
    return { ...s, phase: meta?.phase || 'describe', updatedAt: meta?.updatedAt || s.createdAt };
  }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
});

ipcMain.handle('create-session', (_, { name }) => {
  const slug = slugify(name || 'untitled');
  const id   = crypto.randomUUID();
  const now  = new Date().toISOString();
  const meta = { id, name: name || 'Untitled', slug, phase: 'describe', createdAt: now, updatedAt: now, prompt: '' };
  fs.mkdirSync(sessionDir(slug), { recursive: true });
  writeSessionMeta(slug, meta);
  const sessions = loadSessions();
  sessions.unshift({ id, name: name || 'Untitled', slug, createdAt: now });
  saveSessions(sessions);
  writeJournalEvent({ type: 'session-created', title: `📋 TPS Session Created: ${name}`, detail: `Slug: ${slug}`, status: 'started' });
  return meta;
});

ipcMain.handle('load-session', (_, slug) => {
  const meta = readSessionMeta(slug);
  if (!meta) return null;
  const dir = sessionDir(slug);

  // Load all docs
  const docFiles = ['01-problem.md', '02-analysis.md', '03-solution.md', '04-architecture.md'];
  const docs = docFiles.map(f => {
    const fp = path.join(dir, f);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
  });

  const refinedDir = path.join(dir, 'refined');
  const refinedDocs = docFiles.map(f => {
    const fp = path.join(refinedDir, f);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
  });

  let questions = [];
  const qf = path.join(dir, 'questions.json');
  try { if (fs.existsSync(qf)) questions = JSON.parse(fs.readFileSync(qf, 'utf8')); } catch {}

  return { meta, docs, refinedDocs, questions, dir };
});

ipcMain.handle('save-prompt', (_, { slug, prompt }) => {
  const meta = readSessionMeta(slug);
  if (!meta) return { ok: false };
  meta.prompt = prompt;
  meta.updatedAt = new Date().toISOString();
  writeSessionMeta(slug, meta);
  return { ok: true };
});

ipcMain.handle('rename-session', (_, { slug, name }) => {
  const meta = readSessionMeta(slug);
  if (!meta) return { ok: false };
  meta.name = name;
  meta.updatedAt = new Date().toISOString();
  writeSessionMeta(slug, meta);
  const sessions = loadSessions();
  const s = sessions.find(x => x.slug === slug);
  if (s) s.name = name;
  saveSessions(sessions);
  return { ok: true };
});

ipcMain.handle('delete-session', (_, slug) => {
  const sessions = loadSessions().filter(s => s.slug !== slug);
  saveSessions(sessions);
  // Move to trash dir
  const dir = sessionDir(slug);
  const trash = path.join(TPS_DIR, '.trash');
  fs.mkdirSync(trash, { recursive: true });
  try { fs.renameSync(dir, path.join(trash, slug + '-' + Date.now())); } catch {}
  return { ok: true };
});

ipcMain.handle('open-session-folder', (_, slug) => {
  const dir = sessionDir(slug);
  const NAV_MAILBOX = path.join(os.homedir(), '.config', 'robos', 'file-explorer-nav.json');
  fs.mkdirSync(path.dirname(NAV_MAILBOX), { recursive: true });
  fs.writeFileSync(NAV_MAILBOX, JSON.stringify({ path: dir, ts: Date.now() }));
  cp.spawn('/usr/local/bin/file-explorer', [], {
    detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' },
  }).unref();
  return { ok: true };
});

ipcMain.handle('journal-log-event', (_, evt) => { writeJournalEvent(evt); return true; });

ipcMain.handle('quick-ask', async (event, { question, context, contextFiles }) => {
  const ctxSection = context ? `\n\n## Current Context\n${context.slice(0, 3000)}` : '';
  const filesSection = contextFiles && contextFiles.length ? `\n\nContext files referenced: ${contextFiles.join(', ')}` : '';
  const prompt = `${ctxSection}${filesSection}\n\n## Question\n${question}\n\nAnswer concisely and helpfully.`;
  try {
    await copilotRun(event, prompt, 'quick-ask-stream');
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});


ipcMain.handle('list-path', (_, prefix) => {
  try {
    const home     = os.homedir();
    const expanded = prefix.replace(/^~/, home);
    const isDir    = expanded.endsWith('/');
    const dir      = isDir ? expanded : path.dirname(expanded);
    const partial  = isDir ? '' : path.basename(expanded);

    // Bare word search — use search index for speed
    const isRecursive = partial && !expanded.slice(home.length + 1).includes('/');
    if (isRecursive) {
      const INDEX_DIR = path.join(home, '.config', 'robos', 'search-index');
      let items = [];
      if (fs.existsSync(INDEX_DIR)) {
        const indexFiles = fs.readdirSync(INDEX_DIR).filter(f => f.endsWith('.txt'));
        const seen = new Set();
        for (const indexFile of indexFiles) {
          const fp = path.join(INDEX_DIR, indexFile);
          const r = cp.spawnSync('grep', ['-i', '-m', '30', partial, fp], { encoding: 'utf8', timeout: 2000 });
          for (const p of (r.stdout || '').split('\n').filter(Boolean)) {
            if (seen.has(p)) continue;
            seen.add(p);
            // Handle git repo entries (github.com/org/repo format)
            if (p.startsWith('github.com/')) {
              const parts = p.replace('github.com/', '').split('/');
              if (parts.length === 2) {
                const [org, repo] = parts;
                if (!repo.toLowerCase().includes(partial.toLowerCase()) && !org.toLowerCase().includes(partial.toLowerCase())) continue;
                items.push({ name: `${org}/${repo}`, path: p, isRepo: true, repoId: `${org}/${repo}`, org, repo });
              }
              continue;
            }
            if (!path.basename(p).toLowerCase().includes(partial.toLowerCase())) continue;
            let isDirectory = false;
            try { isDirectory = fs.statSync(p).isDirectory(); } catch {}
            items.push({ name: path.basename(p) + (isDirectory ? '/' : ''), path: p + (isDirectory ? '/' : ''), isDir: isDirectory, isPath: true });
            if (items.length >= 30) break;
          }
          if (items.length >= 30) break;
        }
      }
      if (!items.length) {
        const result = cp.spawnSync('find', [
          home, '-maxdepth', '6',
          '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*',
          '-not', '-path', '*/dist/*', '-not', '-path', '*/.cache/*',
          '-not', '-name', '.*', '-iname', `*${partial}*`,
        ], { encoding: 'utf8', timeout: 4000 });
        items = (result.stdout || '').split('\n').filter(Boolean).slice(0, 30).map(p => {
          let isDirectory = false;
          try { isDirectory = fs.statSync(p).isDirectory(); } catch {}
          return { name: path.basename(p) + (isDirectory ? '/' : ''), path: p + (isDirectory ? '/' : ''), isDir: isDirectory, isPath: true };
        });
      }
      return { ok: true, items };
    }

    // Directory listing
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    if (!fs.statSync(dir).isDirectory()) return { ok: true, items: [] };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !partial || e.name.toLowerCase().includes(partial.toLowerCase()))
      .filter(e => partial.startsWith('.') || !e.name.startsWith('.'))
      .slice(0, 30)
      .map(e => ({
        name:   e.name + (e.isDirectory() ? '/' : ''),
        path:   path.join(dir, e.name) + (e.isDirectory() ? '/' : ''),
        isDir:  e.isDirectory(),
        isPath: true,
      }));
    return { ok: true, items };
  } catch { return { ok: true, items: [] }; }
});

// ── IPC: AI generation ────────────────────────────────────────────────────────
ipcMain.handle('generate-draft', async (event, { slug }) => {
  const meta = readSessionMeta(slug);
  if (!meta || !meta.prompt) return { ok: false, error: 'No prompt set' };

  writeJournalEvent({ type: 'ai-draft-started', title: `🤖 TPS Draft: ${meta.name}`, detail: meta.prompt.slice(0, 100), status: 'started' });

  try {
    // Load any existing Q&A answers
    const dir = sessionDir(slug);
    let answers = [];
    const qf = path.join(dir, 'questions.json');
    try { if (fs.existsSync(qf)) answers = JSON.parse(fs.readFileSync(qf, 'utf8')).filter(q => q.answer); } catch {}

    const prompt = buildDraftPrompt(meta.name, meta.prompt, answers);
    const result = await copilotRun(event, prompt);

    // Split into 4 docs — replace Problem doc with a nicely formatted brief of the original prompt
    const docFiles = ['01-problem.md', '02-analysis.md', '03-solution.md', '04-architecture.md'];
    const parts = result.split(/^---DOC---$/m).map(s => s.trim()).filter(Boolean);

    // Build a clean Problem Brief from the original prompt instead of AI-generated one
    const qaLines = answers.length
      ? '\n\n## 💬 Q&A Refinements\n' + answers.map(a => `**Q:** ${a.question}\n**A:** ${a.answer}`).join('\n\n')
      : '';
    const problemBrief = `# 📋 Problem Brief\n\n## Original Prompt\n\n${meta.prompt}${qaLines}\n\n---\n\n_Generated ${new Date().toLocaleString()} · Session: ${meta.name}_`;
    parts[0] = problemBrief;

    docFiles.forEach((f, i) => {
      if (parts[i]) fs.writeFileSync(path.join(dir, f), parts[i]);
    });

    meta.phase = 'draft';
    meta.updatedAt = new Date().toISOString();
    writeSessionMeta(slug, meta);

    writeJournalEvent({ type: 'ai-draft-done', title: `✅ TPS Draft Ready: ${meta.name}`, detail: `Generated ${parts.length} documents`, status: 'completed' });
    return { ok: true, docs: parts };
  } catch (err) {
    writeJournalEvent({ type: 'ai-error', title: `❌ TPS Draft Failed: ${meta.name}`, detail: err.message, status: 'failed' });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('generate-questions', async (event, { slug }) => {
  const meta = readSessionMeta(slug);
  if (!meta || !meta.prompt) return { ok: false, error: 'No prompt set' };

  try {
    const prompt = buildQuestionsPrompt(meta.name, meta.prompt);
    const result = await copilotRun(event, prompt);

    let questions;
    try {
      const fenced = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      const raw = fenced ? fenced[1].trim() : result.trim();
      questions = JSON.parse(raw).questions || JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: `Failed to parse questions JSON: ${e.message}\nRaw: ${result.slice(0, 200)}` };
    }

    // Add answer field
    const withAnswers = questions.map(q => ({ ...q, answer: '' }));
    fs.writeFileSync(path.join(sessionDir(slug), 'questions.json'), JSON.stringify(withAnswers, null, 2));

    meta.phase = 'questionnaire';
    meta.updatedAt = new Date().toISOString();
    writeSessionMeta(slug, meta);

    writeJournalEvent({ type: 'questions-generated', title: `❓ TPS Questions: ${meta.name}`, detail: `${withAnswers.length} questions generated`, status: 'completed' });
    return { ok: true, questions: withAnswers };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-answers', (_, { slug, answers }) => {
  const qf = path.join(sessionDir(slug), 'questions.json');
  fs.writeFileSync(qf, JSON.stringify(answers, null, 2));
  const meta = readSessionMeta(slug);
  if (meta) { meta.updatedAt = new Date().toISOString(); writeSessionMeta(slug, meta); }
  return { ok: true };
});

ipcMain.handle('refine-docs', async (event, { slug }) => {
  const meta = readSessionMeta(slug);
  if (!meta) return { ok: false, error: 'Session not found' };

  const dir = sessionDir(slug);
  const docFiles = ['01-problem.md', '02-analysis.md', '03-solution.md', '04-architecture.md'];
  const currentDocs = docFiles.map(f => {
    const fp = path.join(dir, f);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
  });

  let answers = [];
  const qf = path.join(dir, 'questions.json');
  try { if (fs.existsSync(qf)) answers = JSON.parse(fs.readFileSync(qf, 'utf8')); } catch {}

  writeJournalEvent({ type: 'ai-refine-started', title: `🔄 TPS Refinement: ${meta.name}`, detail: `${answers.filter(a => a.answer).length} answers provided`, status: 'started' });

  try {
    const prompt = buildRefinementPrompt(meta.name, meta.prompt, answers, currentDocs);
    const result = await copilotRun(event, prompt);

    const parts = result.split(/^---DOC---$/m).map(s => s.trim()).filter(Boolean);
    const refinedDir = path.join(dir, 'refined');
    fs.mkdirSync(refinedDir, { recursive: true });

    // Replace problem doc with nicely formatted brief (same as draft)
    const answeredQA = answers.filter(a => a.answer);
    const qaLines = answeredQA.length
      ? '\n\n## 💬 Q&A Refinements\n' + answeredQA.map(a => `**Q:** ${a.question}\n**A:** ${a.answer}`).join('\n\n')
      : '';
    parts[0] = `# 📋 Problem Brief\n\n## Original Prompt\n\n${meta.prompt}${qaLines}\n\n---\n\n_Refined ${new Date().toLocaleString()} · Session: ${meta.name}_`;

    docFiles.forEach((f, i) => {
      if (parts[i]) fs.writeFileSync(path.join(refinedDir, f), parts[i]);
    });

    meta.phase = 'refined';
    meta.updatedAt = new Date().toISOString();
    writeSessionMeta(slug, meta);

    writeJournalEvent({ type: 'ai-refined', title: `✨ TPS Refined: ${meta.name}`, detail: `${parts.length} documents improved`, status: 'completed' });
    return { ok: true, refinedDocs: parts };
  } catch (err) {
    writeJournalEvent({ type: 'ai-error', title: `❌ TPS Refine Failed: ${meta.name}`, detail: err.message, status: 'failed' });
    return { ok: false, error: err.message };
  }
});

// ── IPC: for Workflow Studio integration ──────────────────────────────────────
ipcMain.handle('list-tps-sessions', () => {
  const sessions = loadSessions();
  return sessions.map(s => {
    const meta = readSessionMeta(s.slug);
    return { id: s.id, name: s.name, slug: s.slug, phase: meta?.phase || 'describe' };
  }).filter(s => s.phase !== 'describe'); // only sessions with content
});

ipcMain.handle('get-tps-context', (_, slugs) => {
  // Returns combined markdown context for selected sessions (for use in other apps)
  const sections = [];
  for (const slug of slugs) {
    const meta = readSessionMeta(slug);
    if (!meta) continue;
    const dir = sessionDir(slug);
    const refinedDir = path.join(dir, 'refined');
    const docFiles = ['01-problem.md', '02-analysis.md', '03-solution.md', '04-architecture.md'];

    sections.push(`## TPS Session: ${meta.name}\n`);
    for (const f of docFiles) {
      const refined = path.join(refinedDir, f);
      const original = path.join(dir, f);
      const fp = fs.existsSync(refined) ? refined : (fs.existsSync(original) ? original : null);
      if (fp) sections.push(fs.readFileSync(fp, 'utf8') + '\n');
    }
  }
  return sections.join('\n---\n');
});

ipcMain.handle('get-projects-report', (_, slug) => {
  // Load all git projects
  const projects = [];
  try {
    const gpData = JSON.parse(fs.readFileSync(GIT_PROJECTS_FILE, 'utf8'));
    (gpData.projects || []).forEach(p => {
      const localExists = p.localPath ? fs.existsSync(p.localPath) : false;
      projects.push({ ...p, localExists });
    });
  } catch {}

  // Scan TPS session docs for github.com/org/repo mentions
  const mentioned = new Set();
  if (slug) {
    const dir = sessionDir(slug);
    const refinedDir = path.join(dir, 'refined');
    const docFiles = ['01-problem.md', '02-analysis.md', '03-solution.md', '04-architecture.md',
                      'prompt.md', 'questions.md', 'answers.md'];
    const repoRe = /github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?=\.git|\/|[^a-zA-Z0-9_.-]|$)/g;
    for (const f of docFiles) {
      for (const base of [refinedDir, dir]) {
        const fp = path.join(base, f);
        if (!fs.existsSync(fp)) continue;
        const text = fs.readFileSync(fp, 'utf8');
        let m; while ((m = repoRe.exec(text)) !== null) mentioned.add(m[1]);
      }
    }
  }

  return { ok: true, projects, mentioned: [...mentioned] };
});
ipcMain.handle('open-external', (_, url) => { shell.openExternal(url); return true; });
