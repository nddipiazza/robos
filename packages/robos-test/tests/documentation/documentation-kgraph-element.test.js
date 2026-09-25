'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  SHACLValidator,
  OSLCGraphParser,
  OSLC_CONTEXT,
} = require('../../../robos-graph/index');

describe('RobOS Documentation Official KGraph Element & SHACL Governance', () => {
  it('1. SHACL strictly validates conforming robos:Documentation entity', () => {
    const validator = new SHACLValidator();

    const validDocNode = {
      '@id': 'urn:robos:documentation:orders-service',
      '@type': ['oslc_am:Resource', 'robos:Documentation', 'schema:TechArticle'],
      'dcterms:title': 'Orders Microservice Architecture & Event Contracts',
      'dcterms:description': 'Living architecture specifications, Kafka event topics, and BDD test traces.',
      'robos:targetEntity': 'urn:robos:service:order-service',
      'robos:docPath': 'docs/architecture/order-service.md',
      'robos:gitopsFile': '.robos/documentation.yaml',
      'robos:category': 'Services',
      'robos:package': 'documentation',
      'robos:namespace': 'robos.docs',
      'robos:schemaOrgType': 'https://schema.org/TechArticle',
      'robos:domainStandard': 'https://schema.org/TechArticle',
    };

    const result = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [validDocNode],
    }));

    assert.strictEqual(result.conforms, true, 'Valid robos:Documentation must conform to SHACL DocumentationShape');
    assert.strictEqual(result.resultsCount, 0);
  });

  it('2. SHACL enforces all required properties on robos:Documentation and rejects non-conforming nodes', () => {
    const validator = new SHACLValidator();

    const invalidDocNode = {
      '@id': 'urn:robos:documentation:invalid-doc',
      '@type': ['robos:Documentation'],
      // Missing dcterms:title, robos:targetEntity, robos:docPath, robos:gitopsFile
    };

    const result = validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      'robos:nodes': [invalidDocNode],
    }));

    assert.strictEqual(result.conforms, false, 'Invalid robos:Documentation must fail SHACL validation');
    assert.strictEqual(result.resultsCount, 4, 'Must report all 4 missing mandatory properties');

    const paths = result.results.map(r => r.resultPath);
    assert.ok(paths.includes('dcterms:title'), 'Must require dcterms:title');
    assert.ok(paths.includes('robos:targetEntity'), 'Must require robos:targetEntity');
    assert.ok(paths.includes('robos:docPath'), 'Must require robos:docPath');
    assert.ok(paths.includes('robos:gitopsFile'), 'Must require robos:gitopsFile');
  });

  it('3. Selectively identifies documentable KGraph entries while filtering out fine-grained sub-elements', () => {
    const store = new SDLCKnowledgeGraphStore();

    // Documentable architectural archetypes
    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:service:sample-api',
      '@type': ['robos:Microservice'],
    }), true, 'Microservice must be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:app:customer-portal',
      '@type': ['robos:FrontEndApp'],
    }), true, 'FrontEndApp must be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:app:dev-central',
      '@type': ['robos:DesktopApp'],
    }), true, 'DesktopApp must be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:db:postgres-orders',
      '@type': ['robos:Database'],
    }), true, 'Database must be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:broker:kafka',
      '@type': ['robos:MessageBroker'],
    }), true, 'MessageBroker must be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:cluster:k8s-prod',
      '@type': ['robos:KubernetesCluster'],
    }), true, 'KubernetesCluster must be documentable');

    // Fine-grained sub-elements that SHOULD NOT be documentable
    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:testing:step-def:01',
      '@type': ['robos:StepDefinition'],
    }), false, 'StepDefinition must not be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:testing:doc-string:01',
      '@type': ['robos:DocString'],
    }), false, 'DocString must not be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:testing:data-table:01',
      '@type': ['robos:DataTable'],
    }), false, 'DataTable must not be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:testing:test-run:01',
      '@type': ['robos:TestExecutionRecord'],
    }), false, 'TestExecutionRecord must not be documentable');

    assert.strictEqual(store.isDocumentableNode({
      '@id': 'urn:robos:git:commit:abc1234',
      '@type': ['robos:GitCommit'],
    }), false, 'GitCommit must not be documentable');
  });

  it('4. Synthesizes entity documentation, writes artifact, links robos:hasDocumentation, and syncs GitOps .robos/documentation.yaml', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-doc-synth-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath, rootDir: tmpDir });

    // Seed a sample service
    const serviceNode = {
      '@id': 'urn:robos:service:inventory-api',
      '@type': ['robos:Microservice', 'oslc_am:Resource'],
      'dcterms:title': 'Inventory Management API',
      'dcterms:description': 'Real-time stock reservation and warehouse SKU availability service.',
      'robos:repository': 'github.com/robos-inc/inventory-api',
      'robos:technology': 'Go 1.22 / gRPC / Redis',
      'robos:ownerTeam': 'Supply Chain Squad',
      'robos:package': 'services',
      'robos:namespace': 'robos.services',
    };
    store.addNode(serviceNode);

    // Generate documentation
    const docRes = store.generateEntityDocumentation({
      entityId: 'urn:robos:service:inventory-api',
    });

    assert.strictEqual(docRes.ok, true, 'Generation must succeed');
    assert.ok(docRes.docNode, 'Must return docNode');
    assert.strictEqual(docRes.docNode['@id'], 'urn:robos:documentation:inventory-api');
    assert.strictEqual(docRes.docNode['robos:targetEntity'], 'urn:robos:service:inventory-api');
    assert.strictEqual(docRes.docNode['robos:gitopsFile'], '.robos/documentation.yaml');
    assert.ok(docRes.docNode['robos:docPath'].includes('inventory-api.md'));

    // Verify entity node has robos:hasDocumentation linked
    const updatedService = store.getNode('urn:robos:service:inventory-api');
    assert.ok(updatedService);
    assert.ok(Array.isArray(updatedService['robos:hasDocumentation']));
    assert.ok(updatedService['robos:hasDocumentation'].includes('urn:robos:documentation:inventory-api'));

    // Verify Markdown file was written to disk
    assert.ok(fs.existsSync(docRes.fullPath), 'Markdown artifact file must exist on disk: ' + docRes.fullPath);
    const md = fs.readFileSync(docRes.fullPath, 'utf8');
    assert.ok(md.includes('Inventory Management API'), 'Markdown must contain title');
    assert.ok(md.includes('mermaid'), 'Markdown must contain Mermaid diagram block');
    assert.ok(md.includes('urn:robos:service:inventory-api'), 'Markdown must contain target entity URI');

    // Verify SHACL validation on the updated graph
    const validator = new SHACLValidator();
    const report = validator.validateGraph(store.parser);
    assert.strictEqual(report.conforms, true, 'Synthesized documentation must strictly conform to SHACL DocumentationShape');

    // Verify GitOps .robos/documentation.yaml synchronization
    const yamlPath = path.join(tmpDir, '.robos', 'documentation.yaml');
    assert.ok(fs.existsSync(yamlPath), '.robos/documentation.yaml must exist');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    assert.ok(yamlContent.includes('inventory-api'), 'Catalog must list inventory-api');
    assert.ok(yamlContent.includes('DocumentationCatalog'), 'Catalog kind must be DocumentationCatalog');

    // Test saving manual updates to the documentation
    const saveRes = store.saveEntityDocumentation({
      entityId: 'urn:robos:service:inventory-api',
      markdownContent: md + '\n\n## 5. High Availability SLA\n99.99% uptime target across all AZs.\n',
    });
    assert.strictEqual(saveRes.ok, true, 'Save must succeed');
    const updatedMd = fs.readFileSync(docRes.fullPath, 'utf8');
    assert.ok(updatedMd.includes('High Availability SLA'), 'Saved content must reflect updates');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
