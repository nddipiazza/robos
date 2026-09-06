'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('robos-app-wizard');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'app-wizard'));

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;
const PORT = 19183;

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try {
      _debugServer = require(p);
      if (_debugServer.registerSnapshotIPC) _debugServer.registerSnapshotIPC(ipcMain);
      break;
    } catch {}
  }
} catch {}

function getRobosRoot() {
  let cur = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(cur, '.robos'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return process.cwd();
}

ipcMain.handle('app-wizard:list-teams', async () => {
  const robosRoot = getRobosRoot();
  const teamsFile = path.join(robosRoot, '.robos', 'teams.yaml');
  if (fs.existsSync(teamsFile)) {
    try {
      const content = fs.readFileSync(teamsFile, 'utf8');
      const lines = content.split('\n');
      const teams = [];
      let curTeam = null;
      for (const line of lines) {
        const idMatch = line.match(/^\s*-\s*id:\s*([a-zA-Z0-9_-]+)/);
        const nameMatch = line.match(/^\s*name:\s*(.+)/);
        const topoMatch = line.match(/^\s*topology:\s*([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          curTeam = { id: idMatch[1], name: idMatch[1], topology: 'stream-aligned' };
          teams.push(curTeam);
        } else if (curTeam && nameMatch) {
          curTeam.name = nameMatch[1].trim();
        } else if (curTeam && topoMatch) {
          curTeam.topology = topoMatch[1].trim();
        }
      }
      if (teams.length > 0) return teams;
    } catch {}
  }
  return [
    { id: 'platform-team', name: 'Core Platform Team', topology: 'platform' },
    { id: 'order-team', name: 'Order Processing Team', topology: 'stream-aligned' },
    { id: 'frontend-team', name: 'Frontend Guild', topology: 'enabling' },
  ];
});

ipcMain.handle('app-wizard:scan-source', async (_, { sourcePath }) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { error: 'Source directory does not exist: ' + sourcePath };
  }
  try {
    const files = fs.readdirSync(sourcePath);
    let archetype = 'robos:Library';
    let language = 'Unknown';
    let framework = 'None';
    let port = 8080;
    const detectedContracts = [];

    if (files.includes('pom.xml')) {
      language = 'Java 21';
      framework = 'Spring Boot 3';
      archetype = 'robos:Microservice';
      port = 8080;
    } else if (files.includes('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(sourcePath, 'package.json'), 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
      if (allDeps['electron']) {
        language = 'Node.js 20';
        framework = 'Electron';
        archetype = 'robos:DesktopApp';
      } else if (allDeps['react-native'] || files.includes('app.json')) {
        language = 'TypeScript';
        framework = 'React Native';
        archetype = 'robos:MobileApp';
      } else if (allDeps['express'] || allDeps['fastify'] || allDeps['koa']) {
        language = 'Node.js 20';
        framework = 'Express';
        archetype = 'robos:Microservice';
        port = 3000;
      } else {
        language = 'TypeScript / Node.js';
        framework = 'Library';
        archetype = 'robos:Library';
      }
    } else if (files.includes('go.mod')) {
      language = 'Go 1.22';
      framework = 'Gin';
      archetype = 'robos:Microservice';
      port = 8080;
    } else if (files.includes('Cargo.toml')) {
      language = 'Rust';
      framework = 'Tokio';
      archetype = 'robos:ConsoleApp';
    } else if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
      language = 'Python 3.11';
      framework = 'FastAPI';
      archetype = 'robos:Microservice';
      port = 8000;
    }

    if (files.includes('openapi.yaml') || files.includes('openapi.json') || files.includes('swagger.json')) {
      detectedContracts.push('OpenAPI 3.1');
    }
    if (files.includes('schema.graphql')) detectedContracts.push('GraphQL');
    if (files.some(f => f.endsWith('.proto'))) detectedContracts.push('gRPC / Protobuf');

    return {
      success: true,
      sourcePath,
      name: path.basename(sourcePath),
      archetype,
      language,
      framework,
      port,
      hasDocker: files.includes('Dockerfile'),
      hasDevSetup: files.includes('dev-setup.sh'),
      hasCatalogInfo: files.includes('catalog-info.yaml'),
      detectedContracts,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('app-wizard:refine-inspection', async (_, { inspectionData, prompt, availableTeams }) => {
  if (!inspectionData || !prompt) {
    return { error: 'Missing inspection data or prompt' };
  }
  const refined = Object.assign({}, inspectionData);
  const changes = [];
  const p = prompt.toLowerCase();

  // 1. Archetype detection
  if (p.includes('console') || p.includes('cli') || p.includes('terminal')) {
    refined.archetype = 'robos:ConsoleApp';
    changes.push('Archetype -> robos:ConsoleApp');
  } else if (p.includes('desktop') || p.includes('electron') || p.includes('tauri') || p.includes('gui')) {
    refined.archetype = 'robos:DesktopApp';
    changes.push('Archetype -> robos:DesktopApp');
  } else if (p.includes('microservice') || p.includes('backend') || p.includes('rest api') || p.includes('web api')) {
    refined.archetype = 'robos:Microservice';
    changes.push('Archetype -> robos:Microservice');
  } else if (p.includes('mobile') || p.includes('ios') || p.includes('android') || p.includes('react native') || p.includes('flutter')) {
    refined.archetype = 'robos:MobileApp';
    changes.push('Archetype -> robos:MobileApp');
  } else if (p.includes('pipeline') || p.includes('worker') || p.includes('spark') || p.includes('celery') || p.includes('stream')) {
    refined.archetype = 'robos:DataPipeline';
    changes.push('Archetype -> robos:DataPipeline');
  } else if (p.includes('library') || p.includes('sdk') || p.includes('package') || p.includes('module')) {
    refined.archetype = 'robos:Library';
    changes.push('Archetype -> robos:Library');
  }

  // 2. Name / Slug
  const nameMatch = prompt.match(/(?:rename to|name(?:d)?(?: as)?|slug)\s+["']?([a-zA-Z0-9_\-]+)["']?/i);
  if (nameMatch) {
    refined.name = nameMatch[1];
    changes.push('Name -> ' + nameMatch[1]);
  }

  // 3. Technology / Stack
  const techMatch = prompt.match(/(?:runtime|technology|tech|language|stack|framework)\s+(?:to\s+)?["']?([^,\.]+?)["']?(?:\s+and|\s*$|\s*,)/i);
  if (techMatch) {
    refined.language = techMatch[1].trim();
    refined.technology = techMatch[1].trim();
    changes.push('Technology -> ' + techMatch[1].trim());
  } else {
    if (p.includes('go 1.22') || p.includes('golang') || p.includes('go')) {
      refined.language = 'Go 1.22';
      refined.framework = refined.archetype === 'robos:ConsoleApp' ? 'Cobra / CLI' : 'Gin';
      refined.technology = refined.language + ' / ' + refined.framework;
      changes.push('Technology -> ' + refined.technology);
    } else if (p.includes('python 3.11') || p.includes('fastapi') || p.includes('python')) {
      refined.language = 'Python 3.11';
      refined.framework = refined.archetype === 'robos:ConsoleApp' ? 'Click' : 'FastAPI';
      refined.technology = refined.language + ' / ' + refined.framework;
      changes.push('Technology -> ' + refined.technology);
    } else if (p.includes('rust')) {
      refined.language = 'Rust';
      refined.framework = refined.archetype === 'robos:ConsoleApp' ? 'Clap' : 'Tokio';
      refined.technology = refined.language + ' / ' + refined.framework;
      changes.push('Technology -> ' + refined.technology);
    } else if (p.includes('java 21') || p.includes('spring boot') || p.includes('java')) {
      refined.language = 'Java 21';
      refined.framework = 'Spring Boot 3';
      refined.technology = 'Java 21 / Spring Boot 3';
      changes.push('Technology -> ' + refined.technology);
    }
  }

  // 4. Team assignment
  if (Array.isArray(availableTeams)) {
    for (const t of availableTeams) {
      if (p.includes(t.id.toLowerCase()) || p.includes(t.name.toLowerCase())) {
        refined.team = t.id;
        changes.push('Team -> ' + t.name);
        break;
      }
    }
  }

  return {
    success: true,
    refined,
    changes: changes.length > 0 ? changes : ['No explicit settings modified. Adjust prompt or edit fields directly.'],
  };
});

ipcMain.handle('app-wizard:list-path', async (_, query) => {
  try {
    const robosRoot = getRobosRoot();
    const basePath = query ? path.resolve(robosRoot, query) : robosRoot;
    if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
      const entries = fs.readdirSync(basePath, { withFileTypes: true }).slice(0, 20);
      return {
        ok: true,
        items: entries.map(e => ({
          name: e.name,
          path: path.relative(robosRoot, path.join(basePath, e.name)),
          isDirectory: e.isDirectory(),
        })),
      };
    }
    return { ok: true, items: [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app-wizard:generate-new-app', async (_, spec) => {
  try {
    const robosRoot = getRobosRoot();
    const targetDir = spec.targetDir || path.join(robosRoot, 'packages', spec.slug);
    fs.mkdirSync(targetDir, { recursive: true });

    // 1. catalog-info.yaml
    const catalogInfo = 'apiVersion: backstage.io/v1alpha1\n' +
      'kind: Component\n' +
      'metadata:\n' +
      '  name: ' + spec.slug + '\n' +
      '  title: "' + spec.name + '"\n' +
      '  description: "' + (spec.description || 'RobOS Scaffolding') + '"\n' +
      '  tags: [' + spec.archetype.replace('robos:', '').toLowerCase() + ', ' + (spec.technology || 'general').toLowerCase().replace(/[^a-z0-9]/g, '-') + ']\n' +
      'spec:\n' +
      '  type: ' + spec.archetype.replace('robos:', '').toLowerCase() + '\n' +
      '  lifecycle: experimental\n' +
      '  owner: ' + (spec.team || 'platform-team') + '\n';
    fs.writeFileSync(path.join(targetDir, 'catalog-info.yaml'), catalogInfo, 'utf8');

    // 2. dev-setup.sh
    const devSetup = '#!/usr/bin/env bash\n' +
      '# Automated Developer Setup for ' + spec.name + '\n' +
      'set -euo pipefail\n\n' +
      'echo "==> Setting up environment for ' + spec.name + '..."\n' +
      'echo "==> Technology: ' + spec.technology + '"\n' +
      'echo "==> Archetype: ' + spec.archetype + '"\n\n' +
      'command -v git >/dev/null 2>&1 || { echo "Error: git is required"; exit 1; }\n\n' +
      'echo "✓ Environment verification passed for ' + spec.slug + '!"\n';
    const devSetupPath = path.join(targetDir, 'dev-setup.sh');
    fs.writeFileSync(devSetupPath, devSetup, { mode: 0o755 });

    // 3. Dockerfile
    const dockerfile = 'FROM alpine:3.19\n' +
      'LABEL maintainer="RobOS Engineering Team"\n' +
      'LABEL robos.package="' + spec.urn + '"\n' +
      'WORKDIR /app\n' +
      'COPY . .\n' +
      'CMD ["echo", "Running ' + spec.name + '"]\n';
    fs.writeFileSync(path.join(targetDir, 'Dockerfile'), dockerfile, 'utf8');

    // 4. Contract file if OpenAPI
    if (spec.contractType === 'openapi' || spec.archetype === 'robos:Microservice') {
      const openapiYaml = 'openapi: 3.1.0\n' +
        'info:\n' +
        '  title: "' + spec.name + ' API"\n' +
        '  version: "1.0.0"\n' +
        '  description: "' + (spec.description || 'Generated by RobOS New App Wizard') + '"\n' +
        'paths:\n' +
        '  /health:\n' +
        '    get:\n' +
        '      summary: Health check endpoint\n' +
        '      responses:\n' +
        '        \'200\':\n' +
        '          description: OK\n' +
        '  /v1/payments:\n' +
        '    post:\n' +
        '      summary: Process payment\n' +
        '      responses:\n' +
        '        \'200\':\n' +
        '          description: Payment successful\n' +
        '  /v1/refunds:\n' +
        '    post:\n' +
        '      summary: Process refund\n' +
        '      responses:\n' +
        '        \'200\':\n' +
        '          description: Refund successful\n';
      fs.writeFileSync(path.join(targetDir, 'openapi.yaml'), openapiYaml, 'utf8');
    }

    // 5. Update .robos/packages.yaml
    const packagesYamlPath = path.join(robosRoot, '.robos', 'packages.yaml');
    if (fs.existsSync(packagesYamlPath)) {
      let content = fs.readFileSync(packagesYamlPath, 'utf8');
      const entry = '  - id: "' + spec.urn + '"\n' +
        '    title: "' + spec.name + '"\n' +
        '    type: "' + spec.archetype + '"\n' +
        '    repository: "github.com/acme/' + spec.slug + '"\n' +
        '    technology: "' + spec.technology + '"\n';
      if (!content.includes(spec.urn)) {
        content += entry;
        fs.writeFileSync(packagesYamlPath, content, 'utf8');
      }
    }

    return {
      success: true,
      targetDir,
      urn: spec.urn,
      catalogInfoPath: path.join(targetDir, 'catalog-info.yaml'),
      devSetupPath,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('app-wizard:import-app', async (_, spec) => {
  try {
    const robosRoot = getRobosRoot();
    const sourceDir = spec.sourcePath;
    if (!fs.existsSync(sourceDir)) return { error: 'Source directory not found: ' + sourceDir };

    const catalogPath = path.join(sourceDir, 'catalog-info.yaml');
    if (!fs.existsSync(catalogPath)) {
      const catalogInfo = 'apiVersion: backstage.io/v1alpha1\n' +
        'kind: Component\n' +
        'metadata:\n' +
        '  name: ' + spec.slug + '\n' +
        '  title: "' + spec.name + '"\n' +
        '  description: "Imported into RobOS via App Import Wizard"\n' +
        'spec:\n' +
        '  type: ' + spec.archetype.replace('robos:', '').toLowerCase() + '\n' +
        '  lifecycle: production\n' +
        '  owner: ' + (spec.team || 'platform-team') + '\n';
      fs.writeFileSync(catalogPath, catalogInfo, 'utf8');
    }

    const devSetupPath = path.join(sourceDir, 'dev-setup.sh');
    if (!fs.existsSync(devSetupPath)) {
      const devSetup = '#!/usr/bin/env bash\n' +
        '# Automated Developer Setup for Imported App ' + spec.name + '\n' +
        'set -euo pipefail\n' +
        'echo "==> Verifying environment for ' + spec.name + '..."\n' +
        'echo "✓ All dependencies verified!"\n';
      fs.writeFileSync(devSetupPath, devSetup, { mode: 0o755 });
    }

    const packagesYamlPath = path.join(robosRoot, '.robos', 'packages.yaml');
    if (fs.existsSync(packagesYamlPath)) {
      let content = fs.readFileSync(packagesYamlPath, 'utf8');
      const entry = '  - id: "' + spec.urn + '"\n' +
        '    title: "' + spec.name + '"\n' +
        '    type: "' + spec.archetype + '"\n' +
        '    repository: "github.com/acme/' + spec.slug + '"\n' +
        '    technology: "' + spec.technology + '"\n';
      if (!content.includes(spec.urn)) {
        content += entry;
        fs.writeFileSync(packagesYamlPath, content, 'utf8');
      }
    }

    const gitProjectsPath = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');
    try {
      let projects = [];
      if (fs.existsSync(gitProjectsPath)) {
        projects = JSON.parse(fs.readFileSync(gitProjectsPath, 'utf8'));
      }
      if (!projects.some(p => p.path === sourceDir)) {
        projects.push({
          name: spec.name,
          slug: spec.slug,
          path: sourceDir,
          archetype: spec.archetype,
          technology: spec.technology,
          importedAt: new Date().toISOString(),
        });
        fs.mkdirSync(path.dirname(gitProjectsPath), { recursive: true });
        fs.writeFileSync(gitProjectsPath, JSON.stringify(projects, null, 2), 'utf8');
      }
    } catch {}

    return {
      success: true,
      sourceDir,
      urn: spec.urn,
      catalogPath,
      devSetupPath,
    };
  } catch (err) {
    return { error: err.message };
  }
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 650,
    title: 'RobOS App Wizard',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (_debugServer && _debugServer.startDebugServer) {
    _debugServer.startDebugServer(win, PORT, 'app-wizard');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
