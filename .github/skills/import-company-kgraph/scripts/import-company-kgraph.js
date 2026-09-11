#!/usr/bin/env node
'use strict';

/**
 * RobOS Company Knowledge Graph Importer CLI & Engine
 *
 * Imports company, organization, or team repository and component entries
 * from ANY source: HTTP/HTTPS, local filesystem, AWS S3, or Git URLs,
 * and generates validated OSLC JSON-LD Knowledge Graph file(s) for RobOS.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Try requiring BulkRepoImporter and KGraphResourceImporter from robos-graph if available
let BulkRepoImporter = null;
let KGraphResourceImporter = null;
try {
  const possiblePaths = [
    path.join(__dirname, '../../../../../packages/robos-graph/lib/resource-importer.js'),
    path.join(__dirname, '../../../../packages/robos-graph/lib/resource-importer.js'),
    '/usr/local/share/robos/robos-graph/lib/resource-importer.js',
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      KGraphResourceImporter = require(p).KGraphResourceImporter;
      break;
    }
  }
} catch {}
try {
  const possiblePaths = [
    path.join(__dirname, '../../../../../packages/robos-graph/lib/bulk-repo-importer.js'),
    path.join(__dirname, '../../../../packages/robos-graph/lib/bulk-repo-importer.js'),
    '/usr/local/share/robos/robos-graph/lib/bulk-repo-importer.js',
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      BulkRepoImporter = require(p).BulkRepoImporter;
      break;
    }
  }
} catch {
  // fallback inline
}

// OSLC JSON-LD Context
const OSLC_CONTEXT = {
  oslc: 'http://open-services.net/ns/core#',
  oslc_am: 'http://open-services.net/ns/am#',
  oslc_rm: 'http://open-services.net/ns/rm#',
  oslc_cm: 'http://open-services.net/ns/cm#',
  dcterms: 'http://purl.org/dc/terms/',
  c4: 'http://robos.dev/c4#',
  robos: 'http://robos.dev/ontology#',
  schema: 'https://schema.org/',
};

/**
 * Parse CLI Arguments
 */
