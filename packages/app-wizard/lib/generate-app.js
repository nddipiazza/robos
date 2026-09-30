'use strict';
/**
 * RobOS App Wizard — greenfield generator.
 *
 * Web apps (robos:FrontEndApp / Next.js / Vercel) are generated from the production launch kit in
 * ../templates/nextjs-vercel-web, distilled from getemgigs.com: auth, Neon/PGlite, abuse controls,
 * reCAPTCHA scaffold, mobile-first UI, search + AI-agent discoverability (robots, sitemap, llms.txt,
 * JSON-LD, OG images, manifest) and Cucumber E2E with RobOS multi-phone evidence videos.
 *
 * Pure Node (no Electron) so it can be unit tested and reused by CLIs/agents.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
const WEB_TEMPLATE = 'nextjs-vercel-web';
const TEMPLATE_VERSION = 1;
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt', '.yml', '.yaml', '.css', '.svg', '.sh', '.feature', '.example', '.gitignore', '']);

function isVercelSpec(spec) {
  const tech = spec.technology || '';
  return spec.deploy === 'vercel' || tech.includes('Next.js') || tech.includes('Vercel') || spec.archetype === 'robos:FrontEndApp';
}

function initialsFor(name) {
  const words = String(name || 'App').replace(/['\u2019]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w));
  const letters = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || 'AP').slice(0, 2)).toUpperCase();
  return letters;
}

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function templateVars(spec, domain) {
  const name = spec.name || spec.slug;
  const tagline = spec.tagline || `${name} — built with RobOS`;
  const description = (spec.description || `${name} is a phone-first web app.`).replace(/\s+/g, ' ').trim();
  const keywords = Array.isArray(spec.keywords) && spec.keywords.length
    ? spec.keywords
    : String(spec.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const initials = spec.initials || initialsFor(name);
  return {
    __APP_NAME_JS__: JSON.stringify(name),
    __TAGLINE_JS__: JSON.stringify(tagline),
    __DESCRIPTION_JS__: JSON.stringify(description),
    __KEYWORDS_JS__: JSON.stringify(keywords.length ? keywords : [name, domain]),
    __INITIALS_JS__: JSON.stringify(initials),
    __APP_NAME__: name,
    __APP_SLUG__: spec.slug,
    __DOMAIN__: domain,
    __TAGLINE__: tagline,
    __DESCRIPTION__: description,
    __INITIALS__: initials,
  };
}

function substitute(text, vars, ext) {
  let out = text;
  // JS/JSON literal placeholders first (they never contain the plain placeholder names).
  for (const [k, v] of Object.entries(vars)) {
    const value = ext === '.svg' && !k.endsWith('_JS__') ? xmlEscape(v) : v;
    out = out.split(k).join(value);
  }
  return out;
}

/** Copy a template directory into targetDir, substituting placeholders in text files. Never overwrites. */
function renderTemplate(templateDir, targetDir, vars, { overwrite = false } = {}) {
  const written = [];
  const skipped = [];
  const walk = (rel) => {
    const src = path.join(templateDir, rel);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const relPath = path.join(rel, entry.name);
      // `*.tmpl` files hold content that must not be valid in-place (e.g. package.json with placeholders).
      const outRel = relPath.endsWith('.tmpl') ? relPath.slice(0, -5) : relPath;
      const dest = path.join(targetDir, outRel);
      if (!rel && entry.name === 'TEMPLATE.md') continue;
      if (entry.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        walk(relPath);
        continue;
      }
      if (fs.existsSync(dest) && !overwrite) {
        skipped.push(outRel);
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const outName = path.basename(outRel);
      const ext = outName.startsWith('.') && !path.extname(outName.slice(1)) ? '' : path.extname(outName);
      if (TEXT_EXT.has(ext)) {
        fs.writeFileSync(dest, substitute(fs.readFileSync(path.join(templateDir, relPath), 'utf8'), vars, ext));
      } else {
        fs.copyFileSync(path.join(templateDir, relPath), dest);
      }
      const mode = fs.statSync(path.join(templateDir, relPath)).mode;
      if (mode & 0o111) fs.chmodSync(dest, 0o755);
      written.push(outRel);
    }
  };
  walk('');
  return { written, skipped };
}

