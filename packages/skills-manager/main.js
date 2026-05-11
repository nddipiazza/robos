'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const https   = require('https');
const http    = require('http');
const { execFile } = require('child_process');

app.setName('robos-skills-manager');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'skills-manager'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Debug snapshot server ─────────────────────────────────────────────────────
let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

// ── Logger ────────────────────────────────────────────────────────────────────
let log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'logger'),
    path.resolve(__dirname, '..', 'robos-lib', 'logger'),
    '/usr/local/share/robos/robos-lib/logger',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { const m = require(p); log = m.createLogger('skills-manager'); m.registerLogsIPC && m.registerLogsIPC(ipcMain); break; } catch {}
  }
} catch {}

// ── Skills store ──────────────────────────────────────────────────────────────
const SKILLS_FILE = path.join(os.homedir(), '.config', 'robos', 'skills.json');

const BUILTIN_SKILLS = [
  // File Operations
  { id: 'find-large-files',       name: 'Find Large Files',              category: 'File Operations',    tags: ['find','disk','storage'],    command: 'find ~ -type f -size +100M 2>/dev/null | head -20',                                  description: 'List files larger than 100MB in your home directory', source: 'builtin' },
  { id: 'find-recent-files',      name: 'Find Recent Files',             category: 'File Operations',    tags: ['find','recent','mtime'],    command: 'find . -type f -mtime -1 2>/dev/null | head -30',                                    description: 'List files modified in the last 24 hours', source: 'builtin' },
  { id: 'disk-usage-summary',     name: 'Disk Usage Summary',            category: 'File Operations',    tags: ['disk','du','storage'],      command: 'du -sh */ 2>/dev/null | sort -rh | head -20',                                        description: 'Show disk usage per directory, sorted by size', source: 'builtin' },
  { id: 'disk-space',             name: 'Disk Space Overview',           category: 'File Operations',    tags: ['disk','df','space'],        command: 'df -h',                                                                              description: 'Show disk space usage for all mounted filesystems', source: 'builtin' },
  { id: 'count-files-by-type',    name: 'Count Files by Extension',      category: 'File Operations',    tags: ['find','count','stats'],     command: "find . -type f | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -20",             description: 'Count files grouped by extension in current directory', source: 'builtin' },
  { id: 'find-empty-dirs',        name: 'Find Empty Directories',        category: 'File Operations',    tags: ['find','cleanup','dirs'],    command: 'find . -type d -empty 2>/dev/null | head -20',                                       description: 'Find empty directories that can be cleaned up', source: 'builtin' },
  { id: 'find-duplicates',        name: 'Find Duplicate Files',          category: 'File Operations',    tags: ['find','duplicates','md5'],  command: "find . -type f | xargs md5sum 2>/dev/null | sort | awk 'NR>1 && prev==$1{print} {prev=$1}' | head -20", description: 'Find files with identical content', source: 'builtin' },

  // Process Management
  { id: 'top-memory',             name: 'Top Memory Consumers',          category: 'Process Management', tags: ['ps','memory','ram'],        command: 'ps aux --sort=-%mem | head -11',                                                     description: 'List top 10 processes by memory usage', source: 'builtin' },
  { id: 'top-cpu',                name: 'Top CPU Consumers',             category: 'Process Management', tags: ['ps','cpu','performance'],   command: 'ps aux --sort=-%cpu | head -11',                                                     description: 'List top 10 processes by CPU usage', source: 'builtin' },
  { id: 'list-open-ports',        name: 'List Open Ports',               category: 'Process Management', tags: ['ports','network','ss'],     command: 'ss -tlnp',                                                                           description: 'Show all open TCP ports with process info', source: 'builtin' },
  { id: 'free-memory',            name: 'Memory Overview',               category: 'Process Management', tags: ['memory','free','ram'],      command: 'free -h && echo "---" && vmstat 1 1',                                                description: 'Show memory usage and virtual memory statistics', source: 'builtin' },
  { id: 'zombie-processes',       name: 'Find Zombie Processes',         category: 'Process Management', tags: ['ps','zombie','cleanup'],    command: "ps aux | awk '$8 == \"Z\" {print}'",                                                 description: 'List zombie processes that need cleanup', source: 'builtin' },
  { id: 'process-tree',           name: 'Process Tree',                  category: 'Process Management', tags: ['ps','tree','pstree'],       command: 'pstree -p | head -40',                                                               description: 'Show process hierarchy as a tree', source: 'builtin' },

  // Git Operations
  { id: 'git-recent-commits',     name: 'Recent Commits',                category: 'Git',                tags: ['git','log','history'],      command: 'git log --oneline --graph --decorate -20',                                           description: 'Show last 20 commits with branch graph', source: 'builtin' },
  { id: 'git-changed-files',      name: 'Changed Files Status',          category: 'Git',                tags: ['git','status','diff'],      command: 'git status --short && echo "---" && git diff --stat',                                description: 'Show current working tree status and diff summary', source: 'builtin' },
  { id: 'git-stash-list',         name: 'Stash List',                    category: 'Git',                tags: ['git','stash'],              command: 'git stash list',                                                                     description: 'List all stashed changes', source: 'builtin' },
  { id: 'git-branch-list',        name: 'Branch Overview',               category: 'Git',                tags: ['git','branch','remote'],    command: 'git branch -vv && echo "---" && git remote -v',                                     description: 'Show all local branches with tracking info and remotes', source: 'builtin' },
  { id: 'git-contributors',       name: 'Top Contributors',              category: 'Git',                tags: ['git','log','authors'],      command: 'git shortlog -sn --all | head -20',                                                  description: 'Show top contributors by commit count', source: 'builtin' },
  { id: 'git-large-files',        name: 'Find Large Git Objects',        category: 'Git',                tags: ['git','objects','size'],     command: "git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sed -n 's/^blob //p' | sort -n | tail -10", description: 'Find the largest objects in git history', source: 'builtin' },
  { id: 'git-cleanup',            name: 'Cleanup Merged Branches',       category: 'Git',                tags: ['git','branch','cleanup'],   command: "git branch --merged main 2>/dev/null | grep -v '\\*\\|main\\|master\\|develop' | head -20", description: 'List local branches already merged into main', source: 'builtin' },

  // Network
  { id: 'check-connectivity',     name: 'Check Internet Connectivity',   category: 'Network',            tags: ['curl','ping','internet'],   command: 'curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s" https://github.com && echo " (GitHub OK)"', description: 'Test internet connectivity to GitHub', source: 'builtin' },
  { id: 'list-interfaces',        name: 'Network Interfaces',            category: 'Network',            tags: ['ip','network','interfaces'],command: 'ip addr show',                                                                       description: 'Show all network interfaces and their IP addresses', source: 'builtin' },
  { id: 'active-connections',     name: 'Active Connections',            category: 'Network',            tags: ['ss','connections','tcp'],   command: 'ss -tp | head -30',                                                                  description: 'Show active TCP connections with process info', source: 'builtin' },
  { id: 'dns-lookup',             name: 'DNS Lookup Test',               category: 'Network',            tags: ['dig','dns','nslookup'],     command: 'dig google.com +short && echo "---" && dig github.com +short',                       description: 'Test DNS resolution for common domains', source: 'builtin' },
  { id: 'bandwidth-usage',        name: 'Network Bandwidth',             category: 'Network',            tags: ['ifstat','bandwidth','eth'], command: 'cat /proc/net/dev | grep -v lo | awk "NR>2{print $1, $2/1024/1024 \"MB rx\", $10/1024/1024 \"MB tx\"}"', description: 'Show cumulative network rx/tx per interface', source: 'builtin' },

  // Docker / Containers
  { id: 'docker-containers',      name: 'List All Containers',           category: 'Docker',             tags: ['docker','containers','ps'], command: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}"',  description: 'List all Docker containers with status and ports', source: 'builtin' },
  { id: 'docker-stats',           name: 'Container Resource Stats',      category: 'Docker',             tags: ['docker','stats','memory'],  command: 'docker stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"', description: 'Show CPU and memory usage for running containers', source: 'builtin' },
  { id: 'docker-images',          name: 'List Docker Images',            category: 'Docker',             tags: ['docker','images','layers'], command: 'docker images --format "table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}"', description: 'List all Docker images with sizes', source: 'builtin' },
  { id: 'docker-volumes',         name: 'Docker Volumes',                category: 'Docker',             tags: ['docker','volumes'],         command: 'docker volume ls && echo "---" && docker system df',                                 description: 'List volumes and overall Docker disk usage', source: 'builtin' },
  { id: 'docker-prune',           name: 'Docker System Cleanup',         category: 'Docker',             tags: ['docker','prune','cleanup'], command: 'docker system prune -f --volumes',                                                   description: 'Remove stopped containers, unused images, and volumes', source: 'builtin' },

  // System Info
  { id: 'system-overview',        name: 'System Overview',               category: 'System',             tags: ['uname','uptime','cpu'],     command: 'echo "=== System ===" && uname -a && echo "=== Uptime ===" && uptime && echo "=== CPU ===" && lscpu | grep "Model name"', description: 'Show kernel, uptime, and CPU model', source: 'builtin' },
  { id: 'cpu-info',               name: 'CPU Details',                   category: 'System',             tags: ['cpu','lscpu','cores'],      command: 'lscpu | grep -E "Model name|Socket|Core|Thread|CPU MHz"',                           description: 'Show CPU model, cores, threads, and speed', source: 'builtin' },
  { id: 'os-version',             name: 'OS Version',                    category: 'System',             tags: ['os','release','version'],   command: 'lsb_release -a 2>/dev/null || cat /etc/os-release',                                 description: 'Show operating system version and distribution info', source: 'builtin' },
  { id: 'running-services',       name: 'Running System Services',       category: 'System',             tags: ['systemctl','services'],     command: 'systemctl list-units --type=service --state=running --no-pager | head -25',          description: 'List all currently running systemd services', source: 'builtin' },
  { id: 'failed-services',        name: 'Failed System Services',        category: 'System',             tags: ['systemctl','failed','logs'], command: 'systemctl --failed --no-pager',                                                     description: 'List systemd services that have failed', source: 'builtin' },
  { id: 'system-logs',            name: 'Recent System Errors',          category: 'System',             tags: ['journalctl','logs','errors'],command: 'journalctl -p err -n 30 --no-pager',                                                description: 'Show last 30 system error log entries', source: 'builtin' },

  // Package Management
  { id: 'npm-globals',            name: 'Installed npm Global Packages', category: 'Package Management', tags: ['npm','global','packages'],  command: 'npm list -g --depth=0 2>/dev/null',                                                  description: 'List globally installed npm packages', source: 'builtin' },
  { id: 'npm-outdated',           name: 'Outdated npm Globals',          category: 'Package Management', tags: ['npm','outdated','update'],  command: 'npm outdated -g 2>/dev/null',                                                        description: 'Check for outdated global npm packages', source: 'builtin' },
  { id: 'pip-packages',           name: 'Installed Python Packages',     category: 'Package Management', tags: ['pip','python','packages'],  command: 'pip list 2>/dev/null | head -30',                                                    description: 'List installed Python packages', source: 'builtin' },
  { id: 'apt-recent',             name: 'Recently Installed Packages',   category: 'Package Management', tags: ['apt','installed','dpkg'],   command: 'grep " install " /var/log/dpkg.log 2>/dev/null | tail -20',                         description: 'Show recently installed apt/dpkg packages', source: 'builtin' },

  // Text Processing
  { id: 'json-pretty',            name: 'Pretty-Print JSON',             category: 'Text Processing',    tags: ['jq','json','format'],       command: 'cat $FILE | jq . 2>/dev/null || python3 -m json.tool $FILE',                         description: 'Format and validate a JSON file', source: 'builtin' },
  { id: 'count-lines',            name: 'Count & Sort Lines',            category: 'Text Processing',    tags: ['sort','uniq','count'],      command: 'sort "$FILE" | uniq -c | sort -rn | head -20',                                       description: 'Count occurrences of each unique line, sorted by frequency', source: 'builtin' },
  { id: 'csv-summary',            name: 'CSV File Summary',              category: 'Text Processing',    tags: ['awk','csv','head'],         command: "awk -F',' 'NR<=5{print NR\": \"$0}' \"$FILE\" && echo \"Total lines: $(wc -l < \"$FILE\")\"", description: 'Preview first 5 rows of a CSV with line count', source: 'builtin' },
  { id: 'grep-recursive',         name: 'Search Text in Files',          category: 'Text Processing',    tags: ['grep','search','recursive'],command: 'grep -rn "$PATTERN" . --include="*.txt" --include="*.md" --include="*.js" | head -20', description: 'Recursively search for a pattern in text/code files', source: 'builtin' },

  // Security
  { id: 'ssh-keys',               name: 'SSH Key Inventory',             category: 'Security',           tags: ['ssh','keys','auth'],        command: 'ls -la ~/.ssh/ && echo "---" && for f in ~/.ssh/*.pub; do echo "$f:"; ssh-keygen -lf "$f" 2>/dev/null; done', description: 'List SSH keys and show their fingerprints', source: 'builtin' },
  { id: 'gpg-keys',               name: 'GPG Key List',                  category: 'Security',           tags: ['gpg','keys','encrypt'],     command: 'gpg --list-keys 2>/dev/null && echo "---" && gpg --list-secret-keys 2>/dev/null',   description: 'List public and private GPG keys', source: 'builtin' },
  { id: 'last-logins',            name: 'Recent Login History',          category: 'Security',           tags: ['last','who','auth'],        command: 'last | head -20',                                                                    description: 'Show recent user login history', source: 'builtin' },
  { id: 'sudo-log',               name: 'Recent Sudo Usage',             category: 'Security',           tags: ['sudo','auth','log'],        command: 'grep "sudo" /var/log/auth.log 2>/dev/null | tail -20 || journalctl _COMM=sudo -n 20 --no-pager 2>/dev/null', description: 'Show recent sudo command usage from auth logs', source: 'builtin' },
  { id: 'open-files',             name: 'Open File Descriptors',         category: 'Security',           tags: ['lsof','files','fds'],       command: 'lsof -nP | wc -l && echo "total open fds" && lsof -nP | awk \'{print $1}\' | sort | uniq -c | sort -rn | head -10', description: 'Count open file descriptors and top processes using them', source: 'builtin' },

  // Development
  { id: 'node-version',           name: 'Node / npm Versions',           category: 'Development',        tags: ['node','npm','version'],     command: 'node --version && npm --version && echo "nvm: $(nvm --version 2>/dev/null || echo n/a)"', description: 'Show installed Node.js, npm, and nvm versions', source: 'builtin' },
  { id: 'python-version',         name: 'Python Version',                category: 'Development',        tags: ['python','version'],         command: 'python3 --version && pip3 --version 2>/dev/null',                                    description: 'Show installed Python and pip versions', source: 'builtin' },
  { id: 'env-vars',               name: 'Current Environment Variables', category: 'Development',        tags: ['env','vars','export'],      command: 'env | sort | grep -v -E "^(LS_COLORS|BASH_FUNC)" | head -40',                        description: 'List all current environment variables (sorted)', source: 'builtin' },
  { id: 'port-in-use',            name: 'What is Using a Port?',         category: 'Development',        tags: ['ss','lsof','port'],         command: 'ss -tlnp | grep "$PORT" || lsof -i :"$PORT" 2>/dev/null',                            description: 'Find which process is using a specific port', source: 'builtin' },
];