function parseArgs(args) {
  const options = {
    source: null,
    sourceType: 'auto',
    prompt: null,
    resources: [],
    output: null,
    companyName: 'Acme Global',
    companySlug: 'acme',
    defaultTeam: 'urn:robos:team:core-platform',
    defaultProject: 'urn:robos:project:enterprise-core',
    packageId: 'services',
    importToRobos: false,
    dryRun: false,
    demo: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--source' || a === '-s') {
      options.source = args[++i];
    } else if (a === '--prompt' || a === '-P') {
      options.prompt = args[++i];
    } else if (a === '--resources' || a === '-R') {
      const val = args[++i];
      if (val) {
        options.resources = val.split(',').map(s => s.trim()).filter(Boolean);
      }
    } else if (a === '--source-type' || a === '-t') {
      options.sourceType = args[++i];
    } else if (a === '--output' || a === '-o') {
      options.output = args[++i];
    } else if (a === '--company-name' || a === '-n') {
      options.companyName = args[++i];
    } else if (a === '--company-slug') {
      options.companySlug = args[++i];
    } else if (a === '--default-team') {
      options.defaultTeam = args[++i];
    } else if (a === '--package' || a === '-p') {
      options.packageId = args[++i];
    } else if (a === '--import-to-robos') {
      options.importToRobos = true;
    } else if (a === '--dry-run') {
      options.dryRun = true;
    } else if (a === '--demo') {
      options.demo = true;
    } else if (a === '--verbose' || a === '-v') {
      options.verbose = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.source && !options.prompt && (!options.resources || options.resources.length === 0)) {
    printHelp();
    console.error('\nError: Missing required argument: provide --prompt <text>, --source <path|url|s3-uri>, or --resources <list>');
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
Company Knowledge Graph Importer (import-company-kgraph)
========================================================
Extract tracked local Git sources into an evidence-backed review proposal.
Production imports do not fetch remote catalogs, clone repos, or invent contracts.

Production usage (long flags):
  node import-company-kgraph.js --manifest sources.json --paths local.json \\
    --graph-root /work/graph --output proposal.json

Options:
  --manifest <file>       Portable namespace/title/sources manifest, parsed as JSON
  --paths <file>          Separate source-ID-to-absolute-checkout JSON map
  --graph-root <path>     Explicit workspace root (or its .robos directory)
  --output <file>         Review proposal envelope, not standalone JSON-LD
  --dry-run              Print coverage, validation and conflicts without saving
  --prompt <text>         Optional review note in manifest mode, not discovery
  --help, -h             Show help (invoke separately from a manifest import)

Input format:
  sources.json: {"namespace":"sample","title":"Sample system",
    "sources":[{"id":"api","exclude":["fixtures/large"]}],"exclude":["archive"]}
  local.json: {"api":"/work/checkouts/api"}
  sources.yaml is accepted only with JSON-subset contents; no YAML-only syntax.
  Optional source URLs check actual origins; they do not clone or fetch.
  Exclusions are relative path prefixes, not globs. Built-in exclusions also apply.
  includeUnsupported defaults to false: unsupported files remain in inventory.

Outputs and review:
  proposal.json contains candidate, base hashes, delta, validation and conflicts.
  proposal.json.sources.json contains portable provenance, coverage and inventory.
  Inspect evidence, unknowns, dirty files, extraction gaps and retained stale nodes.
  artifactFiles (extractedFiles alias) is representation, not semantic completeness.
  Do not modify a saved proposal: its ID hashes its contents. Apply separately:
    kgraph apply --graph-root /work/graph --file proposal.json
    kgraph inspect --graph-root /work/graph --require-evidence

Iterative refinement:
  kgraph context --graph-root /work/graph --limit 40 --output context.json
  Record unknowns as questions; prepare evidence-backed structured edits.json.
  Recheck context revision before proposing. Review the draft before applying:
  kgraph propose --graph-root /work/graph --mode refine --file edits.json \\
    --require-evidence --output refinement.json
  kgraph apply --graph-root /work/graph --file refinement.json

Legacy demos only (not production architecture evidence):
  --demo --source <input>
  --demo --prompt <text>
  --demo --resources <list>
  Legacy direct-merge flags are not the canonical source-backed workflow.
`);
}

/**
 * Normalizes Git URL to repo metadata
 */
function parseGitUrl(inputUrl) {
  let u = (inputUrl || '').trim().replace(/\.git$/, '');
  let host = 'github.com';
  let org = 'company';
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
      org = parts[0] || 'company';
      repo = parts[1] || 'unnamed-repo';
    } catch {}
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
 * Detect Archetype from parsed URL and local files
 */
function detectArchetype(parsed, localPath = null) {
  const name = (parsed.repo || '').toLowerCase();

  if (localPath && fs.existsSync(localPath)) {
    const pkgJsonPath = path.join(localPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.electron || deps['electron-builder']) return 'desktop-app';
        if (deps['react-native'] || deps.expo) {
          if (name.includes('game')) return 'mobile-game';
          return 'mobile-app';
        }
        if (deps.next || deps.nuxt || deps.svelte || deps.vue || deps.vite || deps.react) {
          return 'frontend-app';
        }
        if (pkg.bin || deps.commander || deps.yargs) return 'console-app';
      } catch {}
    }
  }

  if (name.includes('mobile-game') || name.includes('game-mobile')) return 'mobile-game';
  if (name.includes('pc-game') || name.includes('game-pc') || name.includes('game')) return 'pc-game';
  if (name.includes('desktop') || name.includes('electron') || name.includes('gui')) return 'desktop-app';
  if (name.includes('cli') || name.includes('ctl') || name.includes('console') || name.includes('tool')) return 'console-app';
  if (name.includes('mobile') || name.includes('android') || name.includes('ios')) return 'mobile-app';
  if (name.includes('frontend') || name.includes('front-end') || name.includes('webapp') || name.includes('web-app') || name.includes('client-web') || name.includes('portal')) return 'frontend-app';
  if (name.includes('pipeline') || name.includes('worker') || name.includes('stream') || name.includes('etl') || name.includes('spark')) return 'data-pipeline';
  if (name.includes('common') || name.includes('sdk') || name.includes('lib')) return 'library';

  return 'microservice';
}

/**
 * Detect Technology Stack
 */
function detectTechnology(parsed, archetype, localPath = null) {
  const name = (parsed.repo || '').toLowerCase();
  if (archetype === 'pc-game') return name.includes('unity') ? 'C# / Unity 6' : (name.includes('godot') ? 'Godot 4.2 / GDScript' : 'C++ / Unreal Engine 5');
  if (archetype === 'mobile-game') return name.includes('godot') ? 'Godot 4.2 / C#' : 'C# / Unity 6';
  if (archetype === 'frontend-app') return name.includes('vue') ? 'Vue 3 / Vite / TypeScript' : (name.includes('next') ? 'Next.js 14 / React' : 'React 18 / Vite / TypeScript');
  if (name.includes('java') || name.includes('spring')) return 'Java 21 / Spring Boot 3';
  if (name.includes('go') || name.includes('gin')) return 'Go 1.22 / Gin';
  if (name.includes('python') || name.includes('fastapi')) return 'Python 3.11 / FastAPI';
  if (name.includes('rust')) return 'Rust 1.78 / Tokio';
  if (archetype === 'desktop-app') return 'Electron 29 / Node.js 20';
  if (archetype === 'mobile-app') return 'React Native 0.73 / TypeScript';
  return 'Node.js 20 / TypeScript';
}

/**
 * Ingestion Source Fetcher: HTTP, Filesystem, S3
 */
async function fetchSourceData(source, sourceType, verbose = false) {
  let effectiveType = sourceType;

  if (effectiveType === 'auto') {
    if (source.startsWith('s3://')) {
      effectiveType = 's3';
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      // If it points directly to a git forge repository (e.g. github.com/org/repo), treat as git-list
      const isDirectRepoUrl = source.endsWith('.git') ||
        (/^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/]+(\/)?$/.test(source.trim()));
      if (isDirectRepoUrl) {
        effectiveType = 'git-list';
      } else {
        effectiveType = 'http';
      }
    } else if (fs.existsSync(source) || source.includes(path.sep) || source.endsWith('.json') || source.endsWith('.yaml') || source.endsWith('.yml')) {
      effectiveType = 'file';
    } else {
      effectiveType = 'git-list';
    }
  }

  if (verbose) {
    console.log(`[import-company-kgraph] Detected source type: ${effectiveType} for source: ${source}`);
  }

  switch (effectiveType) {
    case 'http': {
      if (verbose) console.log(`[import-company-kgraph] Fetching remote HTTP resource: ${source}...`);
      let rawText = '';
      let fetchSuccess = false;
      if (typeof fetch === 'function') {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(source, {
            headers: { 'User-Agent': 'RobOS-KGraph-Importer/1.0' },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok) {
            rawText = await res.text();
            fetchSuccess = true;
          }
        } catch {
          // fallback
        }
      }
      if (!fetchSuccess) {
        // If it's a git forge URL that was attempted as HTTP, fallback to treating as git repo
        if (/github\.com|gitlab\.com|bitbucket\.org/.test(source)) {
          return [{ url: source }];
        }
        try {
          rawText = execSync(`curl -fsSL --connect-timeout 5 --max-time 10 "${source}"`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          });
        } catch (curlErr) {
          throw new Error(`HTTP fetch failed for ${source}: ${curlErr.message}`);
        }
      }
      return parseRawContent(rawText, source);
    }

    case 's3': {
      if (verbose) console.log(`[import-company-kgraph] Fetching AWS S3 resource: ${source}...`);
      try {
        const rawText = execSync(`aws s3 cp "${source}" -`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return parseRawContent(rawText, source);
      } catch (e) {
        throw new Error(`Failed to fetch from S3 (${source}). Ensure AWS CLI is configured or pass an HTTPS endpoint: ${e.message}`);
      }
    }

    case 'file': {
      if (!fs.existsSync(source)) {
        throw new Error(`Local file or directory not found: ${source}`);
      }
      const stat = fs.statSync(source);
      if (stat.isDirectory()) {
        if (verbose) console.log(`[import-company-kgraph] Scanning directory: ${source}...`);
        const entries = fs.readdirSync(source);
        const repoList = [];
        for (const entry of entries) {
          const fullPath = path.join(source, entry);
          if (fs.existsSync(path.join(fullPath, '.git')) || fs.existsSync(path.join(fullPath, 'package.json')) || fs.existsSync(path.join(fullPath, 'pom.xml'))) {
            repoList.push({
              repo: entry,
              localPath: fullPath,
              url: `https://github.com/company/${entry}`,
            });
          }
        }
        return repoList;
      } else {
        if (verbose) console.log(`[import-company-kgraph] Reading file: ${source}...`);
        const rawText = fs.readFileSync(source, 'utf8');
        return parseRawContent(rawText, source);
      }
    }

    case 'git-list':
    default: {
      const lines = source.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
      return lines.map(line => ({ url: line }));
    }
  }
}

