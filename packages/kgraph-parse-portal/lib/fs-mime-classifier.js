'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Common directory exclusions for Linux filesystem crawling.
 */
const DEFAULT_EXCLUDES = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'target',
  'dist',
  'build',
  '.cache',
  '__pycache__',
  '.idea',
  '.vscode',
  '.DS_Store',
]);

/**
 * Detects the project archetype of a directory by inspecting marker files.
 * @param {string} dirPath 
 * @returns {Object} Archetype metadata
 */
function detectDirectoryArchetype(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { archetype: 'unknown', title: 'Non-existent Directory' };
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    return { archetype: 'file', title: 'Single File' };
  }

  const files = new Set(fs.readdirSync(dirPath));

  // 1. Bazel / Buck2 Monorepo
  if (files.has('MODULE.bazel') || files.has('WORKSPACE') || files.has('WORKSPACE.bazel')) {
    return {
      archetype: 'bazel-monorepo',
      title: 'Bazel Monorepo',
      buildSystem: 'Bazel',
      targetClass: 'robos:BuildSystem',
      remoteExecutionReady: true,
    };
  }
  if (files.has('.buckconfig') || files.has('BUCK')) {
    return {
      archetype: 'buck2-monorepo',
      title: 'Buck2 Monorepo',
      buildSystem: 'Buck2',
      targetClass: 'robos:BuildSystem',
      remoteExecutionReady: true,
    };
  }

  // 2. Maven / Gradle JVM
  if (files.has('pom.xml')) {
    return {
      archetype: 'maven-java',
      title: 'Maven Java Project',
      buildSystem: 'Maven',
      language: 'Java',
      targetClass: 'robos:Microservice',
    };
  }
  if (files.has('build.gradle') || files.has('build.gradle.kts') || files.has('settings.gradle')) {
    return {
      archetype: 'gradle-jvm',
      title: 'Gradle JVM Project',
      buildSystem: 'Gradle',
      language: 'Java/Kotlin',
      targetClass: 'robos:Microservice',
    };
  }

  // 3. Cargo Rust
  if (files.has('Cargo.toml')) {
    return {
      archetype: 'cargo-rust',
      title: 'Cargo Rust Crate/Workspace',
      buildSystem: 'Cargo',
      language: 'Rust',
      targetClass: 'robos:Microservice',
    };
  }

  // 4. Go Module
  if (files.has('go.mod')) {
    return {
      archetype: 'go-module',
      title: 'Go Module Application',
      buildSystem: 'Go Modules',
      language: 'Go',
      targetClass: 'robos:Microservice',
    };
  }

  // 5. Python Project
  if (files.has('pyproject.toml') || files.has('setup.py') || files.has('requirements.txt') || files.has('Pipfile')) {
    return {
      archetype: 'python-project',
      title: 'Python Project',
      buildSystem: 'Pip/Poetry',
      language: 'Python',
      targetClass: 'robos:Microservice',
    };
  }

  // 6. Node.js / TypeScript App
  if (files.has('package.json')) {
    let pkgDetails = { title: 'Node.js Application', archetype: 'node-application', frontend: 'Vanilla' };
    try {
      const rawPkg = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf8'));
      const deps = { ...(rawPkg.dependencies || {}), ...(rawPkg.devDependencies || {}) };

      if (deps.electron) {
        pkgDetails = { archetype: 'electron-desktop', title: 'Electron Desktop Application', desktopFramework: 'Electron', targetClass: 'robos:DesktopApp' };
      } else if (deps.next || deps.react) {
        pkgDetails = { archetype: 'react-web', title: 'React Web Application', frontendFramework: deps.next ? 'Next.js' : 'React', targetClass: 'robos:FrontEndApp' };
      } else if (deps.vue || deps.nuxt) {
        pkgDetails = { archetype: 'vue-web', title: 'Vue Web Application', frontendFramework: deps.nuxt ? 'Nuxt' : 'Vue', targetClass: 'robos:FrontEndApp' };
      } else if (deps.express || deps.fastify || deps['@nestjs/core']) {
        pkgDetails = { archetype: 'node-service', title: 'Node.js REST Microservice', backendFramework: deps.express ? 'Express' : (deps.fastify ? 'Fastify' : 'NestJS'), targetClass: 'robos:Microservice' };
      } else {
        pkgDetails = { archetype: 'node-library', title: 'Node.js Package/Library', targetClass: 'robos:SourceArtifact' };
      }
    } catch {}
    return { ...pkgDetails, buildSystem: 'npm/pnpm', language: 'TypeScript/JavaScript' };
  }

  // 7. Godot Game Project
  if (files.has('project.godot')) {
    return {
      archetype: 'godot-game',
      title: 'Godot 4 Game Project',
      buildSystem: 'Godot Engine',
      language: 'GDScript/C#',
      targetClass: 'robos:PCGame',
    };
  }

  // 8. Helm Chart
  if (files.has('Chart.yaml') || files.has('Chart.yml')) {
    return {
      archetype: 'helm-chart',
      title: 'Kubernetes Helm Chart',
      buildSystem: 'Helm',
      targetClass: 'robos:GitOpsDeployment',
    };
  }

  // 9. C/C++ Project
  if (files.has('CMakeLists.txt') || files.has('Makefile')) {
    return {
      archetype: 'c-cpp-project',
      title: 'C/C++ Native Project',
      buildSystem: files.has('CMakeLists.txt') ? 'CMake' : 'Make',
      language: 'C/C++',
      targetClass: 'robos:SourceArtifact',
    };
  }

  // 10. Container Definition
  if (files.has('Dockerfile') || files.has('docker-compose.yml') || files.has('compose.yaml')) {
    return {
      archetype: 'docker-container',
      title: 'Docker Container Definition',
      buildSystem: 'Docker',
      targetClass: 'robos:ContainerImage',
    };
  }

  // 11. Linux System Directory
  if (dirPath.startsWith('/etc/systemd') || dirPath.startsWith('/usr/lib/systemd')) {
    return {
      archetype: 'systemd-units',
      title: 'Linux Systemd Unit Directory',
      targetClass: 'robos:SystemdService',
    };
  }

  return {
    archetype: 'generic-directory',
    title: path.basename(dirPath) || 'Generic Directory',
    targetClass: 'robos:SourceArtifact',
  };
}