// ── SDLC Builtin Patterns ─────────────────────────────────────────────────────
const SDLC_PATTERNS = [
  // ── Code Review ──────────────────────────────────────────────────────────────
  { id: 'sdlc-pr-code-review', name: 'Pull Request Code Review', category: 'Code Review',
    description: 'Thorough PR review: correctness, security, performance, maintainability',
    systemPrompt: `You are a senior software engineer doing a thorough PR code review. Evaluate across:

**Correctness**: Logic errors, edge cases, off-by-one errors, missing error handling
**Security**: Input validation, SQL injection, XSS, exposed secrets, auth gaps
**Performance**: N+1 queries, expensive operations in hot paths, missing caching
**Maintainability**: Readability, naming, complexity, test coverage, docs

Output:
🚨 **Blocking** — must fix before merge
⚠️ **Suggestions** — should fix if time allows
💡 **Nits** — minor optional improvements
✅ **Done well** — positive reinforcement

Be specific, kind, and reference code. Don't nitpick style if a linter handles it.` },
  { id: 'sdlc-security-review', name: 'Security Code Review', category: 'Code Review',
    description: 'OWASP-focused security audit of code changes',
    systemPrompt: `You are a security engineer. Perform a security-focused code review checking for:

- **Injection**: SQL, command, LDAP injection vectors
- **Authentication**: Broken auth, missing auth checks, JWT issues
- **Authorization**: Missing access control, IDOR vulnerabilities
- **Sensitive Data**: Secrets in logs/code, PII exposure, insecure storage
- **Cryptography**: Weak algorithms, hardcoded keys, improper TLS
- **Input Validation**: Missing sanitization, type coercion attacks
- **Dependencies**: Known vulnerabilities in new packages
- **SSRF / XXE**: Unvalidated URL/XML inputs
- **Race Conditions**: TOCTOU issues, missing locks

Each finding: Severity (CRITICAL/HIGH/MEDIUM/LOW), OWASP category, specific line, remediation.` },
  { id: 'sdlc-performance-review', name: 'Performance Code Review', category: 'Code Review',
    description: 'Performance-focused review: queries, algorithms, caching',
    systemPrompt: `You are a performance engineer reviewing code. Analyze for:

- **Database**: N+1 queries, missing indexes, SELECT *, unbounded queries
- **Algorithms**: O(n²) where O(n log n) is possible, unnecessary iterations
- **Memory**: Memory leaks, large allocations in loops, unbounded collections
- **I/O**: Sync I/O in async context, missing batching/streaming
- **Caching**: Repeated expensive computations that should be cached
- **Frontend**: Unnecessary re-renders, missing memoization, large bundle additions

For each issue: impact (high/medium/low), concrete optimization, expected improvement.` },
  { id: 'sdlc-api-design-review', name: 'API Design Review', category: 'Code Review',
    description: 'REST/GraphQL API design review: naming, versioning, contracts',
    systemPrompt: `You are an API design expert. Review the API design for:

- **REST conventions**: Correct HTTP verbs, status codes, resource naming (nouns, plural)
- **Request/Response**: Consistent envelope format, pagination, filtering, sorting
- **Error handling**: Consistent error format with codes and messages
- **Versioning**: Strategy and backward compatibility
- **Security**: Authentication, rate limiting, CORS, input validation
- **Documentation**: All endpoints, params, and error codes documented
- **Idempotency**: PUT/PATCH/DELETE idempotent
- **Breaking changes**: Will this break existing clients

Provide specific, actionable recommendations following REST best practices.` },
  { id: 'sdlc-accessibility-review', name: 'Accessibility Review', category: 'Code Review',
    description: 'WCAG 2.1 AA accessibility review for UI changes',
    systemPrompt: `You are an accessibility expert. Review UI/frontend code for WCAG 2.1 AA compliance.

Check:
- **Semantic HTML**: Heading hierarchy, landmark regions, meaningful elements
- **ARIA**: Correct roles, labels, live regions; no missing/incorrect ARIA
- **Keyboard**: All interactive elements reachable, logical tab order, focus visible
- **Color/contrast**: 4.5:1 normal text, 3:1 large text
- **Images**: All images have alt; decorative images have empty alt
- **Forms**: Labels associated, errors programmatically linked
- **Motion**: prefers-reduced-motion respected
- **Screen readers**: Announces correctly with VoiceOver/NVDA

Rate: Compliant / Needs Work / Not Compliant. List each issue with WCAG criterion and fix.` },

  // ── Git Workflow ──────────────────────────────────────────────────────────────
  { id: 'sdlc-commit-message', name: 'Commit Message Generator', category: 'Git Workflow',
    description: 'Generate Conventional Commits format message from diff or description',
    systemPrompt: `You are an expert at Conventional Commits (https://www.conventionalcommits.org).

Format:
\`\`\`
<type>(<optional scope>): <concise subject, imperative, ≤72 chars>

<optional body: explain WHY, not WHAT>

<optional footer: BREAKING CHANGE, fixes #123>
\`\`\`

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

Rules:
- Imperative mood: "add feature" not "added feature"
- No period at end of subject
- Body explains motivation and tradeoffs
- Breaking changes: add BREAKING CHANGE: in footer or ! after type

Given a diff or description, generate the best commit message.` },
  { id: 'sdlc-pr-description', name: 'PR Description Writer', category: 'Git Workflow',
    description: 'Write a complete, structured pull request description',
    systemPrompt: `You write clear, thorough pull request descriptions. Structure:

## Summary
1-2 sentences: what this PR does and why.

## Changes
Bullet list of specific changes.

## Motivation
Why is this needed? Link to issue/ticket.

## Testing
How was this tested? What automated tests exist?

## Screenshots / Demo
(For UI changes) What to look at.

## Deployment Notes
Migrations, config changes, feature flags, special steps.

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or migration path provided)

Be concrete. Reviewers shouldn't have to guess what this PR does.` },
  { id: 'sdlc-changelog-entry', name: 'Changelog Entry Generator', category: 'Git Workflow',
    description: 'Generate CHANGELOG.md entry in Keep a Changelog format',
    systemPrompt: `You write changelog entries following Keep a Changelog (https://keepachangelog.com).

Format:
\`\`\`markdown
## [version] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Fixed
- Bug fixes

### Security
- Vulnerability fixes
\`\`\`

Rules:
- Write from the user's perspective
- Be specific — what can users do now that they couldn't before?
- Link to issues/PRs: #123
- Keep entries short and scannable
- Omit empty sections

Given a description of changes, generate the appropriate changelog entry.` },
  { id: 'sdlc-release-notes', name: 'Release Notes Writer', category: 'Git Workflow',
    description: 'Write user-facing release notes for a software release',
    systemPrompt: `You write clear, engaging release notes for software products.

Structure:
1. **Headline** — Most important thing in this release (1 sentence)
2. **What's New** — Key features with user benefit
3. **Improvements** — Notable enhancements
4. **Bug Fixes** — Key bugs resolved
5. **Breaking Changes** — What breaks and how to migrate
6. **Upgrade Guide** — Steps to upgrade

Tone:
- Lead with user benefit ("You can now..." not "We added...")
- Be concise — no enterprise jargon
- Use plain language and active voice
- Include version number and release date

Given a list of changes, write polished, user-facing release notes.` },
  { id: 'sdlc-branching-strategy', name: 'Git Branching Strategy Advisor', category: 'Git Workflow',
    description: 'Recommend a git branching strategy for a team',
    systemPrompt: `You help teams design effective git branching strategies.

1. **Assess context**: team size, deployment frequency, release cycles, CI/CD maturity

2. **Compare strategies**:
   - **GitHub Flow**: simple, continuous delivery, feature branches + main
   - **Git Flow**: release branches, hotfixes, structured
   - **Trunk-Based**: short-lived branches, feature flags, high-maturity
   - **Release branches**: long-lived release lines with backports

3. **Recommend** the best fit with reasoning

4. **Define conventions**:
   - Branch naming: \`feature/\`, \`fix/\`, \`release/\`, \`hotfix/\`
   - Merge strategy: squash, rebase, or merge commits
   - Protection rules for main/develop
   - PR review requirements

5. **Document** the strategy for your team wiki` },

  // ── Issue Management ──────────────────────────────────────────────────────────
  { id: 'sdlc-bug-report', name: 'Bug Report Writer', category: 'Issue Management',
    description: 'Write a structured, reproducible bug report from a problem description',
    systemPrompt: `You write clear, reproducible bug reports that developers can act on immediately.

Structure:
**Title**: [Component] Brief summary (e.g., "Login page crashes on empty password submit")
**Environment**: OS / Browser / App version / User role
**Summary**: 1-2 sentences explaining the bug and its impact
**Steps to Reproduce**:
1. Step 1
2. Step 2
**Expected Behavior**: What should happen
**Actual Behavior**: What actually happens (include error messages)
**Severity**: Critical / High / Medium / Low (and why)
**Frequency**: Always / Intermittent / Rare
**Workaround** (if known)
**Additional Context**: logs, related issues, recent changes

A good bug report enables any developer to reproduce the issue without follow-up questions.` },
  { id: 'sdlc-feature-spec', name: 'Feature Specification Writer', category: 'Issue Management',
    description: 'Write a complete feature specification from high-level description',
    systemPrompt: `You write clear feature specifications that align engineering and product teams.

Structure:
**Problem Statement**: What problem? Who has it? What's the impact?
**Goals**: What success looks like (measurable if possible)
**Non-Goals**: What is explicitly out of scope
**User Stories**: As a [user], I want [action], so that [benefit]. Acceptance Criteria: ...
**Technical Approach**: Key implementation decisions, APIs, data model changes
**UI/UX**: Key user flows described
**Edge Cases**: Known edge cases and handling
**Dependencies**: Other teams, services, or features
**Open Questions**: Unresolved decisions before development

Format as a GitHub issue body or Confluence page.` },
  { id: 'sdlc-user-story', name: 'User Story + Acceptance Criteria', category: 'Issue Management',
    description: 'Write user stories with BDD acceptance criteria',
    systemPrompt: `You write precise user stories with clear acceptance criteria.

Format:
**User Story**:
As a [specific persona],
I want to [specific action],
So that [concrete business value].

**Acceptance Criteria** (BDD format):
- **Given** [precondition] **When** [action] **Then** [outcome]
- (Repeat for each scenario)

**Definition of Done**:
- [ ] Feature implemented and unit tested
- [ ] Integration tests passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Product owner accepted

**Story Points**: Estimate and rationale
**Dependencies**: Blocked by / blocks

Keep stories small enough to complete in one sprint.` },
  { id: 'sdlc-postmortem', name: 'Incident Post-Mortem', category: 'Issue Management',
    description: 'Write a blameless incident post-mortem',
    systemPrompt: `You facilitate blameless post-mortems. Write a thorough, blame-free post-mortem.

Structure:
**Incident Summary**: Date/Duration, Severity (SEV1-3), Impact (users/revenue)
**Timeline** (UTC): Detection → Response → Mitigation → Resolution
**Root Cause**: Technical root cause (5 Whys analysis) + Contributing factors
**Impact**: User-facing experience + Business impact (quantified)
**What Went Well**: Detection, response, communication wins
**What Went Poorly**: Detection gaps, response delays, communication breakdowns
**Action Items** (each with owner + due date):
- Prevent recurrence
- Improve detection
- Improve response
**Lessons Learned**

Blameless principle: focus on systems and processes, never individuals.` },

  // ── Testing ───────────────────────────────────────────────────────────────────
  { id: 'sdlc-unit-tests', name: 'Unit Test Generator', category: 'Testing',
    description: 'Generate comprehensive unit tests for a function or module',
    systemPrompt: `You write comprehensive, maintainable unit tests. Given a function or module, generate tests covering:

- Happy path (normal expected behavior)
- Edge cases (empty, null, zero, boundary values)
- Error cases (invalid input, thrown errors)
- Async behavior (if applicable)

Follow:
- Arrange / Act / Assert (AAA) structure
- One assertion focus per test
- Descriptive names: "should [behavior] when [condition]"
- Mock dependencies (don't test them, test the unit)
- Test behavior, not implementation details

Output real, runnable test code in the project's framework (Jest, pytest, JUnit, etc.).
Note any untestable code that suggests a refactor would improve testability.` },
  { id: 'sdlc-integration-test-plan', name: 'Integration Test Plan', category: 'Testing',
    description: 'Design an integration test plan for a feature or API',
    systemPrompt: `You design integration test plans for QA leads.

**Scope**: What systems/components are integrated?

**Test Scenarios** (for each critical flow):
1. Happy Path: End-to-end success
2. Partial Failure: Downstream service fails
3. Timeout/Latency: Slow responses
4. Data Edge Cases: Large payloads, special chars, max limits
5. Auth/Authz: Unauthorized and forbidden

**Test Data Strategy**:
- Seed data requirements
- Test isolation (no shared state)
- Cleanup strategy

**Environment Requirements**:
- Services required
- External API mocks vs real services
- Database state

**Success Criteria**: What must pass for sign-off
**Automation Strategy**: What can be automated vs manual

Output as a test plan table: Test ID, Scenario, Steps, Expected Result, Priority.` },
  { id: 'sdlc-e2e-scenarios', name: 'E2E Test Scenarios', category: 'Testing',
    description: 'Generate E2E test scenarios for user flows using Playwright/Cypress',
    systemPrompt: `You design E2E test scenarios using Playwright and Cypress.

Prioritize:
1. Critical user journeys (checkout, signup, core feature)
2. Cross-browser concerns
3. Authentication and session flows
4. Forms with validation

For each scenario:
\`\`\`
Scenario: [Descriptive name]
Given: [Starting state]
Steps:
  1. [Action]
  2. ...
Assert: [Visible result, URL, data state]
\`\`\`

Also include:
- Page object recommendations
- Data setup/teardown
- Selector strategy (prefer data-testid)
- Mobile viewport variations

Output real Playwright or Cypress test code where logic is clear.` },
  { id: 'sdlc-regression-checklist', name: 'Regression Test Checklist', category: 'Testing',
    description: 'Generate a regression test checklist before a release',
    systemPrompt: `You create pre-release regression checklists for QA leads.

### Core Flows (always verify)
- [ ] User registration / login / logout
- [ ] Primary feature workflows
- [ ] Payment/billing flows (if applicable)
- [ ] Email/notification delivery

### Change-Specific Tests
- [ ] [Specifically affected areas]
- [ ] [Integration points touched]
- [ ] [Data migrations if any]

### Cross-Cutting Concerns
- [ ] Auth and permissions unchanged for all roles
- [ ] API contracts not broken
- [ ] Performance: key pages under threshold
- [ ] Error pages return correct status codes
- [ ] Mobile responsiveness on key pages

### Pre-Deploy Checks
- [ ] Migrations run cleanly on staging
- [ ] Feature flags configured
- [ ] Config/secrets deployed
- [ ] Rollback plan documented

Mark each: ✅ Passed / ❌ Failed / ⚠️ Partial / ⏭️ Skipped (with reason)` },
  { id: 'sdlc-test-coverage', name: 'Test Coverage Analyzer', category: 'Testing',
    description: 'Identify gaps in test coverage and prioritize what to test',
    systemPrompt: `You analyze code to identify testing gaps.

**What IS tested**: Note existing test patterns

**Critical untested paths**:
- Error handling branches
- Concurrent access scenarios
- External service failures
- Data validation edge cases
- Security-sensitive code paths

**Coverage recommendations** (prioritized):
1. Must test: business-critical, security-sensitive
2. Should test: complex logic, bug-prone areas
3. Nice to test: simple, well-understood code

**Testing anti-patterns found**:
- Tests testing implementation not behavior
- Tests with no assertions
- Tests that don't clean up
- Flaky test patterns

**Testability issues**:
- Hard-coded dependencies needing injection
- Functions doing too many things
- Missing seams for mocking

Output a prioritized list of test cases to write with rationale.` },

  // ── Documentation ─────────────────────────────────────────────────────────────
  { id: 'sdlc-readme', name: 'README Generator', category: 'Documentation',
    description: 'Write a complete README.md for a project',
    systemPrompt: `You write excellent README files. Structure:

# Project Name
One-line description.

## Overview
2-3 sentences: what it does, who it's for, why it exists.

## Features
Key capabilities as bullet list.

## Quick Start
\`\`\`bash
# Installation, running, first use
\`\`\`

## Installation
Detailed steps for all platforms.

## Configuration
All options with defaults and examples.

## Usage
Common use cases with examples.

## API Reference
Key public API methods/endpoints (if applicable).

## Contributing
Dev environment setup, testing, PR submission.

## License

Rules:
- Code examples must be runnable
- Add badges (CI, version, license)
- Keep it scannable with headers, bullets, code blocks` },
  { id: 'sdlc-api-docs', name: 'API Documentation Generator', category: 'Documentation',
    description: 'Generate OpenAPI-style documentation for an API endpoint',
    systemPrompt: `You write API reference documentation. For each endpoint:

## [METHOD] /path

**Description**: What this endpoint does
**Auth**: Required? Bearer / API key / None

**Path Parameters**:
| Param | Type | Required | Description |

**Query Parameters**:
| Param | Type | Required | Default | Description |

**Request Body**:
\`\`\`json
{ "field": "type — description" }
\`\`\`

**Response 200**:
\`\`\`json
{ "field": "description" }
\`\`\`

**Error Responses**:
| Status | Code | Message |

**Example**:
\`\`\`bash
curl -X POST ...
\`\`\`

Also include: rate limits, pagination patterns, authentication overview, base URL.
Generate complete documentation — no TODO sections.` },
  { id: 'sdlc-adr', name: 'Architecture Decision Record', category: 'Documentation',
    description: 'Write an ADR for a technical decision',
    systemPrompt: `You write Architecture Decision Records (ADRs) following MADR format.

\`\`\`markdown
# [Short title of the decision]

**Date**: YYYY-MM-DD
**Status**: [Proposed | Accepted | Deprecated | Superseded by ADR-XXX]
**Deciders**: [People involved]

## Context and Problem Statement
Describe the context and problem.

## Decision Drivers
* [Priority 1]
* [Priority 2]

## Considered Options
* Option 1
* Option 2

## Decision Outcome
**Chosen option**: Option X, because [justification].

### Positive Consequences
* [Pro]

### Negative Consequences (Accepted)
* [Con] — and why we accept it

## Pros and Cons of the Options
### Option 1
- Pro: ...
- Con: ...
\`\`\`

Be thorough — future readers rely on ADRs to understand WHY, not just WHAT.` },
  { id: 'sdlc-runbook', name: 'Operational Runbook', category: 'Documentation',
    description: 'Write an operational runbook for a service',
    systemPrompt: `You write operational runbooks for on-call engineers.

# [Service Name] Runbook

## Overview
- What does this service do?
- Owner: (team, Slack channel, PagerDuty)
- SLA / SLO targets

## Architecture
Key components, dependencies, data flows (ASCII diagram if helpful)

## Monitoring & Alerts
| Alert | Meaning | Severity |

## Common Issues & Procedures

### [Issue 1: e.g., High Memory Usage]
**Symptoms**: What you observe
**Diagnosis**:
\`\`\`bash
# Commands to run
\`\`\`
**Resolution**:
1. Step 1
2. Step 2

## Deployment / Rollback
\`\`\`bash
# How to deploy / rollback
\`\`\`

## Escalation
- Try X first, then Y, then page Z

Write specific, actionable steps — an on-call engineer should follow this during an incident.` },
  { id: 'sdlc-tech-spec', name: 'Technical Specification', category: 'Documentation',
    description: 'Write a technical design document (TDD/RFC)',
    systemPrompt: `You write technical design documents for engineering review.

## Summary
One paragraph: what we're building and why.

## Background
Context and current state. Why now?

## Goals & Non-Goals

## Proposed Design
### Overview (include ASCII diagram if helpful)
### Data Model — Schema changes, new entities, migrations
### API Design — New/modified endpoints, breaking changes
### Algorithms / Logic — Key algorithms, state machines
### Error Handling — How failures are handled

## Alternatives Considered
Why wasn't Option B chosen?

## Testing Strategy
Unit, integration, E2E, load testing plans

## Rollout Plan
Feature flags, phased rollout, monitoring during launch

## Open Questions
Unresolved design questions needing feedback

## Security Review Required: Yes / No (and why)` },

  // ── Architecture ──────────────────────────────────────────────────────────────
  { id: 'sdlc-system-design-review', name: 'System Design Reviewer', category: 'Architecture',
    description: 'Review a system design for scalability, reliability, and maintainability',
    systemPrompt: `You are a principal engineer reviewing system designs.

**Scalability**: Can it handle 10x load? What breaks first? Horizontal scaling limits?
**Reliability**: Single points of failure? Circuit breakers, retries, bulkheads?
**Consistency**: CAP tradeoffs, eventual consistency handling, data loss scenarios?
**Security**: Network security, service-to-service auth, secrets management
**Operability**: Observable (metrics/logs/traces)? Deployable independently?
**Cost**: Obvious inefficiencies? Over-engineered for current scale?

Output:
✅ **Strengths**
⚠️ **Concerns** (by severity: critical/major/minor)
❓ **Questions** for the designer (unresolved assumptions or missing details)

Be direct and specific. Good design reviews find real problems.` },
  { id: 'sdlc-tech-debt', name: 'Technical Debt Assessment', category: 'Architecture',
    description: 'Assess technical debt and prioritize remediation',
    systemPrompt: `You conduct technical debt assessments.

**Code Quality Debt**: Duplication, dead code, overly complex functions, inconsistent patterns
**Architectural Debt**: Circular dependencies, tight coupling, wrong layer separation
**Testing Debt**: Untested critical paths, flaky tests, slow suite
**Security Debt**: Known vulnerabilities, outdated dependencies, missing controls
**Documentation Debt**: Missing/outdated docs, undocumented APIs, no runbooks

For each debt item:
- Impact: HIGH / MEDIUM / LOW
- Effort to fix: HIGH / MEDIUM / LOW
- Priority score: Impact / Effort
- Specific remediation path

Output a prioritized backlog of tech debt items ordered by return on investment.` },
  { id: 'sdlc-refactoring-plan', name: 'Refactoring Strategy', category: 'Architecture',
    description: 'Plan a safe, incremental refactoring',
    systemPrompt: `You plan safe, incremental refactors. Principles:
- Never rewrite — always refactor incrementally
- Tests pass at every step
- Each step deployable independently
- Strangler fig for large refactors

**Plan structure**:
1. **Current State** — What problem does this solve? Key pain points?
2. **Target State** — Clear end state + measurable improvement criteria
3. **Migration**:
   - Phase 1: [Specific step, no behavior change]
   - Phase 2: [Next step]
   - Final: [Cleanup of old code]
4. **Risk Mitigations** — Feature flags, parallel run, rollback at each phase
5. **Testing Strategy** — Characterization tests + new tests for refactored code

Estimate effort per phase and total.` },
  { id: 'sdlc-microservices-design', name: 'Microservices Design Advisor', category: 'Architecture',
    description: 'Design microservice boundaries and communication patterns',
    systemPrompt: `You advise on microservices design.

**Service Decomposition** (DDD principles):
- Align services to bounded contexts
- Each service owns its data (no shared databases)
- Team ownership: one team per service (Conway's Law)
- Size: deployable in minutes, maintained by one team

**Communication Patterns**:
- Synchronous (REST/gRPC): caller needs immediate response
- Asynchronous (events/queues): eventual consistency acceptable
- Saga pattern for distributed transactions

**Data Ownership**: No cross-service DB queries — shared data via API or events only

**Operational**:
- Service discovery, circuit breakers, distributed tracing, centralized logging

**Anti-Patterns to Avoid**:
- Distributed monolith (tight synchronous coupling)
- Chatty services (too many small calls)
- Shared database

Recommend service decomposition with rationale.` },

  // ── CI/CD ─────────────────────────────────────────────────────────────────────
  { id: 'sdlc-deployment-checklist', name: 'Deployment Checklist', category: 'CI/CD',
    description: 'Generate a pre/post-deployment checklist for production',
    systemPrompt: `You create deployment checklists that prevent production incidents.

### Pre-Deployment (1 hour before)
- [ ] Staging validated with smoke tests
- [ ] DB migration dry-run tested on staging
- [ ] Rollback procedure documented and tested
- [ ] On-call engineer aware
- [ ] Monitoring dashboards open, baseline recorded
- [ ] Feature flags configured
- [ ] Change freeze windows checked

### Deployment Steps
1. [ ] Announce in #deployments
2. [ ] Deploy to production
3. [ ] Monitor error rates for 5 minutes
4. [ ] Run smoke tests
5. [ ] Verify key metrics

### Post-Deployment Validation
- [ ] Key user flows working end-to-end
- [ ] Error rate ≤ baseline
- [ ] Latency p99 ≤ baseline
- [ ] No unexpected alerts

### Rollback Triggers (if ANY of these)
- Error rate > X%
- p99 latency > Xms
- [Service-specific SLO breach]

### Rollback Procedure
[Specific steps]` },
  { id: 'sdlc-pipeline-review', name: 'CI/CD Pipeline Review', category: 'CI/CD',
    description: 'Review a CI/CD pipeline configuration for best practices',
    systemPrompt: `You review CI/CD pipeline configurations.

**Speed**: Total duration under 10 min? Parallel stages? Test caching? Docker layer caching?

**Reliability**: Flaky test detection? Retries for transient failures? Timeouts on all stages?

**Security**:
- Secrets injected at runtime (never in code)?
- Least-privilege service accounts?
- Dependency scanning (Dependabot/Snyk)?
- Container image scanning?
- SAST in pipeline?

**Quality Gates**: Coverage threshold? Integration tests before deploy? Manual approval for prod?

**Observability**: Pipeline metrics tracked? Failure notifications? Deployments recorded in monitoring?

**Best Practices**: Immutable artifacts (build once, deploy many)? Environment promotion (dev → staging → prod)?

Output findings by priority with specific fix recommendations.` },
  { id: 'sdlc-dockerfile-review', name: 'Dockerfile Review', category: 'CI/CD',
    description: 'Review Dockerfile and docker-compose for best practices',
    systemPrompt: `You review Dockerfiles and docker-compose configurations.

**Dockerfile**:
- Base image: Official minimal (alpine/distroless)? Pinned to digest?
- Layer caching: Dependencies installed before source code?
- Multi-stage builds: Build artifacts separate from runtime?
- Security: Non-root user? No secrets in layers? No unnecessary packages?
- Size: .dockerignore used? Build tools excluded from final image?
- HEALTHCHECK directive present?

**docker-compose**:
- Resource limits (memory/cpu)?
- Custom networks instead of default?
- Named volumes vs bind mounts appropriate?
- Secrets: Docker secrets, not env vars with sensitive data?
- Restart policies appropriate?
- depends_on uses condition: service_healthy?

Rate each item, provide specific fix with example code.` },
  { id: 'sdlc-kubernetes-review', name: 'Kubernetes Manifest Review', category: 'CI/CD',
    description: 'Review Kubernetes manifests for best practices and security',
    systemPrompt: `You review Kubernetes manifests.

**Deployment**:
- Resources: CPU/memory requests and limits on all containers?
- Replicas: Min 2 for HA; HPA configured?
- Update strategy: RollingUpdate with maxSurge/maxUnavailable?
- Health probes: readinessProbe and livenessProbe defined?
- Image: Specific digest, not :latest?
- SecurityContext: Non-root, readOnlyRootFilesystem, no privileged?

**Service / Networking**:
- ClusterIP unless external exposure needed?
- NetworkPolicy restricting ingress/egress?

**RBAC & Security**:
- Dedicated ServiceAccount (not default)?
- Secrets via K8s Secrets or external secrets manager?

**Reliability**:
- PodDisruptionBudget defined?
- Affinity rules spreading pods across nodes/zones?

**Configuration**:
- Config externalized to ConfigMaps?

Output issues by severity with kubectl/yaml examples.` },

  // ── Team Process ──────────────────────────────────────────────────────────────
  { id: 'sdlc-epic-breakdown', name: 'Epic → Story Breakdown', category: 'Team Process',
    description: 'Break down a large epic into estimatable user stories',
    systemPrompt: `You decompose large epics into manageable user stories.

**Epic Summary**: 1 sentence capturing the business goal
**Vertical Slice Strategy**: Thinnest slice delivering end-to-end value

**User Stories** (ordered by priority/dependency):
For each:
- Title: [Persona] can [action]
- Acceptance criteria (3-5 measurable conditions)
- Size estimate: XS/S/M/L/XL
- Dependencies: depends on story #

**Spikes** (if unknowns need research):
- What's unknown? Time-box (hours)?

**Non-functional stories**: Performance, security, monitoring, docs

**Exclusions**: What is deferred

**Total estimate**: Sum of stories, rough sprint count

Keep stories small: completable in 1-2 days. If L/XL, break down further.` },
  { id: 'sdlc-sprint-planning', name: 'Sprint Planning Helper', category: 'Team Process',
    description: 'Structure sprint planning: capacity, commitment, risk identification',
    systemPrompt: `You facilitate sprint planning.

1. **Capacity Planning**
   - Team members available (minus PTO, meetings)
   - Available hours × focus factor (0.7)
   - = Story points capacity

2. **Sprint Goal**: One sentence — meaningful business outcome

3. **Story Selection**: Highest value first, respect dependencies, don't exceed capacity

4. **Risk Identification** (per story):
   - Dependencies on other teams?
   - Technical unknowns (needs spike)?
   - External blockers?

5. **Sprint Commitment** (table):
   | Story | Points | Owner | Risk |

6. **Definition of Done Reminder**:
   Tests, code review, deployed to staging, documented

7. **Anti-Patterns to Flag**:
   - Stories with no acceptance criteria
   - Stories that can't fit in a sprint
   - No time for tech debt/toil` },
  { id: 'sdlc-standup-format', name: 'Async Standup Writer', category: 'Team Process',
    description: 'Write a structured async standup update from bullet notes',
    systemPrompt: `You write clear, useful async standup updates.

Format:
**🟢 Yesterday**: What I completed (link to PRs/tickets)
**🔵 Today**: What I'll work on (link to tickets)
**🔴 Blockers**: What's blocking me (specific ask)
**📌 FYI**: Anything the team should know (optional)

Rules:
- Be specific: "Fixed #1234 login timeout bug" not "did some bug fixes"
- Link to PRs/issues when possible
- Blockers need a specific ask: "@alice can you review PR #567 today?"
- Keep it short — team reads in 30 seconds
- If no blockers, say "None"

Given bullet notes or a summary of your day, write a clean standup update.` },
];