/**
 * Parse raw file content (JSON, YAML, git-projects, Backstage catalog, or newline URLs)
 */
function parseRawContent(rawText, sourceHint) {
  const trimmed = rawText.trim();

  // Try JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      // Case 1: git-projects.json format { projects: [...] }
      if (parsed.projects && Array.isArray(parsed.projects)) {
        return parsed.projects;
      }
      // Case 2: Array of objects or URLs
      if (Array.isArray(parsed)) {
        return parsed;
      }
      // Case 3: Backstage catalog entity list { items: [...] }
      if (parsed.items && Array.isArray(parsed.items)) {
        return parsed.items.map(item => ({
          repo: item.metadata?.name,
          label: item.metadata?.title || item.metadata?.name,
          url: item.metadata?.annotations?.['github.com/project-slug'] 
            ? `https://github.com/${item.metadata.annotations['github.com/project-slug']}` 
            : `https://github.com/company/${item.metadata?.name || 'app'}`,
          description: item.metadata?.description,
          owner: item.spec?.owner,
        }));
      }
      // Case 4: GitHub Org Repos API response
      if (Array.isArray(parsed) && parsed[0]?.html_url) {
        return parsed.map(r => ({
          url: r.html_url,
          label: r.name,
          description: r.description,
          defaultBranch: r.default_branch,
        }));
      }
      // Case 5: Single object with repositories array
      if (parsed.repositories && Array.isArray(parsed.repositories)) {
        return parsed.repositories;
      }
      // Fallback single object
      return [parsed];
    } catch {
      // Not JSON, continue
    }
  }

  // Split lines (one Git URL per line or CSV)
  const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  return lines.map(line => {
    if (line.includes(',')) {
      const [url, label, owner] = line.split(',').map(s => s.trim());
      return { url, label, owner };
    }
    return { url: line };
  });
}