/** SDLC KGraph node describing a generated web app, including its launch-kit capabilities. */
function frontEndAppNode(spec, domain, repoSlug) {
  const site = `https://www.${domain}`;
  return {
    '@id': spec.urn,
    '@type': ['oslc_am:Resource', 'robos:FrontEndApp', 'schema:WebApplication'],
    'dcterms:title': spec.name,
    'dcterms:description': spec.description || undefined,
    'robos:package': 'applications',
    'robos:namespace': 'robos.applications',
    'robos:repository': `github.com/${repoSlug}`,
    'robos:technology': 'Next.js 15 / React 19 / Node.js 22',
    'robos:frontendFramework': 'Next.js',
    'robos:appTemplate': `robos:template:${WEB_TEMPLATE}@${TEMPLATE_VERSION}`,
    'robos:hostingPlatform': 'Vercel',
    'robos:productionUrl': site,
    'robos:databaseEngine': 'Neon serverless Postgres (PGlite locally)',
    'robos:authStrategy': 'Email + password, server-side sessions (bcrypt, SHA-256 hashed tokens)',
    'robos:abuseControls': ['rate-limits', 'honeypot', 'form-timing', 'disposable-email-block', 'password-policy', 'same-origin-csrf', 'csp', 'audit-log'],
    'robos:captchaProvider': 'reCAPTCHA v3 (wired, disabled)',
    'robos:crawlerPolicy': 'Search engines, AI search/agents and link-preview bots allowed on public pages; /api, /dashboard, /account disallowed',
    'robos:sitemapUrl': `${site}/sitemap.xml`,
    'robos:llmsTxtUrl': `${site}/llms.txt`,
    'robos:structuredData': ['schema:Organization', 'schema:WebSite', 'schema:WebApplication', 'schema:FAQPage'],
    'robos:e2eEvidence': 'tests/e2e (Cucumber + Playwright) → npm run evidence',
    'robos:schemaOrgType': 'https://schema.org/WebApplication',
    'robos:domainStandard': 'https://schema.org/WebApplication',
  };
}

