'use strict';
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const HOME_DIR = process.env.HOME || os.homedir();
const MCP_DIR  = path.join(HOME_DIR, '.config', 'robos', 'mcp');
const REGISTRY_FILE = path.join(MCP_DIR, 'servers.json');

function registerServer(serverInfo) {
  try {
    fs.mkdirSync(MCP_DIR, { recursive: true });
    let servers = {};
    if (fs.existsSync(REGISTRY_FILE)) {
      try {
        servers = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
      } catch {}
    }
    servers[serverInfo.appId] = {
      ...serverInfo,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(servers, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function unregisterServer(appId) {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const servers = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
      delete servers[appId];
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(servers, null, 2), 'utf8');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function listRegisteredServers() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

module.exports = {
  registerServer,
  unregisterServer,
  listRegisteredServers,
  REGISTRY_FILE,
};