/**
 * Core Knowledge Graph Generation Engine
 */
function generateCompanyKnowledgeGraph(repoEntries, options = {}) {
  const companyName = options.companyName || 'Acme Global';
  const companySlug = options.companySlug || 'acme';
  const defaultTeam = options.defaultTeam || 'urn:robos:team:core-platform';
  const defaultProject = options.defaultProject || `urn:robos:project:${companySlug}-core`;

  const nodes = [];
  const contracts = [];
  const summary = {
    total: 0,
    microservices: 0,
    frontendApps: 0,
    desktopApps: 0,
    consoleApps: 0,
    mobileApps: 0,
    pcGames: 0,
    mobileGames: 0,
    dataPipelines: 0,
    libraries: 0,
    contracts: 0,
    teams: 1,
    company: 1,
  };

  // 1. Root Organization Node
  const orgNode = {
    '@id': `urn:robos:organization:${companySlug}`,
    '@type': ['oslc:Organization', 'robos:Company'],
    'dcterms:title': companyName,
    'dcterms:description': `Enterprise organization and technology ecosystem for ${companyName}.`,
    'robos:slug': companySlug,
    'robos:hasTeam': [defaultTeam],
  };
  nodes.push(orgNode);

  // 2. Default Team Node
  const teamNode = {
    '@id': defaultTeam,
    '@type': ['oslc:Group', 'robos:Team'],
    'dcterms:title': `${companyName} Core Platform Team`,
    'robos:topologyType': 'platform',
    'robos:memberOf': orgNode['@id'],
    'robos:lead': 'urn:robos:person:architect',
  };
  nodes.push(teamNode);

  // 3. Process each discovered repository / component
  for (const item of repoEntries) {
    const rawUrl = typeof item === 'string' ? item : (item.url || item.sshUrl || item.repo || item.html_url || '');
    const localPath = typeof item === 'object' ? item.localPath : null;
    const parsed = parseGitUrl(rawUrl);

    if (!parsed.slug || parsed.slug === 'unnamed-repo') continue;

    summary.total++;
    const archetype = detectArchetype(parsed, localPath);
    const technology = detectTechnology(parsed, archetype, localPath);
    const label = (typeof item === 'object' && item.label)
      ? item.label
      : parsed.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const description = (typeof item === 'object' && item.description)
      ? item.description
      : `${label} component in ${companyName} architecture.`;
    const owner = (typeof item === 'object' && item.owner)
      ? (item.owner.startsWith('urn:') ? item.owner : `urn:robos:team:${item.owner}`)
      : defaultTeam;

    // Build Contract for Microservices / Libraries
    let contractId = null;
    if (archetype === 'microservice' || archetype === 'library') {
      contractId = `urn:robos:contract:${parsed.slug}-v1`;
      const contractNode = {
        '@id': contractId,
        '@type': ['robos:Contract', 'c4:Component', 'oslc:Resource'],
        'dcterms:title': `${label} OpenAPI 3.1 Spec`,
        'robos:specFile': `specs/contracts/${parsed.slug}-v1.yaml`,
        'robos:protocol': 'OpenAPI 3.1',
        'robos:repository': parsed.canonicalRepo,
        'robos:endpoints': [
          { path: `/api/v1/${parsed.slug}`, method: 'GET', description: `List ${label} items` },
          { path: `/api/v1/${parsed.slug}`, method: 'POST', description: `Create ${label} item` },
          { path: `/api/v1/${parsed.slug}/{id}`, method: 'GET', description: `Get ${label} by ID` },
          { path: '/healthz', method: 'GET', description: 'Liveness probe' },
        ],
      };
      contracts.push(contractNode);
      nodes.push(contractNode);
      summary.contracts++;
    }

    // Build Component Node
    let node = null;
    switch (archetype) {
      case 'desktop-app':
        node = {
          '@id': `urn:robos:desktop-app:${parsed.slug}`,
          '@type': ['robos:DesktopApp', 'oslc_am:Resource', 'c4:Container'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:package': 'applications',
        };
        summary.desktopApps++;
        break;

      case 'frontend-app':
        node = {
          '@id': `urn:robos:frontend-app:${parsed.slug}`,
          '@type': ['robos:FrontEndApp', 'schema:WebApplication', 'c4:Container'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:package': 'applications',
        };
        summary.frontendApps++;
        break;

      case 'pc-game':
        node = {
          '@id': `urn:robos:pc-game:${parsed.slug}`,
          '@type': ['robos:PCGame', 'schema:VideoGame', 'c4:Container'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:package': 'applications',
        };
        summary.pcGames++;
        break;

      case 'mobile-game':
        node = {
          '@id': `urn:robos:mobile-game:${parsed.slug}`,
          '@type': ['robos:MobileGame', 'schema:VideoGame', 'schema:MobileApplication', 'c4:Container'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:package': 'applications',
        };
        summary.mobileGames++;
        break;

      case 'console-app':
        node = {
          '@id': `urn:robos:console-app:${parsed.slug}`,
          '@type': ['robos:ConsoleApp', 'c4:Component'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:package': 'applications',
        };
        summary.consoleApps++;
        break;

      case 'mobile-app':
        node = {
          '@id': `urn:robos:mobile-app:${parsed.slug}`,
          '@type': ['robos:MobileApp', 'c4:Container'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:package': 'applications',
        };
        summary.mobileApps++;
        break;

      case 'data-pipeline':
        node = {
          '@id': `urn:robos:pipeline:${parsed.slug}`,
          '@type': ['robos:DataPipeline', 'c4:Container'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:package': 'services',
        };
        summary.dataPipelines++;
        break;

      case 'library':
        node = {
          '@id': `urn:robos:library:${parsed.slug}`,
          '@type': ['robos:Library', 'c4:Component'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:implementsContract': contractId,
          'robos:package': 'services',
        };
        summary.libraries++;
        break;

      case 'microservice':
      default:
        node = {
          '@id': `urn:robos:microservice:${parsed.slug}`,
          '@type': ['robos:Microservice', 'c4:Container', 'oslc:Resource'],
          'dcterms:title': label,
          'dcterms:description': description,
          'robos:repository': parsed.canonicalRepo,
          'robos:technology': technology,
          'robos:owner': owner,
          'robos:implementsContract': contractId,
          'robos:package': 'services',
        };
        summary.microservices++;
        break;
    }

    if (node) {
      nodes.push(node);
    }
  }

  const jsonLdDocument = {
    '@context': OSLC_CONTEXT,
    'robos:organization': orgNode['@id'],
    'robos:title': `${companyName} SDLC Knowledge Graph`,
    'robos:generatedAt': new Date().toISOString(),
    'robos:nodes': nodes,
  };

  return { jsonLdDocument, summary };
}

/**
 * Merge generated nodes directly into RobOS workspace (.robos/ and git-projects.json)
 */
function mergeIntoRobosWorkspace(jsonLdDoc, repoEntries, options = {}) {
  const robosDir = path.join(process.cwd(), '.robos');
  const kgraphsDir = path.join(robosDir, 'kgraphs');
  const packagesYamlPath = path.join(robosDir, 'packages.yaml');
  const aggregatedKGraphPath = path.join(robosDir, 'knowledge-graph.jsonld');
  const gitProjectsPath = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');

  fs.mkdirSync(kgraphsDir, { recursive: true });
  fs.mkdirSync(path.dirname(gitProjectsPath), { recursive: true });

  // 1. Update .robos/knowledge-graph.jsonld
  let existingGraph = { '@context': OSLC_CONTEXT, 'robos:nodes': [] };
  if (fs.existsSync(aggregatedKGraphPath)) {
    try {
      existingGraph = JSON.parse(fs.readFileSync(aggregatedKGraphPath, 'utf8'));
    } catch {}
  }
  const existingNodeIds = new Set((existingGraph['robos:nodes'] || []).map(n => n['@id']));
  let addedNodesCount = 0;
  for (const node of jsonLdDoc['robos:nodes']) {
    if (!existingNodeIds.has(node['@id'])) {
      existingGraph['robos:nodes'].push(node);
      existingNodeIds.add(node['@id']);
      addedNodesCount++;
    }
  }
  fs.writeFileSync(aggregatedKGraphPath, JSON.stringify(existingGraph, null, 2), 'utf8');

  // 2. Update .robos/kgraphs/ services and applications packages
  for (const targetPkg of ['services', 'applications', 'organization']) {
    const pkgDir = path.join(kgraphsDir, targetPkg);
    fs.mkdirSync(pkgDir, { recursive: true });
    const pkgJsonldPath = path.join(pkgDir, 'package.jsonld');
    let pkgGraph = { '@context': OSLC_CONTEXT, 'robos:nodes': [] };
    if (fs.existsSync(pkgJsonldPath)) {
      try {
        pkgGraph = JSON.parse(fs.readFileSync(pkgJsonldPath, 'utf8'));
      } catch {}
    }
    const pkgNodeIds = new Set((pkgGraph['robos:nodes'] || []).map(n => n['@id']));
    for (const node of jsonLdDoc['robos:nodes']) {
      const nodePkg = node['robos:package'] || (targetPkg === 'organization' && node['@type']?.includes('Team') ? 'organization' : null);
      if (nodePkg === targetPkg && !pkgNodeIds.has(node['@id'])) {
        pkgGraph['robos:nodes'].push(node);
        pkgNodeIds.add(node['@id']);
      }
    }
    fs.writeFileSync(pkgJsonldPath, JSON.stringify(pkgGraph, null, 2), 'utf8');
  }

  // 3. Register Git projects in ~/.config/robos/git-projects.json
  let existingProjectsData = { projects: [] };
  if (fs.existsSync(gitProjectsPath)) {
    try {
      existingProjectsData = JSON.parse(fs.readFileSync(gitProjectsPath, 'utf8'));
    } catch {}
  }
  const existingUrls = new Set((existingProjectsData.projects || []).map(p => (p.url || '').replace(/\.git$/, '')));
  let addedProjectsCount = 0;
  for (const item of repoEntries) {
    const url = typeof item === 'string' ? item : (item.url || item.sshUrl || item.html_url || '');
    if (!url) continue;
    const cleanUrl = url.replace(/\.git$/, '');
    if (!existingUrls.has(cleanUrl)) {
      const parsed = parseGitUrl(url);
      existingProjectsData.projects.push({
        id: parsed.slug,
        label: (typeof item === 'object' && item.label) ? item.label : parsed.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        url: url,
        localPath: path.join(os.homedir(), 'source', parsed.slug),
        defaultBranch: 'main',
        group: options.companySlug || 'company',
      });
      existingUrls.add(cleanUrl);
      addedProjectsCount++;
    }
  }
  fs.writeFileSync(gitProjectsPath, JSON.stringify(existingProjectsData, null, 2), 'utf8');

  return { addedNodesCount, addedProjectsCount };
}

/**
 * Main CLI Execution Entrypoint
 */
async function main() {
  // Evidence-backed imports use an explicit source manifest and external graph.
  // This route never writes to the checkout containing this skill or global config.
  if (process.argv.includes('--manifest')) {
    const flags = {};
    for (let i = 2; i < process.argv.length; i++) {
      const key = process.argv[i];
      if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
      flags[key.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
    }
    const { extractSources } = require('../../../../../packages/robos-graph/lib/source-extractor');
    const { GraphWorkspace, serialize } = require('../../../../../packages/robos-graph/lib/graph-workspace');
    if (typeof flags.paths !== 'string' || typeof flags['graph-root'] !== 'string') throw new Error('--manifest requires --paths <local.json> and --graph-root <workspace>');
    const manifest = JSON.parse(fs.readFileSync(flags.manifest, 'utf8'));
    const localPaths = JSON.parse(fs.readFileSync(flags.paths, 'utf8'));
    const extracted = extractSources(manifest, localPaths);
    const workspace = new GraphWorkspace(flags['graph-root']);
    const proposal = workspace.propose({ document: extracted.document, prompt: flags.prompt || 'Import declared source manifest', requireEvidence: true });
    if (flags['dry-run']) {
      console.log(serialize({ coverage: extracted.coverage, warnings: extracted.warnings, delta: { added: proposal.delta.added.length, changed: proposal.delta.changed.length, removed: proposal.delta.removed.length }, validation: proposal.validation, conflicts: proposal.conflicts }));
    } else {
      if (typeof flags.output !== 'string') throw new Error('Provide --output <proposal.json>; applying is a separate review step');
      fs.mkdirSync(path.dirname(path.resolve(flags.output)), { recursive: true });
      fs.writeFileSync(flags.output, serialize(proposal));
      fs.writeFileSync(flags.output + '.sources.json', serialize({ sources: extracted.sources, coverage: extracted.coverage, warnings: extracted.warnings, inventory: extracted.inventory || [] }));
      console.log(serialize({ output: flags.output, nodes: proposal.candidate['robos:nodes'].length, conforms: proposal.validation.conforms, conflicts: proposal.conflicts.length }));
    }
    if (!proposal.validation.conforms || proposal.conflicts.length) process.exitCode = 1;
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  if (!options.demo) throw new Error('Use --manifest, --paths and --graph-root for evidence-backed imports. Legacy heuristic examples require explicit --demo and must not be used as architecture evidence.');

  // Case 1: Agent Natural Language Prompt Mode
  if (options.prompt) {
    console.log(`\n🤖 RobOS Agent Prompt Knowledge Graph Ingestion`);
    console.log(`────────────────────────────────────────────────────────`);
    console.log(`Prompt: "${options.prompt}"`);

    try {
      if (!KGraphResourceImporter) {
        throw new Error('KGraphResourceImporter could not be loaded from robos-graph package.');
      }
      const importer = new KGraphResourceImporter(options);
      const { plan, importResult, summary } = await importer.importFromPrompt(options.prompt, options);

      console.log(`\nAgent Prompt Analysis Plan:`);
      console.log(`  • Company:       ${plan.company.name} (${plan.company.slug})`);
      console.log(`  • Discovered:    ${plan.summary.totalResources} resource target(s)`);
      if (plan.summary.confluenceWikis) console.log(`    - Confluence wikis:   ${plan.summary.confluenceWikis}`);
      if (plan.summary.githubOrgs) console.log(`    - GitHub orgs:        ${plan.summary.githubOrgs}`);
      if (plan.summary.githubRepos) console.log(`    - GitHub repos:       ${plan.summary.githubRepos}`);
      if (plan.summary.gitlabRepos) console.log(`    - GitLab repos:       ${plan.summary.gitlabRepos}`);
      if (plan.summary.filesystemLinks) console.log(`    - Filesystem paths:   ${plan.summary.filesystemLinks}`);
      if (plan.summary.httpCatalogs) console.log(`    - HTTP catalogs:      ${plan.summary.httpCatalogs}`);
      if (plan.summary.s3Buckets) console.log(`    - S3 buckets:         ${plan.summary.s3Buckets}`);

      console.log(`\nGenerated Knowledge Graph Summary:`);
      console.log(`  • Total Nodes:         ${summary.totalNodes}`);
      console.log(`  • Organizations:       ${summary.organizations}`);
      console.log(`  • Microservices:       ${summary.microservices}`);
      console.log(`  • API Contracts:       ${summary.contracts}`);
      console.log(`  • Documentation Pages: ${summary.documentationPages}`);
      console.log(`  • ADRs:                ${summary.adrs}`);
      console.log(`  • Flow Diagrams:       ${summary.flowDiagrams}`);
      console.log(`  • Data Pipelines:      ${summary.pipelines}`);
      console.log(`  • SHACL Conformance:   ${summary.shacl.conforms ? 'VALID' : 'VIOLATIONS'} (${summary.shacl.violations} violations)`);

      console.log(`\nPackage Breakdown:`);
      for (const [pkg, count] of Object.entries(importResult.packageBreakdown)) {
        if (count > 0) {
          console.log(`  • ${pkg.padEnd(16)}: ${count} node(s)`);
        }
      }

      const jsonLdDocument = importResult.jsonLdDocument;
      const targetSlug = plan.company.slug || options.companySlug;

      if (options.dryRun) {
        console.log(`\n[Dry Run] No files modified. Target output would be: ${options.output || `${targetSlug}-kgraph.jsonld`}`);
        return;
      }

      const outputPath = options.output || path.join(process.cwd(), `${targetSlug}-kgraph.jsonld`);
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(jsonLdDocument, null, 2), 'utf8');
      console.log(`\n💾 Saved company KGraph to: ${outputPath}`);

      if (options.importToRobos) {
        console.log(`\n📥 Ingesting nodes directly into RobOS workspace...`);
        const { addedNodesCount, addedProjectsCount } = mergeIntoRobosWorkspace(jsonLdDocument, plan.resources, options);
        console.log(`  ✔ Ingested ${addedNodesCount} nodes into .robos/ package stores`);
        console.log(`  ✔ Added ${addedProjectsCount} repositories into ~/.config/robos/git-projects.json`);
      }

      console.log(`\n✨ Successfully imported resources for ${plan.company.name}!\n`);
      return;
    } catch (err) {
      console.error(`\n❌ Error during prompt ingestion: ${err.message}`);
      if (options.verbose) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  }

  // Case 2: Multi-Resource Direct Array Mode
  if (options.resources && options.resources.length > 0) {
    console.log(`\n📦 RobOS Multi-Resource Knowledge Graph Ingestion`);
    console.log(`────────────────────────────────────────────────────────`);
    console.log(`Resources:    ${options.resources.length} resource target(s)`);
    console.log(`Company:      ${options.companyName} (${options.companySlug})`);

    try {
      if (!KGraphResourceImporter) {
        throw new Error('KGraphResourceImporter could not be loaded from robos-graph package.');
      }
      const importer = new KGraphResourceImporter(options);
      const importResult = await importer.importResources(options.resources, options);
      const summary = importResult.summary;

      console.log(`\nGenerated Knowledge Graph Summary:`);
      console.log(`  • Total Nodes:         ${summary.totalNodes}`);
      console.log(`  • Organizations:       ${summary.organizations}`);
      console.log(`  • Microservices:       ${summary.microservices}`);
      console.log(`  • API Contracts:       ${summary.contracts}`);
      console.log(`  • Documentation Pages: ${summary.documentationPages}`);
      console.log(`  • ADRs:                ${summary.adrs}`);
      console.log(`  • Flow Diagrams:       ${summary.flowDiagrams}`);
      console.log(`  • SHACL Conformance:   ${summary.shacl.conforms ? 'VALID' : 'VIOLATIONS'}`);

      const jsonLdDocument = importResult.jsonLdDocument;
      if (options.dryRun) {
        console.log(`\n[Dry Run] No files modified. Target output would be: ${options.output || `${options.companySlug}-kgraph.jsonld`}`);
        return;
      }

      const outputPath = options.output || path.join(process.cwd(), `${options.companySlug}-kgraph.jsonld`);
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(jsonLdDocument, null, 2), 'utf8');
      console.log(`\n💾 Saved company KGraph to: ${outputPath}`);

      if (options.importToRobos) {
        console.log(`\n📥 Ingesting nodes directly into RobOS workspace...`);
        const { addedNodesCount, addedProjectsCount } = mergeIntoRobosWorkspace(jsonLdDocument, options.resources, options);
        console.log(`  ✔ Ingested ${addedNodesCount} nodes into .robos/ package stores`);
        console.log(`  ✔ Added ${addedProjectsCount} repositories into ~/.config/robos/git-projects.json`);
      }

      console.log(`\n✨ Successfully imported resources for ${options.companyName}!\n`);
      return;
    } catch (err) {
      console.error(`\n❌ Error during multi-resource ingestion: ${err.message}`);
      if (options.verbose) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  }

  // Case 3: Single Source Catalog / File / HTTP Mode
  console.log(`\n🚀 RobOS Company KGraph Importer`);
  console.log(`─────────────────────────────────────────`);
  console.log(`Source:       ${options.source}`);
  console.log(`Company:      ${options.companyName} (${options.companySlug})`);
  console.log(`Default Team: ${options.defaultTeam}`);

  try {
    const repoEntries = await fetchSourceData(options.source, options.sourceType, options.verbose);
    console.log(`Discovered:   ${repoEntries.length} raw repository/component entries`);

    const { jsonLdDocument, summary } = generateCompanyKnowledgeGraph(repoEntries, options);

    console.log(`\nGenerated Knowledge Graph Summary:`);
    console.log(`  • Total Nodes:     ${jsonLdDocument['robos:nodes'].length}`);
    console.log(`  • Microservices:   ${summary.microservices}`);
    console.log(`  • FrontEnd Apps:   ${summary.frontendApps}`);
    console.log(`  • Desktop Apps:    ${summary.desktopApps}`);
    console.log(`  • PC Games:        ${summary.pcGames}`);
    console.log(`  • Mobile Games:    ${summary.mobileGames}`);
    console.log(`  • Console CLIs:    ${summary.consoleApps}`);
    console.log(`  • Mobile Apps:     ${summary.mobileApps}`);
    console.log(`  • Data Pipelines:  ${summary.dataPipelines}`);
    console.log(`  • Libraries:       ${summary.libraries}`);
    console.log(`  • API Contracts:   ${summary.contracts}`);

    if (options.dryRun) {
      console.log(`\n[Dry Run] No files modified. Target output would be: ${options.output || 'company-kgraph.jsonld'}`);
      return;
    }

    // Determine output file
    const outputPath = options.output || path.join(process.cwd(), `${options.companySlug}-kgraph.jsonld`);
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(jsonLdDocument, null, 2), 'utf8');
    console.log(`\n💾 Saved company KGraph to: ${outputPath}`);

    // Optional workspace merge
    if (options.importToRobos) {
      console.log(`\n📥 Ingesting nodes directly into RobOS workspace...`);
      const { addedNodesCount, addedProjectsCount } = mergeIntoRobosWorkspace(jsonLdDocument, repoEntries, options);
      console.log(`  ✔ Ingested ${addedNodesCount} nodes into .robos/ package stores`);
      console.log(`  ✔ Added ${addedProjectsCount} repositories into ~/.config/robos/git-projects.json`);
    }

    console.log(`\n✨ Successfully generated Knowledge Graph entries for ${options.companyName}!\n`);
  } catch (err) {
    console.error(`\n❌ Error importing company knowledge graph: ${err.message}`);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Export functions for testing and programmatic invocation
module.exports = {
  parseGitUrl,
  detectArchetype,
  detectTechnology,
  fetchSourceData,
  parseRawContent,
  generateCompanyKnowledgeGraph,
  mergeIntoRobosWorkspace,
  KGraphResourceImporter,
  OSLC_CONTEXT,
};

// Run CLI when called directly
if (require.main === module) {
  main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
}
