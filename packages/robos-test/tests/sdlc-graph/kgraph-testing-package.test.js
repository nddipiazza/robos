'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  OSLCGraphParser,
  SHACLValidator,
  BUILTIN_SHACL_SHAPES,
} = require('../../../robos-graph/index');
const { KGraphPackageManager } = require('../../../robos-graph/lib/package-manager');
const { SchemaDocGenerator } = require('../../../robos-graph/lib/schema-doc-generator');

describe('SDLC Knowledge Graph: Testing Package, Gherkin BDD, Build Systems & refersFrom Provenance', () => {

  it('1. Package Manager: registers the 8th standard package (testing / robos.testing) and routes entities correctly', () => {
    const pkgManager = new KGraphPackageManager({ baseDir: path.join(__dirname, '../../../../.robos') });
    const pkgs = pkgManager.listPackages();
    assert.strictEqual(pkgs.length >= 8, true);

    const testingPkg = pkgs.find(p => p.id === 'testing');
    assert.ok(testingPkg, 'testing package should exist');
    assert.strictEqual(testingPkg.namespace, 'robos.testing');

    // Verify routing of BDD and testing types
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:GherkinFeature' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:GherkinBackground' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:GherkinRule' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:Scenario' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:ScenarioOutline' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:ExamplesTable' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:StepDefinition' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:DataTable' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:DocString' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:TestingLibrary' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:TestPlan' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:TestSuite' }), 'testing');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': 'robos:TestExecutionRecord' }), 'testing');
  });

  it('2. Standard Package File (.robos/kgraphs/testing/package.jsonld): loads and conforms 100% to SHACL rules', () => {
    const pkgFile = path.join(__dirname, '../../../../.robos/kgraphs/testing/package.jsonld');
    assert.strictEqual(fs.existsSync(pkgFile), true, 'testing package.jsonld must exist');

    const content = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    const parser = new OSLCGraphParser(content);
    assert.strictEqual(parser.nodes.length >= 25, true, 'Should contain Gherkin elements and 16 testing frameworks');

    const validator = new SHACLValidator(BUILTIN_SHACL_SHAPES);
    const result = validator.validateGraph(parser);
    assert.strictEqual(result.conforms, true, `SHACL violations found: ${JSON.stringify(result.results, null, 2)}`);
    assert.strictEqual(result.resultsCount, 0);
  });

  it('3. SDLCKnowledgeGraphStore: registers complete Gherkin grammar and links them to services', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-testing-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // Register microservice
    const srvId = 'urn:robos:service:orders-v2';
    store.addNode({
      '@id': srvId,
      '@type': ['robos:Microservice', 'oslc_am:Resource'],
      'dcterms:title': 'Orders API v2',
      'robos:technology': 'Go 1.22',
      'robos:repository': 'github.com/acme/orders-v2',
      'robos:package': 'services',
      'robos:namespace': 'robos.services',
      'robos:ownerTeam': 'urn:robos:team:order-processing',
      'robos:refersFrom': 'https://schema.org/SoftwareApplication',
    });

    // Register Gherkin Feature
    const featRes = store.registerGherkinFeature({
      slug: 'order-cancellation',
      title: 'Order Cancellation Flow',
      description: 'Customer can cancel an order within 1 hour of placing it.',
      featureFile: 'features/order_cancellation.feature',
      testsService: srvId,
      tags: ['cancellation', 'orders'],
    });
    assert.strictEqual(featRes.ok, true);
    const featId = featRes.node['@id'];

    // Register Background
    const bgRes = store.registerGherkinBackground({
      slug: 'order-cancellation:bg',
      title: 'Prerequisite authenticated order',
      steps: ['Given customer is logged in', 'And has an active order #12345'],
      inFeature: featId,
    });
    assert.strictEqual(bgRes.ok, true);

    // Register Rule
    const ruleRes = store.registerGherkinRule({
      slug: 'order-cancellation:rule-time-limit',
      title: 'Cancellation Time Limit Rule',
      description: 'Orders older than 1 hour cannot be cancelled via self-service.',
      inFeature: featId,
    });
    assert.strictEqual(ruleRes.ok, true);

    // Register Scenario Outline with Examples Table
    const exRes = store.registerExamplesTable({
      slug: 'cancellation-reasons',
      title: 'Allowed Cancellation Reasons',
      tableHeaders: ['reason_code', 'refund_type'],
      tableRows: [['CUSTOMER_REQUEST', 'FULL'], ['FOUND_CHEAPER', 'STORE_CREDIT']],
    });
    assert.strictEqual(exRes.ok, true);

    const outlineRes = store.registerScenarioOutline({
      slug: 'order-cancellation:outline-reasons',
      title: 'Parameterized cancellation reasons',
      steps: ['Given order #12345 is pending', 'When customer cancels with <reason_code>', 'Then refund is <refund_type>'],
      examplesTable: exRes.node['@id'],
      inFeature: featId,
    });
    assert.strictEqual(outlineRes.ok, true);

    // Register Step Definition
    const stepDefRes = store.registerStepDefinition({
      slug: 'stepdef-cancel-order',
      title: 'StepDef: Cancel Order',
      regexPattern: '^customer cancels with (.*)$',
      codeFile: 'tests/steps/cancellation_steps.js',
      functionName: 'cancelOrderStep',
    });
    assert.strictEqual(stepDefRes.ok, true);

    // Register Test Execution Record
    const execRes = store.registerTestExecutionRecord({
      slug: 'exec-cancellation-run-1',
      title: 'Run 1: Cancellation Flow',
      executionStatus: 'PASS',
      reportsOnTestCase: outlineRes.node['@id'],
      testFramework: 'cucumber',
      durationMs: 310,
    });
    assert.strictEqual(execRes.ok, true);

    // Test Query Traversal Methods
    const srvFeatures = store.getGherkinFeaturesForService(srvId);
    assert.strictEqual(srvFeatures.length, 1);
    assert.strictEqual(srvFeatures[0]['@id'], featId);

    const scenarios = store.getScenariosForFeature(featId);
    assert.strictEqual(scenarios.length, 1);
    assert.strictEqual(scenarios[0]['@id'], outlineRes.node['@id']);
  });

  it('4. Testing Libraries: registers 16 major testing frameworks with correct paradigms and ecosystems', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-testlibs-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    const frameworks = [
      { slug: 'cucumber', title: 'Cucumber', testingType: 'bdd', language: 'polyglot' },
      { slug: 'jest', title: 'Jest', testingType: 'unit', language: 'javascript' },
      { slug: 'vitest', title: 'Vitest', testingType: 'unit', language: 'typescript' },
      { slug: 'playwright', title: 'Playwright', testingType: 'e2e', language: 'polyglot' },
      { slug: 'cypress', title: 'Cypress', testingType: 'e2e', language: 'javascript' },
      { slug: 'junit5', title: 'JUnit 5', testingType: 'unit', language: 'java' },
      { slug: 'testng', title: 'TestNG', testingType: 'integration', language: 'java' },
      { slug: 'mockito', title: 'Mockito', testingType: 'mocking', language: 'java' },
      { slug: 'pytest', title: 'Pytest', testingType: 'unit', language: 'python' },
      { slug: 'robot-framework', title: 'Robot Framework', testingType: 'bdd', language: 'python' },
      { slug: 'pact', title: 'Pact', testingType: 'contract', language: 'polyglot' },
      { slug: 'k6', title: 'k6', testingType: 'performance', language: 'javascript' },
      { slug: 'restassured', title: 'REST Assured', testingType: 'api', language: 'java' },
      { slug: 'testify', title: 'Testify', testingType: 'unit', language: 'go' },
      { slug: 'godog', title: 'Godog', testingType: 'bdd', language: 'go' },
      { slug: 'mocha', title: 'Mocha', testingType: 'unit', language: 'javascript' },
    ];

    for (const fw of frameworks) {
      const res = store.registerTestingLibrary(fw);
      assert.strictEqual(res.ok, true, `Failed registering ${fw.title}`);
      assert.strictEqual(res.node['robos:refersFrom'], 'https://schema.org/SoftwareApplication');
    }

    const allLibs = store.getTestingLibraries();
    assert.strictEqual(allLibs.length, 16);

    const bddLibs = store.getTestingLibraries({ testingType: 'bdd' });
    assert.strictEqual(bddLibs.length, 3); // cucumber, robot-framework, godog

    const javaLibs = store.getTestingLibraries({ language: 'java' });
    assert.strictEqual(javaLibs.length, 4); // junit5, testng, mockito, restassured
  });

  it('5. Build Systems: registers Maven, Gradle, Cargo, Go, pnpm, and CMake build systems with refersFrom', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-buildsystems-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    const buildTools = [
      { slug: 'acme-maven', title: 'Acme Maven', buildTool: 'maven', configFile: 'pom.xml' },
      { slug: 'acme-gradle', title: 'Acme Gradle', buildTool: 'gradle', configFile: 'build.gradle.kts' },
      { slug: 'acme-cargo', title: 'Acme Cargo', buildTool: 'cargo', configFile: 'Cargo.toml' },
      { slug: 'acme-go', title: 'Acme Go', buildTool: 'go', configFile: 'go.mod' },
      { slug: 'acme-pnpm', title: 'Acme pnpm', buildTool: 'pnpm', configFile: 'pnpm-workspace.yaml' },
      { slug: 'acme-cmake', title: 'Acme CMake', buildTool: 'cmake', configFile: 'CMakeLists.txt' },
    ];

    for (const bt of buildTools) {
      const res = store.registerBuildSystem(bt);
      assert.strictEqual(res.ok, true, `Failed registering ${bt.title}`);
      assert.strictEqual(res.node['robos:buildTool'], bt.buildTool);
      assert.strictEqual(res.node['robos:configFile'], bt.configFile);
      assert.strictEqual(res.node['robos:refersFrom'], 'https://schema.org/SoftwareApplication');
    }

    const allBuilds = store.getBuildSystems();
    assert.strictEqual(allBuilds.length, 6);

    const mavenBuilds = store.getBuildSystems({ buildTool: 'maven' });
    assert.strictEqual(mavenBuilds.length, 1);
  });

  it('6. refersFrom Canonical Provenance: all 91 SHACL constraint shapes define upstream schema links', () => {
    assert.strictEqual(BUILTIN_SHACL_SHAPES.length, 91, 'Should have exactly 91 SHACL constraint shapes');

    for (const shape of BUILTIN_SHACL_SHAPES) {
      assert.ok(shape.refersFrom, `Shape ${shape.shapeId} (${shape.targetClass}) must have refersFrom defined`);
      assert.strictEqual(
        shape.refersFrom.startsWith('http://') || shape.refersFrom.startsWith('https://'),
        true,
        `Shape ${shape.shapeId} refersFrom must be a valid URI: ${shape.refersFrom}`
      );
    }
  });

  it('7. Schema Documentation Generator: renders Upstream Schema Basis (Refers From) section on generated docs', () => {
    const generator = new SchemaDocGenerator({
      rootDir: path.join(__dirname, '../../../..'),
    });

    const gherkinFeatureShape = BUILTIN_SHACL_SHAPES.find(s => s.targetClass === 'robos:GherkinFeature');
    assert.ok(gherkinFeatureShape);

    const md = generator.generateSchemaMarkdown(gherkinFeatureShape, {
      id: 'testing',
      namespace: 'robos.testing',
      displayTitle: 'Testing, Quality & BDD (robos.testing)',
      shapes: [gherkinFeatureShape],
    }, 1);

    assert.strictEqual(md.includes('## Upstream Schema Basis (Refers From)'), true);
    assert.strictEqual(md.includes('http://open-services.net/ns/rm#Requirement'), true);
    assert.strictEqual(md.includes('When autonomous agents generate, expand, or validate instances of `robos:GherkinFeature`'), true);
  });

  it('8. Universal Schema.org Coverage: 100% of all 91 shapes define canonical schemaOrgType and domainStandard', () => {
    assert.strictEqual(BUILTIN_SHACL_SHAPES.length, 91, 'Should evaluate all 91 shapes');

    for (const shape of BUILTIN_SHACL_SHAPES) {
      assert.ok(shape.schemaOrgType, `Shape ${shape.shapeId} (${shape.targetClass}) must define schemaOrgType`);
      assert.strictEqual(
        shape.schemaOrgType.startsWith('https://schema.org/'),
        true,
        `Shape ${shape.targetClass} schemaOrgType must start with https://schema.org/ (got ${shape.schemaOrgType})`
      );
      assert.ok(shape.domainStandard, `Shape ${shape.targetClass} must define domainStandard`);
    }
  });

  it('9. Formal Ontology Bridge: .robos/ontology.jsonld maps all 91 classes via rdfs:subClassOf', () => {
    const ontologyPath = path.join(__dirname, '../../../../.robos/ontology.jsonld');
    assert.strictEqual(fs.existsSync(ontologyPath), true, '.robos/ontology.jsonld must exist');

    const ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8'));
    assert.strictEqual(ontology['@type'], 'owl:Ontology');
    assert.ok(ontology['@graph']);
    assert.strictEqual(ontology['@graph'].length, 91, 'Ontology graph must contain all 91 classes');

    for (const item of ontology['@graph']) {
      assert.strictEqual(item['@type'], 'rdfs:Class');
      assert.ok(item['rdfs:subClassOf']['@id'].startsWith('https://schema.org/'));
      assert.ok(item['robos:shaclShape']);
    }
  });

});

