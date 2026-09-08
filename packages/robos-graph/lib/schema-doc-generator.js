'use strict';

const fs = require('fs');
const path = require('path');
const { BUILTIN_SHACL_SHAPES } = require('./shacl-validator');
const { DEFAULT_PACKAGES, KGraphPackageManager } = require('./package-manager');
const { OSLC_CONTEXT } = require('./oslc-parser');

// Canonical property metadata dictionary
const PROPERTY_METADATA = {
  'dcterms:title': {
    name: 'Title / Display Name',
    type: 'xsd:string',
    description: 'Human-readable title or display name for the resource.',
  },
  'dcterms:description': {
    name: 'Description',
    type: 'xsd:string',
    description: 'Detailed narrative description of the component, architecture, or policy.',
  },
  'robos:repository': {
    name: 'Git Repository',
    type: 'xsd:string',
    description: 'Git repository URL or slug (e.g. `github.com/acme/petstore-api`).',
  },
  'robos:ownerTeam': {
    name: 'Owner Team',
    type: 'URI (robos:Team)',
    description: 'URI reference to the governing development team.',
  },
  'robos:implementsContract': {
    name: 'Implements Contract',
    type: 'URI (robos:Contract)',
    description: 'Interface contract implemented by this service (OpenAPI 3.1, gRPC, Pact).',
  },
  'robos:usesEntity': {
    name: 'Domain Entity',
    type: 'URI (robos:Entity)',
    description: 'Core domain entity managed or queried by this service.',
  },
  'robos:dependsOn': {
    name: 'Service Dependency',
    type: 'URI (robos:Microservice)',
    description: 'Upstream or downstream microservice dependency.',
  },
  'robos:specFile': {
    name: 'Specification File',
    type: 'xsd:string',
    description: 'Path to contract specification file (e.g. `specs/contracts/petstore-v1.yaml`).',
  },
  'robos:protocol': {
    name: 'Protocol / Standard',
    type: 'xsd:string',
    description: 'Standard protocol (e.g. `OpenAPI 3.1`, `REAPI_v2`, `Protobuf gRPC`).',
  },
  'robos:featureFile': {
    name: 'Gherkin Feature File',
    type: 'xsd:string',
    description: 'Relative path to Gherkin BDD `.feature` verification specification.',
  },
  'robos:technology': {
    name: 'Technology Stack',
    type: 'xsd:string',
    description: 'Primary programming language and runtime framework.',
  },
  'robos:desktopFramework': {
    name: 'Desktop Framework',
    type: 'xsd:string',
    description: 'Workstation desktop framework (`Electron`, `Tauri`, `Qt`, `GTK`).',
  },
  'robos:frontendFramework': {
    name: 'Frontend Framework',
    type: 'xsd:string',
    description: 'Single-page or SSR web framework (`React`, `Next.js`, `Vue`, `Svelte`).',
  },
  'robos:cliCommand': {
    name: 'CLI Binary Command',
    type: 'xsd:string',
    description: 'Terminal executable command name (e.g. `robos`, `kubectl`).',
  },
  'robos:platform': {
    name: 'Target Platform',
    type: 'xsd:string',
    description: 'Mobile operating system target (`iOS`, `Android`, or cross-platform).',
  },
  'robos:gameEngine': {
    name: 'Game Engine',
    type: 'xsd:string',
    description: 'Interactive real-time game engine (`Unreal Engine 5`, `Unity 6`, `Godot 4`, `Bevy`).',
  },
  'robos:targetPlatform': {
    name: 'Gaming Target Platform',
    type: 'xsd:string',
    description: 'Supported desktop gaming platforms (`Windows`, `Linux`, `macOS`).',
  },
  'robos:pipelineEngine': {
    name: 'Pipeline Engine',
    type: 'xsd:string',
    description: 'Stream or batch processing engine (`Kafka Streams`, `Spark`, `Celery`, `Flink`).',
  },
  'robos:url': {
    name: 'Forge / Web URL',
    type: 'xsd:anyURI',
    description: 'HTTP/HTTPS URL of the forge or web resource.',
  },
  'robos:orgName': {
    name: 'Organization Slug',
    type: 'xsd:string',
    description: 'Forge organization identifier or handle (e.g. `apache`, `acme`).',
  },
  'robos:forgeType': {
    name: 'Forge Type',
    type: 'xsd:string',
    description: 'Hosting platform (`github`, `gitlab`, `bitbucket`, `gitea`).',
  },
  'robos:executionEndpoint': {
    name: 'Execution Endpoint',
    type: 'xsd:anyURI',
    description: 'gRPC endpoint URI for Remote Execution service (e.g. `grpc://re-execution:8980`).',
  },
  'robos:casEndpoint': {
    name: 'CAS Endpoint',
    type: 'xsd:anyURI',
    description: 'Content Addressable Storage (CAS) gRPC endpoint URI.',
  },
  'robos:actionCacheEndpoint': {
    name: 'Action Cache Endpoint',
    type: 'xsd:anyURI',
    description: 'Action Cache verification gRPC endpoint URI.',
  },
  'robos:provider': {
    name: 'Backend Provider',
    type: 'xsd:string',
    description: 'Underlying execution engine implementation (`buildbarn`, `nativelink`, `buildgrid`).',
  },
  'robos:buildTool': {
    name: 'Build Tool',
    type: 'xsd:string',
    description: 'Monorepo build tool (`bazel`, `buck2`, `pants`, `please`).',
  },
  'robos:configFile': {
    name: 'Config File',
    type: 'xsd:string',
    description: 'Root configuration file (`.bazelrc`, `.buckconfig`).',
  },
  'robos:hasRemoteExecution': {
    name: 'Remote Execution Link',
    type: 'URI (robos:RemoteExecutionCluster)',
    description: 'URI reference linking the build tool to an open-standard REAPI cluster.',
  },
  'robos:topic': {
    name: 'Knowledge Domain Topic',
    type: 'xsd:string',
    description: 'Curriculum domain or architectural specialization topic.',
  },
  'robos:modules': {
    name: 'Learning Modules',
    type: 'Array<robos:LearningModule>',
    description: 'Curated curriculum modules with interactive labs and Gherkin BDD tests.',
  },
  'robos:gitopsFile': {
    name: 'GitOps Declarative File',
    type: 'xsd:string',
    description: 'Path to declarative GitOps definition file (`.robos/elearning.yaml`).',
  },
  'robos:status': {
    name: 'Lifecycle Status',
    type: 'xsd:string',
    description: 'Current lifecycle state (`active`, `proposed`, `deprecated`).',
  },
  'robos:hasRepository': {
    name: 'Organization Repositories',
    type: 'Array<xsd:string>',
    description: 'List of repository URLs or member identifiers belonging to this organization.',
  },
  'robos:agentRules': {
    name: 'Inherited Agent Rules',
    type: 'Array<robos:AgentRule>',
    description: 'Organization-wide coding rules and architectural constraints inherited by AI agents.',
  },
  'robos:mermaidText': {
    name: 'Mermaid Graph Definition',
    type: 'xsd:string',
    description: 'Raw, executable Mermaid graph syntax specifying nodes, transitions, sequence interactions, or states.',
  },
  'robos:imagePath': {
    name: 'AI-Rendered Diagram Image',
    type: 'xsd:string',
    description: 'Relative path to a high-resolution, AI-generated illustration visualizing the diagram (e.g. `assets/images/architecture/...`).',
  },
  'robos:tooltip': {
    name: 'Hover Tooltip Summary',
    type: 'xsd:string',
    description: 'Concise tooltip text displayed on hover in interactive UI cards, IDE diagram viewers, and living doc popovers.',
  },
  'robos:diagramType': {
    name: 'Diagram Type',
    type: 'xsd:string',
    description: 'Diagram classification (`flowchart`, `sequence`, `class`, `state`, `architecture`, `erDiagram`).',
  },
  'robos:aspectRatio': {
    name: 'Image Aspect Ratio',
    type: 'xsd:string',
    description: 'Aspect ratio of the AI-rendered diagram image (`16:9`, `4:3`, `1:1`).',
  },
  'robos:targetComponent': {
    name: 'Target Component',
    type: 'URI (robos:Microservice | robos:FrontEndApp | robos:DesktopApp)',
    description: 'URI reference linking the diagram to the target software architecture component it illustrates.',
  },
  'robos:docPath': {
    name: 'Document File Path',
    type: 'xsd:string',
    description: 'Relative path to the living markdown documentation page within the repository.',
  },
  'robos:slug': {
    name: 'URL / Document Slug',
    type: 'xsd:string',
    description: 'Canonical web and navigation slug for the documentation or walkthrough.',
  },
  'robos:category': {
    name: 'Documentation Category',
    type: 'xsd:string',
    description: 'Functional documentation category (`Architecture`, `Guides`, `Runbooks`, `Onboarding`, `Specifications`).',
  },
  'robos:hasFlowDiagram': {
    name: 'Associated Flow Diagram',
    type: 'URI (robos:FlowDiagram)',
    description: 'URI reference to a first-class visual flow diagram linked to this documentation or decision record.',
  },
  'robos:adrNumber': {
    name: 'ADR Number Identifier',
    type: 'xsd:string',
    description: 'Standard sequential ADR identifier (e.g. `ADR-001`).',
  },
  'robos:context': {
    name: 'Decision Context',
    type: 'xsd:string',
    description: 'Architectural context, problem statement, business drivers, and technical constraints motivating the decision.',
  },
  'robos:decision': {
    name: 'Architectural Decision',
    type: 'xsd:string',
    description: 'The definitive architectural choice made, technology selected, or pattern mandated.',
  },
  'robos:consequences': {
    name: 'Decision Consequences',
    type: 'xsd:string',
    description: 'Anticipated positive outcomes, operational tradeoffs, and secondary impacts of the architectural decision.',
  },
  'robos:walkthroughPath': {
    name: 'Walkthrough Script Path',
    type: 'xsd:string',
    description: 'Relative path to the text-narrated walkthrough script and step-by-step documentation.',
  },
  'robos:videoPath': {
    name: 'Video Recording Path',
    type: 'xsd:string',
    description: 'Relative path to the recorded video walkthrough demonstration file.',
  },
  'robos:targetApp': {
    name: 'Target RobOS Application',
    type: 'xsd:string',
    description: 'Application ID of the RobOS desktop application showcased in the walkthrough.',
  },
  'robos:code': {
    name: 'Source Code Content',
    type: 'xsd:string',
    description: 'Raw, executable source code snippet content.',
  },
  'robos:language': {
    name: 'Programming Language',
    type: 'xsd:string',
    description: 'Code snippet syntax language (`javascript`, `typescript`, `python`, `go`, `rust`, `bash`).',
  },
};

