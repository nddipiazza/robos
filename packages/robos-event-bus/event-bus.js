'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { getCategory } = require('./category-map');

/**
 * Generate a short unique event ID.
 */
function generateId() {
  return 'evt_' + crypto.randomBytes(12).toString('base64url');
}

/**
 * EventBus — Unix domain socket pub/sub with NDJSON protocol.
 *
 * Options:
 *   socketPath — path to Unix socket (default: /run/user/{uid}/robos-events.sock)
 *   logDir     — path for event log persistence (default: ~/.config/robos/event-log)
 *   retention  — days to retain event log files (default: 90)
 */
class EventBus {
  constructor(opts = {}) {
    const uid = process.getuid ? process.getuid() : os.userInfo().uid;
    this.socketPath = opts.socketPath || `/run/user/${uid}/robos-events.sock`;
    this.logDir = opts.logDir || path.join(os.homedir(), '.config', 'robos', 'event-log');
    this.retention = opts.retention || 90;

    this._server = null;
    this._subscribers = []; // { socket, filter }
    this._eventBuffer = []; // in-memory recent events for query
    this._maxBuffer = opts.maxBuffer || 10000;
  }

  /**
   * Create an event envelope from partial data.
   */
  createEnvelope(partial) {
    return {
      id: partial.id || generateId(),
      type: partial.type || 'unknown',
      ts: partial.ts || new Date().toISOString(),
      source: partial.source || 'unknown',
      category: partial.category || getCategory(partial.type || 'unknown'),
      payload: partial.payload || {},
    };
  }

  /**
   * Persist an event to the daily JSONL log file.
   */
  persistEvent(event) {
    fs.mkdirSync(this.logDir, { recursive: true });
    const date = event.ts.slice(0, 10); // YYYY-MM-DD
    const filePath = path.join(this.logDir, `${date}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
  }

  /**
   * Publish an event: persist, buffer, and fan out to subscribers.
   */
  publish(event) {
    const envelope = this.createEnvelope(event);
    this.persistEvent(envelope);

    // Buffer for queries
    this._eventBuffer.push(envelope);
    if (this._eventBuffer.length > this._maxBuffer) {
      this._eventBuffer.shift();
    }

    // Fan out to subscribers
    for (const sub of this._subscribers) {
      if (this._matchesFilter(envelope, sub.filter)) {
        try {
          sub.socket.write(JSON.stringify(envelope) + '\n');
        } catch (_) {
          // subscriber disconnected; will be cleaned up
        }
      }
    }

    return envelope;
  }

  /**
   * Subscribe a socket to events matching the given filter.
   */
  subscribe(socket, filter = {}) {
    this._subscribers.push({ socket, filter });

    socket.on('close', () => {
      this._subscribers = this._subscribers.filter(s => s.socket !== socket);
    });

    socket.on('error', () => {
      this._subscribers = this._subscribers.filter(s => s.socket !== socket);
    });
  }

  /**
   * Query historical events.
   */
  query({ since, until, category, type, limit = 100 } = {}) {
    let results = [];

    // Read from disk log files
    if (since) {
      const sinceDate = new Date(since);
      const untilDate = until ? new Date(until) : new Date();
      const files = this._getLogFiles(sinceDate, untilDate);

      for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (new Date(event.ts) >= sinceDate && new Date(event.ts) <= untilDate) {
              results.push(event);
            }
          } catch (_) { /* skip malformed */ }
        }
      }
    } else {
      // Use in-memory buffer
      results = [...this._eventBuffer];
    }

    // Apply filters
    if (category) {
      results = results.filter(e => e.category === category);
    }
    if (type) {
      results = results.filter(e => e.type === type);
    }

    // Sort by timestamp descending, apply limit
    results.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    return results.slice(0, limit);
  }

  /**
   * Get log file paths between two dates.
   */
  _getLogFiles(sinceDate, untilDate) {
    if (!fs.existsSync(this.logDir)) return [];

    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.jsonl') && f.length === 16) // YYYY-MM-DD.jsonl
      .sort();

    const sinceStr = sinceDate.toISOString().slice(0, 10);
    const untilStr = untilDate.toISOString().slice(0, 10);

    return files
      .filter(f => {
        const dateStr = f.replace('.jsonl', '');
        return dateStr >= sinceStr && dateStr <= untilStr;
      })
      .map(f => path.join(this.logDir, f));
  }

  /**
   * Check if an event matches a subscriber's filter.
   */
  _matchesFilter(event, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    if (filter.type && event.type !== filter.type) return false;
    if (filter.category && event.category !== filter.category) return false;
    return true;
  }

  /**
   * Start the event bus server on the Unix domain socket.
   */
  start() {
    return new Promise((resolve, reject) => {
      // Clean up stale socket
      if (fs.existsSync(this.socketPath)) {
        try { fs.unlinkSync(this.socketPath); } catch (_) { /* ignore */ }
      }

      // Ensure parent directory exists
      const socketDir = path.dirname(this.socketPath);
      fs.mkdirSync(socketDir, { recursive: true });

      this._server = net.createServer((socket) => {
        let buffer = '';

        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              this._handleMessage(socket, msg);
            } catch (err) {
              socket.write(JSON.stringify({ error: 'Invalid JSON', detail: err.message }) + '\n');
            }
          }
        });

        socket.on('error', () => { /* client disconnected */ });
      });

      this._server.on('error', reject);
      this._server.listen(this.socketPath, () => resolve());
    });
  }

  /**
   * Handle an incoming message from a client.
   */
  _handleMessage(socket, msg) {
    switch (msg.action) {
      case 'publish': {
        const envelope = this.publish(msg.event || {});
        socket.write(JSON.stringify({ ok: true, id: envelope.id }) + '\n');
        break;
      }
      case 'subscribe': {
        this.subscribe(socket, msg.filter || {});
        socket.write(JSON.stringify({ ok: true, subscribed: true }) + '\n');
        break;
      }
      case 'query': {
        const results = this.query({
          since: msg.since,
          until: msg.until,
          category: msg.category,
          type: msg.type,
          limit: msg.limit,
        });
        socket.write(JSON.stringify({ ok: true, events: results }) + '\n');
        break;
      }
      default:
        socket.write(JSON.stringify({ error: `Unknown action: ${msg.action}` }) + '\n');
    }
  }

  /**
   * Clean up event log files older than retention period.
   */
  cleanup() {
    if (!fs.existsSync(this.logDir)) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retention);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.jsonl'));
    let removed = 0;

    for (const f of files) {
      const dateStr = f.replace('.jsonl', '');
      if (dateStr < cutoffStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        fs.unlinkSync(path.join(this.logDir, f));
        removed++;
      }
    }

    return removed;
  }

  /**
   * Stop the event bus server.
   */
  stop() {
    return new Promise((resolve) => {
      if (this._server) {
        // Close all subscriber sockets
        for (const sub of this._subscribers) {
          try { sub.socket.destroy(); } catch (_) { /* ignore */ }
        }
        this._subscribers = [];

        this._server.close(() => {
          // Clean up socket file
          try { fs.unlinkSync(this.socketPath); } catch (_) { /* ignore */ }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = { EventBus, generateId };
