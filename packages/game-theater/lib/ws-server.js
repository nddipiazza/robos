'use strict';

/**
 * Zero-dependency RFC 6455 WebSocket server & client helper for RobOS Game Theater.
 * Works identically on both node:http (:19228 / cloudflared wss://) and node:https (:19229 wss://).
 */

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsFrame(opcode, payloadBuf) {
  const payload = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(String(payloadBuf || ''), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class WsConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.open = true;
    this._buf = Buffer.alloc(0);
    this._fragOpcode = 0;
    this._fragChunks = [];

    socket.setNoDelay?.(true);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._handleClose());
    socket.on('end', () => this._handleClose());
    socket.on('error', (err) => {
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
      }
      this._handleClose();
    });
  }

  sendText(text) {
    if (!this.open || this.socket.destroyed) return false;
    try {
      this.socket.write(encodeWsFrame(0x01, Buffer.from(String(text), 'utf8')));
      return true;
    } catch {
      return false;
    }
  }

  sendJson(obj) {
    return this.sendText(JSON.stringify(obj));
  }

  ping() {
    if (!this.open || this.socket.destroyed) return;
    try {
      this.socket.write(encodeWsFrame(0x09, Buffer.alloc(0)));
    } catch {}
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    this.open = false;
    try {
      const reasonBuf = Buffer.from(String(reason).slice(0, 120), 'utf8');
      const payload = Buffer.alloc(2 + reasonBuf.length);
      payload.writeUInt16BE(code, 0);
      reasonBuf.copy(payload, 2);
      this.socket.end(encodeWsFrame(0x08, payload));
    } catch {
      try { this.socket.destroy(); } catch {}
    }
  }

  _handleClose() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }

  _onData(chunk) {
    this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;

    while (this._buf.length >= 2) {
      const b0 = this._buf[0];
      const b1 = this._buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this._buf.length < 4) return;
        payloadLen = this._buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this._buf.length < 10) return;
        const bigLen = this._buf.readBigUInt64BE(2);
        if (bigLen > BigInt(16 * 1024 * 1024)) {
          this.close(1009, 'Frame too large');
          return;
        }
        payloadLen = Number(bigLen);
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (this._buf.length < offset + maskLen + payloadLen) return;

      let payload = Buffer.from(this._buf.subarray(offset + maskLen, offset + maskLen + payloadLen));
      if (masked) {
        const mask = this._buf.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i & 3];
        }
      }

      this._buf = this._buf.subarray(offset + maskLen + payloadLen);

      if (opcode === 0x08) {
        // Close frame
        this.close(1000, '');
        this._handleClose();
        return;
      }
      if (opcode === 0x09) {
        // Ping -> Pong
        try {
          this.socket.write(encodeWsFrame(0x0a, payload));
        } catch {}
        continue;
      }
      if (opcode === 0x0a) {
        // Pong
        continue;
      }

      if (opcode === 0x00) {
        // Continuation
        this._fragChunks.push(payload);
        if (fin) {
          const full = Buffer.concat(this._fragChunks);
          const finalOpcode = this._fragOpcode;
          this._fragChunks = [];
          this._fragOpcode = 0;
          this._emitMessage(finalOpcode, full);
        }
      } else if (!fin) {
        this._fragOpcode = opcode;
        this._fragChunks = [payload];
      } else {
        this._emitMessage(opcode, payload);
      }
    }
  }

  _emitMessage(opcode, buf) {
    if (opcode === 0x01 || opcode === 0x02) {
      const text = buf.toString('utf8');
      this.emit('message', text, buf);
    }
  }
}

function attachWebSocketServer(server, { pathPrefix = '/ws', verifyUpgrade, onConnection } = {}) {
  server.on('upgrade', async (req, socket, head) => {
    try {
      const parsed = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      if (pathPrefix && parsed.pathname !== pathPrefix) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      const key = String(req.headers['sec-websocket-key'] || '').trim();
      if (!key) {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      let context = {};
      if (typeof verifyUpgrade === 'function') {
        const res = await verifyUpgrade(req, parsed);
        if (!res || res.ok === false) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        context = res;
      }

      const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
      const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n',
      ];
      socket.write(headers.join('\r\n'));

      const conn = new WsConnection(socket, req);
      if (head && head.length) {
        conn._onData(head);
      }
      if (typeof onConnection === 'function') {
        onConnection(conn, context, parsed);
      }
    } catch {
      try {
        socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n');
        socket.destroy();
      } catch {}
    }
  });
}

/**
 * Lightweight RFC 6455 WebSocket client for Node tests & CLI automation (supports ws:// and wss://).
 */