function registerInKnowledgeGraph(robosRoot, node, targetPackage = 'applications') {
  const pkgPath = path.join(robosRoot, '.robos', 'kgraphs', targetPackage, 'package.jsonld');
  if (!fs.existsSync(pkgPath)) {
    // Fall back to applications if target package not found
    const fallbackPath = path.join(robosRoot, '.robos', 'kgraphs', 'applications', 'package.jsonld');
    if (!fs.existsSync(fallbackPath)) return { registered: false, reason: `${targetPackage} package not found` };
    const pkg = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    pkg['robos:nodes'] = pkg['robos:nodes'] || [];
    if (pkg['robos:nodes'].some((n) => n['@id'] === node['@id'])) return { registered: false, reason: 'already present', path: fallbackPath };
    pkg['robos:nodes'].push(JSON.parse(JSON.stringify(node)));
    fs.writeFileSync(fallbackPath, JSON.stringify(pkg, null, 2) + '\n');
    return { registered: true, path: fallbackPath };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg['robos:nodes'] = pkg['robos:nodes'] || [];
  if (pkg['robos:nodes'].some((n) => n['@id'] === node['@id'])) return { registered: false, reason: 'already present', path: pkgPath };
  pkg['robos:nodes'].push(JSON.parse(JSON.stringify(node)));
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return { registered: true, path: pkgPath };
}

function catalogInfoYaml(spec, domain, repoSlug, isVercel) {
  const q = (s) => JSON.stringify(String(s));
  return [
    'apiVersion: backstage.io/v1alpha1',
    'kind: Component',
    'metadata:',
    `  name: ${spec.slug}`,
    `  title: ${q(spec.name)}`,
    `  description: ${q(spec.description || (isVercel ? 'Next.js web app on Vercel (RobOS nextjs-vercel-web template)' : 'RobOS scaffolding'))}`,
    '  annotations:',
    `    github.com/project-slug: ${q(repoSlug)}`,
    ...(isVercel ? [`    vercel.com/project-name: ${q(spec.slug)}`, `    robos.dev/template: ${q(`${WEB_TEMPLATE}@${TEMPLATE_VERSION}`)}`] : []),
    `    robos.dev/domain: ${q(domain)}`,
    `    robos.dev/urn: ${q(spec.urn)}`,
    `  tags: [${isVercel ? 'frontend, nextjs, react, vercel, neon, seo, e2e-evidence' : spec.archetype.replace('robos:', '').toLowerCase()}]`,
    'spec:',
    `  type: ${isVercel ? 'website' : spec.archetype.replace('robos:', '').toLowerCase()}`,
    '  lifecycle: production',
    `  owner: ${spec.team || 'platform-team'}`,
    '',
  ].join('\n');
}

function devSetupSh(spec, domain, isVercel) {
  return [
    '#!/usr/bin/env bash',
    `# Automated developer setup for ${spec.name}`,
    'set -euo pipefail',
    'cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `echo "==> ${spec.name} (${spec.archetype}) — ${domain}"`,
    'command -v node >/dev/null 2>&1 || { echo "Error: Node.js 20+ is required"; exit 1; }',
    'command -v git >/dev/null 2>&1 || { echo "Error: git is required"; exit 1; }',
    '[ -f package.json ] && npm install --quiet',
    ...(isVercel
      ? [
          '[ -f .env.local ] || { cp .env.example .env.local; echo "E2E_BYPASS_KEY=$(node -e \'console.log(require(\"crypto\").randomBytes(24).toString(\"hex\"))\')" >> .env.local; }',
          'npx playwright install chromium || echo "(optional) Playwright browser install failed; E2E needs it"',
          'npm test',
          'echo "✓ Ready. npm run dev → http://localhost:3000 (embedded Postgres, no setup)"',
        ]
      : ['echo "✓ Environment verified"']),
    '',
  ].join('\n');
}

function projectDocPage(spec, domain) {
  const isVercel = isVercelSpec(spec);
  if (isVercel) {
    return `---
title: ${JSON.stringify(spec.name)}
layout: default
parent: RobOS Projects
permalink: /projects/${spec.slug}/
---

# ${spec.name} (\`${domain}\`)
{: .no_toc }

${spec.description || ''}
{: .fs-6 .fw-300 }

Generated by the RobOS App Wizard from the \`${WEB_TEMPLATE}\` template (v${TEMPLATE_VERSION}).

## Launch kit status

| Capability | Where |
|:---|:---|
| Auth, Neon/PGlite, abuse controls, reCAPTCHA scaffold | \`packages/${spec.slug}/src/lib\` |
| Search engines + AI agents (robots, sitemap, llms.txt, JSON-LD, OG) | \`src/app/robots.js\`, \`sitemap.js\`, \`public/llms.txt\`, \`src/lib/site.js\` |
| Cucumber E2E + RobOS evidence videos | \`tests/e2e\`, \`npm run evidence\` |

## Evidence videos

_Run \`npm run e2e:live && npm run evidence\` and embed \`evidence/*.mp4\` here._
`;
  }

  return `---
title: ${JSON.stringify(spec.name)}
layout: default
parent: RobOS Projects
permalink: /projects/${spec.slug}/
---

# ${spec.name}
{: .no_toc }

${spec.description || `${spec.name} application.`}
{: .fs-6 .fw-300 }

Scaffolded via the **RobOS App Wizard / Create Project** (${spec.archetype}).

## Architectural Specification

| Attribute | Specification |
|:---|:---|
| **Archetype** | \`${spec.archetype}\` |
| **Technology** | \`${spec.technology || 'Node.js'}\` |
| **Package URN** | \`${spec.urn}\` |
| **Ownership** | \`${spec.team || 'platform-team'}\` |
| **Target Directory** | \`packages/${spec.slug}/\` |

## Verification & Execution

Run developer setup and automated verification:
\`\`\`bash
cd packages/${spec.slug}
./dev-setup.sh
npm test
\`\`\`
`;
}

/**
 * Generate a greenfield app.
 * @returns result object (same shape the App Wizard renderer expects)
 */
function generateNewApp(spec, { robosRoot, homeDir, templatesDir = TEMPLATES_DIR } = {}) {
  if (!spec || !spec.slug || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(spec.slug)) throw new Error('A lowercase slug (a-z, 0-9, -) is required.');
  const targetDir = spec.targetDir || path.join(robosRoot, 'packages', spec.slug);
  fs.mkdirSync(targetDir, { recursive: true });
  const isVercel = isVercelSpec(spec);
  const domain = (spec.domain || `${spec.slug}.com`).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const repoSlug = spec.repoSlug || `nddipiazza/${spec.slug}`;
  spec = { ...spec, name: spec.name || spec.slug, urn: spec.urn || `urn:robos:${isVercel ? 'frontend-app' : (spec.archetype === 'robos:Microservice' ? 'service' : (spec.archetype === 'robos:DesktopApp' ? 'desktop-app' : (spec.archetype === 'robos:ConsoleApp' ? 'console-app' : 'app')))}:${spec.slug}` };
  const generated = [];

  let template = null;
  if (isVercel) {
    const res = renderTemplate(path.join(templatesDir, WEB_TEMPLATE), targetDir, templateVars(spec, domain));
    template = { name: WEB_TEMPLATE, version: TEMPLATE_VERSION, ...res };
    generated.push(...res.written);
  } else if (spec.archetype === 'robos:DesktopApp') {
    // Rich Desktop App scaffold (Electron + RobOS theme)
    const pkgJson = {
      name: spec.slug,
      version: '1.0.0',
      description: spec.description || spec.name,
      main: 'main.js',
      scripts: {
        start: 'electron . --no-sandbox --disable-gpu --disable-dev-shm-usage',
        test: 'node --test',
      },
      keywords: ['robos', 'desktop', spec.slug],
      author: spec.team || 'RobOS Team',
      license: 'Apache-2.0',
    };
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');

    const mainJs = `'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.setName('${spec.slug}');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;
    fs.writeFileSync(path.join(targetDir, 'main.js'), mainJs);

    const preloadJs = `'use strict';
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAppName: () => '${spec.name}',
  getAppVersion: () => '1.0.0',
});
`;
    fs.writeFileSync(path.join(targetDir, 'preload.js'), preloadJs);

    const rendererDir = path.join(targetDir, 'renderer');
    fs.mkdirSync(rendererDir, { recursive: true });

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${spec.name}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-layout">
    <header class="app-header">
      <div class="logo">
        <span class="icon">🖥️</span>
        <h1>${spec.name}</h1>
      </div>
      <span class="tagline">${spec.tagline || spec.description || 'RobOS Desktop Application'}</span>
    </header>
    <main class="content">
      <div class="card">
        <h2>Welcome to ${spec.name}</h2>
        <p>${spec.description || 'This desktop application was generated by the RobOS Create Project App Wizard.'}</p>
        <div class="status-badge">● System Status: Ready</div>
      </div>
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>
`;
    fs.writeFileSync(path.join(rendererDir, 'index.html'), indexHtml);

    const stylesCss = `:root {
  --bg-primary: #0d1117;
  --bg-card: #161b22;
  --border: #30363d;
  --text: #f0f6fc;
  --text-muted: #8b949e;
  --accent: #00bcd4;
  --success: #2ea043;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text);
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-layout { display: flex; flex-direction: column; height: 100%; }
.app-header {
  padding: 16px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo { display: flex; align-items: center; gap: 10px; }
.logo h1 { font-size: 18px; font-weight: 700; color: var(--accent); }
.tagline { font-size: 12px; color: var(--text-muted); }
.content { padding: 32px; flex: 1; }
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  max-width: 600px;
}
.card h2 { font-size: 20px; margin-bottom: 12px; }
.card p { font-size: 14px; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px; }
.status-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: var(--success);
  background: rgba(46, 160, 67, 0.15);
  padding: 4px 10px;
  border-radius: 20px;
}
`;
    fs.writeFileSync(path.join(rendererDir, 'styles.css'), stylesCss);

    const rendererAppJs = `'use strict';
window.addEventListener('DOMContentLoaded', () => {
  console.log('${spec.name} loaded successfully');
});
`;
    fs.writeFileSync(path.join(rendererDir, 'app.js'), rendererAppJs);

    const desktopFile = `[Desktop Entry]
X-RobOS-App=true
Version=1.0
Type=Application
Name=${spec.name}
Comment=${spec.description || spec.name}
Exec=/usr/bin/electron /usr/local/share/robos/${spec.slug}/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage
Icon=/usr/local/share/robos/${spec.slug}/icon.svg
Terminal=false
Categories=Utility;
X-RobOS-Category=Utility
StartupWMClass=${spec.slug}
`;
    fs.writeFileSync(path.join(targetDir, `${spec.slug}.desktop`), desktopFile);

    const readme = `# ${spec.name}

> ${spec.tagline || spec.description || 'RobOS Desktop Application'}

Generated via the **RobOS App Wizard / Create Project**.

## Development & Execution

\`\`\`bash
cd packages/${spec.slug}
npm install
npm start
\`\`\`
`;
    fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

    const dockerfile = ['FROM alpine:3.19', 'LABEL maintainer="RobOS Engineering Team"', `LABEL robos.package="${spec.urn}"`, 'WORKDIR /app', 'COPY . .', `CMD ["echo", "Running ${spec.name}"]`, ''].join('\n');
    fs.writeFileSync(path.join(targetDir, 'Dockerfile'), dockerfile);

    generated.push('package.json', 'main.js', 'preload.js', 'renderer/index.html', 'renderer/styles.css', 'renderer/app.js', `${spec.slug}.desktop`, 'README.md', 'Dockerfile');
  } else if (spec.archetype === 'robos:ConsoleApp') {
    // Rich Console CLI scaffold
    const pkgJson = {
      name: spec.slug,
      version: '1.0.0',
      description: spec.description || spec.name,
      bin: {
        [spec.slug]: 'bin/cli.js',
      },
      scripts: {
        start: 'node bin/cli.js',
        test: 'node --test',
      },
      keywords: ['robos', 'cli', spec.slug],
      license: 'Apache-2.0',
    };
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');

    const binDir = path.join(targetDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    const cliJs = `#!/usr/bin/env node
'use strict';

const args = process.argv.slice(2);
const command = args[0] || '--help';

if (command === '--help' || command === '-h') {
  console.log(\`
${spec.name} v1.0.0
${spec.description || 'Command-line tool generated by RobOS Create Project'}

Usage:
  ${spec.slug} <command> [options]

Commands:
  status        Check system or service status
  ping          Ping diagnostic target
  report        Generate a diagnostic report
  --help, -h    Show this help message
  --version, -v Show version
\`);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log('${spec.slug} v1.0.0');
  process.exit(0);
}

if (command === 'status' || command === 'ping') {
  console.log('✓ [${spec.slug}] Status: ONLINE · Latency: 1.2ms · All checks passing');
  process.exit(0);
}

if (command === 'report') {
  console.log('--- ${spec.name} Diagnostic Summary ---');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Status: HEALTHY (0 errors, 0 warnings)');
  process.exit(0);
}

console.error(\`Unknown command: \${command}. Run with --help for usage.\`);
process.exit(1);
`;
    fs.writeFileSync(path.join(binDir, 'cli.js'), cliJs, { mode: 0o755 });

    const readme = `# ${spec.name}

> ${spec.tagline || spec.description || 'Command-Line Utility'}

## Usage

\`\`\`bash
# Run command-line tool
node bin/cli.js --help
node bin/cli.js status
node bin/cli.js report
\`\`\`
`;
    fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

    const dockerfile = ['FROM alpine:3.19', 'LABEL maintainer="RobOS Engineering Team"', `LABEL robos.package="${spec.urn}"`, 'WORKDIR /app', 'COPY . .', `CMD ["echo", "Running ${spec.name}"]`, ''].join('\n');
    fs.writeFileSync(path.join(targetDir, 'Dockerfile'), dockerfile);

    generated.push('package.json', 'bin/cli.js', 'README.md', 'Dockerfile');
  } else {
    // Default / Microservice / API scaffold
    const pkgJson = {
      name: spec.slug,
      version: '1.0.0',
      description: spec.description || spec.name,
      main: 'server.js',
      scripts: {
        start: 'node server.js',
        test: 'node --test',
      },
      keywords: ['robos', 'microservice', spec.slug],
      license: 'Apache-2.0',
    };
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');

    const serverJs = `'use strict';
const http = require('http');

const PORT = process.env.PORT || 3000;
const APP_NAME = ${JSON.stringify(spec.name)};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/health' || req.url === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok', service: APP_NAME, uptime: process.uptime() }));
  }

  if (req.url.startsWith('/api/')) {
    res.writeHead(200);
    return res.end(JSON.stringify({
      service: APP_NAME,
      version: '1.0.0',
      message: 'Resource endpoint responding',
      data: [{ id: 1, name: 'Sample Item', active: true }]
    }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found', path: req.url }));
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(\`⚡ \${APP_NAME} listening on http://localhost:\${PORT}\`);
  });
}

module.exports = server;
`;
    fs.writeFileSync(path.join(targetDir, 'server.js'), serverJs);

    const openapi = ['openapi: 3.1.0', 'info:', `  title: ${JSON.stringify(spec.name + ' API')}`, '  version: "1.0.0"', `  description: ${JSON.stringify(spec.description || 'RESTful API service')}`, 'paths:', '  /api/health:', '    get:', '      summary: Service health check endpoint', '      responses:', "        '200':", '          description: Service is healthy and responding', '  /api/items:', '    get:', '      summary: List items', '      responses:', "        '200':", '          description: Returns collection of items', ''].join('\n');
    fs.writeFileSync(path.join(targetDir, 'openapi.yaml'), openapi);

    const dockerfile = ['FROM node:20-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm install --production --silent || true', 'COPY . .', 'EXPOSE 3000', `CMD ["node", "server.js"]`, ''].join('\n');
    fs.writeFileSync(path.join(targetDir, 'Dockerfile'), dockerfile);

    const readme = `# ${spec.name}

> ${spec.tagline || spec.description || 'RobOS Microservice API'}

## API Endpoints

- \`GET /api/health\` - Health check
- \`GET /api/items\` - Collection endpoint

## Running locally

\`\`\`bash
node server.js
\`\`\`
`;
    fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

    generated.push('package.json', 'server.js', 'openapi.yaml', 'Dockerfile', 'README.md');
  }

  fs.writeFileSync(path.join(targetDir, 'catalog-info.yaml'), catalogInfoYaml(spec, domain, repoSlug, isVercel));
  const devSetupPath = path.join(targetDir, 'dev-setup.sh');
  fs.writeFileSync(devSetupPath, devSetupSh(spec, domain, isVercel), { mode: 0o755 });
  generated.push('catalog-info.yaml', 'dev-setup.sh');

  // .robos/packages.yaml
  const packagesYamlPath = path.join(robosRoot, '.robos', 'packages.yaml');
  if (fs.existsSync(packagesYamlPath)) {
    let content = fs.readFileSync(packagesYamlPath, 'utf8');
    if (!content.includes(spec.urn)) {
      if (!content.endsWith('\n')) content += '\n';
      content += `  - id: "${spec.urn}"\n    title: ${JSON.stringify(spec.name)}\n    type: "${spec.archetype || (isVercel ? 'robos:FrontEndApp' : 'robos:Library')}"\n    repository: "github.com/${repoSlug}"\n    technology: ${JSON.stringify(spec.technology || (isVercel ? 'Next.js 15 / React 19 (Vercel)' : 'Polyglot'))}\n`;
      fs.writeFileSync(packagesYamlPath, content);
    }
  }

  // SDLC Knowledge Graph + project doc page
  let kgraph = { registered: false };
  let docPage = null;
  const targetKGraphPkg = spec.archetype === 'robos:Microservice' ? 'services' : 'applications';
  let node = null;
  if (isVercel) {
    node = frontEndAppNode(spec, domain, repoSlug);
  } else if (spec.archetype === 'robos:DesktopApp') {
    node = {
      '@id': spec.urn,
      '@type': ['oslc_am:Resource', 'robos:DesktopApp', 'schema:SoftwareApplication'],
      'dcterms:title': spec.name,
      'dcterms:description': spec.description || undefined,
      'robos:package': 'applications',
      'robos:namespace': 'robos.applications',
      'robos:repository': `github.com/${repoSlug}`,
      'robos:technology': spec.technology || 'Electron 29 / Vanilla JS',
      'robos:schemaOrgType': 'https://schema.org/SoftwareApplication',
    };
  } else if (spec.archetype === 'robos:Microservice') {
    node = {
      '@id': spec.urn,
      '@type': ['oslc_am:Resource', 'robos:Microservice', 'schema:WebApplication'],
      'dcterms:title': spec.name,
      'dcterms:description': spec.description || undefined,
      'robos:package': 'services',
      'robos:namespace': 'robos.services',
      'robos:repository': `github.com/${repoSlug}`,
      'robos:technology': spec.technology || 'Node.js 20 / Express',
      'robos:schemaOrgType': 'https://schema.org/WebApplication',
    };
  } else if (spec.archetype === 'robos:ConsoleApp') {
    node = {
      '@id': spec.urn,
      '@type': ['oslc_am:Resource', 'robos:ConsoleApp', 'schema:SoftwareApplication'],
      'dcterms:title': spec.name,
      'dcterms:description': spec.description || undefined,
      'robos:package': 'applications',
      'robos:namespace': 'robos.applications',
      'robos:repository': `github.com/${repoSlug}`,
      'robos:technology': spec.technology || 'Node.js 20 / CLI',
      'robos:schemaOrgType': 'https://schema.org/SoftwareApplication',
    };
  }

  if (node) {
    kgraph = registerInKnowledgeGraph(robosRoot, node, targetKGraphPkg);
  }

  const docsDir = path.join(robosRoot, 'docs', 'projects');
  const docFile = path.join(docsDir, `${spec.slug}.md`);
  if (fs.existsSync(docsDir) && !fs.existsSync(docFile)) {
    fs.writeFileSync(docFile, projectDocPage(spec, domain));
    docPage = docFile;
  }

  // ~/.config/robos/git-projects.json
  if (homeDir) {
    try {
      const gitProjectsPath = path.join(homeDir, '.config', 'robos', 'git-projects.json');
      let projects = [];
      if (fs.existsSync(gitProjectsPath)) {
        try { projects = JSON.parse(fs.readFileSync(gitProjectsPath, 'utf8')); } catch {}
      }
      if (!projects.some((p) => p.slug === spec.slug || p.path === targetDir)) {
        projects.push({ name: spec.name, slug: spec.slug, path: targetDir, archetype: spec.archetype, technology: spec.technology, domain, importedAt: new Date().toISOString() });
        fs.mkdirSync(path.dirname(gitProjectsPath), { recursive: true });
        fs.writeFileSync(gitProjectsPath, JSON.stringify(projects, null, 2));
      }
    } catch {}
  }

  return {
    success: true,
    targetDir,
    urn: spec.urn,
    isVercel,
    domain,
    template,
    generated,
    kgraph,
    docPage,
    catalogInfoPath: path.join(targetDir, 'catalog-info.yaml'),
    devSetupPath,
  };
}

module.exports = { generateNewApp, renderTemplate, templateVars, frontEndAppNode, registerInKnowledgeGraph, isVercelSpec, initialsFor, WEB_TEMPLATE, TEMPLATE_VERSION, TEMPLATES_DIR };