// Package display titles for Just the Docs navigation
const PACKAGE_DISPLAY_TITLES = {
  'core-platform': 'Core Platform (robos.core)',
  'organization': 'Organization & Teams (robos.org)',
  'services': 'Services & Contracts (robos.services)',
  'applications': 'Applications (robos.apps)',
  'devops': 'DevOps & Cloud (robos.devops)',
  'learning': 'eLearning Curriculums (robos.learning)',
  'documentation': 'Documentation & Diagrams (robos.docs)',
};

class SchemaDocGenerator {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.kgraphDir = options.kgraphDir || path.join(this.rootDir, '.robos');
    this.docsDir = options.docsDir || path.join(this.rootDir, 'docs');
    this.outputDir = options.outputDir || path.join(this.docsDir, 'schemas');
    this.packageManager = new KGraphPackageManager({ baseDir: this.kgraphDir });
  }

  getSchemaPackage(targetClass) {
    const fakeNode = { '@type': targetClass };
    return this.packageManager.inferPackageForNode(fakeNode);
  }

  getEntitySlug(targetClass) {
    const name = targetClass.replace(/^.*:/, '');
    return name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }

  getEntityTitle(targetClass) {
    const name = targetClass.replace(/^.*:/, '');
    return name.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  getCanonicalNode(targetClass, pkgId) {
    const pkg = this.packageManager.getPackage(pkgId);
    if (pkg && pkg.nodes) {
      const match = pkg.nodes.find(n => {
        const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
        return types.some(t => t === targetClass || t.endsWith(`:${targetClass}`));
      });
      if (match) return match;
    }
    return null;
  }

  generateAll() {
    fs.mkdirSync(this.outputDir, { recursive: true });

    // Group SHACL shapes by package
    const packageMap = new Map();
    for (const pkg of DEFAULT_PACKAGES) {
      packageMap.set(pkg.id, {
        ...pkg,
        displayTitle: PACKAGE_DISPLAY_TITLES[pkg.id] || pkg.title,
        shapes: [],
      });
    }

    for (const shape of BUILTIN_SHACL_SHAPES) {
      const pkgId = this.getSchemaPackage(shape.targetClass);
      if (packageMap.has(pkgId)) {
        packageMap.get(pkgId).shapes.push(shape);
      } else {
        // Fallback to core-platform
        packageMap.get('core-platform').shapes.push(shape);
      }
    }

    const generatedFiles = [];

    // 1. Generate Tier 1: docs/schemas.md (Hub)
    const hubPath = path.join(this.docsDir, 'schemas.md');
    const hubContent = this.generateHubMarkdown(packageMap);
    fs.writeFileSync(hubPath, hubContent, 'utf8');
    generatedFiles.push(hubPath);

    // 2. Generate Tier 2: docs/schemas/<pkg>.md
    let pkgOrder = 1;
    for (const [pkgId, pkgData] of packageMap.entries()) {
      const pkgSubdir = path.join(this.outputDir, pkgId);
      fs.mkdirSync(pkgSubdir, { recursive: true });

      const pkgFilePath = path.join(this.outputDir, `${pkgId}.md`);
      const pkgContent = this.generatePackageMarkdown(pkgData, pkgOrder++);
      fs.writeFileSync(pkgFilePath, pkgContent, 'utf8');
      generatedFiles.push(pkgFilePath);

      // 3. Generate Tier 3: docs/schemas/<pkg>/<entity-slug>.md
      let shapeOrder = 1;
      for (const shape of pkgData.shapes) {
        const slug = this.getEntitySlug(shape.targetClass);
        const shapeFilePath = path.join(pkgSubdir, `${slug}.md`);
        const shapeContent = this.generateSchemaMarkdown(shape, pkgData, shapeOrder++);
        fs.writeFileSync(shapeFilePath, shapeContent, 'utf8');
        generatedFiles.push(shapeFilePath);
      }
    }

    return {
      ok: true,
      generatedCount: generatedFiles.length,
      packageCount: packageMap.size,
      shapeCount: BUILTIN_SHACL_SHAPES.length,
      generatedFiles,
    };
  }

  generateHubMarkdown(packageMap) {
    const lines = [
      '---',
      'title: KGraph Schemas',
      'layout: default',
      'nav_order: 3',
      'has_children: true',
      'permalink: /schemas.html',
      '---',
      '',
      '# RobOS Knowledge Graph Schemas & Ontologies',
      '{: .no_toc }',
      '',
      'Comprehensive, machine-readable ontologies and W3C SHACL constraint specifications governing the RobOS Dual-State SDLC Knowledge Graph across all ' + packageMap.size + ' standard package stores.',
      '{: .fs-6 .fw-300 }',
      '',
      '## Table of contents',
      '{: .no_toc .text-delta }',
      '',
      '1. TOC',
      '{:toc}',
      '',
      '---',
      '',
      '## Architectural Overview',
      '',
      'RobOS structures the entire software development lifecycle as an open, interconnected **Dual-State Knowledge Graph**. Rather than proprietary siloes or monolithic configuration files, RobOS combines three international standards:',
      '',
      '1. **OASIS OSLC Core 3.0 & W3C JSON-LD**: Global semantic web standard for linking requirements, changes, architectures, and tests.',
      '2. **W3C SHACL (Shapes Constraint Language)**: Strictly validates graph nodes against structural schemas before saving or synthesizing code.',
      `3. **Modular Namespaced Packages (\`.robos/kgraphs/\`)**: Eliminates Git merge conflicts and blurs across teams by dividing the universe into ${packageMap.size} domain-isolated package stores.`,
      '',
      '<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">',
      `  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="RobOS SDLC Knowledge Graph Ontology and Modular Package Stores" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />`,
      '  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">',
      `    <strong>RobOS SDLC Knowledge Graph Ontology</strong>: The ${packageMap.size} modular package stores, linked-data relationships, and OSLC Core 3.0 / W3C SHACL validation layer. <em>(Click image to zoom full screen)</em>`,
      '  </div>',
      '</div>',
      '',
      '---',
      '',
      `## The ${packageMap.size} Standard RobOS Package Stores`,
      '',
      '| Package ID | Namespace | Target Domain | Schemas & Shapes |',
      '|---|---|---|---|',
    ];

    for (const [pkgId, pkg] of packageMap.entries()) {
      const link = `[${pkg.displayTitle}]({{ '/schemas/${pkgId}.html' | relative_url }})`;
      const shapeLinks = pkg.shapes.map(s => `<code>${s.targetClass}</code>`).join(', ') || '<em>Base platform nodes</em>';
      lines.push(`| **\`${pkgId}\`** | \`${pkg.namespace}\` | ${pkg.description} | ${shapeLinks} |`);
    }

    lines.push(
      '',
      '---',
      '',
      '## Automated Validation via SHACL',
      '',
      'Every node in the Knowledge Graph is verified using programmatic SHACL validators before it can be merged into `.robos/knowledge-graph.jsonld` or deployed to production:',
      '',
      '```javascript',
      "const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');",
      "const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');",
      '',
      'const store = new SDLCKnowledgeGraphStore();',
      'const validationResult = store.validate();',
      '',
      'if (!validationResult.conforms) {',
      '  console.error("SHACL Violations:", validationResult.violations);',
      '} else {',
      '  console.log("All graph nodes strictly conform to SHACL specifications.");',
      '}',
      '```',
      '',
      '---',
      '',
      '## Regenerating Schema Documentation',
      '',
      'RobOS includes a built-in companion generator that keeps documentation in continuous lockstep with schema code:',
      '',
      '```bash',
      '# Run automated schema doc generator',
      'node scripts/generate-kgraph-schema-docs.js',
      '```'
    );

    return lines.join('\n');
  }

  generatePackageMarkdown(pkg, navOrder) {
    const lines = [
      '---',
      `title: ${pkg.displayTitle}`,
      'layout: default',
      'parent: KGraph Schemas',
      `nav_order: ${navOrder}`,
      'has_children: true',
      `permalink: /schemas/${pkg.id}.html`,
      '---',
      '',
      `# ${pkg.displayTitle}`,
      '{: .no_toc }',
      '',
      `${pkg.description}`,
      '{: .fs-6 .fw-300 }',
      '',
      '## Table of contents',
      '{: .no_toc .text-delta }',
      '',
      '1. TOC',
      '{:toc}',
      '',
      '---',
      '',
      '## Package Metadata',
      '',
      `- **Package Store ID**: \`${pkg.id}\``,
      `- **Ontology Namespace**: \`${pkg.namespace}\``,
      `- **GitOps Package File**: \`.robos/kgraphs/${pkg.id}/package.jsonld\``,
      `- **Schemas Defined**: ${pkg.shapes.length}`,
      '',
      '---',
      '',
      '## Package Schemas & Constraint Shapes',
      '',
      '| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |',
      '|---|---|---|---|',
    ];

    for (const shape of pkg.shapes) {
      const slug = this.getEntitySlug(shape.targetClass);
      const title = this.getEntityTitle(shape.targetClass);
      const link = `[**${title}** (\`${shape.targetClass}\`)]({{ '/schemas/${pkg.id}/${slug}.html' | relative_url }})`;
      const reqProps = shape.properties.map(p => `\`${p.path}\``).join(', ');
      lines.push(`| ${link} | \`${shape.shapeId}\` | ${reqProps} | [View Schema &rarr;]({{ '/schemas/${pkg.id}/${slug}.html' | relative_url }}) |`);
    }

    lines.push(
      '',
      '---',
      '',
      '## Package Architecture & Linked Data Model',
      '',
      '<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">',
      `  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="${pkg.displayTitle} Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />`,
      '  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">',
      `    <strong>${pkg.displayTitle} (${pkg.namespace})</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>`,
      '  </div>',
      '</div>'
    );

    return lines.join('\n');
  }

  generateSchemaMarkdown(shape, pkg, navOrder) {
    const slug = this.getEntitySlug(shape.targetClass);
    const title = this.getEntityTitle(shape.targetClass);
    const targetClasses = Array.isArray(shape.targetClasses) ? shape.targetClasses : [shape.targetClass];
    const canonicalNode = this.getCanonicalNode(shape.targetClass, pkg.id);

    const lines = [
      '---',
      `title: ${title}`,
      'layout: default',
      `parent: ${pkg.displayTitle}`,
      'grand_parent: KGraph Schemas',
      `nav_order: ${navOrder}`,
      `permalink: /schemas/${pkg.id}/${slug}.html`,
      '---',
      '',
      `# Schema: \`${shape.targetClass}\``,
      '{: .no_toc }',
      '',
      `Formal W3C SHACL constraint shape and OSLC JSON-LD specification for \`${shape.targetClass}\` in the \`${pkg.id}\` package store.`,
      '{: .fs-6 .fw-300 }',
      '',
      '## Table of contents',
      '{: .no_toc .text-delta }',
      '',
      '1. TOC',
      '{:toc}',
      '',
      '---',
      '',
      '## Specification Metadata',
      '',
      `- **RDF / OWL Class**: \`${shape.targetClass}\``,
      `- **Aliases / Target Classes**: ${targetClasses.map(tc => `\`${tc}\``).join(', ')}`,
      `- **SHACL Shape ID**: \`${shape.shapeId}\``,
      `- **Governing Package**: [${pkg.displayTitle}]({{ '/schemas/${pkg.id}.html' | relative_url }}) (\`${pkg.id}\`)`,
      `- **Namespace**: \`${pkg.namespace}\``,
      '',
      '---',
      '',
      '## Entity Relationship & Schema Context',
      '',
      '<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">',
      `  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">`,
      `    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">${title}</span>`,
      `    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">${shape.targetClass}</span>`,
      '  </div>',
      `  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>${shape.shapeId}</code> within the <strong>${pkg.displayTitle}</strong> (<code>${pkg.namespace}</code>) package store.</p>`,
      `  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">`,
      ...shape.properties.map(p => `    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>${p.path}</code></span>`),
      '  </div>',
      '</div>',
      '',
      '---',
      '',
      '## Property Constraints & SHACL Rules',
      '',
      '| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |',
      '|---|---|---|---|---|',
    ];

    for (const prop of shape.properties) {
      const meta = PROPERTY_METADATA[prop.path] || {
        name: prop.path.replace(/^.*:/, ''),
        type: 'xsd:string',
        description: '',
      };
      const minCount = prop.minCount !== undefined ? prop.minCount : 0;
      const maxCount = prop.maxCount !== undefined ? prop.maxCount : '*';
      const multiplicity = `${minCount}..${maxCount}`;
      const msg = prop.message || `Property ${prop.path} is required`;
      lines.push(`| **\`${prop.path}\`** | ${meta.name} | \`${multiplicity}\` | \`${meta.type}\` | ${msg} |`);
    }

    // Canonical JSON-LD Example
    lines.push(
      '',
      '---',
      '',
      '## Canonical OSLC JSON-LD Example',
      '',
      '```json',
      JSON.stringify(canonicalNode || this.generateSampleNode(shape, pkg), null, 2),
      '```',
      '',
      '---',
      '',
      '## Programmatic SHACL Validation',
      '',
      '```javascript',
      "const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');",
      "const { OSLCGraphParser, OSLC_CONTEXT } = require('/usr/local/share/robos/robos-graph/lib/oslc-parser');",
      '',
      'const validator = new SHACLValidator();',
      'const result = validator.validateGraph(new OSLCGraphParser({',
      '  "@context": OSLC_CONTEXT,',
      '  "robos:nodes": [',
      JSON.stringify(canonicalNode || this.generateSampleNode(shape, pkg), null, 4).split('\n').map(l => '    ' + l).join('\n'),
      '  ],',
      '}));',
      '',
      'console.log("Conforms:", result.conforms); // Expected: true',
      '```'
    );

    return lines.join('\n');
  }

  generateMermaidForPackage(pkg) {
    const lines = ['graph LR'];
    lines.push(`    subgraph Pkg ["${pkg.displayTitle}"]`);
    for (const shape of pkg.shapes) {
      const name = shape.targetClass.replace(/^.*:/, '');
      lines.push(`        ${name}["${name}<br/><code>${shape.targetClass}</code>"]`);
    }
    lines.push('    end');

    // Add inter-shape edges
    if (pkg.id === 'services') {
      lines.push('    Microservice -->|robos:implementsContract| Contract');
      lines.push('    Requirement -->|robos:validatedBy| Microservice');
    } else if (pkg.id === 'core-platform') {
      lines.push('    BuildSystem -->|robos:hasRemoteExecution| RemoteExecutionCluster["RemoteExecutionCluster<br/>(devops)"]');
      lines.push('    Epic -->|robos:hasTask| Project');
    } else if (pkg.id === 'organization') {
      lines.push('    GitProjectOrganization -->|robos:hasRepository| Repos["Git Repositories"]');
      lines.push('    GitProjectOrganization -->|robos:ownerTeam| Team');
    } else if (pkg.id === 'applications') {
      lines.push('    DesktopApp -->|robos:implementsContract| Contract["Contract (services)"]');
      lines.push('    FrontEndApp -->|robos:implementsContract| Contract');
      lines.push('    ConsoleApp -->|robos:implementsContract| Contract');
    } else if (pkg.id === 'documentation') {
      lines.push('    DocumentationPage -->|robos:hasFlowDiagram| FlowDiagram');
      lines.push('    ArchitectureDecisionRecord -->|robos:hasFlowDiagram| FlowDiagram');
      lines.push('    InteractiveWalkthrough -->|robos:hasFlowDiagram| FlowDiagram');
    }

    return lines.join('\n');
  }

  generateMermaidForSchema(shape, pkg) {
    const name = shape.targetClass.replace(/^.*:/, '');
    const lines = ['graph LR'];
    lines.push(`    ThisNode["${name}<br/><code>${shape.targetClass}</code>"]:::primary`);
    lines.push('    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;');

    for (const prop of shape.properties) {
      if (prop.path.startsWith('robos:') && prop.path.match(/(Contract|Team|Project|RemoteExecution|Entity|Repository)/i)) {
        const targetName = prop.path.replace('robos:', '').replace(/^has|^uses|^implements/, '');
        lines.push(`    ThisNode -->|${prop.path}| ${targetName}["${targetName}"]`);
      }
    }

    return lines.join('\n');
  }

  generateSampleNode(shape, pkg) {
    const slug = this.getEntitySlug(shape.targetClass);
    const sample = {
      '@id': `urn:robos:${pkg.id}:${slug}-sample`,
      '@type': Array.isArray(shape.targetClasses) ? [...shape.targetClasses, 'oslc:Resource'] : [shape.targetClass, 'oslc:Resource'],
      'dcterms:title': `Sample ${this.getEntityTitle(shape.targetClass)}`,
      'dcterms:description': `Canonical reference instance for ${shape.targetClass}.`,
      'robos:package': pkg.id,
      'robos:namespace': pkg.namespace,
    };

    for (const prop of shape.properties) {
      if (sample[prop.path] !== undefined) continue;
      if (prop.path === 'robos:repository') sample[prop.path] = 'github.com/acme/sample-repo';
      else if (prop.path === 'robos:ownerTeam') sample[prop.path] = 'urn:robos:team:core-platform';
      else if (prop.path === 'robos:specFile') sample[prop.path] = 'specs/contracts/sample-v1.yaml';
      else if (prop.path === 'robos:protocol') sample[prop.path] = 'OpenAPI 3.1';
      else if (prop.path === 'robos:featureFile') sample[prop.path] = 'tests/bdd/sample.feature';
      else if (prop.path === 'robos:technology') sample[prop.path] = 'Node.js / TypeScript';
      else if (prop.path === 'robos:desktopFramework') sample[prop.path] = 'Electron';
      else if (prop.path === 'robos:frontendFramework') sample[prop.path] = 'React 18';
      else if (prop.path === 'robos:cliCommand') sample[prop.path] = 'robos';
      else if (prop.path === 'robos:platform') sample[prop.path] = 'iOS / Android';
      else if (prop.path === 'robos:gameEngine') sample[prop.path] = 'Unreal Engine 5';
      else if (prop.path === 'robos:targetPlatform') sample[prop.path] = 'Windows / Linux';
      else if (prop.path === 'robos:pipelineEngine') sample[prop.path] = 'Kafka Streams';
      else if (prop.path === 'robos:url') sample[prop.path] = 'https://github.com/acme';
      else if (prop.path === 'robos:orgName') sample[prop.path] = 'acme';
      else if (prop.path === 'robos:forgeType') sample[prop.path] = 'github';
      else if (prop.path === 'robos:executionEndpoint') sample[prop.path] = 'grpc://re-execution.internal:8980';
      else if (prop.path === 'robos:casEndpoint') sample[prop.path] = 'grpc://re-cas.internal:8980';
      else if (prop.path === 'robos:provider') sample[prop.path] = 'buildbarn';
      else if (prop.path === 'robos:buildTool') sample[prop.path] = 'bazel';
      else if (prop.path === 'robos:configFile') sample[prop.path] = '.bazelrc';
      else if (prop.path === 'robos:topic') sample[prop.path] = 'Distributed Architecture';
      else if (prop.path === 'robos:modules') sample[prop.path] = [{ title: 'Module 1: Fundamentals', labFile: 'labs/01.md' }];
      else if (prop.path === 'robos:gitopsFile') sample[prop.path] = '.robos/elearning.yaml';
      else if (prop.path === 'robos:status') sample[prop.path] = 'active';
      else if (prop.path === 'robos:mermaidText') sample[prop.path] = 'sequenceDiagram\n    Client->>API: Request\n    API-->>Client: Response';
      else if (prop.path === 'robos:imagePath') sample[prop.path] = 'assets/images/architecture/sample-flow.jpg';
      else if (prop.path === 'robos:tooltip') sample[prop.path] = 'Hover tooltip summarizing the workflow';
      else if (prop.path === 'robos:slug') sample[prop.path] = slug;
      else if (prop.path === 'robos:docPath') sample[prop.path] = `docs/${slug}.md`;
      else if (prop.path === 'robos:context') sample[prop.path] = 'Architectural drivers and operational context requiring a formal decision.';
      else if (prop.path === 'robos:decision') sample[prop.path] = 'Adopt standardized JSON-LD knowledge graph with SHACL validation.';
      else if (prop.path === 'robos:targetApp') sample[prop.path] = 'remote-execution-studio';
      else if (prop.path === 'robos:language') sample[prop.path] = 'javascript';
      else if (prop.path === 'robos:code') sample[prop.path] = 'const graph = require("robos-graph");';
    }

    return sample;
  }
}

module.exports = { SchemaDocGenerator, PROPERTY_METADATA, PACKAGE_DISPLAY_TITLES };
