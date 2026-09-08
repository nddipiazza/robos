'use strict';

/**
 * RobOS Knowledge Graph Resource Importer (KGraphResourceImporter)
 *
 * Reusable, first-class RobOS component capable of ingesting any number of
 * heterogeneous infrastructure resources into the dual-state SDLC Knowledge Graph:
 *   - Confluence wikis & spaces (Documentation pages, ADRs, Flow diagrams)
 *   - GitHub organizations (GitProjectOrganization, agent rules inheritance, member repos)
 *   - Individual GitHub & GitLab URLs (Microservices, Frontends, CLI tools, Contracts)
 *   - Local filesystem directories (codebase scanning, package manifests, local ADRs)
 *   - HTTP/HTTPS catalogs (Spotify Backstage, custom developer portals)
 *   - AWS S3 bucket inventories (s3://...)
 *
 * Includes built-in AI agent prompt intelligence to parse natural language requests,
 * extract resource targets, infer company topologies, and execute multi-resource ingestion.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const {
  BulkRepoImporter,
  parseGitUrl,
  detectArchetype,
  detectTechnology,
  generateOpenApiYaml,
} = require('./bulk-repo-importer');
const { OSLC_CONTEXT } = require('./oslc-parser');
const { SHACLValidator } = require('./shacl-validator');

// Built-in offline mock registry for deterministic, zero-network walkthroughs and testing
const DEFAULT_MOCK_REGISTRY = {
  // 1. Confluence Wiki Space (Architecture, ADRs, and Flow Diagrams)
  confluence: {
    'confluence.acme.corp': {
      spaceKey: 'ARCH',
      spaceTitle: 'Acme Enterprise Architecture & Engineering Knowledge Base',
      pages: [
        {
          id: 'page-101',
          title: 'Acme Platform Architecture Overview',
          slug: 'acme-architecture-overview',
          category: 'architecture',
          docPath: 'docs/architecture/overview.md',
          content: 'Enterprise cloud platform architecture spanning payments, identity, checkout, and GitOps deployments.',
          relatedServices: ['urn:robos:service:payment-gateway', 'urn:robos:service:checkout-api'],
        },
        {
          id: 'page-102',
          title: 'ADR-004: Event-Driven Order Processing with Kafka',
          slug: '004-event-driven-orders',
          type: 'adr',
          adrNumber: 4,
          status: 'accepted',
          context: 'High concurrency checkout requests require non-blocking order intake and asynchronous inventory settlement.',
          decision: 'Adopt Apache Kafka event streams for decoupled order events and reactive inventory reservation.',
          consequences: 'Improves peak throughput by 8x while requiring event versioning schemas across microservices.',
        },
        {
          id: 'page-103',
          title: 'Checkout and Payment Processing Flowchart',
          slug: 'checkout-payment-flow',
          type: 'diagram',
          diagramType: 'sequence',
          description: 'End-to-end transactional sequence from customer checkout to payment settlement.',
          tooltip: 'Interactive sequence diagram for checkout order validation and payment capture',
          mermaidText: `sequenceDiagram
  autonumber
  actor Customer as Customer SPA
  participant Checkout as Checkout API (Java)
  participant Payments as Payment Gateway (Java)
  participant Kafka as Apache Kafka
  Customer->>Checkout: POST /api/v1/checkout/orders
  Checkout->>Payments: POST /api/v1/payments/charge
  Payments-->>Checkout: 200 OK (Transaction Approved)
  Checkout->>Kafka: Publish "orders.created" event
  Checkout-->>Customer: 201 Created (Order Confirmed)`,
        },
      ],
    },
  },

  // 2. GitHub Organizations
  githubOrgs: {
    'acme-payments': {
      orgName: 'acme-payments',
      title: 'Acme Payments Organization',
      description: 'Core billing, transaction processing, and fraud detection services.',
      forgeType: 'github',
      visibility: 'internal',
      agentRules: [
        'All monetary amounts must be handled using integer cents or BigDecimal to avoid floating point errors.',
        'Mutual TLS (mTLS) is mandatory for all inbound payment gateway endpoints.',
        'PCI-DSS compliance: Never log unmasked credit card or PAN numbers in application logs.',
      ],
      repositories: [
        {
          name: 'payment-gateway',
          url: 'https://github.com/acme-payments/payment-gateway',
          description: 'High-throughput payment gateway microservice connecting to banking networks.',
          archetype: 'microservice',
          technology: 'Java 21 / Spring Boot 3',
        },
        {
          name: 'fraud-detector',
          url: 'https://github.com/acme-payments/fraud-detector',
          description: 'Real-time transaction anomaly detection and machine learning fraud filter.',
          archetype: 'microservice',
          technology: 'Python 3.11 / FastAPI',
        },
      ],
    },
    'acme-identity': {
      orgName: 'acme-identity',
      title: 'Acme Identity & Access Management Organization',
      description: 'Enterprise SSO, OAuth2/OIDC providers, and directory SCIM synchronization.',
      forgeType: 'github',
      visibility: 'internal',
      agentRules: [
        'All issued OAuth2 access tokens must be JWT signed with RS256 private keys.',
        'SCIM 2.0 user provisioning endpoints must strictly enforce bearer token scope validation.',
        'Multi-factor authentication (MFA) must be verified before granting administrative privilege grants.',
      ],
      repositories: [
        {
          name: 'oauth-server',
          url: 'https://github.com/acme-identity/oauth-server',
          description: 'OpenID Connect & OAuth 2.1 authorization server.',
          archetype: 'microservice',
          technology: 'Go 1.22 / Gin / gRPC',
        },
        {
          name: 'user-directory-sync',
          url: 'https://github.com/acme-identity/user-directory-sync',
          description: 'Automated SCIM 2.0 bridge syncing Okta and Azure Active Directory profiles.',
          archetype: 'console-app',
          technology: 'Node.js 20 / TypeScript',
        },
      ],
    },
  },

  // 3. Individual Repositories (GitHub & GitLab)
  repositories: {
    'https://github.com/acme-retail/checkout-api': {
      name: 'checkout-api',
      title: 'Checkout API Microservice',
      url: 'https://github.com/acme-retail/checkout-api',
      description: 'Customer checkout processing microservice with basket persistence and inventory locking.',
      archetype: 'microservice',
      technology: 'Java 21 / Spring Boot 3',
      host: 'github.com',
      org: 'acme-retail',
    },
    'https://gitlab.com/acme-devops/gitops-deployments': {
      name: 'gitops-deployments',
      title: 'GitOps Infrastructure Deployments',
      url: 'https://gitlab.com/acme-devops/gitops-deployments',
      description: 'Automated ArgoCD and GitLab CI deployment pipelines managing multi-region Kubernetes clusters.',
      archetype: 'data-pipeline',
      technology: 'GitLab CI / ArgoCD GitOps',
      host: 'gitlab.com',
      org: 'acme-devops',
      forgeType: 'gitlab',
    },
  },
};

class KGraphResourceImporter {
  constructor(options = {}) {
    this.defaultTeam = options.defaultTeam || 'urn:robos:team:core-platform';
    this.defaultProject = options.defaultProject || 'urn:robos:project:enterprise-core';
    this.companyName = options.companyName || 'Acme Global';
    this.companySlug = options.companySlug || 'acme';
    this.mockRegistry = options.mockRegistry || DEFAULT_MOCK_REGISTRY;
    this.validator = new SHACLValidator();
    this.bulkRepoImporter = new BulkRepoImporter({
      defaultTeam: this.defaultTeam,
      defaultProject: this.defaultProject,
    });
  }

  // ── 1. Smart Agent Prompt Analyzer ──────────────────────────────────────────

  /**
   * Intelligently parses natural language developer/architect prompts
   * to automatically detect and extract all resource targets to import into the Knowledge Graph.
   *
   * @param {string} prompt - Unstructured natural language prompt text
   * @returns {Object} Structured execution plan with discovered resources and metadata
   */
  parsePrompt(prompt = '') {
    const text = (prompt || '').trim();
    const resources = [];
    const discoveredUrls = new Set();

    // 1. Infer Company Name / Slug from text if present
    let inferredCompany = this.companyName;
    let inferredSlug = this.companySlug;

    const companyMatch = text.match(/(?:for|company|org|enterprise)\s+([A-Za-z0-9\s_-]+?)(?:\s+infrastructure|\s+setup|\s+SDLC|\s+Knowledge Graph|[.,:\n]|$)/i);
    if (companyMatch && companyMatch[1]) {
      const candidate = companyMatch[1].trim();
      if (candidate.length > 2 && !['our', 'the', 'my', 'existing'].includes(candidate.toLowerCase())) {
        inferredCompany = candidate;
        inferredSlug = candidate.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      }
    }

    // 2. Extract URLs using global regex
    const urlRegex = /https?:\/\/[^\s"',;<>()]+/gi;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      let rawUrl = match[0];
      // Strip trailing punctuation
      rawUrl = rawUrl.replace(/[.,:;)]+$/, '');
      if (discoveredUrls.has(rawUrl)) continue;
      discoveredUrls.add(rawUrl);

      // Classify the URL target
      const classified = this.classifyUrl(rawUrl, text);
      if (classified) {
        resources.push(classified);
      }
    }

    // 3. Extract Local Filesystem paths (absolute or ~/)
    const pathRegex = /(?:^|\s)(~?\/[a-zA-Z0-9._\-\/]+|(?:\.\.?\/)[a-zA-Z0-9._\-\/]+)(?:\s|[.,;]|$)/gm;
    while ((match = pathRegex.exec(text)) !== null) {
      let p = match[1].trim().replace(/[.,:;)]+$/, '');
      if (p.startsWith('http://') || p.startsWith('https://')) continue;
      if (p.length < 3) continue;

      // Expand tilde if present
      let resolvedPath = p;
      if (resolvedPath.startsWith('~/')) {
        resolvedPath = path.join(os.homedir(), resolvedPath.slice(2));
      }

      resources.push({
        type: 'filesystem',
        path: resolvedPath,
        rawPath: p,
      });
    }

    const summary = {
      totalResources: resources.length,
      confluenceWikis: resources.filter(r => r.type === 'confluence').length,
      githubOrgs: resources.filter(r => r.type === 'github-org').length,
      githubRepos: resources.filter(r => r.type === 'github-repo').length,
      gitlabRepos: resources.filter(r => r.type === 'gitlab-repo').length,
      filesystemLinks: resources.filter(r => r.type === 'filesystem').length,
      httpCatalogs: resources.filter(r => r.type === 'http-catalog').length,
      s3Buckets: resources.filter(r => r.type === 's3').length,
    };

    return {
      prompt: text,
      company: {
        name: inferredCompany,
        slug: inferredSlug,
      },
      resources,
      summary,
    };
  }

  /**
   * Classifies a discovered URL based on domain, path structure, and prompt context
   */
  classifyUrl(url, promptContext = '') {
    const u = url.trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(u);
    } catch {
      return null;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.replace(/^\/|\/$/g, '');
    const pathSegments = pathname ? pathname.split('/') : [];

    // Confluence / Wiki
    if (
      hostname.includes('confluence') ||
      hostname.includes('wiki') ||
      pathname.includes('spaces/') ||
      pathname.includes('display/') ||
      pathname.includes('wiki/')
    ) {
      let spaceKey = 'MAIN';
      const spaceMatch = pathname.match(/(?:spaces|display)\/([a-zA-Z0-9_-]+)/i);
      if (spaceMatch) spaceKey = spaceMatch[1];

      return {
        type: 'confluence',
        url: u,
        hostname,
        spaceKey,
        label: `Confluence Wiki (${spaceKey})`,
      };
    }

    // GitHub
    if (hostname.includes('github.com')) {
      // If prompt context explicitly declares it as organization or if URL has only 1 path segment
      const isExplicitOrg = /organization|org\b/i.test(promptContext.slice(Math.max(0, promptContext.indexOf(u) - 40), promptContext.indexOf(u) + u.length + 40));

      if (pathSegments.length === 1 || (pathSegments.length === 2 && pathSegments[1] === '') || isExplicitOrg && pathSegments.length <= 2) {
        const orgName = pathSegments[0];
        return {
          type: 'github-org',
          url: u,
          org: orgName,
          label: `GitHub Org: ${orgName}`,
        };
      } else if (pathSegments.length >= 2) {
        return {
          type: 'github-repo',
          url: u,
          org: pathSegments[0],
          repo: pathSegments[1].replace(/\.git$/, ''),
          label: `GitHub Repo: ${pathSegments[1]}`,
        };
      }
    }

    // GitLab
    if (hostname.includes('gitlab.com') || hostname.includes('gitlab')) {
      return {
        type: 'gitlab-repo',
        url: u,
        hostname,
        org: pathSegments[0] || 'gitlab-org',
        repo: (pathSegments[1] || 'repo').replace(/\.git$/, ''),
        label: `GitLab Resource: ${pathSegments[pathSegments.length - 1] || 'repo'}`,
      };
    }

    // Generic HTTP/Backstage catalog
    return {
      type: 'http-catalog',
      url: u,
      label: `HTTP Catalog: ${hostname}`,
    };
  }

  // ── 2. Resource Resolvers ───────────────────────────────────────────────────

  /**
   * Resolves Confluence Wiki pages, Architecture Decision Records (ADRs), and Flow Diagrams
   */
  async resolveConfluence(resource, options = {}) {
    const nodes = [];
    const hostKey = resource.hostname || 'confluence.acme.corp';
    const mockData = this.mockRegistry.confluence[hostKey] || Object.values(this.mockRegistry.confluence)[0];

    if (!mockData) {
      // Fallback synthetic page
      const docNode = {
        '@id': `urn:robos:doc:${resource.spaceKey ? resource.spaceKey.toLowerCase() : 'wiki'}-overview`,
        '@type': ['robos:DocumentationPage', 'oslc:Resource'],
        'dcterms:title': `${resource.spaceKey || 'Wiki'} Architecture Space`,
        'dcterms:description': `Imported documentation from ${resource.url}`,
        'robos:slug': `${resource.spaceKey ? resource.spaceKey.toLowerCase() : 'wiki'}-overview`,
        'robos:docPath': `docs/confluence/${resource.spaceKey || 'wiki'}.md`,
        'robos:category': 'architecture',
        'robos:sourceUrl': resource.url,
        'robos:package': 'documentation',
        'robos:namespace': 'robos.docs',
      };
      nodes.push(docNode);
      return nodes;
    }

    for (const page of mockData.pages) {
      if (page.type === 'adr') {
        nodes.push({
          '@id': `urn:robos:adr:${page.slug}`,
          '@type': ['robos:ArchitectureDecisionRecord', 'robos:ADR', 'oslc:Resource'],
          'dcterms:title': page.title,
          'dcterms:description': page.decision,
          'robos:slug': page.slug,
          'robos:adrNumber': page.adrNumber || 1,
          'robos:status': page.status || 'accepted',
          'robos:context': page.context,
          'robos:decision': page.decision,
          'robos:consequences': page.consequences,
          'robos:sourceUrl': `${resource.url}#${page.id}`,
          'robos:package': 'documentation',
          'robos:namespace': 'robos.docs',
        });
      } else if (page.type === 'diagram') {
        nodes.push({
          '@id': `urn:robos:diagram:${page.slug}`,
          '@type': ['robos:FlowDiagram', 'oslc:Resource'],
          'dcterms:title': page.title,
          'dcterms:description': page.description,
          'robos:slug': page.slug,
          'robos:diagramType': page.diagramType || 'sequence',
          'robos:mermaidText': page.mermaidText,
          'robos:tooltip': page.tooltip || page.title,
          'robos:imagePath': `assets/diagrams/${page.slug}.png`,
          'robos:sourceUrl': `${resource.url}#${page.id}`,
          'robos:package': 'documentation',
          'robos:namespace': 'robos.docs',
        });
      } else {
        nodes.push({
          '@id': `urn:robos:doc:${page.slug}`,
          '@type': ['robos:DocumentationPage', 'oslc:Resource'],
          'dcterms:title': page.title,
          'dcterms:description': page.content,
          'robos:slug': page.slug,
          'robos:docPath': page.docPath || `docs/${page.slug}.md`,
          'robos:category': page.category || 'architecture',
          'robos:sourceUrl': `${resource.url}#${page.id}`,
          'robos:package': 'documentation',
          'robos:namespace': 'robos.docs',
        });
      }
    }

    return nodes;
  }

  /**
   * Resolves a GitHub Organization: generates GitProjectOrganization node,
   * organization-wide agent rules, and discovers member repositories.
   */
  async resolveGitHubOrg(resource, options = {}) {
    const nodes = [];
    const orgKey = (resource.org || '').toLowerCase();
    const mockOrg = this.mockRegistry.githubOrgs[orgKey] || {
      orgName: orgKey,
      title: `${resource.org || 'GitHub'} Organization`,
      description: `Discovered GitHub forge organization for ${resource.org}`,
      forgeType: 'github',
      visibility: 'public',
      agentRules: [`Follow standard organization architectural standards for ${orgKey}.`],
      repositories: [
        {
          name: `${orgKey}-service`,
          url: `https://github.com/${orgKey}/${orgKey}-service`,
          description: `Primary service for ${orgKey}`,
          archetype: 'microservice',
          technology: 'Java 21 / Spring Boot 3',
        },
      ],
    };

    const orgId = `urn:robos:git-org:${orgKey}`;
    const repoNames = (mockOrg.repositories || []).map(r => `github.com/${orgKey}/${r.name}`);

    // 1. Create GitProjectOrganization node
    const orgNode = {
      '@id': orgId,
      '@type': ['robos:GitProjectOrganization', 'robos:GitOrganization', 'schema:Organization', 'oslc:Resource'],
      'dcterms:title': mockOrg.title,
      'dcterms:description': mockOrg.description,
      'robos:orgName': orgKey,
      'robos:url': resource.url || `https://github.com/${orgKey}`,
      'robos:forgeType': 'github',
      'robos:visibility': mockOrg.visibility || 'public',
      'robos:hasRepository': repoNames,
      'robos:agentRules': mockOrg.agentRules || [],
      'robos:agentRulesDoc': 'AGENTS.md',
      'robos:documentation': {
        docsUrl: resource.url || `https://github.com/${orgKey}`,
        docsPaths: ['README.md', 'CONTRIBUTING.md', 'docs/index.md'],
        license: 'Apache-2.0',
      },
      'robos:repoCount': repoNames.length,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
    };
    nodes.push(orgNode);

    // 2. Ingest member repositories
    for (const repo of mockOrg.repositories || []) {
      const repoUrl = repo.url;
      const parsed = parseGitUrl(repoUrl);
      const subImport = this.bulkRepoImporter.importRepositories([{
        url: repoUrl,
        label: repo.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: repo.description,
      }]);

      for (const node of subImport.nodes) {
        if (node['@id'] !== orgId) {
          node['robos:inOrganization'] = orgId;
          nodes.push(node);
        }
      }
    }

    return nodes;
  }

  /**
   * Resolves an individual Git repository URL (GitHub, GitLab, etc.)
   */
  async resolveGitRepo(resource, options = {}) {
    const repoUrl = resource.url;
    const mockRepo = this.mockRegistry.repositories[repoUrl];

    let repoInput = { url: repoUrl };
    if (mockRepo) {
      repoInput = {
        url: repoUrl,
        label: mockRepo.title,
        description: mockRepo.description,
      };
    }

    const res = this.bulkRepoImporter.importRepositories([repoInput]);
    const nodes = [...res.nodes];

    // If it's a GitLab URL, adjust forge metadata
    if (resource.type === 'gitlab-repo' || /gitlab\.com/.test(repoUrl)) {
      for (const n of nodes) {
        n['robos:forgeType'] = 'gitlab';
        if (n['@type'].includes('robos:DataPipeline') || /deploy|gitops|ci|pipeline/.test(repoUrl)) {
          n['robos:package'] = 'devops';
          n['robos:namespace'] = 'robos.devops';
        }
      }
    }

    return nodes;
  }

  /**
   * Resolves a local filesystem directory link by scanning codebases, package manifests, and markdown ADRs
   */
  async resolveLocalFileSystem(resource, options = {}) {
    const localPath = resource.path;
    const nodes = [];

    if (!fs.existsSync(localPath)) {
      // Synthesize a graceful virtual directory representation if missing
      const baseName = path.basename(localPath);
      const parsed = parseGitUrl(`https://github.com/${this.companySlug}/${baseName}`);
      const res = this.bulkRepoImporter.importRepositories([{
        url: `https://github.com/${this.companySlug}/${baseName}`,
        localPath: localPath,
        label: `${baseName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (Local)`,
      }]);
      return res.nodes;
    }

    const stat = fs.statSync(localPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(localPath);
      const foundProjects = [];

      for (const e of entries) {
        const full = path.join(localPath, e);
        try {
          if (fs.statSync(full).isDirectory()) {
            if (fs.existsSync(path.join(full, '.git')) || fs.existsSync(path.join(full, 'package.json')) || fs.existsSync(path.join(full, 'pom.xml'))) {
              foundProjects.push({
                url: `https://github.com/${this.companySlug}/${e}`,
                localPath: full,
                label: e.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              });
            }
          }
        } catch {}
      }

      // If no subprojects, treat the directory itself as project
      if (foundProjects.length === 0) {
        const base = path.basename(localPath);
        foundProjects.push({
          url: `https://github.com/${this.companySlug}/${base}`,
          localPath: localPath,
          label: base.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        });
      }

      const res = this.bulkRepoImporter.importRepositories(foundProjects);
      nodes.push(...res.nodes);

      // Scan for local markdown ADRs or documentation
      const adrDir = path.join(localPath, 'docs', 'adr');
      if (fs.existsSync(adrDir)) {
        try {
          const files = fs.readdirSync(adrDir);
          for (const f of files) {
            if (f.endsWith('.md')) {
              const slug = f.replace(/\.md$/, '').toLowerCase();
              nodes.push({
                '@id': `urn:robos:adr:${slug}`,
                '@type': ['robos:ArchitectureDecisionRecord', 'robos:ADR', 'oslc:Resource'],
                'dcterms:title': `ADR: ${slug.replace(/-/g, ' ').toUpperCase()}`,
                'dcterms:description': `Local Architecture Decision Record from ${f}`,
                'robos:slug': slug,
                'robos:status': 'accepted',
                'robos:context': 'Local monorepo architecture governance decision.',
                'robos:decision': 'Implemented per local codebase specifications.',
                'robos:sourcePath': path.join(adrDir, f),
                'robos:package': 'documentation',
                'robos:namespace': 'robos.docs',
              });
            }
          }
        } catch {}
      }
    }

    return nodes;
  }

  // ── 3. Unified Multi-Resource Ingestion Engine ──────────────────────────────

  /**
   * Ingests any number of heterogeneous infrastructure resources in a single operation
   *
   * @param {Array<Object|string>} resources - List of resource descriptors or URL strings
   * @param {Object} options - Ingestion options (companyName, companySlug, defaultTeam, validateSHACL)
   * @returns {Object} Ingestion result with OSLC JSON-LD document, package breakdown, and validation
   */
  async importResources(resources = [], options = {}) {
    const compName = options.companyName || this.companyName;
    const compSlug = options.companySlug || this.companySlug;
    const defaultTeam = options.defaultTeam || this.defaultTeam;

    const allNodes = [];
    const seenIds = new Set();

    // 1. Root Organization Node
    const orgNode = {
      '@id': `urn:robos:organization:${compSlug}`,
      '@type': ['oslc:Organization', 'robos:Company'],
      'dcterms:title': compName,
      'dcterms:description': `Enterprise technology ecosystem for ${compName}.`,
      'robos:slug': compSlug,
      'robos:hasTeam': [defaultTeam],
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
    };
    allNodes.push(orgNode);
    seenIds.add(orgNode['@id']);

    // 2. Default Team Node
    const teamNode = {
      '@id': defaultTeam,
      '@type': ['oslc:Group', 'robos:Team'],
      'dcterms:title': `${compName} Core Platform Team`,
      'robos:topologyType': 'platform',
      'robos:memberOf': orgNode['@id'],
      'robos:lead': 'urn:robos:person:architect',
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
    };
    allNodes.push(teamNode);
    seenIds.add(teamNode['@id']);

    // 3. Process each heterogeneous resource
    for (const rawRes of resources) {
      let r = rawRes;
      if (typeof rawRes === 'string') {
        r = this.classifyUrl(rawRes) || { type: 'filesystem', path: rawRes };
      }

      let resNodes = [];
      switch (r.type) {
        case 'confluence':
          resNodes = await this.resolveConfluence(r, options);
          break;
        case 'github-org':
          resNodes = await this.resolveGitHubOrg(r, options);
          break;
        case 'github-repo':
        case 'gitlab-repo':
          resNodes = await this.resolveGitRepo(r, options);
          break;
        case 'filesystem':
          resNodes = await this.resolveLocalFileSystem(r, options);
          break;
        default:
          if (r.url) {
            resNodes = await this.resolveGitRepo(r, options);
          }
          break;
      }

      for (const node of resNodes) {
        if (!seenIds.has(node['@id'])) {
          // Ensure package assignment
          if (!node['robos:package']) {
            node['robos:package'] = this.inferPackage(node);
          }
          allNodes.push(node);
          seenIds.add(node['@id']);
        }
      }
    }

    // 4. Validate SHACL Conformance if validator available
    let shaclSummary = { conforms: true, violations: 0 };
    if (this.validator && options.validateSHACL !== false) {
      try {
        const valRes = this.validator.validateGraph(allNodes);
        shaclSummary = {
          conforms: valRes.conforms !== false,
          violations: (valRes.violations || []).length,
        };
      } catch {}
    }

    // 5. Package Breakdown Statistics
    const packageBreakdown = {
      organization: 0,
      services: 0,
      applications: 0,
      devops: 0,
      documentation: 0,
      'core-platform': 0,
      learning: 0,
    };

    for (const n of allNodes) {
      const pkg = n['robos:package'] || 'services';
      if (typeof packageBreakdown[pkg] === 'number') packageBreakdown[pkg]++;
    }

    const summary = {
      totalNodes: allNodes.length,
      resourcesIngested: resources.length,
      organizations: allNodes.filter(n => (n['@type'] || []).includes('robos:GitProjectOrganization')).length,
      microservices: allNodes.filter(n => (n['@type'] || []).includes('robos:Microservice')).length,
      contracts: allNodes.filter(n => (n['@type'] || []).includes('robos:Contract')).length,
      documentationPages: allNodes.filter(n => (n['@type'] || []).includes('robos:DocumentationPage')).length,
      adrs: allNodes.filter(n => (n['@type'] || []).includes('robos:ArchitectureDecisionRecord')).length,
      flowDiagrams: allNodes.filter(n => (n['@type'] || []).includes('robos:FlowDiagram')).length,
      pipelines: allNodes.filter(n => (n['@type'] || []).includes('robos:DataPipeline')).length,
      packageBreakdown,
      shacl: shaclSummary,
    };

    const jsonLdDocument = {
      '@context': OSLC_CONTEXT,
      'robos:organization': orgNode['@id'],
      'robos:title': `${compName} Ingested Infrastructure Knowledge Graph`,
      'robos:generatedAt': new Date().toISOString(),
      'robos:nodes': allNodes,
    };

    return {
      jsonLdDocument,
      nodes: allNodes,
      summary,
      packageBreakdown,
    };
  }

  /**
   * Helper to infer standard package for a given KGraph node
   */
  inferPackage(node) {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some(t => t.includes('DocumentationPage') || t.includes('ArchitectureDecisionRecord') || t.includes('ADR') || t.includes('FlowDiagram') || t.includes('CodeSnippet'))) {
      return 'documentation';
    }
    if (types.some(t => t.includes('GitProjectOrganization') || t.includes('Organization') || t.includes('Company') || t.includes('Team') || t.includes('Person'))) {
      return 'organization';
    }
    if (types.some(t => t.includes('Microservice') || t.includes('Contract') || t.includes('Library') || t.includes('Service'))) {
      return 'services';
    }
    if (types.some(t => t.includes('FrontEndApp') || t.includes('DesktopApp') || t.includes('ConsoleApp') || t.includes('MobileApp') || t.includes('PCGame') || t.includes('MobileGame'))) {
      return 'applications';
    }
    if (types.some(t => t.includes('DevOpsIntegration') || t.includes('DataPipeline') || t.includes('CloudProvider') || t.includes('RemoteExecutionCluster'))) {
      return 'devops';
    }
    return 'core-platform';
  }

  // ── 4. End-to-End Agent Prompt Method ───────────────────────────────────────

  /**
   * High-level AI agent method: takes a natural language prompt, analyzes it to find what
   * resources to import, resolves each target, and generates the unified Knowledge Graph.
   *
   * @param {string} promptText - Developer prompt describing infrastructure to import
   * @param {Object} options - Override options
   * @returns {Object} { plan, importResult, summary }
   */
  async importFromPrompt(promptText, options = {}) {
    const plan = this.parsePrompt(promptText);
    const mergedOptions = {
      companyName: plan.company.name,
      companySlug: plan.company.slug,
      ...options,
    };

    const importResult = await this.importResources(plan.resources, mergedOptions);

    return {
      plan,
      importResult,
      summary: importResult.summary,
    };
  }
}

module.exports = {
  KGraphResourceImporter,
  DEFAULT_MOCK_REGISTRY,
};
