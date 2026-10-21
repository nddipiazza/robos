#!/usr/bin/env node

/**
 * AI Quest: Warrior Dragon v2 — Cucumber E2E Video & Report Server
 * Serves cucumber-report.html and offscreen MP4 recordings at http://localhost:8888/
 * Strictly anti-cached with HTTP Range streaming support.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8888;
const REPORTS_DIR = path.join(__dirname, '..', '..', 'tests', 'e2e', 'reports');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0]; // Strip timestamp query params
    if (reqUrl === '/') {
        reqUrl = '/index.html';
    }

    const safePath = path.normalize(reqUrl).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(REPORTS_DIR, safePath);

    if (!filePath.startsWith(REPORTS_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('403 Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(`
                <body style="background:#0b0e14;color:#fff;font-family:sans-serif;padding:40px;text-align:center;">
                    <h2 style="color:#f1c40f;">🐉 Report Not Found</h2>
                    <p>No report found at <code>${safePath}</code> in <code>${REPORTS_DIR}</code>.</p>
                    <p>Run <code>python3 tests/e2e/e2e_runner.py</code> to generate test reports.</p>
                </body>
            `);
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const fileSize = stats.size;
        const range = req.headers.range;

        const commonHeaders = {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        };

        // HTTP Range handling for MP4 video seeking
        if (range && ext === '.mp4') {
            const parts = range.replace(/bytes=/, "").split("-");
            let start = parseInt(parts[0], 10);
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (isNaN(start)) start = 0;
            if (isNaN(end) || end >= fileSize) end = fileSize - 1;

            if (start >= fileSize || start > end) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`,
                    ...commonHeaders
                });
                return res.end();
            }

            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                ...commonHeaders
            };

            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                ...commonHeaders
            };
            res.writeHead(200, head);
            fs.createReadStream(filePath).pipe(res);
        }
    });
});

server.listen(PORT, () => {
    console.log('==================================================');
    console.log('🐉 AI Quest: Warrior Dragon v2 — Cucumber Report Server');
    console.log('==================================================');
    console.log(`📍 Serving directory: ${REPORTS_DIR}`);
    console.log(`🌐 Live Report URL:  http://localhost:${PORT}/`);
    console.log('==================================================');
});