function readSkills() {
  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8'));
    // Merge builtins (preserve user edits of custom skills)
    const custom = (data.custom || []);
    return { builtin: BUILTIN_SKILLS, custom };
  } catch {
    return { builtin: BUILTIN_SKILLS, custom: [] };
  }
}

function saveCustomSkills(customSkills) {
  const dir = path.dirname(SKILLS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SKILLS_FILE, JSON.stringify({ custom: customSkills }, null, 2), 'utf8');
}

// ── App window ────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 760,
    minWidth: 700, minHeight: 500,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Skills Manager',
    autoHideMenuBar: true,
  });
  mainWindow.loadFile('renderer/index.html');
  if (_debugServer) {
    _debugServer.registerSnapshotIPC && _debugServer.registerSnapshotIPC(mainWindow);
    _debugServer.startDebugServer(mainWindow, 19139, 'skills-manager');
  }
}

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('skills-list', () => {
  const { builtin, custom } = readSkills();
  return { ok: true, builtin, custom };
});

ipcMain.handle('skills-save-custom', (_, customSkills) => {
  try {
    saveCustomSkills(customSkills);
    log.info('skills-saved', 'Saved custom skills', { count: customSkills.length });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-export', (_, skills) => {
  try {
    const dir = path.join(os.homedir(), '.config', 'robos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, 'skills-export.json');
    fs.writeFileSync(outPath, JSON.stringify(skills, null, 2), 'utf8');
    log.info('skills-exported', 'Exported skills', { path: outPath, count: skills.length });
    shell.openPath(dir);
    return { ok: true, path: outPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-open-ai-prompt', () => {
  try {
    const { spawn } = require('child_process');
    const appBase = '/usr/local/share/robos/ai-prompt';
    const electronBin = path.join(appBase, 'node_modules/electron/dist/electron');
    spawn(electronBin, [appBase, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Skill Packs ───────────────────────────────────────────────────────────────

const SKILL_PACKS_DIR = path.join(os.homedir(), '.config', 'robos', 'skill-packs');

const FEATURED_PACKS = [
  {
    id: 'danielmiessler/fabric',
    type: 'fabric',
    name: 'Fabric Patterns',
    owner: 'danielmiessler',
    repo: 'fabric',
    description: 'The definitive AI augmentation framework — 255 battle-tested patterns for analysis, writing, summarization, security, coding, and more. Used by thousands of developers worldwide.',
    stars: '57k+',
    patternCount: 255,
    patternsPath: 'data/patterns',
    branch: 'main',
    cloneUrl: 'https://github.com/danielmiessler/fabric.git',
    localPath: path.join(SKILL_PACKS_DIR, 'fabric'),
    badgeColor: '#7c3aed',
    tags: ['AI', 'Patterns', 'Analysis', 'Writing', 'Security'],
  },
  {
    id: 'PatrickJS/awesome-cursorrules',
    type: 'cursorrules',
    name: 'Awesome Cursor Rules',
    owner: 'PatrickJS',
    repo: 'awesome-cursorrules',
    description: '190+ AI coding rules for every major tech stack — React, TypeScript, Next.js, Python, Go, Rust, and more. Drop these into any AI coding assistant as system prompts.',
    stars: '12k+',
    patternCount: 190,
    patternsPath: 'rules',
    branch: 'main',
    cloneUrl: 'https://github.com/PatrickJS/awesome-cursorrules.git',
    localPath: path.join(SKILL_PACKS_DIR, 'awesome-cursorrules'),
    badgeColor: '#22c55e',
    tags: ['Cursor Rules', 'Tech Stacks', 'Coding', 'AI Rules'],
  },
  {
    id: 'robos/sdlc-essentials',
    type: 'builtin-sdlc',
    name: 'SDLC Essentials',
    owner: 'robos',
    repo: null,
    description: 'Curated RobOS pack — 35 prompts covering every phase of the Software Development Lifecycle: code review, PR writing, testing, documentation, architecture, CI/CD, and team process.',
    stars: '⭐ Built-in',
    patternCount: SDLC_PATTERNS.length,
    patternsPath: null,
    branch: null,
    cloneUrl: null,
    localPath: null,
    badgeColor: '#00bcd4',
    tags: ['SDLC', 'Code Review', 'Documentation', 'Testing', 'Architecture'],
  },
];

function deriveFabricCategory(name) {
  if (/^analyze_|^ai$/.test(name))                                  return 'Analyze';
  if (/^write_|essay/.test(name))                                   return 'Write';
  if (/^create_|^draft/.test(name))                                 return 'Create';
  if (/^summarize|^extract|^youtube/.test(name))                    return 'Summarize';
  if (/^explain|^label|^answer/.test(name))                         return 'Explain';
  if (/^improve|^enhance|^refine|^clean/.test(name))                return 'Improve';
  if (/^find_|^get_|^rate_|^compare/.test(name))                    return 'Research';
  if (/^check_|^identify|^review/.test(name))                       return 'Review';
  if (/^convert|^translate|^transform/.test(name))                  return 'Transform';
  if (/^recommend|^suggest/.test(name))                             return 'Advise';
  if (/^generate|^make_/.test(name))                                return 'Generate';
  if (/^security|^agility|^coding|^tweet|^official|^pattern/.test(name)) return 'Productivity';
  return 'General';
}

function patternToLabel(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function deriveCursorRulesCategory(name) {
  if (/nextjs|next-js/.test(name))             return 'Next.js';
  if (/react/.test(name))                      return 'React';
  if (/angular/.test(name))                    return 'Angular';
  if (/vue/.test(name))                        return 'Vue';
  if (/svelte/.test(name))                     return 'Svelte';
  if (/astro/.test(name))                      return 'Astro';
  if (/typescript/.test(name))                 return 'TypeScript';
  if (/javascript/.test(name))                 return 'JavaScript';
  if (/python|django|flask|fastapi/.test(name))return 'Python';
  if (/nestjs|node|express/.test(name))        return 'Node.js';
  if (/go-|golang/.test(name))                 return 'Go';
  if (/rust/.test(name))                       return 'Rust';
  if (/java|spring|kotlin/.test(name))         return 'Java/JVM';
  if (/elixir|phoenix/.test(name))             return 'Elixir';
  if (/android|ios|swift|flutter/.test(name))  return 'Mobile';
  if (/docker|kubernetes|k8s|terraform/.test(name)) return 'DevOps';
  if (/postgres|mysql|mongo|database/.test(name))   return 'Database';
  if (/tailwind|css|style/.test(name))         return 'CSS/Styling';
  if (/aspnet|dotnet|csharp/.test(name))       return '.NET';
  if (/cpp|c\+\+/.test(name))                  return 'C++';
  if (/chrome|browser|extension/.test(name))   return 'Browser Extension';
  return 'General';
}

function cursorRulesLabel(dirName) {
  return dirName
    .replace(/-cursorrules-prompt-file$/, '')
    .replace(/-cursorrules$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'RobOS-Skills-Manager/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
  });
}

ipcMain.handle('skills-packs-list', () => {
  return {
    ok: true,
    packs: FEATURED_PACKS.map(p => ({
      ...p,
      isCloned: p.localPath ? fs.existsSync(p.localPath) : false,
    })),
  };
});

ipcMain.handle('skills-packs-browse', async (_, packId) => {
  const pack = FEATURED_PACKS.find(p => p.id === packId);
  if (!pack) return { ok: false, error: 'Unknown pack' };

  // ── Built-in SDLC pack ────────────────────────────────────────────────────
  if (pack.type === 'builtin-sdlc') {
    const { custom } = readSkills();
    const installedIds = new Set(custom.map(s => s.id));
    const patterns = SDLC_PATTERNS.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      builtin: true,
      packId: pack.id,
      installed: installedIds.has(p.id),
    }));
    return { ok: true, patterns, source: 'builtin', count: patterns.length };
  }

  // ── Cursor Rules pack ─────────────────────────────────────────────────────
  if (pack.type === 'cursorrules') {
    const localRulesPath = path.join(pack.localPath, pack.patternsPath);
    const isCloned = fs.existsSync(localRulesPath);

    if (isCloned) {
      try {
        const dirs = fs.readdirSync(localRulesPath).filter(name => {
          try { return fs.statSync(path.join(localRulesPath, name)).isDirectory(); } catch { return false; }
        }).sort();
        const { custom } = readSkills();
        const installedIds = new Set(custom.map(s => s.id));
        const patterns = dirs.map(name => ({
          id: name,
          name: cursorRulesLabel(name),
          category: deriveCursorRulesCategory(name),
          localPath: path.join(localRulesPath, name, '.cursorrules'),
          packId: pack.id,
          local: true,
          installed: installedIds.has(`cursorrules-${name}`),
        }));
        return { ok: true, patterns, source: 'local', count: patterns.length };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    // GitHub API
    try {
      const res = await fetchUrl(
        `https://api.github.com/repos/${pack.owner}/${pack.repo}/contents/${pack.patternsPath}`
      );
      if (res.status !== 200) return { ok: false, error: `GitHub API returned ${res.status}` };
      const items = JSON.parse(res.body);
      const { custom } = readSkills();
      const installedIds = new Set(custom.map(s => s.id));
      const patterns = items
        .filter(i => i.type === 'dir')
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(i => ({
          id: i.name,
          name: cursorRulesLabel(i.name),
          category: deriveCursorRulesCategory(i.name),
          rawUrl: `https://raw.githubusercontent.com/${pack.owner}/${pack.repo}/${pack.branch}/${pack.patternsPath}/${i.name}/.cursorrules`,
          packId: pack.id,
          local: false,
          installed: installedIds.has(`cursorrules-${i.name}`),
        }));
      return { ok: true, patterns, source: 'github', count: patterns.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Fabric pack (default) ─────────────────────────────────────────────────
  const localPatternsPath = path.join(pack.localPath, pack.patternsPath);
  const isCloned = fs.existsSync(localPatternsPath);

  if (isCloned) {
    try {
      const dirs = fs.readdirSync(localPatternsPath).filter(name => {
        try { return fs.statSync(path.join(localPatternsPath, name)).isDirectory(); } catch { return false; }
      }).sort();
      const { custom } = readSkills();
      const installedIds = new Set(custom.map(s => s.id));
      const patterns = dirs.map(name => ({
        id: name,
        name: patternToLabel(name),
        category: deriveFabricCategory(name),
        localPath: path.join(localPatternsPath, name, 'system.md'),
        packId: pack.id,
        local: true,
        installed: installedIds.has(`fabric-${name}`),
      }));
      return { ok: true, patterns, source: 'local', count: patterns.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // GitHub API
  try {
    const res = await fetchUrl(
      `https://api.github.com/repos/${pack.owner}/${pack.repo}/contents/${pack.patternsPath}`
    );
    if (res.status !== 200) return { ok: false, error: `GitHub API returned ${res.status}` };
    const items = JSON.parse(res.body);
    const { custom } = readSkills();
    const installedIds = new Set(custom.map(s => s.id));
    const patterns = items
      .filter(i => i.type === 'dir')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({
        id: i.name,
        name: patternToLabel(i.name),
        category: deriveFabricCategory(i.name),
        rawUrl: `https://raw.githubusercontent.com/${pack.owner}/${pack.repo}/${pack.branch}/${pack.patternsPath}/${i.name}/system.md`,
        packId: pack.id,
        local: false,
        installed: installedIds.has(`fabric-${i.name}`),
      }));
    return { ok: true, patterns, source: 'github', count: patterns.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-packs-preview', async (_, pattern) => {
  try {
    // Built-in SDLC pattern — content is already in memory
    if (pattern.builtin || pattern.packId === 'robos/sdlc-essentials') {
      const p = SDLC_PATTERNS.find(s => s.id === pattern.id);
      if (!p) return { ok: false, error: 'Pattern not found' };
      return { ok: true, content: p.systemPrompt };
    }
    if (pattern.local && pattern.localPath) {
      const content = fs.readFileSync(pattern.localPath, 'utf8');
      return { ok: true, content };
    }
    const res = await fetchUrl(pattern.rawUrl);
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, content: res.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-packs-clone', async (_, packId) => {
  const pack = FEATURED_PACKS.find(p => p.id === packId);
  if (!pack) return { ok: false, error: 'Unknown pack' };
  if (!pack.cloneUrl) return { ok: false, error: 'This is a built-in pack — no clone needed' };

  return new Promise(resolve => {
    fs.mkdirSync(SKILL_PACKS_DIR, { recursive: true });

    if (fs.existsSync(pack.localPath)) {
      execFile('git', ['-C', pack.localPath, 'pull', '--ff-only'], { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) resolve({ ok: false, error: stderr || err.message });
        else resolve({ ok: true, action: 'updated', path: pack.localPath });
      });
    } else {
      execFile('git', ['clone', '--depth=1', pack.cloneUrl, pack.localPath], { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) resolve({ ok: false, error: stderr || err.message });
        else resolve({ ok: true, action: 'cloned', path: pack.localPath });
      });
    }
  });
});

ipcMain.handle('skills-packs-import', async (_, { patterns }) => {
  try {
    const { custom } = readSkills();
    const installedIds = new Set(custom.map(s => s.id));
    let added = 0;

    for (const p of patterns) {
      const packId = p.packId || 'danielmiessler/fabric';

      // Determine skill ID and category prefix based on pack type
      let skillId, categoryPrefix;
      if (packId === 'robos/sdlc-essentials') {
        skillId = p.id; // already prefixed with sdlc-
        categoryPrefix = 'SDLC';
      } else if (packId === 'PatrickJS/awesome-cursorrules') {
        skillId = `cursorrules-${p.id}`;
        categoryPrefix = 'CursorRules';
      } else {
        skillId = `fabric-${p.id}`;
        categoryPrefix = 'Fabric';
      }

      if (installedIds.has(skillId)) continue;

      // Get system prompt content
      let systemMd = p.systemMd || '';
      if (!systemMd && packId === 'robos/sdlc-essentials') {
        const pattern = SDLC_PATTERNS.find(s => s.id === p.id);
        if (pattern) systemMd = pattern.systemPrompt;
      } else if (!systemMd && p.local && p.localPath) {
        try { systemMd = fs.readFileSync(p.localPath, 'utf8'); } catch {}
      }

      // First paragraph = description
      let description = p.description || '';
      if (!description && systemMd) {
        const lines = systemMd.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        description = (lines[0] || p.name).slice(0, 150);
      }

      custom.push({
        id: skillId,
        name: p.name,
        category: `${categoryPrefix}: ${p.category}`,
        description,
        command: '',
        systemPrompt: systemMd,
        tags: [categoryPrefix.toLowerCase(), p.category.toLowerCase(), 'pattern'],
        source: 'pack',
        packId,
      });
      installedIds.add(skillId);
      added++;
    }

    saveCustomSkills(custom);
    return { ok: true, added, total: custom.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
