'use strict';

const EventEmitter = require('events');

const WAKE_PATTERNS = [
  /^(?:hello|hey|hi|ok|okay)\s+(?:robos|rob\s+os|rob-os|row\s+bose|row-bose|rowbose|roh\s+bose)(?:[,.!?]|\s+|$)/i,
  /^(?:robos|rob\s+os|rob-os|row\s+bose|row-bose|rowbose|roh\s+bose)(?:[,.!?]|\s+|$)/i,
];

class WakeWordDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enabled = options.enabled !== false;
    this.wakePatterns = options.patterns || WAKE_PATTERNS;
    this.activeListening = false;
    this.listeningTimeout = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  isEnabled() {
    return this.enabled;
  }

  /**
   * Process a text stream chunk
   * @param {string} text
   * @param {object} meta
   * @returns {{ matched: boolean, trigger: string|null, query: string|null }}
   */
  processText(text, meta = {}) {
    if (!this.enabled || !text) {
      return { matched: false, trigger: null, query: null };
    }

    const trimmed = text.trim();
    for (const pattern of this.wakePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const trigger = match[0].trim().replace(/[,.!?]+$/, '');
        const query = trimmed.slice(match[0].length).trim();

        const eventData = {
          trigger,
          query,
          fullText: trimmed,
          timestamp: new Date().toISOString(),
          ...meta,
        };

        this.emit('wake-word', eventData);
        return { matched: true, trigger, query };
      }
    }

    return { matched: false, trigger: null, query: null };
  }
}

module.exports = {
  WakeWordDetector,
  WAKE_PATTERNS,
};
