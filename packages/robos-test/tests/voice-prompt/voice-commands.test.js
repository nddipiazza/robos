'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { VoiceCommandsRegistry, defaultRegistry } = require('../../../voice-prompt/lib/voice-commands-registry');
const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { SkillsExecutor } = require('../../../voice-prompt/lib/skills-executor');

test('RobOS Voice Activated Commands & Configuration', async (t) => {
  const registry = new VoiceCommandsRegistry();

  await t.test('1. Registry Initialization & Coverage', async (t) => {
    await t.test('initializes with all 48 RobOS skills and 30+ applications', () => {
      const allCommands = registry.getAllCommands();
      const appCommands = registry.getAppCommands();
      const skillCommands = registry.getSkillCommands();

      assert.ok(allCommands.length >= 78, `Expected at least 78 commands, got ${allCommands.length}`);
      assert.ok(appCommands.length >= 30, `Expected at least 30 app commands, got ${appCommands.length}`);
      assert.ok(skillCommands.length >= 48, `Expected at least 48 skill commands, got ${skillCommands.length}`);
    });

    await t.test('every command has valid title, category, matchers, targetType, and targetId', () => {
      for (const cmd of registry.getAllCommands()) {
        assert.ok(cmd.id, 'Command must have id');
        assert.ok(cmd['@id'], 'Command must have @id');
        assert.ok(cmd.title, `Command ${cmd.id} must have title`);
        assert.ok(cmd.category, `Command ${cmd.id} must have category`);
        assert.ok(Array.isArray(cmd.matchers) && cmd.matchers.length > 0, `Command ${cmd.id} must have matchers array`);
        assert.ok(['app', 'skill'].includes(cmd.targetType), `Command ${cmd.id} targetType must be app or skill`);
        assert.ok(cmd.targetId, `Command ${cmd.id} must have targetId`);
      }
    });

    await t.test('verifies coverage for all 48 skills in plugins/robos/skills', () => {
      const skillsDir = path.resolve(__dirname, '..', '..', '..', 'plugins', 'robos', 'skills');
      if (fs.existsSync(skillsDir)) {
        const skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        for (const skillName of skillEntries) {
          const found = registry.getCommand(`cmd-skill-${skillName}`) ||
                        registry.getCommand(`urn:robos:voice-command:${skillName}`) ||
                        registry.getAllCommands().find(c => c.targetId === skillName);
          assert.ok(found, `Skill ${skillName} from plugins/robos/skills must have a voice command in the registry`);
        }
      }
    });

    await t.test('verifies coverage for built-in RobOS applications', () => {
      const expectedApps = [
        'agent-chat', 'voice-prompt', 'task-planner', 'git-projects', 'dev-central',
        'kube-studio', 'rest-client', 'db-manager', 'nosql-manager', 'schema-studio',
        'crpg-editor', 'pr-review', 'robos-elearning', 'robos-documentation',
        'issue-manager', 'pass-manager', 'skills-manager'
      ];

      for (const appId of expectedApps) {
        const found = registry.getCommand(`cmd-app-${appId}`) ||
                      registry.getAllCommands().find(c => c.targetId === appId);
        assert.ok(found, `App ${appId} must have a voice command in the registry`);
      }
    });
  });

  await t.test('2. W3C SHACL Shape Conformity', async () => {
    const validator = new SHACLValidator();
    const nodes = registry.toKnowledgeGraphNodes();

    assert.ok(nodes.length > 0, 'Must produce JSON-LD nodes');
    const result = validator.validate({ nodes });

    assert.strictEqual(result.conforms, true, `Expected all voice commands to conform to SHACL shapes. Violations: ${JSON.stringify(result.violations)}`);
    assert.strictEqual(result.violations.length, 0);
  });

  await t.test('3. Voice Command Matching Engine', async (t) => {
    await t.test('matches exact skill commands', () => {
      const match1 = registry.matchCommand('validate knowledge graph');
      assert.strictEqual(match1.matched, true);
      assert.strictEqual(match1.command.targetId, 'kgraph-validate');

      const match2 = registry.matchCommand('restart taskbar');
      assert.strictEqual(match2.matched, true);
      assert.strictEqual(match2.command.targetId, 'restart-taskbar');

      const match3 = registry.matchCommand('read error logs');
      assert.strictEqual(match3.matched, true);
      assert.strictEqual(match3.command.targetId, 'read-error-logs');
    });

    await t.test('matches exact app opening commands', () => {
      const match1 = registry.matchCommand('open task explorer');
      assert.strictEqual(match1.matched, true);
      assert.strictEqual(match1.command.targetType, 'app');

      const match2 = registry.matchCommand('open git projects');
      assert.strictEqual(match2.matched, true);
      assert.strictEqual(match2.command.targetId, 'git-projects');

      const match3 = registry.matchCommand('open dev central');
      assert.strictEqual(match3.matched, true);
      assert.strictEqual(match3.command.targetId, 'dev-central');
    });

    await t.test('strips conversational prefixes ("hey robos", "please", "can you")', () => {
      const match1 = registry.matchCommand('hey robos, please open task explorer');
      assert.strictEqual(match1.matched, true);
      assert.strictEqual(match1.command.targetType, 'app');

      const match2 = registry.matchCommand('could you validate knowledge graph?');
      assert.strictEqual(match2.matched, true);
      assert.strictEqual(match2.command.targetId, 'kgraph-validate');

      const match3 = registry.matchCommand('row bose, git status');
      assert.strictEqual(match3.matched, true);
      assert.strictEqual(match3.command.targetId, 'git-changed-files');
    });

    await t.test('extracts arguments for wildcard skills', () => {
      const match = registry.matchCommand('search knowledge graph for payment microservice');
      assert.strictEqual(match.matched, true);
      assert.strictEqual(match.command.targetId, 'kgraph-search');
      assert.strictEqual(match.args, 'payment microservice');
    });

    await t.test('returns matched: false for unmatched chatter', () => {
      const match = registry.matchCommand('the weather is really nice today outside');
      assert.strictEqual(match.matched, false);
    });
  });

  await t.test('4. Command Search and Categorization', async () => {
    const appsOnly = registry.searchCommands('', 'apps');
    assert.ok(appsOnly.every(c => c.targetType === 'app'));

    const skillsOnly = registry.searchCommands('', 'skills');
    assert.ok(skillsOnly.every(c => c.targetType === 'skill'));

    const searchKgraph = registry.searchCommands('kgraph', 'all');
    assert.ok(searchKgraph.length > 0);
    assert.ok(searchKgraph.some(c => c.title.toLowerCase().includes('knowledge graph') || c.matchers.some(m => m.includes('kgraph'))));
  });

  await t.test('5. Execution of App and Skill Commands', async (t) => {
    const executor = new SkillsExecutor();

    await t.test('executes open-app command', async () => {
      const result = await executor.executeOpenApp('task-planner');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skill, 'open-app');
      assert.ok(result.actionDone.includes('RobOS Task Explorer') || result.actionDone.includes('task-planner'));
    });

    await t.test('executes kgraph-validate command', async () => {
      const result = await executor.executeKGraphValidate();
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skill, 'kgraph-validate');
      assert.ok(result.response.includes('W3C SHACL'));
    });
  });

  await t.test('6. REST API Endpoints for Voice Commands', async () => {
    // Start temporary test server with voice commands routes
    const testPort = 19195;
    const server = http.createServer(async (req, res) => {
      const urlObj = new URL(req.url, `http://localhost:${testPort}`);
      res.setHeader('Content-Type', 'application/json');

      if (urlObj.pathname === '/api/voice-commands' && req.method === 'GET') {
        const q = urlObj.searchParams.get('q') || '';
        const cat = urlObj.searchParams.get('category') || 'all';
        const commands = defaultRegistry.searchCommands(q, cat);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, count: commands.length, commands }));
      }

      if (urlObj.pathname === '/api/voice-commands/match' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const match = defaultRegistry.matchCommand(parsed.text || '');
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, ...match }));
        });
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise(r => server.listen(testPort, r));

    try {
      // 1. GET /api/voice-commands
      const getRes = await fetch(`http://localhost:${testPort}/api/voice-commands?category=skills`);
      const getData = await getRes.json();
      assert.strictEqual(getData.ok, true);
      assert.ok(getData.count >= 48);

      // 2. POST /api/voice-commands/match
      const postRes = await fetch(`http://localhost:${testPort}/api/voice-commands/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'open task explorer' }),
      });
      const postData = await postRes.json();
      assert.strictEqual(postData.ok, true);
      assert.strictEqual(postData.matched, true);
      assert.strictEqual(postData.command.targetType, 'app');
    } finally {
      await new Promise(r => server.close(r));
    }
  });
});
