'use strict';
// Real FTP / SFTP client used by Data Sources and by apps that link to RobOS
// cloud storage (e.g. the Audio Player). A connection is a data-sources entry:
//   { driverType: 'ftp'|'sftp', host, port, user, password, privateKeyPath, database (start dir), ssl }

const fs = require('fs');
const path = require('path');
const posixPath = path.posix;

const CONNECT_TIMEOUT_MS = 15000;

function isRemoteDriver(driverType) {
  return driverType === 'ftp' || driverType === 'sftp';
}

function normalizeRemote(p) {
  const n = posixPath.normalize('/' + String(p || '/'));
  return n.length > 1 ? n.replace(/\/+$/, '') : n;
}

function sftpOptions(ds) {
  const opts = {
    host: ds.host,
    port: Number(ds.port) || 22,
    username: ds.user || undefined,
    readyTimeout: CONNECT_TIMEOUT_MS,
  };
  if (ds.privateKeyPath) {
    opts.privateKey = fs.readFileSync(ds.privateKeyPath);
    if (ds.password) opts.passphrase = ds.password;
  } else if (ds.password) {
    opts.password = ds.password;
  }
  return opts;
}

async function withSftp(ds, fn) {
  const Client = require('ssh2-sftp-client');
  const client = new Client();
  await client.connect(sftpOptions(ds));
  try { return await fn(client); } finally { await client.end().catch(() => {}); }
}

async function withFtp(ds, fn) {
  const ftp = require('basic-ftp');
  const client = new ftp.Client(CONNECT_TIMEOUT_MS);
  try {
    await client.access({
      host: ds.host,
      port: Number(ds.port) || 21,
      user: ds.user || 'anonymous',
      password: ds.password || 'anonymous@',
      secure: ds.ssl ? true : false,
      secureOptions: ds.ssl ? { rejectUnauthorized: false } : undefined,
    });
    return await fn(client);
  } finally {
    client.close();
  }
}

function withClient(ds, fn) {
  if (ds.driverType === 'sftp') return withSftp(ds, fn);
  if (ds.driverType === 'ftp') return withFtp(ds, fn);
  throw new Error(`Unsupported storage driver: ${ds.driverType}`);
}

// Returns directories first, then files, each sorted by name.
async function listDir(ds, remotePath) {
  const dir = normalizeRemote(remotePath || ds.database || '/');
  const entries = await withClient(ds, async (c) => {
    if (ds.driverType === 'sftp') {
      const list = await c.list(dir);
      return list.map(e => ({ name: e.name, type: e.type === 'd' ? 'dir' : 'file', size: e.size, modified: e.modifyTime ? new Date(e.modifyTime).toISOString() : null }));
    }
    const list = await c.list(dir);
    return list.map(e => ({ name: e.name, type: e.isDirectory ? 'dir' : 'file', size: e.size, modified: e.modifiedAt ? e.modifiedAt.toISOString() : null }));
  });
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
  return { path: dir, entries: entries.filter(e => e.name !== '.' && e.name !== '..').map(e => ({ ...e, path: posixPath.join(dir, e.name) })) };
}

// Recursively collects files under dir whose name matches `filter`.
async function walk(ds, remotePath, filter = () => true, limit = 5000) {
  const out = [];
  const queue = [normalizeRemote(remotePath)];
  while (queue.length && out.length < limit) {
    const dir = queue.shift();
    const { entries } = await listDir(ds, dir);
    for (const e of entries) {
      if (e.type === 'dir') queue.push(e.path);
      else if (filter(e.name)) out.push(e);
    }
  }
  return out;
}

async function download(ds, remoteFile, localFile) {
  fs.mkdirSync(path.dirname(localFile), { recursive: true });
  const tmp = localFile + '.part';
  try {
    await withClient(ds, (c) => ds.driverType === 'sftp' ? c.fastGet(remoteFile, tmp) : c.downloadTo(tmp, remoteFile));
    fs.renameSync(tmp, localFile);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
  return localFile;
}

async function testConnection(ds) {
  const start = Date.now();
  try {
    const info = await withClient(ds, async (c) => {
      const dir = normalizeRemote(ds.database || '/');
      await c.list(dir);
      return ds.driverType === 'sftp' ? 'SSH File Transfer Protocol (SFTP)' : (ds.ssl ? 'FTPS (explicit TLS)' : 'FTP');
    });
    return { ok: true, status: 'Connected', latencyMs: Date.now() - start, serverVersion: info, message: `Connected to ${ds.host}:${ds.port} as ${ds.user || 'anonymous'}; listed ${normalizeRemote(ds.database || '/')}.` };
  } catch (err) {
    return { ok: false, status: 'Failed', latencyMs: Date.now() - start, serverVersion: '-', message: `Could not connect to ${ds.host}:${ds.port}: ${err.message}` };
  }
}

module.exports = { isRemoteDriver, listDir, walk, download, testConnection, normalizeRemote };
