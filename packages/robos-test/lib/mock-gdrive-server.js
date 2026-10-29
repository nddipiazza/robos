'use strict';

/**
 * In-memory Google Drive v3 server for Config Sync tests.
 *
 * Implements the subset RobOS uses (files.list with a `q` filter, files.get, alt=media,
 * folder create, multipart upload, media update, delete, permissions.create/list) and
 * enforces access per signed-in user, so a share is invisible to a recipient until the
 * owner grants it, like the real Drive.
 *
 * Real-Drive behaviour it reproduces (checked against www.googleapis.com):
 *   - errors carry `error.errors[0].reason` (notFound, insufficientFilePermissions,
 *     rateLimitExceeded); no access to a file is a 404, not a 403.
 *   - `inheritDelayMs`: access a share grants reaches files inside the folder after the
 *     folder itself, so a recipient's listing can briefly miss them.
 *   - `failNext(n, { status, reason, retryAfter })`: the next n API calls fail, e.g. with
 *     the 403 rateLimitExceeded (domain usageLimits, status PERMISSION_DENIED) Drive
 *     returns when the OAuth client's quota is used up. `retryAfter` sets Retry-After.
 *   - GET /drive/v3/about returns the signed-in user and a storage quota.
 *
 *   const drive = await startMockDrive({ users: { 'tok-alex': 'alex@example.com' } });
 *   process.env.ROBOS_GDRIVE_API_BASE = drive.url;
 *   ...
 *   drive.filesOwnedBy('alex@example.com'); drive.notifications; await drive.close();
 */

const http = require('node:http');
const crypto = require('node:crypto');

const FOLDER = 'application/vnd.google-apps.folder';