/**
 * Computes the SHA-256 hash of a file or buffer.
 */
function computeSha256(filePathOrBuffer) {
  try {
    const hash = crypto.createHash('sha256');
    if (typeof filePathOrBuffer === 'string') {
      const buf = fs.readFileSync(filePathOrBuffer);
      hash.update(buf);
    } else {
      hash.update(filePathOrBuffer);
    }
    return hash.digest('hex');
  } catch {
    return '0000000000000000000000000000000000000000000000000000000000000000';
  }
}

/**
 * Disambiguates any Linux file or buffer into its precise MIME type and semantic RobOS Knowledge Graph meaning.
 * @param {string} filePath Absolute or relative path
 * @param {fs.Stats} [stats] Optional stat object
 * @param {string|Buffer} [contentSample] Optional file sample
 * @returns {Object} Disambiguated semantic classification
 */
function classifyFile(filePath, stats = null, contentSample = null) {
  const baseName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // If stats not provided, stat if file exists
  if (!stats) {
    try {
      stats = fs.lstatSync(filePath);
    } catch {}
  }

  // Handle special Linux virtual filesystem devices & nodes
  if (stats) {
    if (stats.isSymbolicLink()) {
      return {
        semanticType: 'robos:LinuxSymlink',
        rawMime: 'inode/symlink',
        semanticRole: 'Linux Symbolic Link',
        isSpecialDevice: true,
        targetClass: 'robos:SourceArtifact',
      };
    }
    if (stats.isSocket()) {
      return {
        semanticType: 'robos:LinuxSocket',
        rawMime: 'inode/socket',
        semanticRole: 'Unix Domain IPC Socket',
        isSpecialDevice: true,
        targetClass: 'robos:SourceArtifact',
      };
    }
    if (stats.isFIFO()) {
      return {
        semanticType: 'robos:LinuxNamedPipe',
        rawMime: 'inode/fifo',
        semanticRole: 'Linux Named Pipe (FIFO)',
        isSpecialDevice: true,
        targetClass: 'robos:SourceArtifact',
      };
    }
    if (stats.isBlockDevice()) {
      return {
        semanticType: 'robos:LinuxBlockDevice',
        rawMime: 'inode/blockdevice',
        semanticRole: 'Linux Block Storage Device',
        isSpecialDevice: true,
        targetClass: 'robos:SourceArtifact',
      };
    }
    if (stats.isCharacterDevice()) {
      return {
        semanticType: 'robos:LinuxCharacterDevice',
        rawMime: 'inode/chardevice',
        semanticRole: 'Linux Character Device Node',
        isSpecialDevice: true,
        targetClass: 'robos:SourceArtifact',
      };
    }
  }

  // Read sample if not provided
  let sampleText = '';
  let sampleBuf = null;
  if (contentSample) {
    sampleBuf = Buffer.isBuffer(contentSample) ? contentSample : Buffer.from(contentSample);
    sampleText = sampleBuf.toString('utf8', 0, 4096);
  } else if (stats && stats.isFile()) {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      sampleBuf = buf.subarray(0, bytesRead);
      sampleText = sampleBuf.toString('utf8');
    } catch {}
  }

  // Check ELF binary header
  if (sampleBuf && sampleBuf.length >= 4 && sampleBuf[0] === 0x7f && sampleBuf[1] === 0x45 && sampleBuf[2] === 0x4c && sampleBuf[3] === 0x46) {
    const isShared = ext === '.so' || baseName.includes('.so.');
    return {
      semanticType: isShared ? 'robos:SharedLibrary' : 'robos:BinaryExecutable',
      rawMime: isShared ? 'application/x-sharedlib' : 'application/x-executable',
      semanticRole: isShared ? 'Linux Dynamic Shared Library (ELF)' : 'Linux Native Executable (ELF)',
      targetClass: 'robos:SourceArtifact',
      binary: true,
    };
  }

  // 1. JSON & JSON-LD Disambiguation
  if (ext === '.json' || ext === '.jsonld') {
    if (baseName === 'package.json') {
      let details = {};
      try {
        const parsed = JSON.parse(sampleText);
        details = {
          name: parsed.name,
          version: parsed.version,
          scripts: Object.keys(parsed.scripts || {}),
          dependenciesCount: Object.keys(parsed.dependencies || {}).length,
        };
      } catch {}
      return {
        semanticType: 'robos:NodeManifest',
        rawMime: 'application/json',
        semanticRole: 'Node.js Package Manifest & Dependencies',
        targetClass: 'robos:SourceArtifact',
        metadata: details,
      };
    }

    if (baseName === 'tsconfig.json') {
      return {
        semanticType: 'robos:TypeScriptConfig',
        rawMime: 'application/json',
        semanticRole: 'TypeScript Compiler Configuration',
        targetClass: 'robos:SourceArtifact',
      };
    }

    if (baseName.endsWith('.jsonld') || (sampleText.includes('"@context"') && sampleText.includes('"@type"'))) {
      return {
        semanticType: 'robos:LinkedDataDocument',
        rawMime: 'application/ld+json',
        semanticRole: 'W3C RDF JSON-LD Semantic Graph Document',
        targetClass: 'robos:SourceArtifact',
      };
    }

    if (baseName.includes('openapi') || baseName.includes('swagger') || sampleText.includes('"openapi"') || sampleText.includes('"swagger"')) {
      return {
        semanticType: 'robos:Contract',
        rawMime: 'application/json',
        semanticRole: 'REST API Contract (OpenAPI)',
        protocol: 'OpenAPI',
        targetClass: 'robos:Contract',
      };
    }

    if (baseName.endsWith('.schema.json') || sampleText.includes('"$schema"')) {
      return {
        semanticType: 'robos:JSONSchema',
        rawMime: 'application/schema+json',
        semanticRole: 'JSON Schema Validation Model',
        targetClass: 'robos:SourceArtifact',
      };
    }

    return {
      semanticType: 'robos:DataDocument',
      rawMime: 'application/json',
      semanticRole: 'Structured JSON Document',
      targetClass: 'robos:SourceArtifact',
    };
  }

  // 2. YAML Disambiguation (Kubernetes, Helm, CI/CD, OpenAPI)
  if (ext === '.yaml' || ext === '.yml') {
    if (baseName === 'Chart.yaml' || baseName === 'Chart.yml') {
      return {
        semanticType: 'robos:HelmChartDefinition',
        rawMime: 'application/x-yaml',
        semanticRole: 'Kubernetes Helm Chart Metadata',
        targetClass: 'robos:GitOpsDeployment',
      };
    }

    if (baseName === 'values.yaml' || baseName === 'values.yml') {
      return {
        semanticType: 'robos:HelmValues',
        rawMime: 'application/x-yaml',
        semanticRole: 'Kubernetes Helm Deployment Values',
        targetClass: 'robos:GitOpsDeployment',
      };
    }

    if (filePath.includes('.github/workflows') || baseName === '.gitlab-ci.yml') {
      return {
        semanticType: 'robos:CICDPipeline',
        rawMime: 'application/x-yaml',
        semanticRole: 'Continuous Integration / Deployment Pipeline',
        targetClass: 'robos:CICDPipeline',
      };
    }

    if (sampleText.includes('apiVersion:') && sampleText.includes('kind:')) {
      const matchKind = /kind:\s*([A-Za-z0-9]+)/.exec(sampleText);
      const kind = matchKind ? matchKind[1] : 'KubernetesResource';
      return {
        semanticType: 'robos:KubernetesManifest',
        rawMime: 'application/x-yaml',
        semanticRole: `Kubernetes Resource Manifest (${kind})`,
        kubernetesKind: kind,
        targetClass: 'robos:GitOpsDeployment',
      };
    }

    if (baseName.includes('openapi') || sampleText.includes('openapi:') || sampleText.includes('swagger:')) {
      return {
        semanticType: 'robos:Contract',
        rawMime: 'application/x-yaml',
        semanticRole: 'REST API Contract (OpenAPI 3.x)',
        protocol: 'OpenAPI',
        targetClass: 'robos:Contract',
      };
    }

    return {
      semanticType: 'robos:ConfigurationFile',
      rawMime: 'application/x-yaml',
      semanticRole: 'YAML Configuration File',
      targetClass: 'robos:SourceArtifact',
    };
  }

  // 3. Protobuf & gRPC Contracts
  if (ext === '.proto') {
    return {
      semanticType: 'robos:ProtobufContract',
      rawMime: 'text/x-protobuf',
      semanticRole: 'gRPC Microservice Protocol Buffer Contract',
      protocol: 'gRPC/Protobuf',
      targetClass: 'robos:Contract',
    };
  }

  // 4. GraphQL Contracts
  if (ext === '.graphql' || ext === '.gql') {
    return {
      semanticType: 'robos:GraphQLContract',
      rawMime: 'application/graphql',
      semanticRole: 'GraphQL Schema & Query Contract',
      protocol: 'GraphQL',
      targetClass: 'robos:Contract',
    };
  }

  // 5. Gherkin BDD Specifications
  if (ext === '.feature') {
    return {
      semanticType: 'robos:GherkinFeature',
      rawMime: 'text/x-gherkin',
      semanticRole: 'Behavior-Driven Development (BDD) Feature Specification',
      targetClass: 'robos:GherkinFeature',
    };
  }

  // 6. Markdown & Architecture Documentation
  if (ext === '.md') {
    if (baseName.toUpperCase() === 'README.MD') {
      return {
        semanticType: 'robos:DocumentationPage',
        rawMime: 'text/markdown',
        semanticRole: 'Project Architecture & Developer Readme',
        targetClass: 'robos:DocumentationPage',
      };
    }
    if (baseName.toUpperCase().startsWith('ADR-') || filePath.includes('/adr/') || filePath.includes('/decisions/')) {
      return {
        semanticType: 'robos:ArchitectureDecisionRecord',
        rawMime: 'text/markdown',
        semanticRole: 'Architecture Decision Record (ADR)',
        targetClass: 'robos:ArchitectureDecisionRecord',
      };
    }
    return {
      semanticType: 'robos:DocumentationPage',
      rawMime: 'text/markdown',
      semanticRole: 'Living Architecture Documentation Page',
      targetClass: 'robos:DocumentationPage',
    };
  }

  // 7. Shell scripts
  if (ext === '.sh' || ext === '.bash' || ext === '.zsh' || (sampleText.startsWith('#!') && sampleText.includes('sh'))) {
    return {
      semanticType: 'robos:ShellScript',
      rawMime: 'text/x-shellscript',
      semanticRole: 'Automation Shell Script',
      targetClass: 'robos:SourceArtifact',
    };
  }

  // 8. Linux Systemd Unit Services
  if (ext === '.service' || (sampleText.includes('[Unit]') && sampleText.includes('[Service]'))) {
    return {
      semanticType: 'robos:SystemdService',
      rawMime: 'text/plain',
      semanticRole: 'Linux Systemd Daemon Service Unit',
      targetClass: 'robos:SourceArtifact',
    };
  }

  // 9. Source Code Artifacts
  if (['.js', '.mjs', '.cjs'].includes(ext)) {
    return {
      semanticType: 'robos:SourceArtifact',
      rawMime: 'application/javascript',
      semanticRole: 'JavaScript ECMAScript Module',
      targetClass: 'robos:SourceArtifact',
    };
  }
  if (['.ts', '.tsx'].includes(ext)) {
    return {
      semanticType: 'robos:SourceArtifact',
      rawMime: 'application/typescript',
      semanticRole: 'TypeScript Type-Checked Module',
      targetClass: 'robos:SourceArtifact',
    };
  }
  if (ext === '.py') {
    return {
      semanticType: 'robos:SourceArtifact',
      rawMime: 'text/x-python',
      semanticRole: 'Python Source Module',
      targetClass: 'robos:SourceArtifact',
    };
  }
  if (ext === '.java') {
    return {
      semanticType: 'robos:SourceArtifact',
      rawMime: 'text/x-java-source',
      semanticRole: 'Java Class / Interface Source',
      targetClass: 'robos:SourceArtifact',
    };
  }
  if (ext === '.rs') {
    return {
      semanticType: 'robos:SourceArtifact',
      rawMime: 'text/x-rust',
      semanticRole: 'Rust Crate Source Module',
      targetClass: 'robos:SourceArtifact',
    };
  }
  if (ext === '.go') {
    return {
      semanticType: 'robos:SourceArtifact',
      rawMime: 'text/x-go',
      semanticRole: 'Go Package Source File',
      targetClass: 'robos:SourceArtifact',
    };
  }
  if (['.c', '.cpp', '.cc', '.h', '.hpp'].includes(ext)) {
    return {
      semanticType: 'robos:SourceArtifact',
      rawMime: ext.startsWith('.h') ? 'text/x-chdr' : 'text/x-csrc',
      semanticRole: 'C/C++ Native Source / Header',
      targetClass: 'robos:SourceArtifact',
    };
  }

  // 10. Documents (PDF, Office, etc.)
  if (ext === '.pdf') {
    return {
      semanticType: 'robos:DocumentationDocument',
      rawMime: 'application/pdf',
      semanticRole: 'Portable Document Format (PDF)',
      targetClass: 'robos:DocumentationPage',
      binary: true,
    };
  }

  return {
    semanticType: 'robos:SourceArtifact',
    rawMime: 'text/plain',
    semanticRole: `General File (${ext || 'no extension'})`,
    targetClass: 'robos:SourceArtifact',
  };
}

