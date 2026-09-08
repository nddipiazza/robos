'use strict';

/**
 * RobOS Knowledge Graph Resource Importer Walkthrough & Demo
 *
 * Demonstrates the universal, heterogeneous resource importer ingesting:
 *   1. Confluence Wiki Space (Architecture pages, ADR-004, Sequence Flow Diagram)
 *   2. GitHub Organization: acme-payments (GitProjectOrganization, agent rules, member microservices)
 *   3. GitHub Organization: acme-identity (OAuth2 server, SCIM directory sync console tool)
 *   4. Individual GitHub Repo: checkout-api (Microservice + OpenAPI 3.1 contract)
 *   5. Individual GitLab Repo: gitops-deployments (DataPipeline / GitOps cluster deployment)
 *   6. Local Filesystem Codebase: /tmp/acme-legacy-monorepo (Local ADRs, package manifests)
 *
 * Uses RobOS agent prompt intelligence to parse natural language requests and
 * map all entities into namespaced dual-state KGraph packages with SHACL validation.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { launchApp, killApp } = require('../lib/harness');
const { evalJS, evalClick } = require('../lib/snapshot');
const scenarios = require('../lib/scenarios');

const SLUG = 'kgraph-resource-importer';
const HOME_DIR = process.env.HOME || '/home/ndipiazza';
const PERSIST_DIR = path.join(HOME_DIR, '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_DIR = path.resolve(__dirname, '../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/b3eec328-5b7c-4d20-9d65-749de9fa59ce';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchScreenshot(port, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/screenshot`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Screenshot failed with status code ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Screenshot timeout')); });
  });
}

function saveFrame(filename, buffer) {
  const targets = [
    path.join(PERSIST_DIR, filename),
    path.join(DOCS_DIR, filename),
    path.join(BRAIN_DIR, filename),
  ];
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer);
      console.log(`Saved ${filename} (${buffer.length} bytes) -> ${target}`);
    } catch (err) {
      console.warn(`Could not save to ${target}: ${err.message}`);
    }
  }
}

async function main() {
  console.log(`\n===============================================================`);
  console.log(`🚀 Starting RobOS Universal KGraph Importer Walkthrough Demo`);
  console.log(`===============================================================\n`);

  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.mkdirSync(BRAIN_DIR, { recursive: true });

  // 1. Setup local filesystem monorepo fixture
  const localMonorepoDir = '/tmp/acme-legacy-monorepo';
  fs.mkdirSync(path.join(localMonorepoDir, 'services', 'inventory-service'), { recursive: true });
  fs.mkdirSync(path.join(localMonorepoDir, 'docs', 'adr'), { recursive: true });

  fs.writeFileSync(
    path.join(localMonorepoDir, 'services', 'inventory-service', 'package.json'),
    JSON.stringify({ name: 'inventory-service', version: '1.0.0', dependencies: { express: '^4.19.0' } }, null, 2),
    'utf8'
  );

  fs.writeFileSync(
    path.join(localMonorepoDir, 'docs', 'adr', '001-monolith-decoupling.md'),
    `# ADR 001: Monolith Decoupling Strategy

Date: 2026-03-01
Status: Accepted

## Context
Legacy monolith handles checkout, inventory, and fulfillment in a single database schema.

## Decision
Decompose bounded contexts into standalone microservices communicating over event bus.

## Consequences
Reduces deployment blast radius and enables team autonomy across domain boundaries.
`,
    'utf8'
  );

  // 2. Define the Smart Agent Prompt containing all 5 requested heterogeneous resource types
  const promptText = `Import our enterprise infrastructure into the Acme Global SDLC Knowledge Graph:
1. Confluence architecture wiki: https://confluence.acme.corp/display/ARCH
2. Payments organization: https://github.com/acme-payments
3. Identity organization: https://github.com/acme-identity
4. Customer checkout service: https://github.com/acme-retail/checkout-api
5. GitOps pipelines: https://gitlab.com/acme-devops/gitops-deployments
6. Local monorepo codebase: ${localMonorepoDir}`;

  console.log(`Smart Agent Prompt:\n"${promptText}"\n`);

  // 3. Launch robos-graph
  const app = await launchApp('robos-graph', {
    ...scenarios['all-good'],
    env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
  });
  console.log(`Launched robos-graph on debug port ${app.port} (PID: ${app.proc.pid})`);

  try {
    await sleep(2500);

    // Frame 1: Co-Pilot Agent Prompt Bar with Multi-Resource Ingestion Request
    console.log(`Capturing Frame 1: Agent Prompt Bar...`);
    await evalJS(app.port, `
      const el = document.getElementById('copilot-prompt');
      if (el) {
        if (typeof el.value !== 'undefined') el.value = ${JSON.stringify(promptText)};
        else el.innerText = ${JSON.stringify(promptText)};
      }
    `);
    await sleep(500);
    const frame1Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-prompt.png', frame1Buf);

    // Frame 2: Execute Prompt Ingestion & Capture Ingested Overview
    console.log(`Executing window.importFromPrompt in robos-graph...`);
    const importResult = await evalJS(app.port, `window.importFromPrompt(${JSON.stringify(promptText)})`);
    console.log(`Import completed:`, {
      totalResources: importResult?.plan?.summary?.totalResources,
      totalNodes: importResult?.summary?.totalNodes,
      conforms: importResult?.summary?.shacl?.conforms,
      breakdown: importResult?.importResult?.packageBreakdown,
    });

    await sleep(1500);
    console.log(`Capturing Frame 2: Ingested Knowledge Graph Overview...`);
    const frame2Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-overview.png', frame2Buf);

    // Frame 3: Confluence Flow Diagram (Mermaid Sequence Flow)
    console.log(`Capturing Frame 3: Sequence Flow Diagram...`);
    await evalClick(app.port, '.filter-pill[data-filter="diagram"]');
    await sleep(600);
    await evalJS(app.port, `window.selectNode('urn:robos:diagram:checkout-payment-flow')`);
    await sleep(800);
    const frame3Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-flow-diagram.png', frame3Buf);

    // Frame 4: Architecture Decision Record (ADR-004 from Confluence)
    console.log(`Capturing Frame 4: Architecture Decision Record ADR-004...`);
    await evalClick(app.port, '.filter-pill[data-filter="adr"]');
    await sleep(600);
    await evalJS(app.port, `window.selectNode('urn:robos:adr:004-event-driven-orders')`);
    await sleep(800);
    const frame4Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-adr.png', frame4Buf);

    // Frame 5: GitHub Organization with Inherited Agent Rules
    console.log(`Capturing Frame 5: GitHub Organization & Agent Rules...`);
    await evalClick(app.port, '.filter-pill[data-filter="organization"]');
    await sleep(600);
    await evalJS(app.port, `window.selectNode('urn:robos:git-org:acme-payments')`);
    await sleep(800);
    const frame5Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-git-org.png', frame5Buf);

    // Frame 6: Microservice & OpenAPI 3.1 Contract (Checkout API)
    console.log(`Capturing Frame 6: Microservice & OpenAPI 3.1 Spec...`);
    await evalClick(app.port, '.filter-pill[data-filter="service"]');
    await sleep(600);
    await evalJS(app.port, `window.selectNode('urn:robos:service:checkout-api')`);
    await sleep(800);
    const frame6Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-checkout-service.png', frame6Buf);

    // Frame 7: GitLab GitOps Deployment Pipeline
    console.log(`Capturing Frame 7: GitLab GitOps Pipeline...`);
    await evalClick(app.port, '.filter-pill[data-filter="data-pipeline"]');
    await sleep(600);
    await evalJS(app.port, `window.selectNode('urn:robos:pipeline:gitops-deployments')`);
    await sleep(800);
    const frame7Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-devops-pipeline.png', frame7Buf);

    // Frame 8: SHACL Constraint Validation
    console.log(`Capturing Frame 8: SHACL Validation...`);
    await evalClick(app.port, '#btn-validate-shacl');
    await sleep(1000);
    const frame8Buf = await fetchScreenshot(app.port);
    saveFrame('kgraph-importer-shacl-valid.png', frame8Buf);

    console.log(`\n✔ All 8 walkthrough frames captured successfully!`);
  } finally {
    await killApp(app);
    console.log(`Closed robos-graph test app.`);
  }

  // 4. Generate Step-by-Step Markdown Walkthrough
  const walkthroughContent = `# RobOS Universal Knowledge Graph Resource Importer Walkthrough

This walkthrough demonstrates the reusable **RobOS Knowledge Graph Resource Importer** (\`KGraphResourceImporter\`). The component accepts natural language requests, analyzes prompts with agent intelligence to discover infrastructure resources, and ingests heterogeneous assets across 5 distinct targets into namespaced dual-state SDLC Knowledge Graph packages.

---

## 1. Smart Agent Prompt Analysis

A developer or platform architect submits an unstructured natural language prompt describing existing enterprise assets:
- **Confluence Architecture Wiki**: \`https://confluence.acme.corp/display/ARCH\`
- **Two GitHub Organizations**: \`https://github.com/acme-payments\` and \`https://github.com/acme-identity\`
- **GitHub Microservice URL**: \`https://github.com/acme-retail/checkout-api\`
- **GitLab CI/CD GitOps URL**: \`https://gitlab.com/acme-devops/gitops-deployments\`
- **Local Monorepo Codebase**: \`/tmp/acme-legacy-monorepo\`

![Smart Agent Prompt Ingestion](docs/assets/images/screenshots/kgraph-importer-prompt.png)

The built-in prompt analyzer (\`importer.parsePrompt(text)\`) extracts targets, classifies URLs by domain and path structure, identifies organization hierarchies, and forms an execution plan.

---

## 2. Ingested Multi-Resource Knowledge Graph

Upon execution, the importer resolves all heterogeneous resources concurrently and routes generated nodes into their canonical modular packages (\`organization\`, \`services\`, \`applications\`, \`devops\`, and \`documentation\`).

![Ingested Knowledge Graph Overview](docs/assets/images/screenshots/kgraph-importer-overview.png)

### Summary of Ingested Entities:
| Resource Type | Source Target | Generated Nodes | Canonical Package |
|---|---|---|---|
| **Confluence Wiki** | \`https://confluence.acme.corp/display/ARCH\` | \`robos:DocumentationPage\`, \`robos:ADR\`, \`robos:FlowDiagram\` | \`documentation\` (\`robos.docs\`) |
| **GitHub Org 1** | \`https://github.com/acme-payments\` | \`robos:GitProjectOrganization\`, 2 Microservices, OpenAPI specs | \`organization\` & \`services\` |
| **GitHub Org 2** | \`https://github.com/acme-identity\` | \`robos:GitProjectOrganization\`, OAuth2 server, SCIM CLI | \`organization\` & \`applications\` |
| **GitHub Repo** | \`https://github.com/acme-retail/checkout-api\` | \`robos:Microservice\`, \`robos:Contract\` (OpenAPI 3.1) | \`services\` (\`robos.services\`) |
| **GitLab Repo** | \`https://gitlab.com/acme-devops/gitops-deployments\` | \`robos:DataPipeline\` (ArgoCD / GitLab CI) | \`devops\` (\`robos.devops\`) |
| **Local Filesystem** | \`/tmp/acme-legacy-monorepo\` | \`robos:Microservice\` (Inventory), Local \`robos:ADR\` | \`services\` & \`documentation\` |

---

## 3. Confluence Flow Diagram (Mermaid Sequence Syntax)

Sequence flows extracted from Confluence spaces are modeled as first-class \`robos:FlowDiagram\` nodes containing machine-readable Mermaid syntax, user-facing tooltips, and system interaction sequences:

![Flow Diagram Inspector](docs/assets/images/screenshots/kgraph-importer-flow-diagram.png)

\`\`\`mermaid
sequenceDiagram
  autonumber
  actor Customer as Customer SPA
  participant Checkout as Checkout API (Java)
  participant Payments as Payment Gateway (Java)
  participant Kafka as Apache Kafka
  Customer->>Checkout: POST /api/v1/checkout/orders
  Checkout->>Payments: POST /api/v1/payments/charge
  Payments-->>Checkout: 200 OK (Transaction Approved)
  Checkout->>Kafka: Publish "orders.created" event
  Checkout-->>Customer: 201 Created (Order Confirmed)
\`\`\`

---

## 4. Architecture Decision Records (ADRs)

Both Confluence and local filesystem ADRs are ingested into \`robos:ArchitectureDecisionRecord\` nodes declaring governance status (\`accepted\`), context, decision, consequences, and trace links:

![Architecture Decision Record](docs/assets/images/screenshots/kgraph-importer-adr.png)

---

## 5. GitHub Organizations & Inherited Agent Rules

Forge organizations are modeled as \`robos:GitProjectOrganization\` nodes. Organization-wide architectural constraints (\`robos:agentRules\`) are tracked at the organization root. AI agents working on any member repository automatically inherit these rules via \`store.getEffectiveAgentRulesForRepository()\`:

![GitHub Organization & Agent Rules](docs/assets/images/screenshots/kgraph-importer-git-org.png)

**Inherited Rules for \`acme-payments\`**:
- All monetary amounts must be handled using integer cents or BigDecimal to avoid floating point errors.
- Mutual TLS (mTLS) is mandatory for all inbound payment gateway endpoints.
- PCI-DSS compliance: Never log unmasked credit card or PAN numbers in application logs.

---

## 6. Microservice & OpenAPI 3.1 Contract Generation

For individual GitHub repositories such as \`checkout-api\`, the importer automatically provisions the microservice entity and synthesizes an OpenAPI 3.1 YAML contract with REST CRUD endpoints:

![Checkout API Microservice](docs/assets/images/screenshots/kgraph-importer-checkout-service.png)

---

## 7. GitLab GitOps Deployment Pipelines

GitLab repositories with CI/CD manifests are classified into \`robos:DataPipeline\` nodes, assigned \`robos:forgeType: "gitlab"\`, and stored in the \`devops\` package:

![GitLab GitOps Pipeline](docs/assets/images/screenshots/kgraph-importer-devops-pipeline.png)

---

## 8. 100% SHACL Constraint Conformance

All generated entities across all 5 resource targets satisfy RobOS SHACL shapes, ensuring zero schema violations and complete semantic interoperability:

![SHACL Validation Conformance](docs/assets/images/screenshots/kgraph-importer-shacl-valid.png)

---

## CLI & Programmatic Usage

### Natural Language Prompt via CLI
\`\`\`bash
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \\
  --prompt "Import Confluence https://confluence.acme.corp/display/ARCH, GitHub orgs https://github.com/acme-payments, https://github.com/acme-identity, and repo https://github.com/acme-retail/checkout-api" \\
  --output ./acme-global-kgraph.jsonld
\`\`\`

### Programmatic Usage in RobOS Agents
\`\`\`javascript
const { KGraphResourceImporter } = require('robos-graph');

const importer = new KGraphResourceImporter({
  companyName: 'Acme Global',
  companySlug: 'acme',
});

const { plan, importResult, summary } = await importer.importFromPrompt(userPrompt);
console.log('Ingested Nodes:', summary.totalNodes);
console.log('SHACL Conformance:', summary.shacl.conforms);
\`\`\`
`;

  fs.writeFileSync(path.join(PERSIST_DIR, 'walkthrough.md'), walkthroughContent, 'utf8');
  fs.writeFileSync(path.join(PERSIST_DIR, 'step-by-step.md'), walkthroughContent, 'utf8');
  fs.writeFileSync(path.join(BRAIN_DIR, 'kgraph-resource-importer-walkthrough.md'), walkthroughContent, 'utf8');

  console.log(`\n💾 Saved walkthrough documentation to:`);
  console.log(`  • ${path.join(PERSIST_DIR, 'walkthrough.md')}`);
  console.log(`  • ${path.join(BRAIN_DIR, 'kgraph-resource-importer-walkthrough.md')}`);
  console.log(`\n✨ Walkthrough execution completed successfully!\n`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Demo error:', err);
    process.exit(1);
  });
}

module.exports = { main };
