'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = {
  type: 'webhook',
  label: 'Webhook',
  description: 'POST JSON payload to an external URL',
  params: {
    url: { type: 'string', required: true, templatable: true },
    headers: { type: 'object', required: false },
    body: { type: 'object', required: false, templatable: true },
  },

  async execute(params, _context) {
    return new Promise((resolve) => {
      try {
        const url = new URL(params.url);
        const transport = url.protocol === 'https:' ? https : http;
        const bodyStr = JSON.stringify(params.body || {});

        const opts = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
            ...(params.headers || {}),
          },
          timeout: 30000,
        };

        const req = transport.request(opts, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              output: { statusCode: res.statusCode, body: data },
            });
          });
        });

        req.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Request timed out' });
        });

        req.write(bodyStr);
        req.end();
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  },
};
