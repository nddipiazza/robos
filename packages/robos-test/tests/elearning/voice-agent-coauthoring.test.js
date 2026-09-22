'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const elearningMain = require('../../../robos-elearning/main');

describe('RobOS eLearning Voice Agent Co-Authoring Tests', () => {
  describe('parseVoiceSuggestion Unit Tests', () => {
    it('parses ADD_LAB_STEP from spoken suggestion', async () => {
      const res = await elearningMain.parseVoiceSuggestion('Add a step to configure PostgreSQL container replication');
      assert.ok(res);
      assert.strictEqual(res.type, 'ADD_LAB_STEP');
      assert.strictEqual(res.stepText, 'configure PostgreSQL container replication');
    });

    it('parses REMOVE_LAB_STEP from spoken suggestion', async () => {
      const res = await elearningMain.parseVoiceSuggestion('Please remove step 3');
      assert.ok(res);
      assert.strictEqual(res.type, 'REMOVE_LAB_STEP');
      assert.strictEqual(res.stepIndex, 2);
    });

    it('parses UPDATE_MODULE_TITLE from spoken suggestion', async () => {
      const res = await elearningMain.parseVoiceSuggestion('Change module title to Event-Driven Microservices in Production');
      assert.ok(res);
      assert.strictEqual(res.type, 'UPDATE_MODULE_TITLE');
      assert.strictEqual(res.title, 'Event-Driven Microservices in Production');
    });

    it('parses UPDATE_OVERVIEW from spoken suggestion', async () => {
      const res = await elearningMain.parseVoiceSuggestion('Update overview to This module explores Kafka event streaming and consumer groups');
      assert.ok(res);
      assert.strictEqual(res.type, 'UPDATE_OVERVIEW');
      assert.strictEqual(res.overview, 'This module explores Kafka event streaming and consumer groups');
    });

    it('parses ADD_QUIZ_QUESTION from spoken suggestion', async () => {
      const res = await elearningMain.parseVoiceSuggestion('Add a quiz question: What is the default port for PostgreSQL? Answer: 5432');
      assert.ok(res);
      assert.strictEqual(res.type, 'ADD_QUIZ_QUESTION');
      assert.strictEqual(res.quiz.question, 'What is the default port for PostgreSQL?');
      assert.strictEqual(res.quiz.answer, '5432');
      assert.ok(res.quiz.options.includes('5432'));
    });

    it('parses UPDATE_DIFFICULTY from spoken suggestion', async () => {
      const res = await elearningMain.parseVoiceSuggestion('Change difficulty to Advanced');
      assert.ok(res);
      assert.strictEqual(res.type, 'UPDATE_DIFFICULTY');
      assert.strictEqual(res.difficulty, 'Advanced');
    });

    it('returns null for empty or non-actionable chatter', async () => {
      const res = await elearningMain.parseVoiceSuggestion('Um, wait a second, let me think.');
      assert.strictEqual(res, null);
    });
  });

  describe('Voice Assistant Streaming Task Lifecycle', () => {
    let mockServer;
    const mockPort = 19188;
    let sseConnections = [];

    before(async () => {
      // Create mock voice prompt server if not already running on port 19188
      mockServer = http.createServer((req, res) => {
        if (req.url === '/api/activate' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, active: true }));
        }
        if (req.url === '/api/deactivate' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, active: false }));
        }
        if (req.url === '/api/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });
          sseConnections.push(res);
          return;
        }
        res.writeHead(404);
        res.end();
      });

      await new Promise((resolve) => {
        mockServer.listen(mockPort, resolve);
      }).catch(() => {
        // Port might be in use by real voice-prompt daemon, which is also fine!
        mockServer = null;
      });
    });

    after(() => {
      if (mockServer) {
        try { mockServer.close(); } catch {}
      }
    });

    it('starts and stops voice assistant task cleanly', async () => {
      const startRes = elearningMain.startVoiceAssistant({ agentId: 'fast-reactive' });
      assert.strictEqual(startRes.ok, true);
      assert.strictEqual(startRes.active, true);
      assert.strictEqual(startRes.agentId, 'fast-reactive');

      let state = elearningMain.getVoiceAssistantState();
      assert.strictEqual(state.active, true);
      assert.strictEqual(state.taskActive, true);

      const stopRes = elearningMain.stopVoiceAssistant();
      assert.strictEqual(stopRes.ok, true);
      assert.strictEqual(stopRes.active, false);

      state = elearningMain.getVoiceAssistantState();
      assert.strictEqual(state.active, false);
      assert.strictEqual(state.taskActive, false);
    });
  });
});
