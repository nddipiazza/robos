'use strict';
const path = require('path');
const fs = require('fs');

/**
 * Normalizes any git URL (https, ssh, shorthand) to a canonical slug and host/org/repo
 */
function parseGitUrl(inputUrl) {
  let u = (inputUrl || '').trim();
  u = u.replace(/\.git$/, '');

  let host = 'github.com';
  let org = 'acme-org';
  let repo = 'unnamed-repo';

  const sshMatch = u.match(/^git@([^:]+):([^/]+)\/(.+)$/);
  if (sshMatch) {
    host = sshMatch[1];
    org = sshMatch[2];
    repo = sshMatch[3];
  } else if (u.startsWith('http://') || u.startsWith('https://')) {
    try {
      const parsed = new URL(u);
      host = parsed.hostname.replace(/^www\./, '');
      const parts = parsed.pathname.replace(/^\//, '').split('/');
      org = parts[0] || 'acme-org';
      repo = parts[1] || 'unnamed-repo';
    } catch {
      // fallback
    }
  } else if (u.includes('/')) {
    const parts = u.split('/');
    if (parts.length >= 3) {
      host = parts[0];
      org = parts[1];
      repo = parts[2];
    } else {
      org = parts[0];
      repo = parts[1];
    }
  } else if (u.length > 0) {
    repo = u;
  }

  const slug = repo.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return {
    rawUrl: inputUrl,
    host,
    org,
    repo,
    slug,
    canonicalRepo: `${host}/${org}/${repo}`,
  };
}

/**
 * Infer project archetype based on repository name, keywords, and local file contents
 */
function detectArchetype(parsed, localPath = null) {
  const name = (parsed.repo || '').toLowerCase();

  // If local directory exists, inspect files
  if (localPath && fs.existsSync(localPath)) {
    const pkgJsonPath = path.join(localPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.electron || deps['electron-builder'] || (pkg.main && pkg.main.includes('main.js') && name.includes('desktop'))) {
          return 'desktop-app';
        }
        if (deps['react-native'] || deps.expo || deps['@capacitor/core']) {
          if (name.includes('game')) return 'mobile-game';
          return 'mobile-app';
        }
        if (deps.next || deps.nuxt || deps.svelte || deps.vue || deps['@angular/core'] || deps.vite || deps['react-scripts'] || (deps.react && !deps.electron && !deps['react-native'])) {
          return 'frontend-app';
        }
        if (pkg.bin || deps.commander || deps.yargs || deps.ink) {
          return 'console-app';
        }
      } catch {}
    }
  }

  // Name / keyword heuristics
  if (name.includes('mobile-game') || name.includes('game-mobile') || (name.includes('game') && (name.includes('mobile') || name.includes('android') || name.includes('ios')))) {
    return 'mobile-game';
  }
  if (name.includes('pc-game') || name.includes('game-pc') || (name.includes('game') && (name.includes('pc') || name.includes('desktop') || name.includes('steam') || name.includes('unreal') || name.includes('bevy') || name.includes('unity')))) {
    return 'pc-game';
  }
  if (name.includes('game')) {
    return 'pc-game';
  }
  if (name.includes('desktop') || name.includes('electron') || name.includes('tauri') || name.includes('studio') || name.includes('gui')) {
    return 'desktop-app';
  }
  if (name.includes('cli') || name.includes('ctl') || name.includes('console') || name.includes('tool') || name.includes('command')) {
    return 'console-app';
  }
  if (name.includes('mobile') || name.includes('android') || name.includes('ios') || name.includes('app-client')) {
    return 'mobile-app';
  }
  if (name.includes('frontend') || name.includes('front-end') || name.includes('webapp') || name.includes('web-app') || name.includes('client-web') || name.includes('portal') || (name.includes('web') && !name.includes('web-api') && !name.includes('gateway'))) {
    return 'frontend-app';
  }
  if (name.includes('pipeline') || name.includes('worker') || name.includes('stream') || name.includes('etl') || name.includes('spark') || name.includes('event-bus')) {
    return 'data-pipeline';
  }
  if (name.includes('common') || name.includes('sdk') || name.includes('lib') || name.includes('client-sdk') || name.includes('types')) {
    return 'library';
  }

  // Default to microservice / backend API
  return 'microservice';
}

