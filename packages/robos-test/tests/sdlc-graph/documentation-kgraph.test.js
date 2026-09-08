'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  KGraphPackageManager,
  DEFAULT_PACKAGES,
} = require('../../../robos-graph/index');
const { SHACLValidator, BUILTIN_SHACL_SHAPES } = require('../../../robos-graph/lib/shacl-validator');
const { OSLCGraphParser, OSLC_CONTEXT } = require('../../../robos-graph/lib/oslc-parser');
const { SchemaDocGenerator } = require('../../../robos-graph/lib/schema-doc-generator');

describe('RobOS Documentation Package & FlowDiagram First-Class Elements', () => {
  it('1. Registers documentation package (robos.docs) and routes documentation entities', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-doc-pkg-'));
    const pkgMgr = new KGraphPackageManager({ rootDir: tmpDir });

    const packages = pkgMgr.listPackages();
    assert.strictEqual(packages.length, 8, 'Must register 8 standard packages');

    const docPkg = pkgMgr.getPackage('documentation');
    assert.ok(docPkg, 'documentation package must exist');
    assert.strictEqual(docPkg.id, 'documentation');
    assert.strictEqual(docPkg.namespace, 'robos.docs');
    assert.ok(fs.existsSync(docPkg.filePath), 'Package file must exist on disk');

    // Test routing inference
    const flowNode = {
      '@id': 'urn:robos:diagram:checkout-flow',
      '@type': ['robos:FlowDiagram'],
      'dcterms:title': 'Checkout Workflow',
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(flowNode), 'documentation');

    const docNode = {
      '@id': 'urn:robos:doc:arch-overview',
      '@type': ['robos:DocumentationPage'],
      'dcterms:title': 'Architecture Overview',
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(docNode), 'documentation');

    const adrNode = {
      '@id': 'urn:robos:adr:002-cache',
      '@type': ['robos:ArchitectureDecisionRecord', 'robos:ADR'],
      'dcterms:title': 'ADR-002: Remote Caching',
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(adrNode), 'documentation');

    const walkthroughNode = {
      '@id': 'urn:robos:walkthrough:demo',
      '@type': ['robos:InteractiveWalkthrough'],
      'dcterms:title': 'Interactive Tour',
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(walkthroughNode), 'documentation');

    const snippetNode = {
      '@id': 'urn:robos:snippet:sample',
      '@type': ['robos:CodeSnippet', 'robos:CodeSample'],
      'dcterms:title': 'Sample Snippet',
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(snippetNode), 'documentation');
  });

  it('2. SHACL enforces FlowDiagram required properties (title, description, mermaidText, imagePath, tooltip)', () => {
    const validator = new SHACLValidator();

    // Valid FlowDiagram
    const validDiagram = {
      '@id': 'urn:robos:diagram:valid-flow',
      '@type': ['oslc_am:Resource', 'robos:FlowDiagram'],
      'dcterms:title': 'Valid Payment Workflow Diagram',
      'dcterms:description': 'Visual state transitions and gateway interactions for payment processing.',
      'robos:mermaidText': 'graph TD\n    A[Card Input] --> B[Stripe Auth]\n    B --> C[Receipt]',
      'robos:imagePath': 'assets/images/architecture/payment-flow.jpg',
      'robos:tooltip': 'Inspect payment gateway state machine and event hooks',
      'robos:diagramType': 'flowchart',
      'robos:aspectRatio': '16:9',
      'robos:package': 'documentation',
      'robos:namespace': 'robos.docs',
    };

    const validRes = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [validDiagram],
    }));
    assert.strictEqual(validRes.conforms, true, 'Valid FlowDiagram must conform to SHACL rules');
    assert.strictEqual(validRes.resultsCount, 0);

    // Invalid FlowDiagram missing required properties
    const invalidDiagram = {
      '@id': 'urn:robos:diagram:invalid-flow',
      '@type': ['robos:FlowDiagram'],
      // Missing title, description, mermaidText, imagePath, tooltip
    };

    const invalidRes = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [invalidDiagram],
    }));
    assert.strictEqual(invalidRes.conforms, false, 'Invalid FlowDiagram must fail SHACL');
    assert.strictEqual(invalidRes.resultsCount, 5, 'Must report all 5 missing mandatory properties');

    const paths = invalidRes.results.map(r => r.resultPath);
    assert.ok(paths.includes('dcterms:title'));
    assert.ok(paths.includes('dcterms:description'));
    assert.ok(paths.includes('robos:mermaidText'));
    assert.ok(paths.includes('robos:imagePath'));
    assert.ok(paths.includes('robos:tooltip'));
  });

  it('3. SHACL validates DocumentationPage, ADR, InteractiveWalkthrough, and CodeSnippet', () => {
    const validator = new SHACLValidator();

    const validNodes = [
      {
        '@id': 'urn:robos:doc:guide-1',
        '@type': ['robos:DocumentationPage'],
        'dcterms:title': 'Developer Getting Started Guide',
        'robos:slug': 'getting-started-guide',
        'robos:docPath': 'docs/guides/getting-started.md',
      },
      {
        '@id': 'urn:robos:adr:003',
        '@type': ['robos:ArchitectureDecisionRecord'],
        'dcterms:title': 'ADR-003: Adopt Bazel Distributed Build Engine',
        'robos:status': 'accepted',
        'robos:context': 'Build times on monolithic microservices reached 45 minutes.',
        'robos:decision': 'Implement REAPI v2 Buildbarn remote execution cluster.',
      },
      {
        '@id': 'urn:robos:walkthrough:devcentral',
        '@type': ['robos:InteractiveWalkthrough'],
        'dcterms:title': 'Dev Central Daily Briefing Walkthrough',
        'robos:slug': 'dev-central-briefing',
        'robos:targetApp': 'dev-central',
      },
      {
        '@id': 'urn:robos:snippet:hello-world',
        '@type': ['robos:CodeSnippet'],
        'dcterms:title': 'Hello World in RobOS Shell',
        'robos:language': 'bash',
        'robos:code': 'echo "Hello from RobOS"',
      },
    ];

    const res = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': validNodes,
    }));
    assert.strictEqual(res.conforms, true, 'All documentation primitives must conform to SHACL');
  });

  it('4. Graph Store CRUD operations for FlowDiagrams and Documentation Primitives', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-store-doc-'));
    const store = new SDLCKnowledgeGraphStore({ rootDir: tmpDir });

    // 1. Create FlowDiagram with aliases (aiGeneratedImagePath, mermaidGraph)
    const diagramRes = store.createFlowDiagram({
      slug: 'order-processing-sequence',
      title: 'Order Processing Sequence Diagram',
      description: 'Sequence diagram tracing order submission to payment authorization.',
      mermaidGraph: 'sequenceDiagram\n    Client->>API: Order\n    API->>Stripe: Charge',
      aiGeneratedImagePath: 'assets/images/architecture/order-sequence.jpg',
      tooltip: 'Click to trace payment authorization sequence',
      diagramType: 'sequence',
      aspectRatio: '16:9',
      targetComponent: 'urn:robos:service:orders-api',
      tags: ['Ordering', 'Sequence', 'Architecture'],
      nodeCount: 4,
    });

    assert.strictEqual(diagramRes.ok, true, 'Should successfully create FlowDiagram');
    assert.strictEqual(diagramRes.node['robos:mermaidText'], 'sequenceDiagram\n    Client->>API: Order\n    API->>Stripe: Charge');
    assert.strictEqual(diagramRes.node['robos:imagePath'], 'assets/images/architecture/order-sequence.jpg');
    assert.strictEqual(diagramRes.node['robos:package'], 'documentation');

    const retrievedDiagram = store.getFlowDiagram('order-processing-sequence');
    assert.ok(retrievedDiagram);
    assert.strictEqual(retrievedDiagram['dcterms:title'], 'Order Processing Sequence Diagram');

    // 2. Create DocumentationPage linked to FlowDiagram
    const pageRes = store.createDocumentationPage({
      slug: 'order-processing-guide',
      title: 'Order Processing Architectural Guide',
      docPath: 'docs/architecture/order-processing.md',
      description: 'Living guide explaining the order processing system.',
      category: 'Architecture',
      hasFlowDiagram: retrievedDiagram['@id'],
      targetNode: 'urn:robos:service:orders-api',
    });

    assert.strictEqual(pageRes.ok, true, 'Should successfully create DocumentationPage');
    const retrievedPage = store.getDocumentationPage('order-processing-guide');
    assert.ok(retrievedPage);
    assert.strictEqual(retrievedPage['robos:hasFlowDiagram'], retrievedDiagram['@id']);

    // 3. Create ArchitectureDecisionRecord (createADR)
    const adrRes = store.createADR({
      slug: 'adr-004-event-driven-orders',
      adrNumber: 'ADR-004',
      title: 'ADR-004: Event-Driven Order Processing via Kafka',
      status: 'accepted',
      context: 'Synchronous REST calls caused cascading timeouts during flash sales.',
      decision: 'Transition all post-order fulfillment to asynchronous Kafka event topics.',
      consequences: 'Improves fault isolation and throughput; requires eventual consistency reconciliation.',
      hasFlowDiagram: retrievedDiagram['@id'],
    });

    assert.strictEqual(adrRes.ok, true, 'Should successfully create ADR');
    const retrievedADR = store.getADR('ADR-004');
    assert.ok(retrievedADR);
    assert.strictEqual(retrievedADR['robos:adrNumber'], 'ADR-004');
    assert.strictEqual(retrievedADR['robos:status'], 'accepted');

    // 4. Create InteractiveWalkthrough
    const walkthroughRes = store.createInteractiveWalkthrough({
      slug: 'order-studio-tour',
      title: 'Order Processing Studio Tour',
      targetApp: 'dev-central',
      description: 'Tour of order management features in Dev Central.',
      walkthroughPath: 'docs/walkthroughs/order-tour.md',
      videoPath: 'assets/videos/order-tour.mp4',
      stepsCount: 5,
      hasFlowDiagram: retrievedDiagram['@id'],
    });

    assert.strictEqual(walkthroughRes.ok, true, 'Should successfully create InteractiveWalkthrough');
    const retrievedTour = store.getInteractiveWalkthrough('order-studio-tour');
    assert.ok(retrievedTour);
    assert.strictEqual(retrievedTour['robos:targetApp'], 'dev-central');

    // 5. Create CodeSnippet
    const snippetRes = store.createCodeSnippet({
      slug: 'order-client-example',
      title: 'Order API Client Invocation',
      language: 'javascript',
      code: 'const client = new OrderClient();\nawait client.submitOrder(order);',
      description: 'Example showing how to submit an order asynchronously.',
    });

    assert.strictEqual(snippetRes.ok, true, 'Should successfully create CodeSnippet');
    const retrievedSnippet = store.getCodeSnippet('order-client-example');
    assert.ok(retrievedSnippet);
    assert.strictEqual(retrievedSnippet['robos:language'], 'javascript');

    // 6. Test outgoing edge collection and parser links
    const nodeIndex = store.parser.getNode(retrievedPage['@id']);
    assert.ok(nodeIndex, 'DocumentationPage must be indexed in graph parser');
    const outgoing = store.parser.outgoingRefs.get(retrievedPage['@id']);
    assert.ok(outgoing && outgoing.has(retrievedDiagram['@id']), 'Outgoing ref must include linked FlowDiagram');

    // 7. Verify save to disk under documentation package
    store.save();
    const docPkg = store.packageManager.getPackage('documentation');
    assert.ok(docPkg, 'Documentation package must exist in package manager');
    const docPkgFile = docPkg.filePath;
    assert.ok(fs.existsSync(docPkgFile), 'Documentation package file must be written to disk: ' + docPkgFile);
    const savedDocPkg = JSON.parse(fs.readFileSync(docPkgFile, 'utf8'));
    assert.ok(savedDocPkg['@graph'].some(n => n['@id'] === retrievedDiagram['@id']));
    assert.ok(savedDocPkg['@graph'].some(n => n['@id'] === retrievedPage['@id']));
    assert.ok(savedDocPkg['@graph'].some(n => n['@id'] === retrievedADR['@id']));
  });

  it('5. SchemaDocGenerator documents documentation package and FlowDiagram schema', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });

    const result = generator.generateAll();
    assert.strictEqual(result.ok, true);

    // Verify documentation package docs generated
    const docPkgPath = path.join(rootDir, 'docs', 'schemas', 'documentation.md');
    assert.ok(fs.existsSync(docPkgPath), 'docs/schemas/documentation.md exists');
    const pkgContent = fs.readFileSync(docPkgPath, 'utf8');
    assert.ok(pkgContent.includes('Documentation & Diagrams (robos.docs)'));
    assert.ok(pkgContent.includes('robos:FlowDiagram'));

    // Verify FlowDiagram schema doc
    const flowDocPath = path.join(rootDir, 'docs', 'schemas', 'documentation', 'flow-diagram.md');
    assert.ok(fs.existsSync(flowDocPath), 'flow-diagram.md exists');
    const flowContent = fs.readFileSync(flowDocPath, 'utf8');
    assert.ok(flowContent.includes('Flow Diagram'));
    assert.ok(flowContent.includes('`robos:mermaidText`'));
    assert.ok(flowContent.includes('`robos:imagePath`'));
    assert.ok(flowContent.includes('`robos:tooltip`'));

    // Verify JSON example in flow-diagram.md parses correctly
    const match = flowContent.match(/```json\n([\s\S]*?)\n```/);
    assert.ok(match, 'JSON block found in flow-diagram.md');
    const parsed = JSON.parse(match[1]);
    assert.ok(parsed['robos:mermaidText']);
    assert.ok(parsed['robos:imagePath']);
    assert.ok(parsed['robos:tooltip']);
  });
});