function startMockDrive({ users = {}, port = 0, inheritDelayMs = 0 } = {}) {
  const files = new Map();
  const injected = [];
  const notifications = [];
  const tokenToEmail = { ...users };

  const rootId = email => `root-${email.replace(/[^a-z0-9]/gi, '_')}`;
  function ensureRoot(email) {
    const id = rootId(email);
    if (!files.has(id)) files.set(id, { id, name: 'My Drive', mimeType: FOLDER, parents: [], owner: email, perms: [], content: null, modifiedTime: new Date().toISOString() });
    return id;
  }
  for (const email of Object.values(tokenToEmail)) ensureRoot(email);

  function access(file, email, depth = 0) {
    if (!file || depth > 50) return null;
    if (file.owner === email) return 'owner';
    const p = file.perms.find(x => x.emailAddress === email && (depth === 0 || Date.now() - x.grantedAt >= inheritDelayMs));
    if (p) return p.role;
    for (const parent of file.parents) {
      const a = access(files.get(parent), email, depth + 1);
      if (a) return a;
    }
    return null;
  }
  const canRead = (f, e) => Boolean(access(f, e));
  const canWrite = (f, e) => ['owner', 'writer', 'organizer'].includes(access(f, e));

  function meta(f) {
    return {
      kind: 'drive#file', id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents,
      size: f.content ? String(f.content.length) : undefined, modifiedTime: f.modifiedTime,
      owners: [{ emailAddress: f.owner, displayName: f.owner.split('@')[0] }],
    };
  }

  function parseQ(q, email) {
    const clauses = q.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
    const unq = s => s.replace(/^'|'$/g, '').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    return f => clauses.every(c => {
      let m;
      if ((m = c.match(/^('(?:[^'\\]|\\.)*')\s+in\s+parents$/))) {
        const id = unq(m[1]);
        return f.parents.includes(id === 'root' ? rootId(email) : id);
      }
      if ((m = c.match(/^name\s*=\s*('(?:[^'\\]|\\.)*')$/))) return f.name === unq(m[1]);
      if ((m = c.match(/^mimeType\s*=\s*('(?:[^'\\]|\\.)*')$/))) return f.mimeType === unq(m[1]);
      if (/^trashed\s*=\s*false$/.test(c)) return !f.trashed;
      throw new Error(`mock drive: unsupported q clause "${c}"`);
    });
  }

  function readBody(req) {
    return new Promise(resolve => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });
  }

  function parseMultipart(buf, contentType) {
    const boundary = contentType.match(/boundary=([^;]+)/)[1];
    const parts = buf.toString('latin1').split(`--${boundary}`).slice(1, -1);
    const [metaPart, dataPart] = parts.map(p => {
      const idx = p.indexOf('\r\n\r\n');
      return Buffer.from(p.slice(idx + 4, p.endsWith('\r\n') ? -2 : undefined), 'latin1');
    });
    return { meta: JSON.parse(metaPart.toString('utf8')), data: dataPart };
  }

  function send(res, status, body, headers = {}) {
    if (Buffer.isBuffer(body)) { res.writeHead(status, { 'Content-Type': 'application/octet-stream', ...headers }); return res.end(body); }
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }
  const REASON = { 401: 'authError', 403: 'insufficientFilePermissions', 404: 'notFound', 500: 'backendError' };
  const STATUS = { 401: 'UNAUTHENTICATED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND', 429: 'RESOURCE_EXHAUSTED' };
  const QUOTA_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded']);
  const fail = (res, status, message, reason = REASON[status] || 'error', headers = {}) => send(res, status, {
    error: { code: status, message, errors: [{ message, domain: QUOTA_REASONS.has(reason) ? 'usageLimits' : 'global', reason }], ...(STATUS[status] ? { status: STATUS[status] } : {}) },
  }, headers);

  function create(email, { name, mimeType, parents = [] }, content) {
    const parentIds = (parents.length ? parents : ['root']).map(p => p === 'root' ? ensureRoot(email) : p);
    for (const p of parentIds) if (!canWrite(files.get(p), email)) return { error: [404, `File not found: ${p}.`] };
    const id = crypto.randomBytes(12).toString('base64url');
    const f = { id, name, mimeType: mimeType || 'application/octet-stream', parents: parentIds, owner: email, perms: [], content: content || null, modifiedTime: new Date().toISOString() };
    files.set(id, f);
    return { file: f };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/__state') return send(res, 200, [...files.values()].map(f => ({ ...meta(f), perms: f.perms })));
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const email = tokenToEmail[token];
      if (!email) return fail(res, 401, 'Request had invalid authentication credentials.');
      ensureRoot(email);
      const p = url.pathname;
      let m;
      if (injected.length) {
        const e = injected.shift();
        return fail(res, e.status, e.message || "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute' of service 'drive.googleapis.com'.", e.reason, e.retryAfter != null ? { 'Retry-After': String(e.retryAfter) } : {});
      }

      if (req.method === 'GET' && p === '/drive/v3/about') {
        const used = [...files.values()].filter(f => f.owner === email && f.content).reduce((n, f) => n + f.content.length, 0);
        return send(res, 200, { user: { kind: 'drive#user', displayName: email.split('@')[0], emailAddress: email, me: true }, storageQuota: { limit: String(15 * 1024 ** 3), usage: String(used) } });
      }

      if (req.method === 'GET' && p === '/drive/v3/files') {
        const filter = parseQ(url.searchParams.get('q') || '', email);
        const list = [...files.values()].filter(f => !f.id.startsWith('root-') && canRead(f, email) && filter(f)).map(meta);
        return send(res, 200, { files: list });
      }
      if (req.method === 'POST' && p === '/drive/v3/files') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const out = create(email, body);
        return out.error ? fail(res, ...out.error) : send(res, 200, meta(out.file));
      }
      if (req.method === 'POST' && p === '/upload/drive/v3/files') {
        const { meta: md, data } = parseMultipart(await readBody(req), req.headers['content-type']);
        const out = create(email, md, data);
        return out.error ? fail(res, ...out.error) : send(res, 200, meta(out.file));
      }
      if ((m = p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)) && req.method === 'PATCH') {
        const f = files.get(m[1]);
        if (!canRead(f, email)) return fail(res, 404, `File not found: ${m[1]}.`);
        if (!canWrite(f, email)) return fail(res, 403, 'The user does not have sufficient permissions for this file.');
        f.content = await readBody(req);
        f.modifiedTime = new Date().toISOString();
        return send(res, 200, meta(f));
      }
      if ((m = p.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/))) {
        const f = files.get(m[1]);
        if (!canRead(f, email)) return fail(res, 404, `File not found: ${m[1]}.`);
        const out = ({ grantedAt, ...rest }) => rest;
        if (req.method === 'GET') return send(res, 200, { permissions: [{ id: 'owner', emailAddress: f.owner, role: 'owner', type: 'user' }, ...f.perms.map(out)] });
        if (!canWrite(f, email)) return fail(res, 403, 'The user does not have sufficient permissions for this file.');
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        const perm = { id: crypto.randomBytes(6).toString('hex'), type: body.type, role: body.role, emailAddress: String(body.emailAddress).toLowerCase(), grantedAt: Date.now() };
        f.perms = f.perms.filter(x => x.emailAddress !== perm.emailAddress).concat(perm);
        if (url.searchParams.get('sendNotificationEmail') !== 'false') notifications.push({ to: perm.emailAddress, from: email, fileId: f.id, fileName: f.name, message: url.searchParams.get('emailMessage') || '' });
        return send(res, 200, out(perm));
      }
      if ((m = p.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
        const id = m[1] === 'root' ? rootId(email) : m[1];
        const f = files.get(id);
        if (!canRead(f, email)) return fail(res, 404, `File not found: ${m[1]}.`);
        if (req.method === 'GET') return url.searchParams.get('alt') === 'media' ? send(res, 200, f.content || Buffer.alloc(0)) : send(res, 200, { ...meta(f), capabilities: { canEdit: canWrite(f, email), canShare: canWrite(f, email) } });
        if (req.method === 'DELETE') {
          if (!canWrite(f, email)) return fail(res, 403, 'The user does not have sufficient permissions for this file.');
          const drop = id => { for (const c of [...files.values()].filter(x => x.parents.includes(id))) drop(c.id); files.delete(id); };
          drop(id);
          res.writeHead(204); return res.end();
        }
      }
      return fail(res, 404, `mock drive: no route for ${req.method} ${p}`);
    } catch (err) {
      return fail(res, 500, err.message);
    }
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({
        url, files, notifications,
        failNext(count = 1, { status = 403, reason = 'rateLimitExceeded', message, retryAfter } = {}) { for (let i = 0; i < count; i++) injected.push({ status, reason, message, retryAfter }); },
        pendingFailures: () => injected.length,
        addUser(token, email) { tokenToEmail[token] = email; ensureRoot(email); },
        rootId,
        filesOwnedBy: email => [...files.values()].filter(f => f.owner === email && !f.id.startsWith('root-')),
        childrenOf: id => [...files.values()].filter(f => f.parents.includes(id)),
        allContent: () => [...files.values()].filter(f => f.content).map(f => f.content),
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}

module.exports = { startMockDrive };