/**
 * Detects programming language / technology stack
 */
function detectTechnology(parsed, archetype, localPath = null) {
  const name = (parsed.repo || '').toLowerCase();

  if (archetype === 'pc-game') {
    if (name.includes('unity')) return 'C# / Unity 6';
    if (name.includes('godot')) return 'Godot 4.2 / GDScript';
    if (name.includes('rust') || name.includes('bevy')) return 'Rust 1.78 / Bevy';
    return 'C++ / Unreal Engine 5';
  }
  if (archetype === 'mobile-game') {
    if (name.includes('godot')) return 'Godot 4.2 / C#';
    if (name.includes('unreal')) return 'C++ / Unreal Engine 5';
    return 'C# / Unity 6';
  }
  if (archetype === 'frontend-app') {
    if (name.includes('vue')) return 'Vue 3 / Vite / TypeScript';
    if (name.includes('next')) return 'Next.js 14 / React / TypeScript';
    if (name.includes('svelte')) return 'SvelteKit / TypeScript';
    if (name.includes('angular')) return 'Angular 18 / TypeScript';
    return 'React 18 / Vite / TypeScript';
  }

  if (name.includes('java') || name.includes('spring') || name.includes('petstore-api')) {
    return 'Java 21 / Spring Boot 3';
  }
  if (name.includes('go') || name.includes('golang') || name.includes('auth-go') || name.includes('gin')) {
    return 'Go 1.22 / Gin / gRPC';
  }
  if (name.includes('python') || name.includes('fastapi') || name.includes('celery') || name.includes('pipeline')) {
    return 'Python 3.11 / FastAPI / Celery';
  }
  if (name.includes('rust')) {
    return 'Rust 1.78 / Tokio';
  }
  if (archetype === 'desktop-app') {
    return 'Electron 29 / Node.js 20';
  }
  if (archetype === 'mobile-app') {
    return 'React Native 0.73 / TypeScript';
  }
  if (name.includes('web') || name.includes('react') || name.includes('vite')) {
    return 'React 18 / Vite / TypeScript';
  }

  return 'Node.js 20 / TypeScript';
}

/**
 * Generates an OpenAPI 3.1 YAML specification model for a microservice
 */
function generateOpenApiYaml(serviceName, slug, parsed) {
  const capSlug = slug.charAt(0).toUpperCase() + slug.slice(1);
  return `openapi: 3.1.0
info:
  title: ${serviceName} REST API
  description: High-performance microservice contract for ${serviceName} in RobOS Universe.
  version: 1.0.0
servers:
  - url: https://${parsed.host}/api/v1/${slug}
    description: Production Gateway
  - url: http://localhost:8080
    description: Local Dev Container
tags:
  - name: Core
    description: Primary operations
  - name: Health
    description: Service diagnostics and liveliness
paths:
  /api/v1/${slug}:
    get:
      tags: [Core]
      summary: Retrieve all ${slug} items
      operationId: list${capSlug}Items
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            default: 50
      responses:
        '200':
          description: Successful query result
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/${capSlug}Item'
    post:
      tags: [Core]
      summary: Create new ${slug} entry
      operationId: create${capSlug}Item
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/${capSlug}Item'
      responses:
        '201':
          description: Resource created successfully
  /api/v1/${slug}/{id}:
    get:
      tags: [Core]
      summary: Get ${slug} by identifier
      operationId: get${capSlug}ById
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Resource found
        '404':
          description: Item not found
  /healthz:
    get:
      tags: [Health]
      summary: Liveness and readiness probe
      responses:
        '200':
          description: Service is healthy and operational
components:
  schemas:
    ${capSlug}Item:
      type: object
      required:
        - id
        - name
        - createdAt
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
          example: 'Primary ${slug} record'
        status:
          type: string
          enum: [ACTIVE, PENDING, ARCHIVED]
          default: ACTIVE
        createdAt:
          type: string
          format: date-time
`;
}

/**
 * Bulk Repository Importer & Parser Engine
 */
class BulkRepoImporter {
  constructor(options = {}) {
    this.defaultTeam = options.defaultTeam || 'urn:robos:team:core-platform';
    this.defaultProject = options.defaultProject || 'urn:robos:project:acme-petshop';
  }

