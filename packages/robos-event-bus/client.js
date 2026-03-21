'use strict';

const net = require('net');
const os = require('os');

/**
 * EventBusClient — connects to the EventBus Unix domain socket
 * and provides publish/subscribe/query methods.
 */
class EventBusClient {
  constructor(opts = {}) {
    const uid = process.getuid ? process.getuid() : os.userInfo().uid;
    this.socketPath = opts.socketPath || `/run/user/${uid}/robos-events.sock`;
    this._socket = null;
    this._responseHandlers = [];
    this._subscriptionHandler = null;
    this._buffer = '';
    this._connected = false;
  }

  /**
   * Connect to the event bus.
   */
  connect() {
    return new Promise((resolve, reject) => {
      this._socket = net.createConnection(this.socketPath, () => {
        this._connected = true;
        resolve();
      });

      this._socket.on('data', (data) => {
        this._buffer += data.toString();
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            // If there's a pending response handler, use it
            if (this._responseHandlers.length > 0) {
              const handler = this._responseHandlers.shift();
              handler(msg);
            } else if (this._subscriptionHandler) {
              // It's a subscription event
              this._subscriptionHandler(msg);
            }
          } catch (_) { /* skip malformed */ }
        }
      });

      this._socket.on('error', (err) => {
        if (!this._connected) reject(err);
      });
    });
  }

  /**
   * Send a message and wait for a response.
   */
  _request(msg) {
    return new Promise((resolve, reject) => {
      if (!this._connected) {
        reject(new Error('Not connected to event bus'));
        return;
      }
      this._responseHandlers.push(resolve);
      this._socket.write(JSON.stringify(msg) + '\n');

      // Timeout after 5 seconds
      setTimeout(() => {
        const idx = this._responseHandlers.indexOf(resolve);
        if (idx !== -1) {
          this._responseHandlers.splice(idx, 1);
          reject(new Error('Request timed out'));
        }
      }, 5000);
    });
  }

  /**
   * Publish an event to the bus.
   */
  async publish(event) {
    return this._request({ action: 'publish', event });
  }

  /**
   * Subscribe to events matching filter.
   * The handler is called for each matching event.
   */
  async subscribe(filter, handler) {
    this._subscriptionHandler = handler;
    return this._request({ action: 'subscribe', filter });
  }

  /**
   * Query historical events.
   */
  async query(params = {}) {
    return this._request({
      action: 'query',
      since: params.since,
      until: params.until,
      category: params.category,
      type: params.type,
      limit: params.limit,
    });
  }

  /**
   * Disconnect from the event bus.
   */
  disconnect() {
    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
      this._connected = false;
    }
  }
}

module.exports = { EventBusClient };
