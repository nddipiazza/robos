'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');
const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { OSLCGraphParser } = require('../../../robos-graph/lib/oslc-parser');
const { SETTINGS_SCHEMA } = require('../../../robos-preferences/main');

describe('Agent Tiers, Caveman Compression & Stanford DSPy Optimization Test Suite', () => {
  let tmpDir;
  let tmpGraphFile;
  let store;
  let validator;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-agent-tiers-'));
    tmpGraphFile = path.join(tmpDir, 'knowledge-graph.jsonld');
    store = new SDLCKnowledgeGraphStore(tmpGraphFile);
    validator = new SHACLValidator();
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. PromptStrategy & PromptOptimizer CRUD & SHACL Validation', () => {
    it('creates, SHACL validates, and retrieves a PromptStrategy node (Caveman)', () => {
      const res = store.createPromptStrategy({
        title: 'Caveman Algorithmic Compression Strategy',
        strategyType: 'compression',
        engine: 'caveman',
        mode: 'aggressive',
        targetTiers: ['tier1', 'tier2'],
        parameters: {
          stripFillers: true,
          preserveCodeBlocks: true,
        },
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.ok(res.node['@id'].includes('caveman-algorithmic-compression-strategy'));
      assert.strictEqual(res.node['robos:engine'], 'caveman');
      assert.strictEqual(res.node['robos:mode'], 'aggressive');
      assert.deepStrictEqual(res.node['robos:targetTiers'], ['tier1', 'tier2']);
      assert.strictEqual(res.node['robos:package'], 'core-platform');

      const found = store.getPromptStrategy('caveman-algorithmic-compression-strategy');
      assert.ok(found, 'Strategy must be retrievable by slug');
      assert.strictEqual(found['robos:engine'], 'caveman');

      const all = store.getPromptStrategies();
      assert.ok(all.some(s => s['@id'] === res.node['@id']));
    });

    it('creates, SHACL validates, and retrieves a PromptOptimizer node (DSPy)', () => {
      const res = store.createPromptOptimizer({
        title: 'DSPy MIPROv2 Teleprompter Optimizer',
        strategyType: 'teleprompter-optimization',
        engine: 'dspy',
        teleprompter: 'MIPROv2',
        metric: 'shacl_validation',
        targetTiers: ['tier2', 'tier3'],
        parameters: {
          candidatePrompts: 10,
          maxBootstrappedDemos: 3,
        },
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.ok(res.node['@id'].includes('dspy-miprov2-teleprompter-optimizer'));
      assert.strictEqual(res.node['robos:engine'], 'dspy');
      assert.strictEqual(res.node['robos:teleprompter'], 'MIPROv2');
      assert.strictEqual(res.node['robos:metric'], 'shacl_validation');

      const optimizers = store.getPromptOptimizers();
      assert.ok(optimizers.some(o => o['@id'] === res.node['@id']));
    });

    it('rejects PromptStrategy missing mandatory engine or strategyType under SHACL', () => {
      const invalidNode = {
        '@id': 'urn:robos:agent:strategy:broken',
        '@type': ['robos:PromptStrategy'],
        'dcterms:title': 'Broken Strategy',
        // missing robos:strategyType and robos:engine
      };

      const shaclRes = validator.validateGraph(new OSLCGraphParser({
        '@context': {},
        '@id': 'urn:robos:test:graph',
        '@type': ['robos:SystemGraph'],
        'robos:nodes': [invalidNode],
      }));

      assert.strictEqual(shaclRes.conforms, false);
      const missingPaths = shaclRes.violations.map(v => v.path);
      assert.ok(missingPaths.includes('robos:strategyType'));
      assert.ok(missingPaths.includes('robos:engine'));
    });
  });

  describe('2. Caveman Mode Algorithmic Compression Logic', () => {
    it('prunes conversational fillers while strictly preserving code blocks and paths', () => {
      const prompt = 'Hello! Could you please make sure to inspect `packages/auth/index.js`? In order to fix bugs, remember to verify that bcrypt is used. Thank you in advance!';
      const res = store.applyCavemanCompression(prompt, { mode: 'standard' });

      assert.ok(res.compressedTokensEst < res.originalTokensEst);
      assert.ok(res.savingsPercent > 20, `Savings percent should be >20%, got ${res.savingsPercent}%`);
      assert.ok(!res.compressedText.includes('Could you please'));
      assert.ok(!res.compressedText.includes('Thank you in advance'));
      assert.ok(!res.compressedText.includes('In order to'));
      // Verifies paths and symbols preserved
      assert.ok(res.compressedText.includes('`packages/auth/index.js`'));
      assert.ok(res.compressedText.includes('bcrypt'));
    });

    it('applies aggressive and extreme mode compression with high token savings', () => {
      const codeSnippet = '```javascript\nconst a = 1;\n```';
      const prompt = `Furthermore, could you please ensure that you test ${codeSnippet}? Moreover, it should be noted that we need to write unit tests for the controller.`;
      
      const aggressiveRes = store.applyCavemanCompression(prompt, { mode: 'aggressive' });
      assert.ok(!aggressiveRes.compressedText.includes('Furthermore'));
      assert.ok(!aggressiveRes.compressedText.includes('Moreover'));
      assert.ok(aggressiveRes.compressedText.includes(codeSnippet), 'Code block must remain intact');

      const extremeRes = store.applyCavemanCompression(prompt, { mode: 'extreme' });
      assert.ok(extremeRes.savingsPercent >= aggressiveRes.savingsPercent);
      assert.ok(extremeRes.compressedText.includes(codeSnippet));
    });
  });

  describe('3. Stanford DSPy Teleprompter Compilation Simulator', () => {
    it('compiles declarative signature and exemplars into an optimized prompt template', () => {
      const signature = {
        inputs: ['taskDescription', 'schemaSpec'],
        outputs: ['implementationCode', 'shaclValid'],
      };

      const dataset = [
        {
          taskDescription: 'Generate orders database migration',
          schemaSpec: 'PostgreSQL v16',
          implementationCode: 'CREATE TABLE orders (id UUID PRIMARY KEY);',
          shaclValid: true,
          score: 1.0,
        },
        {
          taskDescription: 'Add health check endpoint',
          schemaSpec: 'OpenAPI 3.1',
          implementationCode: 'app.get("/health", (req, res) => res.json({ status: "ok" }));',
          shaclValid: true,
          score: 0.95,
        },
      ];

      const compiled = store.compileWithDSPy(signature, dataset, {
        teleprompter: 'MIPROv2',
        metric: 'shacl_validation',
        maxBootstrappedDemos: 2,
      });

      assert.strictEqual(compiled.teleprompter, 'MIPROv2');
      assert.strictEqual(compiled.metric, 'shacl_validation');
      assert.strictEqual(compiled.calibratedExemplarCount, 2);
      assert.ok(compiled.compiledPrompt.includes('MIPROv2'));
      assert.ok(compiled.compiledPrompt.includes('shacl_validation'));
      assert.ok(compiled.compiledPrompt.includes('Few-Shot Exemplars (2 Calibrated Demonstrations)'));
      assert.ok(compiled.compiledPrompt.includes('CREATE TABLE orders'));
      assert.ok(compiled.compiledPrompt.includes('{{taskDescription}}'));
    });
  });

  describe('4. RobOS Preferences Console Schema Integration', () => {
    it('verifies agent_tiers section exists with complete configuration fields', () => {
      const section = SETTINGS_SCHEMA.sections.find(s => s.id === 'agent_tiers');
      assert.ok(section, 'agent_tiers section must exist in SETTINGS_SCHEMA');
      assert.strictEqual(section.label, 'Agent Tiers & Prompt Optimization');

      const fieldKeys = section.fields.map(f => f.key);
      assert.ok(fieldKeys.includes('tier1_model'));
      assert.ok(fieldKeys.includes('tier2_model'));
      assert.ok(fieldKeys.includes('tier3_model'));
      assert.ok(fieldKeys.includes('enable_caveman'));
      assert.ok(fieldKeys.includes('caveman_mode'));
      assert.ok(fieldKeys.includes('caveman_target_tiers'));
      assert.ok(fieldKeys.includes('enable_dspy'));
      assert.ok(fieldKeys.includes('dspy_optimizer'));
      assert.ok(fieldKeys.includes('dspy_metric'));
      assert.ok(fieldKeys.includes('dspy_compile_on_save'));

      // Check field options
      const modeField = section.fields.find(f => f.key === 'caveman_mode');
      assert.deepStrictEqual(modeField.options, ['standard', 'aggressive', 'extreme']);

      const dspyOptField = section.fields.find(f => f.key === 'dspy_optimizer');
      assert.ok(dspyOptField.options.includes('MIPROv2'));
      assert.ok(dspyOptField.options.includes('BootstrapFewShot'));
    });
  });

  describe('5. Core Platform Knowledge Graph Package Verification', () => {
    it('verifies package.jsonld contains Caveman and DSPy seeded nodes conforming to SHACL', () => {
      const pkgPath = path.resolve(__dirname, '../../../../.robos/kgraphs/core-platform/package.jsonld');
      assert.ok(fs.existsSync(pkgPath), 'core-platform package.jsonld must exist');

      const raw = fs.readFileSync(pkgPath, 'utf8');
      const doc = JSON.parse(raw);
      const nodes = doc['robos:nodes'] || [];

      const cavemanNode = nodes.find(n => n['@id'] === 'urn:robos:agent:strategy:caveman-compression');
      assert.ok(cavemanNode, 'Caveman compression node must exist in core-platform package');
      assert.strictEqual(cavemanNode['robos:engine'], 'caveman');
      assert.strictEqual(cavemanNode['robos:strategyType'], 'compression');

      const dspyNode = nodes.find(n => n['@id'] === 'urn:robos:agent:optimizer:dspy-teleprompter');
      assert.ok(dspyNode, 'DSPy teleprompter node must exist in core-platform package');
      assert.strictEqual(dspyNode['robos:engine'], 'dspy');
      assert.strictEqual(dspyNode['robos:strategyType'], 'teleprompter-optimization');

      const shaclRes = validator.validateGraph(new OSLCGraphParser({
        '@context': doc['@context'],
        '@id': doc['@id'],
        '@type': doc['@type'],
        'robos:nodes': [cavemanNode, dspyNode],
      }));

      assert.strictEqual(shaclRes.conforms, true, `Seeded nodes must conform to SHACL: ${shaclRes.violations.map(v => v.resultMessage).join(', ')}`);
    });
  });
});