  /**
   * Imports a list of Git repository URLs or local paths into Knowledge Graph nodes
   * @param {Array<string|Object>} repositories - Array of URLs, strings, or git-projects objects
   * @returns {Object} { nodes: Array, contracts: Array, summary: Object }
   */
  importRepositories(repositories = []) {
    const generatedNodes = [];
    const createdContracts = [];
    const summary = {
      total: repositories.length,
      microservices: 0,
      desktopApps: 0,
      consoleApps: 0,
      mobileApps: 0,
      dataPipelines: 0,
      libraries: 0,
      frontendApps: 0,
      pcGames: 0,
      mobileGames: 0,
      contracts: 0,
    };

    for (const repoInput of repositories) {
      const rawUrl = typeof repoInput === 'string' ? repoInput : (repoInput.url || repoInput.sshUrl || repoInput.repo || '');
      const localPath = typeof repoInput === 'object' ? repoInput.localPath : null;
      const parsed = parseGitUrl(rawUrl);
      if (!parsed.slug || parsed.slug === 'unnamed-repo') continue;

      const archetype = detectArchetype(parsed, localPath);
      const technology = detectTechnology(parsed, archetype, localPath);
      const title = (typeof repoInput === 'object' && repoInput.label)
        ? repoInput.label.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : parsed.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      // 1. Generate Contract for microservices / services
      let contractId = null;
      if (archetype === 'microservice' || archetype === 'library') {
        contractId = `urn:robos:contract:${parsed.slug}-v1`;
        const openApiYaml = generateOpenApiYaml(title, parsed.slug, parsed);
        const contractNode = {
          '@id': contractId,
          '@type': ['robos:Contract', 'c4:Component', 'oslc:Resource'],
          'dcterms:title': `${title} OpenAPI 3.1 Spec`,
          'robos:specFile': `specs/contracts/${parsed.slug}-v1.yaml`,
          'robos:protocol': 'OpenAPI 3.1',
          'robos:contractYaml': openApiYaml,
          'robos:repository': parsed.canonicalRepo,
          'robos:endpoints': [
            { path: `/api/v1/${parsed.slug}`, method: 'GET', description: `List ${title} records` },
            { path: `/api/v1/${parsed.slug}`, method: 'POST', description: `Create ${title} record` },
            { path: `/api/v1/${parsed.slug}/{id}`, method: 'GET', description: `Get ${title} by ID` },
            { path: '/healthz', method: 'GET', description: 'Health check' },
          ],
        };
        createdContracts.push(contractNode);
        generatedNodes.push(contractNode);
        summary.contracts++;
      }

      // 2. Build archetype-specific KGraph Node
      let appNode = null;

      switch (archetype) {
        case 'desktop-app': {
          appNode = {
            '@id': `urn:robos:desktop-app:${parsed.slug}`,
            '@type': ['robos:DesktopApp', 'oslc_am:Resource', 'c4:Container'],
            'dcterms:title': title.includes('Desktop') || title.includes('App') ? title : `${title} Desktop App`,
            'dcterms:description': `Local workstation desktop application for ${title}, built with modern Electron runtime.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:desktopFramework': 'Electron',
            'robos:executableName': `${parsed.slug}-gui`,
            'robos:windowConfig': {
              defaultWidth: 1200,
              defaultHeight: 800,
              resizable: true,
              frameless: false,
            },
            'robos:ipcBridge': true,
            'robos:desktopCategory': 'Development',
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          summary.desktopApps++;
          break;
        }

        case 'console-app': {
          appNode = {
            '@id': `urn:robos:console-app:${parsed.slug}`,
            '@type': ['robos:ConsoleApp', 'oslc_am:Resource', 'c4:Container'],
            'dcterms:title': title.includes('CLI') || title.includes('Command') ? title : `${title} CLI`,
            'dcterms:description': `Command-line terminal tool providing automated workflows and administration for ${title}.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:cliCommand': parsed.slug.replace(/-(cli|console|tool)$/, ''),
            'robos:subcommands': [
              { name: 'init', description: 'Initialize local workspace and credentials' },
              { name: 'deploy', description: 'Deploy artifacts to targeted cluster or environment' },
              { name: 'status', description: 'Inspect health and operational status' },
              { name: 'logs', description: 'Stream aggregated logs with live tail' },
              { name: 'rollback', description: 'Revert to previous revision' },
            ],
            'robos:globalFlags': [
              { flag: '--verbose, -v', description: 'Enable verbose debug tracing' },
              { flag: '--config, -c', description: 'Path to configuration manifest' },
              { flag: '--output, -o', description: 'Output format (json, yaml, text)' },
            ],
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          summary.consoleApps++;
          break;
        }

        case 'mobile-app': {
          appNode = {
            '@id': `urn:robos:mobile-app:${parsed.slug}`,
            '@type': ['robos:MobileApp', 'oslc_am:Resource', 'c4:Container'],
            'dcterms:title': title.includes('Mobile') ? title : `${title} Mobile`,
            'dcterms:description': `Native multi-platform mobile application supporting iOS and Android devices.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:platform': ['iOS', 'Android'],
            'robos:bundleId': `com.robos.${parsed.slug.replace(/-/g, '')}`,
            'robos:minOsVersion': { ios: '16.0', android: '13.0' },
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          summary.mobileApps++;
          break;
        }

        case 'data-pipeline': {
          appNode = {
            '@id': `urn:robos:pipeline:${parsed.slug}`,
            '@type': ['robos:DataPipeline', 'oslc_am:Resource', 'c4:Container'],
            'dcterms:title': title.includes('Pipeline') || title.includes('Worker') ? title : `${title} Stream Pipeline`,
            'dcterms:description': `Real-time asynchronous stream processor and distributed task worker.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:pipelineEngine': 'Kafka Streams',
            'robos:inputTopics': [`events.${parsed.slug}.raw`],
            'robos:outputTopics': [`events.${parsed.slug}.curated`, `events.${parsed.slug}.metrics`],
            'robos:schedule': 'Continuous Event-Driven',
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          summary.dataPipelines++;
          break;
        }

        case 'library': {
          appNode = {
            '@id': `urn:robos:library:${parsed.slug}`,
            '@type': ['robos:Library', 'oslc_am:Resource', 'c4:Component'],
            'dcterms:title': title.includes('SDK') || title.includes('Lib') ? title : `${title} SDK`,
            'dcterms:description': `Reusable SDK and client contract library for ${title}.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:packageType': 'npm / maven',
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          if (contractId) appNode['robos:definesContract'] = contractId;
          summary.libraries++;
          break;
        }

        case 'frontend-app': {
          let framework = 'React';
          if (technology.includes('Vue')) framework = 'Vue';
          else if (technology.includes('Next')) framework = 'Next.js';
          else if (technology.includes('Svelte')) framework = 'Svelte';
          else if (technology.includes('Angular')) framework = 'Angular';

          appNode = {
            '@id': `urn:robos:frontend-app:${parsed.slug}`,
            '@type': ['robos:FrontEndApp', 'schema:WebApplication', 'oslc_am:Resource', 'c4:Container'],
            'dcterms:title': title.includes('App') || title.includes('Web') || title.includes('UI') ? title : `${title} Web App`,
            'dcterms:description': `Modern single-page frontend web application for ${title}, built with ${framework}.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:frontendFramework': framework,
            'robos:buildTool': technology.includes('Vite') ? 'Vite' : 'Webpack',
            'robos:devServerPort': 3000,
            'schema:browserRequirements': 'Requires HTML5 and modern evergreen browser with JavaScript enabled.',
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          summary.frontendApps++;
          break;
        }

        case 'pc-game': {
          let engine = 'Unreal Engine';
          if (technology.includes('Unity')) engine = 'Unity';
          else if (technology.includes('Godot')) engine = 'Godot';
          else if (technology.includes('Bevy')) engine = 'Bevy';

          appNode = {
            '@id': `urn:robos:pc-game:${parsed.slug}`,
            '@type': ['robos:PCGame', 'schema:VideoGame', 'oslc_am:Resource', 'c4:Container'],
            'dcterms:title': title.includes('Game') ? title : `${title} PC Game`,
            'dcterms:description': `Interactive PC video game for ${title}, powered by ${engine}.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:gameEngine': engine,
            'robos:targetPlatform': ['Windows', 'Linux', 'macOS'],
            'robos:graphicsApi': 'DirectX 12 / Vulkan',
            'schema:gamePlatform': 'PC',
            'schema:playMode': 'SinglePlayer',
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          summary.pcGames++;
          break;
        }

        case 'mobile-game': {
          let engine = 'Unity';
          if (technology.includes('Godot')) engine = 'Godot';
          else if (technology.includes('Unreal')) engine = 'Unreal Engine';

          appNode = {
            '@id': `urn:robos:mobile-game:${parsed.slug}`,
            '@type': ['robos:MobileGame', 'schema:VideoGame', 'schema:MobileApplication', 'oslc_am:Resource', 'c4:Container'],
            'dcterms:title': title.includes('Game') ? title : `${title} Mobile Game`,
            'dcterms:description': `Interactive mobile video game for ${title}, supporting iOS and Android.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:gameEngine': engine,
            'robos:platform': ['iOS', 'Android'],
            'robos:bundleId': `com.robos.game.${parsed.slug.replace(/-/g, '')}`,
            'schema:gamePlatform': ['iOS', 'Android'],
            'schema:playMode': 'SinglePlayer',
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
          };
          summary.mobileGames++;
          break;
        }

        default: {
          // Microservice
          appNode = {
            '@id': `urn:robos:service:${parsed.slug}`,
            '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
            'dcterms:title': `${title} Service`,
            'dcterms:description': `Backend microservice powering ${title} capabilities with containerized deployment.`,
            'robos:repository': parsed.canonicalRepo,
            'robos:technology': technology,
            'robos:implementsContract': contractId,
            'robos:ownerTeam': this.defaultTeam,
            'robos:hasProject': this.defaultProject,
            'robos:ports': [8080],
            'robos:healthCheckUrl': '/healthz',
          };
          summary.microservices++;
          break;
        }
      }

      if (appNode) {
        if (parsed.org && parsed.org !== 'acme-org') {
          appNode['robos:inOrganization'] = `urn:robos:git-org:${parsed.org.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
        }
        // Link Git Projects metadata if localPath exists
        if (localPath) {
          appNode['robos:localPath'] = localPath;
        }
        if (typeof repoInput === 'object' && repoInput.id) {
          appNode['robos:gitProjectId'] = repoInput.id;
        }
        generatedNodes.push(appNode);
      }
    }

    // Synthesize GitProjectOrganization nodes for discovered forge organizations
    const orgsMap = new Map();
    for (const node of generatedNodes) {
      if (node['robos:inOrganization']) {
        const orgId = node['robos:inOrganization'];
        if (!orgsMap.has(orgId)) {
          const orgSlug = orgId.replace('urn:robos:git-org:', '');
          orgsMap.set(orgId, {
            '@id': orgId,
            '@type': ['robos:GitProjectOrganization', 'robos:GitOrganization', 'schema:Organization', 'oslc:Resource'],
            'dcterms:title': orgSlug.charAt(0).toUpperCase() + orgSlug.slice(1),
            'dcterms:description': `Git Project Organization for ${orgSlug}.`,
            'robos:orgName': orgSlug,
            'robos:url': `https://github.com/${orgSlug}`,
            'robos:forgeType': 'github',
            'robos:visibility': 'public',
            'robos:hasRepository': [],
            'robos:documentation': {
              docsUrl: `https://github.com/${orgSlug}`,
              docsPaths: ['docs/index.md', 'README.md', 'CONTRIBUTING.md'],
              license: 'Apache-2.0',
            },
            'robos:agentRules': [],
            'robos:agentRulesDoc': 'AGENTS.md',
            'robos:package': 'organization',
            'robos:namespace': 'robos.org',
          });
        }
        if (node['robos:repository']) {
          const orgObj = orgsMap.get(orgId);
          if (!orgObj['robos:hasRepository'].includes(node['robos:repository'])) {
            orgObj['robos:hasRepository'].push(node['robos:repository']);
          }
        }
      }
    }

    summary.organizations = orgsMap.size;
    if (this.createOrganizations !== false) {
      for (const orgNode of orgsMap.values()) {
        orgNode['robos:repoCount'] = orgNode['robos:hasRepository'].length;
        generatedNodes.push(orgNode);
      }
    }

    return {
      nodes: generatedNodes,
      contracts: createdContracts,
      summary,
    };
  }
}

module.exports = {
  BulkRepoImporter,
  parseGitUrl,
  detectArchetype,
  detectTechnology,
  generateOpenApiYaml,
};
