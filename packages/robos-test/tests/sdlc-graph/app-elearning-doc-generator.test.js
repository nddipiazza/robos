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
} = require('../../../robos-graph/index');

describe('Application-Attached eLearning, Living Documentation & Completion Certificates', () => {
  it('1. Generates interactive eLearning attached to an application, scaffolds Electron app, and conforms to SHACL', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-app-el-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });
    const scaffoldDir = path.join(tmpDir, 'packages', 'forms-api-elearning');

    // 1. Target existing application: forms-api
    const appNode = store.getNode('urn:robos:service:forms-api');
    assert.ok(appNode, 'forms-api service must exist in knowledge graph');

    // 2. Generate Application-Attached eLearning
    const genResult = store.generateAppELearning({
      appId: 'urn:robos:service:forms-api',
      difficulty: 'Advanced',
      scaffoldApp: true,
      targetDir: scaffoldDir,
    });

    assert.strictEqual(genResult.ok, true);
    assert.strictEqual(genResult.created, true);
    assert.strictEqual(genResult.existing, false);
    assert.ok(genResult.course['@id'].includes('forms-api'));
    assert.strictEqual(genResult.course['robos:targetApplication'], 'urn:robos:service:forms-api');
    assert.strictEqual(genResult.course['robos:difficulty'], 'Advanced');
    assert.strictEqual(genResult.course['robos:gitopsFile'], '.robos/elearning.yaml');
    assert.ok(Array.isArray(genResult.course['robos:modules']));
    assert.strictEqual(genResult.course['robos:modules'].length, 3);

    // 3. Verify application has robos:hasELearning linked
    const updatedApp = store.getNode('urn:robos:service:forms-api');
    assert.ok(Array.isArray(updatedApp['robos:hasELearning']));
    assert.ok(updatedApp['robos:hasELearning'].includes(genResult.course['@id']));

    // 4. Validate SHACL Conformance of ELearningShape
    const validator = new SHACLValidator();
    const report1 = validator.validateGraph(store.parser);
    assert.strictEqual(report1.conforms, true, 'Knowledge Graph must conform to ELearningShape and all SHACL rules');

    // 5. Verify Scaffolding of Standalone Electron eLearning App
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'package.json')), 'package.json must be scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'main.js')), 'main.js must be scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'preload.js')), 'preload.js must be scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'renderer', 'index.html')), 'renderer/index.html must be scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'renderer', 'app.js')), 'renderer/app.js must be scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'renderer', 'style.css')), 'renderer/style.css must be scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'icon.svg')), 'icon.svg must be scaffolded');
    assert.ok(fs.existsSync(path.join(scaffoldDir, 'forms-api-elearning.desktop')), '.desktop must be scaffolded');

    const pkgData = JSON.parse(fs.readFileSync(path.join(scaffoldDir, 'package.json'), 'utf8'));
    assert.strictEqual(pkgData.name, 'robos-forms-api-elearning');

    // 6. Verify scaffolded app is registered in KGraph as DesktopApp
    const desktopAppNode = store.getNode('urn:robos:app:forms-api-elearning');
    assert.ok(desktopAppNode, 'Scaffolded app must be registered as a DesktopApp in KGraph');
    assert.strictEqual(desktopAppNode['robos:teachesApplication'], 'urn:robos:service:forms-api');
    assert.strictEqual(desktopAppNode['robos:desktopCategory'], 'Education');

    // 7. Verify subsequent call returns existing course without duplicate
    const secondCall = store.generateAppELearning({
      appId: 'forms-api',
      scaffoldApp: false,
    });
    assert.strictEqual(secondCall.ok, true);
    assert.strictEqual(secondCall.existing, true);
    assert.strictEqual(secondCall.created, false);
    assert.strictEqual(secondCall.course['@id'], genResult.course['@id']);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('2. Issues and SHACL-validates Certificate of Completion in KGraph', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-cert-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Issue Certificate for robos user
    const certResult = store.issueCertificateOfCompletion({
      appId: 'urn:robos:service:forms-api',
      userId: 'test-architect',
      scorePercentage: 98,
      skillsAcquired: [
        'Forms API Architecture',
        'OpenAPI 3.1 & Pact Contract Verification',
        'Strict Red-Green-Refactor E2E Verification'
      ],
    });

    assert.strictEqual(certResult.ok, true);
    const cert = certResult.certificate;
    assert.ok(cert);
    assert.ok(cert['@id'].startsWith('urn:robos:credential:certificate:'));
    assert.strictEqual(cert['robos:recipientUser'], 'test-architect');
    assert.strictEqual(cert['robos:scorePercentage'], 98);
    assert.ok(cert['robos:verificationHash'].startsWith('ROBOS-CERT-'));
    assert.strictEqual(cert['robos:package'], 'learning');

    // 2. Validate SHACL CertificateOfCompletionShape
    const validator = new SHACLValidator();
    const report = validator.validateGraph(store.parser);
    assert.strictEqual(report.conforms, true, 'Certificate of Completion must strictly conform to CertificateOfCompletionShape');

    // 3. Query certificates
    const foundCerts = store.getCertificatesForAppOrUser({ userId: 'test-architect' });
    assert.strictEqual(foundCerts.length, 1);
    assert.strictEqual(foundCerts[0]['@id'], cert['@id']);

    // 4. Verify application has link in robos:hasCertificate
    const appNode = store.getNode('urn:robos:service:forms-api');
    assert.ok(Array.isArray(appNode['robos:hasCertificate']));
    assert.ok(appNode['robos:hasCertificate'].includes(cert['@id']));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('3. Generates Living Documentation & FlowDiagram from application KGraph existence', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-app-doc-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    const docResult = store.generateAppDocumentation({
      appId: 'urn:robos:service:forms-api',
    });

    assert.strictEqual(docResult.ok, true);
    assert.ok(docResult.docPage);
    assert.ok(docResult.flowDiagram);
    assert.strictEqual(docResult.docPage['robos:category'], 'Architecture');
    assert.strictEqual(docResult.flowDiagram['robos:diagramType'], 'flowchart');
    assert.ok(docResult.flowDiagram['robos:mermaidText'].includes('Forms API Service'));

    // Verify application node is updated with references
    const appNode = store.getNode('urn:robos:service:forms-api');
    assert.strictEqual(appNode['robos:hasDocumentationPage'], docResult.docPage['@id']);
    assert.strictEqual(appNode['robos:hasFlowDiagram'], docResult.flowDiagram['@id']);

    // Verify documentation file is on disk
    assert.ok(fs.existsSync(docResult.filePath), 'Markdown doc file must exist on disk: ' + docResult.filePath);
    const content = fs.readFileSync(docResult.filePath, 'utf8');
    assert.ok(content.includes('Forms API Service'));
    assert.ok(content.includes('mermaid'));

    // Validate SHACL conformance of both FlowDiagram and DocumentationPage
    const validator = new SHACLValidator();
    const report = validator.validateGraph(store.parser);
    assert.strictEqual(report.conforms, true, 'DocumentationPage and FlowDiagram must conform to SHACL rules');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('4. Applies to any application archetype (FrontEndApp, DesktopApp, PCGame, ConsoleApp, Project)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-polyglot-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // Register a FrontEndApp in KGraph
    const webAppNode = {
      '@id': 'urn:robos:app:customer-portal',
      '@type': ['robos:FrontEndApp', 'schema:WebApplication', 'oslc:Resource'],
      'dcterms:title': 'Customer Portal SPA',
      'dcterms:description': 'React & Vite single-page application for client checkout.',
      'robos:repository': 'github.com/acme/customer-portal',
      'robos:technology': 'TypeScript / React',
      'robos:frontendFramework': 'React',
      'robos:buildTool': 'Vite',
      'robos:devServerPort': 3000,
      'robos:ownerTeam': 'urn:robos:team:frontend-guild',
      'robos:package': 'applications',
      'robos:namespace': 'robos.apps',
    };
    store.addNode(webAppNode);

    // Generate eLearning for FrontEndApp
    const res = store.generateAppELearning({
      appId: 'customer-portal',
      difficulty: 'Beginner',
      scaffoldApp: false,
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.course['robos:targetApplication'], 'urn:robos:app:customer-portal');
    assert.ok(res.course['dcterms:title'].includes('Customer Portal SPA'));
    assert.ok(res.course['robos:topic'].includes('Customer Portal SPA'));

    const updatedWebNode = store.getNode('urn:robos:app:customer-portal');
    assert.ok(updatedWebNode['robos:hasELearning'].includes(res.course['@id']));

    // Issue certificate
    const certRes = store.issueCertificateOfCompletion({
      appId: 'customer-portal',
      userId: 'frontend-lead',
      scorePercentage: 100,
    });
    assert.strictEqual(certRes.ok, true);

    const validator = new SHACLValidator();
    const report = validator.validateGraph(store.parser);
    assert.strictEqual(report.conforms, true, 'Polyglot application eLearning and certificate must conform to SHACL rules');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('5. RobOS GUI inspector correctly renders eLearning and Living Documentation action cards', () => {
    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../../../robos-graph/renderer/app.js'), 'utf8');

    // Verify GUI helper functions exist in renderer/app.js
    assert.ok(appJsContent.includes('function isAppOrProjectNode'), 'renderer/app.js must define isAppOrProjectNode');
    assert.ok(appJsContent.includes('function renderAppELearningAndDocCardsHtml'), 'renderer/app.js must define renderAppELearningAndDocCardsHtml');
    assert.ok(appJsContent.includes('window.generateAndLaunchAppELearning'), 'renderer/app.js must expose window.generateAndLaunchAppELearning');
    assert.ok(appJsContent.includes('window.launchAppELearning'), 'renderer/app.js must expose window.launchAppELearning');
    assert.ok(appJsContent.includes('window.awardAppCertificate'), 'renderer/app.js must expose window.awardAppCertificate');
    assert.ok(appJsContent.includes('window.generateAppDocumentation'), 'renderer/app.js must expose window.generateAppDocumentation');

    // Verify cards HTML generation includes action buttons
    assert.ok(appJsContent.includes('id="btn-generate-app-elearning"'), 'Must have Generate & Launch eLearning button ID');
    assert.ok(appJsContent.includes('id="btn-launch-app-elearning"'), 'Must have Launch eLearning button ID');
    assert.ok(appJsContent.includes('id="btn-award-app-cert"'), 'Must have Award Certificate button ID');
    assert.ok(appJsContent.includes('id="btn-generate-app-doc"'), 'Must have Generate Living Documentation button ID');
  });
});