/**
 * Crawls a Linux filesystem directory recursively and produces SHACL-compliant RobOS KGraph nodes.
 * @param {string} rootPath Absolute directory or file path
 * @param {Object} [options]
 * @returns {Object} { archetype, nodes: Array<Object>, fileCount: number }
 */
function scanPathToGraphNodes(rootPath, options = {}) {
  const absRoot = path.resolve(rootPath);
  if (!fs.existsSync(absRoot)) {
    throw new Error(`Target path does not exist: ${absRoot}`);
  }

  const maxDepth = options.maxDepth || 10;
  const repository = options.repository || path.basename(absRoot);
  const pkg = options.package || 'core-platform';
  const nodes = [];

  const archetype = detectDirectoryArchetype(absRoot);
  const rootStat = fs.statSync(absRoot);

  if (rootStat.isFile()) {
    const classification = classifyFile(absRoot, rootStat);
    const hash = computeSha256(absRoot);
    const relPath = path.basename(absRoot);
    const slug = relPath.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
    const node = {
      '@id': `urn:robos:source:${slug}`,
      '@type': [...new Set([classification.semanticType, classification.targetClass, 'schema:CreativeWork'])],
      'dcterms:title': relPath,
      'dcterms:description': `${classification.semanticRole} (${classification.rawMime})`,
      'robos:package': pkg,
      'robos:mimeType': classification.rawMime,
      'robos:semanticRole': classification.semanticRole,
      'robos:fileSize': rootStat.size,
      'robos:evidence': [
        {
          repository,
          path: relPath,
          line: 1,
          revision: 'working-tree',
          sha256: hash,
        },
      ],
    };
    if (node['@type'].includes('robos:SourceArtifact')) {
      node['robos:sourcePath'] = relPath;
      node['robos:sourceKind'] = classification.semanticType === 'robos:NodeManifest' ? 'manifest' : 'implementation';
      node['robos:inRepository'] = { '@id': `urn:robos:source:${repository}` };
    }
    if (node['@type'].includes('robos:DocumentationPage')) {
      node['robos:slug'] = slug;
      node['robos:docPath'] = relPath;
    }
    if (node['@type'].includes('robos:ProtobufContract')) {
      node['robos:specFile'] = relPath;
      node['robos:packageName'] = relPath.replace(/\.proto$/, '');
      node['robos:rpcMethods'] = ['Service.Invoke'];
      node['robos:protocol'] = 'gRPC/Protobuf';
    } else if (node['@type'].includes('robos:Contract') || classification.protocol) {
      node['robos:protocol'] = classification.protocol || 'OpenAPI';
      node['robos:specFile'] = relPath;
    }
    nodes.push(node);
    return { archetype, nodes, fileCount: 1 };
  }

  // Directory scan
  const projectSlug = path.basename(absRoot).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const rootType = archetype.targetClass || 'robos:SourceArtifact';
  const rootNode = {
    '@id': `urn:robos:source:${projectSlug}-root`,
    '@type': [...new Set([rootType, 'schema:CreativeWork'])],
    'dcterms:title': archetype.title || path.basename(absRoot),
    'dcterms:description': `Archetype: ${archetype.archetype}. Crawled from ${absRoot}`,
    'robos:package': pkg,
    'robos:archetype': archetype.archetype,
    'robos:sourcePath': '.',
    'robos:sourceKind': 'git-repository',
    'robos:inRepository': { '@id': `urn:robos:source:${repository}` },
    'robos:evidence': [
      {
        repository,
        path: '.',
        line: 1,
        revision: 'working-tree',
        sha256: computeSha256(Buffer.from(absRoot)),
      },
    ],
  };

  if (archetype.buildSystem) {
    rootNode['robos:buildSystem'] = archetype.buildSystem;
  }
  if (archetype.language) {
    rootNode['robos:language'] = archetype.language;
  }
  nodes.push(rootNode);

  function walk(currentDir, currentDepth) {
    if (currentDepth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (DEFAULT_EXCLUDES.has(ent.name)) continue;

      const fullPath = path.join(currentDir, ent.name);
      const relPath = path.relative(absRoot, fullPath);

      if (ent.isDirectory()) {
        walk(fullPath, currentDepth + 1);
      } else {
        try {
          const stats = fs.lstatSync(fullPath);
          const classification = classifyFile(fullPath, stats);
          const hash = computeSha256(fullPath);
          const fileSlug = relPath.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^\.+/, '');

          const fileNode = {
            '@id': `urn:robos:file:${projectSlug}:${fileSlug}`,
            '@type': [...new Set([classification.semanticType, classification.targetClass, 'schema:CreativeWork'])],
            'dcterms:title': ent.name,
            'dcterms:description': `${classification.semanticRole} (${classification.rawMime})`,
            'robos:package': pkg,
            'robos:sourcePath': relPath,
            'robos:mimeType': classification.rawMime,
            'robos:semanticRole': classification.semanticRole,
            'robos:fileSize': stats.size,
            'robos:inProject': rootNode['@id'],
            'robos:evidence': [
              {
                repository,
                path: relPath,
                line: 1,
                revision: 'working-tree',
                sha256: hash,
              },
            ],
          };

          // Populate SHACL requirements by shape
          if (fileNode['@type'].includes('robos:SourceArtifact')) {
            fileNode['robos:sourcePath'] = relPath;
            fileNode['robos:sourceKind'] = classification.semanticType === 'robos:NodeManifest' ? 'manifest' : 'implementation';
            fileNode['robos:inRepository'] = { '@id': `urn:robos:source:${repository}` };
          }

          if (fileNode['@type'].includes('robos:DocumentationPage')) {
            fileNode['robos:slug'] = fileSlug;
            fileNode['robos:docPath'] = relPath;
          }

          if (fileNode['@type'].includes('robos:ProtobufContract')) {
            fileNode['robos:specFile'] = relPath;
            fileNode['robos:packageName'] = ent.name.replace(/\.proto$/, '');
            fileNode['robos:rpcMethods'] = ['Service.Invoke'];
            fileNode['robos:protocol'] = 'gRPC/Protobuf';
          } else if (fileNode['@type'].includes('robos:Contract') || classification.protocol) {
            fileNode['robos:protocol'] = classification.protocol || 'OpenAPI';
            fileNode['robos:specFile'] = relPath;
          }

          nodes.push(fileNode);
        } catch {}
      }
    }
  }

  walk(absRoot, 1);

  return {
    archetype,
    nodes,
    fileCount: nodes.length - 1,
  };
}

module.exports = {
  DEFAULT_EXCLUDES,
  detectDirectoryArchetype,
  computeSha256,
  classifyFile,
  scanPathToGraphNodes,
};
