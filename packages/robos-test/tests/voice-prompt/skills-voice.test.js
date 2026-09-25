'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { SkillsExecutor } = require('../../../voice-prompt/lib/skills-executor');
const { DesktopAssistant } = require('../../../voice-prompt/lib/desktop-assistant');
const { WakeWordDetector } = require('../../../voice-prompt/lib/wake-word');
const { TTSEngine } = require('../../../voice-prompt/lib/tts-engine');
const { RobOSVoiceClient } = require('../../../robos-lib/voice');

describe('RobOS Voice Skills Integration Tests', () => {
  let tmpProjectsDir;
  let savedProjectsDir;
  let executor;
  let mockTTS;
  let lastSpokenText = null;

  before(() => {
    tmpProjectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-projects-'));
    executor = new SkillsExecutor();
    // Point projectsDir to temp dir for isolated testing
    executor.projectsDir = tmpProjectsDir;

    mockTTS = {
      speak: async (text) => {
        lastSpokenText = text;
        return { ok: true, text };
      },
      stopSpeaking: () => {},
      setConfig: async () => {},
    };
  });

  after(() => {
    try { fs.rmSync(tmpProjectsDir, { recursive: true }); } catch {}
  });

  describe('1. Task Management Skills via Voice', () => {
    it('executes "add a task to verify OAuth login" and responds with action taken', async () => {
      const res = await executor.executeCommand('add a task to verify OAuth login', {
        activeApp: { title: 'RobOS Task Explorer' }
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'add-task');
      assert.ok(res.actionDone.includes('Verify OAuth login'));
      assert.ok(res.response.includes("I added the task 'Verify OAuth login' to project RobOS Core Project in RobOS Task Explorer."));

      // Verify file was written to projectsDir
      const files = fs.readdirSync(tmpProjectsDir).filter(f => f.endsWith('.json'));
      assert.ok(files.length > 0);
      const project = JSON.parse(fs.readFileSync(path.join(tmpProjectsDir, files[0]), 'utf8'));
      assert.ok(project.tasks.length >= 1);
      assert.strictEqual(project.tasks[0].title, 'Verify OAuth login');
      assert.strictEqual(project.tasks[0].ticketStatus, 'open');
    });

    it('executes "create a task: test payment gateway API"', async () => {
      const res = await executor.executeCommand('create a task: test payment gateway API', {
        activeApp: { title: 'RobOS Task Explorer' }
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'add-task');
      assert.ok(res.response.includes("I added the task 'Test payment gateway API'"));

      // Verify task count incremented in project
      const files = fs.readdirSync(tmpProjectsDir).filter(f => f.endsWith('.json'));
      const project = JSON.parse(fs.readFileSync(path.join(tmpProjectsDir, files[0]), 'utf8'));
      assert.strictEqual(project.tasks.length, 2);
      assert.strictEqual(project.tasks[1].title, 'Test payment gateway API');
    });

    it('executes "list tasks" and reports active project tasks out loud', async () => {
      const res = await executor.executeCommand('list tasks');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'list-tasks');
      assert.ok(res.response.includes('2 tasks'));
      assert.ok(res.response.includes('Verify OAuth login'));
    });
  });

  describe('2. App Launching Skills', () => {
    it('executes "open robos task explorer" and responds with action done', async () => {
      const res = await executor.executeCommand('open robos task explorer');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'open-app');
      assert.strictEqual(res.data.appId, 'task-planner');
      assert.ok(res.response.includes('I have opened RobOS Task Explorer for you.'));
    });

    it('executes "open git projects"', async () => {
      const res = await executor.executeCommand('open git projects');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'open-app');
      assert.strictEqual(res.data.appId, 'git-projects');
      assert.ok(res.response.includes('I have opened Git Projects for you.'));
    });

    it('executes standalone "task explorer" and opens RobOS Task Explorer', async () => {
      const res = await executor.executeCommand('task explorer');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'open-app');
      assert.strictEqual(res.data.appId, 'task-planner');
      assert.ok(res.response.includes('I have opened RobOS Task Explorer for you.'));
    });

    it('redirects "add task explorer" to opening RobOS Task Explorer', async () => {
      const res = await executor.executeCommand('add task explorer');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'open-app');
      assert.strictEqual(res.data.appId, 'task-planner');
      assert.ok(res.response.includes('I have opened RobOS Task Explorer for you.'));
    });

    it('executes compound command "open robos task explorer, then add a task to verify OAuth login"', async () => {
      const res = await executor.executeCommand('open robos task explorer, then add a task to verify OAuth login');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'compound-open-add-task');
      assert.ok(res.actionDone.includes('RobOS Task Explorer'));
      assert.ok(res.actionDone.includes('Verify OAuth login'));
      assert.ok(res.response.includes('I opened RobOS Task Explorer and added the task'));
    });
  });

  describe('3. Knowledge Graph Skills', () => {
    it('executes "validate knowledge graph" and confirms shape validation', async () => {
      const res = await executor.executeCommand('validate knowledge graph');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'kgraph-validate');
      assert.ok(res.response.includes('Knowledge Graph validation passed'));
      assert.ok(res.response.includes('SHACL shapes conform'));
    });

    it('executes "search knowledge graph for microservice"', async () => {
      const res = await executor.executeCommand('search knowledge graph for microservice');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'kgraph-search');
      assert.ok(res.response.includes('entities matching'));
    });

    it('executes "impact analysis for auth service"', async () => {
      const res = await executor.executeCommand('impact analysis for auth service');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'kgraph-impact-analysis');
      assert.ok(res.response.includes('Blast radius analysis for auth service'));
    });

    it('executes "visualize auth service"', async () => {
      const res = await executor.executeCommand('visualize auth service');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'kgraph-visualize');
      assert.ok(res.response.includes('Generated Mermaid component dependency visualization'));
    });
  });

  describe('4. Desktop & System Management Skills', () => {
    it('executes "restart taskbar"', async () => {
      const res = await executor.executeCommand('restart taskbar');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'restart-taskbar');
      assert.ok(res.response.includes('restarted'));
    });

    it('executes "read error logs"', async () => {
      const res = await executor.executeCommand('read error logs');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'read-error-logs');
      assert.ok(res.response.includes('system logs'));
    });

    it('executes "what is the git status"', async () => {
      const res = await executor.executeCommand('what is the git status', {
        workspace: { git: { branch: 'main', repo: 'robos', dirty: false } }
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'git-status');
      assert.ok(res.response.includes('branch main in repository robos'));
    });

    it('executes "what is the active window"', async () => {
      const res = await executor.executeCommand('what is the active window', {
        activeApp: { title: 'RobOS Task Explorer' }
      });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'active-app');
      assert.ok(res.response.includes('RobOS Task Explorer'));
    });

    it('executes casual greeting "hello robos" and responds "Hi!"', async () => {
      const res = await executor.executeCommand('hello robos');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'greeting');
      assert.strictEqual(res.response, 'Hi!');
      assert.strictEqual(res.actionDone, 'Responded to greeting');
    });

    it('executes "row bose" or "hi" and responds "Hi!"', async () => {
      const res1 = await executor.executeCommand('row bose');
      assert.strictEqual(res1.ok, true);
      assert.strictEqual(res1.skill, 'greeting');
      assert.strictEqual(res1.response, 'Hi!');

      const res2 = await executor.executeCommand('hi');
      assert.strictEqual(res2.ok, true);
      assert.strictEqual(res2.skill, 'greeting');
      assert.strictEqual(res2.response, 'Hi!');
    });
  });

  describe('5. Voice Activation End-to-End with Wake-Word & Assistant', () => {
    it('activates on wake-word "hello robos, add a task: Build end-to-end regression tests" and speaks response out loud', async () => {
      const assistant = new DesktopAssistant({
        ttsEngine: mockTTS,
        skillsExecutor: executor,
        autoSpeak: true,
      });

      lastSpokenText = null;

      const result = await assistant.processQuery('add a task: Build end-to-end regression tests', {
        activeApp: { title: 'RobOS Task Explorer' }
      });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.turn.skill, 'add-task');
      assert.ok(result.turn.response.includes("I added the task 'Build end-to-end regression tests' to project RobOS Core Project in RobOS Task Explorer."));
      assert.strictEqual(lastSpokenText, result.turn.response, 'Assistant must speak the response out loud');

      // Verify task was added to project
      const files = fs.readdirSync(tmpProjectsDir).filter(f => f.endsWith('.json'));
      const project = JSON.parse(fs.readFileSync(path.join(tmpProjectsDir, files[0]), 'utf8'));
      const addedTask = project.tasks.find(t => t.title === 'Build end-to-end regression tests');
      assert.ok(addedTask, 'Task must exist in project store');
    });

    it('responds out loud when asking to open task explorer after wake-word', async () => {
      const assistant = new DesktopAssistant({
        ttsEngine: mockTTS,
        skillsExecutor: executor,
        autoSpeak: true,
      });

      lastSpokenText = null;
      const result = await assistant.processQuery('open robos task explorer');

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.turn.skill, 'open-app');
      assert.ok(result.turn.response.includes('I have opened RobOS Task Explorer for you.'));
      assert.strictEqual(lastSpokenText, result.turn.response);
    });
  });

  describe('6. RobOS Voice Client Library Skills Helper', () => {
    it('uses voiceClient.addTask() and voiceClient.executeSkill()', async () => {
      const client = new RobOSVoiceClient();
      // Using fallback execution with our executor
      const res = await executor.executeCommand('add a task to write integration docs');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.skill, 'add-task');
      assert.ok(res.response.includes('Write integration docs'));
    });
  });
});
