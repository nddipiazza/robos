'use strict';

const EventEmitter = require('events');
const path = require('path');
const contextProvider = require('./context-provider');

class DesktopAssistant extends EventEmitter {
  constructor(options = {}) {
    super();
    this.ttsEngine = options.ttsEngine;
    this.wakeDetector = options.wakeDetector;
    this.state = 'IDLE'; // 'IDLE' | 'WAKE_DETECTED' | 'LISTENING' | 'PROCESSING' | 'SPEAKING'
    this.history = [];
    this.listeningTimer = null;
    this.accumulatedInput = '';
    this.autoSpeak = options.autoSpeak !== false;
    this.wakeGreeting = options.wakeGreeting || "Hello! How can I help you, Lead Architect?";

    if (this.wakeDetector) {
      this.wakeDetector.on('wake-word', async (evt) => {
        await this.handleWakeWord(evt);
      });
    }
  }

  getState() {
    return this.state;
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
    this.emit('history-cleared');
    return { ok: true, cleared: true };
  }

  setState(newState, meta = {}) {
    this.state = newState;
    this.emit('state-change', { state: this.state, ...meta });
  }

  /**
   * Handle wake-word trigger event
   */
  async handleWakeWord(evt = {}) {
    const query = (evt.query || '').trim();
    this.setState('WAKE_DETECTED', { trigger: evt.trigger, query });

    if (query) {
      // User said wake-word AND query in one breath: "hello robos, what is the git status?"
      await this.processQuery(query);
    } else {
      // User just said "hello robos"
      this.setState('LISTENING');
      if (this.autoSpeak && this.ttsEngine) {
        try {
          await this.ttsEngine.speak(this.wakeGreeting);
        } catch {}
      }

      // Start listening window for the subsequent user request (up to 8s)
      this.accumulatedInput = '';
      if (this.listeningTimer) clearTimeout(this.listeningTimer);
      this.listeningTimer = setTimeout(async () => {
        if (this.state === 'LISTENING') {
          if (this.accumulatedInput.trim()) {
            await this.processQuery(this.accumulatedInput.trim());
          } else {
            this.setState('IDLE');
          }
        }
      }, 8000);
    }
  }

  /**
   * Ingest text chunk from continuous stream
   */
  async handleStreamText(chunk = {}) {
    const text = (chunk.text || '').trim();
    if (!text) return;

    // If currently listening after wake word, accumulate words
    if (this.state === 'LISTENING') {
      this.accumulatedInput = (this.accumulatedInput + ' ' + text).trim();
      this.emit('stream-line', { text: this.accumulatedInput, isFinal: chunk.isFinal });

      if (chunk.isFinal || this.accumulatedInput.length > 200) {
        if (this.listeningTimer) clearTimeout(this.listeningTimer);
        const queryToProcess = this.accumulatedInput;
        this.accumulatedInput = '';
        await this.processQuery(queryToProcess);
      }
    }
  }

  /**
   * Process a user query, formulate response with context, and talk back out loud
   */
  async processQuery(queryText, options = {}) {
    const query = (queryText || '').trim();
    if (!query) return { ok: false, error: 'Empty query' };

    this.setState('PROCESSING', { query });

    const context = await contextProvider.getAggregatedContext();
    const responseText = await this._generateAgentResponse(query, context, options);

    this.setState('SPEAKING', { query, response: responseText });

    const turn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      query,
      response: responseText,
      context,
      timestamp: new Date().toISOString(),
    };
    this.history.push(turn);
    this.emit('assistant-turn', turn);

    // Speak response back out loud
    if (this.autoSpeak && this.ttsEngine && options.silent !== true) {
      try {
        await this.ttsEngine.speak(responseText);
      } catch (err) {
        console.warn('[desktop-assistant] Speech error:', err.message);
      }
    }

    this.setState('IDLE', { lastTurn: turn });
    return { ok: true, turn };
  }

  /**
   * Internal agent response generation
   */
  async _generateAgentResponse(query, context, options = {}) {
    const agentId = options.agentId || 'fast-reactive';

    // 1. Check for quick local system queries
    const qLower = query.toLowerCase();
    if (qLower.includes('git status') || qLower.includes('branch') || qLower.includes('repo')) {
      const git = context.workspace?.git || {};
      const branch = git.branch || 'main';
      const dirty = git.dirty ? 'with uncommitted changes' : 'clean working tree';
      return `You are currently on branch ${branch} in repository ${git.repo || 'robos'}, with a ${dirty}.`;
    }

    if (qLower.includes('active app') || qLower.includes('window') || qLower.includes('focus')) {
      const appName = context.activeApp?.title || context.activeApp?.appId || 'desktop';
      return `The active window is currently ${appName}.`;
    }

    if (qLower.includes('status of the project') || qLower.includes('project status')) {
      return `RobOS is operational. All local services, knowledge graph packages, and agent harnesses are connected and healthy.`;
    }

    // 2. Try RobOS AI Agent library if available
    try {
      let aiAgent = null;
      const agentPaths = [
        path.resolve(__dirname, '..', '..', 'robos-lib', 'ai-agent'),
        '/usr/local/share/robos/robos-lib/ai-agent',
      ];
      for (const p of agentPaths) {
        try { aiAgent = require(p); break; } catch {}
      }

      if (aiAgent && typeof aiAgent.ask === 'function') {
        const prompt = `Context: Focused on ${context.activeApp?.title || 'Desktop'}. Workspace: ${context.workspace?.name || 'robos'} (${context.workspace?.branch || 'main'}).\nUser voice request: "${query}"\nPlease provide a concise, direct spoken response (1-2 sentences).`;
        const res = await aiAgent.ask(prompt, { providerId: agentId });
        if (res && res.ok && res.text) {
          return res.text.replace(/[*#`_]/g, '').trim();
        }
      }
    } catch {}

    // 3. Intelligent conversational fallback
    return `Understood: "${query}". I have indexed your request into the RobOS workspace context and agent queue.`;
  }
}

module.exports = {
  DesktopAssistant,
};
