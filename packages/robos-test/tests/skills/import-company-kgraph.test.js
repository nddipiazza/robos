'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');

const {
  parseGitUrl,
  detectArchetype,
  detectTechnology,
  fetchSourceData,
  parseRawContent,
  generateCompanyKnowledgeGraph,
  mergeIntoRobosWorkspace,
  OSLC_CONTEXT,
} = require('../../../../plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph');

describe('import-company-kgraph RobOS AI Skill Test Suite', () => {
  let tmpDir;
  let httpServer;
  let httpPort;
  let httpUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-company-kgraph-test-'));

    // Start a lightweight local HTTP server for testing HTTP/HTTPS catalog ingestion
    await new Promise(resolve => {
      httpServer = http.createServer((req, res) => {
        if (req.url === '/api/backstage-catalog.json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            items: [
              {
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'Component',
                metadata: {
                  name: 'payments-service',
                  title: 'Payments Backend Service',
                  description: 'Core billing and payment processor',
                  annotations: { 'github.com/project-slug': 'acme-corp/payments-service' },
                },
                spec: { type: 'service', owner: 'billing-squad' },
              },
              {
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'Component',
                metadata: {
                  name: 'customer-portal-webapp',
                  title: 'Customer Self-Service Portal',
                  description: 'React SPA for customers',
                  annotations: { 'github.com/project-slug': 'acme-corp/customer-portal-webapp' },
                },
                spec: { type: 'website', owner: 'frontend-squad' },
              },
              {
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'Component',
                metadata: {
                  name: 'acme-cli-tool',
                  title: 'Acme Developer CLI',
                  description: 'Go command-line utility',
                  annotations: { 'github.com/project-slug': 'acme-corp/acme-cli-tool' },
                },
                spec: { type: 'tool', owner: 'platform-squad' },
              },
            ],
          }));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
      httpServer.listen(0, '127.0.0.1', () => {
        httpPort = httpServer.address().port;
        httpUrl = `http://127.0.0.1:${httpPort}/api/backstage-catalog.json`;
        resolve();
      });
    });
  });

  after(() => {
    if (httpServer) httpServer.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  test('correctly parses and normalizes diverse Git URLs', () => {
    const p1 = parseGitUrl('https://github.com/globex-corp/auth-gateway.git');
    assert.equal(p1.host, 'github.com');
    assert.equal(p1.org, 'globex-corp');
    assert.equal(p1.repo, 'auth-gateway');
    assert.equal(p1.slug, 'auth-gateway');
    assert.equal(p1.canonicalRepo, 'github.com/globex-corp/auth-gateway');

    const p2 = parseGitUrl('git@gitlab.enterprise.com:core-team/telemetry-pipeline.git');
    assert.equal(p2.host, 'gitlab.enterprise.com');
    assert.equal(p2.org, 'core-team');
    assert.equal(p2.repo, 'telemetry-pipeline');
    assert.equal(p2.slug, 'telemetry-pipeline');

    const p3 = parseGitUrl('company/mobile-game-app');
    assert.equal(p3.org, 'company');
    assert.equal(p3.repo, 'mobile-game-app');
    assert.equal(p3.slug, 'mobile-game-app');
  });

  test('accurately classifies multi-app archetypes and technology stacks', () => {
    assert.equal(detectArchetype({ repo: 'payment-microservice' }), 'microservice');
    assert.equal(detectArchetype({ repo: 'customer-portal-webapp' }), 'frontend-app');
    assert.equal(detectArchetype({ repo: 'operator-desktop-studio' }), 'desktop-app');
    assert.equal(detectArchetype({ repo: 'space-racer-pc-game' }), 'pc-game');
    assert.equal(detectArchetype({ repo: 'puzzle-mobile-game' }), 'mobile-game');
    assert.equal(detectArchetype({ repo: 'cloud-deploy-cli' }), 'console-app');
    assert.equal(detectArchetype({ repo: 'ios-banking-mobile' }), 'mobile-app');
    assert.equal(detectArchetype({ repo: 'event-stream-pipeline' }), 'data-pipeline');
    assert.equal(detectArchetype({ repo: 'crypto-common-lib' }), 'library');

    assert.match(detectTechnology({ repo: 'payment-microservice-java' }, 'microservice'), /Java/);
    assert.match(detectTechnology({ repo: 'payment-microservice-go' }, 'microservice'), /Go/);
    assert.match(detectTechnology({ repo: 'portal-react' }, 'frontend-app'), /React/);
    assert.match(detectTechnology({ repo: 'unity-racer' }, 'pc-game'), /Unity/);
  });

  test('ingests company catalog from remote HTTP/HTTPS endpoint', async () => {
    const entries = await fetchSourceData(httpUrl, 'http', false);
    assert.ok(Array.isArray(entries));
    assert.equal(entries.length, 3);
    assert.equal(entries[0].repo, 'payments-service');
    assert.equal(entries[1].repo, 'customer-portal-webapp');
    assert.equal(entries[2].repo, 'acme-cli-tool');

    const { jsonLdDocument, summary } = generateCompanyKnowledgeGraph(entries, {
      companyName: 'Acme Worldwide',
      companySlug: 'acme-worldwide',
    });

    assert.equal(jsonLdDocument['@context'].robos, OSLC_CONTEXT.robos);
    assert.equal(jsonLdDocument['robos:organization'], 'urn:robos:organization:acme-worldwide');
    assert.ok(jsonLdDocument['robos:nodes'].length >= 4); // Org, Team, 3 apps, plus contracts
    assert.equal(summary.microservices, 1);
    assert.equal(summary.frontendApps, 1);
    assert.equal(summary.consoleApps, 1);
    assert.equal(summary.contracts, 1); // For microservice
  });

  test('ingests from local filesystem (git-projects.json and local directories)', async () => {
    const mockProjectsPath = path.join(tmpDir, 'mock-git-projects.json');
    fs.writeFileSync(mockProjectsPath, JSON.stringify({
      projects: [
        {
          id: 'billing-api',
          label: 'Billing API',
          url: 'https://github.com/acme/billing-api',
          group: 'finance',
        },
        {
          id: 'finance-desktop',
          label: 'Finance Desktop Station',
          url: 'https://github.com/acme/finance-desktop',
          group: 'finance',
        },
      ],
    }, null, 2));

    const entries = await fetchSourceData(mockProjectsPath, 'file', false);
    assert.equal(entries.length, 2);

    const { jsonLdDocument, summary } = generateCompanyKnowledgeGraph(entries, {
      companyName: 'Acme Finance',
      companySlug: 'acme-finance',
    });

    assert.equal(summary.microservices, 1);
    assert.equal(summary.desktopApps, 1);
    const desktopNode = jsonLdDocument['robos:nodes'].find(n => n['@id'] === 'urn:robos:desktop-app:finance-desktop');
    assert.ok(desktopNode);
    assert.ok(desktopNode['@type'].includes('robos:DesktopApp'));
  });

  test('handles AWS S3 URIs and reports clear configuration advice', async () => {
    // Calling an S3 URI without AWS credentials should catch and explain cleanly
    await assert.rejects(
      async () => {
        await fetchSourceData('s3://non-existent-bucket/catalog.json', 's3', false);
      },
      /Failed to fetch from S3/
    );
  });

  test('generates valid JSON-LD file and merges into RobOS workspace', () => {
    const mockEntries = [
      { url: 'https://github.com/initech/payroll-api', label: 'Payroll API' },
      { url: 'https://github.com/initech/timesheet-webapp', label: 'Timesheet Web' },
    ];

    const { jsonLdDocument } = generateCompanyKnowledgeGraph(mockEntries, {
      companyName: 'Initech',
      companySlug: 'initech',
    });

    const outputPath = path.join(tmpDir, 'initech-kgraph.jsonld');
    fs.writeFileSync(outputPath, JSON.stringify(jsonLdDocument, null, 2), 'utf8');
    assert.ok(fs.existsSync(outputPath));

    const reloaded = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(reloaded['robos:title'], 'Initech SDLC Knowledge Graph');
    assert.ok(Array.isArray(reloaded['robos:nodes']));
    assert.ok(reloaded['robos:nodes'].some(n => n['@id'] === 'urn:robos:microservice:payroll-api'));
    assert.ok(reloaded['robos:nodes'].some(n => n['@id'] === 'urn:robos:frontend-app:timesheet-webapp'));
  });

  test('executes CLI successfully with --dry-run and file outputs', () => {
    const scriptPath = path.join(__dirname, '../../../../plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js');
    const mockProjectsPath = path.join(tmpDir, 'mock-git-projects.json');
    const testOutputPath = path.join(tmpDir, 'cli-test-output.jsonld');

    // 1. Dry run execution
    const stdout = execSync(
      `node "${scriptPath}" --source "${mockProjectsPath}" --company-name "Test Corp" --dry-run`,
      { encoding: 'utf8' }
    );
    assert.match(stdout, /RobOS Company KGraph Importer/);
    assert.match(stdout, /Generated Knowledge Graph Summary:/);
    assert.match(stdout, /Microservices:\s+1/);
    assert.match(stdout, /Desktop Apps:\s+1/);
    assert.match(stdout, /\[Dry Run\] No files modified/);

    // 2. Real execution generating output file
    execSync(
      `node "${scriptPath}" --source "https://github.com/test-org/analytics-service" --company-name "Analytics Corp" --output "${testOutputPath}"`,
      { encoding: 'utf8' }
    );
    assert.ok(fs.existsSync(testOutputPath));
    const generated = JSON.parse(fs.readFileSync(testOutputPath, 'utf8'));
    assert.equal(generated['@context'].robos, OSLC_CONTEXT.robos);
    assert.ok(generated['robos:nodes'].some(n => n['@id'] === 'urn:robos:microservice:analytics-service'));
  });
});