function connectWebSocketClient(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isSecure = parsed.protocol === 'wss:';
    const netMod = isSecure ? require('node:tls') : require('node:net');
    const port = Number(parsed.port || (isSecure ? 443 : 80));
    const host = parsed.hostname;
    const key = crypto.randomBytes(16).toString('base64');

    const socket = netMod.connect(
      {
        host,
        port,
        ...(isSecure
          ? {
              rejectUnauthorized: options.rejectUnauthorized ?? false,
              ...(!/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':') ? { servername: host } : {}),
            }
          : {}),
      },
      () => {
        const reqLines = [
          `GET ${parsed.pathname}${parsed.search} HTTP/1.1`,
          `Host: ${parsed.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          ...(options.cookie ? [`Cookie: ${options.cookie}`] : []),
          '\r\n',
        ];
        socket.write(reqLines.join('\r\n'));
      },
    );

    let upgraded = false;
    let headerBuf = Buffer.alloc(0);

    const onHandshakeData = (chunk) => {
      headerBuf = Buffer.concat([headerBuf, chunk]);
      const idx = headerBuf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      socket.removeListener('data', onHandshakeData);
      const headerText = headerBuf.subarray(0, idx).toString('utf8');
      const rest = headerBuf.subarray(idx + 4);
      if (!headerText.startsWith('HTTP/1.1 101')) {
        socket.destroy();
        reject(new Error(`WebSocket upgrade rejected: ${headerText.split('\r\n')[0]}`));
        return;
      }
      upgraded = true;
      const emitter = new EventEmitter();
      let recvBuf = rest;

      const sendRawFrame = (opcode, dataBuf) => {
        const payload = Buffer.isBuffer(dataBuf) ? dataBuf : Buffer.from(String(dataBuf), 'utf8');
        const mask = crypto.randomBytes(4);
        const masked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
        let hdr;
        if (payload.length < 126) {
          hdr = Buffer.alloc(6);
          hdr[0] = 0x80 | opcode;
          hdr[1] = 0x80 | payload.length;
          mask.copy(hdr, 2);
        } else if (payload.length < 65536) {
          hdr = Buffer.alloc(8);
          hdr[0] = 0x80 | opcode;
          hdr[1] = 0x80 | 126;
          hdr.writeUInt16BE(payload.length, 2);
          mask.copy(hdr, 4);
        } else {
          hdr = Buffer.alloc(14);
          hdr[0] = 0x80 | opcode;
          hdr[1] = 0x80 | 127;
          hdr.writeBigUInt64BE(BigInt(payload.length), 2);
          mask.copy(hdr, 10);
        }
        socket.write(Buffer.concat([hdr, masked]));
      };

      const parseFrames = () => {
        while (recvBuf.length >= 2) {
          const b0 = recvBuf[0];
          const b1 = recvBuf[1];
          const opcode = b0 & 0x0f;
          const isMasked = (b1 & 0x80) !== 0;
          let len = b1 & 0x7f;
          let off = 2;
          if (len === 126) {
            if (recvBuf.length < 4) return;
            len = recvBuf.readUInt16BE(2);
            off = 4;
          } else if (len === 127) {
            if (recvBuf.length < 10) return;
            len = Number(recvBuf.readBigUInt64BE(2));
            off = 10;
          }
          const mLen = isMasked ? 4 : 0;
          if (recvBuf.length < off + mLen + len) return;
          const body = Buffer.from(recvBuf.subarray(off + mLen, off + mLen + len));
          if (isMasked) {
            const m = recvBuf.subarray(off, off + 4);
            for (let i = 0; i < body.length; i++) body[i] ^= m[i & 3];
          }
          recvBuf = recvBuf.subarray(off + mLen + len);
          if (opcode === 0x08) {
            socket.end();
            emitter.emit('close');
            return;
          }
          if (opcode === 0x09) {
            sendRawFrame(0x0a, body);
            continue;
          }
          if (opcode === 0x01 || opcode === 0x02) {
            const text = body.toString('utf8');
            emitter.emit('message', text);
          }
        }
      };

      socket.on('data', (c) => {
        recvBuf = Buffer.concat([recvBuf, c]);
        parseFrames();
      });
      socket.on('close', () => emitter.emit('close'));
      socket.on('error', (e) => emitter.emit('error', e));

      emitter.sendJson = (obj) => sendRawFrame(0x01, Buffer.from(JSON.stringify(obj), 'utf8'));
      emitter.sendText = (txt) => sendRawFrame(0x01, Buffer.from(String(txt), 'utf8'));
      emitter.close = () => {
        try {
          sendRawFrame(0x08, Buffer.alloc(0));
          socket.end();
        } catch {}
      };

      if (recvBuf.length) {
        setImmediate(parseFrames);
      }
      resolve(emitter);
    };

    socket.on('data', onHandshakeData);
    socket.on('error', (err) => {
      if (!upgraded) reject(err);
    });
  });
}

module.exports = {
  encodeWsFrame,
  WsConnection,
  attachWebSocketServer,
  connectWebSocketClient,
};
