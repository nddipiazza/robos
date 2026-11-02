'use strict';
// An import must not reference nodes it does not create: a dangling default project or lead
// passes the importer's own SHACL summary but makes the next strict `kgraph apply` refuse the graph.
// Nothing here touches a store, so this suite reads and writes no graph files.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { KGraphResourceImporter } = require('../../../robos-graph/lib/resource-importer');
const { BulkRepoImporter } = require('../../../robos-graph/lib/bulk-repo-importer');
const { validateDocument } = require('../../../robos-graph/lib/graph-workspace');

const repoRoot = path.resolve(__dirname, '../../../..');
const skillCopies = ['.agents/skills', '.github/skills', 'plugins/robos/skills']
  .map(dir => path.join(dir, 'import-company-kgraph/scripts/import-company-kgraph.js'));

const everyRepoArchetype = ['service', 'cli', 'mobile', 'sdk', 'pipeline', 'web', 'desktop', 'game', 'mobile-game']
  .map(kind => `https://github.com/foo/bar-${kind}`);

const everyResourceType = [
  { type: 'github-org', org: 'acme-org', url: 'https://github.com/acme-org' },
  { type: 'github-org', org: 'unknown-org', url: 'https://github.com/unknown-org' },
  { type: 'github-repo', url: 'https://github.com/foo/single-service' },
  { type: 'gitlab-repo', url: 'https://gitlab.com/acme-devops/gitops-deployments' },
  { type: 'confluence', url: 'https://confluence.acme.corp/display/ARCH', hostname: 'confluence.acme.corp' },
  { type: 'filesystem', path: path.join(repoRoot, 'does-not-exist-import-validity') },
  { type: 'database', engine: 'postgres', uri: 'postgres://app@db.acme.corp:5432/orders' },
  { type: 'message-broker', brokerType: 'kafka', endpoint: 'kafka:9092' },
  { type: 'kubernetes-cluster', name: 'prod', provider: 'eks' },
  { type: 'mcp-server', name: 'tool', command: 'tool --stdio' },
  { type: 'agent-persona', title: 'Reviewer', systemPrompt: 'Review changes.' },
  { type: 'protobuf-contract', path: 'proto/orders.proto' },
  { type: 'graphql-contract', path: 'schema/orders.graphql' },
  ...everyRepoArchetype,
];

const assertValid = doc => assert.deepEqual(validateDocument(doc).errors, []);
const withProperty = (nodes, property) => nodes.filter(node => node[property] !== undefined).map(node => node['@id']);

describe('Import results pass validateDocument', () => {
  it('KGraphResourceImporter with every resource type', async () => {
    const { jsonLdDocument, nodes } = await new KGraphResourceImporter().importResources(everyResourceType);
    assert.ok(nodes.length > everyResourceType.length, 'expected the resolvers to produce nodes');
    assertValid(jsonLdDocument);
    assert.deepEqual(withProperty(nodes, 'robos:hasProject'), []);
    assert.deepEqual(withProperty(nodes, 'robos:lead'), []);
  });

  it('KGraphResourceImporter with the team given per call, as the App Wizard and store do', async () => {
    const defaultTeam = 'urn:robos:team:platform-team';
    const { jsonLdDocument, nodes } = await new KGraphResourceImporter().importResources(everyResourceType, { defaultTeam });
    assertValid(jsonLdDocument);
    const owners = new Set(nodes.map(node => node['robos:ownerTeam']).filter(Boolean));
    assert.deepEqual([...owners], [defaultTeam]);
  });

  it('KGraphResourceImporter from a prompt', async () => {
    const prompt = 'Import for Acme: https://github.com/acme-org https://github.com/foo/bar-service';
    const { importResult } = await new KGraphResourceImporter().importFromPrompt(prompt);
    assertValid(importResult.jsonLdDocument);
  });

  for (const copy of skillCopies) {
    const { generateCompanyKnowledgeGraph } = require(path.join(repoRoot, copy));
    const generate = repos => generateCompanyKnowledgeGraph(repos, { companyName: 'Acme Global', companySlug: 'acme' });

    it(`generateCompanyKnowledgeGraph in ${copy}`, () => {
      const { jsonLdDocument, summary } = generate([
        ...['service', 'sdk', 'web', 'cli'].map(kind => `https://github.com/foo/bar-${kind}`),
        { url: 'https://github.com/foo/qux-cli', owner: 'billing-squad' },
        { url: 'https://github.com/foo/baz-cli', owner: 'urn:robos:team:platform-squad' },
      ]);
      assertValid(jsonLdDocument);
      const nodes = jsonLdDocument['robos:nodes'];
      assert.deepEqual(withProperty(nodes, 'robos:lead'), []);
      assert.equal(nodes.find(node => node['@id'] === 'urn:robos:team:billing-squad')['dcterms:title'], 'billing-squad');
      assert.equal(summary.teams, 3);
    });

    // This demo generator cannot know a mobile platform, pipeline engine, desktop framework or game
    // engine from a repository name, so those shape requirements stay unmet rather than guessed.
    it(`generateCompanyKnowledgeGraph in ${copy} leaves only unknown facts unmet for every archetype`, () => {
      const { errors } = validateDocument(generate(everyRepoArchetype).jsonLdDocument);
      assert.deepEqual(errors.filter(error => !/ must (declare|specify) /.test(error)), []);
    });
  }
});

describe('BulkRepoImporter project link', () => {
  const repo = 'https://github.com/foo/bar-service';
  const service = importer => importer.importRepositories([repo]).nodes.find(node => node['@id'] === 'urn:robos:service:bar-service');

  it('is omitted unless the caller names a project', () => {
    assert.equal(service(new BulkRepoImporter())['robos:hasProject'], undefined);
    assert.equal(service(new BulkRepoImporter({ defaultProject: 'urn:robos:project:named' }))['robos:hasProject'], 'urn:robos:project:named');
  });
});
